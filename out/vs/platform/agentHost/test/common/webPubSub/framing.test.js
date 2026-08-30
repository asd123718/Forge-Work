import assert from "assert";
import { VSBuffer, encodeBase64 } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Reassembler } from "../../../common/webPubSub/chunking.js";
import { FramingError, RELIABLE_JSON_SUBPROTOCOL, buildPublish, parseInbound } from "../../../common/webPubSub/framing.js";
function b64(s) {
  return encodeBase64(
    VSBuffer.fromString(s),
    true,
    false
    /* urlSafe */
  );
}
const GROUP = "user.u1.env.e1.client.c1.to-client";
suite("WebPubSub - framing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("exposes the reliable JSON subprotocol constant", () => {
    assert.strictEqual(RELIABLE_JSON_SUBPROTOCOL, "json.reliable.webpubsub.azure.v1");
  });
  test("builds a single sendToGroup command for a small payload", () => {
    let ack = 0;
    const commands = buildPublish({ group: GROUP, nextAckId: () => ++ack, payload: { hi: true } });
    assert.deepStrictEqual(commands, [{
      type: "sendToGroup",
      group: GROUP,
      ackId: 1,
      dataType: "json",
      noEcho: true,
      data: { kind: "message", data: { hi: true } }
    }]);
  });
  test("builds one command per chunk with monotonic ackIds", () => {
    let ack = 0;
    const commands = buildPublish({
      group: GROUP,
      nextAckId: () => ++ack,
      payload: { blob: "z".repeat(5e3) },
      chunkOptions: { maxChunkBytes: 1024, newGroupId: () => "g1" }
    });
    assert.ok(commands.length > 1);
    assert.deepStrictEqual(commands.map((c) => c.ackId), commands.map((_, i) => i + 1));
  });
  test("parses an inbound group payload frame", () => {
    const reassembler = new Reassembler();
    const result = parseInbound(
      { type: "message", from: "group", group: GROUP, dataType: "json", data: { kind: "message", data: { ok: 1 } } },
      { reassembler }
    );
    assert.deepStrictEqual(result, {
      kind: "payload",
      group: { scope: "client", lane: "to-client", uid: "u1", eid: "e1", cid: "c1" },
      payload: { ok: 1 }
    });
  });
  test("reports pending while chunks are still arriving", () => {
    const reassembler = new Reassembler();
    const first = parseInbound(
      {
        type: "message",
        from: "group",
        group: GROUP,
        dataType: "json",
        data: { kind: "chunk", group_id: "g1", seq: 0, total: 2, bytes: b64("aa") }
      },
      { reassembler }
    );
    assert.strictEqual(first.kind, "pending");
  });
  test("ignores non group-fanout frames", () => {
    const reassembler = new Reassembler();
    assert.strictEqual(parseInbound({ type: "ack", ackId: 1 }, { reassembler }).kind, "ignored");
    assert.strictEqual(parseInbound(null, { reassembler }).kind, "ignored");
    assert.strictEqual(parseInbound({ type: "message", from: "server" }, { reassembler }).kind, "ignored");
  });
  test("throws FramingError on malformed group-fanout frames", () => {
    const reassembler = new Reassembler();
    assert.throws(
      () => parseInbound({ type: "message", from: "group", dataType: "json", data: { kind: "message", data: 1 } }, { reassembler }),
      FramingError
    );
    assert.throws(
      () => parseInbound({ type: "message", from: "group", group: GROUP, dataType: "xml", data: {} }, { reassembler }),
      FramingError
    );
    assert.throws(
      () => parseInbound({ type: "message", from: "group", group: GROUP, dataType: "json" }, { reassembler }),
      FramingError
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHdlYlB1YlN1YlxcZnJhbWluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJlYXNzZW1ibGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dlYlB1YlN1Yi9jaHVua2luZy5qcyc7XG5pbXBvcnQgeyBGcmFtaW5nRXJyb3IsIFJFTElBQkxFX0pTT05fU1VCUFJPVE9DT0wsIGJ1aWxkUHVibGlzaCwgcGFyc2VJbmJvdW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dlYlB1YlN1Yi9mcmFtaW5nLmpzJztcblxuLyoqIFN0YW5kYXJkIGJhc2U2NCAocGFkZGVkKSBvZiBhbiBBU0NJSSBzdHJpbmcgXHUyMDE0IGVxdWl2YWxlbnQgdG8gYGJ0b2EocylgIGZvciBBU0NJSSBpbnB1dC4gKi9cbmZ1bmN0aW9uIGI2NChzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcocyksIHRydWUgLyogcGFkZGVkICovLCBmYWxzZSAvKiB1cmxTYWZlICovKTtcbn1cblxuY29uc3QgR1JPVVAgPSAndXNlci51MS5lbnYuZTEuY2xpZW50LmMxLnRvLWNsaWVudCc7XG5cbnN1aXRlKCdXZWJQdWJTdWIgLSBmcmFtaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2V4cG9zZXMgdGhlIHJlbGlhYmxlIEpTT04gc3VicHJvdG9jb2wgY29uc3RhbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFJFTElBQkxFX0pTT05fU1VCUFJPVE9DT0wsICdqc29uLnJlbGlhYmxlLndlYnB1YnN1Yi5henVyZS52MScpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZHMgYSBzaW5nbGUgc2VuZFRvR3JvdXAgY29tbWFuZCBmb3IgYSBzbWFsbCBwYXlsb2FkJywgKCkgPT4ge1xuXHRcdGxldCBhY2sgPSAwO1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gYnVpbGRQdWJsaXNoKHsgZ3JvdXA6IEdST1VQLCBuZXh0QWNrSWQ6ICgpID0+ICsrYWNrLCBwYXlsb2FkOiB7IGhpOiB0cnVlIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tYW5kcywgW3tcblx0XHRcdHR5cGU6ICdzZW5kVG9Hcm91cCcsXG5cdFx0XHRncm91cDogR1JPVVAsXG5cdFx0XHRhY2tJZDogMSxcblx0XHRcdGRhdGFUeXBlOiAnanNvbicsXG5cdFx0XHRub0VjaG86IHRydWUsXG5cdFx0XHRkYXRhOiB7IGtpbmQ6ICdtZXNzYWdlJywgZGF0YTogeyBoaTogdHJ1ZSB9IH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZHMgb25lIGNvbW1hbmQgcGVyIGNodW5rIHdpdGggbW9ub3RvbmljIGFja0lkcycsICgpID0+IHtcblx0XHRsZXQgYWNrID0gMDtcblx0XHRjb25zdCBjb21tYW5kcyA9IGJ1aWxkUHVibGlzaCh7XG5cdFx0XHRncm91cDogR1JPVVAsXG5cdFx0XHRuZXh0QWNrSWQ6ICgpID0+ICsrYWNrLFxuXHRcdFx0cGF5bG9hZDogeyBibG9iOiAneicucmVwZWF0KDUwMDApIH0sXG5cdFx0XHRjaHVua09wdGlvbnM6IHsgbWF4Q2h1bmtCeXRlczogMTAyNCwgbmV3R3JvdXBJZDogKCkgPT4gJ2cxJyB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5vayhjb21tYW5kcy5sZW5ndGggPiAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRzLm1hcChjID0+IGMuYWNrSWQpLCBjb21tYW5kcy5tYXAoKF8sIGkpID0+IGkgKyAxKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBhbiBpbmJvdW5kIGdyb3VwIHBheWxvYWQgZnJhbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhc3NlbWJsZXIgPSBuZXcgUmVhc3NlbWJsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUluYm91bmQoXG5cdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgZnJvbTogJ2dyb3VwJywgZ3JvdXA6IEdST1VQLCBkYXRhVHlwZTogJ2pzb24nLCBkYXRhOiB7IGtpbmQ6ICdtZXNzYWdlJywgZGF0YTogeyBvazogMSB9IH0gfSxcblx0XHRcdHsgcmVhc3NlbWJsZXIgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRraW5kOiAncGF5bG9hZCcsXG5cdFx0XHRncm91cDogeyBzY29wZTogJ2NsaWVudCcsIGxhbmU6ICd0by1jbGllbnQnLCB1aWQ6ICd1MScsIGVpZDogJ2UxJywgY2lkOiAnYzEnIH0sXG5cdFx0XHRwYXlsb2FkOiB7IG9rOiAxIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgcGVuZGluZyB3aGlsZSBjaHVua3MgYXJlIHN0aWxsIGFycml2aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlYXNzZW1ibGVyID0gbmV3IFJlYXNzZW1ibGVyKCk7XG5cdFx0Y29uc3QgZmlyc3QgPSBwYXJzZUluYm91bmQoXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRcdFx0ZnJvbTogJ2dyb3VwJyxcblx0XHRcdFx0Z3JvdXA6IEdST1VQLFxuXHRcdFx0XHRkYXRhVHlwZTogJ2pzb24nLFxuXHRcdFx0XHRkYXRhOiB7IGtpbmQ6ICdjaHVuaycsIGdyb3VwX2lkOiAnZzEnLCBzZXE6IDAsIHRvdGFsOiAyLCBieXRlczogYjY0KCdhYScpIH0sXG5cdFx0XHR9LFxuXHRcdFx0eyByZWFzc2VtYmxlciB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmtpbmQsICdwZW5kaW5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbm9uIGdyb3VwLWZhbm91dCBmcmFtZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhc3NlbWJsZXIgPSBuZXcgUmVhc3NlbWJsZXIoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VJbmJvdW5kKHsgdHlwZTogJ2FjaycsIGFja0lkOiAxIH0sIHsgcmVhc3NlbWJsZXIgfSkua2luZCwgJ2lnbm9yZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VJbmJvdW5kKG51bGwsIHsgcmVhc3NlbWJsZXIgfSkua2luZCwgJ2lnbm9yZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VJbmJvdW5kKHsgdHlwZTogJ21lc3NhZ2UnLCBmcm9tOiAnc2VydmVyJyB9LCB7IHJlYXNzZW1ibGVyIH0pLmtpbmQsICdpZ25vcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rocm93cyBGcmFtaW5nRXJyb3Igb24gbWFsZm9ybWVkIGdyb3VwLWZhbm91dCBmcmFtZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhc3NlbWJsZXIgPSBuZXcgUmVhc3NlbWJsZXIoKTtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gcGFyc2VJbmJvdW5kKHsgdHlwZTogJ21lc3NhZ2UnLCBmcm9tOiAnZ3JvdXAnLCBkYXRhVHlwZTogJ2pzb24nLCBkYXRhOiB7IGtpbmQ6ICdtZXNzYWdlJywgZGF0YTogMSB9IH0sIHsgcmVhc3NlbWJsZXIgfSksXG5cdFx0XHRGcmFtaW5nRXJyb3IsXG5cdFx0KTtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gcGFyc2VJbmJvdW5kKHsgdHlwZTogJ21lc3NhZ2UnLCBmcm9tOiAnZ3JvdXAnLCBncm91cDogR1JPVVAsIGRhdGFUeXBlOiAneG1sJywgZGF0YToge30gfSwgeyByZWFzc2VtYmxlciB9KSxcblx0XHRcdEZyYW1pbmdFcnJvcixcblx0XHQpO1xuXHRcdGFzc2VydC50aHJvd3MoXG5cdFx0XHQoKSA9PiBwYXJzZUluYm91bmQoeyB0eXBlOiAnbWVzc2FnZScsIGZyb206ICdncm91cCcsIGdyb3VwOiBHUk9VUCwgZGF0YVR5cGU6ICdqc29uJyB9LCB7IHJlYXNzZW1ibGVyIH0pLFxuXHRcdFx0RnJhbWluZ0Vycm9yLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGNBQWMsMkJBQTJCLGNBQWMsb0JBQW9CO0FBR3BGLFNBQVMsSUFBSSxHQUFtQjtBQUMvQixTQUFPO0FBQUEsSUFBYSxTQUFTLFdBQVcsQ0FBQztBQUFBLElBQUc7QUFBQSxJQUFtQjtBQUFBO0FBQUEsRUFBbUI7QUFDbkY7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
