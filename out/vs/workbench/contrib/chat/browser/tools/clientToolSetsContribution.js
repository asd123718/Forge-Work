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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { browserChatToolReferenceNames } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
let ClientToolSetsContribution = class extends Disposable {
  constructor(toolsService, workspaceService) {
    super();
    if (!workspaceService.isSessionsWindow) {
      this._register(this._registerDynamicToolSet(toolsService, {
        id: "vscode-tasks",
        referenceName: "vscodeTasks",
        icon: Codicon.tasklist,
        description: localize("clientToolSet.tasks.description", "Tasks and Problems"),
        detail: localize("clientToolSet.tasks.detail", "Create and run tasks and inspect workspace problems."),
        members: [
          "createAndRunTask",
          "runTask",
          "getTaskOutput",
          "problems"
        ]
      }));
    }
    if (workspaceService.isSessionsWindow) {
      this._register(this._registerDynamicToolSet(toolsService, {
        id: "vscode-automations",
        referenceName: "vscodeAutomations",
        icon: Codicon.watch,
        description: localize("clientToolSet.automations.description", "Automations"),
        detail: localize("clientToolSet.automations.detail", "List, configure, run, and delete scheduled agent automations."),
        members: [
          "listAutomations",
          "configureAutomation",
          "runAutomation",
          "deleteAutomation"
        ]
      }));
    }
    this._register(this._registerDynamicToolSet(toolsService, {
      id: "vscode-browser",
      referenceName: "vscodeBrowser",
      icon: Codicon.browser,
      description: localize("clientToolSet.browser.description", "Integrated Browser"),
      detail: localize("clientToolSet.browser.detail", "Open, navigate, and inspect pages in the built-in browser."),
      members: browserChatToolReferenceNames
    }));
    this._register(this._registerDynamicToolSet(toolsService, {
      id: "vscode-general",
      referenceName: "vscodeGeneral",
      icon: Codicon.vscode,
      description: localize("clientToolSet.vscode.description", "VS Code"),
      detail: localize("clientToolSet.vscode.detail", "Navigate code, manage extensions, and run built-in VS Code commands."),
      members: [
        ...workspaceService.isSessionsWindow ? [] : ["runTests", "testFailure", "rename", "usages"],
        "toolSearch"
      ]
    }));
    if (!workspaceService.isSessionsWindow) {
      this._register(this._registerDynamicToolSet(toolsService, {
        id: "vscode-notebooks",
        referenceName: "vscodeNotebooks",
        icon: Codicon.notebook,
        description: localize("clientToolSet.notebooks.description", "Jupyter Notebooks"),
        detail: localize("clientToolSet.notebooks.detail", "Create and edit Jupyter notebooks and run their cells."),
        members: [
          "createJupyterNotebook",
          "editNotebook",
          "runNotebookCell",
          "getNotebookSummary",
          "readNotebookCellOutput"
        ]
      }));
    }
  }
  /**
   * Creates a tool set and keeps its membership in sync with the tools registered under the
   * reference names in {@link IDynamicToolSetSpec.members}. Returns a disposable that removes the
   * tool set and all of its member registrations.
   */
  _registerDynamicToolSet(toolsService, spec) {
    const store = new DisposableStore();
    const toolSet = store.add(toolsService.createToolSet(
      ToolDataSource.Internal,
      spec.id,
      spec.referenceName,
      {
        icon: spec.icon,
        description: spec.description,
        detail: spec.detail,
        hiddenInToolsPicker: true
      }
    ));
    const members = /* @__PURE__ */ new Map();
    const reconcile = () => {
      for (const name of spec.members) {
        const tool = toolsService.getToolByName(name) ?? toolsService.getTool(name);
        const existing = members.get(name);
        if (tool === existing?.tool) {
          continue;
        }
        existing?.disposable.dispose();
        members.delete(name);
        if (tool) {
          members.set(name, { tool, disposable: toolSet.addTool(tool) });
        }
      }
    };
    store.add(toolsService.onDidChangeTools(() => reconcile()));
    store.add(toDisposable(() => {
      for (const { disposable } of members.values()) {
        disposable.dispose();
      }
      members.clear();
    }));
    reconcile();
    return store;
  }
};
ClientToolSetsContribution.ID = "workbench.contrib.chat.clientToolSets";
ClientToolSetsContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IAICustomizationWorkspaceService)
], ClientToolSetsContribution);
export {
  ClientToolSetsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFxjbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBicm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG4vKipcbiAqIERlc2NyaWJlcyBhIHRvb2wgc2V0IHdob3NlIG1lbWJlcnNoaXAgaXMgcmVzb2x2ZWQgZHluYW1pY2FsbHkgZnJvbSBhIGxpc3Qgb2YgdG9vbCByZWZlcmVuY2UgbmFtZXMuXG4gKi9cbmludGVyZmFjZSBJRHluYW1pY1Rvb2xTZXRTcGVjIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVmZXJlbmNlTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldGFpbDogc3RyaW5nO1xuXHRyZWFkb25seSBtZW1iZXJzOiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBDb250cmlidXRlcyB0aGUgYnVpbHQtaW4gXCJjbGllbnRcIiB0b29sIHNldHMgc3VyZmFjZWQgYXMgcm93cyBpbiB0aGUgQ2hhdCBDdXN0b21pemF0aW9ucyBcdTIxOTIgVG9vbHMgc2VjdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIENsaWVudFRvb2xTZXRzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdC5jbGllbnRUb29sU2V0cyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIHdvcmtzcGFjZVNlcnZpY2U6IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCF3b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdGVyRHluYW1pY1Rvb2xTZXQodG9vbHNTZXJ2aWNlLCB7XG5cdFx0XHRcdGlkOiAndnNjb2RlLXRhc2tzJyxcblx0XHRcdFx0cmVmZXJlbmNlTmFtZTogJ3ZzY29kZVRhc2tzJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi50YXNrbGlzdCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGllbnRUb29sU2V0LnRhc2tzLmRlc2NyaXB0aW9uJywgXCJUYXNrcyBhbmQgUHJvYmxlbXNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NsaWVudFRvb2xTZXQudGFza3MuZGV0YWlsJywgXCJDcmVhdGUgYW5kIHJ1biB0YXNrcyBhbmQgaW5zcGVjdCB3b3Jrc3BhY2UgcHJvYmxlbXMuXCIpLFxuXHRcdFx0XHRtZW1iZXJzOiBbXG5cdFx0XHRcdFx0J2NyZWF0ZUFuZFJ1blRhc2snLFxuXHRcdFx0XHRcdCdydW5UYXNrJyxcblx0XHRcdFx0XHQnZ2V0VGFza091dHB1dCcsXG5cdFx0XHRcdFx0J3Byb2JsZW1zJyxcblx0XHRcdFx0XSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAod29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZWdpc3RlckR5bmFtaWNUb29sU2V0KHRvb2xzU2VydmljZSwge1xuXHRcdFx0XHRpZDogJ3ZzY29kZS1hdXRvbWF0aW9ucycsXG5cdFx0XHRcdHJlZmVyZW5jZU5hbWU6ICd2c2NvZGVBdXRvbWF0aW9ucycsXG5cdFx0XHRcdGljb246IENvZGljb24ud2F0Y2gsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xpZW50VG9vbFNldC5hdXRvbWF0aW9ucy5kZXNjcmlwdGlvbicsIFwiQXV0b21hdGlvbnNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NsaWVudFRvb2xTZXQuYXV0b21hdGlvbnMuZGV0YWlsJywgXCJMaXN0LCBjb25maWd1cmUsIHJ1biwgYW5kIGRlbGV0ZSBzY2hlZHVsZWQgYWdlbnQgYXV0b21hdGlvbnMuXCIpLFxuXHRcdFx0XHRtZW1iZXJzOiBbXG5cdFx0XHRcdFx0J2xpc3RBdXRvbWF0aW9ucycsXG5cdFx0XHRcdFx0J2NvbmZpZ3VyZUF1dG9tYXRpb24nLFxuXHRcdFx0XHRcdCdydW5BdXRvbWF0aW9uJyxcblx0XHRcdFx0XHQnZGVsZXRlQXV0b21hdGlvbicsXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVnaXN0ZXJEeW5hbWljVG9vbFNldCh0b29sc1NlcnZpY2UsIHtcblx0XHRcdGlkOiAndnNjb2RlLWJyb3dzZXInLFxuXHRcdFx0cmVmZXJlbmNlTmFtZTogJ3ZzY29kZUJyb3dzZXInLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5icm93c2VyLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGllbnRUb29sU2V0LmJyb3dzZXIuZGVzY3JpcHRpb24nLCBcIkludGVncmF0ZWQgQnJvd3NlclwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NsaWVudFRvb2xTZXQuYnJvd3Nlci5kZXRhaWwnLCBcIk9wZW4sIG5hdmlnYXRlLCBhbmQgaW5zcGVjdCBwYWdlcyBpbiB0aGUgYnVpbHQtaW4gYnJvd3Nlci5cIiksXG5cdFx0XHRtZW1iZXJzOiBicm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcyxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZWdpc3RlckR5bmFtaWNUb29sU2V0KHRvb2xzU2VydmljZSwge1xuXHRcdFx0aWQ6ICd2c2NvZGUtZ2VuZXJhbCcsXG5cdFx0XHRyZWZlcmVuY2VOYW1lOiAndnNjb2RlR2VuZXJhbCcsXG5cdFx0XHRpY29uOiBDb2RpY29uLnZzY29kZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xpZW50VG9vbFNldC52c2NvZGUuZGVzY3JpcHRpb24nLCBcIlZTIENvZGVcIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjbGllbnRUb29sU2V0LnZzY29kZS5kZXRhaWwnLCBcIk5hdmlnYXRlIGNvZGUsIG1hbmFnZSBleHRlbnNpb25zLCBhbmQgcnVuIGJ1aWx0LWluIFZTIENvZGUgY29tbWFuZHMuXCIpLFxuXHRcdFx0bWVtYmVyczogW1xuXHRcdFx0XHQuLi4od29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93ID8gW10gOiBbJ3J1blRlc3RzJywgJ3Rlc3RGYWlsdXJlJywgJ3JlbmFtZScsICd1c2FnZXMnXSksXG5cdFx0XHRcdCd0b29sU2VhcmNoJyxcblx0XHRcdF0sXG5cdFx0fSkpO1xuXG5cdFx0aWYgKCF3b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdGVyRHluYW1pY1Rvb2xTZXQodG9vbHNTZXJ2aWNlLCB7XG5cdFx0XHRcdGlkOiAndnNjb2RlLW5vdGVib29rcycsXG5cdFx0XHRcdHJlZmVyZW5jZU5hbWU6ICd2c2NvZGVOb3RlYm9va3MnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLm5vdGVib29rLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsaWVudFRvb2xTZXQubm90ZWJvb2tzLmRlc2NyaXB0aW9uJywgXCJKdXB5dGVyIE5vdGVib29rc1wiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2xpZW50VG9vbFNldC5ub3RlYm9va3MuZGV0YWlsJywgXCJDcmVhdGUgYW5kIGVkaXQgSnVweXRlciBub3RlYm9va3MgYW5kIHJ1biB0aGVpciBjZWxscy5cIiksXG5cdFx0XHRcdG1lbWJlcnM6IFtcblx0XHRcdFx0XHQnY3JlYXRlSnVweXRlck5vdGVib29rJyxcblx0XHRcdFx0XHQnZWRpdE5vdGVib29rJyxcblx0XHRcdFx0XHQncnVuTm90ZWJvb2tDZWxsJyxcblx0XHRcdFx0XHQnZ2V0Tm90ZWJvb2tTdW1tYXJ5Jyxcblx0XHRcdFx0XHQncmVhZE5vdGVib29rQ2VsbE91dHB1dCcsXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSB0b29sIHNldCBhbmQga2VlcHMgaXRzIG1lbWJlcnNoaXAgaW4gc3luYyB3aXRoIHRoZSB0b29scyByZWdpc3RlcmVkIHVuZGVyIHRoZVxuXHQgKiByZWZlcmVuY2UgbmFtZXMgaW4ge0BsaW5rIElEeW5hbWljVG9vbFNldFNwZWMubWVtYmVyc30uIFJldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgcmVtb3ZlcyB0aGVcblx0ICogdG9vbCBzZXQgYW5kIGFsbCBvZiBpdHMgbWVtYmVyIHJlZ2lzdHJhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlckR5bmFtaWNUb29sU2V0KHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHNwZWM6IElEeW5hbWljVG9vbFNldFNwZWMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCB0b29sU2V0ID0gc3RvcmUuYWRkKHRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRzcGVjLmlkLFxuXHRcdFx0c3BlYy5yZWZlcmVuY2VOYW1lLFxuXHRcdFx0e1xuXHRcdFx0XHRpY29uOiBzcGVjLmljb24sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBzcGVjLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRkZXRhaWw6IHNwZWMuZGV0YWlsLFxuXHRcdFx0XHRoaWRkZW5JblRvb2xzUGlja2VyOiB0cnVlLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0LyoqIFRyYWNrcyB0aGUgY3VycmVudGx5LWFkZGVkIG1lbWJlciB0b29scyBzbyBtZW1iZXJzaGlwIGNhbiBiZSByZWNvbmNpbGVkIG9uIGNoYW5nZS4gKi9cblx0XHRjb25zdCBtZW1iZXJzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgdG9vbDogSVRvb2xEYXRhOyByZWFkb25seSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9PigpO1xuXHRcdGNvbnN0IHJlY29uY2lsZSA9ICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgbmFtZSBvZiBzcGVjLm1lbWJlcnMpIHtcblx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzU2VydmljZS5nZXRUb29sQnlOYW1lKG5hbWUpID8/IHRvb2xzU2VydmljZS5nZXRUb29sKG5hbWUpO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IG1lbWJlcnMuZ2V0KG5hbWUpO1xuXHRcdFx0XHRpZiAodG9vbCA9PT0gZXhpc3Rpbmc/LnRvb2wpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleGlzdGluZz8uZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdG1lbWJlcnMuZGVsZXRlKG5hbWUpO1xuXHRcdFx0XHRpZiAodG9vbCkge1xuXHRcdFx0XHRcdG1lbWJlcnMuc2V0KG5hbWUsIHsgdG9vbCwgZGlzcG9zYWJsZTogdG9vbFNldC5hZGRUb29sKHRvb2wpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2Uub25EaWRDaGFuZ2VUb29scygoKSA9PiByZWNvbmNpbGUoKSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB7IGRpc3Bvc2FibGUgfSBvZiBtZW1iZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0bWVtYmVycy5jbGVhcigpO1xuXHRcdH0pKTtcblx0XHRyZWNvbmNpbGUoKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFFdkUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyw0QkFBdUMsc0JBQXNCO0FBaUIvRCxJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFHNUYsWUFDNkIsY0FDTSxrQkFDakM7QUFDRCxVQUFNO0FBRU4sUUFBSSxDQUFDLGlCQUFpQixrQkFBa0I7QUFDdkMsV0FBSyxVQUFVLEtBQUssd0JBQXdCLGNBQWM7QUFBQSxRQUN6RCxJQUFJO0FBQUEsUUFDSixlQUFlO0FBQUEsUUFDZixNQUFNLFFBQVE7QUFBQSxRQUNkLGFBQWEsU0FBUyxtQ0FBbUMsb0JBQW9CO0FBQUEsUUFDN0UsUUFBUSxTQUFTLDhCQUE4QixzREFBc0Q7QUFBQSxRQUNyRyxTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxRQUFJLGlCQUFpQixrQkFBa0I7QUFDdEMsV0FBSyxVQUFVLEtBQUssd0JBQXdCLGNBQWM7QUFBQSxRQUN6RCxJQUFJO0FBQUEsUUFDSixlQUFlO0FBQUEsUUFDZixN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
