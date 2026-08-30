import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { McpResourceURI, McpServerDefinition, McpServerTransportType } from "../../common/mcpTypes.js";
import * as assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
suite("MCP Types", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("McpResourceURI - round trips", () => {
    const roundTrip = (uri) => {
      const from = McpResourceURI.fromServer({ label: "", id: "my-id" }, uri);
      const to = McpResourceURI.toServer(from);
      assert.strictEqual(to.definitionId, "my-id");
      assert.strictEqual(to.resourceURL.toString(), uri, `expected to round trip ${uri}`);
    };
    roundTrip("file:///path/to/file.txt");
    roundTrip("custom-scheme://my-path/to/resource.txt");
    roundTrip("custom-scheme://my-path");
    roundTrip("custom-scheme://my-path/");
    roundTrip("custom-scheme://my-path/?with=query&params=here");
    roundTrip("custom-scheme:///my-path");
    roundTrip("custom-scheme:///my-path/foo/?with=query&params=here");
  });
  suite("McpServerDefinition.equals", () => {
    const createBasicDefinition = (overrides) => ({
      id: "test-server",
      label: "Test Server",
      cacheNonce: "v1.0.0",
      launch: {
        type: McpServerTransportType.Stdio,
        cwd: void 0,
        command: "test-command",
        args: [],
        env: {},
        envFile: void 0,
        sandbox: void 0
      },
      ...overrides
    });
    test("returns true for identical definitions", () => {
      const def1 = createBasicDefinition();
      const def2 = createBasicDefinition();
      assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
    });
    test("returns false when cacheNonce differs", () => {
      const def1 = createBasicDefinition({ cacheNonce: "v1.0.0" });
      const def2 = createBasicDefinition({ cacheNonce: "v2.0.0" });
      assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
    });
    test("returns false when id differs", () => {
      const def1 = createBasicDefinition({ id: "server-1" });
      const def2 = createBasicDefinition({ id: "server-2" });
      assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
    });
    test("returns false when label differs", () => {
      const def1 = createBasicDefinition({ label: "Server A" });
      const def2 = createBasicDefinition({ label: "Server B" });
      assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
    });
    test("returns false when roots differ", () => {
      const def1 = createBasicDefinition({ roots: [URI.file("/path1")] });
      const def2 = createBasicDefinition({ roots: [URI.file("/path2")] });
      assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
    });
    test("returns true when roots are both undefined", () => {
      const def1 = createBasicDefinition({ roots: void 0 });
      const def2 = createBasicDefinition({ roots: void 0 });
      assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
    });
    test("returns false when launch differs", () => {
      const def1 = createBasicDefinition({
        launch: {
          type: McpServerTransportType.Stdio,
          cwd: void 0,
          command: "command1",
          args: [],
          env: {},
          envFile: void 0,
          sandbox: void 0
        }
      });
      const def2 = createBasicDefinition({
        launch: {
          type: McpServerTransportType.Stdio,
          cwd: void 0,
          command: "command2",
          args: [],
          env: {},
          envFile: void 0,
          sandbox: void 0
        }
      });
      assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BUeXBlcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNY3BSZXNvdXJjZVVSSSwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbnN1aXRlKCdNQ1AgVHlwZXMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ01jcFJlc291cmNlVVJJIC0gcm91bmQgdHJpcHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm91bmRUcmlwID0gKHVyaTogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBmcm9tID0gTWNwUmVzb3VyY2VVUkkuZnJvbVNlcnZlcih7IGxhYmVsOiAnJywgaWQ6ICdteS1pZCcgfSwgdXJpKTtcblx0XHRcdGNvbnN0IHRvID0gTWNwUmVzb3VyY2VVUkkudG9TZXJ2ZXIoZnJvbSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG8uZGVmaW5pdGlvbklkLCAnbXktaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0by5yZXNvdXJjZVVSTC50b1N0cmluZygpLCB1cmksIGBleHBlY3RlZCB0byByb3VuZCB0cmlwICR7dXJpfWApO1xuXHRcdH07XG5cblx0XHRyb3VuZFRyaXAoJ2ZpbGU6Ly8vcGF0aC90by9maWxlLnR4dCcpO1xuXHRcdHJvdW5kVHJpcCgnY3VzdG9tLXNjaGVtZTovL215LXBhdGgvdG8vcmVzb3VyY2UudHh0Jyk7XG5cdFx0cm91bmRUcmlwKCdjdXN0b20tc2NoZW1lOi8vbXktcGF0aCcpO1xuXHRcdHJvdW5kVHJpcCgnY3VzdG9tLXNjaGVtZTovL215LXBhdGgvJyk7XG5cdFx0cm91bmRUcmlwKCdjdXN0b20tc2NoZW1lOi8vbXktcGF0aC8/d2l0aD1xdWVyeSZwYXJhbXM9aGVyZScpO1xuXG5cdFx0cm91bmRUcmlwKCdjdXN0b20tc2NoZW1lOi8vL215LXBhdGgnKTtcblx0XHRyb3VuZFRyaXAoJ2N1c3RvbS1zY2hlbWU6Ly8vbXktcGF0aC9mb28vP3dpdGg9cXVlcnkmcGFyYW1zPWhlcmUnKTtcblx0fSk7XG5cblx0c3VpdGUoJ01jcFNlcnZlckRlZmluaXRpb24uZXF1YWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZUJhc2ljRGVmaW5pdGlvbiA9IChvdmVycmlkZXM/OiBQYXJ0aWFsPE1jcFNlcnZlckRlZmluaXRpb24+KTogTWNwU2VydmVyRGVmaW5pdGlvbiA9PiAoe1xuXHRcdFx0aWQ6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRsYWJlbDogJ1Rlc3QgU2VydmVyJyxcblx0XHRcdGNhY2hlTm9uY2U6ICd2MS4wLjAnLFxuXHRcdFx0bGF1bmNoOiB7XG5cdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdGN3ZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21tYW5kOiAndGVzdC1jb21tYW5kJyxcblx0XHRcdFx0YXJnczogW10sXG5cdFx0XHRcdGVudjoge30sXG5cdFx0XHRcdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0Li4ub3ZlcnJpZGVzXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGlkZW50aWNhbCBkZWZpbml0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZjEgPSBjcmVhdGVCYXNpY0RlZmluaXRpb24oKTtcblx0XHRcdGNvbnN0IGRlZjIgPSBjcmVhdGVCYXNpY0RlZmluaXRpb24oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChNY3BTZXJ2ZXJEZWZpbml0aW9uLmVxdWFscyhkZWYxLCBkZWYyKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gY2FjaGVOb25jZSBkaWZmZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmMSA9IGNyZWF0ZUJhc2ljRGVmaW5pdGlvbih7IGNhY2hlTm9uY2U6ICd2MS4wLjAnIH0pO1xuXHRcdFx0Y29uc3QgZGVmMiA9IGNyZWF0ZUJhc2ljRGVmaW5pdGlvbih7IGNhY2hlTm9uY2U6ICd2Mi4wLjAnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE1jcFNlcnZlckRlZmluaXRpb24uZXF1YWxzKGRlZjEsIGRlZjIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gaWQgZGlmZmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZjEgPSBjcmVhdGVCYXNpY0RlZmluaXRpb24oeyBpZDogJ3NlcnZlci0xJyB9KTtcblx0XHRcdGNvbnN0IGRlZjIgPSBjcmVhdGVCYXNpY0RlZmluaXRpb24oeyBpZDogJ3NlcnZlci0yJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChNY3BTZXJ2ZXJEZWZpbml0aW9uLmVxdWFscyhkZWYxLCBkZWYyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGxhYmVsIGRpZmZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWYxID0gY3JlYXRlQmFzaWNEZWZpbml0aW9uKHsgbGFiZWw6ICdTZXJ2ZXIgQScgfSk7XG5cdFx0XHRjb25zdCBkZWYyID0gY3JlYXRlQmFzaWNEZWZpbml0aW9uKHsgbGFiZWw6ICdTZXJ2ZXIgQicgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoTWNwU2VydmVyRGVmaW5pdGlvbi5lcXVhbHMoZGVmMSwgZGVmMiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiByb290cyBkaWZmZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWYxID0gY3JlYXRlQmFzaWNEZWZpbml0aW9uKHsgcm9vdHM6IFtVUkkuZmlsZSgnL3BhdGgxJyldIH0pO1xuXHRcdFx0Y29uc3QgZGVmMiA9IGNyZWF0ZUJhc2ljRGVmaW5pdGlvbih7IHJvb3RzOiBbVVJJLmZpbGUoJy9wYXRoMicpXSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChNY3BTZXJ2ZXJEZWZpbml0aW9uLmVxdWFscyhkZWYxLCBkZWYyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIHdoZW4gcm9vdHMgYXJlIGJvdGggdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmMSA9IGNyZWF0ZUJhc2ljRGVmaW5pdGlvbih7IHJvb3RzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRjb25zdCBkZWYyID0gY3JlYXRlQmFzaWNEZWZpbml0aW9uKHsgcm9vdHM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChNY3BTZXJ2ZXJEZWZpbml0aW9uLmVxdWFscyhkZWYxLCBkZWYyKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gbGF1bmNoIGRpZmZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWYxID0gY3JlYXRlQmFzaWNEZWZpbml0aW9uKHtcblx0XHRcdFx0bGF1bmNoOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0XHRcdFx0XHRjd2Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb21tYW5kOiAnY29tbWFuZDEnLFxuXHRcdFx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0XHRcdGVudjoge30sXG5cdFx0XHRcdFx0ZW52RmlsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNhbmRib3g6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGRlZjIgPSBjcmVhdGVCYXNpY0RlZmluaXRpb24oe1xuXHRcdFx0XHRsYXVuY2g6IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdGN3ZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kMicsXG5cdFx0XHRcdFx0YXJnczogW10sXG5cdFx0XHRcdFx0ZW52OiB7fSxcblx0XHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE1jcFNlcnZlckRlZmluaXRpb24uZXF1YWxzKGRlZjEsIGRlZjIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4i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
