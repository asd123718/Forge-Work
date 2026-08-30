import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { ExtUri } from "../../../../../base/common/resources.js";
import { themeColorFromId } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IAgentHostFilterService } from "../../../../../sessions/services/agentHostFilter/common/agentHostFilter.js";
import { ISessionGroupsService } from "../../../../../sessions/services/sessions/browser/sessionGroupsService.js";
import { ISessionSectionOrderService } from "../../../../../sessions/services/sessions/browser/sessionSectionOrderService.js";
import { ISessionsListModelService } from "../../../../../sessions/services/sessions/browser/sessionsListModelService.js";
import { ISessionsProvidersService } from "../../../../../sessions/services/sessions/browser/sessionsProvidersService.js";
import { ISessionsService } from "../../../../../sessions/services/sessions/browser/sessionsService.js";
import { ICustomViewService } from "../../../../../sessions/services/customView/browser/customViewService.js";
import { SessionStatus } from "../../../../../sessions/services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../../sessions/services/sessions/common/sessionsManagement.js";
import { SessionsGrouping, SessionsList, SessionsSorting } from "../../../../../sessions/contrib/sessions/browser/views/sessionsList.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAutomationService } from "../../../../contrib/chat/common/automations/automationService.js";
import { IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { IVoicePlaybackService } from "../../../../contrib/chat/common/voicePlaybackService.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import "../../../../../sessions/contrib/sessions/browser/media/sessionsList.css";
function createWorkspace(label) {
  const root = URI.file(`/home/user/projects/${label}`);
  const folder = { root, workingDirectory: root, name: label, description: void 0 };
  return {
    uri: root,
    label,
    icon: Codicon.folder,
    folders: [folder],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
}
function createSession(spec) {
  const updatedAt = new Date(Date.now() - spec.minutesAgo * 60 * 1e3);
  const description = spec.description ? new MarkdownString(spec.description) : void 0;
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionId = spec.id;
      this.resource = URI.parse(`vscode-session://session/${spec.id}`);
      this.providerId = "local";
      this.sessionType = "local";
      this.icon = Codicon.account;
      this.createdAt = updatedAt;
      this.title = constObservable(spec.title);
      this.updatedAt = constObservable(updatedAt);
      this.status = constObservable(spec.status ?? SessionStatus.Completed);
      this.workspace = constObservable(spec.workspace ? createWorkspace(spec.workspace) : void 0);
      this.isQuickChat = constObservable(!spec.workspace);
      this.isArchived = constObservable(false);
      this.isRead = constObservable(true);
      this.changes = constObservable([]);
      this.changesSummary = constObservable(spec.changesSummary);
      this.description = constObservable(description);
      this.chats = constObservable([]);
      this.capabilities = constObservable({ supportsMultipleChats: false });
    }
  }();
}
function renderSessionsList(ctx, options) {
  const { container, disposableStore } = ctx;
  const sessions = options.sessions.map(createSession);
  const groups = options.groups ?? [];
  const membership = /* @__PURE__ */ new Map();
  for (const spec of options.sessions) {
    if (spec.group) {
      membership.set(spec.id, spec.group);
    }
  }
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
      reg.defineInstance(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.chatModels = constObservable([]);
        }
      }());
      reg.defineInstance(IAgentSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.model = new class extends mock() {
            observeSession() {
              return constObservable(void 0);
            }
          }();
        }
      }());
      reg.defineInstance(ISessionsManagementService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSessions = Event.None;
        }
        getSessions() {
          return [...sessions];
        }
        markRead() {
          return Promise.resolve();
        }
      }());
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.visibleSessions = constObservable([]);
          this.activeSession = constObservable(void 0);
        }
      }());
      reg.defineInstance(ISessionsListModelService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
        }
        isSessionPinned() {
          return false;
        }
        migrateLegacyReadState() {
        }
        getSortKey(session) {
          return session.createdAt.getTime();
        }
        getStatusIcon(status) {
          switch (status) {
            case SessionStatus.InProgress:
              return { ...Codicon.sessionInProgress, color: themeColorFromId("textLink.foreground") };
            case SessionStatus.NeedsInput:
              return { ...Codicon.circleFilled, color: themeColorFromId("list.warningForeground") };
            default:
              return { ...Codicon.circleSmallFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") };
          }
        }
      }());
      reg.defineInstance(ISessionGroupsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
        }
        getGroups() {
          return [...groups];
        }
        getGroup(groupId) {
          return groups.find((group) => group.id === groupId);
        }
        getGroupOfSession(sessionId) {
          return membership.get(sessionId);
        }
        getSessionIdsInGroup(groupId) {
          return [...membership].filter(([, id]) => id === groupId).map(([sessionId]) => sessionId);
        }
      }());
      reg.defineInstance(ISessionSectionOrderService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
        }
        resolveOrder(ids) {
          return [...ids];
        }
        isPromoted() {
          return false;
        }
        retain() {
        }
      }());
      reg.defineInstance(IAgentHostFilterService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
          this.selectedProviderId = void 0;
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
      reg.defineInstance(IVoicePlaybackService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.pendingResponseVersion = constObservable(0);
        }
        hasPendingResponse() {
          return false;
        }
      }());
      reg.defineInstance(IAutomationService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.runs = constObservable([]);
        }
      }());
      reg.defineInstance(IWorkbenchAssignmentService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidRefetchAssignments = Event.None;
        }
        async getTreatment() {
          return void 0;
        }
      }());
      reg.defineInstance(IUriIdentityService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.extUri = new ExtUri(() => true);
        }
      }());
      reg.defineInstance(ICustomViewService, new class extends mock() {
      }());
    }
  });
  const width = options.width ?? 340;
  container.style.width = `${width}px`;
  container.style.height = options.phone ? "260px" : "220px";
  container.style.backgroundColor = "var(--vscode-sideBar-background, var(--vscode-editor-background))";
  if (options.phone) {
    container.classList.add("agent-sessions-workbench", "phone-layout");
  }
  const listHost = container.ownerDocument.createElement("div");
  container.appendChild(listHost);
  const list = disposableStore.add(instantiationService.createInstance(SessionsList, listHost, {
    grouping: () => options.grouping ?? SessionsGrouping.Workspace,
    sorting: () => SessionsSorting.Created,
    onSessionOpen: () => {
    }
  }));
  list.layout(options.phone ? 260 : 220, width);
}
const GROUP = { id: "group-1", name: "Release work", createdAt: Date.now() };
const GROUPED_SESSIONS = [
  { id: "a", title: "Fix authentication redirect loop", workspace: "vscode", minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 132, deletions: 18 } },
  { id: "b", title: "Add reconnect backoff", workspace: "agent-host-protocol", minutesAgo: 64, group: GROUP.id },
  { id: "c", title: "Update onboarding copy", workspace: "vscode-docs", minutesAgo: 180 }
];
var sessionsList_fixture_default = defineThemedFixtureGroup({ path: "sessions/" }, {
  SessionsList_CustomGroup: defineComponentFixture({
    render: (ctx) => renderSessionsList(ctx, { sessions: GROUPED_SESSIONS, groups: [GROUP] })
  }),
  SessionsList_CustomGroup_LongWorkspaceNarrow: defineComponentFixture({
    render: (ctx) => renderSessionsList(ctx, {
      sessions: [
        { id: "a", title: "Fix authentication redirect loop", workspace: "an-extremely-long-workspace-name-that-must-truncate", minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 132, deletions: 18 } },
        ...GROUPED_SESSIONS.slice(1)
      ],
      groups: [GROUP],
      width: 260
    })
  }),
  SessionsList_CustomGroup_InProgress: defineComponentFixture({
    render: (ctx) => renderSessionsList(ctx, {
      sessions: [
        { id: "a", title: "Fix authentication redirect loop", workspace: "agent-host-protocol", minutesAgo: 1, group: GROUP.id, status: SessionStatus.InProgress, description: "Running the integration suite" },
        ...GROUPED_SESSIONS.slice(1)
      ],
      groups: [GROUP],
      width: 260
    })
  }),
  SessionsList_WorkspaceSection: defineComponentFixture({
    render: (ctx) => renderSessionsList(ctx, {
      sessions: [{ id: "c", title: "Update onboarding copy", workspace: "vscode-docs", minutesAgo: 180 }]
    })
  }),
  SessionsList_CustomGroup_Phone: defineComponentFixture({
    render: (ctx) => renderSessionsList(ctx, { sessions: GROUPED_SESSIONS, groups: [GROUP], phone: true, width: 340 })
  })
});
export {
  sessionsList_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcc2Vzc2lvbnNMaXN0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiwgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvYWdlbnRIb3N0RmlsdGVyL2NvbW1vbi9hZ2VudEhvc3RGaWx0ZXIuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbkdyb3VwLCBJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSVNlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25DaGFuZ2VzU3VtbWFyeSwgSVNlc3Npb25Gb2xkZXIsIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgU2Vzc2lvbnNHcm91cGluZywgU2Vzc2lvbnNMaXN0LCBTZXNzaW9uc1NvcnRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbnNMaXN0LmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiwgSUFnZW50U2Vzc2lvbnNNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSVZvaWNlUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi92b2ljZVBsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGRlZmluZUNvbXBvbmVudEZpeHR1cmUsIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCwgcmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyB9IGZyb20gJy4uL2ZpeHR1cmVVdGlscy5qcyc7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL2Jyb3dzZXIvbWVkaWEvc2Vzc2lvbnNMaXN0LmNzcyc7XG5cbmludGVyZmFjZSBJU2Vzc2lvblNwZWMge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1cz86IFNlc3Npb25TdGF0dXM7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBtaW51dGVzQWdvOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNoYW5nZXNTdW1tYXJ5PzogSVNlc3Npb25DaGFuZ2VzU3VtbWFyeTtcblx0cmVhZG9ubHkgZ3JvdXA/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZShsYWJlbDogc3RyaW5nKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRjb25zdCByb290ID0gVVJJLmZpbGUoYC9ob21lL3VzZXIvcHJvamVjdHMvJHtsYWJlbH1gKTtcblx0Y29uc3QgZm9sZGVyOiBJU2Vzc2lvbkZvbGRlciA9IHsgcm9vdCwgd29ya2luZ0RpcmVjdG9yeTogcm9vdCwgbmFtZTogbGFiZWwsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfTtcblx0cmV0dXJuIHtcblx0XHR1cmk6IHJvb3QsXG5cdFx0bGFiZWwsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0Zm9sZGVyczogW2ZvbGRlcl0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihzcGVjOiBJU2Vzc2lvblNwZWMpOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IHVwZGF0ZWRBdCA9IG5ldyBEYXRlKERhdGUubm93KCkgLSBzcGVjLm1pbnV0ZXNBZ28gKiA2MCAqIDEwMDApO1xuXHRjb25zdCBkZXNjcmlwdGlvbjogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkID0gc3BlYy5kZXNjcmlwdGlvbiA/IG5ldyBNYXJrZG93blN0cmluZyhzcGVjLmRlc2NyaXB0aW9uKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25JZCA9IHNwZWMuaWQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoYHZzY29kZS1zZXNzaW9uOi8vc2Vzc2lvbi8ke3NwZWMuaWR9YCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvdmlkZXJJZCA9ICdsb2NhbCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGUgPSAnbG9jYWwnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmFjY291bnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY3JlYXRlZEF0ID0gdXBkYXRlZEF0O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRpdGxlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+ID0gY29uc3RPYnNlcnZhYmxlKHNwZWMudGl0bGUpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHVwZGF0ZWRBdDogSU9ic2VydmFibGU8RGF0ZT4gPSBjb25zdE9ic2VydmFibGUodXBkYXRlZEF0KTtcblx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0dXM6IElPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+ID0gY29uc3RPYnNlcnZhYmxlKHNwZWMuc3RhdHVzID8/IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2U6IElPYnNlcnZhYmxlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZShzcGVjLndvcmtzcGFjZSA/IGNyZWF0ZVdvcmtzcGFjZShzcGVjLndvcmtzcGFjZSkgOiB1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzUXVpY2tDaGF0OiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IGNvbnN0T2JzZXJ2YWJsZSghc3BlYy53b3Jrc3BhY2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc1JlYWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gY29uc3RPYnNlcnZhYmxlKHRydWUpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IG5ldmVyW10+ID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBjaGFuZ2VzU3VtbWFyeTogSU9ic2VydmFibGU8SVNlc3Npb25DaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUoc3BlYy5jaGFuZ2VzU3VtbWFyeSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUoZGVzY3JpcHRpb24pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPiA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2FwYWJpbGl0aWVzID0gY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSB9KTtcblx0fSgpO1xufVxuXG5pbnRlcmZhY2UgSVJlbmRlck9wdGlvbnMge1xuXHRyZWFkb25seSBzZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25TcGVjW107XG5cdHJlYWRvbmx5IGdyb3Vwcz86IHJlYWRvbmx5IElTZXNzaW9uR3JvdXBbXTtcblx0cmVhZG9ubHkgZ3JvdXBpbmc/OiBTZXNzaW9uc0dyb3VwaW5nO1xuXHRyZWFkb25seSB3aWR0aD86IG51bWJlcjtcblx0cmVhZG9ubHkgcGhvbmU/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiByZW5kZXJTZXNzaW9uc0xpc3QoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSVJlbmRlck9wdGlvbnMpOiB2b2lkIHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9ID0gY3R4O1xuXHRjb25zdCBzZXNzaW9ucyA9IG9wdGlvbnMuc2Vzc2lvbnMubWFwKGNyZWF0ZVNlc3Npb24pO1xuXHRjb25zdCBncm91cHMgPSBvcHRpb25zLmdyb3VwcyA/PyBbXTtcblx0Y29uc3QgbWVtYmVyc2hpcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGZvciAoY29uc3Qgc3BlYyBvZiBvcHRpb25zLnNlc3Npb25zKSB7XG5cdFx0aWYgKHNwZWMuZ3JvdXApIHtcblx0XHRcdG1lbWJlcnNoaXAuc2V0KHNwZWMuaWQsIHNwZWMuZ3JvdXApO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogcmVnID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lKElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBjaGF0TW9kZWxzOiBJT2JzZXJ2YWJsZTxJdGVyYWJsZTxJQ2hhdE1vZGVsPj4gPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zTW9kZWw+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9ic2VydmVTZXNzaW9uKCk6IElPYnNlcnZhYmxlPElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0oKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbLi4uc2Vzc2lvbnNdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIG1hcmtSZWFkKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+ID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTGlzdE1vZGVsU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgaXNTZXNzaW9uUGlubmVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdFx0b3ZlcnJpZGUgbWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZSgpOiB2b2lkIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRTb3J0S2V5KHNlc3Npb246IElTZXNzaW9uKTogbnVtYmVyIHsgcmV0dXJuIHNlc3Npb24uY3JlYXRlZEF0LmdldFRpbWUoKTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRTdGF0dXNJY29uKHN0YXR1czogU2Vzc2lvblN0YXR1cyk6IFRoZW1lSWNvbiB7XG5cdFx0XHRcdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdFx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyAuLi5Db2RpY29uLnNlc3Npb25JblByb2dyZXNzLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgndGV4dExpbmsuZm9yZWdyb3VuZCcpIH07XG5cdFx0XHRcdFx0XHRjYXNlIFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDpcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgLi4uQ29kaWNvbi5jaXJjbGVGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdsaXN0Lndhcm5pbmdGb3JlZ3JvdW5kJykgfTtcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IC4uLkNvZGljb24uY2lyY2xlU21hbGxGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdhZ2VudFNlc3Npb25SZWFkSW5kaWNhdG9yLmZvcmVncm91bmQnKSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25Hcm91cHNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRHcm91cHMoKTogSVNlc3Npb25Hcm91cFtdIHsgcmV0dXJuIFsuLi5ncm91cHNdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldEdyb3VwKGdyb3VwSWQ6IHN0cmluZyk6IElTZXNzaW9uR3JvdXAgfCB1bmRlZmluZWQgeyByZXR1cm4gZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuaWQgPT09IGdyb3VwSWQpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldEdyb3VwT2ZTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIG1lbWJlcnNoaXAuZ2V0KHNlc3Npb25JZCk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbklkc0luR3JvdXAoZ3JvdXBJZDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdFx0XHRcdHJldHVybiBbLi4ubWVtYmVyc2hpcF0uZmlsdGVyKChbLCBpZF0pID0+IGlkID09PSBncm91cElkKS5tYXAoKFtzZXNzaW9uSWRdKSA9PiBzZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlc29sdmVPcmRlcihpZHM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7IHJldHVybiBbLi4uaWRzXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBpc1Byb21vdGVkKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmV0YWluKCk6IHZvaWQgeyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZWxlY3RlZFByb3ZpZGVySWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvdmlkZXJzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXJzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXIoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlUGxheWJhY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZVBsYXliYWNrU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHBlbmRpbmdSZXNwb25zZVZlcnNpb246IElPYnNlcnZhYmxlPG51bWJlcj4gPSBjb25zdE9ic2VydmFibGUoMCk7XG5cdFx0XHRcdG92ZXJyaWRlIGhhc1BlbmRpbmdSZXNwb25zZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBdXRvbWF0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0b21hdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBydW5zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0VHJlYXRtZW50PFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPigpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IHRydWUpO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ3VzdG9tVmlld1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbVZpZXdTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB3aWR0aCA9IG9wdGlvbnMud2lkdGggPz8gMzQwO1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBvcHRpb25zLnBob25lID8gJzI2MHB4JyA6ICcyMjBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndmFyKC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZCwgdmFyKC0tdnNjb2RlLWVkaXRvci1iYWNrZ3JvdW5kKSknO1xuXHRpZiAob3B0aW9ucy5waG9uZSkge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9ucy13b3JrYmVuY2gnLCAncGhvbmUtbGF5b3V0Jyk7XG5cdH1cblxuXHRjb25zdCBsaXN0SG9zdCA9IGNvbnRhaW5lci5vd25lckRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQobGlzdEhvc3QpO1xuXHRjb25zdCBsaXN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3QsIGxpc3RIb3N0LCB7XG5cdFx0Z3JvdXBpbmc6ICgpID0+IG9wdGlvbnMuZ3JvdXBpbmcgPz8gU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UsXG5cdFx0c29ydGluZzogKCkgPT4gU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQsXG5cdFx0b25TZXNzaW9uT3BlbjogKCkgPT4geyB9LFxuXHR9KSk7XG5cdGxpc3QubGF5b3V0KG9wdGlvbnMucGhvbmUgPyAyNjAgOiAyMjAsIHdpZHRoKTtcbn1cblxuY29uc3QgR1JPVVA6IElTZXNzaW9uR3JvdXAgPSB7IGlkOiAnZ3JvdXAtMScsIG5hbWU6ICdSZWxlYXNlIHdvcmsnLCBjcmVhdGVkQXQ6IERhdGUubm93KCkgfTtcbmNvbnN0IEdST1VQRURfU0VTU0lPTlM6IHJlYWRvbmx5IElTZXNzaW9uU3BlY1tdID0gW1xuXHR7IGlkOiAnYScsIHRpdGxlOiAnRml4IGF1dGhlbnRpY2F0aW9uIHJlZGlyZWN0IGxvb3AnLCB3b3Jrc3BhY2U6ICd2c2NvZGUnLCBtaW51dGVzQWdvOiAxMiwgZ3JvdXA6IEdST1VQLmlkLCBjaGFuZ2VzU3VtbWFyeTogeyBmaWxlczogNCwgYWRkaXRpb25zOiAxMzIsIGRlbGV0aW9uczogMTggfSB9LFxuXHR7IGlkOiAnYicsIHRpdGxlOiAnQWRkIHJlY29ubmVjdCBiYWNrb2ZmJywgd29ya3NwYWNlOiAnYWdlbnQtaG9zdC1wcm90b2NvbCcsIG1pbnV0ZXNBZ286IDY0LCBncm91cDogR1JPVVAuaWQgfSxcblx0eyBpZDogJ2MnLCB0aXRsZTogJ1VwZGF0ZSBvbmJvYXJkaW5nIGNvcHknLCB3b3Jrc3BhY2U6ICd2c2NvZGUtZG9jcycsIG1pbnV0ZXNBZ286IDE4MCB9LFxuXTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zLycgfSwge1xuXHRTZXNzaW9uc0xpc3RfQ3VzdG9tR3JvdXA6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlclNlc3Npb25zTGlzdChjdHgsIHsgc2Vzc2lvbnM6IEdST1VQRURfU0VTU0lPTlMsIGdyb3VwczogW0dST1VQXSB9KSxcblx0fSksXG5cdFNlc3Npb25zTGlzdF9DdXN0b21Hcm91cF9Mb25nV29ya3NwYWNlTmFycm93OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJTZXNzaW9uc0xpc3QoY3R4LCB7XG5cdFx0XHRzZXNzaW9uczogW1xuXHRcdFx0XHR7IGlkOiAnYScsIHRpdGxlOiAnRml4IGF1dGhlbnRpY2F0aW9uIHJlZGlyZWN0IGxvb3AnLCB3b3Jrc3BhY2U6ICdhbi1leHRyZW1lbHktbG9uZy13b3Jrc3BhY2UtbmFtZS10aGF0LW11c3QtdHJ1bmNhdGUnLCBtaW51dGVzQWdvOiAxMiwgZ3JvdXA6IEdST1VQLmlkLCBjaGFuZ2VzU3VtbWFyeTogeyBmaWxlczogNCwgYWRkaXRpb25zOiAxMzIsIGRlbGV0aW9uczogMTggfSB9LFxuXHRcdFx0XHQuLi5HUk9VUEVEX1NFU1NJT05TLnNsaWNlKDEpLFxuXHRcdFx0XSxcblx0XHRcdGdyb3VwczogW0dST1VQXSxcblx0XHRcdHdpZHRoOiAyNjAsXG5cdFx0fSksXG5cdH0pLFxuXHRTZXNzaW9uc0xpc3RfQ3VzdG9tR3JvdXBfSW5Qcm9ncmVzczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyU2Vzc2lvbnNMaXN0KGN0eCwge1xuXHRcdFx0c2Vzc2lvbnM6IFtcblx0XHRcdFx0eyBpZDogJ2EnLCB0aXRsZTogJ0ZpeCBhdXRoZW50aWNhdGlvbiByZWRpcmVjdCBsb29wJywgd29ya3NwYWNlOiAnYWdlbnQtaG9zdC1wcm90b2NvbCcsIG1pbnV0ZXNBZ286IDEsIGdyb3VwOiBHUk9VUC5pZCwgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIGRlc2NyaXB0aW9uOiAnUnVubmluZyB0aGUgaW50ZWdyYXRpb24gc3VpdGUnIH0sXG5cdFx0XHRcdC4uLkdST1VQRURfU0VTU0lPTlMuc2xpY2UoMSksXG5cdFx0XHRdLFxuXHRcdFx0Z3JvdXBzOiBbR1JPVVBdLFxuXHRcdFx0d2lkdGg6IDI2MCxcblx0XHR9KSxcblx0fSksXG5cdFNlc3Npb25zTGlzdF9Xb3Jrc3BhY2VTZWN0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJTZXNzaW9uc0xpc3QoY3R4LCB7XG5cdFx0XHRzZXNzaW9uczogW3sgaWQ6ICdjJywgdGl0bGU6ICdVcGRhdGUgb25ib2FyZGluZyBjb3B5Jywgd29ya3NwYWNlOiAndnNjb2RlLWRvY3MnLCBtaW51dGVzQWdvOiAxODAgfV0sXG5cdFx0fSksXG5cdH0pLFxuXHRTZXNzaW9uc0xpc3RfQ3VzdG9tR3JvdXBfUGhvbmU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlclNlc3Npb25zTGlzdChjdHgsIHsgc2Vzc2lvbnM6IEdST1VQRURfU0VTU0lPTlMsIGdyb3VwczogW0dST1VQXSwgcGhvbmU6IHRydWUsIHdpZHRoOiAzNDAgfSksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFL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
