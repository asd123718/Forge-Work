import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Event } from "../../../../base/common/event.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { ConfigurationScope, Extensions } from "../../../configuration/common/configurationRegistry.js";
import { IFileService } from "../../../files/common/files.js";
import { Registry } from "../../../registry/common/platform.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { parseSettingsSyncContent } from "../../common/settingsSync.js";
import { IUserDataSyncStoreService, SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("SettingsSync - Auto", () => {
  const server = new UserDataSyncTestServer();
  let client;
  let testObject;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    Registry.as(Extensions.Configuration).registerConfiguration({
      "id": "settingsSync",
      "type": "object",
      "properties": {
        "settingsSync.machine": {
          "type": "string",
          "scope": ConfigurationScope.MACHINE
        },
        "settingsSync.machineOverridable": {
          "type": "string",
          "scope": ConfigurationScope.MACHINE_OVERRIDABLE
        }
      }
    });
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp(true);
    testObject = client.getSynchronizer(SyncResource.Settings);
  });
  test("when settings file does not exist", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const fileService = client.instantiationService.get(IFileService);
    const settingResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
    let manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    assert.ok(!await fileService.exists(settingResource));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(lastSyncUserData.syncData, null);
    manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
  }));
  test("when settings file is empty and remote has no changes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const fileService = client.instantiationService.get(IFileService);
    const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    await fileService.writeFile(settingsResource, VSBuffer.fromString(""));
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, "{}");
    assert.strictEqual(parseSettingsSyncContent(remoteUserData.syncData.content)?.settings, "{}");
    assert.strictEqual((await fileService.readFile(settingsResource)).value.toString(), "");
  }));
  test("when settings file is empty and remote has changes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
    const content = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	},

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
    await client2.instantiationService.get(IFileService).writeFile(client2.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString(content));
    await client2.sync();
    const fileService = client.instantiationService.get(IFileService);
    const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    await fileService.writeFile(settingsResource, VSBuffer.fromString(""));
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, content);
    assert.strictEqual(parseSettingsSyncContent(remoteUserData.syncData.content)?.settings, content);
    assert.strictEqual((await fileService.readFile(settingsResource)).value.toString(), content);
  }));
  test("when settings file is created after first sync", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const fileService = client.instantiationService.get(IFileService);
    const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    await fileService.createFile(settingsResource, VSBuffer.fromString("{}"));
    let lastSyncUserData = await testObject.getLastSyncUserData();
    const manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, [
      { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
    ]);
    lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, "{}");
  }));
  test("sync for first time to the server", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const expected = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	},

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
    await updateSettings(expected, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, expected);
  }));
  test("do not sync machine settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue"
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp"
}`);
  }));
  test("do not sync machine settings when spread across file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"settingsSync.machine": "someValue",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machineOverridable": "someValue"
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp"
}`);
  }));
  test("do not sync machine settings when spread across file - 2", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"settingsSync.machine": "someValue",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machineOverridable": "someValue",
	"files.simpleDialog.enable": true,
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"files.simpleDialog.enable": true,
}`);
  }));
  test("sync when all settings are machine settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue"
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
}`);
  }));
  test("sync when all settings are machine settings with trailing comma", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue",
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	,
}`);
  }));
  test("local change event is triggered when settings are changed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const content = `{
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,
}`;
    await updateSettings(content, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const promise = Event.toPromise(testObject.onDidChangeLocal);
    await updateSettings(`{
	"files.autoSave": "off",
	"files.simpleDialog.enable": true,
}`, client);
    await promise;
  }));
  test("do not sync ignored settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`);
  }));
  test("do not sync ignored and machine settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	],

	// Machine
	"settingsSync.machine": "someValue",
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	],
}`);
  }));
  test("sync throws invalid content error", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const expected = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	}

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
    await updateSettings(expected, client);
    try {
      await testObject.sync(await client.getLatestRef(SyncResource.Settings));
      assert.fail("should fail with invalid content error");
    } catch (e) {
      assert.ok(e instanceof UserDataSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.LocalInvalidContent);
    }
  }));
  test("sync throws invalid content error - content is an array", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await updateSettings("[]", client);
    try {
      await testObject.sync(await client.getLatestRef(SyncResource.Settings));
      assert.fail("should fail with invalid content error");
    } catch (e) {
      assert.ok(e instanceof UserDataSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.LocalInvalidContent);
    }
  }));
  test("sync when there are conflicts", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
    await updateSettings(JSON.stringify({
      "a": 1,
      "b": 2,
      "settingsSync.ignoredSettings": ["a"]
    }), client2);
    await client2.sync();
    await updateSettings(JSON.stringify({
      "a": 2,
      "b": 1,
      "settingsSync.ignoredSettings": ["a"]
    }), client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assert.strictEqual(testObject.conflicts.conflicts[0].localResource.toString(), testObject.localResource.toString());
    const fileService = client.instantiationService.get(IFileService);
    const mergeContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
    assert.strictEqual(mergeContent, "");
  }));
  test("sync profile settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
    const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
    await updateSettings(JSON.stringify({
      "a": 1,
      "b": 2
    }), client2, profile);
    await client2.sync();
    await client.sync();
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
    const content = (await client.instantiationService.get(IFileService).readFile(syncedProfile.settingsResource)).value.toString();
    assert.deepStrictEqual(JSON.parse(content), {
      "a": 1,
      "b": 2
    });
  }));
});
suite("SettingsSync - Manual", () => {
  const server = new UserDataSyncTestServer();
  let client;
  let testObject;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp(true);
    testObject = client.getSynchronizer(SyncResource.Settings);
  });
  test("do not sync ignored settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`;
    await updateSettings(settingsContent, client);
    let preview = await testObject.sync(await client.getLatestRef(SyncResource.Settings), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
    preview = await testObject.apply(false);
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`);
  }));
});
function parseSettings(content) {
  const syncData = JSON.parse(content);
  const settingsSyncContent = JSON.parse(syncData.content);
  return settingsSyncContent.settings;
}
async function updateSettings(content, client, profile) {
  await client.instantiationService.get(IFileService).writeFile((profile ?? client.instantiationService.get(IUserDataProfilesService).defaultProfile).settingsResource, VSBuffer.fromString(content));
  await client.instantiationService.get(IConfigurationService).reloadConfiguration();
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHNldHRpbmdzU3luYy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVNldHRpbmdzU3luY0NvbnRlbnQsIHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudCwgU2V0dGluZ3NTeW5jaHJvbmlzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vc2V0dGluZ3NTeW5jLmpzJztcbmltcG9ydCB7IElTeW5jRGF0YSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgU3luY1Jlc291cmNlLCBTeW5jU3RhdHVzLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbnN1aXRlKCdTZXR0aW5nc1N5bmMgLSBBdXRvJywgKCkgPT4ge1xuXG5cdGNvbnN0IHNlcnZlciA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdGxldCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudDtcblx0bGV0IHRlc3RPYmplY3Q6IFNldHRpbmdzU3luY2hyb25pc2VyO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnc2V0dGluZ3NTeW5jJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NldHRpbmdzU3luYy5tYWNoaW5lJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkVcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NldHRpbmdzU3luYy5tYWNoaW5lT3ZlcnJpZGFibGUnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCh0cnVlKTtcblx0XHR0ZXN0T2JqZWN0ID0gY2xpZW50LmdldFN5bmNocm9uaXplcihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpIGFzIFNldHRpbmdzU3luY2hyb25pc2VyO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHNldHRpbmdzIGZpbGUgZG9lcyBub3QgZXhpc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXR0aW5nUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCksIG51bGwpO1xuXHRcdGxldCBtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHRhc3NlcnQub2soIWF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhzZXR0aW5nUmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5yZWYsIHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgbnVsbCk7XG5cblx0XHRtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cblx0XHRtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCd3aGVuIHNldHRpbmdzIGZpbGUgaXMgZW1wdHkgYW5kIHJlbW90ZSBoYXMgbm8gY2hhbmdlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHNldHRpbmdzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnJykpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQpPy5zZXR0aW5ncywgJ3t9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCk/LnNldHRpbmdzLCAne30nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNldHRpbmdzUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCAnJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCd3aGVuIHNldHRpbmdzIGZpbGUgaXMgZW1wdHkgYW5kIHJlbW90ZSBoYXMgY2hhbmdlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRjb25zdCBjb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXHRcIndvcmtiZW5jaC50cmVlLmluZGVudFwiOiAyMCxcblx0XCJ3b3JrYmVuY2guY29sb3JDdXN0b21pemF0aW9uc1wiOiB7XG5cdFx0XCJlZGl0b3JMaW5lTnVtYmVyLmFjdGl2ZUZvcmVncm91bmRcIjogXCIjZmYwMDAwXCIsXG5cdFx0XCJbR2l0SHViIFNoYXJwXVwiOiB7XG5cdFx0XHRcInN0YXR1c0Jhckl0ZW0ucmVtb3RlQmFja2dyb3VuZFwiOiBcIiMyNDI5MkVcIixcblx0XHRcdFwiZWRpdG9yUGFuZS5iYWNrZ3JvdW5kXCI6IFwiI2YzZjFmMTFhXCJcblx0XHR9XG5cdH0sXG5cblx0XCJnaXRCcmFuY2guYmFzZVwiOiBcInJlbW90ZS1yZXBvL21hc3RlclwiLFxuXG5cdC8vIEV4cGVyaW1lbnRhbFxuXHRcIndvcmtiZW5jaC52aWV3LmV4cGVyaW1lbnRhbC5hbGxvd01vdmluZ1RvTmV3Q29udGFpbmVyXCI6IHRydWUsXG59YDtcblx0XHRhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLndyaXRlRmlsZShjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgc2V0dGluZ3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCk/LnNldHRpbmdzLCBjb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50KT8uc2V0dGluZ3MsIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoc2V0dGluZ3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHR9KSk7XG5cblx0dGVzdCgnd2hlbiBzZXR0aW5ncyBmaWxlIGlzIGNyZWF0ZWQgYWZ0ZXIgZmlyc3Qgc3luYycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cblx0XHRsZXQgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW1xuXHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7c2VydmVyLnVybH0vdjEvcmVzb3VyY2UvJHt0ZXN0T2JqZWN0LnJlc291cmNlfWAsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogbGFzdFN5bmNVc2VyRGF0YT8ucmVmIH0gfSxcblx0XHRdKTtcblxuXHRcdGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5yZWYsIHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQpPy5zZXR0aW5ncywgJ3t9Jyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzeW5jIGZvciBmaXJzdCB0aW1lIHRvIHRoZSBzZXJ2ZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHRge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblx0XCJ3b3JrYmVuY2gudHJlZS5pbmRlbnRcIjogMjAsXG5cdFwid29ya2JlbmNoLmNvbG9yQ3VzdG9taXphdGlvbnNcIjoge1xuXHRcdFwiZWRpdG9yTGluZU51bWJlci5hY3RpdmVGb3JlZ3JvdW5kXCI6IFwiI2ZmMDAwMFwiLFxuXHRcdFwiW0dpdEh1YiBTaGFycF1cIjoge1xuXHRcdFx0XCJzdGF0dXNCYXJJdGVtLnJlbW90ZUJhY2tncm91bmRcIjogXCIjMjQyOTJFXCIsXG5cdFx0XHRcImVkaXRvclBhbmUuYmFja2dyb3VuZFwiOiBcIiNmM2YxZjExYVwiXG5cdFx0fVxuXHR9LFxuXG5cdFwiZ2l0QnJhbmNoLmJhc2VcIjogXCJyZW1vdGUtcmVwby9tYXN0ZXJcIixcblxuXHQvLyBFeHBlcmltZW50YWxcblx0XCJ3b3JrYmVuY2gudmlldy5leHBlcmltZW50YWwuYWxsb3dNb3ZpbmdUb05ld0NvbnRhaW5lclwiOiB0cnVlLFxufWA7XG5cblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhleHBlY3RlZCwgY2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgY2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU2V0dGluZ3MoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvIG5vdCBzeW5jIG1hY2hpbmUgc2V0dGluZ3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0YHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cblx0Ly8gTWFjaGluZVxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lXCI6IFwic29tZVZhbHVlXCIsXG5cdFwic2V0dGluZ3NTeW5jLm1hY2hpbmVPdmVycmlkYWJsZVwiOiBcInNvbWVWYWx1ZVwiXG59YDtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nc0NvbnRlbnQsIGNsaWVudCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgY2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU2V0dGluZ3MoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiXG59YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkbyBub3Qgc3luYyBtYWNoaW5lIHNldHRpbmdzIHdoZW4gc3ByZWFkIGFjcm9zcyBmaWxlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lXCI6IFwic29tZVZhbHVlXCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cblx0Ly8gTWFjaGluZVxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lT3ZlcnJpZGFibGVcIjogXCJzb21lVmFsdWVcIlxufWA7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3NDb250ZW50LCBjbGllbnQpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIlxufWApO1xuXHR9KSk7XG5cblx0dGVzdCgnZG8gbm90IHN5bmMgbWFjaGluZSBzZXR0aW5ncyB3aGVuIHNwcmVhZCBhY3Jvc3MgZmlsZSAtIDInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0YHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwic2V0dGluZ3NTeW5jLm1hY2hpbmVcIjogXCJzb21lVmFsdWVcIixcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIE1hY2hpbmVcblx0XCJzZXR0aW5nc1N5bmMubWFjaGluZU92ZXJyaWRhYmxlXCI6IFwic29tZVZhbHVlXCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxufWA7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3NDb250ZW50LCBjbGllbnQpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcbn1gKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3N5bmMgd2hlbiBhbGwgc2V0dGluZ3MgYXJlIG1hY2hpbmUgc2V0dGluZ3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0YHtcblx0Ly8gTWFjaGluZVxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lXCI6IFwic29tZVZhbHVlXCIsXG5cdFwic2V0dGluZ3NTeW5jLm1hY2hpbmVPdmVycmlkYWJsZVwiOiBcInNvbWVWYWx1ZVwiXG59YDtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nc0NvbnRlbnQsIGNsaWVudCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgY2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU2V0dGluZ3MoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGB7XG59YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzeW5jIHdoZW4gYWxsIHNldHRpbmdzIGFyZSBtYWNoaW5lIHNldHRpbmdzIHdpdGggdHJhaWxpbmcgY29tbWEnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0YHtcblx0Ly8gTWFjaGluZVxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lXCI6IFwic29tZVZhbHVlXCIsXG5cdFwic2V0dGluZ3NTeW5jLm1hY2hpbmVPdmVycmlkYWJsZVwiOiBcInNvbWVWYWx1ZVwiLFxufWA7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3NDb250ZW50LCBjbGllbnQpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBge1xuXHQsXG59YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdsb2NhbCBjaGFuZ2UgZXZlbnQgaXMgdHJpZ2dlcmVkIHdoZW4gc2V0dGluZ3MgYXJlIGNoYW5nZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID1cblx0XHRcdGB7XG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxufWA7XG5cblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhjb250ZW50LCBjbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlTG9jYWwpO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKGB7XG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJvZmZcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG59YCwgY2xpZW50KTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHR9KSk7XG5cblx0dGVzdCgnZG8gbm90IHN5bmMgaWdub3JlZCBzZXR0aW5ncycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNldHRpbmdzQ29udGVudCA9XG5cdFx0XHRge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gRWRpdG9yXG5cdFwiZWRpdG9yLmZvbnRGYW1pbHlcIjogXCJGaXJhIENvZGVcIixcblxuXHQvLyBUZXJtaW5hbFxuXHRcInRlcm1pbmFsLmludGVncmF0ZWQuc2hlbGwub3N4XCI6IFwic29tZSBwYXRoXCIsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblxuXHQvLyBJZ25vcmVkXG5cdFwic2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5nc1wiOiBbXG5cdFx0XCJlZGl0b3IuZm9udEZhbWlseVwiLFxuXHRcdFwidGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbC5vc3hcIlxuXHRdXG59YDtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nc0NvbnRlbnQsIGNsaWVudCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgY2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU2V0dGluZ3MoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIElnbm9yZWRcblx0XCJzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzXCI6IFtcblx0XHRcImVkaXRvci5mb250RmFtaWx5XCIsXG5cdFx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiXG5cdF1cbn1gKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvIG5vdCBzeW5jIGlnbm9yZWQgYW5kIG1hY2hpbmUgc2V0dGluZ3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0YHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIEVkaXRvclxuXHRcImVkaXRvci5mb250RmFtaWx5XCI6IFwiRmlyYSBDb2RlXCIsXG5cblx0Ly8gVGVybWluYWxcblx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiOiBcInNvbWUgcGF0aFwiLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cblx0Ly8gSWdub3JlZFxuXHRcInNldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3NcIjogW1xuXHRcdFwiZWRpdG9yLmZvbnRGYW1pbHlcIixcblx0XHRcInRlcm1pbmFsLmludGVncmF0ZWQuc2hlbGwub3N4XCJcblx0XSxcblxuXHQvLyBNYWNoaW5lXG5cdFwic2V0dGluZ3NTeW5jLm1hY2hpbmVcIjogXCJzb21lVmFsdWVcIixcbn1gO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzQ29udGVudCwgY2xpZW50KTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCBjbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTZXR0aW5ncyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgYHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cblx0Ly8gSWdub3JlZFxuXHRcInNldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3NcIjogW1xuXHRcdFwiZWRpdG9yLmZvbnRGYW1pbHlcIixcblx0XHRcInRlcm1pbmFsLmludGVncmF0ZWQuc2hlbGwub3N4XCJcblx0XSxcbn1gKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3N5bmMgdGhyb3dzIGludmFsaWQgY29udGVudCBlcnJvcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXHRcIndvcmtiZW5jaC50cmVlLmluZGVudFwiOiAyMCxcblx0XCJ3b3JrYmVuY2guY29sb3JDdXN0b21pemF0aW9uc1wiOiB7XG5cdFx0XCJlZGl0b3JMaW5lTnVtYmVyLmFjdGl2ZUZvcmVncm91bmRcIjogXCIjZmYwMDAwXCIsXG5cdFx0XCJbR2l0SHViIFNoYXJwXVwiOiB7XG5cdFx0XHRcInN0YXR1c0Jhckl0ZW0ucmVtb3RlQmFja2dyb3VuZFwiOiBcIiMyNDI5MkVcIixcblx0XHRcdFwiZWRpdG9yUGFuZS5iYWNrZ3JvdW5kXCI6IFwiI2YzZjFmMTFhXCJcblx0XHR9XG5cdH1cblxuXHRcImdpdEJyYW5jaC5iYXNlXCI6IFwicmVtb3RlLXJlcG8vbWFzdGVyXCIsXG5cblx0Ly8gRXhwZXJpbWVudGFsXG5cdFwid29ya2JlbmNoLnZpZXcuZXhwZXJpbWVudGFsLmFsbG93TW92aW5nVG9OZXdDb250YWluZXJcIjogdHJ1ZSxcbn1gO1xuXG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3MoZXhwZWN0ZWQsIGNsaWVudCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIGZhaWwgd2l0aCBpbnZhbGlkIGNvbnRlbnQgZXJyb3InKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKDxVc2VyRGF0YVN5bmNFcnJvcj5lKS5jb2RlLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxJbnZhbGlkQ29udGVudCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnc3luYyB0aHJvd3MgaW52YWxpZCBjb250ZW50IGVycm9yIC0gY29udGVudCBpcyBhbiBhcnJheScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKCdbXScsIGNsaWVudCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBmYWlsIHdpdGggaW52YWxpZCBjb250ZW50IGVycm9yJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNFcnJvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8VXNlckRhdGFTeW5jRXJyb3I+ZSkuY29kZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsSW52YWxpZENvbnRlbnQpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ3N5bmMgd2hlbiB0aGVyZSBhcmUgY29uZmxpY3RzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHRcdCdzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzJzogWydhJ11cblx0XHR9KSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYic6IDEsXG5cdFx0XHQnc2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5ncyc6IFsnYSddXG5cdFx0fSksIGNsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLmxvY2FsUmVzb3VyY2UudG9TdHJpbmcoKSwgdGVzdE9iamVjdC5sb2NhbFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgbWVyZ2VDb250ZW50ID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZUNvbnRlbnQsICcnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3N5bmMgcHJvZmlsZSBzZXR0aW5ncycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5jcmVhdGVOYW1lZFByb2ZpbGUoJ3Byb2ZpbGUxJyk7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdH0pLCBjbGllbnQyLCBwcm9maWxlKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IGNsaWVudC5zeW5jKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cblx0XHRjb25zdCBzeW5jZWRQcm9maWxlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlLmlkKSE7XG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkucmVhZEZpbGUoc3luY2VkUHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoY29udGVudCksIHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHR9KTtcblx0fSkpO1xuXG59KTtcblxuc3VpdGUoJ1NldHRpbmdzU3luYyAtIE1hbnVhbCcsICgpID0+IHtcblxuXHRjb25zdCBzZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRsZXQgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cdGxldCB0ZXN0T2JqZWN0OiBTZXR0aW5nc1N5bmNocm9uaXNlcjtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5jbGVhcigpO1xuXHR9KTtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCh0cnVlKTtcblx0XHR0ZXN0T2JqZWN0ID0gY2xpZW50LmdldFN5bmNocm9uaXplcihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpIGFzIFNldHRpbmdzU3luY2hyb25pc2VyO1xuXHR9KTtcblxuXHR0ZXN0KCdkbyBub3Qgc3luYyBpZ25vcmVkIHNldHRpbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBFZGl0b3Jcblx0XCJlZGl0b3IuZm9udEZhbWlseVwiOiBcIkZpcmEgQ29kZVwiLFxuXG5cdC8vIFRlcm1pbmFsXG5cdFwidGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbC5vc3hcIjogXCJzb21lIHBhdGhcIixcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIElnbm9yZWRcblx0XCJzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzXCI6IFtcblx0XHRcImVkaXRvci5mb250RmFtaWx5XCIsXG5cdFx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiXG5cdF1cbn1gO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzQ29udGVudCwgY2xpZW50KTtcblxuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCBjbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTZXR0aW5ncyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgYHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cblx0Ly8gSWdub3JlZFxuXHRcInNldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3NcIjogW1xuXHRcdFwiZWRpdG9yLmZvbnRGYW1pbHlcIixcblx0XHRcInRlcm1pbmFsLmludGVncmF0ZWQuc2hlbGwub3N4XCJcblx0XVxufWApO1xuXHR9KSk7XG5cbn0pO1xuXG5mdW5jdGlvbiBwYXJzZVNldHRpbmdzKGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHN5bmNEYXRhOiBJU3luY0RhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRjb25zdCBzZXR0aW5nc1N5bmNDb250ZW50OiBJU2V0dGluZ3NTeW5jQ29udGVudCA9IEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCk7XG5cdHJldHVybiBzZXR0aW5nc1N5bmNDb250ZW50LnNldHRpbmdzO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVTZXR0aW5ncyhjb250ZW50OiBzdHJpbmcsIGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50LCBwcm9maWxlPzogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkud3JpdGVGaWxlKChwcm9maWxlID8/IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSkuc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5yZWxvYWRDb25maWd1cmF0aW9uKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlB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
