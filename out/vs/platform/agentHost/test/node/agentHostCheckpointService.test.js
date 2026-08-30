import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { buildCheckpointRefName } from "../../common/agentHostCheckpointService.js";
import { AgentSession } from "../../common/agentService.js";
import { AgentHostCheckpointService } from "../../node/agentHostCheckpointService.js";
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
class CheckpointTestDatabase extends TestSessionDatabase {
  constructor(previousCheckpointRef) {
    super();
    this.previousCheckpointRef = previousCheckpointRef;
    this.checkpointRefs = /* @__PURE__ */ new Map();
  }
  async setTurnCheckpointRef(turnId, ref) {
    this.checkpointRefs.set(turnId, ref);
  }
  async getTurnCheckpointRef(turnId) {
    return this.checkpointRefs.get(turnId);
  }
  async getPreviousCheckpointRef() {
    return this.previousCheckpointRef;
  }
  async getAllCheckpointRefs() {
    return [this.previousCheckpointRef, ...this.checkpointRefs.values()].filter((ref) => ref !== void 0);
  }
}
class CheckpointTestConfigurationService extends mock() {
  constructor(workingDirectory) {
    super();
    this.workingDirectory = workingDirectory;
  }
  getEffectiveWorkingDirectories() {
    return [this.workingDirectory.toString()];
  }
}
suite("AgentHostCheckpointService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createTestService(captureWorkingTreeAsTree, options) {
    const session = AgentSession.uri("copilot", "session");
    const chat = URI.parse("ahp-chat://default/session");
    const workingDirectory = URI.file("/workspace");
    const repositoryRoot = URI.file("/workspace");
    const sanitizedSessionId = AgentSession.id(session);
    const baselineRef = buildCheckpointRefName(sanitizedSessionId, 0);
    const previousRef = buildCheckpointRefName(sanitizedSessionId, 4);
    const hasBaseline = options?.baseline !== false;
    const hasPrevious = options?.previous !== false;
    const database = new CheckpointTestDatabase(hasPrevious ? previousRef : void 0);
    const refs = /* @__PURE__ */ new Map();
    if (hasBaseline) {
      refs.set(baselineRef, "baseline-commit");
    }
    if (hasPrevious) {
      refs.set(previousRef, "previous-turn-commit");
    }
    const parents = /* @__PURE__ */ new Map();
    const commitCalls = [];
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => repositoryRoot,
      captureWorkingTreeAsTree,
      commitTree: async (_root, tree, parent) => {
        commitCalls.push({ tree, parent });
        if (options?.failCommitTree?.(tree)) {
          return void 0;
        }
        const commit = `commit-${commitCalls.length}`;
        if (parent) {
          parents.set(commit, parent);
        }
        return commit;
      },
      updateRef: async (_root, ref, oid) => {
        refs.set(ref, oid);
      },
      revParse: async (_root, expression) => {
        if (expression.endsWith("^")) {
          const commit = refs.get(expression.slice(0, -1));
          return commit ? parents.get(commit) : void 0;
        }
        return refs.get(expression);
      }
    };
    const dataService = createSessionDataService(database);
    let openDatabaseCount = 0;
    const service = store.add(new AgentHostCheckpointService(
      {
        ...dataService,
        openDatabase: (session2) => {
          openDatabaseCount++;
          if (openDatabaseCount === options?.failOpenDatabaseAt) {
            throw new Error("open failed");
          }
          return dataService.openDatabase(session2);
        }
      },
      new CheckpointTestConfigurationService(workingDirectory),
      gitService,
      new NullLogService()
    ));
    return { chat, commitCalls, database, previousRef, session, service, workingDirectory };
  }
  test("turn diff parent is the working tree captured at turn start", async () => {
    const trees = ["tree-before-turn", "tree-after-turn"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
    const currentRef = buildCheckpointRefName(AgentSession.id(session), 5);
    await service.captureTurnStartCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-5", [workingDirectory]);
    assert.deepStrictEqual({
      commitCalls,
      pair: await service.getTurnCheckpointPair(session, "turn-5", workingDirectory)
    }, {
      commitCalls: [
        { tree: "tree-before-turn", parent: "previous-turn-commit" },
        { tree: "tree-after-turn", parent: "commit-1" }
      ],
      pair: { parent: "commit-1", current: currentRef }
    });
  });
  test("captures a missing baseline from the pre-turn tree before the agent can edit", async () => {
    const trees = ["tree-before-first-turn", "tree-after-first-turn"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift(), { baseline: false, previous: false });
    await service.captureTurnStartCheckpoint(session, chat, "turn-1", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-1", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, [
      { tree: "tree-before-first-turn", parent: void 0 },
      { tree: "tree-before-first-turn", parent: "commit-1" },
      { tree: "tree-after-first-turn", parent: "commit-2" }
    ]);
  });
  test("discard waits for an in-flight turn-start capture", async () => {
    const captureStarted = new DeferredPromise();
    const releaseCapture = new DeferredPromise();
    const trees = ["discarded-start-tree", "tree-after-discard"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => {
      if (!captureStarted.isSettled) {
        captureStarted.complete();
        await releaseCapture.p;
      }
      return trees.shift();
    });
    const capture = service.captureTurnStartCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await captureStarted.p;
    const discard = service.discardTurnStartCheckpoint(session, chat, "turn-5");
    releaseCapture.complete();
    await Promise.all([capture, discard]);
    await service.captureTurnCheckpoint(session, chat, "turn-5", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, []);
  });
  test("missing working directories discard the pending turn start", async () => {
    const trees = ["stale-start", "next-start", "next-end"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
    await service.captureTurnStartCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-5", void 0);
    await service.captureTurnStartCheckpoint(session, chat, "turn-6", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-6", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, [
      { tree: "next-start", parent: "previous-turn-commit" },
      { tree: "next-end", parent: "commit-1" }
    ]);
  });
  test("database open failure discards the pending turn start", async () => {
    const trees = ["stale-start", "next-start", "next-end"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift(), { failOpenDatabaseAt: 2 });
    await service.captureTurnStartCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await service.captureTurnStartCheckpoint(session, chat, "turn-6", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-6", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, [
      { tree: "next-start", parent: "previous-turn-commit" },
      { tree: "next-end", parent: "commit-1" }
    ]);
  });
  test("turn-start database open failure is best-effort", async () => {
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => "tree-before-turn", { failOpenDatabaseAt: 1 });
    await service.captureTurnStartCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-5", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, []);
  });
  test("start commit failure skips the repository end checkpoint", async () => {
    const trees = ["tree-before-turn", "tree-after-turn"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift(), {
      failCommitTree: (tree) => tree === "tree-before-turn"
    });
    await service.captureTurnStartCheckpoint(session, chat, "turn-5", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-5", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, [
      { tree: "tree-before-turn", parent: "previous-turn-commit" }
    ]);
  });
  test("session deletion waits for capture before clearing turn starts", async () => {
    const captureStarted = new DeferredPromise();
    const releaseCapture = new DeferredPromise();
    const trees = ["turn-start-tree", "turn-end-tree"];
    const session = AgentSession.uri("copilot", "session");
    const chat = URI.parse("ahp-chat://default/session");
    const workingDirectory = URI.file("/workspace");
    const repositoryRoot = URI.file("/workspace");
    const baselineRef = buildCheckpointRefName(AgentSession.id(session), 0);
    const database = new CheckpointTestDatabase(void 0);
    const refs = /* @__PURE__ */ new Map();
    const commitCalls = [];
    const onWillDeleteSessionData = new Emitter();
    store.add(onWillDeleteSessionData);
    const dataService = {
      ...createSessionDataService(database),
      onWillDeleteSessionData: onWillDeleteSessionData.event
    };
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => repositoryRoot,
      captureWorkingTreeAsTree: async () => {
        if (!captureStarted.isSettled) {
          captureStarted.complete();
          await releaseCapture.p;
        }
        return trees.shift();
      },
      commitTree: async (_root, tree, parent) => {
        const commit = `commit-${commitCalls.length + 1}`;
        commitCalls.push({ tree, parent });
        return commit;
      },
      updateRef: async (_root, ref, oid) => {
        refs.set(ref, oid);
      },
      deleteRefs: async (_root, deletedRefs) => {
        deletedRefs.forEach((ref) => refs.delete(ref));
      },
      revParse: async (_root, ref) => refs.get(ref)
    };
    const service = store.add(new AgentHostCheckpointService(
      dataService,
      new CheckpointTestConfigurationService(workingDirectory),
      gitService,
      new NullLogService()
    ));
    const capture = service.captureTurnStartCheckpoint(session, chat, "turn-1", [workingDirectory]);
    await captureStarted.p;
    const cleanup = [];
    onWillDeleteSessionData.fire({
      session,
      workingDirectories: [workingDirectory.toString()],
      waitUntil: (promise) => cleanup.push(promise)
    });
    releaseCapture.complete();
    await Promise.all([capture, ...cleanup]);
    await service.captureTurnCheckpoint(session, chat, "turn-1", [workingDirectory]);
    assert.deepStrictEqual({
      commitCalls,
      baselineExists: refs.has(baselineRef)
    }, {
      commitCalls: [{ tree: "turn-start-tree", parent: void 0 }],
      baselineExists: false
    });
  });
  test("preserves a reused legacy checkpoint ref as an empty turn", async () => {
    const { database, previousRef, session, service, workingDirectory } = createTestService(async () => void 0);
    await database.setTurnCheckpointRef("turn-5", previousRef);
    assert.deepStrictEqual(await service.getTurnCheckpointPair(session, "turn-5", workingDirectory), {
      parent: previousRef,
      current: previousRef
    });
  });
  test("disables Git checkpoints for concurrent chat turns with the same id", async () => {
    const trees = ["tree-a-start", "tree-b-start", "tree-b-end", "tree-a-end"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
    const peerChat = URI.parse("ahp-chat://peer/session");
    await service.captureTurnStartCheckpoint(session, chat, "turn-1", [workingDirectory]);
    await service.captureTurnStartCheckpoint(session, peerChat, "turn-1", [workingDirectory]);
    await service.captureTurnCheckpoint(session, peerChat, "turn-1", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-1", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, []);
  });
  test("failed peer start capture still invalidates an existing turn", async () => {
    const trees = ["tree-a-start", void 0, "tree-a-end"];
    const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
    const peerChat = URI.parse("ahp-chat://peer/session");
    await service.captureTurnStartCheckpoint(session, chat, "turn-a", [workingDirectory]);
    await service.captureTurnStartCheckpoint(session, peerChat, "turn-b", [workingDirectory]);
    await service.captureTurnCheckpoint(session, chat, "turn-a", [workingDirectory]);
    assert.deepStrictEqual(commitCalls, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBidWlsZENoZWNrcG9pbnRSZWZOYW1lIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBJV2lsbERlbGV0ZVNlc3Npb25EYXRhRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb29wR2l0U2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5cbmNsYXNzIENoZWNrcG9pbnRUZXN0RGF0YWJhc2UgZXh0ZW5kcyBUZXN0U2Vzc2lvbkRhdGFiYXNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBjaGVja3BvaW50UmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBwcmV2aW91c0NoZWNrcG9pbnRSZWY6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRUdXJuQ2hlY2twb2ludFJlZih0dXJuSWQ6IHN0cmluZywgcmVmOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrcG9pbnRSZWZzLnNldCh0dXJuSWQsIHJlZik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBnZXRUdXJuQ2hlY2twb2ludFJlZih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hlY2twb2ludFJlZnMuZ2V0KHR1cm5JZCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBnZXRQcmV2aW91c0NoZWNrcG9pbnRSZWYoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcmV2aW91c0NoZWNrcG9pbnRSZWY7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBnZXRBbGxDaGVja3BvaW50UmVmcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIFt0aGlzLnByZXZpb3VzQ2hlY2twb2ludFJlZiwgLi4udGhpcy5jaGVja3BvaW50UmVmcy52YWx1ZXMoKV0uZmlsdGVyKChyZWYpOiByZWYgaXMgc3RyaW5nID0+IHJlZiAhPT0gdW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBDaGVja3BvaW50VGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgbW9jazxJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLndvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKV07XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlc3RTZXJ2aWNlKGNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZTogKCkgPT4gUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+LCBvcHRpb25zPzoge1xuXHRcdGJhc2VsaW5lPzogYm9vbGVhbjtcblx0XHRwcmV2aW91cz86IGJvb2xlYW47XG5cdFx0ZmFpbENvbW1pdFRyZWU/OiAodHJlZTogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRcdGZhaWxPcGVuRGF0YWJhc2VBdD86IG51bWJlcjtcblx0fSkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24nKTtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKCdhaHAtY2hhdDovL2RlZmF1bHQvc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCBzYW5pdGl6ZWRTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgYmFzZWxpbmVSZWYgPSBidWlsZENoZWNrcG9pbnRSZWZOYW1lKHNhbml0aXplZFNlc3Npb25JZCwgMCk7XG5cdFx0Y29uc3QgcHJldmlvdXNSZWYgPSBidWlsZENoZWNrcG9pbnRSZWZOYW1lKHNhbml0aXplZFNlc3Npb25JZCwgNCk7XG5cdFx0Y29uc3QgaGFzQmFzZWxpbmUgPSBvcHRpb25zPy5iYXNlbGluZSAhPT0gZmFsc2U7XG5cdFx0Y29uc3QgaGFzUHJldmlvdXMgPSBvcHRpb25zPy5wcmV2aW91cyAhPT0gZmFsc2U7XG5cdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgQ2hlY2twb2ludFRlc3REYXRhYmFzZShoYXNQcmV2aW91cyA/IHByZXZpb3VzUmVmIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCByZWZzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRpZiAoaGFzQmFzZWxpbmUpIHtcblx0XHRcdHJlZnMuc2V0KGJhc2VsaW5lUmVmLCAnYmFzZWxpbmUtY29tbWl0Jyk7XG5cdFx0fVxuXHRcdGlmIChoYXNQcmV2aW91cykge1xuXHRcdFx0cmVmcy5zZXQocHJldmlvdXNSZWYsICdwcmV2aW91cy10dXJuLWNvbW1pdCcpO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBjb21taXRDYWxsczogQXJyYXk8eyB0cmVlOiBzdHJpbmc7IHBhcmVudDogc3RyaW5nIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcmVwb3NpdG9yeVJvb3QsXG5cdFx0XHRjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUsXG5cdFx0XHRjb21taXRUcmVlOiBhc3luYyAoX3Jvb3QsIHRyZWUsIHBhcmVudCkgPT4ge1xuXHRcdFx0XHRjb21taXRDYWxscy5wdXNoKHsgdHJlZSwgcGFyZW50IH0pO1xuXHRcdFx0XHRpZiAob3B0aW9ucz8uZmFpbENvbW1pdFRyZWU/Lih0cmVlKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29tbWl0ID0gYGNvbW1pdC0ke2NvbW1pdENhbGxzLmxlbmd0aH1gO1xuXHRcdFx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRcdFx0cGFyZW50cy5zZXQoY29tbWl0LCBwYXJlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjb21taXQ7XG5cdFx0XHR9LFxuXHRcdFx0dXBkYXRlUmVmOiBhc3luYyAoX3Jvb3QsIHJlZiwgb2lkKSA9PiB7IHJlZnMuc2V0KHJlZiwgb2lkKTsgfSxcblx0XHRcdHJldlBhcnNlOiBhc3luYyAoX3Jvb3QsIGV4cHJlc3Npb24pID0+IHtcblx0XHRcdFx0aWYgKGV4cHJlc3Npb24uZW5kc1dpdGgoJ14nKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdCA9IHJlZnMuZ2V0KGV4cHJlc3Npb24uc2xpY2UoMCwgLTEpKTtcblx0XHRcdFx0XHRyZXR1cm4gY29tbWl0ID8gcGFyZW50cy5nZXQoY29tbWl0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVmcy5nZXQoZXhwcmVzc2lvbik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgZGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGF0YWJhc2UpO1xuXHRcdGxldCBvcGVuRGF0YWJhc2VDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UoXG5cdFx0XHR7XG5cdFx0XHRcdC4uLmRhdGFTZXJ2aWNlLFxuXHRcdFx0XHRvcGVuRGF0YWJhc2U6IHNlc3Npb24gPT4ge1xuXHRcdFx0XHRcdG9wZW5EYXRhYmFzZUNvdW50Kys7XG5cdFx0XHRcdFx0aWYgKG9wZW5EYXRhYmFzZUNvdW50ID09PSBvcHRpb25zPy5mYWlsT3BlbkRhdGFiYXNlQXQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignb3BlbiBmYWlsZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRuZXcgQ2hlY2twb2ludFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh3b3JraW5nRGlyZWN0b3J5KSxcblx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRyZXR1cm4geyBjaGF0LCBjb21taXRDYWxscywgZGF0YWJhc2UsIHByZXZpb3VzUmVmLCBzZXNzaW9uLCBzZXJ2aWNlLCB3b3JraW5nRGlyZWN0b3J5IH07XG5cdH1cblxuXHR0ZXN0KCd0dXJuIGRpZmYgcGFyZW50IGlzIHRoZSB3b3JraW5nIHRyZWUgY2FwdHVyZWQgYXQgdHVybiBzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmVlcyA9IFsndHJlZS1iZWZvcmUtdHVybicsICd0cmVlLWFmdGVyLXR1cm4nXTtcblx0XHRjb25zdCB7IGNoYXQsIGNvbW1pdENhbGxzLCBzZXNzaW9uLCBzZXJ2aWNlLCB3b3JraW5nRGlyZWN0b3J5IH0gPSBjcmVhdGVUZXN0U2VydmljZShhc3luYyAoKSA9PiB0cmVlcy5zaGlmdCgpKTtcblx0XHRjb25zdCBjdXJyZW50UmVmID0gYnVpbGRDaGVja3BvaW50UmVmTmFtZShBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksIDUpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi01JywgW3dvcmtpbmdEaXJlY3RvcnldKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNhcHR1cmVUdXJuQ2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi01JywgW3dvcmtpbmdEaXJlY3RvcnldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWl0Q2FsbHMsXG5cdFx0XHRwYWlyOiBhd2FpdCBzZXJ2aWNlLmdldFR1cm5DaGVja3BvaW50UGFpcihzZXNzaW9uLCAndHVybi01Jywgd29ya2luZ0RpcmVjdG9yeSksXG5cdFx0fSwge1xuXHRcdFx0Y29tbWl0Q2FsbHM6IFtcblx0XHRcdFx0eyB0cmVlOiAndHJlZS1iZWZvcmUtdHVybicsIHBhcmVudDogJ3ByZXZpb3VzLXR1cm4tY29tbWl0JyB9LFxuXHRcdFx0XHR7IHRyZWU6ICd0cmVlLWFmdGVyLXR1cm4nLCBwYXJlbnQ6ICdjb21taXQtMScgfSxcblx0XHRcdF0sXG5cdFx0XHRwYWlyOiB7IHBhcmVudDogJ2NvbW1pdC0xJywgY3VycmVudDogY3VycmVudFJlZiB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXB0dXJlcyBhIG1pc3NpbmcgYmFzZWxpbmUgZnJvbSB0aGUgcHJlLXR1cm4gdHJlZSBiZWZvcmUgdGhlIGFnZW50IGNhbiBlZGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyZWVzID0gWyd0cmVlLWJlZm9yZS1maXJzdC10dXJuJywgJ3RyZWUtYWZ0ZXItZmlyc3QtdHVybiddO1xuXHRcdGNvbnN0IHsgY2hhdCwgY29tbWl0Q2FsbHMsIHNlc3Npb24sIHNlcnZpY2UsIHdvcmtpbmdEaXJlY3RvcnkgfSA9IGNyZWF0ZVRlc3RTZXJ2aWNlKGFzeW5jICgpID0+IHRyZWVzLnNoaWZ0KCksIHsgYmFzZWxpbmU6IGZhbHNlLCBwcmV2aW91czogZmFsc2UgfSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNhcHR1cmVUdXJuU3RhcnRDaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTEnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTEnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21taXRDYWxscywgW1xuXHRcdFx0eyB0cmVlOiAndHJlZS1iZWZvcmUtZmlyc3QtdHVybicsIHBhcmVudDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHRyZWU6ICd0cmVlLWJlZm9yZS1maXJzdC10dXJuJywgcGFyZW50OiAnY29tbWl0LTEnIH0sXG5cdFx0XHR7IHRyZWU6ICd0cmVlLWFmdGVyLWZpcnN0LXR1cm4nLCBwYXJlbnQ6ICdjb21taXQtMicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY2FyZCB3YWl0cyBmb3IgYW4gaW4tZmxpZ2h0IHR1cm4tc3RhcnQgY2FwdHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYXB0dXJlU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCByZWxlYXNlQ2FwdHVyZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCB0cmVlcyA9IFsnZGlzY2FyZGVkLXN0YXJ0LXRyZWUnLCAndHJlZS1hZnRlci1kaXNjYXJkJ107XG5cdFx0Y29uc3QgeyBjaGF0LCBjb21taXRDYWxscywgc2Vzc2lvbiwgc2VydmljZSwgd29ya2luZ0RpcmVjdG9yeSB9ID0gY3JlYXRlVGVzdFNlcnZpY2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCFjYXB0dXJlU3RhcnRlZC5pc1NldHRsZWQpIHtcblx0XHRcdFx0Y2FwdHVyZVN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgcmVsZWFzZUNhcHR1cmUucDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cmVlcy5zaGlmdCgpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2FwdHVyZSA9IHNlcnZpY2UuY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgY2FwdHVyZVN0YXJ0ZWQucDtcblx0XHRjb25zdCBkaXNjYXJkID0gc2VydmljZS5kaXNjYXJkVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi01Jyk7XG5cdFx0cmVsZWFzZUNhcHR1cmUuY29tcGxldGUoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY2FwdHVyZSwgZGlzY2FyZF0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTUnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21taXRDYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtaXNzaW5nIHdvcmtpbmcgZGlyZWN0b3JpZXMgZGlzY2FyZCB0aGUgcGVuZGluZyB0dXJuIHN0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyZWVzID0gWydzdGFsZS1zdGFydCcsICduZXh0LXN0YXJ0JywgJ25leHQtZW5kJ107XG5cdFx0Y29uc3QgeyBjaGF0LCBjb21taXRDYWxscywgc2Vzc2lvbiwgc2VydmljZSwgd29ya2luZ0RpcmVjdG9yeSB9ID0gY3JlYXRlVGVzdFNlcnZpY2UoYXN5bmMgKCkgPT4gdHJlZXMuc2hpZnQoKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNhcHR1cmVUdXJuU3RhcnRDaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTUnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTUnLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNicsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVybkNoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNicsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1pdENhbGxzLCBbXG5cdFx0XHR7IHRyZWU6ICduZXh0LXN0YXJ0JywgcGFyZW50OiAncHJldmlvdXMtdHVybi1jb21taXQnIH0sXG5cdFx0XHR7IHRyZWU6ICduZXh0LWVuZCcsIHBhcmVudDogJ2NvbW1pdC0xJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkYXRhYmFzZSBvcGVuIGZhaWx1cmUgZGlzY2FyZHMgdGhlIHBlbmRpbmcgdHVybiBzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmVlcyA9IFsnc3RhbGUtc3RhcnQnLCAnbmV4dC1zdGFydCcsICduZXh0LWVuZCddO1xuXHRcdGNvbnN0IHsgY2hhdCwgY29tbWl0Q2FsbHMsIHNlc3Npb24sIHNlcnZpY2UsIHdvcmtpbmdEaXJlY3RvcnkgfSA9IGNyZWF0ZVRlc3RTZXJ2aWNlKGFzeW5jICgpID0+IHRyZWVzLnNoaWZ0KCksIHsgZmFpbE9wZW5EYXRhYmFzZUF0OiAyIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi01JywgW3dvcmtpbmdEaXJlY3RvcnldKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNhcHR1cmVUdXJuQ2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi01JywgW3dvcmtpbmdEaXJlY3RvcnldKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNhcHR1cmVUdXJuU3RhcnRDaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTYnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTYnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21taXRDYWxscywgW1xuXHRcdFx0eyB0cmVlOiAnbmV4dC1zdGFydCcsIHBhcmVudDogJ3ByZXZpb3VzLXR1cm4tY29tbWl0JyB9LFxuXHRcdFx0eyB0cmVlOiAnbmV4dC1lbmQnLCBwYXJlbnQ6ICdjb21taXQtMScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi1zdGFydCBkYXRhYmFzZSBvcGVuIGZhaWx1cmUgaXMgYmVzdC1lZmZvcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjaGF0LCBjb21taXRDYWxscywgc2Vzc2lvbiwgc2VydmljZSwgd29ya2luZ0RpcmVjdG9yeSB9ID0gY3JlYXRlVGVzdFNlcnZpY2UoYXN5bmMgKCkgPT4gJ3RyZWUtYmVmb3JlLXR1cm4nLCB7IGZhaWxPcGVuRGF0YWJhc2VBdDogMSB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVybkNoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1pdENhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0IGNvbW1pdCBmYWlsdXJlIHNraXBzIHRoZSByZXBvc2l0b3J5IGVuZCBjaGVja3BvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyZWVzID0gWyd0cmVlLWJlZm9yZS10dXJuJywgJ3RyZWUtYWZ0ZXItdHVybiddO1xuXHRcdGNvbnN0IHsgY2hhdCwgY29tbWl0Q2FsbHMsIHNlc3Npb24sIHNlcnZpY2UsIHdvcmtpbmdEaXJlY3RvcnkgfSA9IGNyZWF0ZVRlc3RTZXJ2aWNlKGFzeW5jICgpID0+IHRyZWVzLnNoaWZ0KCksIHtcblx0XHRcdGZhaWxDb21taXRUcmVlOiB0cmVlID0+IHRyZWUgPT09ICd0cmVlLWJlZm9yZS10dXJuJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVybkNoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tNScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1pdENhbGxzLCBbXG5cdFx0XHR7IHRyZWU6ICd0cmVlLWJlZm9yZS10dXJuJywgcGFyZW50OiAncHJldmlvdXMtdHVybi1jb21taXQnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gZGVsZXRpb24gd2FpdHMgZm9yIGNhcHR1cmUgYmVmb3JlIGNsZWFyaW5nIHR1cm4gc3RhcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhcHR1cmVTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlbGVhc2VDYXB0dXJlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHRyZWVzID0gWyd0dXJuLXN0YXJ0LXRyZWUnLCAndHVybi1lbmQtdHJlZSddO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24nKTtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKCdhaHAtY2hhdDovL2RlZmF1bHQvc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCBiYXNlbGluZVJlZiA9IGJ1aWxkQ2hlY2twb2ludFJlZk5hbWUoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLCAwKTtcblx0XHRjb25zdCBkYXRhYmFzZSA9IG5ldyBDaGVja3BvaW50VGVzdERhdGFiYXNlKHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgY29tbWl0Q2FsbHM6IEFycmF5PHsgdHJlZTogc3RyaW5nOyBwYXJlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRcdGNvbnN0IG9uV2lsbERlbGV0ZVNlc3Npb25EYXRhID0gbmV3IEVtaXR0ZXI8SVdpbGxEZWxldGVTZXNzaW9uRGF0YUV2ZW50PigpO1xuXHRcdHN0b3JlLmFkZChvbldpbGxEZWxldGVTZXNzaW9uRGF0YSk7XG5cdFx0Y29uc3QgZGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGF0YWJhc2UpLFxuXHRcdFx0b25XaWxsRGVsZXRlU2Vzc2lvbkRhdGE6IG9uV2lsbERlbGV0ZVNlc3Npb25EYXRhLmV2ZW50LFxuXHRcdH07XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0UmVwb3NpdG9yeVJvb3Q6IGFzeW5jICgpID0+IHJlcG9zaXRvcnlSb290LFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICghY2FwdHVyZVN0YXJ0ZWQuaXNTZXR0bGVkKSB7XG5cdFx0XHRcdFx0Y2FwdHVyZVN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRhd2FpdCByZWxlYXNlQ2FwdHVyZS5wO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cmVlcy5zaGlmdCgpO1xuXHRcdFx0fSxcblx0XHRcdGNvbW1pdFRyZWU6IGFzeW5jIChfcm9vdCwgdHJlZSwgcGFyZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1pdCA9IGBjb21taXQtJHtjb21taXRDYWxscy5sZW5ndGggKyAxfWA7XG5cdFx0XHRcdGNvbW1pdENhbGxzLnB1c2goeyB0cmVlLCBwYXJlbnQgfSk7XG5cdFx0XHRcdHJldHVybiBjb21taXQ7XG5cdFx0XHR9LFxuXHRcdFx0dXBkYXRlUmVmOiBhc3luYyAoX3Jvb3QsIHJlZiwgb2lkKSA9PiB7IHJlZnMuc2V0KHJlZiwgb2lkKTsgfSxcblx0XHRcdGRlbGV0ZVJlZnM6IGFzeW5jIChfcm9vdCwgZGVsZXRlZFJlZnMpID0+IHsgZGVsZXRlZFJlZnMuZm9yRWFjaChyZWYgPT4gcmVmcy5kZWxldGUocmVmKSk7IH0sXG5cdFx0XHRyZXZQYXJzZTogYXN5bmMgKF9yb290LCByZWYpID0+IHJlZnMuZ2V0KHJlZiksXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZShcblx0XHRcdGRhdGFTZXJ2aWNlLFxuXHRcdFx0bmV3IENoZWNrcG9pbnRUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uod29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHRnaXRTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBjYXB0dXJlID0gc2VydmljZS5jYXB0dXJlVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi0xJywgW3dvcmtpbmdEaXJlY3RvcnldKTtcblx0XHRhd2FpdCBjYXB0dXJlU3RhcnRlZC5wO1xuXHRcdGNvbnN0IGNsZWFudXA6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXHRcdG9uV2lsbERlbGV0ZVNlc3Npb25EYXRhLmZpcmUoe1xuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKV0sXG5cdFx0XHR3YWl0VW50aWw6IHByb21pc2UgPT4gY2xlYW51cC5wdXNoKHByb21pc2UpLFxuXHRcdH0pO1xuXHRcdHJlbGVhc2VDYXB0dXJlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2NhcHR1cmUsIC4uLmNsZWFudXBdKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNhcHR1cmVUdXJuQ2hlY2twb2ludChzZXNzaW9uLCBjaGF0LCAndHVybi0xJywgW3dvcmtpbmdEaXJlY3RvcnldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWl0Q2FsbHMsXG5cdFx0XHRiYXNlbGluZUV4aXN0czogcmVmcy5oYXMoYmFzZWxpbmVSZWYpLFxuXHRcdH0sIHtcblx0XHRcdGNvbW1pdENhbGxzOiBbeyB0cmVlOiAndHVybi1zdGFydC10cmVlJywgcGFyZW50OiB1bmRlZmluZWQgfV0sXG5cdFx0XHRiYXNlbGluZUV4aXN0czogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhIHJldXNlZCBsZWdhY3kgY2hlY2twb2ludCByZWYgYXMgYW4gZW1wdHkgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRhdGFiYXNlLCBwcmV2aW91c1JlZiwgc2Vzc2lvbiwgc2VydmljZSwgd29ya2luZ0RpcmVjdG9yeSB9ID0gY3JlYXRlVGVzdFNlcnZpY2UoYXN5bmMgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBkYXRhYmFzZS5zZXRUdXJuQ2hlY2twb2ludFJlZigndHVybi01JywgcHJldmlvdXNSZWYpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmdldFR1cm5DaGVja3BvaW50UGFpcihzZXNzaW9uLCAndHVybi01Jywgd29ya2luZ0RpcmVjdG9yeSksIHtcblx0XHRcdHBhcmVudDogcHJldmlvdXNSZWYsXG5cdFx0XHRjdXJyZW50OiBwcmV2aW91c1JlZixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZXMgR2l0IGNoZWNrcG9pbnRzIGZvciBjb25jdXJyZW50IGNoYXQgdHVybnMgd2l0aCB0aGUgc2FtZSBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmVlcyA9IFsndHJlZS1hLXN0YXJ0JywgJ3RyZWUtYi1zdGFydCcsICd0cmVlLWItZW5kJywgJ3RyZWUtYS1lbmQnXTtcblx0XHRjb25zdCB7IGNoYXQsIGNvbW1pdENhbGxzLCBzZXNzaW9uLCBzZXJ2aWNlLCB3b3JraW5nRGlyZWN0b3J5IH0gPSBjcmVhdGVUZXN0U2VydmljZShhc3luYyAoKSA9PiB0cmVlcy5zaGlmdCgpKTtcblx0XHRjb25zdCBwZWVyQ2hhdCA9IFVSSS5wYXJzZSgnYWhwLWNoYXQ6Ly9wZWVyL3Nlc3Npb24nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tMScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uLCBwZWVyQ2hhdCwgJ3R1cm4tMScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVybkNoZWNrcG9pbnQoc2Vzc2lvbiwgcGVlckNoYXQsICd0dXJuLTEnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KHNlc3Npb24sIGNoYXQsICd0dXJuLTEnLCBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21taXRDYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsZWQgcGVlciBzdGFydCBjYXB0dXJlIHN0aWxsIGludmFsaWRhdGVzIGFuIGV4aXN0aW5nIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJlZXMgPSBbJ3RyZWUtYS1zdGFydCcsIHVuZGVmaW5lZCwgJ3RyZWUtYS1lbmQnXTtcblx0XHRjb25zdCB7IGNoYXQsIGNvbW1pdENhbGxzLCBzZXNzaW9uLCBzZXJ2aWNlLCB3b3JraW5nRGlyZWN0b3J5IH0gPSBjcmVhdGVUZXN0U2VydmljZShhc3luYyAoKSA9PiB0cmVlcy5zaGlmdCgpKTtcblx0XHRjb25zdCBwZWVyQ2hhdCA9IFVSSS5wYXJzZSgnYWhwLWNoYXQ6Ly9wZWVyL3Nlc3Npb24nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tYScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uLCBwZWVyQ2hhdCwgJ3R1cm4tYicsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYXB0dXJlVHVybkNoZWNrcG9pbnQoc2Vzc2lvbiwgY2hhdCwgJ3R1cm4tYScsIFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1pdENhbGxzLCBbXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyxvQkFBb0I7QUFHN0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0IsMEJBQTBCLDJCQUEyQjtBQUVwRixNQUFNLCtCQUErQixvQkFBb0I7QUFBQSxFQUd4RCxZQUE2Qix1QkFBMkM7QUFDdkUsVUFBTTtBQURzQjtBQUY3QixTQUFpQixpQkFBaUIsb0JBQUksSUFBb0I7QUFBQSxFQUkxRDtBQUFBLEVBRUEsTUFBZSxxQkFBcUIsUUFBZ0IsS0FBNEI7QUFDL0UsU0FBSyxlQUFlLElBQUksUUFBUSxHQUFHO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE1BQWUscUJBQXFCLFFBQTZDO0FBQ2hGLFdBQU8sS0FBSyxlQUFlLElBQUksTUFBTTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxNQUFlLDJCQUF3RDtBQUN0RSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFlLHVCQUEwQztBQUN4RCxXQUFPLENBQUMsS0FBSyx1QkFBdUIsR0FBRyxLQUFLLGVBQWUsT0FBTyxDQUFDLEVBQUUsT0FBTyxDQUFDLFFBQXVCLFFBQVEsTUFBUztBQUFBLEVBQ3RIO0FBQ0Q7QUFFQSxNQUFNLDJDQUEyQyxLQUFpQyxFQUFFO0FB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
