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
import * as dom from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { autorun, derived, observableSignalFromEvent, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { IGitHubService } from "../../github/browser/githubService.js";
import { GitHubCheckStatus } from "../../github/common/types.js";
import { FIX_CI_CHECKS_COMMAND_ID, getFailedChecks, REVEAL_CI_CHECKS_COMMAND_ID } from "../../changes/browser/checksActions.js";
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "../../agentFeedback/browser/agentFeedbackService.js";
import { SessionInputBannerWidget } from "./sessionInputBannerWidget.js";
const STORAGE_KEY_CI_DISMISSED = "sessions.inputBanners.ci.dismissed";
const STORAGE_KEY_COMMENTS_DISMISSED = "sessions.inputBanners.comments.dismissed";
const REVIEWABLE_KINDS = /* @__PURE__ */ new Set([AgentFeedbackKind.PRReview, AgentFeedbackKind.AgentReview]);
let SessionInputBanners = class extends Disposable {
  constructor(sessionsService, gitHubService, feedbackService, commandService, storageService, instantiationService, logService) {
    super();
    this.sessionsService = sessionsService;
    this.gitHubService = gitHubService;
    this.feedbackService = feedbackService;
    this.commandService = commandService;
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this._ciContent = this._register(new MutableDisposable());
    this._commentsContent = this._register(new MutableDisposable());
    this._active = observableValue(this, false);
    this._debugData = observableValue(this, void 0);
    this._ciDismissed = observableValue(this, /* @__PURE__ */ new Set());
    this._commentsDismissed = observableValue(this, /* @__PURE__ */ new Set());
    /**
     * The session whose banners should be shown, or undefined when inactive or
     * while the session/chat is still in progress. Banners only surface once the
     * session has completed so they don't distract from a running agent.
     */
    this._session = derived(this, (reader) => {
      if (!this._active.read(reader)) {
        return void 0;
      }
      const session = this.sessionsService.activeSession.read(reader);
      if (!session || session.status.read(reader) !== SessionStatus.Completed) {
        return void 0;
      }
      return session;
    });
    this._ciState = derived(this, (reader) => {
      const debugData = this._debugData.read(reader);
      if (debugData) {
        return debugData.ciFailed > 0 ? { sessionId: "debug", failed: debugData.ciFailed, completed: debugData.ciFailed, pending: debugData.ciPending, debug: true } : void 0;
      }
      const session = this._session.read(reader);
      if (!session || this._ciDismissed.read(reader).has(session.sessionId)) {
        return void 0;
      }
      const ciModel = this.gitHubService.activeSessionPullRequestCIObs.read(reader);
      if (!ciModel) {
        return void 0;
      }
      if (ciModel.fixRequested.read(reader)) {
        return void 0;
      }
      const checks = ciModel.checks.read(reader);
      const failed = getFailedChecks(checks).length;
      if (failed === 0) {
        return void 0;
      }
      const completed = checks.filter((check) => check.status === GitHubCheckStatus.Completed).length;
      const pending = checks.length - completed;
      return { sessionId: session.sessionId, failed, completed, pending };
    });
    this._commentsState = derived(this, (reader) => {
      const debugData = this._debugData.read(reader);
      if (debugData) {
        const count = debugData.prFeedback + debugData.agentFeedback;
        if (count === 0) {
          return void 0;
        }
        const kind2 = debugData.prFeedback > 0 && debugData.agentFeedback > 0 ? "mixed" : debugData.prFeedback > 0 ? "pr" : "agent";
        return { sessionId: "debug", sessionResource: URI.from({ scheme: "session-chat-pills-debug", path: "/feedback" }), count, kind: kind2, firstCommentId: "debug", debug: true };
      }
      const session = this._session.read(reader);
      if (!session || this._commentsDismissed.read(reader).has(session.sessionId)) {
        return void 0;
      }
      this._feedbackChanged.read(reader);
      const created = this.feedbackService.getFeedback(session.resource).filter((item) => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind));
      if (created.length === 0) {
        return void 0;
      }
      const allPR = created.every((item) => item.kind === AgentFeedbackKind.PRReview);
      const allAgent = created.every((item) => item.kind === AgentFeedbackKind.AgentReview);
      const kind = allPR ? "pr" : allAgent ? "agent" : "mixed";
      return { sessionId: session.sessionId, sessionResource: session.resource, count: created.length, kind, firstCommentId: created[0].id };
    });
    this.domNode = dom.$(".session-input-banners");
    this._ciSlot = dom.append(this.domNode, dom.$(".session-input-banner-slot"));
    this._commentsSlot = dom.append(this.domNode, dom.$(".session-input-banner-slot"));
    this._feedbackChanged = observableSignalFromEvent(this, this.feedbackService.onDidChangeFeedback);
    this._ciDismissed.set(this._readDismissed(STORAGE_KEY_CI_DISMISSED), void 0);
    this._commentsDismissed.set(this._readDismissed(STORAGE_KEY_COMMENTS_DISMISSED), void 0);
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_CI_DISMISSED, this._store)(() => {
      this._ciDismissed.set(this._readDismissed(STORAGE_KEY_CI_DISMISSED), void 0);
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_COMMENTS_DISMISSED, this._store)(() => {
      this._commentsDismissed.set(this._readDismissed(STORAGE_KEY_COMMENTS_DISMISSED), void 0);
    }));
    this._register(autorun((reader) => this._renderCIBanner(this._ciState.read(reader))));
    this._register(autorun((reader) => this._renderCommentsBanner(this._commentsState.read(reader))));
  }
  /** Marks whether the owning chat view is the active session. */
  setActive(active) {
    this._active.set(active, void 0);
  }
  setDebugData(data) {
    this._debugData.set(data, void 0);
  }
  _renderCIBanner(state) {
    const store = this._ciContent.value = new DisposableStore();
    dom.clearNode(this._ciSlot);
    if (!state) {
      return;
    }
    const failedText = state.completed === 1 ? localize("ci.oneCheckFailed", "1 check failed") : localize("ci.checksFailed", "{0} out of {1} checks failed", state.failed, state.completed);
    const text = state.pending > 0 ? localize("ci.checksFailedPending", "{0}, {1} pending", failedText, state.pending) : failedText;
    this._renderBanner(this._ciSlot, store, {
      icon: Codicon.warning,
      accent: true,
      text,
      ariaLabel: text,
      dismissTooltip: localize("ci.dismiss", "Hide for this session"),
      actions: [
        {
          label: localize("ci.fixChecks", "Fix Checks"),
          primary: true,
          run: () => state.debug ? void 0 : this._executeCommand(FIX_CI_CHECKS_COMMAND_ID)
        },
        {
          label: localize("ci.revealChecks", "Reveal"),
          run: () => {
            if (!state.debug) {
              void this._executeCommand(REVEAL_CI_CHECKS_COMMAND_ID);
            }
          }
        }
      ],
      dismiss: () => {
        if (!state.debug) {
          this._dismiss(STORAGE_KEY_CI_DISMISSED, this._ciDismissed, state.sessionId);
        }
      }
    });
  }
  _renderCommentsBanner(state) {
    const store = this._commentsContent.value = new DisposableStore();
    dom.clearNode(this._commentsSlot);
    if (!state) {
      return;
    }
    const text = this._commentsBannerText(state.kind, state.count);
    this._renderBanner(this._commentsSlot, store, {
      icon: Codicon.commentDiscussion,
      accent: false,
      text,
      ariaLabel: text,
      dismissTooltip: localize("comments.dismiss", "Hide for this session"),
      actions: [
        {
          label: localize("comments.address", "Address Comments"),
          primary: true,
          run: () => state.debug ? void 0 : this._addressComments(state.sessionResource).catch((err) => this.logService.error("[SessionInputBanners] Failed to address comments", err))
        },
        {
          label: localize("comments.reveal", "Reveal"),
          run: () => {
            if (!state.debug) {
              this._revealComment(state.sessionResource, state.firstCommentId);
            }
          }
        }
      ],
      dismiss: () => {
        if (!state.debug) {
          this._dismiss(STORAGE_KEY_COMMENTS_DISMISSED, this._commentsDismissed, state.sessionId);
        }
      }
    });
  }
  _renderBanner(container, store, banner) {
    const widget = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, banner));
    container.appendChild(widget.domNode);
  }
  _commentsBannerText(kind, count) {
    switch (kind) {
      case "pr":
        return count === 1 ? localize("comments.pr.one", "1 PR comment") : localize("comments.pr.many", "{0} PR comments", count);
      case "agent":
        return count === 1 ? localize("comments.agent.one", "1 agent comment") : localize("comments.agent.many", "{0} agent comments", count);
      case "mixed":
        return count === 1 ? localize("comments.one", "1 comment") : localize("comments.many", "{0} comments", count);
    }
  }
  async _executeCommand(commandId) {
    try {
      await this.commandService.executeCommand(commandId);
    } catch (err) {
      this.logService.error("[SessionInputBanners] command failed", commandId, err);
    }
  }
  async _addressComments(sessionResource) {
    const created = this.feedbackService.getFeedback(sessionResource).filter((item) => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind));
    for (const item of created) {
      this.feedbackService.acceptFeedback(sessionResource, item.id);
    }
    const submitted = await this.feedbackService.submitFeedback(sessionResource);
    if (!submitted) {
      this.logService.error("[SessionInputBanners] Failed to submit feedback for session", sessionResource.toString());
    }
  }
  _revealComment(sessionResource, commentId) {
    this.feedbackService.revealFeedback(sessionResource, commentId).catch((err) => this.logService.error("[SessionInputBanners] Failed to reveal comment", err));
  }
  _dismiss(storageKey, observable, sessionId) {
    const next = new Set(observable.get());
    next.add(sessionId);
    this.storageService.store(storageKey, JSON.stringify([...next]), StorageScope.PROFILE, StorageTarget.USER);
    observable.set(next, void 0);
  }
  _readDismissed(storageKey) {
    const raw = this.storageService.get(storageKey, StorageScope.PROFILE);
    if (!raw) {
      return /* @__PURE__ */ new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === "string")) : /* @__PURE__ */ new Set();
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
};
SessionInputBanners = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, IGitHubService),
  __decorateParam(2, IAgentFeedbackService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService)
], SessionInputBanners);
export {
  SessionInputBanners
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbklucHV0QmFubmVyc1xcYnJvd3Nlclxcc2Vzc2lvbklucHV0QmFubmVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDaGVja1N0YXR1cyB9IGZyb20gJy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRklYX0NJX0NIRUNLU19DT01NQU5EX0lELCBnZXRGYWlsZWRDaGVja3MsIFJFVkVBTF9DSV9DSEVDS1NfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2NoYW5nZXMvYnJvd3Nlci9jaGVja3NBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tLaW5kLCBBZ2VudEZlZWRiYWNrU3RhdGUsIElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uQ2hhdFBpbGxzRGVidWdEYXRhIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3Nlc3Npb25DaGF0SW5wdXRUb29sYmFyRGVidWcuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25JbnB1dEJhbm5lciwgU2Vzc2lvbklucHV0QmFubmVyV2lkZ2V0IH0gZnJvbSAnLi9zZXNzaW9uSW5wdXRCYW5uZXJXaWRnZXQuanMnO1xuXG4vKiogUGVyc2lzdGVkIHNldCBvZiBzZXNzaW9uIGlkcyB3aG9zZSBDSSBiYW5uZXIgdGhlIHVzZXIgZGlzbWlzc2VkLiAqL1xuY29uc3QgU1RPUkFHRV9LRVlfQ0lfRElTTUlTU0VEID0gJ3Nlc3Npb25zLmlucHV0QmFubmVycy5jaS5kaXNtaXNzZWQnO1xuLyoqIFBlcnNpc3RlZCBzZXQgb2Ygc2Vzc2lvbiBpZHMgd2hvc2UgY29tbWVudHMgYmFubmVyIHRoZSB1c2VyIGRpc21pc3NlZC4gKi9cbmNvbnN0IFNUT1JBR0VfS0VZX0NPTU1FTlRTX0RJU01JU1NFRCA9ICdzZXNzaW9ucy5pbnB1dEJhbm5lcnMuY29tbWVudHMuZGlzbWlzc2VkJztcblxuLyoqXG4gKiBGZWVkYmFjayBraW5kcyB0aGF0IG9yaWdpbmF0ZSBmcm9tIGEgcmV2aWV3IHRoZSB1c2VyIHRyaWFnZXMgKGEgcHVsbCByZXF1ZXN0XG4gKiByZXZpZXcgb3IgYW4gaW4tcHJvZHVjdCBjb2RlIHJldmlldyksIG1hdGNoaW5nIHRoZSBjb21tZW50cyBzdXJmYWNlZCB0byB0aGVcbiAqIGFnZW50IHZpYSB0aGUgYHZpZXdVbnJldmlld2VkQ29tbWVudHNgIHRvb2wuXG4gKi9cbmNvbnN0IFJFVklFV0FCTEVfS0lORFM6IFJlYWRvbmx5U2V0PEFnZW50RmVlZGJhY2tLaW5kPiA9IG5ldyBTZXQoW0FnZW50RmVlZGJhY2tLaW5kLlBSUmV2aWV3LCBBZ2VudEZlZWRiYWNrS2luZC5BZ2VudFJldmlld10pO1xuXG5pbnRlcmZhY2UgSUNJQmFubmVyU3RhdGUge1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZmFpbGVkOiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgY2hlY2tzIHRoYXQgaGF2ZSBjb21wbGV0ZWQgKHN1Y2NlZWRlZCBvciBmYWlsZWQpLiAqL1xuXHRyZWFkb25seSBjb21wbGV0ZWQ6IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiBjaGVja3Mgc3RpbGwgcnVubmluZyBvciBxdWV1ZWQuICovXG5cdHJlYWRvbmx5IHBlbmRpbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgZGVidWc/OiB0cnVlO1xufVxuXG5pbnRlcmZhY2UgSUNvbW1lbnRzQmFubmVyU3RhdGUge1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdC8qKiBXaGV0aGVyIGFsbCBjb3VudGVkIGNvbW1lbnRzIGFyZSBQUiByZXZpZXdzLCBhbGwgYXJlIGFnZW50IHJldmlld3MsIG9yIG1peGVkLiAqL1xuXHRyZWFkb25seSBraW5kOiAncHInIHwgJ2FnZW50JyB8ICdtaXhlZCc7XG5cdHJlYWRvbmx5IGZpcnN0Q29tbWVudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlYnVnPzogdHJ1ZTtcbn1cblxuLyoqXG4gKiBIb3N0cyB0aGUgYmFubmVycyB0aGF0IHJlbmRlciBkaXJlY3RseSBhYm92ZSB0aGUgYWN0aXZlIHNlc3Npb24ncyBjaGF0IGlucHV0OlxuICogYSBDSSBmYWlsdXJlcyBiYW5uZXIgYW5kIGEgY3JlYXRlZC1jb21tZW50cyBiYW5uZXIuIEVhY2ggYmFubmVyIGNhbiBiZVxuICogcGVybWFuZW50bHkgZGlzbWlzc2VkIHBlciBzZXNzaW9uLlxuICpcbiAqIFRoZSBob3N0IGlzIG93bmVkIGJ5IHRoZSBzZXNzaW9uJ3MgY2hhdCB2aWV3IGFuZCBvbmx5IHNob3dzIGNvbnRlbnQgd2hpbGVcbiAqIHRoYXQgdmlldyBpcyB0aGUgYWN0aXZlIHNlc3Npb24gKGRyaXZlbiB2aWEge0BsaW5rIHNldEFjdGl2ZX0pOyB0aGUgQ0kgbW9kZWxcbiAqIGFuZCBmZWVkYmFjayBhcmUgcmVhZCBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbklucHV0QmFubmVycyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NpU2xvdDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRzU2xvdDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2lDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRzQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnRGF0YSA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaURpc21pc3NlZCA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+Pih0aGlzLCBuZXcgU2V0KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50c0Rpc21pc3NlZCA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+Pih0aGlzLCBuZXcgU2V0KCkpO1xuXG5cdHByaXZhdGUgX2ZlZWRiYWNrQ2hhbmdlZCE6IElPYnNlcnZhYmxlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB3aG9zZSBiYW5uZXJzIHNob3VsZCBiZSBzaG93biwgb3IgdW5kZWZpbmVkIHdoZW4gaW5hY3RpdmUgb3Jcblx0ICogd2hpbGUgdGhlIHNlc3Npb24vY2hhdCBpcyBzdGlsbCBpbiBwcm9ncmVzcy4gQmFubmVycyBvbmx5IHN1cmZhY2Ugb25jZSB0aGVcblx0ICogc2Vzc2lvbiBoYXMgY29tcGxldGVkIHNvIHRoZXkgZG9uJ3QgZGlzdHJhY3QgZnJvbSBhIHJ1bm5pbmcgYWdlbnQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc2Vzc2lvbiB8fCBzZXNzaW9uLnN0YXR1cy5yZWFkKHJlYWRlcikgIT09IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2lTdGF0ZTogSU9ic2VydmFibGU8SUNJQmFubmVyU3RhdGUgfCB1bmRlZmluZWQ+ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGRlYnVnRGF0YSA9IHRoaXMuX2RlYnVnRGF0YS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGRlYnVnRGF0YSkge1xuXHRcdFx0cmV0dXJuIGRlYnVnRGF0YS5jaUZhaWxlZCA+IDBcblx0XHRcdFx0PyB7IHNlc3Npb25JZDogJ2RlYnVnJywgZmFpbGVkOiBkZWJ1Z0RhdGEuY2lGYWlsZWQsIGNvbXBsZXRlZDogZGVidWdEYXRhLmNpRmFpbGVkLCBwZW5kaW5nOiBkZWJ1Z0RhdGEuY2lQZW5kaW5nLCBkZWJ1ZzogdHJ1ZSB9XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzZXNzaW9uIHx8IHRoaXMuX2NpRGlzbWlzc2VkLnJlYWQocmVhZGVyKS5oYXMoc2Vzc2lvbi5zZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjaU1vZGVsID0gdGhpcy5naXRIdWJTZXJ2aWNlLmFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdENJT2JzLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWNpTW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIE9uY2UgdGhlIHVzZXIgaGFzIHJlcXVlc3RlZCBhIENJIGZpeCBmb3IgdGhlIGN1cnJlbnQgUFIgaGVhZCBjb21taXQsXG5cdFx0Ly8gaGlkZSB0aGUgZW50aXJlIGJhbm5lciB1bnRpbCBhIG5ldyBjb21taXQgbGFuZHMgb24gdGhlIFBSLlxuXHRcdGlmIChjaU1vZGVsLmZpeFJlcXVlc3RlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoZWNrcyA9IGNpTW9kZWwuY2hlY2tzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBmYWlsZWQgPSBnZXRGYWlsZWRDaGVja3MoY2hlY2tzKS5sZW5ndGg7XG5cdFx0aWYgKGZhaWxlZCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29tcGxldGVkID0gY2hlY2tzLmZpbHRlcihjaGVjayA9PiBjaGVjay5zdGF0dXMgPT09IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCkubGVuZ3RoO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBjaGVja3MubGVuZ3RoIC0gY29tcGxldGVkO1xuXHRcdHJldHVybiB7IHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsIGZhaWxlZCwgY29tcGxldGVkLCBwZW5kaW5nIH07XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRzU3RhdGU6IElPYnNlcnZhYmxlPElDb21tZW50c0Jhbm5lclN0YXRlIHwgdW5kZWZpbmVkPiA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBkZWJ1Z0RhdGEgPSB0aGlzLl9kZWJ1Z0RhdGEucmVhZChyZWFkZXIpO1xuXHRcdGlmIChkZWJ1Z0RhdGEpIHtcblx0XHRcdGNvbnN0IGNvdW50ID0gZGVidWdEYXRhLnByRmVlZGJhY2sgKyBkZWJ1Z0RhdGEuYWdlbnRGZWVkYmFjaztcblx0XHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2luZCA9IGRlYnVnRGF0YS5wckZlZWRiYWNrID4gMCAmJiBkZWJ1Z0RhdGEuYWdlbnRGZWVkYmFjayA+IDBcblx0XHRcdFx0PyAnbWl4ZWQnXG5cdFx0XHRcdDogZGVidWdEYXRhLnByRmVlZGJhY2sgPiAwID8gJ3ByJyA6ICdhZ2VudCc7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6ICdkZWJ1ZycsIHNlc3Npb25SZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICdzZXNzaW9uLWNoYXQtcGlsbHMtZGVidWcnLCBwYXRoOiAnL2ZlZWRiYWNrJyB9KSwgY291bnQsIGtpbmQsIGZpcnN0Q29tbWVudElkOiAnZGVidWcnLCBkZWJ1ZzogdHJ1ZSB9O1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzZXNzaW9uIHx8IHRoaXMuX2NvbW1lbnRzRGlzbWlzc2VkLnJlYWQocmVhZGVyKS5oYXMoc2Vzc2lvbi5zZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9mZWVkYmFja0NoYW5nZWQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSB0aGlzLmZlZWRiYWNrU2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uLnJlc291cmNlKVxuXHRcdFx0LmZpbHRlcihpdGVtID0+IGl0ZW0uc3RhdGUgPT09IEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkICYmIFJFVklFV0FCTEVfS0lORFMuaGFzKGl0ZW0ua2luZCkpO1xuXHRcdGlmIChjcmVhdGVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWxsUFIgPSBjcmVhdGVkLmV2ZXJ5KGl0ZW0gPT4gaXRlbS5raW5kID09PSBBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldyk7XG5cdFx0Y29uc3QgYWxsQWdlbnQgPSBjcmVhdGVkLmV2ZXJ5KGl0ZW0gPT4gaXRlbS5raW5kID09PSBBZ2VudEZlZWRiYWNrS2luZC5BZ2VudFJldmlldyk7XG5cdFx0Y29uc3Qga2luZCA9IGFsbFBSID8gJ3ByJyA6IGFsbEFnZW50ID8gJ2FnZW50JyA6ICdtaXhlZCc7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLCBjb3VudDogY3JlYXRlZC5sZW5ndGgsIGtpbmQsIGZpcnN0Q29tbWVudElkOiBjcmVhdGVkWzBdLmlkIH07XG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJR2l0SHViU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdEBJQWdlbnRGZWVkYmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuc2Vzc2lvbi1pbnB1dC1iYW5uZXJzJyk7XG5cdFx0dGhpcy5fY2lTbG90ID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcuc2Vzc2lvbi1pbnB1dC1iYW5uZXItc2xvdCcpKTtcblx0XHR0aGlzLl9jb21tZW50c1Nsb3QgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5zZXNzaW9uLWlucHV0LWJhbm5lci1zbG90JykpO1xuXG5cdFx0dGhpcy5fZmVlZGJhY2tDaGFuZ2VkID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLmZlZWRiYWNrU2VydmljZS5vbkRpZENoYW5nZUZlZWRiYWNrKTtcblxuXHRcdC8vIExvYWQgcGVyc2lzdGVkIGRpc21pc3NhbCBzdGF0ZSBhbmQga2VlcCBpdCBpbiBzeW5jIHdpdGggb3RoZXIgd2luZG93cy9wcm9maWxlcy5cblx0XHR0aGlzLl9jaURpc21pc3NlZC5zZXQodGhpcy5fcmVhZERpc21pc3NlZChTVE9SQUdFX0tFWV9DSV9ESVNNSVNTRUQpLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2NvbW1lbnRzRGlzbWlzc2VkLnNldCh0aGlzLl9yZWFkRGlzbWlzc2VkKFNUT1JBR0VfS0VZX0NPTU1FTlRTX0RJU01JU1NFRCksIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTVE9SQUdFX0tFWV9DSV9ESVNNSVNTRUQsIHRoaXMuX3N0b3JlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jaURpc21pc3NlZC5zZXQodGhpcy5fcmVhZERpc21pc3NlZChTVE9SQUdFX0tFWV9DSV9ESVNNSVNTRUQpLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFNUT1JBR0VfS0VZX0NPTU1FTlRTX0RJU01JU1NFRCwgdGhpcy5fc3RvcmUpKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbW1lbnRzRGlzbWlzc2VkLnNldCh0aGlzLl9yZWFkRGlzbWlzc2VkKFNUT1JBR0VfS0VZX0NPTU1FTlRTX0RJU01JU1NFRCksIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4gdGhpcy5fcmVuZGVyQ0lCYW5uZXIodGhpcy5fY2lTdGF0ZS5yZWFkKHJlYWRlcikpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4gdGhpcy5fcmVuZGVyQ29tbWVudHNCYW5uZXIodGhpcy5fY29tbWVudHNTdGF0ZS5yZWFkKHJlYWRlcikpKSk7XG5cdH1cblxuXHQvKiogTWFya3Mgd2hldGhlciB0aGUgb3duaW5nIGNoYXQgdmlldyBpcyB0aGUgYWN0aXZlIHNlc3Npb24uICovXG5cdHNldEFjdGl2ZShhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmUuc2V0KGFjdGl2ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldERlYnVnRGF0YShkYXRhOiBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2RlYnVnRGF0YS5zZXQoZGF0YSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNJQmFubmVyKHN0YXRlOiBJQ0lCYW5uZXJTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlID0gdGhpcy5fY2lDb250ZW50LnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY2lTbG90KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmFpbGVkVGV4dCA9IHN0YXRlLmNvbXBsZXRlZCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2kub25lQ2hlY2tGYWlsZWQnLCBcIjEgY2hlY2sgZmFpbGVkXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaS5jaGVja3NGYWlsZWQnLCBcInswfSBvdXQgb2YgezF9IGNoZWNrcyBmYWlsZWRcIiwgc3RhdGUuZmFpbGVkLCBzdGF0ZS5jb21wbGV0ZWQpO1xuXHRcdGNvbnN0IHRleHQgPSBzdGF0ZS5wZW5kaW5nID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2kuY2hlY2tzRmFpbGVkUGVuZGluZycsIFwiezB9LCB7MX0gcGVuZGluZ1wiLCBmYWlsZWRUZXh0LCBzdGF0ZS5wZW5kaW5nKVxuXHRcdFx0OiBmYWlsZWRUZXh0O1xuXG5cdFx0dGhpcy5fcmVuZGVyQmFubmVyKHRoaXMuX2NpU2xvdCwgc3RvcmUsIHtcblx0XHRcdGljb246IENvZGljb24ud2FybmluZyxcblx0XHRcdGFjY2VudDogdHJ1ZSxcblx0XHRcdHRleHQsXG5cdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRkaXNtaXNzVG9vbHRpcDogbG9jYWxpemUoJ2NpLmRpc21pc3MnLCBcIkhpZGUgZm9yIHRoaXMgc2Vzc2lvblwiKSxcblx0XHRcdGFjdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2kuZml4Q2hlY2tzJywgXCJGaXggQ2hlY2tzXCIpLFxuXHRcdFx0XHRcdHByaW1hcnk6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBzdGF0ZS5kZWJ1ZyA/IHVuZGVmaW5lZCA6IHRoaXMuX2V4ZWN1dGVDb21tYW5kKEZJWF9DSV9DSEVDS1NfQ09NTUFORF9JRCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NpLnJldmVhbENoZWNrcycsIFwiUmV2ZWFsXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyBpZiAoIXN0YXRlLmRlYnVnKSB7IHZvaWQgdGhpcy5fZXhlY3V0ZUNvbW1hbmQoUkVWRUFMX0NJX0NIRUNLU19DT01NQU5EX0lEKTsgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdGRpc21pc3M6ICgpID0+IHsgaWYgKCFzdGF0ZS5kZWJ1ZykgeyB0aGlzLl9kaXNtaXNzKFNUT1JBR0VfS0VZX0NJX0RJU01JU1NFRCwgdGhpcy5fY2lEaXNtaXNzZWQsIHN0YXRlLnNlc3Npb25JZCk7IH0gfSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNvbW1lbnRzQmFubmVyKHN0YXRlOiBJQ29tbWVudHNCYW5uZXJTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlID0gdGhpcy5fY29tbWVudHNDb250ZW50LnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY29tbWVudHNTbG90KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHRoaXMuX2NvbW1lbnRzQmFubmVyVGV4dChzdGF0ZS5raW5kLCBzdGF0ZS5jb3VudCk7XG5cblx0XHR0aGlzLl9yZW5kZXJCYW5uZXIodGhpcy5fY29tbWVudHNTbG90LCBzdG9yZSwge1xuXHRcdFx0aWNvbjogQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbixcblx0XHRcdGFjY2VudDogZmFsc2UsXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0ZGlzbWlzc1Rvb2x0aXA6IGxvY2FsaXplKCdjb21tZW50cy5kaXNtaXNzJywgXCJIaWRlIGZvciB0aGlzIHNlc3Npb25cIiksXG5cdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbW1lbnRzLmFkZHJlc3MnLCBcIkFkZHJlc3MgQ29tbWVudHNcIiksXG5cdFx0XHRcdFx0cHJpbWFyeTogdHJ1ZSxcblx0XHRcdFx0XHRydW46ICgpID0+IHN0YXRlLmRlYnVnID8gdW5kZWZpbmVkIDogdGhpcy5fYWRkcmVzc0NvbW1lbnRzKHN0YXRlLnNlc3Npb25SZXNvdXJjZSkuY2F0Y2goZXJyID0+IHRoaXMubG9nU2VydmljZS5lcnJvcignW1Nlc3Npb25JbnB1dEJhbm5lcnNdIEZhaWxlZCB0byBhZGRyZXNzIGNvbW1lbnRzJywgZXJyKSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbW1lbnRzLnJldmVhbCcsIFwiUmV2ZWFsXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyBpZiAoIXN0YXRlLmRlYnVnKSB7IHRoaXMuX3JldmVhbENvbW1lbnQoc3RhdGUuc2Vzc2lvblJlc291cmNlLCBzdGF0ZS5maXJzdENvbW1lbnRJZCk7IH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRkaXNtaXNzOiAoKSA9PiB7IGlmICghc3RhdGUuZGVidWcpIHsgdGhpcy5fZGlzbWlzcyhTVE9SQUdFX0tFWV9DT01NRU5UU19ESVNNSVNTRUQsIHRoaXMuX2NvbW1lbnRzRGlzbWlzc2VkLCBzdGF0ZS5zZXNzaW9uSWQpOyB9IH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJCYW5uZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgYmFubmVyOiBJU2Vzc2lvbklucHV0QmFubmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbklucHV0QmFubmVyV2lkZ2V0LCBiYW5uZXIpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tbWVudHNCYW5uZXJUZXh0KGtpbmQ6ICdwcicgfCAnYWdlbnQnIHwgJ21peGVkJywgY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlICdwcic6XG5cdFx0XHRcdHJldHVybiBjb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NvbW1lbnRzLnByLm9uZScsIFwiMSBQUiBjb21tZW50XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29tbWVudHMucHIubWFueScsIFwiezB9IFBSIGNvbW1lbnRzXCIsIGNvdW50KTtcblx0XHRcdGNhc2UgJ2FnZW50Jzpcblx0XHRcdFx0cmV0dXJuIGNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29tbWVudHMuYWdlbnQub25lJywgXCIxIGFnZW50IGNvbW1lbnRcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb21tZW50cy5hZ2VudC5tYW55JywgXCJ7MH0gYWdlbnQgY29tbWVudHNcIiwgY291bnQpO1xuXHRcdFx0Y2FzZSAnbWl4ZWQnOlxuXHRcdFx0XHRyZXR1cm4gY291bnQgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb21tZW50cy5vbmUnLCBcIjEgY29tbWVudFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NvbW1lbnRzLm1hbnknLCBcInswfSBjb21tZW50c1wiLCBjb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbU2Vzc2lvbklucHV0QmFubmVyc10gY29tbWFuZCBmYWlsZWQnLCBjb21tYW5kSWQsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWRkcmVzc0NvbW1lbnRzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQWNjZXB0IHRoZSByZXZpZXdhYmxlIGNvbW1lbnRzIHN1cmZhY2VkIGluIHRoZSBiYW5uZXIgc28gdGhleSBiZWNvbWVcblx0XHQvLyBhdHRhY2hhYmxlIGZlZWRiYWNrLCB0aGVuIHN1Ym1pdCB0aGVtIHRvIHRoZSBhZ2VudC4gVGhpcyBtaXJyb3JzIHRoZVxuXHRcdC8vIGFnZW50IGZlZWRiYWNrIGVkaXRvciBvdmVybGF5J3MgU3VibWl0IGJ1dHRvbjogcmF0aGVyIHRoYW4gc2VuZGluZyBhXG5cdFx0Ly8gYmFyZSBgL2FjdC1vbi1mZWVkYmFja2AgY29tbWFuZCwgdGhlIGFjY2VwdGVkIGZlZWRiYWNrIGl0ZW1zIGFyZVxuXHRcdC8vIGF0dGFjaGVkIHRvIHRoZSByZXF1ZXN0IHNvIHRoZSBhZ2VudCByZWNlaXZlcyB0aGUgY29tbWVudHMuXG5cdFx0Y29uc3QgY3JlYXRlZCA9IHRoaXMuZmVlZGJhY2tTZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQ3JlYXRlZCAmJiBSRVZJRVdBQkxFX0tJTkRTLmhhcyhpdGVtLmtpbmQpKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY3JlYXRlZCkge1xuXHRcdFx0dGhpcy5mZWVkYmFja1NlcnZpY2UuYWNjZXB0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlLCBpdGVtLmlkKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdWJtaXR0ZWQgPSBhd2FpdCB0aGlzLmZlZWRiYWNrU2VydmljZS5zdWJtaXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc3VibWl0dGVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tTZXNzaW9uSW5wdXRCYW5uZXJzXSBGYWlsZWQgdG8gc3VibWl0IGZlZWRiYWNrIGZvciBzZXNzaW9uJywgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbENvbW1lbnQoc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbW1lbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5mZWVkYmFja1NlcnZpY2UucmV2ZWFsRmVlZGJhY2soc2Vzc2lvblJlc291cmNlLCBjb21tZW50SWQpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tTZXNzaW9uSW5wdXRCYW5uZXJzXSBGYWlsZWQgdG8gcmV2ZWFsIGNvbW1lbnQnLCBlcnIpKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc21pc3Moc3RvcmFnZUtleTogc3RyaW5nLCBvYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFJlYWRvbmx5U2V0PHN0cmluZz4+LCBzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSBuZXcgU2V0KG9ic2VydmFibGUuZ2V0KCkpO1xuXHRcdG5leHQuYWRkKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShbLi4ubmV4dF0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRvYnNlcnZhYmxlLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZERpc21pc3NlZChzdG9yYWdlS2V5OiBzdHJpbmcpOiBSZWFkb25seVNldDxzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChzdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShwYXJzZWQpID8gbmV3IFNldChwYXJzZWQuZmlsdGVyKChpZCk6IGlkIGlzIHN0cmluZyA9PiB0eXBlb2YgaWQgPT09ICdzdHJpbmcnKSkgOiBuZXcgU2V0KCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gbmV3IFNldCgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsV0FBVztBQUNwQixTQUFTLFNBQVMsU0FBMkMsMkJBQTJCLHVCQUF1QjtBQUMvRyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQixpQkFBaUIsbUNBQW1D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
