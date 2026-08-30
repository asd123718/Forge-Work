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
import { Disposable } from "../../common/lifecycle.js";
import { CancellationToken } from "../../common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { cancelPreviousCalls } from "../../common/decorators/cancelPreviousCalls.js";
suite("cancelPreviousCalls decorator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class MockDisposable extends Disposable {
    constructor() {
      super(...arguments);
      /**
       * Arguments that the {@linkcode doSomethingAsync} method was called with.
       */
      this.callArgs1 = [];
      /**
       * Arguments that the {@linkcode doSomethingElseAsync} method was called with.
       */
      this.callArgs2 = [];
    }
    /**
     * Returns the arguments that the {@linkcode doSomethingAsync} method was called with.
     */
    get callArguments1() {
      return this.callArgs1;
    }
    /**
     * Returns the arguments that the {@linkcode doSomethingElseAsync} method was called with.
     */
    get callArguments2() {
      return this.callArgs2;
    }
    async doSomethingAsync(arg1, arg2, cancellationToken) {
      this.callArgs1.push([arg1, arg2, cancellationToken]);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    async doSomethingElseAsync(arg1, arg2, cancellationToken) {
      this.callArgs2.push([arg1, arg2, cancellationToken]);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  __decorateClass([
    cancelPreviousCalls
  ], MockDisposable.prototype, "doSomethingAsync", 1);
  __decorateClass([
    cancelPreviousCalls
  ], MockDisposable.prototype, "doSomethingElseAsync", 1);
  test("should call method with CancellationToken", async () => {
    const instance = disposables.add(new MockDisposable());
    await instance.doSomethingAsync(1, "foo");
    const callArguments = instance.callArguments1;
    assert.strictEqual(
      callArguments.length,
      1,
      `The 'doSomethingAsync' method must be called just once.`
    );
    const args = callArguments[0];
    assert(
      args.length === 3,
      `The 'doSomethingAsync' method must be called with '3' arguments, got '${args.length}'.`
    );
    const arg1 = args[0];
    const arg2 = args[1];
    const arg3 = args[2];
    assert.strictEqual(
      arg1,
      1,
      `The 'doSomethingAsync' method call must have the correct 1st argument.`
    );
    assert.strictEqual(
      arg2,
      "foo",
      `The 'doSomethingAsync' method call must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(arg3),
      `The last argument of the 'doSomethingAsync' method must be a 'CancellationToken', got '${arg3}'.`
    );
    assert(
      arg3.isCancellationRequested === false,
      `The 'CancellationToken' argument must not yet be cancelled.`
    );
    assert(
      instance.callArguments2.length === 0,
      `The 'doSomethingElseAsync' method must not be called.`
    );
  });
  test("cancel token of the previous call when method is called again", async () => {
    const instance = disposables.add(new MockDisposable());
    instance.doSomethingAsync(1, "foo");
    await new Promise((resolve) => setTimeout(resolve, 10));
    instance.doSomethingAsync(2, "bar");
    const callArguments = instance.callArguments1;
    assert.strictEqual(
      callArguments.length,
      2,
      `The 'doSomethingAsync' method must be called twice.`
    );
    const call1Args = callArguments[0];
    assert(
      call1Args.length === 3,
      `The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call1Args[0],
      1,
      `The first call of the 'doSomethingAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call1Args[1],
      "foo",
      `The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call1Args[2]),
      `The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call1Args[2].isCancellationRequested === true,
      `The 'CancellationToken' of the first call must be cancelled.`
    );
    const call2Args = callArguments[1];
    assert(
      call2Args.length === 3,
      `The second call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call2Args[0],
      2,
      `The second call of the 'doSomethingAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call2Args[1],
      "bar",
      `The second call of the 'doSomethingAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call2Args[2]),
      `The second call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call2Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the second call must be cancelled.`
    );
    assert(
      instance.callArguments2.length === 0,
      `The 'doSomethingElseAsync' method must not be called.`
    );
  });
  test("different method calls must not interfere with each other", async () => {
    const instance = disposables.add(new MockDisposable());
    instance.doSomethingAsync(10, "baz");
    await new Promise((resolve) => setTimeout(resolve, 10));
    instance.doSomethingElseAsync(25, "qux");
    assert.strictEqual(
      instance.callArguments1.length,
      1,
      `The 'doSomethingAsync' method must be called once.`
    );
    const call1Args = instance.callArguments1[0];
    assert(
      call1Args.length === 3,
      `The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call1Args[0],
      10,
      `The first call of the 'doSomethingAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call1Args[1],
      "baz",
      `The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call1Args[2]),
      `The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call1Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the first call must not be cancelled.`
    );
    assert.strictEqual(
      instance.callArguments2.length,
      1,
      `The 'doSomethingElseAsync' method must be called once.`
    );
    const call2Args = instance.callArguments2[0];
    assert(
      call2Args.length === 3,
      `The first call of the 'doSomethingElseAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call2Args[0],
      25,
      `The first call of the 'doSomethingElseAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call2Args[1],
      "qux",
      `The first call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call2Args[2]),
      `The first call of the 'doSomethingElseAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call2Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the second call must be cancelled.`
    );
    instance.doSomethingElseAsync(105, "uxi");
    assert.strictEqual(
      instance.callArguments1.length,
      1,
      `The 'doSomethingAsync' method must be called once.`
    );
    assert.strictEqual(
      instance.callArguments2.length,
      2,
      `The 'doSomethingElseAsync' method must be called twice.`
    );
    assert(
      call1Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the first call must not be cancelled.`
    );
    const call3Args = instance.callArguments2[1];
    assert(
      CancellationToken.isCancellationToken(call3Args[2]),
      `The last argument of the second call of the 'doSomethingElseAsync' method must be a 'CancellationToken'.`
    );
    assert(
      call2Args[2].isCancellationRequested,
      `The 'CancellationToken' of the first call must be cancelled.`
    );
    assert(
      call3Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the second call must not be cancelled.`
    );
    assert.strictEqual(
      call3Args[0],
      105,
      `The second call of the 'doSomethingElseAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call3Args[1],
      "uxi",
      `The second call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGNhbmNlbFByZXZpb3VzQ2FsbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IGNhbmNlbFByZXZpb3VzQ2FsbHMgfSBmcm9tICcuLi8uLi9jb21tb24vZGVjb3JhdG9ycy9jYW5jZWxQcmV2aW91c0NhbGxzLmpzJztcblxuc3VpdGUoJ2NhbmNlbFByZXZpb3VzQ2FsbHMgZGVjb3JhdG9yJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIE1vY2tEaXNwb3NhYmxlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdFx0LyoqXG5cdFx0ICogQXJndW1lbnRzIHRoYXQgdGhlIHtAbGlua2NvZGUgZG9Tb21ldGhpbmdBc3luY30gbWV0aG9kIHdhcyBjYWxsZWQgd2l0aC5cblx0XHQgKi9cblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbGxBcmdzMTogKFtudW1iZXIsIHN0cmluZywgQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWRdKVtdID0gW107XG5cblx0XHQvKipcblx0XHQgKiBBcmd1bWVudHMgdGhhdCB0aGUge0BsaW5rY29kZSBkb1NvbWV0aGluZ0Vsc2VBc3luY30gbWV0aG9kIHdhcyBjYWxsZWQgd2l0aC5cblx0XHQgKi9cblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbGxBcmdzMjogKFtudW1iZXIsIHN0cmluZywgQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWRdKVtdID0gW107XG5cblx0XHQvKipcblx0XHQgKiBSZXR1cm5zIHRoZSBhcmd1bWVudHMgdGhhdCB0aGUge0BsaW5rY29kZSBkb1NvbWV0aGluZ0FzeW5jfSBtZXRob2Qgd2FzIGNhbGxlZCB3aXRoLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyBnZXQgY2FsbEFyZ3VtZW50czEoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jYWxsQXJnczE7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogUmV0dXJucyB0aGUgYXJndW1lbnRzIHRoYXQgdGhlIHtAbGlua2NvZGUgZG9Tb21ldGhpbmdFbHNlQXN5bmN9IG1ldGhvZCB3YXMgY2FsbGVkIHdpdGguXG5cdFx0ICovXG5cdFx0cHVibGljIGdldCBjYWxsQXJndW1lbnRzMigpIHtcblx0XHRcdHJldHVybiB0aGlzLmNhbGxBcmdzMjtcblx0XHR9XG5cblx0XHRAY2FuY2VsUHJldmlvdXNDYWxsc1xuXHRcdGFzeW5jIGRvU29tZXRoaW5nQXN5bmMoYXJnMTogbnVtYmVyLCBhcmcyOiBzdHJpbmcsIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHRoaXMuY2FsbEFyZ3MxLnB1c2goW2FyZzEsIGFyZzIsIGNhbmNlbGxhdGlvblRva2VuXSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyNSkpO1xuXHRcdH1cblxuXHRcdEBjYW5jZWxQcmV2aW91c0NhbGxzXG5cdFx0YXN5bmMgZG9Tb21ldGhpbmdFbHNlQXN5bmMoYXJnMTogbnVtYmVyLCBhcmcyOiBzdHJpbmcsIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHRoaXMuY2FsbEFyZ3MyLnB1c2goW2FyZzEsIGFyZzIsIGNhbmNlbGxhdGlvblRva2VuXSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyNSkpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCBjYWxsIG1ldGhvZCB3aXRoIENhbmNlbGxhdGlvblRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrRGlzcG9zYWJsZSgpKTtcblxuXHRcdGF3YWl0IGluc3RhbmNlLmRvU29tZXRoaW5nQXN5bmMoMSwgJ2ZvbycpO1xuXG5cdFx0Y29uc3QgY2FsbEFyZ3VtZW50cyA9IGluc3RhbmNlLmNhbGxBcmd1bWVudHMxO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGxBcmd1bWVudHMubGVuZ3RoLFxuXHRcdFx0MSxcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGNhbGxlZCBqdXN0IG9uY2UuYCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYXJncyA9IGNhbGxBcmd1bWVudHNbMF07XG5cdFx0YXNzZXJ0KFxuXHRcdFx0YXJncy5sZW5ndGggPT09IDMsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBiZSBjYWxsZWQgd2l0aCAnMycgYXJndW1lbnRzLCBnb3QgJyR7YXJncy5sZW5ndGh9Jy5gLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhcmcxID0gYXJnc1swXTtcblx0XHRjb25zdCBhcmcyID0gYXJnc1sxXTtcblx0XHRjb25zdCBhcmczID0gYXJnc1syXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFyZzEsXG5cdFx0XHQxLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIGNhbGwgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDFzdCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhcmcyLFxuXHRcdFx0J2ZvbycsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgY2FsbCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMm5kIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oYXJnMyksXG5cdFx0XHRgVGhlIGxhc3QgYXJndW1lbnQgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBiZSBhICdDYW5jZWxsYXRpb25Ub2tlbicsIGdvdCAnJHthcmczfScuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0YXJnMy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UsXG5cdFx0XHRgVGhlICdDYW5jZWxsYXRpb25Ub2tlbicgYXJndW1lbnQgbXVzdCBub3QgeWV0IGJlIGNhbmNlbGxlZC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRpbnN0YW5jZS5jYWxsQXJndW1lbnRzMi5sZW5ndGggPT09IDAsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0Vsc2VBc3luYycgbWV0aG9kIG11c3Qgbm90IGJlIGNhbGxlZC5gLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbCB0b2tlbiBvZiB0aGUgcHJldmlvdXMgY2FsbCB3aGVuIG1ldGhvZCBpcyBjYWxsZWQgYWdhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tEaXNwb3NhYmxlKCkpO1xuXG5cdFx0aW5zdGFuY2UuZG9Tb21ldGhpbmdBc3luYygxLCAnZm9vJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cdFx0aW5zdGFuY2UuZG9Tb21ldGhpbmdBc3luYygyLCAnYmFyJyk7XG5cblx0XHRjb25zdCBjYWxsQXJndW1lbnRzID0gaW5zdGFuY2UuY2FsbEFyZ3VtZW50czE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbEFyZ3VtZW50cy5sZW5ndGgsXG5cdFx0XHQyLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgYmUgY2FsbGVkIHR3aWNlLmAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNhbGwxQXJncyA9IGNhbGxBcmd1bWVudHNbMF07XG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDFBcmdzLmxlbmd0aCA9PT0gMyxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgJzMnIGFyZ3VtZW50cywgZ290ICcke2NhbGwxQXJncy5sZW5ndGh9Jy5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsMUFyZ3NbMF0sXG5cdFx0XHQxLFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgY29ycmVjdCAxc3QgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbDFBcmdzWzFdLFxuXHRcdFx0J2ZvbycsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDJuZCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKGNhbGwxQXJnc1syXSksXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIGFzIHRoZSAzcmQgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDFBcmdzWzJdLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSB0cnVlLFxuXHRcdFx0YFRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIG9mIHRoZSBmaXJzdCBjYWxsIG11c3QgYmUgY2FuY2VsbGVkLmAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNhbGwyQXJncyA9IGNhbGxBcmd1bWVudHNbMV07XG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDJBcmdzLmxlbmd0aCA9PT0gMyxcblx0XHRcdGBUaGUgc2Vjb25kIGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlICczJyBhcmd1bWVudHMsIGdvdCAnJHtjYWxsMUFyZ3MubGVuZ3RofScuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbDJBcmdzWzBdLFxuXHRcdFx0Mixcblx0XHRcdGBUaGUgc2Vjb25kIGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDFzdCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsMkFyZ3NbMV0sXG5cdFx0XHQnYmFyJyxcblx0XHRcdGBUaGUgc2Vjb25kIGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDJuZCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKGNhbGwyQXJnc1syXSksXG5cdFx0XHRgVGhlIHNlY29uZCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgJ0NhbmNlbGxhdGlvblRva2VuJyBhcyB0aGUgM3JkIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdGNhbGwyQXJnc1syXS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UsXG5cdFx0XHRgVGhlICdDYW5jZWxsYXRpb25Ub2tlbicgb2YgdGhlIHNlY29uZCBjYWxsIG11c3QgYmUgY2FuY2VsbGVkLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdGluc3RhbmNlLmNhbGxBcmd1bWVudHMyLmxlbmd0aCA9PT0gMCxcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBub3QgYmUgY2FsbGVkLmAsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IG1ldGhvZCBjYWxscyBtdXN0IG5vdCBpbnRlcmZlcmUgd2l0aCBlYWNoIG90aGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrRGlzcG9zYWJsZSgpKTtcblxuXHRcdGluc3RhbmNlLmRvU29tZXRoaW5nQXN5bmMoMTAsICdiYXonKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblx0XHRpbnN0YW5jZS5kb1NvbWV0aGluZ0Vsc2VBc3luYygyNSwgJ3F1eCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aW5zdGFuY2UuY2FsbEFyZ3VtZW50czEubGVuZ3RoLFxuXHRcdFx0MSxcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGNhbGxlZCBvbmNlLmAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNhbGwxQXJncyA9IGluc3RhbmNlLmNhbGxBcmd1bWVudHMxWzBdO1xuXHRcdGFzc2VydChcblx0XHRcdGNhbGwxQXJncy5sZW5ndGggPT09IDMsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlICczJyBhcmd1bWVudHMsIGdvdCAnJHtjYWxsMUFyZ3MubGVuZ3RofScuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbDFBcmdzWzBdLFxuXHRcdFx0MTAsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDFzdCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsMUFyZ3NbMV0sXG5cdFx0XHQnYmF6Jyxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMm5kIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oY2FsbDFBcmdzWzJdKSxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlICdDYW5jZWxsYXRpb25Ub2tlbicgYXMgdGhlIDNyZCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMUFyZ3NbMl0uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPT09IGZhbHNlLFxuXHRcdFx0YFRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIG9mIHRoZSBmaXJzdCBjYWxsIG11c3Qgbm90IGJlIGNhbmNlbGxlZC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRpbnN0YW5jZS5jYWxsQXJndW1lbnRzMi5sZW5ndGgsXG5cdFx0XHQxLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGNhbGxlZCBvbmNlLmAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNhbGwyQXJncyA9IGluc3RhbmNlLmNhbGxBcmd1bWVudHMyWzBdO1xuXHRcdGFzc2VydChcblx0XHRcdGNhbGwyQXJncy5sZW5ndGggPT09IDMsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0Vsc2VBc3luYycgbWV0aG9kIG11c3QgaGF2ZSAnMycgYXJndW1lbnRzLCBnb3QgJyR7Y2FsbDFBcmdzLmxlbmd0aH0nLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwyQXJnc1swXSxcblx0XHRcdDI1LFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMXN0IGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwyQXJnc1sxXSxcblx0XHRcdCdxdXgnLFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMm5kIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oY2FsbDJBcmdzWzJdKSxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIGFzIHRoZSAzcmQgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDJBcmdzWzJdLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSBmYWxzZSxcblx0XHRcdGBUaGUgJ0NhbmNlbGxhdGlvblRva2VuJyBvZiB0aGUgc2Vjb25kIGNhbGwgbXVzdCBiZSBjYW5jZWxsZWQuYCxcblx0XHQpO1xuXG5cdFx0aW5zdGFuY2UuZG9Tb21ldGhpbmdFbHNlQXN5bmMoMTA1LCAndXhpJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRpbnN0YW5jZS5jYWxsQXJndW1lbnRzMS5sZW5ndGgsXG5cdFx0XHQxLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgYmUgY2FsbGVkIG9uY2UuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aW5zdGFuY2UuY2FsbEFyZ3VtZW50czIubGVuZ3RoLFxuXHRcdFx0Mixcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBiZSBjYWxsZWQgdHdpY2UuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDFBcmdzWzJdLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSBmYWxzZSxcblx0XHRcdGBUaGUgJ0NhbmNlbGxhdGlvblRva2VuJyBvZiB0aGUgZmlyc3QgY2FsbCBtdXN0IG5vdCBiZSBjYW5jZWxsZWQuYCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY2FsbDNBcmdzID0gaW5zdGFuY2UuY2FsbEFyZ3VtZW50czJbMV07XG5cdFx0YXNzZXJ0KFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihjYWxsM0FyZ3NbMl0pLFxuXHRcdFx0YFRoZSBsYXN0IGFyZ3VtZW50IG9mIHRoZSBzZWNvbmQgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBiZSBhICdDYW5jZWxsYXRpb25Ub2tlbicuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDJBcmdzWzJdLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLFxuXHRcdFx0YFRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIG9mIHRoZSBmaXJzdCBjYWxsIG11c3QgYmUgY2FuY2VsbGVkLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdGNhbGwzQXJnc1syXS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UsXG5cdFx0XHRgVGhlICdDYW5jZWxsYXRpb25Ub2tlbicgb2YgdGhlIHNlY29uZCBjYWxsIG11c3Qgbm90IGJlIGNhbmNlbGxlZC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsM0FyZ3NbMF0sXG5cdFx0XHQxMDUsXG5cdFx0XHRgVGhlIHNlY29uZCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMXN0IGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwzQXJnc1sxXSxcblx0XHRcdCd1eGknLFxuXHRcdFx0YFRoZSBzZWNvbmQgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDJuZCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlC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
