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
import { disposableTimeout, raceCancellation, raceCancellationError } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { arrayEquals, structuralEquals } from "../../../../../base/common/equals.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString, markdownStringEqual } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { equals } from "../../../../../base/common/objects.js";
import { constObservable, derived, derivedOpts, observableValueOpts, subtransaction, transaction, waitForState, autorun, observableValue } from "../../../../../base/common/observable.js";
import { isEqual, isEqualOrParent, relativePath } from "../../../../../base/common/resources.js";
import { themeColorFromId } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { localize } from "../../../../../nls.js";
import { AgentSession, protectedResourcesRequireGitHubCopilotSignIn } from "../../../../../platform/agentHost/common/agent.js";
import { getCustomizationDisabledReason, isCustomizationEnabled, withCustomizationEnablement } from "../../../../../platform/agentHost/common/customizationEnablement.js";
import { buildAnnotationsUri } from "../../../../../platform/agentHost/common/annotationsUri.js";
import { parseGitHubIssueUrl } from "../../../../../platform/agentHost/common/githubIssueReferences.js";
import { getEffectiveAgents } from "../../../../../platform/agentHost/common/customAgents.js";
import { KNOWN_MODE_VALUES, SessionConfigKey } from "../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { migrateLegacyAutopilotConfig } from "../../../../../platform/agentHost/common/agentHostSchema.js";
import { ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, CustomizationEnablementKind, CustomizationType, SessionStatus as ProtocolSessionStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType, isChatAction, isSessionAction, NotificationType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildChatUri, buildDefaultChatUri, getSessionRelatedPullRequestUrls, isDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionEhcliAdoptable, readSessionExternal, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, ROOT_STATE_URI, SESSION_META_MULTI_ROOT_KEY, SessionSourceControlOutcome, StateComponents, withSessionExternal, withSessionMultiRootMetadata, withSessionStatusFlag, withSessionWorkspaceless } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { AgentHostDownloadProgress } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostDownloadProgress.js";
import { areCustomizationScopeRootsEqual, IAgentHostActiveClientService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { ChatMode } from "../../../../../workbench/contrib/chat/common/chatModes.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { isAutoApprovePolicyRestricted, normalizeSessionConfigValue } from "../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { getRegisteredLanguageModels, resolveConfiguredModel, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { buildMutableConfigSchema, resolvedConfigsEqual } from "../../../../common/agentHostSessionsProvider.js";
import { agentHostSessionWorkspaceKey } from "../../../../common/agentHostSessionWorkspace.js";
import { isSessionConfigComplete } from "../../../../common/sessionConfig.js";
import { ChatInteractivity, ChatOriginKind, DEFAULT_CHAT_CAPABILITIES, effectiveChatInteractivity, sessionFileChangesEqual, sessionWorkspaceEqual, SessionStatus, SessionTypeAuthRequirement, toSessionId } from "../../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { computeSessionPullRequestIcon } from "../../../github/browser/pullRequestIconStatus.js";
import { IPullRequestIconCache } from "../../../github/browser/pullRequestIconCache.js";
import { mapProtocolStatus } from "./agentHostDiffs.js";
import { createChangesets } from "./agentHostSessionChangesets.js";
import { createSessionOutputObs } from "./agentHostSessionFiles.js";
const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = "sessions.agentHost.sessionConfigPicker.selectedValues";
const UNSAFE_SESSION_CONFIG_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
const SEEDED_CONFIG_SCHEMA_KEYS = [SessionConfigKey.Isolation, SessionConfigKey.Branch];
class ActiveClientSyncCancellationTokenSource extends CancellationTokenSource {
  dispose() {
    super.dispose(true);
  }
}
const WORKTREE_ISOLATION_VALUE = "worktree";
function isWorktreeIsolation(values) {
  return values?.[SessionConfigKey.Isolation] === WORKTREE_ISOLATION_VALUE;
}
const CACHED_SESSIONS_MAX_PER_HOST = 100;
const SESSION_STATUS_FLAG_MASK = ProtocolSessionStatus.IsRead | ProtocolSessionStatus.IsArchived;
function serializeMetadata(meta) {
  return {
    session: meta.session.toString(),
    startTime: meta.startTime,
    modifiedTime: meta.modifiedTime,
    summary: meta.summary,
    workingDirectory: meta.workingDirectories?.[0]?.toString(),
    status: meta.status !== void 0 ? meta.status & SESSION_STATUS_FLAG_MASK : void 0,
    project: meta.project ? { uri: meta.project.uri.toString(), displayName: meta.project.displayName } : void 0,
    workspaceless: readSessionWorkspaceless(meta._meta) || void 0,
    external: readSessionExternal(meta._meta) || void 0,
    multiRoot: readSessionMultiRootMetadata(meta._meta)
  };
}
function deserializeMetadata(raw) {
  try {
    let _meta = withSessionWorkspaceless(void 0, raw.workspaceless === true);
    _meta = withSessionExternal(_meta, raw.external === true);
    _meta = withSessionMultiRootMetadata(_meta, readSessionMultiRootMetadata({ [SESSION_META_MULTI_ROOT_KEY]: raw.multiRoot }));
    return {
      session: URI.parse(raw.session),
      startTime: raw.startTime,
      modifiedTime: raw.modifiedTime,
      summary: raw.summary,
      workingDirectories: raw.workingDirectory ? [URI.parse(raw.workingDirectory)] : void 0,
      status: deserializeStatus(raw),
      project: raw.project ? { uri: URI.parse(raw.project.uri), displayName: raw.project.displayName } : void 0,
      ..._meta ? { _meta } : {}
    };
  } catch {
    return void 0;
  }
}
function deserializeStatus(raw) {
  const legacyArchived = raw.isArchived ?? raw.isDone;
  if (raw.isRead === void 0 && legacyArchived === void 0) {
    return raw.status !== void 0 ? raw.status & SESSION_STATUS_FLAG_MASK : void 0;
  }
  let status = (raw.status ?? ProtocolSessionStatus.Idle) & SESSION_STATUS_FLAG_MASK;
  if (raw.isRead !== void 0) {
    status = withSessionStatusFlag(status, ProtocolSessionStatus.IsRead, raw.isRead);
  }
  if (legacyArchived !== void 0) {
    status = withSessionStatusFlag(status, ProtocolSessionStatus.IsArchived, legacyArchived);
  }
  return status;
}
function isRememberedSessionConfigKey(property) {
  return property !== SessionConfigKey.Branch && !UNSAFE_SESSION_CONFIG_KEYS.has(property);
}
function normalizeAutoApproveValue(value, policyRestricted) {
  const normalized = getChatPermissionLevelFromDefaultConfiguration(value) ?? (isChatPermissionLevel(value) ? value : void 0);
  if (!normalized) {
    return void 0;
  }
  if (policyRestricted && normalized !== ChatPermissionLevel.Default) {
    return ChatPermissionLevel.Default;
  }
  return normalized;
}
function isGitHubInfoEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a === void 0 || b === void 0) {
    return false;
  }
  return a.owner === b.owner && a.repo === b.repo && arrayEquals(a.pullRequests ?? [], b.pullRequests ?? [], (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number && isEqual(x.uri, y.uri) && x.icon?.id === y.icon?.id) && a.pullRequest?.number === b.pullRequest?.number && a.pullRequest?.icon?.id === b.pullRequest?.icon?.id && a.pullRequest?.baseRefOid === b.pullRequest?.baseRefOid && a.pullRequest?.headRefOid === b.pullRequest?.headRefOid && arrayEquals(a.issues ?? [], b.issues ?? [], (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number);
}
function dateEquals(a, b) {
  return a?.getTime() === b?.getTime();
}
function markdownStringEquals(a, b) {
  return a === b || !!a && !!b && markdownStringEqual(a, b);
}
function toGitHubIssueRefs(issueUrls) {
  const refs = [];
  for (const url of issueUrls ?? []) {
    const reference = parseGitHubIssueUrl(url);
    if (reference) {
      refs.push({ ...reference, uri: URI.parse(url) });
    }
  }
  return refs.length > 0 ? refs : void 0;
}
function toGitHubPullRequestRefs(pullRequestUrls) {
  const refs = [];
  for (const url of pullRequestUrls ?? []) {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(url);
    if (!match) {
      continue;
    }
    refs.push({
      owner: match[1],
      repo: match[2],
      number: Number(match[3]),
      uri: URI.parse(url)
    });
  }
  return refs.length > 0 ? refs : void 0;
}
function toGitHubInfo(meta) {
  const state = readSessionGitHubState(meta);
  const gitState = readSessionGitState(meta);
  const pullRequests = toGitHubPullRequestRefs(getSessionRelatedPullRequestUrls(state));
  const pullRequest = pullRequests?.[0];
  const repository = state?.owner && state.repo ? { owner: state.owner, repo: state.repo } : gitState?.githubOwner && gitState.githubRepo ? { owner: gitState.githubOwner, repo: gitState.githubRepo } : pullRequest;
  if (!repository) {
    return void 0;
  }
  return {
    owner: repository.owner,
    repo: repository.repo,
    pullRequests,
    pullRequest: pullRequest ? {
      number: pullRequest.number,
      uri: pullRequest.uri
    } : void 0,
    issues: toGitHubIssueRefs(state?.issueUrls)
  };
}
const CopilotCLISessionType = {
  id: "copilotcli",
  label: localize("copilotCLI", "Copilot"),
  icon: Codicon.copilot,
  supportsWorktreeConfiguration: true,
  authRequirement: SessionTypeAuthRequirement.GitHub
};
function resolveAgentAuthRequirement(agent) {
  if (!agent.protectedResources || protectedResourcesRequireGitHubCopilotSignIn(agent.protectedResources)) {
    return SessionTypeAuthRequirement.GitHub;
  }
  return agent.models.length > 0 ? SessionTypeAuthRequirement.None : SessionTypeAuthRequirement.Unusable;
}
const WorkspaceSessionKind = {
  isQuickChat: false,
  requiresWorkspace: true,
  get untitledTitle() {
    return localize("new session", "New Session");
  },
  computeWorkspace: (buildWorkspace) => buildWorkspace()
};
const QuickChatSessionKind = {
  isQuickChat: true,
  requiresWorkspace: false,
  get untitledTitle() {
    return localize("new chat", "New Chat");
  },
  computeWorkspace: () => void 0
};
function sessionKind(isQuickChat) {
  return isQuickChat ? QuickChatSessionKind : WorkspaceSessionKind;
}
function toChatInteractivity(interactivity) {
  switch (interactivity) {
    case ProtocolChatInteractivity.ReadOnly:
      return ChatInteractivity.ReadOnly;
    case ProtocolChatInteractivity.Hidden:
      return ChatInteractivity.Hidden;
    default:
      return ChatInteractivity.Full;
  }
}
class AdditionalChat extends Disposable {
  constructor(resource, summary, isNew = false, parentChat, sessionIsArchived = constObservable(false), lastTurnChanges, sessionIsReadOnly = constObservable(false)) {
    super();
    const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : /* @__PURE__ */ new Date();
    this._title = observableValue("chatTitle", summary.title || localize("newChatTab", "New Chat"));
    this._status = observableValue("chatStatus", mapProtocolStatus(summary.status));
    this._updatedAt = observableValueOpts({ owner: this, debugName: "chatUpdatedAt", equalsFn: dateEquals }, modifiedAt);
    this._modelId = observableValue("chatModelId", void 0);
    this._mode = observableValueOpts({ owner: this, debugName: "chatMode", equalsFn: structuralEquals }, void 0);
    this._description = observableValueOpts({ owner: this, debugName: "chatDescription", equalsFn: markdownStringEquals }, summary.activity ? new MarkdownString().appendText(summary.activity) : void 0);
    this._lastTurnEnd = observableValueOpts({ owner: this, debugName: "chatLastTurnEnd", equalsFn: dateEquals }, modifiedAt);
    this._interactivity = observableValue("chatInteractivity", toChatInteractivity(summary.interactivity));
    this._isNew = observableValue("chatIsNew", isNew);
    this.chat = {
      resource,
      createdAt: modifiedAt,
      title: this._title,
      updatedAt: this._updatedAt,
      status: derived((reader) => this._isNew.read(reader) ? SessionStatus.Untitled : this._status.read(reader)),
      changes: constObservable([]),
      lastTurnChanges,
      checkpoints: observableValue(this, void 0),
      modelId: this._modelId,
      mode: this._mode,
      isArchived: sessionIsArchived,
      isRead: constObservable(true),
      // An archived session is read-only, as is one whose environment is gone and whose
      // history is being replayed: force every chat's interactivity to ReadOnly so the chat
      // view hides the composer and gates mutating actions.
      interactivity: derived((reader) => effectiveChatInteractivity(
        sessionIsArchived.read(reader) || sessionIsReadOnly.read(reader),
        this._interactivity.read(reader)
      )),
      description: this._description,
      lastTurnEnd: this._lastTurnEnd,
      origin: summary.origin ? {
        kind: toSessionChatOriginKind(summary.origin.kind),
        parentChat,
        ...summary.origin.kind === ProtocolChatOriginKind.Fork || summary.origin.kind === ProtocolChatOriginKind.SideChat ? { turnId: summary.origin.turnId } : {},
        ...summary.origin.kind === ProtocolChatOriginKind.SideChat && summary.origin.selection ? { selection: toSessionSideChatSelection(summary.origin.selection) } : {}
      } : void 0,
      // Subagent (tool-origin) worker chats are transient children and can be
      // neither renamed nor deleted; other peer chats are fully manageable.
      capabilities: constObservable(
        summary.origin?.kind === ProtocolChatOriginKind.Tool ? { canRename: false, canDelete: false } : DEFAULT_CHAT_CAPABILITIES
      )
    };
  }
  update(summary) {
    const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : this._updatedAt.get();
    transaction((tx) => {
      this._title.set(summary.title || localize("newChatTab", "New Chat"), tx);
      this._status.set(mapProtocolStatus(summary.status), tx);
      this._updatedAt.set(modifiedAt, tx);
      this._description.set(summary.activity ? new MarkdownString().appendText(summary.activity) : void 0, tx);
      this._lastTurnEnd.set(modifiedAt, tx);
      this._interactivity.set(toChatInteractivity(summary.interactivity), tx);
    });
  }
  /** Optimistically update the chat title ahead of the host's `chatUpdated`. */
  setTitle(title) {
    this._title.set(title || localize("newChatTab", "New Chat"), void 0);
  }
  /** Present as `Untitled` until the first request is sent so the view shows the composer. */
  markNew() {
    this._isNew.set(true, void 0);
  }
  /** Clear the `new` presentation after the first request is sent. */
  markSent() {
    this._isNew.set(false, void 0);
  }
  setModelId(modelId) {
    this._modelId.set(modelId, void 0);
  }
  setAgent(agent) {
    this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : void 0, void 0);
  }
}
function toSessionChatOriginKind(kind) {
  switch (kind) {
    case ChatOriginKind.Tool:
      return ChatOriginKind.Tool;
    case ChatOriginKind.Fork:
      return ChatOriginKind.Fork;
    case ChatOriginKind.SideChat:
      return ChatOriginKind.SideChat;
    default:
      return ChatOriginKind.User;
  }
}
function toSessionSideChatSelection(selection) {
  return {
    text: selection.text,
    ...selection.responsePartId ? { responsePartId: selection.responsePartId } : {}
  };
}
let AgentHostSessionAdapter = class extends Disposable {
  constructor(metadata, providerId, resourceScheme, logicalSessionType, _options, _gitHubService, _sessionsService, _pullRequestIconCache) {
    super();
    this._options = _options;
    this._gitHubService = _gitHubService;
    this._sessionsService = _sessionsService;
    this._pullRequestIconCache = _pullRequestIconCache;
    this.isAutomation = observableValue("isAutomation", false);
    this.isArchived = observableValue("isArchived", false);
    // Read/unread state is owned by the provider and backed by the agent host
    // protocol's `IsRead` status bit (persisted as session metadata). It is
    // seeded from the session metadata, kept in sync with protocol updates, and
    // mutated via {@link BaseAgentHostSessionsProvider.setSessionReadState}.
    this.isRead = observableValue("isRead", true);
    /**
     * Independent title override for the default chat tab. `undefined` means the
     * default chat inherits the session title; a non-empty value means the user
     * (or host) renamed the default chat independently of the session.
     */
    this._defaultChatTitleOverride = observableValue("defaultChatTitleOverride", void 0);
    /**
     * Independent status override for the default chat tab. `undefined` means the
     * default chat reflects the aggregated session status (the single-chat case,
     * where they are equivalent); a defined value means a multi-chat session, so
     * the default chat shows its own status rather than the session aggregate
     * (which may have been promoted by a running peer chat).
     */
    this._defaultChatStatusOverride = observableValue("defaultChatStatusOverride", void 0);
    /** Whether this session was created with worktree isolation. */
    this._worktreeIsolation = observableValue("worktreeIsolation", false);
    /** Interactivity of the default chat. Driven from the default chat's protocol summary. */
    this._defaultChatInteractivity = observableValue("defaultChatInteractivity", ChatInteractivity.Full);
    /** Additional (non-default) peer chats keyed by chatId. */
    this._additionalChats = this._register(new DisposableMap());
    this._sessionOutputCache = /* @__PURE__ */ new Map();
    /** Chat ids that have not yet sent their first request (presented as `Untitled`). */
    this._newChatIds = /* @__PURE__ */ new Set();
    this._changesSummary = observableValueOpts({ equalsFn: structuralEquals }, void 0);
    const rawId = AgentSession.id(metadata.session);
    const agentProvider = AgentSession.provider(metadata.session);
    if (!agentProvider) {
      throw new Error(`Agent session URI has no provider scheme: ${metadata.session.toString()}`);
    }
    this.agentProvider = agentProvider;
    this.backendUri = AgentSession.uri(_options.backendSessionScheme ?? agentProvider, rawId);
    this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
    this._rawId = rawId;
    this._resourceScheme = resourceScheme;
    this.sessionId = toSessionId(providerId, this.resource);
    this.providerId = providerId;
    this.sessionType = logicalSessionType;
    this._isQuickChat = observableValue("isQuickChat", readSessionWorkspaceless(metadata._meta));
    this.icon = _options.icon;
    this.createdAt = new Date(metadata.startTime);
    this.title = observableValue("title", metadata.summary || `Session ${rawId.substring(0, 8)}`);
    this.updatedAt = observableValue("updatedAt", new Date(metadata.modifiedTime));
    this.modelSelection = void 0;
    this.status = observableValue("status", metadata.status !== void 0 ? mapProtocolStatus(metadata.status) : SessionStatus.Completed);
    this.modelId = observableValue("modelId", void 0);
    this.mode = observableValueOpts({ owner: this, debugName: "mode", equalsFn: structuralEquals }, void 0);
    this.lastTurnEnd = observableValue("lastTurnEnd", metadata.modifiedTime ? new Date(metadata.modifiedTime) : void 0);
    this._activity = observableValue("activity", metadata.activity);
    this._project = metadata.project;
    this._workingDirectories = metadata.workingDirectories;
    this._meta = metadata._meta;
    this._metaObs = observableValue("agentHostSessionMeta", this._meta);
    const baseGitHubInfoObs = derivedOpts({
      equalsFn: isGitHubInfoEqual
    }, (reader) => {
      return toGitHubInfo(this._metaObs.read(reader));
    });
    const gitHubInfoWithIcon = derived(this, (reader) => {
      const baseGitHubInfo = baseGitHubInfoObs.read(reader);
      if (!baseGitHubInfo?.pullRequest) {
        return baseGitHubInfo;
      }
      const icon = computeSessionPullRequestIcon(reader, this._gitHubService, this._pullRequestIconCache, baseGitHubInfo);
      return {
        ...baseGitHubInfo,
        pullRequests: baseGitHubInfo.pullRequests?.map((pullRequest, index) => index === 0 ? {
          ...pullRequest,
          icon
        } : pullRequest),
        pullRequest: {
          ...baseGitHubInfo.pullRequest,
          icon
        }
      };
    });
    this.gitHubInfo = derivedOpts({ owner: this, equalsFn: isGitHubInfoEqual }, (reader) => gitHubInfoWithIcon.read(reader));
    this.completedStateIcon = derived(this, (reader) => {
      const sourceControlState = readSessionSourceControlState(this._metaObs.read(reader));
      if (sourceControlState?.latestOutcome === SessionSourceControlOutcome.Merge) {
        return { ...Codicon.gitMerge, color: themeColorFromId("charts.purple") };
      }
      return this.gitHubInfo.read(reader)?.pullRequest?.icon;
    });
    const initialWorkspace = this._computeWorkspace();
    this.workspace = observableValue("workspace", initialWorkspace);
    this.isQuickChat = this._isQuickChat;
    this.worktreePending = derived(this, (reader) => this._worktreeIsolation.read(reader) && !this.workspace.read(reader)?.folders.some((folder) => !!folder.gitRepository?.workTreeUri));
    this.loading = _options.loading;
    this.description = derivedOpts({ owner: this, equalsFn: markdownStringEquals }, (reader) => {
      const status = this.status.read(reader);
      if (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) {
        const activity = this._activity.read(reader);
        if (activity) {
          return new MarkdownString().appendText(activity);
        }
      }
      return void 0;
    });
    if (isSessionStatusArchived(metadata.status)) {
      this.isArchived.set(true, void 0);
    }
    if (metadata.status !== void 0) {
      this.isRead.set(isSessionStatusRead(metadata.status), void 0);
    }
    this.isActiveSessionObs = derived(this, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return isEqual(activeSession?.resource, this.resource);
    });
    this.setChangesSummary(metadata.changes);
    this.changesets = observableValue(this, void 0);
    this.changes = this._createChangesObs();
    const sessionOutput = createSessionOutputObs(
      this.backendUri,
      this._options,
      this.isActiveSessionObs,
      this.isArchived,
      this.workspace,
      this._sessionOutputCache
    );
    this._sessionOutput = sessionOutput;
    this.externalChanges = sessionOutput.externalFiles;
    const mainChat = {
      resource: this.resource,
      createdAt: this.createdAt,
      title: derived(this, (reader) => this._defaultChatTitleOverride.read(reader) ?? this.title.read(reader)),
      updatedAt: this.updatedAt,
      status: derived(this, (reader) => this._defaultChatStatusOverride.read(reader) ?? this.status.read(reader)),
      changes: this.changes,
      lastTurnChanges: sessionOutput.getLastTurnChanges(URI.parse(buildDefaultChatUri(this.backendUri))),
      checkpoints: observableValue(this, void 0),
      modelId: this.modelId,
      mode: this.mode,
      isArchived: this.isArchived,
      isRead: this.isRead,
      // An archived session is read-only, as is one whose environment is gone and whose
      // history is being replayed: force the default chat's interactivity to ReadOnly so the
      // chat view hides the composer and gates mutating actions.
      interactivity: derived(this, (reader) => effectiveChatInteractivity(
        this.isArchived.read(reader) || (this._options.readOnly?.read(reader) ?? false),
        this._defaultChatInteractivity.read(reader)
      )),
      description: this.description,
      lastTurnEnd: this.lastTurnEnd
    };
    this._defaultChat = mainChat;
    this._mainChatObs = observableValue(this, mainChat);
    this._chatsObs = observableValueOpts({ owner: this, equalsFn: arrayEquals }, [mainChat]);
    this.mainChat = this._mainChatObs;
    this.chats = this._chatsObs;
    this.capabilities = derivedOpts({ owner: this, equalsFn: structuralEquals }, (reader) => {
      const agentCapabilities = this._options.agentCapabilities.read(reader)?.get(this.agentProvider);
      return {
        supportsMultipleChats: !this.isQuickChat.read(reader) && agentCapabilities?.multipleChats !== void 0,
        supportsFork: agentCapabilities?.multipleChats?.fork ?? false,
        supportsSideChat: agentCapabilities?.multipleChats?.sideChat ?? false,
        supportsRename: true,
        supportsDelete: true
      };
    });
    this._register(autorun((reader) => {
      this.capabilities.read(reader);
      const state = this._lastCatalogState;
      if (state) {
        this._applyChatCatalog(state);
      }
    }));
  }
  /** Working-directory set used to resolve session customizations. */
  get workingDirectories() {
    return this._workingDirectories ?? [];
  }
  /** Session-kind strategy (quick chat vs. workspace), derived from {@link _isQuickChat}. */
  get _kind() {
    return sessionKind(this._isQuickChat.get());
  }
  get changesSummary() {
    return this._changesSummary;
  }
  /**
   * Sets the aggregate change chip. Callers inside a transaction MUST pass it
   * — a `set` without one builds and finishes its own transaction, notifying
   * observers before the enclosing update has applied its remaining fields.
   */
  setChangesSummary(changes, tx) {
    if (!changes) {
      return false;
    }
    const { additions, deletions, files } = changes;
    const currentChangesSummary = this._changesSummary.get();
    if ((currentChangesSummary?.files ?? 0) === (files ?? 0) && (currentChangesSummary?.additions ?? 0) === (additions ?? 0) && (currentChangesSummary?.deletions ?? 0) === (deletions ?? 0)) {
      return false;
    }
    this._changesSummary.set({
      additions: additions ?? 0,
      deletions: deletions ?? 0,
      files: files ?? 0
    }, tx);
    return true;
  }
  /**
   * Reconcile the per-chat catalog from an AHP {@link SessionState}.
   *
   * The default chat (resource == this session's resource) always maps to
   * {@link _defaultChat}. Additional peer chats become their own {@link IChat}
   * whose resource carries the chatId in the URI fragment so the chat view
   * opens a distinct widget that the session handler routes to the matching
   * chat channel.
   *
   * A non-default chat surfaces as a peer tab when the session supports
   * multiple chats (the `copilotcli` case) OR when it is a subagent
   * (tool-origin) chat. Subagent chats are always surfaced as read-only peers
   * — independent of multi-chat support — so the user can review a worker's
   * transcript (the agent-team pattern). Sessions with no surfaced peers
   * degrade to `[defaultChat]`.
   */
  applyChatCatalog(state) {
    this._lastCatalogState = state;
    this._applyChatCatalog(state);
  }
  _applyChatCatalog(state) {
    const defaultChatUri = state.defaultChat?.toString();
    const isDefault = (summary) => defaultChatUri ? summary.resource.toString() === defaultChatUri : isDefaultChatUri(summary.resource);
    const defaultSummary = state.chats.find(isDefault);
    this._defaultChatTitleOverride.set(defaultSummary?.title || void 0, void 0);
    this._defaultChatInteractivity.set(toChatInteractivity(defaultSummary?.interactivity), void 0);
    const surfacesAsPeer = (summary) => !isDefault(summary) && !!parseChatUri(summary.resource)?.chatId && (this.capabilities.get().supportsMultipleChats || summary.origin?.kind === ProtocolChatOriginKind.Tool || summary.origin?.kind === ProtocolChatOriginKind.SideChat);
    if (!state.chats.some(surfacesAsPeer)) {
      this._defaultChatStatusOverride.set(void 0, void 0);
      if (this._additionalChats.size > 0) {
        this._additionalChats.clearAndDisposeAll();
      }
      if (this._chatsObs.get().length !== 1 || this._chatsObs.get()[0] !== this._defaultChat) {
        transaction((tx) => {
          this._chatsObs.set([this._defaultChat], tx);
          this._mainChatObs.set(this._defaultChat, tx);
        });
      }
      return;
    }
    this._defaultChatStatusOverride.set(defaultSummary ? mapProtocolStatus(defaultSummary.status) : void 0, void 0);
    const seen = /* @__PURE__ */ new Set();
    const ordered = [];
    for (const summary of state.chats) {
      if (isDefault(summary)) {
        ordered.push(this._defaultChat);
        continue;
      }
      if (!surfacesAsPeer(summary)) {
        continue;
      }
      const chatId = parseChatUri(summary.resource).chatId;
      seen.add(chatId);
      let entry = this._additionalChats.get(chatId);
      if (!entry) {
        entry = this._createAdditionalChat(chatId, summary);
        this._additionalChats.set(chatId, entry);
      } else {
        entry.update(summary);
      }
      ordered.push(entry.chat);
    }
    for (const chatId of [...this._additionalChats.keys()]) {
      if (!seen.has(chatId)) {
        this._additionalChats.deleteAndDispose(chatId);
      }
    }
    const main = defaultChatUri && ordered.find((c) => isEqual(c.resource, this.resource)) || this._defaultChat;
    transaction((tx) => {
      this._chatsObs.set(ordered.length > 0 ? ordered : [this._defaultChat], tx);
      this._mainChatObs.set(main, tx);
    });
  }
  _createAdditionalChat(chatId, summary) {
    const resource = URI.from({ scheme: this._resourceScheme, path: `/${this._rawId}`, fragment: chatId });
    const lastTurnChanges = this._sessionOutput.getLastTurnChanges(URI.parse(summary.resource));
    return new AdditionalChat(resource, summary, this._newChatIds.has(chatId), this._resolveParentChatResource(summary.origin), this.isArchived, lastTurnChanges, this._options.readOnly);
  }
  /**
   * Maps a protocol parent-chat URI (from a Tool/Fork {@link ChatSummary.origin})
   * to this session's UI chat resource: the default chat maps to the session
   * resource; peer chats carry their chatId in the resource fragment.
   */
  _resolveParentChatResource(origin) {
    const parentUri = origin && (origin.kind === ProtocolChatOriginKind.Tool || origin.kind === ProtocolChatOriginKind.Fork || origin.kind === ProtocolChatOriginKind.SideChat) ? origin.chat : void 0;
    if (!parentUri) {
      return void 0;
    }
    if (isDefaultChatUri(parentUri)) {
      return this.resource;
    }
    const parentChatId = parseChatUri(parentUri)?.chatId;
    return parentChatId ? URI.from({ scheme: this._resourceScheme, path: `/${this._rawId}`, fragment: parentChatId }) : this.resource;
  }
  /** Mark a peer chat new so it shows as `Untitled` until its first request. */
  markChatAsNew(chatId) {
    this._newChatIds.add(chatId);
    this._additionalChats.get(chatId)?.markNew();
  }
  /** Clear the `new` flag after the chat's first request is sent. */
  markChatAsSent(chatId) {
    this._newChatIds.delete(chatId);
    this._additionalChats.get(chatId)?.markSent();
  }
  setChatModelId(chatResource, modelId) {
    const chatId = chatResource.fragment;
    if (chatId) {
      this._getAdditionalChat(chatResource)?.setModelId(modelId);
    } else {
      this.modelId.set(modelId, void 0);
      this.modelSelection = modelId ? this._toModelSelection(modelId) : void 0;
    }
  }
  setChatAgent(chatResource, agent) {
    const chatId = chatResource.fragment;
    if (chatId) {
      this._getAdditionalChat(chatResource)?.setAgent(agent);
    } else {
      this.mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : void 0, void 0);
      this._agentBaseDir = agent ? this._workingDirectories?.[0] : void 0;
    }
  }
  /**
   * Reconcile the selected custom-agent URI against the host's current agent
   * list — e.g. the session graduated with an agent picked in the original repo
   * but now runs in an isolated worktree, where the host reports the same agent
   * file under the worktree path.
   *
   * The selection is rebased by matching the agent's repo-relative path against
   * the available agents (which already carry the worktree root) rather than the
   * session's reported working directory. The working directory is unreliable
   * here: the worktree-pathed customizations arrive well before either the
   * `SessionSummary` or `SessionState` working-directory flips to the worktree,
   * so a working-directory-keyed rebase would miss the window and let the picker
   * destructively reset the selection. Deriving the worktree root from the agent
   * list closes that race.
   *
   * Mirrors the agent-host backend's code to rebase by relative path.
   * The re-point is only applied to a URI that actually exists in
   * the supplied agent list, so it never runs ahead of the host reporting the
   * worktree agents (which would otherwise re-introduce the mismatch it fixes).
   */
  reconcileSelectedAgent(agents) {
    const current = this.mode.get();
    if (!current || agents.some((a) => a.uri === current.id)) {
      return;
    }
    const base = this._agentBaseDir;
    if (!base) {
      return;
    }
    const agentUri = URI.parse(current.id);
    if (!isEqualOrParent(agentUri, base)) {
      return;
    }
    const rel = relativePath(base, agentUri);
    if (!rel) {
      return;
    }
    const relocated = this._findRelocatedAgent(agents, agentUri, base, rel);
    if (relocated) {
      this.mode.set({ id: relocated.uri, kind: current.kind }, void 0);
      this._agentBaseDir = relocated.root;
    }
  }
  /**
   * Finds an available agent that is the same repo-relative file as the current
   * selection but rooted under a different directory (its worktree twin).
   *
   * A candidate matches when its path ends with `/<rel>` on a path-segment
   * boundary and the implied root (the candidate path minus that suffix) differs
   * from `base`. The root is re-validated with `relativePath` so only a genuine
   * relocation of the same file is accepted. Returns the matched agent's URI and
   * its derived root, or `undefined` when there is no twin.
   */
  _findRelocatedAgent(agents, agentUri, base, rel) {
    const suffix = `/${rel}`;
    for (const agent of agents) {
      const candidate = URI.parse(agent.uri);
      if (candidate.scheme !== agentUri.scheme || candidate.authority !== agentUri.authority) {
        continue;
      }
      if (!candidate.path.endsWith(suffix) || candidate.path.length === suffix.length) {
        continue;
      }
      const root = candidate.with({ path: candidate.path.slice(0, candidate.path.length - suffix.length) });
      if (isEqual(root, base) || relativePath(root, candidate) !== rel) {
        continue;
      }
      return { uri: agent.uri, root };
    }
    return void 0;
  }
  /**
   * Seed the selected custom agent when a session is resumed (e.g. after a
   * window reload). A freshly loaded adapter starts with `mode === undefined`;
   * the host persists the selection on the default chat's `ChatState.draft.agent`,
   * which the provider reads and mirrors onto `session.mode` here. Guarded to
   * never override a live selection (a Part 1 graduation seed or a user pick),
   * keeping this a resume-only hydration.
   */
  hydrateSelectedAgent(agentUri) {
    if (this.mode.get() !== void 0) {
      return;
    }
    this.setChatAgent(this.resource, { uri: agentUri, name: "" });
  }
  getChatModelId(chatResource) {
    return chatResource.fragment ? this._getAdditionalChat(chatResource)?.chat.modelId.get() : this.modelId.get();
  }
  getChatModelSelection(chatResource) {
    const modelId = this.getChatModelId(chatResource);
    if (modelId) {
      return this._toModelSelection(modelId);
    }
    return chatResource.fragment ? void 0 : this.modelSelection;
  }
  getChatMode(chatResource) {
    return chatResource.fragment ? this._getAdditionalChat(chatResource)?.chat.mode.get() : this.mode.get();
  }
  /** Optimistically set the default chat tab title (independent of the session title). */
  setDefaultChatTitle(title) {
    this._defaultChatTitleOverride.set(title || void 0, void 0);
  }
  /** Optimistically set an additional peer chat's title ahead of the host's `chatUpdated`. */
  setAdditionalChatTitle(chatId, title) {
    this._additionalChats.get(chatId)?.setTitle(title);
  }
  _toModelSelection(modelId) {
    const prefix = `${this._resourceScheme}:`;
    return { id: modelId.startsWith(prefix) ? modelId.substring(prefix.length) : modelId };
  }
  _getAdditionalChat(chatResource) {
    const byFragment = chatResource.fragment ? this._additionalChats.get(chatResource.fragment) : void 0;
    if (byFragment) {
      return byFragment;
    }
    for (const chat of this._additionalChats.values()) {
      if (isEqual(chat.chat.resource, chatResource)) {
        return chat;
      }
    }
    return void 0;
  }
  _createChangesObs() {
    const defaultChangesetObs = derivedOpts({
      equalsFn: (c1, c2) => c1?.id === c2?.id
    }, (reader) => {
      const changesets = this.changesets.read(reader);
      if (!changesets) {
        return void 0;
      }
      return changesets.find((c) => c.isDefault.read(reader) === true);
    });
    const defaultChangesetChangesObs = derived((reader) => {
      const defaultChangeset = defaultChangesetObs.read(reader);
      if (!defaultChangeset) {
        return [];
      }
      return defaultChangeset.changes.read(reader);
    });
    return derivedOpts(
      { equalsFn: sessionFileChangesEqual },
      (reader) => defaultChangesetChangesObs.read(reader) ?? []
    );
  }
  /**
   * Update fields from a refreshed metadata snapshot. Returns `true` iff
   * any user-visible field changed.
   */
  update(metadata) {
    let didChange = false;
    transaction((tx) => {
      const summary = metadata.summary;
      if (summary !== void 0 && summary !== this.title.get()) {
        this.title.set(summary, tx);
        didChange = true;
      }
      if (metadata.status !== void 0) {
        const uiStatus = mapProtocolStatus(metadata.status);
        if (uiStatus !== this.status.get()) {
          this.status.set(uiStatus, tx);
          didChange = true;
        }
      }
      const modifiedTime = metadata.modifiedTime;
      if (this.updatedAt.get().getTime() !== modifiedTime) {
        this.updatedAt.set(new Date(modifiedTime), tx);
        didChange = true;
      }
      const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
      const nextLastTurnEndTime = modifiedTime ? modifiedTime : void 0;
      if (currentLastTurnEndTime !== nextLastTurnEndTime) {
        this.lastTurnEnd.set(nextLastTurnEndTime !== void 0 ? new Date(nextLastTurnEndTime) : void 0, tx);
        didChange = true;
      }
      this._project = metadata.project;
      this._workingDirectories = metadata.workingDirectories;
      if (metadata._meta !== void 0) {
        if (this.setMeta(metadata._meta, tx)) {
          didChange = true;
        }
      } else {
        const workspace = this._computeWorkspace();
        if (this._setWorkspace(workspace, tx)) {
          didChange = true;
        }
      }
      if (metadata.status !== void 0) {
        const isArchived = isSessionStatusArchived(metadata.status);
        if (isArchived !== this.isArchived.get()) {
          this.isArchived.set(isArchived, tx);
          didChange = true;
        }
        const isRead = isSessionStatusRead(metadata.status);
        if (isRead !== this.isRead.get()) {
          this.isRead.set(isRead, tx);
          didChange = true;
        }
      }
      if (metadata.changes !== void 0 && this.setChangesSummary(metadata.changes, tx)) {
        didChange = true;
      }
      if (this._activity.get() !== metadata.activity) {
        this._activity.set(metadata.activity, tx);
        didChange = true;
      }
    });
    return didChange;
  }
  /**
   * Sets the activity text from a `SessionSummaryChanged` notification.
   * Returns `true` iff the activity observable changed. Callers inside a
   * transaction MUST pass it — see {@link setChangesSummary}.
   */
  setActivity(activity, tx) {
    if (this._activity.get() !== activity) {
      this._activity.set(activity, tx);
      return true;
    }
    return false;
  }
  /**
   * Apply a `_meta` delta (the shared session-state / session-summary bag,
   * fed from `_applySessionMetaFromState` or a `SessionSummaryChanged`
   * notification), promote the session kind if the delta reports it
   * workspace-less, and rebuild the workspace if the git state changed.
   * Returns `true` iff anything observable changed, so the list regroups a
   * session that became a quick chat without ever having had a workspace.
   *
   * Callers that are already inside a transaction MUST pass it: a plain
   * `transaction()` here would finish (and therefore notify) mid-way through
   * the enclosing one, letting observers of `_meta` / `isQuickChat` /
   * `workspace` read a torn snapshot of the fields the caller has not applied
   * yet.
   */
  setMeta(meta, tx) {
    this._meta = meta;
    let didChange = false;
    subtransaction(tx, (tx2) => {
      this._metaObs.set(this._meta, tx2);
      didChange = this._promoteToQuickChatIfWorkspaceless(tx2);
      const workspace = this._computeWorkspace();
      if (this._setWorkspace(workspace, tx2)) {
        didChange = true;
      }
    });
    return didChange;
  }
  refreshWorkspace() {
    let didChange = false;
    transaction((tx) => {
      didChange = this._setWorkspace(this._computeWorkspace(), tx);
    });
    return didChange;
  }
  setIsAutomation(isAutomation) {
    this.isAutomation.set(isAutomation, void 0);
  }
  /** Records that this session runs with worktree isolation. See {@link worktreePending}. */
  setWorktreeIsolation(isolated) {
    this._worktreeIsolation.set(isolated, void 0);
  }
  /**
   * Heal an adapter born mis-classified because the path that materialized it
   * carried no `_meta` (a stale persisted cache, an older host). One-way: an
   * absent marker means "not included", never "cleared", so a quick chat is
   * never demoted back into a workspace session rooted at its scratch cwd.
   */
  _promoteToQuickChatIfWorkspaceless(tx) {
    if (this._isQuickChat.get() || !readSessionWorkspaceless(this._meta)) {
      return false;
    }
    this._isQuickChat.set(true, tx);
    return true;
  }
  /**
   * The session's project. Read at persist time so a value assigned after the snapshot was taken
   * is not lost on the next save.
   */
  get project() {
    return this._project;
  }
  /**
   * Assign a project to a session that was materialized without one, recomputing the workspace.
   * Refuses when the session already has a project.
   *
   * Narrower than {@link update}, which also assigns `_workingDirectories` and would clear real
   * working directories, revert a renamed title, and roll back the modified time.
   */
  backfillProject(project) {
    if (!project || this._project) {
      return false;
    }
    this._project = project;
    transaction((tx) => {
      this._setWorkspace(this._computeWorkspace(), tx);
    });
    return true;
  }
  _setWorkspace(workspace, tx) {
    if (agentHostSessionWorkspaceKey(workspace) === agentHostSessionWorkspaceKey(this.workspace.get())) {
      return false;
    }
    this._sessionOutputCache.clear();
    this.workspace.set(workspace, tx);
    return true;
  }
  /**
   * Resolves the session workspace. Quick chats stay workspace-less
   * (`undefined`) regardless of any scratch working directory the host
   * assigned; workspace sessions build from project/git metadata.
   */
  _computeWorkspace() {
    return this._kind.computeWorkspace(() => this._options.buildWorkspace(this._project, this._workingDirectories, this.gitHubInfo, readSessionGitState(this._meta)));
  }
  updateChangesets(changesetsMetadata) {
    if (!changesetsMetadata) {
      return;
    }
    const changesets = createChangesets(this.backendUri, this._options, this.isActiveSessionObs, changesetsMetadata);
    this.changesets.set(changesets, void 0);
  }
};
AgentHostSessionAdapter = __decorateClass([
  __decorateParam(5, IGitHubService),
  __decorateParam(6, ISessionsService),
  __decorateParam(7, IPullRequestIconCache)
], AgentHostSessionAdapter);
const AGENT_MODE_KIND = "agent";
function customizationsChanged(previous, state) {
  if (previous.customizations !== state.customizations) {
    return true;
  }
  const previousActiveCustomizations = flattenActiveClientCustomizations(previous);
  const currentActiveCustomizations = flattenActiveClientCustomizations(state);
  return !arrayEquals(previousActiveCustomizations, currentActiveCustomizations, (a, b) => {
    if (a.nonce !== void 0 && a.nonce === b.nonce) {
      return true;
    }
    return a === b;
  });
}
function flattenActiveClientCustomizations(state) {
  const result = [];
  for (const client of state.activeClients) {
    if (client.customizations) {
      result.push(...client.customizations);
    }
  }
  return result;
}
let NewSession = class extends Disposable {
  constructor(ctx, _options, sessionsService) {
    super();
    this._options = _options;
    this._changesets = observableValue(this, void 0);
    this._worktreePending = observableValue(this, false);
    /**
     * Latest resolved config. Replaces what used to live in `_newSessionConfigs`.
     * `undefined` indicates the most recent {@link resolveConfig} failed and no
     * cached values are usable.
     */
    this._config = { schema: { type: "object", properties: {} }, values: {} };
    /**
     * Monotonic counter for in-flight {@link resolveConfig} calls. Each call
     * increments the counter and only writes its result back if its sequence
     * is still the latest one. Bumped on dispose so any pending resolve
     * discards itself.
     */
    this._configRequestSeq = 0;
    this._lifetimeCts = this._register(new CancellationTokenSource());
    /**
     * `onDidChange` listener for {@link _subscription}. Forwards every
     * `SessionState` snapshot to the provider via {@link _onSessionState}
     * so the new session's customizations (and any other state) reach
     * `_lastSessionStates` while the session is still Untitled. Detached
     * in {@link graduate} (handoff) and {@link dispose} (close-without-send).
     */
    this._stateListener = this._register(new MutableDisposable());
    const workspaceUri = ctx.workspace?.folders[0]?.root;
    this._kind = sessionKind(!!ctx.quickChat);
    if (this._kind.requiresWorkspace && !workspaceUri) {
      throw new Error("Workspace has no repository URI");
    }
    this.workspaceUri = workspaceUri;
    this.isQuickChat = this._kind.isQuickChat;
    this.requiresWorkspaceTrust = !!ctx.workspace?.requiresWorkspaceTrust;
    this.agentProvider = ctx.sessionType.id;
    this._providerId = ctx.providerId;
    this._logService = ctx.logService;
    this._onSessionState = ctx.onSessionState;
    this._activeClientScope = ctx.activeClientScope;
    if (this._activeClientScope) {
      this._register(this._activeClientScope);
    }
    this._initialMetadata = ctx.initialMetadata;
    const resource = URI.from({ scheme: ctx.resourceScheme, path: `/${generateUuid()}` });
    this._isActiveSessionObs = derived(this, (reader) => isEqual(sessionsService.activeSession.read(reader)?.resource, resource));
    this._backendSessionUri = AgentSession.uri(ctx.backendSessionScheme ?? this.agentProvider, AgentSession.id(resource));
    this._status = observableValue(this, SessionStatus.Untitled);
    this._title = observableValue(this, "");
    const title = this._title;
    const updatedAt = observableValue(this, /* @__PURE__ */ new Date());
    this._workspace = observableValue(this, ctx.workspace);
    const changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    const checkpoints = observableValue(this, void 0);
    this._selectedModelId = void 0;
    this._selectedAgent = void 0;
    this._modelId = observableValue(this, this._selectedModelId);
    const mode = observableValue(this, void 0);
    this._mode = mode;
    const isArchived = observableValue(this, false);
    const isRead = observableValue(this, true);
    this._description = observableValue(this, void 0);
    const lastTurnEnd = observableValue(this, void 0);
    this._loading = observableValue(this, true);
    this._isResolvingConfig = observableValue(this, false);
    const createdAt = /* @__PURE__ */ new Date();
    const mainChat = {
      resource,
      createdAt,
      title,
      updatedAt,
      status: this._status,
      changes,
      checkpoints,
      modelId: this._modelId,
      mode,
      isArchived,
      isRead,
      interactivity: constObservable(ChatInteractivity.Full),
      description: this._description,
      lastTurnEnd
    };
    this._mainChat = observableValue(this, mainChat);
    const authPending = ctx.authenticationPending;
    const loading = this._loading;
    const chats = this._mainChat.map((c) => [c]);
    this.session = {
      sessionId: `${ctx.providerId}:${resource.toString()}`,
      resource,
      providerId: ctx.providerId,
      sessionType: ctx.sessionType.id,
      icon: ctx.icon,
      createdAt,
      workspace: this._workspace,
      isQuickChat: constObservable(this._kind.isQuickChat),
      worktreePending: this._worktreePending,
      title,
      updatedAt,
      status: this._status,
      changesets: this._changesets,
      changes,
      modelId: this._modelId,
      mode,
      loading: derived((reader) => loading.read(reader) || authPending.read(reader)),
      isArchived,
      isRead,
      description: this._description,
      lastTurnEnd,
      mainChat: this._mainChat,
      chats,
      capabilities: constObservable({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true })
    };
    this.sessionId = this.session.sessionId;
    if (ctx.initialConfigValues || ctx.initialConfigSchema) {
      this._config = {
        schema: { type: "object", properties: { ...ctx.initialConfigSchema } },
        values: { ...ctx.initialConfigValues }
      };
    }
    this._syncWorktreePending();
  }
  observeClientCustomAgents(customAgents, onDidChange) {
    let previous = customAgents.get();
    this._register(autorun((reader) => {
      const current = customAgents.read(reader);
      if (current === previous) {
        return;
      }
      previous = current;
      onDidChange();
    }));
  }
  getClientCustomAgents() {
    return this._activeClientScope?.customAgents.get() ?? [];
  }
  /** Re-reads the isolation pick from the cached config into {@link _worktreePending}. */
  _syncWorktreePending() {
    this._worktreePending.set(isWorktreeIsolation(this._config?.values), void 0);
  }
  // -- Picker mutations ----------------------------------------------------
  setSelectedModelId(modelId) {
    this._selectedModelId = modelId;
    this._modelId.set(modelId, void 0);
  }
  getSelectedModelId() {
    return this._selectedModelId;
  }
  clearSelectedModelId() {
    this._selectedModelId = void 0;
  }
  /** Untitled skeleton title used until the first request commits the session. */
  get untitledTitle() {
    return this._kind.untitledTitle;
  }
  setSelectedAgent(agent) {
    this._selectedAgent = agent;
    this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : void 0, void 0);
  }
  getSelectedAgent() {
    return this._selectedAgent;
  }
  clearSelectedAgent() {
    this._selectedAgent = void 0;
    this._mode.set(void 0, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setActivity(activity) {
    this._description.set(activity ? new MarkdownString().appendText(activity) : void 0, void 0);
  }
  setLoading(loading) {
    this._loading.set(loading, void 0);
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  applySessionMeta(meta) {
    const workspace = this._workspace.get();
    const primaryFolder = workspace?.folders[0];
    if (!workspace || !primaryFolder) {
      return false;
    }
    const gitState = readSessionGitState(meta);
    const gitHubInfo = toGitHubInfo(meta);
    if (!gitState && !gitHubInfo) {
      return false;
    }
    const currentRepository = primaryFolder.gitRepository ?? {
      uri: primaryFolder.root,
      workTreeUri: void 0,
      baseBranchName: void 0,
      gitHubInfo: constObservable(void 0)
    };
    const nextGitHubInfo = gitHubInfo ?? (gitState?.hasGitHubRemote === false ? void 0 : currentRepository.gitHubInfo.get());
    const nextWorkspace = {
      ...workspace,
      folders: [{
        ...primaryFolder,
        gitRepository: {
          ...currentRepository,
          branchName: gitState?.branchName ?? currentRepository.branchName,
          baseBranchName: gitState?.baseBranchName ?? currentRepository.baseBranchName,
          hasGitHubRemote: gitState?.hasGitHubRemote ?? currentRepository.hasGitHubRemote,
          upstreamBranchName: gitState?.upstreamBranchName ?? currentRepository.upstreamBranchName,
          incomingChanges: gitState?.incomingChanges ?? currentRepository.incomingChanges,
          outgoingChanges: gitState?.outgoingChanges ?? currentRepository.outgoingChanges,
          uncommittedChanges: gitState?.uncommittedChanges ?? currentRepository.uncommittedChanges,
          gitHubInfo: constObservable(nextGitHubInfo)
        }
      }, ...workspace.folders.slice(1)]
    };
    if (sessionWorkspaceEqual(workspace, nextWorkspace)) {
      return false;
    }
    this._workspace.set(nextWorkspace, void 0);
    return true;
  }
  // -- Config --------------------------------------------------------------
  getConfig() {
    return this._config;
  }
  getConfigValues() {
    return this._config?.values;
  }
  trackConfigResolution(promise) {
    this._configResolution = promise;
    void promise.then(
      () => this._clearConfigResolution(promise),
      () => this._clearConfigResolution(promise)
    );
    return promise;
  }
  async waitForConfigResolution() {
    while (this._configResolution) {
      await raceCancellationError(this._configResolution, this.cancellationToken);
    }
  }
  _clearConfigResolution(promise) {
    if (this._configResolution === promise) {
      this._configResolution = void 0;
    }
  }
  /**
   * Optimistically merges a single property into the cached config.
   * Preserves the existing schema so schema-driven pickers don't flash
   * during the async re-resolve. {@link resolveConfig} replaces both
   * schema and values when its response lands.
   */
  setConfigValue(property, value) {
    const current = this._config;
    this._config = {
      schema: current?.schema ?? { type: "object", properties: {} },
      values: { ...current?.values ?? {}, [property]: value }
    };
    this._syncWorktreePending();
  }
  /**
   * `true` while a {@link resolveConfig} round-trip is in flight. See
   * {@link _isResolvingConfig} for why this is distinct from {@link ISession.loading}.
   */
  get isResolvingConfig() {
    return this._isResolvingConfig;
  }
  get cancellationToken() {
    return this._lifetimeCts.token;
  }
  /** Mark a resolve as starting before the optimistic event fires. */
  beginResolveConfigSync() {
    this._isResolvingConfig.set(true, void 0);
  }
  /**
   * Clear the in-flight flag for early-return paths that skip
   * {@link resolveConfig} (e.g. no connection), where the `finally`
   * cleanup never runs.
   */
  endResolveConfigSync() {
    this._isResolvingConfig.set(false, void 0);
  }
  /**
   * Re-resolves the session config against the agent host using the
   * currently cached values. Ignores its own response if a newer call
   * superseded it. Returns `true` if the config was applied (i.e. this
   * call was not stale by the time the response arrived). On failure, the
   * cached config is cleared so {@link getConfig} returns `undefined`.
   * @param strict Rethrow the latest resolution error instead of treating the refresh as best effort.
   */
  async resolveConfig(connection, strict = false) {
    const seq = ++this._configRequestSeq;
    this._isResolvingConfig.set(true, void 0);
    try {
      const result = await connection.resolveSessionConfig({
        provider: this.agentProvider,
        workingDirectory: this.workspaceUri,
        config: this._config?.values
      });
      if (seq !== this._configRequestSeq) {
        return false;
      }
      this._config = result;
      this._syncWorktreePending();
      return true;
    } catch (error) {
      if (seq !== this._configRequestSeq) {
        return false;
      }
      this._config = void 0;
      this._syncWorktreePending();
      if (strict) {
        throw error;
      }
      return true;
    } finally {
      if (seq === this._configRequestSeq) {
        this._isResolvingConfig.set(false, void 0);
      }
    }
  }
  getConfigCompletions(connection, property, query) {
    return connection.sessionConfigCompletions({
      provider: this.agentProvider,
      workingDirectory: this.workspaceUri,
      config: this._config?.values,
      property,
      query
    });
  }
  // -- Backend session lifecycle -------------------------------------------
  /**
   * Eagerly create the session on the agent host so the chat handler can
   * skip its legacy `createSession`-on-first-message round-trip.
   *
   * Wire ordering matters: we must `createSession` *before* opening the
   * subscription. Subscribing first would race the wire send — the server
   * receives the `subscribe` before the `createSession` and rejects it as
   * `AHP_SESSION_NOT_FOUND`, leaving the client subscription in an
   * unrecoverable error state. The session handler would then fall back
   * to its legacy create-and-subscribe path on the user's first send,
   * issuing a duplicate `createSession`.
   *
   * If the user switches workspaces or graduates this session before the
   * `createSession` round-trip completes, this object will have been
   * disposed (and `_backendUri` cleared) — the bail-out check below skips
   * opening a stale subscription.
   *
   * Failures are non-fatal: the legacy first-message path in
   * `AgentHostSessionHandler._invokeAgent` re-issues `createSession` if
   * no session state exists at send time.
   */
  eagerCreate(connection, canCreate) {
    const backendUri = this._backendSessionUri;
    if (this._eagerCreateTask || this._backendUri?.toString() === backendUri.toString() || this._subscription) {
      return;
    }
    this._eagerCreateTask = (async () => {
      if (canCreate) {
        try {
          if (!await canCreate()) {
            return;
          }
        } catch (error) {
          this._logService.warn(`[${this._providerId}] Eager createSession precondition failed for ${backendUri.toString()}: ${error}`);
          return;
        }
      }
      if (this.cancellationToken.isCancellationRequested) {
        return;
      }
      this._backendUri = backendUri;
      this._connection = connection;
      try {
        await this._activeClientScope?.whenResolved();
        if (this._backendUri?.toString() !== backendUri.toString()) {
          return;
        }
        const activeClient = this._activeClientScope?.activeClient(connection.clientId).get();
        await connection.createSession({
          provider: this.agentProvider,
          session: backendUri,
          workingDirectories: this.workspaceUri ? [this.workspaceUri] : void 0,
          config: this._config?.values,
          _meta: this._initialMetadata,
          // MCP-style opt-in: offer to receive `progress` for any
          // long-running bring-up (chiefly the lazy first-use SDK
          // download, which fires later at first-message
          // materialization). The host echoes this token on each
          // `progress` frame so `_handleProgress` can correlate it.
          progressToken: generateUuid(),
          ...this._selectedAgent ? { agent: { uri: this._selectedAgent.uri } } : {},
          ...activeClient ? { activeClient } : {}
        });
      } catch (err) {
        this._logService.warn(`[${this._providerId}] Eager createSession failed for ${backendUri.toString()}: ${err}`);
        if (this._backendUri?.toString() === backendUri.toString()) {
          this._backendUri = void 0;
          this._connection = void 0;
        }
        return;
      }
      if (this._backendUri?.toString() !== backendUri.toString()) {
        return;
      }
      const ref = connection.getSubscription(StateComponents.Session, backendUri, "BaseAgentHostSessionsProvider.session");
      this._subscription = ref;
      const onSessionState = this._onSessionState;
      if (onSessionState) {
        const initial = ref.object.value;
        if (initial && !(initial instanceof Error)) {
          this.updateChangesets(initial.changesets);
          onSessionState(this.sessionId, initial);
        }
        this._stateListener.value = ref.object.onDidChange((state) => {
          this.updateChangesets(state.changesets);
          onSessionState(this.sessionId, state);
        });
      }
    })();
  }
  async waitForEagerCreate() {
    if (this._eagerCreateTask) {
      await raceCancellationError(this._eagerCreateTask, this.cancellationToken);
    }
  }
  updateChangesets(changesetsMetadata) {
    if (!changesetsMetadata) {
      return;
    }
    const changesets = createChangesets(this._backendSessionUri, this._options, this._isActiveSessionObs, changesetsMetadata);
    this._changesets.set(changesets, void 0);
  }
  /**
   * Release the backend subscription without firing `disposeSession`.
   * Used on the success path in `sendRequest` when the session has
   * graduated into a real running session.
   */
  graduate() {
    this._lifetimeCts.cancel();
    this._stateListener.clear();
    this._subscription?.dispose();
    this._subscription = void 0;
    this._backendUri = void 0;
    this._connection = void 0;
    this._configRequestSeq++;
  }
  dispose() {
    this._lifetimeCts.cancel();
    this._configRequestSeq++;
    const hadListener = !!this._stateListener.value;
    this._stateListener.clear();
    if (hadListener) {
      this._onSessionState?.(this.sessionId, void 0);
    }
    this._subscription?.dispose();
    this._subscription = void 0;
    const oldUri = this._backendUri;
    const connection = this._connection;
    this._backendUri = void 0;
    this._connection = void 0;
    if (oldUri && connection) {
      connection.disposeSession(oldUri).catch((err) => {
        this._logService.warn(`[${this._providerId}] Failed to dispose eager backend session ${oldUri.toString()}: ${err}`);
      });
    }
    super.dispose();
  }
};
NewSession = __decorateClass([
  __decorateParam(2, ISessionsService)
], NewSession);
let BaseAgentHostSessionsProvider = class extends Disposable {
  constructor(_chatSessionsService, _chatService, _chatWidgetService, _languageModelsService, _baseConfigurationService, _logService, _gitHubService, _instantiationService, _sessionsService, _activeClientService, _storageService, _dialogService, _workspaceTrustManagementService) {
    super();
    this._chatSessionsService = _chatSessionsService;
    this._chatService = _chatService;
    this._chatWidgetService = _chatWidgetService;
    this._languageModelsService = _languageModelsService;
    this._baseConfigurationService = _baseConfigurationService;
    this._logService = _logService;
    this._gitHubService = _gitHubService;
    this._instantiationService = _instantiationService;
    this._sessionsService = _sessionsService;
    this._activeClientService = _activeClientService;
    this._storageService = _storageService;
    this._dialogService = _dialogService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._sessionTypes = [];
    this._agentCapabilities = observableValue(this, void 0);
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidReplaceSession = this._register(new Emitter());
    this.onDidReplaceSession = this._onDidReplaceSession.event;
    this._onDidChangeSessionConfig = this._register(new Emitter());
    this.onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;
    this._onDidChangeRootConfig = this._register(new Emitter());
    this.onDidChangeRootConfig = this._onDidChangeRootConfig.event;
    this._onDidChangeCustomAgents = this._register(new Emitter());
    this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
    this._onDidChangeCustomizations = this._register(new Emitter());
    this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    /**
     * Last-known session state per session ID, seeded from
     * {@link _applySessionStateUpdate}. Holds the snapshot used to extract
     * `customizations` and `activeClient.customizations` for the picker.
     */
    this._lastSessionStates = /* @__PURE__ */ new Map();
    /** Cache of adapted sessions, keyed by raw session ID. */
    this._sessionCache = /* @__PURE__ */ new Map();
    /**
     * Snapshot of the source metadata for each adapter in {@link _sessionCache},
     * keyed by raw session ID. Captured in {@link createAdapter}/{@link updateAdapter}
     * and re-used by {@link _persistCache} to serialize sessions without having to
     * reconstruct every `IAgentSessionMetadata` field from observables.
     */
    this._metaByRawId = /* @__PURE__ */ new Map();
    /**
     * Set when {@link _sessionCache} has changed since the last persist. The
     * actual write happens on the next `onWillSaveState` signal from
     * {@link IStorageService} so that bursts of notifications do not repeatedly
     * re-serialize the whole cache.
     */
    this._cacheDirty = false;
    /**
     * Raw ids of backend sessions that an in-flight {@link _waitForNewSession}
     * has already matched to its send, so a *concurrent* new-session send of
     * the same scheme does not resolve to the same committed session. Each
     * matched id is released by the owning send in its `finally`.
     */
    this._committingSessionRawIds = /* @__PURE__ */ new Set();
    /**
     * Own raw ids ({@link chatResource} path) of currently in-flight
     * new-session sends. A send's committed backend session keeps the eager
     * id it was created with, so {@link _waitForNewSession} matches a send to
     * its OWN id first. The novelty fallback (for flows where the backend
     * assigns a different id) must then never latch onto *another* in-flight
     * send's own session — otherwise two concurrent same-scheme sends racing
     * in a shared download/materialize window would swap sessions (each
     * graduating onto the other's committed session). Populated at send start,
     * cleared in the send's `finally`.
     */
    this._inFlightNewSessionOwnIds = /* @__PURE__ */ new Set();
    /**
     * In-flight new sessions — sessions being composed in the new-chat view
     * before their first message is sent, keyed by `sessionId`. See
     * {@link NewSession} for the encapsulated state and lifecycle.
     *
     * Held as a {@link DisposableMap} so multiple new sessions can be tracked
     * concurrently (e.g. while one is sending in the background and the composer
     * re-seeds a fresh one). Entries are disposed individually when sent
     * ({@link deleteAndDispose}/{@link deleteAndLeak}) or abandoned (via
     * {@link deleteNewSession}), and all remaining entries are cleaned up when
     * the provider itself is disposed.
     */
    this._newSessions = this._register(new DisposableMap());
    /** Full resolved config (schema + values) for running sessions, keyed by session ID. */
    this._runningSessionConfigs = /* @__PURE__ */ new Map();
    this._runningSessionConfigResolveSeq = /* @__PURE__ */ new Map();
    /**
     * Last authoritatively-resolved schemas for {@link SEEDED_CONFIG_SCHEMA_KEYS},
     * seeded into new drafts so their chips survive a workspace/agent switch. Lives
     * on the provider (not the picker) so it outlives toolbar item reconstruction.
     */
    this._cachedConfigSchemas = /* @__PURE__ */ new Map();
    /**
     * Lazy session-state subscriptions used to seed {@link _runningSessionConfigs}
     * for sessions that already exist on the agent host (e.g. created in a prior
     * window). The underlying wire subscription is reference-counted by
     * {@link IAgentConnection.getSubscription}, so when the session handler is
     * also subscribed (i.e. chat content is loaded) no extra wire subscribe is
     * issued. Each entry is released after
     * {@link SESSION_STATE_SUBSCRIPTION_IDLE_MS} of no calls into the keep-alive
     * helper, so the server-side refcount can drop and any idle restored session
     * state can be evicted on the agent host. Keyed by session ID.
     */
    this._sessionStateSubscriptions = this._register(new DisposableMap());
    /**
     * Idle-release timers paired with {@link _sessionStateSubscriptions}. Each
     * call to {@link _keepSessionStateAlive} resets the timer for `sessionId`;
     * when the timer fires, the subscription is disposed and the wire
     * `unsubscribe` flows through {@link IAgentConnection.getSubscription}'s
     * refcount to the agent host.
     */
    this._sessionStateIdleTimers = this._register(new DisposableMap());
    /**
     * Session ids whose views are currently visible in the Agents window. Their
     * state subscription is pinned open (no idle release) so host-driven catalog
     * changes the user did not initiate — most importantly spawned subagent chats
     * ({@link ChatOriginKind.Tool}) — keep flowing into `cached.chats` while the
     * session is on screen. Without this, the idle timer (only refreshed by
     * client-initiated actions/queries) can release the state listener mid-view,
     * so a subagent's `chatAdded` is dropped and its inline "Open Subagent" pill
     * cannot resolve until the session is re-subscribed (e.g. switched away and
     * back). Driven by {@link _syncVisibleSessionStatePins}.
     */
    this._pinnedSessionStates = /* @__PURE__ */ new Set();
    this._cacheInitialized = false;
    /**
     * Backoff timer that retries {@link _refreshSessions} after a failed
     * attempt. A failed initial list (e.g. the agent threw
     * `AHP_AUTH_REQUIRED` because its token wasn't yet effective server-side,
     * or a transient offline/network error) must not leave the session list
     * permanently empty. The timer is armed only on failure and cancelled on
     * the next successful refresh.
     */
    this._sessionRefreshRetry = this._register(new MutableDisposable());
    /** Current backoff delay (ms) for the session-refresh retry. */
    this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
    /** True while a {@link _refreshSessions} call is awaiting `listSessions()`. */
    this._sessionRefreshInFlight = false;
    this._activeSessionScope = this._register(new MutableDisposable());
    this._activeClientSyncCancellation = this._register(new MutableDisposable());
    this._downloadProgress = this._register(this._instantiationService.createInstance(AgentHostDownloadProgress));
    this._register(toDisposable(() => {
      for (const cached of this._sessionCache.values()) {
        cached.dispose();
      }
      this._sessionCache.clear();
    }));
    this._register(autorun((reader) => this._syncVisibleSessionStatePins(reader)));
    this._register(autorun((reader) => {
      this._sessionsService.activeSession.read(reader);
      this._syncActiveClient();
    }));
    this._register(this._onDidChangeSessions.event((e) => {
      if (!this._shouldTrackSessionCacheChanges()) {
        return;
      }
      if (e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0) {
        this._cacheDirty = true;
      }
      for (const removed of e.removed) {
        const rawId = this._rawIdFromChatId(removed.sessionId);
        if (rawId) {
          this._metaByRawId.delete(rawId);
        }
      }
    }));
    this._register(this._storageService.onWillSaveState(() => {
      if (this._sessionCacheStorageKey && this._cacheDirty) {
        this._persistCache();
        this._cacheDirty = false;
      }
    }));
  }
  get order() {
    return 0;
  }
  get sessionTypes() {
    return this._sessionTypes;
  }
  _refreshSessionWorkspaces() {
    const changed = [...this._sessionCache.values()].filter((session) => session.refreshWorkspace());
    if (changed.length > 0) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed });
    }
  }
  /** The in-flight new session with the given id, if any. */
  _getNewSession(sessionId) {
    return this._newSessions.get(sessionId);
  }
  /**
   * Dispose every in-flight new session, firing each one's `disposeSession`
   * sentinel so the eagerly-created backend records are freed. Used when the
   * connection drops and the composed-but-unsent drafts can no longer commit.
   */
  _disposeAllNewSessions() {
    this._newSessions.clearAndDisposeAll();
  }
  deleteNewSession(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  /**
   * Hook to normalize a session's metadata before it is cached, keyed, or
   * persisted. The default is identity. Subclasses override this when the host
   * addresses sessions under a scheme that differs from the agent provider
   * (e.g. a cloud sandbox host that lists sessions as `ahp-session:/<id>` while
   * its agent provider is `copilot`), so that routing, persistence, and content
   * resolution all agree on a single scheme. Must preserve the raw session id
   * (URI path) so cache keys remain stable.
   */
  _adoptSessionMeta(meta) {
    return meta;
  }
  /**
   * The backend (wire) session URI scheme for a given agent provider. Default is
   * identity (scheme == provider), which holds for every host except the Copilot
   * host used by cloud sandbox, whose sessions are addressed under
   * `ahp-session:/<id>` while the agent provider is `copilot`. Subclasses
   * override this so all backend `AgentSession.uri(...)` reconstructions on the
   * adapter and provider use the host's real scheme. Must be a stable per-provider
   * mapping.
   */
  _backendSessionScheme(agentProvider) {
    return agentProvider;
  }
  /** Build an adapter for the given metadata. */
  createAdapter(meta) {
    const provider = AgentSession.provider(meta.session);
    if (!provider) {
      throw new Error(`Agent session URI has no provider scheme: ${meta.session.toString()}`);
    }
    const resourceScheme = this.resourceSchemeForProvider(provider);
    const options = {
      icon: this.iconForAgentProvider(provider) ?? this.icon,
      loading: this.authenticationPending,
      mapDiffUri: this._diffUriMapper(),
      gitHubService: this._gitHubService,
      instantiationService: this._instantiationService,
      getConnection: () => this.connection,
      agentCapabilities: this._agentCapabilities,
      backendSessionScheme: this._backendSessionScheme(provider),
      ...this._adapterOptions()
    };
    this._metaByRawId.set(AgentSession.id(meta.session), meta);
    return this._instantiationService.createInstance(AgentHostSessionAdapter, meta, this.id, resourceScheme, provider, options);
  }
  updateAdapter(adapter, meta) {
    this._metaByRawId.set(AgentSession.id(meta.session), meta);
    this._cacheDirty = true;
    return adapter.update(meta);
  }
  /**
   * Whether `provider` should be advertised as a session type by this host.
   * Defaults to `true` (advertise everything the host reports). The local
   * provider overrides this to suppress the agent host's Claude when the
   * window prefers the extension-host Claude, mirroring the gate
   * {@link AgentHostContribution} applies to the chat session contribution so
   * the welcome picker doesn't list Claude twice.
   */
  _shouldAdvertiseAgent(_provider) {
    return true;
  }
  _syncRootState(rootState) {
    if (rootState && !(rootState instanceof Error)) {
      this._syncSessionTypesFromRootState(rootState);
      this._syncRootConfigFromRootState(rootState);
      return;
    }
    this._syncAgentCapabilities(void 0);
    if (this._sessionTypes.length > 0) {
      this._sessionTypes = [];
      this._onDidChangeSessionTypes.fire();
    }
    if (this._rootConfig) {
      this._rootConfig = void 0;
      this._onDidChangeRootConfig.fire();
    }
  }
  _syncAgentCapabilities(agents) {
    if (this._lastAgents === agents) {
      return;
    }
    this._lastAgents = agents;
    this._agentCapabilities.set(agents ? new Map(agents.map((agent) => [agent.provider, agent.capabilities])) : void 0, void 0);
    this._onDidChangeCustomAgents.fire();
    this._onDidChangeCustomizations.fire();
  }
  /**
   * Reconcile {@link _sessionTypes} against the agents advertised by the
   * host's root state, firing {@link onDidChangeSessionTypes} only if the
   * id/label set actually changed.
   */
  _syncSessionTypesFromRootState(rootState) {
    this._syncAgentCapabilities(rootState.agents);
    const next = rootState.agents.filter((agent) => this._shouldAdvertiseAgent(agent.provider)).map((agent) => ({
      id: agent.provider,
      supportsWorktreeConfiguration: agent.provider === CopilotCLISessionType.id,
      authRequirement: resolveAgentAuthRequirement(agent),
      // The chat session contribution and language models for an agent-host
      // agent are registered under its resource scheme (`agent-host-<provider>`),
      // not the bare provider id, so carry it for availability lookups.
      chatSessionType: this.resourceSchemeForProvider(agent.provider),
      label: this._formatSessionTypeLabel(agent.displayName?.trim() || agent.provider),
      icon: this.iconForAgentProvider(agent.provider) ?? this.icon
    }));
    const prev = this._sessionTypes;
    if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.label === next[i].label && t.authRequirement === next[i].authRequirement)) {
      return;
    }
    this._sessionTypes = next;
    this._onDidChangeSessionTypes.fire();
  }
  /**
   * Returns the {@link ThemeIcon} associated with a known agent provider, or
   * `undefined` when the provider is not recognised.
   */
  iconForAgentProvider(provider) {
    if (provider === CopilotCLISessionType.id) {
      return CopilotCLISessionType.icon;
    }
    if (provider.includes("claude")) {
      return Codicon.claude;
    }
    if (provider === "openai" || provider.includes("codex")) {
      return Codicon.openai;
    }
    return void 0;
  }
  /**
   * Reconcile {@link _rootConfig} against {@link RootState.config}, firing
   * {@link onDidChangeRootConfig} only when schema or values actually change.
   */
  _syncRootConfigFromRootState(rootState) {
    const next = rootState.config;
    const prev = this._rootConfig;
    if (prev === next) {
      return;
    }
    if (!next) {
      this._rootConfig = void 0;
      this._onDidChangeRootConfig.fire();
      return;
    }
    if (prev?.schema === next.schema && equals(prev.values, next.values)) {
      return;
    }
    this._rootConfig = next;
    this._onDidChangeRootConfig.fire();
  }
  /** Optional event fired when the underlying connection is lost; used to short-circuit `_waitForNewSession`. */
  get onConnectionLost() {
    return Event.None;
  }
  /** Maps a working-directory URI from the session summary to a local URI. Default identity; remote overrides to `toAgentHostUri`. */
  mapWorkingDirectoryUri(uri) {
    return uri;
  }
  /** Maps a project URI from the session summary to a local URI. Default identity; remote overrides for `file:` paths. */
  mapProjectUri(uri) {
    return uri;
  }
  // -- Session listing ------------------------------------------------------
  getSessionTypes(_repositoryUri) {
    return [...this.sessionTypes];
  }
  _syncActiveClient() {
    const cancellation = new ActiveClientSyncCancellationTokenSource();
    this._activeClientSyncCancellation.value = cancellation;
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession || activeSession.providerId !== this.id) {
      this._clearActiveSessionScope();
      return;
    }
    const rawId = this._rawIdFromChatId(activeSession.sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!rawId || !cached || !connection) {
      this._clearActiveSessionScope();
      return;
    }
    const sessionType = this.resourceSchemeForProvider(cached.agentProvider);
    let scope = this._activeSessionScope.value;
    if (!scope || this._activeSessionScopeSessionType !== sessionType || !areCustomizationScopeRootsEqual(this._activeSessionScopeRoots, cached.workingDirectories)) {
      scope = this._activeClientService.acquireScope(sessionType, cached.workingDirectories);
      this._activeSessionScope.value = scope;
      this._activeSessionScopeSessionType = scope ? sessionType : void 0;
      this._activeSessionScopeRoots = scope ? [...cached.workingDirectories] : void 0;
    }
    if (!scope) {
      return;
    }
    void this._dispatchActiveClientWhenResolved(cancellation.token, activeSession.sessionId, rawId, cached, connection, scope);
  }
  async _dispatchActiveClientWhenResolved(token, activeSessionId, rawId, cached, connection, scope) {
    await raceCancellation(scope.whenResolved(), token);
    const activeSession = this._sessionsService.activeSession.get();
    if (token.isCancellationRequested || scope !== this._activeSessionScope.value || this.connection !== connection || this._sessionCache.get(rawId) !== cached || activeSession?.providerId !== this.id || activeSession.sessionId !== activeSessionId) {
      return;
    }
    const activeClient = scope.activeClient(connection.clientId).get();
    const existing = this._lastSessionStates.get(cached.sessionId)?.activeClients.find((client) => client.clientId === activeClient.clientId);
    if (equals(existing, activeClient)) {
      return;
    }
    connection.dispatch(AgentSession.uri(cached.agentProvider, rawId).toString(), {
      type: ActionType.SessionActiveClientSet,
      activeClient
    });
  }
  _clearActiveSessionScope() {
    this._activeClientSyncCancellation.clear();
    this._activeSessionScope.clear();
    this._activeSessionScopeSessionType = void 0;
    this._activeSessionScopeRoots = void 0;
  }
  getSessions() {
    this._ensureSessionCache();
    const pendingSession = this._pendingSession;
    const sessions = [];
    for (const cached of this._sessionCache.values()) {
      if (pendingSession && isEqual(cached.resource, pendingSession.resource)) {
        continue;
      }
      if (this._shouldAdvertiseAgent(cached.agentProvider)) {
        sessions.push(cached);
      }
    }
    if (pendingSession && this._shouldAdvertiseAgent(pendingSession.sessionType)) {
      sessions.push(pendingSession);
    }
    return sessions;
  }
  getSessionByResource(resource) {
    for (const newSession of this._newSessions.values()) {
      if (newSession.session.resource.toString() === resource.toString()) {
        return newSession.session;
      }
    }
    if (this._pendingSession?.resource.toString() === resource.toString()) {
      return this._pendingSession;
    }
    this._ensureSessionCache();
    for (const cached of this._sessionCache.values()) {
      if (cached.resource.toString() === resource.toString()) {
        this._keepSessionStateAlive(cached.sessionId);
        return cached;
      }
    }
    return void 0;
  }
  // -- Session lifecycle ----------------------------------------------------
  createNewSession(workspaceUri, sessionTypeId, options) {
    if (!workspaceUri) {
      throw new Error("Workspace has no repository URI");
    }
    const sessionType = this.sessionTypes.find((t) => t.id === sessionTypeId);
    if (!sessionType) {
      throw new Error(this._noAgentsErrorMessage());
    }
    this._validateBeforeCreate(sessionType);
    const workspace = this.resolveWorkspace(workspaceUri);
    if (!workspace) {
      throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
    }
    return this._createDraftSession(sessionType, workspace, false, options?.metadata);
  }
  startNewSessionRequest(sessionId, activity) {
    const newSession = this._getNewSession(sessionId);
    if (!newSession) {
      throw new Error("Cannot start a session that is no longer pending.");
    }
    newSession.setStatus(SessionStatus.InProgress);
    newSession.setActivity(activity);
    return toDisposable(() => newSession.setActivity(void 0));
  }
  createQuickChat(sessionTypeId) {
    const sessionType = this.sessionTypes.find((t) => t.id === sessionTypeId);
    if (!sessionType) {
      throw new Error(this._noAgentsErrorMessage());
    }
    this._validateBeforeCreate(sessionType);
    return this._createDraftSession(sessionType, void 0, true);
  }
  /**
   * Builds, tracks, and eagerly starts a {@link NewSession} draft for the
   * given session type. Shared by {@link createNewSession} (workspace-bound)
   * and {@link createQuickChat} (workspace-less, `quickChat === true`).
   */
  _createDraftSession(sessionType, workspace, quickChat, initialMetadata) {
    const connection = this.connection;
    const resourceScheme = this.resourceSchemeForProvider(sessionType.id);
    const activeClientScope = this._activeClientService.acquireScope(resourceScheme, workspace?.folders.map((folder) => folder.root) ?? []);
    let newSession;
    try {
      newSession = this._instantiationService.createInstance(NewSession, {
        workspace,
        quickChat,
        sessionType,
        providerId: this.id,
        icon: sessionType.icon,
        resourceScheme,
        backendSessionScheme: this._backendSessionScheme(sessionType.id),
        authenticationPending: this.authenticationPending,
        logService: this._logService,
        initialConfigValues: this._initialNewSessionConfig(workspace),
        initialConfigSchema: this._seededConfigSchema(),
        initialMetadata,
        instantiationService: this._instantiationService,
        onSessionState: (id, state) => state === void 0 ? this._handleNewSessionStateGone(id) : this._handleNewSessionStateUpdate(id, state),
        activeClientScope
      }, {
        icon: this.iconForAgentProvider(sessionType.id) ?? this.icon,
        loading: this.authenticationPending,
        mapDiffUri: this._diffUriMapper(),
        gitHubService: this._gitHubService,
        instantiationService: this._instantiationService,
        getConnection: () => this.connection,
        agentCapabilities: this._agentCapabilities,
        ...this._adapterOptions()
      });
    } catch (err) {
      activeClientScope?.dispose();
      throw err;
    }
    this._newSessions.set(newSession.sessionId, newSession);
    newSession.observeClientCustomAgents(activeClientScope?.customAgents ?? constObservable([]), () => {
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    });
    this._onDidChangeSessionConfig.fire(newSession.sessionId);
    if (connection) {
      if (!this.authenticationPending.get()) {
        this._startNewSessionBackend(newSession, connection);
      }
    } else {
      newSession.setLoading(false);
    }
    return newSession.session;
  }
  _resumeNewSessionAfterAuthenticationSettles() {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    for (const newSession of this._newSessions.values()) {
      this._startNewSessionBackend(newSession, connection);
    }
  }
  _startNewSessionBackend(newSession, connection) {
    void newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession, { markSessionLoading: true }));
    const workspaceUri = newSession.workspaceUri;
    const canCreate = newSession.requiresWorkspaceTrust && workspaceUri ? async () => {
      const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workspaceUri);
      if (this._newSessions.get(newSession.sessionId) !== newSession) {
        return false;
      }
      if (!trusted) {
        this._logService.trace(`[${this.id}] Skipping eager createSession for untrusted folder ${workspaceUri.toString()}`);
        newSession.setLoading(false);
        return false;
      }
      return true;
    } : void 0;
    newSession.eagerCreate(connection, canCreate);
  }
  /**
   * Re-resolves session config and pulses {@link _onDidChangeSessionConfig}.
   * Expected values are validated after strict resolutions.
   */
  async _refreshNewSessionConfig(session, options = {}) {
    const { expected, markSessionLoading } = options;
    const connection = this.connection;
    if (!connection) {
      session.endResolveConfigSync();
      session.setLoading(false);
      this._onDidChangeSessionConfig.fire(session.sessionId);
      if (expected) {
        throw new Error("Cannot set session repository config without an agent host connection.");
      }
      return;
    }
    if (markSessionLoading) {
      session.setLoading(true);
    }
    let applied;
    try {
      applied = await session.resolveConfig(connection, !!expected);
    } catch (error) {
      session.setLoading(false);
      this._onDidChangeSessionConfig.fire(session.sessionId);
      throw error;
    }
    if (!applied || this._newSessions.get(session.sessionId) !== session) {
      if (expected) {
        throw new Error("Session repository config was superseded before it could be applied.");
      }
      return;
    }
    const config = session.getConfig();
    this._cacheSeededConfigSchemas(config);
    session.setLoading(config !== void 0 && !isSessionConfigComplete(config));
    this._onDidChangeSessionConfig.fire(session.sessionId);
    for (const [property, value] of Object.entries(expected ?? {})) {
      if (!equals(config?.values[property], value)) {
        throw new Error(`Agent host did not apply session config '${property}'.`);
      }
    }
  }
  /**
   * Snapshot the well-known {@link SEEDED_CONFIG_SCHEMA_KEYS} schemas from an
   * authoritative resolve so the next new draft can render those chips
   * immediately (disabled) instead of blanking. A `undefined` config (failed
   * resolve) leaves the previous cache intact.
   */
  _cacheSeededConfigSchemas(config) {
    if (!config) {
      return;
    }
    for (const key of SEEDED_CONFIG_SCHEMA_KEYS) {
      const schema = config.schema.properties[key];
      if (schema) {
        this._cachedConfigSchemas.set(key, schema);
      } else {
        this._cachedConfigSchemas.delete(key);
      }
    }
  }
  /** Seed schema for a fresh draft, or `undefined` when nothing is cached yet. */
  _seededConfigSchema() {
    if (this._cachedConfigSchemas.size === 0) {
      return void 0;
    }
    const seed = /* @__PURE__ */ Object.create(null);
    for (const [key, schema] of this._cachedConfigSchemas) {
      seed[key] = schema;
    }
    return seed;
  }
  /** Subclass hook for additional pre-create checks (e.g. remote requires connection). */
  _validateBeforeCreate(_sessionType) {
  }
  /** Localized "no agents" error message. Subclasses can override. */
  _noAgentsErrorMessage() {
    return localize("noAgents", "Agent host has not advertised any agents yet.");
  }
  /**
   * Initial session-config values applied to a brand-new agent-host session
   * before its schema is resolved. Values are seeded from portable picks in
   * the profile-scoped remembered session-config map and then normalized
   * against policy/feature constraints.
   *
   * The agent-host defaults are controlled by the single
   * `chat.defaultConfiguration` object setting (with `mode` and
   * `approvals` properties). Per axis the precedence is: enterprise
   * **policy** value > the user's **remembered** last pick > the ordinary
   * configured **setting** value (treated as a plain default) > schema
   * default. So a normal setting behaves as a default that the remembered
   * pick overrides, while an enterprise policy still wins outright. The
   * local-only `chat.permissions.default` setting is intentionally NOT
   * consulted here.
   *
   * If enterprise policy disables global auto-approval
   * (`chat.tools.global.autoApprove` policy value `false`), the approval seed
   * is clamped to `default` so the agent host never starts in an elevated
   * permission level the user is not allowed to pick.
   *
   * The user's `git.branchPrefix` setting (resource-scoped to the workspace's
   * first folder) is seeded into the `worktreeBranchPrefix` slot so the agent
   * host can prepend it to the branch it creates for an isolated worktree.
   */
  _initialNewSessionConfig(workspace) {
    const config = /* @__PURE__ */ Object.create(null);
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const rememberedValues = this._storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
    for (const [property, value] of Object.entries(rememberedValues)) {
      if (typeof value === "string" && isRememberedSessionConfigKey(property)) {
        config[property] = value;
      }
    }
    const remembered = migrateLegacyAutopilotConfig(config);
    const inspected = this._baseConfigurationService.inspect(ChatConfiguration.DefaultConfiguration);
    const policyDefaults = inspected.policyValue;
    const effectiveDefaults = inspected.value;
    const resolvedAutoApprove = normalizeAutoApproveValue(policyDefaults?.approvals, policyRestricted) ?? normalizeAutoApproveValue(remembered[SessionConfigKey.AutoApprove], policyRestricted) ?? normalizeAutoApproveValue(effectiveDefaults?.approvals, policyRestricted);
    if (resolvedAutoApprove) {
      remembered[SessionConfigKey.AutoApprove] = resolvedAutoApprove;
    } else {
      delete remembered[SessionConfigKey.AutoApprove];
    }
    const resolvedMode = [policyDefaults?.mode, remembered[SessionConfigKey.Mode], effectiveDefaults?.mode].find((value) => typeof value === "string" && KNOWN_MODE_VALUES.has(value));
    if (resolvedMode) {
      remembered[SessionConfigKey.Mode] = resolvedMode;
    } else {
      delete remembered[SessionConfigKey.Mode];
    }
    const resource = workspace?.folders[0]?.root;
    const branchPrefix = this._baseConfigurationService.getValue("git.branchPrefix", { resource });
    if (typeof branchPrefix === "string" && branchPrefix.length > 0) {
      remembered[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
    }
    const worktreeIncludeFiles = this._baseConfigurationService.getValue("git.worktreeIncludeFiles", { resource });
    if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
      remembered[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
    }
    return Object.keys(remembered).length > 0 ? remembered : void 0;
  }
  // -- Dynamic session config ----------------------------------------------
  getSessionConfig(sessionId) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      return newSession.getConfig();
    }
    this._keepSessionStateAlive(sessionId);
    return this._runningSessionConfigs.get(sessionId);
  }
  /**
   * Observable: `true` while a `resolveSessionConfig` round-trip is in
   * flight. Distinct from `session.loading` (which also covers the
   * required-values-missing state) — pickers gate on this so they stay
   * interactive when the user has to fill in required values.
   */
  isSessionConfigResolving(sessionId) {
    const newSession = this._getNewSession(sessionId);
    return newSession ? newSession.isResolvingConfig : constObservable(false);
  }
  async setSessionConfigValue(sessionId, property, value) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const normalizedValue = normalizeSessionConfigValue(property, value, policyRestricted);
    if (typeof normalizedValue === "string" && isRememberedSessionConfigKey(property)) {
      const rememberedValues = this._storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
      const nextRememberedValues = /* @__PURE__ */ Object.create(null);
      for (const [key, rememberedValue] of Object.entries(rememberedValues)) {
        if (typeof rememberedValue === "string" && isRememberedSessionConfigKey(key)) {
          nextRememberedValues[key] = rememberedValue;
        }
      }
      nextRememberedValues[property] = normalizedValue;
      this._storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify(nextRememberedValues), StorageScope.PROFILE, StorageTarget.MACHINE);
    }
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      if (newSession.isResolvingConfig.get()) {
        return;
      }
      newSession.beginResolveConfigSync();
      newSession.setConfigValue(property, normalizedValue);
      this._onDidChangeSessionConfig.fire(sessionId);
      await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession));
      return;
    }
    const runningConfig = this._runningSessionConfigs.get(sessionId);
    const connection = this.connection;
    if (!runningConfig || !connection) {
      return;
    }
    const schema = runningConfig.schema.properties[property];
    if (!schema?.sessionMutable) {
      return;
    }
    const nextValues = { ...runningConfig.values, [property]: normalizedValue };
    this._runningSessionConfigs.set(sessionId, {
      ...runningConfig,
      values: nextValues
    });
    this._onDidChangeSessionConfig.fire(sessionId);
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      const sessionUri = cached.backendUri;
      const action = { type: ActionType.SessionConfigChanged, config: { [property]: normalizedValue } };
      connection.dispatch(sessionUri.toString(), action);
      void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
    }
  }
  async replaceSessionConfig(sessionId, values) {
    const runningConfig = this._runningSessionConfigs.get(sessionId);
    const connection = this.connection;
    if (!runningConfig || !connection) {
      return;
    }
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const nextValues = {};
    for (const [key, schema] of Object.entries(runningConfig.schema.properties)) {
      const editable = schema.sessionMutable === true && schema.readOnly !== true;
      if (editable) {
        nextValues[key] = normalizeSessionConfigValue(key, values[key], policyRestricted);
      } else if (Object.hasOwn(runningConfig.values, key)) {
        nextValues[key] = runningConfig.values[key];
      }
    }
    if (equals(nextValues, runningConfig.values)) {
      return;
    }
    this._runningSessionConfigs.set(sessionId, {
      ...runningConfig,
      values: nextValues
    });
    this._onDidChangeSessionConfig.fire(sessionId);
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      const sessionUri = cached.backendUri;
      const action = {
        type: ActionType.SessionConfigChanged,
        config: nextValues,
        replace: true
      };
      connection.dispatch(sessionUri.toString(), action);
      void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
    }
  }
  async _resolveRunningSessionConfig(sessionId, cached, values) {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    const seq = (this._runningSessionConfigResolveSeq.get(sessionId) ?? 0) + 1;
    this._runningSessionConfigResolveSeq.set(sessionId, seq);
    try {
      const resolved = await connection.resolveSessionConfig({
        provider: cached.agentProvider,
        workingDirectory: cached.workspace.get()?.folders[0]?.root,
        config: values
      });
      if (this._runningSessionConfigResolveSeq.get(sessionId) !== seq) {
        return;
      }
      this._runningSessionConfigs.set(sessionId, resolved);
      this._onDidChangeSessionConfig.fire(sessionId);
    } catch (err) {
      this._logService.warn(`[${this.id}] Failed to re-resolve session config for ${sessionId}: ${err}`);
    }
  }
  async getSessionConfigCompletions(sessionId, property, query) {
    const newSession = this._getNewSession(sessionId);
    const connection = this.connection;
    if (!newSession || !connection) {
      return [];
    }
    const result = await newSession.getConfigCompletions(connection, property, query);
    return result.items;
  }
  getCreateSessionConfig(sessionId) {
    return this._getNewSession(sessionId)?.getConfigValues();
  }
  async setIsolationMode(sessionId, mode) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const value = normalizeSessionConfigValue(
      SessionConfigKey.Isolation,
      mode === "workspace" ? "folder" : mode,
      policyRestricted
    );
    await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.Isolation, value);
  }
  async setWorktreeConfiguration(sessionId, configuration) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const values = {};
    if (configuration.isolationMode) {
      values[SessionConfigKey.Isolation] = normalizeSessionConfigValue(
        SessionConfigKey.Isolation,
        configuration.isolationMode === "workspace" ? "folder" : configuration.isolationMode,
        policyRestricted
      );
    }
    if (configuration.worktreeBranchTrack !== void 0) {
      values[SessionConfigKey.WorktreeBranchTrack] = configuration.worktreeBranchTrack;
    }
    if (configuration.branch) {
      values[SessionConfigKey.Branch] = normalizeSessionConfigValue(SessionConfigKey.Branch, configuration.branch, policyRestricted);
    }
    await this._setTransientNewSessionConfigValues(sessionId, values, false);
  }
  async setWorktreeBranchTrack(sessionId, enabled) {
    await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.WorktreeBranchTrack, enabled);
  }
  async setBranch(sessionId, branch) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const value = normalizeSessionConfigValue(SessionConfigKey.Branch, branch, policyRestricted);
    await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.Branch, value);
  }
  async _setTransientNewSessionConfigValue(sessionId, property, value) {
    await this._setTransientNewSessionConfigValues(sessionId, { [property]: value }, true);
  }
  async _setTransientNewSessionConfigValues(sessionId, values, waitForCurrentResolve) {
    const newSession = this._getNewSession(sessionId);
    if (!newSession) {
      throw new Error("Cannot configure repository settings after session creation.");
    }
    await waitForState(this.authenticationPending, (pending) => !pending, void 0, newSession.cancellationToken);
    if (waitForCurrentResolve) {
      await waitForState(newSession.isResolvingConfig, (resolving) => !resolving, void 0, newSession.cancellationToken);
    }
    if (this._getNewSession(sessionId) !== newSession) {
      throw new Error("Session was disposed before repository configuration could be applied.");
    }
    newSession.beginResolveConfigSync();
    for (const [property, value] of Object.entries(values)) {
      newSession.setConfigValue(property, value);
    }
    this._onDidChangeSessionConfig.fire(sessionId);
    await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession, { expected: values }));
  }
  clearSessionConfig(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  // -- Root (agent host) Config --------------------------------------------
  getRootConfig() {
    return this._rootConfig;
  }
  getRootState() {
    const value = this.connection?.rootState.value;
    return value instanceof Error ? void 0 : value;
  }
  mapAgentHostResource(uri) {
    return this.mapWorkingDirectoryUri(uri);
  }
  async authenticate(params) {
    const connection = this.connection;
    if (!connection) {
      return { authenticated: false };
    }
    return connection.authenticate(params);
  }
  async setRootConfigValue(property, value) {
    const current = this._rootConfig;
    const connection = this.connection;
    if (!current || !connection) {
      return;
    }
    if (!current.schema.properties[property]) {
      return;
    }
    this._rootConfig = {
      ...current,
      values: { ...current.values, [property]: value }
    };
    this._onDidChangeRootConfig.fire();
    const action = {
      type: ActionType.RootConfigChanged,
      config: { [property]: value }
    };
    connection.dispatch(ROOT_STATE_URI, action);
  }
  async replaceRootConfig(values) {
    const current = this._rootConfig;
    const connection = this.connection;
    if (!current || !connection) {
      return;
    }
    const nextValues = {};
    for (const [key, value] of Object.entries(values)) {
      if (current.schema.properties[key]) {
        nextValues[key] = value;
      }
    }
    if (equals(nextValues, current.values)) {
      return;
    }
    this._rootConfig = { ...current, values: nextValues };
    this._onDidChangeRootConfig.fire();
    const action = {
      type: ActionType.RootConfigChanged,
      config: nextValues,
      replace: true
    };
    connection.dispatch(ROOT_STATE_URI, action);
  }
  // -- Model selection ------------------------------------------------------
  get onDidChangeModels() {
    return Event.signal(Event.any(
      this._languageModelsService.onDidChangeLanguageModels,
      this._languageModelsService.onDidChangeModelVisibility
    ));
  }
  getModelsSnapshot(sessionId, desiredModelId) {
    const resourceScheme = this._resolveSessionResourceScheme(sessionId);
    if (!resourceScheme) {
      return {
        models: [],
        desiredModelResolution: resolveModelIdentifier([], desiredModelId, false),
        modelTarget: void 0
      };
    }
    const allModels = getRegisteredLanguageModels(this._languageModelsService);
    const models = allModels.filter((model) => {
      if (model.metadata.targetChatSessionType !== resourceScheme) {
        return false;
      }
      if (this._languageModelsService.isModelHidden(model.identifier)) {
        return false;
      }
      const manageModelsIdentifier = ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(model.metadata);
      return manageModelsIdentifier === void 0 || !this._languageModelsService.isModelHidden(manageModelsIdentifier);
    });
    const desiredModel = desiredModelId ? this._languageModelsService.lookupLanguageModel(desiredModelId) : void 0;
    const resolvedDesiredModelId = desiredModel?.targetChatSessionType && this.resourceSchemeForProvider(desiredModel.targetChatSessionType) === resourceScheme ? `${resourceScheme}:${desiredModel.id}` : desiredModelId;
    return {
      models,
      desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, resolvedDesiredModelId, this._languageModelsService, allModels),
      modelTarget: resourceScheme
    };
  }
  getModelPickerOptions(sessionId) {
    const resourceScheme = this._resolveSessionResourceScheme(sessionId);
    const showAutoModel = !resourceScheme || this._chatSessionsService.supportsAutoModelForSessionType(resourceScheme);
    return {
      useGroupedModelPicker: true,
      showFeatured: true,
      showUnavailableFeatured: true,
      showManageModelsAction: true,
      showAutoModel
    };
  }
  /**
   * Resolve a remembered model selection at send time: when it is conclusively
   * unavailable and the harness supports Auto, return the Auto model identifier
   * (rather than `undefined`, which would leave an already-running chat pinned
   * to its stale backend model) so the request is explicitly reset to Auto.
   */
  _resolveSendModelId(sessionId, selectedModelId) {
    if (!selectedModelId) {
      return selectedModelId;
    }
    const snapshot = this.getModelsSnapshot(sessionId, selectedModelId);
    if (snapshot.desiredModelResolution.kind !== "unavailable") {
      return selectedModelId;
    }
    const resourceScheme = this._resolveSessionResourceScheme(sessionId);
    const supportsAuto = !resourceScheme || this._chatSessionsService.supportsAutoModelForSessionType(resourceScheme);
    if (!supportsAuto) {
      return selectedModelId;
    }
    const autoModelId = resolveConfiguredModel("auto", snapshot.models)?.identifier;
    this._logService.warn(`[${this.id}] Selected model '${selectedModelId}' is unavailable for session '${sessionId}'; falling back to Auto instead of sending an unroutable model.`);
    return autoModelId;
  }
  _resolveSessionResourceScheme(sessionId) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      return newSession.session.resource.scheme;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    return cached?.resource.scheme;
  }
  setModel(sessionId, modelId) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      newSession.setSelectedModelId(modelId);
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (cached && rawId && connection) {
      const chatResource = this._activeChatResource(cached);
      cached.setChatModelId(chatResource, modelId);
      this._updateChatSessionState(chatResource, modelId, cached.getChatMode(chatResource)?.id).catch((err) => this._logService.error(`[${this.id}] Failed to update chat model state for ${chatResource.toString()}`, err));
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  setAgent(sessionId, agent) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      newSession.setSelectedAgent(agent);
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (cached && rawId && connection) {
      const chatResource = this._activeChatResource(cached);
      cached.setChatAgent(chatResource, agent);
      this._updateChatSessionState(chatResource, cached.getChatModelId(chatResource), agent?.uri).catch((err) => this._logService.error(`[${this.id}] Failed to update chat model state for ${chatResource.toString()}`, err));
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  getCustomAgents(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    const stateAgents = getEffectiveAgents(sessionState?.customizations);
    const newSession = this._newSessions.get(sessionId);
    if (!newSession) {
      return stateAgents;
    }
    const clientAgents = newSession.getClientCustomAgents();
    if (clientAgents.length === 0) {
      return stateAgents;
    }
    const agentsByUri = new Map(stateAgents.map((agent) => [agent.uri.toString(), agent]));
    for (const agent of clientAgents) {
      agentsByUri.set(agent.uri.toString(), agent);
    }
    return [...agentsByUri.values()].sort((a, b) => a.name.localeCompare(b.name) || a.uri.toString().localeCompare(b.uri.toString()));
  }
  getCustomizations(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return sessionState?.customizations ?? [];
  }
  getWorkingDirectory(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return sessionState?.workingDirectories?.[0];
  }
  getBackendChatResource(chatResource) {
    const sessionResource = chatResource.with({ fragment: "" });
    const state = this._lastSessionStates.get(toSessionId(this.id, sessionResource));
    if (!state) {
      return void 0;
    }
    const chatId = chatResource.fragment || void 0;
    const backendResource = chatId ? state.chats.find((c) => parseChatUri(c.resource)?.chatId === chatId)?.resource : state.defaultChat ?? state.chats.find((c) => isDefaultChatUri(c.resource))?.resource;
    if (!backendResource) {
      return void 0;
    }
    try {
      return URI.parse(backendResource.toString());
    } catch {
      return void 0;
    }
  }
  getWorkingDirectories(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return sessionState?.workingDirectories ?? [];
  }
  getMcpServers(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    if (!sessionState) {
      return [];
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!cached || !rawId) {
      return [];
    }
    const sessionUri = cached.backendUri;
    return (sessionState.customizations ?? []).flatMap((customization) => customization.type === CustomizationType.McpServer ? [{ server: customization, plugin: void 0 }] : customization.children ? customization.children.filter((child) => child.type === CustomizationType.McpServer).map((server) => ({
      server,
      plugin: customization.type === CustomizationType.Plugin ? customization : void 0
    })) : []).map(({ server, plugin }) => ({
      id: `${sessionUri.authority}/${server.id}`,
      name: server.name,
      enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)),
      enablement: server.enablement,
      disabledReason: getCustomizationDisabledReason(server, plugin),
      status: server.state.kind,
      state: server.state,
      setEnabled: (enabled) => {
        const connection = this.connection;
        if (!connection) {
          return;
        }
        connection.dispatch(sessionUri.toString(), {
          type: ActionType.SessionCustomizationToggled,
          id: server.id,
          enablement: withCustomizationEnablement(server.enablement, CustomizationEnablementKind.Session, { kind: CustomizationEnablementKind.Session, enabled })
        });
      },
      start: async () => {
        const connection = this.connection;
        if (!connection) {
          return;
        }
        connection.dispatch(sessionUri.toString(), {
          type: ActionType.SessionMcpServerStartRequested,
          id: server.id
        });
      },
      stop: async () => {
        const connection = this.connection;
        if (!connection) {
          return;
        }
        connection.dispatch(sessionUri.toString(), {
          type: ActionType.SessionMcpServerStopRequested,
          id: server.id
        });
      }
    }));
  }
  setCustomizationEnablement(sessionId, customizationId, enablement) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!cached || !connection) {
      return;
    }
    connection.dispatch(cached.backendUri.toString(), {
      type: ActionType.SessionCustomizationToggled,
      id: customizationId,
      enablement: [...enablement]
    });
  }
  getFeedbackAnnotationsChannel(sessionId) {
    const connection = this.connection;
    if (!connection) {
      return void 0;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!cached || !rawId) {
      return void 0;
    }
    const sessionUri = cached.backendUri;
    const annotationsUri = URI.parse(buildAnnotationsUri(sessionUri.toString()));
    return { connection, annotationsUri };
  }
  // -- Session actions ------------------------------------------------------
  async archiveSession(sessionId) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      cached.isArchived.set(true, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const connection = this.connection;
      if (connection) {
        const sessionUri = cached.backendUri;
        const action = { type: ActionType.SessionIsArchivedChanged, isArchived: true };
        connection.dispatch(sessionUri.toString(), action);
      }
    }
  }
  async unarchiveSession(sessionId) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      cached.isArchived.set(false, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const connection = this.connection;
      if (connection) {
        const sessionUri = cached.backendUri;
        const action = { type: ActionType.SessionIsArchivedChanged, isArchived: false };
        connection.dispatch(sessionUri.toString(), action);
      }
    }
  }
  async setSessionReadState(sessionId, isRead) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId && cached.isRead.get() !== isRead) {
      cached.isRead.set(isRead, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const connection = this.connection;
      if (connection) {
        const sessionUri = cached.backendUri;
        const action = { type: ActionType.SessionIsReadChanged, isRead };
        connection.dispatch(sessionUri.toString(), action);
      }
    }
  }
  async deleteSession(sessionId) {
    await this.deleteSessions([sessionId]);
  }
  async deleteSessions(sessionIds) {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    const targets = [];
    for (const sessionId of sessionIds) {
      const rawId = this._rawIdFromChatId(sessionId);
      const cached = rawId ? this._sessionCache.get(rawId) : void 0;
      if (cached && rawId) {
        targets.push({ rawId, cached });
      }
    }
    if (targets.length === 0) {
      return;
    }
    const removed = [];
    try {
      for (const { rawId, cached } of targets) {
        await connection.disposeSession(cached.backendUri);
        const removedSession = this._removeCachedSession(rawId, cached);
        if (removedSession) {
          removed.push(removedSession);
        }
      }
    } finally {
      if (removed.length > 0) {
        this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
        for (const cached of removed) {
          cached.dispose();
        }
      }
    }
  }
  async renameChat(sessionId, chatUri, title) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!cached || !rawId || !connection) {
      return;
    }
    const sessionUri = cached.backendUri;
    const chatId = chatUri.fragment;
    const action = { type: ActionType.SessionTitleChanged, title };
    if (chatId) {
      cached.setAdditionalChatTitle(chatId, title);
      connection.dispatch(buildChatUri(sessionUri, chatId), action);
    } else {
      cached.setDefaultChatTitle(title);
      connection.dispatch(buildDefaultChatUri(sessionUri), action);
    }
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
  }
  async renameSession(sessionId, title) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (cached && rawId && connection) {
      cached.title.set(title, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const sessionUri = cached.backendUri;
      const action = { type: ActionType.SessionTitleChanged, title };
      connection.dispatch(sessionUri.toString(), action);
    }
  }
  async deleteChat(sessionId, chatUri, options) {
    const chatId = chatUri.fragment;
    if (!chatId) {
      return false;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!rawId || !cached || !connection) {
      return false;
    }
    const sessionUri = cached.backendUri;
    const ahpChatUri = URI.parse(buildChatUri(sessionUri, chatId));
    if (!options?.skipConfirmation) {
      const confirmed = await this._dialogService.confirm({
        message: localize("deleteChat.confirm", "Are you sure you want to delete this chat?"),
        detail: localize("deleteChat.detail", "This action cannot be undone."),
        primaryButton: localize("deleteChat.delete", "Delete")
      });
      if (!confirmed.confirmed) {
        return false;
      }
    }
    this._keepSessionStateAlive(cached.sessionId);
    await connection.disposeChat(ahpChatUri);
    return true;
  }
  async createNewChat(chatId) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    const newSession = this._getNewSession(chatId);
    if (newSession) {
      await this._chatSessionsService.getOrCreateChatSession(newSession.session.resource, CancellationToken.None);
      return newSession.session.mainChat.get();
    }
    return this._createAdditionalChat(chatId, connection);
  }
  async _createAdditionalChat(chatId, connection) {
    const rawId = this._rawIdFromChatId(chatId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${chatId}' not found`);
    }
    if (!cached.capabilities.get().supportsMultipleChats) {
      throw new Error(`Session '${chatId}' does not support multiple chats`);
    }
    const sessionUri = cached.backendUri;
    const newChatId = generateUuid();
    const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
    const selectedModelId = cached.modelId.get() ?? (cached.modelSelection ? `${cached.resource.scheme}:${cached.modelSelection.id}` : void 0);
    const selectedAgentUri = cached.mode.get()?.id;
    cached.markChatAsNew(newChatId);
    this._keepSessionStateAlive(cached.sessionId);
    await connection.createChat(sessionUri, chatUri, {
      model: cached.modelSelection
    });
    const chat = await waitForState(
      cached.chats.map((chats) => chats.find((c) => c.resource.fragment === newChatId)),
      (c) => !!c
    );
    cached.setChatModelId(chat.resource, selectedModelId);
    cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: "" } : void 0);
    await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
    await this._updateChatSessionState(chat.resource, selectedModelId, selectedAgentUri);
    return chat;
  }
  async forkChat(sessionId, sourceChat, turnId) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (!cached.capabilities.get().supportsMultipleChats) {
      throw new Error(`Session '${sessionId}' does not support multiple chats`);
    }
    const sessionUri = cached.backendUri;
    const newChatId = generateUuid();
    const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
    const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);
    this._keepSessionStateAlive(cached.sessionId);
    await connection.createChat(sessionUri, chatUri, {
      model: cached.modelSelection,
      fork: { source: sourceBackendUri, turnId }
    });
    const chat = await waitForState(
      cached.chats.map((chats) => chats.find((c) => c.resource.fragment === newChatId)),
      (c) => !!c
    );
    await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
    return chat;
  }
  async createSideChat(sessionId, sourceChat, turnId, selection) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (!cached.capabilities.get().supportsSideChat) {
      throw new Error(`Session '${sessionId}' does not support side chats`);
    }
    const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
    const newChatId = generateUuid();
    const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
    const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);
    const selectedModel = cached.getChatModelSelection(sourceChat);
    const selectedModelId = cached.getChatModelId(sourceChat) ?? (selectedModel ? `${cached.resource.scheme}:${selectedModel.id}` : void 0);
    const selectedAgentUri = cached.getChatMode(sourceChat)?.id;
    this._keepSessionStateAlive(cached.sessionId);
    await connection.createChat(sessionUri, chatUri, {
      model: selectedModel,
      sideChat: {
        source: sourceBackendUri,
        turnId,
        ...selection ? { selection } : {}
      }
    });
    const chat = await waitForState(
      cached.chats.map((chats) => chats.find((c) => c.resource.fragment === newChatId)),
      (c) => !!c
    );
    cached.setChatModelId(chat.resource, selectedModelId);
    cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: "" } : void 0);
    await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
    await this._updateChatSessionState(chat.resource, selectedModelId, selectedAgentUri);
    return chat;
  }
  _resolveBackendSourceChatUri(sessionId, sessionUri, sourceChat) {
    if (sourceChat.fragment) {
      return URI.parse(buildChatUri(sessionUri, sourceChat.fragment));
    }
    const hydratedDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
    return hydratedDefaultChat ? URI.parse(hydratedDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
  }
  async sendRequest(chatId, chatResource, options) {
    const newSession = this._getNewSession(chatId);
    if (newSession) {
      return this._sendNewSessionRequest(newSession, chatId, chatResource, options);
    }
    return this._sendCommittedChatRequest(chatId, chatResource, options);
  }
  /** Send the first request for an already-committed peer chat, then clear its `new` flag. */
  async _sendCommittedChatRequest(chatId, chatResource, options) {
    const rawId = this._rawIdFromChatId(chatId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${chatId}' not found`);
    }
    const { query, attachedContext } = options;
    const sessionType = chatResource.scheme;
    const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);
    const selectedModelId = this._resolveSendModelId(chatId, cached.getChatModelId(chatResource));
    const selectedAgentUri = cached.getChatMode(chatResource)?.id;
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: selectedModelId,
      modeInfo: selectedAgentUri ? {
        kind: ChatModeKind.Agent,
        isBuiltin: false,
        modeInstructions: {
          uri: URI.parse(selectedAgentUri),
          name: "",
          content: "",
          toolReferences: []
        },
        telemetryModeId: "custom",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      } : {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      hideFromTranscript: options.hideFromTranscript
    };
    const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      throw new Error(`[${this.id}] Unable to load chat session ${chatResource.toString()}`);
    }
    try {
      this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri);
      const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
      if (result.kind === "rejected") {
        throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
      }
      this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri, { clearDraft: true });
    } finally {
      modelRef.dispose();
    }
    cached.markChatAsSent(chatResource.fragment);
    return cached;
  }
  async _updateChatSessionState(chatResource, modelId, agentUri, options) {
    const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      return;
    }
    try {
      this._applyChatSessionState(modelRef, modelId, agentUri, options);
    } finally {
      modelRef.dispose();
    }
  }
  _applyChatSessionState(modelRef, modelId, agentUri, options) {
    const inputModel = modelRef.object.inputModel;
    if (!inputModel) {
      return;
    }
    if (modelId) {
      const languageModel = this._languageModelsService.lookupLanguageModel(modelId);
      if (languageModel) {
        inputModel.setState({ selectedModel: { identifier: modelId, metadata: languageModel } });
      }
    }
    inputModel.setState({
      mode: { id: agentUri ?? ChatMode.Agent.id, kind: ChatModeKind.Agent },
      ...options?.clearDraft ? { inputText: "", attachments: [], selections: [] } : {}
    });
  }
  async _sendNewSessionRequest(newSession, chatId, chatResource, options) {
    if (!this.connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    await newSession.waitForConfigResolution();
    await newSession.waitForEagerCreate();
    if (this._getNewSession(newSession.sessionId) !== newSession) {
      throw new Error("Session was disposed before its configuration could be applied.");
    }
    if (!this.connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    newSession.setStatus(SessionStatus.InProgress);
    const selectedModelId = this._resolveSendModelId(chatId, newSession.getSelectedModelId());
    const selectedAgent = newSession.getSelectedAgent();
    const { query, attachedContext } = options;
    const sessionType = chatResource.scheme;
    const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: selectedModelId,
      modeInfo: selectedAgent ? {
        kind: ChatModeKind.Agent,
        isBuiltin: false,
        modeInstructions: {
          uri: URI.parse(selectedAgent.uri),
          name: "",
          content: "",
          toolReferences: []
        },
        telemetryModeId: "custom",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      } : {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      agentHostSessionConfig: this.getCreateSessionConfig(chatId),
      hideFromTranscript: options.hideFromTranscript
    };
    const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
    if (modelRef) {
      if (selectedModelId) {
        const languageModel = this._languageModelsService.lookupLanguageModel(selectedModelId);
        if (languageModel) {
          modelRef.object.inputModel.setState({ selectedModel: { identifier: selectedModelId, metadata: languageModel } });
        }
      }
      if (selectedAgent) {
        modelRef.object.inputModel.setState({ mode: { id: selectedAgent.uri, kind: ChatModeKind.Agent } });
      }
      modelRef.dispose();
    }
    this._ensureSessionCache();
    const existingKeys = new Set(this._sessionCache.keys());
    const newSessionRawId = chatResource.path.replace(/^\//, "");
    existingKeys.delete(newSessionRawId);
    this._inFlightNewSessionOwnIds.add(newSessionRawId);
    const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
    if (result.kind === "rejected") {
      throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
    }
    newSession.setStatus(SessionStatus.InProgress);
    newSession.clearSelectedModelId();
    newSession.setTitle((options.title || query.split("\n")[0]).substring(0, 100) || newSession.untitledTitle);
    const skeleton = newSession.session;
    this._pendingSession = skeleton;
    this._onDidChangeSessions.fire({ added: [skeleton], removed: [], changed: [] });
    let committedRawId;
    try {
      const committedSession = await this._waitForNewSession(existingKeys, chatResource.scheme, newSessionRawId, newSession.cancellationToken);
      if (committedSession) {
        committedRawId = committedSession.resource.path.substring(1);
        this._preserveNewSessionConfig(newSession, committedSession.sessionId);
        if (options.title) {
          await this.renameSession(committedSession.sessionId, options.title);
        }
        if (selectedAgent) {
          const committedRawIdForAgent = this._rawIdFromChatId(committedSession.sessionId);
          const committedAdapter = committedRawIdForAgent ? this._sessionCache.get(committedRawIdForAgent) : void 0;
          committedAdapter?.setChatAgent(committedAdapter.resource, selectedAgent);
        }
        newSession.graduate();
        if (this._newSessions.get(newSession.sessionId) === newSession) {
          this._newSessions.deleteAndDispose(newSession.sessionId);
        }
        this._pendingSession = void 0;
        this._onDidReplaceSession.fire({ from: skeleton, to: committedSession });
        return committedSession;
      }
    } catch {
    } finally {
      if (committedRawId !== void 0) {
        this._committingSessionRawIds.delete(committedRawId);
      }
      this._inFlightNewSessionOwnIds.delete(newSessionRawId);
      this._pendingSession = void 0;
    }
    newSession.graduate();
    if (this._newSessions.get(newSession.sessionId) === newSession) {
      this._newSessions.deleteAndDispose(newSession.sessionId);
    }
    this._onDidChangeSessions.fire({ added: [], removed: [skeleton], changed: [] });
    throw new Error(localize("sessionNotCommitted", "Agent host session was not committed."));
  }
  /** Localized error message when sendRequest is invoked without a connection. Subclasses can override. */
  _notConnectedSendErrorMessage() {
    return localize("notConnectedSend", "Cannot send request: not connected to agent host.");
  }
  // -- Session config plumbing ---------------------------------------------
  /**
   * When a session transitions from untitled (new) to committed (running),
   * carry over the full resolved config (schema + values) so consumers like
   * the session-settings JSONC editor can round-trip non-mutable values
   * (`isolation`, `branch`, …) through a replace dispatch. Mutable-vs-readonly
   * behavior is still driven off the per-property `sessionMutable` flag.
   */
  _preserveNewSessionConfig(newSession, committedSessionId) {
    const config = newSession.getConfig();
    if (config && Object.keys(config.schema.properties).length > 0) {
      this._runningSessionConfigs.set(committedSessionId, {
        schema: { type: "object", properties: { ...config.schema.properties } },
        values: { ...config.values }
      });
    }
    this._applyWorktreeIsolation(committedSessionId, config?.values);
  }
  _rawIdFromChatId(chatId) {
    const prefix = `${this.id}:`;
    const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
    try {
      return URI.parse(resourceStr).path.substring(1) || void 0;
    } catch {
      return void 0;
    }
  }
  _activeChatResource(session) {
    const activeSession = this._sessionsService.activeSession.get();
    return activeSession?.sessionId === session.sessionId ? activeSession.activeChat.get().resource : session.resource;
  }
  /**
   * Pin the state subscription of every currently-visible session (so
   * host-driven catalog changes flow into `cached.chats` while it is on
   * screen) and resume the idle-release timer for sessions that have left the
   * viewport. Driven reactively by {@link ISessionsService.visibleSessions}.
   */
  _syncVisibleSessionStatePins(reader) {
    const visible = this._sessionsService.visibleSessions.read(reader);
    const nowVisible = /* @__PURE__ */ new Set();
    for (const session of visible) {
      if (!session) {
        continue;
      }
      for (const cached of this._sessionCache.values()) {
        if (isEqual(cached.resource, session.resource)) {
          nowVisible.add(cached.sessionId);
          break;
        }
      }
    }
    for (const sessionId of nowVisible) {
      this._pinnedSessionStates.add(sessionId);
      this._ensureSessionStateSubscription(sessionId);
      this._sessionStateIdleTimers.deleteAndDispose(sessionId);
    }
    for (const sessionId of [...this._pinnedSessionStates]) {
      if (!nowVisible.has(sessionId)) {
        this._pinnedSessionStates.delete(sessionId);
        this._keepSessionStateAlive(sessionId);
      }
    }
  }
  /**
   * Bump the idle-release timer for `sessionId` and lazily create the
   * underlying subscription if needed. Called from query paths
   * ({@link getSessionByResource}, {@link getSessionConfig}) that depend on
   * `_runningSessionConfigs` / `_meta` being in sync but cannot themselves
   * own a subscription handle.
   */
  _keepSessionStateAlive(sessionId) {
    this._ensureSessionStateSubscription(sessionId);
    if (!this._sessionStateSubscriptions.has(sessionId)) {
      return;
    }
    if (this._pinnedSessionStates.has(sessionId)) {
      this._sessionStateIdleTimers.deleteAndDispose(sessionId);
      return;
    }
    this._sessionStateIdleTimers.set(
      sessionId,
      disposableTimeout(
        () => {
          this._sessionStateIdleTimers.deleteAndDispose(sessionId);
          this._sessionStateSubscriptions.deleteAndDispose(sessionId);
        },
        BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS
      )
    );
  }
  /**
   * Lazily acquire a session-state subscription for `sessionId` so that
   * `_runningSessionConfigs` is seeded from the AHP `SessionState.config`
   * snapshot. Safe to call repeatedly — no-op once a subscription exists.
   *
   * The subscription is reference-counted by {@link IAgentConnection.getSubscription},
   * so when the session handler is also subscribed (chat content open) this
   * shares the existing wire subscription rather than opening a new one.
   */
  _ensureSessionStateSubscription(sessionId) {
    if (this._sessionStateSubscriptions.has(sessionId)) {
      return;
    }
    const connection = this.connection;
    if (!connection) {
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    if (readSessionEhcliAdoptable(this._metaByRawId.get(rawId)?._meta)) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    const sessionUri = cached.backendUri;
    const ref = connection.getSubscription(StateComponents.Session, sessionUri, "BaseAgentHostSessionsProvider.summary");
    const store = new DisposableStore();
    store.add(ref);
    store.add(ref.object.onDidChange((state) => {
      this._applySessionStateUpdate(sessionId, state);
    }));
    this._sessionStateSubscriptions.set(sessionId, store);
    const value = ref.object.value;
    if (value && !(value instanceof Error)) {
      this._applySessionStateUpdate(sessionId, value);
    }
    this._hydrateAgentFromDraft(connection, cached, sessionId, sessionUri, store);
  }
  /**
   * Resume hydration: when a session is (re)loaded and its adapter has no agent
   * selected, restore the persisted selection from the default chat's
   * `ChatState.draft.agent` and mirror it onto `session.mode` (the picker's
   * source of truth).
   *
   * The agent is persisted on the chat channel — the session channel
   * ({@link SessionState}) carries no draft — so we briefly observe the default
   * chat's state until its draft agent arrives. The subscription is shared and
   * ref-counted with the chat session handler (no extra wire cost) and lives for
   * the session-state store's lifetime. Hydration is one-shot: the observer
   * stops as soon as `mode` is set — by us here, or by a concurrent graduation
   * seed or user pick (guarded inside
   * {@link AgentHostSessionAdapter.hydrateSelectedAgent}) — so it neither leaks,
   * overrides a later selection, nor keeps re-running on every chat update.
   */
  _hydrateAgentFromDraft(connection, cached, sessionId, sessionUri, store) {
    if (cached.mode.get() !== void 0) {
      return;
    }
    const lastDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
    const defaultChatUri = lastDefaultChat ? URI.parse(lastDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
    const chatRef = connection.getSubscription(StateComponents.Chat, defaultChatUri, "BaseAgentHostSessionsProvider.draftAgent");
    store.add(chatRef);
    const listener = store.add(new MutableDisposable());
    const tryHydrate = () => {
      if (cached.mode.get() === void 0) {
        const chatState = chatRef.object.value;
        const agentUri = chatState && !(chatState instanceof Error) ? chatState.draft?.agent?.uri : void 0;
        if (agentUri) {
          cached.hydrateSelectedAgent(agentUri);
        }
      }
      if (cached.mode.get() !== void 0) {
        listener.clear();
      }
    };
    listener.value = chatRef.object.onDidChange(() => tryHydrate());
    tryHydrate();
  }
  /**
   * Fan-out for AHP `SessionState` snapshots: keeps both the running
   * session config and the cached adapter's `_meta` (e.g. git state) in
   * sync.
   */
  _applySessionStateUpdate(sessionId, state) {
    const previous = this._lastSessionStates.get(sessionId);
    this._lastSessionStates.set(sessionId, state);
    if (!previous || customizationsChanged(previous, state)) {
      this._reconcileAgentFromState(sessionId, state);
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    }
    this._seedRunningConfigFromState(sessionId, state);
    this._applySessionMetaFromState(sessionId, state);
    this._applyChatCatalogFromState(sessionId, state);
    if (!previous) {
      this._applyChangesetsFromState(sessionId, state);
    }
  }
  /**
   * Seed the cached adapter's changeset catalogue from an AHP
   * {@link SessionState}. The catalogue otherwise only flows in via the live
   * `SessionChangesetsChanged` action, which the host emits only when entries
   * are added or removed. On restore (e.g. after a reload) nothing mutates, so
   * that action never fires and the catalogue would stay empty. The restored
   * `SessionState` snapshot carries the persisted `changesets`, so apply it
   * here to surface the catalogue immediately.
   */
  _applyChangesetsFromState(sessionId, state) {
    if (state.changesets === void 0) {
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    cached.updateChangesets(state.changesets);
  }
  /**
   * Rebase the cached running adapter's selected agent against the host's agent
   * list from an AHP {@link SessionState}, before the picker is notified. A
   * session that has moved into an isolated worktree keeps its selection instead
   * of resetting to the default once the host starts reporting worktree-pathed
   * agents. See {@link AgentHostSessionAdapter.reconcileSelectedAgent}.
   */
  _reconcileAgentFromState(sessionId, state) {
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    cached.reconcileSelectedAgent(getEffectiveAgents(state.customizations));
  }
  /**
   * Reconcile the per-chat catalog of the cached running adapter from an AHP
   * {@link SessionState}. The adapter exposes `chats`/`mainChat` as
   * observables, so updating them here is enough for the chat-tab UI to
   * re-render reactively.
   */
  _applyChatCatalogFromState(sessionId, state) {
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    cached.applyChatCatalog(state);
  }
  /**
   * NewSession variant of {@link _applySessionStateUpdate}: writes the
   * customizations subset and applies git/GitHub metadata to the draft
   * workspace. Skips {@link _seedRunningConfigFromState} because NewSession
   * owns its own config via `NewSession._config`.
   */
  _handleNewSessionStateUpdate(sessionId, state) {
    const previous = this._lastSessionStates.get(sessionId);
    this._lastSessionStates.set(sessionId, state);
    this._newSessions.get(sessionId)?.applySessionMeta(state._meta);
    if (!previous || customizationsChanged(previous, state)) {
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    }
  }
  /**
   * Cleanup sentinel from {@link NewSession.dispose}: drops the cached
   * `_lastSessionStates` entry the new session contributed. Fires
   * `_onDidChangeCustomAgents` so any open picker re-reads and falls
   * back to the empty list rather than rendering stale agents.
   */
  _handleNewSessionStateGone(sessionId) {
    if (this._lastSessionStates.delete(sessionId)) {
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    }
  }
  _applySessionMetaFromState(sessionId, state) {
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    if (cached.setMeta(state._meta)) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  /**
   * Seed {@link _runningSessionConfigs} from the AHP `SessionState.config`
   * snapshot. Keeps the full schema + values (including non-mutable ones)
   * so consumers like the JSONC settings editor can round-trip all values
   * through a replace dispatch. No-op if structurally equal to avoid spurious
   * `onDidChangeSessionConfig` fires.
   */
  _seedRunningConfigFromState(sessionId, state) {
    const stateConfig = state.config;
    if (!stateConfig) {
      return;
    }
    if (Object.keys(stateConfig.schema.properties).length === 0) {
      return;
    }
    const existing = this._runningSessionConfigs.get(sessionId);
    let seeded;
    if (existing && this._runningSessionConfigResolveSeq.has(sessionId)) {
      const values = { ...existing.values };
      for (const key of Object.keys(existing.schema.properties)) {
        if (Object.hasOwn(stateConfig.values, key)) {
          values[key] = stateConfig.values[key];
        }
      }
      seeded = {
        schema: { type: "object", properties: { ...existing.schema.properties } },
        values
      };
    } else {
      seeded = {
        schema: {
          type: "object",
          properties: {
            ...existing?.schema.properties ?? {},
            ...stateConfig.schema.properties
          }
        },
        values: {
          ...existing?.values ?? {},
          ...stateConfig.values
        }
      };
    }
    if (existing && resolvedConfigsEqual(existing, seeded)) {
      return;
    }
    this._runningSessionConfigs.set(sessionId, seeded);
    this._applyWorktreeIsolation(sessionId, seeded.values);
    this._onDidChangeSessionConfig.fire(sessionId);
  }
  /** Mirrors a session's `isolation` pick onto its adapter. See {@link ISession.worktreePending}. */
  _applyWorktreeIsolation(sessionId, values) {
    if (!isWorktreeIsolation(values)) {
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const adapter = rawId ? this._sessionCache.get(rawId) : void 0;
    adapter?.setWorktreeIsolation(true);
  }
  // -- Session cache management --------------------------------------------
  /**
   * Opt in to persisting {@link _sessionCache} snapshots under `storageKey`.
   * Subclasses call this at the **end** of their constructor — once the
   * identity fields that {@link createAdapter}/{@link resourceSchemeForProvider}/
   * {@link _adapterOptions} depend on are initialized — because the initial
   * hydration builds adapters. This is why the base cannot auto-load in its
   * own constructor. Persisted summaries are hydrated into {@link _sessionCache}
   * immediately so {@link getSessions} returns them before the first
   * `listSessions()` round-trip resolves.
   *
   * `legacyStorageKey`, when given, is removed so stale entries are discarded.
   */
  _enableSessionCachePersistence(storageKey, legacyStorageKey) {
    if (legacyStorageKey) {
      this._storageService.remove(legacyStorageKey, StorageScope.APPLICATION);
    }
    this._sessionCacheStorageKey = storageKey;
    this._loadCachedSessions();
  }
  /**
   * Whether {@link _onDidChangeSessions} events should update the persistence
   * bookkeeping ({@link _cacheDirty} + {@link _metaByRawId}). Default `true`;
   * the remote provider overrides this to suspend tracking while its cached
   * sessions are unpublished (offline), so the on-disk snapshot survives.
   */
  _shouldTrackSessionCacheChanges() {
    return true;
  }
  /** Load persisted session summaries into {@link _sessionCache}. */
  _loadCachedSessions() {
    if (!this._sessionCacheStorageKey) {
      return;
    }
    const parsed = this._storageService.getObject(this._sessionCacheStorageKey, StorageScope.APPLICATION);
    if (!Array.isArray(parsed)) {
      return;
    }
    for (const entry of parsed) {
      const deserialized = deserializeMetadata(entry);
      if (!deserialized) {
        continue;
      }
      const meta = this._adoptSessionMeta(deserialized);
      const rawId = AgentSession.id(meta.session);
      if (this._sessionCache.has(rawId)) {
        continue;
      }
      const cached = this.createAdapter(meta);
      this._sessionCache.set(rawId, cached);
    }
  }
  /**
   * Persist the current {@link _sessionCache} to storage, capping at
   * {@link CACHED_SESSIONS_MAX_PER_HOST} most-recently-modified entries.
   * Mutable fields are read from each adapter's observables and overlaid on
   * top of the original metadata snapshot captured in {@link _metaByRawId}.
   */
  _persistCache() {
    if (!this._sessionCacheStorageKey) {
      return;
    }
    const entries = [];
    for (const [rawId, adapter] of this._sessionCache) {
      const base = this._metaByRawId.get(rawId);
      if (!base) {
        continue;
      }
      entries.push(serializeMetadata({
        ...base,
        summary: adapter.title.get() || base.summary,
        modifiedTime: adapter.updatedAt.get().getTime(),
        // A project assigned by `backfillProject` lives only on the adapter.
        project: adapter.project ?? base.project,
        status: withSessionStatusFlag(
          withSessionStatusFlag(base.status ?? ProtocolSessionStatus.Idle, ProtocolSessionStatus.IsRead, adapter.isRead.get()),
          ProtocolSessionStatus.IsArchived,
          adapter.isArchived.get()
        ),
        // The adapter's live kind wins over the snapshot: several metadata
        // sources omit `_meta`, and persisting a stale one would resurrect
        // the session as a workspace rooted at the host's scratch cwd.
        ...adapter.isQuickChat.get() ? { _meta: withSessionWorkspaceless(base._meta, true) } : {}
      }));
    }
    if (entries.length === 0) {
      this._storageService.remove(this._sessionCacheStorageKey, StorageScope.APPLICATION);
      return;
    }
    entries.sort((a, b) => b.modifiedTime - a.modifiedTime);
    const limited = entries.slice(0, CACHED_SESSIONS_MAX_PER_HOST);
    this._storageService.store(this._sessionCacheStorageKey, JSON.stringify(limited), StorageScope.APPLICATION, StorageTarget.USER);
  }
  _ensureSessionCache() {
    if (this._cacheInitialized) {
      return;
    }
    if (this._sessionRefreshInFlight || this._sessionRefreshRetry.value) {
      return;
    }
    this._refreshSessions();
  }
  async _refreshSessions(announceExistingAsAdded = false) {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    this._sessionRefreshRetry.clear();
    this._sessionRefreshInFlight = true;
    try {
      const sessions = await connection.listSessions();
      this._cacheInitialized = true;
      this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
      const currentKeys = /* @__PURE__ */ new Set();
      const listedAgentProviders = /* @__PURE__ */ new Set();
      const added = [];
      const changed = [];
      for (const rawMeta of sessions) {
        const meta = this._adoptSessionMeta(rawMeta);
        const rawId = AgentSession.id(meta.session);
        currentKeys.add(rawId);
        const agentProvider = AgentSession.provider(meta.session);
        if (agentProvider) {
          listedAgentProviders.add(agentProvider);
        }
        const existing = this._sessionCache.get(rawId);
        if (existing) {
          if (announceExistingAsAdded) {
            added.push(existing);
          }
          if (this.updateAdapter(existing, meta)) {
            changed.push(existing);
          }
        } else {
          const cached = this.createAdapter(meta);
          this._sessionCache.set(rawId, cached);
          added.push(cached);
        }
      }
      const removed = [];
      const pendingRawId = this._pendingSession?.resource.path.replace(/^\//, "");
      const evictUnlistedAgents = listedAgentProviders.size === 0;
      for (const [key, cached] of this._sessionCache) {
        if (!currentKeys.has(key)) {
          if (key === pendingRawId) {
            continue;
          }
          if (!evictUnlistedAgents && !listedAgentProviders.has(cached.agentProvider)) {
            continue;
          }
          this._sessionCache.delete(key);
          this._runningSessionConfigs.delete(cached.sessionId);
          this._runningSessionConfigResolveSeq.delete(cached.sessionId);
          removed.push(cached);
        }
      }
      if (added.length > 0 || removed.length > 0 || changed.length > 0) {
        this._onDidChangeSessions.fire({ added, removed, changed });
      }
      this._syncActiveClient();
      for (const cached of removed) {
        cached.dispose();
      }
    } catch (err) {
      this._logService.trace(`[AgentHostSessionsProvider] listSessions failed; scheduling retry: ${err}`);
      this._scheduleSessionRefreshRetry(announceExistingAsAdded);
    } finally {
      this._sessionRefreshInFlight = false;
    }
  }
  /**
   * Arm a backoff retry of {@link _refreshSessions}. Used after a failed
   * refresh so a transient startup failure self-heals without requiring an
   * unrelated AHP event (a turn completing, a session being added) to force
   * a re-fetch. Cancelled on the next successful refresh.
   */
  _scheduleSessionRefreshRetry(announceExistingAsAdded) {
    const delay = this._sessionRefreshRetryDelay;
    this._sessionRefreshRetryDelay = Math.min(delay * 2, BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MAX_MS);
    this._sessionRefreshRetry.value = disposableTimeout(() => {
      this._refreshSessions(announceExistingAsAdded);
    }, delay);
  }
  /**
   * Cancel any pending session-refresh retry and reset the backoff. Called
   * by subclasses when the connection goes away (the stale timer would
   * otherwise fire against a dead connection and no-op).
   */
  _cancelSessionRefreshRetry() {
    this._sessionRefreshRetry.clear();
    this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
  }
  /**
   * Resolve the freshly-committed backend session for an in-flight send.
   *
   * The local agent host runs a single provider whose session cache holds
   * **every** agent-host session type (codex, claude, copilot, …). A send
   * therefore has to identify *its own* new session by both novelty (a raw id
   * not present before the send) **and** type: `expectedScheme` is the
   * `chatResource` scheme (e.g. `agent-host-codex`), so a session of another
   * type that happens to appear mid-send — a slow codex send racing against a
   * restored claude session, say — is never mistaken for this send's commit.
   */
  async _waitForNewSession(existingKeys, expectedScheme, ownRawId, token) {
    const matches = (rawId, scheme) => {
      if (scheme !== expectedScheme || this._committingSessionRawIds.has(rawId)) {
        return false;
      }
      if (rawId === ownRawId) {
        return true;
      }
      return !existingKeys.has(rawId) && !this._inFlightNewSessionOwnIds.has(rawId);
    };
    await this._refreshSessions();
    const scan = () => {
      let fallback;
      for (const cached of this._sessionCache.values()) {
        const rawId = cached.resource.path.substring(1);
        if (!matches(rawId, cached.resource.scheme)) {
          continue;
        }
        if (rawId === ownRawId) {
          return cached;
        }
        fallback ??= cached;
      }
      return fallback;
    };
    const immediate = scan();
    if (immediate) {
      this._committingSessionRawIds.add(immediate.resource.path.substring(1));
      return immediate;
    }
    const waitDisposables = new DisposableStore();
    try {
      const sessionPromise = new Promise((resolve) => {
        waitDisposables.add(this._onDidChangeSessions.event((e) => {
          const exact = e.added.find((s) => s.resource.path.substring(1) === ownRawId && matches(ownRawId, s.resource.scheme));
          const newSession = exact ?? e.added.find((s) => matches(s.resource.path.substring(1), s.resource.scheme));
          if (newSession) {
            this._committingSessionRawIds.add(newSession.resource.path.substring(1));
            resolve(newSession);
          }
        }));
        waitDisposables.add(this.onConnectionLost(() => resolve(void 0)));
      });
      return await raceCancellationError(sessionPromise, token);
    } finally {
      waitDisposables.dispose();
    }
  }
  // -- AHP notification / action handlers ----------------------------------
  /**
   * Wire AHP notification and action listeners on the given connection.
   * Subclasses call this from their constructor (local) or `setConnection`
   * (remote), passing a store that bounds the listeners' lifetime.
   */
  _attachConnectionListeners(connection, store) {
    store.add(connection.onDidNotification((n) => {
      if (n.type === NotificationType.SessionAdded) {
        this._handleSessionAdded(n.summary);
      } else if (n.type === NotificationType.SessionRemoved) {
        this._handleSessionRemoved(n.session);
      } else if (n.type === NotificationType.SessionSummaryChanged) {
        this._handleSessionSummaryChanged(n.session, n.changes);
      } else if (n.type === NotificationType.Progress) {
        this._downloadProgress.handleProgress(n);
      }
    }));
    store.add(connection.onDidAction((e) => {
      if (e.action.type === ActionType.ChatTurnComplete && isChatAction(e.action)) {
        this._refreshSessions();
      } else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
        this._handleTitleChanged(e.channel, e.action.title);
      } else if (e.action.type === ActionType.SessionIsArchivedChanged && isSessionAction(e.action)) {
        this._handleIsArchivedChanged(e.channel, e.action.isArchived);
      } else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
        this._handleIsReadChanged(e.channel, e.action.isRead);
      } else if (e.action.type === ActionType.SessionConfigChanged && isSessionAction(e.action)) {
        this._handleConfigChanged(e.channel, e.action.config, e.action.replace === true);
      } else if (e.action.type === ActionType.SessionChangesetsChanged && isSessionAction(e.action)) {
        this._handleChangesetsChanged(e.channel, e.action.changesets);
      } else if (e.action.type === ActionType.SessionMetaChanged && isSessionAction(e.action)) {
        this._handleSessionMetaChanged(e.channel, e.action._meta);
      }
    }));
  }
  _handleSessionAdded(summary) {
    const workingDirs = summary.workingDirectories?.map((d) => this.mapWorkingDirectoryUri(URI.parse(d)));
    const rawMeta = {
      session: URI.parse(summary.resource),
      startTime: Date.parse(summary.createdAt),
      modifiedTime: Date.parse(summary.modifiedAt),
      summary: summary.title,
      activity: summary.activity,
      status: summary.status,
      ...summary.project ? {
        project: {
          displayName: summary.project.displayName,
          uri: this.mapProjectUri(URI.parse(summary.project.uri))
        }
      } : {},
      workingDirectories: workingDirs,
      changes: summary.changes,
      // Carry `_meta` so a new adapter seeds its session-kind from it and an
      // existing one can be promoted by it.
      ...summary._meta !== void 0 ? { _meta: summary._meta } : {}
    };
    const meta = this._adoptSessionMeta(rawMeta);
    const rawId = AgentSession.id(meta.session);
    const existing = this._sessionCache.get(rawId);
    if (existing) {
      if (this.updateAdapter(existing, meta)) {
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [existing] });
      }
      this._syncActiveClient();
      return;
    }
    const cached = this.createAdapter(meta);
    this._sessionCache.set(rawId, cached);
    this._onDidChangeSessions.fire({ added: [cached], removed: [], changed: [] });
    this._syncActiveClient();
  }
  _handleSessionRemoved(session) {
    const rawId = AgentSession.id(session);
    const cached = this._removeCachedSession(rawId);
    if (cached) {
      this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
      cached.dispose();
    }
    this._syncActiveClient();
  }
  _removeCachedSession(rawId, expected) {
    const cached = this._sessionCache.get(rawId);
    if (expected && cached && cached !== expected) {
      return void 0;
    }
    this._metaByRawId.delete(rawId);
    const stateOwner = cached ?? expected;
    if (!stateOwner) {
      return void 0;
    }
    if (cached) {
      this._sessionCache.delete(rawId);
    }
    this._runningSessionConfigs.delete(stateOwner.sessionId);
    this._runningSessionConfigResolveSeq.delete(stateOwner.sessionId);
    this._sessionStateIdleTimers.deleteAndDispose(stateOwner.sessionId);
    this._sessionStateSubscriptions.deleteAndDispose(stateOwner.sessionId);
    this._lastSessionStates.delete(stateOwner.sessionId);
    return cached;
  }
  _handleTitleChanged(session, title) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      cached.title.set(title, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  _handleIsArchivedChanged(session, isArchived) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      cached.isArchived.set(isArchived, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  _handleIsReadChanged(session, isRead) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached && cached.isRead.get() !== isRead) {
      cached.isRead.set(isRead, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  _handleSessionSummaryChanged(session, changes) {
    let reopenStateSubscriptionFor;
    transaction((tx) => {
      const rawId = AgentSession.id(session);
      const cached = this._sessionCache.get(rawId);
      if (!cached) {
        return;
      }
      let didChange = false;
      if (changes.status !== void 0) {
        const uiStatus = mapProtocolStatus(changes.status);
        if (uiStatus !== cached.status.get()) {
          cached.status.set(uiStatus, tx);
          didChange = true;
        }
        const isArchived = !!(changes.status & ProtocolSessionStatus.IsArchived);
        if (isArchived !== cached.isArchived.get()) {
          cached.isArchived.set(isArchived, tx);
          didChange = true;
        }
        const isRead = !!(changes.status & ProtocolSessionStatus.IsRead);
        if (isRead !== cached.isRead.get()) {
          cached.isRead.set(isRead, tx);
          didChange = true;
        }
      }
      if (changes.title !== void 0 && changes.title !== cached.title.get()) {
        cached.title.set(changes.title, tx);
        didChange = true;
      }
      if (changes.changes !== void 0 && cached.setChangesSummary(changes.changes, tx)) {
        didChange = true;
      }
      if (Object.prototype.hasOwnProperty.call(changes, "activity") && cached.setActivity(changes.activity, tx)) {
        didChange = true;
      }
      if (Object.prototype.hasOwnProperty.call(changes, "_meta")) {
        const storedMeta = this._metaByRawId.get(rawId);
        const wasAdoptable = readSessionEhcliAdoptable(storedMeta?._meta);
        if (storedMeta) {
          this._metaByRawId.set(rawId, { ...storedMeta, _meta: changes._meta });
        }
        if (cached.setMeta(changes._meta, tx)) {
          didChange = true;
        }
        if (wasAdoptable && !readSessionEhcliAdoptable(changes._meta)) {
          reopenStateSubscriptionFor = cached.sessionId;
        }
      }
      if (didChange) {
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      }
    });
    if (reopenStateSubscriptionFor !== void 0) {
      this._ensureSessionStateSubscription(reopenStateSubscriptionFor);
    }
  }
  _handleConfigChanged(session, config, replace) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    const sessionId = cached.sessionId;
    const existing = this._runningSessionConfigs.get(sessionId);
    if (existing) {
      this._runningSessionConfigs.set(sessionId, {
        ...existing,
        values: replace ? { ...config } : { ...existing.values, ...config }
      });
    } else {
      this._runningSessionConfigs.set(sessionId, {
        schema: { type: "object", properties: buildMutableConfigSchema(config) },
        values: config
      });
    }
    this._onDidChangeSessionConfig.fire(sessionId);
  }
  _handleChangesetsChanged(session, changesets) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      cached.updateChangesets(changesets);
    }
  }
  _handleSessionMetaChanged(session, meta) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached?.setMeta(meta)) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  /**
   * Optional URI mapper used when applying diff changes. Subclasses
   * override to translate remote diff URIs into agent-host URIs.
   */
  _diffUriMapper() {
    return void 0;
  }
};
BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS = 1e3;
BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MAX_MS = 3e4;
// -- Lazy session-state subscription seeding -----------------------------
/**
 * Idle window before a lazily-created session-state subscription is
 * released. Each call to {@link _keepSessionStateAlive} resets the timer.
 * Long enough to absorb the open→config-picker churn while a session view
 * is active; short enough that closed sessions release within a minute or
 * so, allowing the agent host to evict their cached restored state.
 */
BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS = 3e4;
BaseAgentHostSessionsProvider = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, ILanguageModelsService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IGitHubService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ISessionsService),
  __decorateParam(9, IAgentHostActiveClientService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IDialogService),
  __decorateParam(12, IWorkspaceTrustManagementService)
], BaseAgentHostSessionsProvider);
export {
  AGENT_MODE_KIND,
  AgentHostSessionAdapter,
  BaseAgentHostSessionsProvider,
  CopilotCLISessionType,
  resolveAgentAuthRequirement,
  toSessionChatOriginKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXGJyb3dzZXJcXGJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIHJhY2VDYW5jZWxsYXRpb24sIHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHMsIHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nLCBtYXJrZG93blN0cmluZ0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVWYWx1ZU9wdHMsIHN1YnRyYW5zYWN0aW9uLCB0cmFuc2FjdGlvbiwgd2FpdEZvclN0YXRlLCBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQsIFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIEF1dGhlbnRpY2F0ZVBhcmFtcywgQXV0aGVudGljYXRlUmVzdWx0LCBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIHByb3RlY3RlZFJlc291cmNlc1JlcXVpcmVHaXRIdWJDb3BpbG90U2lnbkluIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q3VzdG9taXphdGlvbkRpc2FibGVkUmVhc29uLCBpc0N1c3RvbWl6YXRpb25FbmFibGVkLCB3aXRoQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IGJ1aWxkQW5ub3RhdGlvbnNVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2Fubm90YXRpb25zVXJpLmpzJztcbmltcG9ydCB7IHBhcnNlR2l0SHViSXNzdWVVcmwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2dpdGh1Yklzc3VlUmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBnZXRFZmZlY3RpdmVBZ2VudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2N1c3RvbUFnZW50cy5qcyc7XG5pbXBvcnQgeyBLTk9XTl9NT0RFX1ZBTFVFUywgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCwgdHlwZSBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbiwgQ2hhbmdlc1N1bW1hcnksIENoYXRJbnRlcmFjdGl2aXR5IGFzIFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kIGFzIFByb3RvY29sQ2hhdE9yaWdpbktpbmQsIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgQ3VzdG9taXphdGlvbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBDdXN0b21pemF0aW9uRW5hYmxlbWVudCwgTW9kZWxTZWxlY3Rpb24sIFNlc3Npb25TdGF0dXMgYXMgUHJvdG9jb2xTZXNzaW9uU3RhdHVzLCBSb290Q29uZmlnU3RhdGUsIFJvb3RTdGF0ZSwgU2Vzc2lvblN0YXRlLCBTZXNzaW9uU3VtbWFyeSwgdHlwZSBDaGFuZ2VzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIGlzQ2hhdEFjdGlvbiwgaXNTZXNzaW9uQWN0aW9uLCBOb3RpZmljYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudENhcGFiaWxpdGllcywgQWdlbnRJbmZvLCBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIGdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzLCBpc0RlZmF1bHRDaGF0VXJpLCBpc1Nlc3Npb25TdGF0dXNBcmNoaXZlZCwgaXNTZXNzaW9uU3RhdHVzUmVhZCwgcGFyc2VDaGF0VXJpLCByZWFkU2Vzc2lvbkVoY2xpQWRvcHRhYmxlLCByZWFkU2Vzc2lvbkV4dGVybmFsLCByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlLCByZWFkU2Vzc2lvbkdpdFN0YXRlLCByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhLCByZWFkU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSwgcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCBST09UX1NUQVRFX1VSSSwgU0VTU0lPTl9NRVRBX01VTFRJX1JPT1RfS0VZLCBTZXNzaW9uTWV0YSwgU2Vzc2lvblNvdXJjZUNvbnRyb2xPdXRjb21lLCBTdGF0ZUNvbXBvbmVudHMsIHdpdGhTZXNzaW9uRXh0ZXJuYWwsIHdpdGhTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEsIHdpdGhTZXNzaW9uU3RhdHVzRmxhZywgd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB0eXBlIENoYXRTdW1tYXJ5LCB0eXBlIElTZXNzaW9uR2l0U3RhdGUsIHR5cGUgSVNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdERvd25sb2FkUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0RG93bmxvYWRQcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBhcmVDdXN0b21pemF0aW9uU2NvcGVSb290c0VxdWFsLCBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGUsIElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIElDaGF0U2VydmljZSwgdHlwZSBJQ2hhdE1vZGVsUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZSwgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCwgZ2V0Q2hhdFBlcm1pc3Npb25MZXZlbEZyb21EZWZhdWx0Q29uZmlndXJhdGlvbiwgaXNDaGF0UGVybWlzc2lvbkxldmVsLCB0eXBlIElDaGF0RGVmYXVsdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQsIG5vcm1hbGl6ZVNlc3Npb25Db25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FnZW50SG9zdENvbmZpZ1BvbGljeS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGdldFJlZ2lzdGVyZWRMYW5ndWFnZU1vZGVscywgcmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbCwgcmVzb2x2ZU1vZGVsSWRlbnRpZmllciwgcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21MYW5ndWFnZU1vZGVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGJ1aWxkTXV0YWJsZUNvbmZpZ1NjaGVtYSwgSUFnZW50SG9zdE1jcFNlcnZlciwgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHJlc29sdmVkQ29uZmlnc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZUtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGlzU2Vzc2lvbkNvbmZpZ0NvbXBsZXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWcuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kLCBERUZBVUxUX0NIQVRfQ0FQQUJJTElUSUVTLCBlZmZlY3RpdmVDaGF0SW50ZXJhY3Rpdml0eSwgSUNoYXQsIElDaGF0Q2FwYWJpbGl0aWVzLCBJR2l0SHViSW5mbywgSUdpdEh1Yklzc3VlUmVmLCBJR2l0SHViUHVsbFJlcXVlc3RSZWYsIElTZXNzaW9uLCBJU2Vzc2lvbkFnZW50UmVmLCBJU2Vzc2lvbkNhcGFiaWxpdGllcywgSVNlc3Npb25DaGFuZ2VzZXQsIElTZXNzaW9uQ2hhbmdlc1N1bW1hcnksIElTZXNzaW9uRmlsZSwgSVNlc3Npb25GaWxlQ2hhbmdlLCBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlLCBJU2Vzc2lvblR5cGUsIElTZXNzaW9uV29ya3NwYWNlLCBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbiwgSVNpZGVDaGF0U2VsZWN0aW9uLCBzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbCwgc2Vzc2lvbldvcmtzcGFjZUVxdWFsLCBTZXNzaW9uU3RhdHVzLCBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudCwgdG9TZXNzaW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURlbGV0ZUNoYXRPcHRpb25zLCBJU2VuZFJlcXVlc3RPcHRpb25zLCBJU2Vzc2lvbkNoYW5nZUV2ZW50LCBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucywgSVNlc3Npb25Nb2RlbHNTbmFwc2hvdCwgSVNlc3Npb25zUHJvdmlkZXJDcmVhdGVTZXNzaW9uT3B0aW9ucywgSVNlc3Npb25Xb3JrdHJlZUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVNlc3Npb25QdWxsUmVxdWVzdEljb24gfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9wdWxsUmVxdWVzdEljb25TdGF0dXMuanMnO1xuaW1wb3J0IHsgSVB1bGxSZXF1ZXN0SWNvbkNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvcHVsbFJlcXVlc3RJY29uQ2FjaGUuanMnO1xuaW1wb3J0IHsgbWFwUHJvdG9jb2xTdGF0dXMgfSBmcm9tICcuL2FnZW50SG9zdERpZmZzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNoYW5nZXNldHMgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25DaGFuZ2VzZXRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNlc3Npb25PdXRwdXRPYnMsIElTZXNzaW9uT3V0cHV0T2JzIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uRmlsZXMuanMnO1xuXG5jb25zdCBTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUyA9ICdzZXNzaW9ucy5hZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZ1BpY2tlci5zZWxlY3RlZFZhbHVlcyc7XG5jb25zdCBVTlNBRkVfU0VTU0lPTl9DT05GSUdfS0VZUyA9IG5ldyBTZXQoWydfX3Byb3RvX18nLCAnY29uc3RydWN0b3InLCAncHJvdG90eXBlJ10pO1xuXG4vLyBXZWxsLWtub3duIGNvbmZpZyBjaGlwcyB3aG9zZSBsYXN0LXJlc29sdmVkIHNjaGVtYXMgYXJlIGNhY2hlZCBhbmQgc2VlZGVkIGludG9cbi8vIG5ldyBkcmFmdHMsIHNvIHRoZXkgc3RheSB2aXNpYmxlIChkaXNhYmxlZCkgd2hpbGUgYSBkcmFmdCByZS1yZXNvbHZlcyByYXRoZXJcbi8vIHRoYW4gYmxhbmtpbmcgdGhlbiByZWFwcGVhcmluZy5cbmNvbnN0IFNFRURFRF9DT05GSUdfU0NIRU1BX0tFWVMgPSBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIFNlc3Npb25Db25maWdLZXkuQnJhbmNoXSBhcyBjb25zdDtcblxuLyoqIENhbmNlbHMgaXRzIHRva2VuIHdoZW4gcmVwbGFjZWQgb3IgZGlzcG9zZWQgYnkgYSBtdXRhYmxlIGRpc3Bvc2FibGUuICovXG5jbGFzcyBBY3RpdmVDbGllbnRTeW5jQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgZXh0ZW5kcyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB7XG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSh0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIHtAbGluayBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbn0gdmFsdWUgdGhhdCBydW5zIGEgc2Vzc2lvbiBpbiBpdHMgb3duIGdpdCB3b3JrdHJlZS5cbiAqL1xuY29uc3QgV09SS1RSRUVfSVNPTEFUSU9OX1ZBTFVFID0gJ3dvcmt0cmVlJztcblxuLyoqIFdoZXRoZXIgdGhlIGdpdmVuIHNlc3Npb24gY29uZmlnIHZhbHVlcyBzZWxlY3Qgd29ya3RyZWUgaXNvbGF0aW9uLiAqL1xuZnVuY3Rpb24gaXNXb3JrdHJlZUlzb2xhdGlvbih2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiB2YWx1ZXM/LltTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0gPT09IFdPUktUUkVFX0lTT0xBVElPTl9WQUxVRTtcbn1cblxuLyoqIE1heGltdW0gbnVtYmVyIG9mIGNhY2hlZCBzZXNzaW9uIHN1bW1hcmllcyBwZXJzaXN0ZWQgcGVyIHByb3ZpZGVyLiAqL1xuY29uc3QgQ0FDSEVEX1NFU1NJT05TX01BWF9QRVJfSE9TVCA9IDEwMDtcblxuLyoqXG4gKiBTZXJpYWxpemVkIHNoYXBlIG9mIGFuIHtAbGluayBJQWdlbnRTZXNzaW9uTWV0YWRhdGF9IHN1aXRhYmxlIGZvclxuICogcGVyc2lzdGluZyB2aWEge0BsaW5rIElTdG9yYWdlU2VydmljZX0uIFVSSXMgYXJlIHN0b3JlZCBhcyBzdHJpbmdzXG4gKiBhbmQgZGlmZnMgYXJlIGludGVudGlvbmFsbHkgb21pdHRlZCAodGhleSBhcmUgcmUtcG9wdWxhdGVkIHdoZW4gdGhlXG4gKiBjb25uZWN0aW9uIHJlZnJlc2hlcyBzZXNzaW9ucykuXG4gKi9cbmludGVyZmFjZSBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YSB7XG5cdHJlYWRvbmx5IHNlc3Npb246IHN0cmluZztcblx0cmVhZG9ubHkgc3RhcnRUaW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1vZGlmaWVkVGltZTogbnVtYmVyO1xuXHRyZWFkb25seSBzdW1tYXJ5Pzogc3RyaW5nO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nO1xuXHQvKiogU2Vzc2lvbi1zY29wZWQgZmxhZyBiaXRzIG9ubHkgXHUyMDE0IHNlZSB7QGxpbmsgU0VTU0lPTl9TVEFUVVNfRkxBR19NQVNLfS4gKi9cblx0cmVhZG9ubHkgc3RhdHVzPzogUHJvdG9jb2xTZXNzaW9uU3RhdHVzO1xuXHQvKiogQGRlcHJlY2F0ZWQgU3VwZXJzZWRlZCBieSB0aGUgYElzUmVhZGAgYml0IG9uIHtAbGluayBzdGF0dXN9LiAqL1xuXHRyZWFkb25seSBpc1JlYWQ/OiBib29sZWFuO1xuXHQvKiogQGRlcHJlY2F0ZWQgU3VwZXJzZWRlZCBieSB0aGUgYElzQXJjaGl2ZWRgIGJpdCBvbiB7QGxpbmsgc3RhdHVzfS4gKi9cblx0cmVhZG9ubHkgaXNBcmNoaXZlZD86IGJvb2xlYW47XG5cdC8qKiBAZGVwcmVjYXRlZCBMZWdhY3kgbmFtZSBmb3IgYGlzQXJjaGl2ZWRgLiAqL1xuXHRyZWFkb25seSBpc0RvbmU/OiBib29sZWFuO1xuXHRyZWFkb25seSBwcm9qZWN0PzogeyByZWFkb25seSB1cmk6IHN0cmluZzsgcmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZyB9O1xuXHQvKipcblx0ICogV2hldGhlciB0aGUgc2Vzc2lvbiBpcyBhIHdvcmtzcGFjZS1sZXNzIHF1aWNrIGNoYXQuIFBlcnNpc3RlZCBiZWNhdXNlIHRoZVxuXHQgKiBhZGFwdGVyIHNlZWRzIGl0cyBzZXNzaW9uLWtpbmQgZnJvbSB0aGlzIHRhZyBhdCBjb25zdHJ1Y3Rpb24gKHNlZVxuXHQgKiB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXJ9KTsgZHJvcHBpbmcgaXQgb24gcmVzdG9yZSB3b3VsZCBsZWFrIHRoZVxuXHQgKiBob3N0J3Mgc2NyYXRjaCBkaXIgYXMgYSB3b3Jrc3BhY2UgZm9sZGVyIHVudGlsIHRoZSBuZXh0IGxpc3RpbmcgYXJyaXZlcy5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuO1xuXHRyZWFkb25seSBleHRlcm5hbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG11bHRpUm9vdD86IElTZXNzaW9uTXVsdGlSb290TWV0YWRhdGE7XG59XG5cbi8qKlxuICogT25seSB0aGVzZSBiaXRzIGFyZSBjYWNoZWQuIFRoZSBhY3Rpdml0eSBiaXRzIGFyZSBsaXZlIHN0YXRlLCBhbmQgcmVzdG9yaW5nIHRoZW1cbiAqIHdvdWxkIHNob3cgYSBzdGFsZSBzcGlubmVyIHVudGlsIHRoZSBuZXh0IGBsaXN0U2Vzc2lvbnMoKWAgbGFuZHMgXHUyMDE0IGluZGVmaW5pdGVseVxuICogZm9yIGFuIHVucmVhY2hhYmxlIHJlbW90ZSBob3N0LCB3aGljaCBrZWVwcyByZXB1Ymxpc2hpbmcgaXRzIGNhY2hlZCBzbmFwc2hvdC5cbiAqL1xuY29uc3QgU0VTU0lPTl9TVEFUVVNfRkxBR19NQVNLID0gUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklzUmVhZCB8IFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkO1xuXG5mdW5jdGlvbiBzZXJpYWxpemVNZXRhZGF0YShtZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YSB7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbjogbWV0YS5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0c3RhcnRUaW1lOiBtZXRhLnN0YXJ0VGltZSxcblx0XHRtb2RpZmllZFRpbWU6IG1ldGEubW9kaWZpZWRUaW1lLFxuXHRcdHN1bW1hcnk6IG1ldGEuc3VtbWFyeSxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBtZXRhLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdPy50b1N0cmluZygpLFxuXHRcdHN0YXR1czogbWV0YS5zdGF0dXMgIT09IHVuZGVmaW5lZCA/IG1ldGEuc3RhdHVzICYgU0VTU0lPTl9TVEFUVVNfRkxBR19NQVNLIDogdW5kZWZpbmVkLFxuXHRcdHByb2plY3Q6IG1ldGEucHJvamVjdCA/IHsgdXJpOiBtZXRhLnByb2plY3QudXJpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBtZXRhLnByb2plY3QuZGlzcGxheU5hbWUgfSA6IHVuZGVmaW5lZCxcblx0XHR3b3Jrc3BhY2VsZXNzOiByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MobWV0YS5fbWV0YSkgfHwgdW5kZWZpbmVkLFxuXHRcdGV4dGVybmFsOiByZWFkU2Vzc2lvbkV4dGVybmFsKG1ldGEuX21ldGEpIHx8IHVuZGVmaW5lZCxcblx0XHRtdWx0aVJvb3Q6IHJlYWRTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEobWV0YS5fbWV0YSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplTWV0YWRhdGEocmF3OiBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YSk6IElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0bGV0IF9tZXRhID0gd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgcmF3LndvcmtzcGFjZWxlc3MgPT09IHRydWUpO1xuXHRcdF9tZXRhID0gd2l0aFNlc3Npb25FeHRlcm5hbChfbWV0YSwgcmF3LmV4dGVybmFsID09PSB0cnVlKTtcblx0XHRfbWV0YSA9IHdpdGhTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEoX21ldGEsIHJlYWRTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEoeyBbU0VTU0lPTl9NRVRBX01VTFRJX1JPT1RfS0VZXTogcmF3Lm11bHRpUm9vdCB9KSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShyYXcuc2Vzc2lvbiksXG5cdFx0XHRzdGFydFRpbWU6IHJhdy5zdGFydFRpbWUsXG5cdFx0XHRtb2RpZmllZFRpbWU6IHJhdy5tb2RpZmllZFRpbWUsXG5cdFx0XHRzdW1tYXJ5OiByYXcuc3VtbWFyeSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcmF3LndvcmtpbmdEaXJlY3RvcnkgPyBbVVJJLnBhcnNlKHJhdy53b3JraW5nRGlyZWN0b3J5KV0gOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0dXM6IGRlc2VyaWFsaXplU3RhdHVzKHJhdyksXG5cdFx0XHRwcm9qZWN0OiByYXcucHJvamVjdCA/IHsgdXJpOiBVUkkucGFyc2UocmF3LnByb2plY3QudXJpKSwgZGlzcGxheU5hbWU6IHJhdy5wcm9qZWN0LmRpc3BsYXlOYW1lIH0gOiB1bmRlZmluZWQsXG5cdFx0XHQuLi4oX21ldGEgPyB7IF9tZXRhIH0gOiB7fSksXG5cdFx0fTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKiogUmVhZHMgdGhlIGNhY2hlZCBmbGFnIGJpdHMsIGZvbGRpbmcgaW4gdGhlIGxlZ2FjeSBzdGFuZGFsb25lIGJvb2xlYW5zLiAqL1xuZnVuY3Rpb24gZGVzZXJpYWxpemVTdGF0dXMocmF3OiBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YSk6IFByb3RvY29sU2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGxlZ2FjeUFyY2hpdmVkID0gcmF3LmlzQXJjaGl2ZWQgPz8gcmF3LmlzRG9uZTtcblx0aWYgKHJhdy5pc1JlYWQgPT09IHVuZGVmaW5lZCAmJiBsZWdhY3lBcmNoaXZlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHJhdy5zdGF0dXMgIT09IHVuZGVmaW5lZCA/IHJhdy5zdGF0dXMgJiBTRVNTSU9OX1NUQVRVU19GTEFHX01BU0sgOiB1bmRlZmluZWQ7XG5cdH1cblx0bGV0IHN0YXR1cyA9IChyYXcuc3RhdHVzID8/IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlKSAmIFNFU1NJT05fU1RBVFVTX0ZMQUdfTUFTSztcblx0aWYgKHJhdy5pc1JlYWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdHN0YXR1cyA9IHdpdGhTZXNzaW9uU3RhdHVzRmxhZyhzdGF0dXMsIFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc1JlYWQsIHJhdy5pc1JlYWQpO1xuXHR9XG5cdGlmIChsZWdhY3lBcmNoaXZlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0c3RhdHVzID0gd2l0aFNlc3Npb25TdGF0dXNGbGFnKHN0YXR1cywgUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQsIGxlZ2FjeUFyY2hpdmVkKTtcblx0fVxuXHRyZXR1cm4gc3RhdHVzO1xufVxuXG5mdW5jdGlvbiBpc1JlbWVtYmVyZWRTZXNzaW9uQ29uZmlnS2V5KHByb3BlcnR5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHByb3BlcnR5ICE9PSBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCAmJiAhVU5TQUZFX1NFU1NJT05fQ09ORklHX0tFWVMuaGFzKHByb3BlcnR5KTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZSh2YWx1ZTogdW5rbm93biwgcG9saWN5UmVzdHJpY3RlZDogYm9vbGVhbik6IENoYXRQZXJtaXNzaW9uTGV2ZWwgfCB1bmRlZmluZWQge1xuXHQvLyBgS05PV05fQVVUT19BUFBST1ZFX1ZBTFVFU2AgaXMgaW50ZW50aW9uYWxseSB0b2xlcmFudCBvZiBsZWdhY3kgdmFsdWVzXG5cdC8vIHRoYXQgYXJlIG5vdCByZWFsIGBDaGF0UGVybWlzc2lvbkxldmVsYHMuIFZhbGlkYXRlIGFnYWluc3QgdGhlIGVudW0gaGVyZVxuXHQvLyBzbyB0aGlzIGZ1bmN0aW9uIG5ldmVyIHJldHVybnMgYSB2YWx1ZSBvdXRzaWRlIGl0cyBkZWNsYXJlZCBjb250cmFjdC5cblx0Y29uc3Qgbm9ybWFsaXplZCA9IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24odmFsdWUpID8/IChpc0NoYXRQZXJtaXNzaW9uTGV2ZWwodmFsdWUpID8gdmFsdWUgOiB1bmRlZmluZWQpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIEJ5cGFzcyBhbmQgKGxlZ2FjeSkgQXV0b3BpbG90IGF1dG8tYXBwcm92ZSBhdCBsZWFzdCBzb21lXG5cdC8vIHRvb2wgY2FsbHMsIHNvIGNsYW1wIHRoZW0gdG8gRGVmYXVsdCB3aGVuIGVudGVycHJpc2UgcG9saWN5IGRpc2FibGVzXG5cdC8vIGdsb2JhbCBhdXRvLWFwcHJvdmFsLlxuXHRpZiAocG9saWN5UmVzdHJpY3RlZCAmJiBub3JtYWxpemVkICE9PSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpIHtcblx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHR9XG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuXG5mdW5jdGlvbiBpc0dpdEh1YkluZm9FcXVhbChhOiBJR2l0SHViSW5mbyB8IHVuZGVmaW5lZCwgYjogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChhID09PSB1bmRlZmluZWQgfHwgYiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIGEub3duZXIgPT09IGIub3duZXIgJiZcblx0XHRhLnJlcG8gPT09IGIucmVwbyAmJlxuXHRcdGFycmF5RXF1YWxzKGEucHVsbFJlcXVlc3RzID8/IFtdLCBiLnB1bGxSZXF1ZXN0cyA/PyBbXSwgKHgsIHkpID0+XG5cdFx0XHR4Lm93bmVyID09PSB5Lm93bmVyICYmXG5cdFx0XHR4LnJlcG8gPT09IHkucmVwbyAmJlxuXHRcdFx0eC5udW1iZXIgPT09IHkubnVtYmVyICYmXG5cdFx0XHRpc0VxdWFsKHgudXJpLCB5LnVyaSkgJiZcblx0XHRcdHguaWNvbj8uaWQgPT09IHkuaWNvbj8uaWQpICYmXG5cdFx0YS5wdWxsUmVxdWVzdD8ubnVtYmVyID09PSBiLnB1bGxSZXF1ZXN0Py5udW1iZXIgJiZcblx0XHRhLnB1bGxSZXF1ZXN0Py5pY29uPy5pZCA9PT0gYi5wdWxsUmVxdWVzdD8uaWNvbj8uaWQgJiZcblx0XHRhLnB1bGxSZXF1ZXN0Py5iYXNlUmVmT2lkID09PSBiLnB1bGxSZXF1ZXN0Py5iYXNlUmVmT2lkICYmXG5cdFx0YS5wdWxsUmVxdWVzdD8uaGVhZFJlZk9pZCA9PT0gYi5wdWxsUmVxdWVzdD8uaGVhZFJlZk9pZCAmJlxuXHRcdGFycmF5RXF1YWxzKGEuaXNzdWVzID8/IFtdLCBiLmlzc3VlcyA/PyBbXSwgKHgsIHkpID0+IHgub3duZXIgPT09IHkub3duZXIgJiYgeC5yZXBvID09PSB5LnJlcG8gJiYgeC5udW1iZXIgPT09IHkubnVtYmVyKTtcbn1cblxuZnVuY3Rpb24gZGF0ZUVxdWFscyhhOiBEYXRlIHwgdW5kZWZpbmVkLCBiOiBEYXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBhPy5nZXRUaW1lKCkgPT09IGI/LmdldFRpbWUoKTtcbn1cblxuZnVuY3Rpb24gbWFya2Rvd25TdHJpbmdFcXVhbHMoYTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCBiOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGEgPT09IGIgfHwgISFhICYmICEhYiAmJiBtYXJrZG93blN0cmluZ0VxdWFsKGEsIGIpO1xufVxuXG4vKiogTWFwcyB0aGUgR2l0SHViIGlzc3VlIFVSTHMgcmVjb3JkZWQgb24gdGhlIHNlc3Npb24ncyBtZXRhZGF0YSB0byBpc3N1ZSByZWZlcmVuY2VzLiAqL1xuZnVuY3Rpb24gdG9HaXRIdWJJc3N1ZVJlZnMoaXNzdWVVcmxzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IElHaXRIdWJJc3N1ZVJlZltdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVmczogSUdpdEh1Yklzc3VlUmVmW10gPSBbXTtcblx0Zm9yIChjb25zdCB1cmwgb2YgaXNzdWVVcmxzID8/IFtdKSB7XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gcGFyc2VHaXRIdWJJc3N1ZVVybCh1cmwpO1xuXHRcdGlmIChyZWZlcmVuY2UpIHtcblx0XHRcdHJlZnMucHVzaCh7IC4uLnJlZmVyZW5jZSwgdXJpOiBVUkkucGFyc2UodXJsKSB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlZnMubGVuZ3RoID4gMCA/IHJlZnMgOiB1bmRlZmluZWQ7XG59XG5cbi8qKiBNYXBzIHNlc3Npb24gcHVsbCByZXF1ZXN0IFVSTHMgdG8gcmVmZXJlbmNlcywgcHJlc2VydmluZyByZWNlbmN5IG9yZGVyLiAqL1xuZnVuY3Rpb24gdG9HaXRIdWJQdWxsUmVxdWVzdFJlZnMocHVsbFJlcXVlc3RVcmxzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IElHaXRIdWJQdWxsUmVxdWVzdFJlZltdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVmczogSUdpdEh1YlB1bGxSZXF1ZXN0UmVmW10gPSBbXTtcblx0Zm9yIChjb25zdCB1cmwgb2YgcHVsbFJlcXVlc3RVcmxzID8/IFtdKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXmh0dHBzOlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXi9dKylcXC8oW14vXSspXFwvcHVsbFxcLyhcXGQrKVxcLz8kLy5leGVjKHVybCk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHJlZnMucHVzaCh7XG5cdFx0XHRvd25lcjogbWF0Y2hbMV0sXG5cdFx0XHRyZXBvOiBtYXRjaFsyXSxcblx0XHRcdG51bWJlcjogTnVtYmVyKG1hdGNoWzNdKSxcblx0XHRcdHVyaTogVVJJLnBhcnNlKHVybCksXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIHJlZnMubGVuZ3RoID4gMCA/IHJlZnMgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRvR2l0SHViSW5mbyhtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCk6IElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3RhdGUgPSByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKG1ldGEpO1xuXHRjb25zdCBnaXRTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0U3RhdGUobWV0YSk7XG5cdGNvbnN0IHB1bGxSZXF1ZXN0cyA9IHRvR2l0SHViUHVsbFJlcXVlc3RSZWZzKGdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzKHN0YXRlKSk7XG5cdGNvbnN0IHB1bGxSZXF1ZXN0ID0gcHVsbFJlcXVlc3RzPy5bMF07XG5cdGNvbnN0IHJlcG9zaXRvcnkgPSBzdGF0ZT8ub3duZXIgJiYgc3RhdGUucmVwb1xuXHRcdD8geyBvd25lcjogc3RhdGUub3duZXIsIHJlcG86IHN0YXRlLnJlcG8gfVxuXHRcdDogZ2l0U3RhdGU/LmdpdGh1Yk93bmVyICYmIGdpdFN0YXRlLmdpdGh1YlJlcG9cblx0XHRcdD8geyBvd25lcjogZ2l0U3RhdGUuZ2l0aHViT3duZXIsIHJlcG86IGdpdFN0YXRlLmdpdGh1YlJlcG8gfVxuXHRcdFx0OiBwdWxsUmVxdWVzdDtcblxuXHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRvd25lcjogcmVwb3NpdG9yeS5vd25lcixcblx0XHRyZXBvOiByZXBvc2l0b3J5LnJlcG8sXG5cdFx0cHVsbFJlcXVlc3RzLFxuXHRcdHB1bGxSZXF1ZXN0OiBwdWxsUmVxdWVzdCA/IHtcblx0XHRcdG51bWJlcjogcHVsbFJlcXVlc3QubnVtYmVyLFxuXHRcdFx0dXJpOiBwdWxsUmVxdWVzdC51cmksXG5cdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRpc3N1ZXM6IHRvR2l0SHViSXNzdWVSZWZzKHN0YXRlPy5pc3N1ZVVybHMpLFxuXHR9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlciBcdTIwMTQgc2hhcmVkIGFkYXB0ZXIgZm9yIGxvY2FsIGFuZCByZW1vdGUgc2Vzc2lvbnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqIENvcGlsb3QgQ0xJIHNlc3Npb24gdHlwZSAqL1xuZXhwb3J0IGNvbnN0IENvcGlsb3RDTElTZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlID0ge1xuXHRpZDogJ2NvcGlsb3RjbGknLFxuXHRsYWJlbDogbG9jYWxpemUoJ2NvcGlsb3RDTEknLCBcIkNvcGlsb3RcIiksXG5cdGljb246IENvZGljb24uY29waWxvdCxcblx0c3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb246IHRydWUsXG5cdGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLFxufTtcblxuLyoqXG4gKiBSZXNvbHZlIHdoYXQgYW4gYWdlbnQgbmVlZHMgYmVmb3JlIGl0IGNhbiBzZXJ2ZSBhIHJlcXVlc3QsIGZyb20gd2hhdCBpdFxuICogYWR2ZXJ0aXNlcyBcdTIwMTQgcmF0aGVyIHRoYW4gZnJvbSBhIHN0YXRpYyBwZXItdHlwZSBmbGFnLCB3aGljaCBjYW5ub3QgdHJhY2tcbiAqIGNyZWRlbnRpYWxzIHRoYXQgY29tZSBhbmQgZ28uIFRoZSBhZHZlcnRpc2VkIHByb3RlY3RlZC1yZXNvdXJjZSBzZXQgYWxyZWFkeVxuICogY3Jvc3NlcyB0aGUgYWdlbnQtaG9zdCBJUEMgYm91bmRhcnkgYW5kIGFscmVhZHkgdXBkYXRlcyByZWFjdGl2ZWx5LCBzbyBpdCBpc1xuICogdGhlIHNpZ25hbCByYXRoZXIgdGhhbiBhIHBhcmFsbGVsIGZpZWxkIHByb3ZpZGVycyB3b3VsZCBoYXZlIHRvIGtlZXAgaW4gc3luYy5cbiAqXG4gKiBBbiBhZ2VudCB0aGF0IHN0aWxsIHJlcXVpcmVzIHRoZSBHaXRIdWIgQ29waWxvdCBwcm90ZWN0ZWQgcmVzb3VyY2UgbmVlZHNcbiAqIHNpZ24taW47IG9uZSB0aGF0IGhhcyBkcm9wcGVkIHRoZSByZXF1aXJlbWVudCBpcyBydW5uaW5nIG9uIGl0cyBvd25cbiAqIGNyZWRlbnRpYWxzLiBOb3RlIGJvdGggQ2xhdWRlIGFuZCBDb2RleCBlbmNvZGUgXCJub3QgcmVxdWlyZWRcIiBieSAqa2VlcGluZyogdGhlXG4gKiBDb3BpbG90IHJlc291cmNlIGFuZCBtYXJraW5nIGl0IGByZXF1aXJlZDogZmFsc2VgIHJhdGhlciB0aGFuIG9taXR0aW5nIGl0IFx1MjAxNFxuICogdGhhdCBsZXRzIHRoZSBob3N0IHNpbGVudGx5IGZvcndhcmQgYSB0b2tlbiB0byBhbiBhbHJlYWR5LXNpZ25lZC1pbiB1c2VyXG4gKiB3aXRob3V0IGZvcmNpbmcgc2lnbi1pbiBvbiBhbnlvbmUgZWxzZS4gVGhpcyB0cmVhdHMgdGhlIHR3byBpZGVudGljYWxseS5cbiAqXG4gKiBUaGUgbW9kZWwgY291bnQgaXMgdGhlIHNlY29uZCwgbG9hZC1iZWFyaW5nIGhhbGYuIGByZXF1aXJlZDogZmFsc2VgIGFsb25lXG4gKiB3b3VsZCByZWFkIGFzIFwidXNhYmxlIHdpdGhvdXQgR2l0SHViXCIgZXZlbiBmb3IgYW4gYWdlbnQgdGhhdCBjYW5ub3Qgc2VydmVcbiAqIGFueXRoaW5nLCBiZWNhdXNlIGFuIGFnZW50IG1heSBhZHZlcnRpc2UgYSAqc3RhdGljKiBtb2RlbCBjYXRhbG9nIHRoYXQgYW5zd2Vyc1xuICogcmVnYXJkbGVzcyBvZiBjcmVkZW50aWFscyAodGhlIENsYXVkZSBTREsncyBgc3VwcG9ydGVkTW9kZWxzKClgIGRvZXMgZXhhY3RseVxuICogdGhpcykuIFByb3ZpZGVycyBhcmUgdGhlcmVmb3JlIGV4cGVjdGVkIHRvIHB1Ymxpc2ggYW4gZW1wdHkgY2F0YWxvZyB3aGVuIHRoZXlcbiAqIGdlbnVpbmVseSBjYW5ub3QgcnVuLCBhbmQgYW4gZW1wdHkgY2F0YWxvZyBpcyB3aGF0IGRpc3Rpbmd1aXNoZXNcbiAqIHtAbGluayBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5VbnVzYWJsZX0gZnJvbVxuICoge0BsaW5rIFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50Lk5vbmV9IGhlcmUuXG4gKlxuICogQWJzZW50IHJlc291cmNlcyBtZWFuIHRoZSBob3N0IGhhcyBub3QgcmVzb2x2ZWQgdGhlIGFnZW50IHlldCwgc28gYXNzdW1lXG4gKiBHaXRIdWIgdW50aWwgaXQgZG9lcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVBZ2VudEF1dGhSZXF1aXJlbWVudChhZ2VudDogQWdlbnRJbmZvKTogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQge1xuXHRpZiAoIWFnZW50LnByb3RlY3RlZFJlc291cmNlcyB8fCBwcm90ZWN0ZWRSZXNvdXJjZXNSZXF1aXJlR2l0SHViQ29waWxvdFNpZ25JbihhZ2VudC5wcm90ZWN0ZWRSZXNvdXJjZXMpKSB7XG5cdFx0cmV0dXJuIFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1Yjtcblx0fVxuXHRyZXR1cm4gYWdlbnQubW9kZWxzLmxlbmd0aCA+IDAgPyBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5Ob25lIDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuVW51c2FibGU7XG59XG5cbi8qKlxuICogU3RyYXRlZ3kgdGhhdCBjYXB0dXJlcyB0aGUgcXVpY2stY2hhdCB2cy4gd29ya3NwYWNlIGRpZmZlcmVuY2VzIG9mIGFuXG4gKiBhZ2VudC1ob3N0IHNlc3Npb24gaW4gb25lIHBsYWNlLCBzbyB0aGUgYWRhcHRlciBhbmQgZHJhZnQgY2xhc3NlcyBkZWxlZ2F0ZSB0b1xuICogaXQgaW5zdGVhZCBvZiByZS1icmFuY2hpbmcgb24gYHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzc2AuIERyYWZ0cyBmaXggdGhlaXJcbiAqIGtpbmQgYXQgY29uc3RydWN0aW9uOyBhZGFwdGVycyBzZWxlY3QgaXQgZnJvbSB0aGVpciBtb25vdG9uaWMgcXVpY2stY2hhdFxuICogc3RhdGUsIHNvIGEgcHJvbW90aW9uIHN3YXBzIHRoZSBzdHJhdGVneS5cbiAqL1xuaW50ZXJmYWNlIElBZ2VudEhvc3RTZXNzaW9uS2luZCB7XG5cdHJlYWRvbmx5IGlzUXVpY2tDaGF0OiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgc2Vzc2lvbiByZXF1aXJlcyBhIHdvcmtzcGFjZS9yZXBvc2l0b3J5IHRvIGJlIGNvbnN0cnVjdGVkLiAqL1xuXHRyZWFkb25seSByZXF1aXJlc1dvcmtzcGFjZTogYm9vbGVhbjtcblx0LyoqIFVudGl0bGVkIHNrZWxldG9uIHRpdGxlIGJlZm9yZSB0aGUgZmlyc3QgcmVxdWVzdCBjb21taXRzIHRoZSBzZXNzaW9uLiAqL1xuXHRyZWFkb25seSB1bnRpdGxlZFRpdGxlOiBzdHJpbmc7XG5cdGNvbXB1dGVXb3Jrc3BhY2UoYnVpbGRXb3Jrc3BhY2U6ICgpID0+IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IFdvcmtzcGFjZVNlc3Npb25LaW5kOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQgPSB7XG5cdGlzUXVpY2tDaGF0OiBmYWxzZSxcblx0cmVxdWlyZXNXb3Jrc3BhY2U6IHRydWUsXG5cdGdldCB1bnRpdGxlZFRpdGxlKCkgeyByZXR1cm4gbG9jYWxpemUoJ25ldyBzZXNzaW9uJywgXCJOZXcgU2Vzc2lvblwiKTsgfSxcblx0Y29tcHV0ZVdvcmtzcGFjZTogYnVpbGRXb3Jrc3BhY2UgPT4gYnVpbGRXb3Jrc3BhY2UoKSxcbn07XG5cbmNvbnN0IFF1aWNrQ2hhdFNlc3Npb25LaW5kOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQgPSB7XG5cdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRyZXF1aXJlc1dvcmtzcGFjZTogZmFsc2UsXG5cdGdldCB1bnRpdGxlZFRpdGxlKCkgeyByZXR1cm4gbG9jYWxpemUoJ25ldyBjaGF0JywgXCJOZXcgQ2hhdFwiKTsgfSxcblx0Y29tcHV0ZVdvcmtzcGFjZTogKCkgPT4gdW5kZWZpbmVkLFxufTtcblxuZnVuY3Rpb24gc2Vzc2lvbktpbmQoaXNRdWlja0NoYXQ6IGJvb2xlYW4pOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQge1xuXHRyZXR1cm4gaXNRdWlja0NoYXQgPyBRdWlja0NoYXRTZXNzaW9uS2luZCA6IFdvcmtzcGFjZVNlc3Npb25LaW5kO1xufVxuXG4vKipcbiAqIFZhcmlhdGlvbiBwb2ludHMgdGhlIGhvc3QgcHJvdmlkZXIgc3VwcGxpZXMgd2hlbiBidWlsZGluZyBhbiBhZGFwdGVyLlxuICogRGlmZmVyZW5jZXMgYmV0d2VlbiBsb2NhbCBhbmQgcmVtb3RlIHNlc3Npb25zIChpY29uLCBkZXNjcmlwdGlvbiB0ZXh0LFxuICogd29ya3NwYWNlIGJ1aWxkZXIsIG9wdGlvbmFsIFVSSSBtYXBwaW5nKSBmbG93IHRocm91Z2ggdGhpcyBvcHRpb25zIGJhZyBzb1xuICogdGhlIGFkYXB0ZXIgaXRzZWxmIHN0YXlzIGEgc2luZ2xlIGNvbmNyZXRlIGNsYXNzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0LyoqIExvYWRpbmcgb2JzZXJ2YWJsZSB3aXJlZCB0byB0aGUgcHJvdmlkZXIncyBhdXRoZW50aWNhdGlvbi1wZW5kaW5nIHN0YXRlLiAqL1xuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIEJ1aWxkcyB0aGUgc2Vzc2lvbiB3b3Jrc3BhY2UgZnJvbSBzZXNzaW9uIG1ldGFkYXRhOyBwcm92aWRlci1zcGVjaWZpYyAoaWNvbiwgcHJvdmlkZXJMYWJlbCwgcmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCkuICovXG5cdHJlYWRvbmx5IGJ1aWxkV29ya3NwYWNlOiAocHJvamVjdDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10sIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPiwgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgfCB1bmRlZmluZWQpID0+IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHQvKiogT3B0aW9uYWwgVVJJIG1hcHBpbmcgZm9yIGRpZmYgZW50cmllcyAocmVtb3RlIHVzZXMgYHRvQWdlbnRIb3N0VXJpYDsgbG9jYWwgdXNlcyBpZGVudGl0eSkuICovXG5cdHJlYWRvbmx5IG1hcERpZmZVcmk/OiAodXJpOiBVUkkpID0+IFVSSTtcblx0LyoqXG5cdCAqIEdpdEh1YiBzZXJ2aWNlIHVzZWQgdG8gcmVzb2x2ZSB0aGUgcHVsbCByZXF1ZXN0IHRoYXQgdGFyZ2V0cyB0aGVcblx0ICogc2Vzc2lvbidzIGJyYW5jaCBhbmQgcmVmcmVzaCBpdHMgbGl2ZSBzdGF0ZS4gT3B0aW9uYWwgc28gdGVzdHMgLyBob3N0c1xuXHQgKiB3aXRob3V0IGEgd29ya2JlbmNoIEdpdEh1YiBzZXJ2aWNlIHN0aWxsIGNvbnN0cnVjdCBhZGFwdGVyczsgUFJcblx0ICogYWZmb3JkYW5jZXMgc2ltcGx5IHN0YXkgZG9ybWFudCB3aGVuIGFic2VudC5cblx0ICovXG5cdHJlYWRvbmx5IGdpdEh1YlNlcnZpY2U/OiBJR2l0SHViU2VydmljZTtcblx0LyoqXG5cdCAqIEluc3RhbnRpYXRpb24gc2VydmljZSB1c2VkIHRvIGNvbnN0cnVjdCB0aGUgc2Vzc2lvbidzIGNoYW5nZXNldFxuXHQgKiByZXNvbHZlcnMuIFNoYXJlZCB3aXRoIHRoZSBDb3BpbG90IGNoYXQgc2Vzc2lvbnMgcHJvdmlkZXIgc28gYWxsXG5cdCAqIGFnZW50LWhvc3Qgc2Vzc2lvbnMgc3VyZmFjZSB0aGUgc2FtZSBzZXQgb2YgY2hhbmdlc2V0cy5cblx0ICovXG5cdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdC8qKlxuXHQgKiBGb3JjZXMgZXZlcnkgY2hhdCBpbiB0aGUgc2Vzc2lvbiB0byBiZSByZWFkLW9ubHkgd2hpbGUgYHRydWVgLCByZWdhcmRsZXNzIG9mIHdoYXQgdGhlIGhvc3Rcblx0ICogcmVwb3J0ZWQuIFNldCB3aGVuIHRoZSBzZXNzaW9uJ3MgYmFja2luZyBlbnZpcm9ubWVudCBpcyB1bnJlYWNoYWJsZSBhbmQgaXRzIGNvbnZlcnNhdGlvbiBpc1xuXHQgKiBiZWluZyBzZXJ2ZWQgZnJvbSBwZXJzaXN0ZWQgaGlzdG9yeTogdGhlIHRyYW5zY3JpcHQgaXMgcmVhbCwgYnV0IG5vdGhpbmcgY2FuIGJlIHNlbnQgdG8gYVxuXHQgKiBob3N0IHRoYXQgbm8gbG9uZ2VyIGV4aXN0cy5cblx0ICovXG5cdHJlYWRvbmx5IHJlYWRPbmx5PzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhZ2VudCBjb25uZWN0aW9uIGZvciB0aGUgc2Vzc2lvbiwgaWYgaXQgZXhpc3RzLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2V0Q29ubmVjdGlvbjogKCkgPT4gSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0LyoqIEFnZW50IGNhcGFiaWxpdHkgbG9va3VwIHNoYXJlZCBieSBldmVyeSBhZGFwdGVyIG93bmVkIGJ5IHRoaXMgcHJvdmlkZXIuICovXG5cdHJlYWRvbmx5IGFnZW50Q2FwYWJpbGl0aWVzOiBJT2JzZXJ2YWJsZTxSZWFkb25seU1hcDxzdHJpbmcsIEFnZW50Q2FwYWJpbGl0aWVzIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZD47XG5cdC8qKlxuXHQgKiBUaGUgc2NoZW1lIHRoZSBob3N0IGFkZHJlc3NlcyB0aGlzIHNlc3Npb24gdW5kZXIsIHdoZW4gaXQgZGlmZmVycyBmcm9tIHRoZSBhZ2VudCBwcm92aWRlclxuXHQgKiAoY2xvdWQgc2FuZGJveDogcHJvdmlkZXIgYGNvcGlsb3RgLCBzZXNzaW9ucyBgYWhwLXNlc3Npb246LzxpZD5gKS4gRGVmYXVsdHMgdG8gdGhlIHByb3ZpZGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgYmFja2VuZFNlc3Npb25TY2hlbWU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogTWFwcyB0aGUgcHJvdG9jb2wge0BsaW5rIFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHl9IHRvIHRoZSBwcm92aWRlci1hZ25vc3RpY1xuICoge0BsaW5rIENoYXRJbnRlcmFjdGl2aXR5fS4gQWJzZW50IGludGVyYWN0aXZpdHkgZGVmYXVsdHMgdG8ge0BsaW5rXG4gKiBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsfSBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eS5cbiAqL1xuZnVuY3Rpb24gdG9DaGF0SW50ZXJhY3Rpdml0eShpbnRlcmFjdGl2aXR5OiBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5IHwgdW5kZWZpbmVkKTogQ2hhdEludGVyYWN0aXZpdHkge1xuXHRzd2l0Y2ggKGludGVyYWN0aXZpdHkpIHtcblx0XHRjYXNlIFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHk6XG5cdFx0XHRyZXR1cm4gQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHk7XG5cdFx0Y2FzZSBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbjpcblx0XHRcdHJldHVybiBDaGF0SW50ZXJhY3Rpdml0eS5IaWRkZW47XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsO1xuXHR9XG59XG5cbi8qKlxuICogQSBub24tZGVmYXVsdCBwZWVyIGNoYXQgd2l0aGluIGFuIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlcn0uIEhvbGRzIGl0c1xuICogb3duIG9ic2VydmFibGVzIHNlZWRlZCBmcm9tIHRoZSBwcm90b2NvbCB7QGxpbmsgQ2hhdFN1bW1hcnl9IHNvIHRoZSBjaGF0IHRhYlxuICogcmVuZGVycyB0aGUgY2hhdCdzIG93biB0aXRsZS9zdGF0dXMvYWN0aXZpdHkgaW5kZXBlbmRlbnRseSBvZiB0aGUgYWdncmVnYXRlZFxuICogc2Vzc2lvbi1sZXZlbCBzdGF0ZS4gVGhlIHtAbGluayBJQ2hhdC5yZXNvdXJjZX0gY2FycmllcyB0aGUgY2hhdElkIGluIGl0cyBVUklcbiAqIGZyYWdtZW50IHNvIHRoZSBjaGF0IHZpZXcgb3BlbnMgYSBkaXN0aW5jdCB3aWRnZXQgcGVyIHBlZXIgY2hhdC5cbiAqL1xuY2xhc3MgQWRkaXRpb25hbENoYXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBjaGF0OiBJQ2hhdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXM6IElTZXR0YWJsZU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZWRBdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxEYXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxJZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXNjcmlwdGlvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0VHVybkVuZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW50ZXJhY3Rpdml0eTogSVNldHRhYmxlT2JzZXJ2YWJsZTxDaGF0SW50ZXJhY3Rpdml0eT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTmV3OiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKHJlc291cmNlOiBVUkksIHN1bW1hcnk6IENoYXRTdW1tYXJ5LCBpc05ldzogYm9vbGVhbiA9IGZhbHNlLCBwYXJlbnRDaGF0PzogVVJJLCBzZXNzaW9uSXNBcmNoaXZlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBjb25zdE9ic2VydmFibGUoZmFsc2UpLCBsYXN0VHVybkNoYW5nZXM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlW10+LCBzZXNzaW9uSXNSZWFkT25seTogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBjb25zdE9ic2VydmFibGUoZmFsc2UpKSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBtb2RpZmllZEF0ID0gc3VtbWFyeS5tb2RpZmllZEF0ID8gbmV3IERhdGUoc3VtbWFyeS5tb2RpZmllZEF0KSA6IG5ldyBEYXRlKCk7XG5cdFx0dGhpcy5fdGl0bGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2NoYXRUaXRsZScsIHN1bW1hcnkudGl0bGUgfHwgbG9jYWxpemUoJ25ld0NoYXRUYWInLCBcIk5ldyBDaGF0XCIpKTtcblx0XHR0aGlzLl9zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8U2Vzc2lvblN0YXR1cz4oJ2NoYXRTdGF0dXMnLCBtYXBQcm90b2NvbFN0YXR1cyhzdW1tYXJ5LnN0YXR1cykpO1xuXHRcdHRoaXMuX3VwZGF0ZWRBdCA9IG9ic2VydmFibGVWYWx1ZU9wdHM8RGF0ZT4oeyBvd25lcjogdGhpcywgZGVidWdOYW1lOiAnY2hhdFVwZGF0ZWRBdCcsIGVxdWFsc0ZuOiBkYXRlRXF1YWxzIH0sIG1vZGlmaWVkQXQpO1xuXHRcdHRoaXMuX21vZGVsSWQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignY2hhdE1vZGVsSWQnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX21vZGUgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGRlYnVnTmFtZTogJ2NoYXRNb2RlJywgZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHMgfSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbiA9IG9ic2VydmFibGVWYWx1ZU9wdHM8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPih7IG93bmVyOiB0aGlzLCBkZWJ1Z05hbWU6ICdjaGF0RGVzY3JpcHRpb24nLCBlcXVhbHNGbjogbWFya2Rvd25TdHJpbmdFcXVhbHMgfSwgc3VtbWFyeS5hY3Rpdml0eSA/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoc3VtbWFyeS5hY3Rpdml0eSkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2xhc3RUdXJuRW5kID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxEYXRlIHwgdW5kZWZpbmVkPih7IG93bmVyOiB0aGlzLCBkZWJ1Z05hbWU6ICdjaGF0TGFzdFR1cm5FbmQnLCBlcXVhbHNGbjogZGF0ZUVxdWFscyB9LCBtb2RpZmllZEF0KTtcblx0XHR0aGlzLl9pbnRlcmFjdGl2aXR5ID0gb2JzZXJ2YWJsZVZhbHVlPENoYXRJbnRlcmFjdGl2aXR5PignY2hhdEludGVyYWN0aXZpdHknLCB0b0NoYXRJbnRlcmFjdGl2aXR5KHN1bW1hcnkuaW50ZXJhY3Rpdml0eSkpO1xuXHRcdHRoaXMuX2lzTmV3ID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdjaGF0SXNOZXcnLCBpc05ldyk7XG5cdFx0dGhpcy5jaGF0ID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRjcmVhdGVkQXQ6IG1vZGlmaWVkQXQsXG5cdFx0XHR0aXRsZTogdGhpcy5fdGl0bGUsXG5cdFx0XHR1cGRhdGVkQXQ6IHRoaXMuX3VwZGF0ZWRBdCxcblx0XHRcdHN0YXR1czogZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5faXNOZXcucmVhZChyZWFkZXIpID8gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCA6IHRoaXMuX3N0YXR1cy5yZWFkKHJlYWRlcikpLFxuXHRcdFx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRcdGxhc3RUdXJuQ2hhbmdlcyxcblx0XHRcdGNoZWNrcG9pbnRzOiBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKSxcblx0XHRcdG1vZGVsSWQ6IHRoaXMuX21vZGVsSWQsXG5cdFx0XHRtb2RlOiB0aGlzLl9tb2RlLFxuXHRcdFx0aXNBcmNoaXZlZDogc2Vzc2lvbklzQXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdC8vIEFuIGFyY2hpdmVkIHNlc3Npb24gaXMgcmVhZC1vbmx5LCBhcyBpcyBvbmUgd2hvc2UgZW52aXJvbm1lbnQgaXMgZ29uZSBhbmQgd2hvc2Vcblx0XHRcdC8vIGhpc3RvcnkgaXMgYmVpbmcgcmVwbGF5ZWQ6IGZvcmNlIGV2ZXJ5IGNoYXQncyBpbnRlcmFjdGl2aXR5IHRvIFJlYWRPbmx5IHNvIHRoZSBjaGF0XG5cdFx0XHQvLyB2aWV3IGhpZGVzIHRoZSBjb21wb3NlciBhbmQgZ2F0ZXMgbXV0YXRpbmcgYWN0aW9ucy5cblx0XHRcdGludGVyYWN0aXZpdHk6IGRlcml2ZWQocmVhZGVyID0+IGVmZmVjdGl2ZUNoYXRJbnRlcmFjdGl2aXR5KFxuXHRcdFx0XHRzZXNzaW9uSXNBcmNoaXZlZC5yZWFkKHJlYWRlcikgfHwgc2Vzc2lvbklzUmVhZE9ubHkucmVhZChyZWFkZXIpLFxuXHRcdFx0XHR0aGlzLl9pbnRlcmFjdGl2aXR5LnJlYWQocmVhZGVyKSkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2Rlc2NyaXB0aW9uLFxuXHRcdFx0bGFzdFR1cm5FbmQ6IHRoaXMuX2xhc3RUdXJuRW5kLFxuXHRcdFx0b3JpZ2luOiBzdW1tYXJ5Lm9yaWdpbiA/IHtcblx0XHRcdFx0a2luZDogdG9TZXNzaW9uQ2hhdE9yaWdpbktpbmQoc3VtbWFyeS5vcmlnaW4ua2luZCksXG5cdFx0XHRcdHBhcmVudENoYXQsXG5cdFx0XHRcdC4uLigoc3VtbWFyeS5vcmlnaW4ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Gb3JrIHx8IHN1bW1hcnkub3JpZ2luLmtpbmQgPT09IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpID8geyB0dXJuSWQ6IHN1bW1hcnkub3JpZ2luLnR1cm5JZCB9IDoge30pLFxuXHRcdFx0XHQuLi4oc3VtbWFyeS5vcmlnaW4ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCAmJiBzdW1tYXJ5Lm9yaWdpbi5zZWxlY3Rpb24gPyB7IHNlbGVjdGlvbjogdG9TZXNzaW9uU2lkZUNoYXRTZWxlY3Rpb24oc3VtbWFyeS5vcmlnaW4uc2VsZWN0aW9uKSB9IDoge30pLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdC8vIFN1YmFnZW50ICh0b29sLW9yaWdpbikgd29ya2VyIGNoYXRzIGFyZSB0cmFuc2llbnQgY2hpbGRyZW4gYW5kIGNhbiBiZVxuXHRcdFx0Ly8gbmVpdGhlciByZW5hbWVkIG5vciBkZWxldGVkOyBvdGhlciBwZWVyIGNoYXRzIGFyZSBmdWxseSBtYW5hZ2VhYmxlLlxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGU8SUNoYXRDYXBhYmlsaXRpZXM+KFxuXHRcdFx0XHRzdW1tYXJ5Lm9yaWdpbj8ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Ub29sXG5cdFx0XHRcdFx0PyB7IGNhblJlbmFtZTogZmFsc2UsIGNhbkRlbGV0ZTogZmFsc2UgfVxuXHRcdFx0XHRcdDogREVGQVVMVF9DSEFUX0NBUEFCSUxJVElFUyksXG5cdFx0fTtcblx0fVxuXG5cdHVwZGF0ZShzdW1tYXJ5OiBDaGF0U3VtbWFyeSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGlmaWVkQXQgPSBzdW1tYXJ5Lm1vZGlmaWVkQXQgPyBuZXcgRGF0ZShzdW1tYXJ5Lm1vZGlmaWVkQXQpIDogdGhpcy5fdXBkYXRlZEF0LmdldCgpO1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3RpdGxlLnNldChzdW1tYXJ5LnRpdGxlIHx8IGxvY2FsaXplKCduZXdDaGF0VGFiJywgXCJOZXcgQ2hhdFwiKSwgdHgpO1xuXHRcdFx0dGhpcy5fc3RhdHVzLnNldChtYXBQcm90b2NvbFN0YXR1cyhzdW1tYXJ5LnN0YXR1cyksIHR4KTtcblx0XHRcdHRoaXMuX3VwZGF0ZWRBdC5zZXQobW9kaWZpZWRBdCwgdHgpO1xuXHRcdFx0dGhpcy5fZGVzY3JpcHRpb24uc2V0KHN1bW1hcnkuYWN0aXZpdHkgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHN1bW1hcnkuYWN0aXZpdHkpIDogdW5kZWZpbmVkLCB0eCk7XG5cdFx0XHR0aGlzLl9sYXN0VHVybkVuZC5zZXQobW9kaWZpZWRBdCwgdHgpO1xuXHRcdFx0dGhpcy5faW50ZXJhY3Rpdml0eS5zZXQodG9DaGF0SW50ZXJhY3Rpdml0eShzdW1tYXJ5LmludGVyYWN0aXZpdHkpLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKiogT3B0aW1pc3RpY2FsbHkgdXBkYXRlIHRoZSBjaGF0IHRpdGxlIGFoZWFkIG9mIHRoZSBob3N0J3MgYGNoYXRVcGRhdGVkYC4gKi9cblx0c2V0VGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3RpdGxlLnNldCh0aXRsZSB8fCBsb2NhbGl6ZSgnbmV3Q2hhdFRhYicsIFwiTmV3IENoYXRcIiksIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogUHJlc2VudCBhcyBgVW50aXRsZWRgIHVudGlsIHRoZSBmaXJzdCByZXF1ZXN0IGlzIHNlbnQgc28gdGhlIHZpZXcgc2hvd3MgdGhlIGNvbXBvc2VyLiAqL1xuXHRtYXJrTmV3KCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTmV3LnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqIENsZWFyIHRoZSBgbmV3YCBwcmVzZW50YXRpb24gYWZ0ZXIgdGhlIGZpcnN0IHJlcXVlc3QgaXMgc2VudC4gKi9cblx0bWFya1NlbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNOZXcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0TW9kZWxJZChtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbElkLnNldChtb2RlbElkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0QWdlbnQoYWdlbnQ6IElTZXNzaW9uQWdlbnRSZWYgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlLnNldChhZ2VudCA/IHsgaWQ6IGFnZW50LnVyaSwga2luZDogQUdFTlRfTU9ERV9LSU5EIH0gOiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBZGFwdHMgYW4ge0BsaW5rIElBZ2VudFNlc3Npb25NZXRhZGF0YX0gaW50byBhbiB7QGxpbmsgSVNlc3Npb259IGZvciB0aGVcbiAqIHNlc3Npb25zIFVJLiBBIHNpbmdsZSBjb25jcmV0ZSBjbGFzcyBmb3IgYm90aCBsb2NhbCBhbmQgcmVtb3RlIGFnZW50XG4gKiBob3N0cyBcdTIwMTQgdmFyaWF0aW9uIGZsb3dzIHRocm91Z2gge0BsaW5rIElBZ2VudEhvc3RBZGFwdGVyT3B0aW9uc30uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nlc3Npb25DaGF0T3JpZ2luS2luZChraW5kOiBzdHJpbmcpOiBDaGF0T3JpZ2luS2luZCB7XG5cdHN3aXRjaCAoa2luZCkge1xuXHRcdGNhc2UgQ2hhdE9yaWdpbktpbmQuVG9vbDpcblx0XHRcdHJldHVybiBDaGF0T3JpZ2luS2luZC5Ub29sO1xuXHRcdGNhc2UgQ2hhdE9yaWdpbktpbmQuRm9yazpcblx0XHRcdHJldHVybiBDaGF0T3JpZ2luS2luZC5Gb3JrO1xuXHRcdGNhc2UgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQ6XG5cdFx0XHRyZXR1cm4gQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQ7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBDaGF0T3JpZ2luS2luZC5Vc2VyO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvU2Vzc2lvblNpZGVDaGF0U2VsZWN0aW9uKHNlbGVjdGlvbjogeyB0ZXh0OiBzdHJpbmc7IHJlc3BvbnNlUGFydElkPzogc3RyaW5nIH0pOiBJU2lkZUNoYXRTZWxlY3Rpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHRleHQ6IHNlbGVjdGlvbi50ZXh0LFxuXHRcdC4uLihzZWxlY3Rpb24ucmVzcG9uc2VQYXJ0SWQgPyB7IHJlc3BvbnNlUGFydElkOiBzZWxlY3Rpb24ucmVzcG9uc2VQYXJ0SWQgfSA6IHt9KSxcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFNlc3Npb25BZGFwdGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTZXNzaW9uIHtcblxuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGNyZWF0ZWRBdDogRGF0ZTtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJU2V0dGFibGVPYnNlcnZhYmxlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgaXNRdWlja0NoYXQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBpc0F1dG9tYXRpb24gPSBvYnNlcnZhYmxlVmFsdWUoJ2lzQXV0b21hdGlvbicsIGZhbHNlKTtcblx0LyoqIFNlZSB7QGxpbmsgSVNlc3Npb24ud29ya3RyZWVQZW5kaW5nfS4gKi9cblx0cmVhZG9ubHkgd29ya3RyZWVQZW5kaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgdGl0bGU6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nPjtcblx0cmVhZG9ubHkgdXBkYXRlZEF0OiBJU2V0dGFibGVPYnNlcnZhYmxlPERhdGU+O1xuXHRyZWFkb25seSBzdGF0dXM6IElTZXR0YWJsZU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz47XG5cdHJlYWRvbmx5IGNvbXBsZXRlZFN0YXRlSWNvbjogSU9ic2VydmFibGU8VGhlbWVJY29uIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgY2hhbmdlczogSU9ic2VydmFibGU8cmVhZG9ubHkgKElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UgfCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMilbXT47XG5cdHJlYWRvbmx5IGNoYW5nZXNldHM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGV4dGVybmFsQ2hhbmdlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlW10+O1xuXHRyZWFkb25seSBtb2RlbElkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdG1vZGVsU2VsZWN0aW9uOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbW9kZTogSVNldHRhYmxlT2JzZXJ2YWJsZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgbG9hZGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2lzQXJjaGl2ZWQnLCBmYWxzZSk7XG5cdC8vIFJlYWQvdW5yZWFkIHN0YXRlIGlzIG93bmVkIGJ5IHRoZSBwcm92aWRlciBhbmQgYmFja2VkIGJ5IHRoZSBhZ2VudCBob3N0XG5cdC8vIHByb3RvY29sJ3MgYElzUmVhZGAgc3RhdHVzIGJpdCAocGVyc2lzdGVkIGFzIHNlc3Npb24gbWV0YWRhdGEpLiBJdCBpc1xuXHQvLyBzZWVkZWQgZnJvbSB0aGUgc2Vzc2lvbiBtZXRhZGF0YSwga2VwdCBpbiBzeW5jIHdpdGggcHJvdG9jb2wgdXBkYXRlcywgYW5kXG5cdC8vIG11dGF0ZWQgdmlhIHtAbGluayBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5zZXRTZXNzaW9uUmVhZFN0YXRlfS5cblx0cmVhZG9ubHkgaXNSZWFkID0gb2JzZXJ2YWJsZVZhbHVlKCdpc1JlYWQnLCB0cnVlKTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGxhc3RUdXJuRW5kOiBJU2V0dGFibGVPYnNlcnZhYmxlPERhdGUgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBnaXRIdWJJbmZvOiBJT2JzZXJ2YWJsZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD47XG5cblx0cmVhZG9ubHkgbWFpbkNoYXQ6IElPYnNlcnZhYmxlPElDaGF0Pjtcblx0cmVhZG9ubHkgY2hhdHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXHQvKipcblx0ICogQ2FwYWJpbGl0aWVzIGRlcml2ZWQgcmVhY3RpdmVseSBmcm9tIHRoZSBjb25uZWN0aW9uJ3Mgcm9vdCBzdGF0ZSByYXRoZXJcblx0ICogdGhhbiBzbmFwc2hvdHRlZCBhdCBjb25zdHJ1Y3Rpb24gdGltZS4gVGhlIHJvb3Qgc3RhdGUgY2FuIHN0aWxsIGJlIGxvYWRpbmdcblx0ICogd2hlbiBhbiBhZGFwdGVyIGlzIGJ1aWx0ICh0aGUgYWdlbnQtaG9zdCBwcm9jZXNzIG1heSBiZSBzdGFydGluZyksIGluIHdoaWNoXG5cdCAqIGNhc2UgdGhlIGFnZW50J3MgYWR2ZXJ0aXNlZCBjYXBhYmlsaXRpZXMgYXJlIG5vdCB5ZXQgYXZhaWxhYmxlOyB0aGUgZGVyaXZlZFxuXHQgKiByZS1lbWl0cyAoYW5kIGRyaXZlcyB0aGUgY2hhdCBjYXRhbG9nIC8gY29udGV4dCBrZXlzKSBhcyBzb29uIGFzIHRoZSByb290XG5cdCAqIHN0YXRlIGFycml2ZXMgaW5zdGVhZCBvZiBiZWluZyBwZXJtYW5lbnRseSBmcm96ZW4gdG8gdGhlIGBmYWxzZWAgZGVmYXVsdHMuXG5cdCAqIGBzdXBwb3J0c1JlbmFtZWAvYHN1cHBvcnRzRGVsZXRlYCBhcmUgYWx3YXlzIHN1cHBvcnRlZCBmb3IgYWdlbnQtaG9zdFxuXHQgKiBzZXNzaW9ucy5cblx0ICovXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllczogSU9ic2VydmFibGU8SVNlc3Npb25DYXBhYmlsaXRpZXM+O1xuXG5cdC8qKlxuXHQgKiBUaGUgZGVmYXVsdCBjaGF0IChyZXNvdXJjZSA9PSB0aGlzIHNlc3Npb24ncyByZXNvdXJjZSkuIEFsd2F5cyBwcmVzZW50O1xuXHQgKiBmb3Igc2luZ2xlLWNoYXQgc2Vzc2lvbnMgaXQgaXMgdGhlIG9ubHkgY2hhdCBhbmQgYGNoYXRzID09PSBbaXRdYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRDaGF0OiBJQ2hhdDtcblx0LyoqXG5cdCAqIFRoZSBzZXNzaW9uJ3MgbGl2ZSBvdXRwdXQgb2JzZXJ2YWJsZXMgKGV4dGVybmFsIGZpbGVzICsgcGVyLWNoYXQgbGFzdC10dXJuXG5cdCAqIGNoYW5nZXMpLCBwYXJzZWQgb25jZSBmcm9tIHRoZSBhY3RpdmUtc2Vzc2lvbiBzdWJzY3JpcHRpb25zIGFuZCBzaGFyZWQgYnlcblx0ICogdGhlIGRlZmF1bHQgY2hhdCBhbmQgZXZlcnkgcGVlciBjaGF0IHNvIGVhY2ggY2hhdCdzIHN0YXR1cyBwaWxscyByZWZsZWN0XG5cdCAqIHRoYXQgY2hhdCdzIG93biBsYXN0IHR1cm4uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uT3V0cHV0OiBJU2Vzc2lvbk91dHB1dE9icztcblx0LyoqXG5cdCAqIEluZGVwZW5kZW50IHRpdGxlIG92ZXJyaWRlIGZvciB0aGUgZGVmYXVsdCBjaGF0IHRhYi4gYHVuZGVmaW5lZGAgbWVhbnMgdGhlXG5cdCAqIGRlZmF1bHQgY2hhdCBpbmhlcml0cyB0aGUgc2Vzc2lvbiB0aXRsZTsgYSBub24tZW1wdHkgdmFsdWUgbWVhbnMgdGhlIHVzZXJcblx0ICogKG9yIGhvc3QpIHJlbmFtZWQgdGhlIGRlZmF1bHQgY2hhdCBpbmRlcGVuZGVudGx5IG9mIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdENoYXRUaXRsZU92ZXJyaWRlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ2RlZmF1bHRDaGF0VGl0bGVPdmVycmlkZScsIHVuZGVmaW5lZCk7XG5cdC8qKlxuXHQgKiBJbmRlcGVuZGVudCBzdGF0dXMgb3ZlcnJpZGUgZm9yIHRoZSBkZWZhdWx0IGNoYXQgdGFiLiBgdW5kZWZpbmVkYCBtZWFucyB0aGVcblx0ICogZGVmYXVsdCBjaGF0IHJlZmxlY3RzIHRoZSBhZ2dyZWdhdGVkIHNlc3Npb24gc3RhdHVzICh0aGUgc2luZ2xlLWNoYXQgY2FzZSxcblx0ICogd2hlcmUgdGhleSBhcmUgZXF1aXZhbGVudCk7IGEgZGVmaW5lZCB2YWx1ZSBtZWFucyBhIG11bHRpLWNoYXQgc2Vzc2lvbiwgc29cblx0ICogdGhlIGRlZmF1bHQgY2hhdCBzaG93cyBpdHMgb3duIHN0YXR1cyByYXRoZXIgdGhhbiB0aGUgc2Vzc2lvbiBhZ2dyZWdhdGVcblx0ICogKHdoaWNoIG1heSBoYXZlIGJlZW4gcHJvbW90ZWQgYnkgYSBydW5uaW5nIHBlZXIgY2hhdCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0Q2hhdFN0YXR1c092ZXJyaWRlID0gb2JzZXJ2YWJsZVZhbHVlPFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQ+KCdkZWZhdWx0Q2hhdFN0YXR1c092ZXJyaWRlJywgdW5kZWZpbmVkKTtcblx0LyoqIFdoZXRoZXIgdGhpcyBzZXNzaW9uIHdhcyBjcmVhdGVkIHdpdGggd29ya3RyZWUgaXNvbGF0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrdHJlZUlzb2xhdGlvbiA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignd29ya3RyZWVJc29sYXRpb24nLCBmYWxzZSk7XG5cdC8qKiBJbnRlcmFjdGl2aXR5IG9mIHRoZSBkZWZhdWx0IGNoYXQuIERyaXZlbiBmcm9tIHRoZSBkZWZhdWx0IGNoYXQncyBwcm90b2NvbCBzdW1tYXJ5LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0Q2hhdEludGVyYWN0aXZpdHkgPSBvYnNlcnZhYmxlVmFsdWU8Q2hhdEludGVyYWN0aXZpdHk+KCdkZWZhdWx0Q2hhdEludGVyYWN0aXZpdHknLCBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpbkNoYXRPYnM6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0c09iczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPjtcblx0LyoqIEFkZGl0aW9uYWwgKG5vbi1kZWZhdWx0KSBwZWVyIGNoYXRzIGtleWVkIGJ5IGNoYXRJZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWRkaXRpb25hbENoYXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBBZGRpdGlvbmFsQ2hhdD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25PdXRwdXRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpO1xuXHQvKiogQ2hhdCBpZHMgdGhhdCBoYXZlIG5vdCB5ZXQgc2VudCB0aGVpciBmaXJzdCByZXF1ZXN0IChwcmVzZW50ZWQgYXMgYFVudGl0bGVkYCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX25ld0NoYXRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0LyoqXG5cdCAqIFRoZSBsYXN0IHtAbGluayBTZXNzaW9uU3RhdGV9IGFwcGxpZWQgdG8gdGhlIGNoYXQgY2F0YWxvZywgcmV0YWluZWQgc28gdGhlXG5cdCAqIGNhdGFsb2cgY2FuIGJlIHJlLXJlY29uY2lsZWQgd2hlbiB7QGxpbmsgY2FwYWJpbGl0aWVzfSBjaGFuZ2UgYWZ0ZXIgdGhlXG5cdCAqIGZhY3QgKHNlZSB0aGUgY2FwYWJpbGl0eSBhdXRvcnVuIGluIHRoZSBjb25zdHJ1Y3RvcikuXG5cdCAqL1xuXHRwcml2YXRlIF9sYXN0Q2F0YWxvZ1N0YXRlOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jhd0lkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlU2NoZW1lOiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgYWdlbnRQcm92aWRlcjogc3RyaW5nO1xuXHQvKipcblx0ICogVGhpcyBzZXNzaW9uJ3MgVVJJIGFzIHRoZSBob3N0J3MgcmVnaXN0cnkgaXMga2V5ZWQgYnkgaXQsIHdoaWNoIG1heSB1c2UgYSBkaWZmZXJlbnQgc2NoZW1lXG5cdCAqIHRoYW4ge0BsaW5rIGFnZW50UHJvdmlkZXJ9IChjbG91ZCBzYW5kYm94OiBwcm92aWRlciBgY29waWxvdGAsIGJhY2tlbmQgYGFocC1zZXNzaW9uOi88aWQ+YCkuXG5cdCAqIEV2ZXJ5IGJhY2tlbmQgY2FsbCBtdXN0IGFkZHJlc3MgdGhlIHNlc3Npb24gYnkgdGhpcyBVUkkuXG5cdCAqL1xuXHRyZWFkb25seSBiYWNrZW5kVXJpOiBVUkk7XG5cblx0Ly8gUmV0YWluZWQgc28gd2UgY2FuIHJlYnVpbGQgYHdvcmtzcGFjZWAgd2hlbiBvbmx5IGBfbWV0YWAgY2hhbmdlcyB2aWFcblx0Ly8gYSBgU2Vzc2lvbk1ldGFDaGFuZ2VkYCBhY3Rpb24gZGlzcGF0Y2hlZCBvbiBzZXNzaW9uIG9wZW4gKHdpdGhvdXQgYSBmdWxsXG5cdC8vIGxpc3QgcmVmcmVzaCkuIFNlZSBgX2FwcGx5U2Vzc2lvbk1ldGFGcm9tU3RhdGVgIC8gYHNldE1ldGFgLlxuXHRwcml2YXRlIF9wcm9qZWN0OiBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbJ3Byb2plY3QnXTtcblx0cHJpdmF0ZSBfd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZDtcblx0LyoqIFdvcmtpbmctZGlyZWN0b3J5IHNldCB1c2VkIHRvIHJlc29sdmUgc2Vzc2lvbiBjdXN0b21pemF0aW9ucy4gKi9cblx0Z2V0IHdvcmtpbmdEaXJlY3RvcmllcygpOiByZWFkb25seSBVUklbXSB7IHJldHVybiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMgPz8gW107IH1cblx0Ly8gVGhlIGRpcmVjdG9yeSB0aGF0IHRoZSBjdXJyZW50IGBtb2RlYCBjdXN0b20tYWdlbnQgVVJJIGlzIHJvb3RlZCBhdC4gVXNlZCB0b1xuXHQvLyBjb21wdXRlIHRoZSBhZ2VudCdzIHJlcG8tcmVsYXRpdmUgcGF0aCBzbyB0aGUgc2VsZWN0aW9uIGNhbiBiZSByZWJhc2VkIG9udG9cblx0Ly8gaXRzIHdvcmt0cmVlIHR3aW4gd2hlbiB0aGUgc2Vzc2lvbiByZWxvY2F0ZXMgaW50byBhbiBpc29sYXRlZCB3b3JrdHJlZSAoc2VlXG5cdC8vIGByZWNvbmNpbGVTZWxlY3RlZEFnZW50YCkuXG5cdHByaXZhdGUgX2FnZW50QmFzZURpcjogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBzZXNzaW9uIGlzIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdC4gU2VlZGVkIGZyb20gdGhlXG5cdCAqIGNvbnN0cnVjdG9yIG1ldGFkYXRhIGFuZCBvbmx5IGV2ZXIgcHJvbW90ZWQgYnlcblx0ICoge0BsaW5rIF9wcm9tb3RlVG9RdWlja0NoYXRJZldvcmtzcGFjZWxlc3N9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaXNRdWlja0NoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKiBTZXNzaW9uLWtpbmQgc3RyYXRlZ3kgKHF1aWNrIGNoYXQgdnMuIHdvcmtzcGFjZSksIGRlcml2ZWQgZnJvbSB7QGxpbmsgX2lzUXVpY2tDaGF0fS4gKi9cblx0cHJpdmF0ZSBnZXQgX2tpbmQoKTogSUFnZW50SG9zdFNlc3Npb25LaW5kIHsgcmV0dXJuIHNlc3Npb25LaW5kKHRoaXMuX2lzUXVpY2tDaGF0LmdldCgpKTsgfVxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBtaXJyb3Igb2Yge0BsaW5rIF9tZXRhfSwga2VwdCBpbiBzeW5jIHdpdGggZXZlcnkgd3JpdGUgdG9cblx0ICogYF9tZXRhYCBzbyByZWFjdGl2ZSBkZXJpdmF0aW9ucyAobm90YWJseSB7QGxpbmsgZ2l0SHViSW5mb30pIHJlLWZpcmVcblx0ICogd2hlbiBnaXQgLyBHaXRIdWIgc3RhdGUgYXJyaXZlcyAob3IgY2hhbmdlcykuIFRoZSBob3N0IHRyZWF0cyB0aGVcblx0ICogc2Vzc2lvbi1zdGF0ZSBhbmQgc2Vzc2lvbi1zdW1tYXJ5IGBfbWV0YWAgYXMgdGhlIHNhbWUgYmFnLCBzbyBib3RoIGdpdFxuXHQgKiBzdGF0ZSBhbmQgR2l0SHViIHN0YXRlIGxpdmUgaGVyZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFPYnM6IElTZXR0YWJsZU9ic2VydmFibGU8U2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgX2FjdGl2aXR5OiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlc1N1bW1hcnkgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElTZXNzaW9uQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQ+KHsgZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHMgfSwgdW5kZWZpbmVkKTtcblx0Z2V0IGNoYW5nZXNTdW1tYXJ5KCk6IElPYnNlcnZhYmxlPElTZXNzaW9uQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX2NoYW5nZXNTdW1tYXJ5OyB9XG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBhZ2dyZWdhdGUgY2hhbmdlIGNoaXAuIENhbGxlcnMgaW5zaWRlIGEgdHJhbnNhY3Rpb24gTVVTVCBwYXNzIGl0XG5cdCAqIFx1MjAxNCBhIGBzZXRgIHdpdGhvdXQgb25lIGJ1aWxkcyBhbmQgZmluaXNoZXMgaXRzIG93biB0cmFuc2FjdGlvbiwgbm90aWZ5aW5nXG5cdCAqIG9ic2VydmVycyBiZWZvcmUgdGhlIGVuY2xvc2luZyB1cGRhdGUgaGFzIGFwcGxpZWQgaXRzIHJlbWFpbmluZyBmaWVsZHMuXG5cdCAqL1xuXHRzZXRDaGFuZ2VzU3VtbWFyeShjaGFuZ2VzOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCwgdHg/OiBJVHJhbnNhY3Rpb24pOiBib29sZWFuIHtcblx0XHRpZiAoIWNoYW5nZXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFkZGl0aW9ucywgZGVsZXRpb25zLCBmaWxlcyB9ID0gY2hhbmdlcztcblx0XHRjb25zdCBjdXJyZW50Q2hhbmdlc1N1bW1hcnkgPSB0aGlzLl9jaGFuZ2VzU3VtbWFyeS5nZXQoKTtcblxuXHRcdGlmIChcblx0XHRcdChjdXJyZW50Q2hhbmdlc1N1bW1hcnk/LmZpbGVzID8/IDApID09PSAoZmlsZXMgPz8gMCkgJiZcblx0XHRcdChjdXJyZW50Q2hhbmdlc1N1bW1hcnk/LmFkZGl0aW9ucyA/PyAwKSA9PT0gKGFkZGl0aW9ucyA/PyAwKSAmJlxuXHRcdFx0KGN1cnJlbnRDaGFuZ2VzU3VtbWFyeT8uZGVsZXRpb25zID8/IDApID09PSAoZGVsZXRpb25zID8/IDApXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhbmdlc1N1bW1hcnkuc2V0KHtcblx0XHRcdGFkZGl0aW9uczogYWRkaXRpb25zID8/IDAsXG5cdFx0XHRkZWxldGlvbnM6IGRlbGV0aW9ucyA/PyAwLFxuXHRcdFx0ZmlsZXM6IGZpbGVzID8/IDBcblx0XHR9LCB0eCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJlYWRvbmx5IGlzQWN0aXZlU2Vzc2lvbk9iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWV0YWRhdGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSxcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cmVzb3VyY2VTY2hlbWU6IHN0cmluZyxcblx0XHRsb2dpY2FsU2Vzc2lvblR5cGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMsXG5cdFx0QElHaXRIdWJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVB1bGxSZXF1ZXN0SWNvbkNhY2hlIHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0SWNvbkNhY2hlOiBJUHVsbFJlcXVlc3RJY29uQ2FjaGUsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQobWV0YWRhdGEuc2Vzc2lvbik7XG5cdFx0Y29uc3QgYWdlbnRQcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihtZXRhZGF0YS5zZXNzaW9uKTtcblx0XHRpZiAoIWFnZW50UHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgc2Vzc2lvbiBVUkkgaGFzIG5vIHByb3ZpZGVyIHNjaGVtZTogJHttZXRhZGF0YS5zZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHRoaXMuYWdlbnRQcm92aWRlciA9IGFnZW50UHJvdmlkZXI7XG5cdFx0dGhpcy5iYWNrZW5kVXJpID0gQWdlbnRTZXNzaW9uLnVyaShfb3B0aW9ucy5iYWNrZW5kU2Vzc2lvblNjaGVtZSA/PyBhZ2VudFByb3ZpZGVyLCByYXdJZCk7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZXNvdXJjZVNjaGVtZSwgcGF0aDogYC8ke3Jhd0lkfWAgfSk7XG5cdFx0dGhpcy5fcmF3SWQgPSByYXdJZDtcblx0XHR0aGlzLl9yZXNvdXJjZVNjaGVtZSA9IHJlc291cmNlU2NoZW1lO1xuXHRcdHRoaXMuc2Vzc2lvbklkID0gdG9TZXNzaW9uSWQocHJvdmlkZXJJZCwgdGhpcy5yZXNvdXJjZSk7XG5cdFx0dGhpcy5wcm92aWRlcklkID0gcHJvdmlkZXJJZDtcblx0XHR0aGlzLnNlc3Npb25UeXBlID0gbG9naWNhbFNlc3Npb25UeXBlO1xuXHRcdHRoaXMuX2lzUXVpY2tDaGF0ID0gb2JzZXJ2YWJsZVZhbHVlKCdpc1F1aWNrQ2hhdCcsIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyhtZXRhZGF0YS5fbWV0YSkpO1xuXHRcdHRoaXMuaWNvbiA9IF9vcHRpb25zLmljb247XG5cdFx0dGhpcy5jcmVhdGVkQXQgPSBuZXcgRGF0ZShtZXRhZGF0YS5zdGFydFRpbWUpO1xuXHRcdHRoaXMudGl0bGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3RpdGxlJywgbWV0YWRhdGEuc3VtbWFyeSB8fCBgU2Vzc2lvbiAke3Jhd0lkLnN1YnN0cmluZygwLCA4KX1gKTtcblx0XHR0aGlzLnVwZGF0ZWRBdCA9IG9ic2VydmFibGVWYWx1ZSgndXBkYXRlZEF0JywgbmV3IERhdGUobWV0YWRhdGEubW9kaWZpZWRUaW1lKSk7XG5cdFx0dGhpcy5tb2RlbFNlbGVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPignc3RhdHVzJywgbWV0YWRhdGEuc3RhdHVzICE9PSB1bmRlZmluZWQgPyBtYXBQcm90b2NvbFN0YXR1cyhtZXRhZGF0YS5zdGF0dXMpIDogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdHRoaXMubW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdtb2RlbElkJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLm1vZGUgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGRlYnVnTmFtZTogJ21vZGUnLCBlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFscyB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMubGFzdFR1cm5FbmQgPSBvYnNlcnZhYmxlVmFsdWUoJ2xhc3RUdXJuRW5kJywgbWV0YWRhdGEubW9kaWZpZWRUaW1lID8gbmV3IERhdGUobWV0YWRhdGEubW9kaWZpZWRUaW1lKSA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWN0aXZpdHkgPSBvYnNlcnZhYmxlVmFsdWUoJ2FjdGl2aXR5JywgbWV0YWRhdGEuYWN0aXZpdHkpO1xuXHRcdHRoaXMuX3Byb2plY3QgPSBtZXRhZGF0YS5wcm9qZWN0O1xuXHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcmllcyA9IG1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcmllcztcblxuXHRcdHRoaXMuX21ldGEgPSBtZXRhZGF0YS5fbWV0YTtcblx0XHR0aGlzLl9tZXRhT2JzID0gb2JzZXJ2YWJsZVZhbHVlPFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkPignYWdlbnRIb3N0U2Vzc2lvbk1ldGEnLCB0aGlzLl9tZXRhKTtcblxuXHRcdGNvbnN0IGJhc2VHaXRIdWJJbmZvT2JzID0gZGVyaXZlZE9wdHM8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+KHtcblx0XHRcdGVxdWFsc0ZuOiBpc0dpdEh1YkluZm9FcXVhbFxuXHRcdH0sIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdG9HaXRIdWJJbmZvKHRoaXMuX21ldGFPYnMucmVhZChyZWFkZXIpKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGdpdEh1YkluZm9XaXRoSWNvbiA9IGRlcml2ZWQ8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlR2l0SHViSW5mbyA9IGJhc2VHaXRIdWJJbmZvT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghYmFzZUdpdEh1YkluZm8/LnB1bGxSZXF1ZXN0KSB7XG5cdFx0XHRcdHJldHVybiBiYXNlR2l0SHViSW5mbztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaWNvbiA9IGNvbXB1dGVTZXNzaW9uUHVsbFJlcXVlc3RJY29uKHJlYWRlciwgdGhpcy5fZ2l0SHViU2VydmljZSwgdGhpcy5fcHVsbFJlcXVlc3RJY29uQ2FjaGUsIGJhc2VHaXRIdWJJbmZvKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmJhc2VHaXRIdWJJbmZvLFxuXHRcdFx0XHRwdWxsUmVxdWVzdHM6IGJhc2VHaXRIdWJJbmZvLnB1bGxSZXF1ZXN0cz8ubWFwKChwdWxsUmVxdWVzdCwgaW5kZXgpID0+IGluZGV4ID09PSAwID8ge1xuXHRcdFx0XHRcdC4uLnB1bGxSZXF1ZXN0LFxuXHRcdFx0XHRcdGljb25cblx0XHRcdFx0fSA6IHB1bGxSZXF1ZXN0KSxcblx0XHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0XHQuLi5iYXNlR2l0SHViSW5mby5wdWxsUmVxdWVzdCxcblx0XHRcdFx0XHRpY29uXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5naXRIdWJJbmZvID0gZGVyaXZlZE9wdHM8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBpc0dpdEh1YkluZm9FcXVhbCB9LCByZWFkZXIgPT4gZ2l0SHViSW5mb1dpdGhJY29uLnJlYWQocmVhZGVyKSk7XG5cdFx0dGhpcy5jb21wbGV0ZWRTdGF0ZUljb24gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2VDb250cm9sU3RhdGUgPSByZWFkU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSh0aGlzLl9tZXRhT2JzLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRpZiAoc291cmNlQ29udHJvbFN0YXRlPy5sYXRlc3RPdXRjb21lID09PSBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWUuTWVyZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uQ29kaWNvbi5naXRNZXJnZSwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ2NoYXJ0cy5wdXJwbGUnKSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuZ2l0SHViSW5mby5yZWFkKHJlYWRlcik/LnB1bGxSZXF1ZXN0Py5pY29uO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaW5pdGlhbFdvcmtzcGFjZSA9IHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2UoKTtcblx0XHR0aGlzLndvcmtzcGFjZSA9IG9ic2VydmFibGVWYWx1ZSgnd29ya3NwYWNlJywgaW5pdGlhbFdvcmtzcGFjZSk7XG5cdFx0dGhpcy5pc1F1aWNrQ2hhdCA9IHRoaXMuX2lzUXVpY2tDaGF0O1xuXHRcdC8vIFVudGlsIHRoZSBob3N0IHJlcG9ydHMgdGhlIHdvcmt0cmVlLCB0aGUgd29ya3NwYWNlIGlzIHN0aWxsIHRoZSBjaGVja291dCBpdCB3YXMgc3RhcnRlZCBmcm9tLlxuXHRcdHRoaXMud29ya3RyZWVQZW5kaW5nID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT5cblx0XHRcdHRoaXMuX3dvcmt0cmVlSXNvbGF0aW9uLnJlYWQocmVhZGVyKVxuXHRcdFx0JiYgIXRoaXMud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVycy5zb21lKGZvbGRlciA9PiAhIWZvbGRlci5naXRSZXBvc2l0b3J5Py53b3JrVHJlZVVyaSkpO1xuXHRcdHRoaXMubG9hZGluZyA9IF9vcHRpb25zLmxvYWRpbmc7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IGRlcml2ZWRPcHRzPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IG1hcmtkb3duU3RyaW5nRXF1YWxzIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgfHwgc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0Y29uc3QgYWN0aXZpdHkgPSB0aGlzLl9hY3Rpdml0eS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChhY3Rpdml0eSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGFjdGl2aXR5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGlzU2Vzc2lvblN0YXR1c0FyY2hpdmVkKG1ldGFkYXRhLnN0YXR1cykpIHtcblx0XHRcdHRoaXMuaXNBcmNoaXZlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAobWV0YWRhdGEuc3RhdHVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaXNSZWFkLnNldChpc1Nlc3Npb25TdGF0dXNSZWFkKG1ldGFkYXRhLnN0YXR1cyksIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pc0FjdGl2ZVNlc3Npb25PYnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGlzRXF1YWwoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIHRoaXMucmVzb3VyY2UpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2V0IHRoZSBjaGFuZ2VzIHN1bW1hcnkgZnJvbSB0aGUgYWdncmVnYXRlLiBXaGlsZSB0aGUgc2Vzc2lvbiBpcyBhY3RpdmUsXG5cdFx0Ly8gdGhlIGNoYW5nZXMgc3VtbWFyeSB3aWxsIGJlIHVwZGF0ZWQgdGhyb3VnaCB0aGUgc2Vzc2lvbiBjaGFuZ2VzZXQgY2hhbmdlcy5cblx0XHQvLyBBcyBzb29uIGFzIHRoZSBzZXNzaW9uIGlzIG5vIGxvbmdlciBhY3RpdmUsIHRoZSBjaGFuZ2VzIHN1bW1hcnkgd2lsbCBiZVxuXHRcdC8vIHVwZGF0ZWQgZnJvbSBgbWV0YWRhdGEuY2hhbmdlc2AgKG1pcnJvcmluZyBgU2Vzc2lvblN1bW1hcnkuY2hhbmdlc2ApLlxuXHRcdHRoaXMuc2V0Q2hhbmdlc1N1bW1hcnkobWV0YWRhdGEuY2hhbmdlcyk7XG5cblx0XHQvLyBDaGFuZ2VzZXRzIHdpbGwgYmUgcmVzb2x2ZWQgYXN5bmNocm9ub3VzbHkgd2hlbiB0aGUgc2Vzc2lvbiBpcyBhY3RpdmUuIGB1bmRlZmluZWRgXG5cdFx0Ly8gbWFya3MgdGhlIHVuaW5pdGlhbGl6ZWQgc3RhdGUsIGRpc3RpbmN0IGZyb20gYSByZXNvbHZlZCBzZXNzaW9uIHRoYXQgc2ltcGx5IGhhcyBub1xuXHRcdC8vIGNoYW5nZXNldHMgKGFuIGVtcHR5IGFycmF5KS5cblx0XHR0aGlzLmNoYW5nZXNldHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRcdC8vIENyZWF0ZSBhbiBvYnNlcnZhYmxlIGZvciB0aGUgY2hhbmdlcyBvZiB0aGUgc2Vzc2lvbidzXG5cdFx0Ly8gZGVmYXVsdCBjaGFuZ2VzZXQgKGV4OiBCcmFuY2ggQ2hhbmdlcykuIFRoaXMgd2lsbCBhbHdheXNcblx0XHQvLyB0cmFjayB0aGUgZGVmYXVsdCBjaGFuZ2VzZXQgaW5kZXBlbmRlbnQgb2YgdGhlIHNlbGVjdGVkXG5cdFx0Ly8gY2hhbmdlc2V0LlxuXHRcdHRoaXMuY2hhbmdlcyA9IHRoaXMuX2NyZWF0ZUNoYW5nZXNPYnMoKTtcblxuXHRcdC8vIEZpbGVzIGNyZWF0ZWQvZWRpdGVkL2RlbGV0ZWQgb3V0c2lkZSB0aGUgd29ya3NwYWNlLCBwbHVzIHRoZSBsYXN0IHR1cm4nc1xuXHRcdC8vIGNoYW5nZXMsIHBhcnNlZCBmcm9tIHRoZSBjaGF0LXN0YXRlIHR1cm5zLiBDb21wdXRlZCBsYXppbHkgZnJvbSB0aGUgc2FtZVxuXHRcdC8vIGFjdGl2ZS1zZXNzaW9uIHN1YnNjcmlwdGlvbnMgdXNlZCBmb3IgY2hhbmdlcy5cblx0XHRjb25zdCBzZXNzaW9uT3V0cHV0ID0gY3JlYXRlU2Vzc2lvbk91dHB1dE9icyhcblx0XHRcdHRoaXMuYmFja2VuZFVyaSxcblx0XHRcdHRoaXMuX29wdGlvbnMsXG5cdFx0XHR0aGlzLmlzQWN0aXZlU2Vzc2lvbk9icyxcblx0XHRcdHRoaXMuaXNBcmNoaXZlZCxcblx0XHRcdHRoaXMud29ya3NwYWNlLFxuXHRcdFx0dGhpcy5fc2Vzc2lvbk91dHB1dENhY2hlLFxuXHRcdCk7XG5cdFx0dGhpcy5fc2Vzc2lvbk91dHB1dCA9IHNlc3Npb25PdXRwdXQ7XG5cdFx0dGhpcy5leHRlcm5hbENoYW5nZXMgPSBzZXNzaW9uT3V0cHV0LmV4dGVybmFsRmlsZXM7XG5cblx0XHRjb25zdCBtYWluQ2hhdDogSUNoYXQgPSB7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdGNyZWF0ZWRBdDogdGhpcy5jcmVhdGVkQXQsXG5cdFx0XHR0aXRsZTogZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fZGVmYXVsdENoYXRUaXRsZU92ZXJyaWRlLnJlYWQocmVhZGVyKSA/PyB0aGlzLnRpdGxlLnJlYWQocmVhZGVyKSksXG5cdFx0XHR1cGRhdGVkQXQ6IHRoaXMudXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9kZWZhdWx0Q2hhdFN0YXR1c092ZXJyaWRlLnJlYWQocmVhZGVyKSA/PyB0aGlzLnN0YXR1cy5yZWFkKHJlYWRlcikpLFxuXHRcdFx0Y2hhbmdlczogdGhpcy5jaGFuZ2VzLFxuXHRcdFx0bGFzdFR1cm5DaGFuZ2VzOiBzZXNzaW9uT3V0cHV0LmdldExhc3RUdXJuQ2hhbmdlcyhVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaSh0aGlzLmJhY2tlbmRVcmkpKSksXG5cdFx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCksXG5cdFx0XHRtb2RlbElkOiB0aGlzLm1vZGVsSWQsXG5cdFx0XHRtb2RlOiB0aGlzLm1vZGUsXG5cdFx0XHRpc0FyY2hpdmVkOiB0aGlzLmlzQXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQ6IHRoaXMuaXNSZWFkLFxuXHRcdFx0Ly8gQW4gYXJjaGl2ZWQgc2Vzc2lvbiBpcyByZWFkLW9ubHksIGFzIGlzIG9uZSB3aG9zZSBlbnZpcm9ubWVudCBpcyBnb25lIGFuZCB3aG9zZVxuXHRcdFx0Ly8gaGlzdG9yeSBpcyBiZWluZyByZXBsYXllZDogZm9yY2UgdGhlIGRlZmF1bHQgY2hhdCdzIGludGVyYWN0aXZpdHkgdG8gUmVhZE9ubHkgc28gdGhlXG5cdFx0XHQvLyBjaGF0IHZpZXcgaGlkZXMgdGhlIGNvbXBvc2VyIGFuZCBnYXRlcyBtdXRhdGluZyBhY3Rpb25zLlxuXHRcdFx0aW50ZXJhY3Rpdml0eTogZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gZWZmZWN0aXZlQ2hhdEludGVyYWN0aXZpdHkoXG5cdFx0XHRcdHRoaXMuaXNBcmNoaXZlZC5yZWFkKHJlYWRlcikgfHwgKHRoaXMuX29wdGlvbnMucmVhZE9ubHk/LnJlYWQocmVhZGVyKSA/PyBmYWxzZSksXG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRDaGF0SW50ZXJhY3Rpdml0eS5yZWFkKHJlYWRlcikpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0bGFzdFR1cm5FbmQ6IHRoaXMubGFzdFR1cm5FbmQsXG5cdFx0fTtcblx0XHR0aGlzLl9kZWZhdWx0Q2hhdCA9IG1haW5DaGF0O1xuXHRcdHRoaXMuX21haW5DaGF0T2JzID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBtYWluQ2hhdCk7XG5cdFx0dGhpcy5fY2hhdHNPYnMgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHJlYWRvbmx5IElDaGF0W10+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBhcnJheUVxdWFscyB9LCBbbWFpbkNoYXRdKTtcblx0XHR0aGlzLm1haW5DaGF0ID0gdGhpcy5fbWFpbkNoYXRPYnM7XG5cdFx0dGhpcy5jaGF0cyA9IHRoaXMuX2NoYXRzT2JzO1xuXG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMgPSBkZXJpdmVkT3B0czxJU2Vzc2lvbkNhcGFiaWxpdGllcz4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHMgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFnZW50Q2FwYWJpbGl0aWVzID0gdGhpcy5fb3B0aW9ucy5hZ2VudENhcGFiaWxpdGllcy5yZWFkKHJlYWRlcik/LmdldCh0aGlzLmFnZW50UHJvdmlkZXIpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiAhdGhpcy5pc1F1aWNrQ2hhdC5yZWFkKHJlYWRlcikgJiYgKGFnZW50Q2FwYWJpbGl0aWVzPy5tdWx0aXBsZUNoYXRzICE9PSB1bmRlZmluZWQpLFxuXHRcdFx0XHRzdXBwb3J0c0Zvcms6IGFnZW50Q2FwYWJpbGl0aWVzPy5tdWx0aXBsZUNoYXRzPy5mb3JrID8/IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0c1NpZGVDaGF0OiBhZ2VudENhcGFiaWxpdGllcz8ubXVsdGlwbGVDaGF0cz8uc2lkZUNoYXQgPz8gZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnRzUmVuYW1lOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0RlbGV0ZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHQvLyBSZS1hcHBseSB0aGUgY2hhdCBjYXRhbG9nIHdoZW4gYWR2ZXJ0aXNlZCBjYXBhYmlsaXRpZXMgY2hhbmdlIChlLmcuIHRoZVxuXHRcdC8vIGFnZW50IGhvc3QncyByb290IHN0YXRlIGFycml2ZXMgYWZ0ZXIgdGhlIHNlc3Npb24ncyBmaXJzdCBzdGF0ZSB1cGRhdGUpLlxuXHRcdC8vIFdpdGhvdXQgdGhpcywgYSBtdWx0aS1jaGF0IHNlc3Npb24gd2hvc2Ugc3RhdGUgd2FzIHByb2Nlc3NlZCB3aGlsZVxuXHRcdC8vIGBzdXBwb3J0c011bHRpcGxlQ2hhdHNgIHdhcyBzdGlsbCBgZmFsc2VgIHdvdWxkIHN0YXkgY29sbGFwc2VkIHRvXG5cdFx0Ly8gYFtkZWZhdWx0Q2hhdF1gIHVudGlsIHRoZSBuZXh0IHNlc3Npb24tc3RhdGUgdXBkYXRlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fbGFzdENhdGFsb2dTdGF0ZTtcblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9hcHBseUNoYXRDYXRhbG9nKHN0YXRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25jaWxlIHRoZSBwZXItY2hhdCBjYXRhbG9nIGZyb20gYW4gQUhQIHtAbGluayBTZXNzaW9uU3RhdGV9LlxuXHQgKlxuXHQgKiBUaGUgZGVmYXVsdCBjaGF0IChyZXNvdXJjZSA9PSB0aGlzIHNlc3Npb24ncyByZXNvdXJjZSkgYWx3YXlzIG1hcHMgdG9cblx0ICoge0BsaW5rIF9kZWZhdWx0Q2hhdH0uIEFkZGl0aW9uYWwgcGVlciBjaGF0cyBiZWNvbWUgdGhlaXIgb3duIHtAbGluayBJQ2hhdH1cblx0ICogd2hvc2UgcmVzb3VyY2UgY2FycmllcyB0aGUgY2hhdElkIGluIHRoZSBVUkkgZnJhZ21lbnQgc28gdGhlIGNoYXQgdmlld1xuXHQgKiBvcGVucyBhIGRpc3RpbmN0IHdpZGdldCB0aGF0IHRoZSBzZXNzaW9uIGhhbmRsZXIgcm91dGVzIHRvIHRoZSBtYXRjaGluZ1xuXHQgKiBjaGF0IGNoYW5uZWwuXG5cdCAqXG5cdCAqIEEgbm9uLWRlZmF1bHQgY2hhdCBzdXJmYWNlcyBhcyBhIHBlZXIgdGFiIHdoZW4gdGhlIHNlc3Npb24gc3VwcG9ydHNcblx0ICogbXVsdGlwbGUgY2hhdHMgKHRoZSBgY29waWxvdGNsaWAgY2FzZSkgT1Igd2hlbiBpdCBpcyBhIHN1YmFnZW50XG5cdCAqICh0b29sLW9yaWdpbikgY2hhdC4gU3ViYWdlbnQgY2hhdHMgYXJlIGFsd2F5cyBzdXJmYWNlZCBhcyByZWFkLW9ubHkgcGVlcnNcblx0ICogXHUyMDE0IGluZGVwZW5kZW50IG9mIG11bHRpLWNoYXQgc3VwcG9ydCBcdTIwMTQgc28gdGhlIHVzZXIgY2FuIHJldmlldyBhIHdvcmtlcidzXG5cdCAqIHRyYW5zY3JpcHQgKHRoZSBhZ2VudC10ZWFtIHBhdHRlcm4pLiBTZXNzaW9ucyB3aXRoIG5vIHN1cmZhY2VkIHBlZXJzXG5cdCAqIGRlZ3JhZGUgdG8gYFtkZWZhdWx0Q2hhdF1gLlxuXHQgKi9cblx0YXBwbHlDaGF0Q2F0YWxvZyhzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdENhdGFsb2dTdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX2FwcGx5Q2hhdENhdGFsb2coc3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlDaGF0Q2F0YWxvZyhzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Ly8gVGhlIGRlZmF1bHQgY2hhdCdzIGNhdGFsb2cgdGl0bGUgZHJpdmVzIGl0cyBpbmRlcGVuZGVudCB0YWIgdGl0bGUuXG5cdFx0Ly8gRW1wdHkgbWVhbnMgXCJpbmhlcml0IHRoZSBzZXNzaW9uIHRpdGxlXCI7IGEgbm9uLWVtcHR5IHZhbHVlIG1lYW5zIGl0IHdhc1xuXHRcdC8vIHJlbmFtZWQgaW5kZXBlbmRlbnRseSBvZiB0aGUgc2Vzc2lvbi5cblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IHN0YXRlLmRlZmF1bHRDaGF0Py50b1N0cmluZygpO1xuXHRcdGNvbnN0IGlzRGVmYXVsdCA9IChzdW1tYXJ5OiBDaGF0U3VtbWFyeSk6IGJvb2xlYW4gPT4gZGVmYXVsdENoYXRVcmlcblx0XHRcdD8gc3VtbWFyeS5yZXNvdXJjZS50b1N0cmluZygpID09PSBkZWZhdWx0Q2hhdFVyaVxuXHRcdFx0OiBpc0RlZmF1bHRDaGF0VXJpKHN1bW1hcnkucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGRlZmF1bHRTdW1tYXJ5ID0gc3RhdGUuY2hhdHMuZmluZChpc0RlZmF1bHQpO1xuXHRcdHRoaXMuX2RlZmF1bHRDaGF0VGl0bGVPdmVycmlkZS5zZXQoZGVmYXVsdFN1bW1hcnk/LnRpdGxlIHx8IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9kZWZhdWx0Q2hhdEludGVyYWN0aXZpdHkuc2V0KHRvQ2hhdEludGVyYWN0aXZpdHkoZGVmYXVsdFN1bW1hcnk/LmludGVyYWN0aXZpdHkpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVG9vbC1vcmlnaW4gc3ViYWdlbnRzIGFuZCB1c2VyLWNyZWF0ZWQgc2lkZSAoYC9idHdgKSBjaGF0cyBtdXN0IHJlYWNoXG5cdFx0Ly8gdGhlIHBlZXItY2hhdCBjYXRhbG9nIGV2ZW4gd2hlbiB0aGUgYmFja2luZyBzZXNzaW9uIHR5cGUgaXMgb3RoZXJ3aXNlXG5cdFx0Ly8gc2luZ2xlLWNoYXQ7IHRoZSBVSSBsYXRlciBkZWNpZGVzIHdoZXRoZXIgdG8gc2hvdyB0aGVtIGJ5IGRlZmF1bHQuXG5cdFx0Y29uc3Qgc3VyZmFjZXNBc1BlZXIgPSAoc3VtbWFyeTogQ2hhdFN1bW1hcnkpOiBib29sZWFuID0+XG5cdFx0XHQhaXNEZWZhdWx0KHN1bW1hcnkpXG5cdFx0XHQmJiAhIXBhcnNlQ2hhdFVyaShzdW1tYXJ5LnJlc291cmNlKT8uY2hhdElkXG5cdFx0XHQmJiAodGhpcy5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzXG5cdFx0XHRcdHx8IHN1bW1hcnkub3JpZ2luPy5raW5kID09PSBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlRvb2xcblx0XHRcdFx0fHwgc3VtbWFyeS5vcmlnaW4/LmtpbmQgPT09IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpO1xuXG5cdFx0aWYgKCFzdGF0ZS5jaGF0cy5zb21lKHN1cmZhY2VzQXNQZWVyKSkge1xuXHRcdFx0Ly8gU2luZ2xlIHZpc2libGUgY2hhdDogdGhlIGRlZmF1bHQgY2hhdCBpcyB0aGUgc2Vzc2lvbiwgc28gbGV0IGl0XG5cdFx0XHQvLyByZWZsZWN0IHRoZSBhZ2dyZWdhdGVkIHNlc3Npb24gc3RhdHVzIGRpcmVjdGx5IChjbGVhciBhbnkgb3ZlcnJpZGUpLlxuXHRcdFx0dGhpcy5fZGVmYXVsdENoYXRTdGF0dXNPdmVycmlkZS5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5zaXplID4gMCkge1xuXHRcdFx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdHMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY2hhdHNPYnMuZ2V0KCkubGVuZ3RoICE9PSAxIHx8IHRoaXMuX2NoYXRzT2JzLmdldCgpWzBdICE9PSB0aGlzLl9kZWZhdWx0Q2hhdCkge1xuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY2hhdHNPYnMuc2V0KFt0aGlzLl9kZWZhdWx0Q2hhdF0sIHR4KTtcblx0XHRcdFx0XHR0aGlzLl9tYWluQ2hhdE9icy5zZXQodGhpcy5fZGVmYXVsdENoYXQsIHR4KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTXVsdGlwbGUgY2hhdHM6IHRoZSBkZWZhdWx0IGNoYXQgbXVzdCBzaG93IGl0cyBvd24gc3RhdHVzLCBub3QgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBhZ2dyZWdhdGUgd2hpY2ggbWF5IGhhdmUgYmVlbiBwcm9tb3RlZCBieSBhIHJ1bm5pbmcgcGVlciBjaGF0LlxuXHRcdHRoaXMuX2RlZmF1bHRDaGF0U3RhdHVzT3ZlcnJpZGUuc2V0KGRlZmF1bHRTdW1tYXJ5ID8gbWFwUHJvdG9jb2xTdGF0dXMoZGVmYXVsdFN1bW1hcnkuc3RhdHVzKSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBvcmRlcmVkOiBJQ2hhdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzdW1tYXJ5IG9mIHN0YXRlLmNoYXRzKSB7XG5cdFx0XHRpZiAoaXNEZWZhdWx0KHN1bW1hcnkpKSB7XG5cdFx0XHRcdG9yZGVyZWQucHVzaCh0aGlzLl9kZWZhdWx0Q2hhdCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdXJmYWNlc0FzUGVlcihzdW1tYXJ5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYXRJZCA9IHBhcnNlQ2hhdFVyaShzdW1tYXJ5LnJlc291cmNlKSEuY2hhdElkO1xuXHRcdFx0c2Vlbi5hZGQoY2hhdElkKTtcblx0XHRcdGxldCBlbnRyeSA9IHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5nZXQoY2hhdElkKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0ZW50cnkgPSB0aGlzLl9jcmVhdGVBZGRpdGlvbmFsQ2hhdChjaGF0SWQsIHN1bW1hcnkpO1xuXHRcdFx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdHMuc2V0KGNoYXRJZCwgZW50cnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cnkudXBkYXRlKHN1bW1hcnkpO1xuXHRcdFx0fVxuXHRcdFx0b3JkZXJlZC5wdXNoKGVudHJ5LmNoYXQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2hhdElkIG9mIFsuLi50aGlzLl9hZGRpdGlvbmFsQ2hhdHMua2V5cygpXSkge1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhjaGF0SWQpKSB7XG5cdFx0XHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5kZWxldGVBbmREaXNwb3NlKGNoYXRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFpbiA9IChkZWZhdWx0Q2hhdFVyaSAmJiBvcmRlcmVkLmZpbmQoYyA9PiBpc0VxdWFsKGMucmVzb3VyY2UsIHRoaXMucmVzb3VyY2UpKSkgfHwgdGhpcy5fZGVmYXVsdENoYXQ7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fY2hhdHNPYnMuc2V0KG9yZGVyZWQubGVuZ3RoID4gMCA/IG9yZGVyZWQgOiBbdGhpcy5fZGVmYXVsdENoYXRdLCB0eCk7XG5cdFx0XHR0aGlzLl9tYWluQ2hhdE9icy5zZXQobWFpbiwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQWRkaXRpb25hbENoYXQoY2hhdElkOiBzdHJpbmcsIHN1bW1hcnk6IENoYXRTdW1tYXJ5KTogQWRkaXRpb25hbENoYXQge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHRoaXMuX3Jlc291cmNlU2NoZW1lLCBwYXRoOiBgLyR7dGhpcy5fcmF3SWR9YCwgZnJhZ21lbnQ6IGNoYXRJZCB9KTtcblx0XHRjb25zdCBsYXN0VHVybkNoYW5nZXMgPSB0aGlzLl9zZXNzaW9uT3V0cHV0LmdldExhc3RUdXJuQ2hhbmdlcyhVUkkucGFyc2Uoc3VtbWFyeS5yZXNvdXJjZSkpO1xuXHRcdHJldHVybiBuZXcgQWRkaXRpb25hbENoYXQocmVzb3VyY2UsIHN1bW1hcnksIHRoaXMuX25ld0NoYXRJZHMuaGFzKGNoYXRJZCksIHRoaXMuX3Jlc29sdmVQYXJlbnRDaGF0UmVzb3VyY2Uoc3VtbWFyeS5vcmlnaW4pLCB0aGlzLmlzQXJjaGl2ZWQsIGxhc3RUdXJuQ2hhbmdlcywgdGhpcy5fb3B0aW9ucy5yZWFkT25seSk7XG5cdH1cblxuXHQvKipcblx0ICogTWFwcyBhIHByb3RvY29sIHBhcmVudC1jaGF0IFVSSSAoZnJvbSBhIFRvb2wvRm9yayB7QGxpbmsgQ2hhdFN1bW1hcnkub3JpZ2lufSlcblx0ICogdG8gdGhpcyBzZXNzaW9uJ3MgVUkgY2hhdCByZXNvdXJjZTogdGhlIGRlZmF1bHQgY2hhdCBtYXBzIHRvIHRoZSBzZXNzaW9uXG5cdCAqIHJlc291cmNlOyBwZWVyIGNoYXRzIGNhcnJ5IHRoZWlyIGNoYXRJZCBpbiB0aGUgcmVzb3VyY2UgZnJhZ21lbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUGFyZW50Q2hhdFJlc291cmNlKG9yaWdpbjogQ2hhdFN1bW1hcnlbJ29yaWdpbiddKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJlbnRVcmkgPSBvcmlnaW4gJiYgKFxuXHRcdFx0b3JpZ2luLmtpbmQgPT09IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuVG9vbFxuXHRcdFx0fHwgb3JpZ2luLmtpbmQgPT09IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuRm9ya1xuXHRcdFx0fHwgb3JpZ2luLmtpbmQgPT09IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpXG5cdFx0XHQ/IG9yaWdpbi5jaGF0XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXBhcmVudFVyaSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGlzRGVmYXVsdENoYXRVcmkocGFyZW50VXJpKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb3VyY2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmVudENoYXRJZCA9IHBhcnNlQ2hhdFVyaShwYXJlbnRVcmkpPy5jaGF0SWQ7XG5cdFx0cmV0dXJuIHBhcmVudENoYXRJZFxuXHRcdFx0PyBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5fcmVzb3VyY2VTY2hlbWUsIHBhdGg6IGAvJHt0aGlzLl9yYXdJZH1gLCBmcmFnbWVudDogcGFyZW50Q2hhdElkIH0pXG5cdFx0XHQ6IHRoaXMucmVzb3VyY2U7XG5cdH1cblxuXHQvKiogTWFyayBhIHBlZXIgY2hhdCBuZXcgc28gaXQgc2hvd3MgYXMgYFVudGl0bGVkYCB1bnRpbCBpdHMgZmlyc3QgcmVxdWVzdC4gKi9cblx0bWFya0NoYXRBc05ldyhjaGF0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX25ld0NoYXRJZHMuYWRkKGNoYXRJZCk7XG5cdFx0dGhpcy5fYWRkaXRpb25hbENoYXRzLmdldChjaGF0SWQpPy5tYXJrTmV3KCk7XG5cdH1cblxuXHQvKiogQ2xlYXIgdGhlIGBuZXdgIGZsYWcgYWZ0ZXIgdGhlIGNoYXQncyBmaXJzdCByZXF1ZXN0IGlzIHNlbnQuICovXG5cdG1hcmtDaGF0QXNTZW50KGNoYXRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElkcy5kZWxldGUoY2hhdElkKTtcblx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdHMuZ2V0KGNoYXRJZCk/Lm1hcmtTZW50KCk7XG5cdH1cblxuXHRzZXRDaGF0TW9kZWxJZChjaGF0UmVzb3VyY2U6IFVSSSwgbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdElkID0gY2hhdFJlc291cmNlLmZyYWdtZW50O1xuXHRcdGlmIChjaGF0SWQpIHtcblx0XHRcdHRoaXMuX2dldEFkZGl0aW9uYWxDaGF0KGNoYXRSZXNvdXJjZSk/LnNldE1vZGVsSWQobW9kZWxJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubW9kZWxJZC5zZXQobW9kZWxJZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMubW9kZWxTZWxlY3Rpb24gPSBtb2RlbElkID8gdGhpcy5fdG9Nb2RlbFNlbGVjdGlvbihtb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRzZXRDaGF0QWdlbnQoY2hhdFJlc291cmNlOiBVUkksIGFnZW50OiBJU2Vzc2lvbkFnZW50UmVmIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdElkID0gY2hhdFJlc291cmNlLmZyYWdtZW50O1xuXHRcdGlmIChjaGF0SWQpIHtcblx0XHRcdHRoaXMuX2dldEFkZGl0aW9uYWxDaGF0KGNoYXRSZXNvdXJjZSk/LnNldEFnZW50KGFnZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tb2RlLnNldChhZ2VudCA/IHsgaWQ6IGFnZW50LnVyaSwga2luZDogQUdFTlRfTU9ERV9LSU5EIH0gOiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBSZW1lbWJlciB3aGljaCB3b3JraW5nIGRpcmVjdG9yeSB0aGUgYWdlbnQgVVJJIGlzIHJvb3RlZCBhdCBzbyB0aGVcblx0XHRcdC8vIHNlbGVjdGlvbiBjYW4gYmUgcmViYXNlZCBpZiB0aGUgc2Vzc2lvbiBsYXRlciByZWxvY2F0ZXMgaW50byBhIHdvcmt0cmVlLlxuXHRcdFx0dGhpcy5fYWdlbnRCYXNlRGlyID0gYWdlbnQgPyB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXM/LlswXSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25jaWxlIHRoZSBzZWxlY3RlZCBjdXN0b20tYWdlbnQgVVJJIGFnYWluc3QgdGhlIGhvc3QncyBjdXJyZW50IGFnZW50XG5cdCAqIGxpc3QgXHUyMDE0IGUuZy4gdGhlIHNlc3Npb24gZ3JhZHVhdGVkIHdpdGggYW4gYWdlbnQgcGlja2VkIGluIHRoZSBvcmlnaW5hbCByZXBvXG5cdCAqIGJ1dCBub3cgcnVucyBpbiBhbiBpc29sYXRlZCB3b3JrdHJlZSwgd2hlcmUgdGhlIGhvc3QgcmVwb3J0cyB0aGUgc2FtZSBhZ2VudFxuXHQgKiBmaWxlIHVuZGVyIHRoZSB3b3JrdHJlZSBwYXRoLlxuXHQgKlxuXHQgKiBUaGUgc2VsZWN0aW9uIGlzIHJlYmFzZWQgYnkgbWF0Y2hpbmcgdGhlIGFnZW50J3MgcmVwby1yZWxhdGl2ZSBwYXRoIGFnYWluc3Rcblx0ICogdGhlIGF2YWlsYWJsZSBhZ2VudHMgKHdoaWNoIGFscmVhZHkgY2FycnkgdGhlIHdvcmt0cmVlIHJvb3QpIHJhdGhlciB0aGFuIHRoZVxuXHQgKiBzZXNzaW9uJ3MgcmVwb3J0ZWQgd29ya2luZyBkaXJlY3RvcnkuIFRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyB1bnJlbGlhYmxlXG5cdCAqIGhlcmU6IHRoZSB3b3JrdHJlZS1wYXRoZWQgY3VzdG9taXphdGlvbnMgYXJyaXZlIHdlbGwgYmVmb3JlIGVpdGhlciB0aGVcblx0ICogYFNlc3Npb25TdW1tYXJ5YCBvciBgU2Vzc2lvblN0YXRlYCB3b3JraW5nLWRpcmVjdG9yeSBmbGlwcyB0byB0aGUgd29ya3RyZWUsXG5cdCAqIHNvIGEgd29ya2luZy1kaXJlY3Rvcnkta2V5ZWQgcmViYXNlIHdvdWxkIG1pc3MgdGhlIHdpbmRvdyBhbmQgbGV0IHRoZSBwaWNrZXJcblx0ICogZGVzdHJ1Y3RpdmVseSByZXNldCB0aGUgc2VsZWN0aW9uLiBEZXJpdmluZyB0aGUgd29ya3RyZWUgcm9vdCBmcm9tIHRoZSBhZ2VudFxuXHQgKiBsaXN0IGNsb3NlcyB0aGF0IHJhY2UuXG5cdCAqXG5cdCAqIE1pcnJvcnMgdGhlIGFnZW50LWhvc3QgYmFja2VuZCdzIGNvZGUgdG8gcmViYXNlIGJ5IHJlbGF0aXZlIHBhdGguXG5cdCAqIFRoZSByZS1wb2ludCBpcyBvbmx5IGFwcGxpZWQgdG8gYSBVUkkgdGhhdCBhY3R1YWxseSBleGlzdHMgaW5cblx0ICogdGhlIHN1cHBsaWVkIGFnZW50IGxpc3QsIHNvIGl0IG5ldmVyIHJ1bnMgYWhlYWQgb2YgdGhlIGhvc3QgcmVwb3J0aW5nIHRoZVxuXHQgKiB3b3JrdHJlZSBhZ2VudHMgKHdoaWNoIHdvdWxkIG90aGVyd2lzZSByZS1pbnRyb2R1Y2UgdGhlIG1pc21hdGNoIGl0IGZpeGVzKS5cblx0ICovXG5cdHJlY29uY2lsZVNlbGVjdGVkQWdlbnQoYWdlbnRzOiByZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLm1vZGUuZ2V0KCk7XG5cdFx0aWYgKCFjdXJyZW50IHx8IGFnZW50cy5zb21lKGEgPT4gYS51cmkgPT09IGN1cnJlbnQuaWQpKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vIGFnZW50IHNlbGVjdGVkLCBvciB0aGUgc2VsZWN0aW9uIGlzIGFscmVhZHkgdmFsaWRcblx0XHR9XG5cdFx0Y29uc3QgYmFzZSA9IHRoaXMuX2FnZW50QmFzZURpcjtcblx0XHRpZiAoIWJhc2UpIHtcblx0XHRcdHJldHVybjsgLy8gdW5rbm93biByb290IGZvciB0aGUgY3VycmVudCBzZWxlY3Rpb24gXHUyMDE0IG5vdGhpbmcgdG8gcmViYXNlIGFnYWluc3Rcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkucGFyc2UoY3VycmVudC5pZCk7XG5cdFx0aWYgKCFpc0VxdWFsT3JQYXJlbnQoYWdlbnRVcmksIGJhc2UpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFnZW50IGxpdmVzIG91dHNpZGUgdGhlIHJlcG8gKGUuZy4gYSB1c2VyLWdsb2JhbCBhZ2VudClcblx0XHR9XG5cdFx0Y29uc3QgcmVsID0gcmVsYXRpdmVQYXRoKGJhc2UsIGFnZW50VXJpKTtcblx0XHRpZiAoIXJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWxvY2F0ZWQgPSB0aGlzLl9maW5kUmVsb2NhdGVkQWdlbnQoYWdlbnRzLCBhZ2VudFVyaSwgYmFzZSwgcmVsKTtcblx0XHRpZiAocmVsb2NhdGVkKSB7XG5cdFx0XHR0aGlzLm1vZGUuc2V0KHsgaWQ6IHJlbG9jYXRlZC51cmksIGtpbmQ6IGN1cnJlbnQua2luZCB9LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fYWdlbnRCYXNlRGlyID0gcmVsb2NhdGVkLnJvb3Q7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmRzIGFuIGF2YWlsYWJsZSBhZ2VudCB0aGF0IGlzIHRoZSBzYW1lIHJlcG8tcmVsYXRpdmUgZmlsZSBhcyB0aGUgY3VycmVudFxuXHQgKiBzZWxlY3Rpb24gYnV0IHJvb3RlZCB1bmRlciBhIGRpZmZlcmVudCBkaXJlY3RvcnkgKGl0cyB3b3JrdHJlZSB0d2luKS5cblx0ICpcblx0ICogQSBjYW5kaWRhdGUgbWF0Y2hlcyB3aGVuIGl0cyBwYXRoIGVuZHMgd2l0aCBgLzxyZWw+YCBvbiBhIHBhdGgtc2VnbWVudFxuXHQgKiBib3VuZGFyeSBhbmQgdGhlIGltcGxpZWQgcm9vdCAodGhlIGNhbmRpZGF0ZSBwYXRoIG1pbnVzIHRoYXQgc3VmZml4KSBkaWZmZXJzXG5cdCAqIGZyb20gYGJhc2VgLiBUaGUgcm9vdCBpcyByZS12YWxpZGF0ZWQgd2l0aCBgcmVsYXRpdmVQYXRoYCBzbyBvbmx5IGEgZ2VudWluZVxuXHQgKiByZWxvY2F0aW9uIG9mIHRoZSBzYW1lIGZpbGUgaXMgYWNjZXB0ZWQuIFJldHVybnMgdGhlIG1hdGNoZWQgYWdlbnQncyBVUkkgYW5kXG5cdCAqIGl0cyBkZXJpdmVkIHJvb3QsIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlcmUgaXMgbm8gdHdpbi5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmRSZWxvY2F0ZWRBZ2VudChcblx0XHRhZ2VudHM6IHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdLFxuXHRcdGFnZW50VXJpOiBVUkksXG5cdFx0YmFzZTogVVJJLFxuXHRcdHJlbDogc3RyaW5nLFxuXHQpOiB7IHJlYWRvbmx5IHVyaTogc3RyaW5nOyByZWFkb25seSByb290OiBVUkkgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3VmZml4ID0gYC8ke3JlbH1gO1xuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBVUkkucGFyc2UoYWdlbnQudXJpKTtcblx0XHRcdGlmIChjYW5kaWRhdGUuc2NoZW1lICE9PSBhZ2VudFVyaS5zY2hlbWUgfHwgY2FuZGlkYXRlLmF1dGhvcml0eSAhPT0gYWdlbnRVcmkuYXV0aG9yaXR5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFjYW5kaWRhdGUucGF0aC5lbmRzV2l0aChzdWZmaXgpIHx8IGNhbmRpZGF0ZS5wYXRoLmxlbmd0aCA9PT0gc3VmZml4Lmxlbmd0aCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHRoZSBzYW1lIHJlbGF0aXZlIGZpbGUsIG9yIGl0IHNpdHMgYXQgdGhlIGZpbGVzeXN0ZW0gcm9vdFxuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgcm9vdCA9IGNhbmRpZGF0ZS53aXRoKHsgcGF0aDogY2FuZGlkYXRlLnBhdGguc2xpY2UoMCwgY2FuZGlkYXRlLnBhdGgubGVuZ3RoIC0gc3VmZml4Lmxlbmd0aCkgfSk7XG5cdFx0XHRpZiAoaXNFcXVhbChyb290LCBiYXNlKSB8fCByZWxhdGl2ZVBhdGgocm9vdCwgY2FuZGlkYXRlKSAhPT0gcmVsKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBzYW1lIHJvb3QgKHdvdWxkIGhhdmUgbWF0Y2hlZCBleGFjdGx5KSwgb3Igbm90IGEgY2xlYW4gcmVsb2NhdGlvblxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdXJpOiBhZ2VudC51cmksIHJvb3QgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkIHRoZSBzZWxlY3RlZCBjdXN0b20gYWdlbnQgd2hlbiBhIHNlc3Npb24gaXMgcmVzdW1lZCAoZS5nLiBhZnRlciBhXG5cdCAqIHdpbmRvdyByZWxvYWQpLiBBIGZyZXNobHkgbG9hZGVkIGFkYXB0ZXIgc3RhcnRzIHdpdGggYG1vZGUgPT09IHVuZGVmaW5lZGA7XG5cdCAqIHRoZSBob3N0IHBlcnNpc3RzIHRoZSBzZWxlY3Rpb24gb24gdGhlIGRlZmF1bHQgY2hhdCdzIGBDaGF0U3RhdGUuZHJhZnQuYWdlbnRgLFxuXHQgKiB3aGljaCB0aGUgcHJvdmlkZXIgcmVhZHMgYW5kIG1pcnJvcnMgb250byBgc2Vzc2lvbi5tb2RlYCBoZXJlLiBHdWFyZGVkIHRvXG5cdCAqIG5ldmVyIG92ZXJyaWRlIGEgbGl2ZSBzZWxlY3Rpb24gKGEgUGFydCAxIGdyYWR1YXRpb24gc2VlZCBvciBhIHVzZXIgcGljayksXG5cdCAqIGtlZXBpbmcgdGhpcyBhIHJlc3VtZS1vbmx5IGh5ZHJhdGlvbi5cblx0ICovXG5cdGh5ZHJhdGVTZWxlY3RlZEFnZW50KGFnZW50VXJpOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tb2RlLmdldCgpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXRDaGF0QWdlbnQodGhpcy5yZXNvdXJjZSwgeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnJyB9KTtcblx0fVxuXG5cdGdldENoYXRNb2RlbElkKGNoYXRSZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gY2hhdFJlc291cmNlLmZyYWdtZW50XG5cdFx0XHQ/IHRoaXMuX2dldEFkZGl0aW9uYWxDaGF0KGNoYXRSZXNvdXJjZSk/LmNoYXQubW9kZWxJZC5nZXQoKVxuXHRcdFx0OiB0aGlzLm1vZGVsSWQuZ2V0KCk7XG5cdH1cblxuXHRnZXRDaGF0TW9kZWxTZWxlY3Rpb24oY2hhdFJlc291cmNlOiBVUkkpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuZ2V0Q2hhdE1vZGVsSWQoY2hhdFJlc291cmNlKTtcblx0XHRpZiAobW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvTW9kZWxTZWxlY3Rpb24obW9kZWxJZCk7XG5cdFx0fVxuXHRcdHJldHVybiBjaGF0UmVzb3VyY2UuZnJhZ21lbnQgPyB1bmRlZmluZWQgOiB0aGlzLm1vZGVsU2VsZWN0aW9uO1xuXHR9XG5cblx0Z2V0Q2hhdE1vZGUoY2hhdFJlc291cmNlOiBVUkkpOiB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gY2hhdFJlc291cmNlLmZyYWdtZW50XG5cdFx0XHQ/IHRoaXMuX2dldEFkZGl0aW9uYWxDaGF0KGNoYXRSZXNvdXJjZSk/LmNoYXQubW9kZS5nZXQoKVxuXHRcdFx0OiB0aGlzLm1vZGUuZ2V0KCk7XG5cdH1cblxuXHQvKiogT3B0aW1pc3RpY2FsbHkgc2V0IHRoZSBkZWZhdWx0IGNoYXQgdGFiIHRpdGxlIChpbmRlcGVuZGVudCBvZiB0aGUgc2Vzc2lvbiB0aXRsZSkuICovXG5cdHNldERlZmF1bHRDaGF0VGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2RlZmF1bHRDaGF0VGl0bGVPdmVycmlkZS5zZXQodGl0bGUgfHwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqIE9wdGltaXN0aWNhbGx5IHNldCBhbiBhZGRpdGlvbmFsIHBlZXIgY2hhdCdzIHRpdGxlIGFoZWFkIG9mIHRoZSBob3N0J3MgYGNoYXRVcGRhdGVkYC4gKi9cblx0c2V0QWRkaXRpb25hbENoYXRUaXRsZShjaGF0SWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5nZXQoY2hhdElkKT8uc2V0VGl0bGUodGl0bGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Nb2RlbFNlbGVjdGlvbihtb2RlbElkOiBzdHJpbmcpOiBNb2RlbFNlbGVjdGlvbiB7XG5cdFx0Y29uc3QgcHJlZml4ID0gYCR7dGhpcy5fcmVzb3VyY2VTY2hlbWV9OmA7XG5cdFx0cmV0dXJuIHsgaWQ6IG1vZGVsSWQuc3RhcnRzV2l0aChwcmVmaXgpID8gbW9kZWxJZC5zdWJzdHJpbmcocHJlZml4Lmxlbmd0aCkgOiBtb2RlbElkIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBZGRpdGlvbmFsQ2hhdChjaGF0UmVzb3VyY2U6IFVSSSk6IEFkZGl0aW9uYWxDaGF0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBieUZyYWdtZW50ID0gY2hhdFJlc291cmNlLmZyYWdtZW50ID8gdGhpcy5fYWRkaXRpb25hbENoYXRzLmdldChjaGF0UmVzb3VyY2UuZnJhZ21lbnQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChieUZyYWdtZW50KSB7XG5cdFx0XHRyZXR1cm4gYnlGcmFnbWVudDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIHRoaXMuX2FkZGl0aW9uYWxDaGF0cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGlzRXF1YWwoY2hhdC5jaGF0LnJlc291cmNlLCBjaGF0UmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiBjaGF0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQ2hhbmdlc09icygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4ge1xuXHRcdGNvbnN0IGRlZmF1bHRDaGFuZ2VzZXRPYnMgPSBkZXJpdmVkT3B0czxJU2Vzc2lvbkNoYW5nZXNldCB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0ZXF1YWxzRm46IChjMSwgYzIpID0+IGMxPy5pZCA9PT0gYzI/LmlkXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXNldHMgPSB0aGlzLmNoYW5nZXNldHMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjaGFuZ2VzZXRzKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGFuZ2VzZXRzLmZpbmQoYyA9PiBjLmlzRGVmYXVsdC5yZWFkKHJlYWRlcikgPT09IHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGVmYXVsdENoYW5nZXNldENoYW5nZXNPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhbmdlc2V0ID0gZGVmYXVsdENoYW5nZXNldE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWRlZmF1bHRDaGFuZ2VzZXQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGRlZmF1bHRDaGFuZ2VzZXQuY2hhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSxcblx0XHRcdHJlYWRlciA9PiBkZWZhdWx0Q2hhbmdlc2V0Q2hhbmdlc09icy5yZWFkKHJlYWRlcikgPz8gW10pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSBmaWVsZHMgZnJvbSBhIHJlZnJlc2hlZCBtZXRhZGF0YSBzbmFwc2hvdC4gUmV0dXJucyBgdHJ1ZWAgaWZmXG5cdCAqIGFueSB1c2VyLXZpc2libGUgZmllbGQgY2hhbmdlZC5cblx0ICovXG5cdHVwZGF0ZShtZXRhZGF0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogYm9vbGVhbiB7XG5cdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IG1ldGFkYXRhLnN1bW1hcnk7XG5cdFx0XHRpZiAoc3VtbWFyeSAhPT0gdW5kZWZpbmVkICYmIHN1bW1hcnkgIT09IHRoaXMudGl0bGUuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy50aXRsZS5zZXQoc3VtbWFyeSwgdHgpO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWV0YWRhdGEuc3RhdHVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgdWlTdGF0dXMgPSBtYXBQcm90b2NvbFN0YXR1cyhtZXRhZGF0YS5zdGF0dXMpO1xuXHRcdFx0XHRpZiAodWlTdGF0dXMgIT09IHRoaXMuc3RhdHVzLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0dXMuc2V0KHVpU3RhdHVzLCB0eCk7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RpZmllZFRpbWUgPSBtZXRhZGF0YS5tb2RpZmllZFRpbWU7XG5cdFx0XHRpZiAodGhpcy51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpICE9PSBtb2RpZmllZFRpbWUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVkQXQuc2V0KG5ldyBEYXRlKG1vZGlmaWVkVGltZSksIHR4KTtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudExhc3RUdXJuRW5kVGltZSA9IHRoaXMubGFzdFR1cm5FbmQuZ2V0KCk/LmdldFRpbWUoKTtcblx0XHRcdGNvbnN0IG5leHRMYXN0VHVybkVuZFRpbWUgPSBtb2RpZmllZFRpbWUgPyBtb2RpZmllZFRpbWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY3VycmVudExhc3RUdXJuRW5kVGltZSAhPT0gbmV4dExhc3RUdXJuRW5kVGltZSkge1xuXHRcdFx0XHR0aGlzLmxhc3RUdXJuRW5kLnNldChuZXh0TGFzdFR1cm5FbmRUaW1lICE9PSB1bmRlZmluZWQgPyBuZXcgRGF0ZShuZXh0TGFzdFR1cm5FbmRUaW1lKSA6IHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcm9qZWN0ID0gbWV0YWRhdGEucHJvamVjdDtcblx0XHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcmllcyA9IG1ldGFkYXRhLndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdC8vIE9ubHkgdXBkYXRlIGBfbWV0YWAgd2hlbiB0aGUgc291cmNlIGFjdHVhbGx5IHByb3ZpZGVzIG9uZSBcdTIwMTQgYW5cblx0XHRcdC8vIHVuZGVmaW5lZCB2YWx1ZSBtZWFucyBcIm5vdCBpbmNsdWRlZFwiIChlLmcuIGEgc3VtbWFyeSBwYXRoIHRoYXRcblx0XHRcdC8vIG9taXRzIGl0KSwgbm90IFwiY2xlYXJlZFwiLiBUaGUgYXV0aG9yaXRhdGl2ZSBnaXQtc3RhdGUgYF9tZXRhYFxuXHRcdFx0Ly8gc3RpbGwgZmxvd3MgdmlhIGBzZXRNZXRhYCBmcm9tIGBTZXNzaW9uU3RhdGVgIHN1YnNjcmlwdGlvbnMuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gYHNldE1ldGFgIHJlYnVpbGRzIHRoZSB3b3Jrc3BhY2UgZnJvbSB0aGUgcHJvamVjdCAvIHdvcmtpbmdcblx0XHRcdC8vIGRpcmVjdG9yaWVzIGFzc2lnbmVkIGp1c3QgYWJvdmUgcGx1cyB0aGUgaW5jb21pbmcgYF9tZXRhYCwgc28gaXRcblx0XHRcdC8vIGZ1bGx5IHN1YnN1bWVzIHRoZSByZWJ1aWxkIGJlbG93IFx1MjAxNCBydW5uaW5nIGJvdGggd291bGQgcmVjb21wdXRlXG5cdFx0XHQvLyB0aGUgc2FtZSB3b3Jrc3BhY2UgdHdpY2UgZm9yIGV2ZXJ5IGBfbWV0YWAtYmVhcmluZyByZWZyZXNoLiBUaGVcblx0XHRcdC8vIGZhbGxiYWNrIGlzIG9ubHkgZm9yIHNuYXBzaG90cyB0aGF0IGNhcnJ5IG5vIGBfbWV0YWAuXG5cdFx0XHRpZiAobWV0YWRhdGEuX21ldGEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAodGhpcy5zZXRNZXRhKG1ldGFkYXRhLl9tZXRhLCB0eCkpIHtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl9jb21wdXRlV29ya3NwYWNlKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9zZXRXb3Jrc3BhY2Uod29ya3NwYWNlLCB0eCkpIHtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtZXRhZGF0YS5zdGF0dXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBpc0FyY2hpdmVkID0gaXNTZXNzaW9uU3RhdHVzQXJjaGl2ZWQobWV0YWRhdGEuc3RhdHVzKTtcblx0XHRcdFx0aWYgKGlzQXJjaGl2ZWQgIT09IHRoaXMuaXNBcmNoaXZlZC5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuaXNBcmNoaXZlZC5zZXQoaXNBcmNoaXZlZCwgdHgpO1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc1JlYWQgPSBpc1Nlc3Npb25TdGF0dXNSZWFkKG1ldGFkYXRhLnN0YXR1cyk7XG5cdFx0XHRcdGlmIChpc1JlYWQgIT09IHRoaXMuaXNSZWFkLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5pc1JlYWQuc2V0KGlzUmVhZCwgdHgpO1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gYG1ldGFkYXRhLmNoYW5nZXNgIChhZ2dyZWdhdGUpIGRyaXZlcyB0aGUgY2hpcCBhZ2dyZWdhdGUuXG5cdFx0XHQvLyBUaGUgZHJvcGRvd24gY29udGVudCBpcyBidWlsdCBzZXBhcmF0ZWx5IHZpYSBgY3JlYXRlQ2hhbmdlc2V0c2AuXG5cdFx0XHRpZiAobWV0YWRhdGEuY2hhbmdlcyAhPT0gdW5kZWZpbmVkICYmIHRoaXMuc2V0Q2hhbmdlc1N1bW1hcnkobWV0YWRhdGEuY2hhbmdlcywgdHgpKSB7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9hY3Rpdml0eS5nZXQoKSAhPT0gbWV0YWRhdGEuYWN0aXZpdHkpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZpdHkuc2V0KG1ldGFkYXRhLmFjdGl2aXR5LCB0eCk7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGlkQ2hhbmdlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGFjdGl2aXR5IHRleHQgZnJvbSBhIGBTZXNzaW9uU3VtbWFyeUNoYW5nZWRgIG5vdGlmaWNhdGlvbi5cblx0ICogUmV0dXJucyBgdHJ1ZWAgaWZmIHRoZSBhY3Rpdml0eSBvYnNlcnZhYmxlIGNoYW5nZWQuIENhbGxlcnMgaW5zaWRlIGFcblx0ICogdHJhbnNhY3Rpb24gTVVTVCBwYXNzIGl0IFx1MjAxNCBzZWUge0BsaW5rIHNldENoYW5nZXNTdW1tYXJ5fS5cblx0ICovXG5cdHNldEFjdGl2aXR5KGFjdGl2aXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIHR4PzogSVRyYW5zYWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2aXR5LmdldCgpICE9PSBhY3Rpdml0eSkge1xuXHRcdFx0dGhpcy5fYWN0aXZpdHkuc2V0KGFjdGl2aXR5LCB0eCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYSBgX21ldGFgIGRlbHRhICh0aGUgc2hhcmVkIHNlc3Npb24tc3RhdGUgLyBzZXNzaW9uLXN1bW1hcnkgYmFnLFxuXHQgKiBmZWQgZnJvbSBgX2FwcGx5U2Vzc2lvbk1ldGFGcm9tU3RhdGVgIG9yIGEgYFNlc3Npb25TdW1tYXJ5Q2hhbmdlZGBcblx0ICogbm90aWZpY2F0aW9uKSwgcHJvbW90ZSB0aGUgc2Vzc2lvbiBraW5kIGlmIHRoZSBkZWx0YSByZXBvcnRzIGl0XG5cdCAqIHdvcmtzcGFjZS1sZXNzLCBhbmQgcmVidWlsZCB0aGUgd29ya3NwYWNlIGlmIHRoZSBnaXQgc3RhdGUgY2hhbmdlZC5cblx0ICogUmV0dXJucyBgdHJ1ZWAgaWZmIGFueXRoaW5nIG9ic2VydmFibGUgY2hhbmdlZCwgc28gdGhlIGxpc3QgcmVncm91cHMgYVxuXHQgKiBzZXNzaW9uIHRoYXQgYmVjYW1lIGEgcXVpY2sgY2hhdCB3aXRob3V0IGV2ZXIgaGF2aW5nIGhhZCBhIHdvcmtzcGFjZS5cblx0ICpcblx0ICogQ2FsbGVycyB0aGF0IGFyZSBhbHJlYWR5IGluc2lkZSBhIHRyYW5zYWN0aW9uIE1VU1QgcGFzcyBpdDogYSBwbGFpblxuXHQgKiBgdHJhbnNhY3Rpb24oKWAgaGVyZSB3b3VsZCBmaW5pc2ggKGFuZCB0aGVyZWZvcmUgbm90aWZ5KSBtaWQtd2F5IHRocm91Z2hcblx0ICogdGhlIGVuY2xvc2luZyBvbmUsIGxldHRpbmcgb2JzZXJ2ZXJzIG9mIGBfbWV0YWAgLyBgaXNRdWlja0NoYXRgIC9cblx0ICogYHdvcmtzcGFjZWAgcmVhZCBhIHRvcm4gc25hcHNob3Qgb2YgdGhlIGZpZWxkcyB0aGUgY2FsbGVyIGhhcyBub3QgYXBwbGllZFxuXHQgKiB5ZXQuXG5cdCAqL1xuXHRzZXRNZXRhKG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkLCB0eD86IElUcmFuc2FjdGlvbik6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX21ldGEgPSBtZXRhO1xuXHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblx0XHRzdWJ0cmFuc2FjdGlvbih0eCwgdHggPT4ge1xuXHRcdFx0dGhpcy5fbWV0YU9icy5zZXQodGhpcy5fbWV0YSwgdHgpO1xuXHRcdFx0ZGlkQ2hhbmdlID0gdGhpcy5fcHJvbW90ZVRvUXVpY2tDaGF0SWZXb3Jrc3BhY2VsZXNzKHR4KTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2UoKTtcblx0XHRcdGlmICh0aGlzLl9zZXRXb3Jrc3BhY2Uod29ya3NwYWNlLCB0eCkpIHtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gZGlkQ2hhbmdlO1xuXHR9XG5cblx0cmVmcmVzaFdvcmtzcGFjZSgpOiBib29sZWFuIHtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0ZGlkQ2hhbmdlID0gdGhpcy5fc2V0V29ya3NwYWNlKHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2UoKSwgdHgpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBkaWRDaGFuZ2U7XG5cdH1cblxuXHRzZXRJc0F1dG9tYXRpb24oaXNBdXRvbWF0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pc0F1dG9tYXRpb24uc2V0KGlzQXV0b21hdGlvbiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKiBSZWNvcmRzIHRoYXQgdGhpcyBzZXNzaW9uIHJ1bnMgd2l0aCB3b3JrdHJlZSBpc29sYXRpb24uIFNlZSB7QGxpbmsgd29ya3RyZWVQZW5kaW5nfS4gKi9cblx0c2V0V29ya3RyZWVJc29sYXRpb24oaXNvbGF0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrdHJlZUlzb2xhdGlvbi5zZXQoaXNvbGF0ZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogSGVhbCBhbiBhZGFwdGVyIGJvcm4gbWlzLWNsYXNzaWZpZWQgYmVjYXVzZSB0aGUgcGF0aCB0aGF0IG1hdGVyaWFsaXplZCBpdFxuXHQgKiBjYXJyaWVkIG5vIGBfbWV0YWAgKGEgc3RhbGUgcGVyc2lzdGVkIGNhY2hlLCBhbiBvbGRlciBob3N0KS4gT25lLXdheTogYW5cblx0ICogYWJzZW50IG1hcmtlciBtZWFucyBcIm5vdCBpbmNsdWRlZFwiLCBuZXZlciBcImNsZWFyZWRcIiwgc28gYSBxdWljayBjaGF0IGlzXG5cdCAqIG5ldmVyIGRlbW90ZWQgYmFjayBpbnRvIGEgd29ya3NwYWNlIHNlc3Npb24gcm9vdGVkIGF0IGl0cyBzY3JhdGNoIGN3ZC5cblx0ICovXG5cdHByaXZhdGUgX3Byb21vdGVUb1F1aWNrQ2hhdElmV29ya3NwYWNlbGVzcyh0eDogSVRyYW5zYWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzUXVpY2tDaGF0LmdldCgpIHx8ICFyZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3ModGhpcy5fbWV0YSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5faXNRdWlja0NoYXQuc2V0KHRydWUsIHR4KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbidzIHByb2plY3QuIFJlYWQgYXQgcGVyc2lzdCB0aW1lIHNvIGEgdmFsdWUgYXNzaWduZWQgYWZ0ZXIgdGhlIHNuYXBzaG90IHdhcyB0YWtlblxuXHQgKiBpcyBub3QgbG9zdCBvbiB0aGUgbmV4dCBzYXZlLlxuXHQgKi9cblx0Z2V0IHByb2plY3QoKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10geyByZXR1cm4gdGhpcy5fcHJvamVjdDsgfVxuXG5cdC8qKlxuXHQgKiBBc3NpZ24gYSBwcm9qZWN0IHRvIGEgc2Vzc2lvbiB0aGF0IHdhcyBtYXRlcmlhbGl6ZWQgd2l0aG91dCBvbmUsIHJlY29tcHV0aW5nIHRoZSB3b3Jrc3BhY2UuXG5cdCAqIFJlZnVzZXMgd2hlbiB0aGUgc2Vzc2lvbiBhbHJlYWR5IGhhcyBhIHByb2plY3QuXG5cdCAqXG5cdCAqIE5hcnJvd2VyIHRoYW4ge0BsaW5rIHVwZGF0ZX0sIHdoaWNoIGFsc28gYXNzaWducyBgX3dvcmtpbmdEaXJlY3Rvcmllc2AgYW5kIHdvdWxkIGNsZWFyIHJlYWxcblx0ICogd29ya2luZyBkaXJlY3RvcmllcywgcmV2ZXJ0IGEgcmVuYW1lZCB0aXRsZSwgYW5kIHJvbGwgYmFjayB0aGUgbW9kaWZpZWQgdGltZS5cblx0ICovXG5cdGJhY2tmaWxsUHJvamVjdChwcm9qZWN0OiBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbJ3Byb2plY3QnXSk6IGJvb2xlYW4ge1xuXHRcdGlmICghcHJvamVjdCB8fCB0aGlzLl9wcm9qZWN0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb2plY3QgPSBwcm9qZWN0O1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3NldFdvcmtzcGFjZSh0aGlzLl9jb21wdXRlV29ya3NwYWNlKCksIHR4KTtcblx0XHR9KTtcblx0XHQvLyBSZXBvcnRzIHRoZSBtZXRhZGF0YSBtdXRhdGlvbiwgbm90IHdoZXRoZXIgdGhlIHdvcmtzcGFjZSBoYXBwZW5lZCB0byBjaGFuZ2U6IHRoZSBjYWxsZXJcblx0XHQvLyBhbm5vdW5jZXMgdGhpcyB0byBtYXJrIHRoZSBzZXNzaW9uIGNhY2hlIGRpcnR5LCBhbmQgYSBwcm9qZWN0IGFzc2lnbmVkIGJ1dCBuZXZlclxuXHRcdC8vIHBlcnNpc3RlZCB3b3VsZCBiZSBsb3N0IG9uIHJlbG9hZC5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFdvcmtzcGFjZSh3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkLCB0eDogSVRyYW5zYWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGFnZW50SG9zdFNlc3Npb25Xb3Jrc3BhY2VLZXkod29ya3NwYWNlKSA9PT0gYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZUtleSh0aGlzLndvcmtzcGFjZS5nZXQoKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbk91dHB1dENhY2hlLmNsZWFyKCk7XG5cdFx0dGhpcy53b3Jrc3BhY2Uuc2V0KHdvcmtzcGFjZSwgdHgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBzZXNzaW9uIHdvcmtzcGFjZS4gUXVpY2sgY2hhdHMgc3RheSB3b3Jrc3BhY2UtbGVzc1xuXHQgKiAoYHVuZGVmaW5lZGApIHJlZ2FyZGxlc3Mgb2YgYW55IHNjcmF0Y2ggd29ya2luZyBkaXJlY3RvcnkgdGhlIGhvc3Rcblx0ICogYXNzaWduZWQ7IHdvcmtzcGFjZSBzZXNzaW9ucyBidWlsZCBmcm9tIHByb2plY3QvZ2l0IG1ldGFkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29tcHV0ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2tpbmQuY29tcHV0ZVdvcmtzcGFjZSgoKSA9PiB0aGlzLl9vcHRpb25zLmJ1aWxkV29ya3NwYWNlKHRoaXMuX3Byb2plY3QsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcmllcywgdGhpcy5naXRIdWJJbmZvLCByZWFkU2Vzc2lvbkdpdFN0YXRlKHRoaXMuX21ldGEpKSk7XG5cdH1cblxuXHR1cGRhdGVDaGFuZ2VzZXRzKGNoYW5nZXNldHNNZXRhZGF0YTogcmVhZG9ubHkgQ2hhbmdlc2V0W10gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWNoYW5nZXNldHNNZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBjcmVhdGVDaGFuZ2VzZXRzKHRoaXMuYmFja2VuZFVyaSwgdGhpcy5fb3B0aW9ucywgdGhpcy5pc0FjdGl2ZVNlc3Npb25PYnMsIGNoYW5nZXNldHNNZXRhZGF0YSk7XG5cblx0XHR0aGlzLmNoYW5nZXNldHMuc2V0KGNoYW5nZXNldHMsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuLyoqXG4gKiBga2luZGAgbGl0ZXJhbCB1c2VkIG9uIGBJU2Vzc2lvbi5tb2RlYCB3aGVuIHRoZSBtb2RlIHNsb3QgY2FycmllcyBhXG4gKiBjdXN0b20tYWdlbnQgc2VsZWN0aW9uLiBUaGUgYG1vZGUuaWRgIGlzIHRoZW4gdGhlIGFnZW50J3MgVVJJLlxuICovXG5leHBvcnQgY29uc3QgQUdFTlRfTU9ERV9LSU5EID0gJ2FnZW50JztcblxuZnVuY3Rpb24gY3VzdG9taXphdGlvbnNDaGFuZ2VkKHByZXZpb3VzOiBTZXNzaW9uU3RhdGUsIHN0YXRlOiBTZXNzaW9uU3RhdGUpOiBib29sZWFuIHtcblx0aWYgKHByZXZpb3VzLmN1c3RvbWl6YXRpb25zICE9PSBzdGF0ZS5jdXN0b21pemF0aW9ucykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IHByZXZpb3VzQWN0aXZlQ3VzdG9taXphdGlvbnMgPSBmbGF0dGVuQWN0aXZlQ2xpZW50Q3VzdG9taXphdGlvbnMocHJldmlvdXMpO1xuXHRjb25zdCBjdXJyZW50QWN0aXZlQ3VzdG9taXphdGlvbnMgPSBmbGF0dGVuQWN0aXZlQ2xpZW50Q3VzdG9taXphdGlvbnMoc3RhdGUpO1xuXHRyZXR1cm4gIWFycmF5RXF1YWxzKHByZXZpb3VzQWN0aXZlQ3VzdG9taXphdGlvbnMsIGN1cnJlbnRBY3RpdmVDdXN0b21pemF0aW9ucywgKGEsIGIpID0+IHtcblx0XHRpZiAoYS5ub25jZSAhPT0gdW5kZWZpbmVkICYmIGEubm9uY2UgPT09IGIubm9uY2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gYSA9PT0gYjtcblx0fSk7XG59XG5cbi8qKiBGbGF0dGVucyB0aGUgY3VzdG9taXphdGlvbnMgY29udHJpYnV0ZWQgYnkgZXZlcnkgYWN0aXZlIGNsaWVudCBvZiBhIHNlc3Npb24uICovXG5mdW5jdGlvbiBmbGF0dGVuQWN0aXZlQ2xpZW50Q3VzdG9taXphdGlvbnMoc3RhdGU6IFNlc3Npb25TdGF0ZSk6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSB7XG5cdGNvbnN0IHJlc3VsdDogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdID0gW107XG5cdGZvciAoY29uc3QgY2xpZW50IG9mIHN0YXRlLmFjdGl2ZUNsaWVudHMpIHtcblx0XHRpZiAoY2xpZW50LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5jbGllbnQuY3VzdG9taXphdGlvbnMpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBOZXdTZXNzaW9uIFx1MjAxNCBidW5kbGVzIHRoZSBpbi1mbGlnaHQgbmV3LXNlc3Npb24gc3RhdGVcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBJbnB1dHMgbmVlZGVkIHRvIGNvbnN0cnVjdCBhIHtAbGluayBOZXdTZXNzaW9ufS5cbiAqL1xuaW50ZXJmYWNlIElOZXdTZXNzaW9uQ29uc3RydWN0aW9uQ29udGV4dCB7XG5cdC8qKlxuXHQgKiBXb3Jrc3BhY2UgdGhlIHNlc3Npb24gaXMgc2NvcGVkIHRvLCBvciBgdW5kZWZpbmVkYCBmb3IgYSAqKnF1aWNrIGNoYXQqKlxuXHQgKiAoYSB3b3Jrc3BhY2UtbGVzcyBzZXNzaW9uIG5vdCBib3VuZCB0byBhbnkgZm9sZGVyKS4gV2hlbiBgdW5kZWZpbmVkYCxcblx0ICoge0BsaW5rIHF1aWNrQ2hhdH0gbXVzdCBiZSBgdHJ1ZWAgYW5kIHRoZSBiYWNrZW5kIHNlc3Npb24gaXMgY3JlYXRlZCB3aXRoXG5cdCAqIG5vIGB3b3JraW5nRGlyZWN0b3J5YCAodGhlIGhvc3QgYXNzaWducyBhIHRocm93YXdheSBzY3JhdGNoIGN3ZCkuXG5cdCAqL1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogYHRydWVgIHdoZW4gdGhpcyBpcyBhIHF1aWNrIGNoYXQgKHNlZSB7QGxpbmsgd29ya3NwYWNlfSkuIEZvcndhcmRlZCB0byB0aGVcblx0ICogYWdlbnQgaG9zdCBvbiBgY3JlYXRlU2Vzc2lvbmAgc28gdGhlIHNlc3Npb24gaXMgdGFnZ2VkIGFuZCByb3V0ZWQgYXNcblx0ICogd29ya3NwYWNlLWxlc3MuXG5cdCAqL1xuXHRyZWFkb25seSBxdWlja0NoYXQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlO1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgcmVzb3VyY2VTY2hlbWU6IHN0cmluZztcblx0LyoqXG5cdCAqIFRoZSBVUkkgc2NoZW1lIHVzZWQgdG8gcmVjb25zdHJ1Y3QgdGhpcyBkcmFmdCdzIGJhY2tlbmQgKHdpcmUpIHNlc3Npb24gVVJJLFxuXHQgKiB3aGVuIGl0IGRpZmZlcnMgZnJvbSB0aGUgYWdlbnQgcHJvdmlkZXIgKHtAbGluayBzZXNzaW9uVHlwZX0uaWQpLiBEZWZhdWx0cyB0b1xuXHQgKiB0aGUgYWdlbnQgcHJvdmlkZXIuIENsb3VkIHNhbmRib3ggY3JlYXRlcyBzZXNzaW9ucyB1bmRlciBgYWhwLXNlc3Npb246LzxpZD5gXG5cdCAqIHdoaWxlIHRoZSBhZ2VudCBwcm92aWRlciBpcyBgY29waWxvdGA7IHRoZSBlYWdlciBiYWNrZW5kIGBjcmVhdGVTZXNzaW9uYC9cblx0ICogc3Vic2NyaWJlIG11c3QgdXNlIHRoaXMgc2NoZW1lIHNvIGl0IG1hdGNoZXMgdGhlIGhhbmRsZXIncyBjcmVhdGUgcGF0aC5cblx0ICovXG5cdHJlYWRvbmx5IGJhY2tlbmRTZXNzaW9uU2NoZW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBhdXRoZW50aWNhdGlvblBlbmRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGluaXRpYWwgY29uZmlnIHZhbHVlcyB0byBzZWVkIGludG8gdGhlIG5ldyBzZXNzaW9uIGJlZm9yZSBpdHNcblx0ICogZmlyc3Qge0BsaW5rIE5ld1Nlc3Npb24ucmVzb2x2ZUNvbmZpZ30gcm91bmQtdHJpcC4gVXNlZCB0byBmb3J3YXJkXG5cdCAqIGBjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHRgIGludG8gdGhlIGFnZW50IGhvc3QncyBgYXV0b0FwcHJvdmVgIHNsb3QgYW5kXG5cdCAqIGBnaXQuYnJhbmNoUHJlZml4YCBpbnRvIHRoZSBgd29ya3RyZWVCcmFuY2hQcmVmaXhgIHNsb3Qgc28gdGhlIHZhbHVlcyBhcmVcblx0ICogcHJlc2VudCBmcm9tIHRoZSB2ZXJ5IGZpcnN0IGByZXNvbHZlQ29uZmlnYC9gY3JlYXRlU2Vzc2lvbmAuXG5cdCAqL1xuXHRyZWFkb25seSBpbml0aWFsQ29uZmlnVmFsdWVzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBwcm9wZXJ0eSBzY2hlbWFzIHRvIHNlZWQgaW50byB0aGUgbmV3IHNlc3Npb24ncyBjb25maWcgYmVmb3JlIGl0c1xuXHQgKiBmaXJzdCB7QGxpbmsgTmV3U2Vzc2lvbi5yZXNvbHZlQ29uZmlnfSByb3VuZC10cmlwLiBDYXJyaWVkIG92ZXIgZnJvbSB0aGVcblx0ICogcHJvdmlkZXIncyBjYWNoZSBvZiB3ZWxsLWtub3duIGNoaXBzIChpc29sYXRpb24vYnJhbmNoKSBzbyB0aG9zZSBjaGlwcyBzdGF5XG5cdCAqIHZpc2libGUgKGRpc2FibGVkKSB3aGlsZSB0aGUgZHJhZnQgcmUtcmVzb2x2ZXMsIGluc3RlYWQgb2YgYmxhbmtpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBpbml0aWFsQ29uZmlnU2NoZW1hPzogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPjtcblx0cmVhZG9ubHkgaW5pdGlhbE1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdC8qKlxuXHQgKiBJbnN0YW50aWF0aW9uIHNlcnZpY2UgdXNlZCB0byBjb25zdHJ1Y3QgdGhlIHNlc3Npb24ncyBjaGFuZ2VzZXRcblx0ICogcmVzb2x2ZXJzLCBzbyB0aGUgbmV3LXNlc3Npb24gc2tlbGV0b24gc3VyZmFjZXMgdGhlIHNhbWUgY2hhbmdlc2V0XG5cdCAqIGxpc3QgYXMgdGhlIGNvbW1pdHRlZCBzZXNzaW9uIHRoYXQgcmVwbGFjZXMgaXQuXG5cdCAqL1xuXHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHQvKipcblx0ICogRm9yd2FyZHMgYFNlc3Npb25TdGF0ZWAgc25hcHNob3RzIGZyb20gdGhlIGVhZ2VybHktaGVsZCB3aXJlXG5cdCAqIHN1YnNjcmlwdGlvbiBiYWNrIHRvIHRoZSBwcm92aWRlci4gYHN0YXRlID09PSB1bmRlZmluZWRgIGlzIGFcblx0ICogY2xlYW51cCBzZW50aW5lbCBlbWl0dGVkIGJ5IHtAbGluayBOZXdTZXNzaW9uLmRpc3Bvc2V9IG9uIHRoZVxuXHQgKiBjbG9zZS13aXRob3V0LWdyYWR1YXRpb24gcGF0aCBzbyB0aGUgcHJvdmlkZXIgY2FuIGRyb3AgYW55IGNhY2hlZFxuXHQgKiBlbnRyeSBpdCBhY2N1bXVsYXRlZCBmb3IgdGhpcyBzZXNzaW9uLiBUaGUgZ3JhZHVhdGlvbiBwYXRoIHNraXBzXG5cdCAqIHRoaXMgc2VudGluZWwgYmVjYXVzZSB0aGUgcnVubmluZy1zZXNzaW9uIHN1YnNjcmlwdGlvbiBwaXBlbGluZVxuXHQgKiB0YWtlcyBvdmVyIG93bmVyc2hpcCBvZiB0aGUgc2FtZSBgc2Vzc2lvbklkYCBrZXkuXG5cdCAqL1xuXHRyZWFkb25seSBvblNlc3Npb25TdGF0ZT86IChzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgYWN0aXZlQ2xpZW50U2NvcGU/OiBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGU7XG59XG5cbi8qKlxuICogQnVuZGxlcyB0aGUgYXQtbW9zdC1vbmUgaW4tZmxpZ2h0IFwibmV3IHNlc3Npb25cIiBcdTIwMTQgdGhlIHNlc3Npb24gYmVpbmdcbiAqIGNvbXBvc2VkIGluIHRoZSBuZXctY2hhdCB2aWV3IGJlZm9yZSB0aGUgZmlyc3QgbWVzc2FnZSBpcyBzZW50LlxuICpcbiAqIEVuY2Fwc3VsYXRlczpcbiAqICAtIHRoZSBgSVNlc3Npb25gIHNrZWxldG9uICsgaXRzIG9ic2VydmFibGVzIChzdGF0dXMsIG1vZGVsSWQsIGxvYWRpbmcpXG4gKiAgLSB0aGUgdXNlcidzIHNlbGVjdGVkIG1vZGVsIChyZWFkIGJ5IGBzZW5kUmVxdWVzdGApXG4gKiAgLSB0aGUgcmVzb2x2ZWQgc2Vzc2lvbiBjb25maWcgKyBhIHN0YWxlLXJlcXVlc3QgZ3VhcmRcbiAqICAtIHRoZSBlYWdlcmx5IGNyZWF0ZWQgYmFja2VuZCBzZXNzaW9uIChVUkkgKyBzdWJzY3JpcHRpb24pIHRoYXQgbGV0cyB0aGVcbiAqICAgIGNoYXQgaGFuZGxlciBza2lwIGl0cyBsZWdhY3kgYGNyZWF0ZVNlc3Npb25gLW9uLWZpcnN0LW1lc3NhZ2Ugcm91bmQtdHJpcFxuICpcbiAqIExpZmVjeWNsZTpcbiAqICAtIHtAbGluayBlYWdlckNyZWF0ZX0gZmlyZXMgYGNvbm5lY3Rpb24uY3JlYXRlU2Vzc2lvbmAgdGhlbiBvcGVucyBhIHN0YXRlXG4gKiAgICBzdWJzY3JpcHRpb24uIFdpcmUgb3JkZXJpbmcgbWF0dGVycyBcdTIwMTQgc2VlIHRoZSBjb21tZW50IGluIHRoZSBib2R5LlxuICogIC0ge0BsaW5rIGdyYWR1YXRlfSByZWxlYXNlcyB0aGUgc3Vic2NyaXB0aW9uIHdpdGhvdXQgZmlyaW5nXG4gKiAgICBgZGlzcG9zZVNlc3Npb25gOyBjYWxsZWQgd2hlbiB0aGUgc2Vzc2lvbiBzdWNjZXNzZnVsbHkgdHJhbnNpdGlvbnMgaW50b1xuICogICAgYSByZWFsIHJ1bm5pbmcgc2Vzc2lvbiB2aWEgYHNlbmRSZXF1ZXN0YC5cbiAqICAtIHtAbGluayBEaXNwb3NhYmxlLmRpc3Bvc2V9L2BkaXNwb3NlYCByZWxlYXNlcyB0aGUgc3Vic2NyaXB0aW9uICoqYW5kKipcbiAqICAgIGZpcmVzIGBjb25uZWN0aW9uLmRpc3Bvc2VTZXNzaW9uYDsgY2FsbGVkIHdoZW4gdGhlIHVzZXIgYWJhbmRvbnMgdGhlXG4gKiAgICBuZXcgc2Vzc2lvbiAod29ya3NwYWNlIHN3aXRjaCwgc2VuZCBmYWlsdXJlLCBldGMuKS5cbiAqL1xuY2xhc3MgTmV3U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IHNlc3Npb246IElTZXNzaW9uO1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgYWdlbnRQcm92aWRlcjogc3RyaW5nO1xuXHQvKiogVGhpcyBkcmFmdCdzIFVSSSBhcyB0aGUgaG9zdCdzIHJlZ2lzdHJ5IHdvdWxkIGtleSBpdC4gU2VlIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlci5iYWNrZW5kVXJpfS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmFja2VuZFNlc3Npb25Vcmk6IFVSSTtcblx0cmVhZG9ubHkgd29ya3NwYWNlVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGJvb2xlYW47XG5cdC8qKiBgdHJ1ZWAgd2hlbiB0aGlzIGlzIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdC4gKi9cblx0cmVhZG9ubHkgaXNRdWlja0NoYXQ6IGJvb2xlYW47XG5cdC8qKiBTZXNzaW9uLWtpbmQgc3RyYXRlZ3kgY2hvc2VuIG9uY2UgYXQgY29uc3RydWN0aW9uIChxdWljayBjaGF0IHZzLiB3b3Jrc3BhY2UpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9raW5kOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzOiBJU2V0dGFibGVPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbElkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8eyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBraW5kOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3RyZWVQZW5kaW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVzY3JpcHRpb246IElTZXR0YWJsZU9ic2VydmFibGU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZGluZzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXHRwcml2YXRlIF9zZWxlY3RlZE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VsZWN0ZWRBZ2VudDogSVNlc3Npb25BZ2VudFJlZiB8IHVuZGVmaW5lZDtcblxuXHRvYnNlcnZlQ2xpZW50Q3VzdG9tQWdlbnRzKGN1c3RvbUFnZW50czogSU9ic2VydmFibGU8cmVhZG9ubHkgQWdlbnRDdXN0b21pemF0aW9uW10+LCBvbkRpZENoYW5nZTogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGxldCBwcmV2aW91cyA9IGN1c3RvbUFnZW50cy5nZXQoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gY3VzdG9tQWdlbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjdXJyZW50ID09PSBwcmV2aW91cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91cyA9IGN1cnJlbnQ7XG5cdFx0XHRvbkRpZENoYW5nZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldENsaWVudEN1c3RvbUFnZW50cygpOiByZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUNsaWVudFNjb3BlPy5jdXN0b21BZ2VudHMuZ2V0KCkgPz8gW107XG5cdH1cblxuXHQvKipcblx0ICogTGF0ZXN0IHJlc29sdmVkIGNvbmZpZy4gUmVwbGFjZXMgd2hhdCB1c2VkIHRvIGxpdmUgaW4gYF9uZXdTZXNzaW9uQ29uZmlnc2AuXG5cdCAqIGB1bmRlZmluZWRgIGluZGljYXRlcyB0aGUgbW9zdCByZWNlbnQge0BsaW5rIHJlc29sdmVDb25maWd9IGZhaWxlZCBhbmQgbm9cblx0ICogY2FjaGVkIHZhbHVlcyBhcmUgdXNhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29uZmlnOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCA9IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH07XG5cdHByaXZhdGUgX2NvbmZpZ1Jlc29sdXRpb246IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIE1vbm90b25pYyBjb3VudGVyIGZvciBpbi1mbGlnaHQge0BsaW5rIHJlc29sdmVDb25maWd9IGNhbGxzLiBFYWNoIGNhbGxcblx0ICogaW5jcmVtZW50cyB0aGUgY291bnRlciBhbmQgb25seSB3cml0ZXMgaXRzIHJlc3VsdCBiYWNrIGlmIGl0cyBzZXF1ZW5jZVxuXHQgKiBpcyBzdGlsbCB0aGUgbGF0ZXN0IG9uZS4gQnVtcGVkIG9uIGRpc3Bvc2Ugc28gYW55IHBlbmRpbmcgcmVzb2x2ZVxuXHQgKiBkaXNjYXJkcyBpdHNlbGYuXG5cdCAqL1xuXHRwcml2YXRlIF9jb25maWdSZXF1ZXN0U2VxID0gMDtcblxuXHQvKipcblx0ICogYHRydWVgIHdoaWxlIGEgYHJlc29sdmVDb25maWdgIHJvdW5kLXRyaXAgaXMgaW4gZmxpZ2h0LiBEaXN0aW5jdCBmcm9tXG5cdCAqIHtAbGluayBJU2Vzc2lvbi5sb2FkaW5nfSB3aGljaCBhbHNvIHN0YXlzIHRydWUgd2hlbiByZXF1aXJlZCBjb25maWdcblx0ICogdmFsdWVzIGFyZSBtaXNzaW5nIFx1MjAxNCBwaWNrZXJzIGdhdGUgb24gdGhpcyBzbyB0aGV5IHN0YXkgaW50ZXJhY3RpdmVcblx0ICogaW4gdGhhdCBzdGF0ZS4gU2V0IHN5bmMgaW4ge0BsaW5rIGJlZ2luUmVzb2x2ZUNvbmZpZ1N5bmN9IHNvIHRoZVxuXHQgKiBvcHRpbWlzdGljIGBvbkRpZENoYW5nZVNlc3Npb25Db25maWdgIHB1bHNlIGFscmVhZHkgZXhwb3NlcyBpdC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUmVzb2x2aW5nQ29uZmlnOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saWZldGltZUN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0cHJpdmF0ZSBfZWFnZXJDcmVhdGVUYXNrOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBCYWNrZW5kIHNlc3Npb24gVVJJLCBzZXQgaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBlYWdlciBgY3JlYXRlU2Vzc2lvbmAgY2FsbC4gKi9cblx0cHJpdmF0ZSBfYmFja2VuZFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHQvKiogQ29ubmVjdGlvbiB1c2VkIHRvIGNyZWF0ZSB0aGUgYmFja2VuZCBzZXNzaW9uLCBjYXB0dXJlZCBmb3IgYGRpc3Bvc2VTZXNzaW9uYCBvbiB0ZWFyLWRvd24uICovXG5cdHByaXZhdGUgX2Nvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBIZWxkIHN0YXRlIHN1YnNjcmlwdGlvbi4gU2V0IGFmdGVyIHRoZSB3aXJlIGBjcmVhdGVTZXNzaW9uYCByZXNvbHZlcy4gKi9cblx0cHJpdmF0ZSBfc3Vic2NyaXB0aW9uOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+PiB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIGBvbkRpZENoYW5nZWAgbGlzdGVuZXIgZm9yIHtAbGluayBfc3Vic2NyaXB0aW9ufS4gRm9yd2FyZHMgZXZlcnlcblx0ICogYFNlc3Npb25TdGF0ZWAgc25hcHNob3QgdG8gdGhlIHByb3ZpZGVyIHZpYSB7QGxpbmsgX29uU2Vzc2lvblN0YXRlfVxuXHQgKiBzbyB0aGUgbmV3IHNlc3Npb24ncyBjdXN0b21pemF0aW9ucyAoYW5kIGFueSBvdGhlciBzdGF0ZSkgcmVhY2hcblx0ICogYF9sYXN0U2Vzc2lvblN0YXRlc2Agd2hpbGUgdGhlIHNlc3Npb24gaXMgc3RpbGwgVW50aXRsZWQuIERldGFjaGVkXG5cdCAqIGluIHtAbGluayBncmFkdWF0ZX0gKGhhbmRvZmYpIGFuZCB7QGxpbmsgZGlzcG9zZX0gKGNsb3NlLXdpdGhvdXQtc2VuZCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNlc3Npb25TdGF0ZTogKChzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2xpZW50U2NvcGU6IElBZ2VudEN1c3RvbWl6YXRpb25TY29wZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbE1ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJJZDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGN0eDogSU5ld1Nlc3Npb25Db25zdHJ1Y3Rpb25Db250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0XHRASVNlc3Npb25zU2VydmljZSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gY3R4LndvcmtzcGFjZT8uZm9sZGVyc1swXT8ucm9vdDtcblx0XHR0aGlzLl9raW5kID0gc2Vzc2lvbktpbmQoISFjdHgucXVpY2tDaGF0KTtcblx0XHRpZiAodGhpcy5fa2luZC5yZXF1aXJlc1dvcmtzcGFjZSAmJiAhd29ya3NwYWNlVXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZSBoYXMgbm8gcmVwb3NpdG9yeSBVUkknKTtcblx0XHR9XG5cdFx0dGhpcy53b3Jrc3BhY2VVcmkgPSB3b3Jrc3BhY2VVcmk7XG5cdFx0dGhpcy5pc1F1aWNrQ2hhdCA9IHRoaXMuX2tpbmQuaXNRdWlja0NoYXQ7XG5cdFx0dGhpcy5yZXF1aXJlc1dvcmtzcGFjZVRydXN0ID0gISFjdHgud29ya3NwYWNlPy5yZXF1aXJlc1dvcmtzcGFjZVRydXN0O1xuXHRcdHRoaXMuYWdlbnRQcm92aWRlciA9IGN0eC5zZXNzaW9uVHlwZS5pZDtcblx0XHR0aGlzLl9wcm92aWRlcklkID0gY3R4LnByb3ZpZGVySWQ7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGN0eC5sb2dTZXJ2aWNlO1xuXHRcdHRoaXMuX29uU2Vzc2lvblN0YXRlID0gY3R4Lm9uU2Vzc2lvblN0YXRlO1xuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudFNjb3BlID0gY3R4LmFjdGl2ZUNsaWVudFNjb3BlO1xuXHRcdGlmICh0aGlzLl9hY3RpdmVDbGllbnRTY29wZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWN0aXZlQ2xpZW50U2NvcGUpO1xuXHRcdH1cblx0XHR0aGlzLl9pbml0aWFsTWV0YWRhdGEgPSBjdHguaW5pdGlhbE1ldGFkYXRhO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogY3R4LnJlc291cmNlU2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcblx0XHR0aGlzLl9pc0FjdGl2ZVNlc3Npb25PYnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBpc0VxdWFsKHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKT8ucmVzb3VyY2UsIHJlc291cmNlKSk7XG5cdFx0Ly8gRGVmYXVsdHMgdG8gc2NoZW1lID09IHByb3ZpZGVyOyBvbmx5IGhvc3RzIHRoYXQgYWRkcmVzcyBzZXNzaW9ucyB1bmRlciBhIGRpZmZlcmVudFxuXHRcdC8vIHNjaGVtZSAoY2xvdWQgc2FuZGJveDogcHJvdmlkZXIgYGNvcGlsb3RgLCBzY2hlbWUgYGFocC1zZXNzaW9uYCkgb3ZlcnJpZGUgaXQuXG5cdFx0dGhpcy5fYmFja2VuZFNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKGN0eC5iYWNrZW5kU2Vzc2lvblNjaGVtZSA/PyB0aGlzLmFnZW50UHJvdmlkZXIsIEFnZW50U2Vzc2lvbi5pZChyZXNvdXJjZSkpO1xuXHRcdHRoaXMuX3N0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPih0aGlzLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHR0aGlzLl90aXRsZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmc+KHRoaXMsICcnKTtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuX3RpdGxlO1xuXHRcdGNvbnN0IHVwZGF0ZWRBdCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBuZXcgRGF0ZSgpKTtcblx0XHR0aGlzLl93b3Jrc3BhY2UgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+KHRoaXMsIGN0eC53b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHJlYWRvbmx5IChJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlIHwgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIpW10+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbCB9LCBbXSk7XG5cdFx0Y29uc3QgY2hlY2twb2ludHMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zZWxlY3RlZE1vZGVsSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2VsZWN0ZWRBZ2VudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tb2RlbElkID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdGhpcy5fc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRjb25zdCBtb2RlID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbW9kZSA9IG1vZGU7XG5cdFx0Y29uc3QgaXNBcmNoaXZlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdFx0Y29uc3QgaXNSZWFkID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRydWUpO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBsYXN0VHVybkVuZCA9IG9ic2VydmFibGVWYWx1ZTxEYXRlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2xvYWRpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdHJ1ZSk7XG5cdFx0dGhpcy5faXNSZXNvbHZpbmdDb25maWcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRcdGNvbnN0IGNyZWF0ZWRBdCA9IG5ldyBEYXRlKCk7XG5cblx0XHRjb25zdCBtYWluQ2hhdDogSUNoYXQgPSB7XG5cdFx0XHRyZXNvdXJjZSwgY3JlYXRlZEF0LCB0aXRsZSwgdXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiB0aGlzLl9zdGF0dXMsXG5cdFx0XHRjaGFuZ2VzLFxuXHRcdFx0Y2hlY2twb2ludHMsXG5cdFx0XHRtb2RlbElkOiB0aGlzLl9tb2RlbElkLFxuXHRcdFx0bW9kZSwgaXNBcmNoaXZlZCwgaXNSZWFkLFxuXHRcdFx0aW50ZXJhY3Rpdml0eTogY29uc3RPYnNlcnZhYmxlKENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2Rlc2NyaXB0aW9uLCBsYXN0VHVybkVuZCxcblx0XHR9O1xuXHRcdHRoaXMuX21haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBtYWluQ2hhdCk7XG5cdFx0Y29uc3QgYXV0aFBlbmRpbmcgPSBjdHguYXV0aGVudGljYXRpb25QZW5kaW5nO1xuXHRcdGNvbnN0IGxvYWRpbmcgPSB0aGlzLl9sb2FkaW5nO1xuXHRcdGNvbnN0IGNoYXRzID0gdGhpcy5fbWFpbkNoYXQubWFwKGMgPT4gW2NdKTtcblx0XHR0aGlzLnNlc3Npb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6IGAke2N0eC5wcm92aWRlcklkfToke3Jlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0cHJvdmlkZXJJZDogY3R4LnByb3ZpZGVySWQsXG5cdFx0XHRzZXNzaW9uVHlwZTogY3R4LnNlc3Npb25UeXBlLmlkLFxuXHRcdFx0aWNvbjogY3R4Lmljb24sXG5cdFx0XHRjcmVhdGVkQXQsXG5cdFx0XHR3b3Jrc3BhY2U6IHRoaXMuX3dvcmtzcGFjZSxcblx0XHRcdGlzUXVpY2tDaGF0OiBjb25zdE9ic2VydmFibGUodGhpcy5fa2luZC5pc1F1aWNrQ2hhdCksXG5cdFx0XHR3b3JrdHJlZVBlbmRpbmc6IHRoaXMuX3dvcmt0cmVlUGVuZGluZyxcblx0XHRcdHRpdGxlLFxuXHRcdFx0dXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiB0aGlzLl9zdGF0dXMsXG5cdFx0XHRjaGFuZ2VzZXRzOiB0aGlzLl9jaGFuZ2VzZXRzLFxuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdG1vZGVsSWQ6IHRoaXMuX21vZGVsSWQsXG5cdFx0XHRtb2RlLFxuXHRcdFx0bG9hZGluZzogZGVyaXZlZChyZWFkZXIgPT4gbG9hZGluZy5yZWFkKHJlYWRlcikgfHwgYXV0aFBlbmRpbmcucmVhZChyZWFkZXIpKSxcblx0XHRcdGlzQXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fZGVzY3JpcHRpb24sXG5cdFx0XHRsYXN0VHVybkVuZCxcblx0XHRcdG1haW5DaGF0OiB0aGlzLl9tYWluQ2hhdCxcblx0XHRcdGNoYXRzLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlLCBzdXBwb3J0c1JlbmFtZTogdHJ1ZSwgc3VwcG9ydHNEZWxldGU6IHRydWUgfSksXG5cdFx0fTtcblx0XHR0aGlzLnNlc3Npb25JZCA9IHRoaXMuc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cblx0XHRpZiAoY3R4LmluaXRpYWxDb25maWdWYWx1ZXMgfHwgY3R4LmluaXRpYWxDb25maWdTY2hlbWEpIHtcblx0XHRcdHRoaXMuX2NvbmZpZyA9IHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IC4uLmN0eC5pbml0aWFsQ29uZmlnU2NoZW1hIH0gfSxcblx0XHRcdFx0dmFsdWVzOiB7IC4uLmN0eC5pbml0aWFsQ29uZmlnVmFsdWVzIH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0aGlzLl9zeW5jV29ya3RyZWVQZW5kaW5nKCk7XG5cdH1cblxuXHQvKiogUmUtcmVhZHMgdGhlIGlzb2xhdGlvbiBwaWNrIGZyb20gdGhlIGNhY2hlZCBjb25maWcgaW50byB7QGxpbmsgX3dvcmt0cmVlUGVuZGluZ30uICovXG5cdHByaXZhdGUgX3N5bmNXb3JrdHJlZVBlbmRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3RyZWVQZW5kaW5nLnNldChpc1dvcmt0cmVlSXNvbGF0aW9uKHRoaXMuX2NvbmZpZz8udmFsdWVzKSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tIFBpY2tlciBtdXRhdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHNldFNlbGVjdGVkTW9kZWxJZChtb2RlbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZE1vZGVsSWQgPSBtb2RlbElkO1xuXHRcdHRoaXMuX21vZGVsSWQuc2V0KG1vZGVsSWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXRTZWxlY3RlZE1vZGVsSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NlbGVjdGVkTW9kZWxJZDsgfVxuXHRjbGVhclNlbGVjdGVkTW9kZWxJZCgpOiB2b2lkIHsgdGhpcy5fc2VsZWN0ZWRNb2RlbElkID0gdW5kZWZpbmVkOyB9XG5cdC8qKiBVbnRpdGxlZCBza2VsZXRvbiB0aXRsZSB1c2VkIHVudGlsIHRoZSBmaXJzdCByZXF1ZXN0IGNvbW1pdHMgdGhlIHNlc3Npb24uICovXG5cdGdldCB1bnRpdGxlZFRpdGxlKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9raW5kLnVudGl0bGVkVGl0bGU7IH1cblx0c2V0U2VsZWN0ZWRBZ2VudChhZ2VudDogSVNlc3Npb25BZ2VudFJlZiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkQWdlbnQgPSBhZ2VudDtcblx0XHR0aGlzLl9tb2RlLnNldChhZ2VudCA/IHsgaWQ6IGFnZW50LnVyaSwga2luZDogQUdFTlRfTU9ERV9LSU5EIH0gOiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXRTZWxlY3RlZEFnZW50KCk6IElTZXNzaW9uQWdlbnRSZWYgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2VsZWN0ZWRBZ2VudDsgfVxuXHRjbGVhclNlbGVjdGVkQWdlbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRBZ2VudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tb2RlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTdGF0dXMoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogdm9pZCB7IHRoaXMuX3N0YXR1cy5zZXQoc3RhdHVzLCB1bmRlZmluZWQpOyB9XG5cdHNldEFjdGl2aXR5KGFjdGl2aXR5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbi5zZXQoYWN0aXZpdHkgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGFjdGl2aXR5KSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXHRzZXRMb2FkaW5nKGxvYWRpbmc6IGJvb2xlYW4pOiB2b2lkIHsgdGhpcy5fbG9hZGluZy5zZXQobG9hZGluZywgdW5kZWZpbmVkKTsgfVxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7IHRoaXMuX3RpdGxlLnNldCh0aXRsZSwgdW5kZWZpbmVkKTsgfVxuXG5cdGFwcGx5U2Vzc2lvbk1ldGEobWV0YTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl93b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0Y29uc3QgcHJpbWFyeUZvbGRlciA9IHdvcmtzcGFjZT8uZm9sZGVyc1swXTtcblx0XHRpZiAoIXdvcmtzcGFjZSB8fCAhcHJpbWFyeUZvbGRlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdpdFN0YXRlID0gcmVhZFNlc3Npb25HaXRTdGF0ZShtZXRhKTtcblx0XHRjb25zdCBnaXRIdWJJbmZvID0gdG9HaXRIdWJJbmZvKG1ldGEpO1xuXHRcdGlmICghZ2l0U3RhdGUgJiYgIWdpdEh1YkluZm8pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50UmVwb3NpdG9yeSA9IHByaW1hcnlGb2xkZXIuZ2l0UmVwb3NpdG9yeSA/PyB7XG5cdFx0XHR1cmk6IHByaW1hcnlGb2xkZXIucm9vdCxcblx0XHRcdHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRiYXNlQnJhbmNoTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpLFxuXHRcdH07XG5cdFx0Y29uc3QgbmV4dEdpdEh1YkluZm8gPSBnaXRIdWJJbmZvXG5cdFx0XHQ/PyAoZ2l0U3RhdGU/Lmhhc0dpdEh1YlJlbW90ZSA9PT0gZmFsc2UgPyB1bmRlZmluZWQgOiBjdXJyZW50UmVwb3NpdG9yeS5naXRIdWJJbmZvLmdldCgpKTtcblx0XHRjb25zdCBuZXh0V29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSA9IHtcblx0XHRcdC4uLndvcmtzcGFjZSxcblx0XHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRcdC4uLnByaW1hcnlGb2xkZXIsXG5cdFx0XHRcdGdpdFJlcG9zaXRvcnk6IHtcblx0XHRcdFx0XHQuLi5jdXJyZW50UmVwb3NpdG9yeSxcblx0XHRcdFx0XHRicmFuY2hOYW1lOiBnaXRTdGF0ZT8uYnJhbmNoTmFtZSA/PyBjdXJyZW50UmVwb3NpdG9yeS5icmFuY2hOYW1lLFxuXHRcdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiBnaXRTdGF0ZT8uYmFzZUJyYW5jaE5hbWUgPz8gY3VycmVudFJlcG9zaXRvcnkuYmFzZUJyYW5jaE5hbWUsXG5cdFx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiBnaXRTdGF0ZT8uaGFzR2l0SHViUmVtb3RlID8/IGN1cnJlbnRSZXBvc2l0b3J5Lmhhc0dpdEh1YlJlbW90ZSxcblx0XHRcdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6IGdpdFN0YXRlPy51cHN0cmVhbUJyYW5jaE5hbWUgPz8gY3VycmVudFJlcG9zaXRvcnkudXBzdHJlYW1CcmFuY2hOYW1lLFxuXHRcdFx0XHRcdGluY29taW5nQ2hhbmdlczogZ2l0U3RhdGU/LmluY29taW5nQ2hhbmdlcyA/PyBjdXJyZW50UmVwb3NpdG9yeS5pbmNvbWluZ0NoYW5nZXMsXG5cdFx0XHRcdFx0b3V0Z29pbmdDaGFuZ2VzOiBnaXRTdGF0ZT8ub3V0Z29pbmdDaGFuZ2VzID8/IGN1cnJlbnRSZXBvc2l0b3J5Lm91dGdvaW5nQ2hhbmdlcyxcblx0XHRcdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IGdpdFN0YXRlPy51bmNvbW1pdHRlZENoYW5nZXMgPz8gY3VycmVudFJlcG9zaXRvcnkudW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZShuZXh0R2l0SHViSW5mbyksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCAuLi53b3Jrc3BhY2UuZm9sZGVycy5zbGljZSgxKV0sXG5cdFx0fTtcblx0XHRpZiAoc2Vzc2lvbldvcmtzcGFjZUVxdWFsKHdvcmtzcGFjZSwgbmV4dFdvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fd29ya3NwYWNlLnNldChuZXh0V29ya3NwYWNlLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0gQ29uZmlnIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0Q29uZmlnKCk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbmZpZzsgfVxuXHRnZXRDb25maWdWYWx1ZXMoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29uZmlnPy52YWx1ZXM7IH1cblxuXHR0cmFja0NvbmZpZ1Jlc29sdXRpb24ocHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2NvbmZpZ1Jlc29sdXRpb24gPSBwcm9taXNlO1xuXHRcdHZvaWQgcHJvbWlzZS50aGVuKFxuXHRcdFx0KCkgPT4gdGhpcy5fY2xlYXJDb25maWdSZXNvbHV0aW9uKHByb21pc2UpLFxuXHRcdFx0KCkgPT4gdGhpcy5fY2xlYXJDb25maWdSZXNvbHV0aW9uKHByb21pc2UpLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yQ29uZmlnUmVzb2x1dGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodGhpcy5fY29uZmlnUmVzb2x1dGlvbikge1xuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuX2NvbmZpZ1Jlc29sdXRpb24sIHRoaXMuY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQ29uZmlnUmVzb2x1dGlvbihwcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ1Jlc29sdXRpb24gPT09IHByb21pc2UpIHtcblx0XHRcdHRoaXMuX2NvbmZpZ1Jlc29sdXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9wdGltaXN0aWNhbGx5IG1lcmdlcyBhIHNpbmdsZSBwcm9wZXJ0eSBpbnRvIHRoZSBjYWNoZWQgY29uZmlnLlxuXHQgKiBQcmVzZXJ2ZXMgdGhlIGV4aXN0aW5nIHNjaGVtYSBzbyBzY2hlbWEtZHJpdmVuIHBpY2tlcnMgZG9uJ3QgZmxhc2hcblx0ICogZHVyaW5nIHRoZSBhc3luYyByZS1yZXNvbHZlLiB7QGxpbmsgcmVzb2x2ZUNvbmZpZ30gcmVwbGFjZXMgYm90aFxuXHQgKiBzY2hlbWEgYW5kIHZhbHVlcyB3aGVuIGl0cyByZXNwb25zZSBsYW5kcy5cblx0ICovXG5cdHNldENvbmZpZ1ZhbHVlKHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2NvbmZpZztcblx0XHR0aGlzLl9jb25maWcgPSB7XG5cdFx0XHRzY2hlbWE6IGN1cnJlbnQ/LnNjaGVtYSA/PyB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IC4uLihjdXJyZW50Py52YWx1ZXMgPz8ge30pLCBbcHJvcGVydHldOiB2YWx1ZSB9LFxuXHRcdH07XG5cdFx0dGhpcy5fc3luY1dvcmt0cmVlUGVuZGluZygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGlsZSBhIHtAbGluayByZXNvbHZlQ29uZmlnfSByb3VuZC10cmlwIGlzIGluIGZsaWdodC4gU2VlXG5cdCAqIHtAbGluayBfaXNSZXNvbHZpbmdDb25maWd9IGZvciB3aHkgdGhpcyBpcyBkaXN0aW5jdCBmcm9tIHtAbGluayBJU2Vzc2lvbi5sb2FkaW5nfS5cblx0ICovXG5cdGdldCBpc1Jlc29sdmluZ0NvbmZpZygpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7IHJldHVybiB0aGlzLl9pc1Jlc29sdmluZ0NvbmZpZzsgfVxuXHRnZXQgY2FuY2VsbGF0aW9uVG9rZW4oKTogQ2FuY2VsbGF0aW9uVG9rZW4geyByZXR1cm4gdGhpcy5fbGlmZXRpbWVDdHMudG9rZW47IH1cblxuXHQvKiogTWFyayBhIHJlc29sdmUgYXMgc3RhcnRpbmcgYmVmb3JlIHRoZSBvcHRpbWlzdGljIGV2ZW50IGZpcmVzLiAqL1xuXHRiZWdpblJlc29sdmVDb25maWdTeW5jKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzUmVzb2x2aW5nQ29uZmlnLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFyIHRoZSBpbi1mbGlnaHQgZmxhZyBmb3IgZWFybHktcmV0dXJuIHBhdGhzIHRoYXQgc2tpcFxuXHQgKiB7QGxpbmsgcmVzb2x2ZUNvbmZpZ30gKGUuZy4gbm8gY29ubmVjdGlvbiksIHdoZXJlIHRoZSBgZmluYWxseWBcblx0ICogY2xlYW51cCBuZXZlciBydW5zLlxuXHQgKi9cblx0ZW5kUmVzb2x2ZUNvbmZpZ1N5bmMoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNSZXNvbHZpbmdDb25maWcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJlc29sdmVzIHRoZSBzZXNzaW9uIGNvbmZpZyBhZ2FpbnN0IHRoZSBhZ2VudCBob3N0IHVzaW5nIHRoZVxuXHQgKiBjdXJyZW50bHkgY2FjaGVkIHZhbHVlcy4gSWdub3JlcyBpdHMgb3duIHJlc3BvbnNlIGlmIGEgbmV3ZXIgY2FsbFxuXHQgKiBzdXBlcnNlZGVkIGl0LiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY29uZmlnIHdhcyBhcHBsaWVkIChpLmUuIHRoaXNcblx0ICogY2FsbCB3YXMgbm90IHN0YWxlIGJ5IHRoZSB0aW1lIHRoZSByZXNwb25zZSBhcnJpdmVkKS4gT24gZmFpbHVyZSwgdGhlXG5cdCAqIGNhY2hlZCBjb25maWcgaXMgY2xlYXJlZCBzbyB7QGxpbmsgZ2V0Q29uZmlnfSByZXR1cm5zIGB1bmRlZmluZWRgLlxuXHQgKiBAcGFyYW0gc3RyaWN0IFJldGhyb3cgdGhlIGxhdGVzdCByZXNvbHV0aW9uIGVycm9yIGluc3RlYWQgb2YgdHJlYXRpbmcgdGhlIHJlZnJlc2ggYXMgYmVzdCBlZmZvcnQuXG5cdCAqL1xuXHRhc3luYyByZXNvbHZlQ29uZmlnKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHN0cmljdCA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc2VxID0gKyt0aGlzLl9jb25maWdSZXF1ZXN0U2VxO1xuXHRcdHRoaXMuX2lzUmVzb2x2aW5nQ29uZmlnLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0cHJvdmlkZXI6IHRoaXMuYWdlbnRQcm92aWRlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGhpcy53b3Jrc3BhY2VVcmksXG5cdFx0XHRcdGNvbmZpZzogdGhpcy5fY29uZmlnPy52YWx1ZXMsXG5cdFx0XHR9KTtcblx0XHRcdGlmIChzZXEgIT09IHRoaXMuX2NvbmZpZ1JlcXVlc3RTZXEpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29uZmlnID0gcmVzdWx0O1xuXHRcdFx0dGhpcy5fc3luY1dvcmt0cmVlUGVuZGluZygpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChzZXEgIT09IHRoaXMuX2NvbmZpZ1JlcXVlc3RTZXEpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29uZmlnID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc3luY1dvcmt0cmVlUGVuZGluZygpO1xuXHRcdFx0aWYgKHN0cmljdCkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBPbmx5IHRoZSBsYXRlc3QgcmVxdWVzdCBvd25zIHRoZSBmbGFnLlxuXHRcdFx0aWYgKHNlcSA9PT0gdGhpcy5fY29uZmlnUmVxdWVzdFNlcSkge1xuXHRcdFx0XHR0aGlzLl9pc1Jlc29sdmluZ0NvbmZpZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q29uZmlnQ29tcGxldGlvbnMoY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgcHJvcGVydHk6IHN0cmluZywgcXVlcnk6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjb25uZWN0aW9uLnNlc3Npb25Db25maWdDb21wbGV0aW9ucyh7XG5cdFx0XHRwcm92aWRlcjogdGhpcy5hZ2VudFByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGhpcy53b3Jrc3BhY2VVcmksXG5cdFx0XHRjb25maWc6IHRoaXMuX2NvbmZpZz8udmFsdWVzLFxuXHRcdFx0cHJvcGVydHksXG5cdFx0XHRxdWVyeSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tIEJhY2tlbmQgc2Vzc2lvbiBsaWZlY3ljbGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBFYWdlcmx5IGNyZWF0ZSB0aGUgc2Vzc2lvbiBvbiB0aGUgYWdlbnQgaG9zdCBzbyB0aGUgY2hhdCBoYW5kbGVyIGNhblxuXHQgKiBza2lwIGl0cyBsZWdhY3kgYGNyZWF0ZVNlc3Npb25gLW9uLWZpcnN0LW1lc3NhZ2Ugcm91bmQtdHJpcC5cblx0ICpcblx0ICogV2lyZSBvcmRlcmluZyBtYXR0ZXJzOiB3ZSBtdXN0IGBjcmVhdGVTZXNzaW9uYCAqYmVmb3JlKiBvcGVuaW5nIHRoZVxuXHQgKiBzdWJzY3JpcHRpb24uIFN1YnNjcmliaW5nIGZpcnN0IHdvdWxkIHJhY2UgdGhlIHdpcmUgc2VuZCBcdTIwMTQgdGhlIHNlcnZlclxuXHQgKiByZWNlaXZlcyB0aGUgYHN1YnNjcmliZWAgYmVmb3JlIHRoZSBgY3JlYXRlU2Vzc2lvbmAgYW5kIHJlamVjdHMgaXQgYXNcblx0ICogYEFIUF9TRVNTSU9OX05PVF9GT1VORGAsIGxlYXZpbmcgdGhlIGNsaWVudCBzdWJzY3JpcHRpb24gaW4gYW5cblx0ICogdW5yZWNvdmVyYWJsZSBlcnJvciBzdGF0ZS4gVGhlIHNlc3Npb24gaGFuZGxlciB3b3VsZCB0aGVuIGZhbGwgYmFja1xuXHQgKiB0byBpdHMgbGVnYWN5IGNyZWF0ZS1hbmQtc3Vic2NyaWJlIHBhdGggb24gdGhlIHVzZXIncyBmaXJzdCBzZW5kLFxuXHQgKiBpc3N1aW5nIGEgZHVwbGljYXRlIGBjcmVhdGVTZXNzaW9uYC5cblx0ICpcblx0ICogSWYgdGhlIHVzZXIgc3dpdGNoZXMgd29ya3NwYWNlcyBvciBncmFkdWF0ZXMgdGhpcyBzZXNzaW9uIGJlZm9yZSB0aGVcblx0ICogYGNyZWF0ZVNlc3Npb25gIHJvdW5kLXRyaXAgY29tcGxldGVzLCB0aGlzIG9iamVjdCB3aWxsIGhhdmUgYmVlblxuXHQgKiBkaXNwb3NlZCAoYW5kIGBfYmFja2VuZFVyaWAgY2xlYXJlZCkgXHUyMDE0IHRoZSBiYWlsLW91dCBjaGVjayBiZWxvdyBza2lwc1xuXHQgKiBvcGVuaW5nIGEgc3RhbGUgc3Vic2NyaXB0aW9uLlxuXHQgKlxuXHQgKiBGYWlsdXJlcyBhcmUgbm9uLWZhdGFsOiB0aGUgbGVnYWN5IGZpcnN0LW1lc3NhZ2UgcGF0aCBpblxuXHQgKiBgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuX2ludm9rZUFnZW50YCByZS1pc3N1ZXMgYGNyZWF0ZVNlc3Npb25gIGlmXG5cdCAqIG5vIHNlc3Npb24gc3RhdGUgZXhpc3RzIGF0IHNlbmQgdGltZS5cblx0ICovXG5cdGVhZ2VyQ3JlYXRlKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGNhbkNyZWF0ZT86ICgpID0+IFByb21pc2U8Ym9vbGVhbj4pOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kVXJpID0gdGhpcy5fYmFja2VuZFNlc3Npb25Vcmk7XG5cdFx0aWYgKHRoaXMuX2VhZ2VyQ3JlYXRlVGFzayB8fCB0aGlzLl9iYWNrZW5kVXJpPy50b1N0cmluZygpID09PSBiYWNrZW5kVXJpLnRvU3RyaW5nKCkgfHwgdGhpcy5fc3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWFnZXJDcmVhdGVUYXNrID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChjYW5DcmVhdGUpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoIWF3YWl0IGNhbkNyZWF0ZSgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fcHJvdmlkZXJJZH1dIEVhZ2VyIGNyZWF0ZVNlc3Npb24gcHJlY29uZGl0aW9uIGZhaWxlZCBmb3IgJHtiYWNrZW5kVXJpLnRvU3RyaW5nKCl9OiAke2Vycm9yfWApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9iYWNrZW5kVXJpID0gYmFja2VuZFVyaTtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSBjb25uZWN0aW9uO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hY3RpdmVDbGllbnRTY29wZT8ud2hlblJlc29sdmVkKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9iYWNrZW5kVXJpPy50b1N0cmluZygpICE9PSBiYWNrZW5kVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fYWN0aXZlQ2xpZW50U2NvcGU/LmFjdGl2ZUNsaWVudChjb25uZWN0aW9uLmNsaWVudElkKS5nZXQoKTtcblx0XHRcdFx0YXdhaXQgY29ubmVjdGlvbi5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRwcm92aWRlcjogdGhpcy5hZ2VudFByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlc3Npb246IGJhY2tlbmRVcmksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB0aGlzLndvcmtzcGFjZVVyaSA/IFt0aGlzLndvcmtzcGFjZVVyaV0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB0aGlzLl9jb25maWc/LnZhbHVlcyxcblx0XHRcdFx0XHRfbWV0YTogdGhpcy5faW5pdGlhbE1ldGFkYXRhLFxuXHRcdFx0XHRcdC8vIE1DUC1zdHlsZSBvcHQtaW46IG9mZmVyIHRvIHJlY2VpdmUgYHByb2dyZXNzYCBmb3IgYW55XG5cdFx0XHRcdFx0Ly8gbG9uZy1ydW5uaW5nIGJyaW5nLXVwIChjaGllZmx5IHRoZSBsYXp5IGZpcnN0LXVzZSBTREtcblx0XHRcdFx0XHQvLyBkb3dubG9hZCwgd2hpY2ggZmlyZXMgbGF0ZXIgYXQgZmlyc3QtbWVzc2FnZVxuXHRcdFx0XHRcdC8vIG1hdGVyaWFsaXphdGlvbikuIFRoZSBob3N0IGVjaG9lcyB0aGlzIHRva2VuIG9uIGVhY2hcblx0XHRcdFx0XHQvLyBgcHJvZ3Jlc3NgIGZyYW1lIHNvIGBfaGFuZGxlUHJvZ3Jlc3NgIGNhbiBjb3JyZWxhdGUgaXQuXG5cdFx0XHRcdFx0cHJvZ3Jlc3NUb2tlbjogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0Li4uKHRoaXMuX3NlbGVjdGVkQWdlbnQgPyB7IGFnZW50OiB7IHVyaTogdGhpcy5fc2VsZWN0ZWRBZ2VudC51cmkgfSB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihhY3RpdmVDbGllbnQgPyB7IGFjdGl2ZUNsaWVudCB9IDoge30pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX3Byb3ZpZGVySWR9XSBFYWdlciBjcmVhdGVTZXNzaW9uIGZhaWxlZCBmb3IgJHtiYWNrZW5kVXJpLnRvU3RyaW5nKCl9OiAke2Vycn1gKTtcblx0XHRcdFx0Ly8gQ2xlYXIgYmFja2VuZCBib29ra2VlcGluZyBzbyBhIGxhdGVyIGBkaXNwb3NlKClgIGRvZXNuJ3Rcblx0XHRcdFx0Ly8gZmlyZSBgZGlzcG9zZVNlc3Npb25gIGZvciBhIHNlc3Npb24gdGhlIGFnZW50IGhvc3QgbmV2ZXJcblx0XHRcdFx0Ly8gY3JlYXRlZC4gT25seSBkbyB0aGlzIGlmIHdlJ3JlIHN0aWxsIHRoZSBjdXJyZW50IGF0dGVtcHRcblx0XHRcdFx0Ly8gKHRoZSBjYWxsZXIgbWF5IGhhdmUgYWxyZWFkeSBvdmVyd3JpdHRlbiB0aGVzZSBmaWVsZHMgYnlcblx0XHRcdFx0Ly8gZGlzcG9zaW5nIHRoaXMgTmV3U2Vzc2lvbiBhbmQgY29uc3RydWN0aW5nIGEgbmV3IG9uZSkuXG5cdFx0XHRcdGlmICh0aGlzLl9iYWNrZW5kVXJpPy50b1N0cmluZygpID09PSBiYWNrZW5kVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9iYWNrZW5kVXJpID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBCYWlsIGlmIHRoZSB1c2VyIHN3aXRjaGVkIHdvcmtzcGFjZXMsIGdyYWR1YXRlZCB0aGlzIHNlc3Npb24sXG5cdFx0XHQvLyBvciBvdGhlcndpc2UgZGlzcG9zZWQgaXQgd2hpbGUgdGhlIHJvdW5kLXRyaXAgd2FzIGluIGZsaWdodC5cblx0XHRcdGlmICh0aGlzLl9iYWNrZW5kVXJpPy50b1N0cmluZygpICE9PSBiYWNrZW5kVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIb2xkIGEgc3RhdGUgc3Vic2NyaXB0aW9uIGZvciBvdXIgbGlmZXRpbWUgc28gdGhlIGFnZW50IGhvc3Qnc1xuXHRcdFx0Ly8gZW1wdHktc2Vzc2lvbiBHQyBzZWVzIGEgbm9uLXplcm8gc3Vic2NyaWJlciBjb3VudC4gVGhlIHNlc3Npb25cblx0XHRcdC8vIGhhbmRsZXIgcmVmY291bnRzIHRoZSBzYW1lIHN1YnNjcmlwdGlvbiB2aWEgYGdldFN1YnNjcmlwdGlvbmBcblx0XHRcdC8vIHdoZW4gY2hhdCBjb250ZW50IG9wZW5zLCBzbyB3aGVuIHdlIHJlbGVhc2UgdGhpcyByZWYgb25cblx0XHRcdC8vIGdyYWR1YXRpb24gdGhlIHdpcmUtbGV2ZWwgcmVmY291bnQgc3RheXMgcG9zaXRpdmUuXG5cdFx0XHRjb25zdCByZWYgPSBjb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgYmFja2VuZFVyaSwgJ0Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnNlc3Npb24nKTtcblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbiA9IHJlZjtcblxuXHRcdFx0Ly8gRm9yd2FyZCBgU2Vzc2lvblN0YXRlYCB1cGRhdGVzIGJhY2sgdG8gdGhlIHByb3ZpZGVyIHNvXG5cdFx0XHQvLyBgX2xhc3RTZXNzaW9uU3RhdGVzYCAoYW5kIHRoZXJlZm9yZSBgZ2V0Q3VzdG9tQWdlbnRzYCkgYmVjb21lc1xuXHRcdFx0Ly8gcG9wdWxhdGVkIGZvciB0aGlzIHN0aWxsLVVudGl0bGVkIHNlc3Npb24uIFNlZWQgb25jZSBmcm9tIHRoZVxuXHRcdFx0Ly8gY2FjaGVkIHZhbHVlLCB0aGVuIGF0dGFjaCBhIGxpc3RlbmVyIGZvciBzdWJzZXF1ZW50IGRlbHRhcy5cblx0XHRcdGNvbnN0IG9uU2Vzc2lvblN0YXRlID0gdGhpcy5fb25TZXNzaW9uU3RhdGU7XG5cdFx0XHRpZiAob25TZXNzaW9uU3RhdGUpIHtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbCA9IHJlZi5vYmplY3QudmFsdWU7XG5cdFx0XHRcdGlmIChpbml0aWFsICYmICEoaW5pdGlhbCBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ2hhbmdlc2V0cyhpbml0aWFsLmNoYW5nZXNldHMpO1xuXHRcdFx0XHRcdG9uU2Vzc2lvblN0YXRlKHRoaXMuc2Vzc2lvbklkLCBpbml0aWFsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdGF0ZUxpc3RlbmVyLnZhbHVlID0gcmVmLm9iamVjdC5vbkRpZENoYW5nZShzdGF0ZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDaGFuZ2VzZXRzKHN0YXRlLmNoYW5nZXNldHMpO1xuXHRcdFx0XHRcdG9uU2Vzc2lvblN0YXRlKHRoaXMuc2Vzc2lvbklkLCBzdGF0ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yRWFnZXJDcmVhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2VhZ2VyQ3JlYXRlVGFzaykge1xuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuX2VhZ2VyQ3JlYXRlVGFzaywgdGhpcy5jYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGFuZ2VzZXRzKGNoYW5nZXNldHNNZXRhZGF0YTogcmVhZG9ubHkgQ2hhbmdlc2V0W10gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWNoYW5nZXNldHNNZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBjcmVhdGVDaGFuZ2VzZXRzKHRoaXMuX2JhY2tlbmRTZXNzaW9uVXJpLCB0aGlzLl9vcHRpb25zLCB0aGlzLl9pc0FjdGl2ZVNlc3Npb25PYnMsIGNoYW5nZXNldHNNZXRhZGF0YSk7XG5cblx0XHR0aGlzLl9jaGFuZ2VzZXRzLnNldChjaGFuZ2VzZXRzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbGVhc2UgdGhlIGJhY2tlbmQgc3Vic2NyaXB0aW9uIHdpdGhvdXQgZmlyaW5nIGBkaXNwb3NlU2Vzc2lvbmAuXG5cdCAqIFVzZWQgb24gdGhlIHN1Y2Nlc3MgcGF0aCBpbiBgc2VuZFJlcXVlc3RgIHdoZW4gdGhlIHNlc3Npb24gaGFzXG5cdCAqIGdyYWR1YXRlZCBpbnRvIGEgcmVhbCBydW5uaW5nIHNlc3Npb24uXG5cdCAqL1xuXHRncmFkdWF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9saWZldGltZUN0cy5jYW5jZWwoKTtcblx0XHQvLyBEZXRhY2ggdGhlIG5ldy1zZXNzaW9uIGxpc3RlbmVyIEJFRk9SRSByZWxlYXNpbmcgdGhlIHN1YnNjcmlwdGlvbi5cblx0XHQvLyBCb3RoIGNvZGUgcGF0aHMgKHRoaXMgb25lIGFuZCB0aGUgcnVubmluZy1zZXNzaW9uIHBpcGVsaW5lKSB3cml0ZVxuXHRcdC8vIGBfbGFzdFNlc3Npb25TdGF0ZXNgIHVuZGVyIHRoZSBzYW1lIGBzZXNzaW9uSWRgIGtleSwgc28gZGV0YWNoaW5nXG5cdFx0Ly8gaGVyZSBoYW5kcyBvd25lcnNoaXAgY2xlYW5seSB0byBgX2Vuc3VyZVNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbmBcblx0XHQvLyB3aXRob3V0IGEgdHJhbnNpZW50IGVtcHR5LXJlYWQgd2luZG93IG9yIGEgZHVwbGljYXRlIHdyaXRlci5cblx0XHR0aGlzLl9zdGF0ZUxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2JhY2tlbmRVcmkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29ubmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb25maWdSZXF1ZXN0U2VxKys7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpZmV0aW1lQ3RzLmNhbmNlbCgpO1xuXHRcdC8vIEJ1bXAgdGhlIHNlcSBzbyBhbnkgaW4tZmxpZ2h0IHJlc29sdmVDb25maWcgZGlzY2FyZHMgaXRzZWxmLlxuXHRcdHRoaXMuX2NvbmZpZ1JlcXVlc3RTZXErKztcblxuXHRcdC8vIERldGFjaCB0aGUgc3RhdGUgbGlzdGVuZXIgQkVGT1JFIGZpcmluZyB0aGUgY2xlYW51cCBzZW50aW5lbCBzb1xuXHRcdC8vIGEgcmFjaW5nIGBvbkRpZENoYW5nZWAgY2Fubm90IHJlLXBvcHVsYXRlIGBfbGFzdFNlc3Npb25TdGF0ZXNgXG5cdFx0Ly8gYWZ0ZXIgd2UgaGF2ZSBhc2tlZCB0aGUgcHJvdmlkZXIgdG8gZGVsZXRlIHRoZSBlbnRyeS4gVGhlbiBmaXJlXG5cdFx0Ly8gdGhlIHNlbnRpbmVsIHNvIHRoZSBwcm92aWRlciBkcm9wcyB0aGUgY2FjaGVkIHNuYXBzaG90LiBPbmx5XG5cdFx0Ly8gZmlyZXMgd2hlbiBhIGxpc3RlbmVyIHdhcyBhY3R1YWxseSB3aXJlZCAoaS5lLiBgZWFnZXJDcmVhdGVgXG5cdFx0Ly8gcmVhY2hlZCB0aGUgcG9zdC1gY3JlYXRlU2Vzc2lvbmAgYnJhbmNoKS5cblx0XHRjb25zdCBoYWRMaXN0ZW5lciA9ICEhdGhpcy5fc3RhdGVMaXN0ZW5lci52YWx1ZTtcblx0XHR0aGlzLl9zdGF0ZUxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0aWYgKGhhZExpc3RlbmVyKSB7XG5cdFx0XHR0aGlzLl9vblNlc3Npb25TdGF0ZT8uKHRoaXMuc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG9sZFVyaSA9IHRoaXMuX2JhY2tlbmRVcmk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0dGhpcy5fYmFja2VuZFVyaSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb25uZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdGlmIChvbGRVcmkgJiYgY29ubmVjdGlvbikge1xuXHRcdFx0Y29ubmVjdGlvbi5kaXNwb3NlU2Vzc2lvbihvbGRVcmkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fcHJvdmlkZXJJZH1dIEZhaWxlZCB0byBkaXNwb3NlIGVhZ2VyIGJhY2tlbmQgc2Vzc2lvbiAke29sZFVyaS50b1N0cmluZygpfTogJHtlcnJ9YCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIFx1MjAxNCBzaGFyZWQgYmFzZSBmb3IgbG9jYWwgYW5kIHJlbW90ZSBwcm92aWRlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBTaGFyZWQgYmFzZSBjbGFzcyBmb3IgdGhlIGxvY2FsIGFuZCByZW1vdGUgYWdlbnQgaG9zdCBzZXNzaW9ucyBwcm92aWRlcnMuXG4gKlxuICogT3ducyB0aGUgc3RydWN0dXJlcyBhbmQgZmxvd3MgdGhhdCBhcmUgaWRlbnRpY2FsIGJldHdlZW4gdGhlIHR3bzpcbiAqIHRoZSBzZXNzaW9uIGNhY2hlLCB0aGUgbmV3LXNlc3Npb24vcnVubmluZy1zZXNzaW9uIGNvbmZpZyBwaWNrZXIgc3RhdGUsXG4gKiB0aGUgbGF6eSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbnMsIHRoZSBBSFAgbm90aWZpY2F0aW9uL2FjdGlvblxuICogaGFuZGxlcnMsIGFuZCBldmVyeSBjb25uZWN0aW9uLXJvdXRlZCBtZXRob2QgKHNldC9nZXQvYXJjaGl2ZS9kZWxldGUvXG4gKiByZW5hbWUvc2V0TW9kZWwvc2VuZFJlcXVlc3QpLlxuICpcbiAqIFN1YmNsYXNzZXMgc3VwcGx5IHRoZSBnZW51aW5lIHZhcmlhdGlvbiBwb2ludHM6IHRoZSBjb25uZWN0aW9uXG4gKiBhY2Nlc3NvciwgdGhlIGF1dGhlbnRpY2F0aW9uLXBlbmRpbmcgb2JzZXJ2YWJsZSwgYW4gYWRhcHRlciBmYWN0b3J5LFxuICogVVJJLXNjaGVtZSBtYXBwaW5nIGZvciBzZXNzaW9uIG1ldGFkYXRhLCB0aGUgYWdlbnQtcHJvdmlkZXIgbG9va3VwLCBhbmRcbiAqIHRoZSBicm93c2UgVUkuXG4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB7XG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0YWJzdHJhY3QgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0YWJzdHJhY3QgcmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRhYnN0cmFjdCByZWFkb25seSBicm93c2VBY3Rpb25zOiByZWFkb25seSBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbltdO1xuXG5cdGdldCBvcmRlcigpOiBudW1iZXIgeyByZXR1cm4gMDsgfVxuXG5cdGdldCBzZXNzaW9uVHlwZXMoKTogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10geyByZXR1cm4gdGhpcy5fc2Vzc2lvblR5cGVzOyB9XG5cdHByb3RlY3RlZCBfc2Vzc2lvblR5cGVzOiBJU2Vzc2lvblR5cGVbXSA9IFtdO1xuXG5cdHByaXZhdGUgX2xhc3RBZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudENhcGFiaWxpdGllcyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seU1hcDxzdHJpbmcsIEFnZW50Q2FwYWJpbGl0aWVzIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDxJU2Vzc2lvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFJlcGxhY2VTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VSb290Q29uZmlnID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUm9vdENvbmZpZyA9IHRoaXMuX29uRGlkQ2hhbmdlUm9vdENvbmZpZy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID0gdGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zLmV2ZW50O1xuXHQvKiogTGFzdC1rbm93biByb290IGNvbmZpZyBzdGF0ZSAoc2NoZW1hICsgdmFsdWVzKSwgc2VlZGVkIGZyb20gYFJvb3RTdGF0ZS5jb25maWdgLiAqL1xuXHRwcm90ZWN0ZWQgX3Jvb3RDb25maWc6IFJvb3RDb25maWdTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogTGFzdC1rbm93biBzZXNzaW9uIHN0YXRlIHBlciBzZXNzaW9uIElELCBzZWVkZWQgZnJvbVxuXHQgKiB7QGxpbmsgX2FwcGx5U2Vzc2lvblN0YXRlVXBkYXRlfS4gSG9sZHMgdGhlIHNuYXBzaG90IHVzZWQgdG8gZXh0cmFjdFxuXHQgKiBgY3VzdG9taXphdGlvbnNgIGFuZCBgYWN0aXZlQ2xpZW50LmN1c3RvbWl6YXRpb25zYCBmb3IgdGhlIHBpY2tlci5cblx0ICovXG5cdHByb3RlY3RlZCByZWFkb25seSBfbGFzdFNlc3Npb25TdGF0ZXMgPSBuZXcgTWFwPHN0cmluZywgU2Vzc2lvblN0YXRlPigpO1xuXG5cdC8qKiBDYWNoZSBvZiBhZGFwdGVkIHNlc3Npb25zLCBrZXllZCBieSByYXcgc2Vzc2lvbiBJRC4gKi9cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXI+KCk7XG5cblx0cHJvdGVjdGVkIF9yZWZyZXNoU2Vzc2lvbldvcmtzcGFjZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IFsuLi50aGlzLl9zZXNzaW9uQ2FjaGUudmFsdWVzKCldLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24ucmVmcmVzaFdvcmtzcGFjZSgpKTtcblx0XHRpZiAoY2hhbmdlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9yYWdlIGtleSB1bmRlciB3aGljaCB7QGxpbmsgX3Nlc3Npb25DYWNoZX0gc25hcHNob3RzIGFyZSBwZXJzaXN0ZWQsIG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoaWxlIHBlcnNpc3RlbmNlIGlzIGRpc2FibGVkLiBTZXQgdmlhXG5cdCAqIHtAbGluayBfZW5hYmxlU2Vzc2lvbkNhY2hlUGVyc2lzdGVuY2V9LCB3aGljaCBzdWJjbGFzc2VzIGNhbGwgb25jZSB0aGVpclxuXHQgKiBpZGVudGl0eSBmaWVsZHMgYXJlIHJlYWR5LiBXaGVuIGB1bmRlZmluZWRgLCB0aGUgY2FjaGUgaXMgaW4tbWVtb3J5IG9ubHkuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXNzaW9uQ2FjaGVTdG9yYWdlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNuYXBzaG90IG9mIHRoZSBzb3VyY2UgbWV0YWRhdGEgZm9yIGVhY2ggYWRhcHRlciBpbiB7QGxpbmsgX3Nlc3Npb25DYWNoZX0sXG5cdCAqIGtleWVkIGJ5IHJhdyBzZXNzaW9uIElELiBDYXB0dXJlZCBpbiB7QGxpbmsgY3JlYXRlQWRhcHRlcn0ve0BsaW5rIHVwZGF0ZUFkYXB0ZXJ9XG5cdCAqIGFuZCByZS11c2VkIGJ5IHtAbGluayBfcGVyc2lzdENhY2hlfSB0byBzZXJpYWxpemUgc2Vzc2lvbnMgd2l0aG91dCBoYXZpbmcgdG9cblx0ICogcmVjb25zdHJ1Y3QgZXZlcnkgYElBZ2VudFNlc3Npb25NZXRhZGF0YWAgZmllbGQgZnJvbSBvYnNlcnZhYmxlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFCeVJhd0lkID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudFNlc3Npb25NZXRhZGF0YT4oKTtcblxuXHQvKipcblx0ICogU2V0IHdoZW4ge0BsaW5rIF9zZXNzaW9uQ2FjaGV9IGhhcyBjaGFuZ2VkIHNpbmNlIHRoZSBsYXN0IHBlcnNpc3QuIFRoZVxuXHQgKiBhY3R1YWwgd3JpdGUgaGFwcGVucyBvbiB0aGUgbmV4dCBgb25XaWxsU2F2ZVN0YXRlYCBzaWduYWwgZnJvbVxuXHQgKiB7QGxpbmsgSVN0b3JhZ2VTZXJ2aWNlfSBzbyB0aGF0IGJ1cnN0cyBvZiBub3RpZmljYXRpb25zIGRvIG5vdCByZXBlYXRlZGx5XG5cdCAqIHJlLXNlcmlhbGl6ZSB0aGUgd2hvbGUgY2FjaGUuXG5cdCAqL1xuXHRwcml2YXRlIF9jYWNoZURpcnR5ID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIGFnZW50IGhvc3QncyBsYXp5LCBmaXJzdC11c2UgU0RLIGRvd25sb2FkIGFzIGEgbm90aWZpY2F0aW9uXG5cdCAqIHByb2dyZXNzIGJhci4gU2hhcmVkIHdpdGggdGhlIGVkaXRvciB3aW5kb3cgc28gYm90aCBzdXJmYWNlcyByZW5kZXJcblx0ICogZG93bmxvYWQgcHJvZ3Jlc3MgaWRlbnRpY2FsbHkuIEZlZCBieSB0aGUgYE5vdGlmaWNhdGlvblR5cGUuUHJvZ3Jlc3NgXG5cdCAqIGZyYW1lcyByZWNlaXZlZCBpbiB7QGxpbmsgX2F0dGFjaENvbm5lY3Rpb25MaXN0ZW5lcnN9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZG93bmxvYWRQcm9ncmVzczogQWdlbnRIb3N0RG93bmxvYWRQcm9ncmVzcztcblxuXHQvKipcblx0ICogVGVtcG9yYXJ5IHNlc3Npb24gdGhhdCBoYXMgYmVlbiBzZW50IChmaXJzdCB0dXJuIGRpc3BhdGNoZWQpIGJ1dCBub3QgeWV0XG5cdCAqIGNvbW1pdHRlZCBieSB0aGUgYmFja2VuZCBzZXNzaW9uIGxpc3QuIFNob3duIGluIHRoZSBzZXNzaW9uIGxpc3QgdW50aWwgdGhlXG5cdCAqIHNlcnZlciByZXBvcnRzIHRoZSBiYWNrZW5kIHNlc3Npb24sIGF0IHdoaWNoIHBvaW50IGl0IGlzIHJlcGxhY2VkIHZpYVxuXHQgKiB7QGxpbmsgX29uRGlkUmVwbGFjZVNlc3Npb259LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9wZW5kaW5nU2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJhdyBpZHMgb2YgYmFja2VuZCBzZXNzaW9ucyB0aGF0IGFuIGluLWZsaWdodCB7QGxpbmsgX3dhaXRGb3JOZXdTZXNzaW9ufVxuXHQgKiBoYXMgYWxyZWFkeSBtYXRjaGVkIHRvIGl0cyBzZW5kLCBzbyBhICpjb25jdXJyZW50KiBuZXctc2Vzc2lvbiBzZW5kIG9mXG5cdCAqIHRoZSBzYW1lIHNjaGVtZSBkb2VzIG5vdCByZXNvbHZlIHRvIHRoZSBzYW1lIGNvbW1pdHRlZCBzZXNzaW9uLiBFYWNoXG5cdCAqIG1hdGNoZWQgaWQgaXMgcmVsZWFzZWQgYnkgdGhlIG93bmluZyBzZW5kIGluIGl0cyBgZmluYWxseWAuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21taXR0aW5nU2Vzc2lvblJhd0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBPd24gcmF3IGlkcyAoe0BsaW5rIGNoYXRSZXNvdXJjZX0gcGF0aCkgb2YgY3VycmVudGx5IGluLWZsaWdodFxuXHQgKiBuZXctc2Vzc2lvbiBzZW5kcy4gQSBzZW5kJ3MgY29tbWl0dGVkIGJhY2tlbmQgc2Vzc2lvbiBrZWVwcyB0aGUgZWFnZXJcblx0ICogaWQgaXQgd2FzIGNyZWF0ZWQgd2l0aCwgc28ge0BsaW5rIF93YWl0Rm9yTmV3U2Vzc2lvbn0gbWF0Y2hlcyBhIHNlbmQgdG9cblx0ICogaXRzIE9XTiBpZCBmaXJzdC4gVGhlIG5vdmVsdHkgZmFsbGJhY2sgKGZvciBmbG93cyB3aGVyZSB0aGUgYmFja2VuZFxuXHQgKiBhc3NpZ25zIGEgZGlmZmVyZW50IGlkKSBtdXN0IHRoZW4gbmV2ZXIgbGF0Y2ggb250byAqYW5vdGhlciogaW4tZmxpZ2h0XG5cdCAqIHNlbmQncyBvd24gc2Vzc2lvbiBcdTIwMTQgb3RoZXJ3aXNlIHR3byBjb25jdXJyZW50IHNhbWUtc2NoZW1lIHNlbmRzIHJhY2luZ1xuXHQgKiBpbiBhIHNoYXJlZCBkb3dubG9hZC9tYXRlcmlhbGl6ZSB3aW5kb3cgd291bGQgc3dhcCBzZXNzaW9ucyAoZWFjaFxuXHQgKiBncmFkdWF0aW5nIG9udG8gdGhlIG90aGVyJ3MgY29tbWl0dGVkIHNlc3Npb24pLiBQb3B1bGF0ZWQgYXQgc2VuZCBzdGFydCxcblx0ICogY2xlYXJlZCBpbiB0aGUgc2VuZCdzIGBmaW5hbGx5YC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0TmV3U2Vzc2lvbk93bklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQgbmV3IHNlc3Npb25zIFx1MjAxNCBzZXNzaW9ucyBiZWluZyBjb21wb3NlZCBpbiB0aGUgbmV3LWNoYXQgdmlld1xuXHQgKiBiZWZvcmUgdGhlaXIgZmlyc3QgbWVzc2FnZSBpcyBzZW50LCBrZXllZCBieSBgc2Vzc2lvbklkYC4gU2VlXG5cdCAqIHtAbGluayBOZXdTZXNzaW9ufSBmb3IgdGhlIGVuY2Fwc3VsYXRlZCBzdGF0ZSBhbmQgbGlmZWN5Y2xlLlxuXHQgKlxuXHQgKiBIZWxkIGFzIGEge0BsaW5rIERpc3Bvc2FibGVNYXB9IHNvIG11bHRpcGxlIG5ldyBzZXNzaW9ucyBjYW4gYmUgdHJhY2tlZFxuXHQgKiBjb25jdXJyZW50bHkgKGUuZy4gd2hpbGUgb25lIGlzIHNlbmRpbmcgaW4gdGhlIGJhY2tncm91bmQgYW5kIHRoZSBjb21wb3NlclxuXHQgKiByZS1zZWVkcyBhIGZyZXNoIG9uZSkuIEVudHJpZXMgYXJlIGRpc3Bvc2VkIGluZGl2aWR1YWxseSB3aGVuIHNlbnRcblx0ICogKHtAbGluayBkZWxldGVBbmREaXNwb3NlfS97QGxpbmsgZGVsZXRlQW5kTGVha30pIG9yIGFiYW5kb25lZCAodmlhXG5cdCAqIHtAbGluayBkZWxldGVOZXdTZXNzaW9ufSksIGFuZCBhbGwgcmVtYWluaW5nIGVudHJpZXMgYXJlIGNsZWFuZWQgdXAgd2hlblxuXHQgKiB0aGUgcHJvdmlkZXIgaXRzZWxmIGlzIGRpc3Bvc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIE5ld1Nlc3Npb24+KCkpO1xuXG5cdC8qKiBUaGUgaW4tZmxpZ2h0IG5ldyBzZXNzaW9uIHdpdGggdGhlIGdpdmVuIGlkLCBpZiBhbnkuICovXG5cdHByb3RlY3RlZCBfZ2V0TmV3U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IE5ld1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGV2ZXJ5IGluLWZsaWdodCBuZXcgc2Vzc2lvbiwgZmlyaW5nIGVhY2ggb25lJ3MgYGRpc3Bvc2VTZXNzaW9uYFxuXHQgKiBzZW50aW5lbCBzbyB0aGUgZWFnZXJseS1jcmVhdGVkIGJhY2tlbmQgcmVjb3JkcyBhcmUgZnJlZWQuIFVzZWQgd2hlbiB0aGVcblx0ICogY29ubmVjdGlvbiBkcm9wcyBhbmQgdGhlIGNvbXBvc2VkLWJ1dC11bnNlbnQgZHJhZnRzIGNhbiBubyBsb25nZXIgY29tbWl0LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9kaXNwb3NlQWxsTmV3U2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdH1cblxuXHRkZWxldGVOZXdTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEZ1bGwgcmVzb2x2ZWQgY29uZmlnIChzY2hlbWEgKyB2YWx1ZXMpIGZvciBydW5uaW5nIHNlc3Npb25zLCBrZXllZCBieSBzZXNzaW9uIElELiAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3J1bm5pbmdTZXNzaW9uQ29uZmlncyA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHQvKipcblx0ICogTGFzdCBhdXRob3JpdGF0aXZlbHktcmVzb2x2ZWQgc2NoZW1hcyBmb3Ige0BsaW5rIFNFRURFRF9DT05GSUdfU0NIRU1BX0tFWVN9LFxuXHQgKiBzZWVkZWQgaW50byBuZXcgZHJhZnRzIHNvIHRoZWlyIGNoaXBzIHN1cnZpdmUgYSB3b3Jrc3BhY2UvYWdlbnQgc3dpdGNoLiBMaXZlc1xuXHQgKiBvbiB0aGUgcHJvdmlkZXIgKG5vdCB0aGUgcGlja2VyKSBzbyBpdCBvdXRsaXZlcyB0b29sYmFyIGl0ZW0gcmVjb25zdHJ1Y3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZWRDb25maWdTY2hlbWFzID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4oKTtcblxuXHQvKipcblx0ICogTGF6eSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbnMgdXNlZCB0byBzZWVkIHtAbGluayBfcnVubmluZ1Nlc3Npb25Db25maWdzfVxuXHQgKiBmb3Igc2Vzc2lvbnMgdGhhdCBhbHJlYWR5IGV4aXN0IG9uIHRoZSBhZ2VudCBob3N0IChlLmcuIGNyZWF0ZWQgaW4gYSBwcmlvclxuXHQgKiB3aW5kb3cpLiBUaGUgdW5kZXJseWluZyB3aXJlIHN1YnNjcmlwdGlvbiBpcyByZWZlcmVuY2UtY291bnRlZCBieVxuXHQgKiB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb259LCBzbyB3aGVuIHRoZSBzZXNzaW9uIGhhbmRsZXIgaXNcblx0ICogYWxzbyBzdWJzY3JpYmVkIChpLmUuIGNoYXQgY29udGVudCBpcyBsb2FkZWQpIG5vIGV4dHJhIHdpcmUgc3Vic2NyaWJlIGlzXG5cdCAqIGlzc3VlZC4gRWFjaCBlbnRyeSBpcyByZWxlYXNlZCBhZnRlclxuXHQgKiB7QGxpbmsgU0VTU0lPTl9TVEFURV9TVUJTQ1JJUFRJT05fSURMRV9NU30gb2Ygbm8gY2FsbHMgaW50byB0aGUga2VlcC1hbGl2ZVxuXHQgKiBoZWxwZXIsIHNvIHRoZSBzZXJ2ZXItc2lkZSByZWZjb3VudCBjYW4gZHJvcCBhbmQgYW55IGlkbGUgcmVzdG9yZWQgc2Vzc2lvblxuXHQgKiBzdGF0ZSBjYW4gYmUgZXZpY3RlZCBvbiB0aGUgYWdlbnQgaG9zdC4gS2V5ZWQgYnkgc2Vzc2lvbiBJRC5cblx0ICovXG5cdHByb3RlY3RlZCByZWFkb25seSBfc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHQvKipcblx0ICogSWRsZS1yZWxlYXNlIHRpbWVycyBwYWlyZWQgd2l0aCB7QGxpbmsgX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnN9LiBFYWNoXG5cdCAqIGNhbGwgdG8ge0BsaW5rIF9rZWVwU2Vzc2lvblN0YXRlQWxpdmV9IHJlc2V0cyB0aGUgdGltZXIgZm9yIGBzZXNzaW9uSWRgO1xuXHQgKiB3aGVuIHRoZSB0aW1lciBmaXJlcywgdGhlIHN1YnNjcmlwdGlvbiBpcyBkaXNwb3NlZCBhbmQgdGhlIHdpcmVcblx0ICogYHVuc3Vic2NyaWJlYCBmbG93cyB0aHJvdWdoIHtAbGluayBJQWdlbnRDb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbn0nc1xuXHQgKiByZWZjb3VudCB0byB0aGUgYWdlbnQgaG9zdC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHQvKipcblx0ICogU2Vzc2lvbiBpZHMgd2hvc2Ugdmlld3MgYXJlIGN1cnJlbnRseSB2aXNpYmxlIGluIHRoZSBBZ2VudHMgd2luZG93LiBUaGVpclxuXHQgKiBzdGF0ZSBzdWJzY3JpcHRpb24gaXMgcGlubmVkIG9wZW4gKG5vIGlkbGUgcmVsZWFzZSkgc28gaG9zdC1kcml2ZW4gY2F0YWxvZ1xuXHQgKiBjaGFuZ2VzIHRoZSB1c2VyIGRpZCBub3QgaW5pdGlhdGUgXHUyMDE0IG1vc3QgaW1wb3J0YW50bHkgc3Bhd25lZCBzdWJhZ2VudCBjaGF0c1xuXHQgKiAoe0BsaW5rIENoYXRPcmlnaW5LaW5kLlRvb2x9KSBcdTIwMTQga2VlcCBmbG93aW5nIGludG8gYGNhY2hlZC5jaGF0c2Agd2hpbGUgdGhlXG5cdCAqIHNlc3Npb24gaXMgb24gc2NyZWVuLiBXaXRob3V0IHRoaXMsIHRoZSBpZGxlIHRpbWVyIChvbmx5IHJlZnJlc2hlZCBieVxuXHQgKiBjbGllbnQtaW5pdGlhdGVkIGFjdGlvbnMvcXVlcmllcykgY2FuIHJlbGVhc2UgdGhlIHN0YXRlIGxpc3RlbmVyIG1pZC12aWV3LFxuXHQgKiBzbyBhIHN1YmFnZW50J3MgYGNoYXRBZGRlZGAgaXMgZHJvcHBlZCBhbmQgaXRzIGlubGluZSBcIk9wZW4gU3ViYWdlbnRcIiBwaWxsXG5cdCAqIGNhbm5vdCByZXNvbHZlIHVudGlsIHRoZSBzZXNzaW9uIGlzIHJlLXN1YnNjcmliZWQgKGUuZy4gc3dpdGNoZWQgYXdheSBhbmRcblx0ICogYmFjaykuIERyaXZlbiBieSB7QGxpbmsgX3N5bmNWaXNpYmxlU2Vzc2lvblN0YXRlUGluc30uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waW5uZWRTZXNzaW9uU3RhdGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJvdGVjdGVkIF9jYWNoZUluaXRpYWxpemVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTl9SRUZSRVNIX1JFVFJZX01JTl9NUyA9IDFfMDAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVNTSU9OX1JFRlJFU0hfUkVUUllfTUFYX01TID0gMzBfMDAwO1xuXG5cdC8qKlxuXHQgKiBCYWNrb2ZmIHRpbWVyIHRoYXQgcmV0cmllcyB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uc30gYWZ0ZXIgYSBmYWlsZWRcblx0ICogYXR0ZW1wdC4gQSBmYWlsZWQgaW5pdGlhbCBsaXN0IChlLmcuIHRoZSBhZ2VudCB0aHJld1xuXHQgKiBgQUhQX0FVVEhfUkVRVUlSRURgIGJlY2F1c2UgaXRzIHRva2VuIHdhc24ndCB5ZXQgZWZmZWN0aXZlIHNlcnZlci1zaWRlLFxuXHQgKiBvciBhIHRyYW5zaWVudCBvZmZsaW5lL25ldHdvcmsgZXJyb3IpIG11c3Qgbm90IGxlYXZlIHRoZSBzZXNzaW9uIGxpc3Rcblx0ICogcGVybWFuZW50bHkgZW1wdHkuIFRoZSB0aW1lciBpcyBhcm1lZCBvbmx5IG9uIGZhaWx1cmUgYW5kIGNhbmNlbGxlZCBvblxuXHQgKiB0aGUgbmV4dCBzdWNjZXNzZnVsIHJlZnJlc2guXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVmcmVzaFJldHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKiBDdXJyZW50IGJhY2tvZmYgZGVsYXkgKG1zKSBmb3IgdGhlIHNlc3Npb24tcmVmcmVzaCByZXRyeS4gKi9cblx0cHJpdmF0ZSBfc2Vzc2lvblJlZnJlc2hSZXRyeURlbGF5ID0gQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuU0VTU0lPTl9SRUZSRVNIX1JFVFJZX01JTl9NUztcblxuXHQvKiogVHJ1ZSB3aGlsZSBhIHtAbGluayBfcmVmcmVzaFNlc3Npb25zfSBjYWxsIGlzIGF3YWl0aW5nIGBsaXN0U2Vzc2lvbnMoKWAuICovXG5cdHByaXZhdGUgX3Nlc3Npb25SZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZXNzaW9uU2NvcGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUFnZW50Q3VzdG9taXphdGlvblNjb3BlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2xpZW50U3luY0NhbmNlbGxhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxBY3RpdmVDbGllbnRTeW5jQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIF9hY3RpdmVTZXNzaW9uU2NvcGVTZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVTZXNzaW9uU2NvcGVSb290czogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJR2l0SHViU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2dpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudFNlcnZpY2U6IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3REb3dubG9hZFByb2dyZXNzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgY2FjaGVkIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0XHRjYWNoZWQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgc3RhdGUgc3Vic2NyaXB0aW9uIG9mIGV2ZXJ5IG9uLXNjcmVlbiBzZXNzaW9uIHBpbm5lZCBzb1xuXHRcdC8vIGhvc3Qtc3Bhd25lZCBjYXRhbG9nIGNoYW5nZXMgKGUuZy4gc3ViYWdlbnRzKSByZWFjaCBgY2FjaGVkLmNoYXRzYFxuXHRcdC8vIGxpdmUsIGluc3RlYWQgb2YgcmVseWluZyBvbiB0aGUgaWRsZSB0aW1lciB0aGF0IG9ubHkgY2xpZW50IGFjdGlvbnNcblx0XHQvLyByZWZyZXNoLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuX3N5bmNWaXNpYmxlU2Vzc2lvblN0YXRlUGlucyhyZWFkZXIpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fc3luY0FjdGl2ZUNsaWVudCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNlc3Npb24tY2FjaGUgcGVyc2lzdGVuY2UuIFRoZXNlIGxpc3RlbmVycyBhcmUgaW5lcnQgdW50aWwgYSBzdWJjbGFzc1xuXHRcdC8vIG9wdHMgaW4gdmlhIGBfZW5hYmxlU2Vzc2lvbkNhY2hlUGVyc2lzdGVuY2VgICh3aGljaCBzZXRzIHRoZSBzdG9yYWdlXG5cdFx0Ly8ga2V5KS4gVGhleSBhcmUgc2FmZSB0byByZWdpc3RlciB1bmNvbmRpdGlvbmFsbHkgYmVjYXVzZSB0aGV5IG9ubHkgYWN0XG5cdFx0Ly8gYXQgZXZlbnQgdGltZSBhbmQgcmVhZCB0aGUga2V5IGxhemlseS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50KGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zaG91bGRUcmFja1Nlc3Npb25DYWNoZUNoYW5nZXMoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZGRlZC5sZW5ndGggPiAwIHx8IGUucmVtb3ZlZC5sZW5ndGggPiAwIHx8IGUuY2hhbmdlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2NhY2hlRGlydHkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChyZW1vdmVkLnNlc3Npb25JZCk7XG5cdFx0XHRcdGlmIChyYXdJZCkge1xuXHRcdFx0XHRcdHRoaXMuX21ldGFCeVJhd0lkLmRlbGV0ZShyYXdJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zZXNzaW9uQ2FjaGVTdG9yYWdlS2V5ICYmIHRoaXMuX2NhY2hlRGlydHkpIHtcblx0XHRcdFx0dGhpcy5fcGVyc2lzdENhY2hlKCk7XG5cdFx0XHRcdHRoaXMuX2NhY2hlRGlydHkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLSBTdWJjbGFzcyBob29rcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqIEN1cnJlbnQgY29ubmVjdGlvbiAoYWx3YXlzIHByZXNlbnQgZm9yIGxvY2FsOyBtYXkgYmUgdW5kZWZpbmVkIHdoaWxlIGRpc2Nvbm5lY3RlZCBmb3IgcmVtb3RlKS4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldCBjb25uZWN0aW9uKCk6IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqIFByb3ZpZGVyLWxldmVsIGF1dGhlbnRpY2F0aW9uLXBlbmRpbmcgb2JzZXJ2YWJsZSB1c2VkIHRvIGRlcml2ZSBgbG9hZGluZ2AgZm9yIHNlc3Npb25zLiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0IGF1dGhlbnRpY2F0aW9uUGVuZGluZygpOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogU3ViY2xhc3Mtc3BlY2lmaWMgcG9ydGlvbiBvZiB0aGUgYWRhcHRlciBvcHRpb25zLiBCYXNlIGZpbGxzIGluXG5cdCAqIHRoZSBiaXRzIHRoYXQgYXJlIHVuaWZvcm0gYWNyb3NzIGhvc3RzIChgaWNvbmAsIGBsb2FkaW5nYCxcblx0ICogYG1hcERpZmZVcmlgKSBmcm9tIHRoZSBjb3JyZXNwb25kaW5nIGhvb2tzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9hZGFwdGVyT3B0aW9ucygpOiBQaWNrPElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucywgJ2J1aWxkV29ya3NwYWNlJyB8ICdyZWFkT25seSc+O1xuXG5cdC8qKlxuXHQgKiBIb29rIHRvIG5vcm1hbGl6ZSBhIHNlc3Npb24ncyBtZXRhZGF0YSBiZWZvcmUgaXQgaXMgY2FjaGVkLCBrZXllZCwgb3Jcblx0ICogcGVyc2lzdGVkLiBUaGUgZGVmYXVsdCBpcyBpZGVudGl0eS4gU3ViY2xhc3NlcyBvdmVycmlkZSB0aGlzIHdoZW4gdGhlIGhvc3Rcblx0ICogYWRkcmVzc2VzIHNlc3Npb25zIHVuZGVyIGEgc2NoZW1lIHRoYXQgZGlmZmVycyBmcm9tIHRoZSBhZ2VudCBwcm92aWRlclxuXHQgKiAoZS5nLiBhIGNsb3VkIHNhbmRib3ggaG9zdCB0aGF0IGxpc3RzIHNlc3Npb25zIGFzIGBhaHAtc2Vzc2lvbjovPGlkPmAgd2hpbGVcblx0ICogaXRzIGFnZW50IHByb3ZpZGVyIGlzIGBjb3BpbG90YCksIHNvIHRoYXQgcm91dGluZywgcGVyc2lzdGVuY2UsIGFuZCBjb250ZW50XG5cdCAqIHJlc29sdXRpb24gYWxsIGFncmVlIG9uIGEgc2luZ2xlIHNjaGVtZS4gTXVzdCBwcmVzZXJ2ZSB0aGUgcmF3IHNlc3Npb24gaWRcblx0ICogKFVSSSBwYXRoKSBzbyBjYWNoZSBrZXlzIHJlbWFpbiBzdGFibGUuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2Fkb3B0U2Vzc2lvbk1ldGEobWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0XHRyZXR1cm4gbWV0YTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYmFja2VuZCAod2lyZSkgc2Vzc2lvbiBVUkkgc2NoZW1lIGZvciBhIGdpdmVuIGFnZW50IHByb3ZpZGVyLiBEZWZhdWx0IGlzXG5cdCAqIGlkZW50aXR5IChzY2hlbWUgPT0gcHJvdmlkZXIpLCB3aGljaCBob2xkcyBmb3IgZXZlcnkgaG9zdCBleGNlcHQgdGhlIENvcGlsb3Rcblx0ICogaG9zdCB1c2VkIGJ5IGNsb3VkIHNhbmRib3gsIHdob3NlIHNlc3Npb25zIGFyZSBhZGRyZXNzZWQgdW5kZXJcblx0ICogYGFocC1zZXNzaW9uOi88aWQ+YCB3aGlsZSB0aGUgYWdlbnQgcHJvdmlkZXIgaXMgYGNvcGlsb3RgLiBTdWJjbGFzc2VzXG5cdCAqIG92ZXJyaWRlIHRoaXMgc28gYWxsIGJhY2tlbmQgYEFnZW50U2Vzc2lvbi51cmkoLi4uKWAgcmVjb25zdHJ1Y3Rpb25zIG9uIHRoZVxuXHQgKiBhZGFwdGVyIGFuZCBwcm92aWRlciB1c2UgdGhlIGhvc3QncyByZWFsIHNjaGVtZS4gTXVzdCBiZSBhIHN0YWJsZSBwZXItcHJvdmlkZXJcblx0ICogbWFwcGluZy5cblx0ICovXG5cdHByb3RlY3RlZCBfYmFja2VuZFNlc3Npb25TY2hlbWUoYWdlbnRQcm92aWRlcjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYWdlbnRQcm92aWRlcjtcblx0fVxuXG5cdC8qKiBCdWlsZCBhbiBhZGFwdGVyIGZvciB0aGUgZ2l2ZW4gbWV0YWRhdGEuICovXG5cdHByb3RlY3RlZCBjcmVhdGVBZGFwdGVyKG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IEFnZW50SG9zdFNlc3Npb25BZGFwdGVyIHtcblx0XHRjb25zdCBwcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihtZXRhLnNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgc2Vzc2lvbiBVUkkgaGFzIG5vIHByb3ZpZGVyIHNjaGVtZTogJHttZXRhLnNlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2VTY2hlbWUgPSB0aGlzLnJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdGljb246IHRoaXMuaWNvbkZvckFnZW50UHJvdmlkZXIocHJvdmlkZXIpID8/IHRoaXMuaWNvbixcblx0XHRcdGxvYWRpbmc6IHRoaXMuYXV0aGVudGljYXRpb25QZW5kaW5nLFxuXHRcdFx0bWFwRGlmZlVyaTogdGhpcy5fZGlmZlVyaU1hcHBlcigpLFxuXHRcdFx0Z2l0SHViU2VydmljZTogdGhpcy5fZ2l0SHViU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGdldENvbm5lY3Rpb246ICgpID0+IHRoaXMuY29ubmVjdGlvbixcblx0XHRcdGFnZW50Q2FwYWJpbGl0aWVzOiB0aGlzLl9hZ2VudENhcGFiaWxpdGllcyxcblx0XHRcdGJhY2tlbmRTZXNzaW9uU2NoZW1lOiB0aGlzLl9iYWNrZW5kU2Vzc2lvblNjaGVtZShwcm92aWRlciksXG5cdFx0XHQuLi50aGlzLl9hZGFwdGVyT3B0aW9ucygpLFxuXHRcdH0gc2F0aXNmaWVzIElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucztcblxuXHRcdHRoaXMuX21ldGFCeVJhd0lkLnNldChBZ2VudFNlc3Npb24uaWQobWV0YS5zZXNzaW9uKSwgbWV0YSk7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNlc3Npb25BZGFwdGVyLCBtZXRhLCB0aGlzLmlkLCByZXNvdXJjZVNjaGVtZSwgcHJvdmlkZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUFkYXB0ZXIoYWRhcHRlcjogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIsIG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX21ldGFCeVJhd0lkLnNldChBZ2VudFNlc3Npb24uaWQobWV0YS5zZXNzaW9uKSwgbWV0YSk7XG5cdFx0dGhpcy5fY2FjaGVEaXJ0eSA9IHRydWU7XG5cdFx0cmV0dXJuIGFkYXB0ZXIudXBkYXRlKG1ldGEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGVzIHRoZSBVUkkgcmVzb3VyY2Ugc2NoZW1lIHVzZWQgdG8gcm91dGUgc2Vzc2lvbiBVUklzIHRvIHRoaXNcblx0ICogcHJvdmlkZXIncyBjb250ZW50IHByb3ZpZGVyIGZvciBhIGdpdmVuIGFnZW50IHByb3ZpZGVyIG5hbWUuIExvY2FsXG5cdCAqIHVzZXMgYGFnZW50LWhvc3QtJHtwcm92aWRlcn1gOyByZW1vdGUgdXNlcyBhIHBlci1jb25uZWN0aW9uIHNjaGVtZS5cblx0ICpcblx0ICogVGhlIHJlc291cmNlIHNjaGVtZSBpcyBob3N0LXNwZWNpZmljIGFuZCBleGlzdHMgcHVyZWx5IGZvciBjb250ZW50XG5cdCAqIHByb3ZpZGVyIHJvdXRpbmcuIFRoZSBsb2dpY2FsIHtAbGluayBJU2Vzc2lvbi5zZXNzaW9uVHlwZX0gaXMgdGhlXG5cdCAqIGFnZW50IHByb3ZpZGVyIG5hbWUgaXRzZWxmLCBzbyB0aGUgc2FtZSBhZ2VudCAoZS5nLiBgY29waWxvdGNsaWApXG5cdCAqIGFwcGVhcnMgdW5kZXIgb25lIHNoYXJlZCBzZXNzaW9uIHR5cGUgYWNyb3NzIGhvc3RzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXIocHJvdmlkZXI6IHN0cmluZyk6IHN0cmluZztcblxuXHQvKiogRm9ybWF0IHRoZSBodW1hbi1yZWFkYWJsZSBsYWJlbCBmb3IgYSBzZXNzaW9uIHR5cGUgZW50cnkgKGUuZy4gYENvcGlsb3RgKS4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9mb3JtYXRTZXNzaW9uVHlwZUxhYmVsKGFnZW50TGFiZWw6IHN0cmluZyk6IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciBgcHJvdmlkZXJgIHNob3VsZCBiZSBhZHZlcnRpc2VkIGFzIGEgc2Vzc2lvbiB0eXBlIGJ5IHRoaXMgaG9zdC5cblx0ICogRGVmYXVsdHMgdG8gYHRydWVgIChhZHZlcnRpc2UgZXZlcnl0aGluZyB0aGUgaG9zdCByZXBvcnRzKS4gVGhlIGxvY2FsXG5cdCAqIHByb3ZpZGVyIG92ZXJyaWRlcyB0aGlzIHRvIHN1cHByZXNzIHRoZSBhZ2VudCBob3N0J3MgQ2xhdWRlIHdoZW4gdGhlXG5cdCAqIHdpbmRvdyBwcmVmZXJzIHRoZSBleHRlbnNpb24taG9zdCBDbGF1ZGUsIG1pcnJvcmluZyB0aGUgZ2F0ZVxuXHQgKiB7QGxpbmsgQWdlbnRIb3N0Q29udHJpYnV0aW9ufSBhcHBsaWVzIHRvIHRoZSBjaGF0IHNlc3Npb24gY29udHJpYnV0aW9uIHNvXG5cdCAqIHRoZSB3ZWxjb21lIHBpY2tlciBkb2Vzbid0IGxpc3QgQ2xhdWRlIHR3aWNlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRBZHZlcnRpc2VBZ2VudChfcHJvdmlkZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zeW5jUm9vdFN0YXRlKHJvb3RTdGF0ZTogUm9vdFN0YXRlIHwgRXJyb3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAocm9vdFN0YXRlICYmICEocm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHR0aGlzLl9zeW5jU2Vzc2lvblR5cGVzRnJvbVJvb3RTdGF0ZShyb290U3RhdGUpO1xuXHRcdFx0dGhpcy5fc3luY1Jvb3RDb25maWdGcm9tUm9vdFN0YXRlKHJvb3RTdGF0ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3luY0FnZW50Q2FwYWJpbGl0aWVzKHVuZGVmaW5lZCk7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25UeXBlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVHlwZXMgPSBbXTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmZpcmUoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Jvb3RDb25maWcpIHtcblx0XHRcdHRoaXMuX3Jvb3RDb25maWcgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJvb3RDb25maWcuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N5bmNBZ2VudENhcGFiaWxpdGllcyhhZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xhc3RBZ2VudHMgPT09IGFnZW50cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RBZ2VudHMgPSBhZ2VudHM7XG5cdFx0dGhpcy5fYWdlbnRDYXBhYmlsaXRpZXMuc2V0KGFnZW50cyA/IG5ldyBNYXAoYWdlbnRzLm1hcChhZ2VudCA9PiBbYWdlbnQucHJvdmlkZXIsIGFnZW50LmNhcGFiaWxpdGllc10pKSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUN1c3RvbUFnZW50cy5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25jaWxlIHtAbGluayBfc2Vzc2lvblR5cGVzfSBhZ2FpbnN0IHRoZSBhZ2VudHMgYWR2ZXJ0aXNlZCBieSB0aGVcblx0ICogaG9zdCdzIHJvb3Qgc3RhdGUsIGZpcmluZyB7QGxpbmsgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXN9IG9ubHkgaWYgdGhlXG5cdCAqIGlkL2xhYmVsIHNldCBhY3R1YWxseSBjaGFuZ2VkLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zeW5jU2Vzc2lvblR5cGVzRnJvbVJvb3RTdGF0ZShyb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3N5bmNBZ2VudENhcGFiaWxpdGllcyhyb290U3RhdGUuYWdlbnRzKTtcblx0XHRjb25zdCBuZXh0ID0gcm9vdFN0YXRlLmFnZW50c1xuXHRcdFx0LmZpbHRlcihhZ2VudCA9PiB0aGlzLl9zaG91bGRBZHZlcnRpc2VBZ2VudChhZ2VudC5wcm92aWRlcikpXG5cdFx0XHQubWFwKChhZ2VudCk6IElTZXNzaW9uVHlwZSA9PiAoe1xuXHRcdFx0XHRpZDogYWdlbnQucHJvdmlkZXIsXG5cdFx0XHRcdHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uOiBhZ2VudC5wcm92aWRlciA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkLFxuXHRcdFx0XHRhdXRoUmVxdWlyZW1lbnQ6IHJlc29sdmVBZ2VudEF1dGhSZXF1aXJlbWVudChhZ2VudCksXG5cdFx0XHRcdC8vIFRoZSBjaGF0IHNlc3Npb24gY29udHJpYnV0aW9uIGFuZCBsYW5ndWFnZSBtb2RlbHMgZm9yIGFuIGFnZW50LWhvc3Rcblx0XHRcdFx0Ly8gYWdlbnQgYXJlIHJlZ2lzdGVyZWQgdW5kZXIgaXRzIHJlc291cmNlIHNjaGVtZSAoYGFnZW50LWhvc3QtPHByb3ZpZGVyPmApLFxuXHRcdFx0XHQvLyBub3QgdGhlIGJhcmUgcHJvdmlkZXIgaWQsIHNvIGNhcnJ5IGl0IGZvciBhdmFpbGFiaWxpdHkgbG9va3Vwcy5cblx0XHRcdFx0Y2hhdFNlc3Npb25UeXBlOiB0aGlzLnJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXIoYWdlbnQucHJvdmlkZXIpLFxuXHRcdFx0XHRsYWJlbDogdGhpcy5fZm9ybWF0U2Vzc2lvblR5cGVMYWJlbChhZ2VudC5kaXNwbGF5TmFtZT8udHJpbSgpIHx8IGFnZW50LnByb3ZpZGVyKSxcblx0XHRcdFx0aWNvbjogdGhpcy5pY29uRm9yQWdlbnRQcm92aWRlcihhZ2VudC5wcm92aWRlcikgPz8gdGhpcy5pY29uLFxuXHRcdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuX3Nlc3Npb25UeXBlcztcblx0XHRpZiAocHJldi5sZW5ndGggPT09IG5leHQubGVuZ3RoICYmIHByZXYuZXZlcnkoKHQsIGkpID0+IHQuaWQgPT09IG5leHRbaV0uaWQgJiYgdC5sYWJlbCA9PT0gbmV4dFtpXS5sYWJlbCAmJiB0LmF1dGhSZXF1aXJlbWVudCA9PT0gbmV4dFtpXS5hdXRoUmVxdWlyZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25UeXBlcyA9IG5leHQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHtAbGluayBUaGVtZUljb259IGFzc29jaWF0ZWQgd2l0aCBhIGtub3duIGFnZW50IHByb3ZpZGVyLCBvclxuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBwcm92aWRlciBpcyBub3QgcmVjb2duaXNlZC5cblx0ICovXG5cdHByaXZhdGUgaWNvbkZvckFnZW50UHJvdmlkZXIocHJvdmlkZXI6IHN0cmluZyk6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHByb3ZpZGVyID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpIHtcblx0XHRcdHJldHVybiBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWNvbjtcblx0XHR9XG5cblx0XHRpZiAocHJvdmlkZXIuaW5jbHVkZXMoJ2NsYXVkZScpKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5jbGF1ZGU7XG5cdFx0fVxuXG5cdFx0aWYgKHByb3ZpZGVyID09PSAnb3BlbmFpJyB8fCBwcm92aWRlci5pbmNsdWRlcygnY29kZXgnKSkge1xuXHRcdFx0cmV0dXJuIENvZGljb24ub3BlbmFpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25jaWxlIHtAbGluayBfcm9vdENvbmZpZ30gYWdhaW5zdCB7QGxpbmsgUm9vdFN0YXRlLmNvbmZpZ30sIGZpcmluZ1xuXHQgKiB7QGxpbmsgb25EaWRDaGFuZ2VSb290Q29uZmlnfSBvbmx5IHdoZW4gc2NoZW1hIG9yIHZhbHVlcyBhY3R1YWxseSBjaGFuZ2UuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3N5bmNSb290Q29uZmlnRnJvbVJvb3RTdGF0ZShyb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSByb290U3RhdGUuY29uZmlnO1xuXHRcdGNvbnN0IHByZXYgPSB0aGlzLl9yb290Q29uZmlnO1xuXHRcdGlmIChwcmV2ID09PSBuZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghbmV4dCkge1xuXHRcdFx0dGhpcy5fcm9vdENvbmZpZyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdENvbmZpZy5maXJlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChwcmV2Py5zY2hlbWEgPT09IG5leHQuc2NoZW1hICYmIGVxdWFscyhwcmV2LnZhbHVlcywgbmV4dC52YWx1ZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Jvb3RDb25maWcgPSBuZXh0O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdENvbmZpZy5maXJlKCk7XG5cdH1cblxuXHRhYnN0cmFjdCByZXNvbHZlV29ya3NwYWNlKHJlcG9zaXRvcnlVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBPcHRpb25hbCBldmVudCBmaXJlZCB3aGVuIHRoZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb24gaXMgbG9zdDsgdXNlZCB0byBzaG9ydC1jaXJjdWl0IGBfd2FpdEZvck5ld1Nlc3Npb25gLiAqL1xuXHRwcm90ZWN0ZWQgZ2V0IG9uQ29ubmVjdGlvbkxvc3QoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gRXZlbnQuTm9uZTsgfVxuXG5cdC8qKiBNYXBzIGEgd29ya2luZy1kaXJlY3RvcnkgVVJJIGZyb20gdGhlIHNlc3Npb24gc3VtbWFyeSB0byBhIGxvY2FsIFVSSS4gRGVmYXVsdCBpZGVudGl0eTsgcmVtb3RlIG92ZXJyaWRlcyB0byBgdG9BZ2VudEhvc3RVcmlgLiAqL1xuXHRwcm90ZWN0ZWQgbWFwV29ya2luZ0RpcmVjdG9yeVVyaSh1cmk6IFVSSSk6IFVSSSB7IHJldHVybiB1cmk7IH1cblxuXHQvKiogTWFwcyBhIHByb2plY3QgVVJJIGZyb20gdGhlIHNlc3Npb24gc3VtbWFyeSB0byBhIGxvY2FsIFVSSS4gRGVmYXVsdCBpZGVudGl0eTsgcmVtb3RlIG92ZXJyaWRlcyBmb3IgYGZpbGU6YCBwYXRocy4gKi9cblx0cHJvdGVjdGVkIG1hcFByb2plY3RVcmkodXJpOiBVUkkpOiBVUkkgeyByZXR1cm4gdXJpOyB9XG5cblx0Ly8gLS0gU2Vzc2lvbiBsaXN0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGdldFNlc3Npb25UeXBlcyhfcmVwb3NpdG9yeVVyaTogVVJJKTogSVNlc3Npb25UeXBlW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5zZXNzaW9uVHlwZXNdO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY0FjdGl2ZUNsaWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBjYW5jZWxsYXRpb24gPSBuZXcgQWN0aXZlQ2xpZW50U3luY0NhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fYWN0aXZlQ2xpZW50U3luY0NhbmNlbGxhdGlvbi52YWx1ZSA9IGNhbmNlbGxhdGlvbjtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8IGFjdGl2ZVNlc3Npb24ucHJvdmlkZXJJZCAhPT0gdGhpcy5pZCkge1xuXHRcdFx0dGhpcy5fY2xlYXJBY3RpdmVTZXNzaW9uU2NvcGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChhY3RpdmVTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghcmF3SWQgfHwgIWNhY2hlZCB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0dGhpcy5fY2xlYXJBY3RpdmVTZXNzaW9uU2NvcGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMucmVzb3VyY2VTY2hlbWVGb3JQcm92aWRlcihjYWNoZWQuYWdlbnRQcm92aWRlcik7XG5cdFx0bGV0IHNjb3BlID0gdGhpcy5fYWN0aXZlU2Vzc2lvblNjb3BlLnZhbHVlO1xuXHRcdGlmICghc2NvcGUgfHwgdGhpcy5fYWN0aXZlU2Vzc2lvblNjb3BlU2Vzc2lvblR5cGUgIT09IHNlc3Npb25UeXBlIHx8ICFhcmVDdXN0b21pemF0aW9uU2NvcGVSb290c0VxdWFsKHRoaXMuX2FjdGl2ZVNlc3Npb25TY29wZVJvb3RzLCBjYWNoZWQud29ya2luZ0RpcmVjdG9yaWVzKSkge1xuXHRcdFx0c2NvcGUgPSB0aGlzLl9hY3RpdmVDbGllbnRTZXJ2aWNlLmFjcXVpcmVTY29wZShzZXNzaW9uVHlwZSwgY2FjaGVkLndvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uU2NvcGUudmFsdWUgPSBzY29wZTtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25TY29wZVNlc3Npb25UeXBlID0gc2NvcGUgPyBzZXNzaW9uVHlwZSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25TY29wZVJvb3RzID0gc2NvcGUgPyBbLi4uY2FjaGVkLndvcmtpbmdEaXJlY3Rvcmllc10gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghc2NvcGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2b2lkIHRoaXMuX2Rpc3BhdGNoQWN0aXZlQ2xpZW50V2hlblJlc29sdmVkKGNhbmNlbGxhdGlvbi50b2tlbiwgYWN0aXZlU2Vzc2lvbi5zZXNzaW9uSWQsIHJhd0lkLCBjYWNoZWQsIGNvbm5lY3Rpb24sIHNjb3BlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoQWN0aXZlQ2xpZW50V2hlblJlc29sdmVkKFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRhY3RpdmVTZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRyYXdJZDogc3RyaW5nLFxuXHRcdGNhY2hlZDogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIsXG5cdFx0Y29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbixcblx0XHRzY29wZTogSUFnZW50Q3VzdG9taXphdGlvblNjb3BlLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHNjb3BlLndoZW5SZXNvbHZlZCgpLCB0b2tlbik7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChcblx0XHRcdHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8XG5cdFx0XHRzY29wZSAhPT0gdGhpcy5fYWN0aXZlU2Vzc2lvblNjb3BlLnZhbHVlIHx8XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb24gIT09IGNvbm5lY3Rpb24gfHxcblx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpICE9PSBjYWNoZWQgfHxcblx0XHRcdGFjdGl2ZVNlc3Npb24/LnByb3ZpZGVySWQgIT09IHRoaXMuaWQgfHxcblx0XHRcdGFjdGl2ZVNlc3Npb24uc2Vzc2lvbklkICE9PSBhY3RpdmVTZXNzaW9uSWRcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVDbGllbnQgPSBzY29wZS5hY3RpdmVDbGllbnQoY29ubmVjdGlvbi5jbGllbnRJZCkuZ2V0KCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoY2FjaGVkLnNlc3Npb25JZCk/LmFjdGl2ZUNsaWVudHMuZmluZChjbGllbnQgPT4gY2xpZW50LmNsaWVudElkID09PSBhY3RpdmVDbGllbnQuY2xpZW50SWQpO1xuXHRcdGlmIChlcXVhbHMoZXhpc3RpbmcsIGFjdGl2ZUNsaWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKEFnZW50U2Vzc2lvbi51cmkoY2FjaGVkLmFnZW50UHJvdmlkZXIsIHJhd0lkKS50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckFjdGl2ZVNlc3Npb25TY29wZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVDbGllbnRTeW5jQ2FuY2VsbGF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblNjb3BlLmNsZWFyKCk7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblNjb3BlU2Vzc2lvblR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblNjb3BlUm9vdHMgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHQvLyBGaWx0ZXIgYXQgcmVhZCB0aW1lIChyYXRoZXIgdGhhbiBldmljdGluZyBmcm9tIHRoZSBjYWNoZSkgc28gYSBnYXRlXG5cdFx0Ly8gZmxpcCBpcyBpbnN0YW50IGluIGJvdGggZGlyZWN0aW9uczogaGlkZGVuIHNlc3Npb25zIHN0YXkgY2FjaGVkIGFuZFxuXHRcdC8vIHJlYXBwZWFyIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHByZWZlcmVuY2UgZmxpcHMgYmFjay4gVGhlIGRlZmF1bHQgZ2F0ZVxuXHRcdC8vIGFkbWl0cyBldmVyeXRoaW5nOyBvbmx5IHRoZSBsb2NhbCBwcm92aWRlciBzdXBwcmVzc2VzIHRoZSBhZ2VudCBob3N0J3Ncblx0XHQvLyBDbGF1ZGUgd2hlbiB0aGUgd2luZG93IHByZWZlcnMgdGhlIGV4dGVuc2lvbi1ob3N0IENsYXVkZS5cblx0XHQvL1xuXHRcdC8vIEJvdGggYGFnZW50UHJvdmlkZXJgIChjYWNoZWQpIGFuZCBgc2Vzc2lvblR5cGVgIChwZW5kaW5nKSBjYXJyeSB0aGVcblx0XHQvLyBiYXJlIHByb3ZpZGVyIG5hbWUgKGUuZy4gYGNsYXVkZWApLCB3aGljaCBpcyB3aGF0IHRoZSBnYXRlIGV4cGVjdHMgXHUyMDE0XG5cdFx0Ly8gTk9UIHRoZSBgYWdlbnQtaG9zdC08cHJvdmlkZXI+YCByZXNvdXJjZSBzY2hlbWUgZnJvbVxuXHRcdC8vIGByZXNvdXJjZVNjaGVtZUZvclByb3ZpZGVyYC4gS2VlcCBpdCB0aGF0IHdheS5cblx0XHQvL1xuXHRcdC8vIFN1YmNsYXNzZXMgd2hvc2UgYF9zaG91bGRBZHZlcnRpc2VBZ2VudGAgY2FuIGNoYW5nZSBhdCBydW50aW1lIE1VU1Rcblx0XHQvLyBmaXJlIGBvbkRpZENoYW5nZVNlc3Npb25zYCB3aGVuIGl0IGRvZXMsIHNvIGNvbnN1bWVycyByZS1xdWVyeSBhbmRcblx0XHQvLyByZS1maWx0ZXIgKHNlZSB0aGUgbG9jYWwgcHJvdmlkZXIncyBgcHJlZmVyQWdlbnRIb3N0YCBsaXN0ZW5lcikuXG5cdFx0Y29uc3QgcGVuZGluZ1Nlc3Npb24gPSB0aGlzLl9wZW5kaW5nU2Vzc2lvbjtcblx0XHRjb25zdCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2FjaGVkIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHBlbmRpbmdTZXNzaW9uICYmIGlzRXF1YWwoY2FjaGVkLnJlc291cmNlLCBwZW5kaW5nU2Vzc2lvbi5yZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc2hvdWxkQWR2ZXJ0aXNlQWdlbnQoY2FjaGVkLmFnZW50UHJvdmlkZXIpKSB7XG5cdFx0XHRcdHNlc3Npb25zLnB1c2goY2FjaGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBlbmRpbmdTZXNzaW9uICYmIHRoaXMuX3Nob3VsZEFkdmVydGlzZUFnZW50KHBlbmRpbmdTZXNzaW9uLnNlc3Npb25UeXBlKSkge1xuXHRcdFx0c2Vzc2lvbnMucHVzaChwZW5kaW5nU2Vzc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9ucztcblx0fVxuXG5cdGdldFNlc3Npb25CeVJlc291cmNlKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBuZXdTZXNzaW9uIG9mIHRoaXMuX25ld1Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAobmV3U2Vzc2lvbi5zZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmV0dXJuIG5ld1Nlc3Npb24uc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGVuZGluZ1Nlc3Npb24/LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wZW5kaW5nU2Vzc2lvbjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHRmb3IgKGNvbnN0IGNhY2hlZCBvZiB0aGlzLl9zZXNzaW9uQ2FjaGUudmFsdWVzKCkpIHtcblx0XHRcdGlmIChjYWNoZWQucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHQvLyBPcGVuaW5nIGEgc2Vzc2lvbjogc3Vic2NyaWJlIHRvIGl0cyBBSFAgc3RhdGUgc28gdGhhdFxuXHRcdFx0XHQvLyBgX21ldGFgIChlLmcuIGxhenkgZ2l0IHN0YXRlIGNvbXB1dGVkIGJ5IHRoZSBhZ2VudCBob3N0KVxuXHRcdFx0XHQvLyBmbG93cyBpbnRvIHRoZSBjYWNoZWQgYWRhcHRlci4gVGhlIGtlZXAtYWxpdmUgaGVscGVyIHJlc2V0c1xuXHRcdFx0XHQvLyBhbiBpZGxlIHRpbWVyIHNvIHRoZSBzdWJzY3JpcHRpb24gaXMgZHJvcHBlZCBvbmNlIHRoZSBzZXNzaW9uXG5cdFx0XHRcdC8vIGlzIG5vIGxvbmdlciBiZWluZyB0b3VjaGVkLCBhbGxvd2luZyB0aGUgYWdlbnQgaG9zdCB0byBldmljdFxuXHRcdFx0XHQvLyBpZGxlIHJlc3RvcmVkIHN0YXRlLlxuXHRcdFx0XHR0aGlzLl9rZWVwU2Vzc2lvblN0YXRlQWxpdmUoY2FjaGVkLnNlc3Npb25JZCk7XG5cdFx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIC0tIFNlc3Npb24gbGlmZWN5Y2xlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRjcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZVVyaTogVVJJLCBzZXNzaW9uVHlwZUlkOiBzdHJpbmcsIG9wdGlvbnM/OiBJU2Vzc2lvbnNQcm92aWRlckNyZWF0ZVNlc3Npb25PcHRpb25zKTogSVNlc3Npb24ge1xuXHRcdGlmICghd29ya3NwYWNlVXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZSBoYXMgbm8gcmVwb3NpdG9yeSBVUkknKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuc2Vzc2lvblR5cGVzLmZpbmQodCA9PiB0LmlkID09PSBzZXNzaW9uVHlwZUlkKTtcblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5fbm9BZ2VudHNFcnJvck1lc3NhZ2UoKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmFsaWRhdGVCZWZvcmVDcmVhdGUoc2Vzc2lvblR5cGUpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5yZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZVVyaSk7XG5cdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgd29ya3NwYWNlIGZvciBVUkk6ICR7d29ya3NwYWNlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURyYWZ0U2Vzc2lvbihzZXNzaW9uVHlwZSwgd29ya3NwYWNlLCBmYWxzZSwgb3B0aW9ucz8ubWV0YWRhdGEpO1xuXHR9XG5cblx0c3RhcnROZXdTZXNzaW9uUmVxdWVzdChzZXNzaW9uSWQ6IHN0cmluZywgYWN0aXZpdHk/OiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoIW5ld1Nlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHN0YXJ0IGEgc2Vzc2lvbiB0aGF0IGlzIG5vIGxvbmdlciBwZW5kaW5nLicpO1xuXHRcdH1cblx0XHRuZXdTZXNzaW9uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdG5ld1Nlc3Npb24uc2V0QWN0aXZpdHkoYWN0aXZpdHkpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gbmV3U2Vzc2lvbi5zZXRBY3Rpdml0eSh1bmRlZmluZWQpKTtcblx0fVxuXG5cdGNyZWF0ZVF1aWNrQ2hhdChzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLnNlc3Npb25UeXBlcy5maW5kKHQgPT4gdC5pZCA9PT0gc2Vzc2lvblR5cGVJZCk7XG5cdFx0aWYgKCFzZXNzaW9uVHlwZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuX25vQWdlbnRzRXJyb3JNZXNzYWdlKCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZhbGlkYXRlQmVmb3JlQ3JlYXRlKHNlc3Npb25UeXBlKTtcblxuXHRcdC8vIEEgcXVpY2sgY2hhdCBpcyB0aGUgc2FtZSBzZXNzaW9uIHR5cGUgYXMgYSBub3JtYWwgc2Vzc2lvbiwganVzdFxuXHRcdC8vIHdvcmtzcGFjZS1sZXNzOiBubyBgcmVzb2x2ZVdvcmtzcGFjZWAsIG5vIGB3b3JraW5nRGlyZWN0b3J5YC4gVGhlXG5cdFx0Ly8gYWdlbnQgaG9zdCBydW5zIGl0IGluIGEgdGhyb3dhd2F5IHNjcmF0Y2ggY3dkIGFuZCB0YWdzIGl0IHZpYSB0aGVcblx0XHQvLyBgcXVpY2tDaGF0YCBjcmVhdGUgZmxhZy5cblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRHJhZnRTZXNzaW9uKHNlc3Npb25UeXBlLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcywgdHJhY2tzLCBhbmQgZWFnZXJseSBzdGFydHMgYSB7QGxpbmsgTmV3U2Vzc2lvbn0gZHJhZnQgZm9yIHRoZVxuXHQgKiBnaXZlbiBzZXNzaW9uIHR5cGUuIFNoYXJlZCBieSB7QGxpbmsgY3JlYXRlTmV3U2Vzc2lvbn0gKHdvcmtzcGFjZS1ib3VuZClcblx0ICogYW5kIHtAbGluayBjcmVhdGVRdWlja0NoYXR9ICh3b3Jrc3BhY2UtbGVzcywgYHF1aWNrQ2hhdCA9PT0gdHJ1ZWApLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlRHJhZnRTZXNzaW9uKHNlc3Npb25UeXBlOiBJU2Vzc2lvblR5cGUsIHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQsIHF1aWNrQ2hhdDogYm9vbGVhbiwgaW5pdGlhbE1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBJU2Vzc2lvbiB7XG5cdFx0Ly8gVGVhci1kb3duIG9mIHN1cGVyc2VkZWQgZHJhZnRzIGlzIGhhbmRsZWQgYnkgdGhlIG1hbmFnZW1lbnQgbGF5ZXJcblx0XHQvLyAoaXQgY2FsbHMgYGRlbGV0ZU5ld1Nlc3Npb25gIG9uIHRoZSBwcmV2aW91cyBwZW5kaW5nIHNlc3Npb24pLiBFYWNoXG5cdFx0Ly8gbmV3IHNlc3Npb24gaXMgdHJhY2tlZCBpbmRlcGVuZGVudGx5IGluIGBfbmV3U2Vzc2lvbnNgIHNvIHNldmVyYWwgY2FuXG5cdFx0Ly8gYmUgaW4gZmxpZ2h0IGF0IG9uY2UgKGUuZy4gb25lIHNlbmRpbmcgaW4gdGhlIGJhY2tncm91bmQgd2hpbGUgdGhlXG5cdFx0Ly8gY29tcG9zZXIgcmUtc2VlZHMgYSBmcmVzaCBkcmFmdCkuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRjb25zdCByZXNvdXJjZVNjaGVtZSA9IHRoaXMucmVzb3VyY2VTY2hlbWVGb3JQcm92aWRlcihzZXNzaW9uVHlwZS5pZCk7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50U2NvcGUgPSB0aGlzLl9hY3RpdmVDbGllbnRTZXJ2aWNlLmFjcXVpcmVTY29wZShyZXNvdXJjZVNjaGVtZSwgd29ya3NwYWNlPy5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnJvb3QpID8/IFtdKTtcblx0XHRsZXQgbmV3U2Vzc2lvbjogTmV3U2Vzc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0bmV3U2Vzc2lvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld1Nlc3Npb24sIHtcblx0XHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0XHRxdWlja0NoYXQsXG5cdFx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdFx0XHRwcm92aWRlcklkOiB0aGlzLmlkLFxuXHRcdFx0XHRpY29uOiBzZXNzaW9uVHlwZS5pY29uLFxuXHRcdFx0XHRyZXNvdXJjZVNjaGVtZSxcblx0XHRcdFx0YmFja2VuZFNlc3Npb25TY2hlbWU6IHRoaXMuX2JhY2tlbmRTZXNzaW9uU2NoZW1lKHNlc3Npb25UeXBlLmlkKSxcblx0XHRcdFx0YXV0aGVudGljYXRpb25QZW5kaW5nOiB0aGlzLmF1dGhlbnRpY2F0aW9uUGVuZGluZyxcblx0XHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0aW5pdGlhbENvbmZpZ1ZhbHVlczogdGhpcy5faW5pdGlhbE5ld1Nlc3Npb25Db25maWcod29ya3NwYWNlKSxcblx0XHRcdFx0aW5pdGlhbENvbmZpZ1NjaGVtYTogdGhpcy5fc2VlZGVkQ29uZmlnU2NoZW1hKCksXG5cdFx0XHRcdGluaXRpYWxNZXRhZGF0YSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRvblNlc3Npb25TdGF0ZTogKGlkLCBzdGF0ZSkgPT4gc3RhdGUgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gdGhpcy5faGFuZGxlTmV3U2Vzc2lvblN0YXRlR29uZShpZClcblx0XHRcdFx0XHQ6IHRoaXMuX2hhbmRsZU5ld1Nlc3Npb25TdGF0ZVVwZGF0ZShpZCwgc3RhdGUpLFxuXHRcdFx0XHRhY3RpdmVDbGllbnRTY29wZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWNvbjogdGhpcy5pY29uRm9yQWdlbnRQcm92aWRlcihzZXNzaW9uVHlwZS5pZCkgPz8gdGhpcy5pY29uLFxuXHRcdFx0XHRsb2FkaW5nOiB0aGlzLmF1dGhlbnRpY2F0aW9uUGVuZGluZyxcblx0XHRcdFx0bWFwRGlmZlVyaTogdGhpcy5fZGlmZlVyaU1hcHBlcigpLFxuXHRcdFx0XHRnaXRIdWJTZXJ2aWNlOiB0aGlzLl9naXRIdWJTZXJ2aWNlLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdGdldENvbm5lY3Rpb246ICgpID0+IHRoaXMuY29ubmVjdGlvbixcblx0XHRcdFx0YWdlbnRDYXBhYmlsaXRpZXM6IHRoaXMuX2FnZW50Q2FwYWJpbGl0aWVzLFxuXHRcdFx0XHQuLi50aGlzLl9hZGFwdGVyT3B0aW9ucygpLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUFnZW50SG9zdEFkYXB0ZXJPcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFjdGl2ZUNsaWVudFNjb3BlPy5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdHRoaXMuX25ld1Nlc3Npb25zLnNldChuZXdTZXNzaW9uLnNlc3Npb25JZCwgbmV3U2Vzc2lvbik7XG5cdFx0bmV3U2Vzc2lvbi5vYnNlcnZlQ2xpZW50Q3VzdG9tQWdlbnRzKGFjdGl2ZUNsaWVudFNjb3BlPy5jdXN0b21BZ2VudHMgPz8gY29uc3RPYnNlcnZhYmxlKFtdKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUobmV3U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0Ly8gS2ljayBvZmYgdGhlIGluaXRpYWwgY29uZmlnIHJlc29sdmUgYW5kIHRoZSBlYWdlciBiYWNrZW5kIHNlc3Npb25cblx0XHQvLyBpbiBwYXJhbGxlbCBhZnRlciBhdXRoZW50aWNhdGlvbiBzZXR0bGVzLiBXaGlsZSBhdXRoIGlzIHBlbmRpbmcsXG5cdFx0Ly8gcHJvdmlkZXJzIHN1Y2ggYXMgQ29kZXggcmVqZWN0IGJvdGggcGF0aHMgd2l0aCBBdXRoUmVxdWlyZWQ7IHRoZVxuXHRcdC8vIHN1YmNsYXNzIGNhbGxzIF9yZXN1bWVOZXdTZXNzaW9uQWZ0ZXJBdXRoZW50aWNhdGlvblNldHRsZXMgd2hlbiB0aGVcblx0XHQvLyBmaXJzdCBhdXRoIHBhc3MgY29tcGxldGVzLlxuXHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRpZiAoIXRoaXMuYXV0aGVudGljYXRpb25QZW5kaW5nLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0TmV3U2Vzc2lvbkJhY2tlbmQobmV3U2Vzc2lvbiwgY29ubmVjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1Nlc3Npb24uc2V0TG9hZGluZyhmYWxzZSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdTZXNzaW9uLnNlc3Npb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Jlc3VtZU5ld1Nlc3Npb25BZnRlckF1dGhlbnRpY2F0aW9uU2V0dGxlcygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG5ld1Nlc3Npb24gb2YgdGhpcy5fbmV3U2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdHRoaXMuX3N0YXJ0TmV3U2Vzc2lvbkJhY2tlbmQobmV3U2Vzc2lvbiwgY29ubmVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnROZXdTZXNzaW9uQmFja2VuZChuZXdTZXNzaW9uOiBOZXdTZXNzaW9uLCBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uKTogdm9pZCB7XG5cdFx0Ly8gUmVzb2x2aW5nIHRoZSBzZXNzaW9uIGNvbmZpZyAoc2NoZW1hICsgZGVmYXVsdHMgZm9yIHRoZSBwaWNrZXIgY2hpcHMpXG5cdFx0Ly8gaXMgcGFydCBvZiB2aWV3aW5nIHRoZSBuZXctc2Vzc2lvbiBVSSBhbmQgc3RheXMgdW5nYXRlZC5cblx0XHR2b2lkIG5ld1Nlc3Npb24udHJhY2tDb25maWdSZXNvbHV0aW9uKHRoaXMuX3JlZnJlc2hOZXdTZXNzaW9uQ29uZmlnKG5ld1Nlc3Npb24sIHsgbWFya1Nlc3Npb25Mb2FkaW5nOiB0cnVlIH0pKTtcblxuXHRcdC8vIERlZmVuc2UtaW4tZGVwdGg6IG5ldmVyIGVhZ2VybHkgc3Bhd24gYW4gYWdlbnQgYmFja2VuZCBpbiBhblxuXHRcdC8vIHVudHJ1c3RlZCBmb2xkZXIuIFRoZSBpbnRlcmFjdGl2ZSB0cnVzdCBwcm9tcHQgbGl2ZXMgYXQgZm9sZGVyLXBpY2tcblx0XHQvLyB0aW1lIChuZXdDaGF0V2lkZ2V0KSBhbmQgYSBiYWNrc3RvcCBydW5zIG9uIGZpcnN0IFNlbmRcblx0XHQvLyAoQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIpLCBzbyBpbiB0aGUgbm9ybWFsIGZsb3cgdGhlIGZvbGRlciBpc1xuXHRcdC8vIGFscmVhZHkgdHJ1c3RlZCBoZXJlLiBUaGlzIGd1YXJkcyBhbHRlcm5hdGUgZW50cnkgcG9pbnRzIChlLmcuXG5cdFx0Ly8gZGVsZWdhdGlvbikuIE5vLW9wIGZvciBwcm92aWRlcnMgdGhhdCBkb24ndCByZXF1aXJlIHRydXN0IChyZW1vdGUpLlxuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IG5ld1Nlc3Npb24ud29ya3NwYWNlVXJpO1xuXHRcdGNvbnN0IGNhbkNyZWF0ZSA9IG5ld1Nlc3Npb24ucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCAmJiB3b3Jrc3BhY2VVcmkgPyBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRydXN0ZWQgfSA9IGF3YWl0IHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKHdvcmtzcGFjZVVyaSk7XG5cdFx0XHRpZiAodGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KG5ld1Nlc3Npb24uc2Vzc2lvbklkKSAhPT0gbmV3U2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgWyR7dGhpcy5pZH1dIFNraXBwaW5nIGVhZ2VyIGNyZWF0ZVNlc3Npb24gZm9yIHVudHJ1c3RlZCBmb2xkZXIgJHt3b3Jrc3BhY2VVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0bmV3U2Vzc2lvbi5zZXRMb2FkaW5nKGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSA6IHVuZGVmaW5lZDtcblx0XHRuZXdTZXNzaW9uLmVhZ2VyQ3JlYXRlKGNvbm5lY3Rpb24sIGNhbkNyZWF0ZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtcmVzb2x2ZXMgc2Vzc2lvbiBjb25maWcgYW5kIHB1bHNlcyB7QGxpbmsgX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZ30uXG5cdCAqIEV4cGVjdGVkIHZhbHVlcyBhcmUgdmFsaWRhdGVkIGFmdGVyIHN0cmljdCByZXNvbHV0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hOZXdTZXNzaW9uQ29uZmlnKHNlc3Npb246IE5ld1Nlc3Npb24sIG9wdGlvbnM6IHtcblx0XHRyZWFkb25seSBleHBlY3RlZD86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHVua25vd24+Pjtcblx0XHRyZWFkb25seSBtYXJrU2Vzc2lvbkxvYWRpbmc/OiBib29sZWFuO1xuXHR9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGV4cGVjdGVkLCBtYXJrU2Vzc2lvbkxvYWRpbmcgfSA9IG9wdGlvbnM7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdC8vIHtAbGluayByZXNvbHZlQ29uZmlnfSAodGhlIG9ubHkgb3RoZXIgY2xlYXIgcGF0aCkgaXMgc2tpcHBlZFxuXHRcdFx0Ly8gb24gdGhpcyBicmFuY2gsIHNvIGNsZWFyIHRoZSBmbGFnIGhlcmUgdG8gYXZvaWQgc3RhbGxpbmdcblx0XHRcdC8vIHRoZSBwaWNrZXIgZm9yZXZlci5cblx0XHRcdHNlc3Npb24uZW5kUmVzb2x2ZUNvbmZpZ1N5bmMoKTtcblx0XHRcdHNlc3Npb24uc2V0TG9hZGluZyhmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRpZiAoZXhwZWN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgc2V0IHNlc3Npb24gcmVwb3NpdG9yeSBjb25maWcgd2l0aG91dCBhbiBhZ2VudCBob3N0IGNvbm5lY3Rpb24uJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChtYXJrU2Vzc2lvbkxvYWRpbmcpIHtcblx0XHRcdHNlc3Npb24uc2V0TG9hZGluZyh0cnVlKTtcblx0XHR9XG5cdFx0bGV0IGFwcGxpZWQ6IGJvb2xlYW47XG5cdFx0dHJ5IHtcblx0XHRcdGFwcGxpZWQgPSBhd2FpdCBzZXNzaW9uLnJlc29sdmVDb25maWcoY29ubmVjdGlvbiwgISFleHBlY3RlZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHNlc3Npb24uc2V0TG9hZGluZyhmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0Ly8gQmFpbCBpZiBhIG5ld2VyIGNhbGwgc3VwZXJzZWRlZCB1cyBcdTIwMTQgaXRzIG93biBwdWxzZSB3aWxsIHRha2Ugb3Zlci5cblx0XHRpZiAoIWFwcGxpZWQgfHwgdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKSAhPT0gc2Vzc2lvbikge1xuXHRcdFx0aWYgKGV4cGVjdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiByZXBvc2l0b3J5IGNvbmZpZyB3YXMgc3VwZXJzZWRlZCBiZWZvcmUgaXQgY291bGQgYmUgYXBwbGllZC4nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnID0gc2Vzc2lvbi5nZXRDb25maWcoKTtcblx0XHR0aGlzLl9jYWNoZVNlZWRlZENvbmZpZ1NjaGVtYXMoY29uZmlnKTtcblx0XHRzZXNzaW9uLnNldExvYWRpbmcoY29uZmlnICE9PSB1bmRlZmluZWQgJiYgIWlzU2Vzc2lvbkNvbmZpZ0NvbXBsZXRlKGNvbmZpZykpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRmb3IgKGNvbnN0IFtwcm9wZXJ0eSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGV4cGVjdGVkID8/IHt9KSkge1xuXHRcdFx0aWYgKCFlcXVhbHMoY29uZmlnPy52YWx1ZXNbcHJvcGVydHldLCB2YWx1ZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBZ2VudCBob3N0IGRpZCBub3QgYXBwbHkgc2Vzc2lvbiBjb25maWcgJyR7cHJvcGVydHl9Jy5gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU25hcHNob3QgdGhlIHdlbGwta25vd24ge0BsaW5rIFNFRURFRF9DT05GSUdfU0NIRU1BX0tFWVN9IHNjaGVtYXMgZnJvbSBhblxuXHQgKiBhdXRob3JpdGF0aXZlIHJlc29sdmUgc28gdGhlIG5leHQgbmV3IGRyYWZ0IGNhbiByZW5kZXIgdGhvc2UgY2hpcHNcblx0ICogaW1tZWRpYXRlbHkgKGRpc2FibGVkKSBpbnN0ZWFkIG9mIGJsYW5raW5nLiBBIGB1bmRlZmluZWRgIGNvbmZpZyAoZmFpbGVkXG5cdCAqIHJlc29sdmUpIGxlYXZlcyB0aGUgcHJldmlvdXMgY2FjaGUgaW50YWN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FjaGVTZWVkZWRDb25maWdTY2hlbWFzKGNvbmZpZzogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBTRUVERURfQ09ORklHX1NDSEVNQV9LRVlTKSB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjb25maWcuc2NoZW1hLnByb3BlcnRpZXNba2V5XTtcblx0XHRcdGlmIChzY2hlbWEpIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVkQ29uZmlnU2NoZW1hcy5zZXQoa2V5LCBzY2hlbWEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVkQ29uZmlnU2NoZW1hcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogU2VlZCBzY2hlbWEgZm9yIGEgZnJlc2ggZHJhZnQsIG9yIGB1bmRlZmluZWRgIHdoZW4gbm90aGluZyBpcyBjYWNoZWQgeWV0LiAqL1xuXHRwcml2YXRlIF9zZWVkZWRDb25maWdTY2hlbWEoKTogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZENvbmZpZ1NjaGVtYXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VlZDogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBzY2hlbWFdIG9mIHRoaXMuX2NhY2hlZENvbmZpZ1NjaGVtYXMpIHtcblx0XHRcdHNlZWRba2V5XSA9IHNjaGVtYTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlZWQ7XG5cdH1cblxuXHQvKiogU3ViY2xhc3MgaG9vayBmb3IgYWRkaXRpb25hbCBwcmUtY3JlYXRlIGNoZWNrcyAoZS5nLiByZW1vdGUgcmVxdWlyZXMgY29ubmVjdGlvbikuICovXG5cdHByb3RlY3RlZCBfdmFsaWRhdGVCZWZvcmVDcmVhdGUoX3Nlc3Npb25UeXBlOiBJU2Vzc2lvblR5cGUpOiB2b2lkIHsgLyogZGVmYXVsdDogbm8tb3AgKi8gfVxuXG5cdC8qKiBMb2NhbGl6ZWQgXCJubyBhZ2VudHNcIiBlcnJvciBtZXNzYWdlLiBTdWJjbGFzc2VzIGNhbiBvdmVycmlkZS4gKi9cblx0cHJvdGVjdGVkIF9ub0FnZW50c0Vycm9yTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbm9BZ2VudHMnLCBcIkFnZW50IGhvc3QgaGFzIG5vdCBhZHZlcnRpc2VkIGFueSBhZ2VudHMgeWV0LlwiKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbml0aWFsIHNlc3Npb24tY29uZmlnIHZhbHVlcyBhcHBsaWVkIHRvIGEgYnJhbmQtbmV3IGFnZW50LWhvc3Qgc2Vzc2lvblxuXHQgKiBiZWZvcmUgaXRzIHNjaGVtYSBpcyByZXNvbHZlZC4gVmFsdWVzIGFyZSBzZWVkZWQgZnJvbSBwb3J0YWJsZSBwaWNrcyBpblxuXHQgKiB0aGUgcHJvZmlsZS1zY29wZWQgcmVtZW1iZXJlZCBzZXNzaW9uLWNvbmZpZyBtYXAgYW5kIHRoZW4gbm9ybWFsaXplZFxuXHQgKiBhZ2FpbnN0IHBvbGljeS9mZWF0dXJlIGNvbnN0cmFpbnRzLlxuXHQgKlxuXHQgKiBUaGUgYWdlbnQtaG9zdCBkZWZhdWx0cyBhcmUgY29udHJvbGxlZCBieSB0aGUgc2luZ2xlXG5cdCAqIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYCBvYmplY3Qgc2V0dGluZyAod2l0aCBgbW9kZWAgYW5kXG5cdCAqIGBhcHByb3ZhbHNgIHByb3BlcnRpZXMpLiBQZXIgYXhpcyB0aGUgcHJlY2VkZW5jZSBpczogZW50ZXJwcmlzZVxuXHQgKiAqKnBvbGljeSoqIHZhbHVlID4gdGhlIHVzZXIncyAqKnJlbWVtYmVyZWQqKiBsYXN0IHBpY2sgPiB0aGUgb3JkaW5hcnlcblx0ICogY29uZmlndXJlZCAqKnNldHRpbmcqKiB2YWx1ZSAodHJlYXRlZCBhcyBhIHBsYWluIGRlZmF1bHQpID4gc2NoZW1hXG5cdCAqIGRlZmF1bHQuIFNvIGEgbm9ybWFsIHNldHRpbmcgYmVoYXZlcyBhcyBhIGRlZmF1bHQgdGhhdCB0aGUgcmVtZW1iZXJlZFxuXHQgKiBwaWNrIG92ZXJyaWRlcywgd2hpbGUgYW4gZW50ZXJwcmlzZSBwb2xpY3kgc3RpbGwgd2lucyBvdXRyaWdodC4gVGhlXG5cdCAqIGxvY2FsLW9ubHkgYGNoYXQucGVybWlzc2lvbnMuZGVmYXVsdGAgc2V0dGluZyBpcyBpbnRlbnRpb25hbGx5IE5PVFxuXHQgKiBjb25zdWx0ZWQgaGVyZS5cblx0ICpcblx0ICogSWYgZW50ZXJwcmlzZSBwb2xpY3kgZGlzYWJsZXMgZ2xvYmFsIGF1dG8tYXBwcm92YWxcblx0ICogKGBjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZWAgcG9saWN5IHZhbHVlIGBmYWxzZWApLCB0aGUgYXBwcm92YWwgc2VlZFxuXHQgKiBpcyBjbGFtcGVkIHRvIGBkZWZhdWx0YCBzbyB0aGUgYWdlbnQgaG9zdCBuZXZlciBzdGFydHMgaW4gYW4gZWxldmF0ZWRcblx0ICogcGVybWlzc2lvbiBsZXZlbCB0aGUgdXNlciBpcyBub3QgYWxsb3dlZCB0byBwaWNrLlxuXHQgKlxuXHQgKiBUaGUgdXNlcidzIGBnaXQuYnJhbmNoUHJlZml4YCBzZXR0aW5nIChyZXNvdXJjZS1zY29wZWQgdG8gdGhlIHdvcmtzcGFjZSdzXG5cdCAqIGZpcnN0IGZvbGRlcikgaXMgc2VlZGVkIGludG8gdGhlIGB3b3JrdHJlZUJyYW5jaFByZWZpeGAgc2xvdCBzbyB0aGUgYWdlbnRcblx0ICogaG9zdCBjYW4gcHJlcGVuZCBpdCB0byB0aGUgYnJhbmNoIGl0IGNyZWF0ZXMgZm9yIGFuIGlzb2xhdGVkIHdvcmt0cmVlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pbml0aWFsTmV3U2Vzc2lvbkNvbmZpZyh3b3Jrc3BhY2U/OiBJU2Vzc2lvbldvcmtzcGFjZSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25maWcgPSBPYmplY3QuY3JlYXRlKG51bGwpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gU2VlZCBzZXNzaW9uIGNvbmZpZyB2YWx1ZXMgZnJvbSB0aGUgbGFzdCB1c2VyIHBpY2tzLCBtaWdyYXRpbmcgYW55XG5cdFx0Ly8gbGVnYWN5IGBhdXRvQXBwcm92ZT0nYXV0b3BpbG90J2AgcmVtZW1iZXJlZCB2YWx1ZSBpbnRvIHRoZSBuZXdcblx0XHQvLyBgbW9kZT0nYXV0b3BpbG90J2Agc2hhcGUgYmVmb3JlIHRoZSBwZXItYXhpcyBwcmVjZWRlbmNlIGJlbG93IHJ1bnMuXG5cdFx0Y29uc3QgcmVtZW1iZXJlZFZhbHVlcyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB7fSk7XG5cdFx0Zm9yIChjb25zdCBbcHJvcGVydHksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZW1lbWJlcmVkVmFsdWVzKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgaXNSZW1lbWJlcmVkU2Vzc2lvbkNvbmZpZ0tleShwcm9wZXJ0eSkpIHtcblx0XHRcdFx0Y29uZmlnW3Byb3BlcnR5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZW1lbWJlcmVkID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyhjb25maWcpO1xuXG5cdFx0Ly8gYGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb25gIGNvbnRyb2xzIGJvdGggYXhlcy4gUGVyIGF4aXMgdGhlXG5cdFx0Ly8gcHJlY2VkZW5jZSBpczogZW50ZXJwcmlzZSBwb2xpY3kgPiByZW1lbWJlcmVkIHBpY2sgPiBlZmZlY3RpdmVcblx0XHQvLyBjb25maWd1cmVkIHZhbHVlIChgaW5zcGVjdCgpLnZhbHVlYCwgd2hpY2ggaXMgdGhlIHVzZXIncyBzZXR0aW5nIG9yXG5cdFx0Ly8gdGhlIHNjaGVtYSBkZWZhdWx0KS4gYGluc3BlY3QoKS52YWx1ZWAgaXMgdXNlZCBpbnN0ZWFkIG9mXG5cdFx0Ly8gYGdldFZhbHVlKClgIG9ubHkgc28gdGhlIHBvbGljeSBsYXllciBjYW4gYmUgbGlmdGVkIGFib3ZlIHRoZVxuXHRcdC8vIHJlbWVtYmVyZWQgcGljay5cblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxJQ2hhdERlZmF1bHRDb25maWd1cmF0aW9uPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgcG9saWN5RGVmYXVsdHMgPSBpbnNwZWN0ZWQucG9saWN5VmFsdWU7XG5cdFx0Y29uc3QgZWZmZWN0aXZlRGVmYXVsdHMgPSBpbnNwZWN0ZWQudmFsdWU7XG5cblx0XHQvLyBBcHByb3ZhbCBheGlzOiBwb2xpY3kgPiByZW1lbWJlcmVkID4gZWZmZWN0aXZlLlxuXHRcdGNvbnN0IHJlc29sdmVkQXV0b0FwcHJvdmUgPVxuXHRcdFx0bm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZShwb2xpY3lEZWZhdWx0cz8uYXBwcm92YWxzLCBwb2xpY3lSZXN0cmljdGVkKVxuXHRcdFx0Pz8gbm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZShyZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdLCBwb2xpY3lSZXN0cmljdGVkKVxuXHRcdFx0Pz8gbm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZShlZmZlY3RpdmVEZWZhdWx0cz8uYXBwcm92YWxzLCBwb2xpY3lSZXN0cmljdGVkKTtcblx0XHRpZiAocmVzb2x2ZWRBdXRvQXBwcm92ZSkge1xuXHRcdFx0cmVtZW1iZXJlZFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSA9IHJlc29sdmVkQXV0b0FwcHJvdmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSByZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdO1xuXHRcdH1cblxuXHRcdC8vIE1vZGUgYXhpczogcG9saWN5ID4gcmVtZW1iZXJlZCA+IGVmZmVjdGl2ZS5cblx0XHRjb25zdCByZXNvbHZlZE1vZGUgPSBbcG9saWN5RGVmYXVsdHM/Lm1vZGUsIHJlbWVtYmVyZWRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSwgZWZmZWN0aXZlRGVmYXVsdHM/Lm1vZGVdXG5cdFx0XHQuZmluZCgodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBLTk9XTl9NT0RFX1ZBTFVFUy5oYXModmFsdWUpKTtcblx0XHRpZiAocmVzb2x2ZWRNb2RlKSB7XG5cdFx0XHRyZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPSByZXNvbHZlZE1vZGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSByZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuTW9kZV07XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3RyZWUgYnJhbmNoIHByZWZpeCwgZm9yd2FyZGVkIGZyb20gYGdpdC5icmFuY2hQcmVmaXhgLiBTZWVkZWRcblx0XHQvLyBoZXJlIChyYXRoZXIgdGhhbiByZW1lbWJlcmVkKSBzaW5jZSBpdCBpcyBkZXJpdmVkIGZyb20gYSBzZXR0aW5nLCBub3Rcblx0XHQvLyBhIHVzZXIgcGljazsgYW4gZW1wdHkgdmFsdWUgaXMgb21pdHRlZCBzbyB0aGUgZGVmYXVsdCBicmFuY2ggbmFtaW5nXG5cdFx0Ly8gaXMgcHJlc2VydmVkLlxuXHRcdGNvbnN0IHJlc291cmNlID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGNvbnN0IGJyYW5jaFByZWZpeCA9IHRoaXMuX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdnaXQuYnJhbmNoUHJlZml4JywgeyByZXNvdXJjZSB9KTtcblx0XHRpZiAodHlwZW9mIGJyYW5jaFByZWZpeCA9PT0gJ3N0cmluZycgJiYgYnJhbmNoUHJlZml4Lmxlbmd0aCA+IDApIHtcblx0XHRcdHJlbWVtYmVyZWRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF0gPSBicmFuY2hQcmVmaXg7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3RyZWVJbmNsdWRlRmlsZXMgPSB0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdnaXQud29ya3RyZWVJbmNsdWRlRmlsZXMnLCB7IHJlc291cmNlIH0pO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHdvcmt0cmVlSW5jbHVkZUZpbGVzKSAmJiB3b3JrdHJlZUluY2x1ZGVGaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdID0gd29ya3RyZWVJbmNsdWRlRmlsZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKHJlbWVtYmVyZWQpLmxlbmd0aCA+IDAgPyByZW1lbWJlcmVkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gLS0gRHluYW1pYyBzZXNzaW9uIGNvbmZpZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQ6IHN0cmluZyk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBOZXctc2Vzc2lvbiBjb25maWcgd2lucyAoZHVyaW5nIHByZS1jcmVhdGlvbiBmbG93KS4gT3RoZXJ3aXNlIGxhemlseVxuXHRcdC8vIHN1YnNjcmliZSB0byB0aGUgc2Vzc2lvbidzIHN0YXRlIHNvIHRoZSBydW5uaW5nIHBpY2tlciBjYW4gc2VlZCBpdHNcblx0XHQvLyBzY2hlbWEvdmFsdWVzIGZyb20gdGhlIEFIUCBgU2Vzc2lvblN0YXRlLmNvbmZpZ2Agc25hcHNob3QgZm9yIHNlc3Npb25zXG5cdFx0Ly8gdGhhdCB3ZXJlbid0IGNyZWF0ZWQgaW4gdGhpcyB3aW5kb3cuIEVhY2ggcXVlcnkgYnVtcHMgdGhlIGlkbGUgdGltZXJcblx0XHQvLyBzbyB0aGUgc3Vic2NyaXB0aW9uIHN0YXlzIGFsaXZlIHdoaWxlIHRoZSBwaWNrZXIgKG9yIGFueSBvdGhlciBVSVxuXHRcdC8vIHN1cmZhY2UpIGlzIHJlcGVhdGVkbHkgcmVhZGluZyB0aGUgcnVubmluZyBjb25maWcuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIG5ld1Nlc3Npb24uZ2V0Q29uZmlnKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShzZXNzaW9uSWQpO1xuXHRcdHJldHVybiB0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZ2V0KHNlc3Npb25JZCk7XG5cdH1cblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZTogYHRydWVgIHdoaWxlIGEgYHJlc29sdmVTZXNzaW9uQ29uZmlnYCByb3VuZC10cmlwIGlzIGluXG5cdCAqIGZsaWdodC4gRGlzdGluY3QgZnJvbSBgc2Vzc2lvbi5sb2FkaW5nYCAod2hpY2ggYWxzbyBjb3ZlcnMgdGhlXG5cdCAqIHJlcXVpcmVkLXZhbHVlcy1taXNzaW5nIHN0YXRlKSBcdTIwMTQgcGlja2VycyBnYXRlIG9uIHRoaXMgc28gdGhleSBzdGF5XG5cdCAqIGludGVyYWN0aXZlIHdoZW4gdGhlIHVzZXIgaGFzIHRvIGZpbGwgaW4gcmVxdWlyZWQgdmFsdWVzLlxuXHQgKi9cblx0aXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb25JZDogc3RyaW5nKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIG5ld1Nlc3Npb25cblx0XHRcdD8gbmV3U2Vzc2lvbi5pc1Jlc29sdmluZ0NvbmZpZ1xuXHRcdFx0OiBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRWYWx1ZSA9IG5vcm1hbGl6ZVNlc3Npb25Db25maWdWYWx1ZShwcm9wZXJ0eSwgdmFsdWUsIHBvbGljeVJlc3RyaWN0ZWQpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgcG9ydGFibGUgY29uZmlnIHBpY2tzIGFjcm9zcyBzZXNzaW9ucy5cblx0XHRpZiAodHlwZW9mIG5vcm1hbGl6ZWRWYWx1ZSA9PT0gJ3N0cmluZycgJiYgaXNSZW1lbWJlcmVkU2Vzc2lvbkNvbmZpZ0tleShwcm9wZXJ0eSkpIHtcblx0XHRcdGNvbnN0IHJlbWVtYmVyZWRWYWx1ZXMgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwge30pO1xuXHRcdFx0Y29uc3QgbmV4dFJlbWVtYmVyZWRWYWx1ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHJlbWVtYmVyZWRWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmVtZW1iZXJlZFZhbHVlcykpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiByZW1lbWJlcmVkVmFsdWUgPT09ICdzdHJpbmcnICYmIGlzUmVtZW1iZXJlZFNlc3Npb25Db25maWdLZXkoa2V5KSkge1xuXHRcdFx0XHRcdG5leHRSZW1lbWJlcmVkVmFsdWVzW2tleV0gPSByZW1lbWJlcmVkVmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG5leHRSZW1lbWJlcmVkVmFsdWVzW3Byb3BlcnR5XSA9IG5vcm1hbGl6ZWRWYWx1ZTtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBKU09OLnN0cmluZ2lmeShuZXh0UmVtZW1iZXJlZFZhbHVlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgcmVzb2x1dGlvbiBiZWZvcmUgZmlyaW5nIHNvIHRoZSBmaXJzdCBwaWNrZXIgcmVuZGVyIGlzIGFscmVhZHkgaW5lcnQuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0Ly8gRGVmZW5zZS1pbi1kZXB0aDogcGlja2VycyByZW5kZXIgZGlzYWJsZWQgZHVyaW5nIGEgcmVzb2x2ZSxcblx0XHRcdC8vIGJ1dCBrZXlib2FyZCBkcm9wZG93biBhbmQgbW9iaWxlIHNoZWV0IHBhdGhzIGJ5cGFzcyB0aGF0LlxuXHRcdFx0Ly8gRHJvcCB0aGUgc2Vjb25kIHBpY2sgc28gaXQgY2FuJ3QgcmFjZSB0aGUgc2NoZW1hIHJlcGxhY2VtZW50LlxuXHRcdFx0aWYgKG5ld1Nlc3Npb24uaXNSZXNvbHZpbmdDb25maWcuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bmV3U2Vzc2lvbi5iZWdpblJlc29sdmVDb25maWdTeW5jKCk7XG5cdFx0XHRuZXdTZXNzaW9uLnNldENvbmZpZ1ZhbHVlKHByb3BlcnR5LCBub3JtYWxpemVkVmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUoc2Vzc2lvbklkKTtcblx0XHRcdGF3YWl0IG5ld1Nlc3Npb24udHJhY2tDb25maWdSZXNvbHV0aW9uKHRoaXMuX3JlZnJlc2hOZXdTZXNzaW9uQ29uZmlnKG5ld1Nlc3Npb24pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSdW5uaW5nIHNlc3Npb246IGRpc3BhdGNoIFNlc3Npb25Db25maWdDaGFuZ2VkIGZvciBzZXNzaW9uTXV0YWJsZSBwcm9wZXJ0aWVzXG5cdFx0Y29uc3QgcnVubmluZ0NvbmZpZyA9IHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5nZXQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghcnVubmluZ0NvbmZpZyB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWEgPSBydW5uaW5nQ29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzW3Byb3BlcnR5XTtcblx0XHRpZiAoIXNjaGVtYT8uc2Vzc2lvbk11dGFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbG9jYWwgY2FjaGUgb3B0aW1pc3RpY2FsbHlcblx0XHRjb25zdCBuZXh0VmFsdWVzID0geyAuLi5ydW5uaW5nQ29uZmlnLnZhbHVlcywgW3Byb3BlcnR5XTogbm9ybWFsaXplZFZhbHVlIH07XG5cdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChzZXNzaW9uSWQsIHtcblx0XHRcdC4uLnJ1bm5pbmdDb25maWcsXG5cdFx0XHR2YWx1ZXM6IG5leHRWYWx1ZXMsXG5cdFx0fSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUoc2Vzc2lvbklkKTtcblxuXHRcdC8vIERpc3BhdGNoIHRvIHRoZSBhZ2VudCBob3N0XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjYWNoZWQgJiYgcmF3SWQpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCBhcyBjb25zdCwgY29uZmlnOiB7IFtwcm9wZXJ0eV06IG5vcm1hbGl6ZWRWYWx1ZSB9IH07XG5cdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdHZvaWQgdGhpcy5fcmVzb2x2ZVJ1bm5pbmdTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgY2FjaGVkLCBuZXh0VmFsdWVzKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXBsYWNlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQ6IHN0cmluZywgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJ1bm5pbmdDb25maWcgPSB0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZ2V0KHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIXJ1bm5pbmdDb25maWcgfHwgIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCB0aGUgb3V0Z29pbmcgcGF5bG9hZDogZm9yIGV2ZXJ5IGtub3duIHByb3BlcnR5LCBwcmVmZXIgdGhlXG5cdFx0Ly8gY2FsbGVyLXN1cHBsaWVkIHZhbHVlIGlmIHRoZSBwcm9wZXJ0eSBpcyB1c2VyLWVkaXRhYmxlXG5cdFx0Ly8gKGBzZXNzaW9uTXV0YWJsZTogdHJ1ZWAgYW5kIG5vdCBgcmVhZE9ubHlgKSwgb3RoZXJ3aXNlIGZvcmNlIHRoZVxuXHRcdC8vIGN1cnJlbnQgdmFsdWUgdGhyb3VnaC4gVGhpcyBndWFyYW50ZWVzIHJlcGxhY2Ugc2VtYW50aWNzIG5ldmVyXG5cdFx0Ly8gYWx0ZXIgYSBub24tZWRpdGFibGUgcHJvcGVydHkgZXZlbiBpZiB0aGUgY2FsbGVyIGluY2x1ZGVkIGl0LlxuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG5leHRWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBba2V5LCBzY2hlbWFdIG9mIE9iamVjdC5lbnRyaWVzKHJ1bm5pbmdDb25maWcuc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRjb25zdCBlZGl0YWJsZSA9IHNjaGVtYS5zZXNzaW9uTXV0YWJsZSA9PT0gdHJ1ZSAmJiBzY2hlbWEucmVhZE9ubHkgIT09IHRydWU7XG5cdFx0XHRpZiAoZWRpdGFibGUpIHtcblx0XHRcdFx0bmV4dFZhbHVlc1trZXldID0gbm9ybWFsaXplU2Vzc2lvbkNvbmZpZ1ZhbHVlKGtleSwgdmFsdWVzW2tleV0sIHBvbGljeVJlc3RyaWN0ZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChPYmplY3QuaGFzT3duKHJ1bm5pbmdDb25maWcudmFsdWVzLCBrZXkpKSB7XG5cdFx0XHRcdG5leHRWYWx1ZXNba2V5XSA9IHJ1bm5pbmdDb25maWcudmFsdWVzW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFVua25vd24ga2V5cyBmcm9tIHRoZSBjYWxsZXIgYXJlIGlnbm9yZWQgKG5vIHNjaGVtYSBlbnRyeSkuXG5cblx0XHQvLyBTa2lwIHRoZSBkaXNwYXRjaCBlbnRpcmVseSB3aGVuIG5vdGhpbmcgbWVhbmluZ2Z1bCBjaGFuZ2VzLlxuXHRcdGlmIChlcXVhbHMobmV4dFZhbHVlcywgcnVubmluZ0NvbmZpZy52YWx1ZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGxvY2FsIGNhY2hlIG9wdGltaXN0aWNhbGx5IChmdWxsIHJlcGxhY2UpLlxuXHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5zZXQoc2Vzc2lvbklkLCB7XG5cdFx0XHQuLi5ydW5uaW5nQ29uZmlnLFxuXHRcdFx0dmFsdWVzOiBuZXh0VmFsdWVzLFxuXHRcdH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb25JZCk7XG5cblx0XHQvLyBEaXNwYXRjaCB0byB0aGUgYWdlbnQgaG9zdCB3aXRoIHJlcGxhY2Ugc2VtYW50aWNzLlxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY2FjaGVkICYmIHJhd0lkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgYXMgY29uc3QsXG5cdFx0XHRcdGNvbmZpZzogbmV4dFZhbHVlcyxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdHZvaWQgdGhpcy5fcmVzb2x2ZVJ1bm5pbmdTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgY2FjaGVkLCBuZXh0VmFsdWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUnVubmluZ1Nlc3Npb25Db25maWcoc2Vzc2lvbklkOiBzdHJpbmcsIGNhY2hlZDogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIsIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXEgPSAodGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxLmdldChzZXNzaW9uSWQpID8/IDApICsgMTtcblx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ1Jlc29sdmVTZXEuc2V0KHNlc3Npb25JZCwgc2VxKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBjb25uZWN0aW9uLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0cHJvdmlkZXI6IGNhY2hlZC5hZ2VudFByb3ZpZGVyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjYWNoZWQud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290LFxuXHRcdFx0XHRjb25maWc6IHZhbHVlcyxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlnUmVzb2x2ZVNlcS5nZXQoc2Vzc2lvbklkKSAhPT0gc2VxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5zZXQoc2Vzc2lvbklkLCByZXNvbHZlZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShzZXNzaW9uSWQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLmlkfV0gRmFpbGVkIHRvIHJlLXJlc29sdmUgc2Vzc2lvbiBjb25maWcgZm9yICR7c2Vzc2lvbklkfTogJHtlcnJ9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBxdWVyeT86IHN0cmluZykge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIW5ld1Nlc3Npb24gfHwgIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3U2Vzc2lvbi5nZXRDb25maWdDb21wbGV0aW9ucyhjb25uZWN0aW9uLCBwcm9wZXJ0eSwgcXVlcnkpO1xuXHRcdHJldHVybiByZXN1bHQuaXRlbXM7XG5cdH1cblxuXHRnZXRDcmVhdGVTZXNzaW9uQ29uZmlnKHNlc3Npb25JZDogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk/LmdldENvbmZpZ1ZhbHVlcygpO1xuXHR9XG5cblx0YXN5bmMgc2V0SXNvbGF0aW9uTW9kZShzZXNzaW9uSWQ6IHN0cmluZywgbW9kZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUoXG5cdFx0XHRTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbixcblx0XHRcdG1vZGUgPT09ICd3b3Jrc3BhY2UnID8gJ2ZvbGRlcicgOiBtb2RlLFxuXHRcdFx0cG9saWN5UmVzdHJpY3RlZCxcblx0XHQpO1xuXHRcdGF3YWl0IHRoaXMuX3NldFRyYW5zaWVudE5ld1Nlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCB2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyBzZXRXb3JrdHJlZUNvbmZpZ3VyYXRpb24oc2Vzc2lvbklkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElTZXNzaW9uV29ya3RyZWVDb25maWd1cmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdGlmIChjb25maWd1cmF0aW9uLmlzb2xhdGlvbk1vZGUpIHtcblx0XHRcdHZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0gPSBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUoXG5cdFx0XHRcdFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uLmlzb2xhdGlvbk1vZGUgPT09ICd3b3Jrc3BhY2UnID8gJ2ZvbGRlcicgOiBjb25maWd1cmF0aW9uLmlzb2xhdGlvbk1vZGUsXG5cdFx0XHRcdHBvbGljeVJlc3RyaWN0ZWQsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoY29uZmlndXJhdGlvbi53b3JrdHJlZUJyYW5jaFRyYWNrICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2tdID0gY29uZmlndXJhdGlvbi53b3JrdHJlZUJyYW5jaFRyYWNrO1xuXHRcdH1cblx0XHRpZiAoY29uZmlndXJhdGlvbi5icmFuY2gpIHtcblx0XHRcdHZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0gPSBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUoU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIGNvbmZpZ3VyYXRpb24uYnJhbmNoLCBwb2xpY3lSZXN0cmljdGVkKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fc2V0VHJhbnNpZW50TmV3U2Vzc2lvbkNvbmZpZ1ZhbHVlcyhzZXNzaW9uSWQsIHZhbHVlcywgZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgc2V0V29ya3RyZWVCcmFuY2hUcmFjayhzZXNzaW9uSWQ6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NldFRyYW5zaWVudE5ld1Nlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFjaywgZW5hYmxlZCk7XG5cdH1cblxuXHRhc3luYyBzZXRCcmFuY2goc2Vzc2lvbklkOiBzdHJpbmcsIGJyYW5jaDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUoU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIGJyYW5jaCwgcG9saWN5UmVzdHJpY3RlZCk7XG5cdFx0YXdhaXQgdGhpcy5fc2V0VHJhbnNpZW50TmV3U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NldFRyYW5zaWVudE5ld1Nlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zZXRUcmFuc2llbnROZXdTZXNzaW9uQ29uZmlnVmFsdWVzKHNlc3Npb25JZCwgeyBbcHJvcGVydHldOiB2YWx1ZSB9LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NldFRyYW5zaWVudE5ld1Nlc3Npb25Db25maWdWYWx1ZXMoc2Vzc2lvbklkOiBzdHJpbmcsIHZhbHVlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+LCB3YWl0Rm9yQ3VycmVudFJlc29sdmU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fZ2V0TmV3U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmICghbmV3U2Vzc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY29uZmlndXJlIHJlcG9zaXRvcnkgc2V0dGluZ3MgYWZ0ZXIgc2Vzc2lvbiBjcmVhdGlvbi4nKTtcblx0XHR9XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHRoaXMuYXV0aGVudGljYXRpb25QZW5kaW5nLCBwZW5kaW5nID0+ICFwZW5kaW5nLCB1bmRlZmluZWQsIG5ld1Nlc3Npb24uY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdGlmICh3YWl0Rm9yQ3VycmVudFJlc29sdmUpIHtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShuZXdTZXNzaW9uLmlzUmVzb2x2aW5nQ29uZmlnLCByZXNvbHZpbmcgPT4gIXJlc29sdmluZywgdW5kZWZpbmVkLCBuZXdTZXNzaW9uLmNhbmNlbGxhdGlvblRva2VuKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKSAhPT0gbmV3U2Vzc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uIHdhcyBkaXNwb3NlZCBiZWZvcmUgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIGNvdWxkIGJlIGFwcGxpZWQuJyk7XG5cdFx0fVxuXG5cdFx0bmV3U2Vzc2lvbi5iZWdpblJlc29sdmVDb25maWdTeW5jKCk7XG5cdFx0Zm9yIChjb25zdCBbcHJvcGVydHksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZXMpKSB7XG5cdFx0XHRuZXdTZXNzaW9uLnNldENvbmZpZ1ZhbHVlKHByb3BlcnR5LCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb25JZCk7XG5cdFx0YXdhaXQgbmV3U2Vzc2lvbi50cmFja0NvbmZpZ1Jlc29sdXRpb24odGhpcy5fcmVmcmVzaE5ld1Nlc3Npb25Db25maWcobmV3U2Vzc2lvbiwgeyBleHBlY3RlZDogdmFsdWVzIH0pKTtcblx0fVxuXG5cdGNsZWFyU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9uZXdTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFJvb3QgKGFnZW50IGhvc3QpIENvbmZpZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGdldFJvb3RDb25maWcoKTogUm9vdENvbmZpZ1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdENvbmZpZztcblx0fVxuXG5cdGdldFJvb3RTdGF0ZSgpOiBSb290U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5jb25uZWN0aW9uPy5yb290U3RhdGUudmFsdWU7XG5cdFx0cmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiB2YWx1ZTtcblx0fVxuXG5cdG1hcEFnZW50SG9zdFJlc291cmNlKHVyaTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5tYXBXb3JraW5nRGlyZWN0b3J5VXJpKHVyaSk7XG5cdH1cblxuXHRhc3luYyBhdXRoZW50aWNhdGUocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPEF1dGhlbnRpY2F0ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gY29ubmVjdGlvbi5hdXRoZW50aWNhdGUocGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIHNldFJvb3RDb25maWdWYWx1ZShwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yb290Q29uZmlnO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjdXJyZW50IHx8ICFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghY3VycmVudC5zY2hlbWEucHJvcGVydGllc1twcm9wZXJ0eV0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPcHRpbWlzdGljYWxseSB1cGRhdGUgbG9jYWwgY2FjaGUuXG5cdFx0dGhpcy5fcm9vdENvbmZpZyA9IHtcblx0XHRcdC4uLmN1cnJlbnQsXG5cdFx0XHR2YWx1ZXM6IHsgLi4uY3VycmVudC52YWx1ZXMsIFtwcm9wZXJ0eV06IHZhbHVlIH0sXG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJvb3RDb25maWcuZmlyZSgpO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCBhcyBjb25zdCxcblx0XHRcdGNvbmZpZzogeyBbcHJvcGVydHldOiB2YWx1ZSB9LFxuXHRcdH07XG5cdFx0Y29ubmVjdGlvbi5kaXNwYXRjaChST09UX1NUQVRFX1VSSSwgYWN0aW9uKTtcblx0fVxuXG5cdGFzeW5jIHJlcGxhY2VSb290Q29uZmlnKHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcm9vdENvbmZpZztcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY3VycmVudCB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlciB0byBrbm93biBwcm9wZXJ0aWVzIHNvIHdlIGRvbid0IGRpc3BhdGNoIHZhbHVlcyBmb3Iga2V5cyB0aGVcblx0XHQvLyBob3N0IGRpZG4ndCBwdWJsaXNoIGEgc2NoZW1hIGZvci5cblx0XHRjb25zdCBuZXh0VmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlcykpIHtcblx0XHRcdGlmIChjdXJyZW50LnNjaGVtYS5wcm9wZXJ0aWVzW2tleV0pIHtcblx0XHRcdFx0bmV4dFZhbHVlc1trZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVxdWFscyhuZXh0VmFsdWVzLCBjdXJyZW50LnZhbHVlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yb290Q29uZmlnID0geyAuLi5jdXJyZW50LCB2YWx1ZXM6IG5leHRWYWx1ZXMgfTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJvb3RDb25maWcuZmlyZSgpO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCBhcyBjb25zdCxcblx0XHRcdGNvbmZpZzogbmV4dFZhbHVlcyxcblx0XHRcdHJlcGxhY2U6IHRydWUsXG5cdFx0fTtcblx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKFJPT1RfU1RBVEVfVVJJLCBhY3Rpb24pO1xuXHR9XG5cblx0Ly8gLS0gTW9kZWwgc2VsZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGdldCBvbkRpZENoYW5nZU1vZGVscygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIEV2ZW50LnNpZ25hbChFdmVudC5hbnkoXG5cdFx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyxcblx0XHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eSxcblx0XHQpKTtcblx0fVxuXG5cdGdldE1vZGVsc1NuYXBzaG90KHNlc3Npb25JZDogc3RyaW5nLCBkZXNpcmVkTW9kZWxJZD86IHN0cmluZyk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdC8vIEFnZW50LWhvc3QgbW9kZWxzIGFyZSByZWdpc3RlcmVkIGFnYWluc3QgdGhlIHNlc3Npb24ncyByZXNvdXJjZVxuXHRcdC8vIHNjaGVtZSAodGhlIHBlci1ob3N0L3Blci1hZ2VudCBgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlYCkuIFJlc29sdmUgdGhlXG5cdFx0Ly8gc2NoZW1lIGZyb20gdGhlIHNlc3Npb24gYW5kIHJldHVybiB0aGUgbWF0Y2hpbmcgbGFuZ3VhZ2UgbW9kZWxzLlxuXHRcdGNvbnN0IHJlc291cmNlU2NoZW1lID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25SZXNvdXJjZVNjaGVtZShzZXNzaW9uSWQpO1xuXHRcdGlmICghcmVzb3VyY2VTY2hlbWUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRcdGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHJlc29sdmVNb2RlbElkZW50aWZpZXIoW10sIGRlc2lyZWRNb2RlbElkLCBmYWxzZSksXG5cdFx0XHRcdG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBhbGxNb2RlbHMgPSBnZXRSZWdpc3RlcmVkTGFuZ3VhZ2VNb2RlbHModGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbHMgPSBhbGxNb2RlbHMuZmlsdGVyKG1vZGVsID0+IHtcblx0XHRcdGlmIChtb2RlbC5tZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUgIT09IHJlc291cmNlU2NoZW1lKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuaXNNb2RlbEhpZGRlbihtb2RlbC5pZGVudGlmaWVyKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYW5hZ2VNb2RlbHNJZGVudGlmaWVyID0gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobW9kZWwubWV0YWRhdGEpO1xuXHRcdFx0cmV0dXJuIG1hbmFnZU1vZGVsc0lkZW50aWZpZXIgPT09IHVuZGVmaW5lZCB8fCAhdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxIaWRkZW4obWFuYWdlTW9kZWxzSWRlbnRpZmllcik7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVzaXJlZE1vZGVsID0gZGVzaXJlZE1vZGVsSWQgPyB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChkZXNpcmVkTW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzb2x2ZWREZXNpcmVkTW9kZWxJZCA9IGRlc2lyZWRNb2RlbD8udGFyZ2V0Q2hhdFNlc3Npb25UeXBlICYmIHRoaXMucmVzb3VyY2VTY2hlbWVGb3JQcm92aWRlcihkZXNpcmVkTW9kZWwudGFyZ2V0Q2hhdFNlc3Npb25UeXBlKSA9PT0gcmVzb3VyY2VTY2hlbWVcblx0XHRcdD8gYCR7cmVzb3VyY2VTY2hlbWV9OiR7ZGVzaXJlZE1vZGVsLmlkfWBcblx0XHRcdDogZGVzaXJlZE1vZGVsSWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGVscyxcblx0XHRcdGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tTGFuZ3VhZ2VNb2RlbHMobW9kZWxzLCByZXNvbHZlZERlc2lyZWRNb2RlbElkLCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGFsbE1vZGVscyksXG5cdFx0XHRtb2RlbFRhcmdldDogcmVzb3VyY2VTY2hlbWUsXG5cdFx0fTtcblx0fVxuXG5cdGdldE1vZGVsUGlja2VyT3B0aW9ucyhzZXNzaW9uSWQ6IHN0cmluZyk6IElTZXNzaW9uTW9kZWxQaWNrZXJPcHRpb25zIHtcblx0XHQvLyBBIHNlc3Npb24gdHlwZSB0aGF0IHJlcXVpcmVzIGFuIGV4cGxpY2l0IG1vZGVsIHNlbGVjdGlvbiBjYW5ub3QgZmFsbFxuXHRcdC8vIGJhY2sgdG8gQXV0by4gV2hlbiBpdCBoYXMgbm8gbW9kZWxzIChlLmcuIHRoZSBDbGF1ZGUgYWdlbnQgaG9zdCBmb3IgYVxuXHRcdC8vIENvcGlsb3QgRnJlZSAvIFN0dWRlbnQgdXNlciksIHRoZSBwaWNrZXIgc2hvd3MgYSBcIk5vIG1vZGVscyBhdmFpbGFibGVcIlxuXHRcdC8vIHN0YXRlIGluc3RlYWQgb2YgQXV0by4gSGFybmVzc2VzIHRoYXQgc3VwcG9ydCBBdXRvIChlLmcuIHRoZSBDb3BpbG90XG5cdFx0Ly8gQ0xJIGFnZW50IGhvc3QpIGtlZXAgdGhlIEF1dG8gZmFsbGJhY2suIERlcml2ZSB0aGlzIGZyb20gdGhlXG5cdFx0Ly8gY29udHJpYnV0aW9uJ3MgZGVjbGFyYXRpdmUgYHNob3dBdXRvTW9kZWxgIGZsYWcgKGtleWVkIGJ5IHRoZVxuXHRcdC8vIHNlc3Npb24ncyByZXNvdXJjZSBzY2hlbWUsIHdoaWNoIGlzIHRoZSByZWdpc3RlcmVkXG5cdFx0Ly8gYGFnZW50LWhvc3QtPHByb3ZpZGVyPmAgY2hhdCBzZXNzaW9uIHR5cGUpIHJhdGhlciB0aGFuIGhhcmRjb2RpbmcgbmFtZXMuXG5cdFx0Y29uc3QgcmVzb3VyY2VTY2hlbWUgPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblJlc291cmNlU2NoZW1lKHNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2hvd0F1dG9Nb2RlbCA9ICFyZXNvdXJjZVNjaGVtZSB8fCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUocmVzb3VyY2VTY2hlbWUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1c2VHcm91cGVkTW9kZWxQaWNrZXI6IHRydWUsXG5cdFx0XHRzaG93RmVhdHVyZWQ6IHRydWUsXG5cdFx0XHRzaG93VW5hdmFpbGFibGVGZWF0dXJlZDogdHJ1ZSxcblx0XHRcdHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IHRydWUsXG5cdFx0XHRzaG93QXV0b01vZGVsLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIHJlbWVtYmVyZWQgbW9kZWwgc2VsZWN0aW9uIGF0IHNlbmQgdGltZTogd2hlbiBpdCBpcyBjb25jbHVzaXZlbHlcblx0ICogdW5hdmFpbGFibGUgYW5kIHRoZSBoYXJuZXNzIHN1cHBvcnRzIEF1dG8sIHJldHVybiB0aGUgQXV0byBtb2RlbCBpZGVudGlmaWVyXG5cdCAqIChyYXRoZXIgdGhhbiBgdW5kZWZpbmVkYCwgd2hpY2ggd291bGQgbGVhdmUgYW4gYWxyZWFkeS1ydW5uaW5nIGNoYXQgcGlubmVkXG5cdCAqIHRvIGl0cyBzdGFsZSBiYWNrZW5kIG1vZGVsKSBzbyB0aGUgcmVxdWVzdCBpcyBleHBsaWNpdGx5IHJlc2V0IHRvIEF1dG8uXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlU2VuZE1vZGVsSWQoc2Vzc2lvbklkOiBzdHJpbmcsIHNlbGVjdGVkTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNlbGVjdGVkTW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGVkTW9kZWxJZDtcblx0XHR9XG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb25JZCwgc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRpZiAoc25hcHNob3QuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbi5raW5kICE9PSAndW5hdmFpbGFibGUnKSB7XG5cdFx0XHQvLyBBdmFpbGFibGUsIHBlbmRpbmcgKGxpc3Qgbm90IHlldCBwb3B1bGF0ZWQpIG9yIG5vdCByZXF1ZXN0ZWQ6IGtlZXAgdGhlIHNlbGVjdGlvbi5cblx0XHRcdHJldHVybiBzZWxlY3RlZE1vZGVsSWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlU2NoZW1lID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25SZXNvdXJjZVNjaGVtZShzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHN1cHBvcnRzQXV0byA9ICFyZXNvdXJjZVNjaGVtZSB8fCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUocmVzb3VyY2VTY2hlbWUpO1xuXHRcdGlmICghc3VwcG9ydHNBdXRvKSB7XG5cdFx0XHRyZXR1cm4gc2VsZWN0ZWRNb2RlbElkO1xuXHRcdH1cblx0XHQvLyBTZW5kIHRoZSBoYXJuZXNzJ3MgQXV0byBtb2RlbCBleHBsaWNpdGx5LiBSZXR1cm5pbmcgYHVuZGVmaW5lZGAgd291bGRcblx0XHQvLyBvbWl0IGBtb2RlbGAgZnJvbSB0aGUgdHVybiwgd2hpY2ggbGVhdmVzIGFuIGFscmVhZHktcnVubmluZyBjaGF0IG9uIGl0c1xuXHRcdC8vIHN0YWxlIGJhY2tlbmQgc2VsZWN0aW9uIGFuZCBzdGlsbCBmYWlscyBvbiB0aGUgdW5yb3V0YWJsZSBtb2RlbC5cblx0XHRjb25zdCBhdXRvTW9kZWxJZCA9IHJlc29sdmVDb25maWd1cmVkTW9kZWwoJ2F1dG8nLCBzbmFwc2hvdC5tb2RlbHMpPy5pZGVudGlmaWVyO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5pZH1dIFNlbGVjdGVkIG1vZGVsICcke3NlbGVjdGVkTW9kZWxJZH0nIGlzIHVuYXZhaWxhYmxlIGZvciBzZXNzaW9uICcke3Nlc3Npb25JZH0nOyBmYWxsaW5nIGJhY2sgdG8gQXV0byBpbnN0ZWFkIG9mIHNlbmRpbmcgYW4gdW5yb3V0YWJsZSBtb2RlbC5gKTtcblx0XHRyZXR1cm4gYXV0b01vZGVsSWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlU2Vzc2lvblJlc291cmNlU2NoZW1lKHNlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fZ2V0TmV3U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gbmV3U2Vzc2lvbi5zZXNzaW9uLnJlc291cmNlLnNjaGVtZTtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBjYWNoZWQ/LnJlc291cmNlLnNjaGVtZTtcblx0fVxuXG5cdHNldE1vZGVsKHNlc3Npb25JZDogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fZ2V0TmV3U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRuZXdTZXNzaW9uLnNldFNlbGVjdGVkTW9kZWxJZChtb2RlbElkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoY2FjaGVkICYmIHJhd0lkICYmIGNvbm5lY3Rpb24pIHtcblx0XHRcdGNvbnN0IGNoYXRSZXNvdXJjZSA9IHRoaXMuX2FjdGl2ZUNoYXRSZXNvdXJjZShjYWNoZWQpO1xuXHRcdFx0Y2FjaGVkLnNldENoYXRNb2RlbElkKGNoYXRSZXNvdXJjZSwgbW9kZWxJZCk7XG5cdFx0XHR0aGlzLl91cGRhdGVDaGF0U2Vzc2lvblN0YXRlKGNoYXRSZXNvdXJjZSwgbW9kZWxJZCwgY2FjaGVkLmdldENoYXRNb2RlKGNoYXRSZXNvdXJjZSk/LmlkKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7dGhpcy5pZH1dIEZhaWxlZCB0byB1cGRhdGUgY2hhdCBtb2RlbCBzdGF0ZSBmb3IgJHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX1gLCBlcnIpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdHNldEFnZW50KHNlc3Npb25JZDogc3RyaW5nLCBhZ2VudDogSVNlc3Npb25BZ2VudFJlZiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdG5ld1Nlc3Npb24uc2V0U2VsZWN0ZWRBZ2VudChhZ2VudCk7XG5cdFx0XHQvLyBUaGUgc2VsZWN0aW9uIGlzIGZvcndhcmRlZCB0byB0aGUgaG9zdCBhdCBmaXJzdC1tZXNzYWdlIHRpbWVcblx0XHRcdC8vIHZpYSBgc2VuZE9wdGlvbnMuYWdlbnRIb3N0U2Vzc2lvbkFnZW50YCAoc2VlIGBzZW5kUmVxdWVzdGApLFxuXHRcdFx0Ly8gbWlycm9yaW5nIGhvdyBgdXNlclNlbGVjdGVkTW9kZWxJZGAgZmxvd3MuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKGNhY2hlZCAmJiByYXdJZCAmJiBjb25uZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSB0aGlzLl9hY3RpdmVDaGF0UmVzb3VyY2UoY2FjaGVkKTtcblx0XHRcdGNhY2hlZC5zZXRDaGF0QWdlbnQoY2hhdFJlc291cmNlLCBhZ2VudCk7XG5cdFx0XHR0aGlzLl91cGRhdGVDaGF0U2Vzc2lvblN0YXRlKGNoYXRSZXNvdXJjZSwgY2FjaGVkLmdldENoYXRNb2RlbElkKGNoYXRSZXNvdXJjZSksIGFnZW50Py51cmkpLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbJHt0aGlzLmlkfV0gRmFpbGVkIHRvIHVwZGF0ZSBjaGF0IG1vZGVsIHN0YXRlIGZvciAke2NoYXRSZXNvdXJjZS50b1N0cmluZygpfWAsIGVycikpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q3VzdG9tQWdlbnRzKHNlc3Npb25JZDogc3RyaW5nKTogcmVhZG9ubHkgQWdlbnRDdXN0b21pemF0aW9uW10ge1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHN0YXRlQWdlbnRzID0gZ2V0RWZmZWN0aXZlQWdlbnRzKHNlc3Npb25TdGF0ZT8uY3VzdG9taXphdGlvbnMpO1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIW5ld1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiBzdGF0ZUFnZW50cztcblx0XHR9XG5cdFx0Y29uc3QgY2xpZW50QWdlbnRzID0gbmV3U2Vzc2lvbi5nZXRDbGllbnRDdXN0b21BZ2VudHMoKTtcblx0XHRpZiAoY2xpZW50QWdlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHN0YXRlQWdlbnRzO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudHNCeVVyaSA9IG5ldyBNYXAoc3RhdGVBZ2VudHMubWFwKGFnZW50ID0+IFthZ2VudC51cmkudG9TdHJpbmcoKSwgYWdlbnRdKSk7XG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBjbGllbnRBZ2VudHMpIHtcblx0XHRcdGFnZW50c0J5VXJpLnNldChhZ2VudC51cmkudG9TdHJpbmcoKSwgYWdlbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLmFnZW50c0J5VXJpLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpIHx8IGEudXJpLnRvU3RyaW5nKCkubG9jYWxlQ29tcGFyZShiLnVyaS50b1N0cmluZygpKSk7XG5cdH1cblxuXHRnZXRDdXN0b21pemF0aW9ucyhzZXNzaW9uSWQ6IHN0cmluZyk6IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fbGFzdFNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb25TdGF0ZT8uY3VzdG9taXphdGlvbnMgPz8gW107XG5cdH1cblxuXHRnZXRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvblN0YXRlPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0fVxuXG5cdGdldEJhY2tlbmRDaGF0UmVzb3VyY2UoY2hhdFJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRoZSBjbGllbnQgcmVzb3VyY2UgaXMgYDxzY2hlbWU+Oi88cmF3SWQ+WyNjaGF0SWRdYDsgZHJvcCB0aGUgZnJhZ21lbnQgdG9cblx0XHQvLyByZWNvdmVyIHRoZSBzZXNzaW9uIHJlc291cmNlLCB3aG9zZSBgc2Vzc2lvbklkYCBrZXlzIGBfbGFzdFNlc3Npb25TdGF0ZXNgLlxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNoYXRSZXNvdXJjZS53aXRoKHsgZnJhZ21lbnQ6ICcnIH0pO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fbGFzdFNlc3Npb25TdGF0ZXMuZ2V0KHRvU2Vzc2lvbklkKHRoaXMuaWQsIHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIExvb2sgdXAgdGhlIGF1dGhvcml0YXRpdmUgaG9zdC1zdXBwbGllZCBiYWNrZW5kIGNoYXQgVVJJIHJhdGhlciB0aGFuXG5cdFx0Ly8gY29uc3RydWN0aW5nIG9uZTogYSBwZWVyIGNoYXQncyBjbGllbnQgZnJhZ21lbnQgaXMgZXhhY3RseSB0aGUgY2hhdElkIG9mXG5cdFx0Ly8gaXRzIGBDaGF0U3VtbWFyeS5yZXNvdXJjZWAgKHNlZSBgX2NyZWF0ZUFkZGl0aW9uYWxDaGF0YCk7IHRoZSBkZWZhdWx0XG5cdFx0Ly8gY2hhdCAobm8gZnJhZ21lbnQpIGlzIGBTZXNzaW9uU3RhdGUuZGVmYXVsdENoYXRgLCBmYWxsaW5nIGJhY2sgdG8gdGhlXG5cdFx0Ly8gc3VtbWFyeSBmbGFnZ2VkIGJ5IGBpc0RlZmF1bHRDaGF0VXJpYCBcdTIwMTQgbWlycm9yaW5nIGBfYXBwbHlDaGF0Q2F0YWxvZ2AuXG5cdFx0Y29uc3QgY2hhdElkID0gY2hhdFJlc291cmNlLmZyYWdtZW50IHx8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBiYWNrZW5kUmVzb3VyY2UgPSBjaGF0SWRcblx0XHRcdD8gc3RhdGUuY2hhdHMuZmluZChjID0+IHBhcnNlQ2hhdFVyaShjLnJlc291cmNlKT8uY2hhdElkID09PSBjaGF0SWQpPy5yZXNvdXJjZVxuXHRcdFx0OiAoc3RhdGUuZGVmYXVsdENoYXQgPz8gc3RhdGUuY2hhdHMuZmluZChjID0+IGlzRGVmYXVsdENoYXRVcmkoYy5yZXNvdXJjZSkpPy5yZXNvdXJjZSk7XG5cdFx0aWYgKCFiYWNrZW5kUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIFRoZSByZXNvdXJjZSBpcyBob3N0LXN1cHBsaWVkIGFuZCBvbmx5IHBhcnNlZCBoZXJlIHRvIGhhbmQgYmFjayBhIFVSSTtcblx0XHQvLyBhIG1hbGZvcm1lZCBvbmUgbXVzdCBub3QgYnJlYWsgdGhlIGRyYWcgZ2VzdHVyZSB0aGF0IGFza3MgZm9yIGl0LlxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKGJhY2tlbmRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0V29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25JZDogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdHJldHVybiBzZXNzaW9uU3RhdGU/LndvcmtpbmdEaXJlY3RvcmllcyA/PyBbXTtcblx0fVxuXG5cdGdldE1jcFNlcnZlcnMoc2Vzc2lvbklkOiBzdHJpbmcpOiByZWFkb25seSBJQWdlbnRIb3N0TWNwU2VydmVyW10ge1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvblN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWNhY2hlZCB8fCAhcmF3SWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNhY2hlZC5iYWNrZW5kVXJpO1xuXHRcdHJldHVybiAoc2Vzc2lvblN0YXRlLmN1c3RvbWl6YXRpb25zID8/IFtdKVxuXHRcdFx0LmZsYXRNYXAoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlclxuXHRcdFx0XHQ/IFt7IHNlcnZlcjogY3VzdG9taXphdGlvbiwgcGx1Z2luOiB1bmRlZmluZWQgfV1cblx0XHRcdFx0OiBjdXN0b21pemF0aW9uLmNoaWxkcmVuXG5cdFx0XHRcdFx0PyBjdXN0b21pemF0aW9uLmNoaWxkcmVuLmZpbHRlcihjaGlsZCA9PiBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpLm1hcChzZXJ2ZXIgPT4gKHtcblx0XHRcdFx0XHRcdHNlcnZlcixcblx0XHRcdFx0XHRcdHBsdWdpbjogY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4gPyBjdXN0b21pemF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0pKVxuXHRcdFx0XHRcdDogW10pXG5cdFx0XHQubWFwKCh7IHNlcnZlciwgcGx1Z2luIH0pOiBJQWdlbnRIb3N0TWNwU2VydmVyID0+ICh7XG5cdFx0XHRcdGlkOiBgJHtzZXNzaW9uVXJpLmF1dGhvcml0eX0vJHtzZXJ2ZXIuaWR9YCxcblx0XHRcdFx0bmFtZTogc2VydmVyLm5hbWUsXG5cdFx0XHRcdGVuYWJsZWQ6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoc2VydmVyKSAmJiAoIXBsdWdpbiB8fCBpc0N1c3RvbWl6YXRpb25FbmFibGVkKHBsdWdpbikpLFxuXHRcdFx0XHRlbmFibGVtZW50OiBzZXJ2ZXIuZW5hYmxlbWVudCxcblx0XHRcdFx0ZGlzYWJsZWRSZWFzb246IGdldEN1c3RvbWl6YXRpb25EaXNhYmxlZFJlYXNvbihzZXJ2ZXIsIHBsdWdpbiksXG5cdFx0XHRcdHN0YXR1czogc2VydmVyLnN0YXRlLmtpbmQsXG5cdFx0XHRcdHN0YXRlOiBzZXJ2ZXIuc3RhdGUsXG5cdFx0XHRcdHNldEVuYWJsZWQ6IChlbmFibGVkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRcdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25Ub2dnbGVkLFxuXHRcdFx0XHRcdFx0aWQ6IHNlcnZlci5pZCxcblx0XHRcdFx0XHRcdGVuYWJsZW1lbnQ6IHdpdGhDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2ZXIuZW5hYmxlbWVudCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQgfSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0YXJ0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRcdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXJ0UmVxdWVzdGVkLFxuXHRcdFx0XHRcdFx0aWQ6IHNlcnZlci5pZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RvcDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0XHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdG9wUmVxdWVzdGVkLFxuXHRcdFx0XHRcdFx0aWQ6IHNlcnZlci5pZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0fVxuXG5cdHNldEN1c3RvbWl6YXRpb25FbmFibGVtZW50KHNlc3Npb25JZDogc3RyaW5nLCBjdXN0b21pemF0aW9uSWQ6IHN0cmluZywgZW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY2FjaGVkIHx8ICFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goY2FjaGVkLmJhY2tlbmRVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsXG5cdFx0XHRpZDogY3VzdG9taXphdGlvbklkLFxuXHRcdFx0ZW5hYmxlbWVudDogWy4uLmVuYWJsZW1lbnRdLFxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0RmVlZGJhY2tBbm5vdGF0aW9uc0NoYW5uZWwoc2Vzc2lvbklkOiBzdHJpbmcpOiB7IHJlYWRvbmx5IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb247IHJlYWRvbmx5IGFubm90YXRpb25zVXJpOiBVUkkgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWNhY2hlZCB8fCAhcmF3SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRjb25zdCBhbm5vdGF0aW9uc1VyaSA9IFVSSS5wYXJzZShidWlsZEFubm90YXRpb25zVXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSkpO1xuXHRcdHJldHVybiB7IGNvbm5lY3Rpb24sIGFubm90YXRpb25zVXJpIH07XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIGFjdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNhY2hlZCAmJiByYXdJZCkge1xuXHRcdFx0Y2FjaGVkLmlzQXJjaGl2ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbY2FjaGVkXSB9KTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQgYXMgY29uc3QsIGlzQXJjaGl2ZWQ6IHRydWUgfTtcblx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdW5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY2FjaGVkICYmIHJhd0lkKSB7XG5cdFx0XHRjYWNoZWQuaXNBcmNoaXZlZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbY2FjaGVkXSB9KTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQgYXMgY29uc3QsIGlzQXJjaGl2ZWQ6IGZhbHNlIH07XG5cdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY2FjaGVkICYmIHJhd0lkICYmIGNhY2hlZC5pc1JlYWQuZ2V0KCkgIT09IGlzUmVhZCkge1xuXHRcdFx0Y2FjaGVkLmlzUmVhZC5zZXQoaXNSZWFkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNhY2hlZC5iYWNrZW5kVXJpO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQgYXMgY29uc3QsIGlzUmVhZCB9O1xuXHRcdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5kZWxldGVTZXNzaW9ucyhbc2Vzc2lvbklkXSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9ucyhzZXNzaW9uSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldHM6IHsgcmF3SWQ6IHN0cmluZzsgY2FjaGVkOiBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlciB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBzZXNzaW9uSWRzKSB7XG5cdFx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjYWNoZWQgJiYgcmF3SWQpIHtcblx0XHRcdFx0dGFyZ2V0cy5wdXNoKHsgcmF3SWQsIGNhY2hlZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbW92ZWQ6IEFnZW50SG9zdFNlc3Npb25BZGFwdGVyW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Zm9yIChjb25zdCB7IHJhd0lkLCBjYWNoZWQgfSBvZiB0YXJnZXRzKSB7XG5cdFx0XHRcdGF3YWl0IGNvbm5lY3Rpb24uZGlzcG9zZVNlc3Npb24oY2FjaGVkLmJhY2tlbmRVcmkpO1xuXHRcdFx0XHRjb25zdCByZW1vdmVkU2Vzc2lvbiA9IHRoaXMuX3JlbW92ZUNhY2hlZFNlc3Npb24ocmF3SWQsIGNhY2hlZCk7XG5cdFx0XHRcdGlmIChyZW1vdmVkU2Vzc2lvbikge1xuXHRcdFx0XHRcdHJlbW92ZWQucHVzaChyZW1vdmVkU2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQsIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNhY2hlZCBvZiByZW1vdmVkKSB7XG5cdFx0XHRcdFx0Y2FjaGVkLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmFtZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRVcmk6IFVSSSwgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY2FjaGVkIHx8ICFyYXdJZCB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0Y29uc3QgY2hhdElkID0gY2hhdFVyaS5mcmFnbWVudDtcblx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCBhcyBjb25zdCwgdGl0bGUgfTtcblx0XHRpZiAoY2hhdElkKSB7XG5cdFx0XHQvLyBBZGRpdGlvbmFsIHBlZXIgY2hhdDogcmVuYW1lIG9ubHkgdGhhdCBjaGF0IGJ5IGRpc3BhdGNoaW5nIG9uIGl0c1xuXHRcdFx0Ly8gY2hhdCBjaGFubmVsLiBUaGUgaG9zdCB0cmFuc2xhdGVzIHRoaXMgdG8gYSBwZXItY2hhdCB1cGRhdGUuXG5cdFx0XHRjYWNoZWQuc2V0QWRkaXRpb25hbENoYXRUaXRsZShjaGF0SWQsIHRpdGxlKTtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIGNoYXRJZCksIGFjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERlZmF1bHQgY2hhdDogcmVuYW1lIHRoZSBkZWZhdWx0IGNoYXQgdGFiIGluZGVwZW5kZW50bHkgb2YgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIHRpdGxlIGJ5IGRpc3BhdGNoaW5nIG9uIHRoZSBkZWZhdWx0IGNoYXQgY2hhbm5lbC5cblx0XHRcdGNhY2hlZC5zZXREZWZhdWx0Q2hhdFRpdGxlKHRpdGxlKTtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgYWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdH1cblxuXHRhc3luYyByZW5hbWVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKGNhY2hlZCAmJiByYXdJZCAmJiBjb25uZWN0aW9uKSB7XG5cdFx0XHRjYWNoZWQudGl0bGUuc2V0KHRpdGxlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCBhcyBjb25zdCwgdGl0bGUgfTtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRVcmk6IFVSSSwgb3B0aW9ucz86IElEZWxldGVDaGF0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGNoYXRJZCA9IGNoYXRVcmkuZnJhZ21lbnQ7XG5cdFx0aWYgKCFjaGF0SWQpIHtcblx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgbGl2ZXMgYW5kIGRpZXMgd2l0aCBpdHMgc2Vzc2lvbiBhbmQgY2Fubm90IGJlXG5cdFx0XHQvLyBkZWxldGVkIGluIGlzb2xhdGlvbi5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFyYXdJZCB8fCAhY2FjaGVkIHx8ICFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRjb25zdCBhaHBDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBjaGF0SWQpKTtcblxuXHRcdGlmICghb3B0aW9ucz8uc2tpcENvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RlbGV0ZUNoYXQuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGlzIGNoYXQ/XCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZWxldGVDaGF0LmRldGFpbCcsIFwiVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGVDaGF0LmRlbGV0ZScsIFwiRGVsZXRlXCIpXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYWxpdmUgc28gdGhlIGBjaGF0UmVtb3ZlZGAgdGhlXG5cdFx0Ly8gaG9zdCBlbWl0cyBmbG93cyBpbnRvIGBhcHBseUNoYXRDYXRhbG9nYCBhbmQgZHJvcHMgdGhlIGNoYXQgZnJvbVxuXHRcdC8vIGBjYWNoZWQuY2hhdHNgLlxuXHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRhd2FpdCBjb25uZWN0aW9uLmRpc3Bvc2VDaGF0KGFocENoYXRVcmkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmV3Q2hhdChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuX25vdENvbm5lY3RlZFNlbmRFcnJvck1lc3NhZ2UoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oY2hhdElkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0Ly8gQ3JlYXRlIHRoZSBjaGF0IHNlc3Npb24gbW9kZWwgc28gdGhlIG1hbmFnZW1lbnQgc2VydmljZSBjYW4gb3BlbiB0aGUgd2lkZ2V0XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24obmV3U2Vzc2lvbi5zZXNzaW9uLnJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHJldHVybiBuZXdTZXNzaW9uLnNlc3Npb24ubWFpbkNoYXQuZ2V0KCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQgaW5zaWRlIGFuIGV4aXN0aW5nIHJ1bm5pbmdcblx0XHQvLyBzZXNzaW9uLiBNaW50IGEgY2xpZW50LWNob3NlbiBjaGF0IFVSSSwgYXNrIHRoZSBob3N0IHRvIGFkZCBpdCB0byB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgY2F0YWxvZywgYW5kIHdhaXQgZm9yIHRoZSBhZGFwdGVyIHRvIHN1cmZhY2UgdGhlIG5ldyBjaGF0LlxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVBZGRpdGlvbmFsQ2hhdChjaGF0SWQsIGNvbm5lY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlQWRkaXRpb25hbENoYXQoY2hhdElkOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoY2hhdElkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcmF3SWQgfHwgIWNhY2hlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke2NoYXRJZH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHRpZiAoIWNhY2hlZC5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7Y2hhdElkfScgZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0c2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRjb25zdCBuZXdDaGF0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBuZXdDaGF0SWQpKTtcblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsSWQgPSBjYWNoZWQubW9kZWxJZC5nZXQoKSA/PyAoY2FjaGVkLm1vZGVsU2VsZWN0aW9uID8gYCR7Y2FjaGVkLnJlc291cmNlLnNjaGVtZX06JHtjYWNoZWQubW9kZWxTZWxlY3Rpb24uaWR9YCA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZ2VudFVyaSA9IGNhY2hlZC5tb2RlLmdldCgpPy5pZDtcblxuXHRcdC8vIFNob3cgYXMgYFVudGl0bGVkYCB1bnRpbCB0aGUgZmlyc3QgcmVxdWVzdDsgdGhlIGhvc3QgY29tbWl0cyBpdCBiZWxvdy5cblx0XHRjYWNoZWQubWFya0NoYXRBc05ldyhuZXdDaGF0SWQpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYWxpdmUgc28gdGhlIGBjaGF0QWRkZWRgIGl0IGVtaXRzXG5cdFx0Ly8gZmxvd3MgaW50byBgX2FwcGx5Q2hhdENhdGFsb2dGcm9tU3RhdGVgIGFuZCB1cGRhdGVzIGBjYWNoZWQuY2hhdHNgLlxuXHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRhd2FpdCBjb25uZWN0aW9uLmNyZWF0ZUNoYXQoc2Vzc2lvblVyaSwgY2hhdFVyaSwge1xuXHRcdFx0bW9kZWw6IGNhY2hlZC5tb2RlbFNlbGVjdGlvbixcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0XHRjYWNoZWQuY2hhdHMubWFwKGNoYXRzID0+IGNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSBuZXdDaGF0SWQpKSxcblx0XHRcdGMgPT4gISFjLFxuXHRcdCk7XG5cblx0XHRjYWNoZWQuc2V0Q2hhdE1vZGVsSWQoY2hhdC5yZXNvdXJjZSwgc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRjYWNoZWQuc2V0Q2hhdEFnZW50KGNoYXQucmVzb3VyY2UsIHNlbGVjdGVkQWdlbnRVcmkgPyB7IHVyaTogc2VsZWN0ZWRBZ2VudFVyaSwgbmFtZTogJycgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24oY2hhdC5yZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0LnJlc291cmNlLCBzZWxlY3RlZE1vZGVsSWQsIHNlbGVjdGVkQWdlbnRVcmkpO1xuXHRcdHJldHVybiBjaGF0O1xuXHR9XG5cblx0YXN5bmMgZm9ya0NoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIHNvdXJjZUNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLl9ub3RDb25uZWN0ZWRTZW5kRXJyb3JNZXNzYWdlKCkpO1xuXHRcdH1cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFyYXdJZCB8fCAhY2FjaGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXHRcdGlmICghY2FjaGVkLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBkb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNhY2hlZC5iYWNrZW5kVXJpO1xuXHRcdGNvbnN0IG5ld0NoYXRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIG5ld0NoYXRJZCkpO1xuXHRcdGNvbnN0IHNvdXJjZUJhY2tlbmRVcmkgPSB0aGlzLl9yZXNvbHZlQmFja2VuZFNvdXJjZUNoYXRVcmkoY2FjaGVkLnNlc3Npb25JZCwgc2Vzc2lvblVyaSwgc291cmNlQ2hhdCk7XG5cblx0XHQvLyBLZWVwIHRoZSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBhbGl2ZSBzbyB0aGUgYGNoYXRBZGRlZGAgaXQgZW1pdHNcblx0XHQvLyBmbG93cyBpbnRvIGBfYXBwbHlDaGF0Q2F0YWxvZ0Zyb21TdGF0ZWAgYW5kIHVwZGF0ZXMgYGNhY2hlZC5jaGF0c2AuXG5cdFx0dGhpcy5fa2VlcFNlc3Npb25TdGF0ZUFsaXZlKGNhY2hlZC5zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IGNvbm5lY3Rpb24uY3JlYXRlQ2hhdChzZXNzaW9uVXJpLCBjaGF0VXJpLCB7XG5cdFx0XHRtb2RlbDogY2FjaGVkLm1vZGVsU2VsZWN0aW9uLFxuXHRcdFx0Zm9yazogeyBzb3VyY2U6IHNvdXJjZUJhY2tlbmRVcmksIHR1cm5JZCB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHdhaXRGb3JTdGF0ZShcblx0XHRcdGNhY2hlZC5jaGF0cy5tYXAoY2hhdHMgPT4gY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09IG5ld0NoYXRJZCkpLFxuXHRcdFx0YyA9PiAhIWMsXG5cdFx0KTtcblxuXHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihjaGF0LnJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gY2hhdDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNpZGVDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBzb3VyY2VDaGF0OiBVUkksIHR1cm5JZDogc3RyaW5nLCBzZWxlY3Rpb24/OiBJU2lkZUNoYXRTZWxlY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLl9ub3RDb25uZWN0ZWRTZW5kRXJyb3JNZXNzYWdlKCkpO1xuXHRcdH1cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFyYXdJZCB8fCAhY2FjaGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXHRcdGlmICghY2FjaGVkLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c1NpZGVDaGF0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoY2FjaGVkLmFnZW50UHJvdmlkZXIsIHJhd0lkKTtcblx0XHRjb25zdCBuZXdDaGF0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBuZXdDaGF0SWQpKTtcblx0XHRjb25zdCBzb3VyY2VCYWNrZW5kVXJpID0gdGhpcy5fcmVzb2x2ZUJhY2tlbmRTb3VyY2VDaGF0VXJpKGNhY2hlZC5zZXNzaW9uSWQsIHNlc3Npb25VcmksIHNvdXJjZUNoYXQpO1xuXG5cdFx0Ly8gSW5oZXJpdCB0aGUgc291cmNlIGNoYXQncyBvd24gbW9kZWwvYWdlbnQgc2VsZWN0aW9uICh3aGljaCBtYXkgZGlmZmVyXG5cdFx0Ly8gZnJvbSB0aGUgc2Vzc2lvbidzIGRlZmF1bHQpLCBub3QgdGhlIHNlc3Npb24tbGV2ZWwgZmFsbGJhY2suXG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IGNhY2hlZC5nZXRDaGF0TW9kZWxTZWxlY3Rpb24oc291cmNlQ2hhdCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbElkID0gY2FjaGVkLmdldENoYXRNb2RlbElkKHNvdXJjZUNoYXQpXG5cdFx0XHQ/PyAoc2VsZWN0ZWRNb2RlbCA/IGAke2NhY2hlZC5yZXNvdXJjZS5zY2hlbWV9OiR7c2VsZWN0ZWRNb2RlbC5pZH1gIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBzZWxlY3RlZEFnZW50VXJpID0gY2FjaGVkLmdldENoYXRNb2RlKHNvdXJjZUNoYXQpPy5pZDtcblxuXHRcdC8vIEtlZXAgdGhlIHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIGFsaXZlIHNvIHRoZSBgY2hhdEFkZGVkYCBpdCBlbWl0c1xuXHRcdC8vIGZsb3dzIGludG8gYF9hcHBseUNoYXRDYXRhbG9nRnJvbVN0YXRlYCBhbmQgdXBkYXRlcyBgY2FjaGVkLmNoYXRzYC5cblx0XHR0aGlzLl9rZWVwU2Vzc2lvblN0YXRlQWxpdmUoY2FjaGVkLnNlc3Npb25JZCk7XG5cdFx0YXdhaXQgY29ubmVjdGlvbi5jcmVhdGVDaGF0KHNlc3Npb25VcmksIGNoYXRVcmksIHtcblx0XHRcdG1vZGVsOiBzZWxlY3RlZE1vZGVsLFxuXHRcdFx0c2lkZUNoYXQ6IHtcblx0XHRcdFx0c291cmNlOiBzb3VyY2VCYWNrZW5kVXJpLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdC4uLihzZWxlY3Rpb24gPyB7IHNlbGVjdGlvbiB9IDoge30pLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0XHRjYWNoZWQuY2hhdHMubWFwKGNoYXRzID0+IGNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSBuZXdDaGF0SWQpKSxcblx0XHRcdGMgPT4gISFjLFxuXHRcdCk7XG5cblx0XHRjYWNoZWQuc2V0Q2hhdE1vZGVsSWQoY2hhdC5yZXNvdXJjZSwgc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRjYWNoZWQuc2V0Q2hhdEFnZW50KGNoYXQucmVzb3VyY2UsIHNlbGVjdGVkQWdlbnRVcmkgPyB7IHVyaTogc2VsZWN0ZWRBZ2VudFVyaSwgbmFtZTogJycgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24oY2hhdC5yZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0LnJlc291cmNlLCBzZWxlY3RlZE1vZGVsSWQsIHNlbGVjdGVkQWdlbnRVcmkpO1xuXHRcdHJldHVybiBjaGF0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUJhY2tlbmRTb3VyY2VDaGF0VXJpKHNlc3Npb25JZDogc3RyaW5nLCBzZXNzaW9uVXJpOiBVUkksIHNvdXJjZUNoYXQ6IFVSSSk6IFVSSSB7XG5cdFx0aWYgKHNvdXJjZUNoYXQuZnJhZ21lbnQpIHtcblx0XHRcdHJldHVybiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIHNvdXJjZUNoYXQuZnJhZ21lbnQpKTtcblx0XHR9XG5cdFx0Y29uc3QgaHlkcmF0ZWREZWZhdWx0Q2hhdCA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpPy5kZWZhdWx0Q2hhdDtcblx0XHRyZXR1cm4gaHlkcmF0ZWREZWZhdWx0Q2hhdCA/IFVSSS5wYXJzZShoeWRyYXRlZERlZmF1bHRDaGF0LnRvU3RyaW5nKCkpIDogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHR9XG5cblx0YXN5bmMgc2VuZFJlcXVlc3QoY2hhdElkOiBzdHJpbmcsIGNoYXRSZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKGNoYXRJZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTmV3U2Vzc2lvblJlcXVlc3QobmV3U2Vzc2lvbiwgY2hhdElkLCBjaGF0UmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2VuZENvbW1pdHRlZENoYXRSZXF1ZXN0KGNoYXRJZCwgY2hhdFJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdC8qKiBTZW5kIHRoZSBmaXJzdCByZXF1ZXN0IGZvciBhbiBhbHJlYWR5LWNvbW1pdHRlZCBwZWVyIGNoYXQsIHRoZW4gY2xlYXIgaXRzIGBuZXdgIGZsYWcuICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRDb21taXR0ZWRDaGF0UmVxdWVzdChjaGF0SWQ6IHN0cmluZywgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoY2hhdElkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcmF3SWQgfHwgIWNhY2hlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke2NoYXRJZH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcXVlcnksIGF0dGFjaGVkQ29udGV4dCB9ID0gb3B0aW9ucztcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGNoYXRSZXNvdXJjZS5zY2hlbWU7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsSWQgPSB0aGlzLl9yZXNvbHZlU2VuZE1vZGVsSWQoY2hhdElkLCBjYWNoZWQuZ2V0Q2hhdE1vZGVsSWQoY2hhdFJlc291cmNlKSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZ2VudFVyaSA9IGNhY2hlZC5nZXRDaGF0TW9kZShjaGF0UmVzb3VyY2UpPy5pZDtcblxuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogc2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHNlbGVjdGVkQWdlbnRVcmkgPyB7XG5cdFx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKHNlbGVjdGVkQWdlbnRVcmkpLFxuXHRcdFx0XHRcdG5hbWU6ICcnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9IDoge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdGFnZW50SWRTaWxlbnQ6IGNvbnRyaWJ1dGlvbj8udHlwZSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dCxcblx0XHRcdGhpZGVGcm9tVHJhbnNjcmlwdDogb3B0aW9ucy5oaWRlRnJvbVRyYW5zY3JpcHQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5fY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oY2hhdFJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFske3RoaXMuaWR9XSBVbmFibGUgdG8gbG9hZCBjaGF0IHNlc3Npb24gJHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fYXBwbHlDaGF0U2Vzc2lvblN0YXRlKG1vZGVsUmVmLCBzZWxlY3RlZE1vZGVsSWQsIHNlbGVjdGVkQWdlbnRVcmkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0UmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbJHt0aGlzLmlkfV0gc2VuZFJlcXVlc3QgcmVqZWN0ZWQ6ICR7cmVzdWx0LnJlYXNvbn1gKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYXBwbHlDaGF0U2Vzc2lvblN0YXRlKG1vZGVsUmVmLCBzZWxlY3RlZE1vZGVsSWQsIHNlbGVjdGVkQWdlbnRVcmksIHsgY2xlYXJEcmFmdDogdHJ1ZSB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIEZpcnN0IHJlcXVlc3Qgc2VudDogcmV2ZXJ0IHRvIHRoZSBob3N0LXJlcG9ydGVkIHN0YXR1cy5cblx0XHRjYWNoZWQubWFya0NoYXRBc1NlbnQoY2hhdFJlc291cmNlLmZyYWdtZW50KTtcblxuXHRcdHJldHVybiBjYWNoZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVDaGF0U2Vzc2lvblN0YXRlKGNoYXRSZXNvdXJjZTogVVJJLCBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFnZW50VXJpOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGNsZWFyRHJhZnQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKGNoYXRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fYXBwbHlDaGF0U2Vzc2lvblN0YXRlKG1vZGVsUmVmLCBtb2RlbElkLCBhZ2VudFVyaSwgb3B0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUNoYXRTZXNzaW9uU3RhdGUobW9kZWxSZWY6IElDaGF0TW9kZWxSZWZlcmVuY2UsIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgYWdlbnRVcmk6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IHsgcmVhZG9ubHkgY2xlYXJEcmFmdD86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0TW9kZWwgPSBtb2RlbFJlZi5vYmplY3QuaW5wdXRNb2RlbDtcblx0XHRpZiAoIWlucHV0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKG1vZGVsSWQpIHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWwgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKTtcblx0XHRcdGlmIChsYW5ndWFnZU1vZGVsKSB7XG5cdFx0XHRcdGlucHV0TW9kZWwuc2V0U3RhdGUoeyBzZWxlY3RlZE1vZGVsOiB7IGlkZW50aWZpZXI6IG1vZGVsSWQsIG1ldGFkYXRhOiBsYW5ndWFnZU1vZGVsIH0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlucHV0TW9kZWwuc2V0U3RhdGUoe1xuXHRcdFx0bW9kZTogeyBpZDogYWdlbnRVcmkgPz8gQ2hhdE1vZGUuQWdlbnQuaWQsIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9LFxuXHRcdFx0Li4uKG9wdGlvbnM/LmNsZWFyRHJhZnQgPyB7IGlucHV0VGV4dDogJycsIGF0dGFjaG1lbnRzOiBbXSwgc2VsZWN0aW9uczogW10gfSA6IHt9KSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmROZXdTZXNzaW9uUmVxdWVzdChuZXdTZXNzaW9uOiBOZXdTZXNzaW9uLCBjaGF0SWQ6IHN0cmluZywgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0aWYgKCF0aGlzLmNvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLl9ub3RDb25uZWN0ZWRTZW5kRXJyb3JNZXNzYWdlKCkpO1xuXHRcdH1cblx0XHRhd2FpdCBuZXdTZXNzaW9uLndhaXRGb3JDb25maWdSZXNvbHV0aW9uKCk7XG5cdFx0YXdhaXQgbmV3U2Vzc2lvbi53YWl0Rm9yRWFnZXJDcmVhdGUoKTtcblx0XHRpZiAodGhpcy5fZ2V0TmV3U2Vzc2lvbihuZXdTZXNzaW9uLnNlc3Npb25JZCkgIT09IG5ld1Nlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiB3YXMgZGlzcG9zZWQgYmVmb3JlIGl0cyBjb25maWd1cmF0aW9uIGNvdWxkIGJlIGFwcGxpZWQuJyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5jb25uZWN0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5fbm90Q29ubmVjdGVkU2VuZEVycm9yTWVzc2FnZSgpKTtcblx0XHR9XG5cblx0XHRuZXdTZXNzaW9uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdGNvbnN0IHNlbGVjdGVkTW9kZWxJZCA9IHRoaXMuX3Jlc29sdmVTZW5kTW9kZWxJZChjaGF0SWQsIG5ld1Nlc3Npb24uZ2V0U2VsZWN0ZWRNb2RlbElkKCkpO1xuXHRcdGNvbnN0IHNlbGVjdGVkQWdlbnQgPSBuZXdTZXNzaW9uLmdldFNlbGVjdGVkQWdlbnQoKTtcblxuXHRcdGNvbnN0IHsgcXVlcnksIGF0dGFjaGVkQ29udGV4dCB9ID0gb3B0aW9ucztcblxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gY2hhdFJlc291cmNlLnNjaGVtZTtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHNlc3Npb25UeXBlKTtcblxuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogc2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHNlbGVjdGVkQWdlbnQgPyB7XG5cdFx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKHNlbGVjdGVkQWdlbnQudXJpKSxcblx0XHRcdFx0XHRuYW1lOiAnJyxcblx0XHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRlbGVtZXRyeU1vZGVJZDogJ2N1c3RvbScsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0fSA6IHtcblx0XHRcdFx0a2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnYWdlbnQnLFxuXHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRhZ2VudElkU2lsZW50OiBjb250cmlidXRpb24/LnR5cGUsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQsXG5cdFx0XHRhZ2VudEhvc3RTZXNzaW9uQ29uZmlnOiB0aGlzLmdldENyZWF0ZVNlc3Npb25Db25maWcoY2hhdElkKSxcblx0XHRcdGhpZGVGcm9tVHJhbnNjcmlwdDogb3B0aW9ucy5oaWRlRnJvbVRyYW5zY3JpcHQsXG5cdFx0fTtcblxuXHRcdC8vIENoYXQgc2Vzc2lvbiBtb2RlbCB3YXMgYWxyZWFkeSBjcmVhdGVkIGJ5IGNyZWF0ZU5ld0NoYXQgYW5kXG5cdFx0Ly8gdGhlIHdpZGdldCB3YXMgb3BlbmVkIGJ5IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2UuIExvYWQgc2Vzc2lvblxuXHRcdC8vIG1vZGVsIGFuZCBhcHBseSBzZWxlY3RlZCBtb2RlbC5cblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKGNoYXRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKG1vZGVsUmVmKSB7XG5cdFx0XHRpZiAoc2VsZWN0ZWRNb2RlbElkKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWwgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChzZWxlY3RlZE1vZGVsSWQpO1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2VNb2RlbCkge1xuXHRcdFx0XHRcdG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgc2VsZWN0ZWRNb2RlbDogeyBpZGVudGlmaWVyOiBzZWxlY3RlZE1vZGVsSWQsIG1ldGFkYXRhOiBsYW5ndWFnZU1vZGVsIH0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzZWxlY3RlZEFnZW50KSB7XG5cdFx0XHRcdC8vIFNlZWQgdGhlIGNoYXQgaW5wdXQncyBtb2RlIHdpdGggdGhlIHBpY2tlZCBjdXN0b20gYWdlbnQgc28gdGhlXG5cdFx0XHRcdC8vIGFnZW50IHBpY2tlciBzaG93cyB0aGUgc2VsZWN0aW9uIGltbWVkaWF0ZWx5LiBXaXRob3V0IHRoaXMgaXRcblx0XHRcdFx0Ly8gd291bGQgb25seSB1cGRhdGUgb25jZSB0aGUgaG9zdCBlY2hvZWQgYFNlc3Npb25BZ2VudENoYW5nZWRgXG5cdFx0XHRcdC8vIGJhY2sgYWZ0ZXIgdGhlIGZpcnN0IHR1cm4uXG5cdFx0XHRcdG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgbW9kZTogeyBpZDogc2VsZWN0ZWRBZ2VudC51cmksIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9IH0pO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIENhcHR1cmUgZXhpc3Rpbmcgc2Vzc2lvbiBrZXlzIGJlZm9yZSBzZW5kaW5nIHNvIHdlIGNhbiBkZXRlY3QgdGhlIG5ld1xuXHRcdC8vIGJhY2tlbmQgc2Vzc2lvbi4gTXVzdCBiZSBjYXB0dXJlZCBiZWZvcmUgc2VuZFJlcXVlc3QgYmVjYXVzZSB0aGVcblx0XHQvLyBiYWNrZW5kIHNlc3Npb24gbWF5IGJlIGNyZWF0ZWQgZHVyaW5nIHRoZSBzZW5kIGFuZCBhcnJpdmUgdmlhXG5cdFx0Ly8gbm90aWZpY2F0aW9uIGJlZm9yZSBzZW5kUmVxdWVzdCByZXNvbHZlcy5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0KHRoaXMuX3Nlc3Npb25DYWNoZS5rZXlzKCkpO1xuXHRcdC8vIFRoZSBlYWdlcmx5LWNyZWF0ZWQgc2Vzc2lvbiBtYXkgYWxyZWFkeSBiZSBjYWNoZWQgYmVmb3JlIGZpcnN0IHNlbmQuXG5cdFx0Ly8gVHJlYXQgdGhhdCByYXcgaWQgYXMgdGhlIHNlc3Npb24gd2UgYXJlIHdhaXRpbmcgZm9yLCBub3Qgb2xkIHN0YXRlLlxuXHRcdGNvbnN0IG5ld1Nlc3Npb25SYXdJZCA9IGNoYXRSZXNvdXJjZS5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cdFx0ZXhpc3RpbmdLZXlzLmRlbGV0ZShuZXdTZXNzaW9uUmF3SWQpO1xuXHRcdC8vIFB1Ymxpc2ggdGhpcyBzZW5kJ3Mgb3duIGlkIHNvIGNvbmN1cnJlbnQgc2FtZS1zY2hlbWUgc2VuZHMgZG9uJ3Rcblx0XHQvLyBsYXRjaCBvbnRvIGl0IHZpYSB0aGVpciBub3ZlbHR5IGZhbGxiYWNrICh3aGljaCB3b3VsZCBzd2FwIHNlc3Npb25zKS5cblx0XHR0aGlzLl9pbkZsaWdodE5ld1Nlc3Npb25Pd25JZHMuYWRkKG5ld1Nlc3Npb25SYXdJZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0UmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFske3RoaXMuaWR9XSBzZW5kUmVxdWVzdCByZWplY3RlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdH1cblxuXHRcdG5ld1Nlc3Npb24uc2V0U3RhdHVzKFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0bmV3U2Vzc2lvbi5jbGVhclNlbGVjdGVkTW9kZWxJZCgpO1xuXG5cdFx0Ly8gU2VlZCB0aGUgdGl0bGUgZnJvbSB0aGUgZmlyc3QgbGluZSBvZiB0aGUgcXVlcnkgc28gdGhlIG5ldy1zZXNzaW9uXG5cdFx0Ly8gdGFiIHNob3dzIHNvbWV0aGluZyBtZWFuaW5nZnVsIGltbWVkaWF0ZWx5LiBUaGlzIHNrZWxldG9uIGlzIHJlcGxhY2VkXG5cdFx0Ly8gYnkgdGhlIGNvbW1pdHRlZCBBZ2VudEhvc3RTZXNzaW9uIG9uY2UgaXQgYXJyaXZlcy5cblx0XHRuZXdTZXNzaW9uLnNldFRpdGxlKChvcHRpb25zLnRpdGxlIHx8IHF1ZXJ5LnNwbGl0KCdcXG4nKVswXSkuc3Vic3RyaW5nKDAsIDEwMCkgfHwgbmV3U2Vzc2lvbi51bnRpdGxlZFRpdGxlKTtcblx0XHRjb25zdCBza2VsZXRvbiA9IG5ld1Nlc3Npb24uc2Vzc2lvbjtcblx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbiA9IHNrZWxldG9uO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbc2tlbGV0b25dLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHQvLyBSYXcgaWQgY2xhaW1lZCBieSBfd2FpdEZvck5ld1Nlc3Npb24gZm9yIHRoaXMgc2VuZCAocmVsZWFzZWQgaW4gZmluYWxseSkuXG5cdFx0bGV0IGNvbW1pdHRlZFJhd0lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbW1pdHRlZFNlc3Npb24gPSBhd2FpdCB0aGlzLl93YWl0Rm9yTmV3U2Vzc2lvbihleGlzdGluZ0tleXMsIGNoYXRSZXNvdXJjZS5zY2hlbWUsIG5ld1Nlc3Npb25SYXdJZCwgbmV3U2Vzc2lvbi5jYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHRpZiAoY29tbWl0dGVkU2Vzc2lvbikge1xuXHRcdFx0XHRjb21taXR0ZWRSYXdJZCA9IGNvbW1pdHRlZFNlc3Npb24ucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0XHRcdHRoaXMuX3ByZXNlcnZlTmV3U2Vzc2lvbkNvbmZpZyhuZXdTZXNzaW9uLCBjb21taXR0ZWRTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnRpdGxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZW5hbWVTZXNzaW9uKGNvbW1pdHRlZFNlc3Npb24uc2Vzc2lvbklkLCBvcHRpb25zLnRpdGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDYXJyeSB0aGUgcGlja2VkIGN1c3RvbSBhZ2VudCBvbnRvIHRoZSBjb21taXR0ZWQgc2Vzc2lvbiBiZWZvcmVcblx0XHRcdFx0Ly8gdGhlIHJlcGxhY2UgZXZlbnQgc28gdGhlIGFnZW50IHBpY2tlciBkb2Vzbid0IHJlc2V0IHRvIHRoZVxuXHRcdFx0XHQvLyBkZWZhdWx0IG9uY2UgdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIHN3YXBwZWQgKHRoZSBwaWNrZXIgbWlycm9yc1xuXHRcdFx0XHQvLyBgc2Vzc2lvbi5tb2RlYCwgd2hpY2ggaXMgb3RoZXJ3aXNlIGB1bmRlZmluZWRgIG9uIHRoZSBmcmVzaGx5XG5cdFx0XHRcdC8vIGNvbW1pdHRlZCBhZGFwdGVyKS4gVGhlIGhvc3QgYWxyZWFkeSByZWNlaXZlZCB0aGUgYWdlbnQgd2l0aCB0aGVcblx0XHRcdFx0Ly8gZmlyc3QgdHVybiAoc2VlIGBzZW5kT3B0aW9ucy5tb2RlSW5mb2ApLCBzbyB1cGRhdGUgb25seSB0aGUgbG9jYWxcblx0XHRcdFx0Ly8gbW9kZSBvYnNlcnZhYmxlIGhlcmUgcmF0aGVyIHRoYW4gcmUtbm90aWZ5aW5nIGl0IHZpYSBgc2V0QWdlbnRgLlxuXHRcdFx0XHRpZiAoc2VsZWN0ZWRBZ2VudCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdHRlZFJhd0lkRm9yQWdlbnQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoY29tbWl0dGVkU2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdHRlZEFkYXB0ZXIgPSBjb21taXR0ZWRSYXdJZEZvckFnZW50ID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChjb21taXR0ZWRSYXdJZEZvckFnZW50KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb21taXR0ZWRBZGFwdGVyPy5zZXRDaGF0QWdlbnQoY29tbWl0dGVkQWRhcHRlci5yZXNvdXJjZSwgc2VsZWN0ZWRBZ2VudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gU2Vzc2lvbiBncmFkdWF0ZWQ6IHJlbGVhc2UgdGhlIGVhZ2VyIHN1YnNjcmlwdGlvbiB3aXRob3V0XG5cdFx0XHRcdC8vIGZpcmluZyBgZGlzcG9zZVNlc3Npb25gLiBUaGUgc2Vzc2lvbiBoYW5kbGVyIGhhcyBhbHJlYWR5XG5cdFx0XHRcdC8vIGFjcXVpcmVkIGl0cyBvd24gc3Vic2NyaXB0aW9uIChjaGF0IHdpZGdldCB3YXMgb3BlbmVkXG5cdFx0XHRcdC8vIGVhcmxpZXIpLCBzbyB0aGUgd2lyZS1sZXZlbCByZWZjb3VudCBzdGF5cyBwb3NpdGl2ZS5cblx0XHRcdFx0bmV3U2Vzc2lvbi5ncmFkdWF0ZSgpO1xuXHRcdFx0XHRpZiAodGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KG5ld1Nlc3Npb24uc2Vzc2lvbklkKSA9PT0gbmV3U2Vzc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuX25ld1Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2UobmV3U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENsZWFyIHRoZSBwZW5kaW5nIHNlc3Npb24gYmVmb3JlIGZpcmluZyB0aGUgcmVwbGFjZSBldmVudCBzb1xuXHRcdFx0XHQvLyB0aGF0IGFueSBzeW5jaHJvbm91cyBsaXN0ZW5lciBjYWxsaW5nIGdldFNlc3Npb25zKCkgc2VlcyBvbmx5XG5cdFx0XHRcdC8vIHRoZSBjb21taXR0ZWQgc2Vzc2lvbiBhbmQgbm90IGJvdGguXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tOiBza2VsZXRvbiwgdG86IGNvbW1pdHRlZFNlc3Npb24gfSk7XG5cdFx0XHRcdHJldHVybiBjb21taXR0ZWRTZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gQ29ubmVjdGlvbiBsb3N0IG9yIHRpbWVvdXQgXHUyMDE0IGZhbGwgdGhyb3VnaCB0byB0aGUgZmFpbHVyZSBjbGVhbnVwLlxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBSZWxlYXNlIHRoZSBjbGFpbSBzbyB1bnJlbGF0ZWQgZnV0dXJlIHNlbmRzIGNhbiBtYXRjaCB0aGlzXG5cdFx0XHQvLyBzZXNzaW9uIGlmIG5lZWRlZDsgY29uY3VycmVudCBpbi1mbGlnaHQgc2VuZHMgYWxyZWFkeSBjYXB0dXJlZFxuXHRcdFx0Ly8gdGhlaXIgYGV4aXN0aW5nS2V5c2AgYW5kIHdvbid0IHJldHJvYWN0aXZlbHkgbWF0Y2ggaXQuXG5cdFx0XHRpZiAoY29tbWl0dGVkUmF3SWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9jb21taXR0aW5nU2Vzc2lvblJhd0lkcy5kZWxldGUoY29tbWl0dGVkUmF3SWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW5GbGlnaHROZXdTZXNzaW9uT3duSWRzLmRlbGV0ZShuZXdTZXNzaW9uUmF3SWQpO1xuXHRcdFx0Ly8gRGVmZW5zaXZlIGNsZWFyOiBjb3ZlcnMgdGhlIGZhaWx1cmUgcGF0aCB3aGVyZSB0aGUgdHJ5IGJsb2NrXG5cdFx0XHQvLyBuZXZlciByZWFjaGVkIHRoZSBleHBsaWNpdCBjbGVhciBhYm92ZS5cblx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE9uIGZhaWx1cmU6IGRyb3AgdGhlIGVhZ2VyIHN1YnNjcmlwdGlvbiB3aXRob3V0IGZpcmluZ1xuXHRcdC8vIGBkaXNwb3NlU2Vzc2lvbmAuIFRoZSBzZXJ2ZXItc2lkZSBlbXB0eS1zZXNzaW9uIEdDIHdpbGwgY2xlYW4gdXBcblx0XHQvLyB0aGUgcHJvdmlzaW9uYWwgc2Vzc2lvbiBpZiBpdCByZW1haW5zOyB3ZSBsZWFuIG9uIHRoZSBHQyByYXRoZXJcblx0XHQvLyB0aGFuIHJpc2tpbmcgYSBkb3VibGUtZGlzcG9zZSByYWNlIG9uIHRyYW5zaWVudCBmYWlsdXJlcy5cblx0XHRuZXdTZXNzaW9uLmdyYWR1YXRlKCk7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmdldChuZXdTZXNzaW9uLnNlc3Npb25JZCkgPT09IG5ld1Nlc3Npb24pIHtcblx0XHRcdHRoaXMuX25ld1Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2UobmV3U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtza2VsZXRvbl0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnc2Vzc2lvbk5vdENvbW1pdHRlZCcsIFwiQWdlbnQgaG9zdCBzZXNzaW9uIHdhcyBub3QgY29tbWl0dGVkLlwiKSk7XG5cdH1cblxuXHQvKiogTG9jYWxpemVkIGVycm9yIG1lc3NhZ2Ugd2hlbiBzZW5kUmVxdWVzdCBpcyBpbnZva2VkIHdpdGhvdXQgYSBjb25uZWN0aW9uLiBTdWJjbGFzc2VzIGNhbiBvdmVycmlkZS4gKi9cblx0cHJvdGVjdGVkIF9ub3RDb25uZWN0ZWRTZW5kRXJyb3JNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdub3RDb25uZWN0ZWRTZW5kJywgXCJDYW5ub3Qgc2VuZCByZXF1ZXN0OiBub3QgY29ubmVjdGVkIHRvIGFnZW50IGhvc3QuXCIpO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbiBjb25maWcgcGx1bWJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFdoZW4gYSBzZXNzaW9uIHRyYW5zaXRpb25zIGZyb20gdW50aXRsZWQgKG5ldykgdG8gY29tbWl0dGVkIChydW5uaW5nKSxcblx0ICogY2Fycnkgb3ZlciB0aGUgZnVsbCByZXNvbHZlZCBjb25maWcgKHNjaGVtYSArIHZhbHVlcykgc28gY29uc3VtZXJzIGxpa2Vcblx0ICogdGhlIHNlc3Npb24tc2V0dGluZ3MgSlNPTkMgZWRpdG9yIGNhbiByb3VuZC10cmlwIG5vbi1tdXRhYmxlIHZhbHVlc1xuXHQgKiAoYGlzb2xhdGlvbmAsIGBicmFuY2hgLCBcdTIwMjYpIHRocm91Z2ggYSByZXBsYWNlIGRpc3BhdGNoLiBNdXRhYmxlLXZzLXJlYWRvbmx5XG5cdCAqIGJlaGF2aW9yIGlzIHN0aWxsIGRyaXZlbiBvZmYgdGhlIHBlci1wcm9wZXJ0eSBgc2Vzc2lvbk11dGFibGVgIGZsYWcuXG5cdCAqL1xuXHRwcml2YXRlIF9wcmVzZXJ2ZU5ld1Nlc3Npb25Db25maWcobmV3U2Vzc2lvbjogTmV3U2Vzc2lvbiwgY29tbWl0dGVkU2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWcgPSBuZXdTZXNzaW9uLmdldENvbmZpZygpO1xuXHRcdGlmIChjb25maWcgJiYgT2JqZWN0LmtleXMoY29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3Muc2V0KGNvbW1pdHRlZFNlc3Npb25JZCwge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgLi4uY29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzIH0gfSxcblx0XHRcdFx0dmFsdWVzOiB7IC4uLmNvbmZpZy52YWx1ZXMgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FwcGx5V29ya3RyZWVJc29sYXRpb24oY29tbWl0dGVkU2Vzc2lvbklkLCBjb25maWc/LnZhbHVlcyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Jhd0lkRnJvbUNoYXRJZChjaGF0SWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJlZml4ID0gYCR7dGhpcy5pZH06YDtcblx0XHRjb25zdCByZXNvdXJjZVN0ciA9IGNoYXRJZC5zdGFydHNXaXRoKHByZWZpeCkgPyBjaGF0SWQuc3Vic3RyaW5nKHByZWZpeC5sZW5ndGgpIDogY2hhdElkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKHJlc291cmNlU3RyKS5wYXRoLnN1YnN0cmluZygxKSB8fCB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2ZUNoYXRSZXNvdXJjZShzZXNzaW9uOiBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlcik6IFVSSSB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy5zZXNzaW9uSWQgPT09IHNlc3Npb24uc2Vzc2lvbklkID8gYWN0aXZlU2Vzc2lvbi5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlIDogc2Vzc2lvbi5yZXNvdXJjZTtcblx0fVxuXG5cdC8vIC0tIExhenkgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gc2VlZGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBJZGxlIHdpbmRvdyBiZWZvcmUgYSBsYXppbHktY3JlYXRlZCBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBpc1xuXHQgKiByZWxlYXNlZC4gRWFjaCBjYWxsIHRvIHtAbGluayBfa2VlcFNlc3Npb25TdGF0ZUFsaXZlfSByZXNldHMgdGhlIHRpbWVyLlxuXHQgKiBMb25nIGVub3VnaCB0byBhYnNvcmIgdGhlIG9wZW5cdTIxOTJjb25maWctcGlja2VyIGNodXJuIHdoaWxlIGEgc2Vzc2lvbiB2aWV3XG5cdCAqIGlzIGFjdGl2ZTsgc2hvcnQgZW5vdWdoIHRoYXQgY2xvc2VkIHNlc3Npb25zIHJlbGVhc2Ugd2l0aGluIGEgbWludXRlIG9yXG5cdCAqIHNvLCBhbGxvd2luZyB0aGUgYWdlbnQgaG9zdCB0byBldmljdCB0aGVpciBjYWNoZWQgcmVzdG9yZWQgc3RhdGUuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVNTSU9OX1NUQVRFX1NVQlNDUklQVElPTl9JRExFX01TID0gMzBfMDAwO1xuXG5cdC8qKlxuXHQgKiBQaW4gdGhlIHN0YXRlIHN1YnNjcmlwdGlvbiBvZiBldmVyeSBjdXJyZW50bHktdmlzaWJsZSBzZXNzaW9uIChzb1xuXHQgKiBob3N0LWRyaXZlbiBjYXRhbG9nIGNoYW5nZXMgZmxvdyBpbnRvIGBjYWNoZWQuY2hhdHNgIHdoaWxlIGl0IGlzIG9uXG5cdCAqIHNjcmVlbikgYW5kIHJlc3VtZSB0aGUgaWRsZS1yZWxlYXNlIHRpbWVyIGZvciBzZXNzaW9ucyB0aGF0IGhhdmUgbGVmdCB0aGVcblx0ICogdmlld3BvcnQuIERyaXZlbiByZWFjdGl2ZWx5IGJ5IHtAbGluayBJU2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9uc30uXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jVmlzaWJsZVNlc3Npb25TdGF0ZVBpbnMocmVhZGVyOiBJUmVhZGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IG5vd1Zpc2libGUgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdmlzaWJsZSkge1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBjYWNoZWQgb2YgdGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKGNhY2hlZC5yZXNvdXJjZSwgc2Vzc2lvbi5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRub3dWaXNpYmxlLmFkZChjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBQaW4gdmlzaWJsZSBzZXNzaW9uczogaG9sZCB0aGUgc3Vic2NyaXB0aW9uIG9wZW4sIGNhbmNlbGxpbmcgYW55IHBlbmRpbmdcblx0XHQvLyBpZGxlIHJlbGVhc2UuIEFsbCBvcGVyYXRpb25zIGFyZSBpZGVtcG90ZW50LCBzbyByZS1ydW5uaW5nIHBlciB0aWNrIGFsc29cblx0XHQvLyByZWNvdmVycyBhIHN1YnNjcmlwdGlvbiB0aGF0IGNvdWxkIG5vdCBiZSBjcmVhdGVkIGVhcmxpZXIgKGUuZy4gYSByZW1vdGVcblx0XHQvLyBwcm92aWRlciB0aGF0IHdhcyBtb21lbnRhcmlseSBkaXNjb25uZWN0ZWQpLlxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIG5vd1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX3Bpbm5lZFNlc3Npb25TdGF0ZXMuYWRkKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24oc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHQvLyBVbnBpbiBzZXNzaW9ucyB0aGF0IGhhdmUgbGVmdCB0aGUgdmlld3BvcnQ6IHJlc3VtZSB0aGUgaWRsZS1yZWxlYXNlXG5cdFx0Ly8gdGltZXIgc28gdGhlIGFnZW50IGhvc3QgY2FuIGV2ZW50dWFsbHkgZXZpY3QgdGhlaXIgcmVzdG9yZWQgc3RhdGUuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uSWQgb2YgWy4uLnRoaXMuX3Bpbm5lZFNlc3Npb25TdGF0ZXNdKSB7XG5cdFx0XHRpZiAoIW5vd1Zpc2libGUuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdFx0dGhpcy5fcGlubmVkU2Vzc2lvblN0YXRlcy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdFx0dGhpcy5fa2VlcFNlc3Npb25TdGF0ZUFsaXZlKHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1bXAgdGhlIGlkbGUtcmVsZWFzZSB0aW1lciBmb3IgYHNlc3Npb25JZGAgYW5kIGxhemlseSBjcmVhdGUgdGhlXG5cdCAqIHVuZGVybHlpbmcgc3Vic2NyaXB0aW9uIGlmIG5lZWRlZC4gQ2FsbGVkIGZyb20gcXVlcnkgcGF0aHNcblx0ICogKHtAbGluayBnZXRTZXNzaW9uQnlSZXNvdXJjZX0sIHtAbGluayBnZXRTZXNzaW9uQ29uZmlnfSkgdGhhdCBkZXBlbmQgb25cblx0ICogYF9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3NgIC8gYF9tZXRhYCBiZWluZyBpbiBzeW5jIGJ1dCBjYW5ub3QgdGhlbXNlbHZlc1xuXHQgKiBvd24gYSBzdWJzY3JpcHRpb24gaGFuZGxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfa2VlcFNlc3Npb25TdGF0ZUFsaXZlKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5zdXJlU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEEgdmlzaWJsZSBzZXNzaW9uJ3Mgc3Vic2NyaXB0aW9uIGlzIHBpbm5lZCBvcGVuOyBuZXZlciBhcm0gdGhlIGlkbGVcblx0XHQvLyByZWxlYXNlIHdoaWxlIGl0IGlzIG9uIHNjcmVlbi5cblx0XHRpZiAodGhpcy5fcGlubmVkU2Vzc2lvblN0YXRlcy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlSWRsZVRpbWVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMuc2V0KFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0ZGlzcG9zYWJsZVRpbWVvdXQoXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVJZGxlVGltZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0QmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuU0VTU0lPTl9TVEFURV9TVUJTQ1JJUFRJT05fSURMRV9NUyxcblx0XHRcdCksXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXppbHkgYWNxdWlyZSBhIHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIGZvciBgc2Vzc2lvbklkYCBzbyB0aGF0XG5cdCAqIGBfcnVubmluZ1Nlc3Npb25Db25maWdzYCBpcyBzZWVkZWQgZnJvbSB0aGUgQUhQIGBTZXNzaW9uU3RhdGUuY29uZmlnYFxuXHQgKiBzbmFwc2hvdC4gU2FmZSB0byBjYWxsIHJlcGVhdGVkbHkgXHUyMDE0IG5vLW9wIG9uY2UgYSBzdWJzY3JpcHRpb24gZXhpc3RzLlxuXHQgKlxuXHQgKiBUaGUgc3Vic2NyaXB0aW9uIGlzIHJlZmVyZW5jZS1jb3VudGVkIGJ5IHtAbGluayBJQWdlbnRDb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbn0sXG5cdCAqIHNvIHdoZW4gdGhlIHNlc3Npb24gaGFuZGxlciBpcyBhbHNvIHN1YnNjcmliZWQgKGNoYXQgY29udGVudCBvcGVuKSB0aGlzXG5cdCAqIHNoYXJlcyB0aGUgZXhpc3Rpbmcgd2lyZSBzdWJzY3JpcHRpb24gcmF0aGVyIHRoYW4gb3BlbmluZyBhIG5ldyBvbmUuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGlmICghcmF3SWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQSBzdXJmYWNlZC1idXQtdW4tYWRvcHRlZCBsZWdhY3kgQ29waWxvdCBDTEkgc2Vzc2lvbiBtdXN0IE5PVCBiZVxuXHRcdC8vIHN1YnNjcmliZWQgcGFzc2l2ZWx5OiBzdWJzY3JpYmluZyBpdHMgc2Vzc2lvbi9jaGF0IGNoYW5uZWwgdHJpZ2dlcnMgYW5cblx0XHQvLyBhZ2VudC1ob3N0IHJlc3RvcmUsIHdoaWNoIGFkb3B0cyAobWlncmF0ZXMpIGl0LiBNaWdyYXRpb24gbXVzdCBoYXBwZW5cblx0XHQvLyBvbmx5IHdoZW4gdGhlIHVzZXIgZXhwbGljaXRseSBvcGVucyB0aGUgc2Vzc2lvbi4gSXQgcmVuZGVycyByZWFkLW9ubHlcblx0XHQvLyBmcm9tIGl0cyBzdW1tYXJ5IHVudGlsIHRoZW47IHRoZSBtYXJrZXIgY2xlYXJzIG9uY2UgaXQgaXMgYWRvcHRlZC5cblx0XHRpZiAocmVhZFNlc3Npb25FaGNsaUFkb3B0YWJsZSh0aGlzLl9tZXRhQnlSYXdJZC5nZXQocmF3SWQpPy5fbWV0YSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNhY2hlZC5iYWNrZW5kVXJpO1xuXHRcdGNvbnN0IHJlZiA9IGNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzZXNzaW9uVXJpLCAnQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuc3VtbWFyeScpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChyZWYpO1xuXHRcdHN0b3JlLmFkZChyZWYub2JqZWN0Lm9uRGlkQ2hhbmdlKHN0YXRlID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5U2Vzc2lvblN0YXRlVXBkYXRlKHNlc3Npb25JZCwgc3RhdGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLnNldChzZXNzaW9uSWQsIHN0b3JlKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gcmVmLm9iamVjdC52YWx1ZTtcblx0XHRpZiAodmFsdWUgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhpcy5fYXBwbHlTZXNzaW9uU3RhdGVVcGRhdGUoc2Vzc2lvbklkLCB2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faHlkcmF0ZUFnZW50RnJvbURyYWZ0KGNvbm5lY3Rpb24sIGNhY2hlZCwgc2Vzc2lvbklkLCBzZXNzaW9uVXJpLCBzdG9yZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzdW1lIGh5ZHJhdGlvbjogd2hlbiBhIHNlc3Npb24gaXMgKHJlKWxvYWRlZCBhbmQgaXRzIGFkYXB0ZXIgaGFzIG5vIGFnZW50XG5cdCAqIHNlbGVjdGVkLCByZXN0b3JlIHRoZSBwZXJzaXN0ZWQgc2VsZWN0aW9uIGZyb20gdGhlIGRlZmF1bHQgY2hhdCdzXG5cdCAqIGBDaGF0U3RhdGUuZHJhZnQuYWdlbnRgIGFuZCBtaXJyb3IgaXQgb250byBgc2Vzc2lvbi5tb2RlYCAodGhlIHBpY2tlcidzXG5cdCAqIHNvdXJjZSBvZiB0cnV0aCkuXG5cdCAqXG5cdCAqIFRoZSBhZ2VudCBpcyBwZXJzaXN0ZWQgb24gdGhlIGNoYXQgY2hhbm5lbCBcdTIwMTQgdGhlIHNlc3Npb24gY2hhbm5lbFxuXHQgKiAoe0BsaW5rIFNlc3Npb25TdGF0ZX0pIGNhcnJpZXMgbm8gZHJhZnQgXHUyMDE0IHNvIHdlIGJyaWVmbHkgb2JzZXJ2ZSB0aGUgZGVmYXVsdFxuXHQgKiBjaGF0J3Mgc3RhdGUgdW50aWwgaXRzIGRyYWZ0IGFnZW50IGFycml2ZXMuIFRoZSBzdWJzY3JpcHRpb24gaXMgc2hhcmVkIGFuZFxuXHQgKiByZWYtY291bnRlZCB3aXRoIHRoZSBjaGF0IHNlc3Npb24gaGFuZGxlciAobm8gZXh0cmEgd2lyZSBjb3N0KSBhbmQgbGl2ZXMgZm9yXG5cdCAqIHRoZSBzZXNzaW9uLXN0YXRlIHN0b3JlJ3MgbGlmZXRpbWUuIEh5ZHJhdGlvbiBpcyBvbmUtc2hvdDogdGhlIG9ic2VydmVyXG5cdCAqIHN0b3BzIGFzIHNvb24gYXMgYG1vZGVgIGlzIHNldCBcdTIwMTQgYnkgdXMgaGVyZSwgb3IgYnkgYSBjb25jdXJyZW50IGdyYWR1YXRpb25cblx0ICogc2VlZCBvciB1c2VyIHBpY2sgKGd1YXJkZWQgaW5zaWRlXG5cdCAqIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlci5oeWRyYXRlU2VsZWN0ZWRBZ2VudH0pIFx1MjAxNCBzbyBpdCBuZWl0aGVyIGxlYWtzLFxuXHQgKiBvdmVycmlkZXMgYSBsYXRlciBzZWxlY3Rpb24sIG5vciBrZWVwcyByZS1ydW5uaW5nIG9uIGV2ZXJ5IGNoYXQgdXBkYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfaHlkcmF0ZUFnZW50RnJvbURyYWZ0KGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGNhY2hlZDogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIsIHNlc3Npb25JZDogc3RyaW5nLCBzZXNzaW9uVXJpOiBVUkksIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRpZiAoY2FjaGVkLm1vZGUuZ2V0KCkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0RGVmYXVsdENoYXQgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKT8uZGVmYXVsdENoYXQ7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBsYXN0RGVmYXVsdENoYXQgPyBVUkkucGFyc2UobGFzdERlZmF1bHRDaGF0LnRvU3RyaW5nKCkpIDogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdGNvbnN0IGNoYXRSZWYgPSBjb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuQ2hhdCwgZGVmYXVsdENoYXRVcmksICdCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5kcmFmdEFnZW50Jyk7XG5cdFx0c3RvcmUuYWRkKGNoYXRSZWYpO1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCB0cnlIeWRyYXRlID0gKCkgPT4ge1xuXHRcdFx0aWYgKGNhY2hlZC5tb2RlLmdldCgpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgY2hhdFN0YXRlID0gY2hhdFJlZi5vYmplY3QudmFsdWU7XG5cdFx0XHRcdGNvbnN0IGFnZW50VXJpID0gY2hhdFN0YXRlICYmICEoY2hhdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpID8gY2hhdFN0YXRlLmRyYWZ0Py5hZ2VudD8udXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoYWdlbnRVcmkpIHtcblx0XHRcdFx0XHRjYWNoZWQuaHlkcmF0ZVNlbGVjdGVkQWdlbnQoYWdlbnRVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FjaGVkLm1vZGUuZ2V0KCkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaXN0ZW5lci5jbGVhcigpOyAvLyBoeWRyYXRpb24gaXMgb25lLXNob3Q7IHN0b3Agb2JzZXJ2aW5nXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRsaXN0ZW5lci52YWx1ZSA9IGNoYXRSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlKCgpID0+IHRyeUh5ZHJhdGUoKSk7XG5cdFx0dHJ5SHlkcmF0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZhbi1vdXQgZm9yIEFIUCBgU2Vzc2lvblN0YXRlYCBzbmFwc2hvdHM6IGtlZXBzIGJvdGggdGhlIHJ1bm5pbmdcblx0ICogc2Vzc2lvbiBjb25maWcgYW5kIHRoZSBjYWNoZWQgYWRhcHRlcidzIGBfbWV0YWAgKGUuZy4gZ2l0IHN0YXRlKSBpblxuXHQgKiBzeW5jLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlTZXNzaW9uU3RhdGVVcGRhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXRlOiBTZXNzaW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLnNldChzZXNzaW9uSWQsIHN0YXRlKTtcblx0XHQvLyBPbmx5IGZpcmUgd2hlbiB0aGUgaW5wdXRzIHRvIGBnZXRDdXN0b21BZ2VudHNgIGFjdHVhbGx5IGNoYW5nZS5cblx0XHQvLyBgU2Vzc2lvblN0YXRlYCB1cGRhdGVzIGZpcmUgZm9yIGV2ZXJ5IHR1cm4tc3RhdHVzIC8gYWN0aXZpdHkgLyBtZXRhXG5cdFx0Ly8gY2hhbmdlIHRvbyBcdTIwMTQgZmlyaW5nIG9uIGFsbCBvZiB0aGVtIGNhdXNlZCBleGNlc3NpdmUgcGlja2VyXG5cdFx0Ly8gcmVjb21wdXRlcyAoYW5kIGEgZmVlZGJhY2sgbG9vcCB3aXRoIGBzZXRBZ2VudGApLlxuXHRcdGlmICghcHJldmlvdXMgfHwgY3VzdG9taXphdGlvbnNDaGFuZ2VkKHByZXZpb3VzLCBzdGF0ZSkpIHtcblx0XHRcdHRoaXMuX3JlY29uY2lsZUFnZW50RnJvbVN0YXRlKHNlc3Npb25JZCwgc3RhdGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NlZWRSdW5uaW5nQ29uZmlnRnJvbVN0YXRlKHNlc3Npb25JZCwgc3RhdGUpO1xuXHRcdHRoaXMuX2FwcGx5U2Vzc2lvbk1ldGFGcm9tU3RhdGUoc2Vzc2lvbklkLCBzdGF0ZSk7XG5cdFx0dGhpcy5fYXBwbHlDaGF0Q2F0YWxvZ0Zyb21TdGF0ZShzZXNzaW9uSWQsIHN0YXRlKTtcblxuXHRcdGlmICghcHJldmlvdXMpIHtcblx0XHRcdC8vIFRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgd2UndmUgc2VlbiB0aGlzIHNlc3Npb24gYW5kIHRoZSBpbml0aWFsXG5cdFx0XHQvLyBsaXN0IG9mIGNoYW5nZXNldHMgYXJlIGluY2x1ZGVkIGluIHRoZSBzdGF0ZSwgc28gd2UgdXNlIHRoYXQgdG9cblx0XHRcdC8vIGluaXRpYWxpemUgdGhlIGNoYW5nZXNldCBjYXRhbG9ndWUudiBTdWJzZXF1ZW50IHVwZGF0ZXMgd2lsbCBiZVxuXHRcdFx0Ly8gaGFuZGxlZCBieSBoYW5kbGluZyB0aGUgQWN0aW9uVHlwZS5TZXNzaW9uQ2hhbmdlc2V0c0NoYW5nZWRcblx0XHRcdC8vIGFjdGlvbi5cblx0XHRcdHRoaXMuX2FwcGx5Q2hhbmdlc2V0c0Zyb21TdGF0ZShzZXNzaW9uSWQsIHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VlZCB0aGUgY2FjaGVkIGFkYXB0ZXIncyBjaGFuZ2VzZXQgY2F0YWxvZ3VlIGZyb20gYW4gQUhQXG5cdCAqIHtAbGluayBTZXNzaW9uU3RhdGV9LiBUaGUgY2F0YWxvZ3VlIG90aGVyd2lzZSBvbmx5IGZsb3dzIGluIHZpYSB0aGUgbGl2ZVxuXHQgKiBgU2Vzc2lvbkNoYW5nZXNldHNDaGFuZ2VkYCBhY3Rpb24sIHdoaWNoIHRoZSBob3N0IGVtaXRzIG9ubHkgd2hlbiBlbnRyaWVzXG5cdCAqIGFyZSBhZGRlZCBvciByZW1vdmVkLiBPbiByZXN0b3JlIChlLmcuIGFmdGVyIGEgcmVsb2FkKSBub3RoaW5nIG11dGF0ZXMsIHNvXG5cdCAqIHRoYXQgYWN0aW9uIG5ldmVyIGZpcmVzIGFuZCB0aGUgY2F0YWxvZ3VlIHdvdWxkIHN0YXkgZW1wdHkuIFRoZSByZXN0b3JlZFxuXHQgKiBgU2Vzc2lvblN0YXRlYCBzbmFwc2hvdCBjYXJyaWVzIHRoZSBwZXJzaXN0ZWQgYGNoYW5nZXNldHNgLCBzbyBhcHBseSBpdFxuXHQgKiBoZXJlIHRvIHN1cmZhY2UgdGhlIGNhdGFsb2d1ZSBpbW1lZGlhdGVseS5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5Q2hhbmdlc2V0c0Zyb21TdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdGlmIChzdGF0ZS5jaGFuZ2VzZXRzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNhY2hlZC51cGRhdGVDaGFuZ2VzZXRzKHN0YXRlLmNoYW5nZXNldHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYmFzZSB0aGUgY2FjaGVkIHJ1bm5pbmcgYWRhcHRlcidzIHNlbGVjdGVkIGFnZW50IGFnYWluc3QgdGhlIGhvc3QncyBhZ2VudFxuXHQgKiBsaXN0IGZyb20gYW4gQUhQIHtAbGluayBTZXNzaW9uU3RhdGV9LCBiZWZvcmUgdGhlIHBpY2tlciBpcyBub3RpZmllZC4gQVxuXHQgKiBzZXNzaW9uIHRoYXQgaGFzIG1vdmVkIGludG8gYW4gaXNvbGF0ZWQgd29ya3RyZWUga2VlcHMgaXRzIHNlbGVjdGlvbiBpbnN0ZWFkXG5cdCAqIG9mIHJlc2V0dGluZyB0byB0aGUgZGVmYXVsdCBvbmNlIHRoZSBob3N0IHN0YXJ0cyByZXBvcnRpbmcgd29ya3RyZWUtcGF0aGVkXG5cdCAqIGFnZW50cy4gU2VlIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlci5yZWNvbmNpbGVTZWxlY3RlZEFnZW50fS5cblx0ICovXG5cdHByaXZhdGUgX3JlY29uY2lsZUFnZW50RnJvbVN0YXRlKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNhY2hlZC5yZWNvbmNpbGVTZWxlY3RlZEFnZW50KGdldEVmZmVjdGl2ZUFnZW50cyhzdGF0ZS5jdXN0b21pemF0aW9ucykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29uY2lsZSB0aGUgcGVyLWNoYXQgY2F0YWxvZyBvZiB0aGUgY2FjaGVkIHJ1bm5pbmcgYWRhcHRlciBmcm9tIGFuIEFIUFxuXHQgKiB7QGxpbmsgU2Vzc2lvblN0YXRlfS4gVGhlIGFkYXB0ZXIgZXhwb3NlcyBgY2hhdHNgL2BtYWluQ2hhdGAgYXNcblx0ICogb2JzZXJ2YWJsZXMsIHNvIHVwZGF0aW5nIHRoZW0gaGVyZSBpcyBlbm91Z2ggZm9yIHRoZSBjaGF0LXRhYiBVSSB0b1xuXHQgKiByZS1yZW5kZXIgcmVhY3RpdmVseS5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5Q2hhdENhdGFsb2dGcm9tU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXRlOiBTZXNzaW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGlmICghcmF3SWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2FjaGVkLmFwcGx5Q2hhdENhdGFsb2coc3RhdGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5ld1Nlc3Npb24gdmFyaWFudCBvZiB7QGxpbmsgX2FwcGx5U2Vzc2lvblN0YXRlVXBkYXRlfTogd3JpdGVzIHRoZVxuXHQgKiBjdXN0b21pemF0aW9ucyBzdWJzZXQgYW5kIGFwcGxpZXMgZ2l0L0dpdEh1YiBtZXRhZGF0YSB0byB0aGUgZHJhZnRcblx0ICogd29ya3NwYWNlLiBTa2lwcyB7QGxpbmsgX3NlZWRSdW5uaW5nQ29uZmlnRnJvbVN0YXRlfSBiZWNhdXNlIE5ld1Nlc3Npb25cblx0ICogb3ducyBpdHMgb3duIGNvbmZpZyB2aWEgYE5ld1Nlc3Npb24uX2NvbmZpZ2AuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVOZXdTZXNzaW9uU3RhdGVVcGRhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXRlOiBTZXNzaW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLnNldChzZXNzaW9uSWQsIHN0YXRlKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKT8uYXBwbHlTZXNzaW9uTWV0YShzdGF0ZS5fbWV0YSk7XG5cdFx0aWYgKCFwcmV2aW91cyB8fCBjdXN0b21pemF0aW9uc0NoYW5nZWQocHJldmlvdXMsIHN0YXRlKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFudXAgc2VudGluZWwgZnJvbSB7QGxpbmsgTmV3U2Vzc2lvbi5kaXNwb3NlfTogZHJvcHMgdGhlIGNhY2hlZFxuXHQgKiBgX2xhc3RTZXNzaW9uU3RhdGVzYCBlbnRyeSB0aGUgbmV3IHNlc3Npb24gY29udHJpYnV0ZWQuIEZpcmVzXG5cdCAqIGBfb25EaWRDaGFuZ2VDdXN0b21BZ2VudHNgIHNvIGFueSBvcGVuIHBpY2tlciByZS1yZWFkcyBhbmQgZmFsbHNcblx0ICogYmFjayB0byB0aGUgZW1wdHkgbGlzdCByYXRoZXIgdGhhbiByZW5kZXJpbmcgc3RhbGUgYWdlbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlTmV3U2Vzc2lvblN0YXRlR29uZShzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5kZWxldGUoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlTZXNzaW9uTWV0YUZyb21TdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFyYXdJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjYWNoZWQuc2V0TWV0YShzdGF0ZS5fbWV0YSkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkIHtAbGluayBfcnVubmluZ1Nlc3Npb25Db25maWdzfSBmcm9tIHRoZSBBSFAgYFNlc3Npb25TdGF0ZS5jb25maWdgXG5cdCAqIHNuYXBzaG90LiBLZWVwcyB0aGUgZnVsbCBzY2hlbWEgKyB2YWx1ZXMgKGluY2x1ZGluZyBub24tbXV0YWJsZSBvbmVzKVxuXHQgKiBzbyBjb25zdW1lcnMgbGlrZSB0aGUgSlNPTkMgc2V0dGluZ3MgZWRpdG9yIGNhbiByb3VuZC10cmlwIGFsbCB2YWx1ZXNcblx0ICogdGhyb3VnaCBhIHJlcGxhY2UgZGlzcGF0Y2guIE5vLW9wIGlmIHN0cnVjdHVyYWxseSBlcXVhbCB0byBhdm9pZCBzcHVyaW91c1xuXHQgKiBgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnYCBmaXJlcy5cblx0ICovXG5cdHByaXZhdGUgX3NlZWRSdW5uaW5nQ29uZmlnRnJvbVN0YXRlKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGVDb25maWcgPSBzdGF0ZS5jb25maWc7XG5cdFx0aWYgKCFzdGF0ZUNvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoT2JqZWN0LmtleXMoc3RhdGVDb25maWcuc2NoZW1hLnByb3BlcnRpZXMpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5nZXQoc2Vzc2lvbklkKTtcblx0XHRsZXQgc2VlZGVkOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdDtcblx0XHRpZiAoZXhpc3RpbmcgJiYgdGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSB7IC4uLmV4aXN0aW5nLnZhbHVlcyB9O1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZXhpc3Rpbmcuc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGlmIChPYmplY3QuaGFzT3duKHN0YXRlQ29uZmlnLnZhbHVlcywga2V5KSkge1xuXHRcdFx0XHRcdHZhbHVlc1trZXldID0gc3RhdGVDb25maWcudmFsdWVzW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHNlZWRlZCA9IHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IC4uLmV4aXN0aW5nLnNjaGVtYS5wcm9wZXJ0aWVzIH0gfSxcblx0XHRcdFx0dmFsdWVzLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VlZGVkID0ge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQuLi4oZXhpc3Rpbmc/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KSxcblx0XHRcdFx0XHRcdC4uLnN0YXRlQ29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczoge1xuXHRcdFx0XHRcdC4uLihleGlzdGluZz8udmFsdWVzID8/IHt9KSxcblx0XHRcdFx0XHQuLi5zdGF0ZUNvbmZpZy52YWx1ZXMsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoZXhpc3RpbmcgJiYgcmVzb2x2ZWRDb25maWdzRXF1YWwoZXhpc3RpbmcsIHNlZWRlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChzZXNzaW9uSWQsIHNlZWRlZCk7XG5cdFx0dGhpcy5fYXBwbHlXb3JrdHJlZUlzb2xhdGlvbihzZXNzaW9uSWQsIHNlZWRlZC52YWx1ZXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb25JZCk7XG5cdH1cblxuXHQvKiogTWlycm9ycyBhIHNlc3Npb24ncyBgaXNvbGF0aW9uYCBwaWNrIG9udG8gaXRzIGFkYXB0ZXIuIFNlZSB7QGxpbmsgSVNlc3Npb24ud29ya3RyZWVQZW5kaW5nfS4gKi9cblx0cHJpdmF0ZSBfYXBwbHlXb3JrdHJlZUlzb2xhdGlvbihzZXNzaW9uSWQ6IHN0cmluZywgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghaXNXb3JrdHJlZUlzb2xhdGlvbih2YWx1ZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgYWRhcHRlciA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0YWRhcHRlcj8uc2V0V29ya3RyZWVJc29sYXRpb24odHJ1ZSk7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIGNhY2hlIG1hbmFnZW1lbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogT3B0IGluIHRvIHBlcnNpc3Rpbmcge0BsaW5rIF9zZXNzaW9uQ2FjaGV9IHNuYXBzaG90cyB1bmRlciBgc3RvcmFnZUtleWAuXG5cdCAqIFN1YmNsYXNzZXMgY2FsbCB0aGlzIGF0IHRoZSAqKmVuZCoqIG9mIHRoZWlyIGNvbnN0cnVjdG9yIFx1MjAxNCBvbmNlIHRoZVxuXHQgKiBpZGVudGl0eSBmaWVsZHMgdGhhdCB7QGxpbmsgY3JlYXRlQWRhcHRlcn0ve0BsaW5rIHJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXJ9L1xuXHQgKiB7QGxpbmsgX2FkYXB0ZXJPcHRpb25zfSBkZXBlbmQgb24gYXJlIGluaXRpYWxpemVkIFx1MjAxNCBiZWNhdXNlIHRoZSBpbml0aWFsXG5cdCAqIGh5ZHJhdGlvbiBidWlsZHMgYWRhcHRlcnMuIFRoaXMgaXMgd2h5IHRoZSBiYXNlIGNhbm5vdCBhdXRvLWxvYWQgaW4gaXRzXG5cdCAqIG93biBjb25zdHJ1Y3Rvci4gUGVyc2lzdGVkIHN1bW1hcmllcyBhcmUgaHlkcmF0ZWQgaW50byB7QGxpbmsgX3Nlc3Npb25DYWNoZX1cblx0ICogaW1tZWRpYXRlbHkgc28ge0BsaW5rIGdldFNlc3Npb25zfSByZXR1cm5zIHRoZW0gYmVmb3JlIHRoZSBmaXJzdFxuXHQgKiBgbGlzdFNlc3Npb25zKClgIHJvdW5kLXRyaXAgcmVzb2x2ZXMuXG5cdCAqXG5cdCAqIGBsZWdhY3lTdG9yYWdlS2V5YCwgd2hlbiBnaXZlbiwgaXMgcmVtb3ZlZCBzbyBzdGFsZSBlbnRyaWVzIGFyZSBkaXNjYXJkZWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2VuYWJsZVNlc3Npb25DYWNoZVBlcnNpc3RlbmNlKHN0b3JhZ2VLZXk6IHN0cmluZywgbGVnYWN5U3RvcmFnZUtleT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChsZWdhY3lTdG9yYWdlS2V5KSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUobGVnYWN5U3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlU3RvcmFnZUtleSA9IHN0b3JhZ2VLZXk7XG5cdFx0dGhpcy5fbG9hZENhY2hlZFNlc3Npb25zKCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgX29uRGlkQ2hhbmdlU2Vzc2lvbnN9IGV2ZW50cyBzaG91bGQgdXBkYXRlIHRoZSBwZXJzaXN0ZW5jZVxuXHQgKiBib29ra2VlcGluZyAoe0BsaW5rIF9jYWNoZURpcnR5fSArIHtAbGluayBfbWV0YUJ5UmF3SWR9KS4gRGVmYXVsdCBgdHJ1ZWA7XG5cdCAqIHRoZSByZW1vdGUgcHJvdmlkZXIgb3ZlcnJpZGVzIHRoaXMgdG8gc3VzcGVuZCB0cmFja2luZyB3aGlsZSBpdHMgY2FjaGVkXG5cdCAqIHNlc3Npb25zIGFyZSB1bnB1Ymxpc2hlZCAob2ZmbGluZSksIHNvIHRoZSBvbi1kaXNrIHNuYXBzaG90IHN1cnZpdmVzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRUcmFja1Nlc3Npb25DYWNoZUNoYW5nZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogTG9hZCBwZXJzaXN0ZWQgc2Vzc2lvbiBzdW1tYXJpZXMgaW50byB7QGxpbmsgX3Nlc3Npb25DYWNoZX0uICovXG5cdHByaXZhdGUgX2xvYWRDYWNoZWRTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25DYWNoZVN0b3JhZ2VLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0KHRoaXMuX3Nlc3Npb25DYWNoZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBwYXJzZWQgYXMgcmVhZG9ubHkgSVNlcmlhbGl6ZWRTZXNzaW9uTWV0YWRhdGFbXSkge1xuXHRcdFx0Y29uc3QgZGVzZXJpYWxpemVkID0gZGVzZXJpYWxpemVNZXRhZGF0YShlbnRyeSk7XG5cdFx0XHRpZiAoIWRlc2VyaWFsaXplZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1ldGEgPSB0aGlzLl9hZG9wdFNlc3Npb25NZXRhKGRlc2VyaWFsaXplZCk7XG5cdFx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChtZXRhLnNlc3Npb24pO1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25DYWNoZS5oYXMocmF3SWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jcmVhdGVBZGFwdGVyKG1ldGEpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLnNldChyYXdJZCwgY2FjaGVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdCB0aGUgY3VycmVudCB7QGxpbmsgX3Nlc3Npb25DYWNoZX0gdG8gc3RvcmFnZSwgY2FwcGluZyBhdFxuXHQgKiB7QGxpbmsgQ0FDSEVEX1NFU1NJT05TX01BWF9QRVJfSE9TVH0gbW9zdC1yZWNlbnRseS1tb2RpZmllZCBlbnRyaWVzLlxuXHQgKiBNdXRhYmxlIGZpZWxkcyBhcmUgcmVhZCBmcm9tIGVhY2ggYWRhcHRlcidzIG9ic2VydmFibGVzIGFuZCBvdmVybGFpZCBvblxuXHQgKiB0b3Agb2YgdGhlIG9yaWdpbmFsIG1ldGFkYXRhIHNuYXBzaG90IGNhcHR1cmVkIGluIHtAbGluayBfbWV0YUJ5UmF3SWR9LlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVyc2lzdENhY2hlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkNhY2hlU3RvcmFnZUtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyaWVzOiBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbcmF3SWQsIGFkYXB0ZXJdIG9mIHRoaXMuX3Nlc3Npb25DYWNoZSkge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHRoaXMuX21ldGFCeVJhd0lkLmdldChyYXdJZCk7XG5cdFx0XHRpZiAoIWJhc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbnRyaWVzLnB1c2goc2VyaWFsaXplTWV0YWRhdGEoe1xuXHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRzdW1tYXJ5OiBhZGFwdGVyLnRpdGxlLmdldCgpIHx8IGJhc2Uuc3VtbWFyeSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lOiBhZGFwdGVyLnVwZGF0ZWRBdC5nZXQoKS5nZXRUaW1lKCksXG5cdFx0XHRcdC8vIEEgcHJvamVjdCBhc3NpZ25lZCBieSBgYmFja2ZpbGxQcm9qZWN0YCBsaXZlcyBvbmx5IG9uIHRoZSBhZGFwdGVyLlxuXHRcdFx0XHRwcm9qZWN0OiBhZGFwdGVyLnByb2plY3QgPz8gYmFzZS5wcm9qZWN0LFxuXHRcdFx0XHRzdGF0dXM6IHdpdGhTZXNzaW9uU3RhdHVzRmxhZyhcblx0XHRcdFx0XHR3aXRoU2Vzc2lvblN0YXR1c0ZsYWcoYmFzZS5zdGF0dXMgPz8gUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc1JlYWQsIGFkYXB0ZXIuaXNSZWFkLmdldCgpKSxcblx0XHRcdFx0XHRQcm90b2NvbFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCxcblx0XHRcdFx0XHRhZGFwdGVyLmlzQXJjaGl2ZWQuZ2V0KCkpLFxuXHRcdFx0XHQvLyBUaGUgYWRhcHRlcidzIGxpdmUga2luZCB3aW5zIG92ZXIgdGhlIHNuYXBzaG90OiBzZXZlcmFsIG1ldGFkYXRhXG5cdFx0XHRcdC8vIHNvdXJjZXMgb21pdCBgX21ldGFgLCBhbmQgcGVyc2lzdGluZyBhIHN0YWxlIG9uZSB3b3VsZCByZXN1cnJlY3Rcblx0XHRcdFx0Ly8gdGhlIHNlc3Npb24gYXMgYSB3b3Jrc3BhY2Ugcm9vdGVkIGF0IHRoZSBob3N0J3Mgc2NyYXRjaCBjd2QuXG5cdFx0XHRcdC4uLihhZGFwdGVyLmlzUXVpY2tDaGF0LmdldCgpID8geyBfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKGJhc2UuX21ldGEsIHRydWUpIH0gOiB7fSksXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHRoaXMuX3Nlc3Npb25DYWNoZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJpZXMuc29ydCgoYSwgYikgPT4gYi5tb2RpZmllZFRpbWUgLSBhLm1vZGlmaWVkVGltZSk7XG5cdFx0Y29uc3QgbGltaXRlZCA9IGVudHJpZXMuc2xpY2UoMCwgQ0FDSEVEX1NFU1NJT05TX01BWF9QRVJfSE9TVCk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5fc2Vzc2lvbkNhY2hlU3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkobGltaXRlZCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZW5zdXJlU2Vzc2lvbkNhY2hlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jYWNoZUluaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGBfcmVmcmVzaFNlc3Npb25zYCBvd25zIGBfY2FjaGVJbml0aWFsaXplZGAgXHUyMDE0IGl0IGZsaXBzIGl0IHRvIGB0cnVlYFxuXHRcdC8vIG9ubHkgb25jZSBgbGlzdFNlc3Npb25zKClgIGFjdHVhbGx5IHJldHVybnMuIEEgY2FsbCB0aGF0IHJhY2VzXG5cdFx0Ly8gYmVmb3JlIHRoZSBjb25uZWN0aW9uL2F1dGggaXMgcmVhZHkgd2lsbCBmYWlsIGFuZCBhcm0gYSByZXRyeVxuXHRcdC8vIHJhdGhlciB0aGFuIHBlcm1hbmVudGx5IHBpbm5pbmcgYW4gZW1wdHkgY2FjaGUuIERvbid0IGxhdW5jaCBhIG5ld1xuXHRcdC8vIHJlZnJlc2ggd2hpbGUgb25lIGlzIGFscmVhZHkgaW4gZmxpZ2h0IG9yIGEgYmFja29mZiByZXRyeSBpcyBhbHJlYWR5XG5cdFx0Ly8gc2NoZWR1bGVkIFx1MjAxNCBvdGhlcndpc2UgZXZlcnkgc3luY2hyb25vdXMgYGdldFNlc3Npb25zKClgIGR1cmluZyB0aGVcblx0XHQvLyBmYWlsdXJlIHdpbmRvdyB3b3VsZCBoYW1tZXIgdGhlIGFnZW50L2F1dGggcGF0aCBhbmQgYnlwYXNzIHRoZVxuXHRcdC8vIGJhY2tvZmYuXG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25SZWZyZXNoSW5GbGlnaHQgfHwgdGhpcy5fc2Vzc2lvblJlZnJlc2hSZXRyeS52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVmcmVzaFNlc3Npb25zKGFubm91bmNlRXhpc3RpbmdBc0FkZGVkID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgcmV0cnk7IHRoaXMgYXR0ZW1wdCBzdXBlcnNlZGVzIGl0LlxuXHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoUmV0cnkuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9uUmVmcmVzaEluRmxpZ2h0ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBjb25uZWN0aW9uLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Ly8gQSBzdWNjZXNzZnVsIHJldHVybiAoZXZlbiBhbiBlbXB0eSBsaXN0KSBtZWFucyB0aGUgY2FjaGUgaXNcblx0XHRcdC8vIGF1dGhvcml0YXRpdmUuIE1hcmsgaXQgaW5pdGlhbGl6ZWQgYW5kIHJlc2V0IHRoZSBiYWNrb2ZmLlxuXHRcdFx0dGhpcy5fY2FjaGVJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVmcmVzaFJldHJ5RGVsYXkgPSBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5TRVNTSU9OX1JFRlJFU0hfUkVUUllfTUlOX01TO1xuXHRcdFx0Y29uc3QgY3VycmVudEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IGxpc3RlZEFnZW50UHJvdmlkZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCBhZGRlZDogSVNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgY2hhbmdlZDogSVNlc3Npb25bXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJhd01ldGEgb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgbWV0YSA9IHRoaXMuX2Fkb3B0U2Vzc2lvbk1ldGEocmF3TWV0YSk7XG5cdFx0XHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKG1ldGEuc2Vzc2lvbik7XG5cdFx0XHRcdGN1cnJlbnRLZXlzLmFkZChyYXdJZCk7XG5cdFx0XHRcdGNvbnN0IGFnZW50UHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIobWV0YS5zZXNzaW9uKTtcblx0XHRcdFx0aWYgKGFnZW50UHJvdmlkZXIpIHtcblx0XHRcdFx0XHRsaXN0ZWRBZ2VudFByb3ZpZGVycy5hZGQoYWdlbnRQcm92aWRlcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRpZiAoYW5ub3VuY2VFeGlzdGluZ0FzQWRkZWQpIHtcblx0XHRcdFx0XHRcdGFkZGVkLnB1c2goZXhpc3RpbmcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy51cGRhdGVBZGFwdGVyKGV4aXN0aW5nLCBtZXRhKSkge1xuXHRcdFx0XHRcdFx0Y2hhbmdlZC5wdXNoKGV4aXN0aW5nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jcmVhdGVBZGFwdGVyKG1ldGEpO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5zZXQocmF3SWQsIGNhY2hlZCk7XG5cdFx0XHRcdFx0YWRkZWQucHVzaChjYWNoZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbW92ZWQ6IElTZXNzaW9uW10gPSBbXTtcblx0XHRcdC8vIFNvbWUgaG9zdHMgYnJpZWZseSBvbWl0IHRoZSBqdXN0LXNlbnQgZWFnZXIgc2Vzc2lvbiBmcm9tIGxpc3RTZXNzaW9ucy5cblx0XHRcdC8vIEtlZXAgdGhlIHBlbmRpbmcgc2Vzc2lvbiB2aXNpYmxlIHVudGlsIHNlbmRSZXF1ZXN0IGdyYWR1YXRlcyBpdC5cblx0XHRcdGNvbnN0IHBlbmRpbmdSYXdJZCA9IHRoaXMuX3BlbmRpbmdTZXNzaW9uPy5yZXNvdXJjZS5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cdFx0XHQvLyBUaGUgaG9zdCBhZ2dyZWdhdGVzIG9uZSBsaXN0aW5nIGFjcm9zcyBhbGwgb2YgaXRzIGFnZW50cywgYW5kIGFuXG5cdFx0XHQvLyBhZ2VudCB0aGF0IGNhbm5vdCBlbnVtZXJhdGUgeWV0IChpdHMgU0RLIGlzIG5vdCBkb3dubG9hZGVkKSBjYW5cblx0XHRcdC8vIGNvbnRyaWJ1dGUgYW4gZW1wdHkgbGlzdCByYXRoZXIgdGhhbiBmYWlsaW5nLiBXaGVuIG90aGVyIGFnZW50c1xuXHRcdFx0Ly8gZGlkIGFuc3dlciwgYSBuYW1lc3BhY2Ugd2l0aCBubyByb3cgYXQgYWxsIGlzIHRoZXJlZm9yZSAqdW5rbm93bipcblx0XHRcdC8vIHJhdGhlciB0aGFuIGVtcHR5LCBhbmQgZXZpY3RpbmcgaXQgd291bGQgYmUgYSBzaWxlbnQgZGF0YSBsb3NzIFx1MjAxNFxuXHRcdFx0Ly8gYHJlbW92ZWRgIGRpc2NhcmRzIHRoZSB1c2VyJ3MgcGlucyBhbmQgZ3JvdXAgbWVtYmVyc2hpcC4gQSB3aG9sbHlcblx0XHRcdC8vIGVtcHR5IGxpc3Rpbmcga2VlcHMgdGhlIGF1dGhvcml0YXRpdmUtZW1wdHkgY29udHJhY3QsIHNpbmNlIGFuXG5cdFx0XHQvLyBhZ2VudCB0aGF0IGNhbm5vdCBhbnN3ZXIgYXQgYWxsIHJlamVjdHMgKGFuZCB3ZSBuZXZlciBnZXQgaGVyZSkuXG5cdFx0XHQvLyBSZWFsIGRlbGV0aW9ucyBzdGlsbCBhcnJpdmUgdGhyb3VnaCBgZGVsZXRlU2Vzc2lvbnNgIGFuZCB0aGVcblx0XHRcdC8vIGBzZXNzaW9uUmVtb3ZlZGAgbm90aWZpY2F0aW9uLlxuXHRcdFx0Y29uc3QgZXZpY3RVbmxpc3RlZEFnZW50cyA9IGxpc3RlZEFnZW50UHJvdmlkZXJzLnNpemUgPT09IDA7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGNhY2hlZF0gb2YgdGhpcy5fc2Vzc2lvbkNhY2hlKSB7XG5cdFx0XHRcdGlmICghY3VycmVudEtleXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRpZiAoa2V5ID09PSBwZW5kaW5nUmF3SWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWV2aWN0VW5saXN0ZWRBZ2VudHMgJiYgIWxpc3RlZEFnZW50UHJvdmlkZXJzLmhhcyhjYWNoZWQuYWdlbnRQcm92aWRlcikpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLmRlbGV0ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRcdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ1Jlc29sdmVTZXEuZGVsZXRlKGNhY2hlZC5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdHJlbW92ZWQucHVzaChjYWNoZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhZGRlZC5sZW5ndGggPiAwIHx8IHJlbW92ZWQubGVuZ3RoID4gMCB8fCBjaGFuZ2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQsIHJlbW92ZWQsIGNoYW5nZWQgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jQWN0aXZlQ2xpZW50KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNhY2hlZCBvZiByZW1vdmVkKSB7XG5cdFx0XHRcdChjYWNoZWQgYXMgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIpLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSBjb25uZWN0aW9uIC8gYWdlbnQgbWF5IG5vdCBiZSByZWFkeSB5ZXQgXHUyMDE0IGUuZy4gdGhlIGFnZW50XG5cdFx0XHQvLyB0aHJvd3MgYEFIUF9BVVRIX1JFUVVJUkVEYCB1bnRpbCBpdHMgdG9rZW4gaXMgZWZmZWN0aXZlXG5cdFx0XHQvLyBzZXJ2ZXItc2lkZSwgb3IgdGhlcmUncyBhIHRyYW5zaWVudCBvZmZsaW5lL25ldHdvcmsgZXJyb3IuIFdlXG5cdFx0XHQvLyBtdXN0IE5PVCBtYXJrIHRoZSBjYWNoZSBpbml0aWFsaXplZCAodGhhdCB3b3VsZCBjb25mbGF0ZSBhXG5cdFx0XHQvLyBmYWlsdXJlIHdpdGggYSBnZW51aW5lbHktZW1wdHkgc3VjY2VzcyBhbmQgbmV2ZXIgcmVjb3ZlciksIGFuZFxuXHRcdFx0Ly8gd2UgZGVsaWJlcmF0ZWx5IGRvIE5PVCBwb3AgYSBzaWduLWluIGRpYWxvZyBqdXN0IHRvIHJlbmRlciB0aGVcblx0XHRcdC8vIGxpc3QuIEluc3RlYWQsIHJldHJ5IHNpbGVudGx5IGluIHRoZSBiYWNrZ3JvdW5kIHdpdGggYmFja29mZi5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyXSBsaXN0U2Vzc2lvbnMgZmFpbGVkOyBzY2hlZHVsaW5nIHJldHJ5OiAke2Vycn1gKTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlU2Vzc2lvblJlZnJlc2hSZXRyeShhbm5vdW5jZUV4aXN0aW5nQXNBZGRlZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXJtIGEgYmFja29mZiByZXRyeSBvZiB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uc30uIFVzZWQgYWZ0ZXIgYSBmYWlsZWRcblx0ICogcmVmcmVzaCBzbyBhIHRyYW5zaWVudCBzdGFydHVwIGZhaWx1cmUgc2VsZi1oZWFscyB3aXRob3V0IHJlcXVpcmluZyBhblxuXHQgKiB1bnJlbGF0ZWQgQUhQIGV2ZW50IChhIHR1cm4gY29tcGxldGluZywgYSBzZXNzaW9uIGJlaW5nIGFkZGVkKSB0byBmb3JjZVxuXHQgKiBhIHJlLWZldGNoLiBDYW5jZWxsZWQgb24gdGhlIG5leHQgc3VjY2Vzc2Z1bCByZWZyZXNoLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVTZXNzaW9uUmVmcmVzaFJldHJ5KGFubm91bmNlRXhpc3RpbmdBc0FkZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVsYXkgPSB0aGlzLl9zZXNzaW9uUmVmcmVzaFJldHJ5RGVsYXk7XG5cdFx0dGhpcy5fc2Vzc2lvblJlZnJlc2hSZXRyeURlbGF5ID0gTWF0aC5taW4oZGVsYXkgKiAyLCBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5TRVNTSU9OX1JFRlJFU0hfUkVUUllfTUFYX01TKTtcblx0XHR0aGlzLl9zZXNzaW9uUmVmcmVzaFJldHJ5LnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25zKGFubm91bmNlRXhpc3RpbmdBc0FkZGVkKTtcblx0XHR9LCBkZWxheSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VsIGFueSBwZW5kaW5nIHNlc3Npb24tcmVmcmVzaCByZXRyeSBhbmQgcmVzZXQgdGhlIGJhY2tvZmYuIENhbGxlZFxuXHQgKiBieSBzdWJjbGFzc2VzIHdoZW4gdGhlIGNvbm5lY3Rpb24gZ29lcyBhd2F5ICh0aGUgc3RhbGUgdGltZXIgd291bGRcblx0ICogb3RoZXJ3aXNlIGZpcmUgYWdhaW5zdCBhIGRlYWQgY29ubmVjdGlvbiBhbmQgbm8tb3ApLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9jYW5jZWxTZXNzaW9uUmVmcmVzaFJldHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoUmV0cnkuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9uUmVmcmVzaFJldHJ5RGVsYXkgPSBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5TRVNTSU9OX1JFRlJFU0hfUkVUUllfTUlOX01TO1xuXHR9XG5cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgZnJlc2hseS1jb21taXR0ZWQgYmFja2VuZCBzZXNzaW9uIGZvciBhbiBpbi1mbGlnaHQgc2VuZC5cblx0ICpcblx0ICogVGhlIGxvY2FsIGFnZW50IGhvc3QgcnVucyBhIHNpbmdsZSBwcm92aWRlciB3aG9zZSBzZXNzaW9uIGNhY2hlIGhvbGRzXG5cdCAqICoqZXZlcnkqKiBhZ2VudC1ob3N0IHNlc3Npb24gdHlwZSAoY29kZXgsIGNsYXVkZSwgY29waWxvdCwgXHUyMDI2KS4gQSBzZW5kXG5cdCAqIHRoZXJlZm9yZSBoYXMgdG8gaWRlbnRpZnkgKml0cyBvd24qIG5ldyBzZXNzaW9uIGJ5IGJvdGggbm92ZWx0eSAoYSByYXcgaWRcblx0ICogbm90IHByZXNlbnQgYmVmb3JlIHRoZSBzZW5kKSAqKmFuZCoqIHR5cGU6IGBleHBlY3RlZFNjaGVtZWAgaXMgdGhlXG5cdCAqIGBjaGF0UmVzb3VyY2VgIHNjaGVtZSAoZS5nLiBgYWdlbnQtaG9zdC1jb2RleGApLCBzbyBhIHNlc3Npb24gb2YgYW5vdGhlclxuXHQgKiB0eXBlIHRoYXQgaGFwcGVucyB0byBhcHBlYXIgbWlkLXNlbmQgXHUyMDE0IGEgc2xvdyBjb2RleCBzZW5kIHJhY2luZyBhZ2FpbnN0IGFcblx0ICogcmVzdG9yZWQgY2xhdWRlIHNlc3Npb24sIHNheSBcdTIwMTQgaXMgbmV2ZXIgbWlzdGFrZW4gZm9yIHRoaXMgc2VuZCdzIGNvbW1pdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JOZXdTZXNzaW9uKGV4aXN0aW5nS2V5czogU2V0PHN0cmluZz4sIGV4cGVjdGVkU2NoZW1lOiBzdHJpbmcsIG93blJhd0lkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBBIGNhbmRpZGF0ZSBiYWNrZW5kIHNlc3Npb24gY29tbWl0cyBUSElTIHNlbmQgd2hlbiBpdCBpcyB1bmNsYWltZWQsXG5cdFx0Ly8gb2YgdGhlIGV4cGVjdGVkIHR5cGUsIGFuZCBlaXRoZXIgKGEpIGNhcnJpZXMgdGhpcyBzZW5kJ3Mgb3duIGlkIFx1MjAxNCB0aGVcblx0XHQvLyBlYWdlci9jb21taXR0ZWQgaWQgaXMgcHJlc2VydmVkLCBzbyB0aGlzIGlzIHRoZSBleGFjdCBtYXRjaCBcdTIwMTQgb3Jcblx0XHQvLyAoYikgaXMgYSBub3ZlbCBzZXNzaW9uIHRoYXQgaXMgbm90IGFub3RoZXIgaW4tZmxpZ2h0IHNlbmQncyBvd25cblx0XHQvLyBzZXNzaW9uICh0aGUgbm92ZWx0eSBmYWxsYmFjayBjb3ZlcnMgYmFja2VuZHMgdGhhdCBhc3NpZ24gYSBmcmVzaFxuXHRcdC8vIGlkLCB3aXRob3V0IGxldHRpbmcgdHdvIGNvbmN1cnJlbnQgc2FtZS1zY2hlbWUgc2VuZHMgc3dhcCBzZXNzaW9ucykuXG5cdFx0Y29uc3QgbWF0Y2hlcyA9IChyYXdJZDogc3RyaW5nLCBzY2hlbWU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0aWYgKHNjaGVtZSAhPT0gZXhwZWN0ZWRTY2hlbWUgfHwgdGhpcy5fY29tbWl0dGluZ1Nlc3Npb25SYXdJZHMuaGFzKHJhd0lkKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmF3SWQgPT09IG93blJhd0lkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICFleGlzdGluZ0tleXMuaGFzKHJhd0lkKSAmJiAhdGhpcy5faW5GbGlnaHROZXdTZXNzaW9uT3duSWRzLmhhcyhyYXdJZCk7XG5cdFx0fTtcblxuXHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hTZXNzaW9ucygpO1xuXHRcdC8vIFByZWZlciB0aGlzIHNlbmQncyBvd24gaWQ7IGZhbGwgYmFjayB0byBhbnkgYWNjZXB0YWJsZSBub3ZlbCBzZXNzaW9uLlxuXHRcdGNvbnN0IHNjYW4gPSAoKTogSVNlc3Npb24gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0bGV0IGZhbGxiYWNrOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3QgY2FjaGVkIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0XHRjb25zdCByYXdJZCA9IGNhY2hlZC5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdFx0aWYgKCFtYXRjaGVzKHJhd0lkLCBjYWNoZWQucmVzb3VyY2Uuc2NoZW1lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyYXdJZCA9PT0gb3duUmF3SWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZhbGxiYWNrID8/PSBjYWNoZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdFx0fTtcblx0XHRjb25zdCBpbW1lZGlhdGUgPSBzY2FuKCk7XG5cdFx0aWYgKGltbWVkaWF0ZSkge1xuXHRcdFx0dGhpcy5fY29tbWl0dGluZ1Nlc3Npb25SYXdJZHMuYWRkKGltbWVkaWF0ZS5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKSk7XG5cdFx0XHRyZXR1cm4gaW1tZWRpYXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhaXREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblByb21pc2UgPSBuZXcgUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdFx0d2FpdERpc3Bvc2FibGVzLmFkZCh0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRcdC8vIFByZWZlciB0aGlzIHNlbmQncyBvd24gaWQgd2l0aGluIHRoZSBiYXRjaCBiZWZvcmUgZmFsbGluZ1xuXHRcdFx0XHRcdC8vIGJhY2sgdG8gYW4gYWNjZXB0YWJsZSBub3ZlbCBzZXNzaW9uLlxuXHRcdFx0XHRcdGNvbnN0IGV4YWN0ID0gZS5hZGRlZC5maW5kKHMgPT4gcy5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKSA9PT0gb3duUmF3SWQgJiYgbWF0Y2hlcyhvd25SYXdJZCwgcy5yZXNvdXJjZS5zY2hlbWUpKTtcblx0XHRcdFx0XHRjb25zdCBuZXdTZXNzaW9uID0gZXhhY3QgPz8gZS5hZGRlZC5maW5kKHMgPT4gbWF0Y2hlcyhzLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpLCBzLnJlc291cmNlLnNjaGVtZSkpO1xuXHRcdFx0XHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb21taXR0aW5nU2Vzc2lvblJhd0lkcy5hZGQobmV3U2Vzc2lvbi5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKSk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKG5ld1Nlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR3YWl0RGlzcG9zYWJsZXMuYWRkKHRoaXMub25Db25uZWN0aW9uTG9zdCgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihzZXNzaW9uUHJvbWlzZSwgdG9rZW4pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR3YWl0RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIEFIUCBub3RpZmljYXRpb24gLyBhY3Rpb24gaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBXaXJlIEFIUCBub3RpZmljYXRpb24gYW5kIGFjdGlvbiBsaXN0ZW5lcnMgb24gdGhlIGdpdmVuIGNvbm5lY3Rpb24uXG5cdCAqIFN1YmNsYXNzZXMgY2FsbCB0aGlzIGZyb20gdGhlaXIgY29uc3RydWN0b3IgKGxvY2FsKSBvciBgc2V0Q29ubmVjdGlvbmBcblx0ICogKHJlbW90ZSksIHBhc3NpbmcgYSBzdG9yZSB0aGF0IGJvdW5kcyB0aGUgbGlzdGVuZXJzJyBsaWZldGltZS5cblx0ICovXG5cdHByb3RlY3RlZCBfYXR0YWNoQ29ubmVjdGlvbkxpc3RlbmVycyhjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24ub25EaWROb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAobi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25BZGRlZCkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVTZXNzaW9uQWRkZWQobi5zdW1tYXJ5KTtcblx0XHRcdH0gZWxzZSBpZiAobi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVNlc3Npb25SZW1vdmVkKG4uc2Vzc2lvbik7XG5cdFx0XHR9IGVsc2UgaWYgKG4udHlwZSA9PT0gTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uU3VtbWFyeUNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKG4uc2Vzc2lvbiwgbi5jaGFuZ2VzKTtcblx0XHRcdH0gZWxzZSBpZiAobi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlByb2dyZXNzKSB7XG5cdFx0XHRcdHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3MuaGFuZGxlUHJvZ3Jlc3Mobik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24ub25EaWRBY3Rpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlICYmIGlzQ2hhdEFjdGlvbihlLmFjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25zKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCAmJiBpc1Nlc3Npb25BY3Rpb24oZS5hY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVRpdGxlQ2hhbmdlZChlLmNoYW5uZWwsIGUuYWN0aW9uLnRpdGxlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQgJiYgaXNTZXNzaW9uQWN0aW9uKGUuYWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVJc0FyY2hpdmVkQ2hhbmdlZChlLmNoYW5uZWwsIGUuYWN0aW9uLmlzQXJjaGl2ZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkICYmIGlzU2Vzc2lvbkFjdGlvbihlLmFjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlSXNSZWFkQ2hhbmdlZChlLmNoYW5uZWwsIGUuYWN0aW9uLmlzUmVhZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgJiYgaXNTZXNzaW9uQWN0aW9uKGUuYWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVDb25maWdDaGFuZ2VkKGUuY2hhbm5lbCwgZS5hY3Rpb24uY29uZmlnLCBlLmFjdGlvbi5yZXBsYWNlID09PSB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ2hhbmdlc2V0c0NoYW5nZWQgJiYgaXNTZXNzaW9uQWN0aW9uKGUuYWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVDaGFuZ2VzZXRzQ2hhbmdlZChlLmNoYW5uZWwsIGUuYWN0aW9uLmNoYW5nZXNldHMpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZCAmJiBpc1Nlc3Npb25BY3Rpb24oZS5hY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVNlc3Npb25NZXRhQ2hhbmdlZChlLmNoYW5uZWwsIGUuYWN0aW9uLl9tZXRhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTZXNzaW9uQWRkZWQoc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpOiB2b2lkIHtcblx0XHRjb25zdCB3b3JraW5nRGlycyA9IHN1bW1hcnkud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiB0aGlzLm1hcFdvcmtpbmdEaXJlY3RvcnlVcmkoVVJJLnBhcnNlKGQpKSk7XG5cdFx0Y29uc3QgcmF3TWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhID0ge1xuXHRcdFx0c2Vzc2lvbjogVVJJLnBhcnNlKHN1bW1hcnkucmVzb3VyY2UpLFxuXHRcdFx0c3RhcnRUaW1lOiBEYXRlLnBhcnNlKHN1bW1hcnkuY3JlYXRlZEF0KSxcblx0XHRcdG1vZGlmaWVkVGltZTogRGF0ZS5wYXJzZShzdW1tYXJ5Lm1vZGlmaWVkQXQpLFxuXHRcdFx0c3VtbWFyeTogc3VtbWFyeS50aXRsZSxcblx0XHRcdGFjdGl2aXR5OiBzdW1tYXJ5LmFjdGl2aXR5LFxuXHRcdFx0c3RhdHVzOiBzdW1tYXJ5LnN0YXR1cyxcblx0XHRcdC4uLihzdW1tYXJ5LnByb2plY3QgPyB7XG5cdFx0XHRcdHByb2plY3Q6IHtcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogc3VtbWFyeS5wcm9qZWN0LmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdHVyaTogdGhpcy5tYXBQcm9qZWN0VXJpKFVSSS5wYXJzZShzdW1tYXJ5LnByb2plY3QudXJpKSlcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHt9KSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcnMsXG5cdFx0XHRjaGFuZ2VzOiBzdW1tYXJ5LmNoYW5nZXMsXG5cdFx0XHQvLyBDYXJyeSBgX21ldGFgIHNvIGEgbmV3IGFkYXB0ZXIgc2VlZHMgaXRzIHNlc3Npb24ta2luZCBmcm9tIGl0IGFuZCBhblxuXHRcdFx0Ly8gZXhpc3Rpbmcgb25lIGNhbiBiZSBwcm9tb3RlZCBieSBpdC5cblx0XHRcdC4uLihzdW1tYXJ5Ll9tZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhOiBzdW1tYXJ5Ll9tZXRhIH0gOiB7fSksXG5cdFx0fTtcblxuXHRcdC8vIEFkb3B0IGJlZm9yZSBkZXJpdmluZyB0aGUgY2FjaGUga2V5IHNvIGEgaG9zdCB0aGF0IGFkZHJlc3NlcyBzZXNzaW9ucyB1bmRlciBhIGRpZmZlcmVudFxuXHRcdC8vIHNjaGVtZSByb3V0ZXMgdG8gdGhlIGFnZW50IHByb3ZpZGVyLCBhcyB0aGUgcmVmcmVzaCBhbmQgcGVyc2lzdGVuY2UgcGF0aHMgZG8uXG5cdFx0Y29uc3QgbWV0YSA9IHRoaXMuX2Fkb3B0U2Vzc2lvbk1ldGEocmF3TWV0YSk7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQobWV0YS5zZXNzaW9uKTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRpZiAodGhpcy51cGRhdGVBZGFwdGVyKGV4aXN0aW5nLCBtZXRhKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbZXhpc3RpbmddIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3luY0FjdGl2ZUNsaWVudCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuY3JlYXRlQWRhcHRlcihtZXRhKTtcblx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuc2V0KHJhd0lkLCBjYWNoZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbY2FjaGVkXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdHRoaXMuX3N5bmNBY3RpdmVDbGllbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNlc3Npb25SZW1vdmVkKHNlc3Npb246IFVSSSB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3JlbW92ZUNhY2hlZFNlc3Npb24ocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW2NhY2hlZF0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0Y2FjaGVkLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc3luY0FjdGl2ZUNsaWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlQ2FjaGVkU2Vzc2lvbihyYXdJZDogc3RyaW5nLCBleHBlY3RlZD86IEFnZW50SG9zdFNlc3Npb25BZGFwdGVyKTogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChleHBlY3RlZCAmJiBjYWNoZWQgJiYgY2FjaGVkICE9PSBleHBlY3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fbWV0YUJ5UmF3SWQuZGVsZXRlKHJhd0lkKTtcblx0XHRjb25zdCBzdGF0ZU93bmVyID0gY2FjaGVkID8/IGV4cGVjdGVkO1xuXHRcdGlmICghc3RhdGVPd25lcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShyYXdJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5kZWxldGUoc3RhdGVPd25lci5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlnUmVzb2x2ZVNlcS5kZWxldGUoc3RhdGVPd25lci5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzdGF0ZU93bmVyLnNlc3Npb25JZCk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5kZWxldGVBbmREaXNwb3NlKHN0YXRlT3duZXIuc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5kZWxldGUoc3RhdGVPd25lci5zZXNzaW9uSWQpO1xuXHRcdHJldHVybiBjYWNoZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVUaXRsZUNoYW5nZWQoc2Vzc2lvbjogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0Y2FjaGVkLnRpdGxlLnNldCh0aXRsZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUlzQXJjaGl2ZWRDaGFuZ2VkKHNlc3Npb246IHN0cmluZywgaXNBcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdGNhY2hlZC5pc0FyY2hpdmVkLnNldChpc0FyY2hpdmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSXNSZWFkQ2hhbmdlZChzZXNzaW9uOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQgJiYgY2FjaGVkLmlzUmVhZC5nZXQoKSAhPT0gaXNSZWFkKSB7XG5cdFx0XHRjYWNoZWQuaXNSZWFkLnNldChpc1JlYWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbY2FjaGVkXSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoc2Vzc2lvbjogc3RyaW5nLCBjaGFuZ2VzOiBQYXJ0aWFsPFNlc3Npb25TdW1tYXJ5Pik6IHZvaWQge1xuXHRcdC8vIFNldCB3aGVuIGEgZGVsdGEgY2xlYXJzIHRoZSBhZG9wdGFibGUtbGVnYWN5IG1hcmtlciBzbyB3ZSBjYW4gcmVvcGVuIHRoZVxuXHRcdC8vIHBhc3NpdmUgc3RhdGUgc3Vic2NyaXB0aW9uIGFmdGVyIHRoZSB0cmFuc2FjdGlvbiBjb21taXRzICh0aGUgb2JzZXJ2YWJsZVxuXHRcdC8vIHVwZGF0ZXMgaW4gYF9lbnN1cmVTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25gIG11c3Qgbm90IHJ1biBuZXN0ZWQgaW4gYHR4YCkuXG5cdFx0bGV0IHJlb3BlblN0YXRlU3Vic2NyaXB0aW9uRm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0XHRcdGlmIChjaGFuZ2VzLnN0YXR1cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHVpU3RhdHVzID0gbWFwUHJvdG9jb2xTdGF0dXMoY2hhbmdlcy5zdGF0dXMpO1xuXHRcdFx0XHRpZiAodWlTdGF0dXMgIT09IGNhY2hlZC5zdGF0dXMuZ2V0KCkpIHtcblx0XHRcdFx0XHRjYWNoZWQuc3RhdHVzLnNldCh1aVN0YXR1cywgdHgpO1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc0FyY2hpdmVkID0gISEoY2hhbmdlcy5zdGF0dXMgJiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCk7XG5cdFx0XHRcdGlmIChpc0FyY2hpdmVkICE9PSBjYWNoZWQuaXNBcmNoaXZlZC5nZXQoKSkge1xuXHRcdFx0XHRcdGNhY2hlZC5pc0FyY2hpdmVkLnNldChpc0FyY2hpdmVkLCB0eCk7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlzUmVhZCA9ICEhKGNoYW5nZXMuc3RhdHVzICYgUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklzUmVhZCk7XG5cdFx0XHRcdGlmIChpc1JlYWQgIT09IGNhY2hlZC5pc1JlYWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRjYWNoZWQuaXNSZWFkLnNldChpc1JlYWQsIHR4KTtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzLnRpdGxlICE9PSB1bmRlZmluZWQgJiYgY2hhbmdlcy50aXRsZSAhPT0gY2FjaGVkLnRpdGxlLmdldCgpKSB7XG5cdFx0XHRcdGNhY2hlZC50aXRsZS5zZXQoY2hhbmdlcy50aXRsZSwgdHgpO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBgY2hhbmdlcy5jaGFuZ2VzYCBjYXJyaWVzIHRoZSBjaGlwIGFnZ3JlZ2F0ZS4gVGhlIGNhdGFsb2d1ZVxuXHRcdFx0Ly8gaXRzZWxmIChsYWJlbCAvIFVSSSB0ZW1wbGF0ZSAvIGBjaGFuZ2VLaW5kYCkgYXJyaXZlcyB2aWEgdGhlXG5cdFx0XHQvLyBgU2Vzc2lvbkNoYW5nZXNldHNDaGFuZ2VkYCBhY3Rpb24sIGhhbmRsZWQgYnlcblx0XHRcdC8vIGBfaGFuZGxlQ2hhbmdlc2V0c0NoYW5nZWRgLlxuXHRcdFx0aWYgKGNoYW5nZXMuY2hhbmdlcyAhPT0gdW5kZWZpbmVkICYmIGNhY2hlZC5zZXRDaGFuZ2VzU3VtbWFyeShjaGFuZ2VzLmNoYW5nZXMsIHR4KSkge1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGNoYW5nZXMsICdhY3Rpdml0eScpICYmIGNhY2hlZC5zZXRBY3Rpdml0eShjaGFuZ2VzLmFjdGl2aXR5LCB0eCkpIHtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjaGFuZ2VzLCAnX21ldGEnKSkge1xuXHRcdFx0XHQvLyBLZWVwIHRoZSBndWFyZCBtYXAgaW4gc3luYyAobWlycm9ycyBgdXBkYXRlQWRhcHRlcmApIHNvIGEgY2xlYXJlZFxuXHRcdFx0XHQvLyBhZG9wdGFibGUtbGVnYWN5IG1hcmtlciByZW9wZW5zIHRoZSBwYXNzaXZlIHNlc3Npb24tc3RhdGVcblx0XHRcdFx0Ly8gc3Vic2NyaXB0aW9uIGluIGBfZW5zdXJlU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uYC4gVXNlIGBoYXNPd25Qcm9wZXJ0eWBcblx0XHRcdFx0Ly8gKGxpa2UgYGFjdGl2aXR5YCBhYm92ZSkgc28gYW4gZXhwbGljaXQgY2xlYXIgdG8gYHVuZGVmaW5lZGAgYXBwbGllcy5cblx0XHRcdFx0Y29uc3Qgc3RvcmVkTWV0YSA9IHRoaXMuX21ldGFCeVJhd0lkLmdldChyYXdJZCk7XG5cdFx0XHRcdGNvbnN0IHdhc0Fkb3B0YWJsZSA9IHJlYWRTZXNzaW9uRWhjbGlBZG9wdGFibGUoc3RvcmVkTWV0YT8uX21ldGEpO1xuXHRcdFx0XHRpZiAoc3RvcmVkTWV0YSkge1xuXHRcdFx0XHRcdHRoaXMuX21ldGFCeVJhd0lkLnNldChyYXdJZCwgeyAuLi5zdG9yZWRNZXRhLCBfbWV0YTogY2hhbmdlcy5fbWV0YSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2FjaGVkLnNldE1ldGEoY2hhbmdlcy5fbWV0YSwgdHgpKSB7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIGNsZWFyZWQgYWRvcHRhYmxlLWxlZ2FjeSBtYXJrZXIgbWVhbnMgdGhlIHNlc3Npb24gaXMgbm93IGEgcmVhbFxuXHRcdFx0XHQvLyBzZXNzaW9uOyB0aGUgZ3VhcmQgaW4gYF9lbnN1cmVTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25gIHNraXBwZWQgaXRcblx0XHRcdFx0Ly8gd2hpbGUgaXQgd2FzIGFkb3B0YWJsZSwgc28gcmVvcGVuIHRoZSBzdWJzY3JpcHRpb24gZXhwbGljaXRseS5cblx0XHRcdFx0aWYgKHdhc0Fkb3B0YWJsZSAmJiAhcmVhZFNlc3Npb25FaGNsaUFkb3B0YWJsZShjaGFuZ2VzLl9tZXRhKSkge1xuXHRcdFx0XHRcdHJlb3BlblN0YXRlU3Vic2NyaXB0aW9uRm9yID0gY2FjaGVkLnNlc3Npb25JZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlkQ2hhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlb3BlblN0YXRlU3Vic2NyaXB0aW9uRm9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbihyZW9wZW5TdGF0ZVN1YnNjcmlwdGlvbkZvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ29uZmlnQ2hhbmdlZChzZXNzaW9uOiBzdHJpbmcsIGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHJlcGxhY2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uSWQgPSBjYWNoZWQuc2Vzc2lvbklkO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChzZXNzaW9uSWQsIHtcblx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdHZhbHVlczogcmVwbGFjZSA/IHsgLi4uY29uZmlnIH0gOiB7IC4uLmV4aXN0aW5nLnZhbHVlcywgLi4uY29uZmlnIH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU2Vzc2lvbiB3YXMgcmVzdG9yZWQgKGUuZy4gYWZ0ZXIgcmVsb2FkKSBcdTIwMTQgY3JlYXRlIGEgbWluaW1hbFxuXHRcdFx0Ly8gY29uZmlnIGVudHJ5IGZyb20gdGhlIGNoYW5nZWQgdmFsdWVzIHNvIHRoZSBwaWNrZXIgY2FuIHJlbmRlci5cblx0XHRcdC8vIGByZXBsYWNlYCB2cyBtZXJnZSBpcyBtb290IGhlcmUgKG5vIGV4aXN0aW5nIHZhbHVlcyB0byBtZXJnZSB3aXRoKS5cblx0XHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5zZXQoc2Vzc2lvbklkLCB7XG5cdFx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogYnVpbGRNdXRhYmxlQ29uZmlnU2NoZW1hKGNvbmZpZykgfSxcblx0XHRcdFx0dmFsdWVzOiBjb25maWcsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUoc2Vzc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNoYW5nZXNldHNDaGFuZ2VkKHNlc3Npb246IHN0cmluZywgY2hhbmdlc2V0czogcmVhZG9ubHkgQ2hhbmdlc2V0W10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRjYWNoZWQudXBkYXRlQ2hhbmdlc2V0cyhjaGFuZ2VzZXRzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTZXNzaW9uTWV0YUNoYW5nZWQoc2Vzc2lvbjogc3RyaW5nLCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQ/LnNldE1ldGEobWV0YSkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBVUkkgbWFwcGVyIHVzZWQgd2hlbiBhcHBseWluZyBkaWZmIGNoYW5nZXMuIFN1YmNsYXNzZXNcblx0ICogb3ZlcnJpZGUgdG8gdHJhbnNsYXRlIHJlbW90ZSBkaWZmIFVSSXMgaW50byBhZ2VudC1ob3N0IFVSSXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2RpZmZVcmlNYXBwZXIoKTogKCh1cmk6IFVSSSkgPT4gVVJJKSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUIsa0JBQWtCLDZCQUE2QjtBQUMzRSxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYSx3QkFBd0I7QUFDOUMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBMEIsZ0JBQWdCLDJCQUEyQjtBQUNyRSxTQUFTLFlBQVksZUFBZSxpQkFBMEMsbUJBQW1CLG9CQUFvQjtBQUNySCxTQUFT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
