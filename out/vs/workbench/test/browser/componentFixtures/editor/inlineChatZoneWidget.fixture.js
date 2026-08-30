import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { IMenuService, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { MenuService } from "../../../../../platform/actions/common/menuService.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IVoiceModeOnboardingService } from "../../../../contrib/agentsVoice/browser/voiceModeOnboarding.js";
import { IChatInputNotificationService } from "../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js";
import { IDictationOnboardingService } from "../../../../contrib/chat/browser/speechToText/dictationOnboarding.js";
import { IChatInputNoticeHubService } from "../../../../contrib/chat/browser/widget/input/chatInputNoticeHub.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IChatWidgetService, IChatAccessibilityService } from "../../../../contrib/chat/browser/chat.js";
import { IChatContextPickService } from "../../../../contrib/chat/browser/attachments/chatContextPickService.js";
import { IChatAttachmentResolveService } from "../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js";
import { IChatAttachmentWidgetRegistry } from "../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js";
import { IChatContextService } from "../../../../contrib/chat/browser/contextContrib/chatContextService.js";
import { IChatImageCarouselService } from "../../../../contrib/chat/browser/chatImageCarouselService.js";
import { IChatTipService } from "../../../../contrib/chat/browser/chatTipService.js";
import { ChatAgentLocation } from "../../../../contrib/chat/common/constants.js";
import { IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IChatModeService, ChatMode } from "../../../../contrib/chat/common/chatModes.js";
import { ILanguageModelsService } from "../../../../contrib/chat/common/languageModels.js";
import { IChatAgentService } from "../../../../contrib/chat/common/participants/chatAgents.js";
import { IChatSlashCommandService } from "../../../../contrib/chat/common/participants/chatSlashCommands.js";
import { ILanguageModelToolsService } from "../../../../contrib/chat/common/tools/languageModelToolsService.js";
import { IChatArtifactsService } from "../../../../contrib/chat/common/tools/chatArtifactsService.js";
import { IChatTodoListService } from "../../../../contrib/chat/common/tools/chatTodoListService.js";
import { IChatDebugService } from "../../../../contrib/chat/common/chatDebugService.js";
import { IPromptsService } from "../../../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { IChatWidgetHistoryService } from "../../../../contrib/chat/common/widget/chatWidgetHistoryService.js";
import { IChatLayoutService } from "../../../../contrib/chat/common/widget/chatLayoutService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { ISCMService } from "../../../../contrib/scm/common/scm.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IUpdateService, StateType } from "../../../../../platform/update/common/update.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { InlineChatZoneWidget } from "../../../../contrib/inlineChat/browser/inlineChatZoneWidget.js";
import { ChatModel } from "../../../../contrib/chat/common/model/chatModel.js";
import { IChatEditingService } from "../../../../contrib/chat/common/editing/chatEditingService.js";
import { Target } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { ICustomizationHarnessService } from "../../../../contrib/chat/common/customizationHarnessService.js";
import "../../../../contrib/chat/browser/widget/input/editor/chatInputEditorContrib.js";
import "../../../../contrib/inlineChat/browser/media/inlineChat.css";
import "../../../../contrib/chat/browser/widget/media/chat.css";
import "../../../../../editor/contrib/zoneWidget/browser/zoneWidget.css";
import "../../../../../base/browser/ui/codicons/codiconStyles.js";
import { MockChatModeService } from "../../../../contrib/chat/test/common/mockChatModeService.js";
const SAMPLE_CODE = `import { useState, useEffect } from 'react';

interface User {
	id: number;
	name: string;
	email: string;
}

function useUsers() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch('/api/users')
			.then(res => res.json())
			.then(data => {
				setUsers(data);
				setLoading(false);
			});
	}, []);

	return { users, loading };
}

export function UserList() {
	const { users, loading } = useUsers();

	if (loading) {
		return <div>Loading...</div>;
	}

	return (
		<ul>
			{users.map(user => (
				<li key={user.id}>{user.name}</li>
			))}
		</ul>
	);
}
`;
MenuRegistry.appendMenuItem(MenuId.ChatEditorInlineExecute, {
  group: "navigation",
  order: 1,
  command: { id: "inlineChat.accept", title: "Accept" }
});
MenuRegistry.appendMenuItem(MenuId.ChatEditorInlineExecute, {
  group: "navigation",
  order: 2,
  command: { id: "inlineChat.discard", title: "Discard" }
});
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
  group: "navigation",
  order: -1,
  command: { id: "workbench.action.chat.attachContext", title: "+", icon: Codicon.add }
});
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
  group: "navigation",
  order: 3,
  command: { id: "workbench.action.chat.openModelPicker", title: "GPT-4.1" }
});
MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
  group: "navigation",
  order: 4,
  command: { id: "workbench.action.chat.submit", title: "Send", icon: Codicon.newLine }
});
function renderInlineChatZoneWidget({ container, disposableStore, theme }, showTerminationCard) {
  container.style.width = "600px";
  container.style.height = "700px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IContextKeyService, ContextKeyService);
      reg.define(IMenuService, MenuService);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
      reg.defineInstance(IAccessibleViewService, new class extends mock() {
        getOpenAriaHint() {
          return "";
        }
      }());
      reg.defineInstance(IProductService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.urlProtocol = "vscode";
        }
      }());
      reg.defineInstance(ILifecycleService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onBeforeShutdown = Event.None;
          this.onWillShutdown = Event.None;
          this.onDidShutdown = Event.None;
          this.onShutdownVeto = Event.None;
        }
      }());
      reg.defineInstance(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidPerformUserAction = Event.None;
          this.onDidSubmitRequest = Event.None;
          this.requestInProgressObs = observableValue("requestInProgress", false);
        }
        hasSessions() {
          return false;
        }
      }());
      reg.defineInstance(IChatAgentService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeAgents = Event.None;
        }
        getAgents() {
          return [];
        }
        getActivatedAgents() {
          return [];
        }
      }());
      reg.defineInstance(IChatWidgetService, new class extends mock() {
        getWidgetBySessionId() {
          return void 0;
        }
        register() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IChatAccessibilityService, new class extends mock() {
        acceptRequest() {
        }
        acceptResponse() {
        }
      }());
      reg.defineInstance(IChatSlashCommandService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeCommands = Event.None;
        }
        getCommands() {
          return [];
        }
      }());
      reg.defineInstance(IPromptsService, new class extends mock() {
      }());
      reg.defineInstance(IChatLayoutService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.fontFamily = observableValue("fontFamily", null);
          this.fontSize = observableValue("fontSize", 13);
        }
      }());
      reg.defineInstance(IChatTipService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidReceiveTip = Event.None;
        }
        resetSession() {
        }
      }());
      reg.defineInstance(IChatDebugService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidAddEvent = Event.None;
        }
        getEvents() {
          return [];
        }
      }());
      reg.defineInstance(IChatEntitlementService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.sentimentObs = observableValue("sentiment", { completed: true });
          this.anonymousObs = observableValue("anonymous", false);
          this.onDidChangeAnonymous = Event.None;
          this.onDidChangeEntitlement = Event.None;
          this.onDidChangeSentiment = Event.None;
          // A signed-in, set-up user so the model picker renders normally
          // (no Restricted / Sign In state) in this fixture.
          this.sentiment = { completed: true };
          this.entitlement = ChatEntitlement.Pro;
          this.anonymous = false;
          this.hasByokModels = false;
          this.quotas = {};
          this.onDidChangeQuotaRemaining = Event.None;
          this.onDidChangeUsageBasedBilling = Event.None;
        }
      }());
      reg.defineInstance(IChatModeService, new MockChatModeService());
      reg.defineInstance(IChatSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSessionOptions = Event.None;
          this.onDidChangeOptionGroups = Event.None;
          this.onDidChangeAvailability = Event.None;
          this.onDidChangeCustomizations = Event.None;
          this.onDidChangeContentProviderSchemes = Event.None;
          this.onDidChangeItemsProviders = Event.None;
          this.onDidChangeSessionItems = Event.None;
          this.onDidCommitSession = Event.None;
          this.onDidChangeInProgress = Event.None;
        }
        getAllChatSessionContributions() {
          return [];
        }
        sessionSupportsFork() {
          return false;
        }
        supportsDelegationForSessionType() {
          return false;
        }
        getOptionGroupsForSessionType() {
          return void 0;
        }
        getCustomAgentTargetForSessionType() {
          return Target.Undefined;
        }
        requiresCustomModelsForSessionType() {
          return false;
        }
        supportsAutoModelForSessionType() {
          return true;
        }
        getChatSessionContribution() {
          return void 0;
        }
        getCapabilitiesForSessionType() {
          return void 0;
        }
        getSessionOptions() {
          return void 0;
        }
        hasCustomizationsProvider() {
          return false;
        }
      }());
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
      }());
      reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeTools = Event.None;
        }
        getTools() {
          return [];
        }
        observeTools() {
          return observableValue("tools", []);
        }
        getToolSetsForModel() {
          return [];
        }
      }());
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
      reg.defineInstance(IChatContextService, new class extends mock() {
      }());
      reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock() {
      }());
      reg.defineInstance(IChatAttachmentResolveService, new class extends mock() {
      }());
      reg.defineInstance(IChatImageCarouselService, new class extends mock() {
      }());
      reg.defineInstance(IChatArtifactsService, new class extends mock() {
        getArtifacts() {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.artifactGroups = observableValue("artifactGroups", []);
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
      reg.defineInstance(IChatTodoListService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidUpdateTodos = Event.None;
        }
        getTodos() {
          return [];
        }
        setTodos() {
        }
        migrateTodos() {
        }
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
      reg.defineInstance(IChatEditingService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.editingSessionsObs = observableValue("editingSessionsObs", []);
        }
      }());
      reg.defineInstance(IChatInputNotificationService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
        }
        getActiveNotification() {
          return void 0;
        }
        announceRendered() {
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
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSlashCommands = Event.None;
          this.onDidChangeCustomAgents = Event.None;
        }
      }());
      reg.defineInstance(IChatContextPickService, new class extends mock() {
      }());
      reg.defineInstance(IDecorationsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDecorations = Event.None;
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
      }());
      reg.defineInstance(IEditorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidActiveEditorChange = Event.None;
        }
      }());
      reg.defineInstance(ISharedWebContentExtractorService, new class extends mock() {
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
      reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.mainContainerOffset = { top: 0, quickPickTop: 0 };
          this.onDidLayoutMainContainer = Event.None;
          this.onDidLayoutActiveContainer = Event.None;
          this.onDidLayoutContainer = Event.None;
          this.onDidChangeActiveContainer = Event.None;
          this.onDidAddContainer = Event.None;
          this.onDidChangePartVisibility = Event.None;
          this.onDidChangeWindowMaximized = Event.None;
        }
        get mainContainer() {
          return container;
        }
        get activeContainer() {
          return container;
        }
        get mainContainerDimension() {
          return { width: 600, height: 400 };
        }
        get activeContainerDimension() {
          return { width: 600, height: 400 };
        }
        get containers() {
          return [container];
        }
        getContainer() {
          return container;
        }
        whenContainerStylesLoaded() {
          return void 0;
        }
        isVisible() {
          return true;
        }
      }());
      reg.defineInstance(IViewDescriptorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLocation = Event.None;
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
      reg.defineInstance(IExtensionService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeExtensions = Event.None;
        }
      }());
      reg.defineInstance(IPathService, new class extends mock() {
      }());
      reg.defineInstance(IListService, new ListService());
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
      reg.defineInstance(IActionWidgetService, new class extends mock() {
        show() {
        }
        hide() {
        }
        get isVisible() {
          return false;
        }
      }());
      reg.defineInstance(IFileDialogService, new class extends mock() {
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
    }
  });
  const configService = instantiationService.get(IConfigurationService);
  configService.setUserConfiguration("chat", { editor: { fontSize: 14, fontFamily: "default", fontWeight: "normal", lineHeight: 0, wordWrap: "on" } });
  configService.setUserConfiguration("editor", { fontFamily: "monospace", fontLigatures: false, accessibilitySupport: "off" });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    SAMPLE_CODE,
    URI.parse("inmemory://inline-chat-zone.tsx"),
    "typescriptreact"
  ));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    { contributions: [] }
  ));
  editor.setModel(textModel);
  editor.focus();
  const zoneWidget = disposableStore.add(instantiationService.createInstance(
    InlineChatZoneWidget,
    { location: ChatAgentLocation.EditorInline },
    {
      enableWorkingSet: "implicit",
      enableImplicitContext: false,
      renderInputOnTop: false,
      renderInputToolbarBelowInput: true,
      menus: {
        telemetrySource: "inlineChatWidget",
        executeToolbar: MenuId.ChatEditorInlineExecute,
        inputSideToolbar: MenuId.ChatEditorInlineInputSide
      },
      defaultMode: ChatMode.Ask
    },
    { editor },
    () => Promise.resolve()
  ));
  zoneWidget.domNode.classList.add("inline-chat-2");
  zoneWidget.show(new Position(10, 1));
  const dummyModel = disposableStore.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.EditorInline, canUseTools: false }));
  zoneWidget.widget.chatWidget.setModel(dummyModel);
  zoneWidget.widget.chatWidget.setInputPlaceholder("Ask Copilot...");
  zoneWidget.updatePositionAndHeight(new Position(10, 1));
  if (showTerminationCard) {
    zoneWidget.showTerminationCard(
      "The agent ran into an issue and stopped. You can review the changes made so far.",
      instantiationService
    );
  }
}
var inlineChatZoneWidget_fixture_default = defineThemedFixtureGroup({ path: "editor/" }, {
  InlineChatZoneWidget: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (context) => renderInlineChatZoneWidget(context, false)
  }),
  InlineChatZoneWidgetTerminated: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (context) => renderInlineChatZoneWidget(context, true)
  })
});
export {
  inlineChatZoneWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXGlubGluZUNoYXRab25lV2lkZ2V0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQsIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9tZW51U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvdm9pY2VNb2RlT25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25PbmJvYXJkaW5nLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGljZUh1Yi5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UsIElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jb250ZXh0Q29udHJpYi9jaGF0Q29udGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRpcFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0VGlwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlU2VydmljZSwgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFNsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBcnRpZmFjdHMsIElDaGF0QXJ0aWZhY3RzU2VydmljZSwgSUFydGlmYWN0U291cmNlR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3dpZGdldC9jaGF0TGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBSb290U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRab25lV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdFpvbmVXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcblxuLy8gU2lkZS1lZmZlY3QgaW1wb3J0OiByZWdpc3RlcnMgSW5wdXRFZGl0b3JEZWNvcmF0aW9ucyBpbnRvIENoYXRXaWRnZXQuQ09OVFJJQlNcbi8vIHNvIHRoZSBwbGFjZWhvbGRlciBkZWNvcmF0aW9uIGlzIHJlbmRlcmVkLlxuaW1wb3J0ICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dEVkaXRvckNvbnRyaWIuanMnO1xuXG4vLyBDU1MgaW1wb3J0c1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9tZWRpYS9pbmxpbmVDaGF0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9tZWRpYS9jaGF0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb2RpY29ucy9jb2RpY29uU3R5bGVzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9ja0NoYXRNb2RlU2VydmljZS5qcyc7XG5cbmNvbnN0IFNBTVBMRV9DT0RFID0gYGltcG9ydCB7IHVzZVN0YXRlLCB1c2VFZmZlY3QgfSBmcm9tICdyZWFjdCc7XG5cbmludGVyZmFjZSBVc2VyIHtcblx0aWQ6IG51bWJlcjtcblx0bmFtZTogc3RyaW5nO1xuXHRlbWFpbDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiB1c2VVc2VycygpIHtcblx0Y29uc3QgW3VzZXJzLCBzZXRVc2Vyc10gPSB1c2VTdGF0ZTxVc2VyW10+KFtdKTtcblx0Y29uc3QgW2xvYWRpbmcsIHNldExvYWRpbmddID0gdXNlU3RhdGUodHJ1ZSk7XG5cblx0dXNlRWZmZWN0KCgpID0+IHtcblx0XHRmZXRjaCgnL2FwaS91c2VycycpXG5cdFx0XHQudGhlbihyZXMgPT4gcmVzLmpzb24oKSlcblx0XHRcdC50aGVuKGRhdGEgPT4ge1xuXHRcdFx0XHRzZXRVc2VycyhkYXRhKTtcblx0XHRcdFx0c2V0TG9hZGluZyhmYWxzZSk7XG5cdFx0XHR9KTtcblx0fSwgW10pO1xuXG5cdHJldHVybiB7IHVzZXJzLCBsb2FkaW5nIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBVc2VyTGlzdCgpIHtcblx0Y29uc3QgeyB1c2VycywgbG9hZGluZyB9ID0gdXNlVXNlcnMoKTtcblxuXHRpZiAobG9hZGluZykge1xuXHRcdHJldHVybiA8ZGl2PkxvYWRpbmcuLi48L2Rpdj47XG5cdH1cblxuXHRyZXR1cm4gKFxuXHRcdDx1bD5cblx0XHRcdHt1c2Vycy5tYXAodXNlciA9PiAoXG5cdFx0XHRcdDxsaSBrZXk9e3VzZXIuaWR9Pnt1c2VyLm5hbWV9PC9saT5cblx0XHRcdCkpfVxuXHRcdDwvdWw+XG5cdCk7XG59XG5gO1xuXG4vLyBSZWdpc3RlciBmYWtlIG1lbnUgaXRlbXMgb25jZSBhdCBtb2R1bGUgc2NvcGUgKG5vdCBwZXItcmVuZGVyKSB0byBhdm9pZFxuLy8gZHVwbGljYXRlcyB3aGVuIERhcmsgYW5kIExpZ2h0IGZpeHR1cmVzIGFyZSByZW5kZXJlZCBzaW11bHRhbmVvdXNseSxcbi8vIHNpbmNlIE1lbnVSZWdpc3RyeSBpcyBhIGdsb2JhbCBzaW5nbGV0b24uXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxLFxuXHRjb21tYW5kOiB7IGlkOiAnaW5saW5lQ2hhdC5hY2NlcHQnLCB0aXRsZTogJ0FjY2VwdCcgfSxcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMixcblx0Y29tbWFuZDogeyBpZDogJ2lubGluZUNoYXQuZGlzY2FyZCcsIHRpdGxlOiAnRGlzY2FyZCcgfSxcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0SW5wdXQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IC0xLFxuXHRjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQnLCB0aXRsZTogJysnLCBpY29uOiBDb2RpY29uLmFkZCB9LFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRJbnB1dCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMyxcblx0Y29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInLCB0aXRsZTogJ0dQVC00LjEnIH0sXG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdEV4ZWN1dGUsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDQsXG5cdGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3VibWl0JywgdGl0bGU6ICdTZW5kJywgaWNvbjogQ29kaWNvbi5uZXdMaW5lIH0sXG59KTtcblxuZnVuY3Rpb24gcmVuZGVySW5saW5lQ2hhdFpvbmVXaWRnZXQoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHNob3dUZXJtaW5hdGlvbkNhcmQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzYwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICc3MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKSc7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiB0aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lKElNZW51U2VydmljZSwgTWVudVNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblxuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2libGVWaWV3U2VydmljZT4oKSB7XG5cdFx0XHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRPcGVuQXJpYUhpbnQoKSB7IHJldHVybiAnJzsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvZHVjdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdXJsUHJvdG9jb2wgPSAndnNjb2RlJztcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxpZmVjeWNsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxpZmVjeWNsZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25CZWZvcmVTaHV0ZG93biA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRTaHV0ZG93biA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uU2h1dGRvd25WZXRvID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cblx0XHRcdC8vIENoYXQgc2VydmljZXNcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRQZXJmb3JtVXNlckFjdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcXVlc3RJblByb2dyZXNzT2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdyZXF1ZXN0SW5Qcm9ncmVzcycsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgaGFzU2Vzc2lvbnMoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEFnZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFnZW50U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWdlbnRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWdlbnRzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZhdGVkQWdlbnRzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvbklkKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYWNjZXB0UmVxdWVzdCgpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBhY2NlcHRSZXNwb25zZSgpIHsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb21tYW5kcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldENvbW1hbmRzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVByb21wdHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9tcHRzU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRMYXlvdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0TGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZvbnRGYW1pbHkgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgbnVsbD4oJ2ZvbnRGYW1pbHknLCBudWxsKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZm9udFNpemUgPSBvYnNlcnZhYmxlVmFsdWUoJ2ZvbnRTaXplJywgMTMpO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFRpcFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUaXBTZXJ2aWNlPigpIHtcblx0XHRcdFx0cmVhZG9ubHkgb25EaWRSZWNlaXZlVGlwID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVzZXRTZXNzaW9uKCkgeyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0RGVidWdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0RGVidWdTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRFdmVudCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEV2ZW50cygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VudGltZW50T2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdzZW50aW1lbnQnLCB7IGNvbXBsZXRlZDogdHJ1ZSB9KTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYW5vbnltb3VzT2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdhbm9ueW1vdXMnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQW5vbnltb3VzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRpdGxlbWVudCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VudGltZW50ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0Ly8gQSBzaWduZWQtaW4sIHNldC11cCB1c2VyIHNvIHRoZSBtb2RlbCBwaWNrZXIgcmVuZGVycyBub3JtYWxseVxuXHRcdFx0XHQvLyAobm8gUmVzdHJpY3RlZCAvIFNpZ24gSW4gc3RhdGUpIGluIHRoaXMgZml4dHVyZS5cblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VudGltZW50ID0geyBjb21wbGV0ZWQ6IHRydWUgfTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuUHJvO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhbm9ueW1vdXMgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFzQnlva01vZGVscyA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBxdW90YXMgPSB7fTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbk9wdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU9wdGlvbkdyb3VwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudFByb3ZpZGVyU2NoZW1lcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25JdGVtcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ29tbWl0U2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5Qcm9ncmVzcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHNlc3Npb25TdXBwb3J0c0ZvcmsoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRvdmVycmlkZSBzdXBwb3J0c0RlbGVnYXRpb25Gb3JTZXNzaW9uVHlwZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldEN1c3RvbUFnZW50VGFyZ2V0Rm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBUYXJnZXQuVW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlcXVpcmVzQ3VzdG9tTW9kZWxzRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRvdmVycmlkZSBzdXBwb3J0c0F1dG9Nb2RlbEZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRDYXBhYmlsaXRpZXNGb3JTZXNzaW9uVHlwZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uT3B0aW9ucygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSBoYXNDdXN0b21pemF0aW9uc1Byb3ZpZGVyKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFZlbmRvcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVG9vbHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRUb29scygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIG9ic2VydmVUb29scygpIHsgcmV0dXJuIG9ic2VydmFibGVWYWx1ZSgndG9vbHMnLCBbXSk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9vbFNldHNGb3JNb2RlbCgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudFNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBtb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbnNTZXJ2aWNlWydtb2RlbCddPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0fSgpO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0ge1xuXHRcdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dmVyaWZpZWRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdH07XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb2xkZXIgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRGb2xkZXIoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdENvbnRleHRTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRJbWFnZUNhcm91c2VsU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0QXJ0aWZhY3RzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFydGlmYWN0cygpOiBJQ2hhdEFydGlmYWN0cyB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBcnRpZmFjdHM+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYXJ0aWZhY3RHcm91cHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFydGlmYWN0U291cmNlR3JvdXBbXT4oJ2FydGlmYWN0R3JvdXBzJywgW10pO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgc2V0QWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGNsZWFyQWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGNsZWFyU3ViYWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIG1pZ3JhdGUoKSB7IH1cblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRUb2RvTGlzdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb2RvTGlzdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFVwZGF0ZVRvZG9zID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9kb3MoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBzZXRUb2RvcygpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBtaWdyYXRlVG9kb3MoKSB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0SGlzdG9yeSgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGlzdG9yeSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0RWRpdGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRFZGl0aW5nU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGVkaXRpbmdTZXNzaW9uc09icyA9IG9ic2VydmFibGVWYWx1ZSgnZWRpdGluZ1Nlc3Npb25zT2JzJywgW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlTm90aWZpY2F0aW9uKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFubm91bmNlUmVuZGVyZWQoKSB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWdpc3Rlckhvc3QoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWdpc3Rlckhvc3QoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRJbnB1dE5vdGljZUh1YlNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRJbnB1dE5vdGljZUh1YlNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWdpc3Rlckhvc3QoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0XHRcdFx0b3ZlcnJpZGUgdG9nZ2xlTm90aWNlRm9jdXMoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGVjb3JhdGlvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEZWNvcmF0aW9uc1NlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZURlY29yYXRpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVGV4dEZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB1bnRpdGxlZCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZVsndW50aXRsZWQnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lOyB9KCk7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRmlsZXNDaGFuZ2UgPSBFdmVudC5Ob25lOyBvdmVycmlkZSByZWFkb25seSBvbkRpZFJ1bk9wZXJhdGlvbiA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZT4oKSB7IG92ZXJyaWRlIGFzeW5jIGdldEN1cnJlbnRFeHBlcmltZW50cygpIHsgcmV0dXJuIFtdOyB9IG92ZXJyaWRlIGFzeW5jIGdldFRyZWF0bWVudCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSBvdmVycmlkZSByZWFkb25seSBvbkRpZFJlZmV0Y2hBc3NpZ25tZW50cyA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IG1haW5Db250YWluZXIoKSB7IHJldHVybiBjb250YWluZXI7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUNvbnRhaW5lcigpIHsgcmV0dXJuIGNvbnRhaW5lcjsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgbWFpbkNvbnRhaW5lckRpbWVuc2lvbigpIHsgcmV0dXJuIHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiA0MDAgfTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlQ29udGFpbmVyRGltZW5zaW9uKCkgeyByZXR1cm4geyB3aWR0aDogNjAwLCBoZWlnaHQ6IDQwMCB9OyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1haW5Db250YWluZXJPZmZzZXQgPSB7IHRvcDogMCwgcXVpY2tQaWNrVG9wOiAwIH07XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRMYXlvdXRDb250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGNvbnRhaW5lcnMoKSB7IHJldHVybiBbY29udGFpbmVyXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRDb250YWluZXIoKSB7IHJldHVybiBjb250YWluZXI7IH1cblx0XHRcdFx0b3ZlcnJpZGUgd2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBpc1Zpc2libGUoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdEZXNjcmlwdG9yU2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9jYXRpb24gPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7IHJldHVybiB7IGlkOiAnJywgZm9sZGVyczogW10sIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9OyB9IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnMgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQYXRoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGF0aFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElMaXN0U2VydmljZSwgbmV3IExpc3RTZXJ2aWNlKCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElOb3RlYm9va0RvY3VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTQ01TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTQ01TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRSZXBvc2l0b3J5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZW1vdmVSZXBvc2l0b3J5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVwb3NpdG9yaWVzID0gW107XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG9zaXRvcnlDb3VudCA9IDA7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBY3Rpb25XaWRnZXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3Rpb25XaWRnZXRTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgc2hvdygpIHsgfSBvdmVycmlkZSBoaWRlKCkgeyB9IG92ZXJyaWRlIGdldCBpc1Zpc2libGUoKSB7IHJldHVybiBmYWxzZTsgfSB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElGaWxlRGlhbG9nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZURpYWxvZ1NlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElVcGRhdGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcGRhdGVTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25TdGF0ZUNoYW5nZSA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldCBzdGF0ZSgpIHsgcmV0dXJuIHsgdHlwZTogU3RhdGVUeXBlLlVuaW5pdGlhbGl6ZWQgYXMgY29uc3QgfTsgfSB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Ly8gQ29uZmlndXJlIGNoYXQgZWRpdG9yIHNldHRpbmdzIHJlcXVpcmVkIGJ5IENoYXRFZGl0b3JPcHRpb25zXG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQnLCB7IGVkaXRvcjogeyBmb250U2l6ZTogMTQsIGZvbnRGYW1pbHk6ICdkZWZhdWx0JywgZm9udFdlaWdodDogJ25vcm1hbCcsIGxpbmVIZWlnaHQ6IDAsIHdvcmRXcmFwOiAnb24nIH0gfSk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIHsgZm9udEZhbWlseTogJ21vbm9zcGFjZScsIGZvbnRMaWdhdHVyZXM6IGZhbHNlLCBhY2Nlc3NpYmlsaXR5U3VwcG9ydDogJ29mZicgfSk7XG5cblx0Y29uc3QgdGV4dE1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0U0FNUExFX0NPREUsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2lubGluZS1jaGF0LXpvbmUudHN4JyksXG5cdFx0J3R5cGVzY3JpcHRyZWFjdCdcblx0KSk7XG5cblx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdGNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxNCxcblx0XHRcdGN1cnNvckJsaW5raW5nOiAnc29saWQnLFxuXHRcdH0sXG5cdFx0eyBjb250cmlidXRpb25zOiBbXSB9IHNhdGlzZmllcyBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnNcblx0KSk7XG5cblx0ZWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cdGVkaXRvci5mb2N1cygpO1xuXG5cdGNvbnN0IHpvbmVXaWRnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdElubGluZUNoYXRab25lV2lkZ2V0LFxuXHRcdHsgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSB9LFxuXHRcdHtcblx0XHRcdGVuYWJsZVdvcmtpbmdTZXQ6ICdpbXBsaWNpdCcsXG5cdFx0XHRlbmFibGVJbXBsaWNpdENvbnRleHQ6IGZhbHNlLFxuXHRcdFx0cmVuZGVySW5wdXRPblRvcDogZmFsc2UsXG5cdFx0XHRyZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0OiB0cnVlLFxuXHRcdFx0bWVudXM6IHtcblx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnaW5saW5lQ2hhdFdpZGdldCcsXG5cdFx0XHRcdGV4ZWN1dGVUb29sYmFyOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZUV4ZWN1dGUsXG5cdFx0XHRcdGlucHV0U2lkZVRvb2xiYXI6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lSW5wdXRTaWRlLFxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHRNb2RlOiBDaGF0TW9kZS5Bc2ssXG5cdFx0fSxcblx0XHR7IGVkaXRvciB9LFxuXHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHQpKTtcblxuXHQvLyBNYXRjaCB3aGF0IElubGluZUNoYXRDb250cm9sbGVyIGRvZXMgaW4gdGhlIHJlYWwgcHJvZHVjdCBzbyB0aGF0IHRoZVxuXHQvLyBpbmxpbmUtY2hhdC0yIHNwZWNpZmljIHN0eWxlcyAodG9vbGJhciBsYXlvdXQsIGF0dGFjaG1lbnQgcm93IHNpemluZykgYXBwbHkuXG5cdHpvbmVXaWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdpbmxpbmUtY2hhdC0yJyk7XG5cblx0em9uZVdpZGdldC5zaG93KG5ldyBQb3NpdGlvbigxMCwgMSkpO1xuXG5cdGNvbnN0IGR1bW15TW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLCBjYW5Vc2VUb29sczogZmFsc2UgfSkpO1xuXHR6b25lV2lkZ2V0LndpZGdldC5jaGF0V2lkZ2V0LnNldE1vZGVsKGR1bW15TW9kZWwpO1xuXHR6b25lV2lkZ2V0LndpZGdldC5jaGF0V2lkZ2V0LnNldElucHV0UGxhY2Vob2xkZXIoJ0FzayBDb3BpbG90Li4uJyk7XG5cblx0Ly8gRm9yY2UgYSByZWxheW91dCBhZnRlciB0aGUgaW5pdGlhbCBzaG93IHNvIHRoYXQgdGhlIGNoYXQgd2lkZ2V0J3Ncblx0Ly8gY29udGVudEhlaWdodCAod2hpY2ggaW5jbHVkZXMgdGhlIHRvb2xiYXIgcm93IHJlbmRlcmVkIGJlbG93IHRoZSBpbnB1dClcblx0Ly8gaXMgZnVsbHkgbWVhc3VyZWQgYW5kIHRoZSB6b25lIHdpZGdldCBhZGp1c3RzIGl0cyBoZWlnaHQgYWNjb3JkaW5nbHkuXG5cdHpvbmVXaWRnZXQudXBkYXRlUG9zaXRpb25BbmRIZWlnaHQobmV3IFBvc2l0aW9uKDEwLCAxKSk7XG5cblx0aWYgKHNob3dUZXJtaW5hdGlvbkNhcmQpIHtcblx0XHR6b25lV2lkZ2V0LnNob3dUZXJtaW5hdGlvbkNhcmQoXG5cdFx0XHQnVGhlIGFnZW50IHJhbiBpbnRvIGFuIGlzc3VlIGFuZCBzdG9wcGVkLiBZb3UgY2FuIHJldmlldyB0aGUgY2hhbmdlcyBtYWRlIHNvIGZhci4nLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnZWRpdG9yLycgfSwge1xuXHRJbmxpbmVDaGF0Wm9uZVdpZGdldDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JywgYmxvY2tzQ2k6IHRydWUgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJJbmxpbmVDaGF0Wm9uZVdpZGdldChjb250ZXh0LCBmYWxzZSksXG5cdH0pLFxuXHRJbmxpbmVDaGF0Wm9uZVdpZGdldFRlcm1pbmF0ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcsIGJsb2Nrc0NpOiB0cnVlIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVySW5saW5lQ2hhdFpvbmVXaWRnZXQoY29udGV4dCwgdHJ1ZSksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBa0Q7QUFDM0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjLFFBQVEsb0JBQW9CO0FBQ25ELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsaUJBQWlCLCtCQUErQjtBQUN6RCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQixpQ0FBaUM7QUFDOUQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQkFBMkI7QUFDcEMs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
