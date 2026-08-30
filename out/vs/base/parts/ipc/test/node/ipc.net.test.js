import assert from "assert";
import sinon from "sinon";
import { EventEmitter } from "events";
import { connect, createServer } from "net";
import { tmpdir } from "os";
import { Barrier, timeout } from "../../../../common/async.js";
import { VSBuffer } from "../../../../common/buffer.js";
import { Emitter, Event } from "../../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../common/lifecycle.js";
import { PersistentProtocol, Protocol, ProtocolConstants, SocketTimeoutReason } from "../../common/ipc.net.js";
import { createRandomIPCHandle, createStaticIPCHandle, NodeSocket, WebSocketNodeSocket } from "../../node/ipc.net.js";
import { flakySuite } from "../../../../test/common/testUtils.js";
import { runWithFakedTimers } from "../../../../test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../test/common/utils.js";
class MessageStream extends Disposable {
  constructor(x) {
    super();
    this._currentComplete = null;
    this._messages = [];
    this._register(x.onMessage((data) => {
      this._messages.push(data);
      this._trigger();
    }));
  }
  _trigger() {
    if (!this._currentComplete) {
      return;
    }
    if (this._messages.length === 0) {
      return;
    }
    const complete = this._currentComplete;
    const msg = this._messages.shift();
    this._currentComplete = null;
    complete(msg);
  }
  waitForOne() {
    return new Promise((complete) => {
      this._currentComplete = complete;
      this._trigger();
    });
  }
}
class EtherStream extends EventEmitter {
  constructor(_ether, _name) {
    super();
    this._ether = _ether;
    this._name = _name;
  }
  write(data, cb) {
    if (!Buffer.isBuffer(data)) {
      throw new Error(`Invalid data`);
    }
    this._ether.write(this._name, data);
    return true;
  }
  destroy() {
  }
}
class Ether {
  constructor(_wireLatency = 0) {
    this._wireLatency = _wireLatency;
    this._a = new EtherStream(this, "a");
    this._b = new EtherStream(this, "b");
    this._ab = [];
    this._ba = [];
  }
  get a() {
    return this._a;
  }
  get b() {
    return this._b;
  }
  write(from, data) {
    setTimeout(() => {
      if (from === "a") {
        this._ab.push(data);
      } else {
        this._ba.push(data);
      }
      setTimeout(() => this._deliver(), 0);
    }, this._wireLatency);
  }
  _deliver() {
    if (this._ab.length > 0) {
      const data = Buffer.concat(this._ab);
      this._ab.length = 0;
      this._b.emit("data", data);
      setTimeout(() => this._deliver(), 0);
      return;
    }
    if (this._ba.length > 0) {
      const data = Buffer.concat(this._ba);
      this._ba.length = 0;
      this._a.emit("data", data);
      setTimeout(() => this._deliver(), 0);
      return;
    }
  }
}
suite("IPC, Socket Protocol", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let ether;
  setup(() => {
    ether = new Ether();
  });
  test("read/write", async () => {
    const a = new Protocol(new NodeSocket(ether.a));
    const b = new Protocol(new NodeSocket(ether.b));
    const bMessages = new MessageStream(b);
    a.send(VSBuffer.fromString("foobarfarboo"));
    const msg1 = await bMessages.waitForOne();
    assert.strictEqual(msg1.toString(), "foobarfarboo");
    const buffer = VSBuffer.alloc(1);
    buffer.writeUInt8(123, 0);
    a.send(buffer);
    const msg2 = await bMessages.waitForOne();
    assert.strictEqual(msg2.readUInt8(0), 123);
    bMessages.dispose();
    a.dispose();
    b.dispose();
  });
  test("read/write, object data", async () => {
    const a = new Protocol(new NodeSocket(ether.a));
    const b = new Protocol(new NodeSocket(ether.b));
    const bMessages = new MessageStream(b);
    const data = {
      pi: Math.PI,
      foo: "bar",
      more: true,
      data: "Hello World".split("")
    };
    a.send(VSBuffer.fromString(JSON.stringify(data)));
    const msg = await bMessages.waitForOne();
    assert.deepStrictEqual(JSON.parse(msg.toString()), data);
    bMessages.dispose();
    a.dispose();
    b.dispose();
  });
  test("issue #211462: destroy socket after end timeout", async () => {
    const socket = new EventEmitter();
    Object.assign(socket, { destroy: () => socket.emit("close") });
    const protocol = ds.add(new Protocol(new NodeSocket(socket)));
    const disposed = sinon.stub();
    const timers = sinon.useFakeTimers();
    ds.add(toDisposable(() => timers.restore()));
    ds.add(protocol.onDidDispose(disposed));
    socket.emit("end");
    assert.ok(!disposed.called);
    timers.tick(29999);
    assert.ok(!disposed.called);
    timers.tick(1);
    assert.ok(disposed.called);
  });
  test("dispose(false) detaches listeners without destroying the socket", () => {
    let destroyed = false;
    const socket = new EventEmitter();
    Object.assign(socket, { destroy: () => {
      destroyed = true;
    } });
    const nodeSocket = new NodeSocket(socket);
    nodeSocket.dispose(false);
    assert.deepStrictEqual({
      destroyed,
      errorListeners: socket.listenerCount("error"),
      closeListeners: socket.listenerCount("close"),
      endListeners: socket.listenerCount("end")
    }, {
      destroyed: false,
      errorListeners: 0,
      closeListeners: 0,
      endListeners: 0
    });
  });
});
suite("PersistentProtocol reconnection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("acks get piggybacked with messages", async () => {
    const ether = new Ether();
    const a = new PersistentProtocol({ socket: new NodeSocket(ether.a) });
    const aMessages = new MessageStream(a);
    const b = new PersistentProtocol({ socket: new NodeSocket(ether.b) });
    const bMessages = new MessageStream(b);
    a.send(VSBuffer.fromString("a1"));
    assert.strictEqual(a.unacknowledgedCount, 1);
    assert.strictEqual(b.unacknowledgedCount, 0);
    a.send(VSBuffer.fromString("a2"));
    assert.strictEqual(a.unacknowledgedCount, 2);
    assert.strictEqual(b.unacknowledgedCount, 0);
    a.send(VSBuffer.fromString("a3"));
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);
    const a1 = await bMessages.waitForOne();
    assert.strictEqual(a1.toString(), "a1");
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);
    const a2 = await bMessages.waitForOne();
    assert.strictEqual(a2.toString(), "a2");
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);
    const a3 = await bMessages.waitForOne();
    assert.strictEqual(a3.toString(), "a3");
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);
    b.send(VSBuffer.fromString("b1"));
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 1);
    const b1 = await aMessages.waitForOne();
    assert.strictEqual(b1.toString(), "b1");
    assert.strictEqual(a.unacknowledgedCount, 0);
    assert.strictEqual(b.unacknowledgedCount, 1);
    a.send(VSBuffer.fromString("a4"));
    assert.strictEqual(a.unacknowledgedCount, 1);
    assert.strictEqual(b.unacknowledgedCount, 1);
    const b2 = await bMessages.waitForOne();
    assert.strictEqual(b2.toString(), "a4");
    assert.strictEqual(a.unacknowledgedCount, 1);
    assert.strictEqual(b.unacknowledgedCount, 0);
    aMessages.dispose();
    bMessages.dispose();
    a.dispose();
    b.dispose();
  });
  test("ack gets sent after a while", async () => {
    await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
      const loadEstimator = {
        hasHighLoad: () => false
      };
      const ether = new Ether();
      const aSocket = new NodeSocket(ether.a);
      const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
      const aMessages = new MessageStream(a);
      const bSocket = new NodeSocket(ether.b);
      const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
      const bMessages = new MessageStream(b);
      a.send(VSBuffer.fromString("a1"));
      assert.strictEqual(a.unacknowledgedCount, 1);
      assert.strictEqual(b.unacknowledgedCount, 0);
      const a1 = await bMessages.waitForOne();
      assert.strictEqual(a1.toString(), "a1");
      assert.strictEqual(a.unacknowledgedCount, 1);
      assert.strictEqual(b.unacknowledgedCount, 0);
      await timeout(2 * ProtocolConstants.AcknowledgeTime);
      assert.strictEqual(a.unacknowledgedCount, 0);
      assert.strictEqual(b.unacknowledgedCount, 0);
      aMessages.dispose();
      bMessages.dispose();
      a.dispose();
      b.dispose();
    });
  });
  test("messages that are never written to a socket should not cause an ack timeout", async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1e3
      },
      async () => {
        await timeout(60 * 60 * 1e3);
        const loadEstimator = {
          hasHighLoad: () => false
        };
        const ether = new Ether();
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator, sendKeepAlive: false });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator, sendKeepAlive: false });
        const bMessages = new MessageStream(b);
        a.send(VSBuffer.fromString("a1"));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        const a1 = await bMessages.waitForOne();
        assert.strictEqual(a1.toString(), "a1");
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        b.send(VSBuffer.fromString("b1"));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);
        const b1 = await aMessages.waitForOne();
        assert.strictEqual(b1.toString(), "b1");
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 1);
        aSocket.dispose();
        const aSocket2 = new NodeSocket(ether.a);
        a.beginAcceptReconnection(aSocket2, null);
        let timeoutListenerCalled = false;
        const socketTimeoutListener = a.onSocketTimeout(() => {
          timeoutListenerCalled = true;
        });
        a.send(VSBuffer.fromString("a2"));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);
        await timeout(2 * ProtocolConstants.TimeoutTime);
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);
        assert.strictEqual(timeoutListenerCalled, false);
        a.endAcceptReconnection();
        assert.strictEqual(timeoutListenerCalled, false);
        await timeout(2 * ProtocolConstants.TimeoutTime);
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 0);
        assert.strictEqual(timeoutListenerCalled, false);
        socketTimeoutListener.dispose();
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      }
    );
  });
  test("acks are always sent after a reconnection", async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1e3
      },
      async () => {
        const loadEstimator = {
          hasHighLoad: () => false
        };
        const wireLatency = 1e3;
        const ether = new Ether(wireLatency);
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
        const bMessages = new MessageStream(b);
        a.send(VSBuffer.fromString("a1"));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        const a1 = await bMessages.waitForOne();
        assert.strictEqual(a1.toString(), "a1");
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        await timeout(ProtocolConstants.AcknowledgeTime + wireLatency / 2);
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        aSocket.dispose();
        bSocket.dispose();
        const ether2 = new Ether(wireLatency);
        const aSocket2 = new NodeSocket(ether2.a);
        const bSocket2 = new NodeSocket(ether2.b);
        b.beginAcceptReconnection(bSocket2, null);
        b.endAcceptReconnection();
        a.beginAcceptReconnection(aSocket2, null);
        a.endAcceptReconnection();
        await timeout(2 * ProtocolConstants.AcknowledgeTime + wireLatency);
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 0);
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      }
    );
  });
  test("onSocketTimeout is emitted at most once every 20s", async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1e3
      },
      async () => {
        const loadEstimator = {
          hasHighLoad: () => false
        };
        const ether = new Ether();
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
        const bMessages = new MessageStream(b);
        b.pauseSocketWriting();
        a.send(VSBuffer.fromString("a1"));
        await Event.toPromise(a.onSocketTimeout);
        let timeoutFiredAgain = false;
        const timeoutListener = a.onSocketTimeout(() => {
          timeoutFiredAgain = true;
        });
        a.send(VSBuffer.fromString("a2"));
        a.send(VSBuffer.fromString("a3"));
        await timeout(ProtocolConstants.TimeoutTime / 2);
        assert.strictEqual(timeoutFiredAgain, false);
        timeoutListener.dispose();
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      }
    );
  });
  test("keepalive detects dead connection when no regular messages are pending", async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1e3
      },
      async () => {
        const loadEstimator = {
          hasHighLoad: () => false
        };
        const ether = new Ether();
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
        const bMessages = new MessageStream(b);
        a.send(VSBuffer.fromString("a1"));
        const a1 = await bMessages.waitForOne();
        assert.strictEqual(a1.toString(), "a1");
        await timeout(ProtocolConstants.AcknowledgeTime * 2);
        assert.strictEqual(a.unacknowledgedCount, 0);
        b.pauseSocketWriting();
        const socketTimeoutEvent = await Event.toPromise(a.onSocketTimeout);
        assert.strictEqual(socketTimeoutEvent.reason, SocketTimeoutReason.KEEP_ALIVE);
        assert.ok(socketTimeoutEvent.timeSinceLastReceivedSomeData >= ProtocolConstants.TimeoutTime);
        assert.strictEqual(socketTimeoutEvent.unacknowledgedMsgCount, 0);
        assert.strictEqual(socketTimeoutEvent.timeSinceOldestUnacknowledgedMsg, void 0);
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      }
    );
  });
  test("writing can be paused", async () => {
    await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
      const loadEstimator = {
        hasHighLoad: () => false
      };
      const ether = new Ether();
      const aSocket = new NodeSocket(ether.a);
      const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
      const aMessages = new MessageStream(a);
      const bSocket = new NodeSocket(ether.b);
      const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
      const bMessages = new MessageStream(b);
      a.send(VSBuffer.fromString("a1"));
      const a1 = await bMessages.waitForOne();
      assert.strictEqual(a1.toString(), "a1");
      b.sendPause();
      b.send(VSBuffer.fromString("b1"));
      const b1 = await aMessages.waitForOne();
      assert.strictEqual(b1.toString(), "b1");
      a.send(VSBuffer.fromString("a2"));
      await timeout(2 * ProtocolConstants.AcknowledgeTime);
      assert.strictEqual(a.unacknowledgedCount, 1);
      assert.strictEqual(b.unacknowledgedCount, 1);
      b.sendResume();
      const a2 = await bMessages.waitForOne();
      assert.strictEqual(a2.toString(), "a2");
      await timeout(2 * ProtocolConstants.AcknowledgeTime);
      assert.strictEqual(a.unacknowledgedCount, 0);
      assert.strictEqual(b.unacknowledgedCount, 0);
      aMessages.dispose();
      bMessages.dispose();
      a.dispose();
      b.dispose();
    });
  });
});
flakySuite("IPC, create handle", () => {
  test("createRandomIPCHandle", async () => {
    return testIPCHandle(createRandomIPCHandle());
  });
  test("createStaticIPCHandle", async () => {
    return testIPCHandle(createStaticIPCHandle(tmpdir(), "test", "1.64.0"));
  });
  function testIPCHandle(handle) {
    return new Promise((resolve, reject) => {
      const pipeName = createRandomIPCHandle();
      const server = createServer();
      server.on("error", () => {
        return new Promise(() => server.close(() => reject()));
      });
      server.listen(pipeName, () => {
        server.removeListener("error", reject);
        return new Promise(() => {
          server.close(() => resolve());
        });
      });
    });
  }
});
suite("WebSocketNodeSocket", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  function toUint8Array(data) {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i];
    }
    return result;
  }
  function fromUint8Array(data) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i];
    }
    return result;
  }
  function fromCharCodeArray(data) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data[i]);
    }
    return result;
  }
  class FakeNodeSocket extends Disposable {
    constructor() {
      super();
      this._onData = new Emitter();
      this.onData = this._onData.event;
      this._onClose = new Emitter();
      this.onClose = this._onClose.event;
      this.writtenData = [];
    }
    traceSocketEvent(type, data) {
    }
    write(data) {
      this.writtenData.push(data);
    }
    fireData(data) {
      this._onData.fire(VSBuffer.wrap(toUint8Array(data)));
    }
  }
  async function testReading(frames, permessageDeflate) {
    const disposables = new DisposableStore();
    const socket = new FakeNodeSocket();
    const webSocket = disposables.add(new WebSocketNodeSocket(socket, permessageDeflate, null, false));
    const barrier = new Barrier();
    let remainingFrameCount = frames.length;
    let receivedData = "";
    disposables.add(webSocket.onData((buff) => {
      receivedData += fromCharCodeArray(fromUint8Array(buff.buffer));
      remainingFrameCount--;
      if (remainingFrameCount === 0) {
        barrier.open();
      }
    }));
    for (let i = 0; i < frames.length; i++) {
      socket.fireData(frames[i]);
    }
    await barrier.wait();
    disposables.dispose();
    return receivedData;
  }
  test("A single-frame unmasked text message", async () => {
    const frames = [
      [129, 5, 72, 101, 108, 108, 111]
      // contains "Hello"
    ];
    const actual = await testReading(frames, false);
    assert.deepStrictEqual(actual, "Hello");
  });
  test("A single-frame masked text message", async () => {
    const frames = [
      [129, 133, 55, 250, 33, 61, 127, 159, 77, 81, 88]
      // contains "Hello"
    ];
    const actual = await testReading(frames, false);
    assert.deepStrictEqual(actual, "Hello");
  });
  test("A fragmented unmasked text message", async () => {
    const frames = [
      [1, 3, 72, 101, 108],
      // contains "Hel"
      [128, 2, 108, 111]
      // contains "lo"
    ];
    const actual = await testReading(frames, false);
    assert.deepStrictEqual(actual, "Hello");
  });
  suite("compression", () => {
    test("A single-frame compressed text message", async () => {
      const frames = [
        [193, 7, 242, 72, 205, 201, 201, 7, 0]
        // contains "Hello"
      ];
      const actual = await testReading(frames, true);
      assert.deepStrictEqual(actual, "Hello");
    });
    test("setRecordInflateBytes(false) clears and stops recording", async () => {
      const disposables = new DisposableStore();
      const socket = disposables.add(new FakeNodeSocket());
      const webSocket = disposables.add(new WebSocketNodeSocket(socket, true, null, true));
      const compressedHelloFrame = [193, 7, 242, 72, 205, 201, 201, 7, 0];
      const waitForOneData = () => new Promise((resolve) => {
        const d = webSocket.onData((data) => {
          d.dispose();
          resolve(data);
        });
      });
      const firstPromise = waitForOneData();
      socket.fireData(compressedHelloFrame);
      const first = await firstPromise;
      assert.strictEqual(fromCharCodeArray(fromUint8Array(first.buffer)), "Hello");
      assert.ok(webSocket.recordedInflateBytes.byteLength > 0);
      webSocket.setRecordInflateBytes(false);
      assert.strictEqual(webSocket.recordedInflateBytes.byteLength, 0);
      const secondPromise = waitForOneData();
      socket.fireData(compressedHelloFrame);
      const second = await secondPromise;
      assert.strictEqual(fromCharCodeArray(fromUint8Array(second.buffer)), "Hello");
      assert.strictEqual(webSocket.recordedInflateBytes.byteLength, 0);
      webSocket.setRecordInflateBytes(true);
      assert.strictEqual(webSocket.recordedInflateBytes.byteLength, 0);
      const thirdPromise = waitForOneData();
      socket.fireData(compressedHelloFrame);
      const third = await thirdPromise;
      assert.strictEqual(fromCharCodeArray(fromUint8Array(third.buffer)), "Hello");
      assert.ok(webSocket.recordedInflateBytes.byteLength > 0);
      disposables.dispose();
    });
    test("A fragmented compressed text message", async () => {
      const frames = [
        // contains "Hello"
        [65, 3, 242, 72, 205],
        [128, 4, 201, 201, 7, 0]
      ];
      const actual = await testReading(frames, true);
      assert.deepStrictEqual(actual, "Hello");
    });
    test("A single-frame non-compressed text message", async () => {
      const frames = [
        [129, 5, 72, 101, 108, 108, 111]
        // contains "Hello"
      ];
      const actual = await testReading(frames, true);
      assert.deepStrictEqual(actual, "Hello");
    });
    test("A single-frame compressed text message followed by a single-frame non-compressed text message", async () => {
      const frames = [
        [193, 7, 242, 72, 205, 201, 201, 7, 0],
        // contains "Hello"
        [129, 5, 119, 111, 114, 108, 100]
        // contains "world"
      ];
      const actual = await testReading(frames, true);
      assert.deepStrictEqual(actual, "Helloworld");
    });
  });
  test("Large buffers are split and sent in chunks", async () => {
    let receivingSideOnDataCallCount = 0;
    let receivingSideTotalBytes = 0;
    const receivingSideSocketClosedBarrier = new Barrier();
    const server = await listenOnRandomPort((socket2) => {
      server.close();
      const webSocketNodeSocket2 = new WebSocketNodeSocket(new NodeSocket(socket2), true, null, false);
      ds.add(webSocketNodeSocket2.onData((data) => {
        receivingSideOnDataCallCount++;
        receivingSideTotalBytes += data.byteLength;
      }));
      ds.add(webSocketNodeSocket2.onClose(() => {
        webSocketNodeSocket2.dispose();
        receivingSideSocketClosedBarrier.open();
      }));
    });
    const socket = connect({
      host: "127.0.0.1",
      port: server.address().port
    });
    const buff = generateRandomBuffer(1 * 1024 * 1024);
    const webSocketNodeSocket = new WebSocketNodeSocket(new NodeSocket(socket), true, null, false);
    webSocketNodeSocket.write(buff);
    await webSocketNodeSocket.drain();
    webSocketNodeSocket.dispose();
    await receivingSideSocketClosedBarrier.wait();
    assert.strictEqual(receivingSideTotalBytes, buff.byteLength);
    assert.strictEqual(receivingSideOnDataCallCount, 4);
  });
  test("issue #194284: ping/pong opcodes are supported", async () => {
    const disposables = new DisposableStore();
    const socket = new FakeNodeSocket();
    const webSocket = disposables.add(new WebSocketNodeSocket(socket, false, null, false));
    let receivedData = "";
    disposables.add(webSocket.onData((buff) => {
      receivedData += fromCharCodeArray(fromUint8Array(buff.buffer));
    }));
    socket.fireData([129, 5, 72, 101, 108, 108, 111]);
    socket.fireData([137, 4, 100, 97, 116, 97]);
    socket.fireData([129, 5, 72, 101, 108, 108, 111]);
    assert.strictEqual(receivedData, "HelloHello");
    assert.deepStrictEqual(
      socket.writtenData.map((x) => fromUint8Array(x.buffer)),
      [
        // A pong message that contains "data"
        [138, 4, 100, 97, 116, 97]
      ]
    );
    disposables.dispose();
    return receivedData;
  });
  function generateRandomBuffer(size) {
    const buff = VSBuffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buff.writeUInt8(Math.floor(256 * Math.random()), i);
    }
    return buff;
  }
  function listenOnRandomPort(handler) {
    return new Promise((resolve, reject) => {
      const server = createServer(handler).listen(0);
      server.on("listening", () => {
        resolve(server);
      });
      server.on("error", (err) => {
        reject(err);
      });
    });
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcaXBjXFx0ZXN0XFxub2RlXFxpcGMubmV0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IEFkZHJlc3NJbmZvLCBjb25uZWN0LCBjcmVhdGVTZXJ2ZXIsIFNlcnZlciwgU29ja2V0IH0gZnJvbSAnbmV0JztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IEJhcnJpZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9hZEVzdGltYXRvciwgUGVyc2lzdGVudFByb3RvY29sLCBQcm90b2NvbCwgUHJvdG9jb2xDb25zdGFudHMsIFNvY2tldENsb3NlRXZlbnQsIFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLCBTb2NrZXRUaW1lb3V0UmVhc29uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmFuZG9tSVBDSGFuZGxlLCBjcmVhdGVTdGF0aWNJUENIYW5kbGUsIE5vZGVTb2NrZXQsIFdlYlNvY2tldE5vZGVTb2NrZXQgfSBmcm9tICcuLi8uLi9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgZmxha3lTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY2xhc3MgTWVzc2FnZVN0cmVhbSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX2N1cnJlbnRDb21wbGV0ZTogKChkYXRhOiBWU0J1ZmZlcikgPT4gdm9pZCkgfCBudWxsO1xuXHRwcml2YXRlIF9tZXNzYWdlczogVlNCdWZmZXJbXTtcblxuXHRjb25zdHJ1Y3Rvcih4OiBQcm90b2NvbCB8IFBlcnNpc3RlbnRQcm90b2NvbCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY3VycmVudENvbXBsZXRlID0gbnVsbDtcblx0XHR0aGlzLl9tZXNzYWdlcyA9IFtdO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHgub25NZXNzYWdlKGRhdGEgPT4ge1xuXHRcdFx0dGhpcy5fbWVzc2FnZXMucHVzaChkYXRhKTtcblx0XHRcdHRoaXMuX3RyaWdnZXIoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF90cmlnZ2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3VycmVudENvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tcGxldGUgPSB0aGlzLl9jdXJyZW50Q29tcGxldGU7XG5cdFx0Y29uc3QgbXNnID0gdGhpcy5fbWVzc2FnZXMuc2hpZnQoKSE7XG5cblx0XHR0aGlzLl9jdXJyZW50Q29tcGxldGUgPSBudWxsO1xuXHRcdGNvbXBsZXRlKG1zZyk7XG5cdH1cblxuXHRwdWJsaWMgd2FpdEZvck9uZSgpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFZTQnVmZmVyPigoY29tcGxldGUpID0+IHtcblx0XHRcdHRoaXMuX2N1cnJlbnRDb21wbGV0ZSA9IGNvbXBsZXRlO1xuXHRcdFx0dGhpcy5fdHJpZ2dlcigpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEV0aGVyU3RyZWFtIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXRoZXI6IEV0aGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25hbWU6ICdhJyB8ICdiJ1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0d3JpdGUoZGF0YTogQnVmZmVyLCBjYj86IEZ1bmN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFCdWZmZXIuaXNCdWZmZXIoZGF0YSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBkYXRhYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2V0aGVyLndyaXRlKHRoaXMuX25hbWUsIGRhdGEpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZGVzdHJveSgpOiB2b2lkIHtcblx0fVxufVxuXG5jbGFzcyBFdGhlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYTogRXRoZXJTdHJlYW07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2I6IEV0aGVyU3RyZWFtO1xuXG5cdHByaXZhdGUgX2FiOiBCdWZmZXJbXTtcblx0cHJpdmF0ZSBfYmE6IEJ1ZmZlcltdO1xuXG5cdHB1YmxpYyBnZXQgYSgpOiBTb2NrZXQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJldHVybiA8YW55PnRoaXMuX2E7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGIoKTogU29ja2V0IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZXR1cm4gPGFueT50aGlzLl9iO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2lyZUxhdGVuY3kgPSAwXG5cdCkge1xuXHRcdHRoaXMuX2EgPSBuZXcgRXRoZXJTdHJlYW0odGhpcywgJ2EnKTtcblx0XHR0aGlzLl9iID0gbmV3IEV0aGVyU3RyZWFtKHRoaXMsICdiJyk7XG5cdFx0dGhpcy5fYWIgPSBbXTtcblx0XHR0aGlzLl9iYSA9IFtdO1xuXHR9XG5cblx0cHVibGljIHdyaXRlKGZyb206ICdhJyB8ICdiJywgZGF0YTogQnVmZmVyKTogdm9pZCB7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoZnJvbSA9PT0gJ2EnKSB7XG5cdFx0XHRcdHRoaXMuX2FiLnB1c2goZGF0YSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9iYS5wdXNoKGRhdGEpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2RlbGl2ZXIoKSwgMCk7XG5cdFx0fSwgdGhpcy5fd2lyZUxhdGVuY3kpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVsaXZlcigpOiB2b2lkIHtcblxuXHRcdGlmICh0aGlzLl9hYi5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gQnVmZmVyLmNvbmNhdCh0aGlzLl9hYik7XG5cdFx0XHR0aGlzLl9hYi5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5fYi5lbWl0KCdkYXRhJywgZGF0YSk7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2RlbGl2ZXIoKSwgMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2JhLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBCdWZmZXIuY29uY2F0KHRoaXMuX2JhKTtcblx0XHRcdHRoaXMuX2JhLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLl9hLmVtaXQoJ2RhdGEnLCBkYXRhKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fZGVsaXZlcigpLCAwKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0fVxufVxuXG5zdWl0ZSgnSVBDLCBTb2NrZXQgUHJvdG9jb2wnLCAoKSA9PiB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZXRoZXI6IEV0aGVyO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRldGhlciA9IG5ldyBFdGhlcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkL3dyaXRlJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYSA9IG5ldyBQcm90b2NvbChuZXcgTm9kZVNvY2tldChldGhlci5hKSk7XG5cdFx0Y29uc3QgYiA9IG5ldyBQcm90b2NvbChuZXcgTm9kZVNvY2tldChldGhlci5iKSk7XG5cdFx0Y29uc3QgYk1lc3NhZ2VzID0gbmV3IE1lc3NhZ2VTdHJlYW0oYik7XG5cblx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vYmFyZmFyYm9vJykpO1xuXHRcdGNvbnN0IG1zZzEgPSBhd2FpdCBiTWVzc2FnZXMud2FpdEZvck9uZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtc2cxLnRvU3RyaW5nKCksICdmb29iYXJmYXJib28nKTtcblxuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLmFsbG9jKDEpO1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQ4KDEyMywgMCk7XG5cdFx0YS5zZW5kKGJ1ZmZlcik7XG5cdFx0Y29uc3QgbXNnMiA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1zZzIucmVhZFVJbnQ4KDApLCAxMjMpO1xuXG5cdFx0Yk1lc3NhZ2VzLmRpc3Bvc2UoKTtcblx0XHRhLmRpc3Bvc2UoKTtcblx0XHRiLmRpc3Bvc2UoKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdyZWFkL3dyaXRlLCBvYmplY3QgZGF0YScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGEgPSBuZXcgUHJvdG9jb2wobmV3IE5vZGVTb2NrZXQoZXRoZXIuYSkpO1xuXHRcdGNvbnN0IGIgPSBuZXcgUHJvdG9jb2wobmV3IE5vZGVTb2NrZXQoZXRoZXIuYikpO1xuXHRcdGNvbnN0IGJNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGIpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdHBpOiBNYXRoLlBJLFxuXHRcdFx0Zm9vOiAnYmFyJyxcblx0XHRcdG1vcmU6IHRydWUsXG5cdFx0XHRkYXRhOiAnSGVsbG8gV29ybGQnLnNwbGl0KCcnKVxuXHRcdH07XG5cblx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShkYXRhKSkpO1xuXHRcdGNvbnN0IG1zZyA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKG1zZy50b1N0cmluZygpKSwgZGF0YSk7XG5cblx0XHRiTWVzc2FnZXMuZGlzcG9zZSgpO1xuXHRcdGEuZGlzcG9zZSgpO1xuXHRcdGIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXG5cblx0dGVzdCgnaXNzdWUgIzIxMTQ2MjogZGVzdHJveSBzb2NrZXQgYWZ0ZXIgZW5kIHRpbWVvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ja2V0ID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuXHRcdE9iamVjdC5hc3NpZ24oc29ja2V0LCB7IGRlc3Ryb3k6ICgpID0+IHNvY2tldC5lbWl0KCdjbG9zZScpIH0pO1xuXHRcdGNvbnN0IHByb3RvY29sID0gZHMuYWRkKG5ldyBQcm90b2NvbChuZXcgTm9kZVNvY2tldChzb2NrZXQgYXMgU29ja2V0KSkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zZWQgPSBzaW5vbi5zdHViKCk7XG5cdFx0Y29uc3QgdGltZXJzID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXG5cdFx0ZHMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aW1lcnMucmVzdG9yZSgpKSk7XG5cdFx0ZHMuYWRkKHByb3RvY29sLm9uRGlkRGlzcG9zZShkaXNwb3NlZCkpO1xuXG5cdFx0c29ja2V0LmVtaXQoJ2VuZCcpO1xuXHRcdGFzc2VydC5vayghZGlzcG9zZWQuY2FsbGVkKTtcblx0XHR0aW1lcnMudGljaygyOV85OTkpO1xuXHRcdGFzc2VydC5vayghZGlzcG9zZWQuY2FsbGVkKTtcblx0XHR0aW1lcnMudGljaygxKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWQuY2FsbGVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZShmYWxzZSkgZGV0YWNoZXMgbGlzdGVuZXJzIHdpdGhvdXQgZGVzdHJveWluZyB0aGUgc29ja2V0JywgKCkgPT4ge1xuXHRcdGxldCBkZXN0cm95ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzb2NrZXQgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cdFx0T2JqZWN0LmFzc2lnbihzb2NrZXQsIHsgZGVzdHJveTogKCkgPT4geyBkZXN0cm95ZWQgPSB0cnVlOyB9IH0pO1xuXG5cdFx0Y29uc3Qgbm9kZVNvY2tldCA9IG5ldyBOb2RlU29ja2V0KHNvY2tldCBhcyBTb2NrZXQpO1xuXHRcdG5vZGVTb2NrZXQuZGlzcG9zZShmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlc3Ryb3llZCxcblx0XHRcdGVycm9yTGlzdGVuZXJzOiBzb2NrZXQubGlzdGVuZXJDb3VudCgnZXJyb3InKSxcblx0XHRcdGNsb3NlTGlzdGVuZXJzOiBzb2NrZXQubGlzdGVuZXJDb3VudCgnY2xvc2UnKSxcblx0XHRcdGVuZExpc3RlbmVyczogc29ja2V0Lmxpc3RlbmVyQ291bnQoJ2VuZCcpLFxuXHRcdH0sIHtcblx0XHRcdGRlc3Ryb3llZDogZmFsc2UsXG5cdFx0XHRlcnJvckxpc3RlbmVyczogMCxcblx0XHRcdGNsb3NlTGlzdGVuZXJzOiAwLFxuXHRcdFx0ZW5kTGlzdGVuZXJzOiAwLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUGVyc2lzdGVudFByb3RvY29sIHJlY29ubmVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhY2tzIGdldCBwaWdneWJhY2tlZCB3aXRoIG1lc3NhZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV0aGVyID0gbmV3IEV0aGVyKCk7XG5cdFx0Y29uc3QgYSA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQ6IG5ldyBOb2RlU29ja2V0KGV0aGVyLmEpIH0pO1xuXHRcdGNvbnN0IGFNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGEpO1xuXHRcdGNvbnN0IGIgPSBuZXcgUGVyc2lzdGVudFByb3RvY29sKHsgc29ja2V0OiBuZXcgTm9kZVNvY2tldChldGhlci5iKSB9KTtcblx0XHRjb25zdCBiTWVzc2FnZXMgPSBuZXcgTWVzc2FnZVN0cmVhbShiKTtcblxuXHRcdGEuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdhMScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblxuXHRcdGEuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdhMicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblxuXHRcdGEuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdhMycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblxuXHRcdGNvbnN0IGExID0gYXdhaXQgYk1lc3NhZ2VzLndhaXRGb3JPbmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYTEudG9TdHJpbmcoKSwgJ2ExJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudW5hY2tub3dsZWRnZWRDb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cblx0XHRjb25zdCBhMiA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEyLnRvU3RyaW5nKCksICdhMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXG5cdFx0Y29uc3QgYTMgPSBhd2FpdCBiTWVzc2FnZXMud2FpdEZvck9uZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhMy50b1N0cmluZygpLCAnYTMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblxuXHRcdGIuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdiMScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblxuXHRcdGNvbnN0IGIxID0gYXdhaXQgYU1lc3NhZ2VzLndhaXRGb3JPbmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYjEudG9TdHJpbmcoKSwgJ2IxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMSk7XG5cblx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYTQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudW5hY2tub3dsZWRnZWRDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMSk7XG5cblx0XHRjb25zdCBiMiA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIyLnRvU3RyaW5nKCksICdhNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXG5cdFx0YU1lc3NhZ2VzLmRpc3Bvc2UoKTtcblx0XHRiTWVzc2FnZXMuZGlzcG9zZSgpO1xuXHRcdGEuZGlzcG9zZSgpO1xuXHRcdGIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2sgZ2V0cyBzZW50IGFmdGVyIGEgd2hpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9hZEVzdGltYXRvcjogSUxvYWRFc3RpbWF0b3IgPSB7XG5cdFx0XHRcdGhhc0hpZ2hMb2FkOiAoKSA9PiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGV0aGVyID0gbmV3IEV0aGVyKCk7XG5cdFx0XHRjb25zdCBhU29ja2V0ID0gbmV3IE5vZGVTb2NrZXQoZXRoZXIuYSk7XG5cdFx0XHRjb25zdCBhID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogYVNvY2tldCwgbG9hZEVzdGltYXRvciB9KTtcblx0XHRcdGNvbnN0IGFNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGEpO1xuXHRcdFx0Y29uc3QgYlNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGV0aGVyLmIpO1xuXHRcdFx0Y29uc3QgYiA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQ6IGJTb2NrZXQsIGxvYWRFc3RpbWF0b3IgfSk7XG5cdFx0XHRjb25zdCBiTWVzc2FnZXMgPSBuZXcgTWVzc2FnZVN0cmVhbShiKTtcblxuXHRcdFx0Ly8gc2VuZCBvbmUgbWVzc2FnZSBBIC0+IEJcblx0XHRcdGEuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdhMScpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cdFx0XHRjb25zdCBhMSA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYTEudG9TdHJpbmcoKSwgJ2ExJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXG5cdFx0XHQvLyB3YWl0IGZvciBhY2sgdG8gYXJyaXZlIEIgLT4gQVxuXHRcdFx0YXdhaXQgdGltZW91dCgyICogUHJvdG9jb2xDb25zdGFudHMuQWNrbm93bGVkZ2VUaW1lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cblx0XHRcdGFNZXNzYWdlcy5kaXNwb3NlKCk7XG5cdFx0XHRiTWVzc2FnZXMuZGlzcG9zZSgpO1xuXHRcdFx0YS5kaXNwb3NlKCk7XG5cdFx0XHRiLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWVzc2FnZXMgdGhhdCBhcmUgbmV2ZXIgd3JpdHRlbiB0byBhIHNvY2tldCBzaG91bGQgbm90IGNhdXNlIGFuIGFjayB0aW1lb3V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyhcblx0XHRcdHtcblx0XHRcdFx0dXNlRmFrZVRpbWVyczogdHJ1ZSxcblx0XHRcdFx0dXNlU2V0SW1tZWRpYXRlOiB0cnVlLFxuXHRcdFx0XHRtYXhUYXNrQ291bnQ6IDEwMDBcblx0XHRcdH0sXG5cdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIERhdGUubm93KCkgaW4gZmFrZSB0aW1lcnMgc3RhcnRzIGF0IDAsIHdoaWNoIGlzIHZlcnkgaW5jb252ZW5pZW50XG5cdFx0XHRcdC8vIHNpbmNlIHdlIHdhbnQgdG8gdGVzdCBleGFjdGx5IHRoYXQgYSBjZXJ0YWluIGZpZWxkIGlzIG5vdCBpbml0aWFsaXplZCB3aXRoIERhdGUubm93KClcblx0XHRcdFx0Ly8gQXMgYSB3b3JrYXJvdW5kIHdlIHdhaXQgc3VjaCB0aGF0IERhdGUubm93KCkgc3RhcnRzIHByb2R1Y2luZyBtb3JlIHJlYWxpc3RpYyB2YWx1ZXNcblx0XHRcdFx0YXdhaXQgdGltZW91dCg2MCAqIDYwICogMTAwMCk7XG5cblx0XHRcdFx0Y29uc3QgbG9hZEVzdGltYXRvcjogSUxvYWRFc3RpbWF0b3IgPSB7XG5cdFx0XHRcdFx0aGFzSGlnaExvYWQ6ICgpID0+IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGV0aGVyID0gbmV3IEV0aGVyKCk7XG5cdFx0XHRcdGNvbnN0IGFTb2NrZXQgPSBuZXcgTm9kZVNvY2tldChldGhlci5hKTtcblx0XHRcdFx0Y29uc3QgYSA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQ6IGFTb2NrZXQsIGxvYWRFc3RpbWF0b3IsIHNlbmRLZWVwQWxpdmU6IGZhbHNlIH0pO1xuXHRcdFx0XHRjb25zdCBhTWVzc2FnZXMgPSBuZXcgTWVzc2FnZVN0cmVhbShhKTtcblx0XHRcdFx0Y29uc3QgYlNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGV0aGVyLmIpO1xuXHRcdFx0XHRjb25zdCBiID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogYlNvY2tldCwgbG9hZEVzdGltYXRvciwgc2VuZEtlZXBBbGl2ZTogZmFsc2UgfSk7XG5cdFx0XHRcdGNvbnN0IGJNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGIpO1xuXG5cdFx0XHRcdC8vIHNlbmQgbWVzc2FnZSBhMSBiZWZvcmUgcmVjb25uZWN0aW9uIHRvIGdldCBfcmVjdkFja0NoZWNrKCkgc2NoZWR1bGVkXG5cdFx0XHRcdGEuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdhMScpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudW5hY2tub3dsZWRnZWRDb3VudCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXG5cdFx0XHRcdC8vIHJlYWQgbWVzc2FnZSBhMSBhdCBCXG5cdFx0XHRcdGNvbnN0IGExID0gYXdhaXQgYk1lc3NhZ2VzLndhaXRGb3JPbmUoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGExLnRvU3RyaW5nKCksICdhMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cblx0XHRcdFx0Ly8gc2VuZCBtZXNzYWdlIGIxIHRvIHNlbmQgdGhlIGFjayBmb3IgYTFcblx0XHRcdFx0Yi5zZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2IxJykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMSk7XG5cblx0XHRcdFx0Ly8gcmVhZCBtZXNzYWdlIGIxIGF0IEEgdG8gcmVjZWl2ZSB0aGUgYWNrIGZvciBhMVxuXHRcdFx0XHRjb25zdCBiMSA9IGF3YWl0IGFNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiMS50b1N0cmluZygpLCAnYjEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXG5cdFx0XHRcdC8vIGJlZ2luIHJlY29ubmVjdGlvblxuXHRcdFx0XHRhU29ja2V0LmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29uc3QgYVNvY2tldDIgPSBuZXcgTm9kZVNvY2tldChldGhlci5hKTtcblx0XHRcdFx0YS5iZWdpbkFjY2VwdFJlY29ubmVjdGlvbihhU29ja2V0MiwgbnVsbCk7XG5cblx0XHRcdFx0bGV0IHRpbWVvdXRMaXN0ZW5lckNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBzb2NrZXRUaW1lb3V0TGlzdGVuZXIgPSBhLm9uU29ja2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGltZW91dExpc3RlbmVyQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gc2VuZCBtZXNzYWdlIDIgZHVyaW5nIHJlY29ubmVjdGlvblxuXHRcdFx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYTInKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblxuXHRcdFx0XHQvLyB3YWl0IGZvciBzY2hlZHVsZWQgX3JlY3ZBY2tDaGVjaygpIHRvIGV4ZWN1dGVcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyICogUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVvdXRMaXN0ZW5lckNhbGxlZCwgZmFsc2UpO1xuXG5cdFx0XHRcdGEuZW5kQWNjZXB0UmVjb25uZWN0aW9uKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lb3V0TGlzdGVuZXJDYWxsZWQsIGZhbHNlKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDIgKiBQcm90b2NvbENvbnN0YW50cy5UaW1lb3V0VGltZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVvdXRMaXN0ZW5lckNhbGxlZCwgZmFsc2UpO1xuXG5cdFx0XHRcdHNvY2tldFRpbWVvdXRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdGFNZXNzYWdlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGJNZXNzYWdlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGEuZGlzcG9zZSgpO1xuXHRcdFx0XHRiLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2tzIGFyZSBhbHdheXMgc2VudCBhZnRlciBhIHJlY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoXG5cdFx0XHR7XG5cdFx0XHRcdHVzZUZha2VUaW1lcnM6IHRydWUsXG5cdFx0XHRcdHVzZVNldEltbWVkaWF0ZTogdHJ1ZSxcblx0XHRcdFx0bWF4VGFza0NvdW50OiAxMDAwXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGxvYWRFc3RpbWF0b3I6IElMb2FkRXN0aW1hdG9yID0ge1xuXHRcdFx0XHRcdGhhc0hpZ2hMb2FkOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCB3aXJlTGF0ZW5jeSA9IDEwMDA7XG5cdFx0XHRcdGNvbnN0IGV0aGVyID0gbmV3IEV0aGVyKHdpcmVMYXRlbmN5KTtcblx0XHRcdFx0Y29uc3QgYVNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGV0aGVyLmEpO1xuXHRcdFx0XHRjb25zdCBhID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogYVNvY2tldCwgbG9hZEVzdGltYXRvciB9KTtcblx0XHRcdFx0Y29uc3QgYU1lc3NhZ2VzID0gbmV3IE1lc3NhZ2VTdHJlYW0oYSk7XG5cdFx0XHRcdGNvbnN0IGJTb2NrZXQgPSBuZXcgTm9kZVNvY2tldChldGhlci5iKTtcblx0XHRcdFx0Y29uc3QgYiA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQ6IGJTb2NrZXQsIGxvYWRFc3RpbWF0b3IgfSk7XG5cdFx0XHRcdGNvbnN0IGJNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGIpO1xuXG5cdFx0XHRcdC8vIHNlbmQgbWVzc2FnZSBhMSB0byBoYXZlIHNvbWV0aGluZyB1bmFja25vd2xlZGdlZFxuXHRcdFx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYTEnKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblxuXHRcdFx0XHQvLyByZWFkIG1lc3NhZ2UgYTEgYXQgQlxuXHRcdFx0XHRjb25zdCBhMSA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhMS50b1N0cmluZygpLCAnYTEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudW5hY2tub3dsZWRnZWRDb3VudCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXG5cdFx0XHRcdC8vIHdhaXQgZm9yIEIgdG8gc2VuZCBhbiBBQ0sgbWVzc2FnZSxcblx0XHRcdFx0Ly8gYnV0IHJlc3VtZSBiZWZvcmUgQSByZWNlaXZlcyBpdFxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KFByb3RvY29sQ29uc3RhbnRzLkFja25vd2xlZGdlVGltZSArIHdpcmVMYXRlbmN5IC8gMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblxuXHRcdFx0XHQvLyBzaW11bGF0ZSBjb21wbGV0ZSByZWNvbm5lY3Rpb25cblx0XHRcdFx0YVNvY2tldC5kaXNwb3NlKCk7XG5cdFx0XHRcdGJTb2NrZXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRjb25zdCBldGhlcjIgPSBuZXcgRXRoZXIod2lyZUxhdGVuY3kpO1xuXHRcdFx0XHRjb25zdCBhU29ja2V0MiA9IG5ldyBOb2RlU29ja2V0KGV0aGVyMi5hKTtcblx0XHRcdFx0Y29uc3QgYlNvY2tldDIgPSBuZXcgTm9kZVNvY2tldChldGhlcjIuYik7XG5cdFx0XHRcdGIuYmVnaW5BY2NlcHRSZWNvbm5lY3Rpb24oYlNvY2tldDIsIG51bGwpO1xuXHRcdFx0XHRiLmVuZEFjY2VwdFJlY29ubmVjdGlvbigpO1xuXHRcdFx0XHRhLmJlZ2luQWNjZXB0UmVjb25uZWN0aW9uKGFTb2NrZXQyLCBudWxsKTtcblx0XHRcdFx0YS5lbmRBY2NlcHRSZWNvbm5lY3Rpb24oKTtcblxuXHRcdFx0XHQvLyB3YWl0IGZvciBxdWl0ZSBzb21lIHRpbWVcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyICogUHJvdG9jb2xDb25zdGFudHMuQWNrbm93bGVkZ2VUaW1lICsgd2lyZUxhdGVuY3kpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cblx0XHRcdFx0YU1lc3NhZ2VzLmRpc3Bvc2UoKTtcblx0XHRcdFx0Yk1lc3NhZ2VzLmRpc3Bvc2UoKTtcblx0XHRcdFx0YS5kaXNwb3NlKCk7XG5cdFx0XHRcdGIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uU29ja2V0VGltZW91dCBpcyBlbWl0dGVkIGF0IG1vc3Qgb25jZSBldmVyeSAyMHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKFxuXHRcdFx0e1xuXHRcdFx0XHR1c2VGYWtlVGltZXJzOiB0cnVlLFxuXHRcdFx0XHR1c2VTZXRJbW1lZGlhdGU6IHRydWUsXG5cdFx0XHRcdG1heFRhc2tDb3VudDogMTAwMFxuXHRcdFx0fSxcblx0XHRcdGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHRjb25zdCBsb2FkRXN0aW1hdG9yOiBJTG9hZEVzdGltYXRvciA9IHtcblx0XHRcdFx0XHRoYXNIaWdoTG9hZDogKCkgPT4gZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZXRoZXIgPSBuZXcgRXRoZXIoKTtcblx0XHRcdFx0Y29uc3QgYVNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGV0aGVyLmEpO1xuXHRcdFx0XHRjb25zdCBhID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogYVNvY2tldCwgbG9hZEVzdGltYXRvciB9KTtcblx0XHRcdFx0Y29uc3QgYU1lc3NhZ2VzID0gbmV3IE1lc3NhZ2VTdHJlYW0oYSk7XG5cdFx0XHRcdGNvbnN0IGJTb2NrZXQgPSBuZXcgTm9kZVNvY2tldChldGhlci5iKTtcblx0XHRcdFx0Y29uc3QgYiA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQ6IGJTb2NrZXQsIGxvYWRFc3RpbWF0b3IgfSk7XG5cdFx0XHRcdGNvbnN0IGJNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGIpO1xuXG5cdFx0XHRcdC8vIG5ldmVyIHJlY2VpdmUgYWNrc1xuXHRcdFx0XHRiLnBhdXNlU29ja2V0V3JpdGluZygpO1xuXG5cdFx0XHRcdC8vIHNlbmQgbWVzc2FnZSBhMSB0byBoYXZlIHNvbWV0aGluZyB1bmFja25vd2xlZGdlZFxuXHRcdFx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYTEnKSk7XG5cblx0XHRcdFx0Ly8gd2FpdCBmb3IgdGhlIGZpcnN0IHRpbWVvdXQgdG8gZmlyZVxuXHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoYS5vblNvY2tldFRpbWVvdXQpO1xuXG5cdFx0XHRcdGxldCB0aW1lb3V0RmlyZWRBZ2FpbiA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCB0aW1lb3V0TGlzdGVuZXIgPSBhLm9uU29ja2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGltZW91dEZpcmVkQWdhaW4gPSB0cnVlO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBzZW5kIG1vcmUgbWVzc2FnZXNcblx0XHRcdFx0YS5zZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2EyJykpO1xuXHRcdFx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYTMnKSk7XG5cblx0XHRcdFx0Ly8gd2FpdCBmb3IgMTBzXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWUgLyAyKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZW91dEZpcmVkQWdhaW4sIGZhbHNlKTtcblxuXHRcdFx0XHR0aW1lb3V0TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRhTWVzc2FnZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRiTWVzc2FnZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRhLmRpc3Bvc2UoKTtcblx0XHRcdFx0Yi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcGFsaXZlIGRldGVjdHMgZGVhZCBjb25uZWN0aW9uIHdoZW4gbm8gcmVndWxhciBtZXNzYWdlcyBhcmUgcGVuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoXG5cdFx0XHR7XG5cdFx0XHRcdHVzZUZha2VUaW1lcnM6IHRydWUsXG5cdFx0XHRcdHVzZVNldEltbWVkaWF0ZTogdHJ1ZSxcblx0XHRcdFx0bWF4VGFza0NvdW50OiAxMDAwXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGxvYWRFc3RpbWF0b3I6IElMb2FkRXN0aW1hdG9yID0ge1xuXHRcdFx0XHRcdGhhc0hpZ2hMb2FkOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBldGhlciA9IG5ldyBFdGhlcigpO1xuXHRcdFx0XHRjb25zdCBhU29ja2V0ID0gbmV3IE5vZGVTb2NrZXQoZXRoZXIuYSk7XG5cdFx0XHRcdGNvbnN0IGEgPSBuZXcgUGVyc2lzdGVudFByb3RvY29sKHsgc29ja2V0OiBhU29ja2V0LCBsb2FkRXN0aW1hdG9yIH0pO1xuXHRcdFx0XHRjb25zdCBhTWVzc2FnZXMgPSBuZXcgTWVzc2FnZVN0cmVhbShhKTtcblx0XHRcdFx0Y29uc3QgYlNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGV0aGVyLmIpO1xuXHRcdFx0XHRjb25zdCBiID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogYlNvY2tldCwgbG9hZEVzdGltYXRvciB9KTtcblx0XHRcdFx0Y29uc3QgYk1lc3NhZ2VzID0gbmV3IE1lc3NhZ2VTdHJlYW0oYik7XG5cblx0XHRcdFx0Ly8gZXhjaGFuZ2UgYSBtZXNzYWdlIHNvIGJvdGggc2lkZXMgYXJlIGluIGEgZ29vZCBzdGF0ZVxuXHRcdFx0XHRhLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYTEnKSk7XG5cdFx0XHRcdGNvbnN0IGExID0gYXdhaXQgYk1lc3NhZ2VzLndhaXRGb3JPbmUoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGExLnRvU3RyaW5nKCksICdhMScpO1xuXG5cdFx0XHRcdC8vIHdhaXQgZm9yIGFjayB0byBhcnJpdmVcblx0XHRcdFx0YXdhaXQgdGltZW91dChQcm90b2NvbENvbnN0YW50cy5BY2tub3dsZWRnZVRpbWUgKiAyKTtcblxuXHRcdFx0XHQvLyBjb25maXJtIG5vIHVuYWNrbm93bGVkZ2VkIG1lc3NhZ2VzXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXG5cdFx0XHRcdC8vIG5vdyBraWxsIGIncyBhYmlsaXR5IHRvIHNlbmQgYW55dGhpbmcgKHNpbXVsYXRlcyBhIGRlYWQgY29ubmVjdGlvblxuXHRcdFx0XHQvLyB3aGVyZSB0aGUgcmVtb3RlIHNpZGUncyBrZWVwYWxpdmVzIHN0b3AgYXJyaXZpbmcpXG5cdFx0XHRcdGIucGF1c2VTb2NrZXRXcml0aW5nKCk7XG5cblx0XHRcdFx0Ly8gd2FpdCBmb3IgdGltZW91dCB0byBiZSBkZXRlY3RlZCB2aWEga2VlcGFsaXZlXG5cdFx0XHRcdGNvbnN0IHNvY2tldFRpbWVvdXRFdmVudCA9IGF3YWl0IEV2ZW50LnRvUHJvbWlzZShhLm9uU29ja2V0VGltZW91dCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvY2tldFRpbWVvdXRFdmVudC5yZWFzb24sIFNvY2tldFRpbWVvdXRSZWFzb24uS0VFUF9BTElWRSk7XG5cdFx0XHRcdGFzc2VydC5vayhzb2NrZXRUaW1lb3V0RXZlbnQudGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGEgPj0gUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWUpO1xuXHRcdFx0XHQvLyBubyByZWd1bGFyIG1lc3NhZ2VzIHdlcmUgcGVuZGluZ1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc29ja2V0VGltZW91dEV2ZW50LnVuYWNrbm93bGVkZ2VkTXNnQ291bnQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc29ja2V0VGltZW91dEV2ZW50LnRpbWVTaW5jZU9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFNZXNzYWdlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGJNZXNzYWdlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGEuZGlzcG9zZSgpO1xuXHRcdFx0XHRiLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0aW5nIGNhbiBiZSBwYXVzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9hZEVzdGltYXRvcjogSUxvYWRFc3RpbWF0b3IgPSB7XG5cdFx0XHRcdGhhc0hpZ2hMb2FkOiAoKSA9PiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGV0aGVyID0gbmV3IEV0aGVyKCk7XG5cdFx0XHRjb25zdCBhU29ja2V0ID0gbmV3IE5vZGVTb2NrZXQoZXRoZXIuYSk7XG5cdFx0XHRjb25zdCBhID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogYVNvY2tldCwgbG9hZEVzdGltYXRvciB9KTtcblx0XHRcdGNvbnN0IGFNZXNzYWdlcyA9IG5ldyBNZXNzYWdlU3RyZWFtKGEpO1xuXHRcdFx0Y29uc3QgYlNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGV0aGVyLmIpO1xuXHRcdFx0Y29uc3QgYiA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQ6IGJTb2NrZXQsIGxvYWRFc3RpbWF0b3IgfSk7XG5cdFx0XHRjb25zdCBiTWVzc2FnZXMgPSBuZXcgTWVzc2FnZVN0cmVhbShiKTtcblxuXHRcdFx0Ly8gc2VuZCBvbmUgbWVzc2FnZSBBIC0+IEJcblx0XHRcdGEuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdhMScpKTtcblx0XHRcdGNvbnN0IGExID0gYXdhaXQgYk1lc3NhZ2VzLndhaXRGb3JPbmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhMS50b1N0cmluZygpLCAnYTEnKTtcblxuXHRcdFx0Ly8gYXNrIEEgdG8gcGF1c2Ugd3JpdGluZ1xuXHRcdFx0Yi5zZW5kUGF1c2UoKTtcblxuXHRcdFx0Ly8gc2VuZCBhIG1lc3NhZ2UgQiAtPiBBXG5cdFx0XHRiLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnYjEnKSk7XG5cdFx0XHRjb25zdCBiMSA9IGF3YWl0IGFNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYjEudG9TdHJpbmcoKSwgJ2IxJyk7XG5cblx0XHRcdC8vIHNlbmQgYSBtZXNzYWdlIEEgLT4gQiAodGhpcyBzaG91bGQgYmUgYmxvY2tlZCBhdCBBKVxuXHRcdFx0YS5zZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2EyJykpO1xuXG5cdFx0XHQvLyB3YWl0IGEgbG9uZyB0aW1lIGFuZCBjaGVjayB0aGF0IG5vdCBldmVuIGFja3MgYXJlIHdyaXR0ZW5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMiAqIFByb3RvY29sQ29uc3RhbnRzLkFja25vd2xlZGdlVGltZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS51bmFja25vd2xlZGdlZENvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnVuYWNrbm93bGVkZ2VkQ291bnQsIDEpO1xuXG5cdFx0XHQvLyBhc2sgQSB0byByZXN1bWUgd3JpdGluZ1xuXHRcdFx0Yi5zZW5kUmVzdW1lKCk7XG5cblx0XHRcdC8vIGNoZWNrIHRoYXQgQiByZWNlaXZlcyBtZXNzYWdlXG5cdFx0XHRjb25zdCBhMiA9IGF3YWl0IGJNZXNzYWdlcy53YWl0Rm9yT25lKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYTIudG9TdHJpbmcoKSwgJ2EyJyk7XG5cblx0XHRcdC8vIHdhaXQgYSBsb25nIHRpbWUgYW5kIGNoZWNrIHRoYXQgYWNrcyBhcmUgd3JpdHRlblxuXHRcdFx0YXdhaXQgdGltZW91dCgyICogUHJvdG9jb2xDb25zdGFudHMuQWNrbm93bGVkZ2VUaW1lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVuYWNrbm93bGVkZ2VkQ291bnQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudW5hY2tub3dsZWRnZWRDb3VudCwgMCk7XG5cblx0XHRcdGFNZXNzYWdlcy5kaXNwb3NlKCk7XG5cdFx0XHRiTWVzc2FnZXMuZGlzcG9zZSgpO1xuXHRcdFx0YS5kaXNwb3NlKCk7XG5cdFx0XHRiLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZmxha3lTdWl0ZSgnSVBDLCBjcmVhdGUgaGFuZGxlJywgKCkgPT4ge1xuXG5cdHRlc3QoJ2NyZWF0ZVJhbmRvbUlQQ0hhbmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdElQQ0hhbmRsZShjcmVhdGVSYW5kb21JUENIYW5kbGUoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVN0YXRpY0lQQ0hhbmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdElQQ0hhbmRsZShjcmVhdGVTdGF0aWNJUENIYW5kbGUodG1wZGlyKCksICd0ZXN0JywgJzEuNjQuMCcpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdElQQ0hhbmRsZShoYW5kbGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBwaXBlTmFtZSA9IGNyZWF0ZVJhbmRvbUlQQ0hhbmRsZSgpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoKTtcblxuXHRcdFx0c2VydmVyLm9uKCdlcnJvcicsICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHNlcnZlci5jbG9zZSgoKSA9PiByZWplY3QoKSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNlcnZlci5saXN0ZW4ocGlwZU5hbWUsICgpID0+IHtcblx0XHRcdFx0c2VydmVyLnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIHJlamVjdCk7XG5cblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHtcblx0XHRcdFx0XHRzZXJ2ZXIuY2xvc2UoKCkgPT4gcmVzb2x2ZSgpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG59KTtcblxuc3VpdGUoJ1dlYlNvY2tldE5vZGVTb2NrZXQnLCAoKSA9PiB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0b1VpbnQ4QXJyYXkoZGF0YTogbnVtYmVyW10pOiBVaW50OEFycmF5IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDhBcnJheShkYXRhLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZXN1bHRbaV0gPSBkYXRhW2ldO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZnVuY3Rpb24gZnJvbVVpbnQ4QXJyYXkoZGF0YTogVWludDhBcnJheSk6IG51bWJlcltdIHtcblx0XHRjb25zdCByZXN1bHQgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJlc3VsdFtpXSA9IGRhdGFbaV07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRmdW5jdGlvbiBmcm9tQ2hhckNvZGVBcnJheShkYXRhOiBudW1iZXJbXSk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoZGF0YVtpXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRjbGFzcyBGYWtlTm9kZVNvY2tldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EYXRhID0gbmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCk7XG5cdFx0cHVibGljIHJlYWRvbmx5IG9uRGF0YSA9IHRoaXMuX29uRGF0YS5ldmVudDtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uQ2xvc2UgPSBuZXcgRW1pdHRlcjxTb2NrZXRDbG9zZUV2ZW50PigpO1xuXHRcdHB1YmxpYyByZWFkb25seSBvbkNsb3NlID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblxuXHRcdHB1YmxpYyB3cml0dGVuRGF0YTogVlNCdWZmZXJbXSA9IFtdO1xuXG5cdFx0cHVibGljIHRyYWNlU29ja2V0RXZlbnQodHlwZTogU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUsIGRhdGE/OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldyB8IGFueSk6IHZvaWQge1xuXHRcdH1cblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgd3JpdGUoZGF0YTogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRcdHRoaXMud3JpdHRlbkRhdGEucHVzaChkYXRhKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgZmlyZURhdGEoZGF0YTogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRcdHRoaXMuX29uRGF0YS5maXJlKFZTQnVmZmVyLndyYXAodG9VaW50OEFycmF5KGRhdGEpKSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlYWRpbmcoZnJhbWVzOiBudW1iZXJbXVtdLCBwZXJtZXNzYWdlRGVmbGF0ZTogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gbmV3IEZha2VOb2RlU29ja2V0KCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3Qgd2ViU29ja2V0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBXZWJTb2NrZXROb2RlU29ja2V0KDxhbnk+c29ja2V0LCBwZXJtZXNzYWdlRGVmbGF0ZSwgbnVsbCwgZmFsc2UpKTtcblxuXHRcdGNvbnN0IGJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdGxldCByZW1haW5pbmdGcmFtZUNvdW50ID0gZnJhbWVzLmxlbmd0aDtcblxuXHRcdGxldCByZWNlaXZlZERhdGE6IHN0cmluZyA9ICcnO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3ZWJTb2NrZXQub25EYXRhKChidWZmKSA9PiB7XG5cdFx0XHRyZWNlaXZlZERhdGEgKz0gZnJvbUNoYXJDb2RlQXJyYXkoZnJvbVVpbnQ4QXJyYXkoYnVmZi5idWZmZXIpKTtcblx0XHRcdHJlbWFpbmluZ0ZyYW1lQ291bnQtLTtcblx0XHRcdGlmIChyZW1haW5pbmdGcmFtZUNvdW50ID09PSAwKSB7XG5cdFx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZnJhbWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzb2NrZXQuZmlyZURhdGEoZnJhbWVzW2ldKTtcblx0XHR9XG5cblx0XHRhd2FpdCBiYXJyaWVyLndhaXQoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHJldHVybiByZWNlaXZlZERhdGE7XG5cdH1cblxuXHR0ZXN0KCdBIHNpbmdsZS1mcmFtZSB1bm1hc2tlZCB0ZXh0IG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnJhbWVzID0gW1xuXHRcdFx0WzB4ODEsIDB4MDUsIDB4NDgsIDB4NjUsIDB4NmMsIDB4NmMsIDB4NmZdIC8vIGNvbnRhaW5zIFwiSGVsbG9cIlxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdFJlYWRpbmcoZnJhbWVzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsICdIZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdBIHNpbmdsZS1mcmFtZSBtYXNrZWQgdGV4dCBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZyYW1lcyA9IFtcblx0XHRcdFsweDgxLCAweDg1LCAweDM3LCAweGZhLCAweDIxLCAweDNkLCAweDdmLCAweDlmLCAweDRkLCAweDUxLCAweDU4XSAvLyBjb250YWlucyBcIkhlbGxvXCJcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RSZWFkaW5nKGZyYW1lcywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCAnSGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnQSBmcmFnbWVudGVkIHVubWFza2VkIHRleHQgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBjb250YWlucyBcIkhlbGxvXCJcblx0XHRjb25zdCBmcmFtZXMgPSBbXG5cdFx0XHRbMHgwMSwgMHgwMywgMHg0OCwgMHg2NSwgMHg2Y10sIC8vIGNvbnRhaW5zIFwiSGVsXCJcblx0XHRcdFsweDgwLCAweDAyLCAweDZjLCAweDZmXSwgLy8gY29udGFpbnMgXCJsb1wiXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0UmVhZGluZyhmcmFtZXMsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgJ0hlbGxvJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wcmVzc2lvbicsICgpID0+IHtcblx0XHR0ZXN0KCdBIHNpbmdsZS1mcmFtZSBjb21wcmVzc2VkIHRleHQgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIGNvbnRhaW5zIFwiSGVsbG9cIlxuXHRcdFx0Y29uc3QgZnJhbWVzID0gW1xuXHRcdFx0XHRbMHhjMSwgMHgwNywgMHhmMiwgMHg0OCwgMHhjZCwgMHhjOSwgMHhjOSwgMHgwNywgMHgwMF0sIC8vIGNvbnRhaW5zIFwiSGVsbG9cIlxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RSZWFkaW5nKGZyYW1lcywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgJ0hlbGxvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRSZWNvcmRJbmZsYXRlQnl0ZXMoZmFsc2UpIGNsZWFycyBhbmQgc3RvcHMgcmVjb3JkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VOb2RlU29ja2V0KCkpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRjb25zdCB3ZWJTb2NrZXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFdlYlNvY2tldE5vZGVTb2NrZXQoPGFueT5zb2NrZXQsIHRydWUsIG51bGwsIHRydWUpKTtcblxuXHRcdFx0Y29uc3QgY29tcHJlc3NlZEhlbGxvRnJhbWUgPSBbMHhjMSwgMHgwNywgMHhmMiwgMHg0OCwgMHhjZCwgMHhjOSwgMHhjOSwgMHgwNywgMHgwMF07XG5cdFx0XHRjb25zdCB3YWl0Rm9yT25lRGF0YSA9ICgpID0+IG5ldyBQcm9taXNlPFZTQnVmZmVyPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgZCA9IHdlYlNvY2tldC5vbkRhdGEoZGF0YSA9PiB7XG5cdFx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZShkYXRhKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZmlyc3RQcm9taXNlID0gd2FpdEZvck9uZURhdGEoKTtcblx0XHRcdHNvY2tldC5maXJlRGF0YShjb21wcmVzc2VkSGVsbG9GcmFtZSk7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGZpcnN0UHJvbWlzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcm9tQ2hhckNvZGVBcnJheShmcm9tVWludDhBcnJheShmaXJzdC5idWZmZXIpKSwgJ0hlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2sod2ViU29ja2V0LnJlY29yZGVkSW5mbGF0ZUJ5dGVzLmJ5dGVMZW5ndGggPiAwKTtcblxuXHRcdFx0d2ViU29ja2V0LnNldFJlY29yZEluZmxhdGVCeXRlcyhmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2ViU29ja2V0LnJlY29yZGVkSW5mbGF0ZUJ5dGVzLmJ5dGVMZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCBzZWNvbmRQcm9taXNlID0gd2FpdEZvck9uZURhdGEoKTtcblx0XHRcdHNvY2tldC5maXJlRGF0YShjb21wcmVzc2VkSGVsbG9GcmFtZSk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzZWNvbmRQcm9taXNlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyb21DaGFyQ29kZUFycmF5KGZyb21VaW50OEFycmF5KHNlY29uZC5idWZmZXIpKSwgJ0hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2ViU29ja2V0LnJlY29yZGVkSW5mbGF0ZUJ5dGVzLmJ5dGVMZW5ndGgsIDApO1xuXG5cdFx0XHR3ZWJTb2NrZXQuc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdlYlNvY2tldC5yZWNvcmRlZEluZmxhdGVCeXRlcy5ieXRlTGVuZ3RoLCAwKTtcblxuXHRcdFx0Y29uc3QgdGhpcmRQcm9taXNlID0gd2FpdEZvck9uZURhdGEoKTtcblx0XHRcdHNvY2tldC5maXJlRGF0YShjb21wcmVzc2VkSGVsbG9GcmFtZSk7XG5cdFx0XHRjb25zdCB0aGlyZCA9IGF3YWl0IHRoaXJkUHJvbWlzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcm9tQ2hhckNvZGVBcnJheShmcm9tVWludDhBcnJheSh0aGlyZC5idWZmZXIpKSwgJ0hlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2sod2ViU29ja2V0LnJlY29yZGVkSW5mbGF0ZUJ5dGVzLmJ5dGVMZW5ndGggPiAwKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQSBmcmFnbWVudGVkIGNvbXByZXNzZWQgdGV4dCBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gY29udGFpbnMgXCJIZWxsb1wiXG5cdFx0XHRjb25zdCBmcmFtZXMgPSBbICAvLyBjb250YWlucyBcIkhlbGxvXCJcblx0XHRcdFx0WzB4NDEsIDB4MDMsIDB4ZjIsIDB4NDgsIDB4Y2RdLFxuXHRcdFx0XHRbMHg4MCwgMHgwNCwgMHhjOSwgMHhjOSwgMHgwNywgMHgwMF1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0UmVhZGluZyhmcmFtZXMsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsICdIZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQSBzaW5nbGUtZnJhbWUgbm9uLWNvbXByZXNzZWQgdGV4dCBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZnJhbWVzID0gW1xuXHRcdFx0XHRbMHg4MSwgMHgwNSwgMHg0OCwgMHg2NSwgMHg2YywgMHg2YywgMHg2Zl0gLy8gY29udGFpbnMgXCJIZWxsb1wiXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdFJlYWRpbmcoZnJhbWVzLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCAnSGVsbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0Egc2luZ2xlLWZyYW1lIGNvbXByZXNzZWQgdGV4dCBtZXNzYWdlIGZvbGxvd2VkIGJ5IGEgc2luZ2xlLWZyYW1lIG5vbi1jb21wcmVzc2VkIHRleHQgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZyYW1lcyA9IFtcblx0XHRcdFx0WzB4YzEsIDB4MDcsIDB4ZjIsIDB4NDgsIDB4Y2QsIDB4YzksIDB4YzksIDB4MDcsIDB4MDBdLCAvLyBjb250YWlucyBcIkhlbGxvXCJcblx0XHRcdFx0WzB4ODEsIDB4MDUsIDB4NzcsIDB4NmYsIDB4NzIsIDB4NmMsIDB4NjRdIC8vIGNvbnRhaW5zIFwid29ybGRcIlxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RSZWFkaW5nKGZyYW1lcywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgJ0hlbGxvd29ybGQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTGFyZ2UgYnVmZmVycyBhcmUgc3BsaXQgYW5kIHNlbnQgaW4gY2h1bmtzJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0bGV0IHJlY2VpdmluZ1NpZGVPbkRhdGFDYWxsQ291bnQgPSAwO1xuXHRcdGxldCByZWNlaXZpbmdTaWRlVG90YWxCeXRlcyA9IDA7XG5cdFx0Y29uc3QgcmVjZWl2aW5nU2lkZVNvY2tldENsb3NlZEJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgbGlzdGVuT25SYW5kb21Qb3J0KChzb2NrZXQpID0+IHtcblx0XHRcdC8vIHN0b3AgdGhlIHNlcnZlciB3aGVuIHRoZSBmaXJzdCBjb25uZWN0aW9uIGlzIHJlY2VpdmVkXG5cdFx0XHRzZXJ2ZXIuY2xvc2UoKTtcblxuXHRcdFx0Y29uc3Qgd2ViU29ja2V0Tm9kZVNvY2tldCA9IG5ldyBXZWJTb2NrZXROb2RlU29ja2V0KG5ldyBOb2RlU29ja2V0KHNvY2tldCksIHRydWUsIG51bGwsIGZhbHNlKTtcblx0XHRcdGRzLmFkZCh3ZWJTb2NrZXROb2RlU29ja2V0Lm9uRGF0YSgoZGF0YSkgPT4ge1xuXHRcdFx0XHRyZWNlaXZpbmdTaWRlT25EYXRhQ2FsbENvdW50Kys7XG5cdFx0XHRcdHJlY2VpdmluZ1NpZGVUb3RhbEJ5dGVzICs9IGRhdGEuYnl0ZUxlbmd0aDtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZHMuYWRkKHdlYlNvY2tldE5vZGVTb2NrZXQub25DbG9zZSgoKSA9PiB7XG5cdFx0XHRcdHdlYlNvY2tldE5vZGVTb2NrZXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWNlaXZpbmdTaWRlU29ja2V0Q2xvc2VkQmFycmllci5vcGVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzb2NrZXQgPSBjb25uZWN0KHtcblx0XHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdFx0cG9ydDogKDxBZGRyZXNzSW5mbz5zZXJ2ZXIuYWRkcmVzcygpKS5wb3J0XG5cdFx0fSk7XG5cblx0XHRjb25zdCBidWZmID0gZ2VuZXJhdGVSYW5kb21CdWZmZXIoMSAqIDEwMjQgKiAxMDI0KTtcblxuXHRcdGNvbnN0IHdlYlNvY2tldE5vZGVTb2NrZXQgPSBuZXcgV2ViU29ja2V0Tm9kZVNvY2tldChuZXcgTm9kZVNvY2tldChzb2NrZXQpLCB0cnVlLCBudWxsLCBmYWxzZSk7XG5cdFx0d2ViU29ja2V0Tm9kZVNvY2tldC53cml0ZShidWZmKTtcblx0XHRhd2FpdCB3ZWJTb2NrZXROb2RlU29ja2V0LmRyYWluKCk7XG5cdFx0d2ViU29ja2V0Tm9kZVNvY2tldC5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgcmVjZWl2aW5nU2lkZVNvY2tldENsb3NlZEJhcnJpZXIud2FpdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmluZ1NpZGVUb3RhbEJ5dGVzLCBidWZmLmJ5dGVMZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZpbmdTaWRlT25EYXRhQ2FsbENvdW50LCA0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE5NDI4NDogcGluZy9wb25nIG9wY29kZXMgYXJlIHN1cHBvcnRlZCcsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNvY2tldCA9IG5ldyBGYWtlTm9kZVNvY2tldCgpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHdlYlNvY2tldCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgV2ViU29ja2V0Tm9kZVNvY2tldCg8YW55PnNvY2tldCwgZmFsc2UsIG51bGwsIGZhbHNlKSk7XG5cblx0XHRsZXQgcmVjZWl2ZWREYXRhOiBzdHJpbmcgPSAnJztcblx0XHRkaXNwb3NhYmxlcy5hZGQod2ViU29ja2V0Lm9uRGF0YSgoYnVmZikgPT4ge1xuXHRcdFx0cmVjZWl2ZWREYXRhICs9IGZyb21DaGFyQ29kZUFycmF5KGZyb21VaW50OEFycmF5KGJ1ZmYuYnVmZmVyKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQSBzaW5nbGUtZnJhbWUgbm9uLWNvbXByZXNzZWQgdGV4dCBtZXNzYWdlIHRoYXQgY29udGFpbnMgXCJIZWxsb1wiXG5cdFx0c29ja2V0LmZpcmVEYXRhKFsweDgxLCAweDA1LCAweDQ4LCAweDY1LCAweDZjLCAweDZjLCAweDZmXSk7XG5cblx0XHQvLyBBIHBpbmcgbWVzc2FnZSB0aGF0IGNvbnRhaW5zIFwiZGF0YVwiXG5cdFx0c29ja2V0LmZpcmVEYXRhKFsweDg5LCAweDA0LCAweDY0LCAweDYxLCAweDc0LCAweDYxXSk7XG5cblx0XHQvLyBBbm90aGVyIHNpbmdsZS1mcmFtZSBub24tY29tcHJlc3NlZCB0ZXh0IG1lc3NhZ2UgdGhhdCBjb250YWlucyBcIkhlbGxvXCJcblx0XHRzb2NrZXQuZmlyZURhdGEoWzB4ODEsIDB4MDUsIDB4NDgsIDB4NjUsIDB4NmMsIDB4NmMsIDB4NmZdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZERhdGEsICdIZWxsb0hlbGxvJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNvY2tldC53cml0dGVuRGF0YS5tYXAoeCA9PiBmcm9tVWludDhBcnJheSh4LmJ1ZmZlcikpLFxuXHRcdFx0W1xuXHRcdFx0XHQvLyBBIHBvbmcgbWVzc2FnZSB0aGF0IGNvbnRhaW5zIFwiZGF0YVwiXG5cdFx0XHRcdFsweDhBLCAweDA0LCAweDY0LCAweDYxLCAweDc0LCAweDYxXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRyZXR1cm4gcmVjZWl2ZWREYXRhO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBnZW5lcmF0ZVJhbmRvbUJ1ZmZlcihzaXplOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgYnVmZiA9IFZTQnVmZmVyLmFsbG9jKHNpemUpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2l6ZTsgaSsrKSB7XG5cdFx0XHRidWZmLndyaXRlVUludDgoTWF0aC5mbG9vcigyNTYgKiBNYXRoLnJhbmRvbSgpKSwgaSk7XG5cdFx0fVxuXHRcdHJldHVybiBidWZmO1xuXHR9XG5cblx0ZnVuY3Rpb24gbGlzdGVuT25SYW5kb21Qb3J0KGhhbmRsZXI6IChzb2NrZXQ6IFNvY2tldCkgPT4gdm9pZCk6IFByb21pc2U8U2VydmVyPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZVNlcnZlcihoYW5kbGVyKS5saXN0ZW4oMCk7XG5cdFx0XHRzZXJ2ZXIub24oJ2xpc3RlbmluZycsICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZShzZXJ2ZXIpO1xuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIub24oJ2Vycm9yJywgKGVycikgPT4ge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixPQUFPLFdBQVc7QUFDbEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBc0IsU0FBUyxvQkFBb0M7QUFDbkUsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQXlCLG9CQUFvQixVQUFVLG1CQUFpRSwyQkFBMkI7QUFDbkosU0FBUyx1QkFBdUIsdUJBQXVCLFlBQVksMkJBQTJCO0FBQzlGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sc0JBQXNCLFdBQVc7QUFBQSxFQUt0QyxZQUFZLEdBQWtDO0FBQzdDLFVBQU07QUFDTixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLFlBQVksQ0FBQztBQUNsQixTQUFLLFVBQVUsRUFBRSxVQUFVLFVBQVE7QUFDbEMsV0FBSyxVQUFVLEtBQUss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
