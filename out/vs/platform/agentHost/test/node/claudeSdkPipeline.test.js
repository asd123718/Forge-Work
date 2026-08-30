import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { buildDefaultChatUri } from "../../common/state/sessionState.js";
import { ClaudeSdkPipeline } from "../../node/claude/claudeSdkPipeline.js";
import { SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import { createZeroDiffComputeService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
class FakeWarmQuery {
  constructor() {
    this.asyncDisposeCount = 0;
    this.closeCount = 0;
    this.queryCallCount = 0;
  }
  query(_prompt) {
    this.queryCallCount++;
    return new ImmediatelyDoneQuery();
  }
  close() {
    this.closeCount++;
  }
  async [Symbol.asyncDispose]() {
    this.asyncDisposeCount++;
  }
}
class ImmediatelyDoneQuery {
  [Symbol.asyncIterator]() {
    return this;
  }
  async next() {
    return { done: true, value: void 0 };
  }
  async return() {
    return { done: true, value: void 0 };
  }
  async throw(err) {
    throw err;
  }
  async setModel() {
  }
  async applyFlagSettings(_settings) {
  }
  async setPermissionMode() {
  }
  async setMcpPermissionModeOverride() {
    return {};
  }
  async interrupt() {
    return void 0;
  }
  streamInput() {
    throw new Error("not modeled");
  }
  stopTask() {
    throw new Error("not modeled");
  }
  reloadSkills() {
    throw new Error("not modeled");
  }
  backgroundTasks() {
    throw new Error("not modeled");
  }
  async close() {
  }
  async [Symbol.asyncDispose]() {
  }
  setMaxThinkingTokens() {
    throw new Error("not modeled");
  }
  initializationResult() {
    throw new Error("not modeled");
  }
  reinitialize() {
    throw new Error("not modeled");
  }
  supportedCommands() {
    throw new Error("not modeled");
  }
  supportedModels() {
    throw new Error("not modeled");
  }
  supportedAgents() {
    throw new Error("not modeled");
  }
  mcpServerStatus() {
    throw new Error("not modeled");
  }
  getContextUsage() {
    throw new Error("not modeled");
  }
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET() {
    throw new Error("not modeled");
  }
  reloadPlugins() {
    throw new Error("not modeled");
  }
  accountInfo() {
    throw new Error("not modeled");
  }
  rewindFiles() {
    throw new Error("not modeled");
  }
  readFile() {
    throw new Error("not modeled");
  }
  seedReadState() {
    throw new Error("not modeled");
  }
  reconnectMcpServer() {
    throw new Error("not modeled");
  }
  toggleMcpServer() {
    throw new Error("not modeled");
  }
  setMcpServers() {
    throw new Error("not modeled");
  }
  setSlashCommandHooks() {
    throw new Error("not modeled");
  }
  getServerInfo() {
    throw new Error("not modeled");
  }
  getMcpResources() {
    throw new Error("not modeled");
  }
  readMcpResource() {
    throw new Error("not modeled");
  }
}
class RecordingQuery extends ImmediatelyDoneQuery {
  constructor(_flagSettings, _signal) {
    super();
    this._flagSettings = _flagSettings;
    this._signal = _signal;
  }
  next() {
    if (this._signal.aborted) {
      return Promise.resolve({ done: true, value: void 0 });
    }
    return new Promise((resolve) => {
      this._signal.addEventListener("abort", () => resolve({ done: true, value: void 0 }), { once: true });
    });
  }
  async applyFlagSettings(settings) {
    this._flagSettings.push(settings);
  }
}
class RecordingWarmQuery extends FakeWarmQuery {
  constructor(_signal) {
    super();
    this._signal = _signal;
    this.flagSettings = [];
  }
  query(_prompt) {
    this.queryCallCount++;
    return new RecordingQuery(this.flagSettings, this._signal);
  }
}
function makeControllableQuery() {
  let ended = false;
  let wake;
  const q = Object.assign(new ImmediatelyDoneQuery(), {
    nextCallCount: 0,
    end() {
      ended = true;
      wake?.();
      wake = void 0;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      this.nextCallCount++;
      while (!ended) {
        await new Promise((resolve) => {
          wake = resolve;
        });
      }
      return { done: true, value: void 0 };
    },
    async return() {
      return { done: true, value: void 0 };
    },
    async throw(err) {
      throw err;
    }
  });
  return q;
}
class ControllableWarmQuery extends FakeWarmQuery {
  constructor() {
    super(...arguments);
    this.queries = [];
  }
  query(_prompt) {
    this.queryCallCount++;
    const q = makeControllableQuery();
    this.queries.push(q);
    return q;
  }
}
function createPipeline(disposables, warmOrFactory = new FakeWarmQuery()) {
  const controller = new AbortController();
  const warm = typeof warmOrFactory === "function" ? warmOrFactory(controller.signal) : warmOrFactory;
  const fileService = disposables.add(new FileService(new NullLogService()));
  const fs = disposables.add(new InMemoryFileSystemProvider());
  disposables.add(fileService.registerProvider("file", fs));
  const db = new TestSessionDatabase();
  const dbRef = { object: db, dispose: () => {
  } };
  const services = new ServiceCollection(
    [ILogService, new NullLogService()],
    [IFileService, fileService],
    [IDiffComputeService, createZeroDiffComputeService()]
  );
  const inst = disposables.add(new InstantiationService(services));
  const subagents = disposables.add(new SubagentRegistry());
  const pipeline = disposables.add(inst.createInstance(
    ClaudeSdkPipeline,
    "sess-1",
    URI.parse(buildDefaultChatUri("claude:/sess-1")),
    URI.parse("claude:/sess-1"),
    warm,
    controller,
    dbRef,
    subagents,
    void 0
  ));
  return { pipeline, warm, controller };
}
function makePrompt(uuid, text = uuid) {
  return {
    type: "user",
    uuid: makeUuid(uuid),
    parent_tool_use_id: null,
    message: { role: "user", content: text }
  };
}
function makeUuid(label) {
  const pad = (s, n) => s.padEnd(n, "0").slice(0, n);
  return `${pad(label, 8)}-0000-0000-0000-000000000000`;
}
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}
suite("ClaudeSdkPipeline", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("reloadPlugins", () => {
    test("forwards to the SDK Query", async () => {
      let reloadCallCount = 0;
      class WarmWithReload extends FakeWarmQuery {
        query(_prompt) {
          this.queryCallCount++;
          const q = new ImmediatelyDoneQuery();
          q.reloadPlugins = async () => {
            reloadCallCount++;
            return { commands: [] };
          };
          return q;
        }
      }
      const controller = new AbortController();
      const warm = new WarmWithReload();
      const fileService = disposables.add(new FileService(new NullLogService()));
      const fs = disposables.add(new InMemoryFileSystemProvider());
      disposables.add(fileService.registerProvider("file", fs));
      const db = new TestSessionDatabase();
      const dbRef = { object: db, dispose: () => {
      } };
      const services = new ServiceCollection(
        [ILogService, new NullLogService()],
        [IFileService, fileService],
        [IDiffComputeService, createZeroDiffComputeService()]
      );
      const inst = disposables.add(new InstantiationService(services));
      const subagents = disposables.add(new SubagentRegistry());
      const pipeline = disposables.add(inst.createInstance(
        ClaudeSdkPipeline,
        "sess-2",
        URI.parse(buildDefaultChatUri("claude:/sess-2")),
        URI.parse("claude:/sess-2"),
        warm,
        controller,
        dbRef,
        subagents,
        void 0
      ));
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await Promise.resolve();
      await pipeline.reloadPlugins();
      assert.strictEqual(reloadCallCount, 1);
    });
  });
  suite("initial state", () => {
    test("isResumed starts false and isAborted starts false", () => {
      const { pipeline } = createPipeline(disposables);
      assert.strictEqual(pipeline.isResumed, false);
      assert.strictEqual(pipeline.isAborted, false);
    });
  });
  suite("abort", () => {
    test("flips the controller signal and isAborted", () => {
      const { pipeline, controller } = createPipeline(disposables);
      pipeline.abort();
      assert.strictEqual(controller.signal.aborted, true);
      assert.strictEqual(pipeline.isAborted, true);
    });
    test("is idempotent", () => {
      const { pipeline, controller } = createPipeline(disposables);
      pipeline.abort();
      pipeline.abort();
      assert.strictEqual(controller.signal.aborted, true);
    });
    test("send after abort with no rematerializer attached throws a clear error (not a silent hang)", async () => {
      const { pipeline } = createPipeline(disposables);
      pipeline.abort();
      await pipeline.send(makePrompt("p1"), "turn-A").then(
        () => assert.fail("expected rejection"),
        (err) => {
          assert.match(String(err), /no rematerializer attached/);
        }
      );
    });
  });
  suite("rematerializer wiring", () => {
    test('after abort, send invokes the attached rematerializer in "recover" mode and clears the rebind flag', async () => {
      const { pipeline } = createPipeline(disposables);
      const reasons = [];
      const built = [];
      const rematerializer = async (reason) => {
        reasons.push(reason);
        const ctl = new AbortController();
        const warm = new FakeWarmQuery();
        built.push({ warm, controller: ctl });
        return { warm, abortController: ctl };
      };
      pipeline.attachRematerializer(rematerializer);
      pipeline.abort();
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await Promise.resolve();
      await Promise.resolve();
      assert.deepStrictEqual(reasons, ["recover"]);
      assert.strictEqual(built.length, 1);
      assert.strictEqual(pipeline.isAborted, false, "rebind installed a fresh, non-aborted controller");
    });
    test("rematerializer rejection propagates from send", async () => {
      const { pipeline } = createPipeline(disposables);
      const rebuildErr = new Error("rematerialize failed");
      let calls = 0;
      pipeline.attachRematerializer(async () => {
        calls++;
        throw rebuildErr;
      });
      pipeline.abort();
      await pipeline.send(makePrompt("p1"), "turn-A").then(
        () => assert.fail("expected rejection"),
        (err) => assert.strictEqual(err, rebuildErr)
      );
      assert.strictEqual(calls, 1);
    });
    test("abort issued while the rematerializer is still resolving cancels the freshly-built controller (rebind-window race)", async () => {
      const { pipeline } = createPipeline(disposables);
      const releaseRebuild = new DeferredPromise();
      const built = [];
      pipeline.attachRematerializer(async () => {
        const pair = await releaseRebuild.p;
        built.push(pair);
        return { warm: pair.warm, abortController: pair.controller };
      });
      pipeline.abort();
      const sendPromise = pipeline.send(makePrompt("p1"), "turn-A");
      await Promise.resolve();
      pipeline.abort();
      const freshController = new AbortController();
      releaseRebuild.complete({ warm: new FakeWarmQuery(), controller: freshController });
      await sendPromise.then(
        () => assert.fail("expected cancellation after rebind-window abort"),
        (err) => assert.ok(isCancellationError(err), `expected CancellationError, got ${err}`)
      );
      assert.strictEqual(built.length, 1);
      assert.strictEqual(built[0].controller.signal.aborted, true, "fresh controller cancelled before being installed");
      assert.strictEqual(pipeline.isAborted, true);
    });
    test("a rebind hands the consumer loop off to the new query so the post-rebind turn is not lost", async () => {
      const warm1 = new ControllableWarmQuery();
      const { pipeline } = createPipeline(disposables, warm1);
      pipeline.send(makePrompt("p1"), "turn-1").catch(() => {
      });
      await flushMicrotasks();
      const q1 = warm1.queries[0];
      assert.ok(q1.nextCallCount > 0, "consumer loop drains Q1");
      const warm2 = new ControllableWarmQuery();
      pipeline.attachRematerializer(async () => ({ warm: warm2, abortController: new AbortController() }));
      await pipeline.rebindForRestart();
      const q2 = warm2.queries[0];
      assert.strictEqual(q2.nextCallCount, 0, "new query not drained yet \u2014 the old loop is still running");
      q1.end();
      await flushMicrotasks();
      assert.ok(q2.nextCallCount > 0, "consumer loop handed off to the new query after the old one ended");
      q2.end();
      await flushMicrotasks();
    });
  });
  suite("seedCurrentConfig", () => {
    test("seeded values match the post-materialize SDK state, so first send does NOT push a redundant setModel/applyFlagSettings/setPermissionMode", async () => {
      const { pipeline, warm } = createPipeline(disposables);
      pipeline.seedCurrentConfig("claude-sonnet-4-5", "high", "default");
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await Promise.resolve();
      assert.strictEqual(warm.queryCallCount, 1);
    });
  });
  suite("setEffort", () => {
    async function seededHighThenBind(disposables2) {
      let warm;
      const { pipeline } = createPipeline(disposables2, (signal) => warm = new RecordingWarmQuery(signal));
      pipeline.seedCurrentConfig("claude-opus-4-7", "high", "default");
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await flushMicrotasks();
      assert.strictEqual(warm.queryCallCount, 1, "query should be bound after send");
      warm.flagSettings.length = 0;
      return { pipeline, warm };
    }
    test("switching to a model with no effort clears the stale effort via applyFlagSettings({ effortLevel: null })", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      await pipeline.setEffort(void 0);
      assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: null }]);
    });
    test("switching between two effort-capable levels pushes the new value", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      await pipeline.setEffort("low");
      assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: "low" }]);
    });
    test("re-applying the already-applied effort is a no-op (no redundant SDK call)", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      await pipeline.setEffort("high");
      assert.deepStrictEqual(warm.flagSettings, []);
    });
    test("clearing an already-clear effort is a no-op", async () => {
      let warm;
      const { pipeline } = createPipeline(disposables, (signal) => warm = new RecordingWarmQuery(signal));
      pipeline.seedCurrentConfig("claude-haiku-4-5", void 0, "default");
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await flushMicrotasks();
      warm.flagSettings.length = 0;
      await pipeline.setEffort(void 0);
      assert.deepStrictEqual(warm.flagSettings, []);
    });
    test("setEffort while awaiting rebind (post-abort) is buffered, not pushed to the dead query, then replayed on rebind", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      pipeline.abort();
      warm.flagSettings.length = 0;
      await pipeline.setEffort("low");
      assert.deepStrictEqual(warm.flagSettings, [], "effort must not be pushed while needsRebind");
      let warm2;
      pipeline.attachRematerializer(async () => {
        const ctl = new AbortController();
        warm2 = new RecordingWarmQuery(ctl.signal);
        return { warm: warm2, abortController: ctl };
      });
      pipeline.send(makePrompt("p2"), "turn-B").catch(() => {
      });
      await flushMicrotasks();
      assert.deepStrictEqual(warm2.flagSettings, [{ effortLevel: "low" }], "buffered effort replayed on the rebound query");
    });
  });
  suite("dispose", () => {
    test("disposing the pipeline aborts the controller and async-disposes the WarmQuery", async () => {
      const store = new DisposableStore();
      const { pipeline, warm, controller } = createPipeline(store);
      assert.strictEqual(controller.signal.aborted, false);
      assert.strictEqual(warm.asyncDisposeCount, 0);
      pipeline.dispose();
      await Promise.resolve();
      assert.strictEqual(controller.signal.aborted, true);
      assert.strictEqual(warm.asyncDisposeCount, 1);
      store.dispose();
    });
  });
  suite("CancellationError plumbing", () => {
    test("abort + send rejects with a CancellationError-shaped error after the rematerializer runs (when rematerializer rejects with one)", async () => {
      const { pipeline } = createPipeline(disposables);
      pipeline.attachRematerializer(async () => {
        const err = new Error("Canceled");
        err.name = "Canceled";
        throw err;
      });
      pipeline.abort();
      await pipeline.send(makePrompt("p1"), "turn-A").then(
        () => assert.fail("expected rejection"),
        (err) => assert.ok(isCancellationError(err), `expected cancellation, got ${err}`)
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVTZGtQaXBlbGluZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBRdWVyeSwgU0RLQ29udHJvbEludGVycnVwdFJlc3BvbnNlLCBTREtNZXNzYWdlLCBTREtVc2VyTWVzc2FnZSwgV2FybVF1ZXJ5IH0gZnJvbSAnQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrJztcblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENsYXVkZVNka1BpcGVsaW5lLCBJUmVtYXRlcmlhbGl6ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVTZGtQaXBlbGluZS5qcyc7XG5pbXBvcnQgeyBTdWJhZ2VudFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVaZXJvRGlmZkNvbXB1dGVTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5cbi8vID09PT09IFRlc3QgZG91YmxlcyA9PT09PVxuXG4vKipcbiAqIGBXYXJtUXVlcnlgIHN0dWIgdGhhdCByZWNvcmRzIGBxdWVyeSgpYCBjYWxscyBhbmQgYXN5bmMtZGlzcG9zZSBjb3VudC5cbiAqIFRlc3RzIGluIHRoaXMgZmlsZSBkZWxpYmVyYXRlbHkgZG8gTk9UIGRyaXZlIHRoZSBjb25zdW1lciBsb29wIFx1MjAxNCB0aGV5XG4gKiBleGVyY2lzZSB0aGUgc3luY2hyb25vdXMgbGlmZWN5Y2xlIHN1cmZhY2UgKGFib3J0LCBkaXNwb3NlLCByZWJpbmRcbiAqIGdhdGluZykuIERyaXZpbmcgdGhlIFNESyBtZXNzYWdlIHN0cmVhbSBlbmQtdG8tZW5kIGlzIGNvdmVyZWQgYnlcbiAqIGBjbGF1ZGVBZ2VudC50ZXN0LnRzYC5cbiAqXG4gKiBgcXVlcnkoKWAgcmV0dXJucyBhIHN0dWIgYFF1ZXJ5YCB3aG9zZSBhc3luYyBpdGVyYXRvciBpbW1lZGlhdGVseVxuICogcmVzb2x2ZXMgZG9uZS4gVGhhdCBrZWVwcyB0aGUgcGlwZWxpbmUncyBjb25zdW1lciBsb29wIGZyb20gaGFuZ2luZ1xuICogZXZlbiB3aGVuIGEgdGVzdCBoYXBwZW5zIHRvIGNhbGwgYHNlbmQoKWAuXG4gKi9cbmNsYXNzIEZha2VXYXJtUXVlcnkgaW1wbGVtZW50cyBXYXJtUXVlcnkge1xuXHRhc3luY0Rpc3Bvc2VDb3VudCA9IDA7XG5cdGNsb3NlQ291bnQgPSAwO1xuXHRxdWVyeUNhbGxDb3VudCA9IDA7XG5cblx0cXVlcnkoX3Byb21wdDogc3RyaW5nIHwgQXN5bmNJdGVyYWJsZTxTREtVc2VyTWVzc2FnZT4pOiBRdWVyeSB7XG5cdFx0dGhpcy5xdWVyeUNhbGxDb3VudCsrO1xuXHRcdHJldHVybiBuZXcgSW1tZWRpYXRlbHlEb25lUXVlcnkoKTtcblx0fVxuXHRjbG9zZSgpOiB2b2lkIHsgdGhpcy5jbG9zZUNvdW50Kys7IH1cblx0YXN5bmMgW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCk6IFByb21pc2U8dm9pZD4geyB0aGlzLmFzeW5jRGlzcG9zZUNvdW50Kys7IH1cbn1cblxuY2xhc3MgSW1tZWRpYXRlbHlEb25lUXVlcnkgaW1wbGVtZW50cyBRdWVyeSB7XG5cdFtTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKTogdGhpcyB7IHJldHVybiB0aGlzOyB9XG5cdGFzeW5jIG5leHQoKTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxuZXZlciwgdm9pZD4+IHsgcmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9OyB9XG5cdGFzeW5jIHJldHVybigpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PG5ldmVyLCB2b2lkPj4geyByZXR1cm4geyBkb25lOiB0cnVlLCB2YWx1ZTogdW5kZWZpbmVkIH07IH1cblx0YXN5bmMgdGhyb3coZXJyOiB1bmtub3duKTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxuZXZlciwgdm9pZD4+IHsgdGhyb3cgZXJyOyB9XG5cdGFzeW5jIHNldE1vZGVsKCk6IFByb21pc2U8dm9pZD4geyAvKiBub3QgZXhlcmNpc2VkIGhlcmUgKi8gfVxuXHRhc3luYyBhcHBseUZsYWdTZXR0aW5ncyhfc2V0dGluZ3M6IFBhcmFtZXRlcnM8UXVlcnlbJ2FwcGx5RmxhZ1NldHRpbmdzJ10+WzBdKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vdCBleGVyY2lzZWQgaGVyZSAqLyB9XG5cdGFzeW5jIHNldFBlcm1pc3Npb25Nb2RlKCk6IFByb21pc2U8dm9pZD4geyAvKiBub3QgZXhlcmNpc2VkIGhlcmUgKi8gfVxuXHRhc3luYyBzZXRNY3BQZXJtaXNzaW9uTW9kZU92ZXJyaWRlKCk6IFByb21pc2U8eyB3YXJuaW5nPzogc3RyaW5nIH0+IHsgcmV0dXJuIHt9OyB9XG5cdGFzeW5jIGludGVycnVwdCgpOiBQcm9taXNlPFNES0NvbnRyb2xJbnRlcnJ1cHRSZXNwb25zZSB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdHN0cmVhbUlucHV0KCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN0b3BUYXNrKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHJlbG9hZFNraWxscygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRiYWNrZ3JvdW5kVGFza3MoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vdCBleGVyY2lzZWQgaGVyZSAqLyB9XG5cdGFzeW5jIFtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpOiBQcm9taXNlPHZvaWQ+IHsgLyogbm90IGV4ZXJjaXNlZCBoZXJlICovIH1cblx0c2V0TWF4VGhpbmtpbmdUb2tlbnMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0aW5pdGlhbGl6YXRpb25SZXN1bHQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVpbml0aWFsaXplKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN1cHBvcnRlZENvbW1hbmRzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN1cHBvcnRlZE1vZGVscygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdXBwb3J0ZWRBZ2VudHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0bWNwU2VydmVyU3RhdHVzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGdldENvbnRleHRVc2FnZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHR1c2FnZV9FWFBFUklNRU5UQUxfTUFZX0NIQU5HRV9ET19OT1RfUkVMWV9PTl9USElTX0FQSV9ZRVQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVsb2FkUGx1Z2lucygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRhY2NvdW50SW5mbygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZXdpbmRGaWxlcygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWFkRmlsZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzZWVkUmVhZFN0YXRlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHJlY29ubmVjdE1jcFNlcnZlcigpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHR0b2dnbGVNY3BTZXJ2ZXIoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TWNwU2VydmVycygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzZXRTbGFzaENvbW1hbmRIb29rcygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRnZXRTZXJ2ZXJJbmZvKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGdldE1jcFJlc291cmNlcygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWFkTWNwUmVzb3VyY2UoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cbn1cblxuLyoqXG4gKiBgV2FybVF1ZXJ5YCB3aG9zZSBib3VuZCBgUXVlcnlgIHJlY29yZHMgZXZlcnkgYGFwcGx5RmxhZ1NldHRpbmdzYCBjYWxsIHNvXG4gKiB0ZXN0cyBjYW4gYXNzZXJ0IHRoZSBleGFjdCBlZmZvcnQgcGF5bG9hZCBwdXNoZWQgdG8gdGhlIFNESyAoaW5jbHVkaW5nIHRoZVxuICogYHsgZWZmb3J0TGV2ZWw6IG51bGwgfWAgY2xlYXIgZW1pdHRlZCB3aGVuIHN3aXRjaGluZyB0byBhIG1vZGVsIHRoYXQgZG9lc1xuICogbm90IHN1cHBvcnQgcmVhc29uaW5nIGVmZm9ydCkuXG4gKlxuICogVW5saWtlIHtAbGluayBJbW1lZGlhdGVseURvbmVRdWVyeX0sIGl0cyBhc3luYyBpdGVyYXRvciBCTE9DS1MgcmF0aGVyIHRoYW5cbiAqIGVuZGluZyBpbW1lZGlhdGVseSBcdTIwMTQgb3RoZXJ3aXNlIHRoZSBjb25zdW1lciBsb29wIHdvdWxkIGhpdCBcInN0cmVhbSBlbmRlZFxuICogd2l0aG91dCBhIHJlc3VsdFwiLCBudWxsIG91dCBgX3F1ZXJ5YCwgYW5kIHRoZSBydW50aW1lIHNldHRlcnMgd291bGQgbm8tb3BcbiAqIGJlZm9yZSB0aGUgdGVzdCBjYW4gb2JzZXJ2ZSB0aGVtLiBBIGJsb2NraW5nIGl0ZXJhdG9yIG1vZGVscyBhIGxpdmUgdHVybi5cbiAqXG4gKiBUaGUgYmxvY2sgaXMgYWJvcnQtYXdhcmU6IGBuZXh0KClgIHJlc29sdmVzIGB7IGRvbmU6IHRydWUgfWAgb25jZSB0aGVcbiAqIHBpcGVsaW5lJ3Mge0BsaW5rIEFib3J0Q29udHJvbGxlcn0gZmlyZXMgKG9uIGRpc3Bvc2UvdGVhcmRvd24pLCBzbyB0aGVcbiAqIGNvbnN1bWVyIGxvb3AgYW5kIHRoZSBmaXJlLWFuZC1mb3JnZXQgYHNlbmQoKWAgcHJvbWlzZSB1bndpbmQgaW5zdGVhZCBvZlxuICogcGlubmluZyB0aGUgcGlwZWxpbmUvcXVlcnkgZ3JhcGggZm9yIHRoZSByZXN0IG9mIHRoZSBydW4uXG4gKi9cbmNsYXNzIFJlY29yZGluZ1F1ZXJ5IGV4dGVuZHMgSW1tZWRpYXRlbHlEb25lUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mbGFnU2V0dGluZ3M6IEFycmF5PFBhcmFtZXRlcnM8UXVlcnlbJ2FwcGx5RmxhZ1NldHRpbmdzJ10+WzBdPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpIHsgc3VwZXIoKTsgfVxuXHRvdmVycmlkZSBuZXh0KCk6IFByb21pc2U8SXRlcmF0b3JSZXN1bHQ8bmV2ZXIsIHZvaWQ+PiB7XG5cdFx0aWYgKHRoaXMuX3NpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PG5ldmVyLCB2b2lkPj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHR0aGlzLl9zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCAoKSA9PiByZXNvbHZlKHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9KSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIGFwcGx5RmxhZ1NldHRpbmdzKHNldHRpbmdzOiBQYXJhbWV0ZXJzPFF1ZXJ5WydhcHBseUZsYWdTZXR0aW5ncyddPlswXSk6IFByb21pc2U8dm9pZD4geyB0aGlzLl9mbGFnU2V0dGluZ3MucHVzaChzZXR0aW5ncyk7IH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nV2FybVF1ZXJ5IGV4dGVuZHMgRmFrZVdhcm1RdWVyeSB7XG5cdHJlYWRvbmx5IGZsYWdTZXR0aW5nczogQXJyYXk8UGFyYW1ldGVyczxRdWVyeVsnYXBwbHlGbGFnU2V0dGluZ3MnXT5bMF0+ID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfc2lnbmFsOiBBYm9ydFNpZ25hbCkgeyBzdXBlcigpOyB9XG5cblx0b3ZlcnJpZGUgcXVlcnkoX3Byb21wdDogc3RyaW5nIHwgQXN5bmNJdGVyYWJsZTxTREtVc2VyTWVzc2FnZT4pOiBRdWVyeSB7XG5cdFx0dGhpcy5xdWVyeUNhbGxDb3VudCsrO1xuXHRcdHJldHVybiBuZXcgUmVjb3JkaW5nUXVlcnkodGhpcy5mbGFnU2V0dGluZ3MsIHRoaXMuX3NpZ25hbCk7XG5cdH1cbn1cblxuLyoqIEEge0BsaW5rIFF1ZXJ5fS1zaGFwZWQgc3R1YiB3aG9zZSBhc3luYyBzdHJlYW0gdGhlIHRlc3QgZW5kcyBvbiBkZW1hbmQuICovXG50eXBlIElDb250cm9sbGFibGVRdWVyeSA9IFF1ZXJ5ICYge1xuXHQvKiogRW5kcyB0aGUgc3RyZWFtIChtb2RlbHMgYSBkaXNwb3NlLWRyaXZlbiBjbG9zZSBvZiB0aGUgdW5kZXJseWluZyBxdWVyeSkuICovXG5cdGVuZCgpOiB2b2lkO1xuXHQvKiogSG93IG1hbnkgdGltZXMgdGhlIGNvbnN1bWVyIGxvb3AgaGFzIHB1bGxlZCBmcm9tIHRoaXMgcXVlcnkncyBpdGVyYXRvci4gKi9cblx0cmVhZG9ubHkgbmV4dENhbGxDb3VudDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBCdWlsZHMgYSB7QGxpbmsgUXVlcnl9IHdob3NlIGFzeW5jIGl0ZXJhdG9yIGJsb2NrcyAobW9kZWxsaW5nIGEgbGl2ZSB0dXJuKVxuICogdW50aWwge0BsaW5rIElDb250cm9sbGFibGVRdWVyeS5lbmR9LCBhbmQgcmVjb3JkcyBob3cgbWFueSB0aW1lcyB0aGUgY29uc3VtZXJcbiAqIGxvb3AgcHVsbGVkIGZyb20gaXQuIExldHMgYSB0ZXN0IGhvbGQgdGhlIGNvbnN1bWVyIGxvb3Agb24gb25lIHF1ZXJ5IHdoaWxlIGFcbiAqIHJlYmluZCBzd2FwcyBpbiB0aGUgbmV4dCwgdGhlbiBvYnNlcnZlIHdoZXRoZXIgdGhlIG5ldyBxdWVyeSBnZXRzIGRyYWluZWQuXG4gKi9cbmZ1bmN0aW9uIG1ha2VDb250cm9sbGFibGVRdWVyeSgpOiBJQ29udHJvbGxhYmxlUXVlcnkge1xuXHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0bGV0IHdha2U6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgcSA9IE9iamVjdC5hc3NpZ24obmV3IEltbWVkaWF0ZWx5RG9uZVF1ZXJ5KCksIHtcblx0XHRuZXh0Q2FsbENvdW50OiAwLFxuXHRcdGVuZCgpOiB2b2lkIHsgZW5kZWQgPSB0cnVlOyB3YWtlPy4oKTsgd2FrZSA9IHVuZGVmaW5lZDsgfSxcblx0XHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCkgeyByZXR1cm4gdGhpczsgfSxcblx0XHRhc3luYyBuZXh0KHRoaXM6IHsgbmV4dENhbGxDb3VudDogbnVtYmVyIH0pOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PFNES01lc3NhZ2UsIHZvaWQ+PiB7XG5cdFx0XHR0aGlzLm5leHRDYWxsQ291bnQrKztcblx0XHRcdHdoaWxlICghZW5kZWQpIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHdha2UgPSByZXNvbHZlOyB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHR9LFxuXHRcdGFzeW5jIHJldHVybigpIHsgcmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9OyB9LFxuXHRcdGFzeW5jIHRocm93KGVycjogdW5rbm93bikgeyB0aHJvdyBlcnI7IH0sXG5cdH0pO1xuXHRyZXR1cm4gcSBhcyB1bmtub3duIGFzIElDb250cm9sbGFibGVRdWVyeTtcbn1cblxuLyoqIHtAbGluayBXYXJtUXVlcnl9IHRoYXQgaGFuZHMgb3V0IHtAbGluayBtYWtlQ29udHJvbGxhYmxlUXVlcnl9IGluc3RhbmNlcyBhbmQgcmVjb3JkcyB0aGVtLiAqL1xuY2xhc3MgQ29udHJvbGxhYmxlV2FybVF1ZXJ5IGV4dGVuZHMgRmFrZVdhcm1RdWVyeSB7XG5cdHJlYWRvbmx5IHF1ZXJpZXM6IElDb250cm9sbGFibGVRdWVyeVtdID0gW107XG5cblx0b3ZlcnJpZGUgcXVlcnkoX3Byb21wdDogc3RyaW5nIHwgQXN5bmNJdGVyYWJsZTxTREtVc2VyTWVzc2FnZT4pOiBRdWVyeSB7XG5cdFx0dGhpcy5xdWVyeUNhbGxDb3VudCsrO1xuXHRcdGNvbnN0IHEgPSBtYWtlQ29udHJvbGxhYmxlUXVlcnkoKTtcblx0XHR0aGlzLnF1ZXJpZXMucHVzaChxKTtcblx0XHRyZXR1cm4gcTtcblx0fVxufVxuXG4vLyA9PT09PSBIYXJuZXNzID09PT09XG5cbmludGVyZmFjZSBJUGlwZWxpbmVIYXJuZXNzIHtcblx0cmVhZG9ubHkgcGlwZWxpbmU6IENsYXVkZVNka1BpcGVsaW5lO1xuXHRyZWFkb25seSB3YXJtOiBGYWtlV2FybVF1ZXJ5O1xuXHRyZWFkb25seSBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXI7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBpcGVsaW5lKFxuXHRkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPixcblx0d2FybU9yRmFjdG9yeTogRmFrZVdhcm1RdWVyeSB8ICgoc2lnbmFsOiBBYm9ydFNpZ25hbCkgPT4gRmFrZVdhcm1RdWVyeSkgPSBuZXcgRmFrZVdhcm1RdWVyeSgpLFxuKTogSVBpcGVsaW5lSGFybmVzcyB7XG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdGNvbnN0IHdhcm0gPSB0eXBlb2Ygd2FybU9yRmFjdG9yeSA9PT0gJ2Z1bmN0aW9uJyA/IHdhcm1PckZhY3RvcnkoY29udHJvbGxlci5zaWduYWwpIDogd2FybU9yRmFjdG9yeTtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdGNvbnN0IGZzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBmcykpO1xuXG5cdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0Y29uc3QgZGJSZWY6IElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gPSB7IG9iamVjdDogZGIsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXG5cdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFtJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCldLFxuXHRcdFtJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlXSxcblx0XHRbSURpZmZDb21wdXRlU2VydmljZSwgY3JlYXRlWmVyb0RpZmZDb21wdXRlU2VydmljZSgpXSxcblx0KTtcblx0Y29uc3QgaW5zdDogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRjb25zdCBzdWJhZ2VudHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN1YmFnZW50UmVnaXN0cnkoKSk7XG5cdGNvbnN0IHBpcGVsaW5lID0gZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q2xhdWRlU2RrUGlwZWxpbmUsXG5cdFx0J3Nlc3MtMScsXG5cdFx0VVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NsYXVkZTovc2Vzcy0xJykpLFxuXHRcdFVSSS5wYXJzZSgnY2xhdWRlOi9zZXNzLTEnKSxcblx0XHR3YXJtLFxuXHRcdGNvbnRyb2xsZXIsXG5cdFx0ZGJSZWYsXG5cdFx0c3ViYWdlbnRzLFxuXHRcdHVuZGVmaW5lZCxcblx0KSk7XG5cdHJldHVybiB7IHBpcGVsaW5lLCB3YXJtLCBjb250cm9sbGVyIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9tcHQodXVpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcgPSB1dWlkKTogU0RLVXNlck1lc3NhZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICd1c2VyJyxcblx0XHR1dWlkOiBtYWtlVXVpZCh1dWlkKSxcblx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHRleHQgfSxcblx0fTtcbn1cblxuLyoqIEJ1aWxkIGEgU0RLLXNoYXBlZCBVVUlEIGZyb20gYSBzaG9ydCBsYWJlbCBzbyB0ZXN0IGlkcyBzdGF5IHJlYWRhYmxlLiAqL1xuZnVuY3Rpb24gbWFrZVV1aWQobGFiZWw6IHN0cmluZyk6IGAke3N0cmluZ30tJHtzdHJpbmd9LSR7c3RyaW5nfS0ke3N0cmluZ30tJHtzdHJpbmd9YCB7XG5cdGNvbnN0IHBhZCA9IChzOiBzdHJpbmcsIG46IG51bWJlcikgPT4gcy5wYWRFbmQobiwgJzAnKS5zbGljZSgwLCBuKTtcblx0cmV0dXJuIGAke3BhZChsYWJlbCwgOCl9LTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMGA7XG59XG5cbi8qKlxuICogTGV0IHRoZSBwaXBlbGluZSdzIGZpcmUtYW5kLWZvcmdldCBgc2VuZCgpYCBydW4gZmFyIGVub3VnaCB0byBiaW5kIHRoZVxuICogUXVlcnkgYW5kIGZpbmlzaCBpdHMgc3luY2hyb25vdXMgYF9yZXBsYXlDdXJyZW50Q29uZmlnYCAoYSBuby1vcCB3aGVuIHRoZVxuICogc2VlZGVkIGNvbmZpZyBhbHJlYWR5IG1hdGNoZXMpLiBBIGZldyBtaWNyb3Rhc2sgdHVybnMgaXMgZW5vdWdoOyB0aGUgc3R1YlxuICogUXVlcnkgbmV2ZXIgYXdhaXRzIHJlYWwgSS9PLlxuICovXG5hc3luYyBmdW5jdGlvbiBmbHVzaE1pY3JvdGFza3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuc3VpdGUoJ0NsYXVkZVNka1BpcGVsaW5lJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3JlbG9hZFBsdWdpbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyB0byB0aGUgU0RLIFF1ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHJlbG9hZENhbGxDb3VudCA9IDA7XG5cdFx0XHRjbGFzcyBXYXJtV2l0aFJlbG9hZCBleHRlbmRzIEZha2VXYXJtUXVlcnkge1xuXHRcdFx0XHRvdmVycmlkZSBxdWVyeShfcHJvbXB0OiBzdHJpbmcgfCBBc3luY0l0ZXJhYmxlPFNES1VzZXJNZXNzYWdlPik6IFF1ZXJ5IHtcblx0XHRcdFx0XHR0aGlzLnF1ZXJ5Q2FsbENvdW50Kys7XG5cdFx0XHRcdFx0Y29uc3QgcSA9IG5ldyBJbW1lZGlhdGVseURvbmVRdWVyeSgpO1xuXHRcdFx0XHRcdChxIGFzIHVua25vd24gYXMgeyByZWxvYWRQbHVnaW5zOiAoKSA9PiBQcm9taXNlPHsgY29tbWFuZHM6IHsgbmFtZTogc3RyaW5nIH1bXSB9PiB9KS5yZWxvYWRQbHVnaW5zID1cblx0XHRcdFx0XHRcdGFzeW5jICgpID0+IHsgcmVsb2FkQ2FsbENvdW50Kys7IHJldHVybiB7IGNvbW1hbmRzOiBbXSB9OyB9O1xuXHRcdFx0XHRcdHJldHVybiBxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0Y29uc3Qgd2FybSA9IG5ldyBXYXJtV2l0aFJlbG9hZCgpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBmcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGZzKSk7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBkYlJlZjogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9IHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0XHRcdFtJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlXSxcblx0XHRcdFx0W0lEaWZmQ29tcHV0ZVNlcnZpY2UsIGNyZWF0ZVplcm9EaWZmQ29tcHV0ZVNlcnZpY2UoKV0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaW5zdDogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXHRcdFx0Y29uc3QgcGlwZWxpbmUgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2xhdWRlU2RrUGlwZWxpbmUsXG5cdFx0XHRcdCdzZXNzLTInLFxuXHRcdFx0XHRVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaSgnY2xhdWRlOi9zZXNzLTInKSksXG5cdFx0XHRcdFVSSS5wYXJzZSgnY2xhdWRlOi9zZXNzLTInKSxcblx0XHRcdFx0d2FybSxcblx0XHRcdFx0Y29udHJvbGxlcixcblx0XHRcdFx0ZGJSZWYsXG5cdFx0XHRcdHN1YmFnZW50cyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KSk7XG5cdFx0XHQvLyBCaW5kIHRoZSBxdWVyeSBieSBpc3N1aW5nIGEgc2VuZCAoaXRlcmF0b3IgY2xvc2VzIGltbWVkaWF0ZWx5KS5cblx0XHRcdHBpcGVsaW5lLnNlbmQobWFrZVByb21wdCgncDEnKSwgJ3R1cm4tQScpLmNhdGNoKCgpID0+IHsgLyogZXhwZWN0ZWQgKi8gfSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXdhaXQgcGlwZWxpbmUucmVsb2FkUGx1Z2lucygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbG9hZENhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbml0aWFsIHN0YXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnaXNSZXN1bWVkIHN0YXJ0cyBmYWxzZSBhbmQgaXNBYm9ydGVkIHN0YXJ0cyBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaXBlbGluZS5pc1Jlc3VtZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaXBlbGluZS5pc0Fib3J0ZWQsIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Fib3J0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZmxpcHMgdGhlIGNvbnRyb2xsZXIgc2lnbmFsIGFuZCBpc0Fib3J0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lLCBjb250cm9sbGVyIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpcGVsaW5lLmlzQWJvcnRlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpcyBpZGVtcG90ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSwgY29udHJvbGxlciB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMpO1xuXHRcdFx0cGlwZWxpbmUuYWJvcnQoKTtcblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZW5kIGFmdGVyIGFib3J0IHdpdGggbm8gcmVtYXRlcmlhbGl6ZXIgYXR0YWNoZWQgdGhyb3dzIGEgY2xlYXIgZXJyb3IgKG5vdCBhIHNpbGVudCBoYW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzKTtcblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AxJyksICd0dXJuLUEnKS50aGVuKFxuXHRcdFx0XHQoKSA9PiBhc3NlcnQuZmFpbCgnZXhwZWN0ZWQgcmVqZWN0aW9uJyksXG5cdFx0XHRcdGVyciA9PiB7XG5cdFx0XHRcdFx0Ly8gX3JlYmluZFF1ZXJ5IHRocm93cyBzeW5jaHJvbm91c2x5IHdoZW4gbm8gcmVtYXRlcmlhbGl6ZXIgaXMgYXR0YWNoZWRcblx0XHRcdFx0XHRhc3NlcnQubWF0Y2goU3RyaW5nKGVyciksIC9ubyByZW1hdGVyaWFsaXplciBhdHRhY2hlZC8pO1xuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlbWF0ZXJpYWxpemVyIHdpcmluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2FmdGVyIGFib3J0LCBzZW5kIGludm9rZXMgdGhlIGF0dGFjaGVkIHJlbWF0ZXJpYWxpemVyIGluIFwicmVjb3ZlclwiIG1vZGUgYW5kIGNsZWFycyB0aGUgcmViaW5kIGZsYWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRjb25zdCByZWFzb25zOiBBcnJheTwncmVzdGFydCcgfCAncmVjb3Zlcic+ID0gW107XG5cdFx0XHRjb25zdCBidWlsdDogeyB3YXJtOiBGYWtlV2FybVF1ZXJ5OyBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIgfVtdID0gW107XG5cdFx0XHRjb25zdCByZW1hdGVyaWFsaXplcjogSVJlbWF0ZXJpYWxpemVyID0gYXN5bmMgKHJlYXNvbikgPT4ge1xuXHRcdFx0XHRyZWFzb25zLnB1c2gocmVhc29uKTtcblx0XHRcdFx0Y29uc3QgY3RsID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0XHRjb25zdCB3YXJtID0gbmV3IEZha2VXYXJtUXVlcnkoKTtcblx0XHRcdFx0YnVpbHQucHVzaCh7IHdhcm0sIGNvbnRyb2xsZXI6IGN0bCB9KTtcblx0XHRcdFx0cmV0dXJuIHsgd2FybSwgYWJvcnRDb250cm9sbGVyOiBjdGwgfTtcblx0XHRcdH07XG5cdFx0XHRwaXBlbGluZS5hdHRhY2hSZW1hdGVyaWFsaXplcihyZW1hdGVyaWFsaXplcik7XG5cblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHQvLyBEb24ndCBhd2FpdCBcdTIwMTQgdGhlIGNvbnN1bWVyIGxvb3Agb24gdGhlIHJlYm91bmQgcXVlcnkgd2lsbCBlbmRcblx0XHRcdC8vIGFsbW9zdCBpbW1lZGlhdGVseSwgYnV0IHRoZSBtYXRjaGluZyBTREsgYHJlc3VsdGAgbmV2ZXJcblx0XHRcdC8vIGFycml2ZXMgKEZha2VXYXJtUXVlcnkncyBpdGVyYXRvciBqdXN0IGNsb3NlcyksIHNvIHRoZVxuXHRcdFx0Ly8gZGVmZXJyZWQgZW5kcyB1cCBmYWlsZWQgd2l0aCB0aGUgXCJzdHJlYW0gZW5kZWQgd2l0aG91dFxuXHRcdFx0Ly8gcmVzdWx0XCIgZ3VhcmQuIFdlIG9ubHkgY2FyZSB0aGF0IHRoZSByZW1hdGVyaWFsaXplciByYW4uXG5cdFx0XHRwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AxJyksICd0dXJuLUEnKS5jYXRjaCgoKSA9PiB7IC8qIGV4cGVjdGVkICovIH0pO1xuXHRcdFx0Ly8gWWllbGQgYSBtaWNyb3Rhc2sgZm9yIHRoZSBhc3luYyByZWJpbmQgdG8gY2FsbCB0aGUgY2FsbGJhY2suXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYXNvbnMsIFsncmVjb3ZlciddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpcGVsaW5lLmlzQWJvcnRlZCwgZmFsc2UsICdyZWJpbmQgaW5zdGFsbGVkIGEgZnJlc2gsIG5vbi1hYm9ydGVkIGNvbnRyb2xsZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbWF0ZXJpYWxpemVyIHJlamVjdGlvbiBwcm9wYWdhdGVzIGZyb20gc2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzKTtcblx0XHRcdGNvbnN0IHJlYnVpbGRFcnIgPSBuZXcgRXJyb3IoJ3JlbWF0ZXJpYWxpemUgZmFpbGVkJyk7XG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0cGlwZWxpbmUuYXR0YWNoUmVtYXRlcmlhbGl6ZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjYWxscysrO1xuXHRcdFx0XHR0aHJvdyByZWJ1aWxkRXJyO1xuXHRcdFx0fSk7XG5cblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AxJyksICd0dXJuLUEnKS50aGVuKFxuXHRcdFx0XHQoKSA9PiBhc3NlcnQuZmFpbCgnZXhwZWN0ZWQgcmVqZWN0aW9uJyksXG5cdFx0XHRcdGVyciA9PiBhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLCByZWJ1aWxkRXJyKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWJvcnQgaXNzdWVkIHdoaWxlIHRoZSByZW1hdGVyaWFsaXplciBpcyBzdGlsbCByZXNvbHZpbmcgY2FuY2VscyB0aGUgZnJlc2hseS1idWlsdCBjb250cm9sbGVyIChyZWJpbmQtd2luZG93IHJhY2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgcmVsZWFzZVJlYnVpbGQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHsgd2FybTogRmFrZVdhcm1RdWVyeTsgY29udHJvbGxlcjogQWJvcnRDb250cm9sbGVyIH0+KCk7XG5cdFx0XHRjb25zdCBidWlsdDogeyB3YXJtOiBGYWtlV2FybVF1ZXJ5OyBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIgfVtdID0gW107XG5cdFx0XHRwaXBlbGluZS5hdHRhY2hSZW1hdGVyaWFsaXplcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhaXIgPSBhd2FpdCByZWxlYXNlUmVidWlsZC5wO1xuXHRcdFx0XHRidWlsdC5wdXNoKHBhaXIpO1xuXHRcdFx0XHRyZXR1cm4geyB3YXJtOiBwYWlyLndhcm0sIGFib3J0Q29udHJvbGxlcjogcGFpci5jb250cm9sbGVyIH07XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVHJpZ2dlciByZWJpbmQgYnkgYWJvcnRpbmcgdGhlIHNlZWQgY29udHJvbGxlciBhbmQgc3RhcnRpbmcgYSBzZW5kLlxuXHRcdFx0Ly8gVGhlIHNlbmQgYXdhaXRzIF9yZWJpbmRRdWVyeSwgd2hpY2ggYXdhaXRzIHJlbGVhc2VSZWJ1aWxkLlxuXHRcdFx0cGlwZWxpbmUuYWJvcnQoKTtcblx0XHRcdGNvbnN0IHNlbmRQcm9taXNlID0gcGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJyk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTsgLy8gbGV0IF9yZWJpbmRRdWVyeSBzdGFydCBpdHMgYXdhaXRcblxuXHRcdFx0Ly8gSXNzdWUgYSBTRUNPTkQgYWJvcnQgd2hpbGUgcmViaW5kIGlzIGluLWZsaWdodC4gVGhpcyBtdXN0XG5cdFx0XHQvLyBsYW5kIG9uIHRoZSBub3QteWV0LWluc3RhbGxlZCBjb250cm9sbGVyIFx1MjAxNCBhYm9ydCByZXR1cm5pbmdcblx0XHRcdC8vIGVhcmx5IGFzIGlkZW1wb3RlbnQgaGVyZSB3b3VsZCBzaWxlbnRseSBkcm9wIHRoZSB1c2VyJ3Ncblx0XHRcdC8vIGNhbmNlbC5cblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cblx0XHRcdC8vIE5vdyByZWxlYXNlIHRoZSByZW1hdGVyaWFsaXplciB3aXRoIGEgZnJlc2gsIG5vbi1hYm9ydGVkIGNvbnRyb2xsZXIuXG5cdFx0XHRjb25zdCBmcmVzaENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRyZWxlYXNlUmVidWlsZC5jb21wbGV0ZSh7IHdhcm06IG5ldyBGYWtlV2FybVF1ZXJ5KCksIGNvbnRyb2xsZXI6IGZyZXNoQ29udHJvbGxlciB9KTtcblxuXHRcdFx0YXdhaXQgc2VuZFByb21pc2UudGhlbihcblx0XHRcdFx0KCkgPT4gYXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIGNhbmNlbGxhdGlvbiBhZnRlciByZWJpbmQtd2luZG93IGFib3J0JyksXG5cdFx0XHRcdGVyciA9PiBhc3NlcnQub2soaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpLCBgZXhwZWN0ZWQgQ2FuY2VsbGF0aW9uRXJyb3IsIGdvdCAke2Vycn1gKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsdFswXS5jb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkLCB0cnVlLCAnZnJlc2ggY29udHJvbGxlciBjYW5jZWxsZWQgYmVmb3JlIGJlaW5nIGluc3RhbGxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpcGVsaW5lLmlzQWJvcnRlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHJlYmluZCBoYW5kcyB0aGUgY29uc3VtZXIgbG9vcCBvZmYgdG8gdGhlIG5ldyBxdWVyeSBzbyB0aGUgcG9zdC1yZWJpbmQgdHVybiBpcyBub3QgbG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IGEgcmViaW5kIHN3YXBzIGluIGEgZnJlc2ggYF9xdWVyeWAgd2hpbGUgdGhlIGNvbnN1bWVyXG5cdFx0XHQvLyBsb29wIGlzIHN0aWxsIGRyYWluaW5nIHRoZSBPTEQgb25lLiBUaGUgcG9zdC1yZWJpbmQgYHNlbmRgIHF1ZXVlc1xuXHRcdFx0Ly8gaXRzIHByb21wdCB3aGlsZSB0aGUgb2xkIGxvb3AgaXMgc3RpbGwgbWFya2VkIHJ1bm5pbmcsIHNvXG5cdFx0XHQvLyBgX2Vuc3VyZUNvbnN1bWVyTG9vcGAgbm8tb3BzLiBJZiB0aGUgb2xkIGxvb3AgdGhlbiBqdXN0IHN0b3BwZWQsXG5cdFx0XHQvLyBub3RoaW5nIHdvdWxkIGV2ZXIgcmVhZCB0aGUgbmV3IHF1ZXJ5IGFuZCBgc2VuZGAgd291bGQgaGFuZ1xuXHRcdFx0Ly8gKFwiUmVzdG9yZSBDaGVja3BvaW50IHRoZW4gc2VuZFwiIG5ldmVyIHJlc3BvbmRzKS5cblx0XHRcdGNvbnN0IHdhcm0xID0gbmV3IENvbnRyb2xsYWJsZVdhcm1RdWVyeSgpO1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMsIHdhcm0xKTtcblxuXHRcdFx0Ly8gQmluZCBRMSBhbmQgc3RhcnQgdGhlIGNvbnN1bWVyIGxvb3AgZHJhaW5pbmcgaXQuIE5vIHJlc3VsdCBpc1xuXHRcdFx0Ly8gcHVzaGVkLCBzbyB0aGlzIHNlbmQgbmV2ZXIgcmVzb2x2ZXMgXHUyMDE0IHdlIG9ubHkgbmVlZCB0aGUgbGl2ZSBsb29wLlxuXHRcdFx0cGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi0xJykuY2F0Y2goKCkgPT4geyAvKiB1bndvdW5kIG9uIHRlYXJkb3duICovIH0pO1xuXHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRjb25zdCBxMSA9IHdhcm0xLnF1ZXJpZXNbMF07XG5cdFx0XHRhc3NlcnQub2socTEubmV4dENhbGxDb3VudCA+IDAsICdjb25zdW1lciBsb29wIGRyYWlucyBRMScpO1xuXG5cdFx0XHQvLyBSZWJpbmQgdG8gYSBmcmVzaCB3YXJtL1EyIHdoaWxlIFExJ3MgbG9vcCBpcyBzdGlsbCBwYXJrZWQuXG5cdFx0XHRjb25zdCB3YXJtMiA9IG5ldyBDb250cm9sbGFibGVXYXJtUXVlcnkoKTtcblx0XHRcdHBpcGVsaW5lLmF0dGFjaFJlbWF0ZXJpYWxpemVyKGFzeW5jICgpID0+ICh7IHdhcm06IHdhcm0yLCBhYm9ydENvbnRyb2xsZXI6IG5ldyBBYm9ydENvbnRyb2xsZXIoKSB9KSk7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5yZWJpbmRGb3JSZXN0YXJ0KCk7XG5cdFx0XHRjb25zdCBxMiA9IHdhcm0yLnF1ZXJpZXNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocTIubmV4dENhbGxDb3VudCwgMCwgJ25ldyBxdWVyeSBub3QgZHJhaW5lZCB5ZXQgXHUyMDE0IHRoZSBvbGQgbG9vcCBpcyBzdGlsbCBydW5uaW5nJyk7XG5cblx0XHRcdC8vIFRoZSBvbGQgcXVlcnkncyBzdHJlYW0gbm93IGVuZHMgKGFzIGEgcmVhbCBkaXNwb3NlIHdvdWxkKS4gVGhlXG5cdFx0XHQvLyBsb29wIG11c3QgaGFuZCBvZmYgdG8gUTIgcmF0aGVyIHRoYW4gc3RvcHBpbmcuXG5cdFx0XHRxMS5lbmQoKTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRhc3NlcnQub2socTIubmV4dENhbGxDb3VudCA+IDAsICdjb25zdW1lciBsb29wIGhhbmRlZCBvZmYgdG8gdGhlIG5ldyBxdWVyeSBhZnRlciB0aGUgb2xkIG9uZSBlbmRlZCcpO1xuXG5cdFx0XHQvLyBDbGVhbiB0ZWFyZG93bjogbGV0IHRoZSByZS1hcm1lZCBsb29wIHVud2luZCBiZWZvcmUgZGlzcG9zZS5cblx0XHRcdHEyLmVuZCgpO1xuXHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZWVkQ3VycmVudENvbmZpZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NlZWRlZCB2YWx1ZXMgbWF0Y2ggdGhlIHBvc3QtbWF0ZXJpYWxpemUgU0RLIHN0YXRlLCBzbyBmaXJzdCBzZW5kIGRvZXMgTk9UIHB1c2ggYSByZWR1bmRhbnQgc2V0TW9kZWwvYXBwbHlGbGFnU2V0dGluZ3Mvc2V0UGVybWlzc2lvbk1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXZSBjYW4ndCBvYnNlcnZlIHRoZSBTREsgY2FsbHMgd2l0aG91dCBkcml2aW5nIHRoZSBjb25zdW1lclxuXHRcdFx0Ly8gbG9vcCwgYnV0IHdlIENBTiBvYnNlcnZlIHRoYXQgc2VuZCBkb2VzIG5vdCB0aHJvdyBhbmQgdGhhdFxuXHRcdFx0Ly8gdGhlIHdhcm0gcXVlcnkgaXMgYm91bmQgZXhhY3RseSBvbmNlLlxuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSwgd2FybSB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMpO1xuXHRcdFx0cGlwZWxpbmUuc2VlZEN1cnJlbnRDb25maWcoJ2NsYXVkZS1zb25uZXQtNC01JywgJ2hpZ2gnLCAnZGVmYXVsdCcpO1xuXHRcdFx0cGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykuY2F0Y2goKCkgPT4geyAvKiBleHBlY3RlZDogc3RyZWFtIGVuZHMgd2l0aG91dCByZXN1bHQgKi8gfSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJtLnF1ZXJ5Q2FsbENvdW50LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NldEVmZm9ydCcsICgpID0+IHtcblxuXHRcdC8vIEJpbmQgYSBsaXZlIFF1ZXJ5IChzZW5kKCkgbGF6aWx5IGJpbmRzIGl0KSBzZWVkZWQgYXMgaWYgdGhlIHNlc3Npb25cblx0XHQvLyBtYXRlcmlhbGl6ZWQgb24gYW4gZWZmb3J0LWNhcGFibGUgbW9kZWwuIFJldHVybnMgdGhlIHJlY29yZGVyIHNvIGVhY2hcblx0XHQvLyB0ZXN0IGFzc2VydHMgdGhlIGV4YWN0IGFwcGx5RmxhZ1NldHRpbmdzIHBheWxvYWRzIHB1c2hlZCBhZnRlcndhcmRzLlxuXHRcdGFzeW5jIGZ1bmN0aW9uIHNlZWRlZEhpZ2hUaGVuQmluZChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IFByb21pc2U8eyBwaXBlbGluZTogQ2xhdWRlU2RrUGlwZWxpbmU7IHdhcm06IFJlY29yZGluZ1dhcm1RdWVyeSB9PiB7XG5cdFx0XHRsZXQgd2FybSE6IFJlY29yZGluZ1dhcm1RdWVyeTtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzLCBzaWduYWwgPT4gKHdhcm0gPSBuZXcgUmVjb3JkaW5nV2FybVF1ZXJ5KHNpZ25hbCkpKTtcblx0XHRcdHBpcGVsaW5lLnNlZWRDdXJyZW50Q29uZmlnKCdjbGF1ZGUtb3B1cy00LTcnLCAnaGlnaCcsICdkZWZhdWx0Jyk7XG5cdFx0XHRwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AxJyksICd0dXJuLUEnKS5jYXRjaCgoKSA9PiB7IC8qIHN0cmVhbSBlbmRzIHdpdGhvdXQgcmVzdWx0ICovIH0pO1xuXHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2FybS5xdWVyeUNhbGxDb3VudCwgMSwgJ3F1ZXJ5IHNob3VsZCBiZSBib3VuZCBhZnRlciBzZW5kJyk7XG5cdFx0XHR3YXJtLmZsYWdTZXR0aW5ncy5sZW5ndGggPSAwOyAvLyBkcm9wIGFueSByZXBsYXkgZnJvbSBiaW5kOyBpc29sYXRlIHRoZSBzd2l0Y2hcblx0XHRcdHJldHVybiB7IHBpcGVsaW5lLCB3YXJtIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnc3dpdGNoaW5nIHRvIGEgbW9kZWwgd2l0aCBubyBlZmZvcnQgY2xlYXJzIHRoZSBzdGFsZSBlZmZvcnQgdmlhIGFwcGx5RmxhZ1NldHRpbmdzKHsgZWZmb3J0TGV2ZWw6IG51bGwgfSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZXBybyBvZiB0aGUgSGFpa3UgNDAwOiBhIHNlc3Npb24gbWF0ZXJpYWxpemVkIG9uIE9wdXMgYXBwbGllc1xuXHRcdFx0Ly8gZWZmb3J0ICdoaWdoJyBhdCBTREsgc3RhcnR1cDsgc3dpdGNoaW5nIHRvIEhhaWt1IG11c3QgQ0xFQVIgaXQsIG5vdFxuXHRcdFx0Ly8gbGVhdmUgJ2hpZ2gnIHRvIGJlIHJlcGxheWVkIG9udG8gYSBtb2RlbCB0aGUgQVBJIDQwMHMgb24uXG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lLCB3YXJtIH0gPSBhd2FpdCBzZWVkZWRIaWdoVGhlbkJpbmQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2V0RWZmb3J0KHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdhcm0uZmxhZ1NldHRpbmdzLCBbeyBlZmZvcnRMZXZlbDogbnVsbCB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzd2l0Y2hpbmcgYmV0d2VlbiB0d28gZWZmb3J0LWNhcGFibGUgbGV2ZWxzIHB1c2hlcyB0aGUgbmV3IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSwgd2FybSB9ID0gYXdhaXQgc2VlZGVkSGlnaFRoZW5CaW5kKGRpc3Bvc2FibGVzKTtcblx0XHRcdGF3YWl0IHBpcGVsaW5lLnNldEVmZm9ydCgnbG93Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdhcm0uZmxhZ1NldHRpbmdzLCBbeyBlZmZvcnRMZXZlbDogJ2xvdycgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtYXBwbHlpbmcgdGhlIGFscmVhZHktYXBwbGllZCBlZmZvcnQgaXMgYSBuby1vcCAobm8gcmVkdW5kYW50IFNESyBjYWxsKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUsIHdhcm0gfSA9IGF3YWl0IHNlZWRlZEhpZ2hUaGVuQmluZChkaXNwb3NhYmxlcyk7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZXRFZmZvcnQoJ2hpZ2gnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2FybS5mbGFnU2V0dGluZ3MsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsZWFyaW5nIGFuIGFscmVhZHktY2xlYXIgZWZmb3J0IGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgd2FybSE6IFJlY29yZGluZ1dhcm1RdWVyeTtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzLCBzaWduYWwgPT4gKHdhcm0gPSBuZXcgUmVjb3JkaW5nV2FybVF1ZXJ5KHNpZ25hbCkpKTtcblx0XHRcdHBpcGVsaW5lLnNlZWRDdXJyZW50Q29uZmlnKCdjbGF1ZGUtaGFpa3UtNC01JywgdW5kZWZpbmVkLCAnZGVmYXVsdCcpO1xuXHRcdFx0cGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykuY2F0Y2goKCkgPT4geyAvKiBzdHJlYW0gZW5kcyB3aXRob3V0IHJlc3VsdCAqLyB9KTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXHRcdFx0d2FybS5mbGFnU2V0dGluZ3MubGVuZ3RoID0gMDtcblx0XHRcdGF3YWl0IHBpcGVsaW5lLnNldEVmZm9ydCh1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJtLmZsYWdTZXR0aW5ncywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0RWZmb3J0IHdoaWxlIGF3YWl0aW5nIHJlYmluZCAocG9zdC1hYm9ydCkgaXMgYnVmZmVyZWQsIG5vdCBwdXNoZWQgdG8gdGhlIGRlYWQgcXVlcnksIHRoZW4gcmVwbGF5ZWQgb24gcmViaW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQWZ0ZXIgYW4gYWJvcnQgdGhlIGBfcXVlcnlgIGhhbmRsZSBpcyBpbnRlbnRpb25hbGx5IHJldGFpbmVkIChpdCBpc1xuXHRcdFx0Ly8gd2hhdCB0ZWFyZG93biBhd2FpdHMpIGJ1dCB0aGUgc3RyZWFtIGlzIGRlYWQ7IGBfbmVlZHNSZWJpbmRgIGlzIHRoZVxuXHRcdFx0Ly8gaGVhbHRoIHNpZ25hbC4gc2V0RWZmb3J0IG11c3QgTk9UIHN0ZWVyIHRoYXQgZGVhZCBxdWVyeSBcdTIwMTQgaXQgc2hvdWxkXG5cdFx0XHQvLyBidWZmZXIgdGhlIHZhbHVlIGFuZCBsZXQgYF9yZXBsYXlDdXJyZW50Q29uZmlnYCBwdXNoIGl0IG9udG8gdGhlXG5cdFx0XHQvLyBmcmVzaGx5LWJvdW5kIHF1ZXJ5IGFmdGVyIHRoZSByZWJpbmQuXG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lLCB3YXJtIH0gPSBhd2FpdCBzZWVkZWRIaWdoVGhlbkJpbmQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0cGlwZWxpbmUuYWJvcnQoKTtcblx0XHRcdHdhcm0uZmxhZ1NldHRpbmdzLmxlbmd0aCA9IDA7IC8vIGlzb2xhdGU6IGlnbm9yZSBhbnl0aGluZyBmcm9tIHRoZSBkZWFkIHF1ZXJ5XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZXRFZmZvcnQoJ2xvdycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJtLmZsYWdTZXR0aW5ncywgW10sICdlZmZvcnQgbXVzdCBub3QgYmUgcHVzaGVkIHdoaWxlIG5lZWRzUmViaW5kJyk7XG5cblx0XHRcdGxldCB3YXJtMiE6IFJlY29yZGluZ1dhcm1RdWVyeTtcblx0XHRcdHBpcGVsaW5lLmF0dGFjaFJlbWF0ZXJpYWxpemVyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3RsID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0XHR3YXJtMiA9IG5ldyBSZWNvcmRpbmdXYXJtUXVlcnkoY3RsLnNpZ25hbCk7XG5cdFx0XHRcdHJldHVybiB7IHdhcm06IHdhcm0yLCBhYm9ydENvbnRyb2xsZXI6IGN0bCB9O1xuXHRcdFx0fSk7XG5cdFx0XHRwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AyJyksICd0dXJuLUInKS5jYXRjaCgoKSA9PiB7IC8qIHN0cmVhbSBlbmRzIHdpdGhvdXQgcmVzdWx0ICovIH0pO1xuXHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdhcm0yLmZsYWdTZXR0aW5ncywgW3sgZWZmb3J0TGV2ZWw6ICdsb3cnIH1dLCAnYnVmZmVyZWQgZWZmb3J0IHJlcGxheWVkIG9uIHRoZSByZWJvdW5kIHF1ZXJ5Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaXNwb3NlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZGlzcG9zaW5nIHRoZSBwaXBlbGluZSBhYm9ydHMgdGhlIGNvbnRyb2xsZXIgYW5kIGFzeW5jLWRpc3Bvc2VzIHRoZSBXYXJtUXVlcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUsIHdhcm0sIGNvbnRyb2xsZXIgfSA9IGNyZWF0ZVBpcGVsaW5lKHN0b3JlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2FybS5hc3luY0Rpc3Bvc2VDb3VudCwgMCk7XG5cblx0XHRcdHBpcGVsaW5lLmRpc3Bvc2UoKTtcblx0XHRcdC8vIGFzeW5jRGlzcG9zZSBpcyBmaXJlLWFuZC1mb3JnZXQ7IGxldCB0aGUgbWljcm90YXNrIHJ1bi5cblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2FybS5hc3luY0Rpc3Bvc2VDb3VudCwgMSk7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDYW5jZWxsYXRpb25FcnJvciBwbHVtYmluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Fib3J0ICsgc2VuZCByZWplY3RzIHdpdGggYSBDYW5jZWxsYXRpb25FcnJvci1zaGFwZWQgZXJyb3IgYWZ0ZXIgdGhlIHJlbWF0ZXJpYWxpemVyIHJ1bnMgKHdoZW4gcmVtYXRlcmlhbGl6ZXIgcmVqZWN0cyB3aXRoIG9uZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRwaXBlbGluZS5hdHRhY2hSZW1hdGVyaWFsaXplcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQ2FuY2VsZWQnKTtcblx0XHRcdFx0ZXJyLm5hbWUgPSAnQ2FuY2VsZWQnO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9KTtcblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AxJyksICd0dXJuLUEnKS50aGVuKFxuXHRcdFx0XHQoKSA9PiBhc3NlcnQuZmFpbCgnZXhwZWN0ZWQgcmVqZWN0aW9uJyksXG5cdFx0XHRcdGVyciA9PiBhc3NlcnQub2soaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpLCBgZXhwZWN0ZWQgY2FuY2VsbGF0aW9uLCBnb3QgJHtlcnJ9YCksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQW1DO0FBQzVDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtDQUFrQztBQUUzQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQTBDO0FBQ25ELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsOEJBQThCLDJCQUEyQjtBQWVsRSxNQUFNLGNBQW1DO0FBQUEsRUFBekM7QUFDQyw2QkFBb0I7QUFDcEIsc0JBQWE7QUFDYiwwQkFBaUI7QUFBQTtBQUFBLEVBRWpCLE1BQU0sU0FBd0Q7QUFDN0QsU0FBSztBQUNMLFdBQU8sSUFBSSxxQkFBcUI7QUFBQSxFQUNqQztBQUFBLEVBQ0EsUUFBYztBQUFFLFNBQUs7QUFBQSxFQUFjO0FBQUEsRUFDbkMsT0FBTyxPQUFPLFlBQVksSUFBbUI7QUFBRSxTQUFLO0FBQUEsRUFBcUI7QUFDMUU7QUFFQSxNQUFNLHFCQUFzQztBQUFBLEVBQzNDLENBQUMsT0FBTyxhQUFhLElBQVU7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQzlDLE1BQU0sT0FBNkM7QUFBRSxX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Q0osZUFBUyxxQkFBcUIsWUFBWTtBQUN6QyxjQUFNLE1BQU0sSUFBSSxnQkFBZ0I7QUFDaEMsZ0JBQVEsSUFBSSxtQkFBbUIsSUFBSSxNQUFNO0FBQ3pDLGVBQU8sRUFBRSxNQUFNLE9BQU8saUJBQWlCLElBQUk7QUFBQSxNQUM1QyxDQUFDO0FBQ0QsZUFBUyxLQUFLLFdBQVcsSUFBSSxHQUFHLFFBQVEsRUFBRSxNQUFNLE1BQU07QUFBQSxNQUFtQyxDQUFDO0FBQzFGLFlBQU0sZ0JBQWdCO0FBQ3RCLGFBQU8sZ0JBQWdCLE1BQU0sY0FBYyxDQUFDLEVBQUUsYUFBYSxNQUFNLENBQUMsR0FBRywrQ0FBK0M7QUFBQSxJQUNySCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxXQUFXLE1BQU07QUFFdEIsU0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxZQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsWUFBTSxFQUFFLFVBQVUsTUFBTSxXQUFXLElBQUksZUFBZSxLQUFLO0FBQzNELGFBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUyxLQUFLO0FBQ25ELGFBQU8sWUFBWSxLQUFLLG1CQUFtQixDQUFDO0FBRTVDLGVBQVMsUUFBUTtBQUVqQixZQUFNLFFBQVEsUUFBUTtBQUV0QixhQUFPLFlBQVksV0FBVyxPQUFPLFNBQVMsSUFBSTtBQUNsRCxhQUFPLFlBQVksS0FBSyxtQkFBbUIsQ0FBQztBQUM1QyxZQUFNLFFBQVE7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDhCQUE4QixNQUFNO0FBRXpDLFNBQUssbUlBQW1JLFlBQVk7QUFDbkosWUFBTSxFQUFFLFNBQVMsSUFBSSxlQUFlLFdBQVc7QUFDL0MsZUFBUyxxQkFBcUIsWUFBWTtBQUN6QyxjQUFNLE1BQU0sSUFBSSxNQUFNLFVBQVU7QUFDaEMsWUFBSSxPQUFPO0FBQ1gsY0FBTTtBQUFBLE1BQ1AsQ0FBQztBQUNELGVBQVMsTUFBTTtBQUNmLFlBQU0sU0FBUyxLQUFLLFdBQVcsSUFBSSxHQUFHLFFBQVEsRUFBRTtBQUFBLFFBQy9DLE1BQU0sT0FBTyxLQUFLLG9CQUFvQjtBQUFBLFFBQ3RDLFNBQU8sT0FBTyxHQUFHLG9CQUFvQixHQUFHLEdBQUcsOEJBQThCLEdBQUcsRUFBRTtBQUFBLE1BQy9FO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiZGlzcG9zYWJsZXMiXQp9Cg==
