import { parse as parseJSONC } from "../../../../../base/common/jsonc.js";
import { setProperty, applyEdits } from "../../../../../base/common/jsonEdit.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ChatViewId } from "../chat.js";
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from "../actions/chatActions.js";
import { localize, localize2 } from "../../../../../nls.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { PromptsType, Target, getSourceDescription } from "../../common/promptSyntax/promptTypes.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { HOOK_METADATA, HOOKS_BY_TARGET } from "../../common/promptSyntax/hookTypes.js";
import { formatHookCommandLabel, getEffectiveCommandFieldKey } from "../../common/promptSyntax/hookSchema.js";
import { getCopilotCliHookTypeName, resolveCopilotCliHookType } from "../../common/promptSyntax/hookCopilotCliCompat.js";
import { getHookSourceFormat, HookSourceFormat, buildNewHookEntry } from "../../common/promptSyntax/hookCompatibility.js";
import { getClaudeHookTypeName, resolveClaudeHookType } from "../../common/promptSyntax/hookClaudeCompat.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { findHookCommandSelection, findHookCommandInYaml, parseAllHookFiles } from "./hookUtils.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { OperatingSystem, OS } from "../../../../../base/common/platform.js";
const CONFIGURE_HOOKS_ACTION_ID = "workbench.action.chat.configure.hooks";
function usesCopilotCliNaming(hooksObj) {
  for (const key of Object.keys(hooksObj)) {
    if (resolveCopilotCliHookType(key) !== void 0) {
      return true;
    }
  }
  return false;
}
function getHookTypeKeyName(hookTypeId, useCopilotCliNamingConvention) {
  if (useCopilotCliNamingConvention) {
    const copilotCliName = getCopilotCliHookTypeName(hookTypeId);
    if (copilotCliName) {
      return copilotCliName;
    }
  }
  return hookTypeId;
}
async function addHookToFile(hookFileUri, hookTypeId, fileService, editorService, notificationService, bulkEditService, openEditorOverride) {
  let hooksContent;
  const fileExists = await fileService.exists(hookFileUri);
  if (fileExists) {
    const existingContent = await fileService.readFile(hookFileUri);
    try {
      hooksContent = parseJSONC(existingContent.value.toString());
      if (!hooksContent.hooks) {
        hooksContent.hooks = {};
      }
    } catch {
      notificationService.error(localize("commands.new.hook.parseError", "Failed to parse existing hooks file. Please fix the JSON syntax errors and try again."));
      await editorService.openEditor({ resource: hookFileUri });
      return;
    }
  } else {
    hooksContent = { hooks: {} };
  }
  const sourceFormat = getHookSourceFormat(hookFileUri);
  const isClaude = sourceFormat === HookSourceFormat.Claude;
  const useCopilotCliNamingConvention = !isClaude && usesCopilotCliNaming(hooksContent.hooks);
  const hookTypeKeyName = isClaude ? getClaudeHookTypeName(hookTypeId) ?? hookTypeId : getHookTypeKeyName(hookTypeId, useCopilotCliNamingConvention);
  let existingKeyForType;
  for (const key of Object.keys(hooksContent.hooks)) {
    const resolvedType = isClaude ? resolveClaudeHookType(key) : resolveCopilotCliHookType(key);
    if (resolvedType === hookTypeId || key === hookTypeId) {
      existingKeyForType = key;
      break;
    }
  }
  const keyToUse = existingKeyForType ?? hookTypeKeyName;
  const newHookEntry = buildNewHookEntry(sourceFormat);
  const existingHooks = hooksContent.hooks[keyToUse];
  const newHookIndex = Array.isArray(existingHooks) ? existingHooks.length : 0;
  let jsonContent;
  if (fileExists) {
    const originalText = (await fileService.readFile(hookFileUri)).value.toString();
    const detectedEol = originalText.includes("\r\n") ? "\r\n" : "\n";
    const formattingOptions = { tabSize: 1, insertSpaces: false, eol: detectedEol };
    const edits = setProperty(originalText, ["hooks", keyToUse, newHookIndex], newHookEntry, formattingOptions);
    jsonContent = applyEdits(originalText, edits);
  } else {
    const newContent = { hooks: { [keyToUse]: [newHookEntry] } };
    jsonContent = JSON.stringify(newContent, null, "	");
  }
  const existingEditor = editorService.editors.find((e) => isEqual(e.resource, hookFileUri));
  if (existingEditor) {
    await editorService.openEditor({
      resource: hookFileUri,
      options: {
        pinned: false
      }
    });
    const editor = getCodeEditor(editorService.activeTextEditorControl);
    if (editor && editor.hasModel() && isEqual(editor.getModel().uri, hookFileUri)) {
      const model = editor.getModel();
      model.pushEditOperations([], [{
        range: model.getFullModelRange(),
        text: jsonContent
      }], () => null);
      const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, "command");
      if (selection && selection.endLineNumber !== void 0 && selection.endColumn !== void 0) {
        editor.setSelection({
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn
        });
        editor.revealLineInCenter(selection.startLineNumber);
      }
    } else {
      await bulkEditService.apply([
        new ResourceTextEdit(hookFileUri, { range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1), text: jsonContent })
      ], { label: localize("addHook", "Add Hook") });
      const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, "command");
      await editorService.openEditor({
        resource: hookFileUri,
        options: {
          selection,
          pinned: false
        }
      });
    }
  } else {
    if (!fileExists) {
      await fileService.writeFile(hookFileUri, VSBuffer.fromString(jsonContent));
    } else {
      await editorService.openEditor({
        resource: hookFileUri,
        options: { pinned: false }
      });
      await bulkEditService.apply([
        new ResourceTextEdit(hookFileUri, { range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1), text: jsonContent })
      ], { label: localize("addHook", "Add Hook") });
    }
    const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, "command");
    if (openEditorOverride) {
      await openEditorOverride(hookFileUri, { selection });
    } else {
      await editorService.openEditor({
        resource: hookFileUri,
        options: {
          selection,
          pinned: false
        }
      });
    }
  }
}
function awaitPick(picker, backButton) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (value) => {
      if (!resolved) {
        resolved = true;
        disposables.dispose();
        resolve(value);
      }
    };
    const disposables = new DisposableStore();
    disposables.add(picker.onDidAccept(() => {
      done(picker.activeItems[0]);
    }));
    disposables.add(picker.onDidTriggerButton((button) => {
      if (button === backButton) {
        done("back");
      }
    }));
    disposables.add(picker.onDidHide(() => {
      done(void 0);
    }));
  });
}
var Step = /* @__PURE__ */ ((Step2) => {
  Step2[Step2["SelectHookType"] = 1] = "SelectHookType";
  Step2[Step2["SelectHook"] = 2] = "SelectHook";
  Step2[Step2["SelectFile"] = 3] = "SelectFile";
  Step2[Step2["SelectFolder"] = 4] = "SelectFolder";
  Step2[Step2["EnterFilename"] = 5] = "EnterFilename";
  return Step2;
})(Step || {});
async function showConfigureHooksQuickPick(accessor, options) {
  const promptsService = accessor.get(IPromptsService);
  const quickInputService = accessor.get(IQuickInputService);
  const fileService = accessor.get(IFileService);
  const labelService = accessor.get(ILabelService);
  const editorService = accessor.get(IEditorService);
  const workspaceService = accessor.get(IWorkspaceContextService);
  const pathService = accessor.get(IPathService);
  const notificationService = accessor.get(INotificationService);
  const bulkEditService = accessor.get(IBulkEditService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const remoteEnv = await remoteAgentService.getEnvironment();
  const targetOS = remoteEnv?.os ?? OS;
  const workspaceFolder = workspaceService.getWorkspace().folders[0];
  const workspaceRootUri = workspaceFolder?.uri;
  const userHomeUri = await pathService.userHome();
  const userHome = userHomeUri.fsPath ?? userHomeUri.path;
  const hookEntries = await parseAllHookFiles(
    promptsService,
    fileService,
    labelService,
    workspaceRootUri,
    userHome,
    targetOS,
    CancellationToken.None,
    { includeAgentHooks: true }
  );
  const hookCountByType = /* @__PURE__ */ new Map();
  for (const entry of hookEntries) {
    hookCountByType.set(entry.hookType, (hookCountByType.get(entry.hookType) ?? 0) + 1);
  }
  const store = new DisposableStore();
  const picker = store.add(quickInputService.createQuickPick({ useSeparators: true }));
  const backButton = quickInputService.backButton;
  picker.show();
  let step = 1 /* SelectHookType */;
  let selectedHookType;
  let selectedHook;
  let selectedFile;
  let selectedFolder;
  const stepHistory = [];
  const goBack = () => stepHistory.pop();
  try {
    while (true) {
      switch (step) {
        case 1 /* SelectHookType */: {
          const makeItem = ([hookType, meta]) => {
            const count = hookCountByType.get(hookType) ?? 0;
            const countLabel = count > 0 ? ` (${count})` : "";
            return {
              label: `${meta.label}${countLabel}`,
              description: meta.description,
              hookType,
              hookTypeMeta: meta
            };
          };
          let pickerItems;
          if (options?.target) {
            const targetHookTypes = new Set(Object.values(HOOKS_BY_TARGET[options.target]));
            pickerItems = Object.entries(HOOK_METADATA).filter(([hookType]) => targetHookTypes.has(hookType)).map(makeItem);
          } else {
            const vscodeTypes = new Set(Object.values(HOOKS_BY_TARGET[Target.VSCode]));
            const copilotTypes = new Set(Object.values(HOOKS_BY_TARGET[Target.GitHubCopilot]));
            const allEntries = Object.entries(HOOK_METADATA);
            const shared = allEntries.filter(([h]) => vscodeTypes.has(h) && copilotTypes.has(h));
            const vscodeOnly = allEntries.filter(([h]) => vscodeTypes.has(h) && !copilotTypes.has(h));
            const copilotOnly = allEntries.filter(([h]) => !vscodeTypes.has(h) && copilotTypes.has(h));
            pickerItems = [];
            if (shared.length > 0) {
              pickerItems.push({ type: "separator", label: localize("hookSection.default", "Local/Copilot Agents") });
              pickerItems.push(...shared.map(makeItem));
            }
            if (vscodeOnly.length > 0) {
              pickerItems.push({ type: "separator", label: localize("hookSection.vscodeOnly", "Local Agents") });
              pickerItems.push(...vscodeOnly.map(makeItem));
            }
            if (copilotOnly.length > 0) {
              pickerItems.push({ type: "separator", label: localize("hookSection.copilotCliOnly", "Copilot Agents") });
              pickerItems.push(...copilotOnly.map(makeItem));
            }
          }
          picker.items = pickerItems;
          picker.value = "";
          picker.placeholder = localize("commands.hooks.selectEvent.placeholder", "Select a lifecycle event");
          picker.title = localize("commands.hooks.title", "Hooks");
          picker.buttons = [];
          const result = await awaitPick(picker, backButton);
          if (!result || result === "back") {
            return;
          }
          selectedHookType = result;
          stepHistory.push(1 /* SelectHookType */);
          step = 2 /* SelectHook */;
          break;
        }
        case 2 /* SelectHook */: {
          const hooksOfType = hookEntries.filter((h) => h.hookType === selectedHookType.hookType);
          const fileHooks = hooksOfType.filter((h) => !h.agentName);
          const agentHooks = hooksOfType.filter((h) => h.agentName);
          const hookItems = [];
          hookItems.push({
            label: `$(plus) ${localize("commands.addNewHook.label", "Add new hook...")}`,
            isAddNewHook: true,
            alwaysShow: true
          });
          if (fileHooks.length > 0) {
            hookItems.push({
              type: "separator",
              label: localize("existingHooks", "Existing Hooks")
            });
            for (const entry of fileHooks) {
              const description = labelService.getUriLabel(entry.fileUri, { relative: true });
              hookItems.push({
                label: entry.commandLabel,
                description,
                hookEntry: entry
              });
            }
          }
          if (agentHooks.length > 0) {
            const agentNames = [...new Set(agentHooks.map((h) => h.agentName))];
            for (const agentName of agentNames) {
              hookItems.push({
                type: "separator",
                label: localize("agentHooks", "Agent: {0}", agentName)
              });
              for (const entry of agentHooks.filter((h) => h.agentName === agentName)) {
                const description = labelService.getUriLabel(entry.fileUri, { relative: true });
                hookItems.push({
                  label: entry.commandLabel,
                  description,
                  hookEntry: entry
                });
              }
            }
          }
          if (hooksOfType.length === 0) {
            selectedHook = hookItems[0];
          } else {
            picker.items = hookItems;
            picker.value = "";
            picker.placeholder = localize("commands.hooks.selectHook.placeholder", "Select a hook to open or add a new one");
            picker.title = selectedHookType.hookTypeMeta.label;
            picker.buttons = [backButton];
            const result = await awaitPick(picker, backButton);
            if (result === "back") {
              step = goBack() ?? 1 /* SelectHookType */;
              break;
            }
            if (!result) {
              return;
            }
            selectedHook = result;
            stepHistory.push(2 /* SelectHook */);
          }
          if (selectedHook.hookEntry) {
            const entry = selectedHook.hookEntry;
            let selection;
            if (entry.agentName) {
              try {
                const content = await fileService.readFile(entry.fileUri);
                const commandText = formatHookCommandLabel(entry.command, targetOS);
                if (commandText) {
                  selection = findHookCommandInYaml(content.value.toString(), commandText);
                }
              } catch {
              }
            } else {
              const commandFieldName = getEffectiveCommandFieldKey(entry.command, targetOS);
              if (commandFieldName) {
                try {
                  const content = await fileService.readFile(entry.fileUri);
                  selection = findHookCommandSelection(
                    content.value.toString(),
                    entry.originalHookTypeId,
                    entry.index,
                    commandFieldName
                  );
                } catch {
                }
              }
            }
            if (options?.openEditor) {
              await options.openEditor(entry.fileUri, { selection });
            } else {
              await editorService.openEditor({
                resource: entry.fileUri,
                options: {
                  selection,
                  pinned: false
                }
              });
            }
            return;
          }
          step = 3 /* SelectFile */;
          break;
        }
        case 3 /* SelectFile */: {
          const hookFiles = await promptsService.listPromptFilesForStorage(PromptsType.hook, PromptsStorage.local, CancellationToken.None);
          const fileItems = [];
          fileItems.push({
            label: `$(new-file) ${localize("commands.createNewHookFile.label", "Create new hook config file...")}`,
            isCreateNewFile: true,
            alwaysShow: true
          });
          if (hookFiles.length > 0) {
            fileItems.push({
              type: "separator",
              label: localize("existingHookFiles", "Existing Hook Files")
            });
            for (const hookFile of hookFiles) {
              const relativePath = labelService.getUriLabel(hookFile.uri, { relative: true });
              fileItems.push({
                label: relativePath,
                fileUri: hookFile.uri
              });
            }
          }
          if (hookFiles.length === 0) {
            selectedFile = fileItems[0];
          } else {
            picker.items = fileItems;
            picker.value = "";
            picker.placeholder = localize("commands.hooks.selectFile.placeholder", "Select a hook file or create a new one");
            picker.title = localize("commands.hooks.addHook.title", "Add Hook");
            picker.buttons = [backButton];
            const result = await awaitPick(picker, backButton);
            if (result === "back") {
              step = goBack() ?? 2 /* SelectHook */;
              break;
            }
            if (!result) {
              return;
            }
            selectedFile = result;
            stepHistory.push(3 /* SelectFile */);
          }
          if (selectedFile.fileUri) {
            await addHookToFile(
              selectedFile.fileUri,
              selectedHookType.hookType,
              fileService,
              editorService,
              notificationService,
              bulkEditService,
              options?.openEditor
            );
            return;
          }
          step = 4 /* SelectFolder */;
          break;
        }
        case 4 /* SelectFolder */: {
          const allFolders = await promptsService.getSourceFolders(PromptsType.hook);
          if (allFolders.length === 0) {
            notificationService.error(localize("commands.hook.noLocalFolders", "Please open a workspace folder to configure hooks."));
            return;
          }
          selectedFolder = allFolders[0];
          if (allFolders.length > 1) {
            const folderItems = allFolders.map((folder, index) => {
              const basePath = labelService.getUriLabel(folder.uri, { relative: folder.storage === PromptsStorage.local });
              const label = index === 0 ? localize("commands.hook.defaultFolder", "{0} (default)", basePath) : basePath;
              return {
                label,
                description: folder.source ? getSourceDescription(folder.source) : void 0,
                folder
              };
            });
            picker.items = folderItems;
            picker.value = "";
            picker.placeholder = localize("commands.hook.selectFolder.placeholder", "Select a location for the hook file");
            picker.title = localize("commands.hook.selectFolder.title", "Hook File Location");
            picker.buttons = [backButton];
            const result = await awaitPick(picker, backButton);
            if (result === "back") {
              step = goBack() ?? 3 /* SelectFile */;
              break;
            }
            if (!result) {
              return;
            }
            selectedFolder = result.folder;
            stepHistory.push(4 /* SelectFolder */);
          }
          step = 5 /* EnterFilename */;
          break;
        }
        case 5 /* EnterFilename */: {
          picker.hide();
          const fileNameResult = await new Promise((resolve) => {
            let resolved = false;
            const done = (value) => {
              if (!resolved) {
                resolved = true;
                inputDisposables.dispose();
                resolve(value);
              }
            };
            const inputDisposables = new DisposableStore();
            const inputBox = inputDisposables.add(quickInputService.createInputBox());
            inputBox.prompt = localize("commands.hook.filename.prompt", "Enter hook file name");
            inputBox.placeholder = localize("commands.hook.filename.placeholder", "e.g., hooks, diagnostics, security");
            inputBox.title = localize("commands.hook.filename.title", "Hook File Name");
            inputBox.buttons = [backButton];
            inputBox.ignoreFocusOut = true;
            inputDisposables.add(inputBox.onDidAccept(async () => {
              const value = inputBox.value;
              if (!value || !value.trim()) {
                inputBox.validationMessage = localize("commands.hook.filename.required", "File name is required");
                return;
              }
              const name = value.trim();
              if (/[/\\:*?"<>|]/.test(name)) {
                inputBox.validationMessage = localize("commands.hook.filename.invalidChars", "File name contains invalid characters");
                return;
              }
              done(name);
            }));
            inputDisposables.add(inputBox.onDidChangeValue(() => {
              inputBox.validationMessage = void 0;
            }));
            inputDisposables.add(inputBox.onDidTriggerButton((button) => {
              if (button === backButton) {
                done("back");
              }
            }));
            inputDisposables.add(inputBox.onDidHide(() => {
              done(void 0);
            }));
            inputBox.show();
          });
          if (fileNameResult === "back") {
            picker.show();
            step = goBack() ?? 4 /* SelectFolder */;
            break;
          }
          if (!fileNameResult) {
            return;
          }
          await fileService.createFolder(selectedFolder.uri);
          const hookFileName = fileNameResult.endsWith(".json") ? fileNameResult : `${fileNameResult}.json`;
          const hookFileUri = URI.joinPath(selectedFolder.uri, hookFileName);
          if (await fileService.exists(hookFileUri)) {
            await addHookToFile(
              hookFileUri,
              selectedHookType.hookType,
              fileService,
              editorService,
              notificationService,
              bulkEditService,
              options?.openEditor
            );
            return;
          }
          const newFileFormat = getHookSourceFormat(hookFileUri);
          const isClaudeNewFile = newFileFormat === HookSourceFormat.Claude;
          const isCopilotCliOnly = !isClaudeNewFile && !new Set(Object.values(HOOKS_BY_TARGET[Target.VSCode])).has(selectedHookType.hookType) && new Set(Object.values(HOOKS_BY_TARGET[Target.GitHubCopilot])).has(selectedHookType.hookType);
          const hookTypeKey = isClaudeNewFile ? getClaudeHookTypeName(selectedHookType.hookType) ?? selectedHookType.hookType : isCopilotCliOnly ? getCopilotCliHookTypeName(selectedHookType.hookType) ?? selectedHookType.hookType : selectedHookType.hookType;
          const newFileHookEntry = isCopilotCliOnly ? { type: "command", [targetOS === OperatingSystem.Windows ? "powershell" : "bash"]: "" } : buildNewHookEntry(newFileFormat);
          const commandFieldKey = isCopilotCliOnly ? targetOS === OperatingSystem.Windows ? "powershell" : "bash" : "command";
          const hooksContent = {
            ...isCopilotCliOnly ? { version: 1 } : {},
            hooks: {
              [hookTypeKey]: [
                newFileHookEntry
              ]
            }
          };
          const jsonContent = JSON.stringify(hooksContent, null, "	");
          await fileService.writeFile(hookFileUri, VSBuffer.fromString(jsonContent));
          options?.onHookFileCreated?.(hookFileUri);
          const selection = findHookCommandSelection(jsonContent, hookTypeKey, 0, commandFieldKey);
          if (options?.openEditor) {
            await options.openEditor(hookFileUri, { selection });
          } else {
            await editorService.openEditor({
              resource: hookFileUri,
              options: {
                selection,
                pinned: false
              }
            });
          }
          return;
        }
      }
    }
  } finally {
    store.dispose();
  }
}
class ManageHooksAction extends Action2 {
  constructor() {
    super({
      id: CONFIGURE_HOOKS_ACTION_ID,
      title: localize2("configure-hooks", "Configure Hooks..."),
      shortTitle: localize2("configure-hooks.short", "Hooks"),
      icon: Codicon.zap,
      f1: true,
      precondition: ChatContextKeys.enabled,
      category: CHAT_CATEGORY,
      menu: {
        id: CHAT_CONFIG_MENU_ID,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
        order: 12,
        group: "1_level"
      }
    });
  }
  async run(accessor) {
    return showConfigureHooksQuickPick(accessor);
  }
}
function registerHookActions() {
  registerAction2(ManageHooksAction);
}
export {
  registerHookActions,
  showConfigureHooksQuickPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcaG9va0FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUpTT05DIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbmMuanMnO1xuaW1wb3J0IHsgc2V0UHJvcGVydHksIGFwcGx5RWRpdHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRWRpdC5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENoYXRWaWV3SWQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlksIENIQVRfQ09ORklHX01FTlVfSUQgfSBmcm9tICcuLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlLCBUYXJnZXQsIGdldFNvdXJjZURlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEhPT0tfTUVUQURBVEEsIEhPT0tTX0JZX1RBUkdFVCwgSG9va1R5cGUsIElIb29rVHlwZU1ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRIb29rQ29tbWFuZExhYmVsLCBnZXRFZmZlY3RpdmVDb21tYW5kRmllbGRLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgZ2V0Q29waWxvdENsaUhvb2tUeXBlTmFtZSwgcmVzb2x2ZUNvcGlsb3RDbGlIb29rVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NvcGlsb3RDbGlDb21wYXQuanMnO1xuaW1wb3J0IHsgZ2V0SG9va1NvdXJjZUZvcm1hdCwgSG9va1NvdXJjZUZvcm1hdCwgYnVpbGROZXdIb29rRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tDb21wYXRpYmlsaXR5LmpzJztcbmltcG9ydCB7IGdldENsYXVkZUhvb2tUeXBlTmFtZSwgcmVzb2x2ZUNsYXVkZUhvb2tUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rQ2xhdWRlQ29tcGF0LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24sIGZpbmRIb29rQ29tbWFuZEluWWFtbCwgcGFyc2VBbGxIb29rRmlsZXMsIElQYXJzZWRIb29rIH0gZnJvbSAnLi9ob29rVXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGdldENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG4vKipcbiAqIEFjdGlvbiBJRCBmb3IgdGhlIGBDb25maWd1cmUgSG9va3NgIGFjdGlvbi5cbiAqL1xuY29uc3QgQ09ORklHVVJFX0hPT0tTX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29uZmlndXJlLmhvb2tzJztcblxuaW50ZXJmYWNlIElIb29rVHlwZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGhvb2tUeXBlOiBIb29rVHlwZTtcblx0cmVhZG9ubHkgaG9va1R5cGVNZXRhOiBJSG9va1R5cGVNZXRhO1xufVxuXG5pbnRlcmZhY2UgSUhvb2tRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBob29rRW50cnk/OiBJUGFyc2VkSG9vaztcblx0cmVhZG9ubHkgaXNBZGROZXdIb29rPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElIb29rRmlsZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGZpbGVVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IGlzQ3JlYXRlTmV3RmlsZT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogRGV0ZWN0cyBpZiBleGlzdGluZyBob29rcyB1c2UgQ29waWxvdCBDTEkgbmFtaW5nIGNvbnZlbnRpb24gKGNhbWVsQ2FzZSkuXG4gKiBSZXR1cm5zIHRydWUgaWYgYW55IGV4aXN0aW5nIGtleSBtYXRjaGVzIHRoZSBDb3BpbG90IENMSSBmb3JtYXQuXG4gKi9cbmZ1bmN0aW9uIHVzZXNDb3BpbG90Q2xpTmFtaW5nKGhvb2tzT2JqOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhob29rc09iaikpIHtcblx0XHQvLyBDaGVjayBpZiBhbnkga2V5IHJlc29sdmVzIHRvIGEgQ29waWxvdCBDTEkgaG9vayB0eXBlXG5cdFx0aWYgKHJlc29sdmVDb3BpbG90Q2xpSG9va1R5cGUoa2V5KSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEdldHMgdGhlIGFwcHJvcHJpYXRlIGtleSBuYW1lIGZvciBhIGhvb2sgdHlwZSBiYXNlZCBvbiB0aGUgbmFtaW5nIGNvbnZlbnRpb24gdXNlZCBpbiB0aGUgZmlsZS5cbiAqL1xuZnVuY3Rpb24gZ2V0SG9va1R5cGVLZXlOYW1lKGhvb2tUeXBlSWQ6IEhvb2tUeXBlLCB1c2VDb3BpbG90Q2xpTmFtaW5nQ29udmVudGlvbjogYm9vbGVhbik6IHN0cmluZyB7XG5cdGlmICh1c2VDb3BpbG90Q2xpTmFtaW5nQ29udmVudGlvbikge1xuXHRcdGNvbnN0IGNvcGlsb3RDbGlOYW1lID0gZ2V0Q29waWxvdENsaUhvb2tUeXBlTmFtZShob29rVHlwZUlkKTtcblx0XHRpZiAoY29waWxvdENsaU5hbWUpIHtcblx0XHRcdHJldHVybiBjb3BpbG90Q2xpTmFtZTtcblx0XHR9XG5cdH1cblx0Ly8gRmFsbCBiYWNrIHRvIFBhc2NhbENhc2UgKGVudW0gdmFsdWUpXG5cdHJldHVybiBob29rVHlwZUlkO1xufVxuXG4vKipcbiAqIEFkZHMgYSBob29rIHRvIGFuIGV4aXN0aW5nIGhvb2sgZmlsZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gYWRkSG9va1RvRmlsZShcblx0aG9va0ZpbGVVcmk6IFVSSSxcblx0aG9va1R5cGVJZDogSG9va1R5cGUsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0YnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRvcGVuRWRpdG9yT3ZlcnJpZGU/OiAocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IHsgc2VsZWN0aW9uPzogSVRleHRFZGl0b3JTZWxlY3Rpb24gfSkgPT4gUHJvbWlzZTx2b2lkPixcbik6IFByb21pc2U8dm9pZD4ge1xuXHQvLyBQYXJzZSBleGlzdGluZyBmaWxlXG5cdGxldCBob29rc0NvbnRlbnQ6IHsgaG9va3M6IFJlY29yZDxzdHJpbmcsIHVua25vd25bXT4gfTtcblx0Y29uc3QgZmlsZUV4aXN0cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhob29rRmlsZVVyaSk7XG5cblx0aWYgKGZpbGVFeGlzdHMpIHtcblx0XHRjb25zdCBleGlzdGluZ0NvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShob29rRmlsZVVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGhvb2tzQ29udGVudCA9IHBhcnNlSlNPTkMoZXhpc3RpbmdDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gRW5zdXJlIGhvb2tzIG9iamVjdCBleGlzdHNcblx0XHRcdGlmICghaG9va3NDb250ZW50Lmhvb2tzKSB7XG5cdFx0XHRcdGhvb2tzQ29udGVudC5ob29rcyA9IHt9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWYgcGFyc2luZyBmYWlscywgc2hvdyBlcnJvciBhbmQgb3BlbiBmaWxlIGZvciB1c2VyIHRvIGZpeFxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY29tbWFuZHMubmV3Lmhvb2sucGFyc2VFcnJvcicsIFwiRmFpbGVkIHRvIHBhcnNlIGV4aXN0aW5nIGhvb2tzIGZpbGUuIFBsZWFzZSBmaXggdGhlIEpTT04gc3ludGF4IGVycm9ycyBhbmQgdHJ5IGFnYWluLlwiKSk7XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogaG9va0ZpbGVVcmkgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIENyZWF0ZSBuZXcgc3RydWN0dXJlXG5cdFx0aG9va3NDb250ZW50ID0geyBob29rczoge30gfTtcblx0fVxuXG5cdC8vIERldGVjdCBzb3VyY2UgZm9ybWF0IGZyb20gZmlsZSBVUklcblx0Y29uc3Qgc291cmNlRm9ybWF0ID0gZ2V0SG9va1NvdXJjZUZvcm1hdChob29rRmlsZVVyaSk7XG5cdGNvbnN0IGlzQ2xhdWRlID0gc291cmNlRm9ybWF0ID09PSBIb29rU291cmNlRm9ybWF0LkNsYXVkZTtcblxuXHQvLyBEZXRlY3QgbmFtaW5nIGNvbnZlbnRpb24gZnJvbSBleGlzdGluZyBrZXlzXG5cdGNvbnN0IHVzZUNvcGlsb3RDbGlOYW1pbmdDb252ZW50aW9uID0gIWlzQ2xhdWRlICYmIHVzZXNDb3BpbG90Q2xpTmFtaW5nKGhvb2tzQ29udGVudC5ob29rcyk7XG5cdGNvbnN0IGhvb2tUeXBlS2V5TmFtZSA9IGlzQ2xhdWRlXG5cdFx0PyAoZ2V0Q2xhdWRlSG9va1R5cGVOYW1lKGhvb2tUeXBlSWQpID8/IGhvb2tUeXBlSWQpXG5cdFx0OiBnZXRIb29rVHlwZUtleU5hbWUoaG9va1R5cGVJZCwgdXNlQ29waWxvdENsaU5hbWluZ0NvbnZlbnRpb24pO1xuXG5cdC8vIEFsc28gY2hlY2sgaWYgdGhlcmUncyBhbiBleGlzdGluZyBrZXkgZm9yIHRoaXMgaG9vayB0eXBlICh3aXRoIGVpdGhlciBuYW1pbmcpXG5cdC8vIEZpbmQgZXhpc3Rpbmcga2V5IHRoYXQgcmVzb2x2ZXMgdG8gdGhlIHNhbWUgaG9vayB0eXBlXG5cdGxldCBleGlzdGluZ0tleUZvclR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoaG9va3NDb250ZW50Lmhvb2tzKSkge1xuXHRcdGNvbnN0IHJlc29sdmVkVHlwZSA9IGlzQ2xhdWRlXG5cdFx0XHQ/IHJlc29sdmVDbGF1ZGVIb29rVHlwZShrZXkpXG5cdFx0XHQ6IHJlc29sdmVDb3BpbG90Q2xpSG9va1R5cGUoa2V5KTtcblx0XHRpZiAocmVzb2x2ZWRUeXBlID09PSBob29rVHlwZUlkIHx8IGtleSA9PT0gaG9va1R5cGVJZCkge1xuXHRcdFx0ZXhpc3RpbmdLZXlGb3JUeXBlID0ga2V5O1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Ly8gVXNlIGV4aXN0aW5nIGtleSBpZiBmb3VuZCwgb3RoZXJ3aXNlIHVzZSB0aGUgZGV0ZWN0ZWQgbmFtaW5nIGNvbnZlbnRpb25cblx0Y29uc3Qga2V5VG9Vc2UgPSBleGlzdGluZ0tleUZvclR5cGUgPz8gaG9va1R5cGVLZXlOYW1lO1xuXG5cdC8vIERldGVybWluZSB0aGUgbmV3IGhvb2sgaW5kZXggKGFwcGVuZCBpZiBob29rIHR5cGUgYWxyZWFkeSBleGlzdHMpXG5cdGNvbnN0IG5ld0hvb2tFbnRyeSA9IGJ1aWxkTmV3SG9va0VudHJ5KHNvdXJjZUZvcm1hdCk7XG5cdGNvbnN0IGV4aXN0aW5nSG9va3MgPSBob29rc0NvbnRlbnQuaG9va3Nba2V5VG9Vc2VdO1xuXHRjb25zdCBuZXdIb29rSW5kZXggPSBBcnJheS5pc0FycmF5KGV4aXN0aW5nSG9va3MpID8gZXhpc3RpbmdIb29rcy5sZW5ndGggOiAwO1xuXG5cdC8vIEdlbmVyYXRlIHRoZSBuZXcgSlNPTiBjb250ZW50IHVzaW5nIHNldFByb3BlcnR5IHRvIHByZXNlcnZlIGNvbW1lbnRzXG5cdGxldCBqc29uQ29udGVudDogc3RyaW5nO1xuXHRpZiAoZmlsZUV4aXN0cykge1xuXHRcdC8vIFVzZSBzZXRQcm9wZXJ0eSB0byBtYWtlIHRhcmdldGVkIGVkaXRzIHRoYXQgcHJlc2VydmUgY29tbWVudHNcblx0XHRjb25zdCBvcmlnaW5hbFRleHQgPSAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoaG9va0ZpbGVVcmkpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGRldGVjdGVkRW9sID0gb3JpZ2luYWxUZXh0LmluY2x1ZGVzKCdcXHJcXG4nKSA/ICdcXHJcXG4nIDogJ1xcbic7XG5cdFx0Y29uc3QgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zID0geyB0YWJTaXplOiAxLCBpbnNlcnRTcGFjZXM6IGZhbHNlLCBlb2w6IGRldGVjdGVkRW9sIH07XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShvcmlnaW5hbFRleHQsIFsnaG9va3MnLCBrZXlUb1VzZSwgbmV3SG9va0luZGV4XSwgbmV3SG9va0VudHJ5LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0anNvbkNvbnRlbnQgPSBhcHBseUVkaXRzKG9yaWdpbmFsVGV4dCwgZWRpdHMpO1xuXHR9IGVsc2Uge1xuXHRcdC8vIE5ldyBmaWxlIC0gdXNlIEpTT04uc3RyaW5naWZ5IHNpbmNlIHRoZXJlIGFyZSBubyBjb21tZW50cyB0byBwcmVzZXJ2ZVxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSB7IGhvb2tzOiB7IFtrZXlUb1VzZV06IFtuZXdIb29rRW50cnldIH0gfTtcblx0XHRqc29uQ29udGVudCA9IEpTT04uc3RyaW5naWZ5KG5ld0NvbnRlbnQsIG51bGwsICdcXHQnKTtcblx0fVxuXG5cdC8vIENoZWNrIGlmIHRoZSBmaWxlIGlzIGFscmVhZHkgb3BlbiBpbiBhbiBlZGl0b3Jcblx0Y29uc3QgZXhpc3RpbmdFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmVkaXRvcnMuZmluZChlID0+IGlzRXF1YWwoZS5yZXNvdXJjZSwgaG9va0ZpbGVVcmkpKTtcblxuXHRpZiAoZXhpc3RpbmdFZGl0b3IpIHtcblx0XHQvLyBGaWxlIGlzIGFscmVhZHkgb3BlbiAtIGZpcnN0IGZvY3VzIHRoZSBlZGl0b3IsIHRoZW4gdXBkYXRlIGl0cyBtb2RlbCBkaXJlY3RseVxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogaG9va0ZpbGVVcmksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogZmFsc2Vcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEdldCB0aGUgY29kZSBlZGl0b3IgYW5kIHVwZGF0ZSBpdHMgY29udGVudCBkaXJlY3RseVxuXHRcdGNvbnN0IGVkaXRvciA9IGdldENvZGVFZGl0b3IoZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0aWYgKGVkaXRvciAmJiBlZGl0b3IuaGFzTW9kZWwoKSAmJiBpc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpLnVyaSwgaG9va0ZpbGVVcmkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Ly8gQXBwbHkgdGhlIGZ1bGwgY29udGVudCByZXBsYWNlbWVudCB1c2luZyBleGVjdXRlRWRpdHNcblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbXSwgW3tcblx0XHRcdFx0cmFuZ2U6IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksXG5cdFx0XHRcdHRleHQ6IGpzb25Db250ZW50XG5cdFx0XHR9XSwgKCkgPT4gbnVsbCk7XG5cblx0XHRcdC8vIEZpbmQgYW5kIGFwcGx5IHRoZSBzZWxlY3Rpb25cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihqc29uQ29udGVudCwga2V5VG9Vc2UsIG5ld0hvb2tJbmRleCwgJ2NvbW1hbmQnKTtcblx0XHRcdGlmIChzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgIT09IHVuZGVmaW5lZCAmJiBzZWxlY3Rpb24uZW5kQ29sdW1uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzZWxlY3Rpb24uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBzZWxlY3Rpb24uZW5kQ29sdW1uXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRlZGl0b3IucmV2ZWFsTGluZUluQ2VudGVyKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGYWxsYmFjazogYWN0aXZlIGVkaXRvci9tb2RlbCBjaGVjayBmYWlsZWQsIGFwcGx5IHZpYSBidWxrIGVkaXQgc2VydmljZVxuXHRcdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KFtcblx0XHRcdFx0bmV3IFJlc291cmNlVGV4dEVkaXQoaG9va0ZpbGVVcmksIHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgMSksIHRleHQ6IGpzb25Db250ZW50IH0pXG5cdFx0XHRdLCB7IGxhYmVsOiBsb2NhbGl6ZSgnYWRkSG9vaycsIFwiQWRkIEhvb2tcIikgfSk7XG5cblx0XHRcdC8vIEZpbmQgdGhlIHNlbGVjdGlvbiBmb3IgdGhlIG5ldyBob29rJ3MgY29tbWFuZCBmaWVsZFxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGpzb25Db250ZW50LCBrZXlUb1VzZSwgbmV3SG9va0luZGV4LCAnY29tbWFuZCcpO1xuXG5cdFx0XHQvLyBSZS1vcGVuIGVkaXRvciB3aXRoIHNlbGVjdGlvblxuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IGhvb2tGaWxlVXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHRcdHBpbm5lZDogZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIEZpbGUgaXMgbm90IGN1cnJlbnRseSBvcGVuIGluIGFuIGVkaXRvclxuXHRcdGlmICghZmlsZUV4aXN0cykge1xuXHRcdFx0Ly8gRmlsZSBkb2Vzbid0IGV4aXN0IC0gd3JpdGUgbmV3IGZpbGUgZGlyZWN0bHkgYW5kIG9wZW5cblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShob29rRmlsZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhqc29uQ29udGVudCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGaWxlIGV4aXN0cyBidXQgaXNuJ3Qgb3BlbiAtIG9wZW4gaXQgZmlyc3QsIHRoZW4gdXNlIGJ1bGsgZWRpdCBmb3IgdW5kbyBzdXBwb3J0XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogaG9va0ZpbGVVcmksXG5cdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiBmYWxzZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQXBwbHkgdGhlIGVkaXQgdmlhIGJ1bGsgZWRpdCBzZXJ2aWNlIGZvciBwcm9wZXIgdW5kbyBzdXBwb3J0XG5cdFx0XHRhd2FpdCBidWxrRWRpdFNlcnZpY2UuYXBwbHkoW1xuXHRcdFx0XHRuZXcgUmVzb3VyY2VUZXh0RWRpdChob29rRmlsZVVyaSwgeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCAxKSwgdGV4dDoganNvbkNvbnRlbnQgfSlcblx0XHRcdF0sIHsgbGFiZWw6IGxvY2FsaXplKCdhZGRIb29rJywgXCJBZGQgSG9va1wiKSB9KTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBzZWxlY3Rpb24gZm9yIHRoZSBuZXcgaG9vaydzIGNvbW1hbmQgZmllbGRcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oanNvbkNvbnRlbnQsIGtleVRvVXNlLCBuZXdIb29rSW5kZXgsICdjb21tYW5kJyk7XG5cblx0XHQvLyBPcGVuIGVkaXRvciB3aXRoIHNlbGVjdGlvbiAob3IgcmUtZm9jdXMgaWYgYWxyZWFkeSBvcGVuKVxuXHRcdGlmIChvcGVuRWRpdG9yT3ZlcnJpZGUpIHtcblx0XHRcdGF3YWl0IG9wZW5FZGl0b3JPdmVycmlkZShob29rRmlsZVVyaSwgeyBzZWxlY3Rpb24gfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBob29rRmlsZVVyaSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0XHRwaW5uZWQ6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEF3YWl0cyBhIHNpbmdsZSBwaWNrIGludGVyYWN0aW9uIG9uIHRoZSBnaXZlbiBwaWNrZXIuXG4gKiBSZXR1cm5zIHRoZSBzZWxlY3RlZCBpdGVtLCAnYmFjaycgaWYgdGhlIGJhY2sgYnV0dG9uIHdhcyBwcmVzc2VkLCBvciB1bmRlZmluZWQgaWYgY2FuY2VsbGVkLlxuICovXG5mdW5jdGlvbiBhd2FpdFBpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihcblx0cGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sXG5cdGJhY2tCdXR0b246IElRdWlja0lucHV0QnV0dG9uLFxuKTogUHJvbWlzZTxUIHwgJ2JhY2snIHwgdW5kZWZpbmVkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxUIHwgJ2JhY2snIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkb25lID0gKHZhbHVlOiBUIHwgJ2JhY2snIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0ZG9uZShwaWNrZXIuYWN0aXZlSXRlbXNbMF0gYXMgVCB8IHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRpZiAoYnV0dG9uID09PSBiYWNrQnV0dG9uKSB7XG5cdFx0XHRcdGRvbmUoJ2JhY2snKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0ZG9uZSh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0fSk7XG59XG5cbmNvbnN0IGVudW0gU3RlcCB7XG5cdFNlbGVjdEhvb2tUeXBlID0gMSxcblx0U2VsZWN0SG9vayA9IDIsXG5cdFNlbGVjdEZpbGUgPSAzLFxuXHRTZWxlY3RGb2xkZXIgPSA0LFxuXHRFbnRlckZpbGVuYW1lID0gNSxcbn1cblxuLyoqXG4gKiBPcHRpb25hbCBjYWxsYmFja3MgYW5kIHNldHRpbmdzIGZvciBjdXN0b21pemluZyB0aGUgaG9vayBjcmVhdGlvbiBhbmQgb3BlbmluZyBiZWhhdmlvdXIuXG4gKiBUaGUgYWdlbnRpYyBlZGl0b3IgcGFzc2VzIHRoZXNlIHRvIG9wZW4gaG9va3MgaW4gdGhlIGVtYmVkZGVkIGVkaXRvciBhbmRcbiAqIHRyYWNrIHdvcmt0cmVlIGZpbGVzIGZvciBhdXRvLWNvbW1pdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSG9va1F1aWNrUGlja09wdGlvbnMge1xuXHQvKiogT3ZlcnJpZGUgaG93IHRoZSBob29rIGZpbGUgaXMgb3BlbmVkLiBJZiBub3QgcHJvdmlkZWQsIHVzZXMgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yLiAqL1xuXHRyZWFkb25seSBvcGVuRWRpdG9yPzogKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IHNlbGVjdGlvbj86IElUZXh0RWRpdG9yU2VsZWN0aW9uIH0pID0+IFByb21pc2U8dm9pZD47XG5cdC8qKiBDYWxsZWQgYWZ0ZXIgYSBuZXcgaG9vayBmaWxlIGlzIGNyZWF0ZWQgb24gZGlzay4gKi9cblx0cmVhZG9ubHkgb25Ib29rRmlsZUNyZWF0ZWQ/OiAodXJpOiBVUkkpID0+IHZvaWQ7XG5cdC8qKiBGaWx0ZXIgdGhlIGRpc3BsYXllZCBob29rIHR5cGVzIHRvIHRob3NlIHN1cHBvcnRlZCBieSB0aGUgZ2l2ZW4gdGFyZ2V0LiAqL1xuXHRyZWFkb25seSB0YXJnZXQ/OiBUYXJnZXQ7XG59XG5cbi8qKlxuICogU2hvd3MgdGhlIENvbmZpZ3VyZSBIb29rcyBxdWljayBwaWNrIFVJLCBhbGxvd2luZyB0aGUgdXNlciB0byB2aWV3LFxuICogb3Blbiwgb3IgY3JlYXRlIGhvb2tzLiBDYW4gYmUgY2FsbGVkIGZyb20gdGhlIGFjdGlvbiBvciBzbGFzaCBjb21tYW5kLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2hvd0NvbmZpZ3VyZUhvb2tzUXVpY2tQaWNrKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0b3B0aW9ucz86IElIb29rUXVpY2tQaWNrT3B0aW9ucyxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBwcm9tcHRzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvbXB0c1NlcnZpY2UpO1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRjb25zdCBsYWJlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSk7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdGNvbnN0IHBhdGhTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYXRoU2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBidWxrRWRpdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJ1bGtFZGl0U2VydmljZSk7XG5cdGNvbnN0IHJlbW90ZUFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRTZXJ2aWNlKTtcblxuXHQvLyBHZXQgdGhlIHJlbW90ZSBPUyAob3IgZmFsbCBiYWNrIHRvIGxvY2FsIE9TKVxuXHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0Y29uc3QgdGFyZ2V0T1MgPSByZW1vdGVFbnY/Lm9zID8/IE9TO1xuXG5cdC8vIEdldCB3b3Jrc3BhY2Ugcm9vdCBhbmQgdXNlciBob21lIGZvciBwYXRoIHJlc29sdXRpb25cblx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXHRjb25zdCB3b3Jrc3BhY2VSb290VXJpID0gd29ya3NwYWNlRm9sZGVyPy51cmk7XG5cdGNvbnN0IHVzZXJIb21lVXJpID0gYXdhaXQgcGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0Y29uc3QgdXNlckhvbWUgPSB1c2VySG9tZVVyaS5mc1BhdGggPz8gdXNlckhvbWVVcmkucGF0aDtcblxuXHQvLyBQYXJzZSBhbGwgaG9vayBmaWxlcyB1cGZyb250IHRvIGNvdW50IGhvb2tzIHBlciB0eXBlXG5cdGNvbnN0IGhvb2tFbnRyaWVzID0gYXdhaXQgcGFyc2VBbGxIb29rRmlsZXMoXG5cdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0ZmlsZVNlcnZpY2UsXG5cdFx0bGFiZWxTZXJ2aWNlLFxuXHRcdHdvcmtzcGFjZVJvb3RVcmksXG5cdFx0dXNlckhvbWUsXG5cdFx0dGFyZ2V0T1MsXG5cdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHR7IGluY2x1ZGVBZ2VudEhvb2tzOiB0cnVlIH1cblx0KTtcblxuXHQvLyBDb3VudCBob29rcyBwZXIgdHlwZVxuXHRjb25zdCBob29rQ291bnRCeVR5cGUgPSBuZXcgTWFwPEhvb2tUeXBlLCBudW1iZXI+KCk7XG5cdGZvciAoY29uc3QgZW50cnkgb2YgaG9va0VudHJpZXMpIHtcblx0XHRob29rQ291bnRCeVR5cGUuc2V0KGVudHJ5Lmhvb2tUeXBlLCAoaG9va0NvdW50QnlUeXBlLmdldChlbnRyeS5ob29rVHlwZSkgPz8gMCkgKyAxKTtcblx0fVxuXG5cdC8vIENyZWF0ZSBhIHNpbmdsZSBwaWNrZXIgaW5zdGFuY2UgcmV1c2VkIGFjcm9zcyBhbGwgc3RlcHNcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHBpY2tlciA9IHN0b3JlLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdGNvbnN0IGJhY2tCdXR0b24gPSBxdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uO1xuXHRwaWNrZXIuc2hvdygpO1xuXG5cdGxldCBzdGVwID0gU3RlcC5TZWxlY3RIb29rVHlwZTtcblx0bGV0IHNlbGVjdGVkSG9va1R5cGU6IElIb29rVHlwZVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdGxldCBzZWxlY3RlZEhvb2s6IElIb29rUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblx0bGV0IHNlbGVjdGVkRmlsZTogSUhvb2tGaWxlUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblx0bGV0IHNlbGVjdGVkRm9sZGVyOiB7IHVyaTogVVJJIH0gfCB1bmRlZmluZWQ7XG5cblx0Ly8gVHJhY2sgc3RlcHMgdGhhdCB3ZXJlIGFjdHVhbGx5IHNob3duIHRvIHRoZSB1c2VyLCBzbyBCYWNrXG5cdC8vIHNraXBzIG92ZXIgYXV0by1leGVjdXRlZCBzdGVwcyBhbmQgcmV0dXJucyB0byB0aGUgbGFzdCB2aXNpYmxlIG9uZS5cblx0Y29uc3Qgc3RlcEhpc3Rvcnk6IFN0ZXBbXSA9IFtdO1xuXHRjb25zdCBnb0JhY2sgPSAoKTogU3RlcCB8IHVuZGVmaW5lZCA9PiBzdGVwSGlzdG9yeS5wb3AoKTtcblxuXHR0cnkge1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRzd2l0Y2ggKHN0ZXApIHtcblx0XHRcdFx0Y2FzZSBTdGVwLlNlbGVjdEhvb2tUeXBlOiB7XG5cdFx0XHRcdFx0Ly8gU3RlcCAxOiBTaG93IGxpZmVjeWNsZSBldmVudHMgd2l0aCBob29rIGNvdW50cywgZmlsdGVyZWQgYnkgdGFyZ2V0XG5cdFx0XHRcdFx0Y29uc3QgbWFrZUl0ZW0gPSAoW2hvb2tUeXBlLCBtZXRhXTogW0hvb2tUeXBlLCBJSG9va1R5cGVNZXRhXSk6IElIb29rVHlwZVF1aWNrUGlja0l0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY291bnQgPSBob29rQ291bnRCeVR5cGUuZ2V0KGhvb2tUeXBlKSA/PyAwO1xuXHRcdFx0XHRcdFx0Y29uc3QgY291bnRMYWJlbCA9IGNvdW50ID4gMCA/IGAgKCR7Y291bnR9KWAgOiAnJztcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBgJHttZXRhLmxhYmVsfSR7Y291bnRMYWJlbH1gLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbWV0YS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0aG9va1R5cGUsXG5cdFx0XHRcdFx0XHRcdGhvb2tUeXBlTWV0YTogbWV0YVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0bGV0IHBpY2tlckl0ZW1zOiAoSUhvb2tUeXBlUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW107XG5cblx0XHRcdFx0XHRpZiAob3B0aW9ucz8udGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHQvLyBGaWx0ZXJlZCB0byBhIHNwZWNpZmljIHRhcmdldFxuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0SG9va1R5cGVzID0gbmV3IFNldChPYmplY3QudmFsdWVzKEhPT0tTX0JZX1RBUkdFVFtvcHRpb25zLnRhcmdldF0pKTtcblx0XHRcdFx0XHRcdHBpY2tlckl0ZW1zID0gKE9iamVjdC5lbnRyaWVzKEhPT0tfTUVUQURBVEEpIGFzIFtIb29rVHlwZSwgSUhvb2tUeXBlTWV0YV1bXSlcblx0XHRcdFx0XHRcdFx0LmZpbHRlcigoW2hvb2tUeXBlXSkgPT4gdGFyZ2V0SG9va1R5cGVzLmhhcyhob29rVHlwZSkpXG5cdFx0XHRcdFx0XHRcdC5tYXAobWFrZUl0ZW0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBObyB0YXJnZXQ6IGdyb3VwIGludG8gRGVmYXVsdCAoc2hhcmVkKSwgVlMgQ29kZSBPbmx5LCBDb3BpbG90IE9ubHlcblx0XHRcdFx0XHRcdGNvbnN0IHZzY29kZVR5cGVzID0gbmV3IFNldChPYmplY3QudmFsdWVzKEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuVlNDb2RlXSkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29waWxvdFR5cGVzID0gbmV3IFNldChPYmplY3QudmFsdWVzKEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuR2l0SHViQ29waWxvdF0pKTtcblx0XHRcdFx0XHRcdGNvbnN0IGFsbEVudHJpZXMgPSBPYmplY3QuZW50cmllcyhIT09LX01FVEFEQVRBKSBhcyBbSG9va1R5cGUsIElIb29rVHlwZU1ldGFdW107XG5cblx0XHRcdFx0XHRcdGNvbnN0IHNoYXJlZCA9IGFsbEVudHJpZXMuZmlsdGVyKChbaF0pID0+IHZzY29kZVR5cGVzLmhhcyhoKSAmJiBjb3BpbG90VHlwZXMuaGFzKGgpKTtcblx0XHRcdFx0XHRcdGNvbnN0IHZzY29kZU9ubHkgPSBhbGxFbnRyaWVzLmZpbHRlcigoW2hdKSA9PiB2c2NvZGVUeXBlcy5oYXMoaCkgJiYgIWNvcGlsb3RUeXBlcy5oYXMoaCkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29waWxvdE9ubHkgPSBhbGxFbnRyaWVzLmZpbHRlcigoW2hdKSA9PiAhdnNjb2RlVHlwZXMuaGFzKGgpICYmIGNvcGlsb3RUeXBlcy5oYXMoaCkpO1xuXG5cdFx0XHRcdFx0XHRwaWNrZXJJdGVtcyA9IFtdO1xuXHRcdFx0XHRcdFx0aWYgKHNoYXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tlckl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdob29rU2VjdGlvbi5kZWZhdWx0JywgXCJMb2NhbC9Db3BpbG90IEFnZW50c1wiKSB9KTtcblx0XHRcdFx0XHRcdFx0cGlja2VySXRlbXMucHVzaCguLi5zaGFyZWQubWFwKG1ha2VJdGVtKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodnNjb2RlT25seS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tlckl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdob29rU2VjdGlvbi52c2NvZGVPbmx5JywgXCJMb2NhbCBBZ2VudHNcIikgfSk7XG5cdFx0XHRcdFx0XHRcdHBpY2tlckl0ZW1zLnB1c2goLi4udnNjb2RlT25seS5tYXAobWFrZUl0ZW0pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChjb3BpbG90T25seS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tlckl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdob29rU2VjdGlvbi5jb3BpbG90Q2xpT25seScsIFwiQ29waWxvdCBBZ2VudHNcIikgfSk7XG5cdFx0XHRcdFx0XHRcdHBpY2tlckl0ZW1zLnB1c2goLi4uY29waWxvdE9ubHkubWFwKG1ha2VJdGVtKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gcGlja2VySXRlbXM7XG5cdFx0XHRcdFx0cGlja2VyLnZhbHVlID0gJyc7XG5cdFx0XHRcdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NvbW1hbmRzLmhvb2tzLnNlbGVjdEV2ZW50LnBsYWNlaG9sZGVyJywgJ1NlbGVjdCBhIGxpZmVjeWNsZSBldmVudCcpO1xuXHRcdFx0XHRcdHBpY2tlci50aXRsZSA9IGxvY2FsaXplKCdjb21tYW5kcy5ob29rcy50aXRsZScsICdIb29rcycpO1xuXHRcdFx0XHRcdHBpY2tlci5idXR0b25zID0gW107XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhd2FpdFBpY2s8SUhvb2tUeXBlUXVpY2tQaWNrSXRlbT4ocGlja2VyLCBiYWNrQnV0dG9uKTtcblxuXHRcdFx0XHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdCA9PT0gJ2JhY2snKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c2VsZWN0ZWRIb29rVHlwZSA9IHJlc3VsdDtcblx0XHRcdFx0XHRzdGVwSGlzdG9yeS5wdXNoKFN0ZXAuU2VsZWN0SG9va1R5cGUpO1xuXHRcdFx0XHRcdHN0ZXAgPSBTdGVwLlNlbGVjdEhvb2s7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYXNlIFN0ZXAuU2VsZWN0SG9vazoge1xuXHRcdFx0XHRcdC8vIEZpbHRlciBob29rcyBieSB0aGUgc2VsZWN0ZWQgdHlwZVxuXHRcdFx0XHRcdGNvbnN0IGhvb2tzT2ZUeXBlID0gaG9va0VudHJpZXMuZmlsdGVyKGggPT4gaC5ob29rVHlwZSA9PT0gc2VsZWN0ZWRIb29rVHlwZSEuaG9va1R5cGUpO1xuXG5cdFx0XHRcdFx0Ly8gU2VwYXJhdGUgaG9va3MgYnkgc291cmNlXG5cdFx0XHRcdFx0Y29uc3QgZmlsZUhvb2tzID0gaG9va3NPZlR5cGUuZmlsdGVyKGggPT4gIWguYWdlbnROYW1lKTtcblx0XHRcdFx0XHRjb25zdCBhZ2VudEhvb2tzID0gaG9va3NPZlR5cGUuZmlsdGVyKGggPT4gaC5hZ2VudE5hbWUpO1xuXG5cdFx0XHRcdFx0Ly8gU3RlcCAyOiBTaG93IFwiQWRkIG5ldyBob29rXCIgKyBleGlzdGluZyBob29rcyBvZiB0aGlzIHR5cGVcblx0XHRcdFx0XHRjb25zdCBob29rSXRlbXM6IChJSG9va1F1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cblx0XHRcdFx0XHQvLyBBZGQgXCJBZGQgbmV3IGhvb2tcIiBvcHRpb24gYXQgdGhlIHRvcFxuXHRcdFx0XHRcdGhvb2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBgJChwbHVzKSAke2xvY2FsaXplKCdjb21tYW5kcy5hZGROZXdIb29rLmxhYmVsJywgJ0FkZCBuZXcgaG9vay4uLicpfWAsXG5cdFx0XHRcdFx0XHRpc0FkZE5ld0hvb2s6IHRydWUsXG5cdFx0XHRcdFx0XHRhbHdheXNTaG93OiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBBZGQgZXhpc3RpbmcgZmlsZS1iYXNlZCBob29rc1xuXHRcdFx0XHRcdGlmIChmaWxlSG9va3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0aG9va0l0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleGlzdGluZ0hvb2tzJywgXCJFeGlzdGluZyBIb29rc1wiKVxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZmlsZUhvb2tzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVudHJ5LmZpbGVVcmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdGhvb2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogZW50cnkuY29tbWFuZExhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdGhvb2tFbnRyeTogZW50cnlcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQWRkIGFnZW50LWRlZmluZWQgaG9va3MgZ3JvdXBlZCBieSBhZ2VudCBuYW1lXG5cdFx0XHRcdFx0aWYgKGFnZW50SG9va3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWdlbnROYW1lcyA9IFsuLi5uZXcgU2V0KGFnZW50SG9va3MubWFwKGggPT4gaC5hZ2VudE5hbWUhKSldO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhZ2VudE5hbWUgb2YgYWdlbnROYW1lcykge1xuXHRcdFx0XHRcdFx0XHRob29rSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvb2tzJywgXCJBZ2VudDogezB9XCIsIGFnZW50TmFtZSlcblx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBhZ2VudEhvb2tzLmZpbHRlcihoID0+IGguYWdlbnROYW1lID09PSBhZ2VudE5hbWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZW50cnkuZmlsZVVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0XHRob29rSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogZW50cnkuY29tbWFuZExhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0XHRob29rRW50cnk6IGVudHJ5XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBBdXRvLWV4ZWN1dGUgaWYgb25seSBcIkFkZCBuZXcgaG9va1wiIGlzIGF2YWlsYWJsZSAobm8gZXhpc3RpbmcgaG9va3MpXG5cdFx0XHRcdFx0aWYgKGhvb2tzT2ZUeXBlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0c2VsZWN0ZWRIb29rID0gaG9va0l0ZW1zWzBdIGFzIElIb29rUXVpY2tQaWNrSXRlbTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gaG9va0l0ZW1zO1xuXHRcdFx0XHRcdFx0cGlja2VyLnZhbHVlID0gJyc7XG5cdFx0XHRcdFx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY29tbWFuZHMuaG9va3Muc2VsZWN0SG9vay5wbGFjZWhvbGRlcicsICdTZWxlY3QgYSBob29rIHRvIG9wZW4gb3IgYWRkIGEgbmV3IG9uZScpO1xuXHRcdFx0XHRcdFx0cGlja2VyLnRpdGxlID0gc2VsZWN0ZWRIb29rVHlwZSEuaG9va1R5cGVNZXRhLmxhYmVsO1xuXHRcdFx0XHRcdFx0cGlja2VyLmJ1dHRvbnMgPSBbYmFja0J1dHRvbl07XG5cblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGF3YWl0UGljazxJSG9va1F1aWNrUGlja0l0ZW0+KHBpY2tlciwgYmFja0J1dHRvbik7XG5cblx0XHRcdFx0XHRcdGlmIChyZXN1bHQgPT09ICdiYWNrJykge1xuXHRcdFx0XHRcdFx0XHRzdGVwID0gZ29CYWNrKCkgPz8gU3RlcC5TZWxlY3RIb29rVHlwZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzZWxlY3RlZEhvb2sgPSByZXN1bHQ7XG5cdFx0XHRcdFx0XHRzdGVwSGlzdG9yeS5wdXNoKFN0ZXAuU2VsZWN0SG9vayk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gSGFuZGxlIGNsaWNraW5nIG9uIGV4aXN0aW5nIGhvb2sgKGZvY3VzIGludG8gY29tbWFuZClcblx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRIb29rLmhvb2tFbnRyeSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBzZWxlY3RlZEhvb2suaG9va0VudHJ5O1xuXHRcdFx0XHRcdFx0bGV0IHNlbGVjdGlvbjogSVRleHRFZGl0b3JTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRcdGlmIChlbnRyeS5hZ2VudE5hbWUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gQWdlbnQgaG9vazogc2VhcmNoIHRoZSBZQU1MIGZyb250bWF0dGVyIGZvciB0aGUgY29tbWFuZFxuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShlbnRyeS5maWxlVXJpKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb21tYW5kVGV4dCA9IGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoZW50cnkuY29tbWFuZCwgdGFyZ2V0T1MpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjb21tYW5kVGV4dCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgY29tbWFuZFRleHQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gSWdub3JlIGVycm9ycyBhbmQganVzdCBvcGVuIHdpdGhvdXQgc2VsZWN0aW9uXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIEZpbGUgaG9vazogdXNlIEpTT04tYmFzZWQgc2VsZWN0aW9uIGZpbmRlclxuXHRcdFx0XHRcdFx0XHRjb25zdCBjb21tYW5kRmllbGROYW1lID0gZ2V0RWZmZWN0aXZlQ29tbWFuZEZpZWxkS2V5KGVudHJ5LmNvbW1hbmQsIHRhcmdldE9TKTtcblxuXHRcdFx0XHRcdFx0XHRpZiAoY29tbWFuZEZpZWxkTmFtZSkge1xuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoZW50cnkuZmlsZVVyaSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZWxlY3Rpb24gPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZW50cnkub3JpZ2luYWxIb29rVHlwZUlkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRlbnRyeS5pbmRleCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29tbWFuZEZpZWxkTmFtZVxuXHRcdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMgYW5kIGp1c3Qgb3BlbiB3aXRob3V0IHNlbGVjdGlvblxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAob3B0aW9ucz8ub3BlbkVkaXRvcikge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBvcHRpb25zLm9wZW5FZGl0b3IoZW50cnkuZmlsZVVyaSwgeyBzZWxlY3Rpb24gfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBlbnRyeS5maWxlVXJpLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdHBpbm5lZDogZmFsc2Vcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFwiQWRkIG5ldyBob29rXCIgd2FzIHNlbGVjdGVkXG5cdFx0XHRcdFx0c3RlcCA9IFN0ZXAuU2VsZWN0RmlsZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhc2UgU3RlcC5TZWxlY3RGaWxlOiB7XG5cdFx0XHRcdFx0Ly8gU3RlcCAzOiBIYW5kbGUgXCJBZGQgbmV3IGhvb2tcIiAtIHNob3cgY3JlYXRlIG5ldyBmaWxlICsgZXhpc3RpbmcgaG9vayBmaWxlc1xuXHRcdFx0XHRcdC8vIEdldCBleGlzdGluZyBob29rIGZpbGVzIChsb2NhbCBzdG9yYWdlIG9ubHksIG5vdCBVc2VyIERhdGEpXG5cdFx0XHRcdFx0Y29uc3QgaG9va0ZpbGVzID0gYXdhaXQgcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShQcm9tcHRzVHlwZS5ob29rLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdFx0XHRjb25zdCBmaWxlSXRlbXM6IChJSG9va0ZpbGVRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXG5cdFx0XHRcdFx0Ly8gQWRkIFwiQ3JlYXRlIG5ldyBob29rIGNvbmZpZyBmaWxlXCIgb3B0aW9uIGF0IHRoZSB0b3Bcblx0XHRcdFx0XHRmaWxlSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogYCQobmV3LWZpbGUpICR7bG9jYWxpemUoJ2NvbW1hbmRzLmNyZWF0ZU5ld0hvb2tGaWxlLmxhYmVsJywgJ0NyZWF0ZSBuZXcgaG9vayBjb25maWcgZmlsZS4uLicpfWAsXG5cdFx0XHRcdFx0XHRpc0NyZWF0ZU5ld0ZpbGU6IHRydWUsXG5cdFx0XHRcdFx0XHRhbHdheXNTaG93OiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBBZGQgZXhpc3RpbmcgaG9vayBmaWxlc1xuXHRcdFx0XHRcdGlmIChob29rRmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0ZmlsZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleGlzdGluZ0hvb2tGaWxlcycsIFwiRXhpc3RpbmcgSG9vayBGaWxlc1wiKVxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgaG9va0ZpbGUgb2YgaG9va0ZpbGVzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlbGF0aXZlUGF0aCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChob29rRmlsZS51cmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdGZpbGVJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogcmVsYXRpdmVQYXRoLFxuXHRcdFx0XHRcdFx0XHRcdGZpbGVVcmk6IGhvb2tGaWxlLnVyaVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBBdXRvLWV4ZWN1dGUgaWYgbm8gZXhpc3RpbmcgaG9vayBmaWxlc1xuXHRcdFx0XHRcdGlmIChob29rRmlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RlZEZpbGUgPSBmaWxlSXRlbXNbMF0gYXMgSUhvb2tGaWxlUXVpY2tQaWNrSXRlbTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gZmlsZUl0ZW1zO1xuXHRcdFx0XHRcdFx0cGlja2VyLnZhbHVlID0gJyc7XG5cdFx0XHRcdFx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY29tbWFuZHMuaG9va3Muc2VsZWN0RmlsZS5wbGFjZWhvbGRlcicsICdTZWxlY3QgYSBob29rIGZpbGUgb3IgY3JlYXRlIGEgbmV3IG9uZScpO1xuXHRcdFx0XHRcdFx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ2NvbW1hbmRzLmhvb2tzLmFkZEhvb2sudGl0bGUnLCAnQWRkIEhvb2snKTtcblx0XHRcdFx0XHRcdHBpY2tlci5idXR0b25zID0gW2JhY2tCdXR0b25dO1xuXG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhd2FpdFBpY2s8SUhvb2tGaWxlUXVpY2tQaWNrSXRlbT4ocGlja2VyLCBiYWNrQnV0dG9uKTtcblxuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gJ2JhY2snKSB7XG5cdFx0XHRcdFx0XHRcdHN0ZXAgPSBnb0JhY2soKSA/PyBTdGVwLlNlbGVjdEhvb2s7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c2VsZWN0ZWRGaWxlID0gcmVzdWx0O1xuXHRcdFx0XHRcdFx0c3RlcEhpc3RvcnkucHVzaChTdGVwLlNlbGVjdEZpbGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEhhbmRsZSBhZGRpbmcgaG9vayB0byBleGlzdGluZyBmaWxlXG5cdFx0XHRcdFx0aWYgKHNlbGVjdGVkRmlsZS5maWxlVXJpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBhZGRIb29rVG9GaWxlKFxuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZEZpbGUuZmlsZVVyaSxcblx0XHRcdFx0XHRcdFx0c2VsZWN0ZWRIb29rVHlwZSEuaG9va1R5cGUsXG5cdFx0XHRcdFx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRlZGl0b3JTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRidWxrRWRpdFNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM/Lm9wZW5FZGl0b3IsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFwiQ3JlYXRlIG5ldyBob29rIGNvbmZpZyBmaWxlXCIgd2FzIHNlbGVjdGVkXG5cdFx0XHRcdFx0c3RlcCA9IFN0ZXAuU2VsZWN0Rm9sZGVyO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FzZSBTdGVwLlNlbGVjdEZvbGRlcjoge1xuXHRcdFx0XHRcdC8vIEdldCBzb3VyY2UgZm9sZGVycyBmb3IgaG9va3MgKHVzZXMgZ2V0U291cmNlRm9sZGVycyB3aGljaFxuXHRcdFx0XHRcdC8vIGV4Y2x1ZGVzIENsYXVkZSBwYXRocyBhbmQgbm9ybWFsaXplcyB0byBkaXJlY3Rvcmllcylcblx0XHRcdFx0XHRjb25zdCBhbGxGb2xkZXJzID0gYXdhaXQgcHJvbXB0c1NlcnZpY2UuZ2V0U291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5ob29rKTtcblxuXHRcdFx0XHRcdGlmIChhbGxGb2xkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY29tbWFuZHMuaG9vay5ub0xvY2FsRm9sZGVycycsIFwiUGxlYXNlIG9wZW4gYSB3b3Jrc3BhY2UgZm9sZGVyIHRvIGNvbmZpZ3VyZSBob29rcy5cIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEF1dG8tc2VsZWN0IGlmIG9ubHkgb25lIGZvbGRlciwgb3RoZXJ3aXNlIHNob3cgcGlja2VyXG5cdFx0XHRcdFx0c2VsZWN0ZWRGb2xkZXIgPSBhbGxGb2xkZXJzWzBdO1xuXHRcdFx0XHRcdGlmIChhbGxGb2xkZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZvbGRlckl0ZW1zID0gYWxsRm9sZGVycy5tYXAoKGZvbGRlciwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYmFzZVBhdGggPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZm9sZGVyLnVyaSwgeyByZWxhdGl2ZTogZm9sZGVyLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsIH0pO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGluZGV4ID09PSAwID8gbG9jYWxpemUoJ2NvbW1hbmRzLmhvb2suZGVmYXVsdEZvbGRlcicsIFwiezB9IChkZWZhdWx0KVwiLCBiYXNlUGF0aCkgOiBiYXNlUGF0aDtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZm9sZGVyLnNvdXJjZSA/IGdldFNvdXJjZURlc2NyaXB0aW9uKGZvbGRlci5zb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGZvbGRlclxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdHBpY2tlci5pdGVtcyA9IGZvbGRlckl0ZW1zO1xuXHRcdFx0XHRcdFx0cGlja2VyLnZhbHVlID0gJyc7XG5cdFx0XHRcdFx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY29tbWFuZHMuaG9vay5zZWxlY3RGb2xkZXIucGxhY2Vob2xkZXInLCAnU2VsZWN0IGEgbG9jYXRpb24gZm9yIHRoZSBob29rIGZpbGUnKTtcblx0XHRcdFx0XHRcdHBpY2tlci50aXRsZSA9IGxvY2FsaXplKCdjb21tYW5kcy5ob29rLnNlbGVjdEZvbGRlci50aXRsZScsICdIb29rIEZpbGUgTG9jYXRpb24nKTtcblx0XHRcdFx0XHRcdHBpY2tlci5idXR0b25zID0gW2JhY2tCdXR0b25dO1xuXG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhd2FpdFBpY2s8dHlwZW9mIGZvbGRlckl0ZW1zWzBdPihwaWNrZXIsIGJhY2tCdXR0b24pO1xuXG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0ID09PSAnYmFjaycpIHtcblx0XHRcdFx0XHRcdFx0c3RlcCA9IGdvQmFjaygpID8/IFN0ZXAuU2VsZWN0RmlsZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzZWxlY3RlZEZvbGRlciA9IHJlc3VsdC5mb2xkZXI7XG5cdFx0XHRcdFx0XHRzdGVwSGlzdG9yeS5wdXNoKFN0ZXAuU2VsZWN0Rm9sZGVyKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzdGVwID0gU3RlcC5FbnRlckZpbGVuYW1lO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FzZSBTdGVwLkVudGVyRmlsZW5hbWU6IHtcblx0XHRcdFx0XHQvLyBIaWRlIHRoZSBwaWNrZXIgYW5kIHNob3cgYW4gaW5wdXQgYm94IGZvciB0aGUgZmlsZW5hbWVcblx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZmlsZU5hbWVSZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmcgfCAnYmFjaycgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IHJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRjb25zdCBkb25lID0gKHZhbHVlOiBzdHJpbmcgfCAnYmFjaycgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRpbnB1dERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGNvbnN0IGlucHV0RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnB1dEJveCA9IGlucHV0RGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZUlucHV0Qm94KCkpO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3gucHJvbXB0ID0gbG9jYWxpemUoJ2NvbW1hbmRzLmhvb2suZmlsZW5hbWUucHJvbXB0JywgXCJFbnRlciBob29rIGZpbGUgbmFtZVwiKTtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NvbW1hbmRzLmhvb2suZmlsZW5hbWUucGxhY2Vob2xkZXInLCBcImUuZy4sIGhvb2tzLCBkaWFnbm9zdGljcywgc2VjdXJpdHlcIik7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC50aXRsZSA9IGxvY2FsaXplKCdjb21tYW5kcy5ob29rLmZpbGVuYW1lLnRpdGxlJywgXCJIb29rIEZpbGUgTmFtZVwiKTtcblx0XHRcdFx0XHRcdGlucHV0Qm94LmJ1dHRvbnMgPSBbYmFja0J1dHRvbl07XG5cdFx0XHRcdFx0XHRpbnB1dEJveC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cblx0XHRcdFx0XHRcdGlucHV0RGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBpbnB1dEJveC52YWx1ZTtcblx0XHRcdFx0XHRcdFx0aWYgKCF2YWx1ZSB8fCAhdmFsdWUudHJpbSgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnY29tbWFuZHMuaG9vay5maWxlbmFtZS5yZXF1aXJlZCcsIFwiRmlsZSBuYW1lIGlzIHJlcXVpcmVkXCIpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBuYW1lID0gdmFsdWUudHJpbSgpO1xuXHRcdFx0XHRcdFx0XHRpZiAoL1svXFxcXDoqP1wiPD58XS8udGVzdChuYW1lKSkge1xuXHRcdFx0XHRcdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gbG9jYWxpemUoJ2NvbW1hbmRzLmhvb2suZmlsZW5hbWUuaW52YWxpZENoYXJzJywgXCJGaWxlIG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzXCIpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkb25lKG5hbWUpO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0aW5wdXREaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0aW5wdXREaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChidXR0b24gPT09IGJhY2tCdXR0b24pIHtcblx0XHRcdFx0XHRcdFx0XHRkb25lKCdiYWNrJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdGlucHV0RGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGRvbmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnNob3coKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmIChmaWxlTmFtZVJlc3VsdCA9PT0gJ2JhY2snKSB7XG5cdFx0XHRcdFx0XHQvLyBSZS1zaG93IHRoZSBwaWNrZXIgZm9yIHRoZSBwcmV2aW91cyBzdGVwXG5cdFx0XHRcdFx0XHRwaWNrZXIuc2hvdygpO1xuXHRcdFx0XHRcdFx0c3RlcCA9IGdvQmFjaygpID8/IFN0ZXAuU2VsZWN0Rm9sZGVyO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghZmlsZU5hbWVSZXN1bHQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDcmVhdGUgdGhlIGhvb2tzIGZvbGRlciBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHNlbGVjdGVkRm9sZGVyIS51cmkpO1xuXG5cdFx0XHRcdFx0Ly8gVXNlIHVzZXItcHJvdmlkZWQgZmlsZW5hbWUgd2l0aCAuanNvbiBleHRlbnNpb25cblx0XHRcdFx0XHRjb25zdCBob29rRmlsZU5hbWUgPSBmaWxlTmFtZVJlc3VsdC5lbmRzV2l0aCgnLmpzb24nKSA/IGZpbGVOYW1lUmVzdWx0IDogYCR7ZmlsZU5hbWVSZXN1bHR9Lmpzb25gO1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tGaWxlVXJpID0gVVJJLmpvaW5QYXRoKHNlbGVjdGVkRm9sZGVyIS51cmksIGhvb2tGaWxlTmFtZSk7XG5cblx0XHRcdFx0XHQvLyBDaGVjayBpZiBmaWxlIGFscmVhZHkgZXhpc3RzXG5cdFx0XHRcdFx0aWYgKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhob29rRmlsZVVyaSkpIHtcblx0XHRcdFx0XHRcdC8vIEZpbGUgZXhpc3RzIC0gYWRkIGhvb2sgdG8gaXQgaW5zdGVhZCBvZiBjcmVhdGluZyBuZXdcblx0XHRcdFx0XHRcdGF3YWl0IGFkZEhvb2tUb0ZpbGUoXG5cdFx0XHRcdFx0XHRcdGhvb2tGaWxlVXJpLFxuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZEhvb2tUeXBlIS5ob29rVHlwZSxcblx0XHRcdFx0XHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdGJ1bGtFZGl0U2VydmljZSxcblx0XHRcdFx0XHRcdFx0b3B0aW9ucz8ub3BlbkVkaXRvcixcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRGV0ZWN0IGlmIG5ldyBmaWxlIGlzIGEgQ2xhdWRlIGhvb2tzIGZpbGUgYmFzZWQgb24gaXRzIHBhdGhcblx0XHRcdFx0XHRjb25zdCBuZXdGaWxlRm9ybWF0ID0gZ2V0SG9va1NvdXJjZUZvcm1hdChob29rRmlsZVVyaSk7XG5cdFx0XHRcdFx0Y29uc3QgaXNDbGF1ZGVOZXdGaWxlID0gbmV3RmlsZUZvcm1hdCA9PT0gSG9va1NvdXJjZUZvcm1hdC5DbGF1ZGU7XG5cdFx0XHRcdFx0Y29uc3QgaXNDb3BpbG90Q2xpT25seSA9ICFpc0NsYXVkZU5ld0ZpbGVcblx0XHRcdFx0XHRcdCYmICFuZXcgU2V0KE9iamVjdC52YWx1ZXMoSE9PS1NfQllfVEFSR0VUW1RhcmdldC5WU0NvZGVdKSkuaGFzKHNlbGVjdGVkSG9va1R5cGUhLmhvb2tUeXBlKVxuXHRcdFx0XHRcdFx0JiYgbmV3IFNldChPYmplY3QudmFsdWVzKEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuR2l0SHViQ29waWxvdF0pKS5oYXMoc2VsZWN0ZWRIb29rVHlwZSEuaG9va1R5cGUpO1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tUeXBlS2V5ID0gaXNDbGF1ZGVOZXdGaWxlXG5cdFx0XHRcdFx0XHQ/IChnZXRDbGF1ZGVIb29rVHlwZU5hbWUoc2VsZWN0ZWRIb29rVHlwZSEuaG9va1R5cGUpID8/IHNlbGVjdGVkSG9va1R5cGUhLmhvb2tUeXBlKVxuXHRcdFx0XHRcdFx0OiBpc0NvcGlsb3RDbGlPbmx5XG5cdFx0XHRcdFx0XHRcdD8gKGdldENvcGlsb3RDbGlIb29rVHlwZU5hbWUoc2VsZWN0ZWRIb29rVHlwZSEuaG9va1R5cGUpID8/IHNlbGVjdGVkSG9va1R5cGUhLmhvb2tUeXBlKVxuXHRcdFx0XHRcdFx0XHQ6IHNlbGVjdGVkSG9va1R5cGUhLmhvb2tUeXBlO1xuXHRcdFx0XHRcdGNvbnN0IG5ld0ZpbGVIb29rRW50cnkgPSBpc0NvcGlsb3RDbGlPbmx5XG5cdFx0XHRcdFx0XHQ/IHsgdHlwZTogJ2NvbW1hbmQnLCBbdGFyZ2V0T1MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ3Bvd2Vyc2hlbGwnIDogJ2Jhc2gnXTogJycgfVxuXHRcdFx0XHRcdFx0OiBidWlsZE5ld0hvb2tFbnRyeShuZXdGaWxlRm9ybWF0KTtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kRmllbGRLZXkgPSBpc0NvcGlsb3RDbGlPbmx5XG5cdFx0XHRcdFx0XHQ/ICh0YXJnZXRPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyAncG93ZXJzaGVsbCcgOiAnYmFzaCcpXG5cdFx0XHRcdFx0XHQ6ICdjb21tYW5kJztcblxuXHRcdFx0XHRcdC8vIENyZWF0ZSBuZXcgaG9vayBmaWxlIHdpdGggdGhlIHNlbGVjdGVkIGhvb2sgdHlwZVxuXHRcdFx0XHRcdGNvbnN0IGhvb2tzQ29udGVudDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG5cdFx0XHRcdFx0XHQuLi4oaXNDb3BpbG90Q2xpT25seSA/IHsgdmVyc2lvbjogMSB9IDoge30pLFxuXHRcdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFx0W2hvb2tUeXBlS2V5XTogW1xuXHRcdFx0XHRcdFx0XHRcdG5ld0ZpbGVIb29rRW50cnlcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCBqc29uQ29udGVudCA9IEpTT04uc3RyaW5naWZ5KGhvb2tzQ29udGVudCwgbnVsbCwgJ1xcdCcpO1xuXHRcdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShob29rRmlsZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhqc29uQ29udGVudCkpO1xuXG5cdFx0XHRcdFx0b3B0aW9ucz8ub25Ib29rRmlsZUNyZWF0ZWQ/Lihob29rRmlsZVVyaSk7XG5cblx0XHRcdFx0XHQvLyBGaW5kIHRoZSBzZWxlY3Rpb24gZm9yIHRoZSBuZXcgaG9vaydzIGNvbW1hbmQgZmllbGRcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oanNvbkNvbnRlbnQsIGhvb2tUeXBlS2V5LCAwLCBjb21tYW5kRmllbGRLZXkpO1xuXG5cdFx0XHRcdFx0Ly8gT3BlbiBlZGl0b3Igd2l0aCBzZWxlY3Rpb25cblx0XHRcdFx0XHRpZiAob3B0aW9ucz8ub3BlbkVkaXRvcikge1xuXHRcdFx0XHRcdFx0YXdhaXQgb3B0aW9ucy5vcGVuRWRpdG9yKGhvb2tGaWxlVXJpLCB7IHNlbGVjdGlvbiB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IGhvb2tGaWxlVXJpLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdHBpbm5lZDogZmFsc2Vcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWFuYWdlSG9va3NBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENPTkZJR1VSRV9IT09LU19BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmUtaG9va3MnLCBcIkNvbmZpZ3VyZSBIb29rcy4uLlwiKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignY29uZmlndXJlLWhvb2tzLnNob3J0JywgXCJIb29rc1wiKSxcblx0XHRcdGljb246IENvZGljb24uemFwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBDSEFUX0NPTkZJR19NRU5VX0lELFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIENoYXRWaWV3SWQpKSxcblx0XHRcdFx0b3JkZXI6IDEyLFxuXHRcdFx0XHRncm91cDogJzFfbGV2ZWwnXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKFxuXHRcdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc2hvd0NvbmZpZ3VyZUhvb2tzUXVpY2tQaWNrKGFjY2Vzc29yKTtcblx0fVxufVxuXG4vKipcbiAqIEhlbHBlciB0byByZWdpc3RlciB0aGUgYE1hbmFnZSBIb29rc2AgYWN0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJIb29rQWN0aW9ucygpOiB2b2lkIHtcblx0cmVnaXN0ZXJBY3Rpb24yKE1hbmFnZUhvb2tzQWN0aW9uKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUyxhQUFhLGtCQUFrQjtBQUV4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZSwyQkFBMkI7QUFDbkQsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxhQUFhLFFBQVEsNEJBQTRCO0FBQzFELFNBQVMseUJBQXlCO0FBQ2xDLFNBQTRCLDBCQUEyRTtBQUN2RyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWUsdUJBQWdEO0FBQ3hFLFNBQVMsd0JBQXdCLG1DQUFtQztBQUNwRSxTQUFTLDJCQUEyQixpQ0FBaUM7QUFDckUsU0FBUyxxQkFBcUIsa0JBQWtCLHlCQUF5QjtBQUN6RSxTQUFTLHVCQUF1Qiw2QkFBNkI7QUFDN0QsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywwQkFBMEIsdUJBQXVCLHlCQUFzQztBQUNoRyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCLFVBQVU7QUFLcEMsTUFBTSw0QkFBNEI7QUFxQmxDLFNBQVMscUJBQXFCLFVBQTRDO0FBQ3pFLGFBQVcsT0FBTyxPQUFPLEtBQUssUUFBUSxHQUFHO0FBRXhDLFFBQUksMEJBQTBCLEdBQUcsTUFBTSxRQUFXO0FBQ2pELGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUtBLFNBQVMsbUJBQW1CLFlBQXNCLCtCQUFnRDtBQUNqRyxNQUFJLCtCQUErQjtBQUNsQyxVQUFNLGlCQUFpQiwwQkFBMEIsVUFBVTtBQUMzRCxRQUFJLGdCQUFnQjtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFLQSxlQUFlLGNBQ2QsYUFDQSxZQUNBLGFBQ0EsZUFDQSxxQkFDQSxpQkFDQSxvQkFDZ0I7QUFFaEIsTUFBSTtBQUNKLFFBQU0sYUFBYSxNQUFNLFlBQVksT0FBTyxXQUFXO0FBRXZELE1BQUksWUFBWTtBQUNmLFVBQU0sa0JBQWtCLE1BQU0sWUFBWSxTQUFTLFdBQVc7QUFDOUQsUUFBSTtBQUNILHFCQUFlLFdBQVcsZ0JBQWdCLE1BQU0sU0FBUyxDQUFDO0FBRTFELFVBQUksQ0FBQyxhQUFhLE9BQU87QUFDeEIscUJBQWEsUUFBUSxDQUFDO0FBQUEsTUFDdkI7QUFBQSxJQUNELFFBQVE7QUFFUCwwQkFBb0IsTUFBTSxTQUFTLGdDQUFnQyx1RkFBdUYsQ0FBQztBQUMzSixZQUFNLGNBQWMsV0FBVyxFQUFFLFVBQVUsWUFBWSxDQUFDO0FBQ3hEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsT0FBTztBQUVOLG1CQUFlLEVBQUUsT0FBTyxDQUFDLEVBQUU7QUFBQSxFQUM1QjtBQUdBLFFBQU0sZUFBZSxvQkFBb0IsV0FBVztBQUNwRCxRQUFNLFdBQVcsaUJBQWlCLGlCQUFpQjtBQUduRCxRQUFNLGdDQUFnQyxDQUFDLFlBQVkscUJBQXFCLGFBQWEsS0FBSztBQUMxRixRQUFNLGtCQUFrQixXQUNwQixzQkFBc0IsVUFBVSxLQUFLLGFBQ3RDLG1CQUFtQixZQUFZLDZCQUE2QjtBQUkvRCxNQUFJO0FBQ0osYUFBVyxPQUFPLE9BQU8sS0FBSyxhQUFhLEtBQUssR0FBRztBQUNsRCxVQUFNLGVBQWUsV0FDbEIsc0JBQXNCLEdBQUcsSUFDekIsMEJBQTBCLEdBQUc7QUFDaEMsUUFBSSxpQkFBaUIsY0FBYyxRQUFRLFlBQVk7QUFDdEQsMkJBQXFCO0FBQ3JCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFHQSxRQUFNLFdBQVcsc0JBQXNCO0FBR3ZDLFFBQU0sZUFBZSxrQkFBa0IsWUFBWTtBQUNuRCxRQUFNLGdCQUFnQixhQUFhLE1BQU0sUUFBUTtBQUNqRCxRQUFNLGVBQWUsTUFBTSxRQUFRLGFBQWEsSUFBSSxjQUFjLFNBQVM7QUFHM0UsTUFBSTtBQUNKLE1BQUksWUFBWTtBQUVmLFVBQU0sZ0JBQWdCLE1BQU0sWUFBWSxTQUFTLFdBQVcsR0FBRyxNQUFNLFNBQVM7QUFDOUUsVUFBTSxjQUFjLGFBQWEsU0FBUyxNQUFNLElBQUksU0FBUztBQUM3RCxVQUFNLG9CQUF1QyxFQUFFLFNBQVMsR0FBRyxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQ2pHLFVBQU0sUUFBUSxZQUFZLGNBQWMsQ0FBQyxTQUFTLFVBQVUsWUFBWSxHQUFHLGNBQWMsaUJBQWlCO0FBQzFHLGtCQUFjLFdBQVcsY0FBYyxLQUFLO0FBQUEsRUFDN0MsT0FBTztBQUVOLFVBQU0sYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDLFFBQVEsR0FBRyxDQUFDLFlBQVksRUFBRSxFQUFFO0FBQzNELGtCQUFjLEtBQUssVUFBVSxZQUFZLE1BQU0sR0FBSTtBQUFBLEVBQ3BEO0FBR0EsUUFBTSxpQkFBaUIsY0FBYyxRQUFRLEtBQUssT0FBSyxRQUFRLEVBQUUsVUFBVSxXQUFXLENBQUM7QUFFdkYsTUFBSSxnQkFBZ0I7QUFFbkIsVUFBTSxjQUFjLFdBQVc7QUFBQSxNQUM5QixVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsUUFDUixRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUdELFVBQU0sU0FBUyxjQUFjLGNBQWMsdUJBQXVCO0FBQ2xFLFFBQUksVUFBVSxPQUFPLFNBQVMsS0FBSyxRQUFRLE9BQU8sU0FBUyxFQUFFLEtBQUssV0FBVyxHQUFHO0FBQy9FLFlBQU0sUUFBUSxPQUFPLFNBQVM7QUFFOUIsWUFBTSxtQkFBbUIsQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUM3QixPQUFPLE1BQU0sa0JBQWtCO0FBQUEsUUFDL0IsTUFBTTtBQUFBLE1BQ1AsQ0FBQyxHQUFHLE1BQU0sSUFBSTtBQUdkLFlBQU0sWUFBWSx5QkFBeUIsYUFBYSxVQUFVLGNBQWMsU0FBUztBQUN6RixVQUFJLGFBQWEsVUFBVSxrQkFBa0IsVUFBYSxVQUFVLGNBQWMsUUFBVztBQUM1RixlQUFPLGFBQWE7QUFBQSxVQUNuQixpQkFBaUIsVUFBVTtBQUFBLFVBQzNCLGFBQWEsVUFBVTtBQUFBLFVBQ3ZCLGVBQWUsVUFBVTtBQUFBLFVBQ3pCLFdBQVcsVUFBVTtBQUFBLFFBQ3RCLENBQUM7QUFDRCxlQUFPLG1CQUFtQixVQUFVLGVBQWU7QUFBQSxNQUNwRDtBQUFBLElBQ0QsT0FBTztBQUVOLFlBQU0sZ0JBQWdCLE1BQU07QUFBQSxRQUMzQixJQUFJLGlCQUFpQixhQUFhLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLE9BQU8sa0JBQWtCLENBQUMsR0FBRyxNQUFNLFlBQVksQ0FBQztBQUFBLE1BQzVHLEdBQUcsRUFBRSxPQUFPLFNBQVMsV0FBVyxVQUFVLEVBQUUsQ0FBQztBQUc3QyxZQUFNLFlBQVkseUJBQXlCLGFBQWEsVUFBVSxjQUFjLFNBQVM7QUFHekYsWUFBTSxjQUFjLFdBQVc7QUFBQSxRQUM5QixVQUFVO0FBQUEsUUFDVixTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0EsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxPQUFPO0FBRU4sUUFBSSxDQUFDLFlBQVk7QUFFaEIsWUFBTSxZQUFZLFVBQVUsYUFBYSxTQUFTLFdBQVcsV0FBVyxDQUFDO0FBQUEsSUFDMUUsT0FBTztBQUVOLFlBQU0sY0FBYyxXQUFXO0FBQUEsUUFDOUIsVUFBVTtBQUFBLFFBQ1YsU0FBUyxFQUFFLFFBQVEsTUFBTTtBQUFBLE1BQzFCLENBQUM7QUFHRCxZQUFNLGdCQUFnQixNQUFNO0FBQUEsUUFDM0IsSUFBSSxpQkFBaUIsYUFBYSxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxPQUFPLGtCQUFrQixDQUFDLEdBQUcsTUFBTSxZQUFZLENBQUM7QUFBQSxNQUM1RyxHQUFHLEVBQUUsT0FBTyxTQUFTLFdBQVcsVUFBVSxFQUFFLENBQUM7QUFBQSxJQUM5QztBQUdBLFVBQU0sWUFBWSx5QkFBeUIsYUFBYSxVQUFVLGNBQWMsU0FBUztBQUd6RixRQUFJLG9CQUFvQjtBQUN2QixZQUFNLG1CQUFtQixhQUFhLEVBQUUsVUFBVSxDQUFDO0FBQUEsSUFDcEQsT0FBTztBQUNOLFlBQU0sY0FBYyxXQUFXO0FBQUEsUUFDOUIsVUFBVTtBQUFBLFFBQ1YsU0FBUztBQUFBLFVBQ1I7QUFBQSxVQUNBLFFBQVE7QUFBQSxRQUNUO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDRDtBQU1BLFNBQVMsVUFDUixRQUNBLFlBQ2tDO0FBQ2xDLFNBQU8sSUFBSSxRQUFnQyxhQUFXO0FBQ3JELFFBQUksV0FBVztBQUNmLFVBQU0sT0FBTyxDQUFDLFVBQWtDO0FBQy9DLFVBQUksQ0FBQyxVQUFVO0FBQ2QsbUJBQVc7QUFDWCxvQkFBWSxRQUFRO0FBQ3BCLGdCQUFRLEtBQUs7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxnQkFBWSxJQUFJLE9BQU8sWUFBWSxNQUFNO0FBQ3hDLFdBQUssT0FBTyxZQUFZLENBQUMsQ0FBa0I7QUFBQSxJQUM1QyxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLE9BQU8sbUJBQW1CLFlBQVU7QUFDbkQsVUFBSSxXQUFXLFlBQVk7QUFDMUIsYUFBSyxNQUFNO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxPQUFPLFVBQVUsTUFBTTtBQUN0QyxXQUFLLE1BQVM7QUFBQSxJQUNmLENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNGO0FBRUEsSUFBVyxPQUFYLGtCQUFXQSxVQUFYO0FBQ0MsRUFBQUEsWUFBQSxvQkFBaUIsS0FBakI7QUFDQSxFQUFBQSxZQUFBLGdCQUFhLEtBQWI7QUFDQSxFQUFBQSxZQUFBLGdCQUFhLEtBQWI7QUFDQSxFQUFBQSxZQUFBLGtCQUFlLEtBQWY7QUFDQSxFQUFBQSxZQUFBLG1CQUFnQixLQUFoQjtBQUxVLFNBQUFBO0FBQUEsR0FBQTtBQTBCWCxlQUFzQiw0QkFDckIsVUFDQSxTQUNnQjtBQUNoQixRQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxRQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBQ3pELFFBQU0sY0FBYyxTQUFTLElBQUksWUFBWTtBQUM3QyxRQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsUUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsUUFBTSxtQkFBbUIsU0FBUyxJQUFJLHdCQUF3QjtBQUM5RCxRQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsUUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxRQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBQ3JELFFBQU0scUJBQXFCLFNBQVMsSUFBSSxtQkFBbUI7QUFHM0QsUUFBTSxZQUFZLE1BQU0sbUJBQW1CLGVBQWU7QUFDMUQsUUFBTSxXQUFXLFdBQVcsTUFBTTtBQUdsQyxRQUFNLGtCQUFrQixpQkFBaUIsYUFBYSxFQUFFLFFBQVEsQ0FBQztBQUNqRSxRQUFNLG1CQUFtQixpQkFBaUI7QUFDMUMsUUFBTSxjQUFjLE1BQU0sWUFBWSxTQUFTO0FBQy9DLFFBQU0sV0FBVyxZQUFZLFVBQVUsWUFBWTtBQUduRCxRQUFNLGNBQWMsTUFBTTtBQUFBLElBQ3pCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLGtCQUFrQjtBQUFBLElBQ2xCLEVBQUUsbUJBQW1CLEtBQUs7QUFBQSxFQUMzQjtBQUdBLFFBQU0sa0JBQWtCLG9CQUFJLElBQXNCO0FBQ2xELGFBQVcsU0FBUyxhQUFhO0FBQ2hDLG9CQUFnQixJQUFJLE1BQU0sV0FBVyxnQkFBZ0IsSUFBSSxNQUFNLFFBQVEsS0FBSyxLQUFLLENBQUM7QUFBQSxFQUNuRjtBQUdBLFFBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxRQUFNLFNBQVMsTUFBTSxJQUFJLGtCQUFrQixnQkFBZ0MsRUFBRSxlQUFlLEtBQUssQ0FBQyxDQUFDO0FBQ25HLFFBQU0sYUFBYSxrQkFBa0I7QUFDckMsU0FBTyxLQUFLO0FBRVosTUFBSSxPQUFPO0FBQ1gsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUlKLFFBQU0sY0FBc0IsQ0FBQztBQUM3QixRQUFNLFNBQVMsTUFBd0IsWUFBWSxJQUFJO0FBRXZELE1BQUk7QUFDSCxXQUFPLE1BQU07QUFDWixjQUFRLE1BQU07QUFBQSxRQUNiLEtBQUssd0JBQXFCO0FBRXpCLGdCQUFNLFdBQVcsQ0FBQyxDQUFDLFVBQVUsSUFBSSxNQUF5RDtBQUN6RixrQkFBTSxRQUFRLGdCQUFnQixJQUFJLFFBQVEsS0FBSztBQUMvQyxrQkFBTSxhQUFhLFFBQVEsSUFBSSxLQUFLLEtBQUssTUFBTTtBQUMvQyxtQkFBTztBQUFBLGNBQ04sT0FBTyxHQUFHLEtBQUssS0FBSyxHQUFHLFVBQVU7QUFBQSxjQUNqQyxhQUFhLEtBQUs7QUFBQSxjQUNsQjtBQUFBLGNBQ0EsY0FBYztBQUFBLFlBQ2Y7QUFBQSxVQUNEO0FBRUEsY0FBSTtBQUVKLGNBQUksU0FBUyxRQUFRO0FBRXBCLGtCQUFNLGtCQUFrQixJQUFJLElBQUksT0FBTyxPQUFPLGdCQUFnQixRQUFRLE1BQU0sQ0FBQyxDQUFDO0FBQzlFLDBCQUFlLE9BQU8sUUFBUSxhQUFhLEVBQ3pDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsTUFBTSxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsRUFDcEQsSUFBSSxRQUFRO0FBQUEsVUFDZixPQUFPO0FBRU4sa0JBQU0sY0FBYyxJQUFJLElBQUksT0FBTyxPQUFPLGdCQUFnQixPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQ3pFLGtCQUFNLGVBQWUsSUFBSSxJQUFJLE9BQU8sT0FBTyxnQkFBZ0IsT0FBTyxhQUFhLENBQUMsQ0FBQztBQUNqRixrQkFBTSxhQUFhLE9BQU8sUUFBUSxhQUFhO0FBRS9DLGtCQUFNLFNBQVMsV0FBVyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sWUFBWSxJQUFJLENBQUMsS0FBSyxhQUFhLElBQUksQ0FBQyxDQUFDO0FBQ25GLGtCQUFNLGFBQWEsV0FBVyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sWUFBWSxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsSUFBSSxDQUFDLENBQUM7QUFDeEYsa0JBQU0sY0FBYyxXQUFXLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksSUFBSSxDQUFDLEtBQUssYUFBYSxJQUFJLENBQUMsQ0FBQztBQUV6RiwwQkFBYyxDQUFDO0FBQ2YsZ0JBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsMEJBQVksS0FBSyxFQUFFLE1BQU0sYUFBYSxPQUFPLFNBQVMsdUJBQXVCLHNCQUFzQixFQUFFLENBQUM7QUFDdEcsMEJBQVksS0FBSyxHQUFHLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFBQSxZQUN6QztBQUNBLGdCQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLDBCQUFZLEtBQUssRUFBRSxNQUFNLGFBQWEsT0FBTyxTQUFTLDBCQUEwQixjQUFjLEVBQUUsQ0FBQztBQUNqRywwQkFBWSxLQUFLLEdBQUcsV0FBVyxJQUFJLFFBQVEsQ0FBQztBQUFBLFlBQzdDO0FBQ0EsZ0JBQUksWUFBWSxTQUFTLEdBQUc7QUFDM0IsMEJBQVksS0FBSyxFQUFFLE1BQU0sYUFBYSxPQUFPLFNBQVMsOEJBQThCLGdCQUFnQixFQUFFLENBQUM7QUFDdkcsMEJBQVksS0FBSyxHQUFHLFlBQVksSUFBSSxRQUFRLENBQUM7QUFBQSxZQUM5QztBQUFBLFVBQ0Q7QUFFQSxpQkFBTyxRQUFRO0FBQ2YsaUJBQU8sUUFBUTtBQUNmLGlCQUFPLGNBQWMsU0FBUywwQ0FBMEMsMEJBQTBCO0FBQ2xHLGlCQUFPLFFBQVEsU0FBUyx3QkFBd0IsT0FBTztBQUN2RCxpQkFBTyxVQUFVLENBQUM7QUFFbEIsZ0JBQU0sU0FBUyxNQUFNLFVBQWtDLFFBQVEsVUFBVTtBQUV6RSxjQUFJLENBQUMsVUFBVSxXQUFXLFFBQVE7QUFDakM7QUFBQSxVQUNEO0FBRUEsNkJBQW1CO0FBQ25CLHNCQUFZLEtBQUssc0JBQW1CO0FBQ3BDLGlCQUFPO0FBQ1A7QUFBQSxRQUNEO0FBQUEsUUFFQSxLQUFLLG9CQUFpQjtBQUVyQixnQkFBTSxjQUFjLFlBQVksT0FBTyxPQUFLLEVBQUUsYUFBYSxpQkFBa0IsUUFBUTtBQUdyRixnQkFBTSxZQUFZLFlBQVksT0FBTyxPQUFLLENBQUMsRUFBRSxTQUFTO0FBQ3RELGdCQUFNLGFBQWEsWUFBWSxPQUFPLE9BQUssRUFBRSxTQUFTO0FBR3RELGdCQUFNLFlBQTBELENBQUM7QUFHakUsb0JBQVUsS0FBSztBQUFBLFlBQ2QsT0FBTyxXQUFXLFNBQVMsNkJBQTZCLGlCQUFpQixDQUFDO0FBQUEsWUFDMUUsY0FBYztBQUFBLFlBQ2QsWUFBWTtBQUFBLFVBQ2IsQ0FBQztBQUdELGNBQUksVUFBVSxTQUFTLEdBQUc7QUFDekIsc0JBQVUsS0FBSztBQUFBLGNBQ2QsTUFBTTtBQUFBLGNBQ04sT0FBTyxTQUFTLGlCQUFpQixnQkFBZ0I7QUFBQSxZQUNsRCxDQUFDO0FBRUQsdUJBQVcsU0FBUyxXQUFXO0FBQzlCLG9CQUFNLGNBQWMsYUFBYSxZQUFZLE1BQU0sU0FBUyxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBQzlFLHdCQUFVLEtBQUs7QUFBQSxnQkFDZCxPQUFPLE1BQU07QUFBQSxnQkFDYjtBQUFBLGdCQUNBLFdBQVc7QUFBQSxjQUNaLENBQUM7QUFBQSxZQUNGO0FBQUEsVUFDRDtBQUdBLGNBQUksV0FBVyxTQUFTLEdBQUc7QUFDMUIsa0JBQU0sYUFBYSxDQUFDLEdBQUcsSUFBSSxJQUFJLFdBQVcsSUFBSSxPQUFLLEVBQUUsU0FBVSxDQUFDLENBQUM7QUFDakUsdUJBQVcsYUFBYSxZQUFZO0FBQ25DLHdCQUFVLEtBQUs7QUFBQSxnQkFDZCxNQUFNO0FBQUEsZ0JBQ04sT0FBTyxTQUFTLGNBQWMsY0FBYyxTQUFTO0FBQUEsY0FDdEQsQ0FBQztBQUVELHlCQUFXLFNBQVMsV0FBVyxPQUFPLE9BQUssRUFBRSxjQUFjLFNBQVMsR0FBRztBQUN0RSxzQkFBTSxjQUFjLGFBQWEsWUFBWSxNQUFNLFNBQVMsRUFBRSxVQUFVLEtBQUssQ0FBQztBQUM5RSwwQkFBVSxLQUFLO0FBQUEsa0JBQ2QsT0FBTyxNQUFNO0FBQUEsa0JBQ2I7QUFBQSxrQkFDQSxXQUFXO0FBQUEsZ0JBQ1osQ0FBQztBQUFBLGNBQ0Y7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUdBLGNBQUksWUFBWSxXQUFXLEdBQUc7QUFDN0IsMkJBQWUsVUFBVSxDQUFDO0FBQUEsVUFDM0IsT0FBTztBQUNOLG1CQUFPLFFBQVE7QUFDZixtQkFBTyxRQUFRO0FBQ2YsbUJBQU8sY0FBYyxTQUFTLHlDQUF5Qyx3Q0FBd0M7QUFDL0csbUJBQU8sUUFBUSxpQkFBa0IsYUFBYTtBQUM5QyxtQkFBTyxVQUFVLENBQUMsVUFBVTtBQUU1QixrQkFBTSxTQUFTLE1BQU0sVUFBOEIsUUFBUSxVQUFVO0FBRXJFLGdCQUFJLFdBQVcsUUFBUTtBQUN0QixxQkFBTyxPQUFPLEtBQUs7QUFDbkI7QUFBQSxZQUNEO0FBQ0EsZ0JBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxZQUNEO0FBQ0EsMkJBQWU7QUFDZix3QkFBWSxLQUFLLGtCQUFlO0FBQUEsVUFDakM7QUFHQSxjQUFJLGFBQWEsV0FBVztBQUMzQixrQkFBTSxRQUFRLGFBQWE7QUFDM0IsZ0JBQUk7QUFFSixnQkFBSSxNQUFNLFdBQVc7QUFFcEIsa0JBQUk7QUFDSCxzQkFBTSxVQUFVLE1BQU0sWUFBWSxTQUFTLE1BQU0sT0FBTztBQUN4RCxzQkFBTSxjQUFjLHVCQUF1QixNQUFNLFNBQVMsUUFBUTtBQUNsRSxvQkFBSSxhQUFhO0FBQ2hCLDhCQUFZLHNCQUFzQixRQUFRLE1BQU0sU0FBUyxHQUFHLFdBQVc7QUFBQSxnQkFDeEU7QUFBQSxjQUNELFFBQVE7QUFBQSxjQUVSO0FBQUEsWUFDRCxPQUFPO0FBRU4sb0JBQU0sbUJBQW1CLDRCQUE0QixNQUFNLFNBQVMsUUFBUTtBQUU1RSxrQkFBSSxrQkFBa0I7QUFDckIsb0JBQUk7QUFDSCx3QkFBTSxVQUFVLE1BQU0sWUFBWSxTQUFTLE1BQU0sT0FBTztBQUN4RCw4QkFBWTtBQUFBLG9CQUNYLFFBQVEsTUFBTSxTQUFTO0FBQUEsb0JBQ3ZCLE1BQU07QUFBQSxvQkFDTixNQUFNO0FBQUEsb0JBQ047QUFBQSxrQkFDRDtBQUFBLGdCQUNELFFBQVE7QUFBQSxnQkFFUjtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBRUEsZ0JBQUksU0FBUyxZQUFZO0FBQ3hCLG9CQUFNLFFBQVEsV0FBVyxNQUFNLFNBQVMsRUFBRSxVQUFVLENBQUM7QUFBQSxZQUN0RCxPQUFPO0FBQ04sb0JBQU0sY0FBYyxXQUFXO0FBQUEsZ0JBQzlCLFVBQVUsTUFBTTtBQUFBLGdCQUNoQixTQUFTO0FBQUEsa0JBQ1I7QUFBQSxrQkFDQSxRQUFRO0FBQUEsZ0JBQ1Q7QUFBQSxjQUNELENBQUM7QUFBQSxZQUNGO0FBQ0E7QUFBQSxVQUNEO0FBR0EsaUJBQU87QUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUVBLEtBQUssb0JBQWlCO0FBR3JCLGdCQUFNLFlBQVksTUFBTSxlQUFlLDBCQUEwQixZQUFZLE1BQU0sZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBRS9ILGdCQUFNLFlBQThELENBQUM7QUFHckUsb0JBQVUsS0FBSztBQUFBLFlBQ2QsT0FBTyxlQUFlLFNBQVMsb0NBQW9DLGdDQUFnQyxDQUFDO0FBQUEsWUFDcEcsaUJBQWlCO0FBQUEsWUFDakIsWUFBWTtBQUFBLFVBQ2IsQ0FBQztBQUdELGNBQUksVUFBVSxTQUFTLEdBQUc7QUFDekIsc0JBQVUsS0FBSztBQUFBLGNBQ2QsTUFBTTtBQUFBLGNBQ04sT0FBTyxTQUFTLHFCQUFxQixxQkFBcUI7QUFBQSxZQUMzRCxDQUFDO0FBRUQsdUJBQVcsWUFBWSxXQUFXO0FBQ2pDLG9CQUFNLGVBQWUsYUFBYSxZQUFZLFNBQVMsS0FBSyxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBQzlFLHdCQUFVLEtBQUs7QUFBQSxnQkFDZCxPQUFPO0FBQUEsZ0JBQ1AsU0FBUyxTQUFTO0FBQUEsY0FDbkIsQ0FBQztBQUFBLFlBQ0Y7QUFBQSxVQUNEO0FBR0EsY0FBSSxVQUFVLFdBQVcsR0FBRztBQUMzQiwyQkFBZSxVQUFVLENBQUM7QUFBQSxVQUMzQixPQUFPO0FBQ04sbUJBQU8sUUFBUTtBQUNmLG1CQUFPLFFBQVE7QUFDZixtQkFBTyxjQUFjLFNBQVMseUNBQXlDLHdDQUF3QztBQUMvRyxtQkFBTyxRQUFRLFNBQVMsZ0NBQWdDLFVBQVU7QUFDbEUsbUJBQU8sVUFBVSxDQUFDLFVBQVU7QUFFNUIsa0JBQU0sU0FBUyxNQUFNLFVBQWtDLFFBQVEsVUFBVTtBQUV6RSxnQkFBSSxXQUFXLFFBQVE7QUFDdEIscUJBQU8sT0FBTyxLQUFLO0FBQ25CO0FBQUEsWUFDRDtBQUNBLGdCQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsWUFDRDtBQUNBLDJCQUFlO0FBQ2Ysd0JBQVksS0FBSyxrQkFBZTtBQUFBLFVBQ2pDO0FBR0EsY0FBSSxhQUFhLFNBQVM7QUFDekIsa0JBQU07QUFBQSxjQUNMLGFBQWE7QUFBQSxjQUNiLGlCQUFrQjtBQUFBLGNBQ2xCO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQSxTQUFTO0FBQUEsWUFDVjtBQUNBO0FBQUEsVUFDRDtBQUdBLGlCQUFPO0FBQ1A7QUFBQSxRQUNEO0FBQUEsUUFFQSxLQUFLLHNCQUFtQjtBQUd2QixnQkFBTSxhQUFhLE1BQU0sZUFBZSxpQkFBaUIsWUFBWSxJQUFJO0FBRXpFLGNBQUksV0FBVyxXQUFXLEdBQUc7QUFDNUIsZ0NBQW9CLE1BQU0sU0FBUyxnQ0FBZ0Msb0RBQW9ELENBQUM7QUFDeEg7QUFBQSxVQUNEO0FBR0EsMkJBQWlCLFdBQVcsQ0FBQztBQUM3QixjQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLGtCQUFNLGNBQWMsV0FBVyxJQUFJLENBQUMsUUFBUSxVQUFVO0FBQ3JELG9CQUFNLFdBQVcsYUFBYSxZQUFZLE9BQU8sS0FBSyxFQUFFLFVBQVUsT0FBTyxZQUFZLGVBQWUsTUFBTSxDQUFDO0FBQzNHLG9CQUFNLFFBQVEsVUFBVSxJQUFJLFNBQVMsK0JBQStCLGlCQUFpQixRQUFRLElBQUk7QUFDakcscUJBQU87QUFBQSxnQkFDTjtBQUFBLGdCQUNBLGFBQWEsT0FBTyxTQUFTLHFCQUFxQixPQUFPLE1BQU0sSUFBSTtBQUFBLGdCQUNuRTtBQUFBLGNBQ0Q7QUFBQSxZQUNELENBQUM7QUFFRCxtQkFBTyxRQUFRO0FBQ2YsbUJBQU8sUUFBUTtBQUNmLG1CQUFPLGNBQWMsU0FBUywwQ0FBMEMscUNBQXFDO0FBQzdHLG1CQUFPLFFBQVEsU0FBUyxvQ0FBb0Msb0JBQW9CO0FBQ2hGLG1CQUFPLFVBQVUsQ0FBQyxVQUFVO0FBRTVCLGtCQUFNLFNBQVMsTUFBTSxVQUFpQyxRQUFRLFVBQVU7QUFFeEUsZ0JBQUksV0FBVyxRQUFRO0FBQ3RCLHFCQUFPLE9BQU8sS0FBSztBQUNuQjtBQUFBLFlBQ0Q7QUFDQSxnQkFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLFlBQ0Q7QUFDQSw2QkFBaUIsT0FBTztBQUN4Qix3QkFBWSxLQUFLLG9CQUFpQjtBQUFBLFVBQ25DO0FBRUEsaUJBQU87QUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUVBLEtBQUssdUJBQW9CO0FBRXhCLGlCQUFPLEtBQUs7QUFFWixnQkFBTSxpQkFBaUIsTUFBTSxJQUFJLFFBQXFDLGFBQVc7QUFDaEYsZ0JBQUksV0FBVztBQUNmLGtCQUFNLE9BQU8sQ0FBQyxVQUF1QztBQUNwRCxrQkFBSSxDQUFDLFVBQVU7QUFDZCwyQkFBVztBQUNYLGlDQUFpQixRQUFRO0FBQ3pCLHdCQUFRLEtBQUs7QUFBQSxjQUNkO0FBQUEsWUFDRDtBQUNBLGtCQUFNLG1CQUFtQixJQUFJLGdCQUFnQjtBQUM3QyxrQkFBTSxXQUFXLGlCQUFpQixJQUFJLGtCQUFrQixlQUFlLENBQUM7QUFDeEUscUJBQVMsU0FBUyxTQUFTLGlDQUFpQyxzQkFBc0I7QUFDbEYscUJBQVMsY0FBYyxTQUFTLHNDQUFzQyxvQ0FBb0M7QUFDMUcscUJBQVMsUUFBUSxTQUFTLGdDQUFnQyxnQkFBZ0I7QUFDMUUscUJBQVMsVUFBVSxDQUFDLFVBQVU7QUFDOUIscUJBQVMsaUJBQWlCO0FBRTFCLDZCQUFpQixJQUFJLFNBQVMsWUFBWSxZQUFZO0FBQ3JELG9CQUFNLFFBQVEsU0FBUztBQUN2QixrQkFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssR0FBRztBQUM1Qix5QkFBUyxvQkFBb0IsU0FBUyxtQ0FBbUMsdUJBQXVCO0FBQ2hHO0FBQUEsY0FDRDtBQUNBLG9CQUFNLE9BQU8sTUFBTSxLQUFLO0FBQ3hCLGtCQUFJLGVBQWUsS0FBSyxJQUFJLEdBQUc7QUFDOUIseUJBQVMsb0JBQW9CLFNBQVMsdUNBQXVDLHVDQUF1QztBQUNwSDtBQUFBLGNBQ0Q7QUFDQSxtQkFBSyxJQUFJO0FBQUEsWUFDVixDQUFDLENBQUM7QUFDRiw2QkFBaUIsSUFBSSxTQUFTLGlCQUFpQixNQUFNO0FBQ3BELHVCQUFTLG9CQUFvQjtBQUFBLFlBQzlCLENBQUMsQ0FBQztBQUNGLDZCQUFpQixJQUFJLFNBQVMsbUJBQW1CLFlBQVU7QUFDMUQsa0JBQUksV0FBVyxZQUFZO0FBQzFCLHFCQUFLLE1BQU07QUFBQSxjQUNaO0FBQUEsWUFDRCxDQUFDLENBQUM7QUFDRiw2QkFBaUIsSUFBSSxTQUFTLFVBQVUsTUFBTTtBQUM3QyxtQkFBSyxNQUFTO0FBQUEsWUFDZixDQUFDLENBQUM7QUFDRixxQkFBUyxLQUFLO0FBQUEsVUFDZixDQUFDO0FBRUQsY0FBSSxtQkFBbUIsUUFBUTtBQUU5QixtQkFBTyxLQUFLO0FBQ1osbUJBQU8sT0FBTyxLQUFLO0FBQ25CO0FBQUEsVUFDRDtBQUNBLGNBQUksQ0FBQyxnQkFBZ0I7QUFDcEI7QUFBQSxVQUNEO0FBR0EsZ0JBQU0sWUFBWSxhQUFhLGVBQWdCLEdBQUc7QUFHbEQsZ0JBQU0sZUFBZSxlQUFlLFNBQVMsT0FBTyxJQUFJLGlCQUFpQixHQUFHLGNBQWM7QUFDMUYsZ0JBQU0sY0FBYyxJQUFJLFNBQVMsZUFBZ0IsS0FBSyxZQUFZO0FBR2xFLGNBQUksTUFBTSxZQUFZLE9BQU8sV0FBVyxHQUFHO0FBRTFDLGtCQUFNO0FBQUEsY0FDTDtBQUFBLGNBQ0EsaUJBQWtCO0FBQUEsY0FDbEI7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBLFNBQVM7QUFBQSxZQUNWO0FBQ0E7QUFBQSxVQUNEO0FBR0EsZ0JBQU0sZ0JBQWdCLG9CQUFvQixXQUFXO0FBQ3JELGdCQUFNLGtCQUFrQixrQkFBa0IsaUJBQWlCO0FBQzNELGdCQUFNLG1CQUFtQixDQUFDLG1CQUN0QixDQUFDLElBQUksSUFBSSxPQUFPLE9BQU8sZ0JBQWdCLE9BQU8sTUFBTSxDQUFDLENBQUMsRUFBRSxJQUFJLGlCQUFrQixRQUFRLEtBQ3RGLElBQUksSUFBSSxPQUFPLE9BQU8sZ0JBQWdCLE9BQU8sYUFBYSxDQUFDLENBQUMsRUFBRSxJQUFJLGlCQUFrQixRQUFRO0FBQ2hHLGdCQUFNLGNBQWMsa0JBQ2hCLHNCQUFzQixpQkFBa0IsUUFBUSxLQUFLLGlCQUFrQixXQUN4RSxtQkFDRSwwQkFBMEIsaUJBQWtCLFFBQVEsS0FBSyxpQkFBa0IsV0FDNUUsaUJBQWtCO0FBQ3RCLGdCQUFNLG1CQUFtQixtQkFDdEIsRUFBRSxNQUFNLFdBQVcsQ0FBQyxhQUFhLGdCQUFnQixVQUFVLGVBQWUsTUFBTSxHQUFHLEdBQUcsSUFDdEYsa0JBQWtCLGFBQWE7QUFDbEMsZ0JBQU0sa0JBQWtCLG1CQUNwQixhQUFhLGdCQUFnQixVQUFVLGVBQWUsU0FDdkQ7QUFHSCxnQkFBTSxlQUF3QztBQUFBLFlBQzdDLEdBQUksbUJBQW1CLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQztBQUFBLFlBQ3pDLE9BQU87QUFBQSxjQUNOLENBQUMsV0FBVyxHQUFHO0FBQUEsZ0JBQ2Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxjQUFjLEtBQUssVUFBVSxjQUFjLE1BQU0sR0FBSTtBQUMzRCxnQkFBTSxZQUFZLFVBQVUsYUFBYSxTQUFTLFdBQVcsV0FBVyxDQUFDO0FBRXpFLG1CQUFTLG9CQUFvQixXQUFXO0FBR3hDLGdCQUFNLFlBQVkseUJBQXlCLGFBQWEsYUFBYSxHQUFHLGVBQWU7QUFHdkYsY0FBSSxTQUFTLFlBQVk7QUFDeEIsa0JBQU0sUUFBUSxXQUFXLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFBQSxVQUNwRCxPQUFPO0FBQ04sa0JBQU0sY0FBYyxXQUFXO0FBQUEsY0FDOUIsVUFBVTtBQUFBLGNBQ1YsU0FBUztBQUFBLGdCQUNSO0FBQUEsZ0JBQ0EsUUFBUTtBQUFBLGNBQ1Q7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELFVBQUU7QUFDRCxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFFQSxNQUFNLDBCQUEwQixRQUFRO0FBQUEsRUFDdkMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxtQkFBbUIsb0JBQW9CO0FBQUEsTUFDeEQsWUFBWSxVQUFVLHlCQUF5QixPQUFPO0FBQUEsTUFDdEQsTUFBTSxRQUFRO0FBQUEsTUFDZCxJQUFJO0FBQUEsTUFDSixjQUFjLGdCQUFnQjtBQUFBLE1BQzlCLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixTQUFTLGVBQWUsT0FBTyxRQUFRLFVBQVUsQ0FBQztBQUFBLFFBQzNGLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBc0IsSUFDckIsVUFDZ0I7QUFDaEIsV0FBTyw0QkFBNEIsUUFBUTtBQUFBLEVBQzVDO0FBQ0Q7QUFLTyxTQUFTLHNCQUE0QjtBQUMzQyxrQkFBZ0IsaUJBQWlCO0FBQ2xDOyIsCiAgIm5hbWVzIjogWyJTdGVwIl0KfQo=
