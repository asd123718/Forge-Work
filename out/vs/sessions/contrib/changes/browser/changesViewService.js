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
import { Codicon } from "../../../../base/common/codicons.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { LRUCache, ResourceMap } from "../../../../base/common/map.js";
import { autorun, derived, derivedObservableWithCache, derivedOpts, observableSignal, observableSignalFromEvent, observableValue, transaction } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { AGENT_HOST_MERGE_CHANGESET_OPERATION_ID } from "../../../../platform/agentHost/common/agentHostChangesetOperationService.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionChangesetOperationScope } from "../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { AgentFeedbackState, IAgentFeedbackService } from "../../agentFeedback/browser/agentFeedbackService.js";
import { ICodeReviewService, PRReviewStateKind } from "../../codeReview/browser/codeReviewService.js";
import { ChangesViewMode, IsolationMode } from "../common/changes.js";
const ChangesetReviewSupportContext = new RawContextKey("sessions.changesetReviewSupport", false);
const ChangesetReviewedFilesContext = new RawContextKey("sessions.changesetReviewedFiles", []);
const ChangesetHasOperationsContext = new RawContextKey("sessions.changesetHasOperations", false);
const DEFAULT_SECTION_COLLAPSE_STATE = Object.freeze({
  otherFiles: false,
  checks: true
});
const SESSION_VIEW_STATE_STORAGE_KEY = "changesView.sessionViewState";
const SESSION_VIEW_STATE_LIMIT = 100;
let ChangesViewService = class extends Disposable {
  constructor(agentFeedbackService, codeReviewService, contextKeyService, sessionsService, storageService, sessionsManagementService) {
    super();
    this.agentFeedbackService = agentFeedbackService;
    this.codeReviewService = codeReviewService;
    this.contextKeyService = contextKeyService;
    this.sessionsService = sessionsService;
    this.storageService = storageService;
    this._sectionCollapseStateBySession = new ResourceMap();
    this._sectionCollapseStateChanged = observableSignal("changesView.sectionCollapseStateChanged");
    this._detailsViewStateBySession = new LRUCache(SESSION_VIEW_STATE_LIMIT);
    this.detailsViewStateTransferObs = observableValue(this, void 0);
    this._selectedChangesetId = observableValue(this, void 0);
    this._transientChangeset = observableValue(this, void 0);
    this._loadViewState();
    this.activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, (reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.resource;
    });
    this.activeSessionSectionCollapseStateObs = derivedOpts({ equalsFn: structuralEquals }, (reader) => {
      const sessionResource = this.activeSessionResourceObs.read(reader);
      this._sectionCollapseStateChanged.read(reader);
      return sessionResource ? this._sectionCollapseStateBySession.get(sessionResource) ?? DEFAULT_SECTION_COLLAPSE_STATE : DEFAULT_SECTION_COLLAPSE_STATE;
    });
    this.activeSessionTypeObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.sessionType;
    });
    this.activeSessionIsVirtualWorkspaceObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.workspace.read(reader)?.isVirtualWorkspace ?? false;
    });
    this.activeSessionHasGitRepositoryObs = derived((reader) => {
      const isVirtualWorkspace = this.activeSessionIsVirtualWorkspaceObs.read(reader);
      if (isVirtualWorkspace) {
        return true;
      }
      const activeSession = this.sessionsService.activeSession.read(reader);
      const workspace = activeSession?.workspace.read(reader);
      return workspace?.folders[0].gitRepository !== void 0;
    });
    this.activeSessionReviewCommentCountByFileObs = this._getActiveSessionReviewComments();
    this.activeSessionAgentFeedbackCountByFileObs = this._getActiveSessionAgentFeedback();
    const activeSessionChangesetsObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.changesets.read(reader);
    });
    this.activeSessionChangesetsObs = derived((reader) => {
      const changesets = activeSessionChangesetsObs.read(reader);
      const transientChangeset = this._transientChangeset.read(reader);
      if (!transientChangeset) {
        return changesets;
      }
      return [
        ...changesets?.filter((changeset) => changeset.id !== transientChangeset.id) ?? [],
        transientChangeset
      ];
    });
    this.activeSessionChangesetsLoadingObs = derived((reader) => {
      return this.activeSessionChangesetsObs.read(reader) === void 0;
    });
    this.activeSessionChangesetObs = derived((reader) => {
      const selectedChangesetId = this._selectedChangesetId.read(reader);
      const activeSessionChangesets = this.activeSessionChangesetsObs.read(reader);
      if (!activeSessionChangesets) {
        return void 0;
      }
      const selectedChangeset = selectedChangesetId ? activeSessionChangesets.find((c) => c.id === selectedChangesetId && c.isEnabled.read(reader)) : void 0;
      if (selectedChangeset) {
        return selectedChangeset;
      }
      const defaultChangeset = activeSessionChangesets.find((c) => c.isDefault.read(reader));
      const firstEnabledChangeset = activeSessionChangesets.find((c) => c.isEnabled.read(reader));
      return defaultChangeset ?? firstEnabledChangeset;
    });
    this.activeSessionChangesetLoadingObs = derived((reader) => {
      const changeset = this.activeSessionChangesetObs.read(reader);
      return changeset?.isLoadingChanges.read(reader) ?? false;
    });
    const activeSessionBaseBranchProtected = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.workspace.read(reader)?.folders[0]?.gitRepository?.baseBranchProtected === true;
    });
    this.activeSessionChangesetOperationsObs = derived((reader) => {
      const changeset = this.activeSessionChangesetObs.read(reader);
      const operations = changeset?.operations.read(reader) ?? [];
      return activeSessionBaseBranchProtected.read(reader) ? operations.filter((operation) => operation.id !== AGENT_HOST_MERGE_CHANGESET_OPERATION_ID) : operations;
    });
    this.activeSessionChangesObs = derived((reader) => {
      const changeset = this.activeSessionChangesetObs.read(reader);
      return changeset?.changes.read(reader) ?? [];
    });
    this.activeSessionLoadingObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      const activeSessionLoading = activeSession?.loading.read(reader) ?? true;
      const activeSessionChangesetsLoading = this.activeSessionChangesetsLoadingObs.read(reader);
      const activeSessionChangesetLoading = this.activeSessionChangesetLoadingObs.read(reader);
      return activeSessionLoading || activeSessionChangesetsLoading || activeSessionChangesetLoading;
    });
    this.activeSessionStateObs = this._getActiveSessionState();
    const storedMode = this.storageService.get("changesView.viewMode", StorageScope.WORKSPACE);
    const initialMode = storedMode === ChangesViewMode.Tree ? ChangesViewMode.Tree : ChangesViewMode.List;
    this._viewModeObs = observableValue(this, initialMode);
    this._register(autorun((reader) => {
      this.activeSessionResourceObs.read(reader);
      this.setChangesetId(void 0);
    }));
    this._register(sessionsManagementService.onDidReplaceSession(({ from, to }) => {
      const sectionCollapseState = this._sectionCollapseStateBySession.get(from.resource);
      if (sectionCollapseState) {
        this._sectionCollapseStateBySession.delete(from.resource);
        this._sectionCollapseStateBySession.set(to.resource, sectionCollapseState);
        this._sectionCollapseStateChanged.trigger(void 0);
      }
      const detailsViewState = this._detailsViewStateBySession.get(from.resource.toString());
      if (detailsViewState) {
        this._detailsViewStateBySession.delete(from.resource.toString());
        this._detailsViewStateBySession.set(to.resource.toString(), detailsViewState);
        this._saveViewState();
      }
      this.detailsViewStateTransferObs.set({ from: from.resource, to: to.resource }, void 0);
    }));
    this._register(sessionsManagementService.onDidDeleteSession((session) => {
      this._deleteSessionViewState(session.resource);
    }));
    this._register(sessionsManagementService.onDidDiscardNewSession((session) => this._deleteSessionViewState(session.resource)));
    this._register(sessionsManagementService.onDidReplaceNewDraftSession(({ from }) => this._deleteSessionViewState(from.resource)));
    this._bindContextKeys();
  }
  setChangesetId(changesetId) {
    transaction((tx) => {
      this._selectedChangesetId.set(changesetId, tx);
      this._transientChangeset.set(void 0, tx);
    });
  }
  showChangeset(changeset) {
    transaction((tx) => {
      this._transientChangeset.set(changeset, tx);
      this._selectedChangesetId.set(changeset.id, tx);
    });
  }
  get viewModeObs() {
    return this._viewModeObs;
  }
  setViewMode(mode) {
    if (this._viewModeObs.get() === mode) {
      return;
    }
    this._viewModeObs.set(mode, void 0);
    this.storageService.store("changesView.viewMode", mode, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  setSectionCollapsed(sessionResource, section, collapsed) {
    const current = this._sectionCollapseStateBySession.get(sessionResource) ?? DEFAULT_SECTION_COLLAPSE_STATE;
    if (current[section] === collapsed) {
      return;
    }
    const next = { ...current, [section]: collapsed };
    if (next.otherFiles === DEFAULT_SECTION_COLLAPSE_STATE.otherFiles && next.checks === DEFAULT_SECTION_COLLAPSE_STATE.checks) {
      this._sectionCollapseStateBySession.delete(sessionResource);
    } else {
      this._sectionCollapseStateBySession.set(sessionResource, next);
    }
    this._sectionCollapseStateChanged.trigger(void 0);
  }
  getDetailsViewState(sessionResource, viewMode) {
    return this._detailsViewStateBySession.get(sessionResource.toString())?.[viewMode];
  }
  setDetailsViewState(sessionResource, viewMode, state) {
    const key = sessionResource.toString();
    const current = this._detailsViewStateBySession.get(key);
    if (structuralEquals(current?.[viewMode], state)) {
      return;
    }
    this._detailsViewStateBySession.set(key, { ...current, [viewMode]: state });
    this._saveViewState();
  }
  _deleteSessionViewState(sessionResource) {
    if (this._sectionCollapseStateBySession.delete(sessionResource)) {
      this._sectionCollapseStateChanged.trigger(void 0);
    }
    if (this._detailsViewStateBySession.delete(sessionResource.toString())) {
      this._saveViewState();
    }
  }
  _loadViewState() {
    const entries = this.storageService.getObject(SESSION_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE, []);
    if (!Array.isArray(entries)) {
      this.storageService.remove(SESSION_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
      return;
    }
    for (const entry of entries) {
      if (typeof entry.sessionResource !== "string") {
        continue;
      }
      const resource = URI.parse(entry.sessionResource);
      if (entry.detailsViewState) {
        this._detailsViewStateBySession.set(resource.toString(), entry.detailsViewState);
      }
    }
  }
  _saveViewState() {
    if (this._detailsViewStateBySession.size === 0) {
      this.storageService.remove(SESSION_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
      return;
    }
    const entries = [];
    this._detailsViewStateBySession.forEach((detailsViewState, sessionResource) => {
      entries.push({
        sessionResource,
        detailsViewState
      });
    });
    this.storageService.store(SESSION_VIEW_STATE_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  setChangesetFilesReviewState(resources, reviewed) {
    if (resources.length === 0) {
      return;
    }
    const changeset = this.activeSessionChangesetObs.get();
    if (!changeset || !changeset.setReviewState) {
      return;
    }
    changeset.setReviewState(resources, reviewed);
  }
  _getActiveSessionState() {
    const activeSessionStateObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const loading = this.activeSessionLoadingObs.read(reader);
      if (loading) {
        return lastValue;
      }
      const activeSession = this.sessionsService.activeSession.read(reader);
      const activeSessionChanges = activeSession?.changes.read(reader) ?? [];
      const workspace = activeSession?.workspace.read(reader);
      const workspaceFolder = workspace?.folders[0];
      const gitRepository = workspaceFolder?.gitRepository;
      const hasGitRepository = this.activeSessionHasGitRepositoryObs.read(reader);
      const branchName = gitRepository?.branchName;
      const baseBranchName = gitRepository?.baseBranchName;
      const isMergeBaseBranchProtected = gitRepository?.baseBranchProtected;
      const isolationMode = gitRepository?.workTreeUri === void 0 ? IsolationMode.Workspace : IsolationMode.Worktree;
      const gitHubInfo = gitRepository?.gitHubInfo.read(reader);
      const hasPullRequest = gitHubInfo?.pullRequest?.uri !== void 0;
      const hasOpenPullRequest = hasPullRequest && (gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestDraft.id || gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequest.id || gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestError.id || gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestComment.id);
      const hasGitHubRemote = gitRepository?.hasGitHubRemote ?? false;
      const upstreamBranchName = gitRepository?.upstreamBranchName;
      const incomingChanges = gitRepository?.incomingChanges ?? 0;
      const outgoingChanges = gitRepository?.outgoingChanges ?? 0;
      const uncommittedChanges = gitRepository?.uncommittedChanges ?? 0;
      const hasBranchChanges = activeSessionChanges.length > 0;
      const hasGitOperationInProgress = gitRepository?.hasGitOperationInProgress ?? false;
      return {
        isolationMode,
        hasGitRepository,
        branchName,
        baseBranchName,
        isMergeBaseBranchProtected,
        upstreamBranchName,
        incomingChanges,
        outgoingChanges,
        uncommittedChanges,
        hasBranchChanges,
        hasGitHubRemote,
        hasPullRequest,
        hasOpenPullRequest,
        hasGitOperationInProgress
      };
    });
    return derivedOpts(
      { equalsFn: structuralEquals },
      (reader) => activeSessionStateObs.read(reader)
    );
  }
  _getActiveSessionReviewComments() {
    return derived((reader) => {
      const sessionResource = this.activeSessionResourceObs.read(reader);
      if (!sessionResource) {
        return /* @__PURE__ */ new Map();
      }
      const result = /* @__PURE__ */ new Map();
      const prReviewState = this.codeReviewService.getPRReviewState(sessionResource).read(reader);
      if (prReviewState.kind === PRReviewStateKind.Loaded) {
        for (const comment of prReviewState.comments) {
          const uriKey = comment.uri.fsPath;
          result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
        }
      }
      return result;
    });
  }
  _getActiveSessionAgentFeedback() {
    const didChangeFeedbackSignal = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);
    return derived((reader) => {
      const sessionResource = this.agentFeedbackService.activeFeedbackSessionResource.read(reader);
      didChangeFeedbackSignal.read(reader);
      const feedbackItems = this.agentFeedbackService.getFeedback(sessionResource);
      const result = /* @__PURE__ */ new Map();
      for (const item of feedbackItems) {
        if (!item.sourcePRReviewCommentId && item.state !== AgentFeedbackState.Resolved) {
          const uriKey = item.resourceUri.fsPath;
          result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
        }
      }
      return result;
    });
  }
  _bindContextKeys() {
    this._register(bindContextKey(ChangesetReviewSupportContext, this.contextKeyService, (reader) => {
      const changeset = this.activeSessionChangesetObs.read(reader);
      return changeset?.capabilities?.review === true;
    }));
    this._register(bindContextKey(ChangesetReviewedFilesContext, this.contextKeyService, (reader) => {
      const changes = this.activeSessionChangesObs.read(reader);
      return changes.filter((change) => change.reviewed).map((change) => change.modifiedUri?.toString() ?? change.originalUri?.toString()).filter((uri) => uri !== void 0);
    }));
    const changesetOperationCountObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const changeset = this.activeSessionChangesetObs.read(reader);
      if (!changeset) {
        return lastValue ?? 0;
      }
      const operations = this.activeSessionChangesetOperationsObs.read(reader);
      return operations.filter((op) => op.scopes.includes(SessionChangesetOperationScope.Changeset)).length;
    });
    this._register(bindContextKey(ChangesetHasOperationsContext, this.contextKeyService, (reader) => {
      return changesetOperationCountObs.read(reader) > 0;
    }));
  }
};
ChangesViewService = __decorateClass([
  __decorateParam(0, IAgentFeedbackService),
  __decorateParam(1, ICodeReviewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, ISessionsManagementService)
], ChangesViewService);
export {
  ChangesViewService,
  ChangesetHasOperationsContext,
  ChangesetReviewSupportContext,
  ChangesetReviewedFilesContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hhbmdlc1ZpZXdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSwgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVNpZ25hbCwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX01FUkdFX0NIQU5HRVNFVF9PUEVSQVRJT05fSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc2V0LCBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbiwgSVNlc3Npb25GaWxlQ2hhbmdlLCBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja1N0YXRlLCBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVSZXZpZXdTZXJ2aWNlLCBQUlJldmlld1N0YXRlS2luZCB9IGZyb20gJy4uLy4uL2NvZGVSZXZpZXcvYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzVmlld01vZGUsIElzb2xhdGlvbk1vZGUgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVTZXNzaW9uU3RhdGUsIENoYW5nZXNWaWV3U2VjdGlvbiwgSUNoYW5nZXNEZXRhaWxzVmlld1N0YXRlLCBJQ2hhbmdlc0RldGFpbHNWaWV3U3RhdGVUcmFuc2ZlciwgSUNoYW5nZXNWaWV3U2VjdGlvbkNvbGxhcHNlU3RhdGUsIElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IENoYW5nZXNldFJldmlld1N1cHBvcnRDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25zLmNoYW5nZXNldFJldmlld1N1cHBvcnQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ2hhbmdlc2V0UmV2aWV3ZWRGaWxlc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmdbXT4oJ3Nlc3Npb25zLmNoYW5nZXNldFJldmlld2VkRmlsZXMnLCBbXSk7XG5leHBvcnQgY29uc3QgQ2hhbmdlc2V0SGFzT3BlcmF0aW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbnMuY2hhbmdlc2V0SGFzT3BlcmF0aW9ucycsIGZhbHNlKTtcblxuY29uc3QgREVGQVVMVF9TRUNUSU9OX0NPTExBUFNFX1NUQVRFOiBJQ2hhbmdlc1ZpZXdTZWN0aW9uQ29sbGFwc2VTdGF0ZSA9IE9iamVjdC5mcmVlemUoe1xuXHRvdGhlckZpbGVzOiBmYWxzZSxcblx0Y2hlY2tzOiB0cnVlLFxufSk7XG5cbmludGVyZmFjZSBJU3RvcmVkQ2hhbmdlc1ZpZXdTdGF0ZSB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWxzVmlld1N0YXRlPzogUGFydGlhbDxSZWNvcmQ8Q2hhbmdlc1ZpZXdNb2RlLCBJQ2hhbmdlc0RldGFpbHNWaWV3U3RhdGU+Pjtcbn1cblxuY29uc3QgU0VTU0lPTl9WSUVXX1NUQVRFX1NUT1JBR0VfS0VZID0gJ2NoYW5nZXNWaWV3LnNlc3Npb25WaWV3U3RhdGUnO1xuY29uc3QgU0VTU0lPTl9WSUVXX1NUQVRFX0xJTUlUID0gMTAwO1xuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1ZpZXdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGFuZ2VzVmlld1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXNvdXJjZU9iczogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvblR5cGVPYnM6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25Jc1ZpcnR1YWxXb3Jrc3BhY2VPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQ2hhbmdlc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzTG9hZGluZ09iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnM6IElPYnNlcnZhYmxlPElTZXNzaW9uQ2hhbmdlc2V0IHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmdPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25bXT47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25IYXNHaXRSZXBvc2l0b3J5T2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvblJldmlld0NvbW1lbnRDb3VudEJ5RmlsZU9iczogSU9ic2VydmFibGU8TWFwPHN0cmluZywgbnVtYmVyPj47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25BZ2VudEZlZWRiYWNrQ291bnRCeUZpbGVPYnM6IElPYnNlcnZhYmxlPE1hcDxzdHJpbmcsIG51bWJlcj4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uU3RhdGVPYnM6IElPYnNlcnZhYmxlPEFjdGl2ZVNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25Mb2FkaW5nT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvblNlY3Rpb25Db2xsYXBzZVN0YXRlT2JzOiBJT2JzZXJ2YWJsZTxJQ2hhbmdlc1ZpZXdTZWN0aW9uQ29sbGFwc2VTdGF0ZT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VjdGlvbkNvbGxhcHNlU3RhdGVCeVNlc3Npb24gPSBuZXcgUmVzb3VyY2VNYXA8SUNoYW5nZXNWaWV3U2VjdGlvbkNvbGxhcHNlU3RhdGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlY3Rpb25Db2xsYXBzZVN0YXRlQ2hhbmdlZCA9IG9ic2VydmFibGVTaWduYWwoJ2NoYW5nZXNWaWV3LnNlY3Rpb25Db2xsYXBzZVN0YXRlQ2hhbmdlZCcpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXRhaWxzVmlld1N0YXRlQnlTZXNzaW9uID0gbmV3IExSVUNhY2hlPHN0cmluZywgUGFydGlhbDxSZWNvcmQ8Q2hhbmdlc1ZpZXdNb2RlLCBJQ2hhbmdlc0RldGFpbHNWaWV3U3RhdGU+Pj4oU0VTU0lPTl9WSUVXX1NUQVRFX0xJTUlUKTtcblx0cmVhZG9ubHkgZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElDaGFuZ2VzRGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGVkQ2hhbmdlc2V0SWQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc2llbnRDaGFuZ2VzZXQgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25DaGFuZ2VzZXQgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHNldENoYW5nZXNldElkKGNoYW5nZXNldElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZENoYW5nZXNldElkLnNldChjaGFuZ2VzZXRJZCwgdHgpO1xuXHRcdFx0dGhpcy5fdHJhbnNpZW50Q2hhbmdlc2V0LnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHNob3dDaGFuZ2VzZXQoY2hhbmdlc2V0OiBJU2Vzc2lvbkNoYW5nZXNldCk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3RyYW5zaWVudENoYW5nZXNldC5zZXQoY2hhbmdlc2V0LCB0eCk7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZENoYW5nZXNldElkLnNldChjaGFuZ2VzZXQuaWQsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPENoYW5nZXNWaWV3TW9kZT47XG5cdGdldCB2aWV3TW9kZU9icygpIHsgcmV0dXJuIHRoaXMuX3ZpZXdNb2RlT2JzOyB9XG5cdHNldFZpZXdNb2RlKG1vZGU6IENoYW5nZXNWaWV3TW9kZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aWV3TW9kZU9icy5nZXQoKSA9PT0gbW9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl92aWV3TW9kZU9icy5zZXQobW9kZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGFuZ2VzVmlldy52aWV3TW9kZScsIG1vZGUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50RmVlZGJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRGZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSxcblx0XHRASUNvZGVSZXZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZVJldmlld1NlcnZpY2U6IElDb2RlUmV2aWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Ugc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbG9hZFZpZXdTdGF0ZSgpO1xuXG5cdFx0Ly8gQWN0aXZlIHNlc3Npb24gcmVzb3VyY2Vcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGlzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy5yZXNvdXJjZTtcblx0XHR9KTtcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25TZWN0aW9uQ29sbGFwc2VTdGF0ZU9icyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHMgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3NlY3Rpb25Db2xsYXBzZVN0YXRlQ2hhbmdlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvblJlc291cmNlID8gdGhpcy5fc2VjdGlvbkNvbGxhcHNlU3RhdGVCeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSkgPz8gREVGQVVMVF9TRUNUSU9OX0NPTExBUFNFX1NUQVRFIDogREVGQVVMVF9TRUNUSU9OX0NPTExBUFNFX1NUQVRFO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWN0aXZlIHNlc3Npb24gdHlwZVxuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblR5cGVPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8uc2Vzc2lvblR5cGU7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25Jc1ZpcnR1YWxXb3Jrc3BhY2VPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uaXNWaXJ0dWFsV29ya3NwYWNlID8/IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWN0aXZlIHNlc3Npb24gaGFzIGdpdCByZXBvc2l0b3J5XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uSGFzR2l0UmVwb3NpdG9yeU9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzVmlydHVhbFdvcmtzcGFjZSA9IHRoaXMuYWN0aXZlU2Vzc2lvbklzVmlydHVhbFdvcmtzcGFjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNWaXJ0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhY3RpdmVTZXNzaW9uPy53b3Jrc3BhY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZT8uZm9sZGVyc1swXS5naXRSZXBvc2l0b3J5ICE9PSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHQvLyBBY3RpdmUgc2Vzc2lvbiByZXZpZXcgY29tbWVudCBjb3VudCBieSBmaWxlXG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uUmV2aWV3Q29tbWVudENvdW50QnlGaWxlT2JzID0gdGhpcy5fZ2V0QWN0aXZlU2Vzc2lvblJldmlld0NvbW1lbnRzKCk7XG5cblx0XHQvLyBBY3RpdmUgc2Vzc2lvbiBhZ2VudCBmZWVkYmFjayBjb3VudCBieSBmaWxlXG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQWdlbnRGZWVkYmFja0NvdW50QnlGaWxlT2JzID0gdGhpcy5fZ2V0QWN0aXZlU2Vzc2lvbkFnZW50RmVlZGJhY2soKTtcblxuXHRcdC8vIENoYW5nZXNldHNcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy5jaGFuZ2VzZXRzLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0cyA9IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRyYW5zaWVudENoYW5nZXNldCA9IHRoaXMuX3RyYW5zaWVudENoYW5nZXNldC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXRyYW5zaWVudENoYW5nZXNldCkge1xuXHRcdFx0XHRyZXR1cm4gY2hhbmdlc2V0cztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0Li4uKGNoYW5nZXNldHM/LmZpbHRlcihjaGFuZ2VzZXQgPT4gY2hhbmdlc2V0LmlkICE9PSB0cmFuc2llbnRDaGFuZ2VzZXQuaWQpID8/IFtdKSxcblx0XHRcdFx0dHJhbnNpZW50Q2hhbmdlc2V0LFxuXHRcdFx0XTtcblx0XHR9KTtcblxuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNMb2FkaW5nT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNPYnMucmVhZChyZWFkZXIpID09PSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHQvLyBDaGFuZ2VzZXRcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMgPSBkZXJpdmVkPElTZXNzaW9uQ2hhbmdlc2V0IHwgdW5kZWZpbmVkPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRDaGFuZ2VzZXRJZCA9IHRoaXMuX3NlbGVjdGVkQ2hhbmdlc2V0SWQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHMgPSB0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSG9ub3IgYW4gZXhwbGljaXQgc2VsZWN0aW9uIG9ubHkgd2hpbGUgaXQgaXMgc3RpbGwgZW5hYmxlZDsgb3RoZXJ3aXNlIGZhbGxcblx0XHRcdC8vIGJhY2sgdG8gdGhlIGRlZmF1bHQsIGZpcnN0IGVuYWJsZWQgY2hhbmdlc2V0IHNvIHRoZSBwaWNrZXIgbmV2ZXIgc2hvd3MgYVxuXHRcdFx0Ly8gZGlzYWJsZWQgc2VsZWN0aW9uLlxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRDaGFuZ2VzZXQgPSBzZWxlY3RlZENoYW5nZXNldElkXG5cdFx0XHRcdD8gYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNcblx0XHRcdFx0XHQuZmluZChjID0+IGMuaWQgPT09IHNlbGVjdGVkQ2hhbmdlc2V0SWQgJiYgYy5pc0VuYWJsZWQucmVhZChyZWFkZXIpKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHNlbGVjdGVkQ2hhbmdlc2V0KSB7XG5cdFx0XHRcdHJldHVybiBzZWxlY3RlZENoYW5nZXNldDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVmYXVsdENoYW5nZXNldCA9IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzXG5cdFx0XHRcdC5maW5kKGMgPT4gYy5pc0RlZmF1bHQucmVhZChyZWFkZXIpKTtcblxuXHRcdFx0Y29uc3QgZmlyc3RFbmFibGVkQ2hhbmdlc2V0ID0gYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNcblx0XHRcdFx0LmZpbmQoYyA9PiBjLmlzRW5hYmxlZC5yZWFkKHJlYWRlcikpO1xuXG5cdFx0XHRyZXR1cm4gZGVmYXVsdENoYW5nZXNldCA/PyBmaXJzdEVuYWJsZWRDaGFuZ2VzZXQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRMb2FkaW5nT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0ID0gdGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIE5vdCBoYXZpbmcgYW4gYWN0aXZlIGNoYW5nZXNldCBpbmRpY2F0ZXMgdGhhdCB3ZSBoYXZlIHN3aXRjaGVkXG5cdFx0XHQvLyBiZXR3ZWVuIHNlc3Npb25zIGFuZCB0aGUgY2hhbmdlc2V0cyBhcmUgc3RpbGwgYmVpbmcgbG9hZGVkLiBXaGVuXG5cdFx0XHQvLyBzd2l0Y2hpbmcgYmV0d2VlbiBzZXNzaW9ucywgd2UgbmVlZCB0byBjbGVhciB0aGUgY2hhbmdlcyBsaXN0LlxuXHRcdFx0cmV0dXJuIGNoYW5nZXNldD8uaXNMb2FkaW5nQ2hhbmdlcy5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uQmFzZUJyYW5jaFByb3RlY3RlZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5iYXNlQnJhbmNoUHJvdGVjdGVkID09PSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uc09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXNldCA9IHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBvcGVyYXRpb25zID0gY2hhbmdlc2V0Py5vcGVyYXRpb25zLnJlYWQocmVhZGVyKSA/PyBbXTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uQmFzZUJyYW5jaFByb3RlY3RlZC5yZWFkKHJlYWRlcilcblx0XHRcdFx0PyBvcGVyYXRpb25zLmZpbHRlcihvcGVyYXRpb24gPT4gb3BlcmF0aW9uLmlkICE9PSBBR0VOVF9IT1NUX01FUkdFX0NIQU5HRVNFVF9PUEVSQVRJT05fSUQpXG5cdFx0XHRcdDogb3BlcmF0aW9ucztcblx0XHR9KTtcblxuXHRcdC8vIENoYW5nZXNcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0ID0gdGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBjaGFuZ2VzZXQ/LmNoYW5nZXMucmVhZChyZWFkZXIpID8/IFtdO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uTG9hZGluZ09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25Mb2FkaW5nID0gYWN0aXZlU2Vzc2lvbj8ubG9hZGluZy5yZWFkKHJlYWRlcikgPz8gdHJ1ZTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzTG9hZGluZyA9IHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNMb2FkaW5nT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRMb2FkaW5nID0gdGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0TG9hZGluZ09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uTG9hZGluZyB8fCBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c0xvYWRpbmcgfHwgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmc7XG5cdFx0fSk7XG5cblx0XHQvLyBBY3RpdmUgc2Vzc2lvbiBzdGF0ZVxuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblN0YXRlT2JzID0gdGhpcy5fZ2V0QWN0aXZlU2Vzc2lvblN0YXRlKCk7XG5cblx0XHQvLyBWaWV3IG1vZGVcblx0XHRjb25zdCBzdG9yZWRNb2RlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ2NoYW5nZXNWaWV3LnZpZXdNb2RlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0Y29uc3QgaW5pdGlhbE1vZGUgPSBzdG9yZWRNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuVHJlZSA/IENoYW5nZXNWaWV3TW9kZS5UcmVlIDogQ2hhbmdlc1ZpZXdNb2RlLkxpc3Q7XG5cdFx0dGhpcy5fdmlld01vZGVPYnMgPSBvYnNlcnZhYmxlVmFsdWU8Q2hhbmdlc1ZpZXdNb2RlPih0aGlzLCBpbml0aWFsTW9kZSk7XG5cblx0XHQvLyBSZXNldCBjaGFuZ2VzZXQgc2VsZWN0aW9uXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5zZXRDaGFuZ2VzZXRJZCh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkUmVwbGFjZVNlc3Npb24oKHsgZnJvbSwgdG8gfSkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbkNvbGxhcHNlU3RhdGUgPSB0aGlzLl9zZWN0aW9uQ29sbGFwc2VTdGF0ZUJ5U2Vzc2lvbi5nZXQoZnJvbS5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoc2VjdGlvbkNvbGxhcHNlU3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fc2VjdGlvbkNvbGxhcHNlU3RhdGVCeVNlc3Npb24uZGVsZXRlKGZyb20ucmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9zZWN0aW9uQ29sbGFwc2VTdGF0ZUJ5U2Vzc2lvbi5zZXQodG8ucmVzb3VyY2UsIHNlY3Rpb25Db2xsYXBzZVN0YXRlKTtcblx0XHRcdFx0dGhpcy5fc2VjdGlvbkNvbGxhcHNlU3RhdGVDaGFuZ2VkLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGV0YWlsc1ZpZXdTdGF0ZSA9IHRoaXMuX2RldGFpbHNWaWV3U3RhdGVCeVNlc3Npb24uZ2V0KGZyb20ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoZGV0YWlsc1ZpZXdTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzVmlld1N0YXRlQnlTZXNzaW9uLmRlbGV0ZShmcm9tLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzVmlld1N0YXRlQnlTZXNzaW9uLnNldCh0by5yZXNvdXJjZS50b1N0cmluZygpLCBkZXRhaWxzVmlld1N0YXRlKTtcblx0XHRcdFx0dGhpcy5fc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxzVmlld1N0YXRlVHJhbnNmZXJPYnMuc2V0KHsgZnJvbTogZnJvbS5yZXNvdXJjZSwgdG86IHRvLnJlc291cmNlIH0sIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWREZWxldGVTZXNzaW9uKHNlc3Npb24gPT4ge1xuXHRcdFx0dGhpcy5fZGVsZXRlU2Vzc2lvblZpZXdTdGF0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZERpc2NhcmROZXdTZXNzaW9uKHNlc3Npb24gPT4gdGhpcy5fZGVsZXRlU2Vzc2lvblZpZXdTdGF0ZShzZXNzaW9uLnJlc291cmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uKCh7IGZyb20gfSkgPT4gdGhpcy5fZGVsZXRlU2Vzc2lvblZpZXdTdGF0ZShmcm9tLnJlc291cmNlKSkpO1xuXG5cdFx0Ly8gR2xvYmFsIGNvbnRleHQga2V5c1xuXHRcdHRoaXMuX2JpbmRDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0c2V0U2VjdGlvbkNvbGxhcHNlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VjdGlvbjogQ2hhbmdlc1ZpZXdTZWN0aW9uLCBjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc2VjdGlvbkNvbGxhcHNlU3RhdGVCeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSkgPz8gREVGQVVMVF9TRUNUSU9OX0NPTExBUFNFX1NUQVRFO1xuXHRcdGlmIChjdXJyZW50W3NlY3Rpb25dID09PSBjb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50LCBbc2VjdGlvbl06IGNvbGxhcHNlZCB9O1xuXHRcdGlmIChuZXh0Lm90aGVyRmlsZXMgPT09IERFRkFVTFRfU0VDVElPTl9DT0xMQVBTRV9TVEFURS5vdGhlckZpbGVzICYmIG5leHQuY2hlY2tzID09PSBERUZBVUxUX1NFQ1RJT05fQ09MTEFQU0VfU1RBVEUuY2hlY2tzKSB7XG5cdFx0XHR0aGlzLl9zZWN0aW9uQ29sbGFwc2VTdGF0ZUJ5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2VjdGlvbkNvbGxhcHNlU3RhdGVCeVNlc3Npb24uc2V0KHNlc3Npb25SZXNvdXJjZSwgbmV4dCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NlY3Rpb25Db2xsYXBzZVN0YXRlQ2hhbmdlZC50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXREZXRhaWxzVmlld1N0YXRlKHNlc3Npb25SZXNvdXJjZTogVVJJLCB2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlKTogSUNoYW5nZXNEZXRhaWxzVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGV0YWlsc1ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpPy5bdmlld01vZGVdO1xuXHR9XG5cblx0c2V0RGV0YWlsc1ZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdmlld01vZGU6IENoYW5nZXNWaWV3TW9kZSwgc3RhdGU6IElDaGFuZ2VzRGV0YWlsc1ZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9kZXRhaWxzVmlld1N0YXRlQnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGlmIChzdHJ1Y3R1cmFsRXF1YWxzKGN1cnJlbnQ/Llt2aWV3TW9kZV0sIHN0YXRlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kZXRhaWxzVmlld1N0YXRlQnlTZXNzaW9uLnNldChrZXksIHsgLi4uY3VycmVudCwgW3ZpZXdNb2RlXTogc3RhdGUgfSk7XG5cdFx0dGhpcy5fc2F2ZVZpZXdTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlU2Vzc2lvblZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZWN0aW9uQ29sbGFwc2VTdGF0ZUJ5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5fc2VjdGlvbkNvbGxhcHNlU3RhdGVDaGFuZ2VkLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RldGFpbHNWaWV3U3RhdGVCeVNlc3Npb24uZGVsZXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0dGhpcy5fc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWRWaWV3U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PElTdG9yZWRDaGFuZ2VzVmlld1N0YXRlW10+KFNFU1NJT05fVklFV19TVEFURV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgW10pO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShlbnRyaWVzKSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoU0VTU0lPTl9WSUVXX1NUQVRFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGlmICh0eXBlb2YgZW50cnkuc2Vzc2lvblJlc291cmNlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoZW50cnkuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChlbnRyeS5kZXRhaWxzVmlld1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHNWaWV3U3RhdGVCeVNlc3Npb24uc2V0KHJlc291cmNlLnRvU3RyaW5nKCksIGVudHJ5LmRldGFpbHNWaWV3U3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NhdmVWaWV3U3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RldGFpbHNWaWV3U3RhdGVCeVNlc3Npb24uc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoU0VTU0lPTl9WSUVXX1NUQVRFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBJU3RvcmVkQ2hhbmdlc1ZpZXdTdGF0ZVtdID0gW107XG5cdFx0dGhpcy5fZGV0YWlsc1ZpZXdTdGF0ZUJ5U2Vzc2lvbi5mb3JFYWNoKChkZXRhaWxzVmlld1N0YXRlLCBzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0ZGV0YWlsc1ZpZXdTdGF0ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU0VTU0lPTl9WSUVXX1NUQVRFX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShlbnRyaWVzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHNldENoYW5nZXNldEZpbGVzUmV2aWV3U3RhdGUocmVzb3VyY2VzOiByZWFkb25seSBVUklbXSwgcmV2aWV3ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZXNldCA9IHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5nZXQoKTtcblx0XHRpZiAoIWNoYW5nZXNldCB8fCAhY2hhbmdlc2V0LnNldFJldmlld1N0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2hhbmdlc2V0LnNldFJldmlld1N0YXRlKHJlc291cmNlcywgcmV2aWV3ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlU2Vzc2lvblN0YXRlKCk6IElPYnNlcnZhYmxlPEFjdGl2ZVNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TdGF0ZU9icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPEFjdGl2ZVNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZD4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBsb2FkaW5nID0gdGhpcy5hY3RpdmVTZXNzaW9uTG9hZGluZ09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAobG9hZGluZykge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uQ2hhbmdlcyA9IGFjdGl2ZVNlc3Npb24/LmNoYW5nZXMucmVhZChyZWFkZXIpID8/IFtdO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gU2Vzc2lvbiBzdGF0ZVxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdO1xuXHRcdFx0Y29uc3QgZ2l0UmVwb3NpdG9yeSA9IHdvcmtzcGFjZUZvbGRlcj8uZ2l0UmVwb3NpdG9yeTtcblx0XHRcdGNvbnN0IGhhc0dpdFJlcG9zaXRvcnkgPSB0aGlzLmFjdGl2ZVNlc3Npb25IYXNHaXRSZXBvc2l0b3J5T2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgYnJhbmNoTmFtZSA9IGdpdFJlcG9zaXRvcnk/LmJyYW5jaE5hbWU7XG5cdFx0XHRjb25zdCBiYXNlQnJhbmNoTmFtZSA9IGdpdFJlcG9zaXRvcnk/LmJhc2VCcmFuY2hOYW1lO1xuXG5cdFx0XHRjb25zdCBpc01lcmdlQmFzZUJyYW5jaFByb3RlY3RlZCA9IGdpdFJlcG9zaXRvcnk/LmJhc2VCcmFuY2hQcm90ZWN0ZWQ7XG5cdFx0XHRjb25zdCBpc29sYXRpb25Nb2RlID0gZ2l0UmVwb3NpdG9yeT8ud29ya1RyZWVVcmkgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IElzb2xhdGlvbk1vZGUuV29ya3NwYWNlXG5cdFx0XHRcdDogSXNvbGF0aW9uTW9kZS5Xb3JrdHJlZTtcblxuXHRcdFx0Ly8gUHVsbCByZXF1ZXN0IHN0YXRlXG5cdFx0XHRjb25zdCBnaXRIdWJJbmZvID0gZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNQdWxsUmVxdWVzdCA9IGdpdEh1YkluZm8/LnB1bGxSZXF1ZXN0Py51cmkgIT09IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGhhc09wZW5QdWxsUmVxdWVzdCA9IGhhc1B1bGxSZXF1ZXN0ICYmXG5cdFx0XHRcdChnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lmljb24/LmlkID09PSBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0RHJhZnQuaWQgfHxcblx0XHRcdFx0XHRnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lmljb24/LmlkID09PSBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LmlkIHx8XG5cdFx0XHRcdFx0Z2l0SHViSW5mby5wdWxsUmVxdWVzdC5pY29uPy5pZCA9PT0gQ29kaWNvbi5naXRQdWxsUmVxdWVzdEVycm9yLmlkIHx8XG5cdFx0XHRcdFx0Z2l0SHViSW5mby5wdWxsUmVxdWVzdC5pY29uPy5pZCA9PT0gQ29kaWNvbi5naXRQdWxsUmVxdWVzdENvbW1lbnQuaWQpO1xuXG5cdFx0XHQvLyBSZXBvc2l0b3J5IHN0YXRlXG5cdFx0XHRjb25zdCBoYXNHaXRIdWJSZW1vdGUgPSBnaXRSZXBvc2l0b3J5Py5oYXNHaXRIdWJSZW1vdGUgPz8gZmFsc2U7XG5cdFx0XHRjb25zdCB1cHN0cmVhbUJyYW5jaE5hbWUgPSBnaXRSZXBvc2l0b3J5Py51cHN0cmVhbUJyYW5jaE5hbWU7XG5cdFx0XHRjb25zdCBpbmNvbWluZ0NoYW5nZXMgPSBnaXRSZXBvc2l0b3J5Py5pbmNvbWluZ0NoYW5nZXMgPz8gMDtcblx0XHRcdGNvbnN0IG91dGdvaW5nQ2hhbmdlcyA9IGdpdFJlcG9zaXRvcnk/Lm91dGdvaW5nQ2hhbmdlcyA/PyAwO1xuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRDaGFuZ2VzID0gZ2l0UmVwb3NpdG9yeT8udW5jb21taXR0ZWRDaGFuZ2VzID8/IDA7XG5cdFx0XHRjb25zdCBoYXNCcmFuY2hDaGFuZ2VzID0gYWN0aXZlU2Vzc2lvbkNoYW5nZXMubGVuZ3RoID4gMDtcblx0XHRcdGNvbnN0IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPSBnaXRSZXBvc2l0b3J5Py5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzID8/IGZhbHNlO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpc29sYXRpb25Nb2RlLFxuXHRcdFx0XHRoYXNHaXRSZXBvc2l0b3J5LFxuXHRcdFx0XHRicmFuY2hOYW1lLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZSxcblx0XHRcdFx0aXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWQsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHRcdFx0aW5jb21pbmdDaGFuZ2VzLFxuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXMsXG5cdFx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlcyxcblx0XHRcdFx0aGFzQnJhbmNoQ2hhbmdlcyxcblx0XHRcdFx0aGFzR2l0SHViUmVtb3RlLFxuXHRcdFx0XHRoYXNQdWxsUmVxdWVzdCxcblx0XHRcdFx0aGFzT3BlblB1bGxSZXF1ZXN0LFxuXHRcdFx0XHRoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzXG5cdFx0XHR9IHNhdGlzZmllcyBBY3RpdmVTZXNzaW9uU3RhdGU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFscyB9LFxuXHRcdFx0cmVhZGVyID0+IGFjdGl2ZVNlc3Npb25TdGF0ZU9icy5yZWFkKHJlYWRlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlU2Vzc2lvblJldmlld0NvbW1lbnRzKCk6IElPYnNlcnZhYmxlPE1hcDxzdHJpbmcsIG51bWJlcj4+IHtcblx0XHRyZXR1cm4gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0XHRjb25zdCBwclJldmlld1N0YXRlID0gdGhpcy5jb2RlUmV2aWV3U2VydmljZS5nZXRQUlJldmlld1N0YXRlKHNlc3Npb25SZXNvdXJjZSkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHByUmV2aWV3U3RhdGUua2luZCA9PT0gUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY29tbWVudCBvZiBwclJldmlld1N0YXRlLmNvbW1lbnRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXJpS2V5ID0gY29tbWVudC51cmkuZnNQYXRoO1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQodXJpS2V5LCAocmVzdWx0LmdldCh1cmlLZXkpID8/IDApICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2ZVNlc3Npb25BZ2VudEZlZWRiYWNrKCk6IElPYnNlcnZhYmxlPE1hcDxzdHJpbmcsIG51bWJlcj4+IHtcblx0XHRjb25zdCBkaWRDaGFuZ2VGZWVkYmFja1NpZ25hbCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5hZ2VudEZlZWRiYWNrU2VydmljZS5vbkRpZENoYW5nZUZlZWRiYWNrKTtcblxuXHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmFnZW50RmVlZGJhY2tTZXJ2aWNlLmFjdGl2ZUZlZWRiYWNrU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0ZGlkQ2hhbmdlRmVlZGJhY2tTaWduYWwucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBmZWVkYmFja0l0ZW1zID0gdGhpcy5hZ2VudEZlZWRiYWNrU2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBmZWVkYmFja0l0ZW1zKSB7XG5cdFx0XHRcdGlmICghaXRlbS5zb3VyY2VQUlJldmlld0NvbW1lbnRJZCAmJiBpdGVtLnN0YXRlICE9PSBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRjb25zdCB1cmlLZXkgPSBpdGVtLnJlc291cmNlVXJpLmZzUGF0aDtcblx0XHRcdFx0XHRyZXN1bHQuc2V0KHVyaUtleSwgKHJlc3VsdC5nZXQodXJpS2V5KSA/PyAwKSArIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmluZENvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5PGJvb2xlYW4+KENoYW5nZXNldFJldmlld1N1cHBvcnRDb250ZXh0LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0ID0gdGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBjaGFuZ2VzZXQ/LmNhcGFiaWxpdGllcz8ucmV2aWV3ID09PSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5PHN0cmluZ1tdPihDaGFuZ2VzZXRSZXZpZXdlZEZpbGVzQ29udGV4dCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0cmV0dXJuIGNoYW5nZXNcblx0XHRcdFx0LmZpbHRlcihjaGFuZ2UgPT4gY2hhbmdlLnJldmlld2VkKVxuXHRcdFx0XHQubWFwKGNoYW5nZSA9PiBjaGFuZ2UubW9kaWZpZWRVcmk/LnRvU3RyaW5nKCkgPz8gY2hhbmdlLm9yaWdpbmFsVXJpPy50b1N0cmluZygpKVxuXHRcdFx0XHQuZmlsdGVyKCh1cmk6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gdXJpICE9PSB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNoYW5nZXNldE9wZXJhdGlvbkNvdW50T2JzID0gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGU8bnVtYmVyPih0aGlzLCAocmVhZGVyLCBsYXN0VmFsdWUpID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXNldCA9IHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWNoYW5nZXNldCkge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlID8/IDA7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25zT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBvcGVyYXRpb25zLmZpbHRlcihvcCA9PiBvcC5zY29wZXMuaW5jbHVkZXMoU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldCkpLmxlbmd0aDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5PGJvb2xlYW4+KENoYW5nZXNldEhhc09wZXJhdGlvbnNDb250ZXh0LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIGNoYW5nZXNldE9wZXJhdGlvbkNvdW50T2JzLnJlYWQocmVhZGVyKSA+IDA7XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsU0FBUyxTQUFTLDRCQUE0QixhQUErQyxrQkFBa0IsMkJBQTJCLGlCQUFpQixtQkFBbUI7QUFDdkwsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQixxQkFBcUI7QUFDbEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBNEUsc0NBQXNDO0FBQ2xILFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsb0JBQW9CLDZCQUE2QjtBQUMxRCxTQUFTLG9CQUFvQix5QkFBeUI7QUFDdEQsU0FBUyxpQkFBaUIscUJBQXFCO0FB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
