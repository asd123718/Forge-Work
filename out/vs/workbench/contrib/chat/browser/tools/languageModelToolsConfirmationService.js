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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../../base/common/map.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService, QuickInputButtonLocation } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ToolConfirmKind } from "../../common/chatService/chatService.js";
const RUN_WITHOUT_APPROVAL = localize("runWithoutApproval", "without approval");
const CONTINUE_WITHOUT_REVIEWING_RESULTS = localize("continueWithoutReviewingResults", "without reviewing result");
class GenericConfirmStore extends Disposable {
  constructor(_storageKey, _instantiationService) {
    super();
    this._storageKey = _storageKey;
    this._instantiationService = _instantiationService;
    this._memoryStore = /* @__PURE__ */ new Map();
    this._workspaceStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.WORKSPACE, this._storageKey)));
    this._profileStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.PROFILE, this._storageKey)));
  }
  setAutoConfirmation(id, scope, label, args) {
    this._workspaceStore.value.setAutoConfirm(id, void 0);
    this._profileStore.value.setAutoConfirm(id, void 0);
    this._memoryStore.delete(id);
    const entry = { confirmed: true, label, arguments: args };
    if (scope === "workspace") {
      this._workspaceStore.value.setAutoConfirm(id, entry);
    } else if (scope === "profile") {
      this._profileStore.value.setAutoConfirm(id, entry);
    } else if (scope === "session") {
      this._memoryStore.set(id, entry);
    }
  }
  getAutoConfirmation(id) {
    if (this._workspaceStore.value.getAutoConfirm(id)) {
      return "workspace";
    }
    if (this._profileStore.value.getAutoConfirm(id)) {
      return "profile";
    }
    if (this._memoryStore.has(id)) {
      return "session";
    }
    return "never";
  }
  getAutoConfirmationIn(id, scope) {
    if (scope === "workspace") {
      return !!this._workspaceStore.value.getAutoConfirm(id);
    } else if (scope === "profile") {
      return !!this._profileStore.value.getAutoConfirm(id);
    } else {
      return this._memoryStore.has(id);
    }
  }
  getLabel(id) {
    return this._workspaceStore.value.getAutoConfirm(id)?.label ?? this._profileStore.value.getAutoConfirm(id)?.label ?? this._memoryStore.get(id)?.label;
  }
  getArguments(id) {
    return this._workspaceStore.value.getAutoConfirm(id)?.arguments ?? this._profileStore.value.getAutoConfirm(id)?.arguments ?? this._memoryStore.get(id)?.arguments;
  }
  reset() {
    this._workspaceStore.value.reset();
    this._profileStore.value.reset();
    this._memoryStore.clear();
  }
  checkAutoConfirmation(id) {
    if (this._workspaceStore.value.getAutoConfirm(id)) {
      return { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" };
    }
    if (this._profileStore.value.getAutoConfirm(id)) {
      return { type: ToolConfirmKind.LmServicePerTool, scope: "profile" };
    }
    if (this._memoryStore.has(id)) {
      return { type: ToolConfirmKind.LmServicePerTool, scope: "session" };
    }
    return void 0;
  }
  getAllConfirmed() {
    const all = /* @__PURE__ */ new Set();
    for (const key of this._workspaceStore.value.getAll()) {
      all.add(key);
    }
    for (const key of this._profileStore.value.getAll()) {
      all.add(key);
    }
    for (const key of this._memoryStore.keys()) {
      all.add(key);
    }
    return all;
  }
}
let ToolConfirmStore = class extends Disposable {
  constructor(_scope, _storageKey, storageService) {
    super();
    this._scope = _scope;
    this._storageKey = _storageKey;
    this.storageService = storageService;
    this._autoConfirmTools = new LRUCache(100);
    this._didChange = false;
    const raw = storageService.get(this._storageKey, this._scope);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const key of parsed) {
            this._autoConfirmTools.set(key, { confirmed: true });
          }
        } else if (typeof parsed === "object" && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "object" && value !== null) {
              const obj = value;
              this._autoConfirmTools.set(key, { confirmed: true, label: obj.label, arguments: obj.arguments });
            } else {
              this._autoConfirmTools.set(key, { confirmed: true, label: typeof value === "string" ? value : void 0 });
            }
          }
        }
      } catch {
      }
    }
    this._register(storageService.onWillSaveState(() => {
      if (this._didChange) {
        const data = {};
        for (const [key, entry] of this._autoConfirmTools) {
          if (entry.arguments) {
            data[key] = { label: entry.label, arguments: entry.arguments };
          } else {
            data[key] = entry.label ?? true;
          }
        }
        this.storageService.store(this._storageKey, JSON.stringify(data), this._scope, StorageTarget.MACHINE);
        this._didChange = false;
      }
    }));
  }
  reset() {
    this._autoConfirmTools.clear();
    this._didChange = true;
  }
  getAutoConfirm(id) {
    const entry = this._autoConfirmTools.get(id);
    if (entry) {
      this._didChange = true;
      return entry;
    }
    return void 0;
  }
  setAutoConfirm(id, entry) {
    if (!entry) {
      this._autoConfirmTools.delete(id);
    } else {
      this._autoConfirmTools.set(id, entry);
    }
    this._didChange = true;
  }
  getAll() {
    return [...this._autoConfirmTools.keys()];
  }
};
ToolConfirmStore = __decorateClass([
  __decorateParam(2, IStorageService)
], ToolConfirmStore);
let LanguageModelToolsConfirmationService = class extends Disposable {
  constructor(_instantiationService, _quickInputService, _dialogService) {
    super();
    this._instantiationService = _instantiationService;
    this._quickInputService = _quickInputService;
    this._dialogService = _dialogService;
    this._contributions = /* @__PURE__ */ new Map();
    this._preExecutionToolConfirmStore = this._register(new GenericConfirmStore("chat/autoconfirm", this._instantiationService));
    this._postExecutionToolConfirmStore = this._register(new GenericConfirmStore("chat/autoconfirm-post", this._instantiationService));
    this._preExecutionServerConfirmStore = this._register(new GenericConfirmStore("chat/servers/autoconfirm", this._instantiationService));
    this._postExecutionServerConfirmStore = this._register(new GenericConfirmStore("chat/servers/autoconfirm-post", this._instantiationService));
    this._combinationConfirmStore = this._register(new GenericConfirmStore("chat/autoconfirm-combination", this._instantiationService));
  }
  getPreConfirmAction(ref) {
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPreConfirmAction) {
      const result = contribution.getPreConfirmAction(ref);
      if (result) {
        return result;
      }
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return void 0;
    }
    if (ref.combination) {
      const combinationResult = this._combinationConfirmStore.checkAutoConfirmation(ref.combination.key);
      if (combinationResult) {
        return combinationResult;
      }
    }
    const toolResult = this._preExecutionToolConfirmStore.checkAutoConfirmation(ref.toolId);
    if (toolResult) {
      return toolResult;
    }
    if (ref.source.type === "mcp") {
      const serverResult = this._preExecutionServerConfirmStore.checkAutoConfirmation(ref.source.definitionId);
      if (serverResult) {
        return serverResult;
      }
    }
    return void 0;
  }
  getPostConfirmAction(ref) {
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPostConfirmAction) {
      const result = contribution.getPostConfirmAction(ref);
      if (result) {
        return result;
      }
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return void 0;
    }
    const toolResult = this._postExecutionToolConfirmStore.checkAutoConfirmation(ref.toolId);
    if (toolResult) {
      return toolResult;
    }
    if (ref.source.type === "mcp") {
      const serverResult = this._postExecutionServerConfirmStore.checkAutoConfirmation(ref.source.definitionId);
      if (serverResult) {
        return serverResult;
      }
    }
    return void 0;
  }
  getPreConfirmActions(ref) {
    const actions = [];
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPreConfirmActions) {
      actions.push(...contribution.getPreConfirmActions(ref));
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return actions;
    }
    if (ref.combination) {
      const { label: combinationLabel, key: combinationKey, arguments: combinationArgs } = ref.combination;
      actions.push(
        {
          label: localize("allowCombinationSession", "{0} in this Session", combinationLabel),
          detail: localize("allowCombinationSessionTooltip", "Allow this particular combination of tool and arguments in this session without confirmation."),
          divider: !!actions.length,
          scope: "session",
          select: async () => {
            this._combinationConfirmStore.setAutoConfirmation(combinationKey, "session", combinationLabel, combinationArgs);
            return true;
          }
        },
        {
          label: localize("allowCombinationWorkspace", "{0} in this Workspace", combinationLabel),
          detail: localize("allowCombinationWorkspaceTooltip", "Allow this particular combination of tool and arguments in this workspace without confirmation."),
          scope: "workspace",
          select: async () => {
            this._combinationConfirmStore.setAutoConfirmation(combinationKey, "workspace", combinationLabel, combinationArgs);
            return true;
          }
        },
        {
          label: localize("allowCombinationGlobally", "Always {0}", combinationLabel),
          detail: localize("allowCombinationGloballyTooltip", "Always allow this particular combination of tool and arguments without confirmation."),
          scope: "profile",
          select: async () => {
            this._combinationConfirmStore.setAutoConfirmation(combinationKey, "profile", combinationLabel, combinationArgs);
            return true;
          }
        }
      );
    }
    actions.push(
      {
        label: localize("allowSession", "Allow in this Session"),
        detail: localize("allowSessionTooltip", "Allow this tool to run in this session without confirmation."),
        divider: !!actions.length,
        scope: "session",
        select: async () => {
          this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "session");
          return true;
        }
      },
      {
        label: localize("allowWorkspace", "Allow in this Workspace"),
        detail: localize("allowWorkspaceTooltip", "Allow this tool to run in this workspace without confirmation."),
        scope: "workspace",
        select: async () => {
          this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "workspace");
          return true;
        }
      },
      {
        label: localize("allowGlobally", "Always Allow"),
        detail: localize("allowGloballyTooltip", "Always allow this tool to run without confirmation."),
        scope: "profile",
        select: async () => {
          this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "profile");
          return true;
        }
      }
    );
    if (ref.source.type === "mcp") {
      const { serverLabel, definitionId } = ref.source;
      actions.push(
        {
          label: localize("allowServerSession", "Allow Tools from {0} in this Session", serverLabel),
          detail: localize("allowServerSessionTooltip", "Allow all tools from this server to run in this session without confirmation."),
          divider: true,
          scope: "session",
          select: async () => {
            this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, "session");
            return true;
          }
        },
        {
          label: localize("allowServerWorkspace", "Allow Tools from {0} in this Workspace", serverLabel),
          detail: localize("allowServerWorkspaceTooltip", "Allow all tools from this server to run in this workspace without confirmation."),
          scope: "workspace",
          select: async () => {
            this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, "workspace");
            return true;
          }
        },
        {
          label: localize("allowServerGlobally", "Always Allow Tools from {0}", serverLabel),
          detail: localize("allowServerGloballyTooltip", "Always allow all tools from this server to run without confirmation."),
          scope: "profile",
          select: async () => {
            this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, "profile");
            return true;
          }
        }
      );
    }
    return actions;
  }
  getPostConfirmActions(ref) {
    const actions = [];
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPostConfirmActions) {
      actions.push(...contribution.getPostConfirmActions(ref));
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return actions;
    }
    actions.push(
      {
        label: localize("allowSessionPost", "Allow Without Review in this Session"),
        detail: localize("allowSessionPostTooltip", "Allow results from this tool to be sent without confirmation in this session."),
        divider: !!actions.length,
        scope: "session",
        select: async () => {
          this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "session");
          return true;
        }
      },
      {
        label: localize("allowWorkspacePost", "Allow Without Review in this Workspace"),
        detail: localize("allowWorkspacePostTooltip", "Allow results from this tool to be sent without confirmation in this workspace."),
        scope: "workspace",
        select: async () => {
          this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "workspace");
          return true;
        }
      },
      {
        label: localize("allowGloballyPost", "Always Allow Without Review"),
        detail: localize("allowGloballyPostTooltip", "Always allow results from this tool to be sent without confirmation."),
        scope: "profile",
        select: async () => {
          this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "profile");
          return true;
        }
      }
    );
    if (ref.source.type === "mcp") {
      const { serverLabel, definitionId } = ref.source;
      actions.push(
        {
          label: localize("allowServerSessionPost", "Allow Tools from {0} Without Review in this Session", serverLabel),
          detail: localize("allowServerSessionPostTooltip", "Allow results from all tools from this server to be sent without confirmation in this session."),
          divider: true,
          scope: "session",
          select: async () => {
            this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, "session");
            return true;
          }
        },
        {
          label: localize("allowServerWorkspacePost", "Allow Tools from {0} Without Review in this Workspace", serverLabel),
          detail: localize("allowServerWorkspacePostTooltip", "Allow results from all tools from this server to be sent without confirmation in this workspace."),
          scope: "workspace",
          select: async () => {
            this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, "workspace");
            return true;
          }
        },
        {
          label: localize("allowServerGloballyPost", "Always Allow Tools from {0} Without Review", serverLabel),
          detail: localize("allowServerGloballyPostTooltip", "Always allow results from all tools from this server to be sent without confirmation."),
          scope: "profile",
          select: async () => {
            this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, "profile");
            return true;
          }
        }
      );
    }
    return actions;
  }
  registerConfirmationContribution(toolName, contribution) {
    this._contributions.set(toolName, contribution);
    return {
      dispose: () => {
        this._contributions.delete(toolName);
      }
    };
  }
  toolCanManageConfirmation(tool) {
    return !!tool.canRequestPreApproval || !!tool.canRequestPostApproval || this._contributions.has(tool.id) || !!this._preExecutionToolConfirmStore.checkAutoConfirmation(tool.id) || !!this._postExecutionToolConfirmStore.checkAutoConfirmation(tool.id) || this._hasCombinationApprovalsForTool(tool.id);
  }
  _hasCombinationApprovalsForTool(toolId) {
    const prefix = toolId + ":combination:";
    for (const key of this._combinationConfirmStore.getAllConfirmed()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }
  _getCombinationApprovalsForTool(toolId, scope) {
    const prefix = toolId + ":combination:";
    const results = [];
    for (const key of this._combinationConfirmStore.getAllConfirmed()) {
      if (key.startsWith(prefix) && this._combinationConfirmStore.getAutoConfirmationIn(key, scope)) {
        const label = this._combinationConfirmStore.getLabel(key) ?? key;
        const args = this._combinationConfirmStore.getArguments(key);
        results.push({ key, label, arguments: args });
      }
    }
    return results;
  }
  manageConfirmationPreferences(tools, options) {
    const viewArgsButton = {
      iconClass: ThemeIcon.asClassName(Codicon.info),
      tooltip: localize("viewCombinationArguments", "View Arguments")
    };
    const trackServerTool = (serverId, label, toolId, serversWithTools2) => {
      if (!serversWithTools2.has(serverId)) {
        serversWithTools2.set(serverId, { label, tools: /* @__PURE__ */ new Set() });
      }
      serversWithTools2.get(serverId).tools.add(toolId);
    };
    const addServerToolFromSource = (source, toolId, serversWithTools2) => {
      if (source.type === "mcp") {
        trackServerTool(source.definitionId, source.serverLabel || source.label, toolId, serversWithTools2);
      } else if (source.type === "extension") {
        trackServerTool(source.extensionId.value, source.label, toolId, serversWithTools2);
      }
    };
    const relevantTools = /* @__PURE__ */ new Set();
    const serversWithTools = /* @__PURE__ */ new Map();
    for (const tool of tools) {
      if (tool.canRequestPreApproval || tool.canRequestPostApproval || this._contributions.has(tool.id)) {
        relevantTools.add(tool.id);
        addServerToolFromSource(tool.source, tool.id, serversWithTools);
      }
    }
    for (const id of this._preExecutionToolConfirmStore.getAllConfirmed()) {
      if (!relevantTools.has(id)) {
        const tool = tools.find((t) => t.id === id);
        if (tool) {
          relevantTools.add(id);
          addServerToolFromSource(tool.source, id, serversWithTools);
        }
      }
    }
    for (const id of this._postExecutionToolConfirmStore.getAllConfirmed()) {
      if (!relevantTools.has(id)) {
        const tool = tools.find((t) => t.id === id);
        if (tool) {
          relevantTools.add(id);
          addServerToolFromSource(tool.source, id, serversWithTools);
        }
      }
    }
    for (const tool of tools) {
      if (!relevantTools.has(tool.id) && this._hasCombinationApprovalsForTool(tool.id)) {
        relevantTools.add(tool.id);
        addServerToolFromSource(tool.source, tool.id, serversWithTools);
      }
    }
    if (relevantTools.size === 0) {
      return;
    }
    let currentScope = options?.defaultScope ?? "workspace";
    const buildTreeItems = () => {
      const treeItems = [];
      for (const [serverId, serverInfo] of serversWithTools) {
        const serverChildren = [];
        const hasAnyPre = Array.from(serverInfo.tools).some((toolId) => {
          const tool = tools.find((t) => t.id === toolId);
          return tool?.canRequestPreApproval;
        });
        const hasAnyPost = Array.from(serverInfo.tools).some((toolId) => {
          const tool = tools.find((t) => t.id === toolId);
          return tool?.canRequestPostApproval;
        });
        const serverPreConfirmed = this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        const serverPostConfirmed = this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        for (const toolId of serverInfo.tools) {
          const tool = tools.find((t) => t.id === toolId);
          if (!tool) {
            continue;
          }
          const toolChildren = [];
          const hasPre = !serverPreConfirmed && (tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));
          const hasPost = !serverPostConfirmed && (tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));
          if (hasPre && hasPost) {
            toolChildren.push({
              type: "tool-pre",
              toolId: tool.id,
              label: RUN_WITHOUT_APPROVAL,
              checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
            toolChildren.push({
              type: "tool-post",
              toolId: tool.id,
              label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
              checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
          }
          const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
          for (const { key, label, arguments: args } of combinationApprovals) {
            toolChildren.push({
              type: "combination",
              toolId: tool.id,
              combinationKey: key,
              combinationArgs: args,
              label,
              checked: true,
              buttons: args ? [viewArgsButton] : void 0
            });
          }
          const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          let checked;
          let description;
          if (hasPre && hasPost) {
            checked = preApproval && postApproval ? true : !preApproval && !postApproval ? false : "mixed";
          } else if (hasPre) {
            checked = preApproval;
            description = RUN_WITHOUT_APPROVAL;
          } else if (hasPost) {
            checked = postApproval;
            description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
          } else if (toolChildren.length > 0) {
            checked = false;
          } else {
            continue;
          }
          if (checked === false && toolChildren.length === 0 && !tool.canRequestPreApproval && !tool.canRequestPostApproval) {
            continue;
          }
          serverChildren.push({
            type: "tool",
            toolId: tool.id,
            label: tool.displayName || tool.id,
            description,
            checked,
            collapsed: true,
            children: toolChildren.length > 0 ? toolChildren : void 0
          });
        }
        serverChildren.sort((a, b) => a.label.localeCompare(b.label));
        if (hasAnyPost) {
          serverChildren.unshift({
            type: "server-post",
            serverId,
            iconClass: ThemeIcon.asClassName(Codicon.play),
            label: localize("continueWithoutReviewing", "Continue without reviewing any tool results"),
            checked: serverPostConfirmed
          });
        }
        if (hasAnyPre) {
          serverChildren.unshift({
            type: "server-pre",
            serverId,
            iconClass: ThemeIcon.asClassName(Codicon.play),
            label: localize("runToolsWithoutApproval", "Run any tool without approval"),
            checked: serverPreConfirmed
          });
        }
        const serverHasPre = this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        const serverHasPost = this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        let serverChecked;
        if (hasAnyPre && hasAnyPost) {
          serverChecked = serverHasPre && serverHasPost ? true : !serverHasPre && !serverHasPost ? false : "mixed";
        } else if (hasAnyPre) {
          serverChecked = serverHasPre;
        } else if (hasAnyPost) {
          serverChecked = serverHasPost;
        } else {
          serverChecked = false;
        }
        const existingItem = quickTree.itemTree.find((i) => i.serverId === serverId);
        treeItems.push({
          type: "server",
          serverId,
          label: serverInfo.label,
          checked: serverChecked,
          children: serverChildren,
          collapsed: existingItem ? quickTree.isCollapsed(existingItem) : true,
          pickable: false
        });
      }
      const sortedTools = tools.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
      for (const tool of sortedTools) {
        if (!relevantTools.has(tool.id)) {
          continue;
        }
        if (tool.source.type === "mcp" || tool.source.type === "extension") {
          continue;
        }
        const contributed = this._contributions.get(tool.id);
        const toolChildren = [];
        const manageActions = contributed?.getManageActions?.();
        if (manageActions) {
          toolChildren.push(...manageActions.map((action) => ({
            type: "manage",
            ...action
          })));
        }
        let checked = false;
        let description;
        let pickable = false;
        if (contributed?.canUseDefaultApprovals !== false) {
          pickable = true;
          const hasPre = tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          const hasPost = tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          if (hasPre && hasPost) {
            toolChildren.push({
              type: "tool-pre",
              toolId: tool.id,
              label: RUN_WITHOUT_APPROVAL,
              checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
            toolChildren.push({
              type: "tool-post",
              toolId: tool.id,
              label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
              checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
          }
          const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
          for (const { key, label, arguments: args } of combinationApprovals) {
            toolChildren.push({
              type: "combination",
              toolId: tool.id,
              combinationKey: key,
              combinationArgs: args,
              label,
              checked: true,
              buttons: args ? [viewArgsButton] : void 0
            });
          }
          const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          if (hasPre && hasPost) {
            checked = preApproval && postApproval ? true : !preApproval && !postApproval ? false : "mixed";
          } else if (hasPre) {
            checked = preApproval;
            description = RUN_WITHOUT_APPROVAL;
          } else if (hasPost) {
            checked = postApproval;
            description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
          } else {
            checked = false;
          }
        }
        if (checked === false && toolChildren.length === 0 && !tool.canRequestPreApproval && !tool.canRequestPostApproval && !this._contributions.has(tool.id)) {
          continue;
        }
        treeItems.push({
          type: "tool",
          toolId: tool.id,
          label: tool.displayName || tool.id,
          description,
          checked,
          pickable,
          collapsed: tools.length > 1,
          children: toolChildren.length > 0 ? toolChildren : void 0
        });
      }
      return treeItems;
    };
    const disposables = new DisposableStore();
    const quickTree = disposables.add(this._quickInputService.createQuickTree());
    quickTree.ignoreFocusOut = true;
    quickTree.sortByLabel = false;
    if (currentScope !== "session") {
      const scopeButton = {
        iconClass: ThemeIcon.asClassName(Codicon.folder),
        tooltip: localize("workspaceScope", "Configure for this workspace only"),
        toggle: { checked: currentScope === "workspace" },
        location: QuickInputButtonLocation.Input
      };
      quickTree.buttons = [scopeButton];
      disposables.add(quickTree.onDidTriggerButton((button) => {
        if (button === scopeButton) {
          currentScope = currentScope === "workspace" ? "profile" : "workspace";
          updatePlaceholder();
          quickTree.setItemTree(buildTreeItems());
        }
      }));
    }
    const updatePlaceholder = () => {
      if (currentScope === "session") {
        quickTree.placeholder = localize("configureSessionToolApprovals", "Configure session tool approvals");
      } else {
        quickTree.placeholder = currentScope === "workspace" ? localize("configureWorkspaceToolApprovals", "Configure workspace tool approvals") : localize("configureGlobalToolApprovals", "Configure global tool approvals");
      }
    };
    updatePlaceholder();
    quickTree.setItemTree(buildTreeItems());
    disposables.add(quickTree.onDidChangeCheckboxState((item) => {
      const newState = item.checked ? currentScope : "never";
      if (item.type === "server" && item.serverId) {
        const serverInfo = serversWithTools.get(item.serverId);
        if (serverInfo) {
          this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
          this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
        }
      } else if (item.type === "tool" && item.toolId) {
        const tool = tools.find((t) => t.id === item.toolId);
        if (tool?.canRequestPostApproval || newState === "never") {
          this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
        }
        if (tool?.canRequestPreApproval || newState === "never") {
          this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
        }
        if (newState === "never") {
          for (const key of this._combinationConfirmStore.getAllConfirmed()) {
            if (key.startsWith(item.toolId + ":combination:")) {
              this._combinationConfirmStore.setAutoConfirmation(key, "never");
            }
          }
        }
        quickTree.setItemTree(buildTreeItems());
      } else if (item.type === "tool-pre" && item.toolId) {
        this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
      } else if (item.type === "tool-post" && item.toolId) {
        this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
      } else if (item.type === "server-pre" && item.serverId) {
        this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
        quickTree.setItemTree(buildTreeItems());
      } else if (item.type === "server-post" && item.serverId) {
        this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
        quickTree.setItemTree(buildTreeItems());
      } else if (item.type === "manage") {
        item.onDidChangeChecked?.(!!item.checked);
      } else if (item.type === "combination" && item.combinationKey) {
        this._combinationConfirmStore.setAutoConfirmation(item.combinationKey, newState, item.label, item.combinationArgs);
        quickTree.setItemTree(buildTreeItems());
      }
    }));
    disposables.add(quickTree.onDidTriggerItemButton((i) => {
      if (i.item.type === "manage") {
        i.item.onDidTriggerItemButton?.(i.button);
      } else if (i.item.type === "combination" && i.button === viewArgsButton && i.item.combinationArgs) {
        this._dialogService.prompt({
          message: localize("combinationArguments", "Arguments"),
          buttons: [],
          custom: {
            markdownDetails: [{
              markdown: new MarkdownString().appendCodeblock("json", i.item.combinationArgs)
            }]
          }
        });
      }
    }));
    disposables.add(quickTree.onDidAccept(async () => {
      const manageItem = quickTree.activeItems.find((i) => i.type === "manage");
      if (manageItem) {
        quickTree.hide();
        await manageItem.onDidOpen?.();
        this.manageConfirmationPreferences(tools, options);
      } else {
        quickTree.hide();
      }
    }));
    disposables.add(quickTree.onDidHide(() => {
      disposables.dispose();
    }));
    quickTree.show();
    if (options?.focusToolId) {
      const focusToolId = options.focusToolId;
      for (const serverItem of quickTree.itemTree) {
        const serverItemTyped = serverItem;
        if (serverItemTyped.children) {
          const toolItem = serverItemTyped.children.find((c) => c.type === "tool" && c.toolId === focusToolId);
          if (toolItem) {
            quickTree.expand(serverItem);
            quickTree.reveal(toolItem);
            break;
          }
        }
      }
    }
  }
  resetToolAutoConfirmation() {
    this._preExecutionToolConfirmStore.reset();
    this._postExecutionToolConfirmStore.reset();
    this._preExecutionServerConfirmStore.reset();
    this._postExecutionServerConfirmStore.reset();
    this._combinationConfirmStore.reset();
    for (const contribution of this._contributions.values()) {
      contribution.reset?.();
    }
  }
};
LanguageModelToolsConfirmationService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IDialogService)
], LanguageModelToolsConfirmationService);
export {
  LanguageModelToolsConfirmationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFxsYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRCdXR0b25XaXRoVG9nZ2xlLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1RyZWVJdGVtLCBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9ucywgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uLCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb25RdWlja1RyZWVJdGVtLCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYsIElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuY29uc3QgUlVOX1dJVEhPVVRfQVBQUk9WQUwgPSBsb2NhbGl6ZSgncnVuV2l0aG91dEFwcHJvdmFsJywgXCJ3aXRob3V0IGFwcHJvdmFsXCIpO1xuY29uc3QgQ09OVElOVUVfV0lUSE9VVF9SRVZJRVdJTkdfUkVTVUxUUyA9IGxvY2FsaXplKCdjb250aW51ZVdpdGhvdXRSZXZpZXdpbmdSZXN1bHRzJywgXCJ3aXRob3V0IHJldmlld2luZyByZXN1bHRcIik7XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBhdXRvLWNvbmZpcm1hdGlvbiBlbnRyeSBpbiB0aGUgY29uZmlybSBzdG9yZS5cbiAqIFdoZW4gYGNvbmZpcm1lZGAgaXMgdHJ1ZSwgdGhlIHRvb2wvY29tYmluYXRpb24gaXMgYXV0by1jb25maXJtZWQuXG4gKiBXaGVuIGBsYWJlbGAgaXMgc2V0LCBpdCBwcm92aWRlcyBhIGh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uXG4gKiBmb3IgZGlzcGxheSBpbiB0aGUgbWFuYWdlbWVudCBVSS5cbiAqL1xuaW50ZXJmYWNlIElBdXRvQ29uZmlybUVudHJ5IHtcblx0cmVhZG9ubHkgY29uZmlybWVkOiB0cnVlO1xuXHRyZWFkb25seSBsYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgYXJndW1lbnRzPzogc3RyaW5nO1xufVxuXG5cbmNsYXNzIEdlbmVyaWNDb25maXJtU3RvcmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfd29ya3NwYWNlU3RvcmU6IExhenk8VG9vbENvbmZpcm1TdG9yZT47XG5cdHByaXZhdGUgX3Byb2ZpbGVTdG9yZTogTGF6eTxUb29sQ29uZmlybVN0b3JlPjtcblx0cHJpdmF0ZSBfbWVtb3J5U3RvcmUgPSBuZXcgTWFwPHN0cmluZywgSUF1dG9Db25maXJtRW50cnk+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fd29ya3NwYWNlU3RvcmUgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb29sQ29uZmlybVN0b3JlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB0aGlzLl9zdG9yYWdlS2V5KSkpO1xuXHRcdHRoaXMuX3Byb2ZpbGVTdG9yZSA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvb2xDb25maXJtU3RvcmUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0aGlzLl9zdG9yYWdlS2V5KSkpO1xuXHR9XG5cblx0cHVibGljIHNldEF1dG9Db25maXJtYXRpb24oaWQ6IHN0cmluZywgc2NvcGU6ICd3b3Jrc3BhY2UnIHwgJ3Byb2ZpbGUnIHwgJ3Nlc3Npb24nIHwgJ25ldmVyJywgbGFiZWw/OiBzdHJpbmcsIGFyZ3M/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBmcm9tIGFsbCBzY29wZXMgZmlyc3Rcblx0XHR0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5zZXRBdXRvQ29uZmlybShpZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuc2V0QXV0b0NvbmZpcm0oaWQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbWVtb3J5U3RvcmUuZGVsZXRlKGlkKTtcblxuXHRcdGNvbnN0IGVudHJ5OiBJQXV0b0NvbmZpcm1FbnRyeSA9IHsgY29uZmlybWVkOiB0cnVlLCBsYWJlbCwgYXJndW1lbnRzOiBhcmdzIH07XG5cdFx0Ly8gU2V0IGluIHRoZSBhcHByb3ByaWF0ZSBzY29wZVxuXHRcdGlmIChzY29wZSA9PT0gJ3dvcmtzcGFjZScpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVN0b3JlLnZhbHVlLnNldEF1dG9Db25maXJtKGlkLCBlbnRyeSk7XG5cdFx0fSBlbHNlIGlmIChzY29wZSA9PT0gJ3Byb2ZpbGUnKSB7XG5cdFx0XHR0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuc2V0QXV0b0NvbmZpcm0oaWQsIGVudHJ5KTtcblx0XHR9IGVsc2UgaWYgKHNjb3BlID09PSAnc2Vzc2lvbicpIHtcblx0XHRcdHRoaXMuX21lbW9yeVN0b3JlLnNldChpZCwgZW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRBdXRvQ29uZmlybWF0aW9uKGlkOiBzdHJpbmcpOiAnd29ya3NwYWNlJyB8ICdwcm9maWxlJyB8ICdzZXNzaW9uJyB8ICduZXZlcicge1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCkpIHtcblx0XHRcdHJldHVybiAnd29ya3NwYWNlJztcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Byb2ZpbGVTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCkpIHtcblx0XHRcdHJldHVybiAncHJvZmlsZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tZW1vcnlTdG9yZS5oYXMoaWQpKSB7XG5cdFx0XHRyZXR1cm4gJ3Nlc3Npb24nO1xuXHRcdH1cblx0XHRyZXR1cm4gJ25ldmVyJztcblx0fVxuXG5cdHB1YmxpYyBnZXRBdXRvQ29uZmlybWF0aW9uSW4oaWQ6IHN0cmluZywgc2NvcGU6ICd3b3Jrc3BhY2UnIHwgJ3Byb2ZpbGUnIHwgJ3Nlc3Npb24nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHNjb3BlID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0cmV0dXJuICEhdGhpcy5fd29ya3NwYWNlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpO1xuXHRcdH0gZWxzZSBpZiAoc2NvcGUgPT09ICdwcm9maWxlJykge1xuXHRcdFx0cmV0dXJuICEhdGhpcy5fcHJvZmlsZVN0b3JlLnZhbHVlLmdldEF1dG9Db25maXJtKGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21lbW9yeVN0b3JlLmhhcyhpZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldExhYmVsKGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCk/LmxhYmVsXG5cdFx0XHQ/PyB0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpPy5sYWJlbFxuXHRcdFx0Pz8gdGhpcy5fbWVtb3J5U3RvcmUuZ2V0KGlkKT8ubGFiZWw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXJndW1lbnRzKGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCk/LmFyZ3VtZW50c1xuXHRcdFx0Pz8gdGhpcy5fcHJvZmlsZVN0b3JlLnZhbHVlLmdldEF1dG9Db25maXJtKGlkKT8uYXJndW1lbnRzXG5cdFx0XHQ/PyB0aGlzLl9tZW1vcnlTdG9yZS5nZXQoaWQpPy5hcmd1bWVudHM7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3NwYWNlU3RvcmUudmFsdWUucmVzZXQoKTtcblx0XHR0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUucmVzZXQoKTtcblx0XHR0aGlzLl9tZW1vcnlTdG9yZS5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljIGNoZWNrQXV0b0NvbmZpcm1hdGlvbihpZDogc3RyaW5nKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH07XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdwcm9maWxlJyB9O1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbWVtb3J5U3RvcmUuaGFzKGlkKSkge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbGxDb25maXJtZWQoKTogU2V0PHN0cmluZz4ge1xuXHRcdGNvbnN0IGFsbCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX3dvcmtzcGFjZVN0b3JlLnZhbHVlLmdldEFsbCgpKSB7XG5cdFx0XHRhbGwuYWRkKGtleSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX3Byb2ZpbGVTdG9yZS52YWx1ZS5nZXRBbGwoKSkge1xuXHRcdFx0YWxsLmFkZChrZXkpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9tZW1vcnlTdG9yZS5rZXlzKCkpIHtcblx0XHRcdGFsbC5hZGQoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbDtcblx0fVxufVxuXG5jbGFzcyBUb29sQ29uZmlybVN0b3JlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2F1dG9Db25maXJtVG9vbHM6IExSVUNhY2hlPHN0cmluZywgSUF1dG9Db25maXJtRW50cnk+ID0gbmV3IExSVUNhY2hlPHN0cmluZywgSUF1dG9Db25maXJtRW50cnk+KDEwMCk7XG5cdHByaXZhdGUgX2RpZENoYW5nZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlOiBTdG9yYWdlU2NvcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUmVhZCBzdG9yZWQgZGF0YSBcdTIwMTQgc3VwcG9ydHMgYm90aCBsZWdhY3kgc3RyaW5nW10gYW5kIG5ldyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuIHwgb2JqZWN0PiBmb3JtYXRzXG5cdFx0Y29uc3QgcmF3ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuX3N0b3JhZ2VLZXksIHRoaXMuX3Njb3BlKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0XHQvLyBMZWdhY3kgZm9ybWF0OiBzdHJpbmdbXVxuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHBhcnNlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYXV0b0NvbmZpcm1Ub29scy5zZXQoa2V5LCB7IGNvbmZpcm1lZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCcgJiYgcGFyc2VkICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkKSkge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0Ly8gTmV3IGZvcm1hdDogeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH1cblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2JqID0gdmFsdWUgYXMgeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH07XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2F1dG9Db25maXJtVG9vbHMuc2V0KGtleSwgeyBjb25maXJtZWQ6IHRydWUsIGxhYmVsOiBvYmoubGFiZWwsIGFyZ3VtZW50czogb2JqLmFyZ3VtZW50cyB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIExlZ2FjeSBmb3JtYXQ6IHN0cmluZyB8IGJvb2xlYW5cblx0XHRcdFx0XHRcdFx0dGhpcy5fYXV0b0NvbmZpcm1Ub29scy5zZXQoa2V5LCB7IGNvbmZpcm1lZDogdHJ1ZSwgbGFiZWw6IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJZ25vcmUgbWFsZm9ybWVkIGRhdGFcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2RpZENoYW5nZSkge1xuXHRcdFx0XHRjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuIHwgeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH0+ID0ge307XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIHRoaXMuX2F1dG9Db25maXJtVG9vbHMpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkuYXJndW1lbnRzKSB7XG5cdFx0XHRcdFx0XHRkYXRhW2tleV0gPSB7IGxhYmVsOiBlbnRyeS5sYWJlbCwgYXJndW1lbnRzOiBlbnRyeS5hcmd1bWVudHMgfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGF0YVtrZXldID0gZW50cnkubGFiZWwgPz8gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9zdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShkYXRhKSwgdGhpcy5fc2NvcGUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdHRoaXMuX2RpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyByZXNldCgpIHtcblx0XHR0aGlzLl9hdXRvQ29uZmlybVRvb2xzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGlkQ2hhbmdlID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBdXRvQ29uZmlybShpZDogc3RyaW5nKTogSUF1dG9Db25maXJtRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fYXV0b0NvbmZpcm1Ub29scy5nZXQoaWQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5fZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdHJldHVybiBlbnRyeTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRBdXRvQ29uZmlybShpZDogc3RyaW5nLCBlbnRyeTogSUF1dG9Db25maXJtRW50cnkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9hdXRvQ29uZmlybVRvb2xzLmRlbGV0ZShpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2F1dG9Db25maXJtVG9vbHMuc2V0KGlkLCBlbnRyeSk7XG5cdFx0fVxuXHRcdHRoaXMuX2RpZENoYW5nZSA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2F1dG9Db25maXJtVG9vbHMua2V5cygpXTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmU6IEdlbmVyaWNDb25maXJtU3RvcmU7XG5cdHByaXZhdGUgX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlOiBHZW5lcmljQ29uZmlybVN0b3JlO1xuXHRwcml2YXRlIF9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmU6IEdlbmVyaWNDb25maXJtU3RvcmU7XG5cdHByaXZhdGUgX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmU6IEdlbmVyaWNDb25maXJtU3RvcmU7XG5cdHByaXZhdGUgX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlOiBHZW5lcmljQ29uZmlybVN0b3JlO1xuXG5cdHByaXZhdGUgX2NvbnRyaWJ1dGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHZW5lcmljQ29uZmlybVN0b3JlKCdjaGF0L2F1dG9jb25maXJtJywgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHZW5lcmljQ29uZmlybVN0b3JlKCdjaGF0L2F1dG9jb25maXJtLXBvc3QnLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHZW5lcmljQ29uZmlybVN0b3JlKCdjaGF0L3NlcnZlcnMvYXV0b2NvbmZpcm0nLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2VuZXJpY0NvbmZpcm1TdG9yZSgnY2hhdC9zZXJ2ZXJzL2F1dG9jb25maXJtLXBvc3QnLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEdlbmVyaWNDb25maXJtU3RvcmUoJ2NoYXQvYXV0b2NvbmZpcm0tY29tYmluYXRpb24nLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHR9XG5cblx0Z2V0UHJlQ29uZmlybUFjdGlvbihyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZik6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gQ2hlY2sgY29udHJpYnV0aW9uIGZpcnN0XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQocmVmLnRvb2xJZCk7XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbj8uZ2V0UHJlQ29uZmlybUFjdGlvbikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29udHJpYnV0aW9uLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBjb250cmlidXRpb24gZGlzYWJsZXMgZGVmYXVsdCBwZXJtaXNzaW9ucywgZG9uJ3QgY2hlY2sgZGVmYXVsdCBzdG9yZXNcblx0XHRpZiAoY29udHJpYnV0aW9uICYmIGNvbnRyaWJ1dGlvbi5jYW5Vc2VEZWZhdWx0QXBwcm92YWxzID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBjb21iaW5hdGlvbi1sZXZlbCBjb25maXJtYXRpb25cblx0XHRpZiAocmVmLmNvbWJpbmF0aW9uKSB7XG5cdFx0XHRjb25zdCBjb21iaW5hdGlvblJlc3VsdCA9IHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlLmNoZWNrQXV0b0NvbmZpcm1hdGlvbihyZWYuY29tYmluYXRpb24ua2V5KTtcblx0XHRcdGlmIChjb21iaW5hdGlvblJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gY29tYmluYXRpb25SZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdG9vbC1sZXZlbCBjb25maXJtYXRpb25cblx0XHRjb25zdCB0b29sUmVzdWx0ID0gdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5jaGVja0F1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCk7XG5cdFx0aWYgKHRvb2xSZXN1bHQpIHtcblx0XHRcdHJldHVybiB0b29sUmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHNlcnZlci1sZXZlbCBjb25maXJtYXRpb24gZm9yIE1DUCB0b29sc1xuXHRcdGlmIChyZWYuc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJSZXN1bHQgPSB0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuY2hlY2tBdXRvQ29uZmlybWF0aW9uKHJlZi5zb3VyY2UuZGVmaW5pdGlvbklkKTtcblx0XHRcdGlmIChzZXJ2ZXJSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHNlcnZlclJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQge1xuXHRcdC8vIENoZWNrIGNvbnRyaWJ1dGlvbiBmaXJzdFxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHJlZi50b29sSWQpO1xuXHRcdGlmIChjb250cmlidXRpb24/LmdldFBvc3RDb25maXJtQWN0aW9uKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb250cmlidXRpb24uZ2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBjb250cmlidXRpb24gZGlzYWJsZXMgZGVmYXVsdCBwZXJtaXNzaW9ucywgZG9uJ3QgY2hlY2sgZGVmYXVsdCBzdG9yZXNcblx0XHRpZiAoY29udHJpYnV0aW9uICYmIGNvbnRyaWJ1dGlvbi5jYW5Vc2VEZWZhdWx0QXBwcm92YWxzID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDaGVjayB0b29sLWxldmVsIGNvbmZpcm1hdGlvblxuXHRcdGNvbnN0IHRvb2xSZXN1bHQgPSB0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5jaGVja0F1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCk7XG5cdFx0aWYgKHRvb2xSZXN1bHQpIHtcblx0XHRcdHJldHVybiB0b29sUmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHNlcnZlci1sZXZlbCBjb25maXJtYXRpb24gZm9yIE1DUCB0b29sc1xuXHRcdGlmIChyZWYuc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJSZXN1bHQgPSB0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLmNoZWNrQXV0b0NvbmZpcm1hdGlvbihyZWYuc291cmNlLmRlZmluaXRpb25JZCk7XG5cdFx0XHRpZiAoc2VydmVyUmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2ZXJSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10gPSBbXTtcblxuXHRcdC8vIEFkZCBjb250cmlidXRpb24gYWN0aW9ucyBmaXJzdFxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHJlZi50b29sSWQpO1xuXHRcdGlmIChjb250cmlidXRpb24/LmdldFByZUNvbmZpcm1BY3Rpb25zKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uY29udHJpYnV0aW9uLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZikpO1xuXHRcdH1cblxuXHRcdC8vIElmIGNvbnRyaWJ1dGlvbiBkaXNhYmxlcyBkZWZhdWx0IHBlcm1pc3Npb25zLCBvbmx5IHJldHVybiBjb250cmlidXRpb24gYWN0aW9uc1xuXHRcdGlmIChjb250cmlidXRpb24gJiYgY29udHJpYnV0aW9uLmNhblVzZURlZmF1bHRBcHByb3ZhbHMgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cblx0XHQvLyBBZGQgY29tYmluYXRpb24tbGV2ZWwgYWN0aW9ucyB3aGVuIGFwcHJvdmVDb21iaW5hdGlvbiBpcyBwcm92aWRlZFxuXHRcdGlmIChyZWYuY29tYmluYXRpb24pIHtcblx0XHRcdGNvbnN0IHsgbGFiZWw6IGNvbWJpbmF0aW9uTGFiZWwsIGtleTogY29tYmluYXRpb25LZXksIGFyZ3VtZW50czogY29tYmluYXRpb25BcmdzIH0gPSByZWYuY29tYmluYXRpb247XG5cdFx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93Q29tYmluYXRpb25TZXNzaW9uJywgJ3swfSBpbiB0aGlzIFNlc3Npb24nLCBjb21iaW5hdGlvbkxhYmVsKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd0NvbWJpbmF0aW9uU2Vzc2lvblRvb2x0aXAnLCAnQWxsb3cgdGhpcyBwYXJ0aWN1bGFyIGNvbWJpbmF0aW9uIG9mIHRvb2wgYW5kIGFyZ3VtZW50cyBpbiB0aGlzIHNlc3Npb24gd2l0aG91dCBjb25maXJtYXRpb24uJyksXG5cdFx0XHRcdFx0ZGl2aWRlcjogISFhY3Rpb25zLmxlbmd0aCxcblx0XHRcdFx0XHRzY29wZTogJ3Nlc3Npb24nLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihjb21iaW5hdGlvbktleSwgJ3Nlc3Npb24nLCBjb21iaW5hdGlvbkxhYmVsLCBjb21iaW5hdGlvbkFyZ3MpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd0NvbWJpbmF0aW9uV29ya3NwYWNlJywgJ3swfSBpbiB0aGlzIFdvcmtzcGFjZScsIGNvbWJpbmF0aW9uTGFiZWwpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93Q29tYmluYXRpb25Xb3Jrc3BhY2VUb29sdGlwJywgJ0FsbG93IHRoaXMgcGFydGljdWxhciBjb21iaW5hdGlvbiBvZiB0b29sIGFuZCBhcmd1bWVudHMgaW4gdGhpcyB3b3Jrc3BhY2Ugd2l0aG91dCBjb25maXJtYXRpb24uJyksXG5cdFx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihjb21iaW5hdGlvbktleSwgJ3dvcmtzcGFjZScsIGNvbWJpbmF0aW9uTGFiZWwsIGNvbWJpbmF0aW9uQXJncyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93Q29tYmluYXRpb25HbG9iYWxseScsICdBbHdheXMgezB9JywgY29tYmluYXRpb25MYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dDb21iaW5hdGlvbkdsb2JhbGx5VG9vbHRpcCcsICdBbHdheXMgYWxsb3cgdGhpcyBwYXJ0aWN1bGFyIGNvbWJpbmF0aW9uIG9mIHRvb2wgYW5kIGFyZ3VtZW50cyB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3Byb2ZpbGUnLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihjb21iaW5hdGlvbktleSwgJ3Byb2ZpbGUnLCBjb21iaW5hdGlvbkxhYmVsLCBjb21iaW5hdGlvbkFyZ3MpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgZGVmYXVsdCB0b29sLWxldmVsIGFjdGlvbnNcblx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXNzaW9uJywgJ0FsbG93IGluIHRoaXMgU2Vzc2lvbicpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1Nlc3Npb25Ub29sdGlwJywgJ0FsbG93IHRoaXMgdG9vbCB0byBydW4gaW4gdGhpcyBzZXNzaW9uIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRkaXZpZGVyOiAhIWFjdGlvbnMubGVuZ3RoLFxuXHRcdFx0XHRzY29wZTogJ3Nlc3Npb24nLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3Nlc3Npb24nKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1dvcmtzcGFjZScsICdBbGxvdyBpbiB0aGlzIFdvcmtzcGFjZScpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1dvcmtzcGFjZVRvb2x0aXAnLCAnQWxsb3cgdGhpcyB0b29sIHRvIHJ1biBpbiB0aGlzIHdvcmtzcGFjZSB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3dvcmtzcGFjZScpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93R2xvYmFsbHknLCAnQWx3YXlzIEFsbG93JyksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93R2xvYmFsbHlUb29sdGlwJywgJ0Fsd2F5cyBhbGxvdyB0aGlzIHRvb2wgdG8gcnVuIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRzY29wZTogJ3Byb2ZpbGUnLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3Byb2ZpbGUnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHQvLyBBZGQgc2VydmVyLWxldmVsIGFjdGlvbnMgZm9yIE1DUCB0b29sc1xuXHRcdGlmIChyZWYuc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRjb25zdCB7IHNlcnZlckxhYmVsLCBkZWZpbml0aW9uSWQgfSA9IHJlZi5zb3VyY2U7XG5cdFx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93U2VydmVyU2Vzc2lvbicsICdBbGxvdyBUb29scyBmcm9tIHswfSBpbiB0aGlzIFNlc3Npb24nLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJTZXNzaW9uVG9vbHRpcCcsICdBbGxvdyBhbGwgdG9vbHMgZnJvbSB0aGlzIHNlcnZlciB0byBydW4gaW4gdGhpcyBzZXNzaW9uIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRcdGRpdmlkZXI6IHRydWUsXG5cdFx0XHRcdFx0c2NvcGU6ICdzZXNzaW9uJyxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGRlZmluaXRpb25JZCwgJ3Nlc3Npb24nKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJXb3Jrc3BhY2UnLCAnQWxsb3cgVG9vbHMgZnJvbSB7MH0gaW4gdGhpcyBXb3Jrc3BhY2UnLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJXb3Jrc3BhY2VUb29sdGlwJywgJ0FsbG93IGFsbCB0b29scyBmcm9tIHRoaXMgc2VydmVyIHRvIHJ1biBpbiB0aGlzIHdvcmtzcGFjZSB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihkZWZpbml0aW9uSWQsICd3b3Jrc3BhY2UnKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJHbG9iYWxseScsICdBbHdheXMgQWxsb3cgVG9vbHMgZnJvbSB7MH0nLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJHbG9iYWxseVRvb2x0aXAnLCAnQWx3YXlzIGFsbG93IGFsbCB0b29scyBmcm9tIHRoaXMgc2VydmVyIHRvIHJ1biB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3Byb2ZpbGUnLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJlRXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oZGVmaW5pdGlvbklkLCAncHJvZmlsZScpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Z2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10gPSBbXTtcblxuXHRcdC8vIEFkZCBjb250cmlidXRpb24gYWN0aW9ucyBmaXJzdFxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHJlZi50b29sSWQpO1xuXHRcdGlmIChjb250cmlidXRpb24/LmdldFBvc3RDb25maXJtQWN0aW9ucykge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLmNvbnRyaWJ1dGlvbi5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgY29udHJpYnV0aW9uIGRpc2FibGVzIGRlZmF1bHQgcGVybWlzc2lvbnMsIG9ubHkgcmV0dXJuIGNvbnRyaWJ1dGlvbiBhY3Rpb25zXG5cdFx0aWYgKGNvbnRyaWJ1dGlvbiAmJiBjb250cmlidXRpb24uY2FuVXNlRGVmYXVsdEFwcHJvdmFscyA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBkZWZhdWx0IHRvb2wtbGV2ZWwgYWN0aW9uc1xuXHRcdGFjdGlvbnMucHVzaChcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1Nlc3Npb25Qb3N0JywgJ0FsbG93IFdpdGhvdXQgUmV2aWV3IGluIHRoaXMgU2Vzc2lvbicpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1Nlc3Npb25Qb3N0VG9vbHRpcCcsICdBbGxvdyByZXN1bHRzIGZyb20gdGhpcyB0b29sIHRvIGJlIHNlbnQgd2l0aG91dCBjb25maXJtYXRpb24gaW4gdGhpcyBzZXNzaW9uLicpLFxuXHRcdFx0XHRkaXZpZGVyOiAhIWFjdGlvbnMubGVuZ3RoLFxuXHRcdFx0XHRzY29wZTogJ3Nlc3Npb24nLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKHJlZi50b29sSWQsICdzZXNzaW9uJyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dXb3Jrc3BhY2VQb3N0JywgJ0FsbG93IFdpdGhvdXQgUmV2aWV3IGluIHRoaXMgV29ya3NwYWNlJyksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93V29ya3NwYWNlUG9zdFRvb2x0aXAnLCAnQWxsb3cgcmVzdWx0cyBmcm9tIHRoaXMgdG9vbCB0byBiZSBzZW50IHdpdGhvdXQgY29uZmlybWF0aW9uIGluIHRoaXMgd29ya3NwYWNlLicpLFxuXHRcdFx0XHRzY29wZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3dvcmtzcGFjZScpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93R2xvYmFsbHlQb3N0JywgJ0Fsd2F5cyBBbGxvdyBXaXRob3V0IFJldmlldycpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd0dsb2JhbGx5UG9zdFRvb2x0aXAnLCAnQWx3YXlzIGFsbG93IHJlc3VsdHMgZnJvbSB0aGlzIHRvb2wgdG8gYmUgc2VudCB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0c2NvcGU6ICdwcm9maWxlJyxcblx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihyZWYudG9vbElkLCAncHJvZmlsZScpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIEFkZCBzZXJ2ZXItbGV2ZWwgYWN0aW9ucyBmb3IgTUNQIHRvb2xzXG5cdFx0aWYgKHJlZi5zb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdGNvbnN0IHsgc2VydmVyTGFiZWwsIGRlZmluaXRpb25JZCB9ID0gcmVmLnNvdXJjZTtcblx0XHRcdGFjdGlvbnMucHVzaChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJTZXNzaW9uUG9zdCcsICdBbGxvdyBUb29scyBmcm9tIHswfSBXaXRob3V0IFJldmlldyBpbiB0aGlzIFNlc3Npb24nLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJTZXNzaW9uUG9zdFRvb2x0aXAnLCAnQWxsb3cgcmVzdWx0cyBmcm9tIGFsbCB0b29scyBmcm9tIHRoaXMgc2VydmVyIHRvIGJlIHNlbnQgd2l0aG91dCBjb25maXJtYXRpb24gaW4gdGhpcyBzZXNzaW9uLicpLFxuXHRcdFx0XHRcdGRpdmlkZXI6IHRydWUsXG5cdFx0XHRcdFx0c2NvcGU6ICdzZXNzaW9uJyxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihkZWZpbml0aW9uSWQsICdzZXNzaW9uJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93U2VydmVyV29ya3NwYWNlUG9zdCcsICdBbGxvdyBUb29scyBmcm9tIHswfSBXaXRob3V0IFJldmlldyBpbiB0aGlzIFdvcmtzcGFjZScsIHNlcnZlckxhYmVsKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1NlcnZlcldvcmtzcGFjZVBvc3RUb29sdGlwJywgJ0FsbG93IHJlc3VsdHMgZnJvbSBhbGwgdG9vbHMgZnJvbSB0aGlzIHNlcnZlciB0byBiZSBzZW50IHdpdGhvdXQgY29uZmlybWF0aW9uIGluIHRoaXMgd29ya3NwYWNlLicpLFxuXHRcdFx0XHRcdHNjb3BlOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihkZWZpbml0aW9uSWQsICd3b3Jrc3BhY2UnKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJHbG9iYWxseVBvc3QnLCAnQWx3YXlzIEFsbG93IFRvb2xzIGZyb20gezB9IFdpdGhvdXQgUmV2aWV3Jywgc2VydmVyTGFiZWwpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93U2VydmVyR2xvYmFsbHlQb3N0VG9vbHRpcCcsICdBbHdheXMgYWxsb3cgcmVzdWx0cyBmcm9tIGFsbCB0b29scyBmcm9tIHRoaXMgc2VydmVyIHRvIGJlIHNlbnQgd2l0aG91dCBjb25maXJtYXRpb24uJyksXG5cdFx0XHRcdFx0c2NvcGU6ICdwcm9maWxlJyxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihkZWZpbml0aW9uSWQsICdwcm9maWxlJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRyZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbih0b29sTmFtZTogc3RyaW5nLCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jb250cmlidXRpb25zLnNldCh0b29sTmFtZSwgY29udHJpYnV0aW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250cmlidXRpb25zLmRlbGV0ZSh0b29sTmFtZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHRvb2xDYW5NYW5hZ2VDb25maXJtYXRpb24odG9vbDogSVRvb2xEYXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdG9vbC5jYW5SZXF1ZXN0UHJlQXBwcm92YWxcblx0XHRcdHx8ICEhdG9vbC5jYW5SZXF1ZXN0UG9zdEFwcHJvdmFsXG5cdFx0XHR8fCB0aGlzLl9jb250cmlidXRpb25zLmhhcyh0b29sLmlkKVxuXHRcdFx0fHwgISF0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmNoZWNrQXV0b0NvbmZpcm1hdGlvbih0b29sLmlkKVxuXHRcdFx0fHwgISF0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5jaGVja0F1dG9Db25maXJtYXRpb24odG9vbC5pZClcblx0XHRcdHx8IHRoaXMuX2hhc0NvbWJpbmF0aW9uQXBwcm92YWxzRm9yVG9vbCh0b29sLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0NvbWJpbmF0aW9uQXBwcm92YWxzRm9yVG9vbCh0b29sSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByZWZpeCA9IHRvb2xJZCArICc6Y29tYmluYXRpb246Jztcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5nZXRBbGxDb25maXJtZWQoKSkge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbWJpbmF0aW9uQXBwcm92YWxzRm9yVG9vbCh0b29sSWQ6IHN0cmluZywgc2NvcGU6ICd3b3Jrc3BhY2UnIHwgJ3Byb2ZpbGUnIHwgJ3Nlc3Npb24nKTogeyBrZXk6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH1bXSB7XG5cdFx0Y29uc3QgcHJlZml4ID0gdG9vbElkICsgJzpjb21iaW5hdGlvbjonO1xuXHRcdGNvbnN0IHJlc3VsdHM6IHsga2V5OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGFyZ3VtZW50cz86IHN0cmluZyB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5nZXRBbGxDb25maXJtZWQoKSkge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkgJiYgdGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKGtleSwgc2NvcGUpKSB7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuZ2V0TGFiZWwoa2V5KSA/PyBrZXk7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSB0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5nZXRBcmd1bWVudHMoa2V5KTtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKHsga2V5LCBsYWJlbCwgYXJndW1lbnRzOiBhcmdzIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdG1hbmFnZUNvbmZpcm1hdGlvblByZWZlcmVuY2VzKHRvb2xzOiByZWFkb25seSBJVG9vbERhdGFbXSwgb3B0aW9ucz86IHsgZGVmYXVsdFNjb3BlPzogJ3dvcmtzcGFjZScgfCAncHJvZmlsZScgfCAnc2Vzc2lvbic7IGZvY3VzVG9vbElkPzogc3RyaW5nIH0pOiB2b2lkIHtcblx0XHRpbnRlcmZhY2UgSVRvb2xUcmVlSXRlbSBleHRlbmRzIElRdWlja1RyZWVJdGVtIHtcblx0XHRcdHR5cGU6ICd0b29sJyB8ICdzZXJ2ZXInIHwgJ3Rvb2wtcHJlJyB8ICd0b29sLXBvc3QnIHwgJ3NlcnZlci1wcmUnIHwgJ3NlcnZlci1wb3N0JyB8ICdtYW5hZ2UnIHwgJ2NvbWJpbmF0aW9uJztcblx0XHRcdHRvb2xJZD86IHN0cmluZztcblx0XHRcdHNlcnZlcklkPzogc3RyaW5nO1xuXHRcdFx0c2NvcGU/OiAnd29ya3NwYWNlJyB8ICdwcm9maWxlJztcblx0XHRcdGNvbWJpbmF0aW9uS2V5Pzogc3RyaW5nO1xuXHRcdFx0Y29tYmluYXRpb25BcmdzPzogc3RyaW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdBcmdzQnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgndmlld0NvbWJpbmF0aW9uQXJndW1lbnRzJywgXCJWaWV3IEFyZ3VtZW50c1wiKSxcblx0XHR9O1xuXG5cdFx0Ly8gSGVscGVyIHRvIHRyYWNrIHRvb2xzIHVuZGVyIHNlcnZlcnNcblx0XHRjb25zdCB0cmFja1NlcnZlclRvb2wgPSAoc2VydmVySWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdG9vbElkOiBzdHJpbmcsIHNlcnZlcnNXaXRoVG9vbHM6IE1hcDxzdHJpbmcsIHsgbGFiZWw6IHN0cmluZzsgdG9vbHM6IFNldDxzdHJpbmc+IH0+KSA9PiB7XG5cdFx0XHRpZiAoIXNlcnZlcnNXaXRoVG9vbHMuaGFzKHNlcnZlcklkKSkge1xuXHRcdFx0XHRzZXJ2ZXJzV2l0aFRvb2xzLnNldChzZXJ2ZXJJZCwgeyBsYWJlbCwgdG9vbHM6IG5ldyBTZXQoKSB9KTtcblx0XHRcdH1cblx0XHRcdHNlcnZlcnNXaXRoVG9vbHMuZ2V0KHNlcnZlcklkKSEudG9vbHMuYWRkKHRvb2xJZCk7XG5cdFx0fTtcblxuXHRcdC8vIEhlbHBlciB0byBhZGQgc2VydmVyIHRvb2wgZnJvbSBzb3VyY2Vcblx0XHRjb25zdCBhZGRTZXJ2ZXJUb29sRnJvbVNvdXJjZSA9IChzb3VyY2U6IFRvb2xEYXRhU291cmNlLCB0b29sSWQ6IHN0cmluZywgc2VydmVyc1dpdGhUb29sczogTWFwPHN0cmluZywgeyBsYWJlbDogc3RyaW5nOyB0b29sczogU2V0PHN0cmluZz4gfT4pID0+IHtcblx0XHRcdGlmIChzb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdFx0dHJhY2tTZXJ2ZXJUb29sKHNvdXJjZS5kZWZpbml0aW9uSWQsIHNvdXJjZS5zZXJ2ZXJMYWJlbCB8fCBzb3VyY2UubGFiZWwsIHRvb2xJZCwgc2VydmVyc1dpdGhUb29scyk7XG5cdFx0XHR9IGVsc2UgaWYgKHNvdXJjZS50eXBlID09PSAnZXh0ZW5zaW9uJykge1xuXHRcdFx0XHR0cmFja1NlcnZlclRvb2woc291cmNlLmV4dGVuc2lvbklkLnZhbHVlLCBzb3VyY2UubGFiZWwsIHRvb2xJZCwgc2VydmVyc1dpdGhUb29scyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIERldGVybWluZSB3aGljaCB0b29scyBzaG91bGQgYmUgc2hvd25cblx0XHRjb25zdCByZWxldmFudFRvb2xzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgc2VydmVyc1dpdGhUb29scyA9IG5ldyBNYXA8c3RyaW5nLCB7IGxhYmVsOiBzdHJpbmc7IHRvb2xzOiBTZXQ8c3RyaW5nPiB9PigpO1xuXG5cdFx0Ly8gQWRkIHRvb2xzIHRoYXQgcmVxdWVzdCBhcHByb3ZhbFxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29scykge1xuXHRcdFx0aWYgKHRvb2wuY2FuUmVxdWVzdFByZUFwcHJvdmFsIHx8IHRvb2wuY2FuUmVxdWVzdFBvc3RBcHByb3ZhbCB8fCB0aGlzLl9jb250cmlidXRpb25zLmhhcyh0b29sLmlkKSkge1xuXHRcdFx0XHRyZWxldmFudFRvb2xzLmFkZCh0b29sLmlkKTtcblx0XHRcdFx0YWRkU2VydmVyVG9vbEZyb21Tb3VyY2UodG9vbC5zb3VyY2UsIHRvb2wuaWQsIHNlcnZlcnNXaXRoVG9vbHMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCB0b29scyB0aGF0IGhhdmUgc3RvcmVkIGFwcHJvdmFscyAoYnV0IHdlIGNhbid0IGRpc3BsYXkgdGhlbSB3aXRob3V0IG1ldGFkYXRhKVxuXHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBbGxDb25maXJtZWQoKSkge1xuXHRcdFx0aWYgKCFyZWxldmFudFRvb2xzLmhhcyhpZCkpIHtcblx0XHRcdFx0Ly8gT25seSBhZGQgaWYgd2UgaGF2ZSB0aGUgdG9vbCBkYXRhXG5cdFx0XHRcdGNvbnN0IHRvb2wgPSB0b29scy5maW5kKHQgPT4gdC5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAodG9vbCkge1xuXHRcdFx0XHRcdHJlbGV2YW50VG9vbHMuYWRkKGlkKTtcblx0XHRcdFx0XHRhZGRTZXJ2ZXJUb29sRnJvbVNvdXJjZSh0b29sLnNvdXJjZSwgaWQsIHNlcnZlcnNXaXRoVG9vbHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QWxsQ29uZmlybWVkKCkpIHtcblx0XHRcdGlmICghcmVsZXZhbnRUb29scy5oYXMoaWQpKSB7XG5cdFx0XHRcdC8vIE9ubHkgYWRkIGlmIHdlIGhhdmUgdGhlIHRvb2wgZGF0YVxuXHRcdFx0XHRjb25zdCB0b29sID0gdG9vbHMuZmluZCh0ID0+IHQuaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKHRvb2wpIHtcblx0XHRcdFx0XHRyZWxldmFudFRvb2xzLmFkZChpZCk7XG5cdFx0XHRcdFx0YWRkU2VydmVyVG9vbEZyb21Tb3VyY2UodG9vbC5zb3VyY2UsIGlkLCBzZXJ2ZXJzV2l0aFRvb2xzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCB0b29scyB0aGF0IGhhdmUgY29tYmluYXRpb24gYXBwcm92YWxzXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzKSB7XG5cdFx0XHRpZiAoIXJlbGV2YW50VG9vbHMuaGFzKHRvb2wuaWQpICYmIHRoaXMuX2hhc0NvbWJpbmF0aW9uQXBwcm92YWxzRm9yVG9vbCh0b29sLmlkKSkge1xuXHRcdFx0XHRyZWxldmFudFRvb2xzLmFkZCh0b29sLmlkKTtcblx0XHRcdFx0YWRkU2VydmVyVG9vbEZyb21Tb3VyY2UodG9vbC5zb3VyY2UsIHRvb2wuaWQsIHNlcnZlcnNXaXRoVG9vbHMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZWxldmFudFRvb2xzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjsgLy8gTm90aGluZyB0byBzaG93XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIGluaXRpYWwgc2NvcGUgZnJvbSBvcHRpb25zXG5cdFx0bGV0IGN1cnJlbnRTY29wZSA9IG9wdGlvbnM/LmRlZmF1bHRTY29wZSA/PyAnd29ya3NwYWNlJztcblxuXHRcdC8vIEhlbHBlciBmdW5jdGlvbiB0byBidWlsZCB0cmVlIGl0ZW1zIGJhc2VkIG9uIGN1cnJlbnQgc2NvcGVcblx0XHRjb25zdCBidWlsZFRyZWVJdGVtcyA9ICgpOiBJVG9vbFRyZWVJdGVtW10gPT4ge1xuXHRcdFx0Y29uc3QgdHJlZUl0ZW1zOiBJVG9vbFRyZWVJdGVtW10gPSBbXTtcblxuXHRcdFx0Ly8gQWRkIHNlcnZlciBub2Rlc1xuXHRcdFx0Zm9yIChjb25zdCBbc2VydmVySWQsIHNlcnZlckluZm9dIG9mIHNlcnZlcnNXaXRoVG9vbHMpIHtcblx0XHRcdFx0Y29uc3Qgc2VydmVyQ2hpbGRyZW46IElUb29sVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdC8vIEFkZCBzZXJ2ZXItbGV2ZWwgY29udHJvbHMgYXMgZmlyc3QgY2hpbGRyZW5cblx0XHRcdFx0Y29uc3QgaGFzQW55UHJlID0gQXJyYXkuZnJvbShzZXJ2ZXJJbmZvLnRvb2xzKS5zb21lKHRvb2xJZCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzLmZpbmQodCA9PiB0LmlkID09PSB0b29sSWQpO1xuXHRcdFx0XHRcdHJldHVybiB0b29sPy5jYW5SZXF1ZXN0UHJlQXBwcm92YWw7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBoYXNBbnlQb3N0ID0gQXJyYXkuZnJvbShzZXJ2ZXJJbmZvLnRvb2xzKS5zb21lKHRvb2xJZCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzLmZpbmQodCA9PiB0LmlkID09PSB0b29sSWQpO1xuXHRcdFx0XHRcdHJldHVybiB0b29sPy5jYW5SZXF1ZXN0UG9zdEFwcHJvdmFsO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBzZXJ2ZXJQcmVDb25maXJtZWQgPSB0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHNlcnZlcklkLCBjdXJyZW50U2NvcGUpO1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXJQb3N0Q29uZmlybWVkID0gdGhpcy5fcG9zdEV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4oc2VydmVySWQsIGN1cnJlbnRTY29wZSk7XG5cblx0XHRcdFx0Ly8gQWRkIGluZGl2aWR1YWwgdG9vbHMgZnJvbSB0aGlzIHNlcnZlciBhcyBjaGlsZHJlblxuXHRcdFx0XHRmb3IgKGNvbnN0IHRvb2xJZCBvZiBzZXJ2ZXJJbmZvLnRvb2xzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzLmZpbmQodCA9PiB0LmlkID09PSB0b29sSWQpO1xuXHRcdFx0XHRcdGlmICghdG9vbCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdG9vbENoaWxkcmVuOiBJVG9vbFRyZWVJdGVtW10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBoYXNQcmUgPSAhc2VydmVyUHJlQ29uZmlybWVkICYmICh0b29sLmNhblJlcXVlc3RQcmVBcHByb3ZhbCB8fCB0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25Jbih0b29sLmlkLCBjdXJyZW50U2NvcGUpKTtcblx0XHRcdFx0XHRjb25zdCBoYXNQb3N0ID0gIXNlcnZlclBvc3RDb25maXJtZWQgJiYgKHRvb2wuY2FuUmVxdWVzdFBvc3RBcHByb3ZhbCB8fCB0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKSk7XG5cblx0XHRcdFx0XHQvLyBBZGQgY2hpbGQgaXRlbXMgZm9yIGdyYW51bGFyIGNvbnRyb2wgd2hlbiBib3RoIGFwcHJvdmFsIHR5cGVzIGV4aXN0XG5cdFx0XHRcdFx0aWYgKGhhc1ByZSAmJiBoYXNQb3N0KSB7XG5cdFx0XHRcdFx0XHR0b29sQ2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICd0b29sLXByZScsXG5cdFx0XHRcdFx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IFJVTl9XSVRIT1VUX0FQUFJPVkFMLFxuXHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25Jbih0b29sLmlkLCBjdXJyZW50U2NvcGUpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRvb2xDaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3Rvb2wtcG9zdCcsXG5cdFx0XHRcdFx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IENPTlRJTlVFX1dJVEhPVVRfUkVWSUVXSU5HX1JFU1VMVFMsXG5cdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25Jbih0b29sLmlkLCBjdXJyZW50U2NvcGUpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBBZGQgY29tYmluYXRpb24gYXBwcm92YWwgY2hpbGRyZW5cblx0XHRcdFx0XHRjb25zdCBjb21iaW5hdGlvbkFwcHJvdmFscyA9IHRoaXMuX2dldENvbWJpbmF0aW9uQXBwcm92YWxzRm9yVG9vbCh0b29sLmlkLCBjdXJyZW50U2NvcGUpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgeyBrZXksIGxhYmVsLCBhcmd1bWVudHM6IGFyZ3MgfSBvZiBjb21iaW5hdGlvbkFwcHJvdmFscykge1xuXHRcdFx0XHRcdFx0dG9vbENoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnY29tYmluYXRpb24nLFxuXHRcdFx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0XHRcdGNvbWJpbmF0aW9uS2V5OiBrZXksXG5cdFx0XHRcdFx0XHRcdGNvbWJpbmF0aW9uQXJnczogYXJncyxcblx0XHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGJ1dHRvbnM6IGFyZ3MgPyBbdmlld0FyZ3NCdXR0b25dIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVG9vbCBpdGVtIGFsd2F5cyBoYXMgYSBjaGVja2JveFxuXHRcdFx0XHRcdGNvbnN0IHByZUFwcHJvdmFsID0gdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0XHRjb25zdCBwb3N0QXBwcm92YWwgPSB0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0XHRsZXQgY2hlY2tlZDogYm9vbGVhbiB8ICdtaXhlZCc7XG5cdFx0XHRcdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRpZiAoaGFzUHJlICYmIGhhc1Bvc3QpIHtcblx0XHRcdFx0XHRcdC8vIEJvdGg6IGNoZWNrYm94IGlzIG1peGVkIGlmIG9ubHkgb25lIGlzIGVuYWJsZWRcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBwcmVBcHByb3ZhbCAmJiBwb3N0QXBwcm92YWwgPyB0cnVlIDogKCFwcmVBcHByb3ZhbCAmJiAhcG9zdEFwcHJvdmFsID8gZmFsc2UgOiAnbWl4ZWQnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1ByZSkge1xuXHRcdFx0XHRcdFx0Y2hlY2tlZCA9IHByZUFwcHJvdmFsO1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24gPSBSVU5fV0lUSE9VVF9BUFBST1ZBTDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1Bvc3QpIHtcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBwb3N0QXBwcm92YWw7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbiA9IENPTlRJTlVFX1dJVEhPVVRfUkVWSUVXSU5HX1JFU1VMVFM7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0b29sQ2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Ly8gVG9vbCBoYXMgY29tYmluYXRpb24gYXBwcm92YWxzIG9ubHlcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gU2tpcCB0b29scyB3aXRoIG5vIGFjdGl2ZSBhcHByb3ZhbHMsIG5vIGNoaWxkcmVuLCBhbmQgbm8gYXBwcm92YWwgY2FwYWJpbGl0aWVzLlxuXHRcdFx0XHRcdC8vIFRvb2xzIHRoYXQgY2FuIHJlcXVlc3QgcHJlL3Bvc3QgYXBwcm92YWwgc2hvdWxkIGFsd2F5cyByZW1haW4gdmlzaWJsZS5cblx0XHRcdFx0XHRpZiAoY2hlY2tlZCA9PT0gZmFsc2UgJiYgdG9vbENoaWxkcmVuLmxlbmd0aCA9PT0gMCAmJiAhdG9vbC5jYW5SZXF1ZXN0UHJlQXBwcm92YWwgJiYgIXRvb2wuY2FuUmVxdWVzdFBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c2VydmVyQ2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiAndG9vbCcsXG5cdFx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogdG9vbC5kaXNwbGF5TmFtZSB8fCB0b29sLmlkLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRjaGVja2VkLFxuXHRcdFx0XHRcdFx0Y29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IHRvb2xDaGlsZHJlbi5sZW5ndGggPiAwID8gdG9vbENoaWxkcmVuIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXJ2ZXJDaGlsZHJlbi5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG5cdFx0XHRcdGlmIChoYXNBbnlQb3N0KSB7XG5cdFx0XHRcdFx0c2VydmVyQ2hpbGRyZW4udW5zaGlmdCh7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc2VydmVyLXBvc3QnLFxuXHRcdFx0XHRcdFx0c2VydmVySWQsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBsYXkpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb250aW51ZVdpdGhvdXRSZXZpZXdpbmcnLCBcIkNvbnRpbnVlIHdpdGhvdXQgcmV2aWV3aW5nIGFueSB0b29sIHJlc3VsdHNcIiksXG5cdFx0XHRcdFx0XHRjaGVja2VkOiBzZXJ2ZXJQb3N0Q29uZmlybWVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhhc0FueVByZSkge1xuXHRcdFx0XHRcdHNlcnZlckNoaWxkcmVuLnVuc2hpZnQoe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3NlcnZlci1wcmUnLFxuXHRcdFx0XHRcdFx0c2VydmVySWQsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBsYXkpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdydW5Ub29sc1dpdGhvdXRBcHByb3ZhbCcsIFwiUnVuIGFueSB0b29sIHdpdGhvdXQgYXBwcm92YWxcIiksXG5cdFx0XHRcdFx0XHRjaGVja2VkOiBzZXJ2ZXJQcmVDb25maXJtZWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNlcnZlciBub2RlIGhhcyBjaGVja2JveCB0byBjb250cm9sIGJvdGggcHJlIGFuZCBwb3N0XG5cdFx0XHRcdGNvbnN0IHNlcnZlckhhc1ByZSA9IHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4oc2VydmVySWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdGNvbnN0IHNlcnZlckhhc1Bvc3QgPSB0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25JbihzZXJ2ZXJJZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0bGV0IHNlcnZlckNoZWNrZWQ6IGJvb2xlYW4gfCAnbWl4ZWQnO1xuXHRcdFx0XHRpZiAoaGFzQW55UHJlICYmIGhhc0FueVBvc3QpIHtcblx0XHRcdFx0XHRzZXJ2ZXJDaGVja2VkID0gc2VydmVySGFzUHJlICYmIHNlcnZlckhhc1Bvc3QgPyB0cnVlIDogKCFzZXJ2ZXJIYXNQcmUgJiYgIXNlcnZlckhhc1Bvc3QgPyBmYWxzZSA6ICdtaXhlZCcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0FueVByZSkge1xuXHRcdFx0XHRcdHNlcnZlckNoZWNrZWQgPSBzZXJ2ZXJIYXNQcmU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzQW55UG9zdCkge1xuXHRcdFx0XHRcdHNlcnZlckNoZWNrZWQgPSBzZXJ2ZXJIYXNQb3N0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlcnZlckNoZWNrZWQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nSXRlbSA9IHF1aWNrVHJlZS5pdGVtVHJlZS5maW5kKGkgPT4gaS5zZXJ2ZXJJZCA9PT0gc2VydmVySWQpO1xuXHRcdFx0XHR0cmVlSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ3NlcnZlcicsXG5cdFx0XHRcdFx0c2VydmVySWQsXG5cdFx0XHRcdFx0bGFiZWw6IHNlcnZlckluZm8ubGFiZWwsXG5cdFx0XHRcdFx0Y2hlY2tlZDogc2VydmVyQ2hlY2tlZCxcblx0XHRcdFx0XHRjaGlsZHJlbjogc2VydmVyQ2hpbGRyZW4sXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiBleGlzdGluZ0l0ZW0gPyBxdWlja1RyZWUuaXNDb2xsYXBzZWQoZXhpc3RpbmdJdGVtKSA6IHRydWUsXG5cdFx0XHRcdFx0cGlja2FibGU6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgaW5kaXZpZHVhbCB0b29sIG5vZGVzIChvbmx5IGZvciBub24tTUNQL2V4dGVuc2lvbiB0b29scylcblx0XHRcdGNvbnN0IHNvcnRlZFRvb2xzID0gdG9vbHMuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSkpO1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHNvcnRlZFRvb2xzKSB7XG5cdFx0XHRcdGlmICghcmVsZXZhbnRUb29scy5oYXModG9vbC5pZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNraXAgdG9vbHMgdGhhdCBiZWxvbmcgdG8gTUNQL2V4dGVuc2lvbiBzZXJ2ZXJzICh0aGV5J3JlIHNob3duIHVuZGVyIHNlcnZlciBub2Rlcylcblx0XHRcdFx0aWYgKHRvb2wuc291cmNlLnR5cGUgPT09ICdtY3AnIHx8IHRvb2wuc291cmNlLnR5cGUgPT09ICdleHRlbnNpb24nKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250cmlidXRlZCA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHRvb2wuaWQpO1xuXHRcdFx0XHRjb25zdCB0b29sQ2hpbGRyZW46IElUb29sVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IG1hbmFnZUFjdGlvbnMgPSBjb250cmlidXRlZD8uZ2V0TWFuYWdlQWN0aW9ucz8uKCk7XG5cdFx0XHRcdGlmIChtYW5hZ2VBY3Rpb25zKSB7XG5cdFx0XHRcdFx0dG9vbENoaWxkcmVuLnB1c2goLi4ubWFuYWdlQWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFuYWdlJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdC4uLmFjdGlvbixcblx0XHRcdFx0XHR9KSkpO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRsZXQgY2hlY2tlZDogYm9vbGVhbiB8ICdtaXhlZCcgPSBmYWxzZTtcblx0XHRcdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBwaWNrYWJsZSA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmIChjb250cmlidXRlZD8uY2FuVXNlRGVmYXVsdEFwcHJvdmFscyAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHRwaWNrYWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0Y29uc3QgaGFzUHJlID0gdG9vbC5jYW5SZXF1ZXN0UHJlQXBwcm92YWwgfHwgdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0XHRjb25zdCBoYXNQb3N0ID0gdG9vbC5jYW5SZXF1ZXN0UG9zdEFwcHJvdmFsIHx8IHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25Jbih0b29sLmlkLCBjdXJyZW50U2NvcGUpO1xuXG5cdFx0XHRcdFx0Ly8gQWRkIGNoaWxkIGl0ZW1zIGZvciBncmFudWxhciBjb250cm9sIHdoZW4gYm90aCBhcHByb3ZhbCB0eXBlcyBleGlzdFxuXHRcdFx0XHRcdGlmIChoYXNQcmUgJiYgaGFzUG9zdCkge1xuXHRcdFx0XHRcdFx0dG9vbENoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAndG9vbC1wcmUnLFxuXHRcdFx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBSVU5fV0lUSE9VVF9BUFBST1ZBTCxcblx0XHRcdFx0XHRcdFx0Y2hlY2tlZDogdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0b29sQ2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICd0b29sLXBvc3QnLFxuXHRcdFx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBDT05USU5VRV9XSVRIT1VUX1JFVklFV0lOR19SRVNVTFRTLFxuXHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQWRkIGNvbWJpbmF0aW9uIGFwcHJvdmFsIGNoaWxkcmVuXG5cdFx0XHRcdFx0Y29uc3QgY29tYmluYXRpb25BcHByb3ZhbHMgPSB0aGlzLl9nZXRDb21iaW5hdGlvbkFwcHJvdmFsc0ZvclRvb2wodG9vbC5pZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHsga2V5LCBsYWJlbCwgYXJndW1lbnRzOiBhcmdzIH0gb2YgY29tYmluYXRpb25BcHByb3ZhbHMpIHtcblx0XHRcdFx0XHRcdHRvb2xDaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2NvbWJpbmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0XHRcdFx0XHRjb21iaW5hdGlvbktleToga2V5LFxuXHRcdFx0XHRcdFx0XHRjb21iaW5hdGlvbkFyZ3M6IGFyZ3MsXG5cdFx0XHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRidXR0b25zOiBhcmdzID8gW3ZpZXdBcmdzQnV0dG9uXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFRvb2wgaXRlbSBhbHdheXMgaGFzIGEgY2hlY2tib3hcblx0XHRcdFx0XHRjb25zdCBwcmVBcHByb3ZhbCA9IHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdFx0Y29uc3QgcG9zdEFwcHJvdmFsID0gdGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSk7XG5cblx0XHRcdFx0XHRpZiAoaGFzUHJlICYmIGhhc1Bvc3QpIHtcblx0XHRcdFx0XHRcdC8vIEJvdGg6IGNoZWNrYm94IGlzIG1peGVkIGlmIG9ubHkgb25lIGlzIGVuYWJsZWRcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBwcmVBcHByb3ZhbCAmJiBwb3N0QXBwcm92YWwgPyB0cnVlIDogKCFwcmVBcHByb3ZhbCAmJiAhcG9zdEFwcHJvdmFsID8gZmFsc2UgOiAnbWl4ZWQnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1ByZSkge1xuXHRcdFx0XHRcdFx0Y2hlY2tlZCA9IHByZUFwcHJvdmFsO1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24gPSBSVU5fV0lUSE9VVF9BUFBST1ZBTDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1Bvc3QpIHtcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBwb3N0QXBwcm92YWw7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbiA9IENPTlRJTlVFX1dJVEhPVVRfUkVWSUVXSU5HX1JFU1VMVFM7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE5vIGFwcHJvdmFsIGNhcGFiaWxpdGllcyAtIHNob3VsZG4ndCBoYXBwZW4gYnV0IGhhbmRsZSBpdFxuXHRcdFx0XHRcdFx0Y2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNraXAgdG9vbHMgd2l0aCBubyBhY3RpdmUgYXBwcm92YWxzLCBubyBjaGlsZHJlbiwgYW5kIG5vIGFwcHJvdmFsIGNhcGFiaWxpdGllcy5cblx0XHRcdFx0Ly8gVG9vbHMgdGhhdCBjYW4gcmVxdWVzdCBwcmUvcG9zdCBhcHByb3ZhbCBzaG91bGQgYWx3YXlzIHJlbWFpbiB2aXNpYmxlLlxuXHRcdFx0XHRpZiAoY2hlY2tlZCA9PT0gZmFsc2UgJiYgdG9vbENoaWxkcmVuLmxlbmd0aCA9PT0gMCAmJiAhdG9vbC5jYW5SZXF1ZXN0UHJlQXBwcm92YWwgJiYgIXRvb2wuY2FuUmVxdWVzdFBvc3RBcHByb3ZhbCAmJiAhdGhpcy5fY29udHJpYnV0aW9ucy5oYXModG9vbC5pZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyZWVJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbCcsXG5cdFx0XHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0XHRcdGxhYmVsOiB0b29sLmRpc3BsYXlOYW1lIHx8IHRvb2wuaWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y2hlY2tlZCxcblx0XHRcdFx0XHRwaWNrYWJsZSxcblx0XHRcdFx0XHRjb2xsYXBzZWQ6IHRvb2xzLmxlbmd0aCA+IDEsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IHRvb2xDaGlsZHJlbi5sZW5ndGggPiAwID8gdG9vbENoaWxkcmVuIDogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJlZUl0ZW1zO1xuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1RyZWUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tUcmVlPElUb29sVHJlZUl0ZW0+KCkpO1xuXHRcdHF1aWNrVHJlZS5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0cXVpY2tUcmVlLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cblx0XHQvLyBPbmx5IHNob3cgdG9nZ2xlIGlmIG5vdCBpbiBzZXNzaW9uIHNjb3BlXG5cdFx0aWYgKGN1cnJlbnRTY29wZSAhPT0gJ3Nlc3Npb24nKSB7XG5cdFx0XHRjb25zdCBzY29wZUJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b25XaXRoVG9nZ2xlID0ge1xuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZvbGRlciksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCd3b3Jrc3BhY2VTY29wZScsIFwiQ29uZmlndXJlIGZvciB0aGlzIHdvcmtzcGFjZSBvbmx5XCIpLFxuXHRcdFx0XHR0b2dnbGU6IHsgY2hlY2tlZDogY3VycmVudFNjb3BlID09PSAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHRsb2NhdGlvbjogUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLklucHV0XG5cdFx0XHR9O1xuXHRcdFx0cXVpY2tUcmVlLmJ1dHRvbnMgPSBbc2NvcGVCdXR0b25dO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrVHJlZS5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdFx0aWYgKGJ1dHRvbiA9PT0gc2NvcGVCdXR0b24pIHtcblx0XHRcdFx0XHRjdXJyZW50U2NvcGUgPSBjdXJyZW50U2NvcGUgPT09ICd3b3Jrc3BhY2UnID8gJ3Byb2ZpbGUnIDogJ3dvcmtzcGFjZSc7XG5cdFx0XHRcdFx0dXBkYXRlUGxhY2Vob2xkZXIoKTtcblx0XHRcdFx0XHRxdWlja1RyZWUuc2V0SXRlbVRyZWUoYnVpbGRUcmVlSXRlbXMoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVQbGFjZWhvbGRlciA9ICgpID0+IHtcblx0XHRcdGlmIChjdXJyZW50U2NvcGUgPT09ICdzZXNzaW9uJykge1xuXHRcdFx0XHRxdWlja1RyZWUucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY29uZmlndXJlU2Vzc2lvblRvb2xBcHByb3ZhbHMnLCBcIkNvbmZpZ3VyZSBzZXNzaW9uIHRvb2wgYXBwcm92YWxzXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cXVpY2tUcmVlLnBsYWNlaG9sZGVyID0gY3VycmVudFNjb3BlID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NvbmZpZ3VyZVdvcmtzcGFjZVRvb2xBcHByb3ZhbHMnLCBcIkNvbmZpZ3VyZSB3b3Jrc3BhY2UgdG9vbCBhcHByb3ZhbHNcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb25maWd1cmVHbG9iYWxUb29sQXBwcm92YWxzJywgXCJDb25maWd1cmUgZ2xvYmFsIHRvb2wgYXBwcm92YWxzXCIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dXBkYXRlUGxhY2Vob2xkZXIoKTtcblxuXHRcdHF1aWNrVHJlZS5zZXRJdGVtVHJlZShidWlsZFRyZWVJdGVtcygpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1RyZWUub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKGl0ZW0gPT4ge1xuXHRcdFx0Y29uc3QgbmV3U3RhdGUgPSBpdGVtLmNoZWNrZWQgPyBjdXJyZW50U2NvcGUgOiAnbmV2ZXInO1xuXG5cdFx0XHRpZiAoaXRlbS50eXBlID09PSAnc2VydmVyJyAmJiBpdGVtLnNlcnZlcklkKSB7XG5cdFx0XHRcdC8vIFNlcnZlci1sZXZlbCBjaGVja2JveDogdXBkYXRlIGJvdGggcHJlIGFuZCBwb3N0IGJhc2VkIG9uIHNlcnZlciBjYXBhYmlsaXRpZXNcblx0XHRcdFx0Y29uc3Qgc2VydmVySW5mbyA9IHNlcnZlcnNXaXRoVG9vbHMuZ2V0KGl0ZW0uc2VydmVySWQpO1xuXHRcdFx0XHRpZiAoc2VydmVySW5mbykge1xuXHRcdFx0XHRcdHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0uc2VydmVySWQsIG5ld1N0YXRlKTtcblx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oaXRlbS5zZXJ2ZXJJZCwgbmV3U3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0udHlwZSA9PT0gJ3Rvb2wnICYmIGl0ZW0udG9vbElkKSB7XG5cdFx0XHRcdGNvbnN0IHRvb2wgPSB0b29scy5maW5kKHQgPT4gdC5pZCA9PT0gaXRlbS50b29sSWQpO1xuXHRcdFx0XHRpZiAodG9vbD8uY2FuUmVxdWVzdFBvc3RBcHByb3ZhbCB8fCBuZXdTdGF0ZSA9PT0gJ25ldmVyJykge1xuXHRcdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oaXRlbS50b29sSWQsIG5ld1N0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9vbD8uY2FuUmVxdWVzdFByZUFwcHJvdmFsIHx8IG5ld1N0YXRlID09PSAnbmV2ZXInKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0udG9vbElkLCBuZXdTdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxzbyBjbGVhciBjb21iaW5hdGlvbiBhcHByb3ZhbHMgd2hlbiB1bmNoZWNraW5nIHRoZSB0b29sXG5cdFx0XHRcdGlmIChuZXdTdGF0ZSA9PT0gJ25ldmVyJykge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlLmdldEFsbENvbmZpcm1lZCgpKSB7XG5cdFx0XHRcdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoaXRlbS50b29sSWQgKyAnOmNvbWJpbmF0aW9uOicpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oa2V5LCAnbmV2ZXInKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVpY2tUcmVlLnNldEl0ZW1UcmVlKGJ1aWxkVHJlZUl0ZW1zKCkpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICd0b29sLXByZScgJiYgaXRlbS50b29sSWQpIHtcblx0XHRcdFx0dGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0udG9vbElkLCBuZXdTdGF0ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0udHlwZSA9PT0gJ3Rvb2wtcG9zdCcgJiYgaXRlbS50b29sSWQpIHtcblx0XHRcdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihpdGVtLnRvb2xJZCwgbmV3U3RhdGUpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdzZXJ2ZXItcHJlJyAmJiBpdGVtLnNlcnZlcklkKSB7XG5cdFx0XHRcdHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0uc2VydmVySWQsIG5ld1N0YXRlKTtcblx0XHRcdFx0cXVpY2tUcmVlLnNldEl0ZW1UcmVlKGJ1aWxkVHJlZUl0ZW1zKCkpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdzZXJ2ZXItcG9zdCcgJiYgaXRlbS5zZXJ2ZXJJZCkge1xuXHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oaXRlbS5zZXJ2ZXJJZCwgbmV3U3RhdGUpO1xuXHRcdFx0XHRxdWlja1RyZWUuc2V0SXRlbVRyZWUoYnVpbGRUcmVlSXRlbXMoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0udHlwZSA9PT0gJ21hbmFnZScpIHtcblx0XHRcdFx0KGl0ZW0gYXMgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbSkub25EaWRDaGFuZ2VDaGVja2VkPy4oISFpdGVtLmNoZWNrZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdjb21iaW5hdGlvbicgJiYgaXRlbS5jb21iaW5hdGlvbktleSkge1xuXHRcdFx0XHR0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0uY29tYmluYXRpb25LZXksIG5ld1N0YXRlLCBpdGVtLmxhYmVsLCBpdGVtLmNvbWJpbmF0aW9uQXJncyk7XG5cdFx0XHRcdHF1aWNrVHJlZS5zZXRJdGVtVHJlZShidWlsZFRyZWVJdGVtcygpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tUcmVlLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oaSA9PiB7XG5cdFx0XHRpZiAoaS5pdGVtLnR5cGUgPT09ICdtYW5hZ2UnKSB7XG5cdFx0XHRcdChpLml0ZW0gYXMgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbSkub25EaWRUcmlnZ2VySXRlbUJ1dHRvbj8uKGkuYnV0dG9uKTtcblx0XHRcdH0gZWxzZSBpZiAoaS5pdGVtLnR5cGUgPT09ICdjb21iaW5hdGlvbicgJiYgaS5idXR0b24gPT09IHZpZXdBcmdzQnV0dG9uICYmIGkuaXRlbS5jb21iaW5hdGlvbkFyZ3MpIHtcblx0XHRcdFx0dGhpcy5fZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb21iaW5hdGlvbkFyZ3VtZW50cycsIFwiQXJndW1lbnRzXCIpLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCdqc29uJywgaS5pdGVtLmNvbWJpbmF0aW9uQXJncyksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tUcmVlLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmFnZUl0ZW0gPSBxdWlja1RyZWUuYWN0aXZlSXRlbXMuZmluZChpID0+IGkudHlwZSA9PT0gJ21hbmFnZScpO1xuXHRcdFx0aWYgKG1hbmFnZUl0ZW0pIHtcblx0XHRcdFx0cXVpY2tUcmVlLmhpZGUoKTtcblx0XHRcdFx0YXdhaXQgKG1hbmFnZUl0ZW0gYXMgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbSkub25EaWRPcGVuPy4oKTtcblx0XHRcdFx0dGhpcy5tYW5hZ2VDb25maXJtYXRpb25QcmVmZXJlbmNlcyh0b29scywgb3B0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWlja1RyZWUuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1RyZWUub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHRxdWlja1RyZWUuc2hvdygpO1xuXG5cdFx0Ly8gSWYgYSBmb2N1cyB0b29sIHdhcyBzcGVjaWZpZWQsIGV4cGFuZCBpdHMgcGFyZW50IGFuZCBzZXQgaXQgYXMgYWN0aXZlLlxuXHRcdC8vIE11c3QgaGFwcGVuIGFmdGVyIHNob3coKSBzaW5jZSB0aGUgdHJlZSBkYXRhIGlzIGFwcGxpZWQgdmlhIGF1dG9ydW4gb24gdmlzaWJpbGl0eS5cblx0XHRpZiAob3B0aW9ucz8uZm9jdXNUb29sSWQpIHtcblx0XHRcdGNvbnN0IGZvY3VzVG9vbElkID0gb3B0aW9ucy5mb2N1c1Rvb2xJZDtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVySXRlbSBvZiBxdWlja1RyZWUuaXRlbVRyZWUpIHtcblx0XHRcdFx0Y29uc3Qgc2VydmVySXRlbVR5cGVkID0gc2VydmVySXRlbSBhcyBJVG9vbFRyZWVJdGVtO1xuXHRcdFx0XHRpZiAoc2VydmVySXRlbVR5cGVkLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbEl0ZW0gPSAoc2VydmVySXRlbVR5cGVkLmNoaWxkcmVuIGFzIElUb29sVHJlZUl0ZW1bXSkuZmluZChjID0+IGMudHlwZSA9PT0gJ3Rvb2wnICYmIGMudG9vbElkID09PSBmb2N1c1Rvb2xJZCk7XG5cdFx0XHRcdFx0aWYgKHRvb2xJdGVtKSB7XG5cdFx0XHRcdFx0XHRxdWlja1RyZWUuZXhwYW5kKHNlcnZlckl0ZW0pO1xuXHRcdFx0XHRcdFx0cXVpY2tUcmVlLnJldmVhbCh0b29sSXRlbSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRUb29sQXV0b0NvbmZpcm1hdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnJlc2V0KCk7XG5cdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUucmVzZXQoKTtcblx0XHR0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUucmVzZXQoKTtcblx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnJlc2V0KCk7XG5cdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUucmVzZXQoKTtcblxuXHRcdC8vIFJlc2V0IGFsbCBjb250cmlidXRpb25zXG5cdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgdGhpcy5fY29udHJpYnV0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Y29udHJpYnV0aW9uLnJlc2V0Py4oKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXlELG9CQUFvQyxnQ0FBZ0M7QUFDN0gsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMEIsdUJBQXVCO0FBSWpELE1BQU0sdUJBQXVCLFNBQVMsc0JBQXNCLGtCQUFrQjtBQUM5RSxNQUFNLHFDQUFxQyxTQUFTLG1DQUFtQywwQkFBMEI7QUFlakgsTUFBTSw0QkFBNEIsV0FBVztBQUFBLEVBSzVDLFlBQ2tCLGFBQ0EsdUJBQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFKbEIsU0FBUSxlQUFlLG9CQUFJLElBQStCO0FBT3pELFNBQUssa0JBQWtCLElBQUksS0FBSyxNQUFNLEtBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLGtCQUFrQixhQUFhLFdBQVcsS0FBSyxXQUFXLENBQUMsQ0FBQztBQUMzSixTQUFLLGdCQUFnQixJQUFJLEtBQUssTUFBTSxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSxrQkFBa0IsYUFBYSxTQUFTLEtBQUssV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN4SjtBQUFBLEVBRU8sb0JBQW9CLElBQVksT0FBc0QsT0FBZ0IsTUFBcUI7QUFFakksU0FBSyxnQkFBZ0IsTUFBTSxlQUFlLElBQUksTUFBUztBQUN2RCxTQUFLLGNBQWMsTUFBTSxlQUFlLElBQUksTUFBUztBQUNyRCxTQUFLLGFBQWEsT0FBTyxFQUFFO0FBRTNCLFVBQU0sUUFBMkIsRUFBRSxXQUFXLE1BQU0sT0FB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
