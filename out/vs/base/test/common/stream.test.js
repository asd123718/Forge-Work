import assert from "assert";
import { timeout } from "../../common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { bufferToReadable, VSBuffer } from "../../common/buffer.js";
import { CancellationTokenSource } from "../../common/cancellation.js";
import { consumeReadable, consumeStream, isReadable, isReadableBufferedStream, isReadableStream, listenStream, newWriteableStream, peekReadable, peekStream, prefixedReadable, prefixedStream, toReadable, toStream, transform } from "../../common/stream.js";
suite("Stream", () => {
  test("isReadable", () => {
    assert.ok(!isReadable(void 0));
    assert.ok(!isReadable(/* @__PURE__ */ Object.create(null)));
    assert.ok(isReadable(bufferToReadable(VSBuffer.fromString(""))));
  });
  test("isReadableStream", () => {
    assert.ok(!isReadableStream(void 0));
    assert.ok(!isReadableStream(/* @__PURE__ */ Object.create(null)));
    assert.ok(isReadableStream(newWriteableStream((d) => d)));
  });
  test("isReadableBufferedStream", async () => {
    assert.ok(!isReadableBufferedStream(/* @__PURE__ */ Object.create(null)));
    const stream = newWriteableStream((d) => d);
    stream.end();
    const bufferedStream = await peekStream(stream, 1);
    assert.ok(isReadableBufferedStream(bufferedStream));
  });
  test("WriteableStream - basics", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    stream.on("error", (e) => {
      error = true;
    });
    let end = false;
    stream.on("end", () => {
      end = true;
    });
    stream.write("Hello");
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    assert.strictEqual(chunks[0], "Hello");
    stream.write("World");
    assert.strictEqual(chunks[1], "World");
    assert.strictEqual(error, false);
    assert.strictEqual(end, false);
    stream.pause();
    stream.write("1");
    stream.write("2");
    stream.write("3");
    assert.strictEqual(chunks.length, 2);
    stream.resume();
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[2], "1,2,3");
    stream.error(new Error());
    assert.strictEqual(error, true);
    error = false;
    stream.error(new Error());
    assert.strictEqual(error, true);
    stream.end("Final Bit");
    assert.strictEqual(chunks.length, 4);
    assert.strictEqual(chunks[3], "Final Bit");
    assert.strictEqual(end, true);
    stream.destroy();
    stream.write("Unexpected");
    assert.strictEqual(chunks.length, 4);
  });
  test("stream with non-reducible messages", () => {
    class TestMessage {
      constructor(value) {
        this.value = value;
      }
    }
    const stream = newWriteableStream(null);
    let error = false;
    stream.on("error", (e) => {
      error = true;
    });
    let end = false;
    stream.on("end", () => {
      end = true;
    });
    stream.write(new TestMessage("Hello"));
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    assert(
      chunks[0] instanceof TestMessage,
      "Message `0` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[0].value, "Hello");
    stream.write(new TestMessage("World"));
    assert(
      chunks[1] instanceof TestMessage,
      "Message `1` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[1].value, "World");
    assert.strictEqual(error, false);
    assert.strictEqual(end, false);
    stream.pause();
    stream.write(new TestMessage("1"));
    stream.write(new TestMessage("2"));
    stream.write(new TestMessage("3"));
    assert.strictEqual(chunks.length, 2);
    stream.resume();
    assert.strictEqual(chunks.length, 5);
    assert(
      chunks[2] instanceof TestMessage,
      "Message `2` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[2].value, "1");
    assert(
      chunks[3] instanceof TestMessage,
      "Message `3` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[3].value, "2");
    assert(
      chunks[4] instanceof TestMessage,
      "Message `4` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[4].value, "3");
    stream.error(new Error());
    assert.strictEqual(error, true);
    error = false;
    stream.error(new Error());
    assert.strictEqual(error, true);
    stream.end(new TestMessage("Final Bit"));
    assert.strictEqual(chunks.length, 6);
    assert(
      chunks[5] instanceof TestMessage,
      "Message `5` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[5].value, "Final Bit");
    assert.strictEqual(end, true);
    stream.destroy();
    stream.write(new TestMessage("Unexpected"));
    assert.strictEqual(chunks.length, 6);
  });
  test("WriteableStream - end with empty string works", async () => {
    const reducer = (strings) => strings.length > 0 ? strings.join() : "error";
    const stream = newWriteableStream(reducer);
    stream.end("");
    const result = await consumeStream(stream, reducer);
    assert.strictEqual(result, "");
  });
  test("WriteableStream - end with error works", async () => {
    const reducer = (errors) => errors[0];
    const stream = newWriteableStream(reducer);
    stream.end(new Error("error"));
    const result = await consumeStream(stream, reducer);
    assert.ok(result instanceof Error);
  });
  test("WriteableStream - removeListener", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    const errorListener = (e) => {
      error = true;
    };
    stream.on("error", errorListener);
    let data = false;
    const dataListener = () => {
      data = true;
    };
    stream.on("data", dataListener);
    stream.write("Hello");
    assert.strictEqual(data, true);
    data = false;
    stream.removeListener("data", dataListener);
    stream.write("World");
    assert.strictEqual(data, false);
    stream.error(new Error());
    assert.strictEqual(error, true);
    error = false;
    stream.removeListener("error", errorListener);
    stream.on("error", () => {
    });
    stream.error(new Error());
    assert.strictEqual(error, false);
  });
  test("WriteableStream - highWaterMark", async () => {
    const stream = newWriteableStream((strings) => strings.join(), { highWaterMark: 3 });
    let res = stream.write("1");
    assert.ok(!res);
    res = stream.write("2");
    assert.ok(!res);
    res = stream.write("3");
    assert.ok(!res);
    const promise1 = stream.write("4");
    assert.ok(promise1 instanceof Promise);
    const promise2 = stream.write("5");
    assert.ok(promise2 instanceof Promise);
    let drained1 = false;
    (async () => {
      await promise1;
      drained1 = true;
    })();
    let drained2 = false;
    (async () => {
      await promise2;
      drained2 = true;
    })();
    let data = void 0;
    stream.on("data", (chunk) => {
      data = chunk;
    });
    assert.ok(data);
    await timeout(0);
    assert.strictEqual(drained1, true);
    assert.strictEqual(drained2, true);
  });
  test("consumeReadable", () => {
    const readable = arrayToReadable(["1", "2", "3", "4", "5"]);
    const consumed = consumeReadable(readable, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("peekReadable", () => {
    for (let i = 0; i < 5; i++) {
      const readable2 = arrayToReadable(["1", "2", "3", "4", "5"]);
      const consumedOrReadable2 = peekReadable(readable2, (strings) => strings.join(), i);
      if (typeof consumedOrReadable2 === "string") {
        assert.fail("Unexpected result");
      } else {
        const consumed = consumeReadable(consumedOrReadable2, (strings) => strings.join());
        assert.strictEqual(consumed, "1,2,3,4,5");
      }
    }
    let readable = arrayToReadable(["1", "2", "3", "4", "5"]);
    let consumedOrReadable = peekReadable(readable, (strings) => strings.join(), 5);
    assert.strictEqual(consumedOrReadable, "1,2,3,4,5");
    readable = arrayToReadable(["1", "2", "3", "4", "5"]);
    consumedOrReadable = peekReadable(readable, (strings) => strings.join(), 6);
    assert.strictEqual(consumedOrReadable, "1,2,3,4,5");
  });
  test("peekReadable - error handling", async () => {
    let stream = newWriteableStream((data) => data);
    let error = void 0;
    let promise = (async () => {
      try {
        await peekStream(stream, 1);
      } catch (err) {
        error = err;
      }
    })();
    stream.error(new Error());
    await promise;
    assert.ok(error);
    stream = newWriteableStream((data) => data);
    error = void 0;
    promise = (async () => {
      try {
        await peekStream(stream, 1);
      } catch (err) {
        error = err;
      }
    })();
    stream.write("foo");
    stream.error(new Error());
    await promise;
    assert.ok(error);
    stream = newWriteableStream((data) => data);
    error = void 0;
    promise = (async () => {
      try {
        await peekStream(stream, 1);
      } catch (err) {
        error = err;
      }
    })();
    stream.write("foo");
    stream.write("bar");
    stream.error(new Error());
    await promise;
    assert.ok(!error);
    stream.on("error", (err) => error = err);
    stream.on("data", (chunk) => {
    });
    assert.ok(error);
  });
  function arrayToReadable(array) {
    return {
      read: () => array.shift() || null
    };
  }
  function readableToStream(readable) {
    const stream = newWriteableStream((strings) => strings.join());
    setTimeout(() => {
      let chunk = null;
      while ((chunk = readable.read()) !== null) {
        stream.write(chunk);
      }
      stream.end();
    }, 0);
    return stream;
  }
  test("consumeStream", async () => {
    const stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    const consumed = await consumeStream(stream, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("consumeStream - without reducer", async () => {
    const stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    const consumed = await consumeStream(stream);
    assert.strictEqual(consumed, void 0);
  });
  test("consumeStream - without reducer and error", async () => {
    const stream = newWriteableStream((strings) => strings.join());
    stream.error(new Error());
    const consumed = await consumeStream(stream);
    assert.strictEqual(consumed, void 0);
  });
  test("listenStream", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    let end = false;
    let data = "";
    listenStream(stream, {
      onData: (d) => {
        data = d;
      },
      onError: (e) => {
        error = true;
      },
      onEnd: () => {
        end = true;
      }
    });
    stream.write("Hello");
    assert.strictEqual(data, "Hello");
    stream.write("World");
    assert.strictEqual(data, "World");
    assert.strictEqual(error, false);
    assert.strictEqual(end, false);
    stream.error(new Error());
    assert.strictEqual(error, true);
    stream.end("Final Bit");
    assert.strictEqual(end, true);
  });
  test("listenStream - cancellation", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    let end = false;
    let data = "";
    const cts = new CancellationTokenSource();
    listenStream(stream, {
      onData: (d) => {
        data = d;
      },
      onError: (e) => {
        error = true;
      },
      onEnd: () => {
        end = true;
      }
    }, cts.token);
    cts.cancel();
    stream.write("Hello");
    assert.strictEqual(data, "");
    stream.write("World");
    assert.strictEqual(data, "");
    stream.error(new Error());
    assert.strictEqual(error, false);
    stream.end("Final Bit");
    assert.strictEqual(end, false);
  });
  test("peekStream", async () => {
    for (let i = 0; i < 5; i++) {
      const stream2 = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
      const result2 = await peekStream(stream2, i);
      assert.strictEqual(stream2, result2.stream);
      if (result2.ended) {
        assert.fail("Unexpected result, stream should not have ended yet");
      } else {
        assert.strictEqual(result2.buffer.length, i + 1, `maxChunks: ${i}`);
        const additionalResult = [];
        await consumeStream(stream2, (strings) => {
          additionalResult.push(...strings);
          return strings.join();
        });
        assert.strictEqual([...result2.buffer, ...additionalResult].join(), "1,2,3,4,5");
      }
    }
    let stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    let result = await peekStream(stream, 5);
    assert.strictEqual(stream, result.stream);
    assert.strictEqual(result.buffer.join(), "1,2,3,4,5");
    assert.strictEqual(result.ended, true);
    stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    result = await peekStream(stream, 6);
    assert.strictEqual(stream, result.stream);
    assert.strictEqual(result.buffer.join(), "1,2,3,4,5");
    assert.strictEqual(result.ended, true);
  });
  test("toStream", async () => {
    const stream = toStream("1,2,3,4,5", (strings) => strings.join());
    const consumed = await consumeStream(stream, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("toReadable", async () => {
    const readable = toReadable("1,2,3,4,5");
    const consumed = consumeReadable(readable, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("transform", async () => {
    const source = newWriteableStream((strings) => strings.join());
    const result = transform(source, { data: (string) => string + string }, (strings) => strings.join());
    setTimeout(() => {
      source.write("1");
      source.write("2");
      source.write("3");
      source.write("4");
      source.end("5");
    }, 0);
    const consumed = await consumeStream(result, (strings) => strings.join());
    assert.strictEqual(consumed, "11,22,33,44,55");
  });
  test("events are delivered even if a listener is removed during delivery", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let listener1Called = false;
    let listener2Called = false;
    const listener1 = () => {
      stream.removeListener("end", listener1);
      listener1Called = true;
    };
    const listener2 = () => {
      listener2Called = true;
    };
    stream.on("end", listener1);
    stream.on("end", listener2);
    stream.on("data", () => {
    });
    stream.end("");
    assert.strictEqual(listener1Called, true);
    assert.strictEqual(listener2Called, true);
  });
  test("prefixedReadable", () => {
    let readable = prefixedReadable("1,2", arrayToReadable(["3", "4", "5"]), (val) => val.join(","));
    assert.strictEqual(consumeReadable(readable, (val) => val.join(",")), "1,2,3,4,5");
    readable = prefixedReadable("empty", arrayToReadable([]), (val) => val.join(","));
    assert.strictEqual(consumeReadable(readable, (val) => val.join(",")), "empty");
  });
  test("prefixedStream", async () => {
    let stream = newWriteableStream((strings) => strings.join());
    stream.write("3");
    stream.write("4");
    stream.write("5");
    stream.end();
    let prefixStream = prefixedStream("1,2", stream, (val) => val.join(","));
    assert.strictEqual(await consumeStream(prefixStream, (val) => val.join(",")), "1,2,3,4,5");
    stream = newWriteableStream((strings) => strings.join());
    stream.end();
    prefixStream = prefixedStream("1,2", stream, (val) => val.join(","));
    assert.strictEqual(await consumeStream(prefixStream, (val) => val.join(",")), "1,2");
    stream = newWriteableStream((strings) => strings.join());
    stream.error(new Error("fail"));
    prefixStream = prefixedStream("error", stream, (val) => val.join(","));
    let error;
    try {
      await consumeStream(prefixStream, (val) => val.join(","));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHN0cmVhbS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvUmVhZGFibGUsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgY29uc3VtZVJlYWRhYmxlLCBjb25zdW1lU3RyZWFtLCBpc1JlYWRhYmxlLCBpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0sIGlzUmVhZGFibGVTdHJlYW0sIGxpc3RlblN0cmVhbSwgbmV3V3JpdGVhYmxlU3RyZWFtLCBwZWVrUmVhZGFibGUsIHBlZWtTdHJlYW0sIHByZWZpeGVkUmVhZGFibGUsIHByZWZpeGVkU3RyZWFtLCBSZWFkYWJsZSwgUmVhZGFibGVTdHJlYW0sIHRvUmVhZGFibGUsIHRvU3RyZWFtLCB0cmFuc2Zvcm0gfSBmcm9tICcuLi8uLi9jb21tb24vc3RyZWFtLmpzJztcblxuc3VpdGUoJ1N0cmVhbScsICgpID0+IHtcblxuXHR0ZXN0KCdpc1JlYWRhYmxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayghaXNSZWFkYWJsZSh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQub2soIWlzUmVhZGFibGUoT2JqZWN0LmNyZWF0ZShudWxsKSkpO1xuXHRcdGFzc2VydC5vayhpc1JlYWRhYmxlKGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygnJykpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzUmVhZGFibGVTdHJlYW0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKCFpc1JlYWRhYmxlU3RyZWFtKHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC5vayghaXNSZWFkYWJsZVN0cmVhbShPYmplY3QuY3JlYXRlKG51bGwpKSk7XG5cdFx0YXNzZXJ0Lm9rKGlzUmVhZGFibGVTdHJlYW0obmV3V3JpdGVhYmxlU3RyZWFtKGQgPT4gZCkpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5vayghaXNSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtKE9iamVjdC5jcmVhdGUobnVsbCkpKTtcblxuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbShkID0+IGQpO1xuXHRcdHN0cmVhbS5lbmQoKTtcblx0XHRjb25zdCBidWZmZXJlZFN0cmVhbSA9IGF3YWl0IHBlZWtTdHJlYW0oc3RyZWFtLCAxKTtcblx0XHRhc3NlcnQub2soaXNSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtKGJ1ZmZlcmVkU3RyZWFtKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dyaXRlYWJsZVN0cmVhbSAtIGJhc2ljcycsICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblxuXHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlID0+IHtcblx0XHRcdGVycm9yID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGxldCBlbmQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ0hlbGxvJyk7XG5cblx0XHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0sICdIZWxsbycpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMV0sICdXb3JsZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZCwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLnBhdXNlKCk7XG5cdFx0c3RyZWFtLndyaXRlKCcxJyk7XG5cdFx0c3RyZWFtLndyaXRlKCcyJyk7XG5cdFx0c3RyZWFtLndyaXRlKCczJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMik7XG5cblx0XHRzdHJlYW0ucmVzdW1lKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1syXSwgJzEsMiwzJyk7XG5cblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgdHJ1ZSk7XG5cblx0XHRlcnJvciA9IGZhbHNlO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCB0cnVlKTtcblxuXHRcdHN0cmVhbS5lbmQoJ0ZpbmFsIEJpdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzNdLCAnRmluYWwgQml0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZCwgdHJ1ZSk7XG5cblx0XHRzdHJlYW0uZGVzdHJveSgpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdVbmV4cGVjdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJlYW0gd2l0aCBub24tcmVkdWNpYmxlIG1lc3NhZ2VzJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIEEgY29tcGxleCBvYmplY3QgdGhhdCBjYW5ub3QgYmUgcmVkdWNlZCB0byBhIHNpbmdsZSBvYmplY3QuXG5cdFx0ICovXG5cdFx0Y2xhc3MgVGVzdE1lc3NhZ2Uge1xuXHRcdFx0Y29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcpIHsgfVxuXHRcdH1cblxuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxUZXN0TWVzc2FnZT4obnVsbCk7XG5cblx0XHRsZXQgZXJyb3IgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZSA9PiB7XG5cdFx0XHRlcnJvciA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0c3RyZWFtLndyaXRlKG5ldyBUZXN0TWVzc2FnZSgnSGVsbG8nKSk7XG5cblx0XHRjb25zdCBjaHVua3M6IFRlc3RNZXNzYWdlW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2h1bmtzWzBdIGluc3RhbmNlb2YgVGVzdE1lc3NhZ2UsXG5cdFx0XHQnTWVzc2FnZSBgMGAgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdE1lc3NhZ2VgLicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnZhbHVlLCAnSGVsbG8nKTtcblxuXHRcdHN0cmVhbS53cml0ZShuZXcgVGVzdE1lc3NhZ2UoJ1dvcmxkJykpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2h1bmtzWzFdIGluc3RhbmNlb2YgVGVzdE1lc3NhZ2UsXG5cdFx0XHQnTWVzc2FnZSBgMWAgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdE1lc3NhZ2VgLicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzFdLnZhbHVlLCAnV29ybGQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmQsIGZhbHNlKTtcblxuXHRcdHN0cmVhbS5wYXVzZSgpO1xuXHRcdHN0cmVhbS53cml0ZShuZXcgVGVzdE1lc3NhZ2UoJzEnKSk7XG5cdFx0c3RyZWFtLndyaXRlKG5ldyBUZXN0TWVzc2FnZSgnMicpKTtcblx0XHRzdHJlYW0ud3JpdGUobmV3IFRlc3RNZXNzYWdlKCczJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDIpO1xuXG5cdFx0c3RyZWFtLnJlc3VtZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDUpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2h1bmtzWzJdIGluc3RhbmNlb2YgVGVzdE1lc3NhZ2UsXG5cdFx0XHQnTWVzc2FnZSBgMmAgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdE1lc3NhZ2VgLicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzJdLnZhbHVlLCAnMScpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2h1bmtzWzNdIGluc3RhbmNlb2YgVGVzdE1lc3NhZ2UsXG5cdFx0XHQnTWVzc2FnZSBgM2AgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdE1lc3NhZ2VgLicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzNdLnZhbHVlLCAnMicpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2h1bmtzWzRdIGluc3RhbmNlb2YgVGVzdE1lc3NhZ2UsXG5cdFx0XHQnTWVzc2FnZSBgNGAgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdE1lc3NhZ2VgLicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzRdLnZhbHVlLCAnMycpO1xuXG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIHRydWUpO1xuXG5cdFx0ZXJyb3IgPSBmYWxzZTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgdHJ1ZSk7XG5cblx0XHRzdHJlYW0uZW5kKG5ldyBUZXN0TWVzc2FnZSgnRmluYWwgQml0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCA2KTtcblxuXHRcdGFzc2VydChcblx0XHRcdGNodW5rc1s1XSBpbnN0YW5jZW9mIFRlc3RNZXNzYWdlLFxuXHRcdFx0J01lc3NhZ2UgYDVgIG11c3QgYmUgYW4gaW5zdGFuY2Ugb2YgYFRlc3RNZXNzYWdlYC4nLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1s1XS52YWx1ZSwgJ0ZpbmFsIEJpdCcpO1xuXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCB0cnVlKTtcblxuXHRcdHN0cmVhbS5kZXN0cm95KCk7XG5cblx0XHRzdHJlYW0ud3JpdGUobmV3IFRlc3RNZXNzYWdlKCdVbmV4cGVjdGVkJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCA2KTtcblx0fSk7XG5cblx0dGVzdCgnV3JpdGVhYmxlU3RyZWFtIC0gZW5kIHdpdGggZW1wdHkgc3RyaW5nIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZHVjZXIgPSAoc3RyaW5nczogc3RyaW5nW10pID0+IHN0cmluZ3MubGVuZ3RoID4gMCA/IHN0cmluZ3Muam9pbigpIDogJ2Vycm9yJztcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihyZWR1Y2VyKTtcblx0XHRzdHJlYW0uZW5kKCcnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnN1bWVTdHJlYW0oc3RyZWFtLCByZWR1Y2VyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dyaXRlYWJsZVN0cmVhbSAtIGVuZCB3aXRoIGVycm9yIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZHVjZXIgPSAoZXJyb3JzOiBFcnJvcltdKSA9PiBlcnJvcnNbMF07XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPEVycm9yPihyZWR1Y2VyKTtcblx0XHRzdHJlYW0uZW5kKG5ldyBFcnJvcignZXJyb3InKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbSwgcmVkdWNlcik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnV3JpdGVhYmxlU3RyZWFtIC0gcmVtb3ZlTGlzdGVuZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cblx0XHRsZXQgZXJyb3IgPSBmYWxzZTtcblx0XHRjb25zdCBlcnJvckxpc3RlbmVyID0gKGU6IEVycm9yKSA9PiB7XG5cdFx0XHRlcnJvciA9IHRydWU7XG5cdFx0fTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3JMaXN0ZW5lcik7XG5cblx0XHRsZXQgZGF0YSA9IGZhbHNlO1xuXHRcdGNvbnN0IGRhdGFMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdGRhdGEgPSB0cnVlO1xuXHRcdH07XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YUxpc3RlbmVyKTtcblxuXHRcdHN0cmVhbS53cml0ZSgnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgdHJ1ZSk7XG5cblx0XHRkYXRhID0gZmFsc2U7XG5cdFx0c3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdkYXRhJywgZGF0YUxpc3RlbmVyKTtcblxuXHRcdHN0cmVhbS53cml0ZSgnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIHRydWUpO1xuXG5cdFx0ZXJyb3IgPSBmYWxzZTtcblx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgZXJyb3JMaXN0ZW5lcik7XG5cblx0XHQvLyBhbHdheXMgbGVhdmUgYXQgbGVhc3Qgb25lIGVycm9yIGxpc3RlbmVyIHRvIHN0cmVhbXMgdG8gYXZvaWQgdW5leHBlY3RlZCBlcnJvcnMgZHVyaW5nIHRlc3QgcnVubmluZ1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCAoKSA9PiB7IH0pO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dyaXRlYWJsZVN0cmVhbSAtIGhpZ2hXYXRlck1hcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSwgeyBoaWdoV2F0ZXJNYXJrOiAzIH0pO1xuXG5cdFx0bGV0IHJlcyA9IHN0cmVhbS53cml0ZSgnMScpO1xuXHRcdGFzc2VydC5vayghcmVzKTtcblxuXHRcdHJlcyA9IHN0cmVhbS53cml0ZSgnMicpO1xuXHRcdGFzc2VydC5vayghcmVzKTtcblxuXHRcdHJlcyA9IHN0cmVhbS53cml0ZSgnMycpO1xuXHRcdGFzc2VydC5vayghcmVzKTtcblxuXHRcdGNvbnN0IHByb21pc2UxID0gc3RyZWFtLndyaXRlKCc0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHByb21pc2UxIGluc3RhbmNlb2YgUHJvbWlzZSk7XG5cblx0XHRjb25zdCBwcm9taXNlMiA9IHN0cmVhbS53cml0ZSgnNScpO1xuXHRcdGFzc2VydC5vayhwcm9taXNlMiBpbnN0YW5jZW9mIFByb21pc2UpO1xuXG5cdFx0bGV0IGRyYWluZWQxID0gZmFsc2U7XG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHByb21pc2UxO1xuXHRcdFx0ZHJhaW5lZDEgPSB0cnVlO1xuXHRcdH0pKCk7XG5cblx0XHRsZXQgZHJhaW5lZDIgPSBmYWxzZTtcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcHJvbWlzZTI7XG5cdFx0XHRkcmFpbmVkMiA9IHRydWU7XG5cdFx0fSkoKTtcblxuXHRcdGxldCBkYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuXHRcdFx0ZGF0YSA9IGNodW5rO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5vayhkYXRhKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRyYWluZWQxLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhaW5lZDIsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdW1lUmVhZGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhZGFibGUgPSBhcnJheVRvUmVhZGFibGUoWycxJywgJzInLCAnMycsICc0JywgJzUnXSk7XG5cdFx0Y29uc3QgY29uc3VtZWQgPSBjb25zdW1lUmVhZGFibGUocmVhZGFibGUsIHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25zdW1lZCwgJzEsMiwzLDQsNScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZWVrUmVhZGFibGUnLCAoKSA9PiB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdGNvbnN0IHJlYWRhYmxlID0gYXJyYXlUb1JlYWRhYmxlKFsnMScsICcyJywgJzMnLCAnNCcsICc1J10pO1xuXG5cdFx0XHRjb25zdCBjb25zdW1lZE9yUmVhZGFibGUgPSBwZWVrUmVhZGFibGUocmVhZGFibGUsIHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCksIGkpO1xuXHRcdFx0aWYgKHR5cGVvZiBjb25zdW1lZE9yUmVhZGFibGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIHJlc3VsdCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY29uc3VtZWQgPSBjb25zdW1lUmVhZGFibGUoY29uc3VtZWRPclJlYWRhYmxlLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCAnMSwyLDMsNCw1Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlYWRhYmxlID0gYXJyYXlUb1JlYWRhYmxlKFsnMScsICcyJywgJzMnLCAnNCcsICc1J10pO1xuXHRcdGxldCBjb25zdW1lZE9yUmVhZGFibGUgPSBwZWVrUmVhZGFibGUocmVhZGFibGUsIHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25zdW1lZE9yUmVhZGFibGUsICcxLDIsMyw0LDUnKTtcblxuXHRcdHJlYWRhYmxlID0gYXJyYXlUb1JlYWRhYmxlKFsnMScsICcyJywgJzMnLCAnNCcsICc1J10pO1xuXHRcdGNvbnN1bWVkT3JSZWFkYWJsZSA9IHBlZWtSZWFkYWJsZShyZWFkYWJsZSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkT3JSZWFkYWJsZSwgJzEsMiwzLDQsNScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZWVrUmVhZGFibGUgLSBlcnJvciBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblxuXHRcdC8vIDAgQ2h1bmtzXG5cdFx0bGV0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbShkYXRhID0+IGRhdGEpO1xuXG5cdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwZWVrU3RyZWFtKHN0cmVhbSwgMSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cblx0XHQvLyAxIENodW5rXG5cdFx0c3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtKGRhdGEgPT4gZGF0YSk7XG5cblx0XHRlcnJvciA9IHVuZGVmaW5lZDtcblx0XHRwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHBlZWtTdHJlYW0oc3RyZWFtLCAxKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRlcnJvciA9IGVycjtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdmb28nKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXG5cdFx0Ly8gMiBDaHVua3Ncblx0XHRzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW0oZGF0YSA9PiBkYXRhKTtcblxuXHRcdGVycm9yID0gdW5kZWZpbmVkO1xuXHRcdHByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcGVla1N0cmVhbShzdHJlYW0sIDEpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGVycm9yID0gZXJyO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ2ZvbycpO1xuXHRcdHN0cmVhbS53cml0ZSgnYmFyJyk7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyID0+IGVycm9yID0gZXJyKTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBjaHVuayA9PiB7IH0pO1xuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFycmF5VG9SZWFkYWJsZTxUPihhcnJheTogVFtdKTogUmVhZGFibGU8VD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZWFkOiAoKSA9PiBhcnJheS5zaGlmdCgpIHx8IG51bGxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZGFibGVUb1N0cmVhbShyZWFkYWJsZTogUmVhZGFibGU8c3RyaW5nPik6IFJlYWRhYmxlU3RyZWFtPHN0cmluZz4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYXN5bmMgYmVoYXZpb3Jcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGxldCBjaHVuazogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHR3aGlsZSAoKGNodW5rID0gcmVhZGFibGUucmVhZCgpKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRzdHJlYW0ud3JpdGUoY2h1bmspO1xuXHRcdFx0fVxuXG5cdFx0XHRzdHJlYW0uZW5kKCk7XG5cdFx0fSwgMCk7XG5cblx0XHRyZXR1cm4gc3RyZWFtO1xuXHR9XG5cblx0dGVzdCgnY29uc3VtZVN0cmVhbScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSByZWFkYWJsZVRvU3RyZWFtKGFycmF5VG9SZWFkYWJsZShbJzEnLCAnMicsICczJywgJzQnLCAnNSddKSk7XG5cdFx0Y29uc3QgY29uc3VtZWQgPSBhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCAnMSwyLDMsNCw1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN1bWVTdHJlYW0gLSB3aXRob3V0IHJlZHVjZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gcmVhZGFibGVUb1N0cmVhbShhcnJheVRvUmVhZGFibGUoWycxJywgJzInLCAnMycsICc0JywgJzUnXSkpO1xuXHRcdGNvbnN0IGNvbnN1bWVkID0gYXdhaXQgY29uc3VtZVN0cmVhbShzdHJlYW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25zdW1lZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3VtZVN0cmVhbSAtIHdpdGhvdXQgcmVkdWNlciBhbmQgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblxuXHRcdGNvbnN0IGNvbnN1bWVkID0gYXdhaXQgY29uc3VtZVN0cmVhbShzdHJlYW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25zdW1lZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdGVuU3RyZWFtJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0bGV0IGVycm9yID0gZmFsc2U7XG5cdFx0bGV0IGVuZCA9IGZhbHNlO1xuXHRcdGxldCBkYXRhID0gJyc7XG5cblx0XHRsaXN0ZW5TdHJlYW0oc3RyZWFtLCB7XG5cdFx0XHRvbkRhdGE6IGQgPT4ge1xuXHRcdFx0XHRkYXRhID0gZDtcblx0XHRcdH0sXG5cdFx0XHRvbkVycm9yOiBlID0+IHtcblx0XHRcdFx0ZXJyb3IgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdGVuZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ0hlbGxvJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgJ0hlbGxvJyk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEsICdXb3JsZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZCwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIHRydWUpO1xuXG5cdFx0c3RyZWFtLmVuZCgnRmluYWwgQml0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RlblN0cmVhbSAtIGNhbmNlbGxhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblxuXHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXHRcdGxldCBlbmQgPSBmYWxzZTtcblx0XHRsZXQgZGF0YSA9ICcnO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRsaXN0ZW5TdHJlYW0oc3RyZWFtLCB7XG5cdFx0XHRvbkRhdGE6IGQgPT4ge1xuXHRcdFx0XHRkYXRhID0gZDtcblx0XHRcdH0sXG5cdFx0XHRvbkVycm9yOiBlID0+IHtcblx0XHRcdFx0ZXJyb3IgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdGVuZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSwgY3RzLnRva2VuKTtcblxuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdHN0cmVhbS53cml0ZSgnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgJycpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLCAnJyk7XG5cblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLmVuZCgnRmluYWwgQml0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZWVrU3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdHJlYW0gPSByZWFkYWJsZVRvU3RyZWFtKGFycmF5VG9SZWFkYWJsZShbJzEnLCAnMicsICczJywgJzQnLCAnNSddKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBlZWtTdHJlYW0oc3RyZWFtLCBpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJlYW0sIHJlc3VsdC5zdHJlYW0pO1xuXHRcdFx0aWYgKHJlc3VsdC5lbmRlZCkge1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCByZXN1bHQsIHN0cmVhbSBzaG91bGQgbm90IGhhdmUgZW5kZWQgeWV0Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJ1ZmZlci5sZW5ndGgsIGkgKyAxLCBgbWF4Q2h1bmtzOiAke2l9YCk7XG5cblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbFJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0YXdhaXQgY29uc3VtZVN0cmVhbShzdHJlYW0sIHN0cmluZ3MgPT4ge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxSZXN1bHQucHVzaCguLi5zdHJpbmdzKTtcblxuXHRcdFx0XHRcdHJldHVybiBzdHJpbmdzLmpvaW4oKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5yZXN1bHQuYnVmZmVyLCAuLi5hZGRpdGlvbmFsUmVzdWx0XS5qb2luKCksICcxLDIsMyw0LDUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc3RyZWFtID0gcmVhZGFibGVUb1N0cmVhbShhcnJheVRvUmVhZGFibGUoWycxJywgJzInLCAnMycsICc0JywgJzUnXSkpO1xuXHRcdGxldCByZXN1bHQgPSBhd2FpdCBwZWVrU3RyZWFtKHN0cmVhbSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbSwgcmVzdWx0LnN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5idWZmZXIuam9pbigpLCAnMSwyLDMsNCw1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmRlZCwgdHJ1ZSk7XG5cblx0XHRzdHJlYW0gPSByZWFkYWJsZVRvU3RyZWFtKGFycmF5VG9SZWFkYWJsZShbJzEnLCAnMicsICczJywgJzQnLCAnNSddKSk7XG5cdFx0cmVzdWx0ID0gYXdhaXQgcGVla1N0cmVhbShzdHJlYW0sIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJlYW0sIHJlc3VsdC5zdHJlYW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYnVmZmVyLmpvaW4oKSwgJzEsMiwzLDQsNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW5kZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1N0cmVhbScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSB0b1N0cmVhbSgnMSwyLDMsNCw1Jywgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0Y29uc3QgY29uc3VtZWQgPSBhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCAnMSwyLDMsNCw1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvUmVhZGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhZGFibGUgPSB0b1JlYWRhYmxlKCcxLDIsMyw0LDUnKTtcblx0XHRjb25zdCBjb25zdW1lZCA9IGNvbnN1bWVSZWFkYWJsZShyZWFkYWJsZSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCAnMSwyLDMsNCw1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zZm9ybScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRyYW5zZm9ybShzb3VyY2UsIHsgZGF0YTogc3RyaW5nID0+IHN0cmluZyArIHN0cmluZyB9LCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblxuXHRcdC8vIFNpbXVsYXRlIGFzeW5jIGJlaGF2aW9yXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRzb3VyY2Uud3JpdGUoJzEnKTtcblx0XHRcdHNvdXJjZS53cml0ZSgnMicpO1xuXHRcdFx0c291cmNlLndyaXRlKCczJyk7XG5cdFx0XHRzb3VyY2Uud3JpdGUoJzQnKTtcblx0XHRcdHNvdXJjZS5lbmQoJzUnKTtcblx0XHR9LCAwKTtcblxuXHRcdGNvbnN0IGNvbnN1bWVkID0gYXdhaXQgY29uc3VtZVN0cmVhbShyZXN1bHQsIHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25zdW1lZCwgJzExLDIyLDMzLDQ0LDU1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50cyBhcmUgZGVsaXZlcmVkIGV2ZW4gaWYgYSBsaXN0ZW5lciBpcyByZW1vdmVkIGR1cmluZyBkZWxpdmVyeScsICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblxuXHRcdGxldCBsaXN0ZW5lcjFDYWxsZWQgPSBmYWxzZTtcblx0XHRsZXQgbGlzdGVuZXIyQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBsaXN0ZW5lcjEgPSAoKSA9PiB7IHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignZW5kJywgbGlzdGVuZXIxKTsgbGlzdGVuZXIxQ2FsbGVkID0gdHJ1ZTsgfTtcblx0XHRjb25zdCBsaXN0ZW5lcjIgPSAoKSA9PiB7IGxpc3RlbmVyMkNhbGxlZCA9IHRydWU7IH07XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCBsaXN0ZW5lcjEpO1xuXHRcdHN0cmVhbS5vbignZW5kJywgbGlzdGVuZXIyKTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCAoKSA9PiB7IH0pO1xuXHRcdHN0cmVhbS5lbmQoJycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RlbmVyMUNhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RlbmVyMkNhbGxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZpeGVkUmVhZGFibGUnLCAoKSA9PiB7XG5cblx0XHQvLyBCYXNpY1xuXHRcdGxldCByZWFkYWJsZSA9IHByZWZpeGVkUmVhZGFibGUoJzEsMicsIGFycmF5VG9SZWFkYWJsZShbJzMnLCAnNCcsICc1J10pLCB2YWwgPT4gdmFsLmpvaW4oJywnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVSZWFkYWJsZShyZWFkYWJsZSwgdmFsID0+IHZhbC5qb2luKCcsJykpLCAnMSwyLDMsNCw1Jyk7XG5cblx0XHQvLyBFbXB0eVxuXHRcdHJlYWRhYmxlID0gcHJlZml4ZWRSZWFkYWJsZSgnZW1wdHknLCBhcnJheVRvUmVhZGFibGU8c3RyaW5nPihbXSksIHZhbCA9PiB2YWwuam9pbignLCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZVJlYWRhYmxlKHJlYWRhYmxlLCB2YWwgPT4gdmFsLmpvaW4oJywnKSksICdlbXB0eScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmaXhlZFN0cmVhbScsIGFzeW5jICgpID0+IHtcblxuXHRcdC8vIEJhc2ljXG5cdFx0bGV0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXHRcdHN0cmVhbS53cml0ZSgnMycpO1xuXHRcdHN0cmVhbS53cml0ZSgnNCcpO1xuXHRcdHN0cmVhbS53cml0ZSgnNScpO1xuXHRcdHN0cmVhbS5lbmQoKTtcblxuXHRcdGxldCBwcmVmaXhTdHJlYW0gPSBwcmVmaXhlZFN0cmVhbTxzdHJpbmc+KCcxLDInLCBzdHJlYW0sIHZhbCA9PiB2YWwuam9pbignLCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uc3VtZVN0cmVhbShwcmVmaXhTdHJlYW0sIHZhbCA9PiB2YWwuam9pbignLCcpKSwgJzEsMiwzLDQsNScpO1xuXG5cdFx0Ly8gRW1wdHlcblx0XHRzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRzdHJlYW0uZW5kKCk7XG5cblx0XHRwcmVmaXhTdHJlYW0gPSBwcmVmaXhlZFN0cmVhbTxzdHJpbmc+KCcxLDInLCBzdHJlYW0sIHZhbCA9PiB2YWwuam9pbignLCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uc3VtZVN0cmVhbShwcmVmaXhTdHJlYW0sIHZhbCA9PiB2YWwuam9pbignLCcpKSwgJzEsMicpO1xuXG5cdFx0Ly8gRXJyb3Jcblx0XHRzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCdmYWlsJykpO1xuXG5cdFx0cHJlZml4U3RyZWFtID0gcHJlZml4ZWRTdHJlYW08c3RyaW5nPignZXJyb3InLCBzdHJlYW0sIHZhbCA9PiB2YWwuam9pbignLCcpKTtcblxuXHRcdGxldCBlcnJvcjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29uc3VtZVN0cmVhbShwcmVmaXhTdHJlYW0sIHZhbCA9PiB2YWwuam9pbignLCcpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCLGdCQUFnQjtBQUMzQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFT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QUNoQixXQUFPLElBQUk7QUFFWCxRQUFJLGVBQWUsZUFBdUIsT0FBTyxRQUFRLFNBQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQztBQUM3RSxXQUFPLFlBQVksTUFBTSxjQUFjLGNBQWMsU0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDLEdBQUcsV0FBVztBQUd2RixhQUFTLG1CQUEyQixhQUFXLFFBQVEsS0FBSyxDQUFDO0FBQzdELFdBQU8sSUFBSTtBQUVYLG1CQUFlLGVBQXVCLE9BQU8sUUFBUSxTQUFPLElBQUksS0FBSyxHQUFHLENBQUM7QUFDekUsV0FBTyxZQUFZLE1BQU0sY0FBYyxjQUFjLFNBQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFHakYsYUFBUyxtQkFBMkIsYUFBVyxRQUFRLEtBQUssQ0FBQztBQUM3RCxXQUFPLE1BQU0sSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUU5QixtQkFBZSxlQUF1QixTQUFTLFFBQVEsU0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO0FBRTNFLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxjQUFjLGNBQWMsU0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDdkQsU0FBUyxHQUFHO0FBQ1gsY0FBUTtBQUFBLElBQ1Q7QUFDQSxXQUFPLEdBQUcsS0FBSztBQUFBLEVBQ2hCLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVhZGFibGUiLCAiY29uc3VtZWRPclJlYWRhYmxlIiwgInN0cmVhbSIsICJyZXN1bHQiXQp9Cg==
