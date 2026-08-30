import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getRelaunchArguments, quoteWindowsArgument } from "../../electron-main/updateRelaunchArguments.js";
suite("Win32UpdateService - relaunch arguments", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function args(overrides) {
    return { _: [], ...overrides };
  }
  function getArguments(overrides, rawArgs = []) {
    return getRelaunchArguments(args(overrides), rawArgs, "C:\\cwd");
  }
  test("quoteWindowsArgument", () => {
    assert.strictEqual(quoteWindowsArgument("--disable-gpu"), "--disable-gpu");
    assert.strictEqual(quoteWindowsArgument("C:\\Users\\test\\ext"), "C:\\Users\\test\\ext");
    assert.strictEqual(quoteWindowsArgument("C:\\path with space\\ext"), '"C:\\path with space\\ext"');
    assert.strictEqual(quoteWindowsArgument('a"b'), '"a\\"b"');
    assert.strictEqual(quoteWindowsArgument("C:\\ends with slash\\"), '"C:\\ends with slash\\\\"');
  });
  test("carries forward curated path and flag arguments", () => {
    const result = getArguments({
      "user-data-dir": "C:\\data",
      "extensions-dir": "C:\\path with space\\ext",
      "disable-gpu": true,
      "disable-lcd-text": true
    });
    assert.strictEqual(result, '--user-data-dir=C:\\data "--extensions-dir=C:\\path with space\\ext" --disable-gpu --disable-lcd-text');
  });
  test("returns empty string when no relevant arguments are present", () => {
    assert.strictEqual(getArguments({}), "");
  });
  test("ignores transient and one-shot arguments", () => {
    const result = getArguments({
      _: ["C:\\some\\file.txt"],
      wait: true,
      "new-window": true,
      "install-extension": ["some.extension"],
      "profile": "work",
      "profile-temp": true,
      "crash-reporter-id": "derived-id",
      "logsPath": "C:\\logs",
      "extensions-dir": "C:\\ext"
    });
    assert.strictEqual(result, "--extensions-dir=C:\\ext");
  });
  test("carries forward additional environment string and boolean arguments", () => {
    const result = getArguments({
      "proxy-server": "http://localhost:8080",
      "disable-updates": true
    }, ["--no-sandbox"]);
    assert.strictEqual(result, "--proxy-server=http://localhost:8080 --disable-updates --no-sandbox");
  });
  test("carries forward explicit negated flags from raw arguments", () => {
    const result = getArguments({
      "no-sandbox": false,
      "no-proxy-server": false
    }, ["--no-sandbox", "--no-proxy-server"]);
    assert.strictEqual(result, "--no-sandbox --no-proxy-server");
  });
  test("carries forward string values that start with a hyphen", () => {
    const result = getArguments({
      "js-flags": "--max-old-space-size=8192",
      "enable-tracing": "-*,v8"
    });
    assert.strictEqual(result, "--js-flags=--max-old-space-size=8192 --enable-tracing=-*,v8");
  });
  test("ignores flag arguments that are not set to true", () => {
    const result = getArguments({
      "disable-gpu": false,
      "user-data-dir": ""
    });
    assert.strictEqual(result, "");
  });
  test("resolves relative path arguments against the current working directory", () => {
    const result = getArguments({
      "extensions-dir": ".\\extensions",
      "user-data-dir": "..\\data",
      "trace-startup-file": "trace.json",
      "locale": "de"
    });
    assert.strictEqual(result, "--user-data-dir=C:\\data --extensions-dir=C:\\cwd\\extensions --locale=de --trace-startup-file=C:\\cwd\\trace.json");
  });
  test("ignores negated flags that appear after the end-of-options marker", () => {
    const result = getArguments({
      "extensions-dir": "C:\\ext"
    }, ["--no-proxy-server", "--", "--no-sandbox"]);
    assert.strictEqual(result, "--extensions-dir=C:\\ext --no-proxy-server");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXBkYXRlXFx0ZXN0XFxlbGVjdHJvbi1tYWluXFx1cGRhdGVSZWxhdW5jaEFyZ3VtZW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgZ2V0UmVsYXVuY2hBcmd1bWVudHMsIHF1b3RlV2luZG93c0FyZ3VtZW50IH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tbWFpbi91cGRhdGVSZWxhdW5jaEFyZ3VtZW50cy5qcyc7XG5cbnN1aXRlKCdXaW4zMlVwZGF0ZVNlcnZpY2UgLSByZWxhdW5jaCBhcmd1bWVudHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXJncyhvdmVycmlkZXM6IFBhcnRpYWw8TmF0aXZlUGFyc2VkQXJncz4pOiBOYXRpdmVQYXJzZWRBcmdzIHtcblx0XHRyZXR1cm4geyBfOiBbXSwgLi4ub3ZlcnJpZGVzIH0gYXMgTmF0aXZlUGFyc2VkQXJncztcblx0fVxuXG5cdGZ1bmN0aW9uIGdldEFyZ3VtZW50cyhvdmVycmlkZXM6IFBhcnRpYWw8TmF0aXZlUGFyc2VkQXJncz4sIHJhd0FyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdID0gW10pOiBzdHJpbmcge1xuXHRcdHJldHVybiBnZXRSZWxhdW5jaEFyZ3VtZW50cyhhcmdzKG92ZXJyaWRlcyksIHJhd0FyZ3MsICdDOlxcXFxjd2QnKTtcblx0fVxuXG5cdHRlc3QoJ3F1b3RlV2luZG93c0FyZ3VtZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90ZVdpbmRvd3NBcmd1bWVudCgnLS1kaXNhYmxlLWdwdScpLCAnLS1kaXNhYmxlLWdwdScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90ZVdpbmRvd3NBcmd1bWVudCgnQzpcXFxcVXNlcnNcXFxcdGVzdFxcXFxleHQnKSwgJ0M6XFxcXFVzZXJzXFxcXHRlc3RcXFxcZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3RlV2luZG93c0FyZ3VtZW50KCdDOlxcXFxwYXRoIHdpdGggc3BhY2VcXFxcZXh0JyksICdcIkM6XFxcXHBhdGggd2l0aCBzcGFjZVxcXFxleHRcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90ZVdpbmRvd3NBcmd1bWVudCgnYVwiYicpLCAnXCJhXFxcXFwiYlwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3RlV2luZG93c0FyZ3VtZW50KCdDOlxcXFxlbmRzIHdpdGggc2xhc2hcXFxcJyksICdcIkM6XFxcXGVuZHMgd2l0aCBzbGFzaFxcXFxcXFxcXCInKTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBmb3J3YXJkIGN1cmF0ZWQgcGF0aCBhbmQgZmxhZyBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXJndW1lbnRzKHtcblx0XHRcdCd1c2VyLWRhdGEtZGlyJzogJ0M6XFxcXGRhdGEnLFxuXHRcdFx0J2V4dGVuc2lvbnMtZGlyJzogJ0M6XFxcXHBhdGggd2l0aCBzcGFjZVxcXFxleHQnLFxuXHRcdFx0J2Rpc2FibGUtZ3B1JzogdHJ1ZSxcblx0XHRcdCdkaXNhYmxlLWxjZC10ZXh0JzogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJy0tdXNlci1kYXRhLWRpcj1DOlxcXFxkYXRhIFwiLS1leHRlbnNpb25zLWRpcj1DOlxcXFxwYXRoIHdpdGggc3BhY2VcXFxcZXh0XCIgLS1kaXNhYmxlLWdwdSAtLWRpc2FibGUtbGNkLXRleHQnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBzdHJpbmcgd2hlbiBubyByZWxldmFudCBhcmd1bWVudHMgYXJlIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFyZ3VtZW50cyh7fSksICcnKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB0cmFuc2llbnQgYW5kIG9uZS1zaG90IGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcmd1bWVudHMoe1xuXHRcdFx0XzogWydDOlxcXFxzb21lXFxcXGZpbGUudHh0J10sXG5cdFx0XHR3YWl0OiB0cnVlLFxuXHRcdFx0J25ldy13aW5kb3cnOiB0cnVlLFxuXHRcdFx0J2luc3RhbGwtZXh0ZW5zaW9uJzogWydzb21lLmV4dGVuc2lvbiddLFxuXHRcdFx0J3Byb2ZpbGUnOiAnd29yaycsXG5cdFx0XHQncHJvZmlsZS10ZW1wJzogdHJ1ZSxcblx0XHRcdCdjcmFzaC1yZXBvcnRlci1pZCc6ICdkZXJpdmVkLWlkJyxcblx0XHRcdCdsb2dzUGF0aCc6ICdDOlxcXFxsb2dzJyxcblx0XHRcdCdleHRlbnNpb25zLWRpcic6ICdDOlxcXFxleHQnXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnLS1leHRlbnNpb25zLWRpcj1DOlxcXFxleHQnKTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBmb3J3YXJkIGFkZGl0aW9uYWwgZW52aXJvbm1lbnQgc3RyaW5nIGFuZCBib29sZWFuIGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcmd1bWVudHMoe1xuXHRcdFx0J3Byb3h5LXNlcnZlcic6ICdodHRwOi8vbG9jYWxob3N0OjgwODAnLFxuXHRcdFx0J2Rpc2FibGUtdXBkYXRlcyc6IHRydWVcblx0XHR9LCBbJy0tbm8tc2FuZGJveCddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICctLXByb3h5LXNlcnZlcj1odHRwOi8vbG9jYWxob3N0OjgwODAgLS1kaXNhYmxlLXVwZGF0ZXMgLS1uby1zYW5kYm94Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcnJpZXMgZm9yd2FyZCBleHBsaWNpdCBuZWdhdGVkIGZsYWdzIGZyb20gcmF3IGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcmd1bWVudHMoe1xuXHRcdFx0J25vLXNhbmRib3gnOiBmYWxzZSxcblx0XHRcdCduby1wcm94eS1zZXJ2ZXInOiBmYWxzZVxuXHRcdH0sIFsnLS1uby1zYW5kYm94JywgJy0tbm8tcHJveHktc2VydmVyJ10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJy0tbm8tc2FuZGJveCAtLW5vLXByb3h5LXNlcnZlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGZvcndhcmQgc3RyaW5nIHZhbHVlcyB0aGF0IHN0YXJ0IHdpdGggYSBoeXBoZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXJndW1lbnRzKHtcblx0XHRcdCdqcy1mbGFncyc6ICctLW1heC1vbGQtc3BhY2Utc2l6ZT04MTkyJyxcblx0XHRcdCdlbmFibGUtdHJhY2luZyc6ICctKix2OCdcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICctLWpzLWZsYWdzPS0tbWF4LW9sZC1zcGFjZS1zaXplPTgxOTIgLS1lbmFibGUtdHJhY2luZz0tKix2OCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGZsYWcgYXJndW1lbnRzIHRoYXQgYXJlIG5vdCBzZXQgdG8gdHJ1ZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcmd1bWVudHMoe1xuXHRcdFx0J2Rpc2FibGUtZ3B1JzogZmFsc2UsXG5cdFx0XHQndXNlci1kYXRhLWRpcic6ICcnXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHJlbGF0aXZlIHBhdGggYXJndW1lbnRzIGFnYWluc3QgdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXJndW1lbnRzKHtcblx0XHRcdCdleHRlbnNpb25zLWRpcic6ICcuXFxcXGV4dGVuc2lvbnMnLFxuXHRcdFx0J3VzZXItZGF0YS1kaXInOiAnLi5cXFxcZGF0YScsXG5cdFx0XHQndHJhY2Utc3RhcnR1cC1maWxlJzogJ3RyYWNlLmpzb24nLFxuXHRcdFx0J2xvY2FsZSc6ICdkZSdcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICctLXVzZXItZGF0YS1kaXI9QzpcXFxcZGF0YSAtLWV4dGVuc2lvbnMtZGlyPUM6XFxcXGN3ZFxcXFxleHRlbnNpb25zIC0tbG9jYWxlPWRlIC0tdHJhY2Utc3RhcnR1cC1maWxlPUM6XFxcXGN3ZFxcXFx0cmFjZS5qc29uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbmVnYXRlZCBmbGFncyB0aGF0IGFwcGVhciBhZnRlciB0aGUgZW5kLW9mLW9wdGlvbnMgbWFya2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEFyZ3VtZW50cyh7XG5cdFx0XHQnZXh0ZW5zaW9ucy1kaXInOiAnQzpcXFxcZXh0J1xuXHRcdH0sIFsnLS1uby1wcm94eS1zZXJ2ZXInLCAnLS0nLCAnLS1uby1zYW5kYm94J10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJy0tZXh0ZW5zaW9ucy1kaXI9QzpcXFxcZXh0IC0tbm8tcHJveHktc2VydmVyJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxzQkFBc0IsNEJBQTRCO0FBRTNELE1BQU0sMkNBQTJDLE1BQU07QUFFdEQsMENBQXdDO0FBRXhDLFdBQVMsS0FBSyxXQUF3RDtBQUNyRSxXQUFPLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxVQUFVO0FBQUEsRUFDOUI7QUFFQSxXQUFTLGFBQWEsV0FBc0MsVUFBNkIsQ0FBQyxHQUFXO0FBQ3BHLFdBQU8scUJBQXFCLEtBQUssU0FBUyxHQUFHLFNBQVMsU0FBUztBQUFBLEVBQ2hFO0FBRUEsT0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxXQUFPLFlBQVkscUJBQXFCLGVBQWUsR0FBRyxlQUFlO0FBQ3pFLFdBQU8sWUFBWSxxQkFBcUIsc0JBQXNCLEdBQUcsc0JBQXNCO0FBQ3ZGLFdBQU8sWUFBWSxxQkFBcUIsMEJBQTBCLEdBQUcsNEJBQTRCO0FBQ2pHLFdBQU8sWUFBWSxxQkFBcUIsS0FBSyxHQUFHLFNBQVM7QUFDekQsV0FBTyxZQUFZLHFCQUFxQix1QkFBdUIsR0FBRywyQkFBMkI7QUFBQSxFQUM5RixDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxVQUFNLFNBQVMsYUFBYTtBQUFBLE1BQzNCLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFFRCxXQUFPLFlBQVksUUFBUSx1R0FBdUc7QUFBQSxFQUNuSSxDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxXQUFPLFlBQVksYUFBYSxDQUFDLENBQUMsR0FBRyxFQUFFO0FBQUEsRUFDeEMsQ0FBQztBQUVELE9BQUssNENBQTRDLE1BQU07QUFDdEQsVUFBTSxTQUFTLGFBQWE7QUFBQSxNQUMzQixHQUFHLENBQUMsb0JBQW9CO0FBQUEsTUFDeEIsTUFBTTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QscUJBQXFCLENBQUMsZ0JBQWdCO0FBQUEsTUFDdEMsV0FBVztBQUFBLE1BQ1gsZ0JBQWdCO0FBQUEsTUFDaEIscUJBQXFCO0FBQUEsTUFDckIsWUFBWTtBQUFBLE1BQ1osa0JBQWtCO0FBQUEsSUFDbkIsQ0FBQztBQUVELFdBQU8sWUFBWSxRQUFRLDBCQUEwQjtBQUFBLEVBQ3RELENBQUM7QUFFRCxPQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFVBQU0sU0FBUyxhQUFhO0FBQUEsTUFDM0IsZ0JBQWdCO0FBQUEsTUFDaEIsbUJBQW1CO0FBQUEsSUFDcEIsR0FBRyxDQUFDLGNBQWMsQ0FBQztBQUVuQixXQUFPLFlBQVksUUFBUSxxRUFBcUU7QUFBQSxFQUNqRyxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLFNBQVMsYUFBYTtBQUFBLE1BQzNCLGNBQWM7QUFBQSxNQUNkLG1CQUFtQjtBQUFBLElBQ3BCLEdBQUcsQ0FBQyxnQkFBZ0IsbUJBQW1CLENBQUM7QUFFeEMsV0FBTyxZQUFZLFFBQVEsZ0NBQWdDO0FBQUEsRUFDNUQsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSxTQUFTLGFBQWE7QUFBQSxNQUMzQixZQUFZO0FBQUEsTUFDWixrQkFBa0I7QUFBQSxJQUNuQixDQUFDO0FBRUQsV0FBTyxZQUFZLFFBQVEsNkRBQTZEO0FBQUEsRUFDekYsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFDN0QsVUFBTSxTQUFTLGFBQWE7QUFBQSxNQUMzQixlQUFlO0FBQUEsTUFDZixpQkFBaUI7QUFBQSxJQUNsQixDQUFDO0FBRUQsV0FBTyxZQUFZLFFBQVEsRUFBRTtBQUFBLEVBQzlCLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sU0FBUyxhQUFhO0FBQUEsTUFDM0Isa0JBQWtCO0FBQUEsTUFDbEIsaUJBQWlCO0FBQUEsTUFDakIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLElBQ1gsQ0FBQztBQUVELFdBQU8sWUFBWSxRQUFRLG9IQUFvSDtBQUFBLEVBQ2hKLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFVBQU0sU0FBUyxhQUFhO0FBQUEsTUFDM0Isa0JBQWtCO0FBQUEsSUFDbkIsR0FBRyxDQUFDLHFCQUFxQixNQUFNLGNBQWMsQ0FBQztBQUU5QyxXQUFPLFlBQVksUUFBUSw0Q0FBNEM7QUFBQSxFQUN4RSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
