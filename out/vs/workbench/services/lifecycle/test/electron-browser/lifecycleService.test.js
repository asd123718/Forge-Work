import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ShutdownReason, WillShutdownJoinerOrder } from "../../common/lifecycle.js";
import { NativeLifecycleService } from "../../electron-browser/lifecycleService.js";
import { workbenchInstantiationService } from "../../../../test/electron-browser/workbenchTestServices.js";
suite("Lifecycleservice", function() {
  let lifecycleService;
  const disposables = new DisposableStore();
  class TestLifecycleService extends NativeLifecycleService {
    testHandleBeforeShutdown(reason) {
      return super.handleBeforeShutdown(reason);
    }
    testHandleWillShutdown(reason) {
      return super.handleWillShutdown(reason);
    }
  }
  setup(async () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    lifecycleService = disposables.add(instantiationService.createInstance(TestLifecycleService));
  });
  teardown(async () => {
    disposables.clear();
  });
  test("onBeforeShutdown - final veto called after other vetos", async function() {
    let vetoCalled = false;
    let finalVetoCalled = false;
    const order = [];
    disposables.add(lifecycleService.onBeforeShutdown((e) => {
      e.veto(new Promise((resolve) => {
        vetoCalled = true;
        order.push(1);
        resolve(false);
      }), "test");
    }));
    disposables.add(lifecycleService.onBeforeShutdown((e) => {
      e.finalVeto(() => {
        return new Promise((resolve) => {
          finalVetoCalled = true;
          order.push(2);
          resolve(true);
        });
      }, "test");
    }));
    const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);
    assert.strictEqual(veto, true);
    assert.strictEqual(vetoCalled, true);
    assert.strictEqual(finalVetoCalled, true);
    assert.strictEqual(order[0], 1);
    assert.strictEqual(order[1], 2);
  });
  test("onBeforeShutdown - final veto not called when veto happened before", async function() {
    let vetoCalled = false;
    let finalVetoCalled = false;
    disposables.add(lifecycleService.onBeforeShutdown((e) => {
      e.veto(new Promise((resolve) => {
        vetoCalled = true;
        resolve(true);
      }), "test");
    }));
    disposables.add(lifecycleService.onBeforeShutdown((e) => {
      e.finalVeto(() => {
        return new Promise((resolve) => {
          finalVetoCalled = true;
          resolve(true);
        });
      }, "test");
    }));
    const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);
    assert.strictEqual(veto, true);
    assert.strictEqual(vetoCalled, true);
    assert.strictEqual(finalVetoCalled, false);
  });
  test("onBeforeShutdown - veto with error is treated as veto", async function() {
    disposables.add(lifecycleService.onBeforeShutdown((e) => {
      e.veto(new Promise((resolve, reject) => {
        reject(new Error("Fail"));
      }), "test");
    }));
    const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);
    assert.strictEqual(veto, true);
  });
  test("onBeforeShutdown - final veto with error is treated as veto", async function() {
    disposables.add(lifecycleService.onBeforeShutdown((e) => {
      e.finalVeto(() => new Promise((resolve, reject) => {
        reject(new Error("Fail"));
      }), "test");
    }));
    const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);
    assert.strictEqual(veto, true);
  });
  test("onWillShutdown - join", async function() {
    let joinCalled = false;
    disposables.add(lifecycleService.onWillShutdown((e) => {
      e.join(new Promise((resolve) => {
        joinCalled = true;
        resolve();
      }), { id: "test", label: "test" });
    }));
    await lifecycleService.testHandleWillShutdown(ShutdownReason.QUIT);
    assert.strictEqual(joinCalled, true);
  });
  test("onWillShutdown - join with error is handled", async function() {
    let joinCalled = false;
    disposables.add(lifecycleService.onWillShutdown((e) => {
      e.join(new Promise((resolve, reject) => {
        joinCalled = true;
        reject(new Error("Fail"));
      }), { id: "test", label: "test" });
    }));
    await lifecycleService.testHandleWillShutdown(ShutdownReason.QUIT);
    assert.strictEqual(joinCalled, true);
  });
  test("onWillShutdown - join order", async function() {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const order = [];
      disposables.add(lifecycleService.onWillShutdown((e) => {
        e.join(async () => {
          order.push("disconnect start");
          await timeout(1);
          order.push("disconnect end");
        }, { id: "test", label: "test", order: WillShutdownJoinerOrder.Last });
        e.join((async () => {
          order.push("default start");
          await timeout(1);
          order.push("default end");
        })(), { id: "test", label: "test", order: WillShutdownJoinerOrder.Default });
      }));
      await lifecycleService.testHandleWillShutdown(ShutdownReason.QUIT);
      assert.deepStrictEqual(order, [
        "default start",
        "default end",
        "disconnect start",
        "disconnect end"
      ]);
    });
  });
  test("willShutdown is set when shutting down", async function() {
    let willShutdownSet = false;
    disposables.add(lifecycleService.onWillShutdown((e) => {
      e.join(new Promise((resolve) => {
        if (lifecycleService.willShutdown) {
          willShutdownSet = true;
          resolve();
        }
      }), { id: "test", label: "test" });
    }));
    await lifecycleService.testHandleWillShutdown(ShutdownReason.QUIT);
    assert.strictEqual(willShutdownSet, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsaWZlY3ljbGVcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXGxpZmVjeWNsZVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU2h1dGRvd25SZWFzb24sIFdpbGxTaHV0ZG93bkpvaW5lck9yZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci9saWZlY3ljbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9lbGVjdHJvbi1icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdMaWZlY3ljbGVzZXJ2aWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBsaWZlY3ljbGVTZXJ2aWNlOiBUZXN0TGlmZWN5Y2xlU2VydmljZTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y2xhc3MgVGVzdExpZmVjeWNsZVNlcnZpY2UgZXh0ZW5kcyBOYXRpdmVMaWZlY3ljbGVTZXJ2aWNlIHtcblxuXHRcdHRlc3RIYW5kbGVCZWZvcmVTaHV0ZG93bihyZWFzb246IFNodXRkb3duUmVhc29uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuaGFuZGxlQmVmb3JlU2h1dGRvd24ocmVhc29uKTtcblx0XHR9XG5cblx0XHR0ZXN0SGFuZGxlV2lsbFNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHJldHVybiBzdXBlci5oYW5kbGVXaWxsU2h1dGRvd24ocmVhc29uKTtcblx0XHR9XG5cdH1cblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRsaWZlY3ljbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RMaWZlY3ljbGVTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkJlZm9yZVNodXRkb3duIC0gZmluYWwgdmV0byBjYWxsZWQgYWZ0ZXIgb3RoZXIgdmV0b3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHZldG9DYWxsZWQgPSBmYWxzZTtcblx0XHRsZXQgZmluYWxWZXRvQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBvcmRlcjogbnVtYmVyW10gPSBbXTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oZSA9PiB7XG5cdFx0XHRlLnZldG8obmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHZldG9DYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRvcmRlci5wdXNoKDEpO1xuXG5cdFx0XHRcdHJlc29sdmUoZmFsc2UpO1xuXHRcdFx0fSksICd0ZXN0Jyk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihlID0+IHtcblx0XHRcdGUuZmluYWxWZXRvKCgpID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGZpbmFsVmV0b0NhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0b3JkZXIucHVzaCgyKTtcblxuXHRcdFx0XHRcdHJlc29sdmUodHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgJ3Rlc3QnKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgbGlmZWN5Y2xlU2VydmljZS50ZXN0SGFuZGxlQmVmb3JlU2h1dGRvd24oU2h1dGRvd25SZWFzb24uUVVJVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmV0bywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZldG9DYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5hbFZldG9DYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmRlclswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yZGVyWzFdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnb25CZWZvcmVTaHV0ZG93biAtIGZpbmFsIHZldG8gbm90IGNhbGxlZCB3aGVuIHZldG8gaGFwcGVuZWQgYmVmb3JlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCB2ZXRvQ2FsbGVkID0gZmFsc2U7XG5cdFx0bGV0IGZpbmFsVmV0b0NhbGxlZCA9IGZhbHNlO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihlID0+IHtcblx0XHRcdGUudmV0byhuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdFx0dmV0b0NhbGxlZCA9IHRydWU7XG5cblx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdH0pLCAndGVzdCcpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oZSA9PiB7XG5cdFx0XHRlLmZpbmFsVmV0bygoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRmaW5hbFZldG9DYWxsZWQgPSB0cnVlO1xuXG5cdFx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCAndGVzdCcpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCBsaWZlY3ljbGVTZXJ2aWNlLnRlc3RIYW5kbGVCZWZvcmVTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZXRvLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmV0b0NhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmFsVmV0b0NhbGxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkJlZm9yZVNodXRkb3duIC0gdmV0byB3aXRoIGVycm9yIGlzIHRyZWF0ZWQgYXMgdmV0bycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKGUgPT4ge1xuXHRcdFx0ZS52ZXRvKG5ldyBQcm9taXNlPGJvb2xlYW4+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignRmFpbCcpKTtcblx0XHRcdH0pLCAndGVzdCcpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCBsaWZlY3ljbGVTZXJ2aWNlLnRlc3RIYW5kbGVCZWZvcmVTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZXRvLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnb25CZWZvcmVTaHV0ZG93biAtIGZpbmFsIHZldG8gd2l0aCBlcnJvciBpcyB0cmVhdGVkIGFzIHZldG8nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihlID0+IHtcblx0XHRcdGUuZmluYWxWZXRvKCgpID0+IG5ldyBQcm9taXNlPGJvb2xlYW4+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignRmFpbCcpKTtcblx0XHRcdH0pLCAndGVzdCcpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCBsaWZlY3ljbGVTZXJ2aWNlLnRlc3RIYW5kbGVCZWZvcmVTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZXRvLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnb25XaWxsU2h1dGRvd24gLSBqb2luJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBqb2luQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bihlID0+IHtcblx0XHRcdGUuam9pbihuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0am9pbkNhbGxlZCA9IHRydWU7XG5cblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSksIHsgaWQ6ICd0ZXN0JywgbGFiZWw6ICd0ZXN0JyB9KTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBsaWZlY3ljbGVTZXJ2aWNlLnRlc3RIYW5kbGVXaWxsU2h1dGRvd24oU2h1dGRvd25SZWFzb24uUVVJVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoam9pbkNhbGxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uV2lsbFNodXRkb3duIC0gam9pbiB3aXRoIGVycm9yIGlzIGhhbmRsZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGpvaW5DYWxsZWQgPSBmYWxzZTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4ge1xuXHRcdFx0ZS5qb2luKG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0am9pbkNhbGxlZCA9IHRydWU7XG5cblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignRmFpbCcpKTtcblx0XHRcdH0pLCB7IGlkOiAndGVzdCcsIGxhYmVsOiAndGVzdCcgfSk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgbGlmZWN5Y2xlU2VydmljZS50ZXN0SGFuZGxlV2lsbFNodXRkb3duKFNodXRkb3duUmVhc29uLlFVSVQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpvaW5DYWxsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIGpvaW4gb3JkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4ge1xuXHRcdFx0XHRlLmpvaW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdG9yZGVyLnB1c2goJ2Rpc2Nvbm5lY3Qgc3RhcnQnKTtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0XHRcdG9yZGVyLnB1c2goJ2Rpc2Nvbm5lY3QgZW5kJyk7XG5cdFx0XHRcdH0sIHsgaWQ6ICd0ZXN0JywgbGFiZWw6ICd0ZXN0Jywgb3JkZXI6IFdpbGxTaHV0ZG93bkpvaW5lck9yZGVyLkxhc3QgfSk7XG5cblx0XHRcdFx0ZS5qb2luKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0b3JkZXIucHVzaCgnZGVmYXVsdCBzdGFydCcpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRcdFx0b3JkZXIucHVzaCgnZGVmYXVsdCBlbmQnKTtcblx0XHRcdFx0fSkoKSwgeyBpZDogJ3Rlc3QnLCBsYWJlbDogJ3Rlc3QnLCBvcmRlcjogV2lsbFNodXRkb3duSm9pbmVyT3JkZXIuRGVmYXVsdCB9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgbGlmZWN5Y2xlU2VydmljZS50ZXN0SGFuZGxlV2lsbFNodXRkb3duKFNodXRkb3duUmVhc29uLlFVSVQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9yZGVyLCBbXG5cdFx0XHRcdCdkZWZhdWx0IHN0YXJ0Jyxcblx0XHRcdFx0J2RlZmF1bHQgZW5kJyxcblx0XHRcdFx0J2Rpc2Nvbm5lY3Qgc3RhcnQnLFxuXHRcdFx0XHQnZGlzY29ubmVjdCBlbmQnXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2lsbFNodXRkb3duIGlzIHNldCB3aGVuIHNodXR0aW5nIGRvd24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHdpbGxTaHV0ZG93blNldCA9IGZhbHNlO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZSA9PiB7XG5cdFx0XHRlLmpvaW4obmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGlmIChsaWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRcdHdpbGxTaHV0ZG93blNldCA9IHRydWU7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSwgeyBpZDogJ3Rlc3QnLCBsYWJlbDogJ3Rlc3QnIH0pO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGxpZmVjeWNsZVNlcnZpY2UudGVzdEhhbmRsZVdpbGxTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWxsU2h1dGRvd25TZXQsIHRydWUpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQiwrQkFBK0I7QUFDeEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQ0FBcUM7QUFFOUMsTUFBTSxvQkFBb0IsV0FBWTtBQUVyQyxNQUFJO0FBQ0osUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQUEs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
