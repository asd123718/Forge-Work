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
import { localize } from "../../../../../../nls.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { basename, dirname, extUri, joinPath } from "../../../../../../base/common/resources.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { getCleanPromptName, getSkillFolderName } from "../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType, INSTRUCTIONS_DOCUMENTATION_URL, AGENT_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL, SKILL_DOCUMENTATION_URL, HOOK_DOCUMENTATION_URL } from "../../../common/promptSyntax/promptTypes.js";
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from "../newPromptFileActions.js";
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID, GENERATE_SKILL_COMMAND_ID, GENERATE_AGENT_COMMAND_ID } from "../../actions/chatActions.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { askForPromptFileName } from "./askForPromptName.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { askForPromptSourceFolder } from "./askForPromptSourceFolder.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { PromptFileRewriter } from "../promptFileRewriter.js";
import { isOrganizationPromptFile } from "../../../common/promptSyntax/utils/promptsServiceUtils.js";
import { assertNever } from "../../../../../../base/common/assert.js";
function newHelpButton(type) {
  const iconClass = ThemeIcon.asClassName(Codicon.question);
  switch (type) {
    case PromptsType.prompt:
      return {
        tooltip: localize("help.prompt", "Show help on prompt files"),
        helpURI: URI.parse(PROMPT_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.instructions:
      return {
        tooltip: localize("help.instructions", "Show help on instruction files"),
        helpURI: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.agent:
      return {
        tooltip: localize("help.agent", "Show help on custom agent files"),
        helpURI: URI.parse(AGENT_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.skill:
      return {
        tooltip: localize("help.skill", "Show help on skill files"),
        helpURI: URI.parse(SKILL_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.hook:
      return {
        tooltip: localize("help.hook", "Show help on hook files"),
        helpURI: URI.parse(HOOK_DOCUMENTATION_URL),
        iconClass
      };
  }
}
function isHelpButton(button) {
  return button.helpURI !== void 0;
}
function isPromptFileItem(item) {
  return item.type === "item" && !!item.promptFileUri;
}
function isExtensionPromptPath(prompt) {
  return prompt.storage === PromptsStorage.extension && !!prompt.extension;
}
const NEW_PROMPT_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-promptfile.select-dialog.label",
    "New prompt file..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.prompt)],
  commandId: NEW_PROMPT_COMMAND_ID
};
const NEW_INSTRUCTIONS_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-instructionsfile.select-dialog.label",
    "New instruction file..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.instructions)],
  commandId: NEW_INSTRUCTIONS_COMMAND_ID
};
const GENERATE_AGENT_INSTRUCTIONS_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-agent-instructions.select-dialog.label",
    "Generate agent instructions..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.instructions)],
  commandId: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID
};
const GENERATE_ON_DEMAND_INSTRUCTIONS_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-on-demand-instructions.select-dialog.label",
    "Generate on-demand instructions..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.instructions)],
  commandId: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID
};
const NEW_AGENT_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-agentfile.select-dialog.label",
    "Create new custom agent..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.agent)],
  commandId: NEW_AGENT_COMMAND_ID
};
const NEW_SKILL_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-skill.select-dialog.label",
    "New skill..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.skill)],
  commandId: NEW_SKILL_COMMAND_ID
};
const GENERATE_PROMPT_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-prompt.select-dialog.label",
    "Generate prompt..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.prompt)],
  commandId: GENERATE_PROMPT_COMMAND_ID
};
const GENERATE_SKILL_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-skill.select-dialog.label",
    "Generate skill..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.skill)],
  commandId: GENERATE_SKILL_COMMAND_ID
};
const GENERATE_AGENT_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-agent.select-dialog.label",
    "Generate agent..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.agent)],
  commandId: GENERATE_AGENT_COMMAND_ID
};
const EDIT_BUTTON = {
  tooltip: localize("open", "Open in Editor"),
  iconClass: ThemeIcon.asClassName(Codicon.fileCode)
};
const DELETE_BUTTON = {
  tooltip: localize("delete", "Delete"),
  iconClass: ThemeIcon.asClassName(Codicon.trash)
};
const RENAME_BUTTON = {
  tooltip: localize("rename", "Move and/or Rename"),
  iconClass: ThemeIcon.asClassName(Codicon.replace)
};
const COPY_BUTTON = {
  tooltip: localize("makeACopy", "Make a Copy"),
  iconClass: ThemeIcon.asClassName(Codicon.copy)
};
const MAKE_VISIBLE_BUTTON = {
  tooltip: localize("makeVisible", "Hidden from chat view agent picker. Click to show."),
  iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
  alwaysVisible: true
};
const MAKE_INVISIBLE_BUTTON = {
  tooltip: localize("makeInvisible", "Shown in chat view agent picker. Click to hide."),
  iconClass: ThemeIcon.asClassName(Codicon.eye)
};
const RUN_IN_CHAT_BUTTON = {
  tooltip: localize("runInChat", "Run in Chat View"),
  iconClass: ThemeIcon.asClassName(Codicon.play)
};
let PromptFilePickers = class {
  constructor(_quickInputService, _openerService, _fileService, _dialogService, _commandService, _instaService, _promptsService, _labelService, _productService) {
    this._quickInputService = _quickInputService;
    this._openerService = _openerService;
    this._fileService = _fileService;
    this._dialogService = _dialogService;
    this._commandService = _commandService;
    this._instaService = _instaService;
    this._promptsService = _promptsService;
    this._labelService = _labelService;
    this._productService = _productService;
  }
  /**
   * Shows the prompt file selection dialog to the user that allows to run a prompt file(s).
   *
   * If {@link ISelectOptions.resource resource} is provided, the dialog will have
   * the resource pre-selected in the prompts list.
   */
  async selectPromptFile(options) {
    const cts = new CancellationTokenSource();
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    quickPick.busy = true;
    quickPick.placeholder = localize("searching", "Searching file system...");
    try {
      const fileOptions = await this._createPromptPickItems(options, cts.token);
      const activeItem = options.resource && fileOptions.find((f) => f.type === "item" && extUri.isEqual(f.promptFileUri, options.resource));
      if (activeItem) {
        quickPick.activeItems = [activeItem];
      }
      quickPick.placeholder = options.placeholder;
      quickPick.matchOnDescription = true;
      quickPick.items = fileOptions;
    } finally {
      quickPick.busy = false;
    }
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let isResolved = false;
      let isClosed = false;
      disposables.add(quickPick);
      disposables.add(cts);
      const refreshItems = async () => {
        const active = quickPick.activeItems;
        const newItems = await this._createPromptPickItems(options, CancellationToken.None);
        quickPick.items = newItems;
        quickPick.activeItems = active;
      };
      disposables.add(quickPick.onDidAccept(async () => {
        const { selectedItems } = quickPick;
        const { keyMods } = quickPick;
        const selectedItem = selectedItems[0];
        if (isPromptFileItem(selectedItem)) {
          resolve({ promptFile: selectedItem.promptFileUri, keyMods: { ...keyMods } });
          isResolved = true;
        } else {
          if (selectedItem.commandId) {
            await this._commandService.executeCommand(selectedItem.commandId);
            return;
          }
        }
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
        if (!isClosed && shouldRefresh) {
          await refreshItems();
        }
      }));
      disposables.add(quickPick.onDidHide(() => {
        if (!quickPick.ignoreFocusOut) {
          disposables.dispose();
          isClosed = true;
          if (!isResolved) {
            resolve(void 0);
            isResolved = true;
          }
        }
      }));
      quickPick.show();
    });
  }
  async _createPromptPickItems(options, token) {
    const buttons = [];
    if (options.type === PromptsType.prompt && options.optionRun !== false) {
      buttons.push(RUN_IN_CHAT_BUTTON);
    }
    if (options.optionEdit !== false) {
      buttons.push(EDIT_BUTTON);
    }
    if (options.optionCopy !== false) {
      buttons.push(COPY_BUTTON);
    }
    if (options.optionRename !== false) {
      buttons.push(RENAME_BUTTON);
    }
    if (options.optionDelete !== false) {
      buttons.push(DELETE_BUTTON);
    }
    const result = [];
    if (options.optionNew !== false) {
      result.push(...this._getNewItems(options.type));
    }
    let getVisibility = () => void 0;
    if (options.optionVisibility) {
      const disabled = this._promptsService.getDisabledPromptFiles(options.type);
      getVisibility = (p) => !disabled.has(p.uri);
    }
    const sortByLabel = (items) => items.sort((a, b) => a.label.localeCompare(b.label));
    const locals = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.local, token);
    if (locals.length) {
      result.push({ type: "separator", label: localize("separator.workspace", "Workspace") });
      result.push(...sortByLabel(await Promise.all(locals.map((l) => this._createPromptPickItem(l, buttons, getVisibility(l), token)))));
    }
    let agentInstructionFiles = [];
    if (options.type === PromptsType.instructions) {
      const agentInstructionUris = await this._promptsService.listAgentInstructions(token);
      agentInstructionFiles = agentInstructionUris.map((agentInstructionFile) => {
        const folderName = this._labelService.getUriLabel(dirname(agentInstructionFile.uri), { relative: true });
        return {
          uri: agentInstructionFile.uri,
          description: agentInstructionFile.type !== AgentInstructionFileType.copilotInstructionsMd ? folderName : void 0,
          storage: PromptsStorage.local,
          type: options.type
        };
      });
    }
    if (agentInstructionFiles.length) {
      const agentButtons = buttons.filter((b) => b !== RENAME_BUTTON);
      result.push({ type: "separator", label: localize("separator.workspace-agent-instructions", "Agent Instructions") });
      result.push(...sortByLabel(await Promise.all(agentInstructionFiles.map((l) => this._createPromptPickItem(l, agentButtons, getVisibility(l), token)))));
    }
    const exts = (await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.extension, token)).filter(isExtensionPromptPath);
    if (exts.length) {
      const extButtons = [];
      if (options.type === PromptsType.prompt && options.optionRun !== false) {
        extButtons.push(RUN_IN_CHAT_BUTTON);
      }
      if (options.optionEdit !== false) {
        extButtons.push(EDIT_BUTTON);
      }
      if (options.optionCopy !== false) {
        extButtons.push(COPY_BUTTON);
      }
      const groupedExts = /* @__PURE__ */ new Map();
      for (const ext of exts) {
        const groupLabel = this._getExtensionGroupLabel(ext);
        if (!groupedExts.has(groupLabel)) {
          groupedExts.set(groupLabel, []);
        }
        groupedExts.get(groupLabel).push(ext);
      }
      const sortedGroupedExts = Array.from(groupedExts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [groupLabel, groupExts] of sortedGroupedExts) {
        result.push({ type: "separator", label: groupLabel });
        result.push(...sortByLabel(await Promise.all(groupExts.map((e) => this._createPromptPickItem(e, extButtons, getVisibility(e), token)))));
      }
    }
    const users = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.user, token);
    if (users.length) {
      result.push({ type: "separator", label: localize("separator.user", "User Data") });
      result.push(...sortByLabel(await Promise.all(users.map((u) => this._createPromptPickItem(u, buttons, getVisibility(u), token)))));
    }
    const plugins = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.plugin, token);
    if (plugins.length) {
      const pluginButtons = [];
      if (options.optionCopy !== false) {
        pluginButtons.push(COPY_BUTTON);
      }
      result.push({ type: "separator", label: localize("separator.plugins", "Plugins") });
      result.push(...sortByLabel(await Promise.all(plugins.map((p) => this._createPromptPickItem(p, pluginButtons, getVisibility(p), token)))));
    }
    return result;
  }
  _getExtensionGroupLabel(extPath) {
    if (isOrganizationPromptFile(extPath.uri, extPath.extension.identifier, this._productService)) {
      return localize("separator.organization", "Organization");
    }
    return localize("separator.extensions", "Extensions");
  }
  _getNewItems(type) {
    switch (type) {
      case PromptsType.prompt:
        return [NEW_PROMPT_FILE_OPTION, GENERATE_PROMPT_OPTION];
      case PromptsType.instructions:
        return [NEW_INSTRUCTIONS_FILE_OPTION, GENERATE_ON_DEMAND_INSTRUCTIONS_OPTION, GENERATE_AGENT_INSTRUCTIONS_OPTION];
      case PromptsType.agent:
        return [NEW_AGENT_FILE_OPTION, GENERATE_AGENT_OPTION];
      case PromptsType.skill:
        return [NEW_SKILL_FILE_OPTION, GENERATE_SKILL_OPTION];
      default:
        throw new Error(`Unknown prompt type '${type}'.`);
    }
  }
  async _createPromptPickItem(promptFile, buttons, visibility, token) {
    const parsedPromptFile = await this._promptsService.parseNew(promptFile.uri, token).catch(() => void 0);
    let promptName = (parsedPromptFile?.header?.name ?? promptFile.name) || (promptFile.type === PromptsType.skill ? getSkillFolderName(promptFile.uri) : getCleanPromptName(promptFile.uri));
    const promptDescription = parsedPromptFile?.header?.description ?? promptFile.description;
    let tooltip;
    switch (promptFile.storage) {
      case PromptsStorage.extension:
        tooltip = promptFile.extension.displayName ?? promptFile.extension.id;
        break;
      case PromptsStorage.local:
        tooltip = this._labelService.getUriLabel(dirname(promptFile.uri), { relative: true });
        break;
      case PromptsStorage.user:
        tooltip = void 0;
        break;
      case PromptsStorage.plugin:
        tooltip = promptFile.name;
        break;
      case PromptsStorage.builtIn:
        tooltip = void 0;
        break;
      default:
        assertNever(promptFile);
    }
    let iconClass;
    if (visibility === false) {
      buttons = (buttons ?? []).concat(MAKE_VISIBLE_BUTTON);
      promptName = localize("hiddenLabelInfo", "{0} (hidden)", promptName);
      tooltip = localize("hiddenInAgentPicker", "Hidden from chat view agent picker");
    } else if (visibility === true) {
      buttons = (buttons ?? []).concat(MAKE_INVISIBLE_BUTTON);
    }
    return {
      id: promptFile.uri.toString(),
      type: "item",
      label: promptName,
      description: promptDescription,
      iconClass,
      tooltip,
      promptFileUri: promptFile.uri,
      buttons
    };
  }
  async keepQuickPickOpen(quickPick, work) {
    const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
    quickPick.ignoreFocusOut = true;
    try {
      return await work();
    } finally {
      quickPick.ignoreFocusOut = previousIgnoreFocusOut;
      quickPick.show();
    }
  }
  async _handleButtonClick(quickPick, context, options) {
    const { item, button } = context;
    if (!isPromptFileItem(item)) {
      if (isHelpButton(button)) {
        await this._openerService.open(button.helpURI);
        return false;
      }
      throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
    }
    const value = item.promptFileUri;
    if (button === RUN_IN_CHAT_BUTTON) {
      const commandId = quickPick.keyMods.ctrlCmd === true ? "workbench.action.chat.run-in-new-chat.prompt.current" : "workbench.action.chat.run.prompt.current";
      await this._commandService.executeCommand(commandId, value);
      quickPick.hide();
      return false;
    }
    if (button === EDIT_BUTTON) {
      await this._openerService.open(value);
      return false;
    }
    if (button === RENAME_BUTTON || button === COPY_BUTTON) {
      return await this.keepQuickPickOpen(quickPick, async () => {
        const currentFolder = dirname(value);
        const isMove = button === RENAME_BUTTON && quickPick.keyMods.ctrlCmd;
        const newFolder = await this._instaService.invokeFunction(askForPromptSourceFolder, options.type, currentFolder, isMove);
        if (!newFolder) {
          return false;
        }
        const newName = await this._instaService.invokeFunction(askForPromptFileName, options.type, newFolder.uri, item.label);
        if (!newName) {
          return false;
        }
        const newFile = joinPath(newFolder.uri, newName);
        if (isMove) {
          await this._fileService.move(value, newFile);
        } else {
          await this._fileService.copy(value, newFile);
        }
        await this._openerService.open(newFile);
        await this._instaService.createInstance(PromptFileRewriter).openAndRewriteName(newFile, getCleanPromptName(newFile), CancellationToken.None);
        return true;
      });
    }
    if (button === DELETE_BUTTON) {
      return await this.keepQuickPickOpen(quickPick, async () => {
        const isSkill = options.type === PromptsType.skill;
        const filename = isSkill ? basename(dirname(value)) : item.label;
        const message = isSkill ? localize("commands.prompts.use.select-dialog.delete-skill.confirm.message", "Are you sure you want to delete skill '{0}' and its folder?", filename) : localize("commands.prompts.use.select-dialog.delete-prompt.confirm.message", "Are you sure you want to delete '{0}'?", filename);
        const { confirmed } = await this._dialogService.confirm({ message });
        if (!confirmed) {
          return false;
        }
        const deleteTarget = isSkill ? dirname(value) : value;
        await this._fileService.del(deleteTarget, { recursive: isSkill, useTrash: true });
        return true;
      });
    }
    if (button === MAKE_VISIBLE_BUTTON || button === MAKE_INVISIBLE_BUTTON) {
      const disabled = this._promptsService.getDisabledPromptFiles(options.type);
      if (button === MAKE_VISIBLE_BUTTON) {
        disabled.delete(value);
      } else {
        disabled.add(value);
      }
      this._promptsService.setDisabledPromptFiles(options.type, disabled);
      return true;
    }
    throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
  }
  // --- Enablement Configuration -------------------------------------------------------
  /**
   * Shows a multi-select (checkbox) quick pick to configure which prompt files of the given
   * type are enabled. Currently only used for agent prompt files.
   */
  async managePromptFiles(type, placeholder) {
    const cts = new CancellationTokenSource();
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    quickPick.placeholder = placeholder;
    quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.sortByLabel = false;
    quickPick.busy = true;
    const options = {
      placeholder: "",
      type,
      optionNew: true,
      optionEdit: true,
      optionDelete: true,
      optionRename: true,
      optionCopy: true,
      optionVisibility: false,
      optionRun: false
    };
    try {
      const items = await this._createPromptPickItems(options, cts.token);
      quickPick.items = items;
    } finally {
      quickPick.busy = false;
    }
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      disposables.add(quickPick);
      disposables.add(cts);
      let isClosed = false;
      let isResolved = false;
      const refreshItems = async () => {
        const active = quickPick.activeItems;
        const newItems = await this._createPromptPickItems(options, CancellationToken.None);
        quickPick.items = newItems;
        quickPick.activeItems = active;
      };
      disposables.add(quickPick.onDidAccept(async () => {
        const clickedItem = quickPick.activeItems;
        if (clickedItem.length === 1 && clickedItem[0].commandId) {
          const commandId = clickedItem[0].commandId;
          await this.keepQuickPickOpen(quickPick, async () => {
            await this._commandService.executeCommand(commandId);
          });
          if (!isClosed) {
            await refreshItems();
          }
          return;
        }
        isResolved = true;
        resolve(true);
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
        if (!isClosed && shouldRefresh) {
          await refreshItems();
        }
      }));
      disposables.add(quickPick.onDidHide(() => {
        if (!quickPick.ignoreFocusOut) {
          disposables.dispose();
          isClosed = true;
          if (!isResolved) {
            resolve(false);
            isResolved = true;
          }
        }
      }));
      quickPick.show();
    });
  }
};
PromptFilePickers = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IPromptsService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IProductService)
], PromptFilePickers);
export {
  PromptFilePickers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxccGlja2Vyc1xccHJvbXB0RmlsZVBpY2tlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUsIElFeHRlbnNpb25Qcm9tcHRQYXRoLCBJUHJvbXB0UGF0aCwgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgZXh0VXJpLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRDbGVhblByb21wdE5hbWUsIGdldFNraWxsRm9sZGVyTmFtZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIElOU1RSVUNUSU9OU19ET0NVTUVOVEFUSU9OX1VSTCwgQUdFTlRfRE9DVU1FTlRBVElPTl9VUkwsIFBST01QVF9ET0NVTUVOVEFUSU9OX1VSTCwgU0tJTExfRE9DVU1FTlRBVElPTl9VUkwsIEhPT0tfRE9DVU1FTlRBVElPTl9VUkwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IE5FV19QUk9NUFRfQ09NTUFORF9JRCwgTkVXX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELCBORVdfQUdFTlRfQ09NTUFORF9JRCwgTkVXX1NLSUxMX0NPTU1BTkRfSUQgfSBmcm9tICcuLi9uZXdQcm9tcHRGaWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCwgR0VORVJBVEVfT05fREVNQU5EX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELCBHRU5FUkFURV9QUk9NUFRfQ09NTUFORF9JRCwgR0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCwgR0VORVJBVEVfQUdFTlRfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUtleU1vZHMsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50LCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBhc2tGb3JQcm9tcHRGaWxlTmFtZSB9IGZyb20gJy4vYXNrRm9yUHJvbXB0TmFtZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBhc2tGb3JQcm9tcHRTb3VyY2VGb2xkZXIgfSBmcm9tICcuL2Fza0ZvclByb21wdFNvdXJjZUZvbGRlci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVSZXdyaXRlciB9IGZyb20gJy4uL3Byb21wdEZpbGVSZXdyaXRlci5qcyc7XG5pbXBvcnQgeyBpc09yZ2FuaXphdGlvblByb21wdEZpbGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdHNTZXJ2aWNlVXRpbHMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHRoZSB7QGxpbmsgYXNrVG9TZWxlY3RJbnN0cnVjdGlvbnN9IGZ1bmN0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZWxlY3RPcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIHRleHQgc2hvd3MgYXMgcGxhY2Vob2xkZXIgaW4gdGhlIHNlbGVjdGlvbiBkaWFsb2cuXG5cdCAqL1xuXHRyZWFkb25seSBwbGFjZWhvbGRlcjogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBQcm9tcHQgcmVzb3VyY2UgYFVSSWAgdG8gYXR0YWNoIHRvIHRoZSBjaGF0IGlucHV0LCBpZiBhbnkuXG5cdCAqIElmIHByb3ZpZGVkIHRoZSByZXNvdXJjZSB3aWxsIGJlIHByZS1zZWxlY3RlZCBpbiB0aGUgcHJvbXB0IHBpY2tlciBkaWFsb2csXG5cdCAqIG90aGVyd2lzZSB0aGUgZGlhbG9nIHdpbGwgc2hvdyB0aGUgcHJvbXB0cyBsaXN0IHdpdGhvdXQgYW55IHByZS1zZWxlY3Rpb24uXG5cdCAqL1xuXHRyZWFkb25seSByZXNvdXJjZT86IFVSSTtcblxuXHRyZWFkb25seSB0eXBlOiBQcm9tcHRzVHlwZTtcblxuXHRyZWFkb25seSBvcHRpb25OZXc/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcHRpb25FZGl0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3B0aW9uRGVsZXRlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3B0aW9uUmVuYW1lPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3B0aW9uQ29weT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9wdGlvblZpc2liaWxpdHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcHRpb25SdW4/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWxlY3RQcm9tcHRSZXN1bHQge1xuXHQvKipcblx0ICogVGhlIHNlbGVjdGVkIHByb21wdCBmaWxlLlxuXHQgKi9cblx0cmVhZG9ubHkgcHJvbXB0RmlsZTogVVJJO1xuXG5cdC8qKlxuXHQgKiBUaGUga2V5IG1vZGlmaWVycyB0aGF0IHdlcmUgcHJlc3NlZCB3aGVuIHRoZSBwcm9tcHQgd2FzIHNlbGVjdGVkLlxuXHQgKi9cblx0cmVhZG9ubHkga2V5TW9kczogSUtleU1vZHM7XG59XG5cbi8qKlxuICogQnV0dG9uIHRoYXQgb3BlbnMgdGhlIGRvY3VtZW50YXRpb24uXG4gKi9cbmZ1bmN0aW9uIG5ld0hlbHBCdXR0b24odHlwZTogUHJvbXB0c1R5cGUpOiBJUXVpY2tJbnB1dEJ1dHRvbiAmIHsgaGVscFVSSTogVVJJIH0ge1xuXHRjb25zdCBpY29uQ2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5xdWVzdGlvbik7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2hlbHAucHJvbXB0JywgXCJTaG93IGhlbHAgb24gcHJvbXB0IGZpbGVzXCIpLFxuXHRcdFx0XHRoZWxwVVJJOiBVUkkucGFyc2UoUFJPTVBUX0RPQ1VNRU5UQVRJT05fVVJMKSxcblx0XHRcdFx0aWNvbkNsYXNzXG5cdFx0XHR9O1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2hlbHAuaW5zdHJ1Y3Rpb25zJywgXCJTaG93IGhlbHAgb24gaW5zdHJ1Y3Rpb24gZmlsZXNcIiksXG5cdFx0XHRcdGhlbHBVUkk6IFVSSS5wYXJzZShJTlNUUlVDVElPTlNfRE9DVU1FTlRBVElPTl9VUkwpLFxuXHRcdFx0XHRpY29uQ2xhc3Ncblx0XHRcdH07XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdoZWxwLmFnZW50JywgXCJTaG93IGhlbHAgb24gY3VzdG9tIGFnZW50IGZpbGVzXCIpLFxuXHRcdFx0XHRoZWxwVVJJOiBVUkkucGFyc2UoQUdFTlRfRE9DVU1FTlRBVElPTl9VUkwpLFxuXHRcdFx0XHRpY29uQ2xhc3Ncblx0XHRcdH07XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdoZWxwLnNraWxsJywgXCJTaG93IGhlbHAgb24gc2tpbGwgZmlsZXNcIiksXG5cdFx0XHRcdGhlbHBVUkk6IFVSSS5wYXJzZShTS0lMTF9ET0NVTUVOVEFUSU9OX1VSTCksXG5cdFx0XHRcdGljb25DbGFzc1xuXHRcdFx0fTtcblx0XHRjYXNlIFByb21wdHNUeXBlLmhvb2s6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnaGVscC5ob29rJywgXCJTaG93IGhlbHAgb24gaG9vayBmaWxlc1wiKSxcblx0XHRcdFx0aGVscFVSSTogVVJJLnBhcnNlKEhPT0tfRE9DVU1FTlRBVElPTl9VUkwpLFxuXHRcdFx0XHRpY29uQ2xhc3Ncblx0XHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNIZWxwQnV0dG9uKGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24pOiBidXR0b24gaXMgSVF1aWNrSW5wdXRCdXR0b24gJiB7IGhlbHBVUkk6IFVSSSB9IHtcblx0cmV0dXJuICg8eyBoZWxwVVJJOiBVUkkgfT5idXR0b24pLmhlbHBVUkkgIT09IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXG5cdHR5cGU6ICdpdGVtJztcblxuXHQvKipcblx0ICogVGhlIFVSSSBvZiB0aGUgcHJvbXB0IGZpbGUuXG5cdCAqL1xuXHRwcm9tcHRGaWxlVXJpPzogVVJJO1xuXG5cdC8qKlxuXHQgKiBUaGUgY29tbWFuZCBJRCB0byBleGVjdXRlIHdoZW4gdGhpcyBpdGVtIGlzIHNlbGVjdGVkLlxuXHQgKi9cblx0Y29tbWFuZElkPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc1Byb21wdEZpbGVJdGVtKGl0ZW06IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcik6IGl0ZW0gaXMgSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gJiB7IHByb21wdEZpbGVVcmk6IFVSSSB9IHtcblx0cmV0dXJuIGl0ZW0udHlwZSA9PT0gJ2l0ZW0nICYmICEhaXRlbS5wcm9tcHRGaWxlVXJpO1xufVxuXG4vKipcbiAqIFR5cGUgZ3VhcmQgZm9yIGV4dGVuc2lvbiBwcm9tcHQgcGF0aHMuXG4gKi9cbmZ1bmN0aW9uIGlzRXh0ZW5zaW9uUHJvbXB0UGF0aChwcm9tcHQ6IElQcm9tcHRQYXRoKTogcHJvbXB0IGlzIElFeHRlbnNpb25Qcm9tcHRQYXRoIHtcblx0cmV0dXJuIHByb21wdC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24gJiYgISFwcm9tcHQuZXh0ZW5zaW9uO1xufVxuXG50eXBlIElQcm9tcHRRdWlja1BpY2sgPSBJUXVpY2tQaWNrPElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT47XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBzdGFydHMgdGhlICdOZXcgUHJvbXB0IEZpbGUnIGNvbW1hbmQuXG4gKi9cbmNvbnN0IE5FV19QUk9NUFRfRklMRV9PUFRJT046IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtID0ge1xuXHR0eXBlOiAnaXRlbScsXG5cdGxhYmVsOiBgJChwbHVzKSAke2xvY2FsaXplKFxuXHRcdCdjb21tYW5kcy5uZXctcHJvbXB0ZmlsZS5zZWxlY3QtZGlhbG9nLmxhYmVsJyxcblx0XHQnTmV3IHByb21wdCBmaWxlLi4uJ1xuXHQpfWAsXG5cdHBpY2thYmxlOiBmYWxzZSxcblx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0YnV0dG9uczogW25ld0hlbHBCdXR0b24oUHJvbXB0c1R5cGUucHJvbXB0KV0sXG5cdGNvbW1hbmRJZDogTkVXX1BST01QVF9DT01NQU5EX0lELFxufTtcblxuLyoqXG4gKiBBIHF1aWNrIHBpY2sgaXRlbSB0aGF0IHN0YXJ0cyB0aGUgJ05ldyBJbnN0cnVjdGlvbnMgRmlsZScgY29tbWFuZC5cbiAqL1xuY29uc3QgTkVXX0lOU1RSVUNUSU9OU19GSUxFX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHBsdXMpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLm5ldy1pbnN0cnVjdGlvbnNmaWxlLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdOZXcgaW5zdHJ1Y3Rpb24gZmlsZS4uLicsXG5cdCl9YCxcblx0cGlja2FibGU6IGZhbHNlLFxuXHRhbHdheXNTaG93OiB0cnVlLFxuXHRidXR0b25zOiBbbmV3SGVscEJ1dHRvbihQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpXSxcblx0Y29tbWFuZElkOiBORVdfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEEgcXVpY2sgcGljayBpdGVtIHRoYXQgc3RhcnRzIHRoZSAnR2VuZXJhdGUgQWdlbnQgSW5zdHJ1Y3Rpb25zJyBjb21tYW5kLlxuICovXG5jb25zdCBHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQoc3BhcmtsZSkgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMuZ2VuZXJhdGUtYWdlbnQtaW5zdHJ1Y3Rpb25zLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdHZW5lcmF0ZSBhZ2VudCBpbnN0cnVjdGlvbnMuLi4nLFxuXHQpfWAsXG5cdHBpY2thYmxlOiBmYWxzZSxcblx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0YnV0dG9uczogW25ld0hlbHBCdXR0b24oUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKV0sXG5cdGNvbW1hbmRJZDogR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEEgcXVpY2sgcGljayBpdGVtIHRoYXQgc3RhcnRzIHRoZSAnR2VuZXJhdGUgT24tZGVtYW5kIEluc3RydWN0aW9ucycgY29tbWFuZC5cbiAqL1xuY29uc3QgR0VORVJBVEVfT05fREVNQU5EX0lOU1RSVUNUSU9OU19PUFRJT046IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtID0ge1xuXHR0eXBlOiAnaXRlbScsXG5cdGxhYmVsOiBgJChzcGFya2xlKSAke2xvY2FsaXplKFxuXHRcdCdjb21tYW5kcy5nZW5lcmF0ZS1vbi1kZW1hbmQtaW5zdHJ1Y3Rpb25zLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdHZW5lcmF0ZSBvbi1kZW1hbmQgaW5zdHJ1Y3Rpb25zLi4uJyxcblx0KX1gLFxuXHRwaWNrYWJsZTogZmFsc2UsXG5cdGFsd2F5c1Nob3c6IHRydWUsXG5cdGJ1dHRvbnM6IFtuZXdIZWxwQnV0dG9uKFByb21wdHNUeXBlLmluc3RydWN0aW9ucyldLFxuXHRjb21tYW5kSWQ6IEdFTkVSQVRFX09OX0RFTUFORF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBzdGFydHMgdGhlICdOZXcgQWdlbnQgRmlsZScgY29tbWFuZC5cbiAqL1xuY29uc3QgTkVXX0FHRU5UX0ZJTEVfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQocGx1cykgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMubmV3LWFnZW50ZmlsZS5zZWxlY3QtZGlhbG9nLmxhYmVsJyxcblx0XHQnQ3JlYXRlIG5ldyBjdXN0b20gYWdlbnQuLi4nLFxuXHQpfWAsXG5cdHBpY2thYmxlOiBmYWxzZSxcblx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0YnV0dG9uczogW25ld0hlbHBCdXR0b24oUHJvbXB0c1R5cGUuYWdlbnQpXSxcblx0Y29tbWFuZElkOiBORVdfQUdFTlRfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBzdGFydHMgdGhlICdOZXcgU2tpbGwnIGNvbW1hbmQuXG4gKi9cbmNvbnN0IE5FV19TS0lMTF9GSUxFX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHBsdXMpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLm5ldy1za2lsbC5zZWxlY3QtZGlhbG9nLmxhYmVsJyxcblx0XHQnTmV3IHNraWxsLi4uJyxcblx0KX1gLFxuXHRwaWNrYWJsZTogZmFsc2UsXG5cdGFsd2F5c1Nob3c6IHRydWUsXG5cdGJ1dHRvbnM6IFtuZXdIZWxwQnV0dG9uKFByb21wdHNUeXBlLnNraWxsKV0sXG5cdGNvbW1hbmRJZDogTkVXX1NLSUxMX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEEgcXVpY2sgcGljayBpdGVtIHRoYXQgZ2VuZXJhdGVzIGEgcHJvbXB0IGZpbGUgd2l0aCBhZ2VudC5cbiAqL1xuY29uc3QgR0VORVJBVEVfUFJPTVBUX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHNwYXJrbGUpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLmdlbmVyYXRlLXByb21wdC5zZWxlY3QtZGlhbG9nLmxhYmVsJyxcblx0XHQnR2VuZXJhdGUgcHJvbXB0Li4uJyxcblx0KX1gLFxuXHRwaWNrYWJsZTogZmFsc2UsXG5cdGFsd2F5c1Nob3c6IHRydWUsXG5cdGJ1dHRvbnM6IFtuZXdIZWxwQnV0dG9uKFByb21wdHNUeXBlLnByb21wdCldLFxuXHRjb21tYW5kSWQ6IEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lELFxufTtcblxuLyoqXG4gKiBBIHF1aWNrIHBpY2sgaXRlbSB0aGF0IGdlbmVyYXRlcyBhIHNraWxsIHdpdGggYWdlbnQuXG4gKi9cbmNvbnN0IEdFTkVSQVRFX1NLSUxMX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHNwYXJrbGUpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLmdlbmVyYXRlLXNraWxsLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdHZW5lcmF0ZSBza2lsbC4uLicsXG5cdCl9YCxcblx0cGlja2FibGU6IGZhbHNlLFxuXHRhbHdheXNTaG93OiB0cnVlLFxuXHRidXR0b25zOiBbbmV3SGVscEJ1dHRvbihQcm9tcHRzVHlwZS5za2lsbCldLFxuXHRjb21tYW5kSWQ6IEdFTkVSQVRFX1NLSUxMX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEEgcXVpY2sgcGljayBpdGVtIHRoYXQgZ2VuZXJhdGVzIGEgY3VzdG9tIGFnZW50IHdpdGggYWdlbnQuXG4gKi9cbmNvbnN0IEdFTkVSQVRFX0FHRU5UX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHNwYXJrbGUpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLmdlbmVyYXRlLWFnZW50LnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdHZW5lcmF0ZSBhZ2VudC4uLicsXG5cdCl9YCxcblx0cGlja2FibGU6IGZhbHNlLFxuXHRhbHdheXNTaG93OiB0cnVlLFxuXHRidXR0b25zOiBbbmV3SGVscEJ1dHRvbihQcm9tcHRzVHlwZS5hZ2VudCldLFxuXHRjb21tYW5kSWQ6IEdFTkVSQVRFX0FHRU5UX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEJ1dHRvbiB0aGF0IG9wZW5zIGEgcHJvbXB0IGZpbGUgaW4gdGhlIGVkaXRvci5cbiAqL1xuY29uc3QgRURJVF9CVVRUT046IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHR0b29sdGlwOiBsb2NhbGl6ZSgnb3BlbicsIFwiT3BlbiBpbiBFZGl0b3JcIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZmlsZUNvZGUpLFxufTtcblxuLyoqXG4gKiBCdXR0b24gdGhhdCBkZWxldGVzIGEgcHJvbXB0IGZpbGUuXG4gKi9cbmNvbnN0IERFTEVURV9CVVRUT046IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVsZXRlJywgXCJEZWxldGVcIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udHJhc2gpLFxufTtcblxuLyoqXG4gKiBCdXR0b24gdGhhdCByZW5hbWVzIGEgcHJvbXB0IGZpbGUuXG4gKi9cbmNvbnN0IFJFTkFNRV9CVVRUT046IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHR0b29sdGlwOiBsb2NhbGl6ZSgncmVuYW1lJywgXCJNb3ZlIGFuZC9vciBSZW5hbWVcIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucmVwbGFjZSksXG59O1xuXG4vKipcbiAqIEJ1dHRvbiB0aGF0IGNvcGllcyBhIHByb21wdCBmaWxlLlxuICovXG5jb25zdCBDT1BZX0JVVFRPTjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdHRvb2x0aXA6IGxvY2FsaXplKCdtYWtlQUNvcHknLCBcIk1ha2UgYSBDb3B5XCIpLFxuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNvcHkpLFxufTtcblxuLyoqXG4gKiBCdXR0b24gdGhhdCBzZXRzIGEgcHJvbXB0IGZpbGUgdG8gYmUgdmlzaWJsZS5cbiAqL1xuY29uc3QgTUFLRV9WSVNJQkxFX0JVVFRPTjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdHRvb2x0aXA6IGxvY2FsaXplKCdtYWtlVmlzaWJsZScsIFwiSGlkZGVuIGZyb20gY2hhdCB2aWV3IGFnZW50IHBpY2tlci4gQ2xpY2sgdG8gc2hvdy5cIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllQ2xvc2VkKSxcblx0YWx3YXlzVmlzaWJsZTogdHJ1ZSxcbn07XG5cbi8qKlxuICogQnV0dG9uIHRoYXQgc2V0cyBhIHByb21wdCBmaWxlIHRvIGJlIGludmlzaWJsZS5cbiAqL1xuY29uc3QgTUFLRV9JTlZJU0lCTEVfQlVUVE9OOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0dG9vbHRpcDogbG9jYWxpemUoJ21ha2VJbnZpc2libGUnLCBcIlNob3duIGluIGNoYXQgdmlldyBhZ2VudCBwaWNrZXIuIENsaWNrIHRvIGhpZGUuXCIpLFxuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZSksXG59O1xuXG5jb25zdCBSVU5fSU5fQ0hBVF9CVVRUT046IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHR0b29sdGlwOiBsb2NhbGl6ZSgncnVuSW5DaGF0JywgXCJSdW4gaW4gQ2hhdCBWaWV3XCIpLFxuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBsYXkpLFxufTtcblxuZXhwb3J0IGNsYXNzIFByb21wdEZpbGVQaWNrZXJzIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyB0aGUgcHJvbXB0IGZpbGUgc2VsZWN0aW9uIGRpYWxvZyB0byB0aGUgdXNlciB0aGF0IGFsbG93cyB0byBydW4gYSBwcm9tcHQgZmlsZShzKS5cblx0ICpcblx0ICogSWYge0BsaW5rIElTZWxlY3RPcHRpb25zLnJlc291cmNlIHJlc291cmNlfSBpcyBwcm92aWRlZCwgdGhlIGRpYWxvZyB3aWxsIGhhdmVcblx0ICogdGhlIHJlc291cmNlIHByZS1zZWxlY3RlZCBpbiB0aGUgcHJvbXB0cyBsaXN0LlxuXHQgKi9cblx0YXN5bmMgc2VsZWN0UHJvbXB0RmlsZShvcHRpb25zOiBJU2VsZWN0T3B0aW9ucyk6IFByb21pc2U8SVNlbGVjdFByb21wdFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrOiBJUHJvbXB0UXVpY2tQaWNrID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZWFyY2hpbmcnLCAnU2VhcmNoaW5nIGZpbGUgc3lzdGVtLi4uJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZmlsZU9wdGlvbnMgPSBhd2FpdCB0aGlzLl9jcmVhdGVQcm9tcHRQaWNrSXRlbXMob3B0aW9ucywgY3RzLnRva2VuKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUl0ZW0gPSBvcHRpb25zLnJlc291cmNlICYmIGZpbGVPcHRpb25zLmZpbmQoZiA9PiBmLnR5cGUgPT09ICdpdGVtJyAmJiBleHRVcmkuaXNFcXVhbChmLnByb21wdEZpbGVVcmksIG9wdGlvbnMucmVzb3VyY2UpKSBhcyBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChhY3RpdmVJdGVtKSB7XG5cdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IFthY3RpdmVJdGVtXTtcblx0XHRcdH1cblx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IG9wdGlvbnMucGxhY2Vob2xkZXI7XG5cdFx0XHRxdWlja1BpY2subWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGZpbGVPcHRpb25zO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRxdWlja1BpY2suYnVzeSA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJU2VsZWN0UHJvbXB0UmVzdWx0IHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRsZXQgaXNSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGlzQ2xvc2VkID0gZmFsc2U7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2spO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGN0cyk7XG5cblx0XHRcdGNvbnN0IHJlZnJlc2hJdGVtcyA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlID0gcXVpY2tQaWNrLmFjdGl2ZUl0ZW1zO1xuXHRcdFx0XHRjb25zdCBuZXdJdGVtcyA9IGF3YWl0IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtcyhvcHRpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gbmV3SXRlbXM7XG5cdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IGFjdGl2ZTtcblx0XHRcdH07XG5cblx0XHRcdC8vIGhhbmRsZSB0aGUgcHJvbXB0IGBhY2NlcHRgIGV2ZW50XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZWxlY3RlZEl0ZW1zIH0gPSBxdWlja1BpY2s7XG5cdFx0XHRcdGNvbnN0IHsga2V5TW9kcyB9ID0gcXVpY2tQaWNrO1xuXG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkSXRlbSA9IHNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmIChpc1Byb21wdEZpbGVJdGVtKHNlbGVjdGVkSXRlbSkpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgcHJvbXB0RmlsZTogc2VsZWN0ZWRJdGVtLnByb21wdEZpbGVVcmksIGtleU1vZHM6IHsgLi4ua2V5TW9kcyB9IH0pO1xuXHRcdFx0XHRcdGlzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChzZWxlY3RlZEl0ZW0uY29tbWFuZElkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChzZWxlY3RlZEl0ZW0uY29tbWFuZElkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBoYW5kbGUgdGhlIGBidXR0b24gY2xpY2tgIGV2ZW50IG9uIGEgbGlzdCBpdGVtIChlZGl0LCBkZWxldGUsIGV0Yy4pXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNob3VsZFJlZnJlc2ggPSBhd2FpdCB0aGlzLl9oYW5kbGVCdXR0b25DbGljayhxdWlja1BpY2ssIGUsIG9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoIWlzQ2xvc2VkICYmIHNob3VsZFJlZnJlc2gpIHtcblx0XHRcdFx0XHRhd2FpdCByZWZyZXNoSXRlbXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghcXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0KSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGlzQ2xvc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoIWlzUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdGlzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBmaW5hbGx5LCByZXZlYWwgdGhlIGRpYWxvZ1xuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlUHJvbXB0UGlja0l0ZW1zKG9wdGlvbnM6IElTZWxlY3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPChJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10+IHtcblx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0ICYmIG9wdGlvbnMub3B0aW9uUnVuICE9PSBmYWxzZSkge1xuXHRcdFx0YnV0dG9ucy5wdXNoKFJVTl9JTl9DSEFUX0JVVFRPTik7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLm9wdGlvbkVkaXQgIT09IGZhbHNlKSB7XG5cdFx0XHRidXR0b25zLnB1c2goRURJVF9CVVRUT04pO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5vcHRpb25Db3B5ICE9PSBmYWxzZSkge1xuXHRcdFx0YnV0dG9ucy5wdXNoKENPUFlfQlVUVE9OKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMub3B0aW9uUmVuYW1lICE9PSBmYWxzZSkge1xuXHRcdFx0YnV0dG9ucy5wdXNoKFJFTkFNRV9CVVRUT04pO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5vcHRpb25EZWxldGUgIT09IGZhbHNlKSB7XG5cdFx0XHRidXR0b25zLnB1c2goREVMRVRFX0JVVFRPTik7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogKElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdGlmIChvcHRpb25zLm9wdGlvbk5ldyAhPT0gZmFsc2UpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnRoaXMuX2dldE5ld0l0ZW1zKG9wdGlvbnMudHlwZSkpO1xuXHRcdH1cblxuXHRcdGxldCBnZXRWaXNpYmlsaXR5OiAocDogSVByb21wdFBhdGgpID0+IGJvb2xlYW4gfCB1bmRlZmluZWQgPSAoKSA9PiB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMub3B0aW9uVmlzaWJpbGl0eSkge1xuXHRcdFx0Y29uc3QgZGlzYWJsZWQgPSB0aGlzLl9wcm9tcHRzU2VydmljZS5nZXREaXNhYmxlZFByb21wdEZpbGVzKG9wdGlvbnMudHlwZSk7XG5cdFx0XHRnZXRWaXNpYmlsaXR5ID0gcCA9PiAhZGlzYWJsZWQuaGFzKHAudXJpKTtcblx0XHR9XG5cblx0XHRjb25zdCBzb3J0QnlMYWJlbCA9IChpdGVtczogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW1bXSk6IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtW10gPT4gaXRlbXMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuXHRcdGNvbnN0IGxvY2FscyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2Uob3B0aW9ucy50eXBlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdG9rZW4pO1xuXHRcdGlmIChsb2NhbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3NlcGFyYXRvci53b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSB9KTtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnNvcnRCeUxhYmVsKGF3YWl0IFByb21pc2UuYWxsKGxvY2Fscy5tYXAobCA9PiB0aGlzLl9jcmVhdGVQcm9tcHRQaWNrSXRlbShsLCBidXR0b25zLCBnZXRWaXNpYmlsaXR5KGwpLCB0b2tlbikpKSkpO1xuXHRcdH1cblxuXHRcdC8vIEFnZW50IGluc3RydWN0aW9uIGZpbGVzIChjb3BpbG90LWluc3RydWN0aW9ucy5tZCBhbmQgQUdFTlRTLm1kKSBhcmUgYWRkZWQgaGVyZSBhbmQgbm90IGluY2x1ZGVkIGluIHRoZSBvdXRwdXQgb2Zcblx0XHQvLyBsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKCkgYmVjYXVzZSB0aGF0IGZ1bmN0aW9uIG9ubHkgaGFuZGxlcyAqLmluc3RydWN0aW9ucy5tZCBmaWxlcyAodW5kZXIgYC5naXRodWIvaW5zdHJ1Y3Rpb25zL2AsIGV0Yy4pXG5cdFx0bGV0IGFnZW50SW5zdHJ1Y3Rpb25GaWxlczogSVByb21wdFBhdGhbXSA9IFtdO1xuXHRcdGlmIChvcHRpb25zLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdFx0Y29uc3QgYWdlbnRJbnN0cnVjdGlvblVyaXMgPSBhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5saXN0QWdlbnRJbnN0cnVjdGlvbnModG9rZW4pO1xuXHRcdFx0YWdlbnRJbnN0cnVjdGlvbkZpbGVzID0gYWdlbnRJbnN0cnVjdGlvblVyaXMubWFwKGFnZW50SW5zdHJ1Y3Rpb25GaWxlID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyTmFtZSA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKGFnZW50SW5zdHJ1Y3Rpb25GaWxlLnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdC8vIERvbid0IHNob3cgdGhlIGZvbGRlciBwYXRoIGZvciBmaWxlcyB1bmRlciAuZ2l0aHViIGZvbGRlciAobmFtZWx5LCBjb3BpbG90LWluc3RydWN0aW9ucy5tZCkgc2luY2UgdGhhdCBpcyBvbmx5IGRlZmluZWQgb25jZSBwZXIgcmVwby5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IGFnZW50SW5zdHJ1Y3Rpb25GaWxlLnVyaSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYWdlbnRJbnN0cnVjdGlvbkZpbGUudHlwZSAhPT0gQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCA/IGZvbGRlck5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogb3B0aW9ucy50eXBlXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElQcm9tcHRQYXRoO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmIChhZ2VudEluc3RydWN0aW9uRmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhZ2VudEJ1dHRvbnMgPSBidXR0b25zLmZpbHRlcihiID0+IGIgIT09IFJFTkFNRV9CVVRUT04pO1xuXHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzZXBhcmF0b3Iud29ya3NwYWNlLWFnZW50LWluc3RydWN0aW9ucycsIFwiQWdlbnQgSW5zdHJ1Y3Rpb25zXCIpIH0pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uc29ydEJ5TGFiZWwoYXdhaXQgUHJvbWlzZS5hbGwoYWdlbnRJbnN0cnVjdGlvbkZpbGVzLm1hcChsID0+IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtKGwsIGFnZW50QnV0dG9ucywgZ2V0VmlzaWJpbGl0eShsKSwgdG9rZW4pKSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRzID0gKGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2Uob3B0aW9ucy50eXBlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHRva2VuKSkuZmlsdGVyKGlzRXh0ZW5zaW9uUHJvbXB0UGF0aCk7XG5cdFx0aWYgKGV4dHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBleHRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0XHRpZiAob3B0aW9ucy50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQgJiYgb3B0aW9ucy5vcHRpb25SdW4gIT09IGZhbHNlKSB7XG5cdFx0XHRcdGV4dEJ1dHRvbnMucHVzaChSVU5fSU5fQ0hBVF9CVVRUT04pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnMub3B0aW9uRWRpdCAhPT0gZmFsc2UpIHtcblx0XHRcdFx0ZXh0QnV0dG9ucy5wdXNoKEVESVRfQlVUVE9OKTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zLm9wdGlvbkNvcHkgIT09IGZhbHNlKSB7XG5cdFx0XHRcdGV4dEJ1dHRvbnMucHVzaChDT1BZX0JVVFRPTik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdyb3VwZWRFeHRzID0gbmV3IE1hcDxzdHJpbmcsIElQcm9tcHRQYXRoW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dCBvZiBleHRzKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwTGFiZWwgPSB0aGlzLl9nZXRFeHRlbnNpb25Hcm91cExhYmVsKGV4dCk7XG5cdFx0XHRcdGlmICghZ3JvdXBlZEV4dHMuaGFzKGdyb3VwTGFiZWwpKSB7XG5cdFx0XHRcdFx0Z3JvdXBlZEV4dHMuc2V0KGdyb3VwTGFiZWwsIFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRncm91cGVkRXh0cy5nZXQoZ3JvdXBMYWJlbCkhLnB1c2goZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc29ydGVkR3JvdXBlZEV4dHMgPSBBcnJheS5mcm9tKGdyb3VwZWRFeHRzLmVudHJpZXMoKSkuc29ydCgoYSwgYikgPT4gYVswXS5sb2NhbGVDb21wYXJlKGJbMF0pKTtcblx0XHRcdGZvciAoY29uc3QgW2dyb3VwTGFiZWwsIGdyb3VwRXh0c10gb2Ygc29ydGVkR3JvdXBlZEV4dHMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGdyb3VwTGFiZWwgfSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLnNvcnRCeUxhYmVsKGF3YWl0IFByb21pc2UuYWxsKGdyb3VwRXh0cy5tYXAoZSA9PiB0aGlzLl9jcmVhdGVQcm9tcHRQaWNrSXRlbShlLCBleHRCdXR0b25zLCBnZXRWaXNpYmlsaXR5KGUpLCB0b2tlbikpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCB1c2VycyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2Uob3B0aW9ucy50eXBlLCBQcm9tcHRzU3RvcmFnZS51c2VyLCB0b2tlbik7XG5cdFx0aWYgKHVzZXJzLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzZXBhcmF0b3IudXNlcicsIFwiVXNlciBEYXRhXCIpIH0pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uc29ydEJ5TGFiZWwoYXdhaXQgUHJvbWlzZS5hbGwodXNlcnMubWFwKHUgPT4gdGhpcy5fY3JlYXRlUHJvbXB0UGlja0l0ZW0odSwgYnV0dG9ucywgZ2V0VmlzaWJpbGl0eSh1KSwgdG9rZW4pKSkpKTtcblx0XHR9XG5cblx0XHQvLyBQbHVnaW4gZmlsZXMgYXJlIHJlYWQtb25seSBzbyBvbmx5IGNvcHkgYnV0dG9uIGlzIGF2YWlsYWJsZVxuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKG9wdGlvbnMudHlwZSwgUHJvbXB0c1N0b3JhZ2UucGx1Z2luLCB0b2tlbik7XG5cdFx0aWYgKHBsdWdpbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwbHVnaW5CdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0XHRpZiAob3B0aW9ucy5vcHRpb25Db3B5ICE9PSBmYWxzZSkge1xuXHRcdFx0XHRwbHVnaW5CdXR0b25zLnB1c2goQ09QWV9CVVRUT04pO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzZXBhcmF0b3IucGx1Z2lucycsIFwiUGx1Z2luc1wiKSB9KTtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnNvcnRCeUxhYmVsKGF3YWl0IFByb21pc2UuYWxsKHBsdWdpbnMubWFwKHAgPT4gdGhpcy5fY3JlYXRlUHJvbXB0UGlja0l0ZW0ocCwgcGx1Z2luQnV0dG9ucywgZ2V0VmlzaWJpbGl0eShwKSwgdG9rZW4pKSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RXh0ZW5zaW9uR3JvdXBMYWJlbChleHRQYXRoOiBJRXh0ZW5zaW9uUHJvbXB0UGF0aCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZShleHRQYXRoLnVyaSwgZXh0UGF0aC5leHRlbnNpb24uaWRlbnRpZmllciwgdGhpcy5fcHJvZHVjdFNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlcGFyYXRvci5vcmdhbml6YXRpb24nLCBcIk9yZ2FuaXphdGlvblwiKTtcblx0XHR9XG5cblx0XHQvLyBCeSBkZWZhdWx0LCBleHRlbnNpb24gcHJvbXB0IGZpbGVzIGFyZSBncm91cGVkIHVuZGVyIFwiRXh0ZW5zaW9uc1wiXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzZXBhcmF0b3IuZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TmV3SXRlbXModHlwZTogUHJvbXB0c1R5cGUpOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbVtdIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0XHRyZXR1cm4gW05FV19QUk9NUFRfRklMRV9PUFRJT04sIEdFTkVSQVRFX1BST01QVF9PUFRJT05dO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdHJldHVybiBbTkVXX0lOU1RSVUNUSU9OU19GSUxFX09QVElPTiwgR0VORVJBVEVfT05fREVNQU5EX0lOU1RSVUNUSU9OU19PUFRJT04sIEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19PUFRJT05dO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0cmV0dXJuIFtORVdfQUdFTlRfRklMRV9PUFRJT04sIEdFTkVSQVRFX0FHRU5UX09QVElPTl07XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRyZXR1cm4gW05FV19TS0lMTF9GSUxFX09QVElPTiwgR0VORVJBVEVfU0tJTExfT1BUSU9OXTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwcm9tcHQgdHlwZSAnJHt0eXBlfScuYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlUHJvbXB0UGlja0l0ZW0ocHJvbXB0RmlsZTogSVByb21wdFBhdGgsIGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gfCB1bmRlZmluZWQsIHZpc2liaWxpdHk6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0+IHtcblx0XHRjb25zdCBwYXJzZWRQcm9tcHRGaWxlID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UucGFyc2VOZXcocHJvbXB0RmlsZS51cmksIHRva2VuKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGxldCBwcm9tcHROYW1lID0gKHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8ubmFtZSA/PyBwcm9tcHRGaWxlLm5hbWUpIHx8IChwcm9tcHRGaWxlLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsID8gZ2V0U2tpbGxGb2xkZXJOYW1lKHByb21wdEZpbGUudXJpKSA6IGdldENsZWFuUHJvbXB0TmFtZShwcm9tcHRGaWxlLnVyaSkpO1xuXHRcdGNvbnN0IHByb21wdERlc2NyaXB0aW9uID0gcGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5kZXNjcmlwdGlvbiA/PyBwcm9tcHRGaWxlLmRlc2NyaXB0aW9uO1xuXG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdHN3aXRjaCAocHJvbXB0RmlsZS5zdG9yYWdlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbjpcblx0XHRcdFx0dG9vbHRpcCA9IHByb21wdEZpbGUuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IHByb21wdEZpbGUuZXh0ZW5zaW9uLmlkO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UubG9jYWw6XG5cdFx0XHRcdHRvb2x0aXAgPSB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShwcm9tcHRGaWxlLnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS51c2VyOlxuXHRcdFx0XHR0b29sdGlwID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UucGx1Z2luOlxuXHRcdFx0XHR0b29sdGlwID0gcHJvbXB0RmlsZS5uYW1lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbjpcblx0XHRcdFx0dG9vbHRpcCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcihwcm9tcHRGaWxlKTtcblx0XHR9XG5cdFx0bGV0IGljb25DbGFzczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh2aXNpYmlsaXR5ID09PSBmYWxzZSkge1xuXHRcdFx0YnV0dG9ucyA9IChidXR0b25zID8/IFtdKS5jb25jYXQoTUFLRV9WSVNJQkxFX0JVVFRPTik7XG5cdFx0XHRwcm9tcHROYW1lID0gbG9jYWxpemUoJ2hpZGRlbkxhYmVsSW5mbycsIFwiezB9IChoaWRkZW4pXCIsIHByb21wdE5hbWUpO1xuXHRcdFx0dG9vbHRpcCA9IGxvY2FsaXplKCdoaWRkZW5JbkFnZW50UGlja2VyJywgXCJIaWRkZW4gZnJvbSBjaGF0IHZpZXcgYWdlbnQgcGlja2VyXCIpO1xuXHRcdH0gZWxzZSBpZiAodmlzaWJpbGl0eSA9PT0gdHJ1ZSkge1xuXHRcdFx0YnV0dG9ucyA9IChidXR0b25zID8/IFtdKS5jb25jYXQoTUFLRV9JTlZJU0lCTEVfQlVUVE9OKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBwcm9tcHRGaWxlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0bGFiZWw6IHByb21wdE5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogcHJvbXB0RGVzY3JpcHRpb24sXG5cdFx0XHRpY29uQ2xhc3MsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0cHJvbXB0RmlsZVVyaTogcHJvbXB0RmlsZS51cmksXG5cdFx0XHRidXR0b25zLFxuXHRcdH0gc2F0aXNmaWVzIElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIGtlZXBRdWlja1BpY2tPcGVuPFQ+KHF1aWNrUGljazogSVByb21wdFF1aWNrUGljaywgd29yazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IHByZXZpb3VzSWdub3JlRm9jdXNPdXQgPSBxdWlja1BpY2suaWdub3JlRm9jdXNPdXQ7XG5cdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHdvcmsoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gcHJldmlvdXNJZ25vcmVGb2N1c091dDtcblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQnV0dG9uQ2xpY2socXVpY2tQaWNrOiBJUHJvbXB0UXVpY2tQaWNrLCBjb250ZXh0OiBJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtPiwgb3B0aW9uczogSVNlbGVjdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB7IGl0ZW0sIGJ1dHRvbiB9ID0gY29udGV4dDtcblx0XHRpZiAoIWlzUHJvbXB0RmlsZUl0ZW0oaXRlbSkpIHtcblx0XHRcdGlmIChpc0hlbHBCdXR0b24oYnV0dG9uKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oYnV0dG9uLmhlbHBVUkkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gYnV0dG9uICcke0pTT04uc3RyaW5naWZ5KGJ1dHRvbil9Jy5gKTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUgPSBpdGVtLnByb21wdEZpbGVVcmk7XG5cblx0XHRpZiAoYnV0dG9uID09PSBSVU5fSU5fQ0hBVF9CVVRUT04pIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IHF1aWNrUGljay5rZXlNb2RzLmN0cmxDbWQgPT09IHRydWVcblx0XHRcdFx0PyAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJ1bi1pbi1uZXctY2hhdC5wcm9tcHQuY3VycmVudCdcblx0XHRcdFx0OiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJ1bi5wcm9tcHQuY3VycmVudCc7XG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQsIHZhbHVlKTtcblx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gYGVkaXRgIGJ1dHRvbiB3YXMgcHJlc3NlZCwgb3BlbiB0aGUgcHJvbXB0IGZpbGUgaW4gZWRpdG9yXG5cdFx0aWYgKGJ1dHRvbiA9PT0gRURJVF9CVVRUT04pIHtcblx0XHRcdGF3YWl0IHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih2YWx1ZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gYGNvcHlgIGJ1dHRvbiB3YXMgcHJlc3NlZCwgbWFrZSBhIGNvcHkgb2YgdGhlIHByb21wdCBmaWxlLCBvcGVuIHRoZSBjb3B5IGluIGVkaXRvclxuXHRcdGlmIChidXR0b24gPT09IFJFTkFNRV9CVVRUT04gfHwgYnV0dG9uID09PSBDT1BZX0JVVFRPTikge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMua2VlcFF1aWNrUGlja09wZW4ocXVpY2tQaWNrLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRGb2xkZXIgPSBkaXJuYW1lKHZhbHVlKTtcblx0XHRcdFx0Y29uc3QgaXNNb3ZlID0gYnV0dG9uID09PSBSRU5BTUVfQlVUVE9OICYmIHF1aWNrUGljay5rZXlNb2RzLmN0cmxDbWQ7XG5cdFx0XHRcdGNvbnN0IG5ld0ZvbGRlciA9IGF3YWl0IHRoaXMuX2luc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihhc2tGb3JQcm9tcHRTb3VyY2VGb2xkZXIsIG9wdGlvbnMudHlwZSwgY3VycmVudEZvbGRlciwgaXNNb3ZlKTtcblx0XHRcdFx0aWYgKCFuZXdGb2xkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV3TmFtZSA9IGF3YWl0IHRoaXMuX2luc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihhc2tGb3JQcm9tcHRGaWxlTmFtZSwgb3B0aW9ucy50eXBlLCBuZXdGb2xkZXIudXJpLCBpdGVtLmxhYmVsKTtcblx0XHRcdFx0aWYgKCFuZXdOYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5ld0ZpbGUgPSBqb2luUGF0aChuZXdGb2xkZXIudXJpLCBuZXdOYW1lKTtcblx0XHRcdFx0aWYgKGlzTW92ZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUodmFsdWUsIG5ld0ZpbGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNvcHkodmFsdWUsIG5ld0ZpbGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKG5ld0ZpbGUpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZVJld3JpdGVyKS5vcGVuQW5kUmV3cml0ZU5hbWUobmV3RmlsZSwgZ2V0Q2xlYW5Qcm9tcHROYW1lKG5ld0ZpbGUpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGBkZWxldGVgIGJ1dHRvbiB3YXMgcHJlc3NlZCwgZGVsZXRlIHRoZSBwcm9tcHQgZmlsZVxuXHRcdGlmIChidXR0b24gPT09IERFTEVURV9CVVRUT04pIHtcblx0XHRcdC8vIGRvbid0IGNsb3NlIHRoZSBtYWluIHByb21wdCBzZWxlY3Rpb24gZGlhbG9nIGJ5IHRoZSBjb25maXJtYXRpb24gZGlhbG9nXG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5rZWVwUXVpY2tQaWNrT3BlbihxdWlja1BpY2ssIGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHRjb25zdCBpc1NraWxsID0gb3B0aW9ucy50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbDtcblx0XHRcdFx0Ly8gRm9yIHNraWxscywgdXNlIHRoZSBwYXJlbnQgZm9sZGVyIG5hbWUgYXMgdGhlIGRpc3BsYXkgbmFtZVxuXHRcdFx0XHQvLyBzaW5jZSBza2lsbHMgYXJlIHN0cnVjdHVyZWQgYXMgPHNraWxsbmFtZT4vU0tJTEwubWQuXG5cdFx0XHRcdGNvbnN0IGZpbGVuYW1lID0gaXNTa2lsbCA/IGJhc2VuYW1lKGRpcm5hbWUodmFsdWUpKSA6IGl0ZW0ubGFiZWw7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBpc1NraWxsXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29tbWFuZHMucHJvbXB0cy51c2Uuc2VsZWN0LWRpYWxvZy5kZWxldGUtc2tpbGwuY29uZmlybS5tZXNzYWdlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHNraWxsICd7MH0nIGFuZCBpdHMgZm9sZGVyP1wiLCBmaWxlbmFtZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb21tYW5kcy5wcm9tcHRzLnVzZS5zZWxlY3QtZGlhbG9nLmRlbGV0ZS1wcm9tcHQuY29uZmlybS5tZXNzYWdlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlICd7MH0nP1wiLCBmaWxlbmFtZSk7XG5cdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oeyBtZXNzYWdlIH0pO1xuXHRcdFx0XHQvLyBpZiBwcm9tcHQgZGVsZXRpb24gd2FzIG5vdCBjb25maXJtZWQsIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGb3Igc2tpbGxzLCBkZWxldGUgdGhlIHBhcmVudCBmb2xkZXIgKGUuZy4gLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvKVxuXHRcdFx0XHQvLyBzaW5jZSBlYWNoIHNraWxsIGlzIGEgZm9sZGVyIGNvbnRhaW5pbmcgU0tJTEwubWQuXG5cdFx0XHRcdGNvbnN0IGRlbGV0ZVRhcmdldCA9IGlzU2tpbGwgPyBkaXJuYW1lKHZhbHVlKSA6IHZhbHVlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwoZGVsZXRlVGFyZ2V0LCB7IHJlY3Vyc2l2ZTogaXNTa2lsbCwgdXNlVHJhc2g6IHRydWUgfSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHR9XG5cblx0XHRpZiAoYnV0dG9uID09PSBNQUtFX1ZJU0lCTEVfQlVUVE9OIHx8IGJ1dHRvbiA9PT0gTUFLRV9JTlZJU0lCTEVfQlVUVE9OKSB7XG5cdFx0XHRjb25zdCBkaXNhYmxlZCA9IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmdldERpc2FibGVkUHJvbXB0RmlsZXMob3B0aW9ucy50eXBlKTtcblx0XHRcdGlmIChidXR0b24gPT09IE1BS0VfVklTSUJMRV9CVVRUT04pIHtcblx0XHRcdFx0ZGlzYWJsZWQuZGVsZXRlKHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRpc2FibGVkLmFkZCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm9tcHRzU2VydmljZS5zZXREaXNhYmxlZFByb21wdEZpbGVzKG9wdGlvbnMudHlwZSwgZGlzYWJsZWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGJ1dHRvbiAnJHtKU09OLnN0cmluZ2lmeShidXR0b24pfScuYCk7XG5cdH1cblxuXHQvLyAtLS0gRW5hYmxlbWVudCBDb25maWd1cmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogU2hvd3MgYSBtdWx0aS1zZWxlY3QgKGNoZWNrYm94KSBxdWljayBwaWNrIHRvIGNvbmZpZ3VyZSB3aGljaCBwcm9tcHQgZmlsZXMgb2YgdGhlIGdpdmVuXG5cdCAqIHR5cGUgYXJlIGVuYWJsZWQuIEN1cnJlbnRseSBvbmx5IHVzZWQgZm9yIGFnZW50IHByb21wdCBmaWxlcy5cblx0ICovXG5cdGFzeW5jIG1hbmFnZVByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlLCBwbGFjZWhvbGRlcjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrOiBJUHJvbXB0UXVpY2tQaWNrID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHF1aWNrUGljay5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElTZWxlY3RPcHRpb25zID0ge1xuXHRcdFx0cGxhY2Vob2xkZXI6ICcnLFxuXHRcdFx0dHlwZSxcblx0XHRcdG9wdGlvbk5ldzogdHJ1ZSxcblx0XHRcdG9wdGlvbkVkaXQ6IHRydWUsXG5cdFx0XHRvcHRpb25EZWxldGU6IHRydWUsXG5cdFx0XHRvcHRpb25SZW5hbWU6IHRydWUsXG5cdFx0XHRvcHRpb25Db3B5OiB0cnVlLFxuXHRcdFx0b3B0aW9uVmlzaWJpbGl0eTogZmFsc2UsXG5cdFx0XHRvcHRpb25SdW46IGZhbHNlXG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtcyhvcHRpb25zLCBjdHMudG9rZW4pO1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjdHMpO1xuXG5cdFx0XHRsZXQgaXNDbG9zZWQgPSBmYWxzZTtcblx0XHRcdGxldCBpc1Jlc29sdmVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHJlZnJlc2hJdGVtcyA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlID0gcXVpY2tQaWNrLmFjdGl2ZUl0ZW1zO1xuXHRcdFx0XHRjb25zdCBuZXdJdGVtcyA9IGF3YWl0IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtcyhvcHRpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gbmV3SXRlbXM7XG5cdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IGFjdGl2ZTtcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjbGlja2VkSXRlbSA9IHF1aWNrUGljay5hY3RpdmVJdGVtcztcblx0XHRcdFx0aWYgKGNsaWNrZWRJdGVtLmxlbmd0aCA9PT0gMSAmJiBjbGlja2VkSXRlbVswXS5jb21tYW5kSWQpIHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kSWQgPSBjbGlja2VkSXRlbVswXS5jb21tYW5kSWQ7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5rZWVwUXVpY2tQaWNrT3BlbihxdWlja1BpY2ssIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKCFpc0Nsb3NlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgcmVmcmVzaEl0ZW1zKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBzaG91bGRSZWZyZXNoID0gYXdhaXQgdGhpcy5faGFuZGxlQnV0dG9uQ2xpY2socXVpY2tQaWNrLCBlLCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKCFpc0Nsb3NlZCAmJiBzaG91bGRSZWZyZXNoKSB7XG5cdFx0XHRcdFx0YXdhaXQgcmVmcmVzaEl0ZW1zKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXF1aWNrUGljay5pZ25vcmVGb2N1c091dCkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRpc0Nsb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0aWYgKCFpc1Jlc29sdmVkKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHRcdGlzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDBCQUE2RCxpQkFBaUIsc0JBQXNCO0FBQzdHLFNBQVMsVUFBVSxTQUFTLFFBQVEsZ0JBQWdCO0FBQ3BELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMs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QWM7QUFBQSxJQUNwQjtBQUFBLElBQ0E7QUFBQSxFQUNELENBQUM7QUFBQSxFQUNELFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFNBQVMsQ0FBQyxjQUFjLFlBQVksWUFBWSxDQUFDO0FBQUEsRUFDakQsV0FBVztBQUNaO0FBS0EsTUFBTSx3QkFBb0Q7QUFBQSxFQUN6RCxNQUFNO0FBQUEsRUFDTixPQUFPLFdBQVc7QUFBQSxJQUNqQjtBQUFBLElBQ0E7QUFBQSxFQUNELENBQUM7QUFBQSxFQUNELFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFNBQVMsQ0FBQyxjQUFjLFlBQVksS0FBSyxDQUFDO0FBQUEsRUFDMUMsV0FBVztBQUNaO0FBS0EsTUFBTSx3QkFBb0Q7QUFBQSxFQUN6RCxNQUFNO0FBQUEsRUFDTixPQUFPLFdBQVc7QUFBQSxJQUNqQjtBQUFBLElBQ0E7QUFBQSxFQUNELENBQUM7QUFBQSxFQUNELFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFNBQVMsQ0FBQyxjQUFjLFlBQVksS0FBSyxDQUFDO0FBQUEsRUFDMUMsV0FBVztBQUNaO0FBS0EsTUFBTSx5QkFBcUQ7QUFBQSxFQUMxRCxNQUFNO0FBQUEsRUFDTixPQUFPLGNBQWM7QUFBQSxJQUNwQjtBQUFBLElBQ0E7QUFBQSxFQUNELENBQUM7QUFBQSxFQUNELFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFNBQVMsQ0FBQyxjQUFjLFlBQVksTUFBTSxDQUFDO0FBQUEsRUFDM0MsV0FBVztBQUNaO0FBS0EsTUFBTSx3QkFBb0Q7QUFBQSxFQUN6RCxNQUFNO0FBQUEsRUFDTixPQUFPLGNBQWM7QUFBQSxJQUNwQjtBQUFBLElBQ0E7QUFBQSxFQUNELENBQUM7QUFBQSxFQUNELFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFNBQVMsQ0FBQyxjQUFjLFlBQVksS0FBSyxDQUFDO0FBQUEsRUFDMUMsV0FBVztBQUNaO0FBS0EsTUFBTSx3QkFBb0Q7QUFBQSxFQUN6RCxNQUFNO0FBQUEsRUFDTixPQUFPLGNB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
