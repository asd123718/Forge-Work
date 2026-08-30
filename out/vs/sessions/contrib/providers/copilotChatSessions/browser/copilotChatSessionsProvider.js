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
import { Emitter, Event } from "../../../../../base/common/event.js";
import { raceCancellationError, raceTimeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../base/common/errors.js";
import { MarkdownString, markdownStringEqual } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, DisposableMap, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, constObservable, derived, derivedOpts, observableFromPromise, observableSignal, observableValue, observableValueOpts, runOnChange, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { getAgentSessionPullRequestUri } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js";
import { getRepositoryName } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js";
import { IAgentSessionsService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionProviders } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatSessionStatus, IChatSessionsService, SessionType } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { SessionStatus, GITHUB_REMOTE_FILE_SCHEME, sessionFileChangesEqual, gitHubInfoEqual, sessionWorkspaceEqual, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_GITHUB, ChatInteractivity, SessionTypeAuthRequirement } from "../../../../services/sessions/common/session.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { ILanguageModelToolsService } from "../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { ChatMode, IChatModeService, isBuiltinChatMode } from "../../../../../workbench/contrib/chat/common/chatModes.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { getRegisteredLanguageModels, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { IGitService } from "../../../../../workbench/contrib/git/common/gitService.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { SessionConfigKey } from "../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { computePullRequestIcon } from "../../../github/common/types.js";
import { computeSessionPullRequestIcon } from "../../../github/browser/pullRequestIconStatus.js";
import { IPullRequestIconCache } from "../../../github/browser/pullRequestIconCache.js";
import { structuralEquals } from "../../../../../base/common/equals.js";
import { CopilotCLISessionType } from "../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { createChangesets } from "./copilotChatSessionsChangesets.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
const CopilotCloudSessionType = {
  id: "copilot-cloud-agent",
  label: localize("copilotCloud", "Cloud"),
  icon: Codicon.cloud,
  authRequirement: SessionTypeAuthRequirement.GitHub
};
const STORAGE_KEY_ISOLATION_MODE = "sessions.isolationPicker.selectedMode";
const OPEN_REPO_COMMAND = "github.copilot.chat.cloudSessions.openRepository";
const COPILOT_PROVIDER_ID = "default-copilot";
const COPILOT_MULTI_CHAT_SETTING = "sessions.github.copilot.multiChatSessions";
const REPOSITORY_OPTION_ID = "repository";
const PARENT_SESSION_OPTION_ID = "parentSessionId";
const BRANCH_OPTION_ID = "branch";
const ISOLATION_OPTION_ID = "isolation";
const AGENT_OPTION_ID = "agent";
function isNewSession(session) {
  return session instanceof CopilotCLISession || session instanceof RemoteNewSession;
}
function buildChatFromSession(chat) {
  return {
    resource: chat.resource,
    createdAt: chat.createdAt,
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changes: chat.changes,
    checkpoints: chat.checkpoints,
    modelId: chat.modelId,
    mode: chat.mode,
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    interactivity: constObservable(ChatInteractivity.Full),
    description: chat.description,
    lastTurnEnd: chat.lastTurnEnd
  };
}
function setIfChanged(observable, value, tx, equals = Object.is) {
  if (equals(observable.get(), value)) {
    return false;
  }
  observable.set(value, tx, void 0);
  return true;
}
function dateEquals(a, b) {
  return a?.getTime() === b?.getTime();
}
function markdownStringEquals(a, b) {
  return a === b || !!a && !!b && markdownStringEqual(a, b);
}
let CopilotCLISession = class extends Disposable {
  constructor(resource, sessionWorkspace, providerId, chatSessionsService, gitService, gitHubService, pullRequestIconCache, storageService, configurationService) {
    super();
    this.resource = resource;
    this.sessionWorkspace = sessionWorkspace;
    this.chatSessionsService = chatSessionsService;
    this.gitService = gitService;
    this.gitHubService = gitHubService;
    this.pullRequestIconCache = pullRequestIconCache;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this._title = observableValue(this, "");
    this.title = this._title;
    this._updatedAt = observableValue(this, /* @__PURE__ */ new Date());
    this.updatedAt = this._updatedAt;
    this._status = observableValue(this, SessionStatus.Untitled);
    this.status = this._status;
    this._permissionLevel = observableValue(this, ChatPermissionLevel.Default);
    this.permissionLevel = this._permissionLevel;
    this._workspaceData = observableValue(this, void 0);
    this.workspace = this._workspaceData;
    this._branchObservable = observableValue(this, void 0);
    this.branch = this._branchObservable;
    this._isolationModeObservable = observableValue(this, "worktree");
    this.isolationMode = this._isolationModeObservable;
    this._modelIdObservable = observableValue(this, void 0);
    this.modelId = this._modelIdObservable;
    this._modeObservable = observableValue(this, void 0);
    this.mode = this._modeObservable;
    this._loading = observableValue(this, true);
    this.loading = this._loading;
    this._hasGitRepository = observableValue(this, false);
    this.hasGitRepository = this._hasGitRepository;
    this._isArchived = observableValue(this, false);
    this.isArchived = this._isArchived;
    this.isRead = observableValue(this, true);
    this.lastTurnEnd = observableValue(this, void 0);
    this.gitHubInfo = observableValue(this, void 0);
    this._loadBranchesCts = this._register(new MutableDisposable());
    // -- Branch state --
    this._branches = observableValue(this, []);
    this.branches = this._branches;
    this.target = AgentSessionProviders.Background;
    this.selectedOptions = /* @__PURE__ */ new Map();
    this.sessionId = toSessionId(providerId, resource);
    this.providerId = providerId;
    this.sessionType = AgentSessionProviders.Background;
    this.icon = CopilotCLISessionType.icon;
    this.createdAt = /* @__PURE__ */ new Date();
    const repoUri = sessionWorkspace.folders[0]?.root;
    if (repoUri) {
      this._repoUri = repoUri;
      this.setOption(REPOSITORY_OPTION_ID, repoUri.fsPath);
    }
    this._workspaceData.set(sessionWorkspace, void 0);
    const storedMode = storageService.get(STORAGE_KEY_ISOLATION_MODE, StorageScope.PROFILE);
    const initialMode = storedMode === "workspace" ? "workspace" : "worktree";
    this._isolationMode = initialMode;
    this._isolationModeObservable.set(initialMode, void 0);
    this.setOption(ISOLATION_OPTION_ID, initialMode);
    this._resolveGitRepository();
    this._description = observableValue(this, void 0);
    this.description = this._description;
    this._changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    this.changes = this._changes;
    this._checkpoints = observableValueOpts({ owner: this, equalsFn: structuralEquals }, void 0);
    this.checkpoints = this._checkpoints;
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  get selectedModelId() {
    return this._modelId;
  }
  get chatMode() {
    return this._mode;
  }
  get query() {
    return this._query;
  }
  get attachedContext() {
    return this._attachedContext;
  }
  get gitRepository() {
    return this._gitRepository;
  }
  get disabled() {
    if (!this._repoUri) {
      return true;
    }
    if (this._isolationMode === "worktree" && !this._branch) {
      return true;
    }
    return false;
  }
  async _resolveGitRepository() {
    const repoUri = this.sessionWorkspace.folders[0]?.root;
    if (repoUri) {
      try {
        this._gitRepository = await this.gitService.openRepository(repoUri);
        if (!this._gitRepository) {
          this.setIsolationMode("workspace");
        } else if (!this._gitRepository.state.get().HEAD?.commit) {
          this.setIsolationMode("workspace");
        }
      } catch {
        this.setIsolationMode("workspace");
      }
    }
    const gitRepository = this._gitRepository;
    if (gitRepository) {
      this._register(autorun((reader) => {
        this._hasGitRepository.set(!!gitRepository.state.read(reader).HEAD?.commit, void 0);
      }));
      this._loadBranches(gitRepository);
      const currentBranchName = derived((reader) => {
        const state = gitRepository.state.read(reader);
        return state?.HEAD?.commit ? state.HEAD.name : void 0;
      });
      this._register(autorun((reader) => {
        const isolationMode = this.isolationMode.read(reader);
        if (isolationMode === "worktree") {
          return;
        }
        const currentBranch = currentBranchName.read(reader);
        this.setBranch(currentBranch ?? this._defaultBranch);
      }));
    }
    this._loading.set(false, void 0);
  }
  _loadBranches(repo) {
    this._loadBranchesCts.value?.cancel();
    const cts = this._loadBranchesCts.value = new CancellationTokenSource();
    repo.getRefs({ pattern: "refs/heads" }, cts.token).then((refs) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      const hasHeadCommit = !!repo.state.get().HEAD?.commit;
      const branches = refs.map((r) => r.name).filter((name) => !!name).filter((name) => !name.includes(CopilotCLISession.COPILOT_WORKTREE_PATTERN));
      const defaultBranch = hasHeadCommit ? branches.find((b) => b === "main") ?? branches.find((b) => b === "master") ?? branches.find((b) => b === repo.state.get().HEAD?.name) ?? branches[0] : void 0;
      this._defaultBranch = defaultBranch;
      transaction((tx) => {
        this._branches.set(branches, tx);
      });
      if (defaultBranch && !this._branch) {
        this.setBranch(defaultBranch);
      }
    }).catch(() => {
      if (!cts.token.isCancellationRequested) {
        transaction((tx) => {
          this._branches.set([], tx);
        });
      }
    });
  }
  setIsolationMode(mode) {
    if (this._isolationMode !== mode) {
      this._isolationMode = mode;
      this._isolationModeObservable.set(mode, void 0);
      this.setOption(ISOLATION_OPTION_ID, mode);
      this.storageService.store(STORAGE_KEY_ISOLATION_MODE, mode, StorageScope.PROFILE, StorageTarget.MACHINE);
      if (mode === "workspace") {
        const head = this._gitRepository?.state.get().HEAD;
        const currentBranch = head?.commit ? head.name : void 0;
        this.setBranch(currentBranch ?? this._defaultBranch);
      } else {
        this.setBranch(this._defaultBranch);
      }
    }
  }
  setBranch(branch) {
    if (this._branch !== branch) {
      this._branch = branch;
      this._branchObservable.set(branch, void 0);
      this.setOption(BRANCH_OPTION_ID, branch ?? "");
    }
  }
  setModelId(modelId) {
    this._modelId = modelId;
    this._modelIdObservable.set(modelId, void 0);
  }
  setModeById(modeId, modeKind) {
    this._modeObservable.set({ id: modeId, kind: modeKind }, void 0);
  }
  setPermissionLevel(level) {
    this._permissionLevel.set(level, void 0);
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setArchived(archived) {
    this._isArchived.set(archived, void 0);
  }
  setMode(mode) {
    if (this._mode?.id !== mode?.id) {
      this._mode = mode;
      const modeName = mode?.isBuiltin ? void 0 : mode?.name.get();
      this.setOption(AGENT_OPTION_ID, modeName ?? "");
    }
  }
  getAgentHostSessionConfig() {
    const config = {
      [SessionConfigKey.Isolation]: this._isolationMode === "worktree" ? "worktree" : "folder"
    };
    if (this._isolationMode === "worktree" && this._branch) {
      config[SessionConfigKey.Branch] = this._branch;
      const branchPrefix = this.configurationService.getValue("git.branchPrefix", { resource: this._repoUri });
      if (typeof branchPrefix === "string" && branchPrefix.length > 0) {
        config[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
      }
      const worktreeIncludeFiles = this.configurationService.getValue("git.worktreeIncludeFiles", { resource: this._repoUri });
      if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
        config[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
      }
    }
    return config;
  }
  setOption(optionId, value) {
    if (typeof value === "string") {
      this.selectedOptions.set(optionId, { id: value, name: value });
    } else {
      this.selectedOptions.set(optionId, value);
    }
    this.chatSessionsService.setSessionOption(this.resource, optionId, value);
  }
  update(agentSession) {
    transaction((tx) => {
      const session = new AgentSessionAdapter(agentSession, this.providerId, this.gitHubService, this.pullRequestIconCache);
      this._workspaceData.set(session.workspace.get(), tx);
      this._title.set(session.title.get(), tx);
      this._status.set(session.status.get(), tx);
      this._updatedAt.set(session.updatedAt.get(), tx);
      this._changes.set(session.changes.get(), tx);
      this._checkpoints.set(session.checkpoints.get(), tx);
      this._description.set(session.description.get(), tx);
    });
  }
};
CopilotCLISession.COPILOT_WORKTREE_PATTERN = "copilot-worktree-";
CopilotCLISession = __decorateClass([
  __decorateParam(3, IChatSessionsService),
  __decorateParam(4, IGitService),
  __decorateParam(5, IGitHubService),
  __decorateParam(6, IPullRequestIconCache),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IConfigurationService)
], CopilotCLISession);
function isModelOptionGroup(group) {
  if (group.id === "models") {
    return true;
  }
  const nameLower = group.name.toLowerCase();
  return nameLower === "model" || nameLower === "models";
}
function isRepositoriesOptionGroup(group) {
  return group.id === "repositories";
}
let RemoteNewSession = class extends Disposable {
  constructor(resource, sessionWorkspace, target, providerId, chatSessionsService, contextKeyService) {
    super();
    this.resource = resource;
    this.sessionWorkspace = sessionWorkspace;
    this.target = target;
    this.chatSessionsService = chatSessionsService;
    this.contextKeyService = contextKeyService;
    this._title = observableValue(this, "");
    this.title = this._title;
    this._updatedAt = observableValue(this, /* @__PURE__ */ new Date());
    this.updatedAt = this._updatedAt;
    this._status = observableValue(this, SessionStatus.Untitled);
    this.status = this._status;
    this._permissionLevel = observableValue(this, ChatPermissionLevel.Default);
    this.permissionLevel = this._permissionLevel;
    this._workspaceData = observableValue(this, void 0);
    this.workspace = this._workspaceData;
    this.changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    this.checkpoints = constObservable(void 0);
    this._modelIdObservable = observableValue(this, void 0);
    this.modelId = this._modelIdObservable;
    this.mode = observableValue(this, void 0);
    this.loading = observableValue(this, false);
    this._isArchived = observableValue(this, false);
    this.isArchived = this._isArchived;
    this.isRead = observableValue(this, true);
    this.description = constObservable(void 0);
    this.lastTurnEnd = constObservable(void 0);
    this.gitHubInfo = constObservable(void 0);
    this.branch = constObservable(void 0);
    this.isolationMode = constObservable(void 0);
    this.branches = constObservable([]);
    this._hasGitRepo = observableValue(this, false);
    this.hasGitRepo = this._hasGitRepo;
    this._onDidChangeOptionGroups = this._register(new Emitter());
    this.onDidChangeOptionGroups = this._onDidChangeOptionGroups.event;
    this.selectedOptions = /* @__PURE__ */ new Map();
    this._whenClauseKeys = /* @__PURE__ */ new Set();
    this.sessionId = toSessionId(providerId, resource);
    this.providerId = providerId;
    this.sessionType = target;
    this.icon = CopilotCloudSessionType.icon;
    this.createdAt = /* @__PURE__ */ new Date();
    this._updateWhenClauseKeys();
    this._register(this.chatSessionsService.onDidChangeOptionGroups(() => {
      this._updateWhenClauseKeys();
      this._onDidChangeOptionGroups.fire();
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (this._whenClauseKeys.size > 0 && e.affectsSome(this._whenClauseKeys)) {
        this._onDidChangeOptionGroups.fire();
      }
    }));
    this._workspaceData.set(sessionWorkspace, void 0);
    this._repoUri = sessionWorkspace.folders[0]?.root;
    if (this._repoUri) {
      const id = this._repoUri.path.substring(1);
      this.setOption("repositories", { id, name: id });
    }
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  get project() {
    return this._project;
  }
  get selectedModelId() {
    return this._modelId;
  }
  get chatMode() {
    return void 0;
  }
  get query() {
    return this._query;
  }
  get attachedContext() {
    return this._attachedContext;
  }
  get disabled() {
    return !this._repoUri && !this.selectedOptions.has("repositories");
  }
  setPermissionLevel(level) {
    throw new Error("Method not implemented.");
  }
  // -- New session configuration methods --
  setIsolationMode(_mode) {
  }
  setBranch(_branch) {
  }
  setModelId(modelId) {
    this._modelId = modelId;
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setArchived(archived) {
    this._isArchived.set(archived, void 0);
  }
  setMode(_mode) {
  }
  setOption(optionId, value) {
    if (typeof value !== "string") {
      this.selectedOptions.set(optionId, value);
    }
    this.chatSessionsService.setSessionOption(this.resource, optionId, value);
  }
  // --- Option group accessors ---
  getModelOptionsSnapshot() {
    const groups = this._getOptionGroups();
    if (!groups) {
      return { modelOption: void 0, isResolved: false };
    }
    const group = groups.find((g) => isModelOptionGroup(g));
    if (!group) {
      return { modelOption: void 0, isResolved: true };
    }
    return { modelOption: { group, value: this._getValueForGroup(group) }, isResolved: true };
  }
  getOtherOptionGroups() {
    const groups = this._getOptionGroups();
    if (!groups) {
      return [];
    }
    return groups.filter((g) => !isModelOptionGroup(g) && !isRepositoriesOptionGroup(g) && this._isOptionGroupVisible(g)).map((g) => ({ group: g, value: this._getValueForGroup(g) }));
  }
  getOptionValue(groupId) {
    return this.selectedOptions.get(groupId);
  }
  setOptionValue(groupId, value) {
    this.setOption(groupId, value);
  }
  // --- Internals ---
  _getOptionGroups() {
    return this.chatSessionsService.getOptionGroupsForSessionType(this.target);
  }
  _isOptionGroupVisible(group) {
    if (!group.when) {
      return true;
    }
    const expr = ContextKeyExpr.deserialize(group.when);
    return !expr || this.contextKeyService.contextMatchesRules(expr);
  }
  _updateWhenClauseKeys() {
    this._whenClauseKeys.clear();
    const groups = this._getOptionGroups();
    if (!groups) {
      return;
    }
    for (const group of groups) {
      if (group.when) {
        const expr = ContextKeyExpr.deserialize(group.when);
        if (expr) {
          for (const key of expr.keys()) {
            this._whenClauseKeys.add(key);
          }
        }
      }
    }
  }
  _getValueForGroup(group) {
    const selected = this.selectedOptions.get(group.id);
    if (selected) {
      return selected;
    }
    const sessionOption = this.chatSessionsService.getSessionOption(this.resource, group.id);
    if (sessionOption && typeof sessionOption !== "string") {
      return sessionOption;
    }
    if (typeof sessionOption === "string") {
      const item = group.items.find((i) => i.id === sessionOption.trim());
      if (item) {
        return item;
      }
    }
    return group.items.find((i) => i.default === true) ?? group.items[0];
  }
  update(_session) {
  }
};
RemoteNewSession = __decorateClass([
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, IContextKeyService)
], RemoteNewSession);
function toSessionStatus(status) {
  switch (status) {
    case ChatSessionStatus.InProgress:
      return SessionStatus.InProgress;
    case ChatSessionStatus.NeedsInput:
      return SessionStatus.NeedsInput;
    case ChatSessionStatus.Completed:
      return SessionStatus.Completed;
    case ChatSessionStatus.Failed:
      return SessionStatus.Error;
  }
}
function githubRemoteRepoLabel(uri) {
  if (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
    return void 0;
  }
  const parts = uri.path.replace(/^\//, "").split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : void 0;
}
class AgentSessionAdapter {
  constructor(session, providerId, _gitHubService, _pullRequestIconCache) {
    this._gitHubService = _gitHubService;
    this._pullRequestIconCache = _pullRequestIconCache;
    this._pullRequestNumberCache = /* @__PURE__ */ new Map();
    this.permissionLevel = constObservable(ChatPermissionLevel.Default);
    this.branch = constObservable(void 0);
    this.isolationMode = constObservable(void 0);
    this.branches = constObservable([]);
    this.sessionId = toSessionId(providerId, session.resource);
    this.resource = session.resource;
    this.providerId = providerId;
    this.sessionType = session.providerType;
    this.icon = this._getSessionTypeIcon(session);
    this.createdAt = new Date(session.timing.created);
    this._baseGitHubInfo = observableValue(this, this._extractGitHubInfo(session));
    this._pullRequestBranch = observableValue(this, this._extractPullRequestBranch(session));
    this._pullRequestNumberFromBranch = derived(this, (reader) => {
      const base = this._baseGitHubInfo.read(reader);
      const branch = this._pullRequestBranch.read(reader);
      if (base?.pullRequest || !base || !branch) {
        return void 0;
      }
      return this._pullRequestNumberForBranch(base.owner, base.repo, branch);
    });
    this.gitHubInfo = derived(this, (reader) => {
      let info = this._baseGitHubInfo.read(reader);
      if (!info) {
        return void 0;
      }
      if (!info.pullRequest) {
        const pullRequestNumber = this._pullRequestNumberFromBranch.read(reader)?.read(reader).value;
        if (pullRequestNumber === void 0) {
          return info;
        }
        info = {
          ...info,
          pullRequest: {
            number: pullRequestNumber,
            uri: URI.parse(`https://github.com/${info.owner}/${info.repo}/pull/${pullRequestNumber}`)
          }
        };
      }
      const pullRequest = info.pullRequest;
      if (!pullRequest) {
        return info;
      }
      if (pullRequest.uri.authority.toLowerCase() !== "github.com") {
        return info;
      }
      return {
        ...info,
        pullRequest: {
          ...pullRequest,
          icon: computeSessionPullRequestIcon(reader, this._gitHubService, this._pullRequestIconCache, info)
        }
      };
    });
    this._workspace = observableValue(this, this._buildWorkspace(session));
    this.workspace = this._workspace;
    this._title = observableValue(this, session.label);
    this.title = this._title;
    const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
    this._updatedAt = observableValue(this, new Date(updatedTime));
    this.updatedAt = this._updatedAt;
    this._status = observableValue(this, toSessionStatus(session.status));
    this.status = this._status;
    this._changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, this._extractChanges(session));
    this.changes = this._changes;
    this._checkpoints = observableValueOpts({ owner: this, equalsFn: structuralEquals }, this._extractCheckpoints(session));
    this.checkpoints = this._checkpoints;
    this._modelId = observableValue(this, void 0);
    this.modelId = this._modelId;
    this.mode = observableValue(this, void 0);
    this.loading = observableValue(this, false);
    this._isArchived = observableValue(this, session.isArchived());
    this.isArchived = this._isArchived;
    this._isRead = observableValue(this, session.isRead());
    this.isRead = this._isRead;
    this._description = observableValue(this, this._extractDescription(session));
    this.description = this._description;
    this._lastTurnEnd = observableValue(this, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : void 0);
    this.lastTurnEnd = this._lastTurnEnd;
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  setPermissionLevel(level) {
    throw new Error("Method not implemented.");
  }
  setBranch(branch) {
    throw new Error("Method not implemented.");
  }
  setIsolationMode(mode) {
    throw new Error("Method not implemented.");
  }
  setModelId(modelId) {
    this._modelId.set(modelId, void 0);
  }
  setMode(chatMode) {
    throw new Error("Method not implemented.");
  }
  /**
   * Update reactive properties from a refreshed agent session.
   */
  update(session) {
    let changed = false;
    transaction((tx) => {
      const gitHubInfo = this._extractGitHubInfo(session);
      const pullRequestBranch = this._extractPullRequestBranch(session);
      changed = setIfChanged(this._title, session.label, tx) || changed;
      changed = setIfChanged(this._workspace, this._buildWorkspace(session), tx, sessionWorkspaceEqual) || changed;
      const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
      changed = setIfChanged(this._updatedAt, new Date(updatedTime), tx, dateEquals) || changed;
      changed = setIfChanged(this._status, toSessionStatus(session.status), tx) || changed;
      changed = setIfChanged(this._changes, this._extractChanges(session), tx, sessionFileChangesEqual) || changed;
      changed = setIfChanged(this._checkpoints, this._extractCheckpoints(session), tx, structuralEquals) || changed;
      changed = setIfChanged(this._isArchived, session.isArchived(), tx) || changed;
      changed = setIfChanged(this._isRead, session.isRead(), tx) || changed;
      changed = setIfChanged(this._description, this._extractDescription(session), tx, markdownStringEquals) || changed;
      changed = setIfChanged(this._lastTurnEnd, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : void 0, tx, dateEquals) || changed;
      changed = setIfChanged(this._baseGitHubInfo, gitHubInfo, tx, gitHubInfoEqual) || changed;
      changed = setIfChanged(this._pullRequestBranch, pullRequestBranch, tx) || changed;
    });
    return changed;
  }
  _pullRequestNumberForBranch(owner, repo, branch) {
    const key = `${owner}/${repo}@${branch}`;
    const cached = this._pullRequestNumberCache.get(key);
    if (cached) {
      return cached;
    }
    const lookup = this._gitHubService.findPullRequestNumberByHeadBranch(owner, repo, branch);
    const observable = observableFromPromise(lookup);
    this._pullRequestNumberCache.set(key, observable);
    lookup.then((pullRequestNumber) => {
      if (pullRequestNumber === void 0 && this._pullRequestNumberCache.get(key) === observable) {
        this._pullRequestNumberCache.delete(key);
      }
    });
    return observable;
  }
  _getSessionTypeIcon(session) {
    switch (session.providerType) {
      case AgentSessionProviders.Background:
        return CopilotCLISessionType.icon;
      case AgentSessionProviders.Cloud:
        return CopilotCloudSessionType.icon;
      default:
        return session.icon;
    }
  }
  _extractDescription(session) {
    if (!session.description) {
      return void 0;
    }
    return typeof session.description === "string" ? new MarkdownString(session.description) : session.description;
  }
  _extractGitHubInfo(session) {
    const metadata = session.metadata;
    if (!metadata) {
      return void 0;
    }
    const pullRequestUri = this._extractPullRequestUri(session);
    const pullRequestIdentity = pullRequestUri ? this._extractPullRequestIdentity(pullRequestUri) : void 0;
    const { owner, repo } = pullRequestIdentity ?? this._extractOwnerRepo(session);
    if (!owner || !repo) {
      return void 0;
    }
    if (!pullRequestUri || !pullRequestIdentity) {
      return { owner, repo };
    }
    const icon = this._extractPullRequestStateIcon(session);
    const baseRefOid = typeof metadata.baseRefOid === "string" ? metadata.baseRefOid : void 0;
    const headRefOid = typeof metadata.headRefOid === "string" ? metadata.headRefOid : void 0;
    return {
      owner,
      repo,
      pullRequest: {
        number: pullRequestIdentity.number,
        uri: pullRequestUri,
        icon,
        baseRefOid,
        headRefOid
      }
    };
  }
  _extractPullRequestBranch(session) {
    if (session.providerType !== AgentSessionProviders.Cloud) {
      return void 0;
    }
    if (typeof session.metadata?.host === "string" && session.metadata.host.toLowerCase() !== "github.com") {
      return void 0;
    }
    return typeof session.metadata?.branch === "string" ? session.metadata.branch : void 0;
  }
  _extractPullRequestIdentity(pullRequestUri) {
    const match = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(pullRequestUri.path);
    if (!match?.groups) {
      return void 0;
    }
    return {
      owner: decodeURIComponent(match.groups.owner),
      repo: decodeURIComponent(match.groups.repo),
      number: parseInt(match.groups.number, 10)
    };
  }
  _extractOwnerRepo(session) {
    const metadata = session.metadata;
    if (!metadata) {
      return { owner: void 0, repo: void 0 };
    }
    if (typeof metadata.owner === "string" && typeof metadata.name === "string") {
      return { owner: metadata.owner, repo: metadata.name };
    }
    if (typeof metadata.repositoryNwo === "string") {
      const parts = metadata.repositoryNwo.split("/");
      if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
    const repoUri = this._buildWorkspace(session)?.folders[0]?.root;
    if (repoUri && repoUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      const parts = repoUri.path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return { owner: decodeURIComponent(parts[0]), repo: decodeURIComponent(parts[1]) };
      }
    }
    return { owner: void 0, repo: void 0 };
  }
  _extractPullRequestStateIcon(session) {
    const metadata = session.metadata;
    const state = metadata?.pullRequestState;
    if (typeof state === "string") {
      return computePullRequestIcon(state);
    }
    return void 0;
  }
  _extractPullRequestUri(session) {
    return getAgentSessionPullRequestUri(session);
  }
  _extractChanges(session) {
    if (!session.changes) {
      return [];
    }
    if (Array.isArray(session.changes)) {
      return session.changes;
    }
    const summary = session.changes;
    if (summary.insertions > 0 || summary.deletions > 0) {
      return [{
        modifiedUri: URI.parse("summary://changes"),
        insertions: summary.insertions,
        deletions: summary.deletions
      }];
    }
    return [];
  }
  _extractCheckpoints(session) {
    const metadata = session.metadata;
    if (typeof metadata?.firstCheckpointRef !== "string" || typeof metadata?.lastCheckpointRef !== "string") {
      return void 0;
    }
    return {
      firstCheckpointRef: metadata.firstCheckpointRef,
      lastCheckpointRef: metadata.lastCheckpointRef
    };
  }
  _buildWorkspace(session) {
    const {
      repoUri,
      worktreeUri,
      branchName,
      baseBranchName,
      baseBranchProtected,
      hasGitHubRemote,
      upstreamBranchName,
      incomingChanges,
      outgoingChanges,
      uncommittedChanges,
      hasGitOperationInProgress
    } = this._extractRepositoryFromMetadata(session);
    const repoUriResolved = repoUri ?? URI.parse("unknown:///");
    const gitRepository = {
      uri: repoUriResolved,
      workTreeUri: worktreeUri,
      branchName,
      baseBranchName,
      baseBranchProtected,
      hasGitHubRemote,
      upstreamBranchName,
      incomingChanges,
      outgoingChanges,
      uncommittedChanges,
      hasGitOperationInProgress,
      gitHubInfo: this.gitHubInfo
    };
    const folder = {
      root: repoUriResolved,
      workingDirectory: worktreeUri ?? repoUriResolved,
      name: basename(repoUriResolved),
      description: branchName,
      gitRepository
    };
    return {
      uri: repoUriResolved,
      label: githubRemoteRepoLabel(repoUriResolved) ?? getRepositoryName(session) ?? basename(repoUriResolved),
      icon: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? Codicon.repo : Codicon.folder,
      group: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
      folders: [folder],
      requiresWorkspaceTrust: session.providerType !== AgentSessionProviders.Cloud,
      isVirtualWorkspace: session.providerType === AgentSessionProviders.Cloud
    };
  }
  /**
   * Extract repository/worktree information from session metadata.
   * Mirrors the logic in sessionsManagementService.getRepositoryFromMetadata().
   */
  _extractRepositoryFromMetadata(session) {
    const metadata = session.metadata;
    if (!metadata) {
      return {};
    }
    if (session.providerType === AgentSessionProviders.Cloud) {
      if (typeof metadata.owner !== "string" || typeof metadata.name !== "string") {
        return {};
      }
      const branch = typeof metadata.branch === "string" ? metadata.branch : "HEAD";
      const repositoryUri = URI.from({
        scheme: GITHUB_REMOTE_FILE_SCHEME,
        authority: "github",
        path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
      });
      return { repoUri: repositoryUri };
    }
    const repoUri = typeof metadata?.repositoryPath === "string" ? URI.file(metadata.repositoryPath) : void 0;
    const worktreeUri = typeof metadata?.worktreePath === "string" ? URI.file(metadata.worktreePath) : void 0;
    return {
      repoUri,
      worktreeUri,
      branchName: metadata?.branchName,
      baseBranchName: metadata?.baseBranchName,
      baseBranchProtected: metadata?.baseBranchProtected,
      hasGitHubRemote: metadata?.hasGitHubRemote,
      upstreamBranchName: metadata?.upstreamBranchName,
      incomingChanges: metadata?.incomingChanges,
      outgoingChanges: metadata?.outgoingChanges,
      uncommittedChanges: metadata?.uncommittedChanges,
      hasGitOperationInProgress: metadata?.hasGitOperationInProgress
    };
  }
}
let CopilotChatSessionsProvider = class extends Disposable {
  constructor(agentSessionsService, chatService, chatSessionsService, dialogService, commandService, instantiationService, languageModelsService, toolsService, configurationService, agentHostEnablementService, logService, gitHubService, pullRequestIconCache, labelService, chatModeService, uriIdentityService) {
    super();
    this.agentSessionsService = agentSessionsService;
    this.chatService = chatService;
    this.chatSessionsService = chatSessionsService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.toolsService = toolsService;
    this.configurationService = configurationService;
    this.agentHostEnablementService = agentHostEnablementService;
    this.logService = logService;
    this.gitHubService = gitHubService;
    this.pullRequestIconCache = pullRequestIconCache;
    this.labelService = labelService;
    this.chatModeService = chatModeService;
    this.uriIdentityService = uriIdentityService;
    this.id = COPILOT_PROVIDER_ID;
    this.label = localize("copilotChatSessionsProvider", "Copilot Chat");
    this.icon = Codicon.copilot;
    this.order = 0;
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidReplaceSession = this._register(new Emitter());
    this.onDidReplaceSession = this._onDidReplaceSession.event;
    /** Cache of adapted sessions, keyed by resource URI string. */
    this._sessionCache = /* @__PURE__ */ new Map();
    /**
     * Resources of committed sessions that are currently in-flight (i.e.
     * between {@link _sendFirstChat} entering the send and the replace
     * event firing). Protected from spurious removal by
     * {@link _refreshSessionCache} so that a concurrent model re-resolve
     * cannot transiently drop them.
     */
    this._inFlightCommits = /* @__PURE__ */ new Set();
    /** Cache of ISession wrappers, keyed by session group ID. */
    this._sessionGroupCache = /* @__PURE__ */ new Map();
    /**
     * Emitter fired when the set of chats in a group changes,
     * used to update the chats observable in `_chatToSession`.
     */
    this._onDidGroupMembershipChange = this._register(new Emitter());
    /**
     * Per-group signals, keyed by `sessionId`, that invalidate a single group's
     * chats observable. A group's chats derived observes only its own signal, so a
     * membership change recomputes just the affected group rather than every observed
     * group.
     */
    this._groupMembershipSignals = /* @__PURE__ */ new Map();
    this.supportsLocalWorkspaces = true;
    // -- Session Lifecycle --
    this._newSessions = this._register(new DisposableMap());
    this._multiChatEnabled = this.configurationService.getValue(COPILOT_MULTI_CHAT_SETTING) ?? true;
    this._register(runOnChange(this.agentHostEnablementService.enabled, () => {
      this._onDidChangeSessionTypes.fire();
      this._refreshSessionCache();
    }));
    this.browseActions = [
      {
        label: localize("repositories", "Repositories"),
        group: SESSION_WORKSPACE_GROUP_GITHUB,
        icon: Codicon.library,
        providerId: this.id,
        run: () => this._browseForRepo()
      }
    ];
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
      this._refreshSessionCache();
    }));
    this._registerGroupMembershipFanOut();
    this._ensureSessionCache();
  }
  get sessionTypes() {
    const types = [];
    if (this._isCopilotCliAvailable()) {
      types.push(CopilotCLISessionType);
    }
    types.push(CopilotCloudSessionType);
    return types;
  }
  /**
   * A single subscription to `_onDidGroupMembershipChange` that fans each event out
   * to the affected group's own signal. Subscribing exactly once (instead of once per
   * session) keeps the emitter's listener count constant regardless of how many
   * sessions exist — the per-session subscriptions previously leaked listeners as
   * sessions accumulated.
   */
  _registerGroupMembershipFanOut() {
    this._register(this._onDidGroupMembershipChange.event((e) => {
      this._groupMembershipSignals.get(e.sessionId)?.trigger(void 0, void 0);
    }));
  }
  _isCopilotCliAvailable() {
    return !this.agentHostEnablementService.enabled.get();
  }
  // -- Sessions --
  getSessionTypes(workspaceUri) {
    if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME || workspaceUri.scheme === SessionType.CopilotCloud) {
      return [CopilotCloudSessionType];
    }
    const types = [];
    if (this._isCopilotCliAvailable()) {
      types.push(CopilotCLISessionType);
    }
    return types;
  }
  getSessions() {
    this._ensureSessionCache();
    if (!this._isMultiChatEnabled()) {
      return Array.from(this._sessionCache.values()).map((chat) => this._chatToSession(chat));
    }
    const allChats = Array.from(this._sessionCache.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const seen = /* @__PURE__ */ new Set();
    const sessions = [];
    for (const chat of allChats) {
      const groupId = this._getGroupIdForChat(chat);
      if (!seen.has(groupId)) {
        seen.add(groupId);
        sessions.push(this._chatToSession(chat));
      }
    }
    return sessions;
  }
  /**
   * Clear the tracked new session with the given session's id, but only if
   * the map still holds exactly that instance. Async flows (commit wait,
   * cache population) may complete after the entry was already replaced or
   * removed — acting unconditionally would dispose an unrelated session.
   *
   * @param session The session that initiated the async flow.
   * @param leak When `true` use {@link DisposableMap.deleteAndLeak}
   *             (the session is still referenced elsewhere, e.g. the session
   *             cache); otherwise use {@link DisposableMap.deleteAndDispose}.
   */
  _clearCurrentNewSessionIfMatch(session, leak) {
    if (this._newSessions.get(session.sessionId) === session) {
      if (leak) {
        this._newSessions.deleteAndLeak(session.sessionId);
      } else {
        this._newSessions.deleteAndDispose(session.sessionId);
      }
    }
  }
  deleteNewSession(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  getSession(sessionId) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      return newSession;
    }
    return this._findChatSession(sessionId);
  }
  createNewSession(workspaceUri, sessionTypeId) {
    const workspace = this.resolveWorkspace(workspaceUri);
    if (!workspace) {
      throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
    }
    if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      if (sessionTypeId !== CopilotCloudSessionType.id) {
        throw new Error("Only Copilot Cloud sessions can be created for GitHub repositories");
      }
      const resource2 = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/untitled-${generateUuid()}` });
      const session2 = this.instantiationService.createInstance(RemoteNewSession, resource2, workspace, AgentSessionProviders.Cloud, this.id);
      this._newSessions.set(session2.sessionId, session2);
      return this._chatToSession(session2);
    }
    if (sessionTypeId !== CopilotCLISessionType.id) {
      throw new Error(`Unsupported session type '${sessionTypeId}' for local workspaces`);
    }
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
    const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace, this.id);
    session.setPermissionLevel(this._defaultPermissionLevel());
    this._newSessions.set(session.sessionId, session);
    return this._chatToSession(session);
  }
  createQuickChat(_sessionTypeId) {
    throw new Error("CopilotChatSessionsProvider does not support quick chats");
  }
  /**
   * Resolves the initial permission level for a brand-new session from
   * `chat.permissions.default`, clamped to `Default` when enterprise policy
   * disables global auto-approval.
   */
  _defaultPermissionLevel() {
    const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    if (policyRestricted) {
      return ChatPermissionLevel.Default;
    }
    const level = this.configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
    return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
  }
  get onDidChangeModels() {
    return Event.signal(Event.any(
      this.languageModelsService.onDidChangeLanguageModels,
      this.chatSessionsService.onDidChangeOptionGroups
    ));
  }
  getModelsSnapshot(sessionId, desiredModelId) {
    const session = this.getSession(sessionId);
    if (session instanceof RemoteNewSession) {
      const { modelOption, isResolved } = session.getModelOptionsSnapshot();
      const models2 = modelOption?.group.items.map((item) => this._toSyntheticModel(item)) ?? [];
      return { models: models2, desiredModelResolution: resolveModelIdentifier(models2, desiredModelId, isResolved), modelTarget: session.sessionType };
    }
    const sessionType = session?.sessionType;
    if (!sessionType) {
      return { models: [], desiredModelResolution: resolveModelIdentifier([], desiredModelId, false), modelTarget: void 0 };
    }
    const allModels = getRegisteredLanguageModels(this.languageModelsService);
    const models = allModels.filter((model) => model.metadata.targetChatSessionType === sessionType);
    return {
      models,
      desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, desiredModelId, this.languageModelsService, allModels),
      modelTarget: sessionType
    };
  }
  getModelPickerOptions(sessionId) {
    const sessionType = this.getSession(sessionId)?.sessionType;
    const showAutoModel = !sessionType || this.chatSessionsService.supportsAutoModelForSessionType(sessionType);
    return {
      useGroupedModelPicker: true,
      showFeatured: true,
      showUnavailableFeatured: false,
      showManageModelsAction: false,
      showAutoModel
    };
  }
  _toSyntheticModel(item) {
    const modelMetadata = item.modelMetadata;
    return {
      identifier: item.id,
      metadata: {
        extension: new ExtensionIdentifier(""),
        name: modelMetadata?.name ?? item.name,
        id: modelMetadata?.id ?? item.id,
        vendor: modelMetadata?.vendor ?? "",
        version: modelMetadata?.version ?? "",
        family: modelMetadata?.family ?? "",
        tooltip: modelMetadata?.tooltip ?? item.tooltip,
        pricing: modelMetadata?.pricing,
        multiplierNumeric: modelMetadata?.multiplierNumeric,
        inputCost: modelMetadata?.inputCost,
        outputCost: modelMetadata?.outputCost,
        cacheCost: modelMetadata?.cacheCost,
        cacheWriteCost: modelMetadata?.cacheWriteCost,
        longContextInputCost: modelMetadata?.longContextInputCost,
        longContextOutputCost: modelMetadata?.longContextOutputCost,
        longContextCacheCost: modelMetadata?.longContextCacheCost,
        longContextCacheWriteCost: modelMetadata?.longContextCacheWriteCost,
        priceCategory: modelMetadata?.priceCategory,
        promo: modelMetadata?.promo,
        maxInputTokens: modelMetadata?.maxInputTokens ?? 0,
        maxOutputTokens: modelMetadata?.maxOutputTokens ?? 0,
        capabilities: modelMetadata?.capabilities ? {
          vision: modelMetadata.capabilities.vision,
          toolCalling: modelMetadata.capabilities.toolCalling
        } : void 0,
        isUserSelectable: true,
        isDefaultForLocation: {}
      }
    };
  }
  setModel(sessionId, modelId) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setModelId(modelId);
      if (newSession instanceof RemoteNewSession) {
        const { modelOption } = newSession.getModelOptionsSnapshot();
        const item = modelOption?.group.items.find((i) => i.id === modelId);
        if (item) {
          newSession.setOptionValue(modelOption.group.id, item);
        }
      }
      return;
    }
    this._ensureSessionCache();
    this._findChatSession(sessionId)?.setModelId(modelId);
  }
  setMode(sessionId, modeId) {
    const setSessionMode = (session2) => {
      let mode;
      switch (modeId) {
        case ChatModeKind.Agent:
          mode = ChatMode.Agent;
          break;
        case ChatModeKind.Edit:
          mode = ChatMode.Edit;
          break;
        case ChatModeKind.Ask:
          mode = ChatMode.Ask;
          break;
        default: {
          const modes = this.chatModeService.createModes(session2.resource);
          try {
            mode = modes.findModeById(modeId) ?? modes.findModeByName(modeId);
          } finally {
            modes.dispose();
          }
          break;
        }
      }
      if (mode) {
        session2.setMode(mode);
      }
    };
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      setSessionMode(newSession);
      return;
    }
    this._ensureSessionCache();
    const session = this._findChatSession(sessionId);
    if (session) {
      setSessionMode(session);
    }
  }
  setPermissionLevel(sessionId, level) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      if (isChatPermissionLevel(level)) {
        newSession.setPermissionLevel(level);
      }
      return;
    }
    this._ensureSessionCache();
    const session = this._findChatSession(sessionId);
    if (session && isChatPermissionLevel(level)) {
      session.setPermissionLevel(level);
    }
  }
  async setIsolationMode(sessionId, mode) {
    if (mode !== "worktree" && mode !== "workspace") {
      return;
    }
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setIsolationMode(mode);
      return;
    }
    this._ensureSessionCache();
    this._findChatSession(sessionId)?.setIsolationMode(mode);
  }
  async setBranch(sessionId, branch) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setBranch(branch);
      return;
    }
    this._ensureSessionCache();
    this._findChatSession(sessionId)?.setBranch(branch);
  }
  // -- Session Actions --
  async archiveSession(sessionId) {
    const chatSession = this._findChatSession(sessionId);
    if (chatSession && isNewSession(chatSession)) {
      chatSession.setArchived(true);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
      return;
    }
    const agentSession = this._findAgentSession(sessionId);
    if (agentSession) {
      agentSession.setArchived(true);
    }
  }
  async unarchiveSession(sessionId) {
    const chatSession = this._findChatSession(sessionId);
    if (chatSession && isNewSession(chatSession)) {
      chatSession.setArchived(false);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
      return;
    }
    const agentSession = this._findAgentSession(sessionId);
    if (agentSession) {
      agentSession.setArchived(false);
    }
  }
  async setSessionReadState(sessionId, isRead) {
    const chatIds = this._getChatIdsInGroup(sessionId);
    const targetIds = chatIds.length > 0 ? chatIds : [sessionId];
    for (const chatId of targetIds) {
      const agentSession = this._findAgentSession(chatId);
      if (agentSession && agentSession.isRead() !== isRead) {
        agentSession.setRead(isRead);
      }
    }
  }
  async deleteSession(sessionId) {
    const chatIds = this._getChatIdsInGroup(sessionId);
    const allChatIds = /* @__PURE__ */ new Set([sessionId, ...chatIds]);
    const agentSessions = [];
    for (const chatId of allChatIds) {
      const agentSession = this._findAgentSession(chatId);
      if (agentSession) {
        agentSessions.push(agentSession);
      }
    }
    if (agentSessions.length === 0) {
      this._cleanupTempSession(sessionId);
      return;
    }
    await this._deleteAgentSessions(agentSessions);
    this._sessionGroupCache.delete(sessionId);
    this._refreshSessionCache();
  }
  async deleteSessions(sessionIds) {
    for (const sessionId of sessionIds) {
      await this.deleteSession(sessionId);
    }
  }
  async renameChat(sessionId, chatUri, title) {
    const agentSession = this.agentSessionsService.getSession(chatUri);
    if (agentSession?.providerType === CopilotCLISessionType.id) {
      await this.commandService.executeCommand("github.copilot.cli.sessions.setTitle", { resource: chatUri }, title);
      return;
    }
    throw new Error("Renaming is not supported for this session type");
  }
  async renameSession(sessionId, title) {
    const session = this._findSession(sessionId);
    if (session) {
      await this.renameChat(sessionId, session.mainChat.get().resource, title);
    }
  }
  async deleteChat(sessionId, chatUri, options) {
    const session = this._findSession(sessionId);
    if (!session?.capabilities.get().supportsMultipleChats) {
      throw new Error("Deleting individual chats is not supported when multi-chat is disabled");
    }
    const chatIds = this._getChatIdsInGroup(sessionId);
    const chatId = chatIds.find((id) => {
      const chat = this._sessionCache.get(this._localIdFromchatId(id));
      return chat && chat.resource.toString() === chatUri.toString();
    });
    if (!chatId) {
      return false;
    }
    if (chatIds.length <= 1) {
      await this.deleteSession(sessionId);
      return true;
    }
    const agentSession = this._findAgentSession(chatId);
    if (agentSession) {
      if (!options?.skipConfirmation) {
        const confirmed = await this.dialogService.confirm({
          message: localize("deleteChat.confirm", "Are you sure you want to delete this chat?"),
          detail: localize("deleteChat.detail", "This action cannot be undone."),
          primaryButton: localize("deleteChat.delete", "Delete")
        });
        if (!confirmed.confirmed) {
          return false;
        }
      }
      await this._deleteAgentSessions([agentSession]);
    } else {
      const chat = this._findChatSession(chatId);
      if (chat) {
        const key = chat.resource.toString();
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        if (this._newSessions.has(chatId)) {
          this._newSessions.deleteAndDispose(chatId);
        }
      }
      this._sessionGroupCache.delete(sessionId);
      this._onDidGroupMembershipChange.fire({ sessionId });
      const remainingChatIds = this._getChatIdsInGroup(sessionId);
      const primaryChatId = remainingChatIds[0];
      const primaryChat = primaryChatId ? this._sessionCache.get(this._localIdFromchatId(primaryChatId)) : void 0;
      if (primaryChat) {
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(primaryChat)] });
      }
    }
    return true;
  }
  async _deleteAgentSessions(agentSessions) {
    const cliSessionItems = [];
    for (const agentSession of agentSessions) {
      if (agentSession.providerType === CopilotCLISessionType.id) {
        cliSessionItems.push({ resource: agentSession.resource, label: agentSession.label });
      } else {
        await this.chatService.removeHistoryEntry(agentSession.resource);
      }
    }
    if (cliSessionItems.length > 0) {
      await this.commandService.executeCommand("agents.github.copilot.cli.deleteSessions", cliSessionItems, { skipConfirmation: true });
    }
  }
  async forkChat(sessionId, _sourceChat, _turnId) {
    throw new Error(`Session '${sessionId}' does not support forking into a chat`);
  }
  async createSideChat(sessionId, _sourceChat, _turnId, _selection) {
    throw new Error(`Session '${sessionId}' does not support side chats`);
  }
  async createNewChat(sessionId, _prompt) {
    const currentNewSession = this._newSessions.get(sessionId);
    if (currentNewSession) {
      const session = currentNewSession;
      (await this._createChatSession(session.resource, session)).dispose();
      const newChat = this._toChat(session);
      session.mainChat.set(newChat, void 0);
      return newChat;
    }
    if (!this._isMultiChatEnabled()) {
      throw new Error(`[CopilotChatSessionsProvider] Session '${sessionId}' does not support multiple chats`);
    }
    return this._createNewSubsequentChat(sessionId);
  }
  async _createNewSubsequentChat(sessionId) {
    const chatIds = this._getChatIdsInGroup(sessionId);
    const firstChatId = chatIds[0] ?? sessionId;
    const chat = this._sessionCache.get(this._localIdFromchatId(firstChatId));
    if (!chat) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (chat.sessionType !== CopilotCLISessionType.id) {
      throw new Error("Multiple chats per session is only supported for Copilot CLI sessions");
    }
    const workspace = chat.workspace.get();
    if (!workspace) {
      throw new Error("Chat session has no associated workspace");
    }
    const folder = workspace.folders[0];
    if (!folder) {
      throw new Error("Workspace has no folder");
    }
    const newWorkspace = this.resolveWorkspace(folder.workingDirectory);
    if (!newWorkspace) {
      throw new Error(`Cannot resolve workspace for working directory URI: ${folder.workingDirectory.toString()}`);
    }
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
    const session = this.instantiationService.createInstance(CopilotCLISession, resource, newWorkspace, this.id);
    session.setModelId(chat.modelId.get());
    session.setIsolationMode("workspace");
    session.setOption(PARENT_SESSION_OPTION_ID, chat.resource.path.slice(1));
    session.setPermissionLevel(this._defaultPermissionLevel());
    session.setTitle(localize("new chat", "New Chat"));
    this._newSessions.set(session.sessionId, session);
    (await this._createChatSession(session.resource, session)).dispose();
    this._sessionCache.set(session.resource.toString(), session);
    this._invalidateGroupingCaches();
    this._sessionGroupCache.delete(sessionId);
    this._onDidGroupMembershipChange.fire({ sessionId });
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(session)] });
    return this._toChat(session);
  }
  async sendRequest(sessionId, chatResource, options) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      if (!this.uriIdentityService.extUri.isEqual(newSession.mainChat.get().resource, chatResource)) {
        throw new Error("Chat resource does not match the main chat of the current new session");
      }
      return this._sendFirstChat(newSession, chatResource, options);
    }
    const session = this._findSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (!session.capabilities.get().supportsMultipleChats) {
      throw new Error("Multiple chats per session is not supported");
    }
    if (!session.chats.get().some((chat) => this.uriIdentityService.extUri.isEqual(chat.resource, chatResource))) {
      throw new Error(`Chat '${chatResource.toString()}' does not belong to session '${sessionId}'`);
    }
    const key = chatResource.toString();
    const chatSession = this._sessionCache.get(key);
    if (!chatSession || !(chatSession instanceof CopilotCLISession)) {
      throw new Error(`Chat '${chatResource.toString()}' not found in session '${sessionId}'`);
    }
    return this._sendExistingChat(sessionId, chatSession, options);
  }
  async _sendFirstChat(session, chatResource, options) {
    const { query, attachedContext } = options;
    session.setTitle((options.title || query.split("\n")[0]).substring(0, 100) || localize("new session", "New Session"));
    session.setStatus(SessionStatus.InProgress);
    this._sessionCache.set(session.resource.toString(), session);
    this._invalidateGroupingCaches();
    const newSession = this._chatToSession(session);
    this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });
    const contribution = this.chatSessionsService.getChatSessionContribution(session.target);
    const modeKind = session.chatMode?.kind ?? ChatModeKind.Agent;
    const modeIsBuiltin = session.chatMode ? isBuiltinChatMode(session.chatMode) : true;
    const modeId = modeIsBuiltin ? modeKind : "custom";
    const rawModeInstructions = session.chatMode?.modeInstructions?.get();
    const modeInstructions = rawModeInstructions ? {
      name: session.chatMode.name.get(),
      content: rawModeInstructions.content,
      toolReferences: this.toolsService.toToolReferences(rawModeInstructions.toolReferences),
      metadata: rawModeInstructions.metadata
    } : void 0;
    const permissionLevel = session.permissionLevel.get();
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: session.selectedModelId,
      modeInfo: {
        kind: modeKind,
        isBuiltin: modeIsBuiltin,
        modeInstructions,
        telemetryModeId: modeId,
        applyCodeBlockSuggestionId: void 0,
        permissionLevel
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      hideFromTranscript: options.hideFromTranscript,
      agentHostSessionConfig: session instanceof CopilotCLISession ? session.getAgentHostSessionConfig() : void 0
    };
    const ref = await this._updateChatSessionState(chatResource, session, sendOptions.modeInfo?.permissionLevel);
    this.logService.debug(`[CopilotChatSessionsProvider] Sending first chat for session ${session.sessionId} with options:`, {
      userSelectedModelId: sendOptions.userSelectedModelId
    });
    try {
      const result = await this.chatService.sendRequest(chatResource, query, sendOptions);
      if (result.kind === "rejected") {
        this._sessionCache.delete(session.resource.toString());
        this._invalidateGroupingCaches();
        this._sessionGroupCache.delete(session.sessionId);
        this._clearCurrentNewSessionIfMatch(
          session,
          /* leak */
          true
        );
        this._onDidChangeSessions.fire({ added: [], removed: [newSession], changed: [] });
        session.dispose();
        throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
      }
      const cts = new CancellationTokenSource();
      const responseCompletePromise = result.kind === "sent" ? result.data.responseCompletePromise : void 0;
      const responseCreatedPromise = result.kind === "sent" ? result.data.responseCreatedPromise : void 0;
      responseCreatedPromise?.then((r) => {
        if (r?.isCanceled) {
          cts.cancel();
        }
      });
      try {
        const committedResource = await this._waitForCommittedSession(session.resource, responseCompletePromise, responseCreatedPromise, { deferred: session instanceof RemoteNewSession });
        this._inFlightCommits.add(committedResource.toString());
        try {
          const committedChat = await this._waitForSessionInCache(committedResource, cts.token);
          this._sessionCache.delete(session.resource.toString());
          this._clearCurrentNewSessionIfMatch(session);
          const committedSession = this._chatToSession(committedChat);
          this._sessionGroupCache.delete(session.sessionId);
          this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
          return committedSession;
        } finally {
          this._inFlightCommits.delete(committedResource.toString());
        }
      } catch (error) {
        this._clearCurrentNewSessionIfMatch(
          session,
          /* leak */
          true
        );
        if (error instanceof CancellationError) {
          session.setStatus(SessionStatus.Completed);
          this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newSession] });
          return newSession;
        }
        this._sessionCache.delete(session.resource.toString());
        this._invalidateGroupingCaches();
        this._sessionGroupCache.delete(session.sessionId);
        this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(session)], changed: [] });
        session.dispose();
        throw error;
      } finally {
        cts.dispose();
      }
    } catch (error) {
      this.logService.error(`[CopilotChatSessionsProvider] Failed to send first chat for session ${session.sessionId}:`, error);
      throw error;
    } finally {
      ref?.dispose();
    }
  }
  async _createChatSession(resource, session, permissionLevel) {
    await this.chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    return this._updateChatSessionState(resource, session, permissionLevel);
  }
  async _updateChatSessionState(resource, session, permissionLevel) {
    const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      return Disposable.None;
    }
    const model = modelRef.object;
    if (session.selectedModelId) {
      const languageModel = this.languageModelsService.lookupLanguageModel(session.selectedModelId);
      if (languageModel) {
        model.inputModel.setState({ selectedModel: { identifier: session.selectedModelId, metadata: languageModel } });
      }
    }
    if (session.chatMode) {
      model.inputModel.setState({ mode: { id: session.chatMode.id, kind: session.chatMode.kind } });
    }
    if (session.selectedOptions.size > 0) {
      this.chatSessionsService.updateSessionOptions(resource, session.selectedOptions);
    }
    if (permissionLevel) {
      model.inputModel.setState({ permissionLevel });
    }
    return modelRef;
  }
  /**
   * Sends a request for an existing chat session that is already registered
   * in the cache.
   */
  async _sendExistingChat(sessionId, newChatSession, options) {
    newChatSession.setStatus(SessionStatus.InProgress);
    const key = newChatSession.resource.toString();
    this._sessionGroupCache.delete(sessionId);
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(newChatSession)] });
    const { query, attachedContext } = options;
    const contribution = this.chatSessionsService.getChatSessionContribution(newChatSession.target);
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: newChatSession.selectedModelId,
      modeInfo: {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: newChatSession.permissionLevel.get()
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      hideFromTranscript: options.hideFromTranscript,
      agentHostSessionConfig: newChatSession.getAgentHostSessionConfig()
    };
    const ref = await this._updateChatSessionState(newChatSession.resource, newChatSession);
    try {
      const result = await this.chatService.sendRequest(newChatSession.resource, query, sendOptions);
      if (result.kind === "rejected") {
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
      }
      const responseCompletePromise = result.kind === "sent" ? result.data.responseCompletePromise : void 0;
      const responseCreatedPromise = result.kind === "sent" ? result.data.responseCreatedPromise : void 0;
      try {
        const committedResource = await this._waitForCommittedSession(newChatSession.resource, responseCompletePromise, responseCreatedPromise);
        const committedChat = await this._waitForSessionInCache(committedResource);
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        this._clearCurrentNewSessionIfMatch(newChatSession);
        this._sessionGroupCache.delete(sessionId);
        this._onDidGroupMembershipChange.fire({ sessionId });
        const updatedSession = this._chatToSession(committedChat);
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
        return updatedSession;
      } catch (error) {
        this._clearCurrentNewSessionIfMatch(
          newChatSession,
          /* leak */
          true
        );
        if (error instanceof CancellationError) {
          newChatSession.setStatus(SessionStatus.Completed);
          this._sessionGroupCache.delete(sessionId);
          const updatedSession = this._chatToSession(newChatSession);
          this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
          return updatedSession;
        }
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        this._sessionGroupCache.delete(sessionId);
        newChatSession.dispose();
        const parentChatIds = this._getChatIdsInGroup(sessionId);
        const parentChatId = parentChatIds[0];
        const parentChat = parentChatId ? this._sessionCache.get(this._localIdFromchatId(parentChatId)) : void 0;
        if (parentChat) {
          this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(parentChat)] });
        }
        throw error;
      }
    } finally {
      ref.dispose();
    }
  }
  /**
   * Waits for the committed (real) URI for a session by listening to the
   * {@link IChatSessionsService.onDidCommitSession} event.
   *
   * By default the wait is bounded by response completion: if the response
   * finishes before the commit event, we fall through to a short safety
   * timeout. Cloud sessions instead pass {@link IWaitForCommitOptions.deferred}
   * because their commit is delayed by a confirmation round-trip and network
   * delegation — response completion fires early (at the confirmation) and is
   * not a signal that the commit won't come — so they skip the response race
   * and use a longer timeout.
   */
  async _waitForCommittedSession(untitledResource, responseCompletePromise, responseCreatedPromise, options) {
    const timeoutMs = options?.deferred ? 5 * 6e4 : 5e3;
    const disposables = new DisposableStore();
    try {
      const commitPromise = new Promise((resolve) => {
        disposables.add(this.chatSessionsService.onDidCommitSession((e) => {
          if (isEqual(e.original, untitledResource)) {
            resolve(e.committed);
          }
        }));
      });
      if (!options?.deferred && responseCompletePromise) {
        const committed = await Promise.race([
          commitPromise.then((uri) => ({ committed: true, uri })),
          responseCompletePromise.then(() => ({ committed: false }))
        ]);
        if (committed.committed) {
          return committed.uri;
        }
      }
      const candidates = [
        raceTimeout(commitPromise, timeoutMs).then((uri) => uri ? { kind: "commit", uri } : { kind: "timeout" })
      ];
      if (responseCreatedPromise) {
        candidates.push(responseCreatedPromise.then((r) => r?.isCanceled ? { kind: "cancelled" } : new Promise(() => {
        })));
      }
      const outcome = await Promise.race(candidates);
      if (outcome.kind === "commit") {
        return outcome.uri;
      }
      if (outcome.kind === "cancelled") {
        throw new CancellationError();
      }
      const response = responseCreatedPromise ? await responseCreatedPromise : void 0;
      if (response?.isCanceled) {
        throw new CancellationError();
      }
      throw new Error("Timed out waiting for session commit");
    } finally {
      disposables.dispose();
    }
  }
  /**
   * Waits for an {@link AgentSessionAdapter} with the given resource to appear
   * in the session cache (populated by {@link _refreshSessionCache}).
   * Only called once during session initialisation (after the commit event),
   * so the timeout has no performance impact on steady-state operations.
   */
  async _waitForSessionInCache(resource, token) {
    const key = resource.toString();
    const existing = this._sessionCache.get(key);
    if (existing instanceof AgentSessionAdapter) {
      return existing;
    }
    const disposables = new DisposableStore();
    try {
      const sessionPromise = new Promise((resolve) => {
        disposables.add(this.onDidChangeSessions((e) => {
          const cached = this._sessionCache.get(key);
          if (cached instanceof AgentSessionAdapter) {
            resolve(cached);
          }
        }));
      });
      const result = await raceTimeout(
        token ? raceCancellationError(sessionPromise, token) : sessionPromise,
        3e4
      );
      if (!result) {
        throw new Error("Timed out waiting for committed session in cache");
      }
      return result;
    } finally {
      disposables.dispose();
    }
  }
  // -- Private --
  async _browseForRepo() {
    const repoId = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
    if (repoId) {
      const uri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: "github", path: `/${repoId}/HEAD` });
      const folder = {
        root: uri,
        workingDirectory: uri,
        name: basename(uri),
        description: void 0,
        gitRepository: void 0
      };
      return {
        uri,
        label: this._labelFromUri(uri),
        icon: this._iconFromUri(uri),
        group: SESSION_WORKSPACE_GROUP_GITHUB,
        folders: [folder],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: true
      };
    }
    return void 0;
  }
  resolveWorkspace(uri) {
    if (uri.scheme !== Schemas.file && uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
      return void 0;
    }
    const folder = {
      root: uri,
      workingDirectory: uri,
      name: basename(uri),
      description: void 0,
      gitRepository: void 0
    };
    return {
      uri,
      label: this._labelFromUri(uri),
      description: this._descriptionFromUri(uri),
      group: uri.scheme === GITHUB_REMOTE_FILE_SCHEME ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
      icon: this._iconFromUri(uri),
      folders: [folder],
      requiresWorkspaceTrust: uri.scheme !== GITHUB_REMOTE_FILE_SCHEME,
      isVirtualWorkspace: uri.scheme === GITHUB_REMOTE_FILE_SCHEME
    };
  }
  _labelFromUri(uri) {
    return githubRemoteRepoLabel(uri) ?? basename(uri);
  }
  _descriptionFromUri(uri) {
    if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      const parts = uri.path.substring(1).split("/");
      return parts.length >= 2 ? parts[0] : void 0;
    }
    return this.labelService.getUriLabel(dirname(uri), { relative: false });
  }
  _iconFromUri(uri) {
    if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      return Codicon.repo;
    }
    return Codicon.folder;
  }
  _ensureSessionCache() {
    if (this._sessionCache.size > 0) {
      return;
    }
    this._refreshSessionCache();
  }
  _invalidateGroupingCaches() {
    this._chatByRawSessionIdCache = void 0;
    this._groupIdByChatIdCache = void 0;
    this._chatIdsByGroupIdCache = void 0;
  }
  _ensureGroupingCaches() {
    if (this._chatByRawSessionIdCache && this._groupIdByChatIdCache && this._chatIdsByGroupIdCache) {
      return;
    }
    const chats = Array.from(this._sessionCache.values());
    const chatByRawSessionId = /* @__PURE__ */ new Map();
    for (const chat of chats) {
      chatByRawSessionId.set(chat.resource.path.slice(1), chat);
    }
    const groupIdByChatId = /* @__PURE__ */ new Map();
    const chatsByGroupId = /* @__PURE__ */ new Map();
    const resolveGroupId = (chat) => {
      const cachedGroupId = groupIdByChatId.get(chat.sessionId);
      if (cachedGroupId) {
        return cachedGroupId;
      }
      const trail = [];
      const seen = /* @__PURE__ */ new Set();
      let current = chat;
      for (let depth = 0; depth < 100; depth++) {
        const currentCachedGroupId = groupIdByChatId.get(current.sessionId);
        if (currentCachedGroupId) {
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, currentCachedGroupId);
          }
          return currentCachedGroupId;
        }
        if (seen.has(current.sessionId)) {
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, current.sessionId);
          }
          return current.sessionId;
        }
        trail.push(current);
        seen.add(current.sessionId);
        const parentRawSessionId = this._getDirectParentRawSessionId(current);
        if (!parentRawSessionId) {
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, current.sessionId);
          }
          return current.sessionId;
        }
        const parentChat = chatByRawSessionId.get(parentRawSessionId);
        if (!parentChat) {
          const syntheticGroupId = this._getSyntheticGroupId(parentRawSessionId);
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, syntheticGroupId);
          }
          return syntheticGroupId;
        }
        current = parentChat;
      }
      groupIdByChatId.set(chat.sessionId, chat.sessionId);
      return chat.sessionId;
    };
    for (const chat of chats) {
      const groupId = resolveGroupId(chat);
      const groupChats = chatsByGroupId.get(groupId) ?? [];
      groupChats.push(chat);
      chatsByGroupId.set(groupId, groupChats);
    }
    const chatIdsByGroupId = /* @__PURE__ */ new Map();
    for (const [groupId, groupChats] of chatsByGroupId) {
      groupChats.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      chatIdsByGroupId.set(groupId, groupChats.map((chat) => chat.sessionId));
    }
    this._chatByRawSessionIdCache = chatByRawSessionId;
    this._groupIdByChatIdCache = groupIdByChatId;
    this._chatIdsByGroupIdCache = chatIdsByGroupId;
  }
  /**
   * Cleans up a temp session (one that hasn't been committed) from the cache.
   * Used when delete/archive is invoked on a session that is still pending
   * commit (e.g. was stopped before the agent created a worktree).
   */
  _cleanupTempSession(sessionId) {
    const chatSession = this._findChatSession(sessionId);
    if (!chatSession) {
      return;
    }
    const key = chatSession.resource.toString();
    this._sessionCache.delete(key);
    this._invalidateGroupingCaches();
    this._sessionGroupCache.delete(chatSession.sessionId);
    if (this._newSessions.has(chatSession.sessionId)) {
      this._newSessions.deleteAndLeak(chatSession.sessionId);
    }
    const removedSession = this._chatToSession(chatSession);
    this._sessionGroupCache.delete(chatSession.sessionId);
    this._onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
    if (isNewSession(chatSession)) {
      chatSession.dispose();
    }
  }
  _refreshSessionCache() {
    const currentKeys = /* @__PURE__ */ new Set();
    const addedData = [];
    const changedData = [];
    const sessionsToMarkUnread = [];
    let cacheChanged = false;
    for (const session of this.agentSessionsService.model.sessions) {
      if (session.providerType !== AgentSessionProviders.Background && session.providerType !== AgentSessionProviders.Cloud) {
        continue;
      }
      const key = session.resource.toString();
      currentKeys.add(key);
      const existing = this._sessionCache.get(key);
      if (existing) {
        const previousStatus = existing.status.get();
        if (existing.update(session)) {
          changedData.push(existing);
        }
        const currentStatus = existing.status.get();
        if (previousStatus === SessionStatus.InProgress && currentStatus !== SessionStatus.InProgress && currentStatus !== SessionStatus.Untitled && existing.isRead.get()) {
          sessionsToMarkUnread.push(session);
        }
      } else {
        const adapter = new AgentSessionAdapter(session, this.id, this.gitHubService, this.pullRequestIconCache);
        this._sessionCache.set(key, adapter);
        addedData.push(adapter);
        cacheChanged = true;
      }
    }
    const removedData = [];
    for (const [key, adapter] of this._sessionCache) {
      if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter && !this._inFlightCommits.has(key)) {
        removedData.push(adapter);
        cacheChanged = true;
      }
    }
    let removedGroupIds;
    if (removedData.length > 0 && this._isMultiChatEnabled()) {
      removedGroupIds = /* @__PURE__ */ new Map();
      for (const removed of removedData) {
        removedGroupIds.set(removed, this._getGroupIdForChat(removed));
      }
    }
    for (const removed of removedData) {
      this._sessionCache.delete(removed.resource.toString());
    }
    if (cacheChanged) {
      this._invalidateGroupingCaches();
    }
    if (addedData.length > 0 || removedData.length > 0 || changedData.length > 0) {
      if (this._isMultiChatEnabled()) {
        this._refreshSessionCacheMultiChat(addedData, removedData, changedData, removedGroupIds);
      } else {
        this._onDidChangeSessions.fire({
          added: addedData.map((d) => this._chatToSession(d)),
          removed: removedData.map((d) => this._chatToSession(d)),
          changed: changedData.map((d) => this._chatToSession(d))
        });
      }
    }
    for (const session of sessionsToMarkUnread) {
      session.setRead(false);
    }
  }
  _refreshSessionCacheMultiChat(addedData, removedData, changedData, removedGroupIds) {
    const trulyRemovedSessions = [];
    const changedSessionIds = /* @__PURE__ */ new Set();
    for (const removed of removedData) {
      const sessionId = removedGroupIds.get(removed);
      const remainingChatIds = this._getChatIdsInGroup(sessionId);
      if (remainingChatIds.length > 0) {
        this._sessionGroupCache.delete(sessionId);
        this._onDidGroupMembershipChange.fire({ sessionId });
        if (!changedSessionIds.has(sessionId)) {
          changedSessionIds.add(sessionId);
          const primaryChat = this._sessionCache.get(this._localIdFromchatId(remainingChatIds[0]));
          if (primaryChat) {
            changedData.push(primaryChat);
          }
        }
      } else {
        this._sessionGroupCache.delete(sessionId);
        trulyRemovedSessions.push({ chat: removed, groupId: sessionId });
      }
    }
    const newSessions = [];
    for (const added of addedData) {
      const groupId = this._getGroupIdForChat(added);
      const groupChatIds = this._getChatIdsInGroup(groupId);
      if (groupChatIds.length > 1) {
        this._sessionGroupCache.delete(groupId);
        this._onDidGroupMembershipChange.fire({ sessionId: groupId });
        if (!changedSessionIds.has(groupId)) {
          changedSessionIds.add(groupId);
          changedData.push(added);
        }
      } else {
        newSessions.push(added);
      }
    }
    const seenChanged = /* @__PURE__ */ new Set();
    const deduplicatedChanged = [];
    for (const d of changedData) {
      const groupId = this._getGroupIdForChat(d);
      if (!seenChanged.has(groupId)) {
        seenChanged.add(groupId);
        deduplicatedChanged.push(d);
      }
    }
    this._onDidChangeSessions.fire({
      added: newSessions.map((d) => this._chatToSession(d)),
      removed: trulyRemovedSessions.map(({ chat, groupId }) => {
        const session = this._sessionGroupCache.get(groupId);
        this._sessionGroupCache.delete(groupId);
        return session ?? this._chatToSession(chat);
      }),
      changed: deduplicatedChanged.map((d) => this._chatToSession(d))
    });
  }
  _findChatSession(chatId) {
    const directMatch = this._sessionCache.get(this._localIdFromchatId(chatId));
    if (directMatch) {
      return directMatch;
    }
    const groupChatIds = this._getChatIdsInGroup(chatId);
    const firstChatId = groupChatIds[0];
    return firstChatId ? this._sessionCache.get(this._localIdFromchatId(firstChatId)) : void 0;
  }
  _findAgentSession(chatId) {
    const adapter = this._findChatSession(chatId);
    if (!adapter) {
      return void 0;
    }
    return this.agentSessionsService.getSession(adapter.resource);
  }
  /**
   * Returns the group ID for a given chat.
   * Grouping is derived from `sessionParentId` in metadata (for committed sessions)
   * or from `PARENT_SESSION_OPTION_ID` in selected options (for uncommitted sessions).
   * If the root chat is not loaded, a synthetic provider-scoped group ID is used.
   */
  _getGroupIdForChat(chat) {
    this._ensureGroupingCaches();
    return this._groupIdByChatIdCache?.get(chat.sessionId) ?? chat.sessionId;
  }
  /**
   * Returns all chat IDs that belong to the given group,
   * ordered by creation time (root session first).
   */
  _getChatIdsInGroup(groupId) {
    this._ensureGroupingCaches();
    return this._chatIdsByGroupIdCache?.get(groupId) ?? [];
  }
  _getDirectParentRawSessionId(chat) {
    const agentSession = this.agentSessionsService.getSession(chat.resource);
    const sessionParentId = agentSession?.metadata?.sessionParentId;
    if (typeof sessionParentId === "string" && sessionParentId.length > 0) {
      return sessionParentId;
    }
    if (isNewSession(chat)) {
      const parentOption = chat.selectedOptions.get(PARENT_SESSION_OPTION_ID);
      if (parentOption?.id) {
        return parentOption.id;
      }
    }
    return void 0;
  }
  _getSyntheticGroupId(rawSessionId) {
    return `${this.id}:group:${rawSessionId}`;
  }
  _findSession(sessionId) {
    return this._sessionGroupCache.get(sessionId);
  }
  _localIdFromchatId(chatId) {
    const prefix = `${this.id}:`;
    return chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
  }
  /**
   * Get (creating on first use) the membership signal for a group, keyed by
   * `sessionId`. The group's chats observable observes this signal so a membership
   * change recomputes only the affected group; the single fan-out subscription in
   * `_groupMembershipSubscription` triggers it.
   */
  _getGroupMembershipSignal(sessionId) {
    let signal = this._groupMembershipSignals.get(sessionId);
    if (!signal) {
      signal = observableSignal(this);
      this._groupMembershipSignals.set(sessionId, signal);
    }
    return signal;
  }
  /**
   * Structural equality for a group's chat list keyed on each chat's resource.
   * `_toChat` returns a fresh wrapper on every recompute, so identity comparison
   * would always differ; comparing resources lets a recompute that produced the
   * same set of chats avoid propagating downstream. Uses the URI identity comparer
   * so scheme-specific path casing and normalization are handled consistently.
   */
  _chatArraysEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b || a.length !== b.length) {
      return false;
    }
    return a.every((chat, i) => this.uriIdentityService.extUri.isEqual(chat.resource, b[i].resource));
  }
  /**
   * Wraps a primary {@link ICopilotChatSession} and its sibling chats into an {@link ISession}.
   * When multi-chat is enabled, the `chats` observable is derived from `sessionParentId`
   * metadata and updates when group membership changes.
   * When disabled, each session has exactly one chat.
   */
  _chatToSession(chat) {
    if (!this._isMultiChatEnabled()) {
      return this._chatToSingleChatSession(chat);
    }
    const sessionId = this._getGroupIdForChat(chat);
    const cached = this._sessionGroupCache.get(sessionId);
    if (cached) {
      return cached;
    }
    const mainChatIds = this._getChatIdsInGroup(sessionId);
    const firstChatId = mainChatIds[0];
    const primaryChat = firstChatId ? this._sessionCache.get(this._localIdFromchatId(firstChatId)) ?? chat : chat;
    const mainChat = primaryChat.mainChat;
    const membershipSignal = this._getGroupMembershipSignal(sessionId);
    const groupChatsObs = derivedOpts({
      owner: this,
      equalsFn: (a, b) => this._chatArraysEqual(a, b)
    }, (reader) => {
      membershipSignal.read(reader);
      const chatIds = this._getChatIdsInGroup(sessionId);
      if (chatIds.length === 0) {
        return void 0;
      }
      const resolved = [];
      for (const id of chatIds) {
        const c = this._sessionCache.get(this._localIdFromchatId(id));
        if (c) {
          resolved.push(c);
        }
      }
      if (resolved.length === 0) {
        return void 0;
      }
      return resolved.map((c) => this._toChat(c));
    });
    const chatsObs = derived((reader) => {
      const groupChats = groupChatsObs.read(reader);
      return groupChats ?? [mainChat.read(reader)];
    });
    const session = {
      sessionId,
      resource: primaryChat.resource,
      providerId: primaryChat.providerId,
      sessionType: primaryChat.sessionType,
      icon: primaryChat.icon,
      createdAt: primaryChat.createdAt,
      workspace: primaryChat.workspace,
      hasGitRepository: primaryChat.hasGitRepository,
      title: primaryChat.title,
      updatedAt: chatsObs.map((chats, reader) => this._latestDate(chats, (c) => c.updatedAt.read(reader))),
      status: chatsObs.map((chats, reader) => this._aggregateStatus(chats, reader)),
      changesets: this._createChangesets(primaryChat.sessionType, primaryChat.workspace, chatsObs),
      changes: primaryChat.changes,
      modelId: primaryChat.modelId,
      mode: primaryChat.mode,
      loading: primaryChat.loading,
      isArchived: primaryChat.isArchived,
      isRead: chatsObs.map((chats, reader) => chats.every((c) => c.isRead.read(reader))),
      description: primaryChat.description,
      lastTurnEnd: chatsObs.map((chats, reader) => this._latestDate(chats, (c) => c.lastTurnEnd.read(reader))),
      chats: chatsObs,
      mainChat,
      capabilities: constObservable({
        supportsMultipleChats: primaryChat.sessionType === CopilotCLISessionType.id && this._isMultiChatEnabled(),
        supportsRename: this._sessionTypeSupportsRename(primaryChat.sessionType),
        supportsDelete: this._sessionTypeSupportsDelete(primaryChat.sessionType),
        // Cloud-agent sessions run worktreeCreated tasks server-side during
        // environment provisioning, so the agents-window dispatcher must
        // not re-run them. Other session types don't.
        runsWorktreeCreatedTasks: primaryChat.sessionType === CopilotCloudSessionType.id
      })
    };
    this._sessionGroupCache.set(sessionId, session);
    return session;
  }
  _chatToSingleChatSession(chat) {
    const mainChat = chat.mainChat;
    const chatsObs = mainChat.map((c) => [c]);
    const changesets = this._createChangesets(chat.sessionType, chat.workspace, chatsObs);
    return {
      sessionId: chat.sessionId,
      resource: chat.resource,
      providerId: chat.providerId,
      sessionType: chat.sessionType,
      icon: chat.icon,
      createdAt: chat.createdAt,
      workspace: chat.workspace,
      hasGitRepository: chat.hasGitRepository,
      title: chat.title,
      updatedAt: chat.updatedAt,
      status: chat.status,
      changesets,
      changes: chat.changes,
      modelId: chat.modelId,
      mode: chat.mode,
      loading: chat.loading,
      isArchived: chat.isArchived,
      isRead: chat.isRead,
      description: chat.description,
      lastTurnEnd: chat.lastTurnEnd,
      chats: chatsObs,
      mainChat,
      capabilities: constObservable({
        supportsMultipleChats: false,
        supportsRename: this._sessionTypeSupportsRename(chat.sessionType),
        supportsDelete: this._sessionTypeSupportsDelete(chat.sessionType),
        runsWorktreeCreatedTasks: chat.sessionType === CopilotCloudSessionType.id
      })
    };
  }
  /**
   * Whether {@link renameChat} can rename a session of the given type. Only
   * the CopilotCLI backend exposes a rename command; others throw.
   */
  _sessionTypeSupportsRename(sessionType) {
    return sessionType === CopilotCLISessionType.id;
  }
  _sessionTypeSupportsDelete(sessionType) {
    return sessionType === CopilotCLISessionType.id;
  }
  _toChat(chat, resource, interactivity = ChatInteractivity.Full) {
    return {
      resource: resource ?? chat.resource,
      createdAt: chat.createdAt,
      title: chat.title,
      updatedAt: chat.updatedAt,
      status: chat.status,
      changes: chat.changes,
      checkpoints: chat.checkpoints,
      modelId: chat.modelId,
      mode: chat.mode,
      isArchived: chat.isArchived,
      isRead: chat.isRead,
      interactivity: constObservable(interactivity),
      description: chat.description,
      lastTurnEnd: chat.lastTurnEnd
    };
  }
  _createChangesets(sessionType, workspaceObs, chatsObs) {
    return createChangesets(sessionType, workspaceObs, chatsObs, this.instantiationService);
  }
  _latestDate(chats, getter) {
    let latest;
    for (const chat of chats) {
      const d = getter(chat);
      if (d && (!latest || d > latest)) {
        latest = d;
      }
    }
    return latest;
  }
  _aggregateStatus(chats, reader) {
    for (const c of chats) {
      if (c.status.read(reader) === SessionStatus.NeedsInput) {
        return SessionStatus.NeedsInput;
      }
    }
    for (const c of chats) {
      if (c.status.read(reader) === SessionStatus.InProgress) {
        return SessionStatus.InProgress;
      }
    }
    return chats[0].status.read(reader);
  }
  _isMultiChatEnabled() {
    return this._multiChatEnabled;
  }
};
CopilotChatSessionsProvider = __decorateClass([
  __decorateParam(0, IAgentSessionsService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILanguageModelsService),
  __decorateParam(7, ILanguageModelToolsService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IAgentHostEnablementService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IGitHubService),
  __decorateParam(12, IPullRequestIconCache),
  __decorateParam(13, ILabelService),
  __decorateParam(14, IChatModeService),
  __decorateParam(15, IUriIdentityService)
], CopilotChatSessionsProvider);
export {
  COPILOT_MULTI_CHAT_SETTING,
  COPILOT_PROVIDER_ID,
  CopilotChatSessionsProvider,
  CopilotCloudSessionType,
  RemoteNewSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxjb3BpbG90Q2hhdFNlc3Npb25zXFxicm93c2VyXFxjb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb25FcnJvciwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZywgbWFya2Rvd25TdHJpbmdFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVNpZ25hbCwgSVJlYWRlciwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlRnJvbVByb21pc2UsIG9ic2VydmFibGVTaWduYWwsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgcnVuT25DaGFuZ2UsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdFVyaSwgSUFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRSZXBvc2l0b3J5TmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0sIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgSUNoYXQsIElTZXNzaW9uR2l0UmVwb3NpdG9yeSwgSVNlc3Npb25Gb2xkZXIsIElTZXNzaW9uV29ya3NwYWNlLCBJU2lkZUNoYXRTZWxlY3Rpb24sIFNlc3Npb25TdGF0dXMsIEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIElHaXRIdWJJbmZvLCBJU2Vzc2lvblR5cGUsIElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsLCBnaXRIdWJJbmZvRXF1YWwsIHNlc3Npb25Xb3Jrc3BhY2VFcXVhbCwgdG9TZXNzaW9uSWQsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsIElTZXNzaW9uQ2hhbmdlc2V0LCBJQ2hhdENoZWNrcG9pbnRzLCBDaGF0SW50ZXJhY3Rpdml0eSwgU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCwgaXNDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElEZWxldGVDaGF0T3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsIElTZXNzaW9uTW9kZWxzU25hcHNob3QsIElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25PcHRpb25Hcm91cCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9uZXdTZXNzaW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlLCBpc0J1aWx0aW5DaGF0TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBnZXRSZWdpc3RlcmVkTGFuZ3VhZ2VNb2RlbHMsIHJlc29sdmVNb2RlbElkZW50aWZpZXIsIHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tTGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJR2l0U2VydmljZSwgSUdpdFJlcG9zaXRvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL2dpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUHVsbFJlcXVlc3RJY29uLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU2Vzc2lvblB1bGxSZXF1ZXN0SWNvbiB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL3B1bGxSZXF1ZXN0SWNvblN0YXR1cy5qcyc7XG5pbXBvcnQgeyBJUHVsbFJlcXVlc3RJY29uQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9wdWxsUmVxdWVzdEljb25DYWNoZS5qcyc7XG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IENvcGlsb3RDTElTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2FnZW50SG9zdC9icm93c2VyL2Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNoYW5nZXNldHMgfSBmcm9tICcuL2NvcGlsb3RDaGF0U2Vzc2lvbnNDaGFuZ2VzZXRzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5cbi8qKiBDb3BpbG90IENsb3VkIHNlc3Npb24gdHlwZSAtIGNsb3VkLWhvc3RlZCBhZ2VudC4gKi9cbmV4cG9ydCBjb25zdCBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlID0ge1xuXHRpZDogJ2NvcGlsb3QtY2xvdWQtYWdlbnQnLFxuXHRsYWJlbDogbG9jYWxpemUoJ2NvcGlsb3RDbG91ZCcsIFwiQ2xvdWRcIiksXG5cdGljb246IENvZGljb24uY2xvdWQsXG5cdGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLFxufTtcblxuY29uc3QgU1RPUkFHRV9LRVlfSVNPTEFUSU9OX01PREUgPSAnc2Vzc2lvbnMuaXNvbGF0aW9uUGlja2VyLnNlbGVjdGVkTW9kZSc7XG5cbmV4cG9ydCB0eXBlIElzb2xhdGlvbk1vZGUgPSAnd29ya3RyZWUnIHwgJ3dvcmtzcGFjZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RDaGF0U2Vzc2lvbiB7XG5cdC8qKiBHbG9iYWxseSB1bmlxdWUgc2Vzc2lvbiBJRCAoYHByb3ZpZGVySWQ6bG9jYWxJZGApLiAqL1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIFJlc291cmNlIFVSSSBpZGVudGlmeWluZyB0aGlzIHNlc3Npb24uICovXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdC8qKiBJRCBvZiB0aGUgcHJvdmlkZXIgdGhhdCBvd25zIHRoaXMgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHQvKiogU2Vzc2lvbiB0eXBlIElEIChlLmcuLCAnY29waWxvdC1jbGknLCAnY29waWxvdC1jbG91ZCcsICdsb2NhbCcpLiAqL1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZTogdHlwZW9mIFNlc3Npb25UeXBlW2tleW9mIHR5cGVvZiBTZXNzaW9uVHlwZV0gfCBzdHJpbmc7XG5cdC8qKiBJY29uIGZvciB0aGlzIHNlc3Npb24uICovXG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0LyoqIFdoZW4gdGhlIHNlc3Npb24gd2FzIGNyZWF0ZWQuICovXG5cdHJlYWRvbmx5IGNyZWF0ZWRBdDogRGF0ZTtcblx0LyoqIFdvcmtzcGFjZSB0aGlzIHNlc3Npb24gb3BlcmF0ZXMgb24uICovXG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+O1xuXG5cdC8vIFJlYWN0aXZlIHByb3BlcnRpZXNcblxuXHQvKiogU2Vzc2lvbiBkaXNwbGF5IHRpdGxlIChjaGFuZ2VzIHdoZW4gYXV0by10aXRsZWQgb3IgcmVuYW1lZCkuICovXG5cdHJlYWRvbmx5IHRpdGxlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHQvKiogV2hlbiB0aGUgc2Vzc2lvbiB3YXMgbGFzdCB1cGRhdGVkLiAqL1xuXHRyZWFkb25seSB1cGRhdGVkQXQ6IElPYnNlcnZhYmxlPERhdGU+O1xuXHQvKiogQ3VycmVudCBzZXNzaW9uIHN0YXR1cy4gKi9cblx0cmVhZG9ubHkgc3RhdHVzOiBJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdHVzPjtcblx0LyoqIEZpbGUgY2hhbmdlcyBwcm9kdWNlZCBieSB0aGUgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgY2hhbmdlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+O1xuXHQvKiogQ3VycmVudGx5IHNlbGVjdGVkIG1vZGVsIGlkZW50aWZpZXIuICovXG5cdHJlYWRvbmx5IG1vZGVsSWQ6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdC8qKiBDdXJyZW50bHkgc2VsZWN0ZWQgbW9kZSBpZGVudGlmaWVyIGFuZCBraW5kLiAqL1xuXHRyZWFkb25seSBtb2RlOiBJT2JzZXJ2YWJsZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPjtcblx0LyoqIFdoZXRoZXIgdGhlIHNlc3Npb24gaXMgc3RpbGwgaW5pdGlhbGl6aW5nIChlLmcuLCByZXNvbHZpbmcgZ2l0IHJlcG9zaXRvcnkpLiAqL1xuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFdoZXRoZXIgdGhlIHNlc3Npb24ncyByZXBvc2l0b3J5IHN1cHBvcnRzIHdvcmt0cmVlLWJhY2tlZCBvcGVyYXRpb25zLiAqL1xuXHRyZWFkb25seSBoYXNHaXRSZXBvc2l0b3J5PzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKiBXaGV0aGVyIHRoZSBzZXNzaW9uIGlzIGFyY2hpdmVkLiAqL1xuXHRyZWFkb25seSBpc0FyY2hpdmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFdoZXRoZXIgdGhlIHNlc3Npb24gaGFzIGJlZW4gcmVhZC4gKi9cblx0cmVhZG9ubHkgaXNSZWFkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFN0YXR1cyBkZXNjcmlwdGlvbiBzaG93biB3aGlsZSB0aGUgc2Vzc2lvbiBpcyBhY3RpdmUgKGUuZy4sIGN1cnJlbnQgYWdlbnQgYWN0aW9uKS4gKi9cblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD47XG5cdC8qKiBUaW1lc3RhbXAgb2Ygd2hlbiB0aGUgbGFzdCBhZ2VudCB0dXJuIGVuZGVkLCBpZiBhbnkuICovXG5cdHJlYWRvbmx5IGxhc3RUdXJuRW5kOiBJT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPjtcblx0LyoqIEdpdEh1YiBpbmZvcm1hdGlvbiBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLCBpZiBhbnkuICovXG5cdHJlYWRvbmx5IGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPjtcblx0LyoqIENoZWNrcG9pbnRzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24sIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgY2hlY2twb2ludHM6IElPYnNlcnZhYmxlPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD47XG5cdHNldFBlcm1pc3Npb25MZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IHZvaWQ7XG5cblx0cmVhZG9ubHkgYnJhbmNoOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRzZXRCcmFuY2goYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdHJlYWRvbmx5IGlzb2xhdGlvbk1vZGU6IElPYnNlcnZhYmxlPElzb2xhdGlvbk1vZGUgfCB1bmRlZmluZWQ+O1xuXHRzZXRJc29sYXRpb25Nb2RlKG1vZGU6IElzb2xhdGlvbk1vZGUpOiB2b2lkO1xuXG5cdHNldE1vZGVsSWQobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0c2V0TW9kZShjaGF0TW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0c2V0T3B0aW9uPyhvcHRpb25JZDogc3RyaW5nLCB2YWx1ZTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgc3RyaW5nKTogdm9pZDtcblxuXHRyZWFkb25seSBnaXRSZXBvc2l0b3J5PzogSUdpdFJlcG9zaXRvcnk7XG5cdHJlYWRvbmx5IGJyYW5jaGVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXT47XG5cblx0LyoqXG5cdCAqIFNldHRhYmxlIG9ic2VydmFibGUgaG9sZGluZyB0aGUge0BsaW5rIElDaGF0fSByZXByZXNlbnRhdGlvbiBvZiB0aGlzIGNoYXQuXG5cdCAqIEZvciBjb21taXR0ZWQgY2hhdHMsIHRoZSB2YWx1ZSBpcyBzdGFibGUuXG5cdCAqL1xuXHRyZWFkb25seSBtYWluQ2hhdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdD47XG59XG5cbmNvbnN0IE9QRU5fUkVQT19DT01NQU5EID0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQuY2xvdWRTZXNzaW9ucy5vcGVuUmVwb3NpdG9yeSc7XG5cbi8qKiBQcm92aWRlciBJRCBmb3IgdGhlIENvcGlsb3QgQ2hhdCBTZXNzaW9ucyBwcm92aWRlci4gKi9cbmV4cG9ydCBjb25zdCBDT1BJTE9UX1BST1ZJREVSX0lEID0gJ2RlZmF1bHQtY29waWxvdCc7XG5cbi8qKiBTZXR0aW5nIGtleSBjb250cm9sbGluZyB3aGV0aGVyIHRoZSBDb3BpbG90IHByb3ZpZGVyIHN1cHBvcnRzIG11bHRpcGxlIGNoYXRzIHBlciBzZXNzaW9uLiAqL1xuZXhwb3J0IGNvbnN0IENPUElMT1RfTVVMVElfQ0hBVF9TRVRUSU5HID0gJ3Nlc3Npb25zLmdpdGh1Yi5jb3BpbG90Lm11bHRpQ2hhdFNlc3Npb25zJztcblxuY29uc3QgUkVQT1NJVE9SWV9PUFRJT05fSUQgPSAncmVwb3NpdG9yeSc7XG5jb25zdCBQQVJFTlRfU0VTU0lPTl9PUFRJT05fSUQgPSAncGFyZW50U2Vzc2lvbklkJztcbmNvbnN0IEJSQU5DSF9PUFRJT05fSUQgPSAnYnJhbmNoJztcbmNvbnN0IElTT0xBVElPTl9PUFRJT05fSUQgPSAnaXNvbGF0aW9uJztcbmNvbnN0IEFHRU5UX09QVElPTl9JRCA9ICdhZ2VudCc7XG5cbnR5cGUgTmV3U2Vzc2lvbiA9IENvcGlsb3RDTElTZXNzaW9uIHwgUmVtb3RlTmV3U2Vzc2lvbjtcblxuZnVuY3Rpb24gaXNOZXdTZXNzaW9uKHNlc3Npb246IElDb3BpbG90Q2hhdFNlc3Npb24pOiBzZXNzaW9uIGlzIE5ld1Nlc3Npb24ge1xuXHRyZXR1cm4gc2Vzc2lvbiBpbnN0YW5jZW9mIENvcGlsb3RDTElTZXNzaW9uIHx8IHNlc3Npb24gaW5zdGFuY2VvZiBSZW1vdGVOZXdTZXNzaW9uO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhbiB7QGxpbmsgSUNoYXR9IHNuYXBzaG90IGZyb20gYW4ge0BsaW5rIElDb3BpbG90Q2hhdFNlc3Npb259LiBVc2VkIHRvXG4gKiBzZWVkIHRoZSBjaGF0J3Mgb3duIGBtYWluQ2hhdGAgb2JzZXJ2YWJsZS5cbiAqL1xuZnVuY3Rpb24gYnVpbGRDaGF0RnJvbVNlc3Npb24oY2hhdDogT21pdDxJQ29waWxvdENoYXRTZXNzaW9uLCAnbWFpbkNoYXQnPik6IElDaGF0IHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZTogY2hhdC5yZXNvdXJjZSxcblx0XHRjcmVhdGVkQXQ6IGNoYXQuY3JlYXRlZEF0LFxuXHRcdHRpdGxlOiBjaGF0LnRpdGxlLFxuXHRcdHVwZGF0ZWRBdDogY2hhdC51cGRhdGVkQXQsXG5cdFx0c3RhdHVzOiBjaGF0LnN0YXR1cyxcblx0XHRjaGFuZ2VzOiBjaGF0LmNoYW5nZXMsXG5cdFx0Y2hlY2twb2ludHM6IGNoYXQuY2hlY2twb2ludHMsXG5cdFx0bW9kZWxJZDogY2hhdC5tb2RlbElkLFxuXHRcdG1vZGU6IGNoYXQubW9kZSxcblx0XHRpc0FyY2hpdmVkOiBjaGF0LmlzQXJjaGl2ZWQsXG5cdFx0aXNSZWFkOiBjaGF0LmlzUmVhZCxcblx0XHRpbnRlcmFjdGl2aXR5OiBjb25zdE9ic2VydmFibGUoQ2hhdEludGVyYWN0aXZpdHkuRnVsbCksXG5cdFx0ZGVzY3JpcHRpb246IGNoYXQuZGVzY3JpcHRpb24sXG5cdFx0bGFzdFR1cm5FbmQ6IGNoYXQubGFzdFR1cm5FbmQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHNldElmQ2hhbmdlZDxUPihvYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFQ+LCB2YWx1ZTogVCwgdHg6IElUcmFuc2FjdGlvbiwgZXF1YWxzOiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbiA9IE9iamVjdC5pcyk6IGJvb2xlYW4ge1xuXHRpZiAoZXF1YWxzKG9ic2VydmFibGUuZ2V0KCksIHZhbHVlKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRvYnNlcnZhYmxlLnNldCh2YWx1ZSwgdHgsIHVuZGVmaW5lZCk7XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBkYXRlRXF1YWxzKGE6IERhdGUgfCB1bmRlZmluZWQsIGI6IERhdGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGE/LmdldFRpbWUoKSA9PT0gYj8uZ2V0VGltZSgpO1xufVxuXG5mdW5jdGlvbiBtYXJrZG93blN0cmluZ0VxdWFscyhhOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsIGI6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYSA9PT0gYiB8fCAhIWEgJiYgISFiICYmIG1hcmtkb3duU3RyaW5nRXF1YWwoYSwgYik7XG59XG5cbi8qKlxuICogTG9jYWwgbmV3IHNlc3Npb24gZm9yIEJhY2tncm91bmQgYWdlbnQgc2Vzc2lvbnMuXG4gKiBJbXBsZW1lbnRzIHtAbGluayBJQ29waWxvdENoYXRTZXNzaW9ufSAoc2Vzc2lvbiBmYWNhZGUpIGFuZCBwcm92aWRlc1xuICogcHJlLXNlbmQgY29uZmlndXJhdGlvbiBtZXRob2RzIGZvciB0aGUgbmV3LXNlc3Npb24gZmxvdy5cbiAqL1xuY2xhc3MgQ29waWxvdENMSVNlc3Npb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvcGlsb3RDaGF0U2Vzc2lvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENPUElMT1RfV09SS1RSRUVfUEFUVEVSTiA9ICdjb3BpbG90LXdvcmt0cmVlLSc7XG5cblx0Ly8gLS0gSVNlc3Npb25EYXRhIGZpZWxkcyAtLVxuXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiB0eXBlb2YgU2Vzc2lvblR5cGUuQ29waWxvdENMSTtcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBjcmVhdGVkQXQ6IERhdGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgJycpO1xuXHRyZWFkb25seSB0aXRsZTogSU9ic2VydmFibGU8c3RyaW5nPiA9IHRoaXMuX3RpdGxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rlc2NyaXB0aW9uOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBJT2JzZXJ2YWJsZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZWRBdCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBuZXcgRGF0ZSgpKTtcblx0cmVhZG9ubHkgdXBkYXRlZEF0OiBJT2JzZXJ2YWJsZTxEYXRlPiA9IHRoaXMuX3VwZGF0ZWRBdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdHJlYWRvbmx5IHN0YXR1czogSU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz4gPSB0aGlzLl9zdGF0dXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVybWlzc2lvbkxldmVsID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD4gPSB0aGlzLl9wZXJtaXNzaW9uTGV2ZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlRGF0YSA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4gPSB0aGlzLl93b3Jrc3BhY2VEYXRhO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyYW5jaE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBicmFuY2g6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9icmFuY2hPYnNlcnZhYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzb2xhdGlvbk1vZGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPElzb2xhdGlvbk1vZGUgfCB1bmRlZmluZWQ+KHRoaXMsICd3b3JrdHJlZScpO1xuXHRyZWFkb25seSBpc29sYXRpb25Nb2RlOiBJT2JzZXJ2YWJsZTxJc29sYXRpb25Nb2RlIHwgdW5kZWZpbmVkPiA9IHRoaXMuX2lzb2xhdGlvbk1vZGVPYnNlcnZhYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsSWRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbW9kZWxJZDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX21vZGVsSWRPYnNlcnZhYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IG1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+ID0gdGhpcy5fbW9kZU9ic2VydmFibGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZGluZyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0cnVlKTtcblx0cmVhZG9ubHkgbG9hZGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9sb2FkaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNHaXRSZXBvc2l0b3J5ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgaGFzR2l0UmVwb3NpdG9yeTogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9oYXNHaXRSZXBvc2l0b3J5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4+O1xuXHRyZWFkb25seSBjaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hlY2twb2ludHM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZU9wdHM8SUNoYXRDaGVja3BvaW50cyB8IHVuZGVmaW5lZD4+O1xuXHRyZWFkb25seSBjaGVja3BvaW50czogSU9ic2VydmFibGU8SUNoYXRDaGVja3BvaW50cyB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNBcmNoaXZlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faXNBcmNoaXZlZDtcblx0cmVhZG9ubHkgaXNSZWFkOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0cnVlKTtcblx0cmVhZG9ubHkgbGFzdFR1cm5FbmQ6IElPYnNlcnZhYmxlPERhdGUgfCB1bmRlZmluZWQ+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgX2dpdFJlcG9zaXRvcnk6IElHaXRSZXBvc2l0b3J5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkQnJhbmNoZXNDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXG5cdC8vIC0tIEJyYW5jaCBzdGF0ZSAtLVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyYW5jaGVzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IHN0cmluZ1tdPih0aGlzLCBbXSk7XG5cdHJlYWRvbmx5IGJyYW5jaGVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXT4gPSB0aGlzLl9icmFuY2hlcztcblxuXHRyZWFkb25seSBtYWluQ2hhdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdD47XG5cblx0cHJpdmF0ZSBfZGVmYXVsdEJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8vIC0tIE5ldyBzZXNzaW9uIGNvbmZpZ3VyYXRpb24gZmllbGRzIC0tXG5cblx0cHJpdmF0ZSBfcmVwb1VyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc29sYXRpb25Nb2RlOiBJc29sYXRpb25Nb2RlO1xuXHRwcml2YXRlIF9icmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3F1ZXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2F0dGFjaGVkQ29udGV4dDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHRhcmdldCA9IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kO1xuXHRyZWFkb25seSBzZWxlY3RlZE9wdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtPigpO1xuXG5cdGdldCBzZWxlY3RlZE1vZGVsSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX21vZGVsSWQ7IH1cblx0Z2V0IGNoYXRNb2RlKCk6IElDaGF0TW9kZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9tb2RlOyB9XG5cdGdldCBxdWVyeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcXVlcnk7IH1cblx0Z2V0IGF0dGFjaGVkQ29udGV4dCgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fYXR0YWNoZWRDb250ZXh0OyB9XG5cdGdldCBnaXRSZXBvc2l0b3J5KCk6IElHaXRSZXBvc2l0b3J5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2dpdFJlcG9zaXRvcnk7IH1cblx0Z2V0IGRpc2FibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fcmVwb1VyaSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc29sYXRpb25Nb2RlID09PSAnd29ya3RyZWUnICYmICF0aGlzLl9icmFuY2gpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IHNlc3Npb25Xb3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlLFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnaXRTZXJ2aWNlOiBJR2l0U2VydmljZSxcblx0XHRASUdpdEh1YlNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnaXRIdWJTZXJ2aWNlOiBJR2l0SHViU2VydmljZSxcblx0XHRASVB1bGxSZXF1ZXN0SWNvbkNhY2hlIHByaXZhdGUgcmVhZG9ubHkgcHVsbFJlcXVlc3RJY29uQ2FjaGU6IElQdWxsUmVxdWVzdEljb25DYWNoZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNlc3Npb25JZCA9IHRvU2Vzc2lvbklkKHByb3ZpZGVySWQsIHJlc291cmNlKTtcblx0XHR0aGlzLnByb3ZpZGVySWQgPSBwcm92aWRlcklkO1xuXHRcdHRoaXMuc2Vzc2lvblR5cGUgPSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZDtcblx0XHR0aGlzLmljb24gPSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWNvbjtcblx0XHR0aGlzLmNyZWF0ZWRBdCA9IG5ldyBEYXRlKCk7XG5cblx0XHRjb25zdCByZXBvVXJpID0gc2Vzc2lvbldvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGlmIChyZXBvVXJpKSB7XG5cdFx0XHR0aGlzLl9yZXBvVXJpID0gcmVwb1VyaTtcblx0XHRcdHRoaXMuc2V0T3B0aW9uKFJFUE9TSVRPUllfT1BUSU9OX0lELCByZXBvVXJpLmZzUGF0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IElTZXNzaW9uRGF0YSB3b3Jrc3BhY2Ugb2JzZXJ2YWJsZVxuXHRcdHRoaXMuX3dvcmtzcGFjZURhdGEuc2V0KHNlc3Npb25Xb3Jrc3BhY2UsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzdG9yZWRNb2RlID0gc3RvcmFnZVNlcnZpY2UuZ2V0KFNUT1JBR0VfS0VZX0lTT0xBVElPTl9NT0RFLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0Y29uc3QgaW5pdGlhbE1vZGU6IElzb2xhdGlvbk1vZGUgPSBzdG9yZWRNb2RlID09PSAnd29ya3NwYWNlJyA/ICd3b3Jrc3BhY2UnIDogJ3dvcmt0cmVlJztcblx0XHR0aGlzLl9pc29sYXRpb25Nb2RlID0gaW5pdGlhbE1vZGU7XG5cdFx0dGhpcy5faXNvbGF0aW9uTW9kZU9ic2VydmFibGUuc2V0KGluaXRpYWxNb2RlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuc2V0T3B0aW9uKElTT0xBVElPTl9PUFRJT05fSUQsIGluaXRpYWxNb2RlKTtcblxuXHRcdC8vIFJlc29sdmUgZ2l0IHJlcG9zaXRvcnkgYXN5bmNocm9ub3VzbHlcblx0XHR0aGlzLl9yZXNvbHZlR2l0UmVwb3NpdG9yeSgpO1xuXG5cdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gdGhpcy5fZGVzY3JpcHRpb247XG5cblxuXHRcdHRoaXMuX2NoYW5nZXMgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPih7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSwgW10pO1xuXHRcdHRoaXMuY2hhbmdlcyA9IHRoaXMuX2NoYW5nZXM7XG5cblx0XHR0aGlzLl9jaGVja3BvaW50cyA9IG9ic2VydmFibGVWYWx1ZU9wdHM8SUNoYXRDaGVja3BvaW50cyB8IHVuZGVmaW5lZD4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHMgfSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmNoZWNrcG9pbnRzID0gdGhpcy5fY2hlY2twb2ludHM7XG5cblx0XHR0aGlzLm1haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBidWlsZENoYXRGcm9tU2Vzc2lvbih0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlR2l0UmVwb3NpdG9yeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvVXJpID0gdGhpcy5zZXNzaW9uV29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0aWYgKHJlcG9VcmkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2dpdFJlcG9zaXRvcnkgPSBhd2FpdCB0aGlzLmdpdFNlcnZpY2Uub3BlblJlcG9zaXRvcnkocmVwb1VyaSk7XG5cdFx0XHRcdGlmICghdGhpcy5fZ2l0UmVwb3NpdG9yeSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuX2dpdFJlcG9zaXRvcnkuc3RhdGUuZ2V0KCkuSEVBRD8uY29tbWl0KSB7XG5cdFx0XHRcdFx0Ly8gRW1wdHkgcmVwb3NpdG9yaWVzIGhhdmUgbm8gSEVBRCBjb21taXQgYW5kIGNhbm5vdCBydW4gd29ya3RyZWUgaXNvbGF0aW9uLlxuXHRcdFx0XHRcdHRoaXMuc2V0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBObyBnaXQgcmVwb3NpdG9yeSBhdmFpbGFibGVcblx0XHRcdFx0dGhpcy5zZXRJc29sYXRpb25Nb2RlKCd3b3Jrc3BhY2UnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZ2l0UmVwb3NpdG9yeSA9IHRoaXMuX2dpdFJlcG9zaXRvcnk7XG5cdFx0aWYgKGdpdFJlcG9zaXRvcnkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0dGhpcy5faGFzR2l0UmVwb3NpdG9yeS5zZXQoISFnaXRSZXBvc2l0b3J5LnN0YXRlLnJlYWQocmVhZGVyKS5IRUFEPy5jb21taXQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9sb2FkQnJhbmNoZXMoZ2l0UmVwb3NpdG9yeSk7XG5cblx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgdXBkYXRlIHRoZSBzZWxlY3RlZCBicmFuY2ggd2hlbiB0aGUgcmVwb3NpdG9yeVxuXHRcdFx0Ly8gc3RhdGUgY2hhbmdlcy4gVGhpcyBpcyBkb25lIG9ubHkgZm9yIHRoZSBGb2xkZXIgc2Vzc2lvbnMuXG5cdFx0XHRjb25zdCBjdXJyZW50QnJhbmNoTmFtZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBnaXRSZXBvc2l0b3J5LnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlPy5IRUFEPy5jb21taXQgPyBzdGF0ZS5IRUFELm5hbWUgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBpc29sYXRpb25Nb2RlID0gdGhpcy5pc29sYXRpb25Nb2RlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGlzb2xhdGlvbk1vZGUgPT09ICd3b3JrdHJlZScpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdXJyZW50QnJhbmNoID0gY3VycmVudEJyYW5jaE5hbWUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLnNldEJyYW5jaChjdXJyZW50QnJhbmNoID8/IHRoaXMuX2RlZmF1bHRCcmFuY2gpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2FkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRCcmFuY2hlcyhyZXBvOiBJR2l0UmVwb3NpdG9yeSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvYWRCcmFuY2hlc0N0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5fbG9hZEJyYW5jaGVzQ3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRyZXBvLmdldFJlZnMoeyBwYXR0ZXJuOiAncmVmcy9oZWFkcycgfSwgY3RzLnRva2VuKS50aGVuKHJlZnMgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoYXNIZWFkQ29tbWl0ID0gISFyZXBvLnN0YXRlLmdldCgpLkhFQUQ/LmNvbW1pdDtcblx0XHRcdGNvbnN0IGJyYW5jaGVzID0gcmVmc1xuXHRcdFx0XHQubWFwKHIgPT4gci5uYW1lKVxuXHRcdFx0XHQuZmlsdGVyKChuYW1lKTogbmFtZSBpcyBzdHJpbmcgPT4gISFuYW1lKVxuXHRcdFx0XHQuZmlsdGVyKG5hbWUgPT4gIW5hbWUuaW5jbHVkZXMoQ29waWxvdENMSVNlc3Npb24uQ09QSUxPVF9XT1JLVFJFRV9QQVRURVJOKSk7XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRCcmFuY2ggPSBoYXNIZWFkQ29tbWl0XG5cdFx0XHRcdD8gKGJyYW5jaGVzLmZpbmQoYiA9PiBiID09PSAnbWFpbicpXG5cdFx0XHRcdFx0Pz8gYnJhbmNoZXMuZmluZChiID0+IGIgPT09ICdtYXN0ZXInKVxuXHRcdFx0XHRcdD8/IGJyYW5jaGVzLmZpbmQoYiA9PiBiID09PSByZXBvLnN0YXRlLmdldCgpLkhFQUQ/Lm5hbWUpXG5cdFx0XHRcdFx0Pz8gYnJhbmNoZXNbMF0pXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHR0aGlzLl9kZWZhdWx0QnJhbmNoID0gZGVmYXVsdEJyYW5jaDtcblxuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl9icmFuY2hlcy5zZXQoYnJhbmNoZXMsIHR4KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZGVmYXVsdEJyYW5jaCAmJiAhdGhpcy5fYnJhbmNoKSB7XG5cdFx0XHRcdHRoaXMuc2V0QnJhbmNoKGRlZmF1bHRCcmFuY2gpO1xuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKCgpID0+IHtcblx0XHRcdGlmICghY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHR0aGlzLl9icmFuY2hlcy5zZXQoW10sIHR4KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRJc29sYXRpb25Nb2RlKG1vZGU6IElzb2xhdGlvbk1vZGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNvbGF0aW9uTW9kZSAhPT0gbW9kZSkge1xuXHRcdFx0dGhpcy5faXNvbGF0aW9uTW9kZSA9IG1vZGU7XG5cdFx0XHR0aGlzLl9pc29sYXRpb25Nb2RlT2JzZXJ2YWJsZS5zZXQobW9kZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2V0T3B0aW9uKElTT0xBVElPTl9PUFRJT05fSUQsIG1vZGUpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9JU09MQVRJT05fTU9ERSwgbW9kZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRcdGlmIChtb2RlID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0XHQvLyBXaGVuIHN3aXRjaGluZyB0byB3b3Jrc3BhY2UgbW9kZSwgdXBkYXRlIHRoZSBicmFuY2hcblx0XHRcdFx0Ly8gc2VsZWN0aW9uIHRvIHJlZmxlY3QgdGhlIGN1cnJlbnQgYnJhbmNoIGFzIHRoYXQgaXNcblx0XHRcdFx0Ly8gd2hhdCB3aWxsIGJlIHVzZWQgZm9yIHRoZSBmb2xkZXIgc2Vzc2lvblxuXHRcdFx0XHRjb25zdCBoZWFkID0gdGhpcy5fZ2l0UmVwb3NpdG9yeT8uc3RhdGUuZ2V0KCkuSEVBRDtcblx0XHRcdFx0Y29uc3QgY3VycmVudEJyYW5jaCA9IGhlYWQ/LmNvbW1pdCA/IGhlYWQubmFtZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5zZXRCcmFuY2goY3VycmVudEJyYW5jaCA/PyB0aGlzLl9kZWZhdWx0QnJhbmNoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2V0QnJhbmNoKHRoaXMuX2RlZmF1bHRCcmFuY2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHNldEJyYW5jaChicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9icmFuY2ggIT09IGJyYW5jaCkge1xuXHRcdFx0dGhpcy5fYnJhbmNoID0gYnJhbmNoO1xuXHRcdFx0dGhpcy5fYnJhbmNoT2JzZXJ2YWJsZS5zZXQoYnJhbmNoLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5zZXRPcHRpb24oQlJBTkNIX09QVElPTl9JRCwgYnJhbmNoID8/ICcnKTtcblx0XHR9XG5cdH1cblxuXHRzZXRNb2RlbElkKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsSWQgPSBtb2RlbElkO1xuXHRcdHRoaXMuX21vZGVsSWRPYnNlcnZhYmxlLnNldChtb2RlbElkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0TW9kZUJ5SWQobW9kZUlkOiBzdHJpbmcsIG1vZGVLaW5kOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlT2JzZXJ2YWJsZS5zZXQoeyBpZDogbW9kZUlkLCBraW5kOiBtb2RlS2luZCB9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0UGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVybWlzc2lvbkxldmVsLnNldChsZXZlbCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZS5zZXQodGl0bGUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTdGF0dXMoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdHVzLnNldChzdGF0dXMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRBcmNoaXZlZChhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzQXJjaGl2ZWQuc2V0KGFyY2hpdmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0TW9kZShtb2RlOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbW9kZT8uaWQgIT09IG1vZGU/LmlkKSB7XG5cdFx0XHR0aGlzLl9tb2RlID0gbW9kZTtcblx0XHRcdGNvbnN0IG1vZGVOYW1lID0gbW9kZT8uaXNCdWlsdGluID8gdW5kZWZpbmVkIDogbW9kZT8ubmFtZS5nZXQoKTtcblx0XHRcdHRoaXMuc2V0T3B0aW9uKEFHRU5UX09QVElPTl9JRCwgbW9kZU5hbWUgPz8gJycpO1xuXHRcdH1cblx0fVxuXG5cdGdldEFnZW50SG9zdFNlc3Npb25Db25maWcoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRcdGNvbnN0IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiB0aGlzLl9pc29sYXRpb25Nb2RlID09PSAnd29ya3RyZWUnID8gJ3dvcmt0cmVlJyA6ICdmb2xkZXInLFxuXHRcdH07XG5cdFx0aWYgKHRoaXMuX2lzb2xhdGlvbk1vZGUgPT09ICd3b3JrdHJlZScgJiYgdGhpcy5fYnJhbmNoKSB7XG5cdFx0XHRjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdID0gdGhpcy5fYnJhbmNoO1xuXG5cdFx0XHQvLyBGb3J3YXJkIHRoZSB1c2VyJ3MgYGdpdC5icmFuY2hQcmVmaXhgIChyZXNvdXJjZS1zY29wZWQgdG8gdGhlXG5cdFx0XHQvLyByZXBvc2l0b3J5KSBzbyB0aGUgYWdlbnQgaG9zdCBwcmVwZW5kcyBpdCB0byB0aGUgd29ya3RyZWUgYnJhbmNoXG5cdFx0XHQvLyBpdCBjcmVhdGVzLiBPbWl0IHdoZW4gdW5zZXQvZW1wdHkgdG8gcHJlc2VydmUgdGhlIGRlZmF1bHQgbmFtaW5nLlxuXHRcdFx0Y29uc3QgYnJhbmNoUHJlZml4ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdnaXQuYnJhbmNoUHJlZml4JywgeyByZXNvdXJjZTogdGhpcy5fcmVwb1VyaSB9KTtcblx0XHRcdGlmICh0eXBlb2YgYnJhbmNoUHJlZml4ID09PSAnc3RyaW5nJyAmJiBicmFuY2hQcmVmaXgubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF0gPSBicmFuY2hQcmVmaXg7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmt0cmVlSW5jbHVkZUZpbGVzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oJ2dpdC53b3JrdHJlZUluY2x1ZGVGaWxlcycsIHsgcmVzb3VyY2U6IHRoaXMuX3JlcG9VcmkgfSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh3b3JrdHJlZUluY2x1ZGVGaWxlcykgJiYgd29ya3RyZWVJbmNsdWRlRmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10gPSB3b3JrdHJlZUluY2x1ZGVGaWxlcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbmZpZztcblx0fVxuXG5cdHNldE9wdGlvbihvcHRpb25JZDogc3RyaW5nLCB2YWx1ZTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRPcHRpb25zLnNldChvcHRpb25JZCwgeyBpZDogdmFsdWUsIG5hbWU6IHZhbHVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkT3B0aW9ucy5zZXQob3B0aW9uSWQsIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldFNlc3Npb25PcHRpb24odGhpcy5yZXNvdXJjZSwgb3B0aW9uSWQsIHZhbHVlKTtcblx0fVxuXG5cdHVwZGF0ZShhZ2VudFNlc3Npb246IElBZ2VudFNlc3Npb24pOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgQWdlbnRTZXNzaW9uQWRhcHRlcihhZ2VudFNlc3Npb24sIHRoaXMucHJvdmlkZXJJZCwgdGhpcy5naXRIdWJTZXJ2aWNlLCB0aGlzLnB1bGxSZXF1ZXN0SWNvbkNhY2hlKTtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZURhdGEuc2V0KHNlc3Npb24ud29ya3NwYWNlLmdldCgpLCB0eCk7XG5cdFx0XHR0aGlzLl90aXRsZS5zZXQoc2Vzc2lvbi50aXRsZS5nZXQoKSwgdHgpO1xuXHRcdFx0dGhpcy5fc3RhdHVzLnNldChzZXNzaW9uLnN0YXR1cy5nZXQoKSwgdHgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlZEF0LnNldChzZXNzaW9uLnVwZGF0ZWRBdC5nZXQoKSwgdHgpO1xuXHRcdFx0dGhpcy5fY2hhbmdlcy5zZXQoc2Vzc2lvbi5jaGFuZ2VzLmdldCgpLCB0eCk7XG5cdFx0XHR0aGlzLl9jaGVja3BvaW50cy5zZXQoc2Vzc2lvbi5jaGVja3BvaW50cy5nZXQoKSwgdHgpO1xuXHRcdFx0dGhpcy5fZGVzY3JpcHRpb24uc2V0KHNlc3Npb24uZGVzY3JpcHRpb24uZ2V0KCksIHR4KTtcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc01vZGVsT3B0aW9uR3JvdXAoZ3JvdXA6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXApOiBib29sZWFuIHtcblx0aWYgKGdyb3VwLmlkID09PSAnbW9kZWxzJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IG5hbWVMb3dlciA9IGdyb3VwLm5hbWUudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIG5hbWVMb3dlciA9PT0gJ21vZGVsJyB8fCBuYW1lTG93ZXIgPT09ICdtb2RlbHMnO1xufVxuXG5mdW5jdGlvbiBpc1JlcG9zaXRvcmllc09wdGlvbkdyb3VwKGdyb3VwOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwKTogYm9vbGVhbiB7XG5cdHJldHVybiBncm91cC5pZCA9PT0gJ3JlcG9zaXRvcmllcyc7XG59XG5cbi8qKlxuICogUmVtb3RlIG5ldyBzZXNzaW9uIGZvciBDbG91ZCBhZ2VudCBzZXNzaW9ucy5cbiAqIEltcGxlbWVudHMge0BsaW5rIElDb3BpbG90Q2hhdFNlc3Npb259IChzZXNzaW9uIGZhY2FkZSkgYW5kIHByb3ZpZGVzXG4gKiBwcmUtc2VuZCBjb25maWd1cmF0aW9uIG1ldGhvZHMgZm9yIHRoZSBuZXctc2Vzc2lvbiBmbG93LlxuICovXG5leHBvcnQgY2xhc3MgUmVtb3RlTmV3U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29waWxvdENoYXRTZXNzaW9uIHtcblxuXHQvLyAtLSBJU2Vzc2lvbkRhdGEgZmllbGRzIC0tXG5cblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBjcmVhdGVkQXQ6IERhdGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgJycpO1xuXHRyZWFkb25seSB0aXRsZTogSU9ic2VydmFibGU8c3RyaW5nPiA9IHRoaXMuX3RpdGxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZWRBdCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBuZXcgRGF0ZSgpKTtcblx0cmVhZG9ubHkgdXBkYXRlZEF0OiBJT2JzZXJ2YWJsZTxEYXRlPiA9IHRoaXMuX3VwZGF0ZWRBdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdHJlYWRvbmx5IHN0YXR1czogSU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz4gPSB0aGlzLl9zdGF0dXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVybWlzc2lvbkxldmVsID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD4gPSB0aGlzLl9wZXJtaXNzaW9uTGV2ZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlRGF0YSA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4gPSB0aGlzLl93b3Jrc3BhY2VEYXRhO1xuXG5cdHJlYWRvbmx5IGNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPiA9IG9ic2VydmFibGVWYWx1ZU9wdHM8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbCB9LCBbXSk7XG5cblx0cmVhZG9ubHkgY2hlY2twb2ludHM6IElPYnNlcnZhYmxlPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxJZE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBtb2RlbElkOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gdGhpcy5fbW9kZWxJZE9ic2VydmFibGU7XG5cblx0cmVhZG9ubHkgbW9kZTogSU9ic2VydmFibGU8eyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBraW5kOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblxuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNBcmNoaXZlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faXNBcmNoaXZlZDtcblx0cmVhZG9ubHkgaXNSZWFkOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0cnVlKTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbGFzdFR1cm5FbmQ6IElPYnNlcnZhYmxlPERhdGUgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRyZWFkb25seSBicmFuY2g6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgaXNvbGF0aW9uTW9kZTogSU9ic2VydmFibGU8SXNvbGF0aW9uTW9kZSB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgYnJhbmNoZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdPiA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdHJlYWRvbmx5IGdpdFJlcG9zaXRvcnk/OiBJR2l0UmVwb3NpdG9yeSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBtYWluQ2hhdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdD47XG5cblx0cmVhZG9ubHkgX2hhc0dpdFJlcG8gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBoYXNHaXRSZXBvOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2hhc0dpdFJlcG87XG5cblx0Ly8gLS0gTmV3IHNlc3Npb24gY29uZmlndXJhdGlvbiBmaWVsZHMgLS1cblxuXHRwcml2YXRlIF9yZXBvVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Byb2plY3Q6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3F1ZXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2F0dGFjaGVkQ29udGV4dDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzLmV2ZW50O1xuXG5cdHJlYWRvbmx5IHNlbGVjdGVkT3B0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+KCk7XG5cblx0Z2V0IHByb2plY3QoKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvamVjdDsgfVxuXHRnZXQgc2VsZWN0ZWRNb2RlbElkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9tb2RlbElkOyB9XG5cdGdldCBjaGF0TW9kZSgpOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldCBxdWVyeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcXVlcnk7IH1cblx0Z2V0IGF0dGFjaGVkQ29udGV4dCgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fYXR0YWNoZWRDb250ZXh0OyB9XG5cdGdldCBkaXNhYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuX3JlcG9VcmkgJiYgIXRoaXMuc2VsZWN0ZWRPcHRpb25zLmhhcygncmVwb3NpdG9yaWVzJyk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aGVuQ2xhdXNlS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdFx0cmVhZG9ubHkgc2Vzc2lvbldvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UsXG5cdFx0cmVhZG9ubHkgdGFyZ2V0OiBBZ2VudFNlc3Npb25UYXJnZXQsXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2Vzc2lvbklkID0gdG9TZXNzaW9uSWQocHJvdmlkZXJJZCwgcmVzb3VyY2UpO1xuXHRcdHRoaXMucHJvdmlkZXJJZCA9IHByb3ZpZGVySWQ7XG5cdFx0dGhpcy5zZXNzaW9uVHlwZSA9IHRhcmdldDtcblx0XHR0aGlzLmljb24gPSBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pY29uO1xuXHRcdHRoaXMuY3JlYXRlZEF0ID0gbmV3IERhdGUoKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVdoZW5DbGF1c2VLZXlzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVdoZW5DbGF1c2VLZXlzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU9wdGlvbkdyb3Vwcy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3doZW5DbGF1c2VLZXlzLnNpemUgPiAwICYmIGUuYWZmZWN0c1NvbWUodGhpcy5fd2hlbkNsYXVzZUtleXMpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgd29ya3NwYWNlIGRhdGFcblx0XHR0aGlzLl93b3Jrc3BhY2VEYXRhLnNldChzZXNzaW9uV29ya3NwYWNlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3JlcG9VcmkgPSBzZXNzaW9uV29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0aWYgKHRoaXMuX3JlcG9VcmkpIHtcblx0XHRcdGNvbnN0IGlkID0gdGhpcy5fcmVwb1VyaS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdHRoaXMuc2V0T3B0aW9uKCdyZXBvc2l0b3JpZXMnLCB7IGlkLCBuYW1lOiBpZCB9KTtcblx0XHR9XG5cblx0XHR0aGlzLm1haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBidWlsZENoYXRGcm9tU2Vzc2lvbih0aGlzKSk7XG5cdH1cblx0c2V0UGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Ly8gLS0gTmV3IHNlc3Npb24gY29uZmlndXJhdGlvbiBtZXRob2RzIC0tXG5cblx0c2V0SXNvbGF0aW9uTW9kZShfbW9kZTogSXNvbGF0aW9uTW9kZSk6IHZvaWQge1xuXHRcdC8vIE5vLW9wIGZvciByZW1vdGUgc2Vzc2lvbnNcblx0fVxuXG5cdHNldEJyYW5jaChfYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBOby1vcCBmb3IgcmVtb3RlIHNlc3Npb25zXG5cdH1cblxuXHRzZXRNb2RlbElkKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsSWQgPSBtb2RlbElkO1xuXHR9XG5cblx0c2V0VGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3RpdGxlLnNldCh0aXRsZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFN0YXR1cyhzdGF0dXM6IFNlc3Npb25TdGF0dXMpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0dXMuc2V0KHN0YXR1cywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldEFyY2hpdmVkKGFyY2hpdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNBcmNoaXZlZC5zZXQoYXJjaGl2ZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRNb2RlKF9tb2RlOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBJbnRlbnRpb25hbGx5IGEgbm8tb3A6IHJlbW90ZSBzZXNzaW9ucyBkbyBub3Qgc3VwcG9ydCBjbGllbnQtc2lkZSBtb2RlIHNlbGVjdGlvbi5cblx0fVxuXG5cdHNldE9wdGlvbihvcHRpb25JZDogc3RyaW5nLCB2YWx1ZTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRPcHRpb25zLnNldChvcHRpb25JZCwgdmFsdWUpO1xuXHRcdH1cblx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbih0aGlzLnJlc291cmNlLCBvcHRpb25JZCwgdmFsdWUpO1xuXHR9XG5cblx0Ly8gLS0tIE9wdGlvbiBncm91cCBhY2Nlc3NvcnMgLS0tXG5cblx0Z2V0TW9kZWxPcHRpb25zU25hcHNob3QoKTogeyByZWFkb25seSBtb2RlbE9wdGlvbjogSVNlc3Npb25PcHRpb25Hcm91cCB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgaXNSZXNvbHZlZDogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9nZXRPcHRpb25Hcm91cHMoKTtcblx0XHRpZiAoIWdyb3Vwcykge1xuXHRcdFx0cmV0dXJuIHsgbW9kZWxPcHRpb246IHVuZGVmaW5lZCwgaXNSZXNvbHZlZDogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgZ3JvdXAgPSBncm91cHMuZmluZChnID0+IGlzTW9kZWxPcHRpb25Hcm91cChnKSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuIHsgbW9kZWxPcHRpb246IHVuZGVmaW5lZCwgaXNSZXNvbHZlZDogdHJ1ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBtb2RlbE9wdGlvbjogeyBncm91cCwgdmFsdWU6IHRoaXMuX2dldFZhbHVlRm9yR3JvdXAoZ3JvdXApIH0sIGlzUmVzb2x2ZWQ6IHRydWUgfTtcblx0fVxuXG5cdGdldE90aGVyT3B0aW9uR3JvdXBzKCk6IElTZXNzaW9uT3B0aW9uR3JvdXBbXSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5fZ2V0T3B0aW9uR3JvdXBzKCk7XG5cdFx0aWYgKCFncm91cHMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGdyb3Vwc1xuXHRcdFx0LmZpbHRlcihnID0+ICFpc01vZGVsT3B0aW9uR3JvdXAoZykgJiYgIWlzUmVwb3NpdG9yaWVzT3B0aW9uR3JvdXAoZykgJiYgdGhpcy5faXNPcHRpb25Hcm91cFZpc2libGUoZykpXG5cdFx0XHQubWFwKGcgPT4gKHsgZ3JvdXA6IGcsIHZhbHVlOiB0aGlzLl9nZXRWYWx1ZUZvckdyb3VwKGcpIH0pKTtcblx0fVxuXG5cdGdldE9wdGlvblZhbHVlKGdyb3VwSWQ6IHN0cmluZyk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2VsZWN0ZWRPcHRpb25zLmdldChncm91cElkKTtcblx0fVxuXG5cdHNldE9wdGlvblZhbHVlKGdyb3VwSWQ6IHN0cmluZywgdmFsdWU6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSk6IHZvaWQge1xuXHRcdHRoaXMuc2V0T3B0aW9uKGdyb3VwSWQsIHZhbHVlKTtcblx0fVxuXG5cdC8vIC0tLSBJbnRlcm5hbHMgLS0tXG5cblx0cHJpdmF0ZSBfZ2V0T3B0aW9uR3JvdXBzKCk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZSh0aGlzLnRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc09wdGlvbkdyb3VwVmlzaWJsZShncm91cDogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCk6IGJvb2xlYW4ge1xuXHRcdGlmICghZ3JvdXAud2hlbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShncm91cC53aGVuKTtcblx0XHRyZXR1cm4gIWV4cHIgfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGV4cHIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlV2hlbkNsYXVzZUtleXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2hlbkNsYXVzZUtleXMuY2xlYXIoKTtcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9nZXRPcHRpb25Hcm91cHMoKTtcblx0XHRpZiAoIWdyb3Vwcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwLndoZW4pIHtcblx0XHRcdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGdyb3VwLndoZW4pO1xuXHRcdFx0XHRpZiAoZXhwcikge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGV4cHIua2V5cygpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl93aGVuQ2xhdXNlS2V5cy5hZGQoa2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWYWx1ZUZvckdyb3VwKGdyb3VwOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwKTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZWxlY3RlZCA9IHRoaXMuc2VsZWN0ZWRPcHRpb25zLmdldChncm91cC5pZCk7XG5cdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm4gc2VsZWN0ZWQ7XG5cdFx0fVxuXHRcdC8vIENoZWNrIGZvciBleHRlbnNpb24tc2V0IHNlc3Npb24gb3B0aW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbk9wdGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHRoaXMucmVzb3VyY2UsIGdyb3VwLmlkKTtcblx0XHRpZiAoc2Vzc2lvbk9wdGlvbiAmJiB0eXBlb2Ygc2Vzc2lvbk9wdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBzZXNzaW9uT3B0aW9uO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHNlc3Npb25PcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gZ3JvdXAuaXRlbXMuZmluZChpID0+IGkuaWQgPT09IHNlc3Npb25PcHRpb24udHJpbSgpKTtcblx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBEZWZhdWx0IHRvIGZpcnN0IGl0ZW0gbWFya2VkIGFzIGRlZmF1bHQsIG9yIGZpcnN0IGl0ZW1cblx0XHRyZXR1cm4gZ3JvdXAuaXRlbXMuZmluZChpID0+IGkuZGVmYXVsdCA9PT0gdHJ1ZSkgPz8gZ3JvdXAuaXRlbXNbMF07XG5cdH1cblxuXHR1cGRhdGUoX3Nlc3Npb246IElBZ2VudFNlc3Npb24pOiB2b2lkIHsgfVxufVxuXG4vKipcbiAqIE1hcHMgdGhlIGV4aXN0aW5nIHtAbGluayBDaGF0U2Vzc2lvblN0YXR1c30gdG8gdGhlIG5ldyB7QGxpbmsgU2Vzc2lvblN0YXR1c30uXG4gKi9cbmZ1bmN0aW9uIHRvU2Vzc2lvblN0YXR1cyhzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzKTogU2Vzc2lvblN0YXR1cyB7XG5cdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0Y2FzZSBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzOlxuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRjYXNlIENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ6XG5cdFx0XHRyZXR1cm4gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0O1xuXHRcdGNhc2UgQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkOlxuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdGNhc2UgQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkOlxuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuRXJyb3I7XG5cdH1cbn1cblxuLyoqXG4gKiBEaXNwbGF5IGxhYmVsIGZvciBhIGBnaXRodWItcmVtb3RlLWZpbGU6Ly9gIHJlcG8gVVJJLCBpbiBgb3duZXIvcmVwb2AgZm9ybS4gUmV0dXJuc1xuICogYHVuZGVmaW5lZGAgZm9yIG5vbi1HaXRIdWIgVVJJcyBzbyBjYWxsZXJzIGNhbiBmYWxsIGJhY2suIFVzZWQgYnkgYm90aCB0aGUgbmV3LXNlc3Npb25cbiAqIHdvcmtzcGFjZSAoe0BsaW5rIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlci5yZXNvbHZlV29ya3NwYWNlfSkgYW5kIHRoZSBjb21taXR0ZWRcbiAqIHNlc3Npb24gYWRhcHRlciAoe0BsaW5rIEFnZW50U2Vzc2lvbkFkYXB0ZXIuX2J1aWxkV29ya3NwYWNlfSkgc28gYSBjbG91ZCBzZXNzaW9uIGdyb3Vwc1xuICogdW5kZXIgdGhlIHNhbWUgYG93bmVyL3JlcG9gIGxhYmVsIGJlZm9yZSBhbmQgYWZ0ZXIgY29tbWl0LlxuICogVE9ETzogYXQgc29tZSBwb2ludCB0aGlzIHNob3VsZCBiZSBzdGFuZGFyZGl6ZWQgYW5kIGluIHRoZSBzYW1lIGxpc3QgYXMgYWxsIHNlc3Npb25zLlxuICogRG9pbmcgaXQgdGhpcyB3YXkgZm9yIG5vdyBqdXN0IHRvIGtlZXAgc3VwcG9ydGluZyB0aGUgbmV3IGNoYXQgYnV0dG9uIGZyb20gdGhlIGdyb3VwLlxuICovXG5mdW5jdGlvbiBnaXRodWJSZW1vdGVSZXBvTGFiZWwodXJpOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodXJpLnNjaGVtZSAhPT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gUGF0aCBpcyBgLzxvd25lcj4vPHJlcG8+Wy88cmVmPlx1MjAyNl1gOyB0YWtlIHRoZSBmaXJzdCB0d28gc2VnbWVudHMuXG5cdGNvbnN0IHBhcnRzID0gdXJpLnBhdGgucmVwbGFjZSgvXlxcLy8sICcnKS5zcGxpdCgnLycpO1xuXHRyZXR1cm4gcGFydHMubGVuZ3RoID49IDIgPyBgJHtwYXJ0c1swXX0vJHtwYXJ0c1sxXX1gIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEFkYXB0cyBhbiBleGlzdGluZyB7QGxpbmsgSUFnZW50U2Vzc2lvbn0gZnJvbSB0aGUgY2hhdCBsYXllciBpbnRvIHRoZSBuZXcge0BsaW5rIElDb3BpbG90Q2hhdFNlc3Npb259IGZhY2FkZS5cbiAqL1xuY2xhc3MgQWdlbnRTZXNzaW9uQWRhcHRlciBpbXBsZW1lbnRzIElDb3BpbG90Q2hhdFNlc3Npb24ge1xuXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPj47XG5cdHJlYWRvbmx5IHRpdGxlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZWRBdDogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPERhdGU+Pjtcblx0cmVhZG9ubHkgdXBkYXRlZEF0OiBJT2JzZXJ2YWJsZTxEYXRlPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPj47XG5cdHJlYWRvbmx5IHN0YXR1czogSU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlczogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPj47XG5cdHJlYWRvbmx5IGNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGVja3BvaW50czogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlT3B0czxJQ2hhdENoZWNrcG9pbnRzIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGNoZWNrcG9pbnRzOiBJT2JzZXJ2YWJsZTxJQ2hhdENoZWNrcG9pbnRzIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbElkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0FyY2hpdmVkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4+O1xuXHRyZWFkb25seSBpc0FyY2hpdmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1JlYWQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj47XG5cdHJlYWRvbmx5IGlzUmVhZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVzY3JpcHRpb246IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFR1cm5FbmQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxEYXRlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGxhc3RUdXJuRW5kOiBJT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYXNlR2l0SHViSW5mbzogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0QnJhbmNoOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0TnVtYmVyRnJvbUJyYW5jaDogSU9ic2VydmFibGU8SU9ic2VydmFibGU8eyByZWFkb25seSB2YWx1ZT86IG51bWJlciB8IHVuZGVmaW5lZCB9PiB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0TnVtYmVyQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSU9ic2VydmFibGU8eyByZWFkb25seSB2YWx1ZT86IG51bWJlciB8IHVuZGVmaW5lZCB9Pj4oKTtcblx0cmVhZG9ubHkgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD4gPSBjb25zdE9ic2VydmFibGUoQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0cmVhZG9ubHkgYnJhbmNoOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGlzb2xhdGlvbk1vZGU6IElPYnNlcnZhYmxlPElzb2xhdGlvbk1vZGUgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGdpdFJlcG9zaXRvcnk/OiBJR2l0UmVwb3NpdG9yeSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnJhbmNoZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdPiA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cblx0cmVhZG9ubHkgbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlc3Npb246IElBZ2VudFNlc3Npb24sXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0SWNvbkNhY2hlOiBJUHVsbFJlcXVlc3RJY29uQ2FjaGUsXG5cdCkge1xuXHRcdHRoaXMuc2Vzc2lvbklkID0gdG9TZXNzaW9uSWQocHJvdmlkZXJJZCwgc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2U7XG5cdFx0dGhpcy5wcm92aWRlcklkID0gcHJvdmlkZXJJZDtcblx0XHR0aGlzLnNlc3Npb25UeXBlID0gc2Vzc2lvbi5wcm92aWRlclR5cGU7XG5cdFx0dGhpcy5pY29uID0gdGhpcy5fZ2V0U2Vzc2lvblR5cGVJY29uKHNlc3Npb24pO1xuXHRcdHRoaXMuY3JlYXRlZEF0ID0gbmV3IERhdGUoc2Vzc2lvbi50aW1pbmcuY3JlYXRlZCk7XG5cblx0XHR0aGlzLl9iYXNlR2l0SHViSW5mbyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLl9leHRyYWN0R2l0SHViSW5mbyhzZXNzaW9uKSk7XG5cdFx0dGhpcy5fcHVsbFJlcXVlc3RCcmFuY2ggPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdGhpcy5fZXh0cmFjdFB1bGxSZXF1ZXN0QnJhbmNoKHNlc3Npb24pKTtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdE51bWJlckZyb21CcmFuY2ggPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlID0gdGhpcy5fYmFzZUdpdEh1YkluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYnJhbmNoID0gdGhpcy5fcHVsbFJlcXVlc3RCcmFuY2gucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGJhc2U/LnB1bGxSZXF1ZXN0IHx8ICFiYXNlIHx8ICFicmFuY2gpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9wdWxsUmVxdWVzdE51bWJlckZvckJyYW5jaChiYXNlLm93bmVyLCBiYXNlLnJlcG8sIGJyYW5jaCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5naXRIdWJJbmZvID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0bGV0IGluZm8gPSB0aGlzLl9iYXNlR2l0SHViSW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpbmZvLnB1bGxSZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0TnVtYmVyID0gdGhpcy5fcHVsbFJlcXVlc3ROdW1iZXJGcm9tQnJhbmNoLnJlYWQocmVhZGVyKT8ucmVhZChyZWFkZXIpLnZhbHVlO1xuXHRcdFx0XHRpZiAocHVsbFJlcXVlc3ROdW1iZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBpbmZvO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluZm8gPSB7XG5cdFx0XHRcdFx0Li4uaW5mbyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0bnVtYmVyOiBwdWxsUmVxdWVzdE51bWJlcixcblx0XHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKGBodHRwczovL2dpdGh1Yi5jb20vJHtpbmZvLm93bmVyfS8ke2luZm8ucmVwb30vcHVsbC8ke3B1bGxSZXF1ZXN0TnVtYmVyfWApLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHVsbFJlcXVlc3QgPSBpbmZvLnB1bGxSZXF1ZXN0O1xuXHRcdFx0aWYgKCFwdWxsUmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm4gaW5mbztcblx0XHRcdH1cblx0XHRcdGlmIChwdWxsUmVxdWVzdC51cmkuYXV0aG9yaXR5LnRvTG93ZXJDYXNlKCkgIT09ICdnaXRodWIuY29tJykge1xuXHRcdFx0XHRyZXR1cm4gaW5mbztcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmluZm8sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0Li4ucHVsbFJlcXVlc3QsXG5cdFx0XHRcdFx0aWNvbjogY29tcHV0ZVNlc3Npb25QdWxsUmVxdWVzdEljb24ocmVhZGVyLCB0aGlzLl9naXRIdWJTZXJ2aWNlLCB0aGlzLl9wdWxsUmVxdWVzdEljb25DYWNoZSwgaW5mbylcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3dvcmtzcGFjZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLl9idWlsZFdvcmtzcGFjZShzZXNzaW9uKSk7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSB0aGlzLl93b3Jrc3BhY2U7XG5cblx0XHR0aGlzLl90aXRsZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBzZXNzaW9uLmxhYmVsKTtcblx0XHR0aGlzLnRpdGxlID0gdGhpcy5fdGl0bGU7XG5cblx0XHRjb25zdCB1cGRhdGVkVGltZSA9IHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPz8gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IHNlc3Npb24udGltaW5nLmNyZWF0ZWQ7XG5cdFx0dGhpcy5fdXBkYXRlZEF0ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIG5ldyBEYXRlKHVwZGF0ZWRUaW1lKSk7XG5cdFx0dGhpcy51cGRhdGVkQXQgPSB0aGlzLl91cGRhdGVkQXQ7XG5cblx0XHR0aGlzLl9zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdG9TZXNzaW9uU3RhdHVzKHNlc3Npb24uc3RhdHVzKSk7XG5cdFx0dGhpcy5zdGF0dXMgPSB0aGlzLl9zdGF0dXM7XG5cblx0XHR0aGlzLl9jaGFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsIH0sIHRoaXMuX2V4dHJhY3RDaGFuZ2VzKHNlc3Npb24pKTtcblx0XHR0aGlzLmNoYW5nZXMgPSB0aGlzLl9jaGFuZ2VzO1xuXG5cdFx0dGhpcy5fY2hlY2twb2ludHMgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzIH0sIHRoaXMuX2V4dHJhY3RDaGVja3BvaW50cyhzZXNzaW9uKSk7XG5cdFx0dGhpcy5jaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzO1xuXG5cdFx0dGhpcy5fbW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5tb2RlbElkID0gdGhpcy5fbW9kZWxJZDtcblx0XHR0aGlzLm1vZGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxvYWRpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdFx0dGhpcy5faXNBcmNoaXZlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBzZXNzaW9uLmlzQXJjaGl2ZWQoKSk7XG5cdFx0dGhpcy5pc0FyY2hpdmVkID0gdGhpcy5faXNBcmNoaXZlZDtcblx0XHR0aGlzLl9pc1JlYWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgc2Vzc2lvbi5pc1JlYWQoKSk7XG5cdFx0dGhpcy5pc1JlYWQgPSB0aGlzLl9pc1JlYWQ7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdGhpcy5fZXh0cmFjdERlc2NyaXB0aW9uKHNlc3Npb24pKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gdGhpcy5fZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fbGFzdFR1cm5FbmQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/IG5ldyBEYXRlKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxhc3RUdXJuRW5kID0gdGhpcy5fbGFzdFR1cm5FbmQ7XG5cblx0XHR0aGlzLm1haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBidWlsZENoYXRGcm9tU2Vzc2lvbih0aGlzKSk7XG5cdH1cblxuXHRzZXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2V0QnJhbmNoKGJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHNldElzb2xhdGlvbk1vZGUobW9kZTogSXNvbGF0aW9uTW9kZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzZXRNb2RlbElkKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsSWQuc2V0KG1vZGVsSWQsIHVuZGVmaW5lZCk7XG5cdH1cblx0c2V0TW9kZShjaGF0TW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSByZWFjdGl2ZSBwcm9wZXJ0aWVzIGZyb20gYSByZWZyZXNoZWQgYWdlbnQgc2Vzc2lvbi5cblx0ICovXG5cdHVwZGF0ZShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRjb25zdCBnaXRIdWJJbmZvID0gdGhpcy5fZXh0cmFjdEdpdEh1YkluZm8oc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdEJyYW5jaCA9IHRoaXMuX2V4dHJhY3RQdWxsUmVxdWVzdEJyYW5jaChzZXNzaW9uKTtcblx0XHRcdGNoYW5nZWQgPSBzZXRJZkNoYW5nZWQodGhpcy5fdGl0bGUsIHNlc3Npb24ubGFiZWwsIHR4KSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl93b3Jrc3BhY2UsIHRoaXMuX2J1aWxkV29ya3NwYWNlKHNlc3Npb24pLCB0eCwgc2Vzc2lvbldvcmtzcGFjZUVxdWFsKSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y29uc3QgdXBkYXRlZFRpbWUgPSBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBzZXNzaW9uLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl91cGRhdGVkQXQsIG5ldyBEYXRlKHVwZGF0ZWRUaW1lKSwgdHgsIGRhdGVFcXVhbHMpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX3N0YXR1cywgdG9TZXNzaW9uU3RhdHVzKHNlc3Npb24uc3RhdHVzKSwgdHgpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2NoYW5nZXMsIHRoaXMuX2V4dHJhY3RDaGFuZ2VzKHNlc3Npb24pLCB0eCwgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2NoZWNrcG9pbnRzLCB0aGlzLl9leHRyYWN0Q2hlY2twb2ludHMoc2Vzc2lvbiksIHR4LCBzdHJ1Y3R1cmFsRXF1YWxzKSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl9pc0FyY2hpdmVkLCBzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgdHgpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2lzUmVhZCwgc2Vzc2lvbi5pc1JlYWQoKSwgdHgpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2Rlc2NyaXB0aW9uLCB0aGlzLl9leHRyYWN0RGVzY3JpcHRpb24oc2Vzc2lvbiksIHR4LCBtYXJrZG93blN0cmluZ0VxdWFscykgfHwgY2hhbmdlZDtcblx0XHRcdGNoYW5nZWQgPSBzZXRJZkNoYW5nZWQodGhpcy5fbGFzdFR1cm5FbmQsIHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPyBuZXcgRGF0ZShzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkKSA6IHVuZGVmaW5lZCwgdHgsIGRhdGVFcXVhbHMpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2Jhc2VHaXRIdWJJbmZvLCBnaXRIdWJJbmZvLCB0eCwgZ2l0SHViSW5mb0VxdWFsKSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl9wdWxsUmVxdWVzdEJyYW5jaCwgcHVsbFJlcXVlc3RCcmFuY2gsIHR4KSB8fCBjaGFuZ2VkO1xuXHRcdH0pO1xuXHRcdHJldHVybiBjaGFuZ2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVsbFJlcXVlc3ROdW1iZXJGb3JCcmFuY2gob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZyk6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgdmFsdWU/OiBudW1iZXIgfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99QCR7YnJhbmNofWA7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fcHVsbFJlcXVlc3ROdW1iZXJDYWNoZS5nZXQoa2V5KTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvb2t1cCA9IHRoaXMuX2dpdEh1YlNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoKG93bmVyLCByZXBvLCBicmFuY2gpO1xuXHRcdGNvbnN0IG9ic2VydmFibGUgPSBvYnNlcnZhYmxlRnJvbVByb21pc2UobG9va3VwKTtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdE51bWJlckNhY2hlLnNldChrZXksIG9ic2VydmFibGUpO1xuXHRcdGxvb2t1cC50aGVuKHB1bGxSZXF1ZXN0TnVtYmVyID0+IHtcblx0XHRcdGlmIChwdWxsUmVxdWVzdE51bWJlciA9PT0gdW5kZWZpbmVkICYmIHRoaXMuX3B1bGxSZXF1ZXN0TnVtYmVyQ2FjaGUuZ2V0KGtleSkgPT09IG9ic2VydmFibGUpIHtcblx0XHRcdFx0dGhpcy5fcHVsbFJlcXVlc3ROdW1iZXJDYWNoZS5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gb2JzZXJ2YWJsZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25UeXBlSWNvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogVGhlbWVJY29uIHtcblx0XHRzd2l0Y2ggKHNlc3Npb24ucHJvdmlkZXJUeXBlKSB7XG5cdFx0XHRjYXNlIEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kOlxuXHRcdFx0XHRyZXR1cm4gQ29waWxvdENMSVNlc3Npb25UeXBlLmljb247XG5cdFx0XHRjYXNlIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZDpcblx0XHRcdFx0cmV0dXJuIENvcGlsb3RDbG91ZFNlc3Npb25UeXBlLmljb247XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbi5pY29uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3REZXNjcmlwdGlvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNlc3Npb24uZGVzY3JpcHRpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlb2Ygc2Vzc2lvbi5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcoc2Vzc2lvbi5kZXNjcmlwdGlvbikgOiBzZXNzaW9uLmRlc2NyaXB0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdEdpdEh1YkluZm8oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHNlc3Npb24ubWV0YWRhdGE7XG5cdFx0aWYgKCFtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwdWxsUmVxdWVzdFVyaSA9IHRoaXMuX2V4dHJhY3RQdWxsUmVxdWVzdFVyaShzZXNzaW9uKTtcblx0XHRjb25zdCBwdWxsUmVxdWVzdElkZW50aXR5ID0gcHVsbFJlcXVlc3RVcmkgPyB0aGlzLl9leHRyYWN0UHVsbFJlcXVlc3RJZGVudGl0eShwdWxsUmVxdWVzdFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgeyBvd25lciwgcmVwbyB9ID0gcHVsbFJlcXVlc3RJZGVudGl0eSA/PyB0aGlzLl9leHRyYWN0T3duZXJSZXBvKHNlc3Npb24pO1xuXHRcdGlmICghb3duZXIgfHwgIXJlcG8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFwdWxsUmVxdWVzdFVyaSB8fCAhcHVsbFJlcXVlc3RJZGVudGl0eSkge1xuXHRcdFx0cmV0dXJuIHsgb3duZXIsIHJlcG8gfTtcblx0XHR9XG5cblx0XHRjb25zdCBpY29uID0gdGhpcy5fZXh0cmFjdFB1bGxSZXF1ZXN0U3RhdGVJY29uKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgYmFzZVJlZk9pZCA9IHR5cGVvZiBtZXRhZGF0YS5iYXNlUmVmT2lkID09PSAnc3RyaW5nJyA/IG1ldGFkYXRhLmJhc2VSZWZPaWQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGVhZFJlZk9pZCA9IHR5cGVvZiBtZXRhZGF0YS5oZWFkUmVmT2lkID09PSAnc3RyaW5nJyA/IG1ldGFkYXRhLmhlYWRSZWZPaWQgOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3duZXIsXG5cdFx0XHRyZXBvLFxuXHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0bnVtYmVyOiBwdWxsUmVxdWVzdElkZW50aXR5Lm51bWJlcixcblx0XHRcdFx0dXJpOiBwdWxsUmVxdWVzdFVyaSxcblx0XHRcdFx0aWNvbixcblx0XHRcdFx0YmFzZVJlZk9pZCxcblx0XHRcdFx0aGVhZFJlZk9pZFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0UHVsbFJlcXVlc3RCcmFuY2goc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHNlc3Npb24ucHJvdmlkZXJUeXBlICE9PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2Ygc2Vzc2lvbi5tZXRhZGF0YT8uaG9zdCA9PT0gJ3N0cmluZycgJiYgc2Vzc2lvbi5tZXRhZGF0YS5ob3N0LnRvTG93ZXJDYXNlKCkgIT09ICdnaXRodWIuY29tJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiBzZXNzaW9uLm1ldGFkYXRhPy5icmFuY2ggPT09ICdzdHJpbmcnID8gc2Vzc2lvbi5tZXRhZGF0YS5icmFuY2ggOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0UHVsbFJlcXVlc3RJZGVudGl0eShwdWxsUmVxdWVzdFVyaTogVVJJKTogeyByZWFkb25seSBvd25lcjogc3RyaW5nOyByZWFkb25seSByZXBvOiBzdHJpbmc7IHJlYWRvbmx5IG51bWJlcjogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hdGNoID0gL15cXC8oPzxvd25lcj5bXi9dKylcXC8oPzxyZXBvPlteL10rKVxcL3B1bGxcXC8oPzxudW1iZXI+XFxkKylcXC8/JC8uZXhlYyhwdWxsUmVxdWVzdFVyaS5wYXRoKTtcblx0XHRpZiAoIW1hdGNoPy5ncm91cHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRvd25lcjogZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoLmdyb3Vwcy5vd25lciksXG5cdFx0XHRyZXBvOiBkZWNvZGVVUklDb21wb25lbnQobWF0Y2guZ3JvdXBzLnJlcG8pLFxuXHRcdFx0bnVtYmVyOiBwYXJzZUludChtYXRjaC5ncm91cHMubnVtYmVyLCAxMCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RPd25lclJlcG8oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHsgb3duZXI6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVwbzogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gc2Vzc2lvbi5tZXRhZGF0YTtcblx0XHRpZiAoIW1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4geyBvd25lcjogdW5kZWZpbmVkLCByZXBvOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHQvLyBEaXJlY3Qgb3duZXIgKyBuYW1lIGZpZWxkc1xuXHRcdGlmICh0eXBlb2YgbWV0YWRhdGEub3duZXIgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBtZXRhZGF0YS5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHsgb3duZXI6IG1ldGFkYXRhLm93bmVyLCByZXBvOiBtZXRhZGF0YS5uYW1lIH07XG5cdFx0fVxuXG5cdFx0Ly8gcmVwb3NpdG9yeU53bzogXCJvd25lci9yZXBvXCJcblx0XHRpZiAodHlwZW9mIG1ldGFkYXRhLnJlcG9zaXRvcnlOd28gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBwYXJ0cyA9IChtZXRhZGF0YS5yZXBvc2l0b3J5TndvIGFzIHN0cmluZykuc3BsaXQoJy8nKTtcblx0XHRcdGlmIChwYXJ0cy5sZW5ndGggPT09IDIpIHtcblx0XHRcdFx0cmV0dXJuIHsgb3duZXI6IHBhcnRzWzBdLCByZXBvOiBwYXJ0c1sxXSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFBhcnNlIGZyb20gd29ya3NwYWNlIHJlcG9zaXRvcnkgVVJJIChjbG91ZCBzZXNzaW9ucylcblx0XHRjb25zdCByZXBvVXJpID0gdGhpcy5fYnVpbGRXb3Jrc3BhY2Uoc2Vzc2lvbik/LmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0aWYgKHJlcG9VcmkgJiYgcmVwb1VyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRcdGNvbnN0IHBhcnRzID0gcmVwb1VyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdFx0aWYgKHBhcnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdHJldHVybiB7IG93bmVyOiBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMF0pLCByZXBvOiBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0pIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgb3duZXI6IHVuZGVmaW5lZCwgcmVwbzogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0UHVsbFJlcXVlc3RTdGF0ZUljb24oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBzZXNzaW9uLm1ldGFkYXRhO1xuXHRcdGNvbnN0IHN0YXRlID0gbWV0YWRhdGE/LnB1bGxSZXF1ZXN0U3RhdGU7XG5cdFx0aWYgKHR5cGVvZiBzdGF0ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBjb21wdXRlUHVsbFJlcXVlc3RJY29uKHN0YXRlIGFzIEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUgfCAnZHJhZnQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RQdWxsUmVxdWVzdFVyaShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RVcmkoc2Vzc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0Q2hhbmdlcyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10ge1xuXHRcdGlmICghc2Vzc2lvbi5jaGFuZ2VzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmIChBcnJheS5pc0FycmF5KHNlc3Npb24uY2hhbmdlcykpIHtcblx0XHRcdHJldHVybiBzZXNzaW9uLmNoYW5nZXMgYXMgSVNlc3Npb25GaWxlQ2hhbmdlW107XG5cdFx0fVxuXHRcdC8vIFN1bW1hcnkgb2JqZWN0IFx1MjAxNCBjcmVhdGUgYSBzeW50aGV0aWMgZW50cnkgZm9yIHRvdGFsIGluc2VydGlvbnMvZGVsZXRpb25zXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHNlc3Npb24uY2hhbmdlcyBhcyB7IHJlYWRvbmx5IGZpbGVzOiBudW1iZXI7IHJlYWRvbmx5IGluc2VydGlvbnM6IG51bWJlcjsgcmVhZG9ubHkgZGVsZXRpb25zOiBudW1iZXIgfTtcblx0XHRpZiAoc3VtbWFyeS5pbnNlcnRpb25zID4gMCB8fCBzdW1tYXJ5LmRlbGV0aW9ucyA+IDApIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRtb2RpZmllZFVyaTogVVJJLnBhcnNlKCdzdW1tYXJ5Oi8vY2hhbmdlcycpLFxuXHRcdFx0XHRpbnNlcnRpb25zOiBzdW1tYXJ5Lmluc2VydGlvbnMsXG5cdFx0XHRcdGRlbGV0aW9uczogc3VtbWFyeS5kZWxldGlvbnMsXG5cdFx0XHR9XTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdENoZWNrcG9pbnRzKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBJQ2hhdENoZWNrcG9pbnRzIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHNlc3Npb24ubWV0YWRhdGE7XG5cdFx0aWYgKHR5cGVvZiBtZXRhZGF0YT8uZmlyc3RDaGVja3BvaW50UmVmICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgbWV0YWRhdGE/Lmxhc3RDaGVja3BvaW50UmVmICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zmlyc3RDaGVja3BvaW50UmVmOiBtZXRhZGF0YS5maXJzdENoZWNrcG9pbnRSZWYsXG5cdFx0XHRsYXN0Q2hlY2twb2ludFJlZjogbWV0YWRhdGEubGFzdENoZWNrcG9pbnRSZWYsXG5cdFx0fSBzYXRpc2ZpZXMgSUNoYXRDaGVja3BvaW50cztcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkV29ya3NwYWNlKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qge1xuXHRcdFx0cmVwb1VyaSxcblx0XHRcdHdvcmt0cmVlVXJpLFxuXHRcdFx0YnJhbmNoTmFtZSxcblx0XHRcdGJhc2VCcmFuY2hOYW1lLFxuXHRcdFx0YmFzZUJyYW5jaFByb3RlY3RlZCxcblx0XHRcdGhhc0dpdEh1YlJlbW90ZSxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHRcdGluY29taW5nQ2hhbmdlcyxcblx0XHRcdG91dGdvaW5nQ2hhbmdlcyxcblx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlcyxcblx0XHRcdGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3Ncblx0XHR9ID0gdGhpcy5fZXh0cmFjdFJlcG9zaXRvcnlGcm9tTWV0YWRhdGEoc2Vzc2lvbik7XG5cblx0XHRjb25zdCByZXBvVXJpUmVzb2x2ZWQgPSByZXBvVXJpID8/IFVSSS5wYXJzZSgndW5rbm93bjovLy8nKTtcblxuXHRcdGNvbnN0IGdpdFJlcG9zaXRvcnk6IElTZXNzaW9uR2l0UmVwb3NpdG9yeSA9IHtcblx0XHRcdHVyaTogcmVwb1VyaVJlc29sdmVkLFxuXHRcdFx0d29ya1RyZWVVcmk6IHdvcmt0cmVlVXJpLFxuXHRcdFx0YnJhbmNoTmFtZSxcblx0XHRcdGJhc2VCcmFuY2hOYW1lLFxuXHRcdFx0YmFzZUJyYW5jaFByb3RlY3RlZCxcblx0XHRcdGhhc0dpdEh1YlJlbW90ZSxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHRcdGluY29taW5nQ2hhbmdlcyxcblx0XHRcdG91dGdvaW5nQ2hhbmdlcyxcblx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlcyxcblx0XHRcdGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MsXG5cdFx0XHRnaXRIdWJJbmZvOiB0aGlzLmdpdEh1YkluZm8sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGZvbGRlcjogSVNlc3Npb25Gb2xkZXIgPSB7XG5cdFx0XHRyb290OiByZXBvVXJpUmVzb2x2ZWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrdHJlZVVyaSA/PyByZXBvVXJpUmVzb2x2ZWQsXG5cdFx0XHRuYW1lOiBiYXNlbmFtZShyZXBvVXJpUmVzb2x2ZWQpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGJyYW5jaE5hbWUsXG5cdFx0XHRnaXRSZXBvc2l0b3J5LFxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiByZXBvVXJpUmVzb2x2ZWQsXG5cdFx0XHRsYWJlbDogZ2l0aHViUmVtb3RlUmVwb0xhYmVsKHJlcG9VcmlSZXNvbHZlZCkgPz8gZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbikgPz8gYmFzZW5hbWUocmVwb1VyaVJlc29sdmVkKSxcblx0XHRcdGljb246IHJlcG9Vcmk/LnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSA/IENvZGljb24ucmVwbyA6IENvZGljb24uZm9sZGVyLFxuXHRcdFx0Z3JvdXA6IHJlcG9Vcmk/LnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSA/IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLFxuXHRcdFx0Zm9sZGVyczogW2ZvbGRlcl0sXG5cdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBzZXNzaW9uLnByb3ZpZGVyVHlwZSAhPT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBzZXNzaW9uLnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdCByZXBvc2l0b3J5L3dvcmt0cmVlIGluZm9ybWF0aW9uIGZyb20gc2Vzc2lvbiBtZXRhZGF0YS5cblx0ICogTWlycm9ycyB0aGUgbG9naWMgaW4gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRSZXBvc2l0b3J5RnJvbU1ldGFkYXRhKCkuXG5cdCAqL1xuXHRwcml2YXRlIF9leHRyYWN0UmVwb3NpdG9yeUZyb21NZXRhZGF0YShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKToge1xuXHRcdHJlYWRvbmx5IHJlcG9Vcmk/OiBVUkk7XG5cdFx0cmVhZG9ubHkgd29ya3RyZWVVcmk/OiBVUkk7XG5cdFx0cmVhZG9ubHkgYnJhbmNoTmFtZT86IHN0cmluZztcblx0XHRyZWFkb25seSBiYXNlQnJhbmNoTmFtZT86IHN0cmluZztcblx0XHRyZWFkb25seSBiYXNlQnJhbmNoUHJvdGVjdGVkPzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBoYXNHaXRIdWJSZW1vdGU/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHVwc3RyZWFtQnJhbmNoTmFtZT86IHN0cmluZztcblx0XHRyZWFkb25seSBpbmNvbWluZ0NoYW5nZXM/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgb3V0Z29pbmdDaGFuZ2VzPzogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IHVuY29tbWl0dGVkQ2hhbmdlcz86IG51bWJlcjtcblx0XHRyZWFkb25seSBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzPzogYm9vbGVhbjtcblx0fSB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBzZXNzaW9uLm1ldGFkYXRhO1xuXHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlclR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCkge1xuXHRcdFx0aWYgKHR5cGVvZiBtZXRhZGF0YS5vd25lciAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIG1ldGFkYXRhLm5hbWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJyYW5jaCA9IHR5cGVvZiBtZXRhZGF0YS5icmFuY2ggPT09ICdzdHJpbmcnID8gbWV0YWRhdGEuYnJhbmNoIDogJ0hFQUQnO1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeVVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdFx0c2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLFxuXHRcdFx0XHRhdXRob3JpdHk6ICdnaXRodWInLFxuXHRcdFx0XHRwYXRoOiBgLyR7bWV0YWRhdGEub3duZXJ9LyR7bWV0YWRhdGEubmFtZX0vJHtlbmNvZGVVUklDb21wb25lbnQoYnJhbmNoKX1gXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHJlcG9Vcmk6IHJlcG9zaXRvcnlVcmkgfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXBvVXJpID0gdHlwZW9mIG1ldGFkYXRhPy5yZXBvc2l0b3J5UGF0aCA9PT0gJ3N0cmluZydcblx0XHRcdD8gVVJJLmZpbGUobWV0YWRhdGEucmVwb3NpdG9yeVBhdGgpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IHR5cGVvZiBtZXRhZGF0YT8ud29ya3RyZWVQYXRoID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBVUkkuZmlsZShtZXRhZGF0YS53b3JrdHJlZVBhdGgpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXBvVXJpLFxuXHRcdFx0d29ya3RyZWVVcmksXG5cdFx0XHRicmFuY2hOYW1lOiBtZXRhZGF0YT8uYnJhbmNoTmFtZSBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0XHRiYXNlQnJhbmNoTmFtZTogbWV0YWRhdGE/LmJhc2VCcmFuY2hOYW1lIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRcdGJhc2VCcmFuY2hQcm90ZWN0ZWQ6IG1ldGFkYXRhPy5iYXNlQnJhbmNoUHJvdGVjdGVkIGFzIGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdFx0XHRoYXNHaXRIdWJSZW1vdGU6IG1ldGFkYXRhPy5oYXNHaXRIdWJSZW1vdGUgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogbWV0YWRhdGE/LnVwc3RyZWFtQnJhbmNoTmFtZSBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0XHRpbmNvbWluZ0NoYW5nZXM6IG1ldGFkYXRhPy5pbmNvbWluZ0NoYW5nZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdFx0b3V0Z29pbmdDaGFuZ2VzOiBtZXRhZGF0YT8ub3V0Z29pbmdDaGFuZ2VzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogbWV0YWRhdGE/LnVuY29tbWl0dGVkQ2hhbmdlcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0XHRoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzOiBtZXRhZGF0YT8uaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcyBhcyBib29sZWFuIHwgdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqIERlZmF1bHQgc2Vzc2lvbnMgcHJvdmlkZXIgZm9yIENvcGlsb3QgQ0xJIGFuZCBDbG91ZCBzZXNzaW9uIHR5cGVzLlxuICogV3JhcHMgdGhlIGV4aXN0aW5nIHNlc3Npb24gaW5mcmFzdHJ1Y3R1cmUgaW50byB0aGUgZXh0ZW5zaWJsZSBwcm92aWRlciBtb2RlbC5cbiAqL1xuZXhwb3J0IGNsYXNzIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgaWQgPSBDT1BJTE9UX1BST1ZJREVSX0lEO1xuXHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdjb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXInLCBcIkNvcGlsb3QgQ2hhdFwiKTtcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uY29waWxvdDtcblx0cmVhZG9ubHkgb3JkZXIgPSAwO1xuXG5cdGdldCBzZXNzaW9uVHlwZXMoKTogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10ge1xuXHRcdGNvbnN0IHR5cGVzOiBJU2Vzc2lvblR5cGVbXSA9IFtdO1xuXHRcdGlmICh0aGlzLl9pc0NvcGlsb3RDbGlBdmFpbGFibGUoKSkge1xuXHRcdFx0dHlwZXMucHVzaChDb3BpbG90Q0xJU2Vzc2lvblR5cGUpO1xuXHRcdH1cblx0XHR0eXBlcy5wdXNoKENvcGlsb3RDbG91ZFNlc3Npb25UeXBlKTtcblx0XHRyZXR1cm4gdHlwZXM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PElTZXNzaW9uQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcGxhY2VTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXG5cdC8qKiBDYWNoZSBvZiBhZGFwdGVkIHNlc3Npb25zLCBrZXllZCBieSByZXNvdXJjZSBVUkkgc3RyaW5nLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQWdlbnRTZXNzaW9uQWRhcHRlciB8IENvcGlsb3RDTElTZXNzaW9uIHwgUmVtb3RlTmV3U2Vzc2lvbj4oKTtcblxuXHQvKipcblx0ICogUmVzb3VyY2VzIG9mIGNvbW1pdHRlZCBzZXNzaW9ucyB0aGF0IGFyZSBjdXJyZW50bHkgaW4tZmxpZ2h0IChpLmUuXG5cdCAqIGJldHdlZW4ge0BsaW5rIF9zZW5kRmlyc3RDaGF0fSBlbnRlcmluZyB0aGUgc2VuZCBhbmQgdGhlIHJlcGxhY2Vcblx0ICogZXZlbnQgZmlyaW5nKS4gUHJvdGVjdGVkIGZyb20gc3B1cmlvdXMgcmVtb3ZhbCBieVxuXHQgKiB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uQ2FjaGV9IHNvIHRoYXQgYSBjb25jdXJyZW50IG1vZGVsIHJlLXJlc29sdmVcblx0ICogY2Fubm90IHRyYW5zaWVudGx5IGRyb3AgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0Q29tbWl0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKiBDYWNoZSBvZiBJU2Vzc2lvbiB3cmFwcGVycywga2V5ZWQgYnkgc2Vzc2lvbiBncm91cCBJRC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkdyb3VwQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb24+KCk7XG5cblx0LyoqIENhY2hlIG9mIGNoYXRzIGtleWVkIGJ5IHJhdyBzZXNzaW9uIElEIChyZXNvdXJjZSBwYXRoIHdpdGhvdXQgbGVhZGluZyBzbGFzaCkuICovXG5cdHByaXZhdGUgX2NoYXRCeVJhd1Nlc3Npb25JZENhY2hlOiBNYXA8c3RyaW5nLCBJQ29waWxvdENoYXRTZXNzaW9uPiB8IHVuZGVmaW5lZDtcblxuXHQvKiogQ2FjaGUgb2YgZGVyaXZlZCBncm91cCBJRHMga2V5ZWQgYnkgY2hhdCBJRC4gKi9cblx0cHJpdmF0ZSBfZ3JvdXBJZEJ5Q2hhdElkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cblx0LyoqIENhY2hlIG9mIHNvcnRlZCBjaGF0IElEcyBrZXllZCBieSBncm91cCBJRC4gKi9cblx0cHJpdmF0ZSBfY2hhdElkc0J5R3JvdXBJZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEVtaXR0ZXIgZmlyZWQgd2hlbiB0aGUgc2V0IG9mIGNoYXRzIGluIGEgZ3JvdXAgY2hhbmdlcyxcblx0ICogdXNlZCB0byB1cGRhdGUgdGhlIGNoYXRzIG9ic2VydmFibGUgaW4gYF9jaGF0VG9TZXNzaW9uYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBzZXNzaW9uSWQ6IHN0cmluZyB9PigpKTtcblxuXHQvKipcblx0ICogUGVyLWdyb3VwIHNpZ25hbHMsIGtleWVkIGJ5IGBzZXNzaW9uSWRgLCB0aGF0IGludmFsaWRhdGUgYSBzaW5nbGUgZ3JvdXAnc1xuXHQgKiBjaGF0cyBvYnNlcnZhYmxlLiBBIGdyb3VwJ3MgY2hhdHMgZGVyaXZlZCBvYnNlcnZlcyBvbmx5IGl0cyBvd24gc2lnbmFsLCBzbyBhXG5cdCAqIG1lbWJlcnNoaXAgY2hhbmdlIHJlY29tcHV0ZXMganVzdCB0aGUgYWZmZWN0ZWQgZ3JvdXAgcmF0aGVyIHRoYW4gZXZlcnkgb2JzZXJ2ZWRcblx0ICogZ3JvdXAuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cE1lbWJlcnNoaXBTaWduYWxzID0gbmV3IE1hcDxzdHJpbmcsIElPYnNlcnZhYmxlU2lnbmFsPHZvaWQ+PigpO1xuXG5cdC8qKlxuXHQgKiBBIHNpbmdsZSBzdWJzY3JpcHRpb24gdG8gYF9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZWAgdGhhdCBmYW5zIGVhY2ggZXZlbnQgb3V0XG5cdCAqIHRvIHRoZSBhZmZlY3RlZCBncm91cCdzIG93biBzaWduYWwuIFN1YnNjcmliaW5nIGV4YWN0bHkgb25jZSAoaW5zdGVhZCBvZiBvbmNlIHBlclxuXHQgKiBzZXNzaW9uKSBrZWVwcyB0aGUgZW1pdHRlcidzIGxpc3RlbmVyIGNvdW50IGNvbnN0YW50IHJlZ2FyZGxlc3Mgb2YgaG93IG1hbnlcblx0ICogc2Vzc2lvbnMgZXhpc3QgXHUyMDE0IHRoZSBwZXItc2Vzc2lvbiBzdWJzY3JpcHRpb25zIHByZXZpb3VzbHkgbGVha2VkIGxpc3RlbmVycyBhc1xuXHQgKiBzZXNzaW9ucyBhY2N1bXVsYXRlZC5cblx0ICovXG5cdHByaXZhdGUgX3JlZ2lzdGVyR3JvdXBNZW1iZXJzaGlwRmFuT3V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlLmV2ZW50KGUgPT4ge1xuXHRcdFx0dGhpcy5fZ3JvdXBNZW1iZXJzaGlwU2lnbmFscy5nZXQoZS5zZXNzaW9uSWQpPy50cmlnZ2VyKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tdWx0aUNoYXRFbmFibGVkOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX2lzQ29waWxvdENsaUF2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKTtcblx0fVxuXG5cdHJlYWRvbmx5IGJyb3dzZUFjdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uW107XG5cdHJlYWRvbmx5IHN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJR2l0SHViU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdEBJUHVsbFJlcXVlc3RJY29uQ2FjaGUgcHJpdmF0ZSByZWFkb25seSBwdWxsUmVxdWVzdEljb25DYWNoZTogSVB1bGxSZXF1ZXN0SWNvbkNhY2hlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fbXVsdGlDaGF0RW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9NVUxUSV9DSEFUX1NFVFRJTkcpID8/IHRydWU7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLmFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmZpcmUoKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9uQ2FjaGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmJyb3dzZUFjdGlvbnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVwb3NpdG9yaWVzJywgXCJSZXBvc2l0b3JpZXNcIiksXG5cdFx0XHRcdGdyb3VwOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsXG5cdFx0XHRcdGljb246IENvZGljb24ubGlicmFyeSxcblx0XHRcdFx0cHJvdmlkZXJJZDogdGhpcy5pZCxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9icm93c2VGb3JSZXBvKCksXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHQvLyBGb3J3YXJkIHNlc3Npb24gY2hhbmdlcyBmcm9tIHRoZSB1bmRlcmx5aW5nIG1vZGVsXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9uQ2FjaGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlckdyb3VwTWVtYmVyc2hpcEZhbk91dCgpO1xuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25DYWNoZSgpO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbnMgLS1cblxuXHRnZXRTZXNzaW9uVHlwZXMod29ya3NwYWNlVXJpOiBVUkkpOiBJU2Vzc2lvblR5cGVbXSB7XG5cdFx0aWYgKHdvcmtzcGFjZVVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUgfHwgd29ya3NwYWNlVXJpLnNjaGVtZSA9PT0gU2Vzc2lvblR5cGUuQ29waWxvdENsb3VkKSB7XG5cdFx0XHRyZXR1cm4gW0NvcGlsb3RDbG91ZFNlc3Npb25UeXBlXTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZXM6IElTZXNzaW9uVHlwZVtdID0gW107XG5cdFx0aWYgKHRoaXMuX2lzQ29waWxvdENsaUF2YWlsYWJsZSgpKSB7XG5cdFx0XHR0eXBlcy5wdXNoKENvcGlsb3RDTElTZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlcztcblx0fVxuXG5cdGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10ge1xuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25DYWNoZSgpO1xuXG5cdFx0aWYgKCF0aGlzLl9pc011bHRpQ2hhdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKS5tYXAoY2hhdCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGNoYXQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxDaGF0cyA9IEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKS5zb3J0KChhLCBiKSA9PiBhLmNyZWF0ZWRBdC5nZXRUaW1lKCkgLSBiLmNyZWF0ZWRBdC5nZXRUaW1lKCkpO1xuXG5cdFx0Ly8gR3JvdXAgY2hhdHMgdXNpbmcgc2Vzc2lvblBhcmVudElkIGZyb20gbWV0YWRhdGFcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBhbGxDaGF0cykge1xuXHRcdFx0Y29uc3QgZ3JvdXBJZCA9IHRoaXMuX2dldEdyb3VwSWRGb3JDaGF0KGNoYXQpO1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhncm91cElkKSkge1xuXHRcdFx0XHRzZWVuLmFkZChncm91cElkKTtcblx0XHRcdFx0c2Vzc2lvbnMucHVzaCh0aGlzLl9jaGF0VG9TZXNzaW9uKGNoYXQpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb25zO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbiBMaWZlY3ljbGUgLS1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXdTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgTmV3U2Vzc2lvbj4oKSk7XG5cblx0LyoqXG5cdCAqIENsZWFyIHRoZSB0cmFja2VkIG5ldyBzZXNzaW9uIHdpdGggdGhlIGdpdmVuIHNlc3Npb24ncyBpZCwgYnV0IG9ubHkgaWZcblx0ICogdGhlIG1hcCBzdGlsbCBob2xkcyBleGFjdGx5IHRoYXQgaW5zdGFuY2UuIEFzeW5jIGZsb3dzIChjb21taXQgd2FpdCxcblx0ICogY2FjaGUgcG9wdWxhdGlvbikgbWF5IGNvbXBsZXRlIGFmdGVyIHRoZSBlbnRyeSB3YXMgYWxyZWFkeSByZXBsYWNlZCBvclxuXHQgKiByZW1vdmVkIFx1MjAxNCBhY3RpbmcgdW5jb25kaXRpb25hbGx5IHdvdWxkIGRpc3Bvc2UgYW4gdW5yZWxhdGVkIHNlc3Npb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBzZXNzaW9uIFRoZSBzZXNzaW9uIHRoYXQgaW5pdGlhdGVkIHRoZSBhc3luYyBmbG93LlxuXHQgKiBAcGFyYW0gbGVhayBXaGVuIGB0cnVlYCB1c2Uge0BsaW5rIERpc3Bvc2FibGVNYXAuZGVsZXRlQW5kTGVha31cblx0ICogICAgICAgICAgICAgKHRoZSBzZXNzaW9uIGlzIHN0aWxsIHJlZmVyZW5jZWQgZWxzZXdoZXJlLCBlLmcuIHRoZSBzZXNzaW9uXG5cdCAqICAgICAgICAgICAgIGNhY2hlKTsgb3RoZXJ3aXNlIHVzZSB7QGxpbmsgRGlzcG9zYWJsZU1hcC5kZWxldGVBbmREaXNwb3NlfS5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFyQ3VycmVudE5ld1Nlc3Npb25JZk1hdGNoKHNlc3Npb246IE5ld1Nlc3Npb24sIGxlYWs/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uLnNlc3Npb25JZCkgPT09IHNlc3Npb24pIHtcblx0XHRcdGlmIChsZWFrKSB7XG5cdFx0XHRcdHRoaXMuX25ld1Nlc3Npb25zLmRlbGV0ZUFuZExlYWsoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9uZXdTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdGdldFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBJQ29waWxvdENoYXRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiBuZXdTZXNzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdH1cblxuXHRjcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZVVyaTogVVJJLCBzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5yZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZVVyaSk7XG5cdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgd29ya3NwYWNlIGZvciBVUkk6ICR7d29ya3NwYWNlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmtzcGFjZVVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRcdGlmIChzZXNzaW9uVHlwZUlkICE9PSBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ09ubHkgQ29waWxvdCBDbG91ZCBzZXNzaW9ucyBjYW4gYmUgY3JlYXRlZCBmb3IgR2l0SHViIHJlcG9zaXRvcmllcycpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiBgL3VudGl0bGVkLSR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZU5ld1Nlc3Npb24sIHJlc291cmNlLCB3b3Jrc3BhY2UsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgdGhpcy5pZCk7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYXRUb1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb25UeXBlSWQgIT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBzZXNzaW9uIHR5cGUgJyR7c2Vzc2lvblR5cGVJZH0nIGZvciBsb2NhbCB3b3Jrc3BhY2VzYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiBgL3VudGl0bGVkLSR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90Q0xJU2Vzc2lvbiwgcmVzb3VyY2UsIHdvcmtzcGFjZSwgdGhpcy5pZCk7XG5cdFx0c2Vzc2lvbi5zZXRQZXJtaXNzaW9uTGV2ZWwodGhpcy5fZGVmYXVsdFBlcm1pc3Npb25MZXZlbCgpKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdHJldHVybiB0aGlzLl9jaGF0VG9TZXNzaW9uKHNlc3Npb24pO1xuXHR9XG5cblx0Y3JlYXRlUXVpY2tDaGF0KF9zZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0Ly8gVGhpcyBwcm92aWRlciBpcyB3b3Jrc3BhY2UtYm91bmQgYW5kIGRvZXMgbm90IGFkdmVydGlzZVxuXHRcdC8vIGBzdXBwb3J0c1F1aWNrQ2hhdHNgOyBjYWxsZXJzIG11c3QgZ2F0ZSBvbiB0aGF0IGNhcGFiaWxpdHkuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0cycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBpbml0aWFsIHBlcm1pc3Npb24gbGV2ZWwgZm9yIGEgYnJhbmQtbmV3IHNlc3Npb24gZnJvbVxuXHQgKiBgY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0YCwgY2xhbXBlZCB0byBgRGVmYXVsdGAgd2hlbiBlbnRlcnByaXNlIHBvbGljeVxuXHQgKiBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZhbC5cblx0ICovXG5cdHByaXZhdGUgX2RlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKTogQ2hhdFBlcm1pc3Npb25MZXZlbCB7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXHRcdGlmIChwb2xpY3lSZXN0cmljdGVkKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHRcdH1cblx0XHRjb25zdCBsZXZlbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblx0XHRyZXR1cm4gaXNDaGF0UGVybWlzc2lvbkxldmVsKGxldmVsKSA/IGxldmVsIDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlTW9kZWxzKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHQvLyBNb2RlbHMgY2FuIGNoYW5nZSBiZWNhdXNlIGxhbmd1YWdlIG1vZGVscyBhcmUgKHVuKXJlZ2lzdGVyZWQgb3IgYmVjYXVzZVxuXHRcdC8vIHRoZSBleHRlbnNpb24gaG9zdCB1cGRhdGVzIGEgY2xvdWQgc2Vzc2lvbidzIGBtb2RlbHNgIG9wdGlvbiBncm91cC5cblx0XHRyZXR1cm4gRXZlbnQuc2lnbmFsKEV2ZW50LmFueShcblx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMsXG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VPcHRpb25Hcm91cHNcblx0XHQpKTtcblx0fVxuXG5cdGdldE1vZGVsc1NuYXBzaG90KHNlc3Npb25JZDogc3RyaW5nLCBkZXNpcmVkTW9kZWxJZD86IHN0cmluZyk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbiBpbnN0YW5jZW9mIFJlbW90ZU5ld1Nlc3Npb24pIHtcblx0XHRcdC8vIENsb3VkIHNlc3Npb25zOiBtb2RlbHMgY29tZSBmcm9tIHRoZSBleHRlbnNpb24taG9zdCBgbW9kZWxzYCBvcHRpb25cblx0XHRcdC8vIGdyb3VwIHJhdGhlciB0aGFuIGZyb20gcmVnaXN0ZXJlZCBsYW5ndWFnZSBtb2RlbHMuIFN5bnRoZXNpemVcblx0XHRcdC8vIGxhbmd1YWdlLW1vZGVsIG1ldGFkYXRhIGZyb20gZWFjaCBvcHRpb24gaXRlbSBzbyB0aGUgc2hhcmVkIG1vZGVsXG5cdFx0XHQvLyBwaWNrZXIgd2lkZ2V0IGNhbiByZW5kZXIgdGhlbSBsaWtlIHJlZ3VsYXIgbGFuZ3VhZ2UgbW9kZWxzLlxuXHRcdFx0Y29uc3QgeyBtb2RlbE9wdGlvbiwgaXNSZXNvbHZlZCB9ID0gc2Vzc2lvbi5nZXRNb2RlbE9wdGlvbnNTbmFwc2hvdCgpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbW9kZWxPcHRpb24/Lmdyb3VwLml0ZW1zLm1hcCgoaXRlbSk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9PiB0aGlzLl90b1N5bnRoZXRpY01vZGVsKGl0ZW0pKSA/PyBbXTtcblx0XHRcdC8vIENsb3VkIG1vZGVsIHJlYWRpbmVzcyBjb21lcyBmcm9tIHRoZSBleHRlbnNpb24taG9zdCBvcHRpb24gZ3JvdXAsIG5vdCBsYW5ndWFnZS1tb2RlbCB2ZW5kb3JzLlxuXHRcdFx0cmV0dXJuIHsgbW9kZWxzLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHZlTW9kZWxJZGVudGlmaWVyKG1vZGVscywgZGVzaXJlZE1vZGVsSWQsIGlzUmVzb2x2ZWQpLCBtb2RlbFRhcmdldDogc2Vzc2lvbi5zZXNzaW9uVHlwZSB9O1xuXHRcdH1cblxuXHRcdC8vIENMSSBzZXNzaW9ucyB1c2UgbGFuZ3VhZ2UgbW9kZWxzIHJlZ2lzdGVyZWQgYWdhaW5zdCBgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlYC5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHNlc3Npb24/LnNlc3Npb25UeXBlO1xuXHRcdGlmICghc2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybiB7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHJlc29sdmVNb2RlbElkZW50aWZpZXIoW10sIGRlc2lyZWRNb2RlbElkLCBmYWxzZSksIG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0Y29uc3QgYWxsTW9kZWxzID0gZ2V0UmVnaXN0ZXJlZExhbmd1YWdlTW9kZWxzKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbHMgPSBhbGxNb2RlbHMuZmlsdGVyKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSA9PT0gc2Vzc2lvblR5cGUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlbHMsXG5cdFx0XHRkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHZlTW9kZWxJZGVudGlmaWVyRnJvbUxhbmd1YWdlTW9kZWxzKG1vZGVscywgZGVzaXJlZE1vZGVsSWQsIHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBhbGxNb2RlbHMpLFxuXHRcdFx0bW9kZWxUYXJnZXQ6IHNlc3Npb25UeXBlLFxuXHRcdH07XG5cdH1cblxuXHRnZXRNb2RlbFBpY2tlck9wdGlvbnMoc2Vzc2lvbklkOiBzdHJpbmcpOiBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyB7XG5cdFx0Ly8gQSBzZXNzaW9uIHR5cGUgdGhhdCByZXF1aXJlcyBhbiBleHBsaWNpdCBtb2RlbCBzZWxlY3Rpb24gY2Fubm90IGZhbGxcblx0XHQvLyBiYWNrIHRvIEF1dG8uIFdoZW4gaXQgaGFzIG5vIG1vZGVscywgdGhlIHBpY2tlciBzaG93cyBhIFwiTm8gbW9kZWxzXG5cdFx0Ly8gYXZhaWxhYmxlXCIgc3RhdGUgaW5zdGVhZC4gRGVyaXZlIHRoaXMgZnJvbSB0aGUgY29udHJpYnV0aW9uJ3Ncblx0XHQvLyBkZWNsYXJhdGl2ZSBgc2hvd0F1dG9Nb2RlbGAgZmxhZyByYXRoZXIgdGhhbiBoYXJkY29kaW5nIHNlc3Npb24gdHlwZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbklkKT8uc2Vzc2lvblR5cGU7XG5cdFx0Y29uc3Qgc2hvd0F1dG9Nb2RlbCA9ICFzZXNzaW9uVHlwZSB8fCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc3VwcG9ydHNBdXRvTW9kZWxGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdHJ1ZSxcblx0XHRcdHNob3dGZWF0dXJlZDogdHJ1ZSxcblx0XHRcdHNob3dVbmF2YWlsYWJsZUZlYXR1cmVkOiBmYWxzZSxcblx0XHRcdHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IGZhbHNlLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TeW50aGV0aWNNb2RlbChpdGVtOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSBpdGVtLm1vZGVsTWV0YWRhdGE7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IGl0ZW0uaWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCcnKSxcblx0XHRcdFx0bmFtZTogbW9kZWxNZXRhZGF0YT8ubmFtZSA/PyBpdGVtLm5hbWUsXG5cdFx0XHRcdGlkOiBtb2RlbE1ldGFkYXRhPy5pZCA/PyBpdGVtLmlkLFxuXHRcdFx0XHR2ZW5kb3I6IG1vZGVsTWV0YWRhdGE/LnZlbmRvciA/PyAnJyxcblx0XHRcdFx0dmVyc2lvbjogbW9kZWxNZXRhZGF0YT8udmVyc2lvbiA/PyAnJyxcblx0XHRcdFx0ZmFtaWx5OiBtb2RlbE1ldGFkYXRhPy5mYW1pbHkgPz8gJycsXG5cdFx0XHRcdHRvb2x0aXA6IG1vZGVsTWV0YWRhdGE/LnRvb2x0aXAgPz8gaXRlbS50b29sdGlwLFxuXHRcdFx0XHRwcmljaW5nOiBtb2RlbE1ldGFkYXRhPy5wcmljaW5nLFxuXHRcdFx0XHRtdWx0aXBsaWVyTnVtZXJpYzogbW9kZWxNZXRhZGF0YT8ubXVsdGlwbGllck51bWVyaWMsXG5cdFx0XHRcdGlucHV0Q29zdDogbW9kZWxNZXRhZGF0YT8uaW5wdXRDb3N0LFxuXHRcdFx0XHRvdXRwdXRDb3N0OiBtb2RlbE1ldGFkYXRhPy5vdXRwdXRDb3N0LFxuXHRcdFx0XHRjYWNoZUNvc3Q6IG1vZGVsTWV0YWRhdGE/LmNhY2hlQ29zdCxcblx0XHRcdFx0Y2FjaGVXcml0ZUNvc3Q6IG1vZGVsTWV0YWRhdGE/LmNhY2hlV3JpdGVDb3N0LFxuXHRcdFx0XHRsb25nQ29udGV4dElucHV0Q29zdDogbW9kZWxNZXRhZGF0YT8ubG9uZ0NvbnRleHRJbnB1dENvc3QsXG5cdFx0XHRcdGxvbmdDb250ZXh0T3V0cHV0Q29zdDogbW9kZWxNZXRhZGF0YT8ubG9uZ0NvbnRleHRPdXRwdXRDb3N0LFxuXHRcdFx0XHRsb25nQ29udGV4dENhY2hlQ29zdDogbW9kZWxNZXRhZGF0YT8ubG9uZ0NvbnRleHRDYWNoZUNvc3QsXG5cdFx0XHRcdGxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3Q6IG1vZGVsTWV0YWRhdGE/LmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3QsXG5cdFx0XHRcdHByaWNlQ2F0ZWdvcnk6IG1vZGVsTWV0YWRhdGE/LnByaWNlQ2F0ZWdvcnksXG5cdFx0XHRcdHByb21vOiBtb2RlbE1ldGFkYXRhPy5wcm9tbyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IG1vZGVsTWV0YWRhdGE/Lm1heElucHV0VG9rZW5zID8/IDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogbW9kZWxNZXRhZGF0YT8ubWF4T3V0cHV0VG9rZW5zID8/IDAsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogbW9kZWxNZXRhZGF0YT8uY2FwYWJpbGl0aWVzID8ge1xuXHRcdFx0XHRcdHZpc2lvbjogbW9kZWxNZXRhZGF0YS5jYXBhYmlsaXRpZXMudmlzaW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsaW5nOiBtb2RlbE1ldGFkYXRhLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZyxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0c2V0TW9kZWwoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRNb2RlbElkKG1vZGVsSWQpO1xuXHRcdFx0Ly8gQ2xvdWQgc2Vzc2lvbnMgYWRkaXRpb25hbGx5IHBlcnNpc3QgdGhlIHNlbGVjdGlvbiBhcyB0aGUgdmFsdWUgb2Zcblx0XHRcdC8vIHRoZSBgbW9kZWxzYCBvcHRpb24gZ3JvdXAgc28gdGhlIGV4dGVuc2lvbiBob3N0IGhvbm91cnMgaXQuXG5cdFx0XHRpZiAobmV3U2Vzc2lvbiBpbnN0YW5jZW9mIFJlbW90ZU5ld1Nlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgeyBtb2RlbE9wdGlvbiB9ID0gbmV3U2Vzc2lvbi5nZXRNb2RlbE9wdGlvbnNTbmFwc2hvdCgpO1xuXHRcdFx0XHRjb25zdCBpdGVtID0gbW9kZWxPcHRpb24/Lmdyb3VwLml0ZW1zLmZpbmQoaSA9PiBpLmlkID09PSBtb2RlbElkKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRuZXdTZXNzaW9uLnNldE9wdGlvblZhbHVlKG1vZGVsT3B0aW9uIS5ncm91cC5pZCwgaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHR0aGlzLl9maW5kQ2hhdFNlc3Npb24oc2Vzc2lvbklkKT8uc2V0TW9kZWxJZChtb2RlbElkKTtcblx0fVxuXG5cdHNldE1vZGUoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0U2Vzc2lvbk1vZGUgPSAoc2Vzc2lvbjogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHZvaWQgPT4ge1xuXHRcdFx0bGV0IG1vZGU6IElDaGF0TW9kZSB8IHVuZGVmaW5lZDtcblx0XHRcdHN3aXRjaCAobW9kZUlkKSB7XG5cdFx0XHRcdGNhc2UgQ2hhdE1vZGVLaW5kLkFnZW50OlxuXHRcdFx0XHRcdG1vZGUgPSBDaGF0TW9kZS5BZ2VudDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuRWRpdDpcblx0XHRcdFx0XHRtb2RlID0gQ2hhdE1vZGUuRWRpdDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuQXNrOlxuXHRcdFx0XHRcdG1vZGUgPSBDaGF0TW9kZS5Bc2s7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlcyA9IHRoaXMuY2hhdE1vZGVTZXJ2aWNlLmNyZWF0ZU1vZGVzKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRtb2RlID0gbW9kZXMuZmluZE1vZGVCeUlkKG1vZGVJZCkgPz8gbW9kZXMuZmluZE1vZGVCeU5hbWUobW9kZUlkKTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0bW9kZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZSkge1xuXHRcdFx0XHRzZXNzaW9uLnNldE1vZGUobW9kZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0c2V0U2Vzc2lvbk1vZGUobmV3U2Vzc2lvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5zdXJlU2Vzc2lvbkNhY2hlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRzZXRTZXNzaW9uTW9kZShzZXNzaW9uKTtcblx0XHR9XG5cdH1cblxuXHRzZXRQZXJtaXNzaW9uTGV2ZWwoc2Vzc2lvbklkOiBzdHJpbmcsIGxldmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdGlmIChpc0NoYXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpKSB7XG5cdFx0XHRcdG5ld1Nlc3Npb24uc2V0UGVybWlzc2lvbkxldmVsKGxldmVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24gJiYgaXNDaGF0UGVybWlzc2lvbkxldmVsKGxldmVsKSkge1xuXHRcdFx0c2Vzc2lvbi5zZXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldElzb2xhdGlvbk1vZGUoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChtb2RlICE9PSAnd29ya3RyZWUnICYmIG1vZGUgIT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRJc29sYXRpb25Nb2RlKG1vZGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25DYWNoZSgpO1xuXHRcdHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihzZXNzaW9uSWQpPy5zZXRJc29sYXRpb25Nb2RlKG1vZGUpO1xuXHR9XG5cblx0YXN5bmMgc2V0QnJhbmNoKHNlc3Npb25JZDogc3RyaW5nLCBicmFuY2g6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRCcmFuY2goYnJhbmNoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHR0aGlzLl9maW5kQ2hhdFNlc3Npb24oc2Vzc2lvbklkKT8uc2V0QnJhbmNoKGJyYW5jaCk7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIEFjdGlvbnMgLS1cblxuXHRhc3luYyBhcmNoaXZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFVuY29tbWl0dGVkIChORVcpIHNlc3Npb25zIFx1MjAxNCBpbmNsdWRpbmcgdGhvc2UgdGhhdCB3ZXJlIGNhbmNlbGxlZCBtaWQtZmxpZ2h0IFx1MjAxNFxuXHRcdC8vIG11c3QgYmUgYXJjaGl2ZWQgdmlhIHRoZWlyIGNoYXQtYWRhcHRlciBkaXJlY3RseS4gVGhlaXIgYWdlbnQtaG9zdCBlbnRyeVxuXHRcdC8vIChpZiBhbnksIGZyb20gYGdldE9yQ3JlYXRlQ2hhdFNlc3Npb25gKSBoYXMgcHJvdmlkZXJUeXBlIGBMb2NhbGAsIHdoaWNoXG5cdFx0Ly8gaXMgZmlsdGVyZWQgb3V0IGJ5IGBfcmVmcmVzaFNlc3Npb25DYWNoZWAsIHNvIGNoYW5nZXMgbWFkZSB0aHJvdWdoXG5cdFx0Ly8gYGFnZW50U2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKWAgd291bGQgbmV2ZXIgcHJvcGFnYXRlIHRvIHRoZSBjaGF0XG5cdFx0Ly8gYWRhcHRlcidzIGBfaXNBcmNoaXZlZGAgb2JzZXJ2YWJsZS4gVGhlIHJlc3VsdCB3b3VsZCBiZSBhIG5vLW9wIHRpY2tcblx0XHQvLyBpbiB0aGUgVUkgZXZlbiB0aG91Z2ggdGhlIGFnZW50LWhvc3QgbW9kZWwgdGhpbmtzIHRoZSBzZXNzaW9uIGlzIGFyY2hpdmVkLlxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKGNoYXRTZXNzaW9uICYmIGlzTmV3U2Vzc2lvbihjaGF0U2Vzc2lvbikpIHtcblx0XHRcdGNoYXRTZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX2NoYXRUb1Nlc3Npb24oY2hhdFNlc3Npb24pXSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9maW5kQWdlbnRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKGFnZW50U2Vzc2lvbikge1xuXHRcdFx0YWdlbnRTZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTZWUgYGFyY2hpdmVTZXNzaW9uYCBmb3Igd2h5IE5FVyBzZXNzaW9ucyB0YWtlIGEgc2VwYXJhdGUgcGF0aC5cblx0XHRjb25zdCBjaGF0U2Vzc2lvbiA9IHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChjaGF0U2Vzc2lvbiAmJiBpc05ld1Nlc3Npb24oY2hhdFNlc3Npb24pKSB7XG5cdFx0XHRjaGF0U2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbdGhpcy5fY2hhdFRvU2Vzc2lvbihjaGF0U2Vzc2lvbildIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IHRoaXMuX2ZpbmRBZ2VudFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoYWdlbnRTZXNzaW9uKSB7XG5cdFx0XHRhZ2VudFNlc3Npb24uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEEgZ3JvdXBlZCBzZXNzaW9uJ3MgcmVhZCBzdGF0ZSBhZ2dyZWdhdGVzIGFjcm9zcyBhbGwgaXRzIGNoYXRzLCBzb1xuXHRcdC8vIHVwZGF0ZSBldmVyeSBjaGF0IGluIHRoZSBncm91cDsgZmFsbCBiYWNrIHRvIHRoZSBpZCBpdHNlbGYgd2hlbiB0aGVcblx0XHQvLyBzZXNzaW9uIGlzIHVuZ3JvdXBlZC5cblx0XHRjb25zdCBjaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRjb25zdCB0YXJnZXRJZHMgPSBjaGF0SWRzLmxlbmd0aCA+IDAgPyBjaGF0SWRzIDogW3Nlc3Npb25JZF07XG5cdFx0Zm9yIChjb25zdCBjaGF0SWQgb2YgdGFyZ2V0SWRzKSB7XG5cdFx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9maW5kQWdlbnRTZXNzaW9uKGNoYXRJZCk7XG5cdFx0XHRpZiAoYWdlbnRTZXNzaW9uICYmIGFnZW50U2Vzc2lvbi5pc1JlYWQoKSAhPT0gaXNSZWFkKSB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbi5zZXRSZWFkKGlzUmVhZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXG5cdFx0Ly8gQ29sbGVjdCBhbGwgYWdlbnQgc2Vzc2lvbnMgdG8gZGVsZXRlIChwcmltYXJ5ICsgZ3JvdXAgbWVtYmVycylcblx0XHRjb25zdCBhbGxDaGF0SWRzID0gbmV3IFNldChbc2Vzc2lvbklkLCAuLi5jaGF0SWRzXSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGF0SWQgb2YgYWxsQ2hhdElkcykge1xuXHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5fZmluZEFnZW50U2Vzc2lvbihjaGF0SWQpO1xuXHRcdFx0aWYgKGFnZW50U2Vzc2lvbikge1xuXHRcdFx0XHRhZ2VudFNlc3Npb25zLnB1c2goYWdlbnRTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWdlbnRTZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIFRlbXAgc2Vzc2lvbiB0aGF0IGhhc24ndCBiZWVuIGNvbW1pdHRlZCBcdTIwMTQgcmVtb3ZlIGl0IGRpcmVjdGx5XG5cdFx0XHR0aGlzLl9jbGVhbnVwVGVtcFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9kZWxldGVBZ2VudFNlc3Npb25zKGFnZW50U2Vzc2lvbnMpO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25DYWNoZSgpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbnMoc2Vzc2lvbklkczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBzZXNzaW9uSWRzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5hbWVDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBjaGF0VXJpOiBVUkksIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oY2hhdFVyaSk7XG5cdFx0aWYgKGFnZW50U2Vzc2lvbj8ucHJvdmlkZXJUeXBlID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2dpdGh1Yi5jb3BpbG90LmNsaS5zZXNzaW9ucy5zZXRUaXRsZScsIHsgcmVzb3VyY2U6IGNoYXRVcmkgfSwgdGl0bGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbmFtaW5nIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgc2Vzc2lvbiB0eXBlJyk7XG5cdH1cblxuXHRhc3luYyByZW5hbWVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGF3YWl0IHRoaXMucmVuYW1lQ2hhdChzZXNzaW9uSWQsIHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UsIHRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGVDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBjaGF0VXJpOiBVUkksIG9wdGlvbnM/OiBJRGVsZXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fZmluZFNlc3Npb24oc2Vzc2lvbklkKTtcblxuXHRcdGlmICghc2Vzc2lvbj8uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEZWxldGluZyBpbmRpdmlkdWFsIGNoYXRzIGlzIG5vdCBzdXBwb3J0ZWQgd2hlbiBtdWx0aS1jaGF0IGlzIGRpc2FibGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdElkcyA9IHRoaXMuX2dldENoYXRJZHNJbkdyb3VwKHNlc3Npb25JZCk7XG5cblx0XHQvLyBGaW5kIHRoZSBjaGF0IG1hdGNoaW5nIHRoZSBVUkkgZmlyc3QsIGJlZm9yZSBkZWNpZGluZyB3aGV0aGVyIHRvXG5cdFx0Ly8gZGVsZXRlIHRoZSBlbnRpcmUgc2Vzc2lvbi4gVGhpcyBwcmV2ZW50cyBhY2NpZGVudGFsbHkgZGVsZXRpbmcgdGhlXG5cdFx0Ly8gd2hvbGUgc2Vzc2lvbiB3aGVuIHRoZSBncm91cGluZyBjYWNoZSBpcyBzdGFsZSBhbmQgY2hhdElkcyBkb2Vzbid0XG5cdFx0Ly8gaW5jbHVkZSB0aGUgY2hhdCBiZWluZyBjbG9zZWQuXG5cdFx0Y29uc3QgY2hhdElkID0gY2hhdElkcy5maW5kKGlkID0+IHtcblx0XHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKGlkKSk7XG5cdFx0XHRyZXR1cm4gY2hhdCAmJiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGNoYXRVcmkudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0XHRpZiAoIWNoYXRJZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChjaGF0SWRzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHQvLyBUaGlzIGlzIHRoZSBvbmx5IGNoYXQgaW4gdGhlIHNlc3Npb24gXHUyMDE0IGRlbGV0ZSB0aGUgZW50aXJlIHNlc3Npb25cblx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZXRlIHRoZSB1bmRlcmx5aW5nIGFnZW50IHNlc3Npb24gZmlyc3QuXG5cdFx0Ly8gX3JlZnJlc2hTZXNzaW9uQ2FjaGVNdWx0aUNoYXQgaGFuZGxlcyB0aGUgcmVtb3ZlZCBjaGF0IGdyYWNlZnVsbHk6XG5cdFx0Ly8gaXQgZGV0ZWN0cyB0aGUgY2hhdCBiZWxvbmdzIHRvIGEgZ3JvdXAgd2l0aCByZW1haW5pbmcgc2libGluZ3MgYW5kXG5cdFx0Ly8gZmlyZXMgYSBjaGFuZ2VkIGV2ZW50IG9uIHRoZSBwYXJlbnQgc2Vzc2lvbiBpbnN0ZWFkIG9mIGEgcmVtb3ZlZCBldmVudC5cblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9maW5kQWdlbnRTZXNzaW9uKGNoYXRJZCk7XG5cdFx0aWYgKGFnZW50U2Vzc2lvbikge1xuXHRcdFx0Ly8gQ29uZmlybSBkZWxldGlvbiwgdW5sZXNzIHRoZSBjYWxsZXIgb3B0ZWQgb3V0IChlLmcuIGRpc2NhcmRpbmcgYVxuXHRcdFx0Ly8gdHJhbnNpZW50IHVudGl0bGVkIGRyYWZ0KS5cblx0XHRcdGlmICghb3B0aW9ucz8uc2tpcENvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RlbGV0ZUNoYXQuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGlzIGNoYXQ/XCIpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2RlbGV0ZUNoYXQuZGV0YWlsJywgXCJUaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLlwiKSxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlQ2hhdC5kZWxldGUnLCBcIkRlbGV0ZVwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuX2RlbGV0ZUFnZW50U2Vzc2lvbnMoW2FnZW50U2Vzc2lvbl0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBVbnRpdGxlZCBjaGF0IChub3QgeWV0IGNvbW1pdHRlZCkgLSBjbGVhbiB1cCBkaXJlY3RseVxuXHRcdFx0Y29uc3QgY2hhdCA9IHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihjaGF0SWQpO1xuXHRcdFx0aWYgKGNoYXQpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdFx0XHRpZiAodGhpcy5fbmV3U2Vzc2lvbnMuaGFzKGNoYXRJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKGNoYXRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRHcm91cE1lbWJlcnNoaXBDaGFuZ2UuZmlyZSh7IHNlc3Npb25JZCB9KTtcblx0XHRcdGNvbnN0IHJlbWFpbmluZ0NoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgcHJpbWFyeUNoYXRJZCA9IHJlbWFpbmluZ0NoYXRJZHNbMF07XG5cdFx0XHRjb25zdCBwcmltYXJ5Q2hhdCA9IHByaW1hcnlDaGF0SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKHByaW1hcnlDaGF0SWQpKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwcmltYXJ5Q2hhdCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbdGhpcy5fY2hhdFRvU2Vzc2lvbihwcmltYXJ5Q2hhdCldIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RlbGV0ZUFnZW50U2Vzc2lvbnMoYWdlbnRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpU2Vzc2lvbkl0ZW1zOiB7IHJlc291cmNlOiBVUkk7IGxhYmVsOiBzdHJpbmcgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBhZ2VudFNlc3Npb24gb2YgYWdlbnRTZXNzaW9ucykge1xuXHRcdFx0aWYgKGFnZW50U2Vzc2lvbi5wcm92aWRlclR5cGUgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0XHRjbGlTZXNzaW9uSXRlbXMucHVzaCh7IHJlc291cmNlOiBhZ2VudFNlc3Npb24ucmVzb3VyY2UsIGxhYmVsOiBhZ2VudFNlc3Npb24ubGFiZWwgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLnJlbW92ZUhpc3RvcnlFbnRyeShhZ2VudFNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2xpU2Vzc2lvbkl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2FnZW50cy5naXRodWIuY29waWxvdC5jbGkuZGVsZXRlU2Vzc2lvbnMnLCBjbGlTZXNzaW9uSXRlbXMsIHsgc2tpcENvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmb3JrQ2hhdChzZXNzaW9uSWQ6IHN0cmluZywgX3NvdXJjZUNoYXQ6IFVSSSwgX3R1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBkb2VzIG5vdCBzdXBwb3J0IGZvcmtpbmcgaW50byBhIGNoYXRgKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNpZGVDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBfc291cmNlQ2hhdDogVVJJLCBfdHVybklkOiBzdHJpbmcsIF9zZWxlY3Rpb24/OiBJU2lkZUNoYXRTZWxlY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke3Nlc3Npb25JZH0nIGRvZXMgbm90IHN1cHBvcnQgc2lkZSBjaGF0c2ApO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmV3Q2hhdChzZXNzaW9uSWQ6IHN0cmluZywgX3Byb21wdD86IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRjb25zdCBjdXJyZW50TmV3U2Vzc2lvbiA9IHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChjdXJyZW50TmV3U2Vzc2lvbikge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGN1cnJlbnROZXdTZXNzaW9uO1xuXHRcdFx0KGF3YWl0IHRoaXMuX2NyZWF0ZUNoYXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24pKS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCBuZXdDaGF0ID0gdGhpcy5fdG9DaGF0KHNlc3Npb24pO1xuXHRcdFx0c2Vzc2lvbi5tYWluQ2hhdC5zZXQobmV3Q2hhdCwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBuZXdDaGF0O1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNNdWx0aUNoYXRFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcl0gU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBkb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZU5ld1N1YnNlcXVlbnRDaGF0KHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVOZXdTdWJzZXF1ZW50Q2hhdChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHQvLyBGaW5kIHRoZSBwcmltYXJ5IGNoYXQgZm9yIHRoaXMgc2Vzc2lvblxuXHRcdGNvbnN0IGNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhdElkID0gY2hhdElkc1swXSA/PyBzZXNzaW9uSWQ7XG5cdFx0Y29uc3QgY2hhdCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQodGhpcy5fbG9jYWxJZEZyb21jaGF0SWQoZmlyc3RDaGF0SWQpKTtcblx0XHRpZiAoIWNoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBub3QgZm91bmRgKTtcblx0XHR9XG5cblx0XHRpZiAoY2hhdC5zZXNzaW9uVHlwZSAhPT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ011bHRpcGxlIGNoYXRzIHBlciBzZXNzaW9uIGlzIG9ubHkgc3VwcG9ydGVkIGZvciBDb3BpbG90IENMSSBzZXNzaW9ucycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNoYXQud29ya3NwYWNlLmdldCgpO1xuXHRcdGlmICghd29ya3NwYWNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXQgc2Vzc2lvbiBoYXMgbm8gYXNzb2NpYXRlZCB3b3Jrc3BhY2UnKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXTtcblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdXb3Jrc3BhY2UgaGFzIG5vIGZvbGRlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1dvcmtzcGFjZSA9IHRoaXMucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXIud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFuZXdXb3Jrc3BhY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgd29ya3NwYWNlIGZvciB3b3JraW5nIGRpcmVjdG9yeSBVUkk6ICR7Zm9sZGVyLndvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogYC91bnRpdGxlZC0ke2dlbmVyYXRlVXVpZCgpfWAgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdENMSVNlc3Npb24sIHJlc291cmNlLCBuZXdXb3Jrc3BhY2UsIHRoaXMuaWQpO1xuXHRcdHNlc3Npb24uc2V0TW9kZWxJZChjaGF0Lm1vZGVsSWQuZ2V0KCkpO1xuXHRcdHNlc3Npb24uc2V0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cdFx0c2Vzc2lvbi5zZXRPcHRpb24oUEFSRU5UX1NFU1NJT05fT1BUSU9OX0lELCBjaGF0LnJlc291cmNlLnBhdGguc2xpY2UoMSkpO1xuXHRcdHNlc3Npb24uc2V0UGVybWlzc2lvbkxldmVsKHRoaXMuX2RlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKSk7XG5cdFx0c2Vzc2lvbi5zZXRUaXRsZShsb2NhbGl6ZSgnbmV3IGNoYXQnLCBcIk5ldyBDaGF0XCIpKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXG5cdFx0KGF3YWl0IHRoaXMuX2NyZWF0ZUNoYXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24pKS5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuc2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cblx0XHR0aGlzLl9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZS5maXJlKHsgc2Vzc2lvbklkIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl9jaGF0VG9TZXNzaW9uKHNlc3Npb24pXSB9KTtcblxuXHRcdHJldHVybiB0aGlzLl90b0NoYXQoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBzZW5kUmVxdWVzdChzZXNzaW9uSWQ6IHN0cmluZywgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKG5ld1Nlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UsIGNoYXRSZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0IHJlc291cmNlIGRvZXMgbm90IG1hdGNoIHRoZSBtYWluIGNoYXQgb2YgdGhlIGN1cnJlbnQgbmV3IHNlc3Npb24nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9zZW5kRmlyc3RDaGF0KG5ld1Nlc3Npb24sIGNoYXRSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTXVsdGlwbGUgY2hhdHMgcGVyIHNlc3Npb24gaXMgbm90IHN1cHBvcnRlZCcpO1xuXHRcdH1cblxuXHRcdGlmICghc2Vzc2lvbi5jaGF0cy5nZXQoKS5zb21lKGNoYXQgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoY2hhdC5yZXNvdXJjZSwgY2hhdFJlc291cmNlKSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCAnJHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX0nIGRvZXMgbm90IGJlbG9uZyB0byBzZXNzaW9uICcke3Nlc3Npb25JZH0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gY2hhdFJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb24gPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvbiB8fCAhKGNoYXRTZXNzaW9uIGluc3RhbmNlb2YgQ29waWxvdENMSVNlc3Npb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXQgJyR7Y2hhdFJlc291cmNlLnRvU3RyaW5nKCl9JyBub3QgZm91bmQgaW4gc2Vzc2lvbiAnJHtzZXNzaW9uSWR9J2ApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zZW5kRXhpc3RpbmdDaGF0KHNlc3Npb25JZCwgY2hhdFNlc3Npb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZEZpcnN0Q2hhdChzZXNzaW9uOiBOZXdTZXNzaW9uLCBjaGF0UmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblxuXHRcdGNvbnN0IHsgcXVlcnksIGF0dGFjaGVkQ29udGV4dCB9ID0gb3B0aW9ucztcblxuXHRcdHNlc3Npb24uc2V0VGl0bGUoKG9wdGlvbnMudGl0bGUgfHwgcXVlcnkuc3BsaXQoJ1xcbicpWzBdKS5zdWJzdHJpbmcoMCwgMTAwKSB8fCBsb2NhbGl6ZSgnbmV3IHNlc3Npb24nLCBcIk5ldyBTZXNzaW9uXCIpKTtcblx0XHRzZXNzaW9uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5zZXQoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uKTtcblx0XHR0aGlzLl9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTtcblxuXHRcdC8vIEFkZCB0aGUgbmV3IHNlc3Npb24gdG8gdGhlIHNlc3Npb25zIG1vZGVsIGltbWVkaWF0ZWx5IHNvIGl0IGFwcGVhcnMgaW4gdGhlIHNlc3Npb25zIGxpc3Rcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fY2hhdFRvU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW25ld1Nlc3Npb25dLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvbi50YXJnZXQpO1xuXG5cdFx0Ly8gUmVzb2x2ZSBtb2RlXG5cdFx0Y29uc3QgbW9kZUtpbmQgPSBzZXNzaW9uLmNoYXRNb2RlPy5raW5kID8/IENoYXRNb2RlS2luZC5BZ2VudDtcblx0XHRjb25zdCBtb2RlSXNCdWlsdGluID0gc2Vzc2lvbi5jaGF0TW9kZSA/IGlzQnVpbHRpbkNoYXRNb2RlKHNlc3Npb24uY2hhdE1vZGUpIDogdHJ1ZTtcblx0XHRjb25zdCBtb2RlSWQ6ICdhc2snIHwgJ2FnZW50JyB8ICdlZGl0JyB8ICdjdXN0b20nIHwgdW5kZWZpbmVkID0gbW9kZUlzQnVpbHRpbiA/IG1vZGVLaW5kIDogJ2N1c3RvbSc7XG5cblx0XHRjb25zdCByYXdNb2RlSW5zdHJ1Y3Rpb25zID0gc2Vzc2lvbi5jaGF0TW9kZT8ubW9kZUluc3RydWN0aW9ucz8uZ2V0KCk7XG5cdFx0Y29uc3QgbW9kZUluc3RydWN0aW9ucyA9IHJhd01vZGVJbnN0cnVjdGlvbnMgPyB7XG5cdFx0XHRuYW1lOiBzZXNzaW9uLmNoYXRNb2RlIS5uYW1lLmdldCgpLFxuXHRcdFx0Y29udGVudDogcmF3TW9kZUluc3RydWN0aW9ucy5jb250ZW50LFxuXHRcdFx0dG9vbFJlZmVyZW5jZXM6IHRoaXMudG9vbHNTZXJ2aWNlLnRvVG9vbFJlZmVyZW5jZXMocmF3TW9kZUluc3RydWN0aW9ucy50b29sUmVmZXJlbmNlcyksXG5cdFx0XHRtZXRhZGF0YTogcmF3TW9kZUluc3RydWN0aW9ucy5tZXRhZGF0YSxcblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcGVybWlzc2lvbkxldmVsID0gc2Vzc2lvbi5wZXJtaXNzaW9uTGV2ZWwuZ2V0KCk7XG5cblx0XHRjb25zdCBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IHNlc3Npb24uc2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHtcblx0XHRcdFx0a2luZDogbW9kZUtpbmQsXG5cdFx0XHRcdGlzQnVpbHRpbjogbW9kZUlzQnVpbHRpbixcblx0XHRcdFx0bW9kZUluc3RydWN0aW9ucyxcblx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiBtb2RlSWQsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbCxcblx0XHRcdH0sXG5cdFx0XHRhZ2VudElkU2lsZW50OiBjb250cmlidXRpb24/LnR5cGUsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQsXG5cdFx0XHRoaWRlRnJvbVRyYW5zY3JpcHQ6IG9wdGlvbnMuaGlkZUZyb21UcmFuc2NyaXB0LFxuXHRcdFx0YWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogc2Vzc2lvbiBpbnN0YW5jZW9mIENvcGlsb3RDTElTZXNzaW9uID8gc2Vzc2lvbi5nZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3VwZGF0ZUNoYXRTZXNzaW9uU3RhdGUoY2hhdFJlc291cmNlLCBzZXNzaW9uLCBzZW5kT3B0aW9ucy5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXJdIFNlbmRpbmcgZmlyc3QgY2hhdCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uc2Vzc2lvbklkfSB3aXRoIG9wdGlvbnM6YCwge1xuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogc2VuZE9wdGlvbnMudXNlclNlbGVjdGVkTW9kZWxJZCxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0UmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0Ly8gQ2xlYW4gdXAgdGhlIHRlbXAgc2Vzc2lvbiB0aGF0IHdhcyBhZGRlZCB0byB0aGUgY2FjaGUgYW5kXG5cdFx0XHRcdC8vIGRpc3BhdGNoZWQgYXMgYGFkZGVkYCBhYm92ZSwgc28gdGhlIFVJIGRvZXNuJ3Qga2VlcCBzaG93aW5nXG5cdFx0XHRcdC8vIGEgc3R1Y2sgSW5Qcm9ncmVzcyBzZXNzaW9uIHRoYXQgd2lsbCBuZXZlciBtYWtlIHByb2dyZXNzLlxuXHRcdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChzZXNzaW9uLCAvKiBsZWFrICovIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtuZXdTZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtEZWZhdWx0Q29waWxvdFByb3ZpZGVyXSBzZW5kUmVxdWVzdCByZWplY3RlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRXh0cmFjdCBwcm9taXNlcyB0byBkZXRlY3QgY2FuY2VsbGF0aW9uIHZzIG5vcm1hbCBjb21wbGV0aW9uXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gcmVzdWx0LmtpbmQgPT09ICdzZW50JyA/IHJlc3VsdC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VDcmVhdGVkUHJvbWlzZSA9IHJlc3VsdC5raW5kID09PSAnc2VudCcgPyByZXN1bHQuZGF0YS5yZXNwb25zZUNyZWF0ZWRQcm9taXNlIDogdW5kZWZpbmVkO1xuXHRcdFx0cmVzcG9uc2VDcmVhdGVkUHJvbWlzZT8udGhlbihyID0+IHtcblx0XHRcdFx0aWYgKHI/LmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBMZWFybiB0aGUgY29tbWl0dGVkIHJlc291cmNlICh1bnRpdGxlZCBcdTIxOTIgcmVhbCkgZnJvbSB0aGUgY29tbWl0XG5cdFx0XHRcdC8vIGV2ZW50LCB0aGVuIHByb3RlY3QgaXQgbm93IHRoYXQgd2Uga25vdyBpdC4gQ2xvdWQgc2Vzc2lvbnMgZGVmZXJcblx0XHRcdFx0Ly8gdGhlaXIgY29tbWl0IGJlaGluZCBhIGNvbmZpcm1hdGlvbiArIG5ldHdvcmsgZGVsZWdhdGlvbi5cblx0XHRcdFx0Y29uc3QgY29tbWl0dGVkUmVzb3VyY2UgPSBhd2FpdCB0aGlzLl93YWl0Rm9yQ29tbWl0dGVkU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlLCByZXNwb25zZUNvbXBsZXRlUHJvbWlzZSwgcmVzcG9uc2VDcmVhdGVkUHJvbWlzZSwgeyBkZWZlcnJlZDogc2Vzc2lvbiBpbnN0YW5jZW9mIFJlbW90ZU5ld1Nlc3Npb24gfSk7XG5cdFx0XHRcdHRoaXMuX2luRmxpZ2h0Q29tbWl0cy5hZGQoY29tbWl0dGVkUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBXYWl0IGZvciBfcmVmcmVzaFNlc3Npb25DYWNoZSB0byBwb3B1bGF0ZSB0aGUgY29tbWl0dGVkIGFkYXB0ZXJcblx0XHRcdFx0XHRjb25zdCBjb21taXR0ZWRDaGF0ID0gYXdhaXQgdGhpcy5fd2FpdEZvclNlc3Npb25JbkNhY2hlKGNvbW1pdHRlZFJlc291cmNlLCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChzZXNzaW9uKTtcblxuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdHRlZFNlc3Npb24gPSB0aGlzLl9jaGF0VG9TZXNzaW9uKGNvbW1pdHRlZENoYXQpO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbTogbmV3U2Vzc2lvbiwgdG86IGNvbW1pdHRlZFNlc3Npb24gfSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gY29tbWl0dGVkU2Vzc2lvbjtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9pbkZsaWdodENvbW1pdHMuZGVsZXRlKGNvbW1pdHRlZFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChzZXNzaW9uLCAvKiBsZWFrICovIHRydWUpO1xuXG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtuZXdTZXNzaW9uXSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3U2Vzc2lvbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVuZXhwZWN0ZWQgZXJyb3IgXHUyMDE0IGNsZWFuIHVwIHRoZSB0ZW1wIHNlc3Npb24gZW50aXJlbHlcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbdGhpcy5fY2hhdFRvU2Vzc2lvbihzZXNzaW9uKV0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXJdIEZhaWxlZCB0byBzZW5kIGZpcnN0IGNoYXQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLnNlc3Npb25JZH06YCwgZXJyb3IpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlOiBVUkksIHNlc3Npb246IE5ld1Nlc3Npb24sIHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWwpOiBQcm9taXNlPElEaXNwb3NhYmxlPiB7XG5cdFx0YXdhaXQgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiB0aGlzLl91cGRhdGVDaGF0U2Vzc2lvblN0YXRlKHJlc291cmNlLCBzZXNzaW9uLCBwZXJtaXNzaW9uTGV2ZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShyZXNvdXJjZTogVVJJLCBzZXNzaW9uOiBOZXdTZXNzaW9uLCBwZXJtaXNzaW9uTGV2ZWw/OiBDaGF0UGVybWlzc2lvbkxldmVsKTogUHJvbWlzZTxJRGlzcG9zYWJsZT4ge1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cdFx0aWYgKHNlc3Npb24uc2VsZWN0ZWRNb2RlbElkKSB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZU1vZGVsID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChzZXNzaW9uLnNlbGVjdGVkTW9kZWxJZCk7XG5cdFx0XHRpZiAobGFuZ3VhZ2VNb2RlbCkge1xuXHRcdFx0XHRtb2RlbC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgc2VsZWN0ZWRNb2RlbDogeyBpZGVudGlmaWVyOiBzZXNzaW9uLnNlbGVjdGVkTW9kZWxJZCwgbWV0YWRhdGE6IGxhbmd1YWdlTW9kZWwgfSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHNlc3Npb24uY2hhdE1vZGUpIHtcblx0XHRcdG1vZGVsLmlucHV0TW9kZWwuc2V0U3RhdGUoeyBtb2RlOiB7IGlkOiBzZXNzaW9uLmNoYXRNb2RlLmlkLCBraW5kOiBzZXNzaW9uLmNoYXRNb2RlLmtpbmQgfSB9KTtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb24uc2VsZWN0ZWRPcHRpb25zLnNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UudXBkYXRlU2Vzc2lvbk9wdGlvbnMocmVzb3VyY2UsIHNlc3Npb24uc2VsZWN0ZWRPcHRpb25zKTtcblx0XHR9XG5cdFx0aWYgKHBlcm1pc3Npb25MZXZlbCkge1xuXHRcdFx0bW9kZWwuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7IHBlcm1pc3Npb25MZXZlbCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsUmVmO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmRzIGEgcmVxdWVzdCBmb3IgYW4gZXhpc3RpbmcgY2hhdCBzZXNzaW9uIHRoYXQgaXMgYWxyZWFkeSByZWdpc3RlcmVkXG5cdCAqIGluIHRoZSBjYWNoZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRFeGlzdGluZ0NoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIG5ld0NoYXRTZXNzaW9uOiBDb3BpbG90Q0xJU2Vzc2lvbiwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHQvLyBNYXJrIGFzIGluIHByb2dyZXNzIG5vdyB0aGF0IHdlJ3JlIHNlbmRpbmdcblx0XHRuZXdDaGF0U2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRjb25zdCBrZXkgPSBuZXdDaGF0U2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdFx0Ly8gSW52YWxpZGF0ZSB0aGUgc2Vzc2lvbiBncm91cCBjYWNoZSBzbyBpdCByZWJ1aWxkcyB3aXRoIHRoZSBuZXcgY2hhdFxuXHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl9jaGF0VG9TZXNzaW9uKG5ld0NoYXRTZXNzaW9uKV0gfSk7XG5cblx0XHRjb25zdCB7IHF1ZXJ5LCBhdHRhY2hlZENvbnRleHQgfSA9IG9wdGlvbnM7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24obmV3Q2hhdFNlc3Npb24udGFyZ2V0KTtcblxuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogbmV3Q2hhdFNlc3Npb24uc2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHtcblx0XHRcdFx0a2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnYWdlbnQnLFxuXHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IG5ld0NoYXRTZXNzaW9uLnBlcm1pc3Npb25MZXZlbC5nZXQoKSxcblx0XHRcdH0sXG5cdFx0XHRhZ2VudElkU2lsZW50OiBjb250cmlidXRpb24/LnR5cGUsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQsXG5cdFx0XHRoaWRlRnJvbVRyYW5zY3JpcHQ6IG9wdGlvbnMuaGlkZUZyb21UcmFuc2NyaXB0LFxuXHRcdFx0YWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogbmV3Q2hhdFNlc3Npb24uZ2V0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZygpLFxuXHRcdH07XG5cblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl91cGRhdGVDaGF0U2Vzc2lvblN0YXRlKG5ld0NoYXRTZXNzaW9uLnJlc291cmNlLCBuZXdDaGF0U2Vzc2lvbik7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNlbmQgcmVxdWVzdFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChuZXdDaGF0U2Vzc2lvbi5yZXNvdXJjZSwgcXVlcnksIHNlbmRPcHRpb25zKTtcblx0XHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtEZWZhdWx0Q29waWxvdFByb3ZpZGVyXSBzZW5kUmVxdWVzdCByZWplY3RlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFeHRyYWN0IHByb21pc2VzIHRvIGRldGVjdCBjYW5jZWxsYXRpb24gdnMgbm9ybWFsIGNvbXBsZXRpb25cblx0XHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gcmVzdWx0LmtpbmQgPT09ICdzZW50J1xuXHRcdFx0XHQ/IHJlc3VsdC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VDcmVhdGVkUHJvbWlzZSA9IHJlc3VsdC5raW5kID09PSAnc2VudCdcblx0XHRcdFx0PyByZXN1bHQuZGF0YS5yZXNwb25zZUNyZWF0ZWRQcm9taXNlXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgc2Vzc2lvbiB0byBiZSBjb21taXR0ZWRcblx0XHRcdFx0Y29uc3QgY29tbWl0dGVkUmVzb3VyY2UgPSBhd2FpdCB0aGlzLl93YWl0Rm9yQ29tbWl0dGVkU2Vzc2lvbihuZXdDaGF0U2Vzc2lvbi5yZXNvdXJjZSwgcmVzcG9uc2VDb21wbGV0ZVByb21pc2UsIHJlc3BvbnNlQ3JlYXRlZFByb21pc2UpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbW1pdHRlZENoYXQgPSBhd2FpdCB0aGlzLl93YWl0Rm9yU2Vzc2lvbkluQ2FjaGUoY29tbWl0dGVkUmVzb3VyY2UpO1xuXG5cdFx0XHRcdC8vIENsZWFuIHVwIHRlbXBcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRcdFx0dGhpcy5fY2xlYXJDdXJyZW50TmV3U2Vzc2lvbklmTWF0Y2gobmV3Q2hhdFNlc3Npb24pO1xuXG5cdFx0XHRcdC8vIEludmFsaWRhdGUgdGhlIHNlc3Npb24gZ3JvdXAgY2FjaGUgc28gaXQgcmVidWlsZHMgd2l0aCB0aGUgY29tbWl0dGVkIGNoYXRcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlLmZpcmUoeyBzZXNzaW9uSWQgfSk7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWRTZXNzaW9uID0gdGhpcy5fY2hhdFRvU2Vzc2lvbihjb21taXR0ZWRDaGF0KTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3VwZGF0ZWRTZXNzaW9uXSB9KTtcblxuXHRcdFx0XHRyZXR1cm4gdXBkYXRlZFNlc3Npb247XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChuZXdDaGF0U2Vzc2lvbiwgLyogbGVhayAqLyB0cnVlKTtcblxuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRcdC8vIENhbmNlbGxlZCBiZWZvcmUgY29tbWl0IFx1MjAxNCBrZWVwIHRoZSBjaGF0IGluIHRoZSBncm91cCBzbyB0aGVcblx0XHRcdFx0XHQvLyB1c2VyIGNhbiByZXZpZXcgdGhlIGNvbnRlbnQgdGhlIGFnZW50IHByb2R1Y2VkLlxuXHRcdFx0XHRcdG5ld0NoYXRTZXNzaW9uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0Y29uc3QgdXBkYXRlZFNlc3Npb24gPSB0aGlzLl9jaGF0VG9TZXNzaW9uKG5ld0NoYXRTZXNzaW9uKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbdXBkYXRlZFNlc3Npb25dIH0pO1xuXHRcdFx0XHRcdHJldHVybiB1cGRhdGVkU2Vzc2lvbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVuZXhwZWN0ZWQgZXJyb3IgXHUyMDE0IGNsZWFuIHVwIG9uIGVycm9yLCBmaXJlIGNoYW5nZWQgb24gdGhlIHBhcmVudCBzZXNzaW9uIGdyb3VwXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoa2V5KTtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHRuZXdDaGF0U2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdC8vIEZpbmQgdGhlIHBhcmVudCBzZXNzaW9uJ3MgcHJpbWFyeSBjaGF0IHRvIGZpcmUgYSB2YWxpZCBjaGFuZ2VkIGV2ZW50XG5cdFx0XHRcdGNvbnN0IHBhcmVudENoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRDaGF0SWQgPSBwYXJlbnRDaGF0SWRzWzBdO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gcGFyZW50Q2hhdElkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldCh0aGlzLl9sb2NhbElkRnJvbWNoYXRJZChwYXJlbnRDaGF0SWQpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHBhcmVudENoYXQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbdGhpcy5fY2hhdFRvU2Vzc2lvbihwYXJlbnRDaGF0KV0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciB0aGUgY29tbWl0dGVkIChyZWFsKSBVUkkgZm9yIGEgc2Vzc2lvbiBieSBsaXN0ZW5pbmcgdG8gdGhlXG5cdCAqIHtAbGluayBJQ2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENvbW1pdFNlc3Npb259IGV2ZW50LlxuXHQgKlxuXHQgKiBCeSBkZWZhdWx0IHRoZSB3YWl0IGlzIGJvdW5kZWQgYnkgcmVzcG9uc2UgY29tcGxldGlvbjogaWYgdGhlIHJlc3BvbnNlXG5cdCAqIGZpbmlzaGVzIGJlZm9yZSB0aGUgY29tbWl0IGV2ZW50LCB3ZSBmYWxsIHRocm91Z2ggdG8gYSBzaG9ydCBzYWZldHlcblx0ICogdGltZW91dC4gQ2xvdWQgc2Vzc2lvbnMgaW5zdGVhZCBwYXNzIHtAbGluayBJV2FpdEZvckNvbW1pdE9wdGlvbnMuZGVmZXJyZWR9XG5cdCAqIGJlY2F1c2UgdGhlaXIgY29tbWl0IGlzIGRlbGF5ZWQgYnkgYSBjb25maXJtYXRpb24gcm91bmQtdHJpcCBhbmQgbmV0d29ya1xuXHQgKiBkZWxlZ2F0aW9uIFx1MjAxNCByZXNwb25zZSBjb21wbGV0aW9uIGZpcmVzIGVhcmx5IChhdCB0aGUgY29uZmlybWF0aW9uKSBhbmQgaXNcblx0ICogbm90IGEgc2lnbmFsIHRoYXQgdGhlIGNvbW1pdCB3b24ndCBjb21lIFx1MjAxNCBzbyB0aGV5IHNraXAgdGhlIHJlc3BvbnNlIHJhY2Vcblx0ICogYW5kIHVzZSBhIGxvbmdlciB0aW1lb3V0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvckNvbW1pdHRlZFNlc3Npb24oXG5cdFx0dW50aXRsZWRSZXNvdXJjZTogVVJJLFxuXHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlPzogUHJvbWlzZTx2b2lkPixcblx0XHRyZXNwb25zZUNyZWF0ZWRQcm9taXNlPzogUHJvbWlzZTxJQ2hhdFJlc3BvbnNlTW9kZWw+LFxuXHRcdG9wdGlvbnM/OiB7IGRlZmVycmVkPzogYm9vbGVhbiB9LFxuXHQpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHRpbWVvdXRNcyA9IG9wdGlvbnM/LmRlZmVycmVkID8gNSAqIDYwXzAwMCA6IDVfMDAwO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb21taXRQcm9taXNlID0gbmV3IFByb21pc2U8VVJJPihyZXNvbHZlID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENvbW1pdFNlc3Npb24oZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWwoZS5vcmlnaW5hbCwgdW50aXRsZWRSZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoZS5jb21taXR0ZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghb3B0aW9ucz8uZGVmZXJyZWQgJiYgcmVzcG9uc2VDb21wbGV0ZVByb21pc2UpIHtcblx0XHRcdFx0Ly8gUmFjZSB0aGUgY29tbWl0IGV2ZW50IGFnYWluc3QgdGhlIHJlc3BvbnNlIGNvbXBsZXRpbmcuXG5cdFx0XHRcdGNvbnN0IGNvbW1pdHRlZCA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdFx0Y29tbWl0UHJvbWlzZS50aGVuKHVyaSA9PiAoeyBjb21taXR0ZWQ6IHRydWUgYXMgY29uc3QsIHVyaSB9KSksXG5cdFx0XHRcdFx0cmVzcG9uc2VDb21wbGV0ZVByb21pc2UudGhlbigoKSA9PiAoeyBjb21taXR0ZWQ6IGZhbHNlIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0aWYgKGNvbW1pdHRlZC5jb21taXR0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY29tbWl0dGVkLnVyaTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlc3BvbnNlIGZpbmlzaGVkIGJlZm9yZSB0aGUgY29tbWl0IGV2ZW50IGFycml2ZWQuXG5cdFx0XHRcdC8vIFRoZSBjb21taXQgbWF5IHN0aWxsIGJlIGluLWZsaWdodCBcdTIwMTQgdGhlIGFnZW50IGNvdWxkIGhhdmVcblx0XHRcdFx0Ly8gaW5pdGlhdGVkIHRoZSB3b3JrdHJlZSBiZWZvcmUgdGhlIHVzZXIgY2FuY2VsbGVkLCBhbmQgdGhlXG5cdFx0XHRcdC8vIGFzeW5jIElQQyBjaGFpbiBoYXNuJ3QgZGVsaXZlcmVkIHRoZSBldmVudCB5ZXQuIEZhbGwgdGhyb3VnaFxuXHRcdFx0XHQvLyB0byB0aGUgc2FmZXR5IHRpbWVvdXQgdG8gZ2l2ZSBpdCBhIGNoYW5jZSB0byBhcnJpdmUuXG5cdFx0XHR9XG5cblx0XHRcdC8vIFJhY2UgY29tbWl0IGFnYWluc3QgYSBzYWZldHkgdGltZW91dC4gSWYgYSByZXNwb25zZS1jcmVhdGVkXG5cdFx0XHQvLyBwcm9taXNlIGlzIGF2YWlsYWJsZSwgYWxzbyByYWNlIGl0IHNvIHdlIGNhbiBkZXRlY3Rcblx0XHRcdC8vIGNhbmNlbGxhdGlvbiBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yIHRoZSB0aW1lb3V0LlxuXHRcdFx0Y29uc3QgY2FuZGlkYXRlczogUHJvbWlzZTx7IGtpbmQ6ICdjb21taXQnOyB1cmk6IFVSSSB9IHwgeyBraW5kOiAndGltZW91dCcgfSB8IHsga2luZDogJ2NhbmNlbGxlZCcgfT5bXSA9IFtcblx0XHRcdFx0cmFjZVRpbWVvdXQoY29tbWl0UHJvbWlzZSwgdGltZW91dE1zKS50aGVuKHVyaSA9PiB1cmkgPyB7IGtpbmQ6ICdjb21taXQnIGFzIGNvbnN0LCB1cmkgfSA6IHsga2luZDogJ3RpbWVvdXQnIGFzIGNvbnN0IH0pLFxuXHRcdFx0XTtcblx0XHRcdGlmIChyZXNwb25zZUNyZWF0ZWRQcm9taXNlKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZXMucHVzaChyZXNwb25zZUNyZWF0ZWRQcm9taXNlLnRoZW4ociA9PiByPy5pc0NhbmNlbGVkID8geyBraW5kOiAnY2FuY2VsbGVkJyBhcyBjb25zdCB9IDogbmV3IFByb21pc2U8bmV2ZXI+KCgpID0+IHsgLyogbmV2ZXIgcmVzb2x2ZXMgKi8gfSkpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG91dGNvbWUgPSBhd2FpdCBQcm9taXNlLnJhY2UoY2FuZGlkYXRlcyk7XG5cdFx0XHRpZiAob3V0Y29tZS5raW5kID09PSAnY29tbWl0Jykge1xuXHRcdFx0XHRyZXR1cm4gb3V0Y29tZS51cmk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3V0Y29tZS5raW5kID09PSAnY2FuY2VsbGVkJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdC8vIFRpbWVkIG91dCBcdTIwMTQgbGFzdC1yZXNvcnQgY2hlY2sgZm9yIGNhbmNlbGxhdGlvblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZUNyZWF0ZWRQcm9taXNlID8gYXdhaXQgcmVzcG9uc2VDcmVhdGVkUHJvbWlzZSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyZXNwb25zZT8uaXNDYW5jZWxlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcignVGltZWQgb3V0IHdhaXRpbmcgZm9yIHNlc3Npb24gY29tbWl0Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2FpdHMgZm9yIGFuIHtAbGluayBBZ2VudFNlc3Npb25BZGFwdGVyfSB3aXRoIHRoZSBnaXZlbiByZXNvdXJjZSB0byBhcHBlYXJcblx0ICogaW4gdGhlIHNlc3Npb24gY2FjaGUgKHBvcHVsYXRlZCBieSB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uQ2FjaGV9KS5cblx0ICogT25seSBjYWxsZWQgb25jZSBkdXJpbmcgc2Vzc2lvbiBpbml0aWFsaXNhdGlvbiAoYWZ0ZXIgdGhlIGNvbW1pdCBldmVudCksXG5cdCAqIHNvIHRoZSB0aW1lb3V0IGhhcyBubyBwZXJmb3JtYW5jZSBpbXBhY3Qgb24gc3RlYWR5LXN0YXRlIG9wZXJhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93YWl0Rm9yU2Vzc2lvbkluQ2FjaGUocmVzb3VyY2U6IFVSSSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QWdlbnRTZXNzaW9uQWRhcHRlcj4ge1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nIGluc3RhbmNlb2YgQWdlbnRTZXNzaW9uQWRhcHRlcikge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUHJvbWlzZSA9IG5ldyBQcm9taXNlPEFnZW50U2Vzc2lvbkFkYXB0ZXI+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQoa2V5KTtcblx0XHRcdFx0XHRpZiAoY2FjaGVkIGluc3RhbmNlb2YgQWdlbnRTZXNzaW9uQWRhcHRlcikge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZShjYWNoZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSBhZGFwdGVyIG5vcm1hbGx5IGFwcGVhcnMgd2l0aGluIGEgZmV3IGh1bmRyZWQgbXMgb2YgdGhlIGNvbW1pdFxuXHRcdFx0Ly8gZXZlbnQgdmlhIF9yZWZyZXNoU2Vzc2lvbkNhY2hlLCBidXQgdGhlIHJlZnJlc2ggaXMgZ2F0ZWQgb24gdGhlXG5cdFx0XHQvLyB1bmRlcmx5aW5nIHByb3ZpZGVyJ3MgYHByb3ZpZGVDaGF0U2Vzc2lvbkl0ZW1zYCBjYWxsLiBTb21lIGxlZ2FjeVxuXHRcdFx0Ly8gcHJvdmlkZXJzIChub3RhYmx5IENvcGlsb3QgQ0xJJ3MgVjEgY29udHJpYnV0aW9uKSBzY2FuIGRpc2sgZm9yXG5cdFx0XHQvLyBzZXNzaW9uIG1ldGFkYXRhIG9uIGV2ZXJ5IHJlZnJlc2ggYW5kIGNhbiB0YWtlIDEwKyBzZWNvbmRzIHdoZW5cblx0XHRcdC8vIHRoZSBvbi1kaXNrIHNlc3Npb24gbGlzdCBpcyBsYXJnZSBvciBjb2xkLiBJZiB3ZSBnaXZlIHVwIHRvb1xuXHRcdFx0Ly8gZWFybHkgdGhlIGNoYXQgd2lkZ2V0IG5ldmVyIGdldHMgcmUtYm91bmQgZnJvbSB0aGUgdW50aXRsZWQgVVJJXG5cdFx0XHQvLyB0byB0aGUgY29tbWl0dGVkIFNESyBzZXNzaW9uIFVSSSwgc28gYSBmb2xsb3ctdXAgbWVzc2FnZSB3b3VsZFxuXHRcdFx0Ly8gc3Bhd24gYSBicmFuZCBuZXcgU0RLIHNlc3Npb24gaW5zdGVhZCBvZiBjb250aW51aW5nIHRoZSBleGlzdGluZ1xuXHRcdFx0Ly8gb25lLiBVc2UgYSBnZW5lcm91cyB0aW1lb3V0IHRoYXQgY292ZXJzIHRoZSBzbG93ZXN0IHJlYWxpc3RpY1xuXHRcdFx0Ly8gcmVmcmVzaCB3aGlsZSBzdGlsbCBmYWlsaW5nIGxvdWRseSBpZiBzb21ldGhpbmcgaXMgZ2VudWluZWx5XG5cdFx0XHQvLyBzdHVjay5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KFxuXHRcdFx0XHR0b2tlbiA/IHJhY2VDYW5jZWxsYXRpb25FcnJvcihzZXNzaW9uUHJvbWlzZSwgdG9rZW4pIDogc2Vzc2lvblByb21pc2UsXG5cdFx0XHRcdDMwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBjb21taXR0ZWQgc2Vzc2lvbiBpbiBjYWNoZScpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFByaXZhdGUgLS1cblxuXHRwcml2YXRlIGFzeW5jIF9icm93c2VGb3JSZXBvKCk6IFByb21pc2U8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvSWQgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPHN0cmluZz4oT1BFTl9SRVBPX0NPTU1BTkQpO1xuXHRcdGlmIChyZXBvSWQpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBhdXRob3JpdHk6ICdnaXRodWInLCBwYXRoOiBgLyR7cmVwb0lkfS9IRUFEYCB9KTtcblx0XHRcdGNvbnN0IGZvbGRlcjogSVNlc3Npb25Gb2xkZXIgPSB7XG5cdFx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdXJpLFxuXHRcdFx0XHRuYW1lOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRsYWJlbDogdGhpcy5fbGFiZWxGcm9tVXJpKHVyaSksXG5cdFx0XHRcdGljb246IHRoaXMuX2ljb25Gcm9tVXJpKHVyaSksXG5cdFx0XHRcdGdyb3VwOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsXG5cdFx0XHRcdGZvbGRlcnM6IFtmb2xkZXJdLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiB0cnVlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlc29sdmVXb3Jrc3BhY2UodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJiB1cmkuc2NoZW1lICE9PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBmb2xkZXI6IElTZXNzaW9uRm9sZGVyID0ge1xuXHRcdFx0cm9vdDogdXJpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdXJpLFxuXHRcdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRSZXBvc2l0b3J5OiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiB1cmksXG5cdFx0XHRsYWJlbDogdGhpcy5fbGFiZWxGcm9tVXJpKHVyaSksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fZGVzY3JpcHRpb25Gcm9tVXJpKHVyaSksXG5cdFx0XHRncm91cDogdXJpLnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSA/IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLFxuXHRcdFx0aWNvbjogdGhpcy5faWNvbkZyb21VcmkodXJpKSxcblx0XHRcdGZvbGRlcnM6IFtmb2xkZXJdLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogdXJpLnNjaGVtZSAhPT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSxcblx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogdXJpLnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfbGFiZWxGcm9tVXJpKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZ2l0aHViUmVtb3RlUmVwb0xhYmVsKHVyaSkgPz8gYmFzZW5hbWUodXJpKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uRnJvbVVyaSh1cmk6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRcdC8vIEZvciBHaXRIdWIgVVJJcyB0aGUgcGF0aCBpcyBcIi88b3duZXI+LzxyZXBvPlwiLCByZXR1cm4gdGhlIG93bmVyIGFzIGRlc2NyaXB0aW9uXG5cdFx0XHRjb25zdCBwYXJ0cyA9IHVyaS5wYXRoLnN1YnN0cmluZygxKS5zcGxpdCgnLycpO1xuXHRcdFx0cmV0dXJuIHBhcnRzLmxlbmd0aCA+PSAyID8gcGFydHNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIEZvciBsb2NhbCBmaWxlIFVSSXMsIHJldHVybiB0aGUgdGlsZGlmaWVkIHBhcmVudCBkaXJlY3RvcnkgcGF0aFxuXHRcdHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHVyaSksIHsgcmVsYXRpdmU6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaWNvbkZyb21VcmkodXJpOiBVUkkpOiBUaGVtZUljb24ge1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5yZXBvO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29kaWNvbi5mb2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVTZXNzaW9uQ2FjaGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25DYWNoZS5zaXplID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbkNhY2hlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdEJ5UmF3U2Vzc2lvbklkQ2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZ3JvdXBJZEJ5Q2hhdElkQ2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY2hhdElkc0J5R3JvdXBJZENhY2hlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlR3JvdXBpbmdDYWNoZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NoYXRCeVJhd1Nlc3Npb25JZENhY2hlICYmIHRoaXMuX2dyb3VwSWRCeUNoYXRJZENhY2hlICYmIHRoaXMuX2NoYXRJZHNCeUdyb3VwSWRDYWNoZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRzID0gQXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9uQ2FjaGUudmFsdWVzKCkpO1xuXHRcdGNvbnN0IGNoYXRCeVJhd1Nlc3Npb25JZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ29waWxvdENoYXRTZXNzaW9uPigpO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0Y2hhdEJ5UmF3U2Vzc2lvbklkLnNldChjaGF0LnJlc291cmNlLnBhdGguc2xpY2UoMSksIGNoYXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwSWRCeUNoYXRJZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgY2hhdHNCeUdyb3VwSWQgPSBuZXcgTWFwPHN0cmluZywgSUNvcGlsb3RDaGF0U2Vzc2lvbltdPigpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZUdyb3VwSWQgPSAoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWRHcm91cElkID0gZ3JvdXBJZEJ5Q2hhdElkLmdldChjaGF0LnNlc3Npb25JZCk7XG5cdFx0XHRpZiAoY2FjaGVkR3JvdXBJZCkge1xuXHRcdFx0XHRyZXR1cm4gY2FjaGVkR3JvdXBJZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHJhaWw6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0bGV0IGN1cnJlbnQ6IElDb3BpbG90Q2hhdFNlc3Npb24gPSBjaGF0O1xuXG5cdFx0XHRmb3IgKGxldCBkZXB0aCA9IDA7IGRlcHRoIDwgMTAwOyBkZXB0aCsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRDYWNoZWRHcm91cElkID0gZ3JvdXBJZEJ5Q2hhdElkLmdldChjdXJyZW50LnNlc3Npb25JZCk7XG5cdFx0XHRcdGlmIChjdXJyZW50Q2FjaGVkR3JvdXBJZCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdHJhaWxDaGF0IG9mIHRyYWlsKSB7XG5cdFx0XHRcdFx0XHRncm91cElkQnlDaGF0SWQuc2V0KHRyYWlsQ2hhdC5zZXNzaW9uSWQsIGN1cnJlbnRDYWNoZWRHcm91cElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnRDYWNoZWRHcm91cElkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHNlZW4uaGFzKGN1cnJlbnQuc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdHJhaWxDaGF0IG9mIHRyYWlsKSB7XG5cdFx0XHRcdFx0XHRncm91cElkQnlDaGF0SWQuc2V0KHRyYWlsQ2hhdC5zZXNzaW9uSWQsIGN1cnJlbnQuc2Vzc2lvbklkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnQuc2Vzc2lvbklkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJhaWwucHVzaChjdXJyZW50KTtcblx0XHRcdFx0c2Vlbi5hZGQoY3VycmVudC5zZXNzaW9uSWQpO1xuXG5cdFx0XHRcdGNvbnN0IHBhcmVudFJhd1Nlc3Npb25JZCA9IHRoaXMuX2dldERpcmVjdFBhcmVudFJhd1Nlc3Npb25JZChjdXJyZW50KTtcblx0XHRcdFx0aWYgKCFwYXJlbnRSYXdTZXNzaW9uSWQpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRyYWlsQ2hhdCBvZiB0cmFpbCkge1xuXHRcdFx0XHRcdFx0Z3JvdXBJZEJ5Q2hhdElkLnNldCh0cmFpbENoYXQuc2Vzc2lvbklkLCBjdXJyZW50LnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50LnNlc3Npb25JZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhcmVudENoYXQgPSBjaGF0QnlSYXdTZXNzaW9uSWQuZ2V0KHBhcmVudFJhd1Nlc3Npb25JZCk7XG5cdFx0XHRcdGlmICghcGFyZW50Q2hhdCkge1xuXHRcdFx0XHRcdGNvbnN0IHN5bnRoZXRpY0dyb3VwSWQgPSB0aGlzLl9nZXRTeW50aGV0aWNHcm91cElkKHBhcmVudFJhd1Nlc3Npb25JZCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0cmFpbENoYXQgb2YgdHJhaWwpIHtcblx0XHRcdFx0XHRcdGdyb3VwSWRCeUNoYXRJZC5zZXQodHJhaWxDaGF0LnNlc3Npb25JZCwgc3ludGhldGljR3JvdXBJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzeW50aGV0aWNHcm91cElkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y3VycmVudCA9IHBhcmVudENoYXQ7XG5cdFx0XHR9XG5cblx0XHRcdGdyb3VwSWRCeUNoYXRJZC5zZXQoY2hhdC5zZXNzaW9uSWQsIGNoYXQuc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiBjaGF0LnNlc3Npb25JZDtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzKSB7XG5cdFx0XHRjb25zdCBncm91cElkID0gcmVzb2x2ZUdyb3VwSWQoY2hhdCk7XG5cdFx0XHRjb25zdCBncm91cENoYXRzID0gY2hhdHNCeUdyb3VwSWQuZ2V0KGdyb3VwSWQpID8/IFtdO1xuXHRcdFx0Z3JvdXBDaGF0cy5wdXNoKGNoYXQpO1xuXHRcdFx0Y2hhdHNCeUdyb3VwSWQuc2V0KGdyb3VwSWQsIGdyb3VwQ2hhdHMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRJZHNCeUdyb3VwSWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXBJZCwgZ3JvdXBDaGF0c10gb2YgY2hhdHNCeUdyb3VwSWQpIHtcblx0XHRcdGdyb3VwQ2hhdHMuc29ydCgoYSwgYikgPT4gYS5jcmVhdGVkQXQuZ2V0VGltZSgpIC0gYi5jcmVhdGVkQXQuZ2V0VGltZSgpKTtcblx0XHRcdGNoYXRJZHNCeUdyb3VwSWQuc2V0KGdyb3VwSWQsIGdyb3VwQ2hhdHMubWFwKGNoYXQgPT4gY2hhdC5zZXNzaW9uSWQpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jaGF0QnlSYXdTZXNzaW9uSWRDYWNoZSA9IGNoYXRCeVJhd1Nlc3Npb25JZDtcblx0XHR0aGlzLl9ncm91cElkQnlDaGF0SWRDYWNoZSA9IGdyb3VwSWRCeUNoYXRJZDtcblx0XHR0aGlzLl9jaGF0SWRzQnlHcm91cElkQ2FjaGUgPSBjaGF0SWRzQnlHcm91cElkO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFucyB1cCBhIHRlbXAgc2Vzc2lvbiAob25lIHRoYXQgaGFzbid0IGJlZW4gY29tbWl0dGVkKSBmcm9tIHRoZSBjYWNoZS5cblx0ICogVXNlZCB3aGVuIGRlbGV0ZS9hcmNoaXZlIGlzIGludm9rZWQgb24gYSBzZXNzaW9uIHRoYXQgaXMgc3RpbGwgcGVuZGluZ1xuXHQgKiBjb21taXQgKGUuZy4gd2FzIHN0b3BwZWQgYmVmb3JlIHRoZSBhZ2VudCBjcmVhdGVkIGEgd29ya3RyZWUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYW51cFRlbXBTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb24gPSB0aGlzLl9maW5kQ2hhdFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoIWNoYXRTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gY2hhdFNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKGNoYXRTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmhhcyhjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmRMZWFrKGNoYXRTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbW92ZWRTZXNzaW9uID0gdGhpcy5fY2hhdFRvU2Vzc2lvbihjaGF0U2Vzc2lvbik7XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKGNoYXRTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbcmVtb3ZlZFNlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRpZiAoaXNOZXdTZXNzaW9uKGNoYXRTZXNzaW9uKSkge1xuXHRcdFx0Y2hhdFNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hTZXNzaW9uQ2FjaGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBhZGRlZERhdGE6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNoYW5nZWREYXRhOiBJQ29waWxvdENoYXRTZXNzaW9uW10gPSBbXTtcblx0XHQvLyBVbmRlcmx5aW5nIGFnZW50IHNlc3Npb25zIHdob3NlIHR1cm4ganVzdCBjb21wbGV0ZWQgYW5kIHNob3VsZCBiZSBtYXJrZWRcblx0XHQvLyB1bnJlYWQuIFByb2Nlc3NlZCBhZnRlciB0aGUgbG9vcCBzbyBgc2V0UmVhZGAgZG9lcyBub3QgcmUtZW50ZXIgbWlkLWl0ZXJhdGlvbi5cblx0XHRjb25zdCBzZXNzaW9uc1RvTWFya1VucmVhZDogSUFnZW50U2Vzc2lvbltdID0gW107XG5cdFx0bGV0IGNhY2hlQ2hhbmdlZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMpIHtcblx0XHRcdGlmIChzZXNzaW9uLnByb3ZpZGVyVHlwZSAhPT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmRcblx0XHRcdFx0JiYgc2Vzc2lvbi5wcm92aWRlclR5cGUgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5ID0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y3VycmVudEtleXMuYWRkKGtleSk7XG5cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChrZXkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzU3RhdHVzID0gZXhpc3Rpbmcuc3RhdHVzLmdldCgpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcudXBkYXRlKHNlc3Npb24pKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZERhdGEucHVzaChleGlzdGluZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQSBjb21wbGV0ZWQgdHVybiAoSW5Qcm9ncmVzcyBcdTIxOTIgdGVybWluYWwpIG1hcmtzIHRoZSBzZXNzaW9uXG5cdFx0XHRcdC8vIHVucmVhZC4gQ29waWxvdCByZWFkIHN0YXRlIGlzIG93bmVkIGJ5IHRoZSBhZ2VudCBzZXNzaW9uIG1vZGVsLFxuXHRcdFx0XHQvLyBzbyByb3V0ZSB0aHJvdWdoIGBzZXRSZWFkKGZhbHNlKWA7IHRoZSBhZGFwdGVyIG1pcnJvcnMgaXQgYmFjay5cblx0XHRcdFx0Y29uc3QgY3VycmVudFN0YXR1cyA9IGV4aXN0aW5nLnN0YXR1cy5nZXQoKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3Ncblx0XHRcdFx0XHQmJiBjdXJyZW50U3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3Ncblx0XHRcdFx0XHQmJiBjdXJyZW50U3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkXG5cdFx0XHRcdFx0JiYgZXhpc3RpbmcuaXNSZWFkLmdldCgpKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbnNUb01hcmtVbnJlYWQucHVzaChzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZ2VudFNlc3Npb25BZGFwdGVyKHNlc3Npb24sIHRoaXMuaWQsIHRoaXMuZ2l0SHViU2VydmljZSwgdGhpcy5wdWxsUmVxdWVzdEljb25DYWNoZSk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5zZXQoa2V5LCBhZGFwdGVyKTtcblx0XHRcdFx0YWRkZWREYXRhLnB1c2goYWRhcHRlcik7XG5cdFx0XHRcdGNhY2hlQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3ZlZERhdGE6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2tleSwgYWRhcHRlcl0gb2YgdGhpcy5fc2Vzc2lvbkNhY2hlKSB7XG5cdFx0XHRpZiAoIWN1cnJlbnRLZXlzLmhhcyhrZXkpICYmIGFkYXB0ZXIgaW5zdGFuY2VvZiBBZ2VudFNlc3Npb25BZGFwdGVyICYmICF0aGlzLl9pbkZsaWdodENvbW1pdHMuaGFzKGtleSkpIHtcblx0XHRcdFx0cmVtb3ZlZERhdGEucHVzaChhZGFwdGVyKTtcblx0XHRcdFx0Y2FjaGVDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIGdyb3VwIElEcyBmb3IgcmVtb3ZlZCBzZXNzaW9ucyBCRUZPUkUgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZVxuXHRcdC8vIGNhY2hlIGFuZCBpbnZhbGlkYXRpbmcgZ3JvdXBpbmcgY2FjaGVzLCBzbyB0aGF0IGNoaWxkIHNlc3Npb25zIGFyZVxuXHRcdC8vIGNvcnJlY3RseSBtYXBwZWQgdG8gdGhlaXIgcGFyZW50IGdyb3VwLlxuXHRcdGxldCByZW1vdmVkR3JvdXBJZHM6IE1hcDxJQ29waWxvdENoYXRTZXNzaW9uLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZW1vdmVkRGF0YS5sZW5ndGggPiAwICYmIHRoaXMuX2lzTXVsdGlDaGF0RW5hYmxlZCgpKSB7XG5cdFx0XHRyZW1vdmVkR3JvdXBJZHMgPSBuZXcgTWFwKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlbW92ZWQgb2YgcmVtb3ZlZERhdGEpIHtcblx0XHRcdFx0cmVtb3ZlZEdyb3VwSWRzLnNldChyZW1vdmVkLCB0aGlzLl9nZXRHcm91cElkRm9yQ2hhdChyZW1vdmVkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm93IHJlbW92ZSBmcm9tIGNhY2hlIGFuZCBpbnZhbGlkYXRlIGdyb3VwaW5nIGNhY2hlc1xuXHRcdGZvciAoY29uc3QgcmVtb3ZlZCBvZiByZW1vdmVkRGF0YSkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShyZW1vdmVkLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH1cblxuXHRcdGlmIChjYWNoZUNoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdH1cblxuXHRcdGlmIChhZGRlZERhdGEubGVuZ3RoID4gMCB8fCByZW1vdmVkRGF0YS5sZW5ndGggPiAwIHx8IGNoYW5nZWREYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICh0aGlzLl9pc011bHRpQ2hhdEVuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbkNhY2hlTXVsdGlDaGF0KGFkZGVkRGF0YSwgcmVtb3ZlZERhdGEsIGNoYW5nZWREYXRhLCByZW1vdmVkR3JvdXBJZHMhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRcdFx0YWRkZWQ6IGFkZGVkRGF0YS5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHRcdFx0XHRyZW1vdmVkOiByZW1vdmVkRGF0YS5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBjaGFuZ2VkRGF0YS5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBjb21wbGV0ZWQtdHVybiBzZXNzaW9ucyB1bnJlYWQgYWZ0ZXIgdGhlIGNoYW5nZSBldmVudHMgYWJvdmUgKGFuZFxuXHRcdC8vIG91dHNpZGUgdGhlIGl0ZXJhdGlvbikgc28gdGhlIG1vZGVsJ3MgY2hhbmdlIGV2ZW50IHJlLWVudGVycyBjbGVhbmx5LlxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9uc1RvTWFya1VucmVhZCkge1xuXHRcdFx0c2Vzc2lvbi5zZXRSZWFkKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2Vzc2lvbkNhY2hlTXVsdGlDaGF0KFxuXHRcdGFkZGVkRGF0YTogSUNvcGlsb3RDaGF0U2Vzc2lvbltdLFxuXHRcdHJlbW92ZWREYXRhOiBJQ29waWxvdENoYXRTZXNzaW9uW10sXG5cdFx0Y2hhbmdlZERhdGE6IElDb3BpbG90Q2hhdFNlc3Npb25bXSxcblx0XHRyZW1vdmVkR3JvdXBJZHM6IE1hcDxJQ29waWxvdENoYXRTZXNzaW9uLCBzdHJpbmc+LFxuXHQpOiB2b2lkIHtcblxuXHRcdC8vIEhhbmRsZSByZW1vdmVkIGNoYXRzOiBpZiBhIHJlbW92ZWQgY2hhdCBiZWxvbmdzIHRvIGEgZ3JvdXAgd2l0aFxuXHRcdC8vIHJlbWFpbmluZyBzaWJsaW5ncywgdHJlYXQgaXQgYXMgYSBjaGFuZ2VkIGV2ZW50IG9uIHRoZSBwYXJlbnQgc2Vzc2lvblxuXHRcdC8vIGluc3RlYWQgb2YgYSByZW1vdmVkIHNlc3Npb24uXG5cdFx0Y29uc3QgdHJ1bHlSZW1vdmVkU2Vzc2lvbnM6IHsgY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbjsgZ3JvdXBJZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGNoYW5nZWRTZXNzaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIHJlbW92ZWREYXRhKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSByZW1vdmVkR3JvdXBJZHMuZ2V0KHJlbW92ZWQpITtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGdyb3VwIHN0aWxsIGhhcyBjaGF0cyBhZnRlciByZW1vdmFsXG5cdFx0XHRjb25zdCByZW1haW5pbmdDaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChyZW1haW5pbmdDaGF0SWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gR3JvdXAgc3RpbGwgaGFzIG90aGVyIGNoYXRzIFx1MjAxNCBpbnZhbGlkYXRlIGNhY2hlIGFuZCB0cmVhdCBhcyBjaGFuZ2VkXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZS5maXJlKHsgc2Vzc2lvbklkIH0pO1xuXHRcdFx0XHRpZiAoIWNoYW5nZWRTZXNzaW9uSWRzLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZFNlc3Npb25JZHMuYWRkKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0Y29uc3QgcHJpbWFyeUNoYXQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKHJlbWFpbmluZ0NoYXRJZHNbMF0pKTtcblx0XHRcdFx0XHRpZiAocHJpbWFyeUNoYXQpIHtcblx0XHRcdFx0XHRcdGNoYW5nZWREYXRhLnB1c2gocHJpbWFyeUNoYXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdHRydWx5UmVtb3ZlZFNlc3Npb25zLnB1c2goeyBjaGF0OiByZW1vdmVkLCBncm91cElkOiBzZXNzaW9uSWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2VwYXJhdGUgdHJ1bHkgbmV3IHNlc3Npb25zIGZyb20gY2hhdHMgYWRkZWQgdG8gZXhpc3RpbmcgZ3JvdXBzLlxuXHRcdC8vIEdyb3VwaW5nIGlzIGRlcml2ZWQgZnJvbSBzZXNzaW9uUGFyZW50SWQgaW4gbWV0YWRhdGEuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbnM6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYWRkZWQgb2YgYWRkZWREYXRhKSB7XG5cdFx0XHRjb25zdCBncm91cElkID0gdGhpcy5fZ2V0R3JvdXBJZEZvckNoYXQoYWRkZWQpO1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoZ3JvdXBDaGF0SWRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Ly8gVGhpcyBjaGF0IGJlbG9uZ3MgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBncm91cCBcdTIwMTQgdHJlYXQgYXMgY2hhbmdlZFxuXHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUoZ3JvdXBJZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlLmZpcmUoeyBzZXNzaW9uSWQ6IGdyb3VwSWQgfSk7XG5cdFx0XHRcdGlmICghY2hhbmdlZFNlc3Npb25JZHMuaGFzKGdyb3VwSWQpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZFNlc3Npb25JZHMuYWRkKGdyb3VwSWQpO1xuXHRcdFx0XHRcdGNoYW5nZWREYXRhLnB1c2goYWRkZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdTZXNzaW9ucy5wdXNoKGFkZGVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWR1cGxpY2F0ZSBjaGFuZ2VkIHNlc3Npb25zIGJ5IGdyb3VwIElEXG5cdFx0Y29uc3Qgc2VlbkNoYW5nZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBkZWR1cGxpY2F0ZWRDaGFuZ2VkOiBJQ29waWxvdENoYXRTZXNzaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGQgb2YgY2hhbmdlZERhdGEpIHtcblx0XHRcdGNvbnN0IGdyb3VwSWQgPSB0aGlzLl9nZXRHcm91cElkRm9yQ2hhdChkKTtcblx0XHRcdGlmICghc2VlbkNoYW5nZWQuaGFzKGdyb3VwSWQpKSB7XG5cdFx0XHRcdHNlZW5DaGFuZ2VkLmFkZChncm91cElkKTtcblx0XHRcdFx0ZGVkdXBsaWNhdGVkQ2hhbmdlZC5wdXNoKGQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogbmV3U2Vzc2lvbnMubWFwKGQgPT4gdGhpcy5fY2hhdFRvU2Vzc2lvbihkKSksXG5cdFx0XHRyZW1vdmVkOiB0cnVseVJlbW92ZWRTZXNzaW9ucy5tYXAoKHsgY2hhdCwgZ3JvdXBJZCB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5nZXQoZ3JvdXBJZCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShncm91cElkKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb24gPz8gdGhpcy5fY2hhdFRvU2Vzc2lvbihjaGF0KTtcblx0XHRcdH0pLFxuXHRcdFx0Y2hhbmdlZDogZGVkdXBsaWNhdGVkQ2hhbmdlZC5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDaGF0U2Vzc2lvbihjaGF0SWQ6IHN0cmluZyk6IElDb3BpbG90Q2hhdFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRpcmVjdE1hdGNoID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldCh0aGlzLl9sb2NhbElkRnJvbWNoYXRJZChjaGF0SWQpKTtcblx0XHRpZiAoZGlyZWN0TWF0Y2gpIHtcblx0XHRcdHJldHVybiBkaXJlY3RNYXRjaDtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cENoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChjaGF0SWQpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhdElkID0gZ3JvdXBDaGF0SWRzWzBdO1xuXHRcdHJldHVybiBmaXJzdENoYXRJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQodGhpcy5fbG9jYWxJZEZyb21jaGF0SWQoZmlyc3RDaGF0SWQpKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRBZ2VudFNlc3Npb24oY2hhdElkOiBzdHJpbmcpOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhZGFwdGVyID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKGNoYXRJZCk7XG5cdFx0aWYgKCFhZGFwdGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKGFkYXB0ZXIucmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGdyb3VwIElEIGZvciBhIGdpdmVuIGNoYXQuXG5cdCAqIEdyb3VwaW5nIGlzIGRlcml2ZWQgZnJvbSBgc2Vzc2lvblBhcmVudElkYCBpbiBtZXRhZGF0YSAoZm9yIGNvbW1pdHRlZCBzZXNzaW9ucylcblx0ICogb3IgZnJvbSBgUEFSRU5UX1NFU1NJT05fT1BUSU9OX0lEYCBpbiBzZWxlY3RlZCBvcHRpb25zIChmb3IgdW5jb21taXR0ZWQgc2Vzc2lvbnMpLlxuXHQgKiBJZiB0aGUgcm9vdCBjaGF0IGlzIG5vdCBsb2FkZWQsIGEgc3ludGhldGljIHByb3ZpZGVyLXNjb3BlZCBncm91cCBJRCBpcyB1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0R3JvdXBJZEZvckNoYXQoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHN0cmluZyB7XG5cdFx0dGhpcy5fZW5zdXJlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRyZXR1cm4gdGhpcy5fZ3JvdXBJZEJ5Q2hhdElkQ2FjaGU/LmdldChjaGF0LnNlc3Npb25JZCkgPz8gY2hhdC5zZXNzaW9uSWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgY2hhdCBJRHMgdGhhdCBiZWxvbmcgdG8gdGhlIGdpdmVuIGdyb3VwLFxuXHQgKiBvcmRlcmVkIGJ5IGNyZWF0aW9uIHRpbWUgKHJvb3Qgc2Vzc2lvbiBmaXJzdCkuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDaGF0SWRzSW5Hcm91cChncm91cElkOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0dGhpcy5fZW5zdXJlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdElkc0J5R3JvdXBJZENhY2hlPy5nZXQoZ3JvdXBJZCkgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIF9nZXREaXJlY3RQYXJlbnRSYXdTZXNzaW9uSWQoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKGNoYXQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25QYXJlbnRJZCA9IGFnZW50U2Vzc2lvbj8ubWV0YWRhdGE/LnNlc3Npb25QYXJlbnRJZDtcblx0XHRpZiAodHlwZW9mIHNlc3Npb25QYXJlbnRJZCA9PT0gJ3N0cmluZycgJiYgc2Vzc2lvblBhcmVudElkLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBzZXNzaW9uUGFyZW50SWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTmV3U2Vzc2lvbihjaGF0KSkge1xuXHRcdFx0Y29uc3QgcGFyZW50T3B0aW9uID0gY2hhdC5zZWxlY3RlZE9wdGlvbnMuZ2V0KFBBUkVOVF9TRVNTSU9OX09QVElPTl9JRCk7XG5cdFx0XHRpZiAocGFyZW50T3B0aW9uPy5pZCkge1xuXHRcdFx0XHRyZXR1cm4gcGFyZW50T3B0aW9uLmlkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTeW50aGV0aWNHcm91cElkKHJhd1Nlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5pZH06Z3JvdXA6JHtyYXdTZXNzaW9uSWR9YDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5nZXQoc2Vzc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvY2FsSWRGcm9tY2hhdElkKGNoYXRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcmVmaXggPSBgJHt0aGlzLmlkfTpgO1xuXHRcdHJldHVybiBjaGF0SWQuc3RhcnRzV2l0aChwcmVmaXgpID8gY2hhdElkLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKSA6IGNoYXRJZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgKGNyZWF0aW5nIG9uIGZpcnN0IHVzZSkgdGhlIG1lbWJlcnNoaXAgc2lnbmFsIGZvciBhIGdyb3VwLCBrZXllZCBieVxuXHQgKiBgc2Vzc2lvbklkYC4gVGhlIGdyb3VwJ3MgY2hhdHMgb2JzZXJ2YWJsZSBvYnNlcnZlcyB0aGlzIHNpZ25hbCBzbyBhIG1lbWJlcnNoaXBcblx0ICogY2hhbmdlIHJlY29tcHV0ZXMgb25seSB0aGUgYWZmZWN0ZWQgZ3JvdXA7IHRoZSBzaW5nbGUgZmFuLW91dCBzdWJzY3JpcHRpb24gaW5cblx0ICogYF9ncm91cE1lbWJlcnNoaXBTdWJzY3JpcHRpb25gIHRyaWdnZXJzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0R3JvdXBNZW1iZXJzaGlwU2lnbmFsKHNlc3Npb25JZDogc3RyaW5nKTogSU9ic2VydmFibGVTaWduYWw8dm9pZD4ge1xuXHRcdGxldCBzaWduYWwgPSB0aGlzLl9ncm91cE1lbWJlcnNoaXBTaWduYWxzLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2lnbmFsKSB7XG5cdFx0XHRzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsPHZvaWQ+KHRoaXMpO1xuXHRcdFx0dGhpcy5fZ3JvdXBNZW1iZXJzaGlwU2lnbmFscy5zZXQoc2Vzc2lvbklkLCBzaWduYWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2lnbmFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0cnVjdHVyYWwgZXF1YWxpdHkgZm9yIGEgZ3JvdXAncyBjaGF0IGxpc3Qga2V5ZWQgb24gZWFjaCBjaGF0J3MgcmVzb3VyY2UuXG5cdCAqIGBfdG9DaGF0YCByZXR1cm5zIGEgZnJlc2ggd3JhcHBlciBvbiBldmVyeSByZWNvbXB1dGUsIHNvIGlkZW50aXR5IGNvbXBhcmlzb25cblx0ICogd291bGQgYWx3YXlzIGRpZmZlcjsgY29tcGFyaW5nIHJlc291cmNlcyBsZXRzIGEgcmVjb21wdXRlIHRoYXQgcHJvZHVjZWQgdGhlXG5cdCAqIHNhbWUgc2V0IG9mIGNoYXRzIGF2b2lkIHByb3BhZ2F0aW5nIGRvd25zdHJlYW0uIFVzZXMgdGhlIFVSSSBpZGVudGl0eSBjb21wYXJlclxuXHQgKiBzbyBzY2hlbWUtc3BlY2lmaWMgcGF0aCBjYXNpbmcgYW5kIG5vcm1hbGl6YXRpb24gYXJlIGhhbmRsZWQgY29uc2lzdGVudGx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hhdEFycmF5c0VxdWFsKGE6IHJlYWRvbmx5IElDaGF0W10gfCB1bmRlZmluZWQsIGI6IHJlYWRvbmx5IElDaGF0W10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYiB8fCBhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGEuZXZlcnkoKGNoYXQsIGkpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGNoYXQucmVzb3VyY2UsIGJbaV0ucmVzb3VyY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwcyBhIHByaW1hcnkge0BsaW5rIElDb3BpbG90Q2hhdFNlc3Npb259IGFuZCBpdHMgc2libGluZyBjaGF0cyBpbnRvIGFuIHtAbGluayBJU2Vzc2lvbn0uXG5cdCAqIFdoZW4gbXVsdGktY2hhdCBpcyBlbmFibGVkLCB0aGUgYGNoYXRzYCBvYnNlcnZhYmxlIGlzIGRlcml2ZWQgZnJvbSBgc2Vzc2lvblBhcmVudElkYFxuXHQgKiBtZXRhZGF0YSBhbmQgdXBkYXRlcyB3aGVuIGdyb3VwIG1lbWJlcnNoaXAgY2hhbmdlcy5cblx0ICogV2hlbiBkaXNhYmxlZCwgZWFjaCBzZXNzaW9uIGhhcyBleGFjdGx5IG9uZSBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hhdFRvU2Vzc2lvbihjaGF0OiBJQ29waWxvdENoYXRTZXNzaW9uKTogSVNlc3Npb24ge1xuXHRcdGlmICghdGhpcy5faXNNdWx0aUNoYXRFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jaGF0VG9TaW5nbGVDaGF0U2Vzc2lvbihjaGF0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9nZXRHcm91cElkRm9yQ2hhdChjaGF0KTtcblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgbWFpbiAoZmlyc3QpIGNoYXQgaW4gdGhlIGdyb3VwIFx1MjAxNCBzZXNzaW9uLWxldmVsIHByb3BlcnRpZXMgY29tZSBmcm9tIGl0XG5cdFx0Y29uc3QgbWFpbkNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhdElkID0gbWFpbkNoYXRJZHNbMF07XG5cdFx0Y29uc3QgcHJpbWFyeUNoYXQ6IElDb3BpbG90Q2hhdFNlc3Npb24gPSBmaXJzdENoYXRJZFxuXHRcdFx0PyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKGZpcnN0Q2hhdElkKSkgPz8gY2hhdFxuXHRcdFx0OiBjaGF0O1xuXG5cdFx0Ly8gVGhlIHByaW1hcnkgY2hhdCBvd25zIHRoZSBzZXR0YWJsZSBgbWFpbkNoYXRgIG9ic2VydmFibGUuIFdoZW4gYGNyZWF0ZU5ld0NoYXRgXG5cdFx0Ly8gY29tbWl0cyBhIG5ldyBzZXNzaW9uLCBpdCB1cGRhdGVzIGBwcmltYXJ5Q2hhdC5tYWluQ2hhdGAgc28gdGhlIHdyYXBwaW5nIElTZXNzaW9uXG5cdFx0Ly8gcmVmbGVjdHMgdGhlIHJlYWwgYmFja2VuZCByZXNvdXJjZSB3aXRob3V0IHJlYnVpbGRpbmcgdGhlIGNhY2hlZCB3cmFwcGVyLlxuXHRcdGNvbnN0IG1haW5DaGF0ID0gcHJpbWFyeUNoYXQubWFpbkNoYXQ7XG5cblx0XHRjb25zdCBtZW1iZXJzaGlwU2lnbmFsID0gdGhpcy5fZ2V0R3JvdXBNZW1iZXJzaGlwU2lnbmFsKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgZ3JvdXBDaGF0c09icyA9IGRlcml2ZWRPcHRzPHJlYWRvbmx5IElDaGF0W10gfCB1bmRlZmluZWQ+KHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0ZXF1YWxzRm46IChhLCBiKSA9PiB0aGlzLl9jaGF0QXJyYXlzRXF1YWwoYSwgYiksXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdC8vIFJlY29tcHV0ZSB0aGlzIGdyb3VwJ3MgY2hhdHMgb25seSB3aGVuIGl0cyBvd24gbWVtYmVyc2hpcCBzaWduYWwgdGlja3MuXG5cdFx0XHQvLyBBIHNpbmdsZSBwcm92aWRlci13aWRlIGxpc3RlbmVyIG9uIGBfb25EaWRHcm91cE1lbWJlcnNoaXBDaGFuZ2VgIGZhbnMgb3V0XG5cdFx0XHQvLyB0byBwZXItZ3JvdXAgc2lnbmFscyAoc2VlIGBfZ3JvdXBNZW1iZXJzaGlwU3Vic2NyaXB0aW9uYCksIHNvIHRoZSBlbWl0dGVyJ3Ncblx0XHRcdC8vIGxpc3RlbmVyIGNvdW50IHN0YXlzIGNvbnN0YW50IHdoaWxlIGludmFsaWRhdGlvbiByZW1haW5zIHRhcmdldGVkIHRvIHRoZVxuXHRcdFx0Ly8gYWZmZWN0ZWQgZ3JvdXAuIFRoZSBgZXF1YWxzRm5gIHRoZW4gc3RvcHMgYSByZWNvbXB1dGUgdGhhdCBwcm9kdWNlZCB0aGVcblx0XHRcdC8vIHNhbWUgY2hhdCBzZXQgZnJvbSBwcm9wYWdhdGluZyBkb3duc3RyZWFtLlxuXHRcdFx0bWVtYmVyc2hpcFNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChjaGF0SWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQ6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBjaGF0SWRzKSB7XG5cdFx0XHRcdGNvbnN0IGMgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKGlkKSk7XG5cdFx0XHRcdGlmIChjKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWQucHVzaChjKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc29sdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVkLm1hcChjID0+IHRoaXMuX3RvQ2hhdChjKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBXaGVuIHRoZSBncm91cCBoYXMgbm8gcmVzb2x2ZWQgY2hhdHMgKHR5cGljYWwgZm9yIGEgbmV3IHNlc3Npb24gYmVmb3JlXG5cdFx0Ly8gY29tbWl0KSwgZmFsbCBiYWNrIHRvIHRoZSBzZXR0YWJsZSBgbWFpbkNoYXRgIHNvIGl0IHN0YXlzIGluIHN5bmMgYWZ0ZXJcblx0XHQvLyBgY3JlYXRlTmV3Q2hhdGAgc3dhcHMgaXQuXG5cdFx0Y29uc3QgY2hhdHNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGF0cyA9IGdyb3VwQ2hhdHNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGdyb3VwQ2hhdHMgPz8gW21haW5DaGF0LnJlYWQocmVhZGVyKV07XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjogSVNlc3Npb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRyZXNvdXJjZTogcHJpbWFyeUNoYXQucmVzb3VyY2UsXG5cdFx0XHRwcm92aWRlcklkOiBwcmltYXJ5Q2hhdC5wcm92aWRlcklkLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHByaW1hcnlDaGF0LnNlc3Npb25UeXBlLFxuXHRcdFx0aWNvbjogcHJpbWFyeUNoYXQuaWNvbixcblx0XHRcdGNyZWF0ZWRBdDogcHJpbWFyeUNoYXQuY3JlYXRlZEF0LFxuXHRcdFx0d29ya3NwYWNlOiBwcmltYXJ5Q2hhdC53b3Jrc3BhY2UsXG5cdFx0XHRoYXNHaXRSZXBvc2l0b3J5OiBwcmltYXJ5Q2hhdC5oYXNHaXRSZXBvc2l0b3J5LFxuXHRcdFx0dGl0bGU6IHByaW1hcnlDaGF0LnRpdGxlLFxuXHRcdFx0dXBkYXRlZEF0OiBjaGF0c09icy5tYXAoKGNoYXRzLCByZWFkZXIpID0+IHRoaXMuX2xhdGVzdERhdGUoY2hhdHMsIGMgPT4gYy51cGRhdGVkQXQucmVhZChyZWFkZXIpKSEpLFxuXHRcdFx0c3RhdHVzOiBjaGF0c09icy5tYXAoKGNoYXRzLCByZWFkZXIpID0+IHRoaXMuX2FnZ3JlZ2F0ZVN0YXR1cyhjaGF0cywgcmVhZGVyKSksXG5cdFx0XHRjaGFuZ2VzZXRzOiB0aGlzLl9jcmVhdGVDaGFuZ2VzZXRzKHByaW1hcnlDaGF0LnNlc3Npb25UeXBlLCBwcmltYXJ5Q2hhdC53b3Jrc3BhY2UsIGNoYXRzT2JzKSxcblx0XHRcdGNoYW5nZXM6IHByaW1hcnlDaGF0LmNoYW5nZXMsXG5cdFx0XHRtb2RlbElkOiBwcmltYXJ5Q2hhdC5tb2RlbElkLFxuXHRcdFx0bW9kZTogcHJpbWFyeUNoYXQubW9kZSxcblx0XHRcdGxvYWRpbmc6IHByaW1hcnlDaGF0LmxvYWRpbmcsXG5cdFx0XHRpc0FyY2hpdmVkOiBwcmltYXJ5Q2hhdC5pc0FyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiBjaGF0c09icy5tYXAoKGNoYXRzLCByZWFkZXIpID0+IGNoYXRzLmV2ZXJ5KGMgPT4gYy5pc1JlYWQucmVhZChyZWFkZXIpKSksXG5cdFx0XHRkZXNjcmlwdGlvbjogcHJpbWFyeUNoYXQuZGVzY3JpcHRpb24sXG5cdFx0XHRsYXN0VHVybkVuZDogY2hhdHNPYnMubWFwKChjaGF0cywgcmVhZGVyKSA9PiB0aGlzLl9sYXRlc3REYXRlKGNoYXRzLCBjID0+IGMubGFzdFR1cm5FbmQucmVhZChyZWFkZXIpKSksXG5cdFx0XHRjaGF0czogY2hhdHNPYnMsXG5cdFx0XHRtYWluQ2hhdCxcblx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBwcmltYXJ5Q2hhdC5zZXNzaW9uVHlwZSA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkICYmIHRoaXMuX2lzTXVsdGlDaGF0RW5hYmxlZCgpLFxuXHRcdFx0XHRzdXBwb3J0c1JlbmFtZTogdGhpcy5fc2Vzc2lvblR5cGVTdXBwb3J0c1JlbmFtZShwcmltYXJ5Q2hhdC5zZXNzaW9uVHlwZSksXG5cdFx0XHRcdHN1cHBvcnRzRGVsZXRlOiB0aGlzLl9zZXNzaW9uVHlwZVN1cHBvcnRzRGVsZXRlKHByaW1hcnlDaGF0LnNlc3Npb25UeXBlKSxcblx0XHRcdFx0Ly8gQ2xvdWQtYWdlbnQgc2Vzc2lvbnMgcnVuIHdvcmt0cmVlQ3JlYXRlZCB0YXNrcyBzZXJ2ZXItc2lkZSBkdXJpbmdcblx0XHRcdFx0Ly8gZW52aXJvbm1lbnQgcHJvdmlzaW9uaW5nLCBzbyB0aGUgYWdlbnRzLXdpbmRvdyBkaXNwYXRjaGVyIG11c3Rcblx0XHRcdFx0Ly8gbm90IHJlLXJ1biB0aGVtLiBPdGhlciBzZXNzaW9uIHR5cGVzIGRvbid0LlxuXHRcdFx0XHRydW5zV29ya3RyZWVDcmVhdGVkVGFza3M6IHByaW1hcnlDaGF0LnNlc3Npb25UeXBlID09PSBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pZCxcblx0XHRcdH0pLFxuXHRcdH07XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuc2V0KHNlc3Npb25JZCwgc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRwcml2YXRlIF9jaGF0VG9TaW5nbGVDaGF0U2Vzc2lvbihjaGF0OiBJQ29waWxvdENoYXRTZXNzaW9uKTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IG1haW5DaGF0ID0gY2hhdC5tYWluQ2hhdDtcblx0XHRjb25zdCBjaGF0c09icyA9IG1haW5DaGF0Lm1hcChjID0+IFtjXSBhcyByZWFkb25seSBJQ2hhdFtdKTtcblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gdGhpcy5fY3JlYXRlQ2hhbmdlc2V0cyhjaGF0LnNlc3Npb25UeXBlLCBjaGF0LndvcmtzcGFjZSwgY2hhdHNPYnMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25JZDogY2hhdC5zZXNzaW9uSWQsXG5cdFx0XHRyZXNvdXJjZTogY2hhdC5yZXNvdXJjZSxcblx0XHRcdHByb3ZpZGVySWQ6IGNoYXQucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlOiBjaGF0LnNlc3Npb25UeXBlLFxuXHRcdFx0aWNvbjogY2hhdC5pY29uLFxuXHRcdFx0Y3JlYXRlZEF0OiBjaGF0LmNyZWF0ZWRBdCxcblx0XHRcdHdvcmtzcGFjZTogY2hhdC53b3Jrc3BhY2UsXG5cdFx0XHRoYXNHaXRSZXBvc2l0b3J5OiBjaGF0Lmhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHR0aXRsZTogY2hhdC50aXRsZSxcblx0XHRcdHVwZGF0ZWRBdDogY2hhdC51cGRhdGVkQXQsXG5cdFx0XHRzdGF0dXM6IGNoYXQuc3RhdHVzLFxuXHRcdFx0Y2hhbmdlc2V0cyxcblx0XHRcdGNoYW5nZXM6IGNoYXQuY2hhbmdlcyxcblx0XHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRcdG1vZGU6IGNoYXQubW9kZSxcblx0XHRcdGxvYWRpbmc6IGNoYXQubG9hZGluZyxcblx0XHRcdGlzQXJjaGl2ZWQ6IGNoYXQuaXNBcmNoaXZlZCxcblx0XHRcdGlzUmVhZDogY2hhdC5pc1JlYWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogY2hhdC5kZXNjcmlwdGlvbixcblx0XHRcdGxhc3RUdXJuRW5kOiBjaGF0Lmxhc3RUdXJuRW5kLFxuXHRcdFx0Y2hhdHM6IGNoYXRzT2JzLFxuXHRcdFx0bWFpbkNoYXQsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnRzUmVuYW1lOiB0aGlzLl9zZXNzaW9uVHlwZVN1cHBvcnRzUmVuYW1lKGNoYXQuc2Vzc2lvblR5cGUpLFxuXHRcdFx0XHRzdXBwb3J0c0RlbGV0ZTogdGhpcy5fc2Vzc2lvblR5cGVTdXBwb3J0c0RlbGV0ZShjaGF0LnNlc3Npb25UeXBlKSxcblx0XHRcdFx0cnVuc1dvcmt0cmVlQ3JlYXRlZFRhc2tzOiBjaGF0LnNlc3Npb25UeXBlID09PSBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pZCxcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgcmVuYW1lQ2hhdH0gY2FuIHJlbmFtZSBhIHNlc3Npb24gb2YgdGhlIGdpdmVuIHR5cGUuIE9ubHlcblx0ICogdGhlIENvcGlsb3RDTEkgYmFja2VuZCBleHBvc2VzIGEgcmVuYW1lIGNvbW1hbmQ7IG90aGVycyB0aHJvdy5cblx0ICovXG5cdHByaXZhdGUgX3Nlc3Npb25UeXBlU3VwcG9ydHNSZW5hbWUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzZXNzaW9uVHlwZSA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvblR5cGVTdXBwb3J0c0RlbGV0ZShzZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHNlc3Npb25UeXBlID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b0NoYXQoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbiwgcmVzb3VyY2U/OiBVUkksIGludGVyYWN0aXZpdHk6IENoYXRJbnRlcmFjdGl2aXR5ID0gQ2hhdEludGVyYWN0aXZpdHkuRnVsbCk6IElDaGF0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlID8/IGNoYXQucmVzb3VyY2UsXG5cdFx0XHRjcmVhdGVkQXQ6IGNoYXQuY3JlYXRlZEF0LFxuXHRcdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0XHR1cGRhdGVkQXQ6IGNoYXQudXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiBjaGF0LnN0YXR1cyxcblx0XHRcdGNoYW5nZXM6IGNoYXQuY2hhbmdlcyxcblx0XHRcdGNoZWNrcG9pbnRzOiBjaGF0LmNoZWNrcG9pbnRzLFxuXHRcdFx0bW9kZWxJZDogY2hhdC5tb2RlbElkLFxuXHRcdFx0bW9kZTogY2hhdC5tb2RlLFxuXHRcdFx0aXNBcmNoaXZlZDogY2hhdC5pc0FyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiBjaGF0LmlzUmVhZCxcblx0XHRcdGludGVyYWN0aXZpdHk6IGNvbnN0T2JzZXJ2YWJsZShpbnRlcmFjdGl2aXR5KSxcblx0XHRcdGRlc2NyaXB0aW9uOiBjaGF0LmRlc2NyaXB0aW9uLFxuXHRcdFx0bGFzdFR1cm5FbmQ6IGNoYXQubGFzdFR1cm5FbmQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNoYW5nZXNldHMoc2Vzc2lvblR5cGU6IHN0cmluZywgd29ya3NwYWNlT2JzOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4sIGNoYXRzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPik6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10+IHtcblx0XHRyZXR1cm4gY3JlYXRlQ2hhbmdlc2V0cyhzZXNzaW9uVHlwZSwgd29ya3NwYWNlT2JzLCBjaGF0c09icywgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXRlc3REYXRlKGNoYXRzOiByZWFkb25seSBJQ2hhdFtdLCBnZXR0ZXI6IChjaGF0OiBJQ2hhdCkgPT4gRGF0ZSB8IHVuZGVmaW5lZCk6IERhdGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCBsYXRlc3Q6IERhdGUgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzKSB7XG5cdFx0XHRjb25zdCBkID0gZ2V0dGVyKGNoYXQpO1xuXHRcdFx0aWYgKGQgJiYgKCFsYXRlc3QgfHwgZCA+IGxhdGVzdCkpIHtcblx0XHRcdFx0bGF0ZXN0ID0gZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxhdGVzdDtcblx0fVxuXG5cdHByaXZhdGUgX2FnZ3JlZ2F0ZVN0YXR1cyhjaGF0czogcmVhZG9ubHkgSUNoYXRbXSwgcmVhZGVyOiBJUmVhZGVyKTogU2Vzc2lvblN0YXR1cyB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoYXRzKSB7XG5cdFx0XHRpZiAoYy5zdGF0dXMucmVhZChyZWFkZXIpID09PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoYXRzKSB7XG5cdFx0XHRpZiAoYy5zdGF0dXMucmVhZChyZWFkZXIpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNoYXRzWzBdLnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdH1cblxuXHRwcml2YXRlIF9pc011bHRpQ2hhdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX211bHRpQ2hhdEVuYWJsZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUIsbUJBQW1CO0FBQ25ELFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUEwQixnQkFBZ0IsMkJBQTJCO0FBQ3JFLFNBQVMsWUFBWSxpQkFBOEIsZUFBZSx5QkFBeUI7QUFDM0YsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxpQkFBaUIsU0FBUyxhQUF5Rix1QkFBdUIsa0JBQWtCLGlCQUFpQixxQkFBcUIsYUFBYSxtQkFBbUI7QUFFcFAsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUNBQW9EO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQWlEO0FBQzFELFNBQVMsb0JBQTZDO0FBRXRELFNBQVMsbUJBQW1CLHNCQUF1RixtQkFBbUI7QUFDdEksU0FBd0csZUFBZSwyQkFBeUcseUJBQXlCLGlCQUFpQix1QkFBdUIsYUFBYSwrQkFBK0IsZ0NBQXFFLG1CQUFtQixrQ0FBa0M7QUFDdmMsU0FBUyxtQkFBbUIsbUJBQW1CLGNBQWMscUJBQXFCLDZCQUE2QjtBQUMvRyxTQUFTLFVBQVUsU0FBUyxl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
