import assert from "assert";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { NullLogService } from "../../../platform/log/common/log.js";
import { AgentHostChannel, UnavailableAgentHostChannel } from "../../node/agentHostChannel.js";
class FakeUpstream extends Disposable {
  constructor() {
    super(...arguments);
    this._onFrame = this._register(new Emitter());
    this.onFrame = this._onFrame.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this.sentFrames = [];
    this.connectResult = Promise.resolve();
    this.connectCount = 0;
    this.disposed = false;
  }
  async connect() {
    this.connectCount++;
    await this.connectResult;
  }
  send(frame) {
    this.sentFrames.push(frame);
  }
  fireFrame(text) {
    this._onFrame.fire(text);
  }
  fireClose() {
    this._onClose.fire();
  }
  dispose() {
    this.disposed = true;
    this._onClose.fire();
    super.dispose();
  }
}
class FakeIPCServer {
  constructor() {
    this._onDidRemoveConnection = new Emitter();
    this.onDidRemoveConnection = this._onDidRemoveConnection.event;
  }
  fireRemove(ctx) {
    this._onDidRemoveConnection.fire({ ctx });
  }
  dispose() {
    this._onDidRemoveConnection.dispose();
  }
}
suite("AgentHostChannel", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  function createChannel() {
    const ipc = ds.add(new FakeIPCServer());
    const upstreams = /* @__PURE__ */ new Map();
    let nextCtxId = 0;
    const factory = (_endpoint) => {
      const id = `upstream-${nextCtxId++}`;
      const up = ds.add(new FakeUpstream());
      upstreams.set(id, up);
      return up;
    };
    const channel = ds.add(new AgentHostChannel(
      ipc,
      { host: "localhost", port: "12345" },
      new NullLogService(),
      factory
    ));
    return { channel, upstreams, ipc };
  }
  test("routes frames between renderer and upstream per context", async () => {
    const { channel, upstreams } = createChannel();
    const ctxAFrames = [];
    ds.add(channel.listen("a", "frame")((f) => ctxAFrames.push(f)));
    const ctxBFrames = [];
    ds.add(channel.listen("b", "frame")((f) => ctxBFrames.push(f)));
    await channel.call("a", "connect");
    await channel.call("b", "connect");
    const upA = upstreams.get("upstream-0");
    const upB = upstreams.get("upstream-1");
    assert.strictEqual(upA.connectCount, 1);
    assert.strictEqual(upB.connectCount, 1);
    upA.fireFrame("frameA");
    upB.fireFrame("frameB");
    assert.deepStrictEqual(ctxAFrames, ["frameA"]);
    assert.deepStrictEqual(ctxBFrames, ["frameB"]);
    await channel.call("a", "send", "outA");
    assert.deepStrictEqual(upA.sentFrames, ["outA"]);
    assert.deepStrictEqual(upB.sentFrames, []);
  });
  test("closes upstream when renderer client disconnects", async () => {
    const { channel, upstreams, ipc } = createChannel();
    let closed = 0;
    ds.add(channel.listen("a", "close")(() => closed++));
    await channel.call("a", "connect");
    const upA = upstreams.get("upstream-0");
    assert.strictEqual(upA.disposed, false);
    ipc.fireRemove("a");
    assert.strictEqual(upA.disposed, true);
    assert.strictEqual(closed, 1);
  });
  test("resolves a deferred endpoint only when connecting", async () => {
    const ipc = ds.add(new FakeIPCServer());
    let resolveCount = 0;
    const channel = ds.add(new AgentHostChannel(
      ipc,
      async () => {
        resolveCount++;
        return { socketPath: "agent-host.sock" };
      },
      new NullLogService(),
      () => ds.add(new FakeUpstream())
    ));
    channel.listen("renderer", "frame");
    assert.strictEqual(resolveCount, 0);
    await channel.call("renderer", "connect");
    assert.strictEqual(resolveCount, 1);
  });
  test("shares deferred endpoint resolution between renderer contexts", async () => {
    const ipc = ds.add(new FakeIPCServer());
    let resolveCount = 0;
    let resolveEndpoint;
    const endpoint = new Promise((resolve) => resolveEndpoint = resolve);
    const channel = ds.add(new AgentHostChannel(
      ipc,
      () => {
        resolveCount++;
        return endpoint;
      },
      new NullLogService(),
      () => ds.add(new FakeUpstream())
    ));
    const connect = Promise.all([
      channel.call("first", "connect"),
      channel.call("second", "connect")
    ]);
    await Promise.resolve();
    assert.strictEqual(resolveCount, 1);
    resolveEndpoint({ socketPath: "agent-host.sock" });
    await connect;
  });
  test("surfaces deferred endpoint resolution failures and allows retry", async () => {
    const ipc = ds.add(new FakeIPCServer());
    let resolveCount = 0;
    const channel = ds.add(new AgentHostChannel(
      ipc,
      async () => {
        resolveCount++;
        if (resolveCount === 1) {
          throw new Error("agent host did not start");
        }
        return { socketPath: "agent-host.sock" };
      },
      new NullLogService(),
      () => ds.add(new FakeUpstream())
    ));
    await assert.rejects(() => channel.call("renderer", "connect"), /agent host did not start/);
    await assert.doesNotReject(() => channel.call("renderer", "connect"));
    assert.strictEqual(resolveCount, 2);
  });
  test("re-resolves the endpoint for later connections", async () => {
    const ipc = ds.add(new FakeIPCServer());
    let resolveCount = 0;
    const channel = ds.add(new AgentHostChannel(
      ipc,
      async () => {
        resolveCount++;
        return { socketPath: "agent-host.sock" };
      },
      new NullLogService(),
      () => ds.add(new FakeUpstream())
    ));
    await channel.call("first", "connect");
    await channel.call("second", "connect");
    assert.strictEqual(resolveCount, 2);
  });
});
suite("UnavailableAgentHostChannel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rejects connect without reporting an unknown IPC channel", async () => {
    const channel = new UnavailableAgentHostChannel();
    assert.doesNotThrow(() => channel.listen("renderer1", "frame"));
    assert.doesNotThrow(() => channel.listen("renderer1", "close"));
    await assert.rejects(() => channel.call("renderer1", "connect"), /Agent host proxy is not available/);
    await assert.doesNotReject(() => channel.call("renderer1", "send"));
    await assert.doesNotReject(() => channel.call("renderer1", "close"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXHRlc3RcXG5vZGVcXGFnZW50SG9zdENoYW5uZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgQ2xpZW50LCBJUENTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbm5lbCwgSUFnZW50SG9zdFVwc3RyZWFtRW5kcG9pbnQsIElVcHN0cmVhbUNvbm5lY3Rpb24sIFVuYXZhaWxhYmxlQWdlbnRIb3N0Q2hhbm5lbCB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q2hhbm5lbC5qcyc7XG5cbmNsYXNzIEZha2VVcHN0cmVhbSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXBzdHJlYW1Db25uZWN0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25GcmFtZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRnJhbWU6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkZyYW1lLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25DbG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkNsb3NlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IHNlbnRGcmFtZXM6IHN0cmluZ1tdID0gW107XG5cdGNvbm5lY3RSZXN1bHQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0Y29ubmVjdENvdW50ID0gMDtcblx0ZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY29ubmVjdENvdW50Kys7XG5cdFx0YXdhaXQgdGhpcy5jb25uZWN0UmVzdWx0O1xuXHR9XG5cblx0c2VuZChmcmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZW50RnJhbWVzLnB1c2goZnJhbWUpO1xuXHR9XG5cblx0ZmlyZUZyYW1lKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRnJhbWUuZmlyZSh0ZXh0KTtcblx0fVxuXG5cdGZpcmVDbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkNsb3NlLmZpcmUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fb25DbG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEZha2VJUENTZXJ2ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUNvbm5lY3Rpb24gPSBuZXcgRW1pdHRlcjxDbGllbnQ8c3RyaW5nPj4oKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVDb25uZWN0aW9uOiBFdmVudDxDbGllbnQ8c3RyaW5nPj4gPSB0aGlzLl9vbkRpZFJlbW92ZUNvbm5lY3Rpb24uZXZlbnQ7XG5cblx0ZmlyZVJlbW92ZShjdHg6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkUmVtb3ZlQ29ubmVjdGlvbi5maXJlKHsgY3R4IH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJlbW92ZUNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RDaGFubmVsJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwoKTogeyBjaGFubmVsOiBBZ2VudEhvc3RDaGFubmVsPHN0cmluZz47IHVwc3RyZWFtczogTWFwPHN0cmluZywgRmFrZVVwc3RyZWFtPjsgaXBjOiBGYWtlSVBDU2VydmVyIH0ge1xuXHRcdGNvbnN0IGlwYyA9IGRzLmFkZChuZXcgRmFrZUlQQ1NlcnZlcigpKTtcblx0XHRjb25zdCB1cHN0cmVhbXMgPSBuZXcgTWFwPHN0cmluZywgRmFrZVVwc3RyZWFtPigpO1xuXHRcdC8vIGBjdHhgIGlzIGNhcHR1cmVkIGJ5IGlkLWtleWVkIG1hcCBzbyB0ZXN0cyBjYW4gZmlzaCBvdXQgdGhlIHVwc3RyZWFtLlxuXHRcdGxldCBuZXh0Q3R4SWQgPSAwO1xuXHRcdGNvbnN0IGZhY3RvcnkgPSAoX2VuZHBvaW50OiBJQWdlbnRIb3N0VXBzdHJlYW1FbmRwb2ludCk6IElVcHN0cmVhbUNvbm5lY3Rpb24gPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBgdXBzdHJlYW0tJHtuZXh0Q3R4SWQrK31gO1xuXHRcdFx0Y29uc3QgdXAgPSBkcy5hZGQobmV3IEZha2VVcHN0cmVhbSgpKTtcblx0XHRcdHVwc3RyZWFtcy5zZXQoaWQsIHVwKTtcblx0XHRcdHJldHVybiB1cDtcblx0XHR9O1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBkcy5hZGQobmV3IEFnZW50SG9zdENoYW5uZWw8c3RyaW5nPihcblx0XHRcdGlwYyBhcyB1bmtub3duIGFzIElQQ1NlcnZlcjxzdHJpbmc+LFxuXHRcdFx0eyBob3N0OiAnbG9jYWxob3N0JywgcG9ydDogJzEyMzQ1JyB9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRmYWN0b3J5LFxuXHRcdCkpO1xuXHRcdHJldHVybiB7IGNoYW5uZWwsIHVwc3RyZWFtcywgaXBjIH07XG5cdH1cblxuXHR0ZXN0KCdyb3V0ZXMgZnJhbWVzIGJldHdlZW4gcmVuZGVyZXIgYW5kIHVwc3RyZWFtIHBlciBjb250ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2hhbm5lbCwgdXBzdHJlYW1zIH0gPSBjcmVhdGVDaGFubmVsKCk7XG5cblx0XHQvLyBTdWJzY3JpYmUgY3R4QSdzIGZyYW1lIGV2ZW50IChmb3JjZXMgY3JlYXRpb24gb2YgaXRzIHVwc3RyZWFtKS5cblx0XHRjb25zdCBjdHhBRnJhbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRzLmFkZChjaGFubmVsLmxpc3RlbjxzdHJpbmc+KCdhJywgJ2ZyYW1lJykoZiA9PiBjdHhBRnJhbWVzLnB1c2goZikpKTtcblxuXHRcdGNvbnN0IGN0eEJGcmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0ZHMuYWRkKGNoYW5uZWwubGlzdGVuPHN0cmluZz4oJ2InLCAnZnJhbWUnKShmID0+IGN0eEJGcmFtZXMucHVzaChmKSkpO1xuXG5cdFx0YXdhaXQgY2hhbm5lbC5jYWxsKCdhJywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBjaGFubmVsLmNhbGwoJ2InLCAnY29ubmVjdCcpO1xuXG5cdFx0Y29uc3QgdXBBID0gdXBzdHJlYW1zLmdldCgndXBzdHJlYW0tMCcpITtcblx0XHRjb25zdCB1cEIgPSB1cHN0cmVhbXMuZ2V0KCd1cHN0cmVhbS0xJykhO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwQS5jb25uZWN0Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cEIuY29ubmVjdENvdW50LCAxKTtcblxuXHRcdHVwQS5maXJlRnJhbWUoJ2ZyYW1lQScpO1xuXHRcdHVwQi5maXJlRnJhbWUoJ2ZyYW1lQicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3R4QUZyYW1lcywgWydmcmFtZUEnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdHhCRnJhbWVzLCBbJ2ZyYW1lQiddKTtcblxuXHRcdGF3YWl0IGNoYW5uZWwuY2FsbCgnYScsICdzZW5kJywgJ291dEEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwQS5zZW50RnJhbWVzLCBbJ291dEEnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cEIuc2VudEZyYW1lcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZXMgdXBzdHJlYW0gd2hlbiByZW5kZXJlciBjbGllbnQgZGlzY29ubmVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjaGFubmVsLCB1cHN0cmVhbXMsIGlwYyB9ID0gY3JlYXRlQ2hhbm5lbCgpO1xuXG5cdFx0bGV0IGNsb3NlZCA9IDA7XG5cdFx0ZHMuYWRkKGNoYW5uZWwubGlzdGVuPHZvaWQ+KCdhJywgJ2Nsb3NlJykoKCkgPT4gY2xvc2VkKyspKTtcblx0XHRhd2FpdCBjaGFubmVsLmNhbGwoJ2EnLCAnY29ubmVjdCcpO1xuXG5cdFx0Y29uc3QgdXBBID0gdXBzdHJlYW1zLmdldCgndXBzdHJlYW0tMCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBBLmRpc3Bvc2VkLCBmYWxzZSk7XG5cblx0XHRpcGMuZmlyZVJlbW92ZSgnYScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwQS5kaXNwb3NlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlZCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIGEgZGVmZXJyZWQgZW5kcG9pbnQgb25seSB3aGVuIGNvbm5lY3RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXBjID0gZHMuYWRkKG5ldyBGYWtlSVBDU2VydmVyKCkpO1xuXHRcdGxldCByZXNvbHZlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBkcy5hZGQobmV3IEFnZW50SG9zdENoYW5uZWw8c3RyaW5nPihcblx0XHRcdGlwYyBhcyB1bmtub3duIGFzIElQQ1NlcnZlcjxzdHJpbmc+LFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHsgc29ja2V0UGF0aDogJ2FnZW50LWhvc3Quc29jaycgfTtcblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdCgpID0+IGRzLmFkZChuZXcgRmFrZVVwc3RyZWFtKCkpLFxuXHRcdCkpO1xuXG5cdFx0Y2hhbm5lbC5saXN0ZW4oJ3JlbmRlcmVyJywgJ2ZyYW1lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDb3VudCwgMCk7XG5cblx0XHRhd2FpdCBjaGFubmVsLmNhbGwoJ3JlbmRlcmVyJywgJ2Nvbm5lY3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2hhcmVzIGRlZmVycmVkIGVuZHBvaW50IHJlc29sdXRpb24gYmV0d2VlbiByZW5kZXJlciBjb250ZXh0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpcGMgPSBkcy5hZGQobmV3IEZha2VJUENTZXJ2ZXIoKSk7XG5cdFx0bGV0IHJlc29sdmVDb3VudCA9IDA7XG5cdFx0bGV0IHJlc29sdmVFbmRwb2ludCE6IChlbmRwb2ludDogSUFnZW50SG9zdFVwc3RyZWFtRW5kcG9pbnQpID0+IHZvaWQ7XG5cdFx0Y29uc3QgZW5kcG9pbnQgPSBuZXcgUHJvbWlzZTxJQWdlbnRIb3N0VXBzdHJlYW1FbmRwb2ludD4ocmVzb2x2ZSA9PiByZXNvbHZlRW5kcG9pbnQgPSByZXNvbHZlKTtcblx0XHRjb25zdCBjaGFubmVsID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RDaGFubmVsPHN0cmluZz4oXG5cdFx0XHRpcGMgYXMgdW5rbm93biBhcyBJUENTZXJ2ZXI8c3RyaW5nPixcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZUNvdW50Kys7XG5cdFx0XHRcdHJldHVybiBlbmRwb2ludDtcblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdCgpID0+IGRzLmFkZChuZXcgRmFrZVVwc3RyZWFtKCkpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgY29ubmVjdCA9IFByb21pc2UuYWxsKFtcblx0XHRcdGNoYW5uZWwuY2FsbCgnZmlyc3QnLCAnY29ubmVjdCcpLFxuXHRcdFx0Y2hhbm5lbC5jYWxsKCdzZWNvbmQnLCAnY29ubmVjdCcpLFxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ291bnQsIDEpO1xuXG5cdFx0cmVzb2x2ZUVuZHBvaW50KHsgc29ja2V0UGF0aDogJ2FnZW50LWhvc3Quc29jaycgfSk7XG5cdFx0YXdhaXQgY29ubmVjdDtcblx0fSk7XG5cblx0dGVzdCgnc3VyZmFjZXMgZGVmZXJyZWQgZW5kcG9pbnQgcmVzb2x1dGlvbiBmYWlsdXJlcyBhbmQgYWxsb3dzIHJldHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlwYyA9IGRzLmFkZChuZXcgRmFrZUlQQ1NlcnZlcigpKTtcblx0XHRsZXQgcmVzb2x2ZUNvdW50ID0gMDtcblx0XHRjb25zdCBjaGFubmVsID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RDaGFubmVsPHN0cmluZz4oXG5cdFx0XHRpcGMgYXMgdW5rbm93biBhcyBJUENTZXJ2ZXI8c3RyaW5nPixcblx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZUNvdW50Kys7XG5cdFx0XHRcdGlmIChyZXNvbHZlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2FnZW50IGhvc3QgZGlkIG5vdCBzdGFydCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHNvY2tldFBhdGg6ICdhZ2VudC1ob3N0LnNvY2snIH07XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHQoKSA9PiBkcy5hZGQobmV3IEZha2VVcHN0cmVhbSgpKSxcblx0XHQpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGNoYW5uZWwuY2FsbCgncmVuZGVyZXInLCAnY29ubmVjdCcpLCAvYWdlbnQgaG9zdCBkaWQgbm90IHN0YXJ0Lyk7XG5cdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3QoKCkgPT4gY2hhbm5lbC5jYWxsKCdyZW5kZXJlcicsICdjb25uZWN0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZS1yZXNvbHZlcyB0aGUgZW5kcG9pbnQgZm9yIGxhdGVyIGNvbm5lY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlwYyA9IGRzLmFkZChuZXcgRmFrZUlQQ1NlcnZlcigpKTtcblx0XHRsZXQgcmVzb2x2ZUNvdW50ID0gMDtcblx0XHRjb25zdCBjaGFubmVsID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RDaGFubmVsPHN0cmluZz4oXG5cdFx0XHRpcGMgYXMgdW5rbm93biBhcyBJUENTZXJ2ZXI8c3RyaW5nPixcblx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZUNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB7IHNvY2tldFBhdGg6ICdhZ2VudC1ob3N0LnNvY2snIH07XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHQoKSA9PiBkcy5hZGQobmV3IEZha2VVcHN0cmVhbSgpKSxcblx0XHQpKTtcblxuXHRcdGF3YWl0IGNoYW5uZWwuY2FsbCgnZmlyc3QnLCAnY29ubmVjdCcpO1xuXHRcdGF3YWl0IGNoYW5uZWwuY2FsbCgnc2Vjb25kJywgJ2Nvbm5lY3QnKTtcblxuXHRcdC8vIFJlc29sdXRpb24gaXMgYGVuc3VyZVN0YXJ0ZWQoKWAgaW4gdGhlIGxhenkgc2VydmVyIHBhdGgsIHNvIGEgbGF0ZXJcblx0XHQvLyBjb25uZWN0aW9uIG11c3QgYmUgYWJsZSB0byByZXN0YXJ0IGEgaG9zdCB0aGF0IGhhcyBzaW5jZSBkaWVkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ291bnQsIDIpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnVW5hdmFpbGFibGVBZ2VudEhvc3RDaGFubmVsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZWplY3RzIGNvbm5lY3Qgd2l0aG91dCByZXBvcnRpbmcgYW4gdW5rbm93biBJUEMgY2hhbm5lbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGFubmVsID0gbmV3IFVuYXZhaWxhYmxlQWdlbnRIb3N0Q2hhbm5lbDxzdHJpbmc+KCk7XG5cblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IGNoYW5uZWwubGlzdGVuKCdyZW5kZXJlcjEnLCAnZnJhbWUnKSk7XG5cdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBjaGFubmVsLmxpc3RlbigncmVuZGVyZXIxJywgJ2Nsb3NlJykpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGNoYW5uZWwuY2FsbCgncmVuZGVyZXIxJywgJ2Nvbm5lY3QnKSwgL0FnZW50IGhvc3QgcHJveHkgaXMgbm90IGF2YWlsYWJsZS8pO1xuXHRcdGF3YWl0IGFzc2VydC5kb2VzTm90UmVqZWN0KCgpID0+IGNoYW5uZWwuY2FsbCgncmVuZGVyZXIxJywgJ3NlbmQnKSk7XG5cdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3QoKCkgPT4gY2hhbm5lbC5jYWxsKCdyZW5kZXJlcjEnLCAnY2xvc2UnKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFtRSxtQ0FBbUM7QUFFL0csTUFBTSxxQkFBcUIsV0FBMEM7QUFBQSxFQUFyRTtBQUFBO0FBQ0MsU0FBaUIsV0FBVyxLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ2hFLFNBQVMsVUFBeUIsS0FBSyxTQUFTO0FBRWhELFNBQWlCLFdBQVcsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzlELFNBQVMsVUFBdUIsS0FBSyxTQUFTO0FBRTlDLFNBQVMsYUFBdUIsQ0FBQztBQUNqQyx5QkFBK0IsUUFBUSxRQUFRO0FBQy9DLHdCQUFlO0FBQ2Ysb0JBQVc7QUFBQTtBQUFBLEVBRVgsTUFBTSxVQUF5QjtBQUM5QixTQUFLO0FBQ0wsVUFBTSxLQUFLO0FBQUEsRUFDWjtBQUFBLEVBRUEsS0FBSyxPQUFxQjtBQUN6QixTQUFLLFdBQVcsS0FBSyxLQUFLO0FBQUEsRUFDM0I7QUFBQSxFQUVBLFVBQVUsTUFBb0I7QUFDN0IsU0FBSyxTQUFTLEtBQUssSUFBSTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxZQUFrQjtBQUNqQixTQUFLLFNBQVMsS0FBSztBQUFBLEVBQ3BCO0FB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Q3RDLFFBQUksZUFBZTtBQUNuQixVQUFNLFVBQVUsR0FBRyxJQUFJLElBQUk7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsWUFBWTtBQUNYO0FBQ0EsWUFBSSxpQkFBaUIsR0FBRztBQUN2QixnQkFBTSxJQUFJLE1BQU0sMEJBQTBCO0FBQUEsUUFDM0M7QUFDQSxlQUFPLEVBQUUsWUFBWSxrQkFBa0I7QUFBQSxNQUN4QztBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsTUFDbkIsTUFBTSxHQUFHLElBQUksSUFBSSxhQUFhLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBRUQsVUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEtBQUssWUFBWSxTQUFTLEdBQUcsMEJBQTBCO0FBQzFGLFVBQU0sT0FBTyxjQUFjLE1BQU0sUUFBUSxLQUFLLFlBQVksU0FBUyxDQUFDO0FBQ3BFLFdBQU8sWUFBWSxjQUFjLENBQUM7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyxrREFBa0QsWUFBWTtBQUNsRSxVQUFNLE1BQU0sR0FBRyxJQUFJLElBQUksY0FBYyxDQUFDO0FBQ3RDLFFBQUksZUFBZTtBQUNuQixVQUFNLFVBQVUsR0FBRyxJQUFJLElBQUk7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsWUFBWTtBQUNYO0FBQ0EsZUFBTyxFQUFFLFlBQVksa0JBQWtCO0FBQUEsTUFDeEM7QUFBQSxNQUNBLElBQUksZUFBZTtBQUFBLE1BQ25CLE1BQU0sR0FBRyxJQUFJLElBQUksYUFBYSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUVELFVBQU0sUUFBUSxLQUFLLFNBQVMsU0FBUztBQUNyQyxVQUFNLFFBQVEsS0FBSyxVQUFVLFNBQVM7QUFJdEMsV0FBTyxZQUFZLGNBQWMsQ0FBQztBQUFBLEVBQ25DLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSwrQkFBK0IsTUFBTTtBQUMxQywwQ0FBd0M7QUFFeEMsT0FBSyw0REFBNEQsWUFBWTtBQUM1RSxVQUFNLFVBQVUsSUFBSSw0QkFBb0M7QUFFeEQsV0FBTyxhQUFhLE1BQU0sUUFBUSxPQUFPLGFBQWEsT0FBTyxDQUFDO0FBQzlELFdBQU8sYUFBYSxNQUFNLFFBQVEsT0FBTyxhQUFhLE9BQU8sQ0FBQztBQUM5RCxVQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsS0FBSyxhQUFhLFNBQVMsR0FBRyxtQ0FBbUM7QUFDcEcsVUFBTSxPQUFPLGNBQWMsTUFBTSxRQUFRLEtBQUssYUFBYSxNQUFNLENBQUM7QUFDbEUsVUFBTSxPQUFPLGNBQWMsTUFBTSxRQUFRLEtBQUssYUFBYSxPQUFPLENBQUM7QUFBQSxFQUNwRSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
