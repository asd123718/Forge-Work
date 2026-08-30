import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { themeColorFromId } from "../../../../../base/common/themables.js";
import { Event } from "../../../../../base/common/event.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { EditorMarkdownCodeBlockRenderer } from "../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
import { SessionStatus } from "../../../../../sessions/services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../../sessions/services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../../sessions/services/sessions/browser/sessionsService.js";
import { ISessionsListModelService } from "../../../../../sessions/services/sessions/browser/sessionsListModelService.js";
import { ISessionsProvidersService } from "../../../../../sessions/services/sessions/browser/sessionsProvidersService.js";
import { BlockedSessionsList, registerBlockedSessionsItemActions } from "../../../../../sessions/contrib/sessions/browser/blockedSessionsList.js";
import { registerBlockedSessionsHeaderActions, registerBlockedSessionsHeaderCommands } from "../../../../../sessions/contrib/sessions/browser/sessionsTitleBarWidget.js";
import { IVoicePlaybackService } from "../../../../contrib/chat/common/voicePlaybackService.js";
import { IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionApprovalKind } from "../../../../contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import "../../../../../sessions/contrib/sessions/browser/media/sessionsList.css";
function createMockWorkspace(label, branchName, pullRequest) {
  const root = URI.file(`/home/user/projects/${label}`);
  const gitHubInfo = pullRequest ? { owner: "microsoft", repo: label, pullRequest } : void 0;
  const gitRepository = {
    uri: root,
    workTreeUri: void 0,
    branchName,
    baseBranchName: "main",
    hasGitHubRemote: true,
    gitHubInfo: constObservable(gitHubInfo)
  };
  const folder = {
    root,
    workingDirectory: root,
    name: label,
    description: void 0,
    gitRepository
  };
  return {
    uri: root,
    label,
    icon: Codicon.folder,
    folders: [folder],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
}
function createMockChangesSummary(files, additions, deletions) {
  return { files, additions, deletions };
}
function createBlockedSession(options, approvals) {
  const updatedAt = new Date(Date.now() - options.minutesAgo * 60 * 1e3);
  const description = options.description ? new MarkdownString(options.description) : void 0;
  let chats = [];
  if (options.approvalCommand !== void 0 && approvals) {
    const chatResource = URI.parse(`vscode-chat://chat/${Math.random().toString(36).slice(2)}`);
    approvals.set(chatResource.toString(), {
      approvalId: chatResource.toString(),
      kind: AgentSessionApprovalKind.Terminal,
      label: options.approvalCommand,
      languageId: void 0,
      since: /* @__PURE__ */ new Date(),
      confirm: () => {
      }
    });
    chats = [new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = chatResource;
      }
    }()];
  }
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionId = `local:${options.title}`;
      this.resource = URI.parse(`vscode-session://session/${Math.random().toString(36).slice(2)}`);
      this.providerId = "local";
      this.sessionType = "local";
      this.icon = Codicon.account;
      this.createdAt = updatedAt;
      this.title = constObservable(options.title);
      this.updatedAt = constObservable(updatedAt);
      this.status = constObservable(options.status);
      this.workspace = constObservable(options.workspace);
      this.isArchived = constObservable(false);
      this.isRead = constObservable(true);
      this.capabilities = constObservable({ supportsMultipleChats: false, supportsDelete: true });
      this.changes = constObservable([]);
      this.changesSummary = constObservable(options.changesSummary);
      this.description = constObservable(description);
      this.chats = constObservable(chats);
    }
  }();
}
function createApprovalModel(approvals) {
  return new class extends mock() {
    getApproval(resource) {
      return constObservable(approvals.get(resource.toString()));
    }
  }();
}
function buildApprovalScenario(specs) {
  const approvals = /* @__PURE__ */ new Map();
  const sessions = specs.map((spec) => createBlockedSession(spec, approvals));
  return { sessions, approvalModel: createApprovalModel(approvals) };
}
function createCIFixModel(states) {
  return {
    getCIFix: (session) => constObservable(states.get(session.resource.toString())),
    fixCI: () => {
    }
  };
}
function buildCIFixScenario(specs) {
  const states = /* @__PURE__ */ new Map();
  const sessions = specs.map((spec) => {
    const session = createBlockedSession(spec);
    states.set(session.resource.toString(), spec.ci);
    return session;
  });
  return { sessions, ciFixModel: createCIFixModel(states) };
}
function createMockListModelService() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
    }
    isSessionPinned() {
      return false;
    }
    getStatusIcon(status, _isRead, isArchived, completedStateIcon) {
      switch (status) {
        case SessionStatus.InProgress:
          return { ...Codicon.sessionInProgress, color: themeColorFromId("textLink.foreground") };
        case SessionStatus.NeedsInput:
          return { ...Codicon.circleFilled, color: themeColorFromId("list.warningForeground") };
        case SessionStatus.Error:
          return { ...Codicon.error, color: themeColorFromId("errorForeground") };
        default:
          if (isArchived) {
            return { ...Codicon.passFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") };
          }
          if (completedStateIcon) {
            return completedStateIcon;
          }
          return { ...Codicon.circleSmallFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") };
      }
    }
  }();
}
const failingChecksPr = {
  number: 4821,
  uri: URI.parse("https://github.com/microsoft/vscode/pull/4821"),
  icon: { ...Codicon.gitPullRequest, color: themeColorFromId("charts.red") }
};
const unresolvedCommentsPr = {
  number: 4750,
  uri: URI.parse("https://github.com/microsoft/vscode/pull/4750"),
  icon: { ...Codicon.gitPullRequest, color: themeColorFromId("charts.yellow") }
};
function renderBlockedList(ctx, sessions, approvalModel, ciFixModel) {
  const { container, disposableStore } = ctx;
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
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.visibleSessions = constObservable([]);
        }
      }());
      reg.defineInstance(ISessionsListModelService, createMockListModelService());
      reg.defineInstance(ISessionsManagementService, new class extends mock() {
        markRead() {
          return Promise.resolve();
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
    }
  });
  instantiationService.get(IConfigurationService).setUserConfiguration("editor", { fontFamily: "monospace" });
  instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
  disposableStore.add(registerBlockedSessionsItemActions());
  disposableStore.add(registerBlockedSessionsHeaderCommands());
  disposableStore.add(registerBlockedSessionsHeaderActions());
  container.style.width = "392px";
  container.style.padding = "16px";
  container.style.backgroundColor = "var(--vscode-titleBar-activeBackground, var(--vscode-editor-background))";
  const list = disposableStore.add(instantiationService.createInstance(BlockedSessionsList, container, {
    onSessionOpen: () => {
    },
    onIgnoreSession: () => {
    },
    onShowAllSessions: () => {
    },
    onIgnoreAllSessions: () => {
    },
    onClose: () => {
    },
    approvalModel,
    ciFixModel
  }));
  list.setSessions(sessions);
}
var blockedSessionsList_fixture_default = defineThemedFixtureGroup({ path: "sessions/" }, {
  // A mix of the three reasons a session is "blocked": it needs input, its PR
  // has failing CI checks, or its PR has unresolved comments.
  BlockedSessionsList_Mixed: defineComponentFixture({
    render: (ctx) => renderBlockedList(ctx, [
      createBlockedSession({
        title: "Fix authentication redirect loop",
        status: SessionStatus.NeedsInput,
        minutesAgo: 3,
        workspace: createMockWorkspace("vscode", "feature/auth-fix"),
        description: "Waiting for you to confirm running the database migration."
      }),
      createBlockedSession({
        title: "Add telemetry for startup performance",
        status: SessionStatus.Completed,
        minutesAgo: 62,
        workspace: createMockWorkspace("vscode", "perf/startup-telemetry", failingChecksPr),
        changesSummary: createMockChangesSummary(8, 240, 58)
      }),
      createBlockedSession({
        title: "Refactor the notification service",
        status: SessionStatus.Completed,
        minutesAgo: 184,
        workspace: createMockWorkspace("vscode", "refactor/notifications", unresolvedCommentsPr),
        changesSummary: createMockChangesSummary(12, 96, 140)
      })
    ])
  }),
  // A single session that needs input — the most common blocked state.
  BlockedSessionsList_SingleNeedsInput: defineComponentFixture({
    render: (ctx) => renderBlockedList(ctx, [
      createBlockedSession({
        title: "Update the onboarding walkthrough copy",
        status: SessionStatus.NeedsInput,
        minutesAgo: 1,
        workspace: createMockWorkspace("vscode", "docs/onboarding"),
        description: "Which tone should the welcome step use \u2014 formal or friendly?"
      })
    ])
  }),
  // Enough sessions to fill the dropdown and show the bounded, scrollable height.
  BlockedSessionsList_Many: defineComponentFixture({
    render: (ctx) => renderBlockedList(ctx, [
      createBlockedSession({ title: "Fix authentication redirect loop", status: SessionStatus.NeedsInput, minutesAgo: 3, workspace: createMockWorkspace("vscode", "feature/auth-fix"), description: "Waiting for you to confirm running the database migration." }),
      createBlockedSession({ title: "Add telemetry for startup performance", status: SessionStatus.Completed, minutesAgo: 62, workspace: createMockWorkspace("vscode", "perf/startup-telemetry", failingChecksPr), changesSummary: createMockChangesSummary(8, 240, 58) }),
      createBlockedSession({ title: "Refactor the notification service", status: SessionStatus.Completed, minutesAgo: 184, workspace: createMockWorkspace("vscode", "refactor/notifications", unresolvedCommentsPr), changesSummary: createMockChangesSummary(12, 96, 140) }),
      createBlockedSession({ title: "Migrate settings sync to the new store", status: SessionStatus.NeedsInput, minutesAgo: 240, workspace: createMockWorkspace("vscode", "feature/settings-store"), description: "Should I keep the legacy keys for one more release?" }),
      createBlockedSession({ title: "Investigate flaky terminal integration test", status: SessionStatus.Completed, minutesAgo: 320, workspace: createMockWorkspace("vscode", "fix/flaky-terminal-test", failingChecksPr), changesSummary: createMockChangesSummary(3, 41, 12) }),
      createBlockedSession({ title: "Polish the command center hover states", status: SessionStatus.Completed, minutesAgo: 600, workspace: createMockWorkspace("vscode", "polish/command-center", unresolvedCommentsPr), changesSummary: createMockChangesSummary(5, 64, 9) })
    ])
  }),
  // One session with a pending terminal approval — shows the approval row + Allow button.
  BlockedSessionsList_OneApproval: defineComponentFixture({
    render: (ctx) => {
      const { sessions, approvalModel } = buildApprovalScenario([
        { title: "Build the production bundle", status: SessionStatus.NeedsInput, minutesAgo: 1, workspace: createMockWorkspace("vscode", "release/prod-build"), approvalCommand: "npm run build:prod" }
      ]);
      renderBlockedList(ctx, sessions, approvalModel);
    }
  }),
  // Two sessions awaiting approval — a short command and a long single-line command.
  BlockedSessionsList_TwoApprovals: defineComponentFixture({
    render: (ctx) => {
      const { sessions, approvalModel } = buildApprovalScenario([
        { title: "Push the auth fix", status: SessionStatus.NeedsInput, minutesAgo: 2, workspace: createMockWorkspace("vscode", "feature/auth-fix"), approvalCommand: "git push --force-with-lease origin feature/auth-fix" },
        { title: "Publish the release image", status: SessionStatus.NeedsInput, minutesAgo: 6, workspace: createMockWorkspace("vscode", "release/docker"), approvalCommand: 'docker run --rm -it -v "$(pwd)":/workspace -w /workspace -e NODE_ENV=production -e REGISTRY=ghcr.io/microsoft --network host node:20-alpine npm run build:image -- --push --tag latest --no-cache' }
      ]);
      renderBlockedList(ctx, sessions, approvalModel);
    }
  }),
  // Five sessions awaiting approval, spanning short, long single-line and
  // multi-line terminal commands (the approval row shows up to three lines).
  BlockedSessionsList_FiveApprovals: defineComponentFixture({
    render: (ctx) => {
      const { sessions, approvalModel } = buildApprovalScenario([
        { title: "Install dependencies", status: SessionStatus.NeedsInput, minutesAgo: 1, workspace: createMockWorkspace("vscode", "chore/deps"), approvalCommand: "npm ci" },
        { title: "Rebase onto main", status: SessionStatus.NeedsInput, minutesAgo: 3, workspace: createMockWorkspace("vscode", "feature/rebase"), approvalCommand: "git rebase --onto main feature/old-base feature/new-work" },
        { title: "Provision the review environment", status: SessionStatus.NeedsInput, minutesAgo: 7, workspace: createMockWorkspace("vscode", "infra/review-env"), approvalCommand: "kubectl apply -f ./deploy/review.yaml --namespace review-pr-4821 && kubectl rollout status deployment/web --namespace review-pr-4821 --timeout=180s && kubectl get pods --namespace review-pr-4821 -o wide" },
        { title: "Format changed files", status: SessionStatus.NeedsInput, minutesAgo: 12, workspace: createMockWorkspace("vscode", "chore/format"), approvalCommand: 'for f in $(git diff --name-only main); do\n  npx prettier --write "$f"\n  git add "$f"\ndone' },
        { title: "Reset and reinstall", status: SessionStatus.NeedsInput, minutesAgo: 20, workspace: createMockWorkspace("vscode", "fix/clean-install"), approvalCommand: "rm -rf node_modules\nrm -f package-lock.json\nnpm cache clean --force\nnpm install\nnpm run test:integration" }
      ]);
      renderBlockedList(ctx, sessions, approvalModel);
    }
  }),
  // One session whose PR is failing CI — shows the orange "Fix CI" row.
  BlockedSessionsList_OneFixCI: defineComponentFixture({
    render: (ctx) => {
      const { sessions, ciFixModel } = buildCIFixScenario([
        { title: "Add telemetry for startup performance", status: SessionStatus.Completed, minutesAgo: 62, workspace: createMockWorkspace("vscode", "perf/startup-telemetry", failingChecksPr), changesSummary: createMockChangesSummary(8, 240, 58), ci: { failed: 2, pending: 3 } }
      ]);
      renderBlockedList(ctx, sessions, void 0, ciFixModel);
    }
  }),
  // A mix of a failing-CI session (fix-CI row) and a terminal-approval session
  // (allow row) — the two per-session action rows shown side by side.
  BlockedSessionsList_FixCIAndApproval: defineComponentFixture({
    render: (ctx) => {
      const { sessions: ciSessions, ciFixModel } = buildCIFixScenario([
        { title: "Add telemetry for startup performance", status: SessionStatus.Completed, minutesAgo: 62, workspace: createMockWorkspace("vscode", "perf/startup-telemetry", failingChecksPr), changesSummary: createMockChangesSummary(8, 240, 58), ci: { failed: 5, pending: 0 } },
        { title: "Investigate flaky terminal integration test", status: SessionStatus.Completed, minutesAgo: 320, workspace: createMockWorkspace("vscode", "fix/flaky-terminal-test", failingChecksPr), changesSummary: createMockChangesSummary(3, 41, 12), ci: { failed: 1, pending: 7 } }
      ]);
      const { sessions: approvalSessions, approvalModel } = buildApprovalScenario([
        { title: "Push the auth fix", status: SessionStatus.NeedsInput, minutesAgo: 2, workspace: createMockWorkspace("vscode", "feature/auth-fix"), approvalCommand: "git push --force-with-lease origin feature/auth-fix" }
      ]);
      renderBlockedList(ctx, [...ciSessions, ...approvalSessions], approvalModel, ciFixModel);
    }
  })
});
export {
  blockedSessionsList_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcYmxvY2tlZFNlc3Npb25zTGlzdC5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24sIHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L21hcmtkb3duUmVuZGVyZXIvYnJvd3Nlci9lZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUNoYXQsIElHaXRIdWJJbmZvLCBJU2Vzc2lvbiwgSVNlc3Npb25DaGFuZ2VzU3VtbWFyeSwgSVNlc3Npb25GaWxlQ2hhbmdlLCBJU2Vzc2lvbkZvbGRlciwgSVNlc3Npb25HaXRSZXBvc2l0b3J5LCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IEJsb2NrZWRTZXNzaW9uc0xpc3QsIHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSXRlbUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL2Jyb3dzZXIvYmxvY2tlZFNlc3Npb25zTGlzdC5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9ucywgcmVnaXN0ZXJCbG9ja2VkU2Vzc2lvbnNIZWFkZXJDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1RpdGxlQmFyV2lkZ2V0LmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSVNlc3Npb25DSUZpeE1vZGVsLCBJU2Vzc2lvbkNJRml4U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbnNMaXN0LmpzJztcbmltcG9ydCB7IElWb2ljZVBsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uLCBJQWdlbnRTZXNzaW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLCBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcblxuLy8gVGhlIGJsb2NrZWQtc2Vzc2lvbnMgbGlzdCByZXVzZXMgdGhlIHNoYXJlZCBzZXNzaW9uLXJvdyBzdHlsZXMuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL21lZGlhL3Nlc3Npb25zTGlzdC5jc3MnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBNb2NrIGhlbHBlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1dvcmtzcGFjZShsYWJlbDogc3RyaW5nLCBicmFuY2hOYW1lOiBzdHJpbmcsIHB1bGxSZXF1ZXN0PzogSUdpdEh1YkluZm9bJ3B1bGxSZXF1ZXN0J10pOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdGNvbnN0IHJvb3QgPSBVUkkuZmlsZShgL2hvbWUvdXNlci9wcm9qZWN0cy8ke2xhYmVsfWApO1xuXHRjb25zdCBnaXRIdWJJbmZvOiBJR2l0SHViSW5mbyB8IHVuZGVmaW5lZCA9IHB1bGxSZXF1ZXN0ID8geyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86IGxhYmVsLCBwdWxsUmVxdWVzdCB9IDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGdpdFJlcG9zaXRvcnk6IElTZXNzaW9uR2l0UmVwb3NpdG9yeSA9IHtcblx0XHR1cmk6IHJvb3QsXG5cdFx0d29ya1RyZWVVcmk6IHVuZGVmaW5lZCxcblx0XHRicmFuY2hOYW1lLFxuXHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0aGFzR2l0SHViUmVtb3RlOiB0cnVlLFxuXHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZShnaXRIdWJJbmZvKSxcblx0fTtcblxuXHRjb25zdCBmb2xkZXI6IElTZXNzaW9uRm9sZGVyID0ge1xuXHRcdHJvb3QsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogcm9vdCxcblx0XHRuYW1lOiBsYWJlbCxcblx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdGdpdFJlcG9zaXRvcnksXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHR1cmk6IHJvb3QsXG5cdFx0bGFiZWwsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0Zm9sZGVyczogW2ZvbGRlcl0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0NoYW5nZXNTdW1tYXJ5KGZpbGVzOiBudW1iZXIsIGFkZGl0aW9uczogbnVtYmVyLCBkZWxldGlvbnM6IG51bWJlcik6IElTZXNzaW9uQ2hhbmdlc1N1bW1hcnkge1xuXHRyZXR1cm4geyBmaWxlcywgYWRkaXRpb25zLCBkZWxldGlvbnMgfTtcbn1cblxuaW50ZXJmYWNlIElCbG9ja2VkU2Vzc2lvbk9wdGlvbnMge1xuXHR0aXRsZTogc3RyaW5nO1xuXHRzdGF0dXM6IFNlc3Npb25TdGF0dXM7XG5cdC8qKiBIb3cgbG9uZyBhZ28gdGhlIHNlc3Npb24gd2FzIGxhc3QgdXBkYXRlZCwgaW4gbWludXRlcy4gKi9cblx0bWludXRlc0FnbzogbnVtYmVyO1xuXHR3b3Jrc3BhY2U/OiBJU2Vzc2lvbldvcmtzcGFjZTtcblx0LyoqIFJlbmRlcmVkIGluIHRoZSBkZXRhaWxzIHJvdyBmb3Igc2Vzc2lvbnMgdGhhdCBuZWVkIGlucHV0LiAqL1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0LyoqIERpZmYgc3RhdHMgc2hvd24gZm9yIGNvbXBsZXRlZCBzZXNzaW9ucy4gKi9cblx0Y2hhbmdlc1N1bW1hcnk/OiBJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5O1xuXHQvKiogQSB0ZXJtaW5hbCBjb21tYW5kIGF3YWl0aW5nIGFwcHJvdmFsOyByZW5kZXJzIGFuIGFwcHJvdmFsIHJvdyB3aXRoIGFuIEFsbG93IGJ1dHRvbi4gKi9cblx0YXBwcm92YWxDb21tYW5kPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCbG9ja2VkU2Vzc2lvbihvcHRpb25zOiBJQmxvY2tlZFNlc3Npb25PcHRpb25zLCBhcHByb3ZhbHM/OiBNYXA8c3RyaW5nLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvPik6IElTZXNzaW9uIHtcblx0Y29uc3QgdXBkYXRlZEF0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSAtIG9wdGlvbnMubWludXRlc0FnbyAqIDYwICogMTAwMCk7XG5cdGNvbnN0IGRlc2NyaXB0aW9uOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQgPSBvcHRpb25zLmRlc2NyaXB0aW9uID8gbmV3IE1hcmtkb3duU3RyaW5nKG9wdGlvbnMuZGVzY3JpcHRpb24pIDogdW5kZWZpbmVkO1xuXG5cdC8vIEEgc2Vzc2lvbiBhd2FpdGluZyBhIHRvb2wgYXBwcm92YWwgY2FycmllcyBhIGNoYXQgd2hvc2UgcmVzb3VyY2UgdGhlIChtb2NrKVxuXHQvLyBhcHByb3ZhbCBtb2RlbCBrZXlzIHRoZSBwZW5kaW5nIGFwcHJvdmFsIG9uLlxuXHRsZXQgY2hhdHM6IHJlYWRvbmx5IElDaGF0W10gPSBbXTtcblx0aWYgKG9wdGlvbnMuYXBwcm92YWxDb21tYW5kICE9PSB1bmRlZmluZWQgJiYgYXBwcm92YWxzKSB7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gVVJJLnBhcnNlKGB2c2NvZGUtY2hhdDovL2NoYXQvJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKX1gKTtcblx0XHRhcHByb3ZhbHMuc2V0KGNoYXRSZXNvdXJjZS50b1N0cmluZygpLCB7XG5cdFx0XHRhcHByb3ZhbElkOiBjaGF0UmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGtpbmQ6IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCxcblx0XHRcdGxhYmVsOiBvcHRpb25zLmFwcHJvdmFsQ29tbWFuZCxcblx0XHRcdGxhbmd1YWdlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHNpbmNlOiBuZXcgRGF0ZSgpLFxuXHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGNoYXRzID0gW25ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBjaGF0UmVzb3VyY2U7XG5cdFx0fSgpXTtcblx0fVxuXG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uSWQgPSBgbG9jYWw6JHtvcHRpb25zLnRpdGxlfWA7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoYHZzY29kZS1zZXNzaW9uOi8vc2Vzc2lvbi8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpfWApO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVySWQgPSAnbG9jYWwnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlID0gJ2xvY2FsJztcblx0XHRvdmVycmlkZSByZWFkb25seSBpY29uID0gQ29kaWNvbi5hY2NvdW50O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNyZWF0ZWRBdCA9IHVwZGF0ZWRBdDtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZTogSU9ic2VydmFibGU8c3RyaW5nPiA9IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zLnRpdGxlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB1cGRhdGVkQXQ6IElPYnNlcnZhYmxlPERhdGU+ID0gY29uc3RPYnNlcnZhYmxlKHVwZGF0ZWRBdCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdHVzOiBJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdHVzPiA9IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zLnN0YXR1cyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgd29ya3NwYWNlOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUob3B0aW9ucy53b3Jrc3BhY2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gY29uc3RPYnNlcnZhYmxlPGJvb2xlYW4+KGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc1JlYWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gY29uc3RPYnNlcnZhYmxlPGJvb2xlYW4+KHRydWUpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsIHN1cHBvcnRzRGVsZXRlOiB0cnVlIH0pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPiA9IGNvbnN0T2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4oW10pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5nZXNTdW1tYXJ5OiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZTxJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkPihvcHRpb25zLmNoYW5nZXNTdW1tYXJ5KTtcblx0XHRvdmVycmlkZSByZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+KGRlc2NyaXB0aW9uKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBjaGF0czogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT4gPSBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT4oY2hhdHMpO1xuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFwcHJvdmFsTW9kZWwoYXBwcm92YWxzOiBNYXA8c3RyaW5nLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvPik6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsPigpIHtcblx0XHRvdmVycmlkZSBnZXRBcHByb3ZhbChyZXNvdXJjZTogVVJJKTogSU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShhcHByb3ZhbHMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpKTtcblx0XHR9XG5cdH0oKTtcbn1cblxuLyoqXG4gKiBCdWlsZCBhIHNldCBvZiBzZXNzaW9ucyB0b2dldGhlciB3aXRoIGEgbWF0Y2hpbmcgYXBwcm92YWwgbW9kZWw6IGVhY2ggc2Vzc2lvblxuICogd2hvc2Ugc3BlYyBoYXMgYW4gYGFwcHJvdmFsQ29tbWFuZGAgc2hvd3MgYSBwZW5kaW5nIHRlcm1pbmFsIGFwcHJvdmFsIHJvdy5cbiAqL1xuZnVuY3Rpb24gYnVpbGRBcHByb3ZhbFNjZW5hcmlvKHNwZWNzOiByZWFkb25seSBJQmxvY2tlZFNlc3Npb25PcHRpb25zW10pOiB7IHNlc3Npb25zOiBJU2Vzc2lvbltdOyBhcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIH0ge1xuXHRjb25zdCBhcHByb3ZhbHMgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbz4oKTtcblx0Y29uc3Qgc2Vzc2lvbnMgPSBzcGVjcy5tYXAoc3BlYyA9PiBjcmVhdGVCbG9ja2VkU2Vzc2lvbihzcGVjLCBhcHByb3ZhbHMpKTtcblx0cmV0dXJuIHsgc2Vzc2lvbnMsIGFwcHJvdmFsTW9kZWw6IGNyZWF0ZUFwcHJvdmFsTW9kZWwoYXBwcm92YWxzKSB9O1xufVxuXG4vKiogQSBDSS1maXggc3BlYzogYSBibG9ja2VkIHNlc3Npb24gd2hvc2UgUFIgaXMgZmFpbGluZyBDSSwgd2l0aCB0aGUgY291bnRzIHNob3duIGluIGl0cyByb3cuICovXG5pbnRlcmZhY2UgSUNJQmxvY2tlZFNlc3Npb25PcHRpb25zIGV4dGVuZHMgSUJsb2NrZWRTZXNzaW9uT3B0aW9ucyB7XG5cdGNpOiBJU2Vzc2lvbkNJRml4U3RhdGU7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNJRml4TW9kZWwoc3RhdGVzOiBSZWFkb25seU1hcDxzdHJpbmcsIElTZXNzaW9uQ0lGaXhTdGF0ZT4pOiBJU2Vzc2lvbkNJRml4TW9kZWwge1xuXHRyZXR1cm4ge1xuXHRcdGdldENJRml4OiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IGNvbnN0T2JzZXJ2YWJsZShzdGF0ZXMuZ2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSkpLFxuXHRcdGZpeENJOiAoKSA9PiB7IH0sXG5cdH07XG59XG5cbi8qKlxuICogQnVpbGQgYSBzZXQgb2Ygc2Vzc2lvbnMgdG9nZXRoZXIgd2l0aCBhIG1hdGNoaW5nIENJLWZpeCBtb2RlbDogZWFjaCBzZXNzaW9uXG4gKiB3aG9zZSBzcGVjIGhhcyBhIGBjaWAgc3VtbWFyeSBzaG93cyBhIFwiRml4IENJXCIgcm93IHdpdGggdGhvc2UgY291bnRzLlxuICovXG5mdW5jdGlvbiBidWlsZENJRml4U2NlbmFyaW8oc3BlY3M6IHJlYWRvbmx5IElDSUJsb2NrZWRTZXNzaW9uT3B0aW9uc1tdKTogeyBzZXNzaW9uczogSVNlc3Npb25bXTsgY2lGaXhNb2RlbDogSVNlc3Npb25DSUZpeE1vZGVsIH0ge1xuXHRjb25zdCBzdGF0ZXMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb25DSUZpeFN0YXRlPigpO1xuXHRjb25zdCBzZXNzaW9ucyA9IHNwZWNzLm1hcChzcGVjID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlQmxvY2tlZFNlc3Npb24oc3BlYyk7XG5cdFx0c3RhdGVzLnNldChzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHNwZWMuY2kpO1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9KTtcblx0cmV0dXJuIHsgc2Vzc2lvbnMsIGNpRml4TW9kZWw6IGNyZWF0ZUNJRml4TW9kZWwoc3RhdGVzKSB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrTGlzdE1vZGVsU2VydmljZSgpOiBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTGlzdE1vZGVsU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGlzU2Vzc2lvblBpbm5lZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U3RhdHVzSWNvbihzdGF0dXM6IFNlc3Npb25TdGF0dXMsIF9pc1JlYWQ6IGJvb2xlYW4sIGlzQXJjaGl2ZWQ6IGJvb2xlYW4sIGNvbXBsZXRlZFN0YXRlSWNvbj86IFRoZW1lSWNvbik6IFRoZW1lSWNvbiB7XG5cdFx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0XHRjYXNlIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzczpcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5Db2RpY29uLnNlc3Npb25JblByb2dyZXNzLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgndGV4dExpbmsuZm9yZWdyb3VuZCcpIH07XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0OlxuXHRcdFx0XHRcdHJldHVybiB7IC4uLkNvZGljb24uY2lyY2xlRmlsbGVkLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnbGlzdC53YXJuaW5nRm9yZWdyb3VuZCcpIH07XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5FcnJvcjpcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5Db2RpY29uLmVycm9yLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnZXJyb3JGb3JlZ3JvdW5kJykgfTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRpZiAoaXNBcmNoaXZlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgLi4uQ29kaWNvbi5wYXNzRmlsbGVkLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnYWdlbnRTZXNzaW9uUmVhZEluZGljYXRvci5mb3JlZ3JvdW5kJykgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNvbXBsZXRlZFN0YXRlSWNvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlZFN0YXRlSWNvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uQ29kaWNvbi5jaXJjbGVTbWFsbEZpbGxlZCwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ2FnZW50U2Vzc2lvblJlYWRJbmRpY2F0b3IuZm9yZWdyb3VuZCcpIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9KCk7XG59XG5cbi8vIEEgZmFpbGluZy1DSSBwdWxsIHJlcXVlc3QgKHJlZCkgYW5kIGEgcHVsbCByZXF1ZXN0IHdpdGggdW5yZXNvbHZlZCBjb21tZW50c1xuLy8gKHllbGxvdykgXHUyMDE0IHRoZSB0d28gbm9uLW5lZWRzLWlucHV0IHJlYXNvbnMgYSBzZXNzaW9uIGNvdW50cyBhcyBibG9ja2VkLlxuY29uc3QgZmFpbGluZ0NoZWNrc1ByOiBJR2l0SHViSW5mb1sncHVsbFJlcXVlc3QnXSA9IHtcblx0bnVtYmVyOiA0ODIxLFxuXHR1cmk6IFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC80ODIxJyksXG5cdGljb246IHsgLi4uQ29kaWNvbi5naXRQdWxsUmVxdWVzdCwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ2NoYXJ0cy5yZWQnKSB9LFxufTtcblxuY29uc3QgdW5yZXNvbHZlZENvbW1lbnRzUHI6IElHaXRIdWJJbmZvWydwdWxsUmVxdWVzdCddID0ge1xuXHRudW1iZXI6IDQ3NTAsXG5cdHVyaTogVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzQ3NTAnKSxcblx0aWNvbjogeyAuLi5Db2RpY29uLmdpdFB1bGxSZXF1ZXN0LCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnY2hhcnRzLnllbGxvdycpIH0sXG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZW5kZXIgaGVscGVyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlckJsb2NrZWRMaXN0KGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdLCBhcHByb3ZhbE1vZGVsPzogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCwgY2lGaXhNb2RlbD86IElTZXNzaW9uQ0lGaXhNb2RlbCk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH0gPSBjdHg7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lKElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblx0XHRcdC8vIGBTZXNzaW9uc0ZsYXRMaXN0YCBjcmVhdGVzIGFuIGBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsYCAocmVhZHNcblx0XHRcdC8vIGBJQ2hhdFNlcnZpY2UuY2hhdE1vZGVsc2ApIGFuZCBvYnNlcnZlcyBlYWNoIHNlc3Npb24gdGhyb3VnaCB0aGVcblx0XHRcdC8vIGFnZW50LXNlc3Npb25zIG1vZGVsLiBCb3RoIGFyZSBzdHViYmVkIHRvIG5vLW9wcyBmb3IgdGhlIGZpeHR1cmUuXG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRNb2RlbHM6IElPYnNlcnZhYmxlPEl0ZXJhYmxlPElDaGF0TW9kZWw+PiA9IGNvbnN0T2JzZXJ2YWJsZTxJdGVyYWJsZTxJQ2hhdE1vZGVsPj4oW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zTW9kZWw+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9ic2VydmVTZXNzaW9uKCk6IElPYnNlcnZhYmxlPElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGU8SUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0oKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+ID0gY29uc3RPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4oW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLCBjcmVhdGVNb2NrTGlzdE1vZGVsU2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG1hcmtSZWFkKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdC8vIGBTZXNzaW9uc0ZsYXRMaXN0YC9gU2Vzc2lvbkl0ZW1SZW5kZXJlcmAgcmVhZCB0aGUgdm9pY2UgcGVuZGluZy1yZXNwb25zZVxuXHRcdFx0Ly8gaW5kaWNhdG9yIHN0YXRlOyBzdHViIGl0IGFzIGFsd2F5cy1lbXB0eSBmb3IgdGhlIGZpeHR1cmUuXG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlUGxheWJhY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZVBsYXliYWNrU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHBlbmRpbmdSZXNwb25zZVZlcnNpb246IElPYnNlcnZhYmxlPG51bWJlcj4gPSBjb25zdE9ic2VydmFibGUoMCk7XG5cdFx0XHRcdG92ZXJyaWRlIGhhc1BlbmRpbmdSZXNwb25zZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHR9KCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdC8vIFJlbmRlciB0ZXJtaW5hbC1hcHByb3ZhbCBsYWJlbHMgYXMgcmVhbCAobW9ub3NwYWNlKSBjb2RlIGJsb2NrcyBcdTIwMTQgb3RoZXJ3aXNlXG5cdC8vIHRoZSBtYXJrZG93biByZW5kZXJlciBlbWl0cyBlbXB0eSBjb2RlLWJsb2NrIHNwYW5zIGFuZCB0aGUgY29tbWFuZCBpcyBibGFuay5cblx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSkuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIHsgZm9udEZhbWlseTogJ21vbm9zcGFjZScgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpLnNldERlZmF1bHRDb2RlQmxvY2tSZW5kZXJlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyKSk7XG5cdGRpc3Bvc2FibGVTdG9yZS5hZGQocmVnaXN0ZXJCbG9ja2VkU2Vzc2lvbnNJdGVtQWN0aW9ucygpKTtcblx0ZGlzcG9zYWJsZVN0b3JlLmFkZChyZWdpc3RlckJsb2NrZWRTZXNzaW9uc0hlYWRlckNvbW1hbmRzKCkpO1xuXHRkaXNwb3NhYmxlU3RvcmUuYWRkKHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9ucygpKTtcblxuXHQvLyBUaGUgYmxvY2tlZC1zZXNzaW9ucyBsaXN0IGlzIHNob3duIGFzIGEgZmxvYXRpbmcgZHJvcGRvd24gYW5jaG9yZWQgYmVsb3dcblx0Ly8gdGhlIGNvbW1hbmQgY2VudGVyIGJveCBpbiB0aGUgYWdlbnRzIHdpbmRvdzsgYXBwcm94aW1hdGUgdGhhdCBzdXJmYWNlIChhbmRcblx0Ly8gaXRzIGJhY2tkcm9wKSBoZXJlIHNvIHRoZSB3aWRnZXQncyBvd24gYmFja2dyb3VuZC9ib3JkZXIvc2hhZG93IHJlYWQgYXNcblx0Ly8gdGhleSBkbyBpbiBwcm9kdWN0aW9uLlxuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnMzkycHgnO1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtdGl0bGVCYXItYWN0aXZlQmFja2dyb3VuZCwgdmFyKC0tdnNjb2RlLWVkaXRvci1iYWNrZ3JvdW5kKSknO1xuXG5cdGNvbnN0IGxpc3QgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJsb2NrZWRTZXNzaW9uc0xpc3QsIGNvbnRhaW5lciwge1xuXHRcdG9uU2Vzc2lvbk9wZW46ICgpID0+IHsgfSxcblx0XHRvbklnbm9yZVNlc3Npb246ICgpID0+IHsgfSxcblx0XHRvblNob3dBbGxTZXNzaW9uczogKCkgPT4geyB9LFxuXHRcdG9uSWdub3JlQWxsU2Vzc2lvbnM6ICgpID0+IHsgfSxcblx0XHRvbkNsb3NlOiAoKSA9PiB7IH0sXG5cdFx0YXBwcm92YWxNb2RlbCxcblx0XHRjaUZpeE1vZGVsLFxuXHR9KSk7XG5cdGxpc3Quc2V0U2Vzc2lvbnMoc2Vzc2lvbnMpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaXh0dXJlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnc2Vzc2lvbnMvJyB9LCB7XG5cblx0Ly8gQSBtaXggb2YgdGhlIHRocmVlIHJlYXNvbnMgYSBzZXNzaW9uIGlzIFwiYmxvY2tlZFwiOiBpdCBuZWVkcyBpbnB1dCwgaXRzIFBSXG5cdC8vIGhhcyBmYWlsaW5nIENJIGNoZWNrcywgb3IgaXRzIFBSIGhhcyB1bnJlc29sdmVkIGNvbW1lbnRzLlxuXHRCbG9ja2VkU2Vzc2lvbnNMaXN0X01peGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlckJsb2NrZWRMaXN0KGN0eCwgW1xuXHRcdFx0Y3JlYXRlQmxvY2tlZFNlc3Npb24oe1xuXHRcdFx0XHR0aXRsZTogJ0ZpeCBhdXRoZW50aWNhdGlvbiByZWRpcmVjdCBsb29wJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsXG5cdFx0XHRcdG1pbnV0ZXNBZ286IDMsXG5cdFx0XHRcdHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ2ZlYXR1cmUvYXV0aC1maXgnKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXYWl0aW5nIGZvciB5b3UgdG8gY29uZmlybSBydW5uaW5nIHRoZSBkYXRhYmFzZSBtaWdyYXRpb24uJyxcblx0XHRcdH0pLFxuXHRcdFx0Y3JlYXRlQmxvY2tlZFNlc3Npb24oe1xuXHRcdFx0XHR0aXRsZTogJ0FkZCB0ZWxlbWV0cnkgZm9yIHN0YXJ0dXAgcGVyZm9ybWFuY2UnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRtaW51dGVzQWdvOiA2Mixcblx0XHRcdFx0d29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAncGVyZi9zdGFydHVwLXRlbGVtZXRyeScsIGZhaWxpbmdDaGVja3NQciksXG5cdFx0XHRcdGNoYW5nZXNTdW1tYXJ5OiBjcmVhdGVNb2NrQ2hhbmdlc1N1bW1hcnkoOCwgMjQwLCA1OCksXG5cdFx0XHR9KSxcblx0XHRcdGNyZWF0ZUJsb2NrZWRTZXNzaW9uKHtcblx0XHRcdFx0dGl0bGU6ICdSZWZhY3RvciB0aGUgbm90aWZpY2F0aW9uIHNlcnZpY2UnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRtaW51dGVzQWdvOiAxODQsXG5cdFx0XHRcdHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ3JlZmFjdG9yL25vdGlmaWNhdGlvbnMnLCB1bnJlc29sdmVkQ29tbWVudHNQciksXG5cdFx0XHRcdGNoYW5nZXNTdW1tYXJ5OiBjcmVhdGVNb2NrQ2hhbmdlc1N1bW1hcnkoMTIsIDk2LCAxNDApLFxuXHRcdFx0fSksXG5cdFx0XSksXG5cdH0pLFxuXG5cdC8vIEEgc2luZ2xlIHNlc3Npb24gdGhhdCBuZWVkcyBpbnB1dCBcdTIwMTQgdGhlIG1vc3QgY29tbW9uIGJsb2NrZWQgc3RhdGUuXG5cdEJsb2NrZWRTZXNzaW9uc0xpc3RfU2luZ2xlTmVlZHNJbnB1dDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJCbG9ja2VkTGlzdChjdHgsIFtcblx0XHRcdGNyZWF0ZUJsb2NrZWRTZXNzaW9uKHtcblx0XHRcdFx0dGl0bGU6ICdVcGRhdGUgdGhlIG9uYm9hcmRpbmcgd2Fsa3Rocm91Z2ggY29weScsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LFxuXHRcdFx0XHRtaW51dGVzQWdvOiAxLFxuXHRcdFx0XHR3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdkb2NzL29uYm9hcmRpbmcnKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGljaCB0b25lIHNob3VsZCB0aGUgd2VsY29tZSBzdGVwIHVzZSBcdTIwMTQgZm9ybWFsIG9yIGZyaWVuZGx5PycsXG5cdFx0XHR9KSxcblx0XHRdKSxcblx0fSksXG5cblx0Ly8gRW5vdWdoIHNlc3Npb25zIHRvIGZpbGwgdGhlIGRyb3Bkb3duIGFuZCBzaG93IHRoZSBib3VuZGVkLCBzY3JvbGxhYmxlIGhlaWdodC5cblx0QmxvY2tlZFNlc3Npb25zTGlzdF9NYW55OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlckJsb2NrZWRMaXN0KGN0eCwgW1xuXHRcdFx0Y3JlYXRlQmxvY2tlZFNlc3Npb24oeyB0aXRsZTogJ0ZpeCBhdXRoZW50aWNhdGlvbiByZWRpcmVjdCBsb29wJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIG1pbnV0ZXNBZ286IDMsIHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ2ZlYXR1cmUvYXV0aC1maXgnKSwgZGVzY3JpcHRpb246ICdXYWl0aW5nIGZvciB5b3UgdG8gY29uZmlybSBydW5uaW5nIHRoZSBkYXRhYmFzZSBtaWdyYXRpb24uJyB9KSxcblx0XHRcdGNyZWF0ZUJsb2NrZWRTZXNzaW9uKHsgdGl0bGU6ICdBZGQgdGVsZW1ldHJ5IGZvciBzdGFydHVwIHBlcmZvcm1hbmNlJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbWludXRlc0FnbzogNjIsIHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ3BlcmYvc3RhcnR1cC10ZWxlbWV0cnknLCBmYWlsaW5nQ2hlY2tzUHIpLCBjaGFuZ2VzU3VtbWFyeTogY3JlYXRlTW9ja0NoYW5nZXNTdW1tYXJ5KDgsIDI0MCwgNTgpIH0pLFxuXHRcdFx0Y3JlYXRlQmxvY2tlZFNlc3Npb24oeyB0aXRsZTogJ1JlZmFjdG9yIHRoZSBub3RpZmljYXRpb24gc2VydmljZScsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIG1pbnV0ZXNBZ286IDE4NCwgd29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAncmVmYWN0b3Ivbm90aWZpY2F0aW9ucycsIHVucmVzb2x2ZWRDb21tZW50c1ByKSwgY2hhbmdlc1N1bW1hcnk6IGNyZWF0ZU1vY2tDaGFuZ2VzU3VtbWFyeSgxMiwgOTYsIDE0MCkgfSksXG5cdFx0XHRjcmVhdGVCbG9ja2VkU2Vzc2lvbih7IHRpdGxlOiAnTWlncmF0ZSBzZXR0aW5ncyBzeW5jIHRvIHRoZSBuZXcgc3RvcmUnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbWludXRlc0FnbzogMjQwLCB3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdmZWF0dXJlL3NldHRpbmdzLXN0b3JlJyksIGRlc2NyaXB0aW9uOiAnU2hvdWxkIEkga2VlcCB0aGUgbGVnYWN5IGtleXMgZm9yIG9uZSBtb3JlIHJlbGVhc2U/JyB9KSxcblx0XHRcdGNyZWF0ZUJsb2NrZWRTZXNzaW9uKHsgdGl0bGU6ICdJbnZlc3RpZ2F0ZSBmbGFreSB0ZXJtaW5hbCBpbnRlZ3JhdGlvbiB0ZXN0Jywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbWludXRlc0FnbzogMzIwLCB3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdmaXgvZmxha3ktdGVybWluYWwtdGVzdCcsIGZhaWxpbmdDaGVja3NQciksIGNoYW5nZXNTdW1tYXJ5OiBjcmVhdGVNb2NrQ2hhbmdlc1N1bW1hcnkoMywgNDEsIDEyKSB9KSxcblx0XHRcdGNyZWF0ZUJsb2NrZWRTZXNzaW9uKHsgdGl0bGU6ICdQb2xpc2ggdGhlIGNvbW1hbmQgY2VudGVyIGhvdmVyIHN0YXRlcycsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIG1pbnV0ZXNBZ286IDYwMCwgd29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAncG9saXNoL2NvbW1hbmQtY2VudGVyJywgdW5yZXNvbHZlZENvbW1lbnRzUHIpLCBjaGFuZ2VzU3VtbWFyeTogY3JlYXRlTW9ja0NoYW5nZXNTdW1tYXJ5KDUsIDY0LCA5KSB9KSxcblx0XHRdKSxcblx0fSksXG5cblx0Ly8gT25lIHNlc3Npb24gd2l0aCBhIHBlbmRpbmcgdGVybWluYWwgYXBwcm92YWwgXHUyMDE0IHNob3dzIHRoZSBhcHByb3ZhbCByb3cgKyBBbGxvdyBidXR0b24uXG5cdEJsb2NrZWRTZXNzaW9uc0xpc3RfT25lQXBwcm92YWw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9ucywgYXBwcm92YWxNb2RlbCB9ID0gYnVpbGRBcHByb3ZhbFNjZW5hcmlvKFtcblx0XHRcdFx0eyB0aXRsZTogJ0J1aWxkIHRoZSBwcm9kdWN0aW9uIGJ1bmRsZScsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBtaW51dGVzQWdvOiAxLCB3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdyZWxlYXNlL3Byb2QtYnVpbGQnKSwgYXBwcm92YWxDb21tYW5kOiAnbnBtIHJ1biBidWlsZDpwcm9kJyB9LFxuXHRcdFx0XSk7XG5cdFx0XHRyZW5kZXJCbG9ja2VkTGlzdChjdHgsIHNlc3Npb25zLCBhcHByb3ZhbE1vZGVsKTtcblx0XHR9LFxuXHR9KSxcblxuXHQvLyBUd28gc2Vzc2lvbnMgYXdhaXRpbmcgYXBwcm92YWwgXHUyMDE0IGEgc2hvcnQgY29tbWFuZCBhbmQgYSBsb25nIHNpbmdsZS1saW5lIGNvbW1hbmQuXG5cdEJsb2NrZWRTZXNzaW9uc0xpc3RfVHdvQXBwcm92YWxzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbnMsIGFwcHJvdmFsTW9kZWwgfSA9IGJ1aWxkQXBwcm92YWxTY2VuYXJpbyhbXG5cdFx0XHRcdHsgdGl0bGU6ICdQdXNoIHRoZSBhdXRoIGZpeCcsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBtaW51dGVzQWdvOiAyLCB3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdmZWF0dXJlL2F1dGgtZml4JyksIGFwcHJvdmFsQ29tbWFuZDogJ2dpdCBwdXNoIC0tZm9yY2Utd2l0aC1sZWFzZSBvcmlnaW4gZmVhdHVyZS9hdXRoLWZpeCcgfSxcblx0XHRcdFx0eyB0aXRsZTogJ1B1Ymxpc2ggdGhlIHJlbGVhc2UgaW1hZ2UnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbWludXRlc0FnbzogNiwgd29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAncmVsZWFzZS9kb2NrZXInKSwgYXBwcm92YWxDb21tYW5kOiAnZG9ja2VyIHJ1biAtLXJtIC1pdCAtdiBcIiQocHdkKVwiOi93b3Jrc3BhY2UgLXcgL3dvcmtzcGFjZSAtZSBOT0RFX0VOVj1wcm9kdWN0aW9uIC1lIFJFR0lTVFJZPWdoY3IuaW8vbWljcm9zb2Z0IC0tbmV0d29yayBob3N0IG5vZGU6MjAtYWxwaW5lIG5wbSBydW4gYnVpbGQ6aW1hZ2UgLS0gLS1wdXNoIC0tdGFnIGxhdGVzdCAtLW5vLWNhY2hlJyB9LFxuXHRcdFx0XSk7XG5cdFx0XHRyZW5kZXJCbG9ja2VkTGlzdChjdHgsIHNlc3Npb25zLCBhcHByb3ZhbE1vZGVsKTtcblx0XHR9LFxuXHR9KSxcblxuXHQvLyBGaXZlIHNlc3Npb25zIGF3YWl0aW5nIGFwcHJvdmFsLCBzcGFubmluZyBzaG9ydCwgbG9uZyBzaW5nbGUtbGluZSBhbmRcblx0Ly8gbXVsdGktbGluZSB0ZXJtaW5hbCBjb21tYW5kcyAodGhlIGFwcHJvdmFsIHJvdyBzaG93cyB1cCB0byB0aHJlZSBsaW5lcykuXG5cdEJsb2NrZWRTZXNzaW9uc0xpc3RfRml2ZUFwcHJvdmFsczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25zLCBhcHByb3ZhbE1vZGVsIH0gPSBidWlsZEFwcHJvdmFsU2NlbmFyaW8oW1xuXHRcdFx0XHR7IHRpdGxlOiAnSW5zdGFsbCBkZXBlbmRlbmNpZXMnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbWludXRlc0FnbzogMSwgd29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAnY2hvcmUvZGVwcycpLCBhcHByb3ZhbENvbW1hbmQ6ICducG0gY2knIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdSZWJhc2Ugb250byBtYWluJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIG1pbnV0ZXNBZ286IDMsIHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ2ZlYXR1cmUvcmViYXNlJyksIGFwcHJvdmFsQ29tbWFuZDogJ2dpdCByZWJhc2UgLS1vbnRvIG1haW4gZmVhdHVyZS9vbGQtYmFzZSBmZWF0dXJlL25ldy13b3JrJyB9LFxuXHRcdFx0XHR7IHRpdGxlOiAnUHJvdmlzaW9uIHRoZSByZXZpZXcgZW52aXJvbm1lbnQnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbWludXRlc0FnbzogNywgd29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAnaW5mcmEvcmV2aWV3LWVudicpLCBhcHByb3ZhbENvbW1hbmQ6ICdrdWJlY3RsIGFwcGx5IC1mIC4vZGVwbG95L3Jldmlldy55YW1sIC0tbmFtZXNwYWNlIHJldmlldy1wci00ODIxICYmIGt1YmVjdGwgcm9sbG91dCBzdGF0dXMgZGVwbG95bWVudC93ZWIgLS1uYW1lc3BhY2UgcmV2aWV3LXByLTQ4MjEgLS10aW1lb3V0PTE4MHMgJiYga3ViZWN0bCBnZXQgcG9kcyAtLW5hbWVzcGFjZSByZXZpZXctcHItNDgyMSAtbyB3aWRlJyB9LFxuXHRcdFx0XHR7IHRpdGxlOiAnRm9ybWF0IGNoYW5nZWQgZmlsZXMnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbWludXRlc0FnbzogMTIsIHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ2Nob3JlL2Zvcm1hdCcpLCBhcHByb3ZhbENvbW1hbmQ6ICdmb3IgZiBpbiAkKGdpdCBkaWZmIC0tbmFtZS1vbmx5IG1haW4pOyBkb1xcbiAgbnB4IHByZXR0aWVyIC0td3JpdGUgXCIkZlwiXFxuICBnaXQgYWRkIFwiJGZcIlxcbmRvbmUnIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdSZXNldCBhbmQgcmVpbnN0YWxsJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIG1pbnV0ZXNBZ286IDIwLCB3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdmaXgvY2xlYW4taW5zdGFsbCcpLCBhcHByb3ZhbENvbW1hbmQ6ICdybSAtcmYgbm9kZV9tb2R1bGVzXFxucm0gLWYgcGFja2FnZS1sb2NrLmpzb25cXG5ucG0gY2FjaGUgY2xlYW4gLS1mb3JjZVxcbm5wbSBpbnN0YWxsXFxubnBtIHJ1biB0ZXN0OmludGVncmF0aW9uJyB9LFxuXHRcdFx0XSk7XG5cdFx0XHRyZW5kZXJCbG9ja2VkTGlzdChjdHgsIHNlc3Npb25zLCBhcHByb3ZhbE1vZGVsKTtcblx0XHR9LFxuXHR9KSxcblxuXHQvLyBPbmUgc2Vzc2lvbiB3aG9zZSBQUiBpcyBmYWlsaW5nIENJIFx1MjAxNCBzaG93cyB0aGUgb3JhbmdlIFwiRml4IENJXCIgcm93LlxuXHRCbG9ja2VkU2Vzc2lvbnNMaXN0X09uZUZpeENJOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbnMsIGNpRml4TW9kZWwgfSA9IGJ1aWxkQ0lGaXhTY2VuYXJpbyhbXG5cdFx0XHRcdHsgdGl0bGU6ICdBZGQgdGVsZW1ldHJ5IGZvciBzdGFydHVwIHBlcmZvcm1hbmNlJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbWludXRlc0FnbzogNjIsIHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ3BlcmYvc3RhcnR1cC10ZWxlbWV0cnknLCBmYWlsaW5nQ2hlY2tzUHIpLCBjaGFuZ2VzU3VtbWFyeTogY3JlYXRlTW9ja0NoYW5nZXNTdW1tYXJ5KDgsIDI0MCwgNTgpLCBjaTogeyBmYWlsZWQ6IDIsIHBlbmRpbmc6IDMgfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRyZW5kZXJCbG9ja2VkTGlzdChjdHgsIHNlc3Npb25zLCB1bmRlZmluZWQsIGNpRml4TW9kZWwpO1xuXHRcdH0sXG5cdH0pLFxuXG5cdC8vIEEgbWl4IG9mIGEgZmFpbGluZy1DSSBzZXNzaW9uIChmaXgtQ0kgcm93KSBhbmQgYSB0ZXJtaW5hbC1hcHByb3ZhbCBzZXNzaW9uXG5cdC8vIChhbGxvdyByb3cpIFx1MjAxNCB0aGUgdHdvIHBlci1zZXNzaW9uIGFjdGlvbiByb3dzIHNob3duIHNpZGUgYnkgc2lkZS5cblx0QmxvY2tlZFNlc3Npb25zTGlzdF9GaXhDSUFuZEFwcHJvdmFsOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbnM6IGNpU2Vzc2lvbnMsIGNpRml4TW9kZWwgfSA9IGJ1aWxkQ0lGaXhTY2VuYXJpbyhbXG5cdFx0XHRcdHsgdGl0bGU6ICdBZGQgdGVsZW1ldHJ5IGZvciBzdGFydHVwIHBlcmZvcm1hbmNlJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbWludXRlc0FnbzogNjIsIHdvcmtzcGFjZTogY3JlYXRlTW9ja1dvcmtzcGFjZSgndnNjb2RlJywgJ3BlcmYvc3RhcnR1cC10ZWxlbWV0cnknLCBmYWlsaW5nQ2hlY2tzUHIpLCBjaGFuZ2VzU3VtbWFyeTogY3JlYXRlTW9ja0NoYW5nZXNTdW1tYXJ5KDgsIDI0MCwgNTgpLCBjaTogeyBmYWlsZWQ6IDUsIHBlbmRpbmc6IDAgfSB9LFxuXHRcdFx0XHR7IHRpdGxlOiAnSW52ZXN0aWdhdGUgZmxha3kgdGVybWluYWwgaW50ZWdyYXRpb24gdGVzdCcsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIG1pbnV0ZXNBZ286IDMyMCwgd29ya3NwYWNlOiBjcmVhdGVNb2NrV29ya3NwYWNlKCd2c2NvZGUnLCAnZml4L2ZsYWt5LXRlcm1pbmFsLXRlc3QnLCBmYWlsaW5nQ2hlY2tzUHIpLCBjaGFuZ2VzU3VtbWFyeTogY3JlYXRlTW9ja0NoYW5nZXNTdW1tYXJ5KDMsIDQxLCAxMiksIGNpOiB7IGZhaWxlZDogMSwgcGVuZGluZzogNyB9IH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbnM6IGFwcHJvdmFsU2Vzc2lvbnMsIGFwcHJvdmFsTW9kZWwgfSA9IGJ1aWxkQXBwcm92YWxTY2VuYXJpbyhbXG5cdFx0XHRcdHsgdGl0bGU6ICdQdXNoIHRoZSBhdXRoIGZpeCcsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBtaW51dGVzQWdvOiAyLCB3b3Jrc3BhY2U6IGNyZWF0ZU1vY2tXb3Jrc3BhY2UoJ3ZzY29kZScsICdmZWF0dXJlL2F1dGgtZml4JyksIGFwcHJvdmFsQ29tbWFuZDogJ2dpdCBwdXNoIC0tZm9yY2Utd2l0aC1sZWFzZSBvcmlnaW4gZmVhdHVyZS9hdXRoLWZpeCcgfSxcblx0XHRcdF0pO1xuXHRcdFx0cmVuZGVyQmxvY2tlZExpc3QoY3R4LCBbLi4uY2lTZXNzaW9ucywgLi4uYXBwcm92YWxTZXNzaW9uc10sIGFwcHJvdmFsTW9kZWwsIGNpRml4TW9kZWwpO1xuXHRcdH0sXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQW9CLHdCQUF3QjtBQUM1QyxTQUFTLGFBQWE7QUFDdEIsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLFlBQVk7QUFDckIsU0FBUywwQkFBMEIsK0JBQStCO0FBQ2xFLFNBQVMsY0FBYyxtQkFBbUI7QUFDMUMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyx1Q0FBdUM7QUFFaEQsU0FBNkkscUJBQXFCO0FBRWxLLFNBQXlCLGtDQUFrQztBQUUzRCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGlDQUFpQztBQUUxQyxTQUFTLGlDQUFpQztBQUUxQyxTQUFTLHFCQUFxQiwwQ0FBMEM7QUFFeEUsU0FBUyxzQ0FBc0MsNkNBQTZDO0FBRzVGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsNkJBQTZCO0FBRXRD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
