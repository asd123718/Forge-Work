import assert from "assert";
import { range } from "../../../../../base/common/arrays.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { LiveTestResult } from "../../common/testResult.js";
import { InMemoryResultStorage, RETAIN_MAX_RESULTS } from "../../common/testResultStorage.js";
import { TestRunProfileBitset } from "../../common/testTypes.js";
import { testStubs } from "./testStubs.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
suite("Workbench - Test Result Storage", () => {
  let storage;
  let ds;
  const makeResult = (taskName = "t") => {
    const t = ds.add(new LiveTestResult(
      "",
      true,
      { targets: [], group: TestRunProfileBitset.Run },
      1,
      NullTelemetryService
    ));
    t.addTask({ id: taskName, name: "n", running: true, ctrlId: "ctrlId" });
    const tests = ds.add(testStubs.nested());
    tests.expand(tests.root.id, Infinity);
    t.addTestChainToRun("ctrlId", [
      tests.root.toTestItem(),
      tests.root.children.get("id-a").toTestItem(),
      tests.root.children.get("id-a").children.get("id-aa").toTestItem()
    ]);
    t.markComplete();
    return t;
  };
  const assertStored = async (stored) => assert.deepStrictEqual((await storage.read()).map((r) => r.id), stored.map((s) => s.id));
  setup(async () => {
    ds = new DisposableStore();
    storage = ds.add(new InMemoryResultStorage({
      asCanonicalUri(uri) {
        return uri;
      }
    }, ds.add(new TestStorageService()), new NullLogService()));
  });
  teardown(() => ds.dispose());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("stores a single result", async () => {
    const r = range(5).map(() => makeResult());
    await storage.persist(r);
    await assertStored(r);
  });
  test("deletes old results", async () => {
    const r = range(5).map(() => makeResult());
    await storage.persist(r);
    const r2 = [makeResult(), ...r.slice(0, 3)];
    await storage.persist(r2);
    await assertStored(r2);
  });
  test("limits stored results", async () => {
    const r = range(100).map(() => makeResult());
    await storage.persist(r);
    await assertStored(r.slice(0, RETAIN_MAX_RESULTS));
  });
  test("limits stored result by budget", async () => {
    const r = range(100).map(() => makeResult("a".repeat(2048)));
    await storage.persist(r);
    const length = (await storage.read()).length;
    assert.strictEqual(true, length < 50);
  });
  test("always stores the min number of results", async () => {
    const r = range(20).map(() => makeResult("a".repeat(1024 * 10)));
    await storage.persist(r);
    await assertStored(r.slice(0, 16));
  });
  test("takes into account existing stored bytes", async () => {
    const r = range(10).map(() => makeResult("a".repeat(1024 * 10)));
    await storage.persist(r);
    await assertStored(r);
    const r2 = [...r, ...range(10).map(() => makeResult("a".repeat(1024 * 10)))];
    await storage.persist(r2);
    await assertStored(r2.slice(0, 16));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGNvbW1vblxcdGVzdFJlc3VsdFN0b3JhZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHQsIExpdmVUZXN0UmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlSZXN1bHRTdG9yYWdlLCBSRVRBSU5fTUFYX1JFU1VMVFMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdFN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdFJ1blByb2ZpbGVCaXRzZXQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IHRlc3RTdHVicyB9IGZyb20gJy4vdGVzdFN0dWJzLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXN0IFJlc3VsdCBTdG9yYWdlJywgKCkgPT4ge1xuXHRsZXQgc3RvcmFnZTogSW5NZW1vcnlSZXN1bHRTdG9yYWdlO1xuXHRsZXQgZHM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRjb25zdCBtYWtlUmVzdWx0ID0gKHRhc2tOYW1lID0gJ3QnKSA9PiB7XG5cdFx0Y29uc3QgdCA9IGRzLmFkZChuZXcgTGl2ZVRlc3RSZXN1bHQoXG5cdFx0XHQnJyxcblx0XHRcdHRydWUsXG5cdFx0XHR7IHRhcmdldHM6IFtdLCBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuIH0sXG5cdFx0XHQxLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHR0LmFkZFRhc2soeyBpZDogdGFza05hbWUsIG5hbWU6ICduJywgcnVubmluZzogdHJ1ZSwgY3RybElkOiAnY3RybElkJyB9KTtcblx0XHRjb25zdCB0ZXN0cyA9IGRzLmFkZCh0ZXN0U3R1YnMubmVzdGVkKCkpO1xuXHRcdHRlc3RzLmV4cGFuZCh0ZXN0cy5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0dC5hZGRUZXN0Q2hhaW5Ub1J1bignY3RybElkJywgW1xuXHRcdFx0dGVzdHMucm9vdC50b1Rlc3RJdGVtKCksXG5cdFx0XHR0ZXN0cy5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS50b1Rlc3RJdGVtKCksXG5cdFx0XHR0ZXN0cy5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5nZXQoJ2lkLWFhJykhLnRvVGVzdEl0ZW0oKSxcblx0XHRdKTtcblxuXHRcdHQubWFya0NvbXBsZXRlKCk7XG5cdFx0cmV0dXJuIHQ7XG5cdH07XG5cblx0Y29uc3QgYXNzZXJ0U3RvcmVkID0gYXN5bmMgKHN0b3JlZDogSVRlc3RSZXN1bHRbXSkgPT5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBzdG9yYWdlLnJlYWQoKSkubWFwKHIgPT4gci5pZCksIHN0b3JlZC5tYXAocyA9PiBzLmlkKSk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGRzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JhZ2UgPSBkcy5hZGQobmV3IEluTWVtb3J5UmVzdWx0U3RvcmFnZSh7XG5cdFx0XHRhc0Nhbm9uaWNhbFVyaSh1cmkpIHtcblx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdH0sXG5cdFx0fSBhcyBJVXJpSWRlbnRpdHlTZXJ2aWNlLCBkcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZHMuZGlzcG9zZSgpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzdG9yZXMgYSBzaW5nbGUgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHIgPSByYW5nZSg1KS5tYXAoKCkgPT4gbWFrZVJlc3VsdCgpKTtcblx0XHRhd2FpdCBzdG9yYWdlLnBlcnNpc3Qocik7XG5cdFx0YXdhaXQgYXNzZXJ0U3RvcmVkKHIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVzIG9sZCByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHIgPSByYW5nZSg1KS5tYXAoKCkgPT4gbWFrZVJlc3VsdCgpKTtcblx0XHRhd2FpdCBzdG9yYWdlLnBlcnNpc3Qocik7XG5cdFx0Y29uc3QgcjIgPSBbbWFrZVJlc3VsdCgpLCAuLi5yLnNsaWNlKDAsIDMpXTtcblx0XHRhd2FpdCBzdG9yYWdlLnBlcnNpc3QocjIpO1xuXHRcdGF3YWl0IGFzc2VydFN0b3JlZChyMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpbWl0cyBzdG9yZWQgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByID0gcmFuZ2UoMTAwKS5tYXAoKCkgPT4gbWFrZVJlc3VsdCgpKTtcblx0XHRhd2FpdCBzdG9yYWdlLnBlcnNpc3Qocik7XG5cdFx0YXdhaXQgYXNzZXJ0U3RvcmVkKHIuc2xpY2UoMCwgUkVUQUlOX01BWF9SRVNVTFRTKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpbWl0cyBzdG9yZWQgcmVzdWx0IGJ5IGJ1ZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByID0gcmFuZ2UoMTAwKS5tYXAoKCkgPT4gbWFrZVJlc3VsdCgnYScucmVwZWF0KDIwNDgpKSk7XG5cdFx0YXdhaXQgc3RvcmFnZS5wZXJzaXN0KHIpO1xuXHRcdGNvbnN0IGxlbmd0aCA9IChhd2FpdCBzdG9yYWdlLnJlYWQoKSkubGVuZ3RoO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCBsZW5ndGggPCA1MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fsd2F5cyBzdG9yZXMgdGhlIG1pbiBudW1iZXIgb2YgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByID0gcmFuZ2UoMjApLm1hcCgoKSA9PiBtYWtlUmVzdWx0KCdhJy5yZXBlYXQoMTAyNCAqIDEwKSkpO1xuXHRcdGF3YWl0IHN0b3JhZ2UucGVyc2lzdChyKTtcblx0XHRhd2FpdCBhc3NlcnRTdG9yZWQoci5zbGljZSgwLCAxNikpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWtlcyBpbnRvIGFjY291bnQgZXhpc3Rpbmcgc3RvcmVkIGJ5dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHIgPSByYW5nZSgxMCkubWFwKCgpID0+IG1ha2VSZXN1bHQoJ2EnLnJlcGVhdCgxMDI0ICogMTApKSk7XG5cdFx0YXdhaXQgc3RvcmFnZS5wZXJzaXN0KHIpO1xuXHRcdGF3YWl0IGFzc2VydFN0b3JlZChyKTtcblxuXHRcdGNvbnN0IHIyID0gWy4uLnIsIC4uLnJhbmdlKDEwKS5tYXAoKCkgPT4gbWFrZVJlc3VsdCgnYScucmVwZWF0KDEwMjQgKiAxMCkpKV07XG5cdFx0YXdhaXQgc3RvcmFnZS5wZXJzaXN0KHIyKTtcblx0XHRhd2FpdCBhc3NlcnRTdG9yZWQocjIuc2xpY2UoMCwgMTYpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFFckMsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsdUJBQXVCLDBCQUEwQjtBQUMxRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLG1DQUFtQyxNQUFNO0FBQzlDLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxhQUFhLENBQUMsV0FBVyxRQUFRO0FBQ3RDLFVBQU0sSUFBSSxHQUFHLElBQUksSUFBSTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsRUFBRSxTQUFTLENBQUMsR0FBRyxPQUFPLHFCQUFxQixJQUFJO0FBQUEsTUFDL0M7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBRUQsTUFBRSxRQUFRLEVBQUUsSUFBSSxVQUFVLE1BQU0sS0FBSyxTQUFTLE1BQU0sUUFBUSxTQUFTLENBQUM7QUFDdEUsVUFBTSxRQUFRLEdBQUcsSUFBSSxVQUFVLE9BQU8sQ0FBQztBQUN2QyxVQUFNLE9BQU8sTUFBTSxLQUFLLElBQUksUUFBUTtBQUNwQyxNQUFFLGtCQUFrQixVQUFVO0FBQUEsTUFDN0IsTUFBTSxLQUFLLFdBQVc7QUFBQSxNQUN0QixNQUFNLEtBQUssU0FBUyxJQUFJLE1BQU0sRUFBRyxXQUFXO0FBQUEsTUFDNUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxNQUFNLEVBQUcsU0FBUyxJQUFJLE9BQU8sRUFBRyxXQUFXO0FBQUEsSUFDcEUsQ0FBQztBQUVELE1BQUUsYUFBYTtBQUNmLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxlQUFlLE9BQU8sV0FDM0IsT0FBTyxpQkFBaUIsTUFBTSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQUssRUFBRSxFQUFFLEdBQUcsT0FBTyxJQUFJLE9BQUssRUFBRSxFQUFFLENBQUM7QUFFcEYsUUFBTSxZQUFZO0FBQ2pCLFNBQUssSUFBSSxnQkFBZ0I7QUFDekIsY0FBVSxHQUFHLElBQUksSUFBSSxzQkFBc0I7QUFBQSxNQUMxQyxlQUFlLEtBQUs7QUFDbkIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEdBQTBCLEdBQUcsSUFBSSxJQUFJLG1CQUFtQixDQUFDLEdBQUcsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQ2xGLENBQUM7QUFFRCxXQUFTLE1BQU0sR0FBRyxRQUFRLENBQUM7QUFFM0IsMENBQXdDO0FBRXhDLE9BQUssMEJBQTBCLFlBQVk7QUFDMUMsVUFBTSxJQUFJLE1BQU0sQ0FBQyxFQUFFLElBQUksTUFBTSxXQUFXLENBQUM7QUFDekMsVUFBTSxRQUFRLFFBQVEsQ0FBQztBQUN2QixVQUFNLGFBQWEsQ0FBQztBQUFBLEVBQ3JCLENBQUM7QUFFRCxPQUFLLHVCQUF1QixZQUFZO0FBQ3ZDLFVBQU0sSUFBSSxNQUFNLENBQUMsRUFBRSxJQUFJLE1BQU0sV0FBVyxDQUFDO0FBQ3pDLFVBQU0sUUFBUSxRQUFRLENBQUM7QUFDdkIsVUFBTSxLQUFLLENBQUMsV0FBVyxHQUFHLEdBQUcsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLFVBQU0sUUFBUSxRQUFRLEVBQUU7QUFDeEIsVUFBTSxhQUFhLEVBQUU7QUFBQSxFQUN0QixDQUFDO0FBRUQsT0FBSyx5QkFBeUIsWUFBWTtBQUN6QyxVQUFNLElBQUksTUFBTSxHQUFHLEVBQUUsSUFBSSxNQUFNLFdBQVcsQ0FBQztBQUMzQyxVQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ3ZCLFVBQU0sYUFBYSxFQUFFLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxZQUFZO0FBQ2xELFVBQU0sSUFBSSxNQUFNLEdBQUcsRUFBRSxJQUFJLE1BQU0sV0FBVyxJQUFJLE9BQU8sSUFBSSxDQUFDLENBQUM7QUFDM0QsVUFBTSxRQUFRLFFBQVEsQ0FBQztBQUN2QixVQUFNLFVBQVUsTUFBTSxRQUFRLEtBQUssR0FBRztBQUN0QyxXQUFPLFlBQVksTUFBTSxTQUFTLEVBQUU7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxVQUFNLElBQUksTUFBTSxFQUFFLEVBQUUsSUFBSSxNQUFNLFdBQVcsSUFBSSxPQUFPLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDL0QsVUFBTSxRQUFRLFFBQVEsQ0FBQztBQUN2QixVQUFNLGFBQWEsRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQUEsRUFDbEMsQ0FBQztBQUVELE9BQUssNENBQTRDLFlBQVk7QUFDNUQsVUFBTSxJQUFJLE1BQU0sRUFBRSxFQUFFLElBQUksTUFBTSxXQUFXLElBQUksT0FBTyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQy9ELFVBQU0sUUFBUSxRQUFRLENBQUM7QUFDdkIsVUFBTSxhQUFhLENBQUM7QUFFcEIsVUFBTSxLQUFLLENBQUMsR0FBRyxHQUFHLEdBQUcsTUFBTSxFQUFFLEVBQUUsSUFBSSxNQUFNLFdBQVcsSUFBSSxPQUFPLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztBQUMzRSxVQUFNLFFBQVEsUUFBUSxFQUFFO0FBQ3hCLFVBQU0sYUFBYSxHQUFHLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFBQSxFQUNuQyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
