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
import { sep } from "../../../../../base/common/path.js";
import { AsyncIterableProducer, DeferredPromise, raceCancellationError } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import * as resources from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../../services/extensions/common/extensionsRegistry.js";
import { ChatEditorInput } from "../widgetHosts/editor/chatEditorInput.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ChatSessionOptionsMap, ChatSessionStatus, ChatSessionsExtensions, IChatSessionsService, isSessionInProgressStatus, localChatSessionType, SessionType } from "../../common/chatSessionsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { CHAT_CATEGORY } from "../actions/chatActions.js";
import { IChatService, ResponseModelState } from "../../common/chatService/chatService.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { PromptFileVariableKind, toPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ChatViewId } from "../chat.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from "../agentSessions/agentSessions.js";
import { IAgentHostImportConversationStore } from "../agentSessions/agentHost/agentHostImportConversationStore.js";
import { BugIndicatingError, isCancellationError } from "../../../../../base/common/errors.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from "../../common/model/chatUri.js";
import { assertNever } from "../../../../../base/common/assert.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { Target } from "../../common/promptSyntax/promptTypes.js";
import { slashReg } from "../../common/requestParser/chatRequestParser.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatSessions",
  jsonSchema: {
    description: localize("chatSessionsExtPoint", "Contributes chat session integrations to the chat widget."),
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          description: localize("chatSessionsExtPoint.chatSessionType", "Unique identifier for the type of chat session."),
          type: "string"
        },
        name: {
          description: localize("chatSessionsExtPoint.name", "Name of the dynamically registered chat participant (eg: @agent). Must not contain whitespace."),
          type: "string",
          pattern: "^[\\w-]+$"
        },
        displayName: {
          description: localize("chatSessionsExtPoint.displayName", "A longer name for this item which is used for display in menus."),
          type: "string"
        },
        description: {
          description: localize("chatSessionsExtPoint.description", "Description of the chat session for use in menus and tooltips."),
          type: "string"
        },
        when: {
          description: localize("chatSessionsExtPoint.when", "Condition which must be true to show this item."),
          type: "string"
        },
        icon: {
          description: localize("chatSessionsExtPoint.icon", 'Icon identifier (codicon ID) for the chat session editor tab. For example, "{0}" or "{1}".', "$(github)", "$(cloud)"),
          anyOf: [
            {
              type: "string"
            },
            {
              type: "object",
              properties: {
                light: {
                  description: localize("icon.light", "Icon path when a light theme is used"),
                  type: "string"
                },
                dark: {
                  description: localize("icon.dark", "Icon path when a dark theme is used"),
                  type: "string"
                }
              }
            }
          ]
        },
        order: {
          description: localize("chatSessionsExtPoint.order", "Order in which this item should be displayed."),
          type: "integer"
        },
        alternativeIds: {
          description: localize("chatSessionsExtPoint.alternativeIds", "Alternative identifiers for backward compatibility."),
          type: "array",
          items: {
            type: "string"
          }
        },
        welcomeTitle: {
          description: localize("chatSessionsExtPoint.welcomeTitle", "Title text to display in the chat welcome view for this session type."),
          type: "string"
        },
        welcomeMessage: {
          description: localize("chatSessionsExtPoint.welcomeMessage", "Message text (supports markdown) to display in the chat welcome view for this session type."),
          type: "string"
        },
        welcomeTips: {
          description: localize("chatSessionsExtPoint.welcomeTips", "Tips text (supports markdown and theme icons) to display in the chat welcome view for this session type."),
          type: "string"
        },
        inputPlaceholder: {
          description: localize("chatSessionsExtPoint.inputPlaceholder", "Placeholder text to display in the chat input box for this session type."),
          type: "string"
        },
        capabilities: {
          description: localize("chatSessionsExtPoint.capabilities", "Optional capabilities for this chat session."),
          type: "object",
          additionalProperties: false,
          properties: {
            supportsFileAttachments: {
              description: localize("chatSessionsExtPoint.supportsFileAttachments", "Whether this chat session supports attaching files or file references."),
              type: "boolean"
            },
            supportsToolAttachments: {
              description: localize("chatSessionsExtPoint.supportsToolAttachments", "Whether this chat session supports attaching tools or tool references."),
              type: "boolean"
            },
            supportsMCPAttachments: {
              description: localize("chatSessionsExtPoint.supportsMCPAttachments", "Whether this chat session supports attaching MCP resources."),
              type: "boolean"
            },
            supportsImageAttachments: {
              description: localize("chatSessionsExtPoint.supportsImageAttachments", "Whether this chat session supports attaching images."),
              type: "boolean"
            },
            supportsSearchResultAttachments: {
              description: localize("chatSessionsExtPoint.supportsSearchResultAttachments", "Whether this chat session supports attaching search results."),
              type: "boolean"
            },
            supportsInstructionAttachments: {
              description: localize("chatSessionsExtPoint.supportsInstructionAttachments", "Whether this chat session supports attaching instructions."),
              type: "boolean"
            },
            supportsSourceControlAttachments: {
              description: localize("chatSessionsExtPoint.supportsSourceControlAttachments", "Whether this chat session supports attaching source control changes."),
              type: "boolean"
            },
            supportsProblemAttachments: {
              description: localize("chatSessionsExtPoint.supportsProblemAttachments", "Whether this chat session supports attaching problems."),
              type: "boolean"
            },
            supportsSymbolAttachments: {
              description: localize("chatSessionsExtPoint.supportsSymbolAttachments", "Whether this chat session supports attaching symbols."),
              type: "boolean"
            },
            supportsPromptAttachments: {
              description: localize("chatSessionsExtPoint.supportsPromptAttachments", "Whether this chat session supports attaching prompts."),
              type: "boolean"
            },
            supportsHandOffs: {
              description: localize("chatSessionsExtPoint.supportsHandOffs", "Whether this chat session supports hand-off prompts."),
              type: "boolean"
            }
          }
        },
        commands: {
          markdownDescription: localize("chatCommandsDescription", "Commands available for this chat session, which the user can invoke with a `/`."),
          type: "array",
          items: {
            additionalProperties: false,
            type: "object",
            defaultSnippets: [{ body: { name: "", description: "" } }],
            required: ["name"],
            properties: {
              name: {
                description: localize("chatCommand", "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
                type: "string"
              },
              description: {
                description: localize("chatCommandDescription", "A description of this command."),
                type: "string"
              },
              when: {
                description: localize("chatCommandWhen", "A condition which must be true to enable this command."),
                type: "string"
              }
            }
          }
        },
        canDelegate: {
          description: localize("chatSessionsExtPoint.canDelegate", "Whether delegation is supported. Default is false. Note that enabling this is experimental and may not be respected at all times."),
          type: "boolean",
          default: false
        },
        customAgentTarget: {
          description: localize("chatSessionsExtPoint.customAgentTarget", "When set, the chat session will show a filtered mode picker that prefers custom agents whose target property matches this value. Custom agents without a target property are still shown in all session types. This enables the use of standard agent/mode with contributed sessions."),
          type: "string"
        },
        requiresCustomModels: {
          description: localize("chatSessionsExtPoint.requiresCustomModels", "When set, the chat session will show a filtered model picker that prefers custom models. This enables the use of standard model picker with contributed sessions."),
          type: "boolean",
          default: false
        },
        supportsAutoModel: {
          description: localize("chatSessionsExtPoint.supportsAutoModel", 'Whether the chat session supports the synthetic "Auto" model fallback. Defaults to false. When true and no models are available, the picker shows "Auto" instead of a "No models available" state.'),
          type: "boolean",
          default: false
        },
        requiresCopilotSignIn: {
          description: localize("chatSessionsExtPoint.requiresCopilotSignIn", "Whether the chat session relies on a GitHub Copilot account and so cannot be used until the user signs in. Defaults to false."),
          type: "boolean",
          default: false
        },
        autoAttachReferences: {
          description: localize("chatSessionsExtPoint.autoAttachReferences", "Whether to automatically attach instruction files to chat requests for this session type."),
          type: "boolean",
          default: false
        },
        useRequestToPopulateBuiltInPickers: {
          description: localize("chatSessionsExtPoint.useRequestToPopulateBuiltInPickers", "Whether to use ChatRequestTurn2 to populate built-in pickers such as the Agent and Model pickers."),
          type: "boolean",
          default: false
        }
      },
      required: ["type", "name", "displayName", "description"]
    }
  },
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      yield `onChatSession:${contrib.type}`;
    }
  }
});
const codexExtensionHostAvailableWhen = ContextKeyExpr.and(
  IsSessionsWindowContext.negate(),
  ContextKeyExpr.or(
    AGENT_HOST_ENABLED_CONTEXT_KEY.negate(),
    ContextKeyExpr.not(`config.${AgentHostCodexAgentEnabledSettingId}`),
    ContextKeyExpr.not(`config.${CodexPreferAgentHostEditorSettingId}`)
  )
);
function applyCodexAgentHostPreference(contribution) {
  if (contribution.type !== SessionType.Codex) {
    return contribution;
  }
  const contributedWhen = contribution.when ? ContextKeyExpr.deserialize(contribution.when) : void 0;
  return {
    ...contribution,
    when: ContextKeyExpr.and(contributedWhen, codexExtensionHostAvailableWhen)?.serialize()
  };
}
class ContributedChatSessionData extends Disposable {
  constructor(session, chatSessionType, resource, options, onWillDispose) {
    super();
    this.session = session;
    this.chatSessionType = chatSessionType;
    this.resource = resource;
    this.options = options;
    this.onWillDispose = onWillDispose;
    this._optionsCache = new Map(options);
    this._register(this.session.onWillDispose(() => {
      this.onWillDispose(this.resource);
    }));
  }
  getOption(optionId) {
    return this._optionsCache.get(optionId);
  }
  getAllOptions() {
    return this._optionsCache.entries();
  }
  setOption(optionId, value) {
    this._optionsCache.set(optionId, value);
  }
}
let ChatSessionsService = class extends Disposable {
  constructor(_logService, _chatAgentService, _extensionService, _contextKeyService, _menuService, _themeService, _labelService, _instantiationService) {
    super();
    this._logService = _logService;
    this._chatAgentService = _chatAgentService;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this._menuService = _menuService;
    this._themeService = _themeService;
    this._labelService = _labelService;
    this._instantiationService = _instantiationService;
    this._itemControllers = /* @__PURE__ */ new Map();
    this._asyncActivationRegistry = Registry.as(ChatSessionsExtensions.AsyncActivation);
    this._contributions = /* @__PURE__ */ new Map();
    this._contributionDisposables = this._register(new DisposableMap());
    this._contentProviders = /* @__PURE__ */ new Map();
    this._alternativeIdMap = /* @__PURE__ */ new Map();
    this._contextKeys = /* @__PURE__ */ new Set();
    this._onDidChangeItemsProviders = this._register(new Emitter());
    this.onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;
    this._onDidChangeSessionItems = this._register(new Emitter());
    this.onDidChangeSessionItems = this._onDidChangeSessionItems.event;
    this._onDidCommitSession = this._register(new Emitter());
    this.onDidCommitSession = this._onDidCommitSession.event;
    this._onDidChangeAvailability = this._register(new Emitter());
    this.onDidChangeAvailability = this._onDidChangeAvailability.event;
    this._onDidChangeInProgress = this._register(new Emitter());
    this._onDidChangeContentProviderSchemes = this._register(new Emitter());
    this._onDidChangeSessionOptions = this._register(new Emitter());
    this._onDidChangeOptionGroups = this._register(new Emitter());
    this.inProgressMap = /* @__PURE__ */ new Map();
    this._sessionTypeOptions = /* @__PURE__ */ new Map();
    this._sessions = new ResourceMap();
    this._resourceAliases = new ResourceMap();
    // real resource -> untitled resource (kept for the workbench lifetime so option lookups for the real session resolve to the untitled entry)
    this._realResources = new ResourceMap();
    // untitled resource -> real resource (cleared when the session is disposed)
    this._customizationsProviders = /* @__PURE__ */ new Map();
    this._onDidChangeCustomizations = this._register(new Emitter());
    this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    this._hasCanDelegateProvidersKey = ChatContextKeys.hasCanDelegateProviders.bindTo(this._contextKeyService);
    this._register(extensionPoint.setHandler((extensions) => {
      for (const ext of extensions) {
        if (!isProposedApiEnabled(ext.description, "chatSessionsProvider")) {
          continue;
        }
        if (!Array.isArray(ext.value)) {
          continue;
        }
        for (const contribution of ext.value) {
          this._register(this.registerContribution(contribution, ext.description));
        }
      }
    }));
    this._register(Event.filter(this._contextKeyService.onDidChangeContext, (e) => e.affectsSome(this._contextKeys))(() => {
      this._evaluateAvailability();
    }));
    const builtinSessionProviders = [AgentSessionProviders.Local];
    const contributedSessionProviders = observableFromEvent(
      this.onDidChangeAvailability,
      () => Array.from(this._contributions.keys()).filter((key) => this._contributionDisposables.has(key))
    ).recomputeInitiallyAndOnChange(this._store);
    this._register(autorun((reader) => {
      const activatedProviders = contributedSessionProviders.read(reader);
      for (const provider of builtinSessionProviders) {
        reader.store.add(registerNewSessionInPlaceAction(provider, getAgentSessionProviderName(provider)));
      }
      for (const type of activatedProviders) {
        const knownProvider = getAgentSessionProvider(type);
        if (knownProvider) {
          const label = getAgentSessionProviderName(knownProvider);
          reader.store.add(registerNewSessionInPlaceAction(type, label));
        } else {
          const contrib = this._contributions.get(type);
          if (contrib) {
            reader.store.add(registerNewSessionInPlaceAction(type, contrib.contribution.displayName ?? contrib.contribution.name ?? type));
          }
        }
      }
    }));
    this._register(this._labelService.registerFormatter({
      scheme: Schemas.copilotPr,
      formatting: {
        label: "${authority}${path}",
        separator: sep,
        stripPathStartingSeparator: true
      }
    }));
  }
  get onDidChangeInProgress() {
    return this._onDidChangeInProgress.event;
  }
  get onDidChangeContentProviderSchemes() {
    return this._onDidChangeContentProviderSchemes.event;
  }
  get onDidChangeSessionOptions() {
    return this._onDidChangeSessionOptions.event;
  }
  get onDidChangeOptionGroups() {
    return this._onDidChangeOptionGroups.event;
  }
  reportInProgress(chatSessionType, count) {
    if (!this._itemControllers.has(chatSessionType)) {
      this._logService.warn(`Attempted to report in-progress status for unknown chat session type '${chatSessionType}'`);
    }
    this.inProgressMap.set(chatSessionType, count);
    this._onDidChangeInProgress.fire();
  }
  getInProgress() {
    return Array.from(this.inProgressMap.entries()).map(([chatSessionType, count]) => ({ chatSessionType, count }));
  }
  async resolveChatSessionItem(chatSessionType, resource, token) {
    const entry = this._itemControllers.get(chatSessionType);
    if (!entry?.controller.resolveChatSessionItem) {
      return void 0;
    }
    return entry.controller.resolveChatSessionItem(resource, token);
  }
  canSetChatSessionItemArchived(sessionResource) {
    return typeof this._getChatSessionItemController(sessionResource)?.controller.setChatSessionItemArchived === "function";
  }
  setChatSessionItemArchived(sessionResource, archived) {
    const controller = this._getChatSessionItemController(sessionResource)?.controller;
    if (!controller?.setChatSessionItemArchived) {
      throw new Error(`Session ${sessionResource.toString()} does not support archiving`);
    }
    controller.setChatSessionItemArchived(sessionResource, archived);
  }
  canSetChatSessionItemRead(sessionResource) {
    return typeof this._getChatSessionItemController(sessionResource)?.controller.setChatSessionItemRead === "function";
  }
  setChatSessionItemRead(sessionResource, isRead) {
    const controller = this._getChatSessionItemController(sessionResource)?.controller;
    if (!controller?.setChatSessionItemRead) {
      throw new Error(`Session ${sessionResource.toString()} does not own read state`);
    }
    controller.setChatSessionItemRead(sessionResource, isRead);
  }
  async updateInProgressStatus(chatSessionType) {
    try {
      const items = [];
      for await (const result of this.getChatSessionItems([chatSessionType], CancellationToken.None)) {
        items.push(...result.items);
      }
      const inProgress = items.filter((item) => !item.archived && item.status && isSessionInProgressStatus(item.status));
      this.reportInProgress(chatSessionType, inProgress.length);
    } catch (error) {
      this._logService.warn(`Failed to update in-progress status for chat session type '${chatSessionType}':`, error);
    }
  }
  registerContribution(contribution, ext) {
    contribution = applyCodexAgentHostPreference(contribution);
    this._logService.trace(`[ChatSessionsService] registerContribution called for type='${contribution.type}', canDelegate=${contribution.canDelegate}, when='${contribution.when}', extension='${ext.identifier.value}'`);
    if (this._contributions.has(contribution.type)) {
      this._logService.trace(`[ChatSessionsService] registerContribution: type='${contribution.type}' already registered, skipping`);
      return Disposable.None;
    }
    if (contribution.when) {
      const whenExpr = ContextKeyExpr.deserialize(contribution.when);
      if (whenExpr) {
        for (const key of whenExpr.keys()) {
          this._contextKeys.add(key);
        }
      }
    }
    this._contributions.set(contribution.type, { contribution, extension: ext });
    if (contribution.alternativeIds) {
      for (const altId of contribution.alternativeIds) {
        if (this._alternativeIdMap.has(altId)) {
          this._logService.warn(`Alternative ID '${altId}' is already mapped to '${this._alternativeIdMap.get(altId)}'. Remapping to '${contribution.type}'.`);
        }
        this._alternativeIdMap.set(altId, contribution.type);
      }
    }
    this._evaluateAvailability();
    return {
      dispose: () => {
        this._contributions.delete(contribution.type);
        if (contribution.alternativeIds) {
          for (const altId of contribution.alternativeIds) {
            if (this._alternativeIdMap.get(altId) === contribution.type) {
              this._alternativeIdMap.delete(altId);
            }
          }
        }
        this._contributionDisposables.deleteAndDispose(contribution.type);
        this._updateHasCanDelegateProvidersContextKey();
      }
    };
  }
  _isContributionAvailable(contribution) {
    if (!contribution.when) {
      return true;
    }
    const whenExpr = ContextKeyExpr.deserialize(contribution.when);
    return !whenExpr || this._contextKeyService.contextMatchesRules(whenExpr);
  }
  /**
   * Type-keyed companion to {@link _isContributionAvailable}. Resolves the
   * session type (including alternative ids) to its contribution and reports
   * whether that contribution is currently enabled by its `when` clause.
   *
   * Session types with no contribution entry (e.g. the built-in `local`
   * provider, or item controllers registered without a matching contribution)
   * are treated as available, since there is no `when` clause gating them.
   */
  _isContributionAvailableForType(sessionType) {
    const primaryType = this._contributions.has(sessionType) ? sessionType : this._alternativeIdMap.get(sessionType);
    const contribution = primaryType ? this._contributions.get(primaryType)?.contribution : void 0;
    return !contribution || this._isContributionAvailable(contribution);
  }
  /**
   * Resolves a session type to its primary type, checking for alternative IDs.
   * @param sessionType The session type or alternative ID to resolve
   * @returns The primary session type, or undefined if not found or not available
   */
  _resolveToPrimaryType(sessionType) {
    const contribution = this._contributions.get(sessionType)?.contribution;
    if (contribution) {
      if (this._isContributionAvailable(contribution)) {
        return sessionType;
      }
    }
    const primaryType = this._alternativeIdMap.get(sessionType);
    if (primaryType) {
      const altContribution = this._contributions.get(primaryType)?.contribution;
      if (altContribution && this._isContributionAvailable(altContribution)) {
        return primaryType;
      }
    }
    return void 0;
  }
  _registerMenuItems(contribution, extensionDescription) {
    const disposables = new DisposableStore();
    if (!contribution.canDelegate) {
      disposables.add(registerNewSessionExternalAction(
        contribution.type,
        contribution.displayName,
        () => this._resolveCreateSubMenuCommandId(contribution.type)
      ));
    }
    const contextKeyService = this._contextKeyService.createOverlay([
      ["chatSessionType", contribution.type]
    ]);
    const rawMenuActions = this._menuService.getMenuActions(MenuId.AgentSessionsCreateSubMenu, contextKeyService);
    const menuActions = rawMenuActions.map((value) => value[1]).flat();
    const menuItemActions = menuActions.filter((action) => action instanceof MenuItemAction);
    const actionsToMirror = contribution.canDelegate ? menuItemActions : menuItemActions.slice(1);
    for (const action of actionsToMirror) {
      disposables.add(MenuRegistry.appendMenuItem(MenuId.ChatNewMenu, {
        command: action.item,
        group: "4_externally_contributed"
      }));
    }
    return {
      dispose: () => disposables.dispose()
    };
  }
  /**
   * Resolves the command id of the primary create action contributed to
   * {@link MenuId.AgentSessionsCreateSubMenu} for the given session type, or
   * `undefined` when no such action is contributed (yet). Read at execution
   * time so it is unaffected by the ordering of extension menu registration.
   */
  _resolveCreateSubMenuCommandId(type) {
    const contextKeyService = this._contextKeyService.createOverlay([
      ["chatSessionType", type]
    ]);
    const rawMenuActions = this._menuService.getMenuActions(MenuId.AgentSessionsCreateSubMenu, contextKeyService);
    const menuActions = rawMenuActions.map((value) => value[1]).flat();
    for (const action of menuActions) {
      if (action instanceof MenuItemAction) {
        return action.item.id;
      }
    }
    return void 0;
  }
  _registerCommands(contribution) {
    const isAvailableInSessionTypePicker = isAgentSessionProviderType(contribution.type);
    return combinedDisposable(
      registerAction2(class OpenChatSessionAction extends Action2 {
        constructor() {
          super({
            id: `workbench.action.chat.openSessionWithPrompt.${contribution.type}`,
            title: localize2("interactiveSession.openSessionWithPrompt", "New {0} with Prompt", contribution.displayName),
            category: CHAT_CATEGORY,
            icon: Codicon.plus,
            f1: false,
            precondition: ChatContextKeys.enabled
          });
        }
        async run(accessor, chatOptions) {
          const chatService = accessor.get(IChatService);
          const customizationHarnessService = accessor.get(ICustomizationHarnessService);
          const toolsService = accessor.get(ILanguageModelToolsService);
          const { type } = contribution;
          if (chatOptions) {
            let attachedContext = chatOptions.attachedContext;
            const sessionResource = URI.revive(chatOptions.resource);
            const ref = await chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatSessionsContribution#sendPrompt");
            try {
              const promptFile = await resolvePromptSlashCommand(chatOptions.prompt, sessionResource, customizationHarnessService, toolsService);
              if (promptFile) {
                attachedContext = [promptFile, ...attachedContext ?? []];
              }
              const result = await chatService.sendRequest(sessionResource, chatOptions.prompt, { agentIdSilent: type, attachedContext });
              if (result.kind === "queued") {
                await result.deferred;
              } else if (result.kind === "sent") {
                await result.data.responseCompletePromise;
              }
            } finally {
              ref?.dispose();
            }
          }
        }
      }),
      // Creates a chat editor
      registerAction2(class OpenNewChatSessionEditorAction extends Action2 {
        constructor() {
          super({
            id: `workbench.action.chat.openNewSessionEditor.${contribution.type}`,
            title: localize2("interactiveSession.openNewSessionEditor", "New {0} Session", contribution.displayName),
            category: CHAT_CATEGORY,
            icon: Codicon.plus,
            f1: true,
            precondition: ChatContextKeys.enabled
          });
        }
        async run(accessor, chatOptions) {
          const { type, displayName } = contribution;
          await openChatSession(accessor, { type, displayName, position: "editor" /* Editor */ }, chatOptions);
        }
      }),
      // New chat in sidebar chat (+ button)
      registerAction2(class OpenNewChatSessionSidebarAction extends Action2 {
        constructor() {
          super({
            id: `workbench.action.chat.openNewSessionSidebar.${contribution.type}`,
            title: localize2("interactiveSession.openNewSessionSidebar", "New {0} Session", contribution.displayName),
            category: CHAT_CATEGORY,
            icon: Codicon.plus,
            f1: false,
            // Hide from Command Palette
            precondition: ChatContextKeys.enabled,
            menu: !isAvailableInSessionTypePicker ? {
              id: MenuId.ChatNewMenu,
              group: "3_new_special"
            } : void 0
          });
        }
        async run(accessor, chatOptions) {
          const { type, displayName } = contribution;
          await openChatSession(accessor, { type, displayName, position: "sidebar" /* Sidebar */ }, chatOptions);
        }
      })
    );
  }
  _evaluateAvailability() {
    const newlyEnabledChatSessionTypes = /* @__PURE__ */ new Set();
    const newlyDisabledChatSessionTypes = /* @__PURE__ */ new Set();
    const disposedChatSessions = new ResourceSet();
    for (const { contribution, extension } of this._contributions.values()) {
      const isCurrentlyRegistered = this._contributionDisposables.has(contribution.type);
      const shouldBeRegistered = this._isContributionAvailable(contribution);
      this._logService.trace(`[ChatSessionsService] _evaluateAvailability: type='${contribution.type}', isCurrentlyRegistered=${isCurrentlyRegistered}, shouldBeRegistered=${shouldBeRegistered}, when='${contribution.when}'`);
      if (isCurrentlyRegistered && !shouldBeRegistered) {
        this._contributionDisposables.deleteAndDispose(contribution.type);
        for (const sessionResource of this._disposeSessionsForContribution(contribution.type)) {
          disposedChatSessions.add(sessionResource);
        }
        newlyDisabledChatSessionTypes.add(contribution.type);
      } else if (!isCurrentlyRegistered && shouldBeRegistered) {
        if (extension) {
          this._enableContribution(contribution, extension);
        }
        newlyEnabledChatSessionTypes.add(contribution.type);
      }
    }
    if (newlyEnabledChatSessionTypes.size > 0 || newlyDisabledChatSessionTypes.size > 0) {
      this._onDidChangeAvailability.fire();
      for (const chatSessionType of [...newlyEnabledChatSessionTypes, ...newlyDisabledChatSessionTypes]) {
        this._onDidChangeItemsProviders.fire({ chatSessionType });
      }
      if (disposedChatSessions.size > 0) {
        this._onDidChangeSessionItems.fire({ removed: Array.from(disposedChatSessions) });
      }
    }
    this._updateHasCanDelegateProvidersContextKey();
  }
  _enableContribution(contribution, ext) {
    this._logService.trace(`[ChatSessionsService] _enableContribution: type='${contribution.type}', canDelegate=${contribution.canDelegate}`);
    const disposableStore = new DisposableStore();
    this._contributionDisposables.set(contribution.type, disposableStore);
    if (contribution.canDelegate) {
      disposableStore.add(this._registerAgent(contribution, ext));
      disposableStore.add(this._registerCommands(contribution));
    }
    disposableStore.add(this._registerMenuItems(contribution, ext));
  }
  /**
   * Disposes of all sessions that belong to a contribution
   *
   * @returns List of session resources that were disposed.
   */
  _disposeSessionsForContribution(contributionId) {
    const sessionsToDispose = [];
    for (const [sessionResource, sessionData] of this._sessions) {
      if (sessionData.chatSessionType === contributionId) {
        sessionsToDispose.push(sessionResource);
      }
    }
    if (sessionsToDispose.length > 0) {
      this._logService.info(`Disposing ${sessionsToDispose.length} cached sessions for contribution '${contributionId}' due to when clause change`);
    }
    for (const sessionKey of sessionsToDispose) {
      const sessionData = this._sessions.get(sessionKey);
      if (sessionData) {
        sessionData.dispose();
      }
    }
    return sessionsToDispose;
  }
  _registerAgent(contribution, ext) {
    const storedIcon = this.getContributionIcon(ext, contribution);
    const icons = ThemeIcon.isThemeIcon(storedIcon) ? { themeIcon: storedIcon, icon: void 0, iconDark: void 0 } : storedIcon ? { icon: storedIcon.light, iconDark: storedIcon.dark } : { themeIcon: Codicon.sendToRemoteAgent };
    const id = contribution.type;
    const agentData = {
      id,
      name: contribution.name,
      fullName: contribution.displayName,
      description: contribution.description,
      isDefault: false,
      isCore: false,
      isDynamic: true,
      slashCommands: contribution.commands ?? [],
      locations: [ChatAgentLocation.Chat],
      modes: [ChatModeKind.Agent, ChatModeKind.Ask],
      disambiguation: [],
      metadata: {
        ...icons
      },
      capabilities: contribution.capabilities,
      canAccessPreviousChatHistory: true,
      extensionId: ext.identifier,
      extensionVersion: ext.version,
      extensionDisplayName: ext.displayName || ext.name,
      extensionPublisherId: ext.publisher
    };
    return this._chatAgentService.registerAgent(id, agentData);
  }
  getAllChatSessionContributions() {
    return Array.from(this._contributions.values()).filter((entry) => this._isContributionAvailable(entry.contribution)).map((entry) => this.resolveChatSessionContribution(entry.extension, entry.contribution));
  }
  _updateHasCanDelegateProvidersContextKey() {
    const hasCanDelegate = this.getAllChatSessionContributions().filter((c) => c.canDelegate);
    const canDelegateEnabled = hasCanDelegate.length > 0;
    this._logService.trace(`[ChatSessionsService] hasCanDelegateProvidersAvailable=${canDelegateEnabled} (${hasCanDelegate.map((c) => c.type).join(", ")})`);
    this._hasCanDelegateProvidersKey.set(canDelegateEnabled);
  }
  getChatSessionContribution(chatSessionType) {
    const entry = this._contributions.get(chatSessionType);
    if (!entry) {
      return void 0;
    }
    if (!this._isContributionAvailable(entry.contribution)) {
      return void 0;
    }
    return this.resolveChatSessionContribution(entry.extension, entry.contribution);
  }
  resolveChatSessionContribution(ext, contribution) {
    return {
      ...contribution,
      icon: this.resolveIconForCurrentColorTheme(this.getContributionIcon(ext, contribution))
    };
  }
  getContributionIcon(ext, contribution) {
    if (!contribution.icon) {
      return void 0;
    }
    if (typeof contribution.icon === "string") {
      return contribution.icon.startsWith("$(") && contribution.icon.endsWith(")") ? ThemeIcon.fromString(contribution.icon) : ThemeIcon.fromId(contribution.icon);
    }
    return {
      dark: ext ? resources.joinPath(ext.extensionLocation, contribution.icon.dark) : URI.parse(contribution.icon.dark),
      light: ext ? resources.joinPath(ext.extensionLocation, contribution.icon.light) : URI.parse(contribution.icon.light)
    };
  }
  resolveIconForCurrentColorTheme(rawIcon) {
    if (!rawIcon) {
      return void 0;
    }
    if (ThemeIcon.isThemeIcon(rawIcon)) {
      return rawIcon;
    } else if (isDark(this._themeService.getColorTheme().type)) {
      return rawIcon.dark;
    } else {
      return rawIcon.light;
    }
  }
  registerChatSessionContribution(contribution) {
    if (this._contributions.has(contribution.type)) {
      return { dispose: () => {
      } };
    }
    this._contributions.set(contribution.type, { contribution, extension: void 0 });
    if (contribution.alternativeIds) {
      for (const alternativeId of contribution.alternativeIds) {
        this._alternativeIdMap.set(alternativeId, contribution.type);
      }
    }
    const disposables = new DisposableStore();
    this._contributionDisposables.set(contribution.type, disposables);
    if (contribution.onDidChangeRequiresCopilotSignIn) {
      disposables.add(contribution.onDidChangeRequiresCopilotSignIn(() => this._onDidChangeAvailability.fire()));
    }
    this._updateHasCanDelegateProvidersContextKey();
    this._onDidChangeAvailability.fire();
    return toDisposable(() => {
      this._contributions.delete(contribution.type);
      if (contribution.alternativeIds) {
        for (const alternativeId of contribution.alternativeIds) {
          if (this._alternativeIdMap.get(alternativeId) === contribution.type) {
            this._alternativeIdMap.delete(alternativeId);
          }
        }
      }
      this._contributionDisposables.deleteAndDispose(contribution.type);
      this._updateHasCanDelegateProvidersContextKey();
      this._onDidChangeAvailability.fire();
    });
  }
  async activateChatSessionItemProvider(chatViewType) {
    await this.doActivateChatSessionItemController(chatViewType);
  }
  async doActivateChatSessionItemController(chatViewType) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const resolvedType = this._resolveToPrimaryType(chatViewType);
    if (resolvedType) {
      chatViewType = resolvedType;
    }
    if (!this._isContributionAvailableForType(chatViewType)) {
      return false;
    }
    if (this._itemControllers.has(chatViewType)) {
      return true;
    }
    await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);
    const controller = this._itemControllers.get(chatViewType);
    return !!controller;
  }
  async canResolveChatSession(sessionType) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    if (!this._isContributionAvailableForType(sessionType)) {
      return false;
    }
    if (this._contentProviders.has(sessionType)) {
      return true;
    }
    const asyncActivators = this._asyncActivationRegistry.getActivators(sessionType);
    if (asyncActivators.length) {
      for (const activator of asyncActivators) {
        if (await this._instantiationService.invokeFunction((accessor) => activator.waitForActivation(accessor, sessionType))) {
          await this.waitForContentProvider(sessionType);
          if (this._contentProviders.has(sessionType)) {
            return true;
          }
        }
      }
      return false;
    }
    await this._extensionService.activateByEvent(`onChatSession:${sessionType}`);
    return this._contentProviders.has(sessionType);
  }
  async waitForContentProvider(sessionType) {
    if (this._contentProviders.has(sessionType)) {
      return;
    }
    await Event.toPromise(Event.filter(this.onDidChangeContentProviderSchemes, (e) => e.added.includes(sessionType)));
  }
  async provideChatInputCompletions(sessionResource, params, token) {
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    const provider = this._contentProviders.get(resolvedType);
    if (!provider?.provideChatInputCompletions) {
      return void 0;
    }
    return provider.provideChatInputCompletions(sessionResource, params, token);
  }
  resolveChatResponseUri(sessionResource, href, kind) {
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    return this._contentProviders.get(resolvedType)?.resolveChatResponseUri?.(sessionResource, href, kind) ?? href;
  }
  async getChatInputCompletionTriggerCharacters(sessionType) {
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    const provider = this._contentProviders.get(resolvedType);
    if (!provider) {
      return void 0;
    }
    if (!provider.provideChatInputCompletionTriggerCharacters) {
      return [];
    }
    return provider.provideChatInputCompletionTriggerCharacters();
  }
  async tryActivateControllers(providersToResolve) {
    await Promise.all(this.getAllChatSessionContributions().map(async (contrib) => {
      if (providersToResolve && !providersToResolve.includes(contrib.type)) {
        return;
      }
      if (!await this.doActivateChatSessionItemController(contrib.type)) {
        if (providersToResolve?.includes(contrib.type)) {
          this._logService.trace(`[ChatSessionsService] No enabled provider found for chat session type ${contrib.type}`);
        }
      }
    }));
  }
  getChatSessionItems(providersToResolve, token) {
    return new AsyncIterableProducer(async (writer) => {
      await raceCancellationError(this.tryActivateControllers(providersToResolve), token);
      await Promise.all(Array.from(this._itemControllers, async ([chatSessionType, controllerEntry]) => {
        const resolvedType = this._resolveToPrimaryType(chatSessionType) ?? chatSessionType;
        if (providersToResolve && !providersToResolve.includes(resolvedType)) {
          return;
        }
        if (!this._isContributionAvailableForType(chatSessionType)) {
          return;
        }
        try {
          await raceCancellationError(controllerEntry.initialRefresh, token);
          const providerSessions = controllerEntry.controller.items;
          this._logService.trace(`[ChatSessionsService] Resolved ${providerSessions.length} sessions for provider ${resolvedType}`);
          writer.emitOne({ chatSessionType: resolvedType, items: providerSessions });
        } catch (err) {
          if (!isCancellationError(err)) {
            this._logService.error(`[ChatSessionsService] Failed to resolve sessions for provider ${resolvedType}`, err);
          }
        }
      }));
    });
  }
  async refreshChatSessionItems(providersToResolve, token) {
    await this.tryActivateControllers(providersToResolve);
    await Promise.all(Array.from(this._itemControllers).map(async ([chatSessionType, controllerEntry]) => {
      const resolvedType = this._resolveToPrimaryType(chatSessionType) ?? chatSessionType;
      if (providersToResolve && !providersToResolve.includes(resolvedType)) {
        return;
      }
      try {
        await controllerEntry.controller.refresh(token);
      } catch (err) {
        if (!isCancellationError(err)) {
          this._logService.error(`[ChatSessionsService] Failed to resolve sessions for provider ${resolvedType}`, err);
        }
      }
    }));
  }
  getRegisteredChatSessionItemProviders() {
    return [...new Set(Array.from(this._itemControllers.keys()).map((key) => this._resolveToPrimaryType(key) ?? key))];
  }
  registerChatSessionItemController(chatSessionType, controller) {
    const disposables = new DisposableStore();
    const initialRefreshCts = disposables.add(new CancellationTokenSource());
    this._itemControllers.set(chatSessionType, { controller, initialRefresh: controller.refresh(initialRefreshCts.token) });
    this._onDidChangeItemsProviders.fire({ chatSessionType });
    disposables.add(controller.onDidChangeChatSessionItems((e) => {
      this._onDidChangeSessionItems.fire(e);
      this.updateInProgressStatus(chatSessionType);
    }));
    return {
      dispose: () => {
        initialRefreshCts.cancel();
        disposables.dispose();
        const controller2 = this._itemControllers.get(chatSessionType);
        if (controller2) {
          this._itemControllers.delete(chatSessionType);
          this._onDidChangeItemsProviders.fire({ chatSessionType });
        }
        this.updateInProgressStatus(chatSessionType);
      }
    };
  }
  registerChatSessionContentProvider(chatSessionType, provider) {
    if (this._contentProviders.has(chatSessionType)) {
      throw new Error(`Content provider for ${chatSessionType} is already registered.`);
    }
    this._contentProviders.set(chatSessionType, provider);
    this._onDidChangeContentProviderSchemes.fire({ added: [chatSessionType], removed: [] });
    return {
      dispose: () => {
        this._contentProviders.delete(chatSessionType);
        this._onDidChangeContentProviderSchemes.fire({ added: [], removed: [chatSessionType] });
        for (const [key, session] of this._sessions) {
          if (session.chatSessionType === chatSessionType) {
            session.dispose();
            this._sessions.delete(key);
          }
        }
      }
    };
  }
  registerCustomizationsProvider(chatSessionType, provider) {
    this._customizationsProviders.set(chatSessionType, provider);
    const onChangeDisposable = provider.onDidChangeCustomizations(() => {
      this._onDidChangeCustomizations.fire({ chatSessionType });
    });
    return toDisposable(() => {
      onChangeDisposable.dispose();
      if (this._customizationsProviders.get(chatSessionType) === provider) {
        this._customizationsProviders.delete(chatSessionType);
      }
    });
  }
  hasCustomizationsProvider(chatSessionType) {
    return this._customizationsProviders.has(chatSessionType);
  }
  async getCustomizations(chatSessionType, token) {
    const provider = this._customizationsProviders.get(chatSessionType);
    if (!provider) {
      return void 0;
    }
    return provider.provideCustomizations(token);
  }
  async createNewChatSessionItem(chatSessionType, request, token) {
    const controllerData = this._itemControllers.get(chatSessionType);
    if (!controllerData) {
      return void 0;
    }
    await controllerData.initialRefresh;
    return controllerData.controller.newChatSessionItem?.(request, token);
  }
  async deleteChatSessionItem(sessionResource, token) {
    const controllerData = this._getChatSessionItemController(sessionResource);
    if (!controllerData?.controller.deleteChatSessionItem) {
      throw new Error(`Session ${sessionResource.toString()} does not support deletion`);
    }
    await controllerData.initialRefresh;
    return controllerData.controller.deleteChatSessionItem(sessionResource, token);
  }
  _getChatSessionItemController(sessionResource) {
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) ?? sessionType;
    return this._itemControllers.get(resolvedType);
  }
  async getOrCreateChatSession(sessionResource, token) {
    {
      const existingSessionData = this._sessions.get(sessionResource);
      if (existingSessionData) {
        return existingSessionData.session;
      }
    }
    const sessionType = getChatSessionType(sessionResource);
    if (!await raceCancellationError(this.canResolveChatSession(sessionType), token)) {
      throw Error(`Cannot find provider '${sessionType}'`);
    }
    {
      const existingSessionData = this._sessions.get(sessionResource);
      if (existingSessionData) {
        return existingSessionData.session;
      }
    }
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    const provider = this._contentProviders.get(resolvedType);
    if (!provider) {
      throw Error(`Cannot find provider '${resolvedType}'`);
    }
    let session;
    const newSessionOptionGroups = isUntitledChatSession(sessionResource) ? await this.getNewChatSessionInputState(resolvedType, sessionResource) : void 0;
    if (isUntitledChatSession(sessionResource) && (newSessionOptionGroups || resolvedType.startsWith("agent-host-"))) {
      const options = /* @__PURE__ */ new Map();
      for (const group of newSessionOptionGroups ?? []) {
        const selected = group.selected ?? group.items.find((item) => item.default) ?? group.items[0];
        if (selected) {
          options.set(group.id, selected);
        }
      }
      session = {
        sessionResource,
        onWillDispose: Event.None,
        history: [],
        options: options.size > 0 ? options : void 0,
        dispose: () => {
        }
      };
    } else {
      session = await raceCancellationError(provider.provideChatSessionContent(sessionResource, token), token);
    }
    if (session.options) {
      for (const [optionId, value] of session.options) {
        this.setSessionOption(sessionResource, optionId, value);
      }
    }
    {
      const existingSessionData = this._sessions.get(sessionResource);
      if (existingSessionData) {
        return existingSessionData.session;
      }
    }
    const sessionData = new ContributedChatSessionData(session, sessionType, sessionResource, session.options, (resource) => {
      sessionData.dispose();
      this._sessions.delete(resource);
    });
    this._sessions.set(sessionResource, sessionData);
    if (session.options) {
      this._onDidChangeSessionOptions.fire({ sessionResource, updates: session.options });
    }
    return session;
  }
  async getChatSessionHistory(sessionResource, token) {
    const existing = this._sessions.get(this._resolveResource(sessionResource));
    if (existing) {
      return [...existing.session.history];
    }
    if (isUntitledChatSession(sessionResource)) {
      return [];
    }
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    if (!await raceCancellationError(this.canResolveChatSession(resolvedType), token)) {
      throw Error(`Cannot find provider '${resolvedType}'`);
    }
    const provider = this._contentProviders.get(resolvedType);
    if (!provider) {
      throw Error(`Cannot find provider '${resolvedType}'`);
    }
    const session = await raceCancellationError(provider.provideChatSessionContent(sessionResource, token), token);
    try {
      return [...session.history];
    } finally {
      session.dispose();
    }
  }
  hasAnySessionOptions(sessionResource) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    return !!session && !!session.options && session.options.size > 0;
  }
  getSessionOptions(sessionResource) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    if (!session) {
      return void 0;
    }
    const result = /* @__PURE__ */ new Map();
    for (const [key, value] of session.getAllOptions()) {
      result.set(key, typeof value === "string" ? value : value.id);
    }
    return result.size > 0 ? result : void 0;
  }
  getSessionOption(sessionResource, optionId) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    return session?.getOption(optionId);
  }
  setSessionOption(sessionResource, optionId, value) {
    return this.updateSessionOptions(sessionResource, /* @__PURE__ */ new Map([[optionId, value]]));
  }
  updateSessionOptions(sessionResource, updates) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    if (!session) {
      return false;
    }
    let didChange = false;
    for (const [optionId, value] of updates) {
      const existingValue = session.getOption(optionId);
      if (existingValue !== value) {
        session.setOption(optionId, value);
        didChange = true;
      }
    }
    if (didChange) {
      this._onDidChangeSessionOptions.fire({ sessionResource, updates });
    }
    return didChange;
  }
  /**
   * Resolve a resource through the alias map. If the resource is a real
   * resource that has been aliased to an untitled resource, return the
   * untitled resource (the canonical key in {@link _sessions}).
   */
  _resolveResource(resource) {
    return this._resourceAliases.get(resource) ?? resource;
  }
  registerSessionResourceAlias(untitledResource, realResource) {
    this._resourceAliases.set(realResource, untitledResource);
  }
  setMaterializedSessionResource(untitledResource, realResource) {
    this._realResources.set(untitledResource, realResource);
  }
  getMaterializedSessionResource(untitledResource) {
    return this._realResources.get(untitledResource);
  }
  clearMaterializedSessionResource(sessionResource) {
    this._realResources.delete(sessionResource);
    const untitled = this._resourceAliases.get(sessionResource);
    if (untitled) {
      this._realResources.delete(untitled);
    }
  }
  fireSessionCommitted(original, committed) {
    this._onDidCommitSession.fire({ original, committed });
  }
  /**
   * Store option groups for a session type
   */
  setOptionGroupsForSessionType(chatSessionType, handle, optionGroups) {
    if (optionGroups) {
      this._sessionTypeOptions.set(chatSessionType, optionGroups);
    } else {
      this._sessionTypeOptions.delete(chatSessionType);
    }
    this._onDidChangeOptionGroups.fire(chatSessionType);
  }
  /**
   * Get available option groups for a session type
   */
  getOptionGroupsForSessionType(chatSessionType) {
    return this._sessionTypeOptions.get(chatSessionType);
  }
  async getNewChatSessionInputState(chatSessionType, sessionResource) {
    const controllerData = this._itemControllers.get(chatSessionType);
    if (controllerData?.controller.getNewChatSessionInputState) {
      const groups2 = await controllerData.controller.getNewChatSessionInputState(sessionResource, CancellationToken.None);
      if (groups2?.length) {
        this._sessionTypeOptions.set(chatSessionType, [...groups2]);
        this._onDidChangeOptionGroups.fire(chatSessionType);
      }
      return groups2;
    }
    const groups = this._sessionTypeOptions.get(chatSessionType);
    if (!groups?.length) {
      return void 0;
    }
    return groups;
  }
  /**
   * Get the capabilities for a specific session type
   */
  getCapabilitiesForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return contribution?.capabilities;
  }
  /**
   * Get the customAgentTarget for a specific session type.
   * When set, the mode picker should show filtered custom agents matching this target.
   */
  getCustomAgentTargetForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return contribution?.customAgentTarget ?? Target.Undefined;
  }
  requiresCustomModelsForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return !!contribution?.requiresCustomModels;
  }
  supportsAutoModelForSessionType(chatSessionType) {
    if (chatSessionType === localChatSessionType) {
      return true;
    }
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return !!contribution?.supportsAutoModel;
  }
  supportsDelegationForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return contribution?.supportsDelegation !== false;
  }
  requiresCopilotSignInForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    if (!contribution) {
      return false;
    }
    const requires = contribution.requiresCopilotSignIn;
    return typeof requires === "function" ? requires() : !!requires;
  }
  sessionSupportsFork(sessionResource) {
    const session = this._sessions.get(sessionResource) ?? this._sessions.get(this._resolveResource(sessionResource));
    return !!session?.session.forkSession;
  }
  async forkChatSession(sessionResource, request, token) {
    const session = this._sessions.get(sessionResource) ?? this._sessions.get(this._resolveResource(sessionResource));
    if (!session?.session.forkSession) {
      throw new Error(`Session ${sessionResource.toString()} does not support forking`);
    }
    return session.session.forkSession(request, token);
  }
  sessionSupportsRename(sessionResource) {
    const session = this._sessions.get(sessionResource) ?? this._sessions.get(this._resolveResource(sessionResource));
    return !!session?.session.renameSession;
  }
  async renameChatSession(sessionResource, title, token) {
    const session = await this.getOrCreateChatSession(sessionResource, token);
    if (!session.renameSession) {
      throw new Error(`Session ${sessionResource.toString()} does not support renaming`);
    }
    return session.renameSession(title, token);
  }
  getContentProviderSchemes() {
    return Array.from(this._contentProviders.keys());
  }
};
ChatSessionsService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IInstantiationService)
], ChatSessionsService);
registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);
function registerNewSessionInPlaceAction(type, displayName) {
  return registerAction2(class NewChatSessionInPlaceAction extends Action2 {
    constructor() {
      super({
        id: `workbench.action.chat.openNewChatSessionInPlace.${type}`,
        title: localize2("interactiveSession.openNewChatSessionInPlace", "New {0} Session", displayName),
        category: CHAT_CATEGORY,
        f1: false,
        precondition: ChatContextKeys.enabled
      });
    }
    // Expected args: [chatSessionPosition: 'sidebar' | 'editor']
    async run(accessor, ...args) {
      if (args.length === 0) {
        throw new BugIndicatingError("Expected chat session position argument");
      }
      const chatSessionPosition = args[0];
      if (chatSessionPosition !== "sidebar" /* Sidebar */ && chatSessionPosition !== "editor" /* Editor */) {
        throw new BugIndicatingError(`Invalid chat session position argument: ${chatSessionPosition}`);
      }
      const activeEditor = accessor.get(IEditorGroupsService).activeGroup.activeEditor;
      const replaceEditorForResource = activeEditor instanceof ChatEditorInput ? activeEditor.sessionResource : void 0;
      await openChatSession(accessor, { type, displayName: localize("chat", "Chat"), position: chatSessionPosition, replaceEditorForResource });
    }
  });
}
function registerNewSessionExternalAction(type, displayName, resolveCommandId) {
  return registerAction2(class NewChatSessionExternalAction extends Action2 {
    constructor() {
      super({
        id: `workbench.action.chat.openNewChatSessionExternal.${type}`,
        title: localize2("interactiveSession.openNewChatSessionExternal", "New {0} Session", displayName),
        category: CHAT_CATEGORY,
        f1: false,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      const logService = accessor.get(ILogService);
      const commandId = resolveCommandId();
      if (!commandId) {
        logService.warn(`[ChatSessionsService] No create command contributed to '${MenuId.AgentSessionsCreateSubMenu.id}' for chat session type '${type}'; cannot open a new session.`);
        return;
      }
      await commandService.executeCommand(commandId);
    }
  });
}
var ChatSessionPosition = /* @__PURE__ */ ((ChatSessionPosition2) => {
  ChatSessionPosition2["Editor"] = "editor";
  ChatSessionPosition2["Sidebar"] = "sidebar";
  return ChatSessionPosition2;
})(ChatSessionPosition || {});
async function openChatSession(accessor, openOptions, chatSendOptions) {
  const viewsService = accessor.get(IViewsService);
  const chatService = accessor.get(IChatService);
  const chatSessionService = accessor.get(IChatSessionsService);
  const logService = accessor.get(ILogService);
  const editorGroupService = accessor.get(IEditorGroupsService);
  const editorService = accessor.get(IEditorService);
  const customizationHarnessService = accessor.get(ICustomizationHarnessService);
  const toolsService = accessor.get(ILanguageModelToolsService);
  const importConversationStore = accessor.get(IAgentHostImportConversationStore);
  const progressService = accessor.get(IProgressService);
  const sessionResource = getResourceForNewChatSession(openOptions);
  if (chatSendOptions?.importConversation && chatSendOptions.importConversation.turns.length > 0) {
    importConversationStore.set(sessionResource, chatSendOptions.importConversation);
  }
  let sessionsListSuppression;
  let transitionProgress;
  try {
    switch (openOptions.position) {
      case "sidebar" /* Sidebar */: {
        const view = await viewsService.openView(ChatViewId);
        if (chatSendOptions?.importConversation) {
          sessionsListSuppression = view.beginSessionsListSuppression();
          transitionProgress = new DeferredPromise();
          progressService.withProgress({ location: ChatViewId }, () => transitionProgress.p);
        }
        if (openOptions.type === AgentSessionProviders.Local) {
          await view.startNewLocalSession();
        } else {
          await view.loadSession(sessionResource);
        }
        view.focus();
        break;
      }
      case "editor" /* Editor */: {
        const options = {
          override: ChatEditorInput.EditorID,
          pinned: true,
          ...openOptions.type === AgentSessionProviders.Local ? { explicitSessionType: localChatSessionType } : {},
          title: {
            fallback: localize("chatEditorContributionName", "{0}", openOptions.displayName)
          }
        };
        if (openOptions.replaceEditorForResource) {
          const sourceResource = openOptions.replaceEditorForResource;
          let replaced = false;
          for (const group of editorGroupService.groups) {
            const editor = group.editors.find((e) => e instanceof ChatEditorInput && resources.isEqual(e.sessionResource, sourceResource));
            if (editor) {
              await editorService.replaceEditors([{ editor, replacement: { resource: sessionResource, options } }], group);
              replaced = true;
              break;
            }
          }
          if (!replaced) {
            await editorService.openEditor({ resource: sessionResource, options });
          }
        } else {
          await editorService.openEditor({ resource: sessionResource, options });
        }
        break;
      }
      default:
        assertNever(openOptions.position, `Unknown chat session position: ${openOptions.position}`);
    }
  } catch (e) {
    logService.error(`Failed to open '${openOptions.type}' chat session with openOptions: ${JSON.stringify(openOptions)}`, e);
    sessionsListSuppression?.dispose();
    transitionProgress?.complete();
    return;
  }
  if (chatSendOptions) {
    try {
      if (chatSendOptions.initialSessionOptions) {
        chatSessionService.updateSessionOptions(sessionResource, normalizeSessionOptions(chatSendOptions.initialSessionOptions));
      }
      let attachedContext = chatSendOptions.attachedContext;
      const promptFile = await resolvePromptSlashCommand(chatSendOptions.prompt, sessionResource, customizationHarnessService, toolsService);
      if (promptFile) {
        attachedContext = [promptFile, ...attachedContext ?? []];
      }
      const result = await chatService.sendRequest(sessionResource, chatSendOptions.prompt, { agentIdSilent: openOptions.type, attachedContext });
      const newSessionResource = result.kind === "sent" || result.kind === "rejected" ? result.newSessionResource : void 0;
      if (newSessionResource && !resources.isEqual(newSessionResource, sessionResource)) {
        switch (openOptions.position) {
          case "sidebar" /* Sidebar */: {
            const view = await viewsService.openView(ChatViewId);
            await view.loadSession(newSessionResource);
            break;
          }
          case "editor" /* Editor */: {
            for (const group of editorGroupService.groups) {
              const editor = group.editors.find((e) => e instanceof ChatEditorInput && resources.isEqual(e.sessionResource, sessionResource));
              if (editor) {
                await editorService.replaceEditors([{ editor, replacement: { resource: newSessionResource, options: { override: ChatEditorInput.EditorID, pinned: true } } }], group);
                break;
              }
            }
            break;
          }
          default:
            assertNever(openOptions.position, `Unknown chat session position: ${openOptions.position}`);
        }
      }
    } catch (e) {
      logService.error(`Failed to send initial request to '${openOptions.type}' chat session with contextOptions: ${JSON.stringify(chatSendOptions)}`, e);
    }
  }
  sessionsListSuppression?.dispose();
  transitionProgress?.complete();
}
function normalizeSessionOptions(options) {
  if (options instanceof Map) {
    return options;
  }
  if (Array.isArray(options)) {
    return new Map(options.map((o) => [o.optionId, o.value]));
  }
  return ChatSessionOptionsMap.fromRecord(options);
}
async function resolvePromptSlashCommand(prompt, sessionResource, customizationHarnessService, toolsService) {
  const slashMatch = prompt.match(slashReg);
  if (slashMatch) {
    const slashCommand = await customizationHarnessService.resolvePromptSlashCommand(slashMatch[1], sessionResource, CancellationToken.None);
    if (slashCommand) {
      const parseResult = slashCommand.parsedPromptFile;
      const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
      const toolReferences = toolsService.toToolReferences(refs);
      return toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, void 0, true, toolReferences);
    }
  }
  return void 0;
}
function getResourceForNewChatSession(options) {
  const isRemoteSession = options.type !== AgentSessionProviders.Local;
  if (isRemoteSession) {
    return URI.from({
      scheme: options.type,
      path: `/untitled-${generateUuid()}`
    });
  }
  const isEditorPosition = options.position === "editor" /* Editor */;
  if (isEditorPosition) {
    return ChatEditorInput.getNewEditorUri();
  }
  return LocalChatSessionUri.getNewSessionUri();
}
function isAgentSessionProviderType(type) {
  return Object.values(AgentSessionProviders).includes(type);
}
function getSessionStatusForModel(model) {
  if (model.requestInProgress.get()) {
    return ChatSessionStatus.InProgress;
  }
  const lastRequest = model.getRequests().at(-1);
  if (lastRequest?.response) {
    if (lastRequest.response.state === ResponseModelState.NeedsInput) {
      return ChatSessionStatus.NeedsInput;
    } else if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails?.code === "canceled") {
      return ChatSessionStatus.Completed;
    } else if (lastRequest.response.result?.errorDetails) {
      return ChatSessionStatus.Failed;
    } else if (lastRequest.response.isComplete) {
      return ChatSessionStatus.Completed;
    } else {
      return ChatSessionStatus.InProgress;
    }
  }
  return void 0;
}
function chatResponseStateToSessionStatus(state) {
  switch (state) {
    case ResponseModelState.Cancelled:
    case ResponseModelState.Complete:
      return ChatSessionStatus.Completed;
    case ResponseModelState.Failed:
      return ChatSessionStatus.Failed;
    case ResponseModelState.Pending:
      return ChatSessionStatus.InProgress;
    case ResponseModelState.NeedsInput:
      return ChatSessionStatus.NeedsInput;
  }
}
export {
  ChatSessionPosition,
  ChatSessionsService,
  applyCodexAgentHostPreference,
  chatResponseStateToSessionStatus,
  getResourceForNewChatSession,
  getSessionStatusForModel,
  openChatSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTZXNzaW9uc1xcY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNlcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyLCBEZWZlcnJlZFByb21pc2UsIHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcywgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIENoYXRTZXNzaW9uU3RhdHVzLCBDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLCBJQXN5bmNDaGF0U2Vzc2lvbkFjdGl2YXRpb25SZWdpc3RyeSwgSUNoYXROZXdTZXNzaW9uUmVxdWVzdCwgSUNoYXRTZXNzaW9uLCBJQ2hhdFNlc3Npb25Db21taXRFdmVudCwgSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUdyb3VwLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uc1Byb3ZpZGVyLCBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbSwgSUNoYXRTZXNzaW9uSXRlbSwgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIsIElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGEsIElDaGF0U2Vzc2lvbk9wdGlvbnNDaGFuZ2VFdmVudCwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtLCBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIElDaGF0SW5wdXRDb21wbGV0aW9uc1BhcmFtcywgSUNoYXRJbnB1dENvbXBsZXRpb25zUmVzdWx0LCBpc1Nlc3Npb25JblByb2dyZXNzU3RhdHVzLCBsb2NhbENoYXRTZXNzaW9uVHlwZSwgUmVhZG9ubHlDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIFJlc29sdmVkQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQsIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCBSZXNwb25zZU1vZGVsU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgUHJvbXB0RmlsZVZhcmlhYmxlS2luZCwgdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRWaWV3SWQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRWaWV3UGFuZSB9IGZyb20gJy4uL3dpZGdldEhvc3RzL3ZpZXdQYW5lL2NoYXRWaWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLCB0eXBlIElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb24gfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBpc1VudGl0bGVkQ2hhdFNlc3Npb24sIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBzbGFzaFJlZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRSZXF1ZXN0UGFyc2VyLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgQ29kZXhQcmVmZXJBZ2VudEhvc3RFZGl0b3JTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0IGV4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjaGF0U2Vzc2lvbnMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludCcsICdDb250cmlidXRlcyBjaGF0IHNlc3Npb24gaW50ZWdyYXRpb25zIHRvIHRoZSBjaGF0IHdpZGdldC4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuY2hhdFNlc3Npb25UeXBlJywgJ1VuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGUgdHlwZSBvZiBjaGF0IHNlc3Npb24uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50Lm5hbWUnLCAnTmFtZSBvZiB0aGUgZHluYW1pY2FsbHkgcmVnaXN0ZXJlZCBjaGF0IHBhcnRpY2lwYW50IChlZzogQGFnZW50KS4gTXVzdCBub3QgY29udGFpbiB3aGl0ZXNwYWNlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdHBhdHRlcm46ICdeW1xcXFx3LV0rJCdcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LmRpc3BsYXlOYW1lJywgJ0EgbG9uZ2VyIG5hbWUgZm9yIHRoaXMgaXRlbSB3aGljaCBpcyB1c2VkIGZvciBkaXNwbGF5IGluIG1lbnVzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuZGVzY3JpcHRpb24nLCAnRGVzY3JpcHRpb24gb2YgdGhlIGNoYXQgc2Vzc2lvbiBmb3IgdXNlIGluIG1lbnVzIGFuZCB0b29sdGlwcy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC53aGVuJywgJ0NvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIGl0ZW0uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuaWNvbicsICdJY29uIGlkZW50aWZpZXIgKGNvZGljb24gSUQpIGZvciB0aGUgY2hhdCBzZXNzaW9uIGVkaXRvciB0YWIuIEZvciBleGFtcGxlLCBcInswfVwiIG9yIFwiezF9XCIuJywgJyQoZ2l0aHViKScsICckKGNsb3VkKScpLFxuXHRcdFx0XHRcdGFueU9mOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRsaWdodDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaWNvbi5saWdodCcsICdJY29uIHBhdGggd2hlbiBhIGxpZ2h0IHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkYXJrOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpY29uLmRhcmsnLCAnSWNvbiBwYXRoIHdoZW4gYSBkYXJrIHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3JkZXI6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50Lm9yZGVyJywgJ09yZGVyIGluIHdoaWNoIHRoaXMgaXRlbSBzaG91bGQgYmUgZGlzcGxheWVkLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbHRlcm5hdGl2ZUlkczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuYWx0ZXJuYXRpdmVJZHMnLCAnQWx0ZXJuYXRpdmUgaWRlbnRpZmllcnMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlbGNvbWVUaXRsZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQud2VsY29tZVRpdGxlJywgJ1RpdGxlIHRleHQgdG8gZGlzcGxheSBpbiB0aGUgY2hhdCB3ZWxjb21lIHZpZXcgZm9yIHRoaXMgc2Vzc2lvbiB0eXBlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlbGNvbWVNZXNzYWdlOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC53ZWxjb21lTWVzc2FnZScsICdNZXNzYWdlIHRleHQgKHN1cHBvcnRzIG1hcmtkb3duKSB0byBkaXNwbGF5IGluIHRoZSBjaGF0IHdlbGNvbWUgdmlldyBmb3IgdGhpcyBzZXNzaW9uIHR5cGUuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VsY29tZVRpcHM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LndlbGNvbWVUaXBzJywgJ1RpcHMgdGV4dCAoc3VwcG9ydHMgbWFya2Rvd24gYW5kIHRoZW1lIGljb25zKSB0byBkaXNwbGF5IGluIHRoZSBjaGF0IHdlbGNvbWUgdmlldyBmb3IgdGhpcyBzZXNzaW9uIHR5cGUuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5wdXRQbGFjZWhvbGRlcjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuaW5wdXRQbGFjZWhvbGRlcicsICdQbGFjZWhvbGRlciB0ZXh0IHRvIGRpc3BsYXkgaW4gdGhlIGNoYXQgaW5wdXQgYm94IGZvciB0aGlzIHNlc3Npb24gdHlwZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LmNhcGFiaWxpdGllcycsICdPcHRpb25hbCBjYXBhYmlsaXRpZXMgZm9yIHRoaXMgY2hhdCBzZXNzaW9uLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRzdXBwb3J0c0ZpbGVBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzRmlsZUF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIGZpbGVzIG9yIGZpbGUgcmVmZXJlbmNlcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNUb29sQXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c1Rvb2xBdHRhY2htZW50cycsICdXaGV0aGVyIHRoaXMgY2hhdCBzZXNzaW9uIHN1cHBvcnRzIGF0dGFjaGluZyB0b29scyBvciB0b29sIHJlZmVyZW5jZXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzTUNQQXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c01DUEF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIE1DUCByZXNvdXJjZXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzSW1hZ2VBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzSW1hZ2VBdHRhY2htZW50cycsICdXaGV0aGVyIHRoaXMgY2hhdCBzZXNzaW9uIHN1cHBvcnRzIGF0dGFjaGluZyBpbWFnZXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzU2VhcmNoUmVzdWx0QXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c1NlYXJjaFJlc3VsdEF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIHNlYXJjaCByZXN1bHRzLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdXBwb3J0c0luc3RydWN0aW9uQXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c0luc3RydWN0aW9uQXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgaW5zdHJ1Y3Rpb25zLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdXBwb3J0c1NvdXJjZUNvbnRyb2xBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzU291cmNlQ29udHJvbEF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIHNvdXJjZSBjb250cm9sIGNoYW5nZXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzUHJvYmxlbUF0dGFjaG1lbnRzOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuc3VwcG9ydHNQcm9ibGVtQXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgcHJvYmxlbXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzU3ltYm9sQXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c1N5bWJvbEF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIHN5bWJvbHMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIHByb21wdHMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzSGFuZE9mZnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c0hhbmRPZmZzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgaGFuZC1vZmYgcHJvbXB0cy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21tYW5kczoge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZHNEZXNjcmlwdGlvbicsIFwiQ29tbWFuZHMgYXZhaWxhYmxlIGZvciB0aGlzIGNoYXQgc2Vzc2lvbiwgd2hpY2ggdGhlIHVzZXIgY2FuIGludm9rZSB3aXRoIGEgYC9gLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBuYW1lOiAnJywgZGVzY3JpcHRpb246ICcnIH0gfV0sXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWyduYW1lJ10sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kJywgXCJBIHNob3J0IG5hbWUgYnkgd2hpY2ggdGhpcyBjb21tYW5kIGlzIHJlZmVycmVkIHRvIGluIHRoZSBVSSwgZS5nLiBgZml4YCBvciBgZXhwbGFpbmAgZm9yIGNvbW1hbmRzIHRoYXQgZml4IGFuIGlzc3VlIG9yIGV4cGxhaW4gY29kZS4gVGhlIG5hbWUgc2hvdWxkIGJlIHVuaXF1ZSBhbW9uZyB0aGUgY29tbWFuZHMgcHJvdmlkZWQgYnkgdGhpcyBwYXJ0aWNpcGFudC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kRGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2YgdGhpcyBjb21tYW5kLlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZFdoZW4nLCBcIkEgY29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBlbmFibGUgdGhpcyBjb21tYW5kLlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y2FuRGVsZWdhdGU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LmNhbkRlbGVnYXRlJywgJ1doZXRoZXIgZGVsZWdhdGlvbiBpcyBzdXBwb3J0ZWQuIERlZmF1bHQgaXMgZmFsc2UuIE5vdGUgdGhhdCBlbmFibGluZyB0aGlzIGlzIGV4cGVyaW1lbnRhbCBhbmQgbWF5IG5vdCBiZSByZXNwZWN0ZWQgYXQgYWxsIHRpbWVzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b21BZ2VudFRhcmdldDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuY3VzdG9tQWdlbnRUYXJnZXQnLCAnV2hlbiBzZXQsIHRoZSBjaGF0IHNlc3Npb24gd2lsbCBzaG93IGEgZmlsdGVyZWQgbW9kZSBwaWNrZXIgdGhhdCBwcmVmZXJzIGN1c3RvbSBhZ2VudHMgd2hvc2UgdGFyZ2V0IHByb3BlcnR5IG1hdGNoZXMgdGhpcyB2YWx1ZS4gQ3VzdG9tIGFnZW50cyB3aXRob3V0IGEgdGFyZ2V0IHByb3BlcnR5IGFyZSBzdGlsbCBzaG93biBpbiBhbGwgc2Vzc2lvbiB0eXBlcy4gVGhpcyBlbmFibGVzIHRoZSB1c2Ugb2Ygc3RhbmRhcmQgYWdlbnQvbW9kZSB3aXRoIGNvbnRyaWJ1dGVkIHNlc3Npb25zLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5yZXF1aXJlc0N1c3RvbU1vZGVscycsICdXaGVuIHNldCwgdGhlIGNoYXQgc2Vzc2lvbiB3aWxsIHNob3cgYSBmaWx0ZXJlZCBtb2RlbCBwaWNrZXIgdGhhdCBwcmVmZXJzIGN1c3RvbSBtb2RlbHMuIFRoaXMgZW5hYmxlcyB0aGUgdXNlIG9mIHN0YW5kYXJkIG1vZGVsIHBpY2tlciB3aXRoIGNvbnRyaWJ1dGVkIHNlc3Npb25zLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdXBwb3J0c0F1dG9Nb2RlbDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuc3VwcG9ydHNBdXRvTW9kZWwnLCAnV2hldGhlciB0aGUgY2hhdCBzZXNzaW9uIHN1cHBvcnRzIHRoZSBzeW50aGV0aWMgXCJBdXRvXCIgbW9kZWwgZmFsbGJhY2suIERlZmF1bHRzIHRvIGZhbHNlLiBXaGVuIHRydWUgYW5kIG5vIG1vZGVscyBhcmUgYXZhaWxhYmxlLCB0aGUgcGlja2VyIHNob3dzIFwiQXV0b1wiIGluc3RlYWQgb2YgYSBcIk5vIG1vZGVscyBhdmFpbGFibGVcIiBzdGF0ZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZXNDb3BpbG90U2lnbkluOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5yZXF1aXJlc0NvcGlsb3RTaWduSW4nLCAnV2hldGhlciB0aGUgY2hhdCBzZXNzaW9uIHJlbGllcyBvbiBhIEdpdEh1YiBDb3BpbG90IGFjY291bnQgYW5kIHNvIGNhbm5vdCBiZSB1c2VkIHVudGlsIHRoZSB1c2VyIHNpZ25zIGluLiBEZWZhdWx0cyB0byBmYWxzZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0YXV0b0F0dGFjaFJlZmVyZW5jZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LmF1dG9BdHRhY2hSZWZlcmVuY2VzJywgJ1doZXRoZXIgdG8gYXV0b21hdGljYWxseSBhdHRhY2ggaW5zdHJ1Y3Rpb24gZmlsZXMgdG8gY2hhdCByZXF1ZXN0cyBmb3IgdGhpcyBzZXNzaW9uIHR5cGUuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVzZVJlcXVlc3RUb1BvcHVsYXRlQnVpbHRJblBpY2tlcnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnVzZVJlcXVlc3RUb1BvcHVsYXRlQnVpbHRJblBpY2tlcnMnLCAnV2hldGhlciB0byB1c2UgQ2hhdFJlcXVlc3RUdXJuMiB0byBwb3B1bGF0ZSBidWlsdC1pbiBwaWNrZXJzIHN1Y2ggYXMgdGhlIEFnZW50IGFuZCBNb2RlbCBwaWNrZXJzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsndHlwZScsICduYW1lJywgJ2Rpc3BsYXlOYW1lJywgJ2Rlc2NyaXB0aW9uJ10sXG5cdFx0fVxuXHR9LFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGNvbnRyaWJzKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJzKSB7XG5cdFx0XHR5aWVsZCBgb25DaGF0U2Vzc2lvbjoke2NvbnRyaWIudHlwZX1gO1xuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IGNvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZVdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkubmVnYXRlKCksXG5cdFx0Q29udGV4dEtleUV4cHIubm90KGBjb25maWcuJHtBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZH1gKSxcblx0XHRDb250ZXh0S2V5RXhwci5ub3QoYGNvbmZpZy4ke0NvZGV4UHJlZmVyQWdlbnRIb3N0RWRpdG9yU2V0dGluZ0lkfWApLFxuXHQpLFxuKSE7XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNvZGV4QWdlbnRIb3N0UHJlZmVyZW5jZShjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCk6IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCB7XG5cdGlmIChjb250cmlidXRpb24udHlwZSAhPT0gU2Vzc2lvblR5cGUuQ29kZXgpIHtcblx0XHRyZXR1cm4gY29udHJpYnV0aW9uO1xuXHR9XG5cblx0Y29uc3QgY29udHJpYnV0ZWRXaGVuID0gY29udHJpYnV0aW9uLndoZW4gPyBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShjb250cmlidXRpb24ud2hlbikgOiB1bmRlZmluZWQ7XG5cdHJldHVybiB7XG5cdFx0Li4uY29udHJpYnV0aW9uLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChjb250cmlidXRlZFdoZW4sIGNvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZVdoZW4pPy5zZXJpYWxpemUoKSxcblx0fTtcbn1cblxuY2xhc3MgQ29udHJpYnV0ZWRDaGF0U2Vzc2lvbkRhdGEgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zQ2FjaGU6IENoYXRTZXNzaW9uT3B0aW9uc01hcDtcblx0cHVibGljIGdldE9wdGlvbihvcHRpb25JZDogc3RyaW5nKTogc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9uc0NhY2hlLmdldChvcHRpb25JZCk7XG5cdH1cblx0cHVibGljIGdldEFsbE9wdGlvbnMoKTogSXRlcmFibGVJdGVyYXRvcjxbc3RyaW5nLCBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW1dPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbnNDYWNoZS5lbnRyaWVzKCk7XG5cdH1cblx0cHVibGljIHNldE9wdGlvbihvcHRpb25JZDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5fb3B0aW9uc0NhY2hlLnNldChvcHRpb25JZCwgdmFsdWUpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc2Vzc2lvbjogSUNoYXRTZXNzaW9uLFxuXHRcdHJlYWRvbmx5IGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogUmVhZG9ubHlDaGF0U2Vzc2lvbk9wdGlvbnNNYXAgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbldpbGxEaXNwb3NlOiAocmVzb3VyY2U6IFVSSSkgPT4gdm9pZFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fb3B0aW9uc0NhY2hlID0gbmV3IE1hcChvcHRpb25zKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbi5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMub25XaWxsRGlzcG9zZSh0aGlzLnJlc291cmNlKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgQ2hhdFNlc3Npb25zU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb25zU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtQ29udHJvbGxlcnMgPSBuZXcgTWFwPC8qIHR5cGUgKi8gc3RyaW5nLCB7IHJlYWRvbmx5IGNvbnRyb2xsZXI6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyOyByZWFkb25seSBpbml0aWFsUmVmcmVzaDogUHJvbWlzZTx2b2lkPiB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3luY0FjdGl2YXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5PihDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLkFzeW5jQWN0aXZhdGlvbik7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0aW9uczogTWFwPC8qIHR5cGUgKi8gc3RyaW5nLCB7IHJlYWRvbmx5IGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50OyByZWFkb25seSBleHRlbnNpb246IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQgfT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8LyogdHlwZSAqLyBzdHJpbmc+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRQcm92aWRlcnM6IE1hcDwvKiBzY2hlbWUgKi8gc3RyaW5nLCBJQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXI+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbHRlcm5hdGl2ZUlkTWFwOiBNYXA8LyogYWx0ZXJuYXRpdmVJZCAqLyBzdHJpbmcsIC8qIHByaW1hcnlUeXBlICovIHN0cmluZz4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtc1Byb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMgPSB0aGlzLl9vbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uSXRlbXNEZWx0YT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uSXRlbXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21taXRTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uQ29tbWl0RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENvbW1pdFNlc3Npb24gPSB0aGlzLl9vbkRpZENvbW1pdFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJblByb2dyZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VJblByb2dyZXNzKCkgeyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VJblByb2dyZXNzLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBhZGRlZDogc3RyaW5nW107IHJlYWRvbmx5IHJlbW92ZWQ6IHN0cmluZ1tdIH0+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQ29udGVudFByb3ZpZGVyU2NoZW1lcygpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudFByb3ZpZGVyU2NoZW1lcy5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25PcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uT3B0aW9uc0NoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZVNlc3Npb25PcHRpb25zKCkgeyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uT3B0aW9ucy5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wdGlvbkdyb3VwcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VPcHRpb25Hcm91cHMoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZU9wdGlvbkdyb3Vwcy5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5Qcm9ncmVzc01hcCA9IG5ldyBNYXA8LyogY2hhdFNlc3Npb25UeXBlICovIHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVHlwZU9wdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gbmV3IFJlc291cmNlTWFwPENvbnRyaWJ1dGVkQ2hhdFNlc3Npb25EYXRhPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZUFsaWFzZXMgPSBuZXcgUmVzb3VyY2VNYXA8VVJJPigpOyAvLyByZWFsIHJlc291cmNlIC0+IHVudGl0bGVkIHJlc291cmNlIChrZXB0IGZvciB0aGUgd29ya2JlbmNoIGxpZmV0aW1lIHNvIG9wdGlvbiBsb29rdXBzIGZvciB0aGUgcmVhbCBzZXNzaW9uIHJlc29sdmUgdG8gdGhlIHVudGl0bGVkIGVudHJ5KVxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWFsUmVzb3VyY2VzID0gbmV3IFJlc291cmNlTWFwPFVSST4oKTsgLy8gdW50aXRsZWQgcmVzb3VyY2UgLT4gcmVhbCByZXNvdXJjZSAoY2xlYXJlZCB3aGVuIHRoZSBzZXNzaW9uIGlzIGRpc3Bvc2VkKVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25zUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0tleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2hhc0NhbkRlbGVnYXRlUHJvdmlkZXJzS2V5ID0gQ2hhdENvbnRleHRLZXlzLmhhc0NhbkRlbGVnYXRlUHJvdmlkZXJzLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHQgb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dC5kZXNjcmlwdGlvbiwgJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJykpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZXh0LnZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dC52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJDb250cmlidXRpb24oY29udHJpYnV0aW9uLCBleHQuZGVzY3JpcHRpb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgY29udGV4dCBjaGFuZ2VzIGFuZCByZS1ldmFsdWF0ZSBjb250cmlidXRpb25zXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCwgZSA9PiBlLmFmZmVjdHNTb21lKHRoaXMuX2NvbnRleHRLZXlzKSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZXZhbHVhdGVBdmFpbGFiaWxpdHkoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBidWlsdGluU2Vzc2lvblByb3ZpZGVycyA9IFtBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWxdO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkU2Vzc2lvblByb3ZpZGVycyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5LFxuXHRcdFx0KCkgPT4gQXJyYXkuZnJvbSh0aGlzLl9jb250cmlidXRpb25zLmtleXMoKSkuZmlsdGVyKGtleSA9PiB0aGlzLl9jb250cmlidXRpb25EaXNwb3NhYmxlcy5oYXMoa2V5KSksXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmF0ZWRQcm92aWRlcnMgPSBjb250cmlidXRlZFNlc3Npb25Qcm92aWRlcnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBpbi1wbGFjZSBhY3Rpb25zIGZvciBidWlsdC1pbiBlbnVtIHByb3ZpZGVyc1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBidWlsdGluU2Vzc2lvblByb3ZpZGVycykge1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlZ2lzdGVyTmV3U2Vzc2lvbkluUGxhY2VBY3Rpb24ocHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShwcm92aWRlcikpKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB0eXBlIG9mIGFjdGl2YXRlZFByb3ZpZGVycykge1xuXHRcdFx0XHQvLyBUT0RPOiBSZW1vdmUgaGFyZGNvZGVkIHByb3ZpZGVycyBmcm9tIGNvcmVcblx0XHRcdFx0Y29uc3Qga25vd25Qcm92aWRlciA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKHR5cGUpO1xuXHRcdFx0XHRpZiAoa25vd25Qcm92aWRlcikge1xuXHRcdFx0XHRcdC8vIFdlbGwta25vd24gcHJvdmlkZXIgXHUyMDE0IHVzZSBoYXJkY29kZWQgbmFtZVxuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKGtub3duUHJvdmlkZXIpO1xuXHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVnaXN0ZXJOZXdTZXNzaW9uSW5QbGFjZUFjdGlvbih0eXBlLCBsYWJlbCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEV4dGVuc2lvbi1jb250cmlidXRlZCBcdTIwMTQgdXNlIGNvbnRyaWJ1dGlvbiBtZXRhZGF0YVxuXHRcdFx0XHRcdGNvbnN0IGNvbnRyaWIgPSB0aGlzLl9jb250cmlidXRpb25zLmdldCh0eXBlKTtcblx0XHRcdFx0XHRpZiAoY29udHJpYikge1xuXHRcdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChyZWdpc3Rlck5ld1Nlc3Npb25JblBsYWNlQWN0aW9uKHR5cGUsIGNvbnRyaWIuY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lID8/IGNvbnRyaWIuY29udHJpYnV0aW9uLm5hbWUgPz8gdHlwZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMuY29waWxvdFByLFxuXHRcdFx0Zm9ybWF0dGluZzoge1xuXHRcdFx0XHRsYWJlbDogJyR7YXV0aG9yaXR5fSR7cGF0aH0nLFxuXHRcdFx0XHRzZXBhcmF0b3I6IHNlcCxcblx0XHRcdFx0c3RyaXBQYXRoU3RhcnRpbmdTZXBhcmF0b3I6IHRydWUsXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRJblByb2dyZXNzKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pdGVtQ29udHJvbGxlcnMuaGFzKGNoYXRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQXR0ZW1wdGVkIHRvIHJlcG9ydCBpbi1wcm9ncmVzcyBzdGF0dXMgZm9yIHVua25vd24gY2hhdCBzZXNzaW9uIHR5cGUgJyR7Y2hhdFNlc3Npb25UeXBlfSdgKTtcblx0XHR9XG5cblx0XHR0aGlzLmluUHJvZ3Jlc3NNYXAuc2V0KGNoYXRTZXNzaW9uVHlwZSwgY291bnQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5Qcm9ncmVzcy5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SW5Qcm9ncmVzcygpOiB7IGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nOyBjb3VudDogbnVtYmVyIH1bXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5pblByb2dyZXNzTWFwLmVudHJpZXMoKSkubWFwKChbY2hhdFNlc3Npb25UeXBlLCBjb3VudF0pID0+ICh7IGNoYXRTZXNzaW9uVHlwZSwgY291bnQgfSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5faXRlbUNvbnRyb2xsZXJzLmdldChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGlmICghZW50cnk/LmNvbnRyb2xsZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW50cnkuY29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHJlc291cmNlLCB0b2tlbik7XG5cdH1cblxuXHRjYW5TZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0eXBlb2YgdGhpcy5fZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpPy5jb250cm9sbGVyLnNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0c2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQoc2Vzc2lvblJlc291cmNlOiBVUkksIGFyY2hpdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuX2dldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblJlc291cmNlKT8uY29udHJvbGxlcjtcblx0XHRpZiAoIWNvbnRyb2xsZXI/LnNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3Qgc3VwcG9ydCBhcmNoaXZpbmdgKTtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5zZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChzZXNzaW9uUmVzb3VyY2UsIGFyY2hpdmVkKTtcblx0fVxuXG5cdGNhblNldENoYXRTZXNzaW9uSXRlbVJlYWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHlwZW9mIHRoaXMuX2dldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblJlc291cmNlKT8uY29udHJvbGxlci5zZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0c2V0Q2hhdFNlc3Npb25JdGVtUmVhZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaXNSZWFkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuX2dldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblJlc291cmNlKT8uY29udHJvbGxlcjtcblx0XHRpZiAoIWNvbnRyb2xsZXI/LnNldENoYXRTZXNzaW9uSXRlbVJlYWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBkb2VzIG5vdCBvd24gcmVhZCBzdGF0ZWApO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnNldENoYXRTZXNzaW9uSXRlbVJlYWQoc2Vzc2lvblJlc291cmNlLCBpc1JlYWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVJblByb2dyZXNzU3RhdHVzKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGl0ZW1zOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgcmVzdWx0IG9mIHRoaXMuZ2V0Q2hhdFNlc3Npb25JdGVtcyhbY2hhdFNlc3Npb25UeXBlXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpIHtcblx0XHRcdFx0aXRlbXMucHVzaCguLi5yZXN1bHQuaXRlbXMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5Qcm9ncmVzcyA9IGl0ZW1zLmZpbHRlcihpdGVtID0+ICFpdGVtLmFyY2hpdmVkICYmIGl0ZW0uc3RhdHVzICYmIGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMoaXRlbS5zdGF0dXMpKTtcblx0XHRcdHRoaXMucmVwb3J0SW5Qcm9ncmVzcyhjaGF0U2Vzc2lvblR5cGUsIGluUHJvZ3Jlc3MubGVuZ3RoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBGYWlsZWQgdG8gdXBkYXRlIGluLXByb2dyZXNzIHN0YXR1cyBmb3IgY2hhdCBzZXNzaW9uIHR5cGUgJyR7Y2hhdFNlc3Npb25UeXBlfSc6YCwgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb250cmlidXRpb24oY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQsIGV4dDogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb250cmlidXRpb24gPSBhcHBseUNvZGV4QWdlbnRIb3N0UHJlZmVyZW5jZShjb250cmlidXRpb24pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDaGF0U2Vzc2lvbnNTZXJ2aWNlXSByZWdpc3RlckNvbnRyaWJ1dGlvbiBjYWxsZWQgZm9yIHR5cGU9JyR7Y29udHJpYnV0aW9uLnR5cGV9JywgY2FuRGVsZWdhdGU9JHtjb250cmlidXRpb24uY2FuRGVsZWdhdGV9LCB3aGVuPScke2NvbnRyaWJ1dGlvbi53aGVufScsIGV4dGVuc2lvbj0nJHtleHQuaWRlbnRpZmllci52YWx1ZX0nYCk7XG5cdFx0aWYgKHRoaXMuX2NvbnRyaWJ1dGlvbnMuaGFzKGNvbnRyaWJ1dGlvbi50eXBlKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIHJlZ2lzdGVyQ29udHJpYnV0aW9uOiB0eXBlPScke2NvbnRyaWJ1dGlvbi50eXBlfScgYWxyZWFkeSByZWdpc3RlcmVkLCBza2lwcGluZ2ApO1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBjb250ZXh0IGtleXMgZnJvbSB0aGUgd2hlbiBjb25kaXRpb25cblx0XHRpZiAoY29udHJpYnV0aW9uLndoZW4pIHtcblx0XHRcdGNvbnN0IHdoZW5FeHByID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoY29udHJpYnV0aW9uLndoZW4pO1xuXHRcdFx0aWYgKHdoZW5FeHByKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHdoZW5FeHByLmtleXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRLZXlzLmFkZChrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucy5zZXQoY29udHJpYnV0aW9uLnR5cGUsIHsgY29udHJpYnV0aW9uLCBleHRlbnNpb246IGV4dCB9KTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFsdGVybmF0aXZlIElEcyBpZiBwcm92aWRlZFxuXHRcdGlmIChjb250cmlidXRpb24uYWx0ZXJuYXRpdmVJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgYWx0SWQgb2YgY29udHJpYnV0aW9uLmFsdGVybmF0aXZlSWRzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hbHRlcm5hdGl2ZUlkTWFwLmhhcyhhbHRJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEFsdGVybmF0aXZlIElEICcke2FsdElkfScgaXMgYWxyZWFkeSBtYXBwZWQgdG8gJyR7dGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5nZXQoYWx0SWQpfScuIFJlbWFwcGluZyB0byAnJHtjb250cmlidXRpb24udHlwZX0nLmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FsdGVybmF0aXZlSWRNYXAuc2V0KGFsdElkLCBjb250cmlidXRpb24udHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fZXZhbHVhdGVBdmFpbGFiaWxpdHkoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMuZGVsZXRlKGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdFx0Ly8gUmVtb3ZlIGFsdGVybmF0aXZlIElEIG1hcHBpbmdzXG5cdFx0XHRcdGlmIChjb250cmlidXRpb24uYWx0ZXJuYXRpdmVJZHMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFsdElkIG9mIGNvbnRyaWJ1dGlvbi5hbHRlcm5hdGl2ZUlkcykge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2FsdGVybmF0aXZlSWRNYXAuZ2V0KGFsdElkKSA9PT0gY29udHJpYnV0aW9uLnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5kZWxldGUoYWx0SWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jb250cmlidXRpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSGFzQ2FuRGVsZWdhdGVQcm92aWRlcnNDb250ZXh0S2V5KCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlKGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjb250cmlidXRpb24ud2hlbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHdoZW5FeHByID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoY29udHJpYnV0aW9uLndoZW4pO1xuXHRcdHJldHVybiAhd2hlbkV4cHIgfHwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3aGVuRXhwcik7XG5cdH1cblxuXHQvKipcblx0ICogVHlwZS1rZXllZCBjb21wYW5pb24gdG8ge0BsaW5rIF9pc0NvbnRyaWJ1dGlvbkF2YWlsYWJsZX0uIFJlc29sdmVzIHRoZVxuXHQgKiBzZXNzaW9uIHR5cGUgKGluY2x1ZGluZyBhbHRlcm5hdGl2ZSBpZHMpIHRvIGl0cyBjb250cmlidXRpb24gYW5kIHJlcG9ydHNcblx0ICogd2hldGhlciB0aGF0IGNvbnRyaWJ1dGlvbiBpcyBjdXJyZW50bHkgZW5hYmxlZCBieSBpdHMgYHdoZW5gIGNsYXVzZS5cblx0ICpcblx0ICogU2Vzc2lvbiB0eXBlcyB3aXRoIG5vIGNvbnRyaWJ1dGlvbiBlbnRyeSAoZS5nLiB0aGUgYnVpbHQtaW4gYGxvY2FsYFxuXHQgKiBwcm92aWRlciwgb3IgaXRlbSBjb250cm9sbGVycyByZWdpc3RlcmVkIHdpdGhvdXQgYSBtYXRjaGluZyBjb250cmlidXRpb24pXG5cdCAqIGFyZSB0cmVhdGVkIGFzIGF2YWlsYWJsZSwgc2luY2UgdGhlcmUgaXMgbm8gYHdoZW5gIGNsYXVzZSBnYXRpbmcgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlRm9yVHlwZShzZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgb3duaW5nIGNvbnRyaWJ1dGlvbiBieSBwcmltYXJ5IHR5cGUsIGZhbGxpbmcgYmFjayB0byB0aGVcblx0XHQvLyBhbHRlcm5hdGl2ZS1pZCBtYXAuIFdlIG11c3QgTk9UIHVzZSBgX3Jlc29sdmVUb1ByaW1hcnlUeXBlYCBoZXJlOiBpdFxuXHRcdC8vIHJldHVybnMgYHVuZGVmaW5lZGAgb25jZSB0aGUgcHJpbWFyeSBjb250cmlidXRpb24gaXMgdW5hdmFpbGFibGUsIHdoaWNoXG5cdFx0Ly8gd291bGQgbWFrZSBhIGdhdGVkIGNvbnRyaWJ1dGlvbiByZWFjaGVkIHZpYSBhbiBhbHRlcm5hdGl2ZSBpZCByZWFkIGFzXG5cdFx0Ly8gXCJubyBjb250cmlidXRpb25cIiBhbmQgdGhlcmVmb3JlIGF2YWlsYWJsZS5cblx0XHRjb25zdCBwcmltYXJ5VHlwZSA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuaGFzKHNlc3Npb25UeXBlKSA/IHNlc3Npb25UeXBlIDogdGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5nZXQoc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHByaW1hcnlUeXBlID8gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQocHJpbWFyeVR5cGUpPy5jb250cmlidXRpb24gOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuICFjb250cmlidXRpb24gfHwgdGhpcy5faXNDb250cmlidXRpb25BdmFpbGFibGUoY29udHJpYnV0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIHNlc3Npb24gdHlwZSB0byBpdHMgcHJpbWFyeSB0eXBlLCBjaGVja2luZyBmb3IgYWx0ZXJuYXRpdmUgSURzLlxuXHQgKiBAcGFyYW0gc2Vzc2lvblR5cGUgVGhlIHNlc3Npb24gdHlwZSBvciBhbHRlcm5hdGl2ZSBJRCB0byByZXNvbHZlXG5cdCAqIEByZXR1cm5zIFRoZSBwcmltYXJ5IHNlc3Npb24gdHlwZSwgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCBvciBub3QgYXZhaWxhYmxlXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlVG9QcmltYXJ5VHlwZShzZXNzaW9uVHlwZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUcnkgdG8gZmluZCB0aGUgcHJpbWFyeSB0eXBlIGZpcnN0XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoc2Vzc2lvblR5cGUpPy5jb250cmlidXRpb247XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbikge1xuXHRcdFx0Ly8gSWYgdGhlIGNvbnRyaWJ1dGlvbiBpcyBhdmFpbGFibGUsIHVzZSBpdFxuXHRcdFx0aWYgKHRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlKGNvbnRyaWJ1dGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb25UeXBlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgbm90IGF2YWlsYWJsZSwgZmFsbCB0aHJvdWdoIHRvIGNoZWNrIGZvciBhbHRlcm5hdGl2ZXNcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIGFuIGFsdGVybmF0aXZlIElELCBvciBpZiB0aGUgcHJpbWFyeSB0eXBlIGlzIG5vdCBhdmFpbGFibGVcblx0XHRjb25zdCBwcmltYXJ5VHlwZSA9IHRoaXMuX2FsdGVybmF0aXZlSWRNYXAuZ2V0KHNlc3Npb25UeXBlKTtcblx0XHRpZiAocHJpbWFyeVR5cGUpIHtcblx0XHRcdGNvbnN0IGFsdENvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHByaW1hcnlUeXBlKT8uY29udHJpYnV0aW9uO1xuXHRcdFx0aWYgKGFsdENvbnRyaWJ1dGlvbiAmJiB0aGlzLl9pc0NvbnRyaWJ1dGlvbkF2YWlsYWJsZShhbHRDb250cmlidXRpb24pKSB7XG5cdFx0XHRcdHJldHVybiBwcmltYXJ5VHlwZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJNZW51SXRlbXMoY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQsIGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gQSBub24tZGVsZWdhdGluZyBjb250cmlidXRpb24gKGUuZy4gdGhlIENvZGV4IGVkaXRvciBzZXNzaW9uKSBjcmVhdGVzXG5cdFx0Ly8gYSBuZXcgc2Vzc2lvbiB2aWEgYG9wZW5OZXdDaGF0U2Vzc2lvbkV4dGVybmFsLjx0eXBlPmAuIFJlZ2lzdGVyIGl0XG5cdFx0Ly8gZWFnZXJseSBhbmQgcmVzb2x2ZSB0aGUgY3JlYXRlIGNvbW1hbmQgbGF6aWx5LCBzbyBpdCBzdXJ2aXZlcyB0aGUgcmFjZVxuXHRcdC8vIHdoZXJlIHRoZSBleHRlbnNpb24ncyBjcmVhdGUtc3VibWVudSBlbnRyeSBpc24ndCByZWdpc3RlcmVkIHlldCBhdFxuXHRcdC8vIGVuYWJsZSB0aW1lLlxuXHRcdGlmICghY29udHJpYnV0aW9uLmNhbkRlbGVnYXRlKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJOZXdTZXNzaW9uRXh0ZXJuYWxBY3Rpb24oXG5cdFx0XHRcdGNvbnRyaWJ1dGlvbi50eXBlLFxuXHRcdFx0XHRjb250cmlidXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdCgpID0+IHRoaXMuX3Jlc29sdmVDcmVhdGVTdWJNZW51Q29tbWFuZElkKGNvbnRyaWJ1dGlvbi50eXBlKSxcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdC8vIElmIHByb3ZpZGVyIHJlZ2lzdGVycyBhbnl0aGluZyBmb3IgdGhlIGNyZWF0ZSBzdWJtZW51LCBsZXQgaXQgZnVsbHkgY29udHJvbCB0aGUgY3JlYXRpb25cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0WydjaGF0U2Vzc2lvblR5cGUnLCBjb250cmlidXRpb24udHlwZV1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHJhd01lbnVBY3Rpb25zID0gdGhpcy5fbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkFnZW50U2Vzc2lvbnNDcmVhdGVTdWJNZW51LCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSByYXdNZW51QWN0aW9ucy5tYXAodmFsdWUgPT4gdmFsdWVbMV0pLmZsYXQoKTtcblxuXHRcdC8vIE1pcnJvciBjcmVhdGUgc3VibWVudSBhY3Rpb25zIGludG8gdGhlIGdsb2JhbCBDaGF0IE5ldyBtZW51LiBGb3IgYVxuXHRcdC8vIG5vbi1kZWxlZ2F0aW5nIGNvbnRyaWJ1dGlvbiB0aGUgZmlyc3QgYWN0aW9uIGlzIHRoZSBwcmltYXJ5IGNyZWF0ZVxuXHRcdC8vIGNvbW1hbmQsIGFscmVhZHkgc3VyZmFjZWQgdGhyb3VnaCB0aGUgZXh0ZXJuYWwgYWN0aW9uIGFib3ZlLCBzbyBza2lwIGl0LlxuXHRcdGNvbnN0IG1lbnVJdGVtQWN0aW9ucyA9IG1lbnVBY3Rpb25zLmZpbHRlcigoYWN0aW9uKTogYWN0aW9uIGlzIE1lbnVJdGVtQWN0aW9uID0+IGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKTtcblx0XHRjb25zdCBhY3Rpb25zVG9NaXJyb3IgPSBjb250cmlidXRpb24uY2FuRGVsZWdhdGUgPyBtZW51SXRlbUFjdGlvbnMgOiBtZW51SXRlbUFjdGlvbnMuc2xpY2UoMSk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9uc1RvTWlycm9yKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0TmV3TWVudSwge1xuXHRcdFx0XHRjb21tYW5kOiBhY3Rpb24uaXRlbSxcblx0XHRcdFx0Z3JvdXA6ICc0X2V4dGVybmFsbHlfY29udHJpYnV0ZWQnLFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgY29tbWFuZCBpZCBvZiB0aGUgcHJpbWFyeSBjcmVhdGUgYWN0aW9uIGNvbnRyaWJ1dGVkIHRvXG5cdCAqIHtAbGluayBNZW51SWQuQWdlbnRTZXNzaW9uc0NyZWF0ZVN1Yk1lbnV9IGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbiB0eXBlLCBvclxuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIG5vIHN1Y2ggYWN0aW9uIGlzIGNvbnRyaWJ1dGVkICh5ZXQpLiBSZWFkIGF0IGV4ZWN1dGlvblxuXHQgKiB0aW1lIHNvIGl0IGlzIHVuYWZmZWN0ZWQgYnkgdGhlIG9yZGVyaW5nIG9mIGV4dGVuc2lvbiBtZW51IHJlZ2lzdHJhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVDcmVhdGVTdWJNZW51Q29tbWFuZElkKHR5cGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFsnY2hhdFNlc3Npb25UeXBlJywgdHlwZV1cblx0XHRdKTtcblx0XHRjb25zdCByYXdNZW51QWN0aW9ucyA9IHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5BZ2VudFNlc3Npb25zQ3JlYXRlU3ViTWVudSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gcmF3TWVudUFjdGlvbnMubWFwKHZhbHVlID0+IHZhbHVlWzFdKS5mbGF0KCk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9uLml0ZW0uaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckNvbW1hbmRzKGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGlzQXZhaWxhYmxlSW5TZXNzaW9uVHlwZVBpY2tlciA9IGlzQWdlbnRTZXNzaW9uUHJvdmlkZXJUeXBlKGNvbnRyaWJ1dGlvbi50eXBlKTtcblxuXHRcdHJldHVybiBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlbkNoYXRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5TZXNzaW9uV2l0aFByb21wdC4ke2NvbnRyaWJ1dGlvbi50eXBlfWAsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ub3BlblNlc3Npb25XaXRoUHJvbXB0JywgXCJOZXcgezB9IHdpdGggUHJvbXB0XCIsIGNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY2hhdE9wdGlvbnM/OiB7IHJlc291cmNlOiBVcmlDb21wb25lbnRzOyBwcm9tcHQ6IHN0cmluZzsgYXR0YWNoZWRDb250ZXh0PzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHsgdHlwZSB9ID0gY29udHJpYnV0aW9uO1xuXG5cdFx0XHRcdFx0aWYgKGNoYXRPcHRpb25zKSB7XG5cdFx0XHRcdFx0XHRsZXQgYXR0YWNoZWRDb250ZXh0ID0gY2hhdE9wdGlvbnMuYXR0YWNoZWRDb250ZXh0O1xuXG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucmV2aXZlKGNoYXRPcHRpb25zLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ0NoYXRTZXNzaW9uc0NvbnRyaWJ1dGlvbiNzZW5kUHJvbXB0Jyk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcm9tcHRGaWxlID0gYXdhaXQgcmVzb2x2ZVByb21wdFNsYXNoQ29tbWFuZChjaGF0T3B0aW9ucy5wcm9tcHQsIHNlc3Npb25SZXNvdXJjZSwgY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCB0b29sc1NlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvbXB0RmlsZSkge1xuXHRcdFx0XHRcdFx0XHRcdGF0dGFjaGVkQ29udGV4dCA9IFtwcm9tcHRGaWxlLCAuLi4oYXR0YWNoZWRDb250ZXh0ID8/IFtdKV07XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGF0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIGNoYXRPcHRpb25zLnByb21wdCwgeyBhZ2VudElkU2lsZW50OiB0eXBlLCBhdHRhY2hlZENvbnRleHQgfSk7XG5cdFx0XHRcdFx0XHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3F1ZXVlZCcpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCByZXN1bHQuZGVmZXJyZWQ7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocmVzdWx0LmtpbmQgPT09ICdzZW50Jykge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHJlc3VsdC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0XHRyZWY/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0Ly8gQ3JlYXRlcyBhIGNoYXQgZWRpdG9yXG5cdFx0XHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgT3Blbk5ld0NoYXRTZXNzaW9uRWRpdG9yQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdTZXNzaW9uRWRpdG9yLiR7Y29udHJpYnV0aW9uLnR5cGV9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuTmV3U2Vzc2lvbkVkaXRvcicsIFwiTmV3IHswfSBTZXNzaW9uXCIsIGNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY2hhdE9wdGlvbnM/OiB7IHByb21wdDogc3RyaW5nOyBhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHsgdHlwZSwgZGlzcGxheU5hbWUgfSA9IGNvbnRyaWJ1dGlvbjtcblx0XHRcdFx0XHRhd2FpdCBvcGVuQ2hhdFNlc3Npb24oYWNjZXNzb3IsIHsgdHlwZSwgZGlzcGxheU5hbWUsIHBvc2l0aW9uOiBDaGF0U2Vzc2lvblBvc2l0aW9uLkVkaXRvciB9LCBjaGF0T3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0Ly8gTmV3IGNoYXQgaW4gc2lkZWJhciBjaGF0ICgrIGJ1dHRvbilcblx0XHRcdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuTmV3Q2hhdFNlc3Npb25TaWRlYmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdTZXNzaW9uU2lkZWJhci4ke2NvbnRyaWJ1dGlvbi50eXBlfWAsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ub3Blbk5ld1Nlc3Npb25TaWRlYmFyJywgXCJOZXcgezB9IFNlc3Npb25cIiwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdFx0XHRcdFx0ZjE6IGZhbHNlLCAvLyBIaWRlIGZyb20gQ29tbWFuZCBQYWxldHRlXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdFx0bWVudTogIWlzQXZhaWxhYmxlSW5TZXNzaW9uVHlwZVBpY2tlciA/IHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TmV3TWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICczX25ld19zcGVjaWFsJyxcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNoYXRPcHRpb25zPzogeyBwcm9tcHQ6IHN0cmluZzsgYXR0YWNoZWRDb250ZXh0PzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCB7IHR5cGUsIGRpc3BsYXlOYW1lIH0gPSBjb250cmlidXRpb247XG5cdFx0XHRcdFx0YXdhaXQgb3BlbkNoYXRTZXNzaW9uKGFjY2Vzc29yLCB7IHR5cGUsIGRpc3BsYXlOYW1lLCBwb3NpdGlvbjogQ2hhdFNlc3Npb25Qb3NpdGlvbi5TaWRlYmFyIH0sIGNoYXRPcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXZhbHVhdGVBdmFpbGFiaWxpdHkoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3bHlFbmFibGVkQ2hhdFNlc3Npb25UeXBlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IG5ld2x5RGlzYWJsZWRDaGF0U2Vzc2lvblR5cGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRjb25zdCBkaXNwb3NlZENoYXRTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGNvbnRyaWJ1dGlvbiwgZXh0ZW5zaW9uIH0gb2YgdGhpcy5fY29udHJpYnV0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgaXNDdXJyZW50bHlSZWdpc3RlcmVkID0gdGhpcy5fY29udHJpYnV0aW9uRGlzcG9zYWJsZXMuaGFzKGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdGNvbnN0IHNob3VsZEJlUmVnaXN0ZXJlZCA9IHRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlKGNvbnRyaWJ1dGlvbik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gX2V2YWx1YXRlQXZhaWxhYmlsaXR5OiB0eXBlPScke2NvbnRyaWJ1dGlvbi50eXBlfScsIGlzQ3VycmVudGx5UmVnaXN0ZXJlZD0ke2lzQ3VycmVudGx5UmVnaXN0ZXJlZH0sIHNob3VsZEJlUmVnaXN0ZXJlZD0ke3Nob3VsZEJlUmVnaXN0ZXJlZH0sIHdoZW49JyR7Y29udHJpYnV0aW9uLndoZW59J2ApO1xuXHRcdFx0aWYgKGlzQ3VycmVudGx5UmVnaXN0ZXJlZCAmJiAhc2hvdWxkQmVSZWdpc3RlcmVkKSB7XG5cdFx0XHRcdC8vIERpc2FibGUgdGhlIGNvbnRyaWJ1dGlvbiBieSBkaXNwb3NpbmcgaXRzIGRpc3Bvc2FibGUgc3RvcmVcblx0XHRcdFx0dGhpcy5fY29udHJpYnV0aW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShjb250cmlidXRpb24udHlwZSk7XG5cblx0XHRcdFx0Ly8gQWxzbyBkaXNwb3NlIGFueSBjYWNoZWQgc2Vzc2lvbnMgZm9yIHRoaXMgY29udHJpYnV0aW9uXG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvblJlc291cmNlIG9mIHRoaXMuX2Rpc3Bvc2VTZXNzaW9uc0ZvckNvbnRyaWJ1dGlvbihjb250cmlidXRpb24udHlwZSkpIHtcblx0XHRcdFx0XHRkaXNwb3NlZENoYXRTZXNzaW9ucy5hZGQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG5ld2x5RGlzYWJsZWRDaGF0U2Vzc2lvblR5cGVzLmFkZChjb250cmlidXRpb24udHlwZSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc0N1cnJlbnRseVJlZ2lzdGVyZWQgJiYgc2hvdWxkQmVSZWdpc3RlcmVkKSB7XG5cdFx0XHRcdC8vIEVuYWJsZSB0aGUgY29udHJpYnV0aW9uIGJ5IHJlZ2lzdGVyaW5nIGl0XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9lbmFibGVDb250cmlidXRpb24oY29udHJpYnV0aW9uLCBleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5ld2x5RW5hYmxlZENoYXRTZXNzaW9uVHlwZXMuYWRkKGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG5ld2x5RW5hYmxlZENoYXRTZXNzaW9uVHlwZXMuc2l6ZSA+IDAgfHwgbmV3bHlEaXNhYmxlZENoYXRTZXNzaW9uVHlwZXMuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5LmZpcmUoKTtcblx0XHRcdGZvciAoY29uc3QgY2hhdFNlc3Npb25UeXBlIG9mIFsuLi5uZXdseUVuYWJsZWRDaGF0U2Vzc2lvblR5cGVzLCAuLi5uZXdseURpc2FibGVkQ2hhdFNlc3Npb25UeXBlc10pIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtc1Byb3ZpZGVycy5maXJlKHsgY2hhdFNlc3Npb25UeXBlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlzcG9zZWRDaGF0U2Vzc2lvbnMuc2l6ZSA+IDApIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uSXRlbXMuZmlyZSh7IHJlbW92ZWQ6IEFycmF5LmZyb20oZGlzcG9zZWRDaGF0U2Vzc2lvbnMpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVIYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0NvbnRleHRLZXkoKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuYWJsZUNvbnRyaWJ1dGlvbihjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgZXh0OiBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIF9lbmFibGVDb250cmlidXRpb246IHR5cGU9JyR7Y29udHJpYnV0aW9uLnR5cGV9JywgY2FuRGVsZWdhdGU9JHtjb250cmlidXRpb24uY2FuRGVsZWdhdGV9YCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbkRpc3Bvc2FibGVzLnNldChjb250cmlidXRpb24udHlwZSwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRpZiAoY29udHJpYnV0aW9uLmNhbkRlbGVnYXRlKSB7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX3JlZ2lzdGVyQWdlbnQoY29udHJpYnV0aW9uLCBleHQpKTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fcmVnaXN0ZXJDb21tYW5kcyhjb250cmlidXRpb24pKTtcblx0XHR9XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9yZWdpc3Rlck1lbnVJdGVtcyhjb250cmlidXRpb24sIGV4dCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2VzIG9mIGFsbCBzZXNzaW9ucyB0aGF0IGJlbG9uZyB0byBhIGNvbnRyaWJ1dGlvblxuXHQgKlxuXHQgKiBAcmV0dXJucyBMaXN0IG9mIHNlc3Npb24gcmVzb3VyY2VzIHRoYXQgd2VyZSBkaXNwb3NlZC5cblx0ICovXG5cdHByaXZhdGUgX2Rpc3Bvc2VTZXNzaW9uc0ZvckNvbnRyaWJ1dGlvbihjb250cmlidXRpb25JZDogc3RyaW5nKTogVVJJW10ge1xuXHRcdC8vIEZpbmQgYW5kIGRpc3Bvc2UgYWxsIHNlc3Npb25zIHRoYXQgYmVsb25nIHRvIHRoaXMgY29udHJpYnV0aW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbnNUb0Rpc3Bvc2U6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uRGF0YV0gb2YgdGhpcy5fc2Vzc2lvbnMpIHtcblx0XHRcdGlmIChzZXNzaW9uRGF0YS5jaGF0U2Vzc2lvblR5cGUgPT09IGNvbnRyaWJ1dGlvbklkKSB7XG5cdFx0XHRcdHNlc3Npb25zVG9EaXNwb3NlLnB1c2goc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbnNUb0Rpc3Bvc2UubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBEaXNwb3NpbmcgJHtzZXNzaW9uc1RvRGlzcG9zZS5sZW5ndGh9IGNhY2hlZCBzZXNzaW9ucyBmb3IgY29udHJpYnV0aW9uICcke2NvbnRyaWJ1dGlvbklkfScgZHVlIHRvIHdoZW4gY2xhdXNlIGNoYW5nZWApO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbktleSBvZiBzZXNzaW9uc1RvRGlzcG9zZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbktleSk7XG5cdFx0XHRpZiAoc2Vzc2lvbkRhdGEpIHtcblx0XHRcdFx0c2Vzc2lvbkRhdGEuZGlzcG9zZSgpOyAvLyBUaGlzIHdpbGwgY2FsbCBfb25XaWxsRGlzcG9zZVNlc3Npb24gYW5kIGNsZWFuIHVwXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uc1RvRGlzcG9zZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQWdlbnQoY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQsIGV4dDogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZWRJY29uID0gdGhpcy5nZXRDb250cmlidXRpb25JY29uKGV4dCwgY29udHJpYnV0aW9uKTtcblx0XHRjb25zdCBpY29ucyA9IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihzdG9yZWRJY29uKVxuXHRcdFx0PyB7IHRoZW1lSWNvbjogc3RvcmVkSWNvbiwgaWNvbjogdW5kZWZpbmVkLCBpY29uRGFyazogdW5kZWZpbmVkIH1cblx0XHRcdDogc3RvcmVkSWNvblxuXHRcdFx0XHQ/IHsgaWNvbjogc3RvcmVkSWNvbi5saWdodCwgaWNvbkRhcms6IHN0b3JlZEljb24uZGFyayB9XG5cdFx0XHRcdDogeyB0aGVtZUljb246IENvZGljb24uc2VuZFRvUmVtb3RlQWdlbnQgfTtcblxuXHRcdGNvbnN0IGlkID0gY29udHJpYnV0aW9uLnR5cGU7XG5cdFx0Y29uc3QgYWdlbnREYXRhOiBJQ2hhdEFnZW50RGF0YSA9IHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZTogY29udHJpYnV0aW9uLm5hbWUsXG5cdFx0XHRmdWxsTmFtZTogY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdGlzRGVmYXVsdDogZmFsc2UsXG5cdFx0XHRpc0NvcmU6IGZhbHNlLFxuXHRcdFx0aXNEeW5hbWljOiB0cnVlLFxuXHRcdFx0c2xhc2hDb21tYW5kczogY29udHJpYnV0aW9uLmNvbW1hbmRzID8/IFtdLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRtb2RlczogW0NoYXRNb2RlS2luZC5BZ2VudCwgQ2hhdE1vZGVLaW5kLkFza10sXG5cdFx0XHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHQuLi5pY29ucyxcblx0XHRcdH0sXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnRyaWJ1dGlvbi5jYXBhYmlsaXRpZXMsXG5cdFx0XHRjYW5BY2Nlc3NQcmV2aW91c0NoYXRIaXN0b3J5OiB0cnVlLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dC5pZGVudGlmaWVyLFxuXHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogZXh0LnZlcnNpb24sXG5cdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogZXh0LmRpc3BsYXlOYW1lIHx8IGV4dC5uYW1lLFxuXHRcdFx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6IGV4dC5wdWJsaXNoZXIsXG5cdFx0fTtcblxuXHRcdHJldHVybiB0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoaWQsIGFnZW50RGF0YSk7XG5cdH1cblxuXHRnZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKTogUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludFtdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9jb250cmlidXRpb25zLnZhbHVlcygpKVxuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiB0aGlzLl9pc0NvbnRyaWJ1dGlvbkF2YWlsYWJsZShlbnRyeS5jb250cmlidXRpb24pKVxuXHRcdFx0Lm1hcChlbnRyeSA9PiB0aGlzLnJlc29sdmVDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihlbnRyeS5leHRlbnNpb24sIGVudHJ5LmNvbnRyaWJ1dGlvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGFzQ2FuRGVsZWdhdGVQcm92aWRlcnNDb250ZXh0S2V5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc0NhbkRlbGVnYXRlID0gdGhpcy5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKS5maWx0ZXIoYyA9PiBjLmNhbkRlbGVnYXRlKTtcblx0XHRjb25zdCBjYW5EZWxlZ2F0ZUVuYWJsZWQgPSBoYXNDYW5EZWxlZ2F0ZS5sZW5ndGggPiAwO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDaGF0U2Vzc2lvbnNTZXJ2aWNlXSBoYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0F2YWlsYWJsZT0ke2NhbkRlbGVnYXRlRW5hYmxlZH0gKCR7aGFzQ2FuRGVsZWdhdGUubWFwKGMgPT4gYy50eXBlKS5qb2luKCcsICcpfSlgKTtcblx0XHR0aGlzLl9oYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0tleS5zZXQoY2FuRGVsZWdhdGVFbmFibGVkKTtcblx0fVxuXG5cdGdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9jb250cmlidXRpb25zLmdldChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc0NvbnRyaWJ1dGlvbkF2YWlsYWJsZShlbnRyeS5jb250cmlidXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihlbnRyeS5leHRlbnNpb24sIGVudHJ5LmNvbnRyaWJ1dGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihleHQ6IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQsIGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50KSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbnRyaWJ1dGlvbixcblx0XHRcdGljb246IHRoaXMucmVzb2x2ZUljb25Gb3JDdXJyZW50Q29sb3JUaGVtZSh0aGlzLmdldENvbnRyaWJ1dGlvbkljb24oZXh0LCBjb250cmlidXRpb24pKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250cmlidXRpb25JY29uKGV4dDogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCwgY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpOiBUaGVtZUljb24gfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWNvbnRyaWJ1dGlvbi5pY29uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGNvbnRyaWJ1dGlvbi5pY29uID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGNvbnRyaWJ1dGlvbi5pY29uLnN0YXJ0c1dpdGgoJyQoJykgJiYgY29udHJpYnV0aW9uLmljb24uZW5kc1dpdGgoJyknKVxuXHRcdFx0XHQ/IFRoZW1lSWNvbi5mcm9tU3RyaW5nKGNvbnRyaWJ1dGlvbi5pY29uKVxuXHRcdFx0XHQ6IFRoZW1lSWNvbi5mcm9tSWQoY29udHJpYnV0aW9uLmljb24pO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGFyazogZXh0ID8gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dC5leHRlbnNpb25Mb2NhdGlvbiwgY29udHJpYnV0aW9uLmljb24uZGFyaykgOiBVUkkucGFyc2UoY29udHJpYnV0aW9uLmljb24uZGFyayksXG5cdFx0XHRsaWdodDogZXh0ID8gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dC5leHRlbnNpb25Mb2NhdGlvbiwgY29udHJpYnV0aW9uLmljb24ubGlnaHQpIDogVVJJLnBhcnNlKGNvbnRyaWJ1dGlvbi5pY29uLmxpZ2h0KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVJY29uRm9yQ3VycmVudENvbG9yVGhlbWUocmF3SWNvbjogVGhlbWVJY29uIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICghcmF3SWNvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKHJhd0ljb24pKSB7XG5cdFx0XHRyZXR1cm4gcmF3SWNvbjtcblx0XHR9IGVsc2UgaWYgKGlzRGFyayh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gcmF3SWNvbi5kYXJrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gcmF3SWNvbi5saWdodDtcblx0XHR9XG5cdH1cblxuXG5cdHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2NvbnRyaWJ1dGlvbnMuaGFzKGNvbnRyaWJ1dGlvbi50eXBlKSkge1xuXHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucy5zZXQoY29udHJpYnV0aW9uLnR5cGUsIHsgY29udHJpYnV0aW9uLCBleHRlbnNpb246IHVuZGVmaW5lZCB9KTtcblx0XHRpZiAoY29udHJpYnV0aW9uLmFsdGVybmF0aXZlSWRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFsdGVybmF0aXZlSWQgb2YgY29udHJpYnV0aW9uLmFsdGVybmF0aXZlSWRzKSB7XG5cdFx0XHRcdHRoaXMuX2FsdGVybmF0aXZlSWRNYXAuc2V0KGFsdGVybmF0aXZlSWQsIGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gUHJvZ3JhbW1hdGljYWxseS1yZWdpc3RlcmVkIGNvbnRyaWJ1dGlvbnMgYXJlIGFsd2F5cyBjb25zaWRlcmVkXG5cdFx0Ly8gYXZhaWxhYmxlOyBtYXJrIHRoZW0gYXMgc3VjaCBzbyB0aGUgYXV0b3J1biBpbiB0aGUgY29uc3RydWN0b3Jcblx0XHQvLyByZWdpc3RlcnMgdGhlIGluLXBsYWNlIFwiTmV3IHswfSBTZXNzaW9uXCIgYWN0aW9uIGZvciB0aGVtLiBXaXRob3V0XG5cdFx0Ly8gdGhpcywgdHlwZXMgbGlrZSBgYWdlbnQtaG9zdC1jb3BpbG90Y2xpYCAocmVnaXN0ZXJlZCBieSB0aGUgbG9jYWxcblx0XHQvLyBhZ2VudCBob3N0KSBoYXZlIG5vIGBvcGVuTmV3Q2hhdFNlc3Npb25JblBsYWNlLjx0eXBlPmAgY29tbWFuZC5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9jb250cmlidXRpb25EaXNwb3NhYmxlcy5zZXQoY29udHJpYnV0aW9uLnR5cGUsIGRpc3Bvc2FibGVzKTtcblx0XHQvLyBBIHByb2dyYW1tYXRpYyBjb250cmlidXRpb24gY2FuIGRlcml2ZSBpdHMgYXZhaWxhYmlsaXR5IChlLmcuIGEgZnVuY3Rpb25hbFxuXHRcdC8vIGByZXF1aXJlc0NvcGlsb3RTaWduSW5gKSBhbmQgc2lnbmFsIHdoZW4gaXQgY2hhbmdlczsgcmUtZmlyZSB0aGUgYWdncmVnYXRlXG5cdFx0Ly8gYXZhaWxhYmlsaXR5IGV2ZW50IHNvIGNvbnN1bWVycyByZS1ldmFsdWF0ZS4gR2VuZXJpYyBcdTIwMTQgbm8gcGVyLXByb3ZpZGVyXG5cdFx0Ly8ga25vd2xlZGdlIGxpdmVzIGhlcmUuXG5cdFx0aWYgKGNvbnRyaWJ1dGlvbi5vbkRpZENoYW5nZVJlcXVpcmVzQ29waWxvdFNpZ25Jbikge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyaWJ1dGlvbi5vbkRpZENoYW5nZVJlcXVpcmVzQ29waWxvdFNpZ25JbigoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUF2YWlsYWJpbGl0eS5maXJlKCkpKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlSGFzQ2FuRGVsZWdhdGVQcm92aWRlcnNDb250ZXh0S2V5KCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250cmlidXRpb25zLmRlbGV0ZShjb250cmlidXRpb24udHlwZSk7XG5cdFx0XHRpZiAoY29udHJpYnV0aW9uLmFsdGVybmF0aXZlSWRzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWx0ZXJuYXRpdmVJZCBvZiBjb250cmlidXRpb24uYWx0ZXJuYXRpdmVJZHMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5nZXQoYWx0ZXJuYXRpdmVJZCkgPT09IGNvbnRyaWJ1dGlvbi50eXBlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hbHRlcm5hdGl2ZUlkTWFwLmRlbGV0ZShhbHRlcm5hdGl2ZUlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbnRyaWJ1dGlvbkRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdFx0dGhpcy5fdXBkYXRlSGFzQ2FuRGVsZWdhdGVQcm92aWRlcnNDb250ZXh0S2V5KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF2YWlsYWJpbGl0eS5maXJlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBhY3RpdmF0ZUNoYXRTZXNzaW9uSXRlbVByb3ZpZGVyKGNoYXRWaWV3VHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5kb0FjdGl2YXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0Vmlld1R5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0FjdGl2YXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0Vmlld1R5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoY2hhdFZpZXdUeXBlKTtcblx0XHRpZiAocmVzb2x2ZWRUeXBlKSB7XG5cdFx0XHRjaGF0Vmlld1R5cGUgPSByZXNvbHZlZFR5cGU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc0NvbnRyaWJ1dGlvbkF2YWlsYWJsZUZvclR5cGUoY2hhdFZpZXdUeXBlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pdGVtQ29udHJvbGxlcnMuaGFzKGNoYXRWaWV3VHlwZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkNoYXRTZXNzaW9uOiR7Y2hhdFZpZXdUeXBlfWApO1xuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuX2l0ZW1Db250cm9sbGVycy5nZXQoY2hhdFZpZXdUeXBlKSE7XG5cdFx0cmV0dXJuICEhY29udHJvbGxlcjtcblx0fVxuXG5cdGFzeW5jIGNhblJlc29sdmVDaGF0U2Vzc2lvbihzZXNzaW9uVHlwZTogc3RyaW5nKSB7XG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRpZiAoIXRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlRm9yVHlwZShzZXNzaW9uVHlwZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29udGVudFByb3ZpZGVycy5oYXMoc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBhc3luY0FjdGl2YXRvcnMgPSB0aGlzLl9hc3luY0FjdGl2YXRpb25SZWdpc3RyeS5nZXRBY3RpdmF0b3JzKHNlc3Npb25UeXBlKTtcblx0XHRpZiAoYXN5bmNBY3RpdmF0b3JzLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBhY3RpdmF0b3Igb2YgYXN5bmNBY3RpdmF0b3JzKSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY3RpdmF0b3Iud2FpdEZvckFjdGl2YXRpb24oYWNjZXNzb3IsIHNlc3Npb25UeXBlKSkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLndhaXRGb3JDb250ZW50UHJvdmlkZXIoc2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jb250ZW50UHJvdmlkZXJzLmhhcyhzZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkNoYXRTZXNzaW9uOiR7c2Vzc2lvblR5cGV9YCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuaGFzKHNlc3Npb25UeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2FpdEZvckNvbnRlbnRQcm92aWRlcihzZXNzaW9uVHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuaGFzKHNlc3Npb25UeXBlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIodGhpcy5vbkRpZENoYW5nZUNvbnRlbnRQcm92aWRlclNjaGVtZXMsIGUgPT4gZS5hZGRlZC5pbmNsdWRlcyhzZXNzaW9uVHlwZSkpKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9ucyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcGFyYW1zOiBJQ2hhdElucHV0Q29tcGxldGlvbnNQYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRJbnB1dENvbXBsZXRpb25zUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXNvbHZlZFR5cGUgPSB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShzZXNzaW9uVHlwZSkgfHwgc2Vzc2lvblR5cGU7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb250ZW50UHJvdmlkZXJzLmdldChyZXNvbHZlZFR5cGUpO1xuXHRcdGlmICghcHJvdmlkZXI/LnByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9ucyhzZXNzaW9uUmVzb3VyY2UsIHBhcmFtcywgdG9rZW4pO1xuXHR9XG5cblx0cmVzb2x2ZUNoYXRSZXNwb25zZVVyaShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaHJlZjogc3RyaW5nLCBraW5kOiAnbGluaycgfCAnaW1hZ2UnKTogc3RyaW5nIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlc29sdmVkVHlwZSA9IHRoaXMuX3Jlc29sdmVUb1ByaW1hcnlUeXBlKHNlc3Npb25UeXBlKSB8fCBzZXNzaW9uVHlwZTtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudFByb3ZpZGVycy5nZXQocmVzb2x2ZWRUeXBlKT8ucmVzb2x2ZUNoYXRSZXNwb25zZVVyaT8uKHNlc3Npb25SZXNvdXJjZSwgaHJlZiwga2luZCkgPz8gaHJlZjtcblx0fVxuXG5cdGFzeW5jIGdldENoYXRJbnB1dENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyhzZXNzaW9uVHlwZTogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkVHlwZSA9IHRoaXMuX3Jlc29sdmVUb1ByaW1hcnlUeXBlKHNlc3Npb25UeXBlKSB8fCBzZXNzaW9uVHlwZTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuZ2V0KHJlc29sdmVkVHlwZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFwcm92aWRlci5wcm92aWRlQ2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlQ2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyeUFjdGl2YXRlQ29udHJvbGxlcnMocHJvdmlkZXJzVG9SZXNvbHZlOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCkubWFwKGFzeW5jIChjb250cmliKSA9PiB7XG5cdFx0XHRpZiAocHJvdmlkZXJzVG9SZXNvbHZlICYmICFwcm92aWRlcnNUb1Jlc29sdmUuaW5jbHVkZXMoY29udHJpYi50eXBlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNraXA6IG5vdCBjb25zaWRlcmVkIGZvciByZXNvbHZpbmdcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLmRvQWN0aXZhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyaWIudHlwZSkpIHtcblx0XHRcdFx0Ly8gV2UgcmVxdWVzdGVkIHRoaXMgcHJvdmlkZXIgYnV0IGl0IGlzIG5vdCBhdmFpbGFibGVcblx0XHRcdFx0aWYgKHByb3ZpZGVyc1RvUmVzb2x2ZT8uaW5jbHVkZXMoY29udHJpYi50eXBlKSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDaGF0U2Vzc2lvbnNTZXJ2aWNlXSBObyBlbmFibGVkIHByb3ZpZGVyIGZvdW5kIGZvciBjaGF0IHNlc3Npb24gdHlwZSAke2NvbnRyaWIudHlwZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGF0U2Vzc2lvbkl0ZW1zKHByb3ZpZGVyc1RvUmVzb2x2ZTogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IEFzeW5jSXRlcmFibGU8eyByZWFkb25seSBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZzsgcmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSB9PiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIoYXN5bmMgd3JpdGVyID0+IHtcblx0XHRcdC8vIEZpcnN0LCBtYWtlIHN1cmUgY29udHJpYnV0ZWQgY29udHJvbGxlciBhcmUgYWN0aXZlXG5cdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IodGhpcy50cnlBY3RpdmF0ZUNvbnRyb2xsZXJzKHByb3ZpZGVyc1RvUmVzb2x2ZSksIHRva2VuKTtcblxuXHRcdFx0Ly8gVGhlbiBhY3R1YWxseSByZXNvbHZlIGl0ZW1zIGZvciBhbGwgYWN0aXZlIGNvbnRyb2xsZXJzXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKHRoaXMuX2l0ZW1Db250cm9sbGVycywgYXN5bmMgKFtjaGF0U2Vzc2lvblR5cGUsIGNvbnRyb2xsZXJFbnRyeV0pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoY2hhdFNlc3Npb25UeXBlKSA/PyBjaGF0U2Vzc2lvblR5cGU7XG5cdFx0XHRcdGlmIChwcm92aWRlcnNUb1Jlc29sdmUgJiYgIXByb3ZpZGVyc1RvUmVzb2x2ZS5pbmNsdWRlcyhyZXNvbHZlZFR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBza2lwOiBub3QgY29uc2lkZXJlZCBmb3IgcmVzb2x2aW5nXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTa2lwIGNvbnRyb2xsZXJzIHdob3NlIGNvbnRyaWJ1dGlvbiBpcyBnYXRlZCBvZmYgYnkgaXRzIGB3aGVuYFxuXHRcdFx0XHQvLyBjbGF1c2UuIFRoZSBpdGVtIGNvbnRyb2xsZXIgaXMgcmVnaXN0ZXJlZCBpbmRlcGVuZGVudGx5IG9mIHRoZVxuXHRcdFx0XHQvLyBjb250cmlidXRpb24gKGUuZy4gYnkgdGhlIGV4dGVuc2lvbiBob3N0KSwgc28gd2l0aG91dCB0aGlzIGNoZWNrXG5cdFx0XHRcdC8vIGl0cyBzZXNzaW9ucyB3b3VsZCBzdGlsbCBiZSBsaXN0ZWQgZXZlbiB0aG91Z2ggdGhleSBjYW4gbm8gbG9uZ2VyXG5cdFx0XHRcdC8vIGJlIHJlc29sdmVkL29wZW5lZCAod2hpY2ggb2JleXMgdGhlIHNhbWUgYHdoZW5gIHZpYSBjYW5SZXNvbHZlQ2hhdFNlc3Npb24pLlxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlRm9yVHlwZShjaGF0U2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBza2lwOiBjb250cmlidXRpb24gZGlzYWJsZWQgYnkgaXRzIGB3aGVuYCBjbGF1c2Vcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKGNvbnRyb2xsZXJFbnRyeS5pbml0aWFsUmVmcmVzaCwgdG9rZW4pOyAvLyBFbnN1cmUgaW5pdGlhbCByZWZyZXNoIGlzIGNvbXBsZXRlIGJlZm9yZSBhY2Nlc3NpbmcgaXRlbXNcblxuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyU2Vzc2lvbnMgPSBjb250cm9sbGVyRW50cnkuY29udHJvbGxlci5pdGVtcztcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gUmVzb2x2ZWQgJHtwcm92aWRlclNlc3Npb25zLmxlbmd0aH0gc2Vzc2lvbnMgZm9yIHByb3ZpZGVyICR7cmVzb2x2ZWRUeXBlfWApO1xuXHRcdFx0XHRcdHdyaXRlci5lbWl0T25lKHsgY2hhdFNlc3Npb25UeXBlOiByZXNvbHZlZFR5cGUsIGl0ZW1zOiBwcm92aWRlclNlc3Npb25zIH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdFx0Ly8gTG9nIGVycm9yIGJ1dCBjb250aW51ZSB3aXRoIG90aGVyIHByb3ZpZGVyc1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIEZhaWxlZCB0byByZXNvbHZlIHNlc3Npb25zIGZvciBwcm92aWRlciAke3Jlc29sdmVkVHlwZX1gLCBlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlZnJlc2hDaGF0U2Vzc2lvbkl0ZW1zKHByb3ZpZGVyc1RvUmVzb2x2ZTogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMudHJ5QWN0aXZhdGVDb250cm9sbGVycyhwcm92aWRlcnNUb1Jlc29sdmUpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbSh0aGlzLl9pdGVtQ29udHJvbGxlcnMpLm1hcChhc3luYyAoW2NoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlckVudHJ5XSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoY2hhdFNlc3Npb25UeXBlKSA/PyBjaGF0U2Vzc2lvblR5cGU7XG5cdFx0XHRpZiAocHJvdmlkZXJzVG9SZXNvbHZlICYmICFwcm92aWRlcnNUb1Jlc29sdmUuaW5jbHVkZXMocmVzb2x2ZWRUeXBlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNraXA6IG5vdCBjb25zaWRlcmVkIGZvciByZXNvbHZpbmdcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY29udHJvbGxlckVudHJ5LmNvbnRyb2xsZXIucmVmcmVzaCh0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0XHQvLyBMb2cgZXJyb3IgYnV0IGNvbnRpbnVlIHdpdGggb3RoZXIgcHJvdmlkZXJzXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIEZhaWxlZCB0byByZXNvbHZlIHNlc3Npb25zIGZvciBwcm92aWRlciAke3Jlc29sdmVkVHlwZX1gLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0UmVnaXN0ZXJlZENoYXRTZXNzaW9uSXRlbVByb3ZpZGVycygpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFsuLi5uZXcgU2V0KEFycmF5LmZyb20odGhpcy5faXRlbUNvbnRyb2xsZXJzLmtleXMoKSkubWFwKGtleSA9PiB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShrZXkpID8/IGtleSkpXTtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgY29udHJvbGxlcjogSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblxuXHRcdC8vIFJlZ2lzdGVyIGFuZCB0cmlnZ2VyIGFuIGluaXRpYWwgcmVmcmVzaCB0byBwb3B1bGF0ZSB0aGUgcHJvdmlkZXIncyBpdGVtc1xuXHRcdGNvbnN0IGluaXRpYWxSZWZyZXNoQ3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHR0aGlzLl9pdGVtQ29udHJvbGxlcnMuc2V0KGNoYXRTZXNzaW9uVHlwZSwgeyBjb250cm9sbGVyLCBpbml0aWFsUmVmcmVzaDogY29udHJvbGxlci5yZWZyZXNoKGluaXRpYWxSZWZyZXNoQ3RzLnRva2VuKSB9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzLmZpcmUoeyBjaGF0U2Vzc2lvblR5cGUgfSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25JdGVtcy5maXJlKGUpO1xuXHRcdFx0dGhpcy51cGRhdGVJblByb2dyZXNzU3RhdHVzKGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aW5pdGlhbFJlZnJlc2hDdHMuY2FuY2VsKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5faXRlbUNvbnRyb2xsZXJzLmdldChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHRoaXMuX2l0ZW1Db250cm9sbGVycy5kZWxldGUoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzLmZpcmUoeyBjaGF0U2Vzc2lvblR5cGUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZW1vdmUgYW55IGluLXByb2dyZXNzIHRyYWNraW5nIGZvciB0aGlzIHByb3ZpZGVyIHNpbmNlIGl0J3Mgbm8gbG9uZ2VyIGF2YWlsYWJsZVxuXHRcdFx0XHR0aGlzLnVwZGF0ZUluUHJvZ3Jlc3NTdGF0dXMoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcHJvdmlkZXI6IElDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fY29udGVudFByb3ZpZGVycy5oYXMoY2hhdFNlc3Npb25UeXBlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb250ZW50IHByb3ZpZGVyIGZvciAke2NoYXRTZXNzaW9uVHlwZX0gaXMgYWxyZWFkeSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuc2V0KGNoYXRTZXNzaW9uVHlwZSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudFByb3ZpZGVyU2NoZW1lcy5maXJlKHsgYWRkZWQ6IFtjaGF0U2Vzc2lvblR5cGVdLCByZW1vdmVkOiBbXSB9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuZGVsZXRlKGNoYXRTZXNzaW9uVHlwZSk7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtjaGF0U2Vzc2lvblR5cGVdIH0pO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSBhbGwgc2Vzc2lvbnMgdGhhdCB3ZXJlIGNyZWF0ZWQgYnkgdGhpcyBwcm92aWRlclxuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHNlc3Npb25dIG9mIHRoaXMuX3Nlc3Npb25zKSB7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb24uY2hhdFNlc3Npb25UeXBlID09PSBjaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHJlZ2lzdGVyQ3VzdG9taXphdGlvbnNQcm92aWRlcihjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcHJvdmlkZXI6IElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvbnNQcm92aWRlcnMuc2V0KGNoYXRTZXNzaW9uVHlwZSwgcHJvdmlkZXIpO1xuXHRcdGNvbnN0IG9uQ2hhbmdlRGlzcG9zYWJsZSA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKHsgY2hhdFNlc3Npb25UeXBlIH0pO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0b25DaGFuZ2VEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdGlmICh0aGlzLl9jdXN0b21pemF0aW9uc1Byb3ZpZGVycy5nZXQoY2hhdFNlc3Npb25UeXBlKSA9PT0gcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5fY3VzdG9taXphdGlvbnNQcm92aWRlcnMuZGVsZXRlKGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRoYXNDdXN0b21pemF0aW9uc1Byb3ZpZGVyKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25zUHJvdmlkZXJzLmhhcyhjaGF0U2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q3VzdG9taXphdGlvbnMoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbkl0ZW1Hcm91cFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jdXN0b21pemF0aW9uc1Byb3ZpZGVycy5nZXQoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZUN1c3RvbWl6YXRpb25zKHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcmVxdWVzdDogSUNoYXROZXdTZXNzaW9uUmVxdWVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25JdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9pdGVtQ29udHJvbGxlcnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhd2FpdCBjb250cm9sbGVyRGF0YS5pbml0aWFsUmVmcmVzaDtcblx0XHRyZXR1cm4gY29udHJvbGxlckRhdGEuY29udHJvbGxlci5uZXdDaGF0U2Vzc2lvbkl0ZW0/LihyZXF1ZXN0LCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyBkZWxldGVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5fZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghY29udHJvbGxlckRhdGE/LmNvbnRyb2xsZXIuZGVsZXRlQ2hhdFNlc3Npb25JdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3Qgc3VwcG9ydCBkZWxldGlvbmApO1xuXHRcdH1cblxuXHRcdGF3YWl0IGNvbnRyb2xsZXJEYXRhLmluaXRpYWxSZWZyZXNoO1xuXHRcdHJldHVybiBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLmRlbGV0ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlc29sdmVkVHlwZSA9IHRoaXMuX3Jlc29sdmVUb1ByaW1hcnlUeXBlKHNlc3Npb25UeXBlKSA/PyBzZXNzaW9uVHlwZTtcblx0XHRyZXR1cm4gdGhpcy5faXRlbUNvbnRyb2xsZXJzLmdldChyZXNvbHZlZFR5cGUpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldE9yQ3JlYXRlQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRTZXNzaW9uPiB7XG5cdFx0e1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdTZXNzaW9uRGF0YSA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGV4aXN0aW5nU2Vzc2lvbkRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nU2Vzc2lvbkRhdGEuc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghKGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcih0aGlzLmNhblJlc29sdmVDaGF0U2Vzc2lvbihzZXNzaW9uVHlwZSksIHRva2VuKSkpIHtcblx0XHRcdHRocm93IEVycm9yKGBDYW5ub3QgZmluZCBwcm92aWRlciAnJHtzZXNzaW9uVHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgYWdhaW4gYWZ0ZXIgYXN5bmMgcHJvdmlkZXIgcmVzb2x1dGlvblxuXHRcdHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbkRhdGEgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChleGlzdGluZ1Nlc3Npb25EYXRhKSB7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ1Nlc3Npb25EYXRhLnNlc3Npb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoc2Vzc2lvblR5cGUpIHx8IHNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29udGVudFByb3ZpZGVycy5nZXQocmVzb2x2ZWRUeXBlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBFcnJvcihgQ2Fubm90IGZpbmQgcHJvdmlkZXIgJyR7cmVzb2x2ZWRUeXBlfSdgKTtcblx0XHR9XG5cblx0XHRsZXQgc2Vzc2lvbjogSUNoYXRTZXNzaW9uO1xuXHRcdGNvbnN0IG5ld1Nlc3Npb25PcHRpb25Hcm91cHMgPSBpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSA/IGF3YWl0IHRoaXMuZ2V0TmV3Q2hhdFNlc3Npb25JbnB1dFN0YXRlKHJlc29sdmVkVHlwZSwgc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgJiYgKG5ld1Nlc3Npb25PcHRpb25Hcm91cHMgfHwgcmVzb2x2ZWRUeXBlLnN0YXJ0c1dpdGgoJ2FnZW50LWhvc3QtJykpKSB7XG5cdFx0XHRjb25zdCBvcHRpb25zOiBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIG5ld1Nlc3Npb25PcHRpb25Hcm91cHMgPz8gW10pIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBncm91cC5zZWxlY3RlZCA/PyBncm91cC5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5kZWZhdWx0KSA/PyBncm91cC5pdGVtc1swXTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5zZXQoZ3JvdXAuaWQsIHNlbGVjdGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvbiA9IHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0XHRvcHRpb25zOiBvcHRpb25zLnNpemUgPiAwID8gb3B0aW9ucyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXNzaW9uID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCB0b2tlbiksIHRva2VuKTtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbi5vcHRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtvcHRpb25JZCwgdmFsdWVdIG9mIHNlc3Npb24ub3B0aW9ucykge1xuXHRcdFx0XHR0aGlzLnNldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25JZCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSBhbm90aGVyIHNlc3Npb24gd2Fzbid0IGNyZWF0ZWQgd2hpbGUgd2Ugd2VyZSBhd2FpdGluZyB0aGUgcHJvdmlkZXJcblx0XHR7XG5cdFx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb25EYXRhID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdTZXNzaW9uRGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gZXhpc3RpbmdTZXNzaW9uRGF0YS5zZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25EYXRhID0gbmV3IENvbnRyaWJ1dGVkQ2hhdFNlc3Npb25EYXRhKHNlc3Npb24sIHNlc3Npb25UeXBlLCBzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb24ub3B0aW9ucywgcmVzb3VyY2UgPT4ge1xuXHRcdFx0c2Vzc2lvbkRhdGEuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25EYXRhKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSBhbnkgbGlzdGVuZXJzIGFyZSBhd2FyZSBvZiB0aGUgbmV3IHNlc3Npb24gYW5kIGl0cyBvcHRpb25zXG5cdFx0aWYgKHNlc3Npb24ub3B0aW9ucykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uT3B0aW9ucy5maXJlKHsgc2Vzc2lvblJlc291cmNlLCB1cGRhdGVzOiBzZXNzaW9uLm9wdGlvbnMgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0Q2hhdFNlc3Npb25IaXN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gWy4uLmV4aXN0aW5nLnNlc3Npb24uaGlzdG9yeV07XG5cdFx0fVxuXG5cdFx0aWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXNvbHZlZFR5cGUgPSB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShzZXNzaW9uVHlwZSkgfHwgc2Vzc2lvblR5cGU7XG5cdFx0aWYgKCEoYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuY2FuUmVzb2x2ZUNoYXRTZXNzaW9uKHJlc29sdmVkVHlwZSksIHRva2VuKSkpIHtcblx0XHRcdHRocm93IEVycm9yKGBDYW5ub3QgZmluZCBwcm92aWRlciAnJHtyZXNvbHZlZFR5cGV9J2ApO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuZ2V0KHJlc29sdmVkVHlwZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgRXJyb3IoYENhbm5vdCBmaW5kIHByb3ZpZGVyICcke3Jlc29sdmVkVHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pLCB0b2tlbik7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBbLi4uc2Vzc2lvbi5oaXN0b3J5XTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhc0FueVNlc3Npb25PcHRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0cmV0dXJuICEhc2Vzc2lvbiAmJiAhIXNlc3Npb24ub3B0aW9ucyAmJiBzZXNzaW9uLm9wdGlvbnMuc2l6ZSA+IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Vzc2lvbk9wdGlvbnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHRoaXMuX3Jlc29sdmVSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2Ygc2Vzc2lvbi5nZXRBbGxPcHRpb25zKCkpIHtcblx0XHRcdHJlc3VsdC5zZXQoa2V5LCB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB2YWx1ZS5pZCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQuc2l6ZSA+IDAgPyByZXN1bHQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgb3B0aW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0cmV0dXJuIHNlc3Npb24/LmdldE9wdGlvbihvcHRpb25JZCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgb3B0aW9uSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVNlc3Npb25PcHRpb25zKHNlc3Npb25SZXNvdXJjZSwgbmV3IE1hcChbW29wdGlvbklkLCB2YWx1ZV1dKSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlU2Vzc2lvbk9wdGlvbnMoc2Vzc2lvblJlc291cmNlOiBVUkksIHVwZGF0ZXM6IFJlYWRvbmx5Q2hhdFNlc3Npb25PcHRpb25zTWFwKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgW29wdGlvbklkLCB2YWx1ZV0gb2YgdXBkYXRlcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdWYWx1ZSA9IHNlc3Npb24uZ2V0T3B0aW9uKG9wdGlvbklkKTtcblx0XHRcdGlmIChleGlzdGluZ1ZhbHVlICE9PSB2YWx1ZSkge1xuXHRcdFx0XHRzZXNzaW9uLnNldE9wdGlvbihvcHRpb25JZCwgdmFsdWUpO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbk9wdGlvbnMuZmlyZSh7IHNlc3Npb25SZXNvdXJjZSwgdXBkYXRlczogdXBkYXRlcyB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpZENoYW5nZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIGEgcmVzb3VyY2UgdGhyb3VnaCB0aGUgYWxpYXMgbWFwLiBJZiB0aGUgcmVzb3VyY2UgaXMgYSByZWFsXG5cdCAqIHJlc291cmNlIHRoYXQgaGFzIGJlZW4gYWxpYXNlZCB0byBhbiB1bnRpdGxlZCByZXNvdXJjZSwgcmV0dXJuIHRoZVxuXHQgKiB1bnRpdGxlZCByZXNvdXJjZSAodGhlIGNhbm9uaWNhbCBrZXkgaW4ge0BsaW5rIF9zZXNzaW9uc30pLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVJlc291cmNlKHJlc291cmNlOiBVUkkpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZUFsaWFzZXMuZ2V0KHJlc291cmNlKSA/PyByZXNvdXJjZTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclNlc3Npb25SZXNvdXJjZUFsaWFzKHVudGl0bGVkUmVzb3VyY2U6IFVSSSwgcmVhbFJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNvdXJjZUFsaWFzZXMuc2V0KHJlYWxSZXNvdXJjZSwgdW50aXRsZWRSZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkUmVzb3VyY2U6IFVSSSwgcmVhbFJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWFsUmVzb3VyY2VzLnNldCh1bnRpdGxlZFJlc291cmNlLCByZWFsUmVzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIGdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZFJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZWFsUmVzb3VyY2VzLmdldCh1bnRpdGxlZFJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhck1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdC8vIERyb3AgdGhlIGZvcndhcmQgYHVudGl0bGVkIFx1MjE5MiByZWFsYCBtYXBwaW5nIGZvciB0aGUgZGlzcG9zZWQgc2Vzc2lvbixcblx0XHQvLyB3aGV0aGVyIGl0IHdhcyBwYXNzZWQgdGhlIHVudGl0bGVkIGtleSBvciB0aGUgcmVhbCB2YWx1ZS4gVGhlIGludmVyc2Vcblx0XHQvLyBgcmVhbCBcdTIxOTIgdW50aXRsZWRgIGFsaWFzIGlzIGludGVudGlvbmFsbHkgbGVmdCBpbiBwbGFjZSAoc2VlXG5cdFx0Ly8gYHJlZ2lzdGVyU2Vzc2lvblJlc291cmNlQWxpYXNgKSwgc28gdGhpcyBkb2VzIG5vdCB0b3VjaCBgX3Jlc291cmNlQWxpYXNlc2AuXG5cdFx0dGhpcy5fcmVhbFJlc291cmNlcy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IHRoaXMuX3Jlc291cmNlQWxpYXNlcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAodW50aXRsZWQpIHtcblx0XHRcdHRoaXMuX3JlYWxSZXNvdXJjZXMuZGVsZXRlKHVudGl0bGVkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZmlyZVNlc3Npb25Db21taXR0ZWQob3JpZ2luYWw6IFVSSSwgY29tbWl0dGVkOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENvbW1pdFNlc3Npb24uZmlyZSh7IG9yaWdpbmFsLCBjb21taXR0ZWQgfSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcmUgb3B0aW9uIGdyb3VwcyBmb3IgYSBzZXNzaW9uIHR5cGVcblx0ICovXG5cdHB1YmxpYyBzZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgaGFuZGxlOiBudW1iZXIsIG9wdGlvbkdyb3Vwcz86IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25Hcm91cHMpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25UeXBlT3B0aW9ucy5zZXQoY2hhdFNlc3Npb25UeXBlLCBvcHRpb25Hcm91cHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVHlwZU9wdGlvbnMuZGVsZXRlKGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzLmZpcmUoY2hhdFNlc3Npb25UeXBlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYXZhaWxhYmxlIG9wdGlvbiBncm91cHMgZm9yIGEgc2Vzc2lvbiB0eXBlXG5cdCAqL1xuXHRwdWJsaWMgZ2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uVHlwZU9wdGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0TmV3Q2hhdFNlc3Npb25JbnB1dFN0YXRlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9pdGVtQ29udHJvbGxlcnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0aWYgKGNvbnRyb2xsZXJEYXRhPy5jb250cm9sbGVyLmdldE5ld0NoYXRTZXNzaW9uSW5wdXRTdGF0ZSkge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gYXdhaXQgY29udHJvbGxlckRhdGEuY29udHJvbGxlci5nZXROZXdDaGF0U2Vzc2lvbklucHV0U3RhdGUoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChncm91cHM/Lmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uVHlwZU9wdGlvbnMuc2V0KGNoYXRTZXNzaW9uVHlwZSwgWy4uLmdyb3Vwc10pO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU9wdGlvbkdyb3Vwcy5maXJlKGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZ3JvdXBzO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuX3Nlc3Npb25UeXBlT3B0aW9ucy5nZXQoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRpZiAoIWdyb3Vwcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZ3JvdXBzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgY2FwYWJpbGl0aWVzIGZvciBhIHNwZWNpZmljIHNlc3Npb24gdHlwZVxuXHQgKi9cblx0cHVibGljIGdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogSUNoYXRBZ2VudEF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk/LmNvbnRyaWJ1dGlvbjtcblx0XHRyZXR1cm4gY29udHJpYnV0aW9uPy5jYXBhYmlsaXRpZXM7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXN0b21BZ2VudFRhcmdldCBmb3IgYSBzcGVjaWZpYyBzZXNzaW9uIHR5cGUuXG5cdCAqIFdoZW4gc2V0LCB0aGUgbW9kZSBwaWNrZXIgc2hvdWxkIHNob3cgZmlsdGVyZWQgY3VzdG9tIGFnZW50cyBtYXRjaGluZyB0aGlzIHRhcmdldC5cblx0ICovXG5cdHB1YmxpYyBnZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogVGFyZ2V0IHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jb250cmlidXRpb25zLmdldChjaGF0U2Vzc2lvblR5cGUpPy5jb250cmlidXRpb247XG5cdFx0cmV0dXJuIGNvbnRyaWJ1dGlvbj8uY3VzdG9tQWdlbnRUYXJnZXQgPz8gVGFyZ2V0LlVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyByZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoY2hhdFNlc3Npb25UeXBlKT8uY29udHJpYnV0aW9uO1xuXHRcdHJldHVybiAhIWNvbnRyaWJ1dGlvbj8ucmVxdWlyZXNDdXN0b21Nb2RlbHM7XG5cdH1cblxuXHRwdWJsaWMgc3VwcG9ydHNBdXRvTW9kZWxGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdC8vIFRoZSBidWlsdC1pbiBsb2NhbCBjaGF0IGlzIG5vdCBhIHJlZ2lzdGVyZWQgY29udHJpYnV0aW9uIGJ1dCBhbHdheXNcblx0XHQvLyBzdXBwb3J0cyB0aGUgc3ludGhldGljIFwiQXV0b1wiIG1vZGVsIGZhbGxiYWNrLlxuXHRcdGlmIChjaGF0U2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoY2hhdFNlc3Npb25UeXBlKT8uY29udHJpYnV0aW9uO1xuXHRcdHJldHVybiAhIWNvbnRyaWJ1dGlvbj8uc3VwcG9ydHNBdXRvTW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgc3VwcG9ydHNEZWxlZ2F0aW9uRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jb250cmlidXRpb25zLmdldChjaGF0U2Vzc2lvblR5cGUpPy5jb250cmlidXRpb247XG5cdFx0cmV0dXJuIGNvbnRyaWJ1dGlvbj8uc3VwcG9ydHNEZWxlZ2F0aW9uICE9PSBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZXF1aXJlc0NvcGlsb3RTaWduSW5Gb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk/LmNvbnRyaWJ1dGlvbjtcblx0XHRpZiAoIWNvbnRyaWJ1dGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBUaGUgcmVxdWlyZW1lbnQgbWF5IGJlIGEgc3RhdGljIGJvb2xlYW4gb3IsIGZvciBwcm9ncmFtbWF0aWNhbGx5LXJlZ2lzdGVyZWRcblx0XHQvLyB0eXBlcyAoZS5nLiBhZ2VudCBob3N0KSwgYSBmdW5jdGlvbiB0aGUgY29udHJpYnV0aW9uIG93bnMgdGhhdCBkZXJpdmVzIGl0XG5cdFx0Ly8gZHluYW1pY2FsbHkgXHUyMDE0IGZvciBpbnN0YW5jZSBmcm9tIHRoZSBhZ2VudCdzIGN1cnJlbnRseS1hZHZlcnRpc2VkIHByb3RlY3RlZFxuXHRcdC8vIHJlc291cmNlcywgc28gYSBzZXNzaW9uIHR5cGUgdXNhYmxlIHdpdGhvdXQgR2l0SHViIChDbGF1ZGUgbmF0aXZlLCBDb2RleCBvblxuXHRcdC8vIE9wZW5BSSkgcmVwb3J0cyBgZmFsc2VgIHdoaWxlIGl0IGlzLiBSZS1ldmFsdWF0ZWQgd2hlbmV2ZXIgdGhlIGNvbnRyaWJ1dGlvbidzXG5cdFx0Ly8gYXZhaWxhYmlsaXR5IG5vdGlmaWVyIGZpcmVzLlxuXHRcdGNvbnN0IHJlcXVpcmVzID0gY29udHJpYnV0aW9uLnJlcXVpcmVzQ29waWxvdFNpZ25Jbjtcblx0XHRyZXR1cm4gdHlwZW9mIHJlcXVpcmVzID09PSAnZnVuY3Rpb24nID8gcmVxdWlyZXMoKSA6ICEhcmVxdWlyZXM7XG5cdH1cblxuXHRwdWJsaWMgc2Vzc2lvblN1cHBvcnRzRm9yayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Ly8gVHJ5IHRvIHJlc29sdmUgaW4gY2FzZSBhbiBhbGlhcyB3YXMgdXNlZFxuXHRcdFx0Pz8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHRoaXMuX3Jlc29sdmVSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gISFzZXNzaW9uPy5zZXNzaW9uLmZvcmtTZXNzaW9uO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZvcmtDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdC8vIFRyeSB0byByZXNvbHZlIGluIGNhc2UgYW4gYWxpYXMgd2FzIHVzZWRcblx0XHRcdD8/IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKCFzZXNzaW9uPy5zZXNzaW9uLmZvcmtTZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3Qgc3VwcG9ydCBmb3JraW5nYCk7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uLnNlc3Npb24uZm9ya1Nlc3Npb24ocmVxdWVzdCwgdG9rZW4pO1xuXHR9XG5cblx0cHVibGljIHNlc3Npb25TdXBwb3J0c1JlbmFtZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Ly8gVHJ5IHRvIHJlc29sdmUgaW4gY2FzZSBhbiBhbGlhcyB3YXMgdXNlZFxuXHRcdFx0Pz8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHRoaXMuX3Jlc29sdmVSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gISFzZXNzaW9uPy5zZXNzaW9uLnJlbmFtZVNlc3Npb247XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVuYW1lQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIHRpdGxlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJlc29sdmUgdGhlIHNlc3Npb24gKGNyZWF0aW5nIGl0IGlmIG5lY2Vzc2FyeSkgc28gdGhhdCByZW5hbWUgd29ya3Ncblx0XHQvLyBldmVuIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IGN1cnJlbnRseSBvcGVuIGluIGFuIGVkaXRvci5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHRcdGlmICghc2Vzc2lvbi5yZW5hbWVTZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3Qgc3VwcG9ydCByZW5hbWluZ2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbi5yZW5hbWVTZXNzaW9uKHRpdGxlLCB0b2tlbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udGVudFByb3ZpZGVyU2NoZW1lcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fY29udGVudFByb3ZpZGVycy5rZXlzKCkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJOZXdTZXNzaW9uSW5QbGFjZUFjdGlvbih0eXBlOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdFNlc3Npb25JblBsYWNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdDaGF0U2Vzc2lvbkluUGxhY2UuJHt0eXBlfWAsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuTmV3Q2hhdFNlc3Npb25JblBsYWNlJywgXCJOZXcgezB9IFNlc3Npb25cIiwgZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwZWN0ZWQgYXJnczogW2NoYXRTZXNzaW9uUG9zaXRpb246ICdzaWRlYmFyJyB8ICdlZGl0b3InXVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRpZiAoYXJncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignRXhwZWN0ZWQgY2hhdCBzZXNzaW9uIHBvc2l0aW9uIGFyZ3VtZW50Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uUG9zaXRpb24gPSBhcmdzWzBdO1xuXHRcdFx0aWYgKGNoYXRTZXNzaW9uUG9zaXRpb24gIT09IENoYXRTZXNzaW9uUG9zaXRpb24uU2lkZWJhciAmJiBjaGF0U2Vzc2lvblBvc2l0aW9uICE9PSBDaGF0U2Vzc2lvblBvc2l0aW9uLkVkaXRvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBJbnZhbGlkIGNoYXQgc2Vzc2lvbiBwb3NpdGlvbiBhcmd1bWVudDogJHtjaGF0U2Vzc2lvblBvc2l0aW9ufWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBlZGl0b3IgdG8gcmVwbGFjZSB1cCBmcm9udCBmcm9tIHRoZSBjdXJyZW50bHkgYWN0aXZlXG5cdFx0XHQvLyBjaGF0IGVkaXRvciwgc28gdGhlIHJlcGxhY2VtZW50IHRhcmdldHMgdGhhdCBzcGVjaWZpYyB0YWIgcmF0aGVyXG5cdFx0XHQvLyB0aGFuIHdoYXRldmVyIGJlY29tZXMgYWN0aXZlIGR1cmluZyB0aGUgYXN5bmMgb3Blbi5cblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSkuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yO1xuXHRcdFx0Y29uc3QgcmVwbGFjZUVkaXRvckZvclJlc291cmNlID0gYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0ID8gYWN0aXZlRWRpdG9yLnNlc3Npb25SZXNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IG9wZW5DaGF0U2Vzc2lvbihhY2Nlc3NvciwgeyB0eXBlOiB0eXBlLCBkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2NoYXQnLCBcIkNoYXRcIiksIHBvc2l0aW9uOiBjaGF0U2Vzc2lvblBvc2l0aW9uLCByZXBsYWNlRWRpdG9yRm9yUmVzb3VyY2UgfSk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJOZXdTZXNzaW9uRXh0ZXJuYWxBY3Rpb24odHlwZTogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCByZXNvbHZlQ29tbWFuZElkOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdFNlc3Npb25FeHRlcm5hbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTmV3Q2hhdFNlc3Npb25FeHRlcm5hbC4ke3R5cGV9YCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW5OZXdDaGF0U2Vzc2lvbkV4dGVybmFsJywgXCJOZXcgezB9IFNlc3Npb25cIiwgZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZElkID0gcmVzb2x2ZUNvbW1hbmRJZCgpO1xuXHRcdFx0aWYgKCFjb21tYW5kSWQpIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gTm8gY3JlYXRlIGNvbW1hbmQgY29udHJpYnV0ZWQgdG8gJyR7TWVudUlkLkFnZW50U2Vzc2lvbnNDcmVhdGVTdWJNZW51LmlkfScgZm9yIGNoYXQgc2Vzc2lvbiB0eXBlICcke3R5cGV9JzsgY2Fubm90IG9wZW4gYSBuZXcgc2Vzc2lvbi5gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgZW51bSBDaGF0U2Vzc2lvblBvc2l0aW9uIHtcblx0RWRpdG9yID0gJ2VkaXRvcicsXG5cdFNpZGViYXIgPSAnc2lkZWJhcidcbn1cblxudHlwZSBOZXdDaGF0U2Vzc2lvblNlbmRPcHRpb25zID0ge1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0YWNoZWRDb250ZXh0PzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRyZWFkb25seSBpbml0aWFsU2Vzc2lvbk9wdGlvbnM/OiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcDtcblx0LyoqXG5cdCAqIEEgcHJpb3IgY29udmVyc2F0aW9uIHRvIHNlZWQgaW50byB0aGUgbmV3IHNlc3Npb24gYXMgcmVhbCwgZWRpdGFibGUgdHVybnNcblx0ICogKFwiQ29udGludWUgaW5cdTIwMjZcIiBtaWdyYXRpb24pLiBDb25zdW1lZCBvbmNlIHdoZW4gdGhlIGJhY2tlbmQgc2Vzc2lvbiBpc1xuXHQgKiBjcmVhdGVkOyBzZWUge0BsaW5rIElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZX0uXG5cdCAqL1xuXHRyZWFkb25seSBpbXBvcnRDb252ZXJzYXRpb24/OiBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uO1xufTtcblxuZXhwb3J0IHR5cGUgTmV3Q2hhdFNlc3Npb25PcGVuT3B0aW9ucyA9IHtcblx0cmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBwb3NpdGlvbjogQ2hhdFNlc3Npb25Qb3NpdGlvbjtcblx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB0aGUgZWRpdG9yIHNob3dpbmcgdGhpcyAoc291cmNlKSBzZXNzaW9uIHJlc291cmNlIGlzIHJlcGxhY2VkXG5cdCAqIGluIHBsYWNlIHdpdGggdGhlIG5ld2x5IG9wZW5lZCBzZXNzaW9uLiBUaGUgc291cmNlIHJlc291cmNlIGlzIHJlc29sdmVkXG5cdCAqIHRvIGl0cyBjb25jcmV0ZSBlZGl0b3IgYXQgcmVwbGFjZSB0aW1lLCBzbyB0aGUgY29ycmVjdCB0YWIgaXMgcmVwbGFjZWRcblx0ICogZXZlbiBpZiB0aGUgdXNlciBhY3RpdmF0ZWQgYSBkaWZmZXJlbnQgZWRpdG9yIGR1cmluZyB0aGUgYXN5bmMgc2V0dXAuXG5cdCAqL1xuXHRyZWFkb25seSByZXBsYWNlRWRpdG9yRm9yUmVzb3VyY2U/OiBVUkk7XG59O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3BlbkNoYXRTZXNzaW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcGVuT3B0aW9uczogTmV3Q2hhdFNlc3Npb25PcGVuT3B0aW9ucywgY2hhdFNlbmRPcHRpb25zPzogTmV3Q2hhdFNlc3Npb25TZW5kT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdGNvbnN0IGNoYXRTZXNzaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UpO1xuXHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRjb25zdCBpbXBvcnRDb252ZXJzYXRpb25TdG9yZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUpO1xuXHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cblx0Ly8gRGV0ZXJtaW5lIHJlc291cmNlIHRvIG9wZW5cblx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gZ2V0UmVzb3VyY2VGb3JOZXdDaGF0U2Vzc2lvbihvcGVuT3B0aW9ucyk7XG5cblx0Ly8gU3Rhc2ggYW55IGltcG9ydGVkIChcIkNvbnRpbnVlIGluXHUyMDI2XCIpIGNvbnZlcnNhdGlvbiBiZWZvcmUgdGhlIHNlc3Npb24gaXNcblx0Ly8gb3BlbmVkOiBvcGVuaW5nIGNhbiBlYWdlcmx5IHByZS1jcmVhdGUgdGhlIGJhY2tlbmQgc2Vzc2lvbiAodmlhIHRoZSBjaGF0XG5cdC8vIGlucHV0IHBpY2tlciksIHdoaWNoIGNvbnN1bWVzIHRoaXMgdG8gc2VlZCB0aGUgdHVybnMgYXMgZWRpdGFibGUgaGlzdG9yeS5cblx0aWYgKGNoYXRTZW5kT3B0aW9ucz8uaW1wb3J0Q29udmVyc2F0aW9uICYmIGNoYXRTZW5kT3B0aW9ucy5pbXBvcnRDb252ZXJzYXRpb24udHVybnMubGVuZ3RoID4gMCkge1xuXHRcdGltcG9ydENvbnZlcnNhdGlvblN0b3JlLnNldChzZXNzaW9uUmVzb3VyY2UsIGNoYXRTZW5kT3B0aW9ucy5pbXBvcnRDb252ZXJzYXRpb24pO1xuXHR9XG5cblx0Ly8gT3BlbiBjaGF0IHNlc3Npb24uIEZvciBhIHNpZGViYXIgXCJDb250aW51ZSBpblx1MjAyNlwiIG1pZ3JhdGlvbiB0aGUgdHJhbnNpdGlvblxuXHQvLyBzcGFucyBtdWx0aXBsZSBhc3luYyBwaGFzZXMgKGxvYWQgXHUyMTkyIG1hdGVyaWFsaXppbmcgc2VuZCBcdTIxOTIgdW50aXRsZWRcdTIxOTJyZWFsXG5cdC8vIHJlYmluZCksIGR1cmluZyB3aGljaCB0aGUgY2hhdCB3aWRnZXQgaXMgdHJhbnNpZW50bHkgZW1wdHkuIEhvbGQgdGhlXG5cdC8vIHNlc3Npb25zIGxpc3Qgc3VwcHJlc3NlZCBhY3Jvc3MgdGhlIHdob2xlIHRyYW5zaXRpb24gc28gaXQgbmV2ZXIgZmxhc2hlcy5cblx0bGV0IHNlc3Npb25zTGlzdFN1cHByZXNzaW9uOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0bGV0IHRyYW5zaXRpb25Qcm9ncmVzczogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdHN3aXRjaCAob3Blbk9wdGlvbnMucG9zaXRpb24pIHtcblx0XHRcdGNhc2UgQ2hhdFNlc3Npb25Qb3NpdGlvbi5TaWRlYmFyOiB7XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXcoQ2hhdFZpZXdJZCkgYXMgQ2hhdFZpZXdQYW5lO1xuXHRcdFx0XHRpZiAoY2hhdFNlbmRPcHRpb25zPy5pbXBvcnRDb252ZXJzYXRpb24pIHtcblx0XHRcdFx0XHRzZXNzaW9uc0xpc3RTdXBwcmVzc2lvbiA9IHZpZXcuYmVnaW5TZXNzaW9uc0xpc3RTdXBwcmVzc2lvbigpO1xuXHRcdFx0XHRcdC8vIFNob3cgdGhlIGNoYXQgdmlldydzIHdvcmtpbmcgaW5kaWNhdG9yIGZvciB0aGUgd2hvbGUgdHJhbnNpdGlvbiAodGhlXG5cdFx0XHRcdFx0Ly8gd2lkZ2V0IGlzIGJsYW5rIHdoaWxlIHRoZSBiYWNrZW5kIHNlc3Npb24gbWF0ZXJpYWxpemVzKSBzbyBpdCBkb2VzIG5vdFxuXHRcdFx0XHRcdC8vIGxvb2sgaHVuZy4gQ29tcGxldGVkIG9uY2UgdGhlIG1pZ3JhdGlvbiBmaW5pc2hlcyBiZWxvdy5cblx0XHRcdFx0XHR0cmFuc2l0aW9uUHJvZ3Jlc3MgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBDaGF0Vmlld0lkIH0sICgpID0+IHRyYW5zaXRpb25Qcm9ncmVzcyEucCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZW5PcHRpb25zLnR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkge1xuXHRcdFx0XHRcdGF3YWl0IHZpZXcuc3RhcnROZXdMb2NhbFNlc3Npb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB2aWV3LmxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmlldy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQ2hhdFNlc3Npb25Qb3NpdGlvbi5FZGl0b3I6IHtcblx0XHRcdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRcdG92ZXJyaWRlOiBDaGF0RWRpdG9ySW5wdXQuRWRpdG9ySUQsXG5cdFx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRcdC4uLihvcGVuT3B0aW9ucy50eXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgPyB7IGV4cGxpY2l0U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gOiB7fSksXG5cdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdGZhbGxiYWNrOiBsb2NhbGl6ZSgnY2hhdEVkaXRvckNvbnRyaWJ1dGlvbk5hbWUnLCBcInswfVwiLCBvcGVuT3B0aW9ucy5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAob3Blbk9wdGlvbnMucmVwbGFjZUVkaXRvckZvclJlc291cmNlKSB7XG5cdFx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgc3BlY2lmaWMgc291cmNlIGNoYXQgZWRpdG9yLCBpZGVudGlmaWVkIGJ5IGl0c1xuXHRcdFx0XHRcdC8vIHNlc3Npb24gcmVzb3VyY2UgXHUyMDE0IG5vdCB3aGF0ZXZlciBoYXBwZW5zIHRvIGJlIGFjdGl2ZSBub3cuIFRoZVxuXHRcdFx0XHRcdC8vIHJlcG9zaXRvcnkgZXh0cmFjdGlvbiBhbmQgb3RoZXIgYXdhaXRzIGFib3ZlIG1heSBoYXZlIHJ1biB3aGlsZVxuXHRcdFx0XHRcdC8vIHRoZSB1c2VyIGFjdGl2YXRlZCBhIGRpZmZlcmVudCBjaGF0IGVkaXRvciwgc28gY29uc3VsdGluZyB0aGVcblx0XHRcdFx0XHQvLyBhY3RpdmUgZWRpdG9yIGNvdWxkIHJlcGxhY2UgYW4gdW5yZWxhdGVkIHRhYi5cblx0XHRcdFx0XHRjb25zdCBzb3VyY2VSZXNvdXJjZSA9IG9wZW5PcHRpb25zLnJlcGxhY2VFZGl0b3JGb3JSZXNvdXJjZTtcblx0XHRcdFx0XHRsZXQgcmVwbGFjZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwLmVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXQgJiYgcmVzb3VyY2VzLmlzRXF1YWwoZS5zZXNzaW9uUmVzb3VyY2UsIHNvdXJjZVJlc291cmNlKSk7XG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2UucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yLCByZXBsYWNlbWVudDogeyByZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLCBvcHRpb25zIH0gfV0sIGdyb3VwKTtcblx0XHRcdFx0XHRcdFx0cmVwbGFjZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFyZXBsYWNlZCkge1xuXHRcdFx0XHRcdFx0Ly8gTm8gY2hhdCBlZGl0b3IgdG8gcmVwbGFjZSBpbiBwbGFjZSBcdTIwMTQgZmFsbCBiYWNrIHRvIG9wZW5pbmcgYVxuXHRcdFx0XHRcdFx0Ly8gbmV3IGVkaXRvciBzbyB0aGUgc2Vzc2lvbiAoYW5kIHRoZSB1c2VyJ3MgcGVuZGluZyBzZW5kKSBpc1xuXHRcdFx0XHRcdFx0Ly8gbmV2ZXIgbG9zdC5cblx0XHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiBhc3NlcnROZXZlcihvcGVuT3B0aW9ucy5wb3NpdGlvbiwgYFVua25vd24gY2hhdCBzZXNzaW9uIHBvc2l0aW9uOiAke29wZW5PcHRpb25zLnBvc2l0aW9ufWApO1xuXHRcdH1cblx0fSBjYXRjaCAoZSkge1xuXHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBvcGVuICcke29wZW5PcHRpb25zLnR5cGV9JyBjaGF0IHNlc3Npb24gd2l0aCBvcGVuT3B0aW9uczogJHtKU09OLnN0cmluZ2lmeShvcGVuT3B0aW9ucyl9YCwgZSk7XG5cdFx0c2Vzc2lvbnNMaXN0U3VwcHJlc3Npb24/LmRpc3Bvc2UoKTtcblx0XHR0cmFuc2l0aW9uUHJvZ3Jlc3M/LmNvbXBsZXRlKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gU2VuZCBpbml0aWFsIHByb21wdCBpZiBwcm92aWRlZFxuXHRpZiAoY2hhdFNlbmRPcHRpb25zKSB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNldCBpbml0aWFsIHNlc3Npb24gb3B0aW9ucyBvbiB0aGUgbW9kZWwgYmVmb3JlIHNlbmRpbmcgdGhlIHJlcXVlc3QsXG5cdFx0XHQvLyBzbyB0aGF0IHRoZSBjb250cmlidXRlZCBzZXNzaW9uIHByb3ZpZGVyIGNhbiByZWFkIHRoZW0uXG5cdFx0XHRpZiAoY2hhdFNlbmRPcHRpb25zLmluaXRpYWxTZXNzaW9uT3B0aW9ucykge1xuXHRcdFx0XHRjaGF0U2Vzc2lvblNlcnZpY2UudXBkYXRlU2Vzc2lvbk9wdGlvbnMoc2Vzc2lvblJlc291cmNlLCBub3JtYWxpemVTZXNzaW9uT3B0aW9ucyhjaGF0U2VuZE9wdGlvbnMuaW5pdGlhbFNlc3Npb25PcHRpb25zKSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBhdHRhY2hlZENvbnRleHQgPSBjaGF0U2VuZE9wdGlvbnMuYXR0YWNoZWRDb250ZXh0O1xuXHRcdFx0Y29uc3QgcHJvbXB0RmlsZSA9IGF3YWl0IHJlc29sdmVQcm9tcHRTbGFzaENvbW1hbmQoY2hhdFNlbmRPcHRpb25zLnByb21wdCwgc2Vzc2lvblJlc291cmNlLCBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHRvb2xzU2VydmljZSk7XG5cdFx0XHRpZiAocHJvbXB0RmlsZSkge1xuXHRcdFx0XHRhdHRhY2hlZENvbnRleHQgPSBbcHJvbXB0RmlsZSwgLi4uKGF0dGFjaGVkQ29udGV4dCA/PyBbXSldO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCBjaGF0U2VuZE9wdGlvbnMucHJvbXB0LCB7IGFnZW50SWRTaWxlbnQ6IG9wZW5PcHRpb25zLnR5cGUsIGF0dGFjaGVkQ29udGV4dCB9KTtcblx0XHRcdGNvbnN0IG5ld1Nlc3Npb25SZXNvdXJjZSA9IHJlc3VsdC5raW5kID09PSAnc2VudCcgfHwgcmVzdWx0LmtpbmQgPT09ICdyZWplY3RlZCcgPyByZXN1bHQubmV3U2Vzc2lvblJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG5ld1Nlc3Npb25SZXNvdXJjZSAmJiAhcmVzb3VyY2VzLmlzRXF1YWwobmV3U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHN3aXRjaCAob3Blbk9wdGlvbnMucG9zaXRpb24pIHtcblx0XHRcdFx0XHRjYXNlIENoYXRTZXNzaW9uUG9zaXRpb24uU2lkZWJhcjoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhDaGF0Vmlld0lkKSBhcyBDaGF0Vmlld1BhbmU7XG5cdFx0XHRcdFx0XHRhd2FpdCB2aWV3LmxvYWRTZXNzaW9uKG5ld1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBDaGF0U2Vzc2lvblBvc2l0aW9uLkVkaXRvcjoge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwLmVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXQgJiYgcmVzb3VyY2VzLmlzRXF1YWwoZS5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5yZXBsYWNlRWRpdG9ycyhbeyBlZGl0b3IsIHJlcGxhY2VtZW50OiB7IHJlc291cmNlOiBuZXdTZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnM6IHsgb3ZlcnJpZGU6IENoYXRFZGl0b3JJbnB1dC5FZGl0b3JJRCwgcGlubmVkOiB0cnVlIH0gfSB9XSwgZ3JvdXApO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVmYXVsdDogYXNzZXJ0TmV2ZXIob3Blbk9wdGlvbnMucG9zaXRpb24sIGBVbmtub3duIGNoYXQgc2Vzc2lvbiBwb3NpdGlvbjogJHtvcGVuT3B0aW9ucy5wb3NpdGlvbn1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBzZW5kIGluaXRpYWwgcmVxdWVzdCB0byAnJHtvcGVuT3B0aW9ucy50eXBlfScgY2hhdCBzZXNzaW9uIHdpdGggY29udGV4dE9wdGlvbnM6ICR7SlNPTi5zdHJpbmdpZnkoY2hhdFNlbmRPcHRpb25zKX1gLCBlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBUaGUgbWlncmF0aW9uIHRyYW5zaXRpb24gaXMgY29tcGxldGUgKHNlc3Npb24gbG9hZGVkLCByZXF1ZXN0IHNlbnQgYW5kIGFueVxuXHQvLyB1bnRpdGxlZFx1MjE5MnJlYWwgcmViaW5kIGRvbmUpOyBhbGxvdyB0aGUgc2Vzc2lvbnMgbGlzdCBhZ2FpbiBhbmQgc3RvcCB0aGVcblx0Ly8gd29ya2luZyBpbmRpY2F0b3IuXG5cdHNlc3Npb25zTGlzdFN1cHByZXNzaW9uPy5kaXNwb3NlKCk7XG5cdHRyYW5zaXRpb25Qcm9ncmVzcz8uY29tcGxldGUoKTtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIHNlc3Npb24gb3B0aW9ucyB0aGF0IG1heSBhcnJpdmUgaW4gb25lIG9mIHRocmVlIHJ1bnRpbWUgc2hhcGVzXG4gKiBpbnRvIGEgcHJvcGVyIGBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcGA6XG4gKlxuICogLSAqKk1hcCoqIFx1MjAxNCByZXR1cm5lZCBhcy1pcy5cbiAqIC0gKipBcnJheSoqIG9mIGB7b3B0aW9uSWQsIHZhbHVlfWAgb2JqZWN0cyBcdTIwMTQgZS5nLiBmcm9tIGNvbW1hbmQgYXJndW1lbnRzXG4gKiAgIHRoYXQgYnlwYXNzIHN0YXRpYyB0eXBlIGNoZWNraW5nLlxuICogLSAqKlBsYWluIHJlY29yZCoqIChgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtPmApXG4gKiAgIFx1MjAxNCBlLmcuIGZyb20gSlNPTiBkZXNlcmlhbGl6YXRpb24gYWNyb3NzIHByb2Nlc3MgYm91bmRhcmllcyB3aGVyZSBhIE1hcFxuICogICBsb3NlcyBpdHMgcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBub3JtYWxpemVTZXNzaW9uT3B0aW9ucyhvcHRpb25zOiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCB8IFJlYWRvbmx5QXJyYXk8eyBvcHRpb25JZDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIH0+KTogUmVhZG9ubHlDaGF0U2Vzc2lvbk9wdGlvbnNNYXAge1xuXHRpZiAob3B0aW9ucyBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpKSB7XG5cdFx0cmV0dXJuIG5ldyBNYXAob3B0aW9ucy5tYXAobyA9PiBbby5vcHRpb25JZCwgby52YWx1ZV0pKTtcblx0fVxuXHQvLyBQbGFpbiBvYmplY3QgZmFsbGJhY2sgKGUuZy4gZnJvbSBKU09OIGRlc2VyaWFsaXphdGlvbilcblx0cmV0dXJuIENoYXRTZXNzaW9uT3B0aW9uc01hcC5mcm9tUmVjb3JkKG9wdGlvbnMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+KTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB2YXJpYWJsZSBlbnRyeSBmb3IgYSBzbGFzaCBjb21tYW5kIGlmIHRoZSBwcm9tcHQgc3RhcnRzIHdpdGggYSBzbGFzaCBjb21tYW5kIHRoYXQgY2FuIGJlIHJlc29sdmVkIHRvIGEgcHJvbXB0IGZpbGUsIG90aGVyd2lzZSByZXR1cm5zIHVuZGVmaW5lZC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVByb21wdFNsYXNoQ29tbWFuZChwcm9tcHQ6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkksIGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBzbGFzaE1hdGNoID0gcHJvbXB0Lm1hdGNoKHNsYXNoUmVnKTtcblx0Ly8gc3RhcnRzIHdpdGggYSBzbGFzaCBjb21tYW5kLCBhZGQgdGhlIGNvcnJlc3BvbmRpbmcgcHJvbXB0IGZpbGUgdG8gdGhlIGNvbnRleHQgaWYgaXQgZXhpc3RzXG5cdGlmIChzbGFzaE1hdGNoKSB7XG5cdFx0Ly8gbmVlZCB0byByZXNvbHZlIHRoZSBzbGFzaCBjb21tYW5kIHRvIGdldCB0aGUgcHJvbXB0IGZpbGVcblx0XHRjb25zdCBzbGFzaENvbW1hbmQgPSBhd2FpdCBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVzb2x2ZVByb21wdFNsYXNoQ29tbWFuZChzbGFzaE1hdGNoWzFdLCBzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChzbGFzaENvbW1hbmQpIHtcblx0XHRcdGNvbnN0IHBhcnNlUmVzdWx0ID0gc2xhc2hDb21tYW5kLnBhcnNlZFByb21wdEZpbGU7XG5cdFx0XHQvLyBhZGQgdGhlIHByb21wdCBmaWxlIHRvIHRoZSBjb250ZXh0XG5cdFx0XHRjb25zdCByZWZzID0gcGFyc2VSZXN1bHQuYm9keT8udmFyaWFibGVSZWZlcmVuY2VzLm1hcCgoeyBuYW1lLCBvZmZzZXQsIGZ1bGxMZW5ndGggfSkgPT4gKHsgbmFtZSwgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShvZmZzZXQsIG9mZnNldCArIGZ1bGxMZW5ndGgpIH0pKSA/PyBbXTtcblx0XHRcdGNvbnN0IHRvb2xSZWZlcmVuY2VzID0gdG9vbHNTZXJ2aWNlLnRvVG9vbFJlZmVyZW5jZXMocmVmcyk7XG5cdFx0XHRyZXR1cm4gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeShwYXJzZVJlc3VsdC51cmksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuUHJvbXB0RmlsZSwgdW5kZWZpbmVkLCB0cnVlLCB0b29sUmVmZXJlbmNlcyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNvdXJjZUZvck5ld0NoYXRTZXNzaW9uKG9wdGlvbnM6IE5ld0NoYXRTZXNzaW9uT3Blbk9wdGlvbnMpOiBVUkkge1xuXHRjb25zdCBpc1JlbW90ZVNlc3Npb24gPSBvcHRpb25zLnR5cGUgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbDtcblx0aWYgKGlzUmVtb3RlU2Vzc2lvbikge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IG9wdGlvbnMudHlwZSxcblx0XHRcdHBhdGg6IGAvdW50aXRsZWQtJHtnZW5lcmF0ZVV1aWQoKX1gLFxuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgaXNFZGl0b3JQb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb24gPT09IENoYXRTZXNzaW9uUG9zaXRpb24uRWRpdG9yO1xuXHRpZiAoaXNFZGl0b3JQb3NpdGlvbikge1xuXHRcdHJldHVybiBDaGF0RWRpdG9ySW5wdXQuZ2V0TmV3RWRpdG9yVXJpKCk7XG5cdH1cblxuXHRyZXR1cm4gTG9jYWxDaGF0U2Vzc2lvblVyaS5nZXROZXdTZXNzaW9uVXJpKCk7XG59XG5cbmZ1bmN0aW9uIGlzQWdlbnRTZXNzaW9uUHJvdmlkZXJUeXBlKHR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gT2JqZWN0LnZhbHVlcyhBZ2VudFNlc3Npb25Qcm92aWRlcnMpLmluY2x1ZGVzKHR5cGUgYXMgQWdlbnRTZXNzaW9uUHJvdmlkZXJzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlc3Npb25TdGF0dXNGb3JNb2RlbChtb2RlbDogSUNoYXRNb2RlbCk6IENoYXRTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0aWYgKG1vZGVsLnJlcXVlc3RJblByb2dyZXNzLmdldCgpKSB7XG5cdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdH1cblxuXHRjb25zdCBsYXN0UmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRpZiAobGFzdFJlcXVlc3Q/LnJlc3BvbnNlKSB7XG5cdFx0aWYgKGxhc3RSZXF1ZXN0LnJlc3BvbnNlLnN0YXRlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dCkge1xuXHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cdFx0fSBlbHNlIGlmIChsYXN0UmVxdWVzdC5yZXNwb25zZS5pc0NhbmNlbGVkIHx8IGxhc3RSZXF1ZXN0LnJlc3BvbnNlLnJlc3VsdD8uZXJyb3JEZXRhaWxzPy5jb2RlID09PSAnY2FuY2VsZWQnKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdH0gZWxzZSBpZiAobGFzdFJlcXVlc3QucmVzcG9uc2UucmVzdWx0Py5lcnJvckRldGFpbHMpIHtcblx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQ7XG5cdFx0fSBlbHNlIGlmIChsYXN0UmVxdWVzdC5yZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2hhdFJlc3BvbnNlU3RhdGVUb1Nlc3Npb25TdGF0dXMoc3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZSk6IENoYXRTZXNzaW9uU3RhdHVzIHtcblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZDpcblx0XHRjYXNlIFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZTpcblx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ7XG5cdFx0Y2FzZSBSZXNwb25zZU1vZGVsU3RhdGUuRmFpbGVkOlxuXHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZDtcblx0XHRjYXNlIFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nOlxuXHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdFx0Y2FzZSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dDpcblx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QixpQkFBaUIsNkJBQTZCO0FBQzlFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxvQkFBb0IsWUFBWSxlQUFlLGlCQUE4QixvQkFBb0I7QUFDMUcsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsY0FBYyxRQUFRLGdCQUFnQixjQUFjLHVCQUF1QjtBQUM3RixTQUFTLGdCQUE2QiwwQkFBMEI7QUFFaEUsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQiw0QkFBNEI7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBMkQseUJBQXlCO0FBQ3BGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCLG1CQUFtQix3QkFBOGQsc0JBQWdGLDJCQUEyQixzQkFBeUYsbUJBQW1CO0FBQ3h1QixTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxjQUFjLDBCQUEwQjtBQUNqRCxTQUFTLFNBQVMsMkJBQTJCO0FBQzdDLFNBQW9DLHdCQUF3QixpQ0FBaUM7QUFDN0YsU0FBUyxxQkFBcUI7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
