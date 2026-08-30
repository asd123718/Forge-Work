var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
import assert from "assert";
import * as sinon from "sinon";
import { memoize, throttle } from "../../common/decorators.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Decorators", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("memoize should memoize methods", () => {
    class Foo {
      constructor(_answer) {
        this._answer = _answer;
        this.count = 0;
      }
      answer() {
        this.count++;
        return this._answer;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo(42);
    assert.strictEqual(foo.count, 0);
    assert.strictEqual(foo.answer(), 42);
    assert.strictEqual(foo.count, 1);
    assert.strictEqual(foo.answer(), 42);
    assert.strictEqual(foo.count, 1);
    const foo2 = new Foo(1337);
    assert.strictEqual(foo2.count, 0);
    assert.strictEqual(foo2.answer(), 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo2.answer(), 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo.answer(), 42);
    assert.strictEqual(foo.count, 1);
    const foo3 = new Foo(null);
    assert.strictEqual(foo3.count, 0);
    assert.strictEqual(foo3.answer(), null);
    assert.strictEqual(foo3.count, 1);
    assert.strictEqual(foo3.answer(), null);
    assert.strictEqual(foo3.count, 1);
    const foo4 = new Foo(void 0);
    assert.strictEqual(foo4.count, 0);
    assert.strictEqual(foo4.answer(), void 0);
    assert.strictEqual(foo4.count, 1);
    assert.strictEqual(foo4.answer(), void 0);
    assert.strictEqual(foo4.count, 1);
  });
  test("memoize should memoize getters", () => {
    class Foo {
      constructor(_answer) {
        this._answer = _answer;
        this.count = 0;
      }
      get answer() {
        this.count++;
        return this._answer;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo(42);
    assert.strictEqual(foo.count, 0);
    assert.strictEqual(foo.answer, 42);
    assert.strictEqual(foo.count, 1);
    assert.strictEqual(foo.answer, 42);
    assert.strictEqual(foo.count, 1);
    const foo2 = new Foo(1337);
    assert.strictEqual(foo2.count, 0);
    assert.strictEqual(foo2.answer, 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo2.answer, 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo.answer, 42);
    assert.strictEqual(foo.count, 1);
    const foo3 = new Foo(null);
    assert.strictEqual(foo3.count, 0);
    assert.strictEqual(foo3.answer, null);
    assert.strictEqual(foo3.count, 1);
    assert.strictEqual(foo3.answer, null);
    assert.strictEqual(foo3.count, 1);
    const foo4 = new Foo(void 0);
    assert.strictEqual(foo4.count, 0);
    assert.strictEqual(foo4.answer, void 0);
    assert.strictEqual(foo4.count, 1);
    assert.strictEqual(foo4.answer, void 0);
    assert.strictEqual(foo4.count, 1);
  });
  test("memoized property should not be enumerable", () => {
    class Foo {
      get answer() {
        return 42;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo();
    assert.strictEqual(foo.answer, 42);
    assert(!Object.keys(foo).some((k) => /\$memoize\$/.test(k)));
  });
  test("memoized property should not be writable", () => {
    class Foo {
      get answer() {
        return 42;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo();
    assert.strictEqual(foo.answer, 42);
    try {
      foo["$memoize$answer"] = 1337;
      assert(false);
    } catch (e) {
      assert.strictEqual(foo.answer, 42);
    }
  });
  test("throttle", () => {
    const spy = sinon.spy();
    const clock = sinon.useFakeTimers();
    try {
      class ThrottleTest {
        constructor(fn) {
          this._handle = fn;
        }
        report(p) {
          this._handle(p);
        }
      }
      __decorateClass([
        throttle(
          100,
          (a, b) => a + b,
          () => 0
        )
      ], ThrottleTest.prototype, "report", 1);
      const t = new ThrottleTest(spy);
      t.report(1);
      t.report(2);
      t.report(3);
      assert.deepStrictEqual(spy.args, [[1]]);
      clock.tick(200);
      assert.deepStrictEqual(spy.args, [[1], [5]]);
      spy.resetHistory();
      t.report(4);
      t.report(5);
      clock.tick(50);
      t.report(6);
      assert.deepStrictEqual(spy.args, [[4]]);
      clock.tick(60);
      assert.deepStrictEqual(spy.args, [[4], [11]]);
    } finally {
      clock.restore();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGRlY29yYXRvcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IG1lbW9pemUsIHRocm90dGxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdEZWNvcmF0b3JzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZW1vaXplIHNob3VsZCBtZW1vaXplIG1ldGhvZHMnLCAoKSA9PiB7XG5cdFx0Y2xhc3MgRm9vIHtcblx0XHRcdGNvdW50ID0gMDtcblxuXHRcdFx0Y29uc3RydWN0b3IocHJpdmF0ZSBfYW5zd2VyOiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKSB7IH1cblxuXHRcdFx0QG1lbW9pemVcblx0XHRcdGFuc3dlcigpIHtcblx0XHRcdFx0dGhpcy5jb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYW5zd2VyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvbyA9IG5ldyBGb28oNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uYW5zd2VyKCksIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmFuc3dlcigpLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBmb28yID0gbmV3IEZvbygxMzM3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMi5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzIuYW5zd2VyKCksIDEzMzcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMi5hbnN3ZXIoKSwgMTMzNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzIuY291bnQsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIoKSwgNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uY291bnQsIDEpO1xuXG5cdFx0Y29uc3QgZm9vMyA9IG5ldyBGb28obnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzMuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28zLmFuc3dlcigpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzMuYW5zd2VyKCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28zLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGZvbzQgPSBuZXcgRm9vKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzQuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmFuc3dlcigpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vNC5hbnN3ZXIoKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vNC5jb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lbW9pemUgc2hvdWxkIG1lbW9pemUgZ2V0dGVycycsICgpID0+IHtcblx0XHRjbGFzcyBGb28ge1xuXHRcdFx0Y291bnQgPSAwO1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9hbnN3ZXI6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpIHsgfVxuXG5cdFx0XHRAbWVtb2l6ZVxuXHRcdFx0Z2V0IGFuc3dlcigpIHtcblx0XHRcdFx0dGhpcy5jb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYW5zd2VyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvbyA9IG5ldyBGb28oNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uYW5zd2VyLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIsIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGZvbzIgPSBuZXcgRm9vKDEzMzcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMi5hbnN3ZXIsIDEzMzcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMi5hbnN3ZXIsIDEzMzcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmNvdW50LCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uYW5zd2VyLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBmb28zID0gbmV3IEZvbyhudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzMuYW5zd2VyLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzMuYW5zd2VyLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBmb280ID0gbmV3IEZvbyh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vNC5hbnN3ZXIsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzQuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmFuc3dlciwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vNC5jb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lbW9pemVkIHByb3BlcnR5IHNob3VsZCBub3QgYmUgZW51bWVyYWJsZScsICgpID0+IHtcblx0XHRjbGFzcyBGb28ge1xuXHRcdFx0QG1lbW9pemVcblx0XHRcdGdldCBhbnN3ZXIoKSB7XG5cdFx0XHRcdHJldHVybiA0Mjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb28gPSBuZXcgRm9vKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIsIDQyKTtcblxuXHRcdGFzc2VydCghT2JqZWN0LmtleXMoZm9vKS5zb21lKGsgPT4gL1xcJG1lbW9pemVcXCQvLnRlc3QoaykpKTtcblx0fSk7XG5cblx0dGVzdCgnbWVtb2l6ZWQgcHJvcGVydHkgc2hvdWxkIG5vdCBiZSB3cml0YWJsZScsICgpID0+IHtcblx0XHRjbGFzcyBGb28ge1xuXHRcdFx0QG1lbW9pemVcblx0XHRcdGdldCBhbnN3ZXIoKSB7XG5cdFx0XHRcdHJldHVybiA0Mjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb28gPSBuZXcgRm9vKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIsIDQyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdChmb28gYXMgYW55KVsnJG1lbW9pemUkYW5zd2VyJ10gPSAxMzM3O1xuXHRcdFx0YXNzZXJ0KGZhbHNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmFuc3dlciwgNDIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndGhyb3R0bGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3B5ID0gc2lub24uc3B5KCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNsYXNzIFRocm90dGxlVGVzdCB7XG5cdFx0XHRcdHByaXZhdGUgX2hhbmRsZTogRnVuY3Rpb247XG5cblx0XHRcdFx0Y29uc3RydWN0b3IoZm46IEZ1bmN0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlID0gZm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRAdGhyb3R0bGUoXG5cdFx0XHRcdFx0MTAwLFxuXHRcdFx0XHRcdChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYSArIGIsXG5cdFx0XHRcdFx0KCkgPT4gMFxuXHRcdFx0XHQpXG5cdFx0XHRcdHJlcG9ydChwOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGUocCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdCA9IG5ldyBUaHJvdHRsZVRlc3Qoc3B5KTtcblxuXHRcdFx0dC5yZXBvcnQoMSk7XG5cdFx0XHR0LnJlcG9ydCgyKTtcblx0XHRcdHQucmVwb3J0KDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzcHkuYXJncywgW1sxXV0pO1xuXG5cdFx0XHRjbG9jay50aWNrKDIwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNweS5hcmdzLCBbWzFdLCBbNV1dKTtcblx0XHRcdHNweS5yZXNldEhpc3RvcnkoKTtcblxuXHRcdFx0dC5yZXBvcnQoNCk7XG5cdFx0XHR0LnJlcG9ydCg1KTtcblx0XHRcdGNsb2NrLnRpY2soNTApO1xuXHRcdFx0dC5yZXBvcnQoNik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3B5LmFyZ3MsIFtbNF1dKTtcblx0XHRcdGNsb2NrLnRpY2soNjApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzcHkuYXJncywgW1s0XSwgWzExXV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGNBQWMsTUFBTTtBQUN6QiwwQ0FBd0M7QUFFeEMsT0FBSyxrQ0FBa0MsTUFBTTtBQUFBLElBQzVDLE1BQU0sSUFBSTtBQUFBLE1BR1QsWUFBb0IsU0FBb0M7QUFBcEM7QUFGcEIscUJBQVE7QUFBQSxN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
