import assert from "assert";
import * as sinon from "sinon";
import { timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { URI } from "../../../../base/common/uri.js";
import { mock, mockObject } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import * as editorRange from "../../../../editor/common/core/range.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { ExtHostTesting, TestRunCoordinator, TestRunDto, TestRunProfileImpl } from "../../common/extHostTesting.js";
import { ExtHostTestItemCollection, TestItemImpl } from "../../common/extHostTestItem.js";
import * as convert from "../../common/extHostTypeConverters.js";
import { Location, Position, Range, TestMessage, TestRunProfileKind, TestRunRequest as TestRunRequestImpl, TestTag } from "../../common/extHostTypes.js";
import { AnyCallRPCProtocol } from "../common/testRPCProtocol.js";
import { TestId } from "../../../contrib/testing/common/testId.js";
import { TestDiffOpType, TestItemExpandState, TestMessageType } from "../../../contrib/testing/common/testTypes.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
const simplify = (item) => ({
  id: item.id,
  label: item.label,
  uri: item.uri,
  range: item.range
});
const assertTreesEqual = (a, b) => {
  if (!a) {
    throw new assert.AssertionError({ message: "Expected a to be defined", actual: a });
  }
  if (!b) {
    throw new assert.AssertionError({ message: "Expected b to be defined", actual: b });
  }
  assert.deepStrictEqual(simplify(a), simplify(b));
  const aChildren = [...a.children].map(([_, c]) => c.id).sort();
  const bChildren = [...b.children].map(([_, c]) => c.id).sort();
  assert.strictEqual(aChildren.length, bChildren.length, `expected ${a.label}.children.length == ${b.label}.children.length`);
  aChildren.forEach((key) => assertTreesEqual(a.children.get(key), b.children.get(key)));
};
suite("ExtHost Testing", () => {
  class TestExtHostTestItemCollection extends ExtHostTestItemCollection {
    setDiff(diff) {
      this.diff = diff;
    }
  }
  teardown(() => {
    sinon.restore();
  });
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let single;
  let resolveCalls = [];
  setup(() => {
    resolveCalls = [];
    single = ds.add(new TestExtHostTestItemCollection("ctrlId", "root", {
      getDocument: () => void 0
    }));
    single.resolveHandler = (item) => {
      resolveCalls.push(item?.id);
      if (item === void 0) {
        const a = new TestItemImpl("ctrlId", "id-a", "a", URI.file("/"));
        a.canResolveChildren = true;
        const b = new TestItemImpl("ctrlId", "id-b", "b", URI.file("/"));
        single.root.children.add(a);
        single.root.children.add(b);
      } else if (item.id === "id-a") {
        item.children.add(new TestItemImpl("ctrlId", "id-aa", "aa", URI.file("/")));
        item.children.add(new TestItemImpl("ctrlId", "id-ab", "ab", URI.file("/")));
      }
    };
    ds.add(single.onDidGenerateDiff((d) => single.setDiff(
      d
      /* don't clear during testing */
    )));
  });
  suite("OwnedTestCollection", () => {
    test("adds a root recursively", async () => {
      await single.expand(single.root.id, Infinity);
      const a = single.root.children.get("id-a");
      const b = single.root.children.get("id-b");
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(single.root) } }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(a) } }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(a.children.get("id-aa")) }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(a.children.get("id-ab")) }
        },
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), expand: TestItemExpandState.Expanded }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(b) }
        },
        {
          op: TestDiffOpType.Update,
          item: { extId: single.root.id, expand: TestItemExpandState.Expanded }
        }
      ]);
    });
    test("parents are set correctly", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const a = single.root.children.get("id-a");
      const ab = a.children.get("id-ab");
      assert.strictEqual(a.parent, void 0);
      assert.strictEqual(ab.parent, a);
    });
    test("can add an item with same ID as root", () => {
      single.collectDiff();
      const child = new TestItemImpl("ctrlId", "ctrlId", "c", void 0);
      single.root.children.add(child);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(child) }
        }
      ]);
    });
    test("no-ops if items not changed", () => {
      single.collectDiff();
      assert.deepStrictEqual(single.collectDiff(), []);
    });
    test("watches property mutations", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      single.root.children.get("id-a").description = "Hello world";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), item: { description: "Hello world" } }
        }
      ]);
    });
    test("removes children", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      single.root.children.delete("id-a");
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.Remove, itemId: new TestId(["ctrlId", "id-a"]).toString() }
      ]);
      assert.deepStrictEqual(
        [...single.tree.keys()].sort(),
        [single.root.id, new TestId(["ctrlId", "id-b"]).toString()]
      );
      assert.strictEqual(single.tree.size, 2);
    });
    test("adds new children", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const child = new TestItemImpl("ctrlId", "id-ac", "c", void 0);
      single.root.children.get("id-a").children.add(child);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Add,
          item: {
            controllerId: "ctrlId",
            expand: TestItemExpandState.NotExpandable,
            item: convert.TestItem.from(child)
          }
        }
      ]);
      assert.deepStrictEqual(
        [...single.tree.values()].map((n) => n.actual.id).sort(),
        [single.root.id, "id-a", "id-aa", "id-ab", "id-ac", "id-b"]
      );
      assert.strictEqual(single.tree.size, 6);
    });
    test("manages tags correctly", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const tag1 = new TestTag("tag1");
      const tag2 = new TestTag("tag2");
      const tag3 = new TestTag("tag3");
      const child = new TestItemImpl("ctrlId", "id-ac", "c", void 0);
      child.tags = [tag1, tag2];
      single.root.children.get("id-a").children.add(child);
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.AddTag, tag: { id: "ctrlId\0tag1" } },
        { op: TestDiffOpType.AddTag, tag: { id: "ctrlId\0tag2" } },
        {
          op: TestDiffOpType.Add,
          item: {
            controllerId: "ctrlId",
            expand: TestItemExpandState.NotExpandable,
            item: convert.TestItem.from(child)
          }
        }
      ]);
      child.tags = [tag2, tag3];
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.AddTag, tag: { id: "ctrlId\0tag3" } },
        {
          op: TestDiffOpType.Update,
          item: {
            extId: new TestId(["ctrlId", "id-a", "id-ac"]).toString(),
            item: { tags: ["ctrlId\0tag2", "ctrlId\0tag3"] }
          }
        },
        { op: TestDiffOpType.RemoveTag, id: "ctrlId\0tag1" }
      ]);
      const a = single.root.children.get("id-a");
      a.tags = [tag2];
      a.children.replace([]);
      assert.deepStrictEqual(single.collectDiff().filter((t) => t.op === TestDiffOpType.RemoveTag), [
        { op: TestDiffOpType.RemoveTag, id: "ctrlId\0tag3" }
      ]);
    });
    test("replaces on uri change", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const oldA = single.root.children.get("id-a");
      const uri = single.root.children.get("id-a").uri?.with({ path: "/different" });
      const newA = new TestItemImpl("ctrlId", "id-a", "Hello world", uri);
      newA.children.replace([...oldA.children].map(([_, item]) => item));
      single.root.children.replace([...single.root.children].map(([id, i]) => id === "id-a" ? newA : i));
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.Remove, itemId: new TestId(["ctrlId", "id-a"]).toString() },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: { ...convert.TestItem.from(newA) } }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(newA.children.get("id-aa")) }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(newA.children.get("id-ab")) }
        }
      ]);
    });
    test("treats in-place replacement as mutation", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const oldA = single.root.children.get("id-a");
      const uri = single.root.children.get("id-a").uri;
      const newA = new TestItemImpl("ctrlId", "id-a", "Hello world", uri);
      newA.children.replace([...oldA.children].map(([_, item]) => item));
      single.root.children.replace([
        newA,
        new TestItemImpl("ctrlId", "id-b", single.root.children.get("id-b").label, uri)
      ]);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), item: { label: "Hello world" } }
        },
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri
        }
      ]);
      newA.label = "still connected";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), item: { label: "still connected" } }
        }
      ]);
      oldA.label = "no longer connected";
      assert.deepStrictEqual(single.collectDiff(), []);
    });
    suite("expandibility restoration", () => {
      const doReplace = async (canResolveChildren = true) => {
        const uri = single.root.children.get("id-a").uri;
        const newA = new TestItemImpl("ctrlId", "id-a", "Hello world", uri);
        newA.canResolveChildren = canResolveChildren;
        single.root.children.replace([
          newA,
          new TestItemImpl("ctrlId", "id-b", single.root.children.get("id-b").label, uri)
        ]);
        await timeout(0);
      };
      test("does not restore an unexpanded state", async () => {
        await single.expand(single.root.id, 0);
        assert.deepStrictEqual(resolveCalls, [void 0]);
        await doReplace();
        assert.deepStrictEqual(resolveCalls, [void 0]);
      });
      test("restores resolve state on replacement", async () => {
        await single.expand(single.root.id, Infinity);
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a"]);
        await doReplace();
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a", "id-a"]);
      });
      test("does not expand if new child is not expandable", async () => {
        await single.expand(single.root.id, Infinity);
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a"]);
        await doReplace(false);
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a"]);
      });
    });
    test("treats in-place replacement as mutation deeply", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const oldA = single.root.children.get("id-a");
      const uri = oldA.uri;
      const newA = new TestItemImpl("ctrlId", "id-a", single.root.children.get("id-a").label, uri);
      const oldAA = oldA.children.get("id-aa");
      const oldAB = oldA.children.get("id-ab");
      const newAB = new TestItemImpl("ctrlId", "id-ab", "Hello world", uri);
      newA.children.replace([oldAA, newAB]);
      single.root.children.replace([newA, single.root.children.get("id-b")]);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: TestId.fromExtHostTestItem(oldAB, "ctrlId").toString(), item: { label: "Hello world" } }
        },
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri
        }
      ]);
      oldAA.label = "still connected1";
      newAB.label = "still connected2";
      oldAB.label = "not connected3";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a", "id-aa"]).toString(), item: { label: "still connected1" } }
        },
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a", "id-ab"]).toString(), item: { label: "still connected2" } }
        }
      ]);
      assert.strictEqual(newAB.parent, newA);
      assert.strictEqual(oldAA.parent, newA);
      assert.deepStrictEqual(newA.parent, void 0);
    });
    test("moves an item to be a new child", async () => {
      await single.expand(single.root.id, 0);
      single.collectDiff();
      const b = single.root.children.get("id-b");
      const a = single.root.children.get("id-a");
      a.children.add(b);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Remove,
          itemId: new TestId(["ctrlId", "id-b"]).toString()
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(b) }
        }
      ]);
      b.label = "still connected";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a", "id-b"]).toString(), item: { label: "still connected" } }
        }
      ]);
      assert.deepStrictEqual([...single.root.children].map(([_, item]) => item), [single.root.children.get("id-a")]);
      assert.deepStrictEqual(b.parent, a);
    });
    test("sends document sync events", async () => {
      await single.expand(single.root.id, 0);
      single.collectDiff();
      const a = single.root.children.get("id-a");
      a.range = new Range(new Position(0, 0), new Position(1, 0));
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri: URI.file("/")
        },
        {
          op: TestDiffOpType.Update,
          item: {
            extId: new TestId(["ctrlId", "id-a"]).toString(),
            item: {
              range: editorRange.Range.lift({
                endColumn: 1,
                endLineNumber: 2,
                startColumn: 1,
                startLineNumber: 1
              })
            }
          }
        }
      ]);
      a.range = a.range;
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri: URI.file("/")
        }
      ]);
      const uri = URI.file("/");
      const a2 = new TestItemImpl("ctrlId", "id-a", "a", uri);
      a2.range = a.range;
      single.root.children.replace([a2, single.root.children.get("id-b")]);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri
        }
      ]);
    });
  });
  suite("MirroredTestCollection", () => {
  });
  suite("TestRunTracker", () => {
    let proxy;
    let c;
    let cts;
    let configuration;
    let req;
    let dto;
    const ext = {};
    teardown(() => {
      for (const { id } of c.trackers) {
        c.disposeTestRun(id);
      }
    });
    setup(async () => {
      proxy = mockObject()();
      cts = new CancellationTokenSource();
      c = new TestRunCoordinator(proxy, new NullLogService());
      configuration = new TestRunProfileImpl(mockObject()(), /* @__PURE__ */ new Map(), /* @__PURE__ */ new Set(), Event.None, "ctrlId", 42, "Do Run", TestRunProfileKind.Run, () => {
      }, false);
      await single.expand(single.root.id, Infinity);
      single.collectDiff();
      req = {
        include: void 0,
        exclude: [single.root.children.get("id-b")],
        profile: configuration,
        preserveFocus: false
      };
      dto = TestRunDto.fromInternal({
        controllerId: "ctrl",
        profileId: configuration.profileId,
        excludeExtIds: ["id-b"],
        runId: "run-id",
        testIds: [single.root.id]
      }, single);
    });
    test("tracks a run started from a main thread request", () => {
      const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
      assert.strictEqual(tracker.hasRunningTasks, false);
      const task1 = c.createTestRun(ext, "ctrl", single, req, "run1", true);
      const task2 = c.createTestRun(ext, "ctrl", single, req, "run2", true);
      assert.strictEqual(proxy.$startedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      task1.appendOutput("hello");
      const taskId = proxy.$appendOutputToRun.args[0]?.[1];
      assert.deepStrictEqual([["run-id", taskId, VSBuffer.fromString("hello"), void 0, void 0]], proxy.$appendOutputToRun.args);
      task1.end();
      assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      task2.end();
      assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, false);
    });
    test("run cancel force ends after a timeout", () => {
      const clock = sinon.useFakeTimers();
      try {
        const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
        const task = c.createTestRun(ext, "ctrl", single, req, "run1", true);
        const onEnded = sinon.stub();
        ds.add(tracker.onEnd(onEnded));
        assert.strictEqual(task.token.isCancellationRequested, false);
        assert.strictEqual(tracker.hasRunningTasks, true);
        tracker.cancel();
        assert.strictEqual(task.token.isCancellationRequested, true);
        assert.strictEqual(tracker.hasRunningTasks, true);
        clock.tick(9999);
        assert.strictEqual(tracker.hasRunningTasks, true);
        assert.strictEqual(onEnded.called, false);
        clock.tick(1);
        assert.strictEqual(onEnded.called, true);
        assert.strictEqual(tracker.hasRunningTasks, false);
      } finally {
        clock.restore();
      }
    });
    test("run cancel force ends on second cancellation request", () => {
      const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
      const task = c.createTestRun(ext, "ctrl", single, req, "run1", true);
      const onEnded = sinon.stub();
      ds.add(tracker.onEnd(onEnded));
      assert.strictEqual(task.token.isCancellationRequested, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      tracker.cancel();
      assert.strictEqual(task.token.isCancellationRequested, true);
      assert.strictEqual(tracker.hasRunningTasks, true);
      assert.strictEqual(onEnded.called, false);
      tracker.cancel();
      assert.strictEqual(tracker.hasRunningTasks, false);
      assert.strictEqual(onEnded.called, true);
    });
    test("tracks a run started from an extension request", () => {
      const task1 = c.createTestRun(ext, "ctrl", single, req, "hello world", false);
      const tracker = Iterable.first(c.trackers);
      assert.strictEqual(tracker.hasRunningTasks, true);
      assert.deepStrictEqual(proxy.$startedExtensionTestRun.args, [
        [{
          profile: { group: 2, id: 42 },
          controllerId: "ctrl",
          id: tracker.id,
          include: [single.root.id],
          exclude: [new TestId(["ctrlId", "id-b"]).toString()],
          persist: false,
          continuous: false,
          preserveFocus: false
        }]
      ]);
      const task2 = c.createTestRun(ext, "ctrl", single, req, "run2", true);
      const task3Detached = c.createTestRun(ext, "ctrl", single, { ...req }, "task3Detached", true);
      task1.end();
      assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      task2.end();
      assert.deepStrictEqual(proxy.$finishedExtensionTestRun.args, [[tracker.id]]);
      assert.strictEqual(tracker.hasRunningTasks, false);
      task3Detached.end();
    });
    test("adds tests to run smartly", () => {
      const task1 = c.createTestRun(ext, "ctrlId", single, req, "hello world", false);
      const tracker = Iterable.first(c.trackers);
      const expectedArgs = [];
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.passed(single.root.children.get("id-a").children.get("id-aa"));
      expectedArgs.push([
        "ctrlId",
        tracker.id,
        [
          convert.TestItem.from(single.root),
          convert.TestItem.from(single.root.children.get("id-a")),
          convert.TestItem.from(single.root.children.get("id-a").children.get("id-aa"))
        ]
      ]);
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.enqueued(single.root.children.get("id-a").children.get("id-ab"));
      expectedArgs.push([
        "ctrlId",
        tracker.id,
        [
          convert.TestItem.from(single.root.children.get("id-a")),
          convert.TestItem.from(single.root.children.get("id-a").children.get("id-ab"))
        ]
      ]);
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.passed(single.root.children.get("id-a").children.get("id-ab"));
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.end();
    });
    test("adds test messages to run", () => {
      const test1 = new TestItemImpl("ctrlId", "id-c", "test c", URI.file("/testc.txt"));
      const test2 = new TestItemImpl("ctrlId", "id-d", "test d", URI.file("/testd.txt"));
      test1.range = test2.range = new Range(new Position(0, 0), new Position(1, 0));
      single.root.children.replace([test1, test2]);
      const task = c.createTestRun(ext, "ctrlId", single, req, "hello world", false);
      const message1 = new TestMessage("some message");
      message1.location = new Location(URI.file("/a.txt"), new Position(0, 0));
      task.failed(test1, message1);
      const args = proxy.$appendTestMessagesInRun.args[0];
      assert.deepStrictEqual(proxy.$appendTestMessagesInRun.args[0], [
        args[0],
        args[1],
        new TestId(["ctrlId", "id-c"]).toString(),
        [{
          message: "some message",
          type: TestMessageType.Error,
          expected: void 0,
          contextValue: void 0,
          actual: void 0,
          location: convert.location.from(message1.location),
          stackTrace: void 0
        }]
      ]);
      task.failed(test2, new TestMessage("some message"));
      assert.deepStrictEqual(proxy.$appendTestMessagesInRun.args[1], [
        args[0],
        args[1],
        new TestId(["ctrlId", "id-d"]).toString(),
        [{
          message: "some message",
          type: TestMessageType.Error,
          contextValue: void 0,
          expected: void 0,
          actual: void 0,
          location: convert.location.from({ uri: test2.uri, range: test2.range }),
          stackTrace: void 0
        }]
      ]);
      task.end();
    });
    test("guards calls after runs are ended", () => {
      const task = c.createTestRun(ext, "ctrl", single, req, "hello world", false);
      task.end();
      task.failed(single.root, new TestMessage("some message"));
      task.appendOutput("output");
      assert.strictEqual(proxy.$addTestsToRun.called, false);
      assert.strictEqual(proxy.$appendOutputToRun.called, false);
      assert.strictEqual(proxy.$appendTestMessagesInRun.called, false);
    });
    test("sets state of test with identical local IDs (#131827)", () => {
      const testA = single.root.children.get("id-a");
      const testB = single.root.children.get("id-b");
      const childA = new TestItemImpl("ctrlId", "id-child", "child", void 0);
      testA.children.replace([childA]);
      const childB = new TestItemImpl("ctrlId", "id-child", "child", void 0);
      testB.children.replace([childB]);
      const task1 = c.createTestRun(ext, "ctrl", single, new TestRunRequestImpl(), "hello world", false);
      const tracker = Iterable.first(c.trackers);
      task1.passed(childA);
      task1.passed(childB);
      assert.deepStrictEqual(proxy.$addTestsToRun.args, [
        [
          "ctrl",
          tracker.id,
          [single.root, testA, childA].map((t) => convert.TestItem.from(t))
        ],
        [
          "ctrl",
          tracker.id,
          [single.root, testB, childB].map((t) => convert.TestItem.from(t))
        ]
      ]);
      task1.end();
    });
  });
  suite("service", () => {
    let ctrl;
    class TestExtHostTesting extends ExtHostTesting {
      getProfileInternalId(ctrl2, profile) {
        for (const [id, p] of this.controllers.get(ctrl2.id).profiles) {
          if (profile === p) {
            return id;
          }
        }
        throw new Error("profile not found");
      }
    }
    setup(() => {
      const rpcProtocol = AnyCallRPCProtocol();
      ctrl = ds.add(new TestExtHostTesting(
        rpcProtocol,
        new NullLogService(),
        new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
          onExtensionError() {
            return true;
          }
        }()),
        new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService())
      ));
    });
    test("exposes active profiles correctly", async () => {
      const extA = { ...nullExtensionDescription, identifier: new ExtensionIdentifier("ext.a"), enabledApiProposals: ["testingActiveProfile"] };
      const extB = { ...nullExtensionDescription, identifier: new ExtensionIdentifier("ext.b"), enabledApiProposals: ["testingActiveProfile"] };
      const ctrlA = ds.add(ctrl.createTestController(extA, "a", "ctrla"));
      const profAA = ds.add(ctrlA.createRunProfile("aa", TestRunProfileKind.Run, () => {
      }));
      const profAB = ds.add(ctrlA.createRunProfile("ab", TestRunProfileKind.Run, () => {
      }));
      const ctrlB = ds.add(ctrl.createTestController(extB, "b", "ctrlb"));
      const profBA = ds.add(ctrlB.createRunProfile("ba", TestRunProfileKind.Run, () => {
      }));
      const profBB = ds.add(ctrlB.createRunProfile("bb", TestRunProfileKind.Run, () => {
      }));
      const neverCalled = sinon.stub();
      assert.deepStrictEqual(profAA.isDefault, false);
      assert.deepStrictEqual(profBA.isDefault, false);
      assert.deepStrictEqual(profBB.isDefault, false);
      const changeA = Event.toPromise(profAA.onDidChangeDefault);
      const changeBA = Event.toPromise(profBA.onDidChangeDefault);
      const changeBB = Event.toPromise(profBB.onDidChangeDefault);
      ds.add(profAB.onDidChangeDefault(neverCalled));
      assert.strictEqual(neverCalled.called, false);
      ctrl.$setDefaultRunProfiles({
        a: [ctrl.getProfileInternalId(ctrlA, profAA)],
        b: [ctrl.getProfileInternalId(ctrlB, profBA), ctrl.getProfileInternalId(ctrlB, profBB)]
      });
      assert.deepStrictEqual(await changeA, true);
      assert.deepStrictEqual(await changeBA, true);
      assert.deepStrictEqual(await changeBB, true);
      assert.deepStrictEqual(profAA.isDefault, true);
      assert.deepStrictEqual(profBA.isDefault, true);
      assert.deepStrictEqual(profBB.isDefault, true);
      assert.deepStrictEqual(profAB.isDefault, false);
      ds.add(profAA.onDidChangeDefault(neverCalled));
      ctrl.$setDefaultRunProfiles({
        a: [ctrl.getProfileInternalId(ctrlA, profAA)]
      });
      assert.strictEqual(neverCalled.called, false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdFRlc3RpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIG1vY2tPYmplY3QsIE1vY2tPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgKiBhcyBlZGl0b3JSYW5nZSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXN0aW5nU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRlc3RpbmcsIFRlc3RSdW5Db29yZGluYXRvciwgVGVzdFJ1bkR0bywgVGVzdFJ1blByb2ZpbGVJbXBsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZXN0aW5nLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24sIFRlc3RJdGVtSW1wbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVzdEl0ZW0uanMnO1xuaW1wb3J0ICogYXMgY29udmVydCBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IExvY2F0aW9uLCBQb3NpdGlvbiwgUmFuZ2UsIFRlc3RNZXNzYWdlLCBUZXN0UnVuUHJvZmlsZUtpbmQsIFRlc3RSdW5SZXF1ZXN0IGFzIFRlc3RSdW5SZXF1ZXN0SW1wbCwgVGVzdFRhZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgQW55Q2FsbFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBUZXN0RGlmZk9wVHlwZSwgVGVzdEl0ZW1FeHBhbmRTdGF0ZSwgVGVzdE1lc3NhZ2VUeXBlLCBUZXN0c0RpZmYgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgVGVzdENvbnRyb2xsZXIsIFRlc3RJdGVtLCBUZXN0UnVuUHJvZmlsZSwgVGVzdFJ1blJlcXVlc3QgfSBmcm9tICd2c2NvZGUnO1xuXG5jb25zdCBzaW1wbGlmeSA9IChpdGVtOiBUZXN0SXRlbSkgPT4gKHtcblx0aWQ6IGl0ZW0uaWQsXG5cdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHR1cmk6IGl0ZW0udXJpLFxuXHRyYW5nZTogaXRlbS5yYW5nZSxcbn0pO1xuXG5jb25zdCBhc3NlcnRUcmVlc0VxdWFsID0gKGE6IFRlc3RJdGVtSW1wbCB8IHVuZGVmaW5lZCwgYjogVGVzdEl0ZW1JbXBsIHwgdW5kZWZpbmVkKSA9PiB7XG5cdGlmICghYSkge1xuXHRcdHRocm93IG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiAnRXhwZWN0ZWQgYSB0byBiZSBkZWZpbmVkJywgYWN0dWFsOiBhIH0pO1xuXHR9XG5cblx0aWYgKCFiKSB7XG5cdFx0dGhyb3cgbmV3IGFzc2VydC5Bc3NlcnRpb25FcnJvcih7IG1lc3NhZ2U6ICdFeHBlY3RlZCBiIHRvIGJlIGRlZmluZWQnLCBhY3R1YWw6IGIgfSk7XG5cdH1cblxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbXBsaWZ5KGEpLCBzaW1wbGlmeShiKSk7XG5cblx0Y29uc3QgYUNoaWxkcmVuID0gWy4uLmEuY2hpbGRyZW5dLm1hcCgoW18sIGNdKSA9PiBjLmlkKS5zb3J0KCk7XG5cdGNvbnN0IGJDaGlsZHJlbiA9IFsuLi5iLmNoaWxkcmVuXS5tYXAoKFtfLCBjXSkgPT4gYy5pZCkuc29ydCgpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYUNoaWxkcmVuLmxlbmd0aCwgYkNoaWxkcmVuLmxlbmd0aCwgYGV4cGVjdGVkICR7YS5sYWJlbH0uY2hpbGRyZW4ubGVuZ3RoID09ICR7Yi5sYWJlbH0uY2hpbGRyZW4ubGVuZ3RoYCk7XG5cdGFDaGlsZHJlbi5mb3JFYWNoKGtleSA9PiBhc3NlcnRUcmVlc0VxdWFsKGEuY2hpbGRyZW4uZ2V0KGtleSkgYXMgVGVzdEl0ZW1JbXBsLCBiLmNoaWxkcmVuLmdldChrZXkpIGFzIFRlc3RJdGVtSW1wbCkpO1xufTtcblxuLy8gY29uc3QgYXNzZXJ0VHJlZUxpc3RFcXVhbCA9IChhOiBSZWFkb25seUFycmF5PFRlc3RJdGVtPiwgYjogUmVhZG9ubHlBcnJheTxUZXN0SXRlbT4pID0+IHtcbi8vIFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGVuZ3RoLCBiLmxlbmd0aCwgYGV4cGVjdGVkIGEubGVuZ3RoID09IG4ubGVuZ3RoYCk7XG4vLyBcdGEuZm9yRWFjaCgoXywgaSkgPT4gYXNzZXJ0VHJlZXNFcXVhbChhW2ldLCBiW2ldKSk7XG4vLyB9O1xuXG4vLyBjbGFzcyBUZXN0TWlycm9yZWRDb2xsZWN0aW9uIGV4dGVuZHMgTWlycm9yZWRUZXN0Q29sbGVjdGlvbiB7XG4vLyBcdHB1YmxpYyBjaGFuZ2VFdmVudCE6IFRlc3RDaGFuZ2VFdmVudDtcblxuLy8gXHRjb25zdHJ1Y3RvcigpIHtcbi8vIFx0XHRzdXBlcigpO1xuLy8gXHRcdHRoaXMub25EaWRDaGFuZ2VUZXN0cyhldnQgPT4gdGhpcy5jaGFuZ2VFdmVudCA9IGV2dCk7XG4vLyBcdH1cblxuLy8gXHRwdWJsaWMgZ2V0IGxlbmd0aCgpIHtcbi8vIFx0XHRyZXR1cm4gdGhpcy5pdGVtcy5zaXplO1xuLy8gXHR9XG4vLyB9XG5cbnN1aXRlKCdFeHRIb3N0IFRlc3RpbmcnLCAoKSA9PiB7XG5cdGNsYXNzIFRlc3RFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uIGV4dGVuZHMgRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbiB7XG5cdFx0cHVibGljIHNldERpZmYoZGlmZjogVGVzdHNEaWZmKSB7XG5cdFx0XHR0aGlzLmRpZmYgPSBkaWZmO1xuXHRcdH1cblx0fVxuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHNpbmdsZTogVGVzdEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb247XG5cdGxldCByZXNvbHZlQ2FsbHM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0c2V0dXAoKCkgPT4ge1xuXHRcdHJlc29sdmVDYWxscyA9IFtdO1xuXHRcdHNpbmdsZSA9IGRzLmFkZChuZXcgVGVzdEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24oJ2N0cmxJZCcsICdyb290Jywge1xuXHRcdFx0Z2V0RG9jdW1lbnQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIFBhcnRpYWw8RXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM+IGFzIEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKSk7XG5cdFx0c2luZ2xlLnJlc29sdmVIYW5kbGVyID0gaXRlbSA9PiB7XG5cdFx0XHRyZXNvbHZlQ2FsbHMucHVzaChpdGVtPy5pZCk7XG5cdFx0XHRpZiAoaXRlbSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYScsICdhJywgVVJJLmZpbGUoJy8nKSk7XG5cdFx0XHRcdGEuY2FuUmVzb2x2ZUNoaWxkcmVuID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgYiA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1iJywgJ2InLCBVUkkuZmlsZSgnLycpKTtcblx0XHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4uYWRkKGEpO1xuXHRcdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5hZGQoYik7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0uaWQgPT09ICdpZC1hJykge1xuXHRcdFx0XHRpdGVtLmNoaWxkcmVuLmFkZChuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYWEnLCAnYWEnLCBVUkkuZmlsZSgnLycpKSk7XG5cdFx0XHRcdGl0ZW0uY2hpbGRyZW4uYWRkKG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1hYicsICdhYicsIFVSSS5maWxlKCcvJykpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZHMuYWRkKHNpbmdsZS5vbkRpZEdlbmVyYXRlRGlmZihkID0+IHNpbmdsZS5zZXREaWZmKGQgLyogZG9uJ3QgY2xlYXIgZHVyaW5nIHRlc3RpbmcgKi8pKSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdPd25lZFRlc3RDb2xsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FkZHMgYSByb290IHJlY3Vyc2l2ZWx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0Y29uc3QgYSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIGFzIFRlc3RJdGVtSW1wbDtcblx0XHRcdGNvbnN0IGIgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKSBhcyBUZXN0SXRlbUltcGw7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmcsIGl0ZW06IHsgLi4uY29udmVydC5UZXN0SXRlbS5mcm9tKHNpbmdsZS5yb290KSB9IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdFx0aXRlbTogeyBjb250cm9sbGVySWQ6ICdjdHJsSWQnLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZywgaXRlbTogeyAuLi5jb252ZXJ0LlRlc3RJdGVtLmZyb20oYSkgfSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShhLmNoaWxkcmVuLmdldCgnaWQtYWEnKSBhcyBUZXN0SXRlbUltcGwpIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdFx0aXRlbTogeyBjb250cm9sbGVySWQ6ICdjdHJsSWQnLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSwgaXRlbTogY29udmVydC5UZXN0SXRlbS5mcm9tKGEuY2hpbGRyZW4uZ2V0KCdpZC1hYicpIGFzIFRlc3RJdGVtSW1wbCkgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSwgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGVkIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdFx0aXRlbTogeyBjb250cm9sbGVySWQ6ICdjdHJsSWQnLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSwgaXRlbTogY29udmVydC5UZXN0SXRlbS5mcm9tKGIpIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGUsXG5cdFx0XHRcdFx0aXRlbTogeyBleHRJZDogc2luZ2xlLnJvb3QuaWQsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5FeHBhbmRlZCB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcmVudHMgYXJlIHNldCBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblxuXHRcdFx0Y29uc3QgYSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpITtcblx0XHRcdGNvbnN0IGFiID0gYS5jaGlsZHJlbi5nZXQoJ2lkLWFiJykhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEucGFyZW50LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFiLnBhcmVudCwgYSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW4gYWRkIGFuIGl0ZW0gd2l0aCBzYW1lIElEIGFzIHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnY3RybElkJywgJ2MnLCB1bmRlZmluZWQpO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4uYWRkKGNoaWxkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdFx0aXRlbTogeyBjb250cm9sbGVySWQ6ICdjdHJsSWQnLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSwgaXRlbTogY29udmVydC5UZXN0SXRlbS5mcm9tKGNoaWxkKSB9LFxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vLW9wcyBpZiBpdGVtcyBub3QgY2hhbmdlZCcsICgpID0+IHtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2F0Y2hlcyBwcm9wZXJ0eSBtdXRhdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5kZXNjcmlwdGlvbiA9ICdIZWxsbyB3b3JsZCc7IC8qIGl0ZW0gYSAqL1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYSddKS50b1N0cmluZygpLCBpdGVtOiB7IGRlc2NyaXB0aW9uOiAnSGVsbG8gd29ybGQnIH0gfSxcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5kZWxldGUoJ2lkLWEnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmUsIGl0ZW1JZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJ10pLnRvU3RyaW5nKCkgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Wy4uLnNpbmdsZS50cmVlLmtleXMoKV0uc29ydCgpLFxuXHRcdFx0XHRbc2luZ2xlLnJvb3QuaWQsIG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYiddKS50b1N0cmluZygpXSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2luZ2xlLnRyZWUuc2l6ZSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIG5ldyBjaGlsZHJlbicsICgpID0+IHtcblx0XHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYWMnLCAnYycsIHVuZGVmaW5lZCk7XG5cdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEuY2hpbGRyZW4uYWRkKGNoaWxkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCwgaXRlbToge1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcklkOiAnY3RybElkJyxcblx0XHRcdFx0XHRcdGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLFxuXHRcdFx0XHRcdFx0aXRlbTogY29udmVydC5UZXN0SXRlbS5mcm9tKGNoaWxkKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFsuLi5zaW5nbGUudHJlZS52YWx1ZXMoKV0ubWFwKG4gPT4gbi5hY3R1YWwuaWQpLnNvcnQoKSxcblx0XHRcdFx0W3NpbmdsZS5yb290LmlkLCAnaWQtYScsICdpZC1hYScsICdpZC1hYicsICdpZC1hYycsICdpZC1iJ10sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpbmdsZS50cmVlLnNpemUsIDYpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlcyB0YWdzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXHRcdFx0Y29uc3QgdGFnMSA9IG5ldyBUZXN0VGFnKCd0YWcxJyk7XG5cdFx0XHRjb25zdCB0YWcyID0gbmV3IFRlc3RUYWcoJ3RhZzInKTtcblx0XHRcdGNvbnN0IHRhZzMgPSBuZXcgVGVzdFRhZygndGFnMycpO1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYWMnLCAnYycsIHVuZGVmaW5lZCk7XG5cdFx0XHRjaGlsZC50YWdzID0gW3RhZzEsIHRhZzJdO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmFkZChjaGlsZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0eyBvcDogVGVzdERpZmZPcFR5cGUuQWRkVGFnLCB0YWc6IHsgaWQ6ICdjdHJsSWRcXDB0YWcxJyB9IH0sXG5cdFx0XHRcdHsgb3A6IFRlc3REaWZmT3BUeXBlLkFkZFRhZywgdGFnOiB7IGlkOiAnY3RybElkXFwwdGFnMicgfSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCwgaXRlbToge1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcklkOiAnY3RybElkJyxcblx0XHRcdFx0XHRcdGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLFxuXHRcdFx0XHRcdFx0aXRlbTogY29udmVydC5UZXN0SXRlbS5mcm9tKGNoaWxkKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y2hpbGQudGFncyA9IFt0YWcyLCB0YWczXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0eyBvcDogVGVzdERpZmZPcFR5cGUuQWRkVGFnLCB0YWc6IHsgaWQ6ICdjdHJsSWRcXDB0YWczJyB9IH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLCBpdGVtOiB7XG5cdFx0XHRcdFx0XHRleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJywgJ2lkLWFjJ10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRpdGVtOiB7IHRhZ3M6IFsnY3RybElkXFwwdGFnMicsICdjdHJsSWRcXDB0YWczJ10gfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0eyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlVGFnLCBpZDogJ2N0cmxJZFxcMHRhZzEnIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpITtcblx0XHRcdGEudGFncyA9IFt0YWcyXTtcblx0XHRcdGEuY2hpbGRyZW4ucmVwbGFjZShbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLmZpbHRlcih0ID0+IHQub3AgPT09IFRlc3REaWZmT3BUeXBlLlJlbW92ZVRhZyksIFtcblx0XHRcdFx0eyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlVGFnLCBpZDogJ2N0cmxJZFxcMHRhZzMnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcGxhY2VzIG9uIHVyaSBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblxuXHRcdFx0Y29uc3Qgb2xkQSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIGFzIFRlc3RJdGVtSW1wbDtcblx0XHRcdGNvbnN0IHVyaSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS51cmk/LndpdGgoeyBwYXRoOiAnL2RpZmZlcmVudCcgfSk7XG5cdFx0XHRjb25zdCBuZXdBID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWEnLCAnSGVsbG8gd29ybGQnLCB1cmkpO1xuXHRcdFx0bmV3QS5jaGlsZHJlbi5yZXBsYWNlKFsuLi5vbGRBLmNoaWxkcmVuXS5tYXAoKFtfLCBpdGVtXSkgPT4gaXRlbSkpO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4ucmVwbGFjZShbLi4uc2luZ2xlLnJvb3QuY2hpbGRyZW5dLm1hcCgoW2lkLCBpXSkgPT4gaWQgPT09ICdpZC1hJyA/IG5ld0EgOiBpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0eyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlLCBpdGVtSWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYSddKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IHsgLi4uY29udmVydC5UZXN0SXRlbS5mcm9tKG5ld0EpIH0gfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCBpdGVtOiBjb252ZXJ0LlRlc3RJdGVtLmZyb20obmV3QS5jaGlsZHJlbi5nZXQoJ2lkLWFhJykgYXMgVGVzdEl0ZW1JbXBsKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShuZXdBLmNoaWxkcmVuLmdldCgnaWQtYWInKSBhcyBUZXN0SXRlbUltcGwpIH1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJlYXRzIGluLXBsYWNlIHJlcGxhY2VtZW50IGFzIG11dGF0aW9uJywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cblx0XHRcdGNvbnN0IG9sZEEgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSBhcyBUZXN0SXRlbUltcGw7XG5cdFx0XHRjb25zdCB1cmkgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEudXJpO1xuXHRcdFx0Y29uc3QgbmV3QSA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1hJywgJ0hlbGxvIHdvcmxkJywgdXJpKTtcblx0XHRcdG5ld0EuY2hpbGRyZW4ucmVwbGFjZShbLi4ub2xkQS5jaGlsZHJlbl0ubWFwKChbXywgaXRlbV0pID0+IGl0ZW0pKTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLnJlcGxhY2UoW1xuXHRcdFx0XHRuZXdBLFxuXHRcdFx0XHRuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYicsIHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYicpIS5sYWJlbCwgdXJpKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYSddKS50b1N0cmluZygpLCBpdGVtOiB7IGxhYmVsOiAnSGVsbG8gd29ybGQnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCxcblx0XHRcdFx0XHRkb2N2OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiB1cmlcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdG5ld0EubGFiZWwgPSAnc3RpbGwgY29ubmVjdGVkJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGUsXG5cdFx0XHRcdFx0aXRlbTogeyBleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJ10pLnRvU3RyaW5nKCksIGl0ZW06IHsgbGFiZWw6ICdzdGlsbCBjb25uZWN0ZWQnIH0gfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdG9sZEEubGFiZWwgPSAnbm8gbG9uZ2VyIGNvbm5lY3RlZCc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZXhwYW5kaWJpbGl0eSByZXN0b3JhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRvUmVwbGFjZSA9IGFzeW5jIChjYW5SZXNvbHZlQ2hpbGRyZW4gPSB0cnVlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS51cmk7XG5cdFx0XHRcdGNvbnN0IG5ld0EgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYScsICdIZWxsbyB3b3JsZCcsIHVyaSk7XG5cdFx0XHRcdG5ld0EuY2FuUmVzb2x2ZUNoaWxkcmVuID0gY2FuUmVzb2x2ZUNoaWxkcmVuO1xuXHRcdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5yZXBsYWNlKFtcblx0XHRcdFx0XHRuZXdBLFxuXHRcdFx0XHRcdG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1iJywgc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1iJykhLmxhYmVsLCB1cmkpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gZHJhaW4gbWljcm90YXNrc1xuXHRcdFx0fTtcblxuXHRcdFx0dGVzdCgnZG9lcyBub3QgcmVzdG9yZSBhbiB1bmV4cGFuZGVkIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlQ2FsbHMsIFt1bmRlZmluZWRdKTtcblx0XHRcdFx0YXdhaXQgZG9SZXBsYWNlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxzLCBbdW5kZWZpbmVkXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVzdG9yZXMgcmVzb2x2ZSBzdGF0ZSBvbiByZXBsYWNlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVDYWxscywgW3VuZGVmaW5lZCwgJ2lkLWEnXSk7XG5cdFx0XHRcdGF3YWl0IGRvUmVwbGFjZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVDYWxscywgW3VuZGVmaW5lZCwgJ2lkLWEnLCAnaWQtYSddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdkb2VzIG5vdCBleHBhbmQgaWYgbmV3IGNoaWxkIGlzIG5vdCBleHBhbmRhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxzLCBbdW5kZWZpbmVkLCAnaWQtYSddKTtcblx0XHRcdFx0YXdhaXQgZG9SZXBsYWNlKGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlQ2FsbHMsIFt1bmRlZmluZWQsICdpZC1hJ10pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmVhdHMgaW4tcGxhY2UgcmVwbGFjZW1lbnQgYXMgbXV0YXRpb24gZGVlcGx5JywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cblx0XHRcdGNvbnN0IG9sZEEgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSE7XG5cdFx0XHRjb25zdCB1cmkgPSBvbGRBLnVyaTtcblx0XHRcdGNvbnN0IG5ld0EgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYScsIHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5sYWJlbCwgdXJpKTtcblx0XHRcdGNvbnN0IG9sZEFBID0gb2xkQS5jaGlsZHJlbi5nZXQoJ2lkLWFhJykhO1xuXHRcdFx0Y29uc3Qgb2xkQUIgPSBvbGRBLmNoaWxkcmVuLmdldCgnaWQtYWInKSE7XG5cdFx0XHRjb25zdCBuZXdBQiA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1hYicsICdIZWxsbyB3b3JsZCcsIHVyaSk7XG5cdFx0XHRuZXdBLmNoaWxkcmVuLnJlcGxhY2UoW29sZEFBLCBuZXdBQl0pO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4ucmVwbGFjZShbbmV3QSwgc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1iJykhXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGUsXG5cdFx0XHRcdFx0aXRlbTogeyBleHRJZDogVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0ob2xkQUIsICdjdHJsSWQnKS50b1N0cmluZygpLCBpdGVtOiB7IGxhYmVsOiAnSGVsbG8gd29ybGQnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCxcblx0XHRcdFx0XHRkb2N2OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiB1cmlcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdG9sZEFBLmxhYmVsID0gJ3N0aWxsIGNvbm5lY3RlZDEnO1xuXHRcdFx0bmV3QUIubGFiZWwgPSAnc3RpbGwgY29ubmVjdGVkMic7XG5cdFx0XHRvbGRBQi5sYWJlbCA9ICdub3QgY29ubmVjdGVkMyc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYScsICdpZC1hYSddKS50b1N0cmluZygpLCBpdGVtOiB7IGxhYmVsOiAnc3RpbGwgY29ubmVjdGVkMScgfSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYScsICdpZC1hYiddKS50b1N0cmluZygpLCBpdGVtOiB7IGxhYmVsOiAnc3RpbGwgY29ubmVjdGVkMicgfSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0FCLnBhcmVudCwgbmV3QSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2xkQUEucGFyZW50LCBuZXdBKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3QS5wYXJlbnQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3ZlcyBhbiBpdGVtIHRvIGJlIGEgbmV3IGNoaWxkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgMCk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblx0XHRcdGNvbnN0IGIgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKSBhcyBUZXN0SXRlbUltcGw7XG5cdFx0XHRjb25zdCBhID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykgYXMgVGVzdEl0ZW1JbXBsO1xuXHRcdFx0YS5jaGlsZHJlbi5hZGQoYik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlLFxuXHRcdFx0XHRcdGl0ZW1JZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1iJ10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShiKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Yi5sYWJlbCA9ICdzdGlsbCBjb25uZWN0ZWQnO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnLCAnaWQtYiddKS50b1N0cmluZygpLCBpdGVtOiB7IGxhYmVsOiAnc3RpbGwgY29ubmVjdGVkJyB9IH1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zaW5nbGUucm9vdC5jaGlsZHJlbl0ubWFwKChbXywgaXRlbV0pID0+IGl0ZW0pLCBbc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJyldKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYi5wYXJlbnQsIGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZHMgZG9jdW1lbnQgc3luYyBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCAwKTtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXG5cdFx0XHRjb25zdCBhID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykgYXMgVGVzdEl0ZW1JbXBsO1xuXHRcdFx0YS5yYW5nZSA9IG5ldyBSYW5nZShuZXcgUG9zaXRpb24oMCwgMCksIG5ldyBQb3NpdGlvbigxLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCxcblx0XHRcdFx0XHRkb2N2OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnLycpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRcdGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IGVkaXRvclJhbmdlLlJhbmdlLmxpZnQoe1xuXHRcdFx0XHRcdFx0XHRcdGVuZENvbHVtbjogMSxcblx0XHRcdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAyLFxuXHRcdFx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMVxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gc2VuZHMgb24gcmVwbGFjZSBldmVuIGlmIGl0J3MgYSBuby1vcFxuXHRcdFx0YS5yYW5nZSA9IGEucmFuZ2U7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQsXG5cdFx0XHRcdFx0ZG9jdjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy8nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHNlbmRzIG9uIGEgY2hpbGQgcmVwbGFjZW1lbnRcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvJyk7XG5cdFx0XHRjb25zdCBhMiA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1hJywgJ2EnLCB1cmkpO1xuXHRcdFx0YTIucmFuZ2UgPSBhLnJhbmdlO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4ucmVwbGFjZShbYTIsIHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYicpIV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkRvY3VtZW50U3luY2VkLFxuXHRcdFx0XHRcdGRvY3Y6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmlcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHN1aXRlKCdNaXJyb3JlZFRlc3RDb2xsZWN0aW9uJywgKCkgPT4ge1xuXHRcdC8vIHRvZG9AY29ubm9yNDMxMjogcmUtcmVuYWJsZSB3aGVuIHdlIGZpZ3VyZSBvdXQgd2hhdCBvYnNlcnZpbmcgbG9va3MgbGlrZSB3ZSBhc3luYyBjaGlsZHJlblxuXHRcdC8vIFx0bGV0IG06IFRlc3RNaXJyb3JlZENvbGxlY3Rpb247XG5cdFx0Ly8gXHRzZXR1cCgoKSA9PiBtID0gbmV3IFRlc3RNaXJyb3JlZENvbGxlY3Rpb24oKSk7XG5cblx0XHQvLyBcdHRlc3QoJ21pcnJvcnMgY3JlYXRpb24gb2YgdGhlIHJvb3QnLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdGNvbnN0IHRlc3RzID0gdGVzdFN0dWJzLm5lc3RlZCgpO1xuXHRcdC8vIFx0XHRzaW5nbGUuYWRkUm9vdCh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0Ly8gXHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXHRcdC8vIFx0XHRhc3NlcnRUcmVlc0VxdWFsKG0ucm9vdFRlc3RJdGVtc1swXSwgb3duZWQuZ2V0VGVzdEJ5SWQoc2luZ2xlLnJvb3QuaWQpIVsxXS5hY3R1YWwpO1xuXHRcdC8vIFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5sZW5ndGgsIHNpbmdsZS5pdGVtVG9JbnRlcm5hbC5zaXplKTtcblx0XHQvLyBcdH0pO1xuXG5cdFx0Ly8gXHR0ZXN0KCdtaXJyb3JzIG5vZGUgZGVsZXRpb24nLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdGNvbnN0IHRlc3RzID0gdGVzdFN0dWJzLm5lc3RlZCgpO1xuXHRcdC8vIFx0XHRzaW5nbGUuYWRkUm9vdCh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblx0XHQvLyBcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdC8vIFx0XHR0ZXN0cy5jaGlsZHJlbiEuc3BsaWNlKDAsIDEpO1xuXHRcdC8vIFx0XHRzaW5nbGUub25JdGVtQ2hhbmdlKHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHQvLyBcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cblx0XHQvLyBcdFx0YXNzZXJ0VHJlZXNFcXVhbChtLnJvb3RUZXN0SXRlbXNbMF0sIG93bmVkLmdldFRlc3RCeUlkKHNpbmdsZS5yb290LmlkKSFbMV0uYWN0dWFsKTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0ubGVuZ3RoLCBzaW5nbGUuaXRlbVRvSW50ZXJuYWwuc2l6ZSk7XG5cdFx0Ly8gXHR9KTtcblxuXHRcdC8vIFx0dGVzdCgnbWlycm9ycyBub2RlIGFkZGl0aW9uJywgKCkgPT4ge1xuXHRcdC8vIFx0XHRjb25zdCB0ZXN0cyA9IHRlc3RTdHVicy5uZXN0ZWQoKTtcblx0XHQvLyBcdFx0c2luZ2xlLmFkZFJvb3QodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cdFx0Ly8gXHRcdHRlc3RzLmNoaWxkcmVuIVswXS5jaGlsZHJlbiEucHVzaChzdHViVGVzdCgnYWMnKSk7XG5cdFx0Ly8gXHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cblx0XHQvLyBcdFx0YXNzZXJ0VHJlZXNFcXVhbChtLnJvb3RUZXN0SXRlbXNbMF0sIG93bmVkLmdldFRlc3RCeUlkKHNpbmdsZS5yb290LmlkKSFbMV0uYWN0dWFsKTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0ubGVuZ3RoLCBzaW5nbGUuaXRlbVRvSW50ZXJuYWwuc2l6ZSk7XG5cdFx0Ly8gXHR9KTtcblxuXHRcdC8vIFx0dGVzdCgnbWlycm9ycyBub2RlIHVwZGF0ZScsICgpID0+IHtcblx0XHQvLyBcdFx0Y29uc3QgdGVzdHMgPSB0ZXN0U3R1YnMubmVzdGVkKCk7XG5cdFx0Ly8gXHRcdHNpbmdsZS5hZGRSb290KHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXHRcdC8vIFx0XHR0ZXN0cy5jaGlsZHJlbiFbMF0uZGVzY3JpcHRpb24gPSAnSGVsbG8gd29ybGQnOyAvKiBpdGVtIGEgKi9cblx0XHQvLyBcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblxuXHRcdC8vIFx0XHRhc3NlcnRUcmVlc0VxdWFsKG0ucm9vdFRlc3RJdGVtc1swXSwgb3duZWQuZ2V0VGVzdEJ5SWQoc2luZ2xlLnJvb3QuaWQpIVsxXS5hY3R1YWwpO1xuXHRcdC8vIFx0fSk7XG5cblx0XHQvLyBcdHN1aXRlKCdNaXJyb3JlZENoYW5nZUNvbGxlY3RvcicsICgpID0+IHtcblx0XHQvLyBcdFx0bGV0IHRlc3RzID0gdGVzdFN0dWJzLm5lc3RlZCgpO1xuXHRcdC8vIFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0Ly8gXHRcdFx0dGVzdHMgPSB0ZXN0U3R1YnMubmVzdGVkKCk7XG5cdFx0Ly8gXHRcdFx0c2luZ2xlLmFkZFJvb3QodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblx0XHQvLyBcdFx0fSk7XG5cblx0XHQvLyBcdFx0dGVzdCgnY3JlYXRlcyBjaGFuZ2UgZm9yIHJvb3QnLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LmFkZGVkLCBbXG5cdFx0Ly8gXHRcdFx0XHR0ZXN0cyxcblx0XHQvLyBcdFx0XHRcdHRlc3RzLmNoaWxkcmVuWzBdLFxuXHRcdC8vIFx0XHRcdFx0dGVzdHMuY2hpbGRyZW4hWzBdLmNoaWxkcmVuIVswXSxcblx0XHQvLyBcdFx0XHRcdHRlc3RzLmNoaWxkcmVuIVswXS5jaGlsZHJlbiFbMV0sXG5cdFx0Ly8gXHRcdFx0XHR0ZXN0cy5jaGlsZHJlblsxXSxcblx0XHQvLyBcdFx0XHRdKTtcblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQucmVtb3ZlZCwgW10pO1xuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC51cGRhdGVkLCBbXSk7XG5cdFx0Ly8gXHRcdH0pO1xuXG5cdFx0Ly8gXHRcdHRlc3QoJ2NyZWF0ZXMgY2hhbmdlIGZvciBkZWxldGUnLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdFx0Y29uc3Qgcm0gPSB0ZXN0cy5jaGlsZHJlbi5zaGlmdCgpITtcblx0XHQvLyBcdFx0XHRzaW5nbGUub25JdGVtQ2hhbmdlKHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQuYWRkZWQsIFtdKTtcblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQucmVtb3ZlZCwgW1xuXHRcdC8vIFx0XHRcdFx0eyAuLi5ybSB9LFxuXHRcdC8vIFx0XHRcdFx0eyAuLi5ybS5jaGlsZHJlbiFbMF0gfSxcblx0XHQvLyBcdFx0XHRcdHsgLi4ucm0uY2hpbGRyZW4hWzFdIH0sXG5cdFx0Ly8gXHRcdFx0XSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnVwZGF0ZWQsIFtdKTtcblx0XHQvLyBcdFx0fSk7XG5cblx0XHQvLyBcdFx0dGVzdCgnY3JlYXRlcyBjaGFuZ2UgZm9yIHVwZGF0ZScsICgpID0+IHtcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlblswXS5sYWJlbCA9ICd1cGRhdGVkISc7XG5cdFx0Ly8gXHRcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LmFkZGVkLCBbXSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnJlbW92ZWQsIFtdKTtcblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQudXBkYXRlZCwgW3Rlc3RzLmNoaWxkcmVuWzBdXSk7XG5cdFx0Ly8gXHRcdH0pO1xuXG5cdFx0Ly8gXHRcdHRlc3QoJ2lzIGEgbm8tb3AgaWYgYSBub2RlIGlzIGFkZGVkIGFuZCByZW1vdmVkJywgKCkgPT4ge1xuXHRcdC8vIFx0XHRcdGNvbnN0IG5lc3RlZCA9IHRlc3RTdHVicy5uZXN0ZWQoJ2lkMi0nKTtcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlbi5wdXNoKG5lc3RlZCk7XG5cdFx0Ly8gXHRcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRcdHRlc3RzLmNoaWxkcmVuLnBvcCgpO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRjb25zdCBwcmV2aW91c0V2ZW50ID0gbS5jaGFuZ2VFdmVudDtcblx0XHQvLyBcdFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblx0XHQvLyBcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5jaGFuZ2VFdmVudCwgcHJldmlvdXNFdmVudCk7XG5cdFx0Ly8gXHRcdH0pO1xuXG5cdFx0Ly8gXHRcdHRlc3QoJ2lzIGEgc2luZ2xlLW9wIGlmIGEgbm9kZSBpcyBhZGRlZCBhbmQgY2hhbmdlZCcsICgpID0+IHtcblx0XHQvLyBcdFx0XHRjb25zdCBjaGlsZCA9IHN0dWJUZXN0KCdjJyk7XG5cdFx0Ly8gXHRcdFx0dGVzdHMuY2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0Ly8gXHRcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRcdGNoaWxkLmxhYmVsID0gJ2QnO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblxuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC5hZGRlZCwgW2NoaWxkXSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnJlbW92ZWQsIFtdKTtcblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQudXBkYXRlZCwgW10pO1xuXHRcdC8vIFx0XHR9KTtcblxuXHRcdC8vIFx0XHR0ZXN0KCdnZXRzIHRoZSBjb21tb24gYW5jZXN0b3IgKDEpJywgKCkgPT4ge1xuXHRcdC8vIFx0XHRcdHRlc3RzLmNoaWxkcmVuIVswXS5jaGlsZHJlbiFbMF0ubGFiZWwgPSAnemEnO1xuXHRcdC8vIFx0XHRcdHRlc3RzLmNoaWxkcmVuIVswXS5jaGlsZHJlbiFbMV0ubGFiZWwgPSAnemInO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblxuXHRcdC8vIFx0XHR9KTtcblxuXHRcdC8vIFx0XHR0ZXN0KCdnZXRzIHRoZSBjb21tb24gYW5jZXN0b3IgKDIpJywgKCkgPT4ge1xuXHRcdC8vIFx0XHRcdHRlc3RzLmNoaWxkcmVuIVswXS5jaGlsZHJlbiFbMF0ubGFiZWwgPSAnemEnO1xuXHRcdC8vIFx0XHRcdHRlc3RzLmNoaWxkcmVuIVsxXS5sYWJlbCA9ICdhYic7XG5cdFx0Ly8gXHRcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXHRcdC8vIFx0XHR9KTtcblx0XHQvLyBcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGVzdFJ1blRyYWNrZXInLCAoKSA9PiB7XG5cdFx0bGV0IHByb3h5OiBNb2NrT2JqZWN0PE1haW5UaHJlYWRUZXN0aW5nU2hhcGU+O1xuXHRcdGxldCBjOiBUZXN0UnVuQ29vcmRpbmF0b3I7XG5cdFx0bGV0IGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdFx0bGV0IGNvbmZpZ3VyYXRpb246IFRlc3RSdW5Qcm9maWxlSW1wbDtcblxuXHRcdGxldCByZXE6IFRlc3RSdW5SZXF1ZXN0O1xuXG5cdFx0bGV0IGR0bzogVGVzdFJ1bkR0bztcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBleHQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbiA9IHt9IGFzIGFueTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgeyBpZCB9IG9mIGMudHJhY2tlcnMpIHtcblx0XHRcdFx0Yy5kaXNwb3NlVGVzdFJ1bihpZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm94eSA9IG1vY2tPYmplY3Q8TWFpblRocmVhZFRlc3RpbmdTaGFwZT4oKSgpO1xuXHRcdFx0Y3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRjID0gbmV3IFRlc3RSdW5Db29yZGluYXRvcihwcm94eSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25maWd1cmF0aW9uID0gbmV3IFRlc3RSdW5Qcm9maWxlSW1wbChtb2NrT2JqZWN0PE1haW5UaHJlYWRUZXN0aW5nU2hhcGU+KCkoKSwgbmV3IE1hcCgpLCBuZXcgU2V0KCksIEV2ZW50Lk5vbmUsICdjdHJsSWQnLCA0MiwgJ0RvIFJ1bicsIFRlc3RSdW5Qcm9maWxlS2luZC5SdW4sICgpID0+IHsgfSwgZmFsc2UpO1xuXG5cdFx0XHRhd2FpdCBzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblxuXHRcdFx0cmVxID0ge1xuXHRcdFx0XHRpbmNsdWRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGV4Y2x1ZGU6IFtzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKSFdLFxuXHRcdFx0XHRwcm9maWxlOiBjb25maWd1cmF0aW9uLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZSxcblx0XHRcdH07XG5cblx0XHRcdGR0byA9IFRlc3RSdW5EdG8uZnJvbUludGVybmFsKHtcblx0XHRcdFx0Y29udHJvbGxlcklkOiAnY3RybCcsXG5cdFx0XHRcdHByb2ZpbGVJZDogY29uZmlndXJhdGlvbi5wcm9maWxlSWQsXG5cdFx0XHRcdGV4Y2x1ZGVFeHRJZHM6IFsnaWQtYiddLFxuXHRcdFx0XHRydW5JZDogJ3J1bi1pZCcsXG5cdFx0XHRcdHRlc3RJZHM6IFtzaW5nbGUucm9vdC5pZF0sXG5cdFx0XHR9LCBzaW5nbGUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhY2tzIGEgcnVuIHN0YXJ0ZWQgZnJvbSBhIG1haW4gdGhyZWFkIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZHMuYWRkKGMucHJlcGFyZUZvck1haW5UaHJlYWRUZXN0UnVuKGV4dCwgcmVxLCBkdG8sIGNvbmZpZ3VyYXRpb24sIGN0cy50b2tlbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHRhc2sxID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmwnLCBzaW5nbGUsIHJlcSwgJ3J1bjEnLCB0cnVlKTtcblx0XHRcdGNvbnN0IHRhc2syID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmwnLCBzaW5nbGUsIHJlcSwgJ3J1bjInLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS4kc3RhcnRlZEV4dGVuc2lvblRlc3RSdW4uY2FsbGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXG5cdFx0XHR0YXNrMS5hcHBlbmRPdXRwdXQoJ2hlbGxvJyk7XG5cdFx0XHRjb25zdCB0YXNrSWQgPSBwcm94eS4kYXBwZW5kT3V0cHV0VG9SdW4uYXJnc1swXT8uWzFdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbWydydW4taWQnLCB0YXNrSWQsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkXV0sIHByb3h5LiRhcHBlbmRPdXRwdXRUb1J1bi5hcmdzKTtcblx0XHRcdHRhc2sxLmVuZCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuJGZpbmlzaGVkRXh0ZW5zaW9uVGVzdFJ1bi5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgdHJ1ZSk7XG5cblx0XHRcdHRhc2syLmVuZCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuJGZpbmlzaGVkRXh0ZW5zaW9uVGVzdFJ1bi5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncnVuIGNhbmNlbCBmb3JjZSBlbmRzIGFmdGVyIGEgdGltZW91dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdHJhY2tlciA9IGRzLmFkZChjLnByZXBhcmVGb3JNYWluVGhyZWFkVGVzdFJ1bihleHQsIHJlcSwgZHRvLCBjb25maWd1cmF0aW9uLCBjdHMudG9rZW4pKTtcblx0XHRcdFx0Y29uc3QgdGFzayA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdydW4xJywgdHJ1ZSk7XG5cdFx0XHRcdGNvbnN0IG9uRW5kZWQgPSBzaW5vbi5zdHViKCk7XG5cdFx0XHRcdGRzLmFkZCh0cmFja2VyLm9uRW5kKG9uRW5kZWQpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFzay50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXHRcdFx0XHR0cmFja2VyLmNhbmNlbCgpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXNrLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCB0cnVlKTtcblxuXHRcdFx0XHRjbG9jay50aWNrKDk5OTkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25FbmRlZC5jYWxsZWQsIGZhbHNlKTtcblxuXHRcdFx0XHRjbG9jay50aWNrKDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25FbmRlZC5jYWxsZWQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIGZhbHNlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3J1biBjYW5jZWwgZm9yY2UgZW5kcyBvbiBzZWNvbmQgY2FuY2VsbGF0aW9uIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZHMuYWRkKGMucHJlcGFyZUZvck1haW5UaHJlYWRUZXN0UnVuKGV4dCwgcmVxLCBkdG8sIGNvbmZpZ3VyYXRpb24sIGN0cy50b2tlbikpO1xuXHRcdFx0Y29uc3QgdGFzayA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdydW4xJywgdHJ1ZSk7XG5cdFx0XHRjb25zdCBvbkVuZGVkID0gc2lub24uc3R1YigpO1xuXHRcdFx0ZHMuYWRkKHRyYWNrZXIub25FbmQob25FbmRlZCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFzay50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCB0cnVlKTtcblx0XHRcdHRyYWNrZXIuY2FuY2VsKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXNrLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25FbmRlZC5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdHRyYWNrZXIuY2FuY2VsKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRW5kZWQuY2FsbGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYWNrcyBhIHJ1biBzdGFydGVkIGZyb20gYW4gZXh0ZW5zaW9uIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXNrMSA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdoZWxsbyB3b3JsZCcsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgdHJhY2tlciA9IEl0ZXJhYmxlLmZpcnN0KGMudHJhY2tlcnMpITtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3h5LiRzdGFydGVkRXh0ZW5zaW9uVGVzdFJ1bi5hcmdzLCBbXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0cHJvZmlsZTogeyBncm91cDogMiwgaWQ6IDQyIH0sXG5cdFx0XHRcdFx0Y29udHJvbGxlcklkOiAnY3RybCcsXG5cdFx0XHRcdFx0aWQ6IHRyYWNrZXIuaWQsXG5cdFx0XHRcdFx0aW5jbHVkZTogW3NpbmdsZS5yb290LmlkXSxcblx0XHRcdFx0XHRleGNsdWRlOiBbbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1iJ10pLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRcdHBlcnNpc3Q6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbnRpbnVvdXM6IGZhbHNlLFxuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlLFxuXHRcdFx0XHR9XVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHRhc2syID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmwnLCBzaW5nbGUsIHJlcSwgJ3J1bjInLCB0cnVlKTtcblx0XHRcdGNvbnN0IHRhc2szRGV0YWNoZWQgPSBjLmNyZWF0ZVRlc3RSdW4oZXh0LCAnY3RybCcsIHNpbmdsZSwgeyAuLi5yZXEgfSwgJ3Rhc2szRGV0YWNoZWQnLCB0cnVlKTtcblxuXHRcdFx0dGFzazEuZW5kKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuJGZpbmlzaGVkRXh0ZW5zaW9uVGVzdFJ1bi5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgdHJ1ZSk7XG5cblx0XHRcdHRhc2syLmVuZCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kZmluaXNoZWRFeHRlbnNpb25UZXN0UnVuLmFyZ3MsIFtbdHJhY2tlci5pZF1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgZmFsc2UpO1xuXG5cdFx0XHR0YXNrM0RldGFjaGVkLmVuZCgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyB0ZXN0cyB0byBydW4gc21hcnRseScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhc2sxID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmxJZCcsIHNpbmdsZSwgcmVxLCAnaGVsbG8gd29ybGQnLCBmYWxzZSk7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gSXRlcmFibGUuZmlyc3QoYy50cmFja2VycykhO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRBcmdzOiB1bmtub3duW11bXSA9IFtdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kYWRkVGVzdHNUb1J1bi5hcmdzLCBleHBlY3RlZEFyZ3MpO1xuXG5cdFx0XHR0YXNrMS5wYXNzZWQoc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmdldCgnaWQtYWEnKSEpO1xuXHRcdFx0ZXhwZWN0ZWRBcmdzLnB1c2goW1xuXHRcdFx0XHQnY3RybElkJyxcblx0XHRcdFx0dHJhY2tlci5pZCxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShzaW5nbGUucm9vdCksXG5cdFx0XHRcdFx0Y29udmVydC5UZXN0SXRlbS5mcm9tKHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIGFzIFRlc3RJdGVtSW1wbCksXG5cdFx0XHRcdFx0Y29udmVydC5UZXN0SXRlbS5mcm9tKHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5nZXQoJ2lkLWFhJykgYXMgVGVzdEl0ZW1JbXBsKSxcblx0XHRcdFx0XVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3h5LiRhZGRUZXN0c1RvUnVuLmFyZ3MsIGV4cGVjdGVkQXJncyk7XG5cblx0XHRcdHRhc2sxLmVucXVldWVkKHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5nZXQoJ2lkLWFiJykhKTtcblx0XHRcdGV4cGVjdGVkQXJncy5wdXNoKFtcblx0XHRcdFx0J2N0cmxJZCcsXG5cdFx0XHRcdHRyYWNrZXIuaWQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjb252ZXJ0LlRlc3RJdGVtLmZyb20oc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykgYXMgVGVzdEl0ZW1JbXBsKSxcblx0XHRcdFx0XHRjb252ZXJ0LlRlc3RJdGVtLmZyb20oc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmdldCgnaWQtYWInKSBhcyBUZXN0SXRlbUltcGwpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3h5LiRhZGRUZXN0c1RvUnVuLmFyZ3MsIGV4cGVjdGVkQXJncyk7XG5cblx0XHRcdHRhc2sxLnBhc3NlZChzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEuY2hpbGRyZW4uZ2V0KCdpZC1hYicpISk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3h5LiRhZGRUZXN0c1RvUnVuLmFyZ3MsIGV4cGVjdGVkQXJncyk7XG5cblx0XHRcdHRhc2sxLmVuZCgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyB0ZXN0IG1lc3NhZ2VzIHRvIHJ1bicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3QxID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWMnLCAndGVzdCBjJywgVVJJLmZpbGUoJy90ZXN0Yy50eHQnKSk7XG5cdFx0XHRjb25zdCB0ZXN0MiA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1kJywgJ3Rlc3QgZCcsIFVSSS5maWxlKCcvdGVzdGQudHh0JykpO1xuXHRcdFx0dGVzdDEucmFuZ2UgPSB0ZXN0Mi5yYW5nZSA9IG5ldyBSYW5nZShuZXcgUG9zaXRpb24oMCwgMCksIG5ldyBQb3NpdGlvbigxLCAwKSk7XG5cdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5yZXBsYWNlKFt0ZXN0MSwgdGVzdDJdKTtcblx0XHRcdGNvbnN0IHRhc2sgPSBjLmNyZWF0ZVRlc3RSdW4oZXh0LCAnY3RybElkJywgc2luZ2xlLCByZXEsICdoZWxsbyB3b3JsZCcsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgbWVzc2FnZTEgPSBuZXcgVGVzdE1lc3NhZ2UoJ3NvbWUgbWVzc2FnZScpO1xuXHRcdFx0bWVzc2FnZTEubG9jYXRpb24gPSBuZXcgTG9jYXRpb24oVVJJLmZpbGUoJy9hLnR4dCcpLCBuZXcgUG9zaXRpb24oMCwgMCkpO1xuXHRcdFx0dGFzay5mYWlsZWQodGVzdDEsIG1lc3NhZ2UxKTtcblxuXHRcdFx0Y29uc3QgYXJncyA9IHByb3h5LiRhcHBlbmRUZXN0TWVzc2FnZXNJblJ1bi5hcmdzWzBdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kYXBwZW5kVGVzdE1lc3NhZ2VzSW5SdW4uYXJnc1swXSwgW1xuXHRcdFx0XHRhcmdzWzBdLFxuXHRcdFx0XHRhcmdzWzFdLFxuXHRcdFx0XHRuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWMnXSkudG9TdHJpbmcoKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRtZXNzYWdlOiAnc29tZSBtZXNzYWdlJyxcblx0XHRcdFx0XHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsXG5cdFx0XHRcdFx0ZXhwZWN0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb250ZXh0VmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhY3R1YWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsb2NhdGlvbjogY29udmVydC5sb2NhdGlvbi5mcm9tKG1lc3NhZ2UxLmxvY2F0aW9uKSxcblx0XHRcdFx0XHRzdGFja1RyYWNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1dXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gc2hvdWxkIHVzZSB0ZXN0IGxvY2F0aW9uIGFzIGRlZmF1bHRcblx0XHRcdHRhc2suZmFpbGVkKHRlc3QyLCBuZXcgVGVzdE1lc3NhZ2UoJ3NvbWUgbWVzc2FnZScpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJveHkuJGFwcGVuZFRlc3RNZXNzYWdlc0luUnVuLmFyZ3NbMV0sIFtcblx0XHRcdFx0YXJnc1swXSxcblx0XHRcdFx0YXJnc1sxXSxcblx0XHRcdFx0bmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1kJ10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bWVzc2FnZTogJ3NvbWUgbWVzc2FnZScsXG5cdFx0XHRcdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLkVycm9yLFxuXHRcdFx0XHRcdGNvbnRleHRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGV4cGVjdGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YWN0dWFsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bG9jYXRpb246IGNvbnZlcnQubG9jYXRpb24uZnJvbSh7IHVyaTogdGVzdDIudXJpISwgcmFuZ2U6IHRlc3QyLnJhbmdlIH0pLFxuXHRcdFx0XHRcdHN0YWNrVHJhY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0fV1cblx0XHRcdF0pO1xuXG5cdFx0XHR0YXNrLmVuZCgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3VhcmRzIGNhbGxzIGFmdGVyIHJ1bnMgYXJlIGVuZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFzayA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdoZWxsbyB3b3JsZCcsIGZhbHNlKTtcblx0XHRcdHRhc2suZW5kKCk7XG5cblx0XHRcdHRhc2suZmFpbGVkKHNpbmdsZS5yb290LCBuZXcgVGVzdE1lc3NhZ2UoJ3NvbWUgbWVzc2FnZScpKTtcblx0XHRcdHRhc2suYXBwZW5kT3V0cHV0KCdvdXRwdXQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LiRhZGRUZXN0c1RvUnVuLmNhbGxlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LiRhcHBlbmRPdXRwdXRUb1J1bi5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS4kYXBwZW5kVGVzdE1lc3NhZ2VzSW5SdW4uY2FsbGVkLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIHN0YXRlIG9mIHRlc3Qgd2l0aCBpZGVudGljYWwgbG9jYWwgSURzICgjMTMxODI3KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RBID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJyk7XG5cdFx0XHRjb25zdCB0ZXN0QiA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYicpO1xuXHRcdFx0Y29uc3QgY2hpbGRBID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWNoaWxkJywgJ2NoaWxkJywgdW5kZWZpbmVkKTtcblx0XHRcdHRlc3RBIS5jaGlsZHJlbi5yZXBsYWNlKFtjaGlsZEFdKTtcblx0XHRcdGNvbnN0IGNoaWxkQiA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1jaGlsZCcsICdjaGlsZCcsIHVuZGVmaW5lZCk7XG5cdFx0XHR0ZXN0QiEuY2hpbGRyZW4ucmVwbGFjZShbY2hpbGRCXSk7XG5cblx0XHRcdGNvbnN0IHRhc2sxID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmwnLCBzaW5nbGUsIG5ldyBUZXN0UnVuUmVxdWVzdEltcGwoKSwgJ2hlbGxvIHdvcmxkJywgZmFsc2UpO1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IEl0ZXJhYmxlLmZpcnN0KGMudHJhY2tlcnMpITtcblxuXHRcdFx0dGFzazEucGFzc2VkKGNoaWxkQSk7XG5cdFx0XHR0YXNrMS5wYXNzZWQoY2hpbGRCKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJveHkuJGFkZFRlc3RzVG9SdW4uYXJncywgW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2N0cmwnLFxuXHRcdFx0XHRcdHRyYWNrZXIuaWQsXG5cdFx0XHRcdFx0W3NpbmdsZS5yb290LCB0ZXN0QSwgY2hpbGRBXS5tYXAodCA9PiBjb252ZXJ0LlRlc3RJdGVtLmZyb20odCBhcyBUZXN0SXRlbUltcGwpKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdjdHJsJyxcblx0XHRcdFx0XHR0cmFja2VyLmlkLFxuXHRcdFx0XHRcdFtzaW5nbGUucm9vdCwgdGVzdEIsIGNoaWxkQl0ubWFwKHQgPT4gY29udmVydC5UZXN0SXRlbS5mcm9tKHQgYXMgVGVzdEl0ZW1JbXBsKSksXG5cdFx0XHRcdF0sXG5cdFx0XHRdKTtcblxuXHRcdFx0dGFzazEuZW5kKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXJ2aWNlJywgKCkgPT4ge1xuXHRcdGxldCBjdHJsOiBUZXN0RXh0SG9zdFRlc3Rpbmc7XG5cblx0XHRjbGFzcyBUZXN0RXh0SG9zdFRlc3RpbmcgZXh0ZW5kcyBFeHRIb3N0VGVzdGluZyB7XG5cdFx0XHRwdWJsaWMgZ2V0UHJvZmlsZUludGVybmFsSWQoY3RybDogVGVzdENvbnRyb2xsZXIsIHByb2ZpbGU6IFRlc3RSdW5Qcm9maWxlKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2lkLCBwXSBvZiB0aGlzLmNvbnRyb2xsZXJzLmdldChjdHJsLmlkKSEucHJvZmlsZXMpIHtcblx0XHRcdFx0XHRpZiAocHJvZmlsZSA9PT0gcCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGlkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigncHJvZmlsZSBub3QgZm91bmQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IEFueUNhbGxSUENQcm90b2NvbCgpO1xuXHRcdFx0Y3RybCA9IGRzLmFkZChuZXcgVGVzdEV4dEhvc3RUZXN0aW5nKFxuXHRcdFx0XHRycGNQcm90b2NvbCxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBFeHRIb3N0Q29tbWFuZHMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cG9zZXMgYWN0aXZlIHByb2ZpbGVzIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dEEgPSB7IC4uLm51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWRlbnRpZmllcjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2V4dC5hJyksIGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsndGVzdGluZ0FjdGl2ZVByb2ZpbGUnXSB9O1xuXHRcdFx0Y29uc3QgZXh0QiA9IHsgLi4ubnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignZXh0LmInKSwgZW5hYmxlZEFwaVByb3Bvc2FsczogWyd0ZXN0aW5nQWN0aXZlUHJvZmlsZSddIH07XG5cblx0XHRcdGNvbnN0IGN0cmxBID0gZHMuYWRkKGN0cmwuY3JlYXRlVGVzdENvbnRyb2xsZXIoZXh0QSwgJ2EnLCAnY3RybGEnKSk7XG5cdFx0XHRjb25zdCBwcm9mQUEgPSBkcy5hZGQoY3RybEEuY3JlYXRlUnVuUHJvZmlsZSgnYWEnLCBUZXN0UnVuUHJvZmlsZUtpbmQuUnVuLCAoKSA9PiB7IH0pKTtcblx0XHRcdGNvbnN0IHByb2ZBQiA9IGRzLmFkZChjdHJsQS5jcmVhdGVSdW5Qcm9maWxlKCdhYicsIFRlc3RSdW5Qcm9maWxlS2luZC5SdW4sICgpID0+IHsgfSkpO1xuXG5cdFx0XHRjb25zdCBjdHJsQiA9IGRzLmFkZChjdHJsLmNyZWF0ZVRlc3RDb250cm9sbGVyKGV4dEIsICdiJywgJ2N0cmxiJykpO1xuXHRcdFx0Y29uc3QgcHJvZkJBID0gZHMuYWRkKGN0cmxCLmNyZWF0ZVJ1blByb2ZpbGUoJ2JhJywgVGVzdFJ1blByb2ZpbGVLaW5kLlJ1biwgKCkgPT4geyB9KSk7XG5cdFx0XHRjb25zdCBwcm9mQkIgPSBkcy5hZGQoY3RybEIuY3JlYXRlUnVuUHJvZmlsZSgnYmInLCBUZXN0UnVuUHJvZmlsZUtpbmQuUnVuLCAoKSA9PiB7IH0pKTtcblx0XHRcdGNvbnN0IG5ldmVyQ2FsbGVkID0gc2lub24uc3R1YigpO1xuXG5cdFx0XHQvLyBlbXB0eSBkZWZhdWx0IHN0YXRlOlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9mQUEuaXNEZWZhdWx0LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2ZCQS5pc0RlZmF1bHQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZkJCLmlzRGVmYXVsdCwgZmFsc2UpO1xuXG5cdFx0XHQvLyBmaXJlcyBhIGNoYW5nZSBldmVudDpcblx0XHRcdGNvbnN0IGNoYW5nZUEgPSBFdmVudC50b1Byb21pc2UocHJvZkFBLm9uRGlkQ2hhbmdlRGVmYXVsdCBhcyBFdmVudDxib29sZWFuPik7XG5cdFx0XHRjb25zdCBjaGFuZ2VCQSA9IEV2ZW50LnRvUHJvbWlzZShwcm9mQkEub25EaWRDaGFuZ2VEZWZhdWx0IGFzIEV2ZW50PGJvb2xlYW4+KTtcblx0XHRcdGNvbnN0IGNoYW5nZUJCID0gRXZlbnQudG9Qcm9taXNlKHByb2ZCQi5vbkRpZENoYW5nZURlZmF1bHQgYXMgRXZlbnQ8Ym9vbGVhbj4pO1xuXG5cdFx0XHRkcy5hZGQocHJvZkFCLm9uRGlkQ2hhbmdlRGVmYXVsdChuZXZlckNhbGxlZCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldmVyQ2FsbGVkLmNhbGxlZCwgZmFsc2UpO1xuXG5cdFx0XHRjdHJsLiRzZXREZWZhdWx0UnVuUHJvZmlsZXMoe1xuXHRcdFx0XHRhOiBbY3RybC5nZXRQcm9maWxlSW50ZXJuYWxJZChjdHJsQSwgcHJvZkFBKV0sXG5cdFx0XHRcdGI6IFtjdHJsLmdldFByb2ZpbGVJbnRlcm5hbElkKGN0cmxCLCBwcm9mQkEpLCBjdHJsLmdldFByb2ZpbGVJbnRlcm5hbElkKGN0cmxCLCBwcm9mQkIpXVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgY2hhbmdlQSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGNoYW5nZUJBLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgY2hhbmdlQkIsIHRydWUpO1xuXG5cdFx0XHQvLyB1cGRhdGVzIGludGVybmFsIHN0YXRlOlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9mQUEuaXNEZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZkJBLmlzRGVmYXVsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2ZCQi5pc0RlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9mQUIuaXNEZWZhdWx0LCBmYWxzZSk7XG5cblx0XHRcdC8vIG5vLW9wcyBpZiBlcXVhbFxuXHRcdFx0ZHMuYWRkKHByb2ZBQS5vbkRpZENoYW5nZURlZmF1bHQobmV2ZXJDYWxsZWQpKTtcblx0XHRcdGN0cmwuJHNldERlZmF1bHRSdW5Qcm9maWxlcyh7XG5cdFx0XHRcdGE6IFtjdHJsLmdldFByb2ZpbGVJbnRlcm5hbElkKGN0cmxBLCBwcm9mQUEpXSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldmVyQ2FsbGVkLmNhbGxlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0sa0JBQThCO0FBQzdDLFNBQVMsK0NBQStDO0FBQ3hELFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsMkJBQWtEO0FBQzNELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsZ0JBQWdCLG9CQUFvQixZQUFZLDBCQUEwQjtBQUNuRixTQUFTLDJCQUEyQixvQkFBb0I7QUFDeEQsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsVUFBVSxVQUFVLE9BQU8sYUFBYSxvQkFBb0Isa0JBQWtCLG9CQUFvQixlQUFlO0FBQzFILFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQixxQkFBcUIsdUJBQWtDO0FBQ2hGLFNBQVMsZ0NBQWdDO0FBR3pDLE1BQU0sV0FBVyxDQUFDLFVBQW9CO0FBQUEsRUFDckMsSUFBSSxLQUFLO0FBQUEsRUFDVCxPQUFPLEtBQUs7QUFBQSxFQUNaLEtBQUssS0FBSztBQUFBLEVBQ1YsT0FBTyxLQUFLO0FBQ2I7QUFFQSxNQUFNLG1CQUFtQixDQUFDLEdBQTZCLE1BQWdDO0FBQ3RGLE1BQUksQ0FBQyxHQUFHO0FBQ1AsVUFBTSxJQUFJLE9BQU8sZUFBZSxFQUFFLFNBQVMsNEJBQTRCLFFBQVEsRUFBRSxDQUFDO0FBQUEsRUFDbkY7QUFFQSxNQUFJLENBQUMsR0FBRztBQUNQLFVBQU0sSUFBSSxPQUFP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
