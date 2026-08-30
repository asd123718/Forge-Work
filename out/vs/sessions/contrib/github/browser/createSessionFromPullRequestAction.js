import { isMobile, isWeb } from "../../../../base/common/platform.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { observableFromEvent, waitForState } from "../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { IGitService } from "../../../../workbench/contrib/git/common/gitService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from "../../../browser/workbench.js";
import { SessionSectionHasNonCloudRepositoryContext, SessionSectionToolbarMenuId, SessionSectionTypeContext } from "../../sessions/browser/views/sessionsList.js";
import { IGitHubService } from "./githubService.js";
import { createPullRequestBootstrapPrompt, createPullRequestContextAttachment, createPullRequestQuickPickItems, createPullRequestSessionMetadata, getExistingPullRequests, getGitHubRepositoryFromRemotes, hasExistingPullRequest, mergePullRequestSummaries, pullRequestMatchesQuery, resolvePullRequestSessionRepository } from "./pullRequestPicker.js";
import { createAndOpenPullRequestSession } from "./pullRequestSessionCreation.js";
const CREATE_SESSION_FROM_PULL_REQUEST_COMMAND_ID = "workbench.agentSessions.createSessionFromPullRequest";
registerAction2(class CreateSessionFromPullRequestAction extends Action2 {
  constructor() {
    super({
      id: CREATE_SESSION_FROM_PULL_REQUEST_COMMAND_ID,
      title: localize2("createSessionFromPullRequest", "Create Session from Pull Request"),
      icon: Codicon.gitPullRequestCreate,
      precondition: ChatContextKeys.enabled,
      menu: {
        id: SessionSectionToolbarMenuId,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ContextKeyExpr.equals(SessionSectionTypeContext.key, "workspace"),
          SessionSectionHasNonCloudRepositoryContext
        )
      }
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const notificationService = accessor.get(INotificationService);
    const gitService = accessor.get(IGitService);
    const gitHubService = accessor.get(IGitHubService);
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const quickInputService = accessor.get(IQuickInputService);
    const commandService = accessor.get(ICommandService);
    const picker = quickInputService.createQuickPick({ useSeparators: true });
    const store = new DisposableStore();
    const pickerCts = store.add(new CancellationTokenSource());
    let sessionCreated = false;
    picker.title = localize("createSessionFromPullRequest.title", "Create Session from Pull Request");
    picker.placeholder = localize("createSessionFromPullRequest.resolvingRepository", "Resolving GitHub repository...");
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.sortByLabel = false;
    picker.enabled = false;
    picker.busy = true;
    store.add(picker.onDidHide(() => {
      if (!sessionCreated) {
        pickerCts.cancel();
      }
      store.dispose();
    }));
    store.add(picker);
    picker.show();
    let repository;
    try {
      repository = await resolvePullRequestSessionRepository(
        context.sessions,
        async (folderUri) => {
          const gitRepository = await gitService.openRepository(folderUri);
          if (!gitRepository) {
            return void 0;
          }
          const current = getGitHubRepositoryFromRemotes(gitRepository.state.get().remotes);
          if (current) {
            return current;
          }
          const state = await waitForState(
            gitRepository.state,
            (state2) => state2.remotes.length > 0,
            void 0,
            pickerCts.token
          );
          return getGitHubRepositoryFromRemotes(state.remotes);
        }
      );
    } catch (error) {
      picker.hide();
      if (!isCancellationError(error)) {
        notificationService.error(localize("createSessionFromPullRequest.resolveGitHubRepositoryError", "Failed to resolve the GitHub repository: {0}", toErrorMessage(error)));
      }
      return;
    }
    if (store.isDisposed) {
      return;
    }
    if (!repository) {
      picker.hide();
      notificationService.warn(localize("createSessionFromPullRequest.noGitHubRepository", "No GitHub repository could be resolved for this workspace."));
      return;
    }
    const existingPullRequests = getExistingPullRequests(sessionsManagementService.getSessions(), repository.owner, repository.repo, context.sessions);
    picker.placeholder = localize("createSessionFromPullRequest.placeholder", "Choose a pull request");
    picker.enabled = true;
    let pullRequests = [];
    let cursor;
    let hasNextPage = true;
    let pagePromise;
    let searchGeneration = 0;
    let waitingForReview = [];
    let assignedToViewer = [];
    let waitingForReviewNumbers = /* @__PURE__ */ new Set();
    let assignedToViewerNumbers = /* @__PURE__ */ new Set();
    const updateItems = () => {
      picker.items = createPullRequestQuickPickItems(pullRequests, existingPullRequests);
    };
    const applyViewerGroups = (pullRequest) => ({
      ...pullRequest,
      reviewRequestedFromViewer: waitingForReviewNumbers.has(pullRequest.number),
      assignedToViewer: assignedToViewerNumbers.has(pullRequest.number)
    });
    const loadNextPage = (render = true) => {
      if (!hasNextPage) {
        return Promise.resolve();
      }
      if (!pagePromise) {
        picker.busy = true;
        const promise = gitHubService.getPullRequests(repository.owner, repository.repo, cursor).then((page) => {
          pullRequests = mergePullRequestSummaries(pullRequests, page.pullRequests.map(applyViewerGroups));
          cursor = page.cursor;
          hasNextPage = page.hasNextPage && page.cursor !== void 0;
          if (render) {
            updateItems();
          }
        }).finally(() => {
          pagePromise = void 0;
          if (render) {
            picker.busy = false;
          }
        });
        pagePromise = promise;
        return promise;
      }
      return pagePromise;
    };
    const appendGroup = (group) => {
      const items = createPullRequestQuickPickItems(group, existingPullRequests);
      if (items.length > 0) {
        picker.items = [...picker.items, ...items];
      }
    };
    const loadGroup = async (request, groupLabel) => {
      try {
        return await request;
      } catch (error) {
        notificationService.warn(localize("createSessionFromPullRequest.groupLoadError", "Pull requests loaded, but the {0} group could not be resolved: {1}", groupLabel, toErrorMessage(error)));
        return [];
      }
    };
    const loadInitialGroups = async () => {
      const firstPage = loadNextPage(false);
      const waitingForReviewPromise = loadGroup(
        gitHubService.getPullRequestsWaitingForReview(repository.owner, repository.repo),
        localize("pullRequests.waitingForMyReview", "Waiting for My Review")
      );
      const assignedToViewerPromise = loadGroup(
        gitHubService.getPullRequestsAssignedToViewer(repository.owner, repository.repo),
        localize("pullRequests.assignedToMe", "Assigned to Me")
      );
      waitingForReview = await waitingForReviewPromise;
      waitingForReviewNumbers = new Set(waitingForReview.map((pullRequest) => pullRequest.number));
      pullRequests = mergePullRequestSummaries(pullRequests, waitingForReview.map(applyViewerGroups));
      appendGroup(waitingForReview);
      assignedToViewer = (await assignedToViewerPromise).filter((pullRequest) => !waitingForReviewNumbers.has(pullRequest.number));
      assignedToViewerNumbers = new Set(assignedToViewer.map((pullRequest) => pullRequest.number));
      pullRequests = mergePullRequestSummaries(pullRequests, assignedToViewer.map(applyViewerGroups));
      appendGroup(assignedToViewer);
      await firstPage;
      pullRequests = pullRequests.map(applyViewerGroups);
      updateItems();
      picker.busy = false;
    };
    const initialGroupsPromise = loadInitialGroups();
    const loadUntilMatch = async (query, generation) => {
      await initialGroupsPromise;
      while (generation === searchGeneration && query && hasNextPage && !pullRequests.some((pullRequest) => !hasExistingPullRequest(pullRequest, existingPullRequests) && pullRequestMatchesQuery(pullRequest, query))) {
        await loadNextPage();
      }
    };
    store.add(picker.onDidChangeValue((value) => {
      const generation = ++searchGeneration;
      void loadUntilMatch(value, generation).catch((error) => {
        notificationService.error(localize("createSessionFromPullRequest.loadError", "Failed to load pull requests: {0}", toErrorMessage(error)));
      });
    }));
    store.add(picker.onDidAccept(async () => {
      const pullRequest = picker.selectedItems[0]?.pullRequest;
      if (!pullRequest) {
        return;
      }
      picker.enabled = false;
      picker.busy = true;
      try {
        await waitForWorktreeSessionType(sessionsManagementService, repository.folderUri, pickerCts.token);
        if (pickerCts.token.isCancellationRequested) {
          return;
        }
        await createAndOpenPullRequestSession(
          (onSessionCreated) => sessionsManagementService.createAndSendNewChatRequest(repository.folderUri, {
            kind: "deferred",
            activity: localize("createSessionFromPullRequest.fetching", "Fetching pull request..."),
            async resolve() {
              const pullRequestContext = await gitHubService.getPullRequestContext(repository.owner, repository.repo, pullRequest.number);
              return {
                query: createPullRequestBootstrapPrompt(pullRequest),
                title: pullRequest.title,
                attachedContext: [createPullRequestContextAttachment(pullRequestContext)],
                hideFromTranscript: true
              };
            }
          }, {
            isolationMode: "worktree",
            branch: pullRequest.checkoutRef,
            worktreeBranchTrack: true,
            metadata: createPullRequestSessionMetadata(repository.owner, repository.repo, pullRequest),
            onSessionCreated
          }, pickerCts.token),
          (resource) => sessionsService.showSession(resource),
          () => {
            sessionCreated = true;
            if (!store.isDisposed) {
              picker.hide();
            }
          }
        );
        if (isWeb && isMobile) {
          await commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
        }
        sessionsPartService.focusSession(sessionsService.activeSession.get());
      } catch (error) {
        if (isCancellationError(error)) {
          return;
        }
        if (!store.isDisposed) {
          picker.hide();
        }
        notificationService.error(localize("createSessionFromPullRequest.error", "Failed to create a session from pull request #{0}: {1}", pullRequest.number, toErrorMessage(error)));
        await sessionsService.openNewSession();
      }
    }));
    void initialGroupsPromise.catch((error) => {
      picker.busy = false;
      notificationService.error(localize("createSessionFromPullRequest.loadError", "Failed to load pull requests: {0}", toErrorMessage(error)));
    });
  }
});
async function waitForWorktreeSessionType(sessionsManagementService, folderUri, token) {
  const isAvailable = () => sessionsManagementService.getSessionTypesForFolder(folderUri).some((candidate) => candidate.sessionType.supportsWorktreeConfiguration === true);
  if (isAvailable()) {
    return;
  }
  await waitForState(
    observableFromEvent(sessionsManagementService.onDidChangeSessionTypes, isAvailable),
    (available) => available,
    void 0,
    token
  );
}
export {
  CREATE_SESSION_FROM_PULL_REQUEST_COMMAND_ID
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFxicm93c2VyXFxjcmVhdGVTZXNzaW9uRnJvbVB1bGxSZXF1ZXN0QWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNNb2JpbGUsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlRnJvbUV2ZW50LCB3YWl0Rm9yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL2dpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDTE9TRV9NT0JJTEVfU0lERUJBUl9EUkFXRVJfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IElTZXNzaW9uU2VjdGlvbiwgU2Vzc2lvblNlY3Rpb25IYXNOb25DbG91ZFJlcG9zaXRvcnlDb250ZXh0LCBTZXNzaW9uU2VjdGlvblRvb2xiYXJNZW51SWQsIFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQgfSBmcm9tICcuLi8uLi9zZXNzaW9ucy9icm93c2VyL3ZpZXdzL3Nlc3Npb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4vZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5IH0gZnJvbSAnLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVB1bGxSZXF1ZXN0Qm9vdHN0cmFwUHJvbXB0LCBjcmVhdGVQdWxsUmVxdWVzdENvbnRleHRBdHRhY2htZW50LCBjcmVhdGVQdWxsUmVxdWVzdFF1aWNrUGlja0l0ZW1zLCBjcmVhdGVQdWxsUmVxdWVzdFNlc3Npb25NZXRhZGF0YSwgZ2V0RXhpc3RpbmdQdWxsUmVxdWVzdHMsIGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlcywgaGFzRXhpc3RpbmdQdWxsUmVxdWVzdCwgSVB1bGxSZXF1ZXN0UXVpY2tQaWNrSXRlbSwgbWVyZ2VQdWxsUmVxdWVzdFN1bW1hcmllcywgcHVsbFJlcXVlc3RNYXRjaGVzUXVlcnksIHJlc29sdmVQdWxsUmVxdWVzdFNlc3Npb25SZXBvc2l0b3J5IH0gZnJvbSAnLi9wdWxsUmVxdWVzdFBpY2tlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBbmRPcGVuUHVsbFJlcXVlc3RTZXNzaW9uIH0gZnJvbSAnLi9wdWxsUmVxdWVzdFNlc3Npb25DcmVhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBDUkVBVEVfU0VTU0lPTl9GUk9NX1BVTExfUkVRVUVTVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zLmNyZWF0ZVNlc3Npb25Gcm9tUHVsbFJlcXVlc3QnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ3JlYXRlU2Vzc2lvbkZyb21QdWxsUmVxdWVzdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ1JFQVRFX1NFU1NJT05fRlJPTV9QVUxMX1JFUVVFU1RfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NyZWF0ZVNlc3Npb25Gcm9tUHVsbFJlcXVlc3QnLCBcIkNyZWF0ZSBTZXNzaW9uIGZyb20gUHVsbCBSZXF1ZXN0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5naXRQdWxsUmVxdWVzdENyZWF0ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBTZXNzaW9uU2VjdGlvblRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQua2V5LCAnd29ya3NwYWNlJyksXG5cdFx0XHRcdFx0U2Vzc2lvblNlY3Rpb25IYXNOb25DbG91ZFJlcG9zaXRvcnlDb250ZXh0LFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uU2VjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUdpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUdpdEh1YlNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgcGlja2VyID0gcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElQdWxsUmVxdWVzdFF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXJDdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdGxldCBzZXNzaW9uQ3JlYXRlZCA9IGZhbHNlO1xuXHRcdHBpY2tlci50aXRsZSA9IGxvY2FsaXplKCdjcmVhdGVTZXNzaW9uRnJvbVB1bGxSZXF1ZXN0LnRpdGxlJywgXCJDcmVhdGUgU2Vzc2lvbiBmcm9tIFB1bGwgUmVxdWVzdFwiKTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY3JlYXRlU2Vzc2lvbkZyb21QdWxsUmVxdWVzdC5yZXNvbHZpbmdSZXBvc2l0b3J5JywgXCJSZXNvbHZpbmcgR2l0SHViIHJlcG9zaXRvcnkuLi5cIik7XG5cdFx0cGlja2VyLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cGlja2VyLm1hdGNoT25EZXRhaWwgPSB0cnVlO1xuXHRcdHBpY2tlci5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXHRcdHBpY2tlci5lbmFibGVkID0gZmFsc2U7XG5cdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdGlmICghc2Vzc2lvbkNyZWF0ZWQpIHtcblx0XHRcdFx0cGlja2VyQ3RzLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQocGlja2VyKTtcblx0XHRwaWNrZXIuc2hvdygpO1xuXG5cdFx0bGV0IHJlcG9zaXRvcnk7XG5cdFx0dHJ5IHtcblx0XHRcdHJlcG9zaXRvcnkgPSBhd2FpdCByZXNvbHZlUHVsbFJlcXVlc3RTZXNzaW9uUmVwb3NpdG9yeShcblx0XHRcdFx0Y29udGV4dC5zZXNzaW9ucyxcblx0XHRcdFx0YXN5bmMgZm9sZGVyVXJpID0+IHtcblx0XHRcdFx0XHRjb25zdCBnaXRSZXBvc2l0b3J5ID0gYXdhaXQgZ2l0U2VydmljZS5vcGVuUmVwb3NpdG9yeShmb2xkZXJVcmkpO1xuXHRcdFx0XHRcdGlmICghZ2l0UmVwb3NpdG9yeSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlcyhnaXRSZXBvc2l0b3J5LnN0YXRlLmdldCgpLnJlbW90ZXMpO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY3VycmVudDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0XHRcdFx0XHRnaXRSZXBvc2l0b3J5LnN0YXRlLFxuXHRcdFx0XHRcdFx0c3RhdGUgPT4gc3RhdGUucmVtb3Rlcy5sZW5ndGggPiAwLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGlja2VyQ3RzLnRva2VuLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0cmV0dXJuIGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlcyhzdGF0ZS5yZW1vdGVzKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NyZWF0ZVNlc3Npb25Gcm9tUHVsbFJlcXVlc3QucmVzb2x2ZUdpdEh1YlJlcG9zaXRvcnlFcnJvcicsIFwiRmFpbGVkIHRvIHJlc29sdmUgdGhlIEdpdEh1YiByZXBvc2l0b3J5OiB7MH1cIiwgdG9FcnJvck1lc3NhZ2UoZXJyb3IpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnY3JlYXRlU2Vzc2lvbkZyb21QdWxsUmVxdWVzdC5ub0dpdEh1YlJlcG9zaXRvcnknLCBcIk5vIEdpdEh1YiByZXBvc2l0b3J5IGNvdWxkIGJlIHJlc29sdmVkIGZvciB0aGlzIHdvcmtzcGFjZS5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nUHVsbFJlcXVlc3RzID0gZ2V0RXhpc3RpbmdQdWxsUmVxdWVzdHMoc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9ucygpLCByZXBvc2l0b3J5Lm93bmVyLCByZXBvc2l0b3J5LnJlcG8sIGNvbnRleHQuc2Vzc2lvbnMpO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjcmVhdGVTZXNzaW9uRnJvbVB1bGxSZXF1ZXN0LnBsYWNlaG9sZGVyJywgXCJDaG9vc2UgYSBwdWxsIHJlcXVlc3RcIik7XG5cdFx0cGlja2VyLmVuYWJsZWQgPSB0cnVlO1xuXG5cdFx0bGV0IHB1bGxSZXF1ZXN0czogSUdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeVtdID0gW107XG5cdFx0bGV0IGN1cnNvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBoYXNOZXh0UGFnZSA9IHRydWU7XG5cdFx0bGV0IHBhZ2VQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZWFyY2hHZW5lcmF0aW9uID0gMDtcblx0XHRsZXQgd2FpdGluZ0ZvclJldmlldzogcmVhZG9ubHkgSUdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeVtdID0gW107XG5cdFx0bGV0IGFzc2lnbmVkVG9WaWV3ZXI6IHJlYWRvbmx5IElHaXRIdWJQdWxsUmVxdWVzdFN1bW1hcnlbXSA9IFtdO1xuXHRcdGxldCB3YWl0aW5nRm9yUmV2aWV3TnVtYmVycyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGxldCBhc3NpZ25lZFRvVmlld2VyTnVtYmVycyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3QgdXBkYXRlSXRlbXMgPSAoKSA9PiB7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBjcmVhdGVQdWxsUmVxdWVzdFF1aWNrUGlja0l0ZW1zKHB1bGxSZXF1ZXN0cywgZXhpc3RpbmdQdWxsUmVxdWVzdHMpO1xuXHRcdH07XG5cdFx0Y29uc3QgYXBwbHlWaWV3ZXJHcm91cHMgPSAocHVsbFJlcXVlc3Q6IElHaXRIdWJQdWxsUmVxdWVzdFN1bW1hcnkpOiBJR2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5ID0+ICh7XG5cdFx0XHQuLi5wdWxsUmVxdWVzdCxcblx0XHRcdHJldmlld1JlcXVlc3RlZEZyb21WaWV3ZXI6IHdhaXRpbmdGb3JSZXZpZXdOdW1iZXJzLmhhcyhwdWxsUmVxdWVzdC5udW1iZXIpLFxuXHRcdFx0YXNzaWduZWRUb1ZpZXdlcjogYXNzaWduZWRUb1ZpZXdlck51bWJlcnMuaGFzKHB1bGxSZXF1ZXN0Lm51bWJlciksXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9hZE5leHRQYWdlID0gKHJlbmRlciA9IHRydWUpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGlmICghaGFzTmV4dFBhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwYWdlUHJvbWlzZSkge1xuXHRcdFx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHByb21pc2UgPSBnaXRIdWJTZXJ2aWNlLmdldFB1bGxSZXF1ZXN0cyhyZXBvc2l0b3J5Lm93bmVyLCByZXBvc2l0b3J5LnJlcG8sIGN1cnNvcikudGhlbihwYWdlID0+IHtcblx0XHRcdFx0XHRwdWxsUmVxdWVzdHMgPSBtZXJnZVB1bGxSZXF1ZXN0U3VtbWFyaWVzKHB1bGxSZXF1ZXN0cywgcGFnZS5wdWxsUmVxdWVzdHMubWFwKGFwcGx5Vmlld2VyR3JvdXBzKSk7XG5cdFx0XHRcdFx0Y3Vyc29yID0gcGFnZS5jdXJzb3I7XG5cdFx0XHRcdFx0aGFzTmV4dFBhZ2UgPSBwYWdlLmhhc05leHRQYWdlICYmIHBhZ2UuY3Vyc29yICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHJlbmRlcikge1xuXHRcdFx0XHRcdFx0dXBkYXRlSXRlbXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdHBhZ2VQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChyZW5kZXIpIHtcblx0XHRcdFx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cGFnZVByb21pc2UgPSBwcm9taXNlO1xuXHRcdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYWdlUHJvbWlzZTtcblx0XHR9O1xuXHRcdGNvbnN0IGFwcGVuZEdyb3VwID0gKGdyb3VwOiByZWFkb25seSBJR2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5W10pOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gY3JlYXRlUHVsbFJlcXVlc3RRdWlja1BpY2tJdGVtcyhncm91cCwgZXhpc3RpbmdQdWxsUmVxdWVzdHMpO1xuXHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGlja2VyLml0ZW1zID0gWy4uLnBpY2tlci5pdGVtcywgLi4uaXRlbXNdO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgbG9hZEdyb3VwID0gYXN5bmMgKHJlcXVlc3Q6IFByb21pc2U8cmVhZG9ubHkgSUdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeVtdPiwgZ3JvdXBMYWJlbDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJR2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5W10+ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCByZXF1ZXN0O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdjcmVhdGVTZXNzaW9uRnJvbVB1bGxSZXF1ZXN0Lmdyb3VwTG9hZEVycm9yJywgXCJQdWxsIHJlcXVlc3RzIGxvYWRlZCwgYnV0IHRoZSB7MH0gZ3JvdXAgY291bGQgbm90IGJlIHJlc29sdmVkOiB7MX1cIiwgZ3JvdXBMYWJlbCwgdG9FcnJvck1lc3NhZ2UoZXJyb3IpKSk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGxvYWRJbml0aWFsR3JvdXBzID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3RQYWdlID0gbG9hZE5leHRQYWdlKGZhbHNlKTtcblx0XHRcdGNvbnN0IHdhaXRpbmdGb3JSZXZpZXdQcm9taXNlID0gbG9hZEdyb3VwKFxuXHRcdFx0XHRnaXRIdWJTZXJ2aWNlLmdldFB1bGxSZXF1ZXN0c1dhaXRpbmdGb3JSZXZpZXcocmVwb3NpdG9yeS5vd25lciwgcmVwb3NpdG9yeS5yZXBvKSxcblx0XHRcdFx0bG9jYWxpemUoJ3B1bGxSZXF1ZXN0cy53YWl0aW5nRm9yTXlSZXZpZXcnLCBcIldhaXRpbmcgZm9yIE15IFJldmlld1wiKSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBhc3NpZ25lZFRvVmlld2VyUHJvbWlzZSA9IGxvYWRHcm91cChcblx0XHRcdFx0Z2l0SHViU2VydmljZS5nZXRQdWxsUmVxdWVzdHNBc3NpZ25lZFRvVmlld2VyKHJlcG9zaXRvcnkub3duZXIsIHJlcG9zaXRvcnkucmVwbyksXG5cdFx0XHRcdGxvY2FsaXplKCdwdWxsUmVxdWVzdHMuYXNzaWduZWRUb01lJywgXCJBc3NpZ25lZCB0byBNZVwiKSxcblx0XHRcdCk7XG5cdFx0XHR3YWl0aW5nRm9yUmV2aWV3ID0gYXdhaXQgd2FpdGluZ0ZvclJldmlld1Byb21pc2U7XG5cdFx0XHR3YWl0aW5nRm9yUmV2aWV3TnVtYmVycyA9IG5ldyBTZXQod2FpdGluZ0ZvclJldmlldy5tYXAocHVsbFJlcXVlc3QgPT4gcHVsbFJlcXVlc3QubnVtYmVyKSk7XG5cdFx0XHRwdWxsUmVxdWVzdHMgPSBtZXJnZVB1bGxSZXF1ZXN0U3VtbWFyaWVzKHB1bGxSZXF1ZXN0cywgd2FpdGluZ0ZvclJldmlldy5tYXAoYXBwbHlWaWV3ZXJHcm91cHMpKTtcblx0XHRcdGFwcGVuZEdyb3VwKHdhaXRpbmdGb3JSZXZpZXcpO1xuXG5cdFx0XHRhc3NpZ25lZFRvVmlld2VyID0gKGF3YWl0IGFzc2lnbmVkVG9WaWV3ZXJQcm9taXNlKS5maWx0ZXIocHVsbFJlcXVlc3QgPT4gIXdhaXRpbmdGb3JSZXZpZXdOdW1iZXJzLmhhcyhwdWxsUmVxdWVzdC5udW1iZXIpKTtcblx0XHRcdGFzc2lnbmVkVG9WaWV3ZXJOdW1iZXJzID0gbmV3IFNldChhc3NpZ25lZFRvVmlld2VyLm1hcChwdWxsUmVxdWVzdCA9PiBwdWxsUmVxdWVzdC5udW1iZXIpKTtcblx0XHRcdHB1bGxSZXF1ZXN0cyA9IG1lcmdlUHVsbFJlcXVlc3RTdW1tYXJpZXMocHVsbFJlcXVlc3RzLCBhc3NpZ25lZFRvVmlld2VyLm1hcChhcHBseVZpZXdlckdyb3VwcykpO1xuXHRcdFx0YXBwZW5kR3JvdXAoYXNzaWduZWRUb1ZpZXdlcik7XG5cblx0XHRcdGF3YWl0IGZpcnN0UGFnZTtcblx0XHRcdHB1bGxSZXF1ZXN0cyA9IHB1bGxSZXF1ZXN0cy5tYXAoYXBwbHlWaWV3ZXJHcm91cHMpO1xuXHRcdFx0dXBkYXRlSXRlbXMoKTtcblx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0fTtcblx0XHRjb25zdCBpbml0aWFsR3JvdXBzUHJvbWlzZSA9IGxvYWRJbml0aWFsR3JvdXBzKCk7XG5cdFx0Y29uc3QgbG9hZFVudGlsTWF0Y2ggPSBhc3luYyAocXVlcnk6IHN0cmluZywgZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRhd2FpdCBpbml0aWFsR3JvdXBzUHJvbWlzZTtcblx0XHRcdHdoaWxlIChnZW5lcmF0aW9uID09PSBzZWFyY2hHZW5lcmF0aW9uICYmIHF1ZXJ5ICYmIGhhc05leHRQYWdlICYmICFwdWxsUmVxdWVzdHMuc29tZShwdWxsUmVxdWVzdCA9PiAhaGFzRXhpc3RpbmdQdWxsUmVxdWVzdChwdWxsUmVxdWVzdCwgZXhpc3RpbmdQdWxsUmVxdWVzdHMpICYmIHB1bGxSZXF1ZXN0TWF0Y2hlc1F1ZXJ5KHB1bGxSZXF1ZXN0LCBxdWVyeSkpKSB7XG5cdFx0XHRcdGF3YWl0IGxvYWROZXh0UGFnZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrc2VhcmNoR2VuZXJhdGlvbjtcblx0XHRcdHZvaWQgbG9hZFVudGlsTWF0Y2godmFsdWUsIGdlbmVyYXRpb24pLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY3JlYXRlU2Vzc2lvbkZyb21QdWxsUmVxdWVzdC5sb2FkRXJyb3InLCBcIkZhaWxlZCB0byBsb2FkIHB1bGwgcmVxdWVzdHM6IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0ID0gcGlja2VyLnNlbGVjdGVkSXRlbXNbMF0/LnB1bGxSZXF1ZXN0O1xuXHRcdFx0aWYgKCFwdWxsUmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHBpY2tlci5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yV29ya3RyZWVTZXNzaW9uVHlwZShzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCByZXBvc2l0b3J5LmZvbGRlclVyaSwgcGlja2VyQ3RzLnRva2VuKTtcblx0XHRcdFx0aWYgKHBpY2tlckN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBjcmVhdGVBbmRPcGVuUHVsbFJlcXVlc3RTZXNzaW9uKFxuXHRcdFx0XHRcdG9uU2Vzc2lvbkNyZWF0ZWQgPT4gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QocmVwb3NpdG9yeS5mb2xkZXJVcmksIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdkZWZlcnJlZCcsXG5cdFx0XHRcdFx0XHRhY3Rpdml0eTogbG9jYWxpemUoJ2NyZWF0ZVNlc3Npb25Gcm9tUHVsbFJlcXVlc3QuZmV0Y2hpbmcnLCBcIkZldGNoaW5nIHB1bGwgcmVxdWVzdC4uLlwiKSxcblx0XHRcdFx0XHRcdGFzeW5jIHJlc29sdmUoKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0Q29udGV4dCA9IGF3YWl0IGdpdEh1YlNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RDb250ZXh0KHJlcG9zaXRvcnkub3duZXIsIHJlcG9zaXRvcnkucmVwbywgcHVsbFJlcXVlc3QubnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRxdWVyeTogY3JlYXRlUHVsbFJlcXVlc3RCb290c3RyYXBQcm9tcHQocHVsbFJlcXVlc3QpLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBwdWxsUmVxdWVzdC50aXRsZSxcblx0XHRcdFx0XHRcdFx0XHRhdHRhY2hlZENvbnRleHQ6IFtjcmVhdGVQdWxsUmVxdWVzdENvbnRleHRBdHRhY2htZW50KHB1bGxSZXF1ZXN0Q29udGV4dCldLFxuXHRcdFx0XHRcdFx0XHRcdGhpZGVGcm9tVHJhbnNjcmlwdDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdFx0XHRcdGJyYW5jaDogcHVsbFJlcXVlc3QuY2hlY2tvdXRSZWYsXG5cdFx0XHRcdFx0XHR3b3JrdHJlZUJyYW5jaFRyYWNrOiB0cnVlLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGNyZWF0ZVB1bGxSZXF1ZXN0U2Vzc2lvbk1ldGFkYXRhKHJlcG9zaXRvcnkub3duZXIsIHJlcG9zaXRvcnkucmVwbywgcHVsbFJlcXVlc3QpLFxuXHRcdFx0XHRcdFx0b25TZXNzaW9uQ3JlYXRlZCxcblx0XHRcdFx0XHR9LCBwaWNrZXJDdHMudG9rZW4pLFxuXHRcdFx0XHRcdHJlc291cmNlID0+IHNlc3Npb25zU2VydmljZS5zaG93U2Vzc2lvbihyZXNvdXJjZSksXG5cdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbkNyZWF0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKCFzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKGlzV2ViICYmIGlzTW9iaWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0xPU0VfTU9CSUxFX1NJREVCQVJfRFJBV0VSX0NPTU1BTkRfSUQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NyZWF0ZVNlc3Npb25Gcm9tUHVsbFJlcXVlc3QuZXJyb3InLCBcIkZhaWxlZCB0byBjcmVhdGUgYSBzZXNzaW9uIGZyb20gcHVsbCByZXF1ZXN0ICN7MH06IHsxfVwiLCBwdWxsUmVxdWVzdC5udW1iZXIsIHRvRXJyb3JNZXNzYWdlKGVycm9yKSkpO1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dm9pZCBpbml0aWFsR3JvdXBzUHJvbWlzZS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY3JlYXRlU2Vzc2lvbkZyb21QdWxsUmVxdWVzdC5sb2FkRXJyb3InLCBcIkZhaWxlZCB0byBsb2FkIHB1bGwgcmVxdWVzdHM6IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JXb3JrdHJlZVNlc3Npb25UeXBlKHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBmb2xkZXJVcmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGlzQXZhaWxhYmxlID0gKCkgPT4gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyVXJpKVxuXHRcdC5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuc2Vzc2lvblR5cGUuc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gPT09IHRydWUpO1xuXHRpZiAoaXNBdmFpbGFibGUoKSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0b2JzZXJ2YWJsZUZyb21FdmVudChzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLCBpc0F2YWlsYWJsZSksXG5cdFx0YXZhaWxhYmxlID0+IGF2YWlsYWJsZSxcblx0XHR1bmRlZmluZWQsXG5cdFx0dG9rZW4sXG5cdCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsYUFBYTtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMscUJBQXFCLG9CQUFvQjtBQUVsRCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBMEIsNENBQTRDLDZCQUE2QixpQ0FBaUM7QUFDcEksU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxrQ0FBa0Msb0NBQW9DLGlDQUFpQyxrQ0FBa0MseUJBQXlCLGdDQUFnQyx3QkFBbUQsMkJBQTJCLHlCQUF5QiwyQ0FBMkM7QUFDN1YsU0FBUyx1Q0FBdUM7QUFFekMs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
