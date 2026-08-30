import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { createSandboxLines, createSandboxProperties } from "../../browser/tools/runInTerminalTool.js";
suite("createSandboxLines", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  async function assertLines(options) {
    const properties = JSON.stringify(createSandboxProperties(options), void 0, 2);
    const snapshot = `${JSON.stringify(options, void 0, 2)}
----
${properties}
----
${createSandboxLines(options).join("\n")}`;
    await assertSnapshot(snapshot);
  }
  suite("available", () => {
    test("disallowed", async () => {
      await assertLines({
        sandboxMode: "on-network-available",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
    test("allowed", async () => {
      await assertLines({
        sandboxMode: "on-network-available",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
  });
  suite("restricted", () => {
    test("no retry, disallowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
    test("no retry, allowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
    test("retry, disallowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: true,
        networkDomains: void 0
      });
    });
    test("retry, allowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: void 0
      });
    });
    test("empty domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: [], deniedDomains: [] }
      });
    });
    test("allowed domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: ["github.com", "registry.npmjs.org"], deniedDomains: [] }
      });
    });
    test("denied domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: [], deniedDomains: ["evil.example.com"] }
      });
    });
    test("allowed and denied domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: ["github.com", "registry.npmjs.org"], deniedDomains: ["evil.example.com"] }
      });
    });
    test("overlapping domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: ["github.com", "evil.example.com"], deniedDomains: ["evil.example.com"] }
      });
    });
    test("domains, retry disabled", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: false,
        networkDomains: { allowedDomains: ["github.com"], deniedDomains: ["evil.example.com"] }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXGNyZWF0ZVNhbmRib3hMaW5lcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2FuZGJveExpbmVzLCBjcmVhdGVTYW5kYm94UHJvcGVydGllcywgdHlwZSBJU2FuZGJveGluZ09uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbFRvb2wuanMnO1xuXG5zdWl0ZSgnY3JlYXRlU2FuZGJveExpbmVzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRMaW5lcyhvcHRpb25zOiBJU2FuZGJveGluZ09uT3B0aW9ucykge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBKU09OLnN0cmluZ2lmeShjcmVhdGVTYW5kYm94UHJvcGVydGllcyhvcHRpb25zKSwgdW5kZWZpbmVkLCAyKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IGAke0pTT04uc3RyaW5naWZ5KG9wdGlvbnMsIHVuZGVmaW5lZCwgMil9XFxuLS0tLVxcbiR7cHJvcGVydGllc31cXG4tLS0tXFxuJHtjcmVhdGVTYW5kYm94TGluZXMob3B0aW9ucykuam9pbignXFxuJyl9YDtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChzbmFwc2hvdCk7XG5cdH1cblxuXHRzdWl0ZSgnYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Rpc2FsbG93ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1hdmFpbGFibGUnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogZmFsc2UsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLWF2YWlsYWJsZScsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogZmFsc2UsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc3RyaWN0ZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbm8gcmV0cnksIGRpc2FsbG93ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IGZhbHNlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogZmFsc2UsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIHJldHJ5LCBhbGxvd2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogZmFsc2UsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHJ5LCBkaXNhbGxvd2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiBmYWxzZSxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHJ5LCBhbGxvd2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgZG9tYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogdHJ1ZSxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dlZCBkb21haW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHsgYWxsb3dlZERvbWFpbnM6IFsnZ2l0aHViLmNvbScsICdyZWdpc3RyeS5ucG1qcy5vcmcnXSwgZGVuaWVkRG9tYWluczogW10gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVuaWVkIGRvbWFpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRuZXR3b3JrRG9tYWluczogeyBhbGxvd2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFsnZXZpbC5leGFtcGxlLmNvbSddIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbG93ZWQgYW5kIGRlbmllZCBkb21haW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHsgYWxsb3dlZERvbWFpbnM6IFsnZ2l0aHViLmNvbScsICdyZWdpc3RyeS5ucG1qcy5vcmcnXSwgZGVuaWVkRG9tYWluczogWydldmlsLmV4YW1wbGUuY29tJ10gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb3ZlcmxhcHBpbmcgZG9tYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogdHJ1ZSxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB7IGFsbG93ZWREb21haW5zOiBbJ2dpdGh1Yi5jb20nLCAnZXZpbC5leGFtcGxlLmNvbSddLCBkZW5pZWREb21haW5zOiBbJ2V2aWwuZXhhbXBsZS5jb20nXSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb21haW5zLCByZXRyeSBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogZmFsc2UsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHsgYWxsb3dlZERvbWFpbnM6IFsnZ2l0aHViLmNvbSddLCBkZW5pZWREb21haW5zOiBbJ2V2aWwuZXhhbXBsZS5jb20nXSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQiwrQkFBMEQ7QUFFdkYsTUFBTSxzQkFBc0IsTUFBTTtBQUNqQywwQ0FBd0M7QUFFeEMsaUJBQWUsWUFBWSxTQUErQjtBQUN6RCxVQUFNLGFBQWEsS0FBSyxVQUFVLHdCQUF3QixPQUFPLEdBQUcsUUFBVyxDQUFDO0FBQ2hGLFVBQU0sV0FBVyxHQUFHLEtBQUssVUFBVSxTQUFTLFFBQVcsQ0FBQyxDQUFDO0FBQUE7QUFBQSxFQUFXLFVBQVU7QUFBQTtBQUFBLEVBQVcsbUJBQW1CLE9BQU8sRUFBRSxLQUFLLElBQUksQ0FBQztBQUMvSCxVQUFNLGVBQWUsUUFBUTtBQUFBLEVBQzlCO0FBRUEsUUFBTSxhQUFhLE1BQU07QUFDeEIsU0FBSyxjQUFjLFlBQVk7QUFDOUIsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssV0FBVyxZQUFZO0FBQzNCLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGNBQWMsTUFBTTtBQUN6QixTQUFLLHdCQUF3QixZQUFZO0FBQ3hDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHFCQUFxQixZQUFZO0FBQ3JDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHFCQUFxQixZQUFZO0FBQ3JDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGtCQUFrQixZQUFZO0FBQ2xDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGlCQUFpQixZQUFZO0FBQ2pDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDLEdBQUcsZUFBZSxDQUFDLEVBQUU7QUFBQSxNQUN6RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxtQkFBbUIsWUFBWTtBQUNuQyxZQUFNLFlBQVk7QUFBQSxRQUNqQixhQUFhO0FBQUEsUUFDYiwrQkFBK0I7QUFBQSxRQUMvQiwrQkFBK0I7QUFBQSxRQUMvQixnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxjQUFjLG9CQUFvQixHQUFHLGVBQWUsQ0FBQyxFQUFFO0FBQUEsTUFDM0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssa0JBQWtCLFlBQVk7QUFDbEMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUMsR0FBRyxlQUFlLENBQUMsa0JBQWtCLEVBQUU7QUFBQSxNQUMzRSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxZQUFNLFlBQVk7QUFBQSxRQUNqQixhQUFhO0FBQUEsUUFDYiwrQkFBK0I7QUFBQSxRQUMvQiwrQkFBK0I7QUFBQSxRQUMvQixnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxjQUFjLG9CQUFvQixHQUFHLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRTtBQUFBLE1BQzdHLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHVCQUF1QixZQUFZO0FBQ3ZDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDLGNBQWMsa0JBQWtCLEdBQUcsZUFBZSxDQUFDLGtCQUFrQixFQUFFO0FBQUEsTUFDM0csQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMkJBQTJCLFlBQVk7QUFDM0MsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUMsWUFBWSxHQUFHLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRTtBQUFBLE1BQ3ZGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
