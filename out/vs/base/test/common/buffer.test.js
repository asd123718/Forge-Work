import assert from "assert";
import { timeout } from "../../common/async.js";
import { bufferedStreamToBuffer, bufferToReadable, bufferToStream, decodeBase64, decodeHex, encodeBase64, encodeHex, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from "../../common/buffer.js";
import { peekStream } from "../../common/stream.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Buffer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #71993 - VSBuffer#toString returns numbers", () => {
    const data = new Uint8Array([1, 2, 3, "h".charCodeAt(0), "i".charCodeAt(0), 4, 5]).buffer;
    const buffer = VSBuffer.wrap(new Uint8Array(data, 3, 2));
    assert.deepStrictEqual(buffer.toString(), "hi");
  });
  test("issue #251527 - VSBuffer#toString preserves BOM character in filenames", () => {
    const bomChar = "\uFEFF";
    const filename = `${bomChar}c.txt`;
    const buffer = VSBuffer.fromString(filename);
    const result = buffer.toString();
    assert.strictEqual(result, filename);
    assert.strictEqual(result.charCodeAt(0), 65279);
  });
  test("bufferToReadable / readableToBuffer", () => {
    const content = "Hello World";
    const readable = bufferToReadable(VSBuffer.fromString(content));
    assert.strictEqual(readableToBuffer(readable).toString(), content);
  });
  test("bufferToStream / streamToBuffer", async () => {
    const content = "Hello World";
    const stream = bufferToStream(VSBuffer.fromString(content));
    assert.strictEqual((await streamToBuffer(stream)).toString(), content);
  });
  test("bufferedStreamToBuffer", async () => {
    const content = "Hello World";
    const stream = await peekStream(bufferToStream(VSBuffer.fromString(content)), 1);
    assert.strictEqual((await bufferedStreamToBuffer(stream)).toString(), content);
  });
  test("bufferWriteableStream - basics (no error)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(chunks[1].toString(), "World");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - basics (error)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    stream.end();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 1);
  });
  test("bufferWriteableStream - buffers data when no listener", async () => {
    const stream = newWriteableBufferStream();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "HelloWorld");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - buffers errors when no listener", async () => {
    const stream = newWriteableBufferStream();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    stream.end();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 1);
  });
  test("bufferWriteableStream - buffers end when no listener", async () => {
    const stream = newWriteableBufferStream();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "HelloWorld");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - nothing happens after end()", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    let dataCalledAfterEnd = false;
    stream.on("data", (data) => {
      dataCalledAfterEnd = true;
    });
    let errorCalledAfterEnd = false;
    stream.on("error", (error) => {
      errorCalledAfterEnd = true;
    });
    let endCalledAfterEnd = false;
    stream.on("end", () => {
      endCalledAfterEnd = true;
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(dataCalledAfterEnd, false);
    assert.strictEqual(errorCalledAfterEnd, false);
    assert.strictEqual(endCalledAfterEnd, false);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(chunks[1].toString(), "World");
  });
  test("bufferWriteableStream - pause/resume (simple)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    stream.pause();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 0);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(ended, false);
    stream.resume();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "HelloWorld");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - pause/resume (pause after first write)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    stream.pause();
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(ended, false);
    stream.resume();
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(chunks[1].toString(), "World");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - pause/resume (error)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    stream.pause();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    stream.end();
    assert.strictEqual(chunks.length, 0);
    assert.strictEqual(ended, false);
    assert.strictEqual(errors.length, 0);
    stream.resume();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 1);
  });
  test("bufferWriteableStream - destroy", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    stream.destroy();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 0);
    assert.strictEqual(ended, false);
    assert.strictEqual(errors.length, 0);
  });
  test("Performance issue with VSBuffer#slice #76076", function() {
    if (typeof Buffer !== "undefined") {
      const buff = Buffer.from([10, 20, 30, 40]);
      const b2 = buff.slice(1, 3);
      assert.strictEqual(buff[1], 20);
      assert.strictEqual(b2[0], 20);
      buff[1] = 17;
      assert.strictEqual(buff[1], 17);
      assert.strictEqual(b2[0], 17);
    }
    {
      const unit = new Uint8Array([10, 20, 30, 40]);
      const u2 = unit.slice(1, 3);
      assert.strictEqual(unit[1], 20);
      assert.strictEqual(u2[0], 20);
      unit[1] = 17;
      assert.strictEqual(unit[1], 17);
      assert.strictEqual(u2[0], 20);
    }
    {
      const unit = new Uint8Array([10, 20, 30, 40]);
      const u2 = unit.subarray(1, 3);
      assert.strictEqual(unit[1], 20);
      assert.strictEqual(u2[0], 20);
      unit[1] = 17;
      assert.strictEqual(unit[1], 17);
      assert.strictEqual(u2[0], 17);
    }
  });
  test("indexOf", () => {
    const haystack = VSBuffer.fromString("abcaabbccaaabbbccc");
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("")), 0);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("a".repeat(100))), -1);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("a")), 0);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("c")), 2);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("c"), 4), 7);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("abcaa")), 0);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("caaab")), 8);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("ccc")), 15);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("cc"), 9), 15);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("cccb")), -1);
  });
  test("wrap", () => {
    const actual = new Uint8Array([1, 2, 3]);
    const wrapped = VSBuffer.wrap(actual);
    assert.strictEqual(wrapped.byteLength, 3);
    assert.deepStrictEqual(Array.from(wrapped.buffer), [1, 2, 3]);
  });
  test("fromString", () => {
    const value = "Hello World";
    const buff = VSBuffer.fromString(value);
    assert.strictEqual(buff.toString(), value);
  });
  test("fromByteArray", () => {
    const array = [1, 2, 3, 4, 5];
    const buff = VSBuffer.fromByteArray(array);
    assert.strictEqual(buff.byteLength, array.length);
    assert.deepStrictEqual(Array.from(buff.buffer), array);
  });
  test("concat", () => {
    const chunks = [
      VSBuffer.fromString("abc"),
      VSBuffer.fromString("def"),
      VSBuffer.fromString("ghi")
    ];
    const result1 = VSBuffer.concat(chunks);
    assert.strictEqual(result1.toString(), "abcdefghi");
    const result2 = VSBuffer.concat(chunks, 9);
    assert.strictEqual(result2.toString(), "abcdefghi");
  });
  test("clone", () => {
    const original = VSBuffer.fromString("test");
    const clone = original.clone();
    assert.notStrictEqual(original.buffer, clone.buffer);
    assert.deepStrictEqual(Array.from(original.buffer), Array.from(clone.buffer));
  });
  test("slice", () => {
    const buff = VSBuffer.fromString("Hello World");
    const slice1 = buff.slice(0, 5);
    assert.strictEqual(slice1.toString(), "Hello");
    const slice2 = buff.slice(6);
    assert.strictEqual(slice2.toString(), "World");
  });
  test("set", () => {
    const buff = VSBuffer.alloc(5);
    buff.set(VSBuffer.fromString("ab"), 0);
    assert.strictEqual(buff.toString().substring(0, 2), "ab");
    buff.set(new Uint8Array([99, 100]), 2);
    assert.strictEqual(buff.toString().substring(2, 4), "cd");
    assert.throws(() => {
      buff.set({});
    });
  });
  test("equals", () => {
    const buff1 = VSBuffer.fromString("test");
    const buff2 = VSBuffer.fromString("test");
    const buff3 = VSBuffer.fromString("different");
    const buff4 = VSBuffer.fromString("tes1");
    assert.strictEqual(buff1.equals(buff1), true);
    assert.strictEqual(buff1.equals(buff2), true);
    assert.strictEqual(buff1.equals(buff3), false);
    assert.strictEqual(buff1.equals(buff4), false);
  });
  test("read/write methods", () => {
    const buff = VSBuffer.alloc(8);
    buff.writeUInt32BE(305419896, 0);
    assert.strictEqual(buff.readUInt32BE(0), 305419896);
    buff.writeUInt32LE(305419896, 4);
    assert.strictEqual(buff.readUInt32LE(4), 305419896);
    const buff2 = VSBuffer.alloc(1);
    buff2.writeUInt8(123, 0);
    assert.strictEqual(buff2.readUInt8(0), 123);
  });
  suite("encoding", () => {
    const testCases = [
      [new Uint8Array([]), "", ""],
      [new Uint8Array([77]), "TQ==", "4d"],
      [new Uint8Array([230, 138]), "5oo=", "e68a"],
      [new Uint8Array([104, 98, 82]), "aGJS", "686252"],
      [new Uint8Array([92, 114, 57, 209]), "XHI50Q==", "5c7239d1"],
      [new Uint8Array([238, 51, 1, 240, 124]), "7jMB8Hw=", "ee3301f07c"],
      [new Uint8Array([96, 54, 130, 79, 47, 179]), "YDaCTy+z", "6036824f2fb3"],
      [new Uint8Array([91, 22, 68, 217, 68, 117, 116]), "WxZE2UR1dA==", "5b1644d9447574"],
      [new Uint8Array([184, 227, 214, 171, 244, 175, 141, 53]), "uOPWq/SvjTU=", "b8e3d6abf4af8d35"],
      [new Uint8Array([53, 98, 93, 130, 71, 117, 191, 137, 156]), "NWJdgkd1v4mc", "35625d824775bf899c"],
      [new Uint8Array([154, 156, 60, 102, 232, 197, 92, 25, 124, 98]), "mpw8ZujFXBl8Yg==", "9a9c3c66e8c55c197c62"],
      [new Uint8Array([152, 131, 106, 234, 17, 183, 164, 245, 252, 67, 26]), "mINq6hG3pPX8Qxo=", "98836aea11b7a4f5fc431a"],
      [new Uint8Array([232, 254, 194, 234, 16, 42, 86, 135, 117, 61, 179, 4]), "6P7C6hAqVod1PbME", "e8fec2ea102a5687753db304"],
      [new Uint8Array([4, 199, 85, 172, 125, 171, 172, 219, 61, 47, 78, 155, 127]), "BMdVrH2rrNs9L06bfw==", "04c755ac7dabacdb3d2f4e9b7f"],
      [new Uint8Array([189, 67, 62, 189, 87, 171, 27, 164, 87, 142, 126, 113, 23, 182]), "vUM+vVerG6RXjn5xF7Y=", "bd433ebd57ab1ba4578e7e7117b6"],
      [new Uint8Array([153, 156, 145, 240, 228, 200, 199, 158, 40, 167, 97, 52, 217, 148, 43]), "mZyR8OTIx54op2E02ZQr", "999c91f0e4c8c79e28a76134d9942b"]
    ];
    test("encodes base64", () => {
      for (const [bytes, expected] of testCases) {
        assert.strictEqual(encodeBase64(VSBuffer.wrap(bytes)), expected);
      }
    });
    test("decodes, base64", () => {
      for (const [expected, encoded] of testCases) {
        assert.deepStrictEqual(new Uint8Array(decodeBase64(encoded).buffer), expected);
      }
    });
    test("encodes hex", () => {
      for (const [bytes, , expected] of testCases) {
        assert.strictEqual(encodeHex(VSBuffer.wrap(bytes)), expected);
      }
    });
    test("decodes, hex", () => {
      for (const [expected, , encoded] of testCases) {
        assert.deepStrictEqual(new Uint8Array(decodeHex(encoded).buffer), expected);
      }
    });
    test("throws error on invalid encoding", () => {
      assert.throws(() => decodeBase64("invalid!"));
      assert.throws(() => decodeHex("invalid!"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGJ1ZmZlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBidWZmZXJlZFN0cmVhbVRvQnVmZmVyLCBidWZmZXJUb1JlYWRhYmxlLCBidWZmZXJUb1N0cmVhbSwgZGVjb2RlQmFzZTY0LCBkZWNvZGVIZXgsIGVuY29kZUJhc2U2NCwgZW5jb2RlSGV4LCBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0sIHJlYWRhYmxlVG9CdWZmZXIsIHN0cmVhbVRvQnVmZmVyLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgcGVla1N0cmVhbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdCdWZmZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNzdWUgIzcxOTkzIC0gVlNCdWZmZXIjdG9TdHJpbmcgcmV0dXJucyBudW1iZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShbMSwgMiwgMywgJ2gnLmNoYXJDb2RlQXQoMCksICdpJy5jaGFyQ29kZUF0KDApLCA0LCA1XSkuYnVmZmVyO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoZGF0YSwgMywgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVmZmVyLnRvU3RyaW5nKCksICdoaScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjUxNTI3IC0gVlNCdWZmZXIjdG9TdHJpbmcgcHJlc2VydmVzIEJPTSBjaGFyYWN0ZXIgaW4gZmlsZW5hbWVzJywgKCkgPT4ge1xuXHRcdC8vIEJPTSBjaGFyYWN0ZXIgKFUrRkVGRikgaXMgYSB6ZXJvLXdpZHRoIGNoYXJhY3RlciB0aGF0IHdhcyBiZWluZyBzdHJpcHBlZFxuXHRcdC8vIHdoZW4gZGVzZXJpYWxpemluZyBtZXNzYWdlcyBpbiB0aGUgSVBDIGxheWVyLiBUaGlzIHRlc3QgdmVyaWZpZXMgdGhhdFxuXHRcdC8vIHRoZSBCT00gY2hhcmFjdGVyIGlzIHByZXNlcnZlZCB3aGVuIHVzaW5nIFZTQnVmZmVyLnRvU3RyaW5nKCkuXG5cdFx0Y29uc3QgYm9tQ2hhciA9ICdcXHVGRUZGJztcblx0XHRjb25zdCBmaWxlbmFtZSA9IGAke2JvbUNoYXJ9Yy50eHRgO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLmZyb21TdHJpbmcoZmlsZW5hbWUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJ1ZmZlci50b1N0cmluZygpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBCT00gY2hhcmFjdGVyIGlzIHByZXNlcnZlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZpbGVuYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNoYXJDb2RlQXQoMCksIDB4RkVGRik7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlclRvUmVhZGFibGUgLyByZWFkYWJsZVRvQnVmZmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnSGVsbG8gV29ybGQnO1xuXHRcdGNvbnN0IHJlYWRhYmxlID0gYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkYWJsZVRvQnVmZmVyKHJlYWRhYmxlKS50b1N0cmluZygpLCBjb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyVG9TdHJlYW0gLyBzdHJlYW1Ub0J1ZmZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCBzdHJlYW0gPSBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc3RyZWFtVG9CdWZmZXIoc3RyZWFtKSkudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcmVkU3RyZWFtVG9CdWZmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3Qgc3RyZWFtID0gYXdhaXQgcGVla1N0cmVhbShidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKSwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGJ1ZmZlcmVkU3RyZWFtVG9CdWZmZXIoc3RyZWFtKSkudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcldyaXRlYWJsZVN0cmVhbSAtIGJhc2ljcyAobm8gZXJyb3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGxldCBlbmRlZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdGVycm9ycy5wdXNoKGVycm9yKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdXb3JsZCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMV0udG9TdHJpbmcoKSwgJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcldyaXRlYWJsZVN0cmVhbSAtIGJhc2ljcyAoZXJyb3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGxldCBlbmRlZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdGVycm9ycy5wdXNoKGVycm9yKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRzdHJlYW0uZW5kKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gYnVmZmVycyBkYXRhIHdoZW4gbm8gbGlzdGVuZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnV29ybGQnKSk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0udG9TdHJpbmcoKSwgJ0hlbGxvV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gYnVmZmVycyBlcnJvcnMgd2hlbiBubyBsaXN0ZW5lcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblxuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRzdHJlYW0uZW5kKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gYnVmZmVycyBlbmQgd2hlbiBubyBsaXN0ZW5lcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdXb3JsZCcpKTtcblxuXHRcdGxldCBlbmRlZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG9Xb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBub3RoaW5nIGhhcHBlbnMgYWZ0ZXIgZW5kKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ1dvcmxkJykpO1xuXG5cdFx0bGV0IGRhdGFDYWxsZWRBZnRlckVuZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0ZGF0YUNhbGxlZEFmdGVyRW5kID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGxldCBlcnJvckNhbGxlZEFmdGVyRW5kID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdGVycm9yQ2FsbGVkQWZ0ZXJFbmQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZENhbGxlZEFmdGVyRW5kID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRDYWxsZWRBZnRlckVuZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ1dvcmxkJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGFDYWxsZWRBZnRlckVuZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvckNhbGxlZEFmdGVyRW5kLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZENhbGxlZEFmdGVyRW5kLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzFdLnRvU3RyaW5nKCksICdXb3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBwYXVzZS9yZXN1bWUgKHNpbXBsZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0c3RyZWFtLnBhdXNlKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnV29ybGQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLnJlc3VtZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0udG9TdHJpbmcoKSwgJ0hlbGxvV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gcGF1c2UvcmVzdW1lIChwYXVzZSBhZnRlciBmaXJzdCB3cml0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cblx0XHRzdHJlYW0ucGF1c2UoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdXb3JsZCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIGZhbHNlKTtcblxuXHRcdHN0cmVhbS5yZXN1bWUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMV0udG9TdHJpbmcoKSwgJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcldyaXRlYWJsZVN0cmVhbSAtIHBhdXNlL3Jlc3VtZSAoZXJyb3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGxldCBlbmRlZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdGVycm9ycy5wdXNoKGVycm9yKTtcblx0XHR9KTtcblxuXHRcdHN0cmVhbS5wYXVzZSgpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdHN0cmVhbS5lbmQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JzLmxlbmd0aCwgMCk7XG5cblx0XHRzdHJlYW0ucmVzdW1lKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gZGVzdHJveScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZGVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRzdHJlYW0uZGVzdHJveSgpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ1dvcmxkJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnUGVyZm9ybWFuY2UgaXNzdWUgd2l0aCBWU0J1ZmZlciNzbGljZSAjNzYwNzYnLCBmdW5jdGlvbiAoKSB7IC8vIFRPRE9AYWxleGRpbWEgdGhpcyB0ZXN0IHNlZW1zIHRvIGZhaWwgaW4gd2ViIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE0MDQyKVxuXHRcdC8vIEJ1ZmZlciNzbGljZSBjcmVhdGVzIGEgdmlld1xuXHRcdGlmICh0eXBlb2YgQnVmZmVyICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3QgYnVmZiA9IEJ1ZmZlci5mcm9tKFsxMCwgMjAsIDMwLCA0MF0pO1xuXHRcdFx0Y29uc3QgYjIgPSBidWZmLnNsaWNlKDEsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZbMV0sIDIwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiMlswXSwgMjApO1xuXG5cdFx0XHRidWZmWzFdID0gMTc7IC8vIG1vZGlmeSBidWZmIEFORCBiMlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZbMV0sIDE3KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiMlswXSwgMTcpO1xuXHRcdH1cblxuXHRcdC8vIFR5cGVkQXJyYXkjc2xpY2UgY3JlYXRlcyBhIGNvcHlcblx0XHR7XG5cdFx0XHRjb25zdCB1bml0ID0gbmV3IFVpbnQ4QXJyYXkoWzEwLCAyMCwgMzAsIDQwXSk7XG5cdFx0XHRjb25zdCB1MiA9IHVuaXQuc2xpY2UoMSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pdFsxXSwgMjApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHUyWzBdLCAyMCk7XG5cblx0XHRcdHVuaXRbMV0gPSAxNzsgLy8gbW9kaWZ5IHVuaXQsIE5PVCBiMlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaXRbMV0sIDE3KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1MlswXSwgMjApO1xuXHRcdH1cblxuXHRcdC8vIFR5cGVkQXJyYXkjc3ViYXJyYXkgY3JlYXRlcyBhIHZpZXdcblx0XHR7XG5cdFx0XHRjb25zdCB1bml0ID0gbmV3IFVpbnQ4QXJyYXkoWzEwLCAyMCwgMzAsIDQwXSk7XG5cdFx0XHRjb25zdCB1MiA9IHVuaXQuc3ViYXJyYXkoMSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pdFsxXSwgMjApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHUyWzBdLCAyMCk7XG5cblx0XHRcdHVuaXRbMV0gPSAxNzsgLy8gbW9kaWZ5IHVuaXQgQU5EIGIyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pdFsxXSwgMTcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHUyWzBdLCAxNyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpbmRleE9mJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhheXN0YWNrID0gVlNCdWZmZXIuZnJvbVN0cmluZygnYWJjYWFiYmNjYWFhYmJiY2NjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhheXN0YWNrLmluZGV4T2YoVlNCdWZmZXIuZnJvbVN0cmluZygnJykpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdhJy5yZXBlYXQoMTAwKSkpLCAtMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdhJykpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdjJykpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdjJyksIDQpLCA3KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiY2FhJykpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdjYWFhYicpKSwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhheXN0YWNrLmluZGV4T2YoVlNCdWZmZXIuZnJvbVN0cmluZygnY2NjJykpLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhheXN0YWNrLmluZGV4T2YoVlNCdWZmZXIuZnJvbVN0cmluZygnY2MnKSwgOSksIDE1KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2NjY2InKSksIC0xKTtcblx0fSk7XG5cblx0dGVzdCgnd3JhcCcsICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSBuZXcgVWludDhBcnJheShbMSwgMiwgM10pO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBWU0J1ZmZlci53cmFwKGFjdHVhbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdyYXBwZWQuYnl0ZUxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKHdyYXBwZWQuYnVmZmVyKSwgWzEsIDIsIDNdKTtcblx0fSk7XG5cblx0dGVzdCgnZnJvbVN0cmluZycsICgpID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3QgYnVmZiA9IFZTQnVmZmVyLmZyb21TdHJpbmcodmFsdWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmLnRvU3RyaW5nKCksIHZhbHVlKTtcblx0fSk7XG5cblx0dGVzdCgnZnJvbUJ5dGVBcnJheScsICgpID0+IHtcblx0XHRjb25zdCBhcnJheSA9IFsxLCAyLCAzLCA0LCA1XTtcblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuZnJvbUJ5dGVBcnJheShhcnJheSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYuYnl0ZUxlbmd0aCwgYXJyYXkubGVuZ3RoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oYnVmZi5idWZmZXIpLCBhcnJheSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmNhdCcsICgpID0+IHtcblx0XHRjb25zdCBjaHVua3MgPSBbXG5cdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYmMnKSxcblx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoJ2RlZicpLFxuXHRcdFx0VlNCdWZmZXIuZnJvbVN0cmluZygnZ2hpJylcblx0XHRdO1xuXG5cdFx0Ly8gVGVzdCB3aXRob3V0IHRvdGFsIGxlbmd0aFxuXHRcdGNvbnN0IHJlc3VsdDEgPSBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS50b1N0cmluZygpLCAnYWJjZGVmZ2hpJyk7XG5cblx0XHQvLyBUZXN0IHdpdGggdG90YWwgbGVuZ3RoXG5cdFx0Y29uc3QgcmVzdWx0MiA9IFZTQnVmZmVyLmNvbmNhdChjaHVua3MsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLnRvU3RyaW5nKCksICdhYmNkZWZnaGknKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0Jyk7XG5cdFx0Y29uc3QgY2xvbmUgPSBvcmlnaW5hbC5jbG9uZSgpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG9yaWdpbmFsLmJ1ZmZlciwgY2xvbmUuYnVmZmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20ob3JpZ2luYWwuYnVmZmVyKSwgQXJyYXkuZnJvbShjbG9uZS5idWZmZXIpKTtcblx0fSk7XG5cblx0dGVzdCgnc2xpY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVmZiA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRjb25zdCBzbGljZTEgPSBidWZmLnNsaWNlKDAsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbGljZTEudG9TdHJpbmcoKSwgJ0hlbGxvJyk7XG5cblx0XHRjb25zdCBzbGljZTIgPSBidWZmLnNsaWNlKDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbGljZTIudG9TdHJpbmcoKSwgJ1dvcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldCcsICgpID0+IHtcblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuYWxsb2MoNSk7XG5cblx0XHQvLyBUZXN0IHNldHRpbmcgZnJvbSBWU0J1ZmZlclxuXHRcdGJ1ZmYuc2V0KFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJyksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDAsIDIpLCAnYWInKTtcblxuXHRcdC8vIFRlc3Qgc2V0dGluZyBmcm9tIFVpbnQ4QXJyYXlcblx0XHRidWZmLnNldChuZXcgVWludDhBcnJheShbOTksIDEwMF0pLCAyKTsgLy8gJ2NkJ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDIsIDQpLCAnY2QnKTtcblxuXHRcdC8vIFRlc3QgaW52YWxpZCBpbnB1dFxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRidWZmLnNldCh7fSBhcyBhbnkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlcXVhbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVmZjEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0Jyk7XG5cdFx0Y29uc3QgYnVmZjIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0Jyk7XG5cdFx0Y29uc3QgYnVmZjMgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdkaWZmZXJlbnQnKTtcblx0XHRjb25zdCBidWZmNCA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3RlczEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmMS5lcXVhbHMoYnVmZjEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZjEuZXF1YWxzKGJ1ZmYyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYxLmVxdWFscyhidWZmMyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZjEuZXF1YWxzKGJ1ZmY0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkL3dyaXRlIG1ldGhvZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVmZiA9IFZTQnVmZmVyLmFsbG9jKDgpO1xuXG5cdFx0Ly8gVGVzdCBVSW50MzJCRVxuXHRcdGJ1ZmYud3JpdGVVSW50MzJCRSgweDEyMzQ1Njc4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZi5yZWFkVUludDMyQkUoMCksIDB4MTIzNDU2NzgpO1xuXG5cdFx0Ly8gVGVzdCBVSW50MzJMRVxuXHRcdGJ1ZmYud3JpdGVVSW50MzJMRSgweDEyMzQ1Njc4LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZi5yZWFkVUludDMyTEUoNCksIDB4MTIzNDU2NzgpO1xuXG5cdFx0Ly8gVGVzdCBVSW50OFxuXHRcdGNvbnN0IGJ1ZmYyID0gVlNCdWZmZXIuYWxsb2MoMSk7XG5cdFx0YnVmZjIud3JpdGVVSW50OCgxMjMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmMi5yZWFkVUludDgoMCksIDEyMyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlbmNvZGluZycsICgpID0+IHtcblx0XHQvKlxuXHRcdEdlbmVyYXRlZCB3aXRoOlxuXG5cdFx0Y29uc3QgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDE2OyBpKyspIHtcblx0XHRcdGNvbnN0IGJ1ZiA9ICBjcnlwdG8ucmFuZG9tQnl0ZXMoaSk7XG5cdFx0XHRjb25zb2xlLmxvZyhgW25ldyBVaW50OEFycmF5KFske0FycmF5LmZyb20oYnVmKS5qb2luKCcsICcpfV0pLCAnJHtidWYudG9TdHJpbmcoJ2Jhc2U2NCcpfSddLGApXG5cdFx0fVxuXG5cdFx0Ki9cblxuXHRcdGNvbnN0IHRlc3RDYXNlczogW1VpbnQ4QXJyYXksIGJhc2U2NDogc3RyaW5nLCBoZXg6IHN0cmluZ11bXSA9IFtcblx0XHRcdFtuZXcgVWludDhBcnJheShbXSksICcnLCAnJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzc3XSksICdUUT09JywgJzRkJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzIzMCwgMTM4XSksICc1b289JywgJ2U2OGEnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMTA0LCA5OCwgODJdKSwgJ2FHSlMnLCAnNjg2MjUyJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzkyLCAxMTQsIDU3LCAyMDldKSwgJ1hISTUwUT09JywgJzVjNzIzOWQxJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzIzOCwgNTEsIDEsIDI0MCwgMTI0XSksICc3ak1COEh3PScsICdlZTMzMDFmMDdjJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzk2LCA1NCwgMTMwLCA3OSwgNDcsIDE3OV0pLCAnWURhQ1R5K3onLCAnNjAzNjgyNGYyZmIzJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzkxLCAyMiwgNjgsIDIxNywgNjgsIDExNywgMTE2XSksICdXeFpFMlVSMWRBPT0nLCAnNWIxNjQ0ZDk0NDc1NzQnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMTg0LCAyMjcsIDIxNCwgMTcxLCAyNDQsIDE3NSwgMTQxLCA1M10pLCAndU9QV3EvU3ZqVFU9JywgJ2I4ZTNkNmFiZjRhZjhkMzUnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbNTMsIDk4LCA5MywgMTMwLCA3MSwgMTE3LCAxOTEsIDEzNywgMTU2XSksICdOV0pkZ2tkMXY0bWMnLCAnMzU2MjVkODI0Nzc1YmY4OTljJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzE1NCwgMTU2LCA2MCwgMTAyLCAyMzIsIDE5NywgOTIsIDI1LCAxMjQsIDk4XSksICdtcHc4WnVqRlhCbDhZZz09JywgJzlhOWMzYzY2ZThjNTVjMTk3YzYyJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzE1MiwgMTMxLCAxMDYsIDIzNCwgMTcsIDE4MywgMTY0LCAyNDUsIDI1MiwgNjcsIDI2XSksICdtSU5xNmhHM3BQWDhReG89JywgJzk4ODM2YWVhMTFiN2E0ZjVmYzQzMWEnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMjMyLCAyNTQsIDE5NCwgMjM0LCAxNiwgNDIsIDg2LCAxMzUsIDExNywgNjEsIDE3OSwgNF0pLCAnNlA3QzZoQXFWb2QxUGJNRScsICdlOGZlYzJlYTEwMmE1Njg3NzUzZGIzMDQnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbNCwgMTk5LCA4NSwgMTcyLCAxMjUsIDE3MSwgMTcyLCAyMTksIDYxLCA0NywgNzgsIDE1NSwgMTI3XSksICdCTWRWckgycnJOczlMMDZiZnc9PScsICcwNGM3NTVhYzdkYWJhY2RiM2QyZjRlOWI3ZiddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFsxODksIDY3LCA2MiwgMTg5LCA4NywgMTcxLCAyNywgMTY0LCA4NywgMTQyLCAxMjYsIDExMywgMjMsIDE4Ml0pLCAndlVNK3ZWZXJHNlJYam41eEY3WT0nLCAnYmQ0MzNlYmQ1N2FiMWJhNDU3OGU3ZTcxMTdiNiddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFsxNTMsIDE1NiwgMTQ1LCAyNDAsIDIyOCwgMjAwLCAxOTksIDE1OCwgNDAsIDE2NywgOTcsIDUyLCAyMTcsIDE0OCwgNDNdKSwgJ21aeVI4T1RJeDU0b3AyRTAyWlFyJywgJzk5OWM5MWYwZTRjOGM3OWUyOGE3NjEzNGQ5OTQyYiddLFxuXHRcdF07XG5cblx0XHR0ZXN0KCdlbmNvZGVzIGJhc2U2NCcsICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2J5dGVzLCBleHBlY3RlZF0gb2YgdGVzdENhc2VzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcChieXRlcykpLCBleHBlY3RlZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWNvZGVzLCBiYXNlNjQnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtleHBlY3RlZCwgZW5jb2RlZF0gb2YgdGVzdENhc2VzKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3IFVpbnQ4QXJyYXkoZGVjb2RlQmFzZTY0KGVuY29kZWQpLmJ1ZmZlciksIGV4cGVjdGVkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VuY29kZXMgaGV4JywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbYnl0ZXMsICwgZXhwZWN0ZWRdIG9mIHRlc3RDYXNlcykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5jb2RlSGV4KFZTQnVmZmVyLndyYXAoYnl0ZXMpKSwgZXhwZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVjb2RlcywgaGV4JywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbZXhwZWN0ZWQsICwgZW5jb2RlZF0gb2YgdGVzdENhc2VzKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3IFVpbnQ4QXJyYXkoZGVjb2RlSGV4KGVuY29kZWQpLmJ1ZmZlciksIGV4cGVjdGVkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBlcnJvciBvbiBpbnZhbGlkIGVuY29kaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBkZWNvZGVCYXNlNjQoJ2ludmFsaWQhJykpO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBkZWNvZGVIZXgoJ2ludmFsaWQhJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QixrQkFBa0IsZ0JBQWdCLGNBQWMsV0FBVyxjQUFjLFdBQVcsMEJBQTBCLGtCQUFrQixnQkFBZ0IsZ0JBQWdCO0FBQ2pNLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sVUFBVSxNQUFNO0FBRXJCLDBDQUF3QztBQUV4QyxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFVBQU0sT0FBTyxJQUFJLFdBQVcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxHQUFHLElBQUksV0FBVyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsRUFBRTtBQUNuRixVQUFNLFNBQVMsU0FBUyxLQUFL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
