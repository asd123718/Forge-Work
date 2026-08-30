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
import * as resources from "../../../../base/common/resources.js";
import * as objects from "../../../../base/common/objects.js";
import { IFileService, FileKind, FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from "../../../../platform/files/common/files.js";
import { IQuickInputService, ItemActivation } from "../../../../platform/quickinput/common/quickInput.js";
import { URI } from "../../../../base/common/uri.js";
import { isWindows, OperatingSystem } from "../../../../base/common/platform.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { Schemas } from "../../../../base/common/network.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { equalsIgnoreCase, format, startsWithIgnoreCase } from "../../../../base/common/strings.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { isValidBasename } from "../../../../base/common/extpath.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { SaveReason } from "../../../common/editor.js";
import { IPathService } from "../../path/common/pathService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { getActiveDocument } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
var OpenLocalFileCommand;
((OpenLocalFileCommand2) => {
  OpenLocalFileCommand2.ID = "workbench.action.files.openLocalFile";
  OpenLocalFileCommand2.LABEL = nls.localize("openLocalFile", "Open Local File...");
  function handler() {
    return (accessor) => {
      const dialogService = accessor.get(IFileDialogService);
      return dialogService.pickFileAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
    };
  }
  OpenLocalFileCommand2.handler = handler;
})(OpenLocalFileCommand || (OpenLocalFileCommand = {}));
var SaveLocalFileCommand;
((SaveLocalFileCommand2) => {
  SaveLocalFileCommand2.ID = "workbench.action.files.saveLocalFile";
  SaveLocalFileCommand2.LABEL = nls.localize("saveLocalFile", "Save Local File...");
  function handler() {
    return (accessor) => {
      const editorService = accessor.get(IEditorService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane) {
        return editorService.save({ groupId: activeEditorPane.group.id, editor: activeEditorPane.input }, { saveAs: true, availableFileSystems: [Schemas.file], reason: SaveReason.EXPLICIT });
      }
      return Promise.resolve(void 0);
    };
  }
  SaveLocalFileCommand2.handler = handler;
})(SaveLocalFileCommand || (SaveLocalFileCommand = {}));
var OpenLocalFolderCommand;
((OpenLocalFolderCommand2) => {
  OpenLocalFolderCommand2.ID = "workbench.action.files.openLocalFolder";
  OpenLocalFolderCommand2.LABEL = nls.localize("openLocalFolder", "Open Local Folder...");
  function handler() {
    return (accessor) => {
      const dialogService = accessor.get(IFileDialogService);
      return dialogService.pickFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
    };
  }
  OpenLocalFolderCommand2.handler = handler;
})(OpenLocalFolderCommand || (OpenLocalFolderCommand = {}));
var OpenLocalFileFolderCommand;
((OpenLocalFileFolderCommand2) => {
  OpenLocalFileFolderCommand2.ID = "workbench.action.files.openLocalFileFolder";
  OpenLocalFileFolderCommand2.LABEL = nls.localize("openLocalFileFolder", "Open Local...");
  function handler() {
    return (accessor) => {
      const dialogService = accessor.get(IFileDialogService);
      return dialogService.pickFileFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
    };
  }
  OpenLocalFileFolderCommand2.handler = handler;
})(OpenLocalFileFolderCommand || (OpenLocalFileFolderCommand = {}));
var UpdateResult = /* @__PURE__ */ ((UpdateResult2) => {
  UpdateResult2[UpdateResult2["Updated"] = 0] = "Updated";
  UpdateResult2[UpdateResult2["UpdatedWithTrailing"] = 1] = "UpdatedWithTrailing";
  UpdateResult2[UpdateResult2["Updating"] = 2] = "Updating";
  UpdateResult2[UpdateResult2["NotUpdated"] = 3] = "NotUpdated";
  UpdateResult2[UpdateResult2["InvalidPath"] = 4] = "InvalidPath";
  return UpdateResult2;
})(UpdateResult || {});
const RemoteFileDialogContext = new RawContextKey("remoteFileDialogVisible", false);
let SimpleFileDialog = class extends Disposable {
  constructor(fileService, quickInputService, labelService, workspaceContextService, notificationService, fileDialogService, modelService, languageService, environmentService, remoteAgentService, pathService, keybindingService, contextKeyService, accessibilityService, storageService) {
    super();
    this.fileService = fileService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.workspaceContextService = workspaceContextService;
    this.notificationService = notificationService;
    this.fileDialogService = fileDialogService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.environmentService = environmentService;
    this.remoteAgentService = remoteAgentService;
    this.pathService = pathService;
    this.keybindingService = keybindingService;
    this.accessibilityService = accessibilityService;
    this.storageService = storageService;
    this.hidden = false;
    this.allowFileSelection = true;
    this.allowFolderSelection = false;
    this.requiresTrailing = false;
    this.userEnteredPathSegment = "";
    this.autoCompletePathSegment = "";
    this.isWindows = false;
    this.separator = "/";
    this.onBusyChangeEmitter = this._register(new Emitter());
    this._showDotFiles = true;
    this.remoteAuthority = this.environmentService.remoteAuthority;
    this.contextKey = RemoteFileDialogContext.bindTo(contextKeyService);
    this.scheme = this.pathService.defaultUriScheme;
    this.getShowDotFiles();
    const disposableStore = this._register(new DisposableStore());
    disposableStore.add(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, "remoteFileDialog.showDotFiles", disposableStore)(async (_) => {
      this.getShowDotFiles();
      this.setButtons();
      const startingValue = this.filePickBox.value;
      const folderValue = this.pathFromUri(this.currentFolder, true);
      this.filePickBox.value = folderValue;
      await this.tryUpdateItems(folderValue, this.currentFolder, true);
      this.filePickBox.value = startingValue;
    }));
  }
  setShowDotFiles(showDotFiles) {
    this.storageService.store("remoteFileDialog.showDotFiles", showDotFiles, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  getShowDotFiles() {
    this._showDotFiles = this.storageService.getBoolean("remoteFileDialog.showDotFiles", StorageScope.WORKSPACE, true);
  }
  set busy(busy) {
    if (this.filePickBox.busy !== busy) {
      this.filePickBox.busy = busy;
      this.onBusyChangeEmitter.fire(busy);
    }
  }
  get busy() {
    return this.filePickBox.busy;
  }
  async showOpenDialog(options = {}) {
    this.scheme = this.getScheme(options.availableFileSystems, options.defaultUri);
    this.scopedAuthority = this.getScopedAuthority(options.defaultUri);
    this.userHome = await this.getUserHome();
    this.trueHome = await this.getUserHome(true);
    const newOptions = this.getOptions(options);
    if (!newOptions) {
      return Promise.resolve(void 0);
    }
    this.options = newOptions;
    const result = await this.pickResource();
    if (Array.isArray(result)) {
      return result;
    }
    return result ? [result] : void 0;
  }
  async showSaveDialog(options) {
    this.scheme = this.getScheme(options.availableFileSystems, options.defaultUri);
    this.scopedAuthority = this.getScopedAuthority(options.defaultUri);
    this.userHome = await this.getUserHome();
    this.trueHome = await this.getUserHome(true);
    this.requiresTrailing = true;
    const newOptions = this.getOptions(options, true);
    if (!newOptions) {
      return Promise.resolve(void 0);
    }
    this.options = newOptions;
    this.options.canSelectFolders = true;
    this.options.canSelectFiles = true;
    return new Promise((resolve) => {
      this.pickResource(true).then((result) => {
        resolve(Array.isArray(result) ? result[0] : result);
      });
    });
  }
  getOptions(options, isSave = false) {
    let defaultUri = void 0;
    let filename = void 0;
    if (options.defaultUri) {
      defaultUri = this.scheme === options.defaultUri.scheme ? options.defaultUri : void 0;
      filename = isSave ? resources.basename(options.defaultUri) : void 0;
    }
    if (!defaultUri) {
      defaultUri = this.userHome;
      if (filename) {
        defaultUri = resources.joinPath(defaultUri, filename);
      }
    }
    if (this.scheme !== Schemas.file && !this.fileService.hasProvider(defaultUri)) {
      this.notificationService.info(nls.localize("remoteFileDialog.notConnectedToRemote", "File system provider for {0} is not available.", defaultUri.toString()));
      return void 0;
    }
    const newOptions = objects.deepClone(options);
    newOptions.defaultUri = defaultUri;
    return newOptions;
  }
  remoteUriFrom(path, hintUri) {
    if (!path.startsWith("\\\\")) {
      path = path.replace(/\\/g, "/");
    }
    if (this.scopedAuthority) {
      return URI.from({ scheme: this.scheme, authority: this.scopedAuthority, path, query: hintUri?.query, fragment: hintUri?.fragment });
    }
    const uri = this.scheme === Schemas.file ? URI.file(path) : URI.from({ scheme: this.scheme, path, query: hintUri?.query, fragment: hintUri?.fragment });
    const authority = uri.scheme === Schemas.file ? void 0 : this.remoteAuthority ?? hintUri?.authority;
    return resources.toLocalResource(
      uri,
      authority,
      // If there is a remote authority, then we should use the system's default URI as the local scheme.
      // If there is *no* remote authority, then we should use the default scheme for this dialog as that is already local.
      authority ? this.pathService.defaultUriScheme : uri.scheme
    );
  }
  getScheme(available, defaultUri) {
    if (available && available.length > 0) {
      if (defaultUri && available.indexOf(defaultUri.scheme) >= 0) {
        return defaultUri.scheme;
      }
      return available[0];
    } else if (defaultUri) {
      return defaultUri.scheme;
    }
    return Schemas.file;
  }
  /**
   * Returns the per-URI authority from {@link defaultUri} if the dialog
   * should be scoped to a specific authority (e.g. `agenthost://host/...`).
   *
   * Returns `undefined` when the authority matches the global
   * {@link remoteAuthority} (standard SSH remotes), since that path is
   * already handled by the existing logic.
   */
  getScopedAuthority(defaultUri) {
    if (defaultUri && defaultUri.scheme === this.scheme && defaultUri.authority && defaultUri.authority !== this.remoteAuthority) {
      return defaultUri.authority;
    }
    return void 0;
  }
  async getRemoteAgentEnvironment() {
    if (this.remoteAgentEnvironment === void 0) {
      this.remoteAgentEnvironment = await this.remoteAgentService.getEnvironment();
    }
    return this.remoteAgentEnvironment;
  }
  getUserHome(trueHome = false) {
    if (this.scopedAuthority) {
      return Promise.resolve(URI.from({ scheme: this.scheme, authority: this.scopedAuthority, path: "/" }));
    }
    return trueHome ? this.pathService.userHome({ preferLocal: this.scheme === Schemas.file }) : this.fileDialogService.preferredHome(this.scheme);
  }
  normalizeUri(uri) {
    uri = resources.addTrailingPathSeparator(uri, this.separator);
    uri = resources.removeTrailingPathSeparator(uri);
    return uri;
  }
  async pickResource(isSave = false) {
    this.allowFolderSelection = !!this.options.canSelectFolders;
    this.allowFileSelection = !!this.options.canSelectFiles;
    this.separator = this.scopedAuthority ? "/" : this.labelService.getSeparator(this.scheme, this.remoteAuthority);
    this.hidden = false;
    this.isWindows = this.scopedAuthority ? false : await this.checkIsWindowsOS();
    let homedir = this.options.defaultUri ? this.options.defaultUri : this.workspaceContextService.getWorkspace().folders[0].uri;
    let stat;
    const ext = resources.extname(homedir);
    if (this.options.defaultUri) {
      try {
        stat = await this.fileService.stat(this.options.defaultUri);
      } catch (e) {
      }
      if (!stat || !stat.isDirectory) {
        homedir = resources.dirname(this.options.defaultUri);
        this.trailing = resources.basename(this.options.defaultUri);
      }
    }
    return new Promise((resolve) => {
      this.filePickBox = this._register(this.quickInputService.createQuickPick());
      this.busy = true;
      this.filePickBox.matchOnLabel = false;
      this.filePickBox.sortByLabel = false;
      this.filePickBox.ignoreFocusOut = true;
      this.filePickBox.placeholder = nls.localize("remoteFileDialog.placeholder", "Folder path");
      this.filePickBox.ok = true;
      this.filePickBox.okLabel = typeof this.options.openLabel === "string" ? this.options.openLabel : this.options.openLabel?.withoutMnemonic;
      if (this.scheme !== Schemas.file && this.options && this.options.availableFileSystems && this.options.availableFileSystems.length > 1 && this.options.availableFileSystems.indexOf(Schemas.file) > -1) {
        this.filePickBox.customButton = true;
        this.filePickBox.customLabel = nls.localize("remoteFileDialog.local", "Show Local");
        this.filePickBox.customButtonSecondary = true;
        let action;
        if (isSave) {
          action = SaveLocalFileCommand;
        } else {
          action = this.allowFileSelection ? this.allowFolderSelection ? OpenLocalFileFolderCommand : OpenLocalFileCommand : OpenLocalFolderCommand;
        }
        const keybinding = this.keybindingService.lookupKeybinding(action.ID);
        if (keybinding) {
          const label = keybinding.getLabel();
          if (label) {
            this.filePickBox.customHover = format("{0} ({1})", action.LABEL, label);
          }
        }
      }
      this.setButtons();
      this._register(this.filePickBox.onDidTriggerButton((e) => {
        this.setShowDotFiles(!this._showDotFiles);
      }));
      let isResolving = 0;
      let isAcceptHandled = false;
      this.currentFolder = resources.dirname(homedir);
      this.userEnteredPathSegment = "";
      this.autoCompletePathSegment = "";
      this.filePickBox.title = this.options.title;
      this.filePickBox.value = this.pathFromUri(this.currentFolder, true);
      this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
      const doResolve = (uriOrUris) => {
        if (uriOrUris) {
          if (Array.isArray(uriOrUris)) {
            uriOrUris = uriOrUris.map((uri) => this.normalizeUri(uri));
          } else {
            uriOrUris = this.normalizeUri(uriOrUris);
          }
        }
        resolve(uriOrUris);
        this.contextKey.set(false);
        this.dispose();
      };
      this._register(this.filePickBox.onDidCustom(() => {
        if (isAcceptHandled || this.busy) {
          return;
        }
        isAcceptHandled = true;
        isResolving++;
        if (this.options.availableFileSystems && this.options.availableFileSystems.length > 1) {
          this.options.availableFileSystems = this.options.availableFileSystems.slice(1);
        }
        this.filePickBox.hide();
        if (isSave) {
          return this.fileDialogService.showSaveDialog(this.options).then((result) => {
            doResolve(result);
          });
        } else {
          return this.fileDialogService.showOpenDialog(this.options).then((result) => {
            doResolve(result);
          });
        }
      }));
      const busyDisposable = this._register(new MutableDisposable());
      const handleAccept = () => {
        if (this.busy) {
          busyDisposable.value = this.onBusyChangeEmitter.event((busy) => {
            if (!busy) {
              handleAccept();
            }
          });
          return;
        } else if (isAcceptHandled) {
          return;
        }
        isAcceptHandled = true;
        isResolving++;
        this.onDidAccept().then((resolveValue) => {
          if (resolveValue) {
            this.filePickBox.hide();
            doResolve(resolveValue);
          } else if (this.hidden) {
            doResolve(void 0);
          } else {
            isResolving--;
            isAcceptHandled = false;
          }
        });
      };
      this._register(this.filePickBox.onDidAccept((_) => {
        handleAccept();
      }));
      this._register(this.filePickBox.onDidChangeActive((i) => {
        isAcceptHandled = false;
        if (i.length === 1 && this.isSelectionChangeFromUser()) {
          this.filePickBox.validationMessage = void 0;
          const userPath = this.constructFullUserPath();
          if (!equalsIgnoreCase(this.filePickBox.value.substring(0, userPath.length), userPath)) {
            this.filePickBox.valueSelection = [0, this.filePickBox.value.length];
            this.insertText(userPath, userPath);
          }
          this.setAutoComplete(userPath, this.userEnteredPathSegment, i[0], true);
        }
      }));
      this._register(this.filePickBox.onDidChangeValue(async (value) => {
        return this.handleValueChange(value);
      }));
      this._register(this.filePickBox.onDidHide(() => {
        this.hidden = true;
        if (isResolving === 0) {
          doResolve(void 0);
        }
      }));
      this.filePickBox.show();
      this.contextKey.set(true);
      this.updateItems(homedir, true, this.trailing).then(() => {
        if (this.trailing) {
          this.filePickBox.valueSelection = [this.filePickBox.value.length - this.trailing.length, this.filePickBox.value.length - ext.length];
        } else {
          this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
        }
        this.busy = false;
      });
    });
  }
  async handleValueChange(value) {
    try {
      if (this.isValueChangeFromUser()) {
        if (!equalsIgnoreCase(value, this.constructFullUserPath()) && (!this.isBadSubpath(value) || this.canTildaEscapeHatch(value))) {
          this.filePickBox.validationMessage = void 0;
          const filePickBoxUri = this.filePickBoxValue();
          let updated = 3 /* NotUpdated */;
          if (resources.extUriIgnorePathCase.isEqual(this.currentFolder, resources.dirname(filePickBoxUri))) {
            this.setActiveItems(value);
            return;
          } else if (!resources.extUriIgnorePathCase.isEqual(this.currentFolder, filePickBoxUri)) {
            updated = await this.tryUpdateItems(value, filePickBoxUri);
          }
          if (updated === 3 /* NotUpdated */ || updated === 1 /* UpdatedWithTrailing */) {
            this.setActiveItems(value);
          }
        } else {
          this.filePickBox.activeItems = [];
          this.userEnteredPathSegment = "";
        }
      }
    } catch {
    }
  }
  setButtons() {
    this.filePickBox.buttons = [{
      iconClass: this._showDotFiles ? ThemeIcon.asClassName(Codicon.eye) : ThemeIcon.asClassName(Codicon.eyeClosed),
      tooltip: this._showDotFiles ? nls.localize("remoteFileDialog.hideDotFiles", "Hide dot files") : nls.localize("remoteFileDialog.showDotFiles", "Show dot files"),
      alwaysVisible: true
    }];
  }
  isBadSubpath(value) {
    return this.badPath && value.length > this.badPath.length && equalsIgnoreCase(value.substring(0, this.badPath.length), this.badPath);
  }
  isValueChangeFromUser() {
    if (equalsIgnoreCase(this.filePickBox.value, this.pathAppend(this.currentFolder, this.userEnteredPathSegment + this.autoCompletePathSegment))) {
      return false;
    }
    return true;
  }
  isSelectionChangeFromUser() {
    if (this.activeItem === (this.filePickBox.activeItems ? this.filePickBox.activeItems[0] : void 0)) {
      return false;
    }
    return true;
  }
  constructFullUserPath() {
    const currentFolderPath = this.pathFromUri(this.currentFolder);
    if (equalsIgnoreCase(this.filePickBox.value.substr(0, this.userEnteredPathSegment.length), this.userEnteredPathSegment)) {
      if (equalsIgnoreCase(this.filePickBox.value.substr(0, currentFolderPath.length), currentFolderPath)) {
        return currentFolderPath;
      } else {
        return this.userEnteredPathSegment;
      }
    } else {
      return this.pathAppend(this.currentFolder, this.userEnteredPathSegment);
    }
  }
  filePickBoxValue() {
    const directUri = this.remoteUriFrom(this.filePickBox.value.trimRight(), this.currentFolder);
    const currentPath = this.pathFromUri(this.currentFolder);
    if (equalsIgnoreCase(this.filePickBox.value, currentPath)) {
      return this.currentFolder;
    }
    const currentDisplayUri = this.remoteUriFrom(currentPath, this.currentFolder);
    const relativePath = resources.relativePath(currentDisplayUri, directUri);
    const isSameRoot = this.filePickBox.value.length > 1 && currentPath.length > 1 ? equalsIgnoreCase(this.filePickBox.value.substr(0, 2), currentPath.substr(0, 2)) : false;
    if (relativePath && isSameRoot) {
      let path = resources.joinPath(this.currentFolder, relativePath);
      const directBasename = resources.basename(directUri);
      if (directBasename === "." || directBasename === "..") {
        path = this.remoteUriFrom(this.pathAppend(path, directBasename), this.currentFolder);
      }
      return resources.hasTrailingPathSeparator(directUri) ? resources.addTrailingPathSeparator(path) : path;
    } else {
      return directUri;
    }
  }
  async onDidAccept() {
    this.busy = true;
    if (!this.updatingPromise && this.filePickBox.activeItems.length === 1) {
      const item = this.filePickBox.selectedItems[0];
      if (item.isFolder) {
        if (this.trailing) {
          await this.updateItems(item.uri, true, this.trailing);
        } else {
          const newPath = this.pathFromUri(item.uri);
          if (startsWithIgnoreCase(newPath, this.filePickBox.value) && equalsIgnoreCase(item.label, resources.basename(item.uri))) {
            this.filePickBox.valueSelection = [this.pathFromUri(this.currentFolder).length, this.filePickBox.value.length];
            this.insertText(newPath, this.basenameWithTrailingSlash(item.uri));
          } else if (item.label === ".." && startsWithIgnoreCase(this.filePickBox.value, newPath)) {
            this.filePickBox.valueSelection = [newPath.length, this.filePickBox.value.length];
            this.insertText(newPath, "");
          } else {
            await this.updateItems(item.uri, true);
          }
        }
        this.filePickBox.busy = false;
        return;
      }
    } else if (!this.updatingPromise) {
      if (await this.tryUpdateItems(this.filePickBox.value, this.filePickBoxValue()) !== 3 /* NotUpdated */) {
        this.filePickBox.busy = false;
        return;
      }
    }
    let resolveValue;
    if (this.filePickBox.activeItems.length === 0) {
      resolveValue = this.filePickBoxValue();
    } else if (this.filePickBox.activeItems.length === 1) {
      resolveValue = this.filePickBox.selectedItems[0].uri;
    }
    if (resolveValue) {
      resolveValue = this.addPostfix(resolveValue);
    }
    if (await this.validate(resolveValue)) {
      this.busy = false;
      return resolveValue;
    }
    this.busy = false;
    return void 0;
  }
  root(value) {
    let lastDir = value;
    let dir = resources.dirname(value);
    while (!resources.isEqual(lastDir, dir)) {
      lastDir = dir;
      dir = resources.dirname(dir);
    }
    return dir;
  }
  canTildaEscapeHatch(value) {
    return !!(value.endsWith("~") && this.isBadSubpath(value));
  }
  tildaReplace(value) {
    const home = this.trueHome;
    if (value.length > 0 && value[0] === "~") {
      return resources.joinPath(home, value.substring(1));
    } else if (this.canTildaEscapeHatch(value)) {
      return home;
    }
    return this.remoteUriFrom(value);
  }
  tryAddTrailingSeparatorToDirectory(uri, stat) {
    if (stat.isDirectory) {
      if (!this.endsWithSlash(uri.path)) {
        return resources.addTrailingPathSeparator(uri);
      }
    }
    return uri;
  }
  async tryUpdateItems(value, valueUri, reset = false) {
    if (value.length > 0 && (value[0] === "~" || this.canTildaEscapeHatch(value))) {
      const newDir = this.tildaReplace(value);
      return await this.updateItems(newDir, true) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
    } else if (value === "\\") {
      valueUri = this.root(this.currentFolder);
      value = this.pathFromUri(valueUri);
      return await this.updateItems(valueUri, true) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
    } else {
      const newFolderIsOldFolder = resources.extUriIgnorePathCase.isEqual(this.currentFolder, valueUri);
      const newFolderIsSubFolder = resources.extUriIgnorePathCase.isEqual(this.currentFolder, resources.dirname(valueUri));
      const newFolderIsParent = resources.extUriIgnorePathCase.isEqualOrParent(this.currentFolder, resources.dirname(valueUri));
      const newFolderIsUnrelated = !newFolderIsParent && !newFolderIsSubFolder;
      if (!newFolderIsOldFolder && (this.endsWithSlash(value) || newFolderIsParent || newFolderIsUnrelated) || reset) {
        let stat;
        try {
          stat = await this.fileService.stat(valueUri);
        } catch (e) {
        }
        if (stat?.isDirectory && resources.basename(valueUri) !== "." && this.endsWithSlash(value)) {
          valueUri = this.tryAddTrailingSeparatorToDirectory(valueUri, stat);
          return await this.updateItems(valueUri) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
        } else if (this.endsWithSlash(value)) {
          this.filePickBox.validationMessage = nls.localize("remoteFileDialog.badPath", "The path does not exist. Use ~ to go to your home directory.");
          this.badPath = value;
          return 4 /* InvalidPath */;
        } else {
          let inputUriDirname = resources.dirname(valueUri);
          const currentFolderWithoutSep = resources.removeTrailingPathSeparator(resources.addTrailingPathSeparator(this.currentFolder));
          const inputUriDirnameWithoutSep = resources.removeTrailingPathSeparator(resources.addTrailingPathSeparator(inputUriDirname));
          if (!resources.extUriIgnorePathCase.isEqual(currentFolderWithoutSep, inputUriDirnameWithoutSep) && (!/^[a-zA-Z]:$/.test(this.filePickBox.value) || !equalsIgnoreCase(this.pathFromUri(this.currentFolder).substring(0, this.filePickBox.value.length), this.filePickBox.value))) {
            let statWithoutTrailing;
            try {
              statWithoutTrailing = await this.fileService.stat(inputUriDirname);
            } catch (e) {
            }
            if (statWithoutTrailing?.isDirectory) {
              this.badPath = void 0;
              inputUriDirname = this.tryAddTrailingSeparatorToDirectory(inputUriDirname, statWithoutTrailing);
              return await this.updateItems(inputUriDirname, false, resources.basename(valueUri)) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
            }
          }
        }
      }
    }
    this.badPath = void 0;
    return 3 /* NotUpdated */;
  }
  tryUpdateTrailing(value) {
    const ext = resources.extname(value);
    if (this.trailing && ext) {
      this.trailing = resources.basename(value);
    }
  }
  setActiveItems(value) {
    value = this.pathFromUri(this.tildaReplace(value));
    const asUri = this.remoteUriFrom(value);
    const inputBasename = resources.basename(asUri);
    const userPath = this.constructFullUserPath();
    const pathsEqual = equalsIgnoreCase(userPath, value.substring(0, userPath.length)) || equalsIgnoreCase(value, userPath.substring(0, value.length));
    if (pathsEqual) {
      let hasMatch = false;
      for (let i = 0; i < this.filePickBox.items.length; i++) {
        const item = this.filePickBox.items[i];
        if (this.setAutoComplete(value, inputBasename, item)) {
          hasMatch = true;
          break;
        }
      }
      if (!hasMatch) {
        const userBasename = inputBasename.length >= 2 ? userPath.substring(userPath.length - inputBasename.length + 2) : "";
        this.userEnteredPathSegment = userBasename === inputBasename ? inputBasename : "";
        this.autoCompletePathSegment = "";
        this.filePickBox.activeItems = [];
        this.tryUpdateTrailing(asUri);
      }
    } else {
      this.userEnteredPathSegment = inputBasename;
      this.autoCompletePathSegment = "";
      this.filePickBox.activeItems = [];
      this.tryUpdateTrailing(asUri);
    }
  }
  setAutoComplete(startingValue, startingBasename, quickPickItem, force = false) {
    if (this.busy) {
      this.userEnteredPathSegment = startingBasename;
      this.autoCompletePathSegment = "";
      return false;
    }
    const itemBasename = quickPickItem.label;
    if (itemBasename === "..") {
      this.userEnteredPathSegment = "";
      this.autoCompletePathSegment = "";
      this.activeItem = quickPickItem;
      if (force) {
        getActiveDocument().execCommand("insertText", false, "");
      }
      return false;
    } else if (!force && itemBasename.length >= startingBasename.length && equalsIgnoreCase(itemBasename.substr(0, startingBasename.length), startingBasename)) {
      this.userEnteredPathSegment = startingBasename;
      this.activeItem = quickPickItem;
      this.autoCompletePathSegment = "";
      if (quickPickItem.isFolder || !this.trailing) {
        this.filePickBox.activeItems = [quickPickItem];
      } else {
        this.filePickBox.activeItems = [];
      }
      return true;
    } else if (force && !equalsIgnoreCase(this.basenameWithTrailingSlash(quickPickItem.uri), this.userEnteredPathSegment + this.autoCompletePathSegment)) {
      this.userEnteredPathSegment = "";
      if (!this.accessibilityService.isScreenReaderOptimized()) {
        this.autoCompletePathSegment = this.trimTrailingSlash(itemBasename);
      }
      this.activeItem = quickPickItem;
      if (!this.accessibilityService.isScreenReaderOptimized()) {
        this.filePickBox.valueSelection = [this.pathFromUri(this.currentFolder, true).length, this.filePickBox.value.length];
        this.insertText(this.pathAppend(this.currentFolder, this.autoCompletePathSegment), this.autoCompletePathSegment);
        this.filePickBox.valueSelection = [this.filePickBox.value.length - this.autoCompletePathSegment.length, this.filePickBox.value.length];
      }
      return true;
    } else {
      this.userEnteredPathSegment = startingBasename;
      this.autoCompletePathSegment = "";
      return false;
    }
  }
  insertText(wholeValue, insertText) {
    if (this.filePickBox.inputHasFocus()) {
      getActiveDocument().execCommand("insertText", false, insertText);
      if (this.filePickBox.value !== wholeValue) {
        this.filePickBox.value = wholeValue;
        this.handleValueChange(wholeValue);
      }
    } else {
      this.filePickBox.value = wholeValue;
      this.handleValueChange(wholeValue);
    }
  }
  addPostfix(uri) {
    let result = uri;
    if (this.requiresTrailing && this.options.filters && this.options.filters.length > 0 && !resources.hasTrailingPathSeparator(uri)) {
      let hasExt = false;
      const currentExt = resources.extname(uri).substr(1);
      for (let i = 0; i < this.options.filters.length; i++) {
        for (let j = 0; j < this.options.filters[i].extensions.length; j++) {
          if (this.options.filters[i].extensions[j] === "*" || this.options.filters[i].extensions[j] === currentExt) {
            hasExt = true;
            break;
          }
        }
        if (hasExt) {
          break;
        }
      }
      if (!hasExt) {
        result = resources.joinPath(resources.dirname(uri), resources.basename(uri) + "." + this.options.filters[0].extensions[0]);
      }
    }
    return result;
  }
  trimTrailingSlash(path) {
    return path.length > 1 && this.endsWithSlash(path) ? path.substr(0, path.length - 1) : path;
  }
  yesNoPrompt(uri, message) {
    const disposableStore = new DisposableStore();
    const prompt = disposableStore.add(this.quickInputService.createQuickPick());
    prompt.title = message;
    prompt.ignoreFocusOut = true;
    prompt.ok = true;
    prompt.customButton = true;
    prompt.customLabel = nls.localize("remoteFileDialog.cancel", "Cancel");
    prompt.customButtonSecondary = true;
    prompt.value = this.pathFromUri(uri);
    let isResolving = false;
    return new Promise((resolve) => {
      disposableStore.add(prompt.onDidAccept(() => {
        isResolving = true;
        prompt.hide();
        resolve(true);
      }));
      disposableStore.add(prompt.onDidHide(() => {
        if (!isResolving) {
          resolve(false);
          this.filePickBox.show();
          const currentItems = this.filePickBox.items;
          this.filePickBox.items = currentItems;
        }
        this.hidden = false;
        disposableStore.dispose();
      }));
      disposableStore.add(prompt.onDidChangeValue(() => {
        prompt.hide();
      }));
      disposableStore.add(prompt.onDidCustom(() => {
        prompt.hide();
      }));
      prompt.show();
    });
  }
  async validate(uri) {
    if (uri === void 0) {
      this.filePickBox.validationMessage = nls.localize("remoteFileDialog.invalidPath", "Please enter a valid path.");
      return Promise.resolve(false);
    }
    let stat;
    let statDirname;
    try {
      statDirname = await this.fileService.stat(resources.dirname(uri));
      stat = await this.fileService.stat(uri);
    } catch (e) {
    }
    if (this.requiresTrailing) {
      if (stat?.isDirectory) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateFolder", "The folder already exists. Please use a new file name.");
        return false;
      } else if (stat) {
        const message = nls.localize("remoteFileDialog.validateExisting", "{0} already exists. Are you sure you want to overwrite it?", resources.basename(uri));
        return this.yesNoPrompt(uri, message);
      } else if (!isValidBasename(resources.basename(uri), this.isWindows)) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateBadFilename", "Please enter a valid file name.");
        return false;
      } else if (!statDirname) {
        const message = nls.localize("remoteFileDialog.validateCreateDirectory", "The folder {0} does not exist. Would you like to create it?", resources.basename(resources.dirname(uri)));
        return this.yesNoPrompt(uri, message);
      } else if (!statDirname.isDirectory) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateNonexistentDir", "Please enter a path that exists.");
        return false;
      } else if (statDirname.readonly) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateReadonlyFolder", "This folder cannot be used as a save destination. Please choose another folder");
        return false;
      }
    } else {
      if (!stat) {
        if (this.allowFolderSelection && !this.allowFileSelection && await this.canCreateFolder(uri, statDirname)) {
          const message = nls.localize("remoteFileDialog.validateCreateDirectoryOpen", "The folder {0} does not exist. Would you like to create it?", resources.basename(uri));
          const shouldCreate = await this.yesNoPrompt(uri, message);
          if (!shouldCreate) {
            return false;
          }
          try {
            await this.fileService.createFolder(uri);
            return true;
          } catch (e) {
            this.filePickBox.validationMessage = nls.localize("remoteFileDialog.createFolderFailed", "Could not create folder: {0}", e.message);
            return false;
          }
        }
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateNonexistentDir", "Please enter a path that exists.");
        return false;
      } else if (uri.path === "/" && this.isWindows) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.windowsDriveLetter", "Please start the path with a drive letter.");
        return false;
      } else if (stat.isDirectory && !this.allowFolderSelection) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateFileOnly", "Please select a file.");
        return false;
      } else if (!stat.isDirectory && !this.allowFileSelection) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateFolderOnly", "Please select a folder.");
        return false;
      }
    }
    return true;
  }
  async canCreateFolder(uri, parentStat) {
    const immediateParent = resources.dirname(uri);
    let candidate = uri;
    while (true) {
      const name = resources.basename(candidate);
      if (!name || !isValidBasename(name, this.isWindows)) {
        return false;
      }
      const parent = resources.dirname(candidate);
      if (resources.isEqual(parent, candidate)) {
        return false;
      }
      try {
        const stat = parentStat && resources.isEqual(parent, immediateParent) ? parentStat : await this.fileService.stat(parent);
        return stat.isDirectory && !stat.readonly;
      } catch (e) {
        if (toFileSystemProviderErrorCode(e instanceof Error ? e : void 0) !== FileSystemProviderErrorCode.FileNotFound) {
          return false;
        }
        candidate = parent;
      }
    }
  }
  // Returns true if there is a file at the end of the URI.
  async updateItems(newFolder, force = false, trailing) {
    this.busy = true;
    this.autoCompletePathSegment = "";
    const wasDotDot = trailing === "..";
    trailing = wasDotDot ? void 0 : trailing;
    const isSave = !!trailing;
    let result = false;
    const updatingPromise = createCancelablePromise(async (token) => {
      let folderStat;
      try {
        folderStat = await this.fileService.resolve(newFolder);
        if (!folderStat.isDirectory) {
          trailing = resources.basename(newFolder);
          newFolder = resources.dirname(newFolder);
          folderStat = void 0;
          result = true;
        }
      } catch (e) {
      }
      const newValue = trailing ? this.pathAppend(newFolder, trailing) : this.pathFromUri(newFolder, true);
      const currentFolder = this.endsWithSlash(newFolder.path) ? newFolder : resources.addTrailingPathSeparator(newFolder, this.separator);
      const userEnteredPathSegment = trailing ? trailing : "";
      return this.createItems(folderStat, currentFolder, token).then((items) => {
        if (token.isCancellationRequested) {
          this.busy = false;
          return false;
        }
        this.currentFolder = currentFolder;
        this.userEnteredPathSegment = userEnteredPathSegment;
        this.filePickBox.itemActivation = ItemActivation.NONE;
        this.filePickBox.items = items;
        if (!equalsIgnoreCase(this.filePickBox.value, newValue) && (force || wasDotDot)) {
          this.filePickBox.valueSelection = [0, this.filePickBox.value.length];
          this.insertText(newValue, newValue);
        }
        if (force && trailing && isSave) {
          this.filePickBox.valueSelection = [this.filePickBox.value.length - trailing.length, this.filePickBox.value.length - trailing.length];
        } else if (!trailing) {
          this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
        }
        this.busy = false;
        this.updatingPromise = void 0;
        return result;
      });
    });
    if (this.updatingPromise !== void 0) {
      this.updatingPromise.cancel();
    }
    this.updatingPromise = updatingPromise;
    return updatingPromise;
  }
  pathFromUri(uri, endWithSeparator = false) {
    let result;
    if (this.scopedAuthority) {
      result = uri.path.replace(/\n/g, "");
    } else {
      result = normalizeDriveLetter(uri.fsPath, this.isWindows).replace(/\n/g, "");
    }
    if (this.separator === "/") {
      result = result.replace(/\\/g, this.separator);
    } else {
      result = result.replace(/\//g, this.separator);
    }
    if (endWithSeparator && !this.endsWithSlash(result)) {
      result = result + this.separator;
    }
    return result;
  }
  pathAppend(uri, additional) {
    if (additional === ".." || additional === ".") {
      const basePath = this.pathFromUri(uri, true);
      return basePath + additional;
    } else {
      return this.pathFromUri(resources.joinPath(uri, additional));
    }
  }
  async checkIsWindowsOS() {
    let isWindowsOS = isWindows;
    const env = await this.getRemoteAgentEnvironment();
    if (env) {
      isWindowsOS = env.os === OperatingSystem.Windows;
    }
    return isWindowsOS;
  }
  endsWithSlash(s) {
    return /[\/\\]$/.test(s);
  }
  basenameWithTrailingSlash(fullPath) {
    const child = this.pathFromUri(fullPath, true);
    const parent = this.pathFromUri(resources.dirname(fullPath), true);
    return child.substring(parent.length);
  }
  async createBackItem(currFolder) {
    const compareScheme = this.scopedAuthority ? this.scheme : Schemas.file;
    const compareAuthority = this.scopedAuthority ?? "";
    const fileRepresentationCurr = currFolder.with({ scheme: compareScheme, authority: compareAuthority });
    const fileRepresentationParent = resources.dirname(fileRepresentationCurr);
    if (!resources.isEqual(fileRepresentationCurr, fileRepresentationParent)) {
      const parentFolder = resources.dirname(currFolder);
      if (await this.fileService.exists(parentFolder)) {
        return { label: "..", uri: resources.addTrailingPathSeparator(parentFolder, this.separator), isFolder: true };
      }
    }
    return void 0;
  }
  async createItems(folder, currentFolder, token) {
    const result = [];
    const backDir = await this.createBackItem(currentFolder);
    try {
      if (!folder) {
        folder = await this.fileService.resolve(currentFolder);
      }
      const filteredChildren = this._showDotFiles ? folder.children : folder.children?.filter((child) => !child.name.startsWith("."));
      const items = filteredChildren ? await Promise.all(filteredChildren.map((child) => this.createItem(child, currentFolder, token))) : [];
      for (const item of items) {
        if (item) {
          result.push(item);
        }
      }
    } catch (e) {
      console.log(e);
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const sorted = result.sort((i1, i2) => {
      if (i1.isFolder !== i2.isFolder) {
        return i1.isFolder ? -1 : 1;
      }
      const trimmed1 = this.endsWithSlash(i1.label) ? i1.label.substr(0, i1.label.length - 1) : i1.label;
      const trimmed2 = this.endsWithSlash(i2.label) ? i2.label.substr(0, i2.label.length - 1) : i2.label;
      return trimmed1.localeCompare(trimmed2);
    });
    if (backDir) {
      sorted.unshift(backDir);
    }
    return sorted;
  }
  filterFile(file) {
    if (this.options.filters) {
      for (let i = 0; i < this.options.filters.length; i++) {
        for (let j = 0; j < this.options.filters[i].extensions.length; j++) {
          const testExt = this.options.filters[i].extensions[j];
          if (testExt === "*" || file.path.endsWith("." + testExt)) {
            return true;
          }
        }
      }
      return false;
    }
    return true;
  }
  async createItem(stat, parent, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    let fullPath = resources.joinPath(parent, stat.name);
    if (stat.isDirectory) {
      const filename = resources.basename(fullPath);
      fullPath = resources.addTrailingPathSeparator(fullPath, this.separator);
      return { label: filename, uri: fullPath, isFolder: true, iconClasses: getIconClasses(this.modelService, this.languageService, fullPath || void 0, FileKind.FOLDER) };
    } else if (!stat.isDirectory && this.allowFileSelection && this.filterFile(fullPath)) {
      return { label: stat.name, uri: fullPath, isFolder: false, iconClasses: getIconClasses(this.modelService, this.languageService, fullPath || void 0) };
    }
    return void 0;
  }
};
SimpleFileDialog = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IFileDialogService),
  __decorateParam(6, IModelService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IRemoteAgentService),
  __decorateParam(10, IPathService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IAccessibilityService),
  __decorateParam(14, IStorageService)
], SimpleFileDialog);
export {
  OpenLocalFileCommand,
  OpenLocalFileFolderCommand,
  OpenLocalFolderCommand,
  RemoteFileDialogContext,
  SaveLocalFileCommand,
  SimpleFileDialog
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxkaWFsb2dzXFxicm93c2VyXFxzaW1wbGVGaWxlRGlhbG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdCwgRmlsZUtpbmQsIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGljaywgSXRlbUFjdGl2YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTYXZlRGlhbG9nT3B0aW9ucywgSU9wZW5EaWFsb2dPcHRpb25zLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5LCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBlcXVhbHNJZ25vcmVDYXNlLCBmb3JtYXQsIHN0YXJ0c1dpdGhJZ25vcmVDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEVudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IGlzVmFsaWRCYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBDYW5jZWxhYmxlUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZURvY3VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgT3BlbkxvY2FsRmlsZUNvbW1hbmQge1xuXHRleHBvcnQgY29uc3QgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuTG9jYWxGaWxlJztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdvcGVuTG9jYWxGaWxlJywgXCJPcGVuIExvY2FsIEZpbGUuLi5cIik7XG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdHJldHVybiBkaWFsb2dTZXJ2aWNlLnBpY2tGaWxlQW5kT3Blbih7IGZvcmNlTmV3V2luZG93OiBmYWxzZSwgYXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdIH0pO1xuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTYXZlTG9jYWxGaWxlQ29tbWFuZCB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNhdmVMb2NhbEZpbGUnO1xuXHRleHBvcnQgY29uc3QgTEFCRUwgPSBubHMubG9jYWxpemUoJ3NhdmVMb2NhbEZpbGUnLCBcIlNhdmUgTG9jYWwgRmlsZS4uLlwiKTtcblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2Uuc2F2ZSh7IGdyb3VwSWQ6IGFjdGl2ZUVkaXRvclBhbmUuZ3JvdXAuaWQsIGVkaXRvcjogYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCB9LCB7IHNhdmVBczogdHJ1ZSwgYXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgT3BlbkxvY2FsRm9sZGVyQ29tbWFuZCB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Mb2NhbEZvbGRlcic7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgnb3BlbkxvY2FsRm9sZGVyJywgXCJPcGVuIExvY2FsIEZvbGRlci4uLlwiKTtcblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIGRpYWxvZ1NlcnZpY2UucGlja0ZvbGRlckFuZE9wZW4oeyBmb3JjZU5ld1dpbmRvdzogZmFsc2UsIGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSB9KTtcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgT3BlbkxvY2FsRmlsZUZvbGRlckNvbW1hbmQge1xuXHRleHBvcnQgY29uc3QgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuTG9jYWxGaWxlRm9sZGVyJztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdvcGVuTG9jYWxGaWxlRm9sZGVyJywgXCJPcGVuIExvY2FsLi4uXCIpO1xuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRyZXR1cm4gZGlhbG9nU2VydmljZS5waWNrRmlsZUZvbGRlckFuZE9wZW4oeyBmb3JjZU5ld1dpbmRvdzogZmFsc2UsIGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSB9KTtcblx0XHR9O1xuXHR9XG59XG5cbmludGVyZmFjZSBGaWxlUXVpY2tQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0dXJpOiBVUkk7XG5cdGlzRm9sZGVyOiBib29sZWFuO1xufVxuXG5lbnVtIFVwZGF0ZVJlc3VsdCB7XG5cdFVwZGF0ZWQsXG5cdFVwZGF0ZWRXaXRoVHJhaWxpbmcsXG5cdFVwZGF0aW5nLFxuXHROb3RVcGRhdGVkLFxuXHRJbnZhbGlkUGF0aFxufVxuXG5leHBvcnQgY29uc3QgUmVtb3RlRmlsZURpYWxvZ0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigncmVtb3RlRmlsZURpYWxvZ1Zpc2libGUnLCBmYWxzZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZUZpbGVEaWFsb2cgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHNob3dPcGVuRGlhbG9nKG9wdGlvbnM6IElPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+O1xuXHRzaG93U2F2ZURpYWxvZyhvcHRpb25zOiBJU2F2ZURpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBjbGFzcyBTaW1wbGVGaWxlRGlhbG9nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTaW1wbGVGaWxlRGlhbG9nIHtcblx0cHJpdmF0ZSBvcHRpb25zITogSU9wZW5EaWFsb2dPcHRpb25zO1xuXHRwcml2YXRlIGN1cnJlbnRGb2xkZXIhOiBVUkk7XG5cdHByaXZhdGUgZmlsZVBpY2tCb3ghOiBJUXVpY2tQaWNrPEZpbGVRdWlja1BpY2tJdGVtPjtcblx0cHJpdmF0ZSBoaWRkZW46IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBhbGxvd0ZpbGVTZWxlY3Rpb246IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIGFsbG93Rm9sZGVyU2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVxdWlyZXNUcmFpbGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHRyYWlsaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBzY2hlbWU6IHN0cmluZztcblx0cHJpdmF0ZSBjb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB1c2VyRW50ZXJlZFBhdGhTZWdtZW50OiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBhdXRvQ29tcGxldGVQYXRoU2VnbWVudDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgYWN0aXZlSXRlbTogRmlsZVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdXNlckhvbWUhOiBVUkk7XG5cdHByaXZhdGUgdHJ1ZUhvbWUhOiBVUkk7XG5cdHByaXZhdGUgaXNXaW5kb3dzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgYmFkUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlbW90ZUFnZW50RW52aXJvbm1lbnQ6IElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZXBhcmF0b3I6IHN0cmluZyA9ICcvJztcblxuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoZSBkaWFsb2cgaXMgc2NvcGVkIHRvIGEgc3BlY2lmaWMgVVJJIGF1dGhvcml0eSAoZS5nLlxuXHQgKiBmb3IgYnJvd3NpbmcgYW4gYGFnZW50aG9zdDovL3thdXRob3JpdHl9Ly4uLmAgZmlsZXN5c3RlbSB0aGF0XG5cdCAqIHVzZXMgcGVyLWNvbm5lY3Rpb24gYXV0aG9yaXRpZXMgcmF0aGVyIHRoYW4gdGhlIGdsb2JhbFxuXHQgKiB7QGxpbmsgcmVtb3RlQXV0aG9yaXR5fSkuXG5cdCAqL1xuXHRwcml2YXRlIHNjb3BlZEF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uQnVzeUNoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cHJpdmF0ZSB1cGRhdGluZ1Byb21pc2U6IENhbmNlbGFibGVQcm9taXNlPGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3Nob3dEb3RGaWxlczogYm9vbGVhbiA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdHRoaXMuY29udGV4dEtleSA9IFJlbW90ZUZpbGVEaWFsb2dDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zY2hlbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWU7XG5cblx0XHR0aGlzLmdldFNob3dEb3RGaWxlcygpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ3JlbW90ZUZpbGVEaWFsb2cuc2hvd0RvdEZpbGVzJywgZGlzcG9zYWJsZVN0b3JlKShhc3luYyBfID0+IHtcblx0XHRcdHRoaXMuZ2V0U2hvd0RvdEZpbGVzKCk7XG5cdFx0XHR0aGlzLnNldEJ1dHRvbnMoKTtcblx0XHRcdGNvbnN0IHN0YXJ0aW5nVmFsdWUgPSB0aGlzLmZpbGVQaWNrQm94LnZhbHVlO1xuXHRcdFx0Y29uc3QgZm9sZGVyVmFsdWUgPSB0aGlzLnBhdGhGcm9tVXJpKHRoaXMuY3VycmVudEZvbGRlciwgdHJ1ZSk7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlID0gZm9sZGVyVmFsdWU7XG5cdFx0XHRhd2FpdCB0aGlzLnRyeVVwZGF0ZUl0ZW1zKGZvbGRlclZhbHVlLCB0aGlzLmN1cnJlbnRGb2xkZXIsIHRydWUpO1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZSA9IHN0YXJ0aW5nVmFsdWU7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTaG93RG90RmlsZXMoc2hvd0RvdEZpbGVzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSgncmVtb3RlRmlsZURpYWxvZy5zaG93RG90RmlsZXMnLCBzaG93RG90RmlsZXMsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGdldFNob3dEb3RGaWxlcygpIHtcblx0XHR0aGlzLl9zaG93RG90RmlsZXMgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ3JlbW90ZUZpbGVEaWFsb2cuc2hvd0RvdEZpbGVzJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdHJ1ZSk7XG5cdH1cblxuXHRzZXQgYnVzeShidXN5OiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuZmlsZVBpY2tCb3guYnVzeSAhPT0gYnVzeSkge1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC5idXN5ID0gYnVzeTtcblx0XHRcdHRoaXMub25CdXN5Q2hhbmdlRW1pdHRlci5maXJlKGJ1c3kpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBidXN5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmZpbGVQaWNrQm94LmJ1c3k7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2hvd09wZW5EaWFsb2cob3B0aW9uczogSU9wZW5EaWFsb2dPcHRpb25zID0ge30pOiBQcm9taXNlPFVSSVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5zY2hlbWUgPSB0aGlzLmdldFNjaGVtZShvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zLCBvcHRpb25zLmRlZmF1bHRVcmkpO1xuXHRcdHRoaXMuc2NvcGVkQXV0aG9yaXR5ID0gdGhpcy5nZXRTY29wZWRBdXRob3JpdHkob3B0aW9ucy5kZWZhdWx0VXJpKTtcblx0XHR0aGlzLnVzZXJIb21lID0gYXdhaXQgdGhpcy5nZXRVc2VySG9tZSgpO1xuXHRcdHRoaXMudHJ1ZUhvbWUgPSBhd2FpdCB0aGlzLmdldFVzZXJIb21lKHRydWUpO1xuXHRcdGNvbnN0IG5ld09wdGlvbnMgPSB0aGlzLmdldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0aWYgKCFuZXdPcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMub3B0aW9ucyA9IG5ld09wdGlvbnM7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5waWNrUmVzb3VyY2UoKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0ID8gW3Jlc3VsdF0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2hvd1NhdmVEaWFsb2cob3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnNjaGVtZSA9IHRoaXMuZ2V0U2NoZW1lKG9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMsIG9wdGlvbnMuZGVmYXVsdFVyaSk7XG5cdFx0dGhpcy5zY29wZWRBdXRob3JpdHkgPSB0aGlzLmdldFNjb3BlZEF1dGhvcml0eShvcHRpb25zLmRlZmF1bHRVcmkpO1xuXHRcdHRoaXMudXNlckhvbWUgPSBhd2FpdCB0aGlzLmdldFVzZXJIb21lKCk7XG5cdFx0dGhpcy50cnVlSG9tZSA9IGF3YWl0IHRoaXMuZ2V0VXNlckhvbWUodHJ1ZSk7XG5cdFx0dGhpcy5yZXF1aXJlc1RyYWlsaW5nID0gdHJ1ZTtcblx0XHRjb25zdCBuZXdPcHRpb25zID0gdGhpcy5nZXRPcHRpb25zKG9wdGlvbnMsIHRydWUpO1xuXHRcdGlmICghbmV3T3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLm9wdGlvbnMgPSBuZXdPcHRpb25zO1xuXHRcdHRoaXMub3B0aW9ucy5jYW5TZWxlY3RGb2xkZXJzID0gdHJ1ZTtcblx0XHR0aGlzLm9wdGlvbnMuY2FuU2VsZWN0RmlsZXMgPSB0cnVlO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdHRoaXMucGlja1Jlc291cmNlKHRydWUpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0cmVzb2x2ZShBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE9wdGlvbnMob3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zIHwgSU9wZW5EaWFsb2dPcHRpb25zLCBpc1NhdmU6IGJvb2xlYW4gPSBmYWxzZSk6IElPcGVuRGlhbG9nT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGRlZmF1bHRVcmk6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZmlsZW5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucy5kZWZhdWx0VXJpKSB7XG5cdFx0XHRkZWZhdWx0VXJpID0gKHRoaXMuc2NoZW1lID09PSBvcHRpb25zLmRlZmF1bHRVcmkuc2NoZW1lKSA/IG9wdGlvbnMuZGVmYXVsdFVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdGZpbGVuYW1lID0gaXNTYXZlID8gcmVzb3VyY2VzLmJhc2VuYW1lKG9wdGlvbnMuZGVmYXVsdFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghZGVmYXVsdFVyaSkge1xuXHRcdFx0ZGVmYXVsdFVyaSA9IHRoaXMudXNlckhvbWU7XG5cdFx0XHRpZiAoZmlsZW5hbWUpIHtcblx0XHRcdFx0ZGVmYXVsdFVyaSA9IHJlc291cmNlcy5qb2luUGF0aChkZWZhdWx0VXJpLCBmaWxlbmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICgodGhpcy5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkgJiYgIXRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoZGVmYXVsdFVyaSkpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy5ub3RDb25uZWN0ZWRUb1JlbW90ZScsICdGaWxlIHN5c3RlbSBwcm92aWRlciBmb3IgezB9IGlzIG5vdCBhdmFpbGFibGUuJywgZGVmYXVsdFVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBuZXdPcHRpb25zOiBJT3BlbkRpYWxvZ09wdGlvbnMgPSBvYmplY3RzLmRlZXBDbG9uZShvcHRpb25zKTtcblx0XHRuZXdPcHRpb25zLmRlZmF1bHRVcmkgPSBkZWZhdWx0VXJpO1xuXHRcdHJldHVybiBuZXdPcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdGVVcmlGcm9tKHBhdGg6IHN0cmluZywgaGludFVyaT86IFVSSSk6IFVSSSB7XG5cdFx0aWYgKCFwYXRoLnN0YXJ0c1dpdGgoJ1xcXFxcXFxcJykpIHtcblx0XHRcdHBhdGggPSBwYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblx0XHR9XG5cdFx0Ly8gV2hlbiBzY29wZWQgdG8gYSBzcGVjaWZpYyBhdXRob3JpdHkgKGUuZy4gYWdlbnRob3N0Oi8vaG9zdC8uLi4pLFxuXHRcdC8vIGNvbnN0cnVjdCB0aGUgVVJJIGRpcmVjdGx5IHdpdGggdGhlIGF1dGhvcml0eSB0byBhdm9pZFxuXHRcdC8vIHRvTG9jYWxSZXNvdXJjZSBzdHJpcHBpbmcgb3IgcmVwbGFjaW5nIGl0LlxuXHRcdGlmICh0aGlzLnNjb3BlZEF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiB0aGlzLnNjaGVtZSwgYXV0aG9yaXR5OiB0aGlzLnNjb3BlZEF1dGhvcml0eSwgcGF0aCwgcXVlcnk6IGhpbnRVcmk/LnF1ZXJ5LCBmcmFnbWVudDogaGludFVyaT8uZnJhZ21lbnQgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IHVyaTogVVJJID0gdGhpcy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IFVSSS5maWxlKHBhdGgpIDogVVJJLmZyb20oeyBzY2hlbWU6IHRoaXMuc2NoZW1lLCBwYXRoLCBxdWVyeTogaGludFVyaT8ucXVlcnksIGZyYWdtZW50OiBoaW50VXJpPy5mcmFnbWVudCB9KTtcblx0XHQvLyBJZiB0aGUgZGVmYXVsdCBzY2hlbWUgaXMgZmlsZSwgdGhlbiB3ZSBkb24ndCBjYXJlIGFib3V0IHRoZSByZW1vdGUgYXV0aG9yaXR5IG9yIHRoZSBoaW50IGF1dGhvcml0eVxuXHRcdGNvbnN0IGF1dGhvcml0eSA9ICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpID8gdW5kZWZpbmVkIDogKHRoaXMucmVtb3RlQXV0aG9yaXR5ID8/IGhpbnRVcmk/LmF1dGhvcml0eSk7XG5cdFx0cmV0dXJuIHJlc291cmNlcy50b0xvY2FsUmVzb3VyY2UodXJpLCBhdXRob3JpdHksXG5cdFx0XHQvLyBJZiB0aGVyZSBpcyBhIHJlbW90ZSBhdXRob3JpdHksIHRoZW4gd2Ugc2hvdWxkIHVzZSB0aGUgc3lzdGVtJ3MgZGVmYXVsdCBVUkkgYXMgdGhlIGxvY2FsIHNjaGVtZS5cblx0XHRcdC8vIElmIHRoZXJlIGlzICpubyogcmVtb3RlIGF1dGhvcml0eSwgdGhlbiB3ZSBzaG91bGQgdXNlIHRoZSBkZWZhdWx0IHNjaGVtZSBmb3IgdGhpcyBkaWFsb2cgYXMgdGhhdCBpcyBhbHJlYWR5IGxvY2FsLlxuXHRcdFx0YXV0aG9yaXR5ID8gdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lIDogdXJpLnNjaGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNjaGVtZShhdmFpbGFibGU6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBkZWZhdWx0VXJpOiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmIChhdmFpbGFibGUgJiYgYXZhaWxhYmxlLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChkZWZhdWx0VXJpICYmIChhdmFpbGFibGUuaW5kZXhPZihkZWZhdWx0VXJpLnNjaGVtZSkgPj0gMCkpIHtcblx0XHRcdFx0cmV0dXJuIGRlZmF1bHRVcmkuc2NoZW1lO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF2YWlsYWJsZVswXTtcblx0XHR9IGVsc2UgaWYgKGRlZmF1bHRVcmkpIHtcblx0XHRcdHJldHVybiBkZWZhdWx0VXJpLnNjaGVtZTtcblx0XHR9XG5cdFx0cmV0dXJuIFNjaGVtYXMuZmlsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwZXItVVJJIGF1dGhvcml0eSBmcm9tIHtAbGluayBkZWZhdWx0VXJpfSBpZiB0aGUgZGlhbG9nXG5cdCAqIHNob3VsZCBiZSBzY29wZWQgdG8gYSBzcGVjaWZpYyBhdXRob3JpdHkgKGUuZy4gYGFnZW50aG9zdDovL2hvc3QvLi4uYCkuXG5cdCAqXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYXV0aG9yaXR5IG1hdGNoZXMgdGhlIGdsb2JhbFxuXHQgKiB7QGxpbmsgcmVtb3RlQXV0aG9yaXR5fSAoc3RhbmRhcmQgU1NIIHJlbW90ZXMpLCBzaW5jZSB0aGF0IHBhdGggaXNcblx0ICogYWxyZWFkeSBoYW5kbGVkIGJ5IHRoZSBleGlzdGluZyBsb2dpYy5cblx0ICovXG5cdHByaXZhdGUgZ2V0U2NvcGVkQXV0aG9yaXR5KGRlZmF1bHRVcmk6IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGRlZmF1bHRVcmlcblx0XHRcdCYmIGRlZmF1bHRVcmkuc2NoZW1lID09PSB0aGlzLnNjaGVtZVxuXHRcdFx0JiYgZGVmYXVsdFVyaS5hdXRob3JpdHlcblx0XHRcdCYmIGRlZmF1bHRVcmkuYXV0aG9yaXR5ICE9PSB0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRVcmkuYXV0aG9yaXR5O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZW1vdGVBZ2VudEVudmlyb25tZW50KCk6IFByb21pc2U8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMucmVtb3RlQWdlbnRFbnZpcm9ubWVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnJlbW90ZUFnZW50RW52aXJvbm1lbnQgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZW1vdGVBZ2VudEVudmlyb25tZW50O1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFVzZXJIb21lKHRydWVIb21lID0gZmFsc2UpOiBQcm9taXNlPFVSST4ge1xuXHRcdC8vIFdoZW4gc2NvcGVkIHRvIGEgY3VzdG9tIGF1dGhvcml0eSwgdGhlIHBsYXRmb3JtIHVzZXJIb21lIGlzIG5vdFxuXHRcdC8vIG1lYW5pbmdmdWwgKGl0IHdvdWxkIHJldHVybiBhIGxvY2FsIGZpbGU6Ly8gcGF0aCkuIFVzZSB0aGUgcm9vdFxuXHRcdC8vIG9mIHRoZSBzY29wZWQgZmlsZXN5c3RlbSBhcyB0aGUgaG9tZSBkaXJlY3RvcnkgaW5zdGVhZC5cblx0XHRpZiAodGhpcy5zY29wZWRBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoVVJJLmZyb20oeyBzY2hlbWU6IHRoaXMuc2NoZW1lLCBhdXRob3JpdHk6IHRoaXMuc2NvcGVkQXV0aG9yaXR5LCBwYXRoOiAnLycgfSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZUhvbWVcblx0XHRcdD8gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsOiB0aGlzLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIH0pXG5cdFx0XHQ6IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucHJlZmVycmVkSG9tZSh0aGlzLnNjaGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIG5vcm1hbGl6ZVVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0dXJpID0gcmVzb3VyY2VzLmFkZFRyYWlsaW5nUGF0aFNlcGFyYXRvcih1cmksIHRoaXMuc2VwYXJhdG9yKTsgLy8gRW5zdXJlcyB0aGF0IGM6IGlzIGM6LyBzaW5jZSB0aGlzIGNvbWVzIGZyb20gdXNlciBpbnB1dCBhbmQgY2FuIGJlIGluY29ycmVjdC5cblx0XHQvLyBUbyBiZSBjb25zaXN0ZW50LCB3ZSBzaG91bGQgbmV2ZXIgaGF2ZSBhIHRyYWlsaW5nIHBhdGggc2VwYXJhdG9yIG9uIGRpcmVjdG9yaWVzIChvciBhbnl0aGluZyBlbHNlKS4gV2lsbCBub3QgcmVtb3ZlIGZyb20gYzovLlxuXHRcdHVyaSA9IHJlc291cmNlcy5yZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IodXJpKTtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrUmVzb3VyY2UoaXNTYXZlOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFVSSVtdIHwgVVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5hbGxvd0ZvbGRlclNlbGVjdGlvbiA9ICEhdGhpcy5vcHRpb25zLmNhblNlbGVjdEZvbGRlcnM7XG5cdFx0dGhpcy5hbGxvd0ZpbGVTZWxlY3Rpb24gPSAhIXRoaXMub3B0aW9ucy5jYW5TZWxlY3RGaWxlcztcblx0XHR0aGlzLnNlcGFyYXRvciA9IHRoaXMuc2NvcGVkQXV0aG9yaXR5ID8gJy8nIDogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0U2VwYXJhdG9yKHRoaXMuc2NoZW1lLCB0aGlzLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0dGhpcy5oaWRkZW4gPSBmYWxzZTtcblx0XHR0aGlzLmlzV2luZG93cyA9IHRoaXMuc2NvcGVkQXV0aG9yaXR5ID8gZmFsc2UgOiBhd2FpdCB0aGlzLmNoZWNrSXNXaW5kb3dzT1MoKTtcblx0XHRsZXQgaG9tZWRpcjogVVJJID0gdGhpcy5vcHRpb25zLmRlZmF1bHRVcmkgPyB0aGlzLm9wdGlvbnMuZGVmYXVsdFVyaSA6IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS51cmk7XG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXh0OiBzdHJpbmcgPSByZXNvdXJjZXMuZXh0bmFtZShob21lZGlyKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLmRlZmF1bHRVcmkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodGhpcy5vcHRpb25zLmRlZmF1bHRVcmkpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBUaGUgZmlsZSBvciBmb2xkZXIgZG9lc24ndCBleGlzdFxuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdGF0IHx8ICFzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGhvbWVkaXIgPSByZXNvdXJjZXMuZGlybmFtZSh0aGlzLm9wdGlvbnMuZGVmYXVsdFVyaSk7XG5cdFx0XHRcdHRoaXMudHJhaWxpbmcgPSByZXNvdXJjZXMuYmFzZW5hbWUodGhpcy5vcHRpb25zLmRlZmF1bHRVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxVUklbXSB8IFVSSSB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3ggPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxGaWxlUXVpY2tQaWNrSXRlbT4oKSk7XG5cdFx0XHR0aGlzLmJ1c3kgPSB0cnVlO1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC5tYXRjaE9uTGFiZWwgPSBmYWxzZTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3guc29ydEJ5TGFiZWwgPSBmYWxzZTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3guaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy5wbGFjZWhvbGRlcicsIFwiRm9sZGVyIHBhdGhcIik7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94Lm9rID0gdHJ1ZTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3gub2tMYWJlbCA9IHR5cGVvZiB0aGlzLm9wdGlvbnMub3BlbkxhYmVsID09PSAnc3RyaW5nJyA/IHRoaXMub3B0aW9ucy5vcGVuTGFiZWwgOiB0aGlzLm9wdGlvbnMub3BlbkxhYmVsPy53aXRob3V0TW5lbW9uaWM7XG5cdFx0XHRpZiAoKHRoaXMuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpICYmIHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMgJiYgKHRoaXMub3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcy5sZW5ndGggPiAxKSAmJiAodGhpcy5vcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zLmluZGV4T2YoU2NoZW1hcy5maWxlKSA+IC0xKSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmN1c3RvbUJ1dHRvbiA9IHRydWU7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3guY3VzdG9tTGFiZWwgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cubG9jYWwnLCAnU2hvdyBMb2NhbCcpO1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmN1c3RvbUJ1dHRvblNlY29uZGFyeSA9IHRydWU7XG5cdFx0XHRcdGxldCBhY3Rpb247XG5cdFx0XHRcdGlmIChpc1NhdmUpIHtcblx0XHRcdFx0XHRhY3Rpb24gPSBTYXZlTG9jYWxGaWxlQ29tbWFuZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhY3Rpb24gPSB0aGlzLmFsbG93RmlsZVNlbGVjdGlvbiA/ICh0aGlzLmFsbG93Rm9sZGVyU2VsZWN0aW9uID8gT3BlbkxvY2FsRmlsZUZvbGRlckNvbW1hbmQgOiBPcGVuTG9jYWxGaWxlQ29tbWFuZCkgOiBPcGVuTG9jYWxGb2xkZXJDb21tYW5kO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLklEKTtcblx0XHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGtleWJpbmRpbmcuZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHRpZiAobGFiZWwpIHtcblx0XHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3guY3VzdG9tSG92ZXIgPSBmb3JtYXQoJ3swfSAoezF9KScsIGFjdGlvbi5MQUJFTCwgbGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldEJ1dHRvbnMoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVBpY2tCb3gub25EaWRUcmlnZ2VyQnV0dG9uKGUgPT4ge1xuXHRcdFx0XHR0aGlzLnNldFNob3dEb3RGaWxlcyghdGhpcy5fc2hvd0RvdEZpbGVzKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bGV0IGlzUmVzb2x2aW5nOiBudW1iZXIgPSAwO1xuXHRcdFx0bGV0IGlzQWNjZXB0SGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jdXJyZW50Rm9sZGVyID0gcmVzb3VyY2VzLmRpcm5hbWUoaG9tZWRpcik7XG5cdFx0XHR0aGlzLnVzZXJFbnRlcmVkUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblxuXHRcdFx0dGhpcy5maWxlUGlja0JveC50aXRsZSA9IHRoaXMub3B0aW9ucy50aXRsZTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWUgPSB0aGlzLnBhdGhGcm9tVXJpKHRoaXMuY3VycmVudEZvbGRlciwgdHJ1ZSk7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gW3RoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aF07XG5cblx0XHRcdGNvbnN0IGRvUmVzb2x2ZSA9ICh1cmlPclVyaXM6IFVSSSB8IFVSSVtdIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmICh1cmlPclVyaXMpIHtcblx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh1cmlPclVyaXMpKSB7XG5cdFx0XHRcdFx0XHR1cmlPclVyaXMgPSB1cmlPclVyaXMubWFwKHVyaSA9PiB0aGlzLm5vcm1hbGl6ZVVyaSh1cmkpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dXJpT3JVcmlzID0gdGhpcy5ub3JtYWxpemVVcmkodXJpT3JVcmlzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZSh1cmlPclVyaXMpO1xuXHRcdFx0XHR0aGlzLmNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVQaWNrQm94Lm9uRGlkQ3VzdG9tKCgpID0+IHtcblx0XHRcdFx0aWYgKGlzQWNjZXB0SGFuZGxlZCB8fCB0aGlzLmJ1c3kpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpc0FjY2VwdEhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHRpc1Jlc29sdmluZysrO1xuXHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zICYmICh0aGlzLm9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMubGVuZ3RoID4gMSkpIHtcblx0XHRcdFx0XHR0aGlzLm9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLm9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMuc2xpY2UoMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5oaWRlKCk7XG5cdFx0XHRcdGlmIChpc1NhdmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh0aGlzLm9wdGlvbnMpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRcdGRvUmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHRoaXMub3B0aW9ucykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdFx0ZG9SZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgYnVzeURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRjb25zdCBoYW5kbGVBY2NlcHQgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmJ1c3kpIHtcblx0XHRcdFx0XHQvLyBTYXZlIHRoZSBhY2NlcHQgdW50aWwgdGhlIGZpbGUgcGlja2VyIGlzIG5vdCBidXN5LlxuXHRcdFx0XHRcdGJ1c3lEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5vbkJ1c3lDaGFuZ2VFbWl0dGVyLmV2ZW50KChidXN5OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWJ1c3kpIHtcblx0XHRcdFx0XHRcdFx0aGFuZGxlQWNjZXB0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzQWNjZXB0SGFuZGxlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlzQWNjZXB0SGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdGlzUmVzb2x2aW5nKys7XG5cdFx0XHRcdHRoaXMub25EaWRBY2NlcHQoKS50aGVuKHJlc29sdmVWYWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVWYWx1ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5oaWRlKCk7XG5cdFx0XHRcdFx0XHRkb1Jlc29sdmUocmVzb2x2ZVZhbHVlKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuaGlkZGVuKSB7XG5cdFx0XHRcdFx0XHRkb1Jlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aXNSZXNvbHZpbmctLTtcblx0XHRcdFx0XHRcdGlzQWNjZXB0SGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVQaWNrQm94Lm9uRGlkQWNjZXB0KF8gPT4ge1xuXHRcdFx0XHRoYW5kbGVBY2NlcHQoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlUGlja0JveC5vbkRpZENoYW5nZUFjdGl2ZShpID0+IHtcblx0XHRcdFx0aXNBY2NlcHRIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHRcdC8vIHVwZGF0ZSBpbnB1dCBib3ggdG8gbWF0Y2ggdGhlIGZpcnN0IHNlbGVjdGVkIGl0ZW1cblx0XHRcdFx0aWYgKChpLmxlbmd0aCA9PT0gMSkgJiYgdGhpcy5pc1NlbGVjdGlvbkNoYW5nZUZyb21Vc2VyKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IHVzZXJQYXRoID0gdGhpcy5jb25zdHJ1Y3RGdWxsVXNlclBhdGgoKTtcblx0XHRcdFx0XHRpZiAoIWVxdWFsc0lnbm9yZUNhc2UodGhpcy5maWxlUGlja0JveC52YWx1ZS5zdWJzdHJpbmcoMCwgdXNlclBhdGgubGVuZ3RoKSwgdXNlclBhdGgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gWzAsIHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoXTtcblx0XHRcdFx0XHRcdHRoaXMuaW5zZXJ0VGV4dCh1c2VyUGF0aCwgdXNlclBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnNldEF1dG9Db21wbGV0ZSh1c2VyUGF0aCwgdGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50LCBpWzBdLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVQaWNrQm94Lm9uRGlkQ2hhbmdlVmFsdWUoYXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVWYWx1ZUNoYW5nZSh2YWx1ZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVQaWNrQm94Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaGlkZGVuID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGlzUmVzb2x2aW5nID09PSAwKSB7XG5cdFx0XHRcdFx0ZG9SZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5maWxlUGlja0JveC5zaG93KCk7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy51cGRhdGVJdGVtcyhob21lZGlyLCB0cnVlLCB0aGlzLnRyYWlsaW5nKS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMudHJhaWxpbmcpIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gW3RoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoIC0gdGhpcy50cmFpbGluZy5sZW5ndGgsIHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoIC0gZXh0Lmxlbmd0aF07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYnVzeSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVmFsdWVDaGFuZ2UodmFsdWU6IHN0cmluZykge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBvbkRpZENoYW5nZVZhbHVlIGNhbiBhbHNvIGJlIHRyaWdnZXJlZCBieSB0aGUgYXV0byBjb21wbGV0ZSwgc28gaWYgaXQgbG9va3MgbGlrZSB0aGUgYXV0byBjb21wbGV0ZSwgZG9uJ3QgZG8gYW55dGhpbmdcblx0XHRcdGlmICh0aGlzLmlzVmFsdWVDaGFuZ2VGcm9tVXNlcigpKSB7XG5cdFx0XHRcdC8vIElmIHRoZSB1c2VyIGhhcyBqdXN0IGVudGVyZWQgbW9yZSBiYWQgcGF0aCwgZG9uJ3QgY2hhbmdlIGFueXRoaW5nXG5cdFx0XHRcdGlmICghZXF1YWxzSWdub3JlQ2FzZSh2YWx1ZSwgdGhpcy5jb25zdHJ1Y3RGdWxsVXNlclBhdGgoKSkgJiYgKCF0aGlzLmlzQmFkU3VicGF0aCh2YWx1ZSkgfHwgdGhpcy5jYW5UaWxkYUVzY2FwZUhhdGNoKHZhbHVlKSkpIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVQaWNrQm94VXJpID0gdGhpcy5maWxlUGlja0JveFZhbHVlKCk7XG5cdFx0XHRcdFx0bGV0IHVwZGF0ZWQ6IFVwZGF0ZVJlc3VsdCA9IFVwZGF0ZVJlc3VsdC5Ob3RVcGRhdGVkO1xuXHRcdFx0XHRcdGlmIChyZXNvdXJjZXMuZXh0VXJpSWdub3JlUGF0aENhc2UuaXNFcXVhbCh0aGlzLmN1cnJlbnRGb2xkZXIsIHJlc291cmNlcy5kaXJuYW1lKGZpbGVQaWNrQm94VXJpKSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0QWN0aXZlSXRlbXModmFsdWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIXJlc291cmNlcy5leHRVcmlJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHRoaXMuY3VycmVudEZvbGRlciwgZmlsZVBpY2tCb3hVcmkpKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkID0gYXdhaXQgdGhpcy50cnlVcGRhdGVJdGVtcyh2YWx1ZSwgZmlsZVBpY2tCb3hVcmkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoKHVwZGF0ZWQgPT09IFVwZGF0ZVJlc3VsdC5Ob3RVcGRhdGVkKSB8fCAodXBkYXRlZCA9PT0gVXBkYXRlUmVzdWx0LlVwZGF0ZWRXaXRoVHJhaWxpbmcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEFjdGl2ZUl0ZW1zKHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcyA9IFtdO1xuXHRcdFx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBTaW5jZSBhbnkgdGV4dCBjYW4gYmUgZW50ZXJlZCBpbiB0aGUgaW5wdXQgYm94LCB0aGVyZSBpcyBwb3RlbnRpYWwgZm9yIGVycm9yIGNhdXNpbmcgaW5wdXQuIElmIHRoaXMgaGFwcGVucywgZG8gbm90aGluZy5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEJ1dHRvbnMoKSB7XG5cdFx0dGhpcy5maWxlUGlja0JveC5idXR0b25zID0gW3tcblx0XHRcdGljb25DbGFzczogdGhpcy5fc2hvd0RvdEZpbGVzID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllKSA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZUNsb3NlZCksXG5cdFx0XHR0b29sdGlwOiB0aGlzLl9zaG93RG90RmlsZXMgPyBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cuaGlkZURvdEZpbGVzJywgXCJIaWRlIGRvdCBmaWxlc1wiKSA6IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy5zaG93RG90RmlsZXMnLCBcIlNob3cgZG90IGZpbGVzXCIpLFxuXHRcdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHRcdH1dO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0JhZFN1YnBhdGgodmFsdWU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmJhZFBhdGggJiYgKHZhbHVlLmxlbmd0aCA+IHRoaXMuYmFkUGF0aC5sZW5ndGgpICYmIGVxdWFsc0lnbm9yZUNhc2UodmFsdWUuc3Vic3RyaW5nKDAsIHRoaXMuYmFkUGF0aC5sZW5ndGgpLCB0aGlzLmJhZFBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1ZhbHVlQ2hhbmdlRnJvbVVzZXIoKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVxdWFsc0lnbm9yZUNhc2UodGhpcy5maWxlUGlja0JveC52YWx1ZSwgdGhpcy5wYXRoQXBwZW5kKHRoaXMuY3VycmVudEZvbGRlciwgdGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ICsgdGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NlbGVjdGlvbkNoYW5nZUZyb21Vc2VyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmFjdGl2ZUl0ZW0gPT09ICh0aGlzLmZpbGVQaWNrQm94LmFjdGl2ZUl0ZW1zID8gdGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtc1swXSA6IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdEZ1bGxVc2VyUGF0aCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGN1cnJlbnRGb2xkZXJQYXRoID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdGlmIChlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUuc3Vic3RyKDAsIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudC5sZW5ndGgpLCB0aGlzLnVzZXJFbnRlcmVkUGF0aFNlZ21lbnQpKSB7XG5cdFx0XHRpZiAoZXF1YWxzSWdub3JlQ2FzZSh0aGlzLmZpbGVQaWNrQm94LnZhbHVlLnN1YnN0cigwLCBjdXJyZW50Rm9sZGVyUGF0aC5sZW5ndGgpLCBjdXJyZW50Rm9sZGVyUGF0aCkpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRGb2xkZXJQYXRoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMucGF0aEFwcGVuZCh0aGlzLmN1cnJlbnRGb2xkZXIsIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWxlUGlja0JveFZhbHVlKCk6IFVSSSB7XG5cdFx0Ly8gVGhlIGZpbGUgcGljayBib3ggY2FuJ3QgcmVuZGVyIGV2ZXJ5dGhpbmcsIHNvIHdlIHVzZSB0aGUgY3VycmVudCBmb2xkZXIgdG8gY3JlYXRlIHRoZSB1cmkgc28gdGhhdCBpdCBpcyBhbiBleGlzdGluZyBwYXRoLlxuXHRcdGNvbnN0IGRpcmVjdFVyaSA9IHRoaXMucmVtb3RlVXJpRnJvbSh0aGlzLmZpbGVQaWNrQm94LnZhbHVlLnRyaW1SaWdodCgpLCB0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdGNvbnN0IGN1cnJlbnRQYXRoID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdGlmIChlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUsIGN1cnJlbnRQYXRoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3VycmVudEZvbGRlcjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudERpc3BsYXlVcmkgPSB0aGlzLnJlbW90ZVVyaUZyb20oY3VycmVudFBhdGgsIHRoaXMuY3VycmVudEZvbGRlcik7XG5cdFx0Y29uc3QgcmVsYXRpdmVQYXRoID0gcmVzb3VyY2VzLnJlbGF0aXZlUGF0aChjdXJyZW50RGlzcGxheVVyaSwgZGlyZWN0VXJpKTtcblx0XHRjb25zdCBpc1NhbWVSb290ID0gKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoID4gMSAmJiBjdXJyZW50UGF0aC5sZW5ndGggPiAxKSA/IGVxdWFsc0lnbm9yZUNhc2UodGhpcy5maWxlUGlja0JveC52YWx1ZS5zdWJzdHIoMCwgMiksIGN1cnJlbnRQYXRoLnN1YnN0cigwLCAyKSkgOiBmYWxzZTtcblx0XHRpZiAocmVsYXRpdmVQYXRoICYmIGlzU2FtZVJvb3QpIHtcblx0XHRcdGxldCBwYXRoID0gcmVzb3VyY2VzLmpvaW5QYXRoKHRoaXMuY3VycmVudEZvbGRlciwgcmVsYXRpdmVQYXRoKTtcblx0XHRcdGNvbnN0IGRpcmVjdEJhc2VuYW1lID0gcmVzb3VyY2VzLmJhc2VuYW1lKGRpcmVjdFVyaSk7XG5cdFx0XHRpZiAoKGRpcmVjdEJhc2VuYW1lID09PSAnLicpIHx8IChkaXJlY3RCYXNlbmFtZSA9PT0gJy4uJykpIHtcblx0XHRcdFx0cGF0aCA9IHRoaXMucmVtb3RlVXJpRnJvbSh0aGlzLnBhdGhBcHBlbmQocGF0aCwgZGlyZWN0QmFzZW5hbWUpLCB0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc291cmNlcy5oYXNUcmFpbGluZ1BhdGhTZXBhcmF0b3IoZGlyZWN0VXJpKSA/IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IocGF0aCkgOiBwYXRoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZGlyZWN0VXJpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRBY2NlcHQoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmJ1c3kgPSB0cnVlO1xuXHRcdGlmICghdGhpcy51cGRhdGluZ1Byb21pc2UgJiYgdGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmZpbGVQaWNrQm94LnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRpZiAoaXRlbS5pc0ZvbGRlcikge1xuXHRcdFx0XHRpZiAodGhpcy50cmFpbGluZykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlSXRlbXMoaXRlbS51cmksIHRydWUsIHRoaXMudHJhaWxpbmcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFdoZW4gcG9zc2libGUsIGNhdXNlIHRoZSB1cGRhdGUgdG8gaGFwcGVuIGJ5IG1vZGlmeWluZyB0aGUgaW5wdXQgYm94LlxuXHRcdFx0XHRcdC8vIFRoaXMgYWxsb3dzIGFsbCBpbnB1dCBib3ggdXBkYXRlcyB0byBoYXBwZW4gZmlyc3QsIGFuZCB1c2VzIHRoZSBzYW1lIGNvZGUgcGF0aCBhcyB0aGUgdXNlciB0eXBpbmcuXG5cdFx0XHRcdFx0Y29uc3QgbmV3UGF0aCA9IHRoaXMucGF0aEZyb21VcmkoaXRlbS51cmkpO1xuXHRcdFx0XHRcdGlmIChzdGFydHNXaXRoSWdub3JlQ2FzZShuZXdQYXRoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlKSAmJiAoZXF1YWxzSWdub3JlQ2FzZShpdGVtLmxhYmVsLCByZXNvdXJjZXMuYmFzZW5hbWUoaXRlbS51cmkpKSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIpLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHRcdFx0dGhpcy5pbnNlcnRUZXh0KG5ld1BhdGgsIHRoaXMuYmFzZW5hbWVXaXRoVHJhaWxpbmdTbGFzaChpdGVtLnVyaSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoKGl0ZW0ubGFiZWwgPT09ICcuLicpICYmIHN0YXJ0c1dpdGhJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUsIG5ld1BhdGgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gW25ld1BhdGgubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aF07XG5cdFx0XHRcdFx0XHR0aGlzLmluc2VydFRleHQobmV3UGF0aCwgJycpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKGl0ZW0udXJpLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCF0aGlzLnVwZGF0aW5nUHJvbWlzZSkge1xuXHRcdFx0Ly8gSWYgdGhlIGl0ZW1zIGhhdmUgdXBkYXRlZCwgZG9uJ3QgdHJ5IHRvIHJlc29sdmVcblx0XHRcdGlmICgoYXdhaXQgdGhpcy50cnlVcGRhdGVJdGVtcyh0aGlzLmZpbGVQaWNrQm94LnZhbHVlLCB0aGlzLmZpbGVQaWNrQm94VmFsdWUoKSkpICE9PSBVcGRhdGVSZXN1bHQuTm90VXBkYXRlZCkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlVmFsdWU6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHQvLyBGaW5kIHJlc29sdmUgdmFsdWVcblx0XHRpZiAodGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlc29sdmVWYWx1ZSA9IHRoaXMuZmlsZVBpY2tCb3hWYWx1ZSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJlc29sdmVWYWx1ZSA9IHRoaXMuZmlsZVBpY2tCb3guc2VsZWN0ZWRJdGVtc1swXS51cmk7XG5cdFx0fVxuXHRcdGlmIChyZXNvbHZlVmFsdWUpIHtcblx0XHRcdHJlc29sdmVWYWx1ZSA9IHRoaXMuYWRkUG9zdGZpeChyZXNvbHZlVmFsdWUpO1xuXHRcdH1cblx0XHRpZiAoYXdhaXQgdGhpcy52YWxpZGF0ZShyZXNvbHZlVmFsdWUpKSB7XG5cdFx0XHR0aGlzLmJ1c3kgPSBmYWxzZTtcblx0XHRcdHJldHVybiByZXNvbHZlVmFsdWU7XG5cdFx0fVxuXHRcdHRoaXMuYnVzeSA9IGZhbHNlO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJvb3QodmFsdWU6IFVSSSkge1xuXHRcdGxldCBsYXN0RGlyID0gdmFsdWU7XG5cdFx0bGV0IGRpciA9IHJlc291cmNlcy5kaXJuYW1lKHZhbHVlKTtcblx0XHR3aGlsZSAoIXJlc291cmNlcy5pc0VxdWFsKGxhc3REaXIsIGRpcikpIHtcblx0XHRcdGxhc3REaXIgPSBkaXI7XG5cdFx0XHRkaXIgPSByZXNvdXJjZXMuZGlybmFtZShkaXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlyO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5UaWxkYUVzY2FwZUhhdGNoKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEodmFsdWUuZW5kc1dpdGgoJ34nKSAmJiB0aGlzLmlzQmFkU3VicGF0aCh2YWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0aWxkYVJlcGxhY2UodmFsdWU6IHN0cmluZyk6IFVSSSB7XG5cdFx0Y29uc3QgaG9tZSA9IHRoaXMudHJ1ZUhvbWU7XG5cdFx0aWYgKCh2YWx1ZS5sZW5ndGggPiAwKSAmJiAodmFsdWVbMF0gPT09ICd+JykpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZXMuam9pblBhdGgoaG9tZSwgdmFsdWUuc3Vic3RyaW5nKDEpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY2FuVGlsZGFFc2NhcGVIYXRjaCh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBob21lO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZW1vdGVVcmlGcm9tKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgdHJ5QWRkVHJhaWxpbmdTZXBhcmF0b3JUb0RpcmVjdG9yeSh1cmk6IFVSSSwgc3RhdDogSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSk6IFVSSSB7XG5cdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdC8vIEF0IHRoaXMgcG9pbnQgd2Uga25vdyBpdCdzIGEgZGlyZWN0b3J5IGFuZCBjYW4gYWRkIHRoZSB0cmFpbGluZyBwYXRoIHNlcGFyYXRvclxuXHRcdFx0aWYgKCF0aGlzLmVuZHNXaXRoU2xhc2godXJpLnBhdGgpKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZXMuYWRkVHJhaWxpbmdQYXRoU2VwYXJhdG9yKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyeVVwZGF0ZUl0ZW1zKHZhbHVlOiBzdHJpbmcsIHZhbHVlVXJpOiBVUkksIHJlc2V0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFVwZGF0ZVJlc3VsdD4ge1xuXHRcdGlmICgodmFsdWUubGVuZ3RoID4gMCkgJiYgKCh2YWx1ZVswXSA9PT0gJ34nKSB8fCB0aGlzLmNhblRpbGRhRXNjYXBlSGF0Y2godmFsdWUpKSkge1xuXHRcdFx0Y29uc3QgbmV3RGlyID0gdGhpcy50aWxkYVJlcGxhY2UodmFsdWUpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMudXBkYXRlSXRlbXMobmV3RGlyLCB0cnVlKSA/IFVwZGF0ZVJlc3VsdC5VcGRhdGVkV2l0aFRyYWlsaW5nIDogVXBkYXRlUmVzdWx0LlVwZGF0ZWQ7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHR2YWx1ZVVyaSA9IHRoaXMucm9vdCh0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0dmFsdWUgPSB0aGlzLnBhdGhGcm9tVXJpKHZhbHVlVXJpKTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKHZhbHVlVXJpLCB0cnVlKSA/IFVwZGF0ZVJlc3VsdC5VcGRhdGVkV2l0aFRyYWlsaW5nIDogVXBkYXRlUmVzdWx0LlVwZGF0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5ld0ZvbGRlcklzT2xkRm9sZGVyID0gcmVzb3VyY2VzLmV4dFVyaUlnbm9yZVBhdGhDYXNlLmlzRXF1YWwodGhpcy5jdXJyZW50Rm9sZGVyLCB2YWx1ZVVyaSk7XG5cdFx0XHRjb25zdCBuZXdGb2xkZXJJc1N1YkZvbGRlciA9IHJlc291cmNlcy5leHRVcmlJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHRoaXMuY3VycmVudEZvbGRlciwgcmVzb3VyY2VzLmRpcm5hbWUodmFsdWVVcmkpKTtcblx0XHRcdGNvbnN0IG5ld0ZvbGRlcklzUGFyZW50ID0gcmVzb3VyY2VzLmV4dFVyaUlnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudCh0aGlzLmN1cnJlbnRGb2xkZXIsIHJlc291cmNlcy5kaXJuYW1lKHZhbHVlVXJpKSk7XG5cdFx0XHRjb25zdCBuZXdGb2xkZXJJc1VucmVsYXRlZCA9ICFuZXdGb2xkZXJJc1BhcmVudCAmJiAhbmV3Rm9sZGVySXNTdWJGb2xkZXI7XG5cdFx0XHRpZiAoKCFuZXdGb2xkZXJJc09sZEZvbGRlciAmJiAodGhpcy5lbmRzV2l0aFNsYXNoKHZhbHVlKSB8fCBuZXdGb2xkZXJJc1BhcmVudCB8fCBuZXdGb2xkZXJJc1VucmVsYXRlZCkpIHx8IHJlc2V0KSB7XG5cdFx0XHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodmFsdWVVcmkpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gZG8gbm90aGluZ1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGF0Py5pc0RpcmVjdG9yeSAmJiAocmVzb3VyY2VzLmJhc2VuYW1lKHZhbHVlVXJpKSAhPT0gJy4nKSAmJiB0aGlzLmVuZHNXaXRoU2xhc2godmFsdWUpKSB7XG5cdFx0XHRcdFx0dmFsdWVVcmkgPSB0aGlzLnRyeUFkZFRyYWlsaW5nU2VwYXJhdG9yVG9EaXJlY3RvcnkodmFsdWVVcmksIHN0YXQpO1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKHZhbHVlVXJpKSA/IFVwZGF0ZVJlc3VsdC5VcGRhdGVkV2l0aFRyYWlsaW5nIDogVXBkYXRlUmVzdWx0LlVwZGF0ZWQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5lbmRzV2l0aFNsYXNoKHZhbHVlKSkge1xuXHRcdFx0XHRcdC8vIFRoZSBpbnB1dCBib3ggY29udGFpbnMgYSBwYXRoIHRoYXQgZG9lc24ndCBleGlzdCBvbiB0aGUgc3lzdGVtLlxuXHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cuYmFkUGF0aCcsICdUaGUgcGF0aCBkb2VzIG5vdCBleGlzdC4gVXNlIH4gdG8gZ28gdG8geW91ciBob21lIGRpcmVjdG9yeS4nKTtcblx0XHRcdFx0XHQvLyBTYXZlIHRoaXMgYmFkIHBhdGguIEl0IGNhbiB0YWtlIHRvbyBsb25nIHRvIGEgc3RhdCBvbiBldmVyeSB1c2VyIGVudGVyZWQgY2hhcmFjdGVyLCBidXQgb25jZSBhIHVzZXIgZW50ZXJzIGEgYmFkIHBhdGggdGhleSBhcmUgbGlrZWx5XG5cdFx0XHRcdFx0Ly8gdG8ga2VlcCB0eXBpbmcgbW9yZSBiYWQgcGF0aC4gV2UgY2FuIGNvbXBhcmUgYWdhaW5zdCB0aGlzIGJhZCBwYXRoIGFuZCBzZWUgaWYgdGhlIHVzZXIgZW50ZXJlZCBwYXRoIHN0YXJ0cyB3aXRoIGl0LlxuXHRcdFx0XHRcdHRoaXMuYmFkUGF0aCA9IHZhbHVlO1xuXHRcdFx0XHRcdHJldHVybiBVcGRhdGVSZXN1bHQuSW52YWxpZFBhdGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IGlucHV0VXJpRGlybmFtZSA9IHJlc291cmNlcy5kaXJuYW1lKHZhbHVlVXJpKTtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50Rm9sZGVyV2l0aG91dFNlcCA9IHJlc291cmNlcy5yZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IocmVzb3VyY2VzLmFkZFRyYWlsaW5nUGF0aFNlcGFyYXRvcih0aGlzLmN1cnJlbnRGb2xkZXIpKTtcblx0XHRcdFx0XHRjb25zdCBpbnB1dFVyaURpcm5hbWVXaXRob3V0U2VwID0gcmVzb3VyY2VzLnJlbW92ZVRyYWlsaW5nUGF0aFNlcGFyYXRvcihyZXNvdXJjZXMuYWRkVHJhaWxpbmdQYXRoU2VwYXJhdG9yKGlucHV0VXJpRGlybmFtZSkpO1xuXHRcdFx0XHRcdGlmICghcmVzb3VyY2VzLmV4dFVyaUlnbm9yZVBhdGhDYXNlLmlzRXF1YWwoY3VycmVudEZvbGRlcldpdGhvdXRTZXAsIGlucHV0VXJpRGlybmFtZVdpdGhvdXRTZXApXG5cdFx0XHRcdFx0XHQmJiAoIS9eW2EtekEtWl06JC8udGVzdCh0aGlzLmZpbGVQaWNrQm94LnZhbHVlKVxuXHRcdFx0XHRcdFx0XHR8fCAhZXF1YWxzSWdub3JlQ2FzZSh0aGlzLnBhdGhGcm9tVXJpKHRoaXMuY3VycmVudEZvbGRlcikuc3Vic3RyaW5nKDAsIHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoKSwgdGhpcy5maWxlUGlja0JveC52YWx1ZSkpKSB7XG5cdFx0XHRcdFx0XHRsZXQgc3RhdFdpdGhvdXRUcmFpbGluZzogSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHN0YXRXaXRob3V0VHJhaWxpbmcgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQoaW5wdXRVcmlEaXJuYW1lKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZG8gbm90aGluZ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHN0YXRXaXRob3V0VHJhaWxpbmc/LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuYmFkUGF0aCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aW5wdXRVcmlEaXJuYW1lID0gdGhpcy50cnlBZGRUcmFpbGluZ1NlcGFyYXRvclRvRGlyZWN0b3J5KGlucHV0VXJpRGlybmFtZSwgc3RhdFdpdGhvdXRUcmFpbGluZyk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKGlucHV0VXJpRGlybmFtZSwgZmFsc2UsIHJlc291cmNlcy5iYXNlbmFtZSh2YWx1ZVVyaSkpID8gVXBkYXRlUmVzdWx0LlVwZGF0ZWRXaXRoVHJhaWxpbmcgOiBVcGRhdGVSZXN1bHQuVXBkYXRlZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5iYWRQYXRoID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBVcGRhdGVSZXN1bHQuTm90VXBkYXRlZDtcblx0fVxuXG5cdHByaXZhdGUgdHJ5VXBkYXRlVHJhaWxpbmcodmFsdWU6IFVSSSkge1xuXHRcdGNvbnN0IGV4dCA9IHJlc291cmNlcy5leHRuYW1lKHZhbHVlKTtcblx0XHRpZiAodGhpcy50cmFpbGluZyAmJiBleHQpIHtcblx0XHRcdHRoaXMudHJhaWxpbmcgPSByZXNvdXJjZXMuYmFzZW5hbWUodmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aXZlSXRlbXModmFsdWU6IHN0cmluZykge1xuXHRcdHZhbHVlID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLnRpbGRhUmVwbGFjZSh2YWx1ZSkpO1xuXHRcdGNvbnN0IGFzVXJpID0gdGhpcy5yZW1vdGVVcmlGcm9tKHZhbHVlKTtcblx0XHRjb25zdCBpbnB1dEJhc2VuYW1lID0gcmVzb3VyY2VzLmJhc2VuYW1lKGFzVXJpKTtcblx0XHRjb25zdCB1c2VyUGF0aCA9IHRoaXMuY29uc3RydWN0RnVsbFVzZXJQYXRoKCk7XG5cdFx0Ly8gTWFrZSBzdXJlIHRoYXQgdGhlIGZvbGRlciB3aG9zZSBjaGlsZHJlbiB3ZSBhcmUgY3VycmVudGx5IHZpZXdpbmcgbWF0Y2hlcyB0aGUgcGF0aCBpbiB0aGUgaW5wdXRcblx0XHRjb25zdCBwYXRoc0VxdWFsID0gZXF1YWxzSWdub3JlQ2FzZSh1c2VyUGF0aCwgdmFsdWUuc3Vic3RyaW5nKDAsIHVzZXJQYXRoLmxlbmd0aCkpIHx8XG5cdFx0XHRlcXVhbHNJZ25vcmVDYXNlKHZhbHVlLCB1c2VyUGF0aC5zdWJzdHJpbmcoMCwgdmFsdWUubGVuZ3RoKSk7XG5cdFx0aWYgKHBhdGhzRXF1YWwpIHtcblx0XHRcdGxldCBoYXNNYXRjaCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmZpbGVQaWNrQm94Lml0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSA8RmlsZVF1aWNrUGlja0l0ZW0+dGhpcy5maWxlUGlja0JveC5pdGVtc1tpXTtcblx0XHRcdFx0aWYgKHRoaXMuc2V0QXV0b0NvbXBsZXRlKHZhbHVlLCBpbnB1dEJhc2VuYW1lLCBpdGVtKSkge1xuXHRcdFx0XHRcdGhhc01hdGNoID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFoYXNNYXRjaCkge1xuXHRcdFx0XHRjb25zdCB1c2VyQmFzZW5hbWUgPSBpbnB1dEJhc2VuYW1lLmxlbmd0aCA+PSAyID8gdXNlclBhdGguc3Vic3RyaW5nKHVzZXJQYXRoLmxlbmd0aCAtIGlucHV0QmFzZW5hbWUubGVuZ3RoICsgMikgOiAnJztcblx0XHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gKHVzZXJCYXNlbmFtZSA9PT0gaW5wdXRCYXNlbmFtZSkgPyBpbnB1dEJhc2VuYW1lIDogJyc7XG5cdFx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcyA9IFtdO1xuXHRcdFx0XHR0aGlzLnRyeVVwZGF0ZVRyYWlsaW5nKGFzVXJpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gaW5wdXRCYXNlbmFtZTtcblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3guYWN0aXZlSXRlbXMgPSBbXTtcblx0XHRcdHRoaXMudHJ5VXBkYXRlVHJhaWxpbmcoYXNVcmkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QXV0b0NvbXBsZXRlKHN0YXJ0aW5nVmFsdWU6IHN0cmluZywgc3RhcnRpbmdCYXNlbmFtZTogc3RyaW5nLCBxdWlja1BpY2tJdGVtOiBGaWxlUXVpY2tQaWNrSXRlbSwgZm9yY2U6IGJvb2xlYW4gPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmJ1c3kpIHtcblx0XHRcdC8vIFdlJ3JlIGluIHRoZSBtaWRkbGUgb2Ygc29tZXRoaW5nIGVsc2UuIERvaW5nIGFuIGF1dG8gY29tcGxldGUgbm93IGNhbiByZXN1bHQganVtYmxlZCBvciBpbmNvcnJlY3QgYXV0b2NvbXBsZXRlcy5cblx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9IHN0YXJ0aW5nQmFzZW5hbWU7XG5cdFx0XHR0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50ID0gJyc7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1CYXNlbmFtZSA9IHF1aWNrUGlja0l0ZW0ubGFiZWw7XG5cdFx0Ly8gRWl0aGVyIGZvcmNlIHRoZSBhdXRvY29tcGxldGUsIG9yIHRoZSBvbGQgdmFsdWUgc2hvdWxkIGJlIG9uZSBzbWFsbGVyIHRoYW4gdGhlIG5ldyB2YWx1ZSBhbmQgbWF0Y2ggdGhlIG5ldyB2YWx1ZS5cblx0XHRpZiAoaXRlbUJhc2VuYW1lID09PSAnLi4nKSB7XG5cdFx0XHQvLyBEb24ndCBtYXRjaCBvbiB0aGUgdXAgZGlyZWN0b3J5IGl0ZW0gZXZlci5cblx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9ICcnO1xuXHRcdFx0dGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCA9ICcnO1xuXHRcdFx0dGhpcy5hY3RpdmVJdGVtID0gcXVpY2tQaWNrSXRlbTtcblx0XHRcdGlmIChmb3JjZSkge1xuXHRcdFx0XHQvLyBjbGVhciBhbnkgc2VsZWN0ZWQgdGV4dFxuXHRcdFx0XHRnZXRBY3RpdmVEb2N1bWVudCgpLmV4ZWNDb21tYW5kKCdpbnNlcnRUZXh0JywgZmFsc2UsICcnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKCFmb3JjZSAmJiAoaXRlbUJhc2VuYW1lLmxlbmd0aCA+PSBzdGFydGluZ0Jhc2VuYW1lLmxlbmd0aCkgJiYgZXF1YWxzSWdub3JlQ2FzZShpdGVtQmFzZW5hbWUuc3Vic3RyKDAsIHN0YXJ0aW5nQmFzZW5hbWUubGVuZ3RoKSwgc3RhcnRpbmdCYXNlbmFtZSkpIHtcblx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9IHN0YXJ0aW5nQmFzZW5hbWU7XG5cdFx0XHR0aGlzLmFjdGl2ZUl0ZW0gPSBxdWlja1BpY2tJdGVtO1xuXHRcdFx0Ly8gQ2hhbmdpbmcgdGhlIGFjdGl2ZSBpdGVtcyB3aWxsIHRyaWdnZXIgdGhlIG9uRGlkQWN0aXZlSXRlbXNDaGFuZ2VkLiBDbGVhciB0aGUgYXV0b2NvbXBsZXRlIGZpcnN0LCB0aGVuIHNldCBpdCBhZnRlci5cblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdGlmIChxdWlja1BpY2tJdGVtLmlzRm9sZGVyIHx8ICF0aGlzLnRyYWlsaW5nKSB7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3guYWN0aXZlSXRlbXMgPSBbcXVpY2tQaWNrSXRlbV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmFjdGl2ZUl0ZW1zID0gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGZvcmNlICYmICghZXF1YWxzSWdub3JlQ2FzZSh0aGlzLmJhc2VuYW1lV2l0aFRyYWlsaW5nU2xhc2gocXVpY2tQaWNrSXRlbS51cmkpLCAodGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ICsgdGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCkpKSkge1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gJyc7XG5cdFx0XHRpZiAoIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHR0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50ID0gdGhpcy50cmltVHJhaWxpbmdTbGFzaChpdGVtQmFzZW5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hY3RpdmVJdGVtID0gcXVpY2tQaWNrSXRlbTtcblx0XHRcdGlmICghdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIsIHRydWUpLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHQvLyB1c2UgaW5zZXJ0IHRleHQgdG8gcHJlc2VydmUgdW5kbyBidWZmZXJcblx0XHRcdFx0dGhpcy5pbnNlcnRUZXh0KHRoaXMucGF0aEFwcGVuZCh0aGlzLmN1cnJlbnRGb2xkZXIsIHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQpLCB0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50KTtcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCAtIHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aF07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gc3RhcnRpbmdCYXNlbmFtZTtcblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluc2VydFRleHQod2hvbGVWYWx1ZTogc3RyaW5nLCBpbnNlcnRUZXh0OiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5maWxlUGlja0JveC5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdGdldEFjdGl2ZURvY3VtZW50KCkuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgaW5zZXJ0VGV4dCk7XG5cdFx0XHRpZiAodGhpcy5maWxlUGlja0JveC52YWx1ZSAhPT0gd2hvbGVWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlID0gd2hvbGVWYWx1ZTtcblx0XHRcdFx0dGhpcy5oYW5kbGVWYWx1ZUNoYW5nZSh3aG9sZVZhbHVlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZSA9IHdob2xlVmFsdWU7XG5cdFx0XHR0aGlzLmhhbmRsZVZhbHVlQ2hhbmdlKHdob2xlVmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkUG9zdGZpeCh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0bGV0IHJlc3VsdCA9IHVyaTtcblx0XHRpZiAodGhpcy5yZXF1aXJlc1RyYWlsaW5nICYmIHRoaXMub3B0aW9ucy5maWx0ZXJzICYmIHRoaXMub3B0aW9ucy5maWx0ZXJzLmxlbmd0aCA+IDAgJiYgIXJlc291cmNlcy5oYXNUcmFpbGluZ1BhdGhTZXBhcmF0b3IodXJpKSkge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoYXQgdGhlIHN1ZmZpeCBpcyBhZGRlZC4gSWYgdGhlIHVzZXIgZGVsZXRlZCBpdCwgd2UgYXV0b21hdGljYWxseSBhZGQgaXQgaGVyZVxuXHRcdFx0bGV0IGhhc0V4dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgY3VycmVudEV4dCA9IHJlc291cmNlcy5leHRuYW1lKHVyaSkuc3Vic3RyKDEpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm9wdGlvbnMuZmlsdGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRpZiAoKHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnNbal0gPT09ICcqJykgfHwgKHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnNbal0gPT09IGN1cnJlbnRFeHQpKSB7XG5cdFx0XHRcdFx0XHRoYXNFeHQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNFeHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFoYXNFeHQpIHtcblx0XHRcdFx0cmVzdWx0ID0gcmVzb3VyY2VzLmpvaW5QYXRoKHJlc291cmNlcy5kaXJuYW1lKHVyaSksIHJlc291cmNlcy5iYXNlbmFtZSh1cmkpICsgJy4nICsgdGhpcy5vcHRpb25zLmZpbHRlcnNbMF0uZXh0ZW5zaW9uc1swXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHRyaW1UcmFpbGluZ1NsYXNoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICgocGF0aC5sZW5ndGggPiAxKSAmJiB0aGlzLmVuZHNXaXRoU2xhc2gocGF0aCkpID8gcGF0aC5zdWJzdHIoMCwgcGF0aC5sZW5ndGggLSAxKSA6IHBhdGg7XG5cdH1cblxuXHRwcml2YXRlIHllc05vUHJvbXB0KHVyaTogVVJJLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpbnRlcmZhY2UgWWVzTm9JdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0dmFsdWU6IGJvb2xlYW47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm9tcHQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPFllc05vSXRlbT4oKSk7XG5cdFx0cHJvbXB0LnRpdGxlID0gbWVzc2FnZTtcblx0XHRwcm9tcHQuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHByb21wdC5vayA9IHRydWU7XG5cdFx0cHJvbXB0LmN1c3RvbUJ1dHRvbiA9IHRydWU7XG5cdFx0cHJvbXB0LmN1c3RvbUxhYmVsID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLmNhbmNlbCcsICdDYW5jZWwnKTtcblx0XHRwcm9tcHQuY3VzdG9tQnV0dG9uU2Vjb25kYXJ5ID0gdHJ1ZTtcblx0XHRwcm9tcHQudmFsdWUgPSB0aGlzLnBhdGhGcm9tVXJpKHVyaSk7XG5cblx0XHRsZXQgaXNSZXNvbHZpbmcgPSBmYWxzZTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHByb21wdC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGlzUmVzb2x2aW5nID0gdHJ1ZTtcblx0XHRcdFx0cHJvbXB0LmhpZGUoKTtcblx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQocHJvbXB0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghaXNSZXNvbHZpbmcpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnNob3coKTtcblx0XHRcdFx0XHQvLyBUaGUgcXVpY2sgcGljayBVSSdzIGxpc3QgaXMgc2hhcmVkIGJldHdlZW4gcXVpY2sgcGlja3MsIHNvIHNob3dpbmcgdGhlXG5cdFx0XHRcdFx0Ly8geWVzL25vIHByb21wdCBhYm92ZSByZXBsYWNlZCB0aGUgaXRlbXMgaW4gdGhlIHVuZGVybHlpbmcgbGlzdC4gUmUtYXNzaWduXG5cdFx0XHRcdFx0Ly8gdGhlIGl0ZW1zIHNvIHRoZXkgYXJlIHJlbmRlcmVkIGFnYWluIHdoZW4gdGhlIGZpbGUgcGlja2VyIGlzIHNob3duLlxuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRJdGVtcyA9IHRoaXMuZmlsZVBpY2tCb3guaXRlbXM7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5pdGVtcyA9IGN1cnJlbnRJdGVtcztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChwcm9tcHQub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB7XG5cdFx0XHRcdHByb21wdC5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHByb21wdC5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0XHRcdHByb21wdC5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwcm9tcHQuc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZSh1cmk6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh1cmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWxpZGF0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy5pbnZhbGlkUGF0aCcsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBwYXRoLicpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN0YXREaXJuYW1lOiBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0RGlybmFtZSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdChyZXNvdXJjZXMuZGlybmFtZSh1cmkpKTtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBkbyBub3RoaW5nXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVxdWlyZXNUcmFpbGluZykgeyAvLyBzYXZlXG5cdFx0XHRpZiAoc3RhdD8uaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0Ly8gQ2FuJ3QgZG8gdGhpc1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlRm9sZGVyJywgJ1RoZSBmb2xkZXIgYWxyZWFkeSBleGlzdHMuIFBsZWFzZSB1c2UgYSBuZXcgZmlsZSBuYW1lLicpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXQpIHtcblx0XHRcdFx0Ly8gUmVwbGFjaW5nIGEgZmlsZS5cblx0XHRcdFx0Ly8gU2hvdyBhIHllcy9ubyBwcm9tcHRcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy52YWxpZGF0ZUV4aXN0aW5nJywgJ3swfSBhbHJlYWR5IGV4aXN0cy4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG92ZXJ3cml0ZSBpdD8nLCByZXNvdXJjZXMuYmFzZW5hbWUodXJpKSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnllc05vUHJvbXB0KHVyaSwgbWVzc2FnZSk7XG5cdFx0XHR9IGVsc2UgaWYgKCEoaXNWYWxpZEJhc2VuYW1lKHJlc291cmNlcy5iYXNlbmFtZSh1cmkpLCB0aGlzLmlzV2luZG93cykpKSB7XG5cdFx0XHRcdC8vIEZpbGVuYW1lIG5vdCBhbGxvd2VkXG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cudmFsaWRhdGVCYWRGaWxlbmFtZScsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBmaWxlIG5hbWUuJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAoIXN0YXREaXJuYW1lKSB7XG5cdFx0XHRcdC8vIEZvbGRlciB0byBzYXZlIGluIGRvZXNuJ3QgZXhpc3Rcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy52YWxpZGF0ZUNyZWF0ZURpcmVjdG9yeScsICdUaGUgZm9sZGVyIHswfSBkb2VzIG5vdCBleGlzdC4gV291bGQgeW91IGxpa2UgdG8gY3JlYXRlIGl0PycsIHJlc291cmNlcy5iYXNlbmFtZShyZXNvdXJjZXMuZGlybmFtZSh1cmkpKSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnllc05vUHJvbXB0KHVyaSwgbWVzc2FnZSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFzdGF0RGlybmFtZS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlTm9uZXhpc3RlbnREaXInLCAnUGxlYXNlIGVudGVyIGEgcGF0aCB0aGF0IGV4aXN0cy4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0RGlybmFtZS5yZWFkb25seSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlUmVhZG9ubHlGb2xkZXInLCAnVGhpcyBmb2xkZXIgY2Fubm90IGJlIHVzZWQgYXMgYSBzYXZlIGRlc3RpbmF0aW9uLiBQbGVhc2UgY2hvb3NlIGFub3RoZXIgZm9sZGVyJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgeyAvLyBvcGVuXG5cdFx0XHRpZiAoIXN0YXQpIHtcblx0XHRcdFx0Ly8gRm9yIGEgZm9sZGVyLW9ubHkgcGlja2VyLCBvZmZlciB0byBjcmVhdGUgdGhlIGZvbGRlciBpZiBhIHdyaXRhYmxlIGFuY2VzdG9yIGV4aXN0cy5cblx0XHRcdFx0aWYgKHRoaXMuYWxsb3dGb2xkZXJTZWxlY3Rpb24gJiYgIXRoaXMuYWxsb3dGaWxlU2VsZWN0aW9uXG5cdFx0XHRcdFx0JiYgYXdhaXQgdGhpcy5jYW5DcmVhdGVGb2xkZXIodXJpLCBzdGF0RGlybmFtZSkpIHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlQ3JlYXRlRGlyZWN0b3J5T3BlbicsICdUaGUgZm9sZGVyIHswfSBkb2VzIG5vdCBleGlzdC4gV291bGQgeW91IGxpa2UgdG8gY3JlYXRlIGl0PycsIHJlc291cmNlcy5iYXNlbmFtZSh1cmkpKTtcblx0XHRcdFx0XHRjb25zdCBzaG91bGRDcmVhdGUgPSBhd2FpdCB0aGlzLnllc05vUHJvbXB0KHVyaSwgbWVzc2FnZSk7XG5cdFx0XHRcdFx0aWYgKCFzaG91bGRDcmVhdGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVyaSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLmNyZWF0ZUZvbGRlckZhaWxlZCcsICdDb3VsZCBub3QgY3JlYXRlIGZvbGRlcjogezB9JywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRmlsZSBvciBmb2xkZXIgZG9lc24ndCBleGlzdFxuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlTm9uZXhpc3RlbnREaXInLCAnUGxlYXNlIGVudGVyIGEgcGF0aCB0aGF0IGV4aXN0cy4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICh1cmkucGF0aCA9PT0gJy8nICYmIHRoaXMuaXNXaW5kb3dzKSB7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cud2luZG93c0RyaXZlTGV0dGVyJywgJ1BsZWFzZSBzdGFydCB0aGUgcGF0aCB3aXRoIGEgZHJpdmUgbGV0dGVyLicpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkgJiYgIXRoaXMuYWxsb3dGb2xkZXJTZWxlY3Rpb24pIHtcblx0XHRcdFx0Ly8gRm9sZGVyIHNlbGVjdGVkIHdoZW4gZm9sZGVyIHNlbGVjdGlvbiBub3QgcGVybWl0dGVkXG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cudmFsaWRhdGVGaWxlT25seScsICdQbGVhc2Ugc2VsZWN0IGEgZmlsZS4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICghc3RhdC5pc0RpcmVjdG9yeSAmJiAhdGhpcy5hbGxvd0ZpbGVTZWxlY3Rpb24pIHtcblx0XHRcdFx0Ly8gRmlsZSBzZWxlY3RlZCB3aGVuIGZpbGUgc2VsZWN0aW9uIG5vdCBwZXJtaXR0ZWRcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWxpZGF0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy52YWxpZGF0ZUZvbGRlck9ubHknLCAnUGxlYXNlIHNlbGVjdCBhIGZvbGRlci4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2FuQ3JlYXRlRm9sZGVyKHVyaTogVVJJLCBwYXJlbnRTdGF0PzogSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGltbWVkaWF0ZVBhcmVudCA9IHJlc291cmNlcy5kaXJuYW1lKHVyaSk7XG5cdFx0bGV0IGNhbmRpZGF0ZSA9IHVyaTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IHJlc291cmNlcy5iYXNlbmFtZShjYW5kaWRhdGUpO1xuXHRcdFx0aWYgKCFuYW1lIHx8ICFpc1ZhbGlkQmFzZW5hbWUobmFtZSwgdGhpcy5pc1dpbmRvd3MpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50ID0gcmVzb3VyY2VzLmRpcm5hbWUoY2FuZGlkYXRlKTtcblx0XHRcdGlmIChyZXNvdXJjZXMuaXNFcXVhbChwYXJlbnQsIGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gcGFyZW50U3RhdCAmJiByZXNvdXJjZXMuaXNFcXVhbChwYXJlbnQsIGltbWVkaWF0ZVBhcmVudCkgPyBwYXJlbnRTdGF0IDogYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHBhcmVudCk7XG5cdFx0XHRcdHJldHVybiBzdGF0LmlzRGlyZWN0b3J5ICYmICFzdGF0LnJlYWRvbmx5O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAodG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IHVuZGVmaW5lZCkgIT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FuZGlkYXRlID0gcGFyZW50O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFJldHVybnMgdHJ1ZSBpZiB0aGVyZSBpcyBhIGZpbGUgYXQgdGhlIGVuZCBvZiB0aGUgVVJJLlxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUl0ZW1zKG5ld0ZvbGRlcjogVVJJLCBmb3JjZTogYm9vbGVhbiA9IGZhbHNlLCB0cmFpbGluZz86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuYnVzeSA9IHRydWU7XG5cdFx0dGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCA9ICcnO1xuXHRcdGNvbnN0IHdhc0RvdERvdCA9IHRyYWlsaW5nID09PSAnLi4nO1xuXHRcdHRyYWlsaW5nID0gd2FzRG90RG90ID8gdW5kZWZpbmVkIDogdHJhaWxpbmc7XG5cdFx0Y29uc3QgaXNTYXZlID0gISF0cmFpbGluZztcblx0XHRsZXQgcmVzdWx0ID0gZmFsc2U7XG5cblx0XHRjb25zdCB1cGRhdGluZ1Byb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRsZXQgZm9sZGVyU3RhdDogSUZpbGVTdGF0IHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9sZGVyU3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShuZXdGb2xkZXIpO1xuXHRcdFx0XHRpZiAoIWZvbGRlclN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHR0cmFpbGluZyA9IHJlc291cmNlcy5iYXNlbmFtZShuZXdGb2xkZXIpO1xuXHRcdFx0XHRcdG5ld0ZvbGRlciA9IHJlc291cmNlcy5kaXJuYW1lKG5ld0ZvbGRlcik7XG5cdFx0XHRcdFx0Zm9sZGVyU3RhdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXN1bHQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIFRoZSBmaWxlL2RpcmVjdG9yeSBkb2Vzbid0IGV4aXN0XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHRyYWlsaW5nID8gdGhpcy5wYXRoQXBwZW5kKG5ld0ZvbGRlciwgdHJhaWxpbmcpIDogdGhpcy5wYXRoRnJvbVVyaShuZXdGb2xkZXIsIHRydWUpO1xuXHRcdFx0Y29uc3QgY3VycmVudEZvbGRlciA9IHRoaXMuZW5kc1dpdGhTbGFzaChuZXdGb2xkZXIucGF0aCkgPyBuZXdGb2xkZXIgOiByZXNvdXJjZXMuYWRkVHJhaWxpbmdQYXRoU2VwYXJhdG9yKG5ld0ZvbGRlciwgdGhpcy5zZXBhcmF0b3IpO1xuXHRcdFx0Y29uc3QgdXNlckVudGVyZWRQYXRoU2VnbWVudCA9IHRyYWlsaW5nID8gdHJhaWxpbmcgOiAnJztcblxuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSXRlbXMoZm9sZGVyU3RhdCwgY3VycmVudEZvbGRlciwgdG9rZW4pLnRoZW4oaXRlbXMgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmN1cnJlbnRGb2xkZXIgPSBjdXJyZW50Rm9sZGVyO1xuXHRcdFx0XHR0aGlzLnVzZXJFbnRlcmVkUGF0aFNlZ21lbnQgPSB1c2VyRW50ZXJlZFBhdGhTZWdtZW50O1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94Lml0ZW1BY3RpdmF0aW9uID0gSXRlbUFjdGl2YXRpb24uTk9ORTtcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5pdGVtcyA9IGl0ZW1zO1xuXG5cdFx0XHRcdC8vIHRoZSB1c2VyIG1pZ2h0IGhhdmUgY29udGludWVkIHR5cGluZyB3aGlsZSB3ZSB3ZXJlIHVwZGF0aW5nLiBPbmx5IHVwZGF0ZSB0aGUgaW5wdXQgYm94IGlmIGl0IGRvZXNuJ3QgbWF0Y2ggdGhlIGRpcmVjdG9yeS5cblx0XHRcdFx0aWYgKCFlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUsIG5ld1ZhbHVlKSAmJiAoZm9yY2UgfHwgd2FzRG90RG90KSkge1xuXHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbMCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHRcdHRoaXMuaW5zZXJ0VGV4dChuZXdWYWx1ZSwgbmV3VmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmb3JjZSAmJiB0cmFpbGluZyAmJiBpc1NhdmUpIHtcblx0XHRcdFx0XHQvLyBLZWVwIHRoZSBjdXJzb3IgcG9zaXRpb24gaW4gZnJvbnQgb2YgdGhlIHNhdmUgYXMgbmFtZS5cblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gW3RoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoIC0gdHJhaWxpbmcubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCAtIHRyYWlsaW5nLmxlbmd0aF07XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXRyYWlsaW5nKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgdHJhaWxpbmcsIHdlIGRvbid0IG1vdmUgdGhlIGN1cnNvci4gSWYgdGhlcmUgaXMgbm8gdHJhaWxpbmcsIGN1cnNvciBnb2VzIGF0IHRoZSBlbmQuXG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLnVwZGF0aW5nUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMudXBkYXRpbmdQcm9taXNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRpbmdQcm9taXNlLmNhbmNlbCgpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0aW5nUHJvbWlzZSA9IHVwZGF0aW5nUHJvbWlzZTtcblxuXHRcdHJldHVybiB1cGRhdGluZ1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHBhdGhGcm9tVXJpKHVyaTogVVJJLCBlbmRXaXRoU2VwYXJhdG9yOiBib29sZWFuID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdC8vIEZvciBhdXRob3JpdHktc2NvcGVkIHNjaGVtZXMsIHVzZSB0aGUgcmF3IHBhdGggY29tcG9uZW50IGluc3RlYWRcblx0XHQvLyBvZiBmc1BhdGgsIHdoaWNoIHdvdWxkIHByZXBlbmQgdGhlIGF1dGhvcml0eSBhcyBhIFVOQyBwcmVmaXguXG5cdFx0bGV0IHJlc3VsdDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLnNjb3BlZEF1dGhvcml0eSkge1xuXHRcdFx0cmVzdWx0ID0gdXJpLnBhdGgucmVwbGFjZSgvXFxuL2csICcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIodXJpLmZzUGF0aCwgdGhpcy5pc1dpbmRvd3MpLnJlcGxhY2UoL1xcbi9nLCAnJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlcGFyYXRvciA9PT0gJy8nKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFxcXC9nLCB0aGlzLnNlcGFyYXRvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXC8vZywgdGhpcy5zZXBhcmF0b3IpO1xuXHRcdH1cblx0XHRpZiAoZW5kV2l0aFNlcGFyYXRvciAmJiAhdGhpcy5lbmRzV2l0aFNsYXNoKHJlc3VsdCkpIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdCArIHRoaXMuc2VwYXJhdG9yO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXRoQXBwZW5kKHVyaTogVVJJLCBhZGRpdGlvbmFsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICgoYWRkaXRpb25hbCA9PT0gJy4uJykgfHwgKGFkZGl0aW9uYWwgPT09ICcuJykpIHtcblx0XHRcdGNvbnN0IGJhc2VQYXRoID0gdGhpcy5wYXRoRnJvbVVyaSh1cmksIHRydWUpO1xuXHRcdFx0cmV0dXJuIGJhc2VQYXRoICsgYWRkaXRpb25hbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMucGF0aEZyb21VcmkocmVzb3VyY2VzLmpvaW5QYXRoKHVyaSwgYWRkaXRpb25hbCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tJc1dpbmRvd3NPUygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgaXNXaW5kb3dzT1MgPSBpc1dpbmRvd3M7XG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVBZ2VudEVudmlyb25tZW50KCk7XG5cdFx0aWYgKGVudikge1xuXHRcdFx0aXNXaW5kb3dzT1MgPSBlbnYub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNXaW5kb3dzT1M7XG5cdH1cblxuXHRwcml2YXRlIGVuZHNXaXRoU2xhc2goczogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIC9bXFwvXFxcXF0kLy50ZXN0KHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBiYXNlbmFtZVdpdGhUcmFpbGluZ1NsYXNoKGZ1bGxQYXRoOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoaWxkID0gdGhpcy5wYXRoRnJvbVVyaShmdWxsUGF0aCwgdHJ1ZSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5wYXRoRnJvbVVyaShyZXNvdXJjZXMuZGlybmFtZShmdWxsUGF0aCksIHRydWUpO1xuXHRcdHJldHVybiBjaGlsZC5zdWJzdHJpbmcocGFyZW50Lmxlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUJhY2tJdGVtKGN1cnJGb2xkZXI6IFVSSSk6IFByb21pc2U8RmlsZVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBGb3IgYXV0aG9yaXR5LXNjb3BlZCBVUklzLCBjb21wYXJlIHdpdGhpbiB0aGUgb3JpZ2luYWwgc2NoZW1lIHNvXG5cdFx0Ly8gdGhhdCB0aGUgYXV0aG9yaXR5IGlzIHByZXNlcnZlZCBhbmQgdGhlIHJvb3QgaXMgZGV0ZWN0ZWQgY29ycmVjdGx5LlxuXHRcdGNvbnN0IGNvbXBhcmVTY2hlbWUgPSB0aGlzLnNjb3BlZEF1dGhvcml0eSA/IHRoaXMuc2NoZW1lIDogU2NoZW1hcy5maWxlO1xuXHRcdGNvbnN0IGNvbXBhcmVBdXRob3JpdHkgPSB0aGlzLnNjb3BlZEF1dGhvcml0eSA/PyAnJztcblx0XHRjb25zdCBmaWxlUmVwcmVzZW50YXRpb25DdXJyID0gY3VyckZvbGRlci53aXRoKHsgc2NoZW1lOiBjb21wYXJlU2NoZW1lLCBhdXRob3JpdHk6IGNvbXBhcmVBdXRob3JpdHkgfSk7XG5cdFx0Y29uc3QgZmlsZVJlcHJlc2VudGF0aW9uUGFyZW50ID0gcmVzb3VyY2VzLmRpcm5hbWUoZmlsZVJlcHJlc2VudGF0aW9uQ3Vycik7XG5cdFx0aWYgKCFyZXNvdXJjZXMuaXNFcXVhbChmaWxlUmVwcmVzZW50YXRpb25DdXJyLCBmaWxlUmVwcmVzZW50YXRpb25QYXJlbnQpKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRGb2xkZXIgPSByZXNvdXJjZXMuZGlybmFtZShjdXJyRm9sZGVyKTtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhwYXJlbnRGb2xkZXIpKSB7XG5cdFx0XHRcdHJldHVybiB7IGxhYmVsOiAnLi4nLCB1cmk6IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IocGFyZW50Rm9sZGVyLCB0aGlzLnNlcGFyYXRvciksIGlzRm9sZGVyOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUl0ZW1zKGZvbGRlcjogSUZpbGVTdGF0IHwgdW5kZWZpbmVkLCBjdXJyZW50Rm9sZGVyOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RmlsZVF1aWNrUGlja0l0ZW1bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogRmlsZVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgYmFja0RpciA9IGF3YWl0IHRoaXMuY3JlYXRlQmFja0l0ZW0oY3VycmVudEZvbGRlcik7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghZm9sZGVyKSB7XG5cdFx0XHRcdGZvbGRlciA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShjdXJyZW50Rm9sZGVyKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbHRlcmVkQ2hpbGRyZW4gPSB0aGlzLl9zaG93RG90RmlsZXMgPyBmb2xkZXIuY2hpbGRyZW4gOiBmb2xkZXIuY2hpbGRyZW4/LmZpbHRlcihjaGlsZCA9PiAhY2hpbGQubmFtZS5zdGFydHNXaXRoKCcuJykpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBmaWx0ZXJlZENoaWxkcmVuID8gYXdhaXQgUHJvbWlzZS5hbGwoZmlsdGVyZWRDaGlsZHJlbi5tYXAoY2hpbGQgPT4gdGhpcy5jcmVhdGVJdGVtKGNoaWxkLCBjdXJyZW50Rm9sZGVyLCB0b2tlbikpKSA6IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHRcdGNvbnNvbGUubG9nKGUpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc29ydGVkID0gcmVzdWx0LnNvcnQoKGkxLCBpMikgPT4ge1xuXHRcdFx0aWYgKGkxLmlzRm9sZGVyICE9PSBpMi5pc0ZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gaTEuaXNGb2xkZXIgPyAtMSA6IDE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cmltbWVkMSA9IHRoaXMuZW5kc1dpdGhTbGFzaChpMS5sYWJlbCkgPyBpMS5sYWJlbC5zdWJzdHIoMCwgaTEubGFiZWwubGVuZ3RoIC0gMSkgOiBpMS5sYWJlbDtcblx0XHRcdGNvbnN0IHRyaW1tZWQyID0gdGhpcy5lbmRzV2l0aFNsYXNoKGkyLmxhYmVsKSA/IGkyLmxhYmVsLnN1YnN0cigwLCBpMi5sYWJlbC5sZW5ndGggLSAxKSA6IGkyLmxhYmVsO1xuXHRcdFx0cmV0dXJuIHRyaW1tZWQxLmxvY2FsZUNvbXBhcmUodHJpbW1lZDIpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGJhY2tEaXIpIHtcblx0XHRcdHNvcnRlZC51bnNoaWZ0KGJhY2tEaXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gc29ydGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJGaWxlKGZpbGU6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmlsdGVycykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm9wdGlvbnMuZmlsdGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0RXh0ID0gdGhpcy5vcHRpb25zLmZpbHRlcnNbaV0uZXh0ZW5zaW9uc1tqXTtcblx0XHRcdFx0XHRpZiAoKHRlc3RFeHQgPT09ICcqJykgfHwgKGZpbGUucGF0aC5lbmRzV2l0aCgnLicgKyB0ZXN0RXh0KSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlSXRlbShzdGF0OiBJRmlsZVN0YXQsIHBhcmVudDogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEZpbGVRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZnVsbFBhdGggPSByZXNvdXJjZXMuam9pblBhdGgocGFyZW50LCBzdGF0Lm5hbWUpO1xuXHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IHJlc291cmNlcy5iYXNlbmFtZShmdWxsUGF0aCk7XG5cdFx0XHRmdWxsUGF0aCA9IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IoZnVsbFBhdGgsIHRoaXMuc2VwYXJhdG9yKTtcblx0XHRcdHJldHVybiB7IGxhYmVsOiBmaWxlbmFtZSwgdXJpOiBmdWxsUGF0aCwgaXNGb2xkZXI6IHRydWUsIGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIGZ1bGxQYXRoIHx8IHVuZGVmaW5lZCwgRmlsZUtpbmQuRk9MREVSKSB9O1xuXHRcdH0gZWxzZSBpZiAoIXN0YXQuaXNEaXJlY3RvcnkgJiYgdGhpcy5hbGxvd0ZpbGVTZWxlY3Rpb24gJiYgdGhpcy5maWx0ZXJGaWxlKGZ1bGxQYXRoKSkge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IHN0YXQubmFtZSwgdXJpOiBmdWxsUGF0aCwgaXNGb2xkZXI6IGZhbHNlLCBpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXModGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCBmdWxsUGF0aCB8fCB1bmRlZmluZWQpIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksZUFBZTtBQUMzQixZQUFZLGFBQWE7QUFDekIsU0FBUyxjQUF5QixVQUF3Qyw2QkFBNkIscUNBQXFDO0FBQzVJLFNBQVMsb0JBQWdELHNCQUFzQjtBQUMvRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxXQUFXLHVCQUF1QjtBQUMzQyxTQUFpRCwwQkFBMEI7QUFDM0UsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQWlDLHFCQUFxQjtBQUMvRCxTQUFTLGtCQUFrQixRQUFRLDRCQUE0QjtBQUMvRCxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUywrQkFBa0Q7QUFHM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hC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
