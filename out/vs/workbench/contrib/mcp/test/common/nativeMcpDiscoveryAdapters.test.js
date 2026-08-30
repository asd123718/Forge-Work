import * as assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { claudeConfigToServerDefinition } from "../../common/discovery/nativeMcpDiscoveryAdapters.js";
import { McpServerTransportType } from "../../common/mcpTypes.js";
suite("MCP Discovery - nativeMcpDiscoveryAdapters", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("claudeConfigToServerDefinition forwards HTTP headers", async () => {
    const contents = VSBuffer.fromString(JSON.stringify({
      mcpServers: {
        "with-headers": {
          type: "http",
          url: "https://example.com/mcp",
          headers: { "X-Custom-Header": "my-value", "Authorization": "Bearer abc" }
        },
        "no-headers": {
          type: "http",
          url: "https://example.com/other"
        },
        "stdio": {
          command: "my-cmd",
          args: ["--foo"]
        }
      }
    }));
    const defs = await claudeConfigToServerDefinition("prefix", contents);
    assert.ok(defs);
    assert.strictEqual(defs.length, 3);
    const withHeaders = defs.find((d) => d.label === "with-headers");
    assert.strictEqual(withHeaders.launch.type, McpServerTransportType.HTTP);
    assert.deepStrictEqual(
      withHeaders.launch.headers,
      [["X-Custom-Header", "my-value"], ["Authorization", "Bearer abc"]]
    );
    const noHeaders = defs.find((d) => d.label === "no-headers");
    assert.strictEqual(noHeaders.launch.type, McpServerTransportType.HTTP);
    assert.deepStrictEqual(
      noHeaders.launch.headers,
      []
    );
    const stdio = defs.find((d) => d.label === "stdio");
    assert.strictEqual(stdio.launch.type, McpServerTransportType.Stdio);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxuYXRpdmVNY3BEaXNjb3ZlcnlBZGFwdGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNsYXVkZUNvbmZpZ1RvU2VydmVyRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaXNjb3ZlcnkvbmF0aXZlTWNwRGlzY292ZXJ5QWRhcHRlcnMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5cbnN1aXRlKCdNQ1AgRGlzY292ZXJ5IC0gbmF0aXZlTWNwRGlzY292ZXJ5QWRhcHRlcnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NsYXVkZUNvbmZpZ1RvU2VydmVyRGVmaW5pdGlvbiBmb3J3YXJkcyBIVFRQIGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J3dpdGgtaGVhZGVycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnaHR0cCcsXG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9tY3AnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ1gtQ3VzdG9tLUhlYWRlcic6ICdteS12YWx1ZScsICdBdXRob3JpemF0aW9uJzogJ0JlYXJlciBhYmMnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCduby1oZWFkZXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdodHRwJyxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL290aGVyJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0J3N0ZGlvJzoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdteS1jbWQnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLS1mb28nXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGVmcyA9IGF3YWl0IGNsYXVkZUNvbmZpZ1RvU2VydmVyRGVmaW5pdGlvbigncHJlZml4JywgY29udGVudHMpO1xuXHRcdGFzc2VydC5vayhkZWZzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmcy5sZW5ndGgsIDMpO1xuXG5cdFx0Y29uc3Qgd2l0aEhlYWRlcnMgPSBkZWZzLmZpbmQoZCA9PiBkLmxhYmVsID09PSAnd2l0aC1oZWFkZXJzJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aXRoSGVhZGVycy5sYXVuY2gudHlwZSwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0KHdpdGhIZWFkZXJzLmxhdW5jaCBhcyB7IGhlYWRlcnM6IFtzdHJpbmcsIHN0cmluZ11bXSB9KS5oZWFkZXJzLFxuXHRcdFx0W1snWC1DdXN0b20tSGVhZGVyJywgJ215LXZhbHVlJ10sIFsnQXV0aG9yaXphdGlvbicsICdCZWFyZXIgYWJjJ11dLFxuXHRcdCk7XG5cblx0XHRjb25zdCBub0hlYWRlcnMgPSBkZWZzLmZpbmQoZCA9PiBkLmxhYmVsID09PSAnbm8taGVhZGVycycpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9IZWFkZXJzLmxhdW5jaC50eXBlLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHQobm9IZWFkZXJzLmxhdW5jaCBhcyB7IGhlYWRlcnM6IFtzdHJpbmcsIHN0cmluZ11bXSB9KS5oZWFkZXJzLFxuXHRcdFx0W10sXG5cdFx0KTtcblxuXHRcdGNvbnN0IHN0ZGlvID0gZGVmcy5maW5kKGQgPT4gZC5sYWJlbCA9PT0gJ3N0ZGlvJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGRpby5sYXVuY2gudHlwZSwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSw4Q0FBOEMsTUFBTTtBQUN6RCwwQ0FBd0M7QUFFeEMsT0FBSyx3REFBd0QsWUFBWTtBQUN4RSxVQUFNLFdBQVcsU0FBUyxXQUFXLEtBQUssVUFBVTtBQUFBLE1BQ25ELFlBQVk7QUFBQSxRQUNYLGdCQUFnQjtBQUFBLFVBQ2YsTUFBTTtBQUFBLFVBQ04sS0FBSztBQUFBLFVBQ0wsU0FBUyxFQUFFLG1CQUFtQixZQUFZLGlCQUFpQixhQUFhO0FBQUEsUUFDekU7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLE1BQU07QUFBQSxVQUNOLEtBQUs7QUFBQSxRQUNOO0FBQUEsUUFDQSxTQUFTO0FBQUEsVUFDUixTQUFTO0FBQUEsVUFDVCxNQUFNLENBQUMsT0FBTztBQUFBLFFBQ2Y7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLE9BQU8sTUFBTSwrQkFBK0IsVUFBVSxRQUFRO0FBQ3BFLFdBQU8sR0FBRyxJQUFJO0FBQ2QsV0FBTyxZQUFZLEtBQUssUUFBUSxDQUFDO0FBRWpDLFVBQU0sY0FBYyxLQUFLLEtBQUssT0FBSyxFQUFFLFVBQVUsY0FBYztBQUM3RCxXQUFPLFlBQVksWUFBWSxPQUFPLE1BQU0sdUJBQXVCLElBQUk7QUFDdkUsV0FBTztBQUFBLE1BQ0wsWUFBWSxPQUEyQztBQUFBLE1BQ3hELENBQUMsQ0FBQyxtQkFBbUIsVUFBVSxHQUFHLENBQUMsaUJBQWlCLFlBQVksQ0FBQztBQUFBLElBQ2xFO0FBRUEsVUFBTSxZQUFZLEtBQUssS0FBSyxPQUFLLEVBQUUsVUFBVSxZQUFZO0FBQ3pELFdBQU8sWUFBWSxVQUFVLE9BQU8sTUFBTSx1QkFBdUIsSUFBSTtBQUNyRSxXQUFPO0FBQUEsTUFDTCxVQUFVLE9BQTJDO0FBQUEsTUFDdEQsQ0FBQztBQUFBLElBQ0Y7QUFFQSxVQUFNLFFBQVEsS0FBSyxLQUFLLE9BQUssRUFBRSxVQUFVLE9BQU87QUFDaEQsV0FBTyxZQUFZLE1BQU0sT0FBTyxNQUFNLHVCQUF1QixLQUFLO0FBQUEsRUFDbkUsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
