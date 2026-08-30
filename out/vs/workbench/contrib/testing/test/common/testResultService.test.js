import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestId } from "../../common/testId.js";
import { TestProfileService } from "../../common/testProfileService.js";
import { HydratedTestResult, LiveTestResult, TaskRawOutput, TestResultItemChangeReason, resultItemParents } from "../../common/testResult.js";
import { TestResultService } from "../../common/testResultService.js";
import { InMemoryResultStorage } from "../../common/testResultStorage.js";
import { TestResultState, TestRunProfileBitset } from "../../common/testTypes.js";
import { makeEmptyCounts } from "../../common/testingStates.js";
import { getInitializedMainTestCollection, testStubs } from "./testStubs.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
suite("Workbench - Test Results Service", () => {
  const getLabelsIn = (it) => [...it].map((t) => t.item.label).sort();
  const getChangeSummary = () => [...changed].map((c) => ({ reason: c.reason, label: c.item.item.label }));
  let r;
  let changed = /* @__PURE__ */ new Set();
  let tests;
  const defaultOpts = (testIds) => ({
    group: TestRunProfileBitset.Run,
    targets: [{
      profileId: 0,
      controllerId: "ctrlId",
      testIds
    }]
  });
  let insertCounter = 0;
  class TestLiveTestResult extends LiveTestResult {
    constructor(id, persist, request) {
      super(id, persist, request, insertCounter++, NullTelemetryService);
      ds.add(this);
    }
    setAllToStatePublic(state, taskId, when) {
      this.setAllToState(state, taskId, when);
    }
  }
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    changed = /* @__PURE__ */ new Set();
    r = ds.add(new TestLiveTestResult(
      "foo",
      true,
      defaultOpts(["id-a"])
    ));
    ds.add(r.onChange((e) => changed.add(e)));
    r.addTask({ id: "t", name: "n", running: true, ctrlId: "ctrl" });
    tests = ds.add(testStubs.nested());
    const cts = ds.add(new CancellationTokenSource());
    const ok = await Promise.race([
      Promise.resolve(tests.expand(tests.root.id, Infinity)).then(() => true),
      timeout(1e3, cts.token).then(() => false)
    ]);
    cts.cancel();
    if (!ok) {
      throw new Error("timed out while expanding, diff: " + JSON.stringify(tests.collectDiff()));
    }
    r.addTestChainToRun("ctrlId", [
      tests.root.toTestItem(),
      tests.root.children.get("id-a").toTestItem(),
      tests.root.children.get("id-a").children.get("id-aa").toTestItem()
    ]);
    r.addTestChainToRun("ctrlId", [
      tests.root.children.get("id-a").toTestItem(),
      tests.root.children.get("id-a").children.get("id-ab").toTestItem()
    ]);
  });
  suite("LiveTestResult", () => {
    test("is empty if no tests are yet present", async () => {
      assert.deepStrictEqual(getLabelsIn(new TestLiveTestResult(
        "foo",
        false,
        defaultOpts(["id-a"])
      ).tests), []);
    });
    test("initially queues nothing", () => {
      assert.deepStrictEqual(getChangeSummary(), []);
    });
    test("initializes with the subtree of requested tests", () => {
      assert.deepStrictEqual(getLabelsIn(r.tests), ["a", "aa", "ab", "root"]);
    });
    test("initializes with valid counts", () => {
      const c = makeEmptyCounts();
      c[TestResultState.Unset] = 4;
      assert.deepStrictEqual(r.counts, c);
    });
    test("setAllToState", () => {
      changed.clear();
      r.setAllToStatePublic(TestResultState.Queued, "t", (_, t) => t.item.label !== "root");
      const c = makeEmptyCounts();
      c[TestResultState.Unset] = 1;
      c[TestResultState.Queued] = 3;
      assert.deepStrictEqual(r.counts, c);
      r.setAllToStatePublic(TestResultState.Failed, "t", (_, t) => t.item.label !== "root");
      const c2 = makeEmptyCounts();
      c2[TestResultState.Unset] = 1;
      c2[TestResultState.Failed] = 3;
      assert.deepStrictEqual(r.counts, c2);
      assert.deepStrictEqual(r.getStateById(new TestId(["ctrlId", "id-a"]).toString())?.ownComputedState, TestResultState.Failed);
      assert.deepStrictEqual(r.getStateById(new TestId(["ctrlId", "id-a"]).toString())?.tasks[0].state, TestResultState.Failed);
      assert.deepStrictEqual(getChangeSummary(), [
        { label: "a", reason: TestResultItemChangeReason.OwnStateChange },
        { label: "root", reason: TestResultItemChangeReason.ComputedStateChange },
        { label: "aa", reason: TestResultItemChangeReason.OwnStateChange },
        { label: "ab", reason: TestResultItemChangeReason.OwnStateChange },
        { label: "a", reason: TestResultItemChangeReason.OwnStateChange },
        { label: "root", reason: TestResultItemChangeReason.ComputedStateChange },
        { label: "aa", reason: TestResultItemChangeReason.OwnStateChange },
        { label: "ab", reason: TestResultItemChangeReason.OwnStateChange }
      ]);
    });
    test("updateState", () => {
      changed.clear();
      const testId = new TestId(["ctrlId", "id-a", "id-aa"]).toString();
      r.updateState(testId, "t", TestResultState.Running);
      const c = makeEmptyCounts();
      c[TestResultState.Running] = 1;
      c[TestResultState.Unset] = 3;
      assert.deepStrictEqual(r.counts, c);
      assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Running);
      assert.deepStrictEqual(r.getStateById(tests.root.id)?.computedState, TestResultState.Running);
      assert.deepStrictEqual(getChangeSummary(), [
        { label: "aa", reason: TestResultItemChangeReason.OwnStateChange },
        { label: "a", reason: TestResultItemChangeReason.ComputedStateChange },
        { label: "root", reason: TestResultItemChangeReason.ComputedStateChange }
      ]);
      r.updateState(testId, "t", TestResultState.Passed);
      assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Passed);
      r.updateState(testId, "t", TestResultState.Errored);
      assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Errored);
      r.updateState(testId, "t", TestResultState.Passed);
      assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Errored);
    });
    test("ignores outside run", () => {
      changed.clear();
      r.updateState(new TestId(["ctrlId", "id-b"]).toString(), "t", TestResultState.Running);
      const c = makeEmptyCounts();
      c[TestResultState.Unset] = 4;
      assert.deepStrictEqual(r.counts, c);
      assert.deepStrictEqual(r.getStateById(new TestId(["ctrlId", "id-b"]).toString()), void 0);
    });
    test("markComplete", () => {
      r.setAllToStatePublic(TestResultState.Queued, "t", () => true);
      r.updateState(new TestId(["ctrlId", "id-a", "id-aa"]).toString(), "t", TestResultState.Passed);
      changed.clear();
      r.markComplete();
      const c = makeEmptyCounts();
      c[TestResultState.Skipped] = 3;
      c[TestResultState.Passed] = 1;
      assert.deepStrictEqual(r.counts, c);
      assert.deepStrictEqual(r.getStateById(tests.root.id)?.ownComputedState, TestResultState.Skipped);
      assert.deepStrictEqual(r.getStateById(new TestId(["ctrlId", "id-a", "id-aa"]).toString())?.ownComputedState, TestResultState.Passed);
    });
  });
  suite("service", () => {
    let storage;
    let results;
    class TestTestResultService extends TestResultService {
      constructor() {
        super(...arguments);
        this.persistScheduler = upcastPartial({ schedule: () => this.persistImmediately() });
      }
    }
    setup(() => {
      storage = ds.add(new InMemoryResultStorage({
        asCanonicalUri(uri) {
          return uri;
        }
      }, ds.add(new TestStorageService()), new NullLogService()));
      results = ds.add(new TestTestResultService(
        new MockContextKeyService(),
        storage,
        ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService()))),
        NullTelemetryService
      ));
    });
    test("pushes new result", () => {
      results.push(r);
      assert.deepStrictEqual(results.results, [r]);
    });
    test("serializes and re-hydrates", async () => {
      results.push(r);
      r.updateState(new TestId(["ctrlId", "id-a", "id-aa"]).toString(), "t", TestResultState.Passed, 42);
      r.markComplete();
      await timeout(10);
      results = ds.add(new TestResultService(
        new MockContextKeyService(),
        storage,
        ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService()))),
        NullTelemetryService
      ));
      assert.strictEqual(0, results.results.length);
      await timeout(10);
      assert.strictEqual(1, results.results.length);
      const [rehydrated, actual] = results.getStateById(tests.root.id);
      const expected = { ...r.getStateById(tests.root.id) };
      expected.item.uri = actual.item.uri;
      expected.item.children = void 0;
      expected.retired = true;
      delete expected.children;
      assert.deepStrictEqual(actual, { ...expected });
      assert.deepStrictEqual(rehydrated.counts, r.counts);
      assert.strictEqual(typeof rehydrated.completedAt, "number");
    });
    test("clears results but keeps ongoing tests", async () => {
      results.push(r);
      r.markComplete();
      const r2 = results.push(new LiveTestResult(
        "",
        false,
        defaultOpts([]),
        insertCounter++,
        NullTelemetryService
      ));
      results.clear();
      assert.deepStrictEqual(results.results, [r2]);
    });
    test("keeps ongoing tests on top, restored order when done", async () => {
      results.push(r);
      const r2 = results.push(new LiveTestResult(
        "",
        false,
        defaultOpts([]),
        insertCounter++,
        NullTelemetryService
      ));
      assert.deepStrictEqual(results.results, [r2, r]);
      r2.markComplete();
      assert.deepStrictEqual(results.results, [r, r2]);
      r.markComplete();
      assert.deepStrictEqual(results.results, [r2, r]);
    });
    const makeHydrated = async (completedAt = 42, state = TestResultState.Passed) => new HydratedTestResult({
      asCanonicalUri(uri) {
        return uri;
      }
    }, {
      completedAt,
      id: "some-id",
      tasks: [{ id: "t", name: void 0, ctrlId: "ctrl", hasCoverage: false }],
      name: "hello world",
      request: defaultOpts([]),
      items: [{
        ...(await getInitializedMainTestCollection()).getNodeById(new TestId(["ctrlId", "id-a"]).toString()),
        tasks: [{ state, duration: 0, messages: [] }],
        computedState: state,
        ownComputedState: state
      }]
    });
    test("pushes hydrated results", async () => {
      results.push(r);
      const hydrated = await makeHydrated();
      results.push(hydrated);
      assert.deepStrictEqual(results.results, [r, hydrated]);
    });
    test("inserts in correct order", async () => {
      results.push(r);
      const hydrated1 = await makeHydrated();
      results.push(hydrated1);
      assert.deepStrictEqual(results.results, [r, hydrated1]);
    });
    test("inserts in correct order 2", async () => {
      results.push(r);
      const hydrated1 = await makeHydrated();
      results.push(hydrated1);
      const hydrated2 = await makeHydrated(30);
      results.push(hydrated2);
      assert.deepStrictEqual(results.results, [r, hydrated1, hydrated2]);
    });
  });
  test("resultItemParents", function() {
    assert.deepStrictEqual([...resultItemParents(r, r.getStateById(new TestId(["ctrlId", "id-a", "id-aa"]).toString()))], [
      r.getStateById(new TestId(["ctrlId", "id-a", "id-aa"]).toString()),
      r.getStateById(new TestId(["ctrlId", "id-a"]).toString()),
      r.getStateById(new TestId(["ctrlId"]).toString())
    ]);
    assert.deepStrictEqual([...resultItemParents(r, r.getStateById(tests.root.id))], [
      r.getStateById(tests.root.id)
    ]);
  });
  suite("output controller", () => {
    test("reads live output ranges", async () => {
      const ctrl = new TaskRawOutput();
      ctrl.append(VSBuffer.fromString("12345"));
      ctrl.append(VSBuffer.fromString("67890"));
      ctrl.append(VSBuffer.fromString("12345"));
      ctrl.append(VSBuffer.fromString("67890"));
      assert.deepStrictEqual(ctrl.getRange(0, 5), VSBuffer.fromString("12345"));
      assert.deepStrictEqual(ctrl.getRange(5, 5), VSBuffer.fromString("67890"));
      assert.deepStrictEqual(ctrl.getRange(7, 6), VSBuffer.fromString("890123"));
      assert.deepStrictEqual(ctrl.getRange(15, 5), VSBuffer.fromString("67890"));
      assert.deepStrictEqual(ctrl.getRange(15, 10), VSBuffer.fromString("67890"));
    });
    test("corrects offsets for marked ranges", async () => {
      const ctrl = new TaskRawOutput();
      const a1 = ctrl.append(VSBuffer.fromString("12345"), 1);
      const a2 = ctrl.append(VSBuffer.fromString("67890"), 1234);
      const a3 = ctrl.append(VSBuffer.fromString("with new line\r\n"), 4);
      assert.deepStrictEqual(ctrl.getRange(a1.offset, a1.length), VSBuffer.fromString("\x1B]633;SetMark;Id=s1;Hidden\x0712345\x1B]633;SetMark;Id=e1;Hidden\x07"));
      assert.deepStrictEqual(ctrl.getRange(a2.offset, a2.length), VSBuffer.fromString("\x1B]633;SetMark;Id=s1234;Hidden\x0767890\x1B]633;SetMark;Id=e1234;Hidden\x07"));
      assert.deepStrictEqual(ctrl.getRange(a3.offset, a3.length), VSBuffer.fromString("\x1B]633;SetMark;Id=s4;Hidden\x07with new line\x1B]633;SetMark;Id=e4;Hidden\x07\r\n"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGNvbW1vblxcdGVzdFJlc3VsdFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBUZXN0UHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEh5ZHJhdGVkVGVzdFJlc3VsdCwgTGl2ZVRlc3RSZXN1bHQsIFRhc2tSYXdPdXRwdXQsIFRlc3RSZXN1bHRJdGVtQ2hhbmdlLCBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbiwgcmVzdWx0SXRlbVBhcmVudHMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBUZXN0UmVzdWx0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFN0b3JhZ2UsIEluTWVtb3J5UmVzdWx0U3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0UmVzdWx0U3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFRhc2tTdGF0ZSwgUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCwgVGVzdFJlc3VsdEl0ZW0sIFRlc3RSZXN1bHRTdGF0ZSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IG1ha2VFbXB0eUNvdW50cyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IFRlc3RUZXN0Q29sbGVjdGlvbiwgZ2V0SW5pdGlhbGl6ZWRNYWluVGVzdENvbGxlY3Rpb24sIHRlc3RTdHVicyB9IGZyb20gJy4vdGVzdFN0dWJzLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlc3QgUmVzdWx0cyBTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBnZXRMYWJlbHNJbiA9IChpdDogSXRlcmFibGU8VGVzdFJlc3VsdEl0ZW0+KSA9PiBbLi4uaXRdLm1hcCh0ID0+IHQuaXRlbS5sYWJlbCkuc29ydCgpO1xuXHRjb25zdCBnZXRDaGFuZ2VTdW1tYXJ5ID0gKCkgPT4gWy4uLmNoYW5nZWRdXG5cdFx0Lm1hcChjID0+ICh7IHJlYXNvbjogYy5yZWFzb24sIGxhYmVsOiBjLml0ZW0uaXRlbS5sYWJlbCB9KSk7XG5cblx0bGV0IHI6IFRlc3RMaXZlVGVzdFJlc3VsdDtcblx0bGV0IGNoYW5nZWQgPSBuZXcgU2V0PFRlc3RSZXN1bHRJdGVtQ2hhbmdlPigpO1xuXHRsZXQgdGVzdHM6IFRlc3RUZXN0Q29sbGVjdGlvbjtcblxuXHRjb25zdCBkZWZhdWx0T3B0cyA9ICh0ZXN0SWRzOiBzdHJpbmdbXSk6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3QgPT4gKHtcblx0XHRncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLFxuXHRcdHRhcmdldHM6IFt7XG5cdFx0XHRwcm9maWxlSWQ6IDAsXG5cdFx0XHRjb250cm9sbGVySWQ6ICdjdHJsSWQnLFxuXHRcdFx0dGVzdElkcyxcblx0XHR9XVxuXHR9KTtcblxuXHRsZXQgaW5zZXJ0Q291bnRlciA9IDA7XG5cblx0Y2xhc3MgVGVzdExpdmVUZXN0UmVzdWx0IGV4dGVuZHMgTGl2ZVRlc3RSZXN1bHQge1xuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0aWQ6IHN0cmluZyxcblx0XHRcdHBlcnNpc3Q6IGJvb2xlYW4sXG5cdFx0XHRyZXF1ZXN0OiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0LFxuXHRcdCkge1xuXHRcdFx0c3VwZXIoaWQsIHBlcnNpc3QsIHJlcXVlc3QsIGluc2VydENvdW50ZXIrKywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0ZHMuYWRkKHRoaXMpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBzZXRBbGxUb1N0YXRlUHVibGljKHN0YXRlOiBUZXN0UmVzdWx0U3RhdGUsIHRhc2tJZDogc3RyaW5nLCB3aGVuOiAodGFzazogSVRlc3RUYXNrU3RhdGUsIGl0ZW06IFRlc3RSZXN1bHRJdGVtKSA9PiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLnNldEFsbFRvU3RhdGUoc3RhdGUsIHRhc2tJZCwgd2hlbik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y2hhbmdlZCA9IG5ldyBTZXQoKTtcblx0XHRyID0gZHMuYWRkKG5ldyBUZXN0TGl2ZVRlc3RSZXN1bHQoXG5cdFx0XHQnZm9vJyxcblx0XHRcdHRydWUsXG5cdFx0XHRkZWZhdWx0T3B0cyhbJ2lkLWEnXSksXG5cdFx0KSk7XG5cblx0XHRkcy5hZGQoci5vbkNoYW5nZShlID0+IGNoYW5nZWQuYWRkKGUpKSk7XG5cdFx0ci5hZGRUYXNrKHsgaWQ6ICd0JywgbmFtZTogJ24nLCBydW5uaW5nOiB0cnVlLCBjdHJsSWQ6ICdjdHJsJyB9KTtcblxuXHRcdHRlc3RzID0gZHMuYWRkKHRlc3RTdHVicy5uZXN0ZWQoKSk7XG5cdFx0Y29uc3QgY3RzID0gZHMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCBvayA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRQcm9taXNlLnJlc29sdmUodGVzdHMuZXhwYW5kKHRlc3RzLnJvb3QuaWQsIEluZmluaXR5KSkudGhlbigoKSA9PiB0cnVlKSxcblx0XHRcdHRpbWVvdXQoMTAwMCwgY3RzLnRva2VuKS50aGVuKCgpID0+IGZhbHNlKSxcblx0XHRdKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IGRlYnVnIGZvciB0ZXN0cyAjMTM3ODUzOlxuXHRcdGlmICghb2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigndGltZWQgb3V0IHdoaWxlIGV4cGFuZGluZywgZGlmZjogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RzLmNvbGxlY3REaWZmKCkpKTtcblx0XHR9XG5cblx0XHRyLmFkZFRlc3RDaGFpblRvUnVuKCdjdHJsSWQnLCBbXG5cdFx0XHR0ZXN0cy5yb290LnRvVGVzdEl0ZW0oKSxcblx0XHRcdHRlc3RzLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLnRvVGVzdEl0ZW0oKSxcblx0XHRcdHRlc3RzLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmdldCgnaWQtYWEnKSEudG9UZXN0SXRlbSgpLFxuXHRcdF0pO1xuXG5cdFx0ci5hZGRUZXN0Q2hhaW5Ub1J1bignY3RybElkJywgW1xuXHRcdFx0dGVzdHMucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEudG9UZXN0SXRlbSgpLFxuXHRcdFx0dGVzdHMucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEuY2hpbGRyZW4uZ2V0KCdpZC1hYicpIS50b1Rlc3RJdGVtKCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdC8vIGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpOyB0b2RvQGNvbm5vcjQzMTJcblxuXHRzdWl0ZSgnTGl2ZVRlc3RSZXN1bHQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaXMgZW1wdHkgaWYgbm8gdGVzdHMgYXJlIHlldCBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRMYWJlbHNJbihuZXcgVGVzdExpdmVUZXN0UmVzdWx0KFxuXHRcdFx0XHQnZm9vJyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRPcHRzKFsnaWQtYSddKSxcblx0XHRcdCkudGVzdHMpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbml0aWFsbHkgcXVldWVzIG5vdGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENoYW5nZVN1bW1hcnkoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5pdGlhbGl6ZXMgd2l0aCB0aGUgc3VidHJlZSBvZiByZXF1ZXN0ZWQgdGVzdHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldExhYmVsc0luKHIudGVzdHMpLCBbJ2EnLCAnYWEnLCAnYWInLCAncm9vdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luaXRpYWxpemVzIHdpdGggdmFsaWQgY291bnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYyA9IG1ha2VFbXB0eUNvdW50cygpO1xuXHRcdFx0Y1tUZXN0UmVzdWx0U3RhdGUuVW5zZXRdID0gNDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5jb3VudHMsIGMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0QWxsVG9TdGF0ZScsICgpID0+IHtcblx0XHRcdGNoYW5nZWQuY2xlYXIoKTtcblx0XHRcdHIuc2V0QWxsVG9TdGF0ZVB1YmxpYyhUZXN0UmVzdWx0U3RhdGUuUXVldWVkLCAndCcsIChfLCB0KSA9PiB0Lml0ZW0ubGFiZWwgIT09ICdyb290Jyk7XG5cdFx0XHRjb25zdCBjID0gbWFrZUVtcHR5Q291bnRzKCk7XG5cdFx0XHRjW1Rlc3RSZXN1bHRTdGF0ZS5VbnNldF0gPSAxO1xuXHRcdFx0Y1tUZXN0UmVzdWx0U3RhdGUuUXVldWVkXSA9IDM7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHIuY291bnRzLCBjKTtcblxuXHRcdFx0ci5zZXRBbGxUb1N0YXRlUHVibGljKFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQsICd0JywgKF8sIHQpID0+IHQuaXRlbS5sYWJlbCAhPT0gJ3Jvb3QnKTtcblx0XHRcdGNvbnN0IGMyID0gbWFrZUVtcHR5Q291bnRzKCk7XG5cdFx0XHRjMltUZXN0UmVzdWx0U3RhdGUuVW5zZXRdID0gMTtcblx0XHRcdGMyW1Rlc3RSZXN1bHRTdGF0ZS5GYWlsZWRdID0gMztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5jb3VudHMsIGMyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLmdldFN0YXRlQnlJZChuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSk/Lm93bkNvbXB1dGVkU3RhdGUsIFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLmdldFN0YXRlQnlJZChuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSk/LnRhc2tzWzBdLnN0YXRlLCBUZXN0UmVzdWx0U3RhdGUuRmFpbGVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hhbmdlU3VtbWFyeSgpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhJywgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Pd25TdGF0ZUNoYW5nZSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAncm9vdCcsIHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uQ29tcHV0ZWRTdGF0ZUNoYW5nZSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnYWEnLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdhYicsIHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2UgfSxcblxuXHRcdFx0XHR7IGxhYmVsOiAnYScsIHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2UgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Jvb3QnLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLkNvbXB1dGVkU3RhdGVDaGFuZ2UgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2FhJywgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Pd25TdGF0ZUNoYW5nZSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnYWInLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZVN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y2hhbmdlZC5jbGVhcigpO1xuXHRcdFx0Y29uc3QgdGVzdElkID0gbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJywgJ2lkLWFhJ10pLnRvU3RyaW5nKCk7XG5cdFx0XHRyLnVwZGF0ZVN0YXRlKHRlc3RJZCwgJ3QnLCBUZXN0UmVzdWx0U3RhdGUuUnVubmluZyk7XG5cdFx0XHRjb25zdCBjID0gbWFrZUVtcHR5Q291bnRzKCk7XG5cdFx0XHRjW1Rlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nXSA9IDE7XG5cdFx0XHRjW1Rlc3RSZXN1bHRTdGF0ZS5VbnNldF0gPSAzO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLmNvdW50cywgYyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHIuZ2V0U3RhdGVCeUlkKHRlc3RJZCk/Lm93bkNvbXB1dGVkU3RhdGUsIFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nKTtcblx0XHRcdC8vIHVwZGF0ZSBjb21wdXRlZCBzdGF0ZTpcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5nZXRTdGF0ZUJ5SWQodGVzdHMucm9vdC5pZCk/LmNvbXB1dGVkU3RhdGUsIFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hhbmdlU3VtbWFyeSgpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhYScsIHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2UgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2EnLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLkNvbXB1dGVkU3RhdGVDaGFuZ2UgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Jvb3QnLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLkNvbXB1dGVkU3RhdGVDaGFuZ2UgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRyLnVwZGF0ZVN0YXRlKHRlc3RJZCwgJ3QnLCBUZXN0UmVzdWx0U3RhdGUuUGFzc2VkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5nZXRTdGF0ZUJ5SWQodGVzdElkKT8ub3duQ29tcHV0ZWRTdGF0ZSwgVGVzdFJlc3VsdFN0YXRlLlBhc3NlZCk7XG5cblx0XHRcdHIudXBkYXRlU3RhdGUodGVzdElkLCAndCcsIFRlc3RSZXN1bHRTdGF0ZS5FcnJvcmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5nZXRTdGF0ZUJ5SWQodGVzdElkKT8ub3duQ29tcHV0ZWRTdGF0ZSwgVGVzdFJlc3VsdFN0YXRlLkVycm9yZWQpO1xuXG5cdFx0XHRyLnVwZGF0ZVN0YXRlKHRlc3RJZCwgJ3QnLCBUZXN0UmVzdWx0U3RhdGUuUGFzc2VkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5nZXRTdGF0ZUJ5SWQodGVzdElkKT8ub3duQ29tcHV0ZWRTdGF0ZSwgVGVzdFJlc3VsdFN0YXRlLkVycm9yZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBvdXRzaWRlIHJ1bicsICgpID0+IHtcblx0XHRcdGNoYW5nZWQuY2xlYXIoKTtcblx0XHRcdHIudXBkYXRlU3RhdGUobmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1iJ10pLnRvU3RyaW5nKCksICd0JywgVGVzdFJlc3VsdFN0YXRlLlJ1bm5pbmcpO1xuXHRcdFx0Y29uc3QgYyA9IG1ha2VFbXB0eUNvdW50cygpO1xuXHRcdFx0Y1tUZXN0UmVzdWx0U3RhdGUuVW5zZXRdID0gNDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5jb3VudHMsIGMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLmdldFN0YXRlQnlJZChuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWInXSkudG9TdHJpbmcoKSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrQ29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRyLnNldEFsbFRvU3RhdGVQdWJsaWMoVGVzdFJlc3VsdFN0YXRlLlF1ZXVlZCwgJ3QnLCAoKSA9PiB0cnVlKTtcblx0XHRcdHIudXBkYXRlU3RhdGUobmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJywgJ2lkLWFhJ10pLnRvU3RyaW5nKCksICd0JywgVGVzdFJlc3VsdFN0YXRlLlBhc3NlZCk7XG5cdFx0XHRjaGFuZ2VkLmNsZWFyKCk7XG5cblx0XHRcdHIubWFya0NvbXBsZXRlKCk7XG5cblx0XHRcdGNvbnN0IGMgPSBtYWtlRW1wdHlDb3VudHMoKTtcblx0XHRcdGNbVGVzdFJlc3VsdFN0YXRlLlNraXBwZWRdID0gMztcblx0XHRcdGNbVGVzdFJlc3VsdFN0YXRlLlBhc3NlZF0gPSAxO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLmNvdW50cywgYyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5nZXRTdGF0ZUJ5SWQodGVzdHMucm9vdC5pZCk/Lm93bkNvbXB1dGVkU3RhdGUsIFRlc3RSZXN1bHRTdGF0ZS5Ta2lwcGVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoci5nZXRTdGF0ZUJ5SWQobmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJywgJ2lkLWFhJ10pLnRvU3RyaW5nKCkpPy5vd25Db21wdXRlZFN0YXRlLCBUZXN0UmVzdWx0U3RhdGUuUGFzc2VkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NlcnZpY2UnLCAoKSA9PiB7XG5cdFx0bGV0IHN0b3JhZ2U6IElUZXN0UmVzdWx0U3RvcmFnZTtcblx0XHRsZXQgcmVzdWx0czogVGVzdFJlc3VsdFNlcnZpY2U7XG5cblx0XHRjbGFzcyBUZXN0VGVzdFJlc3VsdFNlcnZpY2UgZXh0ZW5kcyBUZXN0UmVzdWx0U2VydmljZSB7XG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcGVyc2lzdFNjaGVkdWxlciA9IHVwY2FzdFBhcnRpYWw8UnVuT25jZVNjaGVkdWxlcj4oeyBzY2hlZHVsZTogKCkgPT4gdGhpcy5wZXJzaXN0SW1tZWRpYXRlbHkoKSB9KTtcblx0XHR9XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzdG9yYWdlID0gZHMuYWRkKG5ldyBJbk1lbW9yeVJlc3VsdFN0b3JhZ2Uoe1xuXHRcdFx0XHRhc0Nhbm9uaWNhbFVyaSh1cmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdXJpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyBJVXJpSWRlbnRpdHlTZXJ2aWNlLCBkcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdHJlc3VsdHMgPSBkcy5hZGQobmV3IFRlc3RUZXN0UmVzdWx0U2VydmljZShcblx0XHRcdFx0bmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpLFxuXHRcdFx0XHRzdG9yYWdlLFxuXHRcdFx0XHRkcy5hZGQobmV3IFRlc3RQcm9maWxlU2VydmljZShuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCksIGRzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKSksXG5cdFx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwdXNoZXMgbmV3IHJlc3VsdCcsICgpID0+IHtcblx0XHRcdHJlc3VsdHMucHVzaChyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5yZXN1bHRzLCBbcl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VyaWFsaXplcyBhbmQgcmUtaHlkcmF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXN1bHRzLnB1c2gocik7XG5cdFx0XHRyLnVwZGF0ZVN0YXRlKG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYScsICdpZC1hYSddKS50b1N0cmluZygpLCAndCcsIFRlc3RSZXN1bHRTdGF0ZS5QYXNzZWQsIDQyKTtcblx0XHRcdHIubWFya0NvbXBsZXRlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTsgLy8gYWxsb3cgcGVyc2lzdEltbWVkaWF0ZWx5IGFzeW5jIHRvIGhhcHBlblxuXG5cdFx0XHRyZXN1bHRzID0gZHMuYWRkKG5ldyBUZXN0UmVzdWx0U2VydmljZShcblx0XHRcdFx0bmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpLFxuXHRcdFx0XHRzdG9yYWdlLFxuXHRcdFx0XHRkcy5hZGQobmV3IFRlc3RQcm9maWxlU2VydmljZShuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCksIGRzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKSksXG5cdFx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCByZXN1bHRzLnJlc3VsdHMubGVuZ3RoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApOyAvLyBhbGxvdyBsb2FkIHByb21pc2UgdG8gcmVzb2x2ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIHJlc3VsdHMucmVzdWx0cy5sZW5ndGgpO1xuXG5cdFx0XHRjb25zdCBbcmVoeWRyYXRlZCwgYWN0dWFsXSA9IHJlc3VsdHMuZ2V0U3RhdGVCeUlkKHRlc3RzLnJvb3QuaWQpITtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBhbnkgPSB7IC4uLnIuZ2V0U3RhdGVCeUlkKHRlc3RzLnJvb3QuaWQpISB9O1xuXHRcdFx0ZXhwZWN0ZWQuaXRlbS51cmkgPSBhY3R1YWwuaXRlbS51cmk7XG5cdFx0XHRleHBlY3RlZC5pdGVtLmNoaWxkcmVuID0gdW5kZWZpbmVkO1xuXHRcdFx0ZXhwZWN0ZWQucmV0aXJlZCA9IHRydWU7XG5cdFx0XHRkZWxldGUgZXhwZWN0ZWQuY2hpbGRyZW47XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAuLi5leHBlY3RlZCB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVoeWRyYXRlZC5jb3VudHMsIHIuY291bnRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVoeWRyYXRlZC5jb21wbGV0ZWRBdCwgJ251bWJlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xlYXJzIHJlc3VsdHMgYnV0IGtlZXBzIG9uZ29pbmcgdGVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXN1bHRzLnB1c2gocik7XG5cdFx0XHRyLm1hcmtDb21wbGV0ZSgpO1xuXG5cdFx0XHRjb25zdCByMiA9IHJlc3VsdHMucHVzaChuZXcgTGl2ZVRlc3RSZXN1bHQoXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZGVmYXVsdE9wdHMoW10pLFxuXHRcdFx0XHRpbnNlcnRDb3VudGVyKyssXG5cdFx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0XHRyZXN1bHRzLmNsZWFyKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5yZXN1bHRzLCBbcjJdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIG9uZ29pbmcgdGVzdHMgb24gdG9wLCByZXN0b3JlZCBvcmRlciB3aGVuIGRvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXN1bHRzLnB1c2gocik7XG5cdFx0XHRjb25zdCByMiA9IHJlc3VsdHMucHVzaChuZXcgTGl2ZVRlc3RSZXN1bHQoXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZGVmYXVsdE9wdHMoW10pLFxuXHRcdFx0XHRpbnNlcnRDb3VudGVyKyssXG5cdFx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5yZXN1bHRzLCBbcjIsIHJdKTtcblx0XHRcdHIyLm1hcmtDb21wbGV0ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLnJlc3VsdHMsIFtyLCByMl0pO1xuXHRcdFx0ci5tYXJrQ29tcGxldGUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5yZXN1bHRzLCBbcjIsIHJdKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1ha2VIeWRyYXRlZCA9IGFzeW5jIChjb21wbGV0ZWRBdCA9IDQyLCBzdGF0ZSA9IFRlc3RSZXN1bHRTdGF0ZS5QYXNzZWQpID0+IG5ldyBIeWRyYXRlZFRlc3RSZXN1bHQoe1xuXHRcdFx0YXNDYW5vbmljYWxVcmkodXJpKSB7XG5cdFx0XHRcdHJldHVybiB1cmk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgSVVyaUlkZW50aXR5U2VydmljZSwge1xuXHRcdFx0Y29tcGxldGVkQXQsXG5cdFx0XHRpZDogJ3NvbWUtaWQnLFxuXHRcdFx0dGFza3M6IFt7IGlkOiAndCcsIG5hbWU6IHVuZGVmaW5lZCwgY3RybElkOiAnY3RybCcsIGhhc0NvdmVyYWdlOiBmYWxzZSB9XSxcblx0XHRcdG5hbWU6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRyZXF1ZXN0OiBkZWZhdWx0T3B0cyhbXSksXG5cdFx0XHRpdGVtczogW3tcblx0XHRcdFx0Li4uKGF3YWl0IGdldEluaXRpYWxpemVkTWFpblRlc3RDb2xsZWN0aW9uKCkpLmdldE5vZGVCeUlkKG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYSddKS50b1N0cmluZygpKSEsXG5cdFx0XHRcdHRhc2tzOiBbeyBzdGF0ZSwgZHVyYXRpb246IDAsIG1lc3NhZ2VzOiBbXSB9XSxcblx0XHRcdFx0Y29tcHV0ZWRTdGF0ZTogc3RhdGUsXG5cdFx0XHRcdG93bkNvbXB1dGVkU3RhdGU6IHN0YXRlLFxuXHRcdFx0fV1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3B1c2hlcyBoeWRyYXRlZCByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVzdWx0cy5wdXNoKHIpO1xuXHRcdFx0Y29uc3QgaHlkcmF0ZWQgPSBhd2FpdCBtYWtlSHlkcmF0ZWQoKTtcblx0XHRcdHJlc3VsdHMucHVzaChoeWRyYXRlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMucmVzdWx0cywgW3IsIGh5ZHJhdGVkXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnRzIGluIGNvcnJlY3Qgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXN1bHRzLnB1c2gocik7XG5cdFx0XHRjb25zdCBoeWRyYXRlZDEgPSBhd2FpdCBtYWtlSHlkcmF0ZWQoKTtcblx0XHRcdHJlc3VsdHMucHVzaChoeWRyYXRlZDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLnJlc3VsdHMsIFtyLCBoeWRyYXRlZDFdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2VydHMgaW4gY29ycmVjdCBvcmRlciAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVzdWx0cy5wdXNoKHIpO1xuXHRcdFx0Y29uc3QgaHlkcmF0ZWQxID0gYXdhaXQgbWFrZUh5ZHJhdGVkKCk7XG5cdFx0XHRyZXN1bHRzLnB1c2goaHlkcmF0ZWQxKTtcblx0XHRcdGNvbnN0IGh5ZHJhdGVkMiA9IGF3YWl0IG1ha2VIeWRyYXRlZCgzMCk7XG5cdFx0XHRyZXN1bHRzLnB1c2goaHlkcmF0ZWQyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5yZXN1bHRzLCBbciwgaHlkcmF0ZWQxLCBoeWRyYXRlZDJdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdWx0SXRlbVBhcmVudHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0SXRlbVBhcmVudHMociwgci5nZXRTdGF0ZUJ5SWQobmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJywgJ2lkLWFhJ10pLnRvU3RyaW5nKCkpISldLCBbXG5cdFx0XHRyLmdldFN0YXRlQnlJZChuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnLCAnaWQtYWEnXSkudG9TdHJpbmcoKSksXG5cdFx0XHRyLmdldFN0YXRlQnlJZChuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSksXG5cdFx0XHRyLmdldFN0YXRlQnlJZChuZXcgVGVzdElkKFsnY3RybElkJ10pLnRvU3RyaW5nKCkpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0SXRlbVBhcmVudHMociwgci5nZXRTdGF0ZUJ5SWQodGVzdHMucm9vdC5pZCkhKV0sIFtcblx0XHRcdHIuZ2V0U3RhdGVCeUlkKHRlc3RzLnJvb3QuaWQpLFxuXHRcdF0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnb3V0cHV0IGNvbnRyb2xsZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVhZHMgbGl2ZSBvdXRwdXQgcmFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3RybCA9IG5ldyBUYXNrUmF3T3V0cHV0KCk7XG5cblx0XHRcdGN0cmwuYXBwZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJzEyMzQ1JykpO1xuXHRcdFx0Y3RybC5hcHBlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnNjc4OTAnKSk7XG5cdFx0XHRjdHJsLmFwcGVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCcxMjM0NScpKTtcblx0XHRcdGN0cmwuYXBwZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJzY3ODkwJykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0cmwuZ2V0UmFuZ2UoMCwgNSksIFZTQnVmZmVyLmZyb21TdHJpbmcoJzEyMzQ1JykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdHJsLmdldFJhbmdlKDUsIDUpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCc2Nzg5MCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3RybC5nZXRSYW5nZSg3LCA2KSwgVlNCdWZmZXIuZnJvbVN0cmluZygnODkwMTIzJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdHJsLmdldFJhbmdlKDE1LCA1KSwgVlNCdWZmZXIuZnJvbVN0cmluZygnNjc4OTAnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0cmwuZ2V0UmFuZ2UoMTUsIDEwKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnNjc4OTAnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb3JyZWN0cyBvZmZzZXRzIGZvciBtYXJrZWQgcmFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3RybCA9IG5ldyBUYXNrUmF3T3V0cHV0KCk7XG5cblx0XHRcdGNvbnN0IGExID0gY3RybC5hcHBlbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnMTIzNDUnKSwgMSk7XG5cdFx0XHRjb25zdCBhMiA9IGN0cmwuYXBwZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJzY3ODkwJyksIDEyMzQpO1xuXHRcdFx0Y29uc3QgYTMgPSBjdHJsLmFwcGVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCd3aXRoIG5ldyBsaW5lXFxyXFxuJyksIDQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0cmwuZ2V0UmFuZ2UoYTEub2Zmc2V0LCBhMS5sZW5ndGgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdcXHgxYl02MzM7U2V0TWFyaztJZD1zMTtIaWRkZW5cXHgwNzEyMzQ1XFx4MWJdNjMzO1NldE1hcms7SWQ9ZTE7SGlkZGVuXFx4MDcnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0cmwuZ2V0UmFuZ2UoYTIub2Zmc2V0LCBhMi5sZW5ndGgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdcXHgxYl02MzM7U2V0TWFyaztJZD1zMTIzNDtIaWRkZW5cXHgwNzY3ODkwXFx4MWJdNjMzO1NldE1hcms7SWQ9ZTEyMzQ7SGlkZGVuXFx4MDcnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0cmwuZ2V0UmFuZ2UoYTMub2Zmc2V0LCBhMy5sZW5ndGgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdcXHgxYl02MzM7U2V0TWFyaztJZD1zNDtIaWRkZW5cXHgwN3dpdGggbmV3IGxpbmVcXHgxYl02MzM7U2V0TWFyaztJZD1lNDtIaWRkZW5cXHgwN1xcclxcbicpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUEyQixlQUFlO0FBQzFDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsY0FBYztBQUN2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQixnQkFBZ0IsZUFBcUMsNEJBQTRCLHlCQUF5QjtBQUN2SSxTQUFTLHlCQUF5QjtBQUNsQyxTQUE2Qiw2QkFBNkI7QUFDMUQsU0FBaUUsaUJBQWlCLDRCQUE0QjtBQUM5RyxTQUFTLHVCQUF1QjtBQUNoQyxTQUE2QixrQ0FBa0MsaUJBQWlCO0FBQ2hGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBRTlCLE1BQU0sb0NBQW9DLE1BQU07QUFDL0MsUUFBTSxjQUFjLENBQUMsT0FBaUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLE9BQUssRUFBRSxLQUFLLEtBQUssRUFBRSxLQUFLO0FBQzFGLFFBQU0sbUJBQW1CLE1BQU0sQ0FBQyxHQUFHLE9BQU8sRUFDeEMsSUFBSSxRQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsT0FBTyxFQUFFLEtBQUssS0FBSyxNQUFNLEVBQUU7QUFFM0QsTUFBSTtBQUNKLE1BQUksVUFBVSxvQkFBSSxJQUEwQjtBQUM1QyxNQUFJO0FBRUosUUFBTSxjQUFjLENBQUMsYUFBK0M7QUFBQSxJQUNuRSxPQUFPLHFCQUFxQjtBQUFBLElBQzVCLFNBQVMsQ0FBQztBQUFBLE1BQ1QsV0FBVztBQUFBLE1BQ1gsY0FBYztBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBRUEsTUFBSSxnQkFBZ0I7QUFBQSxFQUVwQixNQUFNLDJCQUEyQixlQUFlO0FBQUEsSUFDL0MsWUFDQyxJQUNBLFNBQ0EsU0FDQztBQUNELFlBQU0sSUFBSSxTQUFTLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUNqRSxTQUFHLElBQUksSUFBSTtBQUFBLElBQ1o7QUFBQSxJQUVPLG9CQUFvQixPQUF3QixRQUFnQixNQUErRDtBQUNqSSxXQUFLLGNBQWMsT0FBTyxRQUFRLElBQUk7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFFQSxRQUFNLEtBQUssd0NBQXdDO0FBRW5ELFFBQU0sWUFBWTtBQUNqQixjQUFVLG9CQUFJLElBQUk7QUFDbEIsUUFBSSxHQUFHLElBQUksSUFBSTtBQUFBLE1BQ2Q7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFZLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDckIsQ0FBQztBQUVELE9BQUcsSUFBSSxFQUFFLFNBQVMsT0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDdEMsTUFBRSxRQUFRLEVBQUUsSUFBSSxLQUFLLE1BQU0sS0FBSyxTQUFTLE1BQU0sUUFBUSxPQUFPLENBQUM7QUFFL0QsWUFBUSxHQUFHLElBQUksVUFBVSxPQUFPLENBQUM7QUFDakMsVUFBTSxNQUFNLEdBQUcsSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBQ2hELFVBQU0sS0FBSyxNQUFNLFFBQVEsS0FBSztBQUFBLE1BQzdCLFFBQVEsUUFBUSxNQUFNLE9BQU8sTUFBTSxLQUFLLElBQUksUUFBUSxDQUFDLEVBQUUsS0FBSyxNQUFNLElBQUk7QUFBQSxNQUN0RSxRQUFRLEtBQU0sSUFBSSxLQUFLLEVBQUUsS0FBSyxNQUFNLEtBQUs7QUFBQSxJQUMxQyxDQUFDO0FBQ0QsUUFBSSxPQUFPO0FBR1gsUUFBSSxDQUFDLElBQUk7QUFDUixZQUFNLElBQUksTUFBTSxzQ0FBc0MsS0FBSyxVQUFVLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFBQSxJQUMxRjtBQUVBLE1BQUUsa0JBQWtCLFVBQVU7QUFBQSxNQUM3QixNQUFNLEtBQUssV0FBVztBQUFBLE1BQ3RCLE1BQU0sS0FBSyxTQUFTLElBQUksTUFBTSxFQUFHLFdBQVc7QUFBQSxNQUM1QyxNQUFNLEtBQUssU0FBUyxJQUFJLE1BQU0sRUFBRyxTQUFTLElBQUksT0FBTyxFQUFHLFdBQVc7QUFBQSxJQUNwRSxDQUFDO0FBRUQsTUFBRSxrQkFBa0IsVUFBVTtBQUFBLE1BQzdCLE1BQU0sS0FBSyxTQUFTLElBQUksTUFBTSxFQUFHLFdBQVc7QUFBQSxNQUM1QyxNQUFNLEtBQUssU0FBUyxJQUFJLE1BQU0sRUFBRyxTQUFTLElBQUksT0FBTyxFQUFHLFdBQVc7QUFBQSxJQUNwRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBSUQsUUFBTSxrQkFBa0IsTUFBTTtBQUM3QixTQUFLLHdDQUF3QyxZQUFZO0FBQ3hELGFBQU8sZ0JBQWdCLFlBQVksSUFBSTtBQUFBLFFBQ3RDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsWUFBWSxDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQ3JCLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2IsQ0FBQztBQUVELFNBQUssNEJBQTRCLE1BQU07QUFDdEMsYUFBTyxnQkFBZ0IsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDOUMsQ0FBQztBQUVELFNBQUssbURBQW1ELE1BQU07QUFDN0QsYUFBTyxnQkFBZ0IsWUFBWSxFQUFFLEtBQUssR0FBRyxDQUFDLEtBQUssTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQ3ZFLENBQUM7QUFFRCxTQUFLLGlDQUFpQyxNQUFNO0FBQzNDLFlBQU0sSUFBSSxnQkFBZ0I7QUFDMUIsUUFBRSxnQkFBZ0IsS0FBSyxJQUFJO0FBQzNCLGFBQU8sZ0JBQWdCLEVBQUUsUUFBUSxDQUFDO0FBQUEsSUFDbkMsQ0FBQztBQUVELFNBQUssaUJBQWlCLE1BQU07QUFDM0IsY0FBUSxNQUFNO0FBQ2QsUUFBRSxvQkFBb0IsZ0JBQWdCLFFBQVEsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssVUFBVSxNQUFNO0FBQ3BGLFlBQU0sSUFBSSxnQkFBZ0I7QUFDMUIsUUFBRSxnQkFBZ0IsS0FBSyxJQUFJO0FBQzNCLFFBQUUsZ0JBQWdCLE1BQU0sSUFBSTtBQUM1QixhQUFPLGdCQUFnQixFQUFFLFFBQVEsQ0FBQztBQUVsQyxRQUFFLG9CQUFvQixnQkFBZ0IsUUFBUSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxVQUFVLE1BQU07QUFDcEYsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixTQUFHLGdCQUFnQixLQUFLLElBQUk7QUFDNUIsU0FBRyxnQkFBZ0IsTUFBTSxJQUFJO0FBQzdCLGFBQU8sZ0JBQWdCLEVBQUUsUUFBUSxFQUFFO0FBRW5DLGFBQU8sZ0JBQWdCLEVBQUUsYUFBYSxJQUFJLE9BQU8sQ0FBQyxVQUFVLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxHQUFHLGtCQUFrQixnQkFBZ0IsTUFBTTtBQUMxSCxhQUFPLGdCQUFnQixFQUFFLGFBQWEsSUFBSSxPQUFPLENBQUMsVUFBVSxNQUFNLENBQUMsRUFBRSxTQUFTLENBQUMsR0FBRyxNQUFNLENBQUMsRUFBRSxPQUFPLGdCQUFnQixNQUFNO0FBQ3hILGFBQU8sZ0JBQWdCLGlCQUFpQixHQUFHO0FBQUEsUUFDMUMsRUFBRSxPQUFPLEtBQUssUUFBUSwyQkFBMkIsZUFBZTtBQUFBLFFBQ2hFLEVBQUUsT0FBTyxRQUFRLFFBQVEsMkJBQTJCLG9CQUFvQjtBQUFBLFFBQ3hFLEVBQUUsT0FBTyxNQUFNLFFBQVEsMkJBQTJCLGVBQWU7QUFBQSxRQUNqRSxFQUFFLE9BQU8sTUFBTSxRQUFRLDJCQUEyQixlQUFlO0FBQUEsUUFFakUsRUFBRSxPQUFPLEtBQUssUUFBUSwyQkFBMkIsZUFBZTtBQUFBLFFBQ2hFLEVBQUUsT0FBTyxRQUFRLFFBQVEsMkJBQTJCLG9CQUFvQjtBQUFBLFFBQ3hFLEVBQUUsT0FBTyxNQUFNLFFBQVEsMkJBQTJCLGVBQWU7QUFBQSxRQUNqRSxFQUFFLE9BQU8sTUFBTSxRQUFRLDJCQUEyQixlQUFlO0FBQUEsTUFDbEUsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssZUFBZSxNQUFNO0FBQ3pCLGNBQVEsTUFBTTtBQUNkLFlBQU0sU0FBUyxJQUFJLE9BQU8sQ0FBQyxVQUFVLFFBQVEsT0FBTyxDQUFDLEVBQUUsU0FBUztBQUNoRSxRQUFFLFlBQVksUUFBUSxLQUFLLGdCQUFnQixPQUFPO0FBQ2xELFlBQU0sSUFBSSxnQkFBZ0I7QUFDMUIsUUFBRSxnQkFBZ0IsT0FBTyxJQUFJO0FBQzdCLFFBQUUsZ0JBQWdCLEtBQUssSUFBSTtBQUMzQixhQUFPLGdCQUFnQixFQUFFLFFBQVEsQ0FBQztBQUNsQyxhQUFPLGdCQUFnQixFQUFFLGFBQWEsTUFBTSxHQUFHLGtCQUFrQixnQkFBZ0IsT0FBTztBQUV4RixhQUFPLGdCQUFnQixFQUFFLGFBQWEsTUFBTSxLQUFLLEVBQUUsR0FBRyxlQUFlLGdCQUFnQixPQUFPO0FBQzVGLGFBQU8sZ0JBQWdCLGlCQUFpQixHQUFHO0FBQUEsUUFDMUMsRUFBRSxPQUFPLE1BQU0sUUFBUSwyQkFBMkIsZUFBZTtBQUFBLFFBQ2pFLEVBQUUsT0FBTyxLQUFLLFFBQVEsMkJBQTJCLG9CQUFvQjtBQUFBLFFBQ3JFLEVBQUUsT0FBTyxRQUFRLFFBQVEsMkJBQTJCLG9CQUFvQjtBQUFBLE1BQ3pFLENBQUM7QUFFRCxRQUFFLFlBQVksUUFBUSxLQUFLLGdCQUFnQixNQUFNO0FBQ2pELGFBQU8sZ0JBQWdCLEVBQUUsYUFBYSxNQUFNLEdBQUcsa0JBQWtCLGdCQUFnQixNQUFNO0FBRXZGLFFBQUUsWUFBWSxRQUFRLEtBQUssZ0JBQWdCLE9BQU87QUFDbEQsYUFBTyxnQkFBZ0IsRUFBRSxhQUFhLE1BQU0sR0FBRyxrQkFBa0IsZ0JBQWdCLE9BQU87QUFFeEYsUUFBRSxZQUFZLFFBQVEsS0FBSyxnQkFBZ0IsTUFBTTtBQUNqRCxhQUFPLGdCQUFnQixFQUFFLGFBQWEsTUFBTSxHQUFHLGtCQUFrQixnQkFBZ0IsT0FBTztBQUFBLElBQ3pGLENBQUM7QUFFRCxTQUFLLHVCQUF1QixNQUFNO0FBQ2pDLGNBQVEsTUFBTTtBQUNkLFFBQUUsWUFBWSxJQUFJLE9BQU8sQ0FBQyxVQUFVLE1BQU0sQ0FBQyxFQUFFLFNBQVMsR0FBRyxLQUFLLGdCQUFnQixPQUFPO0FBQ3JGLFlBQU0sSUFBSSxnQkFBZ0I7QUFDMUIsUUFBRSxnQkFBZ0IsS0FBSyxJQUFJO0FBQzNCLGFBQU8sZ0JBQWdCLEVBQUUsUUFBUSxDQUFDO0FBQ2xDLGFBQU8sZ0JBQWdCLEVBQUUsYUFBYSxJQUFJLE9BQU8sQ0FBQyxVQUFVLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxHQUFHLE1BQVM7QUFBQSxJQUM1RixDQUFDO0FBRUQsU0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixRQUFFLG9CQUFvQixnQkFBZ0IsUUFBUSxLQUFLLE1BQU0sSUFBSTtBQUM3RCxRQUFFLFlBQVksSUFBSSxPQUFPLENBQUMsVUFBVSxRQUFRLE9BQU8sQ0FBQyxFQUFFLFNBQVMsR0FBRyxLQUFLLGdCQUFnQixNQUFNO0FBQzdGLGNBQVEsTUFBTTtBQUVkLFFBQUUsYUFBYTtBQUVmLFlBQU0sSUFBSSxnQkFBZ0I7QUFDMUIsUUFBRSxnQkFBZ0IsT0FBTyxJQUFJO0FBQzdCLFFBQUUsZ0JBQWdCLE1BQU0sSUFBSTtBQUM1QixhQUFPLGdCQUFnQixFQUFFLFFBQVEsQ0FBQztBQUVsQyxhQUFPLGdCQUFnQixFQUFFLGFBQWEsTUFBTSxLQUFLLEVBQUUsR0FBRyxrQkFBa0IsZ0JBQWdCLE9BQU87QUFDL0YsYUFBTyxnQkFBZ0IsRUFBRSxhQUFhLElBQUksT0FBTyxDQUFDLFVBQVUsUUFBUSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsR0FBRyxrQkFBa0IsZ0JBQWdCLE1BQU07QUFBQSxJQUNwSSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxXQUFXLE1BQU07QUFDdEIsUUFBSTtBQUNKLFFBQUk7QUFBQSxJQUVKLE1BQU0sOEJBQThCLGtCQUFrQjtBQUFBLE1BQXREO0FBQUE7QUFDQyxhQUFtQixtQkFBbUIsY0FBZ0MsRUFBRSxVQUFVLE1BQU0sS0FBSyxtQkFBbUIsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUNwSDtBQUVBLFVBQU0sTUFBTTtBQUNYLGdCQUFVLEdBQUcsSUFBSSxJQUFJLHNCQUFzQjtBQUFBLFFBQzFDLGVBQWUsS0FBSztBQUNuQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNELEdBQTBCLEdBQUcsSUFBSSxJQUFJLG1CQUFtQixDQUFDLEdBQUcsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUNqRixnQkFBVSxHQUFHLElBQUksSUFBSTtBQUFBLFFBQ3BCLElBQUksc0JBQXNCO0FBQUEsUUFDMUI7QUFBQSxRQUNBLEdBQUcsSUFBSSxJQUFJLG1CQUFtQixJQUFJLHNCQUFzQixHQUFHLEdBQUcsSUFBSSxJQUFJLG1CQUFtQixDQUFDLENBQUMsQ0FBQztBQUFBLFFBQzVGO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxxQkFBcUIsTUFBTTtBQUMvQixjQUFRLEtBQUssQ0FBQztBQUNkLGFBQU8sZ0JBQWdCLFFBQVEsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzVDLENBQUM7QUFFRCxTQUFLLDhCQUE4QixZQUFZO0FBQzlDLGNBQVEsS0FBSyxDQUFDO0FBQ2QsUUFBRSxZQUFZLElBQUksT0FBTyxDQUFDLFVBQVUsUUFBUSxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxnQkFBZ0IsUUFBUSxFQUFFO0FBQ2pHLFFBQUUsYUFBYTtBQUNmLFlBQU0sUUFBUSxFQUFFO0FBRWhCLGdCQUFVLEdBQUcsSUFBSSxJQUFJO0FBQUEsUUFDcEIsSUFBSSxzQkFBc0I7QUFBQSxRQUMxQjtBQUFBLFFBQ0EsR0FBRyxJQUFJLElBQUksbUJBQW1CLElBQUksc0JBQXNCLEdBQUcsR0FBRyxJQUFJLElBQUksbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDNUY7QUFBQSxNQUNELENBQUM7QUFFRCxhQUFPLFlBQVksR0FBRyxRQUFRLFFBQVEsTUFBTTtBQUM1QyxZQUFNLFFBQVEsRUFBRTtBQUNoQixhQUFPLFlBQVksR0FBRyxRQUFRLFFBQVEsTUFBTTtBQUU1QyxZQUFNLENBQUMsWUFBWSxNQUFNLElBQUksUUFBUSxhQUFhLE1BQU0sS0FBSyxFQUFFO0FBQy9ELFlBQU0sV0FBZ0IsRUFBRSxHQUFHLEVBQUUsYUFBYSxNQUFNLEtBQUssRUFBRSxFQUFHO0FBQzFELGVBQVMsS0FBSyxNQUFNLE9BQU8sS0FBSztBQUNoQyxlQUFTLEtBQUssV0FBVztBQUN6QixlQUFTLFVBQVU7QUFDbkIsYUFBTyxTQUFTO0FBQ2hCLGFBQU8sZ0JBQWdCLFFBQVEsRUFBRSxHQUFHLFNBQVMsQ0FBQztBQUM5QyxhQUFPLGdCQUFnQixXQUFXLFFBQVEsRUFBRSxNQUFNO0FBQ2xELGFBQU8sWUFBWSxPQUFPLFdBQVcsYUFBYSxRQUFRO0FBQUEsSUFDM0QsQ0FBQztBQUVELFNBQUssMENBQTBDLFlBQVk7QUFDMUQsY0FBUSxLQUFLLENBQUM7QUFDZCxRQUFFLGFBQWE7QUFFZixZQUFNLEtBQUssUUFBUSxLQUFLLElBQUk7QUFBQSxRQUMzQjtBQUFBLFFBQ0E7QUFBQSxRQUNBLFlBQVksQ0FBQyxDQUFDO0FBQUEsUUFDZDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFDRCxjQUFRLE1BQU07QUFFZCxhQUFPLGdCQUFnQixRQUFRLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUM3QyxDQUFDO0FBRUQsU0FBSyx3REFBd0QsWUFBWTtBQUN4RSxjQUFRLEtBQUssQ0FBQztBQUNkLFlBQU0sS0FBSyxRQUFRLEtBQUssSUFBSTtBQUFBLFFBQzNCO0FBQUEsUUFDQTtBQUFBLFFBQ0EsWUFBWSxDQUFDLENBQUM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELGFBQU8sZ0JBQWdCLFFBQVEsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9DLFNBQUcsYUFBYTtBQUNoQixhQUFPLGdCQUFnQixRQUFRLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUMvQyxRQUFFLGFBQWE7QUFDZixhQUFPLGdCQUFnQixRQUFRLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ2hELENBQUM7QUFFRCxVQUFNLGVBQWUsT0FBTyxjQUFjLElBQUksUUFBUSxnQkFBZ0IsV0FBVyxJQUFJLG1CQUFtQjtBQUFBLE1BQ3ZHLGVBQWUsS0FBSztBQUNuQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsR0FBMEI7QUFBQSxNQUN6QjtBQUFBLE1BQ0EsSUFBSTtBQUFBLE1BQ0osT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE1BQU0sUUFBVyxRQUFRLFFBQVEsYUFBYSxNQUFNLENBQUM7QUFBQSxNQUN4RSxNQUFNO0FBQUEsTUFDTixTQUFTLFlBQVksQ0FBQyxDQUFDO0FBQUEsTUFDdkIsT0FBTyxDQUFDO0FBQUEsUUFDUCxJQUFJLE1BQU0saUNBQWlDLEdBQUcsWUFBWSxJQUFJLE9BQU8sQ0FBQyxVQUFVLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUFBLFFBQ25HLE9BQU8sQ0FBQyxFQUFFLE9BQU8sVUFBVSxHQUFHLFVBQVUsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUM1QyxlQUFlO0FBQUEsUUFDZixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywyQkFBMkIsWUFBWTtBQUMzQyxjQUFRLEtBQUssQ0FBQztBQUNkLFlBQU0sV0FBVyxNQUFNLGFBQWE7QUFDcEMsY0FBUSxLQUFLLFFBQVE7QUFDckIsYUFBTyxnQkFBZ0IsUUFBUSxTQUFTLENBQUMsR0FBRyxRQUFRLENBQUM7QUFBQSxJQUN0RCxDQUFDO0FBRUQsU0FBSyw0QkFBNEIsWUFBWTtBQUM1QyxjQUFRLEtBQUssQ0FBQztBQUNkLFlBQU0sWUFBWSxNQUFNLGFBQWE7QUFDckMsY0FBUSxLQUFLLFNBQVM7QUFDdEIsYUFBTyxnQkFBZ0IsUUFBUSxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUM7QUFBQSxJQUN2RCxDQUFDO0FBRUQsU0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxjQUFRLEtBQUssQ0FBQztBQUNkLFlBQU0sWUFBWSxNQUFNLGFBQWE7QUFDckMsY0FBUSxLQUFLLFNBQVM7QUFDdEIsWUFBTSxZQUFZLE1BQU0sYUFBYSxFQUFFO0FBQ3ZDLGNBQVEsS0FBSyxTQUFTO0FBQ3RCLGFBQU8sZ0JBQWdCLFFBQVEsU0FBUyxDQUFDLEdBQUcsV0FBVyxTQUFTLENBQUM7QUFBQSxJQUNsRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxQkFBcUIsV0FBWTtBQUNyQyxXQUFPLGdCQUFnQixDQUFDLEdBQUcsa0JBQWtCLEdBQUcsRUFBRSxhQUFhLElBQUksT0FBTyxDQUFDLFVBQVUsUUFBUSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBRSxDQUFDLEdBQUc7QUFBQSxNQUN0SCxFQUFFLGFBQWEsSUFBSSxPQUFPLENBQUMsVUFBVSxRQUFRLE9BQU8sQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUFBLE1BQ2pFLEVBQUUsYUFBYSxJQUFJLE9BQU8sQ0FBQyxVQUFVLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUFBLE1BQ3hELEVBQUUsYUFBYSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxTQUFTLENBQUM7QUFBQSxJQUNqRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLGtCQUFrQixHQUFHLEVBQUUsYUFBYSxNQUFNLEtBQUssRUFBRSxDQUFFLENBQUMsR0FBRztBQUFBLE1BQ2pGLEVBQUUsYUFBYSxNQUFNLEtBQUssRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFNBQUssNEJBQTRCLFlBQVk7QUFDNUMsWUFBTSxPQUFPLElBQUksY0FBYztBQUUvQixXQUFLLE9BQU8sU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN4QyxXQUFLLE9BQU8sU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN4QyxXQUFLLE9BQU8sU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN4QyxXQUFLLE9BQU8sU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUV4QyxhQUFPLGdCQUFnQixLQUFLLFNBQVMsR0FBRyxDQUFDLEdBQUcsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN4RSxhQUFPLGdCQUFnQixLQUFLLFNBQVMsR0FBRyxDQUFDLEdBQUcsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN4RSxhQUFPLGdCQUFnQixLQUFLLFNBQVMsR0FBRyxDQUFDLEdBQUcsU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUN6RSxhQUFPLGdCQUFnQixLQUFLLFNBQVMsSUFBSSxDQUFDLEdBQUcsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN6RSxhQUFPLGdCQUFnQixLQUFLLFNBQVMsSUFBSSxFQUFFLEdBQUcsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUFBLElBQzNFLENBQUM7QUFFRCxTQUFLLHNDQUFzQyxZQUFZO0FBQ3RELFlBQU0sT0FBTyxJQUFJLGNBQWM7QUFFL0IsWUFBTSxLQUFLLEtBQUssT0FBTyxTQUFTLFdBQVcsT0FBTyxHQUFHLENBQUM7QUFDdEQsWUFBTSxLQUFLLEtBQUssT0FBTyxTQUFTLFdBQVcsT0FBTyxHQUFHLElBQUk7QUFDekQsWUFBTSxLQUFLLEtBQUssT0FBTyxTQUFTLFdBQVcsbUJBQW1CLEdBQUcsQ0FBQztBQUVsRSxhQUFPLGdCQUFnQixLQUFLLFNBQVMsR0FBRyxRQUFRLEdBQUcsTUFBTSxHQUFHLFNBQVMsV0FBVyx5RUFBeUUsQ0FBQztBQUMxSixhQUFPLGdCQUFnQixLQUFLLFNBQVMsR0FBRyxRQUFRLEdBQUcsTUFBTSxHQUFHLFNBQVMsV0FBVywrRUFBK0UsQ0FBQztBQUNoSyxhQUFPLGdCQUFnQixLQUFLLFNBQVMsR0FBRyxRQUFRLEdBQUcsTUFBTSxHQUFHLFNBQVMsV0FBVyxxRkFBcUYsQ0FBQztBQUFBLElBQ3ZLLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
