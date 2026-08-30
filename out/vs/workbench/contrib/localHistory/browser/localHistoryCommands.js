import { localize, localize2 } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { Event } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IWorkingCopyHistoryService } from "../../../services/workingCopy/common/workingCopyHistory.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { LocalHistoryFileSystemProvider } from "./localHistoryFileSystemProvider.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { registerAction2, Action2, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { basename, basenameOrAuthority, dirname } from "../../../../base/common/resources.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { EditorResourceAccessor, SaveSourceRegistry, SideBySideEditor } from "../../../common/editor.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ActiveEditorContext, ResourceContextKey } from "../../../common/contextkeys.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { getLocalHistoryDateFormatter, LOCAL_HISTORY_ICON_RESTORE, LOCAL_HISTORY_MENU_CONTEXT_KEY } from "./localHistory.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
const LOCAL_HISTORY_CATEGORY = localize2("localHistory.category", "Local History");
const CTX_LOCAL_HISTORY_ENABLED = ContextKeyExpr.has("config.workbench.localHistory.enabled");
const COMPARE_WITH_FILE_LABEL = localize2("localHistory.compareWithFile", "Compare with File");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.compareWithFile",
      title: COMPARE_WITH_FILE_LABEL,
      menu: {
        id: MenuId.TimelineItemContext,
        group: "1_compare",
        order: 1,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const commandService = accessor.get(ICommandService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(entry, entry.workingCopy.resource));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.compareWithPrevious",
      title: localize2("localHistory.compareWithPrevious", "Compare with Previous"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "1_compare",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const commandService = accessor.get(ICommandService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const { entry, previous } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      if (!previous) {
        return openEntry(entry, editorService);
      }
      return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(previous, entry));
    }
  }
});
let itemSelectedForCompare = void 0;
const LocalHistoryItemSelectedForCompare = new RawContextKey("localHistoryItemSelectedForCompare", false, true);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.selectForCompare",
      title: localize2("localHistory.selectForCompare", "Select for Compare"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "2_compare_with",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const contextKeyService = accessor.get(IContextKeyService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      itemSelectedForCompare = item;
      LocalHistoryItemSelectedForCompare.bindTo(contextKeyService).set(true);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.compareWithSelected",
      title: localize2("localHistory.compareWithSelected", "Compare with Selected"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "2_compare_with",
        order: 1,
        when: ContextKeyExpr.and(LOCAL_HISTORY_MENU_CONTEXT_KEY, LocalHistoryItemSelectedForCompare)
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const commandService = accessor.get(ICommandService);
    if (!itemSelectedForCompare) {
      return;
    }
    const selectedEntry = (await findLocalHistoryEntry(workingCopyHistoryService, itemSelectedForCompare)).entry;
    if (!selectedEntry) {
      return;
    }
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(selectedEntry, entry));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.open",
      title: localize2("localHistory.open", "Show Contents"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "3_contents",
        order: 1,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      return openEntry(entry, editorService);
    }
  }
});
const RESTORE_CONTENTS_LABEL = localize2("localHistory.restore", "Restore Contents");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.restoreViaEditor",
      title: RESTORE_CONTENTS_LABEL,
      menu: {
        id: MenuId.EditorTitle,
        group: "navigation",
        order: -10,
        when: ResourceContextKey.Scheme.isEqualTo(LocalHistoryFileSystemProvider.SCHEMA)
      },
      icon: LOCAL_HISTORY_ICON_RESTORE
    });
  }
  async run(accessor, uri) {
    const { associatedResource, location } = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri);
    return restore(accessor, { uri: associatedResource, handle: basenameOrAuthority(location) });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.restore",
      title: RESTORE_CONTENTS_LABEL,
      menu: {
        id: MenuId.TimelineItemContext,
        group: "3_contents",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    return restore(accessor, item);
  }
});
const restoreSaveSource = SaveSourceRegistry.registerSource("localHistoryRestore.source", localize("localHistoryRestore.source", "File Restored"));
async function restore(accessor, item) {
  const fileService = accessor.get(IFileService);
  const dialogService = accessor.get(IDialogService);
  const workingCopyService = accessor.get(IWorkingCopyService);
  const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
  const editorService = accessor.get(IEditorService);
  const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
  if (entry) {
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("confirmRestoreMessage", "Do you want to restore the contents of '{0}'?", basename(entry.workingCopy.resource)),
      detail: localize("confirmRestoreDetail", "Restoring will discard any unsaved changes."),
      primaryButton: localize({ key: "restoreButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Restore")
    });
    if (!confirmed) {
      return;
    }
    const workingCopies = workingCopyService.getAll(entry.workingCopy.resource);
    if (workingCopies) {
      for (const workingCopy of workingCopies) {
        if (workingCopy.isDirty()) {
          await workingCopy.revert({ soft: true });
        }
      }
    }
    try {
      await fileService.cloneFile(entry.location, entry.workingCopy.resource);
    } catch (error) {
      await dialogService.error(localize("unableToRestore", "Unable to restore '{0}'.", basename(entry.workingCopy.resource)), toErrorMessage(error));
      return;
    }
    if (workingCopies) {
      for (const workingCopy of workingCopies) {
        await workingCopy.revert({ force: true });
      }
    }
    await editorService.openEditor({ resource: entry.workingCopy.resource });
    await workingCopyHistoryService.addEntry({
      resource: entry.workingCopy.resource,
      source: restoreSaveSource
    }, CancellationToken.None);
    await closeEntry(entry, editorService);
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.restoreViaPicker",
      title: localize2("localHistory.restoreViaPicker", "Find Entry to Restore"),
      f1: true,
      category: LOCAL_HISTORY_CATEGORY,
      precondition: CTX_LOCAL_HISTORY_ENABLED
    });
  }
  async run(accessor) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const quickInputService = accessor.get(IQuickInputService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const labelService = accessor.get(ILabelService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const commandService = accessor.get(ICommandService);
    const historyService = accessor.get(IHistoryService);
    const resourcePickerDisposables = new DisposableStore();
    const resourcePicker = resourcePickerDisposables.add(quickInputService.createQuickPick());
    let cts = new CancellationTokenSource();
    resourcePickerDisposables.add(resourcePicker.onDidHide(() => cts.dispose(true)));
    resourcePicker.busy = true;
    resourcePicker.show();
    const resources = new ResourceSet(await workingCopyHistoryService.getAll(cts.token));
    const recentEditorResources = new ResourceSet(coalesce(historyService.getHistory().map(({ resource: resource2 }) => resource2)));
    const resourcesSortedByRecency = [];
    for (const resource2 of recentEditorResources) {
      if (resources.has(resource2)) {
        resourcesSortedByRecency.push(resource2);
        resources.delete(resource2);
      }
    }
    resourcesSortedByRecency.push(...[...resources].sort((r1, r2) => r1.fsPath < r2.fsPath ? -1 : 1));
    resourcePicker.busy = false;
    resourcePicker.placeholder = localize("restoreViaPicker.filePlaceholder", "Select the file to show local history for");
    resourcePicker.matchOnLabel = true;
    resourcePicker.matchOnDescription = true;
    resourcePicker.items = [...resourcesSortedByRecency].map((resource2) => ({
      resource: resource2,
      label: basenameOrAuthority(resource2),
      description: labelService.getUriLabel(dirname(resource2), { relative: true }),
      iconClasses: getIconClasses(modelService, languageService, resource2)
    }));
    await Event.toPromise(resourcePicker.onDidAccept);
    resourcePickerDisposables.dispose();
    const resource = resourcePicker.selectedItems.at(0)?.resource;
    if (!resource) {
      return;
    }
    const entryPickerDisposables = new DisposableStore();
    const entryPicker = entryPickerDisposables.add(quickInputService.createQuickPick());
    cts = new CancellationTokenSource();
    entryPickerDisposables.add(entryPicker.onDidHide(() => cts.dispose(true)));
    entryPicker.busy = true;
    entryPicker.show();
    const entries = await workingCopyHistoryService.getEntries(resource, cts.token);
    entryPicker.busy = false;
    entryPicker.canAcceptInBackground = true;
    entryPicker.placeholder = localize("restoreViaPicker.entryPlaceholder", "Select the local history entry to open");
    entryPicker.matchOnLabel = true;
    entryPicker.matchOnDescription = true;
    entryPicker.items = Array.from(entries).reverse().map((entry) => ({
      entry,
      label: `$(circle-outline) ${SaveSourceRegistry.getSourceLabel(entry.source)}`,
      description: toLocalHistoryEntryDateLabel(entry.timestamp)
    }));
    entryPickerDisposables.add(entryPicker.onDidAccept(async (e) => {
      if (!e.inBackground) {
        entryPickerDisposables.dispose();
      }
      const selectedItem = entryPicker.selectedItems.at(0);
      if (!selectedItem) {
        return;
      }
      const resourceExists = await fileService.exists(selectedItem.entry.workingCopy.resource);
      if (resourceExists) {
        return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(selectedItem.entry, selectedItem.entry.workingCopy.resource, { preserveFocus: e.inBackground }));
      }
      return openEntry(selectedItem.entry, editorService, { preserveFocus: e.inBackground });
    }));
  }
});
MenuRegistry.appendMenuItem(MenuId.TimelineTitle, { command: { id: "workbench.action.localHistory.restoreViaPicker", title: localize2("localHistory.restoreViaPickerMenu", "Local History: Find Entry to Restore...") }, group: "submenu", order: 1, when: CTX_LOCAL_HISTORY_ENABLED });
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.rename",
      title: localize2("localHistory.rename", "Rename"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "5_edit",
        order: 1,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const quickInputService = accessor.get(IQuickInputService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      const disposables = new DisposableStore();
      const inputBox = disposables.add(quickInputService.createInputBox());
      inputBox.title = localize("renameLocalHistoryEntryTitle", "Rename Local History Entry");
      inputBox.ignoreFocusOut = true;
      inputBox.placeholder = localize("renameLocalHistoryPlaceholder", "Enter the new name of the local history entry");
      inputBox.value = SaveSourceRegistry.getSourceLabel(entry.source);
      inputBox.show();
      disposables.add(inputBox.onDidAccept(() => {
        if (inputBox.value) {
          workingCopyHistoryService.updateEntry(entry, { source: inputBox.value }, CancellationToken.None);
        }
        disposables.dispose();
      }));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.delete",
      title: localize2("localHistory.delete", "Delete"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "5_edit",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const dialogService = accessor.get(IDialogService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      const { confirmed } = await dialogService.confirm({
        type: "warning",
        message: localize("confirmDeleteMessage", "Do you want to delete the local history entry of '{0}' from {1}?", entry.workingCopy.name, toLocalHistoryEntryDateLabel(entry.timestamp)),
        detail: localize("confirmDeleteDetail", "This action is irreversible!"),
        primaryButton: localize({ key: "deleteButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Delete")
      });
      if (!confirmed) {
        return;
      }
      await workingCopyHistoryService.removeEntry(entry, CancellationToken.None);
      await closeEntry(entry, editorService);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.deleteAll",
      title: localize2("localHistory.deleteAll", "Delete All"),
      f1: true,
      category: LOCAL_HISTORY_CATEGORY,
      precondition: CTX_LOCAL_HISTORY_ENABLED
    });
  }
  async run(accessor) {
    const dialogService = accessor.get(IDialogService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("confirmDeleteAllMessage", "Do you want to delete all entries of all files in local history?"),
      detail: localize("confirmDeleteAllDetail", "This action is irreversible!"),
      primaryButton: localize({ key: "deleteAllButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Delete All")
    });
    if (!confirmed) {
      return;
    }
    await workingCopyHistoryService.removeAll(CancellationToken.None);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.create",
      title: localize2("localHistory.create", "Create Entry"),
      f1: true,
      category: LOCAL_HISTORY_CATEGORY,
      precondition: ContextKeyExpr.and(CTX_LOCAL_HISTORY_ENABLED, ActiveEditorContext)
    });
  }
  async run(accessor) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const quickInputService = accessor.get(IQuickInputService);
    const editorService = accessor.get(IEditorService);
    const labelService = accessor.get(ILabelService);
    const pathService = accessor.get(IPathService);
    const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource?.scheme !== pathService.defaultUriScheme && resource?.scheme !== Schemas.vscodeUserData) {
      return;
    }
    const disposables = new DisposableStore();
    const inputBox = disposables.add(quickInputService.createInputBox());
    inputBox.title = localize("createLocalHistoryEntryTitle", "Create Local History Entry");
    inputBox.ignoreFocusOut = true;
    inputBox.placeholder = localize("createLocalHistoryPlaceholder", "Enter the new name of the local history entry for '{0}'", labelService.getUriBasenameLabel(resource));
    inputBox.show();
    disposables.add(inputBox.onDidAccept(async () => {
      const entrySource = inputBox.value;
      disposables.dispose();
      if (entrySource) {
        await workingCopyHistoryService.addEntry({ resource, source: inputBox.value }, CancellationToken.None);
      }
    }));
  }
});
async function openEntry(entry, editorService, options) {
  const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });
  await editorService.openEditor({
    resource,
    label: localize("localHistoryEditorLabel", "{0} ({1} \u2022 {2})", entry.workingCopy.name, SaveSourceRegistry.getSourceLabel(entry.source), toLocalHistoryEntryDateLabel(entry.timestamp)),
    options
  });
}
async function closeEntry(entry, editorService) {
  const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });
  const editors = editorService.findEditors(resource, { supportSideBySide: SideBySideEditor.ANY });
  await editorService.closeEditors(editors, { preserveFocus: true });
}
function toDiffEditorArguments(arg1, arg2, options) {
  const originalResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: arg1.location, associatedResource: arg1.workingCopy.resource });
  let label;
  let modifiedResource;
  if (URI.isUri(arg2)) {
    const resource = arg2;
    modifiedResource = resource;
    label = localize("localHistoryCompareToFileEditorLabel", "{0} ({1} \u2022 {2}) \u2194 {3}", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), toLocalHistoryEntryDateLabel(arg1.timestamp), arg1.workingCopy.name);
  } else {
    const modified = arg2;
    modifiedResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: modified.location, associatedResource: modified.workingCopy.resource });
    label = localize("localHistoryCompareToPreviousEditorLabel", "{0} ({1} \u2022 {2}) \u2194 {3} ({4} \u2022 {5})", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), toLocalHistoryEntryDateLabel(arg1.timestamp), modified.workingCopy.name, SaveSourceRegistry.getSourceLabel(modified.source), toLocalHistoryEntryDateLabel(modified.timestamp));
  }
  return [
    originalResource,
    modifiedResource,
    label,
    options ? [void 0, options] : void 0
  ];
}
async function findLocalHistoryEntry(workingCopyHistoryService, descriptor) {
  let uri = descriptor.uri;
  if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
    uri = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
  }
  const entries = await workingCopyHistoryService.getEntries(uri, CancellationToken.None);
  let currentEntry = void 0;
  let previousEntry = void 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.id === descriptor.handle) {
      currentEntry = entry;
      previousEntry = entries[i - 1];
      break;
    }
  }
  return {
    entry: currentEntry,
    previous: previousEntry
  };
}
const SEP = /\//g;
function toLocalHistoryEntryDateLabel(timestamp) {
  return `${getLocalHistoryDateFormatter().format(timestamp).replace(SEP, "-")}`;
}
export {
  COMPARE_WITH_FILE_LABEL,
  findLocalHistoryEntry,
  toDiffEditorArguments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxvY2FsSGlzdG9yeVxcYnJvd3NlclxcbG9jYWxIaXN0b3J5Q29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5SGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi9sb2NhbEhpc3RvcnlGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGJhc2VuYW1lT3JBdXRob3JpdHksIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNhdmVTb3VyY2VSZWdpc3RyeSwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGdldExvY2FsSGlzdG9yeURhdGVGb3JtYXR0ZXIsIExPQ0FMX0hJU1RPUllfSUNPTl9SRVNUT1JFLCBMT0NBTF9ISVNUT1JZX01FTlVfQ09OVEVYVF9LRVkgfSBmcm9tICcuL2xvY2FsSGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcblxuY29uc3QgTE9DQUxfSElTVE9SWV9DQVRFR09SWSA9IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LmNhdGVnb3J5JywgJ0xvY2FsIEhpc3RvcnknKTtcbmNvbnN0IENUWF9MT0NBTF9ISVNUT1JZX0VOQUJMRUQgPSBDb250ZXh0S2V5RXhwci5oYXMoJ2NvbmZpZy53b3JrYmVuY2gubG9jYWxIaXN0b3J5LmVuYWJsZWQnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQge1xuXHR1cmk6IFVSSTtcblx0aGFuZGxlOiBzdHJpbmc7XG59XG5cbi8vI3JlZ2lvbiBDb21wYXJlIHdpdGggRmlsZVxuXG5leHBvcnQgY29uc3QgQ09NUEFSRV9XSVRIX0ZJTEVfTEFCRUwgPSBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5jb21wYXJlV2l0aEZpbGUnLCAnQ29tcGFyZSB3aXRoIEZpbGUnKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkuY29tcGFyZVdpdGhGaWxlJyxcblx0XHRcdHRpdGxlOiBDT01QQVJFX1dJVEhfRklMRV9MQUJFTCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UaW1lbGluZUl0ZW1Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfY29tcGFyZScsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBMT0NBTF9ISVNUT1JZX01FTlVfQ09OVEVYVF9LRVlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGl0ZW06IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSk7XG5cblx0XHRjb25zdCB7IGVudHJ5IH0gPSBhd2FpdCBmaW5kTG9jYWxIaXN0b3J5RW50cnkod29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgaXRlbSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgLi4udG9EaWZmRWRpdG9yQXJndW1lbnRzKGVudHJ5LCBlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQ29tcGFyZSB3aXRoIFByZXZpb3VzXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LmNvbXBhcmVXaXRoUHJldmlvdXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LmNvbXBhcmVXaXRoUHJldmlvdXMnLCAnQ29tcGFyZSB3aXRoIFByZXZpb3VzJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2NvbXBhcmUnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpdGVtOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyBlbnRyeSwgcHJldmlvdXMgfSA9IGF3YWl0IGZpbmRMb2NhbEhpc3RvcnlFbnRyeSh3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBpdGVtKTtcblx0XHRpZiAoZW50cnkpIHtcblxuXHRcdFx0Ly8gV2l0aG91dCBhIHByZXZpb3VzIGVudHJ5LCBqdXN0IHNob3cgdGhlIGVudHJ5IGRpcmVjdGx5XG5cdFx0XHRpZiAoIXByZXZpb3VzKSB7XG5cdFx0XHRcdHJldHVybiBvcGVuRW50cnkoZW50cnksIGVkaXRvclNlcnZpY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPcGVuIHJlYWwgZGlmZiBlZGl0b3Jcblx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELCAuLi50b0RpZmZFZGl0b3JBcmd1bWVudHMocHJldmlvdXMsIGVudHJ5KSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTZWxlY3QgZm9yIENvbXBhcmUgLyBDb21wYXJlIHdpdGggU2VsZWN0ZWRcblxubGV0IGl0ZW1TZWxlY3RlZEZvckNvbXBhcmU6IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuY29uc3QgTG9jYWxIaXN0b3J5SXRlbVNlbGVjdGVkRm9yQ29tcGFyZSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsb2NhbEhpc3RvcnlJdGVtU2VsZWN0ZWRGb3JDb21wYXJlJywgZmFsc2UsIHRydWUpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5zZWxlY3RGb3JDb21wYXJlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5zZWxlY3RGb3JDb21wYXJlJywgJ1NlbGVjdCBmb3IgQ29tcGFyZScpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jb21wYXJlX3dpdGgnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpdGVtOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyBlbnRyeSB9ID0gYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW0pO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0aXRlbVNlbGVjdGVkRm9yQ29tcGFyZSA9IGl0ZW07XG5cdFx0XHRMb2NhbEhpc3RvcnlJdGVtU2VsZWN0ZWRGb3JDb21wYXJlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LmNvbXBhcmVXaXRoU2VsZWN0ZWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LmNvbXBhcmVXaXRoU2VsZWN0ZWQnLCAnQ29tcGFyZSB3aXRoIFNlbGVjdGVkJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2NvbXBhcmVfd2l0aCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZLCBMb2NhbEhpc3RvcnlJdGVtU2VsZWN0ZWRGb3JDb21wYXJlKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGlmICghaXRlbVNlbGVjdGVkRm9yQ29tcGFyZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkRW50cnkgPSAoYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW1TZWxlY3RlZEZvckNvbXBhcmUpKS5lbnRyeTtcblx0XHRpZiAoIXNlbGVjdGVkRW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGVudHJ5IH0gPSBhd2FpdCBmaW5kTG9jYWxIaXN0b3J5RW50cnkod29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgaXRlbSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgLi4udG9EaWZmRWRpdG9yQXJndW1lbnRzKHNlbGVjdGVkRW50cnksIGVudHJ5KSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTaG93IENvbnRlbnRzXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5Lm9wZW4nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5Lm9wZW4nLCAnU2hvdyBDb250ZW50cycpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19jb250ZW50cycsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBMT0NBTF9ISVNUT1JZX01FTlVfQ09OVEVYVF9LRVlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGl0ZW06IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyBlbnRyeSB9ID0gYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW0pO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0cmV0dXJuIG9wZW5FbnRyeShlbnRyeSwgZWRpdG9yU2VydmljZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jcmVnaW9uIFJlc3RvcmUgQ29udGVudHNcblxuY29uc3QgUkVTVE9SRV9DT05URU5UU19MQUJFTCA9IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LnJlc3RvcmUnLCAnUmVzdG9yZSBDb250ZW50cycpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5yZXN0b3JlVmlhRWRpdG9yJyxcblx0XHRcdHRpdGxlOiBSRVNUT1JFX0NPTlRFTlRTX0xBQkVMLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEwLFxuXHRcdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhMb2NhbEhpc3RvcnlGaWxlU3lzdGVtUHJvdmlkZXIuU0NIRU1BKVxuXHRcdFx0fSxcblx0XHRcdGljb246IExPQ0FMX0hJU1RPUllfSUNPTl9SRVNUT1JFXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB1cmk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgYXNzb2NpYXRlZFJlc291cmNlLCBsb2NhdGlvbiB9ID0gTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLmZyb21Mb2NhbEhpc3RvcnlGaWxlU3lzdGVtKHVyaSk7XG5cblx0XHRyZXR1cm4gcmVzdG9yZShhY2Nlc3NvciwgeyB1cmk6IGFzc29jaWF0ZWRSZXNvdXJjZSwgaGFuZGxlOiBiYXNlbmFtZU9yQXV0aG9yaXR5KGxvY2F0aW9uKSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LnJlc3RvcmUnLFxuXHRcdFx0dGl0bGU6IFJFU1RPUkVfQ09OVEVOVFNfTEFCRUwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX2NvbnRlbnRzJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IExPQ0FMX0hJU1RPUllfTUVOVV9DT05URVhUX0tFWVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHJlc3RvcmUoYWNjZXNzb3IsIGl0ZW0pO1xuXHR9XG59KTtcblxuY29uc3QgcmVzdG9yZVNhdmVTb3VyY2UgPSBTYXZlU291cmNlUmVnaXN0cnkucmVnaXN0ZXJTb3VyY2UoJ2xvY2FsSGlzdG9yeVJlc3RvcmUuc291cmNlJywgbG9jYWxpemUoJ2xvY2FsSGlzdG9yeVJlc3RvcmUuc291cmNlJywgXCJGaWxlIFJlc3RvcmVkXCIpKTtcblxuYXN5bmMgZnVuY3Rpb24gcmVzdG9yZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRjb25zdCB3b3JraW5nQ29weVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5U2VydmljZSk7XG5cdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRjb25zdCB7IGVudHJ5IH0gPSBhd2FpdCBmaW5kTG9jYWxIaXN0b3J5RW50cnkod29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgaXRlbSk7XG5cdGlmIChlbnRyeSkge1xuXG5cdFx0Ly8gQXNrIGZvciBjb25maXJtYXRpb25cblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtUmVzdG9yZU1lc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIHJlc3RvcmUgdGhlIGNvbnRlbnRzIG9mICd7MH0nP1wiLCBiYXNlbmFtZShlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSkpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybVJlc3RvcmVEZXRhaWwnLCBcIlJlc3RvcmluZyB3aWxsIGRpc2NhcmQgYW55IHVuc2F2ZWQgY2hhbmdlcy5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3Jlc3RvcmVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlc3RvcmVcIilcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmV2ZXJ0IGFsbCBkaXJ0eSB3b3JraW5nIGNvcGllcyBmb3IgdGFyZ2V0XG5cdFx0Y29uc3Qgd29ya2luZ0NvcGllcyA9IHdvcmtpbmdDb3B5U2VydmljZS5nZXRBbGwoZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UpO1xuXHRcdGlmICh3b3JraW5nQ29waWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtpbmdDb3B5IG9mIHdvcmtpbmdDb3BpZXMpIHtcblx0XHRcdFx0aWYgKHdvcmtpbmdDb3B5LmlzRGlydHkoKSkge1xuXHRcdFx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJldmVydCh7IHNvZnQ6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXBsYWNlIHRhcmdldCB3aXRoIGNvbnRlbnRzIG9mIGhpc3RvcnkgZW50cnlcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY2xvbmVGaWxlKGVudHJ5LmxvY2F0aW9uLCBlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gSXQgaXMgcG9zc2libGUgdGhhdCB3ZSBmYWlsIHRvIGNvcHkgdGhlIGhpc3RvcnkgZW50cnkgdG8gdGhlXG5cdFx0XHQvLyBkZXN0aW5hdGlvbiwgZm9yIGV4YW1wbGUgd2hlbiB0aGUgZGVzdGluYXRpb24gaXMgd3JpdGUgcHJvdGVjdGVkLlxuXHRcdFx0Ly8gSW4gdGhhdCBjYXNlIHRlbGwgdGhlIHVzZXIgYW5kIHJldHVybiwgaXQgaXMgc3RpbGwgcG9zc2libGUgZm9yXG5cdFx0XHQvLyB0aGUgdXNlciB0byBtYW51YWxseSBjb3B5IHRoZSBjaGFuZ2VzIG92ZXIgZnJvbSB0aGUgZGlmZiBlZGl0b3IuXG5cblx0XHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3VuYWJsZVRvUmVzdG9yZScsIFwiVW5hYmxlIHRvIHJlc3RvcmUgJ3swfScuXCIsIGJhc2VuYW1lKGVudHJ5LndvcmtpbmdDb3B5LnJlc291cmNlKSksIHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIGFsbCB3b3JraW5nIGNvcGllcyBmb3IgdGFyZ2V0XG5cdFx0aWYgKHdvcmtpbmdDb3BpZXMpIHtcblx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2Ygd29ya2luZ0NvcGllcykge1xuXHRcdFx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXZlcnQoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPcGVuIHRhcmdldFxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSB9KTtcblxuXHRcdC8vIEFkZCBuZXcgZW50cnlcblx0XHRhd2FpdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdHJlc291cmNlOiBlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSxcblx0XHRcdHNvdXJjZTogcmVzdG9yZVNhdmVTb3VyY2Vcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIENsb3NlIHNvdXJjZVxuXHRcdGF3YWl0IGNsb3NlRW50cnkoZW50cnksIGVkaXRvclNlcnZpY2UpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LnJlc3RvcmVWaWFQaWNrZXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LnJlc3RvcmVWaWFQaWNrZXInLCAnRmluZCBFbnRyeSB0byBSZXN0b3JlJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBMT0NBTF9ISVNUT1JZX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDVFhfTE9DQUxfSElTVE9SWV9FTkFCTEVEXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdC8vIFNob3cgYWxsIHJlc291cmNlcyB3aXRoIGFzc29jaWF0ZWQgaGlzdG9yeSBlbnRyaWVzIGluIHBpY2tlclxuXHRcdC8vIHdpdGggcHJvZ3Jlc3MgYmVjYXVzZSB0aGlzIG9wZXJhdGlvbiB3aWxsIHRha2UgbG9uZ2VyIHRoZSBtb3JlXG5cdFx0Ly8gZmlsZXMgaGF2ZSBiZWVuIHNhdmVkIG92ZXJhbGwuXG5cdFx0Ly9cblx0XHQvLyBTb3J0IHRoZSByZXNvdXJjZXMgYnkgaGlzdG9yeSB0byBwdXQgbW9yZSByZWxldmFudCBlbnRyaWVzXG5cdFx0Ly8gdG8gdGhlIHRvcC5cblxuXHRcdGNvbnN0IHJlc291cmNlUGlja2VyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VQaWNrZXIgPSByZXNvdXJjZVBpY2tlckRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0gJiB7IHJlc291cmNlOiBVUkkgfT4oKSk7XG5cblx0XHRsZXQgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0cmVzb3VyY2VQaWNrZXJEaXNwb3NhYmxlcy5hZGQocmVzb3VyY2VQaWNrZXIub25EaWRIaWRlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRyZXNvdXJjZVBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRyZXNvdXJjZVBpY2tlci5zaG93KCk7XG5cblx0XHRjb25zdCByZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VTZXQoYXdhaXQgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5nZXRBbGwoY3RzLnRva2VuKSk7XG5cdFx0Y29uc3QgcmVjZW50RWRpdG9yUmVzb3VyY2VzID0gbmV3IFJlc291cmNlU2V0KGNvYWxlc2NlKGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoKS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4gcmVzb3VyY2UpKSk7XG5cblx0XHRjb25zdCByZXNvdXJjZXNTb3J0ZWRCeVJlY2VuY3k6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZWNlbnRFZGl0b3JSZXNvdXJjZXMpIHtcblx0XHRcdGlmIChyZXNvdXJjZXMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXNvdXJjZXNTb3J0ZWRCeVJlY2VuY3kucHVzaChyZXNvdXJjZSk7XG5cdFx0XHRcdHJlc291cmNlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXNvdXJjZXNTb3J0ZWRCeVJlY2VuY3kucHVzaCguLi5bLi4ucmVzb3VyY2VzXS5zb3J0KChyMSwgcjIpID0+IHIxLmZzUGF0aCA8IHIyLmZzUGF0aCA/IC0xIDogMSkpO1xuXG5cdFx0cmVzb3VyY2VQaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdHJlc291cmNlUGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3Jlc3RvcmVWaWFQaWNrZXIuZmlsZVBsYWNlaG9sZGVyJywgXCJTZWxlY3QgdGhlIGZpbGUgdG8gc2hvdyBsb2NhbCBoaXN0b3J5IGZvclwiKTtcblx0XHRyZXNvdXJjZVBpY2tlci5tYXRjaE9uTGFiZWwgPSB0cnVlO1xuXHRcdHJlc291cmNlUGlja2VyLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cmVzb3VyY2VQaWNrZXIuaXRlbXMgPSBbLi4ucmVzb3VyY2VzU29ydGVkQnlSZWNlbmN5XS5tYXAocmVzb3VyY2UgPT4gKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6IGJhc2VuYW1lT3JBdXRob3JpdHkocmVzb3VyY2UpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHJlc291cmNlKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgcmVzb3VyY2UpXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHJlc291cmNlUGlja2VyLm9uRGlkQWNjZXB0KTtcblx0XHRyZXNvdXJjZVBpY2tlckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VQaWNrZXIuc2VsZWN0ZWRJdGVtcy5hdCgwKT8ucmVzb3VyY2U7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgYWxsIGVudHJpZXMgZm9yIHRoZSBwaWNrZWQgcmVzb3VyY2UgaW4gYW5vdGhlciBwaWNrZXJcblx0XHQvLyBhbmQgb3BlbiB0aGUgZW50cnkgaW4gdGhlIGVuZCB0aGF0IHdhcyBzZWxlY3RlZCBieSB0aGUgdXNlclxuXG5cdFx0Y29uc3QgZW50cnlQaWNrZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbnRyeVBpY2tlciA9IGVudHJ5UGlja2VyRGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSAmIHsgZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB9PigpKTtcblxuXHRcdGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGVudHJ5UGlja2VyRGlzcG9zYWJsZXMuYWRkKGVudHJ5UGlja2VyLm9uRGlkSGlkZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0ZW50cnlQaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0ZW50cnlQaWNrZXIuc2hvdygpO1xuXG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UuZ2V0RW50cmllcyhyZXNvdXJjZSwgY3RzLnRva2VuKTtcblxuXHRcdGVudHJ5UGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRlbnRyeVBpY2tlci5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdGVudHJ5UGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3Jlc3RvcmVWaWFQaWNrZXIuZW50cnlQbGFjZWhvbGRlcicsIFwiU2VsZWN0IHRoZSBsb2NhbCBoaXN0b3J5IGVudHJ5IHRvIG9wZW5cIik7XG5cdFx0ZW50cnlQaWNrZXIubWF0Y2hPbkxhYmVsID0gdHJ1ZTtcblx0XHRlbnRyeVBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdGVudHJ5UGlja2VyLml0ZW1zID0gQXJyYXkuZnJvbShlbnRyaWVzKS5yZXZlcnNlKCkubWFwKGVudHJ5ID0+ICh7XG5cdFx0XHRlbnRyeSxcblx0XHRcdGxhYmVsOiBgJChjaXJjbGUtb3V0bGluZSkgJHtTYXZlU291cmNlUmVnaXN0cnkuZ2V0U291cmNlTGFiZWwoZW50cnkuc291cmNlKX1gLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRvTG9jYWxIaXN0b3J5RW50cnlEYXRlTGFiZWwoZW50cnkudGltZXN0YW1wKVxuXHRcdH0pKTtcblxuXHRcdGVudHJ5UGlja2VyRGlzcG9zYWJsZXMuYWRkKGVudHJ5UGlja2VyLm9uRGlkQWNjZXB0KGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKCFlLmluQmFja2dyb3VuZCkge1xuXHRcdFx0XHRlbnRyeVBpY2tlckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gZW50cnlQaWNrZXIuc2VsZWN0ZWRJdGVtcy5hdCgwKTtcblx0XHRcdGlmICghc2VsZWN0ZWRJdGVtKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VFeGlzdHMgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc2VsZWN0ZWRJdGVtLmVudHJ5LndvcmtpbmdDb3B5LnJlc291cmNlKTtcblx0XHRcdGlmIChyZXNvdXJjZUV4aXN0cykge1xuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgLi4udG9EaWZmRWRpdG9yQXJndW1lbnRzKHNlbGVjdGVkSXRlbS5lbnRyeSwgc2VsZWN0ZWRJdGVtLmVudHJ5LndvcmtpbmdDb3B5LnJlc291cmNlLCB7IHByZXNlcnZlRm9jdXM6IGUuaW5CYWNrZ3JvdW5kIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG9wZW5FbnRyeShzZWxlY3RlZEl0ZW0uZW50cnksIGVkaXRvclNlcnZpY2UsIHsgcHJlc2VydmVGb2N1czogZS5pbkJhY2tncm91bmQgfSk7XG5cdFx0fSkpO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UaW1lbGluZVRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5yZXN0b3JlVmlhUGlja2VyJywgdGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LnJlc3RvcmVWaWFQaWNrZXJNZW51JywgJ0xvY2FsIEhpc3Rvcnk6IEZpbmQgRW50cnkgdG8gUmVzdG9yZS4uLicpIH0sIGdyb3VwOiAnc3VibWVudScsIG9yZGVyOiAxLCB3aGVuOiBDVFhfTE9DQUxfSElTVE9SWV9FTkFCTEVEIH0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFJlbmFtZVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5yZW5hbWUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LnJlbmFtZScsICdSZW5hbWUnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UaW1lbGluZUl0ZW1Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzVfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBMT0NBTF9ISVNUT1JZX01FTlVfQ09OVEVYVF9LRVlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGl0ZW06IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRjb25zdCB7IGVudHJ5IH0gPSBhd2FpdCBmaW5kTG9jYWxIaXN0b3J5RW50cnkod29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgaXRlbSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGlucHV0Qm94ID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZUlucHV0Qm94KCkpO1xuXHRcdFx0aW5wdXRCb3gudGl0bGUgPSBsb2NhbGl6ZSgncmVuYW1lTG9jYWxIaXN0b3J5RW50cnlUaXRsZScsIFwiUmVuYW1lIExvY2FsIEhpc3RvcnkgRW50cnlcIik7XG5cdFx0XHRpbnB1dEJveC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRpbnB1dEJveC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdyZW5hbWVMb2NhbEhpc3RvcnlQbGFjZWhvbGRlcicsIFwiRW50ZXIgdGhlIG5ldyBuYW1lIG9mIHRoZSBsb2NhbCBoaXN0b3J5IGVudHJ5XCIpO1xuXHRcdFx0aW5wdXRCb3gudmFsdWUgPSBTYXZlU291cmNlUmVnaXN0cnkuZ2V0U291cmNlTGFiZWwoZW50cnkuc291cmNlKTtcblx0XHRcdGlucHV0Qm94LnNob3coKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGlmIChpbnB1dEJveC52YWx1ZSkge1xuXHRcdFx0XHRcdHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UudXBkYXRlRW50cnkoZW50cnksIHsgc291cmNlOiBpbnB1dEJveC52YWx1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBEZWxldGVcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkuZGVsZXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5kZWxldGUnLCAnRGVsZXRlJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICc1X2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpdGVtOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHsgZW50cnkgfSA9IGF3YWl0IGZpbmRMb2NhbEhpc3RvcnlFbnRyeSh3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBpdGVtKTtcblx0XHRpZiAoZW50cnkpIHtcblxuXHRcdFx0Ly8gQXNrIGZvciBjb25maXJtYXRpb25cblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlTWVzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gZGVsZXRlIHRoZSBsb2NhbCBoaXN0b3J5IGVudHJ5IG9mICd7MH0nIGZyb20gezF9P1wiLCBlbnRyeS53b3JraW5nQ29weS5uYW1lLCB0b0xvY2FsSGlzdG9yeUVudHJ5RGF0ZUxhYmVsKGVudHJ5LnRpbWVzdGFtcCkpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlRGV0YWlsJywgXCJUaGlzIGFjdGlvbiBpcyBpcnJldmVyc2libGUhXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ2RlbGV0ZUJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGVsZXRlXCIpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIHZpYSBzZXJ2aWNlXG5cdFx0XHRhd2FpdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLnJlbW92ZUVudHJ5KGVudHJ5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gQ2xvc2UgYW55IG9wZW5lZCBlZGl0b3JzXG5cdFx0XHRhd2FpdCBjbG9zZUVudHJ5KGVudHJ5LCBlZGl0b3JTZXJ2aWNlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIERlbGV0ZSBBbGxcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkuZGVsZXRlQWxsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5kZWxldGVBbGwnLCAnRGVsZXRlIEFsbCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogTE9DQUxfSElTVE9SWV9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ1RYX0xPQ0FMX0hJU1RPUllfRU5BQkxFRFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Ly8gQXNrIGZvciBjb25maXJtYXRpb25cblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlQWxsTWVzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gZGVsZXRlIGFsbCBlbnRyaWVzIG9mIGFsbCBmaWxlcyBpbiBsb2NhbCBoaXN0b3J5P1wiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVBbGxEZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGlzIGlycmV2ZXJzaWJsZSFcIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ2RlbGV0ZUFsbEJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGVsZXRlIEFsbFwiKSxcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHZpYSBzZXJ2aWNlXG5cdFx0YXdhaXQgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5yZW1vdmVBbGwoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIENyZWF0ZVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5jcmVhdGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbG9jYWxIaXN0b3J5LmNyZWF0ZScsICdDcmVhdGUgRW50cnknKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IExPQ0FMX0hJU1RPUllfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDVFhfTE9DQUxfSElTVE9SWV9FTkFCTEVELCBBY3RpdmVFZGl0b3JDb250ZXh0KVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IHBhdGhTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYXRoU2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRpZiAocmVzb3VyY2U/LnNjaGVtZSAhPT0gcGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSAmJiByZXNvdXJjZT8uc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVVzZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgZW5hYmxlIGZvciBzZWxlY3RlZCBzY2hlbWVzXG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlSW5wdXRCb3goKSk7XG5cdFx0aW5wdXRCb3gudGl0bGUgPSBsb2NhbGl6ZSgnY3JlYXRlTG9jYWxIaXN0b3J5RW50cnlUaXRsZScsIFwiQ3JlYXRlIExvY2FsIEhpc3RvcnkgRW50cnlcIik7XG5cdFx0aW5wdXRCb3guaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdGlucHV0Qm94LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NyZWF0ZUxvY2FsSGlzdG9yeVBsYWNlaG9sZGVyJywgXCJFbnRlciB0aGUgbmV3IG5hbWUgb2YgdGhlIGxvY2FsIGhpc3RvcnkgZW50cnkgZm9yICd7MH0nXCIsIGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlKSk7XG5cdFx0aW5wdXRCb3guc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeVNvdXJjZSA9IGlucHV0Qm94LnZhbHVlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0XHRpZiAoZW50cnlTb3VyY2UpIHtcblx0XHRcdFx0YXdhaXQgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5hZGRFbnRyeSh7IHJlc291cmNlLCBzb3VyY2U6IGlucHV0Qm94LnZhbHVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSGVscGVyc1xuXG5hc3luYyBmdW5jdGlvbiBvcGVuRW50cnkoZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCByZXNvdXJjZSA9IExvY2FsSGlzdG9yeUZpbGVTeXN0ZW1Qcm92aWRlci50b0xvY2FsSGlzdG9yeUZpbGVTeXN0ZW0oeyBsb2NhdGlvbjogZW50cnkubG9jYXRpb24sIGFzc29jaWF0ZWRSZXNvdXJjZTogZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UgfSk7XG5cblx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRyZXNvdXJjZSxcblx0XHRsYWJlbDogbG9jYWxpemUoJ2xvY2FsSGlzdG9yeUVkaXRvckxhYmVsJywgXCJ7MH0gKHsxfSBcdTIwMjIgezJ9KVwiLCBlbnRyeS53b3JraW5nQ29weS5uYW1lLCBTYXZlU291cmNlUmVnaXN0cnkuZ2V0U291cmNlTGFiZWwoZW50cnkuc291cmNlKSwgdG9Mb2NhbEhpc3RvcnlFbnRyeURhdGVMYWJlbChlbnRyeS50aW1lc3RhbXApKSxcblx0XHRvcHRpb25zXG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjbG9zZUVudHJ5KGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHJlc291cmNlID0gTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLnRvTG9jYWxIaXN0b3J5RmlsZVN5c3RlbSh7IGxvY2F0aW9uOiBlbnRyeS5sb2NhdGlvbiwgYXNzb2NpYXRlZFJlc291cmNlOiBlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSB9KTtcblxuXHRjb25zdCBlZGl0b3JzID0gZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyhyZXNvdXJjZSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSk7XG5cdGF3YWl0IGVkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3JzKGVkaXRvcnMsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvRGlmZkVkaXRvckFyZ3VtZW50cyhlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCByZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMpOiB1bmtub3duW107XG5leHBvcnQgZnVuY3Rpb24gdG9EaWZmRWRpdG9yQXJndW1lbnRzKHByZXZpb3VzRW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogdW5rbm93bltdO1xuZXhwb3J0IGZ1bmN0aW9uIHRvRGlmZkVkaXRvckFyZ3VtZW50cyhhcmcxOiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIGFyZzI6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB8IFVSSSwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogdW5rbm93bltdIHtcblxuXHQvLyBMZWZ0IGhhbmQgc2lkZSBpcyBhbHdheXMgYSB3b3JraW5nIGNvcHkgaGlzdG9yeSBlbnRyeVxuXHRjb25zdCBvcmlnaW5hbFJlc291cmNlID0gTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLnRvTG9jYWxIaXN0b3J5RmlsZVN5c3RlbSh7IGxvY2F0aW9uOiBhcmcxLmxvY2F0aW9uLCBhc3NvY2lhdGVkUmVzb3VyY2U6IGFyZzEud29ya2luZ0NvcHkucmVzb3VyY2UgfSk7XG5cblx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cblx0Ly8gUmlnaHQgaGFuZCBzaWRlIGRlcGVuZHMgb24gaG93IHRoZSBtZXRob2Qgd2FzIGNhbGxlZFxuXHQvLyBhbmQgaXMgZWl0aGVyIGFub3RoZXIgd29ya2luZyBjb3B5IGhpc3RvcnkgZW50cnlcblx0Ly8gb3IgdGhlIGZpbGUgb24gZGlzay5cblxuXHRsZXQgbW9kaWZpZWRSZXNvdXJjZTogVVJJO1xuXG5cdC8vIENvbXBhcmUgd2l0aCBmaWxlIG9uIGRpc2tcblx0aWYgKFVSSS5pc1VyaShhcmcyKSkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gYXJnMjtcblxuXHRcdG1vZGlmaWVkUmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHRsYWJlbCA9IGxvY2FsaXplKCdsb2NhbEhpc3RvcnlDb21wYXJlVG9GaWxlRWRpdG9yTGFiZWwnLCBcInswfSAoezF9IFx1MjAyMiB7Mn0pIFx1MjE5NCB7M31cIiwgYXJnMS53b3JraW5nQ29weS5uYW1lLCBTYXZlU291cmNlUmVnaXN0cnkuZ2V0U291cmNlTGFiZWwoYXJnMS5zb3VyY2UpLCB0b0xvY2FsSGlzdG9yeUVudHJ5RGF0ZUxhYmVsKGFyZzEudGltZXN0YW1wKSwgYXJnMS53b3JraW5nQ29weS5uYW1lKTtcblx0fVxuXG5cdC8vIENvbXBhcmUgd2l0aCBhbm90aGVyIGVudHJ5XG5cdGVsc2Uge1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gYXJnMjtcblxuXHRcdG1vZGlmaWVkUmVzb3VyY2UgPSBMb2NhbEhpc3RvcnlGaWxlU3lzdGVtUHJvdmlkZXIudG9Mb2NhbEhpc3RvcnlGaWxlU3lzdGVtKHsgbG9jYXRpb246IG1vZGlmaWVkLmxvY2F0aW9uLCBhc3NvY2lhdGVkUmVzb3VyY2U6IG1vZGlmaWVkLndvcmtpbmdDb3B5LnJlc291cmNlIH0pO1xuXHRcdGxhYmVsID0gbG9jYWxpemUoJ2xvY2FsSGlzdG9yeUNvbXBhcmVUb1ByZXZpb3VzRWRpdG9yTGFiZWwnLCBcInswfSAoezF9IFx1MjAyMiB7Mn0pIFx1MjE5NCB7M30gKHs0fSBcdTIwMjIgezV9KVwiLCBhcmcxLndvcmtpbmdDb3B5Lm5hbWUsIFNhdmVTb3VyY2VSZWdpc3RyeS5nZXRTb3VyY2VMYWJlbChhcmcxLnNvdXJjZSksIHRvTG9jYWxIaXN0b3J5RW50cnlEYXRlTGFiZWwoYXJnMS50aW1lc3RhbXApLCBtb2RpZmllZC53b3JraW5nQ29weS5uYW1lLCBTYXZlU291cmNlUmVnaXN0cnkuZ2V0U291cmNlTGFiZWwobW9kaWZpZWQuc291cmNlKSwgdG9Mb2NhbEhpc3RvcnlFbnRyeURhdGVMYWJlbChtb2RpZmllZC50aW1lc3RhbXApKTtcblx0fVxuXG5cdHJldHVybiBbXG5cdFx0b3JpZ2luYWxSZXNvdXJjZSxcblx0XHRtb2RpZmllZFJlc291cmNlLFxuXHRcdGxhYmVsLFxuXHRcdG9wdGlvbnMgPyBbdW5kZWZpbmVkLCBvcHRpb25zXSA6IHVuZGVmaW5lZFxuXHRdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2U6IElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBkZXNjcmlwdG9yOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHsgZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB8IHVuZGVmaW5lZDsgcHJldmlvdXM6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB8IHVuZGVmaW5lZCB9PiB7XG5cblx0Ly8gV2hlbiB0aGUgcmVzb3VyY2UgVVJJIHVzZXMgdGhlIGB2c2NvZGUtbG9jYWwtaGlzdG9yeWAgc2NoZW1lIChlLmcuXG5cdC8vIHdoZW4gdHJpZ2dlcmVkIGZyb20gdGhlIGRpZmYgZWRpdG9yKSwgbWFwIGl0IGJhY2sgdG8gdGhlIG9yaWdpbmFsXG5cdC8vIGZpbGUgVVJJIHNvIHRoYXQgdGhlIGhpc3Rvcnkgc2VydmljZSBjYW4gZmluZCBtYXRjaGluZyBlbnRyaWVzLlxuXHRsZXQgdXJpID0gZGVzY3JpcHRvci51cmk7XG5cdGlmICh1cmkuc2NoZW1lID09PSBMb2NhbEhpc3RvcnlGaWxlU3lzdGVtUHJvdmlkZXIuU0NIRU1BKSB7XG5cdFx0dXJpID0gTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLmZyb21Mb2NhbEhpc3RvcnlGaWxlU3lzdGVtKHVyaSkuYXNzb2NpYXRlZFJlc291cmNlO1xuXHR9XG5cblx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UuZ2V0RW50cmllcyh1cmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdGxldCBjdXJyZW50RW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGV0IHByZXZpb3VzRW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2ldO1xuXG5cdFx0aWYgKGVudHJ5LmlkID09PSBkZXNjcmlwdG9yLmhhbmRsZSkge1xuXHRcdFx0Y3VycmVudEVudHJ5ID0gZW50cnk7XG5cdFx0XHRwcmV2aW91c0VudHJ5ID0gZW50cmllc1tpIC0gMV07XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGVudHJ5OiBjdXJyZW50RW50cnksXG5cdFx0cHJldmlvdXM6IHByZXZpb3VzRW50cnlcblx0fTtcbn1cblxuY29uc3QgU0VQID0gL1xcLy9nO1xuZnVuY3Rpb24gdG9Mb2NhbEhpc3RvcnlFbnRyeURhdGVMYWJlbCh0aW1lc3RhbXA6IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiBgJHtnZXRMb2NhbEhpc3RvcnlEYXRlRm9ybWF0dGVyKCkuZm9ybWF0KHRpbWVzdGFtcCkucmVwbGFjZShTRVAsICctJyl9YDsgLy8gcHJlc2VydmluZyBgL2Agd2lsbCBicmVhayBlZGl0b3IgbGFiZWxzLCBzbyByZXBsYWNlIGl0IHdpdGggYSBub24tcGF0aCBzeW1ib2xcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFtQyxrQ0FBa0M7QUFDckUsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxnQkFBZ0Isb0JBQW9CLHFCQUFxQjtBQUVsRSxTQUFTLGlCQUFpQixTQUFTLFFBQVEsb0JBQW9CO0FBQy9ELFNBQVMsVUFBVSxxQkFBcUIsZUFBZTtBQUN2RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QixvQkFBb0Isd0JBQXdCO0FBQzdFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJC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
