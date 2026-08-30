import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostStorageService } from "../../node/agentHostStorageService.js";
suite("AgentHostStorageService", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("stores synchronously, notifies changes, and coalesces asynchronous writes", async () => {
    const writes = [];
    const writer = {
      mkdir: async () => {
      },
      writeFile: async (_path, contents) => {
        writes.push(contents);
      }
    };
    const service = disposables.add(new AgentHostStorageService(
      URI.file("/agent-host-storage-service-test.json"),
      new NullLogService(),
      writer
    ));
    const changed = [];
    disposables.add(service.onDidChange((key) => changed.push(key)));
    service.set("first", { value: 1 });
    service.set("second", false);
    assert.deepStrictEqual(service.get("first"), { value: 1 });
    service.delete("second");
    await service.whenIdle();
    assert.deepStrictEqual({
      changed,
      stored: service.get("second"),
      lastWrite: JSON.parse(writes.at(-1))
    }, {
      changed: ["first", "second", "second"],
      stored: void 0,
      lastWrite: { first: { value: 1 } }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RTdG9yYWdlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2UsIHR5cGUgSUFnZW50SG9zdFN0b3JhZ2VXcml0ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0FnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzdG9yZXMgc3luY2hyb25vdXNseSwgbm90aWZpZXMgY2hhbmdlcywgYW5kIGNvYWxlc2NlcyBhc3luY2hyb25vdXMgd3JpdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdyaXRlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB3cml0ZXI6IElBZ2VudEhvc3RTdG9yYWdlV3JpdGVyID0ge1xuXHRcdFx0bWtkaXI6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHdyaXRlRmlsZTogYXN5bmMgKF9wYXRoLCBjb250ZW50cykgPT4geyB3cml0ZXMucHVzaChjb250ZW50cyk7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdG9yYWdlU2VydmljZShcblx0XHRcdFVSSS5maWxlKCcvYWdlbnQtaG9zdC1zdG9yYWdlLXNlcnZpY2UtdGVzdC5qc29uJyksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHdyaXRlcixcblx0XHQpKTtcblx0XHRjb25zdCBjaGFuZ2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlKGtleSA9PiBjaGFuZ2VkLnB1c2goa2V5KSkpO1xuXG5cdFx0c2VydmljZS5zZXQoJ2ZpcnN0JywgeyB2YWx1ZTogMSB9KTtcblx0XHRzZXJ2aWNlLnNldCgnc2Vjb25kJywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXQ8eyB2YWx1ZTogbnVtYmVyIH0+KCdmaXJzdCcpLCB7IHZhbHVlOiAxIH0pO1xuXHRcdHNlcnZpY2UuZGVsZXRlKCdzZWNvbmQnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndoZW5JZGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNoYW5nZWQsXG5cdFx0XHRzdG9yZWQ6IHNlcnZpY2UuZ2V0PGJvb2xlYW4+KCdzZWNvbmQnKSxcblx0XHRcdGxhc3RXcml0ZTogSlNPTi5wYXJzZSh3cml0ZXMuYXQoLTEpISksXG5cdFx0fSwge1xuXHRcdFx0Y2hhbmdlZDogWydmaXJzdCcsICdzZWNvbmQnLCAnc2Vjb25kJ10sXG5cdFx0XHRzdG9yZWQ6IHVuZGVmaW5lZCxcblx0XHRcdGxhc3RXcml0ZTogeyBmaXJzdDogeyB2YWx1ZTogMSB9IH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQTZEO0FBRXRFLE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFdBQVMsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUNsQywwQ0FBd0M7QUFFeEMsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBTSxTQUFrQztBQUFBLE1BQ3ZDLE9BQU8sWUFBWTtBQUFBLE1BQUU7QUFBQSxNQUNyQixXQUFXLE9BQU8sT0FBTyxhQUFhO0FBQUUsZUFBTyxLQUFLLFFBQVE7QUFBQSxNQUFHO0FBQUEsSUFDaEU7QUFDQSxVQUFNLFVBQVUsWUFBWSxJQUFJLElBQUk7QUFBQSxNQUNuQyxJQUFJLEtBQUssdUNBQXVDO0FBQUEsTUFDaEQsSUFBSSxlQUFlO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFVBQW9CLENBQUM7QUFDM0IsZ0JBQVksSUFBSSxRQUFRLFlBQVksU0FBTyxRQUFRLEtBQUssR0FBRyxDQUFDLENBQUM7QUFFN0QsWUFBUSxJQUFJLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUNqQyxZQUFRLElBQUksVUFBVSxLQUFLO0FBQzNCLFdBQU8sZ0JBQWdCLFFBQVEsSUFBdUIsT0FBTyxHQUFHLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDNUUsWUFBUSxPQUFPLFFBQVE7QUFDdkIsVUFBTSxRQUFRLFNBQVM7QUFFdkIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsUUFBUSxRQUFRLElBQWEsUUFBUTtBQUFBLE1BQ3JDLFdBQVcsS0FBSyxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUU7QUFBQSxJQUNyQyxHQUFHO0FBQUEsTUFDRixTQUFTLENBQUMsU0FBUyxVQUFVLFFBQVE7QUFBQSxNQUNyQyxRQUFRO0FBQUEsTUFDUixXQUFXLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFO0FBQUEsSUFDbEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
