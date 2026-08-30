import * as assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogger } from "../../../../../platform/log/common/log.js";
import { McpIcons, parseAndValidateMcpIcon } from "../../common/mcpIcons.js";
import { McpServerTransportType } from "../../common/mcpTypes.js";
const createHttpLaunch = (url) => ({
  type: McpServerTransportType.HTTP,
  uri: URI.parse(url),
  headers: []
});
const createStdioLaunch = () => ({
  type: McpServerTransportType.Stdio,
  cwd: void 0,
  command: "cmd",
  args: [],
  env: {},
  envFile: void 0,
  sandbox: void 0
});
suite("MCP Icons", () => {
  suite("parseAndValidateMcpIcon", () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test("includes supported icons and sorts sizes ascending", () => {
      const logger = new NullLogger();
      const launch = createHttpLaunch("https://example.com");
      const result = parseAndValidateMcpIcon({
        icons: [
          { src: "ftp://example.com/ignored.png", mimeType: "image/png" },
          { src: "data:image/png;base64,AAA", mimeType: "image/png", sizes: ["64x64", "16x16"] },
          { src: "https://example.com/icon.png", mimeType: "image/png", sizes: ["128x128"] }
        ]
      }, launch, logger);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].src.toString(true), "data:image/png;base64,AAA");
      assert.deepStrictEqual(result[0].sizes.map((s) => s.width), [16, 64]);
      assert.strictEqual(result[1].src.toString(), "https://example.com/icon.png");
      assert.deepStrictEqual(result[1].sizes, [{ width: 128, height: 128 }]);
    });
    test("requires http transport with matching authority for remote icons", () => {
      const logger = new NullLogger();
      const httpLaunch = createHttpLaunch("https://example.com");
      const stdioLaunch = createStdioLaunch();
      const icons = {
        icons: [
          { src: "https://example.com/icon.png", mimeType: "image/png", sizes: ["64x64"] },
          { src: "https://other.com/icon.png", mimeType: "image/png", sizes: ["64x64"] }
        ]
      };
      const httpResult = parseAndValidateMcpIcon(icons, httpLaunch, logger);
      assert.deepStrictEqual(httpResult.map((icon) => icon.src.toString()), ["https://example.com/icon.png"]);
      const stdioResult = parseAndValidateMcpIcon(icons, stdioLaunch, logger);
      assert.strictEqual(stdioResult.length, 0);
    });
    test("accepts file icons only for stdio transport", () => {
      const logger = new NullLogger();
      const stdioLaunch = createStdioLaunch();
      const httpLaunch = createHttpLaunch("https://example.com");
      const icons = {
        icons: [
          { src: "file:///tmp/icon.png", mimeType: "image/png", sizes: ["32x32"] }
        ]
      };
      const stdioResult = parseAndValidateMcpIcon(icons, stdioLaunch, logger);
      assert.strictEqual(stdioResult.length, 1);
      assert.strictEqual(stdioResult[0].src.scheme, "file");
      const httpResult = parseAndValidateMcpIcon(icons, httpLaunch, logger);
      assert.strictEqual(httpResult.length, 0);
    });
  });
  suite("McpIcons", () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test("getUrl returns undefined when no icons are available", () => {
      const icons = McpIcons.fromParsed(void 0);
      assert.strictEqual(icons.getUrl(16), void 0);
    });
    test("getUrl prefers theme-specific icons and keeps light fallback", () => {
      const logger = new NullLogger();
      const launch = createHttpLaunch("https://example.com");
      const parsed = parseAndValidateMcpIcon({
        icons: [
          { src: "https://example.com/dark.png", mimeType: "image/png", sizes: ["16x16", "48x48"], theme: "dark" },
          { src: "https://example.com/any.png", mimeType: "image/png", sizes: ["24x24"] },
          { src: "https://example.com/light.png", mimeType: "image/png", sizes: ["64x64"], theme: "light" }
        ]
      }, launch, logger);
      const icons = McpIcons.fromParsed(parsed);
      const result = icons.getUrl(32);
      assert.ok(result);
      assert.strictEqual(result.dark.toString(), "https://example.com/dark.png");
      assert.strictEqual(result.light?.toString(), "https://example.com/light.png");
    });
    test("getUrl falls back to any-theme icons when no exact size exists", () => {
      const logger = new NullLogger();
      const launch = createHttpLaunch("https://example.com");
      const parsed = parseAndValidateMcpIcon({
        icons: [
          { src: "https://example.com/dark.png", mimeType: "image/png", sizes: ["16x16"], theme: "dark" },
          { src: "https://example.com/any.png", mimeType: "image/png", sizes: ["64x64"] }
        ]
      }, launch, logger);
      const icons = McpIcons.fromParsed(parsed);
      const result = icons.getUrl(60);
      assert.ok(result);
      assert.strictEqual(result.dark.toString(), "https://example.com/any.png");
      assert.strictEqual(result.light, void 0);
    });
    test("getUrl reuses light icons when dark theme assets are missing", () => {
      const logger = new NullLogger();
      const launch = createHttpLaunch("https://example.com");
      const parsed = parseAndValidateMcpIcon({
        icons: [
          { src: "https://example.com/light.png", mimeType: "image/png", sizes: ["32x32"], theme: "light" }
        ]
      }, launch, logger);
      const icons = McpIcons.fromParsed(parsed);
      const result = icons.getUrl(16);
      assert.ok(result);
      assert.strictEqual(result.dark.toString(), "https://example.com/light.png");
      assert.strictEqual(result.light?.toString(), "https://example.com/light.png");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BJY29ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwSWNvbnMsIHBhcnNlQW5kVmFsaWRhdGVNY3BJY29uIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcEljb25zLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclRyYW5zcG9ydEhUVFAsIE1jcFNlcnZlclRyYW5zcG9ydFN0ZGlvLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFR5cGVzLmpzJztcblxuY29uc3QgY3JlYXRlSHR0cExhdW5jaCA9ICh1cmw6IHN0cmluZyk6IE1jcFNlcnZlclRyYW5zcG9ydEhUVFAgPT4gKHtcblx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQLFxuXHR1cmk6IFVSSS5wYXJzZSh1cmwpLFxuXHRoZWFkZXJzOiBbXVxufSk7XG5cbmNvbnN0IGNyZWF0ZVN0ZGlvTGF1bmNoID0gKCk6IE1jcFNlcnZlclRyYW5zcG9ydFN0ZGlvID0+ICh7XG5cdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdGN3ZDogdW5kZWZpbmVkLFxuXHRjb21tYW5kOiAnY21kJyxcblx0YXJnczogW10sXG5cdGVudjoge30sXG5cdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0c2FuZGJveDogdW5kZWZpbmVkXG59KTtcblxuc3VpdGUoJ01DUCBJY29ucycsICgpID0+IHtcblx0c3VpdGUoJ3BhcnNlQW5kVmFsaWRhdGVNY3BJY29uJywgKCkgPT4ge1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgc3VwcG9ydGVkIGljb25zIGFuZCBzb3J0cyBzaXplcyBhc2NlbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2dnZXIgPSBuZXcgTnVsbExvZ2dlcigpO1xuXHRcdFx0Y29uc3QgbGF1bmNoID0gY3JlYXRlSHR0cExhdW5jaCgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbih7XG5cdFx0XHRcdGljb25zOiBbXG5cdFx0XHRcdFx0eyBzcmM6ICdmdHA6Ly9leGFtcGxlLmNvbS9pZ25vcmVkLnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyB9LFxuXHRcdFx0XHRcdHsgc3JjOiAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEFBQScsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgc2l6ZXM6IFsnNjR4NjQnLCAnMTZ4MTYnXSB9LFxuXHRcdFx0XHRcdHsgc3JjOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9pY29uLnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgc2l6ZXM6IFsnMTI4eDEyOCddIH1cblx0XHRcdFx0XVxuXHRcdFx0fSwgbGF1bmNoLCBsb2dnZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFswXS5zcmMgYXMgVVJJKS50b1N0cmluZyh0cnVlKSwgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxBQUEnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLnNpemVzLm1hcChzID0+IHMud2lkdGgpLCBbMTYsIDY0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLnNyYy50b1N0cmluZygpLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9pY29uLnBuZycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMV0uc2l6ZXMsIFt7IHdpZHRoOiAxMjgsIGhlaWdodDogMTI4IH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVpcmVzIGh0dHAgdHJhbnNwb3J0IHdpdGggbWF0Y2hpbmcgYXV0aG9yaXR5IGZvciByZW1vdGUgaWNvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2dnZXIgPSBuZXcgTnVsbExvZ2dlcigpO1xuXHRcdFx0Y29uc3QgaHR0cExhdW5jaCA9IGNyZWF0ZUh0dHBMYXVuY2goJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IHN0ZGlvTGF1bmNoID0gY3JlYXRlU3RkaW9MYXVuY2goKTtcblxuXHRcdFx0Y29uc3QgaWNvbnMgPSB7XG5cdFx0XHRcdGljb25zOiBbXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL2V4YW1wbGUuY29tL2ljb24ucG5nJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBzaXplczogWyc2NHg2NCddIH0sXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL290aGVyLmNvbS9pY29uLnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgc2l6ZXM6IFsnNjR4NjQnXSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGh0dHBSZXN1bHQgPSBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbihpY29ucywgaHR0cExhdW5jaCwgbG9nZ2VyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaHR0cFJlc3VsdC5tYXAoaWNvbiA9PiBpY29uLnNyYy50b1N0cmluZygpKSwgWydodHRwczovL2V4YW1wbGUuY29tL2ljb24ucG5nJ10pO1xuXG5cdFx0XHRjb25zdCBzdGRpb1Jlc3VsdCA9IHBhcnNlQW5kVmFsaWRhdGVNY3BJY29uKGljb25zLCBzdGRpb0xhdW5jaCwgbG9nZ2VyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGRpb1Jlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBmaWxlIGljb25zIG9ubHkgZm9yIHN0ZGlvIHRyYW5zcG9ydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IG5ldyBOdWxsTG9nZ2VyKCk7XG5cdFx0XHRjb25zdCBzdGRpb0xhdW5jaCA9IGNyZWF0ZVN0ZGlvTGF1bmNoKCk7XG5cdFx0XHRjb25zdCBodHRwTGF1bmNoID0gY3JlYXRlSHR0cExhdW5jaCgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXG5cdFx0XHRjb25zdCBpY29ucyA9IHtcblx0XHRcdFx0aWNvbnM6IFtcblx0XHRcdFx0XHR7IHNyYzogJ2ZpbGU6Ly8vdG1wL2ljb24ucG5nJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBzaXplczogWyczMngzMiddIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc3RkaW9SZXN1bHQgPSBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbihpY29ucywgc3RkaW9MYXVuY2gsIGxvZ2dlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RkaW9SZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGRpb1Jlc3VsdFswXS5zcmMuc2NoZW1lLCAnZmlsZScpO1xuXG5cdFx0XHRjb25zdCBodHRwUmVzdWx0ID0gcGFyc2VBbmRWYWxpZGF0ZU1jcEljb24oaWNvbnMsIGh0dHBMYXVuY2gsIGxvZ2dlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cFJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTWNwSWNvbnMnLCAoKSA9PiB7XG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdnZXRVcmwgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBpY29ucyBhcmUgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWNvbnMgPSBNY3BJY29ucy5mcm9tUGFyc2VkKHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbnMuZ2V0VXJsKDE2KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFVybCBwcmVmZXJzIHRoZW1lLXNwZWNpZmljIGljb25zIGFuZCBrZWVwcyBsaWdodCBmYWxsYmFjaycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IG5ldyBOdWxsTG9nZ2VyKCk7XG5cdFx0XHRjb25zdCBsYXVuY2ggPSBjcmVhdGVIdHRwTGF1bmNoKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbih7XG5cdFx0XHRcdGljb25zOiBbXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL2V4YW1wbGUuY29tL2RhcmsucG5nJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBzaXplczogWycxNngxNicsICc0OHg0OCddLCB0aGVtZTogJ2RhcmsnIH0sXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL2V4YW1wbGUuY29tL2FueS5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIHNpemVzOiBbJzI0eDI0J10gfSxcblx0XHRcdFx0XHR7IHNyYzogJ2h0dHBzOi8vZXhhbXBsZS5jb20vbGlnaHQucG5nJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBzaXplczogWyc2NHg2NCddLCB0aGVtZTogJ2xpZ2h0JyB9XG5cdFx0XHRcdF1cblx0XHRcdH0sIGxhdW5jaCwgbG9nZ2VyKTtcblx0XHRcdGNvbnN0IGljb25zID0gTWNwSWNvbnMuZnJvbVBhcnNlZChwYXJzZWQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gaWNvbnMuZ2V0VXJsKDMyKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0IS5kYXJrLnRvU3RyaW5nKCksICdodHRwczovL2V4YW1wbGUuY29tL2RhcmsucG5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0IS5saWdodD8udG9TdHJpbmcoKSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vbGlnaHQucG5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRVcmwgZmFsbHMgYmFjayB0byBhbnktdGhlbWUgaWNvbnMgd2hlbiBubyBleGFjdCBzaXplIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IG5ldyBOdWxsTG9nZ2VyKCk7XG5cdFx0XHRjb25zdCBsYXVuY2ggPSBjcmVhdGVIdHRwTGF1bmNoKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbih7XG5cdFx0XHRcdGljb25zOiBbXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL2V4YW1wbGUuY29tL2RhcmsucG5nJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBzaXplczogWycxNngxNiddLCB0aGVtZTogJ2RhcmsnIH0sXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL2V4YW1wbGUuY29tL2FueS5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIHNpemVzOiBbJzY0eDY0J10gfVxuXHRcdFx0XHRdXG5cdFx0XHR9LCBsYXVuY2gsIGxvZ2dlcik7XG5cdFx0XHRjb25zdCBpY29ucyA9IE1jcEljb25zLmZyb21QYXJzZWQocGFyc2VkKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGljb25zLmdldFVybCg2MCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCEuZGFyay50b1N0cmluZygpLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hbnkucG5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0IS5saWdodCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFVybCByZXVzZXMgbGlnaHQgaWNvbnMgd2hlbiBkYXJrIHRoZW1lIGFzc2V0cyBhcmUgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IG5ldyBOdWxsTG9nZ2VyKCk7XG5cdFx0XHRjb25zdCBsYXVuY2ggPSBjcmVhdGVIdHRwTGF1bmNoKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbih7XG5cdFx0XHRcdGljb25zOiBbXG5cdFx0XHRcdFx0eyBzcmM6ICdodHRwczovL2V4YW1wbGUuY29tL2xpZ2h0LnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgc2l6ZXM6IFsnMzJ4MzInXSwgdGhlbWU6ICdsaWdodCcgfVxuXHRcdFx0XHRdXG5cdFx0XHR9LCBsYXVuY2gsIGxvZ2dlcik7XG5cdFx0XHRjb25zdCBpY29ucyA9IE1jcEljb25zLmZyb21QYXJzZWQocGFyc2VkKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGljb25zLmdldFVybCgxNik7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCEuZGFyay50b1N0cmluZygpLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9saWdodC5wbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQhLmxpZ2h0Py50b1N0cmluZygpLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9saWdodC5wbmcnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLCtCQUErQjtBQUNsRCxTQUEwRCw4QkFBOEI7QUFFeEYsTUFBTSxtQkFBbUIsQ0FBQyxTQUF5QztBQUFBLEVBQ2xFLE1BQU0sdUJBQXVCO0FBQUEsRUFDN0IsS0FBSyxJQUFJLE1BQU0sR0FBRztBQUFBLEVBQ2xCLFNBQVMsQ0FBQztBQUNYO0FBRUEsTUFBTSxvQkFBb0IsT0FBZ0M7QUFBQSxFQUN6RCxNQUFNLHVCQUF1QjtBQUFBLEVBQzdCLEtBQUs7QUFBQSxFQUNMLFNBQVM7QUFBQSxFQUNULE1BQU0sQ0FBQztBQUFBLEVBQ1AsS0FBSyxDQUFDO0FBQUEsRUFDTixTQUFTO0FBQUEsRUFDVCxTQUFTO0FBQ1Y7QUFFQSxNQUFNLGFBQWEsTUFBTTtBQUN4QixRQUFNLDJCQUEyQixNQUFNO0FBQ3RDLDRDQUF3QztBQUV4QyxTQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFlBQU0sU0FBUyxJQUFJLFdBQVc7QUFDOUIsWUFBTSxTQUFTLGlCQUFpQixxQkFBcUI7QUFFckQsWUFBTSxTQUFTLHdCQUF3QjtBQUFBLFFBQ3RDLE9BQU87QUFBQSxVQUNOLEVBQUUsS0FBSyxpQ0FBaUMsVUFBVSxZQUFZO0FBQUEsVUFD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LEdBQUcsT0FBTyxRQUFRO0FBQUEsUUFDakc7QUFBQSxNQUNELEdBQUcsUUFBUSxNQUFNO0FBQ2pCLFlBQU0sUUFBUSxTQUFTLFdBQVcsTUFBTTtBQUN4QyxZQUFNLFNBQVMsTUFBTSxPQUFPLEVBQUU7QUFFOUIsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQVEsS0FBSyxTQUFTLEdBQUcsOEJBQThCO0FBQzFFLGFBQU8sWUFBWSxPQUFRLE9BQU8sU0FBUyxHQUFHLCtCQUErQjtBQUFBLElBQzlFLENBQUM7QUFFRCxTQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFlBQU0sU0FBUyxJQUFJLFdBQVc7QUFDOUIsWUFBTSxTQUFTLGlCQUFpQixxQkFBcUI7QUFDckQsWUFBTSxTQUFTLHdCQUF3QjtBQUFBLFFBQ3RDLE9BQU87QUFBQSxVQUNOLEVBQUUsS0FBSyxnQ0FBZ0MsVUFBVSxhQUFhLE9BQU8sQ0FBQyxPQUFPLEdBQUcsT0FBTyxPQUFPO0FBQUEsVUFDOUYsRUFBRSxLQUFLLCtCQUErQixVQUFVLGFBQWEsT0FBTyxDQUFDLE9BQU8sRUFBRTtBQUFBLFFBQy9FO0FBQUEsTUFDRCxHQUFHLFFBQVEsTUFBTTtBQUNqQixZQUFNLFFBQVEsU0FBUyxXQUFXLE1BQU07QUFDeEMsWUFBTSxTQUFTLE1BQU0sT0FBTyxFQUFFO0FBRTlCLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFRLEtBQUssU0FBUyxHQUFHLDZCQUE2QjtBQUN6RSxhQUFPLFlBQVksT0FBUSxPQUFPLE1BQVM7QUFBQSxJQUM1QyxDQUFDO0FBRUQsU0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFNLFNBQVMsSUFBSSxXQUFXO0FBQzlCLFlBQU0sU0FBUyxpQkFBaUIscUJBQXFCO0FBQ3JELFlBQU0sU0FBUyx3QkFBd0I7QUFBQSxRQUN0QyxPQUFPO0FBQUEsVUFDTixFQUFFLEtBQUssaUNBQWlDLFVBQVUsYUFBYSxPQUFPLENBQUMsT0FBTyxHQUFHLE9BQU8sUUFBUTtBQUFBLFFBQ2pHO0FBQUEsTUFDRCxHQUFHLFFBQVEsTUFBTTtBQUNqQixZQUFNLFFBQVEsU0FBUyxXQUFXLE1BQU07QUFDeEMsWUFBTSxTQUFTLE1BQU0sT0FBTyxFQUFFO0FBRTlCLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFRLEtBQUssU0FBUyxHQUFHLCtCQUErQjtBQUMzRSxhQUFPLFlBQVksT0FBUSxPQUFPLFNBQVMsR0FBRywrQkFBK0I7QUFBQSxJQUM5RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
