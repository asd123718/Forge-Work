import { isEqual } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { SnippetController2 } from "../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService, NeverShowAgainScope, Severity } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { getLanguageIdForPromptsType, PromptsType, Target } from "../../common/promptSyntax/promptTypes.js";
import { IUserDataSyncEnablementService, SyncResource } from "../../../../../platform/userDataSync/common/userDataSync.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { CONFIGURE_SYNC_COMMAND_ID } from "../../../../services/userDataSync/common/userDataSync.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { CHAT_CATEGORY } from "../actions/chatActions.js";
import { askForPromptFileName } from "./pickers/askForPromptName.js";
import { askForPromptSourceFolder } from "./pickers/askForPromptSourceFolder.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { getCleanPromptName, SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from "../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { getTarget } from "../../common/promptSyntax/languageProviders/promptFileAttributes.js";
class AbstractNewPromptFileAction extends Action2 {
  constructor(id, title, type) {
    super({
      id,
      title,
      f1: false,
      precondition: ChatContextKeys.enabled,
      category: CHAT_CATEGORY,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: {
        id: MenuId.CommandPalette,
        when: ChatContextKeys.enabled
      }
    });
    this.type = type;
  }
  async run(accessor, options) {
    const logService = accessor.get(ILogService);
    const openerService = accessor.get(IOpenerService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const instaService = accessor.get(IInstantiationService);
    let folderUri;
    let storage;
    if (options?.targetFolder) {
      folderUri = options.targetFolder;
      storage = options.targetStorage ?? PromptsStorage.local;
    } else {
      const selectedFolder = await instaService.invokeFunction(askForPromptSourceFolder, this.type);
      if (!selectedFolder) {
        return;
      }
      folderUri = selectedFolder.uri;
      storage = selectedFolder.storage;
    }
    const fileName = await instaService.invokeFunction(askForPromptFileName, this.type, folderUri, void 0, options?.fileExtension);
    if (!fileName) {
      return;
    }
    await fileService.createFolder(folderUri);
    const promptUri = URI.joinPath(folderUri, fileName);
    await fileService.createFile(promptUri);
    const cleanName = getCleanPromptName(promptUri);
    let editor;
    if (options?.openFile) {
      editor = await options.openFile(promptUri);
    } else {
      await openerService.open(promptUri);
      editor = getCodeEditor(editorService.activeTextEditorControl);
    }
    if (editor && editor.hasModel() && isEqual(editor.getModel().uri, promptUri)) {
      SnippetController2.get(editor)?.apply([{
        range: editor.getModel().getFullModelRange(),
        template: getDefaultContentSnippet(this.type, cleanName, getTarget(this.type, promptUri))
      }]);
    }
    if (storage !== "user") {
      return;
    }
    const isConfigured = userDataSyncEnablementService.isResourceEnablementConfigured(SyncResource.Prompts);
    const isSettingsSyncEnabled = userDataSyncEnablementService.isEnabled();
    if (isConfigured === true || isSettingsSyncEnabled === false) {
      return;
    }
    notificationService.prompt(
      Severity.Info,
      localize(
        "workbench.command.prompts.create.user.enable-sync-notification",
        "Do you want to backup and sync your user prompt, instruction and custom agent files with Setting Sync?'"
      ),
      [
        {
          label: localize("enable.capitalized", "Enable"),
          run: () => {
            commandService.executeCommand(CONFIGURE_SYNC_COMMAND_ID).catch((error) => {
              logService.error(`Failed to run '${CONFIGURE_SYNC_COMMAND_ID}' command: ${error}.`);
            });
          }
        },
        {
          label: localize("learnMore.capitalized", "Learn More"),
          run: () => {
            openerService.open(URI.parse("https://aka.ms/vscode-settings-sync-help"));
          }
        }
      ],
      {
        neverShowAgain: {
          id: "workbench.command.prompts.create.user.enable-sync-notification",
          scope: NeverShowAgainScope.PROFILE
        }
      }
    );
  }
}
function getDefaultContentSnippet(promptType, name, target) {
  switch (promptType) {
    case PromptsType.prompt:
      return [
        `---`,
        `name: ${name ?? "${1:prompt-name}"}`,
        `description: \${2:Describe when to use this prompt}`,
        `---`,
        ``,
        `<!-- Tip: Use /create-prompt in chat to generate content with agent assistance -->`,
        ``,
        `\${3:Define the prompt content here. You can include instructions, examples, and any other relevant information to guide the AI's responses.}`
      ].join("\n");
    case PromptsType.instructions:
      if (target === Target.Claude) {
        return [
          `---`,
          `description: \${1:Describe when these instructions should be loaded}`,
          `paths:`,
          `. - "src/**/*.ts"`,
          `---`,
          ``,
          `<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->`,
          ``,
          `\${2:Provide coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.}`
        ].join("\n");
      } else {
        return [
          `---`,
          `description: \${1:Describe when these instructions should be loaded by the agent based on task context}`,
          `# applyTo: '\${1|**,**/*.ts|}' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file`,
          `---`,
          ``,
          `<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->`,
          ``,
          `\${2:Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.}`
        ].join("\n");
      }
    case PromptsType.agent:
      if (target === Target.Claude) {
        return [
          `---`,
          `name: ${name ?? "${1:agent-name}"}`,
          `description: \${2:Describe what this custom agent does and when to use it.}`,
          `tools: Read, Grep, Glob, Bash # specify the tools this agent can use. If not set, all enabled tools are allowed.`,
          `---`,
          ``,
          `<!-- Tip: Use /create-agent in chat to generate content with agent assistance -->`,
          ``,
          `\${4:Define what this custom agent does, including its behavior, capabilities, and any specific instructions for its operation.}`
        ].join("\n");
      } else {
        return [
          `---`,
          `name: ${name ?? "${1:agent-name}"}`,
          `description: \${2:Describe what this custom agent does and when to use it.}`,
          `argument-hint: \${3:The inputs this agent expects, e.g., "a task to implement" or "a question to answer".}`,
          `# tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo'] # specify the tools this agent can use. If not set, all enabled tools are allowed.`,
          `---`,
          ``,
          `<!-- Tip: Use /create-agent in chat to generate content with agent assistance -->`,
          ``,
          `\${4:Define what this custom agent does, including its behavior, capabilities, and any specific instructions for its operation.}`
        ].join("\n");
      }
    case PromptsType.skill:
      return [
        `---`,
        `name: ${name ?? "${1:skill-name}"}`,
        `description: \${2:Describe what this skill does and when to use it. Include keywords that help agents identify relevant tasks.}`,
        `---`,
        ``,
        `<!-- Tip: Use /create-skill in chat to generate content with agent assistance -->`,
        ``,
        `\${3:Define the functionality provided by this skill, including detailed instructions and examples}`
      ].join("\n");
    default:
      throw new Error(`Unsupported prompt type: ${promptType}`);
  }
}
const NEW_PROMPT_COMMAND_ID = "workbench.command.new.prompt";
const NEW_INSTRUCTIONS_COMMAND_ID = "workbench.command.new.instructions";
const NEW_AGENT_COMMAND_ID = "workbench.command.new.agent";
const NEW_SKILL_COMMAND_ID = "workbench.command.new.skill";
class NewPromptFileAction extends AbstractNewPromptFileAction {
  constructor() {
    super(NEW_PROMPT_COMMAND_ID, localize("commands.new.prompt.local.title", "New Prompt File..."), PromptsType.prompt);
  }
}
class NewInstructionsFileAction extends AbstractNewPromptFileAction {
  constructor() {
    super(NEW_INSTRUCTIONS_COMMAND_ID, localize("commands.new.instructions.local.title", "New Instructions File..."), PromptsType.instructions);
  }
}
class NewAgentFileAction extends AbstractNewPromptFileAction {
  constructor() {
    super(NEW_AGENT_COMMAND_ID, localize("commands.new.agent.local.title", "New Custom Agent..."), PromptsType.agent);
  }
}
class NewSkillFileAction extends Action2 {
  constructor() {
    super({
      id: NEW_SKILL_COMMAND_ID,
      title: localize("commands.new.skill.local.title", "New Skill File..."),
      f1: false,
      precondition: ChatContextKeys.enabled,
      category: CHAT_CATEGORY,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: {
        id: MenuId.CommandPalette,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, options) {
    const openerService = accessor.get(IOpenerService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const instaService = accessor.get(IInstantiationService);
    const quickInputService = accessor.get(IQuickInputService);
    let folderUri;
    if (options?.targetFolder) {
      folderUri = options.targetFolder;
    } else {
      const selectedFolder = await instaService.invokeFunction(askForPromptSourceFolder, PromptsType.skill);
      if (!selectedFolder) {
        return;
      }
      folderUri = selectedFolder.uri;
    }
    const skillName = await quickInputService.input({
      prompt: localize("commands.new.skill.name.prompt", "Enter a name for the skill (lowercase letters, numbers, and hyphens only)"),
      placeHolder: localize("commands.new.skill.name.placeholder", "e.g., pdf-processing, data-analysis"),
      validateInput: async (value) => {
        if (!value || !value.trim()) {
          return localize("commands.new.skill.name.required", "Skill name is required");
        }
        const name = value.trim();
        if (name.length > 64) {
          return localize("commands.new.skill.name.tooLong", "Skill name must be 64 characters or less");
        }
        if (!VALID_SKILL_NAME_REGEX.test(name)) {
          return localize("commands.new.skill.name.invalidChars", "Skill name may only contain lowercase letters, numbers, and hyphens");
        }
        if (name.startsWith("-") || name.endsWith("-")) {
          return localize("commands.new.skill.name.hyphenEdge", "Skill name must not start or end with a hyphen");
        }
        if (name.includes("--")) {
          return localize("commands.new.skill.name.consecutiveHyphens", "Skill name must not contain consecutive hyphens");
        }
        return void 0;
      }
    });
    if (!skillName) {
      return;
    }
    const trimmedName = skillName.trim();
    const skillFolder = URI.joinPath(folderUri, trimmedName);
    await fileService.createFolder(skillFolder);
    const skillFileUri = URI.joinPath(skillFolder, SKILL_FILENAME);
    await fileService.createFile(skillFileUri);
    let editor;
    if (options?.openFile) {
      editor = await options.openFile(skillFileUri);
    } else {
      await openerService.open(skillFileUri);
      editor = getCodeEditor(editorService.activeTextEditorControl);
    }
    if (editor && editor.hasModel() && isEqual(editor.getModel().uri, skillFileUri)) {
      SnippetController2.get(editor)?.apply([{
        range: editor.getModel().getFullModelRange(),
        template: getDefaultContentSnippet(PromptsType.skill, trimmedName, Target.Undefined)
      }]);
    }
  }
}
class NewUntitledPromptFileAction extends Action2 {
  constructor() {
    super({
      id: "workbench.command.new.untitled.prompt",
      title: localize2("commands.new.untitled.prompt.title", "New Untitled Prompt File"),
      f1: true,
      precondition: ChatContextKeys.enabled,
      category: CHAT_CATEGORY,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const languageId = getLanguageIdForPromptsType(PromptsType.prompt);
    const input = await editorService.openEditor({
      resource: void 0,
      languageId,
      options: {
        pinned: true
      }
    });
    const type = PromptsType.prompt;
    const editor = getCodeEditor(editorService.activeTextEditorControl);
    if (editor && editor.hasModel()) {
      SnippetController2.get(editor)?.apply([{
        range: editor.getModel().getFullModelRange(),
        template: getDefaultContentSnippet(type, void 0, Target.Undefined)
      }]);
    }
    return input;
  }
}
function registerNewPromptFileActions() {
  registerAction2(NewPromptFileAction);
  registerAction2(NewInstructionsFileAction);
  registerAction2(NewAgentFileAction);
  registerAction2(NewSkillFileAction);
  registerAction2(NewUntitledPromptFileAction);
}
export {
  NEW_AGENT_COMMAND_ID,
  NEW_INSTRUCTIONS_COMMAND_ID,
  NEW_PROMPT_COMMAND_ID,
  NEW_SKILL_COMMAND_ID,
  registerNewPromptFileActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcbmV3UHJvbXB0RmlsZUFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTmV2ZXJTaG93QWdhaW5TY29wZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZSwgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBTeW5jUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkVfU1lOQ19DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlkgfSBmcm9tICcuLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IGFza0ZvclByb21wdEZpbGVOYW1lIH0gZnJvbSAnLi9waWNrZXJzL2Fza0ZvclByb21wdE5hbWUuanMnO1xuaW1wb3J0IHsgYXNrRm9yUHJvbXB0U291cmNlRm9sZGVyIH0gZnJvbSAnLi9waWNrZXJzL2Fza0ZvclByb21wdFNvdXJjZUZvbGRlci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGdldENsZWFuUHJvbXB0TmFtZSwgU0tJTExfRklMRU5BTUUsIFZBTElEX1NLSUxMX05BTUVfUkVHRVggfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuXG4vKipcbiAqIE9wdGlvbnMgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgZm9sZGVyLXBpY2tlciBhbmQgZWRpdG9yLW9wZW4gYmVoYXZpb3VyXG4gKiBvZiB0aGUgbmV3LXByb21wdC1maWxlIGFjdGlvbnMuIFRoZSBhZ2VudGljIGVkaXRvciBwYXNzZXMgdGhlc2UgdG8gb3BlblxuICogZmlsZXMgaW4gdGhlIGVtYmVkZGVkIGVkaXRvciBhbmQgcHJlLXJlc29sdmUgdGhlIHRhcmdldCBmb2xkZXIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU5ld1Byb21wdE9wdGlvbnMge1xuXHRyZWFkb25seSB0YXJnZXRGb2xkZXI/OiBVUkk7XG5cdHJlYWRvbmx5IHRhcmdldFN0b3JhZ2U/OiBQcm9tcHRzU3RvcmFnZTtcblx0cmVhZG9ubHkgb3BlbkZpbGU/OiAodXJpOiBVUkkpID0+IFByb21pc2U8SUNvZGVFZGl0b3IgfCB1bmRlZmluZWQ+O1xuXHQvKipcblx0ICogT3ZlcnJpZGUgdGhlIGZpbGUgZXh0ZW5zaW9uIChlLmcuIGAubWRgIGZvciBDbGF1ZGUgcnVsZXMgaW5zdGVhZCBvZlxuXHQgKiBgLmluc3RydWN0aW9ucy5tZGApLiBXaGVuIHNldCwgdGhlIG5hbWUgcGlja2VyIHVzZXMgdGhpcyBleHRlbnNpb25cblx0ICogaW5zdGVhZCBvZiB0aGUgZGVmYXVsdCBmb3IgdGhlIHByb21wdCB0eXBlLlxuXHQgKi9cblx0cmVhZG9ubHkgZmlsZUV4dGVuc2lvbj86IHN0cmluZztcbn1cblxuY2xhc3MgQWJzdHJhY3ROZXdQcm9tcHRGaWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSB0eXBlOiBQcm9tcHRzVHlwZSkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9ucz86IElOZXdQcm9tcHRPcHRpb25zKSB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRsZXQgZm9sZGVyVXJpOiBVUkk7XG5cdFx0bGV0IHN0b3JhZ2U6IHN0cmluZztcblx0XHRpZiAob3B0aW9ucz8udGFyZ2V0Rm9sZGVyKSB7XG5cdFx0XHRmb2xkZXJVcmkgPSBvcHRpb25zLnRhcmdldEZvbGRlcjtcblx0XHRcdHN0b3JhZ2UgPSBvcHRpb25zLnRhcmdldFN0b3JhZ2UgPz8gUHJvbXB0c1N0b3JhZ2UubG9jYWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkRm9sZGVyID0gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFza0ZvclByb21wdFNvdXJjZUZvbGRlciwgdGhpcy50eXBlKTtcblx0XHRcdGlmICghc2VsZWN0ZWRGb2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9sZGVyVXJpID0gc2VsZWN0ZWRGb2xkZXIudXJpO1xuXHRcdFx0c3RvcmFnZSA9IHNlbGVjdGVkRm9sZGVyLnN0b3JhZ2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZU5hbWUgPSBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXNrRm9yUHJvbXB0RmlsZU5hbWUsIHRoaXMudHlwZSwgZm9sZGVyVXJpLCB1bmRlZmluZWQsIG9wdGlvbnM/LmZpbGVFeHRlbnNpb24pO1xuXHRcdGlmICghZmlsZU5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gY3JlYXRlIHRoZSBwcm9tcHQgZmlsZVxuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGZvbGRlclVyaSk7XG5cblx0XHRjb25zdCBwcm9tcHRVcmkgPSBVUkkuam9pblBhdGgoZm9sZGVyVXJpLCBmaWxlTmFtZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShwcm9tcHRVcmkpO1xuXG5cdFx0Y29uc3QgY2xlYW5OYW1lID0gZ2V0Q2xlYW5Qcm9tcHROYW1lKHByb21wdFVyaSk7XG5cblx0XHRsZXQgZWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnM/Lm9wZW5GaWxlKSB7XG5cdFx0XHRlZGl0b3IgPSBhd2FpdCBvcHRpb25zLm9wZW5GaWxlKHByb21wdFVyaSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3Blbihwcm9tcHRVcmkpO1xuXHRcdFx0ZWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHR9XG5cdFx0aWYgKGVkaXRvciAmJiBlZGl0b3IuaGFzTW9kZWwoKSAmJiBpc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpLnVyaSwgcHJvbXB0VXJpKSkge1xuXHRcdFx0U25pcHBldENvbnRyb2xsZXIyLmdldChlZGl0b3IpPy5hcHBseShbe1xuXHRcdFx0XHRyYW5nZTogZWRpdG9yLmdldE1vZGVsKCkuZ2V0RnVsbE1vZGVsUmFuZ2UoKSxcblx0XHRcdFx0dGVtcGxhdGU6IGdldERlZmF1bHRDb250ZW50U25pcHBldCh0aGlzLnR5cGUsIGNsZWFuTmFtZSwgZ2V0VGFyZ2V0KHRoaXMudHlwZSwgcHJvbXB0VXJpKSksXG5cdFx0XHR9XSk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0b3JhZ2UgIT09ICd1c2VyJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGR1ZSB0byBQSUkgY29uY2VybnMsIHN5bmNocm9uaXphdGlvbiBvZiB0aGUgJ3VzZXInIHJldXNhYmxlIHByb21wdHNcblx0XHQvLyBpcyBkaXNhYmxlZCBieSBkZWZhdWx0LCBidXQgd2Ugd2FudCB0byBtYWtlIHRoYXQgZmFjdCBjbGVhciB0byB0aGUgdXNlclxuXHRcdC8vIGhlbmNlIGFmdGVyIGEgJ3VzZXInIHByb21wdCBpcyBjcmVhdGUsIHdlIGNoZWNrIGlmIHRoZSBzeW5jaHJvbml6YXRpb25cblx0XHQvLyB3YXMgZXhwbGljaXRseSBjb25maWd1cmVkIGJlZm9yZSwgYW5kIGlmIGl0IHdhc24ndCwgd2Ugc2hvdyBhIHN1Z2dlc3Rpb25cblx0XHQvLyB0byBlbmFibGUgdGhlIHN5bmNocm9uaXphdGlvbiBsb2dpYyBpbiB0aGUgU2V0dGluZ3MgU3luYyBjb25maWd1cmF0aW9uXG5cblx0XHRjb25zdCBpc0NvbmZpZ3VyZWQgPSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZVxuXHRcdFx0LmlzUmVzb3VyY2VFbmFibGVtZW50Q29uZmlndXJlZChTeW5jUmVzb3VyY2UuUHJvbXB0cyk7XG5cdFx0Y29uc3QgaXNTZXR0aW5nc1N5bmNFbmFibGVkID0gdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCk7XG5cblx0XHQvLyBpZiBwcm9tcHRzIHN5bmNocm9uaXphdGlvbiBoYXMgYWxyZWFkeSBiZWVuIGNvbmZpZ3VyZWQgYmVmb3JlIG9yXG5cdFx0Ly8gaWYgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlIGlzIGN1cnJlbnRseSBkaXNhYmxlZCwgbm90aGluZyB0byBkb1xuXHRcdGlmICgoaXNDb25maWd1cmVkID09PSB0cnVlKSB8fCAoaXNTZXR0aW5nc1N5bmNFbmFibGVkID09PSBmYWxzZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBzaG93IHN1Z2dlc3Rpb24gdG8gZW5hYmxlIHN5bmNocm9uaXphdGlvbiBvZiB0aGUgdXNlciBwcm9tcHRzIGFuZCBpbnN0cnVjdGlvbnMgdG8gdGhlIHVzZXJcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0J3dvcmtiZW5jaC5jb21tYW5kLnByb21wdHMuY3JlYXRlLnVzZXIuZW5hYmxlLXN5bmMtbm90aWZpY2F0aW9uJyxcblx0XHRcdFx0XCJEbyB5b3Ugd2FudCB0byBiYWNrdXAgYW5kIHN5bmMgeW91ciB1c2VyIHByb21wdCwgaW5zdHJ1Y3Rpb24gYW5kIGN1c3RvbSBhZ2VudCBmaWxlcyB3aXRoIFNldHRpbmcgU3luYz8nXCIsXG5cdFx0XHQpLFxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdlbmFibGUuY2FwaXRhbGl6ZWQnLCBcIkVuYWJsZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENPTkZJR1VSRV9TWU5DX0NPTU1BTkRfSUQpXG5cdFx0XHRcdFx0XHRcdC5jYXRjaCgoZXJyb3IpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcnVuICcke0NPTkZJR1VSRV9TWU5DX0NPTU1BTkRfSUR9JyBjb21tYW5kOiAke2Vycm9yfS5gKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGVhcm5Nb3JlLmNhcGl0YWxpemVkJywgXCJMZWFybiBNb3JlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXNldHRpbmdzLXN5bmMtaGVscCcpKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0bmV2ZXJTaG93QWdhaW46IHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5jb21tYW5kLnByb21wdHMuY3JlYXRlLnVzZXIuZW5hYmxlLXN5bmMtbm90aWZpY2F0aW9uJyxcblx0XHRcdFx0XHRzY29wZTogTmV2ZXJTaG93QWdhaW5TY29wZS5QUk9GSUxFLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRDb250ZW50U25pcHBldChwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0YXJnZXQ6IFRhcmdldCk6IHN0cmluZyB7XG5cdHN3aXRjaCAocHJvbXB0VHlwZSkge1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdGBuYW1lOiAke25hbWUgPz8gJyR7MTpwcm9tcHQtbmFtZX0nfWAsXG5cdFx0XHRcdGBkZXNjcmlwdGlvbjogXFwkezI6RGVzY3JpYmUgd2hlbiB0byB1c2UgdGhpcyBwcm9tcHR9YCxcblx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgPCEtLSBUaXA6IFVzZSAvY3JlYXRlLXByb21wdCBpbiBjaGF0IHRvIGdlbmVyYXRlIGNvbnRlbnQgd2l0aCBhZ2VudCBhc3Npc3RhbmNlIC0tPmAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgXFwkezM6RGVmaW5lIHRoZSBwcm9tcHQgY29udGVudCBoZXJlLiBZb3UgY2FuIGluY2x1ZGUgaW5zdHJ1Y3Rpb25zLCBleGFtcGxlcywgYW5kIGFueSBvdGhlciByZWxldmFudCBpbmZvcm1hdGlvbiB0byBndWlkZSB0aGUgQUkncyByZXNwb25zZXMufWAsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOlxuXHRcdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdGAtLS1gLFxuXHRcdFx0XHRcdGBkZXNjcmlwdGlvbjogXFwkezE6RGVzY3JpYmUgd2hlbiB0aGVzZSBpbnN0cnVjdGlvbnMgc2hvdWxkIGJlIGxvYWRlZH1gLFxuXHRcdFx0XHRcdGBwYXRoczpgLFxuXHRcdFx0XHRcdGAuIC0gXCJzcmMvKiovKi50c1wiYCxcblx0XHRcdFx0XHRgLS0tYCxcblx0XHRcdFx0XHRgYCxcblx0XHRcdFx0XHRgPCEtLSBUaXA6IFVzZSAvY3JlYXRlLWluc3RydWN0aW9ucyBpbiBjaGF0IHRvIGdlbmVyYXRlIGNvbnRlbnQgd2l0aCBhZ2VudCBhc3Npc3RhbmNlIC0tPmAsXG5cdFx0XHRcdFx0YGAsXG5cdFx0XHRcdFx0YFxcJHsyOlByb3ZpZGUgY29kaW5nIGd1aWRlbGluZXMgdGhhdCBBSSBzaG91bGQgZm9sbG93IHdoZW4gZ2VuZXJhdGluZyBjb2RlLCBhbnN3ZXJpbmcgcXVlc3Rpb25zLCBvciByZXZpZXdpbmcgY2hhbmdlcy59YCxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdFx0YGRlc2NyaXB0aW9uOiBcXCR7MTpEZXNjcmliZSB3aGVuIHRoZXNlIGluc3RydWN0aW9ucyBzaG91bGQgYmUgbG9hZGVkIGJ5IHRoZSBhZ2VudCBiYXNlZCBvbiB0YXNrIGNvbnRleHR9YCxcblx0XHRcdFx0XHRgIyBhcHBseVRvOiAnXFwkezF8KiosKiovKi50c3x9JyAjIHdoZW4gcHJvdmlkZWQsIGluc3RydWN0aW9ucyB3aWxsIGF1dG9tYXRpY2FsbHkgYmUgYWRkZWQgdG8gdGhlIHJlcXVlc3QgY29udGV4dCB3aGVuIHRoZSBwYXR0ZXJuIG1hdGNoZXMgYW4gYXR0YWNoZWQgZmlsZWAsXG5cdFx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdFx0YGAsXG5cdFx0XHRcdFx0YDwhLS0gVGlwOiBVc2UgL2NyZWF0ZS1pbnN0cnVjdGlvbnMgaW4gY2hhdCB0byBnZW5lcmF0ZSBjb250ZW50IHdpdGggYWdlbnQgYXNzaXN0YW5jZSAtLT5gLFxuXHRcdFx0XHRcdGBgLFxuXHRcdFx0XHRcdGBcXCR7MjpQcm92aWRlIHByb2plY3QgY29udGV4dCBhbmQgY29kaW5nIGd1aWRlbGluZXMgdGhhdCBBSSBzaG91bGQgZm9sbG93IHdoZW4gZ2VuZXJhdGluZyBjb2RlLCBhbnN3ZXJpbmcgcXVlc3Rpb25zLCBvciByZXZpZXdpbmcgY2hhbmdlcy59YCxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdH1cblx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdGAtLS1gLFxuXHRcdFx0XHRcdGBuYW1lOiAke25hbWUgPz8gJyR7MTphZ2VudC1uYW1lfSd9YCxcblx0XHRcdFx0XHRgZGVzY3JpcHRpb246IFxcJHsyOkRlc2NyaWJlIHdoYXQgdGhpcyBjdXN0b20gYWdlbnQgZG9lcyBhbmQgd2hlbiB0byB1c2UgaXQufWAsXG5cdFx0XHRcdFx0YHRvb2xzOiBSZWFkLCBHcmVwLCBHbG9iLCBCYXNoICMgc3BlY2lmeSB0aGUgdG9vbHMgdGhpcyBhZ2VudCBjYW4gdXNlLiBJZiBub3Qgc2V0LCBhbGwgZW5hYmxlZCB0b29scyBhcmUgYWxsb3dlZC5gLFxuXHRcdFx0XHRcdGAtLS1gLFxuXHRcdFx0XHRcdGBgLFxuXHRcdFx0XHRcdGA8IS0tIFRpcDogVXNlIC9jcmVhdGUtYWdlbnQgaW4gY2hhdCB0byBnZW5lcmF0ZSBjb250ZW50IHdpdGggYWdlbnQgYXNzaXN0YW5jZSAtLT5gLFxuXHRcdFx0XHRcdGBgLFxuXHRcdFx0XHRcdGBcXCR7NDpEZWZpbmUgd2hhdCB0aGlzIGN1c3RvbSBhZ2VudCBkb2VzLCBpbmNsdWRpbmcgaXRzIGJlaGF2aW9yLCBjYXBhYmlsaXRpZXMsIGFuZCBhbnkgc3BlY2lmaWMgaW5zdHJ1Y3Rpb25zIGZvciBpdHMgb3BlcmF0aW9uLn1gLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRgLS0tYCxcblx0XHRcdFx0XHRgbmFtZTogJHtuYW1lID8/ICckezE6YWdlbnQtbmFtZX0nfWAsXG5cdFx0XHRcdFx0YGRlc2NyaXB0aW9uOiBcXCR7MjpEZXNjcmliZSB3aGF0IHRoaXMgY3VzdG9tIGFnZW50IGRvZXMgYW5kIHdoZW4gdG8gdXNlIGl0Ln1gLFxuXHRcdFx0XHRcdGBhcmd1bWVudC1oaW50OiBcXCR7MzpUaGUgaW5wdXRzIHRoaXMgYWdlbnQgZXhwZWN0cywgZS5nLiwgXCJhIHRhc2sgdG8gaW1wbGVtZW50XCIgb3IgXCJhIHF1ZXN0aW9uIHRvIGFuc3dlclwiLn1gLFxuXHRcdFx0XHRcdGAjIHRvb2xzOiBbJ3ZzY29kZScsICdleGVjdXRlJywgJ3JlYWQnLCAnYWdlbnQnLCAnZWRpdCcsICdzZWFyY2gnLCAnd2ViJywgJ3RvZG8nXSAjIHNwZWNpZnkgdGhlIHRvb2xzIHRoaXMgYWdlbnQgY2FuIHVzZS4gSWYgbm90IHNldCwgYWxsIGVuYWJsZWQgdG9vbHMgYXJlIGFsbG93ZWQuYCxcblx0XHRcdFx0XHRgLS0tYCxcblx0XHRcdFx0XHRgYCxcblx0XHRcdFx0XHRgPCEtLSBUaXA6IFVzZSAvY3JlYXRlLWFnZW50IGluIGNoYXQgdG8gZ2VuZXJhdGUgY29udGVudCB3aXRoIGFnZW50IGFzc2lzdGFuY2UgLS0+YCxcblx0XHRcdFx0XHRgYCxcblx0XHRcdFx0XHRgXFwkezQ6RGVmaW5lIHdoYXQgdGhpcyBjdXN0b20gYWdlbnQgZG9lcywgaW5jbHVkaW5nIGl0cyBiZWhhdmlvciwgY2FwYWJpbGl0aWVzLCBhbmQgYW55IHNwZWNpZmljIGluc3RydWN0aW9ucyBmb3IgaXRzIG9wZXJhdGlvbi59YCxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdH1cblx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdGBuYW1lOiAke25hbWUgPz8gJyR7MTpza2lsbC1uYW1lfSd9YCxcblx0XHRcdFx0YGRlc2NyaXB0aW9uOiBcXCR7MjpEZXNjcmliZSB3aGF0IHRoaXMgc2tpbGwgZG9lcyBhbmQgd2hlbiB0byB1c2UgaXQuIEluY2x1ZGUga2V5d29yZHMgdGhhdCBoZWxwIGFnZW50cyBpZGVudGlmeSByZWxldmFudCB0YXNrcy59YCxcblx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgPCEtLSBUaXA6IFVzZSAvY3JlYXRlLXNraWxsIGluIGNoYXQgdG8gZ2VuZXJhdGUgY29udGVudCB3aXRoIGFnZW50IGFzc2lzdGFuY2UgLS0+YCxcblx0XHRcdFx0YGAsXG5cdFx0XHRcdGBcXCR7MzpEZWZpbmUgdGhlIGZ1bmN0aW9uYWxpdHkgcHJvdmlkZWQgYnkgdGhpcyBza2lsbCwgaW5jbHVkaW5nIGRldGFpbGVkIGluc3RydWN0aW9ucyBhbmQgZXhhbXBsZXN9YCxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcHJvbXB0IHR5cGU6ICR7cHJvbXB0VHlwZX1gKTtcblx0fVxufVxuXG5cblxuZXhwb3J0IGNvbnN0IE5FV19QUk9NUFRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guY29tbWFuZC5uZXcucHJvbXB0JztcbmV4cG9ydCBjb25zdCBORVdfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmNvbW1hbmQubmV3Lmluc3RydWN0aW9ucyc7XG5leHBvcnQgY29uc3QgTkVXX0FHRU5UX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmNvbW1hbmQubmV3LmFnZW50JztcbmV4cG9ydCBjb25zdCBORVdfU0tJTExfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guY29tbWFuZC5uZXcuc2tpbGwnO1xuXG5jbGFzcyBOZXdQcm9tcHRGaWxlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3ROZXdQcm9tcHRGaWxlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoTkVXX1BST01QVF9DT01NQU5EX0lELCBsb2NhbGl6ZSgnY29tbWFuZHMubmV3LnByb21wdC5sb2NhbC50aXRsZScsIFwiTmV3IFByb21wdCBGaWxlLi4uXCIpLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHR9XG59XG5cbmNsYXNzIE5ld0luc3RydWN0aW9uc0ZpbGVBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdE5ld1Byb21wdEZpbGVBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihORVdfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsIGxvY2FsaXplKCdjb21tYW5kcy5uZXcuaW5zdHJ1Y3Rpb25zLmxvY2FsLnRpdGxlJywgXCJOZXcgSW5zdHJ1Y3Rpb25zIEZpbGUuLi5cIiksIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgTmV3QWdlbnRGaWxlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3ROZXdQcm9tcHRGaWxlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoTkVXX0FHRU5UX0NPTU1BTkRfSUQsIGxvY2FsaXplKCdjb21tYW5kcy5uZXcuYWdlbnQubG9jYWwudGl0bGUnLCBcIk5ldyBDdXN0b20gQWdlbnQuLi5cIiksIFByb21wdHNUeXBlLmFnZW50KTtcblx0fVxufVxuXG5jbGFzcyBOZXdTa2lsbEZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5FV19TS0lMTF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb21tYW5kcy5uZXcuc2tpbGwubG9jYWwudGl0bGUnLCBcIk5ldyBTa2lsbCBGaWxlLi4uXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM/OiBJTmV3UHJvbXB0T3B0aW9ucykge1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdGxldCBmb2xkZXJVcmk6IFVSSTtcblx0XHRpZiAob3B0aW9ucz8udGFyZ2V0Rm9sZGVyKSB7XG5cdFx0XHRmb2xkZXJVcmkgPSBvcHRpb25zLnRhcmdldEZvbGRlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRGb2xkZXIgPSBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXNrRm9yUHJvbXB0U291cmNlRm9sZGVyLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRpZiAoIXNlbGVjdGVkRm9sZGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvbGRlclVyaSA9IHNlbGVjdGVkRm9sZGVyLnVyaTtcblx0XHR9XG5cblx0XHQvLyBBc2sgZm9yIHNraWxsIG5hbWUgKHdpbGwgYmUgdGhlIGZvbGRlciBuYW1lKVxuXHRcdC8vIFBlciBhZ2VudHNraWxscy5pby9zcGVjaWZpY2F0aW9uOiBuYW1lIG11c3QgYmUgMS02NCBjaGFycywgbG93ZXJjYXNlIGFscGhhbnVtZXJpYyArIGh5cGhlbnMsXG5cdFx0Ly8gbm8gbGVhZGluZy90cmFpbGluZyBoeXBoZW5zLCBubyBjb25zZWN1dGl2ZSBoeXBoZW5zLCBtdXN0IG1hdGNoIGZvbGRlciBuYW1lXG5cdFx0Y29uc3Qgc2tpbGxOYW1lID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgnY29tbWFuZHMubmV3LnNraWxsLm5hbWUucHJvbXB0JywgXCJFbnRlciBhIG5hbWUgZm9yIHRoZSBza2lsbCAobG93ZXJjYXNlIGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zIG9ubHkpXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdjb21tYW5kcy5uZXcuc2tpbGwubmFtZS5wbGFjZWhvbGRlcicsIFwiZS5nLiwgcGRmLXByb2Nlc3NpbmcsIGRhdGEtYW5hbHlzaXNcIiksXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0aWYgKCF2YWx1ZSB8fCAhdmFsdWUudHJpbSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb21tYW5kcy5uZXcuc2tpbGwubmFtZS5yZXF1aXJlZCcsIFwiU2tpbGwgbmFtZSBpcyByZXF1aXJlZFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuYW1lID0gdmFsdWUudHJpbSgpO1xuXHRcdFx0XHRpZiAobmFtZS5sZW5ndGggPiA2NCkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY29tbWFuZHMubmV3LnNraWxsLm5hbWUudG9vTG9uZycsIFwiU2tpbGwgbmFtZSBtdXN0IGJlIDY0IGNoYXJhY3RlcnMgb3IgbGVzc1wiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBQZXIgc3BlYzogbG93ZXJjYXNlIGFscGhhbnVtZXJpYyBhbmQgaHlwaGVucyBvbmx5XG5cdFx0XHRcdGlmICghVkFMSURfU0tJTExfTkFNRV9SRUdFWC50ZXN0KG5hbWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb21tYW5kcy5uZXcuc2tpbGwubmFtZS5pbnZhbGlkQ2hhcnMnLCBcIlNraWxsIG5hbWUgbWF5IG9ubHkgY29udGFpbiBsb3dlcmNhc2UgbGV0dGVycywgbnVtYmVycywgYW5kIGh5cGhlbnNcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5hbWUuc3RhcnRzV2l0aCgnLScpIHx8IG5hbWUuZW5kc1dpdGgoJy0nKSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY29tbWFuZHMubmV3LnNraWxsLm5hbWUuaHlwaGVuRWRnZScsIFwiU2tpbGwgbmFtZSBtdXN0IG5vdCBzdGFydCBvciBlbmQgd2l0aCBhIGh5cGhlblwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmFtZS5pbmNsdWRlcygnLS0nKSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY29tbWFuZHMubmV3LnNraWxsLm5hbWUuY29uc2VjdXRpdmVIeXBoZW5zJywgXCJTa2lsbCBuYW1lIG11c3Qgbm90IGNvbnRhaW4gY29uc2VjdXRpdmUgaHlwaGVuc1wiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFza2lsbE5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cmltbWVkTmFtZSA9IHNraWxsTmFtZS50cmltKCk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHNraWxsIGZvbGRlciBhbmQgU0tJTEwubWQgZmlsZVxuXHRcdGNvbnN0IHNraWxsRm9sZGVyID0gVVJJLmpvaW5QYXRoKGZvbGRlclVyaSwgdHJpbW1lZE5hbWUpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihza2lsbEZvbGRlcik7XG5cblx0XHRjb25zdCBza2lsbEZpbGVVcmkgPSBVUkkuam9pblBhdGgoc2tpbGxGb2xkZXIsIFNLSUxMX0ZJTEVOQU1FKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKHNraWxsRmlsZVVyaSk7XG5cblx0XHRsZXQgZWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnM/Lm9wZW5GaWxlKSB7XG5cdFx0XHRlZGl0b3IgPSBhd2FpdCBvcHRpb25zLm9wZW5GaWxlKHNraWxsRmlsZVVyaSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3Blbihza2lsbEZpbGVVcmkpO1xuXHRcdFx0ZWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHR9XG5cdFx0aWYgKGVkaXRvciAmJiBlZGl0b3IuaGFzTW9kZWwoKSAmJiBpc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpLnVyaSwgc2tpbGxGaWxlVXJpKSkge1xuXHRcdFx0U25pcHBldENvbnRyb2xsZXIyLmdldChlZGl0b3IpPy5hcHBseShbe1xuXHRcdFx0XHRyYW5nZTogZWRpdG9yLmdldE1vZGVsKCkuZ2V0RnVsbE1vZGVsUmFuZ2UoKSxcblx0XHRcdFx0dGVtcGxhdGU6IGdldERlZmF1bHRDb250ZW50U25pcHBldChQcm9tcHRzVHlwZS5za2lsbCwgdHJpbW1lZE5hbWUsIFRhcmdldC5VbmRlZmluZWQpLFxuXHRcdFx0fV0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBOZXdVbnRpdGxlZFByb21wdEZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guY29tbWFuZC5uZXcudW50aXRsZWQucHJvbXB0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbW1hbmRzLm5ldy51bnRpdGxlZC5wcm9tcHQudGl0bGUnLCBcIk5ldyBVbnRpdGxlZCBQcm9tcHQgRmlsZVwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBnZXRMYW5ndWFnZUlkRm9yUHJvbXB0c1R5cGUoUHJvbXB0c1R5cGUucHJvbXB0KTtcblxuXHRcdGNvbnN0IGlucHV0ID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRwaW5uZWQ6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCB0eXBlID0gUHJvbXB0c1R5cGUucHJvbXB0O1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoZWRpdG9yICYmIGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KGVkaXRvcik/LmFwcGx5KFt7XG5cdFx0XHRcdHJhbmdlOiBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRGdWxsTW9kZWxSYW5nZSgpLFxuXHRcdFx0XHR0ZW1wbGF0ZTogZ2V0RGVmYXVsdENvbnRlbnRTbmlwcGV0KHR5cGUsIHVuZGVmaW5lZCwgVGFyZ2V0LlVuZGVmaW5lZCksXG5cdFx0XHR9XSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlck5ld1Byb21wdEZpbGVBY3Rpb25zKCk6IHZvaWQge1xuXHRyZWdpc3RlckFjdGlvbjIoTmV3UHJvbXB0RmlsZUFjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihOZXdJbnN0cnVjdGlvbnNGaWxlQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKE5ld0FnZW50RmlsZUFjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihOZXdTa2lsbEZpbGVBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoTmV3VW50aXRsZWRQcm9tcHRGaWxlQWN0aW9uKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBa0M7QUFDM0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0IscUJBQXFCLGdCQUFnQjtBQUNwRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QixhQUFhLGNBQWM7QUFDakUsU0FBUyxnQ0FBZ0Msb0JBQW9CO0FBQzdELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CLGdCQUFnQiw4QkFBOEI7QUFDM0UsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUI7QUFtQjFCLE1BQU0sb0NBQW9DLFFBQVE7QUFBQSxFQUVqRCxZQUFZLElBQVksT0FBZ0MsTUFBbUI7QUFDMUUsVUFBTTtBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJO0FBQUEsTUFDSixjQUFjLGdCQUFnQjtBQUFBLE1BQzlCLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxRQUNYLFFBQVEsaUJBQWlCO0FB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
