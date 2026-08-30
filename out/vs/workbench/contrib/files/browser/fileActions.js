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
import * as nls from "../../../../nls.js";
import { isWindows, OS } from "../../../../base/common/platform.js";
import { extname, basename, isAbsolute } from "../../../../base/common/path.js";
import * as resources from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Action } from "../../../../base/common/actions.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { VIEWLET_ID, VIEW_ID, UndoConfirmLevel } from "../common/files.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IQuickInputService, ItemActivation } from "../../../../platform/quickinput/common/quickInput.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { REVEAL_IN_EXPLORER_COMMAND_ID, SAVE_ALL_IN_GROUP_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID } from "./fileConstants.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Schemas } from "../../../../base/common/network.js";
import { IDialogService, getFileNamesMessage } from "../../../../platform/dialogs/common/dialogs.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Constants } from "../../../../base/common/uint.js";
import { CLOSE_EDITORS_AND_GROUP_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { NewExplorerItem } from "../common/explorerModel.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { triggerUpload } from "../../../../base/browser/dom.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { timeout } from "../../../../base/common/async.js";
import { IWorkingCopyFileService } from "../../../services/workingCopy/common/workingCopyFileService.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { trim, rtrim } from "../../../../base/common/strings.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ResourceFileEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { IExplorerService } from "./files.js";
import { BrowserFileUpload, FileDownload } from "./fileImportExport.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { ActiveEditorCanToggleReadonlyContext, ActiveEditorContext, EmptyWorkspaceSupportContext, IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
const NEW_FILE_COMMAND_ID = "explorer.newFile";
const NEW_FILE_LABEL = nls.localize2("newFile", "New File...");
const NEW_FOLDER_COMMAND_ID = "explorer.newFolder";
const NEW_FOLDER_LABEL = nls.localize2("newFolder", "New Folder...");
const TRIGGER_RENAME_LABEL = nls.localize("rename", "Rename...");
const MOVE_FILE_TO_TRASH_LABEL = nls.localize("delete", "Delete");
const COPY_FILE_LABEL = nls.localize("copyFile", "Copy");
const PASTE_FILE_LABEL = nls.localize("pasteFile", "Paste");
const FileCopiedContext = new RawContextKey("fileCopied", false);
const DOWNLOAD_COMMAND_ID = "explorer.download";
const DOWNLOAD_LABEL = nls.localize("download", "Download...");
const UPLOAD_COMMAND_ID = "explorer.upload";
const UPLOAD_LABEL = nls.localize("upload", "Upload...");
const CONFIRM_DELETE_SETTING_KEY = "explorer.confirmDelete";
const MAX_UNDO_FILE_SIZE = 5e6;
async function refreshIfSeparator(value, explorerService) {
  if (value && (value.indexOf("/") >= 0 || value.indexOf("\\") >= 0)) {
    await explorerService.refresh();
  }
}
async function deleteFiles(explorerService, workingCopyFileService, dialogService, configurationService, filesConfigurationService, elements, useTrash, skipConfirm = false, ignoreIfNotExists = false) {
  let primaryButton;
  if (useTrash) {
    primaryButton = isWindows ? nls.localize("deleteButtonLabelRecycleBin", "&&Move to Recycle Bin") : nls.localize({ key: "deleteButtonLabelTrash", comment: ["&& denotes a mnemonic"] }, "&&Move to Trash");
  } else {
    primaryButton = nls.localize({ key: "deleteButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Delete");
  }
  const distinctElements = resources.distinctParents(elements, (e) => e.resource);
  const dirtyWorkingCopies = /* @__PURE__ */ new Set();
  for (const distinctElement of distinctElements) {
    for (const dirtyWorkingCopy of workingCopyFileService.getDirty(distinctElement.resource)) {
      dirtyWorkingCopies.add(dirtyWorkingCopy);
    }
  }
  if (dirtyWorkingCopies.size) {
    let message;
    if (distinctElements.length > 1) {
      message = nls.localize("dirtyMessageFilesDelete", "You are deleting files with unsaved changes. Do you want to continue?");
    } else if (distinctElements[0].isDirectory) {
      if (dirtyWorkingCopies.size === 1) {
        message = nls.localize("dirtyMessageFolderOneDelete", "You are deleting a folder {0} with unsaved changes in 1 file. Do you want to continue?", distinctElements[0].name);
      } else {
        message = nls.localize("dirtyMessageFolderDelete", "You are deleting a folder {0} with unsaved changes in {1} files. Do you want to continue?", distinctElements[0].name, dirtyWorkingCopies.size);
      }
    } else {
      message = nls.localize("dirtyMessageFileDelete", "You are deleting {0} with unsaved changes. Do you want to continue?", distinctElements[0].name);
    }
    const response = await dialogService.confirm({
      type: "warning",
      message,
      detail: nls.localize("dirtyWarning", "Your changes will be lost if you don't save them."),
      primaryButton
    });
    if (!response.confirmed) {
      return;
    } else {
      skipConfirm = true;
    }
  }
  if (!skipConfirm) {
    const readonlyResources = distinctElements.filter((e) => filesConfigurationService.isReadonly(e.resource));
    if (readonlyResources.length) {
      let message;
      if (readonlyResources.length > 1) {
        message = nls.localize("readonlyMessageFilesDelete", "You are deleting files that are configured to be read-only. Do you want to continue?");
      } else if (readonlyResources[0].isDirectory) {
        message = nls.localize("readonlyMessageFolderOneDelete", "You are deleting a folder {0} that is configured to be read-only. Do you want to continue?", distinctElements[0].name);
      } else {
        message = nls.localize("readonlyMessageFolderDelete", "You are deleting a file {0} that is configured to be read-only. Do you want to continue?", distinctElements[0].name);
      }
      const response = await dialogService.confirm({
        type: "warning",
        message,
        detail: nls.localize("continueDetail", "The read-only protection will be overridden if you continue."),
        primaryButton: nls.localize("continueButtonLabel", "Continue")
      });
      if (!response.confirmed) {
        return;
      }
    }
  }
  let confirmation;
  const deleteDetail = distinctElements.some((e) => e.isDirectory) ? nls.localize("irreversible", "This action is irreversible!") : distinctElements.length > 1 ? nls.localize("restorePlural", "You can restore these files using the Undo command.") : nls.localize("restore", "You can restore this file using the Undo command.");
  if (skipConfirm || configurationService.getValue(CONFIRM_DELETE_SETTING_KEY) === false) {
    confirmation = { confirmed: true };
  } else if (useTrash) {
    let { message, detail } = getMoveToTrashMessage(distinctElements);
    detail += detail ? "\n" : "";
    if (isWindows) {
      detail += distinctElements.length > 1 ? nls.localize("undoBinFiles", "You can restore these files from the Recycle Bin.") : nls.localize("undoBin", "You can restore this file from the Recycle Bin.");
    } else {
      detail += distinctElements.length > 1 ? nls.localize("undoTrashFiles", "You can restore these files from the Trash.") : nls.localize("undoTrash", "You can restore this file from the Trash.");
    }
    confirmation = await dialogService.confirm({
      message,
      detail,
      primaryButton,
      checkbox: {
        label: nls.localize("doNotAskAgain", "Do not ask me again")
      }
    });
  } else {
    let { message, detail } = getDeleteMessage(distinctElements);
    detail += detail ? "\n" : "";
    detail += deleteDetail;
    confirmation = await dialogService.confirm({
      type: "warning",
      message,
      detail,
      primaryButton
    });
  }
  if (confirmation.confirmed && confirmation.checkboxChecked === true) {
    await configurationService.updateValue(CONFIRM_DELETE_SETTING_KEY, false);
  }
  if (!confirmation.confirmed) {
    return;
  }
  try {
    const resourceFileEdits = distinctElements.map((e) => new ResourceFileEdit(e.resource, void 0, { recursive: true, folder: e.isDirectory, ignoreIfNotExists, skipTrashBin: !useTrash, maxSize: MAX_UNDO_FILE_SIZE }));
    const options = {
      undoLabel: distinctElements.length > 1 ? nls.localize({ key: "deleteBulkEdit", comment: ["Placeholder will be replaced by the number of files deleted"] }, "Delete {0} files", distinctElements.length) : nls.localize({ key: "deleteFileBulkEdit", comment: ["Placeholder will be replaced by the name of the file deleted"] }, "Delete {0}", distinctElements[0].name),
      progressLabel: distinctElements.length > 1 ? nls.localize({ key: "deletingBulkEdit", comment: ["Placeholder will be replaced by the number of files deleted"] }, "Deleting {0} files", distinctElements.length) : nls.localize({ key: "deletingFileBulkEdit", comment: ["Placeholder will be replaced by the name of the file deleted"] }, "Deleting {0}", distinctElements[0].name)
    };
    await explorerService.applyBulkEdit(resourceFileEdits, options);
  } catch (error) {
    let errorMessage;
    let detailMessage;
    let primaryButton2;
    if (useTrash) {
      errorMessage = isWindows ? nls.localize("binFailed", "Failed to delete using the Recycle Bin. Do you want to permanently delete instead?") : nls.localize("trashFailed", "Failed to delete using the Trash. Do you want to permanently delete instead?");
      detailMessage = deleteDetail;
      primaryButton2 = nls.localize({ key: "deletePermanentlyButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Delete Permanently");
    } else {
      errorMessage = toErrorMessage(error, false);
      primaryButton2 = nls.localize({ key: "retryButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Retry");
    }
    const res = await dialogService.confirm({
      type: "warning",
      message: errorMessage,
      detail: detailMessage,
      primaryButton: primaryButton2
    });
    if (res.confirmed) {
      if (useTrash) {
        useTrash = false;
      }
      skipConfirm = true;
      ignoreIfNotExists = true;
      return deleteFiles(explorerService, workingCopyFileService, dialogService, configurationService, filesConfigurationService, elements, useTrash, skipConfirm, ignoreIfNotExists);
    }
  }
}
function getMoveToTrashMessage(distinctElements) {
  if (containsBothDirectoryAndFile(distinctElements)) {
    return {
      message: nls.localize("confirmMoveTrashMessageFilesAndDirectories", "Are you sure you want to delete the following {0} files/directories and their contents?", distinctElements.length),
      detail: getFileNamesMessage(distinctElements.map((e) => e.resource))
    };
  }
  if (distinctElements.length > 1) {
    if (distinctElements[0].isDirectory) {
      return {
        message: nls.localize("confirmMoveTrashMessageMultipleDirectories", "Are you sure you want to delete the following {0} directories and their contents?", distinctElements.length),
        detail: getFileNamesMessage(distinctElements.map((e) => e.resource))
      };
    }
    return {
      message: nls.localize("confirmMoveTrashMessageMultiple", "Are you sure you want to delete the following {0} files?", distinctElements.length),
      detail: getFileNamesMessage(distinctElements.map((e) => e.resource))
    };
  }
  if (distinctElements[0].isDirectory && !distinctElements[0].isSymbolicLink) {
    return { message: nls.localize("confirmMoveTrashMessageFolder", "Are you sure you want to delete '{0}' and its contents?", distinctElements[0].name), detail: "" };
  }
  return { message: nls.localize("confirmMoveTrashMessageFile", "Are you sure you want to delete '{0}'?", distinctElements[0].name), detail: "" };
}
function getDeleteMessage(distinctElements) {
  if (containsBothDirectoryAndFile(distinctElements)) {
    return {
      message: nls.localize("confirmDeleteMessageFilesAndDirectories", "Are you sure you want to permanently delete the following {0} files/directories and their contents?", distinctElements.length),
      detail: getFileNamesMessage(distinctElements.map((e) => e.resource))
    };
  }
  if (distinctElements.length > 1) {
    if (distinctElements[0].isDirectory) {
      return {
        message: nls.localize("confirmDeleteMessageMultipleDirectories", "Are you sure you want to permanently delete the following {0} directories and their contents?", distinctElements.length),
        detail: getFileNamesMessage(distinctElements.map((e) => e.resource))
      };
    }
    return {
      message: nls.localize("confirmDeleteMessageMultiple", "Are you sure you want to permanently delete the following {0} files?", distinctElements.length),
      detail: getFileNamesMessage(distinctElements.map((e) => e.resource))
    };
  }
  if (distinctElements[0].isDirectory) {
    return { message: nls.localize("confirmDeleteMessageFolder", "Are you sure you want to permanently delete '{0}' and its contents?", distinctElements[0].name), detail: "" };
  }
  return { message: nls.localize("confirmDeleteMessageFile", "Are you sure you want to permanently delete '{0}'?", distinctElements[0].name), detail: "" };
}
function containsBothDirectoryAndFile(distinctElements) {
  const directory = distinctElements.find((element) => element.isDirectory);
  const file = distinctElements.find((element) => !element.isDirectory);
  return !!directory && !!file;
}
async function findValidPasteFileTarget(explorerService, fileService, dialogService, targetFolder, fileToPaste, incrementalNaming) {
  let name = typeof fileToPaste.resource === "string" ? fileToPaste.resource : resources.basenameOrAuthority(fileToPaste.resource);
  let candidate = resources.joinPath(targetFolder.resource, name);
  if (incrementalNaming === "disabled") {
    const canOverwrite = await askForOverwrite(fileService, dialogService, candidate);
    if (!canOverwrite) {
      return;
    }
  }
  while (!fileToPaste.allowOverwrite) {
    if (!explorerService.findClosest(candidate)) {
      break;
    }
    if (incrementalNaming !== "disabled") {
      name = incrementFileName(name, !!fileToPaste.isDirectory, incrementalNaming);
    }
    candidate = resources.joinPath(targetFolder.resource, name);
  }
  return candidate;
}
function incrementFileName(name, isFolder, incrementalNaming) {
  if (incrementalNaming === "simple") {
    let namePrefix = name;
    let extSuffix = "";
    if (!isFolder) {
      extSuffix = extname(name);
      namePrefix = basename(name, extSuffix);
    }
    const suffixRegex = /^(.+ copy)( \d+)?$/;
    if (suffixRegex.test(namePrefix)) {
      return namePrefix.replace(suffixRegex, (match, g1, g2) => {
        const number = g2 ? parseInt(g2) : 1;
        return number === 0 ? `${g1}` : number < Constants.MAX_SAFE_SMALL_INTEGER ? `${g1} ${number + 1}` : `${g1}${g2} copy`;
      }) + extSuffix;
    }
    return `${namePrefix} copy${extSuffix}`;
  }
  const separators = "[\\.\\-_]";
  const maxNumber = Constants.MAX_SAFE_SMALL_INTEGER;
  const suffixFileRegex = RegExp("(.*" + separators + ")(\\d+)(\\..*)$");
  if (!isFolder && name.match(suffixFileRegex)) {
    return name.replace(suffixFileRegex, (match, g1, g2, g3) => {
      const number = parseInt(g2);
      return number < maxNumber ? g1 + String(number + 1).padStart(g2.length, "0") + g3 : `${g1}${g2}.1${g3}`;
    });
  }
  const prefixFileRegex = RegExp("(\\d+)(" + separators + ".*)(\\..*)$");
  if (!isFolder && name.match(prefixFileRegex)) {
    return name.replace(prefixFileRegex, (match, g1, g2, g3) => {
      const number = parseInt(g1);
      return number < maxNumber ? String(number + 1).padStart(g1.length, "0") + g2 + g3 : `${g1}${g2}.1${g3}`;
    });
  }
  const prefixFileNoNameRegex = RegExp("(\\d+)(\\..*)$");
  if (!isFolder && name.match(prefixFileNoNameRegex)) {
    return name.replace(prefixFileNoNameRegex, (match, g1, g2) => {
      const number = parseInt(g1);
      return number < maxNumber ? String(number + 1).padStart(g1.length, "0") + g2 : `${g1}.1${g2}`;
    });
  }
  const lastIndexOfDot = name.lastIndexOf(".");
  if (!isFolder && lastIndexOfDot >= 0) {
    return `${name.substr(0, lastIndexOfDot)}.1${name.substr(lastIndexOfDot)}`;
  }
  const noNameNoExtensionRegex = RegExp("(\\d+)$");
  if (!isFolder && lastIndexOfDot === -1 && name.match(noNameNoExtensionRegex)) {
    return name.replace(noNameNoExtensionRegex, (match, g1) => {
      const number = parseInt(g1);
      return number < maxNumber ? String(number + 1).padStart(g1.length, "0") : `${g1}.1`;
    });
  }
  const noExtensionRegex = RegExp("(.*)(\\d*)$");
  if (!isFolder && lastIndexOfDot === -1 && name.match(noExtensionRegex)) {
    return name.replace(noExtensionRegex, (match, g1, g2) => {
      let number = parseInt(g2);
      if (isNaN(number)) {
        number = 0;
      }
      return number < maxNumber ? g1 + String(number + 1).padStart(g2.length, "0") : `${g1}${g2}.1`;
    });
  }
  if (isFolder && name.match(/(\d+)$/)) {
    return name.replace(/(\d+)$/, (match, ...groups) => {
      const number = parseInt(groups[0]);
      return number < maxNumber ? String(number + 1).padStart(groups[0].length, "0") : `${groups[0]}.1`;
    });
  }
  if (isFolder && name.match(/^(\d+)/)) {
    return name.replace(/^(\d+)(.*)$/, (match, ...groups) => {
      const number = parseInt(groups[0]);
      return number < maxNumber ? String(number + 1).padStart(groups[0].length, "0") + groups[1] : `${groups[0]}${groups[1]}.1`;
    });
  }
  return `${name}.1`;
}
async function askForOverwrite(fileService, dialogService, targetResource) {
  const exists = await fileService.exists(targetResource);
  if (!exists) {
    return true;
  }
  const { confirmed } = await dialogService.confirm({
    type: Severity.Warning,
    message: nls.localize("confirmOverwrite", "A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?", basename(targetResource.path)),
    primaryButton: nls.localize("replaceButtonLabel", "&&Replace")
  });
  return confirmed;
}
const _GlobalCompareResourcesAction = class _GlobalCompareResourcesAction extends Action2 {
  constructor() {
    super({
      id: _GlobalCompareResourcesAction.ID,
      title: _GlobalCompareResourcesAction.LABEL,
      f1: true,
      category: Categories.File,
      precondition: ContextKeyExpr.and(ActiveEditorContext, IsSessionsWindowContext.negate()),
      metadata: {
        description: nls.localize2("compareFileWithMeta", "Opens a picker to select a file to diff with the active editor.")
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const textModelService = accessor.get(ITextModelService);
    const quickInputService = accessor.get(IQuickInputService);
    const activeInput = editorService.activeEditor;
    const activeResource = EditorResourceAccessor.getOriginalUri(activeInput);
    if (activeResource && textModelService.canHandleResource(activeResource)) {
      const picks = await quickInputService.quickAccess.pick("", { itemActivation: ItemActivation.SECOND });
      if (picks?.length === 1) {
        const resource = picks[0].resource;
        if (URI.isUri(resource) && textModelService.canHandleResource(resource)) {
          editorService.openEditor({
            original: { resource: activeResource },
            modified: { resource },
            options: { pinned: true }
          });
        }
      }
    }
  }
};
_GlobalCompareResourcesAction.ID = "workbench.files.action.compareFileWith";
_GlobalCompareResourcesAction.LABEL = nls.localize2("globalCompareFile", "Compare Active File With...");
let GlobalCompareResourcesAction = _GlobalCompareResourcesAction;
const _ToggleAutoSaveAction = class _ToggleAutoSaveAction extends Action2 {
  constructor() {
    super({
      id: _ToggleAutoSaveAction.ID,
      title: nls.localize2("toggleAutoSave", "Toggle Auto Save"),
      f1: true,
      category: Categories.File,
      precondition: IsSessionsWindowContext.negate(),
      metadata: { description: nls.localize2("toggleAutoSaveDescription", "Toggle the ability to save files automatically after typing") }
    });
  }
  run(accessor) {
    const filesConfigurationService = accessor.get(IFilesConfigurationService);
    return filesConfigurationService.toggleAutoSave();
  }
};
_ToggleAutoSaveAction.ID = "workbench.action.toggleAutoSave";
let ToggleAutoSaveAction = _ToggleAutoSaveAction;
let BaseSaveAllAction = class extends Action {
  constructor(id, label, commandService, notificationService, workingCopyService) {
    super(id, label);
    this.commandService = commandService;
    this.notificationService = notificationService;
    this.workingCopyService = workingCopyService;
    this.lastDirtyState = this.workingCopyService.hasDirty;
    this.enabled = this.lastDirtyState;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.workingCopyService.onDidChangeDirty((workingCopy) => this.updateEnablement(workingCopy)));
  }
  updateEnablement(workingCopy) {
    const hasDirty = workingCopy.isDirty() || this.workingCopyService.hasDirty;
    if (this.lastDirtyState !== hasDirty) {
      this.enabled = hasDirty;
      this.lastDirtyState = this.enabled;
    }
  }
  async run(context) {
    try {
      await this.doRun(context);
    } catch (error) {
      this.notificationService.error(toErrorMessage(error, false));
    }
  }
};
BaseSaveAllAction = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IWorkingCopyService)
], BaseSaveAllAction);
class SaveAllInGroupAction extends BaseSaveAllAction {
  get class() {
    return "explorer-action " + ThemeIcon.asClassName(Codicon.saveAll);
  }
  doRun(context) {
    return this.commandService.executeCommand(SAVE_ALL_IN_GROUP_COMMAND_ID, {}, context);
  }
}
SaveAllInGroupAction.ID = "workbench.files.action.saveAllInGroup";
SaveAllInGroupAction.LABEL = nls.localize("saveAllInGroup", "Save All in Group");
let CloseGroupAction = class extends Action {
  constructor(id, label, commandService) {
    super(id, label, ThemeIcon.asClassName(Codicon.closeAll));
    this.commandService = commandService;
  }
  run(context) {
    return this.commandService.executeCommand(CLOSE_EDITORS_AND_GROUP_COMMAND_ID, {}, context);
  }
};
CloseGroupAction.ID = "workbench.files.action.closeGroup";
CloseGroupAction.LABEL = nls.localize("closeGroup", "Close Group");
CloseGroupAction = __decorateClass([
  __decorateParam(2, ICommandService)
], CloseGroupAction);
const _FocusFilesExplorer = class _FocusFilesExplorer extends Action2 {
  constructor() {
    super({
      id: _FocusFilesExplorer.ID,
      title: _FocusFilesExplorer.LABEL,
      f1: true,
      category: Categories.File,
      precondition: IsSessionsWindowContext.negate(),
      metadata: {
        description: nls.localize2("focusFilesExplorerMetadata", "Moves focus to the file explorer view container.")
      }
    });
  }
  async run(accessor) {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    await paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
  }
};
_FocusFilesExplorer.ID = "workbench.files.action.focusFilesExplorer";
_FocusFilesExplorer.LABEL = nls.localize2("focusFilesExplorer", "Focus on Files Explorer");
let FocusFilesExplorer = _FocusFilesExplorer;
const _ShowActiveFileInExplorer = class _ShowActiveFileInExplorer extends Action2 {
  constructor() {
    super({
      id: _ShowActiveFileInExplorer.ID,
      title: _ShowActiveFileInExplorer.LABEL,
      f1: true,
      category: Categories.File,
      precondition: IsSessionsWindowContext.negate(),
      metadata: {
        description: nls.localize2("showInExplorerMetadata", "Reveals and selects the active file within the explorer view.")
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const editorService = accessor.get(IEditorService);
    const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource) {
      commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, resource);
    }
  }
};
_ShowActiveFileInExplorer.ID = "workbench.files.action.showActiveFileInExplorer";
_ShowActiveFileInExplorer.LABEL = nls.localize2("showInExplorer", "Reveal Active File in Explorer View");
let ShowActiveFileInExplorer = _ShowActiveFileInExplorer;
const _OpenActiveFileInEmptyWorkspace = class _OpenActiveFileInEmptyWorkspace extends Action2 {
  constructor() {
    super({
      id: _OpenActiveFileInEmptyWorkspace.ID,
      title: _OpenActiveFileInEmptyWorkspace.LABEL,
      f1: true,
      category: Categories.File,
      precondition: ContextKeyExpr.and(EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate()),
      metadata: {
        description: nls.localize2("openFileInEmptyWorkspaceMetadata", "Opens the active editor in a new window with no folders open.")
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const hostService = accessor.get(IHostService);
    const dialogService = accessor.get(IDialogService);
    const fileService = accessor.get(IFileService);
    const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (fileResource && fileService.hasProvider(fileResource)) {
      hostService.openWindow([{ fileUri: fileResource }], { forceNewWindow: true });
    } else {
      dialogService.error(nls.localize("openFileToShowInNewWindow.unsupportedschema", "The active editor must contain an openable resource."));
    }
  }
};
_OpenActiveFileInEmptyWorkspace.ID = "workbench.action.files.showOpenedFileInNewWindow";
_OpenActiveFileInEmptyWorkspace.LABEL = nls.localize2("openFileInEmptyWorkspace", "Open Active Editor in New Empty Workspace");
let OpenActiveFileInEmptyWorkspace = _OpenActiveFileInEmptyWorkspace;
function validateFileName(pathService, item, name, os) {
  name = getWellFormedFileName(name);
  if (!name || name.length === 0 || /^\s+$/.test(name)) {
    return {
      content: nls.localize("emptyFileNameError", "A file or folder name must be provided."),
      severity: Severity.Error
    };
  }
  if (name[0] === "/" || name[0] === "\\") {
    return {
      content: nls.localize("fileNameStartsWithSlashError", "A file or folder name cannot start with a slash."),
      severity: Severity.Error
    };
  }
  const names = coalesce(name.split(/[\\/]/));
  const parent = item.parent;
  if (name !== item.name) {
    const child = parent?.getChild(name);
    if (child && child !== item) {
      return {
        content: nls.localize("fileNameExistsError", "A file or folder **{0}** already exists at this location. Please choose a different name.", name),
        severity: Severity.Error
      };
    }
  }
  if (names.some((folderName) => !pathService.hasValidBasename(item.resource, os, folderName))) {
    const escapedName = name.replace(/\*/g, "\\*");
    return {
      content: nls.localize("invalidFileNameError", "The name **{0}** is not valid as a file or folder name. Please choose a different name.", trimLongName(escapedName)),
      severity: Severity.Error
    };
  }
  if (names.some((name2) => /^\s|\s$/.test(name2))) {
    return {
      content: nls.localize("fileNameWhitespaceWarning", "Leading or trailing whitespace detected in file or folder name."),
      severity: Severity.Warning
    };
  }
  return null;
}
function trimLongName(name) {
  if (name?.length > 255) {
    return `${name.substr(0, 255)}...`;
  }
  return name;
}
function getWellFormedFileName(filename) {
  if (!filename) {
    return filename;
  }
  filename = trim(filename, "	");
  filename = rtrim(filename, "/");
  filename = rtrim(filename, "\\");
  return filename;
}
const _CompareNewUntitledTextFilesAction = class _CompareNewUntitledTextFilesAction extends Action2 {
  constructor() {
    super({
      id: _CompareNewUntitledTextFilesAction.ID,
      title: _CompareNewUntitledTextFilesAction.LABEL,
      f1: true,
      category: Categories.File,
      precondition: IsSessionsWindowContext.negate(),
      metadata: {
        description: nls.localize2("compareNewUntitledTextFilesMeta", "Opens a new diff editor with two untitled files.")
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      original: { resource: void 0 },
      modified: { resource: void 0 },
      options: { pinned: true }
    });
  }
};
_CompareNewUntitledTextFilesAction.ID = "workbench.files.action.compareNewUntitledTextFiles";
_CompareNewUntitledTextFilesAction.LABEL = nls.localize2("compareNewUntitledTextFiles", "Compare New Untitled Text Files");
let CompareNewUntitledTextFilesAction = _CompareNewUntitledTextFilesAction;
const _CompareWithClipboardAction = class _CompareWithClipboardAction extends Action2 {
  constructor() {
    super({
      id: _CompareWithClipboardAction.ID,
      title: _CompareWithClipboardAction.LABEL,
      f1: true,
      category: Categories.File,
      precondition: IsSessionsWindowContext.negate(),
      keybinding: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyC), weight: KeybindingWeight.WorkbenchContrib },
      metadata: {
        description: nls.localize2("compareWithClipboardMeta", "Opens a new diff editor to compare the active file with the contents of the clipboard.")
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const instantiationService = accessor.get(IInstantiationService);
    const textModelService = accessor.get(ITextModelService);
    const fileService = accessor.get(IFileService);
    const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const scheme = `clipboardCompare${_CompareWithClipboardAction.SCHEME_COUNTER++}`;
    if (resource && (fileService.hasProvider(resource) || resource.scheme === Schemas.untitled)) {
      if (!this.registrationDisposal) {
        const provider = instantiationService.createInstance(ClipboardContentProvider);
        this.registrationDisposal = textModelService.registerTextModelContentProvider(scheme, provider);
      }
      const name = resources.basename(resource);
      const editorLabel = nls.localize("clipboardComparisonLabel", "Clipboard \u2194 {0}", name);
      await editorService.openEditor({
        original: { resource: resource.with({ scheme }) },
        modified: { resource },
        label: editorLabel,
        options: { pinned: true }
      }).finally(() => {
        dispose(this.registrationDisposal);
        this.registrationDisposal = void 0;
      });
    }
  }
  dispose() {
    dispose(this.registrationDisposal);
    this.registrationDisposal = void 0;
  }
};
_CompareWithClipboardAction.ID = "workbench.files.action.compareWithClipboard";
_CompareWithClipboardAction.LABEL = nls.localize2("compareWithClipboard", "Compare Active File with Clipboard");
_CompareWithClipboardAction.SCHEME_COUNTER = 0;
let CompareWithClipboardAction = _CompareWithClipboardAction;
let ClipboardContentProvider = class {
  constructor(clipboardService, languageService, modelService) {
    this.clipboardService = clipboardService;
    this.languageService = languageService;
    this.modelService = modelService;
  }
  async provideTextContent(resource) {
    const text = await this.clipboardService.readText();
    const model = this.modelService.createModel(text, this.languageService.createByFilepathOrFirstLine(resource), resource);
    return model;
  }
};
ClipboardContentProvider = __decorateClass([
  __decorateParam(0, IClipboardService),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, IModelService)
], ClipboardContentProvider);
function onErrorWithRetry(notificationService, error, retry) {
  notificationService.prompt(
    Severity.Error,
    toErrorMessage(error, false),
    [{
      label: nls.localize("retry", "Retry"),
      run: () => retry()
    }]
  );
}
async function openExplorerAndCreate(accessor, isFolder) {
  const explorerService = accessor.get(IExplorerService);
  const fileService = accessor.get(IFileService);
  const configService = accessor.get(IConfigurationService);
  const filesConfigService = accessor.get(IFilesConfigurationService);
  const editorService = accessor.get(IEditorService);
  const viewsService = accessor.get(IViewsService);
  const notificationService = accessor.get(INotificationService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const commandService = accessor.get(ICommandService);
  const pathService = accessor.get(IPathService);
  const explorerViewId = explorerService.getViewId() ?? VIEW_ID;
  const wasHidden = !viewsService.isViewVisible(explorerViewId);
  const view = await viewsService.openView(explorerViewId, true);
  if (wasHidden) {
    await timeout(500);
  }
  if (!view) {
    if (isFolder) {
      throw new Error("Open a folder or workspace first.");
    }
    return commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
  }
  const stats = explorerService.getContext(false);
  const stat = stats.length > 0 ? stats[0] : void 0;
  let folder;
  if (stat) {
    folder = stat.isDirectory ? stat : stat.parent || explorerService.roots[0];
  } else {
    folder = explorerService.roots[0];
  }
  if (folder.isReadonly) {
    throw new Error("Parent folder is readonly.");
  }
  const newStat = new NewExplorerItem(fileService, configService, filesConfigService, folder, isFolder);
  folder.addChild(newStat);
  const onSuccess = async (value) => {
    try {
      const resourceToCreate = resources.joinPath(folder.resource, value);
      if (value.endsWith("/")) {
        isFolder = true;
      }
      await explorerService.applyBulkEdit([new ResourceFileEdit(void 0, resourceToCreate, { folder: isFolder })], {
        undoLabel: nls.localize("createBulkEdit", "Create {0}", value),
        progressLabel: nls.localize("creatingBulkEdit", "Creating {0}", value),
        confirmBeforeUndo: true
      });
      await refreshIfSeparator(value, explorerService);
      if (isFolder) {
        await explorerService.select(resourceToCreate, true);
      } else {
        await editorService.openEditor({ resource: resourceToCreate, options: { pinned: true } });
      }
    } catch (error) {
      onErrorWithRetry(notificationService, error, () => onSuccess(value));
    }
  };
  const os = (await remoteAgentService.getEnvironment())?.os ?? OS;
  await explorerService.setEditable(newStat, {
    validationMessage: (value) => validateFileName(pathService, newStat, value, os),
    onFinish: async (value, success) => {
      folder.removeChild(newStat);
      await explorerService.setEditable(newStat, null);
      if (success) {
        onSuccess(value);
      }
    }
  });
}
CommandsRegistry.registerCommand({
  id: NEW_FILE_COMMAND_ID,
  handler: async (accessor) => {
    await openExplorerAndCreate(accessor, false);
  }
});
CommandsRegistry.registerCommand({
  id: NEW_FOLDER_COMMAND_ID,
  handler: async (accessor) => {
    await openExplorerAndCreate(accessor, true);
  }
});
const renameHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const notificationService = accessor.get(INotificationService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const pathService = accessor.get(IPathService);
  const configurationService = accessor.get(IConfigurationService);
  const stats = explorerService.getContext(false);
  const stat = stats.length > 0 ? stats[0] : void 0;
  if (!stat) {
    return;
  }
  const os = (await remoteAgentService.getEnvironment())?.os ?? OS;
  await explorerService.setEditable(stat, {
    validationMessage: (value) => validateFileName(pathService, stat, value, os),
    onFinish: async (value, success) => {
      if (success) {
        const parentResource = stat.parent.resource;
        const targetResource = resources.joinPath(parentResource, value);
        if (stat.resource.toString() !== targetResource.toString()) {
          try {
            await explorerService.applyBulkEdit([new ResourceFileEdit(stat.resource, targetResource)], {
              confirmBeforeUndo: configurationService.getValue().explorer.confirmUndo === UndoConfirmLevel.Verbose,
              undoLabel: nls.localize("renameBulkEdit", "Rename {0} to {1}", stat.name, value),
              progressLabel: nls.localize("renamingBulkEdit", "Renaming {0} to {1}", stat.name, value)
            });
            await refreshIfSeparator(value, explorerService);
          } catch (e) {
            notificationService.error(e);
          }
        }
      }
      await explorerService.setEditable(stat, null);
    }
  });
};
const moveFileToTrashHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const stats = explorerService.getContext(true).filter((s) => !s.isRoot);
  if (stats.length) {
    await deleteFiles(accessor.get(IExplorerService), accessor.get(IWorkingCopyFileService), accessor.get(IDialogService), accessor.get(IConfigurationService), accessor.get(IFilesConfigurationService), stats, true);
  }
};
const deleteFileHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const stats = explorerService.getContext(true).filter((s) => !s.isRoot);
  if (stats.length) {
    await deleteFiles(accessor.get(IExplorerService), accessor.get(IWorkingCopyFileService), accessor.get(IDialogService), accessor.get(IConfigurationService), accessor.get(IFilesConfigurationService), stats, false);
  }
};
let pasteShouldMove = false;
const copyFileHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const stats = explorerService.getContext(true);
  if (stats.length > 0) {
    await explorerService.setToCopy(stats, false);
    pasteShouldMove = false;
  }
};
const cutFileHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const stats = explorerService.getContext(true);
  if (stats.length > 0) {
    await explorerService.setToCopy(stats, true);
    pasteShouldMove = true;
  }
};
const downloadFileHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const notificationService = accessor.get(INotificationService);
  const instantiationService = accessor.get(IInstantiationService);
  const context = explorerService.getContext(true);
  const explorerItems = context.length ? context : explorerService.roots;
  const downloadHandler = instantiationService.createInstance(FileDownload);
  try {
    await downloadHandler.download(explorerItems);
  } catch (error) {
    notificationService.error(error);
    throw error;
  }
};
CommandsRegistry.registerCommand({
  id: DOWNLOAD_COMMAND_ID,
  handler: downloadFileHandler
});
const uploadFileHandler = async (accessor) => {
  const explorerService = accessor.get(IExplorerService);
  const notificationService = accessor.get(INotificationService);
  const instantiationService = accessor.get(IInstantiationService);
  const context = explorerService.getContext(false);
  const element = context.length ? context[0] : explorerService.roots[0];
  try {
    const files = await triggerUpload();
    if (files) {
      const browserUpload = instantiationService.createInstance(BrowserFileUpload);
      await browserUpload.upload(element, files);
    }
  } catch (error) {
    notificationService.error(error);
    throw error;
  }
};
CommandsRegistry.registerCommand({
  id: UPLOAD_COMMAND_ID,
  handler: uploadFileHandler
});
const pasteFileHandler = async (accessor, fileList) => {
  const clipboardService = accessor.get(IClipboardService);
  const explorerService = accessor.get(IExplorerService);
  const fileService = accessor.get(IFileService);
  const notificationService = accessor.get(INotificationService);
  const editorService = accessor.get(IEditorService);
  const configurationService = accessor.get(IConfigurationService);
  const uriIdentityService = accessor.get(IUriIdentityService);
  const dialogService = accessor.get(IDialogService);
  const hostService = accessor.get(IHostService);
  const context = explorerService.getContext(false);
  const hasNativeFilesToPaste = fileList && fileList.length > 0;
  const confirmPasteNative = hasNativeFilesToPaste && configurationService.getValue("explorer.confirmPasteNative");
  const toPaste = await getFilesToPaste(fileList, clipboardService, hostService);
  if (confirmPasteNative && toPaste.files.length >= 1) {
    const message = toPaste.files.length > 1 ? nls.localize("confirmMultiPasteNative", "Are you sure you want to paste the following {0} items?", toPaste.files.length) : nls.localize("confirmPasteNative", "Are you sure you want to paste '{0}'?", basename(toPaste.type === "paths" ? toPaste.files[0].fsPath : toPaste.files[0].name));
    const detail = toPaste.files.length > 1 ? getFileNamesMessage(toPaste.files.map((item) => {
      if (URI.isUri(item)) {
        return item.fsPath;
      }
      if (toPaste.type === "paths") {
        const path = getPathForFile(item);
        if (path) {
          return path;
        }
      }
      return item.name;
    })) : void 0;
    const confirmation = await dialogService.confirm({
      message,
      detail,
      checkbox: {
        label: nls.localize("doNotAskAgain", "Do not ask me again")
      },
      primaryButton: nls.localize({ key: "pasteButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Paste")
    });
    if (!confirmation.confirmed) {
      return;
    }
    if (confirmation.checkboxChecked === true) {
      await configurationService.updateValue("explorer.confirmPasteNative", false);
    }
  }
  const element = context.length ? context[0] : explorerService.roots[0];
  const incrementalNaming = configurationService.getValue().explorer.incrementalNaming;
  const editableItem = explorerService.getEditable();
  if (editableItem) {
    return;
  }
  try {
    let targets = [];
    if (toPaste.type === "paths") {
      const sourceTargetPairs = coalesce(await Promise.all(toPaste.files.map(async (fileToPaste) => {
        if (element.resource.toString() !== fileToPaste.toString() && resources.isEqualOrParent(element.resource, fileToPaste)) {
          throw new Error(nls.localize("fileIsAncestor", "File to paste is an ancestor of the destination folder"));
        }
        const fileToPasteStat = await fileService.stat(fileToPaste);
        let target;
        if (uriIdentityService.extUri.isEqual(element.resource, fileToPaste)) {
          target = element.parent;
        } else {
          target = element.isDirectory ? element : element.parent;
        }
        const targetFile = await findValidPasteFileTarget(
          explorerService,
          fileService,
          dialogService,
          target,
          { resource: fileToPaste, isDirectory: fileToPasteStat.isDirectory, allowOverwrite: pasteShouldMove || incrementalNaming === "disabled" },
          incrementalNaming
        );
        if (!targetFile) {
          return void 0;
        }
        return { source: fileToPaste, target: targetFile };
      })));
      if (sourceTargetPairs.length >= 1) {
        if (pasteShouldMove) {
          const resourceFileEdits = sourceTargetPairs.map((pair) => new ResourceFileEdit(pair.source, pair.target, { overwrite: incrementalNaming === "disabled" }));
          const options = {
            confirmBeforeUndo: configurationService.getValue().explorer.confirmUndo === UndoConfirmLevel.Verbose,
            progressLabel: sourceTargetPairs.length > 1 ? nls.localize({ key: "movingBulkEdit", comment: ["Placeholder will be replaced by the number of files being moved"] }, "Moving {0} files", sourceTargetPairs.length) : nls.localize({ key: "movingFileBulkEdit", comment: ["Placeholder will be replaced by the name of the file moved."] }, "Moving {0}", resources.basenameOrAuthority(sourceTargetPairs[0].target)),
            undoLabel: sourceTargetPairs.length > 1 ? nls.localize({ key: "moveBulkEdit", comment: ["Placeholder will be replaced by the number of files being moved"] }, "Move {0} files", sourceTargetPairs.length) : nls.localize({ key: "moveFileBulkEdit", comment: ["Placeholder will be replaced by the name of the file moved."] }, "Move {0}", resources.basenameOrAuthority(sourceTargetPairs[0].target))
          };
          await explorerService.applyBulkEdit(resourceFileEdits, options);
        } else {
          const resourceFileEdits = sourceTargetPairs.map((pair) => new ResourceFileEdit(pair.source, pair.target, { copy: true, overwrite: incrementalNaming === "disabled" }));
          await applyCopyResourceEdit(sourceTargetPairs.map((pair) => pair.target), resourceFileEdits);
        }
      }
      targets = sourceTargetPairs.map((pair) => pair.target);
    } else {
      const targetAndEdits = coalesce(await Promise.all(toPaste.files.map(async (file) => {
        const target = element.isDirectory ? element : element.parent;
        const targetFile = await findValidPasteFileTarget(
          explorerService,
          fileService,
          dialogService,
          target,
          { resource: file.name, isDirectory: false, allowOverwrite: pasteShouldMove || incrementalNaming === "disabled" },
          incrementalNaming
        );
        if (!targetFile) {
          return;
        }
        return {
          target: targetFile,
          edit: new ResourceFileEdit(void 0, targetFile, {
            overwrite: incrementalNaming === "disabled",
            contents: (async () => VSBuffer.wrap(new Uint8Array(await file.arrayBuffer())))()
          })
        };
      })));
      await applyCopyResourceEdit(targetAndEdits.map((pair) => pair.target), targetAndEdits.map((pair) => pair.edit));
      targets = targetAndEdits.map((pair) => pair.target);
    }
    if (targets.length) {
      const firstTarget = targets[0];
      await explorerService.select(firstTarget);
      if (targets.length === 1) {
        const item = explorerService.findClosest(firstTarget);
        if (item && !item.isDirectory) {
          await editorService.openEditor({ resource: item.resource, options: { pinned: true, preserveFocus: true } });
        }
      }
    }
  } catch (e) {
    notificationService.error(toErrorMessage(new Error(nls.localize("fileDeleted", "The file(s) to paste have been deleted or moved since you copied them. {0}", getErrorMessage(e))), false));
  } finally {
    if (pasteShouldMove) {
      await explorerService.setToCopy([], false);
      pasteShouldMove = false;
    }
  }
  async function applyCopyResourceEdit(targets, resourceFileEdits) {
    const undoLevel = configurationService.getValue().explorer.confirmUndo;
    const options = {
      confirmBeforeUndo: undoLevel === UndoConfirmLevel.Default || undoLevel === UndoConfirmLevel.Verbose,
      progressLabel: targets.length > 1 ? nls.localize({ key: "copyingBulkEdit", comment: ["Placeholder will be replaced by the number of files being copied"] }, "Copying {0} files", targets.length) : nls.localize({ key: "copyingFileBulkEdit", comment: ["Placeholder will be replaced by the name of the file copied."] }, "Copying {0}", resources.basenameOrAuthority(targets[0])),
      undoLabel: targets.length > 1 ? nls.localize({ key: "copyBulkEdit", comment: ["Placeholder will be replaced by the number of files being copied"] }, "Paste {0} files", targets.length) : nls.localize({ key: "copyFileBulkEdit", comment: ["Placeholder will be replaced by the name of the file copied."] }, "Paste {0}", resources.basenameOrAuthority(targets[0]))
    };
    await explorerService.applyBulkEdit(resourceFileEdits, options);
  }
};
async function getFilesToPaste(fileList, clipboardService, hostService) {
  if (fileList && fileList.length > 0) {
    const resources2 = [...fileList].map((file) => getPathForFile(file)).filter((filePath) => !!filePath && isAbsolute(filePath)).map((filePath) => URI.file(filePath));
    if (resources2.length) {
      return { type: "paths", files: resources2 };
    }
    return { type: "data", files: [...fileList].filter((file) => !getPathForFile(file)) };
  } else {
    return { type: "paths", files: resources.distinctParents(await clipboardService.readResources(), (resource) => resource) };
  }
}
const openFilePreserveFocusHandler = async (accessor) => {
  const editorService = accessor.get(IEditorService);
  const explorerService = accessor.get(IExplorerService);
  const stats = explorerService.getContext(true);
  await editorService.openEditors(stats.filter((s) => !s.isDirectory).map((s) => ({
    resource: s.resource,
    options: { preserveFocus: true }
  })));
};
class BaseSetActiveEditorReadonlyInSession extends Action2 {
  constructor(id, title, newReadonlyState) {
    super({
      id,
      title,
      f1: true,
      category: Categories.File,
      precondition: ContextKeyExpr.and(ActiveEditorCanToggleReadonlyContext, IsSessionsWindowContext.negate())
    });
    this.newReadonlyState = newReadonlyState;
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const filesConfigurationService = accessor.get(IFilesConfigurationService);
    const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (!fileResource) {
      return;
    }
    await filesConfigurationService.updateReadonly(fileResource, this.newReadonlyState);
  }
}
const _SetActiveEditorReadonlyInSession = class _SetActiveEditorReadonlyInSession extends BaseSetActiveEditorReadonlyInSession {
  constructor() {
    super(
      _SetActiveEditorReadonlyInSession.ID,
      _SetActiveEditorReadonlyInSession.LABEL,
      true
    );
  }
};
_SetActiveEditorReadonlyInSession.ID = "workbench.action.files.setActiveEditorReadonlyInSession";
_SetActiveEditorReadonlyInSession.LABEL = nls.localize2("setActiveEditorReadonlyInSession", "Set Active Editor Read-only in Session");
let SetActiveEditorReadonlyInSession = _SetActiveEditorReadonlyInSession;
const _SetActiveEditorWriteableInSession = class _SetActiveEditorWriteableInSession extends BaseSetActiveEditorReadonlyInSession {
  constructor() {
    super(
      _SetActiveEditorWriteableInSession.ID,
      _SetActiveEditorWriteableInSession.LABEL,
      false
    );
  }
};
_SetActiveEditorWriteableInSession.ID = "workbench.action.files.setActiveEditorWriteableInSession";
_SetActiveEditorWriteableInSession.LABEL = nls.localize2("setActiveEditorWriteableInSession", "Set Active Editor Writeable in Session");
let SetActiveEditorWriteableInSession = _SetActiveEditorWriteableInSession;
const _ToggleActiveEditorReadonlyInSession = class _ToggleActiveEditorReadonlyInSession extends BaseSetActiveEditorReadonlyInSession {
  constructor() {
    super(
      _ToggleActiveEditorReadonlyInSession.ID,
      _ToggleActiveEditorReadonlyInSession.LABEL,
      "toggle"
    );
  }
};
_ToggleActiveEditorReadonlyInSession.ID = "workbench.action.files.toggleActiveEditorReadonlyInSession";
_ToggleActiveEditorReadonlyInSession.LABEL = nls.localize2("toggleActiveEditorReadonlyInSession", "Toggle Active Editor Read-only in Session");
let ToggleActiveEditorReadonlyInSession = _ToggleActiveEditorReadonlyInSession;
const _ResetActiveEditorReadonlyInSession = class _ResetActiveEditorReadonlyInSession extends BaseSetActiveEditorReadonlyInSession {
  constructor() {
    super(
      _ResetActiveEditorReadonlyInSession.ID,
      _ResetActiveEditorReadonlyInSession.LABEL,
      "reset"
    );
  }
};
_ResetActiveEditorReadonlyInSession.ID = "workbench.action.files.resetActiveEditorReadonlyInSession";
_ResetActiveEditorReadonlyInSession.LABEL = nls.localize2("resetActiveEditorReadonlyInSession", "Reset Active Editor Read-only in Session");
let ResetActiveEditorReadonlyInSession = _ResetActiveEditorReadonlyInSession;
export {
  COPY_FILE_LABEL,
  CloseGroupAction,
  CompareNewUntitledTextFilesAction,
  CompareWithClipboardAction,
  DOWNLOAD_COMMAND_ID,
  DOWNLOAD_LABEL,
  FileCopiedContext,
  FocusFilesExplorer,
  GlobalCompareResourcesAction,
  MOVE_FILE_TO_TRASH_LABEL,
  NEW_FILE_COMMAND_ID,
  NEW_FILE_LABEL,
  NEW_FOLDER_COMMAND_ID,
  NEW_FOLDER_LABEL,
  OpenActiveFileInEmptyWorkspace,
  PASTE_FILE_LABEL,
  ResetActiveEditorReadonlyInSession,
  SaveAllInGroupAction,
  SetActiveEditorReadonlyInSession,
  SetActiveEditorWriteableInSession,
  ShowActiveFileInExplorer,
  TRIGGER_RENAME_LABEL,
  ToggleActiveEditorReadonlyInSession,
  ToggleAutoSaveAction,
  UPLOAD_COMMAND_ID,
  UPLOAD_LABEL,
  copyFileHandler,
  cutFileHandler,
  deleteFileHandler,
  findValidPasteFileTarget,
  incrementFileName,
  moveFileToTrashHandler,
  openFilePreserveFocusHandler,
  pasteFileHandler,
  renameHandler,
  validateFileName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxmaWxlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgYmFzZW5hbWUsIGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCwgSUZpbGVzQ29uZmlndXJhdGlvbiwgVklFV19JRCwgVW5kb0NvbmZpcm1MZXZlbCB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJdGVtQWN0aXZhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBSRVZFQUxfSU5fRVhQTE9SRVJfQ09NTUFORF9JRCwgU0FWRV9BTExfSU5fR1JPVVBfQ09NTUFORF9JRCwgTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCB9IGZyb20gJy4vZmlsZUNvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSwgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSwgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElDb25maXJtYXRpb25SZXN1bHQsIGdldEZpbGVOYW1lc01lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgQ0xPU0VfRURJVE9SU19BTkRfR1JPVVBfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEV4cGxvcmVySXRlbSwgTmV3RXhwbG9yZXJJdGVtIH0gZnJvbSAnLi4vY29tbW9uL2V4cGxvcmVyTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHRyaWdnZXJVcGxvYWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0cmltLCBydHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuL2ZpbGVzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJGaWxlVXBsb2FkLCBGaWxlRG93bmxvYWQgfSBmcm9tICcuL2ZpbGVJbXBvcnRFeHBvcnQuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDYW5Ub2dnbGVSZWFkb25seUNvbnRleHQsIEFjdGl2ZUVkaXRvckNvbnRleHQsIEVtcHR5V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBnZXRQYXRoRm9yRmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5cbmV4cG9ydCBjb25zdCBORVdfRklMRV9DT01NQU5EX0lEID0gJ2V4cGxvcmVyLm5ld0ZpbGUnO1xuZXhwb3J0IGNvbnN0IE5FV19GSUxFX0xBQkVMID0gbmxzLmxvY2FsaXplMignbmV3RmlsZScsIFwiTmV3IEZpbGUuLi5cIik7XG5leHBvcnQgY29uc3QgTkVXX0ZPTERFUl9DT01NQU5EX0lEID0gJ2V4cGxvcmVyLm5ld0ZvbGRlcic7XG5leHBvcnQgY29uc3QgTkVXX0ZPTERFUl9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ25ld0ZvbGRlcicsIFwiTmV3IEZvbGRlci4uLlwiKTtcbmV4cG9ydCBjb25zdCBUUklHR0VSX1JFTkFNRV9MQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVuYW1lJywgXCJSZW5hbWUuLi5cIik7XG5leHBvcnQgY29uc3QgTU9WRV9GSUxFX1RPX1RSQVNIX0xBQkVMID0gbmxzLmxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKTtcbmV4cG9ydCBjb25zdCBDT1BZX0ZJTEVfTEFCRUwgPSBubHMubG9jYWxpemUoJ2NvcHlGaWxlJywgXCJDb3B5XCIpO1xuZXhwb3J0IGNvbnN0IFBBU1RFX0ZJTEVfTEFCRUwgPSBubHMubG9jYWxpemUoJ3Bhc3RlRmlsZScsIFwiUGFzdGVcIik7XG5leHBvcnQgY29uc3QgRmlsZUNvcGllZENvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZmlsZUNvcGllZCcsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBET1dOTE9BRF9DT01NQU5EX0lEID0gJ2V4cGxvcmVyLmRvd25sb2FkJztcbmV4cG9ydCBjb25zdCBET1dOTE9BRF9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnZG93bmxvYWQnLCBcIkRvd25sb2FkLi4uXCIpO1xuZXhwb3J0IGNvbnN0IFVQTE9BRF9DT01NQU5EX0lEID0gJ2V4cGxvcmVyLnVwbG9hZCc7XG5leHBvcnQgY29uc3QgVVBMT0FEX0xBQkVMID0gbmxzLmxvY2FsaXplKCd1cGxvYWQnLCBcIlVwbG9hZC4uLlwiKTtcbmNvbnN0IENPTkZJUk1fREVMRVRFX1NFVFRJTkdfS0VZID0gJ2V4cGxvcmVyLmNvbmZpcm1EZWxldGUnO1xuY29uc3QgTUFYX1VORE9fRklMRV9TSVpFID0gNTAwMDAwMDsgLy8gNW1iXG5cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hJZlNlcGFyYXRvcih2YWx1ZTogc3RyaW5nLCBleHBsb3JlclNlcnZpY2U6IElFeHBsb3JlclNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKHZhbHVlICYmICgodmFsdWUuaW5kZXhPZignLycpID49IDApIHx8ICh2YWx1ZS5pbmRleE9mKCdcXFxcJykgPj0gMCkpKSB7XG5cdFx0Ly8gTmV3IGlucHV0IGNvbnRhaW5zIHNlcGFyYXRvciwgbXVsdGlwbGUgcmVzb3VyY2VzIHdpbGwgZ2V0IGNyZWF0ZWQgd29ya2Fyb3VuZCBmb3IgIzY4MjA0XG5cdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLnJlZnJlc2goKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVGaWxlcyhleHBsb3JlclNlcnZpY2U6IElFeHBsb3JlclNlcnZpY2UsIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIGVsZW1lbnRzOiBFeHBsb3Jlckl0ZW1bXSwgdXNlVHJhc2g6IGJvb2xlYW4sIHNraXBDb25maXJtID0gZmFsc2UsIGlnbm9yZUlmTm90RXhpc3RzID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0bGV0IHByaW1hcnlCdXR0b246IHN0cmluZztcblx0aWYgKHVzZVRyYXNoKSB7XG5cdFx0cHJpbWFyeUJ1dHRvbiA9IGlzV2luZG93cyA/IG5scy5sb2NhbGl6ZSgnZGVsZXRlQnV0dG9uTGFiZWxSZWN5Y2xlQmluJywgXCImJk1vdmUgdG8gUmVjeWNsZSBCaW5cIikgOiBubHMubG9jYWxpemUoeyBrZXk6ICdkZWxldGVCdXR0b25MYWJlbFRyYXNoJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTW92ZSB0byBUcmFzaFwiKTtcblx0fSBlbHNlIHtcblx0XHRwcmltYXJ5QnV0dG9uID0gbmxzLmxvY2FsaXplKHsga2V5OiAnZGVsZXRlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEZWxldGVcIik7XG5cdH1cblxuXHQvLyBIYW5kbGUgZGlydHlcblx0Y29uc3QgZGlzdGluY3RFbGVtZW50cyA9IHJlc291cmNlcy5kaXN0aW5jdFBhcmVudHMoZWxlbWVudHMsIGUgPT4gZS5yZXNvdXJjZSk7XG5cdGNvbnN0IGRpcnR5V29ya2luZ0NvcGllcyA9IG5ldyBTZXQ8SVdvcmtpbmdDb3B5PigpO1xuXHRmb3IgKGNvbnN0IGRpc3RpbmN0RWxlbWVudCBvZiBkaXN0aW5jdEVsZW1lbnRzKSB7XG5cdFx0Zm9yIChjb25zdCBkaXJ0eVdvcmtpbmdDb3B5IG9mIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2UuZ2V0RGlydHkoZGlzdGluY3RFbGVtZW50LnJlc291cmNlKSkge1xuXHRcdFx0ZGlydHlXb3JraW5nQ29waWVzLmFkZChkaXJ0eVdvcmtpbmdDb3B5KTtcblx0XHR9XG5cdH1cblxuXHRpZiAoZGlydHlXb3JraW5nQ29waWVzLnNpemUpIHtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdGlmIChkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2RpcnR5TWVzc2FnZUZpbGVzRGVsZXRlJywgXCJZb3UgYXJlIGRlbGV0aW5nIGZpbGVzIHdpdGggdW5zYXZlZCBjaGFuZ2VzLiBEbyB5b3Ugd2FudCB0byBjb250aW51ZT9cIik7XG5cdFx0fSBlbHNlIGlmIChkaXN0aW5jdEVsZW1lbnRzWzBdLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRpZiAoZGlydHlXb3JraW5nQ29waWVzLnNpemUgPT09IDEpIHtcblx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZGlydHlNZXNzYWdlRm9sZGVyT25lRGVsZXRlJywgXCJZb3UgYXJlIGRlbGV0aW5nIGEgZm9sZGVyIHswfSB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBpbiAxIGZpbGUuIERvIHlvdSB3YW50IHRvIGNvbnRpbnVlP1wiLCBkaXN0aW5jdEVsZW1lbnRzWzBdLm5hbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZGlydHlNZXNzYWdlRm9sZGVyRGVsZXRlJywgXCJZb3UgYXJlIGRlbGV0aW5nIGEgZm9sZGVyIHswfSB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBpbiB7MX0gZmlsZXMuIERvIHlvdSB3YW50IHRvIGNvbnRpbnVlP1wiLCBkaXN0aW5jdEVsZW1lbnRzWzBdLm5hbWUsIGRpcnR5V29ya2luZ0NvcGllcy5zaXplKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZGlydHlNZXNzYWdlRmlsZURlbGV0ZScsIFwiWW91IGFyZSBkZWxldGluZyB7MH0gd2l0aCB1bnNhdmVkIGNoYW5nZXMuIERvIHlvdSB3YW50IHRvIGNvbnRpbnVlP1wiLCBkaXN0aW5jdEVsZW1lbnRzWzBdLm5hbWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnZGlydHlXYXJuaW5nJywgXCJZb3VyIGNoYW5nZXMgd2lsbCBiZSBsb3N0IGlmIHlvdSBkb24ndCBzYXZlIHRoZW0uXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvblxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXNwb25zZS5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2tpcENvbmZpcm0gPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdC8vIEhhbmRsZSByZWFkb25seVxuXHRpZiAoIXNraXBDb25maXJtKSB7XG5cdFx0Y29uc3QgcmVhZG9ubHlSZXNvdXJjZXMgPSBkaXN0aW5jdEVsZW1lbnRzLmZpbHRlcihlID0+IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seShlLnJlc291cmNlKSk7XG5cdFx0aWYgKHJlYWRvbmx5UmVzb3VyY2VzLmxlbmd0aCkge1xuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdGlmIChyZWFkb25seVJlc291cmNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlYWRvbmx5TWVzc2FnZUZpbGVzRGVsZXRlJywgXCJZb3UgYXJlIGRlbGV0aW5nIGZpbGVzIHRoYXQgYXJlIGNvbmZpZ3VyZWQgdG8gYmUgcmVhZC1vbmx5LiBEbyB5b3Ugd2FudCB0byBjb250aW51ZT9cIik7XG5cdFx0XHR9IGVsc2UgaWYgKHJlYWRvbmx5UmVzb3VyY2VzWzBdLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlYWRvbmx5TWVzc2FnZUZvbGRlck9uZURlbGV0ZScsIFwiWW91IGFyZSBkZWxldGluZyBhIGZvbGRlciB7MH0gdGhhdCBpcyBjb25maWd1cmVkIHRvIGJlIHJlYWQtb25seS4gRG8geW91IHdhbnQgdG8gY29udGludWU/XCIsIGRpc3RpbmN0RWxlbWVudHNbMF0ubmFtZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZWFkb25seU1lc3NhZ2VGb2xkZXJEZWxldGUnLCBcIllvdSBhcmUgZGVsZXRpbmcgYSBmaWxlIHswfSB0aGF0IGlzIGNvbmZpZ3VyZWQgdG8gYmUgcmVhZC1vbmx5LiBEbyB5b3Ugd2FudCB0byBjb250aW51ZT9cIiwgZGlzdGluY3RFbGVtZW50c1swXS5uYW1lKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdjb250aW51ZURldGFpbCcsIFwiVGhlIHJlYWQtb25seSBwcm90ZWN0aW9uIHdpbGwgYmUgb3ZlcnJpZGRlbiBpZiB5b3UgY29udGludWUuXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoJ2NvbnRpbnVlQnV0dG9uTGFiZWwnLCBcIkNvbnRpbnVlXCIpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFyZXNwb25zZS5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGxldCBjb25maXJtYXRpb246IElDb25maXJtYXRpb25SZXN1bHQ7XG5cblx0Ly8gV2UgZG8gbm90IHN1cHBvcnQgdW5kbyBvZiBmb2xkZXJzLCBzbyBpbiB0aGF0IGNhc2UgdGhlIGRlbGV0ZSBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlXG5cdGNvbnN0IGRlbGV0ZURldGFpbCA9IGRpc3RpbmN0RWxlbWVudHMuc29tZShlID0+IGUuaXNEaXJlY3RvcnkpID8gbmxzLmxvY2FsaXplKCdpcnJldmVyc2libGUnLCBcIlRoaXMgYWN0aW9uIGlzIGlycmV2ZXJzaWJsZSFcIikgOlxuXHRcdGRpc3RpbmN0RWxlbWVudHMubGVuZ3RoID4gMSA/IG5scy5sb2NhbGl6ZSgncmVzdG9yZVBsdXJhbCcsIFwiWW91IGNhbiByZXN0b3JlIHRoZXNlIGZpbGVzIHVzaW5nIHRoZSBVbmRvIGNvbW1hbmQuXCIpIDogbmxzLmxvY2FsaXplKCdyZXN0b3JlJywgXCJZb3UgY2FuIHJlc3RvcmUgdGhpcyBmaWxlIHVzaW5nIHRoZSBVbmRvIGNvbW1hbmQuXCIpO1xuXG5cdC8vIENoZWNrIGlmIHdlIG5lZWQgdG8gYXNrIGZvciBjb25maXJtYXRpb24gYXQgYWxsXG5cdGlmIChza2lwQ29uZmlybSB8fCBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDT05GSVJNX0RFTEVURV9TRVRUSU5HX0tFWSkgPT09IGZhbHNlKSB7XG5cdFx0Y29uZmlybWF0aW9uID0geyBjb25maXJtZWQ6IHRydWUgfTtcblx0fVxuXG5cdC8vIENvbmZpcm0gZm9yIG1vdmluZyB0byB0cmFzaFxuXHRlbHNlIGlmICh1c2VUcmFzaCkge1xuXHRcdGxldCB7IG1lc3NhZ2UsIGRldGFpbCB9ID0gZ2V0TW92ZVRvVHJhc2hNZXNzYWdlKGRpc3RpbmN0RWxlbWVudHMpO1xuXHRcdGRldGFpbCArPSBkZXRhaWwgPyAnXFxuJyA6ICcnO1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGRldGFpbCArPSBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCA+IDEgPyBubHMubG9jYWxpemUoJ3VuZG9CaW5GaWxlcycsIFwiWW91IGNhbiByZXN0b3JlIHRoZXNlIGZpbGVzIGZyb20gdGhlIFJlY3ljbGUgQmluLlwiKSA6IG5scy5sb2NhbGl6ZSgndW5kb0JpbicsIFwiWW91IGNhbiByZXN0b3JlIHRoaXMgZmlsZSBmcm9tIHRoZSBSZWN5Y2xlIEJpbi5cIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRldGFpbCArPSBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCA+IDEgPyBubHMubG9jYWxpemUoJ3VuZG9UcmFzaEZpbGVzJywgXCJZb3UgY2FuIHJlc3RvcmUgdGhlc2UgZmlsZXMgZnJvbSB0aGUgVHJhc2guXCIpIDogbmxzLmxvY2FsaXplKCd1bmRvVHJhc2gnLCBcIllvdSBjYW4gcmVzdG9yZSB0aGlzIGZpbGUgZnJvbSB0aGUgVHJhc2guXCIpO1xuXHRcdH1cblxuXHRcdGNvbmZpcm1hdGlvbiA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbixcblx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2RvTm90QXNrQWdhaW4nLCBcIkRvIG5vdCBhc2sgbWUgYWdhaW5cIilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vIENvbmZpcm0gZm9yIGRlbGV0aW5nIHBlcm1hbmVudGx5XG5cdGVsc2Uge1xuXHRcdGxldCB7IG1lc3NhZ2UsIGRldGFpbCB9ID0gZ2V0RGVsZXRlTWVzc2FnZShkaXN0aW5jdEVsZW1lbnRzKTtcblx0XHRkZXRhaWwgKz0gZGV0YWlsID8gJ1xcbicgOiAnJztcblx0XHRkZXRhaWwgKz0gZGVsZXRlRGV0YWlsO1xuXHRcdGNvbmZpcm1hdGlvbiA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0cHJpbWFyeUJ1dHRvblxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gQ2hlY2sgZm9yIGNvbmZpcm1hdGlvbiBjaGVja2JveFxuXHRpZiAoY29uZmlybWF0aW9uLmNvbmZpcm1lZCAmJiBjb25maXJtYXRpb24uY2hlY2tib3hDaGVja2VkID09PSB0cnVlKSB7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ09ORklSTV9ERUxFVEVfU0VUVElOR19LRVksIGZhbHNlKTtcblx0fVxuXG5cdC8vIENoZWNrIGZvciBjb25maXJtYXRpb25cblx0aWYgKCFjb25maXJtYXRpb24uY29uZmlybWVkKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gQ2FsbCBmdW5jdGlvblxuXHR0cnkge1xuXHRcdGNvbnN0IHJlc291cmNlRmlsZUVkaXRzID0gZGlzdGluY3RFbGVtZW50cy5tYXAoZSA9PiBuZXcgUmVzb3VyY2VGaWxlRWRpdChlLnJlc291cmNlLCB1bmRlZmluZWQsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb2xkZXI6IGUuaXNEaXJlY3RvcnksIGlnbm9yZUlmTm90RXhpc3RzLCBza2lwVHJhc2hCaW46ICF1c2VUcmFzaCwgbWF4U2l6ZTogTUFYX1VORE9fRklMRV9TSVpFIH0pKTtcblx0XHRjb25zdCBvcHRpb25zID0ge1xuXHRcdFx0dW5kb0xhYmVsOiBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCA+IDEgPyBubHMubG9jYWxpemUoeyBrZXk6ICdkZWxldGVCdWxrRWRpdCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgd2lsbCBiZSByZXBsYWNlZCBieSB0aGUgbnVtYmVyIG9mIGZpbGVzIGRlbGV0ZWQnXSB9LCBcIkRlbGV0ZSB7MH0gZmlsZXNcIiwgZGlzdGluY3RFbGVtZW50cy5sZW5ndGgpIDogbmxzLmxvY2FsaXplKHsga2V5OiAnZGVsZXRlRmlsZUJ1bGtFZGl0JywgY29tbWVudDogWydQbGFjZWhvbGRlciB3aWxsIGJlIHJlcGxhY2VkIGJ5IHRoZSBuYW1lIG9mIHRoZSBmaWxlIGRlbGV0ZWQnXSB9LCBcIkRlbGV0ZSB7MH1cIiwgZGlzdGluY3RFbGVtZW50c1swXS5uYW1lKSxcblx0XHRcdHByb2dyZXNzTGFiZWw6IGRpc3RpbmN0RWxlbWVudHMubGVuZ3RoID4gMSA/IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlbGV0aW5nQnVsa0VkaXQnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVyIHdpbGwgYmUgcmVwbGFjZWQgYnkgdGhlIG51bWJlciBvZiBmaWxlcyBkZWxldGVkJ10gfSwgXCJEZWxldGluZyB7MH0gZmlsZXNcIiwgZGlzdGluY3RFbGVtZW50cy5sZW5ndGgpIDogbmxzLmxvY2FsaXplKHsga2V5OiAnZGVsZXRpbmdGaWxlQnVsa0VkaXQnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVyIHdpbGwgYmUgcmVwbGFjZWQgYnkgdGhlIG5hbWUgb2YgdGhlIGZpbGUgZGVsZXRlZCddIH0sIFwiRGVsZXRpbmcgezB9XCIsIGRpc3RpbmN0RWxlbWVudHNbMF0ubmFtZSksXG5cdFx0fTtcblx0XHRhd2FpdCBleHBsb3JlclNlcnZpY2UuYXBwbHlCdWxrRWRpdChyZXNvdXJjZUZpbGVFZGl0cywgb3B0aW9ucyk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHQvLyBIYW5kbGUgZXJyb3IgdG8gZGVsZXRlIGZpbGUocykgZnJvbSBhIG1vZGFsIGNvbmZpcm1hdGlvbiBkaWFsb2dcblx0XHRsZXQgZXJyb3JNZXNzYWdlOiBzdHJpbmc7XG5cdFx0bGV0IGRldGFpbE1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJpbWFyeUJ1dHRvbjogc3RyaW5nO1xuXHRcdGlmICh1c2VUcmFzaCkge1xuXHRcdFx0ZXJyb3JNZXNzYWdlID0gaXNXaW5kb3dzID8gbmxzLmxvY2FsaXplKCdiaW5GYWlsZWQnLCBcIkZhaWxlZCB0byBkZWxldGUgdXNpbmcgdGhlIFJlY3ljbGUgQmluLiBEbyB5b3Ugd2FudCB0byBwZXJtYW5lbnRseSBkZWxldGUgaW5zdGVhZD9cIikgOiBubHMubG9jYWxpemUoJ3RyYXNoRmFpbGVkJywgXCJGYWlsZWQgdG8gZGVsZXRlIHVzaW5nIHRoZSBUcmFzaC4gRG8geW91IHdhbnQgdG8gcGVybWFuZW50bHkgZGVsZXRlIGluc3RlYWQ/XCIpO1xuXHRcdFx0ZGV0YWlsTWVzc2FnZSA9IGRlbGV0ZURldGFpbDtcblx0XHRcdHByaW1hcnlCdXR0b24gPSBubHMubG9jYWxpemUoeyBrZXk6ICdkZWxldGVQZXJtYW5lbnRseUJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGVsZXRlIFBlcm1hbmVudGx5XCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlcnJvck1lc3NhZ2UgPSB0b0Vycm9yTWVzc2FnZShlcnJvciwgZmFsc2UpO1xuXHRcdFx0cHJpbWFyeUJ1dHRvbiA9IG5scy5sb2NhbGl6ZSh7IGtleTogJ3JldHJ5QnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXRyeVwiKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogZXJyb3JNZXNzYWdlLFxuXHRcdFx0ZGV0YWlsOiBkZXRhaWxNZXNzYWdlLFxuXHRcdFx0cHJpbWFyeUJ1dHRvblxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblx0XHRcdGlmICh1c2VUcmFzaCkge1xuXHRcdFx0XHR1c2VUcmFzaCA9IGZhbHNlOyAvLyBEZWxldGUgUGVybWFuZW50bHlcblx0XHRcdH1cblxuXHRcdFx0c2tpcENvbmZpcm0gPSB0cnVlO1xuXHRcdFx0aWdub3JlSWZOb3RFeGlzdHMgPSB0cnVlO1xuXG5cdFx0XHRyZXR1cm4gZGVsZXRlRmlsZXMoZXhwbG9yZXJTZXJ2aWNlLCB3b3JraW5nQ29weUZpbGVTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgZWxlbWVudHMsIHVzZVRyYXNoLCBza2lwQ29uZmlybSwgaWdub3JlSWZOb3RFeGlzdHMpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRNb3ZlVG9UcmFzaE1lc3NhZ2UoZGlzdGluY3RFbGVtZW50czogRXhwbG9yZXJJdGVtW10pOiB7IG1lc3NhZ2U6IHN0cmluZzsgZGV0YWlsOiBzdHJpbmcgfSB7XG5cdGlmIChjb250YWluc0JvdGhEaXJlY3RvcnlBbmRGaWxlKGRpc3RpbmN0RWxlbWVudHMpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybU1vdmVUcmFzaE1lc3NhZ2VGaWxlc0FuZERpcmVjdG9yaWVzJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHRoZSBmb2xsb3dpbmcgezB9IGZpbGVzL2RpcmVjdG9yaWVzIGFuZCB0aGVpciBjb250ZW50cz9cIiwgZGlzdGluY3RFbGVtZW50cy5sZW5ndGgpLFxuXHRcdFx0ZGV0YWlsOiBnZXRGaWxlTmFtZXNNZXNzYWdlKGRpc3RpbmN0RWxlbWVudHMubWFwKGUgPT4gZS5yZXNvdXJjZSkpXG5cdFx0fTtcblx0fVxuXG5cdGlmIChkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRpZiAoZGlzdGluY3RFbGVtZW50c1swXS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtTW92ZVRyYXNoTWVzc2FnZU11bHRpcGxlRGlyZWN0b3JpZXMnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhlIGZvbGxvd2luZyB7MH0gZGlyZWN0b3JpZXMgYW5kIHRoZWlyIGNvbnRlbnRzP1wiLCBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCksXG5cdFx0XHRcdGRldGFpbDogZ2V0RmlsZU5hbWVzTWVzc2FnZShkaXN0aW5jdEVsZW1lbnRzLm1hcChlID0+IGUucmVzb3VyY2UpKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtTW92ZVRyYXNoTWVzc2FnZU11bHRpcGxlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHRoZSBmb2xsb3dpbmcgezB9IGZpbGVzP1wiLCBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IGdldEZpbGVOYW1lc01lc3NhZ2UoZGlzdGluY3RFbGVtZW50cy5tYXAoZSA9PiBlLnJlc291cmNlKSlcblx0XHR9O1xuXHR9XG5cblx0aWYgKGRpc3RpbmN0RWxlbWVudHNbMF0uaXNEaXJlY3RvcnkgJiYgIWRpc3RpbmN0RWxlbWVudHNbMF0uaXNTeW1ib2xpY0xpbmspIHtcblx0XHRyZXR1cm4geyBtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1Nb3ZlVHJhc2hNZXNzYWdlRm9sZGVyJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlICd7MH0nIGFuZCBpdHMgY29udGVudHM/XCIsIGRpc3RpbmN0RWxlbWVudHNbMF0ubmFtZSksIGRldGFpbDogJycgfTtcblx0fVxuXG5cdHJldHVybiB7IG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybU1vdmVUcmFzaE1lc3NhZ2VGaWxlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlICd7MH0nP1wiLCBkaXN0aW5jdEVsZW1lbnRzWzBdLm5hbWUpLCBkZXRhaWw6ICcnIH07XG59XG5cbmZ1bmN0aW9uIGdldERlbGV0ZU1lc3NhZ2UoZGlzdGluY3RFbGVtZW50czogRXhwbG9yZXJJdGVtW10pOiB7IG1lc3NhZ2U6IHN0cmluZzsgZGV0YWlsOiBzdHJpbmcgfSB7XG5cdGlmIChjb250YWluc0JvdGhEaXJlY3RvcnlBbmRGaWxlKGRpc3RpbmN0RWxlbWVudHMpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybURlbGV0ZU1lc3NhZ2VGaWxlc0FuZERpcmVjdG9yaWVzJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcGVybWFuZW50bHkgZGVsZXRlIHRoZSBmb2xsb3dpbmcgezB9IGZpbGVzL2RpcmVjdG9yaWVzIGFuZCB0aGVpciBjb250ZW50cz9cIiwgZGlzdGluY3RFbGVtZW50cy5sZW5ndGgpLFxuXHRcdFx0ZGV0YWlsOiBnZXRGaWxlTmFtZXNNZXNzYWdlKGRpc3RpbmN0RWxlbWVudHMubWFwKGUgPT4gZS5yZXNvdXJjZSkpXG5cdFx0fTtcblx0fVxuXG5cdGlmIChkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRpZiAoZGlzdGluY3RFbGVtZW50c1swXS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtRGVsZXRlTWVzc2FnZU11bHRpcGxlRGlyZWN0b3JpZXMnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBwZXJtYW5lbnRseSBkZWxldGUgdGhlIGZvbGxvd2luZyB7MH0gZGlyZWN0b3JpZXMgYW5kIHRoZWlyIGNvbnRlbnRzP1wiLCBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCksXG5cdFx0XHRcdGRldGFpbDogZ2V0RmlsZU5hbWVzTWVzc2FnZShkaXN0aW5jdEVsZW1lbnRzLm1hcChlID0+IGUucmVzb3VyY2UpKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtRGVsZXRlTWVzc2FnZU11bHRpcGxlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcGVybWFuZW50bHkgZGVsZXRlIHRoZSBmb2xsb3dpbmcgezB9IGZpbGVzP1wiLCBkaXN0aW5jdEVsZW1lbnRzLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IGdldEZpbGVOYW1lc01lc3NhZ2UoZGlzdGluY3RFbGVtZW50cy5tYXAoZSA9PiBlLnJlc291cmNlKSlcblx0XHR9O1xuXHR9XG5cblx0aWYgKGRpc3RpbmN0RWxlbWVudHNbMF0uaXNEaXJlY3RvcnkpIHtcblx0XHRyZXR1cm4geyBtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1EZWxldGVNZXNzYWdlRm9sZGVyJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcGVybWFuZW50bHkgZGVsZXRlICd7MH0nIGFuZCBpdHMgY29udGVudHM/XCIsIGRpc3RpbmN0RWxlbWVudHNbMF0ubmFtZSksIGRldGFpbDogJycgfTtcblx0fVxuXG5cdHJldHVybiB7IG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybURlbGV0ZU1lc3NhZ2VGaWxlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcGVybWFuZW50bHkgZGVsZXRlICd7MH0nP1wiLCBkaXN0aW5jdEVsZW1lbnRzWzBdLm5hbWUpLCBkZXRhaWw6ICcnIH07XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zQm90aERpcmVjdG9yeUFuZEZpbGUoZGlzdGluY3RFbGVtZW50czogRXhwbG9yZXJJdGVtW10pOiBib29sZWFuIHtcblx0Y29uc3QgZGlyZWN0b3J5ID0gZGlzdGluY3RFbGVtZW50cy5maW5kKGVsZW1lbnQgPT4gZWxlbWVudC5pc0RpcmVjdG9yeSk7XG5cdGNvbnN0IGZpbGUgPSBkaXN0aW5jdEVsZW1lbnRzLmZpbmQoZWxlbWVudCA9PiAhZWxlbWVudC5pc0RpcmVjdG9yeSk7XG5cblx0cmV0dXJuICEhZGlyZWN0b3J5ICYmICEhZmlsZTtcbn1cblxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZFZhbGlkUGFzdGVGaWxlVGFyZ2V0KFxuXHRleHBsb3JlclNlcnZpY2U6IElFeHBsb3JlclNlcnZpY2UsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHR0YXJnZXRGb2xkZXI6IEV4cGxvcmVySXRlbSxcblx0ZmlsZVRvUGFzdGU6IHsgcmVzb3VyY2U6IFVSSSB8IHN0cmluZzsgaXNEaXJlY3Rvcnk/OiBib29sZWFuOyBhbGxvd092ZXJ3cml0ZTogYm9vbGVhbiB9LFxuXHRpbmNyZW1lbnRhbE5hbWluZzogJ3NpbXBsZScgfCAnc21hcnQnIHwgJ2Rpc2FibGVkJ1xuKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblxuXHRsZXQgbmFtZSA9IHR5cGVvZiBmaWxlVG9QYXN0ZS5yZXNvdXJjZSA9PT0gJ3N0cmluZycgPyBmaWxlVG9QYXN0ZS5yZXNvdXJjZSA6IHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KGZpbGVUb1Bhc3RlLnJlc291cmNlKTtcblx0bGV0IGNhbmRpZGF0ZSA9IHJlc291cmNlcy5qb2luUGF0aCh0YXJnZXRGb2xkZXIucmVzb3VyY2UsIG5hbWUpO1xuXG5cdC8vIEluIHRoZSBkaXNhYmxlZCBjYXNlIHdlIG11c3QgYXNrIGlmIGl0J3Mgb2sgdG8gb3ZlcndyaXRlIHRoZSBmaWxlIGlmIGl0IGV4aXN0c1xuXHRpZiAoaW5jcmVtZW50YWxOYW1pbmcgPT09ICdkaXNhYmxlZCcpIHtcblx0XHRjb25zdCBjYW5PdmVyd3JpdGUgPSBhd2FpdCBhc2tGb3JPdmVyd3JpdGUoZmlsZVNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIGNhbmRpZGF0ZSk7XG5cdFx0aWYgKCFjYW5PdmVyd3JpdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHR3aGlsZSAodHJ1ZSAmJiAhZmlsZVRvUGFzdGUuYWxsb3dPdmVyd3JpdGUpIHtcblx0XHRpZiAoIWV4cGxvcmVyU2VydmljZS5maW5kQ2xvc2VzdChjYW5kaWRhdGUpKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoaW5jcmVtZW50YWxOYW1pbmcgIT09ICdkaXNhYmxlZCcpIHtcblx0XHRcdG5hbWUgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCAhIWZpbGVUb1Bhc3RlLmlzRGlyZWN0b3J5LCBpbmNyZW1lbnRhbE5hbWluZyk7XG5cdFx0fVxuXHRcdGNhbmRpZGF0ZSA9IHJlc291cmNlcy5qb2luUGF0aCh0YXJnZXRGb2xkZXIucmVzb3VyY2UsIG5hbWUpO1xuXHR9XG5cblx0cmV0dXJuIGNhbmRpZGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluY3JlbWVudEZpbGVOYW1lKG5hbWU6IHN0cmluZywgaXNGb2xkZXI6IGJvb2xlYW4sIGluY3JlbWVudGFsTmFtaW5nOiAnc2ltcGxlJyB8ICdzbWFydCcpOiBzdHJpbmcge1xuXHRpZiAoaW5jcmVtZW50YWxOYW1pbmcgPT09ICdzaW1wbGUnKSB7XG5cdFx0bGV0IG5hbWVQcmVmaXggPSBuYW1lO1xuXHRcdGxldCBleHRTdWZmaXggPSAnJztcblx0XHRpZiAoIWlzRm9sZGVyKSB7XG5cdFx0XHRleHRTdWZmaXggPSBleHRuYW1lKG5hbWUpO1xuXHRcdFx0bmFtZVByZWZpeCA9IGJhc2VuYW1lKG5hbWUsIGV4dFN1ZmZpeCk7XG5cdFx0fVxuXG5cdFx0Ly8gbmFtZSBjb3B5IDUoLnR4dCkgPT4gbmFtZSBjb3B5IDYoLnR4dClcblx0XHQvLyBuYW1lIGNvcHkoLnR4dCkgPT4gbmFtZSBjb3B5IDIoLnR4dClcblx0XHRjb25zdCBzdWZmaXhSZWdleCA9IC9eKC4rIGNvcHkpKCBcXGQrKT8kLztcblx0XHRpZiAoc3VmZml4UmVnZXgudGVzdChuYW1lUHJlZml4KSkge1xuXHRcdFx0cmV0dXJuIG5hbWVQcmVmaXgucmVwbGFjZShzdWZmaXhSZWdleCwgKG1hdGNoLCBnMT8sIGcyPykgPT4ge1xuXHRcdFx0XHRjb25zdCBudW1iZXIgPSAoZzIgPyBwYXJzZUludChnMikgOiAxKTtcblx0XHRcdFx0cmV0dXJuIG51bWJlciA9PT0gMFxuXHRcdFx0XHRcdD8gYCR7ZzF9YFxuXHRcdFx0XHRcdDogKG51bWJlciA8IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSXG5cdFx0XHRcdFx0XHQ/IGAke2cxfSAke251bWJlciArIDF9YFxuXHRcdFx0XHRcdFx0OiBgJHtnMX0ke2cyfSBjb3B5YCk7XG5cdFx0XHR9KSArIGV4dFN1ZmZpeDtcblx0XHR9XG5cblx0XHQvLyBuYW1lKC50eHQpID0+IG5hbWUgY29weSgudHh0KVxuXHRcdHJldHVybiBgJHtuYW1lUHJlZml4fSBjb3B5JHtleHRTdWZmaXh9YDtcblx0fVxuXG5cdGNvbnN0IHNlcGFyYXRvcnMgPSAnW1xcXFwuXFxcXC1fXSc7XG5cdGNvbnN0IG1heE51bWJlciA9IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSO1xuXG5cdC8vIGZpbGUuMS50eHQ9PmZpbGUuMi50eHRcblx0Y29uc3Qgc3VmZml4RmlsZVJlZ2V4ID0gUmVnRXhwKCcoLionICsgc2VwYXJhdG9ycyArICcpKFxcXFxkKykoXFxcXC4uKikkJyk7XG5cdGlmICghaXNGb2xkZXIgJiYgbmFtZS5tYXRjaChzdWZmaXhGaWxlUmVnZXgpKSB7XG5cdFx0cmV0dXJuIG5hbWUucmVwbGFjZShzdWZmaXhGaWxlUmVnZXgsIChtYXRjaCwgZzE/LCBnMj8sIGczPykgPT4ge1xuXHRcdFx0Y29uc3QgbnVtYmVyID0gcGFyc2VJbnQoZzIpO1xuXHRcdFx0cmV0dXJuIG51bWJlciA8IG1heE51bWJlclxuXHRcdFx0XHQ/IGcxICsgU3RyaW5nKG51bWJlciArIDEpLnBhZFN0YXJ0KGcyLmxlbmd0aCwgJzAnKSArIGczXG5cdFx0XHRcdDogYCR7ZzF9JHtnMn0uMSR7ZzN9YDtcblx0XHR9KTtcblx0fVxuXG5cdC8vIDEuZmlsZS50eHQ9PjIuZmlsZS50eHRcblx0Y29uc3QgcHJlZml4RmlsZVJlZ2V4ID0gUmVnRXhwKCcoXFxcXGQrKSgnICsgc2VwYXJhdG9ycyArICcuKikoXFxcXC4uKikkJyk7XG5cdGlmICghaXNGb2xkZXIgJiYgbmFtZS5tYXRjaChwcmVmaXhGaWxlUmVnZXgpKSB7XG5cdFx0cmV0dXJuIG5hbWUucmVwbGFjZShwcmVmaXhGaWxlUmVnZXgsIChtYXRjaCwgZzE/LCBnMj8sIGczPykgPT4ge1xuXHRcdFx0Y29uc3QgbnVtYmVyID0gcGFyc2VJbnQoZzEpO1xuXHRcdFx0cmV0dXJuIG51bWJlciA8IG1heE51bWJlclxuXHRcdFx0XHQ/IFN0cmluZyhudW1iZXIgKyAxKS5wYWRTdGFydChnMS5sZW5ndGgsICcwJykgKyBnMiArIGczXG5cdFx0XHRcdDogYCR7ZzF9JHtnMn0uMSR7ZzN9YDtcblx0XHR9KTtcblx0fVxuXG5cdC8vIDEudHh0PT4yLnR4dFxuXHRjb25zdCBwcmVmaXhGaWxlTm9OYW1lUmVnZXggPSBSZWdFeHAoJyhcXFxcZCspKFxcXFwuLiopJCcpO1xuXHRpZiAoIWlzRm9sZGVyICYmIG5hbWUubWF0Y2gocHJlZml4RmlsZU5vTmFtZVJlZ2V4KSkge1xuXHRcdHJldHVybiBuYW1lLnJlcGxhY2UocHJlZml4RmlsZU5vTmFtZVJlZ2V4LCAobWF0Y2gsIGcxPywgZzI/KSA9PiB7XG5cdFx0XHRjb25zdCBudW1iZXIgPSBwYXJzZUludChnMSk7XG5cdFx0XHRyZXR1cm4gbnVtYmVyIDwgbWF4TnVtYmVyXG5cdFx0XHRcdD8gU3RyaW5nKG51bWJlciArIDEpLnBhZFN0YXJ0KGcxLmxlbmd0aCwgJzAnKSArIGcyXG5cdFx0XHRcdDogYCR7ZzF9LjEke2cyfWA7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBmaWxlLnR4dD0+ZmlsZS4xLnR4dFxuXHRjb25zdCBsYXN0SW5kZXhPZkRvdCA9IG5hbWUubGFzdEluZGV4T2YoJy4nKTtcblx0aWYgKCFpc0ZvbGRlciAmJiBsYXN0SW5kZXhPZkRvdCA+PSAwKSB7XG5cdFx0cmV0dXJuIGAke25hbWUuc3Vic3RyKDAsIGxhc3RJbmRleE9mRG90KX0uMSR7bmFtZS5zdWJzdHIobGFzdEluZGV4T2ZEb3QpfWA7XG5cdH1cblxuXHQvLyAxMjMgPT4gMTI0XG5cdGNvbnN0IG5vTmFtZU5vRXh0ZW5zaW9uUmVnZXggPSBSZWdFeHAoJyhcXFxcZCspJCcpO1xuXHRpZiAoIWlzRm9sZGVyICYmIGxhc3RJbmRleE9mRG90ID09PSAtMSAmJiBuYW1lLm1hdGNoKG5vTmFtZU5vRXh0ZW5zaW9uUmVnZXgpKSB7XG5cdFx0cmV0dXJuIG5hbWUucmVwbGFjZShub05hbWVOb0V4dGVuc2lvblJlZ2V4LCAobWF0Y2gsIGcxPykgPT4ge1xuXHRcdFx0Y29uc3QgbnVtYmVyID0gcGFyc2VJbnQoZzEpO1xuXHRcdFx0cmV0dXJuIG51bWJlciA8IG1heE51bWJlclxuXHRcdFx0XHQ/IFN0cmluZyhudW1iZXIgKyAxKS5wYWRTdGFydChnMS5sZW5ndGgsICcwJylcblx0XHRcdFx0OiBgJHtnMX0uMWA7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBmaWxlID0+IGZpbGUxXG5cdC8vIGZpbGUxID0+IGZpbGUyXG5cdGNvbnN0IG5vRXh0ZW5zaW9uUmVnZXggPSBSZWdFeHAoJyguKikoXFxcXGQqKSQnKTtcblx0aWYgKCFpc0ZvbGRlciAmJiBsYXN0SW5kZXhPZkRvdCA9PT0gLTEgJiYgbmFtZS5tYXRjaChub0V4dGVuc2lvblJlZ2V4KSkge1xuXHRcdHJldHVybiBuYW1lLnJlcGxhY2Uobm9FeHRlbnNpb25SZWdleCwgKG1hdGNoLCBnMT8sIGcyPykgPT4ge1xuXHRcdFx0bGV0IG51bWJlciA9IHBhcnNlSW50KGcyKTtcblx0XHRcdGlmIChpc05hTihudW1iZXIpKSB7XG5cdFx0XHRcdG51bWJlciA9IDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVtYmVyIDwgbWF4TnVtYmVyXG5cdFx0XHRcdD8gZzEgKyBTdHJpbmcobnVtYmVyICsgMSkucGFkU3RhcnQoZzIubGVuZ3RoLCAnMCcpXG5cdFx0XHRcdDogYCR7ZzF9JHtnMn0uMWA7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBmb2xkZXIuMT0+Zm9sZGVyLjJcblx0aWYgKGlzRm9sZGVyICYmIG5hbWUubWF0Y2goLyhcXGQrKSQvKSkge1xuXHRcdHJldHVybiBuYW1lLnJlcGxhY2UoLyhcXGQrKSQvLCAobWF0Y2gsIC4uLmdyb3VwcykgPT4ge1xuXHRcdFx0Y29uc3QgbnVtYmVyID0gcGFyc2VJbnQoZ3JvdXBzWzBdKTtcblx0XHRcdHJldHVybiBudW1iZXIgPCBtYXhOdW1iZXJcblx0XHRcdFx0PyBTdHJpbmcobnVtYmVyICsgMSkucGFkU3RhcnQoZ3JvdXBzWzBdLmxlbmd0aCwgJzAnKVxuXHRcdFx0XHQ6IGAke2dyb3Vwc1swXX0uMWA7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAxLmZvbGRlcj0+Mi5mb2xkZXJcblx0aWYgKGlzRm9sZGVyICYmIG5hbWUubWF0Y2goL14oXFxkKykvKSkge1xuXHRcdHJldHVybiBuYW1lLnJlcGxhY2UoL14oXFxkKykoLiopJC8sIChtYXRjaCwgLi4uZ3JvdXBzKSA9PiB7XG5cdFx0XHRjb25zdCBudW1iZXIgPSBwYXJzZUludChncm91cHNbMF0pO1xuXHRcdFx0cmV0dXJuIG51bWJlciA8IG1heE51bWJlclxuXHRcdFx0XHQ/IFN0cmluZyhudW1iZXIgKyAxKS5wYWRTdGFydChncm91cHNbMF0ubGVuZ3RoLCAnMCcpICsgZ3JvdXBzWzFdXG5cdFx0XHRcdDogYCR7Z3JvdXBzWzBdfSR7Z3JvdXBzWzFdfS4xYDtcblx0XHR9KTtcblx0fVxuXG5cdC8vIGZpbGUvZm9sZGVyPT5maWxlLjEvZm9sZGVyLjFcblx0cmV0dXJuIGAke25hbWV9LjFgO1xufVxuXG4vKipcbiAqIENoZWNrcyB0byBzZWUgaWYgdGhlIHJlc291cmNlIGFscmVhZHkgZXhpc3RzLCBpZiBzbyBwcm9tcHRzIHRoZSB1c2VyIGlmIHRoZXkgd291bGQgYmUgb2sgd2l0aCBpdCBiZWluZyBvdmVyd3JpdHRlblxuICogQHBhcmFtIGZpbGVTZXJ2aWNlIFRoZSBmaWxlIHNlcnZpY2VcbiAqIEBwYXJhbSBkaWFsb2dTZXJ2aWNlIFRoZSBkaWFsb2cgc2VydmljZVxuICogQHBhcmFtIHRhcmdldFJlc291cmNlIFRoZSByZXNvdXJjZSB0byBiZSBvdmVyd3JpdHRlblxuICogQHJldHVybiBBIGJvb2xlYW4gaW5kaWNhdGluZyBpZiB0aGUgdXNlciBpcyBvayB3aXRoIHJlc291cmNlIGJlaW5nIG92ZXJ3cml0dGVuLCBpZiB0aGUgcmVzb3VyY2UgZG9lcyBub3QgZXhpc3QgaXQgcmV0dXJucyB0cnVlLlxuICovXG5hc3luYyBmdW5jdGlvbiBhc2tGb3JPdmVyd3JpdGUoZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsIHRhcmdldFJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgZXhpc3RzID0gYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHRhcmdldFJlc291cmNlKTtcblx0aWYgKCFleGlzdHMpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHQvLyBBc2sgZm9yIG92ZXJ3cml0ZSBjb25maXJtYXRpb25cblx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1PdmVyd3JpdGUnLCBcIkEgZmlsZSBvciBmb2xkZXIgd2l0aCB0aGUgbmFtZSAnezB9JyBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgZGVzdGluYXRpb24gZm9sZGVyLiBEbyB5b3Ugd2FudCB0byByZXBsYWNlIGl0P1wiLCBiYXNlbmFtZSh0YXJnZXRSZXNvdXJjZS5wYXRoKSksXG5cdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKCdyZXBsYWNlQnV0dG9uTGFiZWwnLCBcIiYmUmVwbGFjZVwiKVxuXHR9KTtcblx0cmV0dXJuIGNvbmZpcm1lZDtcbn1cblxuLy8gR2xvYmFsIENvbXBhcmUgd2l0aFxuZXhwb3J0IGNsYXNzIEdsb2JhbENvbXBhcmVSZXNvdXJjZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5jb21wYXJlRmlsZVdpdGgnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUyKCdnbG9iYWxDb21wYXJlRmlsZScsIFwiQ29tcGFyZSBBY3RpdmUgRmlsZSBXaXRoLi4uXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHbG9iYWxDb21wYXJlUmVzb3VyY2VzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IEdsb2JhbENvbXBhcmVSZXNvdXJjZXNBY3Rpb24uTEFCRUwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignY29tcGFyZUZpbGVXaXRoTWV0YScsIFwiT3BlbnMgYSBwaWNrZXIgdG8gc2VsZWN0IGEgZmlsZSB0byBkaWZmIHdpdGggdGhlIGFjdGl2ZSBlZGl0b3IuXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0TW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlSW5wdXQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRjb25zdCBhY3RpdmVSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlSW5wdXQpO1xuXHRcdGlmIChhY3RpdmVSZXNvdXJjZSAmJiB0ZXh0TW9kZWxTZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKGFjdGl2ZVJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgcGlja3MgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5waWNrKCcnLCB7IGl0ZW1BY3RpdmF0aW9uOiBJdGVtQWN0aXZhdGlvbi5TRUNPTkQgfSk7XG5cdFx0XHRpZiAocGlja3M/Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IChwaWNrc1swXSBhcyB1bmtub3duIGFzIHsgcmVzb3VyY2U6IHVua25vd24gfSkucmVzb3VyY2U7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2UpICYmIHRleHRNb2RlbFNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBhY3RpdmVSZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUF1dG9TYXZlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUF1dG9TYXZlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlQXV0b1NhdmVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigndG9nZ2xlQXV0b1NhdmUnLCBcIlRvZ2dsZSBBdXRvIFNhdmVcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3RvZ2dsZUF1dG9TYXZlRGVzY3JpcHRpb24nLCBcIlRvZ2dsZSB0aGUgYWJpbGl0eSB0byBzYXZlIGZpbGVzIGF1dG9tYXRpY2FsbHkgYWZ0ZXIgdHlwaW5nXCIpIH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRvZ2dsZUF1dG9TYXZlKCk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZVNhdmVBbGxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRwcml2YXRlIGxhc3REaXJ0eVN0YXRlOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCk7XG5cblx0XHR0aGlzLmxhc3REaXJ0eVN0YXRlID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UuaGFzRGlydHk7XG5cdFx0dGhpcy5lbmFibGVkID0gdGhpcy5sYXN0RGlydHlTdGF0ZTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb1J1bihjb250ZXh0OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gdXBkYXRlIGVuYWJsZW1lbnQgYmFzZWQgb24gd29ya2luZyBjb3B5IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZENoYW5nZURpcnR5KHdvcmtpbmdDb3B5ID0+IHRoaXMudXBkYXRlRW5hYmxlbWVudCh3b3JraW5nQ29weSkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRW5hYmxlbWVudCh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5KTogdm9pZCB7XG5cdFx0Y29uc3QgaGFzRGlydHkgPSB3b3JraW5nQ29weS5pc0RpcnR5KCkgfHwgdGhpcy53b3JraW5nQ29weVNlcnZpY2UuaGFzRGlydHk7XG5cdFx0aWYgKHRoaXMubGFzdERpcnR5U3RhdGUgIT09IGhhc0RpcnR5KSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSBoYXNEaXJ0eTtcblx0XHRcdHRoaXMubGFzdERpcnR5U3RhdGUgPSB0aGlzLmVuYWJsZWQ7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZG9SdW4oY29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcih0b0Vycm9yTWVzc2FnZShlcnJvciwgZmFsc2UpKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNhdmVBbGxJbkdyb3VwQWN0aW9uIGV4dGVuZHMgQmFzZVNhdmVBbGxBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnNhdmVBbGxJbkdyb3VwJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbmxzLmxvY2FsaXplKCdzYXZlQWxsSW5Hcm91cCcsIFwiU2F2ZSBBbGwgaW4gR3JvdXBcIik7XG5cblx0b3ZlcnJpZGUgZ2V0IGNsYXNzKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdleHBsb3Jlci1hY3Rpb24gJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNhdmVBbGwpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvUnVuKGNvbnRleHQ6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTQVZFX0FMTF9JTl9HUk9VUF9DT01NQU5EX0lELCB7fSwgY29udGV4dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENsb3NlR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLmNsb3NlR3JvdXAnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUoJ2Nsb3NlR3JvdXAnLCBcIkNsb3NlIEdyb3VwXCIpO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZUFsbCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGNvbnRleHQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0xPU0VfRURJVE9SU19BTkRfR1JPVVBfQ09NTUFORF9JRCwge30sIGNvbnRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c0ZpbGVzRXhwbG9yZXIgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5mb2N1c0ZpbGVzRXhwbG9yZXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUyKCdmb2N1c0ZpbGVzRXhwbG9yZXInLCBcIkZvY3VzIG9uIEZpbGVzIEV4cGxvcmVyXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGb2N1c0ZpbGVzRXhwbG9yZXIuSUQsXG5cdFx0XHR0aXRsZTogRm9jdXNGaWxlc0V4cGxvcmVyLkxBQkVMLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdmb2N1c0ZpbGVzRXhwbG9yZXJNZXRhZGF0YScsIFwiTW92ZXMgZm9jdXMgdG8gdGhlIGZpbGUgZXhwbG9yZXIgdmlldyBjb250YWluZXIuXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRhd2FpdCBwYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShWSUVXTEVUX0lELCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdHJ1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dBY3RpdmVGaWxlSW5FeHBsb3JlciBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnNob3dBY3RpdmVGaWxlSW5FeHBsb3Jlcic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3Nob3dJbkV4cGxvcmVyJywgXCJSZXZlYWwgQWN0aXZlIEZpbGUgaW4gRXhwbG9yZXIgVmlld1wiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2hvd0FjdGl2ZUZpbGVJbkV4cGxvcmVyLklELFxuXHRcdFx0dGl0bGU6IFNob3dBY3RpdmVGaWxlSW5FeHBsb3Jlci5MQUJFTCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignc2hvd0luRXhwbG9yZXJNZXRhZGF0YScsIFwiUmV2ZWFscyBhbmQgc2VsZWN0cyB0aGUgYWN0aXZlIGZpbGUgd2l0aGluIHRoZSBleHBsb3JlciB2aWV3LlwiKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJFVkVBTF9JTl9FWFBMT1JFUl9DT01NQU5EX0lELCByZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQWN0aXZlRmlsZUluRW1wdHlXb3Jrc3BhY2UgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5zaG93T3BlbmVkRmlsZUluTmV3V2luZG93Jztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbmxzLmxvY2FsaXplMignb3BlbkZpbGVJbkVtcHR5V29ya3NwYWNlJywgXCJPcGVuIEFjdGl2ZSBFZGl0b3IgaW4gTmV3IEVtcHR5IFdvcmtzcGFjZVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5BY3RpdmVGaWxlSW5FbXB0eVdvcmtzcGFjZS5JRCxcblx0XHRcdHRpdGxlOiBPcGVuQWN0aXZlRmlsZUluRW1wdHlXb3Jrc3BhY2UuTEFCRUwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFbXB0eVdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignb3BlbkZpbGVJbkVtcHR5V29ya3NwYWNlTWV0YWRhdGEnLCBcIk9wZW5zIHRoZSBhY3RpdmUgZWRpdG9yIGluIGEgbmV3IHdpbmRvdyB3aXRoIG5vIGZvbGRlcnMgb3Blbi5cIilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRpZiAoZmlsZVJlc291cmNlICYmIGZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKGZpbGVSZXNvdXJjZSkpIHtcblx0XHRcdGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgZmlsZVVyaTogZmlsZVJlc291cmNlIH1dLCB7IGZvcmNlTmV3V2luZG93OiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaWFsb2dTZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnb3BlbkZpbGVUb1Nob3dJbk5ld1dpbmRvdy51bnN1cHBvcnRlZHNjaGVtYScsIFwiVGhlIGFjdGl2ZSBlZGl0b3IgbXVzdCBjb250YWluIGFuIG9wZW5hYmxlIHJlc291cmNlLlwiKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUZpbGVOYW1lKHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsIGl0ZW06IEV4cGxvcmVySXRlbSwgbmFtZTogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtKTogeyBjb250ZW50OiBzdHJpbmc7IHNldmVyaXR5OiBTZXZlcml0eSB9IHwgbnVsbCB7XG5cdC8vIFByb2R1Y2UgYSB3ZWxsIGZvcm1lZCBmaWxlIG5hbWVcblx0bmFtZSA9IGdldFdlbGxGb3JtZWRGaWxlTmFtZShuYW1lKTtcblxuXHQvLyBOYW1lIG5vdCBwcm92aWRlZFxuXHRpZiAoIW5hbWUgfHwgbmFtZS5sZW5ndGggPT09IDAgfHwgL15cXHMrJC8udGVzdChuYW1lKSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBubHMubG9jYWxpemUoJ2VtcHR5RmlsZU5hbWVFcnJvcicsIFwiQSBmaWxlIG9yIGZvbGRlciBuYW1lIG11c3QgYmUgcHJvdmlkZWQuXCIpLFxuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yXG5cdFx0fTtcblx0fVxuXG5cdC8vIFJlbGF0aXZlIHBhdGhzIG9ubHlcblx0aWYgKG5hbWVbMF0gPT09ICcvJyB8fCBuYW1lWzBdID09PSAnXFxcXCcpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogbmxzLmxvY2FsaXplKCdmaWxlTmFtZVN0YXJ0c1dpdGhTbGFzaEVycm9yJywgXCJBIGZpbGUgb3IgZm9sZGVyIG5hbWUgY2Fubm90IHN0YXJ0IHdpdGggYSBzbGFzaC5cIiksXG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3Jcblx0XHR9O1xuXHR9XG5cblx0Y29uc3QgbmFtZXMgPSBjb2FsZXNjZShuYW1lLnNwbGl0KC9bXFxcXC9dLykpO1xuXHRjb25zdCBwYXJlbnQgPSBpdGVtLnBhcmVudDtcblxuXHRpZiAobmFtZSAhPT0gaXRlbS5uYW1lKSB7XG5cdFx0Ly8gRG8gbm90IGFsbG93IHRvIG92ZXJ3cml0ZSBleGlzdGluZyBmaWxlXG5cdFx0Y29uc3QgY2hpbGQgPSBwYXJlbnQ/LmdldENoaWxkKG5hbWUpO1xuXHRcdGlmIChjaGlsZCAmJiBjaGlsZCAhPT0gaXRlbSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogbmxzLmxvY2FsaXplKCdmaWxlTmFtZUV4aXN0c0Vycm9yJywgXCJBIGZpbGUgb3IgZm9sZGVyICoqezB9KiogYWxyZWFkeSBleGlzdHMgYXQgdGhpcyBsb2NhdGlvbi4gUGxlYXNlIGNob29zZSBhIGRpZmZlcmVudCBuYW1lLlwiLCBuYW1lKSxcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdC8vIENoZWNrIGZvciBpbnZhbGlkIGZpbGUgbmFtZS5cblx0aWYgKG5hbWVzLnNvbWUoZm9sZGVyTmFtZSA9PiAhcGF0aFNlcnZpY2UuaGFzVmFsaWRCYXNlbmFtZShpdGVtLnJlc291cmNlLCBvcywgZm9sZGVyTmFtZSkpKSB7XG5cdFx0Ly8gRXNjYXBlICogY2hhcmFjdGVyc1xuXHRcdGNvbnN0IGVzY2FwZWROYW1lID0gbmFtZS5yZXBsYWNlKC9cXCovZywgJ1xcXFwqJyk7IC8vIENvZGVRTCBbU00wMjM4M10gVGhpcyBvbmx5IHByb2Nlc3NlcyBmaWxlbmFtZXMgd2hpY2ggYXJlIGVuZm9yY2VkIGFnYWluc3QgaGF2aW5nIGJhY2tzbGFzaGVzIGluIHRoZW0gZmFydGhlciB1cCBpbiB0aGUgc3RhY2suXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IG5scy5sb2NhbGl6ZSgnaW52YWxpZEZpbGVOYW1lRXJyb3InLCBcIlRoZSBuYW1lICoqezB9KiogaXMgbm90IHZhbGlkIGFzIGEgZmlsZSBvciBmb2xkZXIgbmFtZS4gUGxlYXNlIGNob29zZSBhIGRpZmZlcmVudCBuYW1lLlwiLCB0cmltTG9uZ05hbWUoZXNjYXBlZE5hbWUpKSxcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvclxuXHRcdH07XG5cdH1cblxuXHRpZiAobmFtZXMuc29tZShuYW1lID0+IC9eXFxzfFxccyQvLnRlc3QobmFtZSkpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IG5scy5sb2NhbGl6ZSgnZmlsZU5hbWVXaGl0ZXNwYWNlV2FybmluZycsIFwiTGVhZGluZyBvciB0cmFpbGluZyB3aGl0ZXNwYWNlIGRldGVjdGVkIGluIGZpbGUgb3IgZm9sZGVyIG5hbWUuXCIpLFxuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmdcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHRyaW1Mb25nTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAobmFtZT8ubGVuZ3RoID4gMjU1KSB7XG5cdFx0cmV0dXJuIGAke25hbWUuc3Vic3RyKDAsIDI1NSl9Li4uYDtcblx0fVxuXG5cdHJldHVybiBuYW1lO1xufVxuXG5mdW5jdGlvbiBnZXRXZWxsRm9ybWVkRmlsZU5hbWUoZmlsZW5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghZmlsZW5hbWUpIHtcblx0XHRyZXR1cm4gZmlsZW5hbWU7XG5cdH1cblxuXHQvLyBUcmltIHRhYnNcblx0ZmlsZW5hbWUgPSB0cmltKGZpbGVuYW1lLCAnXFx0Jyk7XG5cblx0Ly8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoZXNcblx0ZmlsZW5hbWUgPSBydHJpbShmaWxlbmFtZSwgJy8nKTtcblx0ZmlsZW5hbWUgPSBydHJpbShmaWxlbmFtZSwgJ1xcXFwnKTtcblxuXHRyZXR1cm4gZmlsZW5hbWU7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wYXJlTmV3VW50aXRsZWRUZXh0RmlsZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5jb21wYXJlTmV3VW50aXRsZWRUZXh0RmlsZXMnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUyKCdjb21wYXJlTmV3VW50aXRsZWRUZXh0RmlsZXMnLCBcIkNvbXBhcmUgTmV3IFVudGl0bGVkIFRleHQgRmlsZXNcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbXBhcmVOZXdVbnRpdGxlZFRleHRGaWxlc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBDb21wYXJlTmV3VW50aXRsZWRUZXh0RmlsZXNBY3Rpb24uTEFCRUwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2NvbXBhcmVOZXdVbnRpdGxlZFRleHRGaWxlc01ldGEnLCBcIk9wZW5zIGEgbmV3IGRpZmYgZWRpdG9yIHdpdGggdHdvIHVudGl0bGVkIGZpbGVzLlwiKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wYXJlV2l0aENsaXBib2FyZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLmNvbXBhcmVXaXRoQ2xpcGJvYXJkJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbmxzLmxvY2FsaXplMignY29tcGFyZVdpdGhDbGlwYm9hcmQnLCBcIkNvbXBhcmUgQWN0aXZlIEZpbGUgd2l0aCBDbGlwYm9hcmRcIik7XG5cblx0cHJpdmF0ZSByZWdpc3RyYXRpb25EaXNwb3NhbDogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3RhdGljIFNDSEVNRV9DT1VOVEVSID0gMDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tcGFyZVdpdGhDbGlwYm9hcmRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogQ29tcGFyZVdpdGhDbGlwYm9hcmRBY3Rpb24uTEFCRUwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0a2V5YmluZGluZzogeyBwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlDKSwgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgfSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdjb21wYXJlV2l0aENsaXBib2FyZE1ldGEnLCBcIk9wZW5zIGEgbmV3IGRpZmYgZWRpdG9yIHRvIGNvbXBhcmUgdGhlIGFjdGl2ZSBmaWxlIHdpdGggdGhlIGNvbnRlbnRzIG9mIHRoZSBjbGlwYm9hcmQuXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRjb25zdCBzY2hlbWUgPSBgY2xpcGJvYXJkQ29tcGFyZSR7Q29tcGFyZVdpdGhDbGlwYm9hcmRBY3Rpb24uU0NIRU1FX0NPVU5URVIrK31gO1xuXHRcdGlmIChyZXNvdXJjZSAmJiAoZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpIHx8IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkpIHtcblx0XHRcdGlmICghdGhpcy5yZWdpc3RyYXRpb25EaXNwb3NhbCkge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsaXBib2FyZENvbnRlbnRQcm92aWRlcik7XG5cdFx0XHRcdHRoaXMucmVnaXN0cmF0aW9uRGlzcG9zYWwgPSB0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuYW1lID0gcmVzb3VyY2VzLmJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IGVkaXRvckxhYmVsID0gbmxzLmxvY2FsaXplKCdjbGlwYm9hcmRDb21wYXJpc29uTGFiZWwnLCBcIkNsaXBib2FyZCBcdTIxOTQgezB9XCIsIG5hbWUpO1xuXG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogcmVzb3VyY2Uud2l0aCh7IHNjaGVtZSB9KSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogcmVzb3VyY2UgfSxcblx0XHRcdFx0bGFiZWw6IGVkaXRvckxhYmVsLFxuXHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zZSh0aGlzLnJlZ2lzdHJhdGlvbkRpc3Bvc2FsKTtcblx0XHRcdFx0dGhpcy5yZWdpc3RyYXRpb25EaXNwb3NhbCA9IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLnJlZ2lzdHJhdGlvbkRpc3Bvc2FsKTtcblx0XHR0aGlzLnJlZ2lzdHJhdGlvbkRpc3Bvc2FsID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIENsaXBib2FyZENvbnRlbnRQcm92aWRlciBpbXBsZW1lbnRzIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS5yZWFkVGV4dCgpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwodGV4dCwgdGhpcy5sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlKSwgcmVzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG9uRXJyb3JXaXRoUmV0cnkobm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsIGVycm9yOiB1bmtub3duLCByZXRyeTogKCkgPT4gUHJvbWlzZTx1bmtub3duPik6IHZvaWQge1xuXHRub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgdG9FcnJvck1lc3NhZ2UoZXJyb3IsIGZhbHNlKSxcblx0XHRbe1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmV0cnknLCBcIlJldHJ5XCIpLFxuXHRcdFx0cnVuOiAoKSA9PiByZXRyeSgpXG5cdFx0fV1cblx0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gb3BlbkV4cGxvcmVyQW5kQ3JlYXRlKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpc0ZvbGRlcjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZmlsZXNDb25maWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdGNvbnN0IHJlbW90ZUFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0Y29uc3QgcGF0aFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhdGhTZXJ2aWNlKTtcblxuXHRjb25zdCBleHBsb3JlclZpZXdJZCA9IGV4cGxvcmVyU2VydmljZS5nZXRWaWV3SWQoKSA/PyBWSUVXX0lEO1xuXHRjb25zdCB3YXNIaWRkZW4gPSAhdmlld3NTZXJ2aWNlLmlzVmlld1Zpc2libGUoZXhwbG9yZXJWaWV3SWQpO1xuXHRjb25zdCB2aWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KGV4cGxvcmVyVmlld0lkLCB0cnVlKTtcblx0aWYgKHdhc0hpZGRlbikge1xuXHRcdC8vIEdpdmUgZXhwbG9yZXIgc29tZSB0aW1lIHRvIHJlc29sdmUgaXRzZWxmICMxMTEyMThcblx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdH1cblx0aWYgKCF2aWV3KSB7XG5cdFx0Ly8gQ2FuIGhhcHBlbiBpbiBlbXB0eSB3b3Jrc3BhY2UgY2FzZSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMDYwNClcblxuXHRcdGlmIChpc0ZvbGRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdPcGVuIGEgZm9sZGVyIG9yIHdvcmtzcGFjZSBmaXJzdC4nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCk7XG5cdH1cblxuXHRjb25zdCBzdGF0cyA9IGV4cGxvcmVyU2VydmljZS5nZXRDb250ZXh0KGZhbHNlKTtcblx0Y29uc3Qgc3RhdCA9IHN0YXRzLmxlbmd0aCA+IDAgPyBzdGF0c1swXSA6IHVuZGVmaW5lZDtcblx0bGV0IGZvbGRlcjogRXhwbG9yZXJJdGVtO1xuXHRpZiAoc3RhdCkge1xuXHRcdGZvbGRlciA9IHN0YXQuaXNEaXJlY3RvcnkgPyBzdGF0IDogKHN0YXQucGFyZW50IHx8IGV4cGxvcmVyU2VydmljZS5yb290c1swXSk7XG5cdH0gZWxzZSB7XG5cdFx0Zm9sZGVyID0gZXhwbG9yZXJTZXJ2aWNlLnJvb3RzWzBdO1xuXHR9XG5cblx0aWYgKGZvbGRlci5pc1JlYWRvbmx5KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdQYXJlbnQgZm9sZGVyIGlzIHJlYWRvbmx5LicpO1xuXHR9XG5cblx0Y29uc3QgbmV3U3RhdCA9IG5ldyBOZXdFeHBsb3Jlckl0ZW0oZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UsIGZpbGVzQ29uZmlnU2VydmljZSwgZm9sZGVyLCBpc0ZvbGRlcik7XG5cdGZvbGRlci5hZGRDaGlsZChuZXdTdGF0KTtcblxuXHRjb25zdCBvblN1Y2Nlc3MgPSBhc3luYyAodmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVRvQ3JlYXRlID0gcmVzb3VyY2VzLmpvaW5QYXRoKGZvbGRlci5yZXNvdXJjZSwgdmFsdWUpO1xuXHRcdFx0aWYgKHZhbHVlLmVuZHNXaXRoKCcvJykpIHtcblx0XHRcdFx0aXNGb2xkZXIgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLmFwcGx5QnVsa0VkaXQoW25ldyBSZXNvdXJjZUZpbGVFZGl0KHVuZGVmaW5lZCwgcmVzb3VyY2VUb0NyZWF0ZSwgeyBmb2xkZXI6IGlzRm9sZGVyIH0pXSwge1xuXHRcdFx0XHR1bmRvTGFiZWw6IG5scy5sb2NhbGl6ZSgnY3JlYXRlQnVsa0VkaXQnLCBcIkNyZWF0ZSB7MH1cIiwgdmFsdWUpLFxuXHRcdFx0XHRwcm9ncmVzc0xhYmVsOiBubHMubG9jYWxpemUoJ2NyZWF0aW5nQnVsa0VkaXQnLCBcIkNyZWF0aW5nIHswfVwiLCB2YWx1ZSksXG5cdFx0XHRcdGNvbmZpcm1CZWZvcmVVbmRvOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHJlZnJlc2hJZlNlcGFyYXRvcih2YWx1ZSwgZXhwbG9yZXJTZXJ2aWNlKTtcblxuXHRcdFx0aWYgKGlzRm9sZGVyKSB7XG5cdFx0XHRcdGF3YWl0IGV4cGxvcmVyU2VydmljZS5zZWxlY3QocmVzb3VyY2VUb0NyZWF0ZSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogcmVzb3VyY2VUb0NyZWF0ZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25FcnJvcldpdGhSZXRyeShub3RpZmljYXRpb25TZXJ2aWNlLCBlcnJvciwgKCkgPT4gb25TdWNjZXNzKHZhbHVlKSk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IG9zID0gKGF3YWl0IHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpKT8ub3MgPz8gT1M7XG5cblx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLnNldEVkaXRhYmxlKG5ld1N0YXQsIHtcblx0XHR2YWxpZGF0aW9uTWVzc2FnZTogdmFsdWUgPT4gdmFsaWRhdGVGaWxlTmFtZShwYXRoU2VydmljZSwgbmV3U3RhdCwgdmFsdWUsIG9zKSxcblx0XHRvbkZpbmlzaDogYXN5bmMgKHZhbHVlLCBzdWNjZXNzKSA9PiB7XG5cdFx0XHRmb2xkZXIucmVtb3ZlQ2hpbGQobmV3U3RhdCk7XG5cdFx0XHRhd2FpdCBleHBsb3JlclNlcnZpY2Uuc2V0RWRpdGFibGUobmV3U3RhdCwgbnVsbCk7XG5cdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRvblN1Y2Nlc3ModmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IE5FV19GSUxFX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdGF3YWl0IG9wZW5FeHBsb3JlckFuZENyZWF0ZShhY2Nlc3NvciwgZmFsc2UpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogTkVXX0ZPTERFUl9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRhd2FpdCBvcGVuRXhwbG9yZXJBbmRDcmVhdGUoYWNjZXNzb3IsIHRydWUpO1xuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IHJlbmFtZUhhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgcmVtb3RlQWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRjb25zdCBwYXRoU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGF0aFNlcnZpY2UpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IHN0YXRzID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQoZmFsc2UpO1xuXHRjb25zdCBzdGF0ID0gc3RhdHMubGVuZ3RoID4gMCA/IHN0YXRzWzBdIDogdW5kZWZpbmVkO1xuXHRpZiAoIXN0YXQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBvcyA9IChhd2FpdCByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKSk/Lm9zID8/IE9TO1xuXG5cdGF3YWl0IGV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZShzdGF0LCB7XG5cdFx0dmFsaWRhdGlvbk1lc3NhZ2U6IHZhbHVlID0+IHZhbGlkYXRlRmlsZU5hbWUocGF0aFNlcnZpY2UsIHN0YXQsIHZhbHVlLCBvcyksXG5cdFx0b25GaW5pc2g6IGFzeW5jICh2YWx1ZSwgc3VjY2VzcykgPT4ge1xuXHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50UmVzb3VyY2UgPSBzdGF0LnBhcmVudCEucmVzb3VyY2U7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gcmVzb3VyY2VzLmpvaW5QYXRoKHBhcmVudFJlc291cmNlLCB2YWx1ZSk7XG5cdFx0XHRcdGlmIChzdGF0LnJlc291cmNlLnRvU3RyaW5nKCkgIT09IHRhcmdldFJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLmFwcGx5QnVsa0VkaXQoW25ldyBSZXNvdXJjZUZpbGVFZGl0KHN0YXQucmVzb3VyY2UsIHRhcmdldFJlc291cmNlKV0sIHtcblx0XHRcdFx0XHRcdFx0Y29uZmlybUJlZm9yZVVuZG86IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCkuZXhwbG9yZXIuY29uZmlybVVuZG8gPT09IFVuZG9Db25maXJtTGV2ZWwuVmVyYm9zZSxcblx0XHRcdFx0XHRcdFx0dW5kb0xhYmVsOiBubHMubG9jYWxpemUoJ3JlbmFtZUJ1bGtFZGl0JywgXCJSZW5hbWUgezB9IHRvIHsxfVwiLCBzdGF0Lm5hbWUsIHZhbHVlKSxcblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NMYWJlbDogbmxzLmxvY2FsaXplKCdyZW5hbWluZ0J1bGtFZGl0JywgXCJSZW5hbWluZyB7MH0gdG8gezF9XCIsIHN0YXQubmFtZSwgdmFsdWUpLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRhd2FpdCByZWZyZXNoSWZTZXBhcmF0b3IodmFsdWUsIGV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IGV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZShzdGF0LCBudWxsKTtcblx0XHR9XG5cdH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IG1vdmVGaWxlVG9UcmFzaEhhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBzdGF0cyA9IGV4cGxvcmVyU2VydmljZS5nZXRDb250ZXh0KHRydWUpLmZpbHRlcihzID0+ICFzLmlzUm9vdCk7XG5cdGlmIChzdGF0cy5sZW5ndGgpIHtcblx0XHRhd2FpdCBkZWxldGVGaWxlcyhhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSksIGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlGaWxlU2VydmljZSksIGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSksIGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UpLCBzdGF0cywgdHJ1ZSk7XG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBkZWxldGVGaWxlSGFuZGxlciA9IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdGNvbnN0IHN0YXRzID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQodHJ1ZSkuZmlsdGVyKHMgPT4gIXMuaXNSb290KTtcblxuXHRpZiAoc3RhdHMubGVuZ3RoKSB7XG5cdFx0YXdhaXQgZGVsZXRlRmlsZXMoYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgc3RhdHMsIGZhbHNlKTtcblx0fVxufTtcblxubGV0IHBhc3RlU2hvdWxkTW92ZSA9IGZhbHNlO1xuZXhwb3J0IGNvbnN0IGNvcHlGaWxlSGFuZGxlciA9IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdGNvbnN0IHN0YXRzID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQodHJ1ZSk7XG5cdGlmIChzdGF0cy5sZW5ndGggPiAwKSB7XG5cdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLnNldFRvQ29weShzdGF0cywgZmFsc2UpO1xuXHRcdHBhc3RlU2hvdWxkTW92ZSA9IGZhbHNlO1xuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgY3V0RmlsZUhhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBzdGF0cyA9IGV4cGxvcmVyU2VydmljZS5nZXRDb250ZXh0KHRydWUpO1xuXHRpZiAoc3RhdHMubGVuZ3RoID4gMCkge1xuXHRcdGF3YWl0IGV4cGxvcmVyU2VydmljZS5zZXRUb0NvcHkoc3RhdHMsIHRydWUpO1xuXHRcdHBhc3RlU2hvdWxkTW92ZSA9IHRydWU7XG5cdH1cbn07XG5cbmNvbnN0IGRvd25sb2FkRmlsZUhhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBjb250ZXh0ID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQodHJ1ZSk7XG5cdGNvbnN0IGV4cGxvcmVySXRlbXMgPSBjb250ZXh0Lmxlbmd0aCA/IGNvbnRleHQgOiBleHBsb3JlclNlcnZpY2Uucm9vdHM7XG5cblx0Y29uc3QgZG93bmxvYWRIYW5kbGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZURvd25sb2FkKTtcblxuXHR0cnkge1xuXHRcdGF3YWl0IGRvd25sb2FkSGFuZGxlci5kb3dubG9hZChleHBsb3Jlckl0ZW1zKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblxuXHRcdHRocm93IGVycm9yO1xuXHR9XG59O1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBET1dOTE9BRF9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBkb3dubG9hZEZpbGVIYW5kbGVyXG59KTtcblxuY29uc3QgdXBsb2FkRmlsZUhhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBjb250ZXh0ID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQoZmFsc2UpO1xuXHRjb25zdCBlbGVtZW50ID0gY29udGV4dC5sZW5ndGggPyBjb250ZXh0WzBdIDogZXhwbG9yZXJTZXJ2aWNlLnJvb3RzWzBdO1xuXG5cdHRyeSB7XG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCB0cmlnZ2VyVXBsb2FkKCk7XG5cdFx0aWYgKGZpbGVzKSB7XG5cdFx0XHRjb25zdCBicm93c2VyVXBsb2FkID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlckZpbGVVcGxvYWQpO1xuXHRcdFx0YXdhaXQgYnJvd3NlclVwbG9hZC51cGxvYWQoZWxlbWVudCwgZmlsZXMpO1xuXHRcdH1cblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblxuXHRcdHRocm93IGVycm9yO1xuXHR9XG59O1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBVUExPQURfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogdXBsb2FkRmlsZUhhbmRsZXJcbn0pO1xuXG5leHBvcnQgY29uc3QgcGFzdGVGaWxlSGFuZGxlciA9IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZmlsZUxpc3Q/OiBGaWxlTGlzdCkgPT4ge1xuXHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cblx0Y29uc3QgY29udGV4dCA9IGV4cGxvcmVyU2VydmljZS5nZXRDb250ZXh0KGZhbHNlKTtcblx0Y29uc3QgaGFzTmF0aXZlRmlsZXNUb1Bhc3RlID0gZmlsZUxpc3QgJiYgZmlsZUxpc3QubGVuZ3RoID4gMDtcblx0Y29uc3QgY29uZmlybVBhc3RlTmF0aXZlID0gaGFzTmF0aXZlRmlsZXNUb1Bhc3RlICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdleHBsb3Jlci5jb25maXJtUGFzdGVOYXRpdmUnKTtcblxuXHRjb25zdCB0b1Bhc3RlID0gYXdhaXQgZ2V0RmlsZXNUb1Bhc3RlKGZpbGVMaXN0LCBjbGlwYm9hcmRTZXJ2aWNlLCBob3N0U2VydmljZSk7XG5cblx0aWYgKGNvbmZpcm1QYXN0ZU5hdGl2ZSAmJiB0b1Bhc3RlLmZpbGVzLmxlbmd0aCA+PSAxKSB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHRvUGFzdGUuZmlsZXMubGVuZ3RoID4gMSA/XG5cdFx0XHRubHMubG9jYWxpemUoJ2NvbmZpcm1NdWx0aVBhc3RlTmF0aXZlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcGFzdGUgdGhlIGZvbGxvd2luZyB7MH0gaXRlbXM/XCIsIHRvUGFzdGUuZmlsZXMubGVuZ3RoKSA6XG5cdFx0XHRubHMubG9jYWxpemUoJ2NvbmZpcm1QYXN0ZU5hdGl2ZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHBhc3RlICd7MH0nP1wiLCBiYXNlbmFtZSh0b1Bhc3RlLnR5cGUgPT09ICdwYXRocycgPyB0b1Bhc3RlLmZpbGVzWzBdLmZzUGF0aCA6IHRvUGFzdGUuZmlsZXNbMF0ubmFtZSkpO1xuXHRcdGNvbnN0IGRldGFpbCA9IHRvUGFzdGUuZmlsZXMubGVuZ3RoID4gMSA/IGdldEZpbGVOYW1lc01lc3NhZ2UodG9QYXN0ZS5maWxlcy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRpZiAoVVJJLmlzVXJpKGl0ZW0pKSB7XG5cdFx0XHRcdHJldHVybiBpdGVtLmZzUGF0aDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRvUGFzdGUudHlwZSA9PT0gJ3BhdGhzJykge1xuXHRcdFx0XHRjb25zdCBwYXRoID0gZ2V0UGF0aEZvckZpbGUoaXRlbSk7XG5cdFx0XHRcdGlmIChwYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhdGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGl0ZW0ubmFtZTtcblx0XHR9KSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWwsXG5cdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdkb05vdEFza0FnYWluJywgXCJEbyBub3QgYXNrIG1lIGFnYWluXCIpXG5cdFx0XHR9LFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAncGFzdGVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlBhc3RlXCIpXG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbmZpcm1hdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgY29uZmlybWF0aW9uIGNoZWNrYm94XG5cdFx0aWYgKGNvbmZpcm1hdGlvbi5jaGVja2JveENoZWNrZWQgPT09IHRydWUpIHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdleHBsb3Jlci5jb25maXJtUGFzdGVOYXRpdmUnLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IGVsZW1lbnQgPSBjb250ZXh0Lmxlbmd0aCA/IGNvbnRleHRbMF0gOiBleHBsb3JlclNlcnZpY2Uucm9vdHNbMF07XG5cdGNvbnN0IGluY3JlbWVudGFsTmFtaW5nID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5pbmNyZW1lbnRhbE5hbWluZztcblxuXHRjb25zdCBlZGl0YWJsZUl0ZW0gPSBleHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGUoKTtcblx0Ly8gSWYgaXQncyBhbiBlZGl0YWJsZSBpdGVtLCBqdXN0IGRvIG5vdGhpbmdcblx0aWYgKGVkaXRhYmxlSXRlbSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHRyeSB7XG5cdFx0bGV0IHRhcmdldHM6IFVSSVtdID0gW107XG5cblx0XHRpZiAodG9QYXN0ZS50eXBlID09PSAncGF0aHMnKSB7IC8vIFBhc3RpbmcgZnJvbSBmaWxlcyBvbiBkaXNrXG5cblx0XHRcdC8vIENoZWNrIGlmIHRhcmdldCBpcyBhbmNlc3RvciBvZiBwYXN0ZWQgZm9sZGVyXG5cdFx0XHRjb25zdCBzb3VyY2VUYXJnZXRQYWlycyA9IGNvYWxlc2NlKGF3YWl0IFByb21pc2UuYWxsKHRvUGFzdGUuZmlsZXMubWFwKGFzeW5jIGZpbGVUb1Bhc3RlID0+IHtcblx0XHRcdFx0aWYgKGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gZmlsZVRvUGFzdGUudG9TdHJpbmcoKSAmJiByZXNvdXJjZXMuaXNFcXVhbE9yUGFyZW50KGVsZW1lbnQucmVzb3VyY2UsIGZpbGVUb1Bhc3RlKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2ZpbGVJc0FuY2VzdG9yJywgXCJGaWxlIHRvIHBhc3RlIGlzIGFuIGFuY2VzdG9yIG9mIHRoZSBkZXN0aW5hdGlvbiBmb2xkZXJcIikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZpbGVUb1Bhc3RlU3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnN0YXQoZmlsZVRvUGFzdGUpO1xuXG5cdFx0XHRcdC8vIEZpbmQgdGFyZ2V0XG5cdFx0XHRcdGxldCB0YXJnZXQ6IEV4cGxvcmVySXRlbTtcblx0XHRcdFx0aWYgKHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlbGVtZW50LnJlc291cmNlLCBmaWxlVG9QYXN0ZSkpIHtcblx0XHRcdFx0XHR0YXJnZXQgPSBlbGVtZW50LnBhcmVudCE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGFyZ2V0ID0gZWxlbWVudC5pc0RpcmVjdG9yeSA/IGVsZW1lbnQgOiBlbGVtZW50LnBhcmVudCE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YXJnZXRGaWxlID0gYXdhaXQgZmluZFZhbGlkUGFzdGVGaWxlVGFyZ2V0KFxuXHRcdFx0XHRcdGV4cGxvcmVyU2VydmljZSxcblx0XHRcdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdFx0XHRkaWFsb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBmaWxlVG9QYXN0ZSwgaXNEaXJlY3Rvcnk6IGZpbGVUb1Bhc3RlU3RhdC5pc0RpcmVjdG9yeSwgYWxsb3dPdmVyd3JpdGU6IHBhc3RlU2hvdWxkTW92ZSB8fCBpbmNyZW1lbnRhbE5hbWluZyA9PT0gJ2Rpc2FibGVkJyB9LFxuXHRcdFx0XHRcdGluY3JlbWVudGFsTmFtaW5nXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0aWYgKCF0YXJnZXRGaWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IHNvdXJjZTogZmlsZVRvUGFzdGUsIHRhcmdldDogdGFyZ2V0RmlsZSB9O1xuXHRcdFx0fSkpKTtcblxuXHRcdFx0aWYgKHNvdXJjZVRhcmdldFBhaXJzLmxlbmd0aCA+PSAxKSB7XG5cdFx0XHRcdC8vIE1vdmUvQ29weSBGaWxlXG5cdFx0XHRcdGlmIChwYXN0ZVNob3VsZE1vdmUpIHtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZUZpbGVFZGl0cyA9IHNvdXJjZVRhcmdldFBhaXJzLm1hcChwYWlyID0+IG5ldyBSZXNvdXJjZUZpbGVFZGl0KHBhaXIuc291cmNlLCBwYWlyLnRhcmdldCwgeyBvdmVyd3JpdGU6IGluY3JlbWVudGFsTmFtaW5nID09PSAnZGlzYWJsZWQnIH0pKTtcblx0XHRcdFx0XHRjb25zdCBvcHRpb25zID0ge1xuXHRcdFx0XHRcdFx0Y29uZmlybUJlZm9yZVVuZG86IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCkuZXhwbG9yZXIuY29uZmlybVVuZG8gPT09IFVuZG9Db25maXJtTGV2ZWwuVmVyYm9zZSxcblx0XHRcdFx0XHRcdHByb2dyZXNzTGFiZWw6IHNvdXJjZVRhcmdldFBhaXJzLmxlbmd0aCA+IDEgPyBubHMubG9jYWxpemUoeyBrZXk6ICdtb3ZpbmdCdWxrRWRpdCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgd2lsbCBiZSByZXBsYWNlZCBieSB0aGUgbnVtYmVyIG9mIGZpbGVzIGJlaW5nIG1vdmVkJ10gfSwgXCJNb3ZpbmcgezB9IGZpbGVzXCIsIHNvdXJjZVRhcmdldFBhaXJzLmxlbmd0aClcblx0XHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoeyBrZXk6ICdtb3ZpbmdGaWxlQnVsa0VkaXQnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVyIHdpbGwgYmUgcmVwbGFjZWQgYnkgdGhlIG5hbWUgb2YgdGhlIGZpbGUgbW92ZWQuJ10gfSwgXCJNb3ZpbmcgezB9XCIsIHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KHNvdXJjZVRhcmdldFBhaXJzWzBdLnRhcmdldCkpLFxuXHRcdFx0XHRcdFx0dW5kb0xhYmVsOiBzb3VyY2VUYXJnZXRQYWlycy5sZW5ndGggPiAxID8gbmxzLmxvY2FsaXplKHsga2V5OiAnbW92ZUJ1bGtFZGl0JywgY29tbWVudDogWydQbGFjZWhvbGRlciB3aWxsIGJlIHJlcGxhY2VkIGJ5IHRoZSBudW1iZXIgb2YgZmlsZXMgYmVpbmcgbW92ZWQnXSB9LCBcIk1vdmUgezB9IGZpbGVzXCIsIHNvdXJjZVRhcmdldFBhaXJzLmxlbmd0aClcblx0XHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoeyBrZXk6ICdtb3ZlRmlsZUJ1bGtFZGl0JywgY29tbWVudDogWydQbGFjZWhvbGRlciB3aWxsIGJlIHJlcGxhY2VkIGJ5IHRoZSBuYW1lIG9mIHRoZSBmaWxlIG1vdmVkLiddIH0sIFwiTW92ZSB7MH1cIiwgcmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkoc291cmNlVGFyZ2V0UGFpcnNbMF0udGFyZ2V0KSlcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGF3YWl0IGV4cGxvcmVyU2VydmljZS5hcHBseUJ1bGtFZGl0KHJlc291cmNlRmlsZUVkaXRzLCBvcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZUZpbGVFZGl0cyA9IHNvdXJjZVRhcmdldFBhaXJzLm1hcChwYWlyID0+IG5ldyBSZXNvdXJjZUZpbGVFZGl0KHBhaXIuc291cmNlLCBwYWlyLnRhcmdldCwgeyBjb3B5OiB0cnVlLCBvdmVyd3JpdGU6IGluY3JlbWVudGFsTmFtaW5nID09PSAnZGlzYWJsZWQnIH0pKTtcblx0XHRcdFx0XHRhd2FpdCBhcHBseUNvcHlSZXNvdXJjZUVkaXQoc291cmNlVGFyZ2V0UGFpcnMubWFwKHBhaXIgPT4gcGFpci50YXJnZXQpLCByZXNvdXJjZUZpbGVFZGl0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGFyZ2V0cyA9IHNvdXJjZVRhcmdldFBhaXJzLm1hcChwYWlyID0+IHBhaXIudGFyZ2V0KTtcblxuXHRcdH0gZWxzZSB7IC8vIFBhc3RpbmcgZnJvbSBmaWxlIGRhdGFcblx0XHRcdGNvbnN0IHRhcmdldEFuZEVkaXRzID0gY29hbGVzY2UoYXdhaXQgUHJvbWlzZS5hbGwodG9QYXN0ZS5maWxlcy5tYXAoYXN5bmMgZmlsZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGVsZW1lbnQuaXNEaXJlY3RvcnkgPyBlbGVtZW50IDogZWxlbWVudC5wYXJlbnQhO1xuXG5cdFx0XHRcdGNvbnN0IHRhcmdldEZpbGUgPSBhd2FpdCBmaW5kVmFsaWRQYXN0ZUZpbGVUYXJnZXQoXG5cdFx0XHRcdFx0ZXhwbG9yZXJTZXJ2aWNlLFxuXHRcdFx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IGZpbGUubmFtZSwgaXNEaXJlY3Rvcnk6IGZhbHNlLCBhbGxvd092ZXJ3cml0ZTogcGFzdGVTaG91bGRNb3ZlIHx8IGluY3JlbWVudGFsTmFtaW5nID09PSAnZGlzYWJsZWQnIH0sXG5cdFx0XHRcdFx0aW5jcmVtZW50YWxOYW1pbmdcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCF0YXJnZXRGaWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dGFyZ2V0OiB0YXJnZXRGaWxlLFxuXHRcdFx0XHRcdGVkaXQ6IG5ldyBSZXNvdXJjZUZpbGVFZGl0KHVuZGVmaW5lZCwgdGFyZ2V0RmlsZSwge1xuXHRcdFx0XHRcdFx0b3ZlcndyaXRlOiBpbmNyZW1lbnRhbE5hbWluZyA9PT0gJ2Rpc2FibGVkJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiAoYXN5bmMgKCkgPT4gVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShhd2FpdCBmaWxlLmFycmF5QnVmZmVyKCkpKSkoKSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpKTtcblxuXHRcdFx0YXdhaXQgYXBwbHlDb3B5UmVzb3VyY2VFZGl0KHRhcmdldEFuZEVkaXRzLm1hcChwYWlyID0+IHBhaXIudGFyZ2V0KSwgdGFyZ2V0QW5kRWRpdHMubWFwKHBhaXIgPT4gcGFpci5lZGl0KSk7XG5cdFx0XHR0YXJnZXRzID0gdGFyZ2V0QW5kRWRpdHMubWFwKHBhaXIgPT4gcGFpci50YXJnZXQpO1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZmlyc3RUYXJnZXQgPSB0YXJnZXRzWzBdO1xuXHRcdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLnNlbGVjdChmaXJzdFRhcmdldCk7XG5cdFx0XHRpZiAodGFyZ2V0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IGV4cGxvcmVyU2VydmljZS5maW5kQ2xvc2VzdChmaXJzdFRhcmdldCk7XG5cdFx0XHRcdGlmIChpdGVtICYmICFpdGVtLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGl0ZW0ucmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKHRvRXJyb3JNZXNzYWdlKG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2ZpbGVEZWxldGVkJywgXCJUaGUgZmlsZShzKSB0byBwYXN0ZSBoYXZlIGJlZW4gZGVsZXRlZCBvciBtb3ZlZCBzaW5jZSB5b3UgY29waWVkIHRoZW0uIHswfVwiLCBnZXRFcnJvck1lc3NhZ2UoZSkpKSwgZmFsc2UpKTtcblx0fSBmaW5hbGx5IHtcblx0XHRpZiAocGFzdGVTaG91bGRNb3ZlKSB7XG5cdFx0XHQvLyBDdXQgaXMgZG9uZS4gTWFrZSBzdXJlIHRvIGNsZWFyIGN1dCBzdGF0ZS5cblx0XHRcdGF3YWl0IGV4cGxvcmVyU2VydmljZS5zZXRUb0NvcHkoW10sIGZhbHNlKTtcblx0XHRcdHBhc3RlU2hvdWxkTW92ZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFwcGx5Q29weVJlc291cmNlRWRpdCh0YXJnZXRzOiByZWFkb25seSBVUklbXSwgcmVzb3VyY2VGaWxlRWRpdHM6IFJlc291cmNlRmlsZUVkaXRbXSkge1xuXHRcdGNvbnN0IHVuZG9MZXZlbCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCkuZXhwbG9yZXIuY29uZmlybVVuZG87XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdGNvbmZpcm1CZWZvcmVVbmRvOiB1bmRvTGV2ZWwgPT09IFVuZG9Db25maXJtTGV2ZWwuRGVmYXVsdCB8fCB1bmRvTGV2ZWwgPT09IFVuZG9Db25maXJtTGV2ZWwuVmVyYm9zZSxcblx0XHRcdHByb2dyZXNzTGFiZWw6IHRhcmdldHMubGVuZ3RoID4gMSA/IG5scy5sb2NhbGl6ZSh7IGtleTogJ2NvcHlpbmdCdWxrRWRpdCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgd2lsbCBiZSByZXBsYWNlZCBieSB0aGUgbnVtYmVyIG9mIGZpbGVzIGJlaW5nIGNvcGllZCddIH0sIFwiQ29weWluZyB7MH0gZmlsZXNcIiwgdGFyZ2V0cy5sZW5ndGgpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKHsga2V5OiAnY29weWluZ0ZpbGVCdWxrRWRpdCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgd2lsbCBiZSByZXBsYWNlZCBieSB0aGUgbmFtZSBvZiB0aGUgZmlsZSBjb3BpZWQuJ10gfSwgXCJDb3B5aW5nIHswfVwiLCByZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eSh0YXJnZXRzWzBdKSksXG5cdFx0XHR1bmRvTGFiZWw6IHRhcmdldHMubGVuZ3RoID4gMSA/IG5scy5sb2NhbGl6ZSh7IGtleTogJ2NvcHlCdWxrRWRpdCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgd2lsbCBiZSByZXBsYWNlZCBieSB0aGUgbnVtYmVyIG9mIGZpbGVzIGJlaW5nIGNvcGllZCddIH0sIFwiUGFzdGUgezB9IGZpbGVzXCIsIHRhcmdldHMubGVuZ3RoKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2NvcHlGaWxlQnVsa0VkaXQnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVyIHdpbGwgYmUgcmVwbGFjZWQgYnkgdGhlIG5hbWUgb2YgdGhlIGZpbGUgY29waWVkLiddIH0sIFwiUGFzdGUgezB9XCIsIHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KHRhcmdldHNbMF0pKVxuXHRcdH07XG5cdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLmFwcGx5QnVsa0VkaXQocmVzb3VyY2VGaWxlRWRpdHMsIG9wdGlvbnMpO1xuXHR9XG59O1xuXG50eXBlIEZpbGVzVG9QYXN0ZSA9XG5cdHwgeyB0eXBlOiAncGF0aHMnOyBmaWxlczogVVJJW10gfVxuXHR8IHsgdHlwZTogJ2RhdGEnOyBmaWxlczogRmlsZVtdIH07XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEZpbGVzVG9QYXN0ZShmaWxlTGlzdDogRmlsZUxpc3QgfCB1bmRlZmluZWQsIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLCBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlKTogUHJvbWlzZTxGaWxlc1RvUGFzdGU+IHtcblx0aWYgKGZpbGVMaXN0ICYmIGZpbGVMaXN0Lmxlbmd0aCA+IDApIHtcblx0XHQvLyB3aXRoIGEgYGZpbGVMaXN0YCB3ZSBzdXBwb3J0IG5hdGl2ZWx5IHBhc3RpbmcgZmlsZSBmcm9tIGRpc2sgZnJvbSBjbGlwYm9hcmRcblx0XHRjb25zdCByZXNvdXJjZXMgPSBbLi4uZmlsZUxpc3RdLm1hcChmaWxlID0+IGdldFBhdGhGb3JGaWxlKGZpbGUpKS5maWx0ZXIoZmlsZVBhdGggPT4gISFmaWxlUGF0aCAmJiBpc0Fic29sdXRlKGZpbGVQYXRoKSkubWFwKChmaWxlUGF0aCkgPT4gVVJJLmZpbGUoZmlsZVBhdGghKSk7XG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdwYXRocycsIGZpbGVzOiByZXNvdXJjZXMsIH07XG5cdFx0fVxuXG5cdFx0Ly8gU3VwcG9ydCBwYXN0aW5nIGZpbGVzIHRoYXQgd2UgY2FuJ3QgcmVhZCBmcm9tIGRpc2tcblx0XHRyZXR1cm4geyB0eXBlOiAnZGF0YScsIGZpbGVzOiBbLi4uZmlsZUxpc3RdLmZpbHRlcihmaWxlID0+ICFnZXRQYXRoRm9yRmlsZShmaWxlKSkgfTtcblx0fSBlbHNlIHtcblx0XHQvLyBvdGhlcndpc2Ugd2UgZmFsbGJhY2sgdG8gcmVhZGluZyByZXNvdXJjZXMgZnJvbSBvdXIgY2xpcGJvYXJkIHNlcnZpY2Vcblx0XHRyZXR1cm4geyB0eXBlOiAncGF0aHMnLCBmaWxlczogcmVzb3VyY2VzLmRpc3RpbmN0UGFyZW50cyhhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLnJlYWRSZXNvdXJjZXMoKSwgcmVzb3VyY2UgPT4gcmVzb3VyY2UpIH07XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IG9wZW5GaWxlUHJlc2VydmVGb2N1c0hhbmRsZXIgPSBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IGV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKTtcblx0Y29uc3Qgc3RhdHMgPSBleHBsb3JlclNlcnZpY2UuZ2V0Q29udGV4dCh0cnVlKTtcblxuXHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKHN0YXRzLmZpbHRlcihzID0+ICFzLmlzRGlyZWN0b3J5KS5tYXAocyA9PiAoe1xuXHRcdHJlc291cmNlOiBzLnJlc291cmNlLFxuXHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9XG5cdH0pKSk7XG59O1xuXG5jbGFzcyBCYXNlU2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHRpdGxlOiBJTG9jYWxpemVkU3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbmV3UmVhZG9ubHlTdGF0ZTogdHJ1ZSB8IGZhbHNlIHwgJ3RvZ2dsZScgfCAncmVzZXQnXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDYW5Ub2dnbGVSZWFkb25seUNvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBmaWxlUmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0aWYgKCFmaWxlUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJlYWRvbmx5KGZpbGVSZXNvdXJjZSwgdGhpcy5uZXdSZWFkb25seVN0YXRlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24gZXh0ZW5kcyBCYXNlU2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbmxzLmxvY2FsaXplMignc2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24nLCBcIlNldCBBY3RpdmUgRWRpdG9yIFJlYWQtb25seSBpbiBTZXNzaW9uXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0U2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24uSUQsXG5cdFx0XHRTZXRBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbi5MQUJFTCxcblx0XHRcdHRydWVcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXRBY3RpdmVFZGl0b3JXcml0ZWFibGVJblNlc3Npb24gZXh0ZW5kcyBCYXNlU2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNldEFjdGl2ZUVkaXRvcldyaXRlYWJsZUluU2Vzc2lvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3NldEFjdGl2ZUVkaXRvcldyaXRlYWJsZUluU2Vzc2lvbicsIFwiU2V0IEFjdGl2ZSBFZGl0b3IgV3JpdGVhYmxlIGluIFNlc3Npb25cIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRTZXRBY3RpdmVFZGl0b3JXcml0ZWFibGVJblNlc3Npb24uSUQsXG5cdFx0XHRTZXRBY3RpdmVFZGl0b3JXcml0ZWFibGVJblNlc3Npb24uTEFCRUwsXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uIGV4dGVuZHMgQmFzZVNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy50b2dnbGVBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3RvZ2dsZUFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uJywgXCJUb2dnbGUgQWN0aXZlIEVkaXRvciBSZWFkLW9ubHkgaW4gU2Vzc2lvblwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdFRvZ2dsZUFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uLklELFxuXHRcdFx0VG9nZ2xlQWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24uTEFCRUwsXG5cdFx0XHQndG9nZ2xlJ1xuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24gZXh0ZW5kcyBCYXNlU2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnJlc2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24nO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUyKCdyZXNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uJywgXCJSZXNldCBBY3RpdmUgRWRpdG9yIFJlYWQtb25seSBpbiBTZXNzaW9uXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0UmVzZXRBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbi5JRCxcblx0XHRcdFJlc2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24uTEFCRUwsXG5cdFx0XHQncmVzZXQnXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxXQUE0QixVQUFVO0FBQy9DLFNBQVMsU0FBUyxVQUFVLGtCQUFrQjtBQUM5QyxZQUFZLGVBQWU7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsWUFBaUMsU0FBUyx3QkFBd0I7QUFDM0UsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0Isd0JBQXdCO0FBQ3pELFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFTLDZCQUErQztBQUV4RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtCQUErQiw4QkFBOEIsb0NBQW9DO0FBQzFHLFNBQVMseUJBQW9EO0FBQzdELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xD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QUVBLE1BQWUsSUFBSSxVQUEyQztBQUM3RCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLDRCQUE0QixTQUFTLElBQUksMEJBQTBCO0FBRXpFLFVBQU0sZUFBZSx1QkFBdUIsZUFBZSxjQUFjLGNBQWMsRUFBRSxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQztBQUN0SSxRQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLDBCQUEwQixlQUFlLGNBQWMsS0FBSyxnQkFBZ0I7QUFBQSxFQUNuRjtBQUNEO0FBRU8sTUFBTSxvQ0FBTixNQUFNLDBDQUF5QyxxQ0FBcUM7QUFBQSxFQUsxRixjQUFjO0FBQ2I7QUFBQSxNQUNDLGtDQUFpQztBQUFBLE1BQ2pDLGtDQUFpQztBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQVphLGtDQUVJLEtBQUs7QUFGVCxrQ0FHSSxRQUFRLElBQUksVUFBVSxvQ0FBb0Msd0NBQXdDO0FBSDVHLElBQU0sbUNBQU47QUFjQSxNQUFNLHFDQUFOLE1BQU0sMkNBQTBDLHFDQUFxQztBQUFBLEVBSzNGLGNBQWM7QUFDYjtBQUFBLE1BQ0MsbUNBQWtDO0FBQUEsTUFDbEMsbUNBQWtDO0FBQUEsTUFDbEM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBWmEsbUNBRUksS0FBSztBQUZULG1DQUdJLFFBQVEsSUFBSSxVQUFVLHFDQUFxQyx3Q0FBd0M7QUFIN0csSUFBTSxvQ0FBTjtBQWNBLE1BQU0sdUNBQU4sTUFBTSw2Q0FBNEMscUNBQXFDO0FBQUEsRUFLN0YsY0FBYztBQUNiO0FBQUEsTUFDQyxxQ0FBb0M7QUFBQSxNQUNwQyxxQ0FBb0M7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFaYSxxQ0FFSSxLQUFLO0FBRlQscUNBR0ksUUFBUSxJQUFJLFVBQVUsdUNBQXVDLDJDQUEyQztBQUhsSCxJQUFNLHNDQUFOO0FBY0EsTUFBTSxzQ0FBTixNQUFNLDRDQUEyQyxxQ0FBcUM7QUFBQSxFQUs1RixjQUFjO0FBQ2I7QUFBQSxNQUNDLG9DQUFtQztBQUFBLE1BQ25DLG9DQUFtQztBQUFBLE1BQ25DO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQVphLG9DQUVJLEtBQUs7QUFGVCxvQ0FHSSxRQUFRLElBQUksVUFBVSxzQ0FBc0MsMENBQTBDO0FBSGhILElBQU0scUNBQU47IiwKICAibmFtZXMiOiBbInByaW1hcnlCdXR0b24iLCAibmFtZSIsICJyZXNvdXJjZXMiXQp9Cg==
