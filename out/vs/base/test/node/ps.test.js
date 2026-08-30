import { deepStrictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
import { JS_FILENAME_PATTERN } from "../../node/ps.js";
suite("Process Utils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("JS file regex", () => {
    function findJsFiles(cmd) {
      const matches = [];
      let match;
      while ((match = JS_FILENAME_PATTERN.exec(cmd)) !== null) {
        matches.push(match[0]);
      }
      return matches;
    }
    test("should match simple .js files", () => {
      deepStrictEqual(findJsFiles("node bootstrap.js"), ["bootstrap.js"]);
    });
    test("should match multiple .js files", () => {
      deepStrictEqual(findJsFiles("node server.js --require helper.js"), ["server.js", "helper.js"]);
    });
    test("should match .js files with hyphens", () => {
      deepStrictEqual(findJsFiles("node my-script.js"), ["my-script.js"]);
    });
    test("should not match .json files", () => {
      deepStrictEqual(findJsFiles("cat package.json"), []);
    });
    test("should not match .js prefix in .json extension (regression test for \\b fix)", () => {
      deepStrictEqual(findJsFiles("node --config tsconfig.json"), []);
      deepStrictEqual(findJsFiles("eslint.json"), []);
    });
    test("should not match .jsx files", () => {
      deepStrictEqual(findJsFiles("node component.jsx"), []);
    });
    test("should match .js but not .json in same command", () => {
      deepStrictEqual(findJsFiles("node app.js --config settings.json"), ["app.js"]);
    });
    test("should not match partial matches inside other extensions", () => {
      deepStrictEqual(findJsFiles("file.jsmith"), []);
    });
    test("should match .js at end of command", () => {
      deepStrictEqual(findJsFiles("/path/to/script.js"), ["script.js"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFxwcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBKU19GSUxFTkFNRV9QQVRURVJOIH0gZnJvbSAnLi4vLi4vbm9kZS9wcy5qcyc7XG5cbnN1aXRlKCdQcm9jZXNzIFV0aWxzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdKUyBmaWxlIHJlZ2V4JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gZmluZEpzRmlsZXMoY21kOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0XHRjb25zdCBtYXRjaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0bGV0IG1hdGNoO1xuXHRcdFx0d2hpbGUgKChtYXRjaCA9IEpTX0ZJTEVOQU1FX1BBVFRFUk4uZXhlYyhjbWQpKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRtYXRjaGVzLnB1c2gobWF0Y2hbMF0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hdGNoZXM7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIG1hdGNoIHNpbXBsZSAuanMgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmluZEpzRmlsZXMoJ25vZGUgYm9vdHN0cmFwLmpzJyksIFsnYm9vdHN0cmFwLmpzJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG1hdGNoIG11bHRpcGxlIC5qcyBmaWxlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnbm9kZSBzZXJ2ZXIuanMgLS1yZXF1aXJlIGhlbHBlci5qcycpLCBbJ3NlcnZlci5qcycsICdoZWxwZXIuanMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWF0Y2ggLmpzIGZpbGVzIHdpdGggaHlwaGVucycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnbm9kZSBteS1zY3JpcHQuanMnKSwgWydteS1zY3JpcHQuanMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IG1hdGNoIC5qc29uIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGZpbmRKc0ZpbGVzKCdjYXQgcGFja2FnZS5qc29uJyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbWF0Y2ggLmpzIHByZWZpeCBpbiAuanNvbiBleHRlbnNpb24gKHJlZ3Jlc3Npb24gdGVzdCBmb3IgXFxcXGIgZml4KScsICgpID0+IHtcblx0XHRcdC8vIFdpdGhvdXQgdGhlIFxcYiB3b3JkIGJvdW5kYXJ5LCB0aGUgcmVnZXggd291bGQgaW5jb3JyZWN0bHkgbWF0Y2ggXCJwYWNrYWdlLmpzXCIgZnJvbSBcInBhY2thZ2UuanNvblwiXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmluZEpzRmlsZXMoJ25vZGUgLS1jb25maWcgdHNjb25maWcuanNvbicpLCBbXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmluZEpzRmlsZXMoJ2VzbGludC5qc29uJyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbWF0Y2ggLmpzeCBmaWxlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnbm9kZSBjb21wb25lbnQuanN4JyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBtYXRjaCAuanMgYnV0IG5vdCAuanNvbiBpbiBzYW1lIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmluZEpzRmlsZXMoJ25vZGUgYXBwLmpzIC0tY29uZmlnIHNldHRpbmdzLmpzb24nKSwgWydhcHAuanMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IG1hdGNoIHBhcnRpYWwgbWF0Y2hlcyBpbnNpZGUgb3RoZXIgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnZmlsZS5qc21pdGgnKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG1hdGNoIC5qcyBhdCBlbmQgb2YgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnL3BhdGgvdG8vc2NyaXB0LmpzJyksIFsnc2NyaXB0LmpzJ10pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUVwQyxNQUFNLGlCQUFpQixNQUFNO0FBRTVCLDBDQUF3QztBQUV4QyxRQUFNLGlCQUFpQixNQUFNO0FBRTVCLGFBQVMsWUFBWSxLQUF1QjtBQUMzQyxZQUFNLFVBQW9CLENBQUM7QUFDM0IsVUFBSTtBQUNKLGNBQVEsUUFBUSxvQkFBb0IsS0FBSyxHQUFHLE9BQU8sTUFBTTtBQUN4RCxnQkFBUSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDdEI7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssaUNBQWlDLE1BQU07QUFDM0Msc0JBQWdCLFlBQVksbUJBQW1CLEdBQUcsQ0FBQyxjQUFjLENBQUM7QUFBQSxJQUNuRSxDQUFDO0FBRUQsU0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxzQkFBZ0IsWUFBWSxvQ0FBb0MsR0FBRyxDQUFDLGFBQWEsV0FBVyxDQUFDO0FBQUEsSUFDOUYsQ0FBQztBQUVELFNBQUssdUNBQXVDLE1BQU07QUFDakQsc0JBQWdCLFlBQVksbUJBQW1CLEdBQUcsQ0FBQyxjQUFjLENBQUM7QUFBQSxJQUNuRSxDQUFDO0FBRUQsU0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxzQkFBZ0IsWUFBWSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBRUQsU0FBSyxnRkFBZ0YsTUFBTTtBQUUxRixzQkFBZ0IsWUFBWSw2QkFBNkIsR0FBRyxDQUFDLENBQUM7QUFDOUQsc0JBQWdCLFlBQVksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQy9DLENBQUM7QUFFRCxTQUFLLCtCQUErQixNQUFNO0FBQ3pDLHNCQUFnQixZQUFZLG9CQUFvQixHQUFHLENBQUMsQ0FBQztBQUFBLElBQ3RELENBQUM7QUFFRCxTQUFLLGtEQUFrRCxNQUFNO0FBQzVELHNCQUFnQixZQUFZLG9DQUFvQyxHQUFHLENBQUMsUUFBUSxDQUFDO0FBQUEsSUFDOUUsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsc0JBQWdCLFlBQVksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQy9DLENBQUM7QUFFRCxTQUFLLHNDQUFzQyxNQUFNO0FBQ2hELHNCQUFnQixZQUFZLG9CQUFvQixHQUFHLENBQUMsV0FBVyxDQUFDO0FBQUEsSUFDakUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
