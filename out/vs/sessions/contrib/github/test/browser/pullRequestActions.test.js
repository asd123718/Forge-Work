import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { isIMenuItem, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { Menus } from "../../../../browser/menus.js";
import { SessionHasPullRequestContext } from "../../../../common/contextkeys.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import "../../browser/pullRequestActions.js";
function createSessionWithPullRequest(pullRequestUri) {
  const workspaceUri = URI.from({ scheme: "test", path: "/workspace" });
  const workspace = {
    uri: workspaceUri,
    label: "workspace",
    icon: Codicon.folder,
    folders: [{
      root: workspaceUri,
      workingDirectory: workspaceUri,
      name: "workspace",
      description: void 0,
      gitRepository: pullRequestUri ? {
        uri: workspaceUri,
        workTreeUri: void 0,
        baseBranchName: void 0,
        gitHubInfo: constObservable({
          owner: "owner",
          repo: "repo",
          pullRequest: { number: 1, uri: pullRequestUri }
        })
      } : void 0
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.workspace = constObservable(workspace);
    }
  }();
}
suite("Pull Request Actions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Open Pull Request and Copy Pull Request URL are contributed to a dedicated context menu group", () => {
    const items = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu).filter(isIMenuItem).filter((item) => item.command.id === "workbench.agentSessions.action.openPullRequest" || item.command.id === "workbench.agentSessions.action.copyPullRequestUrl");
    assert.deepStrictEqual(items.map((item) => ({
      id: item.command.id,
      group: item.group,
      order: item.order,
      hasPullRequestGate: (item.when?.serialize() ?? "").includes(SessionHasPullRequestContext.key)
    })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [
      { id: "workbench.agentSessions.action.openPullRequest", group: "2_pullRequest", order: 0, hasPullRequestGate: true },
      { id: "workbench.agentSessions.action.copyPullRequestUrl", group: "2_pullRequest", order: 1, hasPullRequestGate: true }
    ]);
  });
  test("Copy Pull Request URL writes the pull request URL to the clipboard", async () => {
    const pullRequestUri = URI.parse("https://github.com/owner/repo/pull/1");
    const session = createSessionWithPullRequest(pullRequestUri);
    const instantiationService = new TestInstantiationService();
    const clipboardService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.writes = [];
      }
      async writeText(text) {
        this.writes.push(text);
      }
    }();
    instantiationService.stub(IClipboardService, clipboardService);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(void 0);
      }
    }());
    await instantiationService.invokeFunction((accessor) => CommandsRegistry.getCommand("workbench.agentSessions.action.copyPullRequestUrl").handler(accessor, session));
    assert.deepStrictEqual(clipboardService.writes, [pullRequestUri.toString(true)]);
  });
  test("Copy Pull Request URL is a no-op when the session has no pull request", async () => {
    const session = createSessionWithPullRequest(void 0);
    const instantiationService = new TestInstantiationService();
    const clipboardService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.writes = [];
      }
      async writeText(text) {
        this.writes.push(text);
      }
    }();
    instantiationService.stub(IClipboardService, clipboardService);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(void 0);
      }
    }());
    await instantiationService.invokeFunction((accessor) => CommandsRegistry.getCommand("workbench.agentSessions.action.copyPullRequestUrl").handler(accessor, session));
    assert.deepStrictEqual(clipboardService.writes, []);
  });
  test("Open Pull Request opens the pull request URL externally", async () => {
    const pullRequestUri = URI.parse("https://github.com/owner/repo/pull/1");
    const session = createSessionWithPullRequest(pullRequestUri);
    const instantiationService = new TestInstantiationService();
    const openerService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.opened = [];
      }
      async open(resource, options) {
        this.opened.push({ resource, openExternal: options?.openExternal });
        return true;
      }
    }();
    instantiationService.stub(IOpenerService, openerService);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(void 0);
      }
    }());
    await instantiationService.invokeFunction((accessor) => CommandsRegistry.getCommand("workbench.agentSessions.action.openPullRequest").handler(accessor, session));
    assert.deepStrictEqual(openerService.opened, [{ resource: pullRequestUri, openExternal: true }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFx0ZXN0XFxicm93c2VyXFxwdWxsUmVxdWVzdEFjdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSGFzUHVsbFJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvcHVsbFJlcXVlc3RBY3Rpb25zLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbldpdGhQdWxsUmVxdWVzdChwdWxsUmVxdWVzdFVyaTogVVJJIHwgdW5kZWZpbmVkKTogSVNlc3Npb24ge1xuXHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnL3dvcmtzcGFjZScgfSk7XG5cdGNvbnN0IHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgPSB7XG5cdFx0dXJpOiB3b3Jrc3BhY2VVcmksXG5cdFx0bGFiZWw6ICd3b3Jrc3BhY2UnLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRyb290OiB3b3Jrc3BhY2VVcmksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2VVcmksXG5cdFx0XHRuYW1lOiAnd29ya3NwYWNlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRSZXBvc2l0b3J5OiBwdWxsUmVxdWVzdFVyaSA/IHtcblx0XHRcdFx0dXJpOiB3b3Jrc3BhY2VVcmksXG5cdFx0XHRcdHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHRcdFx0b3duZXI6ICdvd25lcicsXG5cdFx0XHRcdFx0cmVwbzogJ3JlcG8nLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0OiB7IG51bWJlcjogMSwgdXJpOiBwdWxsUmVxdWVzdFVyaSB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0fV0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdvcmtzcGFjZSA9IGNvbnN0T2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4od29ya3NwYWNlKTtcblx0fTtcbn1cblxuc3VpdGUoJ1B1bGwgUmVxdWVzdCBBY3Rpb25zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ09wZW4gUHVsbCBSZXF1ZXN0IGFuZCBDb3B5IFB1bGwgUmVxdWVzdCBVUkwgYXJlIGNvbnRyaWJ1dGVkIHRvIGEgZGVkaWNhdGVkIGNvbnRleHQgbWVudSBncm91cCcsICgpID0+IHtcblx0XHRjb25zdCBpdGVtcyA9IE1lbnVSZWdpc3RyeS5nZXRNZW51SXRlbXMoTWVudXMuU2Vzc2lvbkl0ZW1Db250ZXh0TWVudSlcblx0XHRcdC5maWx0ZXIoaXNJTWVudUl0ZW0pXG5cdFx0XHQuZmlsdGVyKGl0ZW0gPT4gaXRlbS5jb21tYW5kLmlkID09PSAnd29ya2JlbmNoLmFnZW50U2Vzc2lvbnMuYWN0aW9uLm9wZW5QdWxsUmVxdWVzdCcgfHwgaXRlbS5jb21tYW5kLmlkID09PSAnd29ya2JlbmNoLmFnZW50U2Vzc2lvbnMuYWN0aW9uLmNvcHlQdWxsUmVxdWVzdFVybCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0aWQ6IGl0ZW0uY29tbWFuZC5pZCxcblx0XHRcdGdyb3VwOiBpdGVtLmdyb3VwLFxuXHRcdFx0b3JkZXI6IGl0ZW0ub3JkZXIsXG5cdFx0XHRoYXNQdWxsUmVxdWVzdEdhdGU6IChpdGVtLndoZW4/LnNlcmlhbGl6ZSgpID8/ICcnKS5pbmNsdWRlcyhTZXNzaW9uSGFzUHVsbFJlcXVlc3RDb250ZXh0LmtleSksXG5cdFx0fSkpLnNvcnQoKGEsIGIpID0+IChhLm9yZGVyID8/IDApIC0gKGIub3JkZXIgPz8gMCkpLCBbXG5cdFx0XHR7IGlkOiAnd29ya2JlbmNoLmFnZW50U2Vzc2lvbnMuYWN0aW9uLm9wZW5QdWxsUmVxdWVzdCcsIGdyb3VwOiAnMl9wdWxsUmVxdWVzdCcsIG9yZGVyOiAwLCBoYXNQdWxsUmVxdWVzdEdhdGU6IHRydWUgfSxcblx0XHRcdHsgaWQ6ICd3b3JrYmVuY2guYWdlbnRTZXNzaW9ucy5hY3Rpb24uY29weVB1bGxSZXF1ZXN0VXJsJywgZ3JvdXA6ICcyX3B1bGxSZXF1ZXN0Jywgb3JkZXI6IDEsIGhhc1B1bGxSZXF1ZXN0R2F0ZTogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3B5IFB1bGwgUmVxdWVzdCBVUkwgd3JpdGVzIHRoZSBwdWxsIHJlcXVlc3QgVVJMIHRvIHRoZSBjbGlwYm9hcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RVcmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvMScpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uV2l0aFB1bGxSZXF1ZXN0KHB1bGxSZXF1ZXN0VXJpKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDbGlwYm9hcmRTZXJ2aWNlPigpIHtcblx0XHRcdHJlYWRvbmx5IHdyaXRlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHdyaXRlVGV4dCh0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dGhpcy53cml0ZXMucHVzaCh0ZXh0KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsaXBib2FyZFNlcnZpY2UsIGNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFnZW50U2Vzc2lvbnMuYWN0aW9uLmNvcHlQdWxsUmVxdWVzdFVybCcpIS5oYW5kbGVyKGFjY2Vzc29yLCBzZXNzaW9uKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsaXBib2FyZFNlcnZpY2Uud3JpdGVzLCBbcHVsbFJlcXVlc3RVcmkudG9TdHJpbmcodHJ1ZSldKTtcblx0fSk7XG5cblx0dGVzdCgnQ29weSBQdWxsIFJlcXVlc3QgVVJMIGlzIGEgbm8tb3Agd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm8gcHVsbCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uV2l0aFB1bGxSZXF1ZXN0KHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2xpcGJvYXJkU2VydmljZT4oKSB7XG5cdFx0XHRyZWFkb25seSB3cml0ZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRvdmVycmlkZSBhc3luYyB3cml0ZVRleHQodGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoaXMud3JpdGVzLnB1c2godGV4dCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDbGlwYm9hcmRTZXJ2aWNlLCBjbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zLmFjdGlvbi5jb3B5UHVsbFJlcXVlc3RVcmwnKSEuaGFuZGxlcihhY2Nlc3Nvciwgc2Vzc2lvbikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGlwYm9hcmRTZXJ2aWNlLndyaXRlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdPcGVuIFB1bGwgUmVxdWVzdCBvcGVucyB0aGUgcHVsbCByZXF1ZXN0IFVSTCBleHRlcm5hbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0VXJpID0gVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzEnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbldpdGhQdWxsUmVxdWVzdChwdWxsUmVxdWVzdFVyaSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJT3BlbmVyU2VydmljZT4oKSB7XG5cdFx0XHRyZWFkb25seSBvcGVuZWQ6IHsgcmVhZG9ubHkgcmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgb3BlbkV4dGVybmFsOiBib29sZWFuIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbihyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyByZWFkb25seSBvcGVuRXh0ZXJuYWw/OiBib29sZWFuIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0dGhpcy5vcGVuZWQucHVzaCh7IHJlc291cmNlLCBvcGVuRXh0ZXJuYWw6IG9wdGlvbnM/Lm9wZW5FeHRlcm5hbCB9KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElPcGVuZXJTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zLmFjdGlvbi5vcGVuUHVsbFJlcXVlc3QnKSEuaGFuZGxlcihhY2Nlc3Nvciwgc2Vzc2lvbikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZXJTZXJ2aWNlLm9wZW5lZCwgW3sgcmVzb3VyY2U6IHB1bGxSZXF1ZXN0VXJpLCBvcGVuRXh0ZXJuYWw6IHRydWUgfV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYSxvQkFBb0I7QUFDMUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7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
