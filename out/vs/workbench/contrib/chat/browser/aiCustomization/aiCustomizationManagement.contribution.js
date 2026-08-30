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
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { applyEdits, removeProperty } from "../../../../../base/common/jsonEdit.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { isMacintosh, isWindows } from "../../../../../base/common/platform.js";
import { basename, dirname, isEqualOrParent } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Categories } from "../../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { EditorPaneDescriptor } from "../../../../browser/editor.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../common/contributions.js";
import { EditorExtensions } from "../../../../common/editor.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IWorkbenchExtensionManagementService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { AICustomizationSources, IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { IPromptsService } from "../../common/promptSyntax/service/promptsService.js";
import { CHAT_CATEGORY } from "../actions/chatActions.js";
import { IChatWidgetService } from "../chat.js";
import { AgentPluginItemKind } from "../agentPluginEditor/agentPluginItems.js";
import {
  AI_CUSTOMIZATION_ITEM_DISABLED_KEY,
  AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY,
  AI_CUSTOMIZATION_ITEM_STORAGE_KEY,
  AI_CUSTOMIZATION_ITEM_TYPE_KEY,
  AI_CUSTOMIZATION_ITEM_URI_KEY,
  AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
  AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID,
  AICustomizationManagementCommands,
  AICustomizationManagementItemMenuId,
  AICustomizationManagementSection
} from "./aiCustomizationManagement.js";
import { AICustomizationManagementEditor } from "./aiCustomizationManagementEditor.js";
import { AICustomizationManagementEditorInput } from "./aiCustomizationManagementEditorInput.js";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    AICustomizationManagementEditor,
    AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
    localize("aiCustomizationManagementEditor", "Agent Customizations Editor")
  ),
  [
    // Note: Using the class directly since we use a singleton pattern
    new SyncDescriptor(AICustomizationManagementEditorInput)
  ]
);
class AICustomizationManagementEditorInputSerializer {
  canSerialize(editorInput) {
    return editorInput instanceof AICustomizationManagementEditorInput;
  }
  serialize(input) {
    return "";
  }
  deserialize(instantiationService) {
    return AICustomizationManagementEditorInput.getOrCreate();
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID,
  AICustomizationManagementEditorInputSerializer
);
function extractURI(context) {
  if (URI.isUri(context)) {
    return context;
  }
  if (typeof context === "string") {
    return URI.parse(context);
  }
  if (URI.isUri(context.uri)) {
    return context.uri;
  }
  return URI.parse(context.uri);
}
function extractSource(context) {
  if (URI.isUri(context) || typeof context === "string") {
    return void 0;
  }
  return context.storage;
}
function extractPromptType(context) {
  if (URI.isUri(context) || typeof context === "string") {
    return void 0;
  }
  return context.promptType;
}
function extractPluginUri(context) {
  if (URI.isUri(context) || typeof context === "string") {
    return void 0;
  }
  const raw = context.pluginUri;
  if (!raw) {
    return void 0;
  }
  return URI.isUri(raw) ? raw : typeof raw === "string" ? URI.parse(raw) : void 0;
}
function extractItemId(context) {
  if (URI.isUri(context) || typeof context === "string") {
    return void 0;
  }
  return typeof context.itemId === "string" ? context.itemId : void 0;
}
function parseHookItemId(itemId) {
  const hashIndex = itemId.lastIndexOf("#");
  if (hashIndex < 0) {
    return void 0;
  }
  const fragment = itemId.substring(hashIndex + 1);
  const match = /^([^[]+)\[(\d+)\]$/.exec(fragment);
  if (!match) {
    return void 0;
  }
  return { originalId: match[1], index: parseInt(match[2], 10) };
}
const OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID = "aiCustomizationManagement.openFile";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID,
      title: localize2("open", "Open"),
      icon: Codicon.goToFile
    });
  }
  async run(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const source = extractSource(context);
    const editorPane = await editorService.openEditor({
      resource: extractURI(context)
    });
    const codeEditor = getCodeEditor(editorPane?.getControl());
    if (codeEditor && (source === AICustomizationSources.extension || source === AICustomizationSources.plugin)) {
      codeEditor.updateOptions({
        readOnly: true,
        readOnlyMessage: new MarkdownString(localize("readonlyPluginFile", "This file is provided by a plugin or extension and cannot be edited."))
      });
    }
  }
});
const RUN_PROMPT_MGMT_ID = "aiCustomizationManagement.runPrompt";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUN_PROMPT_MGMT_ID,
      title: localize2("runPrompt", "Run Prompt"),
      icon: Codicon.play
    });
  }
  async run(accessor, context) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand("workbench.action.chat.run.prompt.current", extractURI(context));
  }
});
const REVEAL_IN_OS_LABEL = isWindows ? localize2("revealInWindows", "Reveal in File Explorer") : isMacintosh ? localize2("revealInMac", "Reveal in Finder") : localize2("openContainer", "Open Containing Folder");
const REVEAL_AI_CUSTOMIZATION_IN_OS_ID = "aiCustomizationManagement.revealInOS";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: REVEAL_AI_CUSTOMIZATION_IN_OS_ID,
      title: REVEAL_IN_OS_LABEL,
      icon: Codicon.folderOpened
    });
  }
  async run(accessor, context) {
    const commandService = accessor.get(ICommandService);
    const uri = extractURI(context);
    await commandService.executeCommand("revealFileInOS", uri);
  }
});
const DELETE_AI_CUSTOMIZATION_ID = "aiCustomizationManagement.delete";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: DELETE_AI_CUSTOMIZATION_ID,
      title: localize2("delete", "Delete"),
      icon: Codicon.trash
    });
  }
  async run(accessor, context) {
    const fileService = accessor.get(IFileService);
    const dialogService = accessor.get(IDialogService);
    const telemetryService = accessor.get(ITelemetryService);
    const workspaceService = accessor.get(IAICustomizationWorkspaceService);
    const editorService = accessor.get(IEditorService);
    const uri = extractURI(context);
    const source = extractSource(context);
    const promptType = extractPromptType(context);
    const itemId = extractItemId(context);
    const isSkill = promptType === PromptsType.skill;
    const isHook = promptType === PromptsType.hook;
    const fileName = isSkill ? basename(dirname(uri)) : basename(uri);
    if (source === AICustomizationSources.plugin) {
      const agentPluginService = accessor.get(IAgentPluginService);
      const plugin = agentPluginService.plugins.get().find((p) => isEqualOrParent(uri, p.uri));
      if (plugin) {
        const result = await dialogService.confirm({
          message: localize("cannotDeletePluginItem", "This item is provided by the plugin '{0}'", plugin.label),
          detail: localize("cannotDeletePluginItemDetail", "Individual components from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
          primaryButton: localize("uninstallPlugin", "Uninstall Plugin"),
          type: "question"
        });
        if (result.confirmed) {
          plugin.remove?.();
        }
      }
      return;
    }
    if (source === AICustomizationSources.extension || source === AICustomizationSources.builtin) {
      await dialogService.info(
        localize("cannotDeleteExtension", "Cannot Delete Extension File"),
        localize("cannotDeleteExtensionDetail", "Files provided by extensions cannot be deleted. You can disable the extension if you no longer want to use this customization.")
      );
      return;
    }
    const hookInfo = isHook && itemId ? parseHookItemId(itemId) : void 0;
    const hookName = typeof context !== "string" && !URI.isUri(context) ? context.name : void 0;
    const message = isSkill ? localize("confirmDeleteSkill", "Are you sure you want to delete skill '{0}' and its folder?", fileName) : hookInfo && hookName ? localize("confirmDeleteHook", "Are you sure you want to delete the '{0}' hook?", hookName) : localize("confirmDelete", "Are you sure you want to delete '{0}'?", fileName);
    const confirmation = await dialogService.confirm({
      message,
      detail: localize("confirmDeleteDetail", "This action cannot be undone."),
      primaryButton: localize("delete", "Delete"),
      type: "warning"
    });
    if (confirmation.confirmed) {
      try {
        telemetryService.publicLog2("chatCustomizationEditor.deleteItem", {
          promptType: promptType ?? "",
          storage: source ?? ""
        });
      } catch {
      }
      if (hookInfo) {
        try {
          const content = await fileService.readFile(uri);
          const text = content.value.toString();
          const edits = removeProperty(text, ["hooks", hookInfo.originalId, hookInfo.index], { tabSize: 1, insertSpaces: false });
          if (edits.length > 0) {
            const updated = applyEdits(text, edits);
            await fileService.writeFile(uri, VSBuffer.fromString(updated));
            if (source === AICustomizationSources.local) {
              const projectRoot = workspaceService.getActiveProjectRoot();
              if (projectRoot) {
                await workspaceService.commitFiles(projectRoot, [uri]);
              }
            }
          }
        } catch {
          await dialogService.error(
            localize("deleteHookItemFailed", "Unable to delete this hook entry because the file contents have changed."),
            localize("deleteHookItemFailedDetail", "Refresh the view and try again.")
          );
        }
        return;
      }
      const deleteTarget = isSkill ? dirname(uri) : uri;
      const useTrash = fileService.hasCapability(deleteTarget, FileSystemProviderCapabilities.Trash);
      await fileService.del(deleteTarget, { useTrash, recursive: isSkill });
      if (source === AICustomizationSources.local) {
        const projectRoot = workspaceService.getActiveProjectRoot();
        if (projectRoot) {
          await workspaceService.deleteFiles(projectRoot, [deleteTarget]);
        }
      }
      const activeEditor = editorService.activeEditorPane;
      if (activeEditor instanceof AICustomizationManagementEditor) {
        activeEditor.refreshList();
      }
    }
  }
});
const COPY_AI_CUSTOMIZATION_PATH_ID = "aiCustomizationManagement.copyPath";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: COPY_AI_CUSTOMIZATION_PATH_ID,
      title: localize2("copyPath", "Copy Path"),
      icon: Codicon.clippy
    });
  }
  async run(accessor, context) {
    const clipboardService = accessor.get(IClipboardService);
    const uri = extractURI(context);
    const textToCopy = uri.scheme === "file" ? uri.fsPath : uri.toString(true);
    await clipboardService.writeText(textToCopy);
  }
});
const INSTALL_CHAT_CUSTOMIZATION_EXTENSION_ID = "aiCustomizationManagement.installChatCustomizationExtension";
const CHAT_CUSTOMIZATION_EXTENSION_ID = "ms-vscode.vscode-chat-customizations-evaluations";
const CHAT_CUSTOMIZATION_EXTENSION_NOT_INSTALLED_CONTEXT = new RawContextKey("chat.customizationExtensionNotInstalled", true);
const CHAT_CUSTOMIZATION_EXTENSION_NOT_INSTALLED = CHAT_CUSTOMIZATION_EXTENSION_NOT_INSTALLED_CONTEXT.isEqualTo(true);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: INSTALL_CHAT_CUSTOMIZATION_EXTENSION_ID,
      title: localize2("installChatCustomizationExtension", "Install Chat Customization Extension"),
      icon: Codicon.beaker
    });
  }
  async run(accessor, context) {
    await accessor.get(ICommandService).executeCommand("workbench.extensions.installExtension", CHAT_CUSTOMIZATION_EXTENSION_ID, { enable: true });
  }
});
const WHEN_ITEM_IS_DELETABLE = ContextKeyExpr.and(
  ContextKeyExpr.notEquals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.extension),
  ContextKeyExpr.notEquals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.plugin),
  ContextKeyExpr.notEquals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.builtin)
);
const WHEN_ITEM_IS_PLUGIN = ContextKeyExpr.and(
  ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.plugin),
  ContextKeyExpr.regex(AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, new RegExp(`^${SYNCED_CUSTOMIZATION_SCHEME}:`)).negate()
);
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: INSTALL_CHAT_CUSTOMIZATION_EXTENSION_ID, title: localize("Install Chat Customization Extension", "Install Chat Customization Extension"), icon: Codicon.beaker },
  group: "inline",
  order: 1,
  when: ContextKeyExpr.and(
    CHAT_CUSTOMIZATION_EXTENSION_NOT_INSTALLED,
    ContextKeyExpr.or(
      ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.prompt),
      ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.instructions),
      ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.agent),
      ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)
    )
  )
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: COPY_AI_CUSTOMIZATION_PATH_ID, title: localize("copyPath", "Copy Path"), icon: Codicon.clippy },
  group: "inline",
  order: 2
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: DELETE_AI_CUSTOMIZATION_ID, title: localize("delete", "Delete"), icon: Codicon.trash },
  group: "inline",
  order: 10,
  when: WHEN_ITEM_IS_DELETABLE
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID, title: localize("open", "Open") },
  group: "1_open",
  order: 1
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: RUN_PROMPT_MGMT_ID, title: localize("runPrompt", "Run Prompt"), icon: Codicon.play },
  group: "2_run",
  order: 1,
  when: ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.prompt)
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: REVEAL_AI_CUSTOMIZATION_IN_OS_ID, title: REVEAL_IN_OS_LABEL.value },
  group: "3_file",
  order: 1,
  when: ContextKeyExpr.or(
    ContextKeyExpr.regex(AI_CUSTOMIZATION_ITEM_URI_KEY, new RegExp(`^${Schemas.file}:`)),
    ContextKeyExpr.regex(AI_CUSTOMIZATION_ITEM_URI_KEY, new RegExp(`^${Schemas.vscodeUserData}:`))
  )
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: DELETE_AI_CUSTOMIZATION_ID, title: localize("delete", "Delete") },
  group: "4_modify",
  order: 1,
  when: WHEN_ITEM_IS_DELETABLE
});
const UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID = "aiCustomizationManagement.uninstallPlugin";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID,
      title: localize2("uninstallPlugin", "Uninstall Plugin"),
      icon: Codicon.trash
    });
  }
  async run(accessor, context) {
    const agentPluginService = accessor.get(IAgentPluginService);
    const dialogService = accessor.get(IDialogService);
    const uri = extractURI(context);
    const plugin = agentPluginService.plugins.get().find((p) => isEqualOrParent(uri, p.uri));
    if (!plugin) {
      return;
    }
    const result = await dialogService.confirm({
      message: localize("confirmUninstallPlugin", "This item is provided by the plugin '{0}'", plugin.label),
      detail: localize("confirmUninstallPluginDetail", "Individual components from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
      primaryButton: localize("uninstallPluginBtn", "Uninstall Plugin"),
      type: "question"
    });
    if (result.confirmed) {
      plugin.remove?.();
    }
  }
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID, title: localize("uninstallPlugin", "Uninstall Plugin"), icon: Codicon.trash },
  group: "inline",
  order: 10,
  when: WHEN_ITEM_IS_PLUGIN
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID, title: localize("uninstallPlugin", "Uninstall Plugin") },
  group: "4_modify",
  order: 1,
  when: WHEN_ITEM_IS_PLUGIN
});
const SHOW_PLUGIN_AI_CUSTOMIZATION_ID = "aiCustomizationManagement.showPlugin";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SHOW_PLUGIN_AI_CUSTOMIZATION_ID,
      title: localize2("showPlugin", "Show Plugin")
    });
  }
  async run(accessor, context) {
    const agentPluginService = accessor.get(IAgentPluginService);
    const editorService = accessor.get(IEditorService);
    const pluginUri = extractPluginUri(context);
    if (!pluginUri) {
      return;
    }
    const plugin = agentPluginService.plugins.get().find((p) => p.uri.toString() === pluginUri.toString());
    if (!plugin) {
      return;
    }
    const item = {
      kind: AgentPluginItemKind.Installed,
      name: plugin.label,
      description: plugin.fromMarketplace?.description ?? "",
      marketplace: plugin.fromMarketplace?.marketplace,
      plugin
    };
    const input = AICustomizationManagementEditorInput.getOrCreate();
    const pane = await editorService.openEditor(input, { pinned: true });
    if (pane instanceof AICustomizationManagementEditor) {
      await pane.showPluginDetail(item);
    }
  }
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: SHOW_PLUGIN_AI_CUSTOMIZATION_ID, title: localize("showPlugin", "Show Plugin") },
  group: "1_open",
  order: 2,
  when: WHEN_ITEM_IS_PLUGIN
});
const DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID = "aiCustomizationManagement.disableItem";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID,
      title: localize2("disable", "Disable"),
      icon: Codicon.eyeClosed
    });
  }
  async run(accessor, context) {
    const promptsService = accessor.get(IPromptsService);
    const uri = extractURI(context);
    const promptType = extractPromptType(context);
    if (!promptType) {
      return;
    }
    const disabled = promptsService.getDisabledPromptFiles(promptType);
    disabled.add(uri);
    promptsService.setDisabledPromptFiles(promptType, disabled);
  }
});
const ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID = "aiCustomizationManagement.enableItem";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID,
      title: localize2("enable", "Enable"),
      icon: Codicon.eye
    });
  }
  async run(accessor, context) {
    const promptsService = accessor.get(IPromptsService);
    const uri = extractURI(context);
    const promptType = extractPromptType(context);
    if (!promptType) {
      return;
    }
    const disabled = promptsService.getDisabledPromptFiles(promptType);
    disabled.delete(uri);
    promptsService.setDisabledPromptFiles(promptType, disabled);
  }
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize("disable", "Disable") },
  group: "5_toggle",
  order: 1,
  when: ContextKeyExpr.and(
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, false),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.builtin),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)
  )
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize("enable", "Enable") },
  group: "5_toggle",
  order: 1,
  when: ContextKeyExpr.and(
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, true),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.builtin),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)
  )
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize("disable", "Disable"), icon: Codicon.eyeClosed },
  group: "inline",
  order: 5,
  when: ContextKeyExpr.and(
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, false),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.builtin),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)
  )
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
  command: { id: ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize("enable", "Enable"), icon: Codicon.eye },
  group: "inline",
  order: 5,
  when: ContextKeyExpr.and(
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, true),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AICustomizationSources.builtin),
    ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)
  )
});
let AICustomizationManagementActionsContribution = class extends Disposable {
  constructor(contextKeyService, extensionManagementService) {
    super();
    this.extensionManagementService = extensionManagementService;
    this.chatCustomizationExtensionNotInstalledContext = CHAT_CUSTOMIZATION_EXTENSION_NOT_INSTALLED_CONTEXT.bindTo(contextKeyService);
    const refreshExtensionContext = () => this.updateChatCustomizationExtensionContext();
    this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions(refreshExtensionContext));
    this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension(refreshExtensionContext));
    this._register(this.extensionManagementService.onDidChangeProfile(refreshExtensionContext));
    this.updateChatCustomizationExtensionContext();
    this.registerActions();
  }
  async updateChatCustomizationExtensionContext() {
    try {
      const installedExtensions = await this.extensionManagementService.getInstalled();
      const extensionKey = ExtensionIdentifier.toKey(CHAT_CUSTOMIZATION_EXTENSION_ID);
      const isInstalled = installedExtensions.some((ext) => ExtensionIdentifier.toKey(ext.identifier.id) === extensionKey);
      this.chatCustomizationExtensionNotInstalledContext.set(!isInstalled);
    } catch {
      this.chatCustomizationExtensionNotInstalledContext.set(true);
    }
  }
  registerActions() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: AICustomizationManagementCommands.OpenEditor,
          title: localize2("openAICustomizations", "Open Customizations"),
          shortTitle: localize2("aiCustomizations", "Customizations"),
          category: CHAT_CATEGORY,
          precondition: ChatContextKeys.enabled,
          f1: true
        });
      }
      async run(accessor, target) {
        const editorService = accessor.get(IEditorService);
        const chatWidgetService = accessor.get(IChatWidgetService);
        const harnessService = accessor.get(ICustomizationHarnessService);
        const section = typeof target === "string" ? target : target?.section;
        const explicitSessionType = typeof target === "string" ? void 0 : target?.sessionType;
        const widget = explicitSessionType ? void 0 : chatWidgetService.lastFocusedWidget;
        const pendingSessionType = widget?.input.pendingDelegationTarget;
        const sessionResource = explicitSessionType ? harnessService.getSessionResourceForHarness(explicitSessionType) : pendingSessionType ? harnessService.getSessionResourceForHarness(pendingSessionType) : widget?.viewModel?.sessionResource;
        if (sessionResource) {
          harnessService.setActiveSession(sessionResource);
        }
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const pane = await editorService.openEditor(input, { pinned: true });
        if (section && pane instanceof AICustomizationManagementEditor) {
          pane.selectSectionById(section);
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: AICustomizationManagementCommands.OpenMarketplace,
          title: localize2("openMarketplace", "Open Marketplace"),
          category: CHAT_CATEGORY,
          precondition: ChatContextKeys.enabled
        });
      }
      async run(accessor, section) {
        const editorService = accessor.get(IEditorService);
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const pane = await editorService.openEditor(input, { pinned: true });
        if (pane instanceof AICustomizationManagementEditor) {
          const targetSection = section ?? AICustomizationManagementSection.McpServers;
          pane.selectSectionById(targetSection, { showMarketplace: true });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: AICustomizationManagementCommands.GenerateDebugReport,
          title: localize2("generateDebugReport", "Generate Customization Debug Report"),
          category: Categories.Developer,
          precondition: ChatContextKeys.enabled,
          f1: true
        });
      }
      async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const pane = await editorService.openEditor(input, { pinned: true });
        if (!(pane instanceof AICustomizationManagementEditor)) {
          return;
        }
        const report = await pane.generateDebugReport();
        await editorService.openEditor({
          resource: void 0,
          contents: report,
          languageId: "plaintext"
        });
      }
    }));
  }
};
AICustomizationManagementActionsContribution.ID = "workbench.contrib.aiCustomizationManagementActions";
AICustomizationManagementActionsContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IWorkbenchExtensionManagementService)
], AICustomizationManagementActionsContribution);
registerWorkbenchContribution2(
  AICustomizationManagementActionsContribution.ID,
  AICustomizationManagementActionsContribution,
  WorkbenchPhase.AfterRestored
);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBhcHBseUVkaXRzLCByZW1vdmVQcm9wZXJ0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FZGl0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGdldENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgSUVkaXRvclNlcmlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvblNvdXJjZXMsIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luSXRlbUtpbmQgfSBmcm9tICcuLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkl0ZW1zLmpzJztcbmltcG9ydCB7XG5cdEFJX0NVU1RPTUlaQVRJT05fSVRFTV9ESVNBQkxFRF9LRVksXG5cdEFJX0NVU1RPTUlaQVRJT05fSVRFTV9QTFVHSU5fVVJJX0tFWSxcblx0QUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLFxuXHRBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksXG5cdEFJX0NVU1RPTUlaQVRJT05fSVRFTV9VUklfS0VZLFxuXHRBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfRURJVE9SX0lELFxuXHRBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfRURJVE9SX0lOUFVUX0lELFxuXHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMsXG5cdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRJdGVtTWVudUlkLFxuXHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbixcblx0QUlDdXN0b21pemF0aW9uU291cmNlLFxufSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvciB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5qcyc7XG5cbi8vI3JlZ2lvbiBUZWxlbWV0cnlcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yRGVsZXRlSXRlbUV2ZW50ID0ge1xuXHRwcm9tcHRUeXBlOiBzdHJpbmc7XG5cdHN0b3JhZ2U6IHN0cmluZztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvckRlbGV0ZUl0ZW1DbGFzc2lmaWNhdGlvbiA9IHtcblx0cHJvbXB0VHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIGN1c3RvbWl6YXRpb24gYmVpbmcgZGVsZXRlZC4nIH07XG5cdHN0b3JhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc3RvcmFnZSBsb2NhdGlvbiBvZiB0aGUgZGVsZXRlZCBpdGVtLicgfTtcblx0b3duZXI6ICdqb3Noc3BpY2VyJztcblx0Y29tbWVudDogJ1RyYWNrcyBpdGVtIGRlbGV0aW9uIGluIHRoZSBBZ2VudCBDdXN0b21pemF0aW9ucyBlZGl0b3IuJztcbn07XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRWRpdG9yIFJlZ2lzdHJhdGlvblxuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IsXG5cdFx0QUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX0VESVRPUl9JRCxcblx0XHRsb2NhbGl6ZSgnYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcicsIFwiQWdlbnQgQ3VzdG9taXphdGlvbnMgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHQvLyBOb3RlOiBVc2luZyB0aGUgY2xhc3MgZGlyZWN0bHkgc2luY2Ugd2UgdXNlIGEgc2luZ2xldG9uIHBhdHRlcm5cblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0IGFzIHVua25vd24gYXMgeyBuZXcoKTogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0IH0pXG5cdF1cbik7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRWRpdG9yIFNlcmlhbGl6ZXJcblxuY2xhc3MgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVkaXRvcklucHV0IGluc3RhbmNlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0O1xuXHR9XG5cblx0c2VyaWFsaXplKGlucHV0OiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQuZ2V0T3JDcmVhdGUoKTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihcblx0QUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX0VESVRPUl9JTlBVVF9JRCxcblx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0U2VyaWFsaXplclxuKTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDb250ZXh0IE1lbnUgQWN0aW9uc1xuXG4vKipcbiAqIFR5cGUgZm9yIGNvbnRleHQgcGFzc2VkIHRvIGFjdGlvbnMgZnJvbSBsaXN0IGNvbnRleHQgbWVudXMuXG4gKiBIYW5kbGVzIGJvdGggZGlyZWN0IFVSSSBhcmd1bWVudHMgYW5kIHNlcmlhbGl6ZWQgY29udGV4dCBvYmplY3RzLlxuICovXG50eXBlIEFJQ3VzdG9taXphdGlvbkNvbnRleHQgPSB7XG5cdHVyaTogVVJJIHwgc3RyaW5nO1xuXHRuYW1lPzogc3RyaW5nO1xuXHRwcm9tcHRUeXBlPzogUHJvbXB0c1R5cGU7XG5cdHN0b3JhZ2U/OiBQcm9tcHRzU3RvcmFnZTtcblx0W2tleTogc3RyaW5nXTogdW5rbm93bjtcbn0gfCBVUkkgfCBzdHJpbmc7XG5cbi8qKlxuICogRXh0cmFjdHMgYSBVUkkgZnJvbSB2YXJpb3VzIGNvbnRleHQgZm9ybWF0cy5cbiAqL1xuZnVuY3Rpb24gZXh0cmFjdFVSSShjb250ZXh0OiBBSUN1c3RvbWl6YXRpb25Db250ZXh0KTogVVJJIHtcblx0aWYgKFVSSS5pc1VyaShjb250ZXh0KSkge1xuXHRcdHJldHVybiBjb250ZXh0O1xuXHR9XG5cdGlmICh0eXBlb2YgY29udGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGNvbnRleHQpO1xuXHR9XG5cdGlmIChVUkkuaXNVcmkoY29udGV4dC51cmkpKSB7XG5cdFx0cmV0dXJuIGNvbnRleHQudXJpO1xuXHR9XG5cdHJldHVybiBVUkkucGFyc2UoY29udGV4dC51cmkgYXMgc3RyaW5nKTtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBzdG9yYWdlIHR5cGUgZnJvbSBjb250ZXh0LlxuICovXG5mdW5jdGlvbiBleHRyYWN0U291cmNlKGNvbnRleHQ6IEFJQ3VzdG9taXphdGlvbkNvbnRleHQpOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UgfCB1bmRlZmluZWQge1xuXHRpZiAoVVJJLmlzVXJpKGNvbnRleHQpIHx8IHR5cGVvZiBjb250ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIGNvbnRleHQuc3RvcmFnZTtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBwcm9tcHQgdHlwZSBmcm9tIGNvbnRleHQuXG4gKi9cbmZ1bmN0aW9uIGV4dHJhY3RQcm9tcHRUeXBlKGNvbnRleHQ6IEFJQ3VzdG9taXphdGlvbkNvbnRleHQpOiBQcm9tcHRzVHlwZSB8IHVuZGVmaW5lZCB7XG5cdGlmIChVUkkuaXNVcmkoY29udGV4dCkgfHwgdHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gY29udGV4dC5wcm9tcHRUeXBlO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSBwYXJlbnQgcGx1Z2luIFVSSSBmcm9tIGNvbnRleHQsIGlmIHByZXNlbnQuXG4gKi9cbmZ1bmN0aW9uIGV4dHJhY3RQbHVnaW5VcmkoY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdGlmIChVUkkuaXNVcmkoY29udGV4dCkgfHwgdHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSBjb250ZXh0LnBsdWdpblVyaTtcblx0aWYgKCFyYXcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBVUkkuaXNVcmkocmF3KSA/IHJhdyA6IHR5cGVvZiByYXcgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHJhdykgOiB1bmRlZmluZWQ7XG59XG5cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgaXRlbSBJRCBmcm9tIGNvbnRleHQgKHVzZWQgZm9yIGlkZW50aWZ5aW5nIGluZGl2aWR1YWwgaG9va3Mgd2l0aGluIGEgZmlsZSkuXG4gKi9cbmZ1bmN0aW9uIGV4dHJhY3RJdGVtSWQoY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChVUkkuaXNVcmkoY29udGV4dCkgfHwgdHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gdHlwZW9mIGNvbnRleHQuaXRlbUlkID09PSAnc3RyaW5nJyA/IGNvbnRleHQuaXRlbUlkIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIGhvb2sgaXRlbSBJRCB0byBleHRyYWN0IHRoZSBvcmlnaW5hbCBob29rIHR5cGUgSUQgYW5kIGFycmF5IGluZGV4LlxuICogSG9vayBpdGVtIElEcyBoYXZlIHRoZSBmb3JtYXQ6IGBmaWxlVXJpI29yaWdpbmFsSWRbaW5kZXhdYFxuICogUmV0dXJucyB1bmRlZmluZWQgaWYgdGhlIElEIGRvZXMgbm90IG1hdGNoIHRoaXMgZm9ybWF0LlxuICovXG5mdW5jdGlvbiBwYXJzZUhvb2tJdGVtSWQoaXRlbUlkOiBzdHJpbmcpOiB7IG9yaWdpbmFsSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaGFzaEluZGV4ID0gaXRlbUlkLmxhc3RJbmRleE9mKCcjJyk7XG5cdGlmIChoYXNoSW5kZXggPCAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBmcmFnbWVudCA9IGl0ZW1JZC5zdWJzdHJpbmcoaGFzaEluZGV4ICsgMSk7XG5cdGNvbnN0IG1hdGNoID0gL14oW15bXSspXFxbKFxcZCspXFxdJC8uZXhlYyhmcmFnbWVudCk7XG5cdGlmICghbWF0Y2gpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IG9yaWdpbmFsSWQ6IG1hdGNoWzFdLCBpbmRleDogcGFyc2VJbnQobWF0Y2hbMl0sIDEwKSB9O1xufVxuXG4vLyBPcGVuIGZpbGUgYWN0aW9uXG5jb25zdCBPUEVOX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9GSUxFX0lEID0gJ2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQub3BlbkZpbGUnO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPUEVOX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9GSUxFX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbicsIFwiT3BlblwiKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBBSUN1c3RvbWl6YXRpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgc291cmNlID0gZXh0cmFjdFNvdXJjZShjb250ZXh0KTtcblxuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IGV4dHJhY3RVUkkoY29udGV4dClcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGVkaXRvclBhbmU/LmdldENvbnRyb2woKSk7XG5cdFx0aWYgKGNvZGVFZGl0b3IgJiYgKHNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb24gfHwgc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbikpIHtcblx0XHRcdGNvZGVFZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHRyZWFkT25seU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncmVhZG9ubHlQbHVnaW5GaWxlJywgXCJUaGlzIGZpbGUgaXMgcHJvdmlkZWQgYnkgYSBwbHVnaW4gb3IgZXh0ZW5zaW9uIGFuZCBjYW5ub3QgYmUgZWRpdGVkLlwiKSksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbi8vIFJ1biBwcm9tcHQgYWN0aW9uXG5jb25zdCBSVU5fUFJPTVBUX01HTVRfSUQgPSAnYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5ydW5Qcm9tcHQnO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSVU5fUFJPTVBUX01HTVRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdydW5Qcm9tcHQnLCBcIlJ1biBQcm9tcHRcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBsYXksXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBBSUN1c3RvbWl6YXRpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJ1bi5wcm9tcHQuY3VycmVudCcsIGV4dHJhY3RVUkkoY29udGV4dCkpO1xuXHR9XG59KTtcblxuLy8gUmV2ZWFsIGluIEZpbmRlci9FeHBsb3JlciBhY3Rpb25cbmNvbnN0IFJFVkVBTF9JTl9PU19MQUJFTCA9IGlzV2luZG93c1xuXHQ/IGxvY2FsaXplMigncmV2ZWFsSW5XaW5kb3dzJywgXCJSZXZlYWwgaW4gRmlsZSBFeHBsb3JlclwiKVxuXHQ6IGlzTWFjaW50b3NoXG5cdFx0PyBsb2NhbGl6ZTIoJ3JldmVhbEluTWFjJywgXCJSZXZlYWwgaW4gRmluZGVyXCIpXG5cdFx0OiBsb2NhbGl6ZTIoJ29wZW5Db250YWluZXInLCBcIk9wZW4gQ29udGFpbmluZyBGb2xkZXJcIik7XG5cbmNvbnN0IFJFVkVBTF9BSV9DVVNUT01JWkFUSU9OX0lOX09TX0lEID0gJ2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQucmV2ZWFsSW5PUyc7XG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJFVkVBTF9BSV9DVVNUT01JWkFUSU9OX0lOX09TX0lELFxuXHRcdFx0dGl0bGU6IFJFVkVBTF9JTl9PU19MQUJFTCxcblx0XHRcdGljb246IENvZGljb24uZm9sZGVyT3BlbmVkLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgdXJpID0gZXh0cmFjdFVSSShjb250ZXh0KTtcblx0XHQvLyBVc2UgZXhpc3RpbmcgcmV2ZWFsIGNvbW1hbmRcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgncmV2ZWFsRmlsZUluT1MnLCB1cmkpO1xuXHR9XG59KTtcblxuLy8gRGVsZXRlIGFjdGlvblxuY29uc3QgREVMRVRFX0FJX0NVU1RPTUlaQVRJT05fSUQgPSAnYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5kZWxldGUnO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBERUxFVEVfQUlfQ1VTVE9NSVpBVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlbGV0ZScsIFwiRGVsZXRlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50cmFzaCxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IEFJQ3VzdG9taXphdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXJpID0gZXh0cmFjdFVSSShjb250ZXh0KTtcblx0XHRjb25zdCBzb3VyY2UgPSBleHRyYWN0U291cmNlKGNvbnRleHQpO1xuXHRcdGNvbnN0IHByb21wdFR5cGUgPSBleHRyYWN0UHJvbXB0VHlwZShjb250ZXh0KTtcblx0XHRjb25zdCBpdGVtSWQgPSBleHRyYWN0SXRlbUlkKGNvbnRleHQpO1xuXHRcdGNvbnN0IGlzU2tpbGwgPSBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbDtcblx0XHRjb25zdCBpc0hvb2sgPSBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5ob29rO1xuXHRcdC8vIEZvciBza2lsbHMsIHVzZSB0aGUgcGFyZW50IGZvbGRlciBuYW1lIHNpbmNlIHNraWxscyBhcmUgc3RydWN0dXJlZCBhcyA8c2tpbGxuYW1lPi9TS0lMTC5tZC5cblx0XHRjb25zdCBmaWxlTmFtZSA9IGlzU2tpbGwgPyBiYXNlbmFtZShkaXJuYW1lKHVyaSkpIDogYmFzZW5hbWUodXJpKTtcblxuXHRcdC8vIFBsdWdpbi1wcm92aWRlZCBmaWxlczogb2ZmZXIgdG8gdW5pbnN0YWxsIHRoZSBwbHVnaW5cblx0XHRpZiAoc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbikge1xuXHRcdFx0Y29uc3QgYWdlbnRQbHVnaW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFBsdWdpblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCkuZmluZChwID0+IGlzRXF1YWxPclBhcmVudCh1cmksIHAudXJpKSk7XG5cdFx0XHRpZiAocGx1Z2luKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Nhbm5vdERlbGV0ZVBsdWdpbkl0ZW0nLCBcIlRoaXMgaXRlbSBpcyBwcm92aWRlZCBieSB0aGUgcGx1Z2luICd7MH0nXCIsIHBsdWdpbi5sYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2Fubm90RGVsZXRlUGx1Z2luSXRlbURldGFpbCcsIFwiSW5kaXZpZHVhbCBjb21wb25lbnRzIGZyb20gYSBwbHVnaW4gY2Fubm90IGJlIHJlbW92ZWQgc2VwYXJhdGVseS4gV291bGQgeW91IGxpa2UgdG8gdW5pbnN0YWxsIHRoZSBlbnRpcmUgcGx1Z2luP1wiKSxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgndW5pbnN0YWxsUGx1Z2luJywgXCJVbmluc3RhbGwgUGx1Z2luXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAocmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHBsdWdpbi5yZW1vdmU/LigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5zaW9uIGFuZCBidWlsdC1pbiBmaWxlcyBjYW5ub3QgYmUgZGVsZXRlZFxuXHRcdGlmIChzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuZXh0ZW5zaW9uIHx8IHNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluKSB7XG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRcdGxvY2FsaXplKCdjYW5ub3REZWxldGVFeHRlbnNpb24nLCBcIkNhbm5vdCBEZWxldGUgRXh0ZW5zaW9uIEZpbGVcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdjYW5ub3REZWxldGVFeHRlbnNpb25EZXRhaWwnLCBcIkZpbGVzIHByb3ZpZGVkIGJ5IGV4dGVuc2lvbnMgY2Fubm90IGJlIGRlbGV0ZWQuIFlvdSBjYW4gZGlzYWJsZSB0aGUgZXh0ZW5zaW9uIGlmIHlvdSBubyBsb25nZXIgd2FudCB0byB1c2UgdGhpcyBjdXN0b21pemF0aW9uLlwiKVxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb25maXJtIGRlbGV0aW9uXG5cdFx0Y29uc3QgaG9va0luZm8gPSBpc0hvb2sgJiYgaXRlbUlkID8gcGFyc2VIb29rSXRlbUlkKGl0ZW1JZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaG9va05hbWUgPSB0eXBlb2YgY29udGV4dCAhPT0gJ3N0cmluZycgJiYgIVVSSS5pc1VyaShjb250ZXh0KSA/IGNvbnRleHQubmFtZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtZXNzYWdlID0gaXNTa2lsbFxuXHRcdFx0PyBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZVNraWxsJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHNraWxsICd7MH0nIGFuZCBpdHMgZm9sZGVyP1wiLCBmaWxlTmFtZSlcblx0XHRcdDogaG9va0luZm8gJiYgaG9va05hbWVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZUhvb2snLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhlICd7MH0nIGhvb2s/XCIsIGhvb2tOYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlICd7MH0nP1wiLCBmaWxlTmFtZSk7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlRGV0YWlsJywgXCJUaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSxcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHR9KTtcblxuXHRcdGlmIChjb25maXJtYXRpb24uY29uZmlybWVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvckRlbGV0ZUl0ZW1FdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvckRlbGV0ZUl0ZW1DbGFzc2lmaWNhdGlvbj4oJ2NoYXRDdXN0b21pemF0aW9uRWRpdG9yLmRlbGV0ZUl0ZW0nLCB7XG5cdFx0XHRcdFx0cHJvbXB0VHlwZTogcHJvbXB0VHlwZSA/PyAnJyxcblx0XHRcdFx0XHRzdG9yYWdlOiBzb3VyY2UgPz8gJycsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFRlbGVtZXRyeSBtdXN0IG5vdCBibG9jayBkZWxldGlvblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgaG9va3Mgd2l0aCBhIHNwZWNpZmljIGhvb2sgSUQsIHJlbW92ZSBvbmx5IHRoYXQgZW50cnkgZnJvbSB0aGUgZmlsZS5cblx0XHRcdC8vIFVzZXMgSlNPTkMgZWRpdHMgdG8gcHJlc2VydmUgdXNlciBjb21tZW50cyBhbmQgZm9ybWF0dGluZy5cblx0XHRcdGlmIChob29rSW5mbykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdHMgPSByZW1vdmVQcm9wZXJ0eSh0ZXh0LCBbJ2hvb2tzJywgaG9va0luZm8ub3JpZ2luYWxJZCwgaG9va0luZm8uaW5kZXhdLCB7IHRhYlNpemU6IDEsIGluc2VydFNwYWNlczogZmFsc2UgfSk7XG5cdFx0XHRcdFx0aWYgKGVkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBhcHBseUVkaXRzKHRleHQsIGVkaXRzKTtcblx0XHRcdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcodXBkYXRlZCkpO1xuXHRcdFx0XHRcdFx0aWYgKHNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcm9qZWN0Um9vdCA9IHdvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKTtcblx0XHRcdFx0XHRcdFx0aWYgKHByb2plY3RSb290KSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgd29ya3NwYWNlU2VydmljZS5jb21taXRGaWxlcyhwcm9qZWN0Um9vdCwgW3VyaV0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2RlbGV0ZUhvb2tJdGVtRmFpbGVkJywgXCJVbmFibGUgdG8gZGVsZXRlIHRoaXMgaG9vayBlbnRyeSBiZWNhdXNlIHRoZSBmaWxlIGNvbnRlbnRzIGhhdmUgY2hhbmdlZC5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZGVsZXRlSG9va0l0ZW1GYWlsZWREZXRhaWwnLCBcIlJlZnJlc2ggdGhlIHZpZXcgYW5kIHRyeSBhZ2Fpbi5cIiksXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBza2lsbHMsIGRlbGV0ZSB0aGUgcGFyZW50IGZvbGRlciAoZS5nLiAuZ2l0aHViL3NraWxscy9teS1za2lsbC8pXG5cdFx0XHQvLyBzaW5jZSBlYWNoIHNraWxsIGlzIGEgZm9sZGVyIGNvbnRhaW5pbmcgU0tJTEwubWQuXG5cdFx0XHRjb25zdCBkZWxldGVUYXJnZXQgPSBpc1NraWxsID8gZGlybmFtZSh1cmkpIDogdXJpO1xuXHRcdFx0Y29uc3QgdXNlVHJhc2ggPSBmaWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KGRlbGV0ZVRhcmdldCwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlRyYXNoKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChkZWxldGVUYXJnZXQsIHsgdXNlVHJhc2gsIHJlY3Vyc2l2ZTogaXNTa2lsbCB9KTtcblxuXHRcdFx0Ly8gQ29tbWl0IHRoZSBkZWxldGlvbiB0byBnaXQgKHNlc3Npb25zOiBtYWluIHJlcG8gKyB3b3JrdHJlZSlcblx0XHRcdGlmIChzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWwpIHtcblx0XHRcdFx0Y29uc3QgcHJvamVjdFJvb3QgPSB3b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk7XG5cdFx0XHRcdGlmIChwcm9qZWN0Um9vdCkge1xuXHRcdFx0XHRcdGF3YWl0IHdvcmtzcGFjZVNlcnZpY2UuZGVsZXRlRmlsZXMocHJvamVjdFJvb3QsIFtkZWxldGVUYXJnZXRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWZyZXNoIHRoZSBsaXN0IHRvIHJlbW92ZSB0aGUgZGVsZXRlZCBpdGVtIGltbWVkaWF0ZWx5XG5cdFx0XHQvLyAocHJvdmlkZXIncyBvbkRpZENoYW5nZSBtYXkgbm90IGZpcmUgaWYgaXQgZG9lc24ndCB3YXRjaCB0aGUgZmlsZXN5c3RlbSlcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvci5yZWZyZXNoTGlzdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbi8vIENvcHkgcGF0aCBhY3Rpb25cbmNvbnN0IENPUFlfQUlfQ1VTVE9NSVpBVElPTl9QQVRIX0lEID0gJ2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuY29weVBhdGgnO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDT1BZX0FJX0NVU1RPTUlaQVRJT05fUEFUSF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvcHlQYXRoJywgXCJDb3B5IFBhdGhcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsaXBweSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IEFJQ3VzdG9taXphdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRjb25zdCB1cmkgPSBleHRyYWN0VVJJKGNvbnRleHQpO1xuXHRcdGNvbnN0IHRleHRUb0NvcHkgPSB1cmkuc2NoZW1lID09PSAnZmlsZScgPyB1cmkuZnNQYXRoIDogdXJpLnRvU3RyaW5nKHRydWUpO1xuXHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRleHRUb0NvcHkpO1xuXHR9XG59KTtcblxuY29uc3QgSU5TVEFMTF9DSEFUX0NVU1RPTUlaQVRJT05fRVhURU5TSU9OX0lEID0gJ2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuaW5zdGFsbENoYXRDdXN0b21pemF0aW9uRXh0ZW5zaW9uJztcbmNvbnN0IENIQVRfQ1VTVE9NSVpBVElPTl9FWFRFTlNJT05fSUQgPSAnbXMtdnNjb2RlLnZzY29kZS1jaGF0LWN1c3RvbWl6YXRpb25zLWV2YWx1YXRpb25zJztcbmNvbnN0IENIQVRfQ1VTVE9NSVpBVElPTl9FWFRFTlNJT05fTk9UX0lOU1RBTExFRF9DT05URVhUID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NoYXQuY3VzdG9taXphdGlvbkV4dGVuc2lvbk5vdEluc3RhbGxlZCcsIHRydWUpO1xuY29uc3QgQ0hBVF9DVVNUT01JWkFUSU9OX0VYVEVOU0lPTl9OT1RfSU5TVEFMTEVEID0gQ0hBVF9DVVNUT01JWkFUSU9OX0VYVEVOU0lPTl9OT1RfSU5TVEFMTEVEX0NPTlRFWFQuaXNFcXVhbFRvKHRydWUpO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJTlNUQUxMX0NIQVRfQ1VTVE9NSVpBVElPTl9FWFRFTlNJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnN0YWxsQ2hhdEN1c3RvbWl6YXRpb25FeHRlbnNpb24nLCBcIkluc3RhbGwgQ2hhdCBDdXN0b21pemF0aW9uIEV4dGVuc2lvblwiKSxcblx0XHRcdGljb246IENvZGljb24uYmVha2VyLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uJywgQ0hBVF9DVVNUT01JWkFUSU9OX0VYVEVOU0lPTl9JRCwgeyBlbmFibGU6IHRydWUgfSk7XG5cdH1cbn0pO1xuXG4vKipcbiAqIFdoZW4gY2xhdXNlIHRoYXQgaGlkZXMgYW4gYWN0aW9uIGZvciByZWFkLW9ubHkgKGV4dGVuc2lvbiwgcGx1Z2luLCBidWlsdC1pbikgaXRlbXMuXG4gKi9cbmNvbnN0IFdIRU5fSVRFTV9JU19ERUxFVEFCTEUgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fU1RPUkFHRV9LRVksIEFJQ3VzdG9taXphdGlvblNvdXJjZXMuZXh0ZW5zaW9uKSxcblx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9TVE9SQUdFX0tFWSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4pLFxuXHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pLFxuKTtcblxuLyoqXG4gKiBXaGVuIGNsYXVzZSB0aGF0IHNob3dzIGFuIGFjdGlvbiBvbmx5IGZvciBwbHVnaW4gaXRlbXMuXG4gKlxuICogU3luY2VkIGN1c3RvbWl6YXRpb25zIGFyZSBidW5kbGVkIGludG8gYSBzeW50aGV0aWMgcGx1Z2luICh1bmRlciB0aGVcbiAqIGB2c2NvZGUtc3luY2VkLWN1c3RvbWl6YXRpb246YCBzY2hlbWUpIGFzIGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBvZiB0aGVcbiAqIHN5bmMgbWVjaGFuaXNtLiBUaGVpciBwbHVnaW4gaWRlbnRpdHkgaXMgbm90IHVzZXItZmFjaW5nLCBzbyB3ZSBoaWRlXG4gKiBwbHVnaW4tcmVsYXRlZCBhY3Rpb25zIChcIlNob3cgUGx1Z2luXCIsIFwiVW5pbnN0YWxsIFBsdWdpblwiKSBmb3IgdGhlbS5cbiAqL1xuY29uc3QgV0hFTl9JVEVNX0lTX1BMVUdJTiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0Q29udGV4dEtleUV4cHIuZXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9TVE9SQUdFX0tFWSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4pLFxuXHRDb250ZXh0S2V5RXhwci5yZWdleChBSV9DVVNUT01JWkFUSU9OX0lURU1fUExVR0lOX1VSSV9LRVksIG5ldyBSZWdFeHAoYF4ke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06YCkpLm5lZ2F0ZSgpLFxuKTtcblxuLy8gUmVnaXN0ZXIgY29udGV4dCBtZW51IGl0ZW1zXG5cbi8vIElubGluZSBob3ZlciBhY3Rpb25zIChzaG93biBhcyBpY29uIGJ1dHRvbnMgb24gaG92ZXIpXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEl0ZW1NZW51SWQsIHtcblx0Y29tbWFuZDogeyBpZDogSU5TVEFMTF9DSEFUX0NVU1RPTUlaQVRJT05fRVhURU5TSU9OX0lELCB0aXRsZTogbG9jYWxpemUoJ0luc3RhbGwgQ2hhdCBDdXN0b21pemF0aW9uIEV4dGVuc2lvbicsIFwiSW5zdGFsbCBDaGF0IEN1c3RvbWl6YXRpb24gRXh0ZW5zaW9uXCIpLCBpY29uOiBDb2RpY29uLmJlYWtlciB9LFxuXHRncm91cDogJ2lubGluZScsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ0hBVF9DVVNUT01JWkFUSU9OX0VYVEVOU0lPTl9OT1RfSU5TVEFMTEVELFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9UWVBFX0tFWSwgUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1RZUEVfS0VZLCBQcm9tcHRzVHlwZS5hZ2VudCksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1RZUEVfS0VZLCBQcm9tcHRzVHlwZS5za2lsbClcblx0XHQpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBDT1BZX0FJX0NVU1RPTUlaQVRJT05fUEFUSF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjb3B5UGF0aCcsIFwiQ29weSBQYXRoXCIpLCBpY29uOiBDb2RpY29uLmNsaXBweSB9LFxuXHRncm91cDogJ2lubGluZScsXG5cdG9yZGVyOiAyLFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBERUxFVEVfQUlfQ1VTVE9NSVpBVElPTl9JRCwgdGl0bGU6IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSwgaWNvbjogQ29kaWNvbi50cmFzaCB9LFxuXHRncm91cDogJ2lubGluZScsXG5cdG9yZGVyOiAxMCxcblx0d2hlbjogV0hFTl9JVEVNX0lTX0RFTEVUQUJMRSxcbn0pO1xuXG4vLyBDb250ZXh0IG1lbnUgaXRlbXMgKHNob3duIG9uIHJpZ2h0LWNsaWNrKVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRJdGVtTWVudUlkLCB7XG5cdGNvbW1hbmQ6IHsgaWQ6IE9QRU5fQUlfQ1VTVE9NSVpBVElPTl9NR01UX0ZJTEVfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnb3BlbicsIFwiT3BlblwiKSB9LFxuXHRncm91cDogJzFfb3BlbicsXG5cdG9yZGVyOiAxLFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBSVU5fUFJPTVBUX01HTVRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgncnVuUHJvbXB0JywgXCJSdW4gUHJvbXB0XCIpLCBpY29uOiBDb2RpY29uLnBsYXkgfSxcblx0Z3JvdXA6ICcyX3J1bicsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1RZUEVfS0VZLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBSRVZFQUxfQUlfQ1VTVE9NSVpBVElPTl9JTl9PU19JRCwgdGl0bGU6IFJFVkVBTF9JTl9PU19MQUJFTC52YWx1ZSB9LFxuXHRncm91cDogJzNfZmlsZScsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRDb250ZXh0S2V5RXhwci5yZWdleChBSV9DVVNUT01JWkFUSU9OX0lURU1fVVJJX0tFWSwgbmV3IFJlZ0V4cChgXiR7U2NoZW1hcy5maWxlfTpgKSksXG5cdFx0Q29udGV4dEtleUV4cHIucmVnZXgoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1VSSV9LRVksIG5ldyBSZWdFeHAoYF4ke1NjaGVtYXMudnNjb2RlVXNlckRhdGF9OmApKVxuXHQpLFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBERUxFVEVfQUlfQ1VTVE9NSVpBVElPTl9JRCwgdGl0bGU6IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSB9LFxuXHRncm91cDogJzRfbW9kaWZ5Jyxcblx0b3JkZXI6IDEsXG5cdHdoZW46IFdIRU5fSVRFTV9JU19ERUxFVEFCTEUsXG59KTtcblxuLy8gVW5pbnN0YWxsIFBsdWdpbiBhY3Rpb24gLSBzaG93biBmb3IgcGx1Z2luLXByb3ZpZGVkIGl0ZW1zXG5jb25zdCBVTklOU1RBTExfUExVR0lOX0FJX0NVU1RPTUlaQVRJT05fSUQgPSAnYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC51bmluc3RhbGxQbHVnaW4nO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBVTklOU1RBTExfUExVR0lOX0FJX0NVU1RPTUlaQVRJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd1bmluc3RhbGxQbHVnaW4nLCBcIlVuaW5zdGFsbCBQbHVnaW5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnRyYXNoLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFnZW50UGx1Z2luU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRQbHVnaW5TZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHVyaSA9IGV4dHJhY3RVUkkoY29udGV4dCk7XG5cdFx0Y29uc3QgcGx1Z2luID0gYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCkuZmluZChwID0+IGlzRXF1YWxPclBhcmVudCh1cmksIHAudXJpKSk7XG5cdFx0aWYgKCFwbHVnaW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1Vbmluc3RhbGxQbHVnaW4nLCBcIlRoaXMgaXRlbSBpcyBwcm92aWRlZCBieSB0aGUgcGx1Z2luICd7MH0nXCIsIHBsdWdpbi5sYWJlbCksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtVW5pbnN0YWxsUGx1Z2luRGV0YWlsJywgXCJJbmRpdmlkdWFsIGNvbXBvbmVudHMgZnJvbSBhIHBsdWdpbiBjYW5ub3QgYmUgcmVtb3ZlZCBzZXBhcmF0ZWx5LiBXb3VsZCB5b3UgbGlrZSB0byB1bmluc3RhbGwgdGhlIGVudGlyZSBwbHVnaW4/XCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ3VuaW5zdGFsbFBsdWdpbkJ0bicsIFwiVW5pbnN0YWxsIFBsdWdpblwiKSxcblx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0fSk7XG5cdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdHBsdWdpbi5yZW1vdmU/LigpO1xuXHRcdH1cblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBVTklOU1RBTExfUExVR0lOX0FJX0NVU1RPTUlaQVRJT05fSUQsIHRpdGxlOiBsb2NhbGl6ZSgndW5pbnN0YWxsUGx1Z2luJywgXCJVbmluc3RhbGwgUGx1Z2luXCIpLCBpY29uOiBDb2RpY29uLnRyYXNoIH0sXG5cdGdyb3VwOiAnaW5saW5lJyxcblx0b3JkZXI6IDEwLFxuXHR3aGVuOiBXSEVOX0lURU1fSVNfUExVR0lOLFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBVTklOU1RBTExfUExVR0lOX0FJX0NVU1RPTUlaQVRJT05fSUQsIHRpdGxlOiBsb2NhbGl6ZSgndW5pbnN0YWxsUGx1Z2luJywgXCJVbmluc3RhbGwgUGx1Z2luXCIpIH0sXG5cdGdyb3VwOiAnNF9tb2RpZnknLFxuXHRvcmRlcjogMSxcblx0d2hlbjogV0hFTl9JVEVNX0lTX1BMVUdJTixcbn0pO1xuXG4vLyBTaG93IFBsdWdpbiBhY3Rpb24gLSBuYXZpZ2F0ZXMgdG8gdGhlIHBhcmVudCBwbHVnaW4gZGV0YWlsIHBhZ2VcbmNvbnN0IFNIT1dfUExVR0lOX0FJX0NVU1RPTUlaQVRJT05fSUQgPSAnYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5zaG93UGx1Z2luJztcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0hPV19QTFVHSU5fQUlfQ1VTVE9NSVpBVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dQbHVnaW4nLCBcIlNob3cgUGx1Z2luXCIpLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFnZW50UGx1Z2luU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRQbHVnaW5TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBsdWdpblVyaSA9IGV4dHJhY3RQbHVnaW5VcmkoY29udGV4dCk7XG5cdFx0aWYgKCFwbHVnaW5VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGx1Z2luID0gYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCkuZmluZChwID0+IHAudXJpLnRvU3RyaW5nKCkgPT09IHBsdWdpblVyaS50b1N0cmluZygpKTtcblx0XHRpZiAoIXBsdWdpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSB7XG5cdFx0XHRraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCBhcyBjb25zdCxcblx0XHRcdG5hbWU6IHBsdWdpbi5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdG1hcmtldHBsYWNlOiBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5tYXJrZXRwbGFjZSxcblx0XHRcdHBsdWdpbixcblx0XHR9O1xuXG5cdFx0Ly8gVHJ5IHRvIHNob3cgd2l0aGluIHRoZSBhY3RpdmUgQUkgQ3VzdG9taXphdGlvbiBlZGl0b3IgKHdpdGggYmFjayBuYXZpZ2F0aW9uKVxuXHRcdGNvbnN0IGlucHV0ID0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmdldE9yQ3JlYXRlKCk7XG5cdFx0Y29uc3QgcGFuZSA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0aWYgKHBhbmUgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBwYW5lLnNob3dQbHVnaW5EZXRhaWwoaXRlbSk7XG5cdFx0fVxuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRJdGVtTWVudUlkLCB7XG5cdGNvbW1hbmQ6IHsgaWQ6IFNIT1dfUExVR0lOX0FJX0NVU1RPTUlaQVRJT05fSUQsIHRpdGxlOiBsb2NhbGl6ZSgnc2hvd1BsdWdpbicsIFwiU2hvdyBQbHVnaW5cIikgfSxcblx0Z3JvdXA6ICcxX29wZW4nLFxuXHRvcmRlcjogMixcblx0d2hlbjogV0hFTl9JVEVNX0lTX1BMVUdJTixcbn0pO1xuXG4vLyBEaXNhYmxlIGl0ZW0gYWN0aW9uXG5jb25zdCBESVNBQkxFX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9JVEVNX0lEID0gJ2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuZGlzYWJsZUl0ZW0nO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBESVNBQkxFX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9JVEVNX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGlzYWJsZScsIFwiRGlzYWJsZVwiKSxcblx0XHRcdGljb246IENvZGljb24uZXllQ2xvc2VkLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogQUlDdXN0b21pemF0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9tcHRzU2VydmljZSk7XG5cdFx0Y29uc3QgdXJpID0gZXh0cmFjdFVSSShjb250ZXh0KTtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gZXh0cmFjdFByb21wdFR5cGUoY29udGV4dCk7XG5cdFx0aWYgKCFwcm9tcHRUeXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBwcm9tcHRzU2VydmljZS5nZXREaXNhYmxlZFByb21wdEZpbGVzKHByb21wdFR5cGUpO1xuXHRcdGRpc2FibGVkLmFkZCh1cmkpO1xuXHRcdHByb21wdHNTZXJ2aWNlLnNldERpc2FibGVkUHJvbXB0RmlsZXMocHJvbXB0VHlwZSwgZGlzYWJsZWQpO1xuXHR9XG59KTtcblxuLy8gRW5hYmxlIGl0ZW0gYWN0aW9uXG5jb25zdCBFTkFCTEVfQUlfQ1VTVE9NSVpBVElPTl9NR01UX0lURU1fSUQgPSAnYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5lbmFibGVJdGVtJztcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRU5BQkxFX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9JVEVNX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZW5hYmxlJywgXCJFbmFibGVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmV5ZSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IEFJQ3VzdG9taXphdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvbXB0c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaSA9IGV4dHJhY3RVUkkoY29udGV4dCk7XG5cdFx0Y29uc3QgcHJvbXB0VHlwZSA9IGV4dHJhY3RQcm9tcHRUeXBlKGNvbnRleHQpO1xuXHRcdGlmICghcHJvbXB0VHlwZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2FibGVkID0gcHJvbXB0c1NlcnZpY2UuZ2V0RGlzYWJsZWRQcm9tcHRGaWxlcyhwcm9tcHRUeXBlKTtcblx0XHRkaXNhYmxlZC5kZWxldGUodXJpKTtcblx0XHRwcm9tcHRzU2VydmljZS5zZXREaXNhYmxlZFByb21wdEZpbGVzKHByb21wdFR5cGUsIGRpc2FibGVkKTtcblx0fVxufSk7XG5cbi8vIENvbnRleHQgbWVudTogRGlzYWJsZSAoc2hvd24gd2hlbiBidWlsdGluIGl0ZW0gaXMgZW5hYmxlZClcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50SXRlbU1lbnVJZCwge1xuXHRjb21tYW5kOiB7IGlkOiBESVNBQkxFX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9JVEVNX0lELCB0aXRsZTogbG9jYWxpemUoJ2Rpc2FibGUnLCBcIkRpc2FibGVcIikgfSxcblx0Z3JvdXA6ICc1X3RvZ2dsZScsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9ESVNBQkxFRF9LRVksIGZhbHNlKSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksIFByb21wdHNUeXBlLnNraWxsKSxcblx0KSxcbn0pO1xuXG4vLyBDb250ZXh0IG1lbnU6IEVuYWJsZSAoc2hvd24gd2hlbiBidWlsdGluIGl0ZW0gaXMgZGlzYWJsZWQpXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEl0ZW1NZW51SWQsIHtcblx0Y29tbWFuZDogeyBpZDogRU5BQkxFX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9JVEVNX0lELCB0aXRsZTogbG9jYWxpemUoJ2VuYWJsZScsIFwiRW5hYmxlXCIpIH0sXG5cdGdyb3VwOiAnNV90b2dnbGUnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fRElTQUJMRURfS0VZLCB0cnVlKSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksIFByb21wdHNUeXBlLnNraWxsKSxcblx0KSxcbn0pO1xuXG4vLyBJbmxpbmUgaG92ZXI6IERpc2FibGUgKHNob3duIHdoZW4gYnVpbHRpbiBpdGVtIGlzIGVuYWJsZWQpXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEl0ZW1NZW51SWQsIHtcblx0Y29tbWFuZDogeyBpZDogRElTQUJMRV9BSV9DVVNUT01JWkFUSU9OX01HTVRfSVRFTV9JRCwgdGl0bGU6IGxvY2FsaXplKCdkaXNhYmxlJywgXCJEaXNhYmxlXCIpLCBpY29uOiBDb2RpY29uLmV5ZUNsb3NlZCB9LFxuXHRncm91cDogJ2lubGluZScsXG5cdG9yZGVyOiA1LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9ESVNBQkxFRF9LRVksIGZhbHNlKSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksIFByb21wdHNUeXBlLnNraWxsKSxcblx0KSxcbn0pO1xuXG4vLyBJbmxpbmUgaG92ZXI6IEVuYWJsZSAoc2hvd24gd2hlbiBidWlsdGluIGl0ZW0gaXMgZGlzYWJsZWQpXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEl0ZW1NZW51SWQsIHtcblx0Y29tbWFuZDogeyBpZDogRU5BQkxFX0FJX0NVU1RPTUlaQVRJT05fTUdNVF9JVEVNX0lELCB0aXRsZTogbG9jYWxpemUoJ2VuYWJsZScsIFwiRW5hYmxlXCIpLCBpY29uOiBDb2RpY29uLmV5ZSB9LFxuXHRncm91cDogJ2lubGluZScsXG5cdG9yZGVyOiA1LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9ESVNBQkxFRF9LRVksIHRydWUpLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhBSV9DVVNUT01JWkFUSU9OX0lURU1fU1RPUkFHRV9LRVksIEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiksXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKEFJX0NVU1RPTUlaQVRJT05fSVRFTV9UWVBFX0tFWSwgUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHQpLFxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQWN0aW9uc1xuXG5jbGFzcyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50QWN0aW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEFjdGlvbnMnO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoYXRDdXN0b21pemF0aW9uRXh0ZW5zaW9uTm90SW5zdGFsbGVkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY2hhdEN1c3RvbWl6YXRpb25FeHRlbnNpb25Ob3RJbnN0YWxsZWRDb250ZXh0ID0gQ0hBVF9DVVNUT01JWkFUSU9OX0VYVEVOU0lPTl9OT1RfSU5TVEFMTEVEX0NPTlRFWFQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlZnJlc2hFeHRlbnNpb25Db250ZXh0ID0gKCkgPT4gdGhpcy51cGRhdGVDaGF0Q3VzdG9taXphdGlvbkV4dGVuc2lvbkNvbnRleHQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uUHJvZmlsZUF3YXJlRGlkSW5zdGFsbEV4dGVuc2lvbnMocmVmcmVzaEV4dGVuc2lvbkNvbnRleHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uUHJvZmlsZUF3YXJlRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKHJlZnJlc2hFeHRlbnNpb25Db250ZXh0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGUocmVmcmVzaEV4dGVuc2lvbkNvbnRleHQpKTtcblx0XHR0aGlzLnVwZGF0ZUNoYXRDdXN0b21pemF0aW9uRXh0ZW5zaW9uQ29udGV4dCgpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUNoYXRDdXN0b21pemF0aW9uRXh0ZW5zaW9uQ29udGV4dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25LZXkgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KENIQVRfQ1VTVE9NSVpBVElPTl9FWFRFTlNJT05fSUQpO1xuXHRcdFx0Y29uc3QgaXNJbnN0YWxsZWQgPSBpbnN0YWxsZWRFeHRlbnNpb25zLnNvbWUoZXh0ID0+IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0LmlkZW50aWZpZXIuaWQpID09PSBleHRlbnNpb25LZXkpO1xuXHRcdFx0dGhpcy5jaGF0Q3VzdG9taXphdGlvbkV4dGVuc2lvbk5vdEluc3RhbGxlZENvbnRleHQuc2V0KCFpc0luc3RhbGxlZCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLmNoYXRDdXN0b21pemF0aW9uRXh0ZW5zaW9uTm90SW5zdGFsbGVkQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0Ly8gT3BlbiBBSSBDdXN0b21pemF0aW9ucyBFZGl0b3Jcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5BSUN1c3RvbWl6YXRpb25zJywgXCJPcGVuIEN1c3RvbWl6YXRpb25zXCIpLFxuXHRcdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignYWlDdXN0b21pemF0aW9ucycsIFwiQ3VzdG9taXphdGlvbnNcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdGFyZ2V0PzogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfCB7IHJlYWRvbmx5IHNlY3Rpb24/OiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjsgcmVhZG9ubHkgc2Vzc2lvblR5cGU6IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBoYXJuZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHR5cGVvZiB0YXJnZXQgPT09ICdzdHJpbmcnID8gdGFyZ2V0IDogdGFyZ2V0Py5zZWN0aW9uO1xuXG5cdFx0XHRcdC8vIERldGVjdCB0aGUgYWN0aXZlIGNoYXQgc2Vzc2lvbiB0eXBlIGFuZCBzd2l0Y2ggdGhlIGhhcm5lc3Ncblx0XHRcdFx0Ly8gc28gdGhlIGN1c3RvbWl6YXRpb24gZWRpdG9yIG9wZW5zIGluIHRoZSBtYXRjaGluZyBjb250ZXh0LlxuXHRcdFx0XHRjb25zdCBleHBsaWNpdFNlc3Npb25UeXBlID0gdHlwZW9mIHRhcmdldCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiB0YXJnZXQ/LnNlc3Npb25UeXBlO1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBleHBsaWNpdFNlc3Npb25UeXBlID8gdW5kZWZpbmVkIDogY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdTZXNzaW9uVHlwZSA9IHdpZGdldD8uaW5wdXQucGVuZGluZ0RlbGVnYXRpb25UYXJnZXQ7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGV4cGxpY2l0U2Vzc2lvblR5cGVcblx0XHRcdFx0XHQ/IGhhcm5lc3NTZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZUZvckhhcm5lc3MoZXhwbGljaXRTZXNzaW9uVHlwZSlcblx0XHRcdFx0XHQ6IHBlbmRpbmdTZXNzaW9uVHlwZVxuXHRcdFx0XHRcdFx0PyBoYXJuZXNzU2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2VGb3JIYXJuZXNzKHBlbmRpbmdTZXNzaW9uVHlwZSlcblx0XHRcdFx0XHRcdDogd2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRcdGhhcm5lc3NTZXJ2aWNlLnNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmdldE9yQ3JlYXRlKCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAoc2VjdGlvbiAmJiBwYW5lIGluc3RhbmNlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcikge1xuXHRcdFx0XHRcdHBhbmUuc2VsZWN0U2VjdGlvbkJ5SWQoc2VjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBPcGVuIE1hcmtldHBsYWNlIChoaWRkZW4gY29tbWFuZCBmb3IgZGVlcC1saW5raW5nIGludG8gYnJvd3NlIG1vZGUpXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMuT3Blbk1hcmtldHBsYWNlLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5NYXJrZXRwbGFjZScsIFwiT3BlbiBNYXJrZXRwbGFjZVwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZWN0aW9uPzogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmdldE9yQ3JlYXRlKCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAocGFuZSBpbnN0YW5jZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRTZWN0aW9uID0gc2VjdGlvbiA/PyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzO1xuXHRcdFx0XHRcdHBhbmUuc2VsZWN0U2VjdGlvbkJ5SWQodGFyZ2V0U2VjdGlvbiwgeyBzaG93TWFya2V0cGxhY2U6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBHZW5lcmF0ZSBEZWJ1ZyBSZXBvcnRcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5HZW5lcmF0ZURlYnVnUmVwb3J0LFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlRGVidWdSZXBvcnQnLCBcIkdlbmVyYXRlIEN1c3RvbWl6YXRpb24gRGVidWcgUmVwb3J0XCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHQvLyBPcGVuIHRoZSBjdXN0b21pemF0aW9ucyBlZGl0b3IgaWYgbm90IGFscmVhZHkgb3BlblxuXHRcdFx0XHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKCEocGFuZSBpbnN0YW5jZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlcG9ydCA9IGF3YWl0IHBhbmUuZ2VuZXJhdGVEZWJ1Z1JlcG9ydCgpO1xuXHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29udGVudHM6IHJlcG9ydCxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiAncGxhaW50ZXh0Jyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50QWN0aW9uc0NvbnRyaWJ1dGlvbi5JRCxcblx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEFjdGlvbnNDb250cmlidXRpb24sXG5cdFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWRcbik7XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHNCQUFzQjtBQUMzQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhLGlCQUFpQjtBQUN2QyxTQUFTLFVBQVUsU0FBUyx1QkFBdUI7QUFDbkQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGNBQWMsdUJBQXVCO0FBQ3ZELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0Msb0JBQW9CO0FBQzdELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQWlEO0FBQzFELFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyx3QkFBbUU7QUFFNUUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0Isd0NBQXdDO0FBQ3pFLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJBQTJC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
