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
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { ClaudePromptQueue } from "./claudePromptQueue.js";
import { ClaudeSdkMessageRouter } from "./claudeSdkMessageRouter.js";
let ClaudeSdkPipeline = class extends Disposable {
  constructor(sessionId, chatChannelUri, resource, warm, abortController, dbRef, subagents, clientToolOwner = void 0, instantiationService, _logService) {
    super();
    this.sessionId = sessionId;
    this.chatChannelUri = chatChannelUri;
    this._logService = _logService;
    /** Flips to `true` on the first `system:init` SDK message. Drives `Options.resume` decisions for downstream phases. */
    this._isResumed = false;
    /**
     * Native plugins reported by the most recent `system:init` message.
     * Captured on *every* init (including resume) so the post-materialize
     * native-plugin filter always reflects the live set. `source` is the
     * plugin id and is the reliable match key (see {@link ISdkResolvedCustomizations}).
     */
    this._initPlugins = [];
    /** Set when the consumer loop ends in error (cancellation OR crash). Read by {@link send} to trigger rebind. */
    this._needsRebind = false;
    /** Tracks whether the consumer loop is currently draining {@link _query}. */
    this._consumerLoopRunning = false;
    this._onDidProduceSignal = this._register(new Emitter());
    /**
     * Single fan-out for every {@link AgentSignal} this session produces:
     *   • Router-mapped per-message signals (response parts, tool calls,
     *     pending confirmations, etc.).
     *   • `ChatTurnComplete` action, fired when the LAST entry in the
     *     queue drains via `result` (intermediate results during steering
     *     preempt do NOT fire — CONTEXT.md M10).
     *   • `steering_consumed` signal, fired the moment the iterable yields
     *     a steering entry to the SDK.
     */
    this.onDidProduceSignal = this._onDidProduceSignal.event;
    this._warm = warm;
    this._abortController = abortController;
    this._wireAbortHandler(abortController);
    this._queue = this._register(instantiationService.createInstance(
      ClaudePromptQueue,
      sessionId,
      () => this._abortController.signal,
      (pendingId) => this._onDidProduceSignal.fire({
        kind: "steering_consumed",
        chat: this.chatChannelUri,
        id: pendingId
      })
    ));
    this._router = this._register(instantiationService.createInstance(
      ClaudeSdkMessageRouter,
      chatChannelUri,
      resource,
      dbRef,
      subagents,
      clientToolOwner
    ));
    this._register(this._router.onDidProduceSignal((s) => this._onDidProduceSignal.fire(s)));
    this._register(toDisposable(() => this._abortController.abort()));
    this._register(toDisposable(() => {
      void Promise.resolve(this._warm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline] WarmQuery dispose failed: ${err}`));
    }));
  }
  /**
   * Phase 11 — hot-swap the SDK's plugin set in place via
   * `Query.reloadPlugins()`. Commands / agents / mcpServers added or
   * removed by the new plugin set become visible to the SDK
   * immediately, without a session restart. Throws if the query is
   * not yet bound (session not materialized).
   */
  async reloadPlugins() {
    const query = await this._ensureQueryBound();
    await query.reloadPlugins();
  }
  /**
   * Phase 11 — snapshot the SDK's currently-resolved customization
   * surface (slash commands / skills, subagents, MCP servers). This
   * is the SDK's view of "what does this session actually have
   * access to right now" — covers everything the SDK loaded itself
   * (`~/.claude/**`, `.claude/agents/`, `settings.json` MCP) AND
   * anything we fed in via `Options.plugins`. The host overlays
   * client-side enablement separately.
   */
  async snapshotResolvedCustomizations() {
    const query = await this._ensureQueryBound();
    const [commands, agents, mcpServers] = await Promise.all([
      query.supportedCommands(),
      query.supportedAgents(),
      query.mcpServerStatus()
    ]);
    return { commands, agents, mcpServers, plugins: this._initPlugins };
  }
  async startMcpServer(serverName) {
    const query = await this._ensureQueryBound();
    return this._applyMcpServerEnablement(query, serverName, true);
  }
  async stopMcpServer(serverName) {
    const query = await this._ensureQueryBound();
    return this._applyMcpServerEnablement(query, serverName, false);
  }
  async reconcileMcpServerEnablement(desired) {
    const query = await this._ensureQueryBound();
    const observed = new Map((await query.mcpServerStatus()).map((server) => [server.name, server.status !== "disabled"]));
    for (const [serverName, enabled] of desired) {
      const current = observed.get(serverName);
      if (current === void 0 || current === enabled) {
        continue;
      }
      if (!await this._applyMcpServerEnablement(query, serverName, enabled)) {
        return false;
      }
    }
    return true;
  }
  async _applyMcpServerEnablement(query, serverName, enabled) {
    if (!query.toggleMcpServer || enabled && !query.reconnectMcpServer) {
      return false;
    }
    await query.toggleMcpServer(serverName, enabled);
    if (enabled) {
      await query.reconnectMcpServer(serverName);
    }
    return true;
  }
  /**
   * Bind the SDK Query if needed, recovering a dead one first. Mirrors the
   * gate in {@link send}: if the pipeline is marked for rebind (after an
   * abort/crash the `_query` handle is retained for teardown but its stream
   * is dead), rebuild via the rematerializer so pre-flight helpers never
   * operate on a disposed stream. Then lazily bind if nothing is bound yet.
   */
  async _ensureQueryBound() {
    if (this._needsRebind) {
      await this._rebindQuery("recover");
    }
    if (!this._query) {
      this._bindWarmQuery();
      await this._replayCurrentConfig();
    }
    return this._query;
  }
  /**
   * Bind a fresh SDK stream off the current warm subprocess. The stream is
   * long-lived: it spans every turn until a rebind swaps the subprocess (the
   * prompt iterable parks between turns rather than ending), so {@link _query}
   * tracks the lifetime of {@link _warm} and is only swapped here.
   */
  _bindWarmQuery() {
    const query = this._warm.query(this._queue.iterable);
    this._query = query;
    return query;
  }
  get isResumed() {
    return this._isResumed;
  }
  get isAborted() {
    return this._abortController.signal.aborted;
  }
  /**
   * Whether a turn is currently in flight or queued. False between turns (the
   * warm query parks with a drained queue). Used by non-destructive idle
   * release to avoid tearing the pipeline down mid-turn.
   */
  get hasActiveTurn() {
    return !this._queue.isEmpty;
  }
  /**
   * Abort the live SDK subprocess and **await its actual exit**.
   *
   * `WarmQuery[Symbol.asyncDispose]()` calls the query's `close()`, which
   * *fires* the SDK cleanup but does not await it — so it returns while the
   * subprocess is still shutting down (and still re-flushing its transcript).
   * `Query.return()` awaits the same (memoized) cleanup, which in turn awaits
   * `transport.waitForExit()` — the OS process actually exiting after its
   * final transcript flush. Awaiting that is what lets a caller safely reuse
   * the `--session-id` (the CLI rejects a fresh spawn while `<id>.jsonl`
   * still exists, and the dying process would otherwise recreate it).
   */
  async shutdownAndWait() {
    this._abortController.abort();
    try {
      await this._warm[Symbol.asyncDispose]();
      await this._query?.return(void 0);
    } catch (err) {
      this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] shutdownAndWait: teardown failed`, err);
    }
  }
  /**
   * Phase 10 \u2014 narrow public wrapper around the internal
   * {@link _rebindQuery} so {@link ClaudeAgentSession.rebindForClientTools}
   * can drive a yield-restart without exposing the private rebind
   * machinery to every collaborator.
   */
  rebindForRestart() {
    return this._rebindQuery("restart");
  }
  /**
   * Phase 10 — update the resolver the stream mapper uses to stamp the
   * owning workbench `clientId` onto subsequent `ChatToolCallStart` events.
   */
  setClientToolOwner(clientToolOwner) {
    this._router.setClientToolOwner(clientToolOwner);
  }
  /** Attach the rematerializer hook for abort / crash recovery. Optional — tests that exercise only the dispose path skip this. */
  attachRematerializer(rematerializer) {
    this._rematerializer = rematerializer;
  }
  /**
   * Seed the current + applied config from materialize-time `Options`.
   * The SDK already starts with these values, so we mark them as both
   * "current" (what the consumer wants) and "applied" (what the SDK has)
   * to avoid a redundant `setModel` / `applyFlagSettings` on first use.
   */
  seedCurrentConfig(model, effort, permissionMode) {
    this._currentModel = model;
    this._currentEffort = effort;
    this._currentPermissionMode = permissionMode;
    this._appliedModel = model;
    this._appliedEffort = effort;
    this._appliedPermissionMode = permissionMode;
  }
  /**
   * Eagerly push a model change to the SDK. Safe to call mid-turn:
   * `Query.setModel` only takes effect on the NEXT user request. No-op
   * if the value is unchanged. Buffered as `_currentModel` until the
   * Query is bound (and replayed on rebind).
   */
  async setModel(model) {
    this._currentModel = model;
    if (this._query && !this._needsRebind && model !== this._appliedModel) {
      try {
        await this._query.setModel(model);
        this._appliedModel = model;
      } catch (err) {
        this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setModel failed: ${err}`);
      }
    }
  }
  /**
   * Eagerly push an effort-level change to the SDK via
   * `applyFlagSettings({ effortLevel })`. Same mid-turn safety as
   * {@link setModel}.
   *
   * `undefined` means "clear the effort the SDK is currently applying" —
   * issued as `applyFlagSettings({ effortLevel: null })` (sdk.d.ts:2263:
   * passing `null` clears a key from the flag layer). This is what makes a
   * switch to a model that does not support reasoning effort (e.g. Haiku)
   * drop a `'high'` left over from a prior effort-capable model instead of
   * replaying it onto a model the API will 400 on.
   */
  async setEffort(effort) {
    this._currentEffort = effort;
    if (this._query && !this._needsRebind && effort !== this._appliedEffort) {
      try {
        await this._query.applyFlagSettings({ effortLevel: effort ?? null });
        this._appliedEffort = effort;
      } catch (err) {
        this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setEffort failed: ${err}`);
      }
    }
  }
  /**
   * Advance the *desired* model / effort for the NEXT rebind WITHOUT pushing
   * them to the live Query.
   *
   * A cross-transport provider switch is about to discard the running
   * subprocess (it is pinned to the old transport / credential), so
   * hot-swapping it via {@link setModel} / {@link setEffort} is pointless —
   * and would 400 on a model the old transport does not serve. But
   * {@link _currentModel} / {@link _currentEffort} must still move to the new
   * selection: after the rebuild, {@link _rebindQuery} resets the applied
   * cache and {@link _replayCurrentConfig} re-asserts `_currentModel` onto the
   * fresh Query. The rebuild resumes the transcript, which replays the
   * pre-switch `/model`; without advancing the buffer here that stale replay
   * would win and the rebuilt subprocess would silently run the old model on
   * the new transport (→ `model_not_supported`).
   */
  bufferConfigForRebind(model, effort) {
    this._currentModel = model;
    this._currentEffort = effort;
  }
  /**
   * Queue a user prompt for the SDK. Resolves when the matching
   * `result` message arrives.
   *
   * If a previous turn aborted or crashed, this triggers a rebind via
   * the attached rematerializer before queueing.
   */
  async send(prompt, turnId, clientContext) {
    if (this._needsRebind) {
      await this._rebindQuery("recover");
    }
    if (this._abortController.signal.aborted) {
      throw new CancellationError();
    }
    if (!this._query) {
      this._bindWarmQuery();
      await this._replayCurrentConfig();
    }
    this._ensureConsumerLoop();
    const entry = {
      sdkMessage: prompt,
      sdkUuid: typeof prompt.uuid === "string" ? prompt.uuid : turnId,
      turnId,
      clientContext,
      stopWatch: StopWatch.create(false),
      deferred: new DeferredPromise()
    };
    return this._queue.push(entry);
  }
  /**
   * Push a `priority: 'now'` steering message into the iterable. The
   * caller pre-builds the {@link SDKUserMessage} (the pipeline is SDK
   * messaging-shaped, not protocol-shaped). `pendingMessageId` is the
   * protocol `PendingMessage.id` that {@link onSteeringConsumed} will
   * carry when the SDK accepts the message.
   *
   * No-op if the pipeline is aborted or no in-flight / queued request
   * exists to inherit a `turnId` from (CONTEXT.md M10: steering folds
   * into the in-progress protocol Turn).
   */
  injectSteering(prompt, pendingMessageId) {
    if (this._abortController.signal.aborted) {
      this._logService.warn(`[Claude:${this.sessionId}] injectSteering: dropped (controller aborted) id=${pendingMessageId}`);
      return;
    }
    const parent = this._queue.peekParent();
    if (!parent) {
      this._logService.warn(`[Claude:${this.sessionId}] injectSteering: dropped (no in-flight turn) id=${pendingMessageId}`);
      return;
    }
    const sdkUuid = typeof prompt.uuid === "string" ? prompt.uuid : pendingMessageId;
    this._queue.push({
      sdkMessage: prompt,
      sdkUuid,
      turnId: parent.turnId,
      clientContext: parent.clientContext,
      stopWatch: parent.stopWatch,
      deferred: new DeferredPromise(),
      steeringPendingId: pendingMessageId
    }).catch(() => {
    });
    this._logService.info(`[Claude:${this.sessionId}] injectSteering: enqueued id=${pendingMessageId} sdkUuid=${sdkUuid}`);
  }
  /**
   * Cancel the in-flight SDK turn via the abort controller. Drops every
   * pending entry's deferred (rejected with `CancellationError`),
   * marks the pipeline for rebind on next {@link send}. Idempotent.
   *
   * Safe to call during rebind: {@link _rebindQuery} swaps in a fresh
   * placeholder {@link AbortController} before awaiting the
   * rematerializer, so an abort issued during recovery lands on that
   * placeholder and is honored when the freshly-built pair arrives
   * (the rebind discards the new pair and surfaces a cancellation).
   */
  abort() {
    if (this._abortController.signal.aborted) {
      return;
    }
    this._abortController.abort();
    this._queue.failAll(new CancellationError());
    this._needsRebind = true;
  }
  /**
   * Forwards to {@link Query.setPermissionMode} once the query is
   * bound; the value is also remembered so it's re-applied after a
   * rebind. Permission mode is whole-session (not per-entry).
   */
  async setPermissionMode(mode) {
    this._currentPermissionMode = mode;
    if (this._query && !this._needsRebind && mode !== this._appliedPermissionMode) {
      await this._query.setPermissionMode(mode);
      this._appliedPermissionMode = mode;
    }
  }
  _wireAbortHandler(controller) {
    controller.signal.addEventListener("abort", () => {
      this._queue.notifyAborted();
    }, { once: true });
  }
  _ensureConsumerLoop() {
    if (this._consumerLoopRunning) {
      return;
    }
    this._consumerLoopRunning = true;
    this._runConsumerLoop();
  }
  /**
   * Runs one {@link _processMessages} pass over the live {@link _query} and,
   * when it ends, decides whether to hand off to a fresh pass.
   *
   * A rebind ({@link _rebindQuery}) swaps in a new `_query` while the loop is
   * still draining the OLD (now-disposed) one; that old pass then ends with
   * the "stream ended without a result" guard. Because `_consumerLoopRunning`
   * stays `true` for the whole handoff, the {@link send} that queued the
   * post-rebind prompt already saw {@link _ensureConsumerLoop} no-op — so if
   * this pass just stopped, nothing would ever read the new query and `send`
   * would hang. Detect the swap (current `_query` differs from the one this
   * pass bound) and re-arm for it instead. Abort / crash / dispose leave
   * `_query` cleared (or the store disposed), so they fall through to stop.
   */
  _runConsumerLoop() {
    const boundQuery = this._query;
    void this._processMessages().catch((err) => this._logService.error(`[ClaudeSdkPipeline:${this.sessionId}] _processMessages crashed: ${err}`)).finally(() => {
      if (!this._store.isDisposed && this._query && this._query !== boundQuery) {
        this._runConsumerLoop();
      } else {
        this._consumerLoopRunning = false;
      }
    });
  }
  /**
   * Push the current model / effort / permissionMode to the SDK if they
   * diverge from what was last applied. Called after binding a fresh
   * Query (initial first-send and after rebind). Failures are logged.
   */
  async _replayCurrentConfig() {
    try {
      if (this._currentModel !== void 0 && this._currentModel !== this._appliedModel) {
        await this._query?.setModel(this._currentModel);
        this._appliedModel = this._currentModel;
      }
      if (this._currentEffort !== void 0 && this._currentEffort !== this._appliedEffort) {
        await this._query?.applyFlagSettings({ effortLevel: this._currentEffort });
        this._appliedEffort = this._currentEffort;
      }
      if (this._currentPermissionMode !== void 0 && this._currentPermissionMode !== this._appliedPermissionMode) {
        await this._query?.setPermissionMode(this._currentPermissionMode);
        this._appliedPermissionMode = this._currentPermissionMode;
      }
    } catch (err) {
      this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] _replayCurrentConfig failed: ${err}`);
    }
  }
  /**
   * Dispose the dead SDK plumbing and rebuild via the agent-supplied
   * rematerializer in `resume` mode. Re-applies the current model /
   * effort / permission mode to the fresh Query.
   */
  async _rebindQuery(reason) {
    if (!this._rematerializer) {
      throw new Error(`ClaudeSdkPipeline.rebind: no rematerializer attached (reason=${reason})`);
    }
    const oldWarm = this._warm;
    const placeholder = new AbortController();
    this._abortController = placeholder;
    const built = await this._rematerializer(reason);
    if (this._store.isDisposed) {
      built.abortController.abort();
      void Promise.resolve(built.warm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] rebind-after-dispose: warm dispose failed: ${err}`));
      throw new CancellationError();
    }
    if (placeholder.signal.aborted) {
      built.abortController.abort();
      void Promise.resolve(built.warm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] rebind-aborted: warm dispose failed: ${err}`));
      void Promise.resolve(oldWarm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] previous WarmQuery dispose failed during aborted rebind: ${err}`));
      this._queue.failAll(new CancellationError());
      this._needsRebind = true;
      throw new CancellationError();
    }
    void Promise.resolve(oldWarm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] previous WarmQuery dispose failed during rebind: ${err}`));
    this._warm = built.warm;
    this._abortController = built.abortController;
    this._wireAbortHandler(built.abortController);
    this._queue.resetForRebind();
    this._needsRebind = false;
    this._appliedModel = void 0;
    this._appliedEffort = void 0;
    this._appliedPermissionMode = void 0;
    this._bindWarmQuery();
    await this._replayCurrentConfig();
  }
  /**
   * Consumer loop. Drains the SDK iterator, dispatches each message
   * to the {@link ClaudeSdkMessageRouter} (awaited so async file-edit
   * observation completes before the next message), settles the head
   * entry's deferred on `result`, and fires `ChatTurnComplete` only
   * when the queue fully drains.
   *
   * On any uncaught error (cancellation, transport failure, or the
   * post-loop "stream ended without result" guard) the catch block
   * rejects every pending entry's deferred with the same error and
   * marks `_needsRebind=true`. Cancellation is swallowed (don't
   * rethrow); other errors propagate to the void caller's `.catch` for
   * logging.
   */
  async _processMessages() {
    const query = this._query;
    if (!query) {
      throw new Error("ClaudeSdkPipeline._processMessages called before query was bound");
    }
    try {
      for await (const message of query) {
        if (this._abortController.signal.aborted) {
          throw new CancellationError();
        }
        if (message.type === "system" && message.subtype === "init") {
          this._initPlugins = message.plugins ?? [];
          if (!this._isResumed) {
            this._isResumed = true;
          }
        }
        const parent = this._queue.peekParent();
        const turnId = parent?.turnId;
        const clientContext = parent?.clientContext;
        const turnDuration = parent?.stopWatch.elapsed();
        try {
          await this._router.handle(message, turnId, {
            turnDuration,
            mode: this._currentPermissionMode,
            clientContext
          });
        } catch (handlerErr) {
          this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] router threw, skipping: ${handlerErr}`);
        }
        if (message.type === "result") {
          const completed = this._queue.settleHead();
          this._logService.info(`[Claude:${this.sessionId}] result for sdkUuid=${completed?.sdkUuid}`);
          if (completed && this._queue.isEmpty) {
            this._onDidProduceSignal.fire({
              kind: "action",
              resource: this.chatChannelUri,
              action: {
                type: ActionType.ChatTurnComplete,
                turnId: completed.turnId,
                duration: Math.max(0, completed.stopWatch.elapsed())
              }
            });
          }
        }
      }
      if (this._abortController.signal.aborted) {
        throw new CancellationError();
      }
      if (this._query !== query) {
        return;
      }
      throw new Error("Claude SDK stream ended without a result message");
    } catch (err) {
      const fatal = err instanceof Error ? err : new Error(String(err));
      if (this._query === query) {
        this._queue.failAll(fatal);
        this._needsRebind = true;
      }
      if (!isCancellationError(fatal)) {
        throw fatal;
      }
    }
  }
};
ClaudeSdkPipeline = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILogService)
], ClaudeSdkPipeline);
export {
  ClaudeSdkPipeline
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZVNka1BpcGVsaW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBBZ2VudEluZm8sIE1jcFNlcnZlclN0YXR1cywgUGVybWlzc2lvbk1vZGUsIFF1ZXJ5LCBTREtVc2VyTWVzc2FnZSwgU2xhc2hDb21tYW5kLCBXYXJtUXVlcnkgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUnVudGltZUVmZm9ydExldmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NsYXVkZU1vZGVsQ29uZmlnLmpzJztcbmltcG9ydCB7IEFnZW50U2lnbmFsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUHJvbXB0UXVldWUsIElQZW5kaW5nU2RrTWVzc2FnZSB9IGZyb20gJy4vY2xhdWRlUHJvbXB0UXVldWUuanMnO1xuaW1wb3J0IHsgQ2xhdWRlU2RrTWVzc2FnZVJvdXRlciB9IGZyb20gJy4vY2xhdWRlU2RrTWVzc2FnZVJvdXRlci5qcyc7XG5pbXBvcnQgdHlwZSB7IFN1YmFnZW50UmVnaXN0cnkgfSBmcm9tICcuL2NsYXVkZVN1YmFnZW50UmVnaXN0cnkuanMnO1xuXG4vKipcbiAqIENhbGxiYWNrIHRoZSBhZ2VudCBzdXBwbGllcyB2aWEge0BsaW5rIENsYXVkZVNka1BpcGVsaW5lLmF0dGFjaFJlbWF0ZXJpYWxpemVyfVxuICogc28gdGhlIHBpcGVsaW5lIGNhbiByZWJ1aWxkIGl0cyB1bmRlcmx5aW5nIHtAbGluayBXYXJtUXVlcnl9IC9cbiAqIHtAbGluayBBYm9ydENvbnRyb2xsZXJ9IG9uIGFib3J0IG9yIGNyYXNoIHJlY292ZXJ5IHdpdGhvdXQgZGVwZW5kaW5nIG9uXG4gKiB0aGUgbWF0ZXJpYWxpemVyIHNlcnZpY2UgZGlyZWN0bHkuIFRoZSBjYWxsYmFjayBNVVNUIHN0YXJ0IHRoZSBTREsgaW5cbiAqIGByZXN1bWVgIG1vZGUgKGkuZS4gcGFzcyBgT3B0aW9ucy5yZXN1bWUgPSBzZXNzaW9uSWRgIGluc3RlYWQgb2ZcbiAqIGBPcHRpb25zLnNlc3Npb25JZGApIGFuZCBNVVNUIE5PVCByZS1maXJlIHRoZSBhZ2VudCdzXG4gKiBgb25EaWRNYXRlcmlhbGl6ZUNoYXRgIGV2ZW50IFx1MjAxNCB0aGF0IGV2ZW50IGlzIG9uY2UtcGVyLXByb3Zpc2lvbmFsXG4gKiBwcm9tb3Rpb24gKHNlZSBgY2xhdWRlQWdlbnQudHNgIG1hdGVyaWFsaXplIHBhdGgpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSZW1hdGVyaWFsaXplciB7XG5cdChyZWFzb246ICdyZXN0YXJ0JyB8ICdyZWNvdmVyJyk6IFByb21pc2U8eyByZWFkb25seSB3YXJtOiBXYXJtUXVlcnk7IHJlYWRvbmx5IGFib3J0Q29udHJvbGxlcjogQWJvcnRDb250cm9sbGVyIH0+O1xufVxuXG4vKipcbiAqIE93bnMgb25lIFNESyBRdWVyeSBsaWZlY3ljbGUgZm9yIGEgQ2xhdWRlIHNlc3Npb24uIEtub3dzIG5vdGhpbmcgYWJvdXRcbiAqIHByb3RvY29sIHR1cm5zLCB0aGUgd29ya2JlbmNoIG1hcHBlciwgZmlsZS1lZGl0IG9ic2VydmVycywgb3JcbiAqIHBlcm1pc3Npb24gcmVnaXN0cmllcyBcdTIwMTQgdGhlIGNvbnN1bWluZyBzZXNzaW9uIHN1YnNjcmliZXMgdG9cbiAqIHtAbGluayBvbkRpZFByb2R1Y2VTaWduYWx9IGFuZCBmYW5zIG91dCB0byBpdHMgb3duIGNvbGxhYm9yYXRvcnMuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqICAgXHUyMDIyIEhvbGQgdGhlIHtAbGluayBXYXJtUXVlcnl9ICsge0BsaW5rIEFib3J0Q29udHJvbGxlcn0gZm9yIHRoZVxuICogICAgIGFjdGl2ZSBTREsgc3VicHJvY2Vzcy4gQm90aCBhcmUgbXV0YWJsZTogcmViaW5kIG9uIGFib3J0L2NyYXNoXG4gKiAgICAgcmVjb3ZlcnkgdmlhIHRoZSBzdXBwbGllZCB7QGxpbmsgSVJlbWF0ZXJpYWxpemVyfS5cbiAqICAgXHUyMDIyIERyaXZlIGEge0BsaW5rIENsYXVkZVByb21wdFF1ZXVlfSB3aG9zZSBpdGVyYWJsZSBpcyBoYW5kZWQgdG9cbiAqICAgICBgV2FybVF1ZXJ5LnF1ZXJ5KClgLlxuICogICBcdTIwMjIgQXBwbHkgdGhlIGN1cnJlbnQgbW9kZWwgLyBlZmZvcnQgLyBwZXJtaXNzaW9uTW9kZSB0byB0aGUgU0RLXG4gKiAgICAgZWFnZXJseSB3aGVuIHRoZSBjb25zdW1lciBjYWxscyB7QGxpbmsgc2V0TW9kZWx9IC9cbiAqICAgICB7QGxpbmsgc2V0RWZmb3J0fSAvIHtAbGluayBzZXRQZXJtaXNzaW9uTW9kZX0uIFRoZSBTREsgb25seSB0YWtlc1xuICogICAgIHRoZXNlIGludG8gYWNjb3VudCBvbiB0aGUgTkVYVCB1c2VyIHJlcXVlc3QsIHNvIG1pZC10dXJuIGNhbGxzXG4gKiAgICAgYXJlIHNhZmUgXHUyMDE0IG5vIG5lZWQgdG8gYWxpZ24gdGhlIFNESyBzZXR0ZXIgd2l0aCB0aGUgcHJvbXB0IHlpZWxkLlxuICogICAgIFJlLWFwcGxpZWQgdG8gYSBmcmVzaCBRdWVyeSBvbiByZWJpbmQuXG4gKiAgIFx1MjAyMiBEcmFpbiB0aGUgU0RLIG1lc3NhZ2Ugc3RyZWFtLCBkaXNwYXRjaCBlYWNoIG1lc3NhZ2UgdG8gdGhlXG4gKiAgICAge0BsaW5rIENsYXVkZVNka01lc3NhZ2VSb3V0ZXJ9LCBzZXR0bGUgdGhlIG1hdGNoaW5nIGVudHJ5J3NcbiAqICAgICBkZWZlcnJlZCBvbiBgcmVzdWx0YCwgYW5kIGVtaXQgYENoYXRUdXJuQ29tcGxldGVgIG9ubHkgd2hlblxuICogICAgIHRoZSBxdWV1ZSBmdWxseSBkcmFpbnMgKGludGVybWVkaWF0ZSByZXN1bHRzIGR1cmluZyBzdGVlcmluZ1xuICogICAgIHByZWVtcHRpb24gZG8gTk9UIGZpcmUgdHVybi1jb21wbGV0ZSBcdTIwMTQgQ09OVEVYVC5tZCBNMTApLlxuICpcbiAqIERpc3Bvc2luZyB0aGUgcGlwZWxpbmUgYWJvcnRzIHRoZSBjb250cm9sbGVyICh0ZXJtaW5hdGluZyB0aGUgU0RLXG4gKiBzdWJwcm9jZXNzIHBlciBgc2RrLmQudHM6OTgyYCkgYW5kIGFzeW5jLWRpc3Bvc2VzIHRoZSBXYXJtUXVlcnkuXG4gKi9cbi8qKlxuICogU25hcHNob3Qgb2YgZXZlcnl0aGluZyB0aGUgU0RLIGhhcyBjdXJyZW50bHkgcmVzb2x2ZWQgZm9yIHRoaXNcbiAqIHNlc3Npb24uIFJldHVybmVkIGJ5IHtAbGluayBDbGF1ZGVTZGtQaXBlbGluZS5zbmFwc2hvdFJlc29sdmVkQ3VzdG9taXphdGlvbnN9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZGtSZXNvbHZlZEN1c3RvbWl6YXRpb25zIHtcblx0cmVhZG9ubHkgY29tbWFuZHM6IHJlYWRvbmx5IFNsYXNoQ29tbWFuZFtdO1xuXHRyZWFkb25seSBhZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdO1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJzOiByZWFkb25seSBNY3BTZXJ2ZXJTdGF0dXNbXTtcblx0LyoqXG5cdCAqIE5hdGl2ZSBwbHVnaW5zIHRoZSBsaXZlIHNlc3Npb24gYWN0dWFsbHkgbG9hZGVkLCBhcyByZXBvcnRlZCBieSB0aGVcblx0ICogU0RLIGBzeXN0ZW0vaW5pdGAgbWVzc2FnZS4gVXNlZCB0byBmaWx0ZXIgdGhlIGRpc2stZGlzY292ZXJlZCBuYXRpdmVcblx0ICogcGx1Z2lucyBwb3N0LW1hdGVyaWFsaXplOiBhIHBsdWdpbiBkZWNsYXJlZCBpbiBgZW5hYmxlZFBsdWdpbnNgIGJ1dFxuXHQgKiBhYnNlbnQgaGVyZSAoYmFkIHBhdGgsIG1hbmlmZXN0IGVycm9yLCB1bnRydXN0ZWQgd29ya3NwYWNlKSBpcyBoaWRkZW4uXG5cdCAqXG5cdCAqIGBzb3VyY2VgIGlzIHRoZSBwbHVnaW4gaWQgKGA8cGx1Z2luPkA8bWFya2V0cGxhY2U+YCkgYW5kIGlzIHRoZVxuXHQgKiBhdXRob3JpdGF0aXZlIG1hdGNoIGtleSBcdTIwMTQgdGhlIFNESydzIGBwYXRoYCBpcyB1bnJlbGlhYmxlIGZvclxuXHQgKiB3b3Jrc3BhY2UtYGxvY2FsYC1zY29wZWQgcGx1Z2lucyAoaXQgY2FuIHJlcG9ydCBhIG5vbi1jYWNoZSBwYXRoKS4gVGhlXG5cdCAqIFNESyBgLmQudHNgIHR5cGVzIHRoZSBlbGVtZW50IGFzIGB7IG5hbWUsIHBhdGggfWAgYnV0IHRoZSBydW50aW1lIGFkZHNcblx0ICogYHNvdXJjZWAsIHNvIGl0IGlzIGNhcHR1cmVkIGFzIG9wdGlvbmFsLlxuXHQgKi9cblx0cmVhZG9ubHkgcGx1Z2luczogcmVhZG9ubHkgeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IHBhdGg6IHN0cmluZzsgcmVhZG9ubHkgc291cmNlPzogc3RyaW5nIH1bXTtcbn1cblxuZXhwb3J0IGNsYXNzIENsYXVkZVNka1BpcGVsaW5lIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBQaGFzZSAxMSBcdTIwMTQgaG90LXN3YXAgdGhlIFNESydzIHBsdWdpbiBzZXQgaW4gcGxhY2UgdmlhXG5cdCAqIGBRdWVyeS5yZWxvYWRQbHVnaW5zKClgLiBDb21tYW5kcyAvIGFnZW50cyAvIG1jcFNlcnZlcnMgYWRkZWQgb3Jcblx0ICogcmVtb3ZlZCBieSB0aGUgbmV3IHBsdWdpbiBzZXQgYmVjb21lIHZpc2libGUgdG8gdGhlIFNES1xuXHQgKiBpbW1lZGlhdGVseSwgd2l0aG91dCBhIHNlc3Npb24gcmVzdGFydC4gVGhyb3dzIGlmIHRoZSBxdWVyeSBpc1xuXHQgKiBub3QgeWV0IGJvdW5kIChzZXNzaW9uIG5vdCBtYXRlcmlhbGl6ZWQpLlxuXHQgKi9cblx0YXN5bmMgcmVsb2FkUGx1Z2lucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVF1ZXJ5Qm91bmQoKTtcblx0XHRhd2FpdCBxdWVyeS5yZWxvYWRQbHVnaW5zKCk7XG5cdH1cblxuXHQvKipcblx0ICogUGhhc2UgMTEgXHUyMDE0IHNuYXBzaG90IHRoZSBTREsncyBjdXJyZW50bHktcmVzb2x2ZWQgY3VzdG9taXphdGlvblxuXHQgKiBzdXJmYWNlIChzbGFzaCBjb21tYW5kcyAvIHNraWxscywgc3ViYWdlbnRzLCBNQ1Agc2VydmVycykuIFRoaXNcblx0ICogaXMgdGhlIFNESydzIHZpZXcgb2YgXCJ3aGF0IGRvZXMgdGhpcyBzZXNzaW9uIGFjdHVhbGx5IGhhdmVcblx0ICogYWNjZXNzIHRvIHJpZ2h0IG5vd1wiIFx1MjAxNCBjb3ZlcnMgZXZlcnl0aGluZyB0aGUgU0RLIGxvYWRlZCBpdHNlbGZcblx0ICogKGB+Ly5jbGF1ZGUvKipgLCBgLmNsYXVkZS9hZ2VudHMvYCwgYHNldHRpbmdzLmpzb25gIE1DUCkgQU5EXG5cdCAqIGFueXRoaW5nIHdlIGZlZCBpbiB2aWEgYE9wdGlvbnMucGx1Z2luc2AuIFRoZSBob3N0IG92ZXJsYXlzXG5cdCAqIGNsaWVudC1zaWRlIGVuYWJsZW1lbnQgc2VwYXJhdGVseS5cblx0ICovXG5cdGFzeW5jIHNuYXBzaG90UmVzb2x2ZWRDdXN0b21pemF0aW9ucygpOiBQcm9taXNlPElTZGtSZXNvbHZlZEN1c3RvbWl6YXRpb25zPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLl9lbnN1cmVRdWVyeUJvdW5kKCk7XG5cdFx0Y29uc3QgW2NvbW1hbmRzLCBhZ2VudHMsIG1jcFNlcnZlcnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0cXVlcnkuc3VwcG9ydGVkQ29tbWFuZHMoKSxcblx0XHRcdHF1ZXJ5LnN1cHBvcnRlZEFnZW50cygpLFxuXHRcdFx0cXVlcnkubWNwU2VydmVyU3RhdHVzKCksXG5cdFx0XSk7XG5cdFx0cmV0dXJuIHsgY29tbWFuZHMsIGFnZW50cywgbWNwU2VydmVycywgcGx1Z2luczogdGhpcy5faW5pdFBsdWdpbnMgfTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0TWNwU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5fZW5zdXJlUXVlcnlCb3VuZCgpO1xuXHRcdHJldHVybiB0aGlzLl9hcHBseU1jcFNlcnZlckVuYWJsZW1lbnQocXVlcnksIHNlcnZlck5hbWUsIHRydWUpO1xuXHR9XG5cblx0YXN5bmMgc3RvcE1jcFNlcnZlcihzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVF1ZXJ5Qm91bmQoKTtcblx0XHRyZXR1cm4gdGhpcy5fYXBwbHlNY3BTZXJ2ZXJFbmFibGVtZW50KHF1ZXJ5LCBzZXJ2ZXJOYW1lLCBmYWxzZSk7XG5cdH1cblxuXHRhc3luYyByZWNvbmNpbGVNY3BTZXJ2ZXJFbmFibGVtZW50KGRlc2lyZWQ6IFJlYWRvbmx5TWFwPHN0cmluZywgYm9vbGVhbj4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVF1ZXJ5Qm91bmQoKTtcblx0XHRjb25zdCBvYnNlcnZlZCA9IG5ldyBNYXAoKGF3YWl0IHF1ZXJ5Lm1jcFNlcnZlclN0YXR1cygpKS5tYXAoc2VydmVyID0+IFtzZXJ2ZXIubmFtZSwgc2VydmVyLnN0YXR1cyAhPT0gJ2Rpc2FibGVkJ10pKTtcblx0XHRmb3IgKGNvbnN0IFtzZXJ2ZXJOYW1lLCBlbmFibGVkXSBvZiBkZXNpcmVkKSB7XG5cdFx0XHQvLyBgZGVzaXJlZGAgaXMgc2Vzc2lvbi1zY29wZWQgc3RhdGUsIHNvIGl0IGNhbiBuYW1lIHNlcnZlcnMgdGhpc1xuXHRcdFx0Ly8gcGFydGljdWxhciBjaGF0J3MgcXVlcnkgZG9lcyBub3QgaGF2ZSAoYW5vdGhlciBjaGF0IHRoYXQgaGFzIG5vdFxuXHRcdFx0Ly8gZmluaXNoZWQgY29ubmVjdGluZyBpdHMgc2VydmVycywgb3IgYSBjaGF0IGNyZWF0ZWQgYWZ0ZXIgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIHN0YXRlIHdhcyBwdWJsaXNoZWQpLiBUb2dnbGluZyBvbmUgb2YgdGhvc2UgYWx3YXlzIGZhaWxzXG5cdFx0XHQvLyB3aXRoIGBTZXJ2ZXIgbm90IGZvdW5kOiA8bmFtZT5gIGFuZCB3b3VsZCB0YWtlIHRoZSB0dXJuIGRvd24gd2l0aFxuXHRcdFx0Ly8gaXQsIHNvIG9ubHkgcmVjb25jaWxlIHNlcnZlcnMgdGhlIGxpdmUgcXVlcnkgYWN0dWFsbHkgcmVwb3J0cy5cblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBvYnNlcnZlZC5nZXQoc2VydmVyTmFtZSk7XG5cdFx0XHRpZiAoY3VycmVudCA9PT0gdW5kZWZpbmVkIHx8IGN1cnJlbnQgPT09IGVuYWJsZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2FwcGx5TWNwU2VydmVyRW5hYmxlbWVudChxdWVyeSwgc2VydmVyTmFtZSwgZW5hYmxlZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5TWNwU2VydmVyRW5hYmxlbWVudChxdWVyeTogUXVlcnksIHNlcnZlck5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghcXVlcnkudG9nZ2xlTWNwU2VydmVyIHx8IChlbmFibGVkICYmICFxdWVyeS5yZWNvbm5lY3RNY3BTZXJ2ZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHF1ZXJ5LnRvZ2dsZU1jcFNlcnZlcihzZXJ2ZXJOYW1lLCBlbmFibGVkKTtcblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0YXdhaXQgcXVlcnkucmVjb25uZWN0TWNwU2VydmVyIShzZXJ2ZXJOYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogQmluZCB0aGUgU0RLIFF1ZXJ5IGlmIG5lZWRlZCwgcmVjb3ZlcmluZyBhIGRlYWQgb25lIGZpcnN0LiBNaXJyb3JzIHRoZVxuXHQgKiBnYXRlIGluIHtAbGluayBzZW5kfTogaWYgdGhlIHBpcGVsaW5lIGlzIG1hcmtlZCBmb3IgcmViaW5kIChhZnRlciBhblxuXHQgKiBhYm9ydC9jcmFzaCB0aGUgYF9xdWVyeWAgaGFuZGxlIGlzIHJldGFpbmVkIGZvciB0ZWFyZG93biBidXQgaXRzIHN0cmVhbVxuXHQgKiBpcyBkZWFkKSwgcmVidWlsZCB2aWEgdGhlIHJlbWF0ZXJpYWxpemVyIHNvIHByZS1mbGlnaHQgaGVscGVycyBuZXZlclxuXHQgKiBvcGVyYXRlIG9uIGEgZGlzcG9zZWQgc3RyZWFtLiBUaGVuIGxhemlseSBiaW5kIGlmIG5vdGhpbmcgaXMgYm91bmQgeWV0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlUXVlcnlCb3VuZCgpOiBQcm9taXNlPFF1ZXJ5PiB7XG5cdFx0aWYgKHRoaXMuX25lZWRzUmViaW5kKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWJpbmRRdWVyeSgncmVjb3ZlcicpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3F1ZXJ5KSB7XG5cdFx0XHR0aGlzLl9iaW5kV2FybVF1ZXJ5KCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXBsYXlDdXJyZW50Q29uZmlnKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9xdWVyeSE7XG5cdH1cblxuXHQvKipcblx0ICogQmluZCBhIGZyZXNoIFNESyBzdHJlYW0gb2ZmIHRoZSBjdXJyZW50IHdhcm0gc3VicHJvY2Vzcy4gVGhlIHN0cmVhbSBpc1xuXHQgKiBsb25nLWxpdmVkOiBpdCBzcGFucyBldmVyeSB0dXJuIHVudGlsIGEgcmViaW5kIHN3YXBzIHRoZSBzdWJwcm9jZXNzICh0aGVcblx0ICogcHJvbXB0IGl0ZXJhYmxlIHBhcmtzIGJldHdlZW4gdHVybnMgcmF0aGVyIHRoYW4gZW5kaW5nKSwgc28ge0BsaW5rIF9xdWVyeX1cblx0ICogdHJhY2tzIHRoZSBsaWZldGltZSBvZiB7QGxpbmsgX3dhcm19IGFuZCBpcyBvbmx5IHN3YXBwZWQgaGVyZS5cblx0ICovXG5cdHByaXZhdGUgX2JpbmRXYXJtUXVlcnkoKTogUXVlcnkge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5fd2FybS5xdWVyeSh0aGlzLl9xdWV1ZS5pdGVyYWJsZSk7XG5cdFx0dGhpcy5fcXVlcnkgPSBxdWVyeTtcblx0XHRyZXR1cm4gcXVlcnk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIFNESyBzdHJlYW0gYm91bmQgdG8gdGhlIGN1cnJlbnQge0BsaW5rIF93YXJtfSBzdWJwcm9jZXNzLCBvclxuXHQgKiBgdW5kZWZpbmVkYCBiZWZvcmUgdGhlIGZpcnN0IGJpbmQuIEhlYWx0aCBpcyB0cmFja2VkIHNlcGFyYXRlbHkgYnlcblx0ICoge0BsaW5rIF9uZWVkc1JlYmluZH06IGEgbm9uLWB1bmRlZmluZWRgIGBfcXVlcnlgIHdpdGggYF9uZWVkc1JlYmluZGBcblx0ICogc2V0IGlzIGEgKmRlYWQqIHN0cmVhbSBhd2FpdGluZyByZWJ1aWxkLiBDbGVhcmVkIG9ubHkgb24gZGlzcG9zZS5cblx0ICovXG5cdHByaXZhdGUgX3F1ZXJ5OiBRdWVyeSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2FybTogV2FybVF1ZXJ5O1xuXHRwcml2YXRlIF9hYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWV1ZTogQ2xhdWRlUHJvbXB0UXVldWU7XG5cblx0LyoqIEZsaXBzIHRvIGB0cnVlYCBvbiB0aGUgZmlyc3QgYHN5c3RlbTppbml0YCBTREsgbWVzc2FnZS4gRHJpdmVzIGBPcHRpb25zLnJlc3VtZWAgZGVjaXNpb25zIGZvciBkb3duc3RyZWFtIHBoYXNlcy4gKi9cblx0cHJpdmF0ZSBfaXNSZXN1bWVkID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIE5hdGl2ZSBwbHVnaW5zIHJlcG9ydGVkIGJ5IHRoZSBtb3N0IHJlY2VudCBgc3lzdGVtOmluaXRgIG1lc3NhZ2UuXG5cdCAqIENhcHR1cmVkIG9uICpldmVyeSogaW5pdCAoaW5jbHVkaW5nIHJlc3VtZSkgc28gdGhlIHBvc3QtbWF0ZXJpYWxpemVcblx0ICogbmF0aXZlLXBsdWdpbiBmaWx0ZXIgYWx3YXlzIHJlZmxlY3RzIHRoZSBsaXZlIHNldC4gYHNvdXJjZWAgaXMgdGhlXG5cdCAqIHBsdWdpbiBpZCBhbmQgaXMgdGhlIHJlbGlhYmxlIG1hdGNoIGtleSAoc2VlIHtAbGluayBJU2RrUmVzb2x2ZWRDdXN0b21pemF0aW9uc30pLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5pdFBsdWdpbnM6IHJlYWRvbmx5IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBwYXRoOiBzdHJpbmc7IHJlYWRvbmx5IHNvdXJjZT86IHN0cmluZyB9W10gPSBbXTtcblxuXHQvKiogTGFzdCBtb2RlbCAvIGVmZm9ydCAvIHBlcm1pc3Npb24gbW9kZSBhcHBsaWVkIHRvIHRoZSBTREsgdmlhIHRoZSBydW50aW1lIHNldHRlcnMuIFJlc2V0IG9uIHJlYmluZC4gKi9cblx0cHJpdmF0ZSBfYXBwbGllZE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FwcGxpZWRFZmZvcnQ6IENsYXVkZVJ1bnRpbWVFZmZvcnRMZXZlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXBwbGllZFBlcm1pc3Npb25Nb2RlOiBQZXJtaXNzaW9uTW9kZSB8IHVuZGVmaW5lZDtcblxuXHQvKiogQ3VycmVudCB2YWx1ZXMgdGhlIGNvbnN1bWVyIGhhcyBhc2tlZCBmb3IuIFJlcGxheWVkIHRvIGEgZnJlc2ggUXVlcnkgb24gYmluZCAvIHJlYmluZC4gKi9cblx0cHJpdmF0ZSBfY3VycmVudE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRFZmZvcnQ6IENsYXVkZVJ1bnRpbWVFZmZvcnRMZXZlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudFBlcm1pc3Npb25Nb2RlOiBQZXJtaXNzaW9uTW9kZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9yZW1hdGVyaWFsaXplcjogSVJlbWF0ZXJpYWxpemVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBTZXQgd2hlbiB0aGUgY29uc3VtZXIgbG9vcCBlbmRzIGluIGVycm9yIChjYW5jZWxsYXRpb24gT1IgY3Jhc2gpLiBSZWFkIGJ5IHtAbGluayBzZW5kfSB0byB0cmlnZ2VyIHJlYmluZC4gKi9cblx0cHJpdmF0ZSBfbmVlZHNSZWJpbmQgPSBmYWxzZTtcblxuXHQvKiogVHJhY2tzIHdoZXRoZXIgdGhlIGNvbnN1bWVyIGxvb3AgaXMgY3VycmVudGx5IGRyYWluaW5nIHtAbGluayBfcXVlcnl9LiAqL1xuXHRwcml2YXRlIF9jb25zdW1lckxvb3BSdW5uaW5nID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcm9kdWNlU2lnbmFsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWdlbnRTaWduYWw+KCkpO1xuXHQvKipcblx0ICogU2luZ2xlIGZhbi1vdXQgZm9yIGV2ZXJ5IHtAbGluayBBZ2VudFNpZ25hbH0gdGhpcyBzZXNzaW9uIHByb2R1Y2VzOlxuXHQgKiAgIFx1MjAyMiBSb3V0ZXItbWFwcGVkIHBlci1tZXNzYWdlIHNpZ25hbHMgKHJlc3BvbnNlIHBhcnRzLCB0b29sIGNhbGxzLFxuXHQgKiAgICAgcGVuZGluZyBjb25maXJtYXRpb25zLCBldGMuKS5cblx0ICogICBcdTIwMjIgYENoYXRUdXJuQ29tcGxldGVgIGFjdGlvbiwgZmlyZWQgd2hlbiB0aGUgTEFTVCBlbnRyeSBpbiB0aGVcblx0ICogICAgIHF1ZXVlIGRyYWlucyB2aWEgYHJlc3VsdGAgKGludGVybWVkaWF0ZSByZXN1bHRzIGR1cmluZyBzdGVlcmluZ1xuXHQgKiAgICAgcHJlZW1wdCBkbyBOT1QgZmlyZSBcdTIwMTQgQ09OVEVYVC5tZCBNMTApLlxuXHQgKiAgIFx1MjAyMiBgc3RlZXJpbmdfY29uc3VtZWRgIHNpZ25hbCwgZmlyZWQgdGhlIG1vbWVudCB0aGUgaXRlcmFibGUgeWllbGRzXG5cdCAqICAgICBhIHN0ZWVyaW5nIGVudHJ5IHRvIHRoZSBTREsuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFByb2R1Y2VTaWduYWw6IEV2ZW50PEFnZW50U2lnbmFsPiA9IHRoaXMuX29uRGlkUHJvZHVjZVNpZ25hbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yb3V0ZXI6IENsYXVkZVNka01lc3NhZ2VSb3V0ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgY2hhdENoYW5uZWxVcmk6IFVSSSxcblx0XHRyZXNvdXJjZTogVVJJLFxuXHRcdHdhcm06IFdhcm1RdWVyeSxcblx0XHRhYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcixcblx0XHRkYlJlZjogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPixcblx0XHRzdWJhZ2VudHM6IFN1YmFnZW50UmVnaXN0cnksXG5cdFx0Y2xpZW50VG9vbE93bmVyOiAoKHRvb2xOYW1lOiBzdHJpbmcpID0+IHN0cmluZyB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl93YXJtID0gd2FybTtcblx0XHR0aGlzLl9hYm9ydENvbnRyb2xsZXIgPSBhYm9ydENvbnRyb2xsZXI7XG5cdFx0dGhpcy5fd2lyZUFib3J0SGFuZGxlcihhYm9ydENvbnRyb2xsZXIpO1xuXHRcdHRoaXMuX3F1ZXVlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDbGF1ZGVQcm9tcHRRdWV1ZSxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdCgpID0+IHRoaXMuX2Fib3J0Q29udHJvbGxlci5zaWduYWwsXG5cdFx0XHQocGVuZGluZ0lkOiBzdHJpbmcpID0+IHRoaXMuX29uRGlkUHJvZHVjZVNpZ25hbC5maXJlKHtcblx0XHRcdFx0a2luZDogJ3N0ZWVyaW5nX2NvbnN1bWVkJyxcblx0XHRcdFx0Y2hhdDogdGhpcy5jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0aWQ6IHBlbmRpbmdJZCxcblx0XHRcdH0pLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JvdXRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2xhdWRlU2RrTWVzc2FnZVJvdXRlciwgY2hhdENoYW5uZWxVcmksIHJlc291cmNlLCBkYlJlZiwgc3ViYWdlbnRzLCBjbGllbnRUb29sT3duZXIsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcm91dGVyLm9uRGlkUHJvZHVjZVNpZ25hbChzID0+IHRoaXMuX29uRGlkUHJvZHVjZVNpZ25hbC5maXJlKHMpKSk7XG5cdFx0Ly8gRGlzcG9zZSBjaGFpbiBcdTIxOTIgYWJvcnQgXHUyMTkyIFNESyBjbGVhbnVwLiBSZWFkcyB0aGUgKmN1cnJlbnQqXG5cdFx0Ly8gYF9hYm9ydENvbnRyb2xsZXJgIHNvIGEgc3dhcCBhYm9ydHMgdGhlIGxpdmUgc3VicHJvY2Vzcy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fYWJvcnRDb250cm9sbGVyLmFib3J0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dm9pZCBQcm9taXNlLnJlc29sdmUodGhpcy5fd2FybVtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpKS5jYXRjaCgoZXJyOiB1bmtub3duKSA9PlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZV0gV2FybVF1ZXJ5IGRpc3Bvc2UgZmFpbGVkOiAke2Vycn1gKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGlzUmVzdW1lZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzUmVzdW1lZDsgfVxuXG5cdGdldCBpc0Fib3J0ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQ7IH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIHR1cm4gaXMgY3VycmVudGx5IGluIGZsaWdodCBvciBxdWV1ZWQuIEZhbHNlIGJldHdlZW4gdHVybnMgKHRoZVxuXHQgKiB3YXJtIHF1ZXJ5IHBhcmtzIHdpdGggYSBkcmFpbmVkIHF1ZXVlKS4gVXNlZCBieSBub24tZGVzdHJ1Y3RpdmUgaWRsZVxuXHQgKiByZWxlYXNlIHRvIGF2b2lkIHRlYXJpbmcgdGhlIHBpcGVsaW5lIGRvd24gbWlkLXR1cm4uXG5cdCAqL1xuXHRnZXQgaGFzQWN0aXZlVHVybigpOiBib29sZWFuIHsgcmV0dXJuICF0aGlzLl9xdWV1ZS5pc0VtcHR5OyB9XG5cblx0LyoqXG5cdCAqIEFib3J0IHRoZSBsaXZlIFNESyBzdWJwcm9jZXNzIGFuZCAqKmF3YWl0IGl0cyBhY3R1YWwgZXhpdCoqLlxuXHQgKlxuXHQgKiBgV2FybVF1ZXJ5W1N5bWJvbC5hc3luY0Rpc3Bvc2VdKClgIGNhbGxzIHRoZSBxdWVyeSdzIGBjbG9zZSgpYCwgd2hpY2hcblx0ICogKmZpcmVzKiB0aGUgU0RLIGNsZWFudXAgYnV0IGRvZXMgbm90IGF3YWl0IGl0IFx1MjAxNCBzbyBpdCByZXR1cm5zIHdoaWxlIHRoZVxuXHQgKiBzdWJwcm9jZXNzIGlzIHN0aWxsIHNodXR0aW5nIGRvd24gKGFuZCBzdGlsbCByZS1mbHVzaGluZyBpdHMgdHJhbnNjcmlwdCkuXG5cdCAqIGBRdWVyeS5yZXR1cm4oKWAgYXdhaXRzIHRoZSBzYW1lIChtZW1vaXplZCkgY2xlYW51cCwgd2hpY2ggaW4gdHVybiBhd2FpdHNcblx0ICogYHRyYW5zcG9ydC53YWl0Rm9yRXhpdCgpYCBcdTIwMTQgdGhlIE9TIHByb2Nlc3MgYWN0dWFsbHkgZXhpdGluZyBhZnRlciBpdHNcblx0ICogZmluYWwgdHJhbnNjcmlwdCBmbHVzaC4gQXdhaXRpbmcgdGhhdCBpcyB3aGF0IGxldHMgYSBjYWxsZXIgc2FmZWx5IHJldXNlXG5cdCAqIHRoZSBgLS1zZXNzaW9uLWlkYCAodGhlIENMSSByZWplY3RzIGEgZnJlc2ggc3Bhd24gd2hpbGUgYDxpZD4uanNvbmxgXG5cdCAqIHN0aWxsIGV4aXN0cywgYW5kIHRoZSBkeWluZyBwcm9jZXNzIHdvdWxkIG90aGVyd2lzZSByZWNyZWF0ZSBpdCkuXG5cdCAqL1xuXHRhc3luYyBzaHV0ZG93bkFuZFdhaXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3dhcm1bU3ltYm9sLmFzeW5jRGlzcG9zZV0oKTtcblx0XHRcdGF3YWl0IHRoaXMuX3F1ZXJ5Py5yZXR1cm4odW5kZWZpbmVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZVNka1BpcGVsaW5lOiR7dGhpcy5zZXNzaW9uSWR9XSBzaHV0ZG93bkFuZFdhaXQ6IHRlYXJkb3duIGZhaWxlZGAsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBoYXNlIDEwIFxcdTIwMTQgbmFycm93IHB1YmxpYyB3cmFwcGVyIGFyb3VuZCB0aGUgaW50ZXJuYWxcblx0ICoge0BsaW5rIF9yZWJpbmRRdWVyeX0gc28ge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbi5yZWJpbmRGb3JDbGllbnRUb29sc31cblx0ICogY2FuIGRyaXZlIGEgeWllbGQtcmVzdGFydCB3aXRob3V0IGV4cG9zaW5nIHRoZSBwcml2YXRlIHJlYmluZFxuXHQgKiBtYWNoaW5lcnkgdG8gZXZlcnkgY29sbGFib3JhdG9yLlxuXHQgKi9cblx0cmViaW5kRm9yUmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmViaW5kUXVlcnkoJ3Jlc3RhcnQnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaGFzZSAxMCBcdTIwMTQgdXBkYXRlIHRoZSByZXNvbHZlciB0aGUgc3RyZWFtIG1hcHBlciB1c2VzIHRvIHN0YW1wIHRoZVxuXHQgKiBvd25pbmcgd29ya2JlbmNoIGBjbGllbnRJZGAgb250byBzdWJzZXF1ZW50IGBDaGF0VG9vbENhbGxTdGFydGAgZXZlbnRzLlxuXHQgKi9cblx0c2V0Q2xpZW50VG9vbE93bmVyKGNsaWVudFRvb2xPd25lcjogKCh0b29sTmFtZTogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQpIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcm91dGVyLnNldENsaWVudFRvb2xPd25lcihjbGllbnRUb29sT3duZXIpO1xuXHR9XG5cblx0LyoqIEF0dGFjaCB0aGUgcmVtYXRlcmlhbGl6ZXIgaG9vayBmb3IgYWJvcnQgLyBjcmFzaCByZWNvdmVyeS4gT3B0aW9uYWwgXHUyMDE0IHRlc3RzIHRoYXQgZXhlcmNpc2Ugb25seSB0aGUgZGlzcG9zZSBwYXRoIHNraXAgdGhpcy4gKi9cblx0YXR0YWNoUmVtYXRlcmlhbGl6ZXIocmVtYXRlcmlhbGl6ZXI6IElSZW1hdGVyaWFsaXplcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbWF0ZXJpYWxpemVyID0gcmVtYXRlcmlhbGl6ZXI7XG5cdH1cblxuXHQvKipcblx0ICogU2VlZCB0aGUgY3VycmVudCArIGFwcGxpZWQgY29uZmlnIGZyb20gbWF0ZXJpYWxpemUtdGltZSBgT3B0aW9uc2AuXG5cdCAqIFRoZSBTREsgYWxyZWFkeSBzdGFydHMgd2l0aCB0aGVzZSB2YWx1ZXMsIHNvIHdlIG1hcmsgdGhlbSBhcyBib3RoXG5cdCAqIFwiY3VycmVudFwiICh3aGF0IHRoZSBjb25zdW1lciB3YW50cykgYW5kIFwiYXBwbGllZFwiICh3aGF0IHRoZSBTREsgaGFzKVxuXHQgKiB0byBhdm9pZCBhIHJlZHVuZGFudCBgc2V0TW9kZWxgIC8gYGFwcGx5RmxhZ1NldHRpbmdzYCBvbiBmaXJzdCB1c2UuXG5cdCAqL1xuXHRzZWVkQ3VycmVudENvbmZpZyhtb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBlZmZvcnQ6IENsYXVkZVJ1bnRpbWVFZmZvcnRMZXZlbCB8IHVuZGVmaW5lZCwgcGVybWlzc2lvbk1vZGU6IFBlcm1pc3Npb25Nb2RlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fY3VycmVudEVmZm9ydCA9IGVmZm9ydDtcblx0XHR0aGlzLl9jdXJyZW50UGVybWlzc2lvbk1vZGUgPSBwZXJtaXNzaW9uTW9kZTtcblx0XHR0aGlzLl9hcHBsaWVkTW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9hcHBsaWVkRWZmb3J0ID0gZWZmb3J0O1xuXHRcdHRoaXMuX2FwcGxpZWRQZXJtaXNzaW9uTW9kZSA9IHBlcm1pc3Npb25Nb2RlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVhZ2VybHkgcHVzaCBhIG1vZGVsIGNoYW5nZSB0byB0aGUgU0RLLiBTYWZlIHRvIGNhbGwgbWlkLXR1cm46XG5cdCAqIGBRdWVyeS5zZXRNb2RlbGAgb25seSB0YWtlcyBlZmZlY3Qgb24gdGhlIE5FWFQgdXNlciByZXF1ZXN0LiBOby1vcFxuXHQgKiBpZiB0aGUgdmFsdWUgaXMgdW5jaGFuZ2VkLiBCdWZmZXJlZCBhcyBgX2N1cnJlbnRNb2RlbGAgdW50aWwgdGhlXG5cdCAqIFF1ZXJ5IGlzIGJvdW5kIChhbmQgcmVwbGF5ZWQgb24gcmViaW5kKS5cblx0ICovXG5cdGFzeW5jIHNldE1vZGVsKG1vZGVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9jdXJyZW50TW9kZWwgPSBtb2RlbDtcblx0XHRpZiAodGhpcy5fcXVlcnkgJiYgIXRoaXMuX25lZWRzUmViaW5kICYmIG1vZGVsICE9PSB0aGlzLl9hcHBsaWVkTW9kZWwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3F1ZXJ5LnNldE1vZGVsKG1vZGVsKTtcblx0XHRcdFx0dGhpcy5fYXBwbGllZE1vZGVsID0gbW9kZWw7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHNldE1vZGVsIGZhaWxlZDogJHtlcnJ9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEVhZ2VybHkgcHVzaCBhbiBlZmZvcnQtbGV2ZWwgY2hhbmdlIHRvIHRoZSBTREsgdmlhXG5cdCAqIGBhcHBseUZsYWdTZXR0aW5ncyh7IGVmZm9ydExldmVsIH0pYC4gU2FtZSBtaWQtdHVybiBzYWZldHkgYXNcblx0ICoge0BsaW5rIHNldE1vZGVsfS5cblx0ICpcblx0ICogYHVuZGVmaW5lZGAgbWVhbnMgXCJjbGVhciB0aGUgZWZmb3J0IHRoZSBTREsgaXMgY3VycmVudGx5IGFwcGx5aW5nXCIgXHUyMDE0XG5cdCAqIGlzc3VlZCBhcyBgYXBwbHlGbGFnU2V0dGluZ3MoeyBlZmZvcnRMZXZlbDogbnVsbCB9KWAgKHNkay5kLnRzOjIyNjM6XG5cdCAqIHBhc3NpbmcgYG51bGxgIGNsZWFycyBhIGtleSBmcm9tIHRoZSBmbGFnIGxheWVyKS4gVGhpcyBpcyB3aGF0IG1ha2VzIGFcblx0ICogc3dpdGNoIHRvIGEgbW9kZWwgdGhhdCBkb2VzIG5vdCBzdXBwb3J0IHJlYXNvbmluZyBlZmZvcnQgKGUuZy4gSGFpa3UpXG5cdCAqIGRyb3AgYSBgJ2hpZ2gnYCBsZWZ0IG92ZXIgZnJvbSBhIHByaW9yIGVmZm9ydC1jYXBhYmxlIG1vZGVsIGluc3RlYWQgb2Zcblx0ICogcmVwbGF5aW5nIGl0IG9udG8gYSBtb2RlbCB0aGUgQVBJIHdpbGwgNDAwIG9uLlxuXHQgKi9cblx0YXN5bmMgc2V0RWZmb3J0KGVmZm9ydDogQ2xhdWRlUnVudGltZUVmZm9ydExldmVsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fY3VycmVudEVmZm9ydCA9IGVmZm9ydDtcblx0XHRpZiAodGhpcy5fcXVlcnkgJiYgIXRoaXMuX25lZWRzUmViaW5kICYmIGVmZm9ydCAhPT0gdGhpcy5fYXBwbGllZEVmZm9ydCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcXVlcnkuYXBwbHlGbGFnU2V0dGluZ3MoeyBlZmZvcnRMZXZlbDogZWZmb3J0ID8/IG51bGwgfSk7XG5cdFx0XHRcdHRoaXMuX2FwcGxpZWRFZmZvcnQgPSBlZmZvcnQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHNldEVmZm9ydCBmYWlsZWQ6ICR7ZXJyfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBZHZhbmNlIHRoZSAqZGVzaXJlZCogbW9kZWwgLyBlZmZvcnQgZm9yIHRoZSBORVhUIHJlYmluZCBXSVRIT1VUIHB1c2hpbmdcblx0ICogdGhlbSB0byB0aGUgbGl2ZSBRdWVyeS5cblx0ICpcblx0ICogQSBjcm9zcy10cmFuc3BvcnQgcHJvdmlkZXIgc3dpdGNoIGlzIGFib3V0IHRvIGRpc2NhcmQgdGhlIHJ1bm5pbmdcblx0ICogc3VicHJvY2VzcyAoaXQgaXMgcGlubmVkIHRvIHRoZSBvbGQgdHJhbnNwb3J0IC8gY3JlZGVudGlhbCksIHNvXG5cdCAqIGhvdC1zd2FwcGluZyBpdCB2aWEge0BsaW5rIHNldE1vZGVsfSAvIHtAbGluayBzZXRFZmZvcnR9IGlzIHBvaW50bGVzcyBcdTIwMTRcblx0ICogYW5kIHdvdWxkIDQwMCBvbiBhIG1vZGVsIHRoZSBvbGQgdHJhbnNwb3J0IGRvZXMgbm90IHNlcnZlLiBCdXRcblx0ICoge0BsaW5rIF9jdXJyZW50TW9kZWx9IC8ge0BsaW5rIF9jdXJyZW50RWZmb3J0fSBtdXN0IHN0aWxsIG1vdmUgdG8gdGhlIG5ld1xuXHQgKiBzZWxlY3Rpb246IGFmdGVyIHRoZSByZWJ1aWxkLCB7QGxpbmsgX3JlYmluZFF1ZXJ5fSByZXNldHMgdGhlIGFwcGxpZWRcblx0ICogY2FjaGUgYW5kIHtAbGluayBfcmVwbGF5Q3VycmVudENvbmZpZ30gcmUtYXNzZXJ0cyBgX2N1cnJlbnRNb2RlbGAgb250byB0aGVcblx0ICogZnJlc2ggUXVlcnkuIFRoZSByZWJ1aWxkIHJlc3VtZXMgdGhlIHRyYW5zY3JpcHQsIHdoaWNoIHJlcGxheXMgdGhlXG5cdCAqIHByZS1zd2l0Y2ggYC9tb2RlbGA7IHdpdGhvdXQgYWR2YW5jaW5nIHRoZSBidWZmZXIgaGVyZSB0aGF0IHN0YWxlIHJlcGxheVxuXHQgKiB3b3VsZCB3aW4gYW5kIHRoZSByZWJ1aWx0IHN1YnByb2Nlc3Mgd291bGQgc2lsZW50bHkgcnVuIHRoZSBvbGQgbW9kZWwgb25cblx0ICogdGhlIG5ldyB0cmFuc3BvcnQgKFx1MjE5MiBgbW9kZWxfbm90X3N1cHBvcnRlZGApLlxuXHQgKi9cblx0YnVmZmVyQ29uZmlnRm9yUmViaW5kKG1vZGVsOiBzdHJpbmcsIGVmZm9ydDogQ2xhdWRlUnVudGltZUVmZm9ydExldmVsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fY3VycmVudEVmZm9ydCA9IGVmZm9ydDtcblx0fVxuXG5cdC8qKlxuXHQgKiBRdWV1ZSBhIHVzZXIgcHJvbXB0IGZvciB0aGUgU0RLLiBSZXNvbHZlcyB3aGVuIHRoZSBtYXRjaGluZ1xuXHQgKiBgcmVzdWx0YCBtZXNzYWdlIGFycml2ZXMuXG5cdCAqXG5cdCAqIElmIGEgcHJldmlvdXMgdHVybiBhYm9ydGVkIG9yIGNyYXNoZWQsIHRoaXMgdHJpZ2dlcnMgYSByZWJpbmQgdmlhXG5cdCAqIHRoZSBhdHRhY2hlZCByZW1hdGVyaWFsaXplciBiZWZvcmUgcXVldWVpbmcuXG5cdCAqL1xuXHRhc3luYyBzZW5kKHByb21wdDogU0RLVXNlck1lc3NhZ2UsIHR1cm5JZDogc3RyaW5nLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fbmVlZHNSZWJpbmQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlYmluZFF1ZXJ5KCdyZWNvdmVyJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3F1ZXJ5KSB7XG5cdFx0XHR0aGlzLl9iaW5kV2FybVF1ZXJ5KCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXBsYXlDdXJyZW50Q29uZmlnKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Vuc3VyZUNvbnN1bWVyTG9vcCgpO1xuXHRcdGNvbnN0IGVudHJ5OiBJUGVuZGluZ1Nka01lc3NhZ2UgPSB7XG5cdFx0XHRzZGtNZXNzYWdlOiBwcm9tcHQsXG5cdFx0XHRzZGtVdWlkOiB0eXBlb2YgcHJvbXB0LnV1aWQgPT09ICdzdHJpbmcnID8gcHJvbXB0LnV1aWQgOiB0dXJuSWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRjbGllbnRDb250ZXh0LFxuXHRcdFx0c3RvcFdhdGNoOiBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKSxcblx0XHRcdGRlZmVycmVkOiBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCksXG5cdFx0fTtcblx0XHRyZXR1cm4gdGhpcy5fcXVldWUucHVzaChlbnRyeSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVzaCBhIGBwcmlvcml0eTogJ25vdydgIHN0ZWVyaW5nIG1lc3NhZ2UgaW50byB0aGUgaXRlcmFibGUuIFRoZVxuXHQgKiBjYWxsZXIgcHJlLWJ1aWxkcyB0aGUge0BsaW5rIFNES1VzZXJNZXNzYWdlfSAodGhlIHBpcGVsaW5lIGlzIFNES1xuXHQgKiBtZXNzYWdpbmctc2hhcGVkLCBub3QgcHJvdG9jb2wtc2hhcGVkKS4gYHBlbmRpbmdNZXNzYWdlSWRgIGlzIHRoZVxuXHQgKiBwcm90b2NvbCBgUGVuZGluZ01lc3NhZ2UuaWRgIHRoYXQge0BsaW5rIG9uU3RlZXJpbmdDb25zdW1lZH0gd2lsbFxuXHQgKiBjYXJyeSB3aGVuIHRoZSBTREsgYWNjZXB0cyB0aGUgbWVzc2FnZS5cblx0ICpcblx0ICogTm8tb3AgaWYgdGhlIHBpcGVsaW5lIGlzIGFib3J0ZWQgb3Igbm8gaW4tZmxpZ2h0IC8gcXVldWVkIHJlcXVlc3Rcblx0ICogZXhpc3RzIHRvIGluaGVyaXQgYSBgdHVybklkYCBmcm9tIChDT05URVhULm1kIE0xMDogc3RlZXJpbmcgZm9sZHNcblx0ICogaW50byB0aGUgaW4tcHJvZ3Jlc3MgcHJvdG9jb2wgVHVybikuXG5cdCAqL1xuXHRpbmplY3RTdGVlcmluZyhwcm9tcHQ6IFNES1VzZXJNZXNzYWdlLCBwZW5kaW5nTWVzc2FnZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHt0aGlzLnNlc3Npb25JZH1dIGluamVjdFN0ZWVyaW5nOiBkcm9wcGVkIChjb250cm9sbGVyIGFib3J0ZWQpIGlkPSR7cGVuZGluZ01lc3NhZ2VJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5fcXVldWUucGVla1BhcmVudCgpO1xuXHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHt0aGlzLnNlc3Npb25JZH1dIGluamVjdFN0ZWVyaW5nOiBkcm9wcGVkIChubyBpbi1mbGlnaHQgdHVybikgaWQ9JHtwZW5kaW5nTWVzc2FnZUlkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZGtVdWlkID0gdHlwZW9mIHByb21wdC51dWlkID09PSAnc3RyaW5nJyA/IHByb21wdC51dWlkIDogcGVuZGluZ01lc3NhZ2VJZDtcblx0XHQvLyBTdGVlcmluZyBkZWZlcnJlZHMgYXJlbid0IG9ic2VydmVkIGJ5IGFueW9uZSAodGhlIGFnZW50J3Mgc2VuZFxuXHRcdC8vIHByb21pc2UgaXMgdGhlIG9yaWdpbmFsIGVudHJ5J3MgZGVmZXJyZWQpOyBhdHRhY2ggYSBuby1vcCBjYXRjaFxuXHRcdC8vIHNvIGEgYGZhaWxBbGxgIHJlamVjdGlvbiBvbiBhYm9ydC9jcmFzaCBkb2Vzbid0IHN1cmZhY2UgYXMgYW5cblx0XHQvLyB1bmhhbmRsZWQgcmVqZWN0aW9uLlxuXHRcdHRoaXMuX3F1ZXVlLnB1c2goe1xuXHRcdFx0c2RrTWVzc2FnZTogcHJvbXB0LFxuXHRcdFx0c2RrVXVpZCxcblx0XHRcdHR1cm5JZDogcGFyZW50LnR1cm5JZCxcblx0XHRcdGNsaWVudENvbnRleHQ6IHBhcmVudC5jbGllbnRDb250ZXh0LFxuXHRcdFx0c3RvcFdhdGNoOiBwYXJlbnQuc3RvcFdhdGNoLFxuXHRcdFx0ZGVmZXJyZWQ6IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKSxcblx0XHRcdHN0ZWVyaW5nUGVuZGluZ0lkOiBwZW5kaW5nTWVzc2FnZUlkLFxuXHRcdH0pLmNhdGNoKCgpID0+IHsgLyogZXhwZWN0ZWQgb24gYWJvcnQvY3Jhc2ggKi8gfSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlOiR7dGhpcy5zZXNzaW9uSWR9XSBpbmplY3RTdGVlcmluZzogZW5xdWV1ZWQgaWQ9JHtwZW5kaW5nTWVzc2FnZUlkfSBzZGtVdWlkPSR7c2RrVXVpZH1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgdGhlIGluLWZsaWdodCBTREsgdHVybiB2aWEgdGhlIGFib3J0IGNvbnRyb2xsZXIuIERyb3BzIGV2ZXJ5XG5cdCAqIHBlbmRpbmcgZW50cnkncyBkZWZlcnJlZCAocmVqZWN0ZWQgd2l0aCBgQ2FuY2VsbGF0aW9uRXJyb3JgKSxcblx0ICogbWFya3MgdGhlIHBpcGVsaW5lIGZvciByZWJpbmQgb24gbmV4dCB7QGxpbmsgc2VuZH0uIElkZW1wb3RlbnQuXG5cdCAqXG5cdCAqIFNhZmUgdG8gY2FsbCBkdXJpbmcgcmViaW5kOiB7QGxpbmsgX3JlYmluZFF1ZXJ5fSBzd2FwcyBpbiBhIGZyZXNoXG5cdCAqIHBsYWNlaG9sZGVyIHtAbGluayBBYm9ydENvbnRyb2xsZXJ9IGJlZm9yZSBhd2FpdGluZyB0aGVcblx0ICogcmVtYXRlcmlhbGl6ZXIsIHNvIGFuIGFib3J0IGlzc3VlZCBkdXJpbmcgcmVjb3ZlcnkgbGFuZHMgb24gdGhhdFxuXHQgKiBwbGFjZWhvbGRlciBhbmQgaXMgaG9ub3JlZCB3aGVuIHRoZSBmcmVzaGx5LWJ1aWx0IHBhaXIgYXJyaXZlc1xuXHQgKiAodGhlIHJlYmluZCBkaXNjYXJkcyB0aGUgbmV3IHBhaXIgYW5kIHN1cmZhY2VzIGEgY2FuY2VsbGF0aW9uKS5cblx0ICovXG5cdGFib3J0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0dGhpcy5fcXVldWUuZmFpbEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0Ly8gTWFyayB1bmhlYWx0aHkgYnV0IGtlZXAgdGhlIGBfcXVlcnlgIGhhbmRsZTogdGhlIG5leHQgYHNlbmRgIHJlYmluZHMsXG5cdFx0Ly8gYW5kIGBzaHV0ZG93bkFuZFdhaXRgIHN0aWxsIG5lZWRzIGl0IHRvIGF3YWl0IHRoZSBzdWJwcm9jZXNzIGV4aXQuXG5cdFx0dGhpcy5fbmVlZHNSZWJpbmQgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcndhcmRzIHRvIHtAbGluayBRdWVyeS5zZXRQZXJtaXNzaW9uTW9kZX0gb25jZSB0aGUgcXVlcnkgaXNcblx0ICogYm91bmQ7IHRoZSB2YWx1ZSBpcyBhbHNvIHJlbWVtYmVyZWQgc28gaXQncyByZS1hcHBsaWVkIGFmdGVyIGFcblx0ICogcmViaW5kLiBQZXJtaXNzaW9uIG1vZGUgaXMgd2hvbGUtc2Vzc2lvbiAobm90IHBlci1lbnRyeSkuXG5cdCAqL1xuXHRhc3luYyBzZXRQZXJtaXNzaW9uTW9kZShtb2RlOiBQZXJtaXNzaW9uTW9kZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTW9kZSA9IG1vZGU7XG5cdFx0aWYgKHRoaXMuX3F1ZXJ5ICYmICF0aGlzLl9uZWVkc1JlYmluZCAmJiBtb2RlICE9PSB0aGlzLl9hcHBsaWVkUGVybWlzc2lvbk1vZGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3F1ZXJ5LnNldFBlcm1pc3Npb25Nb2RlKG1vZGUpO1xuXHRcdFx0dGhpcy5fYXBwbGllZFBlcm1pc3Npb25Nb2RlID0gbW9kZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93aXJlQWJvcnRIYW5kbGVyKGNvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcik6IHZvaWQge1xuXHRcdGNvbnRyb2xsZXIuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fcXVldWUubm90aWZ5QWJvcnRlZCgpO1xuXHRcdH0sIHsgb25jZTogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUNvbnN1bWVyTG9vcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uc3VtZXJMb29wUnVubmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb25zdW1lckxvb3BSdW5uaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9ydW5Db25zdW1lckxvb3AoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSdW5zIG9uZSB7QGxpbmsgX3Byb2Nlc3NNZXNzYWdlc30gcGFzcyBvdmVyIHRoZSBsaXZlIHtAbGluayBfcXVlcnl9IGFuZCxcblx0ICogd2hlbiBpdCBlbmRzLCBkZWNpZGVzIHdoZXRoZXIgdG8gaGFuZCBvZmYgdG8gYSBmcmVzaCBwYXNzLlxuXHQgKlxuXHQgKiBBIHJlYmluZCAoe0BsaW5rIF9yZWJpbmRRdWVyeX0pIHN3YXBzIGluIGEgbmV3IGBfcXVlcnlgIHdoaWxlIHRoZSBsb29wIGlzXG5cdCAqIHN0aWxsIGRyYWluaW5nIHRoZSBPTEQgKG5vdy1kaXNwb3NlZCkgb25lOyB0aGF0IG9sZCBwYXNzIHRoZW4gZW5kcyB3aXRoXG5cdCAqIHRoZSBcInN0cmVhbSBlbmRlZCB3aXRob3V0IGEgcmVzdWx0XCIgZ3VhcmQuIEJlY2F1c2UgYF9jb25zdW1lckxvb3BSdW5uaW5nYFxuXHQgKiBzdGF5cyBgdHJ1ZWAgZm9yIHRoZSB3aG9sZSBoYW5kb2ZmLCB0aGUge0BsaW5rIHNlbmR9IHRoYXQgcXVldWVkIHRoZVxuXHQgKiBwb3N0LXJlYmluZCBwcm9tcHQgYWxyZWFkeSBzYXcge0BsaW5rIF9lbnN1cmVDb25zdW1lckxvb3B9IG5vLW9wIFx1MjAxNCBzbyBpZlxuXHQgKiB0aGlzIHBhc3MganVzdCBzdG9wcGVkLCBub3RoaW5nIHdvdWxkIGV2ZXIgcmVhZCB0aGUgbmV3IHF1ZXJ5IGFuZCBgc2VuZGBcblx0ICogd291bGQgaGFuZy4gRGV0ZWN0IHRoZSBzd2FwIChjdXJyZW50IGBfcXVlcnlgIGRpZmZlcnMgZnJvbSB0aGUgb25lIHRoaXNcblx0ICogcGFzcyBib3VuZCkgYW5kIHJlLWFybSBmb3IgaXQgaW5zdGVhZC4gQWJvcnQgLyBjcmFzaCAvIGRpc3Bvc2UgbGVhdmVcblx0ICogYF9xdWVyeWAgY2xlYXJlZCAob3IgdGhlIHN0b3JlIGRpc3Bvc2VkKSwgc28gdGhleSBmYWxsIHRocm91Z2ggdG8gc3RvcC5cblx0ICovXG5cdHByaXZhdGUgX3J1bkNvbnN1bWVyTG9vcCgpOiB2b2lkIHtcblx0XHRjb25zdCBib3VuZFF1ZXJ5ID0gdGhpcy5fcXVlcnk7XG5cdFx0dm9pZCB0aGlzLl9wcm9jZXNzTWVzc2FnZXMoKVxuXHRcdFx0LmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIF9wcm9jZXNzTWVzc2FnZXMgY3Jhc2hlZDogJHtlcnJ9YCkpXG5cdFx0XHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCAmJiB0aGlzLl9xdWVyeSAmJiB0aGlzLl9xdWVyeSAhPT0gYm91bmRRdWVyeSkge1xuXHRcdFx0XHRcdHRoaXMuX3J1bkNvbnN1bWVyTG9vcCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnN1bWVyTG9vcFJ1bm5pbmcgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVzaCB0aGUgY3VycmVudCBtb2RlbCAvIGVmZm9ydCAvIHBlcm1pc3Npb25Nb2RlIHRvIHRoZSBTREsgaWYgdGhleVxuXHQgKiBkaXZlcmdlIGZyb20gd2hhdCB3YXMgbGFzdCBhcHBsaWVkLiBDYWxsZWQgYWZ0ZXIgYmluZGluZyBhIGZyZXNoXG5cdCAqIFF1ZXJ5IChpbml0aWFsIGZpcnN0LXNlbmQgYW5kIGFmdGVyIHJlYmluZCkuIEZhaWx1cmVzIGFyZSBsb2dnZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXBsYXlDdXJyZW50Q29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudE1vZGVsICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fY3VycmVudE1vZGVsICE9PSB0aGlzLl9hcHBsaWVkTW9kZWwpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcXVlcnk/LnNldE1vZGVsKHRoaXMuX2N1cnJlbnRNb2RlbCk7XG5cdFx0XHRcdHRoaXMuX2FwcGxpZWRNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50RWZmb3J0ICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fY3VycmVudEVmZm9ydCAhPT0gdGhpcy5fYXBwbGllZEVmZm9ydCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9xdWVyeT8uYXBwbHlGbGFnU2V0dGluZ3MoeyBlZmZvcnRMZXZlbDogdGhpcy5fY3VycmVudEVmZm9ydCB9KTtcblx0XHRcdFx0dGhpcy5fYXBwbGllZEVmZm9ydCA9IHRoaXMuX2N1cnJlbnRFZmZvcnQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFBlcm1pc3Npb25Nb2RlICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fY3VycmVudFBlcm1pc3Npb25Nb2RlICE9PSB0aGlzLl9hcHBsaWVkUGVybWlzc2lvbk1vZGUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcXVlcnk/LnNldFBlcm1pc3Npb25Nb2RlKHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTW9kZSk7XG5cdFx0XHRcdHRoaXMuX2FwcGxpZWRQZXJtaXNzaW9uTW9kZSA9IHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTW9kZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZVNka1BpcGVsaW5lOiR7dGhpcy5zZXNzaW9uSWR9XSBfcmVwbGF5Q3VycmVudENvbmZpZyBmYWlsZWQ6ICR7ZXJyfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIHRoZSBkZWFkIFNESyBwbHVtYmluZyBhbmQgcmVidWlsZCB2aWEgdGhlIGFnZW50LXN1cHBsaWVkXG5cdCAqIHJlbWF0ZXJpYWxpemVyIGluIGByZXN1bWVgIG1vZGUuIFJlLWFwcGxpZXMgdGhlIGN1cnJlbnQgbW9kZWwgL1xuXHQgKiBlZmZvcnQgLyBwZXJtaXNzaW9uIG1vZGUgdG8gdGhlIGZyZXNoIFF1ZXJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmViaW5kUXVlcnkocmVhc29uOiAncmVzdGFydCcgfCAncmVjb3ZlcicpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbWF0ZXJpYWxpemVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENsYXVkZVNka1BpcGVsaW5lLnJlYmluZDogbm8gcmVtYXRlcmlhbGl6ZXIgYXR0YWNoZWQgKHJlYXNvbj0ke3JlYXNvbn0pYCk7XG5cdFx0fVxuXHRcdGNvbnN0IG9sZFdhcm0gPSB0aGlzLl93YXJtO1xuXHRcdC8vIEluc3RhbGwgYSBwbGFjZWhvbGRlciBjb250cm9sbGVyIEJFRk9SRSBhd2FpdGluZyB0aGVcblx0XHQvLyByZW1hdGVyaWFsaXplciBzbyBhIGNvbmN1cnJlbnQge0BsaW5rIGFib3J0fSBoYXMgYSBsaXZlIHRhcmdldFxuXHRcdC8vIGluc3RlYWQgb2YgcmV0dXJuaW5nIGVhcmx5IGFzIGlkZW1wb3RlbnQgYWdhaW5zdCB0aGUgYWxyZWFkeS1cblx0XHQvLyBhYm9ydGVkIG9sZCBjb250cm9sbGVyLlxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdHRoaXMuX2Fib3J0Q29udHJvbGxlciA9IHBsYWNlaG9sZGVyO1xuXHRcdGNvbnN0IGJ1aWx0ID0gYXdhaXQgdGhpcy5fcmVtYXRlcmlhbGl6ZXIocmVhc29uKTtcblx0XHQvLyBEaXNwb3NlIG1heSBoYXZlIHJ1biB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nIHRoZSByZW1hdGVyaWFsaXplci5cblx0XHQvLyBUaGUgZGlzcG9zZSBjaGFpbiBoYXMgYWxyZWFkeSB0b3JuIGRvd24gdGhlIE9MRCB3YXJtL2NvbnRyb2xsZXI7XG5cdFx0Ly8gdGhlIGZyZXNobHktYnVpbHQgcGFpciB3b3VsZCBvdGhlcndpc2UgbGVhayBpdHMgc3VicHJvY2Vzcy4gTWlycm9yXG5cdFx0Ly8gdGhlIHBvc3QtYXdhaXQgYWJvcnQgZ2F0ZSBpbiBgX21hdGVyaWFsaXplUHJvdmlzaW9uYWxgLlxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRidWlsdC5hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHRcdHZvaWQgUHJvbWlzZS5yZXNvbHZlKGJ1aWx0Lndhcm1bU3ltYm9sLmFzeW5jRGlzcG9zZV0oKSkuY2F0Y2goKGVycjogdW5rbm93bikgPT5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHJlYmluZC1hZnRlci1kaXNwb3NlOiB3YXJtIGRpc3Bvc2UgZmFpbGVkOiAke2Vycn1gKSk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0Ly8gQWJvcnQgaXNzdWVkIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmcgdGhlIHJlbWF0ZXJpYWxpemVyIGxhbmRlZCBvblxuXHRcdC8vIHRoZSBwbGFjZWhvbGRlci4gRGlzY2FyZCB0aGUgZnJlc2hseS1idWlsdCBwYWlyIGFuZCBzdXJmYWNlIGFcblx0XHQvLyBjYW5jZWxsYXRpb24gdG8gdGhlIGluLWZsaWdodCBgc2VuZGAuXG5cdFx0aWYgKHBsYWNlaG9sZGVyLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRidWlsdC5hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHRcdHZvaWQgUHJvbWlzZS5yZXNvbHZlKGJ1aWx0Lndhcm1bU3ltYm9sLmFzeW5jRGlzcG9zZV0oKSkuY2F0Y2goKGVycjogdW5rbm93bikgPT5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHJlYmluZC1hYm9ydGVkOiB3YXJtIGRpc3Bvc2UgZmFpbGVkOiAke2Vycn1gKSk7XG5cdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShvbGRXYXJtW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCkpLmNhdGNoKChlcnI6IHVua25vd24pID0+XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZVNka1BpcGVsaW5lOiR7dGhpcy5zZXNzaW9uSWR9XSBwcmV2aW91cyBXYXJtUXVlcnkgZGlzcG9zZSBmYWlsZWQgZHVyaW5nIGFib3J0ZWQgcmViaW5kOiAke2Vycn1gKSk7XG5cdFx0XHR0aGlzLl9xdWV1ZS5mYWlsQWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdHRoaXMuX25lZWRzUmViaW5kID0gdHJ1ZTtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShvbGRXYXJtW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCkpLmNhdGNoKChlcnI6IHVua25vd24pID0+XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZToke3RoaXMuc2Vzc2lvbklkfV0gcHJldmlvdXMgV2FybVF1ZXJ5IGRpc3Bvc2UgZmFpbGVkIGR1cmluZyByZWJpbmQ6ICR7ZXJyfWApKTtcblx0XHR0aGlzLl93YXJtID0gYnVpbHQud2FybTtcblx0XHR0aGlzLl9hYm9ydENvbnRyb2xsZXIgPSBidWlsdC5hYm9ydENvbnRyb2xsZXI7XG5cdFx0dGhpcy5fd2lyZUFib3J0SGFuZGxlcihidWlsdC5hYm9ydENvbnRyb2xsZXIpO1xuXHRcdHRoaXMuX3F1ZXVlLnJlc2V0Rm9yUmViaW5kKCk7XG5cdFx0dGhpcy5fbmVlZHNSZWJpbmQgPSBmYWxzZTtcblx0XHQvLyBOZXcgU0RLIHN0YXJ0cyB3aXRoIHRoZSBtYXRlcmlhbGl6ZXIncyBgT3B0aW9ucy5tb2RlbGAgLyBlZmZvcnQgL1xuXHRcdC8vIHBlcm1pc3Npb25Nb2RlIGJ1dCB3ZSBkb24ndCB0cnVzdCB0aGF0IHRvIG1hdGNoIGBfY3VycmVudE1vZGVsYFxuXHRcdC8vIGV0Yy4gXHUyMDE0IHJlc2V0IHRoZSBhcHBsaWVkIGNhY2hlIGFuZCBsZXQgYF9yZXBsYXlDdXJyZW50Q29uZmlnYFxuXHRcdC8vIHB1c2ggd2hhdGV2ZXIgdGhlIGNvbnN1bWVyIGxhc3Qgc2V0LlxuXHRcdHRoaXMuX2FwcGxpZWRNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hcHBsaWVkRWZmb3J0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FwcGxpZWRQZXJtaXNzaW9uTW9kZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9iaW5kV2FybVF1ZXJ5KCk7XG5cdFx0YXdhaXQgdGhpcy5fcmVwbGF5Q3VycmVudENvbmZpZygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN1bWVyIGxvb3AuIERyYWlucyB0aGUgU0RLIGl0ZXJhdG9yLCBkaXNwYXRjaGVzIGVhY2ggbWVzc2FnZVxuXHQgKiB0byB0aGUge0BsaW5rIENsYXVkZVNka01lc3NhZ2VSb3V0ZXJ9IChhd2FpdGVkIHNvIGFzeW5jIGZpbGUtZWRpdFxuXHQgKiBvYnNlcnZhdGlvbiBjb21wbGV0ZXMgYmVmb3JlIHRoZSBuZXh0IG1lc3NhZ2UpLCBzZXR0bGVzIHRoZSBoZWFkXG5cdCAqIGVudHJ5J3MgZGVmZXJyZWQgb24gYHJlc3VsdGAsIGFuZCBmaXJlcyBgQ2hhdFR1cm5Db21wbGV0ZWAgb25seVxuXHQgKiB3aGVuIHRoZSBxdWV1ZSBmdWxseSBkcmFpbnMuXG5cdCAqXG5cdCAqIE9uIGFueSB1bmNhdWdodCBlcnJvciAoY2FuY2VsbGF0aW9uLCB0cmFuc3BvcnQgZmFpbHVyZSwgb3IgdGhlXG5cdCAqIHBvc3QtbG9vcCBcInN0cmVhbSBlbmRlZCB3aXRob3V0IHJlc3VsdFwiIGd1YXJkKSB0aGUgY2F0Y2ggYmxvY2tcblx0ICogcmVqZWN0cyBldmVyeSBwZW5kaW5nIGVudHJ5J3MgZGVmZXJyZWQgd2l0aCB0aGUgc2FtZSBlcnJvciBhbmRcblx0ICogbWFya3MgYF9uZWVkc1JlYmluZD10cnVlYC4gQ2FuY2VsbGF0aW9uIGlzIHN3YWxsb3dlZCAoZG9uJ3Rcblx0ICogcmV0aHJvdyk7IG90aGVyIGVycm9ycyBwcm9wYWdhdGUgdG8gdGhlIHZvaWQgY2FsbGVyJ3MgYC5jYXRjaGAgZm9yXG5cdCAqIGxvZ2dpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9wcm9jZXNzTWVzc2FnZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSB0aGlzLl9xdWVyeTtcblx0XHRpZiAoIXF1ZXJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NsYXVkZVNka1BpcGVsaW5lLl9wcm9jZXNzTWVzc2FnZXMgY2FsbGVkIGJlZm9yZSBxdWVyeSB3YXMgYm91bmQnKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgbWVzc2FnZSBvZiBxdWVyeSkge1xuXHRcdFx0XHRpZiAodGhpcy5fYWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1lc3NhZ2UudHlwZSA9PT0gJ3N5c3RlbScgJiYgbWVzc2FnZS5zdWJ0eXBlID09PSAnaW5pdCcpIHtcblx0XHRcdFx0XHQvLyBDYXB0dXJlIHRoZSBsb2FkZWQgbmF0aXZlLXBsdWdpbiBsaXN0IG9uIGV2ZXJ5IGluaXQgKGluY2wuXG5cdFx0XHRcdFx0Ly8gcmVzdW1lIC8gcG9zdC1yZWJpbmQpIHNvIHRoZSBwb3N0LW1hdGVyaWFsaXplIGZpbHRlciBpcyBmcmVzaC5cblx0XHRcdFx0XHR0aGlzLl9pbml0UGx1Z2lucyA9IG1lc3NhZ2UucGx1Z2lucyA/PyBbXTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2lzUmVzdW1lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5faXNSZXN1bWVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5fcXVldWUucGVla1BhcmVudCgpO1xuXHRcdFx0XHRjb25zdCB0dXJuSWQgPSBwYXJlbnQ/LnR1cm5JZDtcblx0XHRcdFx0Y29uc3QgY2xpZW50Q29udGV4dCA9IHBhcmVudD8uY2xpZW50Q29udGV4dDtcblx0XHRcdFx0Y29uc3QgdHVybkR1cmF0aW9uID0gcGFyZW50Py5zdG9wV2F0Y2guZWxhcHNlZCgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3JvdXRlci5oYW5kbGUobWVzc2FnZSwgdHVybklkLCB7XG5cdFx0XHRcdFx0XHR0dXJuRHVyYXRpb24sXG5cdFx0XHRcdFx0XHRtb2RlOiB0aGlzLl9jdXJyZW50UGVybWlzc2lvbk1vZGUsXG5cdFx0XHRcdFx0XHRjbGllbnRDb250ZXh0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGNhdGNoIChoYW5kbGVyRXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHJvdXRlciB0aHJldywgc2tpcHBpbmc6ICR7aGFuZGxlckVycn1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWVzc2FnZS50eXBlID09PSAncmVzdWx0Jykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRlZCA9IHRoaXMuX3F1ZXVlLnNldHRsZUhlYWQoKTtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGU6JHt0aGlzLnNlc3Npb25JZH1dIHJlc3VsdCBmb3Igc2RrVXVpZD0ke2NvbXBsZXRlZD8uc2RrVXVpZH1gKTtcblx0XHRcdFx0XHQvLyBGaW5hbCByZXN1bHQ6IHF1ZXVlIGZ1bGx5IGRyYWluZWQgXHUyMTkyIHByb3RvY29sIHR1cm4gZG9uZS5cblx0XHRcdFx0XHQvLyBJbnRlcm1lZGlhdGUgcmVzdWx0IChzdGlsbCBwZW5kaW5nIGVudHJpZXMgZnJvbSBhXG5cdFx0XHRcdFx0Ly8gc3RlZXJpbmcgcHJlZW1wdCkgZG9lcyBOT1QgZmlyZSBDaGF0VHVybkNvbXBsZXRlLlxuXHRcdFx0XHRcdGlmIChjb21wbGV0ZWQgJiYgdGhpcy5fcXVldWUuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRQcm9kdWNlU2lnbmFsLmZpcmUoe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGNvbXBsZXRlZC50dXJuSWQsXG5cdFx0XHRcdFx0XHRcdFx0ZHVyYXRpb246IE1hdGgubWF4KDAsIGNvbXBsZXRlZC5zdG9wV2F0Y2guZWxhcHNlZCgpKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2Fib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdC8vIEEgcmViaW5kICh7QGxpbmsgX3JlYmluZFF1ZXJ5fSkgc3dhcHMgaW4gYSBmcmVzaCBgX3F1ZXJ5YCBhbmRcblx0XHRcdC8vIGRpc3Bvc2VzIHRoZSBvbGQgb25lLCBlbmRpbmcgVEhJUyBwYXNzJ3Mgc3RyZWFtIGNsZWFubHkuIFRoYXQgaXNcblx0XHRcdC8vIGV4cGVjdGVkIFx1MjAxNCByZXR1cm4gcXVpZXRseSBhbmQgbGV0IHtAbGluayBfcnVuQ29uc3VtZXJMb29wfSBoYW5kXG5cdFx0XHQvLyBvZmYgdG8gdGhlIG5ldyBxdWVyeS4gT25seSBhbiB1bmV4cGVjdGVkIGVuZCBvZiB0aGUgKmN1cnJlbnQqXG5cdFx0XHQvLyBxdWVyeSAobm8gc3dhcCkgaXMgdGhlIHJlYWwgXCJzdHJlYW0gZW5kZWQgd2l0aG91dCBhIHJlc3VsdFwiXG5cdFx0XHQvLyBmYWlsdXJlIHRoYXQgc2hvdWxkIG1hcmsgdGhlIHBpcGVsaW5lIGZvciByZWNvdmVyeS5cblx0XHRcdGlmICh0aGlzLl9xdWVyeSAhPT0gcXVlcnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDbGF1ZGUgU0RLIHN0cmVhbSBlbmRlZCB3aXRob3V0IGEgcmVzdWx0IG1lc3NhZ2UnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IGZhdGFsID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiBuZXcgRXJyb3IoU3RyaW5nKGVycikpO1xuXHRcdFx0Ly8gT25seSB0aGUgbG9vcCB0aGF0IHN0aWxsIG93bnMgdGhlIGxpdmUgcXVlcnkgcmVhY3RzOiBhIGxhdGVyXG5cdFx0XHQvLyB1bndpbmRpbmcgcGFzcyB3aG9zZSBxdWVyeSB3YXMgYWxyZWFkeSBzd2FwcGVkIGJ5IGEgcmViaW5kIG11c3Rcblx0XHRcdC8vIG5vdCBjbG9iYmVyIHRoZSBmcmVzaCBvbmUuIE1hcmsgdW5oZWFsdGh5IChrZWVwIHRoZSBoYW5kbGUgZm9yXG5cdFx0XHQvLyB0ZWFyZG93bik7IHRoZSBuZXh0IGBzZW5kYCByZWJpbmRzLlxuXHRcdFx0aWYgKHRoaXMuX3F1ZXJ5ID09PSBxdWVyeSkge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZS5mYWlsQWxsKGZhdGFsKTtcblx0XHRcdFx0dGhpcy5fbmVlZHNSZWJpbmQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGZhdGFsKSkge1xuXHRcdFx0XHR0aHJvdyBmYXRhbDtcblx0XHRc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
