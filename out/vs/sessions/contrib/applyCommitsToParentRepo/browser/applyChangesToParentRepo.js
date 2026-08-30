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
import { toAction } from "../../../../base/common/actions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { autorun } from "../../../../base/common/observable.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IsSessionsWindowContext } from "../../../../workbench/common/contextkeys.js";
import { CHAT_CATEGORY } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { URI } from "../../../../base/common/uri.js";
import { SessionIsArchivedContext } from "../../../common/contextkeys.js";
const hasWorktreeAndRepositoryContextKey = new RawContextKey("agentSessionHasWorktreeAndRepository", false, {
  type: "boolean",
  description: localize("agentSessionHasWorktreeAndRepository", "True when the active agent session has both a worktree and a parent repository.")
});
let ApplyChangesToParentRepoContribution = class extends Disposable {
  constructor(contextKeyService, sessionsService) {
    super();
    const worktreeAndRepoKey = hasWorktreeAndRepositoryContextKey.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      const folder = activeSession?.workspace.read(reader)?.folders[0];
      const hasWorktreeAndRepo = !!folder?.gitRepository?.workTreeUri;
      worktreeAndRepoKey.set(hasWorktreeAndRepo);
    }));
  }
};
ApplyChangesToParentRepoContribution.ID = "sessions.contrib.applyChangesToParentRepo";
ApplyChangesToParentRepoContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ISessionsService)
], ApplyChangesToParentRepoContribution);
const _ApplyChangesToParentRepoAction = class _ApplyChangesToParentRepoAction extends Action2 {
  constructor() {
    super({
      id: _ApplyChangesToParentRepoAction.ID,
      title: localize2("applyChangesToParentRepo", "Apply Changes to Parent Repository"),
      icon: Codicon.desktopDownload,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        IsSessionsWindowContext,
        hasWorktreeAndRepositoryContextKey
      ),
      menu: [
        {
          id: MenuId.AgentsChangesPrimaryActionSubMenu,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(
            ContextKeyExpr.false(),
            IsSessionsWindowContext,
            hasWorktreeAndRepositoryContextKey
          )
        }
      ]
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const logService = accessor.get(ILogService);
    const openerService = accessor.get(IOpenerService);
    const productService = accessor.get(IProductService);
    const activeSession = sessionsService.activeSession.get();
    const folder = activeSession?.workspace.get()?.folders[0];
    if (!activeSession || !folder?.gitRepository?.workTreeUri) {
      return;
    }
    const worktreeRoot = folder.gitRepository.workTreeUri;
    const repoRoot = folder.root;
    const openFolderAction = toAction({
      id: "applyChangesToParentRepo.openFolder",
      label: localize("openInVSCode", "Open in VS Code"),
      run: () => {
        const scheme = productService.quality === "stable" ? "vscode" : productService.quality === "exploration" ? "vscode-exploration" : "vscode-insiders";
        const params = new URLSearchParams();
        params.set("windowId", "_blank");
        params.set("session", activeSession.resource.toString());
        openerService.open(URI.from({
          scheme,
          authority: Schemas.file,
          path: repoRoot.path,
          query: params.toString()
        }), { openExternal: true });
      }
    });
    try {
      const worktreeBranch = await commandService.executeCommand(
        "_git.revParseAbbrevRef",
        worktreeRoot.fsPath
      );
      if (!worktreeBranch) {
        notificationService.notify({
          severity: Severity.Warning,
          message: localize("applyChangesNoBranch", "Could not determine worktree branch name.")
        });
        return;
      }
      const result = await commandService.executeCommand("_git.mergeBranch", repoRoot.fsPath, worktreeBranch);
      if (!result) {
        logService.warn("[ApplyChangesToParentRepo] No result from merge command");
      } else {
        notificationService.notify({
          severity: Severity.Info,
          message: typeof result === "string" && result.startsWith("Already up to date") ? localize("alreadyUpToDate", "Parent repository is up to date with worktree.") : localize("applyChangesSuccess", "Applied changes to parent repository."),
          actions: { primary: [openFolderAction] }
        });
      }
    } catch (err) {
      logService.error("[ApplyChangesToParentRepo] Failed to apply changes", err);
      notificationService.notify({
        severity: Severity.Warning,
        message: localize("applyChangesConflict", "Failed to apply changes to parent repo. The parent repo may have diverged \u2014 resolve conflicts manually."),
        actions: { primary: [openFolderAction] }
      });
    }
  }
};
_ApplyChangesToParentRepoAction.ID = "chatEditing.applyChangesToParentRepo";
let ApplyChangesToParentRepoAction = _ApplyChangesToParentRepoAction;
registerAction2(ApplyChangesToParentRepoAction);
registerWorkbenchContribution2(ApplyChangesToParentRepoContribution.ID, ApplyChangesToParentRepoContribution, WorkbenchPhase.AfterRestored);
MenuRegistry.appendMenuItem(MenuId.AgentsChangesToolbar, {
  submenu: MenuId.AgentsChangesPrimaryActionSubMenu,
  title: localize2("applyActions", "Apply Actions"),
  group: "navigation",
  order: 1,
  when: ContextKeyExpr.and(
    IsSessionsWindowContext,
    SessionIsArchivedContext.isEqualTo(false)
  )
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXBwbHlDb21taXRzVG9QYXJlbnRSZXBvXFxicm93c2VyXFxhcHBseUNoYW5nZXNUb1BhcmVudFJlcG8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0IGhhc1dvcmt0cmVlQW5kUmVwb3NpdG9yeUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWdlbnRTZXNzaW9uSGFzV29ya3RyZWVBbmRSZXBvc2l0b3J5JywgZmFsc2UsIHtcblx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbkhhc1dvcmt0cmVlQW5kUmVwb3NpdG9yeScsIFwiVHJ1ZSB3aGVuIHRoZSBhY3RpdmUgYWdlbnQgc2Vzc2lvbiBoYXMgYm90aCBhIHdvcmt0cmVlIGFuZCBhIHBhcmVudCByZXBvc2l0b3J5LlwiKVxufSk7XG5cbmNsYXNzIEFwcGx5Q2hhbmdlc1RvUGFyZW50UmVwb0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi5hcHBseUNoYW5nZXNUb1BhcmVudFJlcG8nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCB3b3JrdHJlZUFuZFJlcG9LZXkgPSBoYXNXb3JrdHJlZUFuZFJlcG9zaXRvcnlDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXTtcblx0XHRcdGNvbnN0IGhhc1dvcmt0cmVlQW5kUmVwbyA9ICEhZm9sZGVyPy5naXRSZXBvc2l0b3J5Py53b3JrVHJlZVVyaTtcblx0XHRcdHdvcmt0cmVlQW5kUmVwb0tleS5zZXQoaGFzV29ya3RyZWVBbmRSZXBvKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgQXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0RWRpdGluZy5hcHBseUNoYW5nZXNUb1BhcmVudFJlcG8nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBcHBseUNoYW5nZXNUb1BhcmVudFJlcG9BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhcHBseUNoYW5nZXNUb1BhcmVudFJlcG8nLCAnQXBwbHkgQ2hhbmdlcyB0byBQYXJlbnQgUmVwb3NpdG9yeScpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kZXNrdG9wRG93bmxvYWQsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0aGFzV29ya3RyZWVBbmRSZXBvc2l0b3J5Q29udGV4dEtleSxcblx0XHRcdCksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkFnZW50c0NoYW5nZXNQcmltYXJ5QWN0aW9uU3ViTWVudSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmZhbHNlKCksXG5cdFx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0XHRcdGhhc1dvcmt0cmVlQW5kUmVwb3NpdG9yeUNvbnRleHRLZXlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgZm9sZGVyID0gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbiB8fCAhZm9sZGVyPy5naXRSZXBvc2l0b3J5Py53b3JrVHJlZVVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmt0cmVlUm9vdCA9IGZvbGRlci5naXRSZXBvc2l0b3J5LndvcmtUcmVlVXJpO1xuXHRcdGNvbnN0IHJlcG9Sb290ID0gZm9sZGVyLnJvb3Q7XG5cblx0XHRjb25zdCBvcGVuRm9sZGVyQWN0aW9uID0gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdhcHBseUNoYW5nZXNUb1BhcmVudFJlcG8ub3BlbkZvbGRlcicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW5JblZTQ29kZScsIFwiT3BlbiBpbiBWUyBDb2RlXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNjaGVtZSA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnXG5cdFx0XHRcdFx0PyAndnNjb2RlJ1xuXHRcdFx0XHRcdDogcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ2V4cGxvcmF0aW9uJ1xuXHRcdFx0XHRcdFx0PyAndnNjb2RlLWV4cGxvcmF0aW9uJ1xuXHRcdFx0XHRcdFx0OiAndnNjb2RlLWluc2lkZXJzJztcblxuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0XHRcdHBhcmFtcy5zZXQoJ3dpbmRvd0lkJywgJ19ibGFuaycpO1xuXHRcdFx0XHRwYXJhbXMuc2V0KCdzZXNzaW9uJywgYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRvcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLmZyb20oe1xuXHRcdFx0XHRcdHNjaGVtZSxcblx0XHRcdFx0XHRhdXRob3JpdHk6IFNjaGVtYXMuZmlsZSxcblx0XHRcdFx0XHRwYXRoOiByZXBvUm9vdC5wYXRoLFxuXHRcdFx0XHRcdHF1ZXJ5OiBwYXJhbXMudG9TdHJpbmcoKSxcblx0XHRcdFx0fSksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIEdldCB0aGUgd29ya3RyZWUgYnJhbmNoIG5hbWUuIFNpbmNlIHRoZSB3b3JrdHJlZSBhbmQgcGFyZW50IHJlcG9cblx0XHRcdC8vIHNoYXJlIHRoZSBzYW1lIGdpdCBvYmplY3Qgc3RvcmUsIHRoZSBwYXJlbnQgY2FuIGRpcmVjdGx5IHJlZmVyZW5jZVxuXHRcdFx0Ly8gdGhpcyBicmFuY2ggZm9yIGEgbWVyZ2UuXG5cdFx0XHRjb25zdCB3b3JrdHJlZUJyYW5jaCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPHN0cmluZz4oXG5cdFx0XHRcdCdfZ2l0LnJldlBhcnNlQWJicmV2UmVmJyxcblx0XHRcdFx0d29ya3RyZWVSb290LmZzUGF0aFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKCF3b3JrdHJlZUJyYW5jaCkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2FwcGx5Q2hhbmdlc05vQnJhbmNoJywgXCJDb3VsZCBub3QgZGV0ZXJtaW5lIHdvcmt0cmVlIGJyYW5jaCBuYW1lLlwiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWVyZ2UgdGhlIHdvcmt0cmVlIGJyYW5jaCBpbnRvIHRoZSBwYXJlbnQgcmVwby5cblx0XHRcdC8vIFRoaXMgaXMgaWRlbXBvdGVudDogaWYgYWxyZWFkeSBtZXJnZWQsIGdpdCBzYXlzIFwiQWxyZWFkeSB1cCB0byBkYXRlLlwiXG5cdFx0XHQvLyBJZiBuZXcgY29tbWl0cyBleGlzdCwgdGhleSdyZSBicm91Z2h0IGluLiBIYW5kbGVzIHBhcnRpYWwgYXBwbGllcyBuYXR1cmFsbHkuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX2dpdC5tZXJnZUJyYW5jaCcsIHJlcG9Sb290LmZzUGF0aCwgd29ya3RyZWVCcmFuY2gpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKCdbQXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvXSBObyByZXN1bHQgZnJvbSBtZXJnZSBjb21tYW5kJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bWVzc2FnZTogdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgJiYgcmVzdWx0LnN0YXJ0c1dpdGgoJ0FscmVhZHkgdXAgdG8gZGF0ZScpXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhbHJlYWR5VXBUb0RhdGUnLCAnUGFyZW50IHJlcG9zaXRvcnkgaXMgdXAgdG8gZGF0ZSB3aXRoIHdvcmt0cmVlLicpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhcHBseUNoYW5nZXNTdWNjZXNzJywgJ0FwcGxpZWQgY2hhbmdlcyB0byBwYXJlbnQgcmVwb3NpdG9yeS4nKSxcblx0XHRcdFx0XHRhY3Rpb25zOiB7IHByaW1hcnk6IFtvcGVuRm9sZGVyQWN0aW9uXSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignW0FwcGx5Q2hhbmdlc1RvUGFyZW50UmVwb10gRmFpbGVkIHRvIGFwcGx5IGNoYW5nZXMnLCBlcnIpO1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2FwcGx5Q2hhbmdlc0NvbmZsaWN0JywgXCJGYWlsZWQgdG8gYXBwbHkgY2hhbmdlcyB0byBwYXJlbnQgcmVwby4gVGhlIHBhcmVudCByZXBvIG1heSBoYXZlIGRpdmVyZ2VkIFx1MjAxNCByZXNvbHZlIGNvbmZsaWN0cyBtYW51YWxseS5cIiksXG5cdFx0XHRcdGFjdGlvbnM6IHsgcHJpbWFyeTogW29wZW5Gb2xkZXJBY3Rpb25dIH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvQWN0aW9uKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBcHBseUNoYW5nZXNUb1BhcmVudFJlcG9Db250cmlidXRpb24uSUQsIEFwcGx5Q2hhbmdlc1RvUGFyZW50UmVwb0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbi8vIFJlZ2lzdGVyIHRoZSBhcHBseSBzdWJtZW51IGluIHRoZSBzZXNzaW9uIGNoYW5nZXMgdG9vbGJhclxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5BZ2VudHNDaGFuZ2VzVG9vbGJhciwge1xuXHRzdWJtZW51OiBNZW51SWQuQWdlbnRzQ2hhbmdlc1ByaW1hcnlBY3Rpb25TdWJNZW51LFxuXHR0aXRsZTogbG9jYWxpemUyKCdhcHBseUFjdGlvbnMnLCAnQXBwbHkgQWN0aW9ucycpLFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5pc0VxdWFsVG8o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
