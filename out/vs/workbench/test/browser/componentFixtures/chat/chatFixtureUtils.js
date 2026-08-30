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
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { ILinkPresentationService } from "../../../../../platform/dataChannel/common/dataChannel.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IUpdateService, StateType } from "../../../../../platform/update/common/update.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { ISCMService } from "../../../../contrib/scm/common/scm.js";
import { IBrowserViewWorkbenchService } from "../../../../contrib/browserView/common/browserView.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { IVoiceModeOnboardingService } from "../../../../contrib/agentsVoice/browser/voiceModeOnboarding.js";
import { IChatAccessibilityService, IChatWidgetService } from "../../../../contrib/chat/browser/chat.js";
import { IChatResponseFileChangesService } from "../../../../contrib/chat/browser/chatResponseFileChangesService.js";
import { IChatPetService } from "../../../../contrib/chat/browser/chatPetService.js";
import { IChatOutputRendererService } from "../../../../contrib/chat/browser/chatOutputItemRenderer.js";
import { IAiEditTelemetryService } from "../../../../contrib/editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditSuggestionId } from "../../../../../editor/common/textModelEditSource.js";
import { IChatAttachmentResolveService } from "../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js";
import { IChatAttachmentWidgetRegistry } from "../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js";
import { IChatContextPickService } from "../../../../contrib/chat/browser/attachments/chatContextPickService.js";
import { IChatContextService } from "../../../../contrib/chat/browser/contextContrib/chatContextService.js";
import { IChatImageCarouselService } from "../../../../contrib/chat/browser/chatImageCarouselService.js";
import { IChatInputNotificationService } from "../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js";
import { IDictationOnboardingService } from "../../../../contrib/chat/browser/speechToText/dictationOnboarding.js";
import { IChatInputNoticeHubService } from "../../../../contrib/chat/browser/widget/input/chatInputNoticeHub.js";
import { ChatSubmitRequestHandlerService, IChatSubmitRequestHandlerService } from "../../../../contrib/chat/browser/chatSubmitRequestHandlerService.js";
import { IChatMarkdownAnchorService } from "../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { IChatWidgetHistoryService } from "../../../../contrib/chat/common/widget/chatWidgetHistoryService.js";
import { IChatModeService } from "../../../../contrib/chat/common/chatModes.js";
import { MockChatModeService } from "../../../../contrib/chat/test/common/mockChatModeService.js";
import { IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { Target } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { ILanguageModelsService } from "../../../../contrib/chat/common/languageModels.js";
import { ChatAgentService, IChatAgentNameService, IChatAgentService } from "../../../../contrib/chat/common/participants/chatAgents.js";
import { MockChatService } from "../../../../contrib/chat/test/common/chatService/mockChatService.js";
import { ILanguageModelToolsService } from "../../../../contrib/chat/common/tools/languageModelToolsService.js";
import { IChatArtifactsService } from "../../../../contrib/chat/common/tools/chatArtifactsService.js";
import { IChatTodoListService } from "../../../../contrib/chat/common/tools/chatTodoListService.js";
import { IChatToolRiskAssessmentService } from "../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js";
import { IVoiceSessionController } from "../../../../contrib/chat/browser/voiceClient/voiceSessionController.js";
import { registerWorkbenchServices } from "../fixtureUtils.js";
let FixtureMenuService = class {
  constructor(_contextKeyService, _commandService) {
    this._contextKeyService = _contextKeyService;
    this._commandService = _commandService;
    this._items = /* @__PURE__ */ new Map();
  }
  addItem(menuId, item) {
    const key = menuId.id;
    let items = this._items.get(key);
    if (!items) {
      items = [];
      this._items.set(key, items);
    }
    items.push(item);
  }
  createMenu(id) {
    const actions = [];
    for (const item of this._items.get(id.id) ?? []) {
      const group = item.group ?? "";
      let entry = actions.find((a) => a[0] === group);
      if (!entry) {
        entry = [group, []];
        actions.push(entry);
      }
      entry[1].push(new MenuItemAction(item.command, item.alt, {}, void 0, void 0, this._contextKeyService, this._commandService));
    }
    return { onDidChange: Event.None, dispose() {
    }, getActions: () => actions };
  }
  getMenuActions() {
    return [];
  }
  getMenuContexts() {
    return /* @__PURE__ */ new Set();
  }
  resetHiddenStates() {
  }
};
FixtureMenuService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ICommandService)
], FixtureMenuService);
function registerChatFixtureServices(reg, options = {}) {
  registerWorkbenchServices(reg);
  reg.define(IMenuService, FixtureMenuService);
  reg.define(IMarkdownRendererService, MarkdownRendererService);
  reg.define(IListService, ListService);
  reg.defineInstance(ILinkPresentationService, new class extends mock() {
    getLinkPresentationRule() {
      return void 0;
    }
    createLinkPresentationWatcher() {
      return void 0;
    }
  }());
  reg.defineInstance(IDecorationsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeDecorations = Event.None;
    }
  }());
  reg.defineInstance(IBrowserViewWorkbenchService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeBrowserViews = Event.None;
    }
    getKnownBrowserViews() {
      return /* @__PURE__ */ new Map();
    }
  }());
  reg.defineInstance(ITextFileService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.untitled = new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLabel = Event.None;
        }
      }();
    }
  }());
  reg.defineInstance(IFileService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidFilesChange = Event.None;
      this.onDidRunOperation = Event.None;
    }
    hasProvider() {
      return false;
    }
  }());
  reg.defineInstance(IEditorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidActiveEditorChange = Event.None;
    }
  }());
  reg.defineInstance(IExtensionService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeExtensions = Event.None;
    }
  }());
  reg.defineInstance(IPathService, new class extends mock() {
  }());
  reg.defineInstance(IWorkbenchAssignmentService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidRefetchAssignments = Event.None;
    }
    async getCurrentExperiments() {
      return [];
    }
    async getTreatment() {
      return void 0;
    }
  }());
  reg.defineInstance(IWorkspaceContextService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeWorkspaceFolders = Event.None;
    }
    getWorkspace() {
      return { id: "", folders: [], configuration: void 0 };
    }
  }());
  reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangePartVisibility = Event.None;
      this.onDidChangeWindowMaximized = Event.None;
    }
    isVisible() {
      return true;
    }
    getContainer(targetWindow) {
      return targetWindow.document.body;
    }
  }());
  reg.defineInstance(IViewDescriptorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeLocation = Event.None;
    }
  }());
  reg.defineInstance(INotebookDocumentService, new class extends mock() {
  }());
  reg.defineInstance(ISCMService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidAddRepository = Event.None;
      this.onDidRemoveRepository = Event.None;
      this.repositories = [];
      this.repositoryCount = 0;
    }
  }());
  reg.defineInstance(IFileDialogService, new class extends mock() {
  }());
  reg.defineInstance(IProductService, new class extends mock() {
  }());
  reg.defineInstance(IUpdateService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onStateChange = Event.None;
    }
    get state() {
      return { type: StateType.Uninitialized };
    }
  }());
  reg.defineInstance(IUriIdentityService, new class extends mock() {
  }());
  reg.defineInstance(IActionWidgetService, new class extends mock() {
    show() {
    }
    hide() {
    }
    get isVisible() {
      return false;
    }
  }());
  reg.defineInstance(ISharedWebContentExtractorService, new class extends mock() {
  }());
  reg.defineInstance(IAccessibleViewService, new class extends mock() {
    getOpenAriaHint() {
      return null;
    }
  }());
  reg.define(IChatAgentService, class FixtureChatAgentService extends ChatAgentService {
    getDefaultAgent() {
      return { fullName: "GitHub Copilot", id: "githubCopilot" };
    }
  });
  reg.defineInstance(IChatAgentNameService, new class extends mock() {
    getAgentNameRestriction() {
      return true;
    }
  }());
  reg.define(IChatService, MockChatService);
  reg.defineInstance(IVoiceSessionController, new class extends mock() {
    constructor() {
      super(...arguments);
      this.targetSession = constObservable(void 0);
      this.hasDraftTarget = constObservable(false);
      this.omniInputOpen = constObservable(false);
    }
  }());
  reg.defineInstance(IChatPetService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.enabled = observableValue("chatPetEnabled", false);
      this.variant = observableValue("chatPetVariant", "stable");
      this.onTheRun = observableValue("chatPetOnTheRun", false);
      this.scale = observableValue("chatPetScale", 1);
    }
    toggle() {
      return false;
    }
    setVariant() {
    }
    setOnTheRun() {
    }
    setScale(scale) {
      this.scale.set(scale, void 0);
    }
  }());
  reg.defineInstance(IChatWidgetService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.lastFocusedWidget = void 0;
      this.onDidAddWidget = Event.None;
      this.onDidBackgroundSession = Event.None;
      this.onDidChangeFocusedWidget = Event.None;
      this.onDidChangeFocusedSession = Event.None;
    }
    getAllWidgets() {
      return [];
    }
    getWidgetByInputUri() {
      return void 0;
    }
    getWidgetBySessionResource() {
      return void 0;
    }
    getWidgetsByLocations() {
      return [];
    }
    register() {
      return { dispose() {
      } };
    }
  }());
  reg.defineInstance(IChatAccessibilityService, new class extends mock() {
    acceptRequest() {
    }
    disposeRequest() {
    }
    acceptResponse() {
    }
    acceptElicitation() {
    }
  }());
  reg.defineInstance(IChatResponseFileChangesService, new class extends mock() {
    registerProvider() {
      return Disposable.None;
    }
    getChangesForRequest() {
      return void 0;
    }
    getFileEditsForRequest() {
      return void 0;
    }
    openChangesForRequest() {
    }
  }());
  reg.defineInstance(IDictationOnboardingService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.isVisible = false;
    }
    registerHost() {
      return Disposable.None;
    }
  }());
  reg.defineInstance(IVoiceModeOnboardingService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.isVisible = false;
    }
    registerHost() {
      return Disposable.None;
    }
  }());
  reg.defineInstance(IChatInputNoticeHubService, new class extends mock() {
    registerHost() {
      return Disposable.None;
    }
    toggleNoticeFocus() {
      return false;
    }
  }());
  reg.defineInstance(IWorkbenchEnvironmentService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.isExtensionDevelopment = false;
      this.isBuilt = true;
      this.isSessionsWindow = false;
    }
  }());
  reg.defineInstance(IChatSessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeSessionOptions = Event.None;
      this.onDidChangeOptionGroups = Event.None;
      this.onDidChangeAvailability = Event.None;
    }
    getAllChatSessionContributions() {
      return [];
    }
    getCustomAgentTargetForSessionType() {
      return Target.Undefined;
    }
    requiresCustomModelsForSessionType() {
      return false;
    }
    supportsAutoModelForSessionType() {
      return false;
    }
    getOptionGroupsForSessionType() {
      return [];
    }
    supportsDelegationForSessionType() {
      return false;
    }
    getSessionOption() {
      return void 0;
    }
    getCapabilitiesForSessionType() {
      return void 0;
    }
    resolveChatResponseUri(_sessionResource, href) {
      return href;
    }
  }());
  reg.defineInstance(IChatEntitlementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.quotas = {};
      this.onDidChangeQuotaRemaining = Event.None;
      this.onDidChangeUsageBasedBilling = Event.None;
      this.onDidChangeEntitlement = Event.None;
      this.onDidChangeSentiment = Event.None;
      this.onDidChangeAnonymous = Event.None;
      // A signed-in, set-up user so the picker renders normally (no Restricted /
      // Sign In state) in fixtures.
      this.entitlement = ChatEntitlement.Pro;
      this.sentiment = { completed: true, installed: true };
      this.anonymous = false;
      this.hasByokModels = false;
    }
  }());
  reg.defineInstance(IChatModeService, new MockChatModeService());
  reg.defineInstance(ILanguageModelsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeLanguageModels = Event.None;
      this.onDidChangeModelVisibility = Event.None;
    }
    getLanguageModelIds() {
      return [];
    }
    getVendors() {
      return [];
    }
    hasResolvedVendor() {
      return false;
    }
  }());
  reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeTools = Event.None;
      this.onDidPrepareToolCallBecomeUnresponsive = Event.None;
    }
    getTools() {
      return [];
    }
  }());
  reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock() {
    isEnabled() {
      return false;
    }
    getCached() {
      return void 0;
    }
    async assess() {
      return void 0;
    }
  }());
  reg.defineInstance(IChatContextService, new class extends mock() {
  }());
  reg.defineInstance(IChatContextPickService, new class extends mock() {
  }());
  reg.defineInstance(IChatOutputRendererService, new class extends mock() {
    hasCodeBlockRenderer() {
      return false;
    }
  }());
  reg.defineInstance(IAiEditTelemetryService, new class extends mock() {
    createSuggestionId() {
      return EditSuggestionId.newId();
    }
  }());
  reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock() {
  }());
  reg.defineInstance(IChatAttachmentResolveService, new class extends mock() {
  }());
  reg.defineInstance(IChatWidgetHistoryService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeHistory = Event.None;
    }
    getHistory() {
      return [];
    }
  }());
  reg.defineInstance(IChatImageCarouselService, new class extends mock() {
  }());
  reg.defineInstance(IChatMarkdownAnchorService, new class extends mock() {
    register() {
      return { dispose() {
      } };
    }
  }());
  reg.defineInstance(IChatInputNotificationService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
    }
    getActiveNotification() {
      return options.notification;
    }
    announceRendered() {
    }
  }());
  reg.defineInstance(IChatSubmitRequestHandlerService, new ChatSubmitRequestHandlerService());
  reg.defineInstance(IAgentSessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.model = new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSessions = Event.None;
        }
      }();
    }
    getSession() {
      return void 0;
    }
  }());
  reg.defineInstance(IAgentHostService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onAgentHostStart = Event.None;
      this.rootState = {
        value: void 0,
        verifiedValue: void 0,
        onDidChange: Event.None,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    }
    getSubscription(_kind, _resource) {
      return {
        object: {
          value: void 0,
          verifiedValue: void 0,
          onDidChange: Event.None,
          onWillApplyAction: Event.None,
          onDidApplyAction: Event.None
        },
        dispose: () => {
        }
      };
    }
    getSubscriptionUnmanaged(_kind, _resource) {
      return void 0;
    }
  }());
  reg.defineInstance(IAgentHostUntitledProvisionalSessionService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
    }
    get() {
      return void 0;
    }
  }());
  reg.defineInstance(IAgentHostSessionWorkingDirectoryResolver, new class extends mock() {
    resolve() {
      return void 0;
    }
  }());
  reg.defineInstance(IAgentHostNewSessionFolderService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeFolder = Event.None;
    }
    getFolder() {
      return void 0;
    }
  }());
  reg.defineInstance(IAgentHostEnablementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.enabled = constObservable(false);
    }
  }());
  const artifactGroups = options.artifactGroups ?? observableValue("artifactGroups", []);
  reg.defineInstance(IChatArtifactsService, new class extends mock() {
    getArtifacts() {
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.artifactGroups = artifactGroups;
        }
        setAgentArtifacts() {
        }
        clearAgentArtifacts() {
        }
        clearSubagentArtifacts() {
        }
        migrate() {
        }
      }();
    }
  }());
  const todos = [...options.todos ?? []];
  reg.defineInstance(IChatTodoListService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidUpdateTodos = Event.None;
    }
    getTodos() {
      return [...todos];
    }
    setTodos() {
    }
    migrateTodos() {
    }
  }());
}
export {
  FixtureMenuService,
  registerChatFixtureServices
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxjaGF0XFxjaGF0Rml4dHVyZVV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51SXRlbSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElMaW5rUHJlc2VudGF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSwgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVNDTVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBSb290U3RhdGUsIFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9hZ2VudHNWb2ljZS9icm93c2VyL3ZvaWNlTW9kZU9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0UGV0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRPdXRwdXRJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdFN1Z2dlc3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY29udGV4dENvbnRyaWIvY2hhdENvbnRleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uT25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0Tm90aWNlSHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpY2VIdWIuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi93aWRnZXQvY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vY2tDaGF0TW9kZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50LCBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdFNlcnZpY2UvbW9ja0NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBcnRpZmFjdFNvdXJjZUdyb3VwLCBJQ2hhdEFydGlmYWN0cywgSUNoYXRBcnRpZmFjdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9jaGF0QXJ0aWZhY3RzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvZG8sIElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlUmVnaXN0cmF0aW9uLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcblxuLyoqXG4gKiBBIG1pbmltYWwgSU1lbnVTZXJ2aWNlIGltcGxlbWVudGF0aW9uIGJhY2tlZCBieSBhbiBpbi1tZW1vcnkgbWFwLiBUZXN0cyBjYW5cbiAqIHJlZ2lzdGVyIG1lbnUgaXRlbXMgd2l0aCBhZGRJdGVtKCkgYmVmb3JlIHRoZSBjb21wb25lbnQgcmVuZGVycyB0aGUgbWVudS5cbiAqL1xuZXhwb3J0IGNsYXNzIEZpeHR1cmVNZW51U2VydmljZSBpbXBsZW1lbnRzIElNZW51U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBJTWVudUl0ZW1bXT4oKTtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7IH1cblx0YWRkSXRlbShtZW51SWQ6IE1lbnVJZCwgaXRlbTogSU1lbnVJdGVtKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gbWVudUlkLmlkO1xuXHRcdGxldCBpdGVtcyA9IHRoaXMuX2l0ZW1zLmdldChrZXkpO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdGl0ZW1zID0gW107XG5cdFx0XHR0aGlzLl9pdGVtcy5zZXQoa2V5LCBpdGVtcyk7XG5cdFx0fVxuXHRcdGl0ZW1zLnB1c2goaXRlbSk7XG5cdH1cblx0Y3JlYXRlTWVudShpZDogTWVudUlkKTogSU1lbnUge1xuXHRcdGNvbnN0IGFjdGlvbnM6IFtzdHJpbmcsIE1lbnVJdGVtQWN0aW9uW11dW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5faXRlbXMuZ2V0KGlkLmlkKSA/PyBbXSkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBpdGVtLmdyb3VwID8/ICcnO1xuXHRcdFx0bGV0IGVudHJ5ID0gYWN0aW9ucy5maW5kKGEgPT4gYVswXSA9PT0gZ3JvdXApO1xuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRlbnRyeSA9IFtncm91cCwgW11dO1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXHRcdFx0ZW50cnlbMV0ucHVzaChuZXcgTWVudUl0ZW1BY3Rpb24oaXRlbS5jb21tYW5kLCBpdGVtLmFsdCwge30sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29tbWFuZFNlcnZpY2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsIGRpc3Bvc2UoKSB7IH0sIGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMgfTtcblx0fVxuXHRnZXRNZW51QWN0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdGdldE1lbnVDb250ZXh0cygpIHsgcmV0dXJuIG5ldyBTZXQ8c3RyaW5nPigpOyB9XG5cdHJlc2V0SGlkZGVuU3RhdGVzKCkgeyB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRGaXh0dXJlU2VydmljZXNPcHRpb25zIHtcblx0LyoqIE9ic2VydmFibGUgYmFja2luZyBJQ2hhdEFydGlmYWN0c1NlcnZpY2UuZ2V0QXJ0aWZhY3RzKCkuYXJ0aWZhY3RHcm91cHMuICovXG5cdHJlYWRvbmx5IGFydGlmYWN0R3JvdXBzPzogSU9ic2VydmFibGU8cmVhZG9ubHkgSUFydGlmYWN0U291cmNlR3JvdXBbXT47XG5cdC8qKiBJbml0aWFsIHRvZG9zIHJldHVybmVkIGZyb20gSUNoYXRUb2RvTGlzdFNlcnZpY2UuZ2V0VG9kb3MoKS4gKi9cblx0cmVhZG9ubHkgdG9kb3M/OiByZWFkb25seSBJQ2hhdFRvZG9bXTtcblx0LyoqIEFjdGl2ZSBub3RpZmljYXRpb24gcmV0dXJuZWQgZnJvbSBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS4gKi9cblx0cmVhZG9ubHkgbm90aWZpY2F0aW9uPzogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbjtcbn1cblxuLyoqXG4gKiBSZWdpc3RlcnMgdGhlIHdpZGUgc2V0IG9mIHNlcnZpY2UgbW9ja3MgbmVlZGVkIHRvIGluc3RhbnRpYXRlIGNoYXQgd2lkZ2V0c1xuICogKGlucHV0IHBhcnQsIGxpc3Qgd2lkZ2V0LCBjb250ZW50IHBhcnRzKS4gQWxsIG9mIHRoZXNlIGFyZSBuby1vcCBtb2Nrc1xuICogc3VpdGFibGUgZm9yIGZpeHR1cmVzLlxuICpcbiAqIENhbGxlcnMgY2FuIG92ZXJyaWRlIGFueSBzZXJ2aWNlIGJ5IHJlZ2lzdGVyaW5nIGl0IGFnYWluIGFmdGVyIHRoaXMgY2FsbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyhyZWc6IFNlcnZpY2VSZWdpc3RyYXRpb24sIG9wdGlvbnM6IElDaGF0Rml4dHVyZVNlcnZpY2VzT3B0aW9ucyA9IHt9KTogdm9pZCB7XG5cdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0cmVnLmRlZmluZShJTWVudVNlcnZpY2UsIEZpeHR1cmVNZW51U2VydmljZSk7XG5cdHJlZy5kZWZpbmUoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBNYXJrZG93blJlbmRlcmVyU2VydmljZSk7XG5cdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJTGlua1ByZXNlbnRhdGlvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxpbmtQcmVzZW50YXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRMaW5rUHJlc2VudGF0aW9uUnVsZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cblx0cmVnLmRlZmluZUluc3RhbmNlKElEZWNvcmF0aW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SURlY29yYXRpb25zU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUJyb3dzZXJWaWV3cyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0S25vd25Ccm93c2VyVmlld3MoKSB7IHJldHVybiBuZXcgTWFwKCk7IH1cblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElUZXh0RmlsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IHVudGl0bGVkID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVTZXJ2aWNlWyd1bnRpdGxlZCddPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYWJlbCA9IEV2ZW50Lk5vbmU7IH0oKTsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZEZpbGVzQ2hhbmdlID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgb25EaWRSdW5PcGVyYXRpb24gPSBFdmVudC5Ob25lOyBvdmVycmlkZSBoYXNQcm92aWRlcigpIHsgcmV0dXJuIGZhbHNlOyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRlbnNpb25TZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElQYXRoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGF0aFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZT4oKSB7IG92ZXJyaWRlIGFzeW5jIGdldEN1cnJlbnRFeHBlcmltZW50cygpIHsgcmV0dXJuIFtdOyB9IG92ZXJyaWRlIGFzeW5jIGdldFRyZWF0bWVudCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSBvdmVycmlkZSBvbkRpZFJlZmV0Y2hBc3NpZ25tZW50cyA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgZ2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2UgeyByZXR1cm4geyBpZDogJycsIGZvbGRlcnM6IFtdLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfTsgfSB9KCkpO1xuXHQvLyBgZ2V0Q29udGFpbmVyYCBzdGFuZHMgaW4gZm9yIHRoZSB3b3JrYmVuY2ggY29udGFpbmVyIHRoYXQgd2lkZ2V0cyB1c2UgdG8gaG9zdFxuXHQvLyBvdmVyZmxvdyBub2RlcyAoc3VnZ2VzdCB3aWRnZXQsIHBvc3QtcGFzdGUgc2VsZWN0b3IpOyB0aGUgZml4dHVyZSBkb2N1bWVudCBib2R5XG5cdC8vIGlzIHRoZSBjbG9zZXN0IGVxdWl2YWxlbnQuXG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBvbkRpZENoYW5nZVdpbmRvd01heGltaXplZCA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGlzVmlzaWJsZSgpIHsgcmV0dXJuIHRydWU7IH0gb3ZlcnJpZGUgZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdzogV2luZG93KTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGFyZ2V0V2luZG93LmRvY3VtZW50LmJvZHk7IH0gfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdEZXNjcmlwdG9yU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlTG9jYXRpb24gPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0RvY3VtZW50U2VydmljZT4oKSB7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJU0NNU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU0NNU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRSZXBvc2l0b3J5ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlbW92ZVJlcG9zaXRvcnkgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG9zaXRvcmllcyA9IFtdO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG9zaXRvcnlDb3VudCA9IDA7XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJRmlsZURpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVEaWFsb2dTZXJ2aWNlPigpIHsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9kdWN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVVwZGF0ZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVwZGF0ZVNlcnZpY2U+KCkgeyBvdmVycmlkZSBvblN0YXRlQ2hhbmdlID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgZ2V0IHN0YXRlKCkgeyByZXR1cm4geyB0eXBlOiBTdGF0ZVR5cGUuVW5pbml0aWFsaXplZCBhcyBjb25zdCB9OyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFjdGlvbldpZGdldFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGlvbldpZGdldFNlcnZpY2U+KCkgeyBvdmVycmlkZSBzaG93KCkgeyB9IG92ZXJyaWRlIGhpZGUoKSB7IH0gb3ZlcnJpZGUgZ2V0IGlzVmlzaWJsZSgpIHsgcmV0dXJuIGZhbHNlOyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlPigpIHsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2libGVWaWV3U2VydmljZT4oKSB7IG92ZXJyaWRlIGdldE9wZW5BcmlhSGludCgpIHsgcmV0dXJuIG51bGw7IH0gfSgpKTtcblxuXHQvLyBDaGF0IHNlcnZpY2VzXG5cdHJlZy5kZWZpbmUoSUNoYXRBZ2VudFNlcnZpY2UsIGNsYXNzIEZpeHR1cmVDaGF0QWdlbnRTZXJ2aWNlIGV4dGVuZHMgQ2hhdEFnZW50U2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgZ2V0RGVmYXVsdEFnZW50KCk6IElDaGF0QWdlbnQge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0cmV0dXJuIHsgZnVsbE5hbWU6ICdHaXRIdWIgQ29waWxvdCcsIGlkOiAnZ2l0aHViQ29waWxvdCcgfSBhcyB1bmtub3duIGFzIElDaGF0QWdlbnQ7XG5cdFx0fVxuXHR9KTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0QWdlbnROYW1lU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFnZW50TmFtZVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldEFnZW50TmFtZVJlc3RyaWN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lKElDaGF0U2VydmljZSwgTW9ja0NoYXRTZXJ2aWNlKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElWb2ljZVNlc3Npb25Db250cm9sbGVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZVNlc3Npb25Db250cm9sbGVyPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSB0YXJnZXRTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBoYXNEcmFmdFRhcmdldCA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb21uaUlucHV0T3BlbiA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFBldFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRQZXRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBlbmFibGVkID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0UGV0RW5hYmxlZCcsIGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB2YXJpYW50ID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0UGV0VmFyaWFudCcsICdzdGFibGUnIGFzIGNvbnN0KTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvblRoZVJ1biA9IG9ic2VydmFibGVWYWx1ZSgnY2hhdFBldE9uVGhlUnVuJywgZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNjYWxlID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0UGV0U2NhbGUnLCAxKTtcblx0XHRvdmVycmlkZSB0b2dnbGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIHNldFZhcmlhbnQoKSB7IH1cblx0XHRvdmVycmlkZSBzZXRPblRoZVJ1bigpIHsgfVxuXHRcdG92ZXJyaWRlIHNldFNjYWxlKHNjYWxlOiBudW1iZXIpIHsgdGhpcy5zY2FsZS5zZXQoc2NhbGUsIHVuZGVmaW5lZCk7IH1cblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkV2lkZ2V0ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEJhY2tncm91bmRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldEFsbFdpZGdldHMoKTogcmVhZG9ubHkgSUNoYXRXaWRnZXRbXSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGdldFdpZGdldEJ5SW5wdXRVcmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldFdpZGdldHNCeUxvY2F0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgcmVnaXN0ZXIoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBhY2NlcHRSZXF1ZXN0KCkgeyB9XG5cdFx0b3ZlcnJpZGUgZGlzcG9zZVJlcXVlc3QoKSB7IH1cblx0XHRvdmVycmlkZSBhY2NlcHRSZXNwb25zZSgpIHsgfVxuXHRcdG92ZXJyaWRlIGFjY2VwdEVsaWNpdGF0aW9uKCkgeyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlZ2lzdGVyUHJvdmlkZXIoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0XHRvdmVycmlkZSBnZXRDaGFuZ2VzRm9yUmVxdWVzdCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldEZpbGVFZGl0c0ZvclJlcXVlc3QoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBvcGVuQ2hhbmdlc0ZvclJlcXVlc3QoKSB7IH1cblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdG92ZXJyaWRlIHJlZ2lzdGVySG9zdCgpIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0b3ZlcnJpZGUgcmVnaXN0ZXJIb3N0KCkgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdElucHV0Tm90aWNlSHViU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdElucHV0Tm90aWNlSHViU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVnaXN0ZXJIb3N0KCkgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdFx0b3ZlcnJpZGUgdG9nZ2xlTm90aWNlRm9jdXMoKSB7IHJldHVybiBmYWxzZTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0V4dGVuc2lvbkRldmVsb3BtZW50ID0gZmFsc2U7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNCdWlsdCA9IHRydWU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IGZhbHNlO1xuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uT3B0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VPcHRpb25Hcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gVGFyZ2V0LlVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIHJlcXVpcmVzQ3VzdG9tTW9kZWxzRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIHN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIGdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBzdXBwb3J0c0RlbGVnYXRpb25Gb3JTZXNzaW9uVHlwZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbk9wdGlvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgcmVzb2x2ZUNoYXRSZXNwb25zZVVyaShfc2Vzc2lvblJlc291cmNlOiBVUkksIGhyZWY6IHN0cmluZykgeyByZXR1cm4gaHJlZjsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRFbnRpdGxlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHF1b3RhcyA9IHt9O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VudGltZW50ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFub255bW91cyA9IEV2ZW50Lk5vbmU7XG5cdFx0Ly8gQSBzaWduZWQtaW4sIHNldC11cCB1c2VyIHNvIHRoZSBwaWNrZXIgcmVuZGVycyBub3JtYWxseSAobm8gUmVzdHJpY3RlZCAvXG5cdFx0Ly8gU2lnbiBJbiBzdGF0ZSkgaW4gZml4dHVyZXMuXG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuUHJvO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlbnRpbWVudCA9IHsgY29tcGxldGVkOiB0cnVlLCBpbnN0YWxsZWQ6IHRydWUgfTtcblx0XHRvdmVycmlkZSByZWFkb25seSBhbm9ueW1vdXMgPSBmYWxzZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBoYXNCeW9rTW9kZWxzID0gZmFsc2U7XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBvbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eSA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxJZHMoKSB7IHJldHVybiBbXTsgfSBvdmVycmlkZSBnZXRWZW5kb3JzKCkgeyByZXR1cm4gW107IH0gb3ZlcnJpZGUgaGFzUmVzb2x2ZWRWZW5kb3IoKSB7IHJldHVybiBmYWxzZTsgfSB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZVRvb2xzID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgb25EaWRQcmVwYXJlVG9vbENhbGxCZWNvbWVVbnJlc3BvbnNpdmUgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBnZXRUb29scygpIHsgcmV0dXJuIFtdOyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBpc0VuYWJsZWQoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIGdldENhY2hlZCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGFzc2VzcygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdENvbnRleHRTZXJ2aWNlPigpIHsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlPigpIHsgfSgpKTtcblx0Ly8gTmVlZGVkIHdoZW5ldmVyIGNoYXQgbWFya2Rvd24gY29udGFpbnMgYSBjb2RlIGJsb2NrOyByZXR1cm5zIG5vIGN1c3RvbSByZW5kZXJlciBzb1xuXHQvLyBjb2RlIGJsb2NrcyBmYWxsIGJhY2sgdG8gdGhlIG5vcm1hbCBlZGl0b3ItYmFja2VkIENvZGVCbG9ja1BhcnQuXG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgaGFzQ29kZUJsb2NrUmVuZGVyZXIoKSB7IHJldHVybiBmYWxzZTsgfVxuXHR9KCkpO1xuXHQvLyBDaGF0IGNvZGUgYmxvY2tzIGdlbmVyYXRlIGEgc3VnZ2VzdGlvbiBpZCBmb3IgZWRpdCB0ZWxlbWV0cnkgd2hlbiB0aGUgcmVzcG9uc2UgY29tcGxldGVzLlxuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFpRWRpdFRlbGVtZXRyeVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGNyZWF0ZVN1Z2dlc3Rpb25JZCgpIHsgcmV0dXJuIEVkaXRTdWdnZXN0aW9uSWQubmV3SWQoKTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnk+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgZ2V0SGlzdG9yeSgpIHsgcmV0dXJuIFtdOyB9IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGlzdG9yeSA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWdpc3RlcigpIHsgcmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9OyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldEFjdGl2ZU5vdGlmaWNhdGlvbigpIHsgcmV0dXJuIG9wdGlvbnMubm90aWZpY2F0aW9uOyB9XG5cdFx0b3ZlcnJpZGUgYW5ub3VuY2VSZW5kZXJlZCgpIHsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UsIG5ldyBDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlKCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZVsnbW9kZWwnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBFdmVudC5Ob25lOyB9KCk7XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCkpO1xuXHQvLyBBZ2VudC1ob3N0IGNoYXQgd2lkZ2V0cyAoZS5nLiB0aGUgdHVybiBjaGFuZ2VzIHN1bW1hcnkgZml4dHVyZXMpIGNyZWF0ZSB0aGVcblx0Ly8gZ2VuZXJpYyBjb25maWcgY2hpcHMgbGFuZSwgd2hpY2ggb3BlbnMgYSBzZXNzaW9uIHN1YnNjcmlwdGlvbi4gUmV0dXJuIGFuXG5cdC8vIGluZXJ0LCBuZXZlci1oeWRyYXRpbmcgc3Vic2NyaXB0aW9uICh2YWx1ZSBgdW5kZWZpbmVkYCkgc28gbm8gY29uZmlnIGNoaXBzXG5cdC8vIHJlbmRlciBhbmQgbm90aGluZyBjcmFzaGVzLlxuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJvb3RTdGF0ZTogSUFnZW50U3Vic2NyaXB0aW9uPFJvb3RTdGF0ZT4gPSB7XG5cdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0dmVyaWZpZWRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRvdmVycmlkZSBnZXRTdWJzY3JpcHRpb248VD4oX2tpbmQ6IFN0YXRlQ29tcG9uZW50cywgX3Jlc291cmNlOiBVUkkpOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxUPj4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2ZXJpZmllZFZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQ+KF9raW5kOiBTdGF0ZUNvbXBvbmVudHMsIF9yZXNvdXJjZTogVVJJKTogSUFnZW50U3Vic2NyaXB0aW9uPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlcj4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVzb2x2ZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb2xkZXIgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldEZvbGRlcigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZW5hYmxlZCA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdH0oKSk7XG5cblx0Y29uc3QgYXJ0aWZhY3RHcm91cHMgPSBvcHRpb25zLmFydGlmYWN0R3JvdXBzID8/IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQXJ0aWZhY3RTb3VyY2VHcm91cFtdPignYXJ0aWZhY3RHcm91cHMnLCBbXSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEFydGlmYWN0c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBcnRpZmFjdHNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRBcnRpZmFjdHMoKTogSUNoYXRBcnRpZmFjdHMge1xuXHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBcnRpZmFjdHM+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhcnRpZmFjdEdyb3VwcyA9IGFydGlmYWN0R3JvdXBzO1xuXHRcdFx0XHRvdmVycmlkZSBzZXRBZ2VudEFydGlmYWN0cygpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBjbGVhckFnZW50QXJ0aWZhY3RzKCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGNsZWFyU3ViYWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0b3ZlcnJpZGUgbWlncmF0ZSgpIHsgfVxuXHRcdFx0fSgpO1xuXHRcdH1cblx0fSgpKTtcblxuXHRjb25zdCB0b2RvcyA9IFsuLi4ob3B0aW9ucy50b2RvcyA/PyBbXSldO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRUb2RvTGlzdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb2RvTGlzdFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVXBkYXRlVG9kb3MgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFRvZG9zKCkgeyByZXR1cm4gWy4uLnRvZG9zXTsgfVxuXHRcdG92ZXJyaWRlIHNldFRvZG9zKCkgeyB9XG5cdFx0b3ZlcnJpZGUgbWlncmF0ZVRv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
