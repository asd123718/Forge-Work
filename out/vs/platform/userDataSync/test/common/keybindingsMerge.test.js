import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { merge } from "../../common/keybindingsMerge.js";
import { TestUserDataSyncUtilService } from "./userDataSyncClient.js";
suite("KeybindingsMerge - No Conflicts", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge when local and remote are same with one entry", async () => {
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with similar when contexts", async () => {
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "!editorReadonly && editorTextFocus" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote has entries in different order", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+a", command: "a", when: "editorTextFocus" }
    ]);
    const remoteContent = stringify([
      { key: "alt+a", command: "a", when: "editorTextFocus" },
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with multiple entries", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with different base content", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const baseContent = stringify([
      { key: "ctrl+c", command: "e" },
      { key: "shift+d", command: "d", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with multiple entries in different order", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same when remove entry is in different order", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+d", command: "-a" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when a new entry is added to remote", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when multiple new entries are added to remote", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when multiple new entries are added to remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when an entry is removed from remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when an entry (same command) is removed from remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when an entry is updated in remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when a command with multiple entries is updated from remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+c", command: "a" }
    ]);
    const remoteContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+d", command: "a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when remote has moved forwareded with multiple changes and local stays with base", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "alt+d", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+d", command: "c", when: "context1" }
    ]);
    const remoteContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+e", command: "d" },
      { key: "alt+d", command: "-a" },
      { key: "alt+f", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when a new entry is added to local", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when multiple new entries are added to local", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when multiple new entries are added to local from base and remote is not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when an entry is removed from local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when an entry (with same command) is removed from local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when an entry is updated in local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when a command with multiple entries is updated from local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+c", command: "a" }
    ]);
    const remoteContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+d", command: "a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local has moved forwareded with multiple changes and remote stays with base", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+e", command: "d" },
      { key: "alt+d", command: "-a" },
      { key: "alt+f", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "alt+d", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+d", command: "c", when: "context1" }
    ]);
    const expected = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+e", command: "d" },
      { key: "alt+d", command: "-a" },
      { key: "alt+f", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, expected);
  });
  test("merge when local and remote has moved forwareded with conflicts", async () => {
    const baseContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "ctrl+c", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "alt+a", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const localContent = stringify([
      { key: "alt+d", command: "-f" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "alt+a", command: "f" },
      { key: "alt+e", command: "e" }
    ]);
    const remoteContent = stringify([
      { key: "alt+a", command: "f" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "d" },
      { key: "alt+d", command: "-f" },
      { key: "alt+c", command: "c", when: "context1" },
      { key: "alt+g", command: "g", when: "context2" }
    ]);
    const expected = stringify([
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "d" },
      { key: "cmd+c", command: "-c" },
      { key: "alt+c", command: "c", when: "context1" },
      { key: "alt+a", command: "f" },
      { key: "alt+e", command: "e" },
      { key: "alt+g", command: "g", when: "context2" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, expected);
  });
  test("merge when local and remote with one entry but different value", async () => {
    const localContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`
    );
  });
  test("merge when local and remote with different keybinding", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+a", command: "-a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+a", command: "-a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+a",
		"command": "-a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`
    );
  });
  test("merge when the entry is removed in local but updated in remote", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[]`
    );
  });
  test("merge when the entry is removed in local but updated in remote and a new entry is added in local", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([{ key: "alt+b", command: "b" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+b",
		"command": "b"
	}
]`
    );
  });
  test("merge when the entry is removed in remote but updated in local", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`
    );
  });
  test("merge when the entry is removed in remote but updated in local and a new entry is added in remote", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+b", command: "b" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+b",
		"command": "b"
	}
]`
    );
  });
  test("merge when local and remote has moved forwareded with conflicts (2)", async () => {
    const baseContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+c", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "alt+a", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const localContent = stringify([
      { key: "alt+d", command: "-f" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "alt+a", command: "f" },
      { key: "alt+e", command: "e" }
    ]);
    const remoteContent = stringify([
      { key: "alt+a", command: "f" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "d" },
      { key: "alt+d", command: "-f" },
      { key: "alt+c", command: "c", when: "context1" },
      { key: "alt+g", command: "g", when: "context2" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+d",
		"command": "-f"
	},
	{
		"key": "cmd+d",
		"command": "d"
	},
	{
		"key": "cmd+c",
		"command": "-c"
	},
	{
		"key": "cmd+d",
		"command": "c",
		"when": "context1"
	},
	{
		"key": "alt+a",
		"command": "f"
	},
	{
		"key": "alt+e",
		"command": "e"
	},
	{
		"key": "alt+g",
		"command": "g",
		"when": "context2"
	}
]`
    );
  });
});
async function mergeKeybindings(localContent, remoteContent, baseContent) {
  const userDataSyncUtilService = new TestUserDataSyncUtilService();
  const formattingOptions = await userDataSyncUtilService.resolveFormattingOptions();
  return merge(localContent, remoteContent, baseContent, formattingOptions, userDataSyncUtilService);
}
function stringify(value) {
  return JSON.stringify(value, null, "	");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXGtleWJpbmRpbmdzTWVyZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tICcuLi8uLi9jb21tb24va2V5YmluZGluZ3NNZXJnZS5qcyc7XG5pbXBvcnQgeyBUZXN0VXNlckRhdGFTeW5jVXRpbFNlcnZpY2UgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbnN1aXRlKCdLZXliaW5kaW5nc01lcmdlIC0gTm8gQ29uZmxpY3RzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIG9uZSBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggc2ltaWxhciB3aGVuIGNvbnRleHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnIWVkaXRvclJlYWRvbmx5ICYmIGVkaXRvclRleHRGb2N1cycgfV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgaGFzIGVudHJpZXMgaW4gZGlmZmVyZW50IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMnIH1cblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBtdWx0aXBsZSBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBkaWZmZXJlbnQgYmFzZSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2N0cmwrYycsIGNvbW1hbmQ6ICdlJyB9LFxuXHRcdFx0eyBrZXk6ICdzaGlmdCtkJywgY29tbWFuZDogJ2QnLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggbXVsdGlwbGUgZW50cmllcyBpbiBkaWZmZXJlbnQgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfVxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2hlbiByZW1vdmUgZW50cnkgaXMgaW4gZGlmZmVyZW50IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhIG5ldyBlbnRyeSBpcyBhZGRlZCB0byByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBtdWx0aXBsZSBuZXcgZW50cmllcyBhcmUgYWRkZWQgdG8gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgcmVtb3ZlZCBmcm9tIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgKHNhbWUgY29tbWFuZCkgaXMgcmVtb3ZlZCBmcm9tIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSBpcyB1cGRhdGVkIGluIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgY29tbWFuZCB3aXRoIG11bHRpcGxlIGVudHJpZXMgaXMgdXBkYXRlZCBmcm9tIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdzaGlmdCtjJywgY29tbWFuZDogJ2MnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYicgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnc2hpZnQrYycsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2InIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2EnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBtdWx0aXBsZSBjaGFuZ2VzIGFuZCBsb2NhbCBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2YnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYSBuZXcgZW50cnkgaXMgYWRkZWQgdG8gbG9jYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIG11bHRpcGxlIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byBsb2NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGlzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSBpcyByZW1vdmVkIGZyb20gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSAod2l0aCBzYW1lIGNvbW1hbmQpIGlzIHJlbW92ZWQgZnJvbSBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgdXBkYXRlZCBpbiBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgY29tbWFuZCB3aXRoIG11bHRpcGxlIGVudHJpZXMgaXMgdXBkYXRlZCBmcm9tIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdzaGlmdCtjJywgY29tbWFuZDogJ2MnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYicgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnc2hpZnQrYycsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2InIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2EnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIG11bHRpcGxlIGNoYW5nZXMgYW5kIHJlbW90ZSBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2YnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2YnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdjdHJsK2MnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtlJywgY29tbWFuZDogJ2QnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRdKTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctZicgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnLWMnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtlJywgY29tbWFuZDogJ2UnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2cnLCBjb21tYW5kOiAnZycsIHdoZW46ICdjb250ZXh0MicgfSxcblx0XHRdKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2UnLCBjb21tYW5kOiAnZScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2cnLCBjb21tYW5kOiAnZycsIHdoZW46ICdjb250ZXh0MicgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgd2l0aCBvbmUgZW50cnkgYnV0IGRpZmZlcmVudCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsXG5cdFx0XHRgW1xuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrZFwiLFxuXHRcdFwiY29tbWFuZFwiOiBcImFcIixcblx0XHRcIndoZW5cIjogXCJlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5XCJcblx0fVxuXWApO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgd2l0aCBkaWZmZXJlbnQga2V5YmluZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJy1hJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1cblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICctYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LFxuXHRcdFx0YFtcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2RcIixcblx0XHRcImNvbW1hbmRcIjogXCJhXCIsXG5cdFx0XCJ3aGVuXCI6IFwiZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seVwiXG5cdH0sXG5cdHtcblx0XHRcImtleVwiOiBcImFsdCthXCIsXG5cdFx0XCJjb21tYW5kXCI6IFwiLWFcIixcblx0XHRcIndoZW5cIjogXCJlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5XCJcblx0fVxuXWApO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZSBlbnRyeSBpcyByZW1vdmVkIGluIGxvY2FsIGJ1dCB1cGRhdGVkIGluIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW10pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCxcblx0XHRcdGBbXWApO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZSBlbnRyeSBpcyByZW1vdmVkIGluIGxvY2FsIGJ1dCB1cGRhdGVkIGluIHJlbW90ZSBhbmQgYSBuZXcgZW50cnkgaXMgYWRkZWQgaW4gbG9jYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtiJywgY29tbWFuZDogJ2InIH1dKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsXG5cdFx0XHRgW1xuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrYlwiLFxuXHRcdFwiY29tbWFuZFwiOiBcImJcIlxuXHR9XG5dYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlIGVudHJ5IGlzIHJlbW92ZWQgaW4gcmVtb3RlIGJ1dCB1cGRhdGVkIGluIGxvY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LFxuXHRcdFx0YFtcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2NcIixcblx0XHRcImNvbW1hbmRcIjogXCJhXCIsXG5cdFx0XCJ3aGVuXCI6IFwiZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seVwiXG5cdH1cbl1gKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGUgZW50cnkgaXMgcmVtb3ZlZCBpbiByZW1vdGUgYnV0IHVwZGF0ZWQgaW4gbG9jYWwgYW5kIGEgbmV3IGVudHJ5IGlzIGFkZGVkIGluIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYicsIGNvbW1hbmQ6ICdiJyB9XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCxcblx0XHRcdGBbXG5cdHtcblx0XHRcImtleVwiOiBcImFsdCtjXCIsXG5cdFx0XCJjb21tYW5kXCI6IFwiYVwiLFxuXHRcdFwid2hlblwiOiBcImVkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHlcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrYlwiLFxuXHRcdFwiY29tbWFuZFwiOiBcImJcIlxuXHR9XG5dYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIGNvbmZsaWN0cyAoMiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICdmJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctZicgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnLWMnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtlJywgY29tbWFuZDogJ2QnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICdmJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZScsIGNvbW1hbmQ6ICdlJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICdmJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtnJywgY29tbWFuZDogJ2cnLCB3aGVuOiAnY29udGV4dDInIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCxcblx0XHRcdGBbXG5cdHtcblx0XHRcImtleVwiOiBcImFsdCtkXCIsXG5cdFx0XCJjb21tYW5kXCI6IFwiLWZcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJjbWQrZFwiLFxuXHRcdFwiY29tbWFuZFwiOiBcImRcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJjbWQrY1wiLFxuXHRcdFwiY29tbWFuZFwiOiBcIi1jXCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiY21kK2RcIixcblx0XHRcImNvbW1hbmRcIjogXCJjXCIsXG5cdFx0XCJ3aGVuXCI6IFwiY29udGV4dDFcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrYVwiLFxuXHRcdFwiY29tbWFuZFwiOiBcImZcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrZVwiLFxuXHRcdFwiY29tbWFuZFwiOiBcImVcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrZ1wiLFxuXHRcdFwiY29tbWFuZFwiOiBcImdcIixcblx0XHRcIndoZW5cIjogXCJjb250ZXh0MlwiXG5cdH1cbl1gKTtcblx0fSk7XG5cbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudDogc3RyaW5nLCByZW1vdGVDb250ZW50OiBzdHJpbmcsIGJhc2VDb250ZW50OiBzdHJpbmcgfCBudWxsKSB7XG5cdGNvbnN0IHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlID0gbmV3IFRlc3RVc2VyRGF0YVN5bmNVdGlsU2VydmljZSgpO1xuXHRjb25zdCBmb3JtYXR0aW5nT3B0aW9ucyA9IGF3YWl0IHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLnJlc29sdmVGb3JtYXR0aW5nT3B0aW9ucygpO1xuXHRyZXR1cm4gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMsIHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlKTtcbn1cblxuZnVuY3Rpb24gc3RyaW5naWZ5KHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsICdcXHQnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQ0FBbUM7QUFFNUMsTUFBTSxtQ0FBbUMsTUFBTTtBQUU5QywwQ0FBd0M7QUFFeEMsT0FBSyx1REFBdUQsWUFBWTtBQUN2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LEVBQUUsS0FBSyxVQUFVLFNBQVMsS0FBSztBQUFBLE1BQy9CLEVBQUUsS0FBSyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQzdCLEVBQUUsS0FBSyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQzdCLEVBQUUsS0FBSyxTQUFTLFNBQVMsS0FBSztBQUFBLE1BQzlCLEVBQUUsS0FBSyxTQUFTLFNBQVMsS0FBSyxNQUFNLFdBQVc7QUFBQSxNQUMvQyxFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUs7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxlQUFlLFVBQVU7QUFBQSxNQUM5QixFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUM5QixFQUFFLEtBQUssU0FBUyxTQUFTLElBQUk7QUFBQSxNQUM3QixFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUM5QixFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUssTUFBTSxXQUFXO0FBQUEsTUFDL0MsRUFBRSxLQUFLLFNBQVMsU0FBUyxJQUFJO0FBQUEsTUFDN0IsRUFBRSxLQUFLLFNBQVMsU0FBUyxJQUFJO0FBQUEsSUFDOUIsQ0FBQztBQUNELFVBQU0sZ0JBQWdCLFVBQVU7QUFBQSxNQUMvQixFQUFFLEtBQUssU0FBUyxTQUFTLElBQUk7QUFBQSxNQUM3QixFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUM5QixFQUFFLEtBQUssU0FBUyxTQUFTLElBQUk7QUFBQSxNQUM3QixFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUM5QixFQUFFLEtBQUssU0FBUyxTQUFTLEtBQUssTUFBTSxXQUFXO0FBQUEsTUFDL0MsRUFBRSxLQUFLLFNBQVMsU0FBUyxLQUFLLE1BQU0sV0FBVztBQUFBLElBQ2hELENBQUM7QUFDRCxVQUFNLFdBQVcsVUFBVTtBQUFBLE1BQzFCLEVBQUUsS0FBSyxTQUFTLFNBQVMsS0FBSztBQUFBLE1BQzlCLEVBQUUsS0FBSyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQzdCLEVBQUUsS0FBSyxTQUFTLFNBQVMsS0FBSztBQUFB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
