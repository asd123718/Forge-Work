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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { autorun, derived, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId } from "../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { BlockedSessionReason, BlockedSessions } from "../../blockedSessions/browser/blockedSessions.js";
import { IBlockedSessionsCIFixModel } from "./blockedSessionsCIFixModel.js";
import { getFirstApprovalAcrossChats } from "./views/sessionsList.js";
var RequiresInputKind = /* @__PURE__ */ ((RequiresInputKind2) => {
  RequiresInputKind2[RequiresInputKind2["TerminalApproval"] = 0] = "TerminalApproval";
  RequiresInputKind2[RequiresInputKind2["Question"] = 1] = "Question";
  RequiresInputKind2[RequiresInputKind2["FailingCI"] = 2] = "FailingCI";
  return RequiresInputKind2;
})(RequiresInputKind || {});
let BlockedSessionsIndicatorModel = class extends Disposable {
  constructor(approvalModel, blockedSessions, ciFixModel, _sessionsService, instantiationService, productService, sharedCIFixModel) {
    super();
    this._sessionsService = _sessionsService;
    /** Current blocked occurrences the user has already acknowledged, keyed by session id. */
    this._ignoredBlockOccurrences = observableValue("ignoredBlockOccurrences", /* @__PURE__ */ new Map());
    /**
     * Latest blocked occurrence per session, independent of visibility. Used so the
     * attention blink only fires for a genuinely new input request or CI failure.
     */
    this._lastBlockedOccurrences = /* @__PURE__ */ new Map();
    /**
     * Not-yet-visible blocked occurrences whose attention blink has not played yet.
     */
    this._pendingBlinkOccurrences = /* @__PURE__ */ new Map();
    this._onDidRequestBlink = this._register(new Emitter());
    /**
     * Fires when a genuinely new, not-yet-visible session becomes blocked and the
     * indicator should play its attention blink. Consumers should re-render and
     * call {@link consumePendingBlink}.
     */
    this.onDidRequestBlink = this._onDidRequestBlink.event;
    this._approvalModel = approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
    this._blockedSessionsModel = blockedSessions ?? this._register(instantiationService.createInstance(BlockedSessions));
    this._ciFixModel = ciFixModel ?? sharedCIFixModel;
    const enabled = productService.quality !== "stable";
    this.blockedSessions = derived(this, (reader) => {
      if (!enabled) {
        return [];
      }
      const visibleSessionIds = /* @__PURE__ */ new Set();
      for (const session of this._sessionsService.visibleSessions.read(reader)) {
        if (session) {
          visibleSessionIds.add(session.sessionId);
        }
      }
      const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
      const ciFixHidden = this._ciFixModel.hiddenSessions.read(reader);
      return this._blockedSessionsModel.blockedSessionsWithReasons.read(reader).filter((blocked) => !visibleSessionIds.has(blocked.session.sessionId) && !ciFixHidden.has(blocked.session.sessionId) && !this._isBlockIgnored(blocked, ignoredOccurrences, reader));
    });
    this.requiresInputKind = derived(this, (reader) => {
      const blocked = this.blockedSessions.read(reader);
      if (blocked.length === 0) {
        return void 0;
      }
      let common;
      let hasCommon = false;
      for (const entry of blocked) {
        const kind = this._kindOf(entry, reader);
        if (kind === void 0) {
          return void 0;
        }
        if (!hasCommon) {
          common = kind;
          hasCommon = true;
        } else if (common !== kind) {
          return void 0;
        }
      }
      return common;
    });
    this._register(autorun((reader) => {
      if (!enabled) {
        return;
      }
      const blockedSessions2 = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
      const blockedById = new Map(blockedSessions2.map((entry) => [entry.session.sessionId, entry]));
      const visibleSessionIds = new Set(this._sessionsService.visibleSessions.read(reader).filter((session) => session !== void 0).map((session) => session.sessionId));
      const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
      const next = new Map(ignoredOccurrences);
      let changed = false;
      for (const [sessionId, ignoredOccurrence] of ignoredOccurrences) {
        const blockedSession = blockedById.get(sessionId);
        if (!blockedSession || this._getBlockOccurrenceId(blockedSession, reader, ignoredOccurrence) !== ignoredOccurrence) {
          next.delete(sessionId);
          changed = true;
        }
      }
      for (const blockedSession of blockedById.values()) {
        if (!visibleSessionIds.has(blockedSession.session.sessionId)) {
          continue;
        }
        const occurrenceId = this._getBlockOccurrenceId(blockedSession, reader, next.get(blockedSession.session.sessionId));
        if (next.get(blockedSession.session.sessionId) !== occurrenceId) {
          next.set(blockedSession.session.sessionId, occurrenceId);
          changed = true;
        }
      }
      if (changed) {
        this._ignoredBlockOccurrences.set(next, void 0);
      }
    }));
    this._register(autorun((reader) => {
      if (!enabled) {
        return;
      }
      const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
      const modelBlocked = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
      const currentOccurrences = new Map(modelBlocked.map((blocked) => [
        blocked.session.sessionId,
        this._getBlockOccurrenceId(blocked, reader, ignoredOccurrences.get(blocked.session.sessionId))
      ]));
      const previousOccurrences = this._lastBlockedOccurrences;
      this._lastBlockedOccurrences = currentOccurrences;
      const visibleSessionIds = /* @__PURE__ */ new Set();
      for (const session of this._sessionsService.visibleSessions.read(reader)) {
        if (session) {
          visibleSessionIds.add(session.sessionId);
        }
      }
      for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
        if (currentOccurrences.get(sessionId) !== occurrenceId || visibleSessionIds.has(sessionId)) {
          this._pendingBlinkOccurrences.delete(sessionId);
        }
      }
      let queued = false;
      for (const blocked of modelBlocked) {
        const sessionId = blocked.session.sessionId;
        const occurrenceId = currentOccurrences.get(sessionId);
        if (previousOccurrences.get(sessionId) !== occurrenceId && !visibleSessionIds.has(sessionId)) {
          this._pendingBlinkOccurrences.set(sessionId, occurrenceId);
          queued = true;
        }
      }
      if (queued) {
        this._onDidRequestBlink.fire();
      }
    }));
  }
  /** The approval model, shared with the dropdown list so both agree on each session's pending action. */
  get approvalModel() {
    return this._approvalModel;
  }
  /** The CI-fix model, shared with the dropdown list so the fix action and the hide-while-fixing agree. */
  get ciFixModel() {
    return this._ciFixModel;
  }
  /**
   * Whether a fresh attention blink is pending. Returns `true` only when a session
   * queued as newly blocked is still in the surfaced (visible-filtered) blocked set,
   * so a blink queued while the pill was suppressed can't fire for a session that has
   * since become visible or unblocked. The pending queue is cleared as it is read so
   * a subsequent render won't replay the animation.
   */
  consumePendingBlink() {
    if (this._pendingBlinkOccurrences.size === 0) {
      return false;
    }
    const ignoredOccurrences = this._ignoredBlockOccurrences.get();
    const surfacedOccurrences = new Map(this.blockedSessions.get().map((blocked) => [
      blocked.session.sessionId,
      this._getBlockOccurrenceId(blocked, void 0, ignoredOccurrences.get(blocked.session.sessionId))
    ]));
    let shouldBlink = false;
    for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
      if (surfacedOccurrences.get(sessionId) === occurrenceId) {
        shouldBlink = true;
        break;
      }
    }
    this._pendingBlinkOccurrences.clear();
    return shouldBlink;
  }
  /** Ignore this session's current blocked occurrence. */
  ignoreSession(session) {
    const blocked = this._blockedSessionsModel.blockedSessionsWithReasons.get().find((entry) => entry.session.sessionId === session.sessionId);
    if (!blocked) {
      return;
    }
    this._ignoreOccurrence(blocked, this._getBlockOccurrenceId(blocked, void 0, this._ignoredBlockOccurrences.get().get(session.sessionId)));
  }
  /** Ignore every blocked occurrence currently surfaced by the indicator. */
  ignoreAllSessions() {
    const blockedSessions = this.blockedSessions.get();
    if (blockedSessions.length === 0) {
      return;
    }
    const next = new Map(this._ignoredBlockOccurrences.get());
    for (const blocked of blockedSessions) {
      next.set(blocked.session.sessionId, this._getBlockOccurrenceId(blocked, void 0, next.get(blocked.session.sessionId)));
    }
    this._ignoredBlockOccurrences.set(next, void 0);
  }
  /**
   * Remember that the user allowed this exact approval so the session drops out of
   * the blocked set immediately.
   */
  dismissApproval(approved) {
    const blocked = this._blockedSessionsModel.blockedSessionsWithReasons.get().find((entry) => entry.session.sessionId === approved.session.sessionId);
    if (!blocked || blocked.reason !== BlockedSessionReason.NeedsInput) {
      return;
    }
    this._ignoreOccurrence(blocked, this._approvalOccurrenceId(blocked, approved.approvalId));
  }
  /**
   * Build the requires-input pill label. A homogeneous set of blocked sessions
   * gets a specific, more actionable message; a mix (or an unclassified session)
   * falls back to the generic "N sessions require input".
   */
  getRequiresInputLabel(count, kind) {
    switch (kind) {
      case 0 /* TerminalApproval */:
        return count === 1 ? localize("oneSessionTerminalApproval", "1 session requires terminal approval") : localize("nSessionsTerminalApproval", "{0} sessions require terminal approval", count);
      case 1 /* Question */:
        return count === 1 ? localize("oneSessionQuestion", "1 session has a question") : localize("nSessionsQuestion", "{0} sessions have questions", count);
      case 2 /* FailingCI */:
        return count === 1 ? localize("oneSessionFailingCI", "1 session is failing CI") : localize("nSessionsFailingCI", "{0} sessions are failing CI", count);
      default:
        return count === 1 ? localize("oneSessionRequiresInput", "1 session requires input") : localize("nSessionsRequireInput", "{0} sessions require input", count);
    }
  }
  _ignoreOccurrence(blocked, occurrenceId) {
    const next = new Map(this._ignoredBlockOccurrences.get());
    next.set(blocked.session.sessionId, occurrenceId);
    this._ignoredBlockOccurrences.set(next, void 0);
  }
  _isBlockIgnored(blocked, ignoredOccurrences, reader) {
    const ignoredOccurrence = ignoredOccurrences.get(blocked.session.sessionId);
    return ignoredOccurrence !== void 0 && this._getBlockOccurrenceId(blocked, reader, ignoredOccurrence) === ignoredOccurrence;
  }
  _getBlockOccurrenceId(blocked, reader, ignoredOccurrence) {
    if (blocked.reason !== BlockedSessionReason.NeedsInput) {
      return blocked.occurrenceId;
    }
    const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
    if (approval) {
      return this._approvalOccurrenceId(blocked, agentSessionApprovalId(approval));
    }
    const approvalPrefix = this._approvalOccurrenceId(blocked, "");
    return ignoredOccurrence?.startsWith(approvalPrefix) ? ignoredOccurrence : blocked.occurrenceId;
  }
  _approvalOccurrenceId(blocked, approvalId) {
    return `${blocked.occurrenceId}:approval:${approvalId}`;
  }
  /**
   * Classify a single blocked session into a specific requires-input kind, or
   * `undefined` when it can't be classified (which forces the generic message).
   */
  _kindOf(blocked, reader) {
    switch (blocked.reason) {
      case BlockedSessionReason.FailingCI:
        return 2 /* FailingCI */;
      case BlockedSessionReason.NeedsInput: {
        const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
        switch (approval?.kind) {
          case AgentSessionApprovalKind.Terminal:
            return 0 /* TerminalApproval */;
          case AgentSessionApprovalKind.Question:
            return 1 /* Question */;
          default:
            return void 0;
        }
      }
      default:
        return void 0;
    }
  }
};
BlockedSessionsIndicatorModel = __decorateClass([
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IBlockedSessionsCIFixModel)
], BlockedSessionsIndicatorModel);
export {
  BlockedSessionsIndicatorModel,
  RequiresInputKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXGJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLCBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBhZ2VudFNlc3Npb25BcHByb3ZhbElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBCbG9ja2VkU2Vzc2lvblJlYXNvbiwgQmxvY2tlZFNlc3Npb25zLCBJQmxvY2tlZFNlc3Npb24gfSBmcm9tICcuLi8uLi9ibG9ja2VkU2Vzc2lvbnMvYnJvd3Nlci9ibG9ja2VkU2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCwgSUJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgfSBmcm9tICcuL2Jsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0Rmlyc3RBcHByb3ZhbEFjcm9zc0NoYXRzLCBJQXBwcm92ZWRTZXNzaW9uIH0gZnJvbSAnLi92aWV3cy9zZXNzaW9uc0xpc3QuanMnO1xuXG4vKipcbiAqIFRoZSBzcGVjaWZpYyByZWFzb24gYSBob21vZ2VuZW91cyBzZXQgb2YgYmxvY2tlZCBzZXNzaW9ucyBuZWVkcyBhdHRlbnRpb24sXG4gKiB1c2VkIHRvIHJlbmRlciBhIG1vcmUgaGVscGZ1bCByZXF1aXJlcy1pbnB1dCBtZXNzYWdlLiBgdW5kZWZpbmVkYCAoYSBtaXggb2ZcbiAqIHJlYXNvbnMsIG9yIGFuIGluZGV0ZXJtaW5hdGUgb25lKSBmYWxscyBiYWNrIHRvIHRoZSBnZW5lcmljIG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFJlcXVpcmVzSW5wdXRLaW5kIHtcblx0LyoqIEFsbCBzZXNzaW9ucyBhcmUgd2FpdGluZyB0byBydW4gYSB0ZXJtaW5hbCBjb21tYW5kLiAqL1xuXHRUZXJtaW5hbEFwcHJvdmFsLFxuXHQvKiogQWxsIHNlc3Npb25zIGFyZSBhc2tpbmcgdGhlIHVzZXIgYSBxdWVzdGlvbi4gKi9cblx0UXVlc3Rpb24sXG5cdC8qKiBBbGwgc2Vzc2lvbnMgaGF2ZSBmYWlsaW5nIENJIGNoZWNrcy4gKi9cblx0RmFpbGluZ0NJLFxufVxuXG4vKipcbiAqIE1vZGVsIGJlaGluZCB0aGUgc2Vzc2lvbnMgdGl0bGUgYmFyJ3MgXCJOIHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIiBpbmRpY2F0b3IuXG4gKlxuICogSXQgcmVmaW5lcyB0aGUgcmF3IHtAbGluayBCbG9ja2VkU2Vzc2lvbnN9IHNldCBpbnRvIHdoYXQgdGhlIHRpdGxlIGJhciBzaG91bGRcbiAqIGFjdHVhbGx5IHN1cmZhY2U6IHZpc2libGUgYW5kIGV4cGxpY2l0bHkgaWdub3JlZCBvY2N1cnJlbmNlcyBhcmUgYWNrbm93bGVkZ2VkLFxuICogYXBwcm92YWxzIGFyZSBkaXNtaXNzZWQgb3B0aW1pc3RpY2FsbHksIGFuZCBsYXRlciBvY2N1cnJlbmNlcyBzdXJmYWNlIGFnYWluLlxuICpcbiAqIEJsaW5rIGRldGVjdGlvbiBrZXlzIG9mZiBibG9ja2VkIG9jY3VycmVuY2VzLCBzbyBuYXZpZ2F0aW9uIGNhbiBhY2tub3dsZWRnZSBhXG4gKiBibG9jayBidXQgbmV2ZXIgY3JlYXRlcyBvbmUuXG4gKlxuICogVGhlIERPTSByZW5kZXJpbmcgb2YgdGhlIGluZGljYXRvciBsaXZlcyBpbiB0aGUgdGl0bGUgYmFyIHdpZGdldDsgdGhpcyBjbGFzcyBpc1xuICogRE9NLWZyZWUgc28gaXQgY2FuIGJlIHVuaXQgdGVzdGVkIGluIGlzb2xhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIEJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqIENvbXB1dGVzIHRoZSByYXcgc2V0IG9mIGJsb2NrZWQgc2Vzc2lvbnMgKG5lZWRzIGlucHV0IC8gZmFpbGluZyBDSSkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jsb2NrZWRTZXNzaW9uc01vZGVsOiBCbG9ja2VkU2Vzc2lvbnM7XG5cblx0LyoqIFRyYWNrcyBwZW5kaW5nIHRvb2wgYXBwcm92YWxzIHBlciBjaGF0OyBkaXN0aW5ndWlzaGVzIHRlcm1pbmFsIHZzIHF1ZXN0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsO1xuXG5cdC8qKiBUaGUgYXBwcm92YWwgbW9kZWwsIHNoYXJlZCB3aXRoIHRoZSBkcm9wZG93biBsaXN0IHNvIGJvdGggYWdyZWUgb24gZWFjaCBzZXNzaW9uJ3MgcGVuZGluZyBhY3Rpb24uICovXG5cdGdldCBhcHByb3ZhbE1vZGVsKCk6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9hcHByb3ZhbE1vZGVsO1xuXHR9XG5cblx0LyoqIERyaXZlcyB0aGUgcGVyLXNlc3Npb24gXCJGaXggQ0lcIiByb3c7IHNoYXJlZCB3aXRoIHRoZSBkcm9wZG93biBsaXN0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaUZpeE1vZGVsOiBJQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbDtcblxuXHQvKiogVGhlIENJLWZpeCBtb2RlbCwgc2hhcmVkIHdpdGggdGhlIGRyb3Bkb3duIGxpc3Qgc28gdGhlIGZpeCBhY3Rpb24gYW5kIHRoZSBoaWRlLXdoaWxlLWZpeGluZyBhZ3JlZS4gKi9cblx0Z2V0IGNpRml4TW9kZWwoKTogSUJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9jaUZpeE1vZGVsO1xuXHR9XG5cblx0LyoqIEN1cnJlbnQgYmxvY2tlZCBvY2N1cnJlbmNlcyB0aGUgdXNlciBoYXMgYWxyZWFkeSBhY2tub3dsZWRnZWQsIGtleWVkIGJ5IHNlc3Npb24gaWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzID0gb2JzZXJ2YWJsZVZhbHVlPFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPj4oJ2lnbm9yZWRCbG9ja09jY3VycmVuY2VzJywgbmV3IE1hcCgpKTtcblxuXHQvKipcblx0ICogQmxvY2tlZCBzZXNzaW9ucyB0aGF0IGFyZSBub3QgdmlzaWJsZSwgaWdub3JlZCwgYmVpbmcgZml4ZWQsIG9yIGFscmVhZHkgYXBwcm92ZWQuXG5cdCAqIFZpc2libGUgYmxvY2tlZCBvY2N1cnJlbmNlcyBzdGF5IGFja25vd2xlZGdlZCBhZnRlciB0aGUgdXNlciBuYXZpZ2F0ZXMgYXdheS5cblx0ICovXG5cdHJlYWRvbmx5IGJsb2NrZWRTZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUJsb2NrZWRTZXNzaW9uW10+O1xuXG5cdC8qKlxuXHQgKiBUaGUgaG9tb2dlbmVvdXMgcmVhc29uIHRoZSBibG9ja2VkIHNlc3Npb25zIG5lZWQgYXR0ZW50aW9uIChhbGwgdGVybWluYWxcblx0ICogYXBwcm92YWxzLCBhbGwgZmFpbGluZyBDSSwgZXRjLiksIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhleSBhcmUgYSBtaXggXHUyMDE0IHdoaWNoXG5cdCAqIGRyaXZlcyB3aGV0aGVyIGEgc3BlY2lmaWMgb3IgdGhlIGdlbmVyaWMgcmVxdWlyZXMtaW5wdXQgbWVzc2FnZSBpcyBzaG93bi5cblx0ICovXG5cdHJlYWRvbmx5IHJlcXVpcmVzSW5wdXRLaW5kOiBJT2JzZXJ2YWJsZTxSZXF1aXJlc0lucHV0S2luZCB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIExhdGVzdCBibG9ja2VkIG9jY3VycmVuY2UgcGVyIHNlc3Npb24sIGluZGVwZW5kZW50IG9mIHZpc2liaWxpdHkuIFVzZWQgc28gdGhlXG5cdCAqIGF0dGVudGlvbiBibGluayBvbmx5IGZpcmVzIGZvciBhIGdlbnVpbmVseSBuZXcgaW5wdXQgcmVxdWVzdCBvciBDSSBmYWlsdXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdEJsb2NrZWRPY2N1cnJlbmNlczogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuXG5cdC8qKlxuXHQgKiBOb3QteWV0LXZpc2libGUgYmxvY2tlZCBvY2N1cnJlbmNlcyB3aG9zZSBhdHRlbnRpb24gYmxpbmsgaGFzIG5vdCBwbGF5ZWQgeWV0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0JsaW5rT2NjdXJyZW5jZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdEJsaW5rID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGEgZ2VudWluZWx5IG5ldywgbm90LXlldC12aXNpYmxlIHNlc3Npb24gYmVjb21lcyBibG9ja2VkIGFuZCB0aGVcblx0ICogaW5kaWNhdG9yIHNob3VsZCBwbGF5IGl0cyBhdHRlbnRpb24gYmxpbmsuIENvbnN1bWVycyBzaG91bGQgcmUtcmVuZGVyIGFuZFxuXHQgKiBjYWxsIHtAbGluayBjb25zdW1lUGVuZGluZ0JsaW5rfS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdEJsaW5rOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmVxdWVzdEJsaW5rLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFwcHJvdmFsTW9kZWw6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0YmxvY2tlZFNlc3Npb25zOiBCbG9ja2VkU2Vzc2lvbnMgfCB1bmRlZmluZWQsXG5cdFx0Y2lGaXhNb2RlbDogQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgc2hhcmVkQ0lGaXhNb2RlbDogSUJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBUaGUgbW9kZWwgb3ducyB0aGUgYXBwcm92YWwgYW5kIGJsb2NrZWQtc2Vzc2lvbiBtb2RlbHMgaXQgY3JlYXRlcy4gVGhlIENJLWZpeFxuXHRcdC8vIG1vZGVsIGlzIGEgc2hhcmVkIHNlcnZpY2Ugc28gZXZlcnkgc3VyZmFjZSB1c2VzIG9uZSBpbi1mbGlnaHQgc3VibWlzc2lvbiBndWFyZC5cblx0XHQvLyBPcHRpb25hbCBwYXJhbWV0ZXJzIHJlbWFpbiB0ZXN0IHNlYW1zIGZvciBmaXh0dXJlcyB0byBzdXBwbHkgcHJlc2V0IGluc3RhbmNlcy5cblx0XHR0aGlzLl9hcHByb3ZhbE1vZGVsID0gYXBwcm92YWxNb2RlbCA/PyB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsKSk7XG5cdFx0dGhpcy5fYmxvY2tlZFNlc3Npb25zTW9kZWwgPSBibG9ja2VkU2Vzc2lvbnMgPz8gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmxvY2tlZFNlc3Npb25zKSk7XG5cdFx0dGhpcy5fY2lGaXhNb2RlbCA9IGNpRml4TW9kZWwgPz8gc2hhcmVkQ0lGaXhNb2RlbDtcblxuXHRcdC8vIFRoZSBibG9ja2VkLXNlc3Npb25zIGZlYXR1cmUgaXMgb25seSBlbmFibGVkIG91dHNpZGUgb2Ygc3RhYmxlIGJ1aWxkcy5cblx0XHRjb25zdCBlbmFibGVkID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZSc7XG5cblx0XHQvLyBBIHNlc3Npb24gdGhhdCBpcyBjdXJyZW50bHkgdmlzaWJsZSBvbiBzY3JlZW4gaXMgbm90IHRyZWF0ZWQgYXMgYmxvY2tlZDpcblx0XHQvLyBleGNsdWRlIHZpc2libGUgc2Vzc2lvbnMgZnJvbSB0aGUgcmVxdWlyZXMtaW5wdXQgaW5kaWNhdG9yIGFuZCB0aGUgZHJvcGRvd24uXG5cdFx0dGhpcy5ibG9ja2VkU2Vzc2lvbnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdHZpc2libGVTZXNzaW9uSWRzLmFkZChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGlnbm9yZWRPY2N1cnJlbmNlcyA9IHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIFNlc3Npb25zIHdob3NlIENJIGZpeCBpcyBiZWluZyBzdWJtaXR0ZWQgaW4gdGhlIGJhY2tncm91bmQgYXJlIGhpZGRlblxuXHRcdFx0Ly8gaW1tZWRpYXRlbHkgKGJlZm9yZSB0aGVpciBzdGF0dXMgZmxpcHMgdG8gaW4tcHJvZ3Jlc3MpIHNvIHRoZSByb3dcblx0XHRcdC8vIGRpc2FwcGVhcnMgdGhlIG1vbWVudCB0aGUgdXNlciBjbGlja3MgXCJGaXggQ0lcIi5cblx0XHRcdGNvbnN0IGNpRml4SGlkZGVuID0gdGhpcy5fY2lGaXhNb2RlbC5oaWRkZW5TZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYmxvY2tlZFNlc3Npb25zTW9kZWwuYmxvY2tlZFNlc3Npb25zV2l0aFJlYXNvbnMucmVhZChyZWFkZXIpXG5cdFx0XHRcdC5maWx0ZXIoYmxvY2tlZCA9PiAhdmlzaWJsZVNlc3Npb25JZHMuaGFzKGJsb2NrZWQuc2Vzc2lvbi5zZXNzaW9uSWQpXG5cdFx0XHRcdFx0JiYgIWNpRml4SGlkZGVuLmhhcyhibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkKVxuXHRcdFx0XHRcdCYmICF0aGlzLl9pc0Jsb2NrSWdub3JlZChibG9ja2VkLCBpZ25vcmVkT2NjdXJyZW5jZXMsIHJlYWRlcikpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVGhlIGhvbW9nZW5lb3VzIHJlYXNvbiBhY3Jvc3MgYWxsIGJsb2NrZWQgc2Vzc2lvbnMgKG9yIGB1bmRlZmluZWRgIGZvciBhXG5cdFx0Ly8gbWl4KSwgcmVmaW5pbmcgYE5lZWRzSW5wdXRgIGludG8gdGVybWluYWwtYXBwcm92YWwgdnMgcXVlc3Rpb24gdmlhIHRoZVxuXHRcdC8vIGFwcHJvdmFsIG1vZGVsLiBEcml2ZXMgdGhlIHNwZWNpZmljIHJlcXVpcmVzLWlucHV0IG1lc3NhZ2UuXG5cdFx0dGhpcy5yZXF1aXJlc0lucHV0S2luZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGJsb2NrZWQgPSB0aGlzLmJsb2NrZWRTZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoYmxvY2tlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGxldCBjb21tb246IFJlcXVpcmVzSW5wdXRLaW5kIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGhhc0NvbW1vbiA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBibG9ja2VkKSB7XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSB0aGlzLl9raW5kT2YoZW50cnksIHJlYWRlcik7XG5cdFx0XHRcdGlmIChraW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghaGFzQ29tbW9uKSB7XG5cdFx0XHRcdFx0Y29tbW9uID0ga2luZDtcblx0XHRcdFx0XHRoYXNDb21tb24gPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvbW1vbiAhPT0ga2luZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBjb21tb247XG5cdFx0fSk7XG5cblx0XHQvLyBBIHZpc2libGUgYmxvY2tlZCBzZXNzaW9uIGhhcyBiZWVuIGFja25vd2xlZGdlZC4gS2VlcCB0aGF0IG9jY3VycmVuY2Vcblx0XHQvLyBpZ25vcmVkIGFmdGVyIG5hdmlnYXRpb24sIGFuZCBjbGVhciBzdGFsZSBpZ25vcmVzIHdoZW4gYSBuZXcgYmxvY2sgYXBwZWFycy5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmxvY2tlZFNlc3Npb25zID0gdGhpcy5fYmxvY2tlZFNlc3Npb25zTW9kZWwuYmxvY2tlZFNlc3Npb25zV2l0aFJlYXNvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYmxvY2tlZEJ5SWQgPSBuZXcgTWFwKGJsb2NrZWRTZXNzaW9ucy5tYXAoZW50cnkgPT4gW2VudHJ5LnNlc3Npb24uc2Vzc2lvbklkLCBlbnRyeV0gYXMgY29uc3QpKTtcblx0XHRcdGNvbnN0IHZpc2libGVTZXNzaW9uSWRzID0gbmV3IFNldCh0aGlzLl9zZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKS5maWx0ZXIoc2Vzc2lvbiA9PiBzZXNzaW9uICE9PSB1bmRlZmluZWQpLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSk7XG5cdFx0XHRjb25zdCBpZ25vcmVkT2NjdXJyZW5jZXMgPSB0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBuZXh0ID0gbmV3IE1hcChpZ25vcmVkT2NjdXJyZW5jZXMpO1xuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblxuXHRcdFx0Zm9yIChjb25zdCBbc2Vzc2lvbklkLCBpZ25vcmVkT2NjdXJyZW5jZV0gb2YgaWdub3JlZE9jY3VycmVuY2VzKSB7XG5cdFx0XHRcdGNvbnN0IGJsb2NrZWRTZXNzaW9uID0gYmxvY2tlZEJ5SWQuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRcdGlmICghYmxvY2tlZFNlc3Npb24gfHwgdGhpcy5fZ2V0QmxvY2tPY2N1cnJlbmNlSWQoYmxvY2tlZFNlc3Npb24sIHJlYWRlciwgaWdub3JlZE9jY3VycmVuY2UpICE9PSBpZ25vcmVkT2NjdXJyZW5jZSkge1xuXHRcdFx0XHRcdG5leHQuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBibG9ja2VkU2Vzc2lvbiBvZiBibG9ja2VkQnlJZC52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAoIXZpc2libGVTZXNzaW9uSWRzLmhhcyhibG9ja2VkU2Vzc2lvbi5zZXNzaW9uLnNlc3Npb25JZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBvY2N1cnJlbmNlSWQgPSB0aGlzLl9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkU2Vzc2lvbiwgcmVhZGVyLCBuZXh0LmdldChibG9ja2VkU2Vzc2lvbi5zZXNzaW9uLnNlc3Npb25JZCkpO1xuXHRcdFx0XHRpZiAobmV4dC5nZXQoYmxvY2tlZFNlc3Npb24uc2Vzc2lvbi5zZXNzaW9uSWQpICE9PSBvY2N1cnJlbmNlSWQpIHtcblx0XHRcdFx0XHRuZXh0LnNldChibG9ja2VkU2Vzc2lvbi5zZXNzaW9uLnNlc3Npb25JZCwgb2NjdXJyZW5jZUlkKTtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEcml2ZSB0aGUgYXR0ZW50aW9uIGJsaW5rLiBHYXRlZCBvbiBhIGJsb2NrZWQtc2V0IGRpZmYsIHNvIGEgdmlzaWJpbGl0eS1vbmx5XG5cdFx0Ly8gY2hhbmdlIGNhbiBvbmx5IGV2ZXIgZHJvcCBhIHBlbmRpbmcgYmxpbmssIG5ldmVyIHN0YXJ0IG9uZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWdub3JlZE9jY3VycmVuY2VzID0gdGhpcy5faWdub3JlZEJsb2NrT2NjdXJyZW5jZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbW9kZWxCbG9ja2VkID0gdGhpcy5fYmxvY2tlZFNlc3Npb25zTW9kZWwuYmxvY2tlZFNlc3Npb25zV2l0aFJlYXNvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY3VycmVudE9jY3VycmVuY2VzID0gbmV3IE1hcChtb2RlbEJsb2NrZWQubWFwKGJsb2NrZWQgPT4gW1xuXHRcdFx0XHRibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0XHR0aGlzLl9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkLCByZWFkZXIsIGlnbm9yZWRPY2N1cnJlbmNlcy5nZXQoYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCkpLFxuXHRcdFx0XSBhcyBjb25zdCkpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNPY2N1cnJlbmNlcyA9IHRoaXMuX2xhc3RCbG9ja2VkT2NjdXJyZW5jZXM7XG5cdFx0XHR0aGlzLl9sYXN0QmxvY2tlZE9jY3VycmVuY2VzID0gY3VycmVudE9jY3VycmVuY2VzO1xuXG5cdFx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdFx0dmlzaWJsZVNlc3Npb25JZHMuYWRkKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEcm9wIHF1ZXVlZCBibGlua3MgZm9yIHNlc3Npb25zIHRoYXQgdW5ibG9ja2VkIG9yIHRoYXQgdGhlIHVzZXIgY2FuIG5vdyBzZWUuXG5cdFx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uSWQsIG9jY3VycmVuY2VJZF0gb2YgdGhpcy5fcGVuZGluZ0JsaW5rT2NjdXJyZW5jZXMpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRPY2N1cnJlbmNlcy5nZXQoc2Vzc2lvbklkKSAhPT0gb2NjdXJyZW5jZUlkIHx8IHZpc2libGVTZXNzaW9uSWRzLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0JsaW5rT2NjdXJyZW5jZXMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBhIGdlbnVpbmVseSBuZXcgYmxvY2sgdGhlIHVzZXIgY2Fubm90IGFscmVhZHkgc2VlIHF1ZXVlcyBhIGJsaW5rLlxuXHRcdFx0bGV0IHF1ZXVlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBibG9ja2VkIG9mIG1vZGVsQmxvY2tlZCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkO1xuXHRcdFx0XHRjb25zdCBvY2N1cnJlbmNlSWQgPSBjdXJyZW50T2NjdXJyZW5jZXMuZ2V0KHNlc3Npb25JZCkhO1xuXHRcdFx0XHRpZiAocHJldmlvdXNPY2N1cnJlbmNlcy5nZXQoc2Vzc2lvbklkKSAhPT0gb2NjdXJyZW5jZUlkICYmICF2aXNpYmxlU2Vzc2lvbklkcy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdCbGlua09jY3VycmVuY2VzLnNldChzZXNzaW9uSWQsIG9jY3VycmVuY2VJZCk7XG5cdFx0XHRcdFx0cXVldWVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHF1ZXVlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RCbGluay5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBmcmVzaCBhdHRlbnRpb24gYmxpbmsgaXMgcGVuZGluZy4gUmV0dXJucyBgdHJ1ZWAgb25seSB3aGVuIGEgc2Vzc2lvblxuXHQgKiBxdWV1ZWQgYXMgbmV3bHkgYmxvY2tlZCBpcyBzdGlsbCBpbiB0aGUgc3VyZmFjZWQgKHZpc2libGUtZmlsdGVyZWQpIGJsb2NrZWQgc2V0LFxuXHQgKiBzbyBhIGJsaW5rIHF1ZXVlZCB3aGlsZSB0aGUgcGlsbCB3YXMgc3VwcHJlc3NlZCBjYW4ndCBmaXJlIGZvciBhIHNlc3Npb24gdGhhdCBoYXNcblx0ICogc2luY2UgYmVjb21lIHZpc2libGUgb3IgdW5ibG9ja2VkLiBUaGUgcGVuZGluZyBxdWV1ZSBpcyBjbGVhcmVkIGFzIGl0IGlzIHJlYWQgc29cblx0ICogYSBzdWJzZXF1ZW50IHJlbmRlciB3b24ndCByZXBsYXkgdGhlIGFuaW1hdGlvbi5cblx0ICovXG5cdGNvbnN1bWVQZW5kaW5nQmxpbmsoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdCbGlua09jY3VycmVuY2VzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaWdub3JlZE9jY3VycmVuY2VzID0gdGhpcy5faWdub3JlZEJsb2NrT2NjdXJyZW5jZXMuZ2V0KCk7XG5cdFx0Y29uc3Qgc3VyZmFjZWRPY2N1cnJlbmNlcyA9IG5ldyBNYXAodGhpcy5ibG9ja2VkU2Vzc2lvbnMuZ2V0KCkubWFwKGJsb2NrZWQgPT4gW1xuXHRcdFx0YmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdHRoaXMuX2dldEJsb2NrT2NjdXJyZW5jZUlkKGJsb2NrZWQsIHVuZGVmaW5lZCwgaWdub3JlZE9jY3VycmVuY2VzLmdldChibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkKSksXG5cdFx0XSBhcyBjb25zdCkpO1xuXHRcdGxldCBzaG91bGRCbGluayA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25JZCwgb2NjdXJyZW5jZUlkXSBvZiB0aGlzLl9wZW5kaW5nQmxpbmtPY2N1cnJlbmNlcykge1xuXHRcdFx0aWYgKHN1cmZhY2VkT2NjdXJyZW5jZXMuZ2V0KHNlc3Npb25JZCkgPT09IG9jY3VycmVuY2VJZCkge1xuXHRcdFx0XHRzaG91bGRCbGluayA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nQmxpbmtPY2N1cnJlbmNlcy5jbGVhcigpO1xuXHRcdHJldHVybiBzaG91bGRCbGluaztcblx0fVxuXG5cdC8qKiBJZ25vcmUgdGhpcyBzZXNzaW9uJ3MgY3VycmVudCBibG9ja2VkIG9jY3VycmVuY2UuICovXG5cdGlnbm9yZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBibG9ja2VkID0gdGhpcy5fYmxvY2tlZFNlc3Npb25zTW9kZWwuYmxvY2tlZFNlc3Npb25zV2l0aFJlYXNvbnMuZ2V0KCkuZmluZChlbnRyeSA9PiBlbnRyeS5zZXNzaW9uLnNlc3Npb25JZCA9PT0gc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGlmICghYmxvY2tlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pZ25vcmVPY2N1cnJlbmNlKGJsb2NrZWQsIHRoaXMuX2dldEJsb2NrT2NjdXJyZW5jZUlkKGJsb2NrZWQsIHVuZGVmaW5lZCwgdGhpcy5faWdub3JlZEJsb2NrT2NjdXJyZW5jZXMuZ2V0KCkuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKSkpO1xuXHR9XG5cblx0LyoqIElnbm9yZSBldmVyeSBibG9ja2VkIG9jY3VycmVuY2UgY3VycmVudGx5IHN1cmZhY2VkIGJ5IHRoZSBpbmRpY2F0b3IuICovXG5cdGlnbm9yZUFsbFNlc3Npb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGJsb2NrZWRTZXNzaW9ucyA9IHRoaXMuYmxvY2tlZFNlc3Npb25zLmdldCgpO1xuXHRcdGlmIChibG9ja2VkU2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLmdldCgpKTtcblx0XHRmb3IgKGNvbnN0IGJsb2NrZWQgb2YgYmxvY2tlZFNlc3Npb25zKSB7XG5cdFx0XHRuZXh0LnNldChibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkLCB0aGlzLl9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkLCB1bmRlZmluZWQsIG5leHQuZ2V0KGJsb2NrZWQuc2Vzc2lvbi5zZXNzaW9uSWQpKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbWVtYmVyIHRoYXQgdGhlIHVzZXIgYWxsb3dlZCB0aGlzIGV4YWN0IGFwcHJvdmFsIHNvIHRoZSBzZXNzaW9uIGRyb3BzIG91dCBvZlxuXHQgKiB0aGUgYmxvY2tlZCBzZXQgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRkaXNtaXNzQXBwcm92YWwoYXBwcm92ZWQ6IElBcHByb3ZlZFNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBibG9ja2VkID0gdGhpcy5fYmxvY2tlZFNlc3Npb25zTW9kZWwuYmxvY2tlZFNlc3Npb25zV2l0aFJlYXNvbnMuZ2V0KCkuZmluZChlbnRyeSA9PiBlbnRyeS5zZXNzaW9uLnNlc3Npb25JZCA9PT0gYXBwcm92ZWQuc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGlmICghYmxvY2tlZCB8fCBibG9ja2VkLnJlYXNvbiAhPT0gQmxvY2tlZFNlc3Npb25SZWFzb24uTmVlZHNJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pZ25vcmVPY2N1cnJlbmNlKGJsb2NrZWQsIHRoaXMuX2FwcHJvdmFsT2NjdXJyZW5jZUlkKGJsb2NrZWQsIGFwcHJvdmVkLmFwcHJvdmFsSWQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgcmVxdWlyZXMtaW5wdXQgcGlsbCBsYWJlbC4gQSBob21vZ2VuZW91cyBzZXQgb2YgYmxvY2tlZCBzZXNzaW9uc1xuXHQgKiBnZXRzIGEgc3BlY2lmaWMsIG1vcmUgYWN0aW9uYWJsZSBtZXNzYWdlOyBhIG1peCAob3IgYW4gdW5jbGFzc2lmaWVkIHNlc3Npb24pXG5cdCAqIGZhbGxzIGJhY2sgdG8gdGhlIGdlbmVyaWMgXCJOIHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIi5cblx0ICovXG5cdGdldFJlcXVpcmVzSW5wdXRMYWJlbChjb3VudDogbnVtYmVyLCBraW5kOiBSZXF1aXJlc0lucHV0S2luZCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIFJlcXVpcmVzSW5wdXRLaW5kLlRlcm1pbmFsQXBwcm92YWw6XG5cdFx0XHRcdHJldHVybiBjb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ29uZVNlc3Npb25UZXJtaW5hbEFwcHJvdmFsJywgXCIxIHNlc3Npb24gcmVxdWlyZXMgdGVybWluYWwgYXBwcm92YWxcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCduU2Vzc2lvbnNUZXJtaW5hbEFwcHJvdmFsJywgXCJ7MH0gc2Vzc2lvbnMgcmVxdWlyZSB0ZXJtaW5hbCBhcHByb3ZhbFwiLCBjb3VudCk7XG5cdFx0XHRjYXNlIFJlcXVpcmVzSW5wdXRLaW5kLlF1ZXN0aW9uOlxuXHRcdFx0XHRyZXR1cm4gY291bnQgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdvbmVTZXNzaW9uUXVlc3Rpb24nLCBcIjEgc2Vzc2lvbiBoYXMgYSBxdWVzdGlvblwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ25TZXNzaW9uc1F1ZXN0aW9uJywgXCJ7MH0gc2Vzc2lvbnMgaGF2ZSBxdWVzdGlvbnNcIiwgY291bnQpO1xuXHRcdFx0Y2FzZSBSZXF1aXJlc0lucHV0S2luZC5GYWlsaW5nQ0k6XG5cdFx0XHRcdHJldHVybiBjb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ29uZVNlc3Npb25GYWlsaW5nQ0knLCBcIjEgc2Vzc2lvbiBpcyBmYWlsaW5nIENJXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnblNlc3Npb25zRmFpbGluZ0NJJywgXCJ7MH0gc2Vzc2lvbnMgYXJlIGZhaWxpbmcgQ0lcIiwgY291bnQpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnb25lU2Vzc2lvblJlcXVpcmVzSW5wdXQnLCBcIjEgc2Vzc2lvbiByZXF1aXJlcyBpbnB1dFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ25TZXNzaW9uc1JlcXVpcmVJbnB1dCcsIFwiezB9IHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIiwgY291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lnbm9yZU9jY3VycmVuY2UoYmxvY2tlZDogSUJsb2NrZWRTZXNzaW9uLCBvY2N1cnJlbmNlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLmdldCgpKTtcblx0XHRuZXh0LnNldChibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkLCBvY2N1cnJlbmNlSWQpO1xuXHRcdHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNCbG9ja0lnbm9yZWQoYmxvY2tlZDogSUJsb2NrZWRTZXNzaW9uLCBpZ25vcmVkT2NjdXJyZW5jZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPiwgcmVhZGVyOiBJUmVhZGVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaWdub3JlZE9jY3VycmVuY2UgPSBpZ25vcmVkT2NjdXJyZW5jZXMuZ2V0KGJsb2NrZWQuc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHJldHVybiBpZ25vcmVkT2NjdXJyZW5jZSAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2dldEJsb2NrT2NjdXJyZW5jZUlkKGJsb2NrZWQsIHJlYWRlciwgaWdub3JlZE9jY3VycmVuY2UpID09PSBpZ25vcmVkT2NjdXJyZW5jZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJsb2NrT2NjdXJyZW5jZUlkKGJsb2NrZWQ6IElCbG9ja2VkU2Vzc2lvbiwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkLCBpZ25vcmVkT2NjdXJyZW5jZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKGJsb2NrZWQucmVhc29uICE9PSBCbG9ja2VkU2Vzc2lvblJlYXNvbi5OZWVkc0lucHV0KSB7XG5cdFx0XHRyZXR1cm4gYmxvY2tlZC5vY2N1cnJlbmNlSWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFwcHJvdmFsID0gZ2V0Rmlyc3RBcHByb3ZhbEFjcm9zc0NoYXRzKHRoaXMuX2FwcHJvdmFsTW9kZWwsIGJsb2NrZWQuc2Vzc2lvbiwgcmVhZGVyKTtcblx0XHRpZiAoYXBwcm92YWwpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hcHByb3ZhbE9jY3VycmVuY2VJZChibG9ja2VkLCBhZ2VudFNlc3Npb25BcHByb3ZhbElkKGFwcHJvdmFsKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFwcHJvdmFsUHJlZml4ID0gdGhpcy5fYXBwcm92YWxPY2N1cnJlbmNlSWQoYmxvY2tlZCwgJycpO1xuXHRcdHJldHVybiBpZ25vcmVkT2NjdXJyZW5jZT8uc3RhcnRzV2l0aChhcHByb3ZhbFByZWZpeCkgPyBpZ25vcmVkT2NjdXJyZW5jZSA6IGJsb2NrZWQub2NjdXJyZW5jZUlkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwcm92YWxPY2N1cnJlbmNlSWQoYmxvY2tlZDogSUJsb2NrZWRTZXNzaW9uLCBhcHByb3ZhbElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtibG9ja2VkLm9jY3VycmVuY2VJZH06YXBwcm92YWw6JHthcHByb3ZhbElkfWA7XG5cdH1cblxuXHQvKipcblx0ICogQ2xhc3NpZnkgYSBzaW5nbGUgYmxvY2tlZCBzZXNzaW9uIGludG8gYSBzcGVjaWZpYyByZXF1aXJlcy1pbnB1dCBraW5kLCBvclxuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIGl0IGNhbid0IGJlIGNsYXNzaWZpZWQgKHdoaWNoIGZvcmNlcyB0aGUgZ2VuZXJpYyBtZXNzYWdlKS5cblx0ICovXG5cdHByaXZhdGUgX2tpbmRPZihibG9ja2VkOiBJQmxvY2tlZFNlc3Npb24sIHJlYWRlcjogSVJlYWRlcik6IFJlcXVpcmVzSW5wdXRLaW5kIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKGJsb2NrZWQucmVhc29uKSB7XG5cdFx0XHRjYXNlIEJsb2NrZWRTZXNzaW9uUmVhc29uLkZhaWxpbmdDSTpcblx0XHRcdFx0cmV0dXJuIFJlcXVpcmVzSW5wdXRLaW5kLkZhaWxpbmdDSTtcblx0XHRcdGNhc2UgQmxvY2tlZFNlc3Npb25SZWFzb24uTmVlZHNJbnB1dDoge1xuXHRcdFx0XHRjb25zdCBhcHByb3ZhbCA9IGdldEZpcnN0QXBwcm92YWxBY3Jvc3NDaGF0cyh0aGlzLl9hcHByb3ZhbE1vZGVsLCBibG9ja2VkLnNlc3Npb24sIHJlYWRlcik7XG5cdFx0XHRcdHN3aXRjaCAoYXBwcm92YWw/LmtpbmQpIHtcblx0XHRcdFx0XHRjYXNlIEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbDpcblx0XHRcdFx0XHRcdHJldHVybiBSZXF1aXJlc0lucHV0S2luZC5UZXJtaW5hbEFwcHJvdmFsO1xuXHRcdFx0XHRcdGNhc2UgQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlF1ZXN0aW9uOlxuXHRcdFx0XHRcdFx0cmV0dXJuIFJlcXVpcmVzSW5wdXRLaW5kLlF1ZXN0aW9uO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsU0FBUyxTQUErQix1QkFBdUI7QUFDeEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEIsMkJBQTJCLDhCQUE4QjtBQUM1RixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHNCQUFzQix1QkFBd0M7QUFDdkUsU0FBb0Msa0NBQWtDO0FBQ3RFLFNBQVMsbUNBQXFEO0FBT3ZELElBQVcsb0JBQVgsa0JBQVdBLHVCQUFYO0FBRU4sRUFBQUEsc0NBQUE7QUFFQSxFQUFBQSxzQ0FBQTtBQUVBLEVBQUFBLHNDQUFBO0FBTmlCLFNBQUFBO0FBQUEsR0FBQTtBQXNCWCxJQUFNLGdDQUFOLGNBQTRDLFdBQVc7QUFBQSxFQXdEN0QsWUFDQyxl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
