import * as dom from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { ISearchService } from "../../../../../workbench/services/search/common/search.js";
import { IHistoryService } from "../../../../../workbench/services/history/common/history.js";
import { IAICustomizationWorkspaceService } from "../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IPromptsService } from "../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { ICustomizationHarnessService } from "../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { registerChatFixtureServices } from "../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { NewChatInputWidget } from "../../browser/newChatInput.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js";
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from "../../browser/newChatVoice.js";
import { IVoiceSessionController } from "../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { IVoiceInputModeService } from "../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js";
import { ITtsPlaybackService } from "../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js";
import { IMicCaptureService } from "../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js";
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from "../../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeWidget.js";
import { chatInputStackClass, chatInputStackSlotClass, ChatInputStackSlot, setChatInputStackSlot } from "../../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js";
import "../../browser/media/chatInput.css";
import "../../browser/media/newChatInSession.css";
import "../../browser/media/chatWidget.css";
import "../../../../browser/media/style.css";
async function renderNewChatInput(context, fixtureOptions = {}) {
  const { container, disposableStore } = context;
  const { value, selection, subSessionTip } = fixtureOptions;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
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
          return [];
        }
      }());
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = observableValue("activeSession", void 0);
        }
      }());
      reg.defineInstance(ISessionsProvidersService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeProviders = Event.None;
        }
        getProviders() {
          return [];
        }
        getProvider() {
          return void 0;
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
        new class extends mock() {
          constructor() {
            super(...arguments);
            this.activeSession = observableValue("activeSession", void 0);
          }
        }(),
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
  container.style.width = "600px";
  container.style.height = "160px";
  container.classList.add("monaco-workbench", "agent-sessions-workbench");
  const root = dom.append(container, dom.$(".new-chat-in-session.sessions-chat-widget"));
  const widgetContainer = dom.append(root, dom.$(".new-chat-widget-container.revealed"));
  const content = dom.append(widgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));
  if (subSessionTip) {
    const tipSlot = dom.append(content, dom.$(`.sub-session-tip-container.${chatInputStackSlotClass}`));
    const tip = disposableStore.add(new ChatInputNoticeWidget({
      container: tipSlot,
      variant: ChatInputNoticeVariant.Tip,
      ariaLabel: "Sub-session tip"
    }));
    dom.append(tip.domNode, dom.$("span.sub-session-tip-text")).textContent = "Start a parallel conversation to build on all the changes made in this session.";
    setChatInputStackSlot(tipSlot, ChatInputStackSlot.Docked);
  }
  const session = observableValue("session", void 0);
  const widget = disposableStore.add(instantiationService.createInstance(NewChatInputWidget, {
    session,
    getContextFolderUri: () => void 0,
    sendRequest: async () => true,
    canSendRequest: observableValue("canSendRequest", true),
    loading: observableValue("loading", false)
  }));
  widget.render(content, container);
  await new Promise((r) => setTimeout(r, 50));
  const editor = widget.inputEditor;
  if (editor) {
    if (value !== void 0) {
      editor.getModel()?.setValue(value);
    }
    editor.layout();
    if (selection) {
      editor.setSelection(selection);
    }
  }
  await new Promise((r) => setTimeout(r, 50));
}
var newChatInput_fixture_default = defineThemedFixtureGroup({ path: "sessions/chat/newInput/" }, {
  Default: defineComponentFixture({ render: (context) => renderNewChatInput(context, { value: "What are you building?" }) }),
  // Partial multi-line selection so the reverse-rounded selection corners are
  // rendered. These cut-out pieces use `.monaco-editor-background`, which the
  // sessions CSS forces transparent — the bug shows here as blocky corners.
  Selection: defineComponentFixture({
    render: (context) => renderNewChatInput(context, {
      value: "asdasd asdasd asdasd\nasd\nasdasd asdasd asdasd asdasd",
      selection: { startLineNumber: 1, startColumn: 3, endLineNumber: 3, endColumn: 8 }
    })
  }),
  // A recognized slash command is highlighted (`.sessions-slash-command`) and,
  // since nothing follows it, its description renders as ghost text
  // (`.sessions-slash-placeholder`).
  SlashCommand: defineComponentFixture({ render: (context) => renderNewChatInput(context, { value: "/models" }) }),
  // A `#file:` reference is highlighted via `.sessions-variable-reference`.
  VariableReference: defineComponentFixture({ render: (context) => renderNewChatInput(context, { value: "Explain #file:src/app.ts to me" }) }),
  // The sub-session tip docked above the composer: a notice in the outer stack
  // squaring the input inside the composer's own nested stack.
  WithSubSessionTip: defineComponentFixture({
    render: (context) => renderNewChatInput(context, { value: "What are you building?", subSessionTip: true })
  })
});
export {
  newChatInput_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxcbmV3Q2hhdElucHV0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0Rml4dHVyZVNlcnZpY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9jaGF0L2NoYXRGaXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5ld0NoYXRJbnB1dFdpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdElucHV0LmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRTdGF0ZSwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSwgTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdFZvaWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSVZvaWNlSW5wdXRNb2RlU2VydmljZSwgVm9pY2VJbnB1dE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGUuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpY2VWYXJpYW50LCBDaGF0SW5wdXROb3RpY2VXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGljZVdpZGdldC5qcyc7XG5pbXBvcnQgeyBjaGF0SW5wdXRTdGFja0NsYXNzLCBjaGF0SW5wdXRTdGFja1Nsb3RDbGFzcywgQ2hhdElucHV0U3RhY2tTbG90LCBzZXRDaGF0SW5wdXRTdGFja1Nsb3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFN0YWNrLmpzJztcblxuLy8gVGhlIG5ldy1zZXNzaW9uIGlucHV0IGJveCBzdHlsaW5nIGxpdmVzIGluIHRoZXNlIHN0eWxlc2hlZXRzOyBgc3R5bGUuY3NzYFxuLy8gcHJvdmlkZXMgdGhlIGAtLXZzY29kZS1hZ2VudHNDaGF0SW5wdXQtKmAgdGhlbWUgdmFyaWFibGVzIGFuZCB0aGVcbi8vIGAuYWdlbnQtc2Vzc2lvbnMtd29ya2JlbmNoYCBzY29wZS5cbmltcG9ydCAnLi4vLi4vYnJvd3Nlci9tZWRpYS9jaGF0SW5wdXQuY3NzJztcbmltcG9ydCAnLi4vLi4vYnJvd3Nlci9tZWRpYS9uZXdDaGF0SW5TZXNzaW9uLmNzcyc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvbWVkaWEvY2hhdFdpZGdldC5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9icm93c2VyL21lZGlhL3N0eWxlLmNzcyc7XG5cbmludGVyZmFjZSBOZXdDaGF0SW5wdXRGaXh0dXJlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xuXHRyZWFkb25seSBzZWxlY3Rpb24/OiB7IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyOyBzdGFydENvbHVtbjogbnVtYmVyOyBlbmRMaW5lTnVtYmVyOiBudW1iZXI7IGVuZENvbHVtbjogbnVtYmVyIH07XG5cdC8qKiBEb2NrcyB0aGUgc3ViLXNlc3Npb24gdGlwIGFib3ZlIHRoZSBjb21wb3Nlci4gKi9cblx0cmVhZG9ubHkgc3ViU2Vzc2lvblRpcD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgcmVhbCB7QGxpbmsgTmV3Q2hhdElucHV0V2lkZ2V0fSBpbnNpZGUgdGhlIHByb2R1Y3Rpb24gRE9NIGFuY2VzdHJ5XG4gKiAoYC5uZXctY2hhdC1pbi1zZXNzaW9uID4gLm5ldy1jaGF0LXdpZGdldC1jb250YWluZXIucmV2ZWFsZWQgPiAubmV3LWNoYXQtd2lkZ2V0LWNvbnRlbnRgKVxuICogc28gdGhlIGBjaGF0SW5wdXQuY3NzYCAvIGBuZXdDaGF0SW5TZXNzaW9uLmNzc2AgcnVsZXMgYXBwbHkuIFRoZSBzZXNzaW9ucy1zcGVjaWZpY1xuICogc2VydmljZXMgaXRzIHBpY2tlcnMgZGVwZW5kIG9uIGFyZSBtb2NrZWQgaGVyZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVuZGVyTmV3Q2hhdElucHV0KGNvbnRleHQ6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBmaXh0dXJlT3B0aW9uczogTmV3Q2hhdElucHV0Rml4dHVyZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH0gPSBjb250ZXh0O1xuXHRjb25zdCB7IHZhbHVlLCBzZWxlY3Rpb24sIHN1YlNlc3Npb25UaXAgfSA9IGZpeHR1cmVPcHRpb25zO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY29udGV4dC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElRdWlja0lucHV0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUXVpY2tJbnB1dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvblNob3cgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkhpZGUgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2VhcmNoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2VhcmNoU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlc0ZvckZvbGRlcigpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJSGlzdG9yeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUhpc3RvcnlTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldEZpbHRlcmVkUHJvbXB0U2xhc2hDb21tYW5kcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9tcHRzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvbXB0c1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRTbGFzaENvbW1hbmRzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UsIGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IE5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UoXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KCksXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0fSgpLFxuXHRcdFx0KSkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElWb2ljZUlucHV0TW9kZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlSW5wdXRNb2RlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlbGVjdGVkTW9kZSA9IG9ic2VydmFibGVWYWx1ZTxWb2ljZUlucHV0TW9kZT4oJ3NlbGVjdGVkTW9kZScsICd2b2ljZScpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB2b2ljZUF2YWlsYWJsZSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPigndm9pY2VBdmFpbGFibGUnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGRpY3RhdGlvbkF2YWlsYWJsZSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignZGljdGF0aW9uQXZhaWxhYmxlJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBoYW5kc0ZyZWUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2hhbmRzRnJlZScsIHRydWUpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzaW11bGF0ZWRWb2ljZVN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZD4oJ3NpbXVsYXRlZFZvaWNlU3RhdGUnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzaW11bGF0ZWRIYW5kc0ZyZWUgPSBvYnNlcnZhYmxlVmFsdWU8dW5kZWZpbmVkPignc2ltdWxhdGVkSGFuZHNGcmVlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkVmVyc2lvbiA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQ+KCdzaW11bGF0ZWRWZXJzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkSG92ZXIgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ3NpbXVsYXRlZEhvdmVyJywgZmFsc2UpO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVm9pY2VTZXNzaW9uQ29udHJvbGxlciwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVm9pY2VTZXNzaW9uQ29udHJvbGxlcj4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ29ubmVjdGVkID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdpc0Nvbm5lY3RlZCcsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNDb25uZWN0aW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdpc0Nvbm5lY3RpbmcnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZvaWNlU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8J2lkbGUnIHwgJ2xpc3RlbmluZycgfCAncHJvY2Vzc2luZycgfCAnc3BlYWtpbmcnIHwgJ2Vycm9yJz4oJ3ZvaWNlU3RhdGUnLCAnaWRsZScpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB0YXJnZXRTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ3RhcmdldFNlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBoYXNEcmFmdFRhcmdldCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaGFzRHJhZnRUYXJnZXQnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9tbmlJbnB1dE9wZW4gPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ29tbmlJbnB1dE9wZW4nLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRyYW5zY3JpcHRUdXJucyA9IG9ic2VydmFibGVWYWx1ZTxuZXZlcltdPigndHJhbnNjcmlwdFR1cm5zJywgW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVHRzUGxheWJhY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUdHNQbGF5YmFja1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhbmFseXNlck5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNaWNDYXB0dXJlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWljQ2FwdHVyZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhbmFseXNlck5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVN0YXRlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcmVwYXJpbmdNb2RlbCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRG93bmxvYWRpbmdNb2RlbCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gQ2hhdFNwZWVjaFRvVGV4dFN0YXRlLklkbGU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ29uZmlndXJlZCA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc1ByZXBhcmluZ01vZGVsID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzRG93bmxvYWRpbmdNb2RlbCA9IGZhbHNlO1xuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnNjAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzE2MHB4Jztcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby13b3JrYmVuY2gnLCAnYWdlbnQtc2Vzc2lvbnMtd29ya2JlbmNoJyk7XG5cblx0Ly8gYC5uZXctY2hhdC1pbi1zZXNzaW9uYCBzY29wZXMgdGhlIGxheW91dCBvdmVycmlkZXMgYW5kXG5cdC8vIGAubmV3LWNoYXQtd2lkZ2V0LWNvbnRhaW5lci5yZXZlYWxlZGAgZmxpcHMgYC5uZXctY2hhdC1pbnB1dC1jb250YWluZXJgXG5cdC8vIGZyb20gYGRpc3BsYXk6IG5vbmVgIHRvIHZpc2libGUuIFRoZSBjb250ZW50IGVsZW1lbnQgaXMgdGhlIG91dGVyIGNoYXRcblx0Ly8gaW5wdXQgc3RhY2ssIGFzIGl0IGlzIGluIGBOZXdDaGF0SW5TZXNzaW9uV2lkZ2V0YC5cblx0Y29uc3Qgcm9vdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLm5ldy1jaGF0LWluLXNlc3Npb24uc2Vzc2lvbnMtY2hhdC13aWRnZXQnKSk7XG5cdGNvbnN0IHdpZGdldENvbnRhaW5lciA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5uZXctY2hhdC13aWRnZXQtY29udGFpbmVyLnJldmVhbGVkJykpO1xuXHRjb25zdCBjb250ZW50ID0gZG9tLmFwcGVuZCh3aWRnZXRDb250YWluZXIsIGRvbS4kKGAubmV3LWNoYXQtd2lkZ2V0LWNvbnRlbnQuJHtjaGF0SW5wdXRTdGFja0NsYXNzfWApKTtcblxuXHQvLyBUaGUgc3ViLXNlc3Npb24gdGlwLCBkb2NrZWQgYWJvdmUgdGhlIGNvbXBvc2VyLiBUaGUgY29tcG9zZXIgaXMgYSBzdGFjayBvZlxuXHQvLyBpdHMgb3duLCBzbyB0aGlzIGNvdmVycyBhIG5vdGljZSByZWFjaGluZyB0aHJvdWdoIGEgbmVzdGVkIHN0YWNrIHRvIHNxdWFyZVxuXHQvLyB0aGUgaW5wdXQgaW5zaWRlIGl0LlxuXHRpZiAoc3ViU2Vzc2lvblRpcCkge1xuXHRcdGNvbnN0IHRpcFNsb3QgPSBkb20uYXBwZW5kKGNvbnRlbnQsIGRvbS4kKGAuc3ViLXNlc3Npb24tdGlwLWNvbnRhaW5lci4ke2NoYXRJbnB1dFN0YWNrU2xvdENsYXNzfWApKTtcblx0XHRjb25zdCB0aXAgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBDaGF0SW5wdXROb3RpY2VXaWRnZXQoe1xuXHRcdFx0Y29udGFpbmVyOiB0aXBTbG90LFxuXHRcdFx0dmFyaWFudDogQ2hhdElucHV0Tm90aWNlVmFyaWFudC5UaXAsXG5cdFx0XHRhcmlhTGFiZWw6ICdTdWItc2Vzc2lvbiB0aXAnLFxuXHRcdH0pKTtcblx0XHRkb20uYXBwZW5kKHRpcC5kb21Ob2RlLCBkb20uJCgnc3Bhbi5zdWItc2Vzc2lvbi10aXAtdGV4dCcpKS50ZXh0Q29udGVudCA9XG5cdFx0XHQnU3RhcnQgYSBwYXJhbGxlbCBjb252ZXJzYXRpb24gdG8gYnVpbGQgb24gYWxsIHRoZSBjaGFuZ2VzIG1hZGUgaW4gdGhpcyBzZXNzaW9uLic7XG5cdFx0c2V0Q2hhdElucHV0U3RhY2tTbG90KHRpcFNsb3QsIENoYXRJbnB1dFN0YWNrU2xvdC5Eb2NrZWQpO1xuXHR9XG5cblx0Y29uc3Qgc2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRjb25zdCB3aWRnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRJbnB1dFdpZGdldCwge1xuXHRcdHNlc3Npb24sXG5cdFx0Z2V0Q29udGV4dEZvbGRlclVyaTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNlbmRSZXF1ZXN0OiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdGNhblNlbmRSZXF1ZXN0OiBvYnNlcnZhYmxlVmFsdWUoJ2NhblNlbmRSZXF1ZXN0JywgdHJ1ZSksXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCdsb2FkaW5nJywgZmFsc2UpLFxuXHR9KSk7XG5cblx0d2lkZ2V0LnJlbmRlcihjb250ZW50LCBjb250YWluZXIpO1xuXG5cdC8vIFRoZSB3aWRnZXQgbGF5cyBvdXQgaXRzIGVkaXRvciBvbiB0aGUgaW5wdXQgY29udGFpbmVyJ3MgYGFuaW1hdGlvbmVuZGA7IGluIHRoZVxuXHQvLyBmaXh0dXJlIHRoZXJlIGlzIG5vIGFuaW1hdGlvbiwgc28gc2VlZCB0aGUgdmFsdWUgYW5kIGxheSBvdXQgZXhwbGljaXRseS5cblx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSk7XG5cdGNvbnN0IGVkaXRvciA9IHdpZGdldC5pbnB1dEVkaXRvcjtcblx0aWYgKGVkaXRvcikge1xuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKT8uc2V0VmFsdWUodmFsdWUpO1xuXHRcdH1cblx0XHRlZGl0b3IubGF5b3V0KCk7XG5cdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zL2NoYXQvbmV3SW5wdXQvJyB9LCB7XG5cdERlZmF1bHQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdElucHV0KGNvbnRleHQsIHsgdmFsdWU6ICdXaGF0IGFyZSB5b3UgYnVpbGRpbmc/JyB9KSB9KSxcblx0Ly8gUGFydGlhbCBtdWx0aS1saW5lIHNlbGVjdGlvbiBzbyB0aGUgcmV2ZXJzZS1yb3VuZGVkIHNlbGVjdGlvbiBjb3JuZXJzIGFyZVxuXHQvLyByZW5kZXJlZC4gVGhlc2UgY3V0LW91dCBwaWVjZXMgdXNlIGAubW9uYWNvLWVkaXRvci1iYWNrZ3JvdW5kYCwgd2hpY2ggdGhlXG5cdC8vIHNlc3Npb25zIENTUyBmb3JjZXMgdHJhbnNwYXJlbnQgXHUyMDE0IHRoZSBidWcgc2hvd3MgaGVyZSBhcyBibG9ja3kgY29ybmVycy5cblx0U2VsZWN0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdElucHV0KGNvbnRleHQsIHtcblx0XHRcdHZhbHVlOiAnYXNkYXNkIGFzZGFzZCBhc2Rhc2RcXG5hc2RcXG5hc2Rhc2QgYXNkYXNkIGFzZGFzZCBhc2Rhc2QnLFxuXHRcdFx0c2VsZWN0aW9uOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogOCB9LFxuXHRcdH0pXG5cdH0pLFxuXHQvLyBBIHJlY29nbml6ZWQgc2xhc2ggY29tbWFuZCBpcyBoaWdobGlnaHRlZCAoYC5zZXNzaW9ucy1zbGFzaC1jb21tYW5kYCkgYW5kLFxuXHQvLyBzaW5jZSBub3RoaW5nIGZvbGxvd3MgaXQsIGl0cyBkZXNjcmlwdGlvbiByZW5kZXJzIGFzIGdob3N0IHRleHRcblx0Ly8gKGAuc2Vzc2lvbnMtc2xhc2gtcGxhY2Vob2xkZXJgKS5cblx0U2xhc2hDb21tYW5kOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRJbnB1dChjb250ZXh0LCB7IHZhbHVlOiAnL21vZGVscycgfSkgfSksXG5cdC8vIEEgYCNmaWxlOmAgcmVmZXJlbmNlIGlzIGhpZ2hsaWdodGVkIHZpYSBgLnNlc3Npb25zLXZhcmlhYmxlLXJlZmVyZW5jZWAuXG5cdFZhcmlhYmxlUmVmZXJlbmNlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRJbnB1dChjb250ZXh0LCB7IHZhbHVlOiAnRXhwbGFpbiAjZmlsZTpzcmMvYXBwLnRzIHRvIG1lJyB9KSB9KSxcblx0Ly8gVGhlIHN1Yi1zZXNzaW9uIHRpcCBkb2NrZWQgYWJvdmUgdGhlIGNvbXBvc2VyOiBhIG5vdGljZSBpbiB0aGUgb3V0ZXIgc3RhY2tcblx0Ly8gc3F1YXJpbmcgdGhlIGlucHV0IGluc2lkZSB0aGUgY29tcG9zZXIncyBvd24gbmVzdGVkIHN0YWNrLlxuXHRXaXRoU3ViU2Vzc2lvblRpcDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRJbnB1dChjb250ZXh0LCB7IHZhbHVlOiAnV2hhdCBhcmUgeW91IGJ1aWxkaW5nPycsIHN1YlNlc3Npb25UaXA6IHRydWUgfSlcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQWtDLHNCQUFzQix3QkFBd0IsZ0NBQWdDO0FBQ2hILFNBQVMsbUNBQW1DO0FBQzVDLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QixnQ0FBZ0M7QUFDaEUsU0FBUyw0QkFBNEIsaUNBQWlDO0FBQ3RFLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsOEJBQThDO0FBQ3ZELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsd0JBQXdCLDZCQUE2QjtBQUM5RCxTQUFTLHFCQUFxQix5QkFBeUIsb0JBQW9CLDZCQUE2QjtBQUt4RyxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBZVAsZUFBZSxtQkFBbUIsU0FBa0MsaUJBQTZDLENBQUMsR0FBa0I7QUFDbkksUUFBTSxFQUFFLFdBQVcsZ0JBQWdCLElBQUk7QUFDdkMsUUFBTSxFQUFFLE9BQU8sV0FBVyxjQUFjLElBQUk7QUFFNUMsUUFBTSx1QkFBdUIscUJBQXFCLGlCQUFpQjtBQUFBLElBQ2xFLFlBQVksUUFBUTtBQUFBLElBQ3BCLG9CQUFvQixDQUFDLFFBQVE7QUFDNUIsa0NBQTRCLEdBQUc7QUFDL0IsVUFBSSxlQUFlLG9CQUFvQixJQUFJLGNBQWMsS0FBeUIsRUFBRTtBQUFBLFFBQXpDO0FBQUE7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
