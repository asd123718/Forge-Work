var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ILogService } from "../../../log/common/log.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import {
  DEFAULT_ORCHESTRATION_ASSIGNMENT,
  FORGE_ORCHESTRATION_ASSIGNMENT_KEY,
  FORGE_ORCHESTRATION_COMMAND_KEY,
  FORGE_ORCHESTRATION_REQUEST_KEY,
  FORGE_ORCHESTRATION_STATE_KEY,
  isolateLogosAssignment,
  isOrchestrationRequest,
  orchestrationAgentInfo,
  readAssignment
} from "../../common/orchestration/orchestrationTypes.js";
import { readyTaskIds } from "../../common/orchestration/taskGraph.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { CodexLeaderProvider, CodexWorkerProvider, LocalLeaderProvider } from "./codexLeader.js";
import { createDeepSeekLeader, createGrokLeader } from "./cliLeader.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
import { createNodeProcessRunner, DeepSeekHarnessWorker, GrokBuildWorker, resolveDeepSeekCommand, resolveGrokCommand } from "./workerAdapters.js";
import { openWorkerWorkspace } from "./workerWorkspace.js";
import { CODEX_MODELS_ROOT_CONFIG_KEY, normalizeCodexModelsConfig } from "../../common/codexModelsConfig.js";
import { parseForgeVendorAccountInfo, vendorAccountMetaKey } from "../../common/forgeVendorAccount.js";
import { findOfficialModelProvider, officialApiFallbackReady, remainingPercentFromUsed } from "../../common/officialModelCards.js";
import { getVendorAccountSecret, providerSecretId } from "./vendorAccountSecrets.js";
const MAX_TASK_ATTEMPTS = 2;
let ForgeOrchestrationService = class extends Disposable {
  constructor(_configuration, stateManager, _logService, environment) {
    super();
    this._configuration = _configuration;
    this._logService = _logService;
    this._paused = false;
    this._workers = /* @__PURE__ */ new Map();
    this._leaders = /* @__PURE__ */ new Map();
    this._fallbackLeader = new LocalLeaderProvider();
    this._activeLeader = this._fallbackLeader;
    this._transcriptPublishPending = false;
    const runner = createNodeProcessRunner();
    const repoRoot = environment.appRoot;
    const resolveDeepSeek = async () => resolveDeepSeekCommand(repoRoot, this._workerEnv("deepseek"));
    const resolveGrok = async () => resolveGrokCommand(repoRoot, this._workerEnv("grok"));
    this._workers.set("codex", new CodexWorkerProvider(() => this._getCodex?.(), stateManager, this._logService));
    this._workers.set("deepseek-harness", new DeepSeekHarnessWorker(runner, resolveDeepSeek));
    this._workers.set("grok-build", new GrokBuildWorker(runner, resolveGrok, "grok-4.6"));
    this._leaders.set("codex", new CodexLeaderProvider(() => this._getCodex?.(), stateManager, this._fallbackLeader, this._logService));
    this._leaders.set("deepseek-harness", createDeepSeekLeader(runner, resolveDeepSeek, this._fallbackLeader));
    this._leaders.set("grok-build", createGrokLeader(runner, resolveGrok, this._fallbackLeader));
    this._activeLeader = this._leaders.get("codex") ?? this._fallbackLeader;
    this._register(toDisposable(() => this._abort?.abort()));
    this._register(this._configuration.onDidRootConfigChange(() => this._onRootConfig()));
    this._configuration.publishRootTransientValues?.({
      [FORGE_ORCHESTRATION_REQUEST_KEY]: void 0,
      [FORGE_ORCHESTRATION_COMMAND_KEY]: void 0,
      [FORGE_ORCHESTRATION_STATE_KEY]: void 0
    });
    this._publish();
  }
  bindCodex(getAgent) {
    this._getCodex = getAgent;
  }
  registerWorker(worker) {
    this._workers.set(worker.id, worker);
  }
  registerLeader(leader) {
    this._leaders.set(leader.id, leader);
  }
  setLeader(leader) {
    this._overrideLeader = leader;
    this._activeLeader = leader;
  }
  get state() {
    return this._run;
  }
  _onRootConfig() {
    const values = this._configuration.getRootConfigValues?.() ?? {};
    const request = values[FORGE_ORCHESTRATION_REQUEST_KEY];
    if (isOrchestrationRequest(request) && request.requestId !== this._lastRequestId) {
      this._lastRequestId = request.requestId ?? request.goal;
      this._configuration.updateRootConfig({ [FORGE_ORCHESTRATION_REQUEST_KEY]: { consumed: this._lastRequestId } });
      void this.start(request).catch((error) => {
        this._logService.error(`[ForgeOrchestration] run failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    const command = values[FORGE_ORCHESTRATION_COMMAND_KEY];
    if (command && typeof command === "object" && !Array.isArray(command) && typeof command.type === "string") {
      const typed = command;
      if (typed.commandId && typed.commandId === this._lastCommandId) {
        return;
      }
      this._lastCommandId = typed.commandId ?? `${typed.type}:${typed.taskId ?? ""}`;
      this._configuration.updateRootConfig({ [FORGE_ORCHESTRATION_COMMAND_KEY]: { consumed: this._lastCommandId } });
      void this.command(typed).catch((error) => {
        this._logService.error(`[ForgeOrchestration] command failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }
  async start(request) {
    this._abort?.abort();
    this._abort = new AbortController();
    this._paused = false;
    const stored = readAssignment(this._configuration.getRootConfigValues?.()?.[FORGE_ORCHESTRATION_ASSIGNMENT_KEY]);
    const assignment = request.mode === "logos" ? isolateLogosAssignment(request.assignment) : stored ?? request.assignment ?? DEFAULT_ORCHESTRATION_ASSIGNMENT;
    this._run = {
      runId: generateUuid(),
      mode: request.mode ?? "dialectic",
      status: request.mode === "logos" ? "running" : "planning",
      goal: request.goal,
      chatUri: request.chatUri,
      sessionUri: request.sessionUri,
      workspace: request.workspace,
      assignment,
      tasks: [],
      transcript: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      usage: emptyUsage()
    };
    const runId = this._run.runId;
    this._publish();
    try {
      this._activeLeader = this._leaderFor(assignment);
      if (request.mode === "logos") {
        return await this._runLogos(request, assignment, this._abort.signal);
      }
      const planEntryId = this._beginTranscript("leader-plan", assignment.leader.label, "\u89C4\u5212");
      const plan = await this._activeLeader.plan({
        goal: request.goal,
        workspace: request.workspace,
        chatUri: request.chatUri,
        sessionUri: request.sessionUri,
        leader: assignment.leader,
        workers: assignment.workers,
        hooks: this._transcriptHooks(planEntryId)
      }, this._abort.signal);
      if (!this._isCurrentRun(runId) || this._abort.signal.aborted) {
        return this._run;
      }
      this._completeTranscript(planEntryId, plan.summary, "completed");
      this._run = {
        ...this._run,
        status: "running",
        planSummary: plan.summary,
        contract: plan.contract,
        tasks: plan.tasks.map((task, index) => this._toTaskState(task, assignment, index)),
        updatedAt: Date.now()
      };
      this._publish();
      await this._pump(runId, this._abort.signal);
      if (this._run.status === "cancelled" || this._run.status === "paused") {
        return this._run;
      }
      return await this._finalizeRun(runId, this._abort.signal);
    } catch (error) {
      if (this._run && this._isCurrentRun(runId)) {
        this._run = {
          ...this._run,
          status: this._paused ? "paused" : this._abort?.signal.aborted ? "cancelled" : "failed",
          error: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now()
        };
        this._publish();
        return this._run;
      }
      throw error;
    }
  }
  async command(command) {
    if (!this._run || command.runId && command.runId !== this._run.runId) {
      return;
    }
    if (command.type === "cancel") {
      this._abort?.abort();
      this._run = { ...this._run, status: "cancelled", updatedAt: Date.now() };
      this._publish();
      return;
    }
    if (command.type === "pause") {
      this._paused = true;
      this._abort?.abort();
      this._run = {
        ...this._run,
        status: "paused",
        transcript: (this._run.transcript ?? []).map((entry) => entry.status === "running" ? {
          ...entry,
          status: "failed",
          output: "Paused"
        } : entry),
        tasks: this._run.tasks.map((task2) => task2.status === "running" ? {
          ...task2,
          status: "queued",
          attempt: Math.max(0, task2.attempt - 1)
        } : task2),
        updatedAt: Date.now()
      };
      this._publish();
      return;
    }
    if (command.type === "resume") {
      this._paused = false;
      this._abort = new AbortController();
      this._run = { ...this._run, status: "running", updatedAt: Date.now() };
      this._publish();
      const runId = this._run.runId;
      if (this._run.mode !== "logos" && this._run.tasks.length === 0) {
        if (!await this._resumePlanning(runId, this._abort.signal)) {
          return;
        }
      }
      await this._continueRun(runId, this._abort.signal);
      return;
    }
    if (!command.taskId) {
      return;
    }
    const task = this._run.tasks.find((candidate) => candidate.id === command.taskId);
    if (!task) {
      return;
    }
    if (command.type === "retry") {
      this._updateTask(task.id, { status: "queued", attempt: 0, result: void 0, error: void 0 });
      this._paused = false;
      this._abort = new AbortController();
      this._run = { ...this._run, status: "running", updatedAt: Date.now() };
      this._publish();
      await this._continueRun(this._run.runId, this._abort.signal);
      return;
    }
    if (command.type === "escalate") {
      if (this._run.mode === "logos") {
        this._updateTask(task.id, { status: "queued", attempt: 0, result: void 0, error: void 0 });
        this._paused = false;
        this._abort = new AbortController();
        this._run = { ...this._run, status: "running", updatedAt: Date.now() };
        this._publish();
        await this._continueRun(this._run.runId, this._abort.signal);
        return;
      }
      const runId = this._run.runId;
      await this._escalate(task, runId, this._abort?.signal ?? new AbortController().signal);
      if (this._isCurrentRun(runId) && this._run.status !== "paused" && this._run.status !== "cancelled") {
        await this._pump(runId, this._abort?.signal ?? new AbortController().signal);
        await this._finalizeContinuation(runId, this._abort?.signal ?? new AbortController().signal);
      }
      return;
    }
    if (command.type === "reassign" && command.workerProviderId) {
      const worker = this._run.mode === "logos" ? this._agentRef(command.workerProviderId) : this._workerRef(this._run.assignment, command.workerProviderId);
      this._updateTask(task.id, {
        status: "queued",
        requestedWorkerProviderId: worker.providerId,
        workerProviderId: worker.providerId,
        resolvedWorkerProviderId: void 0,
        workerFallbackReason: void 0,
        workerLabel: worker.label,
        workerModel: worker.model
      });
      this._paused = false;
      this._abort = new AbortController();
      this._run = { ...this._run, status: "running", updatedAt: Date.now() };
      this._publish();
      await this._continueRun(this._run.runId, this._abort.signal);
    }
  }
  async _runLogos(request, assignment, abort) {
    if (!this._run) {
      throw new Error("Logos run was not initialized.");
    }
    const agent = assignment.leader;
    this._run = {
      ...this._run,
      status: "running",
      planSummary: request.goal,
      tasks: [{
        id: "logos",
        title: request.goal.slice(0, 80) || agent.label,
        prompt: request.goal,
        files: [],
        dependsOn: [],
        requestedWorkerProviderId: agent.providerId,
        workerProviderId: agent.providerId,
        workerLabel: agent.label,
        workerModel: agent.model,
        thinkingLevel: agent.thinkingLevel,
        contextSize: agent.contextSize,
        status: "queued",
        attempt: 0
      }],
      updatedAt: Date.now()
    };
    this._publish();
    const runId = this._run.runId;
    await this._runLogosAgent("logos", runId, abort);
    if (this._run.status === "cancelled" || this._run.status === "paused") {
      return this._run;
    }
    return this._finalizeLogos(runId);
  }
  async _continueRun(runId, abort) {
    if (this._run?.mode === "logos") {
      await this._runLogosAgent("logos", runId, abort);
      if (this._isCurrentRun(runId) && this._run && this._run.status !== "paused" && this._run.status !== "cancelled") {
        this._finalizeLogos(runId);
      }
      return;
    }
    await this._pump(runId, abort);
    if (this._isCurrentRun(runId) && this._run && this._run.status !== "paused" && this._run.status !== "cancelled") {
      await this._finalizeContinuation(runId, abort);
    }
  }
  async _runLogosAgent(taskId, runId, abort) {
    const task = this._run?.tasks.find((candidate) => candidate.id === taskId);
    if (!task || !this._run || !this._isCurrentRun(runId)) {
      return;
    }
    if (task.status !== "queued" && task.status !== "retry") {
      return;
    }
    this._updateTask(taskId, { status: "running", attempt: task.attempt + 1 });
    this._publish();
    const entryId = this._beginTranscript("worker", task.workerLabel, task.title, task.id);
    try {
      const worker = this._workers.get(task.workerProviderId);
      if (worker) {
        const availability = await worker.checkAvailability();
        if (!availability.available) {
          const error = workerUnavailableMessage(orchestrationAgentInfo(task.workerProviderId)?.label ?? task.workerLabel, availability);
          this._updateTask(taskId, { status: "failed", error });
          this._completeTranscript(entryId, error, "failed");
          return;
        }
      }
      if (abort.aborted || !this._isCurrentRun(runId)) {
        if (this._isCurrentRun(runId)) {
          this._updateTask(taskId, { status: this._paused ? "queued" : "cancelled", attempt: this._paused ? task.attempt : task.attempt + 1 });
          this._completeTranscript(entryId, this._paused ? "Paused" : "Cancelled", "failed");
        }
        return;
      }
      const leader = this._agentForLogos(task);
      const output = await leader.chat(this._run.goal, this._run.workspace, task.workerModel, abort, this._transcriptHooks(entryId), {
        thinkingLevel: task.thinkingLevel,
        contextSize: task.contextSize
      });
      if (abort.aborted || !this._isCurrentRun(runId)) {
        if (this._isCurrentRun(runId)) {
          this._updateTask(taskId, { status: this._paused ? "queued" : "cancelled", attempt: this._paused ? task.attempt : task.attempt + 1 });
          this._completeTranscript(entryId, this._paused ? "Paused" : "Cancelled", "failed");
        }
        return;
      }
      const trimmed = output.trim();
      if (trimmed === "") {
        const error = `${task.workerLabel} returned an empty result.`;
        this._updateTask(taskId, {
          status: "failed",
          error,
          result: { status: "failed", summary: "", changedFiles: [], error, usage: { durationMs: 0 } }
        });
        this._completeTranscript(entryId, error, "failed");
        return;
      }
      this._completeTranscript(entryId, trimmed, "completed");
      this._updateTask(taskId, {
        status: "completed",
        result: { status: "completed", summary: trimmed, changedFiles: [], usage: { durationMs: 0 } }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this._isCurrentRun(runId)) {
        const interrupted = abort.aborted || this._paused;
        this._updateTask(taskId, {
          status: interrupted && this._paused ? "queued" : "failed",
          attempt: interrupted && this._paused ? task.attempt : task.attempt + 1,
          error: message
        });
        this._completeTranscript(entryId, this._paused ? "Paused" : message, "failed");
      }
    } finally {
      if (this._isCurrentRun(runId)) {
        this._publish();
      }
    }
  }
  async _pump(runId, abort) {
    while (this._run && this._isCurrentRun(runId) && !this._paused && !abort.aborted) {
      const completed = new Set(this._run.tasks.filter((task) => task.status === "completed" || task.status === "escalated").map((task) => task.id));
      const blocked = new Set(this._run.tasks.filter((task) => task.status === "running" || task.status === "cancelled").map((task) => task.id));
      const ready = readyTaskIds(this._run.tasks, completed, blocked).filter((id) => this._run.tasks.find((task) => task.id === id)?.status === "queued" || this._run.tasks.find((task) => task.id === id)?.status === "retry");
      if (ready.length === 0) {
        if (this._run.tasks.some((task) => task.status === "running")) {
          await delay(200, abort);
          continue;
        }
        return;
      }
      await Promise.all(ready.map((id) => this._runTask(id, runId, abort)));
    }
  }
  async _runTask(taskId, runId, abort) {
    const task = this._run?.tasks.find((candidate) => candidate.id === taskId);
    if (!task || !this._run || !this._isCurrentRun(runId)) {
      return;
    }
    this._updateTask(taskId, { status: "running", attempt: task.attempt + 1 });
    this._publish();
    const workerEntryId = this._beginTranscript("worker", task.workerLabel, task.title, task.id);
    let workspace;
    try {
      workspace = await openWorkerWorkspace(this._run.workspace, taskId);
      if (!this._isCurrentRun(runId) || abort.aborted) {
        return;
      }
      const resolvedWorker = await this._resolveWorker(task);
      let result;
      if (!resolvedWorker.worker) {
        this._updateTask(taskId, {
          requestedWorkerProviderId: resolvedWorker.requestedWorkerProviderId,
          resolvedWorkerProviderId: resolvedWorker.resolvedWorkerProviderId,
          workerFallbackReason: resolvedWorker.workerFallbackReason
        });
        result = {
          status: "failed",
          summary: "",
          changedFiles: [],
          error: resolvedWorker.error ?? `${task.workerLabel} is unavailable. Install the runtime or set its API key.`,
          usage: { durationMs: 0 }
        };
        this._completeTranscript(workerEntryId, result.error ?? result.summary, "failed");
      } else {
        this._updateTask(taskId, {
          requestedWorkerProviderId: resolvedWorker.requestedWorkerProviderId,
          resolvedWorkerProviderId: resolvedWorker.resolvedWorkerProviderId,
          workerProviderId: resolvedWorker.workerProviderId,
          workerLabel: resolvedWorker.workerLabel,
          workerFallbackReason: resolvedWorker.workerFallbackReason
        });
        result = await resolvedWorker.worker.run({
          task: {
            ...task,
            requestedWorkerProviderId: resolvedWorker.requestedWorkerProviderId,
            resolvedWorkerProviderId: resolvedWorker.resolvedWorkerProviderId,
            workerProviderId: resolvedWorker.workerProviderId,
            workerLabel: resolvedWorker.workerLabel,
            workerFallbackReason: resolvedWorker.workerFallbackReason
          },
          workspace: workspace.path,
          contract: this._run.contract ?? "",
          goal: this._run.goal,
          chatUri: this._run.chatUri,
          sessionUri: this._run.sessionUri,
          abort,
          hooks: this._transcriptHooks(workerEntryId)
        });
      }
      if (abort.aborted || !this._isCurrentRun(runId)) {
        if (this._isCurrentRun(runId)) {
          this._updateTask(taskId, { status: this._paused ? "queued" : "cancelled", attempt: this._paused ? task.attempt : task.attempt + 1 });
        }
        if (this._isCurrentRun(runId)) {
          this._completeTranscript(workerEntryId, "Cancelled", "failed");
        }
        return;
      }
      const merged = result.status === "completed" ? await workspace.mergeInto(this._run.workspace) : [];
      result = { ...result, changedFiles: uniquePaths([...result.changedFiles, ...merged]) };
      this._completeTranscript(workerEntryId, result.summary || result.error || "", result.status === "completed" ? "completed" : "failed");
      if (result.status === "completed") {
        this._updateTask(taskId, { status: "completed", result });
      } else if (task.attempt + 1 < MAX_TASK_ATTEMPTS) {
        this._updateTask(taskId, { status: "retry", result, error: result.error });
      } else {
        await this._escalate({ ...task, result, error: result.error, attempt: task.attempt + 1 }, runId, abort);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this._isCurrentRun(runId)) {
        this._updateTask(taskId, { status: abort.aborted && this._paused ? "queued" : "failed", attempt: abort.aborted && this._paused ? task.attempt : task.attempt + 1, error: message });
      }
      if (this._isCurrentRun(runId)) {
        this._completeTranscript(workerEntryId, message, "failed");
      }
    } finally {
      await workspace?.dispose();
      if (this._isCurrentRun(runId)) {
        this._publish();
      }
    }
  }
  async _escalate(task, runId, abort) {
    if (!this._run || !this._isCurrentRun(runId)) {
      return;
    }
    this._updateTask(task.id, { status: "running" });
    this._publish();
    const entryId = this._beginTranscript("leader-implement", this._run.assignment.leader.label, task.title, task.id);
    let workspace;
    try {
      workspace = await openWorkerWorkspace(this._run.workspace, `${task.id}-leader`);
      let result = await this._activeLeader.implement(task, workspace.path, this._run.contract ?? "", abort, this._run, this._transcriptHooks(entryId));
      if (!this._isCurrentRun(runId) || abort.aborted) {
        return;
      }
      const merged = result.status === "completed" ? await workspace.mergeInto(this._run.workspace) : [];
      result = { ...result, changedFiles: uniquePaths([...result.changedFiles, ...merged]) };
      this._completeTranscript(entryId, result.summary || result.error || "", result.status === "completed" ? "completed" : "failed");
      this._updateTask(task.id, { status: result.status === "completed" ? "escalated" : "failed", result, error: result.error });
      this._publish();
    } catch (error) {
      if (this._isCurrentRun(runId)) {
        const message = error instanceof Error ? error.message : String(error);
        const interrupted = abort.aborted || this._run?.status === "paused" || this._run?.status === "cancelled";
        this._completeTranscript(entryId, interrupted ? this._paused ? "Paused" : "Cancelled" : message, "failed");
        if (!interrupted) {
          this._updateTask(task.id, { status: "failed", error: message });
        }
        this._publish();
      }
    } finally {
      await workspace?.dispose();
    }
  }
  async _finalizeRun(runId, abort) {
    if (!this._run) {
      throw new Error("Orchestration run disappeared before finalization.");
    }
    if (!this._isCurrentRun(runId) || this._run.status === "paused" || this._run.status === "cancelled" || abort.aborted) {
      return this._run;
    }
    const blocked = this._run.tasks.filter((task) => task.status === "queued" || task.status === "retry" || task.status === "running");
    if (blocked.length > 0) {
      const blockedIds = new Set(blocked.map((task) => task.id));
      for (const task of blocked) {
        const dependencies = task.dependsOn.filter((dependency) => blockedIds.has(dependency) || this._run?.tasks.some((candidate) => candidate.id === dependency && candidate.status === "failed"));
        this._updateTask(task.id, {
          status: "failed",
          error: dependencies.length > 0 ? `Task could not run because its dependencies did not complete: ${dependencies.join(", ")}` : "Task could not run because the orchestration plan contains a dependency cycle or invalid state."
        });
      }
    }
    this._run = { ...this._run, status: "reviewing", updatedAt: Date.now() };
    this._publish();
    const reviewEntryId = this._beginTranscript("leader-review", this._run.assignment.leader.label, "\u5BA1\u6838");
    let review;
    try {
      review = await this._activeLeader.review(this._run, abort, this._transcriptHooks(reviewEntryId));
    } catch (error) {
      if (!this._isCurrentRun(runId) || abort.aborted || this._run.status === "paused" || this._run.status === "cancelled") {
        return this._run;
      }
      const message = error instanceof Error ? error.message : String(error);
      this._completeTranscript(reviewEntryId, message, "failed");
      this._run = { ...this._run, status: "failed", error: `Leader review failed: ${message}`, updatedAt: Date.now() };
      this._publish();
      return this._run;
    }
    if (!this._isCurrentRun(runId) || abort.aborted) {
      return this._run;
    }
    this._completeTranscript(reviewEntryId, review, "completed");
    const failed = this._run.tasks.filter((task) => task.status === "failed" || task.status === "cancelled");
    this._run = {
      ...this._run,
      status: failed.length > 0 ? "failed" : "completed",
      review,
      error: failed.length > 0 ? `${failed.length} orchestration task(s) failed: ${failed.map((task) => task.title).join(", ")}` : void 0,
      updatedAt: Date.now(),
      usage: this._sumUsage(this._run.tasks)
    };
    this._publish();
    return this._run;
  }
  async _resumePlanning(runId, abort) {
    if (!this._run || !this._isCurrentRun(runId)) {
      return false;
    }
    const assignment = this._run.assignment;
    this._activeLeader = this._leaderFor(assignment);
    this._run = { ...this._run, status: "planning", error: void 0, updatedAt: Date.now() };
    this._publish();
    const planEntryId = this._beginTranscript("leader-plan", assignment.leader.label, "\u89C4\u5212");
    try {
      const plan = await this._activeLeader.plan({
        goal: this._run.goal,
        workspace: this._run.workspace,
        chatUri: this._run.chatUri,
        sessionUri: this._run.sessionUri,
        leader: assignment.leader,
        workers: assignment.workers,
        hooks: this._transcriptHooks(planEntryId)
      }, abort);
      if (!this._isCurrentRun(runId) || abort.aborted) {
        return false;
      }
      this._completeTranscript(planEntryId, plan.summary, "completed");
      this._run = {
        ...this._run,
        status: "running",
        planSummary: plan.summary,
        contract: plan.contract,
        tasks: plan.tasks.map((task, index) => this._toTaskState(task, assignment, index)),
        updatedAt: Date.now()
      };
      this._publish();
      return true;
    } catch (error) {
      if (this._isCurrentRun(runId)) {
        const message = error instanceof Error ? error.message : String(error);
        this._completeTranscript(planEntryId, message, "failed");
        this._run = {
          ...this._run,
          status: this._paused ? "paused" : abort.aborted ? "cancelled" : "failed",
          error: message,
          updatedAt: Date.now()
        };
        this._publish();
      }
      return false;
    }
  }
  async _finalizeContinuation(runId, abort) {
    if (!this._run || !this._isCurrentRun(runId)) {
      throw new Error("Orchestration run disappeared before finalization.");
    }
    return this._run.mode === "logos" ? this._finalizeLogos(runId) : this._finalizeRun(runId, abort);
  }
  _finalizeLogos(runId) {
    if (!this._run || !this._isCurrentRun(runId)) {
      throw new Error("Logos run disappeared before finalization.");
    }
    const failed = this._run.tasks.some((task) => task.status === "failed" || task.status === "cancelled");
    this._run = {
      ...this._run,
      status: failed ? "failed" : "completed",
      error: failed ? this._run.tasks.find((task) => task.error)?.error ?? "The Logos task failed." : void 0,
      updatedAt: Date.now(),
      usage: this._sumUsage(this._run.tasks)
    };
    this._publish();
    return this._run;
  }
  _isCurrentRun(runId) {
    return this._run?.runId === runId;
  }
  _toTaskState(task, assignment, index) {
    const hint = task.workerHint ?? "";
    const workerIndex = index % Math.max(assignment.workers.length, 1);
    const worker = assignment.workers.find((candidate) => candidate.providerId === hint || hint !== "" && candidate.label.toLowerCase().includes(hint.toLowerCase())) ?? assignment.workers[workerIndex] ?? assignment.workers[0] ?? { providerId: "deepseek-harness", label: "DeepSeek Harness", role: "worker" };
    return {
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      files: task.files,
      dependsOn: task.dependsOn,
      requestedWorkerProviderId: worker.providerId,
      workerProviderId: worker.providerId,
      workerLabel: worker.label,
      workerModel: worker.model,
      thinkingLevel: worker.thinkingLevel,
      contextSize: worker.contextSize,
      acceptance: task.acceptance,
      testCommand: task.testCommand,
      status: "queued",
      attempt: 0
    };
  }
  _leaderFor(assignment) {
    const registered = this._leaders.get(assignment.leader.providerId) ?? this._fallbackLeader;
    if (this._run?.mode === "logos") {
      return registered;
    }
    return this._overrideLeader ?? registered;
  }
  _agentForLogos(task) {
    return this._leaders.get(task.workerProviderId) ?? this._leaders.get(this._run?.assignment.leader.providerId ?? "") ?? this._fallbackLeader;
  }
  _agentRef(providerId) {
    const agent = orchestrationAgentInfo(providerId);
    return { providerId, label: agent?.label ?? providerId, model: agent?.defaultModel, role: "leader" };
  }
  _workerRef(assignment, providerId) {
    return assignment.workers.find((worker) => worker.providerId === providerId) ?? { providerId, label: providerId, role: "worker" };
  }
  async _resolveWorker(task) {
    const requestedId = task.requestedWorkerProviderId ?? task.workerProviderId;
    const requestedLabel = orchestrationAgentInfo(requestedId)?.label ?? task.workerLabel;
    const primary = this._workers.get(requestedId);
    if (primary) {
      const availability = await primary.checkAvailability();
      if (availability.available) {
        return {
          worker: primary,
          requestedWorkerProviderId: requestedId,
          resolvedWorkerProviderId: primary.id,
          workerProviderId: primary.id,
          workerLabel: primary.label
        };
      }
      const primaryReason = availability.reason ?? "invalid-runtime";
      const codex = this._workers.get("codex");
      if (requestedId !== "codex" && codex) {
        const codexAvailability = await codex.checkAvailability();
        if (codexAvailability.available) {
          this._logService.info(`[ForgeOrchestration] Falling back to Codex for task "${task.title}" (${requestedId}: ${primaryReason}).`);
          return {
            worker: codex,
            requestedWorkerProviderId: requestedId,
            resolvedWorkerProviderId: codex.id,
            workerProviderId: codex.id,
            workerLabel: codex.label,
            workerFallbackReason: primaryReason
          };
        }
      }
      return {
        worker: void 0,
        requestedWorkerProviderId: requestedId,
        resolvedWorkerProviderId: requestedId,
        workerProviderId: requestedId,
        workerLabel: requestedLabel,
        workerFallbackReason: primaryReason,
        error: workerUnavailableMessage(requestedLabel, availability)
      };
    }
    return {
      worker: void 0,
      requestedWorkerProviderId: requestedId,
      resolvedWorkerProviderId: requestedId,
      workerProviderId: requestedId,
      workerLabel: requestedLabel,
      workerFallbackReason: "invalid-runtime",
      error: `${requestedLabel} is unavailable. Install the runtime or set its API key.`
    };
  }
  _updateTask(taskId, patch) {
    if (!this._run) {
      return;
    }
    this._run = {
      ...this._run,
      tasks: this._run.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task),
      updatedAt: Date.now(),
      usage: this._sumUsage(this._run.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task))
    };
  }
  _sumUsage(tasks) {
    return tasks.reduce((sum, task) => ({
      durationMs: Date.now() - (this._run?.startedAt ?? Date.now()),
      inputTokens: add(sum.inputTokens, task.result?.usage?.inputTokens),
      outputTokens: add(sum.outputTokens, task.result?.usage?.outputTokens),
      costUsd: add(sum.costUsd, task.result?.usage?.costUsd)
    }), { durationMs: Date.now() - (this._run?.startedAt ?? Date.now()), inputTokens: 0, outputTokens: 0, costUsd: 0 });
  }
  _workerEnv(kind) {
    const values = this._configuration.getRootConfigValues?.() ?? {};
    const models = normalizeCodexModelsConfig(values[CODEX_MODELS_ROOT_CONFIG_KEY]);
    const official = findOfficialModelProvider(models, kind);
    const account = parseForgeVendorAccountInfo(values[vendorAccountMetaKey(kind)]);
    const loginKey = getVendorAccountSecret(kind);
    const cardKey = official ? getVendorAccountSecret(providerSecretId(official.id)) : void 0;
    const remaining = remainingPercentFromUsed(account.rateLimit?.usedPercent);
    const useFallback = officialApiFallbackReady(official, !!cardKey) && remaining === 0;
    const env = { ...process.env };
    if (kind === "grok") {
      if (useFallback && cardKey) {
        env.XAI_API_KEY = cardKey;
        if (official?.baseUrl) {
          env.XAI_API_BASE_URL = official.baseUrl;
        }
      } else if (loginKey) {
        env.XAI_API_KEY = loginKey;
      }
      if (account.status === "signedIn" || loginKey) {
        env.FORGE_GROK_SIGNED_IN = "1";
      }
    } else if (useFallback && cardKey) {
      env.DEEPSEEK_API_KEY = cardKey;
      if (official?.baseUrl) {
        env.DEEPSEEK_BASE_URL = official.baseUrl;
      }
    } else {
      if (loginKey) {
        env.DEEPSEEK_API_KEY = loginKey;
      }
      if (account.status === "signedIn" || loginKey) {
        env.FORGE_DEEPSEEK_SIGNED_IN = "1";
      }
    }
    if (kind === "deepseek" && (account.status === "signedIn" || loginKey) && !env.FORGE_DEEPSEEK_SIGNED_IN) {
      env.FORGE_DEEPSEEK_SIGNED_IN = "1";
    }
    return env;
  }
  _publish() {
    this._configuration.publishRootTransientValues?.({
      [FORGE_ORCHESTRATION_STATE_KEY]: this._run
    });
  }
  _beginTranscript(phase, agentLabel, title, taskId) {
    if (!this._run) {
      return generateUuid();
    }
    const id = generateUuid();
    const entry = {
      id,
      phase,
      agentLabel,
      title,
      taskId,
      status: "running",
      thinking: ""
    };
    this._run = {
      ...this._run,
      transcript: [...this._run.transcript ?? [], entry],
      updatedAt: Date.now()
    };
    this._publish();
    return id;
  }
  _transcriptHooks(entryId) {
    return {
      onProgress: (update) => {
        if (!this._run || !(this._run.transcript ?? []).some((entry) => entry.id === entryId)) {
          return;
        }
        this._run = {
          ...this._run,
          transcript: (this._run.transcript ?? []).map((entry) => entry.id === entryId ? {
            ...entry,
            thinking: update.thinking ?? entry.thinking,
            progress: update.progress ?? entry.progress,
            output: update.output ?? entry.output
          } : entry),
          updatedAt: Date.now()
        };
        this._publishTranscriptThrottled();
      }
    };
  }
  _completeTranscript(entryId, output, status) {
    if (!this._run || !(this._run.transcript ?? []).some((entry) => entry.id === entryId)) {
      return;
    }
    this._run = {
      ...this._run,
      transcript: (this._run.transcript ?? []).map((entry) => entry.id === entryId ? {
        ...entry,
        output,
        status
      } : entry),
      updatedAt: Date.now()
    };
    this._publish();
  }
  _publishTranscriptThrottled() {
    if (this._transcriptPublishTimer) {
      this._transcriptPublishPending = true;
      return;
    }
    this._publish();
    this._transcriptPublishTimer = setTimeout(() => {
      this._transcriptPublishTimer = void 0;
      if (this._transcriptPublishPending) {
        this._transcriptPublishPending = false;
        this._publish();
      }
    }, 250);
  }
};
ForgeOrchestrationService = __decorateClass([
  __decorateParam(0, IAgentConfigurationService),
  __decorateParam(1, IAgentHostStateManager),
  __decorateParam(2, ILogService),
  __decorateParam(3, INativeEnvironmentService)
], ForgeOrchestrationService);
function emptyUsage() {
  return { durationMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
}
function add(left, right) {
  return (left ?? 0) + (right ?? 0);
}
function delay(ms, abort) {
  return new Promise((resolve) => {
    if (abort?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    abort?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
function uniquePaths(paths) {
  return [...new Set(paths.map((path) => path.replace(/\\/g, "/")).filter((path) => path !== ""))];
}
function workerUnavailableMessage(label, availability) {
  switch (availability.reason) {
    case "missing-credentials":
      return `${label} is unavailable: API key or saved credentials are missing.`;
    case "missing-executable":
      return `${label} is unavailable: runtime binary was not found${availability.executable ? ` (${availability.executable})` : ""}.`;
    case "probe-failed":
      return `${label} is unavailable: runtime probe failed${availability.executable ? ` (${availability.executable})` : ""}.`;
    case "agent-unavailable":
      return `${label} is unavailable: Codex agent is not connected.`;
    default:
      return `${label} is unavailable. Install the runtime or set its API key.`;
  }
}
export {
  ForgeOrchestrationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFxvcmNoZXN0cmF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG5cclxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcclxuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XHJcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xyXG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcclxuaW1wb3J0IHR5cGUgeyBJQWdlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xyXG5pbXBvcnQgdHlwZSB7XHJcblx0SUxlYWRlclByb3ZpZGVyLFxyXG5cdElPcmNoZXN0cmF0aW9uQXNzaWdubWVudCxcclxuXHRJT3JjaGVzdHJhdGlvbkNvbW1hbmQsXHJcblx0SU9yY2hlc3RyYXRpb25QbGFuLFxyXG5cdElPcmNoZXN0cmF0aW9uUHJvZ3Jlc3NIb29rcyxcclxuXHRJT3JjaGVzdHJhdGlvblJlcXVlc3QsXHJcblx0SU9yY2hlc3RyYXRpb25SdW5TdGF0ZSxcclxuXHRJT3JjaGVzdHJhdGlvblRhc2tTdGF0ZSxcclxuXHRJT3JjaGVzdHJhdGlvblRyYW5zY3JpcHRFbnRyeSxcclxuXHRJT3JjaGVzdHJhdGlvblVzYWdlLFxyXG5cdElXb3JrZXJBdmFpbGFiaWxpdHksXHJcblx0SVdvcmtlclByb3ZpZGVyLFxyXG5cdElXb3JrZXJUYXNrUmVzdWx0LFxyXG5cdFdvcmtlclVuYXZhaWxhYmxlUmVhc29uLFxyXG59IGZyb20gJy4uLy4uL2NvbW1vbi9vcmNoZXN0cmF0aW9uL29yY2hlc3RyYXRpb25UeXBlcy5qcyc7XHJcbmltcG9ydCB7XHJcblx0REVGQVVMVF9PUkNIRVNUUkFUSU9OX0FTU0lHTk1FTlQsXHJcblx0Rk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UX0tFWSxcclxuXHRGT1JHRV9PUkNIRVNUUkFUSU9OX0NPTU1BTkRfS0VZLFxyXG5cdEZPUkdFX09SQ0hFU1RSQVRJT05fUkVRVUVTVF9LRVksXHJcblx0Rk9SR0VfT1JDSEVTVFJBVElPTl9TVEFURV9LRVksXHJcblx0aXNvbGF0ZUxvZ29zQXNzaWdubWVudCxcclxuXHRpc09yY2hlc3RyYXRpb25SZXF1ZXN0LFxyXG5cdG9yY2hlc3RyYXRpb25BZ2VudEluZm8sXHJcblx0cmVhZEFzc2lnbm1lbnQsXHJcbn0gZnJvbSAnLi4vLi4vY29tbW9uL29yY2hlc3RyYXRpb24vb3JjaGVzdHJhdGlvblR5cGVzLmpzJztcclxuaW1wb3J0IHsgcmVhZHlUYXNrSWRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL29yY2hlc3RyYXRpb24vdGFza0dyYXBoLmpzJztcclxuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgQ29kZXhMZWFkZXJQcm92aWRlciwgQ29kZXhXb3JrZXJQcm92aWRlciwgTG9jYWxMZWFkZXJQcm92aWRlciB9IGZyb20gJy4vY29kZXhMZWFkZXIuanMnO1xyXG5pbXBvcnQgeyBjcmVhdGVEZWVwU2Vla0xlYWRlciwgY3JlYXRlR3Jva0xlYWRlciB9IGZyb20gJy4vY2xpTGVhZGVyLmpzJztcclxuaW1wb3J0IHsgSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgdHlwZSBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xyXG5pbXBvcnQgeyBjcmVhdGVOb2RlUHJvY2Vzc1J1bm5lciwgRGVlcFNlZWtIYXJuZXNzV29ya2VyLCBHcm9rQnVpbGRXb3JrZXIsIHJlc29sdmVEZWVwU2Vla0NvbW1hbmQsIHJlc29sdmVHcm9rQ29tbWFuZCB9IGZyb20gJy4vd29ya2VyQWRhcHRlcnMuanMnO1xyXG5pbXBvcnQgeyBvcGVuV29ya2VyV29ya3NwYWNlIH0gZnJvbSAnLi93b3JrZXJXb3Jrc3BhY2UuanMnO1xyXG5pbXBvcnQgeyBDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZLCBub3JtYWxpemVDb2RleE1vZGVsc0NvbmZpZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb2RleE1vZGVsc0NvbmZpZy5qcyc7XHJcbmltcG9ydCB7IHBhcnNlRm9yZ2VWZW5kb3JBY2NvdW50SW5mbywgdmVuZG9yQWNjb3VudE1ldGFLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vZm9yZ2VWZW5kb3JBY2NvdW50LmpzJztcclxuaW1wb3J0IHsgZmluZE9mZmljaWFsTW9kZWxQcm92aWRlciwgb2ZmaWNpYWxBcGlGYWxsYmFja1JlYWR5LCByZW1haW5pbmdQZXJjZW50RnJvbVVzZWQgfSBmcm9tICcuLi8uLi9jb21tb24vb2ZmaWNpYWxNb2RlbENhcmRzLmpzJztcclxuaW1wb3J0IHsgZ2V0VmVuZG9yQWNjb3VudFNlY3JldCwgcHJvdmlkZXJTZWNyZXRJZCB9IGZyb20gJy4vdmVuZG9yQWNjb3VudFNlY3JldHMuanMnO1xyXG5cclxuY29uc3QgTUFYX1RBU0tfQVRURU1QVFMgPSAyO1xyXG5cclxuZXhwb3J0IGNsYXNzIEZvcmdlT3JjaGVzdHJhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcclxuXHRwcml2YXRlIF9ydW46IElPcmNoZXN0cmF0aW9uUnVuU3RhdGUgfCB1bmRlZmluZWQ7XHJcblx0cHJpdmF0ZSBfYWJvcnQ6IEFib3J0Q29udHJvbGxlciB8IHVuZGVmaW5lZDtcclxuXHRwcml2YXRlIF9wYXVzZWQgPSBmYWxzZTtcclxuXHRwcml2YXRlIF9nZXRDb2RleDogKCgpID0+IElBZ2VudCB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQ7XHJcblx0cHJpdmF0ZSBfbGFzdFJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG5cdHByaXZhdGUgX2xhc3RDb21tYW5kSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcclxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrZXJzID0gbmV3IE1hcDxzdHJpbmcsIElXb3JrZXJQcm92aWRlcj4oKTtcclxuXHRwcml2YXRlIHJlYWRvbmx5IF9sZWFkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElMZWFkZXJQcm92aWRlcj4oKTtcclxuXHRwcml2YXRlIHJlYWRvbmx5IF9mYWxsYmFja0xlYWRlciA9IG5ldyBMb2NhbExlYWRlclByb3ZpZGVyKCk7XHJcblx0cHJpdmF0ZSBfb3ZlcnJpZGVMZWFkZXI6IElMZWFkZXJQcm92aWRlciB8IHVuZGVmaW5lZDtcclxuXHRwcml2YXRlIF9hY3RpdmVMZWFkZXI6IElMZWFkZXJQcm92aWRlciA9IHRoaXMuX2ZhbGxiYWNrTGVhZGVyO1xyXG5cdHByaXZhdGUgX3RyYW5zY3JpcHRQdWJsaXNoVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xyXG5cdHByaXZhdGUgX3RyYW5zY3JpcHRQdWJsaXNoUGVuZGluZyA9IGZhbHNlO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxyXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxyXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnQ6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXHJcblx0KSB7XHJcblx0XHRzdXBlcigpO1xyXG5cdFx0Y29uc3QgcnVubmVyID0gY3JlYXRlTm9kZVByb2Nlc3NSdW5uZXIoKTtcclxuXHRcdGNvbnN0IHJlcG9Sb290ID0gZW52aXJvbm1lbnQuYXBwUm9vdDtcclxuXHRcdGNvbnN0IHJlc29sdmVEZWVwU2VlayA9IGFzeW5jICgpID0+IHJlc29sdmVEZWVwU2Vla0NvbW1hbmQocmVwb1Jvb3QsIHRoaXMuX3dvcmtlckVudignZGVlcHNlZWsnKSk7XHJcblx0XHRjb25zdCByZXNvbHZlR3JvayA9IGFzeW5jICgpID0+IHJlc29sdmVHcm9rQ29tbWFuZChyZXBvUm9vdCwgdGhpcy5fd29ya2VyRW52KCdncm9rJykpO1xyXG5cdFx0dGhpcy5fd29ya2Vycy5zZXQoJ2NvZGV4JywgbmV3IENvZGV4V29ya2VyUHJvdmlkZXIoKCkgPT4gdGhpcy5fZ2V0Q29kZXg/LigpLCBzdGF0ZU1hbmFnZXIsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcclxuXHRcdHRoaXMuX3dvcmtlcnMuc2V0KCdkZWVwc2Vlay1oYXJuZXNzJywgbmV3IERlZXBTZWVrSGFybmVzc1dvcmtlcihydW5uZXIsIHJlc29sdmVEZWVwU2VlaykpO1xyXG5cdFx0dGhpcy5fd29ya2Vycy5zZXQoJ2dyb2stYnVpbGQnLCBuZXcgR3Jva0J1aWxkV29ya2VyKHJ1bm5lciwgcmVzb2x2ZUdyb2ssICdncm9rLTQuNicpKTtcclxuXHRcdHRoaXMuX2xlYWRlcnMuc2V0KCdjb2RleCcsIG5ldyBDb2RleExlYWRlclByb3ZpZGVyKCgpID0+IHRoaXMuX2dldENvZGV4Py4oKSwgc3RhdGVNYW5hZ2VyLCB0aGlzLl9mYWxsYmFja0xlYWRlciwgdGhpcy5fbG9nU2VydmljZSkpO1xyXG5cdFx0dGhpcy5fbGVhZGVycy5zZXQoJ2RlZXBzZWVrLWhhcm5lc3MnLCBjcmVhdGVEZWVwU2Vla0xlYWRlcihydW5uZXIsIHJlc29sdmVEZWVwU2VlaywgdGhpcy5fZmFsbGJhY2tMZWFkZXIpKTtcclxuXHRcdHRoaXMuX2xlYWRlcnMuc2V0KCdncm9rLWJ1aWxkJywgY3JlYXRlR3Jva0xlYWRlcihydW5uZXIsIHJlc29sdmVHcm9rLCB0aGlzLl9mYWxsYmFja0xlYWRlcikpO1xyXG5cdFx0dGhpcy5fYWN0aXZlTGVhZGVyID0gdGhpcy5fbGVhZGVycy5nZXQoJ2NvZGV4JykgPz8gdGhpcy5fZmFsbGJhY2tMZWFkZXI7XHJcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fYWJvcnQ/LmFib3J0KCkpKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb24ub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHRoaXMuX29uUm9vdENvbmZpZygpKSk7XHJcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnB1Ymxpc2hSb290VHJhbnNpZW50VmFsdWVzPy4oe1xyXG5cdFx0XHRbRk9SR0VfT1JDSEVTVFJBVElPTl9SRVFVRVNUX0tFWV06IHVuZGVmaW5lZCxcclxuXHRcdFx0W0ZPUkdFX09SQ0hFU1RSQVRJT05fQ09NTUFORF9LRVldOiB1bmRlZmluZWQsXHJcblx0XHRcdFtGT1JHRV9PUkNIRVNUUkFUSU9OX1NUQVRFX0tFWV06IHVuZGVmaW5lZCxcclxuXHRcdH0pO1xyXG5cdFx0dGhpcy5fcHVibGlzaCgpO1xyXG5cdH1cclxuXHJcblx0YmluZENvZGV4KGdldEFnZW50OiAoKSA9PiBJQWdlbnQgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuXHRcdHRoaXMuX2dldENvZGV4ID0gZ2V0QWdlbnQ7XHJcblx0fVxyXG5cclxuXHRyZWdpc3Rlcldvcmtlcih3b3JrZXI6IElXb3JrZXJQcm92aWRlcik6IHZvaWQge1xyXG5cdFx0dGhpcy5fd29ya2Vycy5zZXQod29ya2VyLmlkLCB3b3JrZXIpO1xyXG5cdH1cclxuXHJcblx0cmVnaXN0ZXJMZWFkZXIobGVhZGVyOiBJTGVhZGVyUHJvdmlkZXIpOiB2b2lkIHtcclxuXHRcdHRoaXMuX2xlYWRlcnMuc2V0KGxlYWRlci5pZCwgbGVhZGVyKTtcclxuXHR9XHJcblxyXG5cdHNldExlYWRlcihsZWFkZXI6IElMZWFkZXJQcm92aWRlcik6IHZvaWQge1xyXG5cdFx0dGhpcy5fb3ZlcnJpZGVMZWFkZXIgPSBsZWFkZXI7XHJcblx0XHR0aGlzLl9hY3RpdmVMZWFkZXIgPSBsZWFkZXI7XHJcblx0fVxyXG5cclxuXHRnZXQgc3RhdGUoKTogSU9yY2hlc3RyYXRpb25SdW5TdGF0ZSB8IHVuZGVmaW5lZCB7XHJcblx0XHRyZXR1cm4gdGhpcy5fcnVuO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb25Sb290Q29uZmlnKCk6IHZvaWQge1xyXG5cdFx0Y29uc3QgdmFsdWVzID0gdGhpcy5fY29uZmlndXJhdGlvbi5nZXRSb290Q29uZmlnVmFsdWVzPy4oKSA/PyB7fTtcclxuXHRcdGNvbnN0IHJlcXVlc3QgPSB2YWx1ZXNbRk9SR0VfT1JDSEVTVFJBVElPTl9SRVFVRVNUX0tFWV07XHJcblx0XHRpZiAoaXNPcmNoZXN0cmF0aW9uUmVxdWVzdChyZXF1ZXN0KSAmJiByZXF1ZXN0LnJlcXVlc3RJZCAhPT0gdGhpcy5fbGFzdFJlcXVlc3RJZCkge1xyXG5cdFx0XHR0aGlzLl9sYXN0UmVxdWVzdElkID0gcmVxdWVzdC5yZXF1ZXN0SWQgPz8gcmVxdWVzdC5nb2FsO1xyXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVJvb3RDb25maWcoeyBbRk9SR0VfT1JDSEVTVFJBVElPTl9SRVFVRVNUX0tFWV06IHsgY29uc3VtZWQ6IHRoaXMuX2xhc3RSZXF1ZXN0SWQgfSB9KTtcclxuXHRcdFx0dm9pZCB0aGlzLnN0YXJ0KHJlcXVlc3QpLmNhdGNoKGVycm9yID0+IHtcclxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbRm9yZ2VPcmNoZXN0cmF0aW9uXSBydW4gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRjb25zdCBjb21tYW5kID0gdmFsdWVzW0ZPUkdFX09SQ0hFU1RSQVRJT05fQ09NTUFORF9LRVldO1xyXG5cdFx0aWYgKGNvbW1hbmQgJiYgdHlwZW9mIGNvbW1hbmQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGNvbW1hbmQpICYmIHR5cGVvZiAoY29tbWFuZCBhcyBJT3JjaGVzdHJhdGlvbkNvbW1hbmQpLnR5cGUgPT09ICdzdHJpbmcnKSB7XHJcblx0XHRcdGNvbnN0IHR5cGVkID0gY29tbWFuZCBhcyBJT3JjaGVzdHJhdGlvbkNvbW1hbmQ7XHJcblx0XHRcdGlmICh0eXBlZC5jb21tYW5kSWQgJiYgdHlwZWQuY29tbWFuZElkID09PSB0aGlzLl9sYXN0Q29tbWFuZElkKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMuX2xhc3RDb21tYW5kSWQgPSB0eXBlZC5jb21tYW5kSWQgPz8gYCR7dHlwZWQudHlwZX06JHt0eXBlZC50YXNrSWQgPz8gJyd9YDtcclxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVSb290Q29uZmlnKHsgW0ZPUkdFX09SQ0hFU1RSQVRJT05fQ09NTUFORF9LRVldOiB7IGNvbnN1bWVkOiB0aGlzLl9sYXN0Q29tbWFuZElkIH0gfSk7XHJcblx0XHRcdHZvaWQgdGhpcy5jb21tYW5kKHR5cGVkKS5jYXRjaChlcnJvciA9PiB7XHJcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0ZvcmdlT3JjaGVzdHJhdGlvbl0gY29tbWFuZCBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGFzeW5jIHN0YXJ0KHJlcXVlc3Q6IElPcmNoZXN0cmF0aW9uUmVxdWVzdCk6IFByb21pc2U8SU9yY2hlc3RyYXRpb25SdW5TdGF0ZT4ge1xyXG5cdFx0dGhpcy5fYWJvcnQ/LmFib3J0KCk7XHJcblx0XHR0aGlzLl9hYm9ydCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuXHRcdHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xyXG5cdFx0Y29uc3Qgc3RvcmVkID0gcmVhZEFzc2lnbm1lbnQodGhpcy5fY29uZmlndXJhdGlvbi5nZXRSb290Q29uZmlnVmFsdWVzPy4oKT8uW0ZPUkdFX09SQ0hFU1RSQVRJT05fQVNTSUdOTUVOVF9LRVldKTtcclxuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSByZXF1ZXN0Lm1vZGUgPT09ICdsb2dvcydcclxuXHRcdFx0PyBpc29sYXRlTG9nb3NBc3NpZ25tZW50KHJlcXVlc3QuYXNzaWdubWVudClcclxuXHRcdFx0OiBzdG9yZWQgPz8gcmVxdWVzdC5hc3NpZ25tZW50ID8/IERFRkFVTFRfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UO1xyXG5cdFx0dGhpcy5fcnVuID0ge1xyXG5cdFx0XHRydW5JZDogZ2VuZXJhdGVVdWlkKCksXHJcblx0XHRcdG1vZGU6IHJlcXVlc3QubW9kZSA/PyAnZGlhbGVjdGljJyxcclxuXHRcdFx0c3RhdHVzOiByZXF1ZXN0Lm1vZGUgPT09ICdsb2dvcycgPyAncnVubmluZycgOiAncGxhbm5pbmcnLFxyXG5cdFx0XHRnb2FsOiByZXF1ZXN0LmdvYWwsXHJcblx0XHRcdGNoYXRVcmk6IHJlcXVlc3QuY2hhdFVyaSxcclxuXHRcdFx0c2Vzc2lvblVyaTogcmVxdWVzdC5zZXNzaW9uVXJpLFxyXG5cdFx0XHR3b3Jrc3BhY2U6IHJlcXVlc3Qud29ya3NwYWNlLFxyXG5cdFx0XHRhc3NpZ25tZW50LFxyXG5cdFx0XHR0YXNrczogW10sXHJcblx0XHRcdHRyYW5zY3JpcHQ6IFtdLFxyXG5cdFx0XHRzdGFydGVkQXQ6IERhdGUubm93KCksXHJcblx0XHRcdHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcclxuXHRcdFx0dXNhZ2U6IGVtcHR5VXNhZ2UoKSxcclxuXHRcdH07XHJcblx0XHRjb25zdCBydW5JZCA9IHRoaXMuX3J1bi5ydW5JZDtcclxuXHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdHRyeSB7XHJcblx0XHRcdHRoaXMuX2FjdGl2ZUxlYWRlciA9IHRoaXMuX2xlYWRlckZvcihhc3NpZ25tZW50KTtcclxuXHRcdFx0aWYgKHJlcXVlc3QubW9kZSA9PT0gJ2xvZ29zJykge1xyXG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9ydW5Mb2dvcyhyZXF1ZXN0LCBhc3NpZ25tZW50LCB0aGlzLl9hYm9ydC5zaWduYWwpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNvbnN0IHBsYW5FbnRyeUlkID0gdGhpcy5fYmVnaW5UcmFuc2NyaXB0KCdsZWFkZXItcGxhbicsIGFzc2lnbm1lbnQubGVhZGVyLmxhYmVsLCAnXHU4OUM0XHU1MjEyJyk7XHJcblx0XHRcdGNvbnN0IHBsYW4gPSBhd2FpdCB0aGlzLl9hY3RpdmVMZWFkZXIucGxhbih7XHJcblx0XHRcdFx0Z29hbDogcmVxdWVzdC5nb2FsLFxyXG5cdFx0XHRcdHdvcmtzcGFjZTogcmVxdWVzdC53b3Jrc3BhY2UsXHJcblx0XHRcdFx0Y2hhdFVyaTogcmVxdWVzdC5jaGF0VXJpLFxyXG5cdFx0XHRcdHNlc3Npb25Vcmk6IHJlcXVlc3Quc2Vzc2lvblVyaSxcclxuXHRcdFx0XHRsZWFkZXI6IGFzc2lnbm1lbnQubGVhZGVyLFxyXG5cdFx0XHRcdHdvcmtlcnM6IGFzc2lnbm1lbnQud29ya2VycyxcclxuXHRcdFx0XHRob29rczogdGhpcy5fdHJhbnNjcmlwdEhvb2tzKHBsYW5FbnRyeUlkKSxcclxuXHRcdFx0fSwgdGhpcy5fYWJvcnQuc2lnbmFsKTtcclxuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpIHx8IHRoaXMuX2Fib3J0LnNpZ25hbC5hYm9ydGVkKSB7XHJcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3J1bjtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLl9jb21wbGV0ZVRyYW5zY3JpcHQocGxhbkVudHJ5SWQsIHBsYW4uc3VtbWFyeSwgJ2NvbXBsZXRlZCcpO1xyXG5cdFx0XHR0aGlzLl9ydW4gPSB7XHJcblx0XHRcdFx0Li4udGhpcy5fcnVuLFxyXG5cdFx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxyXG5cdFx0XHRcdHBsYW5TdW1tYXJ5OiBwbGFuLnN1bW1hcnksXHJcblx0XHRcdFx0Y29udHJhY3Q6IHBsYW4uY29udHJhY3QsXHJcblx0XHRcdFx0dGFza3M6IHBsYW4udGFza3MubWFwKCh0YXNrLCBpbmRleCkgPT4gdGhpcy5fdG9UYXNrU3RhdGUodGFzaywgYXNzaWdubWVudCwgaW5kZXgpKSxcclxuXHRcdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHRcdH07XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0YXdhaXQgdGhpcy5fcHVtcChydW5JZCwgdGhpcy5fYWJvcnQuc2lnbmFsKTtcclxuXHRcdFx0aWYgKHRoaXMuX3J1bi5zdGF0dXMgPT09ICdjYW5jZWxsZWQnIHx8IHRoaXMuX3J1bi5zdGF0dXMgPT09ICdwYXVzZWQnKSB7XHJcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3J1bjtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZmluYWxpemVSdW4ocnVuSWQsIHRoaXMuX2Fib3J0LnNpZ25hbCk7XHJcblx0XHR9IGNhdGNoIChlcnJvcikge1xyXG5cdFx0XHRpZiAodGhpcy5fcnVuICYmIHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHR0aGlzLl9ydW4gPSB7XHJcblx0XHRcdFx0XHQuLi50aGlzLl9ydW4sXHJcblx0XHRcdFx0XHRzdGF0dXM6IHRoaXMuX3BhdXNlZCA/ICdwYXVzZWQnIDogdGhpcy5fYWJvcnQ/LnNpZ25hbC5hYm9ydGVkID8gJ2NhbmNlbGxlZCcgOiAnZmFpbGVkJyxcclxuXHRcdFx0XHRcdGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXHJcblx0XHRcdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHRcdFx0fTtcclxuXHRcdFx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3J1bjtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aHJvdyBlcnJvcjtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGFzeW5jIGNvbW1hbmQoY29tbWFuZDogSU9yY2hlc3RyYXRpb25Db21tYW5kKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAoIXRoaXMuX3J1biB8fCAoY29tbWFuZC5ydW5JZCAmJiBjb21tYW5kLnJ1bklkICE9PSB0aGlzLl9ydW4ucnVuSWQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmIChjb21tYW5kLnR5cGUgPT09ICdjYW5jZWwnKSB7XHJcblx0XHRcdHRoaXMuX2Fib3J0Py5hYm9ydCgpO1xyXG5cdFx0XHR0aGlzLl9ydW4gPSB7IC4uLnRoaXMuX3J1biwgc3RhdHVzOiAnY2FuY2VsbGVkJywgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGNvbW1hbmQudHlwZSA9PT0gJ3BhdXNlJykge1xyXG5cdFx0XHR0aGlzLl9wYXVzZWQgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLl9hYm9ydD8uYWJvcnQoKTtcclxuXHRcdFx0dGhpcy5fcnVuID0ge1xyXG5cdFx0XHRcdC4uLnRoaXMuX3J1bixcclxuXHRcdFx0XHRzdGF0dXM6ICdwYXVzZWQnLFxyXG5cdFx0XHRcdHRyYW5zY3JpcHQ6ICh0aGlzLl9ydW4udHJhbnNjcmlwdCA/PyBbXSkubWFwKGVudHJ5ID0+IGVudHJ5LnN0YXR1cyA9PT0gJ3J1bm5pbmcnID8ge1xyXG5cdFx0XHRcdFx0Li4uZW50cnksXHJcblx0XHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxyXG5cdFx0XHRcdFx0b3V0cHV0OiAnUGF1c2VkJyxcclxuXHRcdFx0XHR9IDogZW50cnkpLFxyXG5cdFx0XHRcdHRhc2tzOiB0aGlzLl9ydW4udGFza3MubWFwKHRhc2sgPT4gdGFzay5zdGF0dXMgPT09ICdydW5uaW5nJyA/IHtcclxuXHRcdFx0XHRcdC4uLnRhc2ssXHJcblx0XHRcdFx0XHRzdGF0dXM6ICdxdWV1ZWQnLFxyXG5cdFx0XHRcdFx0YXR0ZW1wdDogTWF0aC5tYXgoMCwgdGFzay5hdHRlbXB0IC0gMSksXHJcblx0XHRcdFx0fSA6IHRhc2spLFxyXG5cdFx0XHRcdHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcclxuXHRcdFx0fTtcclxuXHRcdFx0dGhpcy5fcHVibGlzaCgpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAoY29tbWFuZC50eXBlID09PSAncmVzdW1lJykge1xyXG5cdFx0XHR0aGlzLl9wYXVzZWQgPSBmYWxzZTtcclxuXHRcdFx0dGhpcy5fYWJvcnQgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XHJcblx0XHRcdHRoaXMuX3J1biA9IHsgLi4udGhpcy5fcnVuLCBzdGF0dXM6ICdydW5uaW5nJywgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0Y29uc3QgcnVuSWQgPSB0aGlzLl9ydW4ucnVuSWQ7XHJcblx0XHRcdGlmICh0aGlzLl9ydW4ubW9kZSAhPT0gJ2xvZ29zJyAmJiB0aGlzLl9ydW4udGFza3MubGVuZ3RoID09PSAwKSB7XHJcblx0XHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9yZXN1bWVQbGFubmluZyhydW5JZCwgdGhpcy5fYWJvcnQuc2lnbmFsKSkge1xyXG5cdFx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRhd2FpdCB0aGlzLl9jb250aW51ZVJ1bihydW5JZCwgdGhpcy5fYWJvcnQuc2lnbmFsKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0aWYgKCFjb21tYW5kLnRhc2tJZCkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRjb25zdCB0YXNrID0gdGhpcy5fcnVuLnRhc2tzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gY29tbWFuZC50YXNrSWQpO1xyXG5cdFx0aWYgKCF0YXNrKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmIChjb21tYW5kLnR5cGUgPT09ICdyZXRyeScpIHtcclxuXHRcdFx0dGhpcy5fdXBkYXRlVGFzayh0YXNrLmlkLCB7IHN0YXR1czogJ3F1ZXVlZCcsIGF0dGVtcHQ6IDAsIHJlc3VsdDogdW5kZWZpbmVkLCBlcnJvcjogdW5kZWZpbmVkIH0pO1xyXG5cdFx0XHR0aGlzLl9wYXVzZWQgPSBmYWxzZTtcclxuXHRcdFx0dGhpcy5fYWJvcnQgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XHJcblx0XHRcdHRoaXMuX3J1biA9IHsgLi4udGhpcy5fcnVuLCBzdGF0dXM6ICdydW5uaW5nJywgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0YXdhaXQgdGhpcy5fY29udGludWVSdW4odGhpcy5fcnVuLnJ1bklkLCB0aGlzLl9hYm9ydC5zaWduYWwpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAoY29tbWFuZC50eXBlID09PSAnZXNjYWxhdGUnKSB7XHJcblx0XHRcdGlmICh0aGlzLl9ydW4ubW9kZSA9PT0gJ2xvZ29zJykge1xyXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFzay5pZCwgeyBzdGF0dXM6ICdxdWV1ZWQnLCBhdHRlbXB0OiAwLCByZXN1bHQ6IHVuZGVmaW5lZCwgZXJyb3I6IHVuZGVmaW5lZCB9KTtcclxuXHRcdFx0XHR0aGlzLl9wYXVzZWQgPSBmYWxzZTtcclxuXHRcdFx0XHR0aGlzLl9hYm9ydCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuXHRcdFx0XHR0aGlzLl9ydW4gPSB7IC4uLnRoaXMuX3J1biwgc3RhdHVzOiAncnVubmluZycsIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSB9O1xyXG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb250aW51ZVJ1bih0aGlzLl9ydW4ucnVuSWQsIHRoaXMuX2Fib3J0LnNpZ25hbCk7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNvbnN0IHJ1bklkID0gdGhpcy5fcnVuLnJ1bklkO1xyXG5cdFx0XHRhd2FpdCB0aGlzLl9lc2NhbGF0ZSh0YXNrLCBydW5JZCwgdGhpcy5fYWJvcnQ/LnNpZ25hbCA/PyBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsKTtcclxuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgJiYgdGhpcy5fcnVuLnN0YXR1cyAhPT0gJ3BhdXNlZCcgJiYgdGhpcy5fcnVuLnN0YXR1cyAhPT0gJ2NhbmNlbGxlZCcpIHtcclxuXHRcdFx0XHRhd2FpdCB0aGlzLl9wdW1wKHJ1bklkLCB0aGlzLl9hYm9ydD8uc2lnbmFsID8/IG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWwpO1xyXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbmFsaXplQ29udGludWF0aW9uKHJ1bklkLCB0aGlzLl9hYm9ydD8uc2lnbmFsID8/IG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWwpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmIChjb21tYW5kLnR5cGUgPT09ICdyZWFzc2lnbicgJiYgY29tbWFuZC53b3JrZXJQcm92aWRlcklkKSB7XHJcblx0XHRcdGNvbnN0IHdvcmtlciA9IHRoaXMuX3J1bi5tb2RlID09PSAnbG9nb3MnXHJcblx0XHRcdFx0PyB0aGlzLl9hZ2VudFJlZihjb21tYW5kLndvcmtlclByb3ZpZGVySWQpXHJcblx0XHRcdFx0OiB0aGlzLl93b3JrZXJSZWYodGhpcy5fcnVuLmFzc2lnbm1lbnQsIGNvbW1hbmQud29ya2VyUHJvdmlkZXJJZCk7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFzay5pZCwge1xyXG5cdFx0XHRcdHN0YXR1czogJ3F1ZXVlZCcsXHJcblx0XHRcdFx0cmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZDogd29ya2VyLnByb3ZpZGVySWQsXHJcblx0XHRcdFx0d29ya2VyUHJvdmlkZXJJZDogd29ya2VyLnByb3ZpZGVySWQsXHJcblx0XHRcdFx0cmVzb2x2ZWRXb3JrZXJQcm92aWRlcklkOiB1bmRlZmluZWQsXHJcblx0XHRcdFx0d29ya2VyRmFsbGJhY2tSZWFzb246IHVuZGVmaW5lZCxcclxuXHRcdFx0XHR3b3JrZXJMYWJlbDogd29ya2VyLmxhYmVsLFxyXG5cdFx0XHRcdHdvcmtlck1vZGVsOiB3b3JrZXIubW9kZWwsXHJcblx0XHRcdH0pO1xyXG5cdFx0XHR0aGlzLl9wYXVzZWQgPSBmYWxzZTtcclxuXHRcdFx0dGhpcy5fYWJvcnQgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XHJcblx0XHRcdHRoaXMuX3J1biA9IHsgLi4udGhpcy5fcnVuLCBzdGF0dXM6ICdydW5uaW5nJywgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0YXdhaXQgdGhpcy5fY29udGludWVSdW4odGhpcy5fcnVuLnJ1bklkLCB0aGlzLl9hYm9ydC5zaWduYWwpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfcnVuTG9nb3MocmVxdWVzdDogSU9yY2hlc3RyYXRpb25SZXF1ZXN0LCBhc3NpZ25tZW50OiBJT3JjaGVzdHJhdGlvbkFzc2lnbm1lbnQsIGFib3J0OiBBYm9ydFNpZ25hbCk6IFByb21pc2U8SU9yY2hlc3RyYXRpb25SdW5TdGF0ZT4ge1xyXG5cdFx0aWYgKCF0aGlzLl9ydW4pIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMb2dvcyBydW4gd2FzIG5vdCBpbml0aWFsaXplZC4nKTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IGFnZW50ID0gYXNzaWdubWVudC5sZWFkZXI7XHJcblx0XHR0aGlzLl9ydW4gPSB7XHJcblx0XHRcdC4uLnRoaXMuX3J1bixcclxuXHRcdFx0c3RhdHVzOiAncnVubmluZycsXHJcblx0XHRcdHBsYW5TdW1tYXJ5OiByZXF1ZXN0LmdvYWwsXHJcblx0XHRcdHRhc2tzOiBbe1xyXG5cdFx0XHRcdGlkOiAnbG9nb3MnLFxyXG5cdFx0XHRcdHRpdGxlOiByZXF1ZXN0LmdvYWwuc2xpY2UoMCwgODApIHx8IGFnZW50LmxhYmVsLFxyXG5cdFx0XHRcdHByb21wdDogcmVxdWVzdC5nb2FsLFxyXG5cdFx0XHRcdGZpbGVzOiBbXSxcclxuXHRcdFx0XHRkZXBlbmRzT246IFtdLFxyXG5cdFx0XHRcdHJlcXVlc3RlZFdvcmtlclByb3ZpZGVySWQ6IGFnZW50LnByb3ZpZGVySWQsXHJcblx0XHRcdFx0d29ya2VyUHJvdmlkZXJJZDogYWdlbnQucHJvdmlkZXJJZCxcclxuXHRcdFx0XHR3b3JrZXJMYWJlbDogYWdlbnQubGFiZWwsXHJcblx0XHRcdFx0d29ya2VyTW9kZWw6IGFnZW50Lm1vZGVsLFxyXG5cdFx0XHRcdHRoaW5raW5nTGV2ZWw6IGFnZW50LnRoaW5raW5nTGV2ZWwsXHJcblx0XHRcdFx0Y29udGV4dFNpemU6IGFnZW50LmNvbnRleHRTaXplLFxyXG5cdFx0XHRcdHN0YXR1czogJ3F1ZXVlZCcsXHJcblx0XHRcdFx0YXR0ZW1wdDogMCxcclxuXHRcdFx0fV0sXHJcblx0XHRcdHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcclxuXHRcdH07XHJcblx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRjb25zdCBydW5JZCA9IHRoaXMuX3J1bi5ydW5JZDtcclxuXHRcdGF3YWl0IHRoaXMuX3J1bkxvZ29zQWdlbnQoJ2xvZ29zJywgcnVuSWQsIGFib3J0KTtcclxuXHRcdGlmICh0aGlzLl9ydW4uc3RhdHVzID09PSAnY2FuY2VsbGVkJyB8fCB0aGlzLl9ydW4uc3RhdHVzID09PSAncGF1c2VkJykge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmFsaXplTG9nb3MocnVuSWQpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfY29udGludWVSdW4ocnVuSWQ6IHN0cmluZywgYWJvcnQ6IEFib3J0U2lnbmFsKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAodGhpcy5fcnVuPy5tb2RlID09PSAnbG9nb3MnKSB7XHJcblx0XHRcdGF3YWl0IHRoaXMuX3J1bkxvZ29zQWdlbnQoJ2xvZ29zJywgcnVuSWQsIGFib3J0KTtcclxuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgJiYgdGhpcy5fcnVuICYmIHRoaXMuX3J1bi5zdGF0dXMgIT09ICdwYXVzZWQnICYmIHRoaXMuX3J1bi5zdGF0dXMgIT09ICdjYW5jZWxsZWQnKSB7XHJcblx0XHRcdFx0dGhpcy5fZmluYWxpemVMb2dvcyhydW5JZCk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0YXdhaXQgdGhpcy5fcHVtcChydW5JZCwgYWJvcnQpO1xyXG5cdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgJiYgdGhpcy5fcnVuICYmIHRoaXMuX3J1bi5zdGF0dXMgIT09ICdwYXVzZWQnICYmIHRoaXMuX3J1bi5zdGF0dXMgIT09ICdjYW5jZWxsZWQnKSB7XHJcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbmFsaXplQ29udGludWF0aW9uKHJ1bklkLCBhYm9ydCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFzeW5jIF9ydW5Mb2dvc0FnZW50KHRhc2tJZDogc3RyaW5nLCBydW5JZDogc3RyaW5nLCBhYm9ydDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGNvbnN0IHRhc2sgPSB0aGlzLl9ydW4/LnRhc2tzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gdGFza0lkKTtcclxuXHRcdGlmICghdGFzayB8fCAhdGhpcy5fcnVuIHx8ICF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmICh0YXNrLnN0YXR1cyAhPT0gJ3F1ZXVlZCcgJiYgdGFzay5zdGF0dXMgIT09ICdyZXRyeScpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fdXBkYXRlVGFzayh0YXNrSWQsIHsgc3RhdHVzOiAncnVubmluZycsIGF0dGVtcHQ6IHRhc2suYXR0ZW1wdCArIDEgfSk7XHJcblx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRjb25zdCBlbnRyeUlkID0gdGhpcy5fYmVnaW5UcmFuc2NyaXB0KCd3b3JrZXInLCB0YXNrLndvcmtlckxhYmVsLCB0YXNrLnRpdGxlLCB0YXNrLmlkKTtcclxuXHRcdHRyeSB7XHJcblx0XHRcdGNvbnN0IHdvcmtlciA9IHRoaXMuX3dvcmtlcnMuZ2V0KHRhc2sud29ya2VyUHJvdmlkZXJJZCk7XHJcblx0XHRcdGlmICh3b3JrZXIpIHtcclxuXHRcdFx0XHRjb25zdCBhdmFpbGFiaWxpdHkgPSBhd2FpdCB3b3JrZXIuY2hlY2tBdmFpbGFiaWxpdHkoKTtcclxuXHRcdFx0XHRpZiAoIWF2YWlsYWJpbGl0eS5hdmFpbGFibGUpIHtcclxuXHRcdFx0XHRcdGNvbnN0IGVycm9yID0gd29ya2VyVW5hdmFpbGFibGVNZXNzYWdlKG9yY2hlc3RyYXRpb25BZ2VudEluZm8odGFzay53b3JrZXJQcm92aWRlcklkKT8ubGFiZWwgPz8gdGFzay53b3JrZXJMYWJlbCwgYXZhaWxhYmlsaXR5KTtcclxuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7IHN0YXR1czogJ2ZhaWxlZCcsIGVycm9yIH0pO1xyXG5cdFx0XHRcdFx0dGhpcy5fY29tcGxldGVUcmFuc2NyaXB0KGVudHJ5SWQsIGVycm9yLCAnZmFpbGVkJyk7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChhYm9ydC5hYm9ydGVkIHx8ICF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7IHN0YXR1czogdGhpcy5fcGF1c2VkID8gJ3F1ZXVlZCcgOiAnY2FuY2VsbGVkJywgYXR0ZW1wdDogdGhpcy5fcGF1c2VkID8gdGFzay5hdHRlbXB0IDogdGFzay5hdHRlbXB0ICsgMSB9KTtcclxuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlVHJhbnNjcmlwdChlbnRyeUlkLCB0aGlzLl9wYXVzZWQgPyAnUGF1c2VkJyA6ICdDYW5jZWxsZWQnLCAnZmFpbGVkJyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCBsZWFkZXIgPSB0aGlzLl9hZ2VudEZvckxvZ29zKHRhc2spO1xyXG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBsZWFkZXIuY2hhdCh0aGlzLl9ydW4uZ29hbCwgdGhpcy5fcnVuLndvcmtzcGFjZSwgdGFzay53b3JrZXJNb2RlbCwgYWJvcnQsIHRoaXMuX3RyYW5zY3JpcHRIb29rcyhlbnRyeUlkKSwge1xyXG5cdFx0XHRcdHRoaW5raW5nTGV2ZWw6IHRhc2sudGhpbmtpbmdMZXZlbCxcclxuXHRcdFx0XHRjb250ZXh0U2l6ZTogdGFzay5jb250ZXh0U2l6ZSxcclxuXHRcdFx0fSk7XHJcblx0XHRcdGlmIChhYm9ydC5hYm9ydGVkIHx8ICF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7IHN0YXR1czogdGhpcy5fcGF1c2VkID8gJ3F1ZXVlZCcgOiAnY2FuY2VsbGVkJywgYXR0ZW1wdDogdGhpcy5fcGF1c2VkID8gdGFzay5hdHRlbXB0IDogdGFzay5hdHRlbXB0ICsgMSB9KTtcclxuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlVHJhbnNjcmlwdChlbnRyeUlkLCB0aGlzLl9wYXVzZWQgPyAnUGF1c2VkJyA6ICdDYW5jZWxsZWQnLCAnZmFpbGVkJyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCB0cmltbWVkID0gb3V0cHV0LnRyaW0oKTtcclxuXHRcdFx0aWYgKHRyaW1tZWQgPT09ICcnKSB7XHJcblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBgJHt0YXNrLndvcmtlckxhYmVsfSByZXR1cm5lZCBhbiBlbXB0eSByZXN1bHQuYDtcclxuXHRcdFx0XHR0aGlzLl91cGRhdGVUYXNrKHRhc2tJZCwge1xyXG5cdFx0XHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcclxuXHRcdFx0XHRcdGVycm9yLFxyXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHN0YXR1czogJ2ZhaWxlZCcsIHN1bW1hcnk6ICcnLCBjaGFuZ2VkRmlsZXM6IFtdLCBlcnJvciwgdXNhZ2U6IHsgZHVyYXRpb25NczogMCB9IH0sXHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0dGhpcy5fY29tcGxldGVUcmFuc2NyaXB0KGVudHJ5SWQsIGVycm9yLCAnZmFpbGVkJyk7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMuX2NvbXBsZXRlVHJhbnNjcmlwdChlbnRyeUlkLCB0cmltbWVkLCAnY29tcGxldGVkJyk7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7XHJcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcclxuXHRcdFx0XHRyZXN1bHQ6IHsgc3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogdHJpbW1lZCwgY2hhbmdlZEZpbGVzOiBbXSwgdXNhZ2U6IHsgZHVyYXRpb25NczogMCB9IH0sXHJcblx0XHRcdH0pO1xyXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcclxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHRjb25zdCBpbnRlcnJ1cHRlZCA9IGFib3J0LmFib3J0ZWQgfHwgdGhpcy5fcGF1c2VkO1xyXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7XHJcblx0XHRcdFx0XHRzdGF0dXM6IGludGVycnVwdGVkICYmIHRoaXMuX3BhdXNlZCA/ICdxdWV1ZWQnIDogJ2ZhaWxlZCcsXHJcblx0XHRcdFx0XHRhdHRlbXB0OiBpbnRlcnJ1cHRlZCAmJiB0aGlzLl9wYXVzZWQgPyB0YXNrLmF0dGVtcHQgOiB0YXNrLmF0dGVtcHQgKyAxLFxyXG5cdFx0XHRcdFx0ZXJyb3I6IG1lc3NhZ2UsXHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0dGhpcy5fY29tcGxldGVUcmFuc2NyaXB0KGVudHJ5SWQsIHRoaXMuX3BhdXNlZCA/ICdQYXVzZWQnIDogbWVzc2FnZSwgJ2ZhaWxlZCcpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGZpbmFsbHkge1xyXG5cdFx0XHRpZiAodGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSkge1xyXG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfcHVtcChydW5JZDogc3RyaW5nLCBhYm9ydDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdHdoaWxlICh0aGlzLl9ydW4gJiYgdGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSAmJiAhdGhpcy5fcGF1c2VkICYmICFhYm9ydC5hYm9ydGVkKSB7XHJcblx0XHRcdGNvbnN0IGNvbXBsZXRlZCA9IG5ldyBTZXQodGhpcy5fcnVuLnRhc2tzLmZpbHRlcih0YXNrID0+IHRhc2suc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCB0YXNrLnN0YXR1cyA9PT0gJ2VzY2FsYXRlZCcpLm1hcCh0YXNrID0+IHRhc2suaWQpKTtcclxuXHRcdFx0Y29uc3QgYmxvY2tlZCA9IG5ldyBTZXQodGhpcy5fcnVuLnRhc2tzLmZpbHRlcih0YXNrID0+IHRhc2suc3RhdHVzID09PSAncnVubmluZycgfHwgdGFzay5zdGF0dXMgPT09ICdjYW5jZWxsZWQnKS5tYXAodGFzayA9PiB0YXNrLmlkKSk7XHJcblx0XHRcdGNvbnN0IHJlYWR5ID0gcmVhZHlUYXNrSWRzKHRoaXMuX3J1bi50YXNrcywgY29tcGxldGVkLCBibG9ja2VkKVxyXG5cdFx0XHRcdC5maWx0ZXIoaWQgPT4gdGhpcy5fcnVuIS50YXNrcy5maW5kKHRhc2sgPT4gdGFzay5pZCA9PT0gaWQpPy5zdGF0dXMgPT09ICdxdWV1ZWQnIHx8IHRoaXMuX3J1biEudGFza3MuZmluZCh0YXNrID0+IHRhc2suaWQgPT09IGlkKT8uc3RhdHVzID09PSAncmV0cnknKTtcclxuXHRcdFx0aWYgKHJlYWR5Lmxlbmd0aCA9PT0gMCkge1xyXG5cdFx0XHRcdGlmICh0aGlzLl9ydW4udGFza3Muc29tZSh0YXNrID0+IHRhc2suc3RhdHVzID09PSAncnVubmluZycpKSB7XHJcblx0XHRcdFx0XHRhd2FpdCBkZWxheSgyMDAsIGFib3J0KTtcclxuXHRcdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVhZHkubWFwKGlkID0+IHRoaXMuX3J1blRhc2soaWQsIHJ1bklkLCBhYm9ydCkpKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYXN5bmMgX3J1blRhc2sodGFza0lkOiBzdHJpbmcsIHJ1bklkOiBzdHJpbmcsIGFib3J0OiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0Y29uc3QgdGFzayA9IHRoaXMuX3J1bj8udGFza3MuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSB0YXNrSWQpO1xyXG5cdFx0aWYgKCF0YXNrIHx8ICF0aGlzLl9ydW4gfHwgIXRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fdXBkYXRlVGFzayh0YXNrSWQsIHsgc3RhdHVzOiAncnVubmluZycsIGF0dGVtcHQ6IHRhc2suYXR0ZW1wdCArIDEgfSk7XHJcblx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRjb25zdCB3b3JrZXJFbnRyeUlkID0gdGhpcy5fYmVnaW5UcmFuc2NyaXB0KCd3b3JrZXInLCB0YXNrLndvcmtlckxhYmVsLCB0YXNrLnRpdGxlLCB0YXNrLmlkKTtcclxuXHRcdGxldCB3b3Jrc3BhY2U6IEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2Ygb3BlbldvcmtlcldvcmtzcGFjZT4+IHwgdW5kZWZpbmVkO1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0d29ya3NwYWNlID0gYXdhaXQgb3BlbldvcmtlcldvcmtzcGFjZSh0aGlzLl9ydW4ud29ya3NwYWNlLCB0YXNrSWQpO1xyXG5cdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgfHwgYWJvcnQuYWJvcnRlZCkge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCByZXNvbHZlZFdvcmtlciA9IGF3YWl0IHRoaXMuX3Jlc29sdmVXb3JrZXIodGFzayk7XHJcblx0XHRcdGxldCByZXN1bHQ6IElXb3JrZXJUYXNrUmVzdWx0O1xyXG5cdFx0XHRpZiAoIXJlc29sdmVkV29ya2VyLndvcmtlcikge1xyXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7XHJcblx0XHRcdFx0XHRyZXF1ZXN0ZWRXb3JrZXJQcm92aWRlcklkOiByZXNvbHZlZFdvcmtlci5yZXF1ZXN0ZWRXb3JrZXJQcm92aWRlcklkLFxyXG5cdFx0XHRcdFx0cmVzb2x2ZWRXb3JrZXJQcm92aWRlcklkOiByZXNvbHZlZFdvcmtlci5yZXNvbHZlZFdvcmtlclByb3ZpZGVySWQsXHJcblx0XHRcdFx0XHR3b3JrZXJGYWxsYmFja1JlYXNvbjogcmVzb2x2ZWRXb3JrZXIud29ya2VyRmFsbGJhY2tSZWFzb24sXHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0cmVzdWx0ID0ge1xyXG5cdFx0XHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcclxuXHRcdFx0XHRcdHN1bW1hcnk6ICcnLFxyXG5cdFx0XHRcdFx0Y2hhbmdlZEZpbGVzOiBbXSxcclxuXHRcdFx0XHRcdGVycm9yOiByZXNvbHZlZFdvcmtlci5lcnJvciA/PyBgJHt0YXNrLndvcmtlckxhYmVsfSBpcyB1bmF2YWlsYWJsZS4gSW5zdGFsbCB0aGUgcnVudGltZSBvciBzZXQgaXRzIEFQSSBrZXkuYCxcclxuXHRcdFx0XHRcdHVzYWdlOiB7IGR1cmF0aW9uTXM6IDAgfSxcclxuXHRcdFx0XHR9O1xyXG5cdFx0XHRcdHRoaXMuX2NvbXBsZXRlVHJhbnNjcmlwdCh3b3JrZXJFbnRyeUlkLCByZXN1bHQuZXJyb3IgPz8gcmVzdWx0LnN1bW1hcnksICdmYWlsZWQnKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLl91cGRhdGVUYXNrKHRhc2tJZCwge1xyXG5cdFx0XHRcdFx0cmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZDogcmVzb2x2ZWRXb3JrZXIucmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZCxcclxuXHRcdFx0XHRcdHJlc29sdmVkV29ya2VyUHJvdmlkZXJJZDogcmVzb2x2ZWRXb3JrZXIucmVzb2x2ZWRXb3JrZXJQcm92aWRlcklkLFxyXG5cdFx0XHRcdFx0d29ya2VyUHJvdmlkZXJJZDogcmVzb2x2ZWRXb3JrZXIud29ya2VyUHJvdmlkZXJJZCxcclxuXHRcdFx0XHRcdHdvcmtlckxhYmVsOiByZXNvbHZlZFdvcmtlci53b3JrZXJMYWJlbCxcclxuXHRcdFx0XHRcdHdvcmtlckZhbGxiYWNrUmVhc29uOiByZXNvbHZlZFdvcmtlci53b3JrZXJGYWxsYmFja1JlYXNvbixcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCByZXNvbHZlZFdvcmtlci53b3JrZXIucnVuKHtcclxuXHRcdFx0XHRcdHRhc2s6IHtcclxuXHRcdFx0XHRcdFx0Li4udGFzayxcclxuXHRcdFx0XHRcdFx0cmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZDogcmVzb2x2ZWRXb3JrZXIucmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZCxcclxuXHRcdFx0XHRcdFx0cmVzb2x2ZWRXb3JrZXJQcm92aWRlcklkOiByZXNvbHZlZFdvcmtlci5yZXNvbHZlZFdvcmtlclByb3ZpZGVySWQsXHJcblx0XHRcdFx0XHRcdHdvcmtlclByb3ZpZGVySWQ6IHJlc29sdmVkV29ya2VyLndvcmtlclByb3ZpZGVySWQsXHJcblx0XHRcdFx0XHRcdHdvcmtlckxhYmVsOiByZXNvbHZlZFdvcmtlci53b3JrZXJMYWJlbCxcclxuXHRcdFx0XHRcdFx0d29ya2VyRmFsbGJhY2tSZWFzb246IHJlc29sdmVkV29ya2VyLndvcmtlckZhbGxiYWNrUmVhc29uLFxyXG5cdFx0XHRcdFx0fSxcclxuXHRcdFx0XHRcdHdvcmtzcGFjZTogd29ya3NwYWNlLnBhdGgsXHJcblx0XHRcdFx0XHRjb250cmFjdDogdGhpcy5fcnVuLmNvbnRyYWN0ID8/ICcnLFxyXG5cdFx0XHRcdFx0Z29hbDogdGhpcy5fcnVuLmdvYWwsXHJcblx0XHRcdFx0XHRjaGF0VXJpOiB0aGlzLl9ydW4uY2hhdFVyaSxcclxuXHRcdFx0XHRcdHNlc3Npb25Vcmk6IHRoaXMuX3J1bi5zZXNzaW9uVXJpLFxyXG5cdFx0XHRcdFx0YWJvcnQsXHJcblx0XHRcdFx0XHRob29rczogdGhpcy5fdHJhbnNjcmlwdEhvb2tzKHdvcmtlckVudHJ5SWQpLFxyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChhYm9ydC5hYm9ydGVkIHx8ICF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFza0lkLCB7IHN0YXR1czogdGhpcy5fcGF1c2VkID8gJ3F1ZXVlZCcgOiAnY2FuY2VsbGVkJywgYXR0ZW1wdDogdGhpcy5fcGF1c2VkID8gdGFzay5hdHRlbXB0IDogdGFzay5hdHRlbXB0ICsgMSB9KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlVHJhbnNjcmlwdCh3b3JrZXJFbnRyeUlkLCAnQ2FuY2VsbGVkJywgJ2ZhaWxlZCcpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdFx0Y29uc3QgbWVyZ2VkID0gcmVzdWx0LnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgPyBhd2FpdCB3b3Jrc3BhY2UubWVyZ2VJbnRvKHRoaXMuX3J1bi53b3Jrc3BhY2UpIDogW107XHJcblx0XHRcdHJlc3VsdCA9IHsgLi4ucmVzdWx0LCBjaGFuZ2VkRmlsZXM6IHVuaXF1ZVBhdGhzKFsuLi5yZXN1bHQuY2hhbmdlZEZpbGVzLCAuLi5tZXJnZWRdKSB9O1xyXG5cdFx0XHR0aGlzLl9jb21wbGV0ZVRyYW5zY3JpcHQod29ya2VyRW50cnlJZCwgcmVzdWx0LnN1bW1hcnkgfHwgcmVzdWx0LmVycm9yIHx8ICcnLCByZXN1bHQuc3RhdHVzID09PSAnY29tcGxldGVkJyA/ICdjb21wbGV0ZWQnIDogJ2ZhaWxlZCcpO1xyXG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcpIHtcclxuXHRcdFx0XHR0aGlzLl91cGRhdGVUYXNrKHRhc2tJZCwgeyBzdGF0dXM6ICdjb21wbGV0ZWQnLCByZXN1bHQgfSk7XHJcblx0XHRcdH0gZWxzZSBpZiAodGFzay5hdHRlbXB0ICsgMSA8IE1BWF9UQVNLX0FUVEVNUFRTKSB7XHJcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGFzayh0YXNrSWQsIHsgc3RhdHVzOiAncmV0cnknLCByZXN1bHQsIGVycm9yOiByZXN1bHQuZXJyb3IgfSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0YXdhaXQgdGhpcy5fZXNjYWxhdGUoeyAuLi50YXNrLCByZXN1bHQsIGVycm9yOiByZXN1bHQuZXJyb3IsIGF0dGVtcHQ6IHRhc2suYXR0ZW1wdCArIDEgfSwgcnVuSWQsIGFib3J0KTtcclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XHJcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XHJcblx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGFzayh0YXNrSWQsIHsgc3RhdHVzOiBhYm9ydC5hYm9ydGVkICYmIHRoaXMuX3BhdXNlZCA/ICdxdWV1ZWQnIDogJ2ZhaWxlZCcsIGF0dGVtcHQ6IGFib3J0LmFib3J0ZWQgJiYgdGhpcy5fcGF1c2VkID8gdGFzay5hdHRlbXB0IDogdGFzay5hdHRlbXB0ICsgMSwgZXJyb3I6IG1lc3NhZ2UgfSk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHR0aGlzLl9jb21wbGV0ZVRyYW5zY3JpcHQod29ya2VyRW50cnlJZCwgbWVzc2FnZSwgJ2ZhaWxlZCcpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGZpbmFsbHkge1xyXG5cdFx0XHRhd2FpdCB3b3Jrc3BhY2U/LmRpc3Bvc2UoKTtcclxuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkpIHtcclxuXHRcdFx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYXN5bmMgX2VzY2FsYXRlKHRhc2s6IElPcmNoZXN0cmF0aW9uVGFza1N0YXRlLCBydW5JZDogc3RyaW5nLCBhYm9ydDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGlmICghdGhpcy5fcnVuIHx8ICF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFzay5pZCwgeyBzdGF0dXM6ICdydW5uaW5nJyB9KTtcclxuXHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdGNvbnN0IGVudHJ5SWQgPSB0aGlzLl9iZWdpblRyYW5zY3JpcHQoJ2xlYWRlci1pbXBsZW1lbnQnLCB0aGlzLl9ydW4uYXNzaWdubWVudC5sZWFkZXIubGFiZWwsIHRhc2sudGl0bGUsIHRhc2suaWQpO1xyXG5cdFx0bGV0IHdvcmtzcGFjZTogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiBvcGVuV29ya2VyV29ya3NwYWNlPj4gfCB1bmRlZmluZWQ7XHJcblx0XHR0cnkge1xyXG5cdFx0XHR3b3Jrc3BhY2UgPSBhd2FpdCBvcGVuV29ya2VyV29ya3NwYWNlKHRoaXMuX3J1bi53b3Jrc3BhY2UsIGAke3Rhc2suaWR9LWxlYWRlcmApO1xyXG5cdFx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5fYWN0aXZlTGVhZGVyLmltcGxlbWVudCh0YXNrLCB3b3Jrc3BhY2UucGF0aCwgdGhpcy5fcnVuLmNvbnRyYWN0ID8/ICcnLCBhYm9ydCwgdGhpcy5fcnVuLCB0aGlzLl90cmFuc2NyaXB0SG9va3MoZW50cnlJZCkpO1xyXG5cdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgfHwgYWJvcnQuYWJvcnRlZCkge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCBtZXJnZWQgPSByZXN1bHQuc3RhdHVzID09PSAnY29tcGxldGVkJyA/IGF3YWl0IHdvcmtzcGFjZS5tZXJnZUludG8odGhpcy5fcnVuLndvcmtzcGFjZSkgOiBbXTtcclxuXHRcdFx0cmVzdWx0ID0geyAuLi5yZXN1bHQsIGNoYW5nZWRGaWxlczogdW5pcXVlUGF0aHMoWy4uLnJlc3VsdC5jaGFuZ2VkRmlsZXMsIC4uLm1lcmdlZF0pIH07XHJcblx0XHRcdHRoaXMuX2NvbXBsZXRlVHJhbnNjcmlwdChlbnRyeUlkLCByZXN1bHQuc3VtbWFyeSB8fCByZXN1bHQuZXJyb3IgfHwgJycsIHJlc3VsdC5zdGF0dXMgPT09ICdjb21wbGV0ZWQnID8gJ2NvbXBsZXRlZCcgOiAnZmFpbGVkJyk7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFzay5pZCwgeyBzdGF0dXM6IHJlc3VsdC5zdGF0dXMgPT09ICdjb21wbGV0ZWQnID8gJ2VzY2FsYXRlZCcgOiAnZmFpbGVkJywgcmVzdWx0LCBlcnJvcjogcmVzdWx0LmVycm9yIH0pO1xyXG5cdFx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHR9IGNhdGNoIChlcnJvcikge1xyXG5cdFx0XHRpZiAodGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSkge1xyXG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XHJcblx0XHRcdFx0Y29uc3QgaW50ZXJydXB0ZWQgPSBhYm9ydC5hYm9ydGVkIHx8IHRoaXMuX3J1bj8uc3RhdHVzID09PSAncGF1c2VkJyB8fCB0aGlzLl9ydW4/LnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCc7XHJcblx0XHRcdFx0dGhpcy5fY29tcGxldGVUcmFuc2NyaXB0KGVudHJ5SWQsIGludGVycnVwdGVkID8gKHRoaXMuX3BhdXNlZCA/ICdQYXVzZWQnIDogJ0NhbmNlbGxlZCcpIDogbWVzc2FnZSwgJ2ZhaWxlZCcpO1xyXG5cdFx0XHRcdGlmICghaW50ZXJydXB0ZWQpIHtcclxuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFzay5pZCwgeyBzdGF0dXM6ICdmYWlsZWQnLCBlcnJvcjogbWVzc2FnZSB9KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0dGhpcy5fcHVibGlzaCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGZpbmFsbHkge1xyXG5cdFx0XHRhd2FpdCB3b3Jrc3BhY2U/LmRpc3Bvc2UoKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmFsaXplUnVuKHJ1bklkOiBzdHJpbmcsIGFib3J0OiBBYm9ydFNpZ25hbCk6IFByb21pc2U8SU9yY2hlc3RyYXRpb25SdW5TdGF0ZT4ge1xyXG5cdFx0aWYgKCF0aGlzLl9ydW4pIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdPcmNoZXN0cmF0aW9uIHJ1biBkaXNhcHBlYXJlZCBiZWZvcmUgZmluYWxpemF0aW9uLicpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpIHx8IHRoaXMuX3J1bi5zdGF0dXMgPT09ICdwYXVzZWQnIHx8IHRoaXMuX3J1bi5zdGF0dXMgPT09ICdjYW5jZWxsZWQnIHx8IGFib3J0LmFib3J0ZWQpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuX3J1bjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IGJsb2NrZWQgPSB0aGlzLl9ydW4udGFza3MuZmlsdGVyKHRhc2sgPT4gdGFzay5zdGF0dXMgPT09ICdxdWV1ZWQnIHx8IHRhc2suc3RhdHVzID09PSAncmV0cnknIHx8IHRhc2suc3RhdHVzID09PSAncnVubmluZycpO1xyXG5cdFx0aWYgKGJsb2NrZWQubGVuZ3RoID4gMCkge1xyXG5cdFx0XHRjb25zdCBibG9ja2VkSWRzID0gbmV3IFNldChibG9ja2VkLm1hcCh0YXNrID0+IHRhc2suaWQpKTtcclxuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIGJsb2NrZWQpIHtcclxuXHRcdFx0XHRjb25zdCBkZXBlbmRlbmNpZXMgPSB0YXNrLmRlcGVuZHNPbi5maWx0ZXIoZGVwZW5kZW5jeSA9PiBibG9ja2VkSWRzLmhhcyhkZXBlbmRlbmN5KSB8fCB0aGlzLl9ydW4/LnRhc2tzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gZGVwZW5kZW5jeSAmJiBjYW5kaWRhdGUuc3RhdHVzID09PSAnZmFpbGVkJykpO1xyXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2sodGFzay5pZCwge1xyXG5cdFx0XHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcclxuXHRcdFx0XHRcdGVycm9yOiBkZXBlbmRlbmNpZXMubGVuZ3RoID4gMFxyXG5cdFx0XHRcdFx0XHQ/IGBUYXNrIGNvdWxkIG5vdCBydW4gYmVjYXVzZSBpdHMgZGVwZW5kZW5jaWVzIGRpZCBub3QgY29tcGxldGU6ICR7ZGVwZW5kZW5jaWVzLmpvaW4oJywgJyl9YFxyXG5cdFx0XHRcdFx0XHQ6ICdUYXNrIGNvdWxkIG5vdCBydW4gYmVjYXVzZSB0aGUgb3JjaGVzdHJhdGlvbiBwbGFuIGNvbnRhaW5zIGEgZGVwZW5kZW5jeSBjeWNsZSBvciBpbnZhbGlkIHN0YXRlLicsXHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdHRoaXMuX3J1biA9IHsgLi4udGhpcy5fcnVuLCBzdGF0dXM6ICdyZXZpZXdpbmcnLCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcclxuXHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdGNvbnN0IHJldmlld0VudHJ5SWQgPSB0aGlzLl9iZWdpblRyYW5zY3JpcHQoJ2xlYWRlci1yZXZpZXcnLCB0aGlzLl9ydW4uYXNzaWdubWVudC5sZWFkZXIubGFiZWwsICdcdTVCQTFcdTY4MzgnKTtcclxuXHRcdGxldCByZXZpZXc6IHN0cmluZztcclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldmlldyA9IGF3YWl0IHRoaXMuX2FjdGl2ZUxlYWRlci5yZXZpZXcodGhpcy5fcnVuLCBhYm9ydCwgdGhpcy5fdHJhbnNjcmlwdEhvb2tzKHJldmlld0VudHJ5SWQpKTtcclxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XHJcblx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSB8fCBhYm9ydC5hYm9ydGVkIHx8IHRoaXMuX3J1bi5zdGF0dXMgPT09ICdwYXVzZWQnIHx8IHRoaXMuX3J1bi5zdGF0dXMgPT09ICdjYW5jZWxsZWQnKSB7XHJcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3J1bjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG5cdFx0XHR0aGlzLl9jb21wbGV0ZVRyYW5zY3JpcHQocmV2aWV3RW50cnlJZCwgbWVzc2FnZSwgJ2ZhaWxlZCcpO1xyXG5cdFx0XHR0aGlzLl9ydW4gPSB7IC4uLnRoaXMuX3J1biwgc3RhdHVzOiAnZmFpbGVkJywgZXJyb3I6IGBMZWFkZXIgcmV2aWV3IGZhaWxlZDogJHttZXNzYWdlfWAsIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSB9O1xyXG5cdFx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRcdHJldHVybiB0aGlzLl9ydW47XHJcblx0XHR9XHJcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgfHwgYWJvcnQuYWJvcnRlZCkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fY29tcGxldGVUcmFuc2NyaXB0KHJldmlld0VudHJ5SWQsIHJldmlldywgJ2NvbXBsZXRlZCcpO1xyXG5cdFx0Y29uc3QgZmFpbGVkID0gdGhpcy5fcnVuLnRhc2tzLmZpbHRlcih0YXNrID0+IHRhc2suc3RhdHVzID09PSAnZmFpbGVkJyB8fCB0YXNrLnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcpO1xyXG5cdFx0dGhpcy5fcnVuID0ge1xyXG5cdFx0XHQuLi50aGlzLl9ydW4sXHJcblx0XHRcdHN0YXR1czogZmFpbGVkLmxlbmd0aCA+IDAgPyAnZmFpbGVkJyA6ICdjb21wbGV0ZWQnLFxyXG5cdFx0XHRyZXZpZXcsXHJcblx0XHRcdGVycm9yOiBmYWlsZWQubGVuZ3RoID4gMCA/IGAke2ZhaWxlZC5sZW5ndGh9IG9yY2hlc3RyYXRpb24gdGFzayhzKSBmYWlsZWQ6ICR7ZmFpbGVkLm1hcCh0YXNrID0+IHRhc2sudGl0bGUpLmpvaW4oJywgJyl9YCA6IHVuZGVmaW5lZCxcclxuXHRcdFx0dXBkYXRlZEF0OiBEYXRlLm5vdygpLFxyXG5cdFx0XHR1c2FnZTogdGhpcy5fc3VtVXNhZ2UodGhpcy5fcnVuLnRhc2tzKSxcclxuXHRcdH07XHJcblx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRyZXR1cm4gdGhpcy5fcnVuO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfcmVzdW1lUGxhbm5pbmcocnVuSWQ6IHN0cmluZywgYWJvcnQ6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxib29sZWFuPiB7XHJcblx0XHRpZiAoIXRoaXMuX3J1biB8fCAhdGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSkge1xyXG5cdFx0XHRyZXR1cm4gZmFsc2U7XHJcblx0XHR9XHJcblx0XHRjb25zdCBhc3NpZ25tZW50ID0gdGhpcy5fcnVuLmFzc2lnbm1lbnQ7XHJcblx0XHR0aGlzLl9hY3RpdmVMZWFkZXIgPSB0aGlzLl9sZWFkZXJGb3IoYXNzaWdubWVudCk7XHJcblx0XHR0aGlzLl9ydW4gPSB7IC4uLnRoaXMuX3J1biwgc3RhdHVzOiAncGxhbm5pbmcnLCBlcnJvcjogdW5kZWZpbmVkLCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcclxuXHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdGNvbnN0IHBsYW5FbnRyeUlkID0gdGhpcy5fYmVnaW5UcmFuc2NyaXB0KCdsZWFkZXItcGxhbicsIGFzc2lnbm1lbnQubGVhZGVyLmxhYmVsLCAnXHU4OUM0XHU1MjEyJyk7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRjb25zdCBwbGFuID0gYXdhaXQgdGhpcy5fYWN0aXZlTGVhZGVyLnBsYW4oe1xyXG5cdFx0XHRcdGdvYWw6IHRoaXMuX3J1bi5nb2FsLFxyXG5cdFx0XHRcdHdvcmtzcGFjZTogdGhpcy5fcnVuLndvcmtzcGFjZSxcclxuXHRcdFx0XHRjaGF0VXJpOiB0aGlzLl9ydW4uY2hhdFVyaSxcclxuXHRcdFx0XHRzZXNzaW9uVXJpOiB0aGlzLl9ydW4uc2Vzc2lvblVyaSxcclxuXHRcdFx0XHRsZWFkZXI6IGFzc2lnbm1lbnQubGVhZGVyLFxyXG5cdFx0XHRcdHdvcmtlcnM6IGFzc2lnbm1lbnQud29ya2VycyxcclxuXHRcdFx0XHRob29rczogdGhpcy5fdHJhbnNjcmlwdEhvb2tzKHBsYW5FbnRyeUlkKSxcclxuXHRcdFx0fSwgYWJvcnQpO1xyXG5cdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJ1bihydW5JZCkgfHwgYWJvcnQuYWJvcnRlZCkge1xyXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLl9jb21wbGV0ZVRyYW5zY3JpcHQocGxhbkVudHJ5SWQsIHBsYW4uc3VtbWFyeSwgJ2NvbXBsZXRlZCcpO1xyXG5cdFx0XHR0aGlzLl9ydW4gPSB7XHJcblx0XHRcdFx0Li4udGhpcy5fcnVuLFxyXG5cdFx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxyXG5cdFx0XHRcdHBsYW5TdW1tYXJ5OiBwbGFuLnN1bW1hcnksXHJcblx0XHRcdFx0Y29udHJhY3Q6IHBsYW4uY29udHJhY3QsXHJcblx0XHRcdFx0dGFza3M6IHBsYW4udGFza3MubWFwKCh0YXNrLCBpbmRleCkgPT4gdGhpcy5fdG9UYXNrU3RhdGUodGFzaywgYXNzaWdubWVudCwgaW5kZXgpKSxcclxuXHRcdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHRcdH07XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goKTtcclxuXHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHR9IGNhdGNoIChlcnJvcikge1xyXG5cdFx0XHRpZiAodGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSkge1xyXG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XHJcblx0XHRcdFx0dGhpcy5fY29tcGxldGVUcmFuc2NyaXB0KHBsYW5FbnRyeUlkLCBtZXNzYWdlLCAnZmFpbGVkJyk7XHJcblx0XHRcdFx0dGhpcy5fcnVuID0ge1xyXG5cdFx0XHRcdFx0Li4udGhpcy5fcnVuLFxyXG5cdFx0XHRcdFx0c3RhdHVzOiB0aGlzLl9wYXVzZWQgPyAncGF1c2VkJyA6IGFib3J0LmFib3J0ZWQgPyAnY2FuY2VsbGVkJyA6ICdmYWlsZWQnLFxyXG5cdFx0XHRcdFx0ZXJyb3I6IG1lc3NhZ2UsXHJcblx0XHRcdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHRcdFx0fTtcclxuXHRcdFx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIGZhbHNlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfZmluYWxpemVDb250aW51YXRpb24ocnVuSWQ6IHN0cmluZywgYWJvcnQ6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxJT3JjaGVzdHJhdGlvblJ1blN0YXRlPiB7XHJcblx0XHRpZiAoIXRoaXMuX3J1biB8fCAhdGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSkge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ09yY2hlc3RyYXRpb24gcnVuIGRpc2FwcGVhcmVkIGJlZm9yZSBmaW5hbGl6YXRpb24uJyk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcy5fcnVuLm1vZGUgPT09ICdsb2dvcycgPyB0aGlzLl9maW5hbGl6ZUxvZ29zKHJ1bklkKSA6IHRoaXMuX2ZpbmFsaXplUnVuKHJ1bklkLCBhYm9ydCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9maW5hbGl6ZUxvZ29zKHJ1bklkOiBzdHJpbmcpOiBJT3JjaGVzdHJhdGlvblJ1blN0YXRlIHtcclxuXHRcdGlmICghdGhpcy5fcnVuIHx8ICF0aGlzLl9pc0N1cnJlbnRSdW4ocnVuSWQpKSB7XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcignTG9nb3MgcnVuIGRpc2FwcGVhcmVkIGJlZm9yZSBmaW5hbGl6YXRpb24uJyk7XHJcblx0XHR9XHJcblx0XHRjb25zdCBmYWlsZWQgPSB0aGlzLl9ydW4udGFza3Muc29tZSh0YXNrID0+IHRhc2suc3RhdHVzID09PSAnZmFpbGVkJyB8fCB0YXNrLnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcpO1xyXG5cdFx0dGhpcy5fcnVuID0ge1xyXG5cdFx0XHQuLi50aGlzLl9ydW4sXHJcblx0XHRcdHN0YXR1czogZmFpbGVkID8gJ2ZhaWxlZCcgOiAnY29tcGxldGVkJyxcclxuXHRcdFx0ZXJyb3I6IGZhaWxlZCA/IHRoaXMuX3J1bi50YXNrcy5maW5kKHRhc2sgPT4gdGFzay5lcnJvcik/LmVycm9yID8/ICdUaGUgTG9nb3MgdGFzayBmYWlsZWQuJyA6IHVuZGVmaW5lZCxcclxuXHRcdFx0dXBkYXRlZEF0OiBEYXRlLm5vdygpLFxyXG5cdFx0XHR1c2FnZTogdGhpcy5fc3VtVXNhZ2UodGhpcy5fcnVuLnRhc2tzKSxcclxuXHRcdH07XHJcblx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRyZXR1cm4gdGhpcy5fcnVuO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfaXNDdXJyZW50UnVuKHJ1bklkOiBzdHJpbmcpOiBib29sZWFuIHtcclxuXHRcdHJldHVybiB0aGlzLl9ydW4/LnJ1bklkID09PSBydW5JZDtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3RvVGFza1N0YXRlKHRhc2s6IElPcmNoZXN0cmF0aW9uUGxhblsndGFza3MnXVtudW1iZXJdLCBhc3NpZ25tZW50OiBJT3JjaGVzdHJhdGlvbkFzc2lnbm1lbnQsIGluZGV4OiBudW1iZXIpOiBJT3JjaGVzdHJhdGlvblRhc2tTdGF0ZSB7XHJcblx0XHRjb25zdCBoaW50ID0gdGFzay53b3JrZXJIaW50ID8/ICcnO1xyXG5cdFx0Y29uc3Qgd29ya2VySW5kZXggPSBpbmRleCAlIE1hdGgubWF4KGFzc2lnbm1lbnQud29ya2Vycy5sZW5ndGgsIDEpO1xyXG5cdFx0Y29uc3Qgd29ya2VyID0gYXNzaWdubWVudC53b3JrZXJzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5wcm92aWRlcklkID09PSBoaW50IHx8IChoaW50ICE9PSAnJyAmJiBjYW5kaWRhdGUubGFiZWwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhoaW50LnRvTG93ZXJDYXNlKCkpKSlcclxuXHRcdFx0Pz8gYXNzaWdubWVudC53b3JrZXJzW3dvcmtlckluZGV4XVxyXG5cdFx0XHQ/PyBhc3NpZ25tZW50LndvcmtlcnNbMF1cclxuXHRcdFx0Pz8geyBwcm92aWRlcklkOiAnZGVlcHNlZWstaGFybmVzcycsIGxhYmVsOiAnRGVlcFNlZWsgSGFybmVzcycsIHJvbGU6ICd3b3JrZXInIGFzIGNvbnN0IH07XHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRpZDogdGFzay5pZCxcclxuXHRcdFx0dGl0bGU6IHRhc2sudGl0bGUsXHJcblx0XHRcdHByb21wdDogdGFzay5wcm9tcHQsXHJcblx0XHRcdGZpbGVzOiB0YXNrLmZpbGVzLFxyXG5cdFx0XHRkZXBlbmRzT246IHRhc2suZGVwZW5kc09uLFxyXG5cdFx0XHRyZXF1ZXN0ZWRXb3JrZXJQcm92aWRlcklkOiB3b3JrZXIucHJvdmlkZXJJZCxcclxuXHRcdFx0d29ya2VyUHJvdmlkZXJJZDogd29ya2VyLnByb3ZpZGVySWQsXHJcblx0XHRcdHdvcmtlckxhYmVsOiB3b3JrZXIubGFiZWwsXHJcblx0XHRcdHdvcmtlck1vZGVsOiB3b3JrZXIubW9kZWwsXHJcblx0XHRcdHRoaW5raW5nTGV2ZWw6IHdvcmtlci50aGlua2luZ0xldmVsLFxyXG5cdFx0XHRjb250ZXh0U2l6ZTogd29ya2VyLmNvbnRleHRTaXplLFxyXG5cdFx0XHRhY2NlcHRhbmNlOiB0YXNrLmFjY2VwdGFuY2UsXHJcblx0XHRcdHRlc3RDb21tYW5kOiB0YXNrLnRlc3RDb21tYW5kLFxyXG5cdFx0XHRzdGF0dXM6ICdxdWV1ZWQnLFxyXG5cdFx0XHRhdHRlbXB0OiAwLFxyXG5cdFx0fTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2xlYWRlckZvcihhc3NpZ25tZW50OiBJT3JjaGVzdHJhdGlvbkFzc2lnbm1lbnQpOiBJTGVhZGVyUHJvdmlkZXIge1xyXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHRoaXMuX2xlYWRlcnMuZ2V0KGFzc2lnbm1lbnQubGVhZGVyLnByb3ZpZGVySWQpID8/IHRoaXMuX2ZhbGxiYWNrTGVhZGVyO1xyXG5cdFx0aWYgKHRoaXMuX3J1bj8ubW9kZSA9PT0gJ2xvZ29zJykge1xyXG5cdFx0XHRyZXR1cm4gcmVnaXN0ZXJlZDtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzLl9vdmVycmlkZUxlYWRlciA/PyByZWdpc3RlcmVkO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYWdlbnRGb3JMb2dvcyh0YXNrOiBJT3JjaGVzdHJhdGlvblRhc2tTdGF0ZSk6IElMZWFkZXJQcm92aWRlciB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbGVhZGVycy5nZXQodGFzay53b3JrZXJQcm92aWRlcklkKVxyXG5cdFx0XHQ/PyB0aGlzLl9sZWFkZXJzLmdldCh0aGlzLl9ydW4/LmFzc2lnbm1lbnQubGVhZGVyLnByb3ZpZGVySWQgPz8gJycpXHJcblx0XHRcdD8/IHRoaXMuX2ZhbGxiYWNrTGVhZGVyO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYWdlbnRSZWYocHJvdmlkZXJJZDogc3RyaW5nKSB7XHJcblx0XHRjb25zdCBhZ2VudCA9IG9yY2hlc3RyYXRpb25BZ2VudEluZm8ocHJvdmlkZXJJZCk7XHJcblx0XHRyZXR1cm4geyBwcm92aWRlcklkLCBsYWJlbDogYWdlbnQ/LmxhYmVsID8/IHByb3ZpZGVySWQsIG1vZGVsOiBhZ2VudD8uZGVmYXVsdE1vZGVsLCByb2xlOiAnbGVhZGVyJyBhcyBjb25zdCB9O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfd29ya2VyUmVmKGFzc2lnbm1lbnQ6IElPcmNoZXN0cmF0aW9uQXNzaWdubWVudCwgcHJvdmlkZXJJZDogc3RyaW5nKSB7XHJcblx0XHRyZXR1cm4gYXNzaWdubWVudC53b3JrZXJzLmZpbmQod29ya2VyID0+IHdvcmtlci5wcm92aWRlcklkID09PSBwcm92aWRlcklkKSA/PyB7IHByb3ZpZGVySWQsIGxhYmVsOiBwcm92aWRlcklkLCByb2xlOiAnd29ya2VyJyBhcyBjb25zdCB9O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdvcmtlcih0YXNrOiBJT3JjaGVzdHJhdGlvblRhc2tTdGF0ZSk6IFByb21pc2U8e1xyXG5cdFx0d29ya2VyOiBJV29ya2VyUHJvdmlkZXIgfCB1bmRlZmluZWQ7XHJcblx0XHRyZXF1ZXN0ZWRXb3JrZXJQcm92aWRlcklkOiBzdHJpbmc7XHJcblx0XHRyZXNvbHZlZFdvcmtlclByb3ZpZGVySWQ6IHN0cmluZztcclxuXHRcdHdvcmtlclByb3ZpZGVySWQ6IHN0cmluZztcclxuXHRcdHdvcmtlckxhYmVsOiBzdHJpbmc7XHJcblx0XHR3b3JrZXJGYWxsYmFja1JlYXNvbj86IFdvcmtlclVuYXZhaWxhYmxlUmVhc29uO1xyXG5cdFx0ZXJyb3I/OiBzdHJpbmc7XHJcblx0fT4ge1xyXG5cdFx0Y29uc3QgcmVxdWVzdGVkSWQgPSB0YXNrLnJlcXVlc3RlZFdvcmtlclByb3ZpZGVySWQgPz8gdGFzay53b3JrZXJQcm92aWRlcklkO1xyXG5cdFx0Y29uc3QgcmVxdWVzdGVkTGFiZWwgPSBvcmNoZXN0cmF0aW9uQWdlbnRJbmZvKHJlcXVlc3RlZElkKT8ubGFiZWwgPz8gdGFzay53b3JrZXJMYWJlbDtcclxuXHRcdGNvbnN0IHByaW1hcnkgPSB0aGlzLl93b3JrZXJzLmdldChyZXF1ZXN0ZWRJZCk7XHJcblx0XHRpZiAocHJpbWFyeSkge1xyXG5cdFx0XHRjb25zdCBhdmFpbGFiaWxpdHkgPSBhd2FpdCBwcmltYXJ5LmNoZWNrQXZhaWxhYmlsaXR5KCk7XHJcblx0XHRcdGlmIChhdmFpbGFiaWxpdHkuYXZhaWxhYmxlKSB7XHJcblx0XHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRcdHdvcmtlcjogcHJpbWFyeSxcclxuXHRcdFx0XHRcdHJlcXVlc3RlZFdvcmtlclByb3ZpZGVySWQ6IHJlcXVlc3RlZElkLFxyXG5cdFx0XHRcdFx0cmVzb2x2ZWRXb3JrZXJQcm92aWRlcklkOiBwcmltYXJ5LmlkLFxyXG5cdFx0XHRcdFx0d29ya2VyUHJvdmlkZXJJZDogcHJpbWFyeS5pZCxcclxuXHRcdFx0XHRcdHdvcmtlckxhYmVsOiBwcmltYXJ5LmxhYmVsLFxyXG5cdFx0XHRcdH07XHJcblx0XHRcdH1cclxuXHRcdFx0Y29uc3QgcHJpbWFyeVJlYXNvbiA9IGF2YWlsYWJpbGl0eS5yZWFzb24gPz8gJ2ludmFsaWQtcnVudGltZSc7XHJcblx0XHRcdGNvbnN0IGNvZGV4ID0gdGhpcy5fd29ya2Vycy5nZXQoJ2NvZGV4Jyk7XHJcblx0XHRcdGlmIChyZXF1ZXN0ZWRJZCAhPT0gJ2NvZGV4JyAmJiBjb2RleCkge1xyXG5cdFx0XHRcdGNvbnN0IGNvZGV4QXZhaWxhYmlsaXR5ID0gYXdhaXQgY29kZXguY2hlY2tBdmFpbGFiaWxpdHkoKTtcclxuXHRcdFx0XHRpZiAoY29kZXhBdmFpbGFiaWxpdHkuYXZhaWxhYmxlKSB7XHJcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtGb3JnZU9yY2hlc3RyYXRpb25dIEZhbGxpbmcgYmFjayB0byBDb2RleCBmb3IgdGFzayBcIiR7dGFzay50aXRsZX1cIiAoJHtyZXF1ZXN0ZWRJZH06ICR7cHJpbWFyeVJlYXNvbn0pLmApO1xyXG5cdFx0XHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRcdFx0d29ya2VyOiBjb2RleCxcclxuXHRcdFx0XHRcdFx0cmVxdWVzdGVkV29ya2VyUHJvdmlkZXJJZDogcmVxdWVzdGVkSWQsXHJcblx0XHRcdFx0XHRcdHJlc29sdmVkV29ya2VyUHJvdmlkZXJJZDogY29kZXguaWQsXHJcblx0XHRcdFx0XHRcdHdvcmtlclByb3ZpZGVySWQ6IGNvZGV4LmlkLFxyXG5cdFx0XHRcdFx0XHR3b3JrZXJMYWJlbDogY29kZXgubGFiZWwsXHJcblx0XHRcdFx0XHRcdHdvcmtlckZhbGxiYWNrUmVhc29uOiBwcmltYXJ5UmVhc29uLFxyXG5cdFx0XHRcdFx0fTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHR3b3JrZXI6IHVuZGVmaW5lZCxcclxuXHRcdFx0XHRyZXF1ZXN0ZWRXb3JrZXJQcm92aWRlcklkOiByZXF1ZXN0ZWRJZCxcclxuXHRcdFx0XHRyZXNvbHZlZFdvcmtlclByb3ZpZGVySWQ6IHJlcXVlc3RlZElkLFxyXG5cdFx0XHRcdHdvcmtlclByb3ZpZGVySWQ6IHJlcXVlc3RlZElkLFxyXG5cdFx0XHRcdHdvcmtlckxhYmVsOiByZXF1ZXN0ZWRMYWJlbCxcclxuXHRcdFx0XHR3b3JrZXJGYWxsYmFja1JlYXNvbjogcHJpbWFyeVJlYXNvbixcclxuXHRcdFx0XHRlcnJvcjogd29ya2VyVW5hdmFpbGFibGVNZXNzYWdlKHJlcXVlc3RlZExhYmVsLCBhdmFpbGFiaWxpdHkpLFxyXG5cdFx0XHR9O1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0d29ya2VyOiB1bmRlZmluZWQsXHJcblx0XHRcdHJlcXVlc3RlZFdvcmtlclByb3ZpZGVySWQ6IHJlcXVlc3RlZElkLFxyXG5cdFx0XHRyZXNvbHZlZFdvcmtlclByb3ZpZGVySWQ6IHJlcXVlc3RlZElkLFxyXG5cdFx0XHR3b3JrZXJQcm92aWRlcklkOiByZXF1ZXN0ZWRJZCxcclxuXHRcdFx0d29ya2VyTGFiZWw6IHJlcXVlc3RlZExhYmVsLFxyXG5cdFx0XHR3b3JrZXJGYWxsYmFja1JlYXNvbjogJ2ludmFsaWQtcnVudGltZScsXHJcblx0XHRcdGVycm9yOiBgJHtyZXF1ZXN0ZWRMYWJlbH0gaXMgdW5hdmFpbGFibGUuIEluc3RhbGwgdGhlIHJ1bnRpbWUgb3Igc2V0IGl0cyBBUEkga2V5LmAsXHJcblx0XHR9O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfdXBkYXRlVGFzayh0YXNrSWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8SU9yY2hlc3RyYXRpb25UYXNrU3RhdGU+KTogdm9pZCB7XHJcblx0XHRpZiAoIXRoaXMuX3J1bikge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9ydW4gPSB7XHJcblx0XHRcdC4uLnRoaXMuX3J1bixcclxuXHRcdFx0dGFza3M6IHRoaXMuX3J1bi50YXNrcy5tYXAodGFzayA9PiB0YXNrLmlkID09PSB0YXNrSWQgPyB7IC4uLnRhc2ssIC4uLnBhdGNoIH0gOiB0YXNrKSxcclxuXHRcdFx0dXBkYXRlZEF0OiBEYXRlLm5vdygpLFxyXG5cdFx0XHR1c2FnZTogdGhpcy5fc3VtVXNhZ2UodGhpcy5fcnVuLnRhc2tzLm1hcCh0YXNrID0+IHRhc2suaWQgPT09IHRhc2tJZCA/IHsgLi4udGFzaywgLi4ucGF0Y2ggfSA6IHRhc2spKSxcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9zdW1Vc2FnZSh0YXNrczogcmVhZG9ubHkgSU9yY2hlc3RyYXRpb25UYXNrU3RhdGVbXSk6IElPcmNoZXN0cmF0aW9uVXNhZ2Uge1xyXG5cdFx0cmV0dXJuIHRhc2tzLnJlZHVjZTxJT3JjaGVzdHJhdGlvblVzYWdlPigoc3VtLCB0YXNrKSA9PiAoe1xyXG5cdFx0XHRkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gKHRoaXMuX3J1bj8uc3RhcnRlZEF0ID8/IERhdGUubm93KCkpLFxyXG5cdFx0XHRpbnB1dFRva2VuczogYWRkKHN1bS5pbnB1dFRva2VucywgdGFzay5yZXN1bHQ/LnVzYWdlPy5pbnB1dFRva2VucyksXHJcblx0XHRcdG91dHB1dFRva2VuczogYWRkKHN1bS5vdXRwdXRUb2tlbnMsIHRhc2sucmVzdWx0Py51c2FnZT8ub3V0cHV0VG9rZW5zKSxcclxuXHRcdFx0Y29zdFVzZDogYWRkKHN1bS5jb3N0VXNkLCB0YXNrLnJlc3VsdD8udXNhZ2U/LmNvc3RVc2QpLFxyXG5cdFx0fSksIHsgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtICh0aGlzLl9ydW4/LnN0YXJ0ZWRBdCA/PyBEYXRlLm5vdygpKSwgaW5wdXRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMCwgY29zdFVzZDogMCB9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3dvcmtlckVudihraW5kOiAnZ3JvaycgfCAnZGVlcHNlZWsnKTogTm9kZUpTLlByb2Nlc3NFbnYge1xyXG5cdFx0Y29uc3QgdmFsdWVzID0gdGhpcy5fY29uZmlndXJhdGlvbi5nZXRSb290Q29uZmlnVmFsdWVzPy4oKSA/PyB7fTtcclxuXHRcdGNvbnN0IG1vZGVscyA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHZhbHVlc1tDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZXSk7XHJcblx0XHRjb25zdCBvZmZpY2lhbCA9IGZpbmRPZmZpY2lhbE1vZGVsUHJvdmlkZXIobW9kZWxzLCBraW5kKTtcclxuXHRcdGNvbnN0IGFjY291bnQgPSBwYXJzZUZvcmdlVmVuZG9yQWNjb3VudEluZm8odmFsdWVzW3ZlbmRvckFjY291bnRNZXRhS2V5KGtpbmQpXSk7XHJcblx0XHRjb25zdCBsb2dpbktleSA9IGdldFZlbmRvckFjY291bnRTZWNyZXQoa2luZCk7XHJcblx0XHRjb25zdCBjYXJkS2V5ID0gb2ZmaWNpYWwgPyBnZXRWZW5kb3JBY2NvdW50U2VjcmV0KHByb3ZpZGVyU2VjcmV0SWQob2ZmaWNpYWwuaWQpKSA6IHVuZGVmaW5lZDtcclxuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHJlbWFpbmluZ1BlcmNlbnRGcm9tVXNlZChhY2NvdW50LnJhdGVMaW1pdD8udXNlZFBlcmNlbnQpO1xyXG5cdFx0Y29uc3QgdXNlRmFsbGJhY2sgPSBvZmZpY2lhbEFwaUZhbGxiYWNrUmVhZHkob2ZmaWNpYWwsICEhY2FyZEtleSkgJiYgcmVtYWluaW5nID09PSAwO1xyXG5cdFx0Y29uc3QgZW52OiBOb2RlSlMuUHJvY2Vzc0VudiA9IHsgLi4ucHJvY2Vzcy5lbnYgfTtcclxuXHRcdGlmIChraW5kID09PSAnZ3JvaycpIHtcclxuXHRcdFx0aWYgKHVzZUZhbGxiYWNrICYmIGNhcmRLZXkpIHtcclxuXHRcdFx0XHRlbnYuWEFJX0FQSV9LRVkgPSBjYXJkS2V5O1xyXG5cdFx0XHRcdGlmIChvZmZpY2lhbD8uYmFzZVVybCkge1xyXG5cdFx0XHRcdFx0ZW52LlhBSV9BUElfQkFTRV9VUkwgPSBvZmZpY2lhbC5iYXNlVXJsO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSBlbHNlIGlmIChsb2dpbktleSkge1xyXG5cdFx0XHRcdGVudi5YQUlfQVBJX0tFWSA9IGxvZ2luS2V5O1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChhY2NvdW50LnN0YXR1cyA9PT0gJ3NpZ25lZEluJyB8fCBsb2dpbktleSkge1xyXG5cdFx0XHRcdGVudi5GT1JHRV9HUk9LX1NJR05FRF9JTiA9ICcxJztcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIGlmICh1c2VGYWxsYmFjayAmJiBjYXJkS2V5KSB7XHJcblx0XHRcdGVudi5ERUVQU0VFS19BUElfS0VZID0gY2FyZEtleTtcclxuXHRcdFx0aWYgKG9mZmljaWFsPy5iYXNlVXJsKSB7XHJcblx0XHRcdFx0ZW52LkRFRVBTRUVLX0JBU0VfVVJMID0gb2ZmaWNpYWwuYmFzZVVybDtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aWYgKGxvZ2luS2V5KSB7XHJcblx0XHRcdFx0ZW52LkRFRVBTRUVLX0FQSV9LRVkgPSBsb2dpbktleTtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAoYWNjb3VudC5zdGF0dXMgPT09ICdzaWduZWRJbicgfHwgbG9naW5LZXkpIHtcclxuXHRcdFx0XHRlbnYuRk9SR0VfREVFUFNFRUtfU0lHTkVEX0lOID0gJzEnO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRpZiAoa2luZCA9PT0gJ2RlZXBzZWVrJyAmJiAoYWNjb3VudC5zdGF0dXMgPT09ICdzaWduZWRJbicgfHwgbG9naW5LZXkpICYmICFlbnYuRk9SR0VfREVFUFNFRUtfU0lHTkVEX0lOKSB7XHJcblx0XHRcdGVudi5GT1JHRV9ERUVQU0VFS19TSUdORURfSU4gPSAnMSc7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZW52O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcHVibGlzaCgpOiB2b2lkIHtcclxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24ucHVibGlzaFJvb3RUcmFuc2llbnRWYWx1ZXM/Lih7XHJcblx0XHRcdFtGT1JHRV9PUkNIRVNUUkFUSU9OX1NUQVRFX0tFWV06IHRoaXMuX3J1bixcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYmVnaW5UcmFuc2NyaXB0KHBoYXNlOiBJT3JjaGVzdHJhdGlvblRyYW5zY3JpcHRFbnRyeVsncGhhc2UnXSwgYWdlbnRMYWJlbDogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCB0YXNrSWQ/OiBzdHJpbmcpOiBzdHJpbmcge1xyXG5cdFx0aWYgKCF0aGlzLl9ydW4pIHtcclxuXHRcdFx0cmV0dXJuIGdlbmVyYXRlVXVpZCgpO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcclxuXHRcdGNvbnN0IGVudHJ5OiBJT3JjaGVzdHJhdGlvblRyYW5zY3JpcHRFbnRyeSA9IHtcclxuXHRcdFx0aWQsXHJcblx0XHRcdHBoYXNlLFxyXG5cdFx0XHRhZ2VudExhYmVsLFxyXG5cdFx0XHR0aXRsZSxcclxuXHRcdFx0dGFza0lkLFxyXG5cdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcclxuXHRcdFx0dGhpbmtpbmc6ICcnLFxyXG5cdFx0fTtcclxuXHRcdHRoaXMuX3J1biA9IHtcclxuXHRcdFx0Li4udGhpcy5fcnVuLFxyXG5cdFx0XHR0cmFuc2NyaXB0OiBbLi4uKHRoaXMuX3J1bi50cmFuc2NyaXB0ID8/IFtdKSwgZW50cnldLFxyXG5cdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHR9O1xyXG5cdFx0dGhpcy5fcHVibGlzaCgpO1xyXG5cdFx0cmV0dXJuIGlkO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfdHJhbnNjcmlwdEhvb2tzKGVudHJ5SWQ6IHN0cmluZyk6IElPcmNoZXN0cmF0aW9uUHJvZ3Jlc3NIb29rcyB7XHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRvblByb2dyZXNzOiB1cGRhdGUgPT4ge1xyXG5cdFx0XHRcdGlmICghdGhpcy5fcnVuIHx8ICEodGhpcy5fcnVuLnRyYW5zY3JpcHQgPz8gW10pLnNvbWUoZW50cnkgPT4gZW50cnkuaWQgPT09IGVudHJ5SWQpKSB7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHRoaXMuX3J1biA9IHtcclxuXHRcdFx0XHRcdC4uLnRoaXMuX3J1bixcclxuXHRcdFx0XHRcdHRyYW5zY3JpcHQ6ICh0aGlzLl9ydW4udHJhbnNjcmlwdCA/PyBbXSkubWFwKGVudHJ5ID0+IGVudHJ5LmlkID09PSBlbnRyeUlkID8ge1xyXG5cdFx0XHRcdFx0XHQuLi5lbnRyeSxcclxuXHRcdFx0XHRcdFx0dGhpbmtpbmc6IHVwZGF0ZS50aGlua2luZyA/PyBlbnRyeS50aGlua2luZyxcclxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3M6IHVwZGF0ZS5wcm9ncmVzcyA/PyBlbnRyeS5wcm9ncmVzcyxcclxuXHRcdFx0XHRcdFx0b3V0cHV0OiB1cGRhdGUub3V0cHV0ID8/IGVudHJ5Lm91dHB1dCxcclxuXHRcdFx0XHRcdH0gOiBlbnRyeSksXHJcblx0XHRcdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHRcdFx0fTtcclxuXHRcdFx0XHR0aGlzLl9wdWJsaXNoVHJhbnNjcmlwdFRocm90dGxlZCgpO1xyXG5cdFx0XHR9LFxyXG5cdFx0fTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2NvbXBsZXRlVHJhbnNjcmlwdChlbnRyeUlkOiBzdHJpbmcsIG91dHB1dDogc3RyaW5nLCBzdGF0dXM6ICdjb21wbGV0ZWQnIHwgJ2ZhaWxlZCcpOiB2b2lkIHtcclxuXHRcdGlmICghdGhpcy5fcnVuIHx8ICEodGhpcy5fcnVuLnRyYW5zY3JpcHQgPz8gW10pLnNvbWUoZW50cnkgPT4gZW50cnkuaWQgPT09IGVudHJ5SWQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuX3J1biA9IHtcclxuXHRcdFx0Li4udGhpcy5fcnVuLFxyXG5cdFx0XHR0cmFuc2NyaXB0OiAodGhpcy5fcnVuLnRyYW5zY3JpcHQgPz8gW10pLm1hcChlbnRyeSA9PiBlbnRyeS5pZCA9PT0gZW50cnlJZCA/IHtcclxuXHRcdFx0XHQuLi5lbnRyeSxcclxuXHRcdFx0XHRvdXRwdXQsXHJcblx0XHRcdFx0c3RhdHVzLFxyXG5cdFx0XHR9IDogZW50cnkpLFxyXG5cdFx0XHR1cGRhdGVkQXQ6IERhdGUubm93KCksXHJcblx0XHR9O1xyXG5cdFx0dGhpcy5fcHVibGlzaCgpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcHVibGlzaFRyYW5zY3JpcHRUaHJvdHRsZWQoKTogdm9pZCB7XHJcblx0XHRpZiAodGhpcy5fdHJhbnNjcmlwdFB1Ymxpc2hUaW1lcikge1xyXG5cdFx0XHR0aGlzLl90cmFuc2NyaXB0UHVibGlzaFBlbmRpbmcgPSB0cnVlO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHR0aGlzLl90cmFuc2NyaXB0UHVibGlzaFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcblx0XHRcdHRoaXMuX3RyYW5zY3JpcHRQdWJsaXNoVGltZXIgPSB1bmRlZmluZWQ7XHJcblx0XHRcdGlmICh0aGlzLl90cmFuc2NyaXB0UHVibGlzaFBlbmRpbmcpIHtcclxuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0UHVibGlzaFBlbmRpbmcgPSBmYWxzZTtcclxuXHRcdFx0XHR0aGlzLl9wdWJsaXNoKCk7XHJcblx0XHRcdH1cclxuXHRcdH0sIDI1MCk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBlbXB0eVVzYWdlKCk6IElPcmNoZXN0cmF0aW9uVXNhZ2Uge1xyXG5cdHJldHVybiB7IGR1cmF0aW9uTXM6IDAsIGlucHV0VG9rZW5zOiAwLCBvdXRwdXRUb2tlbnM6IDAsIGNvc3RVc2Q6IDAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWRkKGxlZnQ6IG51bWJlciB8IHVuZGVmaW5lZCwgcmlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB7XHJcblx0cmV0dXJuIChsZWZ0ID8/IDApICsgKHJpZ2h0ID8/IDApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZWxheShtczogbnVtYmVyLCBhYm9ydD86IEFib3J0U2lnbmFsKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xyXG5cdFx0aWYgKGFib3J0Py5hYm9ydGVkKSB7XHJcblx0XHRcdHJlc29sdmUoKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKTtcclxuXHRcdGFib3J0Py5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsICgpID0+IHtcclxuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuXHRcdFx0cmVzb2x2ZSgpO1xyXG5cdFx0fSwgeyBvbmNlOiB0cnVlIH0pO1xyXG5cdH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiB1bmlxdWVQYXRocyhwYXRoczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmdbXSB7XHJcblx0cmV0dXJuIFsuLi5uZXcgU2V0KHBhdGhzLm1hcChwYXRoID0+IHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpKS5maWx0ZXIocGF0aCA9PiBwYXRoICE9PSAnJykpXTtcclxufVxyXG5cclxuZnVuY3Rpb24gd29ya2VyVW5hdmFpbGFibGVNZXNzYWdlKGxhYmVsOiBzdHJpbmcsIGF2YWlsYWJpbGl0eTogSVdvcmtlckF2YWlsYWJpbGl0eSk6IHN0cmluZyB7XHJcblx0c3dpdGNoIChhdmFpbGFiaWxpdHkucmVhc29uKSB7XHJcblx0XHRjYXNlICdtaXNzaW5nLWNyZWRlbnRpYWxzJzpcclxuXHRcdFx0cmV0dXJuIGAke2xhYmVsfSBpcyB1bmF2YWlsYWJsZTogQVBJIGtleSBvciBzYXZlZCBjcmVkZW50aWFscyBhcmUgbWlzc2luZy5gO1xyXG5cdFx0Y2FzZSAnbWlzc2luZy1leGVjdXRhYmxlJzpcclxuXHRcdFx0cmV0dXJuIGAke2xhYmVsfSBpcyB1bmF2YWlsYWJsZTogcnVudGltZSBiaW5hcnkgd2FzIG5vdCBmb3VuZCR7YXZhaWxhYmlsaXR5LmV4ZWN1dGFibGUgPyBgICgke2F2YWlsYWJpbGl0eS5leGVjdXRhYmxlfSlgIDogJyd9LmA7XHJcblx0XHRjYXNlICdwcm9iZS1mYWlsZWQnOlxyXG5cdFx0XHRyZXR1cm4gYCR7bGFiZWx9IGlzIHVuYXZhaWxhYmxlOiBydW50aW1lIHByb2JlIGZhaWxlZCR7YXZhaWxhYmlsaXR5LmV4ZWN1dGFibGUgPyBgICgke2F2YWlsYWJpbGl0eS5leGVjdXRhYmxlfSlgIDogJyd9LmA7XHJcblx0XHRjYXNlICdhZ2VudC11bmF2YWlsYWJsZSc6XHJcblx0XHRcdHJldHVybiBgJHtsYWJlbH0gaXMgdW5hdmFpbGFibGU6IENvZGV4IGFnZW50IGlzIG5vdCBjb25uZWN0ZWQuYDtcclxuXHRcdGRlZmF1bHQ6XHJcblx0XHRcdHJldHVybiBgJHtsYWJlbH0gaXMgdW5hdmFpbGFibGUuIEluc3Rh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
