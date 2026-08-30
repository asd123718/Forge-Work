import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { IFileService } from "../../../files/common/files.js";
import { assertDefined } from "../../../../base/common/types.js";
import { dirname, joinPath } from "../../../../base/common/resources.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { IUserDataSyncStoreService, PREVIEW_DIR_NAME, SyncResource, SyncStatus } from "../../common/userDataSync.js";
const PROMPT1_TEXT = "Write a poem about a programmer who falls in love with their code.";
const PROMPT2_TEXT = "Explain quantum physics using only emojis and cat memes.";
const PROMPT3_TEXT = "Create a dialogue between a toaster and a refrigerator about their daily routines.";
const PROMPT4_TEXT = "Describe a day in the life of a rubber duck debugging session.";
const PROMPT5_TEXT = "Write a short story where a bug in the code becomes a superhero.";
const PROMPT6_TEXT = "Imagine a world where all software bugs are sentient.\nWhat do they talk about?";
suite("PromptsSync", () => {
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
    const maybeSynchronizer = testClient.getSynchronizer(SyncResource.Prompts);
    assertDefined(
      maybeSynchronizer,
      "Prompts synchronizer object must be defined."
    );
    testObject = maybeSynchronizer;
    client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
  });
  test("when prompts does not exist", async () => {
    const fileService = testClient.instantiationService.get(IFileService);
    const promptsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.promptsHome;
    assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
    let manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    assert.ok(!await fileService.exists(promptsResource));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    assertDefined(
      lastSyncUserData,
      "Last sync user data must be defined."
    );
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(lastSyncUserData.syncData, null);
    manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
  });
  test("when prompt is created after first sync", async () => {
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, testClient);
    let lastSyncUserData = await testObject.getLastSyncUserData();
    const manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, [
      { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
    ]);
    lastSyncUserData = await testObject.getLastSyncUserData();
    assertDefined(
      lastSyncUserData,
      "Last sync user data must be defined."
    );
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assertDefined(
      lastSyncUserData.syncData,
      "Last sync user sync data must be defined."
    );
    assert.deepStrictEqual(
      lastSyncUserData.syncData.content,
      JSON.stringify({ "prompt3.prompt.md": PROMPT3_TEXT })
    );
  });
  test("first time sync - outgoing to server (no prompts)", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(
      actual,
      {
        "prompt3.prompt.md": PROMPT3_TEXT,
        "prompt1.prompt.md": PROMPT1_TEXT
      }
    );
  });
  test("first time sync - incoming from server (no prompts)", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
  });
  test("first time sync when prompts exists", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(
      actual,
      {
        "prompt3.prompt.md": PROMPT3_TEXT,
        "prompt1.prompt.md": PROMPT1_TEXT
      }
    );
  });
  test("first time sync when prompts exists - has conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(
      environmentService.userDataSyncHome,
      testObject.resource,
      PREVIEW_DIR_NAME,
      "prompt3.prompt.md"
    );
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when prompts exists - has conflicts and accept conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT3_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "prompt3.prompt.md": PROMPT3_TEXT });
  });
  test("first time sync when prompts exists - has multiple conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT2_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local1 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "prompt3.prompt.md");
    const local2 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "prompt1.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local1, local2]);
  });
  test("first time sync when prompts exists - has multiple conflicts and accept one conflict", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT2_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    let conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
    conflicts = testObject.conflicts.conflicts;
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "prompt1.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when prompts exists - has multiple conflicts and accept all conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT2_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
    await testObject.accept(conflicts[1].previewResource, PROMPT1_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "prompt3.prompt.md": PROMPT4_TEXT, "prompt1.prompt.md": PROMPT1_TEXT });
  });
  test("sync adding a prompt", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "prompt3.prompt.md": PROMPT3_TEXT, "prompt1.prompt.md": PROMPT1_TEXT });
  });
  test("sync adding a prompt - accept", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
  });
  test("sync updating a prompt", async () => {
    await updatePrompt("default.prompt.md", PROMPT3_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("default.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("default.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "default.prompt.md": PROMPT4_TEXT });
  });
  test("sync updating a prompt - accept", async () => {
    await updatePrompt("my.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("my.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("my.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
  });
  test("sync updating a prompt - conflict", async () => {
    await updatePrompt("some.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("some.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await updatePrompt("some.prompt.md", PROMPT5_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "some.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync updating a prompt - resolve conflict", async () => {
    await updatePrompt("advanced.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("advanced.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await updatePrompt("advanced.prompt.md", PROMPT5_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT4_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("advanced.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "advanced.prompt.md": PROMPT4_TEXT });
  });
  test("sync removing a prompt", async () => {
    await updatePrompt("another.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("chat.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("another.prompt.md", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("chat.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("another.prompt.md", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "chat.prompt.md": PROMPT1_TEXT });
  });
  test("sync removing a prompt - accept", async () => {
    await updatePrompt("my-query.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("summarize.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("my-query.prompt.md", client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("summarize.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("my-query.prompt.md", testClient);
    assert.strictEqual(actual2, null);
  });
  test("sync removing a prompt locally and updating it remotely", async () => {
    await updatePrompt("some.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("important.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("some.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await removePrompt("some.prompt.md", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("important.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("some.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT4_TEXT);
  });
  test("sync removing a prompt - conflict", async () => {
    await updatePrompt("common.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("rare.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("common.prompt.md", client2);
    await client2.sync();
    await updatePrompt("common.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "common.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync removing a prompt - resolve conflict", async () => {
    await updatePrompt("uncommon.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("hot.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("uncommon.prompt.md", client2);
    await client2.sync();
    await updatePrompt("uncommon.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT5_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("hot.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("uncommon.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT5_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "hot.prompt.md": PROMPT1_TEXT, "uncommon.prompt.md": PROMPT5_TEXT });
  });
  test("sync removing a prompt - resolve conflict by removing", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("refactor.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("prompt3.prompt.md", client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("refactor.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "refactor.prompt.md": PROMPT1_TEXT });
  });
  test("sync prompts", async () => {
    await updatePrompt("first.prompt.md", PROMPT6_TEXT, client2);
    await updatePrompt("roaming.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("roaming.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("first.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT6_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "roaming.prompt.md": PROMPT3_TEXT, "first.prompt.md": PROMPT6_TEXT });
  });
  test("sync should ignore non prompts", async () => {
    await updatePrompt("my.prompt.md", PROMPT6_TEXT, client2);
    await updatePrompt("html.html", PROMPT3_TEXT, client2);
    await updatePrompt("shared.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("shared.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("my.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT6_TEXT);
    const actual3 = await readPrompt("html.html", testClient);
    assert.strictEqual(actual3, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "shared.prompt.md": PROMPT1_TEXT, "my.prompt.md": PROMPT6_TEXT });
  });
  test("previews are reset after all conflicts resolved", async () => {
    await updatePrompt("html.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("css.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("html.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
    await testObject.apply(false);
    const fileService = testClient.instantiationService.get(IFileService);
    assert.ok(!await fileService.exists(dirname(conflicts[0].previewResource)));
  });
  test("merge when there are multiple prompts and all prompts are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("sublime.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("tests.prompt.md", PROMPT2_TEXT, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "sublime.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "tests.prompt.md")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts and all prompts are merged and applied", async () => {
    await updatePrompt("short.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("long.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts and one prompt has no changes and one prompt is merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("coding.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("coding.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("exploring.prompt.md", PROMPT2_TEXT, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "exploring.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "coding.prompt.md")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts and one prompt has no changes and prompts is merged and applied", async () => {
    await updatePrompt("quick.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("quick.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("databases.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts with conflicts and all prompts are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("reverse.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("recycle.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("reverse.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("recycle.prompt.md", PROMPT2_TEXT, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "reverse.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "recycle.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "reverse.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "recycle.prompt.md")
      ]
    );
  });
  test("accept when there are multiple prompts with conflicts and only one prompt is accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("current.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("future.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("current.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("future.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "current.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "current.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "current.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
  });
  test("accept when there are multiple prompts with conflicts and all prompts are accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("dynamic.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("static.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("dynamic.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("static.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "dynamic.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "static.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "dynamic.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "static.prompt.md")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, PROMPT2_TEXT);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "dynamic.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "static.prompt.md")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("accept when there are multiple prompts with conflicts and all prompts are accepted and applied", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("edicational.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("unknown.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("edicational.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("unknown.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assertDefined(
      preview,
      "Preview must be defined."
    );
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "edicational.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "unknown.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "edicational.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "unknown.prompt.md")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
    assertDefined(
      preview,
      "Preview must be defined after accept."
    );
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, PROMPT2_TEXT);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(
      preview,
      null,
      "Preview after the last apply must be `null`."
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("sync profile prompts", async () => {
    const client22 = disposableStore.add(new UserDataSyncClient(server));
    await client22.setUp(true);
    const profile = await client22.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
    await updatePrompt("my.prompt.md", PROMPT3_TEXT, client22, profile);
    await client22.sync();
    await testClient.sync();
    const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
    const content = await readPrompt("my.prompt.md", testClient, syncedProfile);
    assert.strictEqual(content, PROMPT3_TEXT);
  });
  function parsePrompts(content) {
    const syncData = JSON.parse(content);
    return JSON.parse(syncData.content);
  }
  async function updatePrompt(name, content, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
    await fileService.writeFile(promptsResource, VSBuffer.fromString(content));
  }
  async function removePrompt(name, client) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const promptsResource = joinPath(userDataProfilesService.defaultProfile.promptsHome, name);
    await fileService.del(promptsResource);
  }
  async function readPrompt(name, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
    if (await fileService.exists(promptsResource)) {
      const content = await fileService.readFile(promptsResource);
      return content.value.toString();
    }
    return null;
  }
  function assertPreviews(actual, expected) {
    assert.deepStrictEqual(
      actual.map(({ previewResource }) => previewResource.toString()),
      expected.map((uri) => uri.toString())
    );
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHByb21wdHNTeW5jLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGFzc2VydERlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IFByb21wdHNTeW5jaHJvbml6ZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0c1N5bmMvcHJvbXB0c1N5bmMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZVByZXZpZXcsIElTeW5jRGF0YSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgUFJFVklFV19ESVJfTkFNRSwgU3luY1Jlc291cmNlLCBTeW5jU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5cbmNvbnN0IFBST01QVDFfVEVYVCA9ICdXcml0ZSBhIHBvZW0gYWJvdXQgYSBwcm9ncmFtbWVyIHdobyBmYWxscyBpbiBsb3ZlIHdpdGggdGhlaXIgY29kZS4nO1xuY29uc3QgUFJPTVBUMl9URVhUID0gJ0V4cGxhaW4gcXVhbnR1bSBwaHlzaWNzIHVzaW5nIG9ubHkgZW1vamlzIGFuZCBjYXQgbWVtZXMuJztcbmNvbnN0IFBST01QVDNfVEVYVCA9ICdDcmVhdGUgYSBkaWFsb2d1ZSBiZXR3ZWVuIGEgdG9hc3RlciBhbmQgYSByZWZyaWdlcmF0b3IgYWJvdXQgdGhlaXIgZGFpbHkgcm91dGluZXMuJztcbmNvbnN0IFBST01QVDRfVEVYVCA9ICdEZXNjcmliZSBhIGRheSBpbiB0aGUgbGlmZSBvZiBhIHJ1YmJlciBkdWNrIGRlYnVnZ2luZyBzZXNzaW9uLic7XG5jb25zdCBQUk9NUFQ1X1RFWFQgPSAnV3JpdGUgYSBzaG9ydCBzdG9yeSB3aGVyZSBhIGJ1ZyBpbiB0aGUgY29kZSBiZWNvbWVzIGEgc3VwZXJoZXJvLic7XG5jb25zdCBQUk9NUFQ2X1RFWFQgPSAnSW1hZ2luZSBhIHdvcmxkIHdoZXJlIGFsbCBzb2Z0d2FyZSBidWdzIGFyZSBzZW50aWVudC5cXG5XaGF0IGRvIHRoZXkgdGFsayBhYm91dD8nO1xuXG5zdWl0ZSgnUHJvbXB0c1N5bmMnLCAoKSA9PiB7XG5cdGNvbnN0IHNlcnZlciA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdGxldCB0ZXN0Q2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cdGxldCBjbGllbnQyOiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cblx0bGV0IHRlc3RPYmplY3Q6IFByb21wdHNTeW5jaHJvbml6ZXI7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHR0ZXN0Q2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IHRlc3RDbGllbnQuc2V0VXAodHJ1ZSk7XG5cblx0XHRjb25zdCBtYXliZVN5bmNocm9uaXplciA9IHRlc3RDbGllbnQuZ2V0U3luY2hyb25pemVyKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSBhcyAoUHJvbXB0c1N5bmNocm9uaXplciB8IHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0bWF5YmVTeW5jaHJvbml6ZXIsXG5cdFx0XHQnUHJvbXB0cyBzeW5jaHJvbml6ZXIgb2JqZWN0IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHR0ZXN0T2JqZWN0ID0gbWF5YmVTeW5jaHJvbml6ZXI7XG5cblx0XHRjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gcHJvbXB0cyBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvbXB0c1Jlc291cmNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5wcm9tcHRzSG9tZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCksIG51bGwpO1xuXHRcdGxldCBtYW5pZmVzdCA9IGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMocHJvbXB0c1Jlc291cmNlKSkpO1xuXG5cdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdGxhc3RTeW5jVXNlckRhdGEsXG5cdFx0XHQnTGFzdCBzeW5jIHVzZXIgZGF0YSBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YS5yZWYsIHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhLCByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEsIG51bGwpO1xuXG5cdFx0bWFuaWZlc3QgPSBhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXG5cdFx0bWFuaWZlc3QgPSBhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHByb21wdCBpcyBjcmVhdGVkIGFmdGVyIGZpcnN0IHN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cblx0XHRsZXQgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW1xuXHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7c2VydmVyLnVybH0vdjEvcmVzb3VyY2UvJHt0ZXN0T2JqZWN0LnJlc291cmNlfWAsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogbGFzdFN5bmNVc2VyRGF0YT8ucmVmIH0gfSxcblx0XHRdKTtcblxuXHRcdGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblxuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRsYXN0U3luY1VzZXJEYXRhLFxuXHRcdFx0J0xhc3Qgc3luYyB1c2VyIGRhdGEgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEsXG5cdFx0XHQnTGFzdCBzeW5jIHVzZXIgc3luYyBkYXRhIG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0bGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50LFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoeyAncHJvbXB0My5wcm9tcHQubWQnOiBQUk9NUFQzX1RFWFQgfSksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIC0gb3V0Z29pbmcgdG8gc2VydmVyIChubyBwcm9tcHRzKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCB0ZXN0Q2xpZW50KTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHQnVGVzdCBvYmplY3QgY29udGVudCBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VQcm9tcHRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhY3R1YWwsXG5cdFx0XHR7XG5cdFx0XHRcdCdwcm9tcHQzLnByb21wdC5tZCc6IFBST01QVDNfVEVYVCxcblx0XHRcdFx0J3Byb21wdDEucHJvbXB0Lm1kJzogUFJPTVBUMV9URVhULFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyAtIGluY29taW5nIGZyb20gc2VydmVyIChubyBwcm9tcHRzKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDNfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIFBST01QVDFfVEVYVCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyB3aGVuIHByb21wdHMgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUM19URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgUFJPTVBUMV9URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWN0dWFsLFxuXHRcdFx0e1xuXHRcdFx0XHQncHJvbXB0My5wcm9tcHQubWQnOiBQUk9NUFQzX1RFWFQsXG5cdFx0XHRcdCdwcm9tcHQxLnByb21wdC5tZCc6IFBST01QVDFfVEVYVCxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBwcm9tcHRzIGV4aXN0cyAtIGhhcyBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBqb2luUGF0aChcblx0XHRcdGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLFxuXHRcdFx0dGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSxcblx0XHRcdCdwcm9tcHQzLnByb21wdC5tZCcsXG5cdFx0KTtcblxuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW2xvY2FsXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyB3aGVuIHByb21wdHMgZXhpc3RzIC0gaGFzIGNvbmZsaWN0cyBhbmQgYWNjZXB0IGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChjb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQzX1RFWFQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUM19URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAncHJvbXB0My5wcm9tcHQubWQnOiBQUk9NUFQzX1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyB3aGVuIHByb21wdHMgZXhpc3RzIC0gaGFzIG11bHRpcGxlIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwxID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdwcm9tcHQzLnByb21wdC5tZCcpO1xuXHRcdGNvbnN0IGxvY2FsMiA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAncHJvbXB0MS5wcm9tcHQubWQnKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtsb2NhbDEsIGxvY2FsMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBwcm9tcHRzIGV4aXN0cyAtIGhhcyBtdWx0aXBsZSBjb25mbGljdHMgYW5kIGFjY2VwdCBvbmUgY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGxldCBjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUNF9URVhUKTtcblxuXHRcdGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAncHJvbXB0MS5wcm9tcHQubWQnKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtsb2NhbF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBwcm9tcHRzIGV4aXN0cyAtIGhhcyBtdWx0aXBsZSBjb25mbGljdHMgYW5kIGFjY2VwdCBhbGwgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDJfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRjb25zdCBjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUNF9URVhUKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChjb25mbGljdHNbMV0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUNF9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgUFJPTVBUMV9URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAncHJvbXB0My5wcm9tcHQubWQnOiBQUk9NUFQ0X1RFWFQsICdwcm9tcHQxLnByb21wdC5tZCc6IFBST01QVDFfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBhZGRpbmcgYSBwcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQzX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBQUk9NUFQxX1RFWFQpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAncHJvbXB0My5wcm9tcHQubWQnOiBQUk9NUFQzX1RFWFQsICdwcm9tcHQxLnByb21wdC5tZCc6IFBST01QVDFfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBhZGRpbmcgYSBwcm9tcHQgLSBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDNfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIFBST01QVDFfVEVYVCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBwcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdkZWZhdWx0LnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2RlZmF1bHQucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdkZWZhdWx0LnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQ0X1RFWFQpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnZGVmYXVsdC5wcm9tcHQubWQnOiBQUk9NUFQ0X1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBwcm9tcHQgLSBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdteS5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdteS5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnbXkucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDRfVEVYVCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBwcm9tcHQgLSBjb25mbGljdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3NvbWUucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc29tZS5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdzb21lLnByb21wdC5tZCcsIFBST01QVDVfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3NvbWUucHJvbXB0Lm1kJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyB1cGRhdGluZyBhIHByb21wdCAtIHJlc29sdmUgY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdhZHZhbmNlZC5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdhZHZhbmNlZC5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdhZHZhbmNlZC5wcm9tcHQubWQnLCBQUk9NUFQ1X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdhZHZhbmNlZC5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUNF9URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2FkdmFuY2VkLnByb21wdC5tZCc6IFBST01QVDRfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHByb21wdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2Fub3RoZXIucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2NoYXQucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGF3YWl0IHJlbW92ZVByb21wdCgnYW5vdGhlci5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdjaGF0LnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdhbm90aGVyLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBudWxsKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnY2hhdC5wcm9tcHQubWQnOiBQUk9NUFQxX1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBwcm9tcHQgLSBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdteS1xdWVyeS5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc3VtbWFyaXplLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVQcm9tcHQoJ215LXF1ZXJ5LnByb21wdC5tZCcsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnc3VtbWFyaXplLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdteS1xdWVyeS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBwcm9tcHQgbG9jYWxseSBhbmQgdXBkYXRpbmcgaXQgcmVtb3RlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdzb21lLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdpbXBvcnRhbnQucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc29tZS5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlUHJvbXB0KCdzb21lLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnaW1wb3J0YW50LnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdzb21lLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBQUk9NUFQ0X1RFWFQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgcHJvbXB0IC0gY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjb21tb24ucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3JhcmUucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGF3YWl0IHJlbW92ZVByb21wdCgnY29tbW9uLnByb21wdC5tZCcsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjb21tb24ucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvY2FsID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdjb21tb24ucHJvbXB0Lm1kJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHByb21wdCAtIHJlc29sdmUgY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCd1bmNvbW1vbi5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnaG90LnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVQcm9tcHQoJ3VuY29tbW9uLnByb21wdC5tZCcsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCd1bmNvbW1vbi5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDVfVEVYVCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdob3QucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDFfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRQcm9tcHQoJ3VuY29tbW9uLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBQUk9NUFQ1X1RFWFQpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHQnVGVzdCBvYmplY3QgY29udGVudCBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VQcm9tcHRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdob3QucHJvbXB0Lm1kJzogUFJPTVBUMV9URVhULCAndW5jb21tb24ucHJvbXB0Lm1kJzogUFJPTVBUNV9URVhUIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgcHJvbXB0IC0gcmVzb2x2ZSBjb25mbGljdCBieSByZW1vdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3JlZmFjdG9yLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3JlZmFjdG9yLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBudWxsKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAncmVmYWN0b3IucHJvbXB0Lm1kJzogUFJPTVBUMV9URVhUIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHByb21wdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdmaXJzdC5wcm9tcHQubWQnLCBQUk9NUFQ2X1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncm9hbWluZy5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgncm9hbWluZy5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUM19URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgnZmlyc3QucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIFBST01QVDZfVEVYVCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0Y29udGVudCxcblx0XHRcdCdUZXN0IG9iamVjdCBjb250ZW50IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3JvYW1pbmcucHJvbXB0Lm1kJzogUFJPTVBUM19URVhULCAnZmlyc3QucHJvbXB0Lm1kJzogUFJPTVBUNl9URVhUIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHNob3VsZCBpZ25vcmUgbm9uIHByb21wdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdteS5wcm9tcHQubWQnLCBQUk9NUFQ2X1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnaHRtbC5odG1sJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3NoYXJlZC5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnc2hhcmVkLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdteS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgUFJPTVBUNl9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwzID0gYXdhaXQgcmVhZFByb21wdCgnaHRtbC5odG1sJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDMsIG51bGwpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnc2hhcmVkLnByb21wdC5tZCc6IFBST01QVDFfVEVYVCwgJ215LnByb21wdC5tZCc6IFBST01QVDZfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlld3MgYXJlIHJlc2V0IGFmdGVyIGFsbCBjb25mbGljdHMgcmVzb2x2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdodG1sLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjc3MucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnaHRtbC5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0Y29uc3QgY29uZmxpY3RzID0gdGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKCFhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoZGlybmFtZShjb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9tcHRzIGFuZCBhbGwgcHJvbXB0cyBhcmUgbWVyZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdzdWJsaW1lLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCd0ZXN0cy5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3N1YmxpbWUucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndGVzdHMucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9tcHRzIGFuZCBhbGwgcHJvbXB0cyBhcmUgbWVyZ2VkIGFuZCBhcHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc2hvcnQucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2xvbmcucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyksIHRydWUpO1xuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldywgbnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyBhbmQgb25lIHByb21wdCBoYXMgbm8gY2hhbmdlcyBhbmQgb25lIHByb21wdCBpcyBtZXJnZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2NvZGluZy5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjb2RpbmcucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2V4cGxvcmluZy5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2V4cGxvcmluZy5wcm9tcHQubWQnKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdjb2RpbmcucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9tcHRzIGFuZCBvbmUgcHJvbXB0IGhhcyBubyBjaGFuZ2VzIGFuZCBwcm9tcHRzIGlzIG1lcmdlZCBhbmQgYXBwbGllZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3F1aWNrLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3F1aWNrLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdkYXRhYmFzZXMucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyksIHRydWUpO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3LCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9tcHRzIHdpdGggY29uZmxpY3RzIGFuZCBhbGwgcHJvbXB0cyBhcmUgbWVyZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdyZXZlcnNlLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdyZWN5Y2xlLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3JldmVyc2UucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3JlY3ljbGUucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3JldmVyc2UucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAncmVjeWNsZS5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdyZXZlcnNlLnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3JlY3ljbGUucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHByb21wdHMgd2l0aCBjb25mbGljdHMgYW5kIG9ubHkgb25lIHByb21wdCBpcyBhY2NlcHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnY3VycmVudC5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZnV0dXJlLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2N1cnJlbnQucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2Z1dHVyZS5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2N1cnJlbnQucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZnV0dXJlLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2N1cnJlbnQucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZnV0dXJlLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2N1cnJlbnQucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZnV0dXJlLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2Z1dHVyZS5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHQgd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyB3aXRoIGNvbmZsaWN0cyBhbmQgYWxsIHByb21wdHMgYXJlIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdkeW5hbWljLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdzdGF0aWMucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZHluYW1pYy5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc3RhdGljLnByb21wdC5tZCcsIFBST01QVDJfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZHluYW1pYy5wcm9tcHQubWQnKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdzdGF0aWMucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZHluYW1pYy5wcm9tcHQubWQnKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdzdGF0aWMucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblxuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUNF9URVhUKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1sxXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDJfVEVYVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdkeW5hbWljLnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3N0YXRpYy5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9tcHRzIHdpdGggY29uZmxpY3RzIGFuZCBhbGwgcHJvbXB0cyBhcmUgYWNjZXB0ZWQgYW5kIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdlZGljYXRpb25hbC5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgndW5rbm93bi5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdlZGljYXRpb25hbC5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgndW5rbm93bi5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0cHJldmlldyxcblx0XHRcdCdQcmV2aWV3IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3LnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZWRpY2F0aW9uYWwucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndW5rbm93bi5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdlZGljYXRpb25hbC5wcm9tcHQubWQnKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd1bmtub3duLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldy5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUNF9URVhUKTtcblxuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRwcmV2aWV3LFxuXHRcdFx0J1ByZXZpZXcgbXVzdCBiZSBkZWZpbmVkIGFmdGVyIGFjY2VwdC4nLFxuXHRcdCk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldy5yZXNvdXJjZVByZXZpZXdzWzFdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUMl9URVhUKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmV2aWV3LFxuXHRcdFx0bnVsbCxcblx0XHRcdCdQcmV2aWV3IGFmdGVyIHRoZSBsYXN0IGFwcGx5IG11c3QgYmUgYG51bGxgLicsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcHJvZmlsZSBwcm9tcHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5jcmVhdGVOYW1lZFByb2ZpbGUoJ3Byb2ZpbGUxJyk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdteS5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIsIHByb2ZpbGUpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdENsaWVudC5zeW5jKCk7XG5cblx0XHRjb25zdCBzeW5jZWRQcm9maWxlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCkhO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkUHJvbXB0KCdteS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50LCBzeW5jZWRQcm9maWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgUFJPTVBUM19URVhUKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gcGFyc2VQcm9tcHRzKGNvbnRlbnQ6IHN0cmluZyk6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4ge1xuXHRcdGNvbnN0IHN5bmNEYXRhOiBJU3luY0RhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gdXBkYXRlUHJvbXB0KFxuXHRcdG5hbWU6IHN0cmluZyxcblx0XHRjb250ZW50OiBzdHJpbmcsXG5cdFx0Y2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQsXG5cdFx0cHJvZmlsZT86IElVc2VyRGF0YVByb2ZpbGUsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHByb21wdHNSZXNvdXJjZSA9IGpvaW5QYXRoKChwcm9maWxlID8/IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlKS5wcm9tcHRzSG9tZSwgbmFtZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHByb21wdHNSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiByZW1vdmVQcm9tcHQobmFtZTogc3RyaW5nLCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHByb21wdHNSZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnByb21wdHNIb21lLCBuYW1lKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwocHJvbXB0c1Jlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlYWRQcm9tcHQobmFtZTogc3RyaW5nLCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudCwgcHJvZmlsZT86IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9tcHRzUmVzb3VyY2UgPSBqb2luUGF0aCgocHJvZmlsZSA/PyB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSkucHJvbXB0c0hvbWUsIG5hbWUpO1xuXHRcdGlmIChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMocHJvbXB0c1Jlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHByb21wdHNSZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFByZXZpZXdzKGFjdHVhbDogSVJlc291cmNlUHJldmlld1tdLCBleHBlY3RlZDogVVJJW10pIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWN0dWFsLm1hcCgoeyBwcmV2aWV3UmVzb3VyY2UgfSkgPT4gcHJldmlld1Jlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0ZXhwZWN0ZWQubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSksXG5cdFx0KTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxTQUFTLGdCQUFnQjtBQUdsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQiw4QkFBOEI7QUFDM0QsU0FBUywrQ0FBK0M7QUFDeEQsU0FBMkIsZ0NBQWdDO0FBQzNELFNBQXNDLDJCQUEyQixrQkFBa0IsY0FBYyxrQkFBa0I7QUFFbkgsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sZUFBZTtBQUNyQixNQUFNLGVBQWU7QUFDckIsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sZUFBZTtBQUNyQixNQUFNLGVBQWU7QUFFckIsTUFBTSxlQUFlLE1BQU07QUFDMUIsUUFBTSxTQUFTLElBQUksdUJBQXVCO0FBQzFDLE1BQUk7QUFDSixNQUFJO0FBRUosTUFBSTtBQUVKLFdBQVMsWUFBWTtBQUNwQixVQUFNLFdBQVcscUJBQXFCLElBQUkseUJBQXlCLEVBQUUsTUFBTTtBQUFBLEVBQzVFLENBQUM7QUFFRCxRQUFNLGtCQUFrQix3Q0FBd0M7QUFFaEUsUUFBTSxZQUFZO0FBQ2pCLGlCQUFhLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUMvRCxVQUFNLFdBQVcs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
