import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { ClientToolSetsContribution } from "../../../browser/tools/clientToolSetsContribution.js";
import { LanguageModelToolsService } from "../../../browser/tools/languageModelToolsService.js";
import { createToolSetFileContents, deleteToolSetFromFileContents, getEnabledSelectionReferences } from "../../../browser/tools/toolSetsContribution.js";
import { ToolDataSource, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
suite("ToolSetsContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createToolsService() {
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService()))
    }, store);
    return store.add(instaService.createInstance(LanguageModelToolsService));
  }
  test("ClientToolSetsContribution exposes only Tool Search from vscode-general in the Sessions window", () => {
    const makeTool = (name) => ({
      id: name,
      modelDescription: name,
      displayName: name,
      toolReferenceName: name,
      source: ToolDataSource.Internal
    });
    const general = ["runTests", "testFailure", "rename", "usages", "toolSearch"].map(makeTool);
    const removed = ["extensions", "installExtension", "newWorkspace", "runCommand", "vscodeAPI"].map(makeTool);
    const createContribution = (isSessionsWindow) => {
      const toolsService = createToolsService();
      for (const tool of [...general, ...removed]) {
        store.add(toolsService.registerToolData(tool));
      }
      const workspaceService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = isSessionsWindow;
        }
      }();
      store.add(new ClientToolSetsContribution(toolsService, workspaceService));
      return toolsService;
    };
    const sessionsToolsService = createContribution(true);
    const coreToolsService = createContribution(false);
    assert.deepStrictEqual({
      sessionsMembers: Array.from(sessionsToolsService.getToolSet("vscode-general")?.getTools() ?? [], (tool) => tool.toolReferenceName),
      coreMembers: Array.from(coreToolsService.getToolSet("vscode-general")?.getTools() ?? [], (tool) => tool.toolReferenceName)
    }, {
      sessionsMembers: ["toolSearch"],
      coreMembers: ["runTests", "testFailure", "rename", "usages", "toolSearch"]
    });
  });
  test("ClientToolSetsContribution exposes Automations only in the Sessions window", () => {
    const makeTool = (name) => ({
      id: name,
      modelDescription: name,
      displayName: name,
      toolReferenceName: name,
      source: ToolDataSource.Internal
    });
    const createContribution = (isSessionsWindow) => {
      const toolsService = createToolsService();
      for (const tool of ["listAutomations", "configureAutomation", "runAutomation", "deleteAutomation"].map(makeTool)) {
        store.add(toolsService.registerToolData(tool));
      }
      const workspaceService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = isSessionsWindow;
        }
      }();
      store.add(new ClientToolSetsContribution(toolsService, workspaceService));
      return toolsService;
    };
    const sessionsToolsService = createContribution(true);
    const coreToolsService = createContribution(false);
    assert.deepStrictEqual({
      sessionsMembers: Array.from(sessionsToolsService.getToolSet("vscode-automations")?.getTools() ?? [], (tool) => tool.toolReferenceName),
      coreHasSet: !!coreToolsService.getToolSet("vscode-automations")
    }, {
      sessionsMembers: ["listAutomations", "configureAutomation", "runAutomation", "deleteAutomation"],
      coreHasSet: false
    });
  });
  test("getEnabledSelectionReferences keeps enabled tool set references and drops covered tools", () => {
    const toolsService = createToolsService();
    const coveredTool = {
      id: "covered",
      modelDescription: "covered",
      displayName: "covered",
      toolReferenceName: "covered",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const standaloneTool = {
      id: "standalone",
      modelDescription: "standalone",
      displayName: "standalone",
      toolReferenceName: "standalone",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(coveredTool));
    store.add(toolsService.registerToolData(standaloneTool));
    const userToolSet = store.add(toolsService.createToolSet(
      { type: "user", file: URI.file("/tmp/tools.toolsets.jsonc"), label: "tools.toolsets.jsonc" },
      "user/toolset",
      "myToolSet"
    ));
    store.add(userToolSet.addTool(coveredTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [userToolSet, true],
      [coveredTool, true],
      [standaloneTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(userToolSet),
      toolsService.getFullReferenceName(standaloneTool)
    ]);
  });
  test("getEnabledSelectionReferences does not emit a tool set when a member tool is unchecked", () => {
    const toolsService = createToolsService();
    const enabledTool = {
      id: "enabled",
      modelDescription: "enabled",
      displayName: "enabled",
      toolReferenceName: "enabled",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const disabledTool = {
      id: "disabled",
      modelDescription: "disabled",
      displayName: "disabled",
      toolReferenceName: "disabled",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(enabledTool));
    store.add(toolsService.registerToolData(disabledTool));
    const userToolSet = store.add(toolsService.createToolSet(
      { type: "user", file: URI.file("/tmp/tools.toolsets.jsonc"), label: "tools.toolsets.jsonc" },
      "user/toolset",
      "myToolSet"
    ));
    store.add(userToolSet.addTool(enabledTool));
    store.add(userToolSet.addTool(disabledTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [userToolSet, true],
      [enabledTool, true],
      [disabledTool, false]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(enabledTool)
    ]);
  });
  test("getEnabledSelectionReferences uses qualified names for individually selected tools", () => {
    const toolsService = createToolsService();
    const memoryTool = {
      id: "memory",
      modelDescription: "memory",
      displayName: "memory",
      toolReferenceName: "memory",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(memoryTool));
    const vscodeToolSet = store.add(toolsService.createToolSet(
      ToolDataSource.Internal,
      "vscode",
      "vscode"
    ));
    store.add(vscodeToolSet.addTool(memoryTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [vscodeToolSet, false],
      [memoryTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(memoryTool, vscodeToolSet)
    ]);
  });
  test("getEnabledSelectionReferences includes sub-tools that are only referenceable via their tool set", () => {
    const toolsService = createToolsService();
    const subTool = {
      id: "subTool",
      modelDescription: "subTool",
      displayName: "subTool",
      toolReferenceName: "subTool",
      canBeReferencedInPrompt: false,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(subTool));
    const vscodeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "vscode", "vscode"));
    store.add(vscodeToolSet.addTool(subTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [vscodeToolSet, false],
      [subTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(subTool, vscodeToolSet)
    ]);
  });
  test("getEnabledSelectionReferences supports mixed qualified names and wildcard tool sets", () => {
    const toolsService = createToolsService();
    const memoryTool = {
      id: "memory",
      modelDescription: "memory",
      displayName: "memory",
      toolReferenceName: "memory",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const runInTerminalTool = {
      id: "runInTerminal",
      modelDescription: "runInTerminal",
      displayName: "runInTerminal",
      toolReferenceName: "runInTerminal",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const readFileTool = {
      id: "readFile",
      modelDescription: "readFile",
      displayName: "readFile",
      toolReferenceName: "readFile",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const githubIssuesTool = {
      id: "githubIssues",
      modelDescription: "issues",
      displayName: "issues",
      toolReferenceName: "issues",
      canBeReferencedInPrompt: true,
      source: { type: "mcp", label: "GitHub", collectionId: "github", definitionId: "github", instructions: "", serverLabel: "GitHub" }
    };
    store.add(toolsService.registerToolData(memoryTool));
    store.add(toolsService.registerToolData(runInTerminalTool));
    store.add(toolsService.registerToolData(readFileTool));
    store.add(toolsService.registerToolData(githubIssuesTool));
    const vscodeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "vscode", "vscode"));
    const executeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "execute", "execute"));
    const readToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "read", "read"));
    const githubToolSet = store.add(toolsService.createToolSet(
      { type: "mcp", label: "GitHub", collectionId: "github", definitionId: "github", instructions: "", serverLabel: "GitHub" },
      "github",
      "github"
    ));
    store.add(vscodeToolSet.addTool(memoryTool));
    store.add(executeToolSet.addTool(runInTerminalTool));
    store.add(readToolSet.addTool(readFileTool));
    store.add(githubToolSet.addTool(githubIssuesTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [vscodeToolSet, false],
      [executeToolSet, false],
      [readToolSet, false],
      [githubToolSet, true],
      [memoryTool, true],
      [runInTerminalTool, true],
      [readFileTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(githubToolSet),
      toolsService.getFullReferenceName(memoryTool, vscodeToolSet),
      toolsService.getFullReferenceName(runInTerminalTool, executeToolSet),
      toolsService.getFullReferenceName(readFileTool, readToolSet)
    ]);
  });
  test("createToolSetFileContents emits prefilled jsonc structure", () => {
    assert.strictEqual(
      createToolSetFileContents("myToolSet", ["read", "search", "github/issues"]),
      [
        "{",
        '	"myToolSet": {',
        '		"tools": [',
        '			"read",',
        '			"search",',
        '			"github/issues"',
        "		],",
        '		"description": "",',
        '		"icon": "tools"',
        "	}",
        "}"
      ].join("\n")
    );
  });
  test("deleteToolSetFromFileContents removes matching tool set", () => {
    const updated = deleteToolSetFromFileContents('{\n	"CurrentTools": {\n		"tools": ["vscode/memory"]\n	},\n	"Other": {\n		"tools": ["read/readFile"]\n	}\n}', "CurrentTools");
    assert.deepStrictEqual(updated, { contents: '{\n	"Other": {\n		"tools": [\n			"read/readFile"\n		]\n	}\n}', isEmpty: false });
  });
  test("deleteToolSetFromFileContents reports an empty file when the last tool set is removed", () => {
    const updated = deleteToolSetFromFileContents('{\n	"CurrentTools": {\n		"tools": ["vscode/memory"]\n	}\n}', "CurrentTools");
    assert.deepStrictEqual(updated, { contents: "{}", isEmpty: true });
  });
  test("deleteToolSetFromFileContents returns undefined when tool set missing", () => {
    assert.strictEqual(deleteToolSetFromFileContents('{"Other": {"tools": ["read/readFile"]}}', "CurrentTools"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHRvb2xzXFx0b29sU2V0c0NvbnRyaWJ1dGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL2NsaWVudFRvb2xTZXRzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVG9vbFNldEZpbGVDb250ZW50cywgZGVsZXRlVG9vbFNldEZyb21GaWxlQ29udGVudHMsIGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci90b29scy90b29sU2V0c0NvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUb29sRGF0YSwgVG9vbERhdGFTb3VyY2UsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1Rvb2xTZXRzQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRvb2xzU2VydmljZSgpOiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKSxcblx0XHR9LCBzdG9yZSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgnQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24gZXhwb3NlcyBvbmx5IFRvb2wgU2VhcmNoIGZyb20gdnNjb2RlLWdlbmVyYWwgaW4gdGhlIFNlc3Npb25zIHdpbmRvdycsICgpID0+IHtcblx0XHRjb25zdCBtYWtlVG9vbCA9IChuYW1lOiBzdHJpbmcpOiBJVG9vbERhdGEgPT4gKHtcblx0XHRcdGlkOiBuYW1lLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogbmFtZSxcblx0XHRcdGRpc3BsYXlOYW1lOiBuYW1lLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6IG5hbWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGdlbmVyYWwgPSBbJ3J1blRlc3RzJywgJ3Rlc3RGYWlsdXJlJywgJ3JlbmFtZScsICd1c2FnZXMnLCAndG9vbFNlYXJjaCddLm1hcChtYWtlVG9vbCk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IFsnZXh0ZW5zaW9ucycsICdpbnN0YWxsRXh0ZW5zaW9uJywgJ25ld1dvcmtzcGFjZScsICdydW5Db21tYW5kJywgJ3ZzY29kZUFQSSddLm1hcChtYWtlVG9vbCk7XG5cdFx0Y29uc3QgY3JlYXRlQ29udHJpYnV0aW9uID0gKGlzU2Vzc2lvbnNXaW5kb3c6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGNyZWF0ZVRvb2xzU2VydmljZSgpO1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIFsuLi5nZW5lcmFsLCAuLi5yZW1vdmVkXSkge1xuXHRcdFx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbCkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc1Nlc3Npb25zV2luZG93ID0gaXNTZXNzaW9uc1dpbmRvdztcblx0XHRcdH0oKTtcblx0XHRcdHN0b3JlLmFkZChuZXcgQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24odG9vbHNTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gdG9vbHNTZXJ2aWNlO1xuXHRcdH07XG5cblx0XHRjb25zdCBzZXNzaW9uc1Rvb2xzU2VydmljZSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih0cnVlKTtcblx0XHRjb25zdCBjb3JlVG9vbHNTZXJ2aWNlID0gY3JlYXRlQ29udHJpYnV0aW9uKGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvbnNNZW1iZXJzOiBBcnJheS5mcm9tKHNlc3Npb25zVG9vbHNTZXJ2aWNlLmdldFRvb2xTZXQoJ3ZzY29kZS1nZW5lcmFsJyk/LmdldFRvb2xzKCkgPz8gW10sIHRvb2wgPT4gdG9vbC50b29sUmVmZXJlbmNlTmFtZSksXG5cdFx0XHRjb3JlTWVtYmVyczogQXJyYXkuZnJvbShjb3JlVG9vbHNTZXJ2aWNlLmdldFRvb2xTZXQoJ3ZzY29kZS1nZW5lcmFsJyk/LmdldFRvb2xzKCkgPz8gW10sIHRvb2wgPT4gdG9vbC50b29sUmVmZXJlbmNlTmFtZSksXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbnNNZW1iZXJzOiBbJ3Rvb2xTZWFyY2gnXSxcblx0XHRcdGNvcmVNZW1iZXJzOiBbJ3J1blRlc3RzJywgJ3Rlc3RGYWlsdXJlJywgJ3JlbmFtZScsICd1c2FnZXMnLCAndG9vbFNlYXJjaCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbiBleHBvc2VzIEF1dG9tYXRpb25zIG9ubHkgaW4gdGhlIFNlc3Npb25zIHdpbmRvdycsICgpID0+IHtcblx0XHRjb25zdCBtYWtlVG9vbCA9IChuYW1lOiBzdHJpbmcpOiBJVG9vbERhdGEgPT4gKHtcblx0XHRcdGlkOiBuYW1lLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogbmFtZSxcblx0XHRcdGRpc3BsYXlOYW1lOiBuYW1lLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6IG5hbWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNyZWF0ZUNvbnRyaWJ1dGlvbiA9IChpc1Nlc3Npb25zV2luZG93OiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBjcmVhdGVUb29sc1NlcnZpY2UoKTtcblx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiBbJ2xpc3RBdXRvbWF0aW9ucycsICdjb25maWd1cmVBdXRvbWF0aW9uJywgJ3J1bkF1dG9tYXRpb24nLCAnZGVsZXRlQXV0b21hdGlvbiddLm1hcChtYWtlVG9vbCkpIHtcblx0XHRcdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2wpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IGlzU2Vzc2lvbnNXaW5kb3c7XG5cdFx0XHR9KCk7XG5cdFx0XHRzdG9yZS5hZGQobmV3IENsaWVudFRvb2xTZXRzQ29udHJpYnV0aW9uKHRvb2xzU2VydmljZSwgd29ya3NwYWNlU2VydmljZSkpO1xuXHRcdFx0cmV0dXJuIHRvb2xzU2VydmljZTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnNUb29sc1NlcnZpY2UgPSBjcmVhdGVDb250cmlidXRpb24odHJ1ZSk7XG5cdFx0Y29uc3QgY29yZVRvb2xzU2VydmljZSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbihmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25zTWVtYmVyczogQXJyYXkuZnJvbShzZXNzaW9uc1Rvb2xzU2VydmljZS5nZXRUb29sU2V0KCd2c2NvZGUtYXV0b21hdGlvbnMnKT8uZ2V0VG9vbHMoKSA/PyBbXSwgdG9vbCA9PiB0b29sLnRvb2xSZWZlcmVuY2VOYW1lKSxcblx0XHRcdGNvcmVIYXNTZXQ6ICEhY29yZVRvb2xzU2VydmljZS5nZXRUb29sU2V0KCd2c2NvZGUtYXV0b21hdGlvbnMnKSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uc01lbWJlcnM6IFsnbGlzdEF1dG9tYXRpb25zJywgJ2NvbmZpZ3VyZUF1dG9tYXRpb24nLCAncnVuQXV0b21hdGlvbicsICdkZWxldGVBdXRvbWF0aW9uJ10sXG5cdFx0XHRjb3JlSGFzU2V0OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMga2VlcHMgZW5hYmxlZCB0b29sIHNldCByZWZlcmVuY2VzIGFuZCBkcm9wcyBjb3ZlcmVkIHRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGNyZWF0ZVRvb2xzU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgY292ZXJlZFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY292ZXJlZCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnY292ZXJlZCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ2NvdmVyZWQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdjb3ZlcmVkJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXHRcdGNvbnN0IHN0YW5kYWxvbmVUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3N0YW5kYWxvbmUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ3N0YW5kYWxvbmUnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdzdGFuZGFsb25lJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnc3RhbmRhbG9uZScsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjb3ZlcmVkVG9vbCkpO1xuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShzdGFuZGFsb25lVG9vbCkpO1xuXG5cdFx0Y29uc3QgdXNlclRvb2xTZXQgPSBzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHR7IHR5cGU6ICd1c2VyJywgZmlsZTogVVJJLmZpbGUoJy90bXAvdG9vbHMudG9vbHNldHMuanNvbmMnKSwgbGFiZWw6ICd0b29scy50b29sc2V0cy5qc29uYycgfSxcblx0XHRcdCd1c2VyL3Rvb2xzZXQnLFxuXHRcdFx0J215VG9vbFNldCdcblx0XHQpKTtcblx0XHRzdG9yZS5hZGQodXNlclRvb2xTZXQuYWRkVG9vbChjb3ZlcmVkVG9vbCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtcblx0XHRcdFt1c2VyVG9vbFNldCwgdHJ1ZV0sXG5cdFx0XHRbY292ZXJlZFRvb2wsIHRydWVdLFxuXHRcdFx0W3N0YW5kYWxvbmVUb29sLCB0cnVlXSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMoc2VsZWN0aW9uLCB0b29sc1NlcnZpY2UpLCBbXG5cdFx0XHR0b29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUodXNlclRvb2xTZXQpLFxuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKHN0YW5kYWxvbmVUb29sKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMgZG9lcyBub3QgZW1pdCBhIHRvb2wgc2V0IHdoZW4gYSBtZW1iZXIgdG9vbCBpcyB1bmNoZWNrZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gY3JlYXRlVG9vbHNTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBlbmFibGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdlbmFibGVkJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdlbmFibGVkJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnZW5hYmxlZCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2VuYWJsZWQnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0Y29uc3QgZGlzYWJsZWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2Rpc2FibGVkJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdkaXNhYmxlZCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ2Rpc2FibGVkJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnZGlzYWJsZWQnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZW5hYmxlZFRvb2wpKTtcblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZGlzYWJsZWRUb29sKSk7XG5cblx0XHRjb25zdCB1c2VyVG9vbFNldCA9IHN0b3JlLmFkZCh0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdHsgdHlwZTogJ3VzZXInLCBmaWxlOiBVUkkuZmlsZSgnL3RtcC90b29scy50b29sc2V0cy5qc29uYycpLCBsYWJlbDogJ3Rvb2xzLnRvb2xzZXRzLmpzb25jJyB9LFxuXHRcdFx0J3VzZXIvdG9vbHNldCcsXG5cdFx0XHQnbXlUb29sU2V0J1xuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZCh1c2VyVG9vbFNldC5hZGRUb29sKGVuYWJsZWRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHVzZXJUb29sU2V0LmFkZFRvb2woZGlzYWJsZWRUb29sKSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1xuXHRcdFx0W3VzZXJUb29sU2V0LCB0cnVlXSxcblx0XHRcdFtlbmFibGVkVG9vbCwgdHJ1ZV0sXG5cdFx0XHRbZGlzYWJsZWRUb29sLCBmYWxzZV0sXG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgdG9vbCBzZXQgaXMgcGFydGlhbGx5IGRlc2VsZWN0ZWQsIHNvIGl0IG11c3Qgbm90IGJlIHNlcmlhbGl6ZWQuIE9ubHkgdGhlXG5cdFx0Ly8gZW5hYmxlZCBtZW1iZXIgdG9vbCBpcyBlbWl0dGVkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMoc2VsZWN0aW9uLCB0b29sc1NlcnZpY2UpLCBbXG5cdFx0XHR0b29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUoZW5hYmxlZFRvb2wpLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFbmFibGVkU2VsZWN0aW9uUmVmZXJlbmNlcyB1c2VzIHF1YWxpZmllZCBuYW1lcyBmb3IgaW5kaXZpZHVhbGx5IHNlbGVjdGVkIHRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGNyZWF0ZVRvb2xzU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbWVtb3J5VG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdtZW1vcnknLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ21lbW9yeScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ21lbW9yeScsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ21lbW9yeScsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShtZW1vcnlUb29sKSk7XG5cblx0XHRjb25zdCB2c2NvZGVUb29sU2V0ID0gc3RvcmUuYWRkKHRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQndnNjb2RlJyxcblx0XHRcdCd2c2NvZGUnXG5cdFx0KSk7XG5cdFx0c3RvcmUuYWRkKHZzY29kZVRvb2xTZXQuYWRkVG9vbChtZW1vcnlUb29sKSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1xuXHRcdFx0W3ZzY29kZVRvb2xTZXQsIGZhbHNlXSxcblx0XHRcdFttZW1vcnlUb29sLCB0cnVlXSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMoc2VsZWN0aW9uLCB0b29sc1NlcnZpY2UpLCBbXG5cdFx0XHR0b29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUobWVtb3J5VG9vbCwgdnNjb2RlVG9vbFNldCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzIGluY2x1ZGVzIHN1Yi10b29scyB0aGF0IGFyZSBvbmx5IHJlZmVyZW5jZWFibGUgdmlhIHRoZWlyIHRvb2wgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGNyZWF0ZVRvb2xzU2VydmljZSgpO1xuXG5cdFx0Y29uc3Qgc3ViVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdzdWJUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdzdWJUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnc3ViVG9vbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3N1YlRvb2wnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHN1YlRvb2wpKTtcblxuXHRcdGNvbnN0IHZzY29kZVRvb2xTZXQgPSBzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsICd2c2NvZGUnLCAndnNjb2RlJykpO1xuXHRcdHN0b3JlLmFkZCh2c2NvZGVUb29sU2V0LmFkZFRvb2woc3ViVG9vbCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtcblx0XHRcdFt2c2NvZGVUb29sU2V0LCBmYWxzZV0sXG5cdFx0XHRbc3ViVG9vbCwgdHJ1ZV0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzKHNlbGVjdGlvbiwgdG9vbHNTZXJ2aWNlKSwgW1xuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKHN1YlRvb2wsIHZzY29kZVRvb2xTZXQpLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFbmFibGVkU2VsZWN0aW9uUmVmZXJlbmNlcyBzdXBwb3J0cyBtaXhlZCBxdWFsaWZpZWQgbmFtZXMgYW5kIHdpbGRjYXJkIHRvb2wgc2V0cycsICgpID0+IHtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBjcmVhdGVUb29sc1NlcnZpY2UoKTtcblxuXHRcdGNvbnN0IG1lbW9yeVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnbWVtb3J5Jyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdtZW1vcnknLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdtZW1vcnknLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdtZW1vcnknLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCBydW5JblRlcm1pbmFsVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAncnVuSW5UZXJtaW5hbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCByZWFkRmlsZVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAncmVhZEZpbGUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ3JlYWRGaWxlJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAncmVhZEZpbGUnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdyZWFkRmlsZScsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGdpdGh1Yklzc3Vlc1Rvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZ2l0aHViSXNzdWVzJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdpc3N1ZXMnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdpc3N1ZXMnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdpc3N1ZXMnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IHsgdHlwZTogJ21jcCcsIGxhYmVsOiAnR2l0SHViJywgY29sbGVjdGlvbklkOiAnZ2l0aHViJywgZGVmaW5pdGlvbklkOiAnZ2l0aHViJywgaW5zdHJ1Y3Rpb25zOiAnJywgc2VydmVyTGFiZWw6ICdHaXRIdWInIH0sXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShtZW1vcnlUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHJ1bkluVGVybWluYWxUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHJlYWRGaWxlVG9vbCkpO1xuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShnaXRodWJJc3N1ZXNUb29sKSk7XG5cblx0XHRjb25zdCB2c2NvZGVUb29sU2V0ID0gc3RvcmUuYWRkKHRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFRvb2xEYXRhU291cmNlLkludGVybmFsLCAndnNjb2RlJywgJ3ZzY29kZScpKTtcblx0XHRjb25zdCBleGVjdXRlVG9vbFNldCA9IHN0b3JlLmFkZCh0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgJ2V4ZWN1dGUnLCAnZXhlY3V0ZScpKTtcblx0XHRjb25zdCByZWFkVG9vbFNldCA9IHN0b3JlLmFkZCh0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgJ3JlYWQnLCAncmVhZCcpKTtcblx0XHRjb25zdCBnaXRodWJUb29sU2V0ID0gc3RvcmUuYWRkKHRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0eyB0eXBlOiAnbWNwJywgbGFiZWw6ICdHaXRIdWInLCBjb2xsZWN0aW9uSWQ6ICdnaXRodWInLCBkZWZpbml0aW9uSWQ6ICdnaXRodWInLCBpbnN0cnVjdGlvbnM6ICcnLCBzZXJ2ZXJMYWJlbDogJ0dpdEh1YicgfSxcblx0XHRcdCdnaXRodWInLFxuXHRcdFx0J2dpdGh1Yidcblx0XHQpKTtcblxuXHRcdHN0b3JlLmFkZCh2c2NvZGVUb29sU2V0LmFkZFRvb2wobWVtb3J5VG9vbCkpO1xuXHRcdHN0b3JlLmFkZChleGVjdXRlVG9vbFNldC5hZGRUb29sKHJ1bkluVGVybWluYWxUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHJlYWRUb29sU2V0LmFkZFRvb2wocmVhZEZpbGVUb29sKSk7XG5cdFx0c3RvcmUuYWRkKGdpdGh1YlRvb2xTZXQuYWRkVG9vbChnaXRodWJJc3N1ZXNUb29sKSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1xuXHRcdFx0W3ZzY29kZVRvb2xTZXQsIGZhbHNlXSxcblx0XHRcdFtleGVjdXRlVG9vbFNldCwgZmFsc2VdLFxuXHRcdFx0W3JlYWRUb29sU2V0LCBmYWxzZV0sXG5cdFx0XHRbZ2l0aHViVG9vbFNldCwgdHJ1ZV0sXG5cdFx0XHRbbWVtb3J5VG9vbCwgdHJ1ZV0sXG5cdFx0XHRbcnVuSW5UZXJtaW5hbFRvb2wsIHRydWVdLFxuXHRcdFx0W3JlYWRGaWxlVG9vbCwgdHJ1ZV0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzKHNlbGVjdGlvbiwgdG9vbHNTZXJ2aWNlKSwgW1xuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKGdpdGh1YlRvb2xTZXQpLFxuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKG1lbW9yeVRvb2wsIHZzY29kZVRvb2xTZXQpLFxuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKHJ1bkluVGVybWluYWxUb29sLCBleGVjdXRlVG9vbFNldCksXG5cdFx0XHR0b29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUocmVhZEZpbGVUb29sLCByZWFkVG9vbFNldCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVRvb2xTZXRGaWxlQ29udGVudHMgZW1pdHMgcHJlZmlsbGVkIGpzb25jIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjcmVhdGVUb29sU2V0RmlsZUNvbnRlbnRzKCdteVRvb2xTZXQnLCBbJ3JlYWQnLCAnc2VhcmNoJywgJ2dpdGh1Yi9pc3N1ZXMnXSksXG5cdFx0XHRbXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0J1xcdFwibXlUb29sU2V0XCI6IHsnLFxuXHRcdFx0XHQnXFx0XFx0XCJ0b29sc1wiOiBbJyxcblx0XHRcdFx0J1xcdFxcdFxcdFwicmVhZFwiLCcsXG5cdFx0XHRcdCdcXHRcXHRcXHRcInNlYXJjaFwiLCcsXG5cdFx0XHRcdCdcXHRcXHRcXHRcImdpdGh1Yi9pc3N1ZXNcIicsXG5cdFx0XHRcdCdcXHRcXHRdLCcsXG5cdFx0XHRcdCdcXHRcXHRcImRlc2NyaXB0aW9uXCI6IFwiXCIsJyxcblx0XHRcdFx0J1xcdFxcdFwiaWNvblwiOiBcInRvb2xzXCInLFxuXHRcdFx0XHQnXFx0fScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cyByZW1vdmVzIG1hdGNoaW5nIHRvb2wgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHVwZGF0ZWQgPSBkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cygne1xcblxcdFwiQ3VycmVudFRvb2xzXCI6IHtcXG5cXHRcXHRcInRvb2xzXCI6IFtcInZzY29kZS9tZW1vcnlcIl1cXG5cXHR9LFxcblxcdFwiT3RoZXJcIjoge1xcblxcdFxcdFwidG9vbHNcIjogW1wicmVhZC9yZWFkRmlsZVwiXVxcblxcdH1cXG59JywgJ0N1cnJlbnRUb29scycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlZCwgeyBjb250ZW50czogJ3tcXG5cXHRcIk90aGVyXCI6IHtcXG5cXHRcXHRcInRvb2xzXCI6IFtcXG5cXHRcXHRcXHRcInJlYWQvcmVhZEZpbGVcIlxcblxcdFxcdF1cXG5cXHR9XFxufScsIGlzRW1wdHk6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cyByZXBvcnRzIGFuIGVtcHR5IGZpbGUgd2hlbiB0aGUgbGFzdCB0b29sIHNldCBpcyByZW1vdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVwZGF0ZWQgPSBkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cygne1xcblxcdFwiQ3VycmVudFRvb2xzXCI6IHtcXG5cXHRcXHRcInRvb2xzXCI6IFtcInZzY29kZS9tZW1vcnlcIl1cXG5cXHR9XFxufScsICdDdXJyZW50VG9vbHMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZWQsIHsgY29udGVudHM6ICd7fScsIGlzRW1wdHk6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVRvb2xTZXRGcm9tRmlsZUNvbnRlbnRzIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gdG9vbCBzZXQgbWlzc2luZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZXRlVG9vbFNldEZyb21GaWxlQ29udGVudHMoJ3tcIk90aGVyXCI6IHtcInRvb2xzXCI6IFtcInJlYWQvcmVhZEZpbGVcIl19fScsICdDdXJyZW50VG9vbHMnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCLCtCQUErQixxQ0FBcUM7QUFFeEcsU0FBb0IsZ0JBQWdCLG1DQUFtQztBQUV2RSxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyxxQkFBZ0Q7QUFDeEQsVUFBTSxlQUFlLDhCQUE4QjtBQUFBLE1BQ2xELG1CQUFtQixNQUFNLE1BQU0sSUFBSSxJQUFJLGtCQUFrQixJQUFJLHlCQUF5QixDQUFDLENBQUM7QUFBQSxJQUN6RixHQUFHLEtBQUs7QUFDUixXQUFPLE1BQU0sSUFBSSxhQUFhLGVBQWUseUJBQXlCLENBQUM7QUFBQSxFQUN4RTtBQUVBLE9BQUssa0dBQWtHLE1BQU07QUFDNUcsVUFBTSxXQUFXLENBQUMsVUFBNkI7QUFBQSxNQUM5QyxJQUFJO0FBQUEsTUFDSixrQkFBa0I7QUFBQSxNQUNsQixhQUFhO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxNQUNuQixRQUFRLGVBQWU7QUFBQSxJQUN4QjtBQUNBLFVBQU0sVUFBVSxDQUFDLFlBQVksZUFBZSxVQUFVLFVBQVUsWUFBWSxF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aUJBQWlCLENBQUM7QUFDbkQsVUFBTSxJQUFJLFlBQVksUUFBUSxZQUFZLENBQUM7QUFDM0MsVUFBTSxJQUFJLGNBQWMsUUFBUSxnQkFBZ0IsQ0FBQztBQUVqRCxVQUFNLFlBQVksNEJBQTRCLFlBQVk7QUFBQSxNQUN6RCxDQUFDLGVBQWUsS0FBSztBQUFBLE1BQ3JCLENBQUMsZ0JBQWdCLEtBQUs7QUFBQSxNQUN0QixDQUFDLGFBQWEsS0FBSztBQUFBLE1BQ25CLENBQUMsZUFBZSxJQUFJO0FBQUEsTUFDcEIsQ0FBQyxZQUFZLElBQUk7QUFBQSxNQUNqQixDQUFDLG1CQUFtQixJQUFJO0FBQUEsTUFDeEIsQ0FBQyxjQUFjLElBQUk7QUFBQSxJQUNwQixDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsOEJBQThCLFdBQVcsWUFBWSxHQUFHO0FBQUEsTUFDOUUsYUFBYSxxQkFBcUIsYUFBYTtBQUFBLE1BQy9DLGFBQWEscUJBQXFCLFlBQVksYUFBYTtBQUFBLE1BQzNELGFBQWEscUJBQXFCLG1CQUFtQixjQUFjO0FBQUEsTUFDbkUsYUFBYSxxQkFBcUIsY0FBYyxXQUFXO0FBQUEsSUFDNUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsV0FBTztBQUFBLE1BQ04sMEJBQTBCLGFBQWEsQ0FBQyxRQUFRLFVBQVUsZUFBZSxDQUFDO0FBQUEsTUFDMUU7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLFVBQVUsOEJBQThCLDhHQUFzSCxjQUFjO0FBQ2xMLFdBQU8sZ0JBQWdCLFNBQVMsRUFBRSxVQUFVLGdFQUF5RSxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQ3RJLENBQUM7QUFFRCxPQUFLLHlGQUF5RixNQUFNO0FBQ25HLFVBQU0sVUFBVSw4QkFBOEIsOERBQWtFLGNBQWM7QUFDOUgsV0FBTyxnQkFBZ0IsU0FBUyxFQUFFLFVBQVUsTUFBTSxTQUFTLEtBQUssQ0FBQztBQUFBLEVBQ2xFLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFdBQU8sWUFBWSw4QkFBOEIsMkNBQTJDLGNBQWMsR0FBRyxNQUFTO0FBQUEsRUFDdkgsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
