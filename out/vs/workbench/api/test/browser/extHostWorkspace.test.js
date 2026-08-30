import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { basename } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { RelativePattern } from "../../common/extHostTypes.js";
import { ExtHostWorkspace } from "../../common/extHostWorkspace.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { ExtHostRpcService } from "../../common/extHostRpcService.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { nullExtensionDescription as extensionDescriptor } from "../../../services/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ExcludeSettingOptions } from "../../../services/search/common/searchExtTypes.js";
function createExtHostWorkspace(mainContext, data, logService) {
  mainContext.set(MainContext.MainThreadTelemetry, new class extends mock() {
    $publicLog2() {
    }
  }());
  const result = new ExtHostWorkspace(
    new ExtHostRpcService(mainContext),
    new class extends mock() {
      constructor() {
        super(...arguments);
        this.workspace = data;
      }
    }(),
    new class extends mock() {
      getCapabilities() {
        return isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : void 0;
      }
    }(),
    logService,
    new class extends mock() {
    }()
  );
  result.$initializeWorkspace(data, true);
  return result;
}
suite("ExtHostWorkspace", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertAsRelativePath(workspace, input, expected, includeWorkspace) {
    const actual = workspace.getRelativePath(input, includeWorkspace);
    assert.strictEqual(actual, expected);
  }
  test("asRelativePath", () => {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/Applications/NewsWoWBot"), 0)], name: "Test" }, new NullLogService());
    assertAsRelativePath(ws, "/Coding/Applications/NewsWoWBot/bernd/das/brot", "bernd/das/brot");
    assertAsRelativePath(
      ws,
      "/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart",
      "/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart"
    );
    assertAsRelativePath(ws, "", "");
    assertAsRelativePath(ws, "/foo/bar", "/foo/bar");
    assertAsRelativePath(ws, "in/out", "in/out");
  });
  test("asRelativePath, same paths, #11402", function() {
    const root = "/home/aeschli/workspaces/samples/docker";
    const input = "/home/aeschli/workspaces/samples/docker";
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
    assertAsRelativePath(ws, input, input);
    const input2 = "/home/aeschli/workspaces/samples/docker/a.file";
    assertAsRelativePath(ws, input2, "a.file");
  });
  test("asRelativePath, no workspace", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), null, new NullLogService());
    assertAsRelativePath(ws, "", "");
    assertAsRelativePath(ws, "/foo/bar", "/foo/bar");
  });
  test("asRelativePath, multiple folders", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0), aWorkspaceFolderData(URI.file("/Coding/Two"), 1)], name: "Test" }, new NullLogService());
    assertAsRelativePath(ws, "/Coding/One/file.txt", "One/file.txt");
    assertAsRelativePath(ws, "/Coding/Two/files/out.txt", "Two/files/out.txt");
    assertAsRelativePath(ws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt");
  });
  test("slightly inconsistent behaviour of asRelativePath and getWorkspaceFolder, #31553", function() {
    const mrws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0), aWorkspaceFolderData(URI.file("/Coding/Two"), 1)], name: "Test" }, new NullLogService());
    assertAsRelativePath(mrws, "/Coding/One/file.txt", "One/file.txt");
    assertAsRelativePath(mrws, "/Coding/One/file.txt", "One/file.txt", true);
    assertAsRelativePath(mrws, "/Coding/One/file.txt", "file.txt", false);
    assertAsRelativePath(mrws, "/Coding/Two/files/out.txt", "Two/files/out.txt");
    assertAsRelativePath(mrws, "/Coding/Two/files/out.txt", "Two/files/out.txt", true);
    assertAsRelativePath(mrws, "/Coding/Two/files/out.txt", "files/out.txt", false);
    assertAsRelativePath(mrws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt");
    assertAsRelativePath(mrws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", true);
    assertAsRelativePath(mrws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", false);
    const srws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0)], name: "Test" }, new NullLogService());
    assertAsRelativePath(srws, "/Coding/One/file.txt", "file.txt");
    assertAsRelativePath(srws, "/Coding/One/file.txt", "file.txt", false);
    assertAsRelativePath(srws, "/Coding/One/file.txt", "One/file.txt", true);
    assertAsRelativePath(srws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt");
    assertAsRelativePath(srws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", true);
    assertAsRelativePath(srws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", false);
  });
  test("getPath, legacy", function() {
    let ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    assert.strictEqual(ws.getPath(), void 0);
    ws = createExtHostWorkspace(new TestRPCProtocol(), null, new NullLogService());
    assert.strictEqual(ws.getPath(), void 0);
    ws = createExtHostWorkspace(new TestRPCProtocol(), void 0, new NullLogService());
    assert.strictEqual(ws.getPath(), void 0);
    ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.file("Folder"), 0), aWorkspaceFolderData(URI.file("Another/Folder"), 1)] }, new NullLogService());
    assert.strictEqual(ws.getPath().replace(/\\/g, "/"), "/Folder");
    ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.file("/Folder"), 0)] }, new NullLogService());
    assert.strictEqual(ws.getPath().replace(/\\/g, "/"), "/Folder");
  });
  test("WorkspaceFolder has name and index", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0), aWorkspaceFolderData(URI.file("/Coding/Two"), 1)], name: "Test" }, new NullLogService());
    const [one, two] = ws.getWorkspaceFolders();
    assert.strictEqual(one.name, "One");
    assert.strictEqual(one.index, 0);
    assert.strictEqual(two.name, "Two");
    assert.strictEqual(two.index, 1);
  });
  test("getContainingWorkspaceFolder", () => {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), {
      id: "foo",
      name: "Test",
      folders: [
        aWorkspaceFolderData(URI.file("/Coding/One"), 0),
        aWorkspaceFolderData(URI.file("/Coding/Two"), 1),
        aWorkspaceFolderData(URI.file("/Coding/Two/Nested"), 2)
      ]
    }, new NullLogService());
    let folder = ws.getWorkspaceFolder(URI.file("/foo/bar"));
    assert.strictEqual(folder, void 0);
    folder = ws.getWorkspaceFolder(URI.file("/Coding/One/file/path.txt"));
    assert.strictEqual(folder.name, "One");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/file/path.txt"));
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nest"));
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/file"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/f"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested"), true);
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/"), true);
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two"), true);
    assert.strictEqual(folder, void 0);
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two"), false);
    assert.strictEqual(folder.name, "Two");
  });
  test("Multiroot change event should have a delta, #29641", function(done) {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    let finished = false;
    const finish = (error) => {
      if (!finished) {
        finished = true;
        done(error);
      }
    };
    let sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.added, []);
        assert.deepStrictEqual(e.removed, []);
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [] });
    sub.dispose();
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar");
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] });
    sub.dispose();
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar2");
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0), aWorkspaceFolderData(URI.parse("foo:bar2"), 1)] });
    sub.dispose();
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.removed.length, 2);
        assert.strictEqual(e.removed[0].uri.toString(), "foo:bar");
        assert.strictEqual(e.removed[1].uri.toString(), "foo:bar2");
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar3");
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0)] });
    sub.dispose();
    finish();
  });
  test("Multiroot change keeps existing workspaces live", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] }, new NullLogService());
    const firstFolder = ws.getWorkspaceFolders()[0];
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar2"), 0), aWorkspaceFolderData(URI.parse("foo:bar"), 1, "renamed")] });
    assert.strictEqual(ws.getWorkspaceFolders()[1], firstFolder);
    assert.strictEqual(firstFolder.index, 1);
    assert.strictEqual(firstFolder.name, "renamed");
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0), aWorkspaceFolderData(URI.parse("foo:bar2"), 1), aWorkspaceFolderData(URI.parse("foo:bar"), 2)] });
    assert.strictEqual(ws.getWorkspaceFolders()[2], firstFolder);
    assert.strictEqual(firstFolder.index, 2);
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0)] });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0), aWorkspaceFolderData(URI.parse("foo:bar"), 1)] });
    assert.notStrictEqual(firstFolder, ws.workspace.folders[0]);
  });
  test("updateWorkspaceFolders - invalid arguments", function() {
    let ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, null, null));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 0));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 1));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 1, 0));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, -1, 0));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, -1, -1));
    ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] }, new NullLogService());
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 1, 1));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 1, asUpdateWorkspaceFolderData(URI.parse("foo:bar"))));
  });
  test("updateWorkspaceFolders - valid arguments", function(done) {
    let finished = false;
    const finish = (error) => {
      if (!finished) {
        finished = true;
        done(error);
      }
    };
    const protocol = {
      getProxy: () => {
        return void 0;
      },
      set: () => {
        return void 0;
      },
      dispose: () => {
      },
      assertRegistered: () => {
      },
      drain: () => {
        return void 0;
      }
    };
    const ws = createExtHostWorkspace(protocol, { id: "foo", name: "Test", folders: [] }, new NullLogService());
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 0, asUpdateWorkspaceFolderData(URI.parse("foo:bar"))));
    assert.strictEqual(1, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    const firstAddedFolder = ws.getWorkspaceFolders()[0];
    let gotEvent = false;
    let sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar");
        assert.strictEqual(e.added[0], firstAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 1, 0, asUpdateWorkspaceFolderData(URI.parse("foo:bar1")), asUpdateWorkspaceFolderData(URI.parse("foo:bar2"))));
    assert.strictEqual(3, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar1").toString());
    assert.strictEqual(ws.workspace.folders[2].uri.toString(), URI.parse("foo:bar2").toString());
    const secondAddedFolder = ws.getWorkspaceFolders()[1];
    const thirdAddedFolder = ws.getWorkspaceFolders()[2];
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 2);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar1");
        assert.strictEqual(e.added[1].uri.toString(), "foo:bar2");
        assert.strictEqual(e.added[0], secondAddedFolder);
        assert.strictEqual(e.added[1], thirdAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0), aWorkspaceFolderData(URI.parse("foo:bar1"), 1), aWorkspaceFolderData(URI.parse("foo:bar2"), 2)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], secondAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[2], thirdAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 2, 1));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar1").toString());
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.added, []);
        assert.strictEqual(e.removed.length, 1);
        assert.strictEqual(e.removed[0], thirdAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0), aWorkspaceFolderData(URI.parse("foo:bar1"), 1)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], secondAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2, asUpdateWorkspaceFolderData(URI.parse("foo:bar"), "renamed 1"), asUpdateWorkspaceFolderData(URI.parse("foo:bar1"), "renamed 2")));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar1").toString());
    assert.strictEqual(ws.workspace.folders[0].name, "renamed 1");
    assert.strictEqual(ws.workspace.folders[1].name, "renamed 2");
    assert.strictEqual(ws.getWorkspaceFolders()[0].name, "renamed 1");
    assert.strictEqual(ws.getWorkspaceFolders()[1].name, "renamed 2");
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.added, []);
        assert.strictEqual(e.removed.length, 0);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0, "renamed 1"), aWorkspaceFolderData(URI.parse("foo:bar1"), 1, "renamed 2")] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], secondAddedFolder);
    assert.strictEqual(ws.workspace.folders[0].name, "renamed 1");
    assert.strictEqual(ws.workspace.folders[1].name, "renamed 2");
    assert.strictEqual(ws.getWorkspaceFolders()[0].name, "renamed 1");
    assert.strictEqual(ws.getWorkspaceFolders()[1].name, "renamed 2");
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2, asUpdateWorkspaceFolderData(URI.parse("foo:bar3")), asUpdateWorkspaceFolderData(URI.parse("foo:bar4"))));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar3").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar4").toString());
    const fourthAddedFolder = ws.getWorkspaceFolders()[0];
    const fifthAddedFolder = ws.getWorkspaceFolders()[1];
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.added.length, 2);
        assert.strictEqual(e.added[0], fourthAddedFolder);
        assert.strictEqual(e.added[1], fifthAddedFolder);
        assert.strictEqual(e.removed.length, 2);
        assert.strictEqual(e.removed[0], firstAddedFolder);
        assert.strictEqual(e.removed[1], secondAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0), aWorkspaceFolderData(URI.parse("foo:bar4"), 1)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], fourthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fifthAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2, asUpdateWorkspaceFolderData(URI.parse("foo:bar4")), asUpdateWorkspaceFolderData(URI.parse("foo:bar3"))));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar4").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar3").toString());
    assert.strictEqual(ws.getWorkspaceFolders()[0], fifthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fourthAddedFolder);
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.added.length, 0);
        assert.strictEqual(e.removed.length, 0);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar4"), 0), aWorkspaceFolderData(URI.parse("foo:bar3"), 1)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], fifthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fourthAddedFolder);
    assert.strictEqual(fifthAddedFolder.index, 0);
    assert.strictEqual(fourthAddedFolder.index, 1);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 2, 0, asUpdateWorkspaceFolderData(URI.parse("foo:bar5"))));
    assert.strictEqual(3, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar4").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar3").toString());
    assert.strictEqual(ws.workspace.folders[2].uri.toString(), URI.parse("foo:bar5").toString());
    const sixthAddedFolder = ws.getWorkspaceFolders()[2];
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0], sixthAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({
      id: "foo",
      name: "Test",
      folders: [
        aWorkspaceFolderData(URI.parse("foo:bar4"), 0),
        aWorkspaceFolderData(URI.parse("foo:bar3"), 1),
        aWorkspaceFolderData(URI.parse("foo:bar5"), 2)
      ]
    });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], fifthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fourthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[2], sixthAddedFolder);
    finish();
  });
  test("Multiroot change event is immutable", function(done) {
    let finished = false;
    const finish = (error) => {
      if (!finished) {
        finished = true;
        done(error);
      }
    };
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    const sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.throws(() => {
          e.added = [];
        });
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [] });
    sub.dispose();
    finish();
  });
  test("`vscode.workspace.getWorkspaceFolder(file)` don't return workspace folder when file open from command line. #36221", function() {
    if (isWindows) {
      const ws = createExtHostWorkspace(new TestRPCProtocol(), {
        id: "foo",
        name: "Test",
        folders: [
          aWorkspaceFolderData(URI.file("c:/Users/marek/Desktop/vsc_test/"), 0)
        ]
      }, new NullLogService());
      assert.ok(ws.getWorkspaceFolder(URI.file("c:/Users/marek/Desktop/vsc_test/a.txt")));
      assert.ok(ws.getWorkspaceFolder(URI.file("C:/Users/marek/Desktop/vsc_test/b.txt")));
    }
  });
  function aWorkspaceFolderData(uri, index, name = "") {
    return {
      uri,
      index,
      name: name || basename(uri.path)
    };
  }
  function asUpdateWorkspaceFolderData(uri, name) {
    return { uri, name };
  }
  suite("findFiles -", function() {
    test("string include", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, "foo");
          assert.strictEqual(_includeFolder, null);
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.maxResults, 10);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles("foo", void 0, 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    function testFindFilesInclude(pattern) {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, "glob/**");
          assert.deepStrictEqual(_includeFolder ? URI.from(_includeFolder).toJSON() : null, URI.file("/other/folder").toJSON());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles(pattern, void 0, 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    }
    test("RelativePattern include (string)", () => {
      return testFindFilesInclude(new RelativePattern("/other/folder", "glob/**"));
    });
    test("RelativePattern include (URI)", () => {
      return testFindFilesInclude(new RelativePattern(URI.file("/other/folder"), "glob/**"));
    });
    test("no excludes", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, "glob/**");
          assert.deepStrictEqual(URI.revive(_includeFolder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, true);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles(new RelativePattern("/other/folder", "glob/**"), null, 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("with cancelled token", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token2) {
          mainThreadCalled = true;
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      return ws.findFiles(new RelativePattern("/other/folder", "glob/**"), null, 10, new ExtensionIdentifier("test"), token).then(() => {
        assert(!mainThreadCalled, "!mainThreadCalled");
      });
    });
    test("RelativePattern exclude", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles("", new RelativePattern(root, "glob/**"), 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
  });
  suite("findFiles2 -", function() {
    test("string include", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.filePattern, "foo");
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(_includeFolder, null);
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.maxResults, 10);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2(["foo"], { maxResults: 10, useExcludeSettings: ExcludeSettingOptions.FilesExclude }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    function testFindFiles2Include(pattern) {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.filePattern, "glob/**");
          assert.strictEqual(options.includePattern, void 0);
          assert.deepStrictEqual(_includeFolder ? URI.from(_includeFolder).toJSON() : null, URI.file("/other/folder").toJSON());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2(pattern, { maxResults: 10 }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    }
    test("RelativePattern include (string)", () => {
      return testFindFiles2Include([new RelativePattern("/other/folder", "glob/**")]);
    });
    test("RelativePattern include (URI)", () => {
      return testFindFiles2Include([new RelativePattern(URI.file("/other/folder"), "glob/**")]);
    });
    test("no excludes", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.filePattern, "glob/**");
          assert.strictEqual(options.includePattern, void 0);
          assert.deepStrictEqual(URI.revive(_includeFolder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([new RelativePattern("/other/folder", "glob/**")], {}, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("no dups", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve([URI.file(root + "/main.py")]);
        }
      }());
      const folders = [aWorkspaceFolderData(URI.file(root), 0)];
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders, name: "Test" }, new NullLogService());
      return ws.findFiles2(["**/main.py", "**/main.py/**"], {}, new ExtensionIdentifier("test")).then((uris) => {
        assert(mainThreadCalled, "mainThreadCalled");
        assert.equal(uris.length, 1);
        assert.equal(uris[0].toString(), URI.file(root + "/main.py").toString());
      });
    });
    test("with cancelled token", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token2) {
          mainThreadCalled = true;
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      return ws.findFiles2([new RelativePattern("/other/folder", "glob/**")], {}, new ExtensionIdentifier("test"), token).then(() => {
        assert(!mainThreadCalled, "!mainThreadCalled");
      });
    });
    test("RelativePattern exclude", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { exclude: [new RelativePattern(root, "glob/**")] }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("useIgnoreFiles", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.disregardIgnoreFiles, false);
          assert.strictEqual(options.disregardGlobalIgnoreFiles, false);
          assert.strictEqual(options.disregardParentIgnoreFiles, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { useIgnoreFiles: { local: true, parent: true, global: true } }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("use symlinks", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.ignoreSymlinks, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { followSymlinks: true }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("caseInsensitive", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.ignoreGlobCase, true);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { caseInsensitive: true }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
  });
  suite("findTextInFiles -", function() {
    test("no include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, {}, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("string include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, "**/files");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, { include: "**/files" }, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("RelativePattern include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(URI.revive(folder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.includePattern, "glob/**");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, { include: new RelativePattern("/other/folder", "glob/**") }, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("with cancelled token", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token2) {
          mainThreadCalled = true;
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      await ws.findTextInFiles({ pattern: "foo" }, {}, () => {
      }, new ExtensionIdentifier("test"), token);
      assert(!mainThreadCalled, "!mainThreadCalled");
    });
    test("RelativePattern exclude", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, { exclude: new RelativePattern("/other/folder", "glob/**") }, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
  });
  suite("findTextInFiles2 -", function() {
    test("no include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, {}, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("string include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, "**/files");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { include: ["**/files"] }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("RelativePattern include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(URI.revive(folder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.includePattern, "glob/**");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { include: [new RelativePattern("/other/folder", "glob/**")] }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("with cancelled token", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token2) {
          mainThreadCalled = true;
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      await ws.findTextInFiles2({ pattern: "foo" }, void 0, new ExtensionIdentifier("test"), token).complete;
      assert(!mainThreadCalled, "!mainThreadCalled");
    });
    test("RelativePattern exclude", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { exclude: [new RelativePattern("/other/folder", "glob/**")] }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("caseInsensitive", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.ignoreGlobCase, true);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { caseInsensitive: true }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdFdvcmtzcGFjZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSU1haW5Db250ZXh0LCBJV29ya3NwYWNlRGF0YSwgTWFpbkNvbnRleHQsIElUZXh0U2VhcmNoQ29tcGxldGUsIE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFJlbGF0aXZlUGF0dGVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgVGVzdFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgSVBhdHRlcm5JbmZvIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RmlsZVN5c3RlbUluZm8uanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiBhcyBleHRlbnNpb25EZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RVcmlUcmFuc2Zvcm1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFeGNsdWRlU2V0dGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShtYWluQ29udGV4dDogSU1haW5Db250ZXh0LCBkYXRhOiBJV29ya3NwYWNlRGF0YSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBFeHRIb3N0V29ya3NwYWNlIHtcblx0bWFpbkNvbnRleHQuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZWxlbWV0cnksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFRlbGVtZXRyeVNoYXBlPigpIHtcblx0XHRvdmVycmlkZSAkcHVibGljTG9nMigpOiB2b2lkIHsgfVxuXHR9KTtcblx0Y29uc3QgcmVzdWx0ID0gbmV3IEV4dEhvc3RXb3Jrc3BhY2UoXG5cdFx0bmV3IEV4dEhvc3RScGNTZXJ2aWNlKG1haW5Db250ZXh0KSxcblx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgd29ya3NwYWNlID0gZGF0YTsgfSxcblx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0RmlsZVN5c3RlbUluZm8+KCkgeyBvdmVycmlkZSBnZXRDYXBhYmlsaXRpZXMoKSB7IHJldHVybiBpc0xpbnV4ID8gRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlIDogdW5kZWZpbmVkOyB9IH0sXG5cdFx0bG9nU2VydmljZSxcblx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVUklUcmFuc2Zvcm1lclNlcnZpY2U+KCkgeyB9XG5cdCk7XG5cdHJlc3VsdC4kaW5pdGlhbGl6ZVdvcmtzcGFjZShkYXRhLCB0cnVlKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuc3VpdGUoJ0V4dEhvc3RXb3Jrc3BhY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0QXNSZWxhdGl2ZVBhdGgod29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlLCBpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nLCBpbmNsdWRlV29ya3NwYWNlPzogYm9vbGVhbikge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHdvcmtzcGFjZS5nZXRSZWxhdGl2ZVBhdGgoaW5wdXQsIGluY2x1ZGVXb3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ2FzUmVsYXRpdmVQYXRoJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9BcHBsaWNhdGlvbnMvTmV3c1dvV0JvdCcpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJy9Db2RpbmcvQXBwbGljYXRpb25zL05ld3NXb1dCb3QvYmVybmQvZGFzL2Jyb3QnLCAnYmVybmQvZGFzL2Jyb3QnKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJy9BcHBzL0RhcnRQdWJDYWNoZS9ob3N0ZWQvcHViLmRhcnRsYW5nLm9yZy9jb252ZXJ0LTIuMC4xL2xpYi9zcmMvaGV4LmRhcnQnLFxuXHRcdFx0Jy9BcHBzL0RhcnRQdWJDYWNoZS9ob3N0ZWQvcHViLmRhcnRsYW5nLm9yZy9jb252ZXJ0LTIuMC4xL2xpYi9zcmMvaGV4LmRhcnQnKTtcblxuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHdzLCAnJywgJycpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHdzLCAnL2Zvby9iYXInLCAnL2Zvby9iYXInKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJ2luL291dCcsICdpbi9vdXQnKTtcblx0fSk7XG5cblx0dGVzdCgnYXNSZWxhdGl2ZVBhdGgsIHNhbWUgcGF0aHMsICMxMTQwMicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByb290ID0gJy9ob21lL2Flc2NobGkvd29ya3NwYWNlcy9zYW1wbGVzL2RvY2tlcic7XG5cdFx0Y29uc3QgaW5wdXQgPSAnL2hvbWUvYWVzY2hsaS93b3Jrc3BhY2VzL3NhbXBsZXMvZG9ja2VyJztcblx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgaW5wdXQsIGlucHV0KTtcblxuXHRcdGNvbnN0IGlucHV0MiA9ICcvaG9tZS9hZXNjaGxpL3dvcmtzcGFjZXMvc2FtcGxlcy9kb2NrZXIvYS5maWxlJztcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgaW5wdXQyLCAnYS5maWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FzUmVsYXRpdmVQYXRoLCBubyB3b3Jrc3BhY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgbnVsbCEsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJycsICcnKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJy9mb28vYmFyJywgJy9mb28vYmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FzUmVsYXRpdmVQYXRoLCBtdWx0aXBsZSBmb2xkZXJzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvT25lJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9Ud28nKSwgMSldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHdzLCAnL0NvZGluZy9PbmUvZmlsZS50eHQnLCAnT25lL2ZpbGUudHh0Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICcvQ29kaW5nL1R3by9maWxlcy9vdXQudHh0JywgJ1R3by9maWxlcy9vdXQudHh0Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbGlnaHRseSBpbmNvbnNpc3RlbnQgYmVoYXZpb3VyIG9mIGFzUmVsYXRpdmVQYXRoIGFuZCBnZXRXb3Jrc3BhY2VGb2xkZXIsICMzMTU1MycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtcndzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvT25lJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9Ud28nKSwgMSldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvT25lL2ZpbGUudHh0JywgJ09uZS9maWxlLnR4dCcpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL09uZS9maWxlLnR4dCcsICdPbmUvZmlsZS50eHQnLCB0cnVlKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChtcndzLCAnL0NvZGluZy9PbmUvZmlsZS50eHQnLCAnZmlsZS50eHQnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvVHdvL2ZpbGVzL291dC50eHQnLCAnVHdvL2ZpbGVzL291dC50eHQnKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChtcndzLCAnL0NvZGluZy9Ud28vZmlsZXMvb3V0LnR4dCcsICdUd28vZmlsZXMvb3V0LnR4dCcsIHRydWUpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL1R3by9maWxlcy9vdXQudHh0JywgJ2ZpbGVzL291dC50eHQnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgZmFsc2UpO1xuXG5cdFx0Y29uc3Qgc3J3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvQ29kaW5nL09uZScpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgoc3J3cywgJy9Db2RpbmcvT25lL2ZpbGUudHh0JywgJ2ZpbGUudHh0Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgoc3J3cywgJy9Db2RpbmcvT25lL2ZpbGUudHh0JywgJ2ZpbGUudHh0JywgZmFsc2UpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHNyd3MsICcvQ29kaW5nL09uZS9maWxlLnR4dCcsICdPbmUvZmlsZS50eHQnLCB0cnVlKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChzcndzLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChzcndzLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnLCB0cnVlKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChzcndzLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBhdGgsIGxlZ2FjeScsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW10gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRQYXRoKCksIHVuZGVmaW5lZCk7XG5cblx0XHR3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCBudWxsISwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRQYXRoKCksIHVuZGVmaW5lZCk7XG5cblx0XHR3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB1bmRlZmluZWQhLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFBhdGgoKSwgdW5kZWZpbmVkKTtcblxuXHRcdHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnRm9sZGVyJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnQW5vdGhlci9Gb2xkZXInKSwgMSldIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0UGF0aCgpIS5yZXBsYWNlKC9cXFxcL2csICcvJyksICcvRm9sZGVyJyk7XG5cblx0XHR3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Gb2xkZXInKSwgMCldIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0UGF0aCgpIS5yZXBsYWNlKC9cXFxcL2csICcvJyksICcvRm9sZGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dvcmtzcGFjZUZvbGRlciBoYXMgbmFtZSBhbmQgaW5kZXgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9PbmUnKSwgMCksIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvQ29kaW5nL1R3bycpLCAxKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBbb25lLCB0d29dID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVycygpITtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbmUubmFtZSwgJ09uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbmUuaW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0d28ubmFtZSwgJ1R3bycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0d28uaW5kZXgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb250YWluaW5nV29ya3NwYWNlRm9sZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHtcblx0XHRcdGlkOiAnZm9vJyxcblx0XHRcdG5hbWU6ICdUZXN0Jyxcblx0XHRcdGZvbGRlcnM6IFtcblx0XHRcdFx0YVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvT25lJyksIDApLFxuXHRcdFx0XHRhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9Ud28nKSwgMSksXG5cdFx0XHRcdGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvQ29kaW5nL1R3by9OZXN0ZWQnKSwgMilcblx0XHRcdF1cblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRsZXQgZm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvZm9vL2JhcicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLCB1bmRlZmluZWQpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL09uZS9maWxlL3BhdGgudHh0JykpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLm5hbWUsICdPbmUnKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9Ud28vZmlsZS9wYXRoLnR4dCcpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnVHdvJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL05lc3QnKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIubmFtZSwgJ1R3bycpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL1R3by9OZXN0ZWQvZmlsZScpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnTmVzdGVkJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL05lc3RlZC9mJykpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLm5hbWUsICdOZXN0ZWQnKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9Ud28vTmVzdGVkJyksIHRydWUpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLm5hbWUsICdUd28nKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9Ud28vTmVzdGVkLycpLCB0cnVlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnVHdvJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL05lc3RlZCcpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnTmVzdGVkJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL05lc3RlZC8nKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIubmFtZSwgJ05lc3RlZCcpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL1R3bycpLCB0cnVlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlciwgdW5kZWZpbmVkKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9Ud28nKSwgZmFsc2UpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLm5hbWUsICdUd28nKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlyb290IGNoYW5nZSBldmVudCBzaG91bGQgaGF2ZSBhIGRlbHRhLCAjMjk2NDEnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFtdIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbmlzaCA9IChlcnJvcj86IGFueSkgPT4ge1xuXHRcdFx0aWYgKCFmaW5pc2hlZCkge1xuXHRcdFx0XHRmaW5pc2hlZCA9IHRydWU7XG5cdFx0XHRcdGRvbmUoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgc3ViID0gd3Mub25EaWRDaGFuZ2VXb3Jrc3BhY2UoZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUuYWRkZWQsIFtdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLnJlbW92ZWQsIFtdKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW10gfSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblxuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLnJlbW92ZWQsIFtdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWQubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWRbMF0udXJpLnRvU3RyaW5nKCksICdmb286YmFyJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMCldIH0pO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5yZW1vdmVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzBdLnVyaS50b1N0cmluZygpLCAnZm9vOmJhcjInKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMicpLCAxKV0gfSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblxuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5yZW1vdmVkWzBdLnVyaS50b1N0cmluZygpLCAnZm9vOmJhcicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5yZW1vdmVkWzFdLnVyaS50b1N0cmluZygpLCAnZm9vOmJhcjInKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZC5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXS51cmkudG9TdHJpbmcoKSwgJ2ZvbzpiYXIzJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJyksIDApXSB9KTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdGZpbmlzaCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXJvb3QgY2hhbmdlIGtlZXBzIGV4aXN0aW5nIHdvcmtzcGFjZXMgbGl2ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDApXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBmaXJzdEZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF07XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjInKSwgMCksIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAxLCAncmVuYW1lZCcpXSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBmaXJzdEZvbGRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Rm9sZGVyLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RGb2xkZXIubmFtZSwgJ3JlbmFtZWQnKTtcblxuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIyJyksIDEpLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMildIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzJdLCBmaXJzdEZvbGRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Rm9sZGVyLmluZGV4LCAyKTtcblxuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJyksIDApXSB9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDEpXSB9KTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChmaXJzdEZvbGRlciwgd3Mud29ya3NwYWNlIS5mb2xkZXJzWzBdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlV29ya3NwYWNlRm9sZGVycyAtIGludmFsaWQgYXJndW1lbnRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsc2UsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgbnVsbCEsIG51bGwhKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDAsIDApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsc2UsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMCwgMSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxzZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAxLCAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIC0xLCAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIC0xLCAtMSkpO1xuXG5cdFx0d3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAwKV0gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDEsIDEpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsc2UsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMCwgMikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxzZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAwLCAxLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJykpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVdvcmtzcGFjZUZvbGRlcnMgLSB2YWxpZCBhcmd1bWVudHMnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbmlzaCA9IChlcnJvcj86IGFueSkgPT4ge1xuXHRcdFx0aWYgKCFmaW5pc2hlZCkge1xuXHRcdFx0XHRmaW5pc2hlZCA9IHRydWU7XG5cdFx0XHRcdGRvbmUoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm90b2NvbDogSU1haW5Db250ZXh0ID0ge1xuXHRcdFx0Z2V0UHJveHk6ICgpID0+IHsgcmV0dXJuIHVuZGVmaW5lZCE7IH0sXG5cdFx0XHRzZXQ6ICgpID0+IHsgcmV0dXJuIHVuZGVmaW5lZCE7IH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRhc3NlcnRSZWdpc3RlcmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRkcmFpbjogKCkgPT4geyByZXR1cm4gdW5kZWZpbmVkITsgfSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHByb3RvY29sLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHQvL1xuXHRcdC8vIEFkZCBvbmUgZm9sZGVyXG5cdFx0Ly9cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDAsIDAsIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMSwgd3Mud29ya3NwYWNlIS5mb2xkZXJzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyJykudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBmaXJzdEFkZGVkRm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXTtcblxuXHRcdGxldCBnb3RFdmVudCA9IGZhbHNlO1xuXHRcdGxldCBzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5yZW1vdmVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzBdLnVyaS50b1N0cmluZygpLCAnZm9vOmJhcicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXSwgZmlyc3RBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdFx0XHRnb3RFdmVudCA9IHRydWU7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMCldIH0pOyAvLyBzaW11bGF0ZSBhY2tub3dsZWRnZW1lbnQgZnJvbSBtYWluIHNpZGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ290RXZlbnQsIHRydWUpO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF0sIGZpcnN0QWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblxuXHRcdC8vXG5cdFx0Ly8gQWRkIHR3byBtb3JlIGZvbGRlcnNcblx0XHQvL1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydWUsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMSwgMCwgYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjEnKSksIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIyJykpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIHdzLndvcmtzcGFjZSEuZm9sZGVycy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcicpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMV0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjEnKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzJdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXIyJykudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBzZWNvbmRBZGRlZEZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV07XG5cdFx0Y29uc3QgdGhpcmRBZGRlZEZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMl07XG5cblx0XHRnb3RFdmVudCA9IGZhbHNlO1xuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLnJlbW92ZWQsIFtdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWQubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWRbMF0udXJpLnRvU3RyaW5nKCksICdmb286YmFyMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFsxXS51cmkudG9TdHJpbmcoKSwgJ2ZvbzpiYXIyJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzBdLCBzZWNvbmRBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzFdLCB0aGlyZEFkZGVkRm9sZGVyKTtcblx0XHRcdFx0Z290RXZlbnQgPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIxJyksIDEpLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIyJyksIDIpXSB9KTsgLy8gc2ltdWxhdGUgYWNrbm93bGVkZ2VtZW50IGZyb20gbWFpbiBzaWRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdEV2ZW50LCB0cnVlKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLCBmaXJzdEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV0sIHNlY29uZEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMl0sIHRoaXJkQWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblxuXHRcdC8vXG5cdFx0Ly8gUmVtb3ZlIG9uZSBmb2xkZXJcblx0XHQvL1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydWUsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMiwgMSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgyLCB3cy53b3Jrc3BhY2UhLmZvbGRlcnMubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzBdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXInKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzFdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXIxJykudG9TdHJpbmcoKSk7XG5cblx0XHRnb3RFdmVudCA9IGZhbHNlO1xuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLmFkZGVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWQubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZFswXSwgdGhpcmRBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGdvdEV2ZW50ID0gdHJ1ZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMScpLCAxKV0gfSk7IC8vIHNpbXVsYXRlIGFja25vd2xlZGdlbWVudCBmcm9tIG1haW4gc2lkZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnb3RFdmVudCwgdHJ1ZSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXSwgZmlyc3RBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBzZWNvbmRBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXG5cdFx0Ly9cblx0XHQvLyBSZW5hbWUgZm9sZGVyXG5cdFx0Ly9cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDAsIDIsIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgJ3JlbmFtZWQgMScpLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMScpLCAncmVuYW1lZCAyJykpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgd3Mud29ya3NwYWNlIS5mb2xkZXJzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1sxXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyMScpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMF0ubmFtZSwgJ3JlbmFtZWQgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMV0ubmFtZSwgJ3JlbmFtZWQgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLm5hbWUsICdyZW5hbWVkIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXS5uYW1lLCAncmVuYW1lZCAyJyk7XG5cblx0XHRnb3RFdmVudCA9IGZhbHNlO1xuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLmFkZGVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWQubGVuZ3RoLCAwKTtcblx0XHRcdFx0Z290RXZlbnQgPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDAsICdyZW5hbWVkIDEnKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMScpLCAxLCAncmVuYW1lZCAyJyldIH0pOyAvLyBzaW11bGF0ZSBhY2tub3dsZWRnZW1lbnQgZnJvbSBtYWluIHNpZGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ290RXZlbnQsIHRydWUpO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF0sIGZpcnN0QWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXSwgc2Vjb25kQWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzBdLm5hbWUsICdyZW5hbWVkIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzFdLm5hbWUsICdyZW5hbWVkIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXS5uYW1lLCAncmVuYW1lZCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV0ubmFtZSwgJ3JlbmFtZWQgMicpO1xuXG5cdFx0Ly9cblx0XHQvLyBBZGQgYW5kIHJlbW92ZSBmb2xkZXJzXG5cdFx0Ly9cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDAsIDIsIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJykpLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNCcpKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgyLCB3cy53b3Jrc3BhY2UhLmZvbGRlcnMubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzBdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXIzJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1sxXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyNCcpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgZm91cnRoQWRkZWRGb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdO1xuXHRcdGNvbnN0IGZpZnRoQWRkZWRGb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdO1xuXG5cdFx0Z290RXZlbnQgPSBmYWxzZTtcblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzBdLCBmb3VydGhBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzFdLCBmaWZ0aEFkZGVkRm9sZGVyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5yZW1vdmVkWzBdLCBmaXJzdEFkZGVkRm9sZGVyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZFsxXSwgc2Vjb25kQWRkZWRGb2xkZXIpO1xuXHRcdFx0XHRnb3RFdmVudCA9IHRydWU7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXI0JyksIDEpXSB9KTsgLy8gc2ltdWxhdGUgYWNrbm93bGVkZ2VtZW50IGZyb20gbWFpbiBzaWRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdEV2ZW50LCB0cnVlKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLCBmb3VydGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBmaWZ0aEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cblx0XHQvL1xuXHRcdC8vIFN3YXAgZm9sZGVyc1xuXHRcdC8vXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAwLCAyLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNCcpKSwgYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjMnKSkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgd3Mud29ya3NwYWNlIS5mb2xkZXJzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyNCcpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMV0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjMnKS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLCBmaWZ0aEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV0sIGZvdXJ0aEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cblx0XHRnb3RFdmVudCA9IGZhbHNlO1xuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWQubGVuZ3RoLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZC5sZW5ndGgsIDApO1xuXHRcdFx0XHRnb3RFdmVudCA9IHRydWU7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXI0JyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJyksIDEpXSB9KTsgLy8gc2ltdWxhdGUgYWNrbm93bGVkZ2VtZW50IGZyb20gbWFpbiBzaWRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdEV2ZW50LCB0cnVlKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLCBmaWZ0aEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV0sIGZvdXJ0aEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpZnRoQWRkZWRGb2xkZXIuaW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VydGhBZGRlZEZvbGRlci5pbmRleCwgMSk7XG5cblx0XHQvL1xuXHRcdC8vIEFkZCBvbmUgZm9sZGVyIGFmdGVyIHRoZSBvdGhlciB3aXRob3V0IHdhaXRpbmcgZm9yIGNvbmZpcm1hdGlvbiAobm90IHN1cHBvcnRlZCBjdXJyZW50bHkpXG5cdFx0Ly9cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDIsIDAsIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXI1JykpKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMywgd3Mud29ya3NwYWNlIS5mb2xkZXJzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyNCcpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMV0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjMnKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzJdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXI1JykudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBzaXh0aEFkZGVkRm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsyXTtcblxuXHRcdGdvdEV2ZW50ID0gZmFsc2U7XG5cdFx0c3ViID0gd3Mub25EaWRDaGFuZ2VXb3Jrc3BhY2UoZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZC5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXSwgc2l4dGhBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGdvdEV2ZW50ID0gdHJ1ZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoe1xuXHRcdFx0aWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFtcblx0XHRcdFx0YVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNCcpLCAwKSxcblx0XHRcdFx0YVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAxKSxcblx0XHRcdFx0YVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNScpLCAyKVxuXHRcdFx0XVxuXHRcdH0pOyAvLyBzaW11bGF0ZSBhY2tub3dsZWRnZW1lbnQgZnJvbSBtYWluIHNpZGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ290RXZlbnQsIHRydWUpO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXSwgZmlmdGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBmb3VydGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzJdLCBzaXh0aEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cblx0XHRmaW5pc2goKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlyb290IGNoYW5nZSBldmVudCBpcyBpbW11dGFibGUnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbmlzaCA9IChlcnJvcj86IGFueSkgPT4ge1xuXHRcdFx0aWYgKCFmaW5pc2hlZCkge1xuXHRcdFx0XHRmaW5pc2hlZCA9IHRydWU7XG5cdFx0XHRcdGRvbmUoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3ViID0gd3Mub25EaWRDaGFuZ2VXb3Jrc3BhY2UoZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHQoPGFueT5lKS5hZGRlZCA9IFtdO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gYXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdC8vIFx0KDxhbnk+ZS5hZGRlZClbMF0gPSBudWxsO1xuXHRcdFx0XHQvLyB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW10gfSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRmaW5pc2goKTtcblx0fSk7XG5cblx0dGVzdCgnYHZzY29kZS53b3Jrc3BhY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGZpbGUpYCBkb25cXCd0IHJldHVybiB3b3Jrc3BhY2UgZm9sZGVyIHdoZW4gZmlsZSBvcGVuIGZyb20gY29tbWFuZCBsaW5lLiAjMzYyMjEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7XG5cdFx0XHRcdGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbXG5cdFx0XHRcdFx0YVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJ2M6L1VzZXJzL21hcmVrL0Rlc2t0b3AvdnNjX3Rlc3QvJyksIDApXG5cdFx0XHRcdF1cblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnYzovVXNlcnMvbWFyZWsvRGVza3RvcC92c2NfdGVzdC9hLnR4dCcpKSk7XG5cdFx0XHRhc3NlcnQub2sod3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCdDOi9Vc2Vycy9tYXJlay9EZXNrdG9wL3ZzY190ZXN0L2IudHh0JykpKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKHVyaTogVVJJLCBpbmRleDogbnVtYmVyLCBuYW1lOiBzdHJpbmcgPSAnJyk6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpLFxuXHRcdFx0aW5kZXgsXG5cdFx0XHRuYW1lOiBuYW1lIHx8IGJhc2VuYW1lKHVyaS5wYXRoKVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEodXJpOiBVUkksIG5hbWU/OiBzdHJpbmcpOiB7IHVyaTogVVJJOyBuYW1lPzogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7IHVyaSwgbmFtZSB9O1xuXHR9XG5cblx0c3VpdGUoJ2ZpbmRGaWxlcyAtJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3QoJ3N0cmluZyBpbmNsdWRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgJ2ZvbycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChfaW5jbHVkZUZvbGRlciwgbnVsbCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMubWF4UmVzdWx0cywgMTApO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMoJ2ZvbycsIHVuZGVmaW5lZCwgMTAsIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gdGVzdEZpbmRGaWxlc0luY2x1ZGUocGF0dGVybjogUmVsYXRpdmVQYXR0ZXJuKSB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCAnZ2xvYi8qKicpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoX2luY2x1ZGVGb2xkZXIgPyBVUkkuZnJvbShfaW5jbHVkZUZvbGRlcikudG9KU09OKCkgOiBudWxsLCBVUkkuZmlsZSgnL290aGVyL2ZvbGRlcicpLnRvSlNPTigpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzKHBhdHRlcm4sIHVuZGVmaW5lZCwgMTAsIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBpbmNsdWRlIChzdHJpbmcpJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RGaW5kRmlsZXNJbmNsdWRlKG5ldyBSZWxhdGl2ZVBhdHRlcm4oJy9vdGhlci9mb2xkZXInLCAnZ2xvYi8qKicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBpbmNsdWRlIChVUkkpJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RGaW5kRmlsZXNJbmNsdWRlKG5ldyBSZWxhdGl2ZVBhdHRlcm4oVVJJLmZpbGUoJy9vdGhlci9mb2xkZXInKSwgJ2dsb2IvKionKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBleGNsdWRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sICdnbG9iLyoqJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChVUkkucmV2aXZlKF9pbmNsdWRlRm9sZGVyISkudG9TdHJpbmcoKSwgVVJJLmZpbGUoJy9vdGhlci9mb2xkZXInKS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMobmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJyksIG51bGwsIDEwLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggY2FuY2VsbGVkIHRva2VuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRcdGNvbnN0IHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uQ2FuY2VsbGVkO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlcyhuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKSwgbnVsbCwgMTAsIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JyksIHRva2VuKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KCFtYWluVGhyZWFkQ2FsbGVkLCAnIW1haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUmVsYXRpdmVQYXR0ZXJuIGV4Y2x1ZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuPy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuWzBdLnBhdHRlcm4sICdnbG9iLyoqJyk7IC8vIE5vdGUgdGhhdCB0aGUgYmFzZSBwb3J0aW9uIGlzIGlnbm9yZWQsIHNlZSAjNTI2NTFcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzKCcnLCBuZXcgUmVsYXRpdmVQYXR0ZXJuKHJvb3QsICdnbG9iLyoqJyksIDEwLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRGaWxlczIgLScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdzdHJpbmcgaW5jbHVkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZmlsZVBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoX2luY2x1ZGVGb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLm1heFJlc3VsdHMsIDEwKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzMihbJ2ZvbyddLCB7IG1heFJlc3VsdHM6IDEwLCB1c2VFeGNsdWRlU2V0dGluZ3M6IEV4Y2x1ZGVTZXR0aW5nT3B0aW9ucy5GaWxlc0V4Y2x1ZGUgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiB0ZXN0RmluZEZpbGVzMkluY2x1ZGUocGF0dGVybjogUmVsYXRpdmVQYXR0ZXJuW10pIHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZmlsZVBhdHRlcm4sICdnbG9iLyoqJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChfaW5jbHVkZUZvbGRlciA/IFVSSS5mcm9tKF9pbmNsdWRlRm9sZGVyKS50b0pTT04oKSA6IG51bGwsIFVSSS5maWxlKCcvb3RoZXIvZm9sZGVyJykudG9KU09OKCkpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMyKHBhdHRlcm4sIHsgbWF4UmVzdWx0czogMTAgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnUmVsYXRpdmVQYXR0ZXJuIGluY2x1ZGUgKHN0cmluZyknLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGVzdEZpbmRGaWxlczJJbmNsdWRlKFtuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUmVsYXRpdmVQYXR0ZXJuIGluY2x1ZGUgKFVSSSknLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGVzdEZpbmRGaWxlczJJbmNsdWRlKFtuZXcgUmVsYXRpdmVQYXR0ZXJuKFVSSS5maWxlKCcvb3RoZXIvZm9sZGVyJyksICdnbG9iLyoqJyldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIGV4Y2x1ZGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5maWxlUGF0dGVybiwgJ2dsb2IvKionKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFVSSS5yZXZpdmUoX2luY2x1ZGVGb2xkZXIhKS50b1N0cmluZygpLCBVUkkuZmlsZSgnL290aGVyL2ZvbGRlcicpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMyKFtuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKV0sIHt9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIGR1cHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW1VSSS5maWxlKHJvb3QgKyAnL21haW4ucHknKV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gT25seSBhZGQgdGhlIHJvb3QgZGlyZWN0b3J5IGFzIGEgd29ya3NwYWNlIGZvbGRlciAtIG1haW4ucHkgd2lsbCBiZSBhIGZpbGUgd2l0aGluIGl0XG5cdFx0XHRjb25zdCBmb2xkZXJzID0gW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV07XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBmb2xkZXJzLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzMihbJyoqL21haW4ucHknLCAnKiovbWFpbi5weS8qKiddLCB7fSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigodXJpcykgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmVxdWFsKHVyaXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmVxdWFsKHVyaXNbMF0udG9TdHJpbmcoKSwgVVJJLmZpbGUocm9vdCArICcvbWFpbi5weScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGNhbmNlbGxlZCB0b2tlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCB0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZDtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMyKFtuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKV0sIHt9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpLCB0b2tlbikudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCghbWFpblRocmVhZENhbGxlZCwgJyFtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBleGNsdWRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybj8ubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVyblswXS5wYXR0ZXJuLCAnZ2xvYi8qKicpOyAvLyBOb3RlIHRoYXQgdGhlIGJhc2UgcG9ydGlvbiBpcyBpZ25vcmVkLCBzZWUgIzUyNjUxXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlczIoWycnXSwgeyBleGNsdWRlOiBbbmV3IFJlbGF0aXZlUGF0dGVybihyb290LCAnZ2xvYi8qKicpXSB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCd1c2VJZ25vcmVGaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkSWdub3JlRmlsZXMsIGZhbHNlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlcywgZmFsc2UpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzLCBmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlczIoWycnXSwgeyB1c2VJZ25vcmVGaWxlczogeyBsb2NhbDogdHJ1ZSwgcGFyZW50OiB0cnVlLCBnbG9iYWw6IHRydWUgfSB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZSBzeW1saW5rcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaWdub3JlU3ltbGlua3MsIGZhbHNlKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzMihbJyddLCB7IGZvbGxvd1N5bWxpbmtzOiB0cnVlIH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FzZUluc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pZ25vcmVHbG9iQ2FzZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlczIoWycnXSwgeyBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyB0b2RvOiBhZGQgdGVzdHMgd2l0aCBtdWx0aXBsZSBmaWxlUGF0dGVybnMgYW5kIGV4Y2x1ZGVzXG5cblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRUZXh0SW5GaWxlcyAtJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3QoJ25vIGluY2x1ZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkucGF0dGVybiwgJ2ZvbycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRhd2FpdCB3cy5maW5kVGV4dEluRmlsZXMoeyBwYXR0ZXJuOiAnZm9vJyB9LCB7fSwgKCkgPT4geyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKTtcblx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5nIGluY2x1ZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkucGF0dGVybiwgJ2ZvbycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCAnKiovZmlsZXMnKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgd3MuZmluZFRleHRJbkZpbGVzKHsgcGF0dGVybjogJ2ZvbycgfSwgeyBpbmNsdWRlOiAnKiovZmlsZXMnIH0sICgpID0+IHsgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSk7XG5cdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBpbmNsdWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHN0YXJ0VGV4dFNlYXJjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIHJlcXVlc3RJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXh0U2VhcmNoQ29tcGxldGUgfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFVSSS5yZXZpdmUoZm9sZGVyISkudG9TdHJpbmcoKSwgVVJJLmZpbGUoJy9vdGhlci9mb2xkZXInKS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgJ2dsb2IvKionKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgd3MuZmluZFRleHRJbkZpbGVzKHsgcGF0dGVybjogJ2ZvbycgfSwgeyBpbmNsdWRlOiBuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKSB9LCAoKSA9PiB7IH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGNhbmNlbGxlZCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZDtcblx0XHRcdGF3YWl0IHdzLmZpbmRUZXh0SW5GaWxlcyh7IHBhdHRlcm46ICdmb28nIH0sIHt9LCAoKSA9PiB7IH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JyksIHRva2VuKTtcblx0XHRcdGFzc2VydCghbWFpblRocmVhZENhbGxlZCwgJyFtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gZXhjbHVkZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5wYXR0ZXJuLCAnZm9vJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuPy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuWzBdLnBhdHRlcm4sICdnbG9iLyoqJyk7IC8vIGV4Y2x1ZGUgZm9sZGVyIGlzIGlnbm9yZWQuLi5cblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgd3MuZmluZFRleHRJbkZpbGVzKHsgcGF0dGVybjogJ2ZvbycgfSwgeyBleGNsdWRlOiBuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKSB9LCAoKSA9PiB7IH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kVGV4dEluRmlsZXMyIC0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnbm8gaW5jbHVkZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5wYXR0ZXJuLCAnZm9vJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlciwgbnVsbCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0ICh3cy5maW5kVGV4dEluRmlsZXMyKHsgcGF0dGVybjogJ2ZvbycgfSwge30sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpKS5jb21wbGV0ZTtcblx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5nIGluY2x1ZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkucGF0dGVybiwgJ2ZvbycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCAnKiovZmlsZXMnKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgKHdzLmZpbmRUZXh0SW5GaWxlczIoeyBwYXR0ZXJuOiAnZm9vJyB9LCB7IGluY2x1ZGU6IFsnKiovZmlsZXMnXSB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKSkuY29tcGxldGU7XG5cdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBpbmNsdWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHN0YXJ0VGV4dFNlYXJjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIHJlcXVlc3RJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXh0U2VhcmNoQ29tcGxldGUgfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFVSSS5yZXZpdmUoZm9sZGVyISkudG9TdHJpbmcoKSwgVVJJLmZpbGUoJy9vdGhlci9mb2xkZXInKS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgJ2dsb2IvKionKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgKHdzLmZpbmRUZXh0SW5GaWxlczIoeyBwYXR0ZXJuOiAnZm9vJyB9LCB7IGluY2x1ZGU6IFtuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKV0gfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkpLmNvbXBsZXRlO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGNhbmNlbGxlZCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZDtcblx0XHRcdGF3YWl0ICh3cy5maW5kVGV4dEluRmlsZXMyKHsgcGF0dGVybjogJ2ZvbycgfSwgdW5kZWZpbmVkLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpLCB0b2tlbikpLmNvbXBsZXRlO1xuXHRcdFx0YXNzZXJ0KCFtYWluVGhyZWFkQ2FsbGVkLCAnIW1haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBleGNsdWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHN0YXJ0VGV4dFNlYXJjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIHJlcXVlc3RJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXh0U2VhcmNoQ29tcGxldGUgfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZvbGRlciwgbnVsbCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm5bMF0ucGF0dGVybiwgJ2dsb2IvKionKTsgLy8gZXhjbHVkZSBmb2xkZXIgaXMgaWdub3JlZC4uLlxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRhd2FpdCAod3MuZmluZFRleHRJbkZpbGVzMih7IHBhdHRlcm46ICdmb28nIH0sIHsgZXhjbHVkZTogW25ldyBSZWxhdGl2ZVBhdHRlcm4oJy9vdGhlci9mb2xkZXInLCAnZ2xvYi8qKicpXSB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKSkuY29tcGxldGU7XG5cdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nhc2VJbnNlbnNpdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmlnbm9yZUdsb2JDYXNlLCB0cnVlKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgKHdzLmZpbmRUZXh0SW5GaWxlczIoeyBwYXR0ZXJuOiAnZm9vJyB9LCB7IGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKSkuY29tcGxldGU7XG5cdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIFRPRE86IHRlc3QgbXVsdGlwbGUgaW5jbHVkZXMvZXhjbHVkZXNzXG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFzQixzQkFBc0I7QUFHNUMsU0FBdUMsbUJBQWtFO0FBQ3pHLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWTtBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5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
