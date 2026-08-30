import assert from "assert";
import { timeout } from "../../../../common/async.js";
import { VSBuffer } from "../../../../common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../common/cancellation.js";
import { canceled } from "../../../../common/errors.js";
import { Emitter, Event } from "../../../../common/event.js";
import { DisposableStore } from "../../../../common/lifecycle.js";
import { isEqual } from "../../../../common/resources.js";
import { URI } from "../../../../common/uri.js";
import { BufferReader, BufferWriter, ChannelClient, ChannelServer, deserialize, getDelayedChannel, IPCClient, IPCServer, ProxyChannel, serialize } from "../../common/ipc.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../test/common/utils.js";
class QueueProtocol {
  constructor() {
    this.buffering = true;
    this.buffers = [];
    this._onMessage = new Emitter({
      onDidAddFirstListener: () => {
        for (const buffer of this.buffers) {
          this._onMessage.fire(buffer);
        }
        this.buffers = [];
        this.buffering = false;
      },
      onDidRemoveLastListener: () => {
        this.buffering = true;
      }
    });
    this.onMessage = this._onMessage.event;
  }
  send(buffer) {
    this.other.receive(buffer);
  }
  receive(buffer) {
    if (this.buffering) {
      this.buffers.push(buffer);
    } else {
      this._onMessage.fire(buffer);
    }
  }
}
function createProtocolPair() {
  const one = new QueueProtocol();
  const other = new QueueProtocol();
  one.other = other;
  other.other = one;
  return [one, other];
}
class TestIPCClient extends IPCClient {
  constructor(protocol, id) {
    super(protocol, id);
    this._onDidDisconnect = new Emitter();
    this.onDidDisconnect = this._onDidDisconnect.event;
  }
  dispose() {
    this._onDidDisconnect.fire();
    super.dispose();
  }
}
class TestIPCServer extends IPCServer {
  constructor() {
    const onDidClientConnect = new Emitter();
    super(onDidClientConnect.event);
    this.onDidClientConnect = onDidClientConnect;
  }
  createConnection(id) {
    const [pc, ps] = createProtocolPair();
    const client = new TestIPCClient(pc, id);
    this.onDidClientConnect.fire({
      protocol: ps,
      onDidClientDisconnect: client.onDidDisconnect
    });
    return client;
  }
}
const TestChannelId = "testchannel";
class TestService {
  constructor() {
    this.disposables = new DisposableStore();
    this._onPong = new Emitter();
    this.onPong = this._onPong.event;
  }
  get hasPongListeners() {
    return this._onPong.hasListeners();
  }
  marco() {
    return Promise.resolve("polo");
  }
  error(message) {
    return Promise.reject(new Error(message));
  }
  neverComplete() {
    return new Promise((_) => {
    });
  }
  neverCompleteCT(cancellationToken) {
    if (cancellationToken.isCancellationRequested) {
      return Promise.reject(canceled());
    }
    return new Promise((_, e) => this.disposables.add(cancellationToken.onCancellationRequested(() => e(canceled()))));
  }
  buffersLength(buffers) {
    return Promise.resolve(buffers.reduce((r, b) => r + b.buffer.length, 0));
  }
  ping(msg) {
    this._onPong.fire(msg);
  }
  marshall(uri) {
    return Promise.resolve(uri);
  }
  context(context) {
    return Promise.resolve(context);
  }
  dispose() {
    this.disposables.dispose();
  }
}
class TestChannel {
  constructor(service) {
    this.service = service;
  }
  call(_, command, arg, cancellationToken) {
    switch (command) {
      case "marco":
        return this.service.marco();
      case "error":
        return this.service.error(arg);
      case "neverComplete":
        return this.service.neverComplete();
      case "neverCompleteCT":
        return this.service.neverCompleteCT(cancellationToken);
      case "buffersLength":
        return this.service.buffersLength(arg);
      default:
        return Promise.reject(new Error("not implemented"));
    }
  }
  listen(_, event, arg) {
    switch (event) {
      case "onPong":
        return this.service.onPong;
      default:
        throw new Error("not implemented");
    }
  }
}
class TestChannelClient {
  constructor(channel) {
    this.channel = channel;
  }
  get onPong() {
    return this.channel.listen("onPong");
  }
  marco() {
    return this.channel.call("marco");
  }
  error(message) {
    return this.channel.call("error", message);
  }
  neverComplete() {
    return this.channel.call("neverComplete");
  }
  neverCompleteCT(cancellationToken) {
    return this.channel.call("neverCompleteCT", void 0, cancellationToken);
  }
  buffersLength(buffers) {
    return this.channel.call("buffersLength", buffers);
  }
  marshall(uri) {
    return this.channel.call("marshall", uri);
  }
  context() {
    return this.channel.call("context");
  }
}
suite("Base IPC", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("delayed channel handles rejected listeners", async () => {
    const error = new Error("Channel unavailable");
    const channel = getDelayedChannel(Promise.reject(error));
    store.add(channel.listen("event")(() => {
    }));
    await assert.rejects(channel.call("command"), error);
    await timeout(0);
  });
  test("createProtocolPair", async function() {
    const [clientProtocol, serverProtocol] = createProtocolPair();
    const b1 = VSBuffer.alloc(0);
    clientProtocol.send(b1);
    const b3 = VSBuffer.alloc(0);
    serverProtocol.send(b3);
    const b2 = await Event.toPromise(serverProtocol.onMessage);
    const b4 = await Event.toPromise(clientProtocol.onMessage);
    assert.strictEqual(b1, b2);
    assert.strictEqual(b3, b4);
  });
  suite("one to one", function() {
    let server;
    let client;
    let service;
    let ipcService;
    setup(function() {
      service = store.add(new TestService());
      const testServer = store.add(new TestIPCServer());
      server = testServer;
      server.registerChannel(TestChannelId, new TestChannel(service));
      client = store.add(testServer.createConnection("client1"));
      ipcService = new TestChannelClient(client.getChannel(TestChannelId));
    });
    test("call success", async function() {
      const r = await ipcService.marco();
      return assert.strictEqual(r, "polo");
    });
    test("call error", async function() {
      try {
        await ipcService.error("nice error");
        return assert.fail("should not reach here");
      } catch (err) {
        return assert.strictEqual(err.message, "nice error");
      }
    });
    test("cancel call with cancelled cancellation token", async function() {
      try {
        await ipcService.neverCompleteCT(CancellationToken.Cancelled);
        return assert.fail("should not reach here");
      } catch (err) {
        return assert(err.message === "Canceled");
      }
    });
    test("cancel call with cancellation token (sync)", function() {
      const cts = new CancellationTokenSource();
      const promise = ipcService.neverCompleteCT(cts.token).then(
        (_) => assert.fail("should not reach here"),
        (err) => assert(err.message === "Canceled")
      );
      cts.cancel();
      return promise;
    });
    test("cancel call with cancellation token (async)", function() {
      const cts = new CancellationTokenSource();
      const promise = ipcService.neverCompleteCT(cts.token).then(
        (_) => assert.fail("should not reach here"),
        (err) => assert(err.message === "Canceled")
      );
      setTimeout(() => cts.cancel());
      return promise;
    });
    test("listen to events", async function() {
      const messages = [];
      store.add(ipcService.onPong((msg) => messages.push(msg)));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
    });
    test("unbuffered events subscribe lazily", function() {
      const service2 = store.add(new TestService());
      const channelDisposables = store.add(new DisposableStore());
      const channel = ProxyChannel.fromService(service2, channelDisposables, { unbufferedEvents: ["onPong"] });
      const onPong = channel.listen("context", "onPong");
      const messages = [];
      service2.ping("before");
      assert.strictEqual(service2.hasPongListeners, false);
      const listener = channelDisposables.add(onPong((message) => messages.push(message)));
      assert.strictEqual(service2.hasPongListeners, true);
      service2.ping("after");
      channelDisposables.delete(listener);
      assert.deepStrictEqual({ messages, hasPongListeners: service2.hasPongListeners }, {
        messages: ["after"],
        hasPongListeners: false
      });
    });
    test("listen to events (resubscribe)", async function() {
      const onPong = ipcService.onPong;
      const messages = [];
      const disposable1 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      disposable1.dispose();
      const disposable2 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
      disposable2.dispose();
    });
    test("buffers in arrays", async function() {
      const r = await ipcService.buffersLength([VSBuffer.alloc(2), VSBuffer.alloc(3)]);
      return assert.strictEqual(r, 5);
    });
    test("round trips numbers", () => {
      const input = [
        0,
        1,
        -1,
        12345,
        -12345,
        42.6,
        123412341234
      ];
      const writer = new BufferWriter();
      serialize(writer, input);
      assert.deepStrictEqual(deserialize(new BufferReader(writer.buffer)), input);
    });
    test("BufferWriter releases its buffers on dispose", () => {
      const writer = new BufferWriter();
      serialize(writer, ["a", "b", "c"]);
      assert.ok(writer.buffer.byteLength > 0);
      writer.dispose();
      assert.strictEqual(writer.buffer.byteLength, 0);
    });
    test("request rejects (and cleans up) when serialization throws on the deferred path", async function() {
      const clientIncoming = store.add(new Emitter());
      const clientProtocol = {
        onMessage: clientIncoming.event,
        send: () => {
        }
      };
      const serverOutbox = [];
      const serverProtocol = {
        onMessage: Event.None,
        send: (buffer) => serverOutbox.push(buffer)
      };
      const channelClient = store.add(new ChannelClient(clientProtocol));
      store.add(new ChannelServer(serverProtocol, "ctx"));
      const circular = {};
      circular.self = circular;
      const resultPromise = channelClient.getChannel("testchannel").call("cmd", circular);
      assert.strictEqual(serverOutbox.length, 1);
      clientIncoming.fire(serverOutbox[0]);
      await assert.rejects(resultPromise);
    });
  });
  suite("one to one (proxy)", function() {
    let server;
    let client;
    let service;
    let ipcService;
    const disposables = new DisposableStore();
    setup(function() {
      service = store.add(new TestService());
      const testServer = disposables.add(new TestIPCServer());
      server = testServer;
      server.registerChannel(TestChannelId, ProxyChannel.fromService(service, disposables));
      client = disposables.add(testServer.createConnection("client1"));
      ipcService = ProxyChannel.toService(client.getChannel(TestChannelId));
    });
    teardown(function() {
      disposables.clear();
    });
    test("call success", async function() {
      const r = await ipcService.marco();
      return assert.strictEqual(r, "polo");
    });
    test("call error", async function() {
      try {
        await ipcService.error("nice error");
        return assert.fail("should not reach here");
      } catch (err) {
        return assert.strictEqual(err.message, "nice error");
      }
    });
    test("listen to events", async function() {
      const messages = [];
      disposables.add(ipcService.onPong((msg) => messages.push(msg)));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
    });
    test("listen to events (resubscribe)", async function() {
      const onPong = ipcService.onPong;
      const messages = [];
      const disposable1 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      disposable1.dispose();
      const disposable2 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
      disposable2.dispose();
    });
    test("marshalling uri", async function() {
      const uri = URI.file("foobar");
      const r = await ipcService.marshall(uri);
      assert.ok(r instanceof URI);
      return assert.ok(isEqual(r, uri));
    });
    test("buffers in arrays", async function() {
      const r = await ipcService.buffersLength([VSBuffer.alloc(2), VSBuffer.alloc(3)]);
      return assert.strictEqual(r, 5);
    });
    test("proxy is not a thenable", async function() {
      assert.strictEqual(ipcService.then, void 0);
      const awaited = await (async () => ipcService)();
      assert.strictEqual(await awaited.marco(), "polo");
    });
  });
  suite("one to one (proxy, extra context)", function() {
    let server;
    let client;
    let service;
    let ipcService;
    const disposables = new DisposableStore();
    setup(function() {
      service = store.add(new TestService());
      const testServer = disposables.add(new TestIPCServer());
      server = testServer;
      server.registerChannel(TestChannelId, ProxyChannel.fromService(service, disposables));
      client = disposables.add(testServer.createConnection("client1"));
      ipcService = ProxyChannel.toService(client.getChannel(TestChannelId), { context: "Super Context" });
    });
    teardown(function() {
      disposables.clear();
    });
    test("call extra context", async function() {
      const r = await ipcService.context();
      return assert.strictEqual(r, "Super Context");
    });
  });
  suite("one to many", function() {
    test("all clients get pinged", async function() {
      const service = store.add(new TestService());
      const channel = new TestChannel(service);
      const server = store.add(new TestIPCServer());
      server.registerChannel("channel", channel);
      let client1GotPinged = false;
      const client1 = store.add(server.createConnection("client1"));
      const ipcService1 = new TestChannelClient(client1.getChannel("channel"));
      store.add(ipcService1.onPong(() => client1GotPinged = true));
      let client2GotPinged = false;
      const client2 = store.add(server.createConnection("client2"));
      const ipcService2 = new TestChannelClient(client2.getChannel("channel"));
      store.add(ipcService2.onPong(() => client2GotPinged = true));
      await timeout(1);
      service.ping("hello");
      await timeout(1);
      assert(client1GotPinged, "client 1 got pinged");
      assert(client2GotPinged, "client 2 got pinged");
    });
    test("server gets pings from all clients (broadcast channel)", async function() {
      const server = store.add(new TestIPCServer());
      const client1 = server.createConnection("client1");
      const clientService1 = store.add(new TestService());
      const clientChannel1 = new TestChannel(clientService1);
      client1.registerChannel("channel", clientChannel1);
      const pings = [];
      const channel = server.getChannel("channel", () => true);
      const service = new TestChannelClient(channel);
      store.add(service.onPong((msg) => pings.push(msg)));
      await timeout(1);
      clientService1.ping("hello 1");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1"]);
      const client2 = server.createConnection("client2");
      const clientService2 = store.add(new TestService());
      const clientChannel2 = new TestChannel(clientService2);
      client2.registerChannel("channel", clientChannel2);
      await timeout(1);
      clientService2.ping("hello 2");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1", "hello 2"]);
      client1.dispose();
      clientService1.ping("hello 1");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1", "hello 2"]);
      await timeout(1);
      clientService2.ping("hello again 2");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1", "hello 2", "hello again 2"]);
      client2.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcaXBjXFx0ZXN0XFxjb21tb25cXGlwYy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjYW5jZWxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEJ1ZmZlclJlYWRlciwgQnVmZmVyV3JpdGVyLCBDaGFubmVsQ2xpZW50LCBDaGFubmVsU2VydmVyLCBDbGllbnRDb25uZWN0aW9uRXZlbnQsIGRlc2VyaWFsaXplLCBnZXREZWxheWVkQ2hhbm5lbCwgSUNoYW5uZWwsIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBJUENDbGllbnQsIElQQ1NlcnZlciwgSVNlcnZlckNoYW5uZWwsIFByb3h5Q2hhbm5lbCwgc2VyaWFsaXplIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNsYXNzIFF1ZXVlUHJvdG9jb2wgaW1wbGVtZW50cyBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB7XG5cblx0cHJpdmF0ZSBidWZmZXJpbmcgPSB0cnVlO1xuXHRwcml2YXRlIGJ1ZmZlcnM6IFZTQnVmZmVyW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSBuZXcgRW1pdHRlcjxWU0J1ZmZlcj4oe1xuXHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBidWZmZXIgb2YgdGhpcy5idWZmZXJzKSB7XG5cdFx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKGJ1ZmZlcik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYnVmZmVycyA9IFtdO1xuXHRcdFx0dGhpcy5idWZmZXJpbmcgPSBmYWxzZTtcblx0XHR9LFxuXHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHR0aGlzLmJ1ZmZlcmluZyA9IHRydWU7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWFkb25seSBvbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cdG90aGVyITogUXVldWVQcm90b2NvbDtcblxuXHRzZW5kKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLm90aGVyLnJlY2VpdmUoYnVmZmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZWNlaXZlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5idWZmZXJpbmcpIHtcblx0XHRcdHRoaXMuYnVmZmVycy5wdXNoKGJ1ZmZlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKGJ1ZmZlcik7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVByb3RvY29sUGFpcigpOiBbSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wsIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sXSB7XG5cdGNvbnN0IG9uZSA9IG5ldyBRdWV1ZVByb3RvY29sKCk7XG5cdGNvbnN0IG90aGVyID0gbmV3IFF1ZXVlUHJvdG9jb2woKTtcblx0b25lLm90aGVyID0gb3RoZXI7XG5cdG90aGVyLm90aGVyID0gb25lO1xuXG5cdHJldHVybiBbb25lLCBvdGhlcl07XG59XG5cbmNsYXNzIFRlc3RJUENDbGllbnQgZXh0ZW5kcyBJUENDbGllbnQ8c3RyaW5nPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNjb25uZWN0ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNjb25uZWN0ID0gdGhpcy5fb25EaWREaXNjb25uZWN0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCwgaWQ6IHN0cmluZykge1xuXHRcdHN1cGVyKHByb3RvY29sLCBpZCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkRGlzY29ubmVjdC5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RJUENTZXJ2ZXIgZXh0ZW5kcyBJUENTZXJ2ZXI8c3RyaW5nPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENsaWVudENvbm5lY3Q6IEVtaXR0ZXI8Q2xpZW50Q29ubmVjdGlvbkV2ZW50PjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBvbkRpZENsaWVudENvbm5lY3QgPSBuZXcgRW1pdHRlcjxDbGllbnRDb25uZWN0aW9uRXZlbnQ+KCk7XG5cdFx0c3VwZXIob25EaWRDbGllbnRDb25uZWN0LmV2ZW50KTtcblx0XHR0aGlzLm9uRGlkQ2xpZW50Q29ubmVjdCA9IG9uRGlkQ2xpZW50Q29ubmVjdDtcblx0fVxuXG5cdGNyZWF0ZUNvbm5lY3Rpb24oaWQ6IHN0cmluZyk6IElQQ0NsaWVudDxzdHJpbmc+IHtcblx0XHRjb25zdCBbcGMsIHBzXSA9IGNyZWF0ZVByb3RvY29sUGFpcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0SVBDQ2xpZW50KHBjLCBpZCk7XG5cblx0XHR0aGlzLm9uRGlkQ2xpZW50Q29ubmVjdC5maXJlKHtcblx0XHRcdHByb3RvY29sOiBwcyxcblx0XHRcdG9uRGlkQ2xpZW50RGlzY29ubmVjdDogY2xpZW50Lm9uRGlkRGlzY29ubmVjdFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNsaWVudDtcblx0fVxufVxuXG5jb25zdCBUZXN0Q2hhbm5lbElkID0gJ3Rlc3RjaGFubmVsJztcblxuaW50ZXJmYWNlIElUZXN0U2VydmljZSB7XG5cdG1hcmNvKCk6IFByb21pc2U8c3RyaW5nPjtcblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0bmV2ZXJDb21wbGV0ZSgpOiBQcm9taXNlPHZvaWQ+O1xuXHRuZXZlckNvbXBsZXRlQ1QoY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPjtcblx0YnVmZmVyc0xlbmd0aChidWZmZXJzOiBWU0J1ZmZlcltdKTogUHJvbWlzZTxudW1iZXI+O1xuXHRtYXJzaGFsbCh1cmk6IFVSSSk6IFByb21pc2U8VVJJPjtcblx0Y29udGV4dCgpOiBQcm9taXNlPHVua25vd24+O1xuXG5cdHJlYWRvbmx5IG9uUG9uZzogRXZlbnQ8c3RyaW5nPjtcbn1cblxuY2xhc3MgVGVzdFNlcnZpY2UgaW1wbGVtZW50cyBJVGVzdFNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qb25nID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvblBvbmcgPSB0aGlzLl9vblBvbmcuZXZlbnQ7XG5cdGdldCBoYXNQb25nTGlzdGVuZXJzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fb25Qb25nLmhhc0xpc3RlbmVycygpOyB9XG5cblx0bWFyY28oKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCdwb2xvJyk7XG5cdH1cblxuXHRlcnJvcihtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG1lc3NhZ2UpKTtcblx0fVxuXG5cdG5ldmVyQ29tcGxldGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKF8gPT4geyB9KTtcblx0fVxuXG5cdG5ldmVyQ29tcGxldGVDVChjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChjYW5jZWxlZCgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKF8sIGUpID0+IHRoaXMuZGlzcG9zYWJsZXMuYWRkKGNhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGUoY2FuY2VsZWQoKSkpKSk7XG5cdH1cblxuXHRidWZmZXJzTGVuZ3RoKGJ1ZmZlcnM6IFZTQnVmZmVyW10pOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoYnVmZmVycy5yZWR1Y2UoKHIsIGIpID0+IHIgKyBiLmJ1ZmZlci5sZW5ndGgsIDApKTtcblx0fVxuXG5cdHBpbmcobXNnOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vblBvbmcuZmlyZShtc2cpO1xuXHR9XG5cblx0bWFyc2hhbGwodXJpOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodXJpKTtcblx0fVxuXG5cdGNvbnRleHQoY29udGV4dD86IHVua25vd24pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbnRleHQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q2hhbm5lbCBpbXBsZW1lbnRzIElTZXJ2ZXJDaGFubmVsIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNlcnZpY2U6IElUZXN0U2VydmljZSkgeyB9XG5cblx0Y2FsbChfOiB1bmtub3duLCBjb21tYW5kOiBzdHJpbmcsIGFyZzogYW55LCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGFueT4ge1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnbWFyY28nOiByZXR1cm4gdGhpcy5zZXJ2aWNlLm1hcmNvKCk7XG5cdFx0XHRjYXNlICdlcnJvcic6IHJldHVybiB0aGlzLnNlcnZpY2UuZXJyb3IoYXJnKTtcblx0XHRcdGNhc2UgJ25ldmVyQ29tcGxldGUnOiByZXR1cm4gdGhpcy5zZXJ2aWNlLm5ldmVyQ29tcGxldGUoKTtcblx0XHRcdGNhc2UgJ25ldmVyQ29tcGxldGVDVCc6IHJldHVybiB0aGlzLnNlcnZpY2UubmV2ZXJDb21wbGV0ZUNUKGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdGNhc2UgJ2J1ZmZlcnNMZW5ndGgnOiByZXR1cm4gdGhpcy5zZXJ2aWNlLmJ1ZmZlcnNMZW5ndGgoYXJnKTtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpKTtcblx0XHR9XG5cdH1cblxuXHRsaXN0ZW4oXzogdW5rbm93biwgZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8YW55PiB7XG5cdFx0c3dpdGNoIChldmVudCkge1xuXHRcdFx0Y2FzZSAnb25Qb25nJzogcmV0dXJuIHRoaXMuc2VydmljZS5vblBvbmc7XG5cdFx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUZXN0Q2hhbm5lbENsaWVudCBpbXBsZW1lbnRzIElUZXN0U2VydmljZSB7XG5cblx0Z2V0IG9uUG9uZygpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmxpc3Rlbignb25Qb25nJyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGNoYW5uZWw6IElDaGFubmVsKSB7IH1cblxuXHRtYXJjbygpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbCgnbWFyY28nKTtcblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbCgnZXJyb3InLCBtZXNzYWdlKTtcblx0fVxuXG5cdG5ldmVyQ29tcGxldGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCduZXZlckNvbXBsZXRlJyk7XG5cdH1cblxuXHRuZXZlckNvbXBsZXRlQ1QoY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCduZXZlckNvbXBsZXRlQ1QnLCB1bmRlZmluZWQsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0fVxuXG5cdGJ1ZmZlcnNMZW5ndGgoYnVmZmVyczogVlNCdWZmZXJbXSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCdidWZmZXJzTGVuZ3RoJywgYnVmZmVycyk7XG5cdH1cblxuXHRtYXJzaGFsbCh1cmk6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCdtYXJzaGFsbCcsIHVyaSk7XG5cdH1cblxuXHRjb250ZXh0KCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbCgnY29udGV4dCcpO1xuXHR9XG59XG5cbnN1aXRlKCdCYXNlIElQQycsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RlbGF5ZWQgY2hhbm5lbCBoYW5kbGVzIHJlamVjdGVkIGxpc3RlbmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcignQ2hhbm5lbCB1bmF2YWlsYWJsZScpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBnZXREZWxheWVkQ2hhbm5lbDxJQ2hhbm5lbD4oUHJvbWlzZS5yZWplY3QoZXJyb3IpKTtcblx0XHRzdG9yZS5hZGQoY2hhbm5lbC5saXN0ZW4oJ2V2ZW50JykoKCkgPT4geyB9KSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjaGFubmVsLmNhbGwoJ2NvbW1hbmQnKSwgZXJyb3IpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVByb3RvY29sUGFpcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbY2xpZW50UHJvdG9jb2wsIHNlcnZlclByb3RvY29sXSA9IGNyZWF0ZVByb3RvY29sUGFpcigpO1xuXG5cdFx0Y29uc3QgYjEgPSBWU0J1ZmZlci5hbGxvYygwKTtcblx0XHRjbGllbnRQcm90b2NvbC5zZW5kKGIxKTtcblxuXHRcdGNvbnN0IGIzID0gVlNCdWZmZXIuYWxsb2MoMCk7XG5cdFx0c2VydmVyUHJvdG9jb2wuc2VuZChiMyk7XG5cblx0XHRjb25zdCBiMiA9IGF3YWl0IEV2ZW50LnRvUHJvbWlzZShzZXJ2ZXJQcm90b2NvbC5vbk1lc3NhZ2UpO1xuXHRcdGNvbnN0IGI0ID0gYXdhaXQgRXZlbnQudG9Qcm9taXNlKGNsaWVudFByb3RvY29sLm9uTWVzc2FnZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYjEsIGIyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYjMsIGI0KTtcblx0fSk7XG5cblx0c3VpdGUoJ29uZSB0byBvbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHNlcnZlcjogSVBDU2VydmVyO1xuXHRcdGxldCBjbGllbnQ6IElQQ0NsaWVudDtcblx0XHRsZXQgc2VydmljZTogVGVzdFNlcnZpY2U7XG5cdFx0bGV0IGlwY1NlcnZpY2U6IElUZXN0U2VydmljZTtcblxuXHRcdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZlciA9IHN0b3JlLmFkZChuZXcgVGVzdElQQ1NlcnZlcigpKTtcblx0XHRcdHNlcnZlciA9IHRlc3RTZXJ2ZXI7XG5cblx0XHRcdHNlcnZlci5yZWdpc3RlckNoYW5uZWwoVGVzdENoYW5uZWxJZCwgbmV3IFRlc3RDaGFubmVsKHNlcnZpY2UpKTtcblxuXHRcdFx0Y2xpZW50ID0gc3RvcmUuYWRkKHRlc3RTZXJ2ZXIuY3JlYXRlQ29ubmVjdGlvbignY2xpZW50MScpKTtcblx0XHRcdGlwY1NlcnZpY2UgPSBuZXcgVGVzdENoYW5uZWxDbGllbnQoY2xpZW50LmdldENoYW5uZWwoVGVzdENoYW5uZWxJZCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbCBzdWNjZXNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgciA9IGF3YWl0IGlwY1NlcnZpY2UubWFyY28oKTtcblx0XHRcdHJldHVybiBhc3NlcnQuc3RyaWN0RXF1YWwociwgJ3BvbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbGwgZXJyb3InLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBpcGNTZXJ2aWNlLmVycm9yKCduaWNlIGVycm9yJyk7XG5cdFx0XHRcdHJldHVybiBhc3NlcnQuZmFpbCgnc2hvdWxkIG5vdCByZWFjaCBoZXJlJyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIGFzc2VydC5zdHJpY3RFcXVhbChlcnIubWVzc2FnZSwgJ25pY2UgZXJyb3InKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBjYWxsIHdpdGggY2FuY2VsbGVkIGNhbmNlbGxhdGlvbiB0b2tlbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGlwY1NlcnZpY2UubmV2ZXJDb21wbGV0ZUNUKENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZCk7XG5cdFx0XHRcdHJldHVybiBhc3NlcnQuZmFpbCgnc2hvdWxkIG5vdCByZWFjaCBoZXJlJyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIGFzc2VydChlcnIubWVzc2FnZSA9PT0gJ0NhbmNlbGVkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgY2FsbCB3aXRoIGNhbmNlbGxhdGlvbiB0b2tlbiAoc3luYyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBpcGNTZXJ2aWNlLm5ldmVyQ29tcGxldGVDVChjdHMudG9rZW4pLnRoZW4oXG5cdFx0XHRcdF8gPT4gYXNzZXJ0LmZhaWwoJ3Nob3VsZCBub3QgcmVhY2ggaGVyZScpLFxuXHRcdFx0XHRlcnIgPT4gYXNzZXJ0KGVyci5tZXNzYWdlID09PSAnQ2FuY2VsZWQnKVxuXHRcdFx0KTtcblxuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBjYWxsIHdpdGggY2FuY2VsbGF0aW9uIHRva2VuIChhc3luYyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBpcGNTZXJ2aWNlLm5ldmVyQ29tcGxldGVDVChjdHMudG9rZW4pLnRoZW4oXG5cdFx0XHRcdF8gPT4gYXNzZXJ0LmZhaWwoJ3Nob3VsZCBub3QgcmVhY2ggaGVyZScpLFxuXHRcdFx0XHRlcnIgPT4gYXNzZXJ0KGVyci5tZXNzYWdlID09PSAnQ2FuY2VsZWQnKVxuXHRcdFx0KTtcblxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiBjdHMuY2FuY2VsKCkpO1xuXG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3RlbiB0byBldmVudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0c3RvcmUuYWRkKGlwY1NlcnZpY2Uub25Qb25nKG1zZyA9PiBtZXNzYWdlcy5wdXNoKG1zZykpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtdKTtcblx0XHRcdHNlcnZpY2UucGluZygnaGVsbG8nKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nXSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ3dvcmxkJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbJ2hlbGxvJywgJ3dvcmxkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5idWZmZXJlZCBldmVudHMgc3Vic2NyaWJlIGxhemlseScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2hhbm5lbERpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHRjb25zdCBjaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKHNlcnZpY2UsIGNoYW5uZWxEaXNwb3NhYmxlcywgeyB1bmJ1ZmZlcmVkRXZlbnRzOiBbJ29uUG9uZyddIH0pO1xuXHRcdFx0Y29uc3Qgb25Qb25nID0gY2hhbm5lbC5saXN0ZW48c3RyaW5nPignY29udGV4dCcsICdvblBvbmcnKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ2JlZm9yZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzUG9uZ0xpc3RlbmVycywgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGNoYW5uZWxEaXNwb3NhYmxlcy5hZGQob25Qb25nKG1lc3NhZ2UgPT4gbWVzc2FnZXMucHVzaChtZXNzYWdlKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzUG9uZ0xpc3RlbmVycywgdHJ1ZSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ2FmdGVyJyk7XG5cdFx0XHRjaGFubmVsRGlzcG9zYWJsZXMuZGVsZXRlKGxpc3RlbmVyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1lc3NhZ2VzLCBoYXNQb25nTGlzdGVuZXJzOiBzZXJ2aWNlLmhhc1BvbmdMaXN0ZW5lcnMgfSwge1xuXHRcdFx0XHRtZXNzYWdlczogWydhZnRlciddLFxuXHRcdFx0XHRoYXNQb25nTGlzdGVuZXJzOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXN0ZW4gdG8gZXZlbnRzIChyZXN1YnNjcmliZSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBvblBvbmcgPSBpcGNTZXJ2aWNlLm9uUG9uZztcblx0XHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlMSA9IG9uUG9uZyhtc2cgPT4gbWVzc2FnZXMucHVzaChtc2cpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ2hlbGxvJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbyddKTtcblx0XHRcdGRpc3Bvc2FibGUxLmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSBvblBvbmcobXNnID0+IChtZXNzYWdlcyBhcyBzdHJpbmdbXSkucHVzaChtc2cpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbJ2hlbGxvJ10pO1xuXHRcdFx0c2VydmljZS5waW5nKCd3b3JsZCcpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nLCAnd29ybGQnXSk7XG5cdFx0XHRkaXNwb3NhYmxlMi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdidWZmZXJzIGluIGFycmF5cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCBpcGNTZXJ2aWNlLmJ1ZmZlcnNMZW5ndGgoW1ZTQnVmZmVyLmFsbG9jKDIpLCBWU0J1ZmZlci5hbGxvYygzKV0pO1xuXHRcdFx0cmV0dXJuIGFzc2VydC5zdHJpY3RFcXVhbChyLCA1KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdW5kIHRyaXBzIG51bWJlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0MCxcblx0XHRcdFx0MSxcblx0XHRcdFx0LTEsXG5cdFx0XHRcdDEyMzQ1LFxuXHRcdFx0XHQtMTIzNDUsXG5cdFx0XHRcdDQyLjYsXG5cdFx0XHRcdDEyMzQxMjM0MTIzNFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgd3JpdGVyID0gbmV3IEJ1ZmZlcldyaXRlcigpO1xuXHRcdFx0c2VyaWFsaXplKHdyaXRlciwgaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXNlcmlhbGl6ZShuZXcgQnVmZmVyUmVhZGVyKHdyaXRlci5idWZmZXIpKSwgaW5wdXQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQnVmZmVyV3JpdGVyIHJlbGVhc2VzIGl0cyBidWZmZXJzIG9uIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cml0ZXIgPSBuZXcgQnVmZmVyV3JpdGVyKCk7XG5cdFx0XHRzZXJpYWxpemUod3JpdGVyLCBbJ2EnLCAnYicsICdjJ10pO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyaXRlci5idWZmZXIuYnl0ZUxlbmd0aCA+IDApO1xuXG5cdFx0XHR3cml0ZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBBZnRlciBkaXNwb3NlIHRoZSB3cml0ZXIgbm8gbG9uZ2VyIHJldGFpbnMgdGhlIHNlcmlhbGl6ZWQgYnVmZmVycywgc29cblx0XHRcdC8vIGBidWZmZXJgIGlzIGVtcHR5LiBUaGlzIGd1YXJkcyBhZ2FpbnN0IGEgdGhyb3duIGVycm9yJ3MgY2FwdHVyZWQgc3RhY2tcblx0XHRcdC8vIHBpbm5pbmcgbGFyZ2UgaW50ZXJtZWRpYXRlIGJ1ZmZlcnMgKHNlZSBDaGFubmVsQ2xpZW50L0NoYW5uZWxTZXJ2ZXIuc2VuZCkuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JpdGVyLmJ1ZmZlci5ieXRlTGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVlc3QgcmVqZWN0cyAoYW5kIGNsZWFucyB1cCkgd2hlbiBzZXJpYWxpemF0aW9uIHRocm93cyBvbiB0aGUgZGVmZXJyZWQgcGF0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIFJlcHJvZHVjZXMgdGhlIGxlYWsgd2hlcmUgYSBzeW5jaHJvbm91cyBzZXJpYWxpemF0aW9uIGZhaWx1cmUgbGVmdCBhXG5cdFx0XHQvLyBkYW5nbGluZyBlbnRyeSBpbiBgQ2hhbm5lbENsaWVudC5oYW5kbGVyc2AgKGFuZCwgb24gdGhlIHVuaW5pdGlhbGl6ZWRcblx0XHRcdC8vIHBhdGgsIGEgcGVybWFuZW50bHkgcGVuZGluZyBwcm9taXNlKS4gV2UgbWFrZSBhIGNhbGwgKmJlZm9yZSogdGhlXG5cdFx0XHQvLyBjbGllbnQgaXMgaW5pdGlhbGl6ZWQgc28gdGhlIHJlcXVlc3QgaXMgZGVmZXJyZWQgdW50aWwgaW5pdDsgd2hlbiBpdFxuXHRcdFx0Ly8gZmluYWxseSBzZXJpYWxpemVzLCBhIGNpcmN1bGFyIGFyZ3VtZW50IG1ha2VzIGBKU09OLnN0cmluZ2lmeWAgdGhyb3cuXG5cdFx0XHRjb25zdCBjbGllbnRJbmNvbWluZyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxWU0J1ZmZlcj4oKSk7XG5cdFx0XHRjb25zdCBjbGllbnRQcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgPSB7XG5cdFx0XHRcdG9uTWVzc2FnZTogY2xpZW50SW5jb21pbmcuZXZlbnQsXG5cdFx0XHRcdHNlbmQ6ICgpID0+IHsgLyogY2xpZW50IG91dGJvdW5kIGlzIGlycmVsZXZhbnQgdG8gdGhpcyB0ZXN0ICovIH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXJ2ZXJPdXRib3g6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZlclByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCA9IHtcblx0XHRcdFx0b25NZXNzYWdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRzZW5kOiBidWZmZXIgPT4gc2VydmVyT3V0Ym94LnB1c2goYnVmZmVyKVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY2hhbm5lbENsaWVudCA9IHN0b3JlLmFkZChuZXcgQ2hhbm5lbENsaWVudChjbGllbnRQcm90b2NvbCkpO1xuXHRcdFx0Ly8gQ29uc3RydWN0aW5nIHRoZSBzZXJ2ZXIgZW1pdHMgYW4gSW5pdGlhbGl6ZSBtZXNzYWdlIGludG8gaXRzIG91dGJveC5cblx0XHRcdHN0b3JlLmFkZChuZXcgQ2hhbm5lbFNlcnZlcihzZXJ2ZXJQcm90b2NvbCwgJ2N0eCcpKTtcblxuXHRcdFx0Ly8gSXNzdWUgdGhlIGNhbGwgd2hpbGUgdGhlIGNsaWVudCBpcyBzdGlsbCB1bmluaXRpYWxpemVkOiBpdCBpcyBxdWV1ZWRcblx0XHRcdC8vIGJlaGluZCBgd2hlbkluaXRpYWxpemVkKClgIHJhdGhlciB0aGFuIHNlcmlhbGl6ZWQgaW1tZWRpYXRlbHkuXG5cdFx0XHRjb25zdCBjaXJjdWxhcjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRcdGNpcmN1bGFyLnNlbGYgPSBjaXJjdWxhcjtcblx0XHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjaGFubmVsQ2xpZW50LmdldENoYW5uZWwoJ3Rlc3RjaGFubmVsJykuY2FsbCgnY21kJywgY2lyY3VsYXIpO1xuXG5cdFx0XHQvLyBEZWxpdmVyIHRoZSBzZXJ2ZXIncyBJbml0aWFsaXplIHNvIHRoZSBkZWZlcnJlZCByZXF1ZXN0IHJ1bnMgYW5kIHRocm93cy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXJPdXRib3gubGVuZ3RoLCAxKTtcblx0XHRcdGNsaWVudEluY29taW5nLmZpcmUoc2VydmVyT3V0Ym94WzBdKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdWx0UHJvbWlzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvbmUgdG8gb25lIChwcm94eSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHNlcnZlcjogSVBDU2VydmVyO1xuXHRcdGxldCBjbGllbnQ6IElQQ0NsaWVudDtcblx0XHRsZXQgc2VydmljZTogVGVzdFNlcnZpY2U7XG5cdFx0bGV0IGlwY1NlcnZpY2U6IElUZXN0U2VydmljZTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdFx0c2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SVBDU2VydmVyKCkpO1xuXHRcdFx0c2VydmVyID0gdGVzdFNlcnZlcjtcblxuXHRcdFx0c2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChUZXN0Q2hhbm5lbElkLCBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2Uoc2VydmljZSwgZGlzcG9zYWJsZXMpKTtcblxuXHRcdFx0Y2xpZW50ID0gZGlzcG9zYWJsZXMuYWRkKHRlc3RTZXJ2ZXIuY3JlYXRlQ29ubmVjdGlvbignY2xpZW50MScpKTtcblx0XHRcdGlwY1NlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlKGNsaWVudC5nZXRDaGFubmVsKFRlc3RDaGFubmVsSWQpKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxsIHN1Y2Nlc3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCByID0gYXdhaXQgaXBjU2VydmljZS5tYXJjbygpO1xuXHRcdFx0cmV0dXJuIGFzc2VydC5zdHJpY3RFcXVhbChyLCAncG9sbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbCBlcnJvcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGlwY1NlcnZpY2UuZXJyb3IoJ25pY2UgZXJyb3InKTtcblx0XHRcdFx0cmV0dXJuIGFzc2VydC5mYWlsKCdzaG91bGQgbm90IHJlYWNoIGhlcmUnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0LnN0cmljdEVxdWFsKGVyci5tZXNzYWdlLCAnbmljZSBlcnJvcicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdGVuIHRvIGV2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaXBjU2VydmljZS5vblBvbmcobXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSkpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW10pO1xuXHRcdFx0c2VydmljZS5waW5nKCdoZWxsbycpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbyddKTtcblx0XHRcdHNlcnZpY2UucGluZygnd29ybGQnKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nLCAnd29ybGQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXN0ZW4gdG8gZXZlbnRzIChyZXN1YnNjcmliZSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBvblBvbmcgPSBpcGNTZXJ2aWNlLm9uUG9uZztcblx0XHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlMSA9IG9uUG9uZyhtc2cgPT4gbWVzc2FnZXMucHVzaChtc2cpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ2hlbGxvJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbyddKTtcblx0XHRcdGRpc3Bvc2FibGUxLmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSBvblBvbmcobXNnID0+IChtZXNzYWdlcyBhcyBzdHJpbmdbXSkucHVzaChtc2cpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbJ2hlbGxvJ10pO1xuXHRcdFx0c2VydmljZS5waW5nKCd3b3JsZCcpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nLCAnd29ybGQnXSk7XG5cdFx0XHRkaXNwb3NhYmxlMi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJzaGFsbGluZyB1cmknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnZm9vYmFyJyk7XG5cdFx0XHRjb25zdCByID0gYXdhaXQgaXBjU2VydmljZS5tYXJzaGFsbCh1cmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHIgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0cmV0dXJuIGFzc2VydC5vayhpc0VxdWFsKHIsIHVyaSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYnVmZmVycyBpbiBhcnJheXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCByID0gYXdhaXQgaXBjU2VydmljZS5idWZmZXJzTGVuZ3RoKFtWU0J1ZmZlci5hbGxvYygyKSwgVlNCdWZmZXIuYWxsb2MoMyldKTtcblx0XHRcdHJldHVybiBhc3NlcnQuc3RyaWN0RXF1YWwociwgNSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm94eSBpcyBub3QgYSB0aGVuYWJsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIEEgdGhlbmFibGUgcHJveHkgd291bGQgZm9yd2FyZCBgdGhlbmAgb3ZlciB0aGUgY2hhbm5lbCBhbmQgbmV2ZXIgc2V0dGxlLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChpcGNTZXJ2aWNlIGFzIHVua25vd24gYXMgeyB0aGVuPzogdW5rbm93biB9KS50aGVuLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBhd2FpdGVkID0gYXdhaXQgKGFzeW5jICgpID0+IGlwY1NlcnZpY2UpKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYXdhaXRlZC5tYXJjbygpLCAncG9sbycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnb25lIHRvIG9uZSAocHJveHksIGV4dHJhIGNvbnRleHQpJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBzZXJ2ZXI6IElQQ1NlcnZlcjtcblx0XHRsZXQgY2xpZW50OiBJUENDbGllbnQ7XG5cdFx0bGV0IHNlcnZpY2U6IFRlc3RTZXJ2aWNlO1xuXHRcdGxldCBpcGNTZXJ2aWNlOiBJVGVzdFNlcnZpY2U7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdElQQ1NlcnZlcigpKTtcblx0XHRcdHNlcnZlciA9IHRlc3RTZXJ2ZXI7XG5cblx0XHRcdHNlcnZlci5yZWdpc3RlckNoYW5uZWwoVGVzdENoYW5uZWxJZCwgUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKHNlcnZpY2UsIGRpc3Bvc2FibGVzKSk7XG5cblx0XHRcdGNsaWVudCA9IGRpc3Bvc2FibGVzLmFkZCh0ZXN0U2VydmVyLmNyZWF0ZUNvbm5lY3Rpb24oJ2NsaWVudDEnKSk7XG5cdFx0XHRpcGNTZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZShjbGllbnQuZ2V0Q2hhbm5lbChUZXN0Q2hhbm5lbElkKSwgeyBjb250ZXh0OiAnU3VwZXIgQ29udGV4dCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbCBleHRyYSBjb250ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgciA9IGF3YWl0IGlwY1NlcnZpY2UuY29udGV4dCgpO1xuXHRcdFx0cmV0dXJuIGFzc2VydC5zdHJpY3RFcXVhbChyLCAnU3VwZXIgQ29udGV4dCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnb25lIHRvIG1hbnknLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnYWxsIGNsaWVudHMgZ2V0IHBpbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBUZXN0Q2hhbm5lbChzZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHNlcnZlciA9IHN0b3JlLmFkZChuZXcgVGVzdElQQ1NlcnZlcigpKTtcblx0XHRcdHNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ2NoYW5uZWwnLCBjaGFubmVsKTtcblxuXHRcdFx0bGV0IGNsaWVudDFHb3RQaW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGNsaWVudDEgPSBzdG9yZS5hZGQoc2VydmVyLmNyZWF0ZUNvbm5lY3Rpb24oJ2NsaWVudDEnKSk7XG5cdFx0XHRjb25zdCBpcGNTZXJ2aWNlMSA9IG5ldyBUZXN0Q2hhbm5lbENsaWVudChjbGllbnQxLmdldENoYW5uZWwoJ2NoYW5uZWwnKSk7XG5cdFx0XHRzdG9yZS5hZGQoaXBjU2VydmljZTEub25Qb25nKCgpID0+IGNsaWVudDFHb3RQaW5nZWQgPSB0cnVlKSk7XG5cblx0XHRcdGxldCBjbGllbnQyR290UGluZ2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gc3RvcmUuYWRkKHNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQyJykpO1xuXHRcdFx0Y29uc3QgaXBjU2VydmljZTIgPSBuZXcgVGVzdENoYW5uZWxDbGllbnQoY2xpZW50Mi5nZXRDaGFubmVsKCdjaGFubmVsJykpO1xuXHRcdFx0c3RvcmUuYWRkKGlwY1NlcnZpY2UyLm9uUG9uZygoKSA9PiBjbGllbnQyR290UGluZ2VkID0gdHJ1ZSkpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0c2VydmljZS5waW5nKCdoZWxsbycpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0KGNsaWVudDFHb3RQaW5nZWQsICdjbGllbnQgMSBnb3QgcGluZ2VkJyk7XG5cdFx0XHRhc3NlcnQoY2xpZW50MkdvdFBpbmdlZCwgJ2NsaWVudCAyIGdvdCBwaW5nZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcnZlciBnZXRzIHBpbmdzIGZyb20gYWxsIGNsaWVudHMgKGJyb2FkY2FzdCBjaGFubmVsKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcnZlciA9IHN0b3JlLmFkZChuZXcgVGVzdElQQ1NlcnZlcigpKTtcblxuXHRcdFx0Y29uc3QgY2xpZW50MSA9IHNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQxJyk7XG5cdFx0XHRjb25zdCBjbGllbnRTZXJ2aWNlMSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjbGllbnRDaGFubmVsMSA9IG5ldyBUZXN0Q2hhbm5lbChjbGllbnRTZXJ2aWNlMSk7XG5cdFx0XHRjbGllbnQxLnJlZ2lzdGVyQ2hhbm5lbCgnY2hhbm5lbCcsIGNsaWVudENoYW5uZWwxKTtcblxuXHRcdFx0Y29uc3QgcGluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBjaGFubmVsID0gc2VydmVyLmdldENoYW5uZWwoJ2NoYW5uZWwnLCAoKSA9PiB0cnVlKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdENoYW5uZWxDbGllbnQoY2hhbm5lbCk7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5vblBvbmcobXNnID0+IHBpbmdzLnB1c2gobXNnKSkpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0Y2xpZW50U2VydmljZTEucGluZygnaGVsbG8gMScpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaW5ncywgWydoZWxsbyAxJ10pO1xuXG5cdFx0XHRjb25zdCBjbGllbnQyID0gc2VydmVyLmNyZWF0ZUNvbm5lY3Rpb24oJ2NsaWVudDInKTtcblx0XHRcdGNvbnN0IGNsaWVudFNlcnZpY2UyID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudENoYW5uZWwyID0gbmV3IFRlc3RDaGFubmVsKGNsaWVudFNlcnZpY2UyKTtcblx0XHRcdGNsaWVudDIucmVnaXN0ZXJDaGFubmVsKCdjaGFubmVsJywgY2xpZW50Q2hhbm5lbDIpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0Y2xpZW50U2VydmljZTIucGluZygnaGVsbG8gMicpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaW5ncywgWydoZWxsbyAxJywgJ2hlbGxvIDInXSk7XG5cblx0XHRcdGNsaWVudDEuZGlzcG9zZSgpO1xuXHRcdFx0Y2xpZW50U2VydmljZTEucGluZygnaGVsbG8gMScpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaW5ncywgWydoZWxsbyAxJywgJ2hlbGxvIDInXSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRjbGllbnRTZXJ2aWNlMi5waW5nKCdoZWxsbyBhZ2FpbiAyJyk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpbmdzLCBbJ2hlbGxvIDEnLCAnaGVsbG8gMicsICdoZWxsbyBhZ2FpbiAyJ10pO1xuXG5cdFx0XHRjbGllbnQyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxjQUFjLGNBQWMsZUFBZSxlQUFzQyxhQUFhLG1CQUFzRCxXQUFXLFdBQTJCLGNBQWMsaUJBQWlCO0FBQ2xPLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sY0FBaUQ7QUFBQSxFQUF2RDtBQUVDLFNBQVEsWUFBWTtBQUNwQixTQUFRLFVBQXNCLENBQUM7QUFFL0IsU0FBaUIsYUFBYSxJQUFJLFFBQWtCO0FBQUEsTUFDbkQsdUJBQXVCLE1BQU07QUFD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
