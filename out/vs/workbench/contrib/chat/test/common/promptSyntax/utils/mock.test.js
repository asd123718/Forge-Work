import assert from "assert";
import { mockObject, mockService } from "./mock.js";
import { typeCheck } from "../../../../../../../base/common/types.js";
import { randomBoolean } from "../../../../../../../base/test/common/testUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
suite("mockService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("mockObject", () => {
    test("overrides properties and functions", () => {
      const mock = mockObject({
        bar: "oh hi!",
        baz: 42,
        anotherMethod(arg) {
          return isNaN(arg);
        }
      });
      typeCheck(mock);
      assert.strictEqual(
        mock.bar,
        "oh hi!",
        "bar should be overriden"
      );
      assert.strictEqual(
        mock.baz,
        42,
        "baz should be overriden"
      );
      assert(
        !mock.anotherMethod(490274),
        "Must execute overriden method correctly 1."
      );
      assert(
        mock.anotherMethod(NaN),
        "Must execute overriden method correctly 2."
      );
      assert.throws(() => {
        mock.foo;
      });
      assert.throws(() => {
        mock.someMethod(randomBoolean());
      });
    });
    test("immutability of the overrides object", () => {
      const overrides = {
        baz: 4
      };
      const mock = mockObject(overrides);
      typeCheck(mock);
      assert.strictEqual(
        mock.baz,
        4,
        "baz should be overridden"
      );
      assert.throws(() => {
        overrides.foo = "test";
      });
      assert.throws(() => {
        overrides.someMethod = (arg) => {
          return `${arg}__${arg}`;
        };
      });
    });
  });
  suite("mockService", () => {
    test("overrides properties and functions", () => {
      const mock = mockService({
        id: "ciao!",
        counter: 74,
        testMethod2(arg) {
          return !isNaN(arg);
        }
      });
      typeCheck(mock);
      assert.strictEqual(
        mock.id,
        "ciao!",
        "id should be overridden"
      );
      assert.strictEqual(
        mock.counter,
        74,
        "counter should be overridden"
      );
      assert(
        mock.testMethod2(74368),
        "Must execute overridden method correctly 1."
      );
      assert(
        !mock.testMethod2(NaN),
        "Must execute overridden method correctly 2."
      );
      assert.throws(() => {
        mock.prop1;
      });
      assert.throws(() => {
        mock.method1(randomBoolean());
      });
    });
    test("immutability of the overrides object", () => {
      const overrides = {
        baz: false
      };
      const mock = mockService(overrides);
      typeCheck(mock);
      assert.strictEqual(
        mock.baz,
        false,
        "baz should be overridden"
      );
      assert.throws(() => {
        overrides.foo = "test";
      });
      assert.throws(() => {
        overrides.someMethod = (arg) => {
          return `${arg}__${arg}`;
        };
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFx1dGlsc1xcbW9jay50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9ja09iamVjdCwgbW9ja1NlcnZpY2UgfSBmcm9tICcuL21vY2suanMnO1xuaW1wb3J0IHsgdHlwZUNoZWNrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgcmFuZG9tQm9vbGVhbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnbW9ja1NlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdtb2NrT2JqZWN0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ292ZXJyaWRlcyBwcm9wZXJ0aWVzIGFuZCBmdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgSVRlc3RPYmplY3Qge1xuXHRcdFx0XHRmb286IHN0cmluZztcblx0XHRcdFx0YmFyOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGJhejogbnVtYmVyO1xuXHRcdFx0XHRzb21lTWV0aG9kKGFyZzogYm9vbGVhbik6IHN0cmluZztcblx0XHRcdFx0YW5vdGhlck1ldGhvZChhcmc6IG51bWJlcik6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vY2sgPSBtb2NrT2JqZWN0PElUZXN0T2JqZWN0Pih7XG5cdFx0XHRcdGJhcjogJ29oIGhpIScsXG5cdFx0XHRcdGJhejogNDIsXG5cdFx0XHRcdGFub3RoZXJNZXRob2QoYXJnOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gaXNOYU4oYXJnKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHR0eXBlQ2hlY2s8SVRlc3RPYmplY3Q+KG1vY2spO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vY2suYmFyLFxuXHRcdFx0XHQnb2ggaGkhJyxcblx0XHRcdFx0J2JhciBzaG91bGQgYmUgb3ZlcnJpZGVuJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0bW9jay5iYXosXG5cdFx0XHRcdDQyLFxuXHRcdFx0XHQnYmF6IHNob3VsZCBiZSBvdmVycmlkZW4nLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHQhKG1vY2suYW5vdGhlck1ldGhvZCg0OTAyNzQpKSxcblx0XHRcdFx0J011c3QgZXhlY3V0ZSBvdmVycmlkZW4gbWV0aG9kIGNvcnJlY3RseSAxLicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdG1vY2suYW5vdGhlck1ldGhvZChOYU4pLFxuXHRcdFx0XHQnTXVzdCBleGVjdXRlIG92ZXJyaWRlbiBtZXRob2QgY29ycmVjdGx5IDIuJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHQvLyBwcm9wZXJ0eSBpcyBub3Qgb3ZlcnJpZGVuIHNvIG11c3QgdGhyb3dcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tdW51c2VkLWV4cHJlc3Npb25zXG5cdFx0XHRcdG1vY2suZm9vO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHQvLyBmdW5jdGlvbiBpcyBub3Qgb3ZlcnJpZGVuIHNvIG11c3QgdGhyb3dcblx0XHRcdFx0bW9jay5zb21lTWV0aG9kKHJhbmRvbUJvb2xlYW4oKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltbXV0YWJpbGl0eSBvZiB0aGUgb3ZlcnJpZGVzIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGludGVyZmFjZSBJVGVzdE9iamVjdCB7XG5cdFx0XHRcdGZvbzogc3RyaW5nO1xuXHRcdFx0XHRiYXI6IHN0cmluZztcblx0XHRcdFx0cmVhZG9ubHkgYmF6OiBudW1iZXI7XG5cdFx0XHRcdHNvbWVNZXRob2QoYXJnOiBib29sZWFuKTogc3RyaW5nO1xuXHRcdFx0XHRhbm90aGVyTWV0aG9kKGFyZzogbnVtYmVyKTogYm9vbGVhbjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzOiBQYXJ0aWFsPElUZXN0T2JqZWN0PiA9IHtcblx0XHRcdFx0YmF6OiA0LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1vY2sgPSBtb2NrT2JqZWN0PElUZXN0T2JqZWN0PihvdmVycmlkZXMpO1xuXHRcdFx0dHlwZUNoZWNrPElUZXN0T2JqZWN0Pihtb2NrKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2NrLmJheixcblx0XHRcdFx0NCxcblx0XHRcdFx0J2JheiBzaG91bGQgYmUgb3ZlcnJpZGRlbicsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBvdmVycmlkZXMgb2JqZWN0IG11c3QgYmUgaW1tdXRhYmxlXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0b3ZlcnJpZGVzLmZvbyA9ICd0ZXN0Jztcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0b3ZlcnJpZGVzLnNvbWVNZXRob2QgPSAoYXJnOiBib29sZWFuKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gYCR7YXJnfV9fJHthcmd9YDtcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbW9ja1NlcnZpY2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgnb3ZlcnJpZGVzIHByb3BlcnRpZXMgYW5kIGZ1bmN0aW9ucycsICgpID0+IHtcblx0XHRcdGludGVyZmFjZSBJVGVzdFNlcnZpY2Uge1xuXHRcdFx0XHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHByb3AxOiBzdHJpbmc7XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGNvdW50ZXI6IG51bWJlcjtcblx0XHRcdFx0bWV0aG9kMShhcmc6IGJvb2xlYW4pOiBzdHJpbmc7XG5cdFx0XHRcdHRlc3RNZXRob2QyKGFyZzogbnVtYmVyKTogYm9vbGVhbjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9jayA9IG1vY2tTZXJ2aWNlPElUZXN0U2VydmljZT4oe1xuXHRcdFx0XHRpZDogJ2NpYW8hJyxcblx0XHRcdFx0Y291bnRlcjogNzQsXG5cdFx0XHRcdHRlc3RNZXRob2QyKGFyZzogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0cmV0dXJuICFpc05hTihhcmcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHR5cGVDaGVjazxJVGVzdFNlcnZpY2U+KG1vY2spO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vY2suaWQsXG5cdFx0XHRcdCdjaWFvIScsXG5cdFx0XHRcdCdpZCBzaG91bGQgYmUgb3ZlcnJpZGRlbicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vY2suY291bnRlcixcblx0XHRcdFx0NzQsXG5cdFx0XHRcdCdjb3VudGVyIHNob3VsZCBiZSBvdmVycmlkZGVuJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0bW9jay50ZXN0TWV0aG9kMig3NDM2OCksXG5cdFx0XHRcdCdNdXN0IGV4ZWN1dGUgb3ZlcnJpZGRlbiBtZXRob2QgY29ycmVjdGx5IDEuJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0IShtb2NrLnRlc3RNZXRob2QyKE5hTikpLFxuXHRcdFx0XHQnTXVzdCBleGVjdXRlIG92ZXJyaWRkZW4gbWV0aG9kIGNvcnJlY3RseSAyLicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0Ly8gcHJvcGVydHkgaXMgbm90IG92ZXJyaWRkZW4gc28gbXVzdCB0aHJvd1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby11bnVzZWQtZXhwcmVzc2lvbnNcblx0XHRcdFx0bW9jay5wcm9wMTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0Ly8gZnVuY3Rpb24gaXMgbm90IG92ZXJyaWRkZW4gc28gbXVzdCB0aHJvd1xuXHRcdFx0XHRtb2NrLm1ldGhvZDEocmFuZG9tQm9vbGVhbigpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW1tdXRhYmlsaXR5IG9mIHRoZSBvdmVycmlkZXMgb2JqZWN0JywgKCkgPT4ge1xuXHRcdFx0aW50ZXJmYWNlIElUZXN0U2VydmljZSB7XG5cdFx0XHRcdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0Zm9vOiBzdHJpbmc7XG5cdFx0XHRcdGJhcjogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBiYXo6IGJvb2xlYW47XG5cdFx0XHRcdHNvbWVNZXRob2QoYXJnOiBib29sZWFuKTogc3RyaW5nO1xuXHRcdFx0XHRhbm90aGVyTWV0aG9kKGFyZzogbnVtYmVyKTogYm9vbGVhbjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzOiBQYXJ0aWFsPElUZXN0U2VydmljZT4gPSB7XG5cdFx0XHRcdGJhejogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbW9jayA9IG1vY2tTZXJ2aWNlPElUZXN0U2VydmljZT4ob3ZlcnJpZGVzKTtcblx0XHRcdHR5cGVDaGVjazxJVGVzdFNlcnZpY2U+KG1vY2spO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vY2suYmF6LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0J2JheiBzaG91bGQgYmUgb3ZlcnJpZGRlbicsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBvdmVycmlkZXMgb2JqZWN0IG11c3QgYmUgaW1tdXRhYmxlXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0b3ZlcnJpZGVzLmZvbyA9ICd0ZXN0Jztcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0b3ZlcnJpZGVzLnNvbWVNZXRob2QgPSAoYXJnOiBib29sZWFuKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gYCR7YXJnfV9fJHthcmd9YDtcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMs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
