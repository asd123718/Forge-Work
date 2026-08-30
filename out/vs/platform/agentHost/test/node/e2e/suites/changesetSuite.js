import assert from "assert";
import { execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { retry } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ContentEncoding } from "../../../../common/state/protocol/common/commands.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ChangesetOperationTargetKind } from "../../../../common/state/protocol/channels-changeset/commands.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import {
  ChangesetKind,
  buildBranchChangesetUri,
  buildCompareTurnsChangesetUri,
  buildSessionChangesetUri,
  buildTurnChangesetUri,
  buildUncommittedChangesetUri
} from "../../../../common/changesetUri.js";
import { createRealSession, dispatchTurn, driveTurnToCompletion, initTestGitRepo, resolveGitHubToken, startBackgroundApprovalLoop } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
const CHANGESET_OPERATION_TIMEOUT_MS = 6e4;
function defineChangesetTests(context) {
  const { config, createdSessions, tempDirs } = context;
  let clientSeq = 1e3;
  function nextClientSeq() {
    return clientSeq++;
  }
  function createGitWorkspace(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(workspace);
    initTestGitRepo(workspace);
    writeFileSync(join(workspace, "seed.txt"), "seed\n");
    execSync("git add .", { cwd: workspace });
    execSync('git commit -q -m "seed"', { cwd: workspace });
    return workspace;
  }
  async function createSessionIn(workspace, prefix) {
    return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
  }
  async function createWorktreeSessionIn(workspace, prefix) {
    tempDirs.push(`${workspace}.worktrees`);
    context.client.setWorkingDirectory(workspace);
    await context.client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `${prefix}-${config.provider}` }, 3e4);
    await context.client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: config.githubToken ?? resolveGitHubToken() }, 3e4);
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    const branch = execSync("git branch --show-current", { cwd: workspace, encoding: "utf8" }).trim();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: [URI.file(workspace).toString()],
      config: { isolation: "worktree", branch }
    }, 3e4);
    createdSessions.push(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    context.client.clearReceived();
    return sessionUri;
  }
  function writeFileCommand(file, contents) {
    return `!node -e "require('fs').writeFileSync(process.argv[1],process.argv[2])" ${file} ${contents}`;
  }
  function writeFileBase64Command(file, contents) {
    const encodedFile = Buffer.from(file).toString("base64");
    const encodedContents = Buffer.from(contents).toString("base64");
    return `!node -e "const fs=require('fs');fs.writeFileSync(Buffer.from(process.argv[1],'base64').toString(),Buffer.from(process.argv[2],'base64'))" ${encodedFile} ${encodedContents}`;
  }
  function writeFileTwiceBase64Command(file, first, second) {
    const encodedFile = Buffer.from(file).toString("base64");
    const encodedFirst = Buffer.from(first).toString("base64");
    const encodedSecond = Buffer.from(second).toString("base64");
    return `!node -e "const fs=require('fs');const file=Buffer.from(process.argv[1],'base64').toString();fs.writeFileSync(file,Buffer.from(process.argv[2],'base64'));fs.writeFileSync(file,Buffer.from(process.argv[3],'base64'))" ${encodedFile} ${encodedFirst} ${encodedSecond}`;
  }
  function deleteFileCommand(file) {
    return `!node -e "require('fs').unlinkSync(process.argv[1])" ${file}`;
  }
  function renameFileCommand(source, target) {
    return `!node -e "require('fs').renameSync(process.argv[1],process.argv[2])" ${source} ${target}`;
  }
  function fileUri(file) {
    return file.edit.after?.uri ?? file.edit.before?.uri ?? "";
  }
  function fileHasBasename(file, basename) {
    return URI.parse(fileUri(file)).path.endsWith(`/${basename}`);
  }
  async function waitForFileInChangeset(channel, basename, timeout = 6e4) {
    const notification = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "changeset/contentChanged") || getActionEnvelope(n).channel !== channel) {
        return false;
      }
      const action2 = getActionEnvelope(n).action;
      return action2.files.some((file) => fileHasBasename(file, basename));
    }, timeout);
    const action = getActionEnvelope(notification).action;
    return action.files.find((file) => fileHasBasename(file, basename));
  }
  async function waitForTurnComplete(sessionUri, turnId) {
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
  }
  async function changesetState(channel) {
    const result = await context.client.call("subscribe", { channel });
    let state = result.snapshot.state;
    if (state.status === "computing") {
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "changeset/statusChanged") && getActionEnvelope(n).channel === channel && getActionEnvelope(n).action.status !== "computing",
        6e4
      );
      state = (await context.client.call("subscribe", { channel })).snapshot.state;
    }
    return state;
  }
  async function waitForChangesetFiles(channel, basenames) {
    return retry(async () => {
      const state = await changesetState(channel);
      const files = [];
      for (const basename of basenames) {
        const file = state.files.find((file2) => fileHasBasename(file2, basename));
        if (file) {
          files.push(file);
        }
      }
      if (state.status !== "ready" || files.length !== basenames.length) {
        throw new Error(`Changeset ${channel} has not reported ${basenames.join(", ")}`);
      }
      return files;
    }, 100, 100);
  }
  async function runBangTurn(sessionUri, turnId, command, clientSeq2) {
    context.client.clearReceived();
    dispatchTurn(context.client, sessionUri, turnId, command, clientSeq2);
    await waitForTurnComplete(sessionUri, turnId);
  }
  async function waitForIdleResourceOnlyOperation(channel, operationId, initialOperations) {
    const operations = new Map(initialOperations.map((operation) => [operation.id, operation]));
    const pendingStatuses = /* @__PURE__ */ new Map();
    const isReady = () => {
      const operation = operations.get(operationId);
      return operation?.status === "idle" && operation.scopes.includes("resource") && !operation.scopes.includes("changeset");
    };
    const replaceOperations = (replacement) => {
      operations.clear();
      for (const operation of replacement) {
        const pendingStatus = pendingStatuses.get(operation.id);
        operations.set(operation.id, pendingStatus === void 0 ? operation : { ...operation, status: pendingStatus });
        pendingStatuses.delete(operation.id);
      }
    };
    const reduce = (n) => {
      const isContentChanged = isActionNotification(n, "changeset/contentChanged");
      const isOperationsChanged = isActionNotification(n, "changeset/operationsChanged");
      const isStatusChanged = isActionNotification(n, "changeset/operationStatusChanged");
      if (!isContentChanged && !isOperationsChanged && !isStatusChanged || getActionEnvelope(n).channel !== channel) {
        return;
      }
      if (isOperationsChanged) {
        replaceOperations(getActionEnvelope(n).action.operations ?? []);
      } else if (isContentChanged) {
        const replacement = getActionEnvelope(n).action.operations;
        if (replacement) {
          replaceOperations(replacement);
        }
      } else {
        const changed = getActionEnvelope(n).action;
        const operation = operations.get(changed.operationId);
        if (operation) {
          operations.set(changed.operationId, { ...operation, status: changed.status });
        } else {
          pendingStatuses.set(changed.operationId, changed.status);
        }
      }
    };
    const processed = new Set(context.client.receivedNotifications());
    for (const notification of processed) {
      reduce(notification);
    }
    if (isReady()) {
      return;
    }
    await context.client.waitForNotification((n) => {
      if (processed.has(n)) {
        return false;
      }
      processed.add(n);
      reduce(n);
      return isReady();
    }, CHANGESET_OPERATION_TIMEOUT_MS);
  }
  async function createModifiedUncommittedChangeset(prefix) {
    const workspace = createGitWorkspace(`ahp-${prefix}-`);
    const sessionUri = await createSessionIn(workspace, prefix);
    const changeset = buildUncommittedChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: changeset });
    const initialOperations = subscribed.snapshot.state.operations ?? [];
    context.client.clearReceived();
    const turnId = `turn-${prefix}`;
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("seed.txt", "edited"), 1);
    const file = await waitForFileInChangeset(changeset, "seed.txt");
    await waitForIdleResourceOnlyOperation(changeset, "discard-changes", initialOperations);
    await waitForTurnComplete(sessionUri, turnId);
    return { workspace, changeset, file };
  }
  async function invokeDiscard(changeset, resource) {
    context.client.clearReceived();
    const completed = context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/operationStatusChanged") && getActionEnvelope(n).channel === changeset && getActionEnvelope(n).action.operationId === "discard-changes" && getActionEnvelope(n).action.status === "idle",
      CHANGESET_OPERATION_TIMEOUT_MS
    );
    await context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "discard-changes",
      target: { kind: ChangesetOperationTargetKind.Resource, resource }
    }, CHANGESET_OPERATION_TIMEOUT_MS);
    await completed;
    return context.client.receivedNotifications(
      (n) => isActionNotification(n, "changeset/operationStatusChanged") && getActionEnvelope(n).channel === changeset
    ).map((n) => getActionEnvelope(n).action).filter((action) => action.operationId === "discard-changes").map((action) => action.status);
  }
  conformanceTest(context, "subscribing to a changeset reaches ready status", async function() {
    const workspace = createGitWorkspace("ahp-changeset-status-");
    const sessionUri = await createSessionIn(workspace, "changeset-status");
    const branchUri = buildBranchChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: branchUri });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/statusChanged") && getActionEnvelope(n).channel === branchUri && getActionEnvelope(n).action.status === "ready",
      6e4
    );
    assert.deepStrictEqual({
      resource: subscribed.snapshot.resource,
      files: subscribed.snapshot.state.files
    }, {
      resource: branchUri,
      files: []
    });
  });
  conformanceTest(context, "a file written during a turn appears in the branch changeset", async function() {
    const workspace = createGitWorkspace("ahp-changeset-add-");
    const sessionUri = await createSessionIn(workspace, "changeset-add");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-add";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("added.txt", "ADDED"), 1);
    const file = await waitForFileInChangeset(branchUri, "added.txt");
    await waitForTurnComplete(sessionUri, turnId);
    assert.deepStrictEqual({
      hasBeforeSide: file.edit.before !== void 0,
      hasAfterSide: file.edit.after !== void 0,
      diff: file.edit.diff,
      reviewed: file.reviewed
    }, {
      hasBeforeSide: false,
      hasAfterSide: true,
      diff: { added: 1, removed: 0 },
      reviewed: false
    });
  });
  conformanceTest(context, "editing a committed file reports both sides of the change", async function() {
    const workspace = createGitWorkspace("ahp-changeset-edit-");
    const sessionUri = await createSessionIn(workspace, "changeset-edit");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-edit";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("seed.txt", "edited"), 1);
    const file = await waitForFileInChangeset(branchUri, "seed.txt");
    await waitForTurnComplete(sessionUri, turnId);
    assert.deepStrictEqual({
      hasBeforeSide: file.edit.before !== void 0,
      hasAfterSide: file.edit.after !== void 0
    }, {
      hasBeforeSide: true,
      hasAfterSide: true
    });
  });
  conformanceTest(context, "committed changeset content can be read through its git blob reference", async function() {
    const workspace = createGitWorkspace("ahp-changeset-git-blob-");
    const sessionUri = await createSessionIn(workspace, "changeset-git-blob");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-git-blob", writeFileCommand("seed.txt", "edited"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["seed.txt"]);
    assert.ok(file.edit.before?.content?.uri);
    const content = await context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: file.edit.before.content.uri,
      encoding: ContentEncoding.Utf8
    });
    assert.strictEqual(content.data.replaceAll("\r\n", "\n"), "seed\n");
  });
  conformanceTest(context, "deleting a committed file reports only the before side", async function() {
    const workspace = createGitWorkspace("ahp-changeset-delete-");
    const sessionUri = await createSessionIn(workspace, "changeset-delete");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-delete", deleteFileCommand("seed.txt"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["seed.txt"]);
    assert.deepStrictEqual({
      hasBeforeSide: file.edit.before !== void 0,
      hasAfterSide: file.edit.after !== void 0,
      diff: file.edit.diff
    }, {
      hasBeforeSide: true,
      hasAfterSide: false,
      diff: { added: 0, removed: 1 }
    });
  });
  conformanceTest(context, "renaming a committed file reports the destination change", async function() {
    const workspace = createGitWorkspace("ahp-changeset-rename-");
    const sessionUri = await createSessionIn(workspace, "changeset-rename");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-rename", renameFileCommand("seed.txt", "renamed.txt"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["renamed.txt"]);
    assert.deepStrictEqual({
      after: file.edit.after?.uri.endsWith("/renamed.txt"),
      sourceExists: existsSync(join(workspace, "seed.txt")),
      destinationExists: existsSync(join(workspace, "renamed.txt"))
    }, {
      after: true,
      sourceExists: false,
      destinationExists: true
    });
  });
  conformanceTest(context, "one turn reports mixed create edit and delete changes", async function() {
    const workspace = createGitWorkspace("ahp-changeset-mixed-");
    writeFileSync(join(workspace, "delete.txt"), "delete\n");
    execSync("git add .", { cwd: workspace });
    execSync('git commit -q -m "second seed"', { cwd: workspace });
    const sessionUri = await createSessionIn(workspace, "changeset-mixed");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(
      sessionUri,
      "turn-changeset-mixed",
      `!node -e "const fs=require('fs');fs.writeFileSync('seed.txt','edited');fs.writeFileSync('added.txt','added');fs.unlinkSync('delete.txt')"`,
      1
    );
    const files = await waitForChangesetFiles(branchUri, ["seed.txt", "added.txt", "delete.txt"]);
    assert.deepStrictEqual(files.map((file) => ({
      name: URI.parse(fileUri(file)).path.split("/").at(-1),
      hasBefore: file.edit.before !== void 0,
      hasAfter: file.edit.after !== void 0
    })), [
      { name: "seed.txt", hasBefore: true, hasAfter: true },
      { name: "added.txt", hasBefore: false, hasAfter: true },
      { name: "delete.txt", hasBefore: true, hasAfter: false }
    ]);
  });
  conformanceTest(context, "ignored files do not appear in a branch changeset", async function() {
    const workspace = createGitWorkspace("ahp-changeset-ignored-");
    writeFileSync(join(workspace, ".gitignore"), "ignored.log\n");
    execSync("git add .gitignore", { cwd: workspace });
    execSync('git commit -q -m "ignore generated log"', { cwd: workspace });
    const sessionUri = await createSessionIn(workspace, "changeset-ignored");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await changesetState(branchUri);
    context.client.clearReceived();
    const changed = context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/contentChanged") && getActionEnvelope(n).channel === branchUri,
      6e4
    );
    await runBangTurn(sessionUri, "turn-changeset-ignored", writeFileCommand("ignored.log", "ignored"), 1);
    await changed;
    const state = await changesetState(branchUri);
    assert.deepStrictEqual(state.files, []);
  });
  conformanceTest(context, "a file created and deleted in one turn leaves no branch change", async function() {
    const workspace = createGitWorkspace("ahp-changeset-create-delete-");
    const sessionUri = await createSessionIn(workspace, "changeset-create-delete");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await changesetState(branchUri);
    context.client.clearReceived();
    const changed = context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/contentChanged") && getActionEnvelope(n).channel === branchUri,
      6e4
    );
    await runBangTurn(sessionUri, "turn-changeset-create-delete", `!node -e "const fs=require('fs');fs.writeFileSync('temporary.txt','temporary');fs.unlinkSync('temporary.txt')"`, 1);
    await changed;
    const state = await changesetState(branchUri);
    assert.deepStrictEqual(state.files, []);
  });
  conformanceTest(context, "an edit restored in the same turn leaves no branch change", async function() {
    const workspace = createGitWorkspace("ahp-changeset-edit-restore-");
    const sessionUri = await createSessionIn(workspace, "changeset-edit-restore");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await changesetState(branchUri);
    context.client.clearReceived();
    const changed = context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/contentChanged") && getActionEnvelope(n).channel === branchUri,
      6e4
    );
    await runBangTurn(sessionUri, "turn-changeset-edit-restore", writeFileTwiceBase64Command("seed.txt", "changed", "seed\n"), 1);
    await changed;
    const state = await changesetState(branchUri);
    assert.deepStrictEqual(state.files, []);
  });
  conformanceTest(context, "an added multiline file reports every added line", async function() {
    const workspace = createGitWorkspace("ahp-changeset-multiline-add-");
    const sessionUri = await createSessionIn(workspace, "changeset-multiline-add");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-multiline-add", writeFileBase64Command("lines.txt", "one\ntwo\nthree\n"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["lines.txt"]);
    assert.deepStrictEqual(file.edit.diff, { added: 3, removed: 0 });
  });
  conformanceTest(context, "deleting a multiline tracked file reports every removed line", async function() {
    const workspace = createGitWorkspace("ahp-changeset-multiline-delete-");
    writeFileSync(join(workspace, "lines.txt"), "one\ntwo\nthree\n");
    execSync("git add lines.txt", { cwd: workspace });
    execSync('git commit -q -m "add multiline file"', { cwd: workspace });
    const sessionUri = await createSessionIn(workspace, "changeset-multiline-delete");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-multiline-delete", deleteFileCommand("lines.txt"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["lines.txt"]);
    assert.deepStrictEqual(file.edit.diff, { added: 0, removed: 3 });
  });
  conformanceTest(context, "a changed filename containing spaces remains addressable", async function() {
    const workspace = createGitWorkspace("ahp-changeset-spaced-file-");
    const sessionUri = await createSessionIn(workspace, "changeset-spaced-file");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-spaced-file", writeFileBase64Command("spaced file.txt", "content\n"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["spaced file.txt"]);
    assert.deepStrictEqual({
      id: URI.parse(file.id).path.endsWith("/spaced file.txt"),
      after: file.edit.after?.uri.endsWith("/spaced%20file.txt") || file.edit.after?.uri.endsWith("/spaced file.txt"),
      exists: existsSync(join(workspace, "spaced file.txt"))
    }, {
      id: true,
      after: true,
      exists: true
    });
  });
  conformanceTest(context, "an empty repository reports an untracked file as added", async function() {
    const workspace = mkdtempSync(join(tmpdir(), "ahp-changeset-empty-repo-"));
    tempDirs.push(workspace);
    initTestGitRepo(workspace);
    const sessionUri = await createSessionIn(workspace, "changeset-empty-repo");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(sessionUri, "turn-changeset-empty-repo", writeFileCommand("first.txt", "first"), 1);
    const [file] = await waitForChangesetFiles(branchUri, ["first.txt"]);
    assert.deepStrictEqual({
      hasBefore: file.edit.before !== void 0,
      hasAfter: file.edit.after !== void 0,
      diff: file.edit.diff
    }, {
      hasBefore: false,
      hasAfter: true,
      diff: { added: 1, removed: 0 }
    });
  });
  conformanceTest(context, "a client can mark a changeset file reviewed", async function() {
    const workspace = createGitWorkspace("ahp-changeset-review-");
    const sessionUri = await createSessionIn(workspace, "changeset-review");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-review";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("reviewme.txt", "REVIEW"), 1);
    const file = await waitForFileInChangeset(branchUri, "reviewme.txt");
    await waitForTurnComplete(sessionUri, turnId);
    context.client.dispatch({
      channel: branchUri,
      clientSeq: nextClientSeq(),
      action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: true }
    });
    const echoed = await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/filesReviewChanged") && getActionEnvelope(n).channel === branchUri,
      6e4
    );
    const authoritative = await context.client.call("subscribe", { channel: branchUri });
    const reviewed = authoritative.snapshot.state.files.find((candidate) => candidate.id === file.id)?.reviewed;
    assert.deepStrictEqual({
      action: getActionEnvelope(echoed).action,
      reviewed
    }, {
      action: {
        type: ActionType.ChangesetFilesReviewChanged,
        files: [file.id],
        reviewed: true
      },
      reviewed: true
    });
  });
  conformanceTest(context, "uncommitted changes advertise the operations that act on them", async function() {
    const workspace = createGitWorkspace("ahp-changeset-ops-");
    const sessionUri = await createSessionIn(workspace, "changeset-ops");
    const uncommittedUri = buildUncommittedChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: uncommittedUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-ops";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("operate.txt", "OPERATE"), 1);
    const notification = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "changeset/contentChanged") || getActionEnvelope(n).channel !== uncommittedUri) {
        return false;
      }
      return (getActionEnvelope(n).action.operations ?? []).length > 0;
    }, 6e4);
    const operations = getActionEnvelope(notification).action.operations ?? [];
    await waitForTurnComplete(sessionUri, turnId);
    assert.deepStrictEqual(operations.map((operation) => ({ id: operation.id, scopes: operation.scopes })), [
      { id: "commit", scopes: ["changeset"] },
      { id: "discard-changes", scopes: ["resource"] }
    ]);
  });
  conformanceTest(context, "discarding a tracked change restores the file and reports operation status", async function() {
    const { workspace, changeset, file } = await createModifiedUncommittedChangeset("changeset-discard");
    const resource = file.edit.after?.uri;
    assert.ok(resource);
    context.client.clearReceived();
    const completed = context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/operationStatusChanged") && getActionEnvelope(n).channel === changeset && getActionEnvelope(n).action.operationId === "discard-changes" && getActionEnvelope(n).action.status === "idle"
    );
    await context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "discard-changes",
      target: { kind: ChangesetOperationTargetKind.Resource, resource }
    });
    await completed;
    const statuses = context.client.receivedNotifications(
      (n) => isActionNotification(n, "changeset/operationStatusChanged") && getActionEnvelope(n).channel === changeset
    ).map((n) => getActionEnvelope(n).action).filter((action) => action.operationId === "discard-changes").map((action) => action.status);
    assert.deepStrictEqual({
      contents: readFileSync(join(workspace, "seed.txt"), "utf8").replaceAll("\r\n", "\n"),
      statuses
    }, {
      contents: "seed\n",
      statuses: ["running", "idle"]
    });
  });
  conformanceTest(context, "discarding an untracked file removes it from disk", async function() {
    const workspace = createGitWorkspace("ahp-changeset-discard-added-");
    const sessionUri = await createSessionIn(workspace, "changeset-discard-added");
    const changeset = buildUncommittedChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: changeset });
    const initialOperations = subscribed.snapshot.state.operations ?? [];
    await runBangTurn(sessionUri, "turn-changeset-discard-added", writeFileCommand("untracked.txt", "untracked"), 1);
    const [file] = await waitForChangesetFiles(changeset, ["untracked.txt"]);
    await waitForIdleResourceOnlyOperation(changeset, "discard-changes", initialOperations);
    const statuses = await invokeDiscard(changeset, fileUri(file));
    assert.deepStrictEqual({
      exists: existsSync(join(workspace, "untracked.txt")),
      statuses
    }, {
      exists: false,
      statuses: ["running", "idle"]
    });
  }, false);
  conformanceTest(context, "discarding a deleted tracked file restores its contents", async function() {
    const workspace = createGitWorkspace("ahp-changeset-discard-deleted-");
    const sessionUri = await createSessionIn(workspace, "changeset-discard-deleted");
    const changeset = buildUncommittedChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: changeset });
    const initialOperations = subscribed.snapshot.state.operations ?? [];
    await runBangTurn(sessionUri, "turn-changeset-discard-deleted", deleteFileCommand("seed.txt"), 1);
    const [file] = await waitForChangesetFiles(changeset, ["seed.txt"]);
    await waitForIdleResourceOnlyOperation(changeset, "discard-changes", initialOperations);
    const statuses = await invokeDiscard(changeset, fileUri(file));
    assert.deepStrictEqual({
      contents: readFileSync(join(workspace, "seed.txt"), "utf8").replaceAll("\r\n", "\n"),
      statuses
    }, {
      contents: "seed\n",
      statuses: ["running", "idle"]
    });
  });
  conformanceTest(context, "discarding one file preserves sibling changes", async function() {
    const workspace = createGitWorkspace("ahp-changeset-discard-one-");
    writeFileSync(join(workspace, "first.txt"), "original first\n");
    writeFileSync(join(workspace, "second.txt"), "original second\n");
    execSync("git add .", { cwd: workspace });
    execSync('git commit -q -m "sibling seed"', { cwd: workspace });
    const sessionUri = await createSessionIn(workspace, "changeset-discard-one");
    const changeset = buildUncommittedChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: changeset });
    const initialOperations = subscribed.snapshot.state.operations ?? [];
    await runBangTurn(
      sessionUri,
      "turn-changeset-discard-one",
      `!node -e "const fs=require('fs');fs.writeFileSync('first.txt','changed first');fs.writeFileSync('second.txt','changed second')"`,
      1
    );
    const [first] = await waitForChangesetFiles(changeset, ["first.txt", "second.txt"]);
    await waitForIdleResourceOnlyOperation(changeset, "discard-changes", initialOperations);
    await invokeDiscard(changeset, fileUri(first));
    const state = await retry(async () => {
      const result = await changesetState(changeset);
      if (result.files.some((file) => fileUri(file).endsWith("/first.txt")) || !result.files.some((file) => fileUri(file).endsWith("/second.txt"))) {
        throw new Error("Changeset has not refreshed after discard");
      }
      return result;
    }, 100, 100);
    assert.deepStrictEqual({
      firstExists: existsSync(join(workspace, "first.txt")),
      secondExists: existsSync(join(workspace, "second.txt")),
      files: state.files.map((file) => URI.parse(fileUri(file)).path.split("/").at(-1))
    }, {
      firstExists: true,
      secondExists: true,
      files: ["second.txt"]
    });
    assert.strictEqual(readFileSync(join(workspace, "first.txt"), "utf8").replaceAll("\r\n", "\n"), "original first\n");
  }, !context.isWindows);
  conformanceTest(context, "review state can be applied to multiple changed files", async function() {
    const workspace = createGitWorkspace("ahp-changeset-review-multiple-");
    const sessionUri = await createSessionIn(workspace, "changeset-review-multiple");
    const changeset = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: changeset });
    await runBangTurn(
      sessionUri,
      "turn-changeset-review-multiple",
      `!node -e "const fs=require('fs');fs.writeFileSync('first.txt','first');fs.writeFileSync('second.txt','second')"`,
      1
    );
    const files = await waitForChangesetFiles(changeset, ["first.txt", "second.txt"]);
    context.client.clearReceived();
    context.client.dispatch({
      channel: changeset,
      clientSeq: nextClientSeq(),
      action: { type: ActionType.ChangesetFilesReviewChanged, files: files.map((file) => file.id), reviewed: true }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/filesReviewChanged") && getActionEnvelope(n).channel === changeset
    );
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/statusChanged") && getActionEnvelope(n).channel === changeset && getActionEnvelope(n).action.status === "ready"
    );
    const state = await changesetState(changeset);
    assert.deepStrictEqual(state.files.map((file) => file.reviewed), [true, true]);
  });
  conformanceTest(context, "a client can clear review state from a changed file", async function() {
    const workspace = createGitWorkspace("ahp-changeset-review-unset-");
    const sessionUri = await createSessionIn(workspace, "changeset-review-unset");
    const changeset = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: changeset });
    await runBangTurn(sessionUri, "turn-changeset-review-unset", writeFileCommand("seed.txt", "edited"), 1);
    const [file] = await waitForChangesetFiles(changeset, ["seed.txt"]);
    context.client.dispatch({
      channel: changeset,
      clientSeq: nextClientSeq(),
      action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: true }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/filesReviewChanged") && getActionEnvelope(n).channel === changeset
    );
    context.client.clearReceived();
    context.client.dispatch({
      channel: changeset,
      clientSeq: nextClientSeq(),
      action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: false }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/filesReviewChanged") && getActionEnvelope(n).channel === changeset
    );
    const state = await changesetState(changeset);
    assert.strictEqual(state.files.find((candidate) => candidate.id === file.id)?.reviewed, false);
  });
  conformanceTest(context, "a second edit updates one changeset entry in place", async function() {
    const workspace = createGitWorkspace("ahp-changeset-second-edit-");
    const sessionUri = await createSessionIn(workspace, "changeset-second-edit");
    const changeset = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: changeset });
    await runBangTurn(
      sessionUri,
      "turn-changeset-second-edit-first",
      `!node -e "require('fs').writeFileSync('seed.txt','first\\nsecond\\n')"`,
      1
    );
    const [first] = await waitForChangesetFiles(changeset, ["seed.txt"]);
    await runBangTurn(
      sessionUri,
      "turn-changeset-second-edit-second",
      `!node -e "require('fs').writeFileSync('seed.txt','first\\nsecond\\nthird\\n')"`,
      2
    );
    const second = await retry(async () => {
      const [candidate] = await waitForChangesetFiles(changeset, ["seed.txt"]);
      if (candidate.edit.diff?.added !== 3) {
        throw new Error("Changeset has not incorporated the second edit");
      }
      return candidate;
    }, 100, 100);
    const state = await changesetState(changeset);
    assert.deepStrictEqual({
      fileCount: state.files.length,
      sameIdentity: first.id === second.id,
      diff: second.edit.diff
    }, {
      fileCount: 1,
      sameIdentity: true,
      diff: { added: 3, removed: 1 }
    });
  }, false);
  conformanceTest(context, "a nested untracked file retains its workspace-relative identity", async function() {
    const workspace = createGitWorkspace("ahp-changeset-nested-");
    const sessionUri = await createSessionIn(workspace, "changeset-nested");
    const changeset = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: changeset });
    await runBangTurn(
      sessionUri,
      "turn-changeset-nested",
      `!node -e "const fs=require('fs');fs.mkdirSync('nested',{recursive:true});fs.writeFileSync('nested/added.txt','nested')"`,
      1
    );
    const [file] = await waitForChangesetFiles(changeset, ["added.txt"]);
    assert.deepStrictEqual({
      path: URI.parse(file.edit.after.uri).path.endsWith("/nested/added.txt"),
      hasBefore: file.edit.before !== void 0,
      diff: file.edit.diff
    }, {
      path: true,
      hasBefore: false,
      diff: { added: 1, removed: 0 }
    });
  });
  conformanceTest(context, "discarding the last tracked change clears changeset and list summaries", async function() {
    const workspace = createGitWorkspace("ahp-changeset-discard-last-");
    const sessionUri = await createSessionIn(workspace, "changeset-discard-last");
    const branchChangeset = buildBranchChangesetUri(sessionUri);
    const uncommittedChangeset = buildUncommittedChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchChangeset });
    const subscribed = await context.client.call("subscribe", { channel: uncommittedChangeset });
    const initialOperations = subscribed.snapshot.state.operations ?? [];
    await runBangTurn(sessionUri, "turn-changeset-discard-last", writeFileCommand("seed.txt", "edited"), 1);
    await waitForChangesetFiles(branchChangeset, ["seed.txt"]);
    const [file] = await waitForChangesetFiles(uncommittedChangeset, ["seed.txt"]);
    await waitForIdleResourceOnlyOperation(uncommittedChangeset, "discard-changes", initialOperations);
    await invokeDiscard(uncommittedChangeset, fileUri(file));
    await retry(async () => {
      const branch = await changesetState(branchChangeset);
      const uncommitted = await changesetState(uncommittedChangeset);
      const sessions = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
      assert.deepStrictEqual({
        branchFiles: branch.files.length,
        uncommittedFiles: uncommitted.files.length,
        summary: sessions.items.find((item) => item.resource === sessionUri)?.changes
      }, {
        branchFiles: 0,
        uncommittedFiles: 0,
        summary: { additions: 0, deletions: 0, files: 0 }
      });
    }, 100, 100);
  }, !context.isWindows);
  conformanceTest(context, "listSessions reports the aggregate file change summary", async function() {
    const workspace = createGitWorkspace("ahp-changeset-list-summary-");
    const sessionUri = await createSessionIn(workspace, "changeset-list-summary");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    await runBangTurn(
      sessionUri,
      "turn-changeset-list-summary",
      `!node -e "const fs=require('fs');fs.writeFileSync('seed.txt','edited');fs.writeFileSync('added.txt','added')"`,
      1
    );
    await waitForChangesetFiles(branchUri, ["seed.txt", "added.txt"]);
    const changes = await retry(async () => {
      const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
      const summary = result.items.find((item) => item.resource === sessionUri)?.changes;
      if (!summary || summary.files !== 2) {
        throw new Error("Session list has not received the changes summary");
      }
      return summary;
    }, 100, 100);
    assert.deepStrictEqual(changes, { additions: 2, deletions: 1, files: 2 });
  });
  conformanceTest(context, "invoking an unknown changeset operation is rejected", async function() {
    const { changeset } = await createModifiedUncommittedChangeset("changeset-unknown-operation");
    await assert.rejects(context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "unknown-operation"
    }));
  });
  conformanceTest(context, "changeset operation rejects a target outside its advertised scopes", async function() {
    const { changeset } = await createModifiedUncommittedChangeset("changeset-invalid-scope");
    await assert.rejects(context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "discard-changes"
    }));
  });
  conformanceTest(context, "a new session advertises its initial changeset catalog on a separate channel", async function() {
    const workspace = createGitWorkspace("ahp-changeset-catalog-");
    const sessionUri = await createSessionIn(workspace, "changeset-catalog");
    const session = await context.client.call("subscribe", { channel: sessionUri });
    const changesets = session.snapshot.state.changesets ?? [];
    const advertisedChannels = changesets.map((changeset) => changeset.uriTemplate).filter((uri) => !uri.includes("{"));
    const subscribed = await Promise.all(advertisedChannels.map(
      (channel) => context.client.call("subscribe", { channel })
    ));
    assert.deepStrictEqual({
      catalog: changesets.map((changeset) => ({
        changeKind: changeset.changeKind,
        uriTemplate: changeset.uriTemplate,
        canReview: changeset.capabilities?.review !== void 0
      })),
      subscribedChannels: subscribed.map((result) => result.snapshot.resource)
    }, {
      catalog: [{
        changeKind: ChangesetKind.Uncommitted,
        uriTemplate: buildUncommittedChangesetUri(sessionUri),
        canReview: false
      }],
      subscribedChannels: advertisedChannels
    });
  });
  conformanceTest(context, "a per-turn changeset reports a file created in that turn", async function() {
    const workspace = createGitWorkspace("ahp-turn-changeset-add-");
    const sessionUri = await createWorktreeSessionIn(workspace, "turn-changeset-add");
    await runBangTurn(sessionUri, "turn-add", writeFileCommand("turn-added.txt", "ADDED"), 1);
    const state = await changesetState(buildTurnChangesetUri(sessionUri, "turn-add"));
    const file = state.files.find((file2) => fileUri(file2).endsWith("/turn-added.txt"));
    assert.deepStrictEqual({
      status: state.status,
      hasBefore: file?.edit.before !== void 0,
      hasAfter: file?.edit.after !== void 0,
      diff: file?.edit.diff
    }, {
      status: "ready",
      hasBefore: false,
      hasAfter: true,
      diff: { added: 1, removed: 0 }
    });
  }, false);
  conformanceTest(context, "a per-turn changeset reports an edit to a committed file", async function() {
    const workspace = createGitWorkspace("ahp-turn-changeset-edit-");
    const sessionUri = await createWorktreeSessionIn(workspace, "turn-changeset-edit");
    await runBangTurn(sessionUri, "turn-edit", writeFileCommand("seed.txt", "edited"), 1);
    const state = await changesetState(buildTurnChangesetUri(sessionUri, "turn-edit"));
    const file = state.files.find((file2) => fileUri(file2).endsWith("/seed.txt"));
    assert.deepStrictEqual({
      status: state.status,
      hasBefore: file?.edit.before !== void 0,
      hasAfter: file?.edit.after !== void 0
    }, {
      status: "ready",
      hasBefore: true,
      hasAfter: true
    });
  }, false);
  conformanceTest(context, "a per-turn changeset reports a file deleted in that turn", async function() {
    const workspace = createGitWorkspace("ahp-turn-changeset-delete-");
    const sessionUri = await createWorktreeSessionIn(workspace, "turn-changeset-delete");
    await runBangTurn(sessionUri, "turn-delete", `!node -e "require('fs').unlinkSync(process.argv[1])" seed.txt`, 1);
    const state = await changesetState(buildTurnChangesetUri(sessionUri, "turn-delete"));
    const file = state.files.find((file2) => fileUri(file2).endsWith("/seed.txt"));
    assert.deepStrictEqual({
      status: state.status,
      hasBefore: file?.edit.before !== void 0,
      hasAfter: file?.edit.after !== void 0
    }, {
      status: "ready",
      hasBefore: true,
      hasAfter: false
    });
  }, false);
  conformanceTest(context, "a per-turn changeset for a no-op turn is empty and ready", async function() {
    const workspace = createGitWorkspace("ahp-turn-changeset-noop-");
    const sessionUri = await createWorktreeSessionIn(workspace, "turn-changeset-noop");
    await runBangTurn(sessionUri, "turn-noop", "/rename No File Changes", 1);
    const state = await changesetState(buildTurnChangesetUri(sessionUri, "turn-noop"));
    assert.deepStrictEqual({ status: state.status, files: state.files }, { status: "ready", files: [] });
  });
  conformanceTest(context, "a per-turn changeset for an unknown turn reports an error", async function() {
    const workspace = createGitWorkspace("ahp-turn-changeset-missing-");
    const sessionUri = await createWorktreeSessionIn(workspace, "turn-changeset-missing");
    await runBangTurn(sessionUri, "turn-known", "/rename Known Turn", 1);
    const state = await changesetState(buildTurnChangesetUri(sessionUri, "missing-turn"));
    assert.strictEqual(state.status, "error");
  }, false);
  conformanceTest(context, "comparing a turn with itself produces an empty ready changeset", async function() {
    const workspace = createGitWorkspace("ahp-compare-turns-same-");
    const sessionUri = await createWorktreeSessionIn(workspace, "compare-turns-same");
    await runBangTurn(sessionUri, "turn-same", writeFileCommand("same.txt", "SAME"), 1);
    const state = await changesetState(buildCompareTurnsChangesetUri(sessionUri, "turn-same", "turn-same"));
    assert.deepStrictEqual({ status: state.status, files: state.files }, { status: "ready", files: [] });
  }, false);
  conformanceTest(context, "comparing two turns reports the changes between their checkpoints", async function() {
    const workspace = createGitWorkspace("ahp-compare-turns-edit-");
    const sessionUri = await createWorktreeSessionIn(workspace, "compare-turns-edit");
    await runBangTurn(sessionUri, "turn-first", writeFileCommand("between.txt", "FIRST"), 1);
    await runBangTurn(sessionUri, "turn-second", writeFileCommand("between.txt", "SECOND"), 2);
    const state = await changesetState(buildCompareTurnsChangesetUri(sessionUri, "turn-first", "turn-second"));
    const file = state.files.find((file2) => fileUri(file2).endsWith("/between.txt"));
    assert.deepStrictEqual({
      status: state.status,
      hasBefore: file?.edit.before !== void 0,
      hasAfter: file?.edit.after !== void 0
    }, {
      status: "ready",
      hasBefore: true,
      hasAfter: true
    });
  }, false);
  conformanceTest(context, "comparing with an unknown turn reports an error", async function() {
    const workspace = createGitWorkspace("ahp-compare-turns-missing-");
    const sessionUri = await createWorktreeSessionIn(workspace, "compare-turns-missing");
    await runBangTurn(sessionUri, "turn-known", writeFileCommand("known.txt", "KNOWN"), 1);
    const state = await changesetState(buildCompareTurnsChangesetUri(sessionUri, "missing-turn", "turn-known"));
    assert.strictEqual(state.status, "error");
  });
  conformanceTest(context, "a materialized git session advertises turn and compare changeset templates", async function() {
    const workspace = createGitWorkspace("ahp-changeset-template-catalog-");
    const sessionUri = await createWorktreeSessionIn(workspace, "changeset-template-catalog");
    await runBangTurn(sessionUri, "turn-materialize", "/rename Materialized", 1);
    const session = await context.client.call("subscribe", { channel: sessionUri });
    const kinds = (session.snapshot.state.changesets ?? []).map((changeset) => changeset.changeKind);
    assert.deepStrictEqual({
      hasTurn: kinds.includes(ChangesetKind.Turn),
      hasCompare: kinds.includes(ChangesetKind.Compare)
    }, {
      hasTurn: true,
      hasCompare: true
    });
  }, false);
  if (context.tier === "parity") {
    (config.supportsMultipleChats && config.streamingFileCreateToolName ? test : test.skip)("session changeset aggregates provider edits from default and peer chats", async function() {
      this.timeout(24e4);
      const workspace = createGitWorkspace(`ahp-provider-session-changeset-${config.provider}-`);
      const sessionUri = await createSessionIn(workspace, "provider-session-changeset");
      const peerUri = buildChatUri(sessionUri, generateUuid());
      await context.client.call("createChat", { channel: sessionUri, chat: peerUri, title: "Changes Peer" });
      await context.client.call("subscribe", { channel: peerUri });
      const sessionChangeset = buildSessionChangesetUri(sessionUri);
      await context.client.call("subscribe", { channel: sessionChangeset });
      await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-provider-default-edit",
        'Create default-provider.txt containing exactly DEFAULT_PROVIDER using your file creation tool; do not run a shell command. Then reply exactly "created".',
        1
      );
      const approval = startBackgroundApprovalLoop(context.client, {
        approvalSeqStart: 100,
        allow: [{ toolName: config.streamingFileCreateToolName }]
      });
      try {
        context.client.dispatch({
          channel: peerUri,
          clientSeq: 10,
          action: {
            type: ActionType.ChatTurnStarted,
            turnId: "turn-provider-peer-edit",
            startedAt: "2025-01-01T00:00:00.000Z",
            message: {
              text: 'Create peer-provider.txt containing exactly PEER_PROVIDER using your file creation tool; do not run a shell command. Then reply exactly "created".',
              origin: { kind: MessageKind.User }
            }
          }
        });
        await context.client.waitForNotification(
          (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === peerUri && getActionEnvelope(n).action.turnId === "turn-provider-peer-edit",
          9e4
        );
      } finally {
        await approval.stop();
      }
      assert.deepStrictEqual(approval.errors, []);
      const files = await retry(async () => {
        const state = await changesetState(sessionChangeset);
        const matches = ["default-provider.txt", "peer-provider.txt"].map((name) => state.files.find((file) => fileUri(file).endsWith(`/${name}`)));
        if (matches.some((match) => !match)) {
          throw new Error("Session changeset has not aggregated both provider chats");
        }
        return matches;
      }, 100, 100);
      assert.deepStrictEqual(files.map((file) => URI.parse(fileUri(file)).path.split("/").at(-1)).sort(), [
        "default-provider.txt",
        "peer-provider.txt"
      ]);
    });
  }
}
export {
  defineChangesetTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcY2hhbmdlc2V0U3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFRoZSBjaGFuZ2VzZXQgY2hhbm5lbDogaG93IHRoZSBob3N0IHJlcG9ydHMgd2hhdCBhIHNlc3Npb24gY2hhbmdlZCBvbiBkaXNrLlxuICpcbiAqIEEgY2hhbmdlc2V0IGlzIGNvbXB1dGVkIGZyb20gZ2l0IHJhdGhlciB0aGFuIGZyb20gd2hhdCBhIHRvb2wgcmVwb3J0ZWQsIHNvXG4gKiBpdCBzZWVzIGVkaXRzIHRoZSBhZ2VudCBtYWRlIGJ5IGFueSBtZWFucyBcdTIwMTQgdGhlIHNjZW5hcmlvcyBoZXJlIGRyaXZlIHJlYWxcbiAqIGZpbGUgY2hhbmdlcyB0aHJvdWdoIGhvc3QtZXhlY3V0ZWQgYmFuZyBjb21tYW5kcyBhbmQgbmV2ZXIgY3Jvc3MgdGhlIG1vZGVsXG4gKiBib3VuZGFyeS5cbiAqXG4gKiBUaGUgaG9zdCBwdWJsaXNoZXMgc2V2ZXJhbCBjaGFuZ2VzZXRzIHBlciBzZXNzaW9uLCBlYWNoIG9uIGl0cyBvd25cbiAqIHN1YnNjcmliYWJsZSBjaGFubmVsOiBgYnJhbmNoYCAoYWdhaW5zdCB0aGUgYnJhbmNoIHBvaW50KSwgYHVuY29tbWl0dGVkYFxuICogKHdvcmtpbmctdHJlZSBzdGF0ZSksIGFuZCBgc2Vzc2lvbmAgKGN1bXVsYXRpdmUgZm9yIHRoZSBzZXNzaW9uKS4gVGhleSBhcmVcbiAqIHNlcGFyYXRlIGNoYW5uZWxzIGJlY2F1c2UgYGNoYW5nZXNldC8qYCBhY3Rpb25zIGFyZSBzY29wZWQgdG8gdGhlIGNoYW5nZXNldFxuICogVVJJLCBzbyBhIHNlc3Npb24tb25seSBzdWJzY3JpcHRpb24gbmV2ZXIgcmVjZWl2ZXMgdGhlbS5cbiAqXG4gKiBUaGlzIGNvbnRyYWN0IHByZXZpb3VzbHkgZXhpc3RlZCBvbmx5IGluIHRoZSBmcm96ZW4gYC4uL3Byb3RvY29sL2Agc3VpdGUsXG4gKiB3aGljaCBkcml2ZXMgYSBtb2NrIGFnZW50IHdpdGggdGhlIG1hZ2ljIHByb21wdCBgdGVybWluYWwtZWRpdDo8cGF0aD5gIGFuZFxuICogc28gY2Fubm90IGRlc2NyaWJlIHRoZSBjb250cmFjdCBmb3IgYW55IG90aGVyIEFIUCBpbXBsZW1lbnRhdGlvbi5cbiAqL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgbWtkdGVtcFN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IHJldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHR5cGUgeyBMaXN0U2Vzc2lvbnNSZXN1bHQsIFJlc291cmNlUmVhZFJlc3VsdCwgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRlbnRFbmNvZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENoYW5nZXNldE9wZXJhdGlvblRhcmdldEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhbmdlc2V0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpLCBNZXNzYWdlS2luZCwgUk9PVF9TVEFURV9VUkksIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQge1xuXHRDaGFuZ2VzZXRLaW5kLFxuXHRidWlsZEJyYW5jaENoYW5nZXNldFVyaSxcblx0YnVpbGRDb21wYXJlVHVybnNDaGFuZ2VzZXRVcmksXG5cdGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaSxcblx0YnVpbGRUdXJuQ2hhbmdlc2V0VXJpLFxuXHRidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpLFxufSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uLCBkaXNwYXRjaFR1cm4sIGRyaXZlVHVyblRvQ29tcGxldGlvbiwgaW5pdFRlc3RHaXRSZXBvLCByZXNvbHZlR2l0SHViVG9rZW4sIHN0YXJ0QmFja2dyb3VuZEFwcHJvdmFsTG9vcCB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjb25mb3JtYW5jZVRlc3QsIHR5cGUgSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0IH0gZnJvbSAnLi9lMmVUZXN0Q29udGV4dC5qcyc7XG5cbi8qKiBUaGUgc3Vic2V0IG9mIGBDaGFuZ2VzZXRGaWxlYCB0aGVzZSB0ZXN0cyBhc3NlcnQgb24uICovXG5pbnRlcmZhY2UgSU9ic2VydmVkQ2hhbmdlc2V0RmlsZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJldmlld2VkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZWRpdDoge1xuXHRcdHJlYWRvbmx5IGJlZm9yZT86IHsgcmVhZG9ubHkgdXJpOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRlbnQ/OiB7IHJlYWRvbmx5IHVyaTogc3RyaW5nIH0gfTtcblx0XHRyZWFkb25seSBhZnRlcj86IHsgcmVhZG9ubHkgdXJpOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRlbnQ/OiB7IHJlYWRvbmx5IHVyaTogc3RyaW5nIH0gfTtcblx0XHRyZWFkb25seSBkaWZmPzogeyByZWFkb25seSBhZGRlZDogbnVtYmVyOyByZWFkb25seSByZW1vdmVkOiBudW1iZXIgfTtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElDb250ZW50Q2hhbmdlZEFjdGlvbiB7XG5cdHJlYWRvbmx5IGZpbGVzOiByZWFkb25seSBJT2JzZXJ2ZWRDaGFuZ2VzZXRGaWxlW107XG5cdHJlYWRvbmx5IG9wZXJhdGlvbnM/OiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXTtcbn1cblxuaW50ZXJmYWNlIElPcGVyYXRpb25zQ2hhbmdlZEFjdGlvbiB7XG5cdHJlYWRvbmx5IG9wZXJhdGlvbnM/OiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXTtcbn1cblxuaW50ZXJmYWNlIElPYnNlcnZlZE9wZXJhdGlvbiB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHN0YXR1czogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSU9wZXJhdGlvblN0YXR1c0NoYW5nZWRBY3Rpb24ge1xuXHRyZWFkb25seSBvcGVyYXRpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0dXM6IHN0cmluZztcbn1cblxuY29uc3QgQ0hBTkdFU0VUX09QRVJBVElPTl9USU1FT1VUX01TID0gNjBfMDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lQ2hhbmdlc2V0VGVzdHMoY29udGV4dDogSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0KTogdm9pZCB7XG5cdGNvbnN0IHsgY29uZmlnLCBjcmVhdGVkU2Vzc2lvbnMsIHRlbXBEaXJzIH0gPSBjb250ZXh0O1xuXG5cdC8qKlxuXHQgKiBDbGllbnQgc2VxdWVuY2UgbnVtYmVycyBtdXN0IHN0cmljdGx5IGluY3JlYXNlIGZvciB0aGUgbGlmZXRpbWUgb2YgYVxuXHQgKiBjbGllbnQsIGFuZCB0aGUgc3VpdGUgc2hhcmVzIG9uZSBhY3Jvc3MgdGVzdHMsIHNvIHRoZXkgY2Fubm90IGJlXG5cdCAqIGhhcmQtY29kZWQgcGVyIHNjZW5hcmlvLlxuXHQgKi9cblx0bGV0IGNsaWVudFNlcSA9IDEwMDA7XG5cdGZ1bmN0aW9uIG5leHRDbGllbnRTZXEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY2xpZW50U2VxKys7XG5cdH1cblxuXHQvKiogQSBnaXQgcmVwb3NpdG9yeSB3aXRoIG9uZSBjb21taXR0ZWQgZmlsZSwgc28gYSBicmFuY2ggcG9pbnQgZXhpc3RzLiAqL1xuXHRmdW5jdGlvbiBjcmVhdGVHaXRXb3Jrc3BhY2UocHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksIHByZWZpeCkpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRpbml0VGVzdEdpdFJlcG8od29ya3NwYWNlKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnc2VlZC50eHQnKSwgJ3NlZWRcXG4nKTtcblx0XHRleGVjU3luYygnZ2l0IGFkZCAuJywgeyBjd2Q6IHdvcmtzcGFjZSB9KTtcblx0XHRleGVjU3luYygnZ2l0IGNvbW1pdCAtcSAtbSBcInNlZWRcIicsIHsgY3dkOiB3b3Jrc3BhY2UgfSk7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2U6IHN0cmluZywgcHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgJHtwcmVmaXh9LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVXb3JrdHJlZVNlc3Npb25Jbih3b3Jrc3BhY2U6IHN0cmluZywgcHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRlbXBEaXJzLnB1c2goYCR7d29ya3NwYWNlfS53b3JrdHJlZXNgKTtcblx0XHRjb250ZXh0LmNsaWVudC5zZXRXb3JraW5nRGlyZWN0b3J5KHdvcmtzcGFjZSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQ6IGAke3ByZWZpeH0tJHtjb25maWcucHJvdmlkZXJ9YCB9LCAzMF8wMDApO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiBjb25maWcuZ2l0aHViVG9rZW4gPz8gcmVzb2x2ZUdpdEh1YlRva2VuKCkgfSwgMzBfMDAwKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IGNvbmZpZy5zY2hlbWUsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYnJhbmNoID0gZXhlY1N5bmMoJ2dpdCBicmFuY2ggLS1zaG93LWN1cnJlbnQnLCB7IGN3ZDogd29ya3NwYWNlLCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSh3b3Jrc3BhY2UpLnRvU3RyaW5nKCldLFxuXHRcdFx0Y29uZmlnOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoIH0sXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSB9KTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0cmV0dXJuIHNlc3Npb25Vcmk7XG5cdH1cblxuXHQvKipcblx0ICogV3JpdGVzIGBmaWxlYCB0aHJvdWdoIGEgaG9zdC1leGVjdXRlZCBiYW5nIGNvbW1hbmQsIHNvIHRoZSBjaGFuZ2UgcmVhY2hlc1xuXHQgKiBkaXNrIHRoZSB3YXkgYW4gYWdlbnQncyBzaGVsbCBlZGl0IHdvdWxkIHJhdGhlciB0aGFuIGZyb20gdGhlIHRlc3Rcblx0ICogcHJvY2Vzcy4gUGF0aHMgYXJlIHJlbGF0aXZlIHNvIG5vIFdpbmRvd3MgYmFja3NsYXNoIGhhcyB0byBzdXJ2aXZlIGludG8gYVxuXHQgKiBKYXZhU2NyaXB0IHN0cmluZyBsaXRlcmFsLlxuXHQgKlxuXHQgKiBUaGUgZmlsZSBuYW1lIGFuZCBjb250ZW50cyBhcmUgcGFzc2VkIGFzIGBwcm9jZXNzLmFyZ3ZgIGVudHJpZXMgcmF0aGVyXG5cdCAqIHRoYW4gaW50ZXJwb2xhdGVkIGludG8gdGhlIHNjcmlwdCwgc28gYSB2YWx1ZSBjb250YWluaW5nIGEgcXVvdGUgb3IgYVxuXHQgKiBiYWNrc2xhc2ggY2Fubm90IGJyZWFrIG91dCBvZiB0aGUgbGl0ZXJhbCBvciBjaGFuZ2Ugd2hhdCBydW5zLlxuXHQgKi9cblx0ZnVuY3Rpb24gd3JpdGVGaWxlQ29tbWFuZChmaWxlOiBzdHJpbmcsIGNvbnRlbnRzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgIW5vZGUgLWUgXCJyZXF1aXJlKCdmcycpLndyaXRlRmlsZVN5bmMocHJvY2Vzcy5hcmd2WzFdLHByb2Nlc3MuYXJndlsyXSlcIiAke2ZpbGV9ICR7Y29udGVudHN9YDtcblx0fVxuXG5cdGZ1bmN0aW9uIHdyaXRlRmlsZUJhc2U2NENvbW1hbmQoZmlsZTogc3RyaW5nLCBjb250ZW50czogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBlbmNvZGVkRmlsZSA9IEJ1ZmZlci5mcm9tKGZpbGUpLnRvU3RyaW5nKCdiYXNlNjQnKTtcblx0XHRjb25zdCBlbmNvZGVkQ29udGVudHMgPSBCdWZmZXIuZnJvbShjb250ZW50cykudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXHRcdHJldHVybiBgIW5vZGUgLWUgXCJjb25zdCBmcz1yZXF1aXJlKCdmcycpO2ZzLndyaXRlRmlsZVN5bmMoQnVmZmVyLmZyb20ocHJvY2Vzcy5hcmd2WzFdLCdiYXNlNjQnKS50b1N0cmluZygpLEJ1ZmZlci5mcm9tKHByb2Nlc3MuYXJndlsyXSwnYmFzZTY0JykpXCIgJHtlbmNvZGVkRmlsZX0gJHtlbmNvZGVkQ29udGVudHN9YDtcblx0fVxuXG5cdGZ1bmN0aW9uIHdyaXRlRmlsZVR3aWNlQmFzZTY0Q29tbWFuZChmaWxlOiBzdHJpbmcsIGZpcnN0OiBzdHJpbmcsIHNlY29uZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBlbmNvZGVkRmlsZSA9IEJ1ZmZlci5mcm9tKGZpbGUpLnRvU3RyaW5nKCdiYXNlNjQnKTtcblx0XHRjb25zdCBlbmNvZGVkRmlyc3QgPSBCdWZmZXIuZnJvbShmaXJzdCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXHRcdGNvbnN0IGVuY29kZWRTZWNvbmQgPSBCdWZmZXIuZnJvbShzZWNvbmQpLnRvU3RyaW5nKCdiYXNlNjQnKTtcblx0XHRyZXR1cm4gYCFub2RlIC1lIFwiY29uc3QgZnM9cmVxdWlyZSgnZnMnKTtjb25zdCBmaWxlPUJ1ZmZlci5mcm9tKHByb2Nlc3MuYXJndlsxXSwnYmFzZTY0JykudG9TdHJpbmcoKTtmcy53cml0ZUZpbGVTeW5jKGZpbGUsQnVmZmVyLmZyb20ocHJvY2Vzcy5hcmd2WzJdLCdiYXNlNjQnKSk7ZnMud3JpdGVGaWxlU3luYyhmaWxlLEJ1ZmZlci5mcm9tKHByb2Nlc3MuYXJndlszXSwnYmFzZTY0JykpXCIgJHtlbmNvZGVkRmlsZX0gJHtlbmNvZGVkRmlyc3R9ICR7ZW5jb2RlZFNlY29uZH1gO1xuXHR9XG5cblx0ZnVuY3Rpb24gZGVsZXRlRmlsZUNvbW1hbmQoZmlsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCFub2RlIC1lIFwicmVxdWlyZSgnZnMnKS51bmxpbmtTeW5jKHByb2Nlc3MuYXJndlsxXSlcIiAke2ZpbGV9YDtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlbmFtZUZpbGVDb21tYW5kKHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAhbm9kZSAtZSBcInJlcXVpcmUoJ2ZzJykucmVuYW1lU3luYyhwcm9jZXNzLmFyZ3ZbMV0scHJvY2Vzcy5hcmd2WzJdKVwiICR7c291cmNlfSAke3RhcmdldH1gO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlsZVVyaShmaWxlOiBJT2JzZXJ2ZWRDaGFuZ2VzZXRGaWxlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZmlsZS5lZGl0LmFmdGVyPy51cmkgPz8gZmlsZS5lZGl0LmJlZm9yZT8udXJpID8/ICcnO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlsZUhhc0Jhc2VuYW1lKGZpbGU6IElPYnNlcnZlZENoYW5nZXNldEZpbGUsIGJhc2VuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGZpbGVVcmkoZmlsZSkpLnBhdGguZW5kc1dpdGgoYC8ke2Jhc2VuYW1lfWApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciBhIGBjaGFuZ2VzZXQvY29udGVudENoYW5nZWRgIG9uIGBjaGFubmVsYCB0aGF0IHJlcG9ydHNcblx0ICogYGJhc2VuYW1lYC4gTWF0Y2hlZCBieSBiYXNlbmFtZSBiZWNhdXNlIGdpdCByZXNvbHZlcyBzeW1saW5rcyB3aGVuXG5cdCAqIHJlcG9ydGluZyBpdHMgdG9wIGxldmVsIChtYWNPUyBgL3ZhcmAgdmVyc3VzIGAvcHJpdmF0ZS92YXJgKSwgc28gdGhlXG5cdCAqIHJlcG9ydGVkIFVSSSBuZWVkIG5vdCBzaGFyZSBhIHByZWZpeCB3aXRoIHRoZSB3b3Jrc3BhY2UgcGF0aC5cblx0ICovXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JGaWxlSW5DaGFuZ2VzZXQoY2hhbm5lbDogc3RyaW5nLCBiYXNlbmFtZTogc3RyaW5nLCB0aW1lb3V0ID0gNjBfMDAwKTogUHJvbWlzZTxJT2JzZXJ2ZWRDaGFuZ2VzZXRGaWxlPiB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9jb250ZW50Q2hhbmdlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYW5uZWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIElDb250ZW50Q2hhbmdlZEFjdGlvbjtcblx0XHRcdHJldHVybiBhY3Rpb24uZmlsZXMuc29tZShmaWxlID0+IGZpbGVIYXNCYXNlbmFtZShmaWxlLCBiYXNlbmFtZSkpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIElDb250ZW50Q2hhbmdlZEFjdGlvbjtcblx0XHRyZXR1cm4gYWN0aW9uLmZpbGVzLmZpbmQoZmlsZSA9PiBmaWxlSGFzQmFzZW5hbWUoZmlsZSwgYmFzZW5hbWUpKSE7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yVHVybkNvbXBsZXRlKHNlc3Npb25Vcmk6IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHQ5MF8wMDAsXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNoYW5nZXNldFN0YXRlKGNoYW5uZWw6IHN0cmluZyk6IFByb21pc2U8eyByZWFkb25seSBzdGF0dXM6IHN0cmluZzsgcmVhZG9ubHkgZmlsZXM6IHJlYWRvbmx5IElPYnNlcnZlZENoYW5nZXNldEZpbGVbXTsgcmVhZG9ubHkgZXJyb3I/OiB7IHJlYWRvbmx5IG1lc3NhZ2U/OiBzdHJpbmcgfSB9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWwgfSk7XG5cdFx0bGV0IHN0YXRlID0gcmVzdWx0LnNuYXBzaG90IS5zdGF0ZSBhcyB7IHJlYWRvbmx5IHN0YXR1czogc3RyaW5nOyByZWFkb25seSBmaWxlczogcmVhZG9ubHkgSU9ic2VydmVkQ2hhbmdlc2V0RmlsZVtdOyByZWFkb25seSBlcnJvcj86IHsgcmVhZG9ubHkgbWVzc2FnZT86IHN0cmluZyB9IH07XG5cdFx0aWYgKHN0YXRlLnN0YXR1cyA9PT0gJ2NvbXB1dGluZycpIHtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L3N0YXR1c0NoYW5nZWQnKVxuXHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGFubmVsXG5cdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSBzdGF0dXM6IHN0cmluZyB9KS5zdGF0dXMgIT09ICdjb21wdXRpbmcnLFxuXHRcdFx0XHQ2MF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0c3RhdGUgPSAoYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWwgfSkpLnNuYXBzaG90IS5zdGF0ZSBhcyB0eXBlb2Ygc3RhdGU7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhjaGFubmVsOiBzdHJpbmcsIGJhc2VuYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHJlYWRvbmx5IElPYnNlcnZlZENoYW5nZXNldEZpbGVbXT4ge1xuXHRcdHJldHVybiByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGNoYW5nZXNldFN0YXRlKGNoYW5uZWwpO1xuXHRcdFx0Y29uc3QgZmlsZXM6IElPYnNlcnZlZENoYW5nZXNldEZpbGVbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBiYXNlbmFtZSBvZiBiYXNlbmFtZXMpIHtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IHN0YXRlLmZpbGVzLmZpbmQoZmlsZSA9PiBmaWxlSGFzQmFzZW5hbWUoZmlsZSwgYmFzZW5hbWUpKTtcblx0XHRcdFx0aWYgKGZpbGUpIHtcblx0XHRcdFx0XHRmaWxlcy5wdXNoKGZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUuc3RhdHVzICE9PSAncmVhZHknIHx8IGZpbGVzLmxlbmd0aCAhPT0gYmFzZW5hbWVzLmxlbmd0aCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYW5nZXNldCAke2NoYW5uZWx9IGhhcyBub3QgcmVwb3J0ZWQgJHtiYXNlbmFtZXMuam9pbignLCAnKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmaWxlcztcblx0XHR9LCAxMDAsIDEwMCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBydW5CYW5nVHVybihzZXNzaW9uVXJpOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCBjb21tYW5kLCBjbGllbnRTZXEpO1xuXHRcdGF3YWl0IHdhaXRGb3JUdXJuQ29tcGxldGUoc2Vzc2lvblVyaSwgdHVybklkKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JJZGxlUmVzb3VyY2VPbmx5T3BlcmF0aW9uKFxuXHRcdGNoYW5uZWw6IHN0cmluZyxcblx0XHRvcGVyYXRpb25JZDogc3RyaW5nLFxuXHRcdGluaXRpYWxPcGVyYXRpb25zOiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXSxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IG5ldyBNYXAoaW5pdGlhbE9wZXJhdGlvbnMubWFwKG9wZXJhdGlvbiA9PiBbb3BlcmF0aW9uLmlkLCBvcGVyYXRpb25dKSk7XG5cdFx0Y29uc3QgcGVuZGluZ1N0YXR1c2VzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBpc1JlYWR5ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uID0gb3BlcmF0aW9ucy5nZXQob3BlcmF0aW9uSWQpO1xuXHRcdFx0cmV0dXJuIG9wZXJhdGlvbj8uc3RhdHVzID09PSAnaWRsZSdcblx0XHRcdFx0JiYgb3BlcmF0aW9uLnNjb3Blcy5pbmNsdWRlcygncmVzb3VyY2UnKVxuXHRcdFx0XHQmJiAhb3BlcmF0aW9uLnNjb3Blcy5pbmNsdWRlcygnY2hhbmdlc2V0Jyk7XG5cdFx0fTtcblx0XHRjb25zdCByZXBsYWNlT3BlcmF0aW9ucyA9IChyZXBsYWNlbWVudDogcmVhZG9ubHkgSU9ic2VydmVkT3BlcmF0aW9uW10pOiB2b2lkID0+IHtcblx0XHRcdG9wZXJhdGlvbnMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3Qgb3BlcmF0aW9uIG9mIHJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdTdGF0dXMgPSBwZW5kaW5nU3RhdHVzZXMuZ2V0KG9wZXJhdGlvbi5pZCk7XG5cdFx0XHRcdG9wZXJhdGlvbnMuc2V0KG9wZXJhdGlvbi5pZCwgcGVuZGluZ1N0YXR1cyA9PT0gdW5kZWZpbmVkID8gb3BlcmF0aW9uIDogeyAuLi5vcGVyYXRpb24sIHN0YXR1czogcGVuZGluZ1N0YXR1cyB9KTtcblx0XHRcdFx0cGVuZGluZ1N0YXR1c2VzLmRlbGV0ZShvcGVyYXRpb24uaWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcmVkdWNlID0gKG46IFBhcmFtZXRlcnM8dHlwZW9mIGlzQWN0aW9uTm90aWZpY2F0aW9uPlswXSk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgaXNDb250ZW50Q2hhbmdlZCA9IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvY29udGVudENoYW5nZWQnKTtcblx0XHRcdGNvbnN0IGlzT3BlcmF0aW9uc0NoYW5nZWQgPSBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L29wZXJhdGlvbnNDaGFuZ2VkJyk7XG5cdFx0XHRjb25zdCBpc1N0YXR1c0NoYW5nZWQgPSBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L29wZXJhdGlvblN0YXR1c0NoYW5nZWQnKTtcblx0XHRcdGlmICgoIWlzQ29udGVudENoYW5nZWQgJiYgIWlzT3BlcmF0aW9uc0NoYW5nZWQgJiYgIWlzU3RhdHVzQ2hhbmdlZCkgfHwgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhbm5lbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNPcGVyYXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRyZXBsYWNlT3BlcmF0aW9ucygoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIElPcGVyYXRpb25zQ2hhbmdlZEFjdGlvbikub3BlcmF0aW9ucyA/PyBbXSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzQ29udGVudENoYW5nZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIElDb250ZW50Q2hhbmdlZEFjdGlvbikub3BlcmF0aW9ucztcblx0XHRcdFx0aWYgKHJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdFx0cmVwbGFjZU9wZXJhdGlvbnMocmVwbGFjZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VkID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIElPcGVyYXRpb25TdGF0dXNDaGFuZ2VkQWN0aW9uO1xuXHRcdFx0XHRjb25zdCBvcGVyYXRpb24gPSBvcGVyYXRpb25zLmdldChjaGFuZ2VkLm9wZXJhdGlvbklkKTtcblx0XHRcdFx0aWYgKG9wZXJhdGlvbikge1xuXHRcdFx0XHRcdG9wZXJhdGlvbnMuc2V0KGNoYW5nZWQub3BlcmF0aW9uSWQsIHsgLi4ub3BlcmF0aW9uLCBzdGF0dXM6IGNoYW5nZWQuc3RhdHVzIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHBlbmRpbmdTdGF0dXNlcy5zZXQoY2hhbmdlZC5vcGVyYXRpb25JZCwgY2hhbmdlZC5zdGF0dXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBwcm9jZXNzZWQgPSBuZXcgU2V0KGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucygpKTtcblx0XHRmb3IgKGNvbnN0IG5vdGlmaWNhdGlvbiBvZiBwcm9jZXNzZWQpIHtcblx0XHRcdHJlZHVjZShub3RpZmljYXRpb24pO1xuXHRcdH1cblx0XHRpZiAoaXNSZWFkeSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAocHJvY2Vzc2VkLmhhcyhuKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRwcm9jZXNzZWQuYWRkKG4pO1xuXHRcdFx0cmVkdWNlKG4pO1xuXHRcdFx0cmV0dXJuIGlzUmVhZHkoKTtcblx0XHR9LCBDSEFOR0VTRVRfT1BFUkFUSU9OX1RJTUVPVVRfTVMpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRVbmNvbW1pdHRlZENoYW5nZXNldChwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8e1xuXHRcdHJlYWRvbmx5IHdvcmtzcGFjZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNoYW5nZXNldDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGZpbGU6IElPYnNlcnZlZENoYW5nZXNldEZpbGU7XG5cdH0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoYGFocC0ke3ByZWZpeH0tYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsIHByZWZpeCk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYW5nZXNldCB9KTtcblx0XHRjb25zdCBpbml0aWFsT3BlcmF0aW9ucyA9ICgoc3Vic2NyaWJlZC5zbmFwc2hvdCEuc3RhdGUgYXMgeyBvcGVyYXRpb25zPzogcmVhZG9ubHkgSU9ic2VydmVkT3BlcmF0aW9uW10gfSkub3BlcmF0aW9ucyA/PyBbXSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHR1cm5JZCA9IGB0dXJuLSR7cHJlZml4fWA7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsIHdyaXRlRmlsZUNvbW1hbmQoJ3NlZWQudHh0JywgJ2VkaXRlZCcpLCAxKTtcblx0XHRjb25zdCBmaWxlID0gYXdhaXQgd2FpdEZvckZpbGVJbkNoYW5nZXNldChjaGFuZ2VzZXQsICdzZWVkLnR4dCcpO1xuXHRcdGF3YWl0IHdhaXRGb3JJZGxlUmVzb3VyY2VPbmx5T3BlcmF0aW9uKGNoYW5nZXNldCwgJ2Rpc2NhcmQtY2hhbmdlcycsIGluaXRpYWxPcGVyYXRpb25zKTtcblx0XHRhd2FpdCB3YWl0Rm9yVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCk7XG5cdFx0cmV0dXJuIHsgd29ya3NwYWNlLCBjaGFuZ2VzZXQsIGZpbGUgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGludm9rZURpc2NhcmQoY2hhbmdlc2V0OiBzdHJpbmcsIHJlc291cmNlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9vcGVyYXRpb25TdGF0dXNDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYW5nZXNldFxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG9wZXJhdGlvbklkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0pLm9wZXJhdGlvbklkID09PSAnZGlzY2FyZC1jaGFuZ2VzJ1xuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG9wZXJhdGlvbklkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cyA9PT0gJ2lkbGUnLFxuXHRcdFx0Q0hBTkdFU0VUX09QRVJBVElPTl9USU1FT1VUX01TLFxuXHRcdCk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogY2hhbmdlc2V0LFxuXHRcdFx0b3BlcmF0aW9uSWQ6ICdkaXNjYXJkLWNoYW5nZXMnLFxuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6IENoYW5nZXNldE9wZXJhdGlvblRhcmdldEtpbmQuUmVzb3VyY2UsIHJlc291cmNlIH0sXG5cdFx0fSwgQ0hBTkdFU0VUX09QRVJBVElPTl9USU1FT1VUX01TKTtcblx0XHRhd2FpdCBjb21wbGV0ZWQ7XG5cdFx0cmV0dXJuIGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L29wZXJhdGlvblN0YXR1c0NoYW5nZWQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbmdlc2V0LFxuXHRcdCkubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgb3BlcmF0aW9uSWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfSlcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi5vcGVyYXRpb25JZCA9PT0gJ2Rpc2NhcmQtY2hhbmdlcycpXG5cdFx0XHQubWFwKGFjdGlvbiA9PiBhY3Rpb24uc3RhdHVzKTtcblx0fVxuXG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdzdWJzY3JpYmluZyB0byBhIGNoYW5nZXNldCByZWFjaGVzIHJlYWR5IHN0YXR1cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtc3RhdHVzLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LXN0YXR1cycpO1xuXHRcdGNvbnN0IGJyYW5jaFVyaSA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXG5cdFx0Y29uc3Qgc3Vic2NyaWJlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBicmFuY2hVcmkgfSk7XG5cblx0XHQvLyBBIGNoYW5nZXNldCBpcyBjb21wdXRlZCBhc3luY2hyb25vdXNseSwgc28gdGhlIHNuYXBzaG90IGEgc3Vic2NyaWJlclxuXHRcdC8vIHJlY2VpdmVzIGlzIGEgc3RhcnRpbmcgcG9pbnQgYW5kIHRoZSB0ZXJtaW5hbCBzdGF0dXMgYXJyaXZlcyBhcyBhblxuXHRcdC8vIGFjdGlvbi4gQXNzZXJ0aW5nIG9ubHkgdGhlIHNuYXBzaG90IHdvdWxkIHBhc3Mgd2l0aG91dCB0aGUgaG9zdCBldmVyXG5cdFx0Ly8gZmluaXNoaW5nIHRoZSBjb21wdXRhdGlvbi5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvc3RhdHVzQ2hhbmdlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBicmFuY2hVcmlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBzdGF0dXM6IHN0cmluZyB9KS5zdGF0dXMgPT09ICdyZWFkeScsXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb3VyY2U6IHN1YnNjcmliZWQuc25hcHNob3QhLnJlc291cmNlLFxuXHRcdFx0ZmlsZXM6IChzdWJzY3JpYmVkLnNuYXBzaG90IS5zdGF0ZSBhcyB7IGZpbGVzOiB1bmtub3duW10gfSkuZmlsZXMsXG5cdFx0fSwge1xuXHRcdFx0cmVzb3VyY2U6IGJyYW5jaFVyaSxcblx0XHRcdGZpbGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIGZpbGUgd3JpdHRlbiBkdXJpbmcgYSB0dXJuIGFwcGVhcnMgaW4gdGhlIGJyYW5jaCBjaGFuZ2VzZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LWFkZC0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1hZGQnKTtcblx0XHRjb25zdCBicmFuY2hVcmkgPSBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoVXJpIH0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWNoYW5nZXNldC1hZGQnO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCB3cml0ZUZpbGVDb21tYW5kKCdhZGRlZC50eHQnLCAnQURERUQnKSwgMSk7XG5cblx0XHRjb25zdCBmaWxlID0gYXdhaXQgd2FpdEZvckZpbGVJbkNoYW5nZXNldChicmFuY2hVcmksICdhZGRlZC50eHQnKTtcblx0XHRhd2FpdCB3YWl0Rm9yVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCk7XG5cblx0XHQvLyBBIG5ld2x5IGFkZGVkIGZpbGUgaGFzIG5vIGJlZm9yZS1zaWRlLCBhbmQgaXRzIGRpZmYgY291bnRzIHRoZSBhZGRlZFxuXHRcdC8vIGxpbmUuIEJvdGggY29tZSBmcm9tIGdpdCByYXRoZXIgdGhhbiBmcm9tIGFueXRoaW5nIHRoZSB0b29sIHJlcG9ydGVkLFxuXHRcdC8vIHdoaWNoIGlzIHRoZSBwcm9wZXJ0eSB0aGF0IG1ha2VzIHRoZSBjaGFuZ2VzZXQgdHJ1c3R3b3J0aHkuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNCZWZvcmVTaWRlOiBmaWxlLmVkaXQuYmVmb3JlICE9PSB1bmRlZmluZWQsXG5cdFx0XHRoYXNBZnRlclNpZGU6IGZpbGUuZWRpdC5hZnRlciAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0ZGlmZjogZmlsZS5lZGl0LmRpZmYsXG5cdFx0XHRyZXZpZXdlZDogZmlsZS5yZXZpZXdlZCxcblx0XHR9LCB7XG5cdFx0XHRoYXNCZWZvcmVTaWRlOiBmYWxzZSxcblx0XHRcdGhhc0FmdGVyU2lkZTogdHJ1ZSxcblx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdHJldmlld2VkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdlZGl0aW5nIGEgY29tbWl0dGVkIGZpbGUgcmVwb3J0cyBib3RoIHNpZGVzIG9mIHRoZSBjaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LWVkaXQtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtZWRpdCcpO1xuXHRcdGNvbnN0IGJyYW5jaFVyaSA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBicmFuY2hVcmkgfSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY2hhbmdlc2V0LWVkaXQnO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCB3cml0ZUZpbGVDb21tYW5kKCdzZWVkLnR4dCcsICdlZGl0ZWQnKSwgMSk7XG5cblx0XHRjb25zdCBmaWxlID0gYXdhaXQgd2FpdEZvckZpbGVJbkNoYW5nZXNldChicmFuY2hVcmksICdzZWVkLnR4dCcpO1xuXHRcdGF3YWl0IHdhaXRGb3JUdXJuQ29tcGxldGUoc2Vzc2lvblVyaSwgdHVybklkKTtcblxuXHRcdC8vIFVubGlrZSBhbiBhZGRlZCBmaWxlLCBhbiBlZGl0IHRvIGEgY29tbWl0dGVkIGZpbGUgaGFzIGEgYmVmb3JlLXNpZGUgXHUyMDE0XG5cdFx0Ly8gdGhlIGNvbW1pdHRlZCByZXZpc2lvbiBcdTIwMTQgc28gdGhlIGNsaWVudCBjYW4gcmVuZGVyIGEgcmVhbCBkaWZmLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQmVmb3JlU2lkZTogZmlsZS5lZGl0LmJlZm9yZSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aGFzQWZ0ZXJTaWRlOiBmaWxlLmVkaXQuYWZ0ZXIgIT09IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRoYXNCZWZvcmVTaWRlOiB0cnVlLFxuXHRcdFx0aGFzQWZ0ZXJTaWRlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NvbW1pdHRlZCBjaGFuZ2VzZXQgY29udGVudCBjYW4gYmUgcmVhZCB0aHJvdWdoIGl0cyBnaXQgYmxvYiByZWZlcmVuY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LWdpdC1ibG9iLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWdpdC1ibG9iJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1jaGFuZ2VzZXQtZ2l0LWJsb2InLCB3cml0ZUZpbGVDb21tYW5kKCdzZWVkLnR4dCcsICdlZGl0ZWQnKSwgMSk7XG5cdFx0Y29uc3QgW2ZpbGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGJyYW5jaFVyaSwgWydzZWVkLnR4dCddKTtcblx0XHRhc3NlcnQub2soZmlsZS5lZGl0LmJlZm9yZT8uY29udGVudD8udXJpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFJlc291cmNlUmVhZFJlc3VsdD4oJ3Jlc291cmNlUmVhZCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlLmVkaXQuYmVmb3JlLmNvbnRlbnQudXJpLFxuXHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQuZGF0YS5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJyksICdzZWVkXFxuJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGVsZXRpbmcgYSBjb21taXR0ZWQgZmlsZSByZXBvcnRzIG9ubHkgdGhlIGJlZm9yZSBzaWRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1kZWxldGUtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtZGVsZXRlJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1kZWxldGUnLCBkZWxldGVGaWxlQ29tbWFuZCgnc2VlZC50eHQnKSwgMSk7XG5cdFx0Y29uc3QgW2ZpbGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGJyYW5jaFVyaSwgWydzZWVkLnR4dCddKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQmVmb3JlU2lkZTogZmlsZS5lZGl0LmJlZm9yZSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aGFzQWZ0ZXJTaWRlOiBmaWxlLmVkaXQuYWZ0ZXIgIT09IHVuZGVmaW5lZCxcblx0XHRcdGRpZmY6IGZpbGUuZWRpdC5kaWZmLFxuXHRcdH0sIHtcblx0XHRcdGhhc0JlZm9yZVNpZGU6IHRydWUsXG5cdFx0XHRoYXNBZnRlclNpZGU6IGZhbHNlLFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMCwgcmVtb3ZlZDogMSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3JlbmFtaW5nIGEgY29tbWl0dGVkIGZpbGUgcmVwb3J0cyB0aGUgZGVzdGluYXRpb24gY2hhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1yZW5hbWUtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtcmVuYW1lJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1yZW5hbWUnLCByZW5hbWVGaWxlQ29tbWFuZCgnc2VlZC50eHQnLCAncmVuYW1lZC50eHQnKSwgMSk7XG5cdFx0Y29uc3QgW2ZpbGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGJyYW5jaFVyaSwgWydyZW5hbWVkLnR4dCddKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWZ0ZXI6IGZpbGUuZWRpdC5hZnRlcj8udXJpLmVuZHNXaXRoKCcvcmVuYW1lZC50eHQnKSxcblx0XHRcdHNvdXJjZUV4aXN0czogZXhpc3RzU3luYyhqb2luKHdvcmtzcGFjZSwgJ3NlZWQudHh0JykpLFxuXHRcdFx0ZGVzdGluYXRpb25FeGlzdHM6IGV4aXN0c1N5bmMoam9pbih3b3Jrc3BhY2UsICdyZW5hbWVkLnR4dCcpKSxcblx0XHR9LCB7XG5cdFx0XHRhZnRlcjogdHJ1ZSxcblx0XHRcdHNvdXJjZUV4aXN0czogZmFsc2UsXG5cdFx0XHRkZXN0aW5hdGlvbkV4aXN0czogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdvbmUgdHVybiByZXBvcnRzIG1peGVkIGNyZWF0ZSBlZGl0IGFuZCBkZWxldGUgY2hhbmdlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtbWl4ZWQtJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2RlbGV0ZS50eHQnKSwgJ2RlbGV0ZVxcbicpO1xuXHRcdGV4ZWNTeW5jKCdnaXQgYWRkIC4nLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdGV4ZWNTeW5jKCdnaXQgY29tbWl0IC1xIC1tIFwic2Vjb25kIHNlZWRcIicsIHsgY3dkOiB3b3Jrc3BhY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtbWl4ZWQnKTtcblx0XHRjb25zdCBicmFuY2hVcmkgPSBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoVXJpIH0pO1xuXG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0J3R1cm4tY2hhbmdlc2V0LW1peGVkJyxcblx0XHRcdCchbm9kZSAtZSBcImNvbnN0IGZzPXJlcXVpcmUoXFwnZnNcXCcpO2ZzLndyaXRlRmlsZVN5bmMoXFwnc2VlZC50eHRcXCcsXFwnZWRpdGVkXFwnKTtmcy53cml0ZUZpbGVTeW5jKFxcJ2FkZGVkLnR4dFxcJyxcXCdhZGRlZFxcJyk7ZnMudW5saW5rU3luYyhcXCdkZWxldGUudHh0XFwnKVwiJyxcblx0XHRcdDEsXG5cdFx0KTtcblx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhicmFuY2hVcmksIFsnc2VlZC50eHQnLCAnYWRkZWQudHh0JywgJ2RlbGV0ZS50eHQnXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVzLm1hcChmaWxlID0+ICh7XG5cdFx0XHRuYW1lOiBVUkkucGFyc2UoZmlsZVVyaShmaWxlKSkucGF0aC5zcGxpdCgnLycpLmF0KC0xKSxcblx0XHRcdGhhc0JlZm9yZTogZmlsZS5lZGl0LmJlZm9yZSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aGFzQWZ0ZXI6IGZpbGUuZWRpdC5hZnRlciAhPT0gdW5kZWZpbmVkLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBuYW1lOiAnc2VlZC50eHQnLCBoYXNCZWZvcmU6IHRydWUsIGhhc0FmdGVyOiB0cnVlIH0sXG5cdFx0XHR7IG5hbWU6ICdhZGRlZC50eHQnLCBoYXNCZWZvcmU6IGZhbHNlLCBoYXNBZnRlcjogdHJ1ZSB9LFxuXHRcdFx0eyBuYW1lOiAnZGVsZXRlLnR4dCcsIGhhc0JlZm9yZTogdHJ1ZSwgaGFzQWZ0ZXI6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnaWdub3JlZCBmaWxlcyBkbyBub3QgYXBwZWFyIGluIGEgYnJhbmNoIGNoYW5nZXNldCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtaWdub3JlZC0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnLmdpdGlnbm9yZScpLCAnaWdub3JlZC5sb2dcXG4nKTtcblx0XHRleGVjU3luYygnZ2l0IGFkZCAuZ2l0aWdub3JlJywgeyBjd2Q6IHdvcmtzcGFjZSB9KTtcblx0XHRleGVjU3luYygnZ2l0IGNvbW1pdCAtcSAtbSBcImlnbm9yZSBnZW5lcmF0ZWQgbG9nXCInLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWlnbm9yZWQnKTtcblx0XHRjb25zdCBicmFuY2hVcmkgPSBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoVXJpIH0pO1xuXHRcdGF3YWl0IGNoYW5nZXNldFN0YXRlKGJyYW5jaFVyaSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IGNoYW5nZWQgPSBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvY29udGVudENoYW5nZWQnKSAmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBicmFuY2hVcmksXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblxuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1pZ25vcmVkJywgd3JpdGVGaWxlQ29tbWFuZCgnaWdub3JlZC5sb2cnLCAnaWdub3JlZCcpLCAxKTtcblx0XHRhd2FpdCBjaGFuZ2VkO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoYnJhbmNoVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuZmlsZXMsIFtdKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIGZpbGUgY3JlYXRlZCBhbmQgZGVsZXRlZCBpbiBvbmUgdHVybiBsZWF2ZXMgbm8gYnJhbmNoIGNoYW5nZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtY3JlYXRlLWRlbGV0ZS0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1jcmVhdGUtZGVsZXRlJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblx0XHRhd2FpdCBjaGFuZ2VzZXRTdGF0ZShicmFuY2hVcmkpO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCBjaGFuZ2VkID0gY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L2NvbnRlbnRDaGFuZ2VkJykgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gYnJhbmNoVXJpLFxuXHRcdFx0NjBfMDAwLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1jaGFuZ2VzZXQtY3JlYXRlLWRlbGV0ZScsICchbm9kZSAtZSBcImNvbnN0IGZzPXJlcXVpcmUoXFwnZnNcXCcpO2ZzLndyaXRlRmlsZVN5bmMoXFwndGVtcG9yYXJ5LnR4dFxcJyxcXCd0ZW1wb3JhcnlcXCcpO2ZzLnVubGlua1N5bmMoXFwndGVtcG9yYXJ5LnR4dFxcJylcIicsIDEpO1xuXHRcdGF3YWl0IGNoYW5nZWQ7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGFuZ2VzZXRTdGF0ZShicmFuY2hVcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5maWxlcywgW10pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2FuIGVkaXQgcmVzdG9yZWQgaW4gdGhlIHNhbWUgdHVybiBsZWF2ZXMgbm8gYnJhbmNoIGNoYW5nZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtZWRpdC1yZXN0b3JlLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWVkaXQtcmVzdG9yZScpO1xuXHRcdGNvbnN0IGJyYW5jaFVyaSA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBicmFuY2hVcmkgfSk7XG5cdFx0YXdhaXQgY2hhbmdlc2V0U3RhdGUoYnJhbmNoVXJpKTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9jb250ZW50Q2hhbmdlZCcpICYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGJyYW5jaFVyaSxcblx0XHRcdDYwXzAwMCxcblx0XHQpO1xuXG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oc2Vzc2lvblVyaSwgJ3R1cm4tY2hhbmdlc2V0LWVkaXQtcmVzdG9yZScsIHdyaXRlRmlsZVR3aWNlQmFzZTY0Q29tbWFuZCgnc2VlZC50eHQnLCAnY2hhbmdlZCcsICdzZWVkXFxuJyksIDEpO1xuXHRcdGF3YWl0IGNoYW5nZWQ7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGFuZ2VzZXRTdGF0ZShicmFuY2hVcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5maWxlcywgW10pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2FuIGFkZGVkIG11bHRpbGluZSBmaWxlIHJlcG9ydHMgZXZlcnkgYWRkZWQgbGluZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtbXVsdGlsaW5lLWFkZC0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1tdWx0aWxpbmUtYWRkJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1tdWx0aWxpbmUtYWRkJywgd3JpdGVGaWxlQmFzZTY0Q29tbWFuZCgnbGluZXMudHh0JywgJ29uZVxcbnR3b1xcbnRocmVlXFxuJyksIDEpO1xuXHRcdGNvbnN0IFtmaWxlXSA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhicmFuY2hVcmksIFsnbGluZXMudHh0J10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlLmVkaXQuZGlmZiwgeyBhZGRlZDogMywgcmVtb3ZlZDogMCB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdkZWxldGluZyBhIG11bHRpbGluZSB0cmFja2VkIGZpbGUgcmVwb3J0cyBldmVyeSByZW1vdmVkIGxpbmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LW11bHRpbGluZS1kZWxldGUtJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2xpbmVzLnR4dCcpLCAnb25lXFxudHdvXFxudGhyZWVcXG4nKTtcblx0XHRleGVjU3luYygnZ2l0IGFkZCBsaW5lcy50eHQnLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdGV4ZWNTeW5jKCdnaXQgY29tbWl0IC1xIC1tIFwiYWRkIG11bHRpbGluZSBmaWxlXCInLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LW11bHRpbGluZS1kZWxldGUnKTtcblx0XHRjb25zdCBicmFuY2hVcmkgPSBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoVXJpIH0pO1xuXG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oc2Vzc2lvblVyaSwgJ3R1cm4tY2hhbmdlc2V0LW11bHRpbGluZS1kZWxldGUnLCBkZWxldGVGaWxlQ29tbWFuZCgnbGluZXMudHh0JyksIDEpO1xuXHRcdGNvbnN0IFtmaWxlXSA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhicmFuY2hVcmksIFsnbGluZXMudHh0J10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlLmVkaXQuZGlmZiwgeyBhZGRlZDogMCwgcmVtb3ZlZDogMyB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIGNoYW5nZWQgZmlsZW5hbWUgY29udGFpbmluZyBzcGFjZXMgcmVtYWlucyBhZGRyZXNzYWJsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtc3BhY2VkLWZpbGUtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtc3BhY2VkLWZpbGUnKTtcblx0XHRjb25zdCBicmFuY2hVcmkgPSBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoVXJpIH0pO1xuXG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oc2Vzc2lvblVyaSwgJ3R1cm4tY2hhbmdlc2V0LXNwYWNlZC1maWxlJywgd3JpdGVGaWxlQmFzZTY0Q29tbWFuZCgnc3BhY2VkIGZpbGUudHh0JywgJ2NvbnRlbnRcXG4nKSwgMSk7XG5cdFx0Y29uc3QgW2ZpbGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGJyYW5jaFVyaSwgWydzcGFjZWQgZmlsZS50eHQnXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlkOiBVUkkucGFyc2UoZmlsZS5pZCkucGF0aC5lbmRzV2l0aCgnL3NwYWNlZCBmaWxlLnR4dCcpLFxuXHRcdFx0YWZ0ZXI6IGZpbGUuZWRpdC5hZnRlcj8udXJpLmVuZHNXaXRoKCcvc3BhY2VkJTIwZmlsZS50eHQnKSB8fCBmaWxlLmVkaXQuYWZ0ZXI/LnVyaS5lbmRzV2l0aCgnL3NwYWNlZCBmaWxlLnR4dCcpLFxuXHRcdFx0ZXhpc3RzOiBleGlzdHNTeW5jKGpvaW4od29ya3NwYWNlLCAnc3BhY2VkIGZpbGUudHh0JykpLFxuXHRcdH0sIHtcblx0XHRcdGlkOiB0cnVlLFxuXHRcdFx0YWZ0ZXI6IHRydWUsXG5cdFx0XHRleGlzdHM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYW4gZW1wdHkgcmVwb3NpdG9yeSByZXBvcnRzIGFuIHVudHJhY2tlZCBmaWxlIGFzIGFkZGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY2hhbmdlc2V0LWVtcHR5LXJlcG8tJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRpbml0VGVzdEdpdFJlcG8od29ya3NwYWNlKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1lbXB0eS1yZXBvJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1lbXB0eS1yZXBvJywgd3JpdGVGaWxlQ29tbWFuZCgnZmlyc3QudHh0JywgJ2ZpcnN0JyksIDEpO1xuXHRcdGNvbnN0IFtmaWxlXSA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhicmFuY2hVcmksIFsnZmlyc3QudHh0J10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNCZWZvcmU6IGZpbGUuZWRpdC5iZWZvcmUgIT09IHVuZGVmaW5lZCxcblx0XHRcdGhhc0FmdGVyOiBmaWxlLmVkaXQuYWZ0ZXIgIT09IHVuZGVmaW5lZCxcblx0XHRcdGRpZmY6IGZpbGUuZWRpdC5kaWZmLFxuXHRcdH0sIHtcblx0XHRcdGhhc0JlZm9yZTogZmFsc2UsXG5cdFx0XHRoYXNBZnRlcjogdHJ1ZSxcblx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIGNsaWVudCBjYW4gbWFyayBhIGNoYW5nZXNldCBmaWxlIHJldmlld2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1yZXZpZXctJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtcmV2aWV3Jyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1jaGFuZ2VzZXQtcmV2aWV3Jztcblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgd3JpdGVGaWxlQ29tbWFuZCgncmV2aWV3bWUudHh0JywgJ1JFVklFVycpLCAxKTtcblx0XHRjb25zdCBmaWxlID0gYXdhaXQgd2FpdEZvckZpbGVJbkNoYW5nZXNldChicmFuY2hVcmksICdyZXZpZXdtZS50eHQnKTtcblx0XHRhd2FpdCB3YWl0Rm9yVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCk7XG5cblx0XHQvLyBgY2hhbmdlc2V0L2ZpbGVzUmV2aWV3Q2hhbmdlZGAgaXMgdGhlIG9uZSBjbGllbnQtZGlzcGF0Y2hhYmxlIGFjdGlvblxuXHRcdC8vIG9uIHRoaXMgY2hhbm5lbDogcmV2aWV3IHN0YXRlIGlzIHRoZSBjbGllbnQncyB0byBvd24sIGFuZCB0aGUgc2VydmVyXG5cdFx0Ly8gZWNob2VzIGl0IGJhY2sgc28gb3RoZXIgY29ubmVjdGVkIGNsaWVudHMgY29udmVyZ2UuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogYnJhbmNoVXJpLFxuXHRcdFx0Y2xpZW50U2VxOiBuZXh0Q2xpZW50U2VxKCksXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlc1Jldmlld0NoYW5nZWQsIGZpbGVzOiBbZmlsZS5pZF0sIHJldmlld2VkOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlY2hvZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvZmlsZXNSZXZpZXdDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGJyYW5jaFVyaSxcblx0XHRcdDYwXzAwMCxcblx0XHQpO1xuXHRcdGNvbnN0IGF1dGhvcml0YXRpdmUgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoVXJpIH0pO1xuXHRcdGNvbnN0IHJldmlld2VkID0gKChhdXRob3JpdGF0aXZlLnNuYXBzaG90IS5zdGF0ZSBhcyB7IGZpbGVzOiByZWFkb25seSBJT2JzZXJ2ZWRDaGFuZ2VzZXRGaWxlW10gfSkuZmlsZXMpXG5cdFx0XHQuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBmaWxlLmlkKT8ucmV2aWV3ZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGlvbjogZ2V0QWN0aW9uRW52ZWxvcGUoZWNob2VkKS5hY3Rpb24sXG5cdFx0XHRyZXZpZXdlZCxcblx0XHR9LCB7XG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlc1Jldmlld0NoYW5nZWQsXG5cdFx0XHRcdGZpbGVzOiBbZmlsZS5pZF0sXG5cdFx0XHRcdHJldmlld2VkOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdHJldmlld2VkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3VuY29tbWl0dGVkIGNoYW5nZXMgYWR2ZXJ0aXNlIHRoZSBvcGVyYXRpb25zIHRoYXQgYWN0IG9uIHRoZW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LW9wcy0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1vcHMnKTtcblx0XHRjb25zdCB1bmNvbW1pdHRlZFVyaSA9IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHVuY29tbWl0dGVkVXJpIH0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWNoYW5nZXNldC1vcHMnO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCB3cml0ZUZpbGVDb21tYW5kKCdvcGVyYXRlLnR4dCcsICdPUEVSQVRFJyksIDEpO1xuXG5cdFx0Ly8gT3BlcmF0aW9ucyBhcmUgd2hhdCBhIGNsaWVudCB0dXJucyBpbnRvIGFmZm9yZGFuY2VzLCBhbmQgdGhleSBhcmVcblx0XHQvLyBvbmx5IG9mZmVyZWQgb25jZSB0aGVyZSBpcyBzb21ldGhpbmcgdG8gYWN0IG9uIFx1MjAxNCBhIHNlc3Npb24gd2l0aCBub1xuXHRcdC8vIHVuY29tbWl0dGVkIGNoYW5nZXMgYWR2ZXJ0aXNlcyBub25lLiBFYWNoIGNhcnJpZXMgdGhlIHNjb3BlIGl0XG5cdFx0Ly8gYXBwbGllcyB0bywgc28gYSBjbGllbnQga25vd3Mgd2hldGhlciB0byBvZmZlciBpdCBmb3IgdGhlIHdob2xlXG5cdFx0Ly8gY2hhbmdlc2V0IG9yIHBlciBmaWxlLlxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvY29udGVudENoYW5nZWQnKSB8fCBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSB1bmNvbW1pdHRlZFVyaSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgSUNvbnRlbnRDaGFuZ2VkQWN0aW9uKS5vcGVyYXRpb25zID8/IFtdKS5sZW5ndGggPiAwO1xuXHRcdH0sIDYwXzAwMCk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25zID0gKGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIElDb250ZW50Q2hhbmdlZEFjdGlvbikub3BlcmF0aW9ucyA/PyBbXTtcblx0XHRhd2FpdCB3YWl0Rm9yVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVyYXRpb25zLm1hcChvcGVyYXRpb24gPT4gKHsgaWQ6IG9wZXJhdGlvbi5pZCwgc2NvcGVzOiBvcGVyYXRpb24uc2NvcGVzIH0pKSwgW1xuXHRcdFx0eyBpZDogJ2NvbW1pdCcsIHNjb3BlczogWydjaGFuZ2VzZXQnXSB9LFxuXHRcdFx0eyBpZDogJ2Rpc2NhcmQtY2hhbmdlcycsIHNjb3BlczogWydyZXNvdXJjZSddIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzY2FyZGluZyBhIHRyYWNrZWQgY2hhbmdlIHJlc3RvcmVzIHRoZSBmaWxlIGFuZCByZXBvcnRzIG9wZXJhdGlvbiBzdGF0dXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyB3b3Jrc3BhY2UsIGNoYW5nZXNldCwgZmlsZSB9ID0gYXdhaXQgY3JlYXRlTW9kaWZpZWRVbmNvbW1pdHRlZENoYW5nZXNldCgnY2hhbmdlc2V0LWRpc2NhcmQnKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGZpbGUuZWRpdC5hZnRlcj8udXJpO1xuXHRcdGFzc2VydC5vayhyZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9vcGVyYXRpb25TdGF0dXNDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYW5nZXNldFxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG9wZXJhdGlvbklkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0pLm9wZXJhdGlvbklkID09PSAnZGlzY2FyZC1jaGFuZ2VzJ1xuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG9wZXJhdGlvbklkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cyA9PT0gJ2lkbGUnLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBjaGFuZ2VzZXQsXG5cdFx0XHRvcGVyYXRpb25JZDogJ2Rpc2NhcmQtY2hhbmdlcycsXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogQ2hhbmdlc2V0T3BlcmF0aW9uVGFyZ2V0S2luZC5SZXNvdXJjZSwgcmVzb3VyY2UgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb21wbGV0ZWQ7XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L29wZXJhdGlvblN0YXR1c0NoYW5nZWQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbmdlc2V0LFxuXHRcdCkubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgb3BlcmF0aW9uSWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfSlcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi5vcGVyYXRpb25JZCA9PT0gJ2Rpc2NhcmQtY2hhbmdlcycpXG5cdFx0XHQubWFwKGFjdGlvbiA9PiBhY3Rpb24uc3RhdHVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbnRlbnRzOiByZWFkRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdzZWVkLnR4dCcpLCAndXRmOCcpLnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKSxcblx0XHRcdHN0YXR1c2VzLFxuXHRcdH0sIHtcblx0XHRcdGNvbnRlbnRzOiAnc2VlZFxcbicsXG5cdFx0XHRzdGF0dXNlczogWydydW5uaW5nJywgJ2lkbGUnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gVGhlIG9wZXJhdGlvbiBpcyBhZHZlcnRpc2VkIGJ1dCBjdXJyZW50bHkgZmFpbHMgZm9yIHVudHJhY2tlZCBwYXRoczsgc2VlIEtOT1dOX0lTU1VFUy5tZC5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdkaXNjYXJkaW5nIGFuIHVudHJhY2tlZCBmaWxlIHJlbW92ZXMgaXQgZnJvbSBkaXNrJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1kaXNjYXJkLWFkZGVkLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWRpc2NhcmQtYWRkZWQnKTtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhbmdlc2V0IH0pO1xuXHRcdGNvbnN0IGluaXRpYWxPcGVyYXRpb25zID0gKChzdWJzY3JpYmVkLnNuYXBzaG90IS5zdGF0ZSBhcyB7IG9wZXJhdGlvbnM/OiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXSB9KS5vcGVyYXRpb25zID8/IFtdKTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1jaGFuZ2VzZXQtZGlzY2FyZC1hZGRlZCcsIHdyaXRlRmlsZUNvbW1hbmQoJ3VudHJhY2tlZC50eHQnLCAndW50cmFja2VkJyksIDEpO1xuXHRcdGNvbnN0IFtmaWxlXSA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhjaGFuZ2VzZXQsIFsndW50cmFja2VkLnR4dCddKTtcblx0XHRhd2FpdCB3YWl0Rm9ySWRsZVJlc291cmNlT25seU9wZXJhdGlvbihjaGFuZ2VzZXQsICdkaXNjYXJkLWNoYW5nZXMnLCBpbml0aWFsT3BlcmF0aW9ucyk7XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IGF3YWl0IGludm9rZURpc2NhcmQoY2hhbmdlc2V0LCBmaWxlVXJpKGZpbGUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXhpc3RzOiBleGlzdHNTeW5jKGpvaW4od29ya3NwYWNlLCAndW50cmFja2VkLnR4dCcpKSxcblx0XHRcdHN0YXR1c2VzLFxuXHRcdH0sIHtcblx0XHRcdGV4aXN0czogZmFsc2UsXG5cdFx0XHRzdGF0dXNlczogWydydW5uaW5nJywgJ2lkbGUnXSxcblx0XHR9KTtcblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzY2FyZGluZyBhIGRlbGV0ZWQgdHJhY2tlZCBmaWxlIHJlc3RvcmVzIGl0cyBjb250ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtZGlzY2FyZC1kZWxldGVkLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWRpc2NhcmQtZGVsZXRlZCcpO1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc3Vic2NyaWJlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGFuZ2VzZXQgfSk7XG5cdFx0Y29uc3QgaW5pdGlhbE9wZXJhdGlvbnMgPSAoKHN1YnNjcmliZWQuc25hcHNob3QhLnN0YXRlIGFzIHsgb3BlcmF0aW9ucz86IHJlYWRvbmx5IElPYnNlcnZlZE9wZXJhdGlvbltdIH0pLm9wZXJhdGlvbnMgPz8gW10pO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1kaXNjYXJkLWRlbGV0ZWQnLCBkZWxldGVGaWxlQ29tbWFuZCgnc2VlZC50eHQnKSwgMSk7XG5cdFx0Y29uc3QgW2ZpbGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGNoYW5nZXNldCwgWydzZWVkLnR4dCddKTtcblx0XHRhd2FpdCB3YWl0Rm9ySWRsZVJlc291cmNlT25seU9wZXJhdGlvbihjaGFuZ2VzZXQsICdkaXNjYXJkLWNoYW5nZXMnLCBpbml0aWFsT3BlcmF0aW9ucyk7XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IGF3YWl0IGludm9rZURpc2NhcmQoY2hhbmdlc2V0LCBmaWxlVXJpKGZpbGUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29udGVudHM6IHJlYWRGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ3NlZWQudHh0JyksICd1dGY4JykucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpLFxuXHRcdFx0c3RhdHVzZXMsXG5cdFx0fSwge1xuXHRcdFx0Y29udGVudHM6ICdzZWVkXFxuJyxcblx0XHRcdHN0YXR1c2VzOiBbJ3J1bm5pbmcnLCAnaWRsZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBUaGUgV2luZG93cyBjaGFuZ2VzZXQgZG9lcyBub3QgcmVmcmVzaCBhZnRlciB0aGUgcmVzb3VyY2Utc2NvcGVkIGRpc2NhcmQgY29tcGxldGVzLlxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2Rpc2NhcmRpbmcgb25lIGZpbGUgcHJlc2VydmVzIHNpYmxpbmcgY2hhbmdlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtZGlzY2FyZC1vbmUtJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2ZpcnN0LnR4dCcpLCAnb3JpZ2luYWwgZmlyc3RcXG4nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnc2Vjb25kLnR4dCcpLCAnb3JpZ2luYWwgc2Vjb25kXFxuJyk7XG5cdFx0ZXhlY1N5bmMoJ2dpdCBhZGQgLicsIHsgY3dkOiB3b3Jrc3BhY2UgfSk7XG5cdFx0ZXhlY1N5bmMoJ2dpdCBjb21taXQgLXEgLW0gXCJzaWJsaW5nIHNlZWRcIicsIHsgY3dkOiB3b3Jrc3BhY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtZGlzY2FyZC1vbmUnKTtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhbmdlc2V0IH0pO1xuXHRcdGNvbnN0IGluaXRpYWxPcGVyYXRpb25zID0gKChzdWJzY3JpYmVkLnNuYXBzaG90IS5zdGF0ZSBhcyB7IG9wZXJhdGlvbnM/OiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXSB9KS5vcGVyYXRpb25zID8/IFtdKTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHQndHVybi1jaGFuZ2VzZXQtZGlzY2FyZC1vbmUnLFxuXHRcdFx0JyFub2RlIC1lIFwiY29uc3QgZnM9cmVxdWlyZShcXCdmc1xcJyk7ZnMud3JpdGVGaWxlU3luYyhcXCdmaXJzdC50eHRcXCcsXFwnY2hhbmdlZCBmaXJzdFxcJyk7ZnMud3JpdGVGaWxlU3luYyhcXCdzZWNvbmQudHh0XFwnLFxcJ2NoYW5nZWQgc2Vjb25kXFwnKVwiJyxcblx0XHRcdDEsXG5cdFx0KTtcblx0XHRjb25zdCBbZmlyc3RdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGNoYW5nZXNldCwgWydmaXJzdC50eHQnLCAnc2Vjb25kLnR4dCddKTtcblx0XHRhd2FpdCB3YWl0Rm9ySWRsZVJlc291cmNlT25seU9wZXJhdGlvbihjaGFuZ2VzZXQsICdkaXNjYXJkLWNoYW5nZXMnLCBpbml0aWFsT3BlcmF0aW9ucyk7XG5cblx0XHRhd2FpdCBpbnZva2VEaXNjYXJkKGNoYW5nZXNldCwgZmlsZVVyaShmaXJzdCkpO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KTtcblx0XHRcdGlmIChyZXN1bHQuZmlsZXMuc29tZShmaWxlID0+IGZpbGVVcmkoZmlsZSkuZW5kc1dpdGgoJy9maXJzdC50eHQnKSkgfHwgIXJlc3VsdC5maWxlcy5zb21lKGZpbGUgPT4gZmlsZVVyaShmaWxlKS5lbmRzV2l0aCgnL3NlY29uZC50eHQnKSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGFuZ2VzZXQgaGFzIG5vdCByZWZyZXNoZWQgYWZ0ZXIgZGlzY2FyZCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCAxMDAsIDEwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0RXhpc3RzOiBleGlzdHNTeW5jKGpvaW4od29ya3NwYWNlLCAnZmlyc3QudHh0JykpLFxuXHRcdFx0c2Vjb25kRXhpc3RzOiBleGlzdHNTeW5jKGpvaW4od29ya3NwYWNlLCAnc2Vjb25kLnR4dCcpKSxcblx0XHRcdGZpbGVzOiBzdGF0ZS5maWxlcy5tYXAoZmlsZSA9PiBVUkkucGFyc2UoZmlsZVVyaShmaWxlKSkucGF0aC5zcGxpdCgnLycpLmF0KC0xKSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RFeGlzdHM6IHRydWUsXG5cdFx0XHRzZWNvbmRFeGlzdHM6IHRydWUsXG5cdFx0XHRmaWxlczogWydzZWNvbmQudHh0J10sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2ZpcnN0LnR4dCcpLCAndXRmOCcpLnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKSwgJ29yaWdpbmFsIGZpcnN0XFxuJyk7XG5cdH0sICFjb250ZXh0LmlzV2luZG93cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXZpZXcgc3RhdGUgY2FuIGJlIGFwcGxpZWQgdG8gbXVsdGlwbGUgY2hhbmdlZCBmaWxlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtcmV2aWV3LW11bHRpcGxlLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LXJldmlldy1tdWx0aXBsZScpO1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGFuZ2VzZXQgfSk7XG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0J3R1cm4tY2hhbmdlc2V0LXJldmlldy1tdWx0aXBsZScsXG5cdFx0XHQnIW5vZGUgLWUgXCJjb25zdCBmcz1yZXF1aXJlKFxcJ2ZzXFwnKTtmcy53cml0ZUZpbGVTeW5jKFxcJ2ZpcnN0LnR4dFxcJyxcXCdmaXJzdFxcJyk7ZnMud3JpdGVGaWxlU3luYyhcXCdzZWNvbmQudHh0XFwnLFxcJ3NlY29uZFxcJylcIicsXG5cdFx0XHQxLFxuXHRcdCk7XG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCB3YWl0Rm9yQ2hhbmdlc2V0RmlsZXMoY2hhbmdlc2V0LCBbJ2ZpcnN0LnR4dCcsICdzZWNvbmQudHh0J10pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IGNoYW5nZXNldCxcblx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSgpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkLCBmaWxlczogZmlsZXMubWFwKGZpbGUgPT4gZmlsZS5pZCksIHJldmlld2VkOiB0cnVlIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L2ZpbGVzUmV2aWV3Q2hhbmdlZCcpICYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYW5nZXNldCxcblx0XHQpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9zdGF0dXNDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYW5nZXNldFxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHJlYWRvbmx5IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cyA9PT0gJ3JlYWR5Jyxcblx0XHQpO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuZmlsZXMubWFwKGZpbGUgPT4gZmlsZS5yZXZpZXdlZCksIFt0cnVlLCB0cnVlXSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBjbGllbnQgY2FuIGNsZWFyIHJldmlldyBzdGF0ZSBmcm9tIGEgY2hhbmdlZCBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1yZXZpZXctdW5zZXQtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtcmV2aWV3LXVuc2V0Jyk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYW5nZXNldCB9KTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1jaGFuZ2VzZXQtcmV2aWV3LXVuc2V0Jywgd3JpdGVGaWxlQ29tbWFuZCgnc2VlZC50eHQnLCAnZWRpdGVkJyksIDEpO1xuXHRcdGNvbnN0IFtmaWxlXSA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhjaGFuZ2VzZXQsIFsnc2VlZC50eHQnXSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBjaGFuZ2VzZXQsXG5cdFx0XHRjbGllbnRTZXE6IG5leHRDbGllbnRTZXEoKSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVzUmV2aWV3Q2hhbmdlZCwgZmlsZXM6IFtmaWxlLmlkXSwgcmV2aWV3ZWQ6IHRydWUgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvZmlsZXNSZXZpZXdDaGFuZ2VkJykgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbmdlc2V0LFxuXHRcdCk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IGNoYW5nZXNldCxcblx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSgpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkLCBmaWxlczogW2ZpbGUuaWRdLCByZXZpZXdlZDogZmFsc2UgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvZmlsZXNSZXZpZXdDaGFuZ2VkJykgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbmdlc2V0LFxuXHRcdCk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGNoYW5nZXNldFN0YXRlKGNoYW5nZXNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmZpbGVzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gZmlsZS5pZCk/LnJldmlld2VkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdC8vIFJlcGVhdGVkIGVkaXRzIGN1cnJlbnRseSBsZWF2ZSB0aGUgZmlyc3QgcmVhZHkgZGlmZiBpbiBwbGFjZTsgc2VlIEtOT1dOX0lTU1VFUy5tZC5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIHNlY29uZCBlZGl0IHVwZGF0ZXMgb25lIGNoYW5nZXNldCBlbnRyeSBpbiBwbGFjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtc2Vjb25kLWVkaXQtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtc2Vjb25kLWVkaXQnKTtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhbmdlc2V0IH0pO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKFxuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdCd0dXJuLWNoYW5nZXNldC1zZWNvbmQtZWRpdC1maXJzdCcsXG5cdFx0XHQnIW5vZGUgLWUgXCJyZXF1aXJlKFxcJ2ZzXFwnKS53cml0ZUZpbGVTeW5jKFxcJ3NlZWQudHh0XFwnLFxcJ2ZpcnN0XFxcXG5zZWNvbmRcXFxcblxcJylcIicsXG5cdFx0XHQxLFxuXHRcdCk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IGF3YWl0IHdhaXRGb3JDaGFuZ2VzZXRGaWxlcyhjaGFuZ2VzZXQsIFsnc2VlZC50eHQnXSk7XG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0J3R1cm4tY2hhbmdlc2V0LXNlY29uZC1lZGl0LXNlY29uZCcsXG5cdFx0XHQnIW5vZGUgLWUgXCJyZXF1aXJlKFxcJ2ZzXFwnKS53cml0ZUZpbGVTeW5jKFxcJ3NlZWQudHh0XFwnLFxcJ2ZpcnN0XFxcXG5zZWNvbmRcXFxcbnRoaXJkXFxcXG5cXCcpXCInLFxuXHRcdFx0Mixcblx0XHQpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IFtjYW5kaWRhdGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGNoYW5nZXNldCwgWydzZWVkLnR4dCddKTtcblx0XHRcdGlmIChjYW5kaWRhdGUuZWRpdC5kaWZmPy5hZGRlZCAhPT0gMykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYW5nZXNldCBoYXMgbm90IGluY29ycG9yYXRlZCB0aGUgc2Vjb25kIGVkaXQnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0fSwgMTAwLCAxMDApO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZmlsZUNvdW50OiBzdGF0ZS5maWxlcy5sZW5ndGgsXG5cdFx0XHRzYW1lSWRlbnRpdHk6IGZpcnN0LmlkID09PSBzZWNvbmQuaWQsXG5cdFx0XHRkaWZmOiBzZWNvbmQuZWRpdC5kaWZmLFxuXHRcdH0sIHtcblx0XHRcdGZpbGVDb3VudDogMSxcblx0XHRcdHNhbWVJZGVudGl0eTogdHJ1ZSxcblx0XHRcdGRpZmY6IHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSxcblx0XHR9KTtcblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBuZXN0ZWQgdW50cmFja2VkIGZpbGUgcmV0YWlucyBpdHMgd29ya3NwYWNlLXJlbGF0aXZlIGlkZW50aXR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1uZXN0ZWQtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtbmVzdGVkJyk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYW5nZXNldCB9KTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHQndHVybi1jaGFuZ2VzZXQtbmVzdGVkJyxcblx0XHRcdCchbm9kZSAtZSBcImNvbnN0IGZzPXJlcXVpcmUoXFwnZnNcXCcpO2ZzLm1rZGlyU3luYyhcXCduZXN0ZWRcXCcse3JlY3Vyc2l2ZTp0cnVlfSk7ZnMud3JpdGVGaWxlU3luYyhcXCduZXN0ZWQvYWRkZWQudHh0XFwnLFxcJ25lc3RlZFxcJylcIicsXG5cdFx0XHQxLFxuXHRcdCk7XG5cdFx0Y29uc3QgW2ZpbGVdID0gYXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGNoYW5nZXNldCwgWydhZGRlZC50eHQnXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhdGg6IFVSSS5wYXJzZShmaWxlLmVkaXQuYWZ0ZXIhLnVyaSkucGF0aC5lbmRzV2l0aCgnL25lc3RlZC9hZGRlZC50eHQnKSxcblx0XHRcdGhhc0JlZm9yZTogZmlsZS5lZGl0LmJlZm9yZSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0ZGlmZjogZmlsZS5lZGl0LmRpZmYsXG5cdFx0fSwge1xuXHRcdFx0cGF0aDogdHJ1ZSxcblx0XHRcdGhhc0JlZm9yZTogZmFsc2UsXG5cdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFdpbmRvd3MgcmVzdG9yZXMgdGhlIGZpbGUgYnV0IGxlYXZlcyBib3RoIGNoYW5nZXNldHMgYW5kIHRoZSBsaXN0IHN1bW1hcnkgc3RhbGUuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzY2FyZGluZyB0aGUgbGFzdCB0cmFja2VkIGNoYW5nZSBjbGVhcnMgY2hhbmdlc2V0IGFuZCBsaXN0IHN1bW1hcmllcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtZGlzY2FyZC1sYXN0LScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWRpc2NhcmQtbGFzdCcpO1xuXHRcdGNvbnN0IGJyYW5jaENoYW5nZXNldCA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHVuY29tbWl0dGVkQ2hhbmdlc2V0ID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnJhbmNoQ2hhbmdlc2V0IH0pO1xuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogdW5jb21taXR0ZWRDaGFuZ2VzZXQgfSk7XG5cdFx0Y29uc3QgaW5pdGlhbE9wZXJhdGlvbnMgPSAoKHN1YnNjcmliZWQuc25hcHNob3QhLnN0YXRlIGFzIHsgb3BlcmF0aW9ucz86IHJlYWRvbmx5IElPYnNlcnZlZE9wZXJhdGlvbltdIH0pLm9wZXJhdGlvbnMgPz8gW10pO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1kaXNjYXJkLWxhc3QnLCB3cml0ZUZpbGVDb21tYW5kKCdzZWVkLnR4dCcsICdlZGl0ZWQnKSwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGJyYW5jaENoYW5nZXNldCwgWydzZWVkLnR4dCddKTtcblx0XHRjb25zdCBbZmlsZV0gPSBhd2FpdCB3YWl0Rm9yQ2hhbmdlc2V0RmlsZXModW5jb21taXR0ZWRDaGFuZ2VzZXQsIFsnc2VlZC50eHQnXSk7XG5cdFx0YXdhaXQgd2FpdEZvcklkbGVSZXNvdXJjZU9ubHlPcGVyYXRpb24odW5jb21taXR0ZWRDaGFuZ2VzZXQsICdkaXNjYXJkLWNoYW5nZXMnLCBpbml0aWFsT3BlcmF0aW9ucyk7XG5cblx0XHRhd2FpdCBpbnZva2VEaXNjYXJkKHVuY29tbWl0dGVkQ2hhbmdlc2V0LCBmaWxlVXJpKGZpbGUpKTtcblx0XHRhd2FpdCByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBicmFuY2ggPSBhd2FpdCBjaGFuZ2VzZXRTdGF0ZShicmFuY2hDaGFuZ2VzZXQpO1xuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWQgPSBhd2FpdCBjaGFuZ2VzZXRTdGF0ZSh1bmNvbW1pdHRlZENoYW5nZXNldCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8TGlzdFNlc3Npb25zUmVzdWx0PignbGlzdFNlc3Npb25zJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRicmFuY2hGaWxlczogYnJhbmNoLmZpbGVzLmxlbmd0aCxcblx0XHRcdFx0dW5jb21taXR0ZWRGaWxlczogdW5jb21taXR0ZWQuZmlsZXMubGVuZ3RoLFxuXHRcdFx0XHRzdW1tYXJ5OiBzZXNzaW9ucy5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSA9PT0gc2Vzc2lvblVyaSk/LmNoYW5nZXMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGJyYW5jaEZpbGVzOiAwLFxuXHRcdFx0XHR1bmNvbW1pdHRlZEZpbGVzOiAwLFxuXHRcdFx0XHRzdW1tYXJ5OiB7IGFkZGl0aW9uczogMCwgZGVsZXRpb25zOiAwLCBmaWxlczogMCB9LFxuXHRcdFx0fSk7XG5cdFx0fSwgMTAwLCAxMDApO1xuXHR9LCAhY29udGV4dC5pc1dpbmRvd3MpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnbGlzdFNlc3Npb25zIHJlcG9ydHMgdGhlIGFnZ3JlZ2F0ZSBmaWxlIGNoYW5nZSBzdW1tYXJ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1saXN0LXN1bW1hcnktJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtbGlzdC1zdW1tYXJ5Jyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHQndHVybi1jaGFuZ2VzZXQtbGlzdC1zdW1tYXJ5Jyxcblx0XHRcdCchbm9kZSAtZSBcImNvbnN0IGZzPXJlcXVpcmUoXFwnZnNcXCcpO2ZzLndyaXRlRmlsZVN5bmMoXFwnc2VlZC50eHRcXCcsXFwnZWRpdGVkXFwnKTtmcy53cml0ZUZpbGVTeW5jKFxcJ2FkZGVkLnR4dFxcJyxcXCdhZGRlZFxcJylcIicsXG5cdFx0XHQxLFxuXHRcdCk7XG5cdFx0YXdhaXQgd2FpdEZvckNoYW5nZXNldEZpbGVzKGJyYW5jaFVyaSwgWydzZWVkLnR4dCcsICdhZGRlZC50eHQnXSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzID0gYXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHJlc3VsdC5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSA9PT0gc2Vzc2lvblVyaSk/LmNoYW5nZXM7XG5cdFx0XHRpZiAoIXN1bW1hcnkgfHwgc3VtbWFyeS5maWxlcyAhPT0gMikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nlc3Npb24gbGlzdCBoYXMgbm90IHJlY2VpdmVkIHRoZSBjaGFuZ2VzIHN1bW1hcnknKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzdW1tYXJ5O1xuXHRcdH0sIDEwMCwgMTAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcywgeyBhZGRpdGlvbnM6IDIsIGRlbGV0aW9uczogMSwgZmlsZXM6IDIgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnaW52b2tpbmcgYW4gdW5rbm93biBjaGFuZ2VzZXQgb3BlcmF0aW9uIGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhbmdlc2V0IH0gPSBhd2FpdCBjcmVhdGVNb2RpZmllZFVuY29tbWl0dGVkQ2hhbmdlc2V0KCdjaGFuZ2VzZXQtdW5rbm93bi1vcGVyYXRpb24nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2ludm9rZUNoYW5nZXNldE9wZXJhdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6IGNoYW5nZXNldCxcblx0XHRcdG9wZXJhdGlvbklkOiAndW5rbm93bi1vcGVyYXRpb24nLFxuXHRcdH0pKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjaGFuZ2VzZXQgb3BlcmF0aW9uIHJlamVjdHMgYSB0YXJnZXQgb3V0c2lkZSBpdHMgYWR2ZXJ0aXNlZCBzY29wZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGFuZ2VzZXQgfSA9IGF3YWl0IGNyZWF0ZU1vZGlmaWVkVW5jb21taXR0ZWRDaGFuZ2VzZXQoJ2NoYW5nZXNldC1pbnZhbGlkLXNjb3BlJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBjaGFuZ2VzZXQsXG5cdFx0XHRvcGVyYXRpb25JZDogJ2Rpc2NhcmQtY2hhbmdlcycsXG5cdFx0fSkpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2EgbmV3IHNlc3Npb24gYWR2ZXJ0aXNlcyBpdHMgaW5pdGlhbCBjaGFuZ2VzZXQgY2F0YWxvZyBvbiBhIHNlcGFyYXRlIGNoYW5uZWwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LWNhdGFsb2ctJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtY2F0YWxvZycpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSAoc2Vzc2lvbi5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlKS5jaGFuZ2VzZXRzID8/IFtdO1xuXHRcdGNvbnN0IGFkdmVydGlzZWRDaGFubmVscyA9IGNoYW5nZXNldHMubWFwKGNoYW5nZXNldCA9PiBjaGFuZ2VzZXQudXJpVGVtcGxhdGUpLmZpbHRlcih1cmkgPT4gIXVyaS5pbmNsdWRlcygneycpKTtcblx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgUHJvbWlzZS5hbGwoYWR2ZXJ0aXNlZENoYW5uZWxzLm1hcChjaGFubmVsID0+XG5cdFx0XHRjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbCB9KVxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYXRhbG9nOiBjaGFuZ2VzZXRzLm1hcChjaGFuZ2VzZXQgPT4gKHtcblx0XHRcdFx0Y2hhbmdlS2luZDogY2hhbmdlc2V0LmNoYW5nZUtpbmQsXG5cdFx0XHRcdHVyaVRlbXBsYXRlOiBjaGFuZ2VzZXQudXJpVGVtcGxhdGUsXG5cdFx0XHRcdGNhblJldmlldzogY2hhbmdlc2V0LmNhcGFiaWxpdGllcz8ucmV2aWV3ICE9PSB1bmRlZmluZWQsXG5cdFx0XHR9KSksXG5cdFx0XHRzdWJzY3JpYmVkQ2hhbm5lbHM6IHN1YnNjcmliZWQubWFwKHJlc3VsdCA9PiByZXN1bHQuc25hcHNob3QhLnJlc291cmNlKSxcblx0XHR9LCB7XG5cdFx0XHRjYXRhbG9nOiBbe1xuXHRcdFx0XHRjaGFuZ2VLaW5kOiBDaGFuZ2VzZXRLaW5kLlVuY29tbWl0dGVkLFxuXHRcdFx0XHR1cmlUZW1wbGF0ZTogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdFx0Y2FuUmV2aWV3OiBmYWxzZSxcblx0XHRcdH1dLFxuXHRcdFx0c3Vic2NyaWJlZENoYW5uZWxzOiBhZHZlcnRpc2VkQ2hhbm5lbHMsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBwZXItdHVybiBjaGFuZ2VzZXQgcmVwb3J0cyBhIGZpbGUgY3JlYXRlZCBpbiB0aGF0IHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtdHVybi1jaGFuZ2VzZXQtYWRkLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVXb3JrdHJlZVNlc3Npb25Jbih3b3Jrc3BhY2UsICd0dXJuLWNoYW5nZXNldC1hZGQnKTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1hZGQnLCB3cml0ZUZpbGVDb21tYW5kKCd0dXJuLWFkZGVkLnR4dCcsICdBRERFRCcpLCAxKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmksICd0dXJuLWFkZCcpKTtcblx0XHRjb25zdCBmaWxlID0gc3RhdGUuZmlsZXMuZmluZChmaWxlID0+IGZpbGVVcmkoZmlsZSkuZW5kc1dpdGgoJy90dXJuLWFkZGVkLnR4dCcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBzdGF0ZS5zdGF0dXMsXG5cdFx0XHRoYXNCZWZvcmU6IGZpbGU/LmVkaXQuYmVmb3JlICE9PSB1bmRlZmluZWQsXG5cdFx0XHRoYXNBZnRlcjogZmlsZT8uZWRpdC5hZnRlciAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0ZGlmZjogZmlsZT8uZWRpdC5kaWZmLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdGhhc0JlZm9yZTogZmFsc2UsXG5cdFx0XHRoYXNBZnRlcjogdHJ1ZSxcblx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHR9KTtcblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBwZXItdHVybiBjaGFuZ2VzZXQgcmVwb3J0cyBhbiBlZGl0IHRvIGEgY29tbWl0dGVkIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtdHVybi1jaGFuZ2VzZXQtZWRpdC0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlV29ya3RyZWVTZXNzaW9uSW4od29ya3NwYWNlLCAndHVybi1jaGFuZ2VzZXQtZWRpdCcpO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWVkaXQnLCB3cml0ZUZpbGVDb21tYW5kKCdzZWVkLnR4dCcsICdlZGl0ZWQnKSwgMSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGNoYW5nZXNldFN0YXRlKGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uVXJpLCAndHVybi1lZGl0JykpO1xuXHRcdGNvbnN0IGZpbGUgPSBzdGF0ZS5maWxlcy5maW5kKGZpbGUgPT4gZmlsZVVyaShmaWxlKS5lbmRzV2l0aCgnL3NlZWQudHh0JykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHN0YXRlLnN0YXR1cyxcblx0XHRcdGhhc0JlZm9yZTogZmlsZT8uZWRpdC5iZWZvcmUgIT09IHVuZGVmaW5lZCxcblx0XHRcdGhhc0FmdGVyOiBmaWxlPy5lZGl0LmFmdGVyICE9PSB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0aGFzQmVmb3JlOiB0cnVlLFxuXHRcdFx0aGFzQWZ0ZXI6IHRydWUsXG5cdFx0fSk7XG5cdH0sIGZhbHNlKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2EgcGVyLXR1cm4gY2hhbmdlc2V0IHJlcG9ydHMgYSBmaWxlIGRlbGV0ZWQgaW4gdGhhdCB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLXR1cm4tY2hhbmdlc2V0LWRlbGV0ZS0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlV29ya3RyZWVTZXNzaW9uSW4od29ya3NwYWNlLCAndHVybi1jaGFuZ2VzZXQtZGVsZXRlJyk7XG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oc2Vzc2lvblVyaSwgJ3R1cm4tZGVsZXRlJywgJyFub2RlIC1lIFwicmVxdWlyZShcXCdmc1xcJykudW5saW5rU3luYyhwcm9jZXNzLmFyZ3ZbMV0pXCIgc2VlZC50eHQnLCAxKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmksICd0dXJuLWRlbGV0ZScpKTtcblx0XHRjb25zdCBmaWxlID0gc3RhdGUuZmlsZXMuZmluZChmaWxlID0+IGZpbGVVcmkoZmlsZSkuZW5kc1dpdGgoJy9zZWVkLnR4dCcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBzdGF0ZS5zdGF0dXMsXG5cdFx0XHRoYXNCZWZvcmU6IGZpbGU/LmVkaXQuYmVmb3JlICE9PSB1bmRlZmluZWQsXG5cdFx0XHRoYXNBZnRlcjogZmlsZT8uZWRpdC5hZnRlciAhPT0gdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdGhhc0JlZm9yZTogdHJ1ZSxcblx0XHRcdGhhc0FmdGVyOiBmYWxzZSxcblx0XHR9KTtcblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBwZXItdHVybiBjaGFuZ2VzZXQgZm9yIGEgbm8tb3AgdHVybiBpcyBlbXB0eSBhbmQgcmVhZHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtdHVybi1jaGFuZ2VzZXQtbm9vcC0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlV29ya3RyZWVTZXNzaW9uSW4od29ya3NwYWNlLCAndHVybi1jaGFuZ2VzZXQtbm9vcCcpO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLW5vb3AnLCAnL3JlbmFtZSBObyBGaWxlIENoYW5nZXMnLCAxKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmksICd0dXJuLW5vb3AnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXR1czogc3RhdGUuc3RhdHVzLCBmaWxlczogc3RhdGUuZmlsZXMgfSwgeyBzdGF0dXM6ICdyZWFkeScsIGZpbGVzOiBbXSB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIHBlci10dXJuIGNoYW5nZXNldCBmb3IgYW4gdW5rbm93biB0dXJuIHJlcG9ydHMgYW4gZXJyb3InLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtdHVybi1jaGFuZ2VzZXQtbWlzc2luZy0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlV29ya3RyZWVTZXNzaW9uSW4od29ya3NwYWNlLCAndHVybi1jaGFuZ2VzZXQtbWlzc2luZycpO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLWtub3duJywgJy9yZW5hbWUgS25vd24gVHVybicsIDEpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGFuZ2VzZXRTdGF0ZShidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSwgJ21pc3NpbmctdHVybicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCAnZXJyb3InKTtcblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY29tcGFyaW5nIGEgdHVybiB3aXRoIGl0c2VsZiBwcm9kdWNlcyBhbiBlbXB0eSByZWFkeSBjaGFuZ2VzZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY29tcGFyZS10dXJucy1zYW1lLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVXb3JrdHJlZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjb21wYXJlLXR1cm5zLXNhbWUnKTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1zYW1lJywgd3JpdGVGaWxlQ29tbWFuZCgnc2FtZS50eHQnLCAnU0FNRScpLCAxKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoYnVpbGRDb21wYXJlVHVybnNDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSwgJ3R1cm4tc2FtZScsICd0dXJuLXNhbWUnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXR1czogc3RhdGUuc3RhdHVzLCBmaWxlczogc3RhdGUuZmlsZXMgfSwgeyBzdGF0dXM6ICdyZWFkeScsIGZpbGVzOiBbXSB9KTtcblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY29tcGFyaW5nIHR3byB0dXJucyByZXBvcnRzIHRoZSBjaGFuZ2VzIGJldHdlZW4gdGhlaXIgY2hlY2twb2ludHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY29tcGFyZS10dXJucy1lZGl0LScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVXb3JrdHJlZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjb21wYXJlLXR1cm5zLWVkaXQnKTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1maXJzdCcsIHdyaXRlRmlsZUNvbW1hbmQoJ2JldHdlZW4udHh0JywgJ0ZJUlNUJyksIDEpO1xuXHRcdGF3YWl0IHJ1bkJhbmdUdXJuKHNlc3Npb25VcmksICd0dXJuLXNlY29uZCcsIHdyaXRlRmlsZUNvbW1hbmQoJ2JldHdlZW4udHh0JywgJ1NFQ09ORCcpLCAyKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoYnVpbGRDb21wYXJlVHVybnNDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSwgJ3R1cm4tZmlyc3QnLCAndHVybi1zZWNvbmQnKSk7XG5cdFx0Y29uc3QgZmlsZSA9IHN0YXRlLmZpbGVzLmZpbmQoZmlsZSA9PiBmaWxlVXJpKGZpbGUpLmVuZHNXaXRoKCcvYmV0d2Vlbi50eHQnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHN0YXRlLnN0YXR1cyxcblx0XHRcdGhhc0JlZm9yZTogZmlsZT8uZWRpdC5iZWZvcmUgIT09IHVuZGVmaW5lZCxcblx0XHRcdGhhc0FmdGVyOiBmaWxlPy5lZGl0LmFmdGVyICE9PSB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0aGFzQmVmb3JlOiB0cnVlLFxuXHRcdFx0aGFzQWZ0ZXI6IHRydWUsXG5cdFx0fSk7XG5cdH0sIGZhbHNlKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NvbXBhcmluZyB3aXRoIGFuIHVua25vd24gdHVybiByZXBvcnRzIGFuIGVycm9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNvbXBhcmUtdHVybnMtbWlzc2luZy0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlV29ya3RyZWVTZXNzaW9uSW4od29ya3NwYWNlLCAnY29tcGFyZS10dXJucy1taXNzaW5nJyk7XG5cdFx0YXdhaXQgcnVuQmFuZ1R1cm4oc2Vzc2lvblVyaSwgJ3R1cm4ta25vd24nLCB3cml0ZUZpbGVDb21tYW5kKCdrbm93bi50eHQnLCAnS05PV04nKSwgMSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGNoYW5nZXNldFN0YXRlKGJ1aWxkQ29tcGFyZVR1cm5zQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmksICdtaXNzaW5nLXR1cm4nLCAndHVybi1rbm93bicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCAnZXJyb3InKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIG1hdGVyaWFsaXplZCBnaXQgc2Vzc2lvbiBhZHZlcnRpc2VzIHR1cm4gYW5kIGNvbXBhcmUgY2hhbmdlc2V0IHRlbXBsYXRlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtdGVtcGxhdGUtY2F0YWxvZy0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlV29ya3RyZWVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LXRlbXBsYXRlLWNhdGFsb2cnKTtcblx0XHRhd2FpdCBydW5CYW5nVHVybihzZXNzaW9uVXJpLCAndHVybi1tYXRlcmlhbGl6ZScsICcvcmVuYW1lIE1hdGVyaWFsaXplZCcsIDEpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdGNvbnN0IGtpbmRzID0gKChzZXNzaW9uLnNuYXBzaG90IS5zdGF0ZSBhcyBTZXNzaW9uU3RhdGUpLmNoYW5nZXNldHMgPz8gW10pLm1hcChjaGFuZ2VzZXQgPT4gY2hhbmdlc2V0LmNoYW5nZUtpbmQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNUdXJuOiBraW5kcy5pbmNsdWRlcyhDaGFuZ2VzZXRLaW5kLlR1cm4pLFxuXHRcdFx0aGFzQ29tcGFyZToga2luZHMuaW5jbHVkZXMoQ2hhbmdlc2V0S2luZC5Db21wYXJlKSxcblx0XHR9LCB7XG5cdFx0XHRoYXNUdXJuOiB0cnVlLFxuXHRcdFx0aGFzQ29tcGFyZTogdHJ1ZSxcblx0XHR9KTtcblx0fSwgZmFsc2UpO1xuXG5cdGlmIChjb250ZXh0LnRpZXIgPT09ICdwYXJpdHknKSB7XG5cdFx0KGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMgJiYgY29uZmlnLnN0cmVhbWluZ0ZpbGVDcmVhdGVUb29sTmFtZSA/IHRlc3QgOiB0ZXN0LnNraXApKCdzZXNzaW9uIGNoYW5nZXNldCBhZ2dyZWdhdGVzIHByb3ZpZGVyIGVkaXRzIGZyb20gZGVmYXVsdCBhbmQgcGVlciBjaGF0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgyNDBfMDAwKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZShgYWhwLXByb3ZpZGVyLXNlc3Npb24tY2hhbmdlc2V0LSR7Y29uZmlnLnByb3ZpZGVyfS1gKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAncHJvdmlkZXItc2Vzc2lvbi1jaGFuZ2VzZXQnKTtcblx0XHRcdGNvbnN0IHBlZXJVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlQ2hhdCcsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSwgY2hhdDogcGVlclVyaSwgdGl0bGU6ICdDaGFuZ2VzIFBlZXInIH0pO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXJVcmkgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hhbmdlc2V0ID0gYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25DaGFuZ2VzZXQgfSk7XG5cblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdCd0dXJuLXByb3ZpZGVyLWRlZmF1bHQtZWRpdCcsXG5cdFx0XHRcdCdDcmVhdGUgZGVmYXVsdC1wcm92aWRlci50eHQgY29udGFpbmluZyBleGFjdGx5IERFRkFVTFRfUFJPVklERVIgdXNpbmcgeW91ciBmaWxlIGNyZWF0aW9uIHRvb2w7IGRvIG5vdCBydW4gYSBzaGVsbCBjb21tYW5kLiBUaGVuIHJlcGx5IGV4YWN0bHkgXCJjcmVhdGVkXCIuJyxcblx0XHRcdFx0MSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBhcHByb3ZhbCA9IHN0YXJ0QmFja2dyb3VuZEFwcHJvdmFsTG9vcChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0XHRhcHByb3ZhbFNlcVN0YXJ0OiAxMDAsXG5cdFx0XHRcdGFsbG93OiBbeyB0b29sTmFtZTogY29uZmlnLnN0cmVhbWluZ0ZpbGVDcmVhdGVUb29sTmFtZSEgfV0sXG5cdFx0XHR9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRjaGFubmVsOiBwZWVyVXJpLFxuXHRcdFx0XHRcdGNsaWVudFNlcTogMTAsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tcHJvdmlkZXItcGVlci1lZGl0Jyxcblx0XHRcdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdDcmVhdGUgcGVlci1wcm92aWRlci50eHQgY29udGFpbmluZyBleGFjdGx5IFBFRVJfUFJPVklERVIgdXNpbmcgeW91ciBmaWxlIGNyZWF0aW9uIHRvb2w7IGRvIG5vdCBydW4gYSBzaGVsbCBjb21tYW5kLiBUaGVuIHJlcGx5IGV4YWN0bHkgXCJjcmVhdGVkXCIuJyxcblx0XHRcdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gcGVlclVyaVxuXHRcdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09ICd0dXJuLXByb3ZpZGVyLXBlZXItZWRpdCcsXG5cdFx0XHRcdFx0OTBfMDAwLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgYXBwcm92YWwuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHByb3ZhbC5lcnJvcnMsIFtdKTtcblxuXHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhbmdlc2V0U3RhdGUoc2Vzc2lvbkNoYW5nZXNldCk7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBbJ2RlZmF1bHQtcHJvdmlkZXIudHh0JywgJ3BlZXItcHJvdmlkZXIudHh0J10ubWFwKG5hbWUgPT4gc3RhdGUuZmlsZXMuZmluZChmaWxlID0+IGZpbGVVcmkoZmlsZSkuZW5kc1dpdGgoYC8ke25hbWV9YCkpKTtcblx0XHRcdFx0aWYgKG1hdGNoZXMuc29tZShtYXRjaCA9PiAhbWF0Y2gpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uIGNoYW5nZXNldCBoYXMgbm90IGFnZ3JlZ2F0ZWQgYm90aCBwcm92aWRlciBjaGF0cycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtYXRjaGVzO1xuXHRcdFx0fSwgMTAwLCAxMDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVzLm1hcChmaWxlID0+IFVSSS5wYXJzZShmaWxlVXJpKGZpbGUhKSkucGF0aC5zcGxpdCgnLycpLmF0KC0xKSkuc29ydCgpLCBbXG5cdFx0XHRcdCdkZWZhdWx0LXByb3ZpZGVyLnR4dCcsXG5cdFx0XHRcdCdwZWVyLXByb3ZpZGVyLnR4dCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBd0JBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksYUFBYSxjQUFjLHFCQUFxQjtBQUNyRSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjLHFCQUFxQixhQUFhLHNCQUF5QztBQUNsRztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLG1CQUFtQixjQUFjLHVCQUF1QixpQkFBaUIsb0JBQW9CLG1DQUFtQztBQUN6SSxTQUFTLG1CQUFtQiw0QkFBNEI7QUFDeEQsU0FBUyx1QkFBc0Q7QUFpQy9ELE1BQU0saUNBQWlDO0FBRWhDLFNBQVMscUJBQXFCLFNBQXlDO0FBQzdFLFFBQU0sRUFBRSxRQUFRLGlCQUFpQixTQUFTLElBQUk7QUFPOUMsTUFBSSxZQUFZO0FBQ2hCLFdBQVMsZ0JBQXdCO0FBQ2hD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
