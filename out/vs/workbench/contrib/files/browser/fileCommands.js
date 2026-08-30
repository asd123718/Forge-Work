import * as nls from "../../../../nls.js";
import { EditorResourceAccessor, isEditorCommandsContext, SideBySideEditor, SaveReason, EditorsOrder, EditorInputCapabilities } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { isWorkspaceToOpen } from "../../../../platform/window/common/window.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService, UNTITLED_WORKSPACE_NAME } from "../../../../platform/workspace/common/workspace.js";
import { ExplorerFocusCondition, TextFileContentProvider, VIEWLET_ID, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext, ExplorerCompressedLastFocusContext, FilesExplorerFocusCondition, ExplorerFolderContext, VIEW_ID } from "../common/files.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode, KeyChord } from "../../../../base/common/keyCodes.js";
import { isWeb, isWindows } from "../../../../base/common/platform.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { getResourceForCommand, getMultiSelectedResources, getOpenEditorsViewMultiSelection, IExplorerService } from "./files.js";
import { IWorkspaceEditingService } from "../../../services/workspaces/common/workspaceEditing.js";
import { resolveCommandsContext } from "../../../browser/parts/editor/editorCommandsContext.js";
import { Schemas } from "../../../../base/common/network.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IEditorGroupsService, GroupsOrder } from "../../../services/editor/common/editorGroupsService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { basename, joinPath, isEqual } from "../../../../base/common/resources.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toAction } from "../../../../base/common/actions.js";
import { EditorOpenSource, EditorResolution } from "../../../../platform/editor/common/editor.js";
import { hash } from "../../../../base/common/hash.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { OPEN_TO_SIDE_COMMAND_ID, COMPARE_WITH_SAVED_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, COMPARE_SELECTED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, COPY_PATH_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_WITH_EXPLORER_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_AS_COMMAND_ID, SAVE_ALL_COMMAND_ID, SAVE_ALL_IN_GROUP_COMMAND_ID, SAVE_FILES_COMMAND_ID, REVERT_FILE_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, PREVIOUS_COMPRESSED_FOLDER, NEXT_COMPRESSED_FOLDER, FIRST_COMPRESSED_FOLDER, LAST_COMPRESSED_FOLDER, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, NEW_FILE_COMMAND_ID } from "./fileConstants.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { RemoveRootFolderAction } from "../../../browser/actions/workspaceActions.js";
import { OpenEditorsView } from "./views/openEditorsView.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
const openWindowCommand = (accessor, toOpen, options) => {
  if (Array.isArray(toOpen)) {
    const hostService = accessor.get(IHostService);
    const environmentService = accessor.get(IEnvironmentService);
    toOpen = toOpen.map((openable) => {
      if (isWorkspaceToOpen(openable) && openable.workspaceUri.scheme === Schemas.untitled) {
        return {
          workspaceUri: joinPath(environmentService.untitledWorkspacesHome, openable.workspaceUri.path, UNTITLED_WORKSPACE_NAME)
        };
      }
      return openable;
    });
    hostService.openWindow(toOpen, options);
  }
};
const newWindowCommand = (accessor, options) => {
  const hostService = accessor.get(IHostService);
  hostService.openWindow(options);
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: ExplorerFocusCondition,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  mac: {
    primary: KeyMod.WinCtrl | KeyCode.Enter
  },
  id: OPEN_TO_SIDE_COMMAND_ID,
  handler: async (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const explorerService = accessor.get(IExplorerService);
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), explorerService);
    if (resources.length) {
      const untitledResources = resources.filter((resource2) => resource2.scheme === Schemas.untitled);
      const fileResources = resources.filter((resource2) => resource2.scheme !== Schemas.untitled);
      const items = await Promise.all(fileResources.map(async (resource2) => {
        const item = explorerService.findClosest(resource2);
        if (item) {
          return item;
        }
        return await fileService.stat(resource2);
      }));
      const files = items.filter((i) => !i.isDirectory);
      const editors = files.map((f) => ({
        resource: f.resource,
        options: { pinned: true }
      })).concat(...untitledResources.map((untitledResource) => ({ resource: untitledResource, options: { pinned: true } })));
      await editorService.openEditors(editors, SIDE_GROUP);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
  primary: KeyCode.Enter,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.DownArrow
  },
  id: "explorer.openAndPassFocus",
  handler: async (accessor, _resource) => {
    const editorService = accessor.get(IEditorService);
    const explorerService = accessor.get(IExplorerService);
    const resources = explorerService.getContext(true);
    if (resources.length) {
      await editorService.openEditors(resources.map((r) => ({ resource: r.resource, options: { preserveFocus: false, pinned: true } })));
    }
  }
});
const COMPARE_WITH_SAVED_SCHEMA = "showModifications";
let providerDisposables = [];
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: COMPARE_WITH_SAVED_COMMAND_ID,
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyD),
  handler: async (accessor, resource) => {
    const instantiationService = accessor.get(IInstantiationService);
    const textModelService = accessor.get(ITextModelService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const listService = accessor.get(IListService);
    let registerEditorListener = false;
    if (providerDisposables.length === 0) {
      registerEditorListener = true;
      const provider = instantiationService.createInstance(TextFileContentProvider);
      providerDisposables.push(provider);
      providerDisposables.push(textModelService.registerTextModelContentProvider(COMPARE_WITH_SAVED_SCHEMA, provider));
    }
    const uri = getResourceForCommand(resource, editorService, listService);
    if (uri && fileService.hasProvider(uri)) {
      const name = basename(uri);
      const editorLabel = nls.localize("modifiedLabel", "{0} (in file) \u2194 {1}", name, name);
      try {
        await TextFileContentProvider.open(uri, COMPARE_WITH_SAVED_SCHEMA, editorLabel, editorService, { pinned: true });
        if (registerEditorListener) {
          providerDisposables.push(editorService.onDidVisibleEditorsChange(() => {
            if (!editorService.editors.some((editor) => !!EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: COMPARE_WITH_SAVED_SCHEMA }))) {
              providerDisposables = dispose(providerDisposables);
            }
          }));
        }
      } catch {
        providerDisposables = dispose(providerDisposables);
      }
    }
  }
});
let globalResourceToCompare;
let resourceSelectedForCompareContext;
CommandsRegistry.registerCommand({
  id: SELECT_FOR_COMPARE_COMMAND_ID,
  handler: (accessor, resource) => {
    globalResourceToCompare = getResourceForCommand(resource, accessor.get(IEditorService), accessor.get(IListService));
    if (!resourceSelectedForCompareContext) {
      resourceSelectedForCompareContext = ResourceSelectedForCompareContext.bindTo(accessor.get(IContextKeyService));
    }
    resourceSelectedForCompareContext.set(true);
  }
});
CommandsRegistry.registerCommand({
  id: COMPARE_SELECTED_COMMAND_ID,
  handler: async (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
    if (resources.length === 2) {
      return editorService.openEditor({
        original: { resource: resources[0] },
        modified: { resource: resources[1] },
        options: { pinned: true }
      });
    }
    return true;
  }
});
CommandsRegistry.registerCommand({
  id: COMPARE_RESOURCE_COMMAND_ID,
  handler: (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const rightResource = getResourceForCommand(resource, editorService, accessor.get(IListService));
    if (globalResourceToCompare && rightResource) {
      editorService.openEditor({
        original: { resource: globalResourceToCompare },
        modified: { resource: rightResource },
        options: { pinned: true }
      });
    }
  }
});
async function resourcesToClipboard(resources, relative, clipboardService, labelService, configurationService) {
  if (resources.length) {
    const lineDelimiter = isWindows ? "\r\n" : "\n";
    let separator = void 0;
    const copyRelativeOrFullPathSeparatorSection = relative ? "explorer.copyRelativePathSeparator" : "explorer.copyPathSeparator";
    const copyRelativeOrFullPathSeparator = configurationService.getValue(copyRelativeOrFullPathSeparatorSection);
    if (copyRelativeOrFullPathSeparator === "/" || copyRelativeOrFullPathSeparator === "\\") {
      separator = copyRelativeOrFullPathSeparator;
    }
    const text = resources.map((resource) => labelService.getUriLabel(resource, { relative, noPrefix: true, separator })).join(lineDelimiter);
    await clipboardService.writeText(text);
  }
}
const copyPathCommandHandler = async (accessor, resource) => {
  const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
  await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus.toNegated(),
  primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
  win: {
    primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
  },
  id: COPY_PATH_COMMAND_ID,
  handler: copyPathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
  win: {
    primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
  },
  id: COPY_PATH_COMMAND_ID,
  handler: copyPathCommandHandler
});
const copyRelativePathCommandHandler = async (accessor, resource) => {
  const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
  await resourcesToClipboard(resources, true, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus.toNegated(),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC,
  win: {
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
  },
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  handler: copyRelativePathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC),
  win: {
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
  },
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  handler: copyRelativePathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyP),
  id: "workbench.action.files.copyPathOfActiveFile",
  handler: async (accessor) => {
    const editorService = accessor.get(IEditorService);
    const activeInput = editorService.activeEditor;
    const resource = EditorResourceAccessor.getOriginalUri(activeInput, { supportSideBySide: SideBySideEditor.PRIMARY });
    const resources = resource ? [resource] : [];
    await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
  }
});
CommandsRegistry.registerCommand({
  id: REVEAL_IN_EXPLORER_COMMAND_ID,
  handler: async (accessor, resource) => {
    const viewService = accessor.get(IViewsService);
    const contextService = accessor.get(IWorkspaceContextService);
    const explorerService = accessor.get(IExplorerService);
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const uri = getResourceForCommand(resource, editorService, listService);
    if (uri && contextService.isInsideWorkspace(uri)) {
      const explorerView = await viewService.openView(VIEW_ID, false);
      if (explorerView) {
        const oldAutoReveal = explorerView.autoReveal;
        explorerView.autoReveal = false;
        explorerView.setExpanded(true);
        await explorerService.select(uri, "force");
        explorerView.focus();
        explorerView.autoReveal = oldAutoReveal;
      }
    } else {
      const openEditorsView = viewService.getViewWithId(OpenEditorsView.ID);
      if (openEditorsView) {
        openEditorsView.setExpanded(true);
        openEditorsView.focus();
      }
    }
  }
});
CommandsRegistry.registerCommand({
  id: OPEN_WITH_EXPLORER_COMMAND_ID,
  handler: async (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const uri = getResourceForCommand(resource, editorService, listService);
    if (uri) {
      return editorService.openEditor({ resource: uri, options: { override: EditorResolution.PICK, source: EditorOpenSource.USER } });
    }
    return void 0;
  }
});
function expandSideBySideEditor({ groupId, editor }, options) {
  if (editor instanceof SideBySideEditorInput && !options?.saveAs && !(editor.primary.hasCapability(EditorInputCapabilities.Untitled) || editor.secondary.hasCapability(EditorInputCapabilities.Untitled)) && editor.secondary.isModified()) {
    return [{ groupId, editor: editor.primary }, { groupId, editor: editor.secondary }];
  }
  return [{ groupId, editor }];
}
function getEditorsFromCommandArgs(accessor, commandArgs, options) {
  if (!commandArgs?.some((arg) => isEditorCommandsContext(arg))) {
    return void 0;
  }
  const resolvedContext = resolveCommandsContext(commandArgs, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
  const editors = [];
  for (const { group, editors: groupEditors } of resolvedContext.groupedEditors) {
    for (const editor of groupEditors) {
      editors.push(...expandSideBySideEditor({ groupId: group.id, editor }, options));
    }
  }
  return editors;
}
async function saveSelectedEditors(accessor, options, commandArgs) {
  const editorGroupService = accessor.get(IEditorGroupsService);
  const codeEditorService = accessor.get(ICodeEditorService);
  const textFileService = accessor.get(ITextFileService);
  let editors = getEditorsFromCommandArgs(accessor, commandArgs, options);
  if (!editors) {
    editors = getOpenEditorsViewMultiSelection(accessor);
  }
  if (!editors) {
    const activeGroup = editorGroupService.activeGroup;
    if (activeGroup.activeEditor) {
      editors = expandSideBySideEditor({ groupId: activeGroup.id, editor: activeGroup.activeEditor }, options);
    }
  }
  if (!editors || editors.length === 0) {
    return;
  }
  await doSaveEditors(accessor, editors, options);
  const focusedCodeEditor = codeEditorService.getFocusedCodeEditor();
  if (focusedCodeEditor instanceof EmbeddedCodeEditorWidget && !focusedCodeEditor.isSimpleWidget) {
    const resource = focusedCodeEditor.getModel()?.uri;
    if (resource && !editors.some(({ editor }) => isEqual(EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }), resource))) {
      const model = textFileService.files.get(resource);
      if (!model?.isReadonly()) {
        await textFileService.save(resource, options);
      }
    }
  }
}
function saveDirtyEditorsOfGroups(accessor, groups, options) {
  const dirtyEditors = [];
  for (const group of groups) {
    for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
      if (editor.isDirty()) {
        dirtyEditors.push({ groupId: group.id, editor });
      }
    }
  }
  return doSaveEditors(accessor, dirtyEditors, options);
}
async function doSaveEditors(accessor, editors, options) {
  const editorService = accessor.get(IEditorService);
  const notificationService = accessor.get(INotificationService);
  const instantiationService = accessor.get(IInstantiationService);
  try {
    await editorService.save(editors, options);
  } catch (error) {
    if (!isCancellationError(error)) {
      const actions = [toAction({ id: "workbench.action.files.saveEditors", label: nls.localize("retry", "Retry"), run: () => instantiationService.invokeFunction((accessor2) => doSaveEditors(accessor2, editors, options)) })];
      const editorsToRevert = editors.filter(
        ({ editor }) => !editor.hasCapability(EditorInputCapabilities.Untitled)
        /* all except untitled to prevent unexpected data-loss */
      );
      if (editorsToRevert.length > 0) {
        actions.push(toAction({ id: "workbench.action.files.revertEditors", label: editorsToRevert.length > 1 ? nls.localize("revertAll", "Revert All") : nls.localize("revert", "Revert"), run: () => editorService.revert(editorsToRevert) }));
      }
      notificationService.notify({
        id: editors.map(({ editor }) => hash(editor.resource?.toString())).join(),
        // ensure unique notification ID per set of editor
        severity: Severity.Error,
        message: nls.localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(", "), toErrorMessage(error, false)),
        actions: { primary: actions }
      });
    }
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyCode.KeyS,
  id: SAVE_FILE_COMMAND_ID,
  handler: (accessor, ...args) => {
    return saveSelectedEditors(accessor, {
      reason: SaveReason.EXPLICIT,
      force: true
      /* force save even when non-dirty */
    }, args);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS),
  win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS) },
  id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
  handler: (accessor) => {
    return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, force: true, skipSaveParticipants: true });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: SAVE_FILE_AS_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
  handler: (accessor, ...args) => {
    return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, saveAs: true }, args);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: void 0,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyS },
  win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS) },
  id: SAVE_ALL_COMMAND_ID,
  handler: (accessor) => {
    return saveDirtyEditorsOfGroups(accessor, accessor.get(IEditorGroupsService).getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE), { reason: SaveReason.EXPLICIT });
  }
});
CommandsRegistry.registerCommand({
  id: SAVE_ALL_IN_GROUP_COMMAND_ID,
  handler: (accessor, _, editorContext) => {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const resolvedContext = resolveCommandsContext([editorContext], accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
    let groups = void 0;
    if (!resolvedContext.groupedEditors.length) {
      groups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    } else {
      groups = resolvedContext.groupedEditors.map(({ group }) => group);
    }
    return saveDirtyEditorsOfGroups(accessor, groups, { reason: SaveReason.EXPLICIT });
  }
});
CommandsRegistry.registerCommand({
  id: SAVE_FILES_COMMAND_ID,
  handler: async (accessor) => {
    const editorService = accessor.get(IEditorService);
    const res = await editorService.saveAll({ includeUntitled: false, reason: SaveReason.EXPLICIT });
    return res.success;
  }
});
CommandsRegistry.registerCommand({
  id: REVERT_FILE_COMMAND_ID,
  handler: async (accessor) => {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    let editors = getOpenEditorsViewMultiSelection(accessor);
    if (!editors) {
      const activeGroup = editorGroupService.activeGroup;
      if (activeGroup.activeEditor) {
        editors = [{ groupId: activeGroup.id, editor: activeGroup.activeEditor }];
      }
    }
    if (!editors || editors.length === 0) {
      return;
    }
    try {
      await editorService.revert(editors.filter(
        ({ editor }) => !editor.hasCapability(EditorInputCapabilities.Untitled)
        /* all except untitled */
      ), { force: true });
    } catch (error) {
      const notificationService = accessor.get(INotificationService);
      notificationService.error(nls.localize("genericRevertError", "Failed to revert '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(", "), toErrorMessage(error, false)));
    }
  }
});
CommandsRegistry.registerCommand({
  id: REMOVE_ROOT_FOLDER_COMMAND_ID,
  handler: (accessor, resource) => {
    const contextService = accessor.get(IWorkspaceContextService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const workspace = contextService.getWorkspace();
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService)).filter(
      (resource2) => workspace.folders.some((folder) => uriIdentityService.extUri.isEqual(folder.uri, resource2))
      // Need to verify resources are workspaces since multi selection can trigger this command on some non workspace resources
    );
    if (resources.length === 0) {
      const commandService = accessor.get(ICommandService);
      return commandService.executeCommand(RemoveRootFolderAction.ID);
    }
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    return workspaceEditingService.removeFolders(resources);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
  primary: KeyCode.LeftArrow,
  id: PREVIOUS_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.previousCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
  primary: KeyCode.RightArrow,
  id: NEXT_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.nextCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
  primary: KeyCode.Home,
  id: FIRST_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.firstCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
  primary: KeyCode.End,
  id: LAST_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.lastCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: null,
  primary: isWeb ? isWindows ? KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyN : KeyMod.CtrlCmd | KeyCode.KeyN,
  secondary: isWeb ? [KeyMod.CtrlCmd | KeyCode.KeyN] : void 0,
  id: NEW_UNTITLED_FILE_COMMAND_ID,
  metadata: {
    description: NEW_UNTITLED_FILE_LABEL,
    args: [
      {
        isOptional: true,
        name: "New Untitled Text File arguments",
        description: "The editor view type or language ID if known",
        schema: {
          "type": "object",
          "properties": {
            "viewType": {
              "type": "string"
            },
            "languageId": {
              "type": "string"
            }
          }
        }
      }
    ]
  },
  handler: async (accessor, args) => {
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      resource: void 0,
      options: {
        override: args?.viewType,
        pinned: true
      },
      languageId: args?.languageId
    });
  }
});
CommandsRegistry.registerCommand({
  id: NEW_FILE_COMMAND_ID,
  handler: async (accessor, args) => {
    const editorService = accessor.get(IEditorService);
    const dialogService = accessor.get(IFileDialogService);
    const fileService = accessor.get(IFileService);
    const createFileLocalized = nls.localize("newFileCommand.saveLabel", "Create File");
    const defaultFileUri = joinPath(await dialogService.defaultFilePath(), args?.fileName ?? "Untitled.txt");
    const saveUri = await dialogService.showSaveDialog({ saveLabel: createFileLocalized, title: createFileLocalized, defaultUri: defaultFileUri });
    if (!saveUri) {
      return;
    }
    await fileService.createFile(saveUri, void 0, { overwrite: true });
    await editorService.openEditor({
      resource: saveUri,
      options: {
        override: args?.viewType,
        pinned: true
      },
      languageId: args?.languageId
    });
  }
});
export {
  newWindowCommand,
  openWindowCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxmaWxlQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJRWRpdG9yQ29tbWFuZHNDb250ZXh0LCBpc0VkaXRvckNvbW1hbmRzQ29udGV4dCwgU2lkZUJ5U2lkZUVkaXRvciwgSUVkaXRvcklkZW50aWZpZXIsIFNhdmVSZWFzb24sIEVkaXRvcnNPcmRlciwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElXaW5kb3dPcGVuYWJsZSwgSU9wZW5XaW5kb3dPcHRpb25zLCBpc1dvcmtzcGFjZVRvT3BlbiwgSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgVU5USVRMRURfV09SS1NQQUNFX05BTUUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBUZXh0RmlsZUNvbnRlbnRQcm92aWRlciwgVklFV0xFVF9JRCwgRXhwbG9yZXJDb21wcmVzc2VkRm9jdXNDb250ZXh0LCBFeHBsb3JlckNvbXByZXNzZWRGaXJzdEZvY3VzQ29udGV4dCwgRXhwbG9yZXJDb21wcmVzc2VkTGFzdEZvY3VzQ29udGV4dCwgRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckZvbGRlckNvbnRleHQsIFZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4vZXhwbG9yZXJWaWV3bGV0LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kSGFuZGxlciwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlLCBLZXlDaG9yZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGlzV2ViLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlc291cmNlRm9yQ29tbWFuZCwgZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcywgZ2V0T3BlbkVkaXRvcnNWaWV3TXVsdGlTZWxlY3Rpb24sIElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAsIElTYXZlRWRpdG9yc09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIEdyb3Vwc09yZGVyLCBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pblBhdGgsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcGVuU291cmNlLCBFZGl0b3JSZXNvbHV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9QRU5fVE9fU0lERV9DT01NQU5EX0lELCBDT01QQVJFX1dJVEhfU0FWRURfQ09NTUFORF9JRCwgU0VMRUNUX0ZPUl9DT01QQVJFX0NPTU1BTkRfSUQsIFJlc291cmNlU2VsZWN0ZWRGb3JDb21wYXJlQ29udGV4dCwgQ09NUEFSRV9TRUxFQ1RFRF9DT01NQU5EX0lELCBDT01QQVJFX1JFU09VUkNFX0NPTU1BTkRfSUQsIENPUFlfUEFUSF9DT01NQU5EX0lELCBDT1BZX1JFTEFUSVZFX1BBVEhfQ09NTUFORF9JRCwgUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQsIE9QRU5fV0lUSF9FWFBMT1JFUl9DT01NQU5EX0lELCBTQVZFX0ZJTEVfQ09NTUFORF9JRCwgU0FWRV9GSUxFX1dJVEhPVVRfRk9STUFUVElOR19DT01NQU5EX0lELCBTQVZFX0ZJTEVfQVNfQ09NTUFORF9JRCwgU0FWRV9BTExfQ09NTUFORF9JRCwgU0FWRV9BTExfSU5fR1JPVVBfQ09NTUFORF9JRCwgU0FWRV9GSUxFU19DT01NQU5EX0lELCBSRVZFUlRfRklMRV9DT01NQU5EX0lELCBSRU1PVkVfUk9PVF9GT0xERVJfQ09NTUFORF9JRCwgUFJFVklPVVNfQ09NUFJFU1NFRF9GT0xERVIsIE5FWFRfQ09NUFJFU1NFRF9GT0xERVIsIEZJUlNUX0NPTVBSRVNTRURfRk9MREVSLCBMQVNUX0NPTVBSRVNTRURfRk9MREVSLCBORVdfVU5USVRMRURfRklMRV9DT01NQU5EX0lELCBORVdfVU5USVRMRURfRklMRV9MQUJFTCwgTkVXX0ZJTEVfQ09NTUFORF9JRCB9IGZyb20gJy4vZmlsZUNvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFJlbW92ZVJvb3RGb2xkZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuRWRpdG9yc1ZpZXcgfSBmcm9tICcuL3ZpZXdzL29wZW5FZGl0b3JzVmlldy5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlclZpZXcgfSBmcm9tICcuL3ZpZXdzL2V4cGxvcmVyVmlldy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3Qgb3BlbldpbmRvd0NvbW1hbmQgPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHRvT3BlbjogSVdpbmRvd09wZW5hYmxlW10sIG9wdGlvbnM/OiBJT3BlbldpbmRvd09wdGlvbnMpID0+IHtcblx0aWYgKEFycmF5LmlzQXJyYXkodG9PcGVuKSkge1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0Ly8gcmV3cml0ZSB1bnRpdGxlZDogd29ya3NwYWNlIFVSSXMgdG8gdGhlIGFic29sdXRlIHBhdGggb24gZGlza1xuXHRcdHRvT3BlbiA9IHRvT3Blbi5tYXAob3BlbmFibGUgPT4ge1xuXHRcdFx0aWYgKGlzV29ya3NwYWNlVG9PcGVuKG9wZW5hYmxlKSAmJiBvcGVuYWJsZS53b3Jrc3BhY2VVcmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0d29ya3NwYWNlVXJpOiBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudW50aXRsZWRXb3Jrc3BhY2VzSG9tZSwgb3BlbmFibGUud29ya3NwYWNlVXJpLnBhdGgsIFVOVElUTEVEX1dPUktTUEFDRV9OQU1FKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gb3BlbmFibGU7XG5cdFx0fSk7XG5cblx0XHRob3N0U2VydmljZS5vcGVuV2luZG93KHRvT3Blbiwgb3B0aW9ucyk7XG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBuZXdXaW5kb3dDb21tYW5kID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMpID0+IHtcblx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0aG9zdFNlcnZpY2Uub3BlbldpbmRvdyhvcHRpb25zKTtcbn07XG5cbi8vIENvbW1hbmQgcmVnaXN0cmF0aW9uXG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogRXhwbG9yZXJGb2N1c0NvbmRpdGlvbixcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRW50ZXJcblx0fSxcblx0aWQ6IE9QRU5fVE9fU0lERV9DT01NQU5EX0lELCBoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgZXhwbG9yZXJTZXJ2aWNlKTtcblxuXHRcdC8vIFNldCBzaWRlIGlucHV0XG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHVudGl0bGVkUmVzb3VyY2VzID0gcmVzb3VyY2VzLmZpbHRlcihyZXNvdXJjZSA9PiByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpO1xuXHRcdFx0Y29uc3QgZmlsZVJlc291cmNlcyA9IHJlc291cmNlcy5maWx0ZXIocmVzb3VyY2UgPT4gcmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnVudGl0bGVkKTtcblxuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBQcm9taXNlLmFsbChmaWxlUmVzb3VyY2VzLm1hcChhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBleHBsb3JlclNlcnZpY2UuZmluZENsb3Nlc3QocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRcdC8vIEV4cGxvcmVyIGFscmVhZHkgcmVzb2x2ZWQgdGhlIGl0ZW0sIG5vIG5lZWQgdG8gZ28gdG8gdGhlIGZpbGUgc2VydmljZSAjMTA5NzgwXG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgZmlsZVNlcnZpY2Uuc3RhdChyZXNvdXJjZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBmaWxlcyA9IGl0ZW1zLmZpbHRlcihpID0+ICFpLmlzRGlyZWN0b3J5KTtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSBmaWxlcy5tYXAoZiA9PiAoe1xuXHRcdFx0XHRyZXNvdXJjZTogZi5yZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0fSkpLmNvbmNhdCguLi51bnRpdGxlZFJlc291cmNlcy5tYXAodW50aXRsZWRSZXNvdXJjZSA9PiAoeyByZXNvdXJjZTogdW50aXRsZWRSZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KSkpO1xuXG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKGVkaXRvcnMsIFNJREVfR1JPVVApO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XG5cdH0sXG5cdGlkOiAnZXhwbG9yZXIub3BlbkFuZFBhc3NGb2N1cycsIGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgX3Jlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQodHJ1ZSk7XG5cblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhyZXNvdXJjZXMubWFwKHIgPT4gKHsgcmVzb3VyY2U6IHIucmVzb3VyY2UsIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogZmFsc2UsIHBpbm5lZDogdHJ1ZSB9IH0pKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgQ09NUEFSRV9XSVRIX1NBVkVEX1NDSEVNQSA9ICdzaG93TW9kaWZpY2F0aW9ucyc7XG5sZXQgcHJvdmlkZXJEaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBDT01QQVJFX1dJVEhfU0FWRURfQ09NTUFORF9JRCxcblx0d2hlbjogdW5kZWZpbmVkLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5RCksXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSB8IG9iamVjdCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgcHJvdmlkZXIgYXQgZmlyc3QgYXMgbmVlZGVkXG5cdFx0bGV0IHJlZ2lzdGVyRWRpdG9yTGlzdGVuZXIgPSBmYWxzZTtcblx0XHRpZiAocHJvdmlkZXJEaXNwb3NhYmxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlZ2lzdGVyRWRpdG9yTGlzdGVuZXIgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlQ29udGVudFByb3ZpZGVyKTtcblx0XHRcdHByb3ZpZGVyRGlzcG9zYWJsZXMucHVzaChwcm92aWRlcik7XG5cdFx0XHRwcm92aWRlckRpc3Bvc2FibGVzLnB1c2godGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihDT01QQVJFX1dJVEhfU0FWRURfU0NIRU1BLCBwcm92aWRlcikpO1xuXHRcdH1cblxuXHRcdC8vIE9wZW4gZWRpdG9yIChvbmx5IHJlc291cmNlcyB0aGF0IGNhbiBiZSBoYW5kbGVkIGJ5IGZpbGUgc2VydmljZSBhcmUgc3VwcG9ydGVkKVxuXHRcdGNvbnN0IHVyaSA9IGdldFJlc291cmNlRm9yQ29tbWFuZChyZXNvdXJjZSwgZWRpdG9yU2VydmljZSwgbGlzdFNlcnZpY2UpO1xuXHRcdGlmICh1cmkgJiYgZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIodXJpKSkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lKHVyaSk7XG5cdFx0XHRjb25zdCBlZGl0b3JMYWJlbCA9IG5scy5sb2NhbGl6ZSgnbW9kaWZpZWRMYWJlbCcsIFwiezB9IChpbiBmaWxlKSBcdTIxOTQgezF9XCIsIG5hbWUsIG5hbWUpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBUZXh0RmlsZUNvbnRlbnRQcm92aWRlci5vcGVuKHVyaSwgQ09NUEFSRV9XSVRIX1NBVkVEX1NDSEVNQSwgZWRpdG9yTGFiZWwsIGVkaXRvclNlcnZpY2UsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdFx0XHQvLyBEaXNwb3NlIG9uY2Ugbm8gbW9yZSBkaWZmIGVkaXRvciBpcyBvcGVuZWQgd2l0aCB0aGUgc2NoZW1lXG5cdFx0XHRcdGlmIChyZWdpc3RlckVkaXRvckxpc3RlbmVyKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJEaXNwb3NhYmxlcy5wdXNoKGVkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWVkaXRvclNlcnZpY2UuZWRpdG9ycy5zb21lKGVkaXRvciA9PiAhIUVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlksIGZpbHRlckJ5U2NoZW1lOiBDT01QQVJFX1dJVEhfU0FWRURfU0NIRU1BIH0pKSkge1xuXHRcdFx0XHRcdFx0XHRwcm92aWRlckRpc3Bvc2FibGVzID0gZGlzcG9zZShwcm92aWRlckRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRwcm92aWRlckRpc3Bvc2FibGVzID0gZGlzcG9zZShwcm92aWRlckRpc3Bvc2FibGVzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5sZXQgZ2xvYmFsUmVzb3VyY2VUb0NvbXBhcmU6IFVSSSB8IHVuZGVmaW5lZDtcbmxldCByZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0VMRUNUX0ZPUl9DT01QQVJFX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSB8IG9iamVjdCkgPT4ge1xuXHRcdGdsb2JhbFJlc291cmNlVG9Db21wYXJlID0gZ2V0UmVzb3VyY2VGb3JDb21tYW5kKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0aWYgKCFyZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQpIHtcblx0XHRcdHJlc291cmNlU2VsZWN0ZWRGb3JDb21wYXJlQ29udGV4dCA9IFJlc291cmNlU2VsZWN0ZWRGb3JDb21wYXJlQ29udGV4dC5iaW5kVG8oYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdH1cblx0XHRyZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQuc2V0KHRydWUpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQ09NUEFSRV9TRUxFQ1RFRF9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpKTtcblxuXHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHJlc291cmNlc1swXSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogcmVzb3VyY2VzWzFdIH0sXG5cdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQ09NUEFSRV9SRVNPVVJDRV9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCByaWdodFJlc291cmNlID0gZ2V0UmVzb3VyY2VGb3JDb21tYW5kKHJlc291cmNlLCBlZGl0b3JTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0aWYgKGdsb2JhbFJlc291cmNlVG9Db21wYXJlICYmIHJpZ2h0UmVzb3VyY2UpIHtcblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBnbG9iYWxSZXNvdXJjZVRvQ29tcGFyZSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogcmlnaHRSZXNvdXJjZSB9LFxuXHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5hc3luYyBmdW5jdGlvbiByZXNvdXJjZXNUb0NsaXBib2FyZChyZXNvdXJjZXM6IFVSSVtdLCByZWxhdGl2ZTogYm9vbGVhbiwgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAocmVzb3VyY2VzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGxpbmVEZWxpbWl0ZXIgPSBpc1dpbmRvd3MgPyAnXFxyXFxuJyA6ICdcXG4nO1xuXG5cdFx0bGV0IHNlcGFyYXRvcjogJy8nIHwgJ1xcXFwnIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvcHlSZWxhdGl2ZU9yRnVsbFBhdGhTZXBhcmF0b3JTZWN0aW9uID0gcmVsYXRpdmUgPyAnZXhwbG9yZXIuY29weVJlbGF0aXZlUGF0aFNlcGFyYXRvcicgOiAnZXhwbG9yZXIuY29weVBhdGhTZXBhcmF0b3InO1xuXHRcdGNvbnN0IGNvcHlSZWxhdGl2ZU9yRnVsbFBhdGhTZXBhcmF0b3I6ICcvJyB8ICdcXFxcJyB8IHVuZGVmaW5lZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGNvcHlSZWxhdGl2ZU9yRnVsbFBhdGhTZXBhcmF0b3JTZWN0aW9uKTtcblx0XHRpZiAoY29weVJlbGF0aXZlT3JGdWxsUGF0aFNlcGFyYXRvciA9PT0gJy8nIHx8IGNvcHlSZWxhdGl2ZU9yRnVsbFBhdGhTZXBhcmF0b3IgPT09ICdcXFxcJykge1xuXHRcdFx0c2VwYXJhdG9yID0gY29weVJlbGF0aXZlT3JGdWxsUGF0aFNlcGFyYXRvcjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ID0gcmVzb3VyY2VzLm1hcChyZXNvdXJjZSA9PiBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmUsIG5vUHJlZml4OiB0cnVlLCBzZXBhcmF0b3IgfSkpLmpvaW4obGluZURlbGltaXRlcik7XG5cdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGV4dCk7XG5cdH1cbn1cblxuY29uc3QgY29weVBhdGhDb21tYW5kSGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gYXN5bmMgKGFjY2Vzc29yLCByZXNvdXJjZTogdW5rbm93bikgPT4ge1xuXHRjb25zdCByZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpKTtcblx0YXdhaXQgcmVzb3VyY2VzVG9DbGlwYm9hcmQocmVzb3VyY2VzLCBmYWxzZSwgYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG59O1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLnRvTmVnYXRlZCgpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUMsXG5cdHdpbjoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUNcblx0fSxcblx0aWQ6IENPUFlfUEFUSF9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBjb3B5UGF0aENvbW1hbmRIYW5kbGVyXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5QyksXG5cdHdpbjoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUNcblx0fSxcblx0aWQ6IENPUFlfUEFUSF9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBjb3B5UGF0aENvbW1hbmRIYW5kbGVyXG59KTtcblxuY29uc3QgY29weVJlbGF0aXZlUGF0aENvbW1hbmRIYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiB1bmtub3duKSA9PiB7XG5cdGNvbnN0IHJlc291cmNlcyA9IGdldE11bHRpU2VsZWN0ZWRSZXNvdXJjZXMocmVzb3VyY2UsIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSkpO1xuXHRhd2FpdCByZXNvdXJjZXNUb0NsaXBib2FyZChyZXNvdXJjZXMsIHRydWUsIGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSksIGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpO1xufTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cy50b05lZ2F0ZWQoKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlDLFxuXHR3aW46IHtcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUMpXG5cdH0sXG5cdGlkOiBDT1BZX1JFTEFUSVZFX1BBVEhfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogY29weVJlbGF0aXZlUGF0aENvbW1hbmRIYW5kbGVyXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5QyksXG5cdHdpbjoge1xuXHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Qylcblx0fSxcblx0aWQ6IENPUFlfUkVMQVRJVkVfUEFUSF9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBjb3B5UmVsYXRpdmVQYXRoQ29tbWFuZEhhbmRsZXJcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IHVuZGVmaW5lZCxcblx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5UCksXG5cdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5jb3B5UGF0aE9mQWN0aXZlRmlsZScsXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVJbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVJbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IHJlc291cmNlID8gW3Jlc291cmNlXSA6IFtdO1xuXHRcdGF3YWl0IHJlc291cmNlc1RvQ2xpcGJvYXJkKHJlc291cmNlcywgZmFsc2UsIGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSksIGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSB8IG9iamVjdCkgPT4ge1xuXHRcdGNvbnN0IHZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgdXJpID0gZ2V0UmVzb3VyY2VGb3JDb21tYW5kKHJlc291cmNlLCBlZGl0b3JTZXJ2aWNlLCBsaXN0U2VydmljZSk7XG5cblx0XHRpZiAodXJpICYmIGNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKHVyaSkpIHtcblx0XHRcdGNvbnN0IGV4cGxvcmVyVmlldyA9IGF3YWl0IHZpZXdTZXJ2aWNlLm9wZW5WaWV3PEV4cGxvcmVyVmlldz4oVklFV19JRCwgZmFsc2UpO1xuXHRcdFx0aWYgKGV4cGxvcmVyVmlldykge1xuXHRcdFx0XHRjb25zdCBvbGRBdXRvUmV2ZWFsID0gZXhwbG9yZXJWaWV3LmF1dG9SZXZlYWw7XG5cdFx0XHRcdC8vIERpc2FibGUgYXV0b3JldmVhbCBiZWZvcmUgcmV2ZWFsaW5nIHRoZSBleHBsb3JlciB0byBwcmV2ZW50IGEgcmFjZSBiZXR3ZW5lIGF1dG8gcmV2ZWFsICsgc2VsZWN0aW9uXG5cdFx0XHRcdC8vIEZpeGVzICMxOTcyNjhcblx0XHRcdFx0ZXhwbG9yZXJWaWV3LmF1dG9SZXZlYWwgPSBmYWxzZTtcblx0XHRcdFx0ZXhwbG9yZXJWaWV3LnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdFx0XHRhd2FpdCBleHBsb3JlclNlcnZpY2Uuc2VsZWN0KHVyaSwgJ2ZvcmNlJyk7XG5cdFx0XHRcdGV4cGxvcmVyVmlldy5mb2N1cygpO1xuXHRcdFx0XHRleHBsb3JlclZpZXcuYXV0b1JldmVhbCA9IG9sZEF1dG9SZXZlYWw7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERvIG5vdCByZXZlYWwgdGhlIG9wZW4gZWRpdG9ycyB2aWV3IGlmIGl0J3MgaGlkZGVuIGV4cGxpY2l0bHlcblx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjI3Mzc4XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yc1ZpZXcgPSB2aWV3U2VydmljZS5nZXRWaWV3V2l0aElkKE9wZW5FZGl0b3JzVmlldy5JRCk7XG5cdFx0XHRpZiAob3BlbkVkaXRvcnNWaWV3KSB7XG5cdFx0XHRcdG9wZW5FZGl0b3JzVmlldy5zZXRFeHBhbmRlZCh0cnVlKTtcblx0XHRcdFx0b3BlbkVkaXRvcnNWaWV3LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogT1BFTl9XSVRIX0VYUExPUkVSX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSB8IG9iamVjdCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgdXJpID0gZ2V0UmVzb3VyY2VGb3JDb21tYW5kKHJlc291cmNlLCBlZGl0b3JTZXJ2aWNlLCBsaXN0U2VydmljZSk7XG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgb3ZlcnJpZGU6IEVkaXRvclJlc29sdXRpb24uUElDSywgc291cmNlOiBFZGl0b3JPcGVuU291cmNlLlVTRVIgfSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59KTtcblxuLy8gU2F2ZSAvIFNhdmUgQXMgLyBTYXZlIEFsbCAvIFJldmVydFxuXG5mdW5jdGlvbiBleHBhbmRTaWRlQnlTaWRlRWRpdG9yKHsgZ3JvdXBJZCwgZWRpdG9yIH06IElFZGl0b3JJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVFZGl0b3JzT3B0aW9ucyk6IElFZGl0b3JJZGVudGlmaWVyW10ge1xuXG5cdC8vIFNwZWNpYWwgdHJlYXRtZW50IGZvciBzaWRlIGJ5IHNpZGUgZWRpdG9yczogaWYgdGhlIGVkaXRvclxuXHQvLyBoYXMgMiBzaWRlcywgd2UgY29uc2lkZXIgYm90aCwgdG8gc3VwcG9ydCBzYXZpbmcgYm90aCBzaWRlcy5cblx0Ly8gV2Ugb25seSBhbGxvdyB0aGlzIHdoZW4gc2F2aW5nLCBub3QgZm9yIFwiU2F2ZSBBc1wiIGFuZCBub3QgaWYgYW55XG5cdC8vIGVkaXRvciBpcyB1bnRpdGxlZCB3aGljaCB3b3VsZCBicmluZyB1cCBhIFwiU2F2ZSBBc1wiIGRpYWxvZyB0b28uXG5cdC8vIEluIGFkZGl0aW9uLCB3ZSByZXF1aXJlIHRoZSBzZWNvbmRhcnkgc2lkZSB0byBiZSBtb2RpZmllZCB0byBub3Rcblx0Ly8gdHJpZ2dlciBhIHRvdWNoIG9wZXJhdGlvbiB1bmV4cGVjdGVkbHkuXG5cdC8vXG5cdC8vIFNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MTgwXG5cdC8vIFNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDYzMzBcblx0Ly8gU2VlIGFsc28gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5MDIxMFxuXHRpZiAoXG5cdFx0ZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0ICYmXG5cdFx0IW9wdGlvbnM/LnNhdmVBcyAmJiAhKGVkaXRvci5wcmltYXJ5Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpIHx8IGVkaXRvci5zZWNvbmRhcnkuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpICYmXG5cdFx0ZWRpdG9yLnNlY29uZGFyeS5pc01vZGlmaWVkKClcblx0KSB7XG5cdFx0cmV0dXJuIFt7IGdyb3VwSWQsIGVkaXRvcjogZWRpdG9yLnByaW1hcnkgfSwgeyBncm91cElkLCBlZGl0b3I6IGVkaXRvci5zZWNvbmRhcnkgfV07XG5cdH1cblxuXHRyZXR1cm4gW3sgZ3JvdXBJZCwgZWRpdG9yIH1dO1xufVxuXG5mdW5jdGlvbiBnZXRFZGl0b3JzRnJvbUNvbW1hbmRBcmdzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb21tYW5kQXJnczogdW5rbm93bltdIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVNhdmVFZGl0b3JzT3B0aW9ucyk6IElFZGl0b3JJZGVudGlmaWVyW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIWNvbW1hbmRBcmdzPy5zb21lKGFyZyA9PiBpc0VkaXRvckNvbW1hbmRzQ29udGV4dChhcmcpKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIG9ubHkgcmVzcGVjdCB0aGUgYXJndW1lbnRzIGlmIHRoZXkgY29udGFpbiBhbiBleHBsaWNpdCBlZGl0b3IgY29udGV4dFxuXHR9XG5cblx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChjb21tYW5kQXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXG5cdGNvbnN0IGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0Zm9yIChjb25zdCB7IGdyb3VwLCBlZGl0b3JzOiBncm91cEVkaXRvcnMgfSBvZiByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMpIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cEVkaXRvcnMpIHtcblx0XHRcdGVkaXRvcnMucHVzaCguLi5leHBhbmRTaWRlQnlTaWRlRWRpdG9yKHsgZ3JvdXBJZDogZ3JvdXAuaWQsIGVkaXRvciB9LCBvcHRpb25zKSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gTm90ZTogd2UgcmV0dXJuIHRoZSAocG9zc2libHkgZW1wdHkpIHJlc3VsdCBldmVuIHdoZW4gdGhlIGV4cGxpY2l0IGNvbnRleHRcblx0Ly8gbm8gbG9uZ2VyIHJlc29sdmVzIHRvIGFueSBlZGl0b3IgdG8gbm90IGZhbGwgYmFjayB0byBvdGhlciBlZGl0b3JzIHdoaWNoXG5cdC8vIHdvdWxkIGVuZCB1cCBzYXZpbmcgYW4gZWRpdG9yIHRoZSBjb21tYW5kIHdhcyBub3QgaW52b2tlZCBmb3Jcblx0cmV0dXJuIGVkaXRvcnM7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVTZWxlY3RlZEVkaXRvcnMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM/OiBJU2F2ZUVkaXRvcnNPcHRpb25zLCBjb21tYW5kQXJncz86IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cblx0Ly8gUmV0cmlldmUgdGhlIGVkaXRvcnMgZnJvbSB0aGUgY29tbWFuZCBhcmd1bWVudHMgaWYgdGhleSBjb250YWluIGFuIGV4cGxpY2l0XG5cdC8vIGVkaXRvciBjb250ZXh0IChlLmcuIHdoZW4gaW52b2tlZCBmcm9tIHRoZSBlZGl0b3IgdGFiIGNvbnRleHQgbWVudSkgYmVjYXVzZVxuXHQvLyB0aGUgZWRpdG9yIHRoZSBjb21tYW5kIHdhcyB0cmlnZ2VyZWQgZm9yIG1heSBub3QgYmUgdGhlIGFjdGl2ZSBlZGl0b3Jcblx0bGV0IGVkaXRvcnMgPSBnZXRFZGl0b3JzRnJvbUNvbW1hbmRBcmdzKGFjY2Vzc29yLCBjb21tYW5kQXJncywgb3B0aW9ucyk7XG5cblx0Ly8gUmV0cmlldmUgc2VsZWN0ZWQgb3IgYWN0aXZlIGVkaXRvclxuXHRpZiAoIWVkaXRvcnMpIHtcblx0XHRlZGl0b3JzID0gZ2V0T3BlbkVkaXRvcnNWaWV3TXVsdGlTZWxlY3Rpb24oYWNjZXNzb3IpO1xuXHR9XG5cdGlmICghZWRpdG9ycykge1xuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdGlmIChhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdGVkaXRvcnMgPSBleHBhbmRTaWRlQnlTaWRlRWRpdG9yKHsgZ3JvdXBJZDogYWN0aXZlR3JvdXAuaWQsIGVkaXRvcjogYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yIH0sIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGlmICghZWRpdG9ycyB8fCBlZGl0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjsgLy8gbm90aGluZyB0byBzYXZlXG5cdH1cblxuXHQvLyBTYXZlIGVkaXRvcnNcblx0YXdhaXQgZG9TYXZlRWRpdG9ycyhhY2Nlc3NvciwgZWRpdG9ycywgb3B0aW9ucyk7XG5cblx0Ly8gU3BlY2lhbCB0cmVhdG1lbnQgZm9yIGVtYmVkZGVkIGVkaXRvcnM6IGlmIHdlIGRldGVjdCB0aGF0IGZvY3VzIGlzXG5cdC8vIGluc2lkZSBhbiBlbWJlZGRlZCBjb2RlIGVkaXRvciwgd2Ugc2F2ZSB0aGF0IG1vZGVsIGFzIHdlbGwgaWYgd2Vcblx0Ly8gZmluZCBpdCBpbiBvdXIgdGV4dCBmaWxlIG1vZGVscy4gQ3VycmVudGx5LCBvbmx5IHRleHR1YWwgZWRpdG9yc1xuXHQvLyBzdXBwb3J0IGVtYmVkZGVkIGVkaXRvcnMuXG5cdGNvbnN0IGZvY3VzZWRDb2RlRWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0aWYgKGZvY3VzZWRDb2RlRWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0ICYmICFmb2N1c2VkQ29kZUVkaXRvci5pc1NpbXBsZVdpZGdldCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gZm9jdXNlZENvZGVFZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgcmVzb3VyY2Ugb2YgdGhlIG1vZGVsIHdhcyBub3Qgc2F2ZWQgYWxyZWFkeVxuXHRcdGlmIChyZXNvdXJjZSAmJiAhZWRpdG9ycy5zb21lKCh7IGVkaXRvciB9KSA9PiBpc0VxdWFsKEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pLCByZXNvdXJjZSkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRleHRGaWxlU2VydmljZS5maWxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFtb2RlbD8uaXNSZWFkb25seSgpKSB7XG5cdFx0XHRcdGF3YWl0IHRleHRGaWxlU2VydmljZS5zYXZlKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gc2F2ZURpcnR5RWRpdG9yc09mR3JvdXBzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBncm91cHM6IHJlYWRvbmx5IElFZGl0b3JHcm91cFtdLCBvcHRpb25zPzogSVNhdmVFZGl0b3JzT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBkaXJ0eUVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdGlmIChlZGl0b3IuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdGRpcnR5RWRpdG9ycy5wdXNoKHsgZ3JvdXBJZDogZ3JvdXAuaWQsIGVkaXRvciB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZG9TYXZlRWRpdG9ycyhhY2Nlc3NvciwgZGlydHlFZGl0b3JzLCBvcHRpb25zKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9TYXZlRWRpdG9ycyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSwgb3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdHRyeSB7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5zYXZlKGVkaXRvcnMsIG9wdGlvbnMpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFt0b0FjdGlvbih7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5zYXZlRWRpdG9ycycsIGxhYmVsOiBubHMubG9jYWxpemUoJ3JldHJ5JywgXCJSZXRyeVwiKSwgcnVuOiAoKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBkb1NhdmVFZGl0b3JzKGFjY2Vzc29yLCBlZGl0b3JzLCBvcHRpb25zKSkgfSldO1xuXHRcdFx0Y29uc3QgZWRpdG9yc1RvUmV2ZXJ0ID0gZWRpdG9ycy5maWx0ZXIoKHsgZWRpdG9yIH0pID0+ICFlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkgLyogYWxsIGV4Y2VwdCB1bnRpdGxlZCB0byBwcmV2ZW50IHVuZXhwZWN0ZWQgZGF0YS1sb3NzICovKTtcblx0XHRcdGlmIChlZGl0b3JzVG9SZXZlcnQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMucmV2ZXJ0RWRpdG9ycycsIGxhYmVsOiBlZGl0b3JzVG9SZXZlcnQubGVuZ3RoID4gMSA/IG5scy5sb2NhbGl6ZSgncmV2ZXJ0QWxsJywgXCJSZXZlcnQgQWxsXCIpIDogbmxzLmxvY2FsaXplKCdyZXZlcnQnLCBcIlJldmVydFwiKSwgcnVuOiAoKSA9PiBlZGl0b3JTZXJ2aWNlLnJldmVydChlZGl0b3JzVG9SZXZlcnQpIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRpZDogZWRpdG9ycy5tYXAoKHsgZWRpdG9yIH0pID0+IGhhc2goZWRpdG9yLnJlc291cmNlPy50b1N0cmluZygpKSkuam9pbigpLCAvLyBlbnN1cmUgdW5pcXVlIG5vdGlmaWNhdGlvbiBJRCBwZXIgc2V0IG9mIGVkaXRvclxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2dlbmVyaWNTYXZlRXJyb3InLCBjb21tZW50OiBbJ3swfSBpcyB0aGUgcmVzb3VyY2UgdGhhdCBmYWlsZWQgdG8gc2F2ZSBhbmQgezF9IHRoZSBlcnJvciBtZXNzYWdlJ10gfSwgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogezF9XCIsIGVkaXRvcnMubWFwKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IuZ2V0TmFtZSgpKS5qb2luKCcsICcpLCB0b0Vycm9yTWVzc2FnZShlcnJvciwgZmFsc2UpKSxcblx0XHRcdFx0YWN0aW9uczogeyBwcmltYXJ5OiBhY3Rpb25zIH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2hlbjogdW5kZWZpbmVkLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVMsXG5cdGlkOiBTQVZFX0ZJTEVfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRyZXR1cm4gc2F2ZVNlbGVjdGVkRWRpdG9ycyhhY2Nlc3NvciwgeyByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQsIGZvcmNlOiB0cnVlIC8qIGZvcmNlIHNhdmUgZXZlbiB3aGVuIG5vbi1kaXJ0eSAqLyB9LCBhcmdzKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3aGVuOiB1bmRlZmluZWQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlTKSxcblx0d2luOiB7IHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5UykgfSxcblx0aWQ6IFNBVkVfRklMRV9XSVRIT1VUX0ZPUk1BVFRJTkdfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdHJldHVybiBzYXZlU2VsZWN0ZWRFZGl0b3JzKGFjY2Vzc29yLCB7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCwgZm9yY2U6IHRydWUgLyogZm9yY2Ugc2F2ZSBldmVuIHdoZW4gbm9uLWRpcnR5ICovLCBza2lwU2F2ZVBhcnRpY2lwYW50czogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogU0FWRV9GSUxFX0FTX0NPTU1BTkRfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiB1bmRlZmluZWQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlTLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdHJldHVybiBzYXZlU2VsZWN0ZWRFZGl0b3JzKGFjY2Vzc29yLCB7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCwgc2F2ZUFzOiB0cnVlIH0sIGFyZ3MpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdoZW46IHVuZGVmaW5lZCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UyB9LFxuXHR3aW46IHsgcHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5UykgfSxcblx0aWQ6IFNBVkVfQUxMX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRyZXR1cm4gc2F2ZURpcnR5RWRpdG9yc09mR3JvdXBzKGFjY2Vzc29yLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSksIHsgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0FWRV9BTExfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBfOiBVUkkgfCBvYmplY3QsIGVkaXRvckNvbnRleHQ6IElFZGl0b3JDb21tYW5kc0NvbnRleHQpID0+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoW2VkaXRvckNvbnRleHRdLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBlZGl0b3JHcm91cHNTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cblx0XHRsZXQgZ3JvdXBzOiByZWFkb25seSBJRWRpdG9yR3JvdXBbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIXJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdGdyb3VwcyA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Z3JvdXBzID0gcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLm1hcCgoeyBncm91cCB9KSA9PiBncm91cCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNhdmVEaXJ0eUVkaXRvcnNPZkdyb3VwcyhhY2Nlc3NvciwgZ3JvdXBzLCB7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFNBVkVfRklMRVNfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgZWRpdG9yU2VydmljZS5zYXZlQWxsKHsgaW5jbHVkZVVudGl0bGVkOiBmYWxzZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdHJldHVybiByZXMuc3VjY2Vzcztcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFJFVkVSVF9GSUxFX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Ly8gUmV0cmlldmUgc2VsZWN0ZWQgb3IgYWN0aXZlIGVkaXRvclxuXHRcdGxldCBlZGl0b3JzID0gZ2V0T3BlbkVkaXRvcnNWaWV3TXVsdGlTZWxlY3Rpb24oYWNjZXNzb3IpO1xuXHRcdGlmICghZWRpdG9ycykge1xuXHRcdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0XHRpZiAoYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGVkaXRvcnMgPSBbeyBncm91cElkOiBhY3RpdmVHcm91cC5pZCwgZWRpdG9yOiBhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IgfV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFlZGl0b3JzIHx8IGVkaXRvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdGhpbmcgdG8gcmV2ZXJ0XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2UucmV2ZXJ0KGVkaXRvcnMuZmlsdGVyKCh7IGVkaXRvciB9KSA9PiAhZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpIC8qIGFsbCBleGNlcHQgdW50aXRsZWQgKi8pLCB7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdnZW5lcmljUmV2ZXJ0RXJyb3InLCBcIkZhaWxlZCB0byByZXZlcnQgJ3swfSc6IHsxfVwiLCBlZGl0b3JzLm1hcCgoeyBlZGl0b3IgfSkgPT4gZWRpdG9yLmdldE5hbWUoKSkuam9pbignLCAnKSwgdG9FcnJvck1lc3NhZ2UoZXJyb3IsIGZhbHNlKSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFJFTU9WRV9ST09UX0ZPTERFUl9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpKS5maWx0ZXIocmVzb3VyY2UgPT5cblx0XHRcdHdvcmtzcGFjZS5mb2xkZXJzLnNvbWUoZm9sZGVyID0+IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2xkZXIudXJpLCByZXNvdXJjZSkpIC8vIE5lZWQgdG8gdmVyaWZ5IHJlc291cmNlcyBhcmUgd29ya3NwYWNlcyBzaW5jZSBtdWx0aSBzZWxlY3Rpb24gY2FuIHRyaWdnZXIgdGhpcyBjb21tYW5kIG9uIHNvbWUgbm9uIHdvcmtzcGFjZSByZXNvdXJjZXNcblx0XHQpO1xuXG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHQvLyBTaG93IGEgcGlja2VyIGZvciB0aGUgdXNlciB0byBjaG9vc2Ugd2hpY2ggZm9sZGVyIHRvIHJlbW92ZVxuXHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJlbW92ZVJvb3RGb2xkZXJBY3Rpb24uSUQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSk7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnJlbW92ZUZvbGRlcnMocmVzb3VyY2VzKTtcblx0fVxufSk7XG5cbi8vIENvbXByZXNzZWQgaXRlbSBuYXZpZ2F0aW9uXG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckNvbXByZXNzZWRGb2N1c0NvbnRleHQsIEV4cGxvcmVyQ29tcHJlc3NlZEZpcnN0Rm9jdXNDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdGlkOiBQUkVWSU9VU19DT01QUkVTU0VEX0ZPTERFUixcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdsZXQgPSBwYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblxuXHRcdGlmICh2aWV3bGV0Py5nZXRJZCgpICE9PSBWSUVXTEVUX0lEKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwbG9yZXIgPSB2aWV3bGV0LmdldFZpZXdQYW5lQ29udGFpbmVyKCkgYXMgRXhwbG9yZXJWaWV3UGFuZUNvbnRhaW5lcjtcblx0XHRjb25zdCB2aWV3ID0gZXhwbG9yZXIuZ2V0RXhwbG9yZXJWaWV3KCk7XG5cdFx0dmlldy5wcmV2aW91c0NvbXByZXNzZWRTdGF0KCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJDb21wcmVzc2VkRm9jdXNDb250ZXh0LCBFeHBsb3JlckNvbXByZXNzZWRMYXN0Rm9jdXNDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5SaWdodEFycm93LFxuXHRpZDogTkVYVF9DT01QUkVTU0VEX0ZPTERFUixcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdsZXQgPSBwYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblxuXHRcdGlmICh2aWV3bGV0Py5nZXRJZCgpICE9PSBWSUVXTEVUX0lEKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwbG9yZXIgPSB2aWV3bGV0LmdldFZpZXdQYW5lQ29udGFpbmVyKCkgYXMgRXhwbG9yZXJWaWV3UGFuZUNvbnRhaW5lcjtcblx0XHRjb25zdCB2aWV3ID0gZXhwbG9yZXIuZ2V0RXhwbG9yZXJWaWV3KCk7XG5cdFx0dmlldy5uZXh0Q29tcHJlc3NlZFN0YXQoKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckNvbXByZXNzZWRGb2N1c0NvbnRleHQsIEV4cGxvcmVyQ29tcHJlc3NlZEZpcnN0Rm9jdXNDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5Ib21lLFxuXHRpZDogRklSU1RfQ09NUFJFU1NFRF9GT0xERVIsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3bGV0ID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRpZiAodmlld2xldD8uZ2V0SWQoKSAhPT0gVklFV0xFVF9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGxvcmVyID0gdmlld2xldC5nZXRWaWV3UGFuZUNvbnRhaW5lcigpIGFzIEV4cGxvcmVyVmlld1BhbmVDb250YWluZXI7XG5cdFx0Y29uc3QgdmlldyA9IGV4cGxvcmVyLmdldEV4cGxvcmVyVmlldygpO1xuXHRcdHZpZXcuZmlyc3RDb21wcmVzc2VkU3RhdCgpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyQ29tcHJlc3NlZEZvY3VzQ29udGV4dCwgRXhwbG9yZXJDb21wcmVzc2VkTGFzdEZvY3VzQ29udGV4dC5uZWdhdGUoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuRW5kLFxuXHRpZDogTEFTVF9DT01QUkVTU0VEX0ZPTERFUixcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdsZXQgPSBwYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblxuXHRcdGlmICh2aWV3bGV0Py5nZXRJZCgpICE9PSBWSUVXTEVUX0lEKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwbG9yZXIgPSB2aWV3bGV0LmdldFZpZXdQYW5lQ29udGFpbmVyKCkgYXMgRXhwbG9yZXJWaWV3UGFuZUNvbnRhaW5lcjtcblx0XHRjb25zdCB2aWV3ID0gZXhwbG9yZXIuZ2V0RXhwbG9yZXJWaWV3KCk7XG5cdFx0dmlldy5sYXN0Q29tcHJlc3NlZFN0YXQoKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogbnVsbCxcblx0cHJpbWFyeTogaXNXZWIgPyAoaXNXaW5kb3dzID8gS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5TikgOiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleU4pIDogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU4sXG5cdHNlY29uZGFyeTogaXNXZWIgPyBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU5dIDogdW5kZWZpbmVkLFxuXHRpZDogTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogTkVXX1VOVElUTEVEX0ZJTEVfTEFCRUwsXG5cdFx0YXJnczogW1xuXHRcdFx0e1xuXHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlLFxuXHRcdFx0XHRuYW1lOiAnTmV3IFVudGl0bGVkIFRleHQgRmlsZSBhcmd1bWVudHMnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBlZGl0b3IgdmlldyB0eXBlIG9yIGxhbmd1YWdlIElEIGlmIGtub3duJyxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCd2aWV3VHlwZSc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdsYW5ndWFnZUlkJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M/OiB7IGxhbmd1YWdlSWQ/OiBzdHJpbmc7IHZpZXdUeXBlPzogc3RyaW5nIH0pID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRvdmVycmlkZTogYXJncz8udmlld1R5cGUsXG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGxhbmd1YWdlSWQ6IGFyZ3M/Lmxhbmd1YWdlSWQsXG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBORVdfRklMRV9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M/OiB7IGxhbmd1YWdlSWQ/OiBzdHJpbmc7IHZpZXdUeXBlPzogc3RyaW5nOyBmaWxlTmFtZT86IHN0cmluZyB9KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBjcmVhdGVGaWxlTG9jYWxpemVkID0gbmxzLmxvY2FsaXplKCduZXdGaWxlQ29tbWFuZC5zYXZlTGFiZWwnLCBcIkNyZWF0ZSBGaWxlXCIpO1xuXHRcdGNvbnN0IGRlZmF1bHRGaWxlVXJpID0gam9pblBhdGgoYXdhaXQgZGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKSwgYXJncz8uZmlsZU5hbWUgPz8gJ1VudGl0bGVkLnR4dCcpO1xuXG5cdFx0Y29uc3Qgc2F2ZVVyaSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coeyBzYXZlTGFiZWw6IGNyZWF0ZUZpbGVMb2NhbGl6ZWQsIHRpdGxlOiBjcmVhdGVGaWxlTG9jYWxpemVkLCBkZWZhdWx0VXJpOiBkZWZhdWx0RmlsZVVyaSB9KTtcblxuXHRcdGlmICghc2F2ZVVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUoc2F2ZVVyaSwgdW5kZWZpbmVkLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogc2F2ZVVyaSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IGFyZ3M/LnZpZXdUeXBlLFxuXHRcdFx0XHRwaW5uZWQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhcmdzPy5sYW5ndWFnZUlkLFxuXHRcdH0pO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLHdCQUFnRCx5QkFBeUIsa0JBQXFDLFlBQVksY0FBYywrQkFBK0I7QUFDaEwsU0FBUyw2QkFBNkI7QUFDdEMsU0FBOEMseUJBQWtEO0FBQ2hHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTJCLDZCQUE2QjtBQUN4RCxTQUFTLDBCQUEwQiwrQkFBK0I7QUFDbEUsU0FBUyx3QkFBd0IseUJBQXlCLFlBQVksZ0NBQWdDLHFDQUFxQyxvQ0FBb0MsNkJBQTZCLHVCQUF1QixlQUFlO0FBRWxQLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQW1DLHVCQUF1QjtBQUNuRSxTQUFzQixvQkFBb0Isc0JBQXNCO0FBQ2hFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLFFBQVEsU0FBUyxnQkFBZ0I7QUFDMUMsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QiwyQkFBMkIsa0NBQWtDLHdCQUF3QjtBQUNySCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCLGtCQUF1QztBQUNoRSxTQUFTLHNCQUFzQixtQkFBaUM7QUFDaEUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxVQUFVLFVBQVUsZUFBZTtBQUM1QyxTQUFzQixlQUFlO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMs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QUFJLElBQUk7QUFBQSxFQUNyRCxJQUFJO0FBQUEsRUFDSixVQUFVO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixNQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsWUFBWTtBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFVBQ1AsUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFlBQ2IsWUFBWTtBQUFBLGNBQ1gsUUFBUTtBQUFBLFlBQ1Q7QUFBQSxZQUNBLGNBQWM7QUFBQSxjQUNiLFFBQVE7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUNBLFNBQVMsT0FBTyxVQUFVLFNBQXNEO0FBQy9FLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFVBQU0sY0FBYyxXQUFXO0FBQUEsTUFDOUIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLFFBQ1IsVUFBVSxNQUFNO0FBQUEsUUFDaEIsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLFlBQVksTUFBTTtBQUFBLElBQ25CLENBQUM7QUFBQSxFQUNGO0FBQ0QsQ0FBQztBQUVELGlCQUFpQixnQkFBZ0I7QUFBQSxFQUNoQyxJQUFJO0FBQUEsRUFDSixTQUFTLE9BQU8sVUFBVSxTQUF5RTtBQUNsRyxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELFVBQU0sY0FBYyxTQUFTLElBQUksWUFBWTtBQUU3QyxVQUFNLHNCQUFzQixJQUFJLFNBQVMsNEJBQTRCLGFBQWE7QUFDbEYsVUFBTSxpQkFBaUIsU0FBUyxNQUFNLGNBQWMsZ0JBQWdCLEdBQUcsTUFBTSxZQUFZLGNBQWM7QUFFdkcsVUFBTSxVQUFVLE1BQU0sY0FBYyxlQUFlLEVBQUUsV0FBVyxxQkFBcUIsT0FBTyxxQkFBcUIsWUFBWSxlQUFlLENBQUM7QUFFN0ksUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksV0FBVyxTQUFTLFFBQVcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUVwRSxVQUFNLGNBQWMsV0FBVztBQUFBLE1BQzlCLFVBQVU7QUFBQSxNQUNWLFNBQVM7QUFBQSxRQUNSLFVBQVUsTUFBTTtBQUFBLFFBQ2hCLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxZQUFZLE1BQU07QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRjtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbInJlc291cmNlIiwgImFjY2Vzc29yIl0KfQo=
