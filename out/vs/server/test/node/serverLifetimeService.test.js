import assert from "assert";
import { DeferredPromise, timeout } from "../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { NullLogService } from "../../../platform/log/common/log.js";
import { ServerLifetimeService } from "../../node/serverLifetimeService.js";
suite("ServerLifetimeService", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  function create(opts = {}) {
    return ds.add(new ServerLifetimeService(opts, () => void 0, new NullLogService()));
  }
  test("starts with no active consumers", () => {
    const service = create();
    assert.strictEqual(service.hasActiveConsumers, false);
  });
  test("active() marks a consumer and dispose releases it", () => {
    const service = create();
    const d = service.active("test");
    assert.strictEqual(service.hasActiveConsumers, true);
    d.dispose();
    assert.strictEqual(service.hasActiveConsumers, false);
  });
  test("multiple active consumers require all to dispose", () => {
    const service = create();
    const d1 = service.active("a");
    const d2 = service.active("b");
    assert.strictEqual(service.hasActiveConsumers, true);
    d1.dispose();
    assert.strictEqual(service.hasActiveConsumers, true);
    d2.dispose();
    assert.strictEqual(service.hasActiveConsumers, false);
  });
  test("same consumer name counted multiple times", () => {
    const service = create();
    const d1 = service.active("ext");
    const d2 = service.active("ext");
    assert.strictEqual(service.hasActiveConsumers, true);
    d1.dispose();
    assert.strictEqual(service.hasActiveConsumers, true);
    d2.dispose();
    assert.strictEqual(service.hasActiveConsumers, false);
  });
  test("dispose is idempotent", () => {
    const service = create();
    const d1 = service.active("a");
    const d2 = service.active("a");
    d1.dispose();
    d1.dispose();
    assert.strictEqual(service.hasActiveConsumers, true);
    d2.dispose();
    assert.strictEqual(service.hasActiveConsumers, false);
  });
  test("does not exit when a consumer becomes active during shutdown", async () => {
    let exits = 0;
    let aborts = 0;
    const service = ds.add(new ServerLifetimeService(
      { enableAutoShutdown: true, shutdownWithoutDelay: true },
      () => {
        exits++;
        return void 0;
      },
      new NullLogService()
    ));
    const shutdownBarrier = new DeferredPromise();
    ds.add(service.onWillShutdown((event) => event.join(shutdownBarrier.p)));
    ds.add(service.onDidAbortShutdown(() => aborts++));
    const firstConsumer = service.active("first");
    firstConsumer.dispose();
    const secondConsumer = ds.add(service.active("second"));
    shutdownBarrier.complete();
    await timeout(0);
    assert.deepStrictEqual({
      hasActiveConsumers: service.hasActiveConsumers,
      exits,
      aborts
    }, {
      hasActiveConsumers: true,
      exits: 0,
      aborts: 1
    });
    secondConsumer.dispose();
    await timeout(0);
    assert.strictEqual(exits, 1);
  });
  test("does not exit when shutdown is delayed during a join", async () => {
    let exits = 0;
    const service = ds.add(new ServerLifetimeService(
      { enableAutoShutdown: true, shutdownWithoutDelay: true },
      () => {
        exits++;
        return void 0;
      },
      new NullLogService()
    ));
    const shutdownBarrier = new DeferredPromise();
    let shutdownCount = 0;
    ds.add(service.onWillShutdown((event) => {
      shutdownCount++;
      if (shutdownCount === 1) {
        event.join(shutdownBarrier.p);
      }
    }));
    const consumer = service.active("first");
    consumer.dispose();
    service.delay();
    shutdownBarrier.complete();
    await timeout(0);
    assert.deepStrictEqual({
      shutdownCount,
      exits
    }, {
      shutdownCount: 2,
      exits: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXHRlc3RcXG5vZGVcXHNlcnZlckxpZmV0aW1lU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJMaWZldGltZU9wdGlvbnMsIFNlcnZlckxpZmV0aW1lU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvc2VydmVyTGlmZXRpbWVTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1NlcnZlckxpZmV0aW1lU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGUob3B0czogSVNlcnZlckxpZmV0aW1lT3B0aW9ucyA9IHt9KTogU2VydmVyTGlmZXRpbWVTZXJ2aWNlIHtcblx0XHRyZXR1cm4gZHMuYWRkKG5ldyBTZXJ2ZXJMaWZldGltZVNlcnZpY2Uob3B0cywgKCkgPT4gdW5kZWZpbmVkIGFzIG5ldmVyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHR9XG5cblx0dGVzdCgnc3RhcnRzIHdpdGggbm8gYWN0aXZlIGNvbnN1bWVycycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzQWN0aXZlQ29uc3VtZXJzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZSgpIG1hcmtzIGEgY29uc3VtZXIgYW5kIGRpc3Bvc2UgcmVsZWFzZXMgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZSgpO1xuXHRcdGNvbnN0IGQgPSBzZXJ2aWNlLmFjdGl2ZSgndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgdHJ1ZSk7XG5cdFx0ZC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzQWN0aXZlQ29uc3VtZXJzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGFjdGl2ZSBjb25zdW1lcnMgcmVxdWlyZSBhbGwgdG8gZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlKCk7XG5cdFx0Y29uc3QgZDEgPSBzZXJ2aWNlLmFjdGl2ZSgnYScpO1xuXHRcdGNvbnN0IGQyID0gc2VydmljZS5hY3RpdmUoJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIHRydWUpO1xuXHRcdGQxLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIHRydWUpO1xuXHRcdGQyLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2FtZSBjb25zdW1lciBuYW1lIGNvdW50ZWQgbXVsdGlwbGUgdGltZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZSgpO1xuXHRcdGNvbnN0IGQxID0gc2VydmljZS5hY3RpdmUoJ2V4dCcpO1xuXHRcdGNvbnN0IGQyID0gc2VydmljZS5hY3RpdmUoJ2V4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgdHJ1ZSk7XG5cdFx0ZDEuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgdHJ1ZSk7XG5cdFx0ZDIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGlzIGlkZW1wb3RlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZSgpO1xuXHRcdGNvbnN0IGQxID0gc2VydmljZS5hY3RpdmUoJ2EnKTtcblx0XHRjb25zdCBkMiA9IHNlcnZpY2UuYWN0aXZlKCdhJyk7XG5cdFx0ZDEuZGlzcG9zZSgpO1xuXHRcdGQxLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIHRydWUpO1xuXHRcdGQyLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZXhpdCB3aGVuIGEgY29uc3VtZXIgYmVjb21lcyBhY3RpdmUgZHVyaW5nIHNodXRkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBleGl0cyA9IDA7XG5cdFx0bGV0IGFib3J0cyA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRzLmFkZChuZXcgU2VydmVyTGlmZXRpbWVTZXJ2aWNlKFxuXHRcdFx0eyBlbmFibGVBdXRvU2h1dGRvd246IHRydWUsIHNodXRkb3duV2l0aG91dERlbGF5OiB0cnVlIH0sXG5cdFx0XHQoKSA9PiB7IGV4aXRzKys7IHJldHVybiB1bmRlZmluZWQgYXMgbmV2ZXI7IH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRjb25zdCBzaHV0ZG93bkJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0ZHMuYWRkKHNlcnZpY2Uub25XaWxsU2h1dGRvd24oZXZlbnQgPT4gZXZlbnQuam9pbihzaHV0ZG93bkJhcnJpZXIucCkpKTtcblx0XHRkcy5hZGQoc2VydmljZS5vbkRpZEFib3J0U2h1dGRvd24oKCkgPT4gYWJvcnRzKyspKTtcblxuXHRcdGNvbnN0IGZpcnN0Q29uc3VtZXIgPSBzZXJ2aWNlLmFjdGl2ZSgnZmlyc3QnKTtcblx0XHRmaXJzdENvbnN1bWVyLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBzZWNvbmRDb25zdW1lciA9IGRzLmFkZChzZXJ2aWNlLmFjdGl2ZSgnc2Vjb25kJykpO1xuXHRcdHNodXRkb3duQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0FjdGl2ZUNvbnN1bWVyczogc2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsXG5cdFx0XHRleGl0cyxcblx0XHRcdGFib3J0cyxcblx0XHR9LCB7XG5cdFx0XHRoYXNBY3RpdmVDb25zdW1lcnM6IHRydWUsXG5cdFx0XHRleGl0czogMCxcblx0XHRcdGFib3J0czogMSxcblx0XHR9KTtcblx0XHRzZWNvbmRDb25zdW1lci5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpdHMsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBleGl0IHdoZW4gc2h1dGRvd24gaXMgZGVsYXllZCBkdXJpbmcgYSBqb2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBleGl0cyA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRzLmFkZChuZXcgU2VydmVyTGlmZXRpbWVTZXJ2aWNlKFxuXHRcdFx0eyBlbmFibGVBdXRvU2h1dGRvd246IHRydWUsIHNodXRkb3duV2l0aG91dERlbGF5OiB0cnVlIH0sXG5cdFx0XHQoKSA9PiB7IGV4aXRzKys7IHJldHVybiB1bmRlZmluZWQgYXMgbmV2ZXI7IH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRjb25zdCBzaHV0ZG93bkJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IHNodXRkb3duQ291bnQgPSAwO1xuXHRcdGRzLmFkZChzZXJ2aWNlLm9uV2lsbFNodXRkb3duKGV2ZW50ID0+IHtcblx0XHRcdHNodXRkb3duQ291bnQrKztcblx0XHRcdGlmIChzaHV0ZG93bkNvdW50ID09PSAxKSB7XG5cdFx0XHRcdGV2ZW50LmpvaW4oc2h1dGRvd25CYXJyaWVyLnApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvbnN1bWVyID0gc2VydmljZS5hY3RpdmUoJ2ZpcnN0Jyk7XG5cdFx0Y29uc3VtZXIuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGVsYXkoKTtcblx0XHRzaHV0ZG93bkJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaHV0ZG93bkNvdW50LFxuXHRcdFx0ZXhpdHMsXG5cdFx0fSwge1xuXHRcdFx0c2h1dGRvd25Db3VudDogMixcblx0XHRcdGV4aXRzOiAxLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBaUMsNkJBQTZCO0FBRTlELE1BQU0seUJBQXlCLE1BQU07QUFDcEMsUUFBTSxLQUFLLHdDQUF3QztBQUVuRCxXQUFTLE9BQU8sT0FBK0IsQ0FBQyxHQUEwQjtBQUN6RSxXQUFPLEdBQUcsSUFBSSxJQUFJLHNCQUFzQixNQUFNLE1BQU0sUUFBb0IsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQzlGO0FBRUEsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxVQUFNLFVBQVUsT0FBTztBQUN2QixXQUFPLFlBQVksUUFBUSxvQkFBb0IsS0FBSztBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sVUFBVSxPQUFPO0FBQ3ZCLFVBQU0sSUFBSSxRQUFRLE9BQU8sTUFBTTtBQUMvQixXQUFPLFlBQVksUUFBUSxvQkFBb0IsSUFBSTtBQUNuRCxNQUFFLFFBQVE7QUFDVixXQUFPLFlBQVksUUFBUSxvQkFBb0IsS0FBSztBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFVBQU0sVUFBVSxPQUFPO0FBQ3ZCLFVBQU0sS0FBSyxRQUFRLE9BQU8sR0FBRztBQUM3QixVQUFNLEtBQUssUUFBUSxPQUFPLEdBQUc7QUFDN0IsV0FBTyxZQUFZLFFBQVEsb0JBQW9CLElBQUk7QUFDbkQsT0FBRyxRQUFRO0FBQ1gsV0FBTyxZQUFZLFFBQVEsb0JBQW9CLElBQUk7QUFDbkQsT0FBRyxRQUFRO0FBQ1gsV0FBTyxZQUFZLFFBQVEsb0JBQW9CLEtBQUs7QUFBQSxFQUNyRCxD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
