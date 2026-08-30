import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { combineUriFlags } from "../../node/cliArgs.js";
suite("combineUriFlags", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rewrites --folder-uri and --file-uri followed by a URI into --flag=value", () => {
    assert.deepStrictEqual(
      combineUriFlags([
        "--wait",
        "--folder-uri",
        "vscode-remote://ssh-remote+host/workspace",
        "--file-uri",
        "vscode-remote://ssh-remote+host/file.txt",
        "--new-window",
        "--folder-uri=vscode-remote://already-joined/workspace",
        "--folder-uri"
        // trailing flag with no value
      ]),
      [
        "--wait",
        "--folder-uri=vscode-remote://ssh-remote+host/workspace",
        "--file-uri=vscode-remote://ssh-remote+host/file.txt",
        "--new-window",
        "--folder-uri=vscode-remote://already-joined/workspace",
        "--folder-uri"
      ]
    );
  });
  test("does not join when next argument is a flag", () => {
    assert.deepStrictEqual(
      combineUriFlags(["--folder-uri", "--wait", "somepath"]),
      ["--folder-uri", "--wait", "somepath"]
    );
  });
  test("leaves unrelated arguments untouched", () => {
    assert.deepStrictEqual(
      combineUriFlags(["--wait", "--new-window", "C:\\some\\path"]),
      ["--wait", "--new-window", "C:\\some\\path"]
    );
  });
  test("does not rewrite past the -- end-of-options marker", () => {
    assert.deepStrictEqual(
      combineUriFlags([
        "--wait",
        "--folder-uri",
        "vscode-remote://host/before",
        "--",
        "--folder-uri",
        "vscode-remote://host/after",
        "--file-uri",
        "vscode-remote://host/file.txt"
      ]),
      [
        "--wait",
        "--folder-uri=vscode-remote://host/before",
        "--",
        "--folder-uri",
        "vscode-remote://host/after",
        "--file-uri",
        "vscode-remote://host/file.txt"
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFx0ZXN0XFxub2RlXFxjbGlBcmdzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNvbWJpbmVVcmlGbGFncyB9IGZyb20gJy4uLy4uL25vZGUvY2xpQXJncy5qcyc7XG5cbnN1aXRlKCdjb21iaW5lVXJpRmxhZ3MnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV3cml0ZXMgLS1mb2xkZXItdXJpIGFuZCAtLWZpbGUtdXJpIGZvbGxvd2VkIGJ5IGEgVVJJIGludG8gLS1mbGFnPXZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb21iaW5lVXJpRmxhZ3MoW1xuXHRcdFx0XHQnLS13YWl0Jyxcblx0XHRcdFx0Jy0tZm9sZGVyLXVyaScsICd2c2NvZGUtcmVtb3RlOi8vc3NoLXJlbW90ZStob3N0L3dvcmtzcGFjZScsXG5cdFx0XHRcdCctLWZpbGUtdXJpJywgJ3ZzY29kZS1yZW1vdGU6Ly9zc2gtcmVtb3RlK2hvc3QvZmlsZS50eHQnLFxuXHRcdFx0XHQnLS1uZXctd2luZG93Jyxcblx0XHRcdFx0Jy0tZm9sZGVyLXVyaT12c2NvZGUtcmVtb3RlOi8vYWxyZWFkeS1qb2luZWQvd29ya3NwYWNlJyxcblx0XHRcdFx0Jy0tZm9sZGVyLXVyaScsIC8vIHRyYWlsaW5nIGZsYWcgd2l0aCBubyB2YWx1ZVxuXHRcdFx0XSksXG5cdFx0XHRbXG5cdFx0XHRcdCctLXdhaXQnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpPXZzY29kZS1yZW1vdGU6Ly9zc2gtcmVtb3RlK2hvc3Qvd29ya3NwYWNlJyxcblx0XHRcdFx0Jy0tZmlsZS11cmk9dnNjb2RlLXJlbW90ZTovL3NzaC1yZW1vdGUraG9zdC9maWxlLnR4dCcsXG5cdFx0XHRcdCctLW5ldy13aW5kb3cnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpPXZzY29kZS1yZW1vdGU6Ly9hbHJlYWR5LWpvaW5lZC93b3Jrc3BhY2UnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpJyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBqb2luIHdoZW4gbmV4dCBhcmd1bWVudCBpcyBhIGZsYWcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvbWJpbmVVcmlGbGFncyhbJy0tZm9sZGVyLXVyaScsICctLXdhaXQnLCAnc29tZXBhdGgnXSksXG5cdFx0XHRbJy0tZm9sZGVyLXVyaScsICctLXdhaXQnLCAnc29tZXBhdGgnXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyB1bnJlbGF0ZWQgYXJndW1lbnRzIHVudG91Y2hlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y29tYmluZVVyaUZsYWdzKFsnLS13YWl0JywgJy0tbmV3LXdpbmRvdycsICdDOlxcXFxzb21lXFxcXHBhdGgnXSksXG5cdFx0XHRbJy0td2FpdCcsICctLW5ldy13aW5kb3cnLCAnQzpcXFxcc29tZVxcXFxwYXRoJ11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXdyaXRlIHBhc3QgdGhlIC0tIGVuZC1vZi1vcHRpb25zIG1hcmtlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y29tYmluZVVyaUZsYWdzKFtcblx0XHRcdFx0Jy0td2FpdCcsXG5cdFx0XHRcdCctLWZvbGRlci11cmknLCAndnNjb2RlLXJlbW90ZTovL2hvc3QvYmVmb3JlJyxcblx0XHRcdFx0Jy0tJyxcblx0XHRcdFx0Jy0tZm9sZGVyLXVyaScsICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9hZnRlcicsXG5cdFx0XHRcdCctLWZpbGUtdXJpJywgJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L2ZpbGUudHh0Jyxcblx0XHRcdF0pLFxuXHRcdFx0W1xuXHRcdFx0XHQnLS13YWl0Jyxcblx0XHRcdFx0Jy0tZm9sZGVyLXVyaT12c2NvZGUtcmVtb3RlOi8vaG9zdC9iZWZvcmUnLFxuXHRcdFx0XHQnLS0nLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpJywgJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L2FmdGVyJyxcblx0XHRcdFx0Jy0tZmlsZS11cmknLCAndnNjb2RlLXJlbW90ZTovL2hvc3QvZmlsZS50eHQnLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QiwwQ0FBd0M7QUFFeEMsT0FBSyw0RUFBNEUsTUFBTTtBQUN0RixXQUFPO0FBQUEsTUFDTixnQkFBZ0I7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQWdCO0FBQUEsUUFDaEI7QUFBQSxRQUFjO0FBQUEsUUFDZDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUE7QUFBQSxNQUNELENBQUM7QUFBQSxNQUNEO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFdBQU87QUFBQSxNQUNOLGdCQUFnQixDQUFDLGdCQUFnQixVQUFVLFVBQVUsQ0FBQztBQUFBLE1BQ3RELENBQUMsZ0JBQWdCLFVBQVUsVUFBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxXQUFPO0FBQUEsTUFDTixnQkFBZ0IsQ0FBQyxVQUFVLGdCQUFnQixnQkFBZ0IsQ0FBQztBQUFBLE1BQzVELENBQUMsVUFBVSxnQkFBZ0IsZ0JBQWdCO0FBQUEsSUFDNUM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFdBQU87QUFBQSxNQUNOLGdCQUFnQjtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFBZ0I7QUFBQSxRQUNoQjtBQUFBLFFBQ0E7QUFBQSxRQUFnQjtBQUFBLFFBQ2hCO0FBQUEsUUFBYztBQUFBLE1BQ2YsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFBZ0I7QUFBQSxRQUNoQjtBQUFBLFFBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
