import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { dirname, joinPath } from "../../../../base/common/resources.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { IUserDataSyncStoreService, PREVIEW_DIR_NAME, SyncResource, SyncStatus } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
const tsSnippet1 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console",
	}

}`;
const tsSnippet2 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console always",
	}

}`;
const htmlSnippet1 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div"
	}
}`;
const htmlSnippet2 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed"
	}
}`;
const htmlSnippet3 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed again"
	}
}`;
const globalSnippet = `{
	// Place your global snippets here. Each snippet is defined under a snippet name and has a scope, prefix, body and
	// description. Add comma separated ids of the languages where the snippet is applicable in the scope field. If scope
	// is left empty or omitted, the snippet gets applied to all languages. The prefix is what is
	// used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, and {1: label}, { 2: another } for placeholders.
	// Placeholders with the same ids are connected.
	// Example:
	// "Print to console": {
	// 	"scope": "javascript,typescript",
	// 	"prefix": "log",
	// 	"body": [
	// 		"console.log('$1');",
	// 		"$2"
	// 	],
	// 	"description": "Log output to console"
	// }
}`;
suite("SnippetsSync", () => {
  const server = new UserDataSyncTestServer();
  let testClient;
  let client2;
  let testObject;
  teardown(async () => {
    await testClient.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    testClient = disposableStore.add(new UserDataSyncClient(server));
    await testClient.setUp(true);
    testObject = testClient.getSynchronizer(SyncResource.Snippets);
    client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
  });
  test("when snippets does not exist", async () => {
    const fileService = testClient.instantiationService.get(IFileService);
    const snippetsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.snippetsHome;
    assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
    let manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    assert.ok(!await fileService.exists(snippetsResource));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(lastSyncUserData.syncData, null);
    manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
  });
  test("when snippet is created after first sync", async () => {
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet1, testClient);
    let lastSyncUserData = await testObject.getLastSyncUserData();
    const manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, [
      { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
    ]);
    lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.deepStrictEqual(lastSyncUserData.syncData.content, JSON.stringify({ "html.json": htmlSnippet1 }));
  });
  test("first time sync - outgoing to server (no snippets)", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 });
  });
  test("first time sync - incoming from server (no snippets)", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
  });
  test("first time sync when snippets exists", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 });
  });
  test("first time sync when snippets exists - has conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when snippets exists - has conflicts and accept conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet1);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1 });
  });
  test("first time sync when snippets exists - has multiple conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local1 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    const local2 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json");
    assertPreviews(testObject.conflicts.conflicts, [local1, local2]);
  });
  test("first time sync when snippets exists - has multiple conflicts and accept one conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    let conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
    conflicts = testObject.conflicts.conflicts;
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when snippets exists - has multiple conflicts and accept all conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
    await testObject.accept(conflicts[1].previewResource, tsSnippet1);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet2, "typescript.json": tsSnippet1 });
  });
  test("sync adding a snippet", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 });
  });
  test("sync adding a snippet - accept", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
  });
  test("sync updating a snippet", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet2 });
  });
  test("sync updating a snippet - accept", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
  });
  test("sync updating a snippet - conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet3, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync updating a snippet - resolve conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet3, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, htmlSnippet2);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet2 });
  });
  test("sync removing a snippet", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1 });
  });
  test("sync removing a snippet - accept", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, null);
  });
  test("sync removing a snippet locally and updating it remotely", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await removeSnippet("html.json", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, htmlSnippet2);
  });
  test("sync removing a snippet - conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync removing a snippet - resolve conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, htmlSnippet3);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, htmlSnippet3);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1, "html.json": htmlSnippet3 });
  });
  test("sync removing a snippet - resolve conflict by removing", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1 });
  });
  test("sync global and language snippet", async () => {
    await updateSnippet("global.code-snippets", globalSnippet, client2);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("global.code-snippets", testClient);
    assert.strictEqual(actual2, globalSnippet);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "global.code-snippets": globalSnippet });
  });
  test("sync should ignore non snippets", async () => {
    await updateSnippet("global.code-snippets", globalSnippet, client2);
    await updateSnippet("html.html", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("global.code-snippets", testClient);
    assert.strictEqual(actual2, globalSnippet);
    const actual3 = await readSnippet("html.html", testClient);
    assert.strictEqual(actual3, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1, "global.code-snippets": globalSnippet });
  });
  test("previews are reset after all conflicts resolved", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
    await testObject.apply(false);
    const fileService = testClient.instantiationService.get(IFileService);
    assert.ok(!await fileService.exists(dirname(conflicts[0].previewResource)));
  });
  test("merge when there are multiple snippets and all snippets are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets and all snippets are merged and applied", async () => {
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets and one snippet has no changes and one snippet is merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets and one snippet has no changes and snippets is merged and applied", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets with conflicts and all snippets are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
  });
  test("accept when there are multiple snippets with conflicts and only one snippet is accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, htmlSnippet2);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
  });
  test("accept when there are multiple snippets with conflicts and all snippets are accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, htmlSnippet2);
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, tsSnippet2);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("accept when there are multiple snippets with conflicts and all snippets are accepted and applied", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, htmlSnippet2);
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, tsSnippet2);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("sync profile snippets", async () => {
    const client22 = disposableStore.add(new UserDataSyncClient(server));
    await client22.setUp(true);
    const profile = await client22.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
    await updateSnippet("html.json", htmlSnippet1, client22, profile);
    await client22.sync();
    await testClient.sync();
    const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
    const content = await readSnippet("html.json", testClient, syncedProfile);
    assert.strictEqual(content, htmlSnippet1);
  });
  function parseSnippets(content) {
    const syncData = JSON.parse(content);
    return JSON.parse(syncData.content);
  }
  async function updateSnippet(name, content, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const snippetsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).snippetsHome, name);
    await fileService.writeFile(snippetsResource, VSBuffer.fromString(content));
  }
  async function removeSnippet(name, client) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const snippetsResource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, name);
    await fileService.del(snippetsResource);
  }
  async function readSnippet(name, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const snippetsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).snippetsHome, name);
    if (await fileService.exists(snippetsResource)) {
      const content = await fileService.readFile(snippetsResource);
      return content.value.toString();
    }
    return null;
  }
  function assertPreviews(actual, expected) {
    assert.deepStrictEqual(actual.map(({ previewResource }) => previewResource.toString()), expected.map((uri) => uri.toString()));
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHNuaXBwZXRzU3luYy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0c1N5bmNocm9uaXNlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zbmlwcGV0c1N5bmMuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlUHJldmlldywgSVN5bmNEYXRhLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBQUkVWSUVXX0RJUl9OQU1FLCBTeW5jUmVzb3VyY2UsIFN5bmNTdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY0NsaWVudCwgVXNlckRhdGFTeW5jVGVzdFNlcnZlciB9IGZyb20gJy4vdXNlckRhdGFTeW5jQ2xpZW50LmpzJztcblxuY29uc3QgdHNTbmlwcGV0MSA9IGB7XG5cblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgVHlwZVNjcmlwdCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuIFBvc3NpYmxlIHZhcmlhYmxlcyBhcmU6XG5cdC8vICQxLCAkMiBmb3IgdGFiIHN0b3BzLCAkMCBmb3IgdGhlIGZpbmFsIGN1cnNvciBwb3NpdGlvbiwgUGxhY2Vob2xkZXJzIHdpdGggdGhlXG5cdC8vIHNhbWUgaWRzIGFyZSBjb25uZWN0ZWQuXG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdC8vIEV4YW1wbGU6XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZVwiLFxuXHR9XG5cbn1gO1xuXG5jb25zdCB0c1NuaXBwZXQyID0gYHtcblxuXHQvLyBQbGFjZSB5b3VyIHNuaXBwZXRzIGZvciBUeXBlU2NyaXB0IGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBwcmVmaXgsIGJvZHkgYW5kXG5cdC8vIGRlc2NyaXB0aW9uLiBUaGUgcHJlZml4IGlzIHdoYXQgaXMgdXNlZCB0byB0cmlnZ2VyIHRoZSBzbmlwcGV0IGFuZCB0aGUgYm9keSB3aWxsIGJlIGV4cGFuZGVkIGFuZCBpbnNlcnRlZC4gUG9zc2libGUgdmFyaWFibGVzIGFyZTpcblx0Ly8gJDEsICQyIGZvciB0YWIgc3RvcHMsICQwIGZvciB0aGUgZmluYWwgY3Vyc29yIHBvc2l0aW9uLCBQbGFjZWhvbGRlcnMgd2l0aCB0aGVcblx0Ly8gc2FtZSBpZHMgYXJlIGNvbm5lY3RlZC5cblx0XCJQcmludCB0byBjb25zb2xlXCI6IHtcblx0Ly8gRXhhbXBsZTpcblx0XCJwcmVmaXhcIjogXCJsb2dcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCJjb25zb2xlLmxvZygnJDEnKTtcIixcblx0XHRcdFwiJDJcIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlIGFsd2F5c1wiLFxuXHR9XG5cbn1gO1xuXG5jb25zdCBodG1sU25pcHBldDEgPSBge1xuLypcblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgSFRNTCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuXG5cdC8vIEV4YW1wbGU6XG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZVwiXG5cdH1cbiovXG5cIkRpdlwiOiB7XG5cdFwicHJlZml4XCI6IFwiZGl2XCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiPGRpdj5cIixcblx0XHRcdFwiXCIsXG5cdFx0XHRcIjwvZGl2PlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJOZXcgZGl2XCJcblx0fVxufWA7XG5cbmNvbnN0IGh0bWxTbmlwcGV0MiA9IGB7XG4vKlxuXHQvLyBQbGFjZSB5b3VyIHNuaXBwZXRzIGZvciBIVE1MIGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBwcmVmaXgsIGJvZHkgYW5kXG5cdC8vIGRlc2NyaXB0aW9uLiBUaGUgcHJlZml4IGlzIHdoYXQgaXMgdXNlZCB0byB0cmlnZ2VyIHRoZSBzbmlwcGV0IGFuZCB0aGUgYm9keSB3aWxsIGJlIGV4cGFuZGVkIGFuZCBpbnNlcnRlZC5cblx0Ly8gRXhhbXBsZTpcblx0XCJQcmludCB0byBjb25zb2xlXCI6IHtcblx0XCJwcmVmaXhcIjogXCJsb2dcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCJjb25zb2xlLmxvZygnJDEnKTtcIixcblx0XHRcdFwiJDJcIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlXCJcblx0fVxuKi9cblwiRGl2XCI6IHtcblx0XCJwcmVmaXhcIjogXCJkaXZcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCI8ZGl2PlwiLFxuXHRcdFx0XCJcIixcblx0XHRcdFwiPC9kaXY+XCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIk5ldyBkaXYgY2hhbmdlZFwiXG5cdH1cbn1gO1xuXG5jb25zdCBodG1sU25pcHBldDMgPSBge1xuLypcblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgSFRNTCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuXG5cdC8vIEV4YW1wbGU6XG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZVwiXG5cdH1cbiovXG5cIkRpdlwiOiB7XG5cdFwicHJlZml4XCI6IFwiZGl2XCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiPGRpdj5cIixcblx0XHRcdFwiXCIsXG5cdFx0XHRcIjwvZGl2PlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJOZXcgZGl2IGNoYW5nZWQgYWdhaW5cIlxuXHR9XG59YDtcblxuY29uc3QgZ2xvYmFsU25pcHBldCA9IGB7XG5cdC8vIFBsYWNlIHlvdXIgZ2xvYmFsIHNuaXBwZXRzIGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBzY29wZSwgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gQWRkIGNvbW1hIHNlcGFyYXRlZCBpZHMgb2YgdGhlIGxhbmd1YWdlcyB3aGVyZSB0aGUgc25pcHBldCBpcyBhcHBsaWNhYmxlIGluIHRoZSBzY29wZSBmaWVsZC4gSWYgc2NvcGVcblx0Ly8gaXMgbGVmdCBlbXB0eSBvciBvbWl0dGVkLCB0aGUgc25pcHBldCBnZXRzIGFwcGxpZWQgdG8gYWxsIGxhbmd1YWdlcy4gVGhlIHByZWZpeCBpcyB3aGF0IGlzXG5cdC8vIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuIFBvc3NpYmxlIHZhcmlhYmxlcyBhcmU6XG5cdC8vICQxLCAkMiBmb3IgdGFiIHN0b3BzLCAkMCBmb3IgdGhlIGZpbmFsIGN1cnNvciBwb3NpdGlvbiwgYW5kIHsxOiBsYWJlbH0sIHsgMjogYW5vdGhlciB9IGZvciBwbGFjZWhvbGRlcnMuXG5cdC8vIFBsYWNlaG9sZGVycyB3aXRoIHRoZSBzYW1lIGlkcyBhcmUgY29ubmVjdGVkLlxuXHQvLyBFeGFtcGxlOlxuXHQvLyBcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHQvLyBcdFwic2NvcGVcIjogXCJqYXZhc2NyaXB0LHR5cGVzY3JpcHRcIixcblx0Ly8gXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHQvLyBcdFwiYm9keVwiOiBbXG5cdC8vIFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHQvLyBcdFx0XCIkMlwiXG5cdC8vIFx0XSxcblx0Ly8gXHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlXCJcblx0Ly8gfVxufWA7XG5cbnN1aXRlKCdTbmlwcGV0c1N5bmMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc2VydmVyID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0bGV0IHRlc3RDbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudDtcblx0bGV0IGNsaWVudDI6IFVzZXJEYXRhU3luY0NsaWVudDtcblxuXHRsZXQgdGVzdE9iamVjdDogU25pcHBldHNTeW5jaHJvbmlzZXI7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHR0ZXN0Q2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IHRlc3RDbGllbnQuc2V0VXAodHJ1ZSk7XG5cdFx0dGVzdE9iamVjdCA9IHRlc3RDbGllbnQuZ2V0U3luY2hyb25pemVyKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykgYXMgU25pcHBldHNTeW5jaHJvbmlzZXI7XG5cblx0XHRjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gc25pcHBldHMgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHNuaXBwZXRzUmVzb3VyY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCksIG51bGwpO1xuXHRcdGxldCBtYW5pZmVzdCA9IGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCFhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc25pcHBldHNSZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnJlZiwgcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhLCByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhLCBudWxsKTtcblxuXHRcdG1hbmlmZXN0ID0gYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cblx0XHRtYW5pZmVzdCA9IGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHNuaXBwZXQgaXMgY3JlYXRlZCBhZnRlciBmaXJzdCBzeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXG5cdFx0bGV0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXG5cdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHtzZXJ2ZXIudXJsfS92MS9yZXNvdXJjZS8ke3Rlc3RPYmplY3QucmVzb3VyY2V9YCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiBsYXN0U3luY1VzZXJEYXRhPy5yZWYgfSB9LFxuXHRcdF0pO1xuXG5cdFx0bGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnJlZiwgcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhLCByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgSlNPTi5zdHJpbmdpZnkoeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIC0gb3V0Z29pbmcgdG8gc2VydmVyIChubyBzbmlwcGV0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCB0ZXN0Q2xpZW50KTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNuaXBwZXRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgLSBpbmNvbWluZyBmcm9tIHNlcnZlciAobm8gc25pcHBldHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDEpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIHRzU25pcHBldDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBzbmlwcGV0cyBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgdHNTbmlwcGV0MSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gc25pcHBldHMgZXhpc3RzIC0gaGFzIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gc25pcHBldHMgZXhpc3RzIC0gaGFzIGNvbmZsaWN0cyBhbmQgYWNjZXB0IGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0Y29uc3QgY29uZmxpY3RzID0gdGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0MSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0MSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBzbmlwcGV0cyBleGlzdHMgLSBoYXMgbXVsdGlwbGUgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvY2FsMSA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyk7XG5cdFx0Y29uc3QgbG9jYWwyID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtsb2NhbDEsIGxvY2FsMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBzbmlwcGV0cyBleGlzdHMgLSBoYXMgbXVsdGlwbGUgY29uZmxpY3RzIGFuZCBhY2NlcHQgb25lIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGxldCBjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgaHRtbFNuaXBwZXQyKTtcblxuXHRcdGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gc25pcHBldHMgZXhpc3RzIC0gaGFzIG11bHRpcGxlIGNvbmZsaWN0cyBhbmQgYWNjZXB0IGFsbCBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0Y29uc3QgY29uZmxpY3RzID0gdGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0Mik7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzFdLnByZXZpZXdSZXNvdXJjZSwgdHNTbmlwcGV0MSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0Mik7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgdHNTbmlwcGV0MSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBhZGRpbmcgYSBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgaHRtbFNuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCB0c1NuaXBwZXQxKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNuaXBwZXRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIGFkZGluZyBhIHNuaXBwZXQgLSBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgdHNTbmlwcGV0MSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDIpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyB1cGRhdGluZyBhIHNuaXBwZXQgLSBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgaHRtbFNuaXBwZXQyKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyB1cGRhdGluZyBhIHNuaXBwZXQgLSBjb25mbGljdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDMsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyB1cGRhdGluZyBhIHNuaXBwZXQgLSByZXNvbHZlIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MywgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0Mik7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0Mik7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgc25pcHBldCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHJlbW92ZVNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIHRzU25pcHBldDEpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIG51bGwpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBzbmlwcGV0IC0gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlU25pcHBldCgnaHRtbC5qc29uJywgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCB0c1NuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHNuaXBwZXQgbG9jYWxseSBhbmQgdXBkYXRpbmcgaXQgcmVtb3RlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCB0c1NuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBodG1sU25pcHBldDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgc25pcHBldCAtIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlU25pcHBldCgnaHRtbC5qc29uJywgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvY2FsID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtsb2NhbF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgc25pcHBldCAtIHJlc29sdmUgY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVTbmlwcGV0KCdodG1sLmpzb24nLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0Myk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIHRzU25pcHBldDEpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIGh0bWxTbmlwcGV0Myk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSwgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MyB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHNuaXBwZXQgLSByZXNvbHZlIGNvbmZsaWN0IGJ5IHJlbW92aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlU25pcHBldCgnaHRtbC5qc29uJywgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgdHNTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgbnVsbCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBnbG9iYWwgYW5kIGxhbmd1YWdlIHNuaXBwZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnZ2xvYmFsLmNvZGUtc25pcHBldHMnLCBnbG9iYWxTbmlwcGV0LCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgaHRtbFNuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2dsb2JhbC5jb2RlLXNuaXBwZXRzJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIGdsb2JhbFNuaXBwZXQpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ2dsb2JhbC5jb2RlLXNuaXBwZXRzJzogZ2xvYmFsU25pcHBldCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBzaG91bGQgaWdub3JlIG5vbiBzbmlwcGV0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdnbG9iYWwuY29kZS1zbmlwcGV0cycsIGdsb2JhbFNuaXBwZXQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuaHRtbCcsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCB0c1NuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2dsb2JhbC5jb2RlLXNuaXBwZXRzJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIGdsb2JhbFNuaXBwZXQpO1xuXHRcdGNvbnN0IGFjdHVhbDMgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5odG1sJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDMsIG51bGwpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEsICdnbG9iYWwuY29kZS1zbmlwcGV0cyc6IGdsb2JhbFNuaXBwZXQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpZXdzIGFyZSByZXNldCBhZnRlciBhbGwgY29uZmxpY3RzIHJlc29sdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChjb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDIpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayghYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGRpcm5hbWUoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSkpKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgc25pcHBldHMgYW5kIGFsbCBzbmlwcGV0cyBhcmUgbWVyZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBzbmlwcGV0cyBhbmQgYWxsIHNuaXBwZXRzIGFyZSBtZXJnZWQgYW5kIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpLCB0cnVlKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNuaXBwZXRzIGFuZCBvbmUgc25pcHBldCBoYXMgbm8gY2hhbmdlcyBhbmQgb25lIHNuaXBwZXQgaXMgbWVyZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0Y29uc3QgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgc25pcHBldHMgYW5kIG9uZSBzbmlwcGV0IGhhcyBubyBjaGFuZ2VzIGFuZCBzbmlwcGV0cyBpcyBtZXJnZWQgYW5kIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSwgdHJ1ZSk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNuaXBwZXRzIHdpdGggY29uZmxpY3RzIGFuZCBhbGwgc25pcHBldHMgYXJlIG1lcmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBzbmlwcGV0cyB3aXRoIGNvbmZsaWN0cyBhbmQgb25seSBvbmUgc25pcHBldCBpcyBhY2NlcHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHQgd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgc25pcHBldHMgd2l0aCBjb25mbGljdHMgYW5kIGFsbCBzbmlwcGV0cyBhcmUgYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblxuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSwgaHRtbFNuaXBwZXQyKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1sxXS5wcmV2aWV3UmVzb3VyY2UsIHRzU25pcHBldDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHQgd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgc25pcHBldHMgd2l0aCBjb25mbGljdHMgYW5kIGFsbCBzbmlwcGV0cyBhcmUgYWNjZXB0ZWQgYW5kIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0Mik7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMV0ucHJldmlld1Jlc291cmNlLCB0c1NuaXBwZXQyKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcHJvZmlsZSBzbmlwcGV0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuY3JlYXRlTmFtZWRQcm9maWxlKCdwcm9maWxlMScpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50MiwgcHJvZmlsZSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0Q2xpZW50LnN5bmMoKTtcblxuXHRcdGNvbnN0IHN5bmNlZFByb2ZpbGUgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlLmlkKSE7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50LCBzeW5jZWRQcm9maWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgaHRtbFNuaXBwZXQxKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gcGFyc2VTbmlwcGV0cyhjb250ZW50OiBzdHJpbmcpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0XHRjb25zdCBzeW5jRGF0YTogSVN5bmNEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShzeW5jRGF0YS5jb250ZW50KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVNuaXBwZXQobmFtZTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcsIGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50LCBwcm9maWxlPzogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNuaXBwZXRzUmVzb3VyY2UgPSBqb2luUGF0aCgocHJvZmlsZSA/PyB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSkuc25pcHBldHNIb21lLCBuYW1lKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc25pcHBldHNSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiByZW1vdmVTbmlwcGV0KG5hbWU6IHN0cmluZywgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBzbmlwcGV0c1Jlc291cmNlID0gam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCBuYW1lKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwoc25pcHBldHNSZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiByZWFkU25pcHBldChuYW1lOiBzdHJpbmcsIGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50LCBwcm9maWxlPzogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNuaXBwZXRzUmVzb3VyY2UgPSBqb2luUGF0aCgocHJvZmlsZSA/PyB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSkuc25pcHBldHNIb21lLCBuYW1lKTtcblx0XHRpZiAoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHNuaXBwZXRzUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoc25pcHBldHNSZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFByZXZpZXdzKGFjdHVhbDogSVJlc291cmNlUHJldmlld1tdLCBleHBlY3RlZDogVVJJW10pIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5tYXAoKHsgcHJldmlld1Jlc291cmNlIH0pID0+IHByZXZpZXdSZXNvdXJjZS50b1N0cmluZygpKSwgZXhwZWN0ZWQubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSkpO1xuXHR9XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsU0FBUyxnQkFBZ0I7QUFFbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBMkIsZ0NBQWdDO0FBRTNELFNBQXNDLDJCQUEyQixrQkFBa0IsY0FBYyxrQkFBa0I7QUFDbkgsU0FBUyxvQkFBb0IsOEJBQThCO0FBRTNELE1BQU0sYUFBYTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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
