import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { EditorMarkdownCodeBlockRenderer } from "../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
import { AgentSessionRenderer, AgentSessionSectionRenderer } from "../../../../contrib/chat/browser/agentSessions/agentSessionsViewer.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IVoicePlaybackService } from "../../../../contrib/chat/common/voicePlaybackService.js";
import { AgentSessionStatus, AgentSessionSection } from "../../../../contrib/chat/browser/agentSessions/agentSessionsModel.js";
import { AgentSessionProviders } from "../../../../contrib/chat/browser/agentSessions/agentSessions.js";
import { AgentSessionApprovalKind } from "../../../../contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import "../../../../contrib/chat/browser/agentSessions/media/agentsessionsviewer.css";
function createMockSession(overrides) {
  const now = Date.now();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = overrides.resource ?? URI.parse(`vscode-chat-session://${overrides.providerType}/session-${Math.random().toString(36).slice(2)}`);
      this.label = overrides.label;
      this.status = overrides.status;
      this.providerType = overrides.providerType;
      this.providerLabel = overrides.providerLabel ?? overrides.providerType;
      this.icon = overrides.icon ?? Codicon.vm;
      this.badge = overrides.badge;
      this.description = overrides.description;
      this.tooltip = overrides.tooltip;
      this.changes = overrides.changes;
      this.timing = overrides.timing ?? {
        created: now - 60 * 60 * 1e3,
        lastRequestStarted: void 0,
        lastRequestEnded: void 0
      };
    }
    isArchived() {
      return overrides.isArchived?.() ?? false;
    }
    setArchived() {
    }
    isPinned() {
      return overrides.isPinned?.() ?? false;
    }
    setPinned() {
    }
    isRead() {
      return overrides.isRead?.() ?? true;
    }
    isMarkedUnread() {
      return false;
    }
    setRead() {
    }
  }();
}
function wrapAsTreeNode(element) {
  return {
    element,
    children: [],
    depth: 0,
    visibleChildrenCount: 0,
    visibleChildIndex: 0,
    collapsible: false,
    collapsed: false,
    visible: true,
    filterData: void 0
  };
}
const rendererOptions = {
  disableHover: true,
  getHoverPosition: () => HoverPosition.BELOW
};
function createMockApprovalModel(sessionResource, info) {
  const obs = observableValue("mockApproval", info);
  return new class extends mock() {
    getApproval(resource) {
      if (resource.toString() === sessionResource.toString()) {
        return obs;
      }
      return observableValue("mockApproval.empty", void 0);
    }
  }();
}
function renderSessionItem(ctx, session, approvalModel) {
  const { container, disposableStore } = ctx;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
      reg.defineInstance(IProductService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.urlProtocol = "vscode";
        }
      }());
      reg.defineInstance(IChatSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeItemsProviders = Event.None;
          this.onDidChangeSessionItems = Event.None;
          this.onDidChangeAvailability = Event.None;
          this.onDidChangeInProgress = Event.None;
        }
        async resolveChatSessionItem() {
          return void 0;
        }
      }());
      reg.defineInstance(IVoicePlaybackService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.speakingSession = observableValue("speakingSession", void 0);
          this.lastPlayedVersion = observableValue("lastPlayedVersion", 0);
          this.pendingResponseVersion = observableValue("pendingResponseVersion", 0);
        }
        hasPendingResponse() {
          return false;
        }
        hasLastPlayed() {
          return false;
        }
        getLastPlayed() {
          return void 0;
        }
      }());
    }
  });
  const configService = instantiationService.get(IConfigurationService);
  configService.setUserConfiguration("editor", { fontFamily: "monospace" });
  const markdownRendererService = instantiationService.get(IMarkdownRendererService);
  markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
  const renderer = disposableStore.add(
    instantiationService.createInstance(AgentSessionRenderer, rendererOptions, approvalModel ?? void 0, observableValue("activeSessionResource", void 0))
  );
  container.style.width = "350px";
  container.style.height = "auto";
  container.style.backgroundColor = "var(--vscode-sideBar-background)";
  container.classList.add("agent-sessions-viewer");
  const listRow = document.createElement("div");
  listRow.classList.add("monaco-list-row");
  listRow.style.position = "relative";
  container.appendChild(listRow);
  const template = renderer.renderTemplate(listRow);
  const treeNode = wrapAsTreeNode(session);
  renderer.renderElement(treeNode, 0, template);
  disposableStore.add(toDisposable(() => {
    renderer.disposeElement(treeNode, 0, template);
    renderer.disposeTemplate(template);
  }));
}
function renderSectionItem(ctx, section) {
  const { container, disposableStore } = ctx;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
    }
  });
  const renderer = instantiationService.createInstance(AgentSessionSectionRenderer, {});
  container.style.width = "350px";
  container.style.height = "auto";
  container.style.backgroundColor = "var(--vscode-sideBar-background)";
  container.classList.add("agent-sessions-viewer");
  const listRow = document.createElement("div");
  listRow.classList.add("monaco-list-row");
  listRow.style.position = "relative";
  container.appendChild(listRow);
  const template = renderer.renderTemplate(listRow);
  const treeNode = wrapAsTreeNode(section);
  renderer.renderElement(treeNode, 0, template);
  disposableStore.add(toDisposable(() => {
    renderer.disposeElement(treeNode, 0, template);
    renderer.disposeTemplate(template);
  }));
}
var agentSessionsViewer_fixture_default = defineThemedFixtureGroup({
  // --- Status variants ---
  CompletedRead: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Refactor auth middleware",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 2 * 60 * 60 * 1e3,
          lastRequestStarted: now - 2 * 60 * 60 * 1e3,
          lastRequestEnded: now - 2 * 60 * 60 * 1e3 + 45 * 1e3
        }
      }));
    }
  }),
  CompletedUnread: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Add unit tests for parser",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        isRead: () => false,
        timing: {
          created: now - 30 * 60 * 1e3,
          lastRequestStarted: now - 30 * 60 * 1e3,
          lastRequestEnded: now - 25 * 60 * 1e3
        }
      }));
    }
  }),
  InProgress: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Implement dark mode toggle",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 5 * 60 * 1e3,
          lastRequestStarted: now - 2 * 60 * 1e3,
          lastRequestEnded: void 0
        }
      }));
    }
  }),
  NeedsInput: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Fix CI pipeline configuration",
        status: AgentSessionStatus.NeedsInput,
        providerType: AgentSessionProviders.Local,
        isRead: () => false,
        timing: {
          created: now - 10 * 60 * 1e3,
          lastRequestStarted: now - 8 * 60 * 1e3,
          lastRequestEnded: void 0
        }
      }));
    }
  }),
  FailedWithDuration: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Deploy staging environment",
        status: AgentSessionStatus.Failed,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 60 * 60 * 1e3,
          lastRequestStarted: now - 60 * 60 * 1e3,
          lastRequestEnded: now - 60 * 60 * 1e3 + 3 * 60 * 1e3
        }
      }));
    }
  }),
  FailedWithoutDuration: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Migrate database schema",
        status: AgentSessionStatus.Failed,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 3 * 60 * 60 * 1e3,
          lastRequestStarted: void 0,
          lastRequestEnded: void 0
        }
      }));
    }
  }),
  // --- Content variants ---
  WithDiffChanges: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Refactor settings page",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        changes: { files: 5, insertions: 142, deletions: 87 },
        timing: {
          created: now - 45 * 60 * 1e3,
          lastRequestStarted: now - 45 * 60 * 1e3,
          lastRequestEnded: now - 40 * 60 * 1e3
        }
      }));
    }
  }),
  WithFileChangesList: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Update API endpoints",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Background,
        icon: Codicon.worktree,
        changes: [
          { modifiedUri: URI.file("/src/api/routes.ts"), insertions: 25, deletions: 10 },
          { modifiedUri: URI.file("/src/api/handlers.ts"), insertions: 50, deletions: 30 },
          { modifiedUri: URI.file("/tests/api.test.ts"), insertions: 40, deletions: 5 }
        ],
        timing: {
          created: now - 2 * 60 * 60 * 1e3,
          lastRequestStarted: now - 2 * 60 * 60 * 1e3,
          lastRequestEnded: now - 90 * 60 * 1e3
        }
      }));
    }
  }),
  WithBadge: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Optimize build pipeline",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        badge: "PR #1234",
        timing: {
          created: now - 4 * 60 * 60 * 1e3,
          lastRequestStarted: now - 4 * 60 * 60 * 1e3,
          lastRequestEnded: now - 3.5 * 60 * 60 * 1e3
        }
      }));
    }
  }),
  WithMarkdownBadge: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Review security patches",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Cloud,
        icon: Codicon.cloud,
        badge: new MarkdownString("$(shield) Secure"),
        timing: {
          created: now - 6 * 60 * 60 * 1e3,
          lastRequestStarted: now - 6 * 60 * 60 * 1e3,
          lastRequestEnded: now - 5.5 * 60 * 60 * 1e3
        }
      }));
    }
  }),
  WithDescription: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Upgrade dependencies",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        description: "Updated 12 packages to latest versions",
        timing: {
          created: now - 24 * 60 * 60 * 1e3,
          lastRequestStarted: now - 24 * 60 * 60 * 1e3,
          lastRequestEnded: now - 23.5 * 60 * 60 * 1e3
        }
      }));
    }
  }),
  WithMarkdownDescription: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Fix accessibility issues",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        description: new MarkdownString("$(check) All WCAG checks passed"),
        timing: {
          created: now - 48 * 60 * 60 * 1e3,
          lastRequestStarted: now - 48 * 60 * 60 * 1e3,
          lastRequestEnded: now - 47 * 60 * 60 * 1e3
        }
      }));
    }
  }),
  WithBadgeAndDiff: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Implement search feature",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        badge: "draft",
        changes: { files: 8, insertions: 320, deletions: 45 },
        timing: {
          created: now - 3 * 60 * 60 * 1e3,
          lastRequestStarted: now - 3 * 60 * 60 * 1e3,
          lastRequestEnded: now - 2.5 * 60 * 60 * 1e3
        }
      }));
    }
  }),
  // --- State variants ---
  Archived: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Old migration script",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        isArchived: () => true,
        timing: {
          created: now - 7 * 24 * 60 * 60 * 1e3,
          lastRequestStarted: now - 7 * 24 * 60 * 60 * 1e3,
          lastRequestEnded: now - 7 * 24 * 60 * 60 * 1e3 + 10 * 60 * 1e3
        }
      }));
    }
  }),
  ArchivedUnread: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Archived unread task",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Local,
        isArchived: () => true,
        isRead: () => false,
        timing: {
          created: now - 5 * 24 * 60 * 60 * 1e3,
          lastRequestStarted: now - 5 * 24 * 60 * 60 * 1e3,
          lastRequestEnded: now - 5 * 24 * 60 * 60 * 1e3 + 5 * 60 * 1e3
        }
      }));
    }
  }),
  // --- Provider-type variants ---
  CloudProvider: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Generate API documentation",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Cloud,
        icon: Codicon.cloud,
        timing: {
          created: now - 90 * 60 * 1e3,
          lastRequestStarted: now - 90 * 60 * 1e3,
          lastRequestEnded: now - 80 * 60 * 1e3
        }
      }));
    }
  }),
  BackgroundProvider: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Run linter across codebase",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.Background,
        icon: Codicon.worktree,
        timing: {
          created: now - 120 * 60 * 1e3,
          lastRequestStarted: now - 120 * 60 * 1e3,
          lastRequestEnded: now - 110 * 60 * 1e3
        }
      }));
    }
  }),
  ClaudeProvider: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Analyze code complexity",
        status: AgentSessionStatus.Completed,
        providerType: AgentSessionProviders.AgentHostClaude,
        icon: Codicon.claude,
        timing: {
          created: now - 150 * 60 * 1e3,
          lastRequestStarted: now - 150 * 60 * 1e3,
          lastRequestEnded: now - 140 * 60 * 1e3
        }
      }));
    }
  }),
  CloudProviderInProgress: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Build integration tests",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Cloud,
        icon: Codicon.cloud,
        isRead: () => false,
        timing: {
          created: now - 10 * 60 * 1e3,
          lastRequestStarted: now - 3 * 60 * 1e3,
          lastRequestEnded: void 0
        }
      }));
    }
  }),
  // --- In-progress with description override ---
  InProgressWithDescription: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      renderSessionItem(ctx, createMockSession({
        label: "Scaffold new microservice",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Background,
        icon: Codicon.worktree,
        description: "Installing dependencies...",
        timing: {
          created: now - 5 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }));
    }
  }),
  // --- Section headers ---
  SectionToday: defineComponentFixture({
    render: (ctx) => renderSectionItem(ctx, {
      section: AgentSessionSection.Today,
      label: "Today",
      sessions: []
    })
  }),
  SectionYesterday: defineComponentFixture({
    render: (ctx) => renderSectionItem(ctx, {
      section: AgentSessionSection.Yesterday,
      label: "Yesterday",
      sessions: []
    })
  }),
  SectionLastWeek: defineComponentFixture({
    render: (ctx) => renderSectionItem(ctx, {
      section: AgentSessionSection.Week,
      label: "Last 7 days",
      sessions: []
    })
  }),
  SectionOlder: defineComponentFixture({
    render: (ctx) => renderSectionItem(ctx, {
      section: AgentSessionSection.Older,
      label: "Older",
      sessions: []
    })
  }),
  SectionArchived: defineComponentFixture({
    render: (ctx) => renderSectionItem(ctx, {
      section: AgentSessionSection.Archived,
      label: "Archived",
      sessions: []
    })
  }),
  SectionMore: defineComponentFixture({
    render: (ctx) => renderSectionItem(ctx, {
      section: AgentSessionSection.More,
      label: "More",
      sessions: []
    })
  }),
  // --- Approval row variants ---
  ApprovalRowJson: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-json");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Other,
        label: '{ "action": "deleteFile", "path": "/src/old-module.ts" }',
        languageId: "json",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Clean up deprecated modules",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 5 * 60 * 1e3,
          lastRequestStarted: now - 2 * 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRowBash: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-bash");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "npm install --save express@latest",
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Update server dependencies",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 3 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRowPowerShell: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-powershell");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "Start-Job -ScriptBlock { Set-Location 'c:\\some\\path'; npm install } | Out-Null",
        languageId: "pwsh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Clean up old log files",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 4 * 60 * 1e3,
          lastRequestStarted: now - 2 * 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRowLongLabel: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-long");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "rm -rf node_modules && npm cache clean --force && npm install --legacy-peer-deps --ignore-scripts",
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Reset and reinstall all dependencies",
        status: AgentSessionStatus.NeedsInput,
        providerType: AgentSessionProviders.Cloud,
        icon: Codicon.cloud,
        isRead: () => false,
        timing: {
          created: now - 10 * 60 * 1e3,
          lastRequestStarted: now - 5 * 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRow1Line: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-1line");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "npm install --save express@latest",
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Install express",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 3 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRow2Lines: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-2lines");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "cd /workspace/project\nnpm install",
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Setup project dependencies",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 3 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRow3Lines: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-3lines");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "cd /workspace/project\nnpm install\nnpm run build",
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Build the project",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 2 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRow4Lines: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-4lines");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: "cd /workspace/project\nnpm install\nnpm run build\nnpm run test -- --coverage",
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Build and test project",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 2 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  }),
  ApprovalRow3LongLines: defineComponentFixture({
    render: (ctx) => {
      const now = Date.now();
      const resource = URI.parse("vscode-chat-session://local/approval-3longlines");
      const approvalModel = createMockApprovalModel(resource, {
        approvalId: resource.toString(),
        kind: AgentSessionApprovalKind.Terminal,
        label: 'RUSTFLAGS="-C target-cpu=native -C opt-level=3" cargo build --release --target x86_64-unknown-linux-gnu\nfind ./target/release -name "*.so" -exec strip --strip-unneeded {} \\; && tar czf release-bundle.tar.gz -C target/release .\ncurl -X POST https://deploy.internal.example.com/api/v2/artifacts/upload --header "Authorization: Bearer $DEPLOY_TOKEN" --form "bundle=@release-bundle.tar.gz"',
        languageId: "sh",
        since: /* @__PURE__ */ new Date(),
        confirm: () => {
        }
      });
      renderSessionItem(ctx, createMockSession({
        resource,
        label: "Build and deploy native release",
        status: AgentSessionStatus.InProgress,
        providerType: AgentSessionProviders.Local,
        timing: {
          created: now - 2 * 60 * 1e3,
          lastRequestStarted: now - 60 * 1e3,
          lastRequestEnded: void 0
        }
      }), approvalModel);
    }
  })
});
export {
  agentSessionsViewer_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcYWdlbnRTZXNzaW9uc1ZpZXdlci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L21hcmtkb3duUmVuZGVyZXIvYnJvd3Nlci9lZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblJlbmRlcmVyLCBBZ2VudFNlc3Npb25TZWN0aW9uUmVuZGVyZXIsIElBZ2VudFNlc3Npb25SZW5kZXJlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi92b2ljZVBsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TdGF0dXMsIElBZ2VudFNlc3Npb24sIEFnZW50U2Vzc2lvblNlY3Rpb24sIElBZ2VudFNlc3Npb25TZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZCwgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCwgSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcblxuaW1wb3J0ICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL21lZGlhL2FnZW50c2Vzc2lvbnN2aWV3ZXIuY3NzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTW9jayBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tTZXNzaW9uKG92ZXJyaWRlczogUGFydGlhbDxJQWdlbnRTZXNzaW9uPiAmIHsgbGFiZWw6IHN0cmluZzsgc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXM7IHByb3ZpZGVyVHlwZTogc3RyaW5nIH0pOiBJQWdlbnRTZXNzaW9uIHtcblx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbj4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBvdmVycmlkZXMucmVzb3VyY2UgPz8gVVJJLnBhcnNlKGB2c2NvZGUtY2hhdC1zZXNzaW9uOi8vJHtvdmVycmlkZXMucHJvdmlkZXJUeXBlfS9zZXNzaW9uLSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFiZWwgPSBvdmVycmlkZXMubGFiZWw7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdHVzID0gb3ZlcnJpZGVzLnN0YXR1cztcblx0XHRvdmVycmlkZSByZWFkb25seSBwcm92aWRlclR5cGUgPSBvdmVycmlkZXMucHJvdmlkZXJUeXBlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVyTGFiZWwgPSBvdmVycmlkZXMucHJvdmlkZXJMYWJlbCA/PyBvdmVycmlkZXMucHJvdmlkZXJUeXBlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGljb24gPSBvdmVycmlkZXMuaWNvbiA/PyBDb2RpY29uLnZtO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGJhZGdlID0gb3ZlcnJpZGVzLmJhZGdlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gb3ZlcnJpZGVzLmRlc2NyaXB0aW9uO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRvb2x0aXAgPSBvdmVycmlkZXMudG9vbHRpcDtcblx0XHRvdmVycmlkZSByZWFkb25seSBjaGFuZ2VzID0gb3ZlcnJpZGVzLmNoYW5nZXM7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGltaW5nID0gb3ZlcnJpZGVzLnRpbWluZyA/PyB7XG5cdFx0XHRjcmVhdGVkOiBub3cgLSA2MCAqIDYwICogMTAwMCxcblx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLFxuXHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0b3ZlcnJpZGUgaXNBcmNoaXZlZCgpOiBib29sZWFuIHsgcmV0dXJuIG92ZXJyaWRlcy5pc0FyY2hpdmVkPy4oKSA/PyBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIHNldEFyY2hpdmVkKCk6IHZvaWQgeyB9XG5cdFx0b3ZlcnJpZGUgaXNQaW5uZWQoKTogYm9vbGVhbiB7IHJldHVybiBvdmVycmlkZXMuaXNQaW5uZWQ/LigpID8/IGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgc2V0UGlubmVkKCk6IHZvaWQgeyB9XG5cdFx0b3ZlcnJpZGUgaXNSZWFkKCk6IGJvb2xlYW4geyByZXR1cm4gb3ZlcnJpZGVzLmlzUmVhZD8uKCkgPz8gdHJ1ZTsgfVxuXHRcdG92ZXJyaWRlIGlzTWFya2VkVW5yZWFkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRvdmVycmlkZSBzZXRSZWFkKCk6IHZvaWQgeyB9XG5cdH0oKTtcbn1cblxuZnVuY3Rpb24gd3JhcEFzVHJlZU5vZGU8VD4oZWxlbWVudDogVCk6IElUcmVlTm9kZTxULCBGdXp6eVNjb3JlPiB7XG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudCxcblx0XHRjaGlsZHJlbjogW10sXG5cdFx0ZGVwdGg6IDAsXG5cdFx0dmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsXG5cdFx0dmlzaWJsZUNoaWxkSW5kZXg6IDAsXG5cdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0dmlzaWJsZTogdHJ1ZSxcblx0XHRmaWx0ZXJEYXRhOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmNvbnN0IHJlbmRlcmVyT3B0aW9uczogSUFnZW50U2Vzc2lvblJlbmRlcmVyT3B0aW9ucyA9IHtcblx0ZGlzYWJsZUhvdmVyOiB0cnVlLFxuXHRnZXRIb3ZlclBvc2l0aW9uOiAoKSA9PiBIb3ZlclBvc2l0aW9uLkJFTE9XLFxufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyIGhlbHBlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0FwcHJvdmFsTW9kZWwoc2Vzc2lvblJlc291cmNlOiBVUkksIGluZm86IElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8pOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIHtcblx0Y29uc3Qgb2JzID0gb2JzZXJ2YWJsZVZhbHVlPElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ+KCdtb2NrQXBwcm92YWwnLCBpbmZvKTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8QWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbD4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0QXBwcm92YWwocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0aWYgKHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybiBvYnM7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZVZhbHVlPElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ+KCdtb2NrQXBwcm92YWwuZW1wdHknLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJTZXNzaW9uSXRlbShjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBzZXNzaW9uOiBJQWdlbnRTZXNzaW9uLCBhcHByb3ZhbE1vZGVsPzogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH0gPSBjdHg7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lKElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9kdWN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB1cmxQcm90b2NvbCA9ICd2c2NvZGUnO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25JdGVtcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VJblByb2dyZXNzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVm9pY2VQbGF5YmFja1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlUGxheWJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3BlYWtpbmdTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ3NwZWFraW5nU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RQbGF5ZWRWZXJzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4oJ2xhc3RQbGF5ZWRWZXJzaW9uJywgMCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHBlbmRpbmdSZXNwb25zZVZlcnNpb24gPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPigncGVuZGluZ1Jlc3BvbnNlVmVyc2lvbicsIDApO1xuXHRcdFx0XHRvdmVycmlkZSBoYXNQZW5kaW5nUmVzcG9uc2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRvdmVycmlkZSBoYXNMYXN0UGxheWVkKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0TGFzdFBsYXllZCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdlZGl0b3InLCB7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnIH0pO1xuXHRjb25zdCBtYXJrZG93blJlbmRlcmVyU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpO1xuXHRtYXJrZG93blJlbmRlcmVyU2VydmljZS5zZXREZWZhdWx0Q29kZUJsb2NrUmVuZGVyZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlcikpO1xuXG5cdGNvbnN0IHJlbmRlcmVyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25SZW5kZXJlciwgcmVuZGVyZXJPcHRpb25zLCBhcHByb3ZhbE1vZGVsID8/IHVuZGVmaW5lZCwgb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIHVuZGVmaW5lZCkpXG5cdCk7XG5cblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzM1MHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICdhdXRvJztcblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtc2lkZUJhci1iYWNrZ3JvdW5kKSc7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9ucy12aWV3ZXInKTtcblxuXHRjb25zdCBsaXN0Um93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGxpc3RSb3cuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLWxpc3Qtcm93Jyk7XG5cdGxpc3RSb3cuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQobGlzdFJvdyk7XG5cblx0Y29uc3QgdGVtcGxhdGUgPSByZW5kZXJlci5yZW5kZXJUZW1wbGF0ZShsaXN0Um93KTtcblx0Y29uc3QgdHJlZU5vZGUgPSB3cmFwQXNUcmVlTm9kZShzZXNzaW9uKTtcblx0cmVuZGVyZXIucmVuZGVyRWxlbWVudCh0cmVlTm9kZSwgMCwgdGVtcGxhdGUpO1xuXHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0cmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQodHJlZU5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRyZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGUpO1xuXHR9KSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclNlY3Rpb25JdGVtKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHNlY3Rpb246IElBZ2VudFNlc3Npb25TZWN0aW9uKTogdm9pZCB7XG5cdGNvbnN0IHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUgfSA9IGN0eDtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCByZW5kZXJlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvblNlY3Rpb25SZW5kZXJlciwge30pO1xuXG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICczNTBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndmFyKC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZCknO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc2Vzc2lvbnMtdmlld2VyJyk7XG5cblx0Y29uc3QgbGlzdFJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRsaXN0Um93LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1saXN0LXJvdycpO1xuXHRsaXN0Um93LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGxpc3RSb3cpO1xuXG5cdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUobGlzdFJvdyk7XG5cdGNvbnN0IHRyZWVOb2RlID0gd3JhcEFzVHJlZU5vZGUoc2VjdGlvbik7XG5cdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQodHJlZU5vZGUsIDAsIHRlbXBsYXRlKTtcblx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50KHRyZWVOb2RlLCAwLCB0ZW1wbGF0ZSk7XG5cdFx0cmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlKTtcblx0fSkpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaXh0dXJlc1xuLy9cbi8vIEVhY2ggZml4dHVyZSBjb21wdXRlcyBgbm93YCBpbnNpZGUgaXRzIHJlbmRlciBmdW5jdGlvbiBzbyB0aGF0IHRpbWVzdGFtcHNcbi8vIGFuY2hvciB0byB0aGUgdmlydHVhbCBjbG9jayBhdCByZW5kZXIgdGltZSwgbm90IG1vZHVsZS1sb2FkIHRpbWUuIFdpdGhvdXRcbi8vIHRoaXMsIHJlYWwgdGltZSBrZWVwcyBhZHZhbmNpbmcgYmV0d2VlbiBtb2R1bGUgbG9hZCBhbmQgcmVuZGVyLCBtYWtpbmdcbi8vIHJlbGF0aXZlIGxhYmVscyBsaWtlIFwiMzAgbWluIGFnb1wiIC8gXCIzMSBtaW4gYWdvXCIgZmxha2UgZnJvbSBvbmUgcnVuIHRvIHRoZVxuLy8gbmV4dC5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHtcblxuXHQvLyAtLS0gU3RhdHVzIHZhcmlhbnRzIC0tLVxuXG5cdENvbXBsZXRlZFJlYWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ1JlZmFjdG9yIGF1dGggbWlkZGxld2FyZScsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDIgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDIgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSAyICogNjAgKiA2MCAqIDEwMDAgKyA0NSAqIDEwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0Q29tcGxldGVkVW5yZWFkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0bGFiZWw6ICdBZGQgdW5pdCB0ZXN0cyBmb3IgcGFyc2VyJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0aXNSZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogbm93IC0gMzAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSAzMCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSAyNSAqIDYwICogMTAwMCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9LFxuXHR9KSxcblxuXHRJblByb2dyZXNzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0bGFiZWw6ICdJbXBsZW1lbnQgZGFyayBtb2RlIHRvZ2dsZScsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSA1ICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gMiAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0TmVlZHNJbnB1dDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnRml4IENJIHBpcGVsaW5lIGNvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0aXNSZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogbm93IC0gMTAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA4ICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9LFxuXHR9KSxcblxuXHRGYWlsZWRXaXRoRHVyYXRpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ0RlcGxveSBzdGFnaW5nIGVudmlyb25tZW50Jyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuRmFpbGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogbm93IC0gNjAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSA2MCAqIDYwICogMTAwMCArIDMgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0RmFpbGVkV2l0aG91dER1cmF0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0bGFiZWw6ICdNaWdyYXRlIGRhdGFiYXNlIHNjaGVtYScsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZCxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDMgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0Ly8gLS0tIENvbnRlbnQgdmFyaWFudHMgLS0tXG5cblx0V2l0aERpZmZDaGFuZ2VzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0bGFiZWw6ICdSZWZhY3RvciBzZXR0aW5ncyBwYWdlJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0Y2hhbmdlczogeyBmaWxlczogNSwgaW5zZXJ0aW9uczogMTQyLCBkZWxldGlvbnM6IDg3IH0sXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDQ1ICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gNDUgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogbm93IC0gNDAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0V2l0aEZpbGVDaGFuZ2VzTGlzdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnVXBkYXRlIEFQSSBlbmRwb2ludHMnLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsXG5cdFx0XHRcdGljb246IENvZGljb24ud29ya3RyZWUsXG5cdFx0XHRcdGNoYW5nZXM6IFtcblx0XHRcdFx0XHR7IG1vZGlmaWVkVXJpOiBVUkkuZmlsZSgnL3NyYy9hcGkvcm91dGVzLnRzJyksIGluc2VydGlvbnM6IDI1LCBkZWxldGlvbnM6IDEwIH0sXG5cdFx0XHRcdFx0eyBtb2RpZmllZFVyaTogVVJJLmZpbGUoJy9zcmMvYXBpL2hhbmRsZXJzLnRzJyksIGluc2VydGlvbnM6IDUwLCBkZWxldGlvbnM6IDMwIH0sXG5cdFx0XHRcdFx0eyBtb2RpZmllZFVyaTogVVJJLmZpbGUoJy90ZXN0cy9hcGkudGVzdC50cycpLCBpbnNlcnRpb25zOiA0MCwgZGVsZXRpb25zOiA1IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDIgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDIgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSA5MCAqIDYwICogMTAwMCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9LFxuXHR9KSxcblxuXHRXaXRoQmFkZ2U6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ09wdGltaXplIGJ1aWxkIHBpcGVsaW5lJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0YmFkZ2U6ICdQUiAjMTIzNCcsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDQgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDQgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSAzLjUgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9LFxuXHR9KSxcblxuXHRXaXRoTWFya2Rvd25CYWRnZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnUmV2aWV3IHNlY3VyaXR5IHBhdGNoZXMnLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3VkLFxuXHRcdFx0XHRiYWRnZTogbmV3IE1hcmtkb3duU3RyaW5nKCckKHNoaWVsZCkgU2VjdXJlJyksXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDYgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDYgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSA1LjUgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9LFxuXHR9KSxcblxuXHRXaXRoRGVzY3JpcHRpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ1VwZ3JhZGUgZGVwZW5kZW5jaWVzJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdVcGRhdGVkIDEyIHBhY2thZ2VzIHRvIGxhdGVzdCB2ZXJzaW9ucycsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDI0ICogNjAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSAyNCAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyAtIDIzLjUgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9LFxuXHR9KSxcblxuXHRXaXRoTWFya2Rvd25EZXNjcmlwdGlvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnRml4IGFjY2Vzc2liaWxpdHkgaXNzdWVzJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5ldyBNYXJrZG93blN0cmluZygnJChjaGVjaykgQWxsIFdDQUcgY2hlY2tzIHBhc3NlZCcpLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSA0OCAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gNDggKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSA0NyAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdFdpdGhCYWRnZUFuZERpZmY6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ0ltcGxlbWVudCBzZWFyY2ggZmVhdHVyZScsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdGJhZGdlOiAnZHJhZnQnLFxuXHRcdFx0XHRjaGFuZ2VzOiB7IGZpbGVzOiA4LCBpbnNlcnRpb25zOiAzMjAsIGRlbGV0aW9uczogNDUgfSxcblx0XHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogbm93IC0gMyAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gMyAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyAtIDIuNSAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdC8vIC0tLSBTdGF0ZSB2YXJpYW50cyAtLS1cblxuXHRBcmNoaXZlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnT2xkIG1pZ3JhdGlvbiBzY3JpcHQnLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSA3ICogMjQgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDcgKiAyNCAqIDYwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyAtIDcgKiAyNCAqIDYwICogNjAgKiAxMDAwICsgMTAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0QXJjaGl2ZWRVbnJlYWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ0FyY2hpdmVkIHVucmVhZCB0YXNrJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0aXNSZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogbm93IC0gNSAqIDI0ICogNjAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA1ICogMjQgKiA2MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSA1ICogMjQgKiA2MCAqIDYwICogMTAwMCArIDUgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0Ly8gLS0tIFByb3ZpZGVyLXR5cGUgdmFyaWFudHMgLS0tXG5cblx0Q2xvdWRQcm92aWRlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnR2VuZXJhdGUgQVBJIGRvY3VtZW50YXRpb24nLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3VkLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSA5MCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDkwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyAtIDgwICogNjAgKiAxMDAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdEJhY2tncm91bmRQcm92aWRlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGxhYmVsOiAnUnVuIGxpbnRlciBhY3Jvc3MgY29kZWJhc2UnLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsXG5cdFx0XHRcdGljb246IENvZGljb24ud29ya3RyZWUsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDEyMCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDEyMCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBub3cgLSAxMTAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0Q2xhdWRlUHJvdmlkZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ0FuYWx5emUgY29kZSBjb21wbGV4aXR5Jyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUsXG5cdFx0XHRcdGljb246IENvZGljb24uY2xhdWRlLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSAxNTAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSAxNTAgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogbm93IC0gMTQwICogNjAgKiAxMDAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdENsb3VkUHJvdmlkZXJJblByb2dyZXNzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0bGFiZWw6ICdCdWlsZCBpbnRlZ3JhdGlvbiB0ZXN0cycsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3VkLFxuXHRcdFx0XHRpc1JlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSAxMCAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDMgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdC8vIC0tLSBJbi1wcm9ncmVzcyB3aXRoIGRlc2NyaXB0aW9uIG92ZXJyaWRlIC0tLVxuXG5cdEluUHJvZ3Jlc3NXaXRoRGVzY3JpcHRpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRsYWJlbDogJ1NjYWZmb2xkIG5ldyBtaWNyb3NlcnZpY2UnLFxuXHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLndvcmt0cmVlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0luc3RhbGxpbmcgZGVwZW5kZW5jaWVzLi4uJyxcblx0XHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogbm93IC0gNSAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdyAtIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSksXG5cblx0Ly8gLS0tIFNlY3Rpb24gaGVhZGVycyAtLS1cblxuXHRTZWN0aW9uVG9kYXk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyU2VjdGlvbkl0ZW0oY3R4LCB7XG5cdFx0XHRzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5LFxuXHRcdFx0bGFiZWw6ICdUb2RheScsXG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0fSksXG5cdH0pLFxuXG5cdFNlY3Rpb25ZZXN0ZXJkYXk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyU2VjdGlvbkl0ZW0oY3R4LCB7XG5cdFx0XHRzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLlllc3RlcmRheSxcblx0XHRcdGxhYmVsOiAnWWVzdGVyZGF5Jyxcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHR9KSxcblx0fSksXG5cblx0U2VjdGlvbkxhc3RXZWVrOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclNlY3Rpb25JdGVtKGN0eCwge1xuXHRcdFx0c2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5XZWVrLFxuXHRcdFx0bGFiZWw6ICdMYXN0IDcgZGF5cycsXG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0fSksXG5cdH0pLFxuXG5cdFNlY3Rpb25PbGRlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJTZWN0aW9uSXRlbShjdHgsIHtcblx0XHRcdHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIsXG5cdFx0XHRsYWJlbDogJ09sZGVyJyxcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHR9KSxcblx0fSksXG5cblx0U2VjdGlvbkFyY2hpdmVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclNlY3Rpb25JdGVtKGN0eCwge1xuXHRcdFx0c2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCxcblx0XHRcdGxhYmVsOiAnQXJjaGl2ZWQnLFxuXHRcdFx0c2Vzc2lvbnM6IFtdLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRTZWN0aW9uTW9yZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJTZWN0aW9uSXRlbShjdHgsIHtcblx0XHRcdHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZSxcblx0XHRcdGxhYmVsOiAnTW9yZScsXG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIC0tLSBBcHByb3ZhbCByb3cgdmFyaWFudHMgLS0tXG5cblx0QXBwcm92YWxSb3dKc29uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL2FwcHJvdmFsLWpzb24nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2NrQXBwcm92YWxNb2RlbChyZXNvdXJjZSwge1xuXHRcdFx0XHRhcHByb3ZhbElkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRraW5kOiBBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuT3RoZXIsXG5cdFx0XHRcdGxhYmVsOiAneyBcImFjdGlvblwiOiBcImRlbGV0ZUZpbGVcIiwgXCJwYXRoXCI6IFwiL3NyYy9vbGQtbW9kdWxlLnRzXCIgfScsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICdqc29uJyxcblx0XHRcdFx0c2luY2U6IG5ldyBEYXRlKCksXG5cdFx0XHRcdGNvbmZpcm06ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogJ0NsZWFuIHVwIGRlcHJlY2F0ZWQgbW9kdWxlcycsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSA1ICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gMiAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSwgYXBwcm92YWxNb2RlbCk7XG5cdFx0fSxcblx0fSksXG5cblx0QXBwcm92YWxSb3dCYXNoOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL2FwcHJvdmFsLWJhc2gnKTtcblx0XHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2NrQXBwcm92YWxNb2RlbChyZXNvdXJjZSwge1xuXHRcdFx0XHRhcHByb3ZhbElkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRraW5kOiBBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwsXG5cdFx0XHRcdGxhYmVsOiAnbnBtIGluc3RhbGwgLS1zYXZlIGV4cHJlc3NAbGF0ZXN0Jyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3NoJyxcblx0XHRcdFx0c2luY2U6IG5ldyBEYXRlKCksXG5cdFx0XHRcdGNvbmZpcm06ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogJ1VwZGF0ZSBzZXJ2ZXIgZGVwZW5kZW5jaWVzJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDMgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksIGFwcHJvdmFsTW9kZWwpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdEFwcHJvdmFsUm93UG93ZXJTaGVsbDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9hcHByb3ZhbC1wb3dlcnNoZWxsJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9ja0FwcHJvdmFsTW9kZWwocmVzb3VyY2UsIHtcblx0XHRcdFx0YXBwcm92YWxJZDogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0a2luZDogQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsLFxuXHRcdFx0XHRsYWJlbDogJ1N0YXJ0LUpvYiAtU2NyaXB0QmxvY2sgeyBTZXQtTG9jYXRpb24gXFwnYzpcXFxcc29tZVxcXFxwYXRoXFwnOyBucG0gaW5zdGFsbCB9IHwgT3V0LU51bGwnLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAncHdzaCcsXG5cdFx0XHRcdHNpbmNlOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6ICdDbGVhbiB1cCBvbGQgbG9nIGZpbGVzJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDQgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSAyICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pLCBhcHByb3ZhbE1vZGVsKTtcblx0XHR9LFxuXHR9KSxcblxuXHRBcHByb3ZhbFJvd0xvbmdMYWJlbDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9hcHByb3ZhbC1sb25nJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9ja0FwcHJvdmFsTW9kZWwocmVzb3VyY2UsIHtcblx0XHRcdFx0YXBwcm92YWxJZDogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0a2luZDogQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsLFxuXHRcdFx0XHRsYWJlbDogJ3JtIC1yZiBub2RlX21vZHVsZXMgJiYgbnBtIGNhY2hlIGNsZWFuIC0tZm9yY2UgJiYgbnBtIGluc3RhbGwgLS1sZWdhY3ktcGVlci1kZXBzIC0taWdub3JlLXNjcmlwdHMnLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAnc2gnLFxuXHRcdFx0XHRzaW5jZTogbmV3IERhdGUoKSxcblx0XHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiAnUmVzZXQgYW5kIHJlaW5zdGFsbCBhbGwgZGVwZW5kZW5jaWVzJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHRcdGljb246IENvZGljb24uY2xvdWQsXG5cdFx0XHRcdGlzUmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDEwICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gNSAqIDYwICogMTAwMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSwgYXBwcm92YWxNb2RlbCk7XG5cdFx0fSxcblx0fSksXG5cblx0QXBwcm92YWxSb3cxTGluZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9hcHByb3ZhbC0xbGluZScpO1xuXHRcdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vY2tBcHByb3ZhbE1vZGVsKHJlc291cmNlLCB7XG5cdFx0XHRcdGFwcHJvdmFsSWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGtpbmQ6IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCxcblx0XHRcdFx0bGFiZWw6ICducG0gaW5zdGFsbCAtLXNhdmUgZXhwcmVzc0BsYXRlc3QnLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAnc2gnLFxuXHRcdFx0XHRzaW5jZTogbmV3IERhdGUoKSxcblx0XHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiAnSW5zdGFsbCBleHByZXNzJyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDMgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksIGFwcHJvdmFsTW9kZWwpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdEFwcHJvdmFsUm93MkxpbmVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL2FwcHJvdmFsLTJsaW5lcycpO1xuXHRcdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vY2tBcHByb3ZhbE1vZGVsKHJlc291cmNlLCB7XG5cdFx0XHRcdGFwcHJvdmFsSWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGtpbmQ6IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCxcblx0XHRcdFx0bGFiZWw6ICdjZCAvd29ya3NwYWNlL3Byb2plY3RcXG5ucG0gaW5zdGFsbCcsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICdzaCcsXG5cdFx0XHRcdHNpbmNlOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6ICdTZXR1cCBwcm9qZWN0IGRlcGVuZGVuY2llcycsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSAzICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pLCBhcHByb3ZhbE1vZGVsKTtcblx0XHR9LFxuXHR9KSxcblxuXHRBcHByb3ZhbFJvdzNMaW5lczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9hcHByb3ZhbC0zbGluZXMnKTtcblx0XHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2NrQXBwcm92YWxNb2RlbChyZXNvdXJjZSwge1xuXHRcdFx0XHRhcHByb3ZhbElkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRraW5kOiBBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwsXG5cdFx0XHRcdGxhYmVsOiAnY2QgL3dvcmtzcGFjZS9wcm9qZWN0XFxubnBtIGluc3RhbGxcXG5ucG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3NoJyxcblx0XHRcdFx0c2luY2U6IG5ldyBEYXRlKCksXG5cdFx0XHRcdGNvbmZpcm06ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVuZGVyU2Vzc2lvbkl0ZW0oY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogJ0J1aWxkIHRoZSBwcm9qZWN0Jyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDIgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksIGFwcHJvdmFsTW9kZWwpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdEFwcHJvdmFsUm93NExpbmVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL2FwcHJvdmFsLTRsaW5lcycpO1xuXHRcdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vY2tBcHByb3ZhbE1vZGVsKHJlc291cmNlLCB7XG5cdFx0XHRcdGFwcHJvdmFsSWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGtpbmQ6IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCxcblx0XHRcdFx0bGFiZWw6ICdjZCAvd29ya3NwYWNlL3Byb2plY3RcXG5ucG0gaW5zdGFsbFxcbm5wbSBydW4gYnVpbGRcXG5ucG0gcnVuIHRlc3QgLS0gLS1jb3ZlcmFnZScsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICdzaCcsXG5cdFx0XHRcdHNpbmNlOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdHJlbmRlclNlc3Npb25JdGVtKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6ICdCdWlsZCBhbmQgdGVzdCBwcm9qZWN0Jyxcblx0XHRcdFx0c3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5vdyAtIDIgKiA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBub3cgLSA2MCAqIDEwMDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksIGFwcHJvdmFsTW9kZWwpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdEFwcHJvdmFsUm93M0xvbmdMaW5lczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9hcHByb3ZhbC0zbG9uZ2xpbmVzJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9ja0FwcHJvdmFsTW9kZWwocmVzb3VyY2UsIHtcblx0XHRcdFx0YXBwcm92YWxJZDogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0a2luZDogQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsLFxuXHRcdFx0XHRsYWJlbDogJ1JVU1RGTEFHUz1cIi1DIHRhcmdldC1jcHU9bmF0aXZlIC1DIG9wdC1sZXZlbD0zXCIgY2FyZ28gYnVpbGQgLS1yZWxlYXNlIC0tdGFyZ2V0IHg4Nl82NC11bmtub3duLWxpbnV4LWdudVxcbmZpbmQgLi90YXJnZXQvcmVsZWFzZSAtbmFtZSBcIiouc29cIiAtZXhlYyBzdHJpcCAtLXN0cmlwLXVubmVlZGVkIHt9IFxcXFw7ICYmIHRhciBjemYgcmVsZWFzZS1idW5kbGUudGFyLmd6IC1DIHRhcmdldC9yZWxlYXNlIC5cXG5jdXJsIC1YIFBPU1QgaHR0cHM6Ly9kZXBsb3kuaW50ZXJuYWwuZXhhbXBsZS5jb20vYXBpL3YyL2FydGlmYWN0cy91cGxvYWQgLS1oZWFkZXIgXCJBdXRob3JpemF0aW9uOiBCZWFyZXIgJERFUExPWV9UT0tFTlwiIC0tZm9ybSBcImJ1bmRsZT1AcmVsZWFzZS1idW5kbGUudGFyLmd6XCInLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAnc2gnLFxuXHRcdFx0XHRzaW5jZTogbmV3IERhdGUoKSxcblx0XHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZW5kZXJTZXNzaW9uSXRlbShjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiAnQnVpbGQgYW5kIGRlcGxveSBuYXRpdmUgcmVsZWFzZScsXG5cdFx0XHRcdHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBub3cgLSAyICogNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93IC0gNjAgKiAxMDAwLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pLCBhcHByb3ZhbE1vZGVsKTtcblx0XHR9LFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVk7QUFHckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHNCQUFzQixtQ0FBaUU7QUFDaEcsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBbUMsMkJBQWlEO0FBQzdGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQXNGO0FBQy9GLFNBQVMscUJBQXFCO0FBQzlCLFNBQWtDLHNCQUFzQix3QkFBd0IsMEJBQTBCLGlDQUFpQztBQUUzSSxPQUFPO0FBTVAsU0FBUyxrQkFBa0IsV0FBd0g7QUFDbEosUUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixTQUFPLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsSUFBcEM7QUFBQTtBQUNW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
