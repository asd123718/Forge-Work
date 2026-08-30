import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ProxyIdentifier, SerializableObjectWithBuffers } from "../../common/proxyIdentifier.js";
import { RPCProtocol } from "../../common/rpcProtocol.js";
suite("RPCProtocol", () => {
  let disposables;
  class MessagePassingProtocol {
    constructor() {
      this._onMessage = new Emitter();
      this.onMessage = this._onMessage.event;
    }
    setPair(other) {
      this._pair = other;
    }
    send(buffer) {
      Promise.resolve().then(() => {
        this._pair._onMessage.fire(buffer);
      });
    }
  }
  let delegate;
  let bProxy;
  let bProtocol;
  class BClass {
    $m(a1, a2) {
      return Promise.resolve(delegate.call(null, a1, a2));
    }
  }
  setup(() => {
    disposables = new DisposableStore();
    const a_protocol = new MessagePassingProtocol();
    const b_protocol = new MessagePassingProtocol();
    a_protocol.setPair(b_protocol);
    b_protocol.setPair(a_protocol);
    const A = disposables.add(new RPCProtocol(a_protocol));
    bProtocol = disposables.add(new RPCProtocol(b_protocol));
    const bIdentifier = new ProxyIdentifier("bb");
    const bInstance = new BClass();
    bProtocol.set(bIdentifier, bInstance);
    bProxy = A.getProxy(bIdentifier);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("simple call", function(done) {
    delegate = (a1, a2) => a1 + a2;
    bProxy.$m(4, 1).then((res) => {
      assert.strictEqual(res, 5);
      done(null);
    }, done);
  });
  test("simple call without result", function(done) {
    delegate = (a1, a2) => {
    };
    bProxy.$m(4, 1).then((res) => {
      assert.strictEqual(res, void 0);
      done(null);
    }, done);
  });
  test("passing buffer as argument", function(done) {
    delegate = (a1, a2) => {
      assert.ok(a1 instanceof VSBuffer);
      return a1.buffer[a2];
    };
    const b = VSBuffer.alloc(4);
    b.buffer[0] = 1;
    b.buffer[1] = 2;
    b.buffer[2] = 3;
    b.buffer[3] = 4;
    bProxy.$m(b, 2).then((res) => {
      assert.strictEqual(res, 3);
      done(null);
    }, done);
  });
  test("returning a buffer", function(done) {
    delegate = (a1, a2) => {
      const b = VSBuffer.alloc(4);
      b.buffer[0] = 1;
      b.buffer[1] = 2;
      b.buffer[2] = 3;
      b.buffer[3] = 4;
      return b;
    };
    bProxy.$m(4, 1).then((res) => {
      assert.ok(res instanceof VSBuffer);
      assert.strictEqual(res.buffer[0], 1);
      assert.strictEqual(res.buffer[1], 2);
      assert.strictEqual(res.buffer[2], 3);
      assert.strictEqual(res.buffer[3], 4);
      done(null);
    }, done);
  });
  test("cancelling a call via CancellationToken before", function(done) {
    delegate = (a1, a2) => a1 + a2;
    const p = bProxy.$m(4, CancellationToken.Cancelled);
    p.then((res) => {
      assert.fail("should not receive result");
    }, (err) => {
      assert.ok(true);
      done(null);
    });
  });
  test("passing CancellationToken.None", function(done) {
    delegate = (a1, token) => {
      assert.ok(!!token);
      return a1 + 1;
    };
    bProxy.$m(4, CancellationToken.None).then((res) => {
      assert.strictEqual(res, 5);
      done(null);
    }, done);
  });
  test("cancelling a call via CancellationToken quickly", function(done) {
    delegate = (a1, token) => {
      return new Promise((resolve, reject) => {
        const disposable = token.onCancellationRequested((e) => {
          disposable.dispose();
          resolve(7);
        });
      });
    };
    const tokenSource = new CancellationTokenSource();
    const p = bProxy.$m(4, tokenSource.token);
    p.then((res) => {
      assert.strictEqual(res, 7);
    }, (err) => {
      assert.fail("should not receive error");
    }).finally(done);
    tokenSource.cancel();
  });
  test("releases cancellation handler when the invoked call does not settle", async function() {
    let resolveRemoteToken;
    const remoteToken = new Promise((resolve) => resolveRemoteToken = resolve);
    delegate = (_a1, token2) => {
      resolveRemoteToken(token2);
      return new Promise(() => {
      });
    };
    const tokenSource = disposables.add(new CancellationTokenSource());
    void bProxy.$m(4, tokenSource.token);
    const token = await remoteToken;
    const cancellationRequested = new Promise((resolve) => {
      disposables.add(token.onCancellationRequested(() => resolve()));
    });
    tokenSource.cancel();
    await cancellationRequested;
    const cancelInvokedHandlers = Reflect.get(bProtocol, "_cancelInvokedHandlers");
    assert.deepStrictEqual(Object.keys(cancelInvokedHandlers), []);
  });
  test("does not track uncancellable calls that do not settle", async function() {
    let resolveInvoked;
    const invoked = new Promise((resolve) => resolveInvoked = resolve);
    delegate = () => {
      resolveInvoked();
      return new Promise(() => {
      });
    };
    void bProxy.$m(4, 1);
    await invoked;
    const cancelInvokedHandlers = Reflect.get(bProtocol, "_cancelInvokedHandlers");
    assert.deepStrictEqual(Object.keys(cancelInvokedHandlers), []);
  });
  test("throwing an error", function(done) {
    delegate = (a1, a2) => {
      throw new Error(`nope`);
    };
    bProxy.$m(4, 1).then((res) => {
      assert.fail("unexpected");
    }, (err) => {
      assert.strictEqual(err.message, "nope");
    }).finally(done);
  });
  test("error promise", function(done) {
    delegate = (a1, a2) => {
      return Promise.reject(void 0);
    };
    bProxy.$m(4, 1).then((res) => {
      assert.fail("unexpected");
    }, (err) => {
      assert.strictEqual(err, void 0);
    }).finally(done);
  });
  test("issue #60450: Converting circular structure to JSON", function(done) {
    delegate = (a1, a2) => {
      const circular = {};
      circular.self = circular;
      return circular;
    };
    bProxy.$m(4, 1).then((res) => {
      assert.strictEqual(res, null);
    }, (err) => {
      assert.fail("unexpected");
    }).finally(done);
  });
  test("issue #72798: null errors are hard to digest", function(done) {
    delegate = (a1, a2) => {
      throw { "what": "what" };
    };
    bProxy.$m(4, 1).then((res) => {
      assert.fail("unexpected");
    }, (err) => {
      assert.strictEqual(err.what, "what");
    }).finally(done);
  });
  test("undefined arguments arrive as null", function() {
    delegate = (a1, a2) => {
      assert.strictEqual(typeof a1, "undefined");
      assert.strictEqual(a2, null);
      return 7;
    };
    return bProxy.$m(void 0, null).then((res) => {
      assert.strictEqual(res, 7);
    });
  });
  test("issue #81424: SerializeRequest should throw if an argument can not be serialized", () => {
    const badObject = {};
    badObject.loop = badObject;
    assert.throws(() => {
      bProxy.$m(badObject, "2");
    });
  });
  test("SerializableObjectWithBuffers is correctly transfered", function(done) {
    delegate = (a1, a2) => {
      return new SerializableObjectWithBuffers({ string: a1.value.string + " world", buff: a1.value.buff });
    };
    const b = VSBuffer.alloc(4);
    b.buffer[0] = 1;
    b.buffer[1] = 2;
    b.buffer[2] = 3;
    b.buffer[3] = 4;
    bProxy.$m(new SerializableObjectWithBuffers({ string: "hello", buff: b }), void 0).then((res) => {
      assert.ok(res instanceof SerializableObjectWithBuffers);
      assert.strictEqual(res.value.string, "hello world");
      assert.ok(res.value.buff instanceof VSBuffer);
      const bufferValues = Array.from(res.value.buff.buffer);
      assert.strictEqual(bufferValues[0], 1);
      assert.strictEqual(bufferValues[1], 2);
      assert.strictEqual(bufferValues[2], 3);
      assert.strictEqual(bufferValues[3], 4);
      done(null);
    }, done);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFx0ZXN0XFxjb21tb25cXHJwY1Byb3RvY29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUHJveHlJZGVudGlmaWVyLCBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgUlBDUHJvdG9jb2wgfSBmcm9tICcuLi8uLi9jb21tb24vcnBjUHJvdG9jb2wuanMnO1xuXG5zdWl0ZSgnUlBDUHJvdG9jb2wnLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0Y2xhc3MgTWVzc2FnZVBhc3NpbmdQcm90b2NvbCBpbXBsZW1lbnRzIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblx0XHRwcml2YXRlIF9wYWlyPzogTWVzc2FnZVBhc3NpbmdQcm90b2NvbDtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IG5ldyBFbWl0dGVyPFZTQnVmZmVyPigpO1xuXHRcdHB1YmxpYyByZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFZTQnVmZmVyPiA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblxuXHRcdHB1YmxpYyBzZXRQYWlyKG90aGVyOiBNZXNzYWdlUGFzc2luZ1Byb3RvY29sKSB7XG5cdFx0XHR0aGlzLl9wYWlyID0gb3RoZXI7XG5cdFx0fVxuXG5cdFx0cHVibGljIHNlbmQoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3BhaXIhLl9vbk1lc3NhZ2UuZmlyZShidWZmZXIpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGRlbGVnYXRlOiAoYTE6IGFueSwgYTI6IGFueSkgPT4gYW55O1xuXHRsZXQgYlByb3h5OiBCQ2xhc3M7XG5cdGxldCBiUHJvdG9jb2w6IFJQQ1Byb3RvY29sO1xuXHRjbGFzcyBCQ2xhc3Mge1xuXHRcdCRtKGExOiBhbnksIGEyOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkZWxlZ2F0ZS5jYWxsKG51bGwsIGExLCBhMikpO1xuXHRcdH1cblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGFfcHJvdG9jb2wgPSBuZXcgTWVzc2FnZVBhc3NpbmdQcm90b2NvbCgpO1xuXHRcdGNvbnN0IGJfcHJvdG9jb2wgPSBuZXcgTWVzc2FnZVBhc3NpbmdQcm90b2NvbCgpO1xuXHRcdGFfcHJvdG9jb2wuc2V0UGFpcihiX3Byb3RvY29sKTtcblx0XHRiX3Byb3RvY29sLnNldFBhaXIoYV9wcm90b2NvbCk7XG5cblx0XHRjb25zdCBBID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSUENQcm90b2NvbChhX3Byb3RvY29sKSk7XG5cdFx0YlByb3RvY29sID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSUENQcm90b2NvbChiX3Byb3RvY29sKSk7XG5cblx0XHRjb25zdCBiSWRlbnRpZmllciA9IG5ldyBQcm94eUlkZW50aWZpZXI8QkNsYXNzPignYmInKTtcblx0XHRjb25zdCBiSW5zdGFuY2UgPSBuZXcgQkNsYXNzKCk7XG5cdFx0YlByb3RvY29sLnNldChiSWRlbnRpZmllciwgYkluc3RhbmNlKTtcblx0XHRiUHJveHkgPSBBLmdldFByb3h5KGJJZGVudGlmaWVyKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2ltcGxlIGNhbGwnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBudW1iZXIsIGEyOiBudW1iZXIpID0+IGExICsgYTI7XG5cdFx0YlByb3h5LiRtKDQsIDEpLnRoZW4oKHJlczogbnVtYmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCA1KTtcblx0XHRcdGRvbmUobnVsbCk7XG5cdFx0fSwgZG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBjYWxsIHdpdGhvdXQgcmVzdWx0JywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiB7IH07XG5cdFx0YlByb3h5LiRtKDQsIDEpLnRoZW4oKHJlczogbnVtYmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB1bmRlZmluZWQpO1xuXHRcdFx0ZG9uZShudWxsKTtcblx0XHR9LCBkb25lKTtcblx0fSk7XG5cblx0dGVzdCgncGFzc2luZyBidWZmZXIgYXMgYXJndW1lbnQnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBWU0J1ZmZlciwgYTI6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGExIGluc3RhbmNlb2YgVlNCdWZmZXIpO1xuXHRcdFx0cmV0dXJuIGExLmJ1ZmZlclthMl07XG5cdFx0fTtcblx0XHRjb25zdCBiID0gVlNCdWZmZXIuYWxsb2MoNCk7XG5cdFx0Yi5idWZmZXJbMF0gPSAxO1xuXHRcdGIuYnVmZmVyWzFdID0gMjtcblx0XHRiLmJ1ZmZlclsyXSA9IDM7XG5cdFx0Yi5idWZmZXJbM10gPSA0O1xuXHRcdGJQcm94eS4kbShiLCAyKS50aGVuKChyZXM6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgMyk7XG5cdFx0XHRkb25lKG51bGwpO1xuXHRcdH0sIGRvbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5pbmcgYSBidWZmZXInLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBudW1iZXIsIGEyOiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IGIgPSBWU0J1ZmZlci5hbGxvYyg0KTtcblx0XHRcdGIuYnVmZmVyWzBdID0gMTtcblx0XHRcdGIuYnVmZmVyWzFdID0gMjtcblx0XHRcdGIuYnVmZmVyWzJdID0gMztcblx0XHRcdGIuYnVmZmVyWzNdID0gNDtcblx0XHRcdHJldHVybiBiO1xuXHRcdH07XG5cdFx0YlByb3h5LiRtKDQsIDEpLnRoZW4oKHJlczogVlNCdWZmZXIpID0+IHtcblx0XHRcdGFzc2VydC5vayhyZXMgaW5zdGFuY2VvZiBWU0J1ZmZlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ1ZmZlclswXSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ1ZmZlclsxXSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ1ZmZlclsyXSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ1ZmZlclszXSwgNCk7XG5cdFx0XHRkb25lKG51bGwpO1xuXHRcdH0sIGRvbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsaW5nIGEgY2FsbCB2aWEgQ2FuY2VsbGF0aW9uVG9rZW4gYmVmb3JlJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiBhMSArIGEyO1xuXHRcdGNvbnN0IHAgPSBiUHJveHkuJG0oNCwgQ2FuY2VsbGF0aW9uVG9rZW4uQ2FuY2VsbGVkKTtcblx0XHRwLnRoZW4oKHJlczogbnVtYmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIG5vdCByZWNlaXZlIHJlc3VsdCcpO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdGFzc2VydC5vayh0cnVlKTtcblx0XHRcdGRvbmUobnVsbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3NpbmcgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZScsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soISF0b2tlbik7XG5cdFx0XHRyZXR1cm4gYTEgKyAxO1xuXHRcdH07XG5cdFx0YlByb3h5LiRtKDQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oKHJlczogbnVtYmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCA1KTtcblx0XHRcdGRvbmUobnVsbCk7XG5cdFx0fSwgZG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcgYSBjYWxsIHZpYSBDYW5jZWxsYXRpb25Ub2tlbiBxdWlja2x5JywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHQvLyB0aGlzIGlzIGFuIGltcGxlbWVudGF0aW9uIHdoaWNoLCB3aGVuIGNhbmNlbGxhdGlvbiBpcyB0cmlnZ2VyZWQsIHdpbGwgcmV0dXJuIDdcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoZSkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoNyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHAgPSBiUHJveHkuJG0oNCwgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdHAudGhlbigocmVzOiBudW1iZXIpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIDcpO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdGFzc2VydC5mYWlsKCdzaG91bGQgbm90IHJlY2VpdmUgZXJyb3InKTtcblx0XHR9KS5maW5hbGx5KGRvbmUpO1xuXHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxlYXNlcyBjYW5jZWxsYXRpb24gaGFuZGxlciB3aGVuIHRoZSBpbnZva2VkIGNhbGwgZG9lcyBub3Qgc2V0dGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCByZXNvbHZlUmVtb3RlVG9rZW4hOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHJlbW90ZVRva2VuID0gbmV3IFByb21pc2U8Q2FuY2VsbGF0aW9uVG9rZW4+KHJlc29sdmUgPT4gcmVzb2x2ZVJlbW90ZVRva2VuID0gcmVzb2x2ZSk7XG5cdFx0ZGVsZWdhdGUgPSAoX2ExOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0cmVzb2x2ZVJlbW90ZVRva2VuKHRva2VuKTtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7IH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0dm9pZCBiUHJveHkuJG0oNCwgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVtb3RlVG9rZW47XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uUmVxdWVzdGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0fSk7XG5cdFx0dG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0YXdhaXQgY2FuY2VsbGF0aW9uUmVxdWVzdGVkO1xuXG5cdFx0Y29uc3QgY2FuY2VsSW52b2tlZEhhbmRsZXJzID0gUmVmbGVjdC5nZXQoYlByb3RvY29sLCAnX2NhbmNlbEludm9rZWRIYW5kbGVycycpIGFzIFJlY29yZDxzdHJpbmcsICgpID0+IHZvaWQ+O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoY2FuY2VsSW52b2tlZEhhbmRsZXJzKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB0cmFjayB1bmNhbmNlbGxhYmxlIGNhbGxzIHRoYXQgZG8gbm90IHNldHRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcmVzb2x2ZUludm9rZWQhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IGludm9rZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHJlc29sdmVJbnZva2VkID0gcmVzb2x2ZSk7XG5cdFx0ZGVsZWdhdGUgPSAoKSA9PiB7XG5cdFx0XHRyZXNvbHZlSW52b2tlZCgpO1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgfSk7XG5cdFx0fTtcblxuXHRcdHZvaWQgYlByb3h5LiRtKDQsIDEpO1xuXHRcdGF3YWl0IGludm9rZWQ7XG5cblx0XHRjb25zdCBjYW5jZWxJbnZva2VkSGFuZGxlcnMgPSBSZWZsZWN0LmdldChiUHJvdG9jb2wsICdfY2FuY2VsSW52b2tlZEhhbmRsZXJzJykgYXMgUmVjb3JkPHN0cmluZywgKCkgPT4gdm9pZD47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3Qua2V5cyhjYW5jZWxJbnZva2VkSGFuZGxlcnMpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rocm93aW5nIGFuIGVycm9yJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vcGVgKTtcblx0XHR9O1xuXHRcdGJQcm94eS4kbSg0LCAxKS50aGVuKChyZXMpID0+IHtcblx0XHRcdGFzc2VydC5mYWlsKCd1bmV4cGVjdGVkJyk7XG5cdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVyci5tZXNzYWdlLCAnbm9wZScpO1xuXHRcdH0pLmZpbmFsbHkoZG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vycm9yIHByb21pc2UnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBudW1iZXIsIGEyOiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuXHRcdH07XG5cdFx0YlByb3h5LiRtKDQsIDEpLnRoZW4oKHJlcykgPT4ge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3VuZXhwZWN0ZWQnKTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLCB1bmRlZmluZWQpO1xuXHRcdH0pLmZpbmFsbHkoZG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2MDQ1MDogQ29udmVydGluZyBjaXJjdWxhciBzdHJ1Y3R1cmUgdG8gSlNPTicsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IG51bWJlciwgYTI6IG51bWJlcikgPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRjb25zdCBjaXJjdWxhciA9IDxhbnk+e307XG5cdFx0XHRjaXJjdWxhci5zZWxmID0gY2lyY3VsYXI7XG5cdFx0XHRyZXR1cm4gY2lyY3VsYXI7XG5cdFx0fTtcblx0XHRiUHJveHkuJG0oNCwgMSkudGhlbigocmVzKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCBudWxsKTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRhc3NlcnQuZmFpbCgndW5leHBlY3RlZCcpO1xuXHRcdH0pLmZpbmFsbHkoZG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3Mjc5ODogbnVsbCBlcnJvcnMgYXJlIGhhcmQgdG8gZGlnZXN0JywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdGhyb3ctbGl0ZXJhbFxuXHRcdFx0dGhyb3cgeyAnd2hhdCc6ICd3aGF0JyB9O1xuXHRcdH07XG5cdFx0YlByb3h5LiRtKDQsIDEpLnRoZW4oKHJlcykgPT4ge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3VuZXhwZWN0ZWQnKTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLndoYXQsICd3aGF0Jyk7XG5cdFx0fSkuZmluYWxseShkb25lKTtcblx0fSk7XG5cblx0dGVzdCgndW5kZWZpbmVkIGFyZ3VtZW50cyBhcnJpdmUgYXMgbnVsbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogYW55LCBhMjogYW55KSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGExLCAndW5kZWZpbmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYTIsIG51bGwpO1xuXHRcdFx0cmV0dXJuIDc7XG5cdFx0fTtcblx0XHRyZXR1cm4gYlByb3h5LiRtKHVuZGVmaW5lZCwgbnVsbCkudGhlbigocmVzKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCA3KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzgxNDI0OiBTZXJpYWxpemVSZXF1ZXN0IHNob3VsZCB0aHJvdyBpZiBhbiBhcmd1bWVudCBjYW4gbm90IGJlIHNlcmlhbGl6ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFkT2JqZWN0ID0ge307XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0KDxhbnk+YmFkT2JqZWN0KS5sb29wID0gYmFkT2JqZWN0O1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRiUHJveHkuJG0oYmFkT2JqZWN0LCAnMicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyBpcyBjb3JyZWN0bHkgdHJhbnNmZXJlZCcsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPHsgc3RyaW5nOiBzdHJpbmc7IGJ1ZmY6IFZTQnVmZmVyIH0+LCBhMjogbnVtYmVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgc3RyaW5nOiBhMS52YWx1ZS5zdHJpbmcgKyAnIHdvcmxkJywgYnVmZjogYTEudmFsdWUuYnVmZiB9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYiA9IFZTQnVmZmVyLmFsbG9jKDQpO1xuXHRcdGIuYnVmZmVyWzBdID0gMTtcblx0XHRiLmJ1ZmZlclsxXSA9IDI7XG5cdFx0Yi5idWZmZXJbMl0gPSAzO1xuXHRcdGIuYnVmZmVyWzNdID0gNDtcblxuXHRcdGJQcm94eS4kbShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBzdHJpbmc6ICdoZWxsbycsIGJ1ZmY6IGIgfSksIHVuZGVmaW5lZCkudGhlbigocmVzOiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxhbnk+KSA9PiB7XG5cdFx0XHRhc3NlcnQub2socmVzIGluc3RhbmNlb2YgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy52YWx1ZS5zdHJpbmcsICdoZWxsbyB3b3JsZCcpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzLnZhbHVlLmJ1ZmYgaW5zdGFuY2VvZiBWU0J1ZmZlcik7XG5cblx0XHRcdGNvbnN0IGJ1ZmZlclZhbHVlcyA9IEFycmF5LmZyb20ocmVzLnZhbHVlLmJ1ZmYuYnVmZmVyKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlclZhbHVlc1swXSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyVmFsdWVzWzFdLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXJWYWx1ZXNbMl0sIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlclZhbHVlc1szXSwgNCk7XG5cdFx0XHRkb25lKG51bGwpO1xuXHRcdH0sIGRvbmUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUJBQWlCLHFDQUFxQztBQUMvRCxTQUFTLG1CQUFtQjtBQUU1QixNQUFNLGVBQWUsTUFBTTtBQUUxQixNQUFJO0FBQUEsRUFFSixNQUFNLHVCQUEwRDtBQUFBLElBQWhFO0FBR0MsV0FBaUIsYUFBYSxJQUFJLFFBQWtCO0FBQ3BELFdBQWdCLFlBQTZCLEtBQUssV0FBVztBQUFBO0FBQUEsSUFFdEQsUUFBUSxPQUErQjtBQUM3QyxXQUFLLFFBQVE7QUFBQSxJQUNkO0FBQUEsSUFFTyxLQUFLLFFBQXdCO0FBQ25DLGNBQVEsUUFBUSxFQUFFLEtBQUssTUFBTTtBQUM1QixhQUFLLE1BQU8sV0FBVyxLQUFLLE1BQU07QUFBQSxNQUNuQyxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFFQSxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFBQSxFQUNKLE1BQU0sT0FBTztBQUFBLElBQ1osR0FBRyxJQUFTLElBQXVCO0FBQ2xDLGFBQU8sUUFBUSxRQUFRLFNBQVMsS0FBSyxNQUFNLElBQUksRUFBRSxDQUFDO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBRUEsUUFBTSxNQUFNO0FBQ1gsa0JBQWMsSUFBSSxnQkFBZ0I7QUFFbEMsVUFB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
