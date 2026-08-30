import { Lazy } from "./lazy.js";
import * as streams from "./stream.js";
const hasBuffer = typeof Buffer !== "undefined";
const indexOfTable = new Lazy(() => new Uint8Array(256));
let textEncoder;
let textDecoder;
class VSBuffer {
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static alloc(byteLength) {
    if (hasBuffer) {
      return new VSBuffer(Buffer.allocUnsafe(byteLength));
    } else {
      return new VSBuffer(new Uint8Array(byteLength));
    }
  }
  /**
   * When running in a nodejs context, if `actual` is not a nodejs Buffer, the backing store for
   * the returned `VSBuffer` instance might use a nodejs Buffer allocated from node's Buffer pool,
   * which is not transferrable.
   */
  static wrap(actual) {
    if (hasBuffer && !Buffer.isBuffer(actual)) {
      actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
    }
    return new VSBuffer(actual);
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static fromString(source, options) {
    const dontUseNodeBuffer = options?.dontUseNodeBuffer || false;
    if (!dontUseNodeBuffer && hasBuffer) {
      return new VSBuffer(Buffer.from(source));
    } else {
      if (!textEncoder) {
        textEncoder = new TextEncoder();
      }
      return new VSBuffer(textEncoder.encode(source));
    }
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static fromByteArray(source) {
    const result = VSBuffer.alloc(source.length);
    for (let i = 0, len = source.length; i < len; i++) {
      result.buffer[i] = source[i];
    }
    return result;
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static concat(buffers, totalLength) {
    if (typeof totalLength === "undefined") {
      totalLength = 0;
      for (let i = 0, len = buffers.length; i < len; i++) {
        totalLength += buffers[i].byteLength;
      }
    }
    const ret = VSBuffer.alloc(totalLength);
    let offset = 0;
    for (let i = 0, len = buffers.length; i < len; i++) {
      const element = buffers[i];
      ret.set(element, offset);
      offset += element.byteLength;
    }
    return ret;
  }
  static isNativeBuffer(buffer) {
    return hasBuffer && Buffer.isBuffer(buffer);
  }
  constructor(buffer) {
    this.buffer = buffer;
    this.byteLength = this.buffer.byteLength;
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  clone() {
    const result = VSBuffer.alloc(this.byteLength);
    result.set(this);
    return result;
  }
  toString() {
    if (hasBuffer) {
      return this.buffer.toString();
    } else {
      if (!textDecoder) {
        textDecoder = new TextDecoder(void 0, { ignoreBOM: true });
      }
      return textDecoder.decode(this.buffer);
    }
  }
  slice(start, end) {
    return new VSBuffer(this.buffer.subarray(start, end));
  }
  set(array, offset) {
    if (array instanceof VSBuffer) {
      this.buffer.set(array.buffer, offset);
    } else if (array instanceof Uint8Array) {
      this.buffer.set(array, offset);
    } else if (array instanceof ArrayBuffer) {
      this.buffer.set(new Uint8Array(array), offset);
    } else if (ArrayBuffer.isView(array)) {
      this.buffer.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    } else {
      throw new Error(`Unknown argument 'array'`);
    }
  }
  readUInt32BE(offset) {
    return readUInt32BE(this.buffer, offset);
  }
  writeUInt32BE(value, offset) {
    writeUInt32BE(this.buffer, value, offset);
  }
  readUInt32LE(offset) {
    return readUInt32LE(this.buffer, offset);
  }
  writeUInt32LE(value, offset) {
    writeUInt32LE(this.buffer, value, offset);
  }
  readUInt8(offset) {
    return readUInt8(this.buffer, offset);
  }
  writeUInt8(value, offset) {
    writeUInt8(this.buffer, value, offset);
  }
  indexOf(subarray, offset = 0) {
    return binaryIndexOf(this.buffer, subarray instanceof VSBuffer ? subarray.buffer : subarray, offset);
  }
  equals(other) {
    if (this === other) {
      return true;
    }
    if (this.byteLength !== other.byteLength) {
      return false;
    }
    return this.buffer.every((value, index) => value === other.buffer[index]);
  }
}
function binaryIndexOf(haystack, needle, offset = 0) {
  const needleLen = needle.byteLength;
  const haystackLen = haystack.byteLength;
  if (needleLen === 0) {
    return 0;
  }
  if (needleLen === 1) {
    return haystack.indexOf(needle[0], offset);
  }
  if (needleLen > haystackLen - offset) {
    return -1;
  }
  const table = indexOfTable.value;
  table.fill(needle.length);
  for (let i2 = 0; i2 < needle.length; i2++) {
    table[needle[i2]] = needle.length - i2 - 1;
  }
  let i = offset + needle.length - 1;
  let j = i;
  let result = -1;
  while (i < haystackLen) {
    if (haystack[i] === needle[j]) {
      if (j === 0) {
        result = i;
        break;
      }
      i--;
      j--;
    } else {
      i += Math.max(needle.length - j, table[haystack[i]]);
      j = needle.length - 1;
    }
  }
  return result;
}
function readUInt16LE(source, offset) {
  return source[offset + 0] << 0 >>> 0 | source[offset + 1] << 8 >>> 0;
}
function writeUInt16LE(destination, value, offset) {
  destination[offset + 0] = value & 255;
  value = value >>> 8;
  destination[offset + 1] = value & 255;
}
function readUInt32BE(source, offset) {
  return source[offset] * 2 ** 24 + source[offset + 1] * 2 ** 16 + source[offset + 2] * 2 ** 8 + source[offset + 3];
}
function writeUInt32BE(destination, value, offset) {
  destination[offset + 3] = value;
  value = value >>> 8;
  destination[offset + 2] = value;
  value = value >>> 8;
  destination[offset + 1] = value;
  value = value >>> 8;
  destination[offset] = value;
}
function readUInt32LE(source, offset) {
  return source[offset + 0] << 0 >>> 0 | source[offset + 1] << 8 >>> 0 | source[offset + 2] << 16 >>> 0 | source[offset + 3] << 24 >>> 0;
}
function writeUInt32LE(destination, value, offset) {
  destination[offset + 0] = value & 255;
  value = value >>> 8;
  destination[offset + 1] = value & 255;
  value = value >>> 8;
  destination[offset + 2] = value & 255;
  value = value >>> 8;
  destination[offset + 3] = value & 255;
}
function readUInt8(source, offset) {
  return source[offset];
}
function writeUInt8(destination, value, offset) {
  destination[offset] = value;
}
function readableToBuffer(readable) {
  return streams.consumeReadable(readable, (chunks) => VSBuffer.concat(chunks));
}
function bufferToReadable(buffer) {
  return streams.toReadable(buffer);
}
function streamToBuffer(stream) {
  return streams.consumeStream(stream, (chunks) => VSBuffer.concat(chunks));
}
async function bufferedStreamToBuffer(bufferedStream) {
  if (bufferedStream.ended) {
    return VSBuffer.concat(bufferedStream.buffer);
  }
  return VSBuffer.concat([
    // Include already read chunks...
    ...bufferedStream.buffer,
    // ...and all additional chunks
    await streamToBuffer(bufferedStream.stream)
  ]);
}
function bufferToStream(buffer) {
  return streams.toStream(buffer, (chunks) => VSBuffer.concat(chunks));
}
function streamToBufferReadableStream(stream) {
  return streams.transform(stream, { data: (data) => typeof data === "string" ? VSBuffer.fromString(data) : VSBuffer.wrap(data) }, (chunks) => VSBuffer.concat(chunks));
}
function newWriteableBufferStream(options) {
  return streams.newWriteableStream((chunks) => VSBuffer.concat(chunks), options);
}
function prefixedBufferReadable(prefix, readable) {
  return streams.prefixedReadable(prefix, readable, (chunks) => VSBuffer.concat(chunks));
}
function prefixedBufferStream(prefix, stream) {
  return streams.prefixedStream(prefix, stream, (chunks) => VSBuffer.concat(chunks));
}
function decodeBase64(encoded) {
  let building = 0;
  let remainder = 0;
  let bufi = 0;
  const buffer = new Uint8Array(Math.floor(encoded.length / 4 * 3));
  const append = (value) => {
    switch (remainder) {
      case 3:
        buffer[bufi++] = building | value;
        remainder = 0;
        break;
      case 2:
        buffer[bufi++] = building | value >>> 2;
        building = value << 6;
        remainder = 3;
        break;
      case 1:
        buffer[bufi++] = building | value >>> 4;
        building = value << 4;
        remainder = 2;
        break;
      default:
        building = value << 2;
        remainder = 1;
    }
  };
  for (let i = 0; i < encoded.length; i++) {
    const code = encoded.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      append(code - 65);
    } else if (code >= 97 && code <= 122) {
      append(code - 97 + 26);
    } else if (code >= 48 && code <= 57) {
      append(code - 48 + 52);
    } else if (code === 43 || code === 45) {
      append(62);
    } else if (code === 47 || code === 95) {
      append(63);
    } else if (code === 61) {
      break;
    } else {
      throw new SyntaxError(`Unexpected base64 character ${encoded[i]}`);
    }
  }
  const unpadded = bufi;
  while (remainder > 0) {
    append(0);
  }
  return VSBuffer.wrap(buffer).slice(0, unpadded);
}
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64UrlSafeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeBase64({ buffer }, padded = true, urlSafe = false) {
  const dictionary = urlSafe ? base64UrlSafeAlphabet : base64Alphabet;
  let output = "";
  const remainder = buffer.byteLength % 3;
  let i = 0;
  for (; i < buffer.byteLength - remainder; i += 3) {
    const a = buffer[i + 0];
    const b = buffer[i + 1];
    const c = buffer[i + 2];
    output += dictionary[a >>> 2];
    output += dictionary[(a << 4 | b >>> 4) & 63];
    output += dictionary[(b << 2 | c >>> 6) & 63];
    output += dictionary[c & 63];
  }
  if (remainder === 1) {
    const a = buffer[i + 0];
    output += dictionary[a >>> 2];
    output += dictionary[a << 4 & 63];
    if (padded) {
      output += "==";
    }
  } else if (remainder === 2) {
    const a = buffer[i + 0];
    const b = buffer[i + 1];
    output += dictionary[a >>> 2];
    output += dictionary[(a << 4 | b >>> 4) & 63];
    output += dictionary[b << 2 & 63];
    if (padded) {
      output += "=";
    }
  }
  return output;
}
const hexChars = "0123456789abcdef";
function encodeHex({ buffer }) {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    result += hexChars[byte >>> 4];
    result += hexChars[byte & 15];
  }
  return result;
}
function decodeHex(hex) {
  if (hex.length % 2 !== 0) {
    throw new SyntaxError("Hex string must have an even length");
  }
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < hex.length; ) {
    out[i >> 1] = decodeHexChar(hex, i++) << 4 | decodeHexChar(hex, i++);
  }
  return VSBuffer.wrap(out);
}
function decodeHexChar(str, position) {
  const s = str.charCodeAt(position);
  if (s >= 48 && s <= 57) {
    return s - 48;
  } else if (s >= 97 && s <= 102) {
    return s - 87;
  } else if (s >= 65 && s <= 70) {
    return s - 55;
  } else {
    throw new SyntaxError(`Invalid hex character at position ${position}`);
  }
}
export {
  VSBuffer,
  binaryIndexOf,
  bufferToReadable,
  bufferToStream,
  bufferedStreamToBuffer,
  decodeBase64,
  decodeHex,
  encodeBase64,
  encodeHex,
  newWriteableBufferStream,
  prefixedBufferReadable,
  prefixedBufferStream,
  readUInt16LE,
  readUInt32BE,
  readUInt32LE,
  readUInt8,
  readableToBuffer,
  streamToBuffer,
  streamToBufferReadableStream,
  writeUInt16LE,
  writeUInt32BE,
  writeUInt32LE,
  writeUInt8
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGJ1ZmZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IExhenkgfSBmcm9tICcuL2xhenkuanMnO1xuaW1wb3J0ICogYXMgc3RyZWFtcyBmcm9tICcuL3N0cmVhbS5qcyc7XG5cbmludGVyZmFjZSBOb2RlQnVmZmVyIHtcblx0YWxsb2NVbnNhZmUoc2l6ZTogbnVtYmVyKTogVWludDhBcnJheTtcblx0aXNCdWZmZXIob2JqOiB1bmtub3duKTogb2JqIGlzIE5vZGVCdWZmZXI7XG5cdGZyb20oYXJyYXlCdWZmZXI6IEFycmF5QnVmZmVyTGlrZSwgYnl0ZU9mZnNldD86IG51bWJlciwgbGVuZ3RoPzogbnVtYmVyKTogVWludDhBcnJheTtcblx0ZnJvbShkYXRhOiBzdHJpbmcpOiBVaW50OEFycmF5O1xufVxuXG5kZWNsYXJlIGNvbnN0IEJ1ZmZlcjogTm9kZUJ1ZmZlcjtcblxuY29uc3QgaGFzQnVmZmVyID0gKHR5cGVvZiBCdWZmZXIgIT09ICd1bmRlZmluZWQnKTtcbmNvbnN0IGluZGV4T2ZUYWJsZSA9IG5ldyBMYXp5KCgpID0+IG5ldyBVaW50OEFycmF5KDI1NikpO1xuXG5sZXQgdGV4dEVuY29kZXI6IHsgZW5jb2RlOiAoaW5wdXQ6IHN0cmluZykgPT4gVWludDhBcnJheSB9IHwgbnVsbDtcbmxldCB0ZXh0RGVjb2RlcjogeyBkZWNvZGU6IChpbnB1dDogVWludDhBcnJheSkgPT4gc3RyaW5nIH0gfCBudWxsO1xuXG5leHBvcnQgY2xhc3MgVlNCdWZmZXIge1xuXG5cdC8qKlxuXHQgKiBXaGVuIHJ1bm5pbmcgaW4gYSBub2RlanMgY29udGV4dCwgdGhlIGJhY2tpbmcgc3RvcmUgZm9yIHRoZSByZXR1cm5lZCBgVlNCdWZmZXJgIGluc3RhbmNlXG5cdCAqIG1pZ2h0IHVzZSBhIG5vZGVqcyBCdWZmZXIgYWxsb2NhdGVkIGZyb20gbm9kZSdzIEJ1ZmZlciBwb29sLCB3aGljaCBpcyBub3QgdHJhbnNmZXJyYWJsZS5cblx0ICovXG5cdHN0YXRpYyBhbGxvYyhieXRlTGVuZ3RoOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0aWYgKGhhc0J1ZmZlcikge1xuXHRcdFx0cmV0dXJuIG5ldyBWU0J1ZmZlcihCdWZmZXIuYWxsb2NVbnNhZmUoYnl0ZUxlbmd0aCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmV3IFZTQnVmZmVyKG5ldyBVaW50OEFycmF5KGJ5dGVMZW5ndGgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiBydW5uaW5nIGluIGEgbm9kZWpzIGNvbnRleHQsIGlmIGBhY3R1YWxgIGlzIG5vdCBhIG5vZGVqcyBCdWZmZXIsIHRoZSBiYWNraW5nIHN0b3JlIGZvclxuXHQgKiB0aGUgcmV0dXJuZWQgYFZTQnVmZmVyYCBpbnN0YW5jZSBtaWdodCB1c2UgYSBub2RlanMgQnVmZmVyIGFsbG9jYXRlZCBmcm9tIG5vZGUncyBCdWZmZXIgcG9vbCxcblx0ICogd2hpY2ggaXMgbm90IHRyYW5zZmVycmFibGUuXG5cdCAqL1xuXHRzdGF0aWMgd3JhcChhY3R1YWw6IFVpbnQ4QXJyYXkpOiBWU0J1ZmZlciB7XG5cdFx0aWYgKGhhc0J1ZmZlciAmJiAhKEJ1ZmZlci5pc0J1ZmZlcihhY3R1YWwpKSkge1xuXHRcdFx0Ly8gaHR0cHM6Ly9ub2RlanMub3JnL2Rpc3QvbGF0ZXN0LXYxMC54L2RvY3MvYXBpL2J1ZmZlci5odG1sI2J1ZmZlcl9jbGFzc19tZXRob2RfYnVmZmVyX2Zyb21fYXJyYXlidWZmZXJfYnl0ZW9mZnNldF9sZW5ndGhcblx0XHRcdC8vIENyZWF0ZSBhIHplcm8tY29weSBCdWZmZXIgd3JhcHBlciBhcm91bmQgdGhlIEFycmF5QnVmZmVyIHBvaW50ZWQgdG8gYnkgdGhlIFVpbnQ4QXJyYXlcblx0XHRcdGFjdHVhbCA9IEJ1ZmZlci5mcm9tKGFjdHVhbC5idWZmZXIsIGFjdHVhbC5ieXRlT2Zmc2V0LCBhY3R1YWwuYnl0ZUxlbmd0aCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVlNCdWZmZXIoYWN0dWFsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGVuIHJ1bm5pbmcgaW4gYSBub2RlanMgY29udGV4dCwgdGhlIGJhY2tpbmcgc3RvcmUgZm9yIHRoZSByZXR1cm5lZCBgVlNCdWZmZXJgIGluc3RhbmNlXG5cdCAqIG1pZ2h0IHVzZSBhIG5vZGVqcyBCdWZmZXIgYWxsb2NhdGVkIGZyb20gbm9kZSdzIEJ1ZmZlciBwb29sLCB3aGljaCBpcyBub3QgdHJhbnNmZXJyYWJsZS5cblx0ICovXG5cdHN0YXRpYyBmcm9tU3RyaW5nKHNvdXJjZTogc3RyaW5nLCBvcHRpb25zPzogeyBkb250VXNlTm9kZUJ1ZmZlcj86IGJvb2xlYW4gfSk6IFZTQnVmZmVyIHtcblx0XHRjb25zdCBkb250VXNlTm9kZUJ1ZmZlciA9IG9wdGlvbnM/LmRvbnRVc2VOb2RlQnVmZmVyIHx8IGZhbHNlO1xuXHRcdGlmICghZG9udFVzZU5vZGVCdWZmZXIgJiYgaGFzQnVmZmVyKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFZTQnVmZmVyKEJ1ZmZlci5mcm9tKHNvdXJjZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRleHRFbmNvZGVyKSB7XG5cdFx0XHRcdHRleHRFbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IFZTQnVmZmVyKHRleHRFbmNvZGVyLmVuY29kZShzb3VyY2UpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiBydW5uaW5nIGluIGEgbm9kZWpzIGNvbnRleHQsIHRoZSBiYWNraW5nIHN0b3JlIGZvciB0aGUgcmV0dXJuZWQgYFZTQnVmZmVyYCBpbnN0YW5jZVxuXHQgKiBtaWdodCB1c2UgYSBub2RlanMgQnVmZmVyIGFsbG9jYXRlZCBmcm9tIG5vZGUncyBCdWZmZXIgcG9vbCwgd2hpY2ggaXMgbm90IHRyYW5zZmVycmFibGUuXG5cdCAqL1xuXHRzdGF0aWMgZnJvbUJ5dGVBcnJheShzb3VyY2U6IG51bWJlcltdKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IFZTQnVmZmVyLmFsbG9jKHNvdXJjZS5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb3VyY2UubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJlc3VsdC5idWZmZXJbaV0gPSBzb3VyY2VbaV07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiBydW5uaW5nIGluIGEgbm9kZWpzIGNvbnRleHQsIHRoZSBiYWNraW5nIHN0b3JlIGZvciB0aGUgcmV0dXJuZWQgYFZTQnVmZmVyYCBpbnN0YW5jZVxuXHQgKiBtaWdodCB1c2UgYSBub2RlanMgQnVmZmVyIGFsbG9jYXRlZCBmcm9tIG5vZGUncyBCdWZmZXIgcG9vbCwgd2hpY2ggaXMgbm90IHRyYW5zZmVycmFibGUuXG5cdCAqL1xuXHRzdGF0aWMgY29uY2F0KGJ1ZmZlcnM6IFZTQnVmZmVyW10sIHRvdGFsTGVuZ3RoPzogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRcdGlmICh0eXBlb2YgdG90YWxMZW5ndGggPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0b3RhbExlbmd0aCA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYnVmZmVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHR0b3RhbExlbmd0aCArPSBidWZmZXJzW2ldLmJ5dGVMZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV0ID0gVlNCdWZmZXIuYWxsb2ModG90YWxMZW5ndGgpO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBidWZmZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gYnVmZmVyc1tpXTtcblx0XHRcdHJldC5zZXQoZWxlbWVudCwgb2Zmc2V0KTtcblx0XHRcdG9mZnNldCArPSBlbGVtZW50LmJ5dGVMZW5ndGg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHN0YXRpYyBpc05hdGl2ZUJ1ZmZlcihidWZmZXI6IHVua25vd24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaGFzQnVmZmVyICYmIEJ1ZmZlci5pc0J1ZmZlcihidWZmZXIpO1xuXHR9XG5cblx0cmVhZG9ubHkgYnVmZmVyOiBVaW50OEFycmF5O1xuXHRyZWFkb25seSBieXRlTGVuZ3RoOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihidWZmZXI6IFVpbnQ4QXJyYXkpIHtcblx0XHR0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcblx0XHR0aGlzLmJ5dGVMZW5ndGggPSB0aGlzLmJ1ZmZlci5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZW4gcnVubmluZyBpbiBhIG5vZGVqcyBjb250ZXh0LCB0aGUgYmFja2luZyBzdG9yZSBmb3IgdGhlIHJldHVybmVkIGBWU0J1ZmZlcmAgaW5zdGFuY2Vcblx0ICogbWlnaHQgdXNlIGEgbm9kZWpzIEJ1ZmZlciBhbGxvY2F0ZWQgZnJvbSBub2RlJ3MgQnVmZmVyIHBvb2wsIHdoaWNoIGlzIG5vdCB0cmFuc2ZlcnJhYmxlLlxuXHQgKi9cblx0Y2xvbmUoKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IFZTQnVmZmVyLmFsbG9jKHRoaXMuYnl0ZUxlbmd0aCk7XG5cdFx0cmVzdWx0LnNldCh0aGlzKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRpZiAoaGFzQnVmZmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5idWZmZXIudG9TdHJpbmcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCF0ZXh0RGVjb2Rlcikge1xuXHRcdFx0XHR0ZXh0RGVjb2RlciA9IG5ldyBUZXh0RGVjb2Rlcih1bmRlZmluZWQsIHsgaWdub3JlQk9NOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRleHREZWNvZGVyLmRlY29kZSh0aGlzLmJ1ZmZlcik7XG5cdFx0fVxuXHR9XG5cblx0c2xpY2Uoc3RhcnQ/OiBudW1iZXIsIGVuZD86IG51bWJlcik6IFZTQnVmZmVyIHtcblx0XHQvLyBJTVBPUlRBTlQ6IHVzZSBzdWJhcnJheSBpbnN0ZWFkIG9mIHNsaWNlIGJlY2F1c2UgVHlwZWRBcnJheSNzbGljZVxuXHRcdC8vIGNyZWF0ZXMgc2hhbGxvdyBjb3B5IGFuZCBOb2RlQnVmZmVyI3NsaWNlIGRvZXNuJ3QuIFRoZSB1c2Ugb2Ygc3ViYXJyYXlcblx0XHQvLyBlbnN1cmVzIHRoZSBzYW1lLCBwZXJmb3JtYW5jZSwgYmVoYXZpb3VyLlxuXHRcdHJldHVybiBuZXcgVlNCdWZmZXIodGhpcy5idWZmZXIuc3ViYXJyYXkoc3RhcnQsIGVuZCkpO1xuXHR9XG5cblx0c2V0KGFycmF5OiBWU0J1ZmZlciwgb2Zmc2V0PzogbnVtYmVyKTogdm9pZDtcblx0c2V0KGFycmF5OiBVaW50OEFycmF5LCBvZmZzZXQ/OiBudW1iZXIpOiB2b2lkO1xuXHRzZXQoYXJyYXk6IEFycmF5QnVmZmVyLCBvZmZzZXQ/OiBudW1iZXIpOiB2b2lkO1xuXHRzZXQoYXJyYXk6IEFycmF5QnVmZmVyVmlldywgb2Zmc2V0PzogbnVtYmVyKTogdm9pZDtcblx0c2V0KGFycmF5OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldywgb2Zmc2V0PzogbnVtYmVyKTogdm9pZDtcblx0c2V0KGFycmF5OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldywgb2Zmc2V0PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGFycmF5IGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdHRoaXMuYnVmZmVyLnNldChhcnJheS5idWZmZXIsIG9mZnNldCk7XG5cdFx0fSBlbHNlIGlmIChhcnJheSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcblx0XHRcdHRoaXMuYnVmZmVyLnNldChhcnJheSwgb2Zmc2V0KTtcblx0XHR9IGVsc2UgaWYgKGFycmF5IGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcblx0XHRcdHRoaXMuYnVmZmVyLnNldChuZXcgVWludDhBcnJheShhcnJheSksIG9mZnNldCk7XG5cdFx0fSBlbHNlIGlmIChBcnJheUJ1ZmZlci5pc1ZpZXcoYXJyYXkpKSB7XG5cdFx0XHR0aGlzLmJ1ZmZlci5zZXQobmV3IFVpbnQ4QXJyYXkoYXJyYXkuYnVmZmVyLCBhcnJheS5ieXRlT2Zmc2V0LCBhcnJheS5ieXRlTGVuZ3RoKSwgb2Zmc2V0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGFyZ3VtZW50ICdhcnJheSdgKTtcblx0XHR9XG5cdH1cblxuXHRyZWFkVUludDMyQkUob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiByZWFkVUludDMyQkUodGhpcy5idWZmZXIsIG9mZnNldCk7XG5cdH1cblxuXHR3cml0ZVVJbnQzMkJFKHZhbHVlOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0d3JpdGVVSW50MzJCRSh0aGlzLmJ1ZmZlciwgdmFsdWUsIG9mZnNldCk7XG5cdH1cblxuXHRyZWFkVUludDMyTEUob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiByZWFkVUludDMyTEUodGhpcy5idWZmZXIsIG9mZnNldCk7XG5cdH1cblxuXHR3cml0ZVVJbnQzMkxFKHZhbHVlOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0d3JpdGVVSW50MzJMRSh0aGlzLmJ1ZmZlciwgdmFsdWUsIG9mZnNldCk7XG5cdH1cblxuXHRyZWFkVUludDgob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiByZWFkVUludDgodGhpcy5idWZmZXIsIG9mZnNldCk7XG5cdH1cblxuXHR3cml0ZVVJbnQ4KHZhbHVlOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0d3JpdGVVSW50OCh0aGlzLmJ1ZmZlciwgdmFsdWUsIG9mZnNldCk7XG5cdH1cblxuXHRpbmRleE9mKHN1YmFycmF5OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXksIG9mZnNldCA9IDApIHtcblx0XHRyZXR1cm4gYmluYXJ5SW5kZXhPZih0aGlzLmJ1ZmZlciwgc3ViYXJyYXkgaW5zdGFuY2VvZiBWU0J1ZmZlciA/IHN1YmFycmF5LmJ1ZmZlciA6IHN1YmFycmF5LCBvZmZzZXQpO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBWU0J1ZmZlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzID09PSBvdGhlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYnl0ZUxlbmd0aCAhPT0gb3RoZXIuYnl0ZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmJ1ZmZlci5ldmVyeSgodmFsdWUsIGluZGV4KSA9PiB2YWx1ZSA9PT0gb3RoZXIuYnVmZmVyW2luZGV4XSk7XG5cdH1cbn1cblxuLyoqXG4gKiBMaWtlIFN0cmluZy5pbmRleE9mLCBidXQgd29ya3Mgb24gVWludDhBcnJheXMuXG4gKiBVc2VzIHRoZSBib3llci1tb29yZS1ob3JzcG9vbCBhbGdvcml0aG0gdG8gYmUgcmVhc29uYWJseSBzcGVlZHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5hcnlJbmRleE9mKGhheXN0YWNrOiBVaW50OEFycmF5LCBuZWVkbGU6IFVpbnQ4QXJyYXksIG9mZnNldCA9IDApOiBudW1iZXIge1xuXHRjb25zdCBuZWVkbGVMZW4gPSBuZWVkbGUuYnl0ZUxlbmd0aDtcblx0Y29uc3QgaGF5c3RhY2tMZW4gPSBoYXlzdGFjay5ieXRlTGVuZ3RoO1xuXG5cdGlmIChuZWVkbGVMZW4gPT09IDApIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdGlmIChuZWVkbGVMZW4gPT09IDEpIHtcblx0XHRyZXR1cm4gaGF5c3RhY2suaW5kZXhPZihuZWVkbGVbMF0sIG9mZnNldCk7XG5cdH1cblxuXHRpZiAobmVlZGxlTGVuID4gaGF5c3RhY2tMZW4gLSBvZmZzZXQpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHQvLyBmaW5kIGluZGV4IG9mIHRoZSBzdWJhcnJheSB1c2luZyBib3llci1tb29yZS1ob3JzcG9vbCBhbGdvcml0aG1cblx0Y29uc3QgdGFibGUgPSBpbmRleE9mVGFibGUudmFsdWU7XG5cdHRhYmxlLmZpbGwobmVlZGxlLmxlbmd0aCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbmVlZGxlLmxlbmd0aDsgaSsrKSB7XG5cdFx0dGFibGVbbmVlZGxlW2ldXSA9IG5lZWRsZS5sZW5ndGggLSBpIC0gMTtcblx0fVxuXG5cdGxldCBpID0gb2Zmc2V0ICsgbmVlZGxlLmxlbmd0aCAtIDE7XG5cdGxldCBqID0gaTtcblx0bGV0IHJlc3VsdCA9IC0xO1xuXHR3aGlsZSAoaSA8IGhheXN0YWNrTGVuKSB7XG5cdFx0aWYgKGhheXN0YWNrW2ldID09PSBuZWVkbGVbal0pIHtcblx0XHRcdGlmIChqID09PSAwKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpLS07XG5cdFx0XHRqLS07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGkgKz0gTWF0aC5tYXgobmVlZGxlLmxlbmd0aCAtIGosIHRhYmxlW2hheXN0YWNrW2ldXSk7XG5cdFx0XHRqID0gbmVlZGxlLmxlbmd0aCAtIDE7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRVSW50MTZMRShzb3VyY2U6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIChcblx0XHQoKHNvdXJjZVtvZmZzZXQgKyAwXSA8PCAwKSA+Pj4gMCkgfFxuXHRcdCgoc291cmNlW29mZnNldCArIDFdIDw8IDgpID4+PiAwKVxuXHQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVVSW50MTZMRShkZXN0aW5hdGlvbjogVWludDhBcnJheSwgdmFsdWU6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0ZGVzdGluYXRpb25bb2Zmc2V0ICsgMF0gPSAodmFsdWUgJiAwYjExMTExMTExKTtcblx0dmFsdWUgPSB2YWx1ZSA+Pj4gODtcblx0ZGVzdGluYXRpb25bb2Zmc2V0ICsgMV0gPSAodmFsdWUgJiAwYjExMTExMTExKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRVSW50MzJCRShzb3VyY2U6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIChcblx0XHRzb3VyY2Vbb2Zmc2V0XSAqIDIgKiogMjRcblx0XHQrIHNvdXJjZVtvZmZzZXQgKyAxXSAqIDIgKiogMTZcblx0XHQrIHNvdXJjZVtvZmZzZXQgKyAyXSAqIDIgKiogOFxuXHRcdCsgc291cmNlW29mZnNldCArIDNdXG5cdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3cml0ZVVJbnQzMkJFKGRlc3RpbmF0aW9uOiBVaW50OEFycmF5LCB2YWx1ZTogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcik6IHZvaWQge1xuXHRkZXN0aW5hdGlvbltvZmZzZXQgKyAzXSA9IHZhbHVlO1xuXHR2YWx1ZSA9IHZhbHVlID4+PiA4O1xuXHRkZXN0aW5hdGlvbltvZmZzZXQgKyAyXSA9IHZhbHVlO1xuXHR2YWx1ZSA9IHZhbHVlID4+PiA4O1xuXHRkZXN0aW5hdGlvbltvZmZzZXQgKyAxXSA9IHZhbHVlO1xuXHR2YWx1ZSA9IHZhbHVlID4+PiA4O1xuXHRkZXN0aW5hdGlvbltvZmZzZXRdID0gdmFsdWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkVUludDMyTEUoc291cmNlOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiAoXG5cdFx0KChzb3VyY2Vbb2Zmc2V0ICsgMF0gPDwgMCkgPj4+IDApIHxcblx0XHQoKHNvdXJjZVtvZmZzZXQgKyAxXSA8PCA4KSA+Pj4gMCkgfFxuXHRcdCgoc291cmNlW29mZnNldCArIDJdIDw8IDE2KSA+Pj4gMCkgfFxuXHRcdCgoc291cmNlW29mZnNldCArIDNdIDw8IDI0KSA+Pj4gMClcblx0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlVUludDMyTEUoZGVzdGluYXRpb246IFVpbnQ4QXJyYXksIHZhbHVlOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdGRlc3RpbmF0aW9uW29mZnNldCArIDBdID0gKHZhbHVlICYgMGIxMTExMTExMSk7XG5cdHZhbHVlID0gdmFsdWUgPj4+IDg7XG5cdGRlc3RpbmF0aW9uW29mZnNldCArIDFdID0gKHZhbHVlICYgMGIxMTExMTExMSk7XG5cdHZhbHVlID0gdmFsdWUgPj4+IDg7XG5cdGRlc3RpbmF0aW9uW29mZnNldCArIDJdID0gKHZhbHVlICYgMGIxMTExMTExMSk7XG5cdHZhbHVlID0gdmFsdWUgPj4+IDg7XG5cdGRlc3RpbmF0aW9uW29mZnNldCArIDNdID0gKHZhbHVlICYgMGIxMTExMTExMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkVUludDgoc291cmNlOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBzb3VyY2Vbb2Zmc2V0XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlVUludDgoZGVzdGluYXRpb246IFVpbnQ4QXJyYXksIHZhbHVlOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdGRlc3RpbmF0aW9uW29mZnNldF0gPSB2YWx1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWU0J1ZmZlclJlYWRhYmxlIGV4dGVuZHMgc3RyZWFtcy5SZWFkYWJsZTxWU0J1ZmZlcj4geyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSBleHRlbmRzIHN0cmVhbXMuUmVhZGFibGVTdHJlYW08VlNCdWZmZXI+IHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIFZTQnVmZmVyV3JpdGVhYmxlU3RyZWFtIGV4dGVuZHMgc3RyZWFtcy5Xcml0ZWFibGVTdHJlYW08VlNCdWZmZXI+IHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbSBleHRlbmRzIHN0cmVhbXMuUmVhZGFibGVCdWZmZXJlZFN0cmVhbTxWU0J1ZmZlcj4geyB9XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkYWJsZVRvQnVmZmVyKHJlYWRhYmxlOiBWU0J1ZmZlclJlYWRhYmxlKTogVlNCdWZmZXIge1xuXHRyZXR1cm4gc3RyZWFtcy5jb25zdW1lUmVhZGFibGU8VlNCdWZmZXI+KHJlYWRhYmxlLCBjaHVua3MgPT4gVlNCdWZmZXIuY29uY2F0KGNodW5rcykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVmZmVyVG9SZWFkYWJsZShidWZmZXI6IFZTQnVmZmVyKTogVlNCdWZmZXJSZWFkYWJsZSB7XG5cdHJldHVybiBzdHJlYW1zLnRvUmVhZGFibGU8VlNCdWZmZXI+KGJ1ZmZlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJlYW1Ub0J1ZmZlcihzdHJlYW06IHN0cmVhbXMuUmVhZGFibGVTdHJlYW08VlNCdWZmZXI+KTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRyZXR1cm4gc3RyZWFtcy5jb25zdW1lU3RyZWFtPFZTQnVmZmVyPihzdHJlYW0sIGNodW5rcyA9PiBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBidWZmZXJlZFN0cmVhbVRvQnVmZmVyKGJ1ZmZlcmVkU3RyZWFtOiBzdHJlYW1zLlJlYWRhYmxlQnVmZmVyZWRTdHJlYW08VlNCdWZmZXI+KTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRpZiAoYnVmZmVyZWRTdHJlYW0uZW5kZWQpIHtcblx0XHRyZXR1cm4gVlNCdWZmZXIuY29uY2F0KGJ1ZmZlcmVkU3RyZWFtLmJ1ZmZlcik7XG5cdH1cblxuXHRyZXR1cm4gVlNCdWZmZXIuY29uY2F0KFtcblxuXHRcdC8vIEluY2x1ZGUgYWxyZWFkeSByZWFkIGNodW5rcy4uLlxuXHRcdC4uLmJ1ZmZlcmVkU3RyZWFtLmJ1ZmZlcixcblxuXHRcdC8vIC4uLmFuZCBhbGwgYWRkaXRpb25hbCBjaHVua3Ncblx0XHRhd2FpdCBzdHJlYW1Ub0J1ZmZlcihidWZmZXJlZFN0cmVhbS5zdHJlYW0pXG5cdF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVmZmVyVG9TdHJlYW0oYnVmZmVyOiBWU0J1ZmZlcik6IHN0cmVhbXMuUmVhZGFibGVTdHJlYW08VlNCdWZmZXI+IHtcblx0cmV0dXJuIHN0cmVhbXMudG9TdHJlYW08VlNCdWZmZXI+KGJ1ZmZlciwgY2h1bmtzID0+IFZTQnVmZmVyLmNvbmNhdChjaHVua3MpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmVhbVRvQnVmZmVyUmVhZGFibGVTdHJlYW0oc3RyZWFtOiBzdHJlYW1zLlJlYWRhYmxlU3RyZWFtRXZlbnRzPFVpbnQ4QXJyYXkgfCBzdHJpbmc+KTogc3RyZWFtcy5SZWFkYWJsZVN0cmVhbTxWU0J1ZmZlcj4ge1xuXHRyZXR1cm4gc3RyZWFtcy50cmFuc2Zvcm08VWludDhBcnJheSB8IHN0cmluZywgVlNCdWZmZXI+KHN0cmVhbSwgeyBkYXRhOiBkYXRhID0+IHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJyA/IFZTQnVmZmVyLmZyb21TdHJpbmcoZGF0YSkgOiBWU0J1ZmZlci53cmFwKGRhdGEpIH0sIGNodW5rcyA9PiBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0ob3B0aW9ucz86IHN0cmVhbXMuV3JpdGVhYmxlU3RyZWFtT3B0aW9ucyk6IHN0cmVhbXMuV3JpdGVhYmxlU3RyZWFtPFZTQnVmZmVyPiB7XG5cdHJldHVybiBzdHJlYW1zLm5ld1dyaXRlYWJsZVN0cmVhbTxWU0J1ZmZlcj4oY2h1bmtzID0+IFZTQnVmZmVyLmNvbmNhdChjaHVua3MpLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByZWZpeGVkQnVmZmVyUmVhZGFibGUocHJlZml4OiBWU0J1ZmZlciwgcmVhZGFibGU6IFZTQnVmZmVyUmVhZGFibGUpOiBWU0J1ZmZlclJlYWRhYmxlIHtcblx0cmV0dXJuIHN0cmVhbXMucHJlZml4ZWRSZWFkYWJsZShwcmVmaXgsIHJlYWRhYmxlLCBjaHVua3MgPT4gVlNCdWZmZXIuY29uY2F0KGNodW5rcykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJlZml4ZWRCdWZmZXJTdHJlYW0ocHJlZml4OiBWU0J1ZmZlciwgc3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtKTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB7XG5cdHJldHVybiBzdHJlYW1zLnByZWZpeGVkU3RyZWFtKHByZWZpeCwgc3RyZWFtLCBjaHVua3MgPT4gVlNCdWZmZXIuY29uY2F0KGNodW5rcykpO1xufVxuXG4vKiogRGVjb2RlcyBiYXNlNjQgdG8gYSB1aW50OCBhcnJheS4gVVJMLWVuY29kZWQgYW5kIHVucGFkZGVkIGJhc2U2NCBpcyBhbGxvd2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUJhc2U2NChlbmNvZGVkOiBzdHJpbmcpIHtcblx0bGV0IGJ1aWxkaW5nID0gMDtcblx0bGV0IHJlbWFpbmRlciA9IDA7XG5cdGxldCBidWZpID0gMDtcblxuXHQvLyBUaGUgc2ltcGxlciB3YXkgdG8gZG8gdGhpcyBpcyBgVWludDhBcnJheS5mcm9tKGF0b2Ioc3RyKSwgYyA9PiBjLmNoYXJDb2RlQXQoMCkpYCxcblx0Ly8gYnV0IHRoYXQncyBhYm91dCAxMC0yMHggc2xvd2VyIHRoYW4gdGhpcyBmdW5jdGlvbiBpbiBjdXJyZW50IENocm9taXVtIHZlcnNpb25zLlxuXG5cdGNvbnN0IGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KE1hdGguZmxvb3IoZW5jb2RlZC5sZW5ndGggLyA0ICogMykpO1xuXHRjb25zdCBhcHBlbmQgPSAodmFsdWU6IG51bWJlcikgPT4ge1xuXHRcdHN3aXRjaCAocmVtYWluZGVyKSB7XG5cdFx0XHRjYXNlIDM6XG5cdFx0XHRcdGJ1ZmZlcltidWZpKytdID0gYnVpbGRpbmcgfCB2YWx1ZTtcblx0XHRcdFx0cmVtYWluZGVyID0gMDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdGJ1ZmZlcltidWZpKytdID0gYnVpbGRpbmcgfCAodmFsdWUgPj4+IDIpO1xuXHRcdFx0XHRidWlsZGluZyA9IHZhbHVlIDw8IDY7XG5cdFx0XHRcdHJlbWFpbmRlciA9IDM7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHRidWZmZXJbYnVmaSsrXSA9IGJ1aWxkaW5nIHwgKHZhbHVlID4+PiA0KTtcblx0XHRcdFx0YnVpbGRpbmcgPSB2YWx1ZSA8PCA0O1xuXHRcdFx0XHRyZW1haW5kZXIgPSAyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJ1aWxkaW5nID0gdmFsdWUgPDwgMjtcblx0XHRcdFx0cmVtYWluZGVyID0gMTtcblx0XHR9XG5cdH07XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbmNvZGVkLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY29kZSA9IGVuY29kZWQuY2hhckNvZGVBdChpKTtcblx0XHQvLyBTZWUgaHR0cHM6Ly9kYXRhdHJhY2tlci5pZXRmLm9yZy9kb2MvaHRtbC9yZmM0NjQ4I3NlY3Rpb24tNFxuXHRcdC8vIFRoaXMgYnJhbmNoeSBjb2RlIGlzIGFib3V0IDN4IGZhc3RlciB0aGFuIGFuIGluZGV4T2Ygb24gYSBiYXNlNjQgY2hhciBzdHJpbmcuXG5cdFx0aWYgKGNvZGUgPj0gNjUgJiYgY29kZSA8PSA5MCkge1xuXHRcdFx0YXBwZW5kKGNvZGUgLSA2NSk7IC8vIEEtWiBzdGFydHMgcmFuZ2VzIGZyb20gY2hhciBjb2RlIDY1IHRvIDkwXG5cdFx0fSBlbHNlIGlmIChjb2RlID49IDk3ICYmIGNvZGUgPD0gMTIyKSB7XG5cdFx0XHRhcHBlbmQoY29kZSAtIDk3ICsgMjYpOyAvLyBhLXogc3RhcnRzIHJhbmdlcyBmcm9tIGNoYXIgY29kZSA5NyB0byAxMjIsIHN0YXJ0aW5nIGF0IGJ5dGUgMjZcblx0XHR9IGVsc2UgaWYgKGNvZGUgPj0gNDggJiYgY29kZSA8PSA1Nykge1xuXHRcdFx0YXBwZW5kKGNvZGUgLSA0OCArIDUyKTsgLy8gMC05IHN0YXJ0cyByYW5nZXMgZnJvbSBjaGFyIGNvZGUgNDggdG8gNTgsIHN0YXJ0aW5nIGF0IGJ5dGUgNTJcblx0XHR9IGVsc2UgaWYgKGNvZGUgPT09IDQzIHx8IGNvZGUgPT09IDQ1KSB7XG5cdFx0XHRhcHBlbmQoNjIpOyAvLyBcIitcIiBvciBcIi1cIiBmb3IgVVJMU1xuXHRcdH0gZWxzZSBpZiAoY29kZSA9PT0gNDcgfHwgY29kZSA9PT0gOTUpIHtcblx0XHRcdGFwcGVuZCg2Myk7IC8vIFwiL1wiIG9yIFwiX1wiIGZvciBVUkxTXG5cdFx0fSBlbHNlIGlmIChjb2RlID09PSA2MSkge1xuXHRcdFx0YnJlYWs7IC8vIFwiPVwiXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBTeW50YXhFcnJvcihgVW5leHBlY3RlZCBiYXNlNjQgY2hhcmFjdGVyICR7ZW5jb2RlZFtpXX1gKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCB1bnBhZGRlZCA9IGJ1Zmk7XG5cdHdoaWxlIChyZW1haW5kZXIgPiAwKSB7XG5cdFx0YXBwZW5kKDApO1xuXHR9XG5cblx0Ly8gc2xpY2UgaXMgbmVlZGVkIHRvIGFjY291bnQgZm9yIG92ZXJlc3RpbWF0aW9uIGR1ZSB0byBwYWRkaW5nXG5cdHJldHVybiBWU0J1ZmZlci53cmFwKGJ1ZmZlcikuc2xpY2UoMCwgdW5wYWRkZWQpO1xufVxuXG5jb25zdCBiYXNlNjRBbHBoYWJldCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcbmNvbnN0IGJhc2U2NFVybFNhZmVBbHBoYWJldCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OS1fJztcblxuLyoqIEVuY29kZXMgYSBidWZmZXIgdG8gYSBiYXNlNjQgc3RyaW5nLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZUJhc2U2NCh7IGJ1ZmZlciB9OiBWU0J1ZmZlciwgcGFkZGVkID0gdHJ1ZSwgdXJsU2FmZSA9IGZhbHNlKSB7XG5cdGNvbnN0IGRpY3Rpb25hcnkgPSB1cmxTYWZlID8gYmFzZTY0VXJsU2FmZUFscGhhYmV0IDogYmFzZTY0QWxwaGFiZXQ7XG5cdGxldCBvdXRwdXQgPSAnJztcblxuXHRjb25zdCByZW1haW5kZXIgPSBidWZmZXIuYnl0ZUxlbmd0aCAlIDM7XG5cblx0bGV0IGkgPSAwO1xuXHRmb3IgKDsgaSA8IGJ1ZmZlci5ieXRlTGVuZ3RoIC0gcmVtYWluZGVyOyBpICs9IDMpIHtcblx0XHRjb25zdCBhID0gYnVmZmVyW2kgKyAwXTtcblx0XHRjb25zdCBiID0gYnVmZmVyW2kgKyAxXTtcblx0XHRjb25zdCBjID0gYnVmZmVyW2kgKyAyXTtcblxuXHRcdG91dHB1dCArPSBkaWN0aW9uYXJ5W2EgPj4+IDJdO1xuXHRcdG91dHB1dCArPSBkaWN0aW9uYXJ5WyhhIDw8IDQgfCBiID4+PiA0KSAmIDBiMTExMTExXTtcblx0XHRvdXRwdXQgKz0gZGljdGlvbmFyeVsoYiA8PCAyIHwgYyA+Pj4gNikgJiAwYjExMTExMV07XG5cdFx0b3V0cHV0ICs9IGRpY3Rpb25hcnlbYyAmIDBiMTExMTExXTtcblx0fVxuXG5cdGlmIChyZW1haW5kZXIgPT09IDEpIHtcblx0XHRjb25zdCBhID0gYnVmZmVyW2kgKyAwXTtcblx0XHRvdXRwdXQgKz0gZGljdGlvbmFyeVthID4+PiAyXTtcblx0XHRvdXRwdXQgKz0gZGljdGlvbmFyeVsoYSA8PCA0KSAmIDBiMTExMTExXTtcblx0XHRpZiAocGFkZGVkKSB7IG91dHB1dCArPSAnPT0nOyB9XG5cdH0gZWxzZSBpZiAocmVtYWluZGVyID09PSAyKSB7XG5cdFx0Y29uc3QgYSA9IGJ1ZmZlcltpICsgMF07XG5cdFx0Y29uc3QgYiA9IGJ1ZmZlcltpICsgMV07XG5cdFx0b3V0cHV0ICs9IGRpY3Rpb25hcnlbYSA+Pj4gMl07XG5cdFx0b3V0cHV0ICs9IGRpY3Rpb25hcnlbKGEgPDwgNCB8IGIgPj4+IDQpICYgMGIxMTExMTFdO1xuXHRcdG91dHB1dCArPSBkaWN0aW9uYXJ5WyhiIDw8IDIpICYgMGIxMTExMTFdO1xuXHRcdGlmIChwYWRkZWQpIHsgb3V0cHV0ICs9ICc9JzsgfVxuXHR9XG5cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuY29uc3QgaGV4Q2hhcnMgPSAnMDEyMzQ1Njc4OWFiY2RlZic7XG5leHBvcnQgZnVuY3Rpb24gZW5jb2RlSGV4KHsgYnVmZmVyIH06IFZTQnVmZmVyKTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9ICcnO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGJ5dGUgPSBidWZmZXJbaV07XG5cdFx0cmVzdWx0ICs9IGhleENoYXJzW2J5dGUgPj4+IDRdO1xuXHRcdHJlc3VsdCArPSBoZXhDaGFyc1tieXRlICYgMHgwZl07XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUhleChoZXg6IHN0cmluZyk6IFZTQnVmZmVyIHtcblx0aWYgKGhleC5sZW5ndGggJSAyICE9PSAwKSB7XG5cdFx0dGhyb3cgbmV3IFN5bnRheEVycm9yKCdIZXggc3RyaW5nIG11c3QgaGF2ZSBhbiBldmVuIGxlbmd0aCcpO1xuXHR9XG5cdGNvbnN0IG91dCA9IG5ldyBVaW50OEFycmF5KGhleC5sZW5ndGggPj4gMSk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgaGV4Lmxlbmd0aDspIHtcblx0XHRvdXRbaSA+PiAxXSA9IChkZWNvZGVIZXhDaGFyKGhleCwgaSsrKSA8PCA0KSB8IGRlY29kZUhleENoYXIoaGV4LCBpKyspO1xuXHR9XG5cdHJldHVybiBWU0J1ZmZlci53cmFwKG91dCk7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUhleENoYXIoc3RyOiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIpIHtcblx0Y29uc3QgcyA9IHN0ci5jaGFyQ29kZUF0KHBvc2l0aW9uKTtcblx0aWYgKHMgPj0gNDggJiYgcyA8PSA1NykgeyAvLyAnMCctJzknXG5cdFx0cmV0dXJuIHMgLSA0ODtcblx0fSBlbHNlIGlmIChzID49IDk3ICYmIHMgPD0gMTAyKSB7IC8vICdhJy0nZidcblx0XHRyZXR1cm4gcyAtIDg3O1xuXHR9IGVsc2UgaWYgKHMgPj0gNjUgJiYgcyA8PSA3MCkgeyAvLyAnQSctJ0YnXG5cdFx0cmV0dXJuIHMgLSA1NTtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgU3ludGF4RXJyb3IoYEludmFsaWQgaGV4IGNoYXJhY3RlciBhdCBwb3NpdGlvbiAke3Bvc2l0aW9ufWApO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVk7QUFDckIsWUFBWSxhQUFhO0FBV3pCLE1BQU0sWUFBYSxPQUFPLFdBQVc7QUFDckMsTUFBTSxlQUFlLElBQUksS0FBSyxN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
