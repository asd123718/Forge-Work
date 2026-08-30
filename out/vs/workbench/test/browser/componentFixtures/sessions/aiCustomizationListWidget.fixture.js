import { Event } from "../../../../../base/common/event.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { derived, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IAICustomizationWorkspaceService } from "../../../../contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService, createVSCodeHarnessDescriptor } from "../../../../contrib/chat/common/customizationHarnessService.js";
import { IAgentPluginService } from "../../../../contrib/chat/common/plugins/agentPluginService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { getChatSessionType, LocalChatSessionUri } from "../../../../contrib/chat/common/model/chatUri.js";
import { PromptsType } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { IPromptsService, AgentInstructionFileType, PromptsStorage } from "../../../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { AICustomizationManagementSection } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { AICustomizationItemsModel, IAICustomizationItemsModel } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js";
import { AICustomizationListWidget } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationListWidget.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { ParsedPromptFile, PromptHeader } from "../../../../contrib/chat/common/promptSyntax/promptFileParser.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { isEqual } from "../../../../../base/common/resources.js";
import "../../../../../platform/theme/common/colors/inputColors.js";
import "../../../../../platform/theme/common/colors/listColors.js";
function createMockPromptsService(instructionFiles, agentInstructionFiles = []) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeCustomAgents = Event.None;
      this.onDidChangeSlashCommands = Event.None;
      this.onDidChangeSkills = Event.None;
      this.onDidChangeInstructions = Event.None;
      this.onDidChangeAgentInstructions = Event.None;
      this.onDidChangeHooks = Event.None;
    }
    getDisabledPromptFiles() {
      return new ResourceSet();
    }
    async listPromptFiles(type) {
      if (type === PromptsType.instructions) {
        return instructionFiles.map((f) => f.promptPath);
      }
      return [];
    }
    async listAgentInstructions() {
      return agentInstructionFiles;
    }
    async listPromptFilesForStorage() {
      return [];
    }
    async getCustomAgents() {
      return [];
    }
    async findAgentSkills() {
      return [];
    }
    async getPromptSlashCommands() {
      return [];
    }
    async getHooks() {
      return void 0;
    }
    async getInstructionFiles() {
      return instructionFiles.map((f) => ({
        uri: f.promptPath.uri,
        name: f.name ?? "",
        description: f.description,
        storage: f.promptPath.storage,
        pattern: f.applyTo
      }));
    }
    async parseNew(uri) {
      const file = instructionFiles.find((f) => isEqual(f.promptPath.uri, uri));
      const headerLines = [];
      headerLines.push("---\n");
      if (file) {
        if (file.name) {
          headerLines.push(`name: ${file.name}
`);
        }
        if (file.description) {
          headerLines.push(`description: ${file.description}
`);
        }
        if (file.applyTo) {
          headerLines.push(`applyTo: "${file.applyTo}"
`);
        }
      }
      headerLines.push("---\n");
      const header = new PromptHeader(
        new Range(2, 1, headerLines.length, 1),
        uri,
        headerLines
      );
      return new ParsedPromptFile(uri, header);
    }
  }();
}
function createMockWorkspaceService() {
  const activeProjectRoot = observableValue("mockActiveProjectRoot", URI.file("/workspace"));
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.isSessionsWindow = false;
      this.welcomePageFeatures = {
        showGettingStartedBanner: true
      };
      this.activeProjectRoot = activeProjectRoot;
      this.hasOverrideProjectRoot = observableValue("hasOverride", false);
    }
    getActiveProjectRoot() {
      return URI.file("/workspace");
    }
    getSkillUIIntegrations() {
      return /* @__PURE__ */ new Map();
    }
  }();
}
function createMockHarnessService() {
  const descriptor = createVSCodeHarnessDescriptor();
  const activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
  const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSessionResource = activeSessionResource;
      this.activeHarness = activeHarness;
      this.availableHarnesses = observableValue("harnesses", [descriptor]);
    }
    findHarnessById(id) {
      return id === descriptor.id ? descriptor : void 0;
    }
    getActiveDescriptor() {
      return descriptor;
    }
    setActiveSession(sessionResource) {
      activeSessionResource.set(sessionResource, void 0);
    }
    getSessionResourceForHarness() {
      return activeSessionResource.get();
    }
    registerExternalHarness() {
      return { dispose() {
      } };
    }
  }();
}
function createMockWorkspaceContextService() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeWorkspaceFolders = Event.None;
    }
    getWorkspace() {
      return { id: "test", folders: [] };
    }
  }();
}
async function renderInstructionsTab(ctx, instructionFiles, agentInstructionFiles = []) {
  const width = 500;
  const height = 400;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const contextMenuService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidShowContextMenu = Event.None;
      this.onDidHideContextMenu = Event.None;
    }
    showContextMenu() {
    }
  }();
  const contextViewService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.anchorAlignment = 0;
    }
    showContextView() {
      return { close: () => {
      } };
    }
    hideContextView() {
    }
    getContextViewElement() {
      return ctx.container;
    }
    layout() {
    }
  }();
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.defineInstance(IContextMenuService, contextMenuService);
      reg.defineInstance(IContextViewService, contextViewService);
      reg.define(IListService, ListService);
      reg.defineInstance(IPromptsService, createMockPromptsService(instructionFiles, agentInstructionFiles));
      reg.defineInstance(IAICustomizationWorkspaceService, createMockWorkspaceService());
      reg.defineInstance(ICustomizationHarnessService, createMockHarnessService());
      reg.defineInstance(IWorkspaceContextService, createMockWorkspaceContextService());
      reg.defineInstance(IChatSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeCustomizations = Event.None;
        }
        async getCustomizations() {
          return void 0;
        }
        getRegisteredChatSessionItemProviders() {
          return [];
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = observableValue("plugins", []);
        }
      }());
      reg.defineInstance(IFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidFilesChange = Event.None;
        }
      }());
      reg.defineInstance(IProductService, new class extends mock() {
      }());
      reg.defineInstance(IPathService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.defaultUriScheme = "file";
        }
        userHome() {
          return URI.file("/home/dev");
        }
      }());
      reg.define(IAICustomizationItemsModel, AICustomizationItemsModel);
    }
  });
  const widget = ctx.disposableStore.add(
    instantiationService.createInstance(AICustomizationListWidget)
  );
  ctx.container.appendChild(widget.element);
  await widget.setSection(AICustomizationManagementSection.Instructions);
  widget.layout(height, width);
}
var aiCustomizationListWidget_fixture_default = defineThemedFixtureGroup({ path: "chat/aiCustomizations/" }, {
  InstructionsTabWithItems: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderInstructionsTab(ctx, [
      // Always-active instructions (no applyTo)
      { promptPath: { uri: URI.file("/workspace/.github/instructions/coding-standards.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }, name: "Coding Standards", description: "Repository-wide coding standards" },
      { promptPath: { uri: URI.file("/home/dev/.copilot/instructions/my-style.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions }, name: "My Style", description: "Personal coding style preferences" },
      // Always-included instruction (applyTo: **)
      { promptPath: { uri: URI.file("/workspace/.github/instructions/general-guidelines.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }, name: "General Guidelines", description: "General development guidelines", applyTo: "**" },
      // On-demand instructions (with applyTo pattern)
      { promptPath: { uri: URI.file("/workspace/.github/instructions/testing-guidelines.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }, name: "Testing Guidelines", description: "Testing best practices", applyTo: "**/*.test.ts" },
      { promptPath: { uri: URI.file("/workspace/.github/instructions/security-review.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }, name: "Security Review", description: "Security review checklist", applyTo: "src/auth/**" },
      { promptPath: { uri: URI.file("/home/dev/.copilot/instructions/typescript-rules.instructions.md"), storage: PromptsStorage.extension, type: PromptsType.instructions, extension: void 0, source: void 0 }, name: "TypeScript Rules", description: "TypeScript conventions", applyTo: "**/*.ts" }
    ], [
      // Agent instruction files (AGENTS.md, copilot-instructions.md)
      { uri: URI.file("/workspace/AGENTS.md"), realPath: void 0, type: AgentInstructionFileType.agentsMd },
      { uri: URI.file("/workspace/.github/copilot-instructions.md"), realPath: void 0, type: AgentInstructionFileType.copilotInstructionsMd }
    ])
  }),
  InstructionsTabEmpty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderInstructionsTab(ctx, [])
  })
});
export {
  aiCustomizationListWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIElIYXJuZXNzRGVzY3JpcHRvciwgY3JlYXRlVlNDb2RlSGFybmVzc0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UsIEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZSwgUHJvbXB0c1N0b3JhZ2UsIElQcm9tcHRQYXRoLCBJQWdlbnRJbnN0cnVjdGlvbkZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCwgSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgUGFyc2VkUHJvbXB0RmlsZSwgUHJvbXB0SGVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxuLy8gRW5zdXJlIGNvbG9yIHJlZ2lzdHJhdGlvbnMgYXJlIGxvYWRlZFxuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2lucHV0Q29sb3JzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9saXN0Q29sb3JzLmpzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTW9jayBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJRml4dHVyZUluc3RydWN0aW9uRmlsZSB7XG5cdHJlYWRvbmx5IHByb21wdFBhdGg6IElQcm9tcHRQYXRoO1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgYXBwbHlUbz86IHN0cmluZzsgLyoqIElmIHNldCwgdGhpcyBpbnN0cnVjdGlvbiBmaWxlIGhhcyBhbiBhcHBseVRvIHBhdHRlcm4gdGhhdCBjb250cm9scyBhdXRvbWF0aWMgaW5jbHVzaW9uIHdoZW4gdGhlIGNvbnRleHQgbWF0Y2hlcyAob3IgYCoqYCBmb3IgYWx3YXlzKS4gKi9cbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKGluc3RydWN0aW9uRmlsZXM6IElGaXh0dXJlSW5zdHJ1Y3Rpb25GaWxlW10sIGFnZW50SW5zdHJ1Y3Rpb25GaWxlczogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXSk6IElQcm9tcHRzU2VydmljZSB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9tcHRzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTa2lsbHMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUhvb2tzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXREaXNhYmxlZFByb21wdEZpbGVzKCk6IFJlc291cmNlU2V0IHsgcmV0dXJuIG5ldyBSZXNvdXJjZVNldCgpOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgbGlzdFByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlKSB7XG5cdFx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRcdHJldHVybiBpbnN0cnVjdGlvbkZpbGVzLm1hcChmID0+IGYucHJvbXB0UGF0aCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGxpc3RBZ2VudEluc3RydWN0aW9ucygpIHsgcmV0dXJuIGFnZW50SW5zdHJ1Y3Rpb25GaWxlczsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldEN1c3RvbUFnZW50cygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZmluZEFnZW50U2tpbGxzKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRQcm9tcHRTbGFzaENvbW1hbmRzKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRIb29rcygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldEluc3RydWN0aW9uRmlsZXMoKSB7XG5cdFx0XHRyZXR1cm4gaW5zdHJ1Y3Rpb25GaWxlcy5tYXAoZiA9PiAoe1xuXHRcdFx0XHR1cmk6IGYucHJvbXB0UGF0aC51cmksXG5cdFx0XHRcdG5hbWU6IGYubmFtZSA/PyAnJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGYuZGVzY3JpcHRpb24sXG5cdFx0XHRcdHN0b3JhZ2U6IGYucHJvbXB0UGF0aC5zdG9yYWdlLFxuXHRcdFx0XHRwYXR0ZXJuOiBmLmFwcGx5VG8sXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIHBhcnNlTmV3KHVyaTogVVJJKTogUHJvbWlzZTxQYXJzZWRQcm9tcHRGaWxlPiB7XG5cdFx0XHRjb25zdCBmaWxlID0gaW5zdHJ1Y3Rpb25GaWxlcy5maW5kKGYgPT4gaXNFcXVhbChmLnByb21wdFBhdGgudXJpLCB1cmkpKTtcblx0XHRcdGNvbnN0IGhlYWRlckxpbmVzID0gW107XG5cdFx0XHRoZWFkZXJMaW5lcy5wdXNoKCctLS1cXG4nKTtcblx0XHRcdGlmIChmaWxlKSB7XG5cdFx0XHRcdGlmIChmaWxlLm5hbWUpIHtcblx0XHRcdFx0XHRoZWFkZXJMaW5lcy5wdXNoKGBuYW1lOiAke2ZpbGUubmFtZX1cXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsZS5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGhlYWRlckxpbmVzLnB1c2goYGRlc2NyaXB0aW9uOiAke2ZpbGUuZGVzY3JpcHRpb259XFxuYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZpbGUuYXBwbHlUbykge1xuXHRcdFx0XHRcdGhlYWRlckxpbmVzLnB1c2goYGFwcGx5VG86IFwiJHtmaWxlLmFwcGx5VG99XCJcXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aGVhZGVyTGluZXMucHVzaCgnLS0tXFxuJyk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBuZXcgUHJvbXB0SGVhZGVyKFxuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMSwgaGVhZGVyTGluZXMubGVuZ3RoLCAxKSxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRoZWFkZXJMaW5lc1xuXHRcdFx0KTtcblx0XHRcdHJldHVybiBuZXcgUGFyc2VkUHJvbXB0RmlsZSh1cmksIGhlYWRlcik7XG5cdFx0fVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCk6IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIHtcblx0Y29uc3QgYWN0aXZlUHJvamVjdFJvb3QgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignbW9ja0FjdGl2ZVByb2plY3RSb290JywgVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc1Nlc3Npb25zV2luZG93ID0gZmFsc2U7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgd2VsY29tZVBhZ2VGZWF0dXJlcyA9IHtcblx0XHRcdHNob3dHZXR0aW5nU3RhcnRlZEJhbm5lcjogdHJ1ZSxcblx0XHR9O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVByb2plY3RSb290ID0gYWN0aXZlUHJvamVjdFJvb3Q7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFzT3ZlcnJpZGVQcm9qZWN0Um9vdCA9IG9ic2VydmFibGVWYWx1ZSgnaGFzT3ZlcnJpZGUnLCBmYWxzZSk7XG5cdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSB7IHJldHVybiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U2tpbGxVSUludGVncmF0aW9ucygpIHsgcmV0dXJuIG5ldyBNYXAoKTsgfVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tIYXJuZXNzU2VydmljZSgpOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHtcblx0Y29uc3QgZGVzY3JpcHRvciA9IGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCk7XG5cdGNvbnN0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkk+KCdhY3RpdmVTZXNzaW9uUmVzb3VyY2UnLCBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSk7XG5cdGNvbnN0IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUoYWN0aXZlU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKSkpO1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBhY3RpdmVTZXNzaW9uUmVzb3VyY2U7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlSGFybmVzcyA9IGFjdGl2ZUhhcm5lc3M7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYXZhaWxhYmxlSGFybmVzc2VzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElIYXJuZXNzRGVzY3JpcHRvcltdPignaGFybmVzc2VzJywgW2Rlc2NyaXB0b3JdKTtcblx0XHRvdmVycmlkZSBmaW5kSGFybmVzc0J5SWQoaWQ6IHN0cmluZykgeyByZXR1cm4gaWQgPT09IGRlc2NyaXB0b3IuaWQgPyBkZXNjcmlwdG9yIDogdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlRGVzY3JpcHRvcigpIHsgcmV0dXJuIGRlc2NyaXB0b3I7IH1cblx0XHRvdmVycmlkZSBzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKSB7IGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQoc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblJlc291cmNlRm9ySGFybmVzcygpIHsgcmV0dXJuIGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKTsgfVxuXHRcdG92ZXJyaWRlIHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrV29ya3NwYWNlQ29udGV4dFNlcnZpY2UoKTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHtcblx0XHRcdHJldHVybiB7IGlkOiAndGVzdCcsIGZvbGRlcnM6IFtdIH07XG5cdFx0fVxuXHR9KCk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFJlbmRlciBoZWxwZXJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVySW5zdHJ1Y3Rpb25zVGFiKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGluc3RydWN0aW9uRmlsZXM6IElGaXh0dXJlSW5zdHJ1Y3Rpb25GaWxlW10sIGFnZW50SW5zdHJ1Y3Rpb25GaWxlczogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB3aWR0aCA9IDUwMDtcblx0Y29uc3QgaGVpZ2h0ID0gNDAwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Y29uc3QgY29udGV4dE1lbnVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29udGV4dE1lbnVTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBvbkRpZFNob3dDb250ZXh0TWVudSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgb25EaWRIaWRlQ29udGV4dE1lbnUgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHNob3dDb250ZXh0TWVudSgpOiB2b2lkIHsgfVxuXHR9O1xuXG5cdGNvbnN0IGNvbnRleHRWaWV3U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNvbnRleHRWaWV3U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgYW5jaG9yQWxpZ25tZW50ID0gMDtcblx0XHRvdmVycmlkZSBzaG93Q29udGV4dFZpZXcoKSB7IHJldHVybiB7IGNsb3NlOiAoKSA9PiB7IH0gfTsgfVxuXHRcdG92ZXJyaWRlIGhpZGVDb250ZXh0VmlldygpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIGdldENvbnRleHRWaWV3RWxlbWVudCgpOiBIVE1MRWxlbWVudCB7IHJldHVybiBjdHguY29udGFpbmVyOyB9XG5cdFx0b3ZlcnJpZGUgbGF5b3V0KCk6IHZvaWQgeyB9XG5cdH07XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhjdHguZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNvbnRleHRWaWV3U2VydmljZSwgY29udGV4dFZpZXdTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVByb21wdHNTZXJ2aWNlLCBjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoaW5zdHJ1Y3Rpb25GaWxlcywgYWdlbnRJbnN0cnVjdGlvbkZpbGVzKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIGNyZWF0ZU1vY2tIYXJuZXNzU2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGNyZWF0ZU1vY2tXb3Jrc3BhY2VDb250ZXh0U2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRDdXN0b21pemF0aW9ucygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRSZWdpc3RlcmVkQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXJzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50UGx1Z2luU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRQbHVnaW5TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcGx1Z2lucyA9IG9ic2VydmFibGVWYWx1ZSgncGx1Z2lucycsIFtdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRmlsZXNDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvZHVjdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUGF0aFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBhdGhTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVmYXVsdFVyaVNjaGVtZSA9ICdmaWxlJztcblx0XHRcdFx0b3ZlcnJpZGUgdXNlckhvbWUoKTogVVJJO1xuXHRcdFx0XHRvdmVycmlkZSB1c2VySG9tZSgpOiBQcm9taXNlPFVSST47XG5cdFx0XHRcdG92ZXJyaWRlIHVzZXJIb21lKCk6IFVSSSB8IFByb21pc2U8VVJJPiB7IHJldHVybiBVUkkuZmlsZSgnL2hvbWUvZGV2Jyk7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHQvLyBBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIGlzIHRoZSBzaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBpdGVtc1xuXHRcdFx0Ly8gaW4gdGhlIGVkaXRvci4gUmVnaXN0ZXIgdGhlIHJlYWwgaW1wbGVtZW50YXRpb24gXHUyMDE0IGl0IHdpbGwgcmVzb2x2ZVxuXHRcdFx0Ly8gaXRlbXMgdmlhIHRoZSBtb2NrIHByb21wdHMgc2VydmljZSAvIGhhcm5lc3Mgc2VydmljZSBhYm92ZS5cblx0XHRcdHJlZy5kZWZpbmUoSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHdpZGdldCA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQpXG5cdCk7XG5cdGN0eC5jb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmVsZW1lbnQpO1xuXHRhd2FpdCB3aWRnZXQuc2V0U2VjdGlvbihBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMpO1xuXHR3aWRnZXQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaXh0dXJlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnY2hhdC9haUN1c3RvbWl6YXRpb25zLycgfSwge1xuXG5cdEluc3RydWN0aW9uc1RhYldpdGhJdGVtczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckluc3RydWN0aW9uc1RhYihjdHgsIFtcblx0XHRcdC8vIEFsd2F5cy1hY3RpdmUgaW5zdHJ1Y3Rpb25zIChubyBhcHBseVRvKVxuXHRcdFx0eyBwcm9tcHRQYXRoOiB7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvY29kaW5nLXN0YW5kYXJkcy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LCBuYW1lOiAnQ29kaW5nIFN0YW5kYXJkcycsIGRlc2NyaXB0aW9uOiAnUmVwb3NpdG9yeS13aWRlIGNvZGluZyBzdGFuZGFyZHMnIH0sXG5cdFx0XHR7IHByb21wdFBhdGg6IHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L2luc3RydWN0aW9ucy9teS1zdHlsZS5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH0sIG5hbWU6ICdNeSBTdHlsZScsIGRlc2NyaXB0aW9uOiAnUGVyc29uYWwgY29kaW5nIHN0eWxlIHByZWZlcmVuY2VzJyB9LFxuXHRcdFx0Ly8gQWx3YXlzLWluY2x1ZGVkIGluc3RydWN0aW9uIChhcHBseVRvOiAqKilcblx0XHRcdHsgcHJvbXB0UGF0aDogeyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2dlbmVyYWwtZ3VpZGVsaW5lcy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LCBuYW1lOiAnR2VuZXJhbCBHdWlkZWxpbmVzJywgZGVzY3JpcHRpb246ICdHZW5lcmFsIGRldmVsb3BtZW50IGd1aWRlbGluZXMnLCBhcHBseVRvOiAnKionIH0sXG5cdFx0XHQvLyBPbi1kZW1hbmQgaW5zdHJ1Y3Rpb25zICh3aXRoIGFwcGx5VG8gcGF0dGVybilcblx0XHRcdHsgcHJvbXB0UGF0aDogeyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3Rlc3RpbmctZ3VpZGVsaW5lcy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LCBuYW1lOiAnVGVzdGluZyBHdWlkZWxpbmVzJywgZGVzY3JpcHRpb246ICdUZXN0aW5nIGJlc3QgcHJhY3RpY2VzJywgYXBwbHlUbzogJyoqLyoudGVzdC50cycgfSxcblx0XHRcdHsgcHJvbXB0UGF0aDogeyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3NlY3VyaXR5LXJldmlldy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LCBuYW1lOiAnU2VjdXJpdHkgUmV2aWV3JywgZGVzY3JpcHRpb246ICdTZWN1cml0eSByZXZpZXcgY2hlY2tsaXN0JywgYXBwbHlUbzogJ3NyYy9hdXRoLyoqJyB9LFxuXHRcdFx0eyBwcm9tcHRQYXRoOiB7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9pbnN0cnVjdGlvbnMvdHlwZXNjcmlwdC1ydWxlcy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGV4dGVuc2lvbjogdW5kZWZpbmVkISwgc291cmNlOiB1bmRlZmluZWQhIH0sIG5hbWU6ICdUeXBlU2NyaXB0IFJ1bGVzJywgZGVzY3JpcHRpb246ICdUeXBlU2NyaXB0IGNvbnZlbnRpb25zJywgYXBwbHlUbzogJyoqLyoudHMnIH0sXG5cdFx0XSwgW1xuXHRcdFx0Ly8gQWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgKEFHRU5UUy5tZCwgY29waWxvdC1pbnN0cnVjdGlvbnMubWQpXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvQUdFTlRTLm1kJyksIHJlYWxQYXRoOiB1bmRlZmluZWQsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5hZ2VudHNNZCB9LFxuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnKSwgcmVhbFBhdGg6IHVuZGVmaW5lZCwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCB9LFxuXHRcdF0pLFxuXHR9KSxcblxuXHRJbnN0cnVjdGlvbnNUYWJFbXB0eTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckluc3RydWN0aW9uc1RhYihjdHgsIFtdKSxcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7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
