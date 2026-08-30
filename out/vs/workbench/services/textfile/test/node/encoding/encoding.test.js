import assert from "assert";
import * as fs from "fs";
import * as encoding from "../../../common/encoding.js";
import * as streams from "../../../../../../base/common/stream.js";
import { newWriteableBufferStream, VSBuffer, streamToBufferReadableStream } from "../../../../../../base/common/buffer.js";
import { splitLines } from "../../../../../../base/common/strings.js";
import { FileAccess } from "../../../../../../base/common/network.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
async function detectEncodingByBOM(file) {
  try {
    const { buffer, bytesRead } = await readExactlyByFile(file, 3);
    return encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);
  } catch (error) {
    return null;
  }
}
function readExactlyByFile(file, totalBytes) {
  return new Promise((resolve, reject) => {
    fs.open(file, "r", null, (err, fd) => {
      if (err) {
        return reject(err);
      }
      function end(err2, resultBuffer, bytesRead) {
        fs.close(fd, (closeError) => {
          if (closeError) {
            return reject(closeError);
          }
          if (err2 && err2.code === "EISDIR") {
            return reject(err2);
          }
          return resolve({ buffer: resultBuffer ? VSBuffer.wrap(resultBuffer) : null, bytesRead });
        });
      }
      const buffer = Buffer.allocUnsafe(totalBytes);
      let offset = 0;
      function readChunk() {
        fs.read(fd, buffer, offset, totalBytes - offset, null, (err2, bytesRead) => {
          if (err2) {
            return end(err2, null, 0);
          }
          if (bytesRead === 0) {
            return end(null, buffer, offset);
          }
          offset += bytesRead;
          if (offset === totalBytes) {
            return end(null, buffer, offset);
          }
          return readChunk();
        });
      }
      readChunk();
    });
  });
}
suite("Encoding", () => {
  test("detectBOM does not return error for non existing file", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/not-exist.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, null);
  });
  test("detectBOM UTF-8", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf8.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, "utf8bom");
  });
  test("detectBOM UTF-16 LE", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16le.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, "utf16le");
  });
  test("detectBOM UTF-16 BE", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, "utf16be");
  });
  test("detectBOM ANSI", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, null);
  });
  test("detectBOM ANSI (2)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, null);
  });
  test("detectEncodingFromBuffer (JSON saved as PNG)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.json.png").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (PNG saved as TXT)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.png.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, true);
  });
  test("detectEncodingFromBuffer (XML saved as PNG)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.xml.png").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (QWOFF saved as TXT)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.qwoff.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, true);
  });
  test("detectEncodingFromBuffer (CSS saved as QWOFF)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.css.qwoff").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (PDF)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.pdf").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, true);
  });
  test("detectEncodingFromBuffer (guess UTF-16 LE from content without BOM)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_le_nobom.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.encoding, encoding.UTF16le);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (guess UTF-16 BE from content without BOM)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_be_nobom.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.encoding, encoding.UTF16be);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("autoGuessEncoding (UTF8)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_file.css").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, "utf8");
  });
  test("autoGuessEncoding (ASCII)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, null);
  });
  test("autoGuessEncoding (ShiftJIS)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, "shiftjis");
  });
  test("autoGuessEncoding (CP1252)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.cp1252.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, "windows1252");
  });
  test("autoGuessEncoding (candidateGuessEncodings - ShiftJIS)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.1.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true, ["utf8", "shiftjis", "eucjp"]);
    assert.strictEqual(mimes.encoding, "shiftjis");
  });
  async function readAndDecodeFromDisk(path, fileEncoding) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js").then((iconv) => iconv.decode(data, encoding.toNodeEncoding(fileEncoding))));
        }
      });
    });
  }
  function newTestReadableStream(buffers) {
    const stream = newWriteableBufferStream();
    buffers.map(VSBuffer.wrap).forEach((buffer) => {
      setTimeout(() => {
        stream.write(buffer);
      });
    });
    setTimeout(() => {
      stream.end();
    });
    return stream;
  }
  async function readAllAsString(stream) {
    return streams.consumeStream(stream, (strings) => strings.join(""));
  }
  test("toDecodeStream - some stream", async function() {
    const source = newTestReadableStream([
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67])
    ]);
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content, "ABCABCABC");
  });
  test("toDecodeStream - some stream, expect too much data", async function() {
    const source = newTestReadableStream([
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67])
    ]);
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content, "ABCABCABC");
  });
  test("toDecodeStream - some stream, no data", async function() {
    const source = newWriteableBufferStream();
    source.end();
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 512, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content, "");
  });
  test("toDecodeStream - encoding, utf16be", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.strictEqual(detected.encoding, "utf16be");
    assert.strictEqual(detected.seemsBinary, false);
    const expected = await readAndDecodeFromDisk(path, detected.encoding);
    const actual = await readAllAsString(stream);
    assert.strictEqual(actual, expected);
  });
  test("toDecodeStream - empty file", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    const expected = await readAndDecodeFromDisk(path, detected.encoding);
    const actual = await readAllAsString(stream);
    assert.strictEqual(actual, expected);
  });
  test("toDecodeStream - decodes buffer entirely", async function() {
    const emojis = Buffer.from("\u{1F5A5}\uFE0F\u{1F4BB}\u{1F4BE}");
    const incompleteEmojis = emojis.slice(0, emojis.length - 1);
    const buffers = [];
    for (let i = 0; i < incompleteEmojis.length; i++) {
      buffers.push(incompleteEmojis.slice(i, i + 1));
    }
    const source = newTestReadableStream(buffers);
    const { stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
    const expected = new TextDecoder().decode(incompleteEmojis);
    const actual = await readAllAsString(stream);
    assert.strictEqual(actual, expected);
  });
  test("toDecodeStream - some stream (GBK issue #101856)", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_gbk.txt").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => "gbk" });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content.length, 65537);
  });
  test("toDecodeStream - some stream (UTF-8 issue #102202)", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/issue_102202.txt").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => "utf-8" });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    const lines = splitLines(content);
    assert.strictEqual(lines[981].toString(), "\u554A\u554A\u554A\u554A\u554A\u554Aaaa\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\uFF0C\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u3002");
  });
  test("toDecodeStream - binary", async function() {
    const source = () => {
      return newTestReadableStream([
        Buffer.from([0, 0, 0]),
        Buffer.from("Hello World"),
        Buffer.from([0])
      ]);
    };
    let error = void 0;
    try {
      await encoding.toDecodeStream(source(), { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    } catch (e) {
      error = e;
    }
    assert.ok(error instanceof encoding.DecodeStreamError);
    assert.strictEqual(error.decodeStreamErrorKind, encoding.DecodeStreamErrorKind.STREAM_IS_BINARY);
    const { detected, stream } = await encoding.toDecodeStream(source(), { acceptTextOnly: false, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.strictEqual(detected.seemsBinary, true);
    assert.ok(stream);
  });
  test("toEncodeReadable - encoding, utf16be", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css").fsPath;
    const source = await readAndDecodeFromDisk(path, encoding.UTF16be);
    const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
    const expected = VSBuffer.wrap(
      iconv.encode(source, encoding.toNodeEncoding(encoding.UTF16be))
    ).toString();
    const actual = streams.consumeReadable(
      await encoding.toEncodeReadable(streams.toReadable(source), encoding.UTF16be),
      VSBuffer.concat
    ).toString();
    assert.strictEqual(actual, expected);
  });
  test("toEncodeReadable - empty readable to utf8", async function() {
    const source = {
      read() {
        return null;
      }
    };
    const actual = streams.consumeReadable(
      await encoding.toEncodeReadable(source, encoding.UTF8),
      VSBuffer.concat
    ).toString();
    assert.strictEqual(actual, "");
  });
  [{
    utfEncoding: encoding.UTF8,
    relatedBom: encoding.UTF8_BOM
  }, {
    utfEncoding: encoding.UTF8_with_bom,
    relatedBom: encoding.UTF8_BOM
  }, {
    utfEncoding: encoding.UTF16be,
    relatedBom: encoding.UTF16be_BOM
  }, {
    utfEncoding: encoding.UTF16le,
    relatedBom: encoding.UTF16le_BOM
  }].forEach(({ utfEncoding, relatedBom }) => {
    test(`toEncodeReadable - empty readable to ${utfEncoding} with BOM`, async function() {
      const source = {
        read() {
          return null;
        }
      };
      const encodedReadable = encoding.toEncodeReadable(source, utfEncoding, { addBOM: true });
      const expected = VSBuffer.wrap(Buffer.from(relatedBom)).toString();
      const actual = streams.consumeReadable(await encodedReadable, VSBuffer.concat).toString();
      assert.strictEqual(actual, expected);
    });
  });
  test("encodingExists", async function() {
    for (const enc in encoding.SUPPORTED_ENCODINGS) {
      if (enc === encoding.UTF8_with_bom) {
        continue;
      }
      const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
      assert.strictEqual(iconv.encodingExists(enc), true, enc);
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
export {
  detectEncodingByBOM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcdGVzdFxcbm9kZVxcZW5jb2RpbmdcXGVuY29kaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBlbmNvZGluZyBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RpbmcuanMnO1xuaW1wb3J0ICogYXMgc3RyZWFtcyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtLCBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRldGVjdEVuY29kaW5nQnlCT00oZmlsZTogc3RyaW5nKTogUHJvbWlzZTx0eXBlb2YgZW5jb2RpbmcuVVRGMTZiZSB8IHR5cGVvZiBlbmNvZGluZy5VVEYxNmxlIHwgdHlwZW9mIGVuY29kaW5nLlVURjhfd2l0aF9ib20gfCBudWxsPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgeyBidWZmZXIsIGJ5dGVzUmVhZCB9ID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgMyk7XG5cblx0XHRyZXR1cm4gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdCeUJPTUZyb21CdWZmZXIoYnVmZmVyLCBieXRlc1JlYWQpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHJldHVybiBudWxsOyAvLyBpZ25vcmUgZXJyb3JzIChsaWtlIGZpbGUgbm90IGZvdW5kKVxuXHR9XG59XG5cbmludGVyZmFjZSBSZWFkUmVzdWx0IHtcblx0YnVmZmVyOiBWU0J1ZmZlciB8IG51bGw7XG5cdGJ5dGVzUmVhZDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiByZWFkRXhhY3RseUJ5RmlsZShmaWxlOiBzdHJpbmcsIHRvdGFsQnl0ZXM6IG51bWJlcik6IFByb21pc2U8UmVhZFJlc3VsdD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8UmVhZFJlc3VsdD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGZzLm9wZW4oZmlsZSwgJ3InLCBudWxsLCAoZXJyLCBmZCkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGVuZChlcnI6IEVycm9yIHwgbnVsbCwgcmVzdWx0QnVmZmVyOiBCdWZmZXIgfCBudWxsLCBieXRlc1JlYWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0XHRmcy5jbG9zZShmZCwgY2xvc2VFcnJvciA9PiB7XG5cdFx0XHRcdFx0aWYgKGNsb3NlRXJyb3IpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZWplY3QoY2xvc2VFcnJvcik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0aWYgKGVyciAmJiAoPGFueT5lcnIpLmNvZGUgPT09ICdFSVNESVInKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7IC8vIHdlIHdhbnQgdG8gYnViYmxlIHRoaXMgZXJyb3IgdXAgKGZpbGUgaXMgYWN0dWFsbHkgYSBmb2xkZXIpXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoeyBidWZmZXI6IHJlc3VsdEJ1ZmZlciA/IFZTQnVmZmVyLndyYXAocmVzdWx0QnVmZmVyKSA6IG51bGwsIGJ5dGVzUmVhZCB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1ZmZlciA9IEJ1ZmZlci5hbGxvY1Vuc2FmZSh0b3RhbEJ5dGVzKTtcblx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXG5cdFx0XHRmdW5jdGlvbiByZWFkQ2h1bmsoKTogdm9pZCB7XG5cdFx0XHRcdGZzLnJlYWQoZmQsIGJ1ZmZlciwgb2Zmc2V0LCB0b3RhbEJ5dGVzIC0gb2Zmc2V0LCBudWxsLCAoZXJyLCBieXRlc1JlYWQpID0+IHtcblx0XHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZW5kKGVyciwgbnVsbCwgMCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGJ5dGVzUmVhZCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVuZChudWxsLCBidWZmZXIsIG9mZnNldCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b2Zmc2V0ICs9IGJ5dGVzUmVhZDtcblxuXHRcdFx0XHRcdGlmIChvZmZzZXQgPT09IHRvdGFsQnl0ZXMpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbmQobnVsbCwgYnVmZmVyLCBvZmZzZXQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiByZWFkQ2h1bmsoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJlYWRDaHVuaygpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuc3VpdGUoJ0VuY29kaW5nJywgKCkgPT4ge1xuXG5cdHRlc3QoJ2RldGVjdEJPTSBkb2VzIG5vdCByZXR1cm4gZXJyb3IgZm9yIG5vbiBleGlzdGluZyBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9ub3QtZXhpc3QuY3NzJykuZnNQYXRoO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00oZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RCT00gVVRGLTgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfdXRmOC5jc3MnKS5mc1BhdGg7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShmaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgJ3V0Zjhib20nKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0Qk9NIFVURi0xNiBMRScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZV91dGYxNmxlLmNzcycpLmZzUGF0aDtcblxuXHRcdGNvbnN0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKGZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCAndXRmMTZsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RCT00gVVRGLTE2IEJFJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lX3V0ZjE2YmUuY3NzJykuZnNQYXRoO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00oZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsICd1dGYxNmJlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEJPTSBBTlNJJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lX2Fuc2kuY3NzJykuZnNQYXRoO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00oZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RCT00gQU5TSSAoMiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL2VtcHR5LnR4dCcpLmZzUGF0aDtcblxuXHRcdGNvbnN0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKGZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChKU09OIHNhdmVkIGFzIFBORyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWUuanNvbi5wbmcnKS5mc1BhdGg7XG5cblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIpO1xuXHRcdGNvbnN0IG1pbWVzID0gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLnNlZW1zQmluYXJ5LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEVuY29kaW5nRnJvbUJ1ZmZlciAoUE5HIHNhdmVkIGFzIFRYVCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWUucG5nLnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIpO1xuXHRcdGNvbnN0IG1pbWVzID0gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLnNlZW1zQmluYXJ5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChYTUwgc2F2ZWQgYXMgUE5HKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZS54bWwucG5nJykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuc2VlbXNCaW5hcnksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChRV09GRiBzYXZlZCBhcyBUWFQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLnF3b2ZmLnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIpO1xuXHRcdGNvbnN0IG1pbWVzID0gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLnNlZW1zQmluYXJ5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChDU1Mgc2F2ZWQgYXMgUVdPRkYpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLmNzcy5xd29mZicpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIpO1xuXHRcdGNvbnN0IG1pbWVzID0gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLnNlZW1zQmluYXJ5LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEVuY29kaW5nRnJvbUJ1ZmZlciAoUERGKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZS5wZGYnKS5mc1BhdGg7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgNTEyKTtcblx0XHRjb25zdCBtaW1lcyA9IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5zZWVtc0JpbmFyeSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEVuY29kaW5nRnJvbUJ1ZmZlciAoZ3Vlc3MgVVRGLTE2IExFIGZyb20gY29udGVudCB3aXRob3V0IEJPTSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3V0ZjE2X2xlX25vYm9tLnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIpO1xuXHRcdGNvbnN0IG1pbWVzID0gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLmVuY29kaW5nLCBlbmNvZGluZy5VVEYxNmxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuc2VlbXNCaW5hcnksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChndWVzcyBVVEYtMTYgQkUgZnJvbSBjb250ZW50IHdpdGhvdXQgQk9NKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvdXRmMTZfYmVfbm9ib20udHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuZW5jb2RpbmcsIGVuY29kaW5nLlVURjE2YmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5zZWVtc0JpbmFyeSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvR3Vlc3NFbmNvZGluZyAoVVRGOCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfZmlsZS5jc3MnKS5mc1BhdGg7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgNTEyICogOCk7XG5cdFx0Y29uc3QgbWltZXMgPSBhd2FpdCBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuZW5jb2RpbmcsICd1dGY4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9HdWVzc0VuY29kaW5nIChBU0NJSSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfYW5zaS5jc3MnKS5mc1BhdGg7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgNTEyICogOCk7XG5cdFx0Y29uc3QgbWltZXMgPSBhd2FpdCBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuZW5jb2RpbmcsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvR3Vlc3NFbmNvZGluZyAoU2hpZnRKSVMpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLnNoaWZ0amlzLnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIgKiA4KTtcblx0XHRjb25zdCBtaW1lcyA9IGF3YWl0IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5lbmNvZGluZywgJ3NoaWZ0amlzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9HdWVzc0VuY29kaW5nIChDUDEyNTIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLmNwMTI1Mi50eHQnKS5mc1BhdGg7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgNTEyICogOCk7XG5cdFx0Y29uc3QgbWltZXMgPSBhd2FpdCBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuZW5jb2RpbmcsICd3aW5kb3dzMTI1MicpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvR3Vlc3NFbmNvZGluZyAoY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MgLSBTaGlmdEpJUyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVGhpcyBmaWxlIGlzIGRldGVybWluZWQgdG8gYmUgd2luZG93czEyNTIgdW5sZXNzIGNhbmRpZGF0ZURldGVjdEVuY29kaW5nIGlzIHNldC5cblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZS5zaGlmdGppcy4xLnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIgKiA4KTtcblx0XHRjb25zdCBtaW1lcyA9IGF3YWl0IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIsIHRydWUsIFsndXRmOCcsICdzaGlmdGppcycsICdldWNqcCddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuZW5jb2RpbmcsICdzaGlmdGppcycpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiByZWFkQW5kRGVjb2RlRnJvbURpc2socGF0aDogc3RyaW5nLCBmaWxlRW5jb2Rpbmc6IHN0cmluZyB8IG51bGwpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRmcy5yZWFkRmlsZShwYXRoLCAoZXJyLCBkYXRhKSA9PiB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHZzY29kZS9pY29udi1saXRlLXVtZCcpPignQHZzY29kZS9pY29udi1saXRlLXVtZCcsICdsaWIvaWNvbnYtbGl0ZS11bWQuanMnKS50aGVuKGljb252ID0+IGljb252LmRlY29kZShkYXRhLCBlbmNvZGluZy50b05vZGVFbmNvZGluZyhmaWxlRW5jb2RpbmcpKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5ld1Rlc3RSZWFkYWJsZVN0cmVhbShidWZmZXJzOiBCdWZmZXJbXSk6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXHRcdGJ1ZmZlcnNcblx0XHRcdC5tYXAoVlNCdWZmZXIud3JhcClcblx0XHRcdC5mb3JFYWNoKGJ1ZmZlciA9PiB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmVhbS53cml0ZShidWZmZXIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0c3RyZWFtLmVuZCgpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBzdHJlYW07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiByZWFkQWxsQXNTdHJpbmcoc3RyZWFtOiBzdHJlYW1zLlJlYWRhYmxlU3RyZWFtPHN0cmluZz4pIHtcblx0XHRyZXR1cm4gc3RyZWFtcy5jb25zdW1lU3RyZWFtKHN0cmVhbSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oJycpKTtcblx0fVxuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gc29tZSBzdHJlYW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gbmV3VGVzdFJlYWRhYmxlU3RyZWFtKFtcblx0XHRcdEJ1ZmZlci5mcm9tKFs2NSwgNjYsIDY3XSksXG5cdFx0XHRCdWZmZXIuZnJvbShbNjUsIDY2LCA2N10pLFxuXHRcdFx0QnVmZmVyLmZyb20oWzY1LCA2NiwgNjddKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uOiA0LCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblxuXHRcdGFzc2VydC5vayhkZXRlY3RlZCk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmVhbSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEFsbEFzU3RyaW5nKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdBQkNBQkNBQkMnKTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBzb21lIHN0cmVhbSwgZXhwZWN0IHRvbyBtdWNoIGRhdGEnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gbmV3VGVzdFJlYWRhYmxlU3RyZWFtKFtcblx0XHRcdEJ1ZmZlci5mcm9tKFs2NSwgNjYsIDY3XSksXG5cdFx0XHRCdWZmZXIuZnJvbShbNjUsIDY2LCA2N10pLFxuXHRcdFx0QnVmZmVyLmZyb20oWzY1LCA2NiwgNjddKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uOiA2NCwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jIGRldGVjdGVkID0+IGRldGVjdGVkIHx8IGVuY29kaW5nLlVURjggfSk7XG5cblx0XHRhc3NlcnQub2soZGV0ZWN0ZWQpO1xuXHRcdGFzc2VydC5vayhzdHJlYW0pO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRBbGxBc1N0cmluZyhzdHJlYW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnQUJDQUJDQUJDJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gc29tZSBzdHJlYW0sIG5vIGRhdGEnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cdFx0c291cmNlLmVuZCgpO1xuXG5cdFx0Y29uc3QgeyBkZXRlY3RlZCwgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUsIG1pbkJ5dGVzUmVxdWlyZWRGb3JEZXRlY3Rpb246IDUxMiwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jIGRldGVjdGVkID0+IGRldGVjdGVkIHx8IGVuY29kaW5nLlVURjggfSk7XG5cblx0XHRhc3NlcnQub2soZGV0ZWN0ZWQpO1xuXHRcdGFzc2VydC5vayhzdHJlYW0pO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRBbGxBc1N0cmluZyhzdHJlYW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gZW5jb2RpbmcsIHV0ZjE2YmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfdXRmMTZiZS5jc3MnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc291cmNlID0gc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbShmcy5jcmVhdGVSZWFkU3RyZWFtKHBhdGgpKTtcblxuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uOiA2NCwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jIGRldGVjdGVkID0+IGRldGVjdGVkIHx8IGVuY29kaW5nLlVURjggfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWQuZW5jb2RpbmcsICd1dGYxNmJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkLnNlZW1zQmluYXJ5LCBmYWxzZSk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGF3YWl0IHJlYWRBbmREZWNvZGVGcm9tRGlzayhwYXRoLCBkZXRlY3RlZC5lbmNvZGluZyk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgcmVhZEFsbEFzU3RyaW5nKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b0RlY29kZVN0cmVhbSAtIGVtcHR5IGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL2VtcHR5LnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBzb3VyY2UgPSBzdHJlYW1Ub0J1ZmZlclJlYWRhYmxlU3RyZWFtKGZzLmNyZWF0ZVJlYWRTdHJlYW0ocGF0aCkpO1xuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYXdhaXQgcmVhZEFuZERlY29kZUZyb21EaXNrKHBhdGgsIGRldGVjdGVkLmVuY29kaW5nKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCByZWFkQWxsQXNTdHJpbmcoc3RyZWFtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gZGVjb2RlcyBidWZmZXIgZW50aXJlbHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZW1vamlzID0gQnVmZmVyLmZyb20oJ1x1RDgzRFx1RERBNVx1RkUwRlx1RDgzRFx1RENCQlx1RDgzRFx1RENCRScpO1xuXHRcdGNvbnN0IGluY29tcGxldGVFbW9qaXMgPSBlbW9qaXMuc2xpY2UoMCwgZW1vamlzLmxlbmd0aCAtIDEpO1xuXG5cdFx0Y29uc3QgYnVmZmVyczogQnVmZmVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluY29tcGxldGVFbW9qaXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGJ1ZmZlcnMucHVzaChpbmNvbXBsZXRlRW1vamlzLnNsaWNlKGksIGkgKyAxKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlID0gbmV3VGVzdFJlYWRhYmxlU3RyZWFtKGJ1ZmZlcnMpO1xuXHRcdGNvbnN0IHsgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUsIG1pbkJ5dGVzUmVxdWlyZWRGb3JEZXRlY3Rpb246IDQsIGd1ZXNzRW5jb2Rpbmc6IGZhbHNlLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogW10sIG92ZXJ3cml0ZUVuY29kaW5nOiBhc3luYyBkZXRlY3RlZCA9PiBkZXRlY3RlZCB8fCBlbmNvZGluZy5VVEY4IH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoaW5jb21wbGV0ZUVtb2ppcyk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgcmVhZEFsbEFzU3RyaW5nKHN0cmVhbSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gc29tZSBzdHJlYW0gKEdCSyBpc3N1ZSAjMTAxODU2KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZV9nYmsudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHN0cmVhbVRvQnVmZmVyUmVhZGFibGVTdHJlYW0oZnMuY3JlYXRlUmVhZFN0cmVhbShwYXRoKSk7XG5cblx0XHRjb25zdCB7IGRldGVjdGVkLCBzdHJlYW0gfSA9IGF3YWl0IGVuY29kaW5nLnRvRGVjb2RlU3RyZWFtKHNvdXJjZSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSwgbWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbjogNCwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jICgpID0+ICdnYmsnIH0pO1xuXHRcdGFzc2VydC5vayhkZXRlY3RlZCk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmVhbSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEFsbEFzU3RyaW5nKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQubGVuZ3RoLCA2NTUzNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gc29tZSBzdHJlYW0gKFVURi04IGlzc3VlICMxMDIyMDIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9pc3N1ZV8xMDIyMDIudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHN0cmVhbVRvQnVmZmVyUmVhZGFibGVTdHJlYW0oZnMuY3JlYXRlUmVhZFN0cmVhbShwYXRoKSk7XG5cblx0XHRjb25zdCB7IGRldGVjdGVkLCBzdHJlYW0gfSA9IGF3YWl0IGVuY29kaW5nLnRvRGVjb2RlU3RyZWFtKHNvdXJjZSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSwgbWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbjogNCwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jICgpID0+ICd1dGYtOCcgfSk7XG5cdFx0YXNzZXJ0Lm9rKGRldGVjdGVkKTtcblx0XHRhc3NlcnQub2soc3RyZWFtKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkQWxsQXNTdHJpbmcoc3RyZWFtKTtcblx0XHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXMoY29udGVudCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNbOTgxXS50b1N0cmluZygpLCAnXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBYWFhXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHVGRjBDXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHU1NTRBXHUzMDAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gYmluYXJ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNvdXJjZSA9ICgpID0+IHtcblx0XHRcdHJldHVybiBuZXdUZXN0UmVhZGFibGVTdHJlYW0oW1xuXHRcdFx0XHRCdWZmZXIuZnJvbShbMCwgMCwgMF0pLFxuXHRcdFx0XHRCdWZmZXIuZnJvbSgnSGVsbG8gV29ybGQnKSxcblx0XHRcdFx0QnVmZmVyLmZyb20oWzBdKVxuXHRcdFx0XSk7XG5cdFx0fTtcblxuXHRcdC8vIGFjY2VwdFRleHRPbmx5OiB0cnVlXG5cblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UoKSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jIGRldGVjdGVkID0+IGRldGVjdGVkIHx8IGVuY29kaW5nLlVURjggfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIGVuY29kaW5nLkRlY29kZVN0cmVhbUVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZGVjb2RlU3RyZWFtRXJyb3JLaW5kLCBlbmNvZGluZy5EZWNvZGVTdHJlYW1FcnJvcktpbmQuU1RSRUFNX0lTX0JJTkFSWSk7XG5cblx0XHQvLyBhY2NlcHRUZXh0T25seTogZmFsc2VcblxuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlKCksIHsgYWNjZXB0VGV4dE9ubHk6IGZhbHNlLCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblxuXHRcdGFzc2VydC5vayhkZXRlY3RlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkLnNlZW1zQmluYXJ5LCB0cnVlKTtcblx0XHRhc3NlcnQub2soc3RyZWFtKTtcblx0fSk7XG5cblx0dGVzdCgndG9FbmNvZGVSZWFkYWJsZSAtIGVuY29kaW5nLCB1dGYxNmJlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lX3V0ZjE2YmUuY3NzJykuZnNQYXRoO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHJlYWRBbmREZWNvZGVGcm9tRGlzayhwYXRoLCBlbmNvZGluZy5VVEYxNmJlKTtcblxuXHRcdGNvbnN0IGljb252ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJyk+KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJywgJ2xpYi9pY29udi1saXRlLXVtZC5qcycpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBWU0J1ZmZlci53cmFwKFxuXHRcdFx0aWNvbnYuZW5jb2RlKHNvdXJjZSwgZW5jb2RpbmcudG9Ob2RlRW5jb2RpbmcoZW5jb2RpbmcuVVRGMTZiZSkpXG5cdFx0KS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gc3RyZWFtcy5jb25zdW1lUmVhZGFibGUoXG5cdFx0XHRhd2FpdCBlbmNvZGluZy50b0VuY29kZVJlYWRhYmxlKHN0cmVhbXMudG9SZWFkYWJsZShzb3VyY2UpLCBlbmNvZGluZy5VVEYxNmJlKSxcblx0XHRcdFZTQnVmZmVyLmNvbmNhdFxuXHRcdCkudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndG9FbmNvZGVSZWFkYWJsZSAtIGVtcHR5IHJlYWRhYmxlIHRvIHV0ZjgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlOiBzdHJlYW1zLlJlYWRhYmxlPHN0cmluZz4gPSB7XG5cdFx0XHRyZWFkKCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gc3RyZWFtcy5jb25zdW1lUmVhZGFibGUoXG5cdFx0XHRhd2FpdCBlbmNvZGluZy50b0VuY29kZVJlYWRhYmxlKHNvdXJjZSwgZW5jb2RpbmcuVVRGOCksXG5cdFx0XHRWU0J1ZmZlci5jb25jYXRcblx0XHQpLnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCAnJyk7XG5cdH0pO1xuXG5cdFt7XG5cdFx0dXRmRW5jb2Rpbmc6IGVuY29kaW5nLlVURjgsXG5cdFx0cmVsYXRlZEJvbTogZW5jb2RpbmcuVVRGOF9CT01cblx0fSwge1xuXHRcdHV0ZkVuY29kaW5nOiBlbmNvZGluZy5VVEY4X3dpdGhfYm9tLFxuXHRcdHJlbGF0ZWRCb206IGVuY29kaW5nLlVURjhfQk9NXG5cdH0sIHtcblx0XHR1dGZFbmNvZGluZzogZW5jb2RpbmcuVVRGMTZiZSxcblx0XHRyZWxhdGVkQm9tOiBlbmNvZGluZy5VVEYxNmJlX0JPTSxcblx0fSwge1xuXHRcdHV0ZkVuY29kaW5nOiBlbmNvZGluZy5VVEYxNmxlLFxuXHRcdHJlbGF0ZWRCb206IGVuY29kaW5nLlVURjE2bGVfQk9NXG5cdH1dLmZvckVhY2goKHsgdXRmRW5jb2RpbmcsIHJlbGF0ZWRCb20gfSkgPT4ge1xuXHRcdHRlc3QoYHRvRW5jb2RlUmVhZGFibGUgLSBlbXB0eSByZWFkYWJsZSB0byAke3V0ZkVuY29kaW5nfSB3aXRoIEJPTWAsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNvdXJjZTogc3RyZWFtcy5SZWFkYWJsZTxzdHJpbmc+ID0ge1xuXHRcdFx0XHRyZWFkKCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBlbmNvZGVkUmVhZGFibGUgPSBlbmNvZGluZy50b0VuY29kZVJlYWRhYmxlKHNvdXJjZSwgdXRmRW5jb2RpbmcsIHsgYWRkQk9NOiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFZTQnVmZmVyLndyYXAoQnVmZmVyLmZyb20ocmVsYXRlZEJvbSkpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBzdHJlYW1zLmNvbnN1bWVSZWFkYWJsZShhd2FpdCBlbmNvZGVkUmVhZGFibGUsIFZTQnVmZmVyLmNvbmNhdCkudG9TdHJpbmcoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGluZ0V4aXN0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRmb3IgKGNvbnN0IGVuYyBpbiBlbmNvZGluZy5TVVBQT1JURURfRU5DT0RJTkdTKSB7XG5cdFx0XHRpZiAoZW5jID09PSBlbmNvZGluZy5VVEY4X3dpdGhfYm9tKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBza2lwIG92ZXIgZW5jb2RpbmdzIGZyb20gdXNcblx0XHRcdH1cblx0XHRcdGNvbnN0IGljb252ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJyk+KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJywgJ2xpYi9pY29udi1saXRlLXVtZC5qcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGljb252LmVuY29kaW5nRXhpc3RzKGVuYyksIHRydWUsIGVuYyk7XG5cdFx0fVxuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksUUFBUTtBQUNwQixZQUFZLGNBQWM7QUFDMUIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsMEJBQTBCLFVBQWtDLG9DQUFvQztBQUN6RyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUV4RCxlQUFzQixvQkFBb0IsTUFBaUg7QUFDMUosTUFBSTtBQUNILFVBQU0sRUFBRSxR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
