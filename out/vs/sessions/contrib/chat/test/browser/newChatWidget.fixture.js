import * as dom from "../../../../../base/browser/dom.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { extUri } from "../../../../../base/common/resources.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IRemoteAgentHostService } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IChatTipService } from "../../../../../workbench/contrib/chat/browser/chatTipService.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js";
import { IMicCaptureService } from "../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { IVoiceInputModeService } from "../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js";
import { IAICustomizationWorkspaceService } from "../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { IPromptsService } from "../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { IHistoryService } from "../../../../../workbench/services/history/common/history.js";
import { ISearchService } from "../../../../../workbench/services/search/common/search.js";
import { registerChatFixtureServices } from "../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { activeSessionViewBackground } from "../../../../common/theme.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsRecentWorkspacesService } from "../../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { SessionStatus, SessionTypeAuthRequirement } from "../../../../services/sessions/common/session.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "../../../agentFeedback/browser/agentFeedbackService.js";
import { IAquariumService } from "../../../aquarium/browser/aquariumOverlay.js";
import { computeIssueIcon, computePullRequestIcon, GitHubIssueState, GitHubPullRequestState } from "../../../github/common/types.js";
import { NewChatView } from "../../browser/chatView.js";
import { INewSessionComposerService, NewSessionComposerService } from "../../browser/newSessionComposerService.js";
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from "../../browser/newChatVoice.js";
import "../../../../browser/media/style.css";
import "../../../../browser/parts/media/sessionView.css";
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 560;
async function renderNewChatWidget(context, options = {}) {
  const { container, disposableStore } = context;
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    commentCount = 0,
    showTip = false,
    promptOptions,
    selectedOptionIndex,
    editedInput
  } = options;
  const feedbackItems = Array.from({ length: commentCount }, (_, index) => ({
    id: `feedback-${index}`,
    text: `Comment ${index + 1}`,
    resourceUri: URI.file(`/workspace/src/file-${index + 1}.ts`),
    range: new Range(index + 1, 1, index + 1, 8),
    sessionResource: AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
    kind: AgentFeedbackKind.UserReview,
    state: AgentFeedbackState.Accepted
  }));
  const workspace = createFixtureWorkspace();
  const sessionTypes = createFixtureSessionTypes();
  const provider = createFixtureProvider(workspace, sessionTypes);
  const activeSession = promptOptions ? createFixtureActiveSession(workspace, sessionTypes[0]) : void 0;
  const activeSessionObservable = observableValue("activeSession", activeSession);
  const composerService = disposableStore.add(new NewSessionComposerService());
  const sessionsService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = activeSessionObservable;
    }
  }();
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      reg.defineInstance(IUriIdentityService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.extUri = extUri;
        }
      }());
      reg.defineInstance(INewSessionComposerService, composerService);
      reg.defineInstance(IChatTipService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidDismissTip = Event.None;
          this.onDidNavigateTip = Event.None;
          this.onDidHideTip = Event.None;
          this.onDidDisableTips = Event.None;
        }
        getWelcomeTip() {
          return showTip ? { id: "fixture-tip", content: new MarkdownString("**Tip:** Reference files or folders with # to give the agent more context.") } : void 0;
        }
        resetSession() {
        }
        hasMultipleTips() {
          return false;
        }
      }());
      reg.defineInstance(IQuickInputService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onShow = Event.None;
          this.onHide = Event.None;
        }
      }());
      reg.defineInstance(ISearchService, new class extends mock() {
      }());
      reg.defineInstance(ISessionsManagementService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSessionTypes = Event.None;
        }
        getSessionTypesForFolder() {
          return activeSession ? sessionTypes.map((sessionType) => ({ providerId: provider.id, sessionType })) : [];
        }
      }());
      reg.defineInstance(ISessionsService, sessionsService);
      reg.defineInstance(ISessionsProvidersService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeProviders = Event.None;
        }
        getProviders() {
          return activeSession ? [provider] : [];
        }
        getProvider(providerId) {
          return providerId === provider.id ? provider : void 0;
        }
      }());
      reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeRecentWorkspaces = Event.None;
        }
        getRecentWorkspaces() {
          return [];
        }
        addRecentWorkspace() {
        }
        removeRecentWorkspace() {
        }
        clearCheckedWorkspace() {
        }
      }());
      reg.defineInstance(IRemoteAgentHostService, new class extends mock() {
      }());
      reg.defineInstance(IAgentHostFilterService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
          this.onDidChangeDiscovering = Event.None;
          this.selectedProviderId = void 0;
          this.hosts = [];
          this.isDiscovering = false;
        }
        async rediscover() {
        }
      }());
      reg.defineInstance(IAquariumService, new class extends mock() {
        mountToggle() {
          return { dispose() {
          }, setHostVisible() {
          } };
        }
      }());
      reg.defineInstance(IAgentFeedbackService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeFeedback = Event.None;
          this.onDidChangeFeedbackScope = Event.None;
        }
        getFeedback(sessionResource) {
          return sessionResource.toString() === AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString() ? feedbackItems : [];
        }
        getFeedbackSessionResource() {
          return void 0;
        }
        async revealFeedback() {
        }
      }());
      reg.defineInstance(IHistoryService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        async getFilteredPromptSlashCommands() {
          return [];
        }
      }());
      reg.defineInstance(IPromptsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSlashCommands = Event.None;
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSlashCommands = Event.None;
        }
        async getSlashCommands() {
          return [];
        }
      }());
      reg.defineInstance(INewChatVoiceTargetService, disposableStore.add(new NewChatVoiceTargetService(
        sessionsService,
        new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeFocusedSession = Event.None;
          }
        }()
      )));
      reg.defineInstance(IVoiceInputModeService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.selectedMode = observableValue("selectedMode", "voice");
          this.voiceAvailable = observableValue("voiceAvailable", false);
          this.dictationAvailable = observableValue("dictationAvailable", false);
          this.handsFree = observableValue("handsFree", true);
          this.simulatedVoiceState = observableValue("simulatedVoiceState", void 0);
          this.simulatedHandsFree = observableValue("simulatedHandsFree", void 0);
          this.simulatedVersion = observableValue("simulatedVersion", void 0);
          this.simulatedHover = observableValue("simulatedHover", false);
        }
      }());
      reg.defineInstance(IVoiceSessionController, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isConnected = observableValue("isConnected", false);
          this.isConnecting = observableValue("isConnecting", false);
          this.voiceState = observableValue("voiceState", "idle");
          this.targetSession = observableValue("targetSession", void 0);
          this.hasDraftTarget = observableValue("hasDraftTarget", false);
          this.omniInputOpen = observableValue("omniInputOpen", false);
          this.transcriptTurns = observableValue("transcriptTurns", []);
        }
      }());
      reg.defineInstance(ITtsPlaybackService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.analyserNode = void 0;
        }
      }());
      reg.defineInstance(IMicCaptureService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.analyserNode = void 0;
        }
      }());
      reg.defineInstance(IChatSpeechToTextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeState = Event.None;
          this.onDidChangePreparingModel = Event.None;
          this.onDidChangeDownloadingModel = Event.None;
          this.state = ChatSpeechToTextState.Idle;
          this.isConfigured = false;
          this.isPreparingModel = false;
          this.isDownloadingModel = false;
        }
      }());
    }
  });
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.classList.add("monaco-workbench", "agent-sessions-workbench");
  const sessionView = dom.append(container, dom.$(".session-view.is-active"));
  sessionView.style.width = "100%";
  sessionView.style.height = "100%";
  sessionView.style.backgroundColor = asCssVariable(activeSessionViewBackground);
  sessionView.style.setProperty("--session-view-background", asCssVariable(activeSessionViewBackground));
  const sessionViewContent = dom.append(sessionView, dom.$(".session-view-content"));
  sessionViewContent.style.width = "100%";
  sessionViewContent.style.height = "100%";
  const view = disposableStore.add(instantiationService.createInstance(NewChatView, false, {
    renderSessionTypePickerInControls: constObservable(!promptOptions)
  }));
  sessionViewContent.appendChild(view.element);
  view.layout(width, height, 0, 0);
  if (promptOptions) {
    composerService.activeComposer.get()?.showPromptOptions(promptOptions);
    if (promptOptions.kind === "resolved" && selectedOptionIndex !== void 0) {
      const buttons = view.element.querySelectorAll(".new-session-prompt-option.monaco-button");
      buttons[selectedOptionIndex]?.click();
      await Promise.resolve();
      await Promise.resolve();
    }
    if (editedInput !== void 0) {
      view.prefillInput(editedInput);
    }
  }
}
var newChatWidget_fixture_default = defineThemedFixtureGroup({ path: "sessions/chat/newWidget/" }, {
  NewSessionComments: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, { commentCount: 3 })
  }),
  NewSessionTip: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, { showTip: true })
  }),
  PromptOptionsLoading: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, { promptOptions: { kind: "loading" } })
  }),
  PromptOptionsStandard: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, { promptOptions: { kind: "resolved", options: createStandardPromptOptions() } })
  }),
  PromptOptionsGitHubMixed: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, { promptOptions: { kind: "resolved", options: createMixedPromptOptions() } })
  }),
  PromptOptionsSelected: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, {
      promptOptions: { kind: "resolved", options: createStandardPromptOptions() },
      selectedOptionIndex: 0
    })
  }),
  PromptOptionsEditedDisabled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => {
      const promptOptions = createStandardPromptOptions();
      return renderNewChatWidget(context, {
        promptOptions: { kind: "resolved", options: promptOptions },
        selectedOptionIndex: 0,
        editedInput: `${promptOptions[0].prompt} Add a regression test too.`
      });
    }
  }),
  PromptOptionsNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, {
      width: 420,
      height: 760,
      promptOptions: { kind: "resolved", options: createMixedPromptOptions() }
    })
  })
});
function createFixtureWorkspace() {
  const resource = URI.file("C:\\Code\\vscode");
  return {
    uri: resource,
    label: "microsoft/vscode",
    icon: Codicon.repo,
    folders: [{
      root: resource,
      workingDirectory: resource,
      name: "microsoft/vscode",
      description: void 0,
      gitRepository: {
        uri: resource,
        workTreeUri: void 0,
        baseBranchName: "main",
        gitHubInfo: constObservable({ owner: "microsoft", repo: "vscode" })
      }
    }],
    requiresWorkspaceTrust: true,
    isVirtualWorkspace: false
  };
}
function createFixtureSessionTypes() {
  return [
    {
      id: "copilotcli",
      label: "Copilot CLI",
      icon: Codicon.terminal,
      authRequirement: SessionTypeAuthRequirement.None
    },
    {
      id: "claude",
      label: "Claude",
      icon: Codicon.sparkle,
      authRequirement: SessionTypeAuthRequirement.None
    }
  ];
}
function createFixtureProvider(workspace, sessionTypes) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = "fixture-provider";
      this.label = "Fixture Provider";
      this.icon = Codicon.terminal;
      this.order = 0;
      this.sessionTypes = sessionTypes;
      this.onDidChangeSessionTypes = Event.None;
      this.onDidChangeSessions = Event.None;
      this.onDidChangeModels = Event.None;
      this.browseActions = [];
    }
    getSessions() {
      return [];
    }
    resolveWorkspace(folderUri) {
      return folderUri.toString() === workspace.folders[0].root.toString() ? workspace : void 0;
    }
    getModelsSnapshot() {
      return {
        models: [],
        desiredModelResolution: { kind: "notRequested" },
        modelTarget: "agent-host-copilotcli"
      };
    }
    getModelPickerOptions() {
      return {
        useGroupedModelPicker: true,
        showFeatured: false,
        showUnavailableFeatured: false,
        showManageModelsAction: false,
        showAutoModel: true
      };
    }
    setModel() {
    }
  }();
}
function createFixtureActiveSession(workspace, sessionType) {
  const activeChat = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("fixture-chat://new-session");
    }
  }();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.from({ scheme: "fixture-session", path: "/fixture-session" });
      this.sessionId = "fixture-session";
      this.providerId = "fixture-provider";
      this.sessionType = sessionType.id;
      this.status = constObservable(SessionStatus.Untitled);
      this.isCreated = constObservable(false);
      this.loading = constObservable(false);
      this.workspace = constObservable(workspace);
      this.modelId = constObservable(void 0);
      this.activeChat = constObservable(activeChat);
    }
  }();
}
function createStandardPromptOptions() {
  return [
    {
      id: "standard:implementFeature",
      title: "Implement a feature",
      description: "Describe what you want to build",
      prompt: "Help me implement [describe the feature] in this project. Ask me questions if anything is unclear regarding the intended behaviour.",
      placeholder: "[describe the feature]",
      icon: Codicon.lightbulbSparkleAutofix
    },
    {
      id: "standard:fixBug",
      title: "Fix a bug",
      description: "Describe the unexpected behavior",
      prompt: "Help me fix [describe the bug] in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.",
      placeholder: "[describe the bug]",
      icon: Codicon.bug
    },
    {
      id: "standard:fixCi",
      title: "Fix CI",
      description: "Describe a failing check or paste a link",
      prompt: "Help me fix the failing CI for [describe the CI failure or paste a link] in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.",
      placeholder: "[describe the CI failure or paste a link]",
      icon: Codicon.runErrors
    }
  ];
}
function createMixedPromptOptions() {
  return [
    {
      id: "githubIssue:327101",
      title: "Tackle issue",
      titleDetail: "#327101",
      description: "Improve the accessibility of inline chat controls",
      prompt: 'Tackle the following issue and create a pull request for it: "Improve the accessibility of inline chat controls" (https://github.com/microsoft/vscode/issues/327101).',
      placeholder: "",
      icon: computeIssueIcon(GitHubIssueState.Open, void 0)
    },
    {
      id: "githubIssue:326842",
      title: "Tackle issue",
      titleDetail: "#326842",
      description: "Preserve editor state when switching sessions",
      prompt: 'Tackle the following issue and create a pull request for it: "Preserve editor state when switching sessions" (https://github.com/microsoft/vscode/issues/326842).',
      placeholder: "",
      icon: computeIssueIcon(GitHubIssueState.Open, void 0)
    },
    {
      id: "githubCiFailure:329629",
      title: "Fix CI",
      titleDetail: "#329629",
      description: "Add GitHub prompt variation to onboarding",
      prompt: 'The following pull request has failing CI checks: "Add GitHub prompt variation to onboarding" (https://github.com/microsoft/vscode/pull/329629). Investigate the failures and resolve them.',
      placeholder: "",
      icon: computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true })
    }
  ];
}
export {
  newChatWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxcbmV3Q2hhdFdpZGdldC5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUNoYXRUaXBTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRTdGF0ZSwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWljQ2FwdHVyZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvbWljQ2FwdHVyZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLCBWb2ljZUlucHV0TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUlucHV0TW9kZS92b2ljZUlucHV0TW9kZS5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2NoYXQvY2hhdEZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGRlZmluZUNvbXBvbmVudEZpeHR1cmUsIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IGFjdGl2ZVNlc3Npb25WaWV3QmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdEZpbHRlci9jb21tb24vYWdlbnRIb3N0RmlsdGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBJU2Vzc2lvblR5cGUsIFNlc3Npb25TdGF0dXMsIFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSwgQWdlbnRGZWVkYmFja0tpbmQsIEFnZW50RmVlZGJhY2tTdGF0ZSwgSUFnZW50RmVlZGJhY2ssIElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXF1YXJpdW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYXF1YXJpdW0vYnJvd3Nlci9hcXVhcml1bU92ZXJsYXkuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUlzc3VlSWNvbiwgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbiwgR2l0SHViSXNzdWVTdGF0ZSwgR2l0SHViUHVsbFJlcXVlc3RTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgTmV3Q2hhdFZpZXcgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRWaWV3LmpzJztcbmltcG9ydCB7IElOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLCBJTmV3U2Vzc2lvblByb21wdE9wdGlvbiwgTmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZSwgTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSwgTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdFZvaWNlLmpzJztcblxuaW1wb3J0ICcuLi8uLi8uLi8uLi9icm93c2VyL21lZGlhL3N0eWxlLmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbWVkaWEvc2Vzc2lvblZpZXcuY3NzJztcblxuY29uc3QgREVGQVVMVF9XSURUSCA9IDgwMDtcbmNvbnN0IERFRkFVTFRfSEVJR0hUID0gNTYwO1xuXG5pbnRlcmZhY2UgSU5ld0NoYXRXaWRnZXRGaXh0dXJlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHdpZHRoPzogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbW1lbnRDb3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgc2hvd1RpcD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByb21wdE9wdGlvbnM/OiBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlO1xuXHRyZWFkb25seSBzZWxlY3RlZE9wdGlvbkluZGV4PzogbnVtYmVyO1xuXHRyZWFkb25seSBlZGl0ZWRJbnB1dD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZW5kZXJzIHRoZSB3aG9sZSBuZXctc2Vzc2lvbiBjb21wb3NlciAoYE5ld0NoYXRWaWV3YCBcdTIxOTIgYE5ld0NoYXRXaWRnZXRgKSBpbnNpZGVcbiAqIGEgYC5zZXNzaW9uLXZpZXdgIHNvIHRoZSBkcmFmdC1jb21tZW50cyBiYW5uZXIgc2l0cyBhYm92ZSB0aGUgaW5wdXQgdGhlIHdheSBpdFxuICogZG9lcyBpbiB0aGUgQWdlbnRzIHdpbmRvdy5cbiAqXG4gKiBEZWxpYmVyYXRlbHkgYSBzZXBhcmF0ZSBmaWxlIGZyb20gYG5ld0NoYXRJbnB1dC5maXh0dXJlLnRzYDogcHVsbGluZ1xuICogYE5ld0NoYXRWaWV3YCBpbnRvIHRoYXQgbW9kdWxlIHdvdWxkIGNoYW5nZSB0aGUgb3JkZXIgaXRzIHN0eWxlc2hlZXRzIGFyZVxuICogaW5qZWN0ZWQgaW4sIGFuZCBgLm5ldy1jaGF0LWJvdHRvbS1jb250YWluZXJgIGlzIHN0eWxlZCBieSB0d28gZXF1YWxseVxuICogc3BlY2lmaWMgcnVsZXMgKGBjaGF0V2lkZ2V0LmNzc2AgdnMgYG5ld0NoYXRJblNlc3Npb24uY3NzYCkgdGhhdCBzb3VyY2Ugb3JkZXJcbiAqIGRlY2lkZXMgYmV0d2Vlbi5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVuZGVyTmV3Q2hhdFdpZGdldChjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSU5ld0NoYXRXaWRnZXRGaXh0dXJlT3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUgfSA9IGNvbnRleHQ7XG5cdGNvbnN0IHtcblx0XHR3aWR0aCA9IERFRkFVTFRfV0lEVEgsXG5cdFx0aGVpZ2h0ID0gREVGQVVMVF9IRUlHSFQsXG5cdFx0Y29tbWVudENvdW50ID0gMCxcblx0XHRzaG93VGlwID0gZmFsc2UsXG5cdFx0cHJvbXB0T3B0aW9ucyxcblx0XHRzZWxlY3RlZE9wdGlvbkluZGV4LFxuXHRcdGVkaXRlZElucHV0LFxuXHR9ID0gb3B0aW9ucztcblx0Y29uc3QgZmVlZGJhY2tJdGVtczogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IGNvbW1lbnRDb3VudCB9LCAoXywgaW5kZXgpID0+ICh7XG5cdFx0aWQ6IGBmZWVkYmFjay0ke2luZGV4fWAsXG5cdFx0dGV4dDogYENvbW1lbnQgJHtpbmRleCArIDF9YCxcblx0XHRyZXNvdXJjZVVyaTogVVJJLmZpbGUoYC93b3Jrc3BhY2Uvc3JjL2ZpbGUtJHtpbmRleCArIDF9LnRzYCksXG5cdFx0cmFuZ2U6IG5ldyBSYW5nZShpbmRleCArIDEsIDEsIGluZGV4ICsgMSwgOCksXG5cdFx0c2Vzc2lvblJlc291cmNlOiBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSxcblx0XHRraW5kOiBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3LFxuXHRcdHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQsXG5cdH0pKTtcblx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlRml4dHVyZVdvcmtzcGFjZSgpO1xuXHRjb25zdCBzZXNzaW9uVHlwZXMgPSBjcmVhdGVGaXh0dXJlU2Vzc2lvblR5cGVzKCk7XG5cdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlRml4dHVyZVByb3ZpZGVyKHdvcmtzcGFjZSwgc2Vzc2lvblR5cGVzKTtcblx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHByb21wdE9wdGlvbnMgPyBjcmVhdGVGaXh0dXJlQWN0aXZlU2Vzc2lvbih3b3Jrc3BhY2UsIHNlc3Npb25UeXBlc1swXSkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGFjdGl2ZVNlc3Npb25PYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIGFjdGl2ZVNlc3Npb24pO1xuXHRjb25zdCBjb21wb3NlclNlcnZpY2UgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlKCkpO1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBhY3RpdmVTZXNzaW9uT2JzZXJ2YWJsZTtcblx0fSgpO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY29udGV4dC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IHJlZyA9PiB7XG5cdFx0XHRyZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBleHRVcmk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLCBjb21wb3NlclNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0VGlwU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFRpcFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZERpc21pc3NUaXAgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZE5hdmlnYXRlVGlwID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRIaWRlVGlwID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWREaXNhYmxlVGlwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdlbGNvbWVUaXAoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNob3dUaXAgPyB7IGlkOiAnZml4dHVyZS10aXAnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJyoqVGlwOioqIFJlZmVyZW5jZSBmaWxlcyBvciBmb2xkZXJzIHdpdGggIyB0byBnaXZlIHRoZSBhZ2VudCBtb3JlIGNvbnRleHQuJykgfSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSByZXNldFNlc3Npb24oKTogdm9pZCB7IH1cblx0XHRcdFx0b3ZlcnJpZGUgaGFzTXVsdGlwbGVUaXBzKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVF1aWNrSW5wdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uU2hvdyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uSGlkZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZWFyY2hTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZWFyY2hTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKCkge1xuXHRcdFx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uID8gc2Vzc2lvblR5cGVzLm1hcChzZXNzaW9uVHlwZSA9PiAoeyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgc2Vzc2lvblR5cGUgfSkpIDogW107XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zU2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVByb3ZpZGVycyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFByb3ZpZGVycygpIHsgcmV0dXJuIGFjdGl2ZVNlc3Npb24gPyBbcHJvdmlkZXJdIDogW107IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXI8VCBleHRlbmRzIElTZXNzaW9uc1Byb3ZpZGVyPihwcm92aWRlcklkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0XHRyZXR1cm4gKHByb3ZpZGVySWQgPT09IHByb3ZpZGVyLmlkID8gcHJvdmlkZXIgOiB1bmRlZmluZWQpIGFzIFQgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVJlY2VudFdvcmtzcGFjZXMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRSZWNlbnRXb3Jrc3BhY2VzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0b3ZlcnJpZGUgYWRkUmVjZW50V29ya3NwYWNlKCk6IHZvaWQgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlbW92ZVJlY2VudFdvcmtzcGFjZSgpOiB2b2lkIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBjbGVhckNoZWNrZWRXb3Jrc3BhY2UoKTogdm9pZCB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlbW90ZUFnZW50SG9zdFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZURpc2NvdmVyaW5nID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VsZWN0ZWRQcm92aWRlcklkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBob3N0cyA9IFtdO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0Rpc2NvdmVyaW5nID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlZGlzY292ZXIoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFxdWFyaXVtU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXF1YXJpdW1TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgbW91bnRUb2dnbGUoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZSgpIHsgfSwgc2V0SG9zdFZpc2libGUoKSB7IH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRGZWVkYmFja1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRS50b1N0cmluZygpID8gZmVlZGJhY2tJdGVtcyA6IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJldmVhbEZlZWRiYWNrKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElIaXN0b3J5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSGlzdG9yeVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0RmlsdGVyZWRQcm9tcHRTbGFzaENvbW1hbmRzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVByb21wdHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9tcHRzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFNsYXNoQ29tbWFuZHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZShcblx0XHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdH0oKSxcblx0XHRcdCkpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZUlucHV0TW9kZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZWxlY3RlZE1vZGUgPSBvYnNlcnZhYmxlVmFsdWU8Vm9pY2VJbnB1dE1vZGU+KCdzZWxlY3RlZE1vZGUnLCAndm9pY2UnKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdm9pY2VBdmFpbGFibGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ3ZvaWNlQXZhaWxhYmxlJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkaWN0YXRpb25BdmFpbGFibGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2RpY3RhdGlvbkF2YWlsYWJsZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFuZHNGcmVlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdoYW5kc0ZyZWUnLCB0cnVlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkVm9pY2VTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQ+KCdzaW11bGF0ZWRWb2ljZVN0YXRlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkSGFuZHNGcmVlID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZD4oJ3NpbXVsYXRlZEhhbmRzRnJlZScsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNpbXVsYXRlZFZlcnNpb24gPSBvYnNlcnZhYmxlVmFsdWU8dW5kZWZpbmVkPignc2ltdWxhdGVkVmVyc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNpbXVsYXRlZEhvdmVyID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdzaW11bGF0ZWRIb3ZlcicsIGZhbHNlKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0Nvbm5lY3RlZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb25uZWN0ZWQnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ29ubmVjdGluZyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb25uZWN0aW5nJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB2b2ljZVN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPCdpZGxlJyB8ICdsaXN0ZW5pbmcnIHwgJ3Byb2Nlc3NpbmcnIHwgJ3NwZWFraW5nJyB8ICdlcnJvcic+KCd2b2ljZVN0YXRlJywgJ2lkbGUnKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGFyZ2V0U2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KCd0YXJnZXRTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFzRHJhZnRUYXJnZXQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2hhc0RyYWZ0VGFyZ2V0JywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbW5pSW5wdXRPcGVuID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdvbW5pSW5wdXRPcGVuJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB0cmFuc2NyaXB0VHVybnMgPSBvYnNlcnZhYmxlVmFsdWU8bmV2ZXJbXT4oJ3RyYW5zY3JpcHRUdXJucycsIFtdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVR0c1BsYXliYWNrU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVHRzUGxheWJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYW5hbHlzZXJOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTWljQ2FwdHVyZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1pY0NhcHR1cmVTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYW5hbHlzZXJOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0ZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJlcGFyaW5nTW9kZWwgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZURvd25sb2FkaW5nTW9kZWwgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0NvbmZpZ3VyZWQgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNQcmVwYXJpbmdNb2RlbCA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0Rvd25sb2FkaW5nTW9kZWwgPSBmYWxzZTtcblx0XHRcdH0oKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby13b3JrYmVuY2gnLCAnYWdlbnQtc2Vzc2lvbnMtd29ya2JlbmNoJyk7XG5cblx0Y29uc3Qgc2Vzc2lvblZpZXcgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9uLXZpZXcuaXMtYWN0aXZlJykpO1xuXHRzZXNzaW9uVmlldy5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0c2Vzc2lvblZpZXcuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRzZXNzaW9uVmlldy5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGFjdGl2ZVNlc3Npb25WaWV3QmFja2dyb3VuZCk7XG5cdHNlc3Npb25WaWV3LnN0eWxlLnNldFByb3BlcnR5KCctLXNlc3Npb24tdmlldy1iYWNrZ3JvdW5kJywgYXNDc3NWYXJpYWJsZShhY3RpdmVTZXNzaW9uVmlld0JhY2tncm91bmQpKTtcblx0Y29uc3Qgc2Vzc2lvblZpZXdDb250ZW50ID0gZG9tLmFwcGVuZChzZXNzaW9uVmlldywgZG9tLiQoJy5zZXNzaW9uLXZpZXctY29udGVudCcpKTtcblx0c2Vzc2lvblZpZXdDb250ZW50LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRzZXNzaW9uVmlld0NvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXG5cdGNvbnN0IHZpZXcgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRWaWV3LCBmYWxzZSwge1xuXHRcdHJlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9sczogY29uc3RPYnNlcnZhYmxlKCFwcm9tcHRPcHRpb25zKSxcblx0fSkpO1xuXHRzZXNzaW9uVmlld0NvbnRlbnQuYXBwZW5kQ2hpbGQodmlldy5lbGVtZW50KTtcblx0dmlldy5sYXlvdXQod2lkdGgsIGhlaWdodCwgMCwgMCk7XG5cblx0aWYgKHByb21wdE9wdGlvbnMpIHtcblx0XHRjb21wb3NlclNlcnZpY2UuYWN0aXZlQ29tcG9zZXIuZ2V0KCk/LnNob3dQcm9tcHRPcHRpb25zKHByb21wdE9wdGlvbnMpO1xuXHRcdGlmIChwcm9tcHRPcHRpb25zLmtpbmQgPT09ICdyZXNvbHZlZCcgJiYgc2VsZWN0ZWRPcHRpb25JbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBidXR0b25zID0gdmlldy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbi5tb25hY28tYnV0dG9uJyk7XG5cdFx0XHRidXR0b25zW3NlbGVjdGVkT3B0aW9uSW5kZXhdPy5jbGljaygpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0aWYgKGVkaXRlZElucHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHZpZXcucHJlZmlsbElucHV0KGVkaXRlZElucHV0KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zL2NoYXQvbmV3V2lkZ2V0LycgfSwge1xuXHROZXdTZXNzaW9uQ29tbWVudHM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdFdpZGdldChjb250ZXh0LCB7IGNvbW1lbnRDb3VudDogMyB9KSxcblx0fSksXG5cdE5ld1Nlc3Npb25UaXA6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdFdpZGdldChjb250ZXh0LCB7IHNob3dUaXA6IHRydWUgfSksXG5cdH0pLFxuXHRQcm9tcHRPcHRpb25zTG9hZGluZzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJOZXdDaGF0V2lkZ2V0KGNvbnRleHQsIHsgcHJvbXB0T3B0aW9uczogeyBraW5kOiAnbG9hZGluZycgfSB9KSxcblx0fSksXG5cdFByb21wdE9wdGlvbnNTdGFuZGFyZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJOZXdDaGF0V2lkZ2V0KGNvbnRleHQsIHsgcHJvbXB0T3B0aW9uczogeyBraW5kOiAncmVzb2x2ZWQnLCBvcHRpb25zOiBjcmVhdGVTdGFuZGFyZFByb21wdE9wdGlvbnMoKSB9IH0pLFxuXHR9KSxcblx0UHJvbXB0T3B0aW9uc0dpdEh1Yk1peGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRXaWRnZXQoY29udGV4dCwgeyBwcm9tcHRPcHRpb25zOiB7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IGNyZWF0ZU1peGVkUHJvbXB0T3B0aW9ucygpIH0gfSksXG5cdH0pLFxuXHRQcm9tcHRPcHRpb25zU2VsZWN0ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdFdpZGdldChjb250ZXh0LCB7XG5cdFx0XHRwcm9tcHRPcHRpb25zOiB7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IGNyZWF0ZVN0YW5kYXJkUHJvbXB0T3B0aW9ucygpIH0sXG5cdFx0XHRzZWxlY3RlZE9wdGlvbkluZGV4OiAwLFxuXHRcdH0pLFxuXHR9KSxcblx0UHJvbXB0T3B0aW9uc0VkaXRlZERpc2FibGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHtcblx0XHRcdGNvbnN0IHByb21wdE9wdGlvbnMgPSBjcmVhdGVTdGFuZGFyZFByb21wdE9wdGlvbnMoKTtcblx0XHRcdHJldHVybiByZW5kZXJOZXdDaGF0V2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdFx0cHJvbXB0T3B0aW9uczogeyBraW5kOiAncmVzb2x2ZWQnLCBvcHRpb25zOiBwcm9tcHRPcHRpb25zIH0sXG5cdFx0XHRcdHNlbGVjdGVkT3B0aW9uSW5kZXg6IDAsXG5cdFx0XHRcdGVkaXRlZElucHV0OiBgJHtwcm9tcHRPcHRpb25zWzBdLnByb21wdH0gQWRkIGEgcmVncmVzc2lvbiB0ZXN0IHRvby5gLFxuXHRcdFx0fSk7XG5cdFx0fSxcblx0fSksXG5cdFByb21wdE9wdGlvbnNOYXJyb3c6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdFdpZGdldChjb250ZXh0LCB7XG5cdFx0XHR3aWR0aDogNDIwLFxuXHRcdFx0aGVpZ2h0OiA3NjAsXG5cdFx0XHRwcm9tcHRPcHRpb25zOiB7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IGNyZWF0ZU1peGVkUHJvbXB0T3B0aW9ucygpIH0sXG5cdFx0fSksXG5cdH0pLFxufSk7XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdDOlxcXFxDb2RlXFxcXHZzY29kZScpO1xuXHRyZXR1cm4ge1xuXHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0bGFiZWw6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHRpY29uOiBDb2RpY29uLnJlcG8sXG5cdFx0Zm9sZGVyczogW3tcblx0XHRcdHJvb3Q6IHJlc291cmNlLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcmVzb3VyY2UsXG5cdFx0XHRuYW1lOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0UmVwb3NpdG9yeToge1xuXHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHR3b3JrVHJlZVVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRnaXRIdWJJbmZvOiBjb25zdE9ic2VydmFibGUoeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0pLFxuXHRcdFx0fSxcblx0XHR9XSxcblx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiB0cnVlLFxuXHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVTZXNzaW9uVHlwZXMoKTogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10ge1xuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdGlkOiAnY29waWxvdGNsaScsXG5cdFx0XHRsYWJlbDogJ0NvcGlsb3QgQ0xJJyxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHRhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50Lk5vbmUsXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ2NsYXVkZScsXG5cdFx0XHRsYWJlbDogJ0NsYXVkZScsXG5cdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50Lk5vbmUsXG5cdFx0fSxcblx0XTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRml4dHVyZVByb3ZpZGVyKHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UsIHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10pOiBJU2Vzc2lvbnNQcm92aWRlciB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdmaXh0dXJlLXByb3ZpZGVyJztcblx0XHRvdmVycmlkZSByZWFkb25seSBsYWJlbCA9ICdGaXh0dXJlIFByb3ZpZGVyJztcblx0XHRvdmVycmlkZSByZWFkb25seSBpY29uID0gQ29kaWNvbi50ZXJtaW5hbDtcblx0XHRvdmVycmlkZSByZWFkb25seSBvcmRlciA9IDA7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGVzID0gc2Vzc2lvblR5cGVzO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1vZGVscyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYnJvd3NlQWN0aW9ucyA9IFtdO1xuXG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiBmb2xkZXJVcmkudG9TdHJpbmcoKSA9PT0gd29ya3NwYWNlLmZvbGRlcnNbMF0ucm9vdC50b1N0cmluZygpID8gd29ya3NwYWNlIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldE1vZGVsc1NuYXBzaG90KCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZWxzOiBbXSxcblx0XHRcdFx0ZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAnbm90UmVxdWVzdGVkJyBhcyBjb25zdCB9LFxuXHRcdFx0XHRtb2RlbFRhcmdldDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldE1vZGVsUGlja2VyT3B0aW9ucygpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdHJ1ZSxcblx0XHRcdFx0c2hvd0ZlYXR1cmVkOiBmYWxzZSxcblx0XHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IGZhbHNlLFxuXHRcdFx0XHRzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiBmYWxzZSxcblx0XHRcdFx0c2hvd0F1dG9Nb2RlbDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgc2V0TW9kZWwoKTogdm9pZCB7IH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlQWN0aXZlU2Vzc2lvbih3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlLCBzZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlKTogSUFjdGl2ZVNlc3Npb24ge1xuXHRjb25zdCBhY3RpdmVDaGF0ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdD4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpeHR1cmUtY2hhdDovL25ldy1zZXNzaW9uJyk7XG5cdH0oKTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdmaXh0dXJlLXNlc3Npb24nLCBwYXRoOiAnL2ZpeHR1cmUtc2Vzc2lvbicgfSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvbklkID0gJ2ZpeHR1cmUtc2Vzc2lvbic7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvdmlkZXJJZCA9ICdmaXh0dXJlLXByb3ZpZGVyJztcblx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZSA9IHNlc3Npb25UeXBlLmlkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1cyA9IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0NyZWF0ZWQgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxvYWRpbmcgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdvcmtzcGFjZSA9IGNvbnN0T2JzZXJ2YWJsZSh3b3Jrc3BhY2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1vZGVsSWQgPSBjb25zdE9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUNoYXQgPSBjb25zdE9ic2VydmFibGUoYWN0aXZlQ2hhdCk7XG5cdH0oKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RhbmRhcmRQcm9tcHRPcHRpb25zKCk6IHJlYWRvbmx5IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uW10ge1xuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdGlkOiAnc3RhbmRhcmQ6aW1wbGVtZW50RmVhdHVyZScsXG5cdFx0XHR0aXRsZTogJ0ltcGxlbWVudCBhIGZlYXR1cmUnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmliZSB3aGF0IHlvdSB3YW50IHRvIGJ1aWxkJyxcblx0XHRcdHByb21wdDogJ0hlbHAgbWUgaW1wbGVtZW50IFtkZXNjcmliZSB0aGUgZmVhdHVyZV0gaW4gdGhpcyBwcm9qZWN0LiBBc2sgbWUgcXVlc3Rpb25zIGlmIGFueXRoaW5nIGlzIHVuY2xlYXIgcmVnYXJkaW5nIHRoZSBpbnRlbmRlZCBiZWhhdmlvdXIuJyxcblx0XHRcdHBsYWNlaG9sZGVyOiAnW2Rlc2NyaWJlIHRoZSBmZWF0dXJlXScsXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpZ2h0YnVsYlNwYXJrbGVBdXRvZml4LFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6ICdzdGFuZGFyZDpmaXhCdWcnLFxuXHRcdFx0dGl0bGU6ICdGaXggYSBidWcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmliZSB0aGUgdW5leHBlY3RlZCBiZWhhdmlvcicsXG5cdFx0XHRwcm9tcHQ6ICdIZWxwIG1lIGZpeCBbZGVzY3JpYmUgdGhlIGJ1Z10gaW4gdGhpcyBwcm9qZWN0LiBBc2sgbWUgcXVlc3Rpb25zIGlmIGFueXRoaW5nIGlzIHVuY2xlYXIgcmVnYXJkaW5nIHRoZSBidWcgb3IgdGhlIGludGVuZGVkIGJlaGF2aW91ci4nLFxuXHRcdFx0cGxhY2Vob2xkZXI6ICdbZGVzY3JpYmUgdGhlIGJ1Z10nLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5idWcsXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ3N0YW5kYXJkOmZpeENpJyxcblx0XHRcdHRpdGxlOiAnRml4IENJJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpYmUgYSBmYWlsaW5nIGNoZWNrIG9yIHBhc3RlIGEgbGluaycsXG5cdFx0XHRwcm9tcHQ6ICdIZWxwIG1lIGZpeCB0aGUgZmFpbGluZyBDSSBmb3IgW2Rlc2NyaWJlIHRoZSBDSSBmYWlsdXJlIG9yIHBhc3RlIGEgbGlua10gaW4gdGhpcyBwcm9qZWN0LiBBc2sgbWUgcXVlc3Rpb25zIGlmIGFueXRoaW5nIGlzIHVuY2xlYXIgcmVnYXJkaW5nIHRoZSBDSSBmYWlsdXJlIG9yIGhvdyBpdCBzaG91bGQgYmUgZml4ZWQuJyxcblx0XHRcdHBsYWNlaG9sZGVyOiAnW2Rlc2NyaWJlIHRoZSBDSSBmYWlsdXJlIG9yIHBhc3RlIGEgbGlua10nLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5ydW5FcnJvcnMsXG5cdFx0fSxcblx0XTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTWl4ZWRQcm9tcHRPcHRpb25zKCk6IHJlYWRvbmx5IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uW10ge1xuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdGlkOiAnZ2l0aHViSXNzdWU6MzI3MTAxJyxcblx0XHRcdHRpdGxlOiAnVGFja2xlIGlzc3VlJyxcblx0XHRcdHRpdGxlRGV0YWlsOiAnIzMyNzEwMScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0ltcHJvdmUgdGhlIGFjY2Vzc2liaWxpdHkgb2YgaW5saW5lIGNoYXQgY29udHJvbHMnLFxuXHRcdFx0cHJvbXB0OiAnVGFja2xlIHRoZSBmb2xsb3dpbmcgaXNzdWUgYW5kIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgaXQ6IFwiSW1wcm92ZSB0aGUgYWNjZXNzaWJpbGl0eSBvZiBpbmxpbmUgY2hhdCBjb250cm9sc1wiIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI3MTAxKS4nLFxuXHRcdFx0cGxhY2Vob2xkZXI6ICcnLFxuXHRcdFx0aWNvbjogY29tcHV0ZUlzc3VlSWNvbihHaXRIdWJJc3N1ZVN0YXRlLk9wZW4sIHVuZGVmaW5lZCksXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ2dpdGh1Yklzc3VlOjMyNjg0MicsXG5cdFx0XHR0aXRsZTogJ1RhY2tsZSBpc3N1ZScsXG5cdFx0XHR0aXRsZURldGFpbDogJyMzMjY4NDInLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdQcmVzZXJ2ZSBlZGl0b3Igc3RhdGUgd2hlbiBzd2l0Y2hpbmcgc2Vzc2lvbnMnLFxuXHRcdFx0cHJvbXB0OiAnVGFja2xlIHRoZSBmb2xsb3dpbmcgaXNzdWUgYW5kIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgaXQ6IFwiUHJlc2VydmUgZWRpdG9yIHN0YXRlIHdoZW4gc3dpdGNoaW5nIHNlc3Npb25zXCIgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjY4NDIpLicsXG5cdFx0XHRwbGFjZWhvbGRlcjogJycsXG5cdFx0XHRpY29uOiBjb21wdXRlSXNzdWVJY29uKEdpdEh1Yklzc3VlU3RhdGUuT3BlbiwgdW5kZWZpbmVkKSxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnZ2l0aHViQ2lGYWlsdXJlOjMyOTYyOScsXG5cdFx0XHR0aXRsZTogJ0ZpeCBDSScsXG5cdFx0XHR0aXRsZURldGFpbDogJyMzMjk2MjknLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBZGQgR2l0SHViIHByb21wdCB2YXJpYXRpb24gdG8gb25ib2FyZGluZycsXG5cdFx0XHRwcm9tcHQ6ICdUaGUgZm9sbG93aW5nIHB1bGwgcmVxdWVzdCBoYXMgZmFpbGluZyBDSSBjaGVja3M6IFwiQWRkIEdpdEh1YiBwcm9tcHQgdmFyaWF0aW9uIHRvIG9uYm9hcmRpbmdcIiAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8zMjk2MjkpLiBJbnZlc3RpZ2F0ZSB0aGUgZmFpbHVyZXMgYW5kIHJlc29sdmUgdGhlbS4nLFxuXHRcdFx0cGxhY2Vob2xkZXI6ICcnLFxuXHRcdFx0aWNvbjogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIHsgaGFzRmFpbGluZ0NoZWNrczogdHJ1ZSB9KSxcblx0XHR9LFxuXHRdO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QixnQ0FBZ0M7QUFDaEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyw4QkFBOEM7QUFDdkQsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBa0Msc0JBQXNCLHdCQUF3QixnQ0FBZ0M7QUFDaEgsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBeUIsa0NBQWtDO0FBQzNELFNB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
