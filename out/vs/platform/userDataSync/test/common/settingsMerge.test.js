import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { addSetting, merge, updateIgnoredSettings } from "../../common/settingsMerge.js";
const formattingOptions = { eol: "\n", insertSpaces: false, tabSize: 4 };
suite("SettingsMerge - Merge", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge when local and remote are same with one entry", async () => {
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({ "a": 1 });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local and remote are same with multiple entries", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local and remote are same with multiple entries in different order", async () => {
    const localContent = stringify({
      "b": 2,
      "a": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(actual.conflictsSettings.length, 0);
  });
  test("merge when local and remote are same with different base content", async () => {
    const localContent = stringify({
      "b": 2,
      "a": 1
    });
    const baseContent = stringify({
      "a": 2,
      "b": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(actual.hasConflicts);
  });
  test("merge when a new entry is added to remote", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when multiple new entries are added to remote", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when multiple new entries are added to remote from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "b": 2,
      "a": 1,
      "c": 3
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is removed from remote from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when all entries are removed from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({});
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is updated in remote from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 2
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with multiple changes and local stays with base", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with order changes and local stays with base", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 2,
      "d": 4,
      "c": 3,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with comment changes and local stays with base", async () => {
    const localContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const remoteContent = stringify`
{
	// comment b has changed
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with comment and order changes and local stays with base", async () => {
    const localContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const remoteContent = stringify`
{
	// this is comment for c
	"c": 1,
	// comment b has changed
	"b": 2,
}`;
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when a new entries are added to local", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when multiple new entries are added to local from base and remote is not changed", async () => {
    const localContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is removed from local from base and remote has not changed", async () => {
    const localContent = stringify({
      "a": 1,
      "c": 2
    });
    const remoteContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is updated in local from base and remote has not changed", async () => {
    const localContent = stringify({
      "a": 1,
      "c": 2
    });
    const remoteContent = stringify({
      "a": 2,
      "c": 2
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with multiple changes and remote stays with base", async () => {
    const localContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with order changes and remote stays with base", async () => {
    const localContent = `
{
	"b": 2,
	"c": 1,
}`;
    const remoteContent = stringify`
{
	"c": 1,
	"b": 2,
}`;
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with comment changes and remote stays with base", async () => {
    const localContent = `
{
	// comment for b has changed
	"b": 2,
	// comment for c
	"c": 1,
}`;
    const remoteContent = stringify`
{
	// comment for b
	"b": 2,
	// comment for c
	"c": 1,
}`;
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with comment and order changes and remote stays with base", async () => {
    const localContent = `
{
	// comment for c
	"c": 1,
	// comment for b has changed
	"b": 2,
}`;
    const remoteContent = stringify`
{
	// comment for b
	"b": 2,
	// comment for c
	"c": 1,
}`;
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local and remote with one entry but different value", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 2
    });
    const expectedConflicts = [{ key: "a", localValue: 1, remoteValue: 2 }];
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge when the entry is removed in remote but updated in local and a new entry is added in remote", async () => {
    const baseContent = stringify({
      "a": 1
    });
    const localContent = stringify({
      "a": 2
    });
    const remoteContent = stringify({
      "b": 2
    });
    const expectedConflicts = [{ key: "a", localValue: 2, remoteValue: void 0 }];
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "b": 2
    }));
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge with single entry and local is empty", async () => {
    const baseContent = stringify({
      "a": 1
    });
    const localContent = stringify({});
    const remoteContent = stringify({
      "a": 2
    });
    const expectedConflicts = [{ key: "a", localValue: void 0, remoteValue: 2 }];
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge when local and remote has moved forwareded with conflicts", async () => {
    const baseContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const localContent = stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 4,
      "f": 1
    });
    const remoteContent = stringify({
      "b": 3,
      "c": 3,
      "d": 6,
      "e": 5
    });
    const expectedConflicts = [
      { key: "b", localValue: void 0, remoteValue: 3 },
      { key: "a", localValue: 2, remoteValue: void 0 },
      { key: "d", localValue: 5, remoteValue: 6 },
      { key: "e", localValue: 4, remoteValue: 5 }
    ];
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 4,
      "f": 1
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "b": 3,
      "c": 3,
      "d": 6,
      "e": 5,
      "f": 1
    }));
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge when local and remote has moved forwareded with change in order", async () => {
    const baseContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const localContent = stringify({
      "a": 2,
      "c": 3,
      "b": 2,
      "d": 4,
      "e": 5
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2,
      "c": 4
    });
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "c": 4,
      "b": 2,
      "e": 5
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "a": 2,
      "b": 2,
      "e": 5,
      "c": 4
    }));
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, []);
  });
  test("merge when local and remote has moved forwareded with comment changes", async () => {
    const baseContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const localContent = `
{
	// comment b has changed in local
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const remoteContent = `
{
	// comment b has changed in remote
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, []);
  });
  test("resolve when local and remote has moved forwareded with resolved conflicts", async () => {
    const baseContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const localContent = stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 4,
      "f": 1
    });
    const remoteContent = stringify({
      "b": 3,
      "c": 3,
      "d": 6,
      "e": 5
    });
    const expectedConflicts = [
      { key: "d", localValue: 5, remoteValue: 6 }
    ];
    const actual = merge(localContent, remoteContent, baseContent, [], [{ key: "a", value: 2 }, { key: "b", value: void 0 }, { key: "e", value: 5 }], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 5,
      "f": 1
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "c": 3,
      "d": 6,
      "e": 5,
      "f": 1,
      "a": 2
    }));
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("ignored setting is not merged when changed in local and remote", async () => {
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({ "a": 2 });
    const actual = merge(localContent, remoteContent, null, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when changed in local and remote from base", async () => {
    const baseContent = stringify({ "a": 0 });
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({ "a": 2 });
    const actual = merge(localContent, remoteContent, baseContent, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when added in remote", async () => {
    const localContent = stringify({});
    const remoteContent = stringify({ "a": 1 });
    const actual = merge(localContent, remoteContent, null, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when added in remote from base", async () => {
    const localContent = stringify({ "b": 2 });
    const remoteContent = stringify({ "a": 1, "b": 2 });
    const actual = merge(localContent, remoteContent, localContent, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when removed in remote", async () => {
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({});
    const actual = merge(localContent, remoteContent, null, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when removed in remote from base", async () => {
    const localContent = stringify({ "a": 2 });
    const remoteContent = stringify({});
    const actual = merge(localContent, remoteContent, localContent, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged with other changes without conflicts", async () => {
    const baseContent = stringify({
      "a": 2,
      "b": 2,
      "c": 3,
      "d": 4,
      "e": 5
    });
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "d": 4,
      "e": 6
    });
    const actual = merge(localContent, remoteContent, baseContent, ["a", "e"], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 1,
      "b": 3
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "a": 3,
      "b": 3,
      "e": 6
    }));
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged with other changes conflicts", async () => {
    const baseContent = stringify({
      "a": 2,
      "b": 2,
      "c": 3,
      "d": 4,
      "e": 5
    });
    const localContent = stringify({
      "a": 1,
      "b": 4,
      "c": 3,
      "d": 5
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "e": 6
    });
    const expectedConflicts = [
      { key: "d", localValue: 5, remoteValue: void 0 },
      { key: "b", localValue: 4, remoteValue: 3 }
    ];
    const actual = merge(localContent, remoteContent, baseContent, ["a", "e"], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 1,
      "b": 4,
      "d": 5
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "a": 3,
      "b": 3,
      "e": 6
    }));
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
    assert.ok(actual.hasConflicts);
  });
  test("merge when remote has comments and local is empty", async () => {
    const localContent = `
{

}`;
    const remoteContent = stringify`
{
	// this is a comment
	"a": 1,
}`;
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
});
suite("SettingsMerge - Compute Remote Content", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("local content is returned when there are no ignored settings", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "d": 4,
      "e": 6
    });
    const actual = updateIgnoredSettings(localContent, remoteContent, [], formattingOptions);
    assert.strictEqual(actual, localContent);
  });
  test("when target content is empty", async () => {
    const remoteContent = stringify({
      "a": 3
    });
    const actual = updateIgnoredSettings("", remoteContent, ["a"], formattingOptions);
    assert.strictEqual(actual, "");
  });
  test("when source content is empty", async () => {
    const localContent = stringify({
      "a": 3,
      "b": 3
    });
    const expected = stringify({
      "b": 3
    });
    const actual = updateIgnoredSettings(localContent, "", ["a"], formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("ignored settings are not updated from remote content", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "d": 4,
      "e": 6
    });
    const expected = stringify({
      "a": 3,
      "b": 2,
      "c": 3
    });
    const actual = updateIgnoredSettings(localContent, remoteContent, ["a"], formattingOptions);
    assert.strictEqual(actual, expected);
  });
});
suite("SettingsMerge - Add Setting", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Insert after a setting without comments", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 2,
	"d": 3
}`;
    const expected = `
{
	"a": 2,
	"b": 2,
	"d": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting without comments at the end", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 2
}`;
    const expected = `
{
	"a": 2,
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert between settings without comment", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert between settings and there is a comment in between in source", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting and after a comment at the end", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for b
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting ending with comma and after a comment at the end", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a comment and there are no settings", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2
}`;
    const targetContent = `
{
	// this is comment for b
}`;
    const expected = `
{
	// this is comment for b
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting and between a comment and setting", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two comments and there is a setting after", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
	// this is comment for c
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two comments on the same line and there is a setting after", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	/* this is comment for b */ // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2, // this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two line comments on the same line and there is a setting after", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b // this is comment for c
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two comments and there is no setting after", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for b
	// this is a comment
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting with comma and between two comments and there is no setting after", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
	// this is a comment
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting without comments", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"d": 2,
	"c": 3
}`;
    const expected = `
{
	"d": 2,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting without comments at the end", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"c": 3
}`;
    const expected = `
{
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting with comment", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	// this is comment for c
	"c": 3
}`;
    const expected = `
{
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting and before a comment at the beginning", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
    const targetContent = `
{
	// this is comment for b
	"c": 3
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting ending with comma and before a comment at the begninning", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
    const targetContent = `
{
	// this is comment for b
	"c": 3,
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting and between a setting and comment", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	// this is comment for b
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two comments and there is a setting before", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	// this is comment for b
	// this is comment for c
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two comments on the same line and there is a setting before", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	/* this is comment for b */ // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two line comments on the same line and there is a setting before", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	// this is comment for b // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	"b": 2,
	// this is comment for b // this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two comments and there is no setting before", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const targetContent = `
{
	// this is comment for b
	// this is comment for c
	"c": 1
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting with comma and between two comments and there is no setting before", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const targetContent = `
{
	// this is comment for b
	// this is comment for c
	"c": 1,
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting that is of object type", () => {
    const sourceContent = `
{
	"b": {
		"d": 1
	},
	"a": 2,
	"c": 1
}`;
    const targetContent = `
{
	"b": {
		"d": 1
	},
	"c": 1
}`;
    const actual = addSetting("a", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, sourceContent);
  });
  test("Insert after a setting that is of array type", () => {
    const sourceContent = `
{
	"b": [
		1
	],
	"a": 2,
	"c": 1
}`;
    const targetContent = `
{
	"b": [
		1
	],
	"c": 1
}`;
    const actual = addSetting("a", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, sourceContent);
  });
  test("Insert after a comment with comma separator of previous setting and no next nodes ", () => {
    const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for a
	,
}`;
    const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a comment with comma separator of previous setting and there is a setting after ", () => {
    const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for a
	,
	"c": 3
}`;
    const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a comment with comma separator of previous setting and there is a comment after ", () => {
    const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
	// this is a comment
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for a
	,
	// this is a comment
}`;
    const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
	// this is a comment
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
});
function stringify(value) {
  return JSON.stringify(value, null, "	");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHNldHRpbmdzTWVyZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgYWRkU2V0dGluZywgbWVyZ2UsIHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXR0aW5nc01lcmdlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbmZsaWN0U2V0dGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuXG5jb25zdCBmb3JtYXR0aW5nT3B0aW9ucyA9IHsgZW9sOiAnXFxuJywgaW5zZXJ0U3BhY2VzOiBmYWxzZSwgdGFiU2l6ZTogNCB9O1xuXG5zdWl0ZSgnU2V0dGluZ3NNZXJnZSAtIE1lcmdlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIG9uZSBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDEgfSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMSB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBtdWx0aXBsZSBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDJcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIG11bHRpcGxlIGVudHJpZXMgaW4gZGlmZmVyZW50IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDJcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggZGlmZmVyZW50IGJhc2UgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMVxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgbmV3IGVudHJ5IGlzIGFkZGVkIHRvIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBtdWx0aXBsZSBuZXcgZW50cmllcyBhcmUgYWRkZWQgdG8gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBtdWx0aXBsZSBuZXcgZW50cmllcyBhcmUgYWRkZWQgdG8gcmVtb3RlIGZyb20gYmFzZSBhbmQgbG9jYWwgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYyc6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHJlbW92ZWQgZnJvbSByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYWxsIGVudHJpZXMgYXJlIHJlbW92ZWQgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHt9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgdXBkYXRlZCBpbiByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBtdWx0aXBsZSBjaGFuZ2VzIGFuZCBsb2NhbCBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMSxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggb3JkZXIgY2hhbmdlcyBhbmQgbG9jYWwgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnZCc6IDQsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnYic6IDIsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIGNvbW1lbnQgY2hhbmdlcyBhbmQgbG9jYWwgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5YFxue1xuXHQvLyBjb21tZW50IGIgaGFzIGNoYW5nZWRcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcbn1gO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBjb21tZW50IGFuZCBvcmRlciBjaGFuZ2VzIGFuZCBsb2NhbCBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcbn1gO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnlgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcblx0Ly8gY29tbWVudCBiIGhhcyBjaGFuZ2VkXG5cdFwiYlwiOiAyLFxufWA7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIGxvY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIG11bHRpcGxlIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBpcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2InOiAxLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSBpcyByZW1vdmVkIGZyb20gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYyc6IDJcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMSxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgdXBkYXRlZCBpbiBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdjJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2MnOiAyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBoYXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggbXVsdGlwbGUgY2hhbmdlcyBhbmQgcmVtb3RlIHN0YXlzIHdpdGggYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2InOiAxLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBoYXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggb3JkZXIgY2hhbmdlcyBhbmQgcmVtb3RlIHN0YXlzIHdpdGggYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBgXG57XG5cdFwiYlwiOiAyLFxuXHRcImNcIjogMSxcbn1gO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnlgXG57XG5cdFwiY1wiOiAxLFxuXHRcImJcIjogMixcbn1gO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBoYXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggY29tbWVudCBjaGFuZ2VzIGFuZCByZW1vdGUgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGBcbntcblx0Ly8gY29tbWVudCBmb3IgYiBoYXMgY2hhbmdlZFxuXHRcImJcIjogMixcblx0Ly8gY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcbn1gO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnlgXG57XG5cdC8vIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgaGFzIG1vdmVkIGZvcndhcmRlZCB3aXRoIGNvbW1lbnQgYW5kIG9yZGVyIGNoYW5nZXMgYW5kIHJlbW90ZSBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gYFxue1xuXHQvLyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxLFxuXHQvLyBjb21tZW50IGZvciBiIGhhcyBjaGFuZ2VkXG5cdFwiYlwiOiAyLFxufWA7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeWBcbntcblx0Ly8gY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcbn1gO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIHdpdGggb25lIGVudHJ5IGJ1dCBkaWZmZXJlbnQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMVxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRDb25mbGljdHM6IElDb25mbGljdFNldHRpbmdbXSA9IFt7IGtleTogJ2EnLCBsb2NhbFZhbHVlOiAxLCByZW1vdGVWYWx1ZTogMiB9XTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBleHBlY3RlZENvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlIGVudHJ5IGlzIHJlbW92ZWQgaW4gcmVtb3RlIGJ1dCB1cGRhdGVkIGluIGxvY2FsIGFuZCBhIG5ldyBlbnRyeSBpcyBhZGRlZCBpbiByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRDb25mbGljdHM6IElDb25mbGljdFNldHRpbmdbXSA9IFt7IGtleTogJ2EnLCBsb2NhbFZhbHVlOiAyLCByZW1vdGVWYWx1ZTogdW5kZWZpbmVkIH1dO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2InOiAyXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBleHBlY3RlZENvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdpdGggc2luZ2xlIGVudHJ5IGFuZCBsb2NhbCBpcyBlbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDFcblx0XHR9KTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe30pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRDb25mbGljdHM6IElDb25mbGljdFNldHRpbmdbXSA9IFt7IGtleTogJ2EnLCBsb2NhbFZhbHVlOiB1bmRlZmluZWQsIHJlbW90ZVZhbHVlOiAyIH1dO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBleHBlY3RlZENvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNSxcblx0XHRcdCdlJzogNCxcblx0XHRcdCdmJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdiJzogMyxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNixcblx0XHRcdCdlJzogNSxcblx0XHR9KTtcblx0XHRjb25zdCBleHBlY3RlZENvbmZsaWN0czogSUNvbmZsaWN0U2V0dGluZ1tdID0gW1xuXHRcdFx0eyBrZXk6ICdiJywgbG9jYWxWYWx1ZTogdW5kZWZpbmVkLCByZW1vdGVWYWx1ZTogMyB9LFxuXHRcdFx0eyBrZXk6ICdhJywgbG9jYWxWYWx1ZTogMiwgcmVtb3RlVmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBrZXk6ICdkJywgbG9jYWxWYWx1ZTogNSwgcmVtb3RlVmFsdWU6IDYgfSxcblx0XHRcdHsga2V5OiAnZScsIGxvY2FsVmFsdWU6IDQsIHJlbW90ZVZhbHVlOiA1IH0sXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNSxcblx0XHRcdCdlJzogNCxcblx0XHRcdCdmJzogMSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA2LFxuXHRcdFx0J2UnOiA1LFxuXHRcdFx0J2YnOiAxLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MsIGV4cGVjdGVkQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggY2hhbmdlIGluIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2QnOiA0LFxuXHRcdFx0J2UnOiA1LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiA0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2MnOiA0LFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2UnOiA1LFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnZSc6IDUsXG5cdFx0XHQnYyc6IDQsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBjb21tZW50IGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxXG59YDtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBgXG57XG5cdC8vIGNvbW1lbnQgYiBoYXMgY2hhbmdlZCBpbiBsb2NhbFxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxXG59YDtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gYFxue1xuXHQvLyBjb21tZW50IGIgaGFzIGNoYW5nZWQgaW4gcmVtb3RlXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDFcbn1gO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggcmVzb2x2ZWQgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA1LFxuXHRcdFx0J2UnOiA0LFxuXHRcdFx0J2YnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA2LFxuXHRcdFx0J2UnOiA1LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkQ29uZmxpY3RzOiBJQ29uZmxpY3RTZXR0aW5nW10gPSBbXG5cdFx0XHR7IGtleTogJ2QnLCBsb2NhbFZhbHVlOiA1LCByZW1vdGVWYWx1ZTogNiB9LFxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCwgW10sIFt7IGtleTogJ2EnLCB2YWx1ZTogMiB9LCB7IGtleTogJ2InLCB2YWx1ZTogdW5kZWZpbmVkIH0sIHsga2V5OiAnZScsIHZhbHVlOiA1IH1dLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDUsXG5cdFx0XHQnZSc6IDUsXG5cdFx0XHQnZic6IDEsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNixcblx0XHRcdCdlJzogNSxcblx0XHRcdCdmJzogMSxcblx0XHRcdCdhJzogMixcblx0XHR9KSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBleHBlY3RlZENvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdoZW4gY2hhbmdlZCBpbiBsb2NhbCBhbmQgcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMSB9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2EnOiAyIH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgWydhJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdoZW4gY2hhbmdlZCBpbiBsb2NhbCBhbmQgcmVtb3RlIGZyb20gYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMCB9KTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDEgfSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMiB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbJ2EnXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlZCBzZXR0aW5nIGlzIG5vdCBtZXJnZWQgd2hlbiBhZGRlZCBpbiByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHt9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2EnOiAxIH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgWydhJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdoZW4gYWRkZWQgaW4gcmVtb3RlIGZyb20gYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYic6IDIgfSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMSwgJ2InOiAyIH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbJ2EnXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlZCBzZXR0aW5nIGlzIG5vdCBtZXJnZWQgd2hlbiByZW1vdmVkIGluIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDEgfSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbJ2EnXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlZCBzZXR0aW5nIGlzIG5vdCBtZXJnZWQgd2hlbiByZW1vdmVkIGluIHJlbW90ZSBmcm9tIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2EnOiAyIH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe30pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbJ2EnXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlZCBzZXR0aW5nIGlzIG5vdCBtZXJnZWQgd2l0aCBvdGhlciBjaGFuZ2VzIHdpdGhvdXQgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHRcdCdlJzogNSxcblx0XHR9KTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdFx0J2UnOiA2LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFsnYScsICdlJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDMsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMyxcblx0XHRcdCdiJzogMyxcblx0XHRcdCdlJzogNixcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdpdGggb3RoZXIgY2hhbmdlcyBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdFx0J2UnOiA1LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDQsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDMsXG5cdFx0XHQnYic6IDMsXG5cdFx0XHQnZSc6IDYsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRDb25mbGljdHM6IElDb25mbGljdFNldHRpbmdbXSA9IFtcblx0XHRcdHsga2V5OiAnZCcsIGxvY2FsVmFsdWU6IDUsIHJlbW90ZVZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2V5OiAnYicsIGxvY2FsVmFsdWU6IDQsIHJlbW90ZVZhbHVlOiAzIH0sXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbJ2EnLCAnZSddLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiA0LFxuXHRcdFx0J2QnOiA1LFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDMsXG5cdFx0XHQnYic6IDMsXG5cdFx0XHQnZSc6IDYsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBleHBlY3RlZENvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHJlbW90ZSBoYXMgY29tbWVudHMgYW5kIGxvY2FsIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGBcbntcblxufWA7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeWBcbntcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcblx0XCJhXCI6IDEsXG59YDtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU2V0dGluZ3NNZXJnZSAtIENvbXB1dGUgUmVtb3RlIENvbnRlbnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbG9jYWwgY29udGVudCBpcyByZXR1cm5lZCB3aGVuIHRoZXJlIGFyZSBubyBpZ25vcmVkIHNldHRpbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDMsXG5cdFx0XHQnYic6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0XHQnZSc6IDYsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gdXBkYXRlSWdub3JlZFNldHRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhcmdldCBjb250ZW50IGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncygnJywgcmVtb3RlQ29udGVudCwgWydhJ10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gc291cmNlIGNvbnRlbnQgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMyxcblx0XHRcdCdiJzogMyxcblx0XHR9KTtcblx0XHRjb25zdCBleHBlY3RlZCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYic6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gdXBkYXRlSWdub3JlZFNldHRpbmdzKGxvY2FsQ29udGVudCwgJycsIFsnYSddLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVkIHNldHRpbmdzIGFyZSBub3QgdXBkYXRlZCBmcm9tIHJlbW90ZSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDMsXG5cdFx0XHQnYic6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0XHQnZSc6IDYsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFsnYSddLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdTZXR0aW5nc01lcmdlIC0gQWRkIFNldHRpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyB3aXRob3V0IGNvbW1lbnRzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDIsXG5cdFwiZFwiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMixcblx0XCJiXCI6IDIsXG5cdFwiZFwiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgd2l0aG91dCBjb21tZW50cyBhdCB0aGUgZW5kJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDJcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAyLFxuXHRcImJcIjogMlxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmV0d2VlbiBzZXR0aW5ncyB3aXRob3V0IGNvbW1lbnQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJldHdlZW4gc2V0dGluZ3MgYW5kIHRoZXJlIGlzIGEgY29tbWVudCBpbiBiZXR3ZWVuIGluIHNvdXJjZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyBhbmQgYWZ0ZXIgYSBjb21tZW50IGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyBlbmRpbmcgd2l0aCBjb21tYSBhbmQgYWZ0ZXIgYSBjb21tZW50IGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIGNvbW1lbnQgYW5kIHRoZXJlIGFyZSBubyBzZXR0aW5ncycsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyBhbmQgYmV0d2VlbiBhIGNvbW1lbnQgYW5kIHNldHRpbmcnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyBiZXR3ZWVuIHR3byBjb21tZW50cyBhbmQgdGhlcmUgaXMgYSBzZXR0aW5nIGFmdGVyJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgYmV0d2VlbiB0d28gY29tbWVudHMgb24gdGhlIHNhbWUgbGluZSBhbmQgdGhlcmUgaXMgYSBzZXR0aW5nIGFmdGVyJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqL1xuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0LyogdGhpcyBpcyBjb21tZW50IGZvciBiICovIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqL1xuXHRcImJcIjogMiwgLy8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgYmV0d2VlbiB0d28gbGluZSBjb21tZW50cyBvbiB0aGUgc2FtZSBsaW5lIGFuZCB0aGVyZSBpcyBhIHNldHRpbmcgYWZ0ZXInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0LyogdGhpcyBpcyBjb21tZW50IGZvciBiICovXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGIgLy8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyBiZXR3ZWVuIHR3byBjb21tZW50cyBhbmQgdGhlcmUgaXMgbm8gc2V0dGluZyBhZnRlcicsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBzZXR0aW5nIHdpdGggY29tbWEgYW5kIGJldHdlZW4gdHdvIGNvbW1lbnRzIGFuZCB0aGVyZSBpcyBubyBzZXR0aW5nIGFmdGVyJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgd2l0aG91dCBjb21tZW50cycsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiZFwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJkXCI6IDIsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmVmb3JlIGEgc2V0dGluZyB3aXRob3V0IGNvbW1lbnRzIGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIHdpdGggY29tbWVudCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgYW5kIGJlZm9yZSBhIGNvbW1lbnQgYXQgdGhlIGJlZ2lubmluZycsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0XCJjXCI6IDMsXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgZW5kaW5nIHdpdGggY29tbWEgYW5kIGJlZm9yZSBhIGNvbW1lbnQgYXQgdGhlIGJlZ25pbm5pbmcnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzLFxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiY1wiOiAzLFxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogMyxcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgYW5kIGJldHdlZW4gYSBzZXR0aW5nIGFuZCBjb21tZW50JywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiZFwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiZFwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGJldHdlZW4gdHdvIGNvbW1lbnRzIGFuZCB0aGVyZSBpcyBhIHNldHRpbmcgYmVmb3JlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImRcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJkXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGJldHdlZW4gdHdvIGNvbW1lbnRzIG9uIHRoZSBzYW1lIGxpbmUgYW5kIHRoZXJlIGlzIGEgc2V0dGluZyBiZWZvcmUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0LyogdGhpcyBpcyBjb21tZW50IGZvciBiICovXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiZFwiOiAxLFxuXHQvKiB0aGlzIGlzIGNvbW1lbnQgZm9yIGIgKi8gLy8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImRcIjogMSxcblx0LyogdGhpcyBpcyBjb21tZW50IGZvciBiICovXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgYmV0d2VlbiB0d28gbGluZSBjb21tZW50cyBvbiB0aGUgc2FtZSBsaW5lIGFuZCB0aGVyZSBpcyBhIHNldHRpbmcgYmVmb3JlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqL1xuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImRcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJkXCI6IDEsXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGIgLy8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGJldHdlZW4gdHdvIGNvbW1lbnRzIGFuZCB0aGVyZSBpcyBubyBzZXR0aW5nIGJlZm9yZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMVxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmVmb3JlIGEgc2V0dGluZyB3aXRoIGNvbW1hIGFuZCBiZXR3ZWVuIHR3byBjb21tZW50cyBhbmQgdGhlcmUgaXMgbm8gc2V0dGluZyBiZWZvcmUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMVxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxLFxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBzZXR0aW5nIHRoYXQgaXMgb2Ygb2JqZWN0IHR5cGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImJcIjoge1xuXHRcdFwiZFwiOiAxXG5cdH0sXG5cdFwiYVwiOiAyLFxuXHRcImNcIjogMVxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJiXCI6IHtcblx0XHRcImRcIjogMVxuXHR9LFxuXHRcImNcIjogMVxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdhJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgc291cmNlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgdGhhdCBpcyBvZiBhcnJheSB0eXBlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJiXCI6IFtcblx0XHQxXG5cdF0sXG5cdFwiYVwiOiAyLFxuXHRcImNcIjogMVxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJiXCI6IFtcblx0XHQxXG5cdF0sXG5cdFwiY1wiOiAxXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2EnLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBzb3VyY2VDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgY29tbWVudCB3aXRoIGNvbW1hIHNlcGFyYXRvciBvZiBwcmV2aW91cyBzZXR0aW5nIGFuZCBubyBuZXh0IG5vZGVzICcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYVxuXHQsXG5cdFwiYlwiOiAyXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGFcblx0LFxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcblx0XCJiXCI6IDJcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgY29tbWVudCB3aXRoIGNvbW1hIHNlcGFyYXRvciBvZiBwcmV2aW91cyBzZXR0aW5nIGFuZCB0aGVyZSBpcyBhIHNldHRpbmcgYWZ0ZXIgJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGFcblx0LFxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIGNvbW1lbnQgd2l0aCBjb21tYSBzZXBhcmF0b3Igb2YgcHJldmlvdXMgc2V0dGluZyBhbmQgdGhlcmUgaXMgYSBjb21tZW50IGFmdGVyICcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYVxuXHQsXG5cdFwiYlwiOiAyXG5cdC8vIHRoaXMgaXMgYSBjb21tZW50XG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGFcblx0LFxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcblx0XCJiXCI6IDJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG59KTtcblxuXG5mdW5jdGlvbiBzdHJpbmdpZnkodmFsdWU6IGFueSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgJ1xcdCcpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsWUFBWSxPQUFPLDZCQUE2QjtBQUd6RCxNQUFNLG9CQUFvQixFQUFFLEtBQUssTUFBTSxjQUFjLE9BQU8sU0FBUyxFQUFFO0FBRXZFLE1BQU0seUJBQXlCLE1BQU07QUFFcEMsMENBQXdDO0FBRXhDLE9BQUssdURBQXVELFlBQVk7QUFDdkUsVUFBTSxlQUFlLFVBQVUsRUFBRSxLQUFL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
