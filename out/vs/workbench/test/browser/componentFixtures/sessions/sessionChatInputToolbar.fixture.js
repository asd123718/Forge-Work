import { mock } from "../../../../../base/test/common/mock.js";
import { Event } from "../../../../../base/common/event.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../../../contrib/chat/common/constants.js";
import { IBrowserViewWorkbenchService } from "../../../../contrib/browserView/common/browserView.js";
import { IAgentFeedbackService } from "../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js";
import { SessionChatInputToolbar } from "../../../../../sessions/contrib/chat/browser/sessionChatInputToolbar.js";
import { IGitHubService } from "../../../../../sessions/contrib/github/browser/githubService.js";
import { SessionInputBanners } from "../../../../../sessions/contrib/sessionInputBanners/browser/sessionInputBanners.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../../sessions/common/agentHostSessionsProvider.js";
import { ChatOriginKind, SessionStatus } from "../../../../../sessions/services/sessions/common/session.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import { registerChatFixtureServices } from "../chat/chatFixtureUtils.js";
import { renderChatWidget } from "../chat/chatWidget.fixture.js";
function createdFile(name, insertions, deletions, isOutsideWorkspace = false) {
  const uri = URI.file(`/${isOutsideWorkspace ? "outside" : "repo"}/${name}`);
  return { uri, modifiedUri: uri, insertions, deletions, isOutsideWorkspace };
}
function editedFile(name, insertions, deletions, isOutsideWorkspace = false) {
  const uri = URI.file(`/${isOutsideWorkspace ? "outside" : "repo"}/${name}`);
  return { uri, modifiedUri: uri, originalUri: uri, insertions, deletions, isOutsideWorkspace };
}
function createMockSession(spec) {
  const chat = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("chat:1");
      this.title = constObservable("Main chat");
      // Pills above the input show while the chat has an active turn.
      this.status = constObservable(spec.status ?? SessionStatus.InProgress);
      this.lastTurnChanges = spec.turnChanges !== void 0 ? constObservable(spec.turnChanges) : void 0;
    }
  }();
  const subagents = (spec.subagents ?? []).map((title, index) => new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse(`chat:subagent-${index}`);
      this.title = constObservable(title);
      this.status = constObservable(SessionStatus.InProgress);
      this.origin = { kind: ChatOriginKind.Tool, parentChat: chat.resource };
    }
  }());
  const session = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("session:1");
      this.providerId = spec.providerId ?? LOCAL_AGENT_HOST_PROVIDER_ID;
      this.chats = constObservable([chat, ...subagents]);
    }
  }();
  const browsers = (spec.browsers ?? []).map((browser, index) => {
    const owner = browser.ownerSubagent === void 0 ? chat : subagents[browser.ownerSubagent];
    const model = new class extends mock() {
      constructor() {
        super(...arguments);
        this.owner = { mainWindowId: 1, sessionId: owner.resource.toString() };
      }
    }();
    return new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLabel = Event.None;
      }
      get id() {
        return `browser-${index}`;
      }
      get model() {
        return model;
      }
      get title() {
        return browser.title;
      }
    }();
  });
  return { session, chat, browsers };
}
function createBrowserViewService(inputs) {
  const known = new Map(inputs.map((input) => [input.id, input]));
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeBrowserViews = Event.None;
    }
    getKnownBrowserViews() {
      return known;
    }
    async getPreferredGroup() {
      return void 0;
    }
  }();
}
function renderPills(ctx, sessionMock, options) {
  const { container, disposableStore } = ctx;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      reg.defineInstance(IBrowserViewWorkbenchService, createBrowserViewService(sessionMock.browsers));
      if (options?.debugData) {
        reg.defineInstance(IGitHubService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.activeSessionPullRequestObs = constObservable(void 0);
            this.activeSessionPullRequestCIObs = constObservable(void 0);
            this.activeSessionPullRequestReviewThreadsObs = constObservable(void 0);
          }
        }());
        reg.defineInstance(IAgentFeedbackService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeFeedback = Event.None;
            this.onDidChangeFeedbackScope = Event.None;
          }
          getFeedback() {
            return [];
          }
          getFeedbackSessionResource() {
            return void 0;
          }
        }());
      }
    }
  });
  instantiationService.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, options?.enabled ?? true);
  const pills = disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
  pills.setSession(sessionMock.session, sessionMock.chat);
  pills.setDebugData(options?.debugData);
  container.appendChild(pills.element);
  if (options?.debugData) {
    const banners = disposableStore.add(instantiationService.createInstance(SessionInputBanners));
    banners.setDebugData(options.debugData);
    container.appendChild(banners.domNode);
  }
  container.style.padding = "12px";
  container.style.backgroundColor = "var(--vscode-sideBar-background)";
}
async function renderChatViewWithPills(ctx, mock2, messages) {
  await renderChatWidget(ctx, {
    messages,
    decorateInputPart: (inputPart, instantiationService) => {
      instantiationService.invokeFunction((accessor) => {
        accessor.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
      });
      const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
      pills.setSession(mock2.session, mock2.chat);
      inputPart.persistentContentContainerElement.appendChild(pills.element);
    }
  });
}
const FULL_VIEW_MESSAGES = [
  {
    user: "Add a README describing the project",
    assistant: [
      { kind: "markdown", text: "I created `README.md` with a project overview, setup steps, and usage examples." }
    ]
  },
  {
    user: "Now scaffold a simple landing page",
    assistant: [
      { kind: "markdown", text: "Added `index.html` with a minimal landing page and linked it from the README." }
    ]
  }
];
var sessionChatInputToolbar_fixture_default = defineThemedFixtureGroup({ path: "sessions/" }, {
  // --- Changes pill (per turn) --------------------------------------------
  SessionChatPills_ChangesSingleFile: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile("app.ts", 12, 5)] }))
  }),
  SessionChatPills_ChangesMultipleFiles: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [editedFile("app.ts", 42, 7), editedFile("util.ts", 118, 64), editedFile("index.ts", 5, 0)]
    }))
  }),
  SessionChatPills_ChangesOnlyInsertions: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile("feature.ts", 256, 0)] }))
  }),
  SessionChatPills_ChangesOnlyDeletions: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile("legacy.ts", 0, 89)] }))
  }),
  // --- Preview pill (resource label + dropdown) ---------------------------
  SessionChatPills_ExternalMarkdownPreview: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      status: SessionStatus.NeedsInput,
      turnChanges: [createdFile("README.md", 20, 0, true), editedFile("app.ts", 8, 3)]
    }))
  }),
  SessionChatPills_WorkspaceMarkdown_NoPreview: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [createdFile("README.md", 60, 2), editedFile("app.ts", 14, 1)]
    }))
  }),
  SessionChatPills_ExternalMarkdownMultiple_PrimaryCreated: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [
        editedFile("app.ts", 8, 3),
        createdFile("README.md", 20, 0, true),
        createdFile("index.html", 30, 4),
        editedFile("CHANGELOG.md", 6, 1, true)
      ]
    }))
  }),
  SessionChatPills_ExternalMarkdown_PrimaryEdited: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [editedFile("docs.md", 10, 2, true), editedFile("page.html", 4, 1)]
    }))
  }),
  // --- Browser and background activity pills ------------------------------
  SessionChatPills_BackgroundBrowser: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{ title: "Visual Studio Code" }] }))
  }),
  SessionChatPills_BackgroundBrowserFallback: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{}] }))
  }),
  SessionChatPills_BackgroundSubagent: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ subagents: ["Investigate authentication failures"] }))
  }),
  SessionChatPills_BackgroundSubagentTruncated: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ subagents: ["Investigate the authentication failure in production"] }))
  }),
  SessionChatPills_BackgroundBrowsersMultiple: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{ title: "Visual Studio Code" }, { title: "GitHub" }] }))
  }),
  SessionChatPills_BackgroundSubagentsMultiple: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ subagents: ["Investigate authentication", "Review the proposed fix"] }))
  }),
  SessionChatPills_BackgroundMixed: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      browsers: [{ title: "Visual Studio Code" }, { title: "GitHub", ownerSubagent: 0 }],
      subagents: ["Investigate authentication"]
    }))
  }),
  SessionChatPills_BackgroundWithChanges: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      status: SessionStatus.NeedsInput,
      turnChanges: [createdFile("index.html", 30, 4), editedFile("app.ts", 8, 3)],
      browsers: [{ title: "Project Preview" }]
    }))
  }),
  SessionChatPills_DebugFakeData: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ providerId: "debug-provider" }), {
      enabled: false,
      debugData: {
        stats: { files: 7, insertions: 128, deletions: 34 },
        markdownFiles: ["README.md", "CONTRIBUTING.md", "docs/testing.md"],
        subagents: ["Investigate authentication", "Review accessibility"],
        browsers: ["Project Preview", "Component Explorer"],
        ciFailed: 3,
        ciPending: 2,
        prFeedback: 4,
        agentFeedback: 2,
        autoIncrementChanges: false
      }
    })
  }),
  // --- Gating -------------------------------------------------------------
  SessionChatPills_NotAgentHost_Hidden: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      providerId: "copilot-cloud",
      turnChanges: [editedFile("app.ts", 12, 5)]
    }))
  }),
  SessionChatPills_NoActivity_Hidden: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({}))
  }),
  // --- Full chat view -----------------------------------------------------
  SessionChatView_ChangesPill: defineComponentFixture({
    render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
      turnChanges: [editedFile("app.ts", 12, 5), editedFile("util.ts", 4, 2)]
    }), FULL_VIEW_MESSAGES)
  }),
  SessionChatView_ChangesAndExternalPreview: defineComponentFixture({
    render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
      turnChanges: [createdFile("README.md", 20, 0, true), createdFile("index.html", 30, 4), editedFile("app.ts", 8, 3)]
    }), FULL_VIEW_MESSAGES)
  }),
  SessionChatView_ReadOnlyPills: defineComponentFixture({
    render: async (ctx) => {
      const mock2 = createMockSession({
        turnChanges: [editedFile("app.ts", 12, 5)],
        subagents: ["Investigate authentication"]
      });
      await renderChatWidget(ctx, {
        messages: FULL_VIEW_MESSAGES,
        inputVisible: false,
        decorateInputPart: (inputPart, instantiationService) => {
          instantiationService.invokeFunction((accessor) => {
            accessor.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
          });
          const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
          pills.setSession(mock2.session, mock2.chat);
          inputPart.persistentContentContainerElement.appendChild(pills.element);
        }
      });
    }
  })
});
export {
  sessionChatInputToolbar_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcc2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdNb2RlbCwgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBTZXNzaW9uQ2hhdElucHV0VG9vbGJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25DaGF0SW5wdXRUb29sYmFyLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9zZXNzaW9uQ2hhdElucHV0VG9vbGJhckRlYnVnLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBTZXNzaW9uSW5wdXRCYW5uZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9uSW5wdXRCYW5uZXJzL2Jyb3dzZXIvc2Vzc2lvbklucHV0QmFubmVycy5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlLCBJQ2hhdCwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyB9IGZyb20gJy4uL2NoYXQvY2hhdEZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBJRml4dHVyZU1lc3NhZ2UsIHJlbmRlckNoYXRXaWRnZXQgfSBmcm9tICcuLi9jaGF0L2NoYXRXaWRnZXQuZml4dHVyZS5qcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1vY2sgaGVscGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKiogQSBmaWxlIGNyZWF0ZWQgZHVyaW5nIHRoZSB0dXJuIChubyBvcmlnaW5hbCA9PiBjbGFzc2lmaWVkIGFzIFwiY3JlYXRlZFwiKS4gKi9cbmZ1bmN0aW9uIGNyZWF0ZWRGaWxlKG5hbWU6IHN0cmluZywgaW5zZXJ0aW9uczogbnVtYmVyLCBkZWxldGlvbnM6IG51bWJlciwgaXNPdXRzaWRlV29ya3NwYWNlID0gZmFsc2UpOiBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlIHtcblx0Y29uc3QgdXJpID0gVVJJLmZpbGUoYC8ke2lzT3V0c2lkZVdvcmtzcGFjZSA/ICdvdXRzaWRlJyA6ICdyZXBvJ30vJHtuYW1lfWApO1xuXHRyZXR1cm4geyB1cmksIG1vZGlmaWVkVXJpOiB1cmksIGluc2VydGlvbnMsIGRlbGV0aW9ucywgaXNPdXRzaWRlV29ya3NwYWNlIH07XG59XG5cbi8qKiBBIGZpbGUgZWRpdGVkIGR1cmluZyB0aGUgdHVybiAoaGFzIGFuIG9yaWdpbmFsID0+IGNsYXNzaWZpZWQgYXMgXCJtb2RpZmllZFwiKS4gKi9cbmZ1bmN0aW9uIGVkaXRlZEZpbGUobmFtZTogc3RyaW5nLCBpbnNlcnRpb25zOiBudW1iZXIsIGRlbGV0aW9uczogbnVtYmVyLCBpc091dHNpZGVXb3Jrc3BhY2UgPSBmYWxzZSk6IElTZXNzaW9uVHVybkZpbGVDaGFuZ2Uge1xuXHRjb25zdCB1cmkgPSBVUkkuZmlsZShgLyR7aXNPdXRzaWRlV29ya3NwYWNlID8gJ291dHNpZGUnIDogJ3JlcG8nfS8ke25hbWV9YCk7XG5cdHJldHVybiB7IHVyaSwgbW9kaWZpZWRVcmk6IHVyaSwgb3JpZ2luYWxVcmk6IHVyaSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zLCBpc091dHNpZGVXb3Jrc3BhY2UgfTtcbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uU3BlYyB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1cz86IFNlc3Npb25TdGF0dXM7XG5cdC8qKiBGaWxlIGNoYW5nZXMgaW4gdGhlIGxhc3QgdHVybjsgb21pdCBmb3IgYSBjaGF0IHdpdGggbm8gbGFzdC10dXJuIGNoYW5nZXMuICovXG5cdHJlYWRvbmx5IHR1cm5DaGFuZ2VzPzogcmVhZG9ubHkgSVNlc3Npb25UdXJuRmlsZUNoYW5nZVtdO1xuXHRyZWFkb25seSBicm93c2Vycz86IHJlYWRvbmx5IHsgcmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7IHJlYWRvbmx5IG93bmVyU3ViYWdlbnQ/OiBudW1iZXIgfVtdO1xuXHRyZWFkb25seSBzdWJhZ2VudHM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqIEEgbW9jayBzZXNzaW9uICsgaXRzIHZpZXdlZCBjaGF0LCBhcyB0aGUgdG9vbGJhciBjb25zdW1lcyB0aGVtLiAqL1xuaW50ZXJmYWNlIElNb2NrU2Vzc2lvbkFuZENoYXQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbjtcblx0cmVhZG9ubHkgY2hhdDogSUNoYXQ7XG5cdHJlYWRvbmx5IGJyb3dzZXJzOiByZWFkb25seSBCcm93c2VyRWRpdG9ySW5wdXRbXTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1Nlc3Npb24oc3BlYzogSVNlc3Npb25TcGVjKTogSU1vY2tTZXNzaW9uQW5kQ2hhdCB7XG5cdGNvbnN0IGNoYXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdDoxJyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGl0bGUgPSBjb25zdE9ic2VydmFibGUoJ01haW4gY2hhdCcpO1xuXHRcdC8vIFBpbGxzIGFib3ZlIHRoZSBpbnB1dCBzaG93IHdoaWxlIHRoZSBjaGF0IGhhcyBhbiBhY3RpdmUgdHVybi5cblx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0dXM6IElPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+ID0gY29uc3RPYnNlcnZhYmxlKHNwZWMuc3RhdHVzID8/IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdFR1cm5DaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlW10+IHwgdW5kZWZpbmVkID1cblx0XHRcdHNwZWMudHVybkNoYW5nZXMgIT09IHVuZGVmaW5lZCA/IGNvbnN0T2JzZXJ2YWJsZShzcGVjLnR1cm5DaGFuZ2VzKSA6IHVuZGVmaW5lZDtcblx0fSgpO1xuXHRjb25zdCBzdWJhZ2VudHMgPSAoc3BlYy5zdWJhZ2VudHMgPz8gW10pLm1hcCgodGl0bGUsIGluZGV4KSA9PiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IFVSSS5wYXJzZShgY2hhdDpzdWJhZ2VudC0ke2luZGV4fWApO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRpdGxlID0gY29uc3RPYnNlcnZhYmxlKHRpdGxlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0dXMgPSBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvcmlnaW4gPSB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIHBhcmVudENoYXQ6IGNoYXQucmVzb3VyY2UgfTtcblx0fSgpKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLnBhcnNlKCdzZXNzaW9uOjEnKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBwcm92aWRlcklkID0gc3BlYy5wcm92aWRlcklkID8/IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhdHMgPSBjb25zdE9ic2VydmFibGUoW2NoYXQsIC4uLnN1YmFnZW50c10pO1xuXHR9KCk7XG5cdGNvbnN0IGJyb3dzZXJzID0gKHNwZWMuYnJvd3NlcnMgPz8gW10pLm1hcCgoYnJvd3NlciwgaW5kZXgpID0+IHtcblx0XHRjb25zdCBvd25lciA9IGJyb3dzZXIub3duZXJTdWJhZ2VudCA9PT0gdW5kZWZpbmVkID8gY2hhdCA6IHN1YmFnZW50c1ticm93c2VyLm93bmVyU3ViYWdlbnRdO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQnJvd3NlclZpZXdNb2RlbD4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvd25lciA9IHsgbWFpbldpbmRvd0lkOiAxLCBzZXNzaW9uSWQ6IG93bmVyLnJlc291cmNlLnRvU3RyaW5nKCkgfTtcblx0XHR9KCk7XG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8QnJvd3NlckVkaXRvcklucHV0PigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBpZCgpOiBzdHJpbmcgeyByZXR1cm4gYGJyb3dzZXItJHtpbmRleH1gOyB9XG5cdFx0XHRvdmVycmlkZSBnZXQgbW9kZWwoKTogSUJyb3dzZXJWaWV3TW9kZWwgeyByZXR1cm4gbW9kZWw7IH1cblx0XHRcdG92ZXJyaWRlIGdldCB0aXRsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gYnJvd3Nlci50aXRsZTsgfVxuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYWJlbCA9IEV2ZW50Lk5vbmU7XG5cdFx0fSgpO1xuXHR9KTtcblx0cmV0dXJuIHsgc2Vzc2lvbiwgY2hhdCwgYnJvd3NlcnMgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQnJvd3NlclZpZXdTZXJ2aWNlKGlucHV0czogcmVhZG9ubHkgQnJvd3NlckVkaXRvcklucHV0W10pOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHtcblx0Y29uc3Qga25vd24gPSBuZXcgTWFwKGlucHV0cy5tYXAoaW5wdXQgPT4gW2lucHV0LmlkLCBpbnB1dF0pKTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VCcm93c2VyVmlld3MgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldEtub3duQnJvd3NlclZpZXdzKCkgeyByZXR1cm4ga25vd247IH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRQcmVmZXJyZWRHcm91cCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFJlbmRlciBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlclBpbGxzKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHNlc3Npb25Nb2NrOiBJTW9ja1Nlc3Npb25BbmRDaGF0LCBvcHRpb25zPzogeyByZWFkb25seSBkZWJ1Z0RhdGE/OiBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YTsgcmVhZG9ubHkgZW5hYmxlZD86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH0gPSBjdHg7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHQvLyBCcm9hZCBjaGF0IHNlcnZpY2UgZ3JhcGg6IHByb3ZpZGVzIElDb250ZXh0TWVudVNlcnZpY2UgYW5kIHRoZVxuXHRcdFx0Ly8gUmVzb3VyY2VMYWJlbHMgZGVwZW5kZW5jaWVzIChkZWNvcmF0aW9ucywgdGV4dCBmaWxlLCB3b3Jrc3BhY2UsIGxhYmVsXG5cdFx0XHQvLyBzZXJ2aWNlcykgdGhlIHByZXZpZXcgcGlsbCBuZWVkcywgb24gdG9wIG9mIHRoZSBiYXNlIGVkaXRvciBzZXJ2aWNlc1xuXHRcdFx0Ly8gKHdoaWNoIHJlZ2lzdGVyIGEgcGFydGlhbCBJU2Vzc2lvbnNTZXJ2aWNlKS5cblx0XHRcdHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsIGNyZWF0ZUJyb3dzZXJWaWV3U2VydmljZShzZXNzaW9uTW9jay5icm93c2VycykpO1xuXHRcdFx0aWYgKG9wdGlvbnM/LmRlYnVnRGF0YSkge1xuXHRcdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUdpdEh1YlNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdE9icyA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdENJT2JzID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc09icyA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9KCkpO1xuXHRcdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50RmVlZGJhY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEZlZWRiYWNrU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0XHRvdmVycmlkZSBnZXRGZWVkYmFjaygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0fSgpKTtcblx0XHRcdH1cblx0XHR9LFxuXHR9KTtcblxuXHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIG9wdGlvbnM/LmVuYWJsZWQgPz8gdHJ1ZSk7XG5cblx0Y29uc3QgcGlsbHMgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DaGF0SW5wdXRUb29sYmFyKSk7XG5cdHBpbGxzLnNldFNlc3Npb24oc2Vzc2lvbk1vY2suc2Vzc2lvbiwgc2Vzc2lvbk1vY2suY2hhdCk7XG5cdHBpbGxzLnNldERlYnVnRGF0YShvcHRpb25zPy5kZWJ1Z0RhdGEpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQocGlsbHMuZWxlbWVudCk7XG5cdGlmIChvcHRpb25zPy5kZWJ1Z0RhdGEpIHtcblx0XHRjb25zdCBiYW5uZXJzID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uSW5wdXRCYW5uZXJzKSk7XG5cdFx0YmFubmVycy5zZXREZWJ1Z0RhdGEob3B0aW9ucy5kZWJ1Z0RhdGEpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChiYW5uZXJzLmRvbU5vZGUpO1xuXHR9XG5cblx0Y29udGFpbmVyLnN0eWxlLnBhZGRpbmcgPSAnMTJweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndmFyKC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZCknO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJDaGF0Vmlld1dpdGhQaWxscyhjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBtb2NrOiBJTW9ja1Nlc3Npb25BbmRDaGF0LCBtZXNzYWdlczogSUZpeHR1cmVNZXNzYWdlW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgcmVuZGVyQ2hhdFdpZGdldChjdHgsIHtcblx0XHRtZXNzYWdlcyxcblx0XHRkZWNvcmF0ZUlucHV0UGFydDogKGlucHV0UGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdC8vIFRoZSBmaXh0dXJlJ3MgdGVzdCBjb25maWd1cmF0aW9uIGhhcyBubyBwcm9kdWN0IGRlZmF1bHRzLCBzbyBvcHQgaW5cblx0XHRcdC8vIGV4cGxpY2l0bHkgdG8gbWFrZSBzdXJlIHRoZSBwaWxscyByZW5kZXIuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdChhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UpLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlR1cm5TdGF0dXNQaWxscywgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBpbGxzID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIpKTtcblx0XHRcdHBpbGxzLnNldFNlc3Npb24obW9jay5zZXNzaW9uLCBtb2NrLmNoYXQpO1xuXHRcdFx0Ly8gTW91bnQgYWJvdmUgdGhlIGlucHV0LCBtaXJyb3JpbmcgdGhlIHNlc3Npb25zIENoYXRWaWV3LlxuXHRcdFx0aW5wdXRQYXJ0LnBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyRWxlbWVudC5hcHBlbmRDaGlsZChwaWxscy5lbGVtZW50KTtcblx0XHR9LFxuXHR9KTtcbn1cblxuY29uc3QgRlVMTF9WSUVXX01FU1NBR0VTOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdBZGQgYSBSRUFETUUgZGVzY3JpYmluZyB0aGUgcHJvamVjdCcsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdJIGNyZWF0ZWQgYFJFQURNRS5tZGAgd2l0aCBhIHByb2plY3Qgb3ZlcnZpZXcsIHNldHVwIHN0ZXBzLCBhbmQgdXNhZ2UgZXhhbXBsZXMuJyB9LFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHR1c2VyOiAnTm93IHNjYWZmb2xkIGEgc2ltcGxlIGxhbmRpbmcgcGFnZScsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdBZGRlZCBgaW5kZXguaHRtbGAgd2l0aCBhIG1pbmltYWwgbGFuZGluZyBwYWdlIGFuZCBsaW5rZWQgaXQgZnJvbSB0aGUgUkVBRE1FLicgfSxcblx0XHRdLFxuXHR9LFxuXTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRml4dHVyZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zLycgfSwge1xuXG5cdC8vIC0tLSBDaGFuZ2VzIHBpbGwgKHBlciB0dXJuKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQ2hhbmdlc1NpbmdsZUZpbGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IHR1cm5DaGFuZ2VzOiBbZWRpdGVkRmlsZSgnYXBwLnRzJywgMTIsIDUpXSB9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQ2hhbmdlc011bHRpcGxlRmlsZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHR0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2FwcC50cycsIDQyLCA3KSwgZWRpdGVkRmlsZSgndXRpbC50cycsIDExOCwgNjQpLCBlZGl0ZWRGaWxlKCdpbmRleC50cycsIDUsIDApXSxcblx0XHR9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQ2hhbmdlc09ubHlJbnNlcnRpb25zOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oeyB0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2ZlYXR1cmUudHMnLCAyNTYsIDApXSB9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQ2hhbmdlc09ubHlEZWxldGlvbnM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IHR1cm5DaGFuZ2VzOiBbZWRpdGVkRmlsZSgnbGVnYWN5LnRzJywgMCwgODkpXSB9KSksXG5cdH0pLFxuXG5cdC8vIC0tLSBQcmV2aWV3IHBpbGwgKHJlc291cmNlIGxhYmVsICsgZHJvcGRvd24pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdFNlc3Npb25DaGF0UGlsbHNfRXh0ZXJuYWxNYXJrZG93blByZXZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCxcblx0XHRcdHR1cm5DaGFuZ2VzOiBbY3JlYXRlZEZpbGUoJ1JFQURNRS5tZCcsIDIwLCAwLCB0cnVlKSwgZWRpdGVkRmlsZSgnYXBwLnRzJywgOCwgMyldLFxuXHRcdH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19Xb3Jrc3BhY2VNYXJrZG93bl9Ob1ByZXZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHR0dXJuQ2hhbmdlczogW2NyZWF0ZWRGaWxlKCdSRUFETUUubWQnLCA2MCwgMiksIGVkaXRlZEZpbGUoJ2FwcC50cycsIDE0LCAxKV0sXG5cdFx0fSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0V4dGVybmFsTWFya2Rvd25NdWx0aXBsZV9QcmltYXJ5Q3JlYXRlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHR1cm5DaGFuZ2VzOiBbXG5cdFx0XHRcdGVkaXRlZEZpbGUoJ2FwcC50cycsIDgsIDMpLFxuXHRcdFx0XHRjcmVhdGVkRmlsZSgnUkVBRE1FLm1kJywgMjAsIDAsIHRydWUpLFxuXHRcdFx0XHRjcmVhdGVkRmlsZSgnaW5kZXguaHRtbCcsIDMwLCA0KSxcblx0XHRcdFx0ZWRpdGVkRmlsZSgnQ0hBTkdFTE9HLm1kJywgNiwgMSwgdHJ1ZSksXG5cdFx0XHRdLFxuXHRcdH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19FeHRlcm5hbE1hcmtkb3duX1ByaW1hcnlFZGl0ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHR0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2RvY3MubWQnLCAxMCwgMiwgdHJ1ZSksIGVkaXRlZEZpbGUoJ3BhZ2UuaHRtbCcsIDQsIDEpXSxcblx0XHR9KSksXG5cdH0pLFxuXG5cdC8vIC0tLSBCcm93c2VyIGFuZCBiYWNrZ3JvdW5kIGFjdGl2aXR5IHBpbGxzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQmFja2dyb3VuZEJyb3dzZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IGJyb3dzZXJzOiBbeyB0aXRsZTogJ1Zpc3VhbCBTdHVkaW8gQ29kZScgfV0gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRCcm93c2VyRmFsbGJhY2s6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IGJyb3dzZXJzOiBbe31dIH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19CYWNrZ3JvdW5kU3ViYWdlbnQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IHN1YmFnZW50czogWydJbnZlc3RpZ2F0ZSBhdXRoZW50aWNhdGlvbiBmYWlsdXJlcyddIH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19CYWNrZ3JvdW5kU3ViYWdlbnRUcnVuY2F0ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IHN1YmFnZW50czogWydJbnZlc3RpZ2F0ZSB0aGUgYXV0aGVudGljYXRpb24gZmFpbHVyZSBpbiBwcm9kdWN0aW9uJ10gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRCcm93c2Vyc011bHRpcGxlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oeyBicm93c2VyczogW3sgdGl0bGU6ICdWaXN1YWwgU3R1ZGlvIENvZGUnIH0sIHsgdGl0bGU6ICdHaXRIdWInIH1dIH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19CYWNrZ3JvdW5kU3ViYWdlbnRzTXVsdGlwbGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IHN1YmFnZW50czogWydJbnZlc3RpZ2F0ZSBhdXRoZW50aWNhdGlvbicsICdSZXZpZXcgdGhlIHByb3Bvc2VkIGZpeCddIH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19CYWNrZ3JvdW5kTWl4ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRicm93c2VyczogW3sgdGl0bGU6ICdWaXN1YWwgU3R1ZGlvIENvZGUnIH0sIHsgdGl0bGU6ICdHaXRIdWInLCBvd25lclN1YmFnZW50OiAwIH1dLFxuXHRcdFx0c3ViYWdlbnRzOiBbJ0ludmVzdGlnYXRlIGF1dGhlbnRpY2F0aW9uJ10sXG5cdFx0fSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRXaXRoQ2hhbmdlczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LFxuXHRcdFx0dHVybkNoYW5nZXM6IFtjcmVhdGVkRmlsZSgnaW5kZXguaHRtbCcsIDMwLCA0KSwgZWRpdGVkRmlsZSgnYXBwLnRzJywgOCwgMyldLFxuXHRcdFx0YnJvd3NlcnM6IFt7IHRpdGxlOiAnUHJvamVjdCBQcmV2aWV3JyB9XSxcblx0XHR9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfRGVidWdGYWtlRGF0YTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IHByb3ZpZGVySWQ6ICdkZWJ1Zy1wcm92aWRlcicgfSksIHtcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0ZGVidWdEYXRhOiB7XG5cdFx0XHRcdHN0YXRzOiB7IGZpbGVzOiA3LCBpbnNlcnRpb25zOiAxMjgsIGRlbGV0aW9uczogMzQgfSxcblx0XHRcdFx0bWFya2Rvd25GaWxlczogWydSRUFETUUubWQnLCAnQ09OVFJJQlVUSU5HLm1kJywgJ2RvY3MvdGVzdGluZy5tZCddLFxuXHRcdFx0XHRzdWJhZ2VudHM6IFsnSW52ZXN0aWdhdGUgYXV0aGVudGljYXRpb24nLCAnUmV2aWV3IGFjY2Vzc2liaWxpdHknXSxcblx0XHRcdFx0YnJvd3NlcnM6IFsnUHJvamVjdCBQcmV2aWV3JywgJ0NvbXBvbmVudCBFeHBsb3JlciddLFxuXHRcdFx0XHRjaUZhaWxlZDogMyxcblx0XHRcdFx0Y2lQZW5kaW5nOiAyLFxuXHRcdFx0XHRwckZlZWRiYWNrOiA0LFxuXHRcdFx0XHRhZ2VudEZlZWRiYWNrOiAyLFxuXHRcdFx0XHRhdXRvSW5jcmVtZW50Q2hhbmdlczogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyAtLS0gR2F0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRTZXNzaW9uQ2hhdFBpbGxzX05vdEFnZW50SG9zdF9IaWRkZW46IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRwcm92aWRlcklkOiAnY29waWxvdC1jbG91ZCcsXG5cdFx0XHR0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2FwcC50cycsIDEyLCA1KV0sXG5cdFx0fSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX05vQWN0aXZpdHlfSGlkZGVuOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe30pKSxcblx0fSksXG5cblx0Ly8gLS0tIEZ1bGwgY2hhdCB2aWV3IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0U2Vzc2lvbkNoYXRWaWV3X0NoYW5nZXNQaWxsOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlckNoYXRWaWV3V2l0aFBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0dHVybkNoYW5nZXM6IFtlZGl0ZWRGaWxlKCdhcHAudHMnLCAxMiwgNSksIGVkaXRlZEZpbGUoJ3V0aWwudHMnLCA0LCAyKV0sXG5cdFx0fSksIEZVTExfVklFV19NRVNTQUdFUyksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0Vmlld19DaGFuZ2VzQW5kRXh0ZXJuYWxQcmV2aWV3OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlckNoYXRWaWV3V2l0aFBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0dHVybkNoYW5nZXM6IFtjcmVhdGVkRmlsZSgnUkVBRE1FLm1kJywgMjAsIDAsIHRydWUpLCBjcmVhdGVkRmlsZSgnaW5kZXguaHRtbCcsIDMwLCA0KSwgZWRpdGVkRmlsZSgnYXBwLnRzJywgOCwgMyldLFxuXHRcdH0pLCBGVUxMX1ZJRVdfTUVTU0FHRVMpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFZpZXdfUmVhZE9ubHlQaWxsczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiBhc3luYyAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrID0gY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHR0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2FwcC50cycsIDEyLCA1KV0sXG5cdFx0XHRcdHN1YmFnZW50czogWydJbnZlc3RpZ2F0ZSBhdXRoZW50aWNhdGlvbiddLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCByZW5kZXJDaGF0V2lkZ2V0KGN0eCwge1xuXHRcdFx0XHRtZXNzYWdlczogRlVMTF9WSUVXX01FU1NBR0VTLFxuXHRcdFx0XHRpbnB1dFZpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRkZWNvcmF0ZUlucHV0UGFydDogKGlucHV0UGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0XHQoYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIHRydWUpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IHBpbGxzID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIpKTtcblx0XHRcdFx0XHRwaWxscy5zZXRTZXNzaW9uKG1vY2suc2Vzc2lvbiwgbW9jay5jaGF0KTtcblx0XHRcdFx0XHRpbnB1dFBhcnQucGVyc2lzdGVudENvbnRlbnRDb250YWluZXJFbGVtZW50LmFwcGVuZENoaWxkKHBpbGxzLmVsZW1lbnQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSxcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsWUFBWTtBQUNyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMseUJBQXlCO0FBRWxDLFNBQTRCLG9DQUFvQztBQUVoRSxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLCtCQUErQjtBQUl4QyxT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
