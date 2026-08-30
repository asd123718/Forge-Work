import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { TestExtensionService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { ChatAgentLocation } from "../../../common/constants.js";
import { ChatModel } from "../../../common/model/chatModel.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatSessionOperationLog } from "../../../common/model/chatSessionOperationLog.js";
import * as Adapt from "../../../common/model/objectMutationLog.js";
import { equals } from "../../../../../../base/common/objects.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
import { MockChatService } from "../chatService/mockChatService.js";
suite("ChatSessionOperationLog", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createTestSchema() {
    const itemSchema = Adapt.object({
      id: Adapt.t((i) => i.id, Adapt.key()),
      value: Adapt.t((i) => i.value, Adapt.value())
    });
    return Adapt.object({
      name: Adapt.t((o) => o.name, Adapt.value()),
      count: Adapt.t((o) => o.count, Adapt.value()),
      items: Adapt.t((o) => o.items, Adapt.array(itemSchema)),
      metadata: Adapt.v((o) => o.metadata, equals)
    });
  }
  function simulateFileRoundtrip(adapter, initial, updates) {
    let fileContent = adapter.createInitial(initial);
    for (const update of updates) {
      const result = adapter.write(update);
      if (result.op === "replace") {
        fileContent = result.data;
      } else {
        fileContent = VSBuffer.concat([fileContent, result.data]);
      }
      adapter.confirmWrite();
    }
    const reader = new Adapt.ObjectMutationLog(createTestSchema());
    return reader.read(fileContent);
  }
  test("persists plan review changes through the operation log", () => {
    const store = testDisposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, store.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, store.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
    const model = store.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "Create a plan";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const review = new ChatPlanReviewData("Plan summary", "Generated summary", [{ label: "Approve" }], true);
    model.acceptResponseProgress(request, review);
    const writer = new ChatSessionOperationLog();
    const initial = writer.createInitial(model);
    review.isOutdated = true;
    const update = writer.write(model);
    writer.confirmWrite();
    const reader = new ChatSessionOperationLog();
    const restored = reader.read(VSBuffer.concat([initial, update.data]));
    const restoredReview = restored.requests[0].response?.[0];
    if (!restoredReview || !hasKey(restoredReview, { kind: true }) || restoredReview.kind !== "planReview") {
      assert.fail("Expected a restored plan review");
    }
    assert.strictEqual(restoredReview.isOutdated, true);
  });
  suite("Transform factories", () => {
    test("key uses strict equality by default", () => {
      const transform = Adapt.key();
      assert.strictEqual(transform.equals("a", "a"), true);
      assert.strictEqual(transform.equals("a", "b"), false);
    });
    test("key uses custom comparator", () => {
      const transform = Adapt.key((a, b) => a.id === b.id);
      assert.strictEqual(transform.equals({ id: 1 }, { id: 1 }), true);
      assert.strictEqual(transform.equals({ id: 1 }, { id: 2 }), false);
    });
    test("primitive uses strict equality", () => {
      const transform = Adapt.value();
      assert.strictEqual(transform.equals(1, 1), true);
      assert.strictEqual(transform.equals(1, 2), false);
    });
    test("primitive with custom comparator", () => {
      const transform = Adapt.value((a, b) => a.toLowerCase() === b.toLowerCase());
      assert.strictEqual(transform.equals("ABC", "abc"), true);
      assert.strictEqual(transform.equals("ABC", "def"), false);
    });
    test("object extracts and compares properties", () => {
      const schema = Adapt.object({
        x: Adapt.t((o) => o.x, Adapt.value()),
        y: Adapt.t((o) => o.y, Adapt.value())
      });
      const extracted = schema.extract({ x: 1, y: "test" });
      assert.strictEqual(extracted.x, 1);
      assert.strictEqual(extracted.y, "test");
    });
    test("t composes getter with transform", () => {
      const transform = Adapt.t(
        (obj) => obj.nested.value,
        Adapt.value()
      );
      assert.strictEqual(transform.extract({ nested: { value: 42 } }), 42);
    });
    test("differentiated uses separate extract and equals functions", () => {
      const transform = Adapt.v(
        (obj) => `${obj.type}:${obj.data}`,
        (a, b) => a.split(":")[0] === b.split(":")[0]
        // compare only the type prefix
      );
      const extracted = transform.extract({ type: "test", data: 123 });
      assert.strictEqual(extracted, "test:123");
      assert.strictEqual(transform.equals("test:123", "test:456"), true);
      assert.strictEqual(transform.equals("test:123", "other:123"), false);
    });
  });
  suite("LogAdapter", () => {
    test("createInitial creates valid log entry", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 0, items: [] };
      const buffer = adapter.createInitial(initial);
      const content = buffer.toString();
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.kind, 0);
      assert.deepStrictEqual(entry.v, initial);
    });
    test("read reconstructs initial state", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 5, items: [{ id: "a", value: 1 }] };
      const buffer = adapter.createInitial(initial);
      const reader = new Adapt.ObjectMutationLog(schema);
      const result = reader.read(buffer);
      assert.deepStrictEqual(result, initial);
    });
    test("write returns empty data when no changes", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      const result = adapter.write(obj);
      assert.strictEqual(result.op, "append");
      assert.strictEqual(result.data.toString(), "");
    });
    test("write detects primitive changes", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      const updated = { ...obj, count: 10 };
      const result = adapter.write(updated);
      assert.strictEqual(result.op, "append");
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["count"]);
      assert.strictEqual(entry.v, 10);
    });
    test("write detects array append", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [{ id: "a", value: 1 }] };
      adapter.createInitial(obj);
      const updated = { ...obj, items: [...obj.items, { id: "b", value: 2 }] };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 2);
      assert.deepStrictEqual(entry.k, ["items"]);
      assert.deepStrictEqual(entry.v, [{ id: "b", value: 2 }]);
      assert.strictEqual(entry.i, void 0);
    });
    test("write detects array append nested", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.array(Adapt.value()))
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: [1, 2] }] });
      const result1 = adapter.write({ items: [{ id: "a", value: [1, 2, 3] }] });
      adapter.confirmWrite();
      assert.deepStrictEqual(
        JSON.parse(result1.data.toString().trim()),
        { kind: 2, k: ["items", 0, "value"], v: [3] }
      );
      const result2 = adapter.write({ items: [{ id: "b", value: [1, 2, 3] }] });
      assert.deepStrictEqual(
        JSON.parse(result2.data.toString().trim()),
        { kind: 2, k: ["items"], i: 0, v: [{ id: "b", value: [1, 2, 3] }] }
      );
    });
    test("write detects array truncation", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [{ id: "a", value: 1 }, { id: "b", value: 2 }] };
      adapter.createInitial(obj);
      const updated = { ...obj, items: [obj.items[0]] };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 2);
      assert.deepStrictEqual(entry.k, ["items"]);
      assert.strictEqual(entry.i, 1);
      assert.strictEqual(entry.v, void 0);
    });
    test("write detects array item modification and recurses into object", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = {
        name: "test",
        count: 0,
        items: [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 3 }]
      };
      adapter.createInitial(obj);
      const updated = {
        ...obj,
        items: [{ id: "a", value: 1 }, { id: "b", value: 999 }, { id: "c", value: 3 }]
      };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["items", 1, "value"]);
      assert.strictEqual(entry.v, 999);
    });
    test("read applies multiple entries correctly", () => {
      const schema = createTestSchema();
      const initial = { name: "test", count: 0, items: [] };
      const entries = [
        { kind: 0, v: initial },
        { kind: 1, k: ["count"], v: 5 },
        { kind: 2, k: ["items"], v: [{ id: "a", value: 1 }] },
        { kind: 2, k: ["items"], v: [{ id: "b", value: 2 }] }
      ];
      const logContent = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
      const adapter = new Adapt.ObjectMutationLog(schema);
      const result = adapter.read(VSBuffer.fromString(logContent));
      assert.strictEqual(result.count, 5);
      assert.strictEqual(result.items.length, 2);
      assert.deepStrictEqual(result.items[0], { id: "a", value: 1 });
      assert.deepStrictEqual(result.items[1], { id: "b", value: 2 });
    });
    test("roundtrip preserves data through multiple updates", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 0, items: [] };
      const updates = [
        { name: "test", count: 1, items: [] },
        { name: "test", count: 1, items: [{ id: "a", value: 10 }] },
        { name: "test", count: 2, items: [{ id: "a", value: 10 }, { id: "b", value: 20 }] },
        { name: "test", count: 2, items: [{ id: "a", value: 10 }] }
        // Remove item
      ];
      const result = simulateFileRoundtrip(adapter, initial, updates);
      assert.deepStrictEqual(result, updates[updates.length - 1]);
    });
    test("compacts log when entry count exceeds threshold", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema, 3);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      adapter.write({ ...obj, count: 1 });
      adapter.confirmWrite();
      adapter.write({ ...obj, count: 2 });
      adapter.confirmWrite();
      const before = adapter.write({ ...obj, count: 3 });
      adapter.confirmWrite();
      assert.strictEqual(before.op, "append");
      const result = adapter.write({ ...obj, count: 4 });
      assert.strictEqual(result.op, "replace");
      const lines = result.data.toString().split("\n").filter((l) => l.trim());
      assert.strictEqual(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.strictEqual(entry.kind, 0);
    });
    test("handles deepCompare property changes", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [], metadata: { tags: ["a"] } };
      adapter.createInitial(obj);
      const updated = { ...obj, metadata: { tags: ["a", "b"] } };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["metadata"]);
      assert.deepStrictEqual(entry.v, { tags: ["a", "b"] });
    });
    test("handles differentiated property changes", () => {
      const schema = Adapt.object({
        data: Adapt.t(
          (o) => o.data,
          Adapt.v(
            (obj) => `${obj.type}:${obj.version}`,
            (a, b) => a.split(":")[0] === b.split(":")[0]
            // compare only the type prefix
          )
        )
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ data: { type: "foo", version: 1 } });
      const result1 = adapter.write({ data: { type: "bar", version: 2 } });
      adapter.confirmWrite();
      assert.notStrictEqual(result1.data.toString(), "", "different type should trigger change");
      const entry1 = JSON.parse(result1.data.toString().trim());
      assert.strictEqual(entry1.kind, 1);
      assert.deepStrictEqual(entry1.k, ["data"]);
      assert.strictEqual(entry1.v, "bar:2");
      const result2 = adapter.write({ data: { type: "bar", version: 3 } });
      assert.strictEqual(result2.data.toString(), "", "same type prefix should not trigger change");
    });
    test("read throws on empty log file", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      assert.throws(() => adapter.read(VSBuffer.fromString("")), /Empty log file/);
    });
    test("write without prior read creates initial entry", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 5, items: [] };
      const result = adapter.write(obj);
      assert.strictEqual(result.op, "replace");
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 0);
    });
    test("sealed objects skip non-key field comparison when both are sealed", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: true }] });
      const result1 = adapter.write({ items: [{ id: "a", value: 999, isSealed: true }] });
      assert.strictEqual(result1.data.toString(), "", "sealed item value change should be ignored");
    });
    test("sealed objects still detect key changes", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: true }] });
      const result = adapter.write({ items: [{ id: "b", value: 1, isSealed: true }] });
      assert.notStrictEqual(result.data.toString(), "", "key change should be detected even when sealed");
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 2);
    });
    test("sealed objects diff normally when one is not sealed", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: false }] });
      const result1 = adapter.write({ items: [{ id: "a", value: 999, isSealed: false }] });
      assert.notStrictEqual(result1.data.toString(), "", "non-sealed item should detect value change");
      const entry = JSON.parse(result1.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["items", 0, "value"]);
      assert.strictEqual(entry.v, 999);
    });
    test("sealed transition from unsealed to sealed detects final changes", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: false }] });
      const result = adapter.write({ items: [{ id: "a", value: 999, isSealed: true }] });
      assert.notStrictEqual(result.data.toString(), "", "transition to sealed should detect value change");
      const lines = result.data.toString().trim().split("\n");
      assert.strictEqual(lines.length, 2, "should have two change entries");
    });
    test("write detects property set to undefined", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 5, items: [], metadata: { tags: ["foo"] } };
      const result = simulateFileRoundtrip(adapter, initial, [
        { name: "test", count: 10, items: [], metadata: { tags: ["foo"] } },
        { name: "test", count: void 0, items: [], metadata: void 0 }
      ]);
      assert.deepStrictEqual(result, { name: "test", count: void 0, items: [], metadata: void 0 });
      const result2 = simulateFileRoundtrip(adapter, initial, [
        { name: "test", count: 10, items: [], metadata: { tags: ["foo"] } },
        { name: "test", count: void 0, items: [], metadata: void 0 },
        { name: "test", count: 12, items: [], metadata: { tags: ["bar"] } }
      ]);
      assert.deepStrictEqual(result2, { name: "test", count: 12, items: [], metadata: { tags: ["bar"] } });
    });
    test("delete followed by set restores property", () => {
      const schema = createTestSchema();
      const initial = { name: "test", count: 0, items: [], metadata: { tags: ["a"] } };
      const entries = [
        { kind: 0, v: initial },
        { kind: 3, k: ["metadata"] },
        // Delete
        { kind: 1, k: ["metadata"], v: { tags: ["b", "c"] } }
        // Set to new value
      ];
      const logContent = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
      const adapter = new Adapt.ObjectMutationLog(schema);
      const result = adapter.read(VSBuffer.fromString(logContent));
      assert.deepStrictEqual(result.metadata, { tags: ["b", "c"] });
    });
    test("write without confirmWrite resets to initial on next write", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      const result1 = adapter.write(obj);
      assert.strictEqual(result1.op, "replace");
      const result2 = adapter.write({ ...obj, count: 2 });
      assert.deepStrictEqual(
        { op: result2.op, entry: JSON.parse(result2.data.toString().trim()) },
        { op: "replace", entry: { kind: 0, v: { name: "test", count: 2, items: [] } } }
      );
    });
    test("confirmWrite commits state so next write is incremental", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      adapter.write({ ...obj, count: 1 });
      adapter.confirmWrite();
      const result = adapter.write({ ...obj, count: 2 });
      assert.deepStrictEqual(
        { op: result.op, entry: JSON.parse(result.data.toString().trim()) },
        { op: "append", entry: { kind: 1, k: ["count"], v: 2 } }
      );
    });
    test("read throws on log file missing initial entry", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const logContent = JSON.stringify({ kind: 1, k: ["count"], v: 5 }) + "\n";
      assert.throws(() => adapter.read(VSBuffer.fromString(logContent)), /missing an initial entry/);
    });
    test("failed first write followed by successful write produces valid roundtrip", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 0, items: [] };
      const r1 = adapter.write(initial);
      assert.strictEqual(r1.op, "replace");
      const r2 = adapter.write({ ...initial, count: 3 });
      assert.strictEqual(r2.op, "replace");
      adapter.confirmWrite();
      const fileContent = r2.data;
      const reader = new Adapt.ObjectMutationLog(createTestSchema());
      const result = reader.read(fileContent);
      assert.strictEqual(result.count, 3);
    });
    test("unconfirmed append after createInitial still diffs against initial", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      let fileContent = adapter.createInitial(obj);
      const r1 = adapter.write({ ...obj, count: 1 });
      assert.strictEqual(r1.op, "append");
      const r2 = adapter.write({ ...obj, count: 2 });
      assert.strictEqual(r2.op, "append");
      adapter.confirmWrite();
      fileContent = VSBuffer.concat([fileContent, r2.data]);
      const reader = new Adapt.ObjectMutationLog(createTestSchema());
      const result = reader.read(fileContent);
      assert.strictEqual(result.count, 2);
    });
  });
  suite("persistence size safety net", () => {
    test("makeTruncatingReplacer truncates an oversized string", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      const obj = { content: big, label: "ok" };
      const json = JSON.stringify(obj, Adapt.makeTruncatingReplacer(1024 * 1024, 10 * 1024 * 1024));
      const parsed = JSON.parse(json);
      assert.notStrictEqual(parsed.content, big);
      assert.ok(parsed.content.startsWith("[VS Code:"));
      assert.strictEqual(parsed.label, "ok");
    });
    test("makeTruncatingReplacer respects total budget without overshooting", () => {
      const STRING_CAP = 1024 * 1024;
      const TOTAL_CAP = 1024 * 1024;
      const medium = "y".repeat(200 * 1024);
      const obj = {};
      for (let i = 0; i < 20; i++) {
        obj[`k${i}`] = medium;
      }
      const json = JSON.stringify(obj, Adapt.makeTruncatingReplacer(STRING_CAP, TOTAL_CAP));
      const parsed = JSON.parse(json);
      const preservedChars = Object.values(parsed).filter((v) => typeof v === "string" && v === medium).reduce((sum, v) => sum + v.length, 0);
      assert.ok(preservedChars <= TOTAL_CAP, `preserved ${preservedChars} chars exceeded budget ${TOTAL_CAP}`);
      assert.strictEqual(parsed.k0, medium);
      assert.ok(Object.values(parsed).some((v) => typeof v === "string" && v.includes("entry exceeded size budget")));
    });
    test("stringifyEntryWithFallback succeeds with no overhead on small entries", () => {
      const entry = { kind: 0, v: { foo: "bar", n: 42 } };
      const out = Adapt.stringifyEntryWithFallback(entry);
      assert.strictEqual(out, JSON.stringify(entry));
    });
    test("stringifyEntryWithFallback rethrows non-RangeError", () => {
      const circular = {};
      circular.self = circular;
      assert.throws(() => Adapt.stringifyEntryWithFallback(circular), TypeError);
    });
    test("stringifyEntryWithFallback recovers when JSON.stringify throws RangeError", () => {
      let calls = 0;
      const entry = {
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { content: "recovered" };
        }
      };
      const out = Adapt.stringifyEntryWithFallback(entry);
      assert.strictEqual(calls, 2, "should have been called twice (initial + retry)");
      assert.deepStrictEqual(JSON.parse(out), { content: "recovered" });
    });
    test("stringifyEntryWithFallback applies truncating replacer on RangeError retry", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      let calls = 0;
      const entry = {
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { content: big, label: "ok" };
        }
      };
      const out = Adapt.stringifyEntryWithFallback(entry);
      const parsed = JSON.parse(out);
      assert.notStrictEqual(parsed.content, big);
      assert.ok(parsed.content.startsWith("[VS Code:"), `unexpected: ${parsed.content.slice(0, 80)}`);
      assert.strictEqual(parsed.label, "ok");
    });
    test("deepCloneWithFallback returns a structural clone on the common path", () => {
      const original = { a: 1, nested: { b: "two", list: [1, 2, 3] } };
      const clone = Adapt.deepCloneWithFallback(original);
      assert.deepStrictEqual(clone, original);
      assert.notStrictEqual(clone, original);
      assert.notStrictEqual(clone.nested, original.nested);
    });
    test("deepCloneWithFallback recovers from RangeError during the clone", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      let calls = 0;
      const value = {
        huge: big,
        label: "ok",
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { huge: big, label: "ok" };
        }
      };
      const clone = Adapt.deepCloneWithFallback(value);
      assert.strictEqual(calls, 2, "should have been called twice (initial + retry)");
      assert.strictEqual(clone.label, "ok");
      assert.notStrictEqual(clone.huge, big);
      assert.ok(clone.huge.startsWith("[VS Code:"), `unexpected: ${clone.huge.slice(0, 80)}`);
    });
    test("value().extract recovers when the deep-clone throws RangeError", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      let calls = 0;
      const huge = {
        kept: "meta",
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { dump: big, kept: "meta" };
        }
      };
      const transform = Adapt.value((a, b) => a.dump === b.dump && a.kept === b.kept);
      const extracted = transform.extract(huge);
      assert.strictEqual(calls, 2);
      assert.strictEqual(extracted.kept, "meta");
      assert.ok(extracted.dump.startsWith("[VS Code:"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGNoYXRTZXNzaW9uT3BlcmF0aW9uTG9nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RFeHRlbnNpb25TZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UGxhblJldmlld0RhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2cgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFNlc3Npb25PcGVyYXRpb25Mb2cuanMnO1xuaW1wb3J0ICogYXMgQWRhcHQgZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL29iamVjdE11dGF0aW9uTG9nLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50U2VydmljZSwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUZXh0UGFydCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2cnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFRlc3QgZGF0YSB0eXBlc1xuXHRpbnRlcmZhY2UgVGVzdEl0ZW0ge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0dmFsdWU6IG51bWJlcjtcblx0fVxuXG5cdGludGVyZmFjZSBUZXN0T2JqZWN0IHtcblx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0Y291bnQ/OiBudW1iZXI7XG5cdFx0aXRlbXM6IFRlc3RJdGVtW107XG5cdFx0bWV0YWRhdGE/OiB7IHRhZ3M6IHN0cmluZ1tdIH07XG5cdH1cblxuXHQvLyBIZWxwZXIgdG8gY3JlYXRlIGEgc2ltcGxlIHNjaGVtYSBmb3IgdGVzdGluZ1xuXHRmdW5jdGlvbiBjcmVhdGVUZXN0U2NoZW1hKCkge1xuXHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8VGVzdEl0ZW0sIFRlc3RJdGVtPih7XG5cdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdHZhbHVlOiBBZGFwdC50KGkgPT4gaS52YWx1ZSwgQWRhcHQudmFsdWUoKSksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gQWRhcHQub2JqZWN0PFRlc3RPYmplY3QsIFRlc3RPYmplY3Q+KHtcblx0XHRcdG5hbWU6IEFkYXB0LnQobyA9PiBvLm5hbWUsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0Y291bnQ6IEFkYXB0LnQobyA9PiBvLmNvdW50LCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdGl0ZW1zOiBBZGFwdC50KG8gPT4gby5pdGVtcywgQWRhcHQuYXJyYXkoaXRlbVNjaGVtYSkpLFxuXHRcdFx0bWV0YWRhdGE6IEFkYXB0LnYobyA9PiBvLm1ldGFkYXRhLCBlcXVhbHMpLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gSGVscGVyIHRvIHNpbXVsYXRlIGZpbGUgb3BlcmF0aW9uc1xuXHRmdW5jdGlvbiBzaW11bGF0ZUZpbGVSb3VuZHRyaXAoYWRhcHRlcjogQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2c8VGVzdE9iamVjdCwgVGVzdE9iamVjdD4sIGluaXRpYWw6IFRlc3RPYmplY3QsIHVwZGF0ZXM6IFRlc3RPYmplY3RbXSk6IFRlc3RPYmplY3Qge1xuXHRcdGxldCBmaWxlQ29udGVudCA9IGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChpbml0aWFsKTtcblxuXHRcdGZvciAoY29uc3QgdXBkYXRlIG9mIHVwZGF0ZXMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUodXBkYXRlKTtcblx0XHRcdGlmIChyZXN1bHQub3AgPT09ICdyZXBsYWNlJykge1xuXHRcdFx0XHRmaWxlQ29udGVudCA9IHJlc3VsdC5kYXRhO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZmlsZUNvbnRlbnQgPSBWU0J1ZmZlci5jb25jYXQoW2ZpbGVDb250ZW50LCByZXN1bHQuZGF0YV0pO1xuXHRcdFx0fVxuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbmV3IGFkYXB0ZXIgYW5kIHJlYWQgYmFja1xuXHRcdGNvbnN0IHJlYWRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhjcmVhdGVUZXN0U2NoZW1hKCkpO1xuXHRcdHJldHVybiByZWFkZXIucmVhZChmaWxlQ29udGVudCk7XG5cdH1cblxuXHR0ZXN0KCdwZXJzaXN0cyBwbGFuIHJldmlldyBjaGFuZ2VzIHRocm91Z2ggdGhlIG9wZXJhdGlvbiBsb2cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBZ2VudFNlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB0ZXh0ID0gJ0NyZWF0ZSBhIHBsYW4nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHtcblx0XHRcdHRleHQsXG5cdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCAxLCAxLCB0ZXh0Lmxlbmd0aCArIDEpLCB0ZXh0KV0sXG5cdFx0fSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGNvbnN0IHJldmlldyA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoJ1BsYW4gc3VtbWFyeScsICdHZW5lcmF0ZWQgc3VtbWFyeScsIFt7IGxhYmVsOiAnQXBwcm92ZScgfV0sIHRydWUpO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcmV2aWV3KTtcblxuXHRcdGNvbnN0IHdyaXRlciA9IG5ldyBDaGF0U2Vzc2lvbk9wZXJhdGlvbkxvZygpO1xuXHRcdGNvbnN0IGluaXRpYWwgPSB3cml0ZXIuY3JlYXRlSW5pdGlhbChtb2RlbCk7XG5cdFx0cmV2aWV3LmlzT3V0ZGF0ZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHVwZGF0ZSA9IHdyaXRlci53cml0ZShtb2RlbCk7XG5cdFx0d3JpdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXG5cdFx0Y29uc3QgcmVhZGVyID0gbmV3IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nKCk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSByZWFkZXIucmVhZChWU0J1ZmZlci5jb25jYXQoW2luaXRpYWwsIHVwZGF0ZS5kYXRhXSkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkUmV2aWV3ID0gcmVzdG9yZWQucmVxdWVzdHNbMF0ucmVzcG9uc2U/LlswXTtcblx0XHRpZiAoIXJlc3RvcmVkUmV2aWV3IHx8ICFoYXNLZXkocmVzdG9yZWRSZXZpZXcsIHsga2luZDogdHJ1ZSB9KSB8fCByZXN0b3JlZFJldmlldy5raW5kICE9PSAncGxhblJldmlldycpIHtcblx0XHRcdGFzc2VydC5mYWlsKCdFeHBlY3RlZCBhIHJlc3RvcmVkIHBsYW4gcmV2aWV3Jyk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZFJldmlldy5pc091dGRhdGVkLCB0cnVlKTtcblx0fSk7XG5cblx0c3VpdGUoJ1RyYW5zZm9ybSBmYWN0b3JpZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgna2V5IHVzZXMgc3RyaWN0IGVxdWFsaXR5IGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm0gPSBBZGFwdC5rZXk8c3RyaW5nPigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoJ2EnLCAnYScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKCdhJywgJ2InKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2V5IHVzZXMgY3VzdG9tIGNvbXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm0gPSBBZGFwdC5rZXk8eyBpZDogbnVtYmVyIH0+KChhLCBiKSA9PiBhLmlkID09PSBiLmlkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKHsgaWQ6IDEgfSwgeyBpZDogMSB9KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmVxdWFscyh7IGlkOiAxIH0sIHsgaWQ6IDIgfSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByaW1pdGl2ZSB1c2VzIHN0cmljdCBlcXVhbGl0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybSA9IEFkYXB0LnZhbHVlPG51bWJlciwgbnVtYmVyPigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoMSwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoMSwgMiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByaW1pdGl2ZSB3aXRoIGN1c3RvbSBjb21wYXJhdG9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNmb3JtID0gQWRhcHQudmFsdWU8c3RyaW5nLCBzdHJpbmc+KChhLCBiKSA9PiBhLnRvTG93ZXJDYXNlKCkgPT09IGIudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmVxdWFscygnQUJDJywgJ2FiYycpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKCdBQkMnLCAnZGVmJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29iamVjdCBleHRyYWN0cyBhbmQgY29tcGFyZXMgcHJvcGVydGllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IEFkYXB0Lm9iamVjdDx7IHg6IG51bWJlcjsgeTogc3RyaW5nIH0sIHsgeDogbnVtYmVyOyB5OiBzdHJpbmcgfT4oe1xuXHRcdFx0XHR4OiBBZGFwdC50KG8gPT4gby54LCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdFx0eTogQWRhcHQudChvID0+IG8ueSwgQWRhcHQudmFsdWUoKSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXh0cmFjdGVkID0gc2NoZW1hLmV4dHJhY3QoeyB4OiAxLCB5OiAndGVzdCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdGVkLngsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RlZC55LCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndCBjb21wb3NlcyBnZXR0ZXIgd2l0aCB0cmFuc2Zvcm0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm0gPSBBZGFwdC50KFxuXHRcdFx0XHQob2JqOiB7IG5lc3RlZDogeyB2YWx1ZTogbnVtYmVyIH0gfSkgPT4gb2JqLm5lc3RlZC52YWx1ZSxcblx0XHRcdFx0QWRhcHQudmFsdWU8bnVtYmVyLCBudW1iZXI+KClcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXh0cmFjdCh7IG5lc3RlZDogeyB2YWx1ZTogNDIgfSB9KSwgNDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlmZmVyZW50aWF0ZWQgdXNlcyBzZXBhcmF0ZSBleHRyYWN0IGFuZCBlcXVhbHMgZnVuY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNmb3JtID0gQWRhcHQudjx7IHR5cGU6IHN0cmluZzsgZGF0YTogbnVtYmVyIH0sIHN0cmluZz4oXG5cdFx0XHRcdG9iaiA9PiBgJHtvYmoudHlwZX06JHtvYmouZGF0YX1gLFxuXHRcdFx0XHQoYSwgYikgPT4gYS5zcGxpdCgnOicpWzBdID09PSBiLnNwbGl0KCc6JylbMF0sIC8vIGNvbXBhcmUgb25seSB0aGUgdHlwZSBwcmVmaXhcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGV4dHJhY3RlZCA9IHRyYW5zZm9ybS5leHRyYWN0KHsgdHlwZTogJ3Rlc3QnLCBkYXRhOiAxMjMgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdGVkLCAndGVzdDoxMjMnKTtcblxuXHRcdFx0Ly8gU2FtZSB0eXBlIHByZWZpeCBzaG91bGQgYmUgZXF1YWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKCd0ZXN0OjEyMycsICd0ZXN0OjQ1NicpLCB0cnVlKTtcblx0XHRcdC8vIERpZmZlcmVudCB0eXBlIHByZWZpeCBzaG91bGQgbm90IGJlIGVxdWFsXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmVxdWFscygndGVzdDoxMjMnLCAnb3RoZXI6MTIzJyksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0xvZ0FkYXB0ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnY3JlYXRlSW5pdGlhbCBjcmVhdGVzIHZhbGlkIGxvZyBlbnRyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3QgaW5pdGlhbDogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdIH07XG5cdFx0XHRjb25zdCBidWZmZXIgPSBhZGFwdGVyLmNyZWF0ZUluaXRpYWwoaW5pdGlhbCk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBidWZmZXIudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShjb250ZW50LnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMCk7IC8vIEVudHJ5S2luZC5Jbml0aWFsXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnYsIGluaXRpYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZCByZWNvbnN0cnVjdHMgaW5pdGlhbCBzdGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3QgaW5pdGlhbDogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogNSwgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxIH1dIH07XG5cdFx0XHRjb25zdCBidWZmZXIgPSBhZGFwdGVyLmNyZWF0ZUluaXRpYWwoaW5pdGlhbCk7XG5cblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVhZGVyLnJlYWQoYnVmZmVyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIGluaXRpYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgcmV0dXJucyBlbXB0eSBkYXRhIHdoZW4gbm8gY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChvYmopO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKG9iaik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm9wLCAnYXBwZW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRhdGEudG9TdHJpbmcoKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgZGV0ZWN0cyBwcmltaXRpdmUgY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChvYmopO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkID0geyAuLi5vYmosIGNvdW50OiAxMCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci53cml0ZSh1cGRhdGVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5vcCwgJ2FwcGVuZCcpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAxKTsgLy8gRW50cnlLaW5kLlNldFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5rLCBbJ2NvdW50J10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnYsIDEwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlIGRldGVjdHMgYXJyYXkgYXBwZW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBvYmo6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMSB9XSB9O1xuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKG9iaik7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZWQ6IFRlc3RPYmplY3QgPSB7IC4uLm9iaiwgaXRlbXM6IFsuLi5vYmouaXRlbXMsIHsgaWQ6ICdiJywgdmFsdWU6IDIgfV0gfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUodXBkYXRlZCk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YS50b1N0cmluZygpLnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMik7IC8vIEVudHJ5S2luZC5QdXNoXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LmssIFsnaXRlbXMnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnYsIFt7IGlkOiAnYicsIHZhbHVlOiAyIH1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgZGV0ZWN0cyBhcnJheSBhcHBlbmQgbmVzdGVkJywgKCkgPT4ge1xuXHRcdFx0dHlwZSBJdGVtID0geyBpZDogc3RyaW5nOyB2YWx1ZTogbnVtYmVyW10gfTtcblx0XHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8SXRlbSwgSXRlbT4oe1xuXHRcdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdFx0dmFsdWU6IEFkYXB0LnQoaSA9PiBpLnZhbHVlLCBBZGFwdC5hcnJheShBZGFwdC52YWx1ZSgpKSksXG5cdFx0XHR9KTtcblxuXHRcdFx0dHlwZSBUZXN0T2JqZWN0ID0geyBpdGVtczogSXRlbVtdIH07XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBBZGFwdC5vYmplY3Q8VGVzdE9iamVjdCwgVGVzdE9iamVjdD4oe1xuXHRcdFx0XHRpdGVtczogQWRhcHQudChvID0+IG8uaXRlbXMsIEFkYXB0LmFycmF5KGl0ZW1TY2hlbWEpKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbCh7IGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogWzEsIDJdIH1dIH0pO1xuXG5cblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhZGFwdGVyLndyaXRlKHsgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiBbMSwgMiwgM10gfV0gfSk7XG5cdFx0XHRhZGFwdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0SlNPTi5wYXJzZShyZXN1bHQxLmRhdGEudG9TdHJpbmcoKS50cmltKCkpLFxuXHRcdFx0XHR7IGtpbmQ6IDIsIGs6IFsnaXRlbXMnLCAwLCAndmFsdWUnXSwgdjogWzNdIH0sXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQyID0gYWRhcHRlci53cml0ZSh7IGl0ZW1zOiBbeyBpZDogJ2InLCB2YWx1ZTogWzEsIDIsIDNdIH1dIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0SlNPTi5wYXJzZShyZXN1bHQyLmRhdGEudG9TdHJpbmcoKS50cmltKCkpLFxuXHRcdFx0XHR7IGtpbmQ6IDIsIGs6IFsnaXRlbXMnXSwgaTogMCwgdjogW3sgaWQ6ICdiJywgdmFsdWU6IFsxLCAyLCAzXSB9XSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlIGRldGVjdHMgYXJyYXkgdHJ1bmNhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEgfSwgeyBpZDogJ2InLCB2YWx1ZTogMiB9XSB9O1xuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKG9iaik7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZWQ6IFRlc3RPYmplY3QgPSB7IC4uLm9iaiwgaXRlbXM6IFtvYmouaXRlbXNbMF1dIH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKHVwZGF0ZWQpO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IEpTT04ucGFyc2UocmVzdWx0LmRhdGEudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIDIpOyAvLyBFbnRyeUtpbmQuUHVzaFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5rLCBbJ2l0ZW1zJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnYsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZSBkZXRlY3RzIGFycmF5IGl0ZW0gbW9kaWZpY2F0aW9uIGFuZCByZWN1cnNlcyBpbnRvIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0ge1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdGNvdW50OiAwLFxuXHRcdFx0XHRpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEgfSwgeyBpZDogJ2InLCB2YWx1ZTogMiB9LCB7IGlkOiAnYycsIHZhbHVlOiAzIH1dXG5cdFx0XHR9O1xuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKG9iaik7XG5cblx0XHRcdC8vIE1vZGlmeSBtaWRkbGUgaXRlbSAtIGtleSAnaWQnIG1hdGNoZXMsIHNvIHdlIHJlY3Vyc2UgdG8gc2V0IHRoZSAndmFsdWUnIHByb3BlcnR5XG5cdFx0XHRjb25zdCB1cGRhdGVkOiBUZXN0T2JqZWN0ID0ge1xuXHRcdFx0XHQuLi5vYmosXG5cdFx0XHRcdGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMSB9LCB7IGlkOiAnYicsIHZhbHVlOiA5OTkgfSwgeyBpZDogJ2MnLCB2YWx1ZTogMyB9XVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUodXBkYXRlZCk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YS50b1N0cmluZygpLnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMSk7IC8vIEVudHJ5S2luZC5TZXQgLSBzZXR0aW5nIGluZGl2aWR1YWwgcHJvcGVydHlcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkuaywgWydpdGVtcycsIDEsICd2YWx1ZSddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS52LCA5OTkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZCBhcHBsaWVzIG11bHRpcGxlIGVudHJpZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbDogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdIH07XG5cblx0XHRcdC8vIEJ1aWxkIGxvZyBtYW51YWxseVxuXHRcdFx0Y29uc3QgZW50cmllcyA9IFtcblx0XHRcdFx0eyBraW5kOiAwLCB2OiBpbml0aWFsIH0sXG5cdFx0XHRcdHsga2luZDogMSwgazogWydjb3VudCddLCB2OiA1IH0sXG5cdFx0XHRcdHsga2luZDogMiwgazogWydpdGVtcyddLCB2OiBbeyBpZDogJ2EnLCB2YWx1ZTogMSB9XSB9LFxuXHRcdFx0XHR7IGtpbmQ6IDIsIGs6IFsnaXRlbXMnXSwgdjogW3sgaWQ6ICdiJywgdmFsdWU6IDIgfV0gfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBsb2dDb250ZW50ID0gZW50cmllcy5tYXAoZSA9PiBKU09OLnN0cmluZ2lmeShlKSkuam9pbignXFxuJykgKyAnXFxuJztcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci5yZWFkKFZTQnVmZmVyLmZyb21TdHJpbmcobG9nQ29udGVudCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvdW50LCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lml0ZW1zWzBdLCB7IGlkOiAnYScsIHZhbHVlOiAxIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaXRlbXNbMV0sIHsgaWQ6ICdiJywgdmFsdWU6IDIgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3VuZHRyaXAgcHJlc2VydmVzIGRhdGEgdGhyb3VnaCBtdWx0aXBsZSB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBpbml0aWFsOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGNvbnN0IHVwZGF0ZXM6IFRlc3RPYmplY3RbXSA9IFtcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiAxLCBpdGVtczogW10gfSxcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiAxLCBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEwIH1dIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMiwgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxMCB9LCB7IGlkOiAnYicsIHZhbHVlOiAyMCB9XSB9LFxuXHRcdFx0XHR7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDIsIGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMTAgfV0gfSwgLy8gUmVtb3ZlIGl0ZW1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNpbXVsYXRlRmlsZVJvdW5kdHJpcChhZGFwdGVyLCBpbml0aWFsLCB1cGRhdGVzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB1cGRhdGVzW3VwZGF0ZXMubGVuZ3RoIC0gMV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGFjdHMgbG9nIHdoZW4gZW50cnkgY291bnQgZXhjZWVkcyB0aHJlc2hvbGQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSwgMyk7IC8vIENvbXBhY3QgYWZ0ZXIgMyBlbnRyaWVzXG5cblx0XHRcdGNvbnN0IG9iajogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdIH07XG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwob2JqKTsgLy8gRW50cnkgMVxuXG5cdFx0XHRhZGFwdGVyLndyaXRlKHsgLi4ub2JqLCBjb3VudDogMSB9KTsgLy8gRW50cnkgMlxuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHRcdGFkYXB0ZXIud3JpdGUoeyAuLi5vYmosIGNvdW50OiAyIH0pOyAvLyBFbnRyeSAzXG5cdFx0XHRhZGFwdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXG5cdFx0XHRjb25zdCBiZWZvcmUgPSBhZGFwdGVyLndyaXRlKHsgLi4ub2JqLCBjb3VudDogMyB9KTtcblx0XHRcdGFkYXB0ZXIuY29uZmlybVdyaXRlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlLm9wLCAnYXBwZW5kJyk7XG5cblx0XHRcdC8vIFRoaXMgc2hvdWxkIHRyaWdnZXIgY29tcGFjdGlvblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDQgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm9wLCAncmVwbGFjZScpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGNvbXBhY3RlZCBsb2cgb25seSBoYXMgaW5pdGlhbCBlbnRyeVxuXHRcdFx0Y29uc3QgbGluZXMgPSByZXN1bHQuZGF0YS50b1N0cmluZygpLnNwbGl0KCdcXG4nKS5maWx0ZXIobCA9PiBsLnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShsaW5lc1swXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMCk7IC8vIEVudHJ5S2luZC5Jbml0aWFsXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGRlZXBDb21wYXJlIHByb3BlcnR5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IG9iajogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdLCBtZXRhZGF0YTogeyB0YWdzOiBbJ2EnXSB9IH07XG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwob2JqKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZDogVGVzdE9iamVjdCA9IHsgLi4ub2JqLCBtZXRhZGF0YTogeyB0YWdzOiBbJ2EnLCAnYiddIH0gfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUodXBkYXRlZCk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YS50b1N0cmluZygpLnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMSk7IC8vIEVudHJ5S2luZC5TZXRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkuaywgWydtZXRhZGF0YSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkudiwgeyB0YWdzOiBbJ2EnLCAnYiddIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBkaWZmZXJlbnRpYXRlZCBwcm9wZXJ0eSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2NoZW1hIHdpdGggYSBkaWZmZXJlbnRpYXRlZCB0cmFuc2Zvcm0gdGhhdCBleHRyYWN0cyBhIHN0cmluZ1xuXHRcdFx0Ly8gYnV0IHVzZXMgYSBjdXN0b20gZXF1YWxzIHRoYXQgb25seSBjaGVja3MgdGhlIHByZWZpeFxuXHRcdFx0aW50ZXJmYWNlIERpZmZPYmoge1xuXHRcdFx0XHRkYXRhOiB7IHR5cGU6IHN0cmluZzsgdmVyc2lvbjogbnVtYmVyIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBBZGFwdC5vYmplY3Q8RGlmZk9iaiwgeyBkYXRhOiBzdHJpbmcgfT4oe1xuXHRcdFx0XHRkYXRhOiBBZGFwdC50KFxuXHRcdFx0XHRcdG8gPT4gby5kYXRhLFxuXHRcdFx0XHRcdEFkYXB0LnY8eyB0eXBlOiBzdHJpbmc7IHZlcnNpb246IG51bWJlciB9LCBzdHJpbmc+KFxuXHRcdFx0XHRcdFx0b2JqID0+IGAke29iai50eXBlfToke29iai52ZXJzaW9ufWAsXG5cdFx0XHRcdFx0XHQoYSwgYikgPT4gYS5zcGxpdCgnOicpWzBdID09PSBiLnNwbGl0KCc6JylbMF0sIC8vIGNvbXBhcmUgb25seSB0aGUgdHlwZSBwcmVmaXhcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlOiAnZm9vOjEnXG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwoeyBkYXRhOiB7IHR5cGU6ICdmb28nLCB2ZXJzaW9uOiAxIH0gfSk7XG5cblx0XHRcdC8vIENoYW5nZSB0eXBlIGZyb20gJ2ZvbycgdG8gJ2JhcicgLSBzaG91bGQgZGV0ZWN0IGNoYW5nZSAoZGlmZmVyZW50IHByZWZpeClcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhZGFwdGVyLndyaXRlKHsgZGF0YTogeyB0eXBlOiAnYmFyJywgdmVyc2lvbjogMiB9IH0pO1xuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQxLmRhdGEudG9TdHJpbmcoKSwgJycsICdkaWZmZXJlbnQgdHlwZSBzaG91bGQgdHJpZ2dlciBjaGFuZ2UnKTtcblx0XHRcdGNvbnN0IGVudHJ5MSA9IEpTT04ucGFyc2UocmVzdWx0MS5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeTEua2luZCwgMSk7IC8vIEVudHJ5S2luZC5TZXRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkxLmssIFsnZGF0YSddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeTEudiwgJ2JhcjoyJyk7XG5cblx0XHRcdC8vIENoYW5nZSB2ZXJzaW9uIGJ1dCBrZWVwIHR5cGUgJ2JhcicgLSBzaG91bGQgTk9UIGRldGVjdCBjaGFuZ2UgKHNhbWUgcHJlZml4KVxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGFkYXB0ZXIud3JpdGUoeyBkYXRhOiB7IHR5cGU6ICdiYXInLCB2ZXJzaW9uOiAzIH0gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5kYXRhLnRvU3RyaW5nKCksICcnLCAnc2FtZSB0eXBlIHByZWZpeCBzaG91bGQgbm90IHRyaWdnZXIgY2hhbmdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkIHRocm93cyBvbiBlbXB0eSBsb2cgZmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhZGFwdGVyLnJlYWQoVlNCdWZmZXIuZnJvbVN0cmluZygnJykpLCAvRW1wdHkgbG9nIGZpbGUvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlIHdpdGhvdXQgcHJpb3IgcmVhZCBjcmVhdGVzIGluaXRpYWwgZW50cnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IG9iajogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogNSwgaXRlbXM6IFtdIH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKG9iaik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3AsICdyZXBsYWNlJyk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IEpTT04ucGFyc2UocmVzdWx0LmRhdGEudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIDApOyAvLyBFbnRyeUtpbmQuSW5pdGlhbFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VhbGVkIG9iamVjdHMgc2tpcCBub24ta2V5IGZpZWxkIGNvbXBhcmlzb24gd2hlbiBib3RoIGFyZSBzZWFsZWQnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkSXRlbSB7XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRcdHZhbHVlOiBudW1iZXI7XG5cdFx0XHRcdGlzU2VhbGVkOiBib29sZWFuO1xuXHRcdFx0fVxuXG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkVGVzdE9iamVjdCB7XG5cdFx0XHRcdGl0ZW1zOiBTZWFsZWRJdGVtW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkSXRlbSwgU2VhbGVkSXRlbT4oe1xuXHRcdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdFx0dmFsdWU6IEFkYXB0LnQoaSA9PiBpLnZhbHVlLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdFx0aXNTZWFsZWQ6IEFkYXB0LnQoaSA9PiBpLmlzU2VhbGVkLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VhbGVkOiAob2JqKSA9PiBvYmouaXNTZWFsZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2NoZW1hID0gQWRhcHQub2JqZWN0PFNlYWxlZFRlc3RPYmplY3QsIFNlYWxlZFRlc3RPYmplY3Q+KHtcblx0XHRcdFx0aXRlbXM6IEFkYXB0LnQobyA9PiBvLml0ZW1zLCBBZGFwdC5hcnJheShpdGVtU2NoZW1hKSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlIHdpdGggYSBzZWFsZWQgaXRlbVxuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKHsgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxLCBpc1NlYWxlZDogdHJ1ZSB9XSB9KTtcblxuXHRcdFx0Ly8gQ2hhbmdlIHZhbHVlIG9uIHNlYWxlZCBpdGVtIC0gc2hvdWxkIE5PVCBiZSBkZXRlY3RlZCBiZWNhdXNlIGJvdGggYXJlIHNlYWxlZFxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGFkYXB0ZXIud3JpdGUoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDk5OSwgaXNTZWFsZWQ6IHRydWUgfV0gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5kYXRhLnRvU3RyaW5nKCksICcnLCAnc2VhbGVkIGl0ZW0gdmFsdWUgY2hhbmdlIHNob3VsZCBiZSBpZ25vcmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWFsZWQgb2JqZWN0cyBzdGlsbCBkZXRlY3Qga2V5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkSXRlbSB7XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRcdHZhbHVlOiBudW1iZXI7XG5cdFx0XHRcdGlzU2VhbGVkOiBib29sZWFuO1xuXHRcdFx0fVxuXG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkVGVzdE9iamVjdCB7XG5cdFx0XHRcdGl0ZW1zOiBTZWFsZWRJdGVtW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkSXRlbSwgU2VhbGVkSXRlbT4oe1xuXHRcdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdFx0dmFsdWU6IEFkYXB0LnQoaSA9PiBpLnZhbHVlLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdFx0aXNTZWFsZWQ6IEFkYXB0LnQoaSA9PiBpLmlzU2VhbGVkLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VhbGVkOiAob2JqKSA9PiBvYmouaXNTZWFsZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2NoZW1hID0gQWRhcHQub2JqZWN0PFNlYWxlZFRlc3RPYmplY3QsIFNlYWxlZFRlc3RPYmplY3Q+KHtcblx0XHRcdFx0aXRlbXM6IEFkYXB0LnQobyA9PiBvLml0ZW1zLCBBZGFwdC5hcnJheShpdGVtU2NoZW1hKSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlIHdpdGggYSBzZWFsZWQgaXRlbVxuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKHsgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxLCBpc1NlYWxlZDogdHJ1ZSB9XSB9KTtcblxuXHRcdFx0Ly8gQ2hhbmdlIGtleSBvbiBzZWFsZWQgaXRlbSAtIFNIT1VMRCBiZSBkZXRlY3RlZCAocmVwbGFjZW1lbnQpXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKHsgaXRlbXM6IFt7IGlkOiAnYicsIHZhbHVlOiAxLCBpc1NlYWxlZDogdHJ1ZSB9XSB9KTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQuZGF0YS50b1N0cmluZygpLCAnJywgJ2tleSBjaGFuZ2Ugc2hvdWxkIGJlIGRldGVjdGVkIGV2ZW4gd2hlbiBzZWFsZWQnKTtcblxuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAyKTsgLy8gRW50cnlLaW5kLlB1c2ggKGFycmF5IHJlcGxhY2VtZW50KVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VhbGVkIG9iamVjdHMgZGlmZiBub3JtYWxseSB3aGVuIG9uZSBpcyBub3Qgc2VhbGVkJywgKCkgPT4ge1xuXHRcdFx0aW50ZXJmYWNlIFNlYWxlZEl0ZW0ge1xuXHRcdFx0XHRpZDogc3RyaW5nO1xuXHRcdFx0XHR2YWx1ZTogbnVtYmVyO1xuXHRcdFx0XHRpc1NlYWxlZDogYm9vbGVhbjtcblx0XHRcdH1cblxuXHRcdFx0aW50ZXJmYWNlIFNlYWxlZFRlc3RPYmplY3Qge1xuXHRcdFx0XHRpdGVtczogU2VhbGVkSXRlbVtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtU2NoZW1hID0gQWRhcHQub2JqZWN0PFNlYWxlZEl0ZW0sIFNlYWxlZEl0ZW0+KHtcblx0XHRcdFx0aWQ6IEFkYXB0LnQoaSA9PiBpLmlkLCBBZGFwdC5rZXkoKSksXG5cdFx0XHRcdHZhbHVlOiBBZGFwdC50KGkgPT4gaS52YWx1ZSwgQWRhcHQudmFsdWUoKSksXG5cdFx0XHRcdGlzU2VhbGVkOiBBZGFwdC50KGkgPT4gaS5pc1NlYWxlZCwgQWRhcHQudmFsdWUoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNlYWxlZDogKG9iaikgPT4gb2JqLmlzU2VhbGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNjaGVtYSA9IEFkYXB0Lm9iamVjdDxTZWFsZWRUZXN0T2JqZWN0LCBTZWFsZWRUZXN0T2JqZWN0Pih7XG5cdFx0XHRcdGl0ZW1zOiBBZGFwdC50KG8gPT4gby5pdGVtcywgQWRhcHQuYXJyYXkoaXRlbVNjaGVtYSkpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Ly8gSW5pdGlhbCBzdGF0ZSB3aXRoIGEgbm9uLXNlYWxlZCBpdGVtXG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEsIGlzU2VhbGVkOiBmYWxzZSB9XSB9KTtcblxuXHRcdFx0Ly8gQ2hhbmdlIHZhbHVlIC0gc2hvdWxkIGJlIGRldGVjdGVkIHNpbmNlIHByZXYgaXMgbm90IHNlYWxlZFxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGFkYXB0ZXIud3JpdGUoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDk5OSwgaXNTZWFsZWQ6IGZhbHNlIH1dIH0pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDEuZGF0YS50b1N0cmluZygpLCAnJywgJ25vbi1zZWFsZWQgaXRlbSBzaG91bGQgZGV0ZWN0IHZhbHVlIGNoYW5nZScpO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IEpTT04ucGFyc2UocmVzdWx0MS5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAxKTsgLy8gRW50cnlLaW5kLlNldFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5rLCBbJ2l0ZW1zJywgMCwgJ3ZhbHVlJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnYsIDk5OSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWFsZWQgdHJhbnNpdGlvbiBmcm9tIHVuc2VhbGVkIHRvIHNlYWxlZCBkZXRlY3RzIGZpbmFsIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkSXRlbSB7XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRcdHZhbHVlOiBudW1iZXI7XG5cdFx0XHRcdGlzU2VhbGVkOiBib29sZWFuO1xuXHRcdFx0fVxuXG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkVGVzdE9iamVjdCB7XG5cdFx0XHRcdGl0ZW1zOiBTZWFsZWRJdGVtW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkSXRlbSwgU2VhbGVkSXRlbT4oe1xuXHRcdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdFx0dmFsdWU6IEFkYXB0LnQoaSA9PiBpLnZhbHVlLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdFx0aXNTZWFsZWQ6IEFkYXB0LnQoaSA9PiBpLmlzU2VhbGVkLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VhbGVkOiAob2JqKSA9PiBvYmouaXNTZWFsZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2NoZW1hID0gQWRhcHQub2JqZWN0PFNlYWxlZFRlc3RPYmplY3QsIFNlYWxlZFRlc3RPYmplY3Q+KHtcblx0XHRcdFx0aXRlbXM6IEFkYXB0LnQobyA9PiBvLml0ZW1zLCBBZGFwdC5hcnJheShpdGVtU2NoZW1hKSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlIHdpdGggYSBub24tc2VhbGVkIGl0ZW1cblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbCh7IGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMSwgaXNTZWFsZWQ6IGZhbHNlIH1dIH0pO1xuXG5cdFx0XHQvLyBUcmFuc2l0aW9uIHRvIHNlYWxlZCB3aXRoIHZhbHVlIGNoYW5nZSAtIHNob3VsZCBkZXRlY3QgY2hhbmdlcyBzaW5jZSBwcmV2IHdhcyBub3Qgc2VhbGVkXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKHsgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiA5OTksIGlzU2VhbGVkOiB0cnVlIH1dIH0pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCksICcnLCAndHJhbnNpdGlvbiB0byBzZWFsZWQgc2hvdWxkIGRldGVjdCB2YWx1ZSBjaGFuZ2UnKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdHdvIGVudHJpZXMgLSBvbmUgZm9yIHZhbHVlLCBvbmUgZm9yIGlzU2VhbGVkXG5cdFx0XHRjb25zdCBsaW5lcyA9IHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpLnNwbGl0KCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lcy5sZW5ndGgsIDIsICdzaG91bGQgaGF2ZSB0d28gY2hhbmdlIGVudHJpZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlIGRldGVjdHMgcHJvcGVydHkgc2V0IHRvIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3QgaW5pdGlhbDogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogNSwgaXRlbXM6IFtdLCBtZXRhZGF0YTogeyB0YWdzOiBbJ2ZvbyddIH0gfTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2ltdWxhdGVGaWxlUm91bmR0cmlwKGFkYXB0ZXIsIGluaXRpYWwsIFtcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiAxMCwgaXRlbXM6IFtdLCBtZXRhZGF0YTogeyB0YWdzOiBbJ2ZvbyddIH0gfSxcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiB1bmRlZmluZWQsIGl0ZW1zOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBuYW1lOiAndGVzdCcsIGNvdW50OiB1bmRlZmluZWQsIGl0ZW1zOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IHNpbXVsYXRlRmlsZVJvdW5kdHJpcChhZGFwdGVyLCBpbml0aWFsLCBbXG5cdFx0XHRcdHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMTAsIGl0ZW1zOiBbXSwgbWV0YWRhdGE6IHsgdGFnczogWydmb28nXSB9IH0sXG5cdFx0XHRcdHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogdW5kZWZpbmVkLCBpdGVtczogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiAxMiwgaXRlbXM6IFtdLCBtZXRhZGF0YTogeyB0YWdzOiBbJ2JhciddIH0gfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDEyLCBpdGVtczogW10sIG1ldGFkYXRhOiB7IHRhZ3M6IFsnYmFyJ10gfSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZSBmb2xsb3dlZCBieSBzZXQgcmVzdG9yZXMgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBpbml0aWFsOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10sIG1ldGFkYXRhOiB7IHRhZ3M6IFsnYSddIH0gfTtcblxuXHRcdFx0Ly8gQnVpbGQgbG9nIHdpdGggZGVsZXRlIHRoZW4gc2V0XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gW1xuXHRcdFx0XHR7IGtpbmQ6IDAsIHY6IGluaXRpYWwgfSxcblx0XHRcdFx0eyBraW5kOiAzLCBrOiBbJ21ldGFkYXRhJ10gfSwgLy8gRGVsZXRlXG5cdFx0XHRcdHsga2luZDogMSwgazogWydtZXRhZGF0YSddLCB2OiB7IHRhZ3M6IFsnYicsICdjJ10gfSB9LCAvLyBTZXQgdG8gbmV3IHZhbHVlXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbG9nQ29udGVudCA9IGVudHJpZXMubWFwKGUgPT4gSlNPTi5zdHJpbmdpZnkoZSkpLmpvaW4oJ1xcbicpICsgJ1xcbic7XG5cblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIucmVhZChWU0J1ZmZlci5mcm9tU3RyaW5nKGxvZ0NvbnRlbnQpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIHsgdGFnczogWydiJywgJ2MnXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlIHdpdGhvdXQgY29uZmlybVdyaXRlIHJlc2V0cyB0byBpbml0aWFsIG9uIG5leHQgd3JpdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IG9iajogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdIH07XG5cblx0XHRcdC8vIEZpcnN0IHdyaXRlIChubyBjcmVhdGVJbml0aWFsKSBcdTIwMTQgcHJvZHVjZXMgSW5pdGlhbCByZXBsYWNlXG5cdFx0XHRjb25zdCByZXN1bHQxID0gYWRhcHRlci53cml0ZShvYmopO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEub3AsICdyZXBsYWNlJyk7XG5cdFx0XHQvLyBEbyBOT1QgY29uZmlybSBcdTIwMTQgc2ltdWxhdGVzIGEgZmFpbGVkIHBlcnNpc3RcblxuXHRcdFx0Ly8gTmV4dCB3cml0ZSBzaG91bGQgcHJvZHVjZSBhIGZ1bGwgcmVwbGFjZSBhZ2FpbiBzaW5jZSBzdGF0ZSB3YXMgbm90IGNvbW1pdHRlZFxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGFkYXB0ZXIud3JpdGUoeyAuLi5vYmosIGNvdW50OiAyIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBvcDogcmVzdWx0Mi5vcCwgZW50cnk6IEpTT04ucGFyc2UocmVzdWx0Mi5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKSB9LFxuXHRcdFx0XHR7IG9wOiAncmVwbGFjZScsIGVudHJ5OiB7IGtpbmQ6IDAsIHY6IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMiwgaXRlbXM6IFtdIH0gfSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmZpcm1Xcml0ZSBjb21taXRzIHN0YXRlIHNvIG5leHQgd3JpdGUgaXMgaW5jcmVtZW50YWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IG9iajogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdIH07XG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwob2JqKTtcblxuXHRcdFx0YWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDEgfSk7XG5cdFx0XHRhZGFwdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXG5cdFx0XHQvLyBOZXh0IHdyaXRlIHNob3VsZCBiZSBhbiBpbmNyZW1lbnRhbCBhcHBlbmRcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUoeyAuLi5vYmosIGNvdW50OiAyIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBvcDogcmVzdWx0Lm9wLCBlbnRyeTogSlNPTi5wYXJzZShyZXN1bHQuZGF0YS50b1N0cmluZygpLnRyaW0oKSkgfSxcblx0XHRcdFx0eyBvcDogJ2FwcGVuZCcsIGVudHJ5OiB7IGtpbmQ6IDEsIGs6IFsnY291bnQnXSwgdjogMiB9IH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZCB0aHJvd3Mgb24gbG9nIGZpbGUgbWlzc2luZyBpbml0aWFsIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBsb2dDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoeyBraW5kOiAxLCBrOiBbJ2NvdW50J10sIHY6IDUgfSkgKyAnXFxuJztcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYWRhcHRlci5yZWFkKFZTQnVmZmVyLmZyb21TdHJpbmcobG9nQ29udGVudCkpLCAvbWlzc2luZyBhbiBpbml0aWFsIGVudHJ5Lyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWlsZWQgZmlyc3Qgd3JpdGUgZm9sbG93ZWQgYnkgc3VjY2Vzc2Z1bCB3cml0ZSBwcm9kdWNlcyB2YWxpZCByb3VuZHRyaXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IGluaXRpYWw6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbXSB9O1xuXG5cdFx0XHQvLyBGaXJzdCB3cml0ZSBcImZhaWxzXCIgXHUyMDE0IGRhdGEgbm90IHBlcnNpc3RlZCwgbm8gY29uZmlybVdyaXRlXG5cdFx0XHRjb25zdCByMSA9IGFkYXB0ZXIud3JpdGUoaW5pdGlhbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjEub3AsICdyZXBsYWNlJyk7XG5cdFx0XHQvLyBza2lwIGNvbmZpcm1Xcml0ZSBcdTIwMTQgc2ltdWxhdGVzIGZhaWxlZCBwZXJzaXN0XG5cblx0XHRcdC8vIFNlY29uZCB3cml0ZSByZWNvdmVycyBcdTIwMTQgcHJvZHVjZXMgYSBmdWxsIHJlcGxhY2UgYWdhaW5cblx0XHRcdGNvbnN0IHIyID0gYWRhcHRlci53cml0ZSh7IC4uLmluaXRpYWwsIGNvdW50OiAzIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIyLm9wLCAncmVwbGFjZScpO1xuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gcjIuZGF0YTtcblxuXHRcdFx0Ly8gUmVhZCBiYWNrIHNob3VsZCBnaXZlIHRoZSBsYXN0IGNvbW1pdHRlZCBzdGF0ZVxuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKGNyZWF0ZVRlc3RTY2hlbWEoKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZWFkZXIucmVhZChmaWxlQ29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvdW50LCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuY29uZmlybWVkIGFwcGVuZCBhZnRlciBjcmVhdGVJbml0aWFsIHN0aWxsIGRpZmZzIGFnYWluc3QgaW5pdGlhbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGxldCBmaWxlQ29udGVudCA9IGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChvYmopO1xuXG5cdFx0XHQvLyBXcml0ZSBidXQgZG8gTk9UIGNvbmZpcm1cblx0XHRcdGNvbnN0IHIxID0gYWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDEgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjEub3AsICdhcHBlbmQnKTtcblx0XHRcdC8vIHNraXAgY29uZmlybVdyaXRlIFx1MjAxNCBzaW11bGF0ZXMgZmFpbGVkIHBlcnNpc3QsIGRhdGEgbm90IGFwcGVuZGVkIHRvIGZpbGVcblxuXHRcdFx0Ly8gTmV4dCB3cml0ZSBkaWZmcyBhZ2FpbnN0IHRoZSBjcmVhdGVJbml0aWFsIHN0YXRlIChjb3VudDogMClcblx0XHRcdGNvbnN0IHIyID0gYWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDIgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjIub3AsICdhcHBlbmQnKTtcblx0XHRcdGFkYXB0ZXIuY29uZmlybVdyaXRlKCk7XG5cdFx0XHRmaWxlQ29udGVudCA9IFZTQnVmZmVyLmNvbmNhdChbZmlsZUNvbnRlbnQsIHIyLmRhdGFdKTtcblxuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKGNyZWF0ZVRlc3RTY2hlbWEoKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZWFkZXIucmVhZChmaWxlQ29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvdW50LCAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BlcnNpc3RlbmNlIHNpemUgc2FmZXR5IG5ldCcsICgpID0+IHtcblx0XHR0ZXN0KCdtYWtlVHJ1bmNhdGluZ1JlcGxhY2VyIHRydW5jYXRlcyBhbiBvdmVyc2l6ZWQgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmlnID0gJ3gnLnJlcGVhdCgyICogMTAyNCAqIDEwMjQpO1xuXHRcdFx0Y29uc3Qgb2JqID0geyBjb250ZW50OiBiaWcsIGxhYmVsOiAnb2snIH07XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkob2JqLCBBZGFwdC5tYWtlVHJ1bmNhdGluZ1JlcGxhY2VyKDEwMjQgKiAxMDI0LCAxMCAqIDEwMjQgKiAxMDI0KSk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb24pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHBhcnNlZC5jb250ZW50LCBiaWcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnNlZC5jb250ZW50LnN0YXJ0c1dpdGgoJ1tWUyBDb2RlOicpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQubGFiZWwsICdvaycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFrZVRydW5jYXRpbmdSZXBsYWNlciByZXNwZWN0cyB0b3RhbCBidWRnZXQgd2l0aG91dCBvdmVyc2hvb3RpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBTVFJJTkdfQ0FQID0gMTAyNCAqIDEwMjQ7XG5cdFx0XHRjb25zdCBUT1RBTF9DQVAgPSAxMDI0ICogMTAyNDtcblx0XHRcdGNvbnN0IG1lZGl1bSA9ICd5Jy5yZXBlYXQoMjAwICogMTAyNCk7IC8vIHVuZGVyIHBlci1zdHJpbmcgY2FwXG5cdFx0XHRjb25zdCBvYmo6IGFueSA9IHt9O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMDsgaSsrKSB7XG5cdFx0XHRcdG9ialtgayR7aX1gXSA9IG1lZGl1bTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShvYmosIEFkYXB0Lm1ha2VUcnVuY2F0aW5nUmVwbGFjZXIoU1RSSU5HX0NBUCwgVE9UQUxfQ0FQKSk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb24pO1xuXHRcdFx0Ly8gU3VtIG9mIHByZXNlcnZlZCBzdHJpbmdzIG11c3Qgbm90IGV4Y2VlZCB0aGUgdG90YWwgYnVkZ2V0LlxuXHRcdFx0Y29uc3QgcHJlc2VydmVkQ2hhcnMgPSBPYmplY3QudmFsdWVzKHBhcnNlZClcblx0XHRcdFx0LmZpbHRlcigodik6IHYgaXMgc3RyaW5nID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiB2ID09PSBtZWRpdW0pXG5cdFx0XHRcdC5yZWR1Y2UoKHN1bSwgdikgPT4gc3VtICsgdi5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0Lm9rKHByZXNlcnZlZENoYXJzIDw9IFRPVEFMX0NBUCwgYHByZXNlcnZlZCAke3ByZXNlcnZlZENoYXJzfSBjaGFycyBleGNlZWRlZCBidWRnZXQgJHtUT1RBTF9DQVB9YCk7XG5cdFx0XHQvLyBMZWFkaW5nIGtleXMgaW50YWN0LCBsYXRlciByZXBsYWNlZCB3aXRoIHRvdGFsLWJ1ZGdldCBtYXJrZXJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuazAsIG1lZGl1bSk7XG5cdFx0XHRhc3NlcnQub2soT2JqZWN0LnZhbHVlcyhwYXJzZWQpLnNvbWUodiA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgJiYgKHYgYXMgc3RyaW5nKS5pbmNsdWRlcygnZW50cnkgZXhjZWVkZWQgc2l6ZSBidWRnZXQnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2sgc3VjY2VlZHMgd2l0aCBubyBvdmVyaGVhZCBvbiBzbWFsbCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB7IGtpbmQ6IDAsIHY6IHsgZm9vOiAnYmFyJywgbjogNDIgfSB9O1xuXHRcdFx0Y29uc3Qgb3V0ID0gQWRhcHQuc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2soZW50cnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dCwgSlNPTi5zdHJpbmdpZnkoZW50cnkpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrIHJldGhyb3dzIG5vbi1SYW5nZUVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2lyY3VsYXI6IGFueSA9IHt9O1xuXHRcdFx0Y2lyY3VsYXIuc2VsZiA9IGNpcmN1bGFyOyAvLyBKU09OLnN0cmluZ2lmeSB0aHJvd3MgVHlwZUVycm9yIG9uIGNpcmN1bGFyc1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBBZGFwdC5zdHJpbmdpZnlFbnRyeVdpdGhGYWxsYmFjayhjaXJjdWxhciksIFR5cGVFcnJvcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpbmdpZnlFbnRyeVdpdGhGYWxsYmFjayByZWNvdmVycyB3aGVuIEpTT04uc3RyaW5naWZ5IHRocm93cyBSYW5nZUVycm9yJywgKCkgPT4ge1xuXHRcdFx0Ly8gVXNlIHRvSlNPTiB0byBmb3JjZSBhIFJhbmdlRXJyb3Igb24gdGhlIGZpcnN0IHN0cmluZ2lmeSBwYXNzLFxuXHRcdFx0Ly8gdGhlbiBzdWNjZWVkIG9uIHRoZSByZXRyeS4gQXZvaWRzIG5lZWRpbmcgNTAwKyBNaUIgb2YgYWxsb2NhdGlvbnMuXG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgZW50cnkgPSB7XG5cdFx0XHRcdHRvSlNPTigpIHtcblx0XHRcdFx0XHRjYWxscysrO1xuXHRcdFx0XHRcdGlmIChjYWxscyA9PT0gMSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgc3RyaW5nIGxlbmd0aCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiAncmVjb3ZlcmVkJyB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG91dCA9IEFkYXB0LnN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKGVudHJ5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMiwgJ3Nob3VsZCBoYXZlIGJlZW4gY2FsbGVkIHR3aWNlIChpbml0aWFsICsgcmV0cnkpJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2Uob3V0KSwgeyBjb250ZW50OiAncmVjb3ZlcmVkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrIGFwcGxpZXMgdHJ1bmNhdGluZyByZXBsYWNlciBvbiBSYW5nZUVycm9yIHJldHJ5JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2FtZSB0cmljaywgYnV0IHRoZSByZWNvdmVyZWQgcGF5bG9hZCBjb250YWlucyBhbiBvdmVyc2l6ZWRcblx0XHRcdC8vIHN0cmluZyB0aGF0IG11c3QgYmUgdHJ1bmNhdGVkIGJ5IHRoZSByZXBsYWNlciBvbiB0aGUgcmV0cnkuXG5cdFx0XHRjb25zdCBiaWcgPSAneCcucmVwZWF0KDIgKiAxMDI0ICogMTAyNCk7IC8vIDIgTWlCLCBvdmVyIHRoZSAxIE1pQiBwZXItc3RyaW5nIGNhcFxuXHRcdFx0bGV0IGNhbGxzID0gMDtcblx0XHRcdGNvbnN0IGVudHJ5ID0ge1xuXHRcdFx0XHR0b0pTT04oKSB7XG5cdFx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdFx0XHRpZiAoY2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHN0cmluZyBsZW5ndGgnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogYmlnLCBsYWJlbDogJ29rJyB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG91dCA9IEFkYXB0LnN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKGVudHJ5KTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2Uob3V0KTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChwYXJzZWQuY29udGVudCwgYmlnKTtcblx0XHRcdGFzc2VydC5vayhwYXJzZWQuY29udGVudC5zdGFydHNXaXRoKCdbVlMgQ29kZTonKSwgYHVuZXhwZWN0ZWQ6ICR7cGFyc2VkLmNvbnRlbnQuc2xpY2UoMCwgODApfWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sYWJlbCwgJ29rJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWVwQ2xvbmVXaXRoRmFsbGJhY2sgcmV0dXJucyBhIHN0cnVjdHVyYWwgY2xvbmUgb24gdGhlIGNvbW1vbiBwYXRoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSB7IGE6IDEsIG5lc3RlZDogeyBiOiAndHdvJywgbGlzdDogWzEsIDIsIDNdIH0gfTtcblx0XHRcdGNvbnN0IGNsb25lID0gQWRhcHQuZGVlcENsb25lV2l0aEZhbGxiYWNrKG9yaWdpbmFsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvbmUsIG9yaWdpbmFsKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjbG9uZSwgb3JpZ2luYWwpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNsb25lLm5lc3RlZCwgb3JpZ2luYWwubmVzdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZXBDbG9uZVdpdGhGYWxsYmFjayByZWNvdmVycyBmcm9tIFJhbmdlRXJyb3IgZHVyaW5nIHRoZSBjbG9uZScsICgpID0+IHtcblx0XHRcdC8vIFRoZSB2YWx1ZSgpIHRyYW5zZm9ybSBkZWVwLWNsb25lcyBleHRyYWN0ZWQgb2JqZWN0cyBvbiBldmVyeSB3cml0ZSxcblx0XHRcdC8vICpiZWZvcmUqIGFueSBlbnRyeSBpcyBzZXJpYWxpemVkLiBBIHNpbmdsZSBvdmVyc2l6ZWQgZmllbGQgdXNlZCB0b1xuXHRcdFx0Ly8gdGhyb3cgUmFuZ2VFcnJvciBoZXJlIGFuZCBsb3NlIHRoZSB3aG9sZSBzZXNzaW9uICgjMzIyMzY0KS4gVGhlIGNsb25lXG5cdFx0XHQvLyBtdXN0IGluc3RlYWQgdHJ1bmNhdGUgYW5kIHN1Y2NlZWQuXG5cdFx0XHRjb25zdCBiaWcgPSAneCcucmVwZWF0KDIgKiAxMDI0ICogMTAyNCk7IC8vIDIgTWlCLCBvdmVyIHRoZSAxIE1pQiBwZXItc3RyaW5nIGNhcFxuXHRcdFx0bGV0IGNhbGxzID0gMDtcblx0XHRcdGNvbnN0IHZhbHVlOiB7IGh1Z2U6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgdG9KU09OKCk6IHsgaHVnZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH0gfSA9IHtcblx0XHRcdFx0aHVnZTogYmlnLFxuXHRcdFx0XHRsYWJlbDogJ29rJyxcblx0XHRcdFx0dG9KU09OKCkge1xuXHRcdFx0XHRcdGNhbGxzKys7XG5cdFx0XHRcdFx0aWYgKGNhbGxzID09PSAxKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCBzdHJpbmcgbGVuZ3RoJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IGh1Z2U6IGJpZywgbGFiZWw6ICdvaycgfTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjbG9uZSA9IEFkYXB0LmRlZXBDbG9uZVdpdGhGYWxsYmFjayh2YWx1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDIsICdzaG91bGQgaGF2ZSBiZWVuIGNhbGxlZCB0d2ljZSAoaW5pdGlhbCArIHJldHJ5KScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmxhYmVsLCAnb2snKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjbG9uZS5odWdlLCBiaWcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNsb25lLmh1Z2Uuc3RhcnRzV2l0aCgnW1ZTIENvZGU6JyksIGB1bmV4cGVjdGVkOiAke2Nsb25lLmh1Z2Uuc2xpY2UoMCwgODApfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsdWUoKS5leHRyYWN0IHJlY292ZXJzIHdoZW4gdGhlIGRlZXAtY2xvbmUgdGhyb3dzIFJhbmdlRXJyb3InLCAoKSA9PiB7XG5cdFx0XHQvLyBFbmQtdG8tZW5kOiBhbiBvdmVyc2l6ZWQgb2JqZWN0IGZsb3dpbmcgdGhyb3VnaCBhIHZhbHVlKCkgdHJhbnNmb3JtXG5cdFx0XHQvLyAoYXMgSUNoYXRBZ2VudFJlc3VsdC5tZXRhZGF0YS50b29sQ2FsbFJlc3VsdHMgZG9lcykgbXVzdCBub3QgdGhyb3cuXG5cdFx0XHRjb25zdCBiaWcgPSAneCcucmVwZWF0KDIgKiAxMDI0ICogMTAyNCk7XG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgaHVnZSA9IHtcblx0XHRcdFx0a2VwdDogJ21ldGEnLFxuXHRcdFx0XHR0b0pTT04oKSB7XG5cdFx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdFx0XHRpZiAoY2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHN0cmluZyBsZW5ndGgnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgZHVtcDogYmlnLCBrZXB0OiAnbWV0YScgfTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm0gPSBBZGFwdC52YWx1ZTx0eXBlb2YgaHVnZSwgeyBkdW1wOiBzdHJpbmc7IGtlcHQ6IHN0cmluZyB9PigoYSwgYikgPT4gYS5kdW1wID09PSBiLmR1bXAgJiYgYS5rZXB0ID09PSBiLmtlcHQpO1xuXHRcdFx0Y29uc3QgZXh0cmFjdGVkID0gdHJhbnNmb3JtLmV4dHJhY3QoaHVnZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RlZC5rZXB0LCAnbWV0YScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHJhY3RlZC5kdW1wLnN0YXJ0c1dpdGgoJ1tWUyBDb2RlOicpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGNBQWM7QUFDdkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0IsMEJBQTBCO0FBQ3pELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCO0FBQzFC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
