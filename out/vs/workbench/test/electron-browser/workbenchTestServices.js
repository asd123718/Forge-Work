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
import { insert } from "../../../base/common/arrays.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { INativeEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IExtensionManagementService } from "../../../platform/extensionManagement/common/extensionManagement.js";
import { AbstractNativeExtensionTipsService } from "../../../platform/extensionManagement/common/extensionTipsService.js";
import { IExtensionRecommendationNotificationService } from "../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { IFileService, FileSystemProviderCapabilities, FileType } from "../../../platform/files/common/files.js";
import { FileService } from "../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../platform/log/common/log.js";
import { INativeHostService } from "../../../platform/native/common/native.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { UriIdentityService } from "../../../platform/uriIdentity/common/uriIdentityService.js";
import { FileUserDataProvider } from "../../../platform/userData/common/fileUserDataProvider.js";
import { UserDataProfilesService } from "../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IFilesConfigurationService } from "../../services/filesConfiguration/common/filesConfigurationService.js";
import { ILifecycleService } from "../../services/lifecycle/common/lifecycle.js";
import { ITextFileService } from "../../services/textfile/common/textfiles.js";
import { NativeTextFileService } from "../../services/textfile/electron-browser/nativeTextFileService.js";
import { IWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackup.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { NativeWorkingCopyBackupService } from "../../services/workingCopy/electron-browser/workingCopyBackupService.js";
import { workbenchInstantiationService as browserWorkbenchInstantiationService, TestEncodingOracle, TestEnvironmentService, TestLifecycleService } from "../browser/workbenchTestServices.js";
class TestSharedProcessService {
  createRawConnection() {
    throw new Error("Not Implemented");
  }
  getChannel(channelName) {
    return void 0;
  }
  registerChannel(channelName, channel) {
  }
  notifyRestored() {
  }
}
class TestNativeHostService {
  constructor() {
    this.windowId = -1;
    this.onDidOpenMainWindow = Event.None;
    this.onDidMaximizeWindow = Event.None;
    this.onDidUnmaximizeWindow = Event.None;
    this.onDidFocusMainWindow = Event.None;
    this.onDidBlurMainWindow = Event.None;
    this.onDidFocusMainOrAuxiliaryWindow = Event.None;
    this.onDidBlurMainOrAuxiliaryWindow = Event.None;
    this.onDidSuspendOS = Event.None;
    this.onDidResumeOS = Event.None;
    this.onDidChangeOnBatteryPower = Event.None;
    this.onDidChangeThermalState = Event.None;
    this.onDidChangeSpeedLimit = Event.None;
    this.onWillShutdownOS = Event.None;
    this.onDidLockScreen = Event.None;
    this.onDidUnlockScreen = Event.None;
    this.onDidChangeColorScheme = Event.None;
    this.onDidChangePassword = Event.None;
    this.onDidTriggerWindowSystemContextMenu = Event.None;
    this.onDidChangeWindowFullScreen = Event.None;
    this.onDidChangeWindowAlwaysOnTop = Event.None;
    this.onDidChangeDisplay = Event.None;
    this.windowCount = Promise.resolve(1);
  }
  getWindowCount() {
    return this.windowCount;
  }
  async getWindows() {
    return [];
  }
  async getActiveWindowId() {
    return void 0;
  }
  async getActiveWindowPosition() {
    return void 0;
  }
  async getWindowPosition() {
    return void 0;
  }
  async getNativeWindowHandle(windowId) {
    return void 0;
  }
  openWindow(arg1, arg2) {
    throw new Error("Method not implemented.");
  }
  async openAgentsWindow(_options) {
  }
  async syncSystemWideKeybindings(_keybindings) {
    return { failed: [] };
  }
  async toggleFullScreen() {
  }
  async isMaximized() {
    return true;
  }
  async isFullScreen() {
    return true;
  }
  async maximizeWindow() {
  }
  async unmaximizeWindow() {
  }
  async minimizeWindow() {
  }
  async moveWindowTop(options) {
  }
  async isWindowAlwaysOnTop(options) {
    return false;
  }
  async toggleWindowAlwaysOnTop(options) {
  }
  async setWindowAlwaysOnTop(alwaysOnTop, options) {
  }
  async getCursorScreenPoint() {
    throw new Error("Method not implemented.");
  }
  async positionWindow(position, options) {
  }
  async updateWindowControls(options) {
  }
  async updateWindowAccentColor(color) {
  }
  async setMinimumSize(width, height) {
  }
  async saveWindowSplash(value) {
  }
  async setBackgroundThrottling(throttling) {
  }
  async focusWindow(options) {
  }
  async showMessageBox(options) {
    throw new Error("Method not implemented.");
  }
  async showSaveDialog(options) {
    throw new Error("Method not implemented.");
  }
  async showOpenDialog(options) {
    throw new Error("Method not implemented.");
  }
  async pickFileFolderAndOpen(options) {
  }
  async pickFileAndOpen(options) {
  }
  async pickFolderAndOpen(options) {
  }
  async pickWorkspaceAndOpen(options) {
  }
  async showItemInFolder(path) {
  }
  async setRepresentedFilename(path) {
  }
  async isAdmin() {
    return false;
  }
  async writeElevated(source, target) {
  }
  async isRunningUnderARM64Translation() {
    return false;
  }
  async getOSProperties() {
    return /* @__PURE__ */ Object.create(null);
  }
  async getOSStatistics() {
    return /* @__PURE__ */ Object.create(null);
  }
  async getOSVirtualMachineHint() {
    return 0;
  }
  async getOSColorScheme() {
    return { dark: true, highContrast: false };
  }
  async hasWSLFeatureInstalled() {
    return false;
  }
  async getProcessId() {
    throw new Error("Method not implemented.");
  }
  async killProcess() {
  }
  async listOllamaModels(_baseUrl) {
    return [];
  }
  async setDocumentEdited(edited) {
  }
  async openExternal(url, defaultApplication) {
    return false;
  }
  async updateTouchBar() {
  }
  async moveItemToTrash() {
  }
  async getMediaAccessStatus(_mediaType) {
    return "granted";
  }
  async newWindowTab() {
  }
  async showPreviousWindowTab() {
  }
  async showNextWindowTab() {
  }
  async moveWindowTabToNewWindow() {
  }
  async mergeAllWindowTabs() {
  }
  async toggleWindowTabsBar() {
  }
  async installShellCommand() {
  }
  async uninstallShellCommand() {
  }
  async notifyReady() {
  }
  async relaunch(options) {
  }
  async reload() {
  }
  async closeWindow() {
  }
  async quit() {
  }
  async exit(code) {
  }
  async openDevTools(options) {
  }
  async toggleDevTools() {
  }
  async stopTracing() {
  }
  async openDevToolsWindow(url) {
  }
  async openGPUInfoWindow() {
  }
  async openContentTracingWindow() {
  }
  async resolveProxy(url) {
    return void 0;
  }
  async resolveProxyWithPackage() {
    return [];
  }
  async readProxyConfigWithPackage() {
    return {
      environment: {},
      autoDetect: false,
      wpadDhcp: { state: "unsupported" },
      wpadDns: { state: "disabled" },
      configuredPac: { state: "unconfigured" }
    };
  }
  async lookupAuthorization(authInfo) {
    return void 0;
  }
  async lookupKerberosAuthorization(url) {
    return void 0;
  }
  async loadCertificates() {
    return [];
  }
  async isPortFree() {
    return Promise.resolve(true);
  }
  async findFreePort(startPort, giveUpAfter, timeout, stride) {
    return -1;
  }
  async readClipboardText(type) {
    return "";
  }
  async writeClipboardText(text, type) {
  }
  async readClipboardFindText() {
    return "";
  }
  async writeClipboardFindText(text) {
  }
  async writeClipboardBuffer(format, buffer, type) {
  }
  async triggerPaste(options) {
  }
  async readImage() {
    return Uint8Array.from([]);
  }
  async readClipboardBuffer(format) {
    return VSBuffer.wrap(Uint8Array.from([]));
  }
  async hasClipboard(format, type) {
    return false;
  }
  async windowsGetStringRegKey(hive, path, name) {
    return void 0;
  }
  async createZipFile(zipPath, files) {
  }
  async profileRenderer() {
    throw new Error();
  }
  async startTracing() {
    throw new Error();
  }
  async getScreenshot(rect) {
    return void 0;
  }
  async uploadFileViaMobileApi(_token, _repoId, fileName, _fileBytes, contentType) {
    return { fileName, assetUrl: "", contentType };
  }
  async showToast(options) {
    return { supported: false, clicked: false };
  }
  async clearToast(id) {
  }
  async clearToasts() {
  }
  // Power APIs
  async getSystemIdleState(idleThreshold) {
    return "unknown";
  }
  async getSystemIdleTime() {
    return 0;
  }
  async getCurrentThermalState() {
    return "unknown";
  }
  async isOnBatteryPower() {
    return false;
  }
  async startPowerSaveBlocker(type) {
    return -1;
  }
  async stopPowerSaveBlocker(id) {
    return false;
  }
  async isPowerSaveBlockerStarted(id) {
    return false;
  }
}
let TestExtensionTipsService = class extends AbstractNativeExtensionTipsService {
  constructor(environmentService, telemetryService, extensionManagementService, storageService, nativeHostService, extensionRecommendationNotificationService, fileService, productService) {
    super(environmentService.userHome, nativeHostService, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService);
  }
};
TestExtensionTipsService = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IExtensionManagementService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, INativeHostService),
  __decorateParam(5, IExtensionRecommendationNotificationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IProductService)
], TestExtensionTipsService);
function workbenchInstantiationService(overrides, disposables = new DisposableStore()) {
  const instantiationService = browserWorkbenchInstantiationService({
    workingCopyBackupService: () => disposables.add(new TestNativeWorkingCopyBackupService()),
    ...overrides
  }, disposables);
  instantiationService.stub(INativeHostService, new TestNativeHostService());
  return instantiationService;
}
let TestServiceAccessor = class {
  constructor(lifecycleService, textFileService, filesConfigurationService, contextService, modelService, fileService, nativeHostService, fileDialogService, workingCopyBackupService, workingCopyService, editorService) {
    this.lifecycleService = lifecycleService;
    this.textFileService = textFileService;
    this.filesConfigurationService = filesConfigurationService;
    this.contextService = contextService;
    this.modelService = modelService;
    this.fileService = fileService;
    this.nativeHostService = nativeHostService;
    this.fileDialogService = fileDialogService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.workingCopyService = workingCopyService;
    this.editorService = editorService;
  }
};
TestServiceAccessor = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IFilesConfigurationService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IFileService),
  __decorateParam(6, INativeHostService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IWorkingCopyBackupService),
  __decorateParam(9, IWorkingCopyService),
  __decorateParam(10, IEditorService)
], TestServiceAccessor);
class TestNativeTextFileServiceWithEncodingOverrides extends NativeTextFileService {
  get encoding() {
    if (!this._testEncoding) {
      this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
    }
    return this._testEncoding;
  }
}
class TestNativeWorkingCopyBackupService extends NativeWorkingCopyBackupService {
  constructor() {
    const environmentService = TestEnvironmentService;
    const logService = new NullLogService();
    const fileService = new FileService(logService);
    const lifecycleService = new TestLifecycleService();
    super(environmentService, fileService, logService, lifecycleService);
    const inMemoryFileSystemProvider = this._register(new InMemoryFileSystemProvider());
    this._register(fileService.registerProvider(Schemas.inMemory, inMemoryFileSystemProvider));
    const uriIdentityService = this._register(new UriIdentityService(fileService));
    const userDataProfilesService = this._register(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
    this._register(fileService.registerProvider(Schemas.vscodeUserData, this._register(new FileUserDataProvider(Schemas.file, inMemoryFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
    this.backupResourceJoiners = [];
    this.discardBackupJoiners = [];
    this.discardedBackups = [];
    this.pendingBackupsArr = [];
    this.discardedAllBackups = false;
    this._register(fileService);
    this._register(lifecycleService);
  }
  testGetFileService() {
    return this.fileService;
  }
  async waitForAllBackups() {
    await Promise.all(this.pendingBackupsArr);
  }
  joinBackupResource() {
    return new Promise((resolve) => this.backupResourceJoiners.push(resolve));
  }
  async backup(identifier, content, versionId, meta, token) {
    const p = super.backup(identifier, content, versionId, meta, token);
    const removeFromPendingBackups = insert(this.pendingBackupsArr, p.then(void 0, void 0));
    try {
      await p;
    } finally {
      removeFromPendingBackups();
    }
    while (this.backupResourceJoiners.length) {
      this.backupResourceJoiners.pop()();
    }
  }
  joinDiscardBackup() {
    return new Promise((resolve) => this.discardBackupJoiners.push(resolve));
  }
  async discardBackup(identifier) {
    await super.discardBackup(identifier);
    this.discardedBackups.push(identifier);
    while (this.discardBackupJoiners.length) {
      this.discardBackupJoiners.pop()();
    }
  }
  async discardBackups(filter) {
    this.discardedAllBackups = true;
    return super.discardBackups(filter);
  }
  async getBackupContents(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const fileContents = await this.fileService.readFile(backupResource);
    return fileContents.value.toString();
  }
}
class TestIPCFileSystemProvider {
  constructor() {
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
    this.onDidChangeCapabilities = Event.None;
    this.onDidChangeFile = Event.None;
  }
  async stat(resource) {
    const { ipcRenderer } = require("electron");
    const stats = await ipcRenderer.invoke("vscode:statFile", resource.fsPath);
    return {
      type: stats.isDirectory ? FileType.Directory : stats.isFile ? FileType.File : FileType.Unknown,
      ctime: stats.ctimeMs,
      mtime: stats.mtimeMs,
      size: stats.size,
      permissions: stats.isReadonly ? 1 : void 0
    };
  }
  async readFile(resource) {
    const { ipcRenderer } = require("electron");
    const result = await ipcRenderer.invoke("vscode:readFile", resource.fsPath);
    return VSBuffer.wrap(result).buffer;
  }
  watch(resource, opts) {
    return { dispose: () => {
    } };
  }
  mkdir(resource) {
    throw new Error("mkdir not implemented in test provider");
  }
  readdir(resource) {
    throw new Error("readdir not implemented in test provider");
  }
  delete(resource, opts) {
    throw new Error("delete not implemented in test provider");
  }
  rename(from, to, opts) {
    throw new Error("rename not implemented in test provider");
  }
  writeFile(resource, content, opts) {
    throw new Error("writeFile not implemented in test provider");
  }
  readFileStream(resource, opts, token) {
    throw new Error("readFileStream not implemented in test provider");
  }
  open(resource, opts) {
    throw new Error("open not implemented in test provider");
  }
  close(fd) {
    throw new Error("close not implemented in test provider");
  }
  read(fd, pos, data, offset, length) {
    throw new Error("read not implemented in test provider");
  }
  write(fd, pos, data, offset, length) {
    throw new Error("write not implemented in test provider");
  }
}
export {
  TestExtensionTipsService,
  TestIPCFileSystemProvider,
  TestNativeHostService,
  TestNativeTextFileServiceWithEncodingOverrides,
  TestNativeWorkingCopyBackupService,
  TestServiceAccessor,
  TestSharedProcessService,
  workbenchInstantiationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHdvcmtiZW5jaFRlc3RTZXJ2aWNlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGluc2VydCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UsIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdE5hdGl2ZUV4dGVuc2lvblRpcHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uVGlwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTeXN0ZW1Qcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCBJRmlsZVdyaXRlT3B0aW9ucywgSUZpbGVPcGVuT3B0aW9ucywgSUZpbGVEZWxldGVPcHRpb25zLCBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMsIElTdGF0LCBGaWxlVHlwZSwgSVdhdGNoT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTaGFyZWRQcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9lbGVjdHJvbi1icm93c2VyL3NlcnZpY2VzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RPcHRpb25zLCBJTmF0aXZlSG9zdFNlcnZpY2UsIElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZywgSU5hdGl2ZVN5c3RlbVdpZGVLZXliaW5kaW5nUmVzdWx0LCBJTmF0aXZlWmlwRmlsZSwgSU9TUHJvcGVydGllcywgSU9TU3RhdGlzdGljcywgSVRvYXN0T3B0aW9ucywgSVRvYXN0UmVzdWx0LCBQb3dlclNhdmVCbG9ja2VyVHlwZSwgU3lzdGVtSWRsZVN0YXRlLCBUaGVybWFsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoSW5mbywgQ3JlZGVudGlhbHMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJUGFydHNTcGxhc2ggfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVVzZXJEYXRhUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YS9jb21tb24vZmlsZVVzZXJEYXRhUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JTY2hlbWUsIElPcGVuZWRNYWluV2luZG93LCBJT3BlbkVtcHR5V2luZG93T3B0aW9ucywgSU9wZW5XaW5kb3dPcHRpb25zLCBJUG9pbnQsIElSZWN0YW5nbGUsIElXaW5kb3dPcGVuYWJsZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IE5hdGl2ZVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlVGV4dEZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9lbGVjdHJvbi1icm93c2VyL3dvcmtpbmdDb3B5QmFja3VwU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSBhcyBicm93c2VyV29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UsIElUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RFbmNvZGluZ09yYWNsZSwgVGVzdEVudmlyb25tZW50U2VydmljZSwgVGVzdEZpbGVEaWFsb2dTZXJ2aWNlLCBUZXN0RmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgVGVzdExpZmVjeWNsZVNlcnZpY2UsIFRlc3RUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RGaWxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgUmVhZGFibGVTdHJlYW1FdmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuXG5leHBvcnQgY2xhc3MgVGVzdFNoYXJlZFByb2Nlc3NTZXJ2aWNlIGltcGxlbWVudHMgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjcmVhdGVSYXdDb25uZWN0aW9uKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgSW1wbGVtZW50ZWQnKTsgfVxuXHRnZXRDaGFubmVsKGNoYW5uZWxOYW1lOiBzdHJpbmcpOiBhbnkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBhbnkpOiB2b2lkIHsgfVxuXHRub3RpZnlSZXN0b3JlZCgpOiB2b2lkIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdE5hdGl2ZUhvc3RTZXJ2aWNlIGltcGxlbWVudHMgSU5hdGl2ZUhvc3RTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB3aW5kb3dJZCA9IC0xO1xuXG5cdHJlYWRvbmx5IG9uRGlkT3Blbk1haW5XaW5kb3c6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZE1heGltaXplV2luZG93OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRVbm1heGltaXplV2luZG93OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRGb2N1c01haW5XaW5kb3c6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEJsdXJNYWluV2luZG93OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRGb2N1c01haW5PckF1eGlsaWFyeVdpbmRvdzogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQmx1ck1haW5PckF1eGlsaWFyeVdpbmRvdzogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU3VzcGVuZE9TOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkUmVzdW1lT1M6IEV2ZW50PHVua25vd24+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPbkJhdHRlcnlQb3dlcjogRXZlbnQ8Ym9vbGVhbj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRoZXJtYWxTdGF0ZTogRXZlbnQ8VGhlcm1hbFN0YXRlPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3BlZWRMaW1pdDogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duT1M6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRMb2NrU2NyZWVuOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkVW5sb2NrU2NyZWVuOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlQ29sb3JTY2hlbWUgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZVBhc3N3b3JkID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyV2luZG93U3lzdGVtQ29udGV4dE1lbnU6IEV2ZW50PHsgd2luZG93SWQ6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4gPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZVdpbmRvd0Z1bGxTY3JlZW4gPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZVdpbmRvd0Fsd2F5c09uVG9wID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VEaXNwbGF5ID0gRXZlbnQuTm9uZTtcblxuXHR3aW5kb3dDb3VudCA9IFByb21pc2UucmVzb2x2ZSgxKTtcblx0Z2V0V2luZG93Q291bnQoKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMud2luZG93Q291bnQ7IH1cblxuXHRhc3luYyBnZXRXaW5kb3dzKCk6IFByb21pc2U8SU9wZW5lZE1haW5XaW5kb3dbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZ2V0QWN0aXZlV2luZG93SWQoKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXRBY3RpdmVXaW5kb3dQb3NpdGlvbigpOiBQcm9taXNlPElSZWN0YW5nbGUgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXRXaW5kb3dQb3NpdGlvbigpOiBQcm9taXNlPElSZWN0YW5nbGUgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXROYXRpdmVXaW5kb3dIYW5kbGUod2luZG93SWQ6IG51bWJlcik6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdG9wZW5XaW5kb3cob3B0aW9ucz86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0b3BlbldpbmRvdyh0b09wZW46IElXaW5kb3dPcGVuYWJsZVtdLCBvcHRpb25zPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0b3BlbldpbmRvdyhhcmcxPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMgfCBJV2luZG93T3BlbmFibGVbXSwgYXJnMj86IElPcGVuV2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5BZ2VudHNXaW5kb3coX29wdGlvbnM/OiB7IGZvbGRlclVyaT86IFVyaUNvbXBvbmVudHM7IHNlc3Npb25SZXNvdXJjZT86IFVyaUNvbXBvbmVudHMgfSk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgc3luY1N5c3RlbVdpZGVLZXliaW5kaW5ncyhfa2V5YmluZGluZ3M6IElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZ1tdKTogUHJvbWlzZTxJTmF0aXZlU3lzdGVtV2lkZUtleWJpbmRpbmdSZXN1bHQ+IHsgcmV0dXJuIHsgZmFpbGVkOiBbXSB9OyB9XG5cblx0YXN5bmMgdG9nZ2xlRnVsbFNjcmVlbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBpc01heGltaXplZCgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRydWU7IH1cblx0YXN5bmMgaXNGdWxsU2NyZWVuKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBtYXhpbWl6ZVdpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyB1bm1heGltaXplV2luZG93KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG1pbmltaXplV2luZG93KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG1vdmVXaW5kb3dUb3Aob3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGlzV2luZG93QWx3YXlzT25Ub3Aob3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgdG9nZ2xlV2luZG93QWx3YXlzT25Ub3Aob3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldFdpbmRvd0Fsd2F5c09uVG9wKGFsd2F5c09uVG9wOiBib29sZWFuLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ2V0Q3Vyc29yU2NyZWVuUG9pbnQoKTogUHJvbWlzZTx7IHJlYWRvbmx5IHBvaW50OiBJUG9pbnQ7IHJlYWRvbmx5IGRpc3BsYXk6IElSZWN0YW5nbGUgfT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgcG9zaXRpb25XaW5kb3cocG9zaXRpb246IElSZWN0YW5nbGUsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyB1cGRhdGVXaW5kb3dDb250cm9scyhvcHRpb25zOiB7IGhlaWdodD86IG51bWJlcjsgYmFja2dyb3VuZENvbG9yPzogc3RyaW5nOyBmb3JlZ3JvdW5kQ29sb3I/OiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHVwZGF0ZVdpbmRvd0FjY2VudENvbG9yKGNvbG9yOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzZXRNaW5pbXVtU2l6ZSh3aWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkLCBoZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNhdmVXaW5kb3dTcGxhc2godmFsdWU6IElQYXJ0c1NwbGFzaCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldEJhY2tncm91bmRUaHJvdHRsaW5nKHRocm90dGxpbmc6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBmb2N1c1dpbmRvdyhvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2hvd01lc3NhZ2VCb3gob3B0aW9uczogRWxlY3Ryb24uTWVzc2FnZUJveE9wdGlvbnMpOiBQcm9taXNlPEVsZWN0cm9uLk1lc3NhZ2VCb3hSZXR1cm5WYWx1ZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgc2hvd1NhdmVEaWFsb2cob3B0aW9uczogRWxlY3Ryb24uU2F2ZURpYWxvZ09wdGlvbnMpOiBQcm9taXNlPEVsZWN0cm9uLlNhdmVEaWFsb2dSZXR1cm5WYWx1ZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgc2hvd09wZW5EaWFsb2cob3B0aW9uczogRWxlY3Ryb24uT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPEVsZWN0cm9uLk9wZW5EaWFsb2dSZXR1cm5WYWx1ZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgcGlja0ZpbGVGb2xkZXJBbmRPcGVuKG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHBpY2tGaWxlQW5kT3BlbihvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBwaWNrRm9sZGVyQW5kT3BlbihvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBwaWNrV29ya3NwYWNlQW5kT3BlbihvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzaG93SXRlbUluRm9sZGVyKHBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldFJlcHJlc2VudGVkRmlsZW5hbWUocGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgaXNBZG1pbigpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHdyaXRlRWxldmF0ZWQoc291cmNlOiBVUkksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgaXNSdW5uaW5nVW5kZXJBUk02NFRyYW5zbGF0aW9uKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgZ2V0T1NQcm9wZXJ0aWVzKCk6IFByb21pc2U8SU9TUHJvcGVydGllcz4geyByZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTsgfVxuXHRhc3luYyBnZXRPU1N0YXRpc3RpY3MoKTogUHJvbWlzZTxJT1NTdGF0aXN0aWNzPiB7IHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpOyB9XG5cdGFzeW5jIGdldE9TVmlydHVhbE1hY2hpbmVIaW50KCk6IFByb21pc2U8bnVtYmVyPiB7IHJldHVybiAwOyB9XG5cdGFzeW5jIGdldE9TQ29sb3JTY2hlbWUoKTogUHJvbWlzZTxJQ29sb3JTY2hlbWU+IHsgcmV0dXJuIHsgZGFyazogdHJ1ZSwgaGlnaENvbnRyYXN0OiBmYWxzZSB9OyB9XG5cdGFzeW5jIGhhc1dTTEZlYXR1cmVJbnN0YWxsZWQoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBnZXRQcm9jZXNzSWQoKTogUHJvbWlzZTxudW1iZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFzeW5jIGtpbGxQcm9jZXNzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGxpc3RPbGxhbWFNb2RlbHMoX2Jhc2VVcmw/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBzZXREb2N1bWVudEVkaXRlZChlZGl0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBvcGVuRXh0ZXJuYWwodXJsOiBzdHJpbmcsIGRlZmF1bHRBcHBsaWNhdGlvbj86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgdXBkYXRlVG91Y2hCYXIoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgbW92ZUl0ZW1Ub1RyYXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdldE1lZGlhQWNjZXNzU3RhdHVzKF9tZWRpYVR5cGU6ICdtaWNyb3Bob25lJyB8ICdjYW1lcmEnIHwgJ3NjcmVlbicpOiBQcm9taXNlPCdub3QtZGV0ZXJtaW5lZCcgfCAnZ3JhbnRlZCcgfCAnZGVuaWVkJyB8ICdyZXN0cmljdGVkJyB8ICd1bmtub3duJz4geyByZXR1cm4gJ2dyYW50ZWQnOyB9XG5cdGFzeW5jIG5ld1dpbmRvd1RhYigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzaG93UHJldmlvdXNXaW5kb3dUYWIoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2hvd05leHRXaW5kb3dUYWIoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgbW92ZVdpbmRvd1RhYlRvTmV3V2luZG93KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG1lcmdlQWxsV2luZG93VGFicygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyB0b2dnbGVXaW5kb3dUYWJzQmFyKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGluc3RhbGxTaGVsbENvbW1hbmQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgdW5pbnN0YWxsU2hlbGxDb21tYW5kKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG5vdGlmeVJlYWR5KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHJlbGF1bmNoKG9wdGlvbnM/OiB7IGFkZEFyZ3M/OiBzdHJpbmdbXSB8IHVuZGVmaW5lZDsgcmVtb3ZlQXJncz86IHN0cmluZ1tdIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZWxvYWQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgY2xvc2VXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcXVpdCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBleGl0KGNvZGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG9wZW5EZXZUb29scyhvcHRpb25zPzogUGFydGlhbDxFbGVjdHJvbi5PcGVuRGV2VG9vbHNPcHRpb25zPiAmIElOYXRpdmVIb3N0T3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHRvZ2dsZURldlRvb2xzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHN0b3BUcmFjaW5nKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG9wZW5EZXZUb29sc1dpbmRvdyh1cmw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG9wZW5HUFVJbmZvV2luZG93KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG9wZW5Db250ZW50VHJhY2luZ1dpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZXNvbHZlUHJveHkodXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHJlc29sdmVQcm94eVdpdGhQYWNrYWdlKCkgeyByZXR1cm4gW107IH1cblx0YXN5bmMgcmVhZFByb3h5Q29uZmlnV2l0aFBhY2thZ2UoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVudmlyb25tZW50OiB7fSxcblx0XHRcdGF1dG9EZXRlY3Q6IGZhbHNlLFxuXHRcdFx0d3BhZERoY3A6IHsgc3RhdGU6ICd1bnN1cHBvcnRlZCcgYXMgY29uc3QgfSxcblx0XHRcdHdwYWREbnM6IHsgc3RhdGU6ICdkaXNhYmxlZCcgYXMgY29uc3QgfSxcblx0XHRcdGNvbmZpZ3VyZWRQYWM6IHsgc3RhdGU6ICd1bmNvbmZpZ3VyZWQnIGFzIGNvbnN0IH1cblx0XHR9O1xuXHR9XG5cdGFzeW5jIGxvb2t1cEF1dGhvcml6YXRpb24oYXV0aEluZm86IEF1dGhJbmZvKTogUHJvbWlzZTxDcmVkZW50aWFscyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbih1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgbG9hZENlcnRpZmljYXRlcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBpc1BvcnRGcmVlKCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpOyB9XG5cdGFzeW5jIGZpbmRGcmVlUG9ydChzdGFydFBvcnQ6IG51bWJlciwgZ2l2ZVVwQWZ0ZXI6IG51bWJlciwgdGltZW91dDogbnVtYmVyLCBzdHJpZGU/OiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4geyByZXR1cm4gLTE7IH1cblx0YXN5bmMgcmVhZENsaXBib2FyZFRleHQodHlwZT86ICdzZWxlY3Rpb24nIHwgJ2NsaXBib2FyZCcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0YXN5bmMgd3JpdGVDbGlwYm9hcmRUZXh0KHRleHQ6IHN0cmluZywgdHlwZT86ICdzZWxlY3Rpb24nIHwgJ2NsaXBib2FyZCcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZWFkQ2xpcGJvYXJkRmluZFRleHQoKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuICcnOyB9XG5cdGFzeW5jIHdyaXRlQ2xpcGJvYXJkRmluZFRleHQodGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgd3JpdGVDbGlwYm9hcmRCdWZmZXIoZm9ybWF0OiBzdHJpbmcsIGJ1ZmZlcjogVlNCdWZmZXIsIHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgdHJpZ2dlclBhc3RlKG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZWFkSW1hZ2UoKTogUHJvbWlzZTxVaW50OEFycmF5PiB7IHJldHVybiBVaW50OEFycmF5LmZyb20oW10pOyB9XG5cdGFzeW5jIHJlYWRDbGlwYm9hcmRCdWZmZXIoZm9ybWF0OiBzdHJpbmcpOiBQcm9taXNlPFZTQnVmZmVyPiB7IHJldHVybiBWU0J1ZmZlci53cmFwKFVpbnQ4QXJyYXkuZnJvbShbXSkpOyB9XG5cdGFzeW5jIGhhc0NsaXBib2FyZChmb3JtYXQ6IHN0cmluZywgdHlwZT86ICdzZWxlY3Rpb24nIHwgJ2NsaXBib2FyZCcgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHdpbmRvd3NHZXRTdHJpbmdSZWdLZXkoaGl2ZTogJ0hLRVlfQ1VSUkVOVF9VU0VSJyB8ICdIS0VZX0xPQ0FMX01BQ0hJTkUnIHwgJ0hLRVlfQ0xBU1NFU19ST09UJyB8ICdIS0VZX1VTRVJTJyB8ICdIS0VZX0NVUlJFTlRfQ09ORklHJywgcGF0aDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGNyZWF0ZVppcEZpbGUoemlwUGF0aDogVVJJLCBmaWxlczogSU5hdGl2ZVppcEZpbGVbXSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHByb2ZpbGVSZW5kZXJlcigpOiBQcm9taXNlPGFueT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRhc3luYyBzdGFydFRyYWNpbmcoKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdGFzeW5jIGdldFNjcmVlbnNob3QocmVjdD86IElSZWN0YW5nbGUpOiBQcm9taXNlPFZTQnVmZmVyIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXBsb2FkRmlsZVZpYU1vYmlsZUFwaShfdG9rZW46IHN0cmluZywgX3JlcG9JZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nLCBfZmlsZUJ5dGVzOiBWU0J1ZmZlciwgY29udGVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8eyBmaWxlTmFtZTogc3RyaW5nOyBhc3NldFVybDogc3RyaW5nOyBjb250ZW50VHlwZTogc3RyaW5nIH0+IHsgcmV0dXJuIHsgZmlsZU5hbWUsIGFzc2V0VXJsOiAnJywgY29udGVudFR5cGUgfTsgfVxuXHRhc3luYyBzaG93VG9hc3Qob3B0aW9uczogSVRvYXN0T3B0aW9ucyk6IFByb21pc2U8SVRvYXN0UmVzdWx0PiB7IHJldHVybiB7IHN1cHBvcnRlZDogZmFsc2UsIGNsaWNrZWQ6IGZhbHNlIH07IH1cblx0YXN5bmMgY2xlYXJUb2FzdChpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgY2xlYXJUb2FzdHMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHQvLyBQb3dlciBBUElzXG5cdGFzeW5jIGdldFN5c3RlbUlkbGVTdGF0ZShpZGxlVGhyZXNob2xkOiBudW1iZXIpOiBQcm9taXNlPFN5c3RlbUlkbGVTdGF0ZT4geyByZXR1cm4gJ3Vua25vd24nOyB9XG5cdGFzeW5jIGdldFN5c3RlbUlkbGVUaW1lKCk6IFByb21pc2U8bnVtYmVyPiB7IHJldHVybiAwOyB9XG5cdGFzeW5jIGdldEN1cnJlbnRUaGVybWFsU3RhdGUoKTogUHJvbWlzZTxUaGVybWFsU3RhdGU+IHsgcmV0dXJuICd1bmtub3duJzsgfVxuXHRhc3luYyBpc09uQmF0dGVyeVBvd2VyKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgc3RhcnRQb3dlclNhdmVCbG9ja2VyKHR5cGU6IFBvd2VyU2F2ZUJsb2NrZXJUeXBlKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIC0xOyB9XG5cdGFzeW5jIHN0b3BQb3dlclNhdmVCbG9ja2VyKGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIGlzUG93ZXJTYXZlQmxvY2tlclN0YXJ0ZWQoaWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFeHRlbnNpb25UaXBzU2VydmljZSBleHRlbmRzIEFic3RyYWN0TmF0aXZlRXh0ZW5zaW9uVGlwc1NlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVudmlyb25tZW50U2VydmljZS51c2VySG9tZSwgbmF0aXZlSG9zdFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLCBmaWxlU2VydmljZSwgcHJvZHVjdFNlcnZpY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZShvdmVycmlkZXM/OiB7XG5cdGVudmlyb25tZW50U2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJRW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRmaWxlU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJRmlsZVNlcnZpY2U7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0dGV4dEZpbGVTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElUZXh0RmlsZVNlcnZpY2U7XG5cdHBhdGhTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElQYXRoU2VydmljZTtcblx0ZWRpdG9yU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJRWRpdG9yU2VydmljZTtcblx0Y29udGV4dEtleVNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHR0ZXh0RWRpdG9yU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJVGV4dEVkaXRvclNlcnZpY2U7XG59LCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk6IElUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGJyb3dzZXJXb3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0d29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiAoKSA9PiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3ROYXRpdmVXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UoKSksXG5cdFx0Li4ub3ZlcnJpZGVzXG5cdH0sIGRpc3Bvc2FibGVzKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOYXRpdmVIb3N0U2VydmljZSwgbmV3IFRlc3ROYXRpdmVIb3N0U2VydmljZSgpKTtcblxuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2U7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0U2VydmljZUFjY2Vzc29yIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHB1YmxpYyBsaWZlY3ljbGVTZXJ2aWNlOiBUZXN0TGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwdWJsaWMgdGV4dEZpbGVTZXJ2aWNlOiBUZXN0VGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwdWJsaWMgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogVGVzdEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwdWJsaWMgY29udGV4dFNlcnZpY2U6IFRlc3RDb250ZXh0U2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwdWJsaWMgbW9kZWxTZXJ2aWNlOiBNb2RlbFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwdWJsaWMgZmlsZVNlcnZpY2U6IFRlc3RGaWxlU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHB1YmxpYyBuYXRpdmVIb3N0U2VydmljZTogVGVzdE5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHVibGljIGZpbGVEaWFsb2dTZXJ2aWNlOiBUZXN0RmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgcHVibGljIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogVGVzdE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSBwdWJsaWMgd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwdWJsaWMgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3ROYXRpdmVUZXh0RmlsZVNlcnZpY2VXaXRoRW5jb2RpbmdPdmVycmlkZXMgZXh0ZW5kcyBOYXRpdmVUZXh0RmlsZVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgX3Rlc3RFbmNvZGluZzogVGVzdEVuY29kaW5nT3JhY2xlIHwgdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBnZXQgZW5jb2RpbmcoKTogVGVzdEVuY29kaW5nT3JhY2xlIHtcblx0XHRpZiAoIXRoaXMuX3Rlc3RFbmNvZGluZykge1xuXHRcdFx0dGhpcy5fdGVzdEVuY29kaW5nID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0RW5jb2RpbmdPcmFjbGUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdGVzdEVuY29kaW5nO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TmF0aXZlV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIGV4dGVuZHMgTmF0aXZlV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgYmFja3VwUmVzb3VyY2VKb2luZXJzOiBGdW5jdGlvbltdO1xuXHRwcml2YXRlIGRpc2NhcmRCYWNrdXBKb2luZXJzOiBGdW5jdGlvbltdO1xuXHRkaXNjYXJkZWRCYWNrdXBzOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW107XG5cdGRpc2NhcmRlZEFsbEJhY2t1cHM6IGJvb2xlYW47XG5cdHByaXZhdGUgcGVuZGluZ0JhY2t1cHNBcnI6IFByb21pc2U8dm9pZD5bXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBsaWZlY3ljbGVTZXJ2aWNlID0gbmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0c3VwZXIoZW52aXJvbm1lbnRTZXJ2aWNlIGFzIGFueSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UsIGxpZmVjeWNsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBpbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBVcmlJZGVudGl0eVNlcnZpY2UoZmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBVc2VyRGF0YVByb2ZpbGVzU2VydmljZShlbnZpcm9ubWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIHRoaXMuX3JlZ2lzdGVyKG5ldyBGaWxlVXNlckRhdGFQcm92aWRlcihTY2hlbWFzLmZpbGUsIGluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyLCBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSkpKTtcblxuXHRcdHRoaXMuYmFja3VwUmVzb3VyY2VKb2luZXJzID0gW107XG5cdFx0dGhpcy5kaXNjYXJkQmFja3VwSm9pbmVycyA9IFtdO1xuXHRcdHRoaXMuZGlzY2FyZGVkQmFja3VwcyA9IFtdO1xuXHRcdHRoaXMucGVuZGluZ0JhY2t1cHNBcnIgPSBbXTtcblx0XHR0aGlzLmRpc2NhcmRlZEFsbEJhY2t1cHMgPSBmYWxzZTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaWZlY3ljbGVTZXJ2aWNlKTtcblx0fVxuXG5cdHRlc3RHZXRGaWxlU2VydmljZSgpOiBJRmlsZVNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlO1xuXHR9XG5cblx0YXN5bmMgd2FpdEZvckFsbEJhY2t1cHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5wZW5kaW5nQmFja3Vwc0Fycik7XG5cdH1cblxuXHRqb2luQmFja3VwUmVzb3VyY2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gdGhpcy5iYWNrdXBSZXNvdXJjZUpvaW5lcnMucHVzaChyZXNvbHZlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBiYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgY29udGVudD86IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBhbnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwID0gc3VwZXIuYmFja3VwKGlkZW50aWZpZXIsIGNvbnRlbnQsIHZlcnNpb25JZCwgbWV0YSwgdG9rZW4pO1xuXHRcdGNvbnN0IHJlbW92ZUZyb21QZW5kaW5nQmFja3VwcyA9IGluc2VydCh0aGlzLnBlbmRpbmdCYWNrdXBzQXJyLCBwLnRoZW4odW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZW1vdmVGcm9tUGVuZGluZ0JhY2t1cHMoKTtcblx0XHR9XG5cblx0XHR3aGlsZSAodGhpcy5iYWNrdXBSZXNvdXJjZUpvaW5lcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycy5wb3AoKSEoKTtcblx0XHR9XG5cdH1cblxuXHRqb2luRGlzY2FyZEJhY2t1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLmRpc2NhcmRCYWNrdXBKb2luZXJzLnB1c2gocmVzb2x2ZSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGlzY2FyZEJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuZGlzY2FyZEJhY2t1cChpZGVudGlmaWVyKTtcblx0XHR0aGlzLmRpc2NhcmRlZEJhY2t1cHMucHVzaChpZGVudGlmaWVyKTtcblxuXHRcdHdoaWxlICh0aGlzLmRpc2NhcmRCYWNrdXBKb2luZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5kaXNjYXJkQmFja3VwSm9pbmVycy5wb3AoKSEoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkaXNjYXJkQmFja3VwcyhmaWx0ZXI/OiB7IGV4Y2VwdDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpc2NhcmRlZEFsbEJhY2t1cHMgPSB0cnVlO1xuXG5cdFx0cmV0dXJuIHN1cGVyLmRpc2NhcmRCYWNrdXBzKGZpbHRlcik7XG5cdH1cblxuXHRhc3luYyBnZXRCYWNrdXBDb250ZW50cyhpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBiYWNrdXBSZXNvdXJjZSA9IHRoaXMudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoYmFja3VwUmVzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIGZpbGVDb250ZW50cy52YWx1ZS50b1N0cmluZygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0SVBDRmlsZVN5c3RlbVByb3ZpZGVyIGltcGxlbWVudHMgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzID0gRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmU7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGUgPSBFdmVudC5Ob25lO1xuXG5cdGFzeW5jIHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVN0YXQ+IHtcblx0XHRjb25zdCB7IGlwY1JlbmRlcmVyIH0gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuXHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKCd2c2NvZGU6c3RhdEZpbGUnLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBzdGF0cy5pc0RpcmVjdG9yeSA/IEZpbGVUeXBlLkRpcmVjdG9yeSA6IChzdGF0cy5pc0ZpbGUgPyBGaWxlVHlwZS5GaWxlIDogRmlsZVR5cGUuVW5rbm93biksXG5cdFx0XHRjdGltZTogc3RhdHMuY3RpbWVNcyxcblx0XHRcdG10aW1lOiBzdGF0cy5tdGltZU1zLFxuXHRcdFx0c2l6ZTogc3RhdHMuc2l6ZSxcblx0XHRcdHBlcm1pc3Npb25zOiBzdGF0cy5pc1JlYWRvbmx5ID8gMSAvKiBGaWxlUGVybWlzc2lvbi5SZWFkb25seSAqLyA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0Y29uc3QgeyBpcGNSZW5kZXJlciB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoJ3ZzY29kZTpyZWFkRmlsZScsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAocmVzdWx0KS5idWZmZXI7XG5cdH1cblxuXHR3YXRjaChyZXNvdXJjZTogVVJJLCBvcHRzOiBJV2F0Y2hPcHRpb25zKTogSURpc3Bvc2FibGUgeyByZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTsgfVxuXHRta2RpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbWtkaXIgbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHRyZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFtzdHJpbmcsIEZpbGVUeXBlXVtdPiB7IHRocm93IG5ldyBFcnJvcigncmVhZGRpciBub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBwcm92aWRlcicpOyB9XG5cdGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZURlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdkZWxldGUgbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHRyZW5hbWUoZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdyZW5hbWUgbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHR3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogVWludDhBcnJheSwgb3B0czogSUZpbGVXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCd3cml0ZUZpbGUgbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHRyZWFkRmlsZVN0cmVhbT8ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4geyB0aHJvdyBuZXcgRXJyb3IoJ3JlYWRGaWxlU3RyZWFtIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0b3Blbj8ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVPcGVuT3B0aW9ucyk6IFByb21pc2U8bnVtYmVyPiB7IHRocm93IG5ldyBFcnJvcignb3BlbiBub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBwcm92aWRlcicpOyB9XG5cdGNsb3NlPyhmZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignY2xvc2Ugbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHRyZWFkPyhmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdyZWFkIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0d3JpdGU/KGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4geyB0aHJvdyBuZXcgRXJyb3IoJ3dyaXRlIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQTBEO0FBRW5FLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxxQkFBcUI7QUFJOUIsU0FBUywwQkFBb0Q7QUFDN0QsU0FBOEIsaUNBQWlDO0FBQy9ELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsbURBQW1EO0FBQzVELFNBQVMsY0FBbUMsZ0NBQStJLGdCQUErQjtBQUMxTixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUczQyxTQUFTLHNCQUFzQjtBQUMvQixTQUE2QiwwQkFBME47QUFDdlAsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQ0FBc0M7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
