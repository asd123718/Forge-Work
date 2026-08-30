import { newWriteableStream, listenStream } from "../../../../base/common/stream.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { importAMDNodeModule } from "../../../../amdX.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { coalesce } from "../../../../base/common/arrays.js";
const UTF8 = "utf8";
const UTF8_with_bom = "utf8bom";
const UTF16be = "utf16be";
const UTF16le = "utf16le";
function isUTFEncoding(encoding) {
  return [UTF8, UTF8_with_bom, UTF16be, UTF16le].some((utfEncoding) => utfEncoding === encoding);
}
const UTF16be_BOM = [254, 255];
const UTF16le_BOM = [255, 254];
const UTF8_BOM = [239, 187, 191];
const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512;
const NO_ENCODING_GUESS_MIN_BYTES = 512;
const AUTO_ENCODING_GUESS_MIN_BYTES = 512 * 8;
const AUTO_ENCODING_GUESS_MAX_BYTES = 512 * 128;
var DecodeStreamErrorKind = /* @__PURE__ */ ((DecodeStreamErrorKind2) => {
  DecodeStreamErrorKind2[DecodeStreamErrorKind2["STREAM_IS_BINARY"] = 1] = "STREAM_IS_BINARY";
  return DecodeStreamErrorKind2;
})(DecodeStreamErrorKind || {});
class DecodeStreamError extends Error {
  constructor(message, decodeStreamErrorKind) {
    super(message);
    this.decodeStreamErrorKind = decodeStreamErrorKind;
  }
}
class DecoderStream {
  constructor(iconvLiteDecoder) {
    this.iconvLiteDecoder = iconvLiteDecoder;
  }
  /**
   * This stream will only load iconv-lite lazily if the encoding
   * is not UTF-8. This ensures that for most common cases we do
   * not pay the price of loading the module from disk.
   *
   * We still need to be careful when converting UTF-8 to a string
   * though because we read the file in chunks of Buffer and thus
   * need to decode it via TextDecoder helper that is available
   * in browser and node.js environments.
   */
  static async create(encoding) {
    let decoder = void 0;
    if (encoding !== UTF8) {
      const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
      decoder = iconv.getDecoder(toNodeEncoding(encoding));
    } else {
      const utf8TextDecoder = new TextDecoder();
      decoder = {
        write(buffer) {
          return utf8TextDecoder.decode(buffer, {
            // Signal to TextDecoder that potentially more data is coming
            // and that we are calling `decode` in the end to consume any
            // remainders
            stream: true
          });
        },
        end() {
          return utf8TextDecoder.decode();
        }
      };
    }
    return new DecoderStream(decoder);
  }
  write(buffer) {
    return this.iconvLiteDecoder.write(buffer);
  }
  end() {
    return this.iconvLiteDecoder.end();
  }
}
function toDecodeStream(source, options) {
  const minBytesRequiredForDetection = options.minBytesRequiredForDetection ?? (options.guessEncoding ? AUTO_ENCODING_GUESS_MIN_BYTES : NO_ENCODING_GUESS_MIN_BYTES);
  return new Promise((resolve, reject) => {
    const target = newWriteableStream((strings) => strings.join(""));
    const bufferedChunks = [];
    let bytesBuffered = 0;
    let decoder = void 0;
    const cts = new CancellationTokenSource();
    const createDecoder = async () => {
      try {
        const detected = await detectEncodingFromBuffer({
          buffer: VSBuffer.concat(bufferedChunks),
          bytesRead: bytesBuffered
        }, options.guessEncoding, options.candidateGuessEncodings);
        if (detected.seemsBinary && options.acceptTextOnly) {
          throw new DecodeStreamError("Stream is binary but only text is accepted for decoding", 1 /* STREAM_IS_BINARY */);
        }
        detected.encoding = await options.overwriteEncoding(detected.encoding);
        decoder = await DecoderStream.create(detected.encoding);
        const decoded = decoder.write(VSBuffer.concat(bufferedChunks).buffer);
        target.write(decoded);
        bufferedChunks.length = 0;
        bytesBuffered = 0;
        resolve({
          stream: target,
          detected
        });
      } catch (error) {
        cts.cancel();
        target.destroy();
        reject(error);
      }
    };
    listenStream(source, {
      onData: async (chunk) => {
        if (decoder) {
          target.write(decoder.write(chunk.buffer));
        } else {
          bufferedChunks.push(chunk);
          bytesBuffered += chunk.byteLength;
          if (bytesBuffered >= minBytesRequiredForDetection) {
            source.pause();
            await createDecoder();
            setTimeout(() => source.resume());
          }
        }
      },
      onError: (error) => target.error(error),
      // simply forward to target
      onEnd: async () => {
        if (!decoder) {
          await createDecoder();
        }
        target.end(decoder?.end());
      }
    }, cts.token);
  });
}
async function toEncodeReadable(readable, encoding, options) {
  const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
  const encoder = iconv.getEncoder(toNodeEncoding(encoding), options);
  let bytesWritten = false;
  let done = false;
  return {
    read() {
      if (done) {
        return null;
      }
      const chunk = readable.read();
      if (typeof chunk !== "string") {
        done = true;
        if (!bytesWritten && options?.addBOM) {
          switch (encoding) {
            case UTF8:
            case UTF8_with_bom:
              return VSBuffer.wrap(Uint8Array.from(UTF8_BOM));
            case UTF16be:
              return VSBuffer.wrap(Uint8Array.from(UTF16be_BOM));
            case UTF16le:
              return VSBuffer.wrap(Uint8Array.from(UTF16le_BOM));
          }
        }
        const leftovers = encoder.end();
        if (leftovers && leftovers.length > 0) {
          bytesWritten = true;
          return VSBuffer.wrap(leftovers);
        }
        return null;
      }
      bytesWritten = true;
      return VSBuffer.wrap(encoder.write(chunk));
    }
  };
}
async function encodingExists(encoding) {
  const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
  return iconv.encodingExists(toNodeEncoding(encoding));
}
function toNodeEncoding(enc) {
  if (enc === UTF8_with_bom || enc === null) {
    return UTF8;
  }
  return enc;
}
function detectEncodingByBOMFromBuffer(buffer, bytesRead) {
  if (!buffer || bytesRead < UTF16be_BOM.length) {
    return null;
  }
  const b0 = buffer.readUInt8(0);
  const b1 = buffer.readUInt8(1);
  if (b0 === UTF16be_BOM[0] && b1 === UTF16be_BOM[1]) {
    return UTF16be;
  }
  if (b0 === UTF16le_BOM[0] && b1 === UTF16le_BOM[1]) {
    return UTF16le;
  }
  if (bytesRead < UTF8_BOM.length) {
    return null;
  }
  const b2 = buffer.readUInt8(2);
  if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
    return UTF8_with_bom;
  }
  return null;
}
const IGNORE_ENCODINGS = ["ascii", "utf-16", "utf-32"];
async function guessEncodingByBuffer(buffer, candidateGuessEncodings) {
  const jschardet = await importAMDNodeModule("jschardet", "dist/jschardet.min.js");
  const limitedBuffer = buffer.slice(0, AUTO_ENCODING_GUESS_MAX_BYTES);
  const binaryString = encodeLatin1(limitedBuffer.buffer);
  if (candidateGuessEncodings) {
    candidateGuessEncodings = coalesce(candidateGuessEncodings.map((e) => toJschardetEncoding(e)));
    if (candidateGuessEncodings.length === 0) {
      candidateGuessEncodings = void 0;
    }
  }
  let guessed;
  try {
    guessed = jschardet.detect(binaryString, candidateGuessEncodings ? { detectEncodings: candidateGuessEncodings } : void 0);
  } catch (error) {
    return null;
  }
  if (!guessed?.encoding) {
    return null;
  }
  const enc = guessed.encoding.toLowerCase();
  if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
    return null;
  }
  return toIconvLiteEncoding(guessed.encoding);
}
const JSCHARDET_TO_ICONV_ENCODINGS = {
  "ibm866": "cp866",
  "big5": "cp950"
};
function normalizeEncoding(encodingName) {
  return encodingName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function toIconvLiteEncoding(encodingName) {
  const normalizedEncodingName = normalizeEncoding(encodingName);
  const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];
  return mapped || normalizedEncodingName;
}
function toJschardetEncoding(encodingName) {
  const normalizedEncodingName = normalizeEncoding(encodingName);
  const mapped = GUESSABLE_ENCODINGS[normalizedEncodingName];
  return mapped ? mapped.guessableName : void 0;
}
function encodeLatin1(buffer) {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i]);
  }
  return result;
}
function toCanonicalName(enc) {
  switch (enc) {
    case "shiftjis":
      return "shift-jis";
    case "utf16le":
      return "utf-16le";
    case "utf16be":
      return "utf-16be";
    case "big5hkscs":
      return "big5-hkscs";
    case "eucjp":
      return "euc-jp";
    case "euckr":
      return "euc-kr";
    case "koi8r":
      return "koi8-r";
    case "koi8u":
      return "koi8-u";
    case "macroman":
      return "x-mac-roman";
    case "utf8bom":
      return "utf8";
    default: {
      const m = enc.match(/windows(\d+)/);
      if (m) {
        return "windows-" + m[1];
      }
      return enc;
    }
  }
}
function detectEncodingFromBuffer({ buffer, bytesRead }, autoGuessEncoding, candidateGuessEncodings) {
  let encoding = detectEncodingByBOMFromBuffer(buffer, bytesRead);
  let seemsBinary = false;
  if (encoding !== UTF16be && encoding !== UTF16le && buffer) {
    let couldBeUTF16LE = true;
    let couldBeUTF16BE = true;
    let containsZeroByte = false;
    for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
      const isEndian = i % 2 === 1;
      const isZeroByte = buffer.readUInt8(i) === 0;
      if (isZeroByte) {
        containsZeroByte = true;
      }
      if (couldBeUTF16LE && (isEndian && !isZeroByte || !isEndian && isZeroByte)) {
        couldBeUTF16LE = false;
      }
      if (couldBeUTF16BE && (isEndian && isZeroByte || !isEndian && !isZeroByte)) {
        couldBeUTF16BE = false;
      }
      if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
        break;
      }
    }
    if (containsZeroByte) {
      if (couldBeUTF16LE) {
        encoding = UTF16le;
      } else if (couldBeUTF16BE) {
        encoding = UTF16be;
      } else {
        seemsBinary = true;
      }
    }
  }
  if (autoGuessEncoding && !seemsBinary && !encoding && buffer) {
    return guessEncodingByBuffer(buffer.slice(0, bytesRead), candidateGuessEncodings).then((guessedEncoding) => {
      return {
        seemsBinary: false,
        encoding: guessedEncoding
      };
    });
  }
  return { seemsBinary, encoding };
}
const SUPPORTED_ENCODINGS = {
  utf8: {
    labelLong: "UTF-8",
    labelShort: "UTF-8",
    order: 1,
    alias: "utf8bom",
    guessableName: "UTF-8"
  },
  utf8bom: {
    labelLong: "UTF-8 with BOM",
    labelShort: "UTF-8 with BOM",
    encodeOnly: true,
    order: 2,
    alias: "utf8"
  },
  utf16le: {
    labelLong: "UTF-16 LE",
    labelShort: "UTF-16 LE",
    order: 3,
    guessableName: "UTF-16LE"
  },
  utf16be: {
    labelLong: "UTF-16 BE",
    labelShort: "UTF-16 BE",
    order: 4,
    guessableName: "UTF-16BE"
  },
  windows1252: {
    labelLong: "Western (Windows 1252)",
    labelShort: "Windows 1252",
    order: 5,
    guessableName: "windows-1252"
  },
  iso88591: {
    labelLong: "Western (ISO 8859-1)",
    labelShort: "ISO 8859-1",
    order: 6
  },
  iso88593: {
    labelLong: "Western (ISO 8859-3)",
    labelShort: "ISO 8859-3",
    order: 7
  },
  iso885915: {
    labelLong: "Western (ISO 8859-15)",
    labelShort: "ISO 8859-15",
    order: 8
  },
  macroman: {
    labelLong: "Western (Mac Roman)",
    labelShort: "Mac Roman",
    order: 9
  },
  cp437: {
    labelLong: "DOS (CP 437)",
    labelShort: "CP437",
    order: 10
  },
  windows1256: {
    labelLong: "Arabic (Windows 1256)",
    labelShort: "Windows 1256",
    order: 11
  },
  iso88596: {
    labelLong: "Arabic (ISO 8859-6)",
    labelShort: "ISO 8859-6",
    order: 12
  },
  windows1257: {
    labelLong: "Baltic (Windows 1257)",
    labelShort: "Windows 1257",
    order: 13
  },
  iso88594: {
    labelLong: "Baltic (ISO 8859-4)",
    labelShort: "ISO 8859-4",
    order: 14
  },
  iso885914: {
    labelLong: "Celtic (ISO 8859-14)",
    labelShort: "ISO 8859-14",
    order: 15
  },
  windows1250: {
    labelLong: "Central European (Windows 1250)",
    labelShort: "Windows 1250",
    order: 16,
    guessableName: "windows-1250"
  },
  iso88592: {
    labelLong: "Central European (ISO 8859-2)",
    labelShort: "ISO 8859-2",
    order: 17,
    guessableName: "ISO-8859-2"
  },
  cp852: {
    labelLong: "Central European (CP 852)",
    labelShort: "CP 852",
    order: 18
  },
  windows1251: {
    labelLong: "Cyrillic (Windows 1251)",
    labelShort: "Windows 1251",
    order: 19,
    guessableName: "windows-1251"
  },
  cp866: {
    labelLong: "Cyrillic (CP 866)",
    labelShort: "CP 866",
    order: 20,
    guessableName: "IBM866"
  },
  cp1125: {
    labelLong: "Cyrillic (CP 1125)",
    labelShort: "CP 1125",
    order: 21,
    guessableName: "IBM1125"
  },
  iso88595: {
    labelLong: "Cyrillic (ISO 8859-5)",
    labelShort: "ISO 8859-5",
    order: 22,
    guessableName: "ISO-8859-5"
  },
  koi8r: {
    labelLong: "Cyrillic (KOI8-R)",
    labelShort: "KOI8-R",
    order: 23,
    guessableName: "KOI8-R"
  },
  koi8u: {
    labelLong: "Cyrillic (KOI8-U)",
    labelShort: "KOI8-U",
    order: 24
  },
  iso885913: {
    labelLong: "Estonian (ISO 8859-13)",
    labelShort: "ISO 8859-13",
    order: 25
  },
  windows1253: {
    labelLong: "Greek (Windows 1253)",
    labelShort: "Windows 1253",
    order: 26,
    guessableName: "windows-1253"
  },
  iso88597: {
    labelLong: "Greek (ISO 8859-7)",
    labelShort: "ISO 8859-7",
    order: 27,
    guessableName: "ISO-8859-7"
  },
  windows1255: {
    labelLong: "Hebrew (Windows 1255)",
    labelShort: "Windows 1255",
    order: 28,
    guessableName: "windows-1255"
  },
  iso88598: {
    labelLong: "Hebrew (ISO 8859-8)",
    labelShort: "ISO 8859-8",
    order: 29,
    guessableName: "ISO-8859-8"
  },
  iso885910: {
    labelLong: "Nordic (ISO 8859-10)",
    labelShort: "ISO 8859-10",
    order: 30
  },
  iso885916: {
    labelLong: "Romanian (ISO 8859-16)",
    labelShort: "ISO 8859-16",
    order: 31
  },
  windows1254: {
    labelLong: "Turkish (Windows 1254)",
    labelShort: "Windows 1254",
    order: 32
  },
  iso88599: {
    labelLong: "Turkish (ISO 8859-9)",
    labelShort: "ISO 8859-9",
    order: 33
  },
  cp857: {
    labelLong: "Turkish (CP 857)",
    labelShort: "CP 857",
    order: 34
  },
  windows1258: {
    labelLong: "Vietnamese (Windows 1258)",
    labelShort: "Windows 1258",
    order: 35
  },
  gbk: {
    labelLong: "Simplified Chinese (GBK)",
    labelShort: "GBK",
    order: 36
  },
  gb18030: {
    labelLong: "Simplified Chinese (GB18030)",
    labelShort: "GB18030",
    order: 37
  },
  cp950: {
    labelLong: "Traditional Chinese (Big5)",
    labelShort: "Big5",
    order: 38,
    guessableName: "Big5"
  },
  big5hkscs: {
    labelLong: "Traditional Chinese (Big5-HKSCS)",
    labelShort: "Big5-HKSCS",
    order: 39
  },
  shiftjis: {
    labelLong: "Japanese (Shift JIS)",
    labelShort: "Shift JIS",
    order: 40,
    guessableName: "SHIFT_JIS"
  },
  eucjp: {
    labelLong: "Japanese (EUC-JP)",
    labelShort: "EUC-JP",
    order: 41,
    guessableName: "EUC-JP"
  },
  euckr: {
    labelLong: "Korean (EUC-KR)",
    labelShort: "EUC-KR",
    order: 42,
    guessableName: "EUC-KR"
  },
  windows874: {
    labelLong: "Thai (Windows 874)",
    labelShort: "Windows 874",
    order: 43
  },
  iso885911: {
    labelLong: "Latin/Thai (ISO 8859-11)",
    labelShort: "ISO 8859-11",
    order: 44
  },
  koi8ru: {
    labelLong: "Cyrillic (KOI8-RU)",
    labelShort: "KOI8-RU",
    order: 45
  },
  koi8t: {
    labelLong: "Tajik (KOI8-T)",
    labelShort: "KOI8-T",
    order: 46
  },
  gb2312: {
    labelLong: "Simplified Chinese (GB 2312)",
    labelShort: "GB 2312",
    order: 47,
    guessableName: "GB2312"
  },
  cp865: {
    labelLong: "Nordic DOS (CP 865)",
    labelShort: "CP 865",
    order: 48
  },
  cp850: {
    labelLong: "Western European DOS (CP 850)",
    labelShort: "CP 850",
    order: 49
  }
};
const GUESSABLE_ENCODINGS = (() => {
  const guessableEncodings = {};
  for (const encoding in SUPPORTED_ENCODINGS) {
    if (SUPPORTED_ENCODINGS[encoding].guessableName) {
      guessableEncodings[encoding] = SUPPORTED_ENCODINGS[encoding];
    }
  }
  return guessableEncodings;
})();
export {
  DecodeStreamError,
  DecodeStreamErrorKind,
  GUESSABLE_ENCODINGS,
  SUPPORTED_ENCODINGS,
  UTF16be,
  UTF16be_BOM,
  UTF16le,
  UTF16le_BOM,
  UTF8,
  UTF8_BOM,
  UTF8_with_bom,
  detectEncodingByBOMFromBuffer,
  detectEncodingFromBuffer,
  encodingExists,
  isUTFEncoding,
  toCanonicalName,
  toDecodeStream,
  toEncodeReadable,
  toNodeEncoding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcY29tbW9uXFxlbmNvZGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJlYWRhYmxlLCBSZWFkYWJsZVN0cmVhbSwgbmV3V3JpdGVhYmxlU3RyZWFtLCBsaXN0ZW5TdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGUsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuXG5leHBvcnQgY29uc3QgVVRGOCA9ICd1dGY4JztcbmV4cG9ydCBjb25zdCBVVEY4X3dpdGhfYm9tID0gJ3V0Zjhib20nO1xuZXhwb3J0IGNvbnN0IFVURjE2YmUgPSAndXRmMTZiZSc7XG5leHBvcnQgY29uc3QgVVRGMTZsZSA9ICd1dGYxNmxlJztcblxuZXhwb3J0IHR5cGUgVVRGX0VOQ09ESU5HID0gdHlwZW9mIFVURjggfCB0eXBlb2YgVVRGOF93aXRoX2JvbSB8IHR5cGVvZiBVVEYxNmJlIHwgdHlwZW9mIFVURjE2bGU7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1VURkVuY29kaW5nKGVuY29kaW5nOiBzdHJpbmcpOiBlbmNvZGluZyBpcyBVVEZfRU5DT0RJTkcge1xuXHRyZXR1cm4gW1VURjgsIFVURjhfd2l0aF9ib20sIFVURjE2YmUsIFVURjE2bGVdLnNvbWUodXRmRW5jb2RpbmcgPT4gdXRmRW5jb2RpbmcgPT09IGVuY29kaW5nKTtcbn1cblxuZXhwb3J0IGNvbnN0IFVURjE2YmVfQk9NID0gWzB4RkUsIDB4RkZdO1xuZXhwb3J0IGNvbnN0IFVURjE2bGVfQk9NID0gWzB4RkYsIDB4RkVdO1xuZXhwb3J0IGNvbnN0IFVURjhfQk9NID0gWzB4RUYsIDB4QkIsIDB4QkZdO1xuXG5jb25zdCBaRVJPX0JZVEVfREVURUNUSU9OX0JVRkZFUl9NQVhfTEVOID0gNTEyOyBcdC8vIG51bWJlciBvZiBieXRlcyB0byBsb29rIGF0IHRvIGRlY2lkZSBhYm91dCBhIGZpbGUgYmVpbmcgYmluYXJ5IG9yIG5vdFxuY29uc3QgTk9fRU5DT0RJTkdfR1VFU1NfTUlOX0JZVEVTID0gNTEyOyBcdFx0XHQvLyB3aGVuIG5vdCBhdXRvIGd1ZXNzaW5nIHRoZSBlbmNvZGluZywgc21hbGwgbnVtYmVyIG9mIGJ5dGVzIGFyZSBlbm91Z2hcbmNvbnN0IEFVVE9fRU5DT0RJTkdfR1VFU1NfTUlOX0JZVEVTID0gNTEyICogODsgXHRcdC8vIHdpdGggYXV0byBndWVzc2luZyB3ZSB3YW50IGEgbG90IG1vcmUgY29udGVudCB0byBiZSByZWFkIGZvciBndWVzc2luZ1xuY29uc3QgQVVUT19FTkNPRElOR19HVUVTU19NQVhfQllURVMgPSA1MTIgKiAxMjg7IFx0Ly8gc2V0IGFuIHVwcGVyIGxpbWl0IGZvciB0aGUgbnVtYmVyIG9mIGJ5dGVzIHdlIHBhc3Mgb24gdG8ganNjaGFyZGV0XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlY29kZVN0cmVhbU9wdGlvbnMge1xuXHRhY2NlcHRUZXh0T25seTogYm9vbGVhbjtcblx0Z3Vlc3NFbmNvZGluZzogYm9vbGVhbjtcblx0Y2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IHN0cmluZ1tdO1xuXHRtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uPzogbnVtYmVyO1xuXG5cdG92ZXJ3cml0ZUVuY29kaW5nKGRldGVjdGVkRW5jb2Rpbmc6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlY29kZVN0cmVhbVJlc3VsdCB7XG5cdHN0cmVhbTogUmVhZGFibGVTdHJlYW08c3RyaW5nPjtcblx0ZGV0ZWN0ZWQ6IElEZXRlY3RlZEVuY29kaW5nUmVzdWx0O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBEZWNvZGVTdHJlYW1FcnJvcktpbmQge1xuXG5cdC8qKlxuXHQgKiBFcnJvciBpbmRpY2F0aW5nIHRoYXQgdGhlIHN0cmVhbSBpcyBiaW5hcnkgZXZlblxuXHQgKiB0aG91Z2ggYGFjY2VwdFRleHRPbmx5YCB3YXMgc3BlY2lmaWVkLlxuXHQgKi9cblx0U1RSRUFNX0lTX0JJTkFSWSA9IDFcbn1cblxuZXhwb3J0IGNsYXNzIERlY29kZVN0cmVhbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1lc3NhZ2U6IHN0cmluZyxcblx0XHRyZWFkb25seSBkZWNvZGVTdHJlYW1FcnJvcktpbmQ6IERlY29kZVN0cmVhbUVycm9yS2luZFxuXHQpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZWNvZGVyU3RyZWFtIHtcblx0d3JpdGUoYnVmZmVyOiBVaW50OEFycmF5KTogc3RyaW5nO1xuXHRlbmQoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBEZWNvZGVyU3RyZWFtIGltcGxlbWVudHMgSURlY29kZXJTdHJlYW0ge1xuXG5cdC8qKlxuXHQgKiBUaGlzIHN0cmVhbSB3aWxsIG9ubHkgbG9hZCBpY29udi1saXRlIGxhemlseSBpZiB0aGUgZW5jb2Rpbmdcblx0ICogaXMgbm90IFVURi04LiBUaGlzIGVuc3VyZXMgdGhhdCBmb3IgbW9zdCBjb21tb24gY2FzZXMgd2UgZG9cblx0ICogbm90IHBheSB0aGUgcHJpY2Ugb2YgbG9hZGluZyB0aGUgbW9kdWxlIGZyb20gZGlzay5cblx0ICpcblx0ICogV2Ugc3RpbGwgbmVlZCB0byBiZSBjYXJlZnVsIHdoZW4gY29udmVydGluZyBVVEYtOCB0byBhIHN0cmluZ1xuXHQgKiB0aG91Z2ggYmVjYXVzZSB3ZSByZWFkIHRoZSBmaWxlIGluIGNodW5rcyBvZiBCdWZmZXIgYW5kIHRodXNcblx0ICogbmVlZCB0byBkZWNvZGUgaXQgdmlhIFRleHREZWNvZGVyIGhlbHBlciB0aGF0IGlzIGF2YWlsYWJsZVxuXHQgKiBpbiBicm93c2VyIGFuZCBub2RlLmpzIGVudmlyb25tZW50cy5cblx0ICovXG5cdHN0YXRpYyBhc3luYyBjcmVhdGUoZW5jb2Rpbmc6IHN0cmluZyk6IFByb21pc2U8RGVjb2RlclN0cmVhbT4ge1xuXHRcdGxldCBkZWNvZGVyOiBJRGVjb2RlclN0cmVhbSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoZW5jb2RpbmcgIT09IFVURjgpIHtcblx0XHRcdGNvbnN0IGljb252ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJyk+KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJywgJ2xpYi9pY29udi1saXRlLXVtZC5qcycpO1xuXHRcdFx0ZGVjb2RlciA9IGljb252LmdldERlY29kZXIodG9Ob2RlRW5jb2RpbmcoZW5jb2RpbmcpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXRmOFRleHREZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG5cdFx0XHRkZWNvZGVyID0ge1xuXHRcdFx0XHR3cml0ZShidWZmZXI6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuXHRcdFx0XHRcdHJldHVybiB1dGY4VGV4dERlY29kZXIuZGVjb2RlKGJ1ZmZlciwge1xuXHRcdFx0XHRcdFx0Ly8gU2lnbmFsIHRvIFRleHREZWNvZGVyIHRoYXQgcG90ZW50aWFsbHkgbW9yZSBkYXRhIGlzIGNvbWluZ1xuXHRcdFx0XHRcdFx0Ly8gYW5kIHRoYXQgd2UgYXJlIGNhbGxpbmcgYGRlY29kZWAgaW4gdGhlIGVuZCB0byBjb25zdW1lIGFueVxuXHRcdFx0XHRcdFx0Ly8gcmVtYWluZGVyc1xuXHRcdFx0XHRcdFx0c3RyZWFtOiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0ZW5kKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdFx0cmV0dXJuIHV0ZjhUZXh0RGVjb2Rlci5kZWNvZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IERlY29kZXJTdHJlYW0oZGVjb2Rlcik7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHByaXZhdGUgaWNvbnZMaXRlRGVjb2RlcjogSURlY29kZXJTdHJlYW0pIHsgfVxuXG5cdHdyaXRlKGJ1ZmZlcjogVWludDhBcnJheSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWNvbnZMaXRlRGVjb2Rlci53cml0ZShidWZmZXIpO1xuXHR9XG5cblx0ZW5kKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaWNvbnZMaXRlRGVjb2Rlci5lbmQoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9EZWNvZGVTdHJlYW0oc291cmNlOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCBvcHRpb25zOiBJRGVjb2RlU3RyZWFtT3B0aW9ucyk6IFByb21pc2U8SURlY29kZVN0cmVhbVJlc3VsdD4ge1xuXHRjb25zdCBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uID0gb3B0aW9ucy5taW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uID8/IChvcHRpb25zLmd1ZXNzRW5jb2RpbmcgPyBBVVRPX0VOQ09ESU5HX0dVRVNTX01JTl9CWVRFUyA6IE5PX0VOQ09ESU5HX0dVRVNTX01JTl9CWVRFUyk7XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPElEZWNvZGVTdHJlYW1SZXN1bHQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbignJykpO1xuXG5cdFx0Y29uc3QgYnVmZmVyZWRDaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRsZXQgYnl0ZXNCdWZmZXJlZCA9IDA7XG5cblx0XHRsZXQgZGVjb2RlcjogSURlY29kZXJTdHJlYW0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGNvbnN0IGNyZWF0ZURlY29kZXIgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXG5cdFx0XHRcdC8vIGRldGVjdCBlbmNvZGluZyBmcm9tIGJ1ZmZlclxuXHRcdFx0XHRjb25zdCBkZXRlY3RlZCA9IGF3YWl0IGRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcih7XG5cdFx0XHRcdFx0YnVmZmVyOiBWU0J1ZmZlci5jb25jYXQoYnVmZmVyZWRDaHVua3MpLFxuXHRcdFx0XHRcdGJ5dGVzUmVhZDogYnl0ZXNCdWZmZXJlZFxuXHRcdFx0XHR9LCBvcHRpb25zLmd1ZXNzRW5jb2RpbmcsIG9wdGlvbnMuY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MpO1xuXG5cdFx0XHRcdC8vIHRocm93IGVhcmx5IGlmIHRoZSBzb3VyY2Ugc2VlbXMgYmluYXJ5IGFuZFxuXHRcdFx0XHQvLyB3ZSBhcmUgaW5zdHJ1Y3RlZCB0byBvbmx5IGFjY2VwdCB0ZXh0XG5cdFx0XHRcdGlmIChkZXRlY3RlZC5zZWVtc0JpbmFyeSAmJiBvcHRpb25zLmFjY2VwdFRleHRPbmx5KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IERlY29kZVN0cmVhbUVycm9yKCdTdHJlYW0gaXMgYmluYXJ5IGJ1dCBvbmx5IHRleHQgaXMgYWNjZXB0ZWQgZm9yIGRlY29kaW5nJywgRGVjb2RlU3RyZWFtRXJyb3JLaW5kLlNUUkVBTV9JU19CSU5BUlkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZW5zdXJlIHRvIHJlc3BlY3Qgb3ZlcndyaXRlIG9mIGVuY29kaW5nXG5cdFx0XHRcdGRldGVjdGVkLmVuY29kaW5nID0gYXdhaXQgb3B0aW9ucy5vdmVyd3JpdGVFbmNvZGluZyhkZXRlY3RlZC5lbmNvZGluZyk7XG5cblx0XHRcdFx0Ly8gZGVjb2RlIGFuZCB3cml0ZSBidWZmZXJlZCBjb250ZW50XG5cdFx0XHRcdGRlY29kZXIgPSBhd2FpdCBEZWNvZGVyU3RyZWFtLmNyZWF0ZShkZXRlY3RlZC5lbmNvZGluZyk7XG5cdFx0XHRcdGNvbnN0IGRlY29kZWQgPSBkZWNvZGVyLndyaXRlKFZTQnVmZmVyLmNvbmNhdChidWZmZXJlZENodW5rcykuYnVmZmVyKTtcblx0XHRcdFx0dGFyZ2V0LndyaXRlKGRlY29kZWQpO1xuXG5cdFx0XHRcdGJ1ZmZlcmVkQ2h1bmtzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdGJ5dGVzQnVmZmVyZWQgPSAwO1xuXG5cdFx0XHRcdC8vIHNpZ25hbCB0byB0aGUgb3V0c2lkZSBvdXIgZGV0ZWN0ZWQgZW5jb2RpbmcgYW5kIGZpbmFsIGRlY29kZXIgc3RyZWFtXG5cdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdHN0cmVhbTogdGFyZ2V0LFxuXHRcdFx0XHRcdGRldGVjdGVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBTdG9wIGhhbmRsaW5nIGFueXRoaW5nIGZyb20gdGhlIHNvdXJjZSBhbmQgdGFyZ2V0XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0dGFyZ2V0LmRlc3Ryb3koKTtcblxuXHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsaXN0ZW5TdHJlYW0oc291cmNlLCB7XG5cdFx0XHRvbkRhdGE6IGFzeW5jIGNodW5rID0+IHtcblxuXHRcdFx0XHQvLyBpZiB0aGUgZGVjb2RlciBpcyByZWFkeSwgd2UganVzdCB3cml0ZSBkaXJlY3RseVxuXHRcdFx0XHRpZiAoZGVjb2Rlcikge1xuXHRcdFx0XHRcdHRhcmdldC53cml0ZShkZWNvZGVyLndyaXRlKGNodW5rLmJ1ZmZlcikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gb3RoZXJ3aXNlIHdlIG5lZWQgdG8gYnVmZmVyIHRoZSBkYXRhIHVudGlsIHRoZSBzdHJlYW0gaXMgcmVhZHlcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0YnVmZmVyZWRDaHVua3MucHVzaChjaHVuayk7XG5cdFx0XHRcdFx0Ynl0ZXNCdWZmZXJlZCArPSBjaHVuay5ieXRlTGVuZ3RoO1xuXG5cdFx0XHRcdFx0Ly8gYnVmZmVyZWQgZW5vdWdoIGRhdGEgZm9yIGVuY29kaW5nIGRldGVjdGlvbiwgY3JlYXRlIHN0cmVhbVxuXHRcdFx0XHRcdGlmIChieXRlc0J1ZmZlcmVkID49IG1pbkJ5dGVzUmVxdWlyZWRGb3JEZXRlY3Rpb24pIHtcblxuXHRcdFx0XHRcdFx0Ly8gcGF1c2Ugc3RyZWFtIGhlcmUgdW50aWwgdGhlIGRlY29kZXIgaXMgcmVhZHlcblx0XHRcdFx0XHRcdHNvdXJjZS5wYXVzZSgpO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCBjcmVhdGVEZWNvZGVyKCk7XG5cblx0XHRcdFx0XHRcdC8vIHJlc3VtZSBzdHJlYW0gbm93IHRoYXQgZGVjb2RlciBpcyByZWFkeSBidXRcblx0XHRcdFx0XHRcdC8vIG91dHNpZGUgb2YgdGhpcyBzdGFjayB0byByZWR1Y2UgcmVjdXJzaW9uXG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHNvdXJjZS5yZXN1bWUoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25FcnJvcjogZXJyb3IgPT4gdGFyZ2V0LmVycm9yKGVycm9yKSwgLy8gc2ltcGx5IGZvcndhcmQgdG8gdGFyZ2V0XG5cdFx0XHRvbkVuZDogYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRcdC8vIHdlIHdlcmUgc3RpbGwgd2FpdGluZyBmb3IgZGF0YSB0byBkbyB0aGUgZW5jb2Rpbmdcblx0XHRcdFx0Ly8gZGV0ZWN0aW9uLiB0aHVzLCB3cmFwIHVwIHN0YXJ0aW5nIHRoZSBzdHJlYW0gZXZlblxuXHRcdFx0XHQvLyB3aXRob3V0IGFsbCB0aGUgZGF0YSB0byBnZXQgdGhpbmdzIGdvaW5nXG5cdFx0XHRcdGlmICghZGVjb2Rlcikge1xuXHRcdFx0XHRcdGF3YWl0IGNyZWF0ZURlY29kZXIoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGVuZCB0aGUgdGFyZ2V0IHdpdGggdGhlIHJlbWFpbmRlcnMgb2YgdGhlIGRlY29kZXJcblx0XHRcdFx0dGFyZ2V0LmVuZChkZWNvZGVyPy5lbmQoKSk7XG5cdFx0XHR9XG5cdFx0fSwgY3RzLnRva2VuKTtcblx0fSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0b0VuY29kZVJlYWRhYmxlKHJlYWRhYmxlOiBSZWFkYWJsZTxzdHJpbmc+LCBlbmNvZGluZzogc3RyaW5nLCBvcHRpb25zPzogeyBhZGRCT00/OiBib29sZWFuIH0pOiBQcm9taXNlPFZTQnVmZmVyUmVhZGFibGU+IHtcblx0Y29uc3QgaWNvbnYgPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnKT4oJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnLCAnbGliL2ljb252LWxpdGUtdW1kLmpzJyk7XG5cdGNvbnN0IGVuY29kZXIgPSBpY29udi5nZXRFbmNvZGVyKHRvTm9kZUVuY29kaW5nKGVuY29kaW5nKSwgb3B0aW9ucyk7XG5cblx0bGV0IGJ5dGVzV3JpdHRlbiA9IGZhbHNlO1xuXHRsZXQgZG9uZSA9IGZhbHNlO1xuXG5cdHJldHVybiB7XG5cdFx0cmVhZCgpIHtcblx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaHVuayA9IHJlYWRhYmxlLnJlYWQoKTtcblx0XHRcdGlmICh0eXBlb2YgY2h1bmsgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGRvbmUgPSB0cnVlO1xuXG5cdFx0XHRcdC8vIElmIHdlIGFyZSBpbnN0cnVjdGVkIHRvIGFkZCBhIEJPTSBidXQgd2UgZGV0ZWN0IHRoYXQgbm9cblx0XHRcdFx0Ly8gYnl0ZXMgaGF2ZSBiZWVuIHdyaXR0ZW4sIHdlIG11c3QgZW5zdXJlIHRvIHJldHVybiB0aGUgQk9NXG5cdFx0XHRcdC8vIG91cnNlbHZlcyBzbyB0aGF0IHdlIGNvbXBseSB3aXRoIHRoZSBjb250cmFjdC5cblx0XHRcdFx0aWYgKCFieXRlc1dyaXR0ZW4gJiYgb3B0aW9ucz8uYWRkQk9NKSB7XG5cdFx0XHRcdFx0c3dpdGNoIChlbmNvZGluZykge1xuXHRcdFx0XHRcdFx0Y2FzZSBVVEY4OlxuXHRcdFx0XHRcdFx0Y2FzZSBVVEY4X3dpdGhfYm9tOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChVaW50OEFycmF5LmZyb20oVVRGOF9CT00pKTtcblx0XHRcdFx0XHRcdGNhc2UgVVRGMTZiZTpcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAoVWludDhBcnJheS5mcm9tKFVURjE2YmVfQk9NKSk7XG5cdFx0XHRcdFx0XHRjYXNlIFVURjE2bGU6XG5cdFx0XHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKFVpbnQ4QXJyYXkuZnJvbShVVEYxNmxlX0JPTSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxlZnRvdmVycyA9IGVuY29kZXIuZW5kKCk7XG5cdFx0XHRcdGlmIChsZWZ0b3ZlcnMgJiYgbGVmdG92ZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRieXRlc1dyaXR0ZW4gPSB0cnVlO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAobGVmdG92ZXJzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRieXRlc1dyaXR0ZW4gPSB0cnVlO1xuXG5cdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChlbmNvZGVyLndyaXRlKGNodW5rKSk7XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZW5jb2RpbmdFeGlzdHMoZW5jb2Rpbmc6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCBpY29udiA9IGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHZzY29kZS9pY29udi1saXRlLXVtZCcpPignQHZzY29kZS9pY29udi1saXRlLXVtZCcsICdsaWIvaWNvbnYtbGl0ZS11bWQuanMnKTtcblxuXHRyZXR1cm4gaWNvbnYuZW5jb2RpbmdFeGlzdHModG9Ob2RlRW5jb2RpbmcoZW5jb2RpbmcpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvTm9kZUVuY29kaW5nKGVuYzogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB7XG5cdGlmIChlbmMgPT09IFVURjhfd2l0aF9ib20gfHwgZW5jID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIFVURjg7IC8vIGljb252IGRvZXMgbm90IGRpc3Rpbmd1aXNoIFVURiA4IHdpdGggb3Igd2l0aG91dCBCT00sIHNvIHdlIG5lZWQgdG8gaGVscCBpdFxuXHR9XG5cblx0cmV0dXJuIGVuYztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdEVuY29kaW5nQnlCT01Gcm9tQnVmZmVyKGJ1ZmZlcjogVlNCdWZmZXIgfCBudWxsLCBieXRlc1JlYWQ6IG51bWJlcik6IHR5cGVvZiBVVEY4X3dpdGhfYm9tIHwgdHlwZW9mIFVURjE2bGUgfCB0eXBlb2YgVVRGMTZiZSB8IG51bGwge1xuXHRpZiAoIWJ1ZmZlciB8fCBieXRlc1JlYWQgPCBVVEYxNmJlX0JPTS5sZW5ndGgpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGIwID0gYnVmZmVyLnJlYWRVSW50OCgwKTtcblx0Y29uc3QgYjEgPSBidWZmZXIucmVhZFVJbnQ4KDEpO1xuXG5cdC8vIFVURi0xNiBCRVxuXHRpZiAoYjAgPT09IFVURjE2YmVfQk9NWzBdICYmIGIxID09PSBVVEYxNmJlX0JPTVsxXSkge1xuXHRcdHJldHVybiBVVEYxNmJlO1xuXHR9XG5cblx0Ly8gVVRGLTE2IExFXG5cdGlmIChiMCA9PT0gVVRGMTZsZV9CT01bMF0gJiYgYjEgPT09IFVURjE2bGVfQk9NWzFdKSB7XG5cdFx0cmV0dXJuIFVURjE2bGU7XG5cdH1cblxuXHRpZiAoYnl0ZXNSZWFkIDwgVVRGOF9CT00ubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBiMiA9IGJ1ZmZlci5yZWFkVUludDgoMik7XG5cblx0Ly8gVVRGLThcblx0aWYgKGIwID09PSBVVEY4X0JPTVswXSAmJiBiMSA9PT0gVVRGOF9CT01bMV0gJiYgYjIgPT09IFVURjhfQk9NWzJdKSB7XG5cdFx0cmV0dXJuIFVURjhfd2l0aF9ib207XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuLy8gd2UgZXhwbGljaXRseSBpZ25vcmUgYSBzcGVjaWZpYyBzZXQgb2YgZW5jb2RpbmdzIGZyb20gYXV0byBndWVzc2luZ1xuLy8gLSBBU0NJSTogd2UgbmV2ZXIgd2FudCB0aGlzIGVuY29kaW5nIChtb3N0IFVURi04IGZpbGVzIHdvdWxkIGhhcHBpbHkgZGV0ZWN0IGFzXG4vLyAgICAgICAgICBBU0NJSSBmaWxlcyBhbmQgdGhlbiB5b3UgY291bGQgbm90IHR5cGUgbm9uLUFTQ0lJIGNoYXJhY3RlcnMgYW55bW9yZSlcbi8vIC0gVVRGLTE2OiB3ZSBoYXZlIG91ciBvd24gZGV0ZWN0aW9uIGxvZ2ljIGZvciBVVEYtMTZcbi8vIC0gVVRGLTMyOiB3ZSBkbyBub3Qgc3VwcG9ydCB0aGlzIGVuY29kaW5nIGluIFZTQ29kZVxuY29uc3QgSUdOT1JFX0VOQ09ESU5HUyA9IFsnYXNjaWknLCAndXRmLTE2JywgJ3V0Zi0zMiddO1xuXG4vKipcbiAqIEd1ZXNzZXMgdGhlIGVuY29kaW5nIGZyb20gYnVmZmVyLlxuICovXG5hc3luYyBmdW5jdGlvbiBndWVzc0VuY29kaW5nQnlCdWZmZXIoYnVmZmVyOiBWU0J1ZmZlciwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M/OiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRjb25zdCBqc2NoYXJkZXQgPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ2pzY2hhcmRldCcpPignanNjaGFyZGV0JywgJ2Rpc3QvanNjaGFyZGV0Lm1pbi5qcycpO1xuXG5cdC8vIGVuc3VyZSB0byBsaW1pdCBidWZmZXIgZm9yIGd1ZXNzaW5nIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vYWFkc20vanNjaGFyZGV0L2lzc3Vlcy81M1xuXHRjb25zdCBsaW1pdGVkQnVmZmVyID0gYnVmZmVyLnNsaWNlKDAsIEFVVE9fRU5DT0RJTkdfR1VFU1NfTUFYX0JZVEVTKTtcblxuXHQvLyBiZWZvcmUgZ3Vlc3NpbmcganNjaGFyZGV0IGNhbGxzIHRvU3RyaW5nKCdiaW5hcnknKSBvbiBpbnB1dCBpZiBpdCBpcyBhIEJ1ZmZlcixcblx0Ly8gc2luY2Ugd2UgYXJlIHVzaW5nIGl0IGluc2lkZSBicm93c2VyIGVudmlyb25tZW50IGFzIHdlbGwgd2UgZG8gY29udmVyc2lvbiBvdXJzZWx2ZXNcblx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL2FhZHNtL2pzY2hhcmRldC9ibG9iL3YyLjEuMS9zcmMvaW5kZXguanMjTDM2LUw0MFxuXHRjb25zdCBiaW5hcnlTdHJpbmcgPSBlbmNvZGVMYXRpbjEobGltaXRlZEJ1ZmZlci5idWZmZXIpO1xuXG5cdC8vIGVuc3VyZSB0byBjb252ZXJ0IGNhbmRpZGF0ZSBlbmNvZGluZ3MgdG8ganNjaGFyZGV0IGVuY29kaW5nIG5hbWVzIGlmIHByb3ZpZGVkXG5cdGlmIChjYW5kaWRhdGVHdWVzc0VuY29kaW5ncykge1xuXHRcdGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzID0gY29hbGVzY2UoY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MubWFwKGUgPT4gdG9Kc2NoYXJkZXRFbmNvZGluZyhlKSkpO1xuXHRcdGlmIChjYW5kaWRhdGVHdWVzc0VuY29kaW5ncy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGxldCBndWVzc2VkOiB7IGVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRndWVzc2VkID0ganNjaGFyZGV0LmRldGVjdChiaW5hcnlTdHJpbmcsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzID8geyBkZXRlY3RFbmNvZGluZ3M6IGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzIH0gOiB1bmRlZmluZWQpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHJldHVybiBudWxsOyAvLyBqc2NoYXJkZXQgdGhyb3dzIGZvciB1bmtub3duIGVuY29kaW5ncyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzOTkyOClcblx0fVxuXG5cdGlmICghZ3Vlc3NlZD8uZW5jb2RpbmcpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGVuYyA9IGd1ZXNzZWQuZW5jb2RpbmcudG9Mb3dlckNhc2UoKTtcblx0aWYgKDAgPD0gSUdOT1JFX0VOQ09ESU5HUy5pbmRleE9mKGVuYykpIHtcblx0XHRyZXR1cm4gbnVsbDsgLy8gc2VlIGNvbW1lbnQgYWJvdmUgd2h5IHdlIGlnbm9yZSBzb21lIGVuY29kaW5nc1xuXHR9XG5cblx0cmV0dXJuIHRvSWNvbnZMaXRlRW5jb2RpbmcoZ3Vlc3NlZC5lbmNvZGluZyk7XG59XG5cbmNvbnN0IEpTQ0hBUkRFVF9UT19JQ09OVl9FTkNPRElOR1M6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB9ID0ge1xuXHQnaWJtODY2JzogJ2NwODY2Jyxcblx0J2JpZzUnOiAnY3A5NTAnXG59O1xuXG5mdW5jdGlvbiBub3JtYWxpemVFbmNvZGluZyhlbmNvZGluZ05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBlbmNvZGluZ05hbWUucmVwbGFjZSgvW15hLXpBLVowLTldL2csICcnKS50b0xvd2VyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiB0b0ljb252TGl0ZUVuY29kaW5nKGVuY29kaW5nTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgbm9ybWFsaXplZEVuY29kaW5nTmFtZSA9IG5vcm1hbGl6ZUVuY29kaW5nKGVuY29kaW5nTmFtZSk7XG5cdGNvbnN0IG1hcHBlZCA9IEpTQ0hBUkRFVF9UT19JQ09OVl9FTkNPRElOR1Nbbm9ybWFsaXplZEVuY29kaW5nTmFtZV07XG5cblx0cmV0dXJuIG1hcHBlZCB8fCBub3JtYWxpemVkRW5jb2RpbmdOYW1lO1xufVxuXG5mdW5jdGlvbiB0b0pzY2hhcmRldEVuY29kaW5nKGVuY29kaW5nTmFtZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZEVuY29kaW5nTmFtZSA9IG5vcm1hbGl6ZUVuY29kaW5nKGVuY29kaW5nTmFtZSk7XG5cdGNvbnN0IG1hcHBlZCA9IEdVRVNTQUJMRV9FTkNPRElOR1Nbbm9ybWFsaXplZEVuY29kaW5nTmFtZV07XG5cblx0cmV0dXJuIG1hcHBlZCA/IG1hcHBlZC5ndWVzc2FibGVOYW1lIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVMYXRpbjEoYnVmZmVyOiBVaW50OEFycmF5KTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9ICcnO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuXHRcdHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZmZlcltpXSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFRoZSBlbmNvZGluZ3MgdGhhdCBhcmUgYWxsb3dlZCBpbiBhIHNldHRpbmdzIGZpbGUgZG9uJ3QgbWF0Y2ggdGhlIGNhbm9uaWNhbCBlbmNvZGluZyBsYWJlbHMgc3BlY2lmaWVkIGJ5IFdIQVRXRy5cbiAqIFNlZSBodHRwczovL2VuY29kaW5nLnNwZWMud2hhdHdnLm9yZy8jbmFtZXMtYW5kLWxhYmVsc1xuICogSWNvbnYtbGl0ZSBzdHJpcHMgYWxsIG5vbi1hbHBoYW51bWVyaWMgY2hhcmFjdGVycywgYnV0IHJpcGdyZXAgZG9lc24ndC4gRm9yIGJhY2tjb21wYXQsIGFsbG93IHRoZXNlIGxhYmVscy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvQ2Fub25pY2FsTmFtZShlbmM6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoZW5jKSB7XG5cdFx0Y2FzZSAnc2hpZnRqaXMnOlxuXHRcdFx0cmV0dXJuICdzaGlmdC1qaXMnO1xuXHRcdGNhc2UgJ3V0ZjE2bGUnOlxuXHRcdFx0cmV0dXJuICd1dGYtMTZsZSc7XG5cdFx0Y2FzZSAndXRmMTZiZSc6XG5cdFx0XHRyZXR1cm4gJ3V0Zi0xNmJlJztcblx0XHRjYXNlICdiaWc1aGtzY3MnOlxuXHRcdFx0cmV0dXJuICdiaWc1LWhrc2NzJztcblx0XHRjYXNlICdldWNqcCc6XG5cdFx0XHRyZXR1cm4gJ2V1Yy1qcCc7XG5cdFx0Y2FzZSAnZXVja3InOlxuXHRcdFx0cmV0dXJuICdldWMta3InO1xuXHRcdGNhc2UgJ2tvaThyJzpcblx0XHRcdHJldHVybiAna29pOC1yJztcblx0XHRjYXNlICdrb2k4dSc6XG5cdFx0XHRyZXR1cm4gJ2tvaTgtdSc7XG5cdFx0Y2FzZSAnbWFjcm9tYW4nOlxuXHRcdFx0cmV0dXJuICd4LW1hYy1yb21hbic7XG5cdFx0Y2FzZSAndXRmOGJvbSc6XG5cdFx0XHRyZXR1cm4gJ3V0ZjgnO1xuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdGNvbnN0IG0gPSBlbmMubWF0Y2goL3dpbmRvd3MoXFxkKykvKTtcblx0XHRcdGlmIChtKSB7XG5cdFx0XHRcdHJldHVybiAnd2luZG93cy0nICsgbVsxXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGVuYztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGV0ZWN0ZWRFbmNvZGluZ1Jlc3VsdCB7XG5cdGVuY29kaW5nOiBzdHJpbmcgfCBudWxsO1xuXHRzZWVtc0JpbmFyeTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVhZFJlc3VsdCB7XG5cdGJ1ZmZlcjogVlNCdWZmZXIgfCBudWxsO1xuXHRieXRlc1JlYWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihyZWFkUmVzdWx0OiBJUmVhZFJlc3VsdCwgYXV0b0d1ZXNzRW5jb2Rpbmc/OiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M/OiBzdHJpbmdbXSk6IElEZXRlY3RlZEVuY29kaW5nUmVzdWx0O1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihyZWFkUmVzdWx0OiBJUmVhZFJlc3VsdCwgYXV0b0d1ZXNzRW5jb2Rpbmc/OiBib29sZWFuLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5ncz86IHN0cmluZ1tdKTogUHJvbWlzZTxJRGV0ZWN0ZWRFbmNvZGluZ1Jlc3VsdD47XG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKHsgYnVmZmVyLCBieXRlc1JlYWQgfTogSVJlYWRSZXN1bHQsIGF1dG9HdWVzc0VuY29kaW5nPzogYm9vbGVhbiwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M/OiBzdHJpbmdbXSk6IFByb21pc2U8SURldGVjdGVkRW5jb2RpbmdSZXN1bHQ+IHwgSURldGVjdGVkRW5jb2RpbmdSZXN1bHQge1xuXG5cdC8vIEFsd2F5cyBmaXJzdCBjaGVjayBmb3IgQk9NIHRvIGZpbmQgb3V0IGFib3V0IGVuY29kaW5nXG5cdGxldCBlbmNvZGluZyA9IGRldGVjdEVuY29kaW5nQnlCT01Gcm9tQnVmZmVyKGJ1ZmZlciwgYnl0ZXNSZWFkKTtcblxuXHQvLyBEZXRlY3QgMCBieXRlcyB0byBzZWUgaWYgZmlsZSBpcyBiaW5hcnkgb3IgVVRGLTE2IExFL0JFXG5cdC8vIHVubGVzcyB3ZSBhbHJlYWR5IGtub3cgdGhhdCB0aGlzIGZpbGUgaGFzIGEgVVRGLTE2IGVuY29kaW5nXG5cdGxldCBzZWVtc0JpbmFyeSA9IGZhbHNlO1xuXHRpZiAoZW5jb2RpbmcgIT09IFVURjE2YmUgJiYgZW5jb2RpbmcgIT09IFVURjE2bGUgJiYgYnVmZmVyKSB7XG5cdFx0bGV0IGNvdWxkQmVVVEYxNkxFID0gdHJ1ZTsgLy8gZS5nLiAweEFBIDB4MDBcblx0XHRsZXQgY291bGRCZVVURjE2QkUgPSB0cnVlOyAvLyBlLmcuIDB4MDAgMHhBQVxuXHRcdGxldCBjb250YWluc1plcm9CeXRlID0gZmFsc2U7XG5cblx0XHQvLyBUaGlzIGlzIGEgc2ltcGxpZmllZCBndWVzcyB0byBkZXRlY3QgVVRGLTE2IEJFIG9yIExFIGJ5IGp1c3QgY2hlY2tpbmcgaWZcblx0XHQvLyB0aGUgZmlyc3QgNTEyIGJ5dGVzIGhhdmUgdGhlIDAtYnl0ZSBhdCBhIHNwZWNpZmljIGxvY2F0aW9uLiBGb3IgVVRGLTE2IExFXG5cdFx0Ly8gdGhpcyB3b3VsZCBiZSB0aGUgb2RkIGJ5dGUgaW5kZXggYW5kIGZvciBVVEYtMTYgQkUgdGhlIGV2ZW4gb25lLlxuXHRcdC8vIE5vdGU6IHRoaXMgY2FuIHByb2R1Y2UgZmFsc2UgcG9zaXRpdmVzIChhIGJpbmFyeSBmaWxlIHRoYXQgdXNlcyBhIDItYnl0ZVxuXHRcdC8vIGVuY29kaW5nIG9mIHRoZSBzYW1lIGZvcm1hdCBhcyBVVEYtMTYpIGFuZCBmYWxzZSBuZWdhdGl2ZXMgKGEgVVRGLTE2IGZpbGVcblx0XHQvLyB0aGF0IGlzIHVzaW5nIDQgYnl0ZXMgdG8gZW5jb2RlIGEgY2hhcmFjdGVyKS5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGJ5dGVzUmVhZCAmJiBpIDwgWkVST19CWVRFX0RFVEVDVElPTl9CVUZGRVJfTUFYX0xFTjsgaSsrKSB7XG5cdFx0XHRjb25zdCBpc0VuZGlhbiA9IChpICUgMiA9PT0gMSk7IC8vIGFzc3VtZSAyLWJ5dGUgc2VxdWVuY2VzIHR5cGljYWwgZm9yIFVURi0xNlxuXHRcdFx0Y29uc3QgaXNaZXJvQnl0ZSA9IChidWZmZXIucmVhZFVJbnQ4KGkpID09PSAwKTtcblxuXHRcdFx0aWYgKGlzWmVyb0J5dGUpIHtcblx0XHRcdFx0Y29udGFpbnNaZXJvQnl0ZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVURi0xNiBMRTogZXhwZWN0IGUuZy4gMHhBQSAweDAwXG5cdFx0XHRpZiAoY291bGRCZVVURjE2TEUgJiYgKGlzRW5kaWFuICYmICFpc1plcm9CeXRlIHx8ICFpc0VuZGlhbiAmJiBpc1plcm9CeXRlKSkge1xuXHRcdFx0XHRjb3VsZEJlVVRGMTZMRSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVVEYtMTYgQkU6IGV4cGVjdCBlLmcuIDB4MDAgMHhBQVxuXHRcdFx0aWYgKGNvdWxkQmVVVEYxNkJFICYmIChpc0VuZGlhbiAmJiBpc1plcm9CeXRlIHx8ICFpc0VuZGlhbiAmJiAhaXNaZXJvQnl0ZSkpIHtcblx0XHRcdFx0Y291bGRCZVVURjE2QkUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmV0dXJuIGlmIHRoaXMgaXMgbmVpdGhlciBVVEYxNi1MRSBub3IgVVRGMTYtQkUgYW5kIHRodXMgdHJlYXQgYXMgYmluYXJ5XG5cdFx0XHRpZiAoaXNaZXJvQnl0ZSAmJiAhY291bGRCZVVURjE2TEUgJiYgIWNvdWxkQmVVVEYxNkJFKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBjYXNlIG9mIDAtYnl0ZSBpbmNsdWRlZFxuXHRcdGlmIChjb250YWluc1plcm9CeXRlKSB7XG5cdFx0XHRpZiAoY291bGRCZVVURjE2TEUpIHtcblx0XHRcdFx0ZW5jb2RpbmcgPSBVVEYxNmxlO1xuXHRcdFx0fSBlbHNlIGlmIChjb3VsZEJlVVRGMTZCRSkge1xuXHRcdFx0XHRlbmNvZGluZyA9IFVURjE2YmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWVtc0JpbmFyeSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gQXV0byBndWVzcyBlbmNvZGluZyBpZiBjb25maWd1cmVkXG5cdGlmIChhdXRvR3Vlc3NFbmNvZGluZyAmJiAhc2VlbXNCaW5hcnkgJiYgIWVuY29kaW5nICYmIGJ1ZmZlcikge1xuXHRcdHJldHVybiBndWVzc0VuY29kaW5nQnlCdWZmZXIoYnVmZmVyLnNsaWNlKDAsIGJ5dGVzUmVhZCksIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzKS50aGVuKGd1ZXNzZWRFbmNvZGluZyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzZWVtc0JpbmFyeTogZmFsc2UsXG5cdFx0XHRcdGVuY29kaW5nOiBndWVzc2VkRW5jb2Rpbmdcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRyZXR1cm4geyBzZWVtc0JpbmFyeSwgZW5jb2RpbmcgfTtcbn1cblxudHlwZSBFbmNvZGluZ3NNYXAgPSB7IFtlbmNvZGluZzogc3RyaW5nXTogeyBsYWJlbExvbmc6IHN0cmluZzsgbGFiZWxTaG9ydDogc3RyaW5nOyBvcmRlcjogbnVtYmVyOyBlbmNvZGVPbmx5PzogYm9vbGVhbjsgYWxpYXM/OiBzdHJpbmc7IGd1ZXNzYWJsZU5hbWU/OiBzdHJpbmcgfSB9O1xuXG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0VOQ09ESU5HUzogRW5jb2RpbmdzTWFwID0ge1xuXHR1dGY4OiB7XG5cdFx0bGFiZWxMb25nOiAnVVRGLTgnLFxuXHRcdGxhYmVsU2hvcnQ6ICdVVEYtOCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0YWxpYXM6ICd1dGY4Ym9tJyxcblx0XHRndWVzc2FibGVOYW1lOiAnVVRGLTgnXG5cdH0sXG5cdHV0Zjhib206IHtcblx0XHRsYWJlbExvbmc6ICdVVEYtOCB3aXRoIEJPTScsXG5cdFx0bGFiZWxTaG9ydDogJ1VURi04IHdpdGggQk9NJyxcblx0XHRlbmNvZGVPbmx5OiB0cnVlLFxuXHRcdG9yZGVyOiAyLFxuXHRcdGFsaWFzOiAndXRmOCdcblx0fSxcblx0dXRmMTZsZToge1xuXHRcdGxhYmVsTG9uZzogJ1VURi0xNiBMRScsXG5cdFx0bGFiZWxTaG9ydDogJ1VURi0xNiBMRScsXG5cdFx0b3JkZXI6IDMsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ1VURi0xNkxFJ1xuXHR9LFxuXHR1dGYxNmJlOiB7XG5cdFx0bGFiZWxMb25nOiAnVVRGLTE2IEJFJyxcblx0XHRsYWJlbFNob3J0OiAnVVRGLTE2IEJFJyxcblx0XHRvcmRlcjogNCxcblx0XHRndWVzc2FibGVOYW1lOiAnVVRGLTE2QkUnXG5cdH0sXG5cdHdpbmRvd3MxMjUyOiB7XG5cdFx0bGFiZWxMb25nOiAnV2VzdGVybiAoV2luZG93cyAxMjUyKScsXG5cdFx0bGFiZWxTaG9ydDogJ1dpbmRvd3MgMTI1MicsXG5cdFx0b3JkZXI6IDUsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ3dpbmRvd3MtMTI1Midcblx0fSxcblx0aXNvODg1OTE6IHtcblx0XHRsYWJlbExvbmc6ICdXZXN0ZXJuIChJU08gODg1OS0xKScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTEnLFxuXHRcdG9yZGVyOiA2XG5cdH0sXG5cdGlzbzg4NTkzOiB7XG5cdFx0bGFiZWxMb25nOiAnV2VzdGVybiAoSVNPIDg4NTktMyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0zJyxcblx0XHRvcmRlcjogN1xuXHR9LFxuXHRpc284ODU5MTU6IHtcblx0XHRsYWJlbExvbmc6ICdXZXN0ZXJuIChJU08gODg1OS0xNSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0xNScsXG5cdFx0b3JkZXI6IDhcblx0fSxcblx0bWFjcm9tYW46IHtcblx0XHRsYWJlbExvbmc6ICdXZXN0ZXJuIChNYWMgUm9tYW4pJyxcblx0XHRsYWJlbFNob3J0OiAnTWFjIFJvbWFuJyxcblx0XHRvcmRlcjogOVxuXHR9LFxuXHRjcDQzNzoge1xuXHRcdGxhYmVsTG9uZzogJ0RPUyAoQ1AgNDM3KScsXG5cdFx0bGFiZWxTaG9ydDogJ0NQNDM3Jyxcblx0XHRvcmRlcjogMTBcblx0fSxcblx0d2luZG93czEyNTY6IHtcblx0XHRsYWJlbExvbmc6ICdBcmFiaWMgKFdpbmRvd3MgMTI1NiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDEyNTYnLFxuXHRcdG9yZGVyOiAxMVxuXHR9LFxuXHRpc284ODU5Njoge1xuXHRcdGxhYmVsTG9uZzogJ0FyYWJpYyAoSVNPIDg4NTktNiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS02Jyxcblx0XHRvcmRlcjogMTJcblx0fSxcblx0d2luZG93czEyNTc6IHtcblx0XHRsYWJlbExvbmc6ICdCYWx0aWMgKFdpbmRvd3MgMTI1NyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDEyNTcnLFxuXHRcdG9yZGVyOiAxM1xuXHR9LFxuXHRpc284ODU5NDoge1xuXHRcdGxhYmVsTG9uZzogJ0JhbHRpYyAoSVNPIDg4NTktNCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS00Jyxcblx0XHRvcmRlcjogMTRcblx0fSxcblx0aXNvODg1OTE0OiB7XG5cdFx0bGFiZWxMb25nOiAnQ2VsdGljIChJU08gODg1OS0xNCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0xNCcsXG5cdFx0b3JkZXI6IDE1XG5cdH0sXG5cdHdpbmRvd3MxMjUwOiB7XG5cdFx0bGFiZWxMb25nOiAnQ2VudHJhbCBFdXJvcGVhbiAoV2luZG93cyAxMjUwKScsXG5cdFx0bGFiZWxTaG9ydDogJ1dpbmRvd3MgMTI1MCcsXG5cdFx0b3JkZXI6IDE2LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICd3aW5kb3dzLTEyNTAnXG5cdH0sXG5cdGlzbzg4NTkyOiB7XG5cdFx0bGFiZWxMb25nOiAnQ2VudHJhbCBFdXJvcGVhbiAoSVNPIDg4NTktMiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0yJyxcblx0XHRvcmRlcjogMTcsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ0lTTy04ODU5LTInXG5cdH0sXG5cdGNwODUyOiB7XG5cdFx0bGFiZWxMb25nOiAnQ2VudHJhbCBFdXJvcGVhbiAoQ1AgODUyKScsXG5cdFx0bGFiZWxTaG9ydDogJ0NQIDg1MicsXG5cdFx0b3JkZXI6IDE4XG5cdH0sXG5cdHdpbmRvd3MxMjUxOiB7XG5cdFx0bGFiZWxMb25nOiAnQ3lyaWxsaWMgKFdpbmRvd3MgMTI1MSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDEyNTEnLFxuXHRcdG9yZGVyOiAxOSxcblx0XHRndWVzc2FibGVOYW1lOiAnd2luZG93cy0xMjUxJ1xuXHR9LFxuXHRjcDg2Njoge1xuXHRcdGxhYmVsTG9uZzogJ0N5cmlsbGljIChDUCA4NjYpJyxcblx0XHRsYWJlbFNob3J0OiAnQ1AgODY2Jyxcblx0XHRvcmRlcjogMjAsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ0lCTTg2Nidcblx0fSxcblx0Y3AxMTI1OiB7XG5cdFx0bGFiZWxMb25nOiAnQ3lyaWxsaWMgKENQIDExMjUpJyxcblx0XHRsYWJlbFNob3J0OiAnQ1AgMTEyNScsXG5cdFx0b3JkZXI6IDIxLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdJQk0xMTI1J1xuXHR9LFxuXHRpc284ODU5NToge1xuXHRcdGxhYmVsTG9uZzogJ0N5cmlsbGljIChJU08gODg1OS01KScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTUnLFxuXHRcdG9yZGVyOiAyMixcblx0XHRndWVzc2FibGVOYW1lOiAnSVNPLTg4NTktNSdcblx0fSxcblx0a29pOHI6IHtcblx0XHRsYWJlbExvbmc6ICdDeXJpbGxpYyAoS09JOC1SKScsXG5cdFx0bGFiZWxTaG9ydDogJ0tPSTgtUicsXG5cdFx0b3JkZXI6IDIzLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdLT0k4LVInXG5cdH0sXG5cdGtvaTh1OiB7XG5cdFx0bGFiZWxMb25nOiAnQ3lyaWxsaWMgKEtPSTgtVSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdLT0k4LVUnLFxuXHRcdG9yZGVyOiAyNFxuXHR9LFxuXHRpc284ODU5MTM6IHtcblx0XHRsYWJlbExvbmc6ICdFc3RvbmlhbiAoSVNPIDg4NTktMTMpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktMTMnLFxuXHRcdG9yZGVyOiAyNVxuXHR9LFxuXHR3aW5kb3dzMTI1Mzoge1xuXHRcdGxhYmVsTG9uZzogJ0dyZWVrIChXaW5kb3dzIDEyNTMpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjUzJyxcblx0XHRvcmRlcjogMjYsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ3dpbmRvd3MtMTI1Mydcblx0fSxcblx0aXNvODg1OTc6IHtcblx0XHRsYWJlbExvbmc6ICdHcmVlayAoSVNPIDg4NTktNyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS03Jyxcblx0XHRvcmRlcjogMjcsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ0lTTy04ODU5LTcnXG5cdH0sXG5cdHdpbmRvd3MxMjU1OiB7XG5cdFx0bGFiZWxMb25nOiAnSGVicmV3IChXaW5kb3dzIDEyNTUpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjU1Jyxcblx0XHRvcmRlcjogMjgsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ3dpbmRvd3MtMTI1NSdcblx0fSxcblx0aXNvODg1OTg6IHtcblx0XHRsYWJlbExvbmc6ICdIZWJyZXcgKElTTyA4ODU5LTgpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktOCcsXG5cdFx0b3JkZXI6IDI5LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdJU08tODg1OS04J1xuXHR9LFxuXHRpc284ODU5MTA6IHtcblx0XHRsYWJlbExvbmc6ICdOb3JkaWMgKElTTyA4ODU5LTEwKScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTEwJyxcblx0XHRvcmRlcjogMzBcblx0fSxcblx0aXNvODg1OTE2OiB7XG5cdFx0bGFiZWxMb25nOiAnUm9tYW5pYW4gKElTTyA4ODU5LTE2KScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTE2Jyxcblx0XHRvcmRlcjogMzFcblx0fSxcblx0d2luZG93czEyNTQ6IHtcblx0XHRsYWJlbExvbmc6ICdUdXJraXNoIChXaW5kb3dzIDEyNTQpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjU0Jyxcblx0XHRvcmRlcjogMzJcblx0fSxcblx0aXNvODg1OTk6IHtcblx0XHRsYWJlbExvbmc6ICdUdXJraXNoIChJU08gODg1OS05KScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTknLFxuXHRcdG9yZGVyOiAzM1xuXHR9LFxuXHRjcDg1Nzoge1xuXHRcdGxhYmVsTG9uZzogJ1R1cmtpc2ggKENQIDg1NyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdDUCA4NTcnLFxuXHRcdG9yZGVyOiAzNFxuXHR9LFxuXHR3aW5kb3dzMTI1ODoge1xuXHRcdGxhYmVsTG9uZzogJ1ZpZXRuYW1lc2UgKFdpbmRvd3MgMTI1OCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDEyNTgnLFxuXHRcdG9yZGVyOiAzNVxuXHR9LFxuXHRnYms6IHtcblx0XHRsYWJlbExvbmc6ICdTaW1wbGlmaWVkIENoaW5lc2UgKEdCSyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdHQksnLFxuXHRcdG9yZGVyOiAzNlxuXHR9LFxuXHRnYjE4MDMwOiB7XG5cdFx0bGFiZWxMb25nOiAnU2ltcGxpZmllZCBDaGluZXNlIChHQjE4MDMwKScsXG5cdFx0bGFiZWxTaG9ydDogJ0dCMTgwMzAnLFxuXHRcdG9yZGVyOiAzN1xuXHR9LFxuXHRjcDk1MDoge1xuXHRcdGxhYmVsTG9uZzogJ1RyYWRpdGlvbmFsIENoaW5lc2UgKEJpZzUpJyxcblx0XHRsYWJlbFNob3J0OiAnQmlnNScsXG5cdFx0b3JkZXI6IDM4LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdCaWc1J1xuXHR9LFxuXHRiaWc1aGtzY3M6IHtcblx0XHRsYWJlbExvbmc6ICdUcmFkaXRpb25hbCBDaGluZXNlIChCaWc1LUhLU0NTKScsXG5cdFx0bGFiZWxTaG9ydDogJ0JpZzUtSEtTQ1MnLFxuXHRcdG9yZGVyOiAzOVxuXHR9LFxuXHRzaGlmdGppczoge1xuXHRcdGxhYmVsTG9uZzogJ0phcGFuZXNlIChTaGlmdCBKSVMpJyxcblx0XHRsYWJlbFNob3J0OiAnU2hpZnQgSklTJyxcblx0XHRvcmRlcjogNDAsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ1NISUZUX0pJUydcblx0fSxcblx0ZXVjanA6IHtcblx0XHRsYWJlbExvbmc6ICdKYXBhbmVzZSAoRVVDLUpQKScsXG5cdFx0bGFiZWxTaG9ydDogJ0VVQy1KUCcsXG5cdFx0b3JkZXI6IDQxLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdFVUMtSlAnXG5cdH0sXG5cdGV1Y2tyOiB7XG5cdFx0bGFiZWxMb25nOiAnS29yZWFuIChFVUMtS1IpJyxcblx0XHRsYWJlbFNob3J0OiAnRVVDLUtSJyxcblx0XHRvcmRlcjogNDIsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ0VVQy1LUidcblx0fSxcblx0d2luZG93czg3NDoge1xuXHRcdGxhYmVsTG9uZzogJ1RoYWkgKFdpbmRvd3MgODc0KScsXG5cdFx0bGFiZWxTaG9ydDogJ1dpbmRvd3MgODc0Jyxcblx0XHRvcmRlcjogNDNcblx0fSxcblx0aXNvODg1OTExOiB7XG5cdFx0bGFiZWxMb25nOiAnTGF0aW4vVGhhaSAoSVNPIDg4NTktMTEpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktMTEnLFxuXHRcdG9yZGVyOiA0NFxuXHR9LFxuXHRrb2k4cnU6IHtcblx0XHRsYWJlbExvbmc6ICdDeXJpbGxpYyAoS09JOC1SVSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdLT0k4LVJVJyxcblx0XHRvcmRlcjogNDVcblx0fSxcblx0a29pOHQ6IHtcblx0XHRsYWJlbExvbmc6ICdUYWppayAoS09JOC1UKScsXG5cdFx0bGFiZWxTaG9ydDogJ0tPSTgtVCcsXG5cdFx0b3JkZXI6IDQ2XG5cdH0sXG5cdGdiMjMxMjoge1xuXHRcdGxhYmVsTG9uZzogJ1NpbXBsaWZpZWQgQ2hpbmVzZSAoR0IgMjMxMiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdHQiAyMzEyJyxcblx0XHRvcmRlcjogNDcsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ0dCMjMxMidcblx0fSxcblx0Y3A4NjU6IHtcblx0XHRsYWJlbExvbmc6ICdOb3JkaWMgRE9TIChDUCA4NjUpJyxcblx0XHRsYWJlbFNob3J0OiAnQ1AgODY1Jyxcblx0XHRvcmRlcjogNDhcblx0fSxcblx0Y3A4NTA6IHtcblx0XHRsYWJlbExvbmc6ICdXZXN0ZXJuIEV1cm9wZWFuIERPUyAoQ1AgODUwKScsXG5cdFx0bGFiZWxTaG9ydDogJ0NQIDg1MCcsXG5cdFx0b3JkZXI6IDQ5XG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBHVUVTU0FCTEVfRU5DT0RJTkdTOiBFbmNvZGluZ3NNYXAgPSAoKCkgPT4ge1xuXHRjb25zdCBndWVzc2FibGVFbmNvZGluZ3M6IEVuY29kaW5nc01hcCA9IHt9O1xuXHRmb3IgKGNvbnN0IGVuY29kaW5nIGluIFNVUFBPUlRFRF9FTkNPRElOR1MpIHtcblx0XHRpZiAoU1VQUE9SVEVEX0VOQ09ESU5HU1tlbmNvZGluZ10uZ3Vlc3NhYmxlTmFtZSkge1xuXHRcdFx0Z3Vlc3NhYmxlRW5jb2RpbmdzW2VuY29kaW5nXSA9IFNVUFBPUlRFRF9FTkNPRElOR1NbZW5jb2RpbmddO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBndWVzc2FibGVFbmNvZGluZ3M7XG59KSgpO1xuIl0sCiAgIm1hcHBp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LElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ04sV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxNQUFNLHVCQUFxQyxNQUFNO0FBQ3ZELFFBQU0scUJBQW1DLENBQUM7QUFDMUMsYUFBVyxZQUFZLHFCQUFxQjtBQUMzQyxRQUFJLG9CQUFvQixRQUFRLEVBQUUsZUFBZTtBQUNoRCx5QkFBbUIsUUFBUSxJQUFJLG9CQUFvQixRQUFRO0FBQUEsSUFDNUQ7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSLEdBQUc7IiwKICAibmFtZXMiOiBbIkRlY29kZVN0cmVhbUVycm9yS2luZCJdCn0K
