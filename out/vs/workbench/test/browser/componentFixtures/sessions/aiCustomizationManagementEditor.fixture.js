import * as DOM from "../../../../../base/browser/dom.js";
import { Dimension } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { constObservable, derived, observableValue } from "../../../../../base/common/observable.js";
import { dirname as dirnameUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { PluginFormat } from "../../../../../platform/agentPlugins/common/pluginParsers.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IRequestService } from "../../../../../platform/request/common/request.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { IChatWidgetService } from "../../../../contrib/chat/browser/chat.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { IWorkingCopyService } from "../../../../services/workingCopy/common/workingCopyService.js";
import { IWebviewService } from "../../../../contrib/webview/browser/webview.js";
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from "../../../../contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService, createVSCodeHarnessDescriptor } from "../../../../contrib/chat/common/customizationHarnessService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { getChatSessionType, LocalChatSessionUri } from "../../../../contrib/chat/common/model/chatUri.js";
import { IPromptsService, AgentInstructionFileType, PromptsStorage } from "../../../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { PromptFileParser } from "../../../../contrib/chat/common/promptSyntax/promptFileParser.js";
import { PromptFileSource, PromptsType } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { IAgentPluginService } from "../../../../contrib/chat/common/plugins/agentPluginService.js";
import { IPluginMarketplaceService, MarketplaceType, PluginSourceKind } from "../../../../contrib/chat/common/plugins/pluginMarketplaceService.js";
import { MarketplaceReferenceKind } from "../../../../contrib/chat/common/plugins/marketplaceReference.js";
import { IPluginInstallService } from "../../../../contrib/chat/common/plugins/pluginInstallService.js";
import { AICustomizationManagementEditor } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js";
import { CustomizationMigrationCategoryId } from "../../../../contrib/chat/browser/aiCustomization/customizationMigrationCategories.js";
import { AICustomizationItemsModel, IAICustomizationItemsModel } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js";
import { EmbeddedMcpServerDetail } from "../../../../contrib/chat/browser/aiCustomization/embeddedMcpServerDetail.js";
import { EmbeddedAgentPluginDetail } from "../../../../contrib/chat/browser/aiCustomization/embeddedAgentPluginDetail.js";
import { AgentPluginItemKind } from "../../../../contrib/chat/browser/agentPluginEditor/agentPluginItems.js";
import { ContributionEnablementState } from "../../../../contrib/chat/common/enablement.js";
import { AICustomizationManagementEditorInput } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../../platform/mcp/common/mcpManagement.js";
import { McpServerType } from "../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { ChatConfiguration } from "../../../../contrib/chat/common/constants.js";
import { IAutomationDialogService } from "../../../../contrib/chat/common/automations/automationDialogService.js";
import { IAutomationRunner } from "../../../../contrib/chat/common/automations/automationRunner.js";
import { IAutomationService } from "../../../../contrib/chat/common/automations/automationService.js";
import { IMcpWorkbenchService, IMcpService, McpConnectionState, McpServerInstallState } from "../../../../contrib/mcp/common/mcpTypes.js";
import { IMcpRegistry } from "../../../../contrib/mcp/common/mcpRegistryTypes.js";
import { LocalMcpServerScope } from "../../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { McpListWidget } from "../../../../contrib/chat/browser/aiCustomization/mcpListWidget.js";
import { PluginListWidget } from "../../../../contrib/chat/browser/aiCustomization/pluginListWidget.js";
import { IAgentHostCustomizationService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { McpAuthRequiredReason, McpServerStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { IAgentFeedbackService } from "../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js";
import { ICodeReviewService } from "../../../../../sessions/contrib/codeReview/browser/codeReviewService.js";
import { createMockCodeReviewService } from "./mockCodeReviewService.js";
import { IChatEditingService } from "../../../../contrib/chat/common/editing/chatEditingService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import "../../../../../platform/theme/common/colors/inputColors.js";
import "../../../../../platform/theme/common/colors/listColors.js";
import "../../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css";
const userHome = URI.file("/home/dev");
const BUILTIN_STORAGE = "builtin";
function createMockEditorGroup() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.windowId = mainWindow.vscodeWindowId;
    }
  }();
}
function createMockAICustomizationItemsModel() {
  const itemSource = new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionResource = LocalChatSessionUri.getNewSessionUri();
      this.onDidAICustomizationItemsChange = Event.None;
    }
    async fetchProviderItems() {
      return [];
    }
    async fetchAICustomizationItems(_promptType) {
      return [];
    }
    async fetchSourceFolders(_promptType) {
      return [];
    }
  }();
  return new class extends mock() {
    getItems(_section) {
      return constObservable([]);
    }
    getActiveItemSource() {
      return itemSource;
    }
    getCount(_section) {
      return constObservable(0);
    }
    getPluginCount() {
      return constObservable(0);
    }
    async whenSectionLoaded(_section) {
    }
  }();
}
function mcpLifecycleNoop() {
  return Promise.resolve();
}
function createMockAgentHostCustomizationService(mcpServers = []) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeCustomAgents = Event.None;
      this.onDidChangeCustomizations = Event.None;
    }
    getCustomAgents() {
      return [];
    }
    getCustomizations() {
      return [];
    }
    getWorkingDirectory() {
      return void 0;
    }
    getWorkingDirectories() {
      return [];
    }
    getMcpServers() {
      return mcpServers;
    }
    addMcpServer() {
    }
    async authenticateMcpServer() {
      return true;
    }
  }();
}
function createFixtureAgentHostItemProvider(files) {
  return {
    onDidChange: Event.None,
    async provideChatSessionCustomizations() {
      return files.filter((file) => file.source !== PromptFileSource.UserData).map((file) => ({
        uri: file.uri,
        type: file.type,
        name: file.name ?? "",
        description: file.description,
        source: file.storage,
        extensionId: file.extensionId,
        pluginUri: void 0
      }));
    }
  };
}
function toExtensionInfo(file) {
  if (!file.extensionId) {
    return void 0;
  }
  return {
    identifier: new ExtensionIdentifier(file.extensionId),
    displayName: file.extensionDisplayName
  };
}
function createFixtureFileContent(file) {
  if (file.type === PromptsType.hook) {
    return JSON.stringify({
      name: file.name,
      description: file.description,
      command: "npm test"
    }, null, 2);
  }
  const headerLines = [
    "---",
    `description: ${JSON.stringify(file.description ?? `${file.name ?? "Customization"} description`)}`
  ];
  if (file.type === PromptsType.instructions && file.applyTo) {
    headerLines.push(`applyTo: ${JSON.stringify(file.applyTo)}`);
  }
  if (file.type === PromptsType.agent) {
    headerLines.push("tools:");
    headerLines.push("  - read_file");
    headerLines.push("  - grep_search");
  }
  if (file.type === PromptsType.skill) {
    headerLines.push(`input: ${JSON.stringify("Code review findings")}`);
  }
  if (file.type === PromptsType.prompt) {
    headerLines.push(`argument-hint: ${JSON.stringify("Paste the failing stack trace")}`);
  }
  headerLines.push("---", "");
  return `${headerLines.join("\n")}## Overview

Use **${file.name ?? "this customization"}** when you need consistent AI guidance.

- Review the active change
- Preserve existing conventions
- Explain the reasoning clearly

\`\`\`ts
const ready = true;
\`\`\`
`;
}
function createInstructionFileContent(file) {
  return `---
description: ${JSON.stringify("Repository-level instructions")}
applyTo: ${JSON.stringify("**/*")}
---

## Overview

These instructions apply across the workspace.
`;
}
function createFixtureContentMap(files, instructions) {
  const contents = new ResourceMap();
  for (const file of files) {
    contents.set(file.uri, createFixtureFileContent(file));
  }
  for (const file of instructions) {
    contents.set(file.uri, createInstructionFileContent(file));
  }
  return contents;
}
function createFixtureFileContentStat(resource, value) {
  return {
    resource,
    name: "",
    mtime: 0,
    ctime: 0,
    etag: "",
    size: value.length,
    readonly: false,
    locked: false,
    executable: false,
    value: VSBuffer.fromString(value)
  };
}
function createFixtureFileStat(resource, size, isDirectory) {
  return {
    resource,
    name: "",
    mtime: 0,
    ctime: 0,
    etag: "",
    size,
    readonly: false,
    locked: false,
    executable: false,
    isFile: !isDirectory,
    isDirectory,
    isSymbolicLink: false,
    children: void 0
  };
}
function createMockPromptsService(files, agentInstructions2, contents, onDidChangeFiles) {
  const parser = new PromptFileParser();
  const skillSourceFolders = [
    { uri: URI.file("/workspace/.agents/skills"), searchRoot: URI.file("/workspace/.agents/skills"), filePattern: void 0, source: PromptFileSource.AgentsWorkspace, storage: PromptsStorage.local },
    { uri: URI.file("/workspace/.github/skills"), searchRoot: URI.file("/workspace/.github/skills"), filePattern: void 0, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
    { uri: URI.file("/workspace/.claude/skills"), searchRoot: URI.file("/workspace/.claude/skills"), filePattern: void 0, source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
    { uri: URI.file("/home/dev/.agents/skills"), searchRoot: URI.file("/home/dev/.agents/skills"), filePattern: void 0, source: PromptFileSource.AgentsPersonal, storage: PromptsStorage.user },
    { uri: URI.file("/home/dev/.copilot/skills"), searchRoot: URI.file("/home/dev/.copilot/skills"), filePattern: void 0, source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
    { uri: URI.file("/home/dev/.claude/skills"), searchRoot: URI.file("/home/dev/.claude/skills"), filePattern: void 0, source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user }
  ];
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeCustomAgents = Event.None;
      this.onDidChangeSlashCommands = onDidChangeFiles;
      this.onDidChangeSkills = onDidChangeFiles;
      this.onDidChangeInstructions = Event.None;
      this.onDidChangeAgentInstructions = Event.None;
      this.onDidChangeHooks = Event.None;
    }
    getDisabledPromptFiles() {
      return new ResourceSet();
    }
    getPromptLocationLabel() {
      return "";
    }
    async listPromptFiles(type, _token) {
      return files.filter((f) => f.type === type).map((f) => ({
        uri: f.uri,
        storage: f.storage,
        type: f.type,
        name: f.name,
        description: f.description,
        source: f.source,
        extension: toExtensionInfo(f)
      }));
    }
    async listAgentInstructions() {
      return agentInstructions2;
    }
    async listPromptFilesForStorage(type, storage, _token) {
      return files.filter((f) => f.type === type && f.storage === storage).map((f) => ({
        uri: f.uri,
        storage: f.storage,
        type: f.type,
        name: f.name,
        description: f.description,
        source: f.source,
        extension: toExtensionInfo(f)
      }));
    }
    async getCustomAgents() {
      return files.filter((f) => f.type === PromptsType.agent).map((a) => ({
        uri: a.uri,
        name: a.name ?? "agent",
        description: a.description,
        storage: a.storage,
        source: {
          storage: a.storage,
          extensionId: a.extensionId ? new ExtensionIdentifier(a.extensionId) : void 0
        },
        visibility: { userInvocable: true, agentInvocable: true }
      }));
    }
    async parseNew(uri, _token) {
      return parser.parse(uri, contents.get(uri) ?? "");
    }
    getParsedPromptFile(model) {
      return parser.parse(model.uri, model.getValue());
    }
    async getSourceFolders() {
      return [];
    }
    async getResolvedSourceFolders(type) {
      if (type === PromptsType.skill) {
        return skillSourceFolders;
      }
      return [];
    }
    async getInstructionFiles() {
      return files.filter((f) => f.type === PromptsType.instructions).map((f) => ({
        uri: f.uri,
        name: f.name ?? "",
        description: f.description,
        storage: f.storage,
        pattern: f.applyTo,
        extension: toExtensionInfo(f)
      }));
    }
    async findAgentSkills() {
      return files.filter((f) => f.type === PromptsType.skill).map((f) => ({
        uri: f.uri,
        storage: f.storage,
        name: f.name ?? "skill",
        description: f.description,
        disableModelInvocation: false,
        userInvocable: true
      }));
    }
    async getPromptSlashCommands() {
      const promptFiles = files.filter((f) => f.type === PromptsType.prompt);
      const commands = await Promise.all(promptFiles.map(async (f) => {
        return {
          uri: f.uri,
          userInvocable: true,
          name: f.name ?? "prompt",
          description: f.description,
          argumentHint: void 0,
          type: f.type,
          storage: f.storage,
          source: void 0,
          extension: toExtensionInfo(f)
        };
      }));
      return commands;
    }
  }();
}
function createMockHarnessService(sessionResource, descriptors) {
  const activeSessionResource = observableValue("activeSessionResource", sessionResource);
  const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSessionResource = activeSessionResource;
      this.activeHarness = activeHarness;
      this.availableHarnesses = constObservable(descriptors);
    }
    findHarnessById(id) {
      return descriptors.find((h) => h.id === id);
    }
    getActiveDescriptor() {
      return descriptors.find((h) => h.id === activeHarness.get()) ?? descriptors[0];
    }
    setActiveSession(sessionResource2) {
      activeSessionResource.set(sessionResource2, void 0);
    }
    registerExternalHarness() {
      return { dispose() {
      } };
    }
  }();
}
function makeLocalMcpServer(id, label, scope, description, config) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = id;
      this.name = id;
      this.label = label;
      this.description = description ?? "";
      this.config = config;
      this.installState = McpServerInstallState.Installed;
      this.local = new class extends mock() {
        constructor() {
          super(...arguments);
          this.id = id;
          this.scope = scope;
        }
      }();
    }
  }();
}
function createMockAgentFeedbackService() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeFeedback = Event.None;
      this.onDidChangeNavigation = Event.None;
      this.onDidChangeFeedbackScope = Event.None;
      this.onDidAddFeedback = Event.None;
      this.onDidConvertFeedback = Event.None;
      this.onDidAddReply = Event.None;
      this.onDidSubmitFeedback = Event.None;
    }
    getFeedback() {
      return [];
    }
    getSessionForFile() {
      return void 0;
    }
    getFeedbackSessionResource() {
      return void 0;
    }
    getMostRecentSessionForResource() {
      return void 0;
    }
    async revealFeedback() {
    }
    getNextFeedback() {
      return void 0;
    }
    getNavigationBearing() {
      return { activeIdx: -1, totalCount: 0 };
    }
    getNextNavigableItem() {
      return void 0;
    }
    setNavigationAnchor() {
    }
    clearFeedback() {
    }
    removeFeedback() {
    }
    async addFeedbackAndSubmit() {
    }
  }();
}
const allFiles = [
  // Instructions - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/instructions/coding.instructions.md"), storage: PromptsStorage.extension, type: PromptsType.instructions, name: "Copilot Coding", description: "Built-in coding guidance", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/instructions/team.instructions.md"), storage: PromptsStorage.extension, type: PromptsType.instructions, name: "Team Conventions", description: "Third-party extension instructions", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Instructions — workspace
  { uri: URI.file("/workspace/.github/instructions/coding-standards.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Coding Standards", description: "Repository-wide coding standards" },
  { uri: URI.file("/workspace/.github/instructions/testing.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Testing", description: "Testing best practices", applyTo: "**/*.test.ts" },
  { uri: URI.file("/workspace/.github/instructions/security.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Security", description: "Security review checklist", applyTo: "src/auth/**" },
  { uri: URI.file("/workspace/.github/instructions/accessibility.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Accessibility", description: "WCAG compliance guidelines", applyTo: "**/*.tsx" },
  { uri: URI.file("/workspace/.github/instructions/api-design.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "API Design", description: "REST API design conventions" },
  { uri: URI.file("/workspace/.github/instructions/performance.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Performance", description: "Performance optimization rules", applyTo: "src/core/**" },
  { uri: URI.file("/workspace/.github/instructions/error-handling.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Error Handling", description: "Error handling patterns" },
  { uri: URI.file("/workspace/.github/instructions/database.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Database", description: "Database migration and query patterns", applyTo: "src/db/**" },
  // Instructions — user
  { uri: URI.file("/user-data/prompts/personal.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData, name: "Personal Instructions", description: "VS Code profile instructions" },
  { uri: URI.file("/home/dev/.copilot/instructions/my-style.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "My Style", description: "Personal coding style" },
  { uri: URI.file("/home/dev/.copilot/instructions/typescript-rules.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "TypeScript Rules", description: "Strict TypeScript conventions" },
  { uri: URI.file("/home/dev/.copilot/instructions/commit-messages.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "Commit Messages", description: "Conventional commit format" },
  // Instructions — Claude rules
  { uri: URI.file("/workspace/.claude/rules/code-style.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Code Style", description: "Claude code style rules" },
  { uri: URI.file("/workspace/.claude/rules/testing.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Testing", description: "Claude testing conventions" },
  { uri: URI.file("/home/dev/.claude/rules/personal.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "Personal", description: "Personal rules" },
  // Agents — workspace
  { uri: URI.file("/workspace/.github/agents/reviewer.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Reviewer", description: "Code review agent" },
  { uri: URI.file("/workspace/.github/agents/documenter.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Documenter", description: "Documentation agent" },
  { uri: URI.file("/workspace/.github/agents/tester.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Tester", description: "Test generation and validation" },
  { uri: URI.file("/workspace/.github/agents/refactorer.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Refactorer", description: "Code refactoring specialist" },
  { uri: URI.file("/workspace/.github/agents/security-auditor.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Security Auditor", description: "Security vulnerability scanner" },
  { uri: URI.file("/workspace/.github/agents/api-designer.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "API Designer", description: "REST and GraphQL API design" },
  { uri: URI.file("/workspace/.github/agents/performance-tuner.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Performance Tuner", description: "Performance profiling and optimization" },
  // Agents — user
  { uri: URI.file("/user-data/prompts/legacy.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData, name: "Legacy Agent", description: "VS Code profile agent" },
  { uri: URI.file("/home/dev/.copilot/agents/planner.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, name: "Planner", description: "Project planning agent" },
  { uri: URI.file("/home/dev/.copilot/agents/debugger.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, name: "Debugger", description: "Interactive debugging assistant" },
  { uri: URI.file("/home/dev/.copilot/agents/nls-helper.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, name: "NLS Helper", description: "Natural language searching code for clarity" },
  // Agents - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/agents/workspace-guide.agent.md"), storage: PromptsStorage.extension, type: PromptsType.agent, name: "Workspace Guide", description: "Built-in workspace exploration agent", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/agents/api-helper.agent.md"), storage: PromptsStorage.extension, type: PromptsType.agent, name: "API Helper", description: "Third-party API agent", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Skills — workspace
  { uri: URI.file("/workspace/.github/skills/deploy/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Deploy", description: "Deployment automation" },
  { uri: URI.file("/workspace/.github/skills/refactor/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Refactor", description: "Code refactoring patterns" },
  { uri: URI.file("/workspace/.github/skills/unit-tests/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Unit Tests", description: "Test generation and runner integration" },
  { uri: URI.file("/workspace/.github/skills/ci-fix/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "CI Fix", description: "Diagnose and fix CI failures" },
  { uri: URI.file("/workspace/.github/skills/migration/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Migration", description: "Database migration generation" },
  { uri: URI.file("/workspace/.github/skills/accessibility/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Accessibility", description: "ARIA labels and keyboard navigation" },
  { uri: URI.file("/workspace/.github/skills/docker/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Docker", description: "Dockerfile and compose generation" },
  { uri: URI.file("/workspace/.github/skills/api-docs/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "API Docs", description: "OpenAPI spec generation" },
  // Skills — user
  { uri: URI.file("/home/dev/.copilot/skills/git-workflow/SKILL.md"), storage: PromptsStorage.user, type: PromptsType.skill, name: "Git Workflow", description: "Branch and PR workflows" },
  { uri: URI.file("/home/dev/.copilot/skills/code-review/SKILL.md"), storage: PromptsStorage.user, type: PromptsType.skill, name: "Code Review", description: "Structured code review checklist" },
  // Skills - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/skills/workspace/SKILL.md"), storage: PromptsStorage.extension, type: PromptsType.skill, name: "Workspace Search", description: "Built-in workspace search skill", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/skills/audit/SKILL.md"), storage: PromptsStorage.extension, type: PromptsType.skill, name: "Audit", description: "Third-party audit skill", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Skills - built-in (sessions bundled skills with UI integrations)
  { uri: URI.file("/app/skills/act-on-feedback/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "act-on-feedback", description: "Act on user feedback attached to the current session" },
  { uri: URI.file("/app/skills/generate-run-commands/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "generate-run-commands", description: "Generate or modify run commands for the current session" },
  { uri: URI.file("/app/skills/commit/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "commit", description: "Commit staged or unstaged changes with an AI-generated commit message" },
  { uri: URI.file("/app/skills/create-pr/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "create-pr", description: "Create a pull request for the current session" },
  // Prompts — workspace
  { uri: URI.file("/workspace/.github/prompts/explain.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Explain", description: "Explain selected code" },
  { uri: URI.file("/workspace/.github/prompts/review.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Review", description: "Review changes" },
  { uri: URI.file("/workspace/.github/prompts/fix-bug.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Fix Bug", description: "Diagnose and fix a bug from issue" },
  { uri: URI.file("/workspace/.github/prompts/write-tests.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Write Tests", description: "Generate unit tests for selection" },
  { uri: URI.file("/workspace/.github/prompts/add-docs.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Add Docs", description: "Add JSDoc comments to functions" },
  { uri: URI.file("/workspace/.github/prompts/optimize.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Optimize", description: "Optimize code for performance" },
  { uri: URI.file("/workspace/.github/prompts/convert-to-ts.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Convert to TS", description: "Convert JavaScript to TypeScript" },
  { uri: URI.file("/workspace/.github/prompts/summarize-pr.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Summarize PR", description: "Generate PR description from diff" },
  // Prompts — user
  { uri: URI.file("/user-data/prompts/profile.prompt.md"), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData, name: "Profile Prompt", description: "VS Code profile prompt" },
  { uri: URI.file("/home/dev/.copilot/prompts/translate.prompt.md"), storage: PromptsStorage.user, type: PromptsType.prompt, name: "Translate", description: "Translate strings for i18n" },
  { uri: URI.file("/home/dev/.copilot/prompts/commit-msg.prompt.md"), storage: PromptsStorage.user, type: PromptsType.prompt, name: "Commit Message", description: "Generate conventional commit" },
  // Prompts - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/prompts/trace.prompt.md"), storage: PromptsStorage.extension, type: PromptsType.prompt, name: "Trace", description: "Built-in tracing prompt", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/prompts/lint.prompt.md"), storage: PromptsStorage.extension, type: PromptsType.prompt, name: "Lint", description: "Third-party lint prompt", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Hooks — workspace
  { uri: URI.file("/workspace/.github/hooks/pre-commit.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Pre-Commit Lint", description: "Run linting before commit" },
  { uri: URI.file("/workspace/.github/hooks/post-save.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Post-Save Format", description: "Auto-format on save" },
  { uri: URI.file("/workspace/.github/hooks/on-test-fail.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "On Test Failure", description: "Suggest fix when tests fail" },
  { uri: URI.file("/workspace/.github/hooks/pre-push.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Pre-Push Check", description: "Run type-check before push" },
  { uri: URI.file("/workspace/.github/hooks/post-create.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Post-Create", description: "Initialize boilerplate for new files" },
  { uri: URI.file("/workspace/.github/hooks/on-error.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "On Error", description: "Log and report unhandled errors" },
  { uri: URI.file("/workspace/.github/hooks/post-tool-call.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Post Tool Call", description: "Echo confirmation after each tool call" },
  { uri: URI.file("/workspace/.github/hooks/on-build-fail.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "On Build Failure", description: "Auto-diagnose build errors" },
  // Hooks — user
  { uri: URI.file("/home/dev/.copilot/hooks/daily-summary.json"), storage: PromptsStorage.user, type: PromptsType.hook, name: "Daily Summary", description: "Generate daily work summary" },
  { uri: URI.file("/home/dev/.copilot/hooks/backup-changes.json"), storage: PromptsStorage.user, type: PromptsType.hook, name: "Backup Changes", description: "Auto-stash uncommitted changes" }
];
const agentInstructions = [
  { uri: URI.file("/workspace/AGENTS.md"), realPath: void 0, type: AgentInstructionFileType.agentsMd },
  { uri: URI.file("/workspace/CLAUDE.md"), realPath: void 0, type: AgentInstructionFileType.claudeMd },
  { uri: URI.file("/workspace/.github/copilot-instructions.md"), realPath: void 0, type: AgentInstructionFileType.copilotInstructionsMd }
];
const mcpWorkspaceServers = [
  makeLocalMcpServer(
    "component-explorer",
    "component-explorer",
    LocalMcpServerScope.Workspace,
    "Component fixtures and screenshot tooling",
    {
      type: McpServerType.LOCAL,
      command: "npm",
      args: ["exec", "--no", "--", "component-explorer", "mcp", "-p", "./test/componentFixtures/component-explorer.json", "--use-daemon", "-vv"]
    }
  ),
  makeLocalMcpServer("mcp-postgres", "PostgreSQL", LocalMcpServerScope.Workspace, "Database access"),
  makeLocalMcpServer("mcp-github", "GitHub", LocalMcpServerScope.Workspace, "GitHub API"),
  makeLocalMcpServer("mcp-redis", "Redis", LocalMcpServerScope.Workspace, "In-memory data store"),
  makeLocalMcpServer("mcp-docker", "Docker", LocalMcpServerScope.Workspace, "Container management"),
  makeLocalMcpServer("mcp-slack", "Slack", LocalMcpServerScope.Workspace, "Team messaging"),
  makeLocalMcpServer("mcp-jira", "Jira", LocalMcpServerScope.Workspace, "Issue tracking"),
  makeLocalMcpServer("mcp-aws", "AWS", LocalMcpServerScope.Workspace, "Amazon Web Services"),
  makeLocalMcpServer("mcp-graphql", "GraphQL", LocalMcpServerScope.Workspace, "GraphQL API gateway")
];
const mcpUserServers = [
  makeLocalMcpServer("mcp-web-search", "Web Search", LocalMcpServerScope.User, "Search the web"),
  makeLocalMcpServer("mcp-filesystem", "Filesystem", LocalMcpServerScope.User, "Local file operations"),
  makeLocalMcpServer("mcp-puppeteer", "Puppeteer", LocalMcpServerScope.User, "Browser automation")
];
const mcpRuntimeServers = [
  { definition: { id: "github-copilot-mcp", label: "GitHub Copilot" }, collection: { id: "ext.github.copilot/mcp", label: "ext.github.copilot/mcp" }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Starting }), showOutput() {
  } },
  { definition: { id: "mcp-postgres", label: "PostgreSQL" }, collection: { id: "workspace-mcp", label: "Workspace MCP" }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Error }), showOutput() {
  } },
  { definition: { id: "mcp-web-search", label: "Web Search" }, collection: { id: "user-mcp", label: "User MCP" }, enablement: constObservable(ContributionEnablementState.DisabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Stopped }), showOutput() {
  } },
  { definition: { id: "mcp-filesystem", label: "Filesystem" }, collection: { id: "user-mcp", label: "User MCP" }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Stopped }), showOutput() {
  } }
];
const activeSessionMcpServers = [
  { id: "mcp-top-level:fixture:session:component-explorer", name: "component-explorer", enabled: true, status: McpServerStatus.Ready, state: { kind: McpServerStatus.Ready }, logOutputChannelId: "fixture-agent-host", start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() {
  } },
  { id: "mcp-top-level:fixture:session:Remote Browser", name: "Remote Browser", enabled: true, status: McpServerStatus.AuthRequired, state: { kind: McpServerStatus.AuthRequired, reason: McpAuthRequiredReason.Required, resource: { resource: "https://mcp.example.com" } }, logOutputChannelId: "fixture-agent-host", start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() {
  } },
  { id: "mcp-top-level:fixture:session:Remote Search", name: "Remote Search", enabled: true, status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: "fixture", message: "Fixture error" } }, logOutputChannelId: "fixture-agent-host", start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() {
  } }
];
function renderFixtureMarkdown(markdown) {
  const container = DOM.$("div.fixture-rendered-markdown");
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      index++;
      continue;
    }
    if (line.startsWith("## ")) {
      const heading = DOM.append(container, DOM.$("h2"));
      heading.textContent = line.slice(3);
      index++;
      continue;
    }
    if (line.startsWith("- ")) {
      const list = DOM.append(container, DOM.$("ul"));
      while (index < lines.length && lines[index].trimStart().startsWith("- ")) {
        DOM.append(list, DOM.$("li")).textContent = lines[index].trimStart().slice(2);
        index++;
      }
      continue;
    }
    if (line.startsWith("```")) {
      index++;
      const codeLines = [];
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }
      const pre = DOM.append(container, DOM.$("pre"));
      DOM.append(pre, DOM.$("code")).textContent = codeLines.join("\n");
      index++;
      continue;
    }
    const paragraph = DOM.append(container, DOM.$("p"));
    paragraph.textContent = line.replace(/\*\*/g, "");
    index++;
  }
  return container;
}
async function renderEditor(ctx, options) {
  const width = options.width ?? 900;
  const height = options.height ?? 600;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const isSessionsWindow = options.isSessionsWindow ?? false;
  const skillUIIntegrations = options.skillUIIntegrations ?? /* @__PURE__ */ new Map();
  const managementSections = options.managementSections ?? [
    AICustomizationManagementSection.Agents,
    AICustomizationManagementSection.Skills,
    AICustomizationManagementSection.Instructions,
    AICustomizationManagementSection.Hooks,
    AICustomizationManagementSection.Prompts,
    AICustomizationManagementSection.McpServers,
    AICustomizationManagementSection.Plugins
  ];
  const availableHarnesses = options.availableHarnesses ?? [
    createVSCodeHarnessDescriptor(),
    {
      id: "agent-host-copilotcli",
      label: "Copilot [Agent Host]",
      icon: ThemeIcon.fromId(Codicon.server.id),
      hiddenSections: [AICustomizationManagementSection.Prompts],
      hideGenerateButton: true,
      itemProvider: createFixtureAgentHostItemProvider(allFiles)
    }
  ];
  const allMcpServers = [...mcpWorkspaceServers, ...mcpUserServers];
  const fixtureFiles = allFiles.map((file) => ({ ...file }));
  const fileContents = createFixtureContentMap(fixtureFiles, agentInstructions);
  const promptFilesDidChangeEmitter = ctx.disposableStore.add(new Emitter());
  const createdFolders = new ResourceSet();
  const modelServiceRef = { value: void 0 };
  const languageServiceRef = { value: void 0 };
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      const harnessService = createMockHarnessService(options.sessionResource, availableHarnesses);
      const agentFeedbackService = createMockAgentFeedbackService();
      const codeReviewService = createMockCodeReviewService();
      registerWorkbenchServices(reg);
      reg.defineInstance(IConfigurationService, new TestConfigurationService({
        [ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: true,
        [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
        [ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true
      }));
      reg.define(IListService, ListService);
      reg.defineInstance(ITextModelService, new class extends mock() {
        async createModelReference(resource) {
          const modelService = modelServiceRef.value;
          const languageService = languageServiceRef.value;
          let model = modelService.getModel(resource);
          if (!model) {
            const languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? "plaintext";
            const languageSelection = languageService.createById(languageId);
            model = modelService.createModel("", languageSelection, resource);
          }
          const onWillDispose = new Emitter();
          const textEditorModel = {
            textEditorModel: model,
            onWillDispose: onWillDispose.event,
            isReadonly: () => false,
            isResolved: () => true,
            isDisposed: () => false,
            getLanguageId: () => model.getLanguageId(),
            createSnapshot: () => model.createSnapshot(),
            resolve: async () => {
            },
            dispose: () => onWillDispose.dispose()
          };
          return { object: textEditorModel, dispose: () => {
          } };
        }
        canHandleResource() {
          return true;
        }
        registerTextModelContentProvider() {
          return { dispose: () => {
          } };
        }
      }());
      reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
      reg.defineInstance(ICodeReviewService, codeReviewService);
      reg.defineInstance(IChatEditingService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.editingSessionsObs = constObservable([]);
        }
      }());
      reg.defineInstance(IAgentSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.model = new class extends mock() {
            constructor() {
              super(...arguments);
              this.sessions = [];
            }
          }();
        }
        getSession() {
          return void 0;
        }
      }());
      reg.defineInstance(IPromptsService, createMockPromptsService(fixtureFiles, agentInstructions, fileContents, promptFilesDidChangeEmitter.event));
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = isSessionsWindow;
          this.welcomePageFeatures = {
            showGettingStartedBanner: true
          };
          this.activeProjectRoot = observableValue("root", URI.file("/workspace"));
          this.hasOverrideProjectRoot = observableValue("hasOverride", false);
          this.managementSections = managementSections;
        }
        getActiveProjectRoot() {
          return URI.file("/workspace");
        }
        clearOverrideProjectRoot() {
        }
        setOverrideProjectRoot() {
        }
        async generateCustomization() {
        }
        getSkillUIIntegrations() {
          return skillUIIntegrations;
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, harnessService);
      reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService(options.activeSessionMcpServers));
      reg.define(IAICustomizationItemsModel, AICustomizationItemsModel);
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
        hasCustomizationsProvider() {
          return false;
        }
      }());
      reg.defineInstance(IAutomationService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.automations = constObservable([]);
          this.runs = constObservable([]);
        }
        runsFor() {
          return constObservable([]);
        }
      }());
      reg.defineInstance(IAutomationRunner, new class extends mock() {
      }());
      reg.defineInstance(IAutomationDialogService, new class extends mock() {
        async showAutomationDialog() {
          return void 0;
        }
      }());
      reg.defineInstance(IEditorService, new class extends mock() {
      }());
      reg.defineInstance(IEditorGroupsService, new class extends mock() {
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "test", folders: [] };
        }
        getWorkbenchState() {
          return WorkbenchState.WORKSPACE;
        }
      }());
      reg.defineInstance(IFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidFilesChange = Event.None;
        }
        async exists(resource) {
          return fileContents.has(resource) || createdFolders.has(resource);
        }
        async readFile(resource) {
          const value = fileContents.get(resource) ?? "";
          return createFixtureFileContentStat(resource, value);
        }
        async createFolder(resource) {
          createdFolders.add(resource);
          return createFixtureFileStat(resource, 0, true);
        }
        async writeFile(resource, buffer) {
          fileContents.set(resource, buffer.toString());
          createdFolders.add(dirnameUri(resource));
          if (resource.path.endsWith("/SKILL.md") && !fixtureFiles.some((file) => file.uri.toString() === resource.toString())) {
            const skillName = resource.path.split("/").at(-2) ?? "migrated-skill";
            fixtureFiles.push({
              uri: resource,
              storage: resource.path.startsWith("/workspace/") ? PromptsStorage.local : PromptsStorage.user,
              type: PromptsType.skill,
              name: skillName,
              description: `Migrated from prompt ${skillName}`
            });
          }
          promptFilesDidChangeEmitter.fire();
          return createFixtureFileStat(resource, buffer.byteLength, false);
        }
        async del(resource) {
          fileContents.delete(resource);
          const fileIndex = fixtureFiles.findIndex((file) => file.uri.toString() === resource.toString());
          if (fileIndex >= 0) {
            fixtureFiles.splice(fileIndex, 1);
          }
          promptFilesDidChangeEmitter.fire();
        }
      }());
      reg.defineInstance(IPathService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.defaultUriScheme = "file";
        }
        userHome() {
          return userHome;
        }
      }());
      reg.defineInstance(ITextModelService, new class extends mock() {
        async createModelReference(resource) {
          const modelService = modelServiceRef.value;
          const languageService = languageServiceRef.value;
          let model = modelService.getModel(resource);
          if (!model) {
            const languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? "plaintext";
            const languageSelection = languageService.createById(languageId);
            model = modelService.createModel(fileContents.get(resource) ?? "", languageSelection, resource);
          }
          const onWillDispose = new Emitter();
          const textEditorModel = {
            textEditorModel: model,
            onWillDispose: onWillDispose.event,
            isReadonly: () => false,
            isResolved: () => true,
            isDisposed: () => false,
            getLanguageId: () => model.getLanguageId(),
            createSnapshot: () => model.createSnapshot(),
            resolve: async () => {
            },
            dispose: () => onWillDispose.dispose()
          };
          return { object: textEditorModel, dispose: () => {
          } };
        }
        canHandleResource() {
          return true;
        }
        registerTextModelContentProvider() {
          return { dispose: () => {
          } };
        }
      }());
      reg.defineInstance(IWorkingCopyService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDirty = Event.None;
          this.onDidSave = Event.None;
        }
        isDirty(_resource) {
          return false;
        }
      }());
      reg.defineInstance(IExtensionService, new class extends mock() {
      }());
      reg.defineInstance(IQuickInputService, new class extends mock() {
      }());
      reg.defineInstance(IViewsService, new class extends mock() {
        async openView(_id, _focus) {
          return null;
        }
      }());
      reg.defineInstance(IOutputService, new class extends mock() {
        async showChannel() {
        }
      }());
      reg.defineInstance(IChatWidgetService, new class extends mock() {
        get lastFocusedWidget() {
          return void 0;
        }
        async reveal() {
          return false;
        }
      }());
      reg.defineInstance(IRequestService, new class extends mock() {
      }());
      reg.defineInstance(IMarkdownRendererService, new class extends mock() {
        render(markdown) {
          const rendered = {
            element: renderFixtureMarkdown(typeof markdown === "string" ? markdown : markdown.value),
            dispose() {
            }
          };
          return rendered;
        }
      }());
      reg.defineInstance(IWebviewService, new class extends mock() {
      }());
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = allMcpServers;
        }
        async queryLocal() {
          return allMcpServers;
        }
        canInstall() {
          return true;
        }
      }());
      reg.defineInstance(IMcpService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.servers = constObservable(mcpRuntimeServers);
        }
      }());
      reg.defineInstance(IMcpRegistry, new class extends mock() {
        constructor() {
          super(...arguments);
          this.collections = constObservable([]);
          this.delegates = constObservable([]);
          this.onDidChangeInputs = Event.None;
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable(installedPlugins);
          this.enablementModel = void 0;
        }
      }());
      reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.installedPlugins = constObservable([]);
          this.onDidChangeMarketplaces = Event.None;
        }
      }());
      reg.defineInstance(IPluginInstallService, new class extends mock() {
      }());
      reg.defineInstance(IProductService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.defaultChatAgent = new class extends mock() {
            constructor() {
              super(...arguments);
              this.chatExtensionId = "GitHub.copilot-chat";
            }
          }();
        }
      }());
    }
  });
  modelServiceRef.value = instantiationService.get(IModelService);
  languageServiceRef.value = instantiationService.get(ILanguageService);
  for (const [uri, content] of fileContents) {
    if (!modelServiceRef.value.getModel(uri)) {
      const model = modelServiceRef.value.createModel(content, null, uri, false);
      ctx.disposableStore.add({ dispose: () => model.dispose() });
    }
  }
  const editor = ctx.disposableStore.add(
    instantiationService.createInstance(AICustomizationManagementEditor, createMockEditorGroup())
  );
  editor.create(ctx.container);
  editor.layout(new Dimension(width, height));
  const editorInput = ctx.disposableStore.add(AICustomizationManagementEditorInput.getOrCreate());
  await editor.setInput(editorInput, void 0, {}, CancellationToken.None);
  if (options.selectedSection) {
    editor.selectSectionById(options.selectedSection);
  }
  if (options.scrollToBottom) {
    editor.revealLastItem();
  }
  if (options.migrationCategory) {
    editor.showCustomizationMigrationPage(options.migrationCategory);
  }
  if (options.openFirstItem) {
    const visibleContent = [...ctx.container.querySelectorAll(".prompts-content-container, .mcp-content-container, .plugin-content-container")].find((node) => node instanceof HTMLElement && node.style.display !== "none");
    const openItemLabel = options.openItemLabel;
    const rowToOpen = openItemLabel ? [...visibleContent?.querySelectorAll(".monaco-list-row") ?? []].find((row) => row instanceof HTMLElement && row.textContent?.includes(openItemLabel)) : visibleContent?.querySelector(".monaco-list-row.ai-customization-list-item, .monaco-list-row.mcp-server-item");
    if (rowToOpen) {
      rowToOpen.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      rowToOpen.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      rowToOpen.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      rowToOpen.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      if (options.editorDisplayMode === "raw") {
        const modeButton = ctx.container.querySelector(".editor-mode-button");
        modeButton?.click();
      }
    }
  }
}
function makeGalleryServer(id, label, description, publisher) {
  const galleryStub = new class extends mock() {
  }();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = id;
      this.name = id;
      this.label = label;
      this.description = description;
      this.publisherDisplayName = publisher;
      this.installState = McpServerInstallState.Uninstalled;
      this.gallery = galleryStub;
      this.local = void 0;
    }
  }();
}
const galleryServers = [
  makeGalleryServer("gallery-postgres", "PostgreSQL", "Access PostgreSQL databases with schema inspection and query tools", "Microsoft"),
  makeGalleryServer("gallery-github", "GitHub", "Repository management, issues, pull requests, and code search", "GitHub"),
  makeGalleryServer("gallery-slack", "Slack", "Send messages, manage channels, and search workspace history", "Slack Technologies"),
  makeGalleryServer("gallery-docker", "Docker", "Container lifecycle management and image operations", "Docker Inc"),
  makeGalleryServer("gallery-filesystem", "Filesystem", "Read, write, and navigate local files and directories", "Microsoft"),
  makeGalleryServer("gallery-brave", "Brave Search", "Web and local search powered by the Brave Search API", "Brave Software"),
  makeGalleryServer("gallery-puppeteer", "Puppeteer", "Browser automation with screenshots, navigation, and form filling", "Google"),
  makeGalleryServer("gallery-memory", "Memory", "Knowledge graph for persistent memory across conversations", "Microsoft"),
  makeGalleryServer("gallery-fetch", "Fetch", "Retrieve and convert web content to markdown for analysis", "Microsoft"),
  makeGalleryServer("gallery-sentry", "Sentry", "Error monitoring, issue tracking, and performance tracing", "Sentry"),
  makeGalleryServer("gallery-sqlite", "SQLite", "Query and manage SQLite databases with schema exploration", "Community"),
  makeGalleryServer("gallery-redis", "Redis", "In-memory data store operations and key management", "Redis Ltd")
];
async function renderMcpBrowseMode(ctx) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = [];
        }
        async queryLocal() {
          return [];
        }
        canInstall() {
          return true;
        }
        async queryGallery() {
          return {
            firstPage: { items: galleryServers, hasMore: false },
            async getNextPage() {
              return { items: [], hasMore: false };
            }
          };
        }
      }());
      reg.defineInstance(IMcpService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.servers = constObservable([]);
        }
      }());
      reg.defineInstance(IMcpRegistry, new class extends mock() {
        constructor() {
          super(...arguments);
          this.collections = constObservable([]);
          this.delegates = constObservable([]);
          this.onDidChangeInputs = Event.None;
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable([]);
        }
      }());
      reg.defineInstance(IDialogService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = false;
          this.welcomePageFeatures = {
            showGettingStartedBanner: true
          };
          this.activeProjectRoot = observableValue("root", URI.file("/workspace"));
          this.hasOverrideProjectRoot = observableValue("hasOverride", false);
        }
        getActiveProjectRoot() {
          return URI.file("/workspace");
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService());
      reg.defineInstance(IOutputService, new class extends mock() {
        async showChannel() {
        }
      }());
    }
  });
  const widget = ctx.disposableStore.add(
    instantiationService.createInstance(McpListWidget)
  );
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
  const browseButton = widget.element.querySelector(".list-add-button");
  browseButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
}
function makeInstalledPlugin(name, uri, enabled) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.uri = uri;
      this.format = PluginFormat.Copilot;
      this.label = name;
      this.enablement = constObservable(enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile);
      this.hooks = constObservable([]);
      this.commands = constObservable([]);
      this.skills = constObservable([]);
      this.agents = constObservable([]);
      this.instructions = constObservable([]);
      this.mcpServerDefinitions = constObservable([]);
    }
    remove() {
    }
  }();
}
const installedPlugins = [
  makeInstalledPlugin("Linear", URI.file("/workspace/.copilot/plugins/linear"), true),
  makeInstalledPlugin("Sentry", URI.file("/workspace/.copilot/plugins/sentry"), true),
  makeInstalledPlugin("Datadog", URI.file("/workspace/.copilot/plugins/datadog"), true),
  makeInstalledPlugin("Notion", URI.file("/workspace/.copilot/plugins/notion"), true),
  makeInstalledPlugin("Confluence", URI.file("/workspace/.copilot/plugins/confluence"), true),
  makeInstalledPlugin("PagerDuty", URI.file("/workspace/.copilot/plugins/pagerduty"), false),
  makeInstalledPlugin("LaunchDarkly", URI.file("/workspace/.copilot/plugins/launchdarkly"), true),
  makeInstalledPlugin("CircleCI", URI.file("/workspace/.copilot/plugins/circleci"), true),
  makeInstalledPlugin("Vercel", URI.file("/workspace/.copilot/plugins/vercel"), false),
  makeInstalledPlugin("Supabase", URI.file("/workspace/.copilot/plugins/supabase"), true)
];
function makeMarketplacePlugin(name, description, repo) {
  return {
    name,
    description,
    version: "1.0.0",
    source: repo,
    sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: `example/${repo}` },
    marketplace: "copilot",
    marketplaceReference: { rawValue: `example/${repo}`, displayLabel: repo, cloneUrl: `https://github.com/example/${repo}.git`, canonicalId: `github:example/${repo}`, cacheSegments: ["example", repo], kind: MarketplaceReferenceKind.GitHubShorthand },
    marketplaceType: MarketplaceType.Copilot
  };
}
const marketplacePlugins = [
  makeMarketplacePlugin("Linear", "Issue tracking and project management integration", "linear-plugin"),
  makeMarketplacePlugin("Sentry", "Error monitoring and performance tracing", "sentry-plugin"),
  makeMarketplacePlugin("Datadog", "Observability and monitoring dashboards", "datadog-plugin"),
  makeMarketplacePlugin("Notion", "Knowledge base and documentation management", "notion-plugin"),
  makeMarketplacePlugin("Figma", "Design system inspection and asset export", "figma-plugin"),
  makeMarketplacePlugin("Stripe", "Payment processing and billing management", "stripe-plugin"),
  makeMarketplacePlugin("Twilio", "Communication APIs for SMS and voice", "twilio-plugin"),
  makeMarketplacePlugin("Auth0", "Identity and access management", "auth0-plugin"),
  makeMarketplacePlugin("Algolia", "Search and discovery API integration", "algolia-plugin"),
  makeMarketplacePlugin("LaunchDarkly", "Feature flag management and experimentation", "launchdarkly-plugin"),
  makeMarketplacePlugin("PlanetScale", "Serverless MySQL database management", "planetscale-plugin"),
  makeMarketplacePlugin("Vercel", "Deployment and preview environments", "vercel-plugin")
];
async function renderPluginBrowseMode(ctx) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const browseInstalledPlugins = [
    makeInstalledPlugin("Linear", URI.file("/home/dev/.vscode/agent-plugins/example/linear-plugin"), true),
    makeInstalledPlugin("Sentry", URI.file("/home/dev/.vscode/agent-plugins/example/sentry-plugin"), true),
    makeInstalledPlugin("Datadog", URI.file("/home/dev/.vscode/agent-plugins/example/datadog-plugin"), false)
  ];
  const pluginInstallUris = /* @__PURE__ */ new Map([
    ["example/linear-plugin", URI.file("/home/dev/.vscode/agent-plugins/example/linear-plugin")],
    ["example/sentry-plugin", URI.file("/home/dev/.vscode/agent-plugins/example/sentry-plugin")],
    ["example/datadog-plugin", URI.file("/home/dev/.vscode/agent-plugins/example/datadog-plugin")]
  ]);
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable(browseInstalledPlugins);
          this.enablementModel = void 0;
        }
      }());
      reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.installedPlugins = constObservable([]);
          this.onDidChangeMarketplaces = Event.None;
        }
        async fetchMarketplacePlugins() {
          return marketplacePlugins;
        }
      }());
      reg.defineInstance(IPluginInstallService, new class extends mock() {
        getPluginInstallUri(plugin) {
          const repo = plugin.sourceDescriptor.kind === PluginSourceKind.GitHub ? plugin.sourceDescriptor.repo : void 0;
          return repo ? pluginInstallUris.get(repo) ?? URI.file("/dev/null") : URI.file("/dev/null");
        }
      }());
      reg.defineInstance(IAICustomizationItemsModel, createMockAICustomizationItemsModel());
    }
  });
  const widget = ctx.disposableStore.add(
    instantiationService.createInstance(PluginListWidget)
  );
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
  const browseButton = widget.element.querySelector(".list-add-button");
  browseButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  widget.element.querySelector("input")?.blur();
  for (const scrollbar of widget.element.querySelectorAll(".scrollbar")) {
    scrollbar.style.visibility = "hidden";
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
function createDisabledConfigService(key, disabledValue, byPolicy) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeConfiguration = Event.None;
    }
    getValue(arg1, _arg2) {
      const k = typeof arg1 === "string" ? arg1 : void 0;
      return k === key ? disabledValue : void 0;
    }
    inspect(k) {
      if (k !== key) {
        return { value: void 0, defaultValue: void 0 };
      }
      return {
        value: disabledValue,
        defaultValue: disabledValue,
        policyValue: byPolicy ? disabledValue : void 0
      };
    }
  }();
}
function renderMcpDisabled(ctx, byPolicy) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(IConfigurationService, createDisabledConfigService(mcpAccessConfig, McpAccessValue.None, byPolicy));
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = [];
        }
      }());
      reg.defineInstance(IMcpService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.servers = constObservable([]);
        }
      }());
      reg.defineInstance(IMcpRegistry, new class extends mock() {
        constructor() {
          super(...arguments);
          this.collections = constObservable([]);
          this.delegates = constObservable([]);
          this.onDidChangeInputs = Event.None;
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable([]);
        }
      }());
      reg.defineInstance(IDialogService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = false;
          this.welcomePageFeatures = { showGettingStartedBanner: true };
          this.activeProjectRoot = observableValue("root", URI.file("/workspace"));
          this.hasOverrideProjectRoot = observableValue("hasOverride", false);
        }
        getActiveProjectRoot() {
          return URI.file("/workspace");
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService());
      reg.defineInstance(IOutputService, new class extends mock() {
        async showChannel() {
        }
      }());
    }
  });
  const widget = ctx.disposableStore.add(instantiationService.createInstance(McpListWidget));
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
}
function renderPluginDisabled(ctx, byPolicy) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(IConfigurationService, createDisabledConfigService(ChatConfiguration.PluginsEnabled, false, byPolicy));
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable([]);
          this.enablementModel = void 0;
        }
      }());
      reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.installedPlugins = constObservable([]);
          this.onDidChangeMarketplaces = Event.None;
        }
        async fetchMarketplacePlugins() {
          return [];
        }
      }());
      reg.defineInstance(IPluginInstallService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationItemsModel, createMockAICustomizationItemsModel());
    }
  });
  const widget = ctx.disposableStore.add(instantiationService.createInstance(PluginListWidget));
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
}
function renderEmbeddedMcpDetail(ctx, server) {
  const width = 480;
  const height = 320;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = server ? [server] : [];
        }
        async open() {
        }
      }());
    }
  });
  const host = DOM.append(ctx.container, DOM.$(".ai-customization-management-editor"));
  host.style.height = "100%";
  host.style.width = "100%";
  host.style.overflow = "auto";
  const detail = ctx.disposableStore.add(instantiationService.createInstance(EmbeddedMcpServerDetail, host));
  if (server) {
    detail.setInput(server);
  }
}
function renderEmbeddedPluginDetail(ctx, item) {
  const width = 480;
  const height = 320;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
    }
  });
  const host = DOM.append(ctx.container, DOM.$(".ai-customization-management-editor"));
  host.style.height = "100%";
  host.style.width = "100%";
  host.style.overflow = "auto";
  const detail = ctx.disposableStore.add(instantiationService.createInstance(EmbeddedAgentPluginDetail, host));
  if (item) {
    detail.setInput(item);
  }
}
function makeInstalledPluginItem(name, description) {
  return {
    kind: AgentPluginItemKind.Installed,
    name,
    description,
    marketplace: "GitHub",
    plugin: makeInstalledPlugin(name, URI.file(`/workspace/.copilot/plugins/${name.toLowerCase()}`), true)
  };
}
function makeMarketplacePluginItem(name, description) {
  return {
    kind: AgentPluginItemKind.Marketplace,
    name,
    description,
    source: "GitHub",
    sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: `acme/${name.toLowerCase()}` },
    marketplace: "GitHub",
    marketplaceType: MarketplaceType.Copilot,
    marketplaceReference: {
      rawValue: `acme/${name.toLowerCase()}`,
      displayLabel: `acme/${name.toLowerCase()}`,
      cloneUrl: `https://github.com/acme/${name.toLowerCase()}`,
      canonicalId: `github:acme/${name.toLowerCase()}`,
      cacheSegments: ["github", "acme", name.toLowerCase()],
      kind: MarketplaceReferenceKind.GitHubShorthand,
      githubRepo: `acme/${name.toLowerCase()}`
    }
  };
}
const localSessionResource = LocalChatSessionUri.getNewSessionUri();
const agentHostCopilotSessionResource = URI.from({ scheme: "agent-host-copilotcli", path: "/fixture-session" });
var aiCustomizationManagementEditor_fixture_default = defineThemedFixtureGroup({ path: "chat/aiCustomizations/" }, {
  // Welcome page — default state with no section selected
  WelcomePage: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, { sessionResource: localSessionResource })
  }),
  // Full editor with Local (VS Code) harness — all sections visible, harness dropdown,
  // Generate buttons, AGENTS.md shortcut, all storage groups
  LocalHarness: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, { sessionResource: localSessionResource, selectedSection: AICustomizationManagementSection.Agents })
  }),
  // Agent-host welcome page variant that highlights local prompt files which
  // need to be migrated because the active harness only consumes skills.
  AgentHostPromptMigration: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: agentHostCopilotSessionResource
    })
  }),
  // Sessions-window variant of the full editor with workspace override UX
  // and sessions section ordering.
  Sessions: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      isSessionsWindow: true,
      selectedSection: AICustomizationManagementSection.Agents,
      availableHarnesses: [
        createVSCodeHarnessDescriptor()
      ],
      managementSections: [
        AICustomizationManagementSection.Agents,
        AICustomizationManagementSection.Skills,
        AICustomizationManagementSection.Instructions,
        AICustomizationManagementSection.Prompts,
        AICustomizationManagementSection.Hooks,
        AICustomizationManagementSection.McpServers,
        AICustomizationManagementSection.Plugins
      ]
    })
  }),
  // Sessions Skills tab showing UI Integration badges on built-in skills
  SessionsSkillsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      isSessionsWindow: true,
      selectedSection: AICustomizationManagementSection.Skills,
      availableHarnesses: [
        createVSCodeHarnessDescriptor()
      ],
      managementSections: [
        AICustomizationManagementSection.Agents,
        AICustomizationManagementSection.Skills,
        AICustomizationManagementSection.Instructions,
        AICustomizationManagementSection.Prompts,
        AICustomizationManagementSection.Hooks,
        AICustomizationManagementSection.McpServers,
        AICustomizationManagementSection.Plugins
      ],
      skillUIIntegrations: /* @__PURE__ */ new Map([
        ["act-on-feedback", "Used by the Submit Feedback button in the Changes toolbar"],
        ["generate-run-commands", "Used by the Run button in the title bar"]
      ])
    })
  }),
  // MCP Servers tab with many servers to verify scrollable list layout
  McpServersTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers
    })
  }),
  McpServersTabActiveSession: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      isSessionsWindow: true,
      selectedSection: AICustomizationManagementSection.McpServers,
      activeSessionMcpServers
    })
  }),
  // Agents tab — workspace and user agents, scrollable
  AgentsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents
    })
  }),
  // Skills tab — workspace and user skills, scrollable
  SkillsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Skills
    })
  }),
  // Instructions tab — many instructions with applyTo patterns, scrollable
  InstructionsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Instructions
    })
  }),
  // Hooks tab — workspace and user hooks, scrollable
  HooksTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Hooks
    })
  }),
  // Prompts tab — workspace and user prompts, scrollable
  PromptsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Prompts
    })
  }),
  PromptMigration: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: agentHostCopilotSessionResource,
      migrationCategory: CustomizationMigrationCategoryId.PromptFiles
    })
  }),
  UserDataMigration: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: agentHostCopilotSessionResource,
      migrationCategory: CustomizationMigrationCategoryId.UserData
    })
  }),
  // Plugins tab
  PluginsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins
    })
  }),
  // MCP browse/marketplace mode — standalone widget with gallery results, scrollable
  // Verifies fix for https://github.com/microsoft/vscode/issues/304139
  McpBrowseMode: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderMcpBrowseMode
  }),
  // Plugin browse/marketplace mode — standalone widget with marketplace results, scrollable
  PluginBrowseMode: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderPluginBrowseMode
  }),
  // MCP disabled splash — chat.mcp.access set to 'none' by user
  McpDisabledByUser: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderMcpDisabled(ctx, false)
  }),
  // MCP disabled splash — chat.mcp.access locked to 'none' by enterprise policy
  McpDisabledByPolicy: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderMcpDisabled(ctx, true)
  }),
  // Plugins disabled splash — chat.plugins.enabled=false by user
  PluginsDisabledByUser: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderPluginDisabled(ctx, false)
  }),
  // Plugins disabled splash — chat.plugins.enabled locked to false by enterprise policy
  PluginsDisabledByPolicy: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderPluginDisabled(ctx, true)
  }),
  // Scrolled-to-bottom variants — verify last items are fully visible above footer
  PromptsTabScrolled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Prompts,
      scrollToBottom: true
    })
  }),
  McpServersTabScrolled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      scrollToBottom: true
    })
  }),
  PluginsTabScrolled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins,
      scrollToBottom: true
    })
  }),
  // Narrow viewport — catches badge clipping and layout overflow at small sizes
  McpServersTabNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      width: 550,
      height: 400
    })
  }),
  AgentsTabNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents,
      width: 550,
      height: 400
    })
  }),
  // Item-preview view (after clicking an agent) — verifies the structured front
  // matter preview and rendered markdown body.
  AgentsItemPreview: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents,
      openFirstItem: true
    })
  }),
  // Raw markdown editor view reached from the structured preview's Edit action.
  AgentsItemRaw: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents,
      openFirstItem: true,
      editorDisplayMode: "raw"
    })
  }),
  // Built-in skill preview view — verifies that built-in skills open in the
  // structured preview while still offering an editable raw override path.
  BuiltinSkillItemPreview: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Skills,
      openFirstItem: true,
      openItemLabel: "act-on-feedback"
    })
  }),
  // Built-in skill raw view reached from the structured preview's Edit action.
  BuiltinSkillItemRaw: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Skills,
      openFirstItem: true,
      openItemLabel: "act-on-feedback",
      editorDisplayMode: "raw"
    })
  }),
  // MCP server detail view — same alignment check for the detail back button.
  McpServerDetail: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      openFirstItem: true
    })
  }),
  // MCP server detail view in a narrow viewport — catches embedded header overflow
  // and the single-tab configuration layout used by local workspace servers.
  McpServerDetailNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      openFirstItem: true,
      width: 550,
      height: 400
    })
  }),
  // Plugin detail view — same alignment check for the detail back button.
  PluginDetail: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins,
      openFirstItem: true
    })
  }),
  PluginDetailNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins,
      openFirstItem: true,
      width: 550,
      height: 400
    })
  }),
  // Standalone embedded MCP detail widget (compact split-pane component).
  // Workspace-scope server with a description.
  EmbeddedMcpDetailWorkspace: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedMcpDetail(ctx, makeLocalMcpServer("mcp-postgres", "PostgreSQL", LocalMcpServerScope.Workspace, "Database access for the active workspace"))
  }),
  // Standalone embedded MCP detail widget — user-scope server.
  EmbeddedMcpDetailUser: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedMcpDetail(ctx, makeLocalMcpServer("mcp-web-search", "Web Search", LocalMcpServerScope.User, "Search the web from any session"))
  }),
  // Standalone embedded MCP detail widget — empty / no input state.
  EmbeddedMcpDetailEmpty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedMcpDetail(ctx, void 0)
  }),
  // Standalone embedded plugin detail widget — installed plugin.
  EmbeddedPluginDetailInstalled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedPluginDetail(ctx, makeInstalledPluginItem("Linear", "Issue tracking and project management integration"))
  }),
  // Standalone embedded plugin detail widget — marketplace plugin.
  EmbeddedPluginDetailMarketplace: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedPluginDetail(ctx, makeMarketplacePluginItem("Sentry", "Error monitoring and performance tracing"))
  }),
  // Standalone embedded plugin detail widget — empty / no input state.
  EmbeddedPluginDetailEmpty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedPluginDetail(ctx, void 0)
  })
});
export {
  aiCustomizationManagementEditor_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZW5kZXJlZE1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgYXMgZGlybmFtZVVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIEFJQ3VzdG9taXphdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJSGFybmVzc0Rlc2NyaXB0b3IsIGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSwgQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLCBQcm9tcHRzU3RvcmFnZSwgSUFnZW50U2tpbGwsIElDaGF0UHJvbXB0U2xhc2hDb21tYW5kLCBJQWdlbnRJbnN0cnVjdGlvbkZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFBhcnNlZFByb21wdEZpbGUsIFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVTb3VyY2UsIFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSwgSUFnZW50UGx1Z2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBJTWFya2V0cGxhY2VQbHVnaW4sIE1hcmtldHBsYWNlVHlwZSwgUGx1Z2luU291cmNlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wbHVnaW5zL21hcmtldHBsYWNlUmVmZXJlbmNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vY3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2UsIElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtU291cmNlLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLCBJdGVtc01vZGVsU2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkTWNwU2VydmVyRGV0YWlsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2VtYmVkZGVkTWNwU2VydmVyRGV0YWlsLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQWdlbnRQbHVnaW5EZXRhaWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vZW1iZWRkZWRBZ2VudFBsdWdpbkRldGFpbC5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkl0ZW1LaW5kLCBJQWdlbnRQbHVnaW5JdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5JdGVtcy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25SdW5uZXIuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwV29ya2JlbmNoU2VydmljZSwgSVdvcmtiZW5jaE1jcFNlcnZlciwgSU1jcFNlcnZpY2UsIE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwU2VydmVySW5zdGFsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlciwgTG9jYWxNY3BTZXJ2ZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL21jcC9jb21tb24vbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwTGlzdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9tY3BMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFBsdWdpbkxpc3RXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vcGx1Z2luTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJSXRlcmF0aXZlUGFnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NvZGVSZXZpZXcvYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2NrQ29kZVJldmlld1NlcnZpY2UgfSBmcm9tICcuL21vY2tDb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5cbi8vIEVuc3VyZSB0aGVtZSBjb2xvcnMgJiB3aWRnZXQgQ1NTIGFyZSBsb2FkZWRcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9pbnB1dENvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvbGlzdENvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1vY2sgaGVscGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jb25zdCB1c2VySG9tZSA9IFVSSS5maWxlKCcvaG9tZS9kZXYnKTtcbmNvbnN0IEJVSUxUSU5fU1RPUkFHRSA9ICdidWlsdGluJztcblxuaW50ZXJmYWNlIElGaXh0dXJlRmlsZSB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZTtcblx0cmVhZG9ubHkgdHlwZTogUHJvbXB0c1R5cGU7XG5cdHJlYWRvbmx5IHNvdXJjZT86IFByb21wdEZpbGVTb3VyY2U7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcHBseVRvPzogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uRGlzcGxheU5hbWU/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tFZGl0b3JHcm91cCgpOiBJRWRpdG9yR3JvdXAge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yR3JvdXA+KCkge1xuXHRcdG92ZXJyaWRlIHdpbmRvd0lkID0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZDtcblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCgpOiBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCB7XG5cdGNvbnN0IGl0ZW1Tb3VyY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25JdGVtU291cmNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFJQ3VzdG9taXphdGlvbkl0ZW1zQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBhc3luYyBmZXRjaFByb3ZpZGVySXRlbXMoKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGZldGNoQUlDdXN0b21pemF0aW9uSXRlbXMoX3Byb21wdFR5cGU6IFByb21wdHNUeXBlKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGZldGNoU291cmNlRm9sZGVycyhfcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpIHsgcmV0dXJuIFtdOyB9XG5cdH0oKTtcblxuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbD4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0SXRlbXMoX3NlY3Rpb246IEl0ZW1zTW9kZWxTZWN0aW9uKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10+IHsgcmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShbXSk7IH1cblx0XHRvdmVycmlkZSBnZXRBY3RpdmVJdGVtU291cmNlKCkgeyByZXR1cm4gaXRlbVNvdXJjZTsgfVxuXHRcdG92ZXJyaWRlIGdldENvdW50KF9zZWN0aW9uOiBJdGVtc01vZGVsU2VjdGlvbik6IElPYnNlcnZhYmxlPG51bWJlcj4geyByZXR1cm4gY29uc3RPYnNlcnZhYmxlKDApOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0UGx1Z2luQ291bnQoKTogSU9ic2VydmFibGU8bnVtYmVyPiB7IHJldHVybiBjb25zdE9ic2VydmFibGUoMCk7IH1cblx0XHRvdmVycmlkZSBhc3luYyB3aGVuU2VjdGlvbkxvYWRlZChfc2VjdGlvbjogSXRlbXNNb2RlbFNlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHR9KCk7XG59XG5cbnR5cGUgRml4dHVyZUFnZW50SG9zdE1jcFNlcnZlciA9IFJldHVyblR5cGU8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlWydnZXRNY3BTZXJ2ZXJzJ10+W251bWJlcl07XG5cbmZ1bmN0aW9uIG1jcExpZmVjeWNsZU5vb3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlKG1jcFNlcnZlcnM6IHJlYWRvbmx5IEZpeHR1cmVBZ2VudEhvc3RNY3BTZXJ2ZXJbXSA9IFtdKTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0Q3VzdG9tQWdlbnRzKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBnZXRDdXN0b21pemF0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0V29ya2luZ0RpcmVjdG9yeSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldFdvcmtpbmdEaXJlY3RvcmllcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0TWNwU2VydmVycygpIHsgcmV0dXJuIG1jcFNlcnZlcnM7IH1cblx0XHRvdmVycmlkZSBhZGRNY3BTZXJ2ZXIoKSB7IH1cblx0XHRvdmVycmlkZSBhc3luYyBhdXRoZW50aWNhdGVNY3BTZXJ2ZXIoKSB7IHJldHVybiB0cnVlOyB9XG5cdH0oKTtcbn1cblxuLy8gQWdlbnQtaG9zdCBoYXJuZXNzZXMgc3VwcGx5IHRoZWlyIGN1c3RvbWl6YXRpb24gaXRlbXMgZGlyZWN0bHkgdGhyb3VnaCBhblxuLy8gaXRlbSBwcm92aWRlciAoYnlwYXNzaW5nIHRoZSBwcm9tcHRzLXNlcnZpY2UgZGlzY292ZXJ5IHVzZWQgYnkgbG9jYWxcbi8vIGhhcm5lc3NlcykuIFByb3ZpZGUgb25lIGJhY2tlZCBieSB0aGUgZml4dHVyZSBmaWxlcyBzbyB0aGUgYWdlbnQtaG9zdFxuLy8gZWRpdG9yIGRvZXMgbm90IGZhbGwgYmFjayB0byBhbiBlbXB0eSBzb3VyY2UgYW5kIGxvZyBhIHdhcm5pbmcuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlQWdlbnRIb3N0SXRlbVByb3ZpZGVyKGZpbGVzOiByZWFkb25seSBJRml4dHVyZUZpbGVbXSk6IElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyIHtcblx0cmV0dXJuIHtcblx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRhc3luYyBwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucygpOiBQcm9taXNlPElDdXN0b21pemF0aW9uSXRlbVtdPiB7XG5cdFx0XHRyZXR1cm4gZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5zb3VyY2UgIT09IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEpLm1hcChmaWxlID0+ICh7XG5cdFx0XHRcdHVyaTogZmlsZS51cmksXG5cdFx0XHRcdHR5cGU6IGZpbGUudHlwZSxcblx0XHRcdFx0bmFtZTogZmlsZS5uYW1lID8/ICcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZmlsZS5kZXNjcmlwdGlvbixcblx0XHRcdFx0c291cmNlOiBmaWxlLnN0b3JhZ2UgYXMgQUlDdXN0b21pemF0aW9uU291cmNlLFxuXHRcdFx0XHRleHRlbnNpb25JZDogZmlsZS5leHRlbnNpb25JZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9FeHRlbnNpb25JbmZvKGZpbGU6IElGaXh0dXJlRmlsZSk6IHsgaWRlbnRpZmllcjogRXh0ZW5zaW9uSWRlbnRpZmllcjsgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICghZmlsZS5leHRlbnNpb25JZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGlkZW50aWZpZXI6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGZpbGUuZXh0ZW5zaW9uSWQpLFxuXHRcdGRpc3BsYXlOYW1lOiBmaWxlLmV4dGVuc2lvbkRpc3BsYXlOYW1lLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlRmlsZUNvbnRlbnQoZmlsZTogSUZpeHR1cmVGaWxlKTogc3RyaW5nIHtcblx0aWYgKGZpbGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuaG9vaykge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiBmaWxlLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZmlsZS5kZXNjcmlwdGlvbixcblx0XHRcdGNvbW1hbmQ6ICducG0gdGVzdCcsXG5cdFx0fSwgbnVsbCwgMik7XG5cdH1cblxuXHRjb25zdCBoZWFkZXJMaW5lcyA9IFtcblx0XHQnLS0tJyxcblx0XHRgZGVzY3JpcHRpb246ICR7SlNPTi5zdHJpbmdpZnkoZmlsZS5kZXNjcmlwdGlvbiA/PyBgJHtmaWxlLm5hbWUgPz8gJ0N1c3RvbWl6YXRpb24nfSBkZXNjcmlwdGlvbmApfWAsXG5cdF07XG5cblx0aWYgKGZpbGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zICYmIGZpbGUuYXBwbHlUbykge1xuXHRcdGhlYWRlckxpbmVzLnB1c2goYGFwcGx5VG86ICR7SlNPTi5zdHJpbmdpZnkoZmlsZS5hcHBseVRvKX1gKTtcblx0fVxuXG5cdGlmIChmaWxlLnR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KSB7XG5cdFx0aGVhZGVyTGluZXMucHVzaCgndG9vbHM6Jyk7XG5cdFx0aGVhZGVyTGluZXMucHVzaCgnICAtIHJlYWRfZmlsZScpO1xuXHRcdGhlYWRlckxpbmVzLnB1c2goJyAgLSBncmVwX3NlYXJjaCcpO1xuXHR9XG5cblx0aWYgKGZpbGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRoZWFkZXJMaW5lcy5wdXNoKGBpbnB1dDogJHtKU09OLnN0cmluZ2lmeSgnQ29kZSByZXZpZXcgZmluZGluZ3MnKX1gKTtcblx0fVxuXG5cdGlmIChmaWxlLnR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdGhlYWRlckxpbmVzLnB1c2goYGFyZ3VtZW50LWhpbnQ6ICR7SlNPTi5zdHJpbmdpZnkoJ1Bhc3RlIHRoZSBmYWlsaW5nIHN0YWNrIHRyYWNlJyl9YCk7XG5cdH1cblxuXHRoZWFkZXJMaW5lcy5wdXNoKCctLS0nLCAnJyk7XG5cblx0cmV0dXJuIGAke2hlYWRlckxpbmVzLmpvaW4oJ1xcbicpfSMjIE92ZXJ2aWV3XFxuXFxuVXNlICoqJHtmaWxlLm5hbWUgPz8gJ3RoaXMgY3VzdG9taXphdGlvbid9Kiogd2hlbiB5b3UgbmVlZCBjb25zaXN0ZW50IEFJIGd1aWRhbmNlLlxcblxcbi0gUmV2aWV3IHRoZSBhY3RpdmUgY2hhbmdlXFxuLSBQcmVzZXJ2ZSBleGlzdGluZyBjb252ZW50aW9uc1xcbi0gRXhwbGFpbiB0aGUgcmVhc29uaW5nIGNsZWFybHlcXG5cXG5cXGBcXGBcXGB0c1xcbmNvbnN0IHJlYWR5ID0gdHJ1ZTtcXG5cXGBcXGBcXGBcXG5gO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVJbnN0cnVjdGlvbkZpbGVDb250ZW50KGZpbGU6IElBZ2VudEluc3RydWN0aW9uRmlsZSk6IHN0cmluZyB7XG5cdHJldHVybiBgLS0tXFxuZGVzY3JpcHRpb246ICR7SlNPTi5zdHJpbmdpZnkoJ1JlcG9zaXRvcnktbGV2ZWwgaW5zdHJ1Y3Rpb25zJyl9XFxuYXBwbHlUbzogJHtKU09OLnN0cmluZ2lmeSgnKiovKicpfVxcbi0tLVxcblxcbiMjIE92ZXJ2aWV3XFxuXFxuVGhlc2UgaW5zdHJ1Y3Rpb25zIGFwcGx5IGFjcm9zcyB0aGUgd29ya3NwYWNlLlxcbmA7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVDb250ZW50TWFwKGZpbGVzOiBJRml4dHVyZUZpbGVbXSwgaW5zdHJ1Y3Rpb25zOiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSk6IFJlc291cmNlTWFwPHN0cmluZz4ge1xuXHRjb25zdCBjb250ZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdGNvbnRlbnRzLnNldChmaWxlLnVyaSwgY3JlYXRlRml4dHVyZUZpbGVDb250ZW50KGZpbGUpKTtcblx0fVxuXHRmb3IgKGNvbnN0IGZpbGUgb2YgaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0Y29udGVudHMuc2V0KGZpbGUudXJpLCBjcmVhdGVJbnN0cnVjdGlvbkZpbGVDb250ZW50KGZpbGUpKTtcblx0fVxuXHRyZXR1cm4gY29udGVudHM7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVGaWxlQ29udGVudFN0YXQocmVzb3VyY2U6IFVSSSwgdmFsdWU6IHN0cmluZyk6IElGaWxlQ29udGVudCB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2UsXG5cdFx0bmFtZTogJycsXG5cdFx0bXRpbWU6IDAsXG5cdFx0Y3RpbWU6IDAsXG5cdFx0ZXRhZzogJycsXG5cdFx0c2l6ZTogdmFsdWUubGVuZ3RoLFxuXHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKHZhbHVlKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRml4dHVyZUZpbGVTdGF0KHJlc291cmNlOiBVUkksIHNpemU6IG51bWJlciwgaXNEaXJlY3Rvcnk6IGJvb2xlYW4pOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEge1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlLFxuXHRcdG5hbWU6ICcnLFxuXHRcdG10aW1lOiAwLFxuXHRcdGN0aW1lOiAwLFxuXHRcdGV0YWc6ICcnLFxuXHRcdHNpemUsXG5cdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0ZXhlY3V0YWJsZTogZmFsc2UsXG5cdFx0aXNGaWxlOiAhaXNEaXJlY3RvcnksXG5cdFx0aXNEaXJlY3RvcnksXG5cdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdGNoaWxkcmVuOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShmaWxlczogSUZpeHR1cmVGaWxlW10sIGFnZW50SW5zdHJ1Y3Rpb25zOiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSwgY29udGVudHM6IFJlc291cmNlTWFwPHN0cmluZz4sIG9uRGlkQ2hhbmdlRmlsZXM6IEV2ZW50PHZvaWQ+KTogSVByb21wdHNTZXJ2aWNlIHtcblx0Y29uc3QgcGFyc2VyID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKTtcblx0Y29uc3Qgc2tpbGxTb3VyY2VGb2xkZXJzOiBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXSA9IFtcblx0XHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmFnZW50cy9za2lsbHMnKSwgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmFnZW50cy9za2lsbHMnKSwgZmlsZVBhdHRlcm46IHVuZGVmaW5lZCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkFnZW50c1dvcmtzcGFjZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMnKSwgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMnKSwgZmlsZVBhdHRlcm46IHVuZGVmaW5lZCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkdpdEh1YldvcmtzcGFjZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9za2lsbHMnKSwgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9za2lsbHMnKSwgZmlsZVBhdHRlcm46IHVuZGVmaW5lZCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNsYXVkZVdvcmtzcGFjZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uYWdlbnRzL3NraWxscycpLCBzZWFyY2hSb290OiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5hZ2VudHMvc2tpbGxzJyksIGZpbGVQYXR0ZXJuOiB1bmRlZmluZWQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5BZ2VudHNQZXJzb25hbCwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciB9LFxuXHRcdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L3NraWxscycpLCBzZWFyY2hSb290OiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L3NraWxscycpLCBmaWxlUGF0dGVybjogdW5kZWZpbmVkLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ29waWxvdFBlcnNvbmFsLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH0sXG5cdFx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNsYXVkZS9za2lsbHMnKSwgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy9ob21lL2Rldi8uY2xhdWRlL3NraWxscycpLCBmaWxlUGF0dGVybjogdW5kZWZpbmVkLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ2xhdWRlUGVyc29uYWwsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIgfSxcblx0XTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb21wdHNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gb25EaWRDaGFuZ2VGaWxlcztcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNraWxscyA9IG9uRGlkQ2hhbmdlRmlsZXM7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSG9va3MgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldERpc2FibGVkUHJvbXB0RmlsZXMoKTogUmVzb3VyY2VTZXQgeyByZXR1cm4gbmV3IFJlc291cmNlU2V0KCk7IH1cblx0XHRvdmVycmlkZSBnZXRQcm9tcHRMb2NhdGlvbkxhYmVsKCkgeyByZXR1cm4gJyc7IH1cblx0XHRvdmVycmlkZSBhc3luYyBsaXN0UHJvbXB0RmlsZXModHlwZTogUHJvbXB0c1R5cGUsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdHJldHVybiBmaWxlcy5maWx0ZXIoZiA9PiBmLnR5cGUgPT09IHR5cGUpLm1hcChmID0+ICh7XG5cdFx0XHRcdHVyaTogZi51cmksXG5cdFx0XHRcdHN0b3JhZ2U6IGYuc3RvcmFnZSBhcyBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogZi50eXBlLFxuXHRcdFx0XHRuYW1lOiBmLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2U6IGYuc291cmNlLFxuXHRcdFx0XHRleHRlbnNpb246IHRvRXh0ZW5zaW9uSW5mbyhmKSBhcyBuZXZlcixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgbGlzdEFnZW50SW5zdHJ1Y3Rpb25zKCkgeyByZXR1cm4gYWdlbnRJbnN0cnVjdGlvbnM7IH1cblx0XHRvdmVycmlkZSBhc3luYyBsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKHR5cGU6IFByb21wdHNUeXBlLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0cmV0dXJuIGZpbGVzLmZpbHRlcihmID0+IGYudHlwZSA9PT0gdHlwZSAmJiBmLnN0b3JhZ2UgPT09IHN0b3JhZ2UpLm1hcChmID0+ICh7XG5cdFx0XHRcdHVyaTogZi51cmksXG5cdFx0XHRcdHN0b3JhZ2U6IGYuc3RvcmFnZSBhcyBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogZi50eXBlLFxuXHRcdFx0XHRuYW1lOiBmLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2U6IGYuc291cmNlLFxuXHRcdFx0XHRleHRlbnNpb246IHRvRXh0ZW5zaW9uSW5mbyhmKSBhcyBuZXZlcixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q3VzdG9tQWdlbnRzKCkge1xuXHRcdFx0cmV0dXJuIGZpbGVzLmZpbHRlcihmID0+IGYudHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpLm1hcChhID0+ICh7XG5cdFx0XHRcdHVyaTogYS51cmksIG5hbWU6IGEubmFtZSA/PyAnYWdlbnQnLCBkZXNjcmlwdGlvbjogYS5kZXNjcmlwdGlvbiwgc3RvcmFnZTogYS5zdG9yYWdlLFxuXHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRzdG9yYWdlOiBhLnN0b3JhZ2UsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGEuZXh0ZW5zaW9uSWQgPyBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihhLmV4dGVuc2lvbklkKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0fSkpIGFzIG5ldmVyW107XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIHBhcnNlTmV3KHVyaTogVVJJLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxQYXJzZWRQcm9tcHRGaWxlPiB7XG5cdFx0XHRyZXR1cm4gcGFyc2VyLnBhcnNlKHVyaSwgY29udGVudHMuZ2V0KHVyaSkgPz8gJycpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsOiB7IHVyaTogVVJJOyBnZXRWYWx1ZSgpOiBzdHJpbmcgfSkge1xuXHRcdFx0cmV0dXJuIHBhcnNlci5wYXJzZShtb2RlbC51cmksIG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRTb3VyY2VGb2xkZXJzKCkgeyByZXR1cm4gW10gYXMgbmV2ZXJbXTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlOiBQcm9tcHRzVHlwZSkge1xuXHRcdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRcdHJldHVybiBza2lsbFNvdXJjZUZvbGRlcnM7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0SW5zdHJ1Y3Rpb25GaWxlcygpIHtcblx0XHRcdHJldHVybiBmaWxlcy5maWx0ZXIoZiA9PiBmLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykubWFwKGYgPT4gKHtcblx0XHRcdFx0dXJpOiBmLnVyaSxcblx0XHRcdFx0bmFtZTogZi5uYW1lID8/ICcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZi5kZXNjcmlwdGlvbixcblx0XHRcdFx0c3RvcmFnZTogZi5zdG9yYWdlLFxuXHRcdFx0XHRwYXR0ZXJuOiBmLmFwcGx5VG8sXG5cdFx0XHRcdGV4dGVuc2lvbjogdG9FeHRlbnNpb25JbmZvKGYpIGFzIG5ldmVyLFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBmaW5kQWdlbnRTa2lsbHMoKTogUHJvbWlzZTxJQWdlbnRTa2lsbFtdPiB7XG5cdFx0XHRyZXR1cm4gZmlsZXMuZmlsdGVyKGYgPT4gZi50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkubWFwKGYgPT4gKHtcblx0XHRcdFx0dXJpOiBmLnVyaSxcblx0XHRcdFx0c3RvcmFnZTogZi5zdG9yYWdlLFxuXHRcdFx0XHRuYW1lOiBmLm5hbWUgPz8gJ3NraWxsJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGYuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb246IGZhbHNlLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB0cnVlLFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRQcm9tcHRTbGFzaENvbW1hbmRzKCk6IFByb21pc2U8cmVhZG9ubHkgSUNoYXRQcm9tcHRTbGFzaENvbW1hbmRbXT4ge1xuXHRcdFx0Y29uc3QgcHJvbXB0RmlsZXMgPSBmaWxlcy5maWx0ZXIoZiA9PiBmLnR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRjb25zdCBjb21tYW5kcyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21wdEZpbGVzLm1hcChhc3luYyBmID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IGYudXJpLFxuXHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IHRydWUsXG5cdFx0XHRcdFx0bmFtZTogZi5uYW1lID8/ICdwcm9tcHQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBmLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHR5cGU6IGYudHlwZSxcblx0XHRcdFx0XHRzdG9yYWdlOiBmLnN0b3JhZ2UsXG5cdFx0XHRcdFx0c291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiB0b0V4dGVuc2lvbkluZm8oZikgYXMgbmV2ZXIsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0UHJvbXB0U2xhc2hDb21tYW5kO1xuXHRcdFx0fSkpO1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzO1xuXHRcdH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrSGFybmVzc1NlcnZpY2Uoc2Vzc2lvblJlc291cmNlOiBVUkksIGRlc2NyaXB0b3JzOiByZWFkb25seSBJSGFybmVzc0Rlc2NyaXB0b3JbXSk6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2Uge1xuXHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJPignYWN0aXZlU2Vzc2lvblJlc291cmNlJywgc2Vzc2lvblJlc291cmNlKTtcblx0Y29uc3QgYWN0aXZlSGFybmVzcyA9IGRlcml2ZWQocmVhZGVyID0+IGdldENoYXRTZXNzaW9uVHlwZShhY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IGFjdGl2ZVNlc3Npb25SZXNvdXJjZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVIYXJuZXNzID0gYWN0aXZlSGFybmVzcztcblx0XHRvdmVycmlkZSByZWFkb25seSBhdmFpbGFibGVIYXJuZXNzZXMgPSBjb25zdE9ic2VydmFibGUoZGVzY3JpcHRvcnMpO1xuXHRcdG92ZXJyaWRlIGZpbmRIYXJuZXNzQnlJZChpZDogc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvcnMuZmluZChoID0+IGguaWQgPT09IGlkKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlRGVzY3JpcHRvcigpIHtcblx0XHRcdHJldHVybiBkZXNjcmlwdG9ycy5maW5kKGggPT4gaC5pZCA9PT0gYWN0aXZlSGFybmVzcy5nZXQoKSkgPz8gZGVzY3JpcHRvcnNbMF07XG5cdFx0fVxuXHRcdG92ZXJyaWRlIHNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQoc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRvdmVycmlkZSByZWdpc3RlckV4dGVybmFsSGFybmVzcygpIHsgcmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9OyB9XG5cdH0oKTtcbn1cblxuZnVuY3Rpb24gbWFrZUxvY2FsTWNwU2VydmVyKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLCBkZXNjcmlwdGlvbj86IHN0cmluZywgY29uZmlnPzogSVdvcmtiZW5jaE1jcFNlcnZlclsnY29uZmlnJ10pOiBJV29ya2JlbmNoTWNwU2VydmVyIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaE1jcFNlcnZlcj4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSBpZDtcblx0XHRvdmVycmlkZSByZWFkb25seSBuYW1lID0gaWQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFiZWwgPSBsYWJlbDtcblx0XHRvdmVycmlkZSByZWFkb25seSBkZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uID8/ICcnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbmZpZyA9IGNvbmZpZztcblx0XHRvdmVycmlkZSByZWFkb25seSBpbnN0YWxsU3RhdGUgPSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGVkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxvY2FsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSBpZDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNjb3BlID0gc2NvcGU7XG5cdFx0fSgpO1xuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tBZ2VudEZlZWRiYWNrU2VydmljZSgpOiBJQWdlbnRGZWVkYmFja1NlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRGZWVkYmFja1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTmF2aWdhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFkZEZlZWRiYWNrID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENvbnZlcnRGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRSZXBseSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRTdWJtaXRGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2soKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGdldFNlc3Npb25Gb3JGaWxlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBnZXRNb3N0UmVjZW50U2Vzc2lvbkZvclJlc291cmNlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmV2ZWFsRmVlZGJhY2soKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRvdmVycmlkZSBnZXROZXh0RmVlZGJhY2soKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBnZXROYXZpZ2F0aW9uQmVhcmluZygpIHsgcmV0dXJuIHsgYWN0aXZlSWR4OiAtMSwgdG90YWxDb3VudDogMCB9OyB9XG5cdFx0b3ZlcnJpZGUgZ2V0TmV4dE5hdmlnYWJsZUl0ZW0oKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBzZXROYXZpZ2F0aW9uQW5jaG9yKCk6IHZvaWQgeyB9XG5cdFx0b3ZlcnJpZGUgY2xlYXJGZWVkYmFjaygpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIHJlbW92ZUZlZWRiYWNrKCk6IHZvaWQgeyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgYWRkRmVlZGJhY2tBbmRTdWJtaXQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0fSgpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZWFsaXN0aWMgdGVzdCBkYXRhIFx1MjAxNCBhIHByb2plY3QgdGhhdCBoYXMgQ29waWxvdCArIENsYXVkZSBjdXN0b21pemF0aW9uc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jb25zdCBhbGxGaWxlczogSUZpeHR1cmVGaWxlW10gPSBbXG5cdC8vIEluc3RydWN0aW9ucyAtIGV4dGVuc2lvbiAoYnVpbHQtaW4gKyB0aGlyZC1wYXJ0eSlcblx0eyB1cmk6IFVSSS5maWxlKCcvZXh0ZW5zaW9ucy9naXRodWIuY29waWxvdC1jaGF0L2luc3RydWN0aW9ucy9jb2RpbmcuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnQ29waWxvdCBDb2RpbmcnLCBkZXNjcmlwdGlvbjogJ0J1aWx0LWluIGNvZGluZyBndWlkYW5jZScsIGV4dGVuc2lvbklkOiAnR2l0SHViLmNvcGlsb3QtY2hhdCcsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QgQ2hhdCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvZXh0ZW5zaW9ucy9hY21lLnRvb2xzL2luc3RydWN0aW9ucy90ZWFtLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ1RlYW0gQ29udmVudGlvbnMnLCBkZXNjcmlwdGlvbjogJ1RoaXJkLXBhcnR5IGV4dGVuc2lvbiBpbnN0cnVjdGlvbnMnLCBleHRlbnNpb25JZDogJ2FjbWUudG9vbHMnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0FjbWUgVG9vbHMnIH0sXG5cdC8vIEluc3RydWN0aW9ucyBcdTIwMTQgd29ya3NwYWNlXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9jb2Rpbmctc3RhbmRhcmRzLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnQ29kaW5nIFN0YW5kYXJkcycsIGRlc2NyaXB0aW9uOiAnUmVwb3NpdG9yeS13aWRlIGNvZGluZyBzdGFuZGFyZHMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy90ZXN0aW5nLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnVGVzdGluZycsIGRlc2NyaXB0aW9uOiAnVGVzdGluZyBiZXN0IHByYWN0aWNlcycsIGFwcGx5VG86ICcqKi8qLnRlc3QudHMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9zZWN1cml0eS5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ1NlY3VyaXR5JywgZGVzY3JpcHRpb246ICdTZWN1cml0eSByZXZpZXcgY2hlY2tsaXN0JywgYXBwbHlUbzogJ3NyYy9hdXRoLyoqJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYWNjZXNzaWJpbGl0eS5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0FjY2Vzc2liaWxpdHknLCBkZXNjcmlwdGlvbjogJ1dDQUcgY29tcGxpYW5jZSBndWlkZWxpbmVzJywgYXBwbHlUbzogJyoqLyoudHN4JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYXBpLWRlc2lnbi5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0FQSSBEZXNpZ24nLCBkZXNjcmlwdGlvbjogJ1JFU1QgQVBJIGRlc2lnbiBjb252ZW50aW9ucycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3BlcmZvcm1hbmNlLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnUGVyZm9ybWFuY2UnLCBkZXNjcmlwdGlvbjogJ1BlcmZvcm1hbmNlIG9wdGltaXphdGlvbiBydWxlcycsIGFwcGx5VG86ICdzcmMvY29yZS8qKicgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Vycm9yLWhhbmRsaW5nLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnRXJyb3IgSGFuZGxpbmcnLCBkZXNjcmlwdGlvbjogJ0Vycm9yIGhhbmRsaW5nIHBhdHRlcm5zJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvZGF0YWJhc2UuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdEYXRhYmFzZScsIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgbWlncmF0aW9uIGFuZCBxdWVyeSBwYXR0ZXJucycsIGFwcGx5VG86ICdzcmMvZGIvKionIH0sXG5cdC8vIEluc3RydWN0aW9ucyBcdTIwMTQgdXNlclxuXHR7IHVyaTogVVJJLmZpbGUoJy91c2VyLWRhdGEvcHJvbXB0cy9wZXJzb25hbC5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEsIG5hbWU6ICdQZXJzb25hbCBJbnN0cnVjdGlvbnMnLCBkZXNjcmlwdGlvbjogJ1ZTIENvZGUgcHJvZmlsZSBpbnN0cnVjdGlvbnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L2luc3RydWN0aW9ucy9teS1zdHlsZS5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnTXkgU3R5bGUnLCBkZXNjcmlwdGlvbjogJ1BlcnNvbmFsIGNvZGluZyBzdHlsZScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL3R5cGVzY3JpcHQtcnVsZXMuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ1R5cGVTY3JpcHQgUnVsZXMnLCBkZXNjcmlwdGlvbjogJ1N0cmljdCBUeXBlU2NyaXB0IGNvbnZlbnRpb25zJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9pbnN0cnVjdGlvbnMvY29tbWl0LW1lc3NhZ2VzLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdDb21taXQgTWVzc2FnZXMnLCBkZXNjcmlwdGlvbjogJ0NvbnZlbnRpb25hbCBjb21taXQgZm9ybWF0JyB9LFxuXHQvLyBJbnN0cnVjdGlvbnMgXHUyMDE0IENsYXVkZSBydWxlc1xuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9ydWxlcy9jb2RlLXN0eWxlLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdDb2RlIFN0eWxlJywgZGVzY3JpcHRpb246ICdDbGF1ZGUgY29kZSBzdHlsZSBydWxlcycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvcnVsZXMvdGVzdGluZy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnVGVzdGluZycsIGRlc2NyaXB0aW9uOiAnQ2xhdWRlIHRlc3RpbmcgY29udmVudGlvbnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jbGF1ZGUvcnVsZXMvcGVyc29uYWwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnUGVyc29uYWwnLCBkZXNjcmlwdGlvbjogJ1BlcnNvbmFsIHJ1bGVzJyB9LFxuXHQvLyBBZ2VudHMgXHUyMDE0IHdvcmtzcGFjZVxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnUmV2aWV3ZXInLCBkZXNjcmlwdGlvbjogJ0NvZGUgcmV2aWV3IGFnZW50JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZG9jdW1lbnRlci5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdEb2N1bWVudGVyJywgZGVzY3JpcHRpb246ICdEb2N1bWVudGF0aW9uIGFnZW50JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvdGVzdGVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgbmFtZTogJ1Rlc3RlcicsIGRlc2NyaXB0aW9uOiAnVGVzdCBnZW5lcmF0aW9uIGFuZCB2YWxpZGF0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvcmVmYWN0b3Jlci5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdSZWZhY3RvcmVyJywgZGVzY3JpcHRpb246ICdDb2RlIHJlZmFjdG9yaW5nIHNwZWNpYWxpc3QnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9zZWN1cml0eS1hdWRpdG9yLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgbmFtZTogJ1NlY3VyaXR5IEF1ZGl0b3InLCBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IHZ1bG5lcmFiaWxpdHkgc2Nhbm5lcicgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2FwaS1kZXNpZ25lci5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdBUEkgRGVzaWduZXInLCBkZXNjcmlwdGlvbjogJ1JFU1QgYW5kIEdyYXBoUUwgQVBJIGRlc2lnbicgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL3BlcmZvcm1hbmNlLXR1bmVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgbmFtZTogJ1BlcmZvcm1hbmNlIFR1bmVyJywgZGVzY3JpcHRpb246ICdQZXJmb3JtYW5jZSBwcm9maWxpbmcgYW5kIG9wdGltaXphdGlvbicgfSxcblx0Ly8gQWdlbnRzIFx1MjAxNCB1c2VyXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3VzZXItZGF0YS9wcm9tcHRzL2xlZ2FjeS5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLCBuYW1lOiAnTGVnYWN5IEFnZW50JywgZGVzY3JpcHRpb246ICdWUyBDb2RlIHByb2ZpbGUgYWdlbnQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L2FnZW50cy9wbGFubmVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnUGxhbm5lcicsIGRlc2NyaXB0aW9uOiAnUHJvamVjdCBwbGFubmluZyBhZ2VudCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvYWdlbnRzL2RlYnVnZ2VyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnRGVidWdnZXInLCBkZXNjcmlwdGlvbjogJ0ludGVyYWN0aXZlIGRlYnVnZ2luZyBhc3Npc3RhbnQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L2FnZW50cy9ubHMtaGVscGVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnTkxTIEhlbHBlcicsIGRlc2NyaXB0aW9uOiAnTmF0dXJhbCBsYW5ndWFnZSBzZWFyY2hpbmcgY29kZSBmb3IgY2xhcml0eScgfSxcblx0Ly8gQWdlbnRzIC0gZXh0ZW5zaW9uIChidWlsdC1pbiArIHRoaXJkLXBhcnR5KVxuXHR7IHVyaTogVVJJLmZpbGUoJy9leHRlbnNpb25zL2dpdGh1Yi5jb3BpbG90LWNoYXQvYWdlbnRzL3dvcmtzcGFjZS1ndWlkZS5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnV29ya3NwYWNlIEd1aWRlJywgZGVzY3JpcHRpb246ICdCdWlsdC1pbiB3b3Jrc3BhY2UgZXhwbG9yYXRpb24gYWdlbnQnLCBleHRlbnNpb25JZDogJ0dpdEh1Yi5jb3BpbG90LWNoYXQnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90IENoYXQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvYWNtZS50b29scy9hZ2VudHMvYXBpLWhlbHBlci5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnQVBJIEhlbHBlcicsIGRlc2NyaXB0aW9uOiAnVGhpcmQtcGFydHkgQVBJIGFnZW50JywgZXh0ZW5zaW9uSWQ6ICdhY21lLnRvb2xzJywgZXh0ZW5zaW9uRGlzcGxheU5hbWU6ICdBY21lIFRvb2xzJyB9LFxuXHQvLyBTa2lsbHMgXHUyMDE0IHdvcmtzcGFjZVxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvZGVwbG95L1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0RlcGxveScsIGRlc2NyaXB0aW9uOiAnRGVwbG95bWVudCBhdXRvbWF0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvcmVmYWN0b3IvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnUmVmYWN0b3InLCBkZXNjcmlwdGlvbjogJ0NvZGUgcmVmYWN0b3JpbmcgcGF0dGVybnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy91bml0LXRlc3RzL1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ1VuaXQgVGVzdHMnLCBkZXNjcmlwdGlvbjogJ1Rlc3QgZ2VuZXJhdGlvbiBhbmQgcnVubmVyIGludGVncmF0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvY2ktZml4L1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0NJIEZpeCcsIGRlc2NyaXB0aW9uOiAnRGlhZ25vc2UgYW5kIGZpeCBDSSBmYWlsdXJlcycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL21pZ3JhdGlvbi9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdNaWdyYXRpb24nLCBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIG1pZ3JhdGlvbiBnZW5lcmF0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYWNjZXNzaWJpbGl0eS9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdBY2Nlc3NpYmlsaXR5JywgZGVzY3JpcHRpb246ICdBUklBIGxhYmVscyBhbmQga2V5Ym9hcmQgbmF2aWdhdGlvbicgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2RvY2tlci9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdEb2NrZXInLCBkZXNjcmlwdGlvbjogJ0RvY2tlcmZpbGUgYW5kIGNvbXBvc2UgZ2VuZXJhdGlvbicgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2FwaS1kb2NzL1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0FQSSBEb2NzJywgZGVzY3JpcHRpb246ICdPcGVuQVBJIHNwZWMgZ2VuZXJhdGlvbicgfSxcblx0Ly8gU2tpbGxzIFx1MjAxNCB1c2VyXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L3NraWxscy9naXQtd29ya2Zsb3cvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdHaXQgV29ya2Zsb3cnLCBkZXNjcmlwdGlvbjogJ0JyYW5jaCBhbmQgUFIgd29ya2Zsb3dzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9za2lsbHMvY29kZS1yZXZpZXcvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdDb2RlIFJldmlldycsIGRlc2NyaXB0aW9uOiAnU3RydWN0dXJlZCBjb2RlIHJldmlldyBjaGVja2xpc3QnIH0sXG5cdC8vIFNraWxscyAtIGV4dGVuc2lvbiAoYnVpbHQtaW4gKyB0aGlyZC1wYXJ0eSlcblx0eyB1cmk6IFVSSS5maWxlKCcvZXh0ZW5zaW9ucy9naXRodWIuY29waWxvdC1jaGF0L3NraWxscy93b3Jrc3BhY2UvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ1dvcmtzcGFjZSBTZWFyY2gnLCBkZXNjcmlwdGlvbjogJ0J1aWx0LWluIHdvcmtzcGFjZSBzZWFyY2ggc2tpbGwnLCBleHRlbnNpb25JZDogJ0dpdEh1Yi5jb3BpbG90LWNoYXQnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90IENoYXQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvYWNtZS50b29scy9za2lsbHMvYXVkaXQvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0F1ZGl0JywgZGVzY3JpcHRpb246ICdUaGlyZC1wYXJ0eSBhdWRpdCBza2lsbCcsIGV4dGVuc2lvbklkOiAnYWNtZS50b29scycsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnQWNtZSBUb29scycgfSxcblx0Ly8gU2tpbGxzIC0gYnVpbHQtaW4gKHNlc3Npb25zIGJ1bmRsZWQgc2tpbGxzIHdpdGggVUkgaW50ZWdyYXRpb25zKVxuXHR7IHVyaTogVVJJLmZpbGUoJy9hcHAvc2tpbGxzL2FjdC1vbi1mZWVkYmFjay9TS0lMTC5tZCcpLCBzdG9yYWdlOiBCVUlMVElOX1NUT1JBR0UgYXMgUHJvbXB0c1N0b3JhZ2UsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnYWN0LW9uLWZlZWRiYWNrJywgZGVzY3JpcHRpb246ICdBY3Qgb24gdXNlciBmZWVkYmFjayBhdHRhY2hlZCB0byB0aGUgY3VycmVudCBzZXNzaW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9hcHAvc2tpbGxzL2dlbmVyYXRlLXJ1bi1jb21tYW5kcy9TS0lMTC5tZCcpLCBzdG9yYWdlOiBCVUlMVElOX1NUT1JBR0UgYXMgUHJvbXB0c1N0b3JhZ2UsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnZ2VuZXJhdGUtcnVuLWNvbW1hbmRzJywgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBvciBtb2RpZnkgcnVuIGNvbW1hbmRzIGZvciB0aGUgY3VycmVudCBzZXNzaW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9hcHAvc2tpbGxzL2NvbW1pdC9TS0lMTC5tZCcpLCBzdG9yYWdlOiBCVUlMVElOX1NUT1JBR0UgYXMgUHJvbXB0c1N0b3JhZ2UsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnY29tbWl0JywgZGVzY3JpcHRpb246ICdDb21taXQgc3RhZ2VkIG9yIHVuc3RhZ2VkIGNoYW5nZXMgd2l0aCBhbiBBSS1nZW5lcmF0ZWQgY29tbWl0IG1lc3NhZ2UnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2FwcC9za2lsbHMvY3JlYXRlLXByL1NLSUxMLm1kJyksIHN0b3JhZ2U6IEJVSUxUSU5fU1RPUkFHRSBhcyBQcm9tcHRzU3RvcmFnZSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdjcmVhdGUtcHInLCBkZXNjcmlwdGlvbjogJ0NyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgdGhlIGN1cnJlbnQgc2Vzc2lvbicgfSxcblx0Ly8gUHJvbXB0cyBcdTIwMTQgd29ya3NwYWNlXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvZXhwbGFpbi5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ0V4cGxhaW4nLCBkZXNjcmlwdGlvbjogJ0V4cGxhaW4gc2VsZWN0ZWQgY29kZScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy9yZXZpZXcucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdSZXZpZXcnLCBkZXNjcmlwdGlvbjogJ1JldmlldyBjaGFuZ2VzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL2ZpeC1idWcucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdGaXggQnVnJywgZGVzY3JpcHRpb246ICdEaWFnbm9zZSBhbmQgZml4IGEgYnVnIGZyb20gaXNzdWUnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvd3JpdGUtdGVzdHMucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdXcml0ZSBUZXN0cycsIGRlc2NyaXB0aW9uOiAnR2VuZXJhdGUgdW5pdCB0ZXN0cyBmb3Igc2VsZWN0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL2FkZC1kb2NzLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBuYW1lOiAnQWRkIERvY3MnLCBkZXNjcmlwdGlvbjogJ0FkZCBKU0RvYyBjb21tZW50cyB0byBmdW5jdGlvbnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvb3B0aW1pemUucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdPcHRpbWl6ZScsIGRlc2NyaXB0aW9uOiAnT3B0aW1pemUgY29kZSBmb3IgcGVyZm9ybWFuY2UnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvY29udmVydC10by10cy5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ0NvbnZlcnQgdG8gVFMnLCBkZXNjcmlwdGlvbjogJ0NvbnZlcnQgSmF2YVNjcmlwdCB0byBUeXBlU2NyaXB0JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3N1bW1hcml6ZS1wci5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ1N1bW1hcml6ZSBQUicsIGRlc2NyaXB0aW9uOiAnR2VuZXJhdGUgUFIgZGVzY3JpcHRpb24gZnJvbSBkaWZmJyB9LFxuXHQvLyBQcm9tcHRzIFx1MjAxNCB1c2VyXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3VzZXItZGF0YS9wcm9tcHRzL3Byb2ZpbGUucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLCBuYW1lOiAnUHJvZmlsZSBQcm9tcHQnLCBkZXNjcmlwdGlvbjogJ1ZTIENvZGUgcHJvZmlsZSBwcm9tcHQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L3Byb21wdHMvdHJhbnNsYXRlLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdUcmFuc2xhdGUnLCBkZXNjcmlwdGlvbjogJ1RyYW5zbGF0ZSBzdHJpbmdzIGZvciBpMThuJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9wcm9tcHRzL2NvbW1pdC1tc2cucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ0NvbW1pdCBNZXNzYWdlJywgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBjb252ZW50aW9uYWwgY29tbWl0JyB9LFxuXHQvLyBQcm9tcHRzIC0gZXh0ZW5zaW9uIChidWlsdC1pbiArIHRoaXJkLXBhcnR5KVxuXHR7IHVyaTogVVJJLmZpbGUoJy9leHRlbnNpb25zL2dpdGh1Yi5jb3BpbG90LWNoYXQvcHJvbXB0cy90cmFjZS5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdUcmFjZScsIGRlc2NyaXB0aW9uOiAnQnVpbHQtaW4gdHJhY2luZyBwcm9tcHQnLCBleHRlbnNpb25JZDogJ0dpdEh1Yi5jb3BpbG90LWNoYXQnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90IENoYXQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvYWNtZS50b29scy9wcm9tcHRzL2xpbnQucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBuYW1lOiAnTGludCcsIGRlc2NyaXB0aW9uOiAnVGhpcmQtcGFydHkgbGludCBwcm9tcHQnLCBleHRlbnNpb25JZDogJ2FjbWUudG9vbHMnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0FjbWUgVG9vbHMnIH0sXG5cdC8vIEhvb2tzIFx1MjAxNCB3b3Jrc3BhY2Vcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLWNvbW1pdC5qc29uJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnUHJlLUNvbW1pdCBMaW50JywgZGVzY3JpcHRpb246ICdSdW4gbGludGluZyBiZWZvcmUgY29tbWl0JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wb3N0LXNhdmUuanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgbmFtZTogJ1Bvc3QtU2F2ZSBGb3JtYXQnLCBkZXNjcmlwdGlvbjogJ0F1dG8tZm9ybWF0IG9uIHNhdmUnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL29uLXRlc3QtZmFpbC5qc29uJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnT24gVGVzdCBGYWlsdXJlJywgZGVzY3JpcHRpb246ICdTdWdnZXN0IGZpeCB3aGVuIHRlc3RzIGZhaWwnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS1wdXNoLmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdQcmUtUHVzaCBDaGVjaycsIGRlc2NyaXB0aW9uOiAnUnVuIHR5cGUtY2hlY2sgYmVmb3JlIHB1c2gnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3Bvc3QtY3JlYXRlLmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdQb3N0LUNyZWF0ZScsIGRlc2NyaXB0aW9uOiAnSW5pdGlhbGl6ZSBib2lsZXJwbGF0ZSBmb3IgbmV3IGZpbGVzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9vbi1lcnJvci5qc29uJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnT24gRXJyb3InLCBkZXNjcmlwdGlvbjogJ0xvZyBhbmQgcmVwb3J0IHVuaGFuZGxlZCBlcnJvcnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3Bvc3QtdG9vbC1jYWxsLmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdQb3N0IFRvb2wgQ2FsbCcsIGRlc2NyaXB0aW9uOiAnRWNobyBjb25maXJtYXRpb24gYWZ0ZXIgZWFjaCB0b29sIGNhbGwnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL29uLWJ1aWxkLWZhaWwuanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgbmFtZTogJ09uIEJ1aWxkIEZhaWx1cmUnLCBkZXNjcmlwdGlvbjogJ0F1dG8tZGlhZ25vc2UgYnVpbGQgZXJyb3JzJyB9LFxuXHQvLyBIb29rcyBcdTIwMTQgdXNlclxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9ob29rcy9kYWlseS1zdW1tYXJ5Lmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgbmFtZTogJ0RhaWx5IFN1bW1hcnknLCBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIGRhaWx5IHdvcmsgc3VtbWFyeScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvaG9va3MvYmFja3VwLWNoYW5nZXMuanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnQmFja3VwIENoYW5nZXMnLCBkZXNjcmlwdGlvbjogJ0F1dG8tc3Rhc2ggdW5jb21taXR0ZWQgY2hhbmdlcycgfSxcbl07XG5cbmNvbnN0IGFnZW50SW5zdHJ1Y3Rpb25zOiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSA9IFtcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL0FHRU5UUy5tZCcpLCByZWFsUGF0aDogdW5kZWZpbmVkLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuYWdlbnRzTWQgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL0NMQVVERS5tZCcpLCByZWFsUGF0aDogdW5kZWZpbmVkLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY2xhdWRlTWQgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnKSwgcmVhbFBhdGg6IHVuZGVmaW5lZCwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCB9LFxuXTtcblxuY29uc3QgbWNwV29ya3NwYWNlU2VydmVycyA9IFtcblx0bWFrZUxvY2FsTWNwU2VydmVyKFxuXHRcdCdjb21wb25lbnQtZXhwbG9yZXInLFxuXHRcdCdjb21wb25lbnQtZXhwbG9yZXInLFxuXHRcdExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLFxuXHRcdCdDb21wb25lbnQgZml4dHVyZXMgYW5kIHNjcmVlbnNob3QgdG9vbGluZycsXG5cdFx0e1xuXHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdGNvbW1hbmQ6ICducG0nLFxuXHRcdFx0YXJnczogWydleGVjJywgJy0tbm8nLCAnLS0nLCAnY29tcG9uZW50LWV4cGxvcmVyJywgJ21jcCcsICctcCcsICcuL3Rlc3QvY29tcG9uZW50Rml4dHVyZXMvY29tcG9uZW50LWV4cGxvcmVyLmpzb24nLCAnLS11c2UtZGFlbW9uJywgJy12diddLFxuXHRcdH1cblx0KSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtcG9zdGdyZXMnLCAnUG9zdGdyZVNRTCcsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLCAnRGF0YWJhc2UgYWNjZXNzJyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLWdpdGh1YicsICdHaXRIdWInLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0dpdEh1YiBBUEknKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtcmVkaXMnLCAnUmVkaXMnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0luLW1lbW9yeSBkYXRhIHN0b3JlJyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLWRvY2tlcicsICdEb2NrZXInLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0NvbnRhaW5lciBtYW5hZ2VtZW50JyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXNsYWNrJywgJ1NsYWNrJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UsICdUZWFtIG1lc3NhZ2luZycpLFxuXHRtYWtlTG9jYWxNY3BTZXJ2ZXIoJ21jcC1qaXJhJywgJ0ppcmEnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0lzc3VlIHRyYWNraW5nJyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLWF3cycsICdBV1MnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0FtYXpvbiBXZWIgU2VydmljZXMnKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtZ3JhcGhxbCcsICdHcmFwaFFMJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UsICdHcmFwaFFMIEFQSSBnYXRld2F5JyksXG5dO1xuY29uc3QgbWNwVXNlclNlcnZlcnMgPSBbXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXdlYi1zZWFyY2gnLCAnV2ViIFNlYXJjaCcsIExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciwgJ1NlYXJjaCB0aGUgd2ViJyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLWZpbGVzeXN0ZW0nLCAnRmlsZXN5c3RlbScsIExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciwgJ0xvY2FsIGZpbGUgb3BlcmF0aW9ucycpLFxuXHRtYWtlTG9jYWxNY3BTZXJ2ZXIoJ21jcC1wdXBwZXRlZXInLCAnUHVwcGV0ZWVyJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyLCAnQnJvd3NlciBhdXRvbWF0aW9uJyksXG5dO1xuY29uc3QgbWNwUnVudGltZVNlcnZlcnMgPSBbXG5cdHsgZGVmaW5pdGlvbjogeyBpZDogJ2dpdGh1Yi1jb3BpbG90LW1jcCcsIGxhYmVsOiAnR2l0SHViIENvcGlsb3QnIH0sIGNvbGxlY3Rpb246IHsgaWQ6ICdleHQuZ2l0aHViLmNvcGlsb3QvbWNwJywgbGFiZWw6ICdleHQuZ2l0aHViLmNvcGlsb3QvbWNwJyB9LCBlbmFibGVtZW50OiBjb25zdE9ic2VydmFibGUoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKSwgY29ubmVjdGlvblN0YXRlOiBjb25zdE9ic2VydmFibGUoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RhcnRpbmcgfSksIHNob3dPdXRwdXQoKSB7IH0gfSxcblx0eyBkZWZpbml0aW9uOiB7IGlkOiAnbWNwLXBvc3RncmVzJywgbGFiZWw6ICdQb3N0Z3JlU1FMJyB9LCBjb2xsZWN0aW9uOiB7IGlkOiAnd29ya3NwYWNlLW1jcCcsIGxhYmVsOiAnV29ya3NwYWNlIE1DUCcgfSwgZW5hYmxlbWVudDogY29uc3RPYnNlcnZhYmxlKENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSksIGNvbm5lY3Rpb25TdGF0ZTogY29uc3RPYnNlcnZhYmxlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yIH0pLCBzaG93T3V0cHV0KCkgeyB9IH0sXG5cdHsgZGVmaW5pdGlvbjogeyBpZDogJ21jcC13ZWItc2VhcmNoJywgbGFiZWw6ICdXZWIgU2VhcmNoJyB9LCBjb2xsZWN0aW9uOiB7IGlkOiAndXNlci1tY3AnLCBsYWJlbDogJ1VzZXIgTUNQJyB9LCBlbmFibGVtZW50OiBjb25zdE9ic2VydmFibGUoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSksIGNvbm5lY3Rpb25TdGF0ZTogY29uc3RPYnNlcnZhYmxlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfSksIHNob3dPdXRwdXQoKSB7IH0gfSxcblx0eyBkZWZpbml0aW9uOiB7IGlkOiAnbWNwLWZpbGVzeXN0ZW0nLCBsYWJlbDogJ0ZpbGVzeXN0ZW0nIH0sIGNvbGxlY3Rpb246IHsgaWQ6ICd1c2VyLW1jcCcsIGxhYmVsOiAnVXNlciBNQ1AnIH0sIGVuYWJsZW1lbnQ6IGNvbnN0T2JzZXJ2YWJsZShDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpLCBjb25uZWN0aW9uU3RhdGU6IGNvbnN0T2JzZXJ2YWJsZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0pLCBzaG93T3V0cHV0KCkgeyB9IH0sXG5dO1xuXG5jb25zdCBhY3RpdmVTZXNzaW9uTWNwU2VydmVyczogRml4dHVyZUFnZW50SG9zdE1jcFNlcnZlcltdID0gW1xuXHR7IGlkOiAnbWNwLXRvcC1sZXZlbDpmaXh0dXJlOnNlc3Npb246Y29tcG9uZW50LWV4cGxvcmVyJywgbmFtZTogJ2NvbXBvbmVudC1leHBsb3JlcicsIGVuYWJsZWQ6IHRydWUsIHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlJlYWR5LCBzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSwgbG9nT3V0cHV0Q2hhbm5lbElkOiAnZml4dHVyZS1hZ2VudC1ob3N0Jywgc3RhcnQ6IG1jcExpZmVjeWNsZU5vb3AsIHN0b3A6IG1jcExpZmVjeWNsZU5vb3AsIHNldEVuYWJsZWQoKSB7IH0gfSxcblx0eyBpZDogJ21jcC10b3AtbGV2ZWw6Zml4dHVyZTpzZXNzaW9uOlJlbW90ZSBCcm93c2VyJywgbmFtZTogJ1JlbW90ZSBCcm93c2VyJywgZW5hYmxlZDogdHJ1ZSwgc3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkLCBzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkLCByZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCwgcmVzb3VyY2U6IHsgcmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScgfSB9LCBsb2dPdXRwdXRDaGFubmVsSWQ6ICdmaXh0dXJlLWFnZW50LWhvc3QnLCBzdGFydDogbWNwTGlmZWN5Y2xlTm9vcCwgc3RvcDogbWNwTGlmZWN5Y2xlTm9vcCwgc2V0RW5hYmxlZCgpIHsgfSB9LFxuXHR7IGlkOiAnbWNwLXRvcC1sZXZlbDpmaXh0dXJlOnNlc3Npb246UmVtb3RlIFNlYXJjaCcsIG5hbWU6ICdSZW1vdGUgU2VhcmNoJywgZW5hYmxlZDogdHJ1ZSwgc3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5FcnJvciwgZXJyb3I6IHsgZXJyb3JUeXBlOiAnZml4dHVyZScsIG1lc3NhZ2U6ICdGaXh0dXJlIGVycm9yJyB9IH0sIGxvZ091dHB1dENoYW5uZWxJZDogJ2ZpeHR1cmUtYWdlbnQtaG9zdCcsIHN0YXJ0OiBtY3BMaWZlY3ljbGVOb29wLCBzdG9wOiBtY3BMaWZlY3ljbGVOb29wLCBzZXRFbmFibGVkKCkgeyB9IH0sXG5dO1xuXG5pbnRlcmZhY2UgSVJlbmRlckVkaXRvck9wdGlvbnMge1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1hbmFnZW1lbnRTZWN0aW9ucz86IHJlYWRvbmx5IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uW107XG5cdHJlYWRvbmx5IGF2YWlsYWJsZUhhcm5lc3Nlcz86IHJlYWRvbmx5IElIYXJuZXNzRGVzY3JpcHRvcltdO1xuXHRyZWFkb25seSBzZWxlY3RlZFNlY3Rpb24/OiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjtcblx0cmVhZG9ubHkgc2Nyb2xsVG9Cb3R0b20/OiBib29sZWFuO1xuXHRyZWFkb25seSB3aWR0aD86IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0PzogbnVtYmVyO1xuXHRyZWFkb25seSBza2lsbFVJSW50ZWdyYXRpb25zPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uTWNwU2VydmVycz86IHJlYWRvbmx5IEZpeHR1cmVBZ2VudEhvc3RNY3BTZXJ2ZXJbXTtcblx0LyoqIFdoZW4gdHJ1ZSwgc2ltdWxhdGVzIGNsaWNraW5nIHRoZSBmaXJzdCBsaXN0IHJvdyB0byBlbnRlciB0aGUgZW1iZWRkZWQgZWRpdG9yIC8gZGV0YWlsIHZpZXcuICovXG5cdHJlYWRvbmx5IG9wZW5GaXJzdEl0ZW0/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcGVuSXRlbUxhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBlZGl0b3JEaXNwbGF5TW9kZT86ICdwcmV2aWV3JyB8ICdyYXcnO1xuXHRyZWFkb25seSBtaWdyYXRpb25DYXRlZ29yeT86IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkO1xufVxuXG5mdW5jdGlvbiByZW5kZXJGaXh0dXJlTWFya2Rvd24obWFya2Rvd246IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgY29udGFpbmVyID0gRE9NLiQoJ2Rpdi5maXh0dXJlLXJlbmRlcmVkLW1hcmtkb3duJyk7XG5cdGNvbnN0IGxpbmVzID0gbWFya2Rvd24uc3BsaXQoL1xccj9cXG4vKTtcblx0bGV0IGluZGV4ID0gMDtcblxuXHR3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdLnRyaW1FbmQoKTtcblx0XHRpZiAoIWxpbmUudHJpbSgpKSB7XG5cdFx0XHRpbmRleCsrO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnIyMgJykpIHtcblx0XHRcdGNvbnN0IGhlYWRpbmcgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJ2gyJykpO1xuXHRcdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGxpbmUuc2xpY2UoMyk7XG5cdFx0XHRpbmRleCsrO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnLSAnKSkge1xuXHRcdFx0Y29uc3QgbGlzdCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgndWwnKSk7XG5cdFx0XHR3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGggJiYgbGluZXNbaW5kZXhdLnRyaW1TdGFydCgpLnN0YXJ0c1dpdGgoJy0gJykpIHtcblx0XHRcdFx0RE9NLmFwcGVuZChsaXN0LCBET00uJCgnbGknKSkudGV4dENvbnRlbnQgPSBsaW5lc1tpbmRleF0udHJpbVN0YXJ0KCkuc2xpY2UoMik7XG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAobGluZS5zdGFydHNXaXRoKCdgYGAnKSkge1xuXHRcdFx0aW5kZXgrKztcblx0XHRcdGNvbnN0IGNvZGVMaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRcdHdoaWxlIChpbmRleCA8IGxpbmVzLmxlbmd0aCAmJiAhbGluZXNbaW5kZXhdLnN0YXJ0c1dpdGgoJ2BgYCcpKSB7XG5cdFx0XHRcdGNvZGVMaW5lcy5wdXNoKGxpbmVzW2luZGV4XSk7XG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcmUgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJ3ByZScpKTtcblx0XHRcdERPTS5hcHBlbmQocHJlLCBET00uJCgnY29kZScpKS50ZXh0Q29udGVudCA9IGNvZGVMaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdGluZGV4Kys7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJhZ3JhcGggPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJ3AnKSk7XG5cdFx0cGFyYWdyYXBoLnRleHRDb250ZW50ID0gbGluZS5yZXBsYWNlKC9cXCpcXCovZywgJycpO1xuXHRcdGluZGV4Kys7XG5cdH1cblxuXHRyZXR1cm4gY29udGFpbmVyO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZW5kZXIgaGVscGVyIFx1MjAxNCBjcmVhdGVzIHRoZSBmdWxsIG1hbmFnZW1lbnQgZWRpdG9yXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlckVkaXRvcihjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBvcHRpb25zOiBJUmVuZGVyRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB3aWR0aCA9IG9wdGlvbnMud2lkdGggPz8gOTAwO1xuXHRjb25zdCBoZWlnaHQgPSBvcHRpb25zLmhlaWdodCA/PyA2MDA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRjb25zdCBpc1Nlc3Npb25zV2luZG93ID0gb3B0aW9ucy5pc1Nlc3Npb25zV2luZG93ID8/IGZhbHNlO1xuXHRjb25zdCBza2lsbFVJSW50ZWdyYXRpb25zID0gb3B0aW9ucy5za2lsbFVJSW50ZWdyYXRpb25zID8/IG5ldyBNYXAoKTtcblx0Y29uc3QgbWFuYWdlbWVudFNlY3Rpb25zID0gb3B0aW9ucy5tYW5hZ2VtZW50U2VjdGlvbnMgPz8gW1xuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zLFxuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMsXG5cdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycyxcblx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRdO1xuXHRjb25zdCBhdmFpbGFibGVIYXJuZXNzZXMgPSBvcHRpb25zLmF2YWlsYWJsZUhhcm5lc3NlcyA/PyBbXG5cdFx0Y3JlYXRlVlNDb2RlSGFybmVzc0Rlc2NyaXB0b3IoKSxcblx0XHR7XG5cdFx0XHRpZDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRsYWJlbDogJ0NvcGlsb3QgW0FnZW50IEhvc3RdJyxcblx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5zZXJ2ZXIuaWQpLFxuXHRcdFx0aGlkZGVuU2VjdGlvbnM6IFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzXSxcblx0XHRcdGhpZGVHZW5lcmF0ZUJ1dHRvbjogdHJ1ZSxcblx0XHRcdGl0ZW1Qcm92aWRlcjogY3JlYXRlRml4dHVyZUFnZW50SG9zdEl0ZW1Qcm92aWRlcihhbGxGaWxlcyksXG5cdFx0fSxcblx0XTtcblxuXHRjb25zdCBhbGxNY3BTZXJ2ZXJzID0gWy4uLm1jcFdvcmtzcGFjZVNlcnZlcnMsIC4uLm1jcFVzZXJTZXJ2ZXJzXTtcblx0Y29uc3QgZml4dHVyZUZpbGVzID0gYWxsRmlsZXMubWFwKGZpbGUgPT4gKHsgLi4uZmlsZSB9KSk7XG5cdGNvbnN0IGZpbGVDb250ZW50cyA9IGNyZWF0ZUZpeHR1cmVDb250ZW50TWFwKGZpeHR1cmVGaWxlcywgYWdlbnRJbnN0cnVjdGlvbnMpO1xuXHRjb25zdCBwcm9tcHRGaWxlc0RpZENoYW5nZUVtaXR0ZXIgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Y29uc3QgY3JlYXRlZEZvbGRlcnMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHQvLyBIb2xkcyBhIGxhenkgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCBzZXJ2aWNlIHNvIHRoZSBJVGV4dE1vZGVsU2VydmljZSBtb2NrXG5cdC8vIChyZWdpc3RlcmVkIGJlbG93KSBjYW4gY3JlYXRlIHJlYWwgSVRleHRNb2RlbCBpbnN0YW5jZXMgb24gZGVtYW5kLiBUaGVcblx0Ly8gbWFuYWdlbWVudCBlZGl0b3IgY2FsbHMgYGNyZWF0ZU1vZGVsUmVmZXJlbmNlYCB3aGVuIHRoZSB1c2VyIG9wZW5zIGFuXG5cdC8vIGl0ZW0gXHUyMDE0IGZpeHR1cmVVdGlscycgZGVmYXVsdCBtb2NrIHJldHVybnMgYHsgdGV4dEVkaXRvck1vZGVsOiBudWxsIH1gLFxuXHQvLyB3aGljaCBjcmFzaGVzIHRoZSBlZGl0b3IuIFdlIHBvcHVsYXRlIHRoaXMgYWZ0ZXIgdGhlIGluc3RhbnRpYXRpb25cblx0Ly8gc2VydmljZSBpcyBjcmVhdGVkLlxuXHRjb25zdCBtb2RlbFNlcnZpY2VSZWY6IHsgdmFsdWU6IElNb2RlbFNlcnZpY2UgfCB1bmRlZmluZWQgfSA9IHsgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2VSZWY6IHsgdmFsdWU6IElMYW5ndWFnZVNlcnZpY2UgfCB1bmRlZmluZWQgfSA9IHsgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoY3R4LmRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdGNvbnN0IGhhcm5lc3NTZXJ2aWNlID0gY3JlYXRlTW9ja0hhcm5lc3NTZXJ2aWNlKG9wdGlvbnMuc2Vzc2lvblJlc291cmNlLCBhdmFpbGFibGVIYXJuZXNzZXMpO1xuXHRcdFx0Y29uc3QgYWdlbnRGZWVkYmFja1NlcnZpY2UgPSBjcmVhdGVNb2NrQWdlbnRGZWVkYmFja1NlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGNvZGVSZXZpZXdTZXJ2aWNlID0gY3JlYXRlTW9ja0NvZGVSZXZpZXdTZXJ2aWNlKCk7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHQvLyBFbmFibGUgdGhlIHN0cnVjdHVyZWQgY3VzdG9taXphdGlvbiBwcmV2aWV3IHNldHRpbmcgc28gdGhlXG5cdFx0XHQvLyBlZGl0b3IgZXhlcmNpc2VzIHRoZSBwcmV2aWV3LWZpcnN0IGJlaGF2aW9yIGluIGZpeHR1cmVzLlxuXHRcdFx0Ly8gQWxzbyBlbmFibGUgY3VzdG9taXphdGlvbiBtaWdyYXRpb24gc28gbWlncmF0aW9uIGFmZm9yZGFuY2VzIHJlbmRlciBpblxuXHRcdFx0Ly8gc2NyZWVuc2hvdCBmaXh0dXJlcyB0aGF0IGRlcGVuZCBvbiBhZ2VudC1ob3N0IGhhcm5lc3Nlcy5cblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zU3RydWN0dXJlZFByZXZpZXdFbmFibGVkXTogdHJ1ZSxcblx0XHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWRdOiB0cnVlLFxuXHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zVXNlckRhdGFNaWdyYXRpb25FbmFibGVkXTogdHJ1ZSxcblx0XHRcdH0pKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVRleHRNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gbW9kZWxTZXJ2aWNlUmVmLnZhbHVlITtcblx0XHRcdFx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBsYW5ndWFnZVNlcnZpY2VSZWYudmFsdWUhO1xuXHRcdFx0XHRcdGxldCBtb2RlbCA9IG1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5ndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUocmVzb3VyY2UpID8/ICdwbGFpbnRleHQnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRcdG1vZGVsID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBsYW5ndWFnZVNlbGVjdGlvbiwgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBvbldpbGxEaXNwb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdFx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWw6IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCA9IHtcblx0XHRcdFx0XHRcdHRleHRFZGl0b3JNb2RlbDogbW9kZWwsXG5cdFx0XHRcdFx0XHRvbldpbGxEaXNwb3NlOiBvbldpbGxEaXNwb3NlLmV2ZW50LFxuXHRcdFx0XHRcdFx0aXNSZWFkb25seTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRpc1Jlc29sdmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNEaXNwb3NlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRnZXRMYW5ndWFnZUlkOiAoKSA9PiBtb2RlbC5nZXRMYW5ndWFnZUlkKCksXG5cdFx0XHRcdFx0XHRjcmVhdGVTbmFwc2hvdDogKCkgPT4gbW9kZWwuY3JlYXRlU25hcHNob3QoKSxcblx0XHRcdFx0XHRcdHJlc29sdmU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IG9uV2lsbERpc3Bvc2UuZGlzcG9zZSgpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHsgb2JqZWN0OiB0ZXh0RWRpdG9yTW9kZWwsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcigpIHsgcmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50RmVlZGJhY2tTZXJ2aWNlLCBhZ2VudEZlZWRiYWNrU2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNvZGVSZXZpZXdTZXJ2aWNlLCBjb2RlUmV2aWV3U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRFZGl0aW5nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEVkaXRpbmdTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZWRpdGluZ1Nlc3Npb25zT2JzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRTZXNzaW9uc1NlcnZpY2VbJ21vZGVsJ10+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25zID0gW107XG5cdFx0XHRcdH0oKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvbXB0c1NlcnZpY2UsIGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShmaXh0dXJlRmlsZXMsIGFnZW50SW5zdHJ1Y3Rpb25zLCBmaWxlQ29udGVudHMsIHByb21wdEZpbGVzRGlkQ2hhbmdlRW1pdHRlci5ldmVudCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IGlzU2Vzc2lvbnNXaW5kb3c7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdlbGNvbWVQYWdlRmVhdHVyZXMgPSB7XG5cdFx0XHRcdFx0c2hvd0dldHRpbmdTdGFydGVkQmFubmVyOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVQcm9qZWN0Um9vdCA9IG9ic2VydmFibGVWYWx1ZSgncm9vdCcsIFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBoYXNPdmVycmlkZVByb2plY3RSb290ID0gb2JzZXJ2YWJsZVZhbHVlKCdoYXNPdmVycmlkZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSB7IHJldHVybiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGNsZWFyT3ZlcnJpZGVQcm9qZWN0Um9vdCgpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBzZXRPdmVycmlkZVByb2plY3RSb290KCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1hbmFnZW1lbnRTZWN0aW9ucyA9IG1hbmFnZW1lbnRTZWN0aW9ucztcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2VuZXJhdGVDdXN0b21pemF0aW9uKCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNraWxsVUlJbnRlZ3JhdGlvbnMoKSB7IHJldHVybiBza2lsbFVJSW50ZWdyYXRpb25zOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIGhhcm5lc3NTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIGNyZWF0ZU1vY2tBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZShvcHRpb25zLmFjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJzKSk7XG5cdFx0XHQvLyBBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIGlzIHRoZSBzaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBpdGVtc1xuXHRcdFx0Ly8gaW4gdGhlIGVkaXRvci4gUmVnaXN0ZXIgdGhlIHJlYWwgaW1wbGVtZW50YXRpb24gXHUyMDE0IGl0IHdpbGwgcmVzb2x2ZVxuXHRcdFx0Ly8gaXRlbXMgdmlhIHRoZSBtb2NrIHByb21wdHMgc2VydmljZSAvIGhhcm5lc3Mgc2VydmljZSBhYm92ZS5cblx0XHRcdHJlZy5kZWZpbmUoSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldEN1c3RvbWl6YXRpb25zKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFJlZ2lzdGVyZWRDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBoYXNDdXN0b21pemF0aW9uc1Byb3ZpZGVyKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUF1dG9tYXRpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGF1dG9tYXRpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcnVucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJ1bnNGb3IoKSB7IHJldHVybiBjb25zdE9ic2VydmFibGUoW10pOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBdXRvbWF0aW9uUnVubmVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uUnVubmVyPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2hvd0F1dG9tYXRpb25EaWFsb2coKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2UgeyByZXR1cm4geyBpZDogJ3Rlc3QnLCBmb2xkZXJzOiBbXSB9OyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdvcmtiZW5jaFN0YXRlKCk6IFdvcmtiZW5jaFN0YXRlIHsgcmV0dXJuIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRmlsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRGaWxlc0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGV4aXN0cyhyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZpbGVDb250ZW50cy5oYXMocmVzb3VyY2UpIHx8IGNyZWF0ZWRGb2xkZXJzLmhhcyhyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gZmlsZUNvbnRlbnRzLmdldChyZXNvdXJjZSkgPz8gJyc7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpeHR1cmVGaWxlQ29udGVudFN0YXQocmVzb3VyY2UsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVGb2xkZXIocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdGNyZWF0ZWRGb2xkZXJzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpeHR1cmVGaWxlU3RhdChyZXNvdXJjZSwgMCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlcjogVlNCdWZmZXIpIHtcblx0XHRcdFx0XHRmaWxlQ29udGVudHMuc2V0KHJlc291cmNlLCBidWZmZXIudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Y3JlYXRlZEZvbGRlcnMuYWRkKGRpcm5hbWVVcmkocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL1NLSUxMLm1kJykgJiYgIWZpeHR1cmVGaWxlcy5zb21lKGZpbGUgPT4gZmlsZS51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNraWxsTmFtZSA9IHJlc291cmNlLnBhdGguc3BsaXQoJy8nKS5hdCgtMikgPz8gJ21pZ3JhdGVkLXNraWxsJztcblx0XHRcdFx0XHRcdGZpeHR1cmVGaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0c3RvcmFnZTogcmVzb3VyY2UucGF0aC5zdGFydHNXaXRoKCcvd29ya3NwYWNlLycpID8gUHJvbXB0c1N0b3JhZ2UubG9jYWwgOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0XHRcdFx0bmFtZTogc2tpbGxOYW1lLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYE1pZ3JhdGVkIGZyb20gcHJvbXB0ICR7c2tpbGxOYW1lfWAsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJvbXB0RmlsZXNEaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm4gY3JlYXRlRml4dHVyZUZpbGVTdGF0KHJlc291cmNlLCBidWZmZXIuYnl0ZUxlbmd0aCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGRlbChyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdFx0ZmlsZUNvbnRlbnRzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZUluZGV4ID0gZml4dHVyZUZpbGVzLmZpbmRJbmRleChmaWxlID0+IGZpbGUudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGlmIChmaWxlSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0Zml4dHVyZUZpbGVzLnNwbGljZShmaWxlSW5kZXgsIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcm9tcHRGaWxlc0RpZENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQYXRoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGF0aFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkZWZhdWx0VXJpU2NoZW1lID0gJ2ZpbGUnO1xuXHRcdFx0XHRvdmVycmlkZSB1c2VySG9tZSgpOiBVUkk7XG5cdFx0XHRcdG92ZXJyaWRlIHVzZXJIb21lKCk6IFByb21pc2U8VVJJPjtcblx0XHRcdFx0b3ZlcnJpZGUgdXNlckhvbWUoKTogVVJJIHwgUHJvbWlzZTxVUkk+IHsgcmV0dXJuIHVzZXJIb21lOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElUZXh0TW9kZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0TW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPj4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IG1vZGVsU2VydmljZVJlZi52YWx1ZSE7XG5cdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlUmVmLnZhbHVlITtcblx0XHRcdFx0XHRsZXQgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlKSA/PyAncGxhaW50ZXh0Jztcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlU2VsZWN0aW9uID0gbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0XHRtb2RlbCA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChmaWxlQ29udGVudHMuZ2V0KHJlc291cmNlKSA/PyAnJywgbGFuZ3VhZ2VTZWxlY3Rpb24sIHJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgb25XaWxsRGlzcG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsOiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwgPSB7XG5cdFx0XHRcdFx0XHR0ZXh0RWRpdG9yTW9kZWw6IG1vZGVsLFxuXHRcdFx0XHRcdFx0b25XaWxsRGlzcG9zZTogb25XaWxsRGlzcG9zZS5ldmVudCxcblx0XHRcdFx0XHRcdGlzUmVhZG9ubHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdFx0aXNSZXNvbHZlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0XHRcdGlzRGlzcG9zZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZDogKCkgPT4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0XHRcdFx0Y3JlYXRlU25hcHNob3Q6ICgpID0+IG1vZGVsLmNyZWF0ZVNuYXBzaG90KCksXG5cdFx0XHRcdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBvbldpbGxEaXNwb3NlLmRpc3Bvc2UoKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiB7IG9iamVjdDogdGV4dEVkaXRvck1vZGVsLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBjYW5IYW5kbGVSZXNvdXJjZSgpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoKSB7IHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9OyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3JraW5nQ29weVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtpbmdDb3B5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFNhdmUgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBpc0RpcnR5KF9yZXNvdXJjZTogVVJJKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRXh0ZW5zaW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVF1aWNrSW5wdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblZpZXc8VCBleHRlbmRzIHt9PihfaWQ6IHN0cmluZywgX2ZvY3VzPzogYm9vbGVhbikgeyByZXR1cm4gbnVsbCBhcyBUIHwgbnVsbDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJT3V0cHV0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJT3V0cHV0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHNob3dDaGFubmVsKCkgeyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXQgbGFzdEZvY3VzZWRXaWRnZXQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmV2ZWFsKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVJlcXVlc3RTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNYXJrZG93blJlbmRlcmVyU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVyZWQ6IElSZW5kZXJlZE1hcmtkb3duID0ge1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogcmVuZGVyRml4dHVyZU1hcmtkb3duKHR5cGVvZiBtYXJrZG93biA9PT0gJ3N0cmluZycgPyBtYXJrZG93biA6IG1hcmtkb3duLnZhbHVlKSxcblx0XHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gcmVuZGVyZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdlYnZpZXdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXZWJ2aWV3U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFdvcmtiZW5jaFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFdvcmtiZW5jaFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uUmVzZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBsb2NhbCA9IGFsbE1jcFNlcnZlcnM7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHF1ZXJ5TG9jYWwoKSB7IHJldHVybiBhbGxNY3BTZXJ2ZXJzOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGNhbkluc3RhbGwoKSB7IHJldHVybiB0cnVlIGFzIGNvbnN0OyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNY3BTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VydmVycyA9IGNvbnN0T2JzZXJ2YWJsZShtY3BSdW50aW1lU2VydmVycyBhcyBuZXZlcltdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFJlZ2lzdHJ5LCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BSZWdpc3RyeT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbGxlY3Rpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVsZWdhdGVzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbnB1dHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRQbHVnaW5TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFBsdWdpblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBwbHVnaW5zID0gY29uc3RPYnNlcnZhYmxlKGluc3RhbGxlZFBsdWdpbnMpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBlbmFibGVtZW50TW9kZWwgPSB1bmRlZmluZWQgYXMgbmV2ZXI7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBsdWdpbk1hcmtldHBsYWNlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGluc3RhbGxlZFBsdWdpbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1hcmtldHBsYWNlcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQbHVnaW5JbnN0YWxsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGx1Z2luSW5zdGFsbFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9kdWN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkZWZhdWx0Q2hhdEFnZW50ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxOb25OdWxsYWJsZTxJUHJvZHVjdFNlcnZpY2VbJ2RlZmF1bHRDaGF0QWdlbnQnXT4+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRFeHRlbnNpb25JZCA9ICdHaXRIdWIuY29waWxvdC1jaGF0Jztcblx0XHRcdFx0fSgpO1xuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRtb2RlbFNlcnZpY2VSZWYudmFsdWUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU1vZGVsU2VydmljZSk7XG5cdGxhbmd1YWdlU2VydmljZVJlZi52YWx1ZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Zm9yIChjb25zdCBbdXJpLCBjb250ZW50XSBvZiBmaWxlQ29udGVudHMpIHtcblx0XHRpZiAoIW1vZGVsU2VydmljZVJlZi52YWx1ZS5nZXRNb2RlbCh1cmkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZVJlZi52YWx1ZS5jcmVhdGVNb2RlbChjb250ZW50LCBudWxsLCB1cmksIGZhbHNlKTtcblx0XHRcdGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gbW9kZWwuZGlzcG9zZSgpIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGVkaXRvciA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IsIGNyZWF0ZU1vY2tFZGl0b3JHcm91cCgpKVxuXHQpO1xuXHRlZGl0b3IuY3JlYXRlKGN0eC5jb250YWluZXIpO1xuXHRlZGl0b3IubGF5b3V0KG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCkpO1xuXG5cdGNvbnN0IGVkaXRvcklucHV0ID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmdldE9yQ3JlYXRlKCkpO1xuXHRhd2FpdCBlZGl0b3Iuc2V0SW5wdXQoZWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwge30sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdGlmIChvcHRpb25zLnNlbGVjdGVkU2VjdGlvbikge1xuXHRcdGVkaXRvci5zZWxlY3RTZWN0aW9uQnlJZChvcHRpb25zLnNlbGVjdGVkU2VjdGlvbik7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5zY3JvbGxUb0JvdHRvbSkge1xuXHRcdGVkaXRvci5yZXZlYWxMYXN0SXRlbSgpO1xuXHR9XG5cblx0aWYgKG9wdGlvbnMubWlncmF0aW9uQ2F0ZWdvcnkpIHtcblx0XHRlZGl0b3Iuc2hvd0N1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlKG9wdGlvbnMubWlncmF0aW9uQ2F0ZWdvcnkpO1xuXHR9XG5cblx0aWYgKG9wdGlvbnMub3BlbkZpcnN0SXRlbSkge1xuXHRcdGNvbnN0IHZpc2libGVDb250ZW50ID0gWy4uLmN0eC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnByb21wdHMtY29udGVudC1jb250YWluZXIsIC5tY3AtY29udGVudC1jb250YWluZXIsIC5wbHVnaW4tY29udGVudC1jb250YWluZXInKV1cblx0XHRcdC5maW5kKG5vZGUgPT4gbm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmIG5vZGUuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKSBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcGVuSXRlbUxhYmVsID0gb3B0aW9ucy5vcGVuSXRlbUxhYmVsO1xuXHRcdGNvbnN0IHJvd1RvT3BlbiA9IG9wZW5JdGVtTGFiZWxcblx0XHRcdD8gWy4uLih2aXNpYmxlQ29udGVudD8ucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpID8/IFtdKV0uZmluZCgocm93KTogcm93IGlzIEhUTUxFbGVtZW50ID0+IHJvdyBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmIHJvdy50ZXh0Q29udGVudD8uaW5jbHVkZXMob3Blbkl0ZW1MYWJlbCkpXG5cdFx0XHQ6IHZpc2libGVDb250ZW50Py5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93LmFpLWN1c3RvbWl6YXRpb24tbGlzdC1pdGVtLCAubW9uYWNvLWxpc3Qtcm93Lm1jcC1zZXJ2ZXItaXRlbScpIGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyb3dUb09wZW4pIHtcblx0XHRcdHJvd1RvT3Blbi5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlLCBidXR0b246IDAgfSkpO1xuXHRcdFx0cm93VG9PcGVuLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSwgYnV0dG9uOiAwIH0pKTtcblx0XHRcdHJvd1RvT3Blbi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlLCBidXR0b246IDAgfSkpO1xuXHRcdFx0cm93VG9PcGVuLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBidXR0b246IDAgfSkpO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdFx0Y29uc3QgbW9kZUJ1dHRvbiA9IGN0eC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmVkaXRvci1tb2RlLWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRtb2RlQnV0dG9uPy5jbGljaygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBNQ1AgQnJvd3NlIE1vZGUgXHUyMDE0IHN0YW5kYWxvbmUgd2lkZ2V0IHdpdGggZ2FsbGVyeSByZXN1bHRzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIG1ha2VHYWxsZXJ5U2VydmVyKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHB1Ymxpc2hlcjogc3RyaW5nKTogSVdvcmtiZW5jaE1jcFNlcnZlciB7XG5cdGNvbnN0IGdhbGxlcnlTdHViID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxOb25OdWxsYWJsZTxJV29ya2JlbmNoTWNwU2VydmVyWydnYWxsZXJ5J10+PigpIHsgfSgpO1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTWNwU2VydmVyPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9IGlkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG5hbWUgPSBpZDtcblx0XHRvdmVycmlkZSByZWFkb25seSBsYWJlbCA9IGxhYmVsO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHVibGlzaGVyRGlzcGxheU5hbWUgPSBwdWJsaXNoZXI7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5zdGFsbFN0YXRlID0gTWNwU2VydmVySW5zdGFsbFN0YXRlLlVuaW5zdGFsbGVkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGdhbGxlcnkgPSBnYWxsZXJ5U3R1Yjtcblx0XHRvdmVycmlkZSByZWFkb25seSBsb2NhbCA9IHVuZGVmaW5lZDtcblx0fSgpO1xufVxuXG5jb25zdCBnYWxsZXJ5U2VydmVycyA9IFtcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktcG9zdGdyZXMnLCAnUG9zdGdyZVNRTCcsICdBY2Nlc3MgUG9zdGdyZVNRTCBkYXRhYmFzZXMgd2l0aCBzY2hlbWEgaW5zcGVjdGlvbiBhbmQgcXVlcnkgdG9vbHMnLCAnTWljcm9zb2Z0JyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LWdpdGh1YicsICdHaXRIdWInLCAnUmVwb3NpdG9yeSBtYW5hZ2VtZW50LCBpc3N1ZXMsIHB1bGwgcmVxdWVzdHMsIGFuZCBjb2RlIHNlYXJjaCcsICdHaXRIdWInKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktc2xhY2snLCAnU2xhY2snLCAnU2VuZCBtZXNzYWdlcywgbWFuYWdlIGNoYW5uZWxzLCBhbmQgc2VhcmNoIHdvcmtzcGFjZSBoaXN0b3J5JywgJ1NsYWNrIFRlY2hub2xvZ2llcycpLFxuXHRtYWtlR2FsbGVyeVNlcnZlcignZ2FsbGVyeS1kb2NrZXInLCAnRG9ja2VyJywgJ0NvbnRhaW5lciBsaWZlY3ljbGUgbWFuYWdlbWVudCBhbmQgaW1hZ2Ugb3BlcmF0aW9ucycsICdEb2NrZXIgSW5jJyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LWZpbGVzeXN0ZW0nLCAnRmlsZXN5c3RlbScsICdSZWFkLCB3cml0ZSwgYW5kIG5hdmlnYXRlIGxvY2FsIGZpbGVzIGFuZCBkaXJlY3RvcmllcycsICdNaWNyb3NvZnQnKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktYnJhdmUnLCAnQnJhdmUgU2VhcmNoJywgJ1dlYiBhbmQgbG9jYWwgc2VhcmNoIHBvd2VyZWQgYnkgdGhlIEJyYXZlIFNlYXJjaCBBUEknLCAnQnJhdmUgU29mdHdhcmUnKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktcHVwcGV0ZWVyJywgJ1B1cHBldGVlcicsICdCcm93c2VyIGF1dG9tYXRpb24gd2l0aCBzY3JlZW5zaG90cywgbmF2aWdhdGlvbiwgYW5kIGZvcm0gZmlsbGluZycsICdHb29nbGUnKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktbWVtb3J5JywgJ01lbW9yeScsICdLbm93bGVkZ2UgZ3JhcGggZm9yIHBlcnNpc3RlbnQgbWVtb3J5IGFjcm9zcyBjb252ZXJzYXRpb25zJywgJ01pY3Jvc29mdCcpLFxuXHRtYWtlR2FsbGVyeVNlcnZlcignZ2FsbGVyeS1mZXRjaCcsICdGZXRjaCcsICdSZXRyaWV2ZSBhbmQgY29udmVydCB3ZWIgY29udGVudCB0byBtYXJrZG93biBmb3IgYW5hbHlzaXMnLCAnTWljcm9zb2Z0JyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LXNlbnRyeScsICdTZW50cnknLCAnRXJyb3IgbW9uaXRvcmluZywgaXNzdWUgdHJhY2tpbmcsIGFuZCBwZXJmb3JtYW5jZSB0cmFjaW5nJywgJ1NlbnRyeScpLFxuXHRtYWtlR2FsbGVyeVNlcnZlcignZ2FsbGVyeS1zcWxpdGUnLCAnU1FMaXRlJywgJ1F1ZXJ5IGFuZCBtYW5hZ2UgU1FMaXRlIGRhdGFiYXNlcyB3aXRoIHNjaGVtYSBleHBsb3JhdGlvbicsICdDb21tdW5pdHknKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktcmVkaXMnLCAnUmVkaXMnLCAnSW4tbWVtb3J5IGRhdGEgc3RvcmUgb3BlcmF0aW9ucyBhbmQga2V5IG1hbmFnZW1lbnQnLCAnUmVkaXMgTHRkJyksXG5dO1xuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJNY3BCcm93c2VNb2RlKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgd2lkdGggPSA2NTA7XG5cdGNvbnN0IGhlaWdodCA9IDUwMDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoY3R4LmRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFdvcmtiZW5jaFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFdvcmtiZW5jaFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uUmVzZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBsb2NhbDogSVdvcmtiZW5jaE1jcFNlcnZlcltdID0gW107XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHF1ZXJ5TG9jYWwoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBjYW5JbnN0YWxsKCkgeyByZXR1cm4gdHJ1ZSBhcyBjb25zdDsgfVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBxdWVyeUdhbGxlcnkoKTogUHJvbWlzZTxJSXRlcmF0aXZlUGFnZXI8SVdvcmtiZW5jaE1jcFNlcnZlcj4+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Zmlyc3RQYWdlOiB7IGl0ZW1zOiBnYWxsZXJ5U2VydmVycywgaGFzTW9yZTogZmFsc2UgfSxcblx0XHRcdFx0XHRcdGFzeW5jIGdldE5leHRQYWdlKCkgeyByZXR1cm4geyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH07IH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTWNwU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWNwU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlcnZlcnMgPSBjb25zdE9ic2VydmFibGUoW10gYXMgbmV2ZXJbXSk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNY3BSZWdpc3RyeSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWNwUmVnaXN0cnk+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBjb2xsZWN0aW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGRlbGVnYXRlcyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5wdXRzID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50UGx1Z2luU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRQbHVnaW5TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcGx1Z2lucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElEaWFsb2dTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWFsb2dTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzU2Vzc2lvbnNXaW5kb3cgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgd2VsY29tZVBhZ2VGZWF0dXJlcyA9IHtcblx0XHRcdFx0XHRzaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXI6IHRydWUsXG5cdFx0XHRcdH07XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVByb2plY3RSb290ID0gb2JzZXJ2YWJsZVZhbHVlKCdyb290JywgVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGhhc092ZXJyaWRlUHJvamVjdFJvb3QgPSBvYnNlcnZhYmxlVmFsdWUoJ2hhc092ZXJyaWRlJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRBY3RpdmVQcm9qZWN0Um9vdCgpIHsgcmV0dXJuIFVSSS5maWxlKCcvd29ya3NwYWNlJyk7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlPFVSST4oJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlSGFybmVzcyA9IGRlcml2ZWQocmVhZGVyID0+IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlRGVzY3JpcHRvcigpIHsgcmV0dXJuIGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIGNyZWF0ZU1vY2tBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJT3V0cHV0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJT3V0cHV0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHNob3dDaGFubmVsKCkgeyB9XG5cdFx0XHR9KCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHdpZGdldCA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcExpc3RXaWRnZXQpXG5cdCk7XG5cdGN0eC5jb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmVsZW1lbnQpO1xuXHR3aWRnZXQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXG5cdC8vIENsaWNrIHRoZSBCcm93c2UgTWFya2V0cGxhY2UgYnV0dG9uIHRvIGVudGVyIGJyb3dzZSBtb2RlXG5cdGNvbnN0IGJyb3dzZUJ1dHRvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5saXN0LWFkZC1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0YnJvd3NlQnV0dG9uPy5jbGljaygpO1xuXG5cdC8vIFdhaXQgZm9yIHRoZSBnYWxsZXJ5IHF1ZXJ5IHRvIHJlc29sdmVcblx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFBsdWdpbiBCcm93c2UgTW9kZSBcdTIwMTQgc3RhbmRhbG9uZSB3aWRnZXQgd2l0aCBtYXJrZXRwbGFjZSByZXN1bHRzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIG1ha2VJbnN0YWxsZWRQbHVnaW4obmFtZTogc3RyaW5nLCB1cmk6IFVSSSwgZW5hYmxlZDogYm9vbGVhbik6IElBZ2VudFBsdWdpbiB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFBsdWdpbj4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdXJpID0gdXJpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZvcm1hdCA9IFBsdWdpbkZvcm1hdC5Db3BpbG90O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhYmVsID0gbmFtZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBlbmFibGVtZW50ID0gY29uc3RPYnNlcnZhYmxlKGVuYWJsZWQgPyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUgOiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBob29rcyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY29tbWFuZHMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNraWxscyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWdlbnRzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpbnN0cnVjdGlvbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1jcFNlcnZlckRlZmluaXRpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZW1vdmUoKSB7IH1cblx0fSgpO1xufVxuXG5jb25zdCBpbnN0YWxsZWRQbHVnaW5zOiBJQWdlbnRQbHVnaW5bXSA9IFtcblx0bWFrZUluc3RhbGxlZFBsdWdpbignTGluZWFyJywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9saW5lYXInKSwgdHJ1ZSksXG5cdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ1NlbnRyeScsIFVSSS5maWxlKCcvd29ya3NwYWNlLy5jb3BpbG90L3BsdWdpbnMvc2VudHJ5JyksIHRydWUpLFxuXHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdEYXRhZG9nJywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9kYXRhZG9nJyksIHRydWUpLFxuXHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdOb3Rpb24nLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zL25vdGlvbicpLCB0cnVlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignQ29uZmx1ZW5jZScsIFVSSS5maWxlKCcvd29ya3NwYWNlLy5jb3BpbG90L3BsdWdpbnMvY29uZmx1ZW5jZScpLCB0cnVlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignUGFnZXJEdXR5JywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9wYWdlcmR1dHknKSwgZmFsc2UpLFxuXHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdMYXVuY2hEYXJrbHknLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zL2xhdW5jaGRhcmtseScpLCB0cnVlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignQ2lyY2xlQ0knLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zL2NpcmNsZWNpJyksIHRydWUpLFxuXHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdWZXJjZWwnLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zL3ZlcmNlbCcpLCBmYWxzZSksXG5cdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ1N1cGFiYXNlJywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9zdXBhYmFzZScpLCB0cnVlKSxcbl07XG5cbmZ1bmN0aW9uIG1ha2VNYXJrZXRwbGFjZVBsdWdpbihuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHJlcG86IHN0cmluZyk6IElNYXJrZXRwbGFjZVBsdWdpbiB7XG5cdHJldHVybiB7XG5cdFx0bmFtZSxcblx0XHRkZXNjcmlwdGlvbixcblx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdHNvdXJjZTogcmVwbyxcblx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiBgZXhhbXBsZS8ke3JlcG99YCB9LFxuXHRcdG1hcmtldHBsYWNlOiAnY29waWxvdCcsXG5cdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHsgcmF3VmFsdWU6IGBleGFtcGxlLyR7cmVwb31gLCBkaXNwbGF5TGFiZWw6IHJlcG8sIGNsb25lVXJsOiBgaHR0cHM6Ly9naXRodWIuY29tL2V4YW1wbGUvJHtyZXBvfS5naXRgLCBjYW5vbmljYWxJZDogYGdpdGh1YjpleGFtcGxlLyR7cmVwb31gLCBjYWNoZVNlZ21lbnRzOiBbJ2V4YW1wbGUnLCByZXBvXSwga2luZDogTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCB9LFxuXHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLkNvcGlsb3QsXG5cdH07XG59XG5cbmNvbnN0IG1hcmtldHBsYWNlUGx1Z2luczogSU1hcmtldHBsYWNlUGx1Z2luW10gPSBbXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignTGluZWFyJywgJ0lzc3VlIHRyYWNraW5nIGFuZCBwcm9qZWN0IG1hbmFnZW1lbnQgaW50ZWdyYXRpb24nLCAnbGluZWFyLXBsdWdpbicpLFxuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ1NlbnRyeScsICdFcnJvciBtb25pdG9yaW5nIGFuZCBwZXJmb3JtYW5jZSB0cmFjaW5nJywgJ3NlbnRyeS1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdEYXRhZG9nJywgJ09ic2VydmFiaWxpdHkgYW5kIG1vbml0b3JpbmcgZGFzaGJvYXJkcycsICdkYXRhZG9nLXBsdWdpbicpLFxuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ05vdGlvbicsICdLbm93bGVkZ2UgYmFzZSBhbmQgZG9jdW1lbnRhdGlvbiBtYW5hZ2VtZW50JywgJ25vdGlvbi1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdGaWdtYScsICdEZXNpZ24gc3lzdGVtIGluc3BlY3Rpb24gYW5kIGFzc2V0IGV4cG9ydCcsICdmaWdtYS1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdTdHJpcGUnLCAnUGF5bWVudCBwcm9jZXNzaW5nIGFuZCBiaWxsaW5nIG1hbmFnZW1lbnQnLCAnc3RyaXBlLXBsdWdpbicpLFxuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ1R3aWxpbycsICdDb21tdW5pY2F0aW9uIEFQSXMgZm9yIFNNUyBhbmQgdm9pY2UnLCAndHdpbGlvLXBsdWdpbicpLFxuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ0F1dGgwJywgJ0lkZW50aXR5IGFuZCBhY2Nlc3MgbWFuYWdlbWVudCcsICdhdXRoMC1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdBbGdvbGlhJywgJ1NlYXJjaCBhbmQgZGlzY292ZXJ5IEFQSSBpbnRlZ3JhdGlvbicsICdhbGdvbGlhLXBsdWdpbicpLFxuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ0xhdW5jaERhcmtseScsICdGZWF0dXJlIGZsYWcgbWFuYWdlbWVudCBhbmQgZXhwZXJpbWVudGF0aW9uJywgJ2xhdW5jaGRhcmtseS1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdQbGFuZXRTY2FsZScsICdTZXJ2ZXJsZXNzIE15U1FMIGRhdGFiYXNlIG1hbmFnZW1lbnQnLCAncGxhbmV0c2NhbGUtcGx1Z2luJyksXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignVmVyY2VsJywgJ0RlcGxveW1lbnQgYW5kIHByZXZpZXcgZW52aXJvbm1lbnRzJywgJ3ZlcmNlbC1wbHVnaW4nKSxcbl07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlclBsdWdpbkJyb3dzZU1vZGUoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB3aWR0aCA9IDY1MDtcblx0Y29uc3QgaGVpZ2h0ID0gNTAwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Ly8gU29tZSBtYXJrZXRwbGFjZSBwbHVnaW5zIG1hdGNoIGluc3RhbGxlZCBwbHVnaW5zIGJ5IFVSSSBzbyB0aGUgcmVuZGVyZXJcblx0Ly8gc2hvd3MgdGhlbSBhcyBcIkluc3RhbGxlZFwiIChleGVyY2lzZXMgdGhlIGluc3RhbGxlZC1zdGF0ZSBjaGVjayBmcm9tICM3Mzc5KS5cblx0Y29uc3QgYnJvd3NlSW5zdGFsbGVkUGx1Z2lucyA9IFtcblx0XHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdMaW5lYXInLCBVUkkuZmlsZSgnL2hvbWUvZGV2Ly52c2NvZGUvYWdlbnQtcGx1Z2lucy9leGFtcGxlL2xpbmVhci1wbHVnaW4nKSwgdHJ1ZSksXG5cdFx0bWFrZUluc3RhbGxlZFBsdWdpbignU2VudHJ5JywgVVJJLmZpbGUoJy9ob21lL2Rldi8udnNjb2RlL2FnZW50LXBsdWdpbnMvZXhhbXBsZS9zZW50cnktcGx1Z2luJyksIHRydWUpLFxuXHRcdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ0RhdGFkb2cnLCBVUkkuZmlsZSgnL2hvbWUvZGV2Ly52c2NvZGUvYWdlbnQtcGx1Z2lucy9leGFtcGxlL2RhdGFkb2ctcGx1Z2luJyksIGZhbHNlKSxcblx0XTtcblxuXHQvLyBNYXAgcGx1Z2luIHNvdXJjZSBkZXNjcmlwdG9ycyB0byBpbnN0YWxsIFVSSXMsIG1hdGNoaW5nIGluc3RhbGxlZCBVUklzIGFib3ZlXG5cdGNvbnN0IHBsdWdpbkluc3RhbGxVcmlzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oW1xuXHRcdFsnZXhhbXBsZS9saW5lYXItcGx1Z2luJywgVVJJLmZpbGUoJy9ob21lL2Rldi8udnNjb2RlL2FnZW50LXBsdWdpbnMvZXhhbXBsZS9saW5lYXItcGx1Z2luJyldLFxuXHRcdFsnZXhhbXBsZS9zZW50cnktcGx1Z2luJywgVVJJLmZpbGUoJy9ob21lL2Rldi8udnNjb2RlL2FnZW50LXBsdWdpbnMvZXhhbXBsZS9zZW50cnktcGx1Z2luJyldLFxuXHRcdFsnZXhhbXBsZS9kYXRhZG9nLXBsdWdpbicsIFVSSS5maWxlKCcvaG9tZS9kZXYvLnZzY29kZS9hZ2VudC1wbHVnaW5zL2V4YW1wbGUvZGF0YWRvZy1wbHVnaW4nKV0sXG5cdF0pO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoY3R4LmRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlPFVSST4oJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlSGFybmVzcyA9IGRlcml2ZWQocmVhZGVyID0+IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlRGVzY3JpcHRvcigpIHsgcmV0dXJuIGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRQbHVnaW5TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFBsdWdpblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBwbHVnaW5zID0gY29uc3RPYnNlcnZhYmxlKGJyb3dzZUluc3RhbGxlZFBsdWdpbnMgYXMgcmVhZG9ubHkgSUFnZW50UGx1Z2luW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBlbmFibGVtZW50TW9kZWwgPSB1bmRlZmluZWQhO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnN0YWxsZWRQbHVnaW5zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VNYXJrZXRwbGFjZXMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBmZXRjaE1hcmtldHBsYWNlUGx1Z2lucygpIHsgcmV0dXJuIG1hcmtldHBsYWNlUGx1Z2luczsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUGx1Z2luSW5zdGFsbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBsdWdpbkluc3RhbGxTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbikge1xuXHRcdFx0XHRcdGNvbnN0IHJlcG8gPSBwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiA/IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLnJlcG8gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcG8gPyAocGx1Z2luSW5zdGFsbFVyaXMuZ2V0KHJlcG8pID8/IFVSSS5maWxlKCcvZGV2L251bGwnKSkgOiBVUkkuZmlsZSgnL2Rldi9udWxsJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIGNyZWF0ZU1vY2tBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHdpZGdldCA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbkxpc3RXaWRnZXQpXG5cdCk7XG5cdGN0eC5jb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmVsZW1lbnQpO1xuXHR3aWRnZXQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXG5cdC8vIENsaWNrIHRoZSBCcm93c2UgTWFya2V0cGxhY2UgYnV0dG9uIHRvIGVudGVyIGJyb3dzZSBtb2RlXG5cdGNvbnN0IGJyb3dzZUJ1dHRvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5saXN0LWFkZC1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0YnJvd3NlQnV0dG9uPy5jbGljaygpO1xuXG5cdC8vIFdhaXQgZm9yIHRoZSBtYXJrZXRwbGFjZSBxdWVyeSB0byByZXNvbHZlLCB0aGVuIHdhaXQgZm9yIHNjcm9sbGJhciBmYWRlIHRyYW5zaXRpb25cblx0Ly8gKHZpc2libGUgXHUyMTkyIGludmlzaWJsZSB0YWtlcyB+MnMgYWZ0ZXIgcHJvZ3JhbW1hdGljIHNjcm9sbC9saXN0IHBvcHVsYXRlKVxuXHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cdC8vIEJsdXIgdGhlIHNlYXJjaCBpbnB1dCB0byBwcmV2ZW50IGN1cnNvciBibGluayBpbnN0YWJpbGl0eSBpbiBzY3JlZW5zaG90c1xuXHQod2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQnKSBhcyBIVE1MRWxlbWVudCk/LmJsdXIoKTtcblx0Ly8gRm9yY2UtaGlkZSBzY3JvbGxiYXJzIHRvIGF2b2lkIGZhZGUtdHJhbnNpdGlvbiBpbnN0YWJpbGl0eVxuXHRmb3IgKGNvbnN0IHNjcm9sbGJhciBvZiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnNjcm9sbGJhcicpKSB7XG5cdFx0c2Nyb2xsYmFyLnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0fVxuXHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMjAwKSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1DUCAvIFBsdWdpbiBEaXNhYmxlZCAoYWNjZXNzIGJsb2NrZWQpIHNwbGFzaFxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBjcmVhdGVEaXNhYmxlZENvbmZpZ1NlcnZpY2Uoa2V5OiBzdHJpbmcsIGRpc2FibGVkVmFsdWU6IHVua25vd24sIGJ5UG9saWN5OiBib29sZWFuKTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFZhbHVlPFQ+KGFyZzE/OiBzdHJpbmcgfCBvYmplY3QsIF9hcmcyPzogb2JqZWN0KTogVCB7XG5cdFx0XHRjb25zdCBrID0gdHlwZW9mIGFyZzEgPT09ICdzdHJpbmcnID8gYXJnMSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiAoayA9PT0ga2V5ID8gZGlzYWJsZWRWYWx1ZSA6IHVuZGVmaW5lZCkgYXMgVDtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrOiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+IHtcblx0XHRcdGlmIChrICE9PSBrZXkpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IHVuZGVmaW5lZCwgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZhbHVlOiBkaXNhYmxlZFZhbHVlIGFzIFQsXG5cdFx0XHRcdGRlZmF1bHRWYWx1ZTogZGlzYWJsZWRWYWx1ZSBhcyBULFxuXHRcdFx0XHRwb2xpY3lWYWx1ZTogYnlQb2xpY3kgPyAoZGlzYWJsZWRWYWx1ZSBhcyBUKSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlck1jcERpc2FibGVkKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGJ5UG9saWN5OiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IHdpZHRoID0gNjUwO1xuXHRjb25zdCBoZWlnaHQgPSA1MDA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGN0eC5kaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lKElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDb25maWd1cmF0aW9uU2VydmljZSwgY3JlYXRlRGlzYWJsZWRDb25maWdTZXJ2aWNlKG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUuTm9uZSwgYnlQb2xpY3kpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTWNwV29ya2JlbmNoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWNwV29ya2JlbmNoU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25SZXNldCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxvY2FsOiBJV29ya2JlbmNoTWNwU2VydmVyW10gPSBbXTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXJ2ZXJzID0gY29uc3RPYnNlcnZhYmxlKFtdIGFzIG5ldmVyW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTWNwUmVnaXN0cnksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFJlZ2lzdHJ5PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY29sbGVjdGlvbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkZWxlZ2F0ZXMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUlucHV0cyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudFBsdWdpblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50UGx1Z2luU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHBsdWdpbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGlhbG9nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc1Nlc3Npb25zV2luZG93ID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdlbGNvbWVQYWdlRmVhdHVyZXMgPSB7IHNob3dHZXR0aW5nU3RhcnRlZEJhbm5lcjogdHJ1ZSB9O1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVQcm9qZWN0Um9vdCA9IG9ic2VydmFibGVWYWx1ZSgncm9vdCcsIFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBoYXNPdmVycmlkZVByb2plY3RSb290ID0gb2JzZXJ2YWJsZVZhbHVlKCdoYXNPdmVycmlkZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSB7IHJldHVybiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkk+KCdhY3RpdmVTZXNzaW9uUmVzb3VyY2UnLCBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFjdGl2ZURlc2NyaXB0b3IoKSB7IHJldHVybiBjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBjcmVhdGVNb2NrQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU91dHB1dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU91dHB1dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBzaG93Q2hhbm5lbCgpIHsgfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB3aWRnZXQgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BMaXN0V2lkZ2V0KSk7XG5cdGN0eC5jb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmVsZW1lbnQpO1xuXHR3aWRnZXQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQbHVnaW5EaXNhYmxlZChjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBieVBvbGljeTogYm9vbGVhbik6IHZvaWQge1xuXHRjb25zdCB3aWR0aCA9IDY1MDtcblx0Y29uc3QgaGVpZ2h0ID0gNTAwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhjdHguZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZShJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNyZWF0ZURpc2FibGVkQ29uZmlnU2VydmljZShDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZCwgZmFsc2UsIGJ5UG9saWN5KSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlPFVSST4oJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlSGFybmVzcyA9IGRlcml2ZWQocmVhZGVyID0+IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlRGVzY3JpcHRvcigpIHsgcmV0dXJuIGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRQbHVnaW5TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFBsdWdpblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBwbHVnaW5zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZW5hYmxlbWVudE1vZGVsID0gdW5kZWZpbmVkITtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5zdGFsbGVkUGx1Z2lucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFya2V0cGxhY2VzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUGx1Z2luSW5zdGFsbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBsdWdpbkluc3RhbGxTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCwgY3JlYXRlTW9ja0FJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwoKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3Qgd2lkZ2V0ID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luTGlzdFdpZGdldCkpO1xuXHRjdHguY29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0d2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRW1iZWRkZWQgY29tcGFjdCBkZXRhaWwgd2lkZ2V0cyBcdTIwMTQgc3RhbmRhbG9uZSAobm8gaG9zdCBlZGl0b3IpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlckVtYmVkZGVkTWNwRGV0YWlsKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRjb25zdCB3aWR0aCA9IDQ4MDtcblx0Y29uc3QgaGVpZ2h0ID0gMzIwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhjdHguZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNY3BXb3JrYmVuY2hTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BXb3JrYmVuY2hTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25DaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvblJlc2V0ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbG9jYWw6IElXb3JrYmVuY2hNY3BTZXJ2ZXJbXSA9IHNlcnZlciA/IFtzZXJ2ZXJdIDogW107XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW4oKSB7IC8qIG5vLW9wIGluIGZpeHR1cmUgKi8gfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHQvLyBNaXJyb3IgdGhlIGhvc3QgZWRpdG9yJ3MgY2xhc3Mgc28gdGhlIHNjb3BlZCBDU1Mgc2VsZWN0b3JzIGFwcGx5LlxuXHRjb25zdCBob3N0ID0gRE9NLmFwcGVuZChjdHguY29udGFpbmVyLCBET00uJCgnLmFpLWN1c3RvbWl6YXRpb24tbWFuYWdlbWVudC1lZGl0b3InKSk7XG5cdGhvc3Quc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRob3N0LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRob3N0LnN0eWxlLm92ZXJmbG93ID0gJ2F1dG8nO1xuXG5cdGNvbnN0IGRldGFpbCA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtYmVkZGVkTWNwU2VydmVyRGV0YWlsLCBob3N0KSk7XG5cdGlmIChzZXJ2ZXIpIHtcblx0XHRkZXRhaWwuc2V0SW5wdXQoc2VydmVyKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW5kZXJFbWJlZGRlZFBsdWdpbkRldGFpbChjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBpdGVtOiBJQWdlbnRQbHVnaW5JdGVtIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdGNvbnN0IHdpZHRoID0gNDgwO1xuXHRjb25zdCBoZWlnaHQgPSAzMjA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGN0eC5kaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3QgaG9zdCA9IERPTS5hcHBlbmQoY3R4LmNvbnRhaW5lciwgRE9NLiQoJy5haS1jdXN0b21pemF0aW9uLW1hbmFnZW1lbnQtZWRpdG9yJykpO1xuXHRob3N0LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0aG9zdC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0aG9zdC5zdHlsZS5vdmVyZmxvdyA9ICdhdXRvJztcblxuXHRjb25zdCBkZXRhaWwgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbWJlZGRlZEFnZW50UGx1Z2luRGV0YWlsLCBob3N0KSk7XG5cdGlmIChpdGVtKSB7XG5cdFx0ZGV0YWlsLnNldElucHV0KGl0ZW0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VJbnN0YWxsZWRQbHVnaW5JdGVtKG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IElBZ2VudFBsdWdpbkl0ZW0ge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuSW5zdGFsbGVkLFxuXHRcdG5hbWUsXG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0bWFya2V0cGxhY2U6ICdHaXRIdWInLFxuXHRcdHBsdWdpbjogbWFrZUluc3RhbGxlZFBsdWdpbihuYW1lLCBVUkkuZmlsZShgL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zLyR7bmFtZS50b0xvd2VyQ2FzZSgpfWApLCB0cnVlKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZU1hcmtldHBsYWNlUGx1Z2luSXRlbShuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBJQWdlbnRQbHVnaW5JdGVtIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLk1hcmtldHBsYWNlLFxuXHRcdG5hbWUsXG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0c291cmNlOiAnR2l0SHViJyxcblx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiBgYWNtZS8ke25hbWUudG9Mb3dlckNhc2UoKX1gIH0sXG5cdFx0bWFya2V0cGxhY2U6ICdHaXRIdWInLFxuXHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLkNvcGlsb3QsXG5cdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHtcblx0XHRcdHJhd1ZhbHVlOiBgYWNtZS8ke25hbWUudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0ZGlzcGxheUxhYmVsOiBgYWNtZS8ke25hbWUudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0Y2xvbmVVcmw6IGBodHRwczovL2dpdGh1Yi5jb20vYWNtZS8ke25hbWUudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0Y2Fub25pY2FsSWQ6IGBnaXRodWI6YWNtZS8ke25hbWUudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0Y2FjaGVTZWdtZW50czogWydnaXRodWInLCAnYWNtZScsIG5hbWUudG9Mb3dlckNhc2UoKV0sXG5cdFx0XHRraW5kOiBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0SHViU2hvcnRoYW5kLFxuXHRcdFx0Z2l0aHViUmVwbzogYGFjbWUvJHtuYW1lLnRvTG93ZXJDYXNlKCl9YCxcblx0XHR9LFxuXHR9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaXh0dXJlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jb25zdCBsb2NhbFNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpO1xuY29uc3QgYWdlbnRIb3N0Q29waWxvdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgcGF0aDogJy9maXh0dXJlLXNlc3Npb24nIH0pO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnY2hhdC9haUN1c3RvbWl6YXRpb25zLycgfSwge1xuXG5cblxuXHQvLyBXZWxjb21lIHBhZ2UgXHUyMDE0IGRlZmF1bHQgc3RhdGUgd2l0aCBubyBzZWN0aW9uIHNlbGVjdGVkXG5cdFdlbGNvbWVQYWdlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwgeyBzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlIH0pLFxuXHR9KSxcblxuXHQvLyBGdWxsIGVkaXRvciB3aXRoIExvY2FsIChWUyBDb2RlKSBoYXJuZXNzIFx1MjAxNCBhbGwgc2VjdGlvbnMgdmlzaWJsZSwgaGFybmVzcyBkcm9wZG93bixcblx0Ly8gR2VuZXJhdGUgYnV0dG9ucywgQUdFTlRTLm1kIHNob3J0Y3V0LCBhbGwgc3RvcmFnZSBncm91cHNcblx0TG9jYWxIYXJuZXNzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwgeyBzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLCBzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyB9KSxcblx0fSksXG5cblx0Ly8gQWdlbnQtaG9zdCB3ZWxjb21lIHBhZ2UgdmFyaWFudCB0aGF0IGhpZ2hsaWdodHMgbG9jYWwgcHJvbXB0IGZpbGVzIHdoaWNoXG5cdC8vIG5lZWQgdG8gYmUgbWlncmF0ZWQgYmVjYXVzZSB0aGUgYWN0aXZlIGhhcm5lc3Mgb25seSBjb25zdW1lcyBza2lsbHMuXG5cdEFnZW50SG9zdFByb21wdE1pZ3JhdGlvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JywgYmxvY2tzQ2k6IHRydWUgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGFnZW50SG9zdENvcGlsb3RTZXNzaW9uUmVzb3VyY2UsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIFNlc3Npb25zLXdpbmRvdyB2YXJpYW50IG9mIHRoZSBmdWxsIGVkaXRvciB3aXRoIHdvcmtzcGFjZSBvdmVycmlkZSBVWFxuXHQvLyBhbmQgc2Vzc2lvbnMgc2VjdGlvbiBvcmRlcmluZy5cblx0U2Vzc2lvbnM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLFxuXHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzOiBbXG5cdFx0XHRcdGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCksXG5cdFx0XHRdLFxuXHRcdFx0bWFuYWdlbWVudFNlY3Rpb25zOiBbXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdFx0XSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gU2Vzc2lvbnMgU2tpbGxzIHRhYiBzaG93aW5nIFVJIEludGVncmF0aW9uIGJhZGdlcyBvbiBidWlsdC1pbiBza2lsbHNcblx0U2Vzc2lvbnNTa2lsbHNUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLFxuXHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzOiBbXG5cdFx0XHRcdGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCksXG5cdFx0XHRdLFxuXHRcdFx0bWFuYWdlbWVudFNlY3Rpb25zOiBbXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdFx0XSxcblx0XHRcdHNraWxsVUlJbnRlZ3JhdGlvbnM6IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2FjdC1vbi1mZWVkYmFjaycsICdVc2VkIGJ5IHRoZSBTdWJtaXQgRmVlZGJhY2sgYnV0dG9uIGluIHRoZSBDaGFuZ2VzIHRvb2xiYXInXSxcblx0XHRcdFx0WydnZW5lcmF0ZS1ydW4tY29tbWFuZHMnLCAnVXNlZCBieSB0aGUgUnVuIGJ1dHRvbiBpbiB0aGUgdGl0bGUgYmFyJ10sXG5cdFx0XHRdKSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTUNQIFNlcnZlcnMgdGFiIHdpdGggbWFueSBzZXJ2ZXJzIHRvIHZlcmlmeSBzY3JvbGxhYmxlIGxpc3QgbGF5b3V0XG5cdE1jcFNlcnZlcnNUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRNY3BTZXJ2ZXJzVGFiQWN0aXZlU2Vzc2lvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRpc1Nlc3Npb25zV2luZG93OiB0cnVlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0YWN0aXZlU2Vzc2lvbk1jcFNlcnZlcnMsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIEFnZW50cyB0YWIgXHUyMDE0IHdvcmtzcGFjZSBhbmQgdXNlciBhZ2VudHMsIHNjcm9sbGFibGVcblx0QWdlbnRzVGFiOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBTa2lsbHMgdGFiIFx1MjAxNCB3b3Jrc3BhY2UgYW5kIHVzZXIgc2tpbGxzLCBzY3JvbGxhYmxlXG5cdFNraWxsc1RhYjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSW5zdHJ1Y3Rpb25zIHRhYiBcdTIwMTQgbWFueSBpbnN0cnVjdGlvbnMgd2l0aCBhcHBseVRvIHBhdHRlcm5zLCBzY3JvbGxhYmxlXG5cdEluc3RydWN0aW9uc1RhYjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSG9va3MgdGFiIFx1MjAxNCB3b3Jrc3BhY2UgYW5kIHVzZXIgaG9va3MsIHNjcm9sbGFibGVcblx0SG9va3NUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gUHJvbXB0cyB0YWIgXHUyMDE0IHdvcmtzcGFjZSBhbmQgdXNlciBwcm9tcHRzLCBzY3JvbGxhYmxlXG5cdFByb21wdHNUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRQcm9tcHRNaWdyYXRpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGFnZW50SG9zdENvcGlsb3RTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRtaWdyYXRpb25DYXRlZ29yeTogQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQuUHJvbXB0RmlsZXMsXG5cdFx0fSksXG5cdH0pLFxuXG5cdFVzZXJEYXRhTWlncmF0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnLCBibG9ja3NDaTogdHJ1ZSB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogYWdlbnRIb3N0Q29waWxvdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdG1pZ3JhdGlvbkNhdGVnb3J5OiBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Vc2VyRGF0YSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gUGx1Z2lucyB0YWJcblx0UGx1Z2luc1RhYjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIE1DUCBicm93c2UvbWFya2V0cGxhY2UgbW9kZSBcdTIwMTQgc3RhbmRhbG9uZSB3aWRnZXQgd2l0aCBnYWxsZXJ5IHJlc3VsdHMsIHNjcm9sbGFibGVcblx0Ly8gVmVyaWZpZXMgZml4IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzA0MTM5XG5cdE1jcEJyb3dzZU1vZGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlck1jcEJyb3dzZU1vZGUsXG5cdH0pLFxuXG5cdC8vIFBsdWdpbiBicm93c2UvbWFya2V0cGxhY2UgbW9kZSBcdTIwMTQgc3RhbmRhbG9uZSB3aWRnZXQgd2l0aCBtYXJrZXRwbGFjZSByZXN1bHRzLCBzY3JvbGxhYmxlXG5cdFBsdWdpbkJyb3dzZU1vZGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlclBsdWdpbkJyb3dzZU1vZGUsXG5cdH0pLFxuXG5cdC8vIE1DUCBkaXNhYmxlZCBzcGxhc2ggXHUyMDE0IGNoYXQubWNwLmFjY2VzcyBzZXQgdG8gJ25vbmUnIGJ5IHVzZXJcblx0TWNwRGlzYWJsZWRCeVVzZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJNY3BEaXNhYmxlZChjdHgsIGZhbHNlKSxcblx0fSksXG5cblx0Ly8gTUNQIGRpc2FibGVkIHNwbGFzaCBcdTIwMTQgY2hhdC5tY3AuYWNjZXNzIGxvY2tlZCB0byAnbm9uZScgYnkgZW50ZXJwcmlzZSBwb2xpY3lcblx0TWNwRGlzYWJsZWRCeVBvbGljeTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlck1jcERpc2FibGVkKGN0eCwgdHJ1ZSksXG5cdH0pLFxuXG5cdC8vIFBsdWdpbnMgZGlzYWJsZWQgc3BsYXNoIFx1MjAxNCBjaGF0LnBsdWdpbnMuZW5hYmxlZD1mYWxzZSBieSB1c2VyXG5cdFBsdWdpbnNEaXNhYmxlZEJ5VXNlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlclBsdWdpbkRpc2FibGVkKGN0eCwgZmFsc2UpLFxuXHR9KSxcblxuXHQvLyBQbHVnaW5zIGRpc2FibGVkIHNwbGFzaCBcdTIwMTQgY2hhdC5wbHVnaW5zLmVuYWJsZWQgbG9ja2VkIHRvIGZhbHNlIGJ5IGVudGVycHJpc2UgcG9saWN5XG5cdFBsdWdpbnNEaXNhYmxlZEJ5UG9saWN5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyUGx1Z2luRGlzYWJsZWQoY3R4LCB0cnVlKSxcblx0fSksXG5cblx0Ly8gU2Nyb2xsZWQtdG8tYm90dG9tIHZhcmlhbnRzIFx1MjAxNCB2ZXJpZnkgbGFzdCBpdGVtcyBhcmUgZnVsbHkgdmlzaWJsZSBhYm92ZSBmb290ZXJcblx0UHJvbXB0c1RhYlNjcm9sbGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0cyxcblx0XHRcdHNjcm9sbFRvQm90dG9tOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRNY3BTZXJ2ZXJzVGFiU2Nyb2xsZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0c2Nyb2xsVG9Cb3R0b206IHRydWUsXG5cdFx0fSksXG5cdH0pLFxuXG5cdFBsdWdpbnNUYWJTY3JvbGxlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsXG5cdFx0XHRzY3JvbGxUb0JvdHRvbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTmFycm93IHZpZXdwb3J0IFx1MjAxNCBjYXRjaGVzIGJhZGdlIGNsaXBwaW5nIGFuZCBsYXlvdXQgb3ZlcmZsb3cgYXQgc21hbGwgc2l6ZXNcblx0TWNwU2VydmVyc1RhYk5hcnJvdzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0XHR3aWR0aDogNTUwLFxuXHRcdFx0aGVpZ2h0OiA0MDAsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEFnZW50c1RhYk5hcnJvdzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdHdpZHRoOiA1NTAsXG5cdFx0XHRoZWlnaHQ6IDQwMCxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSXRlbS1wcmV2aWV3IHZpZXcgKGFmdGVyIGNsaWNraW5nIGFuIGFnZW50KSBcdTIwMTQgdmVyaWZpZXMgdGhlIHN0cnVjdHVyZWQgZnJvbnRcblx0Ly8gbWF0dGVyIHByZXZpZXcgYW5kIHJlbmRlcmVkIG1hcmtkb3duIGJvZHkuXG5cdEFnZW50c0l0ZW1QcmV2aWV3OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLFxuXHRcdFx0b3BlbkZpcnN0SXRlbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gUmF3IG1hcmtkb3duIGVkaXRvciB2aWV3IHJlYWNoZWQgZnJvbSB0aGUgc3RydWN0dXJlZCBwcmV2aWV3J3MgRWRpdCBhY3Rpb24uXG5cdEFnZW50c0l0ZW1SYXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0ZWRpdG9yRGlzcGxheU1vZGU6ICdyYXcnLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBCdWlsdC1pbiBza2lsbCBwcmV2aWV3IHZpZXcgXHUyMDE0IHZlcmlmaWVzIHRoYXQgYnVpbHQtaW4gc2tpbGxzIG9wZW4gaW4gdGhlXG5cdC8vIHN0cnVjdHVyZWQgcHJldmlldyB3aGlsZSBzdGlsbCBvZmZlcmluZyBhbiBlZGl0YWJsZSByYXcgb3ZlcnJpZGUgcGF0aC5cblx0QnVpbHRpblNraWxsSXRlbVByZXZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0b3Blbkl0ZW1MYWJlbDogJ2FjdC1vbi1mZWVkYmFjaycsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIEJ1aWx0LWluIHNraWxsIHJhdyB2aWV3IHJlYWNoZWQgZnJvbSB0aGUgc3RydWN0dXJlZCBwcmV2aWV3J3MgRWRpdCBhY3Rpb24uXG5cdEJ1aWx0aW5Ta2lsbEl0ZW1SYXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0b3Blbkl0ZW1MYWJlbDogJ2FjdC1vbi1mZWVkYmFjaycsXG5cdFx0XHRlZGl0b3JEaXNwbGF5TW9kZTogJ3JhdycsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIE1DUCBzZXJ2ZXIgZGV0YWlsIHZpZXcgXHUyMDE0IHNhbWUgYWxpZ25tZW50IGNoZWNrIGZvciB0aGUgZGV0YWlsIGJhY2sgYnV0dG9uLlxuXHRNY3BTZXJ2ZXJEZXRhaWw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0b3BlbkZpcnN0SXRlbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTUNQIHNlcnZlciBkZXRhaWwgdmlldyBpbiBhIG5hcnJvdyB2aWV3cG9ydCBcdTIwMTQgY2F0Y2hlcyBlbWJlZGRlZCBoZWFkZXIgb3ZlcmZsb3dcblx0Ly8gYW5kIHRoZSBzaW5nbGUtdGFiIGNvbmZpZ3VyYXRpb24gbGF5b3V0IHVzZWQgYnkgbG9jYWwgd29ya3NwYWNlIHNlcnZlcnMuXG5cdE1jcFNlcnZlckRldGFpbE5hcnJvdzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0d2lkdGg6IDU1MCxcblx0XHRcdGhlaWdodDogNDAwLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBQbHVnaW4gZGV0YWlsIHZpZXcgXHUyMDE0IHNhbWUgYWxpZ25tZW50IGNoZWNrIGZvciB0aGUgZGV0YWlsIGJhY2sgYnV0dG9uLlxuXHRQbHVnaW5EZXRhaWw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdFx0b3BlbkZpcnN0SXRlbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0UGx1Z2luRGV0YWlsTmFycm93OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRcdG9wZW5GaXJzdEl0ZW06IHRydWUsXG5cdFx0XHR3aWR0aDogNTUwLFxuXHRcdFx0aGVpZ2h0OiA0MDAsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgTUNQIGRldGFpbCB3aWRnZXQgKGNvbXBhY3Qgc3BsaXQtcGFuZSBjb21wb25lbnQpLlxuXHQvLyBXb3Jrc3BhY2Utc2NvcGUgc2VydmVyIHdpdGggYSBkZXNjcmlwdGlvbi5cblx0RW1iZWRkZWRNY3BEZXRhaWxXb3Jrc3BhY2U6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHgsIG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXBvc3RncmVzJywgJ1Bvc3RncmVTUUwnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0RhdGFiYXNlIGFjY2VzcyBmb3IgdGhlIGFjdGl2ZSB3b3Jrc3BhY2UnKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgTUNQIGRldGFpbCB3aWRnZXQgXHUyMDE0IHVzZXItc2NvcGUgc2VydmVyLlxuXHRFbWJlZGRlZE1jcERldGFpbFVzZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHgsIG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXdlYi1zZWFyY2gnLCAnV2ViIFNlYXJjaCcsIExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciwgJ1NlYXJjaCB0aGUgd2ViIGZyb20gYW55IHNlc3Npb24nKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgTUNQIGRldGFpbCB3aWRnZXQgXHUyMDE0IGVtcHR5IC8gbm8gaW5wdXQgc3RhdGUuXG5cdEVtYmVkZGVkTWNwRGV0YWlsRW1wdHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHgsIHVuZGVmaW5lZCksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgcGx1Z2luIGRldGFpbCB3aWRnZXQgXHUyMDE0IGluc3RhbGxlZCBwbHVnaW4uXG5cdEVtYmVkZGVkUGx1Z2luRGV0YWlsSW5zdGFsbGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRW1iZWRkZWRQbHVnaW5EZXRhaWwoY3R4LCBtYWtlSW5zdGFsbGVkUGx1Z2luSXRlbSgnTGluZWFyJywgJ0lzc3VlIHRyYWNraW5nIGFuZCBwcm9qZWN0IG1hbmFnZW1lbnQgaW50ZWdyYXRpb24nKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgcGx1Z2luIGRldGFpbCB3aWRnZXQgXHUyMDE0IG1hcmtldHBsYWNlIHBsdWdpbi5cblx0RW1iZWRkZWRQbHVnaW5EZXRhaWxNYXJrZXRwbGFjZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVtYmVkZGVkUGx1Z2luRGV0YWlsKGN0eCwgbWFrZU1hcmtldHBsYWNlUGx1Z2luSXRlbSgnU2VudHJ5JywgJ0Vycm9yIG1vbml0b3JpbmcgYW5kIHBlcmZvcm1hbmNlIHRyYWNpbmcnKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgcGx1Z2luIGRldGFpbCB3aWRnZXQgXHUyMDE0IGVtcHR5IC8gbm8gaW5wdXQgc3RhdGUuXG5cdEVtYmVkZGVkUGx1Z2luRGV0YWlsRW1wdHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZFBsdWdpbkRldGFpbChjdHgsIHVuZGVmaW5lZCksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFHL0IsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGlCQUFpQixTQUFzQix1QkFBdUI7QUFDdkUsU0FBUyxXQUFXLGtCQUFrQjtBQUN0QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFTLHNCQUFzQjtBQUMvQixTQUF1QixvQkFBMkM7QUFDbEUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxjQUFjLG1CQUFtQjtBQUMxQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFxQiwwQkFBMEIsc0JBQXNCO0FBQ3JFLFNBQXVCLDRCQUE0QjtBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQ0FBa0Msd0NBQStEO0FBQzFHLFNBQVMsOEJBQWtHLHFDQUFxQztBQUNoSixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9CQUFvQiwyQkFBMkI7QUFDeEQsU0FBUyxpQkFBaUIsMEJBQTBCLHNCQUFtRjtBQUV2SSxTQUEyQix3QkFBd0I7QUFDbkQsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsMkJBQXlDO0FBQ2xELFNBQVMsMkJBQStDLGlCQUFpQix3QkFBd0I7QUFDakcsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyx3Q0FBd0M7QUFFakQsU0FBUywyQkFBMkIsa0NBQXFEO0FBQ3pGLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTZDO0FBQ3RELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMsNkJBQWtEO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCLHNCQUFzQjtBQUNoRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUEyQyxhQUFhLG9CQUFvQiw2QkFBNkI7QUFDbEgsU0FBUyxvQkFBb0I7QUFDN0IsU0FBbUMsMkJBQTJCO0FBQzlELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsdUJBQXVCLHVCQUF1QjtBQUV2RCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFrQyxzQkFBc0Isd0JBQXdCLDBCQUEwQixpQ0FBaUM7QUFDM0ksU0FBUyxpQkFBaUI7QUFHMUIsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBTVAsTUFBTSxXQUFXLElBQUksS0FBSyxXQUFXO0FBQ3JDLE1BQU0sa0JBQWtCO0FBY3hCLFNBQVMsd0JBQXNDO0FBQzlDLFNBQU8sSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxJQUFuQztBQUFBO0FBQ1YsV0FBUyxXQUFXLFdBQVc7QUFBQTtBQUFBLEVBQ2hDLEVBQUU7QUFDSDtBQUVBLFNBQVMsc0NBQWtFO0FBQzFFLFFBQU0sYUFBYSxJQUFJLGNBQWMsS0FBaUMsRUFBRTtBQUFBLElBQWpEO0FBQUE7QUFDdEIsV0FBa0Isa0JBQWtCLG9CQUFvQixpQkFBaUI7QUFDekUsV0FBa0Isa0NBQWtDLE1BQU07QUFBQTtBQUFBLElBQzFELE1BQWUscUJBQXFCO0FBQUUsYUFBTyxDQUFDO0FBQUEsSUFBRztBQUFBLElBQ2pELE1BQWUsMEJBQTBCLGFBQTBCO0FBQUUsYUFBTyxDQUFDO0FBQUEsSUFBRztBQUFBLElBQ2hGLE1BQWUsbUJBQW1CLGFBQTBCO0FBQUUsYUFBTyxDQUFDO0FBQUEsSUFBRztBQUFBLEVBQzFFLEVBQUU7QUFFRixTQUFPLElBQUksY0FBYyxLQUFpQyxFQUFFO0FBQUEsSUFDbEQsU0FBUyxVQUErRTtBQUFFLGFBQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUFBLElBQUc7QUFBQSxJQUN0SCxzQkFBc0I7QUFBRSxhQUFPO0FBQUEsSUFBWTtBQUFBLElBQzNDLFNBQVMsVUFBa0Q7QUFBRSxhQUFPLGdCQUFnQixDQUFDO0FBQUEsSUFBRztBQUFBLElBQ3hGLGlCQUFzQztBQUFFLGFBQU8sZ0JBQWdCLENBQUM7QUFBQSxJQUFHO0FBQUEsSUFDNUUsTUFBZSxrQkFBa0IsVUFBNEM7QUFBQSxJQUFFO0FBQUEsRUFDaEYsRUFBRTtBQUNIO0FBSUEsU0FBUyxtQkFBa0M7QUFDMUMsU0FBTyxRQUFRLFFBQVE7QUFDeEI7QUFFQSxTQUFTLHdDQUF3QyxhQUFtRCxDQUFDLEdBQW1DO0FBQ3ZJLFNBQU8sSUFBSSxjQUFjLEtBQXFDLEVBQUU7QUFBQSxJQUFyRDtBQUFBO0FBQ1YsV0FBa0IsMEJBQTBCLE1BQU07QUFDbEQsV0FBa0IsNEJBQTRCLE1BQU07QUFBQTtBQUFBLElBQzNDLGtCQUFrQjtBQUFFLGFBQU8sQ0FBQztBQUFBLElBQUc7QUFBQSxJQUMvQixvQkFBb0I7QUFBRSxhQUFPLENBQUM7QUFBQSxJQUFHO0FBQUEsSUFDakMsc0JBQXNCO0FBQUUsYUFBTztBQUFBLElBQVc7QUFBQSxJQUMxQyx3QkFBd0I7QUFBRSxhQUFPLENBQUM7QUFBQSxJQUFHO0FBQUEsSUFDckMsZ0JBQWdCO0FBQUUsYUFBTztBQUFBLElBQVk7QUFBQSxJQUNyQyxlQUFlO0FBQUEsSUFBRTtBQUFBLElBQzFCLE1BQWUsd0JBQXdCO0FBQUUsYUFBTztBQUFBLElBQU07QUFBQSxFQUN2RCxFQUFFO0FBQ0g7QUFNQSxTQUFTLG1DQUFtQyxPQUE0RDtBQUN2RyxTQUFPO0FBQUEsSUFDTixhQUFhLE1BQU07QUFBQSxJQUNuQixNQUFNLG1DQUFrRTtBQUN2RSxhQUFPLE1BQU0sT0FBTyxVQUFRLEtBQUssV0FBVyxpQkFBaUIsUUFBUSxFQUFFLElBQUksV0FBUztBQUFBLFFBQ25GLEtBQUssS0FBSztBQUFBLFFBQ1YsTUFBTSxLQUFLO0FBQUEsUUFDWCxNQUFNLEtBQUssUUFBUTtBQUFBLFFBQ25CLGFBQWEsS0FBSztBQUFBLFFBQ2xCLFFBQVEsS0FBSztBQUFBLFFBQ2IsYUFBYSxLQUFLO0FBQUEsUUFDbEIsV0FBVztBQUFBLE1BQ1osRUFBRTtBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLGdCQUFnQixNQUEyRjtBQUNuSCxNQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTztBQUFBLElBQ04sWUFBWSxJQUFJLG9CQUFvQixLQUFLLFdBQVc7QUFBQSxJQUNwRCxhQUFhLEtBQUs7QUFBQSxFQUNuQjtBQUNEO0FBRUEsU0FBUyx5QkFBeUIsTUFBNEI7QUFDN0QsTUFBSSxLQUFLLFNBQVMsWUFBWSxNQUFNO0FBQ25DLFdBQU8sS0FBSyxVQUFVO0FBQUEsTUFDckIsTUFBTSxLQUFLO0FBQUEsTUFDWCxhQUFhLEtBQUs7QUFBQSxNQUNsQixTQUFTO0FBQUEsSUFDVixHQUFHLE1BQU0sQ0FBQztBQUFBLEVBQ1g7QUFFQSxRQUFNLGNBQWM7QUFBQSxJQUNuQjtBQUFBLElBQ0EsZ0JBQWdCLEtBQUssVUFBVSxLQUFLLGVBQWUsR0FBRyxLQUFLLFFBQVEsZUFBZSxjQUFjLENBQUM7QUFBQSxFQUNsRztBQUVBLE1BQUksS0FBSyxTQUFTLFlBQVksZ0JBQWdCLEtBQUssU0FBUztBQUMzRCxnQkFBWSxLQUFLLFlBQVksS0FBSyxVQUFVLEtBQUssT0FBTyxDQUFDLEVBQUU7QUFBQSxFQUM1RDtBQUVBLE1BQUksS0FBSyxTQUFTLFlBQVksT0FBTztBQUNwQyxnQkFBWSxLQUFLLFFBQVE7QUFDekIsZ0JBQVksS0FBSyxlQUFlO0FBQ2hDLGdCQUFZLEtBQUssaUJBQWlCO0FBQUEsRUFDbkM7QUFFQSxNQUFJLEtBQUssU0FBUyxZQUFZLE9BQU87QUFDcEMsZ0JBQVksS0FBSyxVQUFVLEtBQUssVUFBVSxzQkFBc0IsQ0FBQyxFQUFFO0FBQUEsRUFDcEU7QUFFQSxNQUFJLEtBQUssU0FBUyxZQUFZLFFBQVE7QUFDckMsZ0JBQVksS0FBSyxrQkFBa0IsS0FBSyxVQUFVLCtCQUErQixDQUFDLEVBQUU7QUFBQSxFQUNyRjtBQUVBLGNBQVksS0FBSyxPQUFPLEVBQUU7QUFFMUIsU0FBTyxHQUFHLFlBQVksS0FBSyxJQUFJLENBQUM7QUFBQTtBQUFBLFFBQXdCLEtBQUssUUFBUSxvQkFBb0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDMUY7QUFFQSxTQUFTLDZCQUE2QixNQUFxQztBQUMxRSxTQUFPO0FBQUEsZUFBcUIsS0FBSyxVQUFVLCtCQUErQixDQUFDO0FBQUEsV0FBYyxLQUFLLFVBQVUsTUFBTSxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ2hIO0FBRUEsU0FBUyx3QkFBd0IsT0FBdUIsY0FBNEQ7QUFDbkgsUUFBTSxXQUFXLElBQUksWUFBb0I7QUFDekMsYUFBVyxRQUFRLE9BQU87QUFDekIsYUFBUyxJQUFJLEtBQUssS0FBSyx5QkFBeUIsSUFBSSxDQUFDO0FBQUEsRUFDdEQ7QUFDQSxhQUFXLFFBQVEsY0FBYztBQUNoQyxhQUFTLElBQUksS0FBSyxLQUFLLDZCQUE2QixJQUFJLENBQUM7QUFBQSxFQUMxRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsNkJBQTZCLFVBQWUsT0FBNkI7QUFDakYsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLE9BQU87QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLE1BQU0sTUFBTTtBQUFBLElBQ1osVUFBVTtBQUFBLElBQ1YsUUFBUTtBQUFBLElBQ1IsWUFBWTtBQUFBLElBQ1osT0FBTyxTQUFTLFdBQVcsS0FBSztBQUFBLEVBQ2pDO0FBQ0Q7QUFFQSxTQUFTLHNCQUFzQixVQUFlLE1BQWMsYUFBNkM7QUFDeEcsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLE9BQU87QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQSxVQUFVO0FBQUEsSUFDVixRQUFRO0FBQUEsSUFDUixZQUFZO0FBQUEsSUFDWixRQUFRLENBQUM7QUFBQSxJQUNUO0FBQUEsSUFDQSxnQkFBZ0I7QUFBQSxJQUNoQixVQUFVO0FBQUEsRUFDWDtBQUNEO0FBRUEsU0FBUyx5QkFBeUIsT0FBdUJBLG9CQUE0QyxVQUErQixrQkFBZ0Q7QUFDbkwsUUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQ3BDLFFBQU0scUJBQW9EO0FBQUEsSUFDekQsRUFBRSxLQUFLLElBQUksS0FBSywyQkFBMkIsR0FBRyxZQUFZLElBQUksS0FBSywyQkFBMkIsR0FBRyxhQUFhLFFBQVcsUUFBUSxpQkFBaUIsaUJBQWlCLFNBQVMsZUFBZSxNQUFNO0FBQUEsSUFDak0sRUFBRSxLQUFLLElBQUksS0FBSywyQkFBMkIsR0FBRyxZQUFZLElBQUksS0FBSywyQkFBMkIsR0FBRyxhQUFhLFFBQVcsUUFBUSxpQkFBaUIsaUJBQWlCLFNBQVMsZUFBZSxNQUFNO0FBQUEsSUFDak0sRUFBRSxLQUFLLElBQUksS0FBSywyQkFBMkIsR0FBRyxZQUFZLElBQUksS0FBSywyQkFBMkIsR0FBRyxhQUFhLFFBQVcsUUFBUSxpQkFBaUIsaUJBQWlCLFNBQVMsZUFBZSxNQUFNO0FBQUEsSUFDak0sRUFBRSxLQUFLLElBQUksS0FBSywwQkFBMEIsR0FBRyxZQUFZLElBQUksS0FBSywwQkFBMEIsR0FBRyxhQUFhLFFBQVcsUUFBUSxpQkFBaUIsZ0JBQWdCLFNBQVMsZUFBZSxLQUFLO0FBQUEsSUFDN0wsRUFBRSxLQUFLLElBQUksS0FBSywyQkFBMkIsR0FBRyxZQUFZLElBQUksS0FBSywyQkFBMkIsR0FBRyxhQUFhLFFBQVcsUUFBUSxpQkFBaUIsaUJBQWlCLFNBQVMsZUFBZSxLQUFLO0FBQUEsSUFDaE0sRUFBRSxLQUFLLElBQUksS0FBSywwQkFBMEIsR0FBRyxZQUFZLElBQUksS0FBSywwQkFBMEIsR0FBRyxhQUFhLFFBQVcsUUFBUSxpQkFBaUIsZ0JBQWdCLFNBQVMsZUFBZSxLQUFLO0FBQUEsRUFDOUw7QUFDQSxTQUFPLElBQUksY0FBYyxLQUFzQixFQUFFO0FBQUEsSUFBdEM7QUFBQTtBQUNWLFdBQWtCLDBCQUEwQixNQUFNO0FBQ2xELFdBQWtCLDJCQUEyQjtBQUM3QyxXQUFrQixvQkFBb0I7QUFDdEMsV0FBa0IsMEJBQTBCLE1BQU07QUFDbEQsV0FBa0IsK0JBQStCLE1BQU07QUFDdkQsV0FBa0IsbUJBQW1CLE1BQU07QUFBQTtBQUFBLElBQ2xDLHlCQUFzQztBQUFFLGFBQU8sSUFBSSxZQUFZO0FBQUEsSUFBRztBQUFBLElBQ2xFLHlCQUF5QjtBQUFFLGFBQU87QUFBQSxJQUFJO0FBQUEsSUFDL0MsTUFBZSxnQkFBZ0IsTUFBbUIsUUFBMkI7QUFDNUUsYUFBTyxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsSUFBSSxFQUFFLElBQUksUUFBTTtBQUFBLFFBQ25ELEtBQUssRUFBRTtBQUFBLFFBQ1AsU0FBUyxFQUFFO0FBQUEsUUFDWCxNQUFNLEVBQUU7QUFBQSxRQUNSLE1BQU0sRUFBRTtBQUFBLFFBQ1IsYUFBYSxFQUFFO0FBQUEsUUFDZixRQUFRLEVBQUU7QUFBQSxRQUNWLFdBQVcsZ0JBQWdCLENBQUM7QUFBQSxNQUM3QixFQUFFO0FBQUEsSUFDSDtBQUFBLElBQ0EsTUFBZSx3QkFBd0I7QUFBRSxhQUFPQTtBQUFBLElBQW1CO0FBQUEsSUFDbkUsTUFBZSwwQkFBMEIsTUFBbUIsU0FBeUIsUUFBMkI7QUFDL0csYUFBTyxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsUUFBUSxFQUFFLFlBQVksT0FBTyxFQUFFLElBQUksUUFBTTtBQUFBLFFBQzVFLEtBQUssRUFBRTtBQUFBLFFBQ1AsU0FBUyxFQUFFO0FBQUEsUUFDWCxNQUFNLEVBQUU7QUFBQSxRQUNSLE1BQU0sRUFBRTtBQUFBLFFBQ1IsYUFBYSxFQUFFO0FBQUEsUUFDZixRQUFRLEVBQUU7QUFBQSxRQUNWLFdBQVcsZ0JBQWdCLENBQUM7QUFBQSxNQUM3QixFQUFFO0FBQUEsSUFDSDtBQUFBLElBQ0EsTUFBZSxrQkFBa0I7QUFDaEMsYUFBTyxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsWUFBWSxLQUFLLEVBQUUsSUFBSSxRQUFNO0FBQUEsUUFDaEUsS0FBSyxFQUFFO0FBQUEsUUFBSyxNQUFNLEVBQUUsUUFBUTtBQUFBLFFBQVMsYUFBYSxFQUFFO0FBQUEsUUFBYSxTQUFTLEVBQUU7QUFBQSxRQUM1RSxRQUFRO0FBQUEsVUFDUCxTQUFTLEVBQUU7QUFBQSxVQUNYLGFBQWEsRUFBRSxjQUFjLElBQUksb0JBQW9CLEVBQUUsV0FBVyxJQUFJO0FBQUEsUUFDdkU7QUFBQSxRQUNBLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxNQUN6RCxFQUFFO0FBQUEsSUFDSDtBQUFBLElBQ0EsTUFBZSxTQUFTLEtBQVUsUUFBc0Q7QUFDdkYsYUFBTyxPQUFPLE1BQU0sS0FBSyxTQUFTLElBQUksR0FBRyxLQUFLLEVBQUU7QUFBQSxJQUNqRDtBQUFBLElBQ1Msb0JBQW9CLE9BQXlDO0FBQ3JFLGFBQU8sT0FBTyxNQUFNLE1BQU0sS0FBSyxNQUFNLFNBQVMsQ0FBQztBQUFBLElBQ2hEO0FBQUEsSUFDQSxNQUFlLG1CQUFtQjtBQUFFLGFBQU8sQ0FBQztBQUFBLElBQWM7QUFBQSxJQUMxRCxNQUFlLHlCQUF5QixNQUFtQjtBQUMxRCxVQUFJLFNBQVMsWUFBWSxPQUFPO0FBQy9CLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUFBLElBQ0EsTUFBZSxzQkFBc0I7QUFDcEMsYUFBTyxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsWUFBWSxZQUFZLEVBQUUsSUFBSSxRQUFNO0FBQUEsUUFDdkUsS0FBSyxFQUFFO0FBQUEsUUFDUCxNQUFNLEVBQUUsUUFBUTtBQUFBLFFBQ2hCLGFBQWEsRUFBRTtBQUFBLFFBQ2YsU0FBUyxFQUFFO0FBQUEsUUFDWCxTQUFTLEVBQUU7QUFBQSxRQUNYLFdBQVcsZ0JBQWdCLENBQUM7QUFBQSxNQUM3QixFQUFFO0FBQUEsSUFDSDtBQUFBLElBQ0EsTUFBZSxrQkFBMEM7QUFDeEQsYUFBTyxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsWUFBWSxLQUFLLEVBQUUsSUFBSSxRQUFNO0FBQUEsUUFDaEUsS0FBSyxFQUFFO0FBQUEsUUFDUCxTQUFTLEVBQUU7QUFBQSxRQUNYLE1BQU0sRUFBRSxRQUFRO0FBQUEsUUFDaEIsYUFBYSxFQUFFO0FBQUEsUUFDZix3QkFBd0I7QUFBQSxRQUN4QixlQUFlO0FBQUEsTUFDaEIsRUFBRTtBQUFBLElBQ0g7QUFBQSxJQUNBLE1BQWUseUJBQXNFO0FBQ3BGLFlBQU0sY0FBYyxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsWUFBWSxNQUFNO0FBQ25FLFlBQU0sV0FBVyxNQUFNLFFBQVEsSUFBSSxZQUFZLElBQUksT0FBTSxNQUFLO0FBQzdELGVBQU87QUFBQSxVQUNOLEtBQUssRUFBRTtBQUFBLFVBQ1AsZUFBZTtBQUFBLFVBQ2YsTUFBTSxFQUFFLFFBQVE7QUFBQSxVQUNoQixhQUFhLEVBQUU7QUFBQSxVQUNmLGNBQWM7QUFBQSxVQUNkLE1BQU0sRUFBRTtBQUFBLFVBQ1IsU0FBUyxFQUFFO0FBQUEsVUFDWCxRQUFRO0FBQUEsVUFDUixXQUFXLGdCQUFnQixDQUFDO0FBQUEsUUFDN0I7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRCxFQUFFO0FBQ0g7QUFFQSxTQUFTLHlCQUF5QixpQkFBc0IsYUFBMEU7QUFDakksUUFBTSx3QkFBd0IsZ0JBQXFCLHlCQUF5QixlQUFlO0FBQzNGLFFBQU0sZ0JBQWdCLFFBQVEsWUFBVSxtQkFBbUIsc0JBQXNCLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDOUYsU0FBTyxJQUFJLGNBQWMsS0FBbUMsRUFBRTtBQUFBLElBQW5EO0FBQUE7QUFDVixXQUFrQix3QkFBd0I7QUFDMUMsV0FBa0IsZ0JBQWdCO0FBQ2xDLFdBQWtCLHFCQUFxQixnQkFBZ0IsV0FBVztBQUFBO0FBQUEsSUFDekQsZ0JBQWdCLElBQVk7QUFDcEMsYUFBTyxZQUFZLEtBQUssT0FBSyxFQUFFLE9BQU8sRUFBRTtBQUFBLElBQ3pDO0FBQUEsSUFDUyxzQkFBc0I7QUFDOUIsYUFBTyxZQUFZLEtBQUssT0FBSyxFQUFFLE9BQU8sY0FBYyxJQUFJLENBQUMsS0FBSyxZQUFZLENBQUM7QUFBQSxJQUM1RTtBQUFBLElBQ1MsaUJBQWlCQyxrQkFBc0I7QUFDL0MsNEJBQXNCLElBQUlBLGtCQUFpQixNQUFTO0FBQUEsSUFDckQ7QUFBQSxJQUNTLDBCQUEwQjtBQUFFLGFBQU8sRUFBRSxVQUFVO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFBRztBQUFBLEVBQ2hFLEVBQUU7QUFDSDtBQUVBLFNBQVMsbUJBQW1CLElBQVksT0FBZSxPQUE0QixhQUFzQixRQUE2RDtBQUNySyxTQUFPLElBQUksY0FBYyxLQUEwQixFQUFFO0FBQUEsSUFBMUM7QUFBQTtBQUNWLFdBQWtCLEtBQUs7QUFDdkIsV0FBa0IsT0FBTztBQUN6QixXQUFrQixRQUFRO0FBQzFCLFdBQWtCLGNBQWMsZUFBZTtBQUMvQyxXQUFrQixTQUFTO0FBQzNCLFdBQWtCLGVBQWUsc0JBQXNCO0FBQ3ZELFdBQWtCLFFBQVEsSUFBSSxjQUFjLEtBQStCLEVBQUU7QUFBQSxRQUEvQztBQUFBO0FBQzdCLGVBQWtCLEtBQUs7QUFDdkIsZUFBa0IsUUFBUTtBQUFBO0FBQUEsTUFDM0IsRUFBRTtBQUFBO0FBQUEsRUFDSCxFQUFFO0FBQ0g7QUFFQSxTQUFTLGlDQUF3RDtBQUNoRSxTQUFPLElBQUksY0FBYyxLQUE0QixFQUFFO0FBQUEsSUFBNUM7QUFBQTtBQUNWLFdBQWtCLHNCQUFzQixNQUFNO0FBQzlDLFdBQWtCLHdCQUF3QixNQUFNO0FBQ2hELFdBQWtCLDJCQUEyQixNQUFNO0FBQ25ELFdBQWtCLG1CQUFtQixNQUFNO0FBQzNDLFdBQWtCLHVCQUF1QixNQUFNO0FBQy9DLFdBQWtCLGdCQUFnQixNQUFNO0FBQ3hDLFdBQWtCLHNCQUFzQixNQUFNO0FBQUE7QUFBQSxJQUNyQyxjQUFjO0FBQUUsYUFBTyxDQUFDO0FBQUEsSUFBRztBQUFBLElBQzNCLG9CQUFvQjtBQUFFLGFBQU87QUFBQSxJQUFXO0FBQUEsSUFDeEMsNkJBQTZCO0FBQUUsYUFBTztBQUFBLElBQVc7QUFBQSxJQUNqRCxrQ0FBa0M7QUFBRSxhQUFPO0FBQUEsSUFBVztBQUFBLElBQy9ELE1BQWUsaUJBQWdDO0FBQUEsSUFBRTtBQUFBLElBQ3hDLGtCQUFrQjtBQUFFLGFBQU87QUFBQSxJQUFXO0FBQUEsSUFDdEMsdUJBQXVCO0FBQUUsYUFBTyxFQUFFLFdBQVcsSUFBSSxZQUFZLEVBQUU7QUFBQSxJQUFHO0FBQUEsSUFDbEUsdUJBQXVCO0FBQUUsYUFBTztBQUFBLElBQVc7QUFBQSxJQUMzQyxzQkFBNEI7QUFBQSxJQUFFO0FBQUEsSUFDOUIsZ0JBQXNCO0FBQUEsSUFBRTtBQUFBLElBQ3hCLGlCQUF1QjtBQUFBLElBQUU7QUFBQSxJQUNsQyxNQUFlLHVCQUFzQztBQUFBLElBQUU7QUFBQSxFQUN4RCxFQUFFO0FBQ0g7QUFNQSxNQUFNLFdBQTJCO0FBQUE7QUFBQSxFQUVoQyxFQUFFLEtBQUssSUFBSSxLQUFLLHFFQUFxRSxHQUFHLFNBQVMsZUFBZSxXQUFXLE1BQU0sWUFBWSxjQUFjLE1BQU0sa0JBQWtCLGFBQWEsNEJBQTRCLGFBQWEsdUJBQXVCLHNCQUFzQixzQkFBc0I7QUFBQSxFQUM1UyxFQUFFLEtBQUssSUFBSSxLQUFLLDBEQUEwRCxHQUFHLFNBQVMsZUFBZSxXQUFXLE1BQU0sWUFBWSxjQUFjLE1BQU0sb0JBQW9CLGFBQWEsc0NBQXNDLGFBQWEsY0FBYyxzQkFBc0IsYUFBYTtBQUFBO0FBQUEsRUFFM1IsRUFBRSxLQUFLLElBQUksS0FBSyxrRUFBa0UsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksY0FBYyxNQUFNLG9CQUFvQixhQUFhLG1DQUFtQztBQUFBLEVBQzlOLEVBQUUsS0FBSyxJQUFJLEtBQUsseURBQXlELEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLGNBQWMsTUFBTSxXQUFXLGFBQWEsMEJBQTBCLFNBQVMsZUFBZTtBQUFBLEVBQzNOLEVBQUUsS0FBSyxJQUFJLEtBQUssMERBQTBELEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLGNBQWMsTUFBTSxZQUFZLGFBQWEsNkJBQTZCLFNBQVMsY0FBYztBQUFBLEVBQy9OLEVBQUUsS0FBSyxJQUFJLEtBQUssK0RBQStELEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLGNBQWMsTUFBTSxpQkFBaUIsYUFBYSw4QkFBOEIsU0FBUyxXQUFXO0FBQUEsRUFDdk8sRUFBRSxLQUFLLElBQUksS0FBSyw0REFBNEQsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksY0FBYyxNQUFNLGNBQWMsYUFBYSw4QkFBOEI7QUFBQSxFQUM3TSxFQUFFLEtBQUssSUFBSSxLQUFLLDZEQUE2RCxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxjQUFjLE1BQU0sZUFBZSxhQUFhLGtDQUFrQyxTQUFTLGNBQWM7QUFBQSxFQUMxTyxFQUFFLEtBQUssSUFBSSxLQUFLLGdFQUFnRSxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxjQUFjLE1BQU0sa0JBQWtCLGFBQWEsMEJBQTBCO0FBQUEsRUFDak4sRUFBRSxLQUFLLElBQUksS0FBSywwREFBMEQsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksY0FBYyxNQUFNLFlBQVksYUFBYSx5Q0FBeUMsU0FBUyxZQUFZO0FBQUE7QUFBQSxFQUV6TyxFQUFFLEtBQUssSUFBSSxLQUFLLDZDQUE2QyxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxjQUFjLFFBQVEsaUJBQWlCLFVBQVUsTUFBTSx5QkFBeUIsYUFBYSwrQkFBK0I7QUFBQSxFQUM1TyxFQUFFLEtBQUssSUFBSSxLQUFLLDBEQUEwRCxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxjQUFjLE1BQU0sWUFBWSxhQUFhLHdCQUF3QjtBQUFBLEVBQ2xNLEVBQUUsS0FBSyxJQUFJLEtBQUssa0VBQWtFLEdBQUcsU0FBUyxlQUFlLE1BQU0sTUFBTSxZQUFZLGNBQWMsTUFBTSxvQkFBb0IsYUFBYSxnQ0FBZ0M7QUFBQSxFQUMxTixFQUFFLEtBQUssSUFBSSxLQUFLLGlFQUFpRSxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxjQUFjLE1BQU0sbUJBQW1CLGFBQWEsNkJBQTZCO0FBQUE7QUFBQSxFQUVyTixFQUFFLEtBQUssSUFBSSxLQUFLLHdDQUF3QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxjQUFjLE1BQU0sY0FBYyxhQUFhLDBCQUEwQjtBQUFBLEVBQ3JMLEVBQUUsS0FBSyxJQUFJLEtBQUsscUNBQXFDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLGNBQWMsTUFBTSxXQUFXLGFBQWEsNkJBQTZCO0FBQUEsRUFDbEwsRUFBRSxLQUFLLElBQUksS0FBSyxxQ0FBcUMsR0FBRyxTQUFTLGVBQWUsTUFBTSxNQUFNLFlBQVksY0FBYyxNQUFNLFlBQVksYUFBYSxpQkFBaUI7QUFBQTtBQUFBLEVBRXRLLEVBQUUsS0FBSyxJQUFJLEtBQUssNkNBQTZDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE9BQU8sTUFBTSxZQUFZLGFBQWEsb0JBQW9CO0FBQUEsRUFDM0ssRUFBRSxLQUFLLElBQUksS0FBSywrQ0FBK0MsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksT0FBTyxNQUFNLGNBQWMsYUFBYSxzQkFBc0I7QUFBQSxFQUNqTCxFQUFFLEtBQUssSUFBSSxLQUFLLDJDQUEyQyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sVUFBVSxhQUFhLGlDQUFpQztBQUFBLEVBQ3BMLEVBQUUsS0FBSyxJQUFJLEtBQUssK0NBQStDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE9BQU8sTUFBTSxjQUFjLGFBQWEsOEJBQThCO0FBQUEsRUFDekwsRUFBRSxLQUFLLElBQUksS0FBSyxxREFBcUQsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksT0FBTyxNQUFNLG9CQUFvQixhQUFhLGlDQUFpQztBQUFBLEVBQ3hNLEVBQUUsS0FBSyxJQUFJLEtBQUssaURBQWlELEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE9BQU8sTUFBTSxnQkFBZ0IsYUFBYSw4QkFBOEI7QUFBQSxFQUM3TCxFQUFFLEtBQUssSUFBSSxLQUFLLHNEQUFzRCxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0scUJBQXFCLGFBQWEseUNBQXlDO0FBQUE7QUFBQSxFQUVsTixFQUFFLEtBQUssSUFBSSxLQUFLLG9DQUFvQyxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxPQUFPLFFBQVEsaUJBQWlCLFVBQVUsTUFBTSxnQkFBZ0IsYUFBYSx3QkFBd0I7QUFBQSxFQUM1TSxFQUFFLEtBQUssSUFBSSxLQUFLLDRDQUE0QyxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxPQUFPLE1BQU0sV0FBVyxhQUFhLHlCQUF5QjtBQUFBLEVBQzdLLEVBQUUsS0FBSyxJQUFJLEtBQUssNkNBQTZDLEdBQUcsU0FBUyxlQUFlLE1BQU0sTUFBTSxZQUFZLE9BQU8sTUFBTSxZQUFZLGFBQWEsa0NBQWtDO0FBQUEsRUFDeEwsRUFBRSxLQUFLLElBQUksS0FBSywrQ0FBK0MsR0FBRyxTQUFTLGVBQWUsTUFBTSxNQUFNLFlBQVksT0FBTyxNQUFNLGNBQWMsYUFBYSw4Q0FBOEM7QUFBQTtBQUFBLEVBRXhNLEVBQUUsS0FBSyxJQUFJLEtBQUssaUVBQWlFLEdBQUcsU0FBUyxlQUFlLFdBQVcsTUFBTSxZQUFZLE9BQU8sTUFBTSxtQkFBbUIsYUFBYSx3Q0FBd0MsYUFBYSx1QkFBdUIsc0JBQXNCLHNCQUFzQjtBQUFBLEVBQzlTLEVBQUUsS0FBSyxJQUFJLEtBQUssbURBQW1ELEdBQUcsU0FBUyxlQUFlLFdBQVcsTUFBTSxZQUFZLE9BQU8sTUFBTSxjQUFjLGFBQWEseUJBQXlCLGFBQWEsY0FBYyxzQkFBc0IsYUFBYTtBQUFBO0FBQUEsRUFFMVAsRUFBRSxLQUFLLElBQUksS0FBSywyQ0FBMkMsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksT0FBTyxNQUFNLFVBQVUsYUFBYSx3QkFBd0I7QUFBQSxFQUMzSyxFQUFFLEtBQUssSUFBSSxLQUFLLDZDQUE2QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sWUFBWSxhQUFhLDRCQUE0QjtBQUFBLEVBQ25MLEVBQUUsS0FBSyxJQUFJLEtBQUssK0NBQStDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE9BQU8sTUFBTSxjQUFjLGFBQWEseUNBQXlDO0FBQUEsRUFDcE0sRUFBRSxLQUFLLElBQUksS0FBSywyQ0FBMkMsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksT0FBTyxNQUFNLFVBQVUsYUFBYSwrQkFBK0I7QUFBQSxFQUNsTCxFQUFFLEtBQUssSUFBSSxLQUFLLDhDQUE4QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sYUFBYSxhQUFhLGdDQUFnQztBQUFBLEVBQ3pMLEVBQUUsS0FBSyxJQUFJLEtBQUssa0RBQWtELEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE9BQU8sTUFBTSxpQkFBaUIsYUFBYSxzQ0FBc0M7QUFBQSxFQUN2TSxFQUFFLEtBQUssSUFBSSxLQUFLLDJDQUEyQyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sVUFBVSxhQUFhLG9DQUFvQztBQUFBLEVBQ3ZMLEVBQUUsS0FBSyxJQUFJLEtBQUssNkNBQTZDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE9BQU8sTUFBTSxZQUFZLGFBQWEsMEJBQTBCO0FBQUE7QUFBQSxFQUVqTCxFQUFFLEtBQUssSUFBSSxLQUFLLGlEQUFpRCxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxPQUFPLE1BQU0sZ0JBQWdCLGFBQWEsMEJBQTBCO0FBQUEsRUFDeEwsRUFBRSxLQUFLLElBQUksS0FBSyxnREFBZ0QsR0FBRyxTQUFTLGVBQWUsTUFBTSxNQUFNLFlBQVksT0FBTyxNQUFNLGVBQWUsYUFBYSxtQ0FBbUM7QUFBQTtBQUFBLEVBRS9MLEVBQUUsS0FBSyxJQUFJLEtBQUssMkRBQTJELEdBQUcsU0FBUyxlQUFlLFdBQVcsTUFBTSxZQUFZLE9BQU8sTUFBTSxvQkFBb0IsYUFBYSxtQ0FBbUMsYUFBYSx1QkFBdUIsc0JBQXNCLHNCQUFzQjtBQUFBLEVBQ3BTLEVBQUUsS0FBSyxJQUFJLEtBQUssOENBQThDLEdBQUcsU0FBUyxlQUFlLFdBQVcsTUFBTSxZQUFZLE9BQU8sTUFBTSxTQUFTLGFBQWEsMkJBQTJCLGFBQWEsY0FBYyxzQkFBc0IsYUFBYTtBQUFBO0FBQUEsRUFFbFAsRUFBRSxLQUFLLElBQUksS0FBSyxzQ0FBc0MsR0FBRyxTQUFTLGlCQUFtQyxNQUFNLFlBQVksT0FBTyxNQUFNLG1CQUFtQixhQUFhLHVEQUF1RDtBQUFBLEVBQzNOLEVBQUUsS0FBSyxJQUFJLEtBQUssNENBQTRDLEdBQUcsU0FBUyxpQkFBbUMsTUFBTSxZQUFZLE9BQU8sTUFBTSx5QkFBeUIsYUFBYSwwREFBMEQ7QUFBQSxFQUMxTyxFQUFFLEtBQUssSUFBSSxLQUFLLDZCQUE2QixHQUFHLFNBQVMsaUJBQW1DLE1BQU0sWUFBWSxPQUFPLE1BQU0sVUFBVSxhQUFhLHdFQUF3RTtBQUFBLEVBQzFOLEVBQUUsS0FBSyxJQUFJLEtBQUssZ0NBQWdDLEdBQUcsU0FBUyxpQkFBbUMsTUFBTSxZQUFZLE9BQU8sTUFBTSxhQUFhLGFBQWEsZ0RBQWdEO0FBQUE7QUFBQSxFQUV4TSxFQUFFLEtBQUssSUFBSSxLQUFLLDhDQUE4QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxRQUFRLE1BQU0sV0FBVyxhQUFhLHdCQUF3QjtBQUFBLEVBQ2hMLEVBQUUsS0FBSyxJQUFJLEtBQUssNkNBQTZDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLFFBQVEsTUFBTSxVQUFVLGFBQWEsaUJBQWlCO0FBQUEsRUFDdkssRUFBRSxLQUFLLElBQUksS0FBSyw4Q0FBOEMsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksUUFBUSxNQUFNLFdBQVcsYUFBYSxvQ0FBb0M7QUFBQSxFQUM1TCxFQUFFLEtBQUssSUFBSSxLQUFLLGtEQUFrRCxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxRQUFRLE1BQU0sZUFBZSxhQUFhLG9DQUFvQztBQUFBLEVBQ3BNLEVBQUUsS0FBSyxJQUFJLEtBQUssK0NBQStDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLFFBQVEsTUFBTSxZQUFZLGFBQWEsa0NBQWtDO0FBQUEsRUFDNUwsRUFBRSxLQUFLLElBQUksS0FBSywrQ0FBK0MsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksUUFBUSxNQUFNLFlBQVksYUFBYSxnQ0FBZ0M7QUFBQSxFQUMxTCxFQUFFLEtBQUssSUFBSSxLQUFLLG9EQUFvRCxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxRQUFRLE1BQU0saUJBQWlCLGFBQWEsbUNBQW1DO0FBQUEsRUFDdk0sRUFBRSxLQUFLLElBQUksS0FBSyxtREFBbUQsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksUUFBUSxNQUFNLGdCQUFnQixhQUFhLG9DQUFvQztBQUFBO0FBQUEsRUFFdE0sRUFBRSxLQUFLLElBQUksS0FBSyxzQ0FBc0MsR0FBRyxTQUFTLGVBQWUsTUFBTSxNQUFNLFlBQVksUUFBUSxRQUFRLGlCQUFpQixVQUFVLE1BQU0sa0JBQWtCLGFBQWEseUJBQXlCO0FBQUEsRUFDbE4sRUFBRSxLQUFLLElBQUksS0FBSyxnREFBZ0QsR0FBRyxTQUFTLGVBQWUsTUFBTSxNQUFNLFlBQVksUUFBUSxNQUFNLGFBQWEsYUFBYSw2QkFBNkI7QUFBQSxFQUN4TCxFQUFFLEtBQUssSUFBSSxLQUFLLGlEQUFpRCxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxRQUFRLE1BQU0sa0JBQWtCLGFBQWEsK0JBQStCO0FBQUE7QUFBQSxFQUVoTSxFQUFFLEtBQUssSUFBSSxLQUFLLHlEQUF5RCxHQUFHLFNBQVMsZUFBZSxXQUFXLE1BQU0sWUFBWSxRQUFRLE1BQU0sU0FBUyxhQUFhLDJCQUEyQixhQUFhLHVCQUF1QixzQkFBc0Isc0JBQXNCO0FBQUEsRUFDaFIsRUFBRSxLQUFLLElBQUksS0FBSywrQ0FBK0MsR0FBRyxTQUFTLGVBQWUsV0FBVyxNQUFNLFlBQVksUUFBUSxNQUFNLFFBQVEsYUFBYSwyQkFBMkIsYUFBYSxjQUFjLHNCQUFzQixhQUFhO0FBQUE7QUFBQSxFQUVuUCxFQUFFLEtBQUssSUFBSSxLQUFLLDBDQUEwQyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxNQUFNLE1BQU0sbUJBQW1CLGFBQWEsNEJBQTRCO0FBQUEsRUFDdEwsRUFBRSxLQUFLLElBQUksS0FBSyx5Q0FBeUMsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksTUFBTSxNQUFNLG9CQUFvQixhQUFhLHNCQUFzQjtBQUFBLEVBQ2hMLEVBQUUsS0FBSyxJQUFJLEtBQUssNENBQTRDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE1BQU0sTUFBTSxtQkFBbUIsYUFBYSw4QkFBOEI7QUFBQSxFQUMxTCxFQUFFLEtBQUssSUFBSSxLQUFLLHdDQUF3QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxNQUFNLE1BQU0sa0JBQWtCLGFBQWEsNkJBQTZCO0FBQUEsRUFDcEwsRUFBRSxLQUFLLElBQUksS0FBSywyQ0FBMkMsR0FBRyxTQUFTLGVBQWUsT0FBTyxNQUFNLFlBQVksTUFBTSxNQUFNLGVBQWUsYUFBYSx1Q0FBdUM7QUFBQSxFQUM5TCxFQUFFLEtBQUssSUFBSSxLQUFLLHdDQUF3QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxNQUFNLE1BQU0sWUFBWSxhQUFhLGtDQUFrQztBQUFBLEVBQ25MLEVBQUUsS0FBSyxJQUFJLEtBQUssOENBQThDLEdBQUcsU0FBUyxlQUFlLE9BQU8sTUFBTSxZQUFZLE1BQU0sTUFBTSxrQkFBa0IsYUFBYSx5Q0FBeUM7QUFBQSxFQUN0TSxFQUFFLEtBQUssSUFBSSxLQUFLLDZDQUE2QyxHQUFHLFNBQVMsZUFBZSxPQUFPLE1BQU0sWUFBWSxNQUFNLE1BQU0sb0JBQW9CLGFBQWEsNkJBQTZCO0FBQUE7QUFBQSxFQUUzTCxFQUFFLEtBQUssSUFBSSxLQUFLLDZDQUE2QyxHQUFHLFNBQVMsZUFBZSxNQUFNLE1BQU0sWUFBWSxNQUFNLE1BQU0saUJBQWlCLGFBQWEsOEJBQThCO0FBQUEsRUFDeEwsRUFBRSxLQUFLLElBQUksS0FBSyw4Q0FBOEMsR0FBRyxTQUFTLGVBQWUsTUFBTSxNQUFNLFlBQVksTUFBTSxNQUFNLGtCQUFrQixhQUFhLGlDQUFpQztBQUM5TDtBQUVBLE1BQU0sb0JBQTZDO0FBQUEsRUFDbEQsRUFBRSxLQUFLLElBQUksS0FBSyxzQkFBc0IsR0FBRyxVQUFVLFFBQVcsTUFBTSx5QkFBeUIsU0FBUztBQUFBLEVBQ3RHLEVBQUUsS0FBSyxJQUFJLEtBQUssc0JBQXNCLEdBQUcsVUFBVSxRQUFXLE1BQU0seUJBQXlCLFNBQVM7QUFBQSxFQUN0RyxFQUFFLEtBQUssSUFBSSxLQUFLLDRDQUE0QyxHQUFHLFVBQVUsUUFBVyxNQUFNLHlCQUF5QixzQkFBc0I7QUFDMUk7QUFFQSxNQUFNLHNCQUFzQjtBQUFBLEVBQzNCO0FBQUEsSUFDQztBQUFBLElBQ0E7QUFBQSxJQUNBLG9CQUFvQjtBQUFBLElBQ3BCO0FBQUEsSUFDQTtBQUFBLE1BQ0MsTUFBTSxjQUFjO0FBQUEsTUFDcEIsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLFFBQVEsUUFBUSxNQUFNLHNCQUFzQixPQUFPLE1BQU0sb0RBQW9ELGdCQUFnQixLQUFLO0FBQUEsSUFDMUk7QUFBQSxFQUNEO0FBQUEsRUFDQSxtQkFBbUIsZ0JBQWdCLGNBQWMsb0JBQW9CLFdBQVcsaUJBQWlCO0FBQUEsRUFDakcsbUJBQW1CLGNBQWMsVUFBVSxvQkFBb0IsV0FBVyxZQUFZO0FBQUEsRUFDdEYsbUJBQW1CLGFBQWEsU0FBUyxvQkFBb0IsV0FBVyxzQkFBc0I7QUFBQSxFQUM5RixtQkFBbUIsY0FBYyxVQUFVLG9CQUFvQixXQUFXLHNCQUFzQjtBQUFBLEVBQ2hHLG1CQUFtQixhQUFhLFNBQVMsb0JBQW9CLFdBQVcsZ0JBQWdCO0FBQUEsRUFDeEYsbUJBQW1CLFlBQVksUUFBUSxvQkFBb0IsV0FBVyxnQkFBZ0I7QUFBQSxFQUN0RixtQkFBbUIsV0FBVyxPQUFPLG9CQUFvQixXQUFXLHFCQUFxQjtBQUFBLEVBQ3pGLG1CQUFtQixlQUFlLFdBQVcsb0JBQW9CLFdBQVcscUJBQXFCO0FBQ2xHO0FBQ0EsTUFBTSxpQkFBaUI7QUFBQSxFQUN0QixtQkFBbUIsa0JBQWtCLGNBQWMsb0JBQW9CLE1BQU0sZ0JBQWdCO0FBQUEsRUFDN0YsbUJBQW1CLGtCQUFrQixjQUFjLG9CQUFvQixNQUFNLHVCQUF1QjtBQUFBLEVBQ3BHLG1CQUFtQixpQkFBaUIsYUFBYSxvQkFBb0IsTUFBTSxvQkFBb0I7QUFDaEc7QUFDQSxNQUFNLG9CQUFvQjtBQUFBLEVBQ3pCLEVBQUUsWUFBWSxFQUFFLElBQUksc0JBQXNCLE9BQU8saUJBQWlCLEdBQUcsWUFBWSxFQUFFLElBQUksMEJBQTBCLE9BQU8seUJBQXlCLEdBQUcsWUFBWSxnQkFBZ0IsNEJBQTRCLGNBQWMsR0FBRyxpQkFBaUIsZ0JBQWdCLEVBQUUsT0FBTyxtQkFBbUIsS0FBSyxTQUFTLENBQUMsR0FBRyxhQUFhO0FBQUEsRUFBRSxFQUFFO0FBQUEsRUFDN1QsRUFBRSxZQUFZLEVBQUUsSUFBSSxnQkFBZ0IsT0FBTyxhQUFhLEdBQUcsWUFBWSxFQUFFLElBQUksaUJBQWlCLE9BQU8sZ0JBQWdCLEdBQUcsWUFBWSxnQkFBZ0IsNEJBQTRCLGNBQWMsR0FBRyxpQkFBaUIsZ0JBQWdCLEVBQUUsT0FBTyxtQkFBbUIsS0FBSyxNQUFNLENBQUMsR0FBRyxhQUFhO0FBQUEsRUFBRSxFQUFFO0FBQUEsRUFDOVIsRUFBRSxZQUFZLEVBQUUsSUFBSSxrQkFBa0IsT0FBTyxhQUFhLEdBQUcsWUFBWSxFQUFFLElBQUksWUFBWSxPQUFPLFdBQVcsR0FBRyxZQUFZLGdCQUFnQiw0QkFBNEIsZUFBZSxHQUFHLGlCQUFpQixnQkFBZ0IsRUFBRSxPQUFPLG1CQUFtQixLQUFLLFFBQVEsQ0FBQyxHQUFHLGFBQWE7QUFBQSxFQUFFLEVBQUU7QUFBQSxFQUN6UixFQUFFLFlBQVksRUFBRSxJQUFJLGtCQUFrQixPQUFPLGFBQWEsR0FBRyxZQUFZLEVBQUUsSUFBSSxZQUFZLE9BQU8sV0FBVyxHQUFHLFlBQVksZ0JBQWdCLDRCQUE0QixjQUFjLEdBQUcsaUJBQWlCLGdCQUFnQixFQUFFLE9BQU8sbUJBQW1CLEtBQUssUUFBUSxDQUFDLEdBQUcsYUFBYTtBQUFBLEVBQUUsRUFBRTtBQUN6UjtBQUVBLE1BQU0sMEJBQXVEO0FBQUEsRUFDNUQsRUFBRSxJQUFJLG9EQUFvRCxNQUFNLHNCQUFzQixTQUFTLE1BQU0sUUFBUSxnQkFBZ0IsT0FBTyxPQUFPLEVBQUUsTUFBTSxnQkFBZ0IsTUFBTSxHQUFHLG9CQUFvQixzQkFBc0IsT0FBTyxrQkFBa0IsTUFBTSxrQkFBa0IsYUFBYTtBQUFBLEVBQUUsRUFBRTtBQUFBLEVBQ3hSLEVBQUUsSUFBSSxnREFBZ0QsTUFBTSxrQkFBa0IsU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGNBQWMsT0FBTyxFQUFFLE1BQU0sZ0JBQWdCLGNBQWMsUUFBUSxzQkFBc0IsVUFBVSxVQUFVLEVBQUUsVUFBVSwwQkFBMEIsRUFBRSxHQUFHLG9CQUFvQixzQkFBc0IsT0FBTyxrQkFBa0IsTUFBTSxrQkFBa0IsYUFBYTtBQUFBLEVBQUUsRUFBRTtBQUFBLEVBQ3pYLEVBQUUsSUFBSSwrQ0FBK0MsTUFBTSxpQkFBaUIsU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLE9BQU8sT0FBTyxFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sT0FBTyxFQUFFLFdBQVcsV0FBVyxTQUFTLGdCQUFnQixFQUFFLEdBQUcsb0JBQW9CLHNCQUFzQixPQUFPLGtCQUFrQixNQUFNLGtCQUFrQixhQUFhO0FBQUEsRUFBRSxFQUFFO0FBQzFVO0FBb0JBLFNBQVMsc0JBQXNCLFVBQStCO0FBQzdELFFBQU0sWUFBWSxJQUFJLEVBQUUsK0JBQStCO0FBQ3ZELFFBQU0sUUFBUSxTQUFTLE1BQU0sT0FBTztBQUNwQyxNQUFJLFFBQVE7QUFFWixTQUFPLFFBQVEsTUFBTSxRQUFRO0FBQzVCLFVBQU0sT0FBTyxNQUFNLEtBQUssRUFBRSxRQUFRO0FBQ2xDLFFBQUksQ0FBQyxLQUFLLEtBQUssR0FBRztBQUNqQjtBQUNBO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxXQUFXLEtBQUssR0FBRztBQUMzQixZQUFNLFVBQVUsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLElBQUksQ0FBQztBQUNqRCxjQUFRLGNBQWMsS0FBSyxNQUFNLENBQUM7QUFDbEM7QUFDQTtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssV0FBVyxJQUFJLEdBQUc7QUFDMUIsWUFBTSxPQUFPLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxJQUFJLENBQUM7QUFDOUMsYUFBTyxRQUFRLE1BQU0sVUFBVSxNQUFNLEtBQUssRUFBRSxVQUFVLEVBQUUsV0FBVyxJQUFJLEdBQUc7QUFDekUsWUFBSSxPQUFPLE1BQU0sSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLGNBQWMsTUFBTSxLQUFLLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQztBQUM1RTtBQUFBLE1BQ0Q7QUFDQTtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssV0FBVyxLQUFLLEdBQUc7QUFDM0I7QUFDQSxZQUFNLFlBQXNCLENBQUM7QUFDN0IsYUFBTyxRQUFRLE1BQU0sVUFBVSxDQUFDLE1BQU0sS0FBSyxFQUFFLFdBQVcsS0FBSyxHQUFHO0FBQy9ELGtCQUFVLEtBQUssTUFBTSxLQUFLLENBQUM7QUFDM0I7QUFBQSxNQUNEO0FBQ0EsWUFBTSxNQUFNLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxLQUFLLENBQUM7QUFDOUMsVUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFLGNBQWMsVUFBVSxLQUFLLElBQUk7QUFDaEU7QUFDQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLEdBQUcsQ0FBQztBQUNsRCxjQUFVLGNBQWMsS0FBSyxRQUFRLFNBQVMsRUFBRTtBQUNoRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFNQSxlQUFlLGFBQWEsS0FBOEIsU0FBOEM7QUFDdkcsUUFBTSxRQUFRLFFBQVEsU0FBUztBQUMvQixRQUFNLFNBQVMsUUFBUSxVQUFVO0FBQ2pDLE1BQUksVUFBVSxNQUFNLFFBQVEsR0FBRyxLQUFLO0FBQ3BDLE1BQUksVUFBVSxNQUFNLFNBQVMsR0FBRyxNQUFNO0FBRXRDLFFBQU0sbUJBQW1CLFFBQVEsb0JBQW9CO0FBQ3JELFFBQU0sc0JBQXNCLFFBQVEsdUJBQXVCLG9CQUFJLElBQUk7QUFDbkUsUUFBTSxxQkFBcUIsUUFBUSxzQkFBc0I7QUFBQSxJQUN4RCxpQ0FBaUM7QUFBQSxJQUNqQyxpQ0FBaUM7QUFBQSxJQUNqQyxpQ0FBaUM7QUFBQSxJQUNqQyxpQ0FBaUM7QUFBQSxJQUNqQyxpQ0FBaUM7QUFBQSxJQUNqQyxpQ0FBaUM7QUFBQSxJQUNqQyxpQ0FBaUM7QUFBQSxFQUNsQztBQUNBLFFBQU0scUJBQXFCLFFBQVEsc0JBQXNCO0FBQUEsSUFDeEQsOEJBQThCO0FBQUEsSUFDOUI7QUFBQSxNQUNDLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLE1BQU0sVUFBVSxPQUFPLFFBQVEsT0FBTyxFQUFFO0FBQUEsTUFDeEMsZ0JBQWdCLENBQUMsaUNBQWlDLE9BQU87QUFBQSxNQUN6RCxvQkFBb0I7QUFBQSxNQUNwQixjQUFjLG1DQUFtQyxRQUFRO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBRUEsUUFBTSxnQkFBZ0IsQ0FBQyxHQUFHLHFCQUFxQixHQUFHLGNBQWM7QUFDaEUsUUFBTSxlQUFlLFNBQVMsSUFBSSxXQUFTLEVBQUUsR0FBRyxLQUFLLEVBQUU7QUFDdkQsUUFBTSxlQUFlLHdCQUF3QixjQUFjLGlCQUFpQjtBQUM1RSxRQUFNLDhCQUE4QixJQUFJLGdCQUFnQixJQUFJLElBQUksUUFBYyxDQUFDO0FBQy9FLFFBQU0saUJBQWlCLElBQUksWUFBWTtBQVF2QyxRQUFNLGtCQUF3RCxFQUFFLE9BQU8sT0FBVTtBQUNqRixRQUFNLHFCQUE4RCxFQUFFLE9BQU8sT0FBVTtBQUV2RixRQUFNLHVCQUF1QixxQkFBcUIsSUFBSSxpQkFBaUI7QUFBQSxJQUN0RSxZQUFZLElBQUk7QUFBQSxJQUNoQixvQkFBb0IsQ0FBQyxRQUFRO0FBQzVCLFlBQU0saUJBQWlCLHlCQUF5QixRQUFRLGlCQUFpQixrQkFBa0I7QUFDM0YsWUFBTSx1QkFBdUIsK0JBQStCO0FBQzVELFlBQU0sb0JBQW9CLDRCQUE0QjtBQUN0RCxnQ0FBMEIsR0FBRztBQUs3QixVQUFJLGVBQWUsdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsUUFDdEUsQ0FBQyxrQkFBa0IsMENBQTBDLEdBQUc7QUFBQSxRQUNoRSxDQUFDLGtCQUFrQix3Q0FBd0MsR0FBRztBQUFBLFFBQzlELENBQUMsa0JBQWtCLDBDQUEwQyxHQUFHO0FBQUEsTUFDakUsQ0FBQyxDQUFDO0FBQ0YsVUFBSSxPQUFPLGNBQWMsV0FBVztBQUNwQyxVQUFJLGVBQWUsbUJBQW1CLElBQUksY0FBYyxLQUF3QixFQUFFO0FBQUEsUUFFakYsTUFBZSxxQkFBcUIsVUFBOEQ7QUFDakcsZ0JBQU0sZUFBZSxnQkFBZ0I7QUFDckMsZ0JBQU0sa0JBQWtCLG1CQUFtQjtBQUMzQyxjQUFJLFFBQVEsYUFBYSxTQUFTLFFBQVE7QUFDMUMsY0FBSSxDQUFDLE9BQU87QUFDWCxrQkFBTSxhQUFhLGdCQUFnQixxQ0FBcUMsUUFBUSxLQUFLO0FBQ3JGLGtCQUFNLG9CQUFvQixnQkFBZ0IsV0FBVyxVQUFVO0FBQy9ELG9CQUFRLGFBQWEsWUFBWSxJQUFJLG1CQUFtQixRQUFRO0FBQUEsVUFDakU7QUFDQSxnQkFBTSxnQkFBZ0IsSUFBSSxRQUFjO0FBQ3hDLGdCQUFNLGtCQUE0QztBQUFBLFlBQ2pELGlCQUFpQjtBQUFBLFlBQ2pCLGVBQWUsY0FBYztBQUFBLFlBQzdCLFlBQVksTUFBTTtBQUFBLFlBQ2xCLFlBQVksTUFBTTtBQUFBLFlBQ2xCLFlBQVksTUFBTTtBQUFBLFlBQ2xCLGVBQWUsTUFBTSxNQUFNLGNBQWM7QUFBQSxZQUN6QyxnQkFBZ0IsTUFBTSxNQUFNLGVBQWU7QUFBQSxZQUMzQyxTQUFTLFlBQVk7QUFBQSxZQUFFO0FBQUEsWUFDdkIsU0FBUyxNQUFNLGNBQWMsUUFBUTtBQUFBLFVBQ3RDO0FBQ0EsaUJBQU8sRUFBRSxRQUFRLGlCQUFpQixTQUFTLE1BQU07QUFBQSxVQUFFLEVBQUU7QUFBQSxRQUN0RDtBQUFBLFFBQ1Msb0JBQW9CO0FBQUUsaUJBQU87QUFBQSxRQUFNO0FBQUEsUUFDbkMsbUNBQW1DO0FBQUUsaUJBQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxVQUFFLEVBQUU7QUFBQSxRQUFHO0FBQUEsTUFDOUUsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLHVCQUF1QixvQkFBb0I7QUFDOUQsVUFBSSxlQUFlLG9CQUFvQixpQkFBaUI7QUFDeEQsVUFBSSxlQUFlLHFCQUFxQixJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLFFBQTFDO0FBQUE7QUFDM0MsZUFBa0IscUJBQXFCLGdCQUFnQixDQUFDLENBQUM7QUFBQTtBQUFBLE1BQzFELEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSx1QkFBdUIsSUFBSSxjQUFjLEtBQTRCLEVBQUU7QUFBQSxRQUE1QztBQUFBO0FBQzdDLGVBQWtCLFFBQVEsSUFBSSxjQUFjLEtBQXFDLEVBQUU7QUFBQSxZQUFyRDtBQUFBO0FBQzdCLG1CQUFrQixXQUFXLENBQUM7QUFBQTtBQUFBLFVBQy9CLEVBQUU7QUFBQTtBQUFBLFFBQ08sYUFBYTtBQUFFLGlCQUFPO0FBQUEsUUFBVztBQUFBLE1BQzNDLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxpQkFBaUIseUJBQXlCLGNBQWMsbUJBQW1CLGNBQWMsNEJBQTRCLEtBQUssQ0FBQztBQUM5SSxVQUFJLGVBQWUsa0NBQWtDLElBQUksY0FBYyxLQUF1QyxFQUFFO0FBQUEsUUFBdkQ7QUFBQTtBQUN4RCxlQUFrQixtQkFBbUI7QUFDckMsZUFBa0Isc0JBQXNCO0FBQUEsWUFDdkMsMEJBQTBCO0FBQUEsVUFDM0I7QUFDQSxlQUFrQixvQkFBb0IsZ0JBQWdCLFFBQVEsSUFBSSxLQUFLLFlBQVksQ0FBQztBQUNwRixlQUFrQix5QkFBeUIsZ0JBQWdCLGVBQWUsS0FBSztBQUkvRSxlQUFrQixxQkFBcUI7QUFBQTtBQUFBLFFBSDlCLHVCQUF1QjtBQUFFLGlCQUFPLElBQUksS0FBSyxZQUFZO0FBQUEsUUFBRztBQUFBLFFBQ3hELDJCQUEyQjtBQUFBLFFBQUU7QUFBQSxRQUM3Qix5QkFBeUI7QUFBQSxRQUFFO0FBQUEsUUFFcEMsTUFBZSx3QkFBd0I7QUFBQSxRQUFFO0FBQUEsUUFDaEMseUJBQXlCO0FBQUUsaUJBQU87QUFBQSxRQUFxQjtBQUFBLE1BQ2pFLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSw4QkFBOEIsY0FBYztBQUMvRCxVQUFJLGVBQWUsZ0NBQWdDLHdDQUF3QyxRQUFRLHVCQUF1QixDQUFDO0FBSTNILFVBQUksT0FBTyw0QkFBNEIseUJBQXlCO0FBQ2hFLFVBQUksZUFBZSxzQkFBc0IsSUFBSSxjQUFjLEtBQTJCLEVBQUU7QUFBQSxRQUEzQztBQUFBO0FBQzVDLGVBQWtCLDRCQUE0QixNQUFNO0FBQUE7QUFBQSxRQUNwRCxNQUFlLG9CQUFvQjtBQUFFLGlCQUFPO0FBQUEsUUFBVztBQUFBLFFBQzlDLHdDQUF3QztBQUFFLGlCQUFPLENBQUM7QUFBQSxRQUFHO0FBQUEsUUFDckQsNEJBQTRCO0FBQUUsaUJBQU87QUFBQSxRQUFPO0FBQUEsTUFDdEQsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLG9CQUFvQixJQUFJLGNBQWMsS0FBeUIsRUFBRTtBQUFBLFFBQXpDO0FBQUE7QUFDMUMsZUFBa0IsY0FBYyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2xELGVBQWtCLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUFBO0FBQUEsUUFDbEMsVUFBVTtBQUFFLGlCQUFPLGdCQUFnQixDQUFDLENBQUM7QUFBQSxRQUFHO0FBQUEsTUFDbEQsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLG1CQUFtQixJQUFJLGNBQWMsS0FBd0IsRUFBRTtBQUFBLE1BQUUsRUFBRSxDQUFDO0FBQ3ZGLFVBQUksZUFBZSwwQkFBMEIsSUFBSSxjQUFjLEtBQStCLEVBQUU7QUFBQSxRQUMvRixNQUFlLHVCQUF1QjtBQUFFLGlCQUFPO0FBQUEsUUFBVztBQUFBLE1BQzNELEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxnQkFBZ0IsSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxNQUFFLEVBQUUsQ0FBQztBQUNqRixVQUFJLGVBQWUsc0JBQXNCLElBQUksY0FBYyxLQUEyQixFQUFFO0FBQUEsTUFBRSxFQUFFLENBQUM7QUFDN0YsVUFBSSxlQUFlLDBCQUEwQixJQUFJLGNBQWMsS0FBK0IsRUFBRTtBQUFBLFFBQS9DO0FBQUE7QUFDaEQsZUFBa0IsOEJBQThCLE1BQU07QUFBQTtBQUFBLFFBQzdDLGVBQTJCO0FBQUUsaUJBQU8sRUFBRSxJQUFJLFFBQVEsU0FBUyxDQUFDLEVBQUU7QUFBQSxRQUFHO0FBQUEsUUFDakUsb0JBQW9DO0FBQUUsaUJBQU8sZUFBZTtBQUFBLFFBQVc7QUFBQSxNQUNqRixFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLFFBQW5DO0FBQUE7QUFDcEMsZUFBa0IsbUJBQW1CLE1BQU07QUFBQTtBQUFBLFFBQzNDLE1BQWUsT0FBTyxVQUFlO0FBQ3BDLGlCQUFPLGFBQWEsSUFBSSxRQUFRLEtBQUssZUFBZSxJQUFJLFFBQVE7QUFBQSxRQUNqRTtBQUFBLFFBQ0EsTUFBZSxTQUFTLFVBQWU7QUFDdEMsZ0JBQU0sUUFBUSxhQUFhLElBQUksUUFBUSxLQUFLO0FBQzVDLGlCQUFPLDZCQUE2QixVQUFVLEtBQUs7QUFBQSxRQUNwRDtBQUFBLFFBQ0EsTUFBZSxhQUFhLFVBQWU7QUFDMUMseUJBQWUsSUFBSSxRQUFRO0FBQzNCLGlCQUFPLHNCQUFzQixVQUFVLEdBQUcsSUFBSTtBQUFBLFFBQy9DO0FBQUEsUUFDQSxNQUFlLFVBQVUsVUFBZSxRQUFrQjtBQUN6RCx1QkFBYSxJQUFJLFVBQVUsT0FBTyxTQUFTLENBQUM7QUFDNUMseUJBQWUsSUFBSSxXQUFXLFFBQVEsQ0FBQztBQUN2QyxjQUFJLFNBQVMsS0FBSyxTQUFTLFdBQVcsS0FBSyxDQUFDLGFBQWEsS0FBSyxVQUFRLEtBQUssSUFBSSxTQUFTLE1BQU0sU0FBUyxTQUFTLENBQUMsR0FBRztBQUNuSCxrQkFBTSxZQUFZLFNBQVMsS0FBSyxNQUFNLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSztBQUNyRCx5QkFBYSxLQUFLO0FBQUEsY0FDakIsS0FBSztBQUFBLGNBQ0wsU0FBUyxTQUFTLEtBQUssV0FBVyxhQUFhLElBQUksZUFBZSxRQUFRLGVBQWU7QUFBQSxjQUN6RixNQUFNLFlBQVk7QUFBQSxjQUNsQixNQUFNO0FBQUEsY0FDTixhQUFhLHdCQUF3QixTQUFTO0FBQUEsWUFDL0MsQ0FBQztBQUFBLFVBQ0Y7QUFDQSxzQ0FBNEIsS0FBSztBQUNqQyxpQkFBTyxzQkFBc0IsVUFBVSxPQUFPLFlBQVksS0FBSztBQUFBLFFBQ2hFO0FBQUEsUUFDQSxNQUFlLElBQUksVUFBZTtBQUNqQyx1QkFBYSxPQUFPLFFBQVE7QUFDNUIsZ0JBQU0sWUFBWSxhQUFhLFVBQVUsVUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQzVGLGNBQUksYUFBYSxHQUFHO0FBQ25CLHlCQUFhLE9BQU8sV0FBVyxDQUFDO0FBQUEsVUFDakM7QUFDQSxzQ0FBNEIsS0FBSztBQUFBLFFBQ2xDO0FBQUEsTUFDRCxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLFFBQW5DO0FBQUE7QUFDcEMsZUFBa0IsbUJBQW1CO0FBQUE7QUFBQSxRQUc1QixXQUErQjtBQUFFLGlCQUFPO0FBQUEsUUFBVTtBQUFBLE1BQzVELEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxtQkFBbUIsSUFBSSxjQUFjLEtBQXdCLEVBQUU7QUFBQSxRQUVqRixNQUFlLHFCQUFxQixVQUE4RDtBQUNqRyxnQkFBTSxlQUFlLGdCQUFnQjtBQUNyQyxnQkFBTSxrQkFBa0IsbUJBQW1CO0FBQzNDLGNBQUksUUFBUSxhQUFhLFNBQVMsUUFBUTtBQUMxQyxjQUFJLENBQUMsT0FBTztBQUNYLGtCQUFNLGFBQWEsZ0JBQWdCLHFDQUFxQyxRQUFRLEtBQUs7QUFDckYsa0JBQU0sb0JBQW9CLGdCQUFnQixXQUFXLFVBQVU7QUFDL0Qsb0JBQVEsYUFBYSxZQUFZLGFBQWEsSUFBSSxRQUFRLEtBQUssSUFBSSxtQkFBbUIsUUFBUTtBQUFBLFVBQy9GO0FBQ0EsZ0JBQU0sZ0JBQWdCLElBQUksUUFBYztBQUN4QyxnQkFBTSxrQkFBNEM7QUFBQSxZQUNqRCxpQkFBaUI7QUFBQSxZQUNqQixlQUFlLGNBQWM7QUFBQSxZQUM3QixZQUFZLE1BQU07QUFBQSxZQUNsQixZQUFZLE1BQU07QUFBQSxZQUNsQixZQUFZLE1BQU07QUFBQSxZQUNsQixlQUFlLE1BQU0sTUFBTSxjQUFjO0FBQUEsWUFDekMsZ0JBQWdCLE1BQU0sTUFBTSxlQUFlO0FBQUEsWUFDM0MsU0FBUyxZQUFZO0FBQUEsWUFBRTtBQUFBLFlBQ3ZCLFNBQVMsTUFBTSxjQUFjLFFBQVE7QUFBQSxVQUN0QztBQUNBLGlCQUFPLEVBQUUsUUFBUSxpQkFBaUIsU0FBUyxNQUFNO0FBQUEsVUFBRSxFQUFFO0FBQUEsUUFDdEQ7QUFBQSxRQUNTLG9CQUFvQjtBQUFFLGlCQUFPO0FBQUEsUUFBTTtBQUFBLFFBQ25DLG1DQUFtQztBQUFFLGlCQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsVUFBRSxFQUFFO0FBQUEsUUFBRztBQUFBLE1BQzlFLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxxQkFBcUIsSUFBSSxjQUFjLEtBQTBCLEVBQUU7QUFBQSxRQUExQztBQUFBO0FBQzNDLGVBQWtCLG1CQUFtQixNQUFNO0FBQzNDLGVBQWtCLFlBQVksTUFBTTtBQUFBO0FBQUEsUUFDM0IsUUFBUSxXQUFnQjtBQUFFLGlCQUFPO0FBQUEsUUFBTztBQUFBLE1BQ2xELEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxtQkFBbUIsSUFBSSxjQUFjLEtBQXdCLEVBQUU7QUFBQSxNQUFFLEVBQUUsQ0FBQztBQUN2RixVQUFJLGVBQWUsb0JBQW9CLElBQUksY0FBYyxLQUF5QixFQUFFO0FBQUEsTUFBRSxFQUFFLENBQUM7QUFDekYsVUFBSSxlQUFlLGVBQWUsSUFBSSxjQUFjLEtBQW9CLEVBQUU7QUFBQSxRQUN6RSxNQUFlLFNBQXVCLEtBQWEsUUFBa0I7QUFBRSxpQkFBTztBQUFBLFFBQWtCO0FBQUEsTUFDakcsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLGdCQUFnQixJQUFJLGNBQWMsS0FBcUIsRUFBRTtBQUFBLFFBQzNFLE1BQWUsY0FBYztBQUFBLFFBQUU7QUFBQSxNQUNoQyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsb0JBQW9CLElBQUksY0FBYyxLQUF5QixFQUFFO0FBQUEsUUFDbkYsSUFBYSxvQkFBb0I7QUFBRSxpQkFBTztBQUFBLFFBQVc7QUFBQSxRQUNyRCxNQUFlLFNBQVM7QUFBRSxpQkFBTztBQUFBLFFBQU87QUFBQSxNQUN6QyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsaUJBQWlCLElBQUksY0FBYyxLQUFzQixFQUFFO0FBQUEsTUFBRSxFQUFFLENBQUM7QUFDbkYsVUFBSSxlQUFlLDBCQUEwQixJQUFJLGNBQWMsS0FBK0IsRUFBRTtBQUFBLFFBQ3RGLE9BQU8sVUFBb0M7QUFDbkQsZ0JBQU0sV0FBOEI7QUFBQSxZQUNuQyxTQUFTLHNCQUFzQixPQUFPLGFBQWEsV0FBVyxXQUFXLFNBQVMsS0FBSztBQUFBLFlBQ3ZGLFVBQVU7QUFBQSxZQUFFO0FBQUEsVUFDYjtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLGlCQUFpQixJQUFJLGNBQWMsS0FBc0IsRUFBRTtBQUFBLE1BQUUsRUFBRSxDQUFDO0FBQ25GLFVBQUksZUFBZSxzQkFBc0IsSUFBSSxjQUFjLEtBQTJCLEVBQUU7QUFBQSxRQUEzQztBQUFBO0FBQzVDLGVBQWtCLFdBQVcsTUFBTTtBQUNuQyxlQUFrQixVQUFVLE1BQU07QUFDbEMsZUFBa0IsUUFBUTtBQUFBO0FBQUEsUUFDMUIsTUFBZSxhQUFhO0FBQUUsaUJBQU87QUFBQSxRQUFlO0FBQUEsUUFDM0MsYUFBYTtBQUFFLGlCQUFPO0FBQUEsUUFBZTtBQUFBLE1BQy9DLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxhQUFhLElBQUksY0FBYyxLQUFrQixFQUFFO0FBQUEsUUFBbEM7QUFBQTtBQUNuQyxlQUFrQixVQUFVLGdCQUFnQixpQkFBNEI7QUFBQTtBQUFBLE1BQ3pFLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxjQUFjLElBQUksY0FBYyxLQUFtQixFQUFFO0FBQUEsUUFBbkM7QUFBQTtBQUNwQyxlQUFrQixjQUFjLGdCQUFnQixDQUFDLENBQUM7QUFDbEQsZUFBa0IsWUFBWSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2hELGVBQWtCLG9CQUFvQixNQUFNO0FBQUE7QUFBQSxNQUM3QyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUscUJBQXFCLElBQUksY0FBYyxLQUEwQixFQUFFO0FBQUEsUUFBMUM7QUFBQTtBQUMzQyxlQUFrQixVQUFVLGdCQUFnQixnQkFBZ0I7QUFDNUQsZUFBa0Isa0JBQWtCO0FBQUE7QUFBQSxNQUNyQyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsMkJBQTJCLElBQUksY0FBYyxLQUFnQyxFQUFFO0FBQUEsUUFBaEQ7QUFBQTtBQUNqRCxlQUFrQixtQkFBbUIsZ0JBQWdCLENBQUMsQ0FBQztBQUN2RCxlQUFrQiwwQkFBMEIsTUFBTTtBQUFBO0FBQUEsTUFDbkQsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLHVCQUF1QixJQUFJLGNBQWMsS0FBNEIsRUFBRTtBQUFBLE1BQUUsRUFBRSxDQUFDO0FBQy9GLFVBQUksZUFBZSxpQkFBaUIsSUFBSSxjQUFjLEtBQXNCLEVBQUU7QUFBQSxRQUF0QztBQUFBO0FBQ3ZDLGVBQWtCLG1CQUFtQixJQUFJLGNBQWMsS0FBdUQsRUFBRTtBQUFBLFlBQXZFO0FBQUE7QUFDeEMsbUJBQWtCLGtCQUFrQjtBQUFBO0FBQUEsVUFDckMsRUFBRTtBQUFBO0FBQUEsTUFDSCxFQUFFLENBQUM7QUFBQSxJQUNKO0FBQUEsRUFDRCxDQUFDO0FBRUQsa0JBQWdCLFFBQVEscUJBQXFCLElBQUksYUFBYTtBQUM5RCxxQkFBbUIsUUFBUSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDcEUsYUFBVyxDQUFDLEtBQUssT0FBTyxLQUFLLGNBQWM7QUFDMUMsUUFBSSxDQUFDLGdCQUFnQixNQUFNLFNBQVMsR0FBRyxHQUFHO0FBQ3pDLFlBQU0sUUFBUSxnQkFBZ0IsTUFBTSxZQUFZLFNBQVMsTUFBTSxLQUFLLEtBQUs7QUFDekUsVUFBSSxnQkFBZ0IsSUFBSSxFQUFFLFNBQVMsTUFBTSxNQUFNLFFBQVEsRUFBRSxDQUFDO0FBQUEsSUFDM0Q7QUFBQSxFQUNEO0FBRUEsUUFBTSxTQUFTLElBQUksZ0JBQWdCO0FBQUEsSUFDbEMscUJBQXFCLGVBQWUsaUNBQWlDLHNCQUFzQixDQUFDO0FBQUEsRUFDN0Y7QUFDQSxTQUFPLE9BQU8sSUFBSSxTQUFTO0FBQzNCLFNBQU8sT0FBTyxJQUFJLFVBQVUsT0FBTyxNQUFNLENBQUM7QUFFMUMsUUFBTSxjQUFjLElBQUksZ0JBQWdCLElBQUkscUNBQXFDLFlBQVksQ0FBQztBQUM5RixRQUFNLE9BQU8sU0FBUyxhQUFhLFFBQVcsQ0FBQyxHQUFHLGtCQUFrQixJQUFJO0FBRXhFLE1BQUksUUFBUSxpQkFBaUI7QUFDNUIsV0FBTyxrQkFBa0IsUUFBUSxlQUFlO0FBQUEsRUFDakQ7QUFFQSxNQUFJLFFBQVEsZ0JBQWdCO0FBQzNCLFdBQU8sZUFBZTtBQUFBLEVBQ3ZCO0FBRUEsTUFBSSxRQUFRLG1CQUFtQjtBQUM5QixXQUFPLCtCQUErQixRQUFRLGlCQUFpQjtBQUFBLEVBQ2hFO0FBRUEsTUFBSSxRQUFRLGVBQWU7QUFDMUIsVUFBTSxpQkFBaUIsQ0FBQyxHQUFHLElBQUksVUFBVSxpQkFBaUIsK0VBQStFLENBQUMsRUFDeEksS0FBSyxVQUFRLGdCQUFnQixlQUFlLEtBQUssTUFBTSxZQUFZLE1BQU07QUFDM0UsVUFBTSxnQkFBZ0IsUUFBUTtBQUM5QixVQUFNLFlBQVksZ0JBQ2YsQ0FBQyxHQUFJLGdCQUFnQixpQkFBaUIsa0JBQWtCLEtBQUssQ0FBQyxDQUFFLEVBQUUsS0FBSyxDQUFDLFFBQTRCLGVBQWUsZUFBZSxJQUFJLGFBQWEsU0FBUyxhQUFhLENBQUMsSUFDMUssZ0JBQWdCLGNBQWMsK0VBQStFO0FBQ2hILFFBQUksV0FBVztBQUNkLGdCQUFVLGNBQWMsSUFBSSxhQUFhLGVBQWUsRUFBRSxTQUFTLE1BQU0sUUFBUSxFQUFFLENBQUMsQ0FBQztBQUNyRixnQkFBVSxjQUFjLElBQUksV0FBVyxhQUFhLEVBQUUsU0FBUyxNQUFNLFFBQVEsRUFBRSxDQUFDLENBQUM7QUFDakYsZ0JBQVUsY0FBYyxJQUFJLFdBQVcsV0FBVyxFQUFFLFNBQVMsTUFBTSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQy9FLGdCQUFVLGNBQWMsSUFBSSxXQUFXLFNBQVMsRUFBRSxTQUFTLE1BQU0sUUFBUSxFQUFFLENBQUMsQ0FBQztBQUU3RSxVQUFJLFFBQVEsc0JBQXNCLE9BQU87QUFDeEMsY0FBTSxhQUFhLElBQUksVUFBVSxjQUFjLHFCQUFxQjtBQUNwRSxvQkFBWSxNQUFNO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBTUEsU0FBUyxrQkFBa0IsSUFBWSxPQUFlLGFBQXFCLFdBQXdDO0FBQ2xILFFBQU0sY0FBYyxJQUFJLGNBQWMsS0FBa0QsRUFBRTtBQUFBLEVBQUUsRUFBRTtBQUM5RixTQUFPLElBQUksY0FBYyxLQUEwQixFQUFFO0FBQUEsSUFBMUM7QUFBQTtBQUNWLFdBQWtCLEtBQUs7QUFDdkIsV0FBa0IsT0FBTztBQUN6QixXQUFrQixRQUFRO0FBQzFCLFdBQWtCLGNBQWM7QUFDaEMsV0FBa0IsdUJBQXVCO0FBQ3pDLFdBQWtCLGVBQWUsc0JBQXNCO0FBQ3ZELFdBQWtCLFVBQVU7QUFDNUIsV0FBa0IsUUFBUTtBQUFBO0FBQUEsRUFDM0IsRUFBRTtBQUNIO0FBRUEsTUFBTSxpQkFBaUI7QUFBQSxFQUN0QixrQkFBa0Isb0JBQW9CLGNBQWMsc0VBQXNFLFdBQVc7QUFBQSxFQUNySSxrQkFBa0Isa0JBQWtCLFVBQVUsaUVBQWlFLFFBQVE7QUFBQSxFQUN2SCxrQkFBa0IsaUJBQWlCLFNBQVMsZ0VBQWdFLG9CQUFvQjtBQUFBLEVBQ2hJLGtCQUFrQixrQkFBa0IsVUFBVSx1REFBdUQsWUFBWTtBQUFBLEVBQ2pILGtCQUFrQixzQkFBc0IsY0FBYyx5REFBeUQsV0FBVztBQUFBLEVBQzFILGtCQUFrQixpQkFBaUIsZ0JBQWdCLHdEQUF3RCxnQkFBZ0I7QUFBQSxFQUMzSCxrQkFBa0IscUJBQXFCLGFBQWEscUVBQXFFLFFBQVE7QUFBQSxFQUNqSSxrQkFBa0Isa0JBQWtCLFVBQVUsOERBQThELFdBQVc7QUFBQSxFQUN2SCxrQkFBa0IsaUJBQWlCLFNBQVMsNkRBQTZELFdBQVc7QUFBQSxFQUNwSCxrQkFBa0Isa0JBQWtCLFVBQVUsNkRBQTZELFFBQVE7QUFBQSxFQUNuSCxrQkFBa0Isa0JBQWtCLFVBQVUsNkRBQTZELFdBQVc7QUFBQSxFQUN0SCxrQkFBa0IsaUJBQWlCLFNBQVMsc0RBQXNELFdBQVc7QUFDOUc7QUFFQSxlQUFlLG9CQUFvQixLQUE2QztBQUMvRSxRQUFNLFFBQVE7QUFDZCxRQUFNLFNBQVM7QUFDZixNQUFJLFVBQVUsTUFBTSxRQUFRLEdBQUcsS0FBSztBQUNwQyxNQUFJLFVBQVUsTUFBTSxTQUFTLEdBQUcsTUFBTTtBQUV0QyxRQUFNLHVCQUF1QixxQkFBcUIsSUFBSSxpQkFBaUI7QUFBQSxJQUN0RSxZQUFZLElBQUk7QUFBQSxJQUNoQixvQkFBb0IsQ0FBQyxRQUFRO0FBQzVCLGdDQUEwQixHQUFHO0FBQzdCLFVBQUksT0FBTyxjQUFjLFdBQVc7QUFDcEMsVUFBSSxlQUFlLHNCQUFzQixJQUFJLGNBQWMsS0FBMkIsRUFBRTtBQUFBLFFBQTNDO0FBQUE7QUFDNUMsZUFBa0IsV0FBVyxNQUFNO0FBQ25DLGVBQWtCLFVBQVUsTUFBTTtBQUNsQyxlQUFrQixRQUErQixDQUFDO0FBQUE7QUFBQSxRQUNsRCxNQUFlLGFBQWE7QUFBRSxpQkFBTyxDQUFDO0FBQUEsUUFBRztBQUFBLFFBQ2hDLGFBQWE7QUFBRSxpQkFBTztBQUFBLFFBQWU7QUFBQSxRQUM5QyxNQUFlLGVBQThEO0FBQzVFLGlCQUFPO0FBQUEsWUFDTixXQUFXLEVBQUUsT0FBTyxnQkFBZ0IsU0FBUyxNQUFNO0FBQUEsWUFDbkQsTUFBTSxjQUFjO0FBQUUscUJBQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLE1BQU07QUFBQSxZQUFHO0FBQUEsVUFDN0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsYUFBYSxJQUFJLGNBQWMsS0FBa0IsRUFBRTtBQUFBLFFBQWxDO0FBQUE7QUFDbkMsZUFBa0IsVUFBVSxnQkFBZ0IsQ0FBQyxDQUFZO0FBQUE7QUFBQSxNQUMxRCxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLFFBQW5DO0FBQUE7QUFDcEMsZUFBa0IsY0FBYyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2xELGVBQWtCLFlBQVksZ0JBQWdCLENBQUMsQ0FBQztBQUNoRCxlQUFrQixvQkFBb0IsTUFBTTtBQUFBO0FBQUEsTUFDN0MsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLHFCQUFxQixJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLFFBQTFDO0FBQUE7QUFDM0MsZUFBa0IsVUFBVSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUE7QUFBQSxNQUMvQyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsZ0JBQWdCLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsTUFBRSxFQUFFLENBQUM7QUFDakYsVUFBSSxlQUFlLGtDQUFrQyxJQUFJLGNBQWMsS0FBdUMsRUFBRTtBQUFBLFFBQXZEO0FBQUE7QUFDeEQsZUFBa0IsbUJBQW1CO0FBQ3JDLGVBQWtCLHNCQUFzQjtBQUFBLFlBQ3ZDLDBCQUEwQjtBQUFBLFVBQzNCO0FBQ0EsZUFBa0Isb0JBQW9CLGdCQUFnQixRQUFRLElBQUksS0FBSyxZQUFZLENBQUM7QUFDcEYsZUFBa0IseUJBQXlCLGdCQUFnQixlQUFlLEtBQUs7QUFBQTtBQUFBLFFBQ3RFLHVCQUF1QjtBQUFFLGlCQUFPLElBQUksS0FBSyxZQUFZO0FBQUEsUUFBRztBQUFBLE1BQ2xFLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSw4QkFBOEIsSUFBSSxjQUFjLEtBQW1DLEVBQUU7QUFBQSxRQUFuRDtBQUFBO0FBQ3BELGVBQWtCLHdCQUF3QixnQkFBcUIseUJBQXlCLG9CQUFvQixpQkFBaUIsQ0FBQztBQUM5SCxlQUFrQixnQkFBZ0IsUUFBUSxZQUFVLG1CQUFtQixLQUFLLHNCQUFzQixLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUE7QUFBQSxRQUN0RyxzQkFBc0I7QUFBRSxpQkFBTyw4QkFBOEI7QUFBQSxRQUFHO0FBQUEsUUFDaEUsMEJBQTBCO0FBQUUsaUJBQU8sRUFBRSxVQUFVO0FBQUEsVUFBRSxFQUFFO0FBQUEsUUFBRztBQUFBLE1BQ2hFLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxnQ0FBZ0Msd0NBQXdDLENBQUM7QUFDNUYsVUFBSSxlQUFlLGdCQUFnQixJQUFJLGNBQWMsS0FBcUIsRUFBRTtBQUFBLFFBQzNFLE1BQWUsY0FBYztBQUFBLFFBQUU7QUFBQSxNQUNoQyxFQUFFLENBQUM7QUFBQSxJQUNKO0FBQUEsRUFDRCxDQUFDO0FBRUQsUUFBTSxTQUFTLElBQUksZ0JBQWdCO0FBQUEsSUFDbEMscUJBQXFCLGVBQWUsYUFBYTtBQUFBLEVBQ2xEO0FBQ0EsTUFBSSxVQUFVLFlBQVksT0FBTyxPQUFPO0FBQ3hDLFNBQU8sT0FBTyxRQUFRLEtBQUs7QUFHM0IsUUFBTSxlQUFlLE9BQU8sUUFBUSxjQUFjLGtCQUFrQjtBQUNwRSxnQkFBYyxNQUFNO0FBR3BCLFFBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLEVBQUUsQ0FBQztBQUNyRDtBQU1BLFNBQVMsb0JBQW9CLE1BQWMsS0FBVSxTQUFnQztBQUNwRixTQUFPLElBQUksY0FBYyxLQUFtQixFQUFFO0FBQUEsSUFBbkM7QUFBQTtBQUNWLFdBQWtCLE1BQU07QUFDeEIsV0FBa0IsU0FBUyxhQUFhO0FBQ3hDLFdBQWtCLFFBQVE7QUFDMUIsV0FBa0IsYUFBYSxnQkFBZ0IsVUFBVSw0QkFBNEIsaUJBQWlCLDRCQUE0QixlQUFlO0FBQ2pKLFdBQWtCLFFBQVEsZ0JBQWdCLENBQUMsQ0FBQztBQUM1QyxXQUFrQixXQUFXLGdCQUFnQixDQUFDLENBQUM7QUFDL0MsV0FBa0IsU0FBUyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzdDLFdBQWtCLFNBQVMsZ0JBQWdCLENBQUMsQ0FBQztBQUM3QyxXQUFrQixlQUFlLGdCQUFnQixDQUFDLENBQUM7QUFDbkQsV0FBa0IsdUJBQXVCLGdCQUFnQixDQUFDLENBQUM7QUFBQTtBQUFBLElBQ2xELFNBQVM7QUFBQSxJQUFFO0FBQUEsRUFDckIsRUFBRTtBQUNIO0FBRUEsTUFBTSxtQkFBbUM7QUFBQSxFQUN4QyxvQkFBb0IsVUFBVSxJQUFJLEtBQUssb0NBQW9DLEdBQUcsSUFBSTtBQUFBLEVBQ2xGLG9CQUFvQixVQUFVLElBQUksS0FBSyxvQ0FBb0MsR0FBRyxJQUFJO0FBQUEsRUFDbEYsb0JBQW9CLFdBQVcsSUFBSSxLQUFLLHFDQUFxQyxHQUFHLElBQUk7QUFBQSxFQUNwRixvQkFBb0IsVUFBVSxJQUFJLEtBQUssb0NBQW9DLEdBQUcsSUFBSTtBQUFBLEVBQ2xGLG9CQUFvQixjQUFjLElBQUksS0FBSyx3Q0FBd0MsR0FBRyxJQUFJO0FBQUEsRUFDMUYsb0JBQW9CLGFBQWEsSUFBSSxLQUFLLHVDQUF1QyxHQUFHLEtBQUs7QUFBQSxFQUN6RixvQkFBb0IsZ0JBQWdCLElBQUksS0FBSywwQ0FBMEMsR0FBRyxJQUFJO0FBQUEsRUFDOUYsb0JBQW9CLFlBQVksSUFBSSxLQUFLLHNDQUFzQyxHQUFHLElBQUk7QUFBQSxFQUN0RixvQkFBb0IsVUFBVSxJQUFJLEtBQUssb0NBQW9DLEdBQUcsS0FBSztBQUFBLEVBQ25GLG9CQUFvQixZQUFZLElBQUksS0FBSyxzQ0FBc0MsR0FBRyxJQUFJO0FBQ3ZGO0FBRUEsU0FBUyxzQkFBc0IsTUFBYyxhQUFxQixNQUFrQztBQUNuRyxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLFNBQVM7QUFBQSxJQUNULFFBQVE7QUFBQSxJQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxXQUFXLElBQUksR0FBRztBQUFBLElBQzNFLGFBQWE7QUFBQSxJQUNiLHNCQUFzQixFQUFFLFVBQVUsV0FBVyxJQUFJLElBQUksY0FBYyxNQUFNLFVBQVUsOEJBQThCLElBQUksUUFBUSxhQUFhLGtCQUFrQixJQUFJLElBQUksZUFBZSxDQUFDLFdBQVcsSUFBSSxHQUFHLE1BQU0seUJBQXlCLGdCQUFnQjtBQUFBLElBQ3JQLGlCQUFpQixnQkFBZ0I7QUFBQSxFQUNsQztBQUNEO0FBRUEsTUFBTSxxQkFBMkM7QUFBQSxFQUNoRCxzQkFBc0IsVUFBVSxxREFBcUQsZUFBZTtBQUFBLEVBQ3BHLHNCQUFzQixVQUFVLDRDQUE0QyxlQUFlO0FBQUEsRUFDM0Ysc0JBQXNCLFdBQVcsMkNBQTJDLGdCQUFnQjtBQUFBLEVBQzVGLHNCQUFzQixVQUFVLCtDQUErQyxlQUFlO0FBQUEsRUFDOUYsc0JBQXNCLFNBQVMsNkNBQTZDLGNBQWM7QUFBQSxFQUMxRixzQkFBc0IsVUFBVSw2Q0FBNkMsZUFBZTtBQUFBLEVBQzVGLHNCQUFzQixVQUFVLHdDQUF3QyxlQUFlO0FBQUEsRUFDdkYsc0JBQXNCLFNBQVMsa0NBQWtDLGNBQWM7QUFBQSxFQUMvRSxzQkFBc0IsV0FBVyx3Q0FBd0MsZ0JBQWdCO0FBQUEsRUFDekYsc0JBQXNCLGdCQUFnQiwrQ0FBK0MscUJBQXFCO0FBQUEsRUFDMUcsc0JBQXNCLGVBQWUsd0NBQXdDLG9CQUFvQjtBQUFBLEVBQ2pHLHNCQUFzQixVQUFVLHVDQUF1QyxlQUFlO0FBQ3ZGO0FBRUEsZUFBZSx1QkFBdUIsS0FBNkM7QUFDbEYsUUFBTSxRQUFRO0FBQ2QsUUFBTSxTQUFTO0FBQ2YsTUFBSSxVQUFVLE1BQU0sUUFBUSxHQUFHLEtBQUs7QUFDcEMsTUFBSSxVQUFVLE1BQU0sU0FBUyxHQUFHLE1BQU07QUFJdEMsUUFBTSx5QkFBeUI7QUFBQSxJQUM5QixvQkFBb0IsVUFBVSxJQUFJLEtBQUssdURBQXVELEdBQUcsSUFBSTtBQUFBLElBQ3JHLG9CQUFvQixVQUFVLElBQUksS0FBSyx1REFBdUQsR0FBRyxJQUFJO0FBQUEsSUFDckcsb0JBQW9CLFdBQVcsSUFBSSxLQUFLLHdEQUF3RCxHQUFHLEtBQUs7QUFBQSxFQUN6RztBQUdBLFFBQU0sb0JBQW9CLG9CQUFJLElBQWlCO0FBQUEsSUFDOUMsQ0FBQyx5QkFBeUIsSUFBSSxLQUFLLHVEQUF1RCxDQUFDO0FBQUEsSUFDM0YsQ0FBQyx5QkFBeUIsSUFBSSxLQUFLLHVEQUF1RCxDQUFDO0FBQUEsSUFDM0YsQ0FBQywwQkFBMEIsSUFBSSxLQUFLLHdEQUF3RCxDQUFDO0FBQUEsRUFDOUYsQ0FBQztBQUVELFFBQU0sdUJBQXVCLHFCQUFxQixJQUFJLGlCQUFpQjtBQUFBLElBQ3RFLFlBQVksSUFBSTtBQUFBLElBQ2hCLG9CQUFvQixDQUFDLFFBQVE7QUFDNUIsZ0NBQTBCLEdBQUc7QUFDN0IsVUFBSSxPQUFPLGNBQWMsV0FBVztBQUNwQyxVQUFJLGVBQWUsOEJBQThCLElBQUksY0FBYyxLQUFtQyxFQUFFO0FBQUEsUUFBbkQ7QUFBQTtBQUNwRCxlQUFrQix3QkFBd0IsZ0JBQXFCLHlCQUF5QixvQkFBb0IsaUJBQWlCLENBQUM7QUFDOUgsZUFBa0IsZ0JBQWdCLFFBQVEsWUFBVSxtQkFBbUIsS0FBSyxzQkFBc0IsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBO0FBQUEsUUFDdEcsc0JBQXNCO0FBQUUsaUJBQU8sOEJBQThCO0FBQUEsUUFBRztBQUFBLFFBQ2hFLDBCQUEwQjtBQUFFLGlCQUFPLEVBQUUsVUFBVTtBQUFBLFVBQUUsRUFBRTtBQUFBLFFBQUc7QUFBQSxNQUNoRSxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUscUJBQXFCLElBQUksY0FBYyxLQUEwQixFQUFFO0FBQUEsUUFBMUM7QUFBQTtBQUMzQyxlQUFrQixVQUFVLGdCQUFnQixzQkFBaUQ7QUFDN0YsZUFBa0Isa0JBQWtCO0FBQUE7QUFBQSxNQUNyQyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsMkJBQTJCLElBQUksY0FBYyxLQUFnQyxFQUFFO0FBQUEsUUFBaEQ7QUFBQTtBQUNqRCxlQUFrQixtQkFBbUIsZ0JBQWdCLENBQUMsQ0FBQztBQUN2RCxlQUFrQiwwQkFBMEIsTUFBTTtBQUFBO0FBQUEsUUFDbEQsTUFBZSwwQkFBMEI7QUFBRSxpQkFBTztBQUFBLFFBQW9CO0FBQUEsTUFDdkUsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLHVCQUF1QixJQUFJLGNBQWMsS0FBNEIsRUFBRTtBQUFBLFFBQ2hGLG9CQUFvQixRQUE0QjtBQUN4RCxnQkFBTSxPQUFPLE9BQU8saUJBQWlCLFNBQVMsaUJBQWlCLFNBQVMsT0FBTyxpQkFBaUIsT0FBTztBQUN2RyxpQkFBTyxPQUFRLGtCQUFrQixJQUFJLElBQUksS0FBSyxJQUFJLEtBQUssV0FBVyxJQUFLLElBQUksS0FBSyxXQUFXO0FBQUEsUUFDNUY7QUFBQSxNQUNELEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSw0QkFBNEIsb0NBQW9DLENBQUM7QUFBQSxJQUNyRjtBQUFBLEVBQ0QsQ0FBQztBQUVELFFBQU0sU0FBUyxJQUFJLGdCQUFnQjtBQUFBLElBQ2xDLHFCQUFxQixlQUFlLGdCQUFnQjtBQUFBLEVBQ3JEO0FBQ0EsTUFBSSxVQUFVLFlBQVksT0FBTyxPQUFPO0FBQ3hDLFNBQU8sT0FBTyxRQUFRLEtBQUs7QUFHM0IsUUFBTSxlQUFlLE9BQU8sUUFBUSxjQUFjLGtCQUFrQjtBQUNwRSxnQkFBYyxNQUFNO0FBSXBCLFFBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLEdBQUcsQ0FBQztBQUVyRCxFQUFDLE9BQU8sUUFBUSxjQUFjLE9BQU8sR0FBbUIsS0FBSztBQUU3RCxhQUFXLGFBQWEsT0FBTyxRQUFRLGlCQUE4QixZQUFZLEdBQUc7QUFDbkYsY0FBVSxNQUFNLGFBQWE7QUFBQSxFQUM5QjtBQUNBLFFBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLEdBQUcsQ0FBQztBQUN0RDtBQU1BLFNBQVMsNEJBQTRCLEtBQWEsZUFBd0IsVUFBMEM7QUFDbkgsU0FBTyxJQUFJLGNBQWMsS0FBNEIsRUFBRTtBQUFBLElBQTVDO0FBQUE7QUFDVixXQUFrQiwyQkFBMkIsTUFBTTtBQUFBO0FBQUEsSUFDMUMsU0FBWSxNQUF3QixPQUFtQjtBQUMvRCxZQUFNLElBQUksT0FBTyxTQUFTLFdBQVcsT0FBTztBQUM1QyxhQUFRLE1BQU0sTUFBTSxnQkFBZ0I7QUFBQSxJQUNyQztBQUFBLElBQ1MsUUFBVyxHQUFtQztBQUN0RCxVQUFJLE1BQU0sS0FBSztBQUNkLGVBQU8sRUFBRSxPQUFPLFFBQVcsY0FBYyxPQUFVO0FBQUEsTUFDcEQ7QUFDQSxhQUFPO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxjQUFjO0FBQUEsUUFDZCxhQUFhLFdBQVksZ0JBQXNCO0FBQUEsTUFDaEQ7QUFBQSxJQUNEO0FBQUEsRUFDRCxFQUFFO0FBQ0g7QUFFQSxTQUFTLGtCQUFrQixLQUE4QixVQUF5QjtBQUNqRixRQUFNLFFBQVE7QUFDZCxRQUFNLFNBQVM7QUFDZixNQUFJLFVBQVUsTUFBTSxRQUFRLEdBQUcsS0FBSztBQUNwQyxNQUFJLFVBQVUsTUFBTSxTQUFTLEdBQUcsTUFBTTtBQUV0QyxRQUFNLHVCQUF1QixxQkFBcUIsSUFBSSxpQkFBaUI7QUFBQSxJQUN0RSxZQUFZLElBQUk7QUFBQSxJQUNoQixvQkFBb0IsQ0FBQyxRQUFRO0FBQzVCLGdDQUEwQixHQUFHO0FBQzdCLFVBQUksT0FBTyxjQUFjLFdBQVc7QUFDcEMsVUFBSSxlQUFlLHVCQUF1Qiw0QkFBNEIsaUJBQWlCLGVBQWUsTUFBTSxRQUFRLENBQUM7QUFDckgsVUFBSSxlQUFlLHNCQUFzQixJQUFJLGNBQWMsS0FBMkIsRUFBRTtBQUFBLFFBQTNDO0FBQUE7QUFDNUMsZUFBa0IsV0FBVyxNQUFNO0FBQ25DLGVBQWtCLFVBQVUsTUFBTTtBQUNsQyxlQUFrQixRQUErQixDQUFDO0FBQUE7QUFBQSxNQUNuRCxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsYUFBYSxJQUFJLGNBQWMsS0FBa0IsRUFBRTtBQUFBLFFBQWxDO0FBQUE7QUFDbkMsZUFBa0IsVUFBVSxnQkFBZ0IsQ0FBQyxDQUFZO0FBQUE7QUFBQSxNQUMxRCxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLFFBQW5DO0FBQUE7QUFDcEMsZUFBa0IsY0FBYyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2xELGVBQWtCLFlBQVksZ0JBQWdCLENBQUMsQ0FBQztBQUNoRCxlQUFrQixvQkFBb0IsTUFBTTtBQUFBO0FBQUEsTUFDN0MsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLHFCQUFxQixJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLFFBQTFDO0FBQUE7QUFDM0MsZUFBa0IsVUFBVSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUE7QUFBQSxNQUMvQyxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsZ0JBQWdCLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsTUFBRSxFQUFFLENBQUM7QUFDakYsVUFBSSxlQUFlLGtDQUFrQyxJQUFJLGNBQWMsS0FBdUMsRUFBRTtBQUFBLFFBQXZEO0FBQUE7QUFDeEQsZUFBa0IsbUJBQW1CO0FBQ3JDLGVBQWtCLHNCQUFzQixFQUFFLDBCQUEwQixLQUFLO0FBQ3pFLGVBQWtCLG9CQUFvQixnQkFBZ0IsUUFBUSxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQ3BGLGVBQWtCLHlCQUF5QixnQkFBZ0IsZUFBZSxLQUFLO0FBQUE7QUFBQSxRQUN0RSx1QkFBdUI7QUFBRSxpQkFBTyxJQUFJLEtBQUssWUFBWTtBQUFBLFFBQUc7QUFBQSxNQUNsRSxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsOEJBQThCLElBQUksY0FBYyxLQUFtQyxFQUFFO0FBQUEsUUFBbkQ7QUFBQTtBQUNwRCxlQUFrQix3QkFBd0IsZ0JBQXFCLHlCQUF5QixvQkFBb0IsaUJBQWlCLENBQUM7QUFDOUgsZUFBa0IsZ0JBQWdCLFFBQVEsWUFBVSxtQkFBbUIsS0FBSyxzQkFBc0IsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBO0FBQUEsUUFDdEcsc0JBQXNCO0FBQUUsaUJBQU8sOEJBQThCO0FBQUEsUUFBRztBQUFBLFFBQ2hFLDBCQUEwQjtBQUFFLGlCQUFPLEVBQUUsVUFBVTtBQUFBLFVBQUUsRUFBRTtBQUFBLFFBQUc7QUFBQSxNQUNoRSxFQUFFLENBQUM7QUFDSCxVQUFJLGVBQWUsZ0NBQWdDLHdDQUF3QyxDQUFDO0FBQzVGLFVBQUksZUFBZSxnQkFBZ0IsSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxRQUMzRSxNQUFlLGNBQWM7QUFBQSxRQUFFO0FBQUEsTUFDaEMsRUFBRSxDQUFDO0FBQUEsSUFDSjtBQUFBLEVBQ0QsQ0FBQztBQUVELFFBQU0sU0FBUyxJQUFJLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLGFBQWEsQ0FBQztBQUN6RixNQUFJLFVBQVUsWUFBWSxPQUFPLE9BQU87QUFDeEMsU0FBTyxPQUFPLFFBQVEsS0FBSztBQUM1QjtBQUVBLFNBQVMscUJBQXFCLEtBQThCLFVBQXlCO0FBQ3BGLFFBQU0sUUFBUTtBQUNkLFFBQU0sU0FBUztBQUNmLE1BQUksVUFBVSxNQUFNLFFBQVEsR0FBRyxLQUFLO0FBQ3BDLE1BQUksVUFBVSxNQUFNLFNBQVMsR0FBRyxNQUFNO0FBRXRDLFFBQU0sdUJBQXVCLHFCQUFxQixJQUFJLGlCQUFpQjtBQUFBLElBQ3RFLFlBQVksSUFBSTtBQUFBLElBQ2hCLG9CQUFvQixDQUFDLFFBQVE7QUFDNUIsZ0NBQTBCLEdBQUc7QUFDN0IsVUFBSSxPQUFPLGNBQWMsV0FBVztBQUNwQyxVQUFJLGVBQWUsdUJBQXVCLDRCQUE0QixrQkFBa0IsZ0JBQWdCLE9BQU8sUUFBUSxDQUFDO0FBQ3hILFVBQUksZUFBZSw4QkFBOEIsSUFBSSxjQUFjLEtBQW1DLEVBQUU7QUFBQSxRQUFuRDtBQUFBO0FBQ3BELGVBQWtCLHdCQUF3QixnQkFBcUIseUJBQXlCLG9CQUFvQixpQkFBaUIsQ0FBQztBQUM5SCxlQUFrQixnQkFBZ0IsUUFBUSxZQUFVLG1CQUFtQixLQUFLLHNCQUFzQixLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUE7QUFBQSxRQUN0RyxzQkFBc0I7QUFBRSxpQkFBTyw4QkFBOEI7QUFBQSxRQUFHO0FBQUEsUUFDaEUsMEJBQTBCO0FBQUUsaUJBQU8sRUFBRSxVQUFVO0FBQUEsVUFBRSxFQUFFO0FBQUEsUUFBRztBQUFBLE1BQ2hFLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSxxQkFBcUIsSUFBSSxjQUFjLEtBQTBCLEVBQUU7QUFBQSxRQUExQztBQUFBO0FBQzNDLGVBQWtCLFVBQVUsZ0JBQWdCLENBQUMsQ0FBQztBQUM5QyxlQUFrQixrQkFBa0I7QUFBQTtBQUFBLE1BQ3JDLEVBQUUsQ0FBQztBQUNILFVBQUksZUFBZSwyQkFBMkIsSUFBSSxjQUFjLEtBQWdDLEVBQUU7QUFBQSxRQUFoRDtBQUFBO0FBQ2pELGVBQWtCLG1CQUFtQixnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3ZELGVBQWtCLDBCQUEwQixNQUFNO0FBQUE7QUFBQSxRQUNsRCxNQUFlLDBCQUEwQjtBQUFFLGlCQUFPLENBQUM7QUFBQSxRQUFHO0FBQUEsTUFDdkQsRUFBRSxDQUFDO0FBQ0gsVUFBSSxlQUFlLHVCQUF1QixJQUFJLGNBQWMsS0FBNEIsRUFBRTtBQUFBLE1BQUUsRUFBRSxDQUFDO0FBQy9GLFVBQUksZUFBZSw0QkFBNEIsb0NBQW9DLENBQUM7QUFBQSxJQUNyRjtBQUFBLEVBQ0QsQ0FBQztBQUVELFFBQU0sU0FBUyxJQUFJLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLGdCQUFnQixDQUFDO0FBQzVGLE1BQUksVUFBVSxZQUFZLE9BQU8sT0FBTztBQUN4QyxTQUFPLE9BQU8sUUFBUSxLQUFLO0FBQzVCO0FBTUEsU0FBUyx3QkFBd0IsS0FBOEIsUUFBK0M7QUFDN0csUUFBTSxRQUFRO0FBQ2QsUUFBTSxTQUFTO0FBQ2YsTUFBSSxVQUFVLE1BQU0sUUFBUSxHQUFHLEtBQUs7QUFDcEMsTUFBSSxVQUFVLE1BQU0sU0FBUyxHQUFHLE1BQU07QUFFdEMsUUFBTSx1QkFBdUIscUJBQXFCLElBQUksaUJBQWlCO0FBQUEsSUFDdEUsWUFBWSxJQUFJO0FBQUEsSUFDaEIsb0JBQW9CLENBQUMsUUFBUTtBQUM1QixnQ0FBMEIsR0FBRztBQUM3QixVQUFJLGVBQWUsc0JBQXNCLElBQUksY0FBYyxLQUEyQixFQUFFO0FBQUEsUUFBM0M7QUFBQTtBQUM1QyxlQUFrQixXQUFXLE1BQU07QUFDbkMsZUFBa0IsVUFBVSxNQUFNO0FBQ2xDLGVBQWtCLFFBQStCLFNBQVMsQ0FBQyxNQUFNLElBQUksQ0FBQztBQUFBO0FBQUEsUUFDdEUsTUFBZSxPQUFPO0FBQUEsUUFBeUI7QUFBQSxNQUNoRCxFQUFFLENBQUM7QUFBQSxJQUNKO0FBQUEsRUFDRCxDQUFDO0FBR0QsUUFBTSxPQUFPLElBQUksT0FBTyxJQUFJLFdBQVcsSUFBSSxFQUFFLHFDQUFxQyxDQUFDO0FBQ25GLE9BQUssTUFBTSxTQUFTO0FBQ3BCLE9BQUssTUFBTSxRQUFRO0FBQ25CLE9BQUssTUFBTSxXQUFXO0FBRXRCLFFBQU0sU0FBUyxJQUFJLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixJQUFJLENBQUM7QUFDekcsTUFBSSxRQUFRO0FBQ1gsV0FBTyxTQUFTLE1BQU07QUFBQSxFQUN2QjtBQUNEO0FBRUEsU0FBUywyQkFBMkIsS0FBOEIsTUFBMEM7QUFDM0csUUFBTSxRQUFRO0FBQ2QsUUFBTSxTQUFTO0FBQ2YsTUFBSSxVQUFVLE1BQU0sUUFBUSxHQUFHLEtBQUs7QUFDcEMsTUFBSSxVQUFVLE1BQU0sU0FBUyxHQUFHLE1BQU07QUFFdEMsUUFBTSx1QkFBdUIscUJBQXFCLElBQUksaUJBQWlCO0FBQUEsSUFDdEUsWUFBWSxJQUFJO0FBQUEsSUFDaEIsb0JBQW9CLENBQUMsUUFBUTtBQUM1QixnQ0FBMEIsR0FBRztBQUFBLElBQzlCO0FBQUEsRUFDRCxDQUFDO0FBRUQsUUFBTSxPQUFPLElBQUksT0FBTyxJQUFJLFdBQVcsSUFBSSxFQUFFLHFDQUFxQyxDQUFDO0FBQ25GLE9BQUssTUFBTSxTQUFTO0FBQ3BCLE9BQUssTUFBTSxRQUFRO0FBQ25CLE9BQUssTUFBTSxXQUFXO0FBRXRCLFFBQU0sU0FBUyxJQUFJLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLDJCQUEyQixJQUFJLENBQUM7QUFDM0csTUFBSSxNQUFNO0FBQ1QsV0FBTyxTQUFTLElBQUk7QUFBQSxFQUNyQjtBQUNEO0FBRUEsU0FBUyx3QkFBd0IsTUFBYyxhQUF1QztBQUNyRixTQUFPO0FBQUEsSUFDTixNQUFNLG9CQUFvQjtBQUFBLElBQzFCO0FBQUEsSUFDQTtBQUFBLElBQ0EsYUFBYTtBQUFBLElBQ2IsUUFBUSxvQkFBb0IsTUFBTSxJQUFJLEtBQUssK0JBQStCLEtBQUssWUFBWSxDQUFDLEVBQUUsR0FBRyxJQUFJO0FBQUEsRUFDdEc7QUFDRDtBQUVBLFNBQVMsMEJBQTBCLE1BQWMsYUFBdUM7QUFDdkYsU0FBTztBQUFBLElBQ04sTUFBTSxvQkFBb0I7QUFBQSxJQUMxQjtBQUFBLElBQ0E7QUFBQSxJQUNBLFFBQVE7QUFBQSxJQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxRQUFRLEtBQUssWUFBWSxDQUFDLEdBQUc7QUFBQSxJQUN0RixhQUFhO0FBQUEsSUFDYixpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDakMsc0JBQXNCO0FBQUEsTUFDckIsVUFBVSxRQUFRLEtBQUssWUFBWSxDQUFDO0FBQUEsTUFDcEMsY0FBYyxRQUFRLEtBQUssWUFBWSxDQUFDO0FBQUEsTUFDeEMsVUFBVSwyQkFBMkIsS0FBSyxZQUFZLENBQUM7QUFBQSxNQUN2RCxhQUFhLGVBQWUsS0FBSyxZQUFZLENBQUM7QUFBQSxNQUM5QyxlQUFlLENBQUMsVUFBVSxRQUFRLEtBQUssWUFBWSxDQUFDO0FBQUEsTUFDcEQsTUFBTSx5QkFBeUI7QUFBQSxNQUMvQixZQUFZLFFBQVEsS0FBSyxZQUFZLENBQUM7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFDRDtBQU1BLE1BQU0sdUJBQXVCLG9CQUFvQixpQkFBaUI7QUFDbEUsTUFBTSxrQ0FBa0MsSUFBSSxLQUFLLEVBQUUsUUFBUSx5QkFBeUIsTUFBTSxtQkFBbUIsQ0FBQztBQUU5RyxJQUFPLGtEQUFRLHlCQUF5QixFQUFFLE1BQU0seUJBQXlCLEdBQUc7QUFBQTtBQUFBLEVBSzNFLGFBQWEsdUJBQXVCO0FBQUEsSUFDbkMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUssRUFBRSxpQkFBaUIscUJBQXFCLENBQUM7QUFBQSxFQUMzRSxDQUFDO0FBQUE7QUFBQTtBQUFBLEVBSUQsY0FBYyx1QkFBdUI7QUFBQSxJQUNwQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSyxFQUFFLGlCQUFpQixzQkFBc0IsaUJBQWlCLGlDQUFpQyxPQUFPLENBQUM7QUFBQSxFQUNySSxDQUFDO0FBQUE7QUFBQTtBQUFBLEVBSUQsMEJBQTBCLHVCQUF1QjtBQUFBLElBQ2hELFFBQVEsRUFBRSxNQUFNLGNBQWMsVUFBVSxLQUFLO0FBQUEsSUFDN0MsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQTtBQUFBO0FBQUEsRUFJRCxVQUFVLHVCQUF1QjtBQUFBLElBQ2hDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsaUJBQWlCLGlDQUFpQztBQUFBLE1BQ2xELG9CQUFvQjtBQUFBLFFBQ25CLDhCQUE4QjtBQUFBLE1BQy9CO0FBQUEsTUFDQSxvQkFBb0I7QUFBQSxRQUNuQixpQ0FBaUM7QUFBQSxRQUNqQyxpQ0FBaUM7QUFBQSxRQUNqQyxpQ0FBaUM7QUFBQSxRQUNqQyxpQ0FBaUM7QUFBQSxRQUNqQyxpQ0FBaUM7QUFBQSxRQUNqQyxpQ0FBaUM7QUFBQSxRQUNqQyxpQ0FBaUM7QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUEsRUFHRCxtQkFBbUIsdUJBQXVCO0FBQUEsSUFDekMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsb0JBQW9CO0FBQUEsUUFDbkIsOEJBQThCO0FBQUEsTUFDL0I7QUFBQSxNQUNBLG9CQUFvQjtBQUFBLFFBQ25CLGlDQUFpQztBQUFBLFFBQ2pDLGlDQUFpQztBQUFBLFFBQ2pDLGlDQUFpQztBQUFBLFFBQ2pDLGlDQUFpQztBQUFBLFFBQ2pDLGlDQUFpQztBQUFBLFFBQ2pDLGlDQUFpQztBQUFBLFFBQ2pDLGlDQUFpQztBQUFBLE1BQ2xDO0FBQUEsTUFDQSxxQkFBcUIsb0JBQUksSUFBSTtBQUFBLFFBQzVCLENBQUMsbUJBQW1CLDJEQUEyRDtBQUFBLFFBQy9FLENBQUMseUJBQXlCLHlDQUF5QztBQUFBLE1BQ3BFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQTtBQUFBLEVBR0QsZUFBZSx1QkFBdUI7QUFBQSxJQUNyQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQixpQ0FBaUM7QUFBQSxJQUNuRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUEsRUFFRCw0QkFBNEIsdUJBQXVCO0FBQUEsSUFDbEQsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQTtBQUFBLEVBR0QsV0FBVyx1QkFBdUI7QUFBQSxJQUNqQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQixpQ0FBaUM7QUFBQSxJQUNuRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUE7QUFBQSxFQUdELFdBQVcsdUJBQXVCO0FBQUEsSUFDakMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUEsRUFHRCxpQkFBaUIsdUJBQXVCO0FBQUEsSUFDdkMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUEsRUFHRCxVQUFVLHVCQUF1QjtBQUFBLElBQ2hDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCLGlDQUFpQztBQUFBLElBQ25ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQTtBQUFBLEVBR0QsWUFBWSx1QkFBdUI7QUFBQSxJQUNsQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQixpQ0FBaUM7QUFBQSxJQUNuRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUEsRUFFRCxpQkFBaUIsdUJBQXVCO0FBQUEsSUFDdkMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixtQkFBbUIsaUNBQWlDO0FBQUEsSUFDckQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBLEVBRUQsbUJBQW1CLHVCQUF1QjtBQUFBLElBQ3pDLFFBQVEsRUFBRSxNQUFNLGNBQWMsVUFBVSxLQUFLO0FBQUEsSUFDN0MsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLG1CQUFtQixpQ0FBaUM7QUFBQSxJQUNyRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUE7QUFBQSxFQUdELFlBQVksdUJBQXVCO0FBQUEsSUFDbEMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUE7QUFBQSxFQUlELGVBQWUsdUJBQXVCO0FBQUEsSUFDckMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVE7QUFBQSxFQUNULENBQUM7QUFBQTtBQUFBLEVBR0Qsa0JBQWtCLHVCQUF1QjtBQUFBLElBQ3hDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRO0FBQUEsRUFDVCxDQUFDO0FBQUE7QUFBQSxFQUdELG1CQUFtQix1QkFBdUI7QUFBQSxJQUN6QyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGtCQUFrQixLQUFLLEtBQUs7QUFBQSxFQUM1QyxDQUFDO0FBQUE7QUFBQSxFQUdELHFCQUFxQix1QkFBdUI7QUFBQSxJQUMzQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGtCQUFrQixLQUFLLElBQUk7QUFBQSxFQUMzQyxDQUFDO0FBQUE7QUFBQSxFQUdELHVCQUF1Qix1QkFBdUI7QUFBQSxJQUM3QyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLHFCQUFxQixLQUFLLEtBQUs7QUFBQSxFQUMvQyxDQUFDO0FBQUE7QUFBQSxFQUdELHlCQUF5Qix1QkFBdUI7QUFBQSxJQUMvQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLHFCQUFxQixLQUFLLElBQUk7QUFBQSxFQUM5QyxDQUFDO0FBQUE7QUFBQSxFQUdELG9CQUFvQix1QkFBdUI7QUFBQSxJQUMxQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQixpQ0FBaUM7QUFBQSxNQUNsRCxnQkFBZ0I7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUEsRUFFRCx1QkFBdUIsdUJBQXVCO0FBQUEsSUFDN0MsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBLEVBRUQsb0JBQW9CLHVCQUF1QjtBQUFBLElBQzFDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCLGlDQUFpQztBQUFBLE1BQ2xELGdCQUFnQjtBQUFBLElBQ2pCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQTtBQUFBLEVBR0QscUJBQXFCLHVCQUF1QjtBQUFBLElBQzNDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCLGlDQUFpQztBQUFBLE1BQ2xELE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQSxFQUVELGlCQUFpQix1QkFBdUI7QUFBQSxJQUN2QyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQixpQ0FBaUM7QUFBQSxNQUNsRCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUE7QUFBQTtBQUFBLEVBSUQsbUJBQW1CLHVCQUF1QjtBQUFBLElBQ3pDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCLGlDQUFpQztBQUFBLE1BQ2xELGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUE7QUFBQSxFQUdELGVBQWUsdUJBQXVCO0FBQUEsSUFDckMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZUFBZTtBQUFBLE1BQ2YsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUE7QUFBQSxFQUlELHlCQUF5Qix1QkFBdUI7QUFBQSxJQUMvQyxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLGFBQWEsS0FBSztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQixpQ0FBaUM7QUFBQSxNQUNsRCxlQUFlO0FBQUEsTUFDZixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUEsRUFHRCxxQkFBcUIsdUJBQXVCO0FBQUEsSUFDM0MsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUEsRUFHRCxpQkFBaUIsdUJBQXVCO0FBQUEsSUFDdkMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZUFBZTtBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFBQTtBQUFBO0FBQUEsRUFJRCx1QkFBdUIsdUJBQXVCO0FBQUEsSUFDN0MsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZUFBZTtBQUFBLE1BQ2YsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUEsRUFHRCxjQUFjLHVCQUF1QjtBQUFBLElBQ3BDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCLGlDQUFpQztBQUFBLE1BQ2xELGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUEsRUFFRCxvQkFBb0IsdUJBQXVCO0FBQUEsSUFDMUMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZUFBZTtBQUFBLE1BQ2YsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUE7QUFBQSxFQUlELDRCQUE0Qix1QkFBdUI7QUFBQSxJQUNsRCxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLHdCQUF3QixLQUFLLG1CQUFtQixnQkFBZ0IsY0FBYyxvQkFBb0IsV0FBVywwQ0FBMEMsQ0FBQztBQUFBLEVBQ3hLLENBQUM7QUFBQTtBQUFBLEVBR0QsdUJBQXVCLHVCQUF1QjtBQUFBLElBQzdDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sd0JBQXdCLEtBQUssbUJBQW1CLGtCQUFrQixjQUFjLG9CQUFvQixNQUFNLGlDQUFpQyxDQUFDO0FBQUEsRUFDNUosQ0FBQztBQUFBO0FBQUEsRUFHRCx3QkFBd0IsdUJBQXVCO0FBQUEsSUFDOUMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyx3QkFBd0IsS0FBSyxNQUFTO0FBQUEsRUFDdEQsQ0FBQztBQUFBO0FBQUEsRUFHRCwrQkFBK0IsdUJBQXVCO0FBQUEsSUFDckQsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTywyQkFBMkIsS0FBSyx3QkFBd0IsVUFBVSxtREFBbUQsQ0FBQztBQUFBLEVBQ3RJLENBQUM7QUFBQTtBQUFBLEVBR0QsaUNBQWlDLHVCQUF1QjtBQUFBLElBQ3ZELFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sMkJBQTJCLEtBQUssMEJBQTBCLFVBQVUsMENBQTBDLENBQUM7QUFBQSxFQUMvSCxDQUFDO0FBQUE7QUFBQSxFQUdELDJCQUEyQix1QkFBdUI7QUFBQSxJQUNqRCxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLDJCQUEyQixLQUFLLE1BQVM7QUFBQSxFQUN6RCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiYWdlbnRJbnN0cnVjdGlvbnMiLCAic2Vzc2lvblJlc291cmNlIl0KfQo=
