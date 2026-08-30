import assert from "assert";
import { DeferredPromise } from "../../common/async.js";
import { CancellationTokenSource } from "../../common/cancellation.js";
import { CancellationError } from "../../common/errors.js";
import { JsonRpcError, JsonRpcProtocol } from "../../common/jsonRpcProtocol.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JsonRpcProtocol", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const createProtocol = (handlers = {}) => {
    const sentMessages = [];
    const protocol = new JsonRpcProtocol((message) => sentMessages.push(message), handlers);
    store.add(protocol);
    return { protocol, sentMessages };
  };
  test("sendNotification adds jsonrpc envelope", () => {
    const { protocol, sentMessages } = createProtocol();
    protocol.sendNotification({ method: "notify", params: { value: 1 } });
    assert.deepStrictEqual(sentMessages, [{
      jsonrpc: "2.0",
      method: "notify",
      params: { value: 1 }
    }]);
  });
  test("sendRequest resolves on success response", async () => {
    const { protocol, sentMessages } = createProtocol();
    const requestPromise = protocol.sendRequest({ method: "echo", params: { value: "ok" } });
    const outgoingRequest = sentMessages[0];
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: outgoingRequest.id,
      result: "done"
    });
    const result = await requestPromise;
    assert.strictEqual(result, "done");
    assert.deepStrictEqual(replies, []);
  });
  test("sendRequest rejects on error response", async () => {
    const { protocol, sentMessages } = createProtocol();
    const requestPromise = protocol.sendRequest({ method: "fail" });
    const outgoingRequest = sentMessages[0];
    await protocol.handleMessage({
      jsonrpc: "2.0",
      id: outgoingRequest.id,
      error: {
        code: 123,
        message: "Failure",
        data: { source: "test" }
      }
    });
    await assert.rejects(requestPromise, (error) => {
      assert.ok(error instanceof JsonRpcError);
      assert.strictEqual(error.code, 123);
      assert.strictEqual(error.message, "Failure");
      assert.deepStrictEqual(error.data, { source: "test" });
      return true;
    });
  });
  test("sendRequest honors cancellation token and invokes onCancel", async () => {
    const { protocol, sentMessages } = createProtocol();
    const cts = new CancellationTokenSource();
    let canceledId;
    const requestPromise = protocol.sendRequest(
      { method: "cancel-me" },
      cts.token,
      (id) => canceledId = id
    );
    const outgoingRequest = sentMessages[0];
    cts.cancel();
    await assert.rejects(requestPromise, (error) => error instanceof CancellationError);
    assert.strictEqual(canceledId, outgoingRequest.id);
    cts.dispose(true);
  });
  test("cancelPendingRequest rejects active request", async () => {
    const { protocol, sentMessages } = createProtocol();
    const requestPromise = protocol.sendRequest({ method: "pending" });
    const outgoingRequest = sentMessages[0];
    protocol.cancelPendingRequest(outgoingRequest.id);
    await assert.rejects(requestPromise, (error) => error instanceof CancellationError);
  });
  test("handleRequest responds with method not found without handler", async () => {
    const { protocol, sentMessages } = createProtocol();
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "unknown"
    });
    const expected = [{
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: -32601,
        message: "Method not found: unknown"
      }
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleRequest responds with result and passes cancellation token", async () => {
    let receivedToken;
    let wasCanceledDuringHandler;
    const { protocol, sentMessages } = createProtocol({
      handleRequest: async (request, token) => {
        receivedToken = token;
        wasCanceledDuringHandler = token.isCancellationRequested;
        return `${request.method}:ok`;
      }
    });
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: 9,
      method: "compute"
    });
    assert.ok(receivedToken);
    assert.strictEqual(wasCanceledDuringHandler, false);
    const expected = [{
      jsonrpc: "2.0",
      id: 9,
      result: "compute:ok"
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleRequest serializes JsonRpcError and returns it", async () => {
    const { protocol, sentMessages } = createProtocol({
      handleRequest: () => {
        throw new JsonRpcError(88, "bad request", { detail: true });
      }
    });
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: "a",
      method: "boom"
    });
    const expected = [{
      jsonrpc: "2.0",
      id: "a",
      error: {
        code: 88,
        message: "bad request",
        data: { detail: true }
      }
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleRequest maps unknown errors to internal error and returns it", async () => {
    const { protocol, sentMessages } = createProtocol({
      handleRequest: () => {
        throw new Error("unexpected");
      }
    });
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: "b",
      method: "explode"
    });
    const expected = [{
      jsonrpc: "2.0",
      id: "b",
      error: {
        code: -32603,
        message: "unexpected"
      }
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleMessage processes batch sequentially", async () => {
    const sequence = [];
    const gate = new DeferredPromise();
    const { protocol } = createProtocol({
      handleRequest: async () => {
        sequence.push("request:start");
        await gate.p;
        sequence.push("request:end");
        return true;
      },
      handleNotification: () => {
        sequence.push("notification");
      }
    });
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "first"
    };
    const notification = {
      jsonrpc: "2.0",
      method: "second"
    };
    const handlingPromise = protocol.handleMessage([request, notification]);
    assert.deepStrictEqual(sequence, ["request:start"]);
    gate.complete();
    const replies = await handlingPromise;
    assert.deepStrictEqual(sequence, ["request:start", "request:end", "notification"]);
    assert.deepStrictEqual(replies, [{ jsonrpc: "2.0", id: 1, result: true }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGpzb25ScGNQcm90b2NvbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElKc29uUnBjTm90aWZpY2F0aW9uLCBJSnNvblJwY1Byb3RvY29sSGFuZGxlcnMsIElKc29uUnBjUmVxdWVzdCwgSnNvblJwY0Vycm9yLCBKc29uUnBjTWVzc2FnZSwgSnNvblJwY1Byb3RvY29sIH0gZnJvbSAnLi4vLi4vY29tbW9uL2pzb25ScGNQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0pzb25ScGNQcm90b2NvbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNyZWF0ZVByb3RvY29sID0gKGhhbmRsZXJzOiBJSnNvblJwY1Byb3RvY29sSGFuZGxlcnMgPSB7fSkgPT4ge1xuXHRcdGNvbnN0IHNlbnRNZXNzYWdlczogSnNvblJwY01lc3NhZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3RvY29sID0gbmV3IEpzb25ScGNQcm90b2NvbChtZXNzYWdlID0+IHNlbnRNZXNzYWdlcy5wdXNoKG1lc3NhZ2UpLCBoYW5kbGVycyk7XG5cdFx0c3RvcmUuYWRkKHByb3RvY29sKTtcblx0XHRyZXR1cm4geyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH07XG5cdH07XG5cblx0dGVzdCgnc2VuZE5vdGlmaWNhdGlvbiBhZGRzIGpzb25ycGMgZW52ZWxvcGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH0gPSBjcmVhdGVQcm90b2NvbCgpO1xuXG5cdFx0cHJvdG9jb2wuc2VuZE5vdGlmaWNhdGlvbih7IG1ldGhvZDogJ25vdGlmeScsIHBhcmFtczogeyB2YWx1ZTogMSB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50TWVzc2FnZXMsIFt7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ25vdGlmeScsXG5cdFx0XHRwYXJhbXM6IHsgdmFsdWU6IDEgfVxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgcmVzb2x2ZXMgb24gc3VjY2VzcyByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfSA9IGNyZWF0ZVByb3RvY29sKCk7XG5cblx0XHRjb25zdCByZXF1ZXN0UHJvbWlzZSA9IHByb3RvY29sLnNlbmRSZXF1ZXN0PHN0cmluZz4oeyBtZXRob2Q6ICdlY2hvJywgcGFyYW1zOiB7IHZhbHVlOiAnb2snIH0gfSk7XG5cdFx0Y29uc3Qgb3V0Z29pbmdSZXF1ZXN0ID0gc2VudE1lc3NhZ2VzWzBdIGFzIElKc29uUnBjUmVxdWVzdDtcblxuXHRcdGNvbnN0IHJlcGxpZXMgPSBhd2FpdCBwcm90b2NvbC5oYW5kbGVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IG91dGdvaW5nUmVxdWVzdC5pZCxcblx0XHRcdHJlc3VsdDogJ2RvbmUnXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXF1ZXN0UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnZG9uZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwbGllcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCByZWplY3RzIG9uIGVycm9yIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wsIHNlbnRNZXNzYWdlcyB9ID0gY3JlYXRlUHJvdG9jb2woKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RQcm9taXNlID0gcHJvdG9jb2wuc2VuZFJlcXVlc3QoeyBtZXRob2Q6ICdmYWlsJyB9KTtcblx0XHRjb25zdCBvdXRnb2luZ1JlcXVlc3QgPSBzZW50TWVzc2FnZXNbMF0gYXMgSUpzb25ScGNSZXF1ZXN0O1xuXG5cdFx0YXdhaXQgcHJvdG9jb2wuaGFuZGxlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiBvdXRnb2luZ1JlcXVlc3QuaWQsXG5cdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRjb2RlOiAxMjMsXG5cdFx0XHRcdG1lc3NhZ2U6ICdGYWlsdXJlJyxcblx0XHRcdFx0ZGF0YTogeyBzb3VyY2U6ICd0ZXN0JyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXF1ZXN0UHJvbWlzZSwgZXJyb3IgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgSnNvblJwY0Vycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5jb2RlLCAxMjMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLm1lc3NhZ2UsICdGYWlsdXJlJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9yLmRhdGEsIHsgc291cmNlOiAndGVzdCcgfSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgaG9ub3JzIGNhbmNlbGxhdGlvbiB0b2tlbiBhbmQgaW52b2tlcyBvbkNhbmNlbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfSA9IGNyZWF0ZVByb3RvY29sKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0bGV0IGNhbmNlbGVkSWQ6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJlcXVlc3RQcm9taXNlID0gcHJvdG9jb2wuc2VuZFJlcXVlc3QoXG5cdFx0XHR7IG1ldGhvZDogJ2NhbmNlbC1tZScgfSxcblx0XHRcdGN0cy50b2tlbixcblx0XHRcdGlkID0+IGNhbmNlbGVkSWQgPSBpZCxcblx0XHQpO1xuXHRcdGNvbnN0IG91dGdvaW5nUmVxdWVzdCA9IHNlbnRNZXNzYWdlc1swXSBhcyBJSnNvblJwY1JlcXVlc3Q7XG5cblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXF1ZXN0UHJvbWlzZSwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbmNlbGVkSWQsIG91dGdvaW5nUmVxdWVzdC5pZCk7XG5cblx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsUGVuZGluZ1JlcXVlc3QgcmVqZWN0cyBhY3RpdmUgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfSA9IGNyZWF0ZVByb3RvY29sKCk7XG5cblx0XHRjb25zdCByZXF1ZXN0UHJvbWlzZSA9IHByb3RvY29sLnNlbmRSZXF1ZXN0KHsgbWV0aG9kOiAncGVuZGluZycgfSk7XG5cdFx0Y29uc3Qgb3V0Z29pbmdSZXF1ZXN0ID0gc2VudE1lc3NhZ2VzWzBdIGFzIElKc29uUnBjUmVxdWVzdDtcblx0XHRwcm90b2NvbC5jYW5jZWxQZW5kaW5nUmVxdWVzdChvdXRnb2luZ1JlcXVlc3QuaWQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVxdWVzdFByb21pc2UsIGVycm9yID0+IGVycm9yIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVSZXF1ZXN0IHJlc3BvbmRzIHdpdGggbWV0aG9kIG5vdCBmb3VuZCB3aXRob3V0IGhhbmRsZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH0gPSBjcmVhdGVQcm90b2NvbCgpO1xuXG5cdFx0Y29uc3QgcmVwbGllcyA9IGF3YWl0IHByb3RvY29sLmhhbmRsZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogNyxcblx0XHRcdG1ldGhvZDogJ3Vua25vd24nXG5cdFx0fSk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFt7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiA3LFxuXHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0Y29kZTogLTMyNjAxLFxuXHRcdFx0XHRtZXNzYWdlOiAnTWV0aG9kIG5vdCBmb3VuZDogdW5rbm93bidcblx0XHRcdH1cblx0XHR9XTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRNZXNzYWdlcywgZXhwZWN0ZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwbGllcywgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVSZXF1ZXN0IHJlc3BvbmRzIHdpdGggcmVzdWx0IGFuZCBwYXNzZXMgY2FuY2VsbGF0aW9uIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZWNlaXZlZFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgd2FzQ2FuY2VsZWREdXJpbmdIYW5kbGVyOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wsIHNlbnRNZXNzYWdlcyB9ID0gY3JlYXRlUHJvdG9jb2woe1xuXHRcdFx0aGFuZGxlUmVxdWVzdDogYXN5bmMgKHJlcXVlc3QsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJlY2VpdmVkVG9rZW4gPSB0b2tlbjtcblx0XHRcdFx0d2FzQ2FuY2VsZWREdXJpbmdIYW5kbGVyID0gdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0XHRcdHJldHVybiBgJHtyZXF1ZXN0Lm1ldGhvZH06b2tgO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVwbGllcyA9IGF3YWl0IHByb3RvY29sLmhhbmRsZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogOSxcblx0XHRcdG1ldGhvZDogJ2NvbXB1dGUnXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2socmVjZWl2ZWRUb2tlbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhc0NhbmNlbGVkRHVyaW5nSGFuZGxlciwgZmFsc2UpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW3tcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDksXG5cdFx0XHRyZXN1bHQ6ICdjb21wdXRlOm9rJ1xuXHRcdH1dO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudE1lc3NhZ2VzLCBleHBlY3RlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBsaWVzLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZVJlcXVlc3Qgc2VyaWFsaXplcyBKc29uUnBjRXJyb3IgYW5kIHJldHVybnMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH0gPSBjcmVhdGVQcm90b2NvbCh7XG5cdFx0XHRoYW5kbGVSZXF1ZXN0OiAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBKc29uUnBjRXJyb3IoODgsICdiYWQgcmVxdWVzdCcsIHsgZGV0YWlsOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVwbGllcyA9IGF3YWl0IHByb3RvY29sLmhhbmRsZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0bWV0aG9kOiAnYm9vbSdcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW3tcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdGNvZGU6IDg4LFxuXHRcdFx0XHRtZXNzYWdlOiAnYmFkIHJlcXVlc3QnLFxuXHRcdFx0XHRkYXRhOiB7IGRldGFpbDogdHJ1ZSB9XG5cdFx0XHR9XG5cdFx0fV07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50TWVzc2FnZXMsIGV4cGVjdGVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcGxpZXMsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlUmVxdWVzdCBtYXBzIHVua25vd24gZXJyb3JzIHRvIGludGVybmFsIGVycm9yIGFuZCByZXR1cm5zIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wsIHNlbnRNZXNzYWdlcyB9ID0gY3JlYXRlUHJvdG9jb2woe1xuXHRcdFx0aGFuZGxlUmVxdWVzdDogKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3VuZXhwZWN0ZWQnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlcGxpZXMgPSBhd2FpdCBwcm90b2NvbC5oYW5kbGVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6ICdiJyxcblx0XHRcdG1ldGhvZDogJ2V4cGxvZGUnXG5cdFx0fSk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFt7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAnYicsXG5cdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRjb2RlOiAtMzI2MDMsXG5cdFx0XHRcdG1lc3NhZ2U6ICd1bmV4cGVjdGVkJ1xuXHRcdFx0fVxuXHRcdH1dO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudE1lc3NhZ2VzLCBleHBlY3RlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBsaWVzLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZU1lc3NhZ2UgcHJvY2Vzc2VzIGJhdGNoIHNlcXVlbnRpYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXF1ZW5jZTogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBnYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wgfSA9IGNyZWF0ZVByb3RvY29sKHtcblx0XHRcdGhhbmRsZVJlcXVlc3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2VxdWVuY2UucHVzaCgncmVxdWVzdDpzdGFydCcpO1xuXHRcdFx0XHRhd2FpdCBnYXRlLnA7XG5cdFx0XHRcdHNlcXVlbmNlLnB1c2goJ3JlcXVlc3Q6ZW5kJyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdGhhbmRsZU5vdGlmaWNhdGlvbjogKCkgPT4ge1xuXHRcdFx0XHRzZXF1ZW5jZS5wdXNoKCdub3RpZmljYXRpb24nKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlcXVlc3Q6IElKc29uUnBjUmVxdWVzdCA9IHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDEsXG5cdFx0XHRtZXRob2Q6ICdmaXJzdCdcblx0XHR9O1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbjogSUpzb25ScGNOb3RpZmljYXRpb24gPSB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ3NlY29uZCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGFuZGxpbmdQcm9taXNlID0gcHJvdG9jb2wuaGFuZGxlTWVzc2FnZShbcmVxdWVzdCwgbm90aWZpY2F0aW9uXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXF1ZW5jZSwgWydyZXF1ZXN0OnN0YXJ0J10pO1xuXG5cdFx0Z2F0ZS5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IHJlcGxpZXMgPSBhd2FpdCBoYW5kbGluZ1Byb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcXVlbmNlLCBbJ3JlcXVlc3Q6c3RhcnQnLCAncmVxdWVzdDplbmQnLCAnbm90aWZpY2F0aW9uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwbGllcywgW3sganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IHRydWUgfV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUEwRSxjQUE4Qix1QkFBdUI7QUFDL0gsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QixRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFFBQU0s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
