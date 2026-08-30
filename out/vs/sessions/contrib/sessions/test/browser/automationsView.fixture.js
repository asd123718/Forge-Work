import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ExtUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { MenuService } from "../../../../../platform/actions/common/menuService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IAutomationDialogService } from "../../../../../workbench/contrib/chat/common/automations/automationDialogService.js";
import { ChatAutomationsEnabledContext } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationRunner } from "../../../../../workbench/contrib/chat/common/automations/automationRunner.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IVoicePlaybackService } from "../../../../../workbench/contrib/chat/common/voicePlaybackService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { CustomViewNode } from "../../../../browser/parts/customViewNode.js";
import { CustomViewService, ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { ISessionsListModelService } from "../../../../services/sessions/browser/sessionsListModelService.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { AUTOMATIONS_CUSTOM_VIEW_ID } from "../../browser/automationsConstants.js";
import { AutomationsCustomViewContribution } from "../../browser/views/automationsView.js";
const WORKSPACE = URI.parse("file:///workspaces/vscode");
const ITestAgentSessionsService = createDecorator("agentSessions");
class FixtureActionViewItemService extends Disposable {
  constructor() {
    super(...arguments);
    this.providers = /* @__PURE__ */ new Map();
    this.changeEmitter = this._register(new Emitter());
    this.onDidChange = this.changeEmitter.event;
  }
  register(menu, commandId, provider, event) {
    const key = this.getKey(menu, commandId);
    if (this.providers.has(key)) {
      throw new Error(`Duplicate action view item provider for ${key}`);
    }
    this.providers.set(key, provider);
    const listener = event?.(() => this.changeEmitter.fire(menu));
    return toDisposable(() => {
      listener?.dispose();
      this.providers.delete(key);
    });
  }
  lookUp(menu, commandId) {
    return this.providers.get(this.getKey(menu, commandId));
  }
  getKey(menu, commandId) {
    return `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
  }
}
class FixtureAutomationService extends mock() {
  constructor(automations, runs) {
    super();
    this.automations = constObservable(automations);
    this.runs = constObservable(runs);
  }
  async deleteRun() {
  }
}
class FixtureSessionsManagementService extends mock() {
  constructor(runs) {
    super();
    this.sessions = /* @__PURE__ */ new Map();
    this.onDidDeleteSession = Event.None;
    this.onDidChangeSessions = Event.None;
    for (const [index, run] of runs.entries()) {
      if (!run.sessionResource) {
        continue;
      }
      const resource = run.sessionResource;
      this.sessions.set(run.sessionResource.toString(), upcastPartial({
        resource,
        sessionId: `fixture-session-${index + 1}`,
        providerId: "fixture",
        sessionType: "fixture",
        icon: Codicon.account,
        createdAt: new Date(run.startedAt),
        workspace: constObservable({
          uri: WORKSPACE,
          label: "vscode",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        }),
        isQuickChat: constObservable(false),
        title: constObservable(`Run ${index + 1}`),
        updatedAt: constObservable(new Date(run.completedAt ?? run.startedAt)),
        isRead: constObservable(index !== 0),
        capabilities: constObservable({ supportsMultipleChats: false, supportsDelete: true }),
        status: constObservable(run.status === "failed" ? SessionStatus.Error : run.status === "completed" ? SessionStatus.Completed : SessionStatus.InProgress),
        changesets: constObservable([]),
        changes: constObservable([]),
        modelId: constObservable(void 0),
        mode: constObservable(void 0),
        loading: constObservable(false),
        isArchived: constObservable(false),
        description: constObservable(void 0),
        lastTurnEnd: constObservable(void 0),
        chats: constObservable([]),
        mainChat: constObservable(new class extends mock() {
        }())
      }));
    }
  }
  getSession(resource) {
    return this.sessions.get(resource.toString());
  }
  getSessions() {
    return [...this.sessions.values()];
  }
  async markAllRead() {
  }
}
var automationsView_fixture_default = defineThemedFixtureGroup({ path: "sessions/automations/" }, {
  Populated: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderAutomations(ctx, { width: 1e3, height: 720, populated: true })
  }),
  Empty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderAutomations(ctx, { width: 1e3, height: 520, populated: false })
  }),
  Narrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderAutomations(ctx, { width: 520, height: 720, populated: true })
  })
});
function renderAutomations(ctx, options) {
  const data = options.populated ? createPopulatedData() : { automations: [], runs: [] };
  const configurationService = new TestConfigurationService({
    chat: { automations: { enabled: true } }
  });
  const contextKeyService = new ContextKeyService(configurationService);
  const actionViewItemService = new FixtureActionViewItemService();
  const customViewService = ctx.disposableStore.add(new CustomViewService(new NullLogService(), ctx.disposableStore.add(new InMemoryStorageService())));
  const automationService = new FixtureAutomationService(data.automations, data.runs);
  const sessionsManagementService = new FixtureSessionsManagementService(data.runs);
  ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.defineInstance(IActionViewItemService, actionViewItemService);
      reg.define(IListService, ListService);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
      reg.define(IMenuService, MenuService);
      reg.defineInstance(IConfigurationService, configurationService);
      reg.defineInstance(IContextKeyService, contextKeyService);
      reg.defineInstance(IUriIdentityService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.extUri = new ExtUri(() => true);
        }
      }());
      reg.defineInstance(IAutomationService, automationService);
      reg.defineInstance(IAutomationRunner, new class extends mock() {
      }());
      reg.defineInstance(IAutomationDialogService, new class extends mock() {
      }());
      reg.defineInstance(ICustomViewService, customViewService);
      reg.defineInstance(ISessionsManagementService, sessionsManagementService);
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.visibleSessions = constObservable([]);
          this.activeSession = constObservable(void 0);
        }
        async openSession() {
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
        getStatusIcon() {
          return Codicon.circleSmallFilled;
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
      reg.defineInstance(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.chatModels = constObservable([]);
        }
      }());
      reg.defineInstance(ITestAgentSessionsService, {
        model: {
          observeSession: () => constObservable(void 0)
        }
      });
    }
  });
  ctx.disposableStore.add(instantiationService.createInstance(AutomationsCustomViewContribution));
  customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
  const descriptor = customViewService.activeCustomView.get();
  if (!descriptor) {
    throw new Error("Automations custom view was not registered");
  }
  ctx.container.classList.add("monaco-workbench");
  ctx.container.style.width = `${options.width}px`;
  ctx.container.style.height = `${options.height}px`;
  ctx.container.style.setProperty("--session-view-background", "var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))");
  ctx.container.style.setProperty("--session-view-foreground", "var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))");
  ctx.container.style.backgroundColor = "var(--session-view-background)";
  const node = ctx.disposableStore.add(instantiationService.createInstance(CustomViewNode, descriptor));
  node.element.style.height = "100%";
  ctx.container.appendChild(node.element);
  node.layout(options.width, options.height);
}
function createPopulatedData() {
  const today = /* @__PURE__ */ new Date();
  today.setHours(9, 15, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  yesterday.setHours(15, 30, 0, 0);
  const automations = [
    createAutomation({
      id: "daily-review",
      name: "Daily code review",
      prompt: "Review recent changes for correctness, missing tests, and regressions.",
      schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }
    }),
    createAutomation({
      id: "dependency-audit",
      name: "Dependency audit",
      prompt: "Check dependencies for available security updates and summarize recommended changes.",
      schedule: { interval: "weekly", scheduleHour: 10, scheduleMinute: 30, scheduleDay: 1 },
      enabled: false
    }),
    createAutomation({
      id: "issue-triage",
      name: "Issue triage",
      prompt: "Review new issues, group duplicates, and suggest labels for the maintainers.",
      schedule: { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "quickChat", providerId: "fixture", sessionTypeId: "fixture" }
    })
  ];
  const runs = [
    createRun("daily-review-starting", "daily-review", "pending", today, void 0, false),
    createRun("daily-review-run", "daily-review", "completed", today),
    createRun("dependency-audit-run", "dependency-audit", "running", today),
    createRun("issue-triage-run", "issue-triage", "failed", yesterday, "The repository could not be reached.", false)
  ];
  return { automations, runs };
}
function createAutomation(overrides) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: "automation",
    name: "Automation",
    prompt: "Run the automation.",
    schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
    target: { kind: "workspace", folderUri: WORKSPACE, isolation: { kind: "default" } },
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
function createRun(id, automationId, status, startedAt, errorMessage, hasSession = true) {
  return {
    id,
    automationId,
    status,
    trigger: "schedule",
    sessionResource: hasSession ? URI.parse(`vscode-chat-session://fixture/${id}`) : void 0,
    startedAt: startedAt.toISOString(),
    completedAt: status === "completed" || status === "failed" ? startedAt.toISOString() : void 0,
    errorMessage,
    leaderWindowId: 1
  };
}
export {
  automationsView_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25zVmlldy5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFeHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtRmFjdG9yeSwgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vbWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkRlc2NyaXB0b3IsIElBdXRvbWF0aW9uUnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zRW5hYmxlZC5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25SdW5uZXIuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2ZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBDdXN0b21WaWV3Tm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvY3VzdG9tVmlld05vZGUuanMnO1xuaW1wb3J0IHsgQ3VzdG9tVmlld1NlcnZpY2UsIElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi9icm93c2VyL2F1dG9tYXRpb25zQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25zQ3VzdG9tVmlld0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld3MvYXV0b21hdGlvbnNWaWV3LmpzJztcblxuY29uc3QgV09SS1NQQUNFID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZXMvdnNjb2RlJyk7XG5jb25zdCBJVGVzdEFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPG9iamVjdD4oJ2FnZW50U2Vzc2lvbnMnKTtcblxuY2xhc3MgRml4dHVyZUFjdGlvblZpZXdJdGVtU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJQWN0aW9uVmlld0l0ZW1GYWN0b3J5PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNZW51SWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuY2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRyZWdpc3RlcihtZW51OiBNZW51SWQsIGNvbW1hbmRJZDogc3RyaW5nIHwgTWVudUlkLCBwcm92aWRlcjogSUFjdGlvblZpZXdJdGVtRmFjdG9yeSwgZXZlbnQ/OiBFdmVudDx1bmtub3duPik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmdldEtleShtZW51LCBjb21tYW5kSWQpO1xuXHRcdGlmICh0aGlzLnByb3ZpZGVycy5oYXMoa2V5KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBEdXBsaWNhdGUgYWN0aW9uIHZpZXcgaXRlbSBwcm92aWRlciBmb3IgJHtrZXl9YCk7XG5cdFx0fVxuXHRcdHRoaXMucHJvdmlkZXJzLnNldChrZXksIHByb3ZpZGVyKTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IGV2ZW50Py4oKCkgPT4gdGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUobWVudSkpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucHJvdmlkZXJzLmRlbGV0ZShrZXkpO1xuXHRcdH0pO1xuXHR9XG5cblx0bG9va1VwKG1lbnU6IE1lbnVJZCwgY29tbWFuZElkOiBzdHJpbmcgfCBNZW51SWQpOiBJQWN0aW9uVmlld0l0ZW1GYWN0b3J5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlcnMuZ2V0KHRoaXMuZ2V0S2V5KG1lbnUsIGNvbW1hbmRJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXkobWVudTogTWVudUlkLCBjb21tYW5kSWQ6IHN0cmluZyB8IE1lbnVJZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke21lbnUuaWR9LyR7Y29tbWFuZElkIGluc3RhbmNlb2YgTWVudUlkID8gY29tbWFuZElkLmlkIDogY29tbWFuZElkfWA7XG5cdH1cbn1cblxuY2xhc3MgRml4dHVyZUF1dG9tYXRpb25TZXJ2aWNlIGV4dGVuZHMgbW9jazxJQXV0b21hdGlvblNlcnZpY2U+KCkge1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGF1dG9tYXRpb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvbkRlc2NyaXB0b3JbXT47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJ1bnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+O1xuXG5cdGNvbnN0cnVjdG9yKGF1dG9tYXRpb25zOiByZWFkb25seSBJQXV0b21hdGlvbkRlc2NyaXB0b3JbXSwgcnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hdXRvbWF0aW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShhdXRvbWF0aW9ucyk7XG5cdFx0dGhpcy5ydW5zID0gY29uc3RPYnNlcnZhYmxlKHJ1bnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsZXRlUnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbmNsYXNzIEZpeHR1cmVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWREZWxldGVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IEV2ZW50Lk5vbmU7XG5cblx0Y29uc3RydWN0b3IocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Zm9yIChjb25zdCBbaW5kZXgsIHJ1bl0gb2YgcnVucy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICghcnVuLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc291cmNlID0gcnVuLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdHRoaXMuc2Vzc2lvbnMuc2V0KHJ1bi5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgdXBjYXN0UGFydGlhbDxJU2Vzc2lvbj4oe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0c2Vzc2lvbklkOiBgZml4dHVyZS1zZXNzaW9uLSR7aW5kZXggKyAxfWAsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdmaXh0dXJlJyxcblx0XHRcdFx0c2Vzc2lvblR5cGU6ICdmaXh0dXJlJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5hY2NvdW50LFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKHJ1bi5zdGFydGVkQXQpLFxuXHRcdFx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHRcdFx0dXJpOiBXT1JLU1BBQ0UsXG5cdFx0XHRcdFx0bGFiZWw6ICd2c2NvZGUnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRcdFx0dGl0bGU6IGNvbnN0T2JzZXJ2YWJsZShgUnVuICR7aW5kZXggKyAxfWApLFxuXHRcdFx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZShydW4uY29tcGxldGVkQXQgPz8gcnVuLnN0YXJ0ZWRBdCkpLFxuXHRcdFx0XHRpc1JlYWQ6IGNvbnN0T2JzZXJ2YWJsZShpbmRleCAhPT0gMCksXG5cdFx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgc3VwcG9ydHNEZWxldGU6IHRydWUgfSksXG5cdFx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKHJ1bi5zdGF0dXMgPT09ICdmYWlsZWQnXG5cdFx0XHRcdFx0PyBTZXNzaW9uU3RhdHVzLkVycm9yXG5cdFx0XHRcdFx0OiBydW4uc3RhdHVzID09PSAnY29tcGxldGVkJ1xuXHRcdFx0XHRcdFx0PyBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0XHRcdFx0OiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpLFxuXHRcdFx0XHRjaGFuZ2VzZXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdFx0XHRjaGFuZ2VzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdFx0XHRtb2RlbElkOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRcdFx0bW9kZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRcdFx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+KFtdKSxcblx0XHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHsgfSgpKSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLnNlc3Npb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG1hcmtBbGxSZWFkKCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbmludGVyZmFjZSBJQXV0b21hdGlvbnNGaXh0dXJlRGF0YSB7XG5cdHJlYWRvbmx5IGF1dG9tYXRpb25zOiByZWFkb25seSBJQXV0b21hdGlvbkRlc2NyaXB0b3JbXTtcblx0cmVhZG9ubHkgcnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXTtcbn1cblxuaW50ZXJmYWNlIElBdXRvbWF0aW9uc0ZpeHR1cmVPcHRpb25zIHtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBvcHVsYXRlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zL2F1dG9tYXRpb25zLycgfSwge1xuXHRQb3B1bGF0ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJBdXRvbWF0aW9ucyhjdHgsIHsgd2lkdGg6IDEwMDAsIGhlaWdodDogNzIwLCBwb3B1bGF0ZWQ6IHRydWUgfSksXG5cdH0pLFxuXHRFbXB0eTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckF1dG9tYXRpb25zKGN0eCwgeyB3aWR0aDogMTAwMCwgaGVpZ2h0OiA1MjAsIHBvcHVsYXRlZDogZmFsc2UgfSksXG5cdH0pLFxuXHROYXJyb3c6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJBdXRvbWF0aW9ucyhjdHgsIHsgd2lkdGg6IDUyMCwgaGVpZ2h0OiA3MjAsIHBvcHVsYXRlZDogdHJ1ZSB9KSxcblx0fSksXG59KTtcblxuZnVuY3Rpb24gcmVuZGVyQXV0b21hdGlvbnMoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSUF1dG9tYXRpb25zRml4dHVyZU9wdGlvbnMpOiB2b2lkIHtcblx0Y29uc3QgZGF0YSA9IG9wdGlvbnMucG9wdWxhdGVkID8gY3JlYXRlUG9wdWxhdGVkRGF0YSgpIDogeyBhdXRvbWF0aW9uczogW10sIHJ1bnM6IFtdIH07XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0Y2hhdDogeyBhdXRvbWF0aW9uczogeyBlbmFibGVkOiB0cnVlIH0gfSxcblx0fSk7XG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gbmV3IENvbnRleHRLZXlTZXJ2aWNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlID0gbmV3IEZpeHR1cmVBY3Rpb25WaWV3SXRlbVNlcnZpY2UoKTtcblx0Y29uc3QgY3VzdG9tVmlld1NlcnZpY2UgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQ3VzdG9tVmlld1NlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKSk7XG5cdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZpeHR1cmVBdXRvbWF0aW9uU2VydmljZShkYXRhLmF1dG9tYXRpb25zLCBkYXRhLnJ1bnMpO1xuXHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IEZpeHR1cmVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGRhdGEucnVucyk7XG5cdENoYXRBdXRvbWF0aW9uc0VuYWJsZWRDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoY3R4LmRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IHJlZyA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFjdGlvblZpZXdJdGVtU2VydmljZSwgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lKElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJTWVudVNlcnZpY2UsIE1lbnVTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IHRydWUpO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQXV0b21hdGlvblNlcnZpY2UsIGF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQXV0b21hdGlvblJ1bm5lciwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0b21hdGlvblJ1bm5lcj4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uRGlhbG9nU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbVZpZXdTZXJ2aWNlLCBjdXN0b21WaWV3U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZpc2libGVTZXNzaW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBpc1Nlc3Npb25QaW5uZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRTdGF0dXNJY29uKCkgeyByZXR1cm4gQ29kaWNvbi5jaXJjbGVTbWFsbEZpbGxlZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVByb3ZpZGVycyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFByb3ZpZGVycygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElWb2ljZVBsYXliYWNrU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVm9pY2VQbGF5YmFja1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBwZW5kaW5nUmVzcG9uc2VWZXJzaW9uID0gY29uc3RPYnNlcnZhYmxlKDApO1xuXHRcdFx0XHRvdmVycmlkZSBoYXNQZW5kaW5nUmVzcG9uc2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhdE1vZGVscyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElUZXN0QWdlbnRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0XHRvYnNlcnZlU2Vzc2lvbjogKCkgPT4gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9LFxuXHR9KTtcblxuXHRjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRvbWF0aW9uc0N1c3RvbVZpZXdDb250cmlidXRpb24pKTtcblx0Y3VzdG9tVmlld1NlcnZpY2Uuc2hvd0N1c3RvbVZpZXcoQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQpO1xuXHRjb25zdCBkZXNjcmlwdG9yID0gY3VzdG9tVmlld1NlcnZpY2UuYWN0aXZlQ3VzdG9tVmlldy5nZXQoKTtcblx0aWYgKCFkZXNjcmlwdG9yKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdBdXRvbWF0aW9ucyBjdXN0b20gdmlldyB3YXMgbm90IHJlZ2lzdGVyZWQnKTtcblx0fVxuXG5cdGN0eC5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXdvcmtiZW5jaCcpO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7b3B0aW9ucy53aWR0aH1weGA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7b3B0aW9ucy5oZWlnaHR9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXNlc3Npb24tdmlldy1iYWNrZ3JvdW5kJywgJ3ZhcigtLXZzY29kZS1hZ2VudHNQYW5lbC1iYWNrZ3JvdW5kLCB2YXIoLS12c2NvZGUtc2lkZUJhci1iYWNrZ3JvdW5kKSknKTtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1zZXNzaW9uLXZpZXctZm9yZWdyb3VuZCcsICd2YXIoLS12c2NvZGUtYWdlbnRzUGFuZWwtZm9yZWdyb3VuZCwgdmFyKC0tdnNjb2RlLXNpZGVCYXItZm9yZWdyb3VuZCkpJyk7XG5cdGN0eC5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3ZhcigtLXNlc3Npb24tdmlldy1iYWNrZ3JvdW5kKSc7XG5cblx0Y29uc3Qgbm9kZSA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbVZpZXdOb2RlLCBkZXNjcmlwdG9yKSk7XG5cdG5vZGUuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdGN0eC5jb250YWluZXIuYXBwZW5kQ2hpbGQobm9kZS5lbGVtZW50KTtcblx0bm9kZS5sYXlvdXQob3B0aW9ucy53aWR0aCwgb3B0aW9ucy5oZWlnaHQpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQb3B1bGF0ZWREYXRhKCk6IElBdXRvbWF0aW9uc0ZpeHR1cmVEYXRhIHtcblx0Y29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpO1xuXHR0b2RheS5zZXRIb3Vycyg5LCAxNSwgMCwgMCk7XG5cdGNvbnN0IHllc3RlcmRheSA9IG5ldyBEYXRlKHRvZGF5KTtcblx0eWVzdGVyZGF5LnNldERhdGUodG9kYXkuZ2V0RGF0ZSgpIC0gMSk7XG5cdHllc3RlcmRheS5zZXRIb3VycygxNSwgMzAsIDAsIDApO1xuXG5cdGNvbnN0IGF1dG9tYXRpb25zOiByZWFkb25seSBJQXV0b21hdGlvbkRlc2NyaXB0b3JbXSA9IFtcblx0XHRjcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdGlkOiAnZGFpbHktcmV2aWV3Jyxcblx0XHRcdG5hbWU6ICdEYWlseSBjb2RlIHJldmlldycsXG5cdFx0XHRwcm9tcHQ6ICdSZXZpZXcgcmVjZW50IGNoYW5nZXMgZm9yIGNvcnJlY3RuZXNzLCBtaXNzaW5nIHRlc3RzLCBhbmQgcmVncmVzc2lvbnMuJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdH0pLFxuXHRcdGNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0aWQ6ICdkZXBlbmRlbmN5LWF1ZGl0Jyxcblx0XHRcdG5hbWU6ICdEZXBlbmRlbmN5IGF1ZGl0Jyxcblx0XHRcdHByb21wdDogJ0NoZWNrIGRlcGVuZGVuY2llcyBmb3IgYXZhaWxhYmxlIHNlY3VyaXR5IHVwZGF0ZXMgYW5kIHN1bW1hcml6ZSByZWNvbW1lbmRlZCBjaGFuZ2VzLicsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ3dlZWtseScsIHNjaGVkdWxlSG91cjogMTAsIHNjaGVkdWxlTWludXRlOiAzMCwgc2NoZWR1bGVEYXk6IDEgfSxcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdH0pLFxuXHRcdGNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0aWQ6ICdpc3N1ZS10cmlhZ2UnLFxuXHRcdFx0bmFtZTogJ0lzc3VlIHRyaWFnZScsXG5cdFx0XHRwcm9tcHQ6ICdSZXZpZXcgbmV3IGlzc3VlcywgZ3JvdXAgZHVwbGljYXRlcywgYW5kIHN1Z2dlc3QgbGFiZWxzIGZvciB0aGUgbWFpbnRhaW5lcnMuJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnaG91cmx5Jywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdHRhcmdldDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2ZpeHR1cmUnLCBzZXNzaW9uVHlwZUlkOiAnZml4dHVyZScgfSxcblx0XHR9KSxcblx0XTtcblxuXHRjb25zdCBydW5zOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdID0gW1xuXHRcdGNyZWF0ZVJ1bignZGFpbHktcmV2aWV3LXN0YXJ0aW5nJywgJ2RhaWx5LXJldmlldycsICdwZW5kaW5nJywgdG9kYXksIHVuZGVmaW5lZCwgZmFsc2UpLFxuXHRcdGNyZWF0ZVJ1bignZGFpbHktcmV2aWV3LXJ1bicsICdkYWlseS1yZXZpZXcnLCAnY29tcGxldGVkJywgdG9kYXkpLFxuXHRcdGNyZWF0ZVJ1bignZGVwZW5kZW5jeS1hdWRpdC1ydW4nLCAnZGVwZW5kZW5jeS1hdWRpdCcsICdydW5uaW5nJywgdG9kYXkpLFxuXHRcdGNyZWF0ZVJ1bignaXNzdWUtdHJpYWdlLXJ1bicsICdpc3N1ZS10cmlhZ2UnLCAnZmFpbGVkJywgeWVzdGVyZGF5LCAnVGhlIHJlcG9zaXRvcnkgY291bGQgbm90IGJlIHJlYWNoZWQuJywgZmFsc2UpLFxuXHRdO1xuXG5cdHJldHVybiB7IGF1dG9tYXRpb25zLCBydW5zIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUF1dG9tYXRpb24ob3ZlcnJpZGVzOiBQYXJ0aWFsPElBdXRvbWF0aW9uRGVzY3JpcHRvcj4pOiBJQXV0b21hdGlvbkRlc2NyaXB0b3Ige1xuXHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdhdXRvbWF0aW9uJyxcblx0XHRuYW1lOiAnQXV0b21hdGlvbicsXG5cdFx0cHJvbXB0OiAnUnVuIHRoZSBhdXRvbWF0aW9uLicsXG5cdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBXT1JLU1BBQ0UsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9LFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Y3JlYXRlZEF0OiBub3csXG5cdFx0dXBkYXRlZEF0OiBub3csXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVSdW4oaWQ6IHN0cmluZywgYXV0b21hdGlvbklkOiBzdHJpbmcsIHN0YXR1czogSUF1dG9tYXRpb25SdW5bJ3N0YXR1cyddLCBzdGFydGVkQXQ6IERhdGUsIGVycm9yTWVzc2FnZT86IHN0cmluZywgaGFzU2Vzc2lvbiA9IHRydWUpOiBJQXV0b21hdGlvblJ1biB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0YXV0b21hdGlvbklkLFxuXHRcdHN0YXR1cyxcblx0XHR0cmlnZ2VyOiAnc2NoZWR1bGUnLFxuXHRcdHNlc3Npb25SZXNvdXJjZTogaGFzU2Vzc2lvbiA/IFVSSS5wYXJzZShgdnNjb2RlLWNoYXQtc2Vzc2lvbjovL2ZpeHR1cmUvJHtpZH1gKSA6IHVuZGVmaW5lZCxcblx0XHRzdGFydGVkQXQ6IHN0YXJ0ZWRBdC50b0lTT1N0cmluZygpLFxuXHRcdGNvbXBsZXRlZEF0OiBzdGF0dXMgPT09ICdjb21wbGV0ZWQnIHx8IHN0YXR1cyA9PT0gJ2ZhaWxlZCcgPyBzdGFydGVkQXQudG9JU09TdHJpbmcoKSA6IHVuZGVmaW5lZCxcblx0XHRlcnJvck1lc3NhZ2UsXG5cdFx0bGVhZGVyV2luZG93SWQ6IDEsXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLHVCQUFvQztBQUM3QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQWlDLDhCQUE4QjtBQUMvRCxTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGNBQWMsbUJBQW1CO0FBQzFDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtB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
