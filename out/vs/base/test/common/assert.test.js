import assert from "assert";
import { ok, assert as commonAssert } from "../../common/assert.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { CancellationError, ReadonlyError } from "../../common/errors.js";
suite("Assert", () => {
  test("ok", () => {
    assert.throws(function() {
      ok(false);
    });
    assert.throws(function() {
      ok(null);
    });
    assert.throws(function() {
      ok();
    });
    assert.throws(function() {
      ok(null, "Foo Bar");
    }, function(e) {
      return e.message.indexOf("Foo Bar") >= 0;
    });
    ok(true);
    ok("foo");
    ok({});
    ok(5);
  });
  suite("throws a provided error object", () => {
    test("generic error", () => {
      const originalError = new Error("Oh no!");
      try {
        commonAssert(
          false,
          originalError
        );
      } catch (thrownError) {
        assert.strictEqual(
          thrownError,
          originalError,
          "Must throw the provided error instance."
        );
        assert.strictEqual(
          thrownError.message,
          "Oh no!",
          "Must throw the provided error instance."
        );
      }
    });
    test("cancellation error", () => {
      const originalError = new CancellationError();
      try {
        commonAssert(
          false,
          originalError
        );
      } catch (thrownError) {
        assert.strictEqual(
          thrownError,
          originalError,
          "Must throw the provided error instance."
        );
      }
    });
    test("readonly error", () => {
      const originalError = new ReadonlyError("World");
      try {
        commonAssert(
          false,
          originalError
        );
      } catch (thrownError) {
        assert.strictEqual(
          thrownError,
          originalError,
          "Must throw the provided error instance."
        );
        assert.strictEqual(
          thrownError.message,
          "World is read-only and cannot be changed",
          "Must throw the provided error instance."
        );
      }
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGFzc2VydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgb2ssIGFzc2VydCBhcyBjb21tb25Bc3NlcnQgfSBmcm9tICcuLi8uLi9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIFJlYWRvbmx5RXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vZXJyb3JzLmpzJztcblxuc3VpdGUoJ0Fzc2VydCcsICgpID0+IHtcblx0dGVzdCgnb2snLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRvayhmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKGZ1bmN0aW9uICgpIHtcblx0XHRcdG9rKG51bGwpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnRocm93cyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRvaygpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnRocm93cyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRvayhudWxsLCAnRm9vIEJhcicpO1xuXHRcdH0sIGZ1bmN0aW9uIChlOiBFcnJvcikge1xuXHRcdFx0cmV0dXJuIGUubWVzc2FnZS5pbmRleE9mKCdGb28gQmFyJykgPj0gMDtcblx0XHR9KTtcblxuXHRcdG9rKHRydWUpO1xuXHRcdG9rKCdmb28nKTtcblx0XHRvayh7fSk7XG5cdFx0b2soNSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0aHJvd3MgYSBwcm92aWRlZCBlcnJvciBvYmplY3QnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZ2VuZXJpYyBlcnJvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsRXJyb3IgPSBuZXcgRXJyb3IoJ09oIG5vIScpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb21tb25Bc3NlcnQoXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0b3JpZ2luYWxFcnJvcixcblx0XHRcdFx0KTtcblx0XHRcdH0gY2F0Y2ggKHRocm93bkVycm9yKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHR0aHJvd25FcnJvcixcblx0XHRcdFx0XHRvcmlnaW5hbEVycm9yLFxuXHRcdFx0XHRcdCdNdXN0IHRocm93IHRoZSBwcm92aWRlZCBlcnJvciBpbnN0YW5jZS4nLFxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHR0aHJvd25FcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRcdCdPaCBubyEnLFxuXHRcdFx0XHRcdCdNdXN0IHRocm93IHRoZSBwcm92aWRlZCBlcnJvciBpbnN0YW5jZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsbGF0aW9uIGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxFcnJvciA9IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb21tb25Bc3NlcnQoXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0b3JpZ2luYWxFcnJvcixcblx0XHRcdFx0KTtcblx0XHRcdH0gY2F0Y2ggKHRocm93bkVycm9yKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHR0aHJvd25FcnJvcixcblx0XHRcdFx0XHRvcmlnaW5hbEVycm9yLFxuXHRcdFx0XHRcdCdNdXN0IHRocm93IHRoZSBwcm92aWRlZCBlcnJvciBpbnN0YW5jZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZG9ubHkgZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEVycm9yID0gbmV3IFJlYWRvbmx5RXJyb3IoJ1dvcmxkJyk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbW1vbkFzc2VydChcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRvcmlnaW5hbEVycm9yLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBjYXRjaCAodGhyb3duRXJyb3IpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHRocm93bkVycm9yLFxuXHRcdFx0XHRcdG9yaWdpbmFsRXJyb3IsXG5cdFx0XHRcdFx0J011c3QgdGhyb3cgdGhlIHByb3ZpZGVkIGVycm9yIGluc3RhbmNlLicsXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHRocm93bkVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFx0J1dvcmxkIGlzIHJlYWQtb25seSBhbmQgY2Fubm90IGJlIGNoYW5nZWQnLFxuXHRcdFx0XHRcdCdNdXN0IHRocm93IHRoZSBwcm92aWRlZCBlcnJvciBpbnN0YW5jZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsSUFBSSxVQUFVLG9CQUFvQjtBQUMzQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQixxQkFBcUI7QUFFakQsTUFBTSxVQUFVLE1BQU07QUFDckIsT0FBSyxNQUFNLE1BQU07QUFDaEIsV0FBTyxPQUFPLFdBQVk7QUFDekIsU0FBRyxLQUFLO0FBQUEsSUFDVCxDQUFDO0FBRUQsV0FBTyxPQUFPLFdBQVk7QUFDekIsU0FBRyxJQUFJO0FBQUEsSUFDUixDQUFDO0FBRUQsV0FBTyxPQUFPLFdBQVk7QUFDekIsU0FBRztBQUFBLElBQ0osQ0FBQztBQUVELFdBQU8sT0FBTyxXQUFZO0FBQ3pCLFNBQUcsTUFBTSxTQUFTO0FBQUEsSUFDbkIsR0FBRyxTQUFVLEdBQVU7QUFDdEIsYUFBTyxFQUFFLFFBQVEsUUFBUSxTQUFTLEtBQUs7QUFBQSxJQUN4QyxDQUFDO0FBRUQsT0FBRyxJQUFJO0FBQ1AsT0FBRyxLQUFLO0FBQ1IsT0FBRyxDQUFDLENBQUM7QUFDTCxPQUFHLENBQUM7QUFBQSxFQUNMLENBQUM7QUFFRCxRQUFNLGtDQUFrQyxNQUFNO0FBQzdDLFNBQUssaUJBQWlCLE1BQU07QUFDM0IsWUFBTSxnQkFBZ0IsSUFBSSxNQUFNLFFBQVE7QUFFeEMsVUFBSTtBQUNIO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxTQUFTLGFBQWE7QUFDckIsZUFBTztBQUFBLFVBQ047QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFFQSxlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsVUFDWjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssc0JBQXNCLE1BQU07QUFDaEMsWUFBTSxnQkFBZ0IsSUFBSSxrQkFBa0I7QUFFNUMsVUFBSTtBQUNIO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxTQUFTLGFBQWE7QUFDckIsZUFBTztBQUFBLFVBQ047QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrQkFBa0IsTUFBTTtBQUM1QixZQUFNLGdCQUFnQixJQUFJLGNBQWMsT0FBTztBQUUvQyxVQUFJO0FBQ0g7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELFNBQVMsYUFBYTtBQUNyQixlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUVBLGVBQU87QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsMENBQXdDO0FBQ3pDLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
