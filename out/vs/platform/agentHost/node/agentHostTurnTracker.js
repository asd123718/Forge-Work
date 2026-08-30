import { disposableTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { createUnknownAgentHostClientTelemetryContext } from "../common/agentHostTelemetry.js";
import { AgentHostClientType } from "../common/agentHostClientInfo.js";
import { canRefineContributor, toolSourceKindFromContributor } from "./agentHostToolCallTracker.js";
import { SessionInputRequestKind } from "../common/state/protocol/state.js";
const TURN_HANG_THRESHOLD_MS = 5 * 60 * 1e3;
const MAX_HANG_CHECK_WINDOWS = 6;
const TURN_ACTIVITY_NONE = "none";
class AgentHostTurnTracker extends Disposable {
  constructor(_reporter) {
    super();
    this._reporter = _reporter;
    this._turnTimings = /* @__PURE__ */ new Map();
    this._hangWatchdogs = this._register(new DisposableMap());
    /** Maps `session:requestId` to the turn key blocked on that request. */
    this._blockerTurnKeys = /* @__PURE__ */ new Map();
    /**
     * Fires with the provider id whenever a turn starts, i.e. whenever the host
     * is about to make an LLM request on that provider's behalf.
     *
     * Consumed by {@link AgentModelRefreshScheduler} to gate its periodic model
     * refresh on real usage, so an idle host issues no `models` network
     * requests at all. Local host commands (`/rename`, `!command`) are
     * intercepted before `turnStarted` is reached and so correctly do not count
     * as activity.
     */
    this._onDidStartTurn = this._register(new Emitter());
    this.onDidStartTurn = this._onDidStartTurn.event;
    this._register(toDisposable(() => {
      this._turnTimings.clear();
      this._blockerTurnKeys.clear();
    }));
  }
  turnStarted(provider, session, turnId, model, modelTelemetryKind, permissionLevel, interactionMode, clientContext = createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown)) {
    const key = this._key(session, turnId);
    this._turnTimings.set(key, {
      stopWatch: StopWatch.create(false),
      provider,
      session,
      turnId,
      model,
      modelTelemetryKind,
      modelSelectionKind: model === void 0 ? "default" : model === "auto" ? "auto" : "explicit",
      permissionLevel,
      interactionMode,
      clientContext,
      firstProgressMs: void 0,
      quietStopWatch: StopWatch.create(false),
      lastActivityKind: TURN_ACTIVITY_NONE,
      inFlightToolCalls: /* @__PURE__ */ new Map(),
      blockers: /* @__PURE__ */ new Map(),
      reportedHangReasons: /* @__PURE__ */ new Set(),
      hangReportCount: 0,
      lastHangReason: void 0,
      lastHangStopWatch: void 0,
      quietWindows: 0
    });
    this._armHangWatchdog(key);
    this._onDidStartTurn.fire(provider);
  }
  markFirstProgress(session, turnId) {
    const timing = this._turnTimings.get(this._key(session, turnId));
    if (timing && timing.firstProgressMs === void 0) {
      timing.firstProgressMs = timing.stopWatch.elapsed();
    }
  }
  /**
   * Records observed activity for a turn. `activityKind` is the protocol
   * action type that produced it, which is emitted verbatim in the hang event
   * so a hang can be attributed to what the turn was last doing.
   *
   * Every call debounces the hang watchdog, so a turn that keeps producing
   * signals of any kind is never reported as hung. This is deliberately
   * broader than {@link markFirstProgress}, which only counts *visible*
   * progress for the time-to-first-progress metric.
   */
  markActivity(session, turnId, activityKind) {
    const key = this._key(session, turnId);
    const timing = this._turnTimings.get(key);
    if (!timing) {
      return;
    }
    timing.lastActivityKind = activityKind;
    this._touch(key, timing);
  }
  /** Resets the quiet period and re-arms the watchdog for a live turn. */
  _touch(key, timing) {
    timing.quietStopWatch = StopWatch.create(true);
    timing.quietWindows = 0;
    this._armHangWatchdog(key);
  }
  /**
   * Records that a tool call is in flight for the turn. An in-flight tool
   * call explains an otherwise quiet turn (a long build, or a subagent whose
   * progress is reported on its own chat channel), so the hang is reported
   * with the `runningTool` reason rather than as an unexplained stall.
   *
   * The tool's identity is retained so a hang report can name what the turn
   * is stuck on. This matters most for agent-host-provided tools: those never
   * enter the session input queue, so `agentHost.toolCallStalled` — which
   * only fires for blocked tool calls — cannot see them at all.
   */
  toolCallStarted(session, turnId, toolCallId, toolName, contributor) {
    this._turnTimings.get(this._key(session, turnId))?.inFlightToolCalls.set(toolCallId, {
      toolId: toolName,
      contributor,
      toolSourceKind: toolSourceKindFromContributor(contributor)
    });
  }
  /**
   * Refines an in-flight tool call's contributor once complete metadata is
   * available. Mirrors {@link AgentHostToolCallTracker.toolCallMetadataUpdated}
   * so `toolSourceKind` agrees between the two telemetry events for the same
   * tool call.
   */
  toolCallMetadataUpdated(session, turnId, toolCallId, contributor) {
    const inFlight = this._turnTimings.get(this._key(session, turnId))?.inFlightToolCalls.get(toolCallId);
    if (inFlight && contributor && canRefineContributor(inFlight.contributor, contributor)) {
      inFlight.contributor = contributor;
      inFlight.toolSourceKind = toolSourceKindFromContributor(contributor);
    }
  }
  toolCallEnded(session, turnId, toolCallId) {
    this._turnTimings.get(this._key(session, turnId))?.inFlightToolCalls.delete(toolCallId);
  }
  /**
   * Records that a session input request is outstanding for the turn.
   *
   * Only requests that block on a *human* make the turn `waitingOnUser`.
   * {@link SessionInputRequestKind.ToolClientExecution} is delegated running
   * work, not a prompt: the call has already cleared its confirmation gate
   * and is simply executing on a client. Counting it would report every
   * long-running client tool as waiting on the user. This mirrors the
   * `awaitsUser` predicate the protocol reducer uses for session status
   * (`channels-session/reducer.ts`), which cannot be imported here because
   * that file is generated. Client execution is still represented — the
   * in-flight tool set covers it and yields `runningTool`.
   *
   * Every outstanding request is recorded regardless, so unblocking can find
   * its turn and teardown can clean up its bookkeeping.
   */
  turnBlocked(session, turnId, requestId, kind, toolCallId) {
    const turnKey = this._key(session, turnId);
    const timing = this._turnTimings.get(turnKey);
    if (!timing) {
      return;
    }
    timing.blockers.set(requestId, { kind, toolCallId });
    this._blockerTurnKeys.set(this._key(session, requestId), turnKey);
    this._touch(turnKey, timing);
  }
  turnUnblocked(session, requestId) {
    const blockerKey = this._key(session, requestId);
    const turnKey = this._blockerTurnKeys.get(blockerKey);
    if (turnKey === void 0) {
      return;
    }
    this._blockerTurnKeys.delete(blockerKey);
    const timing = this._turnTimings.get(turnKey);
    if (!timing) {
      return;
    }
    timing.blockers.delete(requestId);
    this._touch(turnKey, timing);
  }
  updateModel(session, turnId, model, modelTelemetryKind) {
    const timing = this._turnTimings.get(this._key(session, turnId));
    if (timing) {
      timing.model = model;
      timing.modelTelemetryKind = modelTelemetryKind;
    }
  }
  getModelTelemetryContext(session, turnId) {
    const timing = this._turnTimings.get(this._key(session, turnId));
    return timing ? { model: timing.model, modelTelemetryKind: timing.modelTelemetryKind } : void 0;
  }
  getClientTelemetryContext(session, turnId) {
    return this._turnTimings.get(this._key(session, turnId))?.clientContext;
  }
  turnCompleted(session, turnId, result, failure, workspace) {
    const key = this._key(session, turnId);
    const timing = this._turnTimings.get(key);
    if (!timing) {
      return;
    }
    this._disposeTurn(key, timing);
    this._reporter.turnCompleted({
      clientContext: timing.clientContext,
      provider: timing.provider,
      session: timing.session,
      turnId,
      timeToFirstProgress: timing.firstProgressMs,
      totalTime: timing.stopWatch.elapsed(),
      result,
      model: timing.model,
      modelTelemetryKind: timing.modelTelemetryKind,
      modelSelectionKind: timing.modelSelectionKind,
      permissionLevel: timing.permissionLevel,
      interactionMode: timing.interactionMode,
      failure,
      isMultiRoot: workspace?.isMultiRoot ?? false,
      folderCount: workspace?.folderCount ?? 0
    });
    if (timing.lastHangReason !== void 0) {
      this._reporter.hungTurnCompleted({
        clientContext: timing.clientContext,
        provider: timing.provider,
        session: timing.session,
        turnId,
        hangReason: timing.lastHangReason,
        result,
        hangReportCount: timing.hangReportCount,
        totalTimeMs: timing.stopWatch.elapsed(),
        timeAfterHangMs: timing.lastHangStopWatch?.elapsed() ?? 0
      });
    }
  }
  /**
   * Drops any in-flight (never-completed) turns for a session without
   * reporting them. Called on session teardown so neither the timing map nor
   * the watchdog timers can outlive the session they describe.
   */
  clearSession(session) {
    const prefix = `${session}\0`;
    for (const [key, timing] of this._turnTimings) {
      if (key.startsWith(prefix)) {
        this._disposeTurn(key, timing);
      }
    }
    for (const key of this._blockerTurnKeys.keys()) {
      if (key.startsWith(prefix)) {
        this._blockerTurnKeys.delete(key);
      }
    }
  }
  /**
   * Drops tracked turns for a channel that are not in `keepTurnIds`, without
   * reporting them. Used after a chat is truncated: the turns are gone from
   * state and will never complete, so their watchdogs must not survive to
   * report a hang for a turn that no longer exists.
   */
  clearTurnsExcept(session, keepTurnIds) {
    const prefix = `${session}\0`;
    for (const [key, timing] of this._turnTimings) {
      if (key.startsWith(prefix) && !keepTurnIds.has(timing.turnId)) {
        this._disposeTurn(key, timing);
      }
    }
  }
  _disposeTurn(key, timing) {
    this._turnTimings.delete(key);
    this._hangWatchdogs.deleteAndDispose(key);
    for (const requestId of timing.blockers.keys()) {
      this._blockerTurnKeys.delete(this._key(timing.session, requestId));
    }
  }
  _armHangWatchdog(key) {
    this._hangWatchdogs.set(key, disposableTimeout(() => this._onHangWatchdogFired(key), TURN_HANG_THRESHOLD_MS));
  }
  _onHangWatchdogFired(key) {
    const timing = this._turnTimings.get(key);
    if (!timing) {
      return;
    }
    timing.quietWindows++;
    const hangReason = this._deriveHangReason(timing);
    if (!timing.reportedHangReasons.has(hangReason)) {
      timing.reportedHangReasons.add(hangReason);
      timing.hangReportCount++;
      timing.lastHangReason = hangReason;
      timing.lastHangStopWatch = StopWatch.create(true);
      const userBlocker = this._firstUserBlocker(timing);
      const stuckTool = this._resolveStuckTool(timing, hangReason);
      this._reporter.turnHung({
        clientContext: timing.clientContext,
        provider: timing.provider,
        session: timing.session,
        turnId: timing.turnId,
        hangReason,
        hadAnyProgress: timing.lastActivityKind !== TURN_ACTIVITY_NONE,
        lastActivityKind: timing.lastActivityKind,
        blockedOn: userBlocker?.kind,
        toolId: stuckTool?.toolId,
        toolSourceKind: stuckTool?.toolSourceKind,
        inFlightToolCallCount: timing.inFlightToolCalls.size,
        quietTimeMs: timing.quietStopWatch.elapsed(),
        turnElapsedMs: timing.stopWatch.elapsed(),
        model: timing.model,
        modelTelemetryKind: timing.modelTelemetryKind,
        modelSelectionKind: timing.modelSelectionKind,
        permissionLevel: timing.permissionLevel
      });
    }
    if (timing.quietWindows < MAX_HANG_CHECK_WINDOWS) {
      this._armHangWatchdog(key);
    }
  }
  /**
   * The first outstanding request that blocks on the user, or `undefined`
   * when none does. See {@link turnBlocked} for why client tool execution is
   * not a user blocker.
   */
  _firstUserBlocker(timing) {
    for (const blocker of timing.blockers.values()) {
      if (blocker.kind !== SessionInputRequestKind.ToolClientExecution) {
        return blocker;
      }
    }
    return void 0;
  }
  /**
   * Identifies the tool the turn appears to be stuck on, so a hang report can
   * name it rather than only counting it.
   *
   * For `waitingOnUser` this is the tool call gated by the blocking request.
   * A result-confirmation prompt resolves to `undefined`, because the tool
   * already completed and left the in-flight set — the turn is waiting on the
   * user reviewing a result, not on a tool. An elicitation has no tool at all.
   *
   * For `runningTool` this is the longest-running in-flight call. With
   * several tools running in parallel there is no way to tell which one is
   * wedged, so this is a heuristic; `inFlightToolCallCount` travels alongside
   * it, and filtering to `inFlightToolCallCount == 1` gives unambiguous
   * attribution.
   */
  _resolveStuckTool(timing, hangReason) {
    if (hangReason === "waitingOnUser") {
      const toolCallId = this._firstUserBlocker(timing)?.toolCallId;
      return toolCallId === void 0 ? void 0 : timing.inFlightToolCalls.get(toolCallId);
    }
    if (hangReason === "runningTool") {
      return timing.inFlightToolCalls.values().next().value;
    }
    return void 0;
  }
  _deriveHangReason(timing) {
    if (this._firstUserBlocker(timing) !== void 0) {
      return "waitingOnUser";
    }
    if (timing.inFlightToolCalls.size > 0) {
      return "runningTool";
    }
    return timing.lastActivityKind === TURN_ACTIVITY_NONE ? "noProgress" : "stalledAfterProgress";
  }
  _key(session, turnId) {
    return `${session}\0${turnId}`;
  }
}
export {
  AgentHostTurnTracker,
  TURN_ACTIVITY_NONE,
  TURN_HANG_THRESHOLD_MS
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RUdXJuVHJhY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbk1vZGUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IGNyZWF0ZVVua25vd25BZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0LCB0eXBlIElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgY2FuUmVmaW5lQ29udHJpYnV0b3IsIHRvb2xTb3VyY2VLaW5kRnJvbUNvbnRyaWJ1dG9yIH0gZnJvbSAnLi9hZ2VudEhvc3RUb29sQ2FsbFRyYWNrZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBUb29sQ2FsbENvbnRyaWJ1dG9yIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SG9zdE1vZGVsVGVsZW1ldHJ5S2luZCwgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIsIEFnZW50SG9zdFR1cm5IYW5nUmVhc29uLCBBZ2VudEhvc3RUdXJuUmVzdWx0LCBJQWdlbnRIb3N0VHVybkZhaWx1cmUgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcblxuLyoqXG4gKiBIb3cgbG9uZyBhIHR1cm4gbXVzdCBnbyB3aXRob3V0IGFueSBvYnNlcnZlZCBhY3Rpdml0eSBiZWZvcmUgdGhlIHdhdGNoZG9nXG4gKiByZXBvcnRzIGl0LiBNYXRjaGVzIHtAbGluayBUT09MX0NBTExfU1RBTExfVEhSRVNIT0xEX01TfSBpblxuICogYGFnZW50SG9zdFRvb2xDYWxsVHJhY2tlci50c2Agc28gdGhlIHR3byBoYW5nIHNpZ25hbHMgbGluZSB1cCBvbiBkYXNoYm9hcmRzLlxuICovXG5leHBvcnQgY29uc3QgVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyA9IDUgKiA2MCAqIDEwMDA7XG5cbi8qKlxuICogSG93IG1hbnkgY29uc2VjdXRpdmUgcXVpZXQgd2luZG93cyB0aGUgd2F0Y2hkb2cgcmUtYXJtcyBmb3IuIEVhY2ggcmVwb3J0IGlzXG4gKiBkZWR1cGVkIHBlciB7QGxpbmsgQWdlbnRIb3N0VHVybkhhbmdSZWFzb259LCBzbyByZS1hcm1pbmcgZXhpc3RzIG9ubHkgdG9cbiAqIGNhdGNoIGEgKmNoYW5nZSogb2Ygc3RhdGUgKGUuZy4gdGhlIHVzZXIgYW5zd2VycyBhIGNvbmZpcm1hdGlvbiBhbmQgdGhlIHR1cm5cbiAqIHRoZW4gaGFuZ3MgZm9yIHJlYWwpLiBBZnRlciB0aGlzIG1hbnkgcXVpZXQgd2luZG93cyB0aGUgd2F0Y2hkb2cgc3RvcHNcbiAqIGFybWluZzsgYW55IGxhdGVyIGFjdGl2aXR5IHJlLWFybXMgaXQuIFRoaXMga2VlcHMgdGhlIG51bWJlciBvZiBsaXZlIHRpbWVyc1xuICogYW5kIGVtaXR0ZWQgZXZlbnRzIGJvdW5kZWQgZm9yIGEgcGVybWFuZW50bHkgZGVhZCB0dXJuLlxuICovXG5jb25zdCBNQVhfSEFOR19DSEVDS19XSU5ET1dTID0gNjtcblxuLyoqIFNlbnRpbmVsIGBsYXN0QWN0aXZpdHlLaW5kYCBmb3IgYSB0dXJuIHRoYXQgbmV2ZXIgcHJvZHVjZWQgYW55IGFjdGl2aXR5LiAqL1xuZXhwb3J0IGNvbnN0IFRVUk5fQUNUSVZJVFlfTk9ORSA9ICdub25lJztcblxuLyoqIElkZW50aXR5IG9mIGEgdG9vbCBjYWxsIHRoYXQgaGFzIHN0YXJ0ZWQgYnV0IG5vdCB5ZXQgY29tcGxldGVkLiAqL1xuaW50ZXJmYWNlIElJbkZsaWdodFRvb2xDYWxsIHtcblx0cmVhZG9ubHkgdG9vbElkOiBzdHJpbmc7XG5cdGNvbnRyaWJ1dG9yOiBUb29sQ2FsbENvbnRyaWJ1dG9yIHwgdW5kZWZpbmVkO1xuXHR0b29sU291cmNlS2luZDogc3RyaW5nO1xufVxuXG4vKiogQW4gb3V0c3RhbmRpbmcgc2Vzc2lvbiBpbnB1dCByZXF1ZXN0LCBhbmQgdGhlIHRvb2wgY2FsbCBpdCBnYXRlcyBpZiBhbnkuICovXG5pbnRlcmZhY2UgSVR1cm5CbG9ja2VyIHtcblx0cmVhZG9ubHkga2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQ7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuLyoqIFBlci10dXJuIHRpbWluZyBzdGF0ZSwga2V5ZWQgYnkgYHNlc3Npb246dHVybklkYC4gKi9cbmludGVyZmFjZSBJVHVyblRpbWluZyB7XG5cdHJlYWRvbmx5IHN0b3BXYXRjaDogU3RvcFdhdGNoO1xuXHRyZWFkb25seSBwcm92aWRlcjogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHRtb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtb2RlbFRlbGVtZXRyeUtpbmQ6IEFnZW50SG9zdE1vZGVsVGVsZW1ldHJ5S2luZCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbW9kZWxTZWxlY3Rpb25LaW5kOiAnZGVmYXVsdCcgfCAnYXV0bycgfCAnZXhwbGljaXQnO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uTGV2ZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW50ZXJhY3Rpb25Nb2RlOiBTZXNzaW9uTW9kZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2xpZW50Q29udGV4dDogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQ7XG5cdGZpcnN0UHJvZ3Jlc3NNczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8vIEhhbmcgd2F0Y2hkb2cgc3RhdGVcblx0LyoqIFJlc2V0IG9uIGV2ZXJ5IG9ic2VydmVkIGFjdGl2aXR5OyBtZWFzdXJlcyB0aGUgY3VycmVudCBxdWlldCBwZXJpb2QuICovXG5cdHF1aWV0U3RvcFdhdGNoOiBTdG9wV2F0Y2g7XG5cdC8qKiBQcm90b2NvbCBhY3Rpb24gdHlwZSBvZiB0aGUgbGFzdCBvYnNlcnZlZCBhY3Rpdml0eSwgb3IgYG5vbmVgLiAqL1xuXHRsYXN0QWN0aXZpdHlLaW5kOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUb29sIGNhbGxzIHRoYXQgaGF2ZSBzdGFydGVkIGJ1dCBub3QgY29tcGxldGVkLCBieSB0b29sIGNhbGwgaWQuIEluc2VydGlvblxuXHQgKiBvcmRlcmVkLCBzbyB0aGUgZmlyc3QgZW50cnkgaXMgdGhlIGxvbmdlc3QtcnVubmluZyBjYWxsLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5GbGlnaHRUb29sQ2FsbHM6IE1hcDxzdHJpbmcsIElJbkZsaWdodFRvb2xDYWxsPjtcblx0LyoqIE91dHN0YW5kaW5nIHNlc3Npb24gaW5wdXQgcmVxdWVzdHMgZm9yIHRoaXMgdHVybiwgYnkgcmVxdWVzdCBpZC4gKi9cblx0cmVhZG9ubHkgYmxvY2tlcnM6IE1hcDxzdHJpbmcsIElUdXJuQmxvY2tlcj47XG5cdC8qKiBIYW5nIHJlYXNvbnMgYWxyZWFkeSByZXBvcnRlZCwgc28gZWFjaCBpcyBlbWl0dGVkIGF0IG1vc3Qgb25jZSBwZXIgdHVybi4gKi9cblx0cmVhZG9ubHkgcmVwb3J0ZWRIYW5nUmVhc29uczogU2V0PEFnZW50SG9zdFR1cm5IYW5nUmVhc29uPjtcblx0LyoqIE51bWJlciBvZiBoYW5nIHJlcG9ydHMgZW1pdHRlZCBmb3IgdGhpcyB0dXJuLiAqL1xuXHRoYW5nUmVwb3J0Q291bnQ6IG51bWJlcjtcblx0LyoqIFRoZSBtb3N0IHJlY2VudGx5IHJlcG9ydGVkIGhhbmcgcmVhc29uLCBmb3IgdGhlIHBhaXJlZCByZWNvdmVyeSBldmVudC4gKi9cblx0bGFzdEhhbmdSZWFzb246IEFnZW50SG9zdFR1cm5IYW5nUmVhc29uIHwgdW5kZWZpbmVkO1xuXHQvKiogU3RhcnRlZCB3aGVuIHRoZSBmaXJzdCBoYW5nIHJlcG9ydCBpcyBlbWl0dGVkOyBtZWFzdXJlcyByZWNvdmVyeSB0aW1lLiAqL1xuXHRsYXN0SGFuZ1N0b3BXYXRjaDogU3RvcFdhdGNoIHwgdW5kZWZpbmVkO1xuXHQvKiogQ29uc2VjdXRpdmUgcXVpZXQgd2luZG93cyB0aGUgd2F0Y2hkb2cgaGFzIG9ic2VydmVkLiAqL1xuXHRxdWlldFdpbmRvd3M6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBUcmFja3MgcGVyLXR1cm4gdGltaW5nIGZvciBhZ2VudCBob3N0IHNlc3Npb25zIGFuZCByZXBvcnRzIGEgY29tcGxldGlvblxuICogZXZlbnQgdmlhIHRoZSBwcm92aWRlZCB7QGxpbmsgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXJ9IHdoZW4gYSB0dXJuIGVuZHMuXG4gKlxuICogTGlmZWN5Y2xlIHBlciB0dXJuOlxuICogICAxLiB7QGxpbmsgdHVyblN0YXJ0ZWR9IFx1MjAxNCBiZWdpbnMgYSBzdG9wd2F0Y2ggZm9yIHRoZSB0dXJuIGFuZCBhcm1zIHRoZSBoYW5nXG4gKiAgICAgIHdhdGNoZG9nXG4gKiAgIDIuIHtAbGluayBtYXJrRmlyc3RQcm9ncmVzc30gXHUyMDE0IHJlY29yZHMgZWxhcHNlZCB0aW1lIHRvIGZpcnN0IHZpc2libGUgb3V0cHV0XG4gKiAgICAgIChvbmx5IHRoZSBmaXJzdCBjYWxsIHBlciB0dXJuIGhhcyBhbiBlZmZlY3QpXG4gKiAgIDMuIHtAbGluayBtYXJrQWN0aXZpdHl9IFx1MjAxNCByZWNvcmRzIGFueSBvYnNlcnZlZCB0dXJuIGFjdGl2aXR5IGFuZCBkZWJvdW5jZXNcbiAqICAgICAgdGhlIGhhbmcgd2F0Y2hkb2dcbiAqICAgNC4ge0BsaW5rIHR1cm5Db21wbGV0ZWR9IFx1MjAxNCBlbWl0cyB0aGUgdGVsZW1ldHJ5IGV2ZW50IGFuZCBjbGVhcnMgc3RhdGVcbiAqXG4gKiBUaGUgaGFuZyB3YXRjaGRvZyBnaXZlcyBhICpwb3NpdGl2ZSogc2lnbmFsIGZvciBzdHVjayB0dXJucy4gV2l0aG91dCBpdCBhXG4gKiB0dXJuIHRoYXQgc3RhcnRzIGFuZCBuZXZlciBjb21wbGV0ZXMgaXMgb25seSB2aXNpYmxlIGFzIHRoZSBhYnNlbmNlIG9mIGFuXG4gKiBgYWdlbnRIb3N0LnR1cm5Db21wbGV0ZWRgIGV2ZW50LCB3aGljaCBkb2VzIG5vdCBzaG93IHVwIG9uIGRhc2hib2FyZHMuIFdoZW5cbiAqIGEgdHVybiBnb2VzIHtAbGluayBUVVJOX0hBTkdfVEhSRVNIT0xEX01TfSB3aXRob3V0IGFjdGl2aXR5IHRoZSB0cmFja2VyXG4gKiByZXBvcnRzIGBhZ2VudEhvc3QudHVybkh1bmdgIHdpdGggdGhlIHN0YXRlIGl0IHdhcyBxdWlldCBpbjsgaWYgc3VjaCBhIHR1cm5cbiAqIGxhdGVyIGNvbXBsZXRlcywgaXQgYWxzbyByZXBvcnRzIGBhZ2VudEhvc3QuaHVuZ1R1cm5Db21wbGV0ZWRgIHNvIHBlcm1hbmVudFxuICogaGFuZ3MgY2FuIGJlIHNlcGFyYXRlZCBmcm9tIG1lcmVseSBzbG93IG9uZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RUdXJuVHJhY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3R1cm5UaW1pbmdzID0gbmV3IE1hcDxzdHJpbmcsIElUdXJuVGltaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5nV2F0Y2hkb2dzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0LyoqIE1hcHMgYHNlc3Npb246cmVxdWVzdElkYCB0byB0aGUgdHVybiBrZXkgYmxvY2tlZCBvbiB0aGF0IHJlcXVlc3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jsb2NrZXJUdXJuS2V5cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdpdGggdGhlIHByb3ZpZGVyIGlkIHdoZW5ldmVyIGEgdHVybiBzdGFydHMsIGkuZS4gd2hlbmV2ZXIgdGhlIGhvc3Rcblx0ICogaXMgYWJvdXQgdG8gbWFrZSBhbiBMTE0gcmVxdWVzdCBvbiB0aGF0IHByb3ZpZGVyJ3MgYmVoYWxmLlxuXHQgKlxuXHQgKiBDb25zdW1lZCBieSB7QGxpbmsgQWdlbnRNb2RlbFJlZnJlc2hTY2hlZHVsZXJ9IHRvIGdhdGUgaXRzIHBlcmlvZGljIG1vZGVsXG5cdCAqIHJlZnJlc2ggb24gcmVhbCB1c2FnZSwgc28gYW4gaWRsZSBob3N0IGlzc3VlcyBubyBgbW9kZWxzYCBuZXR3b3JrXG5cdCAqIHJlcXVlc3RzIGF0IGFsbC4gTG9jYWwgaG9zdCBjb21tYW5kcyAoYC9yZW5hbWVgLCBgIWNvbW1hbmRgKSBhcmVcblx0ICogaW50ZXJjZXB0ZWQgYmVmb3JlIGB0dXJuU3RhcnRlZGAgaXMgcmVhY2hlZCBhbmQgc28gY29ycmVjdGx5IGRvIG5vdCBjb3VudFxuXHQgKiBhcyBhY3Rpdml0eS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnRUdXJuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydFR1cm46IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZFN0YXJ0VHVybi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9yZXBvcnRlcjogQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl90dXJuVGltaW5ncy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYmxvY2tlclR1cm5LZXlzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0dHVyblN0YXJ0ZWQocHJvdmlkZXI6IHN0cmluZywgc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgbW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgbW9kZWxUZWxlbWV0cnlLaW5kOiBBZ2VudEhvc3RNb2RlbFRlbGVtZXRyeUtpbmQgfCB1bmRlZmluZWQsIHBlcm1pc3Npb25MZXZlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpbnRlcmFjdGlvbk1vZGU6IFNlc3Npb25Nb2RlIHwgdW5kZWZpbmVkLCBjbGllbnRDb250ZXh0ID0gY3JlYXRlVW5rbm93bkFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQoQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duKSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShzZXNzaW9uLCB0dXJuSWQpO1xuXHRcdHRoaXMuX3R1cm5UaW1pbmdzLnNldChrZXksIHtcblx0XHRcdHN0b3BXYXRjaDogU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSksXG5cdFx0XHRwcm92aWRlcixcblx0XHRcdHNlc3Npb24sXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRtb2RlbCxcblx0XHRcdG1vZGVsVGVsZW1ldHJ5S2luZCxcblx0XHRcdG1vZGVsU2VsZWN0aW9uS2luZDogbW9kZWwgPT09IHVuZGVmaW5lZCA/ICdkZWZhdWx0JyA6IG1vZGVsID09PSAnYXV0bycgPyAnYXV0bycgOiAnZXhwbGljaXQnLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsLFxuXHRcdFx0aW50ZXJhY3Rpb25Nb2RlLFxuXHRcdFx0Y2xpZW50Q29udGV4dCxcblx0XHRcdGZpcnN0UHJvZ3Jlc3NNczogdW5kZWZpbmVkLFxuXHRcdFx0cXVpZXRTdG9wV2F0Y2g6IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpLFxuXHRcdFx0bGFzdEFjdGl2aXR5S2luZDogVFVSTl9BQ1RJVklUWV9OT05FLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbHM6IG5ldyBNYXAoKSxcblx0XHRcdGJsb2NrZXJzOiBuZXcgTWFwKCksXG5cdFx0XHRyZXBvcnRlZEhhbmdSZWFzb25zOiBuZXcgU2V0KCksXG5cdFx0XHRoYW5nUmVwb3J0Q291bnQ6IDAsXG5cdFx0XHRsYXN0SGFuZ1JlYXNvbjogdW5kZWZpbmVkLFxuXHRcdFx0bGFzdEhhbmdTdG9wV2F0Y2g6IHVuZGVmaW5lZCxcblx0XHRcdHF1aWV0V2luZG93czogMCxcblx0XHR9KTtcblx0XHR0aGlzLl9hcm1IYW5nV2F0Y2hkb2coa2V5KTtcblx0XHR0aGlzLl9vbkRpZFN0YXJ0VHVybi5maXJlKHByb3ZpZGVyKTtcblx0fVxuXG5cdG1hcmtGaXJzdFByb2dyZXNzKHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0aW1pbmcgPSB0aGlzLl90dXJuVGltaW5ncy5nZXQodGhpcy5fa2V5KHNlc3Npb24sIHR1cm5JZCkpO1xuXHRcdGlmICh0aW1pbmcgJiYgdGltaW5nLmZpcnN0UHJvZ3Jlc3NNcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aW1pbmcuZmlyc3RQcm9ncmVzc01zID0gdGltaW5nLnN0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29yZHMgb2JzZXJ2ZWQgYWN0aXZpdHkgZm9yIGEgdHVybi4gYGFjdGl2aXR5S2luZGAgaXMgdGhlIHByb3RvY29sXG5cdCAqIGFjdGlvbiB0eXBlIHRoYXQgcHJvZHVjZWQgaXQsIHdoaWNoIGlzIGVtaXR0ZWQgdmVyYmF0aW0gaW4gdGhlIGhhbmcgZXZlbnRcblx0ICogc28gYSBoYW5nIGNhbiBiZSBhdHRyaWJ1dGVkIHRvIHdoYXQgdGhlIHR1cm4gd2FzIGxhc3QgZG9pbmcuXG5cdCAqXG5cdCAqIEV2ZXJ5IGNhbGwgZGVib3VuY2VzIHRoZSBoYW5nIHdhdGNoZG9nLCBzbyBhIHR1cm4gdGhhdCBrZWVwcyBwcm9kdWNpbmdcblx0ICogc2lnbmFscyBvZiBhbnkga2luZCBpcyBuZXZlciByZXBvcnRlZCBhcyBodW5nLiBUaGlzIGlzIGRlbGliZXJhdGVseVxuXHQgKiBicm9hZGVyIHRoYW4ge0BsaW5rIG1hcmtGaXJzdFByb2dyZXNzfSwgd2hpY2ggb25seSBjb3VudHMgKnZpc2libGUqXG5cdCAqIHByb2dyZXNzIGZvciB0aGUgdGltZS10by1maXJzdC1wcm9ncmVzcyBtZXRyaWMuXG5cdCAqL1xuXHRtYXJrQWN0aXZpdHkoc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgYWN0aXZpdHlLaW5kOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkoc2Vzc2lvbiwgdHVybklkKTtcblx0XHRjb25zdCB0aW1pbmcgPSB0aGlzLl90dXJuVGltaW5ncy5nZXQoa2V5KTtcblx0XHRpZiAoIXRpbWluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aW1pbmcubGFzdEFjdGl2aXR5S2luZCA9IGFjdGl2aXR5S2luZDtcblx0XHR0aGlzLl90b3VjaChrZXksIHRpbWluZyk7XG5cdH1cblxuXHQvKiogUmVzZXRzIHRoZSBxdWlldCBwZXJpb2QgYW5kIHJlLWFybXMgdGhlIHdhdGNoZG9nIGZvciBhIGxpdmUgdHVybi4gKi9cblx0cHJpdmF0ZSBfdG91Y2goa2V5OiBzdHJpbmcsIHRpbWluZzogSVR1cm5UaW1pbmcpOiB2b2lkIHtcblx0XHR0aW1pbmcucXVpZXRTdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdHRpbWluZy5xdWlldFdpbmRvd3MgPSAwO1xuXHRcdHRoaXMuX2FybUhhbmdXYXRjaGRvZyhrZXkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29yZHMgdGhhdCBhIHRvb2wgY2FsbCBpcyBpbiBmbGlnaHQgZm9yIHRoZSB0dXJuLiBBbiBpbi1mbGlnaHQgdG9vbFxuXHQgKiBjYWxsIGV4cGxhaW5zIGFuIG90aGVyd2lzZSBxdWlldCB0dXJuIChhIGxvbmcgYnVpbGQsIG9yIGEgc3ViYWdlbnQgd2hvc2Vcblx0ICogcHJvZ3Jlc3MgaXMgcmVwb3J0ZWQgb24gaXRzIG93biBjaGF0IGNoYW5uZWwpLCBzbyB0aGUgaGFuZyBpcyByZXBvcnRlZFxuXHQgKiB3aXRoIHRoZSBgcnVubmluZ1Rvb2xgIHJlYXNvbiByYXRoZXIgdGhhbiBhcyBhbiB1bmV4cGxhaW5lZCBzdGFsbC5cblx0ICpcblx0ICogVGhlIHRvb2wncyBpZGVudGl0eSBpcyByZXRhaW5lZCBzbyBhIGhhbmcgcmVwb3J0IGNhbiBuYW1lIHdoYXQgdGhlIHR1cm5cblx0ICogaXMgc3R1Y2sgb24uIFRoaXMgbWF0dGVycyBtb3N0IGZvciBhZ2VudC1ob3N0LXByb3ZpZGVkIHRvb2xzOiB0aG9zZSBuZXZlclxuXHQgKiBlbnRlciB0aGUgc2Vzc2lvbiBpbnB1dCBxdWV1ZSwgc28gYGFnZW50SG9zdC50b29sQ2FsbFN0YWxsZWRgIFx1MjAxNCB3aGljaFxuXHQgKiBvbmx5IGZpcmVzIGZvciBibG9ja2VkIHRvb2wgY2FsbHMgXHUyMDE0IGNhbm5vdCBzZWUgdGhlbSBhdCBhbGwuXG5cdCAqL1xuXHR0b29sQ2FsbFN0YXJ0ZWQoc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBjb250cmlidXRvcjogVG9vbENhbGxDb250cmlidXRvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3R1cm5UaW1pbmdzLmdldCh0aGlzLl9rZXkoc2Vzc2lvbiwgdHVybklkKSk/LmluRmxpZ2h0VG9vbENhbGxzLnNldCh0b29sQ2FsbElkLCB7XG5cdFx0XHR0b29sSWQ6IHRvb2xOYW1lLFxuXHRcdFx0Y29udHJpYnV0b3IsXG5cdFx0XHR0b29sU291cmNlS2luZDogdG9vbFNvdXJjZUtpbmRGcm9tQ29udHJpYnV0b3IoY29udHJpYnV0b3IpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZmluZXMgYW4gaW4tZmxpZ2h0IHRvb2wgY2FsbCdzIGNvbnRyaWJ1dG9yIG9uY2UgY29tcGxldGUgbWV0YWRhdGEgaXNcblx0ICogYXZhaWxhYmxlLiBNaXJyb3JzIHtAbGluayBBZ2VudEhvc3RUb29sQ2FsbFRyYWNrZXIudG9vbENhbGxNZXRhZGF0YVVwZGF0ZWR9XG5cdCAqIHNvIGB0b29sU291cmNlS2luZGAgYWdyZWVzIGJldHdlZW4gdGhlIHR3byB0ZWxlbWV0cnkgZXZlbnRzIGZvciB0aGUgc2FtZVxuXHQgKiB0b29sIGNhbGwuXG5cdCAqL1xuXHR0b29sQ2FsbE1ldGFkYXRhVXBkYXRlZChzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIGNvbnRyaWJ1dG9yOiBUb29sQ2FsbENvbnRyaWJ1dG9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5GbGlnaHQgPSB0aGlzLl90dXJuVGltaW5ncy5nZXQodGhpcy5fa2V5KHNlc3Npb24sIHR1cm5JZCkpPy5pbkZsaWdodFRvb2xDYWxscy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKGluRmxpZ2h0ICYmIGNvbnRyaWJ1dG9yICYmIGNhblJlZmluZUNvbnRyaWJ1dG9yKGluRmxpZ2h0LmNvbnRyaWJ1dG9yLCBjb250cmlidXRvcikpIHtcblx0XHRcdGluRmxpZ2h0LmNvbnRyaWJ1dG9yID0gY29udHJpYnV0b3I7XG5cdFx0XHRpbkZsaWdodC50b29sU291cmNlS2luZCA9IHRvb2xTb3VyY2VLaW5kRnJvbUNvbnRyaWJ1dG9yKGNvbnRyaWJ1dG9yKTtcblx0XHR9XG5cdH1cblxuXHR0b29sQ2FsbEVuZGVkKHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3R1cm5UaW1pbmdzLmdldCh0aGlzLl9rZXkoc2Vzc2lvbiwgdHVybklkKSk/LmluRmxpZ2h0VG9vbENhbGxzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvcmRzIHRoYXQgYSBzZXNzaW9uIGlucHV0IHJlcXVlc3QgaXMgb3V0c3RhbmRpbmcgZm9yIHRoZSB0dXJuLlxuXHQgKlxuXHQgKiBPbmx5IHJlcXVlc3RzIHRoYXQgYmxvY2sgb24gYSAqaHVtYW4qIG1ha2UgdGhlIHR1cm4gYHdhaXRpbmdPblVzZXJgLlxuXHQgKiB7QGxpbmsgU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbn0gaXMgZGVsZWdhdGVkIHJ1bm5pbmdcblx0ICogd29yaywgbm90IGEgcHJvbXB0OiB0aGUgY2FsbCBoYXMgYWxyZWFkeSBjbGVhcmVkIGl0cyBjb25maXJtYXRpb24gZ2F0ZVxuXHQgKiBhbmQgaXMgc2ltcGx5IGV4ZWN1dGluZyBvbiBhIGNsaWVudC4gQ291bnRpbmcgaXQgd291bGQgcmVwb3J0IGV2ZXJ5XG5cdCAqIGxvbmctcnVubmluZyBjbGllbnQgdG9vbCBhcyB3YWl0aW5nIG9uIHRoZSB1c2VyLiBUaGlzIG1pcnJvcnMgdGhlXG5cdCAqIGBhd2FpdHNVc2VyYCBwcmVkaWNhdGUgdGhlIHByb3RvY29sIHJlZHVjZXIgdXNlcyBmb3Igc2Vzc2lvbiBzdGF0dXNcblx0ICogKGBjaGFubmVscy1zZXNzaW9uL3JlZHVjZXIudHNgKSwgd2hpY2ggY2Fubm90IGJlIGltcG9ydGVkIGhlcmUgYmVjYXVzZVxuXHQgKiB0aGF0IGZpbGUgaXMgZ2VuZXJhdGVkLiBDbGllbnQgZXhlY3V0aW9uIGlzIHN0aWxsIHJlcHJlc2VudGVkIFx1MjAxNCB0aGVcblx0ICogaW4tZmxpZ2h0IHRvb2wgc2V0IGNvdmVycyBpdCBhbmQgeWllbGRzIGBydW5uaW5nVG9vbGAuXG5cdCAqXG5cdCAqIEV2ZXJ5IG91dHN0YW5kaW5nIHJlcXVlc3QgaXMgcmVjb3JkZWQgcmVnYXJkbGVzcywgc28gdW5ibG9ja2luZyBjYW4gZmluZFxuXHQgKiBpdHMgdHVybiBhbmQgdGVhcmRvd24gY2FuIGNsZWFuIHVwIGl0cyBib29ra2VlcGluZy5cblx0ICovXG5cdHR1cm5CbG9ja2VkKHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCBraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZCwgdG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybktleSA9IHRoaXMuX2tleShzZXNzaW9uLCB0dXJuSWQpO1xuXHRcdGNvbnN0IHRpbWluZyA9IHRoaXMuX3R1cm5UaW1pbmdzLmdldCh0dXJuS2V5KTtcblx0XHRpZiAoIXRpbWluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aW1pbmcuYmxvY2tlcnMuc2V0KHJlcXVlc3RJZCwgeyBraW5kLCB0b29sQ2FsbElkIH0pO1xuXHRcdHRoaXMuX2Jsb2NrZXJUdXJuS2V5cy5zZXQodGhpcy5fa2V5KHNlc3Npb24sIHJlcXVlc3RJZCksIHR1cm5LZXkpO1xuXHRcdC8vIEEgcmVxdWVzdCBhcHBlYXJpbmcgb3IgYmVpbmcgYW5zd2VyZWQgaXMgaXRzZWxmIGEgc3RhdGUgY2hhbmdlLCBzbyBpdFxuXHRcdC8vIHJlc3RhcnRzIHRoZSBxdWlldCBwZXJpb2QuIFdpdGhvdXQgdGhpcywgYSB1c2VyIHdobyBhbnN3ZXJzIGp1c3Rcblx0XHQvLyBiZWZvcmUgdGhlIHdhdGNoZG9nIGV4cGlyZXMgd291bGQgYmUgbWlzcmVwb3J0ZWQgYXMgYW4gdW5leHBsYWluZWRcblx0XHQvLyBzdGFsbCBvbiB0aGUgdmVyeSBuZXh0IHRpY2ssIGFuZCBhIHR1cm4gd2hvc2Ugd2F0Y2hkb2cgaGFkIHN0b3BwZWRcblx0XHQvLyByZS1hcm1pbmcgd2hpbGUgYmxvY2tlZCB3b3VsZCBuZXZlciBiZSB3YXRjaGVkIGFnYWluIGFmdGVyIHRoZVxuXHRcdC8vIGFuc3dlci5cblx0XHR0aGlzLl90b3VjaCh0dXJuS2V5LCB0aW1pbmcpO1xuXHR9XG5cblx0dHVyblVuYmxvY2tlZChzZXNzaW9uOiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgYmxvY2tlcktleSA9IHRoaXMuX2tleShzZXNzaW9uLCByZXF1ZXN0SWQpO1xuXHRcdGNvbnN0IHR1cm5LZXkgPSB0aGlzLl9ibG9ja2VyVHVybktleXMuZ2V0KGJsb2NrZXJLZXkpO1xuXHRcdGlmICh0dXJuS2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYmxvY2tlclR1cm5LZXlzLmRlbGV0ZShibG9ja2VyS2V5KTtcblx0XHRjb25zdCB0aW1pbmcgPSB0aGlzLl90dXJuVGltaW5ncy5nZXQodHVybktleSk7XG5cdFx0aWYgKCF0aW1pbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGltaW5nLmJsb2NrZXJzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdHRoaXMuX3RvdWNoKHR1cm5LZXksIHRpbWluZyk7XG5cdH1cblxuXHR1cGRhdGVNb2RlbChzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCBtb2RlbDogc3RyaW5nLCBtb2RlbFRlbGVtZXRyeUtpbmQ6IEFnZW50SG9zdE1vZGVsVGVsZW1ldHJ5S2luZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpbWluZyA9IHRoaXMuX3R1cm5UaW1pbmdzLmdldCh0aGlzLl9rZXkoc2Vzc2lvbiwgdHVybklkKSk7XG5cdFx0aWYgKHRpbWluZykge1xuXHRcdFx0dGltaW5nLm1vZGVsID0gbW9kZWw7XG5cdFx0XHR0aW1pbmcubW9kZWxUZWxlbWV0cnlLaW5kID0gbW9kZWxUZWxlbWV0cnlLaW5kO1xuXHRcdH1cblx0fVxuXG5cdGdldE1vZGVsVGVsZW1ldHJ5Q29udGV4dChzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogeyBtb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkOyBtb2RlbFRlbGVtZXRyeUtpbmQ6IEFnZW50SG9zdE1vZGVsVGVsZW1ldHJ5S2luZCB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0aW1pbmcgPSB0aGlzLl90dXJuVGltaW5ncy5nZXQodGhpcy5fa2V5KHNlc3Npb24sIHR1cm5JZCkpO1xuXHRcdHJldHVybiB0aW1pbmcgPyB7IG1vZGVsOiB0aW1pbmcubW9kZWwsIG1vZGVsVGVsZW1ldHJ5S2luZDogdGltaW5nLm1vZGVsVGVsZW1ldHJ5S2luZCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90dXJuVGltaW5ncy5nZXQodGhpcy5fa2V5KHNlc3Npb24sIHR1cm5JZCkpPy5jbGllbnRDb250ZXh0O1xuXHR9XG5cblx0dHVybkNvbXBsZXRlZChzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCByZXN1bHQ6IEFnZW50SG9zdFR1cm5SZXN1bHQsIGZhaWx1cmU/OiBJQWdlbnRIb3N0VHVybkZhaWx1cmUsIHdvcmtzcGFjZT86IHsgcmVhZG9ubHkgaXNNdWx0aVJvb3Q6IGJvb2xlYW47IHJlYWRvbmx5IGZvbGRlckNvdW50OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShzZXNzaW9uLCB0dXJuSWQpO1xuXHRcdGNvbnN0IHRpbWluZyA9IHRoaXMuX3R1cm5UaW1pbmdzLmdldChrZXkpO1xuXHRcdGlmICghdGltaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2VUdXJuKGtleSwgdGltaW5nKTtcblxuXHRcdHRoaXMuX3JlcG9ydGVyLnR1cm5Db21wbGV0ZWQoe1xuXHRcdFx0Y2xpZW50Q29udGV4dDogdGltaW5nLmNsaWVudENvbnRleHQsXG5cdFx0XHRwcm92aWRlcjogdGltaW5nLnByb3ZpZGVyLFxuXHRcdFx0c2Vzc2lvbjogdGltaW5nLnNlc3Npb24sXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0aW1lVG9GaXJzdFByb2dyZXNzOiB0aW1pbmcuZmlyc3RQcm9ncmVzc01zLFxuXHRcdFx0dG90YWxUaW1lOiB0aW1pbmcuc3RvcFdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdHJlc3VsdCxcblx0XHRcdG1vZGVsOiB0aW1pbmcubW9kZWwsXG5cdFx0XHRtb2RlbFRlbGVtZXRyeUtpbmQ6IHRpbWluZy5tb2RlbFRlbGVtZXRyeUtpbmQsXG5cdFx0XHRtb2RlbFNlbGVjdGlvbktpbmQ6IHRpbWluZy5tb2RlbFNlbGVjdGlvbktpbmQsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHRpbWluZy5wZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHRpbnRlcmFjdGlvbk1vZGU6IHRpbWluZy5pbnRlcmFjdGlvbk1vZGUsXG5cdFx0XHRmYWlsdXJlLFxuXHRcdFx0aXNNdWx0aVJvb3Q6IHdvcmtzcGFjZT8uaXNNdWx0aVJvb3QgPz8gZmFsc2UsXG5cdFx0XHRmb2xkZXJDb3VudDogd29ya3NwYWNlPy5mb2xkZXJDb3VudCA/PyAwLFxuXHRcdH0pO1xuXG5cdFx0Ly8gUGFpcmVkIHJlY292ZXJ5IGV2ZW50OiB0aGUgdHVybiB3YXMgcmVwb3J0ZWQgYXMgaHVuZyBidXQgZGlkIGZpbmlzaCxcblx0XHQvLyB3aGljaCBkaXN0aW5ndWlzaGVzIGEgcGVybWFuZW50IGhhbmcgZnJvbSBhIG1lcmVseSBzbG93IHR1cm4uXG5cdFx0aWYgKHRpbWluZy5sYXN0SGFuZ1JlYXNvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZXBvcnRlci5odW5nVHVybkNvbXBsZXRlZCh7XG5cdFx0XHRcdGNsaWVudENvbnRleHQ6IHRpbWluZy5jbGllbnRDb250ZXh0LFxuXHRcdFx0XHRwcm92aWRlcjogdGltaW5nLnByb3ZpZGVyLFxuXHRcdFx0XHRzZXNzaW9uOiB0aW1pbmcuc2Vzc2lvbixcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRoYW5nUmVhc29uOiB0aW1pbmcubGFzdEhhbmdSZWFzb24sXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0aGFuZ1JlcG9ydENvdW50OiB0aW1pbmcuaGFuZ1JlcG9ydENvdW50LFxuXHRcdFx0XHR0b3RhbFRpbWVNczogdGltaW5nLnN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdHRpbWVBZnRlckhhbmdNczogdGltaW5nLmxhc3RIYW5nU3RvcFdhdGNoPy5lbGFwc2VkKCkgPz8gMCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wcyBhbnkgaW4tZmxpZ2h0IChuZXZlci1jb21wbGV0ZWQpIHR1cm5zIGZvciBhIHNlc3Npb24gd2l0aG91dFxuXHQgKiByZXBvcnRpbmcgdGhlbS4gQ2FsbGVkIG9uIHNlc3Npb24gdGVhcmRvd24gc28gbmVpdGhlciB0aGUgdGltaW5nIG1hcCBub3Jcblx0ICogdGhlIHdhdGNoZG9nIHRpbWVycyBjYW4gb3V0bGl2ZSB0aGUgc2Vzc2lvbiB0aGV5IGRlc2NyaWJlLlxuXHQgKi9cblx0Y2xlYXJTZXNzaW9uKHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByZWZpeCA9IGAke3Nlc3Npb259XFwwYDtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHRpbWluZ10gb2YgdGhpcy5fdHVyblRpbWluZ3MpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VUdXJuKGtleSwgdGltaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fYmxvY2tlclR1cm5LZXlzLmtleXMoKSkge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0dGhpcy5fYmxvY2tlclR1cm5LZXlzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wcyB0cmFja2VkIHR1cm5zIGZvciBhIGNoYW5uZWwgdGhhdCBhcmUgbm90IGluIGBrZWVwVHVybklkc2AsIHdpdGhvdXRcblx0ICogcmVwb3J0aW5nIHRoZW0uIFVzZWQgYWZ0ZXIgYSBjaGF0IGlzIHRydW5jYXRlZDogdGhlIHR1cm5zIGFyZSBnb25lIGZyb21cblx0ICogc3RhdGUgYW5kIHdpbGwgbmV2ZXIgY29tcGxldGUsIHNvIHRoZWlyIHdhdGNoZG9ncyBtdXN0IG5vdCBzdXJ2aXZlIHRvXG5cdCAqIHJlcG9ydCBhIGhhbmcgZm9yIGEgdHVybiB0aGF0IG5vIGxvbmdlciBleGlzdHMuXG5cdCAqL1xuXHRjbGVhclR1cm5zRXhjZXB0KHNlc3Npb246IHN0cmluZywga2VlcFR1cm5JZHM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHRjb25zdCBwcmVmaXggPSBgJHtzZXNzaW9ufVxcMGA7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB0aW1pbmddIG9mIHRoaXMuX3R1cm5UaW1pbmdzKSB7XG5cdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgocHJlZml4KSAmJiAha2VlcFR1cm5JZHMuaGFzKHRpbWluZy50dXJuSWQpKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VUdXJuKGtleSwgdGltaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlVHVybihrZXk6IHN0cmluZywgdGltaW5nOiBJVHVyblRpbWluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3R1cm5UaW1pbmdzLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX2hhbmdXYXRjaGRvZ3MuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdElkIG9mIHRpbWluZy5ibG9ja2Vycy5rZXlzKCkpIHtcblx0XHRcdHRoaXMuX2Jsb2NrZXJUdXJuS2V5cy5kZWxldGUodGhpcy5fa2V5KHRpbWluZy5zZXNzaW9uLCByZXF1ZXN0SWQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcm1IYW5nV2F0Y2hkb2coa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9oYW5nV2F0Y2hkb2dzLnNldChrZXksIGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuX29uSGFuZ1dhdGNoZG9nRmlyZWQoa2V5KSwgVFVSTl9IQU5HX1RIUkVTSE9MRF9NUykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25IYW5nV2F0Y2hkb2dGaXJlZChrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRpbWluZyA9IHRoaXMuX3R1cm5UaW1pbmdzLmdldChrZXkpO1xuXHRcdGlmICghdGltaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRpbWluZy5xdWlldFdpbmRvd3MrKztcblxuXHRcdGNvbnN0IGhhbmdSZWFzb24gPSB0aGlzLl9kZXJpdmVIYW5nUmVhc29uKHRpbWluZyk7XG5cdFx0Ly8gUmVwb3J0IGVhY2ggcmVhc29uIGF0IG1vc3Qgb25jZSBwZXIgdHVybjogYSB0dXJuIHF1aWV0IGZvciBhbiBob3VyXG5cdFx0Ly8gc2hvdWxkIG5vdCBwcm9kdWNlIGEgZG96ZW4gaWRlbnRpY2FsIGV2ZW50cywgYnV0IGEgdHVybiB0aGF0IG1vdmVzXG5cdFx0Ly8gZnJvbSBgd2FpdGluZ09uVXNlcmAgdG8gYSBnZW51aW5lIHN0YWxsIHNob3VsZCBzdGlsbCBiZSByZXBvcnRlZC5cblx0XHRpZiAoIXRpbWluZy5yZXBvcnRlZEhhbmdSZWFzb25zLmhhcyhoYW5nUmVhc29uKSkge1xuXHRcdFx0dGltaW5nLnJlcG9ydGVkSGFuZ1JlYXNvbnMuYWRkKGhhbmdSZWFzb24pO1xuXHRcdFx0dGltaW5nLmhhbmdSZXBvcnRDb3VudCsrO1xuXHRcdFx0dGltaW5nLmxhc3RIYW5nUmVhc29uID0gaGFuZ1JlYXNvbjtcblx0XHRcdHRpbWluZy5sYXN0SGFuZ1N0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSk7XG5cdFx0XHRjb25zdCB1c2VyQmxvY2tlciA9IHRoaXMuX2ZpcnN0VXNlckJsb2NrZXIodGltaW5nKTtcblx0XHRcdGNvbnN0IHN0dWNrVG9vbCA9IHRoaXMuX3Jlc29sdmVTdHVja1Rvb2wodGltaW5nLCBoYW5nUmVhc29uKTtcblx0XHRcdHRoaXMuX3JlcG9ydGVyLnR1cm5IdW5nKHtcblx0XHRcdFx0Y2xpZW50Q29udGV4dDogdGltaW5nLmNsaWVudENvbnRleHQsXG5cdFx0XHRcdHByb3ZpZGVyOiB0aW1pbmcucHJvdmlkZXIsXG5cdFx0XHRcdHNlc3Npb246IHRpbWluZy5zZXNzaW9uLFxuXHRcdFx0XHR0dXJuSWQ6IHRpbWluZy50dXJuSWQsXG5cdFx0XHRcdGhhbmdSZWFzb24sXG5cdFx0XHRcdGhhZEFueVByb2dyZXNzOiB0aW1pbmcubGFzdEFjdGl2aXR5S2luZCAhPT0gVFVSTl9BQ1RJVklUWV9OT05FLFxuXHRcdFx0XHRsYXN0QWN0aXZpdHlLaW5kOiB0aW1pbmcubGFzdEFjdGl2aXR5S2luZCxcblx0XHRcdFx0YmxvY2tlZE9uOiB1c2VyQmxvY2tlcj8ua2luZCxcblx0XHRcdFx0dG9vbElkOiBzdHVja1Rvb2w/LnRvb2xJZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHN0dWNrVG9vbD8udG9vbFNvdXJjZUtpbmQsXG5cdFx0XHRcdGluRmxpZ2h0VG9vbENhbGxDb3VudDogdGltaW5nLmluRmxpZ2h0VG9vbENhbGxzLnNpemUsXG5cdFx0XHRcdHF1aWV0VGltZU1zOiB0aW1pbmcucXVpZXRTdG9wV2F0Y2guZWxhcHNlZCgpLFxuXHRcdFx0XHR0dXJuRWxhcHNlZE1zOiB0aW1pbmcuc3RvcFdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdFx0bW9kZWw6IHRpbWluZy5tb2RlbCxcblx0XHRcdFx0bW9kZWxUZWxlbWV0cnlLaW5kOiB0aW1pbmcubW9kZWxUZWxlbWV0cnlLaW5kLFxuXHRcdFx0XHRtb2RlbFNlbGVjdGlvbktpbmQ6IHRpbWluZy5tb2RlbFNlbGVjdGlvbktpbmQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdGltaW5nLnBlcm1pc3Npb25MZXZlbCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0aW1pbmcucXVpZXRXaW5kb3dzIDwgTUFYX0hBTkdfQ0hFQ0tfV0lORE9XUykge1xuXHRcdFx0dGhpcy5fYXJtSGFuZ1dhdGNoZG9nKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBmaXJzdCBvdXRzdGFuZGluZyByZXF1ZXN0IHRoYXQgYmxvY2tzIG9uIHRoZSB1c2VyLCBvciBgdW5kZWZpbmVkYFxuXHQgKiB3aGVuIG5vbmUgZG9lcy4gU2VlIHtAbGluayB0dXJuQmxvY2tlZH0gZm9yIHdoeSBjbGllbnQgdG9vbCBleGVjdXRpb24gaXNcblx0ICogbm90IGEgdXNlciBibG9ja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmlyc3RVc2VyQmxvY2tlcih0aW1pbmc6IElUdXJuVGltaW5nKTogSVR1cm5CbG9ja2VyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGJsb2NrZXIgb2YgdGltaW5nLmJsb2NrZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoYmxvY2tlci5raW5kICE9PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ2xpZW50RXhlY3V0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBibG9ja2VyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIElkZW50aWZpZXMgdGhlIHRvb2wgdGhlIHR1cm4gYXBwZWFycyB0byBiZSBzdHVjayBvbiwgc28gYSBoYW5nIHJlcG9ydCBjYW5cblx0ICogbmFtZSBpdCByYXRoZXIgdGhhbiBvbmx5IGNvdW50aW5nIGl0LlxuXHQgKlxuXHQgKiBGb3IgYHdhaXRpbmdPblVzZXJgIHRoaXMgaXMgdGhlIHRvb2wgY2FsbCBnYXRlZCBieSB0aGUgYmxvY2tpbmcgcmVxdWVzdC5cblx0ICogQSByZXN1bHQtY29uZmlybWF0aW9uIHByb21wdCByZXNvbHZlcyB0byBgdW5kZWZpbmVkYCwgYmVjYXVzZSB0aGUgdG9vbFxuXHQgKiBhbHJlYWR5IGNvbXBsZXRlZCBhbmQgbGVmdCB0aGUgaW4tZmxpZ2h0IHNldCBcdTIwMTQgdGhlIHR1cm4gaXMgd2FpdGluZyBvbiB0aGVcblx0ICogdXNlciByZXZpZXdpbmcgYSByZXN1bHQsIG5vdCBvbiBhIHRvb2wuIEFuIGVsaWNpdGF0aW9uIGhhcyBubyB0b29sIGF0IGFsbC5cblx0ICpcblx0ICogRm9yIGBydW5uaW5nVG9vbGAgdGhpcyBpcyB0aGUgbG9uZ2VzdC1ydW5uaW5nIGluLWZsaWdodCBjYWxsLiBXaXRoXG5cdCAqIHNldmVyYWwgdG9vbHMgcnVubmluZyBpbiBwYXJhbGxlbCB0aGVyZSBpcyBubyB3YXkgdG8gdGVsbCB3aGljaCBvbmUgaXNcblx0ICogd2VkZ2VkLCBzbyB0aGlzIGlzIGEgaGV1cmlzdGljOyBgaW5GbGlnaHRUb29sQ2FsbENvdW50YCB0cmF2ZWxzIGFsb25nc2lkZVxuXHQgKiBpdCwgYW5kIGZpbHRlcmluZyB0byBgaW5GbGlnaHRUb29sQ2FsbENvdW50ID09IDFgIGdpdmVzIHVuYW1iaWd1b3VzXG5cdCAqIGF0dHJpYnV0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVN0dWNrVG9vbCh0aW1pbmc6IElUdXJuVGltaW5nLCBoYW5nUmVhc29uOiBBZ2VudEhvc3RUdXJuSGFuZ1JlYXNvbik6IElJbkZsaWdodFRvb2xDYWxsIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaGFuZ1JlYXNvbiA9PT0gJ3dhaXRpbmdPblVzZXInKSB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gdGhpcy5fZmlyc3RVc2VyQmxvY2tlcih0aW1pbmcpPy50b29sQ2FsbElkO1xuXHRcdFx0cmV0dXJuIHRvb2xDYWxsSWQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHRpbWluZy5pbkZsaWdodFRvb2xDYWxscy5nZXQodG9vbENhbGxJZCk7XG5cdFx0fVxuXHRcdGlmIChoYW5nUmVhc29uID09PSAncnVubmluZ1Rvb2wnKSB7XG5cdFx0XHRyZXR1cm4gdGltaW5nLmluRmxpZ2h0VG9vbENhbGxzLnZhbHVlcygpLm5leHQoKS52YWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Rlcml2ZUhhbmdSZWFzb24odGltaW5nOiBJVHVyblRpbWluZyk6IEFnZW50SG9zdFR1cm5IYW5nUmVhc29uIHtcblx0XHQvLyBBIHVzZXIgYmxvY2tlciB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYW4gaW4tZmxpZ2h0IHRvb2wgY2FsbDogYSB0b29sXG5cdFx0Ly8gY2FsbCBhd2FpdGluZyBjb25maXJtYXRpb24gaXMgYm90aCwgYW5kIHRoZSBodW1hbiBpcyB0aGUgcmVhbCByZWFzb25cblx0XHQvLyB0aGUgdHVybiBpcyBxdWlldC5cblx0XHRpZiAodGhpcy5fZmlyc3RVc2VyQmxvY2tlcih0aW1pbmcpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiAnd2FpdGluZ09uVXNlcic7XG5cdFx0fVxuXHRcdGlmICh0aW1pbmcuaW5GbGlnaHRUb29sQ2FsbHMuc2l6ZSA+IDApIHtcblx0XHRcdHJldHVybiAncnVubmluZ1Rvb2wnO1xuXHRcdH1cblx0XHQvLyBOb3RoaW5nIG91dHN0YW5kaW5nIHRvIGV4cGxhaW4gdGhlIHNpbGVuY2UgXHUyMDE0IHRoaXMgaXMgYSByZWFsIGhhbmcuXG5cdFx0Ly8gYG5vUHJvZ3Jlc3NgIGluIHBhcnRpY3VsYXIgaXMgdGhlIHNpZ25hdHVyZSBvZiBhIGxvc3QgdHVybjogdGhlIHR1cm5cblx0XHQvLyBzdGFydGVkLCBubyBhY3Rpdml0eSBvZiBhbnkga2luZCB3YXMgZXZlciBvYnNlcnZlZCwgYW5kIGl0IG5ldmVyXG5cdFx0Ly8gY29tcGxldGVkLlxuXHRcdHJldHVybiB0aW1pbmcubGFzdEFjdGl2aXR5S2luZCA9PT0gVFVSTl9BQ1RJVklUWV9OT05FID8gJ25vUHJvZ3Jlc3MnIDogJ3N0YWxsZWRBZnRlclByb2dyZXNzJztcblx0fVxuXG5cdHByaXZhdGUgX2tleShzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7c2Vzc2lvbn1cXDAke3R1cm5JZH1gO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxlQUFlLG9CQUFvQjtBQUN4RCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLG9EQUEyRjtBQUNwRyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQixxQ0FBcUM7QUFDcEUsU0FBUywrQkFBK0I7QUFTakMsTUFBTSx5QkFBeUIsSUFBSSxLQUFLO0FBVS9DLE1BQU0seUJBQXlCO0FBR3hCLE1BQU0scUJBQXFCO0FBMEUzQixNQUFNLDZCQUE2QixXQUFXO0FBQUEsRUFvQnBELFlBQTZCLFdBQXVDO0FBQ25FLFVBQU07QUFEc0I7QUFsQjdCLFNBQWlCLGVBQWUsb0JBQUksSUFBeUI7QUFDN0QsU0FBaUIsaUJBQWlCLEtB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
