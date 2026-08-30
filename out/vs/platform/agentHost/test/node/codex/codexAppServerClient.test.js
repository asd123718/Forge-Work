import assert from "assert";
import { PassThrough } from "stream";
import { CancellationError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import {
  CodexAppServerClient,
  JsonRpcError,
  JsonRpcErrorCode
} from "../../../node/codex/codexAppServerClient.js";
function makeFakePeer() {
  const clientStdin = new PassThrough();
  const clientStdout = new PassThrough();
  const exitEmitter = new Emitter();
  const onceExitListeners = [];
  let killed = false;
  let killCount = 0;
  const fireExit = (e) => {
    exitEmitter.fire(e);
    for (const listener of onceExitListeners.splice(0)) {
      listener(e);
    }
  };
  const transport = {
    stdin: clientStdin,
    stdout: clientStdout,
    kill(_signal) {
      killCount++;
      if (killed) {
        return false;
      }
      killed = true;
      fireExit({ code: null, signal: _signal ?? null });
      return true;
    },
    onExit: exitEmitter.event,
    onExitOnce(listener) {
      onceExitListeners.push(listener);
    }
  };
  return {
    transport,
    outbound: clientStdin,
    get killCount() {
      return killCount;
    },
    push(message) {
      clientStdout.write(JSON.stringify(message) + "\n");
    },
    exit(code, signal = null) {
      fireExit({ code, signal });
    },
    dispose() {
      onceExitListeners.length = 0;
      exitEmitter.dispose();
      clientStdin.destroy();
      clientStdout.destroy();
    }
  };
}
function readNextMessage(stream, timeoutMs = 1e3) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl < 0) {
        return;
      }
      const line = buf.slice(0, nl).trim();
      cleanup();
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(err);
      }
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("stream ended before message arrived"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for message"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("end", onEnd);
    };
    stream.on("data", onData);
    stream.on("end", onEnd);
  });
}
suite("CodexAppServerClient", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("request roundtrip resolves with typed result", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const responsePromise = client.request("getAuthStatus", { refreshToken: false, includeToken: false });
      const sent = await readNextMessage(peer.outbound);
      assert.strictEqual(sent.method, "getAuthStatus");
      assert.deepStrictEqual(sent.params, { refreshToken: false, includeToken: false });
      assert.strictEqual(typeof sent.id, "number");
      peer.push({ id: sent.id, result: { authMode: "apikey" } });
      const result = await responsePromise;
      assert.deepStrictEqual(result, { authMode: "apikey" });
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("request includes W3C trace context when provided", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const responsePromise = client.request("getAuthStatus", { refreshToken: false, includeToken: false }, {
        traceId: "1".repeat(32),
        spanId: "2".repeat(16),
        traceparent: `00-${"1".repeat(32)}-${"2".repeat(16)}-01`,
        tracestate: "vendor=value"
      });
      const sent = await readNextMessage(peer.outbound);
      assert.deepStrictEqual(sent.trace, {
        traceparent: `00-${"1".repeat(32)}-${"2".repeat(16)}-01`,
        tracestate: "vendor=value"
      });
      peer.push({ id: sent.id, result: { authMode: "apikey" } });
      await responsePromise;
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("request rejects with JsonRpcError on error envelope", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const responsePromise = client.request("getAuthStatus", { refreshToken: false, includeToken: false });
      const sent = await readNextMessage(peer.outbound);
      peer.push({ id: sent.id, error: { code: -32001, message: "overloaded" } });
      await assert.rejects(responsePromise, (err) => {
        assert.ok(err instanceof JsonRpcError, "expected JsonRpcError");
        assert.strictEqual(err.code, -32001);
        assert.match(err.message, /overloaded/);
        return true;
      });
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("request response ids must match the numeric id exactly", async () => {
    const peer = makeFakePeer();
    const logs = [];
    const client = new CodexAppServerClient(peer.transport, (level, message) => logs.push({ level, message }));
    try {
      const responsePromise = client.request("getAuthStatus", { refreshToken: false, includeToken: false });
      const sent = await readNextMessage(peer.outbound);
      peer.push({ id: String(sent.id), result: { authMode: "apikey" } });
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(logs, [{ level: "warn", message: `unsolicited response id=${sent.id}` }]);
      peer.push({ id: sent.id, result: { authMode: "apikey" } });
      assert.deepStrictEqual(await responsePromise, { authMode: "apikey" });
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("notify writes a payload with no id", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      client.notify("initialized", void 0);
      const sent = await readNextMessage(peer.outbound);
      assert.strictEqual(sent.method, "initialized");
      assert.strictEqual(sent.id, void 0);
      assert.strictEqual(sent.params, void 0);
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("server notification is delivered to registered handler", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const received = [];
      const handle = client.onNotification("thread/started", (params) => received.push(params));
      peer.push({ method: "thread/started", params: { thread: { id: "thr_x" } } });
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(received, [{ thread: { id: "thr_x" } }]);
      handle.dispose();
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("unhandled server notification is dropped with a warning", async () => {
    const peer = makeFakePeer();
    const logs = [];
    const client = new CodexAppServerClient(peer.transport, (level, message) => logs.push({ level, message }));
    try {
      let invoked = false;
      const handle = client.onNotification("thread/started", () => {
        invoked = true;
      });
      peer.push({ method: "made-up/method", params: { anything: 1 } });
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual({ invoked, logs }, {
        invoked: false,
        logs: [{ level: "warn", message: "dropping unhandled notification: made-up/method" }]
      });
      handle.dispose();
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("server request without handler returns MethodNotFound", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      peer.push({ id: 99, method: "item/tool/requestUserInput", params: { questions: [] } });
      const reply = await readNextMessage(peer.outbound);
      assert.strictEqual(reply.id, 99);
      assert.strictEqual(reply.error.code, JsonRpcErrorCode.MethodNotFound);
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("server request with handler returns result envelope", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const handle = client.onRequest("item/tool/requestUserInput", (_params) => ({
        result: { answers: { test: { answers: ["ok"] } } }
      }));
      peer.push({ id: 7, method: "item/tool/requestUserInput", params: { questions: [{ id: "test", label: "go?" }] } });
      const reply = await readNextMessage(peer.outbound);
      assert.strictEqual(reply.id, 7);
      assert.deepStrictEqual(reply.result, { answers: { test: { answers: ["ok"] } } });
      handle.dispose();
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("server request handler throwing is converted to InternalError", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const handle = client.onRequest("item/tool/requestUserInput", () => {
        throw new Error("boom");
      });
      peer.push({ id: 8, method: "item/tool/requestUserInput", params: { questions: [] } });
      const reply = await readNextMessage(peer.outbound);
      assert.strictEqual(reply.error.code, JsonRpcErrorCode.InternalError);
      assert.match(reply.error.message, /boom/);
      handle.dispose();
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("process exit rejects in-flight requests", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const responsePromise = client.request("getAuthStatus", { refreshToken: false, includeToken: false });
      await readNextMessage(peer.outbound);
      peer.exit(1);
      await assert.rejects(responsePromise, (err) => {
        assert.ok(err instanceof JsonRpcError, "expected JsonRpcError");
        return true;
      });
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("dispose rejects pending requests with CancellationError", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    const responsePromise = client.request("getAuthStatus", { refreshToken: false, includeToken: false });
    await readNextMessage(peer.outbound);
    client.dispose();
    await assert.rejects(responsePromise, (err) => err instanceof CancellationError);
    peer.dispose();
  });
  test("dispose cancels grace kill when transport exits cleanly", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport, void 0, 1);
    client.dispose();
    peer.exit(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.strictEqual(peer.killCount, 0);
    peer.dispose();
  });
  test("handles multiple messages arriving in a single chunk", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const received = [];
      const h1 = client.onNotification("thread/started", () => received.push("a"));
      const h2 = client.onNotification("turn/started", () => received.push("b"));
      peer.transport.stdout.emit("data", JSON.stringify({ method: "thread/started", params: { thread: { id: "t" } } }) + "\n" + JSON.stringify({ method: "turn/started", params: { turn: { id: "x" } } }) + "\n");
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(received, ["a", "b"]);
      h1.dispose();
      h2.dispose();
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
  test("partial line is buffered until newline arrives", async () => {
    const peer = makeFakePeer();
    const client = new CodexAppServerClient(peer.transport);
    try {
      const received = [];
      const handle = client.onNotification("thread/started", (params) => received.push(params));
      const json = JSON.stringify({ method: "thread/started", params: { thread: { id: "split" } } }) + "\n";
      peer.transport.stdout.emit("data", json.slice(0, 10));
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(received, []);
      peer.transport.stdout.emit("data", json.slice(10));
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(received, [{ thread: { id: "split" } }]);
      handle.dispose();
    } finally {
      client.dispose();
      peer.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhBcHBTZXJ2ZXJDbGllbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFBhc3NUaHJvdWdoIH0gZnJvbSAnc3RyZWFtJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdENvZGV4QXBwU2VydmVyQ2xpZW50LFxuXHRKc29uUnBjRXJyb3IsXG5cdEpzb25ScGNFcnJvckNvZGUsXG5cdHR5cGUgSUNvZGV4QXBwU2VydmVyVHJhbnNwb3J0LFxufSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4QXBwU2VydmVyQ2xpZW50LmpzJztcblxuLy8gI3JlZ2lvbiBJbi1tZW1vcnkgZmFrZSB0cmFuc3BvcnRcbi8vXG4vLyBUd28gYFBhc3NUaHJvdWdoYCBzdHJlYW1zIHBhaXJlZCBzbyB0aGUgdGVzdCdzIFwicGVlclwiIHNpZGUgcmVhZHMgd2hhdFxuLy8gdGhlIGNsaWVudCB3cml0ZXMsIGFuZCB2aWNlIHZlcnNhLiBNaXJyb3JzIHRoZSBzaGFwZSBvZiBhIHJlYWwgc3Bhd25lZFxuLy8gcHJvY2VzcyBmcm9tIHRoZSBjbGllbnQncyBwZXJzcGVjdGl2ZS5cblxuaW50ZXJmYWNlIElGYWtlUGVlciB7XG5cdHJlYWRvbmx5IHRyYW5zcG9ydDogSUNvZGV4QXBwU2VydmVyVHJhbnNwb3J0O1xuXHQvKiogTGluZXMgdGhlIGNsaWVudCB3cm90ZSAoc2VudCB0byB0aGUgc2VydmVyKS4gKi9cblx0cmVhZG9ubHkgb3V0Ym91bmQ6IFBhc3NUaHJvdWdoO1xuXHRyZWFkb25seSBraWxsQ291bnQ6IG51bWJlcjtcblx0LyoqIEluamVjdCBhIHdpcmUgbWVzc2FnZSBmcm9tIHNlcnZlciBcdTIxOTIgY2xpZW50LiBOZXdsaW5lLXRlcm1pbmF0ZWQuICovXG5cdHB1c2gobWVzc2FnZTogb2JqZWN0KTogdm9pZDtcblx0LyoqIFNpbXVsYXRlIHRoZSBjb2RleCBwcm9jZXNzIGV4aXRpbmcuICovXG5cdGV4aXQoY29kZTogbnVtYmVyIHwgbnVsbCwgc2lnbmFsPzogTm9kZUpTLlNpZ25hbHMgfCBudWxsKTogdm9pZDtcblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5mdW5jdGlvbiBtYWtlRmFrZVBlZXIoKTogSUZha2VQZWVyIHtcblx0Y29uc3QgY2xpZW50U3RkaW4gPSBuZXcgUGFzc1Rocm91Z2goKTsgICAvLyBjbGllbnQgd3JpdGVzIGhlcmUsIHBlZXIgcmVhZHNcblx0Y29uc3QgY2xpZW50U3Rkb3V0ID0gbmV3IFBhc3NUaHJvdWdoKCk7ICAvLyBwZWVyIHdyaXRlcyBoZXJlLCBjbGllbnQgcmVhZHNcblx0Y29uc3QgZXhpdEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNvZGU6IG51bWJlciB8IG51bGw7IHJlYWRvbmx5IHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsIH0+KCk7XG5cdGNvbnN0IG9uY2VFeGl0TGlzdGVuZXJzOiAoKGU6IHsgcmVhZG9ubHkgY29kZTogbnVtYmVyIHwgbnVsbDsgcmVhZG9ubHkgc2lnbmFsOiBOb2RlSlMuU2lnbmFscyB8IG51bGwgfSkgPT4gdm9pZClbXSA9IFtdO1xuXHRsZXQga2lsbGVkID0gZmFsc2U7XG5cdGxldCBraWxsQ291bnQgPSAwO1xuXHRjb25zdCBmaXJlRXhpdCA9IChlOiB7IHJlYWRvbmx5IGNvZGU6IG51bWJlciB8IG51bGw7IHJlYWRvbmx5IHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsIH0pID0+IHtcblx0XHRleGl0RW1pdHRlci5maXJlKGUpO1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2Ygb25jZUV4aXRMaXN0ZW5lcnMuc3BsaWNlKDApKSB7XG5cdFx0XHRsaXN0ZW5lcihlKTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgdHJhbnNwb3J0OiBJQ29kZXhBcHBTZXJ2ZXJUcmFuc3BvcnQgPSB7XG5cdFx0c3RkaW46IGNsaWVudFN0ZGluLFxuXHRcdHN0ZG91dDogY2xpZW50U3Rkb3V0LFxuXHRcdGtpbGwoX3NpZ25hbCkge1xuXHRcdFx0a2lsbENvdW50Kys7XG5cdFx0XHRpZiAoa2lsbGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGtpbGxlZCA9IHRydWU7XG5cdFx0XHRmaXJlRXhpdCh7IGNvZGU6IG51bGwsIHNpZ25hbDogX3NpZ25hbCA/PyBudWxsIH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSxcblx0XHRvbkV4aXQ6IGV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdG9uRXhpdE9uY2UobGlzdGVuZXIpIHtcblx0XHRcdG9uY2VFeGl0TGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xuXHRcdH0sXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHR0cmFuc3BvcnQsXG5cdFx0b3V0Ym91bmQ6IGNsaWVudFN0ZGluLFxuXHRcdGdldCBraWxsQ291bnQoKSB7IHJldHVybiBraWxsQ291bnQ7IH0sXG5cdFx0cHVzaChtZXNzYWdlOiBvYmplY3QpIHtcblx0XHRcdGNsaWVudFN0ZG91dC53cml0ZShKU09OLnN0cmluZ2lmeShtZXNzYWdlKSArICdcXG4nKTtcblx0XHR9LFxuXHRcdGV4aXQoY29kZSwgc2lnbmFsID0gbnVsbCkge1xuXHRcdFx0ZmlyZUV4aXQoeyBjb2RlLCBzaWduYWwgfSk7XG5cdFx0fSxcblx0XHRkaXNwb3NlKCkge1xuXHRcdFx0b25jZUV4aXRMaXN0ZW5lcnMubGVuZ3RoID0gMDtcblx0XHRcdGV4aXRFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRcdGNsaWVudFN0ZGluLmRlc3Ryb3koKTtcblx0XHRcdGNsaWVudFN0ZG91dC5kZXN0cm95KCk7XG5cdFx0fSxcblx0fTtcbn1cblxuLyoqXG4gKiBDb25zdW1lIG5ld2xpbmUtZGVsaW1pdGVkIEpTT04gZnJvbSBhIHN0cmVhbS4gUmVzb2x2ZXMgd2l0aCB0aGUgbmV4dFxuICogY29tcGxldGUgbWVzc2FnZTsgcmVqZWN0cyBpZiBgdGltZW91dE1zYCBlbGFwc2VzIG9yIHRoZSBzdHJlYW0gZW5kcy5cbiAqL1xuZnVuY3Rpb24gcmVhZE5leHRNZXNzYWdlKHN0cmVhbTogUGFzc1Rocm91Z2gsIHRpbWVvdXRNcyA9IDFfMDAwKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0bGV0IGJ1ZiA9ICcnO1xuXHRcdGNvbnN0IG9uRGF0YSA9IChjaHVuazogQnVmZmVyIHwgc3RyaW5nKSA9PiB7XG5cdFx0XHRidWYgKz0gdHlwZW9mIGNodW5rID09PSAnc3RyaW5nJyA/IGNodW5rIDogY2h1bmsudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdGNvbnN0IG5sID0gYnVmLmluZGV4T2YoJ1xcbicpO1xuXHRcdFx0aWYgKG5sIDwgMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lID0gYnVmLnNsaWNlKDAsIG5sKS50cmltKCk7XG5cdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXNvbHZlKEpTT04ucGFyc2UobGluZSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgb25FbmQgPSAoKSA9PiB7XG5cdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRyZWplY3QobmV3IEVycm9yKCdzdHJlYW0gZW5kZWQgYmVmb3JlIG1lc3NhZ2UgYXJyaXZlZCcpKTtcblx0XHR9O1xuXHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRyZWplY3QobmV3IEVycm9yKCd0aW1lZCBvdXQgd2FpdGluZyBmb3IgbWVzc2FnZScpKTtcblx0XHR9LCB0aW1lb3V0TXMpO1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0c3RyZWFtLm9mZignZGF0YScsIG9uRGF0YSk7XG5cdFx0XHRzdHJlYW0ub2ZmKCdlbmQnLCBvbkVuZCk7XG5cdFx0fTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBvbkRhdGEpO1xuXHRcdHN0cmVhbS5vbignZW5kJywgb25FbmQpO1xuXHR9KTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG5zdWl0ZSgnQ29kZXhBcHBTZXJ2ZXJDbGllbnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVxdWVzdCByb3VuZHRyaXAgcmVzb2x2ZXMgd2l0aCB0eXBlZCByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIElzc3VlIGEgcmVxdWVzdCBhbmQgY2FwdHVyZSB3aGF0J3Mgd3JpdHRlbiBvbiB0aGUgd2lyZS5cblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IGNsaWVudC5yZXF1ZXN0PCdnZXRBdXRoU3RhdHVzJz4oJ2dldEF1dGhTdGF0dXMnLCB7IHJlZnJlc2hUb2tlbjogZmFsc2UsIGluY2x1ZGVUb2tlbjogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBzZW50ID0gYXdhaXQgcmVhZE5leHRNZXNzYWdlKHBlZXIub3V0Ym91bmQpIGFzIHsgaWQ6IG51bWJlcjsgbWV0aG9kOiBzdHJpbmc7IHBhcmFtczogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnQubWV0aG9kLCAnZ2V0QXV0aFN0YXR1cycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50LnBhcmFtcywgeyByZWZyZXNoVG9rZW46IGZhbHNlLCBpbmNsdWRlVG9rZW46IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBzZW50LmlkLCAnbnVtYmVyJyk7XG5cblx0XHRcdC8vIFJlcGx5IHdpdGggc3VjY2Vzcy5cblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzZW50LmlkLCByZXN1bHQ6IHsgYXV0aE1vZGU6ICdhcGlrZXknIH0gfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBhdXRoTW9kZTogc3RyaW5nIH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBhdXRoTW9kZTogJ2FwaWtleScgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3QgaW5jbHVkZXMgVzNDIHRyYWNlIGNvbnRleHQgd2hlbiBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwZWVyID0gbWFrZUZha2VQZWVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gY2xpZW50LnJlcXVlc3QoJ2dldEF1dGhTdGF0dXMnLCB7IHJlZnJlc2hUb2tlbjogZmFsc2UsIGluY2x1ZGVUb2tlbjogZmFsc2UgfSwge1xuXHRcdFx0XHR0cmFjZUlkOiAnMScucmVwZWF0KDMyKSxcblx0XHRcdFx0c3BhbklkOiAnMicucmVwZWF0KDE2KSxcblx0XHRcdFx0dHJhY2VwYXJlbnQ6IGAwMC0keycxJy5yZXBlYXQoMzIpfS0keycyJy5yZXBlYXQoMTYpfS0wMWAsXG5cdFx0XHRcdHRyYWNlc3RhdGU6ICd2ZW5kb3I9dmFsdWUnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzZW50ID0gYXdhaXQgcmVhZE5leHRNZXNzYWdlKHBlZXIub3V0Ym91bmQpIGFzIHsgaWQ6IG51bWJlcjsgdHJhY2U6IHVua25vd24gfTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudC50cmFjZSwge1xuXHRcdFx0XHR0cmFjZXBhcmVudDogYDAwLSR7JzEnLnJlcGVhdCgzMil9LSR7JzInLnJlcGVhdCgxNil9LTAxYCxcblx0XHRcdFx0dHJhY2VzdGF0ZTogJ3ZlbmRvcj12YWx1ZScsXG5cdFx0XHR9KTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzZW50LmlkLCByZXN1bHQ6IHsgYXV0aE1vZGU6ICdhcGlrZXknIH0gfSk7XG5cdFx0XHRhd2FpdCByZXNwb25zZVByb21pc2U7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3QgcmVqZWN0cyB3aXRoIEpzb25ScGNFcnJvciBvbiBlcnJvciBlbnZlbG9wZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwZWVyID0gbWFrZUZha2VQZWVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gY2xpZW50LnJlcXVlc3QoJ2dldEF1dGhTdGF0dXMnLCB7IHJlZnJlc2hUb2tlbjogZmFsc2UsIGluY2x1ZGVUb2tlbjogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBzZW50ID0gYXdhaXQgcmVhZE5leHRNZXNzYWdlKHBlZXIub3V0Ym91bmQpIGFzIHsgaWQ6IG51bWJlciB9O1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHNlbnQuaWQsIGVycm9yOiB7IGNvZGU6IC0zMjAwMSwgbWVzc2FnZTogJ292ZXJsb2FkZWQnIH0gfSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXNwb25zZVByb21pc2UsIChlcnI6IHVua25vd24pID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGVyciBpbnN0YW5jZW9mIEpzb25ScGNFcnJvciwgJ2V4cGVjdGVkIEpzb25ScGNFcnJvcicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLmNvZGUsIC0zMjAwMSk7XG5cdFx0XHRcdGFzc2VydC5tYXRjaChlcnIubWVzc2FnZSwgL292ZXJsb2FkZWQvKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdCByZXNwb25zZSBpZHMgbXVzdCBtYXRjaCB0aGUgbnVtZXJpYyBpZCBleGFjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBlZXIgPSBtYWtlRmFrZVBlZXIoKTtcblx0XHRjb25zdCBsb2dzOiB7IGxldmVsOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQsIChsZXZlbCwgbWVzc2FnZSkgPT4gbG9ncy5wdXNoKHsgbGV2ZWwsIG1lc3NhZ2UgfSkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSBjbGllbnQucmVxdWVzdDwnZ2V0QXV0aFN0YXR1cyc+KCdnZXRBdXRoU3RhdHVzJywgeyByZWZyZXNoVG9rZW46IGZhbHNlLCBpbmNsdWRlVG9rZW46IGZhbHNlIH0pO1xuXHRcdFx0Y29uc3Qgc2VudCA9IGF3YWl0IHJlYWROZXh0TWVzc2FnZShwZWVyLm91dGJvdW5kKSBhcyB7IGlkOiBudW1iZXIgfTtcblxuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IFN0cmluZyhzZW50LmlkKSwgcmVzdWx0OiB7IGF1dGhNb2RlOiAnYXBpa2V5JyB9IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRJbW1lZGlhdGUocikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2dzLCBbeyBsZXZlbDogJ3dhcm4nLCBtZXNzYWdlOiBgdW5zb2xpY2l0ZWQgcmVzcG9uc2UgaWQ9JHtzZW50LmlkfWAgfV0pO1xuXG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc2VudC5pZCwgcmVzdWx0OiB7IGF1dGhNb2RlOiAnYXBpa2V5JyB9IH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZXNwb25zZVByb21pc2UsIHsgYXV0aE1vZGU6ICdhcGlrZXknIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdub3RpZnkgd3JpdGVzIGEgcGF5bG9hZCB3aXRoIG5vIGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBlZXIgPSBtYWtlRmFrZVBlZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjbGllbnQubm90aWZ5KCdpbml0aWFsaXplZCcsIHVuZGVmaW5lZCBhcyBuZXZlcik7XG5cdFx0XHRjb25zdCBzZW50ID0gYXdhaXQgcmVhZE5leHRNZXNzYWdlKHBlZXIub3V0Ym91bmQpIGFzIHsgaWQ/OiB1bmtub3duOyBtZXRob2Q6IHN0cmluZzsgcGFyYW1zPzogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnQubWV0aG9kLCAnaW5pdGlhbGl6ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW50LmlkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnQucGFyYW1zLCB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXIgbm90aWZpY2F0aW9uIGlzIGRlbGl2ZXJlZCB0byByZWdpc3RlcmVkIGhhbmRsZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlY2VpdmVkOiB1bmtub3duW10gPSBbXTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGNsaWVudC5vbk5vdGlmaWNhdGlvbigndGhyZWFkL3N0YXJ0ZWQnLCBwYXJhbXMgPT4gcmVjZWl2ZWQucHVzaChwYXJhbXMpKTtcblx0XHRcdHBlZXIucHVzaCh7IG1ldGhvZDogJ3RocmVhZC9zdGFydGVkJywgcGFyYW1zOiB7IHRocmVhZDogeyBpZDogJ3Rocl94JyB9IH0gfSk7XG5cdFx0XHQvLyBHaXZlIHRoZSBkYXRhIGV2ZW50IGEgdGljay5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0SW1tZWRpYXRlKHIpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWQsIFt7IHRocmVhZDogeyBpZDogJ3Rocl94JyB9IH1dKTtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaGFuZGxlZCBzZXJ2ZXIgbm90aWZpY2F0aW9uIGlzIGRyb3BwZWQgd2l0aCBhIHdhcm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGxvZ3M6IHsgbGV2ZWw6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCwgKGxldmVsLCBtZXNzYWdlKSA9PiBsb2dzLnB1c2goeyBsZXZlbCwgbWVzc2FnZSB9KSk7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBjbGllbnQub25Ob3RpZmljYXRpb24oJ3RocmVhZC9zdGFydGVkJywgKCkgPT4geyBpbnZva2VkID0gdHJ1ZTsgfSk7XG5cdFx0XHRwZWVyLnB1c2goeyBtZXRob2Q6ICdtYWRlLXVwL21ldGhvZCcsIHBhcmFtczogeyBhbnl0aGluZzogMSB9IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRJbW1lZGlhdGUocikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGludm9rZWQsIGxvZ3MgfSwge1xuXHRcdFx0XHRpbnZva2VkOiBmYWxzZSxcblx0XHRcdFx0bG9nczogW3sgbGV2ZWw6ICd3YXJuJywgbWVzc2FnZTogJ2Ryb3BwaW5nIHVuaGFuZGxlZCBub3RpZmljYXRpb246IG1hZGUtdXAvbWV0aG9kJyB9XSxcblx0XHRcdH0pO1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2VydmVyIHJlcXVlc3Qgd2l0aG91dCBoYW5kbGVyIHJldHVybnMgTWV0aG9kTm90Rm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiA5OSwgbWV0aG9kOiAnaXRlbS90b29sL3JlcXVlc3RVc2VySW5wdXQnLCBwYXJhbXM6IHsgcXVlc3Rpb25zOiBbXSB9IH0pO1xuXHRcdFx0Y29uc3QgcmVwbHkgPSBhd2FpdCByZWFkTmV4dE1lc3NhZ2UocGVlci5vdXRib3VuZCkgYXMgeyBpZDogbnVtYmVyOyBlcnJvcjogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwbHkuaWQsIDk5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBseS5lcnJvci5jb2RlLCBKc29uUnBjRXJyb3JDb2RlLk1ldGhvZE5vdEZvdW5kKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2VydmVyIHJlcXVlc3Qgd2l0aCBoYW5kbGVyIHJldHVybnMgcmVzdWx0IGVudmVsb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBlZXIgPSBtYWtlRmFrZVBlZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBjbGllbnQub25SZXF1ZXN0KCdpdGVtL3Rvb2wvcmVxdWVzdFVzZXJJbnB1dCcsIF9wYXJhbXMgPT4gKHtcblx0XHRcdFx0cmVzdWx0OiB7IGFuc3dlcnM6IHsgdGVzdDogeyBhbnN3ZXJzOiBbJ29rJ10gfSB9IH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogNywgbWV0aG9kOiAnaXRlbS90b29sL3JlcXVlc3RVc2VySW5wdXQnLCBwYXJhbXM6IHsgcXVlc3Rpb25zOiBbeyBpZDogJ3Rlc3QnLCBsYWJlbDogJ2dvPycgfV0gfSB9KTtcblx0XHRcdGNvbnN0IHJlcGx5ID0gYXdhaXQgcmVhZE5leHRNZXNzYWdlKHBlZXIub3V0Ym91bmQpIGFzIHsgaWQ6IG51bWJlcjsgcmVzdWx0OiB1bmtub3duIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwbHkuaWQsIDcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBseS5yZXN1bHQsIHsgYW5zd2VyczogeyB0ZXN0OiB7IGFuc3dlcnM6IFsnb2snXSB9IH0gfSk7XG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXIgcmVxdWVzdCBoYW5kbGVyIHRocm93aW5nIGlzIGNvbnZlcnRlZCB0byBJbnRlcm5hbEVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBlZXIgPSBtYWtlRmFrZVBlZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBjbGllbnQub25SZXF1ZXN0KCdpdGVtL3Rvb2wvcmVxdWVzdFVzZXJJbnB1dCcsICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdib29tJyk7XG5cdFx0XHR9KTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiA4LCBtZXRob2Q6ICdpdGVtL3Rvb2wvcmVxdWVzdFVzZXJJbnB1dCcsIHBhcmFtczogeyBxdWVzdGlvbnM6IFtdIH0gfSk7XG5cdFx0XHRjb25zdCByZXBseSA9IGF3YWl0IHJlYWROZXh0TWVzc2FnZShwZWVyLm91dGJvdW5kKSBhcyB7IGlkOiBudW1iZXI7IGVycm9yOiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBseS5lcnJvci5jb2RlLCBKc29uUnBjRXJyb3JDb2RlLkludGVybmFsRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm1hdGNoKHJlcGx5LmVycm9yLm1lc3NhZ2UsIC9ib29tLyk7XG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcm9jZXNzIGV4aXQgcmVqZWN0cyBpbi1mbGlnaHQgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IGNsaWVudC5yZXF1ZXN0KCdnZXRBdXRoU3RhdHVzJywgeyByZWZyZXNoVG9rZW46IGZhbHNlLCBpbmNsdWRlVG9rZW46IGZhbHNlIH0pO1xuXHRcdFx0Ly8gQ29uc3VtZSB0aGUgb3V0Ym91bmQgd3JpdGUgc28gdGhlIHJlcXVlc3QgaXMgZnVsbHkgZGlzcGF0Y2hlZC5cblx0XHRcdGF3YWl0IHJlYWROZXh0TWVzc2FnZShwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIuZXhpdCgxKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlc3BvbnNlUHJvbWlzZSwgKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgSnNvblJwY0Vycm9yLCAnZXhwZWN0ZWQgSnNvblJwY0Vycm9yJyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgcmVqZWN0cyBwZW5kaW5nIHJlcXVlc3RzIHdpdGggQ2FuY2VsbGF0aW9uRXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gY2xpZW50LnJlcXVlc3QoJ2dldEF1dGhTdGF0dXMnLCB7IHJlZnJlc2hUb2tlbjogZmFsc2UsIGluY2x1ZGVUb2tlbjogZmFsc2UgfSk7XG5cdFx0YXdhaXQgcmVhZE5leHRNZXNzYWdlKHBlZXIub3V0Ym91bmQpO1xuXHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzcG9uc2VQcm9taXNlLCAoZXJyOiB1bmtub3duKSA9PiBlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0cGVlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgY2FuY2VscyBncmFjZSBraWxsIHdoZW4gdHJhbnNwb3J0IGV4aXRzIGNsZWFubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCwgdW5kZWZpbmVkLCAxKTtcblx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdHBlZXIuZXhpdCgwKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZWVyLmtpbGxDb3VudCwgMCk7XG5cdFx0cGVlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbXVsdGlwbGUgbWVzc2FnZXMgYXJyaXZpbmcgaW4gYSBzaW5nbGUgY2h1bmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlY2VpdmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaDEgPSBjbGllbnQub25Ob3RpZmljYXRpb24oJ3RocmVhZC9zdGFydGVkJywgKCkgPT4gcmVjZWl2ZWQucHVzaCgnYScpKTtcblx0XHRcdGNvbnN0IGgyID0gY2xpZW50Lm9uTm90aWZpY2F0aW9uKCd0dXJuL3N0YXJ0ZWQnLCAoKSA9PiByZWNlaXZlZC5wdXNoKCdiJykpO1xuXHRcdFx0Ly8gVHdvIE5ESlNPTiBsaW5lcyBpbiBvbmUgY2h1bmsuXG5cdFx0XHRwZWVyLnRyYW5zcG9ydC5zdGRvdXQuZW1pdCgnZGF0YScsIEpTT04uc3RyaW5naWZ5KHsgbWV0aG9kOiAndGhyZWFkL3N0YXJ0ZWQnLCBwYXJhbXM6IHsgdGhyZWFkOiB7IGlkOiAndCcgfSB9IH0pICsgJ1xcbicgKyBKU09OLnN0cmluZ2lmeSh7IG1ldGhvZDogJ3R1cm4vc3RhcnRlZCcsIHBhcmFtczogeyB0dXJuOiB7IGlkOiAneCcgfSB9IH0pICsgJ1xcbicpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRJbW1lZGlhdGUocikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZCwgWydhJywgJ2InXSk7XG5cdFx0XHRoMS5kaXNwb3NlKCk7XG5cdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnRpYWwgbGluZSBpcyBidWZmZXJlZCB1bnRpbCBuZXdsaW5lIGFycml2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlciA9IG1ha2VGYWtlUGVlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlY2VpdmVkOiB1bmtub3duW10gPSBbXTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGNsaWVudC5vbk5vdGlmaWNhdGlvbigndGhyZWFkL3N0YXJ0ZWQnLCBwYXJhbXMgPT4gcmVjZWl2ZWQucHVzaChwYXJhbXMpKTtcblx0XHRcdGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeSh7IG1ldGhvZDogJ3RocmVhZC9zdGFydGVkJywgcGFyYW1zOiB7IHRocmVhZDogeyBpZDogJ3NwbGl0JyB9IH0gfSkgKyAnXFxuJztcblx0XHRcdHBlZXIudHJhbnNwb3J0LnN0ZG91dC5lbWl0KCdkYXRhJywganNvbi5zbGljZSgwLCAxMCkpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRJbW1lZGlhdGUocikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZCwgW10pO1xuXHRcdFx0cGVlci50cmFuc3BvcnQuc3Rkb3V0LmVtaXQoJ2RhdGEnLCBqc29uLnNsaWNlKDEwKSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldEltbWVkaWF0ZShyKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkLCBbeyB0aHJlYWQ6IHsgaWQ6ICdzcGxpdCcgfSB9XSk7XG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFvQlAsU0FBUyxlQUEwQjtBQUNsQyxRQUFNLGNBQWMsSUFBSSxZQUFZO0FBQ3BDLFFBQU0sZUFBZSxJQUFJLFlBQVk7QUFDckMsUUFBTSxjQUFjLElBQUksUUFBa0Y7QUFDMUcsUUFBTSxvQkFBK0csQ0FBQztBQUN0SCxNQUFJLFNBQVM7QUFDYixNQUFJLFlBQVk7QUFDaEIsUUFBTSxXQUFXLENBQUMsTUFBZ0Y7QUFDakcsZ0JBQVksS0FBSyxDQUFDO0FBQ2xCLGVBQVcsWUFBWSxrQkFBa0IsT0FBTyxDQUFDLEdBQUc7QUFDbkQsZUFBUyxDQUFDO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLFlBQXNDO0FBQUEsSUFDM0MsT0FBTztBQUFBLElBQ1AsUUFBUTtBQUFBLElBQ1IsS0FBSyxTQUFTO0FBQ2I7QUFDQSxVQUFJLFFBQVE7QUFDWCxlQUFPO0FBQUEsTUFDUjtBQUNBLGVBQVM7QUFDVCxlQUFTLEVBQUUsTUFBTSxNQUFNLFFBQVEsV0FB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
