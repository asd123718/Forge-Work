import * as assert from "assert";
import { execFile } from "child_process";
import { access, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { timeout } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { AgentConfigurationService } from "../../../node/agentConfigurationService.js";
import { ForgeOrchestrationService } from "../../../node/orchestration/orchestrator.js";
import { DEFAULT_ORCHESTRATION_ASSIGNMENT, FORGE_ORCHESTRATION_ASSIGNMENT_KEY } from "../../../common/orchestration/orchestrationTypes.js";
function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true }, (error) => error ? reject(error) : resolve());
  });
}
class FakeLeader {
  constructor(_plan, id = "codex") {
    this._plan = _plan;
    this.id = id;
    this.reviews = 0;
    this.implemented = [];
    this.chats = [];
    this.label = id;
  }
  async plan() {
    return this._plan;
  }
  async review() {
    this.reviews++;
    return "Looks good.";
  }
  async implement(task) {
    this.implemented.push(task.id);
    return { status: "completed", summary: "leader patch", changedFiles: ["src/escalated.ts"], usage: { durationMs: 2 } };
  }
  async chat(goal, _workspace, _model, abort, hooks) {
    if (abort.aborted) {
      throw new Error("aborted");
    }
    this.chats.push(goal);
    const output = `done:${goal}`;
    hooks?.onProgress?.({ progress: output, output });
    return output;
  }
}
class FakeWorker {
  constructor(id, label, _run, _available = true, _availabilityReason) {
    this.id = id;
    this.label = label;
    this._run = _run;
    this._available = _available;
    this._availabilityReason = _availabilityReason;
    this.defaultModel = "test";
  }
  async checkAvailability() {
    return {
      available: this._available,
      reason: this._available ? void 0 : this._availabilityReason ?? "invalid-runtime"
    };
  }
  async isAvailable() {
    return this._available;
  }
  async run(request) {
    return this._run(request.task.prompt, request.workspace, request.abort);
  }
}
class PausingPlanLeader {
  constructor() {
    this.id = "codex";
    this.label = "codex";
    this.plans = 0;
    this.reviews = 0;
  }
  async plan(_context, abort) {
    this.plans++;
    if (this.plans === 1) {
      await new Promise((resolve) => abort.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("planning interrupted");
    }
    return {
      summary: "resumed plan",
      contract: "",
      tasks: [{ id: "a", title: "A", prompt: "a", files: [], dependsOn: [], workerHint: "deepseek-harness" }]
    };
  }
  async review() {
    this.reviews++;
    return "Looks good.";
  }
  async implement() {
    return { status: "failed", summary: "", changedFiles: [], error: "not used", usage: { durationMs: 0 } };
  }
  async chat() {
    throw new Error("not used");
  }
}
suite("Forge orchestration scheduler", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness() {
    const log = new NullLogService();
    const state = disposables.add(new AgentHostStateManager(log));
    const config = disposables.add(new AgentConfigurationService(state, log));
    const service = disposables.add(new ForgeOrchestrationService(config, state, log, { appRoot: process.cwd() }));
    return { service, config };
  }
  function createService() {
    return createHarness().service;
  }
  async function tempDir() {
    const dir = await mkdtemp(join(tmpdir(), "forge-orch-"));
    await writeFile(join(dir, "README.md"), "# Test workspace\n");
    disposables.add({ dispose: () => {
      void rm(dir, { recursive: true, force: true });
    } });
    return dir;
  }
  async function tempWorkspace() {
    const dir = await mkdtemp(join(tmpdir(), "forge-orch-"));
    await writeFile(join(dir, "README.md"), "# Test workspace\n");
    await runGit(dir, ["init"]);
    await runGit(dir, ["add", "--all"]);
    await runGit(dir, ["-c", "user.name=Forge Test", "-c", "user.email=forge-test@invalid", "commit", "--no-gpg-sign", "-m", "initial"]);
    disposables.add({ dispose: () => {
      void rm(dir, { recursive: true, force: true });
    } });
    return dir;
  }
  test("runs two independent workers then asks the leader to review", async () => {
    const service = createService();
    const leader = new FakeLeader({
      summary: "parallel",
      contract: "small patches",
      tasks: [
        { id: "a", title: "A", prompt: "do a", files: [], dependsOn: [], workerHint: "deepseek-harness" },
        { id: "b", title: "B", prompt: "do b", files: [], dependsOn: [], workerHint: "grok-build" }
      ]
    });
    const seen = [];
    service.setLeader(leader);
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => {
      seen.push("deepseek");
      return { status: "completed", summary: "a done", changedFiles: ["a.ts"], usage: { durationMs: 5 } };
    }));
    service.registerWorker(new FakeWorker("grok-build", "Grok Build", async () => {
      seen.push("grok");
      return { status: "completed", summary: "b done", changedFiles: ["b.ts"], usage: { durationMs: 7, costUsd: 0.01 } };
    }));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "Ship a small parallel change"
    });
    assert.deepStrictEqual(seen.sort(), ["deepseek", "grok"]);
    assert.strictEqual(run.status, "completed");
    assert.strictEqual(run.tasks.length, 2);
    assert.ok(run.tasks.every((task) => task.status === "completed"));
    assert.strictEqual(leader.reviews, 1);
    assert.strictEqual(run.review, "Looks good.");
    assert.ok((run.usage.costUsd ?? 0) >= 0.01);
  });
  test("escalates a twice-failed worker to the leader", async () => {
    const service = createService();
    const leader = new FakeLeader({
      summary: "one task",
      contract: "",
      tasks: [{ id: "only", title: "Only", prompt: "fail", files: [], dependsOn: [], workerHint: "deepseek-harness" }]
    });
    service.setLeader(leader);
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => ({
      status: "failed",
      summary: "",
      changedFiles: [],
      error: "boom",
      usage: { durationMs: 1 }
    })));
    service.registerWorker(new FakeWorker("grok-build", "Grok Build", async () => ({
      status: "completed",
      summary: "",
      changedFiles: [],
      usage: { durationMs: 0 }
    })));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "fix it"
    });
    assert.deepStrictEqual(leader.implemented, ["only"]);
    assert.strictEqual(run.tasks[0].status, "escalated");
    assert.strictEqual(run.status, "completed");
  });
  test("cancel stops a queued run", async () => {
    const service = createService();
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    service.setLeader(new FakeLeader({
      summary: "slow",
      contract: "",
      tasks: [
        { id: "a", title: "A", prompt: "a", files: [], dependsOn: [], workerHint: "deepseek-harness" },
        { id: "b", title: "B", prompt: "b", files: [], dependsOn: ["a"], workerHint: "grok-build" }
      ]
    }));
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => {
      await blocked;
      return { status: "completed", summary: "a", changedFiles: [], usage: { durationMs: 1 } };
    }));
    service.registerWorker(new FakeWorker("grok-build", "Grok Build", async () => ({
      status: "completed",
      summary: "b",
      changedFiles: [],
      usage: { durationMs: 1 }
    })));
    const started = service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "cancel me"
    });
    await timeout(20);
    await service.command({ type: "cancel" });
    release();
    const run = await started;
    assert.strictEqual(run.status, "cancelled");
  });
  test("uses the assigned leader even when it is not Codex", async () => {
    const service = createService();
    const leader = new FakeLeader({
      summary: "deepseek leads",
      contract: "",
      tasks: [
        { id: "a", title: "A", prompt: "a", files: [], dependsOn: [], workerHint: "codex" },
        { id: "b", title: "B", prompt: "b", files: [], dependsOn: [], workerHint: "grok-build" }
      ]
    }, "deepseek-harness");
    service.registerLeader(leader);
    service.registerWorker(new FakeWorker("codex", "Codex", async () => ({
      status: "completed",
      summary: "a",
      changedFiles: ["a.ts"],
      usage: { durationMs: 1 }
    })));
    service.registerWorker(new FakeWorker("grok-build", "Grok Build", async () => ({
      status: "completed",
      summary: "b",
      changedFiles: ["b.ts"],
      usage: { durationMs: 1 }
    })));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "rotate roles",
      assignment: {
        leader: { providerId: "deepseek-harness", label: "DeepSeek Harness", role: "leader" },
        workers: [
          { providerId: "codex", label: "Codex", role: "worker" },
          { providerId: "grok-build", label: "Grok Build", role: "worker" }
        ]
      }
    });
    assert.strictEqual(run.assignment.leader.providerId, "deepseek-harness");
    assert.strictEqual(leader.reviews, 1);
    assert.ok(run.tasks.some((task) => task.workerProviderId === "codex"));
    assert.ok(run.tasks.some((task) => task.workerProviderId === "grok-build"));
  });
  test("falls back to Codex when an assigned CLI worker is unavailable", async () => {
    const service = createService();
    const leader = new FakeLeader({
      summary: "parallel",
      contract: "small patches",
      tasks: [
        { id: "a", title: "A", prompt: "do a", files: [], dependsOn: [], workerHint: "deepseek-harness" }
      ]
    });
    service.setLeader(leader);
    service.registerWorker({
      id: "deepseek-harness",
      label: "DeepSeek Harness",
      defaultModel: "deepseek-v4-flash",
      checkAvailability: async () => ({ available: false, credentialSource: "none", reason: "missing-credentials" }),
      isAvailable: async () => false,
      run: async () => ({ status: "failed", summary: "", changedFiles: [], usage: { durationMs: 0 } })
    });
    service.registerWorker(new FakeWorker("codex", "Codex", async () => ({
      status: "completed",
      summary: "codex fallback",
      changedFiles: ["fallback.ts"],
      usage: { durationMs: 1 }
    })));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "Use codex fallback",
      mode: "dialectic"
    });
    assert.strictEqual(run.status, "completed");
    assert.strictEqual(run.tasks[0].requestedWorkerProviderId, "deepseek-harness");
    assert.strictEqual(run.tasks[0].resolvedWorkerProviderId, "codex");
    assert.strictEqual(run.tasks[0].workerProviderId, "codex");
    assert.strictEqual(run.tasks[0].workerFallbackReason, "missing-credentials");
    assert.strictEqual(run.tasks[0].status, "completed");
  });
  test("logos mode runs the selected agent without a leader plan", async () => {
    const service = createService();
    const leader = new FakeLeader({ summary: "", contract: "", tasks: [] }, "grok-build");
    service.registerLeader(leader);
    let workerRan = false;
    service.registerWorker(new FakeWorker("grok-build", "Grok Build", async () => {
      workerRan = true;
      return { status: "completed", summary: "worker must not run", changedFiles: ["x.ts"], usage: { durationMs: 3 } };
    }));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempDir(),
      goal: "Write the helper",
      mode: "logos",
      assignment: {
        leader: { providerId: "grok-build", label: "Grok Build", model: "grok-4.6", thinkingLevel: "high", role: "leader" },
        workers: [{ providerId: "grok-build", label: "Grok Build", model: "grok-4.6", role: "worker" }]
      }
    });
    assert.strictEqual(workerRan, false);
    assert.deepStrictEqual(leader.chats, ["Write the helper"]);
    assert.strictEqual(run.status, "completed");
    assert.strictEqual(run.assignment.workers.length, 0);
    assert.strictEqual(run.tasks.length, 1);
    assert.strictEqual(run.tasks[0].workerProviderId, "grok-build");
    assert.strictEqual(run.tasks[0].thinkingLevel, "high");
  });
  test("logos mode ignores stored dialectic workers and does not require git", async () => {
    const { service, config } = createHarness();
    config.updateRootConfig({ [FORGE_ORCHESTRATION_ASSIGNMENT_KEY]: DEFAULT_ORCHESTRATION_ASSIGNMENT });
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => {
      throw new Error("dialectic worker must not run in logos");
    }));
    service.registerWorker(new FakeWorker("grok-build", "Grok Build", async () => {
      throw new Error("dialectic worker must not run in logos");
    }));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempDir(),
      goal: "hello",
      mode: "logos"
    });
    assert.strictEqual(run.assignment.leader.providerId, "codex");
    assert.strictEqual(run.assignment.workers.length, 0);
    const message = run.tasks[0]?.error ?? run.error ?? "";
    assert.ok(message.includes("unavailable"), message);
    assert.ok(!message.includes("Git workspace"), message);
  });
  test("dialectic workers still require a git workspace", async () => {
    const service = createService();
    service.setLeader(new FakeLeader({
      summary: "one task",
      contract: "",
      tasks: [{ id: "a", title: "A", prompt: "do a", files: [], dependsOn: [], workerHint: "deepseek-harness" }]
    }));
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => ({
      status: "completed",
      summary: "should not run",
      changedFiles: [],
      usage: { durationMs: 1 }
    })));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempDir(),
      goal: "Need git isolation",
      mode: "dialectic"
    });
    assert.notStrictEqual(run.status, "completed");
    assert.ok((run.tasks[0]?.error ?? run.error ?? "").includes("Git workspace"));
  });
  test("does not merge partial edits from a failed worker", async () => {
    const service = createService();
    service.setLeader(new FakeLeader({
      summary: "one task",
      contract: "",
      tasks: [{ id: "partial", title: "Partial", prompt: "fail after edit", files: ["failed.txt"], dependsOn: [], workerHint: "deepseek-harness" }]
    }));
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async (_prompt, workspace2) => {
      await writeFile(join(workspace2, "failed.txt"), "must not merge\n");
      return { status: "failed", summary: "", changedFiles: ["failed.txt"], error: "worker failed", usage: { durationMs: 1 } };
    }));
    const workspace = await tempWorkspace();
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace,
      goal: "keep failed edits isolated"
    });
    assert.strictEqual(run.status, "completed");
    await assert.rejects(access(join(workspace, "failed.txt")));
  });
  test("marks dependency cycles as failed instead of completed", async () => {
    const service = createService();
    const leader = new FakeLeader({
      summary: "cycle",
      contract: "",
      tasks: [
        { id: "a", title: "A", prompt: "a", files: [], dependsOn: ["b"], workerHint: "deepseek-harness" },
        { id: "b", title: "B", prompt: "b", files: [], dependsOn: ["a"], workerHint: "grok-build" }
      ]
    });
    service.setLeader(leader);
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "reject cycle"
    });
    assert.strictEqual(run.status, "failed");
    assert.ok(run.tasks.every((task) => task.status === "failed"));
    assert.match(run.tasks[0].error ?? "", /dependencies|cycle/i);
    assert.strictEqual(leader.reviews, 1);
  });
  test("pause aborts the active worker and resume runs the queued task", async function() {
    this.timeout(5e3);
    const service = createService();
    service.setLeader(new FakeLeader({
      summary: "pause",
      contract: "",
      tasks: [{ id: "a", title: "A", prompt: "a", files: [], dependsOn: [], workerHint: "deepseek-harness" }]
    }));
    let attempts = 0;
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async (_prompt, _workspace, abort) => {
      attempts++;
      if (attempts === 1) {
        await new Promise((resolve) => {
          if (abort.aborted) {
            resolve();
          } else {
            abort.addEventListener("abort", () => resolve(), { once: true });
          }
        });
      }
      return { status: "completed", summary: "done", changedFiles: [], usage: { durationMs: 1 } };
    }));
    const started = service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "pause and resume"
    });
    while (attempts !== 1) {
      await timeout(10);
    }
    await service.command({ type: "pause" });
    assert.strictEqual((await started).status, "paused");
    assert.strictEqual(service.state?.tasks[0].status, "queued");
    await service.command({ type: "resume" });
    assert.strictEqual(service.state?.status, "completed");
    assert.strictEqual(service.state?.tasks[0].status, "completed");
    assert.strictEqual(attempts, 2);
  });
  test("pause during planning restarts planning on resume", async function() {
    this.timeout(5e3);
    const service = createService();
    const leader = new PausingPlanLeader();
    service.setLeader(leader);
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => ({
      status: "completed",
      summary: "done",
      changedFiles: [],
      usage: { durationMs: 1 }
    })));
    const started = service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "pause planning"
    });
    while (leader.plans !== 1) {
      await timeout(10);
    }
    await service.command({ type: "pause" });
    assert.strictEqual((await started).status, "paused");
    await service.command({ type: "resume" });
    assert.strictEqual(service.state?.status, "completed");
    assert.strictEqual(service.state?.tasks[0].status, "completed");
    assert.strictEqual(leader.plans, 2);
    assert.strictEqual(leader.reviews, 1);
  });
  test("a failed leader review terminates the run instead of leaving it reviewing", async () => {
    const service = createService();
    const leader = new FakeLeader({
      summary: "review failure",
      contract: "",
      tasks: [{ id: "a", title: "A", prompt: "a", files: [], dependsOn: [], workerHint: "deepseek-harness" }]
    });
    leader.review = async () => {
      throw new Error("review unavailable");
    };
    service.setLeader(leader);
    service.registerWorker(new FakeWorker("deepseek-harness", "DeepSeek Harness", async () => ({
      status: "completed",
      summary: "done",
      changedFiles: [],
      usage: { durationMs: 1 }
    })));
    const run = await service.start({
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      workspace: await tempWorkspace(),
      goal: "handle review failure"
    });
    assert.strictEqual(run.status, "failed");
    assert.match(run.error ?? "", /review unavailable/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFxvcmNoZXN0cmF0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcclxuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0IHsgYWNjZXNzLCBta2R0ZW1wLCBybSwgd3JpdGVGaWxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xyXG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XHJcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcclxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcclxuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcclxuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XHJcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xyXG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XHJcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xyXG5pbXBvcnQgeyBGb3JnZU9yY2hlc3RyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9vcmNoZXN0cmF0aW9uL29yY2hlc3RyYXRvci5qcyc7XHJcbmltcG9ydCB0eXBlIHsgSUxlYWRlclBsYW5Db250ZXh0LCBJTGVhZGVyUHJvdmlkZXIsIElPcmNoZXN0cmF0aW9uUGxhbiwgSU9yY2hlc3RyYXRpb25Qcm9ncmVzc0hvb2tzLCBJV29ya2VyQXZhaWxhYmlsaXR5LCBJV29ya2VyUHJvdmlkZXIsIElXb3JrZXJUYXNrUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL29yY2hlc3RyYXRpb24vb3JjaGVzdHJhdGlvblR5cGVzLmpzJztcclxuaW1wb3J0IHsgREVGQVVMVF9PUkNIRVNUUkFUSU9OX0FTU0lHTk1FTlQsIEZPUkdFX09SQ0hFU1RSQVRJT05fQVNTSUdOTUVOVF9LRVkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vb3JjaGVzdHJhdGlvbi9vcmNoZXN0cmF0aW9uVHlwZXMuanMnO1xyXG5cclxuZnVuY3Rpb24gcnVuR2l0KGN3ZDogc3RyaW5nLCBhcmdzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xyXG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcblx0XHRleGVjRmlsZSgnZ2l0JywgWy4uLmFyZ3NdLCB7IGN3ZCwgd2luZG93c0hpZGU6IHRydWUgfSwgZXJyb3IgPT4gZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZSgpKTtcclxuXHR9KTtcclxufVxyXG5cclxuY2xhc3MgRmFrZUxlYWRlciBpbXBsZW1lbnRzIElMZWFkZXJQcm92aWRlciB7XHJcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcclxuXHRwdWJsaWMgcmV2aWV3cyA9IDA7XHJcblx0cHVibGljIGltcGxlbWVudGVkOiBzdHJpbmdbXSA9IFtdO1xyXG5cdHB1YmxpYyBjaGF0czogc3RyaW5nW10gPSBbXTtcclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BsYW46IElPcmNoZXN0cmF0aW9uUGxhbixcclxuXHRcdHJlYWRvbmx5IGlkID0gJ2NvZGV4JyxcclxuXHQpIHtcclxuXHRcdHRoaXMubGFiZWwgPSBpZDtcclxuXHR9XHJcblx0YXN5bmMgcGxhbigpOiBQcm9taXNlPElPcmNoZXN0cmF0aW9uUGxhbj4geyByZXR1cm4gdGhpcy5fcGxhbjsgfVxyXG5cdGFzeW5jIHJldmlldygpOiBQcm9taXNlPHN0cmluZz4ge1xyXG5cdFx0dGhpcy5yZXZpZXdzKys7XHJcblx0XHRyZXR1cm4gJ0xvb2tzIGdvb2QuJztcclxuXHR9XHJcblx0YXN5bmMgaW1wbGVtZW50KHRhc2s6IHsgaWQ6IHN0cmluZyB9KTogUHJvbWlzZTxJV29ya2VyVGFza1Jlc3VsdD4ge1xyXG5cdFx0dGhpcy5pbXBsZW1lbnRlZC5wdXNoKHRhc2suaWQpO1xyXG5cdFx0cmV0dXJuIHsgc3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogJ2xlYWRlciBwYXRjaCcsIGNoYW5nZWRGaWxlczogWydzcmMvZXNjYWxhdGVkLnRzJ10sIHVzYWdlOiB7IGR1cmF0aW9uTXM6IDIgfSB9O1xyXG5cdH1cclxuXHRhc3luYyBjaGF0KGdvYWw6IHN0cmluZywgX3dvcmtzcGFjZTogc3RyaW5nLCBfbW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgYWJvcnQ6IEFib3J0U2lnbmFsLCBob29rcz86IElPcmNoZXN0cmF0aW9uUHJvZ3Jlc3NIb29rcyk6IFByb21pc2U8c3RyaW5nPiB7XHJcblx0XHRpZiAoYWJvcnQuYWJvcnRlZCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Fib3J0ZWQnKTtcclxuXHRcdH1cclxuXHRcdHRoaXMuY2hhdHMucHVzaChnb2FsKTtcclxuXHRcdGNvbnN0IG91dHB1dCA9IGBkb25lOiR7Z29hbH1gO1xyXG5cdFx0aG9va3M/Lm9uUHJvZ3Jlc3M/Lih7IHByb2dyZXNzOiBvdXRwdXQsIG91dHB1dCB9KTtcclxuXHRcdHJldHVybiBvdXRwdXQ7XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBGYWtlV29ya2VyIGltcGxlbWVudHMgSVdvcmtlclByb3ZpZGVyIHtcclxuXHRyZWFkb25seSBkZWZhdWx0TW9kZWwgPSAndGVzdCc7XHJcblx0Y29uc3RydWN0b3IoXHJcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxyXG5cdFx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyxcclxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3J1bjogKHByb21wdDogc3RyaW5nLCB3b3Jrc3BhY2U6IHN0cmluZywgYWJvcnQ6IEFib3J0U2lnbmFsKSA9PiBQcm9taXNlPElXb3JrZXJUYXNrUmVzdWx0PixcclxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2F2YWlsYWJsZSA9IHRydWUsXHJcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hdmFpbGFiaWxpdHlSZWFzb24/OiAnbWlzc2luZy1jcmVkZW50aWFscycgfCAncHJvYmUtZmFpbGVkJyxcclxuXHQpIHsgfVxyXG5cdGFzeW5jIGNoZWNrQXZhaWxhYmlsaXR5KCk6IFByb21pc2U8SVdvcmtlckF2YWlsYWJpbGl0eT4ge1xyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0YXZhaWxhYmxlOiB0aGlzLl9hdmFpbGFibGUsXHJcblx0XHRcdHJlYXNvbjogdGhpcy5fYXZhaWxhYmxlID8gdW5kZWZpbmVkIDogKHRoaXMuX2F2YWlsYWJpbGl0eVJlYXNvbiA/PyAnaW52YWxpZC1ydW50aW1lJyksXHJcblx0XHR9O1xyXG5cdH1cclxuXHRhc3luYyBpc0F2YWlsYWJsZSgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuX2F2YWlsYWJsZTsgfVxyXG5cdGFzeW5jIHJ1bihyZXF1ZXN0OiB7IHRhc2s6IHsgcHJvbXB0OiBzdHJpbmcgfTsgd29ya3NwYWNlOiBzdHJpbmc7IGFib3J0OiBBYm9ydFNpZ25hbCB9KTogUHJvbWlzZTxJV29ya2VyVGFza1Jlc3VsdD4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3J1bihyZXF1ZXN0LnRhc2sucHJvbXB0LCByZXF1ZXN0LndvcmtzcGFjZSwgcmVxdWVzdC5hYm9ydCk7XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBQYXVzaW5nUGxhbkxlYWRlciBpbXBsZW1lbnRzIElMZWFkZXJQcm92aWRlciB7XHJcblx0cmVhZG9ubHkgaWQgPSAnY29kZXgnO1xyXG5cdHJlYWRvbmx5IGxhYmVsID0gJ2NvZGV4JztcclxuXHRwdWJsaWMgcGxhbnMgPSAwO1xyXG5cdHB1YmxpYyByZXZpZXdzID0gMDtcclxuXHJcblx0YXN5bmMgcGxhbihfY29udGV4dDogSUxlYWRlclBsYW5Db250ZXh0LCBhYm9ydDogQWJvcnRTaWduYWwpOiBQcm9taXNlPElPcmNoZXN0cmF0aW9uUGxhbj4ge1xyXG5cdFx0dGhpcy5wbGFucysrO1xyXG5cdFx0aWYgKHRoaXMucGxhbnMgPT09IDEpIHtcclxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBhYm9ydC5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsICgpID0+IHJlc29sdmUoKSwgeyBvbmNlOiB0cnVlIH0pKTtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdwbGFubmluZyBpbnRlcnJ1cHRlZCcpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c3VtbWFyeTogJ3Jlc3VtZWQgcGxhbicsXHJcblx0XHRcdGNvbnRyYWN0OiAnJyxcclxuXHRcdFx0dGFza3M6IFt7IGlkOiAnYScsIHRpdGxlOiAnQScsIHByb21wdDogJ2EnLCBmaWxlczogW10sIGRlcGVuZHNPbjogW10sIHdvcmtlckhpbnQ6ICdkZWVwc2Vlay1oYXJuZXNzJyB9XSxcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRhc3luYyByZXZpZXcoKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuXHRcdHRoaXMucmV2aWV3cysrO1xyXG5cdFx0cmV0dXJuICdMb29rcyBnb29kLic7XHJcblx0fVxyXG5cclxuXHRhc3luYyBpbXBsZW1lbnQoKTogUHJvbWlzZTxJV29ya2VyVGFza1Jlc3VsdD4ge1xyXG5cdFx0cmV0dXJuIHsgc3RhdHVzOiAnZmFpbGVkJywgc3VtbWFyeTogJycsIGNoYW5nZWRGaWxlczogW10sIGVycm9yOiAnbm90IHVzZWQnLCB1c2FnZTogeyBkdXJhdGlvbk1zOiAwIH0gfTtcclxuXHR9XHJcblxyXG5cdGFzeW5jIGNoYXQoKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuXHRcdHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTtcclxuXHR9XHJcbn1cclxuXHJcbnN1aXRlKCdGb3JnZSBvcmNoZXN0cmF0aW9uIHNjaGVkdWxlcicsICgpID0+IHtcclxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcclxuXHJcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XHJcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XHJcblxyXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhcm5lc3MoKTogeyBzZXJ2aWNlOiBGb3JnZU9yY2hlc3RyYXRpb25TZXJ2aWNlOyBjb25maWc6IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSB7XHJcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcclxuXHRcdGNvbnN0IHN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nKSk7XHJcblx0XHRjb25zdCBjb25maWcgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGUsIGxvZykpO1xyXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRm9yZ2VPcmNoZXN0cmF0aW9uU2VydmljZShjb25maWcsIHN0YXRlLCBsb2csIHsgYXBwUm9vdDogcHJvY2Vzcy5jd2QoKSB9IGFzIG5ldmVyKSk7XHJcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBjb25maWcgfTtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2UoKTogRm9yZ2VPcmNoZXN0cmF0aW9uU2VydmljZSB7XHJcblx0XHRyZXR1cm4gY3JlYXRlSGFybmVzcygpLnNlcnZpY2U7XHJcblx0fVxyXG5cclxuXHRhc3luYyBmdW5jdGlvbiB0ZW1wRGlyKCk6IFByb21pc2U8c3RyaW5nPiB7XHJcblx0XHRjb25zdCBkaXIgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdmb3JnZS1vcmNoLScpKTtcclxuXHRcdGF3YWl0IHdyaXRlRmlsZShqb2luKGRpciwgJ1JFQURNRS5tZCcpLCAnIyBUZXN0IHdvcmtzcGFjZVxcbicpO1xyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4geyB2b2lkIHJtKGRpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pOyB9IH0pO1xyXG5cdFx0cmV0dXJuIGRpcjtcclxuXHR9XHJcblxyXG5cdGFzeW5jIGZ1bmN0aW9uIHRlbXBXb3Jrc3BhY2UoKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuXHRcdGNvbnN0IGRpciA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2ZvcmdlLW9yY2gtJykpO1xyXG5cdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4oZGlyLCAnUkVBRE1FLm1kJyksICcjIFRlc3Qgd29ya3NwYWNlXFxuJyk7XHJcblx0XHRhd2FpdCBydW5HaXQoZGlyLCBbJ2luaXQnXSk7XHJcblx0XHRhd2FpdCBydW5HaXQoZGlyLCBbJ2FkZCcsICctLWFsbCddKTtcclxuXHRcdGF3YWl0IHJ1bkdpdChkaXIsIFsnLWMnLCAndXNlci5uYW1lPUZvcmdlIFRlc3QnLCAnLWMnLCAndXNlci5lbWFpbD1mb3JnZS10ZXN0QGludmFsaWQnLCAnY29tbWl0JywgJy0tbm8tZ3BnLXNpZ24nLCAnLW0nLCAnaW5pdGlhbCddKTtcclxuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgdm9pZCBybShkaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTsgfSB9KTtcclxuXHRcdHJldHVybiBkaXI7XHJcblx0fVxyXG5cclxuXHR0ZXN0KCdydW5zIHR3byBpbmRlcGVuZGVudCB3b3JrZXJzIHRoZW4gYXNrcyB0aGUgbGVhZGVyIHRvIHJldmlldycsIGFzeW5jICgpID0+IHtcclxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XHJcblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgRmFrZUxlYWRlcih7XHJcblx0XHRcdHN1bW1hcnk6ICdwYXJhbGxlbCcsXHJcblx0XHRcdGNvbnRyYWN0OiAnc21hbGwgcGF0Y2hlcycsXHJcblx0XHRcdHRhc2tzOiBbXHJcblx0XHRcdFx0eyBpZDogJ2EnLCB0aXRsZTogJ0EnLCBwcm9tcHQ6ICdkbyBhJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFtdLCB3b3JrZXJIaW50OiAnZGVlcHNlZWstaGFybmVzcycgfSxcclxuXHRcdFx0XHR7IGlkOiAnYicsIHRpdGxlOiAnQicsIHByb21wdDogJ2RvIGInLCBmaWxlczogW10sIGRlcGVuZHNPbjogW10sIHdvcmtlckhpbnQ6ICdncm9rLWJ1aWxkJyB9LFxyXG5cdFx0XHRdLFxyXG5cdFx0fSk7XHJcblx0XHRjb25zdCBzZWVuOiBzdHJpbmdbXSA9IFtdO1xyXG5cdFx0c2VydmljZS5zZXRMZWFkZXIobGVhZGVyKTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2RlZXBzZWVrLWhhcm5lc3MnLCAnRGVlcFNlZWsgSGFybmVzcycsIGFzeW5jICgpID0+IHtcclxuXHRcdFx0c2Vlbi5wdXNoKCdkZWVwc2VlaycpO1xyXG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdjb21wbGV0ZWQnLCBzdW1tYXJ5OiAnYSBkb25lJywgY2hhbmdlZEZpbGVzOiBbJ2EudHMnXSwgdXNhZ2U6IHsgZHVyYXRpb25NczogNSB9IH07XHJcblx0XHR9KSk7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdncm9rLWJ1aWxkJywgJ0dyb2sgQnVpbGQnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRcdHNlZW4ucHVzaCgnZ3JvaycpO1xyXG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdjb21wbGV0ZWQnLCBzdW1tYXJ5OiAnYiBkb25lJywgY2hhbmdlZEZpbGVzOiBbJ2IudHMnXSwgdXNhZ2U6IHsgZHVyYXRpb25NczogNywgY29zdFVzZDogMC4wMSB9IH07XHJcblx0XHR9KSk7XHJcblxyXG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgc2VydmljZS5zdGFydCh7XHJcblx0XHRcdGNoYXRVcmk6ICdhaHAtY2hhdDovL3gvZGVmYXVsdCcsXHJcblx0XHRcdHNlc3Npb25Vcmk6ICdjb2RleDovL3gnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IGF3YWl0IHRlbXBXb3Jrc3BhY2UoKSxcclxuXHRcdFx0Z29hbDogJ1NoaXAgYSBzbWFsbCBwYXJhbGxlbCBjaGFuZ2UnLFxyXG5cdFx0fSk7XHJcblxyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWVuLnNvcnQoKSwgWydkZWVwc2VlaycsICdncm9rJ10pO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5zdGF0dXMsICdjb21wbGV0ZWQnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3MubGVuZ3RoLCAyKTtcclxuXHRcdGFzc2VydC5vayhydW4udGFza3MuZXZlcnkodGFzayA9PiB0YXNrLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcpKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWFkZXIucmV2aWV3cywgMSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuLnJldmlldywgJ0xvb2tzIGdvb2QuJyk7XHJcblx0XHRhc3NlcnQub2soKHJ1bi51c2FnZS5jb3N0VXNkID8/IDApID49IDAuMDEpO1xyXG5cdH0pO1xyXG5cclxuXHR0ZXN0KCdlc2NhbGF0ZXMgYSB0d2ljZS1mYWlsZWQgd29ya2VyIHRvIHRoZSBsZWFkZXInLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xyXG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXIoe1xyXG5cdFx0XHRzdW1tYXJ5OiAnb25lIHRhc2snLFxyXG5cdFx0XHRjb250cmFjdDogJycsXHJcblx0XHRcdHRhc2tzOiBbeyBpZDogJ29ubHknLCB0aXRsZTogJ09ubHknLCBwcm9tcHQ6ICdmYWlsJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFtdLCB3b3JrZXJIaW50OiAnZGVlcHNlZWstaGFybmVzcycgfV0sXHJcblx0XHR9KTtcclxuXHRcdHNlcnZpY2Uuc2V0TGVhZGVyKGxlYWRlcik7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdkZWVwc2Vlay1oYXJuZXNzJywgJ0RlZXBTZWVrIEhhcm5lc3MnLCBhc3luYyAoKSA9PiAoe1xyXG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxyXG5cdFx0XHRzdW1tYXJ5OiAnJyxcclxuXHRcdFx0Y2hhbmdlZEZpbGVzOiBbXSxcclxuXHRcdFx0ZXJyb3I6ICdib29tJyxcclxuXHRcdFx0dXNhZ2U6IHsgZHVyYXRpb25NczogMSB9LFxyXG5cdFx0fSkpKTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2dyb2stYnVpbGQnLCAnR3JvayBCdWlsZCcsIGFzeW5jICgpID0+ICh7XHJcblx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsIHN1bW1hcnk6ICcnLCBjaGFuZ2VkRmlsZXM6IFtdLCB1c2FnZTogeyBkdXJhdGlvbk1zOiAwIH0sXHJcblx0XHR9KSkpO1xyXG5cclxuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoe1xyXG5cdFx0XHRjaGF0VXJpOiAnYWhwLWNoYXQ6Ly94L2RlZmF1bHQnLFxyXG5cdFx0XHRzZXNzaW9uVXJpOiAnY29kZXg6Ly94JyxcclxuXHRcdFx0d29ya3NwYWNlOiBhd2FpdCB0ZW1wV29ya3NwYWNlKCksXHJcblx0XHRcdGdvYWw6ICdmaXggaXQnLFxyXG5cdFx0fSk7XHJcblxyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsZWFkZXIuaW1wbGVtZW50ZWQsIFsnb25seSddKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3NbMF0uc3RhdHVzLCAnZXNjYWxhdGVkJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuLnN0YXR1cywgJ2NvbXBsZXRlZCcpO1xyXG5cdH0pO1xyXG5cclxuXHR0ZXN0KCdjYW5jZWwgc3RvcHMgYSBxdWV1ZWQgcnVuJywgYXN5bmMgKCkgPT4ge1xyXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcclxuXHRcdGxldCByZWxlYXNlITogKCkgPT4gdm9pZDtcclxuXHRcdGNvbnN0IGJsb2NrZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZSA9IHJlc29sdmU7IH0pO1xyXG5cdFx0c2VydmljZS5zZXRMZWFkZXIobmV3IEZha2VMZWFkZXIoe1xyXG5cdFx0XHRzdW1tYXJ5OiAnc2xvdycsXHJcblx0XHRcdGNvbnRyYWN0OiAnJyxcclxuXHRcdFx0dGFza3M6IFtcclxuXHRcdFx0XHR7IGlkOiAnYScsIHRpdGxlOiAnQScsIHByb21wdDogJ2EnLCBmaWxlczogW10sIGRlcGVuZHNPbjogW10sIHdvcmtlckhpbnQ6ICdkZWVwc2Vlay1oYXJuZXNzJyB9LFxyXG5cdFx0XHRcdHsgaWQ6ICdiJywgdGl0bGU6ICdCJywgcHJvbXB0OiAnYicsIGZpbGVzOiBbXSwgZGVwZW5kc09uOiBbJ2EnXSwgd29ya2VySGludDogJ2dyb2stYnVpbGQnIH0sXHJcblx0XHRcdF0sXHJcblx0XHR9KSk7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdkZWVwc2Vlay1oYXJuZXNzJywgJ0RlZXBTZWVrIEhhcm5lc3MnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRcdGF3YWl0IGJsb2NrZWQ7XHJcblx0XHRcdHJldHVybiB7IHN0YXR1czogJ2NvbXBsZXRlZCcsIHN1bW1hcnk6ICdhJywgY2hhbmdlZEZpbGVzOiBbXSwgdXNhZ2U6IHsgZHVyYXRpb25NczogMSB9IH07XHJcblx0XHR9KSk7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdncm9rLWJ1aWxkJywgJ0dyb2sgQnVpbGQnLCBhc3luYyAoKSA9PiAoe1xyXG5cdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLCBzdW1tYXJ5OiAnYicsIGNoYW5nZWRGaWxlczogW10sIHVzYWdlOiB7IGR1cmF0aW9uTXM6IDEgfSxcclxuXHRcdH0pKSk7XHJcblx0XHRjb25zdCBzdGFydGVkID0gc2VydmljZS5zdGFydCh7XHJcblx0XHRcdGNoYXRVcmk6ICdhaHAtY2hhdDovL3gvZGVmYXVsdCcsXHJcblx0XHRcdHNlc3Npb25Vcmk6ICdjb2RleDovL3gnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IGF3YWl0IHRlbXBXb3Jrc3BhY2UoKSxcclxuXHRcdFx0Z29hbDogJ2NhbmNlbCBtZScsXHJcblx0XHR9KTtcclxuXHRcdGF3YWl0IHRpbWVvdXQoMjApO1xyXG5cdFx0YXdhaXQgc2VydmljZS5jb21tYW5kKHsgdHlwZTogJ2NhbmNlbCcgfSk7XHJcblx0XHRyZWxlYXNlKCk7XHJcblx0XHRjb25zdCBydW4gPSBhd2FpdCBzdGFydGVkO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5zdGF0dXMsICdjYW5jZWxsZWQnKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgndXNlcyB0aGUgYXNzaWduZWQgbGVhZGVyIGV2ZW4gd2hlbiBpdCBpcyBub3QgQ29kZXgnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xyXG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXIoe1xyXG5cdFx0XHRzdW1tYXJ5OiAnZGVlcHNlZWsgbGVhZHMnLFxyXG5cdFx0XHRjb250cmFjdDogJycsXHJcblx0XHRcdHRhc2tzOiBbXHJcblx0XHRcdFx0eyBpZDogJ2EnLCB0aXRsZTogJ0EnLCBwcm9tcHQ6ICdhJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFtdLCB3b3JrZXJIaW50OiAnY29kZXgnIH0sXHJcblx0XHRcdFx0eyBpZDogJ2InLCB0aXRsZTogJ0InLCBwcm9tcHQ6ICdiJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFtdLCB3b3JrZXJIaW50OiAnZ3Jvay1idWlsZCcgfSxcclxuXHRcdFx0XSxcclxuXHRcdH0sICdkZWVwc2Vlay1oYXJuZXNzJyk7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyTGVhZGVyKGxlYWRlcik7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdjb2RleCcsICdDb2RleCcsIGFzeW5jICgpID0+ICh7XHJcblx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsIHN1bW1hcnk6ICdhJywgY2hhbmdlZEZpbGVzOiBbJ2EudHMnXSwgdXNhZ2U6IHsgZHVyYXRpb25NczogMSB9LFxyXG5cdFx0fSkpKTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2dyb2stYnVpbGQnLCAnR3JvayBCdWlsZCcsIGFzeW5jICgpID0+ICh7XHJcblx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsIHN1bW1hcnk6ICdiJywgY2hhbmdlZEZpbGVzOiBbJ2IudHMnXSwgdXNhZ2U6IHsgZHVyYXRpb25NczogMSB9LFxyXG5cdFx0fSkpKTtcclxuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoe1xyXG5cdFx0XHRjaGF0VXJpOiAnYWhwLWNoYXQ6Ly94L2RlZmF1bHQnLFxyXG5cdFx0XHRzZXNzaW9uVXJpOiAnY29kZXg6Ly94JyxcclxuXHRcdFx0d29ya3NwYWNlOiBhd2FpdCB0ZW1wV29ya3NwYWNlKCksXHJcblx0XHRcdGdvYWw6ICdyb3RhdGUgcm9sZXMnLFxyXG5cdFx0XHRhc3NpZ25tZW50OiB7XHJcblx0XHRcdFx0bGVhZGVyOiB7IHByb3ZpZGVySWQ6ICdkZWVwc2Vlay1oYXJuZXNzJywgbGFiZWw6ICdEZWVwU2VlayBIYXJuZXNzJywgcm9sZTogJ2xlYWRlcicgfSxcclxuXHRcdFx0XHR3b3JrZXJzOiBbXHJcblx0XHRcdFx0XHR7IHByb3ZpZGVySWQ6ICdjb2RleCcsIGxhYmVsOiAnQ29kZXgnLCByb2xlOiAnd29ya2VyJyB9LFxyXG5cdFx0XHRcdFx0eyBwcm92aWRlcklkOiAnZ3Jvay1idWlsZCcsIGxhYmVsOiAnR3JvayBCdWlsZCcsIHJvbGU6ICd3b3JrZXInIH0sXHJcblx0XHRcdFx0XSxcclxuXHRcdFx0fSxcclxuXHRcdH0pO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5hc3NpZ25tZW50LmxlYWRlci5wcm92aWRlcklkLCAnZGVlcHNlZWstaGFybmVzcycpO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlYWRlci5yZXZpZXdzLCAxKTtcclxuXHRcdGFzc2VydC5vayhydW4udGFza3Muc29tZSh0YXNrID0+IHRhc2sud29ya2VyUHJvdmlkZXJJZCA9PT0gJ2NvZGV4JykpO1xyXG5cdFx0YXNzZXJ0Lm9rKHJ1bi50YXNrcy5zb21lKHRhc2sgPT4gdGFzay53b3JrZXJQcm92aWRlcklkID09PSAnZ3Jvay1idWlsZCcpKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgnZmFsbHMgYmFjayB0byBDb2RleCB3aGVuIGFuIGFzc2lnbmVkIENMSSB3b3JrZXIgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xyXG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXIoe1xyXG5cdFx0XHRzdW1tYXJ5OiAncGFyYWxsZWwnLFxyXG5cdFx0XHRjb250cmFjdDogJ3NtYWxsIHBhdGNoZXMnLFxyXG5cdFx0XHR0YXNrczogW1xyXG5cdFx0XHRcdHsgaWQ6ICdhJywgdGl0bGU6ICdBJywgcHJvbXB0OiAnZG8gYScsIGZpbGVzOiBbXSwgZGVwZW5kc09uOiBbXSwgd29ya2VySGludDogJ2RlZXBzZWVrLWhhcm5lc3MnIH0sXHJcblx0XHRcdF0sXHJcblx0XHR9KTtcclxuXHRcdHNlcnZpY2Uuc2V0TGVhZGVyKGxlYWRlcik7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKHtcclxuXHRcdFx0aWQ6ICdkZWVwc2Vlay1oYXJuZXNzJyxcclxuXHRcdFx0bGFiZWw6ICdEZWVwU2VlayBIYXJuZXNzJyxcclxuXHRcdFx0ZGVmYXVsdE1vZGVsOiAnZGVlcHNlZWstdjQtZmxhc2gnLFxyXG5cdFx0XHRjaGVja0F2YWlsYWJpbGl0eTogYXN5bmMgKCkgPT4gKHsgYXZhaWxhYmxlOiBmYWxzZSwgY3JlZGVudGlhbFNvdXJjZTogJ25vbmUnLCByZWFzb246ICdtaXNzaW5nLWNyZWRlbnRpYWxzJyB9KSxcclxuXHRcdFx0aXNBdmFpbGFibGU6IGFzeW5jICgpID0+IGZhbHNlLFxyXG5cdFx0XHRydW46IGFzeW5jICgpID0+ICh7IHN0YXR1czogJ2ZhaWxlZCcsIHN1bW1hcnk6ICcnLCBjaGFuZ2VkRmlsZXM6IFtdLCB1c2FnZTogeyBkdXJhdGlvbk1zOiAwIH0gfSksXHJcblx0XHR9KTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2NvZGV4JywgJ0NvZGV4JywgYXN5bmMgKCkgPT4gKHtcclxuXHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogJ2NvZGV4IGZhbGxiYWNrJywgY2hhbmdlZEZpbGVzOiBbJ2ZhbGxiYWNrLnRzJ10sIHVzYWdlOiB7IGR1cmF0aW9uTXM6IDEgfSxcclxuXHRcdH0pKSk7XHJcblxyXG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgc2VydmljZS5zdGFydCh7XHJcblx0XHRcdGNoYXRVcmk6ICdhaHAtY2hhdDovL3gvZGVmYXVsdCcsXHJcblx0XHRcdHNlc3Npb25Vcmk6ICdjb2RleDovL3gnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IGF3YWl0IHRlbXBXb3Jrc3BhY2UoKSxcclxuXHRcdFx0Z29hbDogJ1VzZSBjb2RleCBmYWxsYmFjaycsXHJcblx0XHRcdG1vZGU6ICdkaWFsZWN0aWMnLFxyXG5cdFx0fSk7XHJcblxyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5zdGF0dXMsICdjb21wbGV0ZWQnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3NbMF0ucmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZCwgJ2RlZXBzZWVrLWhhcm5lc3MnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3NbMF0ucmVzb2x2ZWRXb3JrZXJQcm92aWRlcklkLCAnY29kZXgnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3NbMF0ud29ya2VyUHJvdmlkZXJJZCwgJ2NvZGV4Jyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuLnRhc2tzWzBdLndvcmtlckZhbGxiYWNrUmVhc29uLCAnbWlzc2luZy1jcmVkZW50aWFscycpO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi50YXNrc1swXS5zdGF0dXMsICdjb21wbGV0ZWQnKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgnbG9nb3MgbW9kZSBydW5zIHRoZSBzZWxlY3RlZCBhZ2VudCB3aXRob3V0IGEgbGVhZGVyIHBsYW4nLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xyXG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXIoeyBzdW1tYXJ5OiAnJywgY29udHJhY3Q6ICcnLCB0YXNrczogW10gfSwgJ2dyb2stYnVpbGQnKTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJMZWFkZXIobGVhZGVyKTtcclxuXHRcdGxldCB3b3JrZXJSYW4gPSBmYWxzZTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2dyb2stYnVpbGQnLCAnR3JvayBCdWlsZCcsIGFzeW5jICgpID0+IHtcclxuXHRcdFx0d29ya2VyUmFuID0gdHJ1ZTtcclxuXHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogJ3dvcmtlciBtdXN0IG5vdCBydW4nLCBjaGFuZ2VkRmlsZXM6IFsneC50cyddLCB1c2FnZTogeyBkdXJhdGlvbk1zOiAzIH0gfTtcclxuXHRcdH0pKTtcclxuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoe1xyXG5cdFx0XHRjaGF0VXJpOiAnYWhwLWNoYXQ6Ly94L2RlZmF1bHQnLFxyXG5cdFx0XHRzZXNzaW9uVXJpOiAnY29kZXg6Ly94JyxcclxuXHRcdFx0d29ya3NwYWNlOiBhd2FpdCB0ZW1wRGlyKCksXHJcblx0XHRcdGdvYWw6ICdXcml0ZSB0aGUgaGVscGVyJyxcclxuXHRcdFx0bW9kZTogJ2xvZ29zJyxcclxuXHRcdFx0YXNzaWdubWVudDoge1xyXG5cdFx0XHRcdGxlYWRlcjogeyBwcm92aWRlcklkOiAnZ3Jvay1idWlsZCcsIGxhYmVsOiAnR3JvayBCdWlsZCcsIG1vZGVsOiAnZ3Jvay00LjYnLCB0aGlua2luZ0xldmVsOiAnaGlnaCcsIHJvbGU6ICdsZWFkZXInIH0sXHJcblx0XHRcdFx0d29ya2VyczogW3sgcHJvdmlkZXJJZDogJ2dyb2stYnVpbGQnLCBsYWJlbDogJ0dyb2sgQnVpbGQnLCBtb2RlbDogJ2dyb2stNC42Jywgcm9sZTogJ3dvcmtlcicgfV0sXHJcblx0XHRcdH0sXHJcblx0XHR9KTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXJSYW4sIGZhbHNlKTtcclxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGVhZGVyLmNoYXRzLCBbJ1dyaXRlIHRoZSBoZWxwZXInXSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuLnN0YXR1cywgJ2NvbXBsZXRlZCcpO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5hc3NpZ25tZW50LndvcmtlcnMubGVuZ3RoLCAwKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3MubGVuZ3RoLCAxKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3NbMF0ud29ya2VyUHJvdmlkZXJJZCwgJ2dyb2stYnVpbGQnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4udGFza3NbMF0udGhpbmtpbmdMZXZlbCwgJ2hpZ2gnKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgnbG9nb3MgbW9kZSBpZ25vcmVzIHN0b3JlZCBkaWFsZWN0aWMgd29ya2VycyBhbmQgZG9lcyBub3QgcmVxdWlyZSBnaXQnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNvbmZpZyB9ID0gY3JlYXRlSGFybmVzcygpO1xyXG5cdFx0Y29uZmlnLnVwZGF0ZVJvb3RDb25maWcoeyBbRk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UX0tFWV06IERFRkFVTFRfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UIH0pO1xyXG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtlcihuZXcgRmFrZVdvcmtlcignZGVlcHNlZWstaGFybmVzcycsICdEZWVwU2VlayBIYXJuZXNzJywgYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2RpYWxlY3RpYyB3b3JrZXIgbXVzdCBub3QgcnVuIGluIGxvZ29zJyk7XHJcblx0XHR9KSk7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdncm9rLWJ1aWxkJywgJ0dyb2sgQnVpbGQnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcignZGlhbGVjdGljIHdvcmtlciBtdXN0IG5vdCBydW4gaW4gbG9nb3MnKTtcclxuXHRcdH0pKTtcclxuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoe1xyXG5cdFx0XHRjaGF0VXJpOiAnYWhwLWNoYXQ6Ly94L2RlZmF1bHQnLFxyXG5cdFx0XHRzZXNzaW9uVXJpOiAnY29kZXg6Ly94JyxcclxuXHRcdFx0d29ya3NwYWNlOiBhd2FpdCB0ZW1wRGlyKCksXHJcblx0XHRcdGdvYWw6ICdoZWxsbycsXHJcblx0XHRcdG1vZGU6ICdsb2dvcycsXHJcblx0XHR9KTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4uYXNzaWdubWVudC5sZWFkZXIucHJvdmlkZXJJZCwgJ2NvZGV4Jyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuLmFzc2lnbm1lbnQud29ya2Vycy5sZW5ndGgsIDApO1xyXG5cdFx0Y29uc3QgbWVzc2FnZSA9IHJ1bi50YXNrc1swXT8uZXJyb3IgPz8gcnVuLmVycm9yID8/ICcnO1xyXG5cdFx0YXNzZXJ0Lm9rKG1lc3NhZ2UuaW5jbHVkZXMoJ3VuYXZhaWxhYmxlJyksIG1lc3NhZ2UpO1xyXG5cdFx0YXNzZXJ0Lm9rKCFtZXNzYWdlLmluY2x1ZGVzKCdHaXQgd29ya3NwYWNlJyksIG1lc3NhZ2UpO1xyXG5cdH0pO1xyXG5cclxuXHR0ZXN0KCdkaWFsZWN0aWMgd29ya2VycyBzdGlsbCByZXF1aXJlIGEgZ2l0IHdvcmtzcGFjZScsIGFzeW5jICgpID0+IHtcclxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XHJcblx0XHRzZXJ2aWNlLnNldExlYWRlcihuZXcgRmFrZUxlYWRlcih7XHJcblx0XHRcdHN1bW1hcnk6ICdvbmUgdGFzaycsXHJcblx0XHRcdGNvbnRyYWN0OiAnJyxcclxuXHRcdFx0dGFza3M6IFt7IGlkOiAnYScsIHRpdGxlOiAnQScsIHByb21wdDogJ2RvIGEnLCBmaWxlczogW10sIGRlcGVuZHNPbjogW10sIHdvcmtlckhpbnQ6ICdkZWVwc2Vlay1oYXJuZXNzJyB9XSxcclxuXHRcdH0pKTtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2RlZXBzZWVrLWhhcm5lc3MnLCAnRGVlcFNlZWsgSGFybmVzcycsIGFzeW5jICgpID0+ICh7XHJcblx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsIHN1bW1hcnk6ICdzaG91bGQgbm90IHJ1bicsIGNoYW5nZWRGaWxlczogW10sIHVzYWdlOiB7IGR1cmF0aW9uTXM6IDEgfSxcclxuXHRcdH0pKSk7XHJcblx0XHRjb25zdCBydW4gPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KHtcclxuXHRcdFx0Y2hhdFVyaTogJ2FocC1jaGF0Oi8veC9kZWZhdWx0JyxcclxuXHRcdFx0c2Vzc2lvblVyaTogJ2NvZGV4Oi8veCcsXHJcblx0XHRcdHdvcmtzcGFjZTogYXdhaXQgdGVtcERpcigpLFxyXG5cdFx0XHRnb2FsOiAnTmVlZCBnaXQgaXNvbGF0aW9uJyxcclxuXHRcdFx0bW9kZTogJ2RpYWxlY3RpYycsXHJcblx0XHR9KTtcclxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChydW4uc3RhdHVzLCAnY29tcGxldGVkJyk7XHJcblx0XHRhc3NlcnQub2soKHJ1bi50YXNrc1swXT8uZXJyb3IgPz8gcnVuLmVycm9yID8/ICcnKS5pbmNsdWRlcygnR2l0IHdvcmtzcGFjZScpKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgnZG9lcyBub3QgbWVyZ2UgcGFydGlhbCBlZGl0cyBmcm9tIGEgZmFpbGVkIHdvcmtlcicsIGFzeW5jICgpID0+IHtcclxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XHJcblx0XHRzZXJ2aWNlLnNldExlYWRlcihuZXcgRmFrZUxlYWRlcih7XHJcblx0XHRcdHN1bW1hcnk6ICdvbmUgdGFzaycsXHJcblx0XHRcdGNvbnRyYWN0OiAnJyxcclxuXHRcdFx0dGFza3M6IFt7IGlkOiAncGFydGlhbCcsIHRpdGxlOiAnUGFydGlhbCcsIHByb21wdDogJ2ZhaWwgYWZ0ZXIgZWRpdCcsIGZpbGVzOiBbJ2ZhaWxlZC50eHQnXSwgZGVwZW5kc09uOiBbXSwgd29ya2VySGludDogJ2RlZXBzZWVrLWhhcm5lc3MnIH1dLFxyXG5cdFx0fSkpO1xyXG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtlcihuZXcgRmFrZVdvcmtlcignZGVlcHNlZWstaGFybmVzcycsICdEZWVwU2VlayBIYXJuZXNzJywgYXN5bmMgKF9wcm9tcHQsIHdvcmtzcGFjZSkgPT4ge1xyXG5cdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbih3b3Jrc3BhY2UsICdmYWlsZWQudHh0JyksICdtdXN0IG5vdCBtZXJnZVxcbicpO1xyXG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdmYWlsZWQnLCBzdW1tYXJ5OiAnJywgY2hhbmdlZEZpbGVzOiBbJ2ZhaWxlZC50eHQnXSwgZXJyb3I6ICd3b3JrZXIgZmFpbGVkJywgdXNhZ2U6IHsgZHVyYXRpb25NczogMSB9IH07XHJcblx0XHR9KSk7XHJcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCB0ZW1wV29ya3NwYWNlKCk7XHJcblx0XHRjb25zdCBydW4gPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KHtcclxuXHRcdFx0Y2hhdFVyaTogJ2FocC1jaGF0Oi8veC9kZWZhdWx0JyxcclxuXHRcdFx0c2Vzc2lvblVyaTogJ2NvZGV4Oi8veCcsXHJcblx0XHRcdHdvcmtzcGFjZSxcclxuXHRcdFx0Z29hbDogJ2tlZXAgZmFpbGVkIGVkaXRzIGlzb2xhdGVkJyxcclxuXHRcdH0pO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5zdGF0dXMsICdjb21wbGV0ZWQnKTtcclxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGFjY2Vzcyhqb2luKHdvcmtzcGFjZSwgJ2ZhaWxlZC50eHQnKSkpO1xyXG5cdH0pO1xyXG5cclxuXHR0ZXN0KCdtYXJrcyBkZXBlbmRlbmN5IGN5Y2xlcyBhcyBmYWlsZWQgaW5zdGVhZCBvZiBjb21wbGV0ZWQnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xyXG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXIoe1xyXG5cdFx0XHRzdW1tYXJ5OiAnY3ljbGUnLFxyXG5cdFx0XHRjb250cmFjdDogJycsXHJcblx0XHRcdHRhc2tzOiBbXHJcblx0XHRcdFx0eyBpZDogJ2EnLCB0aXRsZTogJ0EnLCBwcm9tcHQ6ICdhJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFsnYiddLCB3b3JrZXJIaW50OiAnZGVlcHNlZWstaGFybmVzcycgfSxcclxuXHRcdFx0XHR7IGlkOiAnYicsIHRpdGxlOiAnQicsIHByb21wdDogJ2InLCBmaWxlczogW10sIGRlcGVuZHNPbjogWydhJ10sIHdvcmtlckhpbnQ6ICdncm9rLWJ1aWxkJyB9LFxyXG5cdFx0XHRdLFxyXG5cdFx0fSk7XHJcblx0XHRzZXJ2aWNlLnNldExlYWRlcihsZWFkZXIpO1xyXG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgc2VydmljZS5zdGFydCh7XHJcblx0XHRcdGNoYXRVcmk6ICdhaHAtY2hhdDovL3gvZGVmYXVsdCcsXHJcblx0XHRcdHNlc3Npb25Vcmk6ICdjb2RleDovL3gnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IGF3YWl0IHRlbXBXb3Jrc3BhY2UoKSxcclxuXHRcdFx0Z29hbDogJ3JlamVjdCBjeWNsZScsXHJcblx0XHR9KTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4uc3RhdHVzLCAnZmFpbGVkJyk7XHJcblx0XHRhc3NlcnQub2socnVuLnRhc2tzLmV2ZXJ5KHRhc2sgPT4gdGFzay5zdGF0dXMgPT09ICdmYWlsZWQnKSk7XHJcblx0XHRhc3NlcnQubWF0Y2gocnVuLnRhc2tzWzBdLmVycm9yID8/ICcnLCAvZGVwZW5kZW5jaWVzfGN5Y2xlL2kpO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlYWRlci5yZXZpZXdzLCAxKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgncGF1c2UgYWJvcnRzIHRoZSBhY3RpdmUgd29ya2VyIGFuZCByZXN1bWUgcnVucyB0aGUgcXVldWVkIHRhc2snLCBhc3luYyBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLnRpbWVvdXQoNV8wMDApO1xyXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcclxuXHRcdHNlcnZpY2Uuc2V0TGVhZGVyKG5ldyBGYWtlTGVhZGVyKHtcclxuXHRcdFx0c3VtbWFyeTogJ3BhdXNlJyxcclxuXHRcdFx0Y29udHJhY3Q6ICcnLFxyXG5cdFx0XHR0YXNrczogW3sgaWQ6ICdhJywgdGl0bGU6ICdBJywgcHJvbXB0OiAnYScsIGZpbGVzOiBbXSwgZGVwZW5kc09uOiBbXSwgd29ya2VySGludDogJ2RlZXBzZWVrLWhhcm5lc3MnIH1dLFxyXG5cdFx0fSkpO1xyXG5cdFx0bGV0IGF0dGVtcHRzID0gMDtcclxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3JrZXIobmV3IEZha2VXb3JrZXIoJ2RlZXBzZWVrLWhhcm5lc3MnLCAnRGVlcFNlZWsgSGFybmVzcycsIGFzeW5jIChfcHJvbXB0LCBfd29ya3NwYWNlLCBhYm9ydCkgPT4ge1xyXG5cdFx0XHRhdHRlbXB0cysrO1xyXG5cdFx0XHRpZiAoYXR0ZW1wdHMgPT09IDEpIHtcclxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcclxuXHRcdFx0XHRcdGlmIChhYm9ydC5hYm9ydGVkKSB7XHJcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcclxuXHRcdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRcdGFib3J0LmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4gcmVzb2x2ZSgpLCB7IG9uY2U6IHRydWUgfSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogJ2RvbmUnLCBjaGFuZ2VkRmlsZXM6IFtdLCB1c2FnZTogeyBkdXJhdGlvbk1zOiAxIH0gfTtcclxuXHRcdH0pKTtcclxuXHRcdGNvbnN0IHN0YXJ0ZWQgPSBzZXJ2aWNlLnN0YXJ0KHtcclxuXHRcdFx0Y2hhdFVyaTogJ2FocC1jaGF0Oi8veC9kZWZhdWx0JyxcclxuXHRcdFx0c2Vzc2lvblVyaTogJ2NvZGV4Oi8veCcsXHJcblx0XHRcdHdvcmtzcGFjZTogYXdhaXQgdGVtcFdvcmtzcGFjZSgpLFxyXG5cdFx0XHRnb2FsOiAncGF1c2UgYW5kIHJlc3VtZScsXHJcblx0XHR9KTtcclxuXHRcdHdoaWxlIChhdHRlbXB0cyAhPT0gMSkge1xyXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcclxuXHRcdH1cclxuXHRcdGF3YWl0IHNlcnZpY2UuY29tbWFuZCh7IHR5cGU6ICdwYXVzZScgfSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHN0YXJ0ZWQpLnN0YXR1cywgJ3BhdXNlZCcpO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhdGU/LnRhc2tzWzBdLnN0YXR1cywgJ3F1ZXVlZCcpO1xyXG5cdFx0YXdhaXQgc2VydmljZS5jb21tYW5kKHsgdHlwZTogJ3Jlc3VtZScgfSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZT8uc3RhdHVzLCAnY29tcGxldGVkJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZT8udGFza3NbMF0uc3RhdHVzLCAnY29tcGxldGVkJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0ZW1wdHMsIDIpO1xyXG5cdH0pO1xyXG5cclxuXHR0ZXN0KCdwYXVzZSBkdXJpbmcgcGxhbm5pbmcgcmVzdGFydHMgcGxhbm5pbmcgb24gcmVzdW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy50aW1lb3V0KDVfMDAwKTtcclxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XHJcblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgUGF1c2luZ1BsYW5MZWFkZXIoKTtcclxuXHRcdHNlcnZpY2Uuc2V0TGVhZGVyKGxlYWRlcik7XHJcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya2VyKG5ldyBGYWtlV29ya2VyKCdkZWVwc2Vlay1oYXJuZXNzJywgJ0RlZXBTZWVrIEhhcm5lc3MnLCBhc3luYyAoKSA9PiAoe1xyXG5cdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLCBzdW1tYXJ5OiAnZG9uZScsIGNoYW5nZWRGaWxlczogW10sIHVzYWdlOiB7IGR1cmF0aW9uTXM6IDEgfSxcclxuXHRcdH0pKSk7XHJcblx0XHRjb25zdCBzdGFydGVkID0gc2VydmljZS5zdGFydCh7XHJcblx0XHRcdGNoYXRVcmk6ICdhaHAtY2hhdDovL3gvZGVmYXVsdCcsXHJcblx0XHRcdHNlc3Npb25Vcmk6ICdjb2RleDovL3gnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IGF3YWl0IHRlbXBXb3Jrc3BhY2UoKSxcclxuXHRcdFx0Z29hbDogJ3BhdXNlIHBsYW5uaW5nJyxcclxuXHRcdH0pO1xyXG5cdFx0d2hpbGUgKGxlYWRlci5wbGFucyAhPT0gMSkge1xyXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcclxuXHRcdH1cclxuXHRcdGF3YWl0IHNlcnZpY2UuY29tbWFuZCh7IHR5cGU6ICdwYXVzZScgfSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHN0YXJ0ZWQpLnN0YXR1cywgJ3BhdXNlZCcpO1xyXG5cdFx0YXdhaXQgc2VydmljZS5jb21tYW5kKHsgdHlwZTogJ3Jlc3VtZScgfSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZT8uc3RhdHVzLCAnY29tcGxldGVkJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZT8udGFza3NbMF0uc3RhdHVzLCAnY29tcGxldGVkJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVhZGVyLnBsYW5zLCAyKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWFkZXIucmV2aWV3cywgMSk7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ2EgZmFpbGVkIGxlYWRlciByZXZpZXcgdGVybWluYXRlcyB0aGUgcnVuIGluc3RlYWQgb2YgbGVhdmluZyBpdCByZXZpZXdpbmcnLCBhc3luYyAoKSA9PiB7XHJcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xyXG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXIoe1xyXG5cdFx0XHRzdW1tYXJ5OiAncmV2aWV3IGZhaWx1cmUnLFxyXG5cdFx0XHRjb250cmFjdDogJycsXHJcblx0XHRcdHRhc2tzOiBbeyBpZDogJ2EnLCB0aXRsZTogJ0EnLCBwcm9tcHQ6ICdhJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFtdLCB3b3JrZXJIaW50OiAnZGVlcHNlZWstaGFybmVzcycgfV0sXHJcblx0XHR9KTtcclxuXHRcdGxlYWRlci5yZXZpZXcgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigncmV2aWV3IHVuYXZhaWxhYmxlJyk7IH07XHJcblx0XHRzZXJ2aWNlLnNldExlYWRlcihsZWFkZXIpO1xyXG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtlcihuZXcgRmFrZVdvcmtlcignZGVlcHNlZWstaGFybmVzcycsICdEZWVwU2VlayBIYXJuZXNzJywgYXN5bmMgKCkgPT4gKHtcclxuXHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogJ2RvbmUnLCBjaGFuZ2VkRmlsZXM6IFtdLCB1c2FnZTogeyBkdXJhdGlvbk1zOiAxIH0sXHJcblx0XHR9KSkpO1xyXG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgc2VydmljZS5zdGFydCh7XHJcblx0XHRcdGNoYXRVcmk6ICdhaHAtY2hhdDovL3gvZGVmYXVsdCcsXHJcblx0XHRcdHNlc3Npb25Vcmk6ICdjb2RleDovL3gnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IGF3YWl0IHRlbXBXb3Jrc3BhY2UoKSxcclxuXHRcdFx0Z29hbDogJ2hhbmRsZSByZXZpZXcgZmFpbHVyZScsXHJcblx0XHR9KTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4uc3RhdHVzLCAnZmFpbGVkJyk7XHJcblx0XHRhc3NlcnQubWF0Y2gocnVuLmVycm9yID8/ICcnLCAvcmV2aWV3IHVuYXZhaWxhYmxlLyk7XHJcblx0fSk7XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxRQUFRLFNBQVMsSUFBSSxpQkFBaUI7QUFDL0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxrQ0FBa0MsMENBQTBDO0FBRXJGLFNBQVMsT0FBTyxLQUFhLE1BQXdDO0FBQ3BFLFNBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3ZDLGFBQVMsT0FBTyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUUsS0FBSyxhQUFhLEtBQUssR0FBRyxXQUFTLFFBQVEsT0FBTyxLQUFLLElBQUksUUFBUSxDQUFDO0FBQUEsRUFDbEcsQ0FBQztBQUNGO0FBRUEsTUFBTSxXQUFzQztBQUFBLEVBSzNDLFlBQ2tCLE9BQ1IsS0FBSyxTQUNiO0FBRmdCO0FBQ1I7QUFMVixTQUFPLFVBQVU7QUFDakIsU0FB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
