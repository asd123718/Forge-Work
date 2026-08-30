import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { merge } from "../../common/extensionsMerge.js";
suite("ExtensionsMerge", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge returns local extension if remote does not exist", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, null, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, localExtensions);
  });
  test("merge returns local extension if remote does not exist with ignored extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      localExtensions[1],
      localExtensions[2]
    ];
    const actual = merge(localExtensions, null, null, [], ["a"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge returns local extension if remote does not exist with ignored extensions (ignore case)", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      localExtensions[1],
      localExtensions[2]
    ];
    const actual = merge(localExtensions, null, null, [], ["A"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge returns local extension if remote does not exist with skipped extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const skippedExtension = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } })
    ];
    const expected = [...localExtensions];
    const actual = merge(localExtensions, null, null, skippedExtension, [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge returns local extension if remote does not exist with skipped and ignored extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const skippedExtension = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } })
    ];
    const expected = [localExtensions[1], localExtensions[2]];
    const actual = merge(localExtensions, null, null, skippedExtension, ["a"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when there is no base", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } }),
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when there is no base and with ignored extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } }),
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], ["a"], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when remote is moved forwarded", () => {
    const baseExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }, { id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote is moved forwarded with disabled extension", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" }, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" }, disabled: true })]);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote moved forwarded with ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ["a"], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote is moved forwarded with skipped extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote is moved forwarded with skipped and ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ["b"], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when local is moved forwarded", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when local is moved forwarded with disabled extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when local is moved forwarded with ignored settings", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ["b"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
  });
  test("merge local and remote extensions when local is moved forwarded with skipped extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when local is moved forwarded with skipped and ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ["c"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } })]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded with ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ["a", "e"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded with skipped extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded with skipped and ignoredextensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ["e"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when remote extension has no uuid and different extension id case", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "A" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "A", uuid: "a" } }),
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when remote extension is not an installed extension", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" }, installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge when remote extension is not an installed extension but is an installed extension locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when an extension is not an installed extension remotely and does not exist locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" }, installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge when an extension is an installed extension remotely but not locally and updated locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when an extension is an installed extension remotely but not locally and updated remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge not installed extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" }, installed: false })
    ];
    const expected = [
      anExpectedBuiltinSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedBuiltinSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge: remote extension with prerelease is added", () => {
    const localExtensions = [];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension with prerelease is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
  });
  test("merge: remote extension with prerelease is added when local extension without prerelease is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension without prerelease is added when local extension with prerelease is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to prerelease", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to release", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to prerelease", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
  });
  test("merge: local extension is changed to release", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: local extension not an installed extension - remote preRelease property is taken precedence when there are no updates", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote preRelease property is taken precedence when there are updates locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true, disabled: true })]);
  });
  test("merge: local extension not an installed extension - remote preRelease property is taken precedence when there are updates remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true, disabled: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote version is taken precedence when there are no updates", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote version is taken precedence when there are updates locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", disabled: true })]);
  });
  test("merge: local extension not an installed extension - remote version property is taken precedence when there are updates remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", disabled: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has builtin extension, local does not have extension, remote has extension installed", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has installed extension, local has installed extension, remote has extension builtin", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has installed extension, local has builtin extension, remote does not has extension", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedBuiltinSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: base has builtin extension, local has installed extension, remote has builtin extension with updated state", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, state: { "a": 1 } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
  });
  test("merge: base has installed extension, last time synced as builtin extension, local has installed extension, remote has builtin extension with updated state", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, state: { "a": 1 } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
  });
  test("merge: base has builtin extension, local does not have extension, remote has builtin extension", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has installed extension, last synced as builtin, local does not have extension, remote has installed extension", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has builtin extension, last synced as builtin, local does not have extension, remote has installed extension", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension with pinned is added", () => {
    const localExtensions = [];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension with pinned is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
  });
  test("merge: remote extension with pinned is added when local extension without pinned is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension without pinned is added when local extension with pinned is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to pinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to unpinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to pinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
  });
  test("merge: local extension is changed to unpinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: local extension not an installed extension - remote pinned property is taken precedence when there are no updates", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote pinned property is taken precedence when there are updates locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true, disabled: true })]);
  });
  test("merge: local extension not an installed extension - remote pinned property is taken precedence when there are updates remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true, disabled: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to pinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })]);
  });
  test("merge: local extension is changed to unpinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: remote extension is changed to pinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to pinned and version changed and remote extension is channged to pinned with different version", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.2", pinned: true })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.2", pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to unpinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to unpinned and version changed and remote extension is channged to unpinned with different version", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1" })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.2" })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("sync adding local application scoped extension", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })
    ];
    const actual = merge(localExtensions, null, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, localExtensions);
  });
  test("sync merging local extension with isApplicationScoped property and remote does not has isApplicationScoped property", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const baseExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, baseExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("sync merging when applicaiton scope is changed locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const actual = merge(localExtensions, baseExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, localExtensions);
  });
  test("sync merging when applicaiton scope is changed remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge does not remove remote extension when skipped extension has uuid but remote does not has", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "b" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } })], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge does not remove remote extension when last sync builtin extension has uuid but remote does not has", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "b" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], [{ id: "b", uuid: "b" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  function anExpectedSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      installed: true,
      ...extension
    };
  }
  function anExpectedBuiltinSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      ...extension
    };
  }
  function aLocalSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      installed: true,
      ...extension
    };
  }
  function aRemoteSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      installed: true,
      ...extension
    };
  }
  function aSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      installed: true,
      ...extension
    };
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXGV4dGVuc2lvbnNNZXJnZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRlbnNpb25zTWVyZ2UuanMnO1xuaW1wb3J0IHsgSUxvY2FsU3luY0V4dGVuc2lvbiwgSVN5bmNFeHRlbnNpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcblxuc3VpdGUoJ0V4dGVuc2lvbnNNZXJnZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZXJnZSByZXR1cm5zIGxvY2FsIGV4dGVuc2lvbiBpZiByZW1vdGUgZG9lcyBub3QgZXhpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIG51bGwsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBsb2NhbEV4dGVuc2lvbnMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSByZXR1cm5zIGxvY2FsIGV4dGVuc2lvbiBpZiByZW1vdGUgZG9lcyBub3QgZXhpc3Qgd2l0aCBpZ25vcmVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRsb2NhbEV4dGVuc2lvbnNbMV0sXG5cdFx0XHRsb2NhbEV4dGVuc2lvbnNbMl0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgbnVsbCwgbnVsbCwgW10sIFsnYSddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgcmV0dXJucyBsb2NhbCBleHRlbnNpb24gaWYgcmVtb3RlIGRvZXMgbm90IGV4aXN0IHdpdGggaWdub3JlZCBleHRlbnNpb25zIChpZ25vcmUgY2FzZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRsb2NhbEV4dGVuc2lvbnNbMV0sXG5cdFx0XHRsb2NhbEV4dGVuc2lvbnNbMl0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgbnVsbCwgbnVsbCwgW10sIFsnQSddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgcmV0dXJucyBsb2NhbCBleHRlbnNpb24gaWYgcmVtb3RlIGRvZXMgbm90IGV4aXN0IHdpdGggc2tpcHBlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHNraXBwZWRFeHRlbnNpb24gPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFsuLi5sb2NhbEV4dGVuc2lvbnNdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCBudWxsLCBudWxsLCBza2lwcGVkRXh0ZW5zaW9uLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHJldHVybnMgbG9jYWwgZXh0ZW5zaW9uIGlmIHJlbW90ZSBkb2VzIG5vdCBleGlzdCB3aXRoIHNraXBwZWQgYW5kIGlnbm9yZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9uID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbbG9jYWxFeHRlbnNpb25zWzFdLCBsb2NhbEV4dGVuc2lvbnNbMl1dO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCBudWxsLCBudWxsLCBza2lwcGVkRXh0ZW5zaW9uLCBbJ2EnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIHRoZXJlIGlzIG5vIGJhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiB0aGVyZSBpcyBubyBiYXNlIGFuZCB3aXRoIGlnbm9yZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbJ2EnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIHJlbW90ZSBpcyBtb3ZlZCBmb3J3YXJkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFt7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gcmVtb3RlIGlzIG1vdmVkIGZvcndhcmRlZCB3aXRoIGRpc2FibGVkIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9LCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFt7IGlkOiAnYScsIHV1aWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSwgZGlzYWJsZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIHJlbW90ZSBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBpZ25vcmVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFsnYSddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFt7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gcmVtb3RlIGlzIG1vdmVkIGZvcndhcmRlZCB3aXRoIHNraXBwZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3Qgc2tpcHBlZEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBza2lwcGVkRXh0ZW5zaW9ucywgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW3sgaWQ6ICdkJywgdXVpZDogJ2QnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiByZW1vdGUgaXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggc2tpcHBlZCBhbmQgaWdub3JlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIHNraXBwZWRFeHRlbnNpb25zLCBbJ2InXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbeyBpZDogJ2QnLCB1dWlkOiAnZCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIGxvY2FsIGlzIG1vdmVkIGZvcndhcmRlZCcsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIGxvY2FsIGlzIG1vdmVkIGZvcndhcmRlZCB3aXRoIGRpc2FibGVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gbG9jYWwgaXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggaWdub3JlZCBzZXR0aW5ncycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgWydiJ10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiBsb2NhbCBpcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBza2lwcGVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIHNraXBwZWRFeHRlbnNpb25zLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIGxvY2FsIGlzIG1vdmVkIGZvcndhcmRlZCB3aXRoIHNraXBwZWQgYW5kIGlnbm9yZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHNraXBwZWRFeHRlbnNpb25zID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgc2tpcHBlZEV4dGVuc2lvbnMsIFsnYyddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gYm90aCBtb3ZlZCBmb3J3YXJkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZScsIHV1aWQ6ICdlJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiBib3RoIG1vdmVkIGZvcndhcmRlZCB3aXRoIGlnbm9yZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2UnLCB1dWlkOiAnZScgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFsnYScsICdlJ10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiBib3RoIG1vdmVkIGZvcndhcmRlZCB3aXRoIHNraXBwZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHNraXBwZWRFeHRlbnNpb25zID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2UnLCB1dWlkOiAnZScgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgc2tpcHBlZEV4dGVuc2lvbnMsIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2UnLCB1dWlkOiAnZScgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gYm90aCBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBza2lwcGVkIGFuZCBpZ25vcmVkZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHNraXBwZWRFeHRlbnNpb25zID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2UnLCB1dWlkOiAnZScgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgc2tpcHBlZEV4dGVuc2lvbnMsIFsnZSddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgZXh0ZW5zaW9uIGhhcyBubyB1dWlkIGFuZCBkaWZmZXJlbnQgZXh0ZW5zaW9uIGlkIGNhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ0EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ0EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHJlbW90ZSBleHRlbnNpb24gaXMgbm90IGFuIGluc3RhbGxlZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGV4dGVuc2lvbiBpcyBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiBidXQgaXMgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiBsb2NhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZXh0ZW5zaW9uIGlzIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIHJlbW90ZWx5IGFuZCBkb2VzIG5vdCBleGlzdCBsb2NhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGV4dGVuc2lvbiBpcyBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIHJlbW90ZWx5IGJ1dCBub3QgbG9jYWxseSBhbmQgdXBkYXRlZCBsb2NhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBleHRlbnNpb24gaXMgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiByZW1vdGVseSBidXQgbm90IGxvY2FsbHkgYW5kIHVwZGF0ZWQgcmVtb3RlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBsb2NhbEV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBub3QgaW5zdGFsbGVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElTeW5jRXh0ZW5zaW9uW10gPSBbXG5cdFx0XHRhbkV4cGVjdGVkQnVpbHRpblN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZEJ1aWx0aW5TeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiB3aXRoIHByZXJlbGVhc2UgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gd2l0aCBwcmVyZWxlYXNlIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIHdpdGggcHJlcmVsZWFzZSBpcyBhZGRlZCB3aGVuIGxvY2FsIGV4dGVuc2lvbiB3aXRob3V0IHByZXJlbGVhc2UgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIHdpdGhvdXQgcHJlcmVsZWFzZSBpcyBhZGRlZCB3aGVuIGxvY2FsIGV4dGVuc2lvbiB3aXRoIHByZXJlbGVhc2UgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gcHJlcmVsZWFzZScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbG9jYWxFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHJlbGVhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGxvY2FsRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHByZXJlbGVhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gaXMgY2hhbmdlZCB0byByZWxlYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIC0gcmVtb3RlIHByZVJlbGVhc2UgcHJvcGVydHkgaXMgdGFrZW4gcHJlY2VkZW5jZSB3aGVuIHRoZXJlIGFyZSBubyB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIC0gcmVtb3RlIHByZVJlbGVhc2UgcHJvcGVydHkgaXMgdGFrZW4gcHJlY2VkZW5jZSB3aGVuIHRoZXJlIGFyZSB1cGRhdGVzIGxvY2FsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UsIGRpc2FibGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSwgZGlzYWJsZWQ6IHRydWUgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSBwcmVSZWxlYXNlIHByb3BlcnR5IGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgdXBkYXRlcyByZW1vdGVseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSwgZGlzYWJsZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIC0gcmVtb3RlIHZlcnNpb24gaXMgdGFrZW4gcHJlY2VkZW5jZSB3aGVuIHRoZXJlIGFyZSBubyB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJyB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIC0gcmVtb3RlIHZlcnNpb24gaXMgdGFrZW4gcHJlY2VkZW5jZSB3aGVuIHRoZXJlIGFyZSB1cGRhdGVzIGxvY2FsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UsIGRpc2FibGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJyB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJywgZGlzYWJsZWQ6IHRydWUgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSB2ZXJzaW9uIHByb3BlcnR5IGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgdXBkYXRlcyByZW1vdGVseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJywgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJywgZGlzYWJsZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgYnVpbHRpbiBleHRlbnNpb24sIGxvY2FsIGRvZXMgbm90IGhhdmUgZXh0ZW5zaW9uLCByZW1vdGUgaGFzIGV4dGVuc2lvbiBpbnN0YWxsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJywgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBiYXNlIGhhcyBpbnN0YWxsZWQgZXh0ZW5zaW9uLCBsb2NhbCBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgcmVtb3RlIGhhcyBleHRlbnNpb24gYnVpbHRpbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFt7IGlkOiAnYScsIHV1aWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBiYXNlIGhhcyBpbnN0YWxsZWQgZXh0ZW5zaW9uLCBsb2NhbCBoYXMgYnVpbHRpbiBleHRlbnNpb24sIHJlbW90ZSBkb2VzIG5vdCBoYXMgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZEJ1aWx0aW5TeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgYnVpbHRpbiBleHRlbnNpb24sIGxvY2FsIGhhcyBpbnN0YWxsZWQgZXh0ZW5zaW9uLCByZW1vdGUgaGFzIGJ1aWx0aW4gZXh0ZW5zaW9uIHdpdGggdXBkYXRlZCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSwgc3RhdGU6IHsgJ2EnOiAxIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW3sgaWQ6ICdhJywgdXVpZDogJ2EnIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHN0YXRlOiB7ICdhJzogMSB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHN0YXRlOiB7ICdhJzogMSB9IH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBiYXNlIGhhcyBpbnN0YWxsZWQgZXh0ZW5zaW9uLCBsYXN0IHRpbWUgc3luY2VkIGFzIGJ1aWx0aW4gZXh0ZW5zaW9uLCBsb2NhbCBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgcmVtb3RlIGhhcyBidWlsdGluIGV4dGVuc2lvbiB3aXRoIHVwZGF0ZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UsIHN0YXRlOiB7ICdhJzogMSB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFt7IGlkOiAnYScsIHV1aWQ6ICdhJyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBzdGF0ZTogeyAnYSc6IDEgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBzdGF0ZTogeyAnYSc6IDEgfSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgYnVpbHRpbiBleHRlbnNpb24sIGxvY2FsIGRvZXMgbm90IGhhdmUgZXh0ZW5zaW9uLCByZW1vdGUgaGFzIGJ1aWx0aW4gZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcsIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnLCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgbGFzdCBzeW5jZWQgYXMgYnVpbHRpbiwgbG9jYWwgZG9lcyBub3QgaGF2ZSBleHRlbnNpb24sIHJlbW90ZSBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJyB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBiYXNlIGhhcyBidWlsdGluIGV4dGVuc2lvbiwgbGFzdCBzeW5jZWQgYXMgYnVpbHRpbiwgbG9jYWwgZG9lcyBub3QgaGF2ZSBleHRlbnNpb24sIHJlbW90ZSBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnLCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJyB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIHdpdGggcGlubmVkIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiB3aXRoIHBpbm5lZCBpcyBhZGRlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gd2l0aCBwaW5uZWQgaXMgYWRkZWQgd2hlbiBsb2NhbCBleHRlbnNpb24gd2l0aG91dCBwaW5uZWQgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbnVsbCwgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiB3aXRob3V0IHBpbm5lZCBpcyBhZGRlZCB3aGVuIGxvY2FsIGV4dGVuc2lvbiB3aXRoIHBpbm5lZCBpcyBhZGRlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHBpbm5lZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBsb2NhbEV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gaXMgY2hhbmdlZCB0byB1bnBpbm5lZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBsb2NhbEV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gaXMgY2hhbmdlZCB0byBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gdW5waW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSBwaW5uZWQgcHJvcGVydHkgaXMgdGFrZW4gcHJlY2VkZW5jZSB3aGVuIHRoZXJlIGFyZSBubyB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gbm90IGFuIGluc3RhbGxlZCBleHRlbnNpb24gLSByZW1vdGUgcGlubmVkIHByb3BlcnR5IGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgdXBkYXRlcyBsb2NhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlLCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlLCBkaXNhYmxlZDogdHJ1ZSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIC0gcmVtb3RlIHBpbm5lZCBwcm9wZXJ0eSBpcyB0YWtlbiBwcmVjZWRlbmNlIHdoZW4gdGhlcmUgYXJlIHVwZGF0ZXMgcmVtb3RlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlLCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUsIGRpc2FibGVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHBpbm5lZCBhbmQgdmVyc2lvbiBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnLCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnLCBwaW5uZWQ6IHRydWUgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHVucGlubmVkIGFuZCB2ZXJzaW9uIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnLCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gaXMgY2hhbmdlZCB0byBwaW5uZWQgYW5kIHZlcnNpb24gY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcwLjAuMScsIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBsb2NhbEV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4xJywgcGlubmVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHBpbm5lZCBhbmQgdmVyc2lvbiBjaGFuZ2VkIGFuZCByZW1vdGUgZXh0ZW5zaW9uIGlzIGNoYW5uZ2VkIHRvIHBpbm5lZCB3aXRoIGRpZmZlcmVudCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnLCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjInLCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjInLCBwaW5uZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHVucGlubmVkIGFuZCB2ZXJzaW9uIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcwLjAuMScsIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbG9jYWxFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gdW5waW5uZWQgYW5kIHZlcnNpb24gY2hhbmdlZCBhbmQgcmVtb3RlIGV4dGVuc2lvbiBpcyBjaGFubmdlZCB0byB1bnBpbm5lZCB3aXRoIGRpZmZlcmVudCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4yJyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgYWRkaW5nIGxvY2FsIGFwcGxpY2F0aW9uIHNjb3BlZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgbnVsbCwgbnVsbCwgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGxvY2FsRXh0ZW5zaW9ucyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgbWVyZ2luZyBsb2NhbCBleHRlbnNpb24gd2l0aCBpc0FwcGxpY2F0aW9uU2NvcGVkIHByb3BlcnR5IGFuZCByZW1vdGUgZG9lcyBub3QgaGFzIGlzQXBwbGljYXRpb25TY29wZWQgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgbWVyZ2luZyB3aGVuIGFwcGxpY2FpdG9uIHNjb3BlIGlzIGNoYW5nZWQgbG9jYWxseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaXNBcHBsaWNhdGlvblNjb3BlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGxvY2FsRXh0ZW5zaW9ucyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgbWVyZ2luZyB3aGVuIGFwcGxpY2FpdG9uIHNjb3BlIGlzIGNoYW5nZWQgcmVtb3RlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaXNBcHBsaWNhdGlvblNjb3BlZDogZmFsc2UgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaXNBcHBsaWNhdGlvblNjb3BlZDogdHJ1ZSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGRvZXMgbm90IHJlbW92ZSByZW1vdGUgZXh0ZW5zaW9uIHdoZW4gc2tpcHBlZCBleHRlbnNpb24gaGFzIHV1aWQgYnV0IHJlbW90ZSBkb2VzIG5vdCBoYXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbYVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBkb2VzIG5vdCByZW1vdmUgcmVtb3RlIGV4dGVuc2lvbiB3aGVuIGxhc3Qgc3luYyBidWlsdGluIGV4dGVuc2lvbiBoYXMgdXVpZCBidXQgcmVtb3RlIGRvZXMgbm90IGhhcycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW3sgaWQ6ICdiJywgdXVpZDogJ2InIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhbkV4cGVjdGVkU3luY0V4dGVuc2lvbihleHRlbnNpb246IFBhcnRpYWw8SVN5bmNFeHRlbnNpb24+KTogSVN5bmNFeHRlbnNpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdHBpbm5lZDogZmFsc2UsXG5cdFx0XHRwcmVSZWxlYXNlOiBmYWxzZSxcblx0XHRcdGluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdC4uLmV4dGVuc2lvblxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBhbkV4cGVjdGVkQnVpbHRpblN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uOiBQYXJ0aWFsPElTeW5jRXh0ZW5zaW9uPik6IElTeW5jRXh0ZW5zaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSxcblx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRwaW5uZWQ6IGZhbHNlLFxuXHRcdFx0cHJlUmVsZWFzZTogZmFsc2UsXG5cdFx0XHQuLi5leHRlbnNpb25cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYUxvY2FsU3luY0V4dGVuc2lvbihleHRlbnNpb246IFBhcnRpYWw8SUxvY2FsU3luY0V4dGVuc2lvbj4pOiBJTG9jYWxTeW5jRXh0ZW5zaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSxcblx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRwaW5uZWQ6IGZhbHNlLFxuXHRcdFx0cHJlUmVsZWFzZTogZmFsc2UsXG5cdFx0XHRpbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHQuLi5leHRlbnNpb25cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYVJlbW90ZVN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uOiBQYXJ0aWFsPElMb2NhbFN5bmNFeHRlbnNpb24+KTogSUxvY2FsU3luY0V4dGVuc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0cGlubmVkOiBmYWxzZSxcblx0XHRcdHByZVJlbGVhc2U6IGZhbHNlLFxuXHRcdFx0aW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0Li4uZXh0ZW5zaW9uXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFTeW5jRXh0ZW5zaW9uKGV4dGVuc2lvbjogUGFydGlhbDxJU3luY0V4dGVuc2lvbj4pOiBJU3luY0V4dGVuc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0aW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0Li4uZXh0ZW5zaW9uXG5cdFx0fTtcblx0fVxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFHdEIsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QiwwQ0FBd0M7QUFFeEMsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLGtCQUFrQjtBQUFBLE1BQ3ZCLG9CQUFvQixFQUFFLFlBQVksRUFBRSxJQUFJLEtBQUssTUFBTSxJQUFJLEVBQUUsQ0FBQztBQUFBLE1BQzFELG9CQUFvQixFQUFFLFlBQVksRUFBRSxJQUFJLEtBQUssTUFBTSxJQUFJLEVBQUUsQ0FBQztBQUFBLE1BQzFELG9CQUFvQixFQUFFLFlBQVksRUFBRSxJQUFJLEtBQUssTUFBTSxJQUFJLEVBQUUsQ0FBQztBQUFBLElBQzNEO0FBRUEsVUFBTSxTQUFTLE1BQU0saUJBQWlCLE1BQU0sTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUU1RCxXQUFPLGdCQUFnQixPQUFPLE1BQU0sT0FBTyxDQUFDLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsT0FBTyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQy9DLFdBQU8sZ0JBQWdCLE9BQU8sTUFBTSxTQUFTLENBQUMsQ0FBQztBQUMvQyxXQUFPLGdCQUFnQixPQUFPLFFBQVEsS0FBSyxlQUFlO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssa0ZBQWtGLE1BQU07QUFDNUYsVUFBTSxrQkFBa0I7QUFBQSxNQUN2QixvQkFBb0IsRUFBRSxZQUFZLEVBQUUsSUFBSSxLQUFLLE1BQU0sSUFBSSxF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
