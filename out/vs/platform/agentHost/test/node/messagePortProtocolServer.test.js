import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { JSON_RPC_PARSE_ERROR } from "../../common/state/sessionProtocol.js";
import { MessagePortProtocolServer } from "../../node/messagePortProtocolServer.js";
suite("MessagePortProtocolServer", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("isolates raw frames for each connected IPC client", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const frames = /* @__PURE__ */ new Map();
    const messages = /* @__PURE__ */ new Map();
    const transports = [];
    for (const client of ["one", "two"]) {
      frames.set(client, []);
      messages.set(client, []);
      ds.add(server.listen(client, "frame")((frame) => frames.get(client).push(frame)));
    }
    ds.add(server.onConnection((transport) => {
      const index = transports.push(transport) - 1;
      ds.add(transport.onMessage((message) => messages.get(index === 0 ? "one" : "two").push(message)));
    }));
    await server.call("one", "connect");
    await server.call("two", "connect");
    await server.call("one", "send", '{"jsonrpc":"2.0","id":1,"method":"one"}');
    await server.call("two", "send", '{"jsonrpc":"2.0","id":2,"method":"two"}');
    transports[0].send({ jsonrpc: "2.0", id: 1, result: { client: "one" } });
    transports[1].send({ jsonrpc: "2.0", id: 2, result: { client: "two" } });
    assert.deepStrictEqual({ messages, frames }, {
      messages: /* @__PURE__ */ new Map([
        ["one", [{ jsonrpc: "2.0", id: 1, method: "one" }]],
        ["two", [{ jsonrpc: "2.0", id: 2, method: "two" }]]
      ]),
      frames: /* @__PURE__ */ new Map([
        ["one", ['{"jsonrpc":"2.0","id":1,"result":{"client":"one"}}']],
        ["two", ['{"jsonrpc":"2.0","id":2,"result":{"client":"two"}}']]
      ])
    });
  });
  test("returns a parse error to only the client that sends malformed JSON", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const frames = /* @__PURE__ */ new Map([["one", []], ["two", []]]);
    const received = [];
    for (const client of frames.keys()) {
      ds.add(server.listen(client, "frame")((frame) => frames.get(client).push(frame)));
    }
    ds.add(server.onConnection((transport) => ds.add(transport.onMessage((message) => received.push(message)))));
    await server.call("one", "connect");
    await server.call("two", "connect");
    await server.call("one", "send", "{invalid");
    assert.deepStrictEqual({ frames, received }, {
      frames: /* @__PURE__ */ new Map([
        ["one", [JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: JSON_RPC_PARSE_ERROR, message: "Parse error" } })]],
        ["two", []]
      ]),
      received: []
    });
  });
  test("closes independent transports on IPC disconnect and channel close", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const closed = /* @__PURE__ */ new Map([["one", 0], ["two", 0]]);
    const messages = /* @__PURE__ */ new Map([["one", []], ["two", []]]);
    for (const client of closed.keys()) {
      ds.add(server.listen(client, "close")(() => closed.set(client, closed.get(client) + 1)));
    }
    let connection = 0;
    ds.add(server.onConnection((transport) => {
      const client = connection++ === 0 ? "one" : "two";
      ds.add(transport.onMessage((message) => messages.get(client).push(message)));
    }));
    await server.call("one", "connect");
    await server.call("two", "connect");
    server.closeClient("one");
    await assert.rejects(() => server.call("one", "send", '{"jsonrpc":"2.0","method":"closed"}'), /not connected/);
    await server.call("two", "send", '{"jsonrpc":"2.0","method":"open"}');
    await server.call("two", "close");
    assert.deepStrictEqual({ closed, messages }, {
      closed: /* @__PURE__ */ new Map([["one", 1], ["two", 1]]),
      messages: /* @__PURE__ */ new Map([
        ["one", []],
        ["two", [{ jsonrpc: "2.0", method: "open" }]]
      ])
    });
  });
  test("reconnects the same IPC client after its transport closes", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const transports = [];
    const messages = [];
    ds.add(server.onConnection((transport) => {
      const received = [];
      transports.push(transport);
      messages.push(received);
      ds.add(transport.onMessage((message) => received.push(message)));
    }));
    await server.call("renderer", "connect");
    await server.call("renderer", "close");
    await server.call("renderer", "connect");
    await server.call("renderer", "send", '{"jsonrpc":"2.0","method":"reconnected"}');
    assert.deepStrictEqual({
      connectionCount: transports.length,
      messages
    }, {
      connectionCount: 2,
      messages: [
        [],
        [{ jsonrpc: "2.0", method: "reconnected" }]
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxtZXNzYWdlUG9ydFByb3RvY29sU2VydmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEpTT05fUlBDX1BBUlNFX0VSUk9SLCB0eXBlIFByb3RvY29sTWVzc2FnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvdG9jb2xUcmFuc3BvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlUG9ydFByb3RvY29sU2VydmVyIH0gZnJvbSAnLi4vLi4vbm9kZS9tZXNzYWdlUG9ydFByb3RvY29sU2VydmVyLmpzJztcblxuc3VpdGUoJ01lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNvbGF0ZXMgcmF3IGZyYW1lcyBmb3IgZWFjaCBjb25uZWN0ZWQgSVBDIGNsaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBkcy5hZGQobmV3IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmcmFtZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvdG9jb2xNZXNzYWdlW10+KCk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0czogSVByb3RvY29sVHJhbnNwb3J0W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgY2xpZW50IG9mIFsnb25lJywgJ3R3byddKSB7XG5cdFx0XHRmcmFtZXMuc2V0KGNsaWVudCwgW10pO1xuXHRcdFx0bWVzc2FnZXMuc2V0KGNsaWVudCwgW10pO1xuXHRcdFx0ZHMuYWRkKHNlcnZlci5saXN0ZW48c3RyaW5nPihjbGllbnQsICdmcmFtZScpKGZyYW1lID0+IGZyYW1lcy5nZXQoY2xpZW50KSEucHVzaChmcmFtZSkpKTtcblx0XHR9XG5cdFx0ZHMuYWRkKHNlcnZlci5vbkNvbm5lY3Rpb24odHJhbnNwb3J0ID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdHJhbnNwb3J0cy5wdXNoKHRyYW5zcG9ydCkgLSAxO1xuXHRcdFx0ZHMuYWRkKHRyYW5zcG9ydC5vbk1lc3NhZ2UobWVzc2FnZSA9PiBtZXNzYWdlcy5nZXQoaW5kZXggPT09IDAgPyAnb25lJyA6ICd0d28nKSEucHVzaChtZXNzYWdlKSkpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCdvbmUnLCAnY29ubmVjdCcpO1xuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCd0d28nLCAnY29ubmVjdCcpO1xuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCdvbmUnLCAnc2VuZCcsICd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6MSxcIm1ldGhvZFwiOlwib25lXCJ9Jyk7XG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ3R3bycsICdzZW5kJywgJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoyLFwibWV0aG9kXCI6XCJ0d29cIn0nKTtcblx0XHR0cmFuc3BvcnRzWzBdLnNlbmQoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogeyBjbGllbnQ6ICdvbmUnIH0gfSk7XG5cdFx0dHJhbnNwb3J0c1sxXS5zZW5kKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCByZXN1bHQ6IHsgY2xpZW50OiAndHdvJyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1lc3NhZ2VzLCBmcmFtZXMgfSwge1xuXHRcdFx0bWVzc2FnZXM6IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ29uZScsIFt7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnb25lJyB9XV0sXG5cdFx0XHRcdFsndHdvJywgW3sganNvbnJwYzogJzIuMCcsIGlkOiAyLCBtZXRob2Q6ICd0d28nIH1dXSxcblx0XHRcdF0pLFxuXHRcdFx0ZnJhbWVzOiBuZXcgTWFwKFtcblx0XHRcdFx0WydvbmUnLCBbJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoxLFwicmVzdWx0XCI6e1wiY2xpZW50XCI6XCJvbmVcIn19J11dLFxuXHRcdFx0XHRbJ3R3bycsIFsne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjIsXCJyZXN1bHRcIjp7XCJjbGllbnRcIjpcInR3b1wifX0nXV0sXG5cdFx0XHRdKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIHBhcnNlIGVycm9yIHRvIG9ubHkgdGhlIGNsaWVudCB0aGF0IHNlbmRzIG1hbGZvcm1lZCBKU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGRzLmFkZChuZXcgTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZyYW1lcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmdbXT4oW1snb25lJywgW11dLCBbJ3R3bycsIFtdXV0pO1xuXHRcdGNvbnN0IHJlY2VpdmVkOiBQcm90b2NvbE1lc3NhZ2VbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBjbGllbnQgb2YgZnJhbWVzLmtleXMoKSkge1xuXHRcdFx0ZHMuYWRkKHNlcnZlci5saXN0ZW48c3RyaW5nPihjbGllbnQsICdmcmFtZScpKGZyYW1lID0+IGZyYW1lcy5nZXQoY2xpZW50KSEucHVzaChmcmFtZSkpKTtcblx0XHR9XG5cdFx0ZHMuYWRkKHNlcnZlci5vbkNvbm5lY3Rpb24odHJhbnNwb3J0ID0+IGRzLmFkZCh0cmFuc3BvcnQub25NZXNzYWdlKG1lc3NhZ2UgPT4gcmVjZWl2ZWQucHVzaChtZXNzYWdlKSkpKSk7XG5cblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgnb25lJywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgndHdvJywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgnb25lJywgJ3NlbmQnLCAne2ludmFsaWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmcmFtZXMsIHJlY2VpdmVkIH0sIHtcblx0XHRcdGZyYW1lczogbmV3IE1hcChbXG5cdFx0XHRcdFsnb25lJywgW0pTT04uc3RyaW5naWZ5KHsganNvbnJwYzogJzIuMCcsIGlkOiBudWxsLCBlcnJvcjogeyBjb2RlOiBKU09OX1JQQ19QQVJTRV9FUlJPUiwgbWVzc2FnZTogJ1BhcnNlIGVycm9yJyB9IH0pXV0sXG5cdFx0XHRcdFsndHdvJywgW11dLFxuXHRcdFx0XSksXG5cdFx0XHRyZWNlaXZlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlcyBpbmRlcGVuZGVudCB0cmFuc3BvcnRzIG9uIElQQyBkaXNjb25uZWN0IGFuZCBjaGFubmVsIGNsb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGRzLmFkZChuZXcgTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGNsb3NlZCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KFtbJ29uZScsIDBdLCBbJ3R3bycsIDBdXSk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvdG9jb2xNZXNzYWdlW10+KFtbJ29uZScsIFtdXSwgWyd0d28nLCBbXV1dKTtcblxuXHRcdGZvciAoY29uc3QgY2xpZW50IG9mIGNsb3NlZC5rZXlzKCkpIHtcblx0XHRcdGRzLmFkZChzZXJ2ZXIubGlzdGVuPHZvaWQ+KGNsaWVudCwgJ2Nsb3NlJykoKCkgPT4gY2xvc2VkLnNldChjbGllbnQsIGNsb3NlZC5nZXQoY2xpZW50KSEgKyAxKSkpO1xuXHRcdH1cblx0XHRsZXQgY29ubmVjdGlvbiA9IDA7XG5cdFx0ZHMuYWRkKHNlcnZlci5vbkNvbm5lY3Rpb24odHJhbnNwb3J0ID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGNvbm5lY3Rpb24rKyA9PT0gMCA/ICdvbmUnIDogJ3R3byc7XG5cdFx0XHRkcy5hZGQodHJhbnNwb3J0Lm9uTWVzc2FnZShtZXNzYWdlID0+IG1lc3NhZ2VzLmdldChjbGllbnQpIS5wdXNoKG1lc3NhZ2UpKSk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ29uZScsICdjb25uZWN0Jyk7XG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ3R3bycsICdjb25uZWN0Jyk7XG5cdFx0c2VydmVyLmNsb3NlQ2xpZW50KCdvbmUnKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2ZXIuY2FsbCgnb25lJywgJ3NlbmQnLCAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJtZXRob2RcIjpcImNsb3NlZFwifScpLCAvbm90IGNvbm5lY3RlZC8pO1xuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCd0d28nLCAnc2VuZCcsICd7XCJqc29ucnBjXCI6XCIyLjBcIixcIm1ldGhvZFwiOlwib3BlblwifScpO1xuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCd0d28nLCAnY2xvc2UnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjbG9zZWQsIG1lc3NhZ2VzIH0sIHtcblx0XHRcdGNsb3NlZDogbmV3IE1hcChbWydvbmUnLCAxXSwgWyd0d28nLCAxXV0pLFxuXHRcdFx0bWVzc2FnZXM6IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ29uZScsIFtdXSxcblx0XHRcdFx0Wyd0d28nLCBbeyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiAnb3BlbicgfV1dLFxuXHRcdFx0XSksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdHMgdGhlIHNhbWUgSVBDIGNsaWVudCBhZnRlciBpdHMgdHJhbnNwb3J0IGNsb3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBkcy5hZGQobmV3IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCB0cmFuc3BvcnRzOiBJUHJvdG9jb2xUcmFuc3BvcnRbXSA9IFtdO1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBQcm90b2NvbE1lc3NhZ2VbXVtdID0gW107XG5cdFx0ZHMuYWRkKHNlcnZlci5vbkNvbm5lY3Rpb24odHJhbnNwb3J0ID0+IHtcblx0XHRcdGNvbnN0IHJlY2VpdmVkOiBQcm90b2NvbE1lc3NhZ2VbXSA9IFtdO1xuXHRcdFx0dHJhbnNwb3J0cy5wdXNoKHRyYW5zcG9ydCk7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKHJlY2VpdmVkKTtcblx0XHRcdGRzLmFkZCh0cmFuc3BvcnQub25NZXNzYWdlKG1lc3NhZ2UgPT4gcmVjZWl2ZWQucHVzaChtZXNzYWdlKSkpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCdyZW5kZXJlcicsICdjb25uZWN0Jyk7XG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ3JlbmRlcmVyJywgJ2Nsb3NlJyk7XG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ3JlbmRlcmVyJywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgncmVuZGVyZXInLCAnc2VuZCcsICd7XCJqc29ucnBjXCI6XCIyLjBcIixcIm1ldGhvZFwiOlwicmVjb25uZWN0ZWRcIn0nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29ubmVjdGlvbkNvdW50OiB0cmFuc3BvcnRzLmxlbmd0aCxcblx0XHRcdG1lc3NhZ2VzLFxuXHRcdH0sIHtcblx0XHRcdGNvbm5lY3Rpb25Db3VudDogMixcblx0XHRcdG1lc3NhZ2VzOiBbXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRbeyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiAncmVjb25uZWN0ZWQnIH1dLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUFrRDtBQUUzRCxTQUFTLGlDQUFpQztBQUUxQyxNQUFNLDZCQUE2QixNQUFNO0FBQ3hDLFFBQU0sS0FBSyx3Q0FBd0M7QUFFbkQsT0FBSyxxREFBcUQsWUFBWTtBQUNyRSxVQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksMEJBQWtDLENBQUM7QUFDN0QsVUFBTSxTQUFTLG9CQUFJLElBQXNCO0FBQ3pDLFVBQU0sV0FBVyxvQkFBSSxJQUErQjtBQUNwRCxVQUFNLGFBQW1DLENBQUM7QUFFMUMsZUFBVyxVQUFVLENBQUMsT0FBTyxLQUFLLEdBQUc7QUFDcEMsYUFBTyxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQ3JCLGVBQVMsSUFBSSxRQUFRLENBQUMsQ0FBQztBQUN2QixTQUFHLElBQUksT0FBTyxPQUFlLFFBQVEsT0FBTyxFQUFFLFdBQVMsT0FBTyxJQUFJ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
