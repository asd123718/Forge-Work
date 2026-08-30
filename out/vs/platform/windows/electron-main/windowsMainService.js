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
import * as fs from "fs";
import { app, BrowserWindow, shell } from "electron";
import { addUNCHostToAllowlist } from "../../../base/node/unc.js";
import { hostname, release, arch } from "os";
import { coalesce, distinct } from "../../../base/common/arrays.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CharCode } from "../../../base/common/charCode.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { isWindowsDriveLetter, parseLineAndColumnAware, sanitizeFilePath, toSlashes } from "../../../base/common/extpath.js";
import { getPathLabel } from "../../../base/common/labels.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { basename, join, normalize, posix } from "../../../base/common/path.js";
import { getMarks, mark } from "../../../base/common/performance.js";
import { isMacintosh, isWindows, OS } from "../../../base/common/platform.js";
import { cwd } from "../../../base/common/process.js";
import { extUriBiasedIgnorePathCase, isEqual, isEqualAuthority, normalizePath, originalFSPath, removeTrailingPathSeparator } from "../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { getNLSLanguage, getNLSMessages, localize } from "../../../nls.js";
import { IBackupMainService } from "../../backup/electron-main/backup.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { FileType, IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import product from "../../product/common/product.js";
import { IProtocolMainService } from "../../protocol/electron-main/protocol.js";
import { getRemoteAuthority } from "../../remote/common/remoteHosts.js";
import { IStateService } from "../../state/node/state.js";
import { AgentsWindowOpenSource, isFileToOpen, isFolderToOpen, isWorkspaceToOpen } from "../../window/common/window.js";
import { CodeWindow } from "./windowImpl.js";
import { OpenContext, getLastFocused } from "./windows.js";
import { findWindowOnExtensionDevelopmentPath, findWindowOnFile, findWindowOnWorkspaceOrFolder } from "./windowsFinder.js";
import { WindowsStateHandler } from "./windowsStateHandler.js";
import { hasWorkspaceFileExtension, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { createEmptyWorkspaceIdentifier, getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from "../../workspaces/node/workspaces.js";
import { IWorkspacesHistoryMainService } from "../../workspaces/electron-main/workspacesHistoryMainService.js";
import { IWorkspacesManagementMainService } from "../../workspaces/electron-main/workspacesManagementMainService.js";
import { UnloadReason } from "../../window/electron-main/window.js";
import { IThemeMainService } from "../../theme/electron-main/themeMainService.js";
import { IPolicyService } from "../../policy/common/policy.js";
import { IUserDataProfilesMainService } from "../../userDataProfile/electron-main/userDataProfile.js";
import { ILoggerMainService } from "../../log/electron-main/loggerService.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { ICSSDevelopmentService } from "../../cssDev/node/cssDevService.js";
import { ResourceSet } from "../../../base/common/map.js";
import { VSBuffer } from "../../../base/common/buffer.js";
const EMPTY_WINDOW = /* @__PURE__ */ Object.create(null);
function isWorkspacePathToOpen(path) {
  return isWorkspaceIdentifier(path?.workspace);
}
function isSingleFolderWorkspacePathToOpen(path) {
  return isSingleFolderWorkspaceIdentifier(path?.workspace);
}
let WindowsMainService = class extends Disposable {
  constructor(machineId, sqmId, devDeviceId, initialUserEnv, logService, loggerService, stateService, policyService, environmentMainService, userDataProfilesMainService, lifecycleMainService, backupMainService, configurationService, workspacesHistoryMainService, workspacesManagementMainService, instantiationService, dialogMainService, fileService, protocolMainService, themeMainService, auxiliaryWindowsMainService, cssDevelopmentService) {
    super();
    this.machineId = machineId;
    this.sqmId = sqmId;
    this.devDeviceId = devDeviceId;
    this.initialUserEnv = initialUserEnv;
    this.logService = logService;
    this.loggerService = loggerService;
    this.policyService = policyService;
    this.environmentMainService = environmentMainService;
    this.userDataProfilesMainService = userDataProfilesMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.backupMainService = backupMainService;
    this.configurationService = configurationService;
    this.workspacesHistoryMainService = workspacesHistoryMainService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.instantiationService = instantiationService;
    this.dialogMainService = dialogMainService;
    this.fileService = fileService;
    this.protocolMainService = protocolMainService;
    this.themeMainService = themeMainService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.cssDevelopmentService = cssDevelopmentService;
    this._onDidOpenWindow = this._register(new Emitter());
    this.onDidOpenWindow = this._onDidOpenWindow.event;
    this._onDidSignalReadyWindow = this._register(new Emitter());
    this.onDidSignalReadyWindow = this._onDidSignalReadyWindow.event;
    this._onDidDestroyWindow = this._register(new Emitter());
    this.onDidDestroyWindow = this._onDidDestroyWindow.event;
    this._onDidChangeWindowsCount = this._register(new Emitter());
    this.onDidChangeWindowsCount = this._onDidChangeWindowsCount.event;
    this._onDidMaximizeWindow = this._register(new Emitter());
    this.onDidMaximizeWindow = this._onDidMaximizeWindow.event;
    this._onDidUnmaximizeWindow = this._register(new Emitter());
    this.onDidUnmaximizeWindow = this._onDidUnmaximizeWindow.event;
    this._onDidChangeFullScreen = this._register(new Emitter());
    this.onDidChangeFullScreen = this._onDidChangeFullScreen.event;
    this._onDidTriggerSystemContextMenu = this._register(new Emitter());
    this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
    this.windows = /* @__PURE__ */ new Map();
    this.windowsStateHandler = this._register(new WindowsStateHandler(this, stateService, this.lifecycleMainService, this.logService, this.configurationService));
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.workspacesManagementMainService.onDidEnterWorkspace((event) => this._onDidSignalReadyWindow.fire(event.window)));
    this._register(this.onDidSignalReadyWindow((window) => {
      if (window.config?.extensionDevelopmentPath || window.config?.extensionTestsPath) {
        const disposables = new DisposableStore();
        disposables.add(Event.any(window.onDidClose, window.onDidDestroy)(() => disposables.dispose()));
        if (window.config.extensionDevelopmentPath) {
          for (const extensionDevelopmentPath of window.config.extensionDevelopmentPath) {
            disposables.add(this.protocolMainService.addValidFileRoot(extensionDevelopmentPath));
          }
        }
        if (window.config.extensionTestsPath) {
          disposables.add(this.protocolMainService.addValidFileRoot(window.config.extensionTestsPath));
        }
      }
    }));
  }
  openEmptyWindow(openConfig, options) {
    const cli = this.environmentMainService.args;
    const remoteAuthority = options?.remoteAuthority || void 0;
    const forceEmpty = true;
    const forceReuseWindow = options?.forceReuseWindow;
    const forceNewWindow = !forceReuseWindow;
    return this.open({ ...openConfig, cli, forceEmpty, forceNewWindow, forceReuseWindow, remoteAuthority, forceTempProfile: options?.forceTempProfile, forceProfile: options?.forceProfile });
  }
  openExistingWindow(window, openConfig) {
    window.focus();
    this.handleWaitMarkerFile(openConfig, [window]);
    this.handleChatRequest(openConfig, [window]);
  }
  async openAgentsWindow(openConfig, folderUri, sessionResource, source) {
    this.logService.trace("windowsManager#openAgentsWindow");
    const windows = await this.open(await this.ensureAgentsWindow(openConfig));
    if (windows.length > 0) {
      const openSource = source ?? (openConfig.cli.agents ? AgentsWindowOpenSource.CommandLine : AgentsWindowOpenSource.Unknown);
      windows[0].sendWhenReady("vscode:selectAgentsFolder", CancellationToken.None, folderUri?.toJSON(), sessionResource?.toJSON(), openSource);
    }
    return windows;
  }
  async ensureAgentsWindow(openConfig) {
    const agentSessionsWorkspaceUri = this.environmentMainService.agentSessionsWorkspace;
    if (!agentSessionsWorkspaceUri) {
      throw new Error("Agents workspace is not configured");
    }
    const workspaceExists = await this.fileService.exists(agentSessionsWorkspaceUri);
    if (!workspaceExists) {
      const emptyWorkspaceContent = JSON.stringify({ folders: [] }, null, "	");
      await this.fileService.writeFile(agentSessionsWorkspaceUri, VSBuffer.fromString(emptyWorkspaceContent));
    }
    return {
      urisToOpen: [{ workspaceUri: agentSessionsWorkspaceUri }],
      userEnv: openConfig.userEnv,
      cli: openConfig.cli,
      noRecentEntry: true,
      context: openConfig.context,
      contextWindowId: openConfig.contextWindowId,
      initialStartup: openConfig.initialStartup,
      forceNewWindow: true
    };
  }
  async open(openConfig) {
    this.logService.trace("windowsManager#open");
    if ((openConfig.addMode || openConfig.removeMode) && (openConfig.initialStartup || !this.getLastActiveWindow())) {
      openConfig.addMode = false;
      openConfig.removeMode = false;
    }
    const foldersToAdd = [];
    const foldersToRemove = [];
    const foldersToOpen = [];
    const workspacesToOpen = [];
    const untitledWorkspacesToRestore = [];
    const emptyWindowsWithBackupsToRestore = [];
    let filesToOpen;
    let maybeOpenEmptyWindow = false;
    const pathsToOpen = await this.getPathsToOpen(openConfig);
    this.logService.trace("windowsManager#open pathsToOpen", pathsToOpen);
    for (const path of pathsToOpen) {
      if (isSingleFolderWorkspacePathToOpen(path)) {
        if (openConfig.addMode) {
          foldersToAdd.push(path);
        } else if (openConfig.removeMode) {
          foldersToRemove.push(path);
        } else {
          foldersToOpen.push(path);
        }
      } else if (isWorkspacePathToOpen(path)) {
        workspacesToOpen.push(path);
      } else if (path.fileUri) {
        if (!filesToOpen) {
          filesToOpen = { filesToOpenOrCreate: [], filesToDiff: [], filesToMerge: [], remoteAuthority: path.remoteAuthority };
        }
        filesToOpen.filesToOpenOrCreate.push(path);
      } else if (path.backupPath) {
        emptyWindowsWithBackupsToRestore.push({ backupFolder: basename(path.backupPath), remoteAuthority: path.remoteAuthority });
      } else {
        maybeOpenEmptyWindow = true;
      }
    }
    if (openConfig.diffMode && filesToOpen && filesToOpen.filesToOpenOrCreate.length >= 2) {
      filesToOpen.filesToDiff = filesToOpen.filesToOpenOrCreate.slice(0, 2);
      filesToOpen.filesToOpenOrCreate = [];
    }
    if (openConfig.mergeMode && filesToOpen && filesToOpen.filesToOpenOrCreate.length === 4) {
      filesToOpen.filesToMerge = filesToOpen.filesToOpenOrCreate.slice(0, 4);
      filesToOpen.filesToOpenOrCreate = [];
      filesToOpen.filesToDiff = [];
    }
    if (filesToOpen && openConfig.waitMarkerFileURI) {
      filesToOpen.filesToWait = { paths: coalesce([...filesToOpen.filesToDiff, filesToOpen.filesToMerge[3], ...filesToOpen.filesToOpenOrCreate]), waitMarkerFileUri: openConfig.waitMarkerFileURI };
    }
    if (openConfig.initialStartup) {
      untitledWorkspacesToRestore.push(...this.workspacesManagementMainService.getUntitledWorkspaces());
      workspacesToOpen.push(...untitledWorkspacesToRestore);
      emptyWindowsWithBackupsToRestore.push(...this.backupMainService.getEmptyWindowBackups());
    } else {
      emptyWindowsWithBackupsToRestore.length = 0;
    }
    const { windows: usedWindows, filesOpenedInWindow } = await this.doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyWindowsWithBackupsToRestore, maybeOpenEmptyWindow, filesToOpen, foldersToAdd, foldersToRemove);
    this.logService.trace(`windowsManager#open used window count ${usedWindows.length} (workspacesToOpen: ${workspacesToOpen.length}, foldersToOpen: ${foldersToOpen.length}, emptyToRestore: ${emptyWindowsWithBackupsToRestore.length}, maybeOpenEmptyWindow: ${maybeOpenEmptyWindow})`);
    if (usedWindows.length > 1) {
      if (filesOpenedInWindow) {
        filesOpenedInWindow.focus();
      } else {
        const focusLastActive = this.windowsStateHandler.state.lastActiveWindow && !openConfig.forceEmpty && !openConfig.cli._.length && !openConfig.cli["file-uri"] && !openConfig.cli["folder-uri"] && !openConfig.urisToOpen?.length;
        let focusLastOpened = true;
        let focusLastWindow = true;
        if (focusLastActive) {
          const lastActiveWindow = usedWindows.filter((window) => this.windowsStateHandler.state.lastActiveWindow && window.backupPath === this.windowsStateHandler.state.lastActiveWindow.backupPath);
          if (lastActiveWindow.length) {
            lastActiveWindow[0].focus();
            focusLastOpened = false;
            focusLastWindow = false;
          }
        }
        if (focusLastOpened) {
          for (let i = usedWindows.length - 1; i >= 0; i--) {
            const usedWindow = usedWindows[i];
            if (usedWindow.openedWorkspace && untitledWorkspacesToRestore.some((workspace) => usedWindow.openedWorkspace && workspace.workspace.id === usedWindow.openedWorkspace.id) || // skip over restored workspace
            usedWindow.backupPath && emptyWindowsWithBackupsToRestore.some((empty) => usedWindow.backupPath && empty.backupFolder === basename(usedWindow.backupPath))) {
              continue;
            }
            usedWindow.focus();
            focusLastWindow = false;
            break;
          }
        }
        if (focusLastWindow) {
          usedWindows[usedWindows.length - 1].focus();
        }
      }
    }
    const isDiff = filesToOpen && filesToOpen.filesToDiff.length > 0;
    const isMerge = filesToOpen && filesToOpen.filesToMerge.length > 0;
    if (!usedWindows.some((window) => window.isExtensionDevelopmentHost) && !isDiff && !isMerge && !openConfig.noRecentEntry) {
      const recents = [];
      for (const pathToOpen of pathsToOpen) {
        if (isWorkspacePathToOpen(pathToOpen) && !pathToOpen.transient) {
          recents.push({ label: pathToOpen.label, workspace: pathToOpen.workspace, remoteAuthority: pathToOpen.remoteAuthority });
        } else if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
          recents.push({ label: pathToOpen.label, folderUri: pathToOpen.workspace.uri, remoteAuthority: pathToOpen.remoteAuthority });
        } else if (pathToOpen.fileUri) {
          recents.push({ label: pathToOpen.label, fileUri: pathToOpen.fileUri, remoteAuthority: pathToOpen.remoteAuthority });
        }
      }
      this.workspacesHistoryMainService.addRecentlyOpened(recents);
    }
    this.handleWaitMarkerFile(openConfig, usedWindows);
    this.handleChatRequest(openConfig, usedWindows);
    return usedWindows;
  }
  handleWaitMarkerFile(openConfig, usedWindows) {
    const waitMarkerFileURI = openConfig.waitMarkerFileURI;
    if (openConfig.context === OpenContext.CLI && waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
      (async () => {
        await usedWindows[0].whenClosedOrLoaded;
        try {
          await this.fileService.del(waitMarkerFileURI);
        } catch (error) {
        }
      })();
    }
  }
  handleChatRequest(openConfig, usedWindows) {
    if (openConfig.context !== OpenContext.CLI || !openConfig.cli.chat || usedWindows.length === 0) {
      return;
    }
    let windowHandlingChatRequest;
    if (usedWindows.length === 1) {
      windowHandlingChatRequest = usedWindows[0];
    } else {
      const chatRequestFolder = openConfig.cli._[0];
      if (chatRequestFolder) {
        windowHandlingChatRequest = findWindowOnWorkspaceOrFolder(usedWindows, URI.file(chatRequestFolder));
      }
    }
    if (windowHandlingChatRequest) {
      windowHandlingChatRequest.sendWhenReady("vscode:handleChatRequest", CancellationToken.None, openConfig.cli.chat);
      windowHandlingChatRequest.focus();
    }
  }
  async doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyToRestore, maybeOpenEmptyWindow, filesToOpen, foldersToAdd, foldersToRemove) {
    const usedWindows = [];
    let filesOpenedInWindow = void 0;
    function addUsedWindow(window, openedFiles) {
      usedWindows.push(window);
      if (openedFiles) {
        filesOpenedInWindow = window;
        filesToOpen = void 0;
      }
    }
    let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);
    if (this.getSessionsWindowForFolderHandoff(openConfig)) {
      openFolderInNewWindow = false;
      openFilesInNewWindow = false;
    }
    if (!openConfig.initialStartup && (foldersToAdd.length > 0 || foldersToRemove.length > 0)) {
      const authority = foldersToAdd.at(0)?.remoteAuthority ?? foldersToRemove.at(0)?.remoteAuthority;
      const lastActiveWindow = this.getLastActiveWindowForAuthority(authority);
      if (lastActiveWindow) {
        addUsedWindow(this.doAddRemoveFoldersInExistingWindow(lastActiveWindow, foldersToAdd.map((folderToAdd) => folderToAdd.workspace.uri), foldersToRemove.map((folderToRemove) => folderToRemove.workspace.uri)));
      }
    }
    const potentialNewWindowsCount = foldersToOpen.length + workspacesToOpen.length + emptyToRestore.length;
    if (filesToOpen && potentialNewWindowsCount === 0) {
      const fileToCheck = filesToOpen.filesToOpenOrCreate[0] || filesToOpen.filesToDiff[0] || filesToOpen.filesToMerge[3];
      const windows = this.getWindows().filter((window) => filesToOpen && isEqualAuthority(window.remoteAuthority, filesToOpen.remoteAuthority));
      let windowToUseForFiles = void 0;
      if (fileToCheck?.fileUri && !openFilesInNewWindow) {
        if (openConfig.context === OpenContext.DESKTOP || openConfig.context === OpenContext.CLI || openConfig.context === OpenContext.DOCK || openConfig.context === OpenContext.LINK) {
          windowToUseForFiles = await findWindowOnFile(windows, fileToCheck.fileUri, async (workspace) => workspace.configPath.scheme === Schemas.file ? this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath) : void 0);
        }
        if (!windowToUseForFiles) {
          windowToUseForFiles = this.doGetLastActiveWindow(windows);
        }
      }
      if (windowToUseForFiles) {
        if (isWorkspaceIdentifier(windowToUseForFiles.openedWorkspace)) {
          workspacesToOpen.push({ workspace: windowToUseForFiles.openedWorkspace, remoteAuthority: windowToUseForFiles.remoteAuthority });
        } else if (isSingleFolderWorkspaceIdentifier(windowToUseForFiles.openedWorkspace)) {
          foldersToOpen.push({ workspace: windowToUseForFiles.openedWorkspace, remoteAuthority: windowToUseForFiles.remoteAuthority });
        } else {
          addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowToUseForFiles, filesToOpen), true);
        }
      } else {
        const sessionsWindow = !openFilesInNewWindow ? this.getSessionsWindowForFolderHandoff(openConfig) : void 0;
        if (sessionsWindow) {
          addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, sessionsWindow, filesToOpen), true);
        } else {
          addUsedWindow(await this.openInBrowserWindow({
            userEnv: openConfig.userEnv,
            cli: openConfig.cli,
            initialStartup: openConfig.initialStartup,
            filesToOpen,
            forceNewWindow: true,
            remoteAuthority: filesToOpen.remoteAuthority,
            forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
            forceProfile: openConfig.forceProfile,
            forceTempProfile: openConfig.forceTempProfile
          }), true);
        }
      }
    }
    const allWorkspacesToOpen = distinct(workspacesToOpen, (workspace) => workspace.workspace.id);
    if (allWorkspacesToOpen.length > 0) {
      const windowsOnWorkspace = coalesce(allWorkspacesToOpen.map((workspaceToOpen) => findWindowOnWorkspaceOrFolder(this.getWindows(), workspaceToOpen.workspace.configPath)));
      if (windowsOnWorkspace.length > 0) {
        const windowOnWorkspace = windowsOnWorkspace[0];
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, windowOnWorkspace.remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnWorkspace, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
      for (const workspaceToOpen of allWorkspacesToOpen) {
        if (windowsOnWorkspace.some((window) => window.openedWorkspace && window.openedWorkspace.id === workspaceToOpen.workspace.id)) {
          continue;
        }
        const remoteAuthority = workspaceToOpen.remoteAuthority;
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(await this.doOpenFolderOrWorkspace(openConfig, workspaceToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
    }
    const allFoldersToOpen = distinct(foldersToOpen, (folder) => extUriBiasedIgnorePathCase.getComparisonKey(folder.workspace.uri));
    if (allFoldersToOpen.length > 0) {
      const windowsOnFolderPath = coalesce(allFoldersToOpen.map((folderToOpen) => findWindowOnWorkspaceOrFolder(this.getWindows(), folderToOpen.workspace.uri)));
      if (windowsOnFolderPath.length > 0) {
        const windowOnFolderPath = windowsOnFolderPath[0];
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, windowOnFolderPath.remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnFolderPath, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
      for (const folderToOpen of allFoldersToOpen) {
        if (windowsOnFolderPath.some((window) => isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.uri, folderToOpen.workspace.uri))) {
          continue;
        }
        const remoteAuthority = folderToOpen.remoteAuthority;
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(await this.doOpenFolderOrWorkspace(openConfig, folderToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
    }
    const allEmptyToRestore = distinct(emptyToRestore, (info) => info.backupFolder);
    if (allEmptyToRestore.length > 0) {
      for (const emptyWindowBackupInfo of allEmptyToRestore) {
        const remoteAuthority = emptyWindowBackupInfo.remoteAuthority;
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(await this.doOpenEmpty(openConfig, true, remoteAuthority, filesToOpenInWindow, emptyWindowBackupInfo), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
    }
    if (filesToOpen || maybeOpenEmptyWindow && (openConfig.forceEmpty || usedWindows.length === 0)) {
      const remoteAuthority = filesToOpen ? filesToOpen.remoteAuthority : openConfig.remoteAuthority;
      addUsedWindow(await this.doOpenEmpty(openConfig, openFolderInNewWindow, remoteAuthority, filesToOpen), !!filesToOpen);
    }
    return { windows: distinct(usedWindows), filesOpenedInWindow };
  }
  doOpenFilesInExistingWindow(configuration, window, filesToOpen) {
    this.logService.trace("windowsManager#doOpenFilesInExistingWindow", { filesToOpen });
    this.focusMainOrChildWindow(window);
    const params = {
      filesToOpenOrCreate: filesToOpen?.filesToOpenOrCreate,
      filesToDiff: filesToOpen?.filesToDiff,
      filesToMerge: filesToOpen?.filesToMerge,
      filesToWait: filesToOpen?.filesToWait,
      termProgram: configuration?.userEnv?.["TERM_PROGRAM"]
    };
    window.sendWhenReady("vscode:openFiles", CancellationToken.None, params);
    return window;
  }
  focusMainOrChildWindow(mainWindow) {
    let windowToFocus = mainWindow;
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && focusedWindow.id !== mainWindow.id) {
      const auxiliaryWindowCandidate = this.auxiliaryWindowsMainService.getWindowByWebContents(focusedWindow.webContents);
      if (auxiliaryWindowCandidate && auxiliaryWindowCandidate.parentId === mainWindow.id) {
        windowToFocus = auxiliaryWindowCandidate;
      }
    }
    windowToFocus.focus();
  }
  doAddRemoveFoldersInExistingWindow(window, foldersToAdd, foldersToRemove) {
    this.logService.trace("windowsManager#doAddRemoveFoldersToExistingWindow", { foldersToAdd, foldersToRemove });
    window.focus();
    const request = { foldersToAdd, foldersToRemove };
    window.sendWhenReady("vscode:addRemoveFolders", CancellationToken.None, request);
    return window;
  }
  resolveContextWindow(openConfig, forceNewWindow) {
    if (!forceNewWindow && typeof openConfig.contextWindowId === "number") {
      const contextWindow = this.getWindowById(openConfig.contextWindowId);
      if (contextWindow?.config?.isSessionsWindow) {
        const editorWindow = this.getLastActiveNonSessionsWindow();
        if (editorWindow) {
          return { windowToUse: editorWindow, forceNewWindow: false };
        }
        return { windowToUse: void 0, forceNewWindow: true };
      }
      return { windowToUse: contextWindow, forceNewWindow };
    }
    return { windowToUse: void 0, forceNewWindow };
  }
  getLastActiveNonSessionsWindow() {
    return this.doGetLastActiveWindow(this.getWindows().filter((window) => !window.config?.isSessionsWindow));
  }
  getSessionsWindowForFolderHandoff(openConfig) {
    if (openConfig.initialStartup) {
      return void 0;
    }
    if (typeof openConfig.contextWindowId === "number") {
      const contextWindow = this.getWindowById(openConfig.contextWindowId);
      if (contextWindow?.config?.isSessionsWindow) {
        return contextWindow;
      }
      if (contextWindow) {
        return void 0;
      }
    }
    const lastActiveWindow = this.getLastActiveWindow();
    return lastActiveWindow?.config?.isSessionsWindow ? lastActiveWindow : void 0;
  }
  handoffFolderToSessionsWindow(window, folderUri) {
    this.logService.trace("windowsManager#handoffFolderToSessionsWindow", { folderUri: folderUri.toString(), windowId: window.id });
    window.focus();
    window.sendWhenReady("vscode:selectAgentsFolder", CancellationToken.None, folderUri.toJSON(), void 0, AgentsWindowOpenSource.Unknown);
  }
  doOpenEmpty(openConfig, forceNewWindow, remoteAuthority, filesToOpen, emptyWindowBackupInfo) {
    this.logService.trace("windowsManager#doOpenEmpty", { restore: !!emptyWindowBackupInfo, remoteAuthority, filesToOpen, forceNewWindow });
    const resolved = this.resolveContextWindow(openConfig, forceNewWindow);
    return this.openInBrowserWindow({
      userEnv: openConfig.userEnv,
      cli: openConfig.cli,
      initialStartup: openConfig.initialStartup,
      remoteAuthority,
      forceNewWindow: resolved.forceNewWindow,
      forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
      filesToOpen,
      windowToUse: resolved.windowToUse,
      emptyWindowBackupInfo,
      forceProfile: openConfig.forceProfile,
      forceTempProfile: openConfig.forceTempProfile
    });
  }
  doOpenFolderOrWorkspace(openConfig, folderOrWorkspace, forceNewWindow, filesToOpen, windowToUse) {
    this.logService.trace("windowsManager#doOpenFolderOrWorkspace", { folderOrWorkspace, filesToOpen });
    if (!windowToUse && isSingleFolderWorkspacePathToOpen(folderOrWorkspace)) {
      const sessionsWindow = this.getSessionsWindowForFolderHandoff(openConfig);
      if (sessionsWindow) {
        this.handoffFolderToSessionsWindow(sessionsWindow, folderOrWorkspace.workspace.uri);
        if (filesToOpen) {
          this.doOpenFilesInExistingWindow(openConfig, sessionsWindow, filesToOpen);
        }
        return Promise.resolve(sessionsWindow);
      }
    }
    if (!windowToUse) {
      const resolved = this.resolveContextWindow(openConfig, forceNewWindow);
      windowToUse = resolved.windowToUse;
      forceNewWindow = resolved.forceNewWindow;
    }
    return this.openInBrowserWindow({
      workspace: folderOrWorkspace.workspace,
      userEnv: openConfig.userEnv,
      cli: openConfig.cli,
      initialStartup: openConfig.initialStartup,
      remoteAuthority: folderOrWorkspace.remoteAuthority,
      forceNewWindow,
      forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
      filesToOpen,
      windowToUse,
      forceProfile: openConfig.forceProfile,
      forceTempProfile: openConfig.forceTempProfile
    });
  }
  async getPathsToOpen(openConfig) {
    let pathsToOpen;
    let isCommandLineOrAPICall = false;
    let isRestoringPaths = false;
    if (openConfig.urisToOpen && openConfig.urisToOpen.length > 0) {
      pathsToOpen = await this.doExtractPathsFromAPI(openConfig);
      isCommandLineOrAPICall = true;
    } else if (openConfig.forceEmpty) {
      pathsToOpen = [EMPTY_WINDOW];
    } else if (openConfig.cli._.length || openConfig.cli["folder-uri"] || openConfig.cli["file-uri"]) {
      pathsToOpen = await this.doExtractPathsFromCLI(openConfig.cli);
      if (pathsToOpen.length === 0) {
        pathsToOpen.push(EMPTY_WINDOW);
      }
      isCommandLineOrAPICall = true;
    } else {
      pathsToOpen = await this.doGetPathsFromLastSession();
      if (pathsToOpen.length === 0) {
        pathsToOpen.push(EMPTY_WINDOW);
      }
      isRestoringPaths = true;
    }
    if (!openConfig.addMode && !openConfig.removeMode && isCommandLineOrAPICall) {
      const foldersToOpen = pathsToOpen.filter((path) => isSingleFolderWorkspacePathToOpen(path));
      if (foldersToOpen.length > 1) {
        const remoteAuthority = foldersToOpen[0].remoteAuthority;
        if (foldersToOpen.every((folderToOpen) => isEqualAuthority(folderToOpen.remoteAuthority, remoteAuthority))) {
          let workspace;
          const lastSessionWorkspaceMatchingFolders = await this.doGetWorkspaceMatchingFoldersFromLastSession(remoteAuthority, foldersToOpen);
          if (lastSessionWorkspaceMatchingFolders) {
            workspace = lastSessionWorkspaceMatchingFolders;
          } else {
            workspace = await this.workspacesManagementMainService.createUntitledWorkspace(foldersToOpen.map((folder) => ({ uri: folder.workspace.uri })));
          }
          pathsToOpen.push({ workspace, remoteAuthority });
          pathsToOpen = pathsToOpen.filter((path) => !isSingleFolderWorkspacePathToOpen(path));
        }
      }
    }
    if (openConfig.initialStartup && !isRestoringPaths && this.configurationService.getValue("window")?.restoreWindows === "preserve") {
      const lastSessionPaths = await this.doGetPathsFromLastSession();
      pathsToOpen.unshift(...lastSessionPaths.filter((path) => isWorkspacePathToOpen(path) || isSingleFolderWorkspacePathToOpen(path) || path.backupPath));
    }
    return pathsToOpen;
  }
  async doExtractPathsFromAPI(openConfig) {
    const pathResolveOptions = {
      gotoLineMode: openConfig.gotoLineMode,
      remoteAuthority: openConfig.remoteAuthority
    };
    const pathsToOpen = await Promise.all(coalesce(openConfig.urisToOpen || []).map(async (pathToOpen) => {
      const path = await this.resolveOpenable(pathToOpen, pathResolveOptions);
      if (path) {
        path.label = pathToOpen.label;
        return path;
      }
      const uri = this.resourceFromOpenable(pathToOpen);
      this.dialogMainService.showMessageBox({
        type: "info",
        buttons: [localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK")],
        message: uri.scheme === Schemas.file ? localize("pathNotExistTitle", "Path does not exist") : localize("uriInvalidTitle", "URI can not be opened"),
        detail: uri.scheme === Schemas.file ? localize("pathNotExistDetail", "The path '{0}' does not exist on this computer.", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })) : localize("uriInvalidDetail", "The URI '{0}' is not valid and can not be opened.", uri.toString(true))
      }, BrowserWindow.getFocusedWindow() ?? void 0);
      return void 0;
    }));
    return coalesce(pathsToOpen);
  }
  async doExtractPathsFromCLI(cli) {
    const pathsToOpen = [];
    const pathResolveOptions = {
      ignoreFileNotFound: true,
      gotoLineMode: cli.goto,
      remoteAuthority: cli.remote || void 0,
      forceOpenWorkspaceAsFile: (
        // special case diff / merge mode to force open
        // workspace as file
        // https://github.com/microsoft/vscode/issues/149731
        cli.diff && cli._.length === 2 || cli.merge && cli._.length === 4
      )
    };
    const folderUris = cli["folder-uri"];
    if (folderUris) {
      const resolvedFolderUris = await Promise.all(folderUris.map((rawFolderUri) => {
        const folderUri = this.cliArgToUri(rawFolderUri);
        if (!folderUri) {
          return void 0;
        }
        return this.resolveOpenable({ folderUri }, pathResolveOptions);
      }));
      pathsToOpen.push(...coalesce(resolvedFolderUris));
    }
    const fileUris = cli["file-uri"];
    if (fileUris) {
      const resolvedFileUris = await Promise.all(fileUris.map((rawFileUri) => {
        const fileUri = this.cliArgToUri(rawFileUri);
        if (!fileUri) {
          return void 0;
        }
        return this.resolveOpenable(hasWorkspaceFileExtension(rawFileUri) ? { workspaceUri: fileUri } : { fileUri }, pathResolveOptions);
      }));
      pathsToOpen.push(...coalesce(resolvedFileUris));
    }
    const resolvedCliPaths = await Promise.all(cli._.map((cliPath) => {
      return pathResolveOptions.remoteAuthority ? this.doResolveRemotePath(cliPath, pathResolveOptions) : this.doResolveFilePath(cliPath, pathResolveOptions);
    }));
    pathsToOpen.push(...coalesce(resolvedCliPaths));
    return pathsToOpen;
  }
  cliArgToUri(arg) {
    try {
      const uri = URI.parse(arg);
      if (!uri.scheme) {
        this.logService.error(`Invalid URI input string, scheme missing: ${arg}`);
        return void 0;
      }
      if (!uri.path) {
        return uri.with({ path: "/" });
      }
      return uri;
    } catch (e) {
      this.logService.error(`Invalid URI input string: ${arg}, ${e.message}`);
    }
    return void 0;
  }
  async doGetPathsFromLastSession() {
    const restoreWindowsSetting = this.getRestoreWindowsSetting();
    switch (restoreWindowsSetting) {
      // none: no window to restore
      case "none":
        return [];
      // one: restore last opened workspace/folder or empty window
      // all: restore all windows
      // folders: restore last opened folders only
      case "one":
      case "all":
      case "preserve":
      case "folders": {
        const lastSessionWindows = [];
        if (restoreWindowsSetting !== "one") {
          lastSessionWindows.push(...this.windowsStateHandler.state.openedWindows);
        }
        if (this.windowsStateHandler.state.lastActiveWindow) {
          lastSessionWindows.push(this.windowsStateHandler.state.lastActiveWindow);
        }
        const pathsToOpen = await Promise.all(lastSessionWindows.map(async (lastSessionWindow) => {
          if (lastSessionWindow.workspace) {
            const pathToOpen = await this.resolveOpenable({ workspaceUri: lastSessionWindow.workspace.configPath }, {
              remoteAuthority: lastSessionWindow.remoteAuthority,
              rejectTransientWorkspaces: true
              /* https://github.com/microsoft/vscode/issues/119695 */
            });
            if (isWorkspacePathToOpen(pathToOpen)) {
              return pathToOpen;
            }
          } else if (lastSessionWindow.folderUri) {
            const pathToOpen = await this.resolveOpenable({ folderUri: lastSessionWindow.folderUri }, { remoteAuthority: lastSessionWindow.remoteAuthority });
            if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
              return pathToOpen;
            }
          } else if (restoreWindowsSetting !== "folders" && lastSessionWindow.backupPath) {
            return { backupPath: lastSessionWindow.backupPath, remoteAuthority: lastSessionWindow.remoteAuthority };
          }
          return void 0;
        }));
        return coalesce(pathsToOpen);
      }
    }
  }
  getRestoreWindowsSetting() {
    let restoreWindows;
    if (this.lifecycleMainService.wasRestarted) {
      restoreWindows = "all";
    } else {
      const windowConfig = this.configurationService.getValue("window");
      restoreWindows = windowConfig?.restoreWindows || "all";
      if (!["preserve", "all", "folders", "one", "none"].includes(restoreWindows)) {
        restoreWindows = "all";
      }
    }
    return restoreWindows;
  }
  async doGetWorkspaceMatchingFoldersFromLastSession(remoteAuthority, folders) {
    const workspaces = (await this.doGetPathsFromLastSession()).filter((path) => isWorkspacePathToOpen(path));
    const folderUris = folders.map((folder) => folder.workspace.uri);
    for (const { workspace } of workspaces) {
      const resolvedWorkspace = await this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath);
      if (!resolvedWorkspace || resolvedWorkspace.remoteAuthority !== remoteAuthority || resolvedWorkspace.transient || resolvedWorkspace.folders.length !== folders.length) {
        continue;
      }
      const folderSet = new ResourceSet(folderUris, (uri) => extUriBiasedIgnorePathCase.getComparisonKey(uri));
      if (resolvedWorkspace.folders.every((folder) => folderSet.has(folder.uri))) {
        return resolvedWorkspace;
      }
    }
    return void 0;
  }
  async resolveOpenable(openable, options = /* @__PURE__ */ Object.create(null)) {
    const uri = this.resourceFromOpenable(openable);
    if (uri.scheme === Schemas.file) {
      if (isFileToOpen(openable)) {
        options = { ...options, forceOpenWorkspaceAsFile: true };
      }
      return this.doResolveFilePath(uri.fsPath, options);
    }
    return this.doResolveRemoteOpenable(openable, options);
  }
  doResolveRemoteOpenable(openable, options) {
    let uri = this.resourceFromOpenable(openable);
    const remoteAuthority = getRemoteAuthority(uri) || options.remoteAuthority;
    uri = removeTrailingPathSeparator(normalizePath(uri));
    if (isFileToOpen(openable)) {
      if (options.gotoLineMode) {
        const { path, line, column } = parseLineAndColumnAware(uri.path);
        return {
          fileUri: uri.with({ path }),
          options: {
            selection: line ? { startLineNumber: line, startColumn: column || 1 } : void 0
          },
          remoteAuthority
        };
      }
      return { fileUri: uri, remoteAuthority };
    } else if (isWorkspaceToOpen(openable)) {
      return { workspace: getWorkspaceIdentifier(uri), remoteAuthority };
    }
    return { workspace: getSingleFolderWorkspaceIdentifier(uri), remoteAuthority };
  }
  resourceFromOpenable(openable) {
    if (isWorkspaceToOpen(openable)) {
      return openable.workspaceUri;
    }
    if (isFolderToOpen(openable)) {
      return openable.folderUri;
    }
    return openable.fileUri;
  }
  async doResolveFilePath(path, options, skipHandleUNCError) {
    let lineNumber;
    let columnNumber;
    if (options.gotoLineMode) {
      ({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
    }
    path = sanitizeFilePath(normalize(path), cwd());
    try {
      const pathStat = await fs.promises.stat(path);
      if (pathStat.isFile()) {
        if (!options.forceOpenWorkspaceAsFile) {
          const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(URI.file(path));
          if (workspace) {
            if (workspace.transient && options.rejectTransientWorkspaces) {
              return void 0;
            }
            return {
              workspace: { id: workspace.id, configPath: workspace.configPath },
              type: FileType.File,
              exists: true,
              remoteAuthority: workspace.remoteAuthority,
              transient: workspace.transient
            };
          }
        }
        return {
          fileUri: URI.file(path),
          type: FileType.File,
          exists: true,
          options: {
            selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : void 0
          }
        };
      } else if (pathStat.isDirectory()) {
        return {
          workspace: getSingleFolderWorkspaceIdentifier(URI.file(path), pathStat),
          type: FileType.Directory,
          exists: true
        };
      } else if (!isWindows && path === "/dev/null") {
        return {
          fileUri: URI.file(path),
          type: FileType.File,
          exists: true
        };
      }
    } catch (error) {
      if (error.code === "ERR_UNC_HOST_NOT_ALLOWED" && !skipHandleUNCError) {
        return this.onUNCHostNotAllowed(path, options);
      }
      const fileUri = URI.file(path);
      this.workspacesHistoryMainService.removeRecentlyOpened([fileUri]);
      if (options.ignoreFileNotFound && error.code === "ENOENT") {
        return {
          fileUri,
          type: FileType.File,
          exists: false
        };
      }
      this.logService.error(`Invalid path provided: ${path}, ${error.message}`);
    }
    return void 0;
  }
  async onUNCHostNotAllowed(path, options) {
    const uri = URI.file(path);
    const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
      type: "warning",
      buttons: [
        localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
        localize({ key: "cancel", comment: ["&& denotes a mnemonic"] }, "&&Cancel"),
        localize({ key: "learnMore", comment: ["&& denotes a mnemonic"] }, "&&Learn More")
      ],
      message: localize("confirmOpenMessage", "The host '{0}' was not found in the list of allowed hosts. Do you want to allow it anyway?", uri.authority),
      detail: localize("confirmOpenDetail", "The path '{0}' uses a host that is not allowed. Unless you trust the host, you should press 'Cancel'", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })),
      checkboxLabel: localize("doNotAskAgain", "Permanently allow host '{0}'", uri.authority),
      cancelId: 1
    });
    if (response === 0) {
      addUNCHostToAllowlist(uri.authority);
      if (checkboxChecked) {
        const request = { channel: "vscode:configureAllowedUNCHost", args: uri.authority };
        this.sendToFocused(request.channel, request.args);
        this.sendToOpeningWindow(request.channel, request.args);
      }
      return this.doResolveFilePath(
        path,
        options,
        true
        /* do not handle UNC error again */
      );
    }
    if (response === 2) {
      shell.openExternal("https://aka.ms/vscode-windows-unc");
      return this.onUNCHostNotAllowed(path, options);
    }
    return void 0;
  }
  doResolveRemotePath(path, options) {
    const first = path.charCodeAt(0);
    const remoteAuthority = options.remoteAuthority;
    let lineNumber;
    let columnNumber;
    if (options.gotoLineMode) {
      ({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
    }
    if (first !== CharCode.Slash) {
      if (isWindowsDriveLetter(first) && path.charCodeAt(path.charCodeAt(1)) === CharCode.Colon) {
        path = toSlashes(path);
      }
      path = `/${path}`;
    }
    const uri = URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path });
    if (path.charCodeAt(path.length - 1) !== CharCode.Slash) {
      if (hasWorkspaceFileExtension(path)) {
        if (options.forceOpenWorkspaceAsFile) {
          return {
            fileUri: uri,
            options: {
              selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : void 0
            },
            remoteAuthority: options.remoteAuthority
          };
        }
        return { workspace: getWorkspaceIdentifier(uri), remoteAuthority };
      } else if (options.gotoLineMode || posix.basename(path).indexOf(".") !== -1) {
        return {
          fileUri: uri,
          options: {
            selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : void 0
          },
          remoteAuthority
        };
      }
    }
    return { workspace: getSingleFolderWorkspaceIdentifier(uri), remoteAuthority };
  }
  shouldOpenNewWindow(openConfig) {
    const windowConfig = this.configurationService.getValue("window");
    const openFolderInNewWindowConfig = windowConfig?.openFoldersInNewWindow || "default";
    const openFilesInNewWindowConfig = windowConfig?.openFilesInNewWindow || "off";
    let openFolderInNewWindow = (openConfig.preferNewWindow || openConfig.forceNewWindow) && !openConfig.forceReuseWindow;
    if (!openConfig.forceNewWindow && !openConfig.forceReuseWindow && (openFolderInNewWindowConfig === "on" || openFolderInNewWindowConfig === "off")) {
      openFolderInNewWindow = openFolderInNewWindowConfig === "on";
    }
    let openFilesInNewWindow = false;
    if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
      openFilesInNewWindow = !!openConfig.forceNewWindow && !openConfig.forceReuseWindow;
    } else {
      if (isMacintosh) {
        if (openConfig.context === OpenContext.DOCK) {
          openFilesInNewWindow = true;
        }
      } else {
        if (openConfig.context !== OpenContext.DIALOG && openConfig.context !== OpenContext.MENU && !(openConfig.userEnv && openConfig.userEnv["TERM_PROGRAM"] === "vscode")) {
          openFilesInNewWindow = true;
        }
      }
      if (!openConfig.cli.extensionDevelopmentPath && (openFilesInNewWindowConfig === "on" || openFilesInNewWindowConfig === "off")) {
        openFilesInNewWindow = openFilesInNewWindowConfig === "on";
      }
    }
    return { openFolderInNewWindow: !!openFolderInNewWindow, openFilesInNewWindow };
  }
  async openExtensionDevelopmentHostWindow(extensionDevelopmentPaths, openConfig) {
    const existingWindow = findWindowOnExtensionDevelopmentPath(this.getWindows(), extensionDevelopmentPaths);
    if (existingWindow) {
      this.lifecycleMainService.reload(existingWindow, openConfig.cli);
      existingWindow.focus();
      return [existingWindow];
    }
    let folderUris = openConfig.cli["folder-uri"] || [];
    let fileUris = openConfig.cli["file-uri"] || [];
    let cliArgs = openConfig.cli._;
    if (!cliArgs.length && !folderUris.length && !fileUris.length && !openConfig.cli.extensionTestsPath) {
      const extensionDevelopmentWindowState = this.windowsStateHandler.state.lastPluginDevelopmentHostWindow;
      const workspaceToOpen = extensionDevelopmentWindowState?.workspace ?? extensionDevelopmentWindowState?.folderUri;
      if (workspaceToOpen) {
        if (URI.isUri(workspaceToOpen)) {
          if (workspaceToOpen.scheme === Schemas.file) {
            cliArgs = [workspaceToOpen.fsPath];
          } else {
            folderUris = [workspaceToOpen.toString()];
          }
        } else {
          if (workspaceToOpen.configPath.scheme === Schemas.file) {
            cliArgs = [originalFSPath(workspaceToOpen.configPath)];
          } else {
            fileUris = [workspaceToOpen.configPath.toString()];
          }
        }
      }
    }
    let remoteAuthority = openConfig.remoteAuthority;
    for (const extensionDevelopmentPath of extensionDevelopmentPaths) {
      if (extensionDevelopmentPath.match(/^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/)) {
        const url = URI.parse(extensionDevelopmentPath);
        const extensionDevelopmentPathRemoteAuthority = getRemoteAuthority(url);
        if (extensionDevelopmentPathRemoteAuthority) {
          if (remoteAuthority) {
            if (!isEqualAuthority(extensionDevelopmentPathRemoteAuthority, remoteAuthority)) {
              this.logService.error("more than one extension development path authority");
            }
          } else {
            remoteAuthority = extensionDevelopmentPathRemoteAuthority;
          }
        }
      }
    }
    cliArgs = cliArgs.filter((path) => {
      const uri = URI.file(path);
      if (findWindowOnWorkspaceOrFolder(this.getWindows(), uri)) {
        return false;
      }
      return isEqualAuthority(getRemoteAuthority(uri), remoteAuthority);
    });
    folderUris = folderUris.filter((folderUriStr) => {
      const folderUri = this.cliArgToUri(folderUriStr);
      if (folderUri && findWindowOnWorkspaceOrFolder(this.getWindows(), folderUri)) {
        return false;
      }
      return folderUri ? isEqualAuthority(getRemoteAuthority(folderUri), remoteAuthority) : false;
    });
    fileUris = fileUris.filter((fileUriStr) => {
      const fileUri = this.cliArgToUri(fileUriStr);
      if (fileUri && findWindowOnWorkspaceOrFolder(this.getWindows(), fileUri)) {
        return false;
      }
      return fileUri ? isEqualAuthority(getRemoteAuthority(fileUri), remoteAuthority) : false;
    });
    openConfig.cli._ = cliArgs;
    openConfig.cli["folder-uri"] = folderUris;
    openConfig.cli["file-uri"] = fileUris;
    const openArgs = {
      context: openConfig.context,
      cli: openConfig.cli,
      forceNewWindow: true,
      forceEmpty: !cliArgs.length && !folderUris.length && !fileUris.length,
      userEnv: openConfig.userEnv,
      noRecentEntry: true,
      waitMarkerFileURI: openConfig.waitMarkerFileURI,
      remoteAuthority,
      forceProfile: openConfig.forceProfile,
      forceTempProfile: openConfig.forceTempProfile
    };
    return this.open(openArgs);
  }
  async openInBrowserWindow(options) {
    const windowConfig = this.configurationService.getValue("window");
    const lastActiveWindow = this.getLastActiveWindow();
    const newWindowProfile = windowConfig?.newWindowProfile ? this.userDataProfilesMainService.profiles.find((profile) => profile.name === windowConfig.newWindowProfile) : void 0;
    const defaultProfile = newWindowProfile ?? (lastActiveWindow?.profile?.isAgentsWindowProfile ? void 0 : lastActiveWindow?.profile) ?? this.userDataProfilesMainService.defaultProfile;
    let window;
    if (!options.forceNewWindow && !options.forceNewTabbedWindow) {
      window = options.windowToUse || (lastActiveWindow?.config?.isSessionsWindow ? void 0 : lastActiveWindow);
      if (window) {
        window.focus();
      }
    }
    const configuration = {
      // Inherit CLI arguments from environment and/or
      // the specific properties from this launch if provided
      ...this.environmentMainService.args,
      ...options.cli,
      machineId: this.machineId,
      sqmId: this.sqmId,
      devDeviceId: this.devDeviceId,
      isPortable: this.environmentMainService.isPortable,
      windowId: -1,
      // Will be filled in by the window once loaded later
      mainPid: process.pid,
      appRoot: this.environmentMainService.appRoot,
      execPath: process.execPath,
      codeCachePath: this.environmentMainService.codeCachePath,
      // If we know the backup folder upfront (for empty windows to restore), we can set it
      // directly here which helps for restoring UI state associated with that window.
      // For all other cases we first call into registerEmptyWindowBackup() to set it before
      // loading the window.
      backupPath: options.emptyWindowBackupInfo ? join(this.environmentMainService.backupHome, options.emptyWindowBackupInfo.backupFolder) : void 0,
      profiles: {
        home: this.userDataProfilesMainService.profilesHome,
        all: this.userDataProfilesMainService.profiles,
        // Set to default profile first and resolve and update the profile
        // only after the workspace-backup is registered.
        // Because, workspace identifier of an empty window is known only then.
        profile: defaultProfile
      },
      homeDir: this.environmentMainService.userHome.with({ scheme: Schemas.file }).fsPath,
      tmpDir: this.environmentMainService.tmpDir.with({ scheme: Schemas.file }).fsPath,
      userDataDir: this.environmentMainService.userDataPath,
      remoteAuthority: options.remoteAuthority,
      workspace: options.workspace,
      userEnv: { ...this.initialUserEnv, ...options.userEnv },
      nls: {
        messages: getNLSMessages(),
        language: getNLSLanguage()
      },
      filesToOpenOrCreate: options.filesToOpen?.filesToOpenOrCreate,
      filesToDiff: options.filesToOpen?.filesToDiff,
      filesToMerge: options.filesToOpen?.filesToMerge,
      filesToWait: options.filesToOpen?.filesToWait,
      logLevel: this.loggerService.getLogLevel(),
      loggers: this.loggerService.getGlobalLoggers(),
      logsPath: this.environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
      product,
      isInitialStartup: options.initialStartup,
      perfMarks: getMarks(),
      os: { release: release(), hostname: hostname(), arch: arch() },
      autoDetectHighContrast: windowConfig?.autoDetectHighContrast ?? true,
      autoDetectColorScheme: windowConfig?.autoDetectColorScheme ?? false,
      accessibilitySupport: app.accessibilitySupportEnabled,
      colorScheme: this.themeMainService.getColorScheme(),
      policiesData: this.policyService.serialize(),
      continueOn: this.environmentMainService.continueOn,
      cssModules: this.cssDevelopmentService.isEnabled ? await this.cssDevelopmentService.getCssModules() : void 0,
      isSessionsWindow: isWorkspaceIdentifier(options.workspace) && isEqual(options.workspace.configPath, this.environmentMainService.agentSessionsWorkspace)
    };
    if (!window) {
      const state = this.windowsStateHandler.getNewWindowState(configuration);
      mark("code/willCreateCodeWindow");
      const createdWindow = window = this.instantiationService.createInstance(CodeWindow, {
        state,
        extensionDevelopmentPath: configuration.extensionDevelopmentPath,
        isExtensionTestHost: !!configuration.extensionTestsPath,
        isSessionsWindow: configuration.isSessionsWindow
      });
      mark("code/didCreateCodeWindow");
      if (options.forceNewTabbedWindow) {
        const activeWindow = this.getLastActiveWindow();
        activeWindow?.addTabbedWindow(createdWindow);
      }
      this.windows.set(createdWindow.id, createdWindow);
      this._onDidOpenWindow.fire(createdWindow);
      this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() - 1, newCount: this.getWindowCount() });
      const disposables = new DisposableStore();
      disposables.add(createdWindow.onDidSignalReady(() => this._onDidSignalReadyWindow.fire(createdWindow)));
      disposables.add(Event.once(createdWindow.onDidClose)(() => this.onWindowClosed(createdWindow, disposables)));
      disposables.add(Event.once(createdWindow.onDidDestroy)(() => this.onWindowDestroyed(createdWindow)));
      disposables.add(createdWindow.onDidMaximize(() => this._onDidMaximizeWindow.fire(createdWindow)));
      disposables.add(createdWindow.onDidUnmaximize(() => this._onDidUnmaximizeWindow.fire(createdWindow)));
      disposables.add(createdWindow.onDidEnterFullScreen(() => this._onDidChangeFullScreen.fire({ window: createdWindow, fullscreen: true })));
      disposables.add(createdWindow.onDidLeaveFullScreen(() => this._onDidChangeFullScreen.fire({ window: createdWindow, fullscreen: false })));
      disposables.add(createdWindow.onDidTriggerSystemContextMenu(({ x, y }) => this._onDidTriggerSystemContextMenu.fire({ window: createdWindow, x, y })));
      const webContents = assertReturnsDefined(createdWindow.win?.webContents);
      webContents.removeAllListeners("devtools-reload-page");
      disposables.add(Event.fromNodeEventEmitter(webContents, "devtools-reload-page")(() => this.lifecycleMainService.reload(createdWindow)));
      this.lifecycleMainService.registerWindow(createdWindow);
    } else {
      const currentWindowConfig = window.config;
      if (!configuration.extensionDevelopmentPath && currentWindowConfig?.extensionDevelopmentPath) {
        configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
        configuration.extensionDevelopmentKind = currentWindowConfig.extensionDevelopmentKind;
        configuration["enable-proposed-api"] = currentWindowConfig["enable-proposed-api"];
        configuration.verbose = currentWindowConfig.verbose;
        configuration["inspect-extensions"] = currentWindowConfig["inspect-extensions"];
        configuration["inspect-brk-extensions"] = currentWindowConfig["inspect-brk-extensions"];
        configuration.debugId = currentWindowConfig.debugId;
        configuration.extensionEnvironment = currentWindowConfig.extensionEnvironment;
        configuration["extensions-dir"] = currentWindowConfig["extensions-dir"];
        configuration["disable-extensions"] = currentWindowConfig["disable-extensions"];
        configuration["disable-extension"] = currentWindowConfig["disable-extension"];
      }
    }
    configuration.windowId = window.id;
    if (window.isReady) {
      this.lifecycleMainService.unload(window, UnloadReason.LOAD).then(async (veto) => {
        if (!veto) {
          await this.doOpenInBrowserWindow(window, configuration, options, defaultProfile);
        }
      });
    } else {
      await this.doOpenInBrowserWindow(window, configuration, options, defaultProfile);
    }
    return window;
  }
  async doOpenInBrowserWindow(window, configuration, options, defaultProfile) {
    if (!configuration.extensionDevelopmentPath) {
      if (isWorkspaceIdentifier(configuration.workspace)) {
        configuration.backupPath = this.backupMainService.registerWorkspaceBackup({
          workspace: configuration.workspace,
          remoteAuthority: configuration.remoteAuthority
        });
      } else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
        configuration.backupPath = this.backupMainService.registerFolderBackup({
          folderUri: configuration.workspace.uri,
          remoteAuthority: configuration.remoteAuthority
        });
      } else {
        configuration.backupPath = this.backupMainService.registerEmptyWindowBackup({
          backupFolder: options.emptyWindowBackupInfo?.backupFolder ?? createEmptyWorkspaceIdentifier().id,
          remoteAuthority: configuration.remoteAuthority
        });
      }
    }
    const workspace = configuration.workspace ?? toWorkspaceIdentifier(configuration.backupPath, false);
    if (configuration.isSessionsWindow) {
      configuration.profiles.profile = this.userDataProfilesMainService.profiles.find((p) => p.isAgentsWindowProfile) ?? await this.userDataProfilesMainService.createAgentsWindowProfile();
    } else {
      const profilePromise = this.resolveProfileForBrowserWindow(options, workspace, defaultProfile);
      const profile = profilePromise instanceof Promise ? await profilePromise : profilePromise;
      configuration.profiles.profile = profile;
      if (!configuration.extensionDevelopmentPath) {
        await this.userDataProfilesMainService.setProfileForWorkspace(workspace, profile);
      }
    }
    window.load(configuration);
  }
  resolveProfileForBrowserWindow(options, workspace, defaultProfile) {
    if (options.forceProfile) {
      return this.userDataProfilesMainService.profiles.find((p) => p.name === options.forceProfile) ?? this.userDataProfilesMainService.createNamedProfile(options.forceProfile);
    }
    if (options.forceTempProfile) {
      return this.userDataProfilesMainService.createTransientProfile();
    }
    return this.userDataProfilesMainService.getProfileForWorkspace(workspace) ?? defaultProfile;
  }
  onWindowClosed(window, disposables) {
    this.windows.delete(window.id);
    this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() + 1, newCount: this.getWindowCount() });
    disposables.dispose();
  }
  onWindowDestroyed(window) {
    this.windows.delete(window.id);
    this._onDidDestroyWindow.fire(window);
  }
  getFocusedWindow() {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      return this.getWindowById(window.id);
    }
    return void 0;
  }
  getLastActiveWindow() {
    return this.doGetLastActiveWindow(this.getWindows());
  }
  getLastActiveWindowForAuthority(remoteAuthority) {
    return this.doGetLastActiveWindow(this.getWindows().filter((window) => isEqualAuthority(window.remoteAuthority, remoteAuthority)));
  }
  doGetLastActiveWindow(windows) {
    return getLastFocused(windows);
  }
  sendToFocused(channel, ...args) {
    const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();
    focusedWindow?.sendWhenReady(channel, CancellationToken.None, ...args);
  }
  sendToOpeningWindow(channel, ...args) {
    this._register(Event.once(this.onDidSignalReadyWindow)((window) => {
      window.sendWhenReady(channel, CancellationToken.None, ...args);
    }));
  }
  sendToAll(channel, payload, windowIdsToIgnore) {
    for (const window of this.getWindows()) {
      if (windowIdsToIgnore && windowIdsToIgnore.indexOf(window.id) >= 0) {
        continue;
      }
      window.sendWhenReady(channel, CancellationToken.None, payload);
    }
  }
  getWindows() {
    return Array.from(this.windows.values());
  }
  getWindowCount() {
    return this.windows.size;
  }
  getWindowById(windowId) {
    return this.windows.get(windowId);
  }
  getWindowByWebContents(webContents) {
    const browserWindow = BrowserWindow.fromWebContents(webContents);
    if (!browserWindow) {
      return void 0;
    }
    const window = this.getWindowById(browserWindow.id);
    return window?.matches(webContents) ? window : void 0;
  }
};
WindowsMainService = __decorateClass([
  __decorateParam(4, ILogService),
  __decorateParam(5, ILoggerMainService),
  __decorateParam(6, IStateService),
  __decorateParam(7, IPolicyService),
  __decorateParam(8, IEnvironmentMainService),
  __decorateParam(9, IUserDataProfilesMainService),
  __decorateParam(10, ILifecycleMainService),
  __decorateParam(11, IBackupMainService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspacesHistoryMainService),
  __decorateParam(14, IWorkspacesManagementMainService),
  __decorateParam(15, IInstantiationService),
  __decorateParam(16, IDialogMainService),
  __decorateParam(17, IFileService),
  __decorateParam(18, IProtocolMainService),
  __decorateParam(19, IThemeMainService),
  __decorateParam(20, IAuxiliaryWindowsMainService),
  __decorateParam(21, ICSSDevelopmentService)
], WindowsMainService);
export {
  WindowsMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2luZG93c1xcZWxlY3Ryb24tbWFpblxcd2luZG93c01haW5TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgYXBwLCBCcm93c2VyV2luZG93LCBXZWJDb250ZW50cywgc2hlbGwgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBhZGRVTkNIb3N0VG9BbGxvd2xpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvdW5jLmpzJztcbmltcG9ydCB7IGhvc3RuYW1lLCByZWxlYXNlLCBhcmNoIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgY29hbGVzY2UsIGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3NEcml2ZUxldHRlciwgcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUsIHNhbml0aXplRmlsZVBhdGgsIHRvU2xhc2hlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgZ2V0UGF0aExhYmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGpvaW4sIG5vcm1hbGl6ZSwgcG9zaXggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGdldE1hcmtzLCBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cywgT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjd2QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBpc0VxdWFsLCBpc0VxdWFsQXV0aG9yaXR5LCBub3JtYWxpemVQYXRoLCBvcmlnaW5hbEZTUGF0aCwgcmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldE5MU0xhbmd1YWdlLCBnZXROTFNNZXNzYWdlcywgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUJhY2t1cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYmFja3VwL2VsZWN0cm9uLW1haW4vYmFja3VwLmpzJztcbmltcG9ydCB7IElFbXB0eVdpbmRvd0JhY2t1cEluZm8gfSBmcm9tICcuLi8uLi9iYWNrdXAvbm9kZS9iYWNrdXAuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9kaWFsb2dzL2VsZWN0cm9uLW1haW4vZGlhbG9nTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVUeXBlLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb3RvY29sTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm90b2NvbC9lbGVjdHJvbi1tYWluL3Byb3RvY29sLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgSVN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3N0YXRlL25vZGUvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRzV2luZG93T3BlblNvdXJjZSwgSUFkZFJlbW92ZUZvbGRlcnNSZXF1ZXN0LCBJTmF0aXZlT3BlbkZpbGVSZXF1ZXN0LCBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiwgSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMsIElQYXRoLCBJUGF0aHNUb1dhaXRGb3IsIGlzRmlsZVRvT3BlbiwgaXNGb2xkZXJUb09wZW4sIGlzV29ya3NwYWNlVG9PcGVuLCBJV2luZG93T3BlbmFibGUsIElXaW5kb3dTZXR0aW5ncyB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuL3dpbmRvd0ltcGwuanMnO1xuaW1wb3J0IHsgSU9wZW5Db25maWd1cmF0aW9uLCBJT3BlbkVtcHR5Q29uZmlndXJhdGlvbiwgSVdpbmRvd3NDb3VudENoYW5nZWRFdmVudCwgSVdpbmRvd3NNYWluU2VydmljZSwgT3BlbkNvbnRleHQsIGdldExhc3RGb2N1c2VkIH0gZnJvbSAnLi93aW5kb3dzLmpzJztcbmltcG9ydCB7IGZpbmRXaW5kb3dPbkV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCwgZmluZFdpbmRvd09uRmlsZSwgZmluZFdpbmRvd09uV29ya3NwYWNlT3JGb2xkZXIgfSBmcm9tICcuL3dpbmRvd3NGaW5kZXIuanMnO1xuaW1wb3J0IHsgSVdpbmRvd1N0YXRlLCBXaW5kb3dzU3RhdGVIYW5kbGVyIH0gZnJvbSAnLi93aW5kb3dzU3RhdGVIYW5kbGVyLmpzJztcbmltcG9ydCB7IElSZWNlbnQgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24sIElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1dvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIsIGdldFNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGdldFdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL25vZGUvd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlcy9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVXaW5kb3csIFVubG9hZFJlYXNvbiB9IGZyb20gJy4uLy4uL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3RoZW1lL2VsZWN0cm9uLW1haW4vdGhlbWVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucywgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9lbGVjdHJvbi1tYWluL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvZWxlY3Ryb24tbWFpbi9sb2dnZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3dzLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3cgfSBmcm9tICcuLi8uLi9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3cuanMnO1xuaW1wb3J0IHsgSUNTU0RldmVsb3BtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Nzc0Rldi9ub2RlL2Nzc0RldlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuXG4vLyNyZWdpb24gSGVscGVyIEludGVyZmFjZXNcblxudHlwZSBSZXN0b3JlV2luZG93c1NldHRpbmcgPSAncHJlc2VydmUnIHwgJ2FsbCcgfCAnZm9sZGVycycgfCAnb25lJyB8ICdub25lJztcblxuaW50ZXJmYWNlIElPcGVuQnJvd3NlcldpbmRvd09wdGlvbnMge1xuXHRyZWFkb25seSB1c2VyRW52PzogSVByb2Nlc3NFbnZpcm9ubWVudDtcblx0cmVhZG9ubHkgY2xpPzogTmF0aXZlUGFyc2VkQXJncztcblxuXHRyZWFkb25seSB3b3Jrc3BhY2U/OiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyO1xuXG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eT86IHN0cmluZztcblxuXHRyZWFkb25seSBpbml0aWFsU3RhcnR1cD86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgZmlsZXNUb09wZW4/OiBJRmlsZXNUb09wZW47XG5cblx0cmVhZG9ubHkgZm9yY2VOZXdXaW5kb3c/OiBib29sZWFuO1xuXHRyZWFkb25seSBmb3JjZU5ld1RhYmJlZFdpbmRvdz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdpbmRvd1RvVXNlPzogSUNvZGVXaW5kb3c7XG5cblx0cmVhZG9ubHkgZW1wdHlXaW5kb3dCYWNrdXBJbmZvPzogSUVtcHR5V2luZG93QmFja3VwSW5mbztcblx0cmVhZG9ubHkgZm9yY2VQcm9maWxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBmb3JjZVRlbXBQcm9maWxlPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElQYXRoUmVzb2x2ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBCeSBkZWZhdWx0LCByZXNvbHZpbmcgYSBwYXRoIHdpbGwgY2hlY2tcblx0ICogaWYgdGhlIHBhdGggZXhpc3RzLiBUaGlzIGNhbiBiZSBkaXNhYmxlZFxuXHQgKiB3aXRoIHRoaXMgZmxhZy5cblx0ICovXG5cdHJlYWRvbmx5IGlnbm9yZUZpbGVOb3RGb3VuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdpbGwgcmVqZWN0IGEgcGF0aCBpZiBpdCBwb2ludHMgdG8gYSB0cmFuc2llbnRcblx0ICogd29ya3NwYWNlIGFzIGluZGljYXRlZCBieSBhIGB0cmFuc2llbnQ6IHRydWVgXG5cdCAqIHByb3BlcnR5IGluIHRoZSB3b3Jrc3BhY2UgZmlsZS5cblx0ICovXG5cdHJlYWRvbmx5IHJlamVjdFRyYW5zaWVudFdvcmtzcGFjZXM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBlbmFibGVkLCB3aWxsIHJlc29sdmUgdGhlIHBhdGggbGluZS9jb2x1bW5cblx0ICogYXdhcmUgYW5kIHByb3Blcmx5IHJlbW92ZSB0aGlzIGluZm9ybWF0aW9uXG5cdCAqIGZyb20gdGhlIHJlc3VsdGluZyBmaWxlIHBhdGguXG5cdCAqL1xuXHRyZWFkb25seSBnb3RvTGluZU1vZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBGb3JjZXMgdG8gcmVzb2x2ZSB0aGUgcHJvdmlkZWQgcGF0aCBhcyB3b3Jrc3BhY2Vcblx0ICogZmlsZSBpbnN0ZWFkIG9mIG9wZW5pbmcgaXQgYXMgYSBmaWxlLlxuXHQgKi9cblx0cmVhZG9ubHkgZm9yY2VPcGVuV29ya3NwYWNlQXNGaWxlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIHJlbW90ZUF1dGhvcml0eSB0byB1c2UgaWYgdGhlIFVSTCB0byBvcGVuIGlzXG5cdCAqIG5laXRoZXIgYGZpbGVgIG5vciBgdnNjb2RlLXJlbW90ZWAuXG5cdCAqL1xuXHRyZWFkb25seSByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJRmlsZXNUb09wZW4ge1xuXHRyZWFkb25seSByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmc7XG5cblx0ZmlsZXNUb09wZW5PckNyZWF0ZTogSVBhdGhbXTtcblx0ZmlsZXNUb0RpZmY6IElQYXRoW107XG5cdGZpbGVzVG9NZXJnZTogSVBhdGhbXTtcblxuXHRmaWxlc1RvV2FpdD86IElQYXRoc1RvV2FpdEZvcjtcbn1cblxuaW50ZXJmYWNlIElQYXRoVG9PcGVuPFQgPSBJRWRpdG9yT3B0aW9ucz4gZXh0ZW5kcyBJUGF0aDxUPiB7XG5cblx0LyoqXG5cdCAqIFRoZSB3b3Jrc3BhY2UgdG8gb3BlblxuXHQgKi9cblx0cmVhZG9ubHkgd29ya3NwYWNlPzogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcGF0aCBpcyBjb25zaWRlcmVkIHRvIGJlIHRyYW5zaWVudCBvciBub3Rcblx0ICogZm9yIGV4YW1wbGUsIGEgdHJhbnNpZW50IHdvcmtzcGFjZSBzaG91bGQgbm90IGFkZCB0b1xuXHQgKiB0aGUgd29ya3NwYWNlcyBoaXN0b3J5IGFuZCBzaG91bGQgbmV2ZXIgcmVzdG9yZS5cblx0ICovXG5cdHJlYWRvbmx5IHRyYW5zaWVudD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBiYWNrdXAgcGF0aCB0byB1c2Vcblx0ICovXG5cdHJlYWRvbmx5IGJhY2t1cFBhdGg/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSByZW1vdGUgYXV0aG9yaXR5IGZvciB0aGUgQ29kZSBpbnN0YW5jZSB0byBvcGVuLiBVbmRlZmluZWQgaWYgbm90IHJlbW90ZS5cblx0ICovXG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eT86IHN0cmluZztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgbGFiZWwgZm9yIHRoZSByZWNlbnQgaGlzdG9yeVxuXHQgKi9cblx0bGFiZWw/OiBzdHJpbmc7XG59XG5cbmNvbnN0IEVNUFRZX1dJTkRPVzogSVBhdGhUb09wZW4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5pbnRlcmZhY2UgSVdvcmtzcGFjZVBhdGhUb09wZW4gZXh0ZW5kcyBJUGF0aFRvT3BlbiB7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXI7XG59XG5cbmludGVyZmFjZSBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbiBleHRlbmRzIElQYXRoVG9PcGVuIHtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcjtcbn1cblxuZnVuY3Rpb24gaXNXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGg6IElQYXRoVG9PcGVuIHwgdW5kZWZpbmVkKTogcGF0aCBpcyBJV29ya3NwYWNlUGF0aFRvT3BlbiB7XG5cdHJldHVybiBpc1dvcmtzcGFjZUlkZW50aWZpZXIocGF0aD8ud29ya3NwYWNlKTtcbn1cblxuZnVuY3Rpb24gaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGg6IElQYXRoVG9PcGVuIHwgdW5kZWZpbmVkKTogcGF0aCBpcyBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbiB7XG5cdHJldHVybiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIocGF0aD8ud29ya3NwYWNlKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBjbGFzcyBXaW5kb3dzTWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdpbmRvd3NNYWluU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPcGVuV2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvZGVXaW5kb3c+KCkpO1xuXHRyZWFkb25seSBvbkRpZE9wZW5XaW5kb3cgPSB0aGlzLl9vbkRpZE9wZW5XaW5kb3cuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaWduYWxSZWFkeVdpbmRvdyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb2RlV2luZG93PigpKTtcblx0cmVhZG9ubHkgb25EaWRTaWduYWxSZWFkeVdpbmRvdyA9IHRoaXMuX29uRGlkU2lnbmFsUmVhZHlXaW5kb3cuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZXN0cm95V2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvZGVXaW5kb3c+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlc3Ryb3lXaW5kb3cgPSB0aGlzLl9vbkRpZERlc3Ryb3lXaW5kb3cuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXaW5kb3dzQ291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV2luZG93c0NvdW50Q2hhbmdlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXaW5kb3dzQ291bnQgPSB0aGlzLl9vbkRpZENoYW5nZVdpbmRvd3NDb3VudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1heGltaXplV2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvZGVXaW5kb3c+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1heGltaXplV2luZG93ID0gdGhpcy5fb25EaWRNYXhpbWl6ZVdpbmRvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVubWF4aW1pemVXaW5kb3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZVdpbmRvdz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5tYXhpbWl6ZVdpbmRvdyA9IHRoaXMuX29uRGlkVW5tYXhpbWl6ZVdpbmRvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZ1bGxTY3JlZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHdpbmRvdzogSUNvZGVXaW5kb3c7IGZ1bGxzY3JlZW46IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRnVsbFNjcmVlbiA9IHRoaXMuX29uRGlkQ2hhbmdlRnVsbFNjcmVlbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2luZG93OiBJQ29kZVdpbmRvdzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51ID0gdGhpcy5fb25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIElDb2RlV2luZG93PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2luZG93c1N0YXRlSGFuZGxlcjogV2luZG93c1N0YXRlSGFuZGxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hY2hpbmVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3FtSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRldkRldmljZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsVXNlckVudjogSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxvZ2dlck1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyU2VydmljZTogSUxvZ2dlck1haW5TZXJ2aWNlLFxuXHRcdEBJU3RhdGVTZXJ2aWNlIHN0YXRlU2VydmljZTogSVN0YXRlU2VydmljZSxcblx0XHRASVBvbGljeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwb2xpY3lTZXJ2aWNlOiBJUG9saWN5U2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUJhY2t1cE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYmFja3VwTWFpblNlcnZpY2U6IElCYWNrdXBNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlOiBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlOiBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nTWFpblNlcnZpY2U6IElEaWFsb2dNYWluU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb3RvY29sTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm90b2NvbE1haW5TZXJ2aWNlOiBJUHJvdG9jb2xNYWluU2VydmljZSxcblx0XHRASVRoZW1lTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZU1haW5TZXJ2aWNlOiBJVGhlbWVNYWluU2VydmljZSxcblx0XHRASUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZTogSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASUNTU0RldmVsb3BtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNzc0RldmVsb3BtZW50U2VydmljZTogSUNTU0RldmVsb3BtZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy53aW5kb3dzU3RhdGVIYW5kbGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdpbmRvd3NTdGF0ZUhhbmRsZXIodGhpcywgc3RhdGVTZXJ2aWNlLCB0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBTaWduYWwgYSB3aW5kb3cgaXMgcmVhZHkgYWZ0ZXIgaGF2aW5nIGVudGVyZWQgYSB3b3Jrc3BhY2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2Uub25EaWRFbnRlcldvcmtzcGFjZShldmVudCA9PiB0aGlzLl9vbkRpZFNpZ25hbFJlYWR5V2luZG93LmZpcmUoZXZlbnQud2luZG93KSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHZhbGlkIHJvb3RzIGluIHByb3RvY29sIHNlcnZpY2UgZm9yIGV4dGVuc2lvbiBkZXYgd2luZG93c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRTaWduYWxSZWFkeVdpbmRvdyh3aW5kb3cgPT4ge1xuXHRcdFx0aWYgKHdpbmRvdy5jb25maWc/LmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCB8fCB3aW5kb3cuY29uZmlnPy5leHRlbnNpb25UZXN0c1BhdGgpIHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkod2luZG93Lm9uRGlkQ2xvc2UsIHdpbmRvdy5vbkRpZERlc3Ryb3kpKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXG5cdFx0XHRcdC8vIEFsbG93IGFjY2VzcyB0byBleHRlbnNpb24gZGV2ZWxvcG1lbnQgcGF0aFxuXHRcdFx0XHRpZiAod2luZG93LmNvbmZpZy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCBvZiB3aW5kb3cuY29uZmlnLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvdG9jb2xNYWluU2VydmljZS5hZGRWYWxpZEZpbGVSb290KGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFsbG93IGFjY2VzcyB0byBleHRlbnNpb24gdGVzdHMgcGF0aFxuXHRcdFx0XHRpZiAod2luZG93LmNvbmZpZy5leHRlbnNpb25UZXN0c1BhdGgpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5wcm90b2NvbE1haW5TZXJ2aWNlLmFkZFZhbGlkRmlsZVJvb3Qod2luZG93LmNvbmZpZy5leHRlbnNpb25UZXN0c1BhdGgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9wZW5FbXB0eVdpbmRvdyhvcGVuQ29uZmlnOiBJT3BlbkVtcHR5Q29uZmlndXJhdGlvbiwgb3B0aW9ucz86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zKTogUHJvbWlzZTxJQ29kZVdpbmRvd1tdPiB7XG5cdFx0Y29uc3QgY2xpID0gdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3M7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gb3B0aW9ucz8ucmVtb3RlQXV0aG9yaXR5IHx8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb3JjZUVtcHR5ID0gdHJ1ZTtcblx0XHRjb25zdCBmb3JjZVJldXNlV2luZG93ID0gb3B0aW9ucz8uZm9yY2VSZXVzZVdpbmRvdztcblx0XHRjb25zdCBmb3JjZU5ld1dpbmRvdyA9ICFmb3JjZVJldXNlV2luZG93O1xuXG5cdFx0cmV0dXJuIHRoaXMub3Blbih7IC4uLm9wZW5Db25maWcsIGNsaSwgZm9yY2VFbXB0eSwgZm9yY2VOZXdXaW5kb3csIGZvcmNlUmV1c2VXaW5kb3csIHJlbW90ZUF1dGhvcml0eSwgZm9yY2VUZW1wUHJvZmlsZTogb3B0aW9ucz8uZm9yY2VUZW1wUHJvZmlsZSwgZm9yY2VQcm9maWxlOiBvcHRpb25zPy5mb3JjZVByb2ZpbGUgfSk7XG5cdH1cblxuXHRvcGVuRXhpc3RpbmdXaW5kb3cod2luZG93OiBJQ29kZVdpbmRvdywgb3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uKTogdm9pZCB7XG5cblx0XHQvLyBCcmluZyB3aW5kb3cgdG8gZnJvbnRcblx0XHR3aW5kb3cuZm9jdXMoKTtcblxuXHRcdC8vIEhhbmRsZSBgPGFwcD4gLS13YWl0YFxuXHRcdHRoaXMuaGFuZGxlV2FpdE1hcmtlckZpbGUob3BlbkNvbmZpZywgW3dpbmRvd10pO1xuXG5cdFx0Ly8gSGFuZGxlIGA8YXBwPiBjaGF0YFxuXHRcdHRoaXMuaGFuZGxlQ2hhdFJlcXVlc3Qob3BlbkNvbmZpZywgW3dpbmRvd10pO1xuXHR9XG5cblx0YXN5bmMgb3BlbkFnZW50c1dpbmRvdyhvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24sIGZvbGRlclVyaT86IFVSSSwgc2Vzc2lvblJlc291cmNlPzogVVJJLCBzb3VyY2U/OiBBZ2VudHNXaW5kb3dPcGVuU291cmNlKTogUHJvbWlzZTxJQ29kZVdpbmRvd1tdPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd3aW5kb3dzTWFuYWdlciNvcGVuQWdlbnRzV2luZG93Jyk7XG5cblx0XHQvLyBPcGVuIGluIGEgbmV3IGJyb3dzZXIgd2luZG93IHdpdGggdGhlIGFnZW50IHNlc3Npb25zIHdvcmtzcGFjZVxuXHRcdGNvbnN0IHdpbmRvd3MgPSBhd2FpdCB0aGlzLm9wZW4oYXdhaXQgdGhpcy5lbnN1cmVBZ2VudHNXaW5kb3cob3BlbkNvbmZpZykpO1xuXG5cdFx0Ly8gU2luZ2xlIElQQyBjYXJyeWluZyB0aGUgZm9sZGVyIHRvIHByZS1zZWxlY3QgYW5kIGFuIG9wdGlvbmFsIGV4aXN0aW5nLVxuXHRcdC8vIHNlc3Npb24gcmVzb3VyY2UgdG8gb3Blbi4gVGhlIGhhbmRsZXIgaW4gdGhlIGFnZW50cyB3aW5kb3cgc2VxdWVuY2VzXG5cdFx0Ly8gdGhlbSAoZm9sZGVyIFx1MjE5MiBvcGVuIHNlc3Npb24pIHNvIHRoZSBzZXNzaW9uLW9wZW4gZG9lc24ndCByYWNlIHRoZVxuXHRcdC8vIGZvbGRlci1yZXNvbHZlLlxuXHRcdGlmICh3aW5kb3dzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG9wZW5Tb3VyY2UgPSBzb3VyY2UgPz8gKG9wZW5Db25maWcuY2xpLmFnZW50cyA/IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuQ29tbWFuZExpbmUgOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlLlVua25vd24pO1xuXHRcdFx0d2luZG93c1swXS5zZW5kV2hlblJlYWR5KCd2c2NvZGU6c2VsZWN0QWdlbnRzRm9sZGVyJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgZm9sZGVyVXJpPy50b0pTT04oKSwgc2Vzc2lvblJlc291cmNlPy50b0pTT04oKSwgb3BlblNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdpbmRvd3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVuc3VyZUFnZW50c1dpbmRvdyhvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElPcGVuQ29uZmlndXJhdGlvbj4ge1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNXb3Jrc3BhY2VVcmkgPSB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZTtcblx0XHRpZiAoIWFnZW50U2Vzc2lvbnNXb3Jrc3BhY2VVcmkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQWdlbnRzIHdvcmtzcGFjZSBpcyBub3QgY29uZmlndXJlZCcpO1xuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0aGUgd29ya3NwYWNlIGZpbGUgZXhpc3RzXG5cdFx0Y29uc3Qgd29ya3NwYWNlRXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoYWdlbnRTZXNzaW9uc1dvcmtzcGFjZVVyaSk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VFeGlzdHMpIHtcblx0XHRcdGNvbnN0IGVtcHR5V29ya3NwYWNlQ29udGVudCA9IEpTT04uc3RyaW5naWZ5KHsgZm9sZGVyczogW10gfSwgbnVsbCwgJ1xcdCcpO1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRTZXNzaW9uc1dvcmtzcGFjZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhlbXB0eVdvcmtzcGFjZUNvbnRlbnQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpc1RvT3BlbjogW3sgd29ya3NwYWNlVXJpOiBhZ2VudFNlc3Npb25zV29ya3NwYWNlVXJpIH1dLFxuXHRcdFx0dXNlckVudjogb3BlbkNvbmZpZy51c2VyRW52LFxuXHRcdFx0Y2xpOiBvcGVuQ29uZmlnLmNsaSxcblx0XHRcdG5vUmVjZW50RW50cnk6IHRydWUsXG5cdFx0XHRjb250ZXh0OiBvcGVuQ29uZmlnLmNvbnRleHQsXG5cdFx0XHRjb250ZXh0V2luZG93SWQ6IG9wZW5Db25maWcuY29udGV4dFdpbmRvd0lkLFxuXHRcdFx0aW5pdGlhbFN0YXJ0dXA6IG9wZW5Db25maWcuaW5pdGlhbFN0YXJ0dXAsXG5cdFx0XHRmb3JjZU5ld1dpbmRvdzogdHJ1ZSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgb3BlbihvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElDb2RlV2luZG93W10+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3dpbmRvd3NNYW5hZ2VyI29wZW4nKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSBhZGRNb2RlL3JlbW92ZU1vZGUgaXMgb25seSBlbmFibGVkIGlmIHdlIGhhdmUgYW4gYWN0aXZlIHdpbmRvd1xuXHRcdGlmICgob3BlbkNvbmZpZy5hZGRNb2RlIHx8IG9wZW5Db25maWcucmVtb3ZlTW9kZSkgJiYgKG9wZW5Db25maWcuaW5pdGlhbFN0YXJ0dXAgfHwgIXRoaXMuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpKSkge1xuXHRcdFx0b3BlbkNvbmZpZy5hZGRNb2RlID0gZmFsc2U7XG5cdFx0XHRvcGVuQ29uZmlnLnJlbW92ZU1vZGUgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJzVG9BZGQ6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW10gPSBbXTtcblx0XHRjb25zdCBmb2xkZXJzVG9SZW1vdmU6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW10gPSBbXTtcblxuXHRcdGNvbnN0IGZvbGRlcnNUb09wZW46IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW10gPSBbXTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZXNUb09wZW46IElXb3Jrc3BhY2VQYXRoVG9PcGVuW10gPSBbXTtcblx0XHRjb25zdCB1bnRpdGxlZFdvcmtzcGFjZXNUb1Jlc3RvcmU6IElXb3Jrc3BhY2VQYXRoVG9PcGVuW10gPSBbXTtcblxuXHRcdGNvbnN0IGVtcHR5V2luZG93c1dpdGhCYWNrdXBzVG9SZXN0b3JlOiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvW10gPSBbXTtcblxuXHRcdGxldCBmaWxlc1RvT3BlbjogSUZpbGVzVG9PcGVuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBtYXliZU9wZW5FbXB0eVdpbmRvdyA9IGZhbHNlO1xuXG5cdFx0Ly8gSWRlbnRpZnkgdGhpbmdzIHRvIG9wZW4gZnJvbSBvcGVuIGNvbmZpZ1xuXHRcdGNvbnN0IHBhdGhzVG9PcGVuID0gYXdhaXQgdGhpcy5nZXRQYXRoc1RvT3BlbihvcGVuQ29uZmlnKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3dpbmRvd3NNYW5hZ2VyI29wZW4gcGF0aHNUb09wZW4nLCBwYXRoc1RvT3Blbik7XG5cdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzVG9PcGVuKSB7XG5cdFx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGgpKSB7XG5cdFx0XHRcdGlmIChvcGVuQ29uZmlnLmFkZE1vZGUpIHtcblx0XHRcdFx0XHQvLyBXaGVuIHJ1biB3aXRoIC0tYWRkLCB0YWtlIHRoZSBmb2xkZXJzIHRoYXQgYXJlIHRvIGJlIG9wZW5lZCBhc1xuXHRcdFx0XHRcdC8vIGZvbGRlcnMgdGhhdCBzaG91bGQgYmUgYWRkZWQgdG8gdGhlIGN1cnJlbnRseSBhY3RpdmUgd2luZG93LlxuXHRcdFx0XHRcdGZvbGRlcnNUb0FkZC5wdXNoKHBhdGgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9wZW5Db25maWcucmVtb3ZlTW9kZSkge1xuXHRcdFx0XHRcdC8vIFdoZW4gcnVuIHdpdGggLS1yZW1vdmUsIHRha2UgdGhlIGZvbGRlcnMgdGhhdCBhcmUgdG8gYmUgb3BlbmVkIGFzXG5cdFx0XHRcdFx0Ly8gZm9sZGVycyB0aGF0IHNob3VsZCBiZSByZW1vdmVkIGZyb20gdGhlIGN1cnJlbnRseSBhY3RpdmUgd2luZG93LlxuXHRcdFx0XHRcdGZvbGRlcnNUb1JlbW92ZS5wdXNoKHBhdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZvbGRlcnNUb09wZW4ucHVzaChwYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc1dvcmtzcGFjZVBhdGhUb09wZW4ocGF0aCkpIHtcblx0XHRcdFx0d29ya3NwYWNlc1RvT3Blbi5wdXNoKHBhdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLmZpbGVVcmkpIHtcblx0XHRcdFx0aWYgKCFmaWxlc1RvT3Blbikge1xuXHRcdFx0XHRcdGZpbGVzVG9PcGVuID0geyBmaWxlc1RvT3Blbk9yQ3JlYXRlOiBbXSwgZmlsZXNUb0RpZmY6IFtdLCBmaWxlc1RvTWVyZ2U6IFtdLCByZW1vdGVBdXRob3JpdHk6IHBhdGgucmVtb3RlQXV0aG9yaXR5IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZmlsZXNUb09wZW4uZmlsZXNUb09wZW5PckNyZWF0ZS5wdXNoKHBhdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLmJhY2t1cFBhdGgpIHtcblx0XHRcdFx0ZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmUucHVzaCh7IGJhY2t1cEZvbGRlcjogYmFzZW5hbWUocGF0aC5iYWNrdXBQYXRoKSwgcmVtb3RlQXV0aG9yaXR5OiBwYXRoLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1heWJlT3BlbkVtcHR5V2luZG93ID0gdHJ1ZTsgLy8gZGVwZW5kcyBvbiBvdGhlciBwYXJhbWV0ZXJzIHN1Y2ggYXMgYGZvcmNlRW1wdHlgIGFuZCBob3cgbWFueSB3aW5kb3dzIGhhdmUgb3BlbmVkIGFscmVhZHlcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXaGVuIHJ1biB3aXRoIC0tZGlmZiwgdGFrZSB0aGUgZmlyc3QgMiBmaWxlcyB0byBvcGVuIGFzIGZpbGVzIHRvIGRpZmZcblx0XHRpZiAob3BlbkNvbmZpZy5kaWZmTW9kZSAmJiBmaWxlc1RvT3BlbiAmJiBmaWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRmaWxlc1RvT3Blbi5maWxlc1RvRGlmZiA9IGZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGUuc2xpY2UoMCwgMik7XG5cdFx0XHRmaWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlID0gW107XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBydW4gd2l0aCAtLW1lcmdlLCB0YWtlIHRoZSBmaXJzdCA0IGZpbGVzIHRvIG9wZW4gYXMgZmlsZXMgdG8gbWVyZ2Vcblx0XHRpZiAob3BlbkNvbmZpZy5tZXJnZU1vZGUgJiYgZmlsZXNUb09wZW4gJiYgZmlsZXNUb09wZW4uZmlsZXNUb09wZW5PckNyZWF0ZS5sZW5ndGggPT09IDQpIHtcblx0XHRcdGZpbGVzVG9PcGVuLmZpbGVzVG9NZXJnZSA9IGZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGUuc2xpY2UoMCwgNCk7XG5cdFx0XHRmaWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlID0gW107XG5cdFx0XHRmaWxlc1RvT3Blbi5maWxlc1RvRGlmZiA9IFtdO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gcnVuIHdpdGggLS13YWl0LCBtYWtlIHN1cmUgd2Uga2VlcCB0aGUgcGF0aHMgdG8gd2FpdCBmb3Jcblx0XHRpZiAoZmlsZXNUb09wZW4gJiYgb3BlbkNvbmZpZy53YWl0TWFya2VyRmlsZVVSSSkge1xuXHRcdFx0ZmlsZXNUb09wZW4uZmlsZXNUb1dhaXQgPSB7IHBhdGhzOiBjb2FsZXNjZShbLi4uZmlsZXNUb09wZW4uZmlsZXNUb0RpZmYsIGZpbGVzVG9PcGVuLmZpbGVzVG9NZXJnZVszXSAvKiBbM10gaXMgdGhlIHJlc3VsdGluZyBtZXJnZSBmaWxlICovLCAuLi5maWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlXSksIHdhaXRNYXJrZXJGaWxlVXJpOiBvcGVuQ29uZmlnLndhaXRNYXJrZXJGaWxlVVJJIH07XG5cdFx0fVxuXG5cdFx0Ly8gVGhlc2UgYXJlIHdpbmRvd3MgdG8gcmVzdG9yZSBiZWNhdXNlIG9mIGhvdC1leGl0IG9yIGZyb20gcHJldmlvdXMgc2Vzc2lvbiAob25seSBwZXJmb3JtZWQgb25jZSBvbiBzdGFydHVwISlcblx0XHRpZiAob3BlbkNvbmZpZy5pbml0aWFsU3RhcnR1cCkge1xuXG5cdFx0XHQvLyBVbnRpdGxlZCB3b3Jrc3BhY2VzIGFyZSBhbHdheXMgcmVzdG9yZWRcblx0XHRcdHVudGl0bGVkV29ya3NwYWNlc1RvUmVzdG9yZS5wdXNoKC4uLnRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5nZXRVbnRpdGxlZFdvcmtzcGFjZXMoKSk7XG5cdFx0XHR3b3Jrc3BhY2VzVG9PcGVuLnB1c2goLi4udW50aXRsZWRXb3Jrc3BhY2VzVG9SZXN0b3JlKTtcblxuXHRcdFx0Ly8gRW1wdHkgd2luZG93cyB3aXRoIGJhY2t1cHMgYXJlIGFsd2F5cyByZXN0b3JlZFxuXHRcdFx0ZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmUucHVzaCguLi50aGlzLmJhY2t1cE1haW5TZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmUubGVuZ3RoID0gMDtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGJhc2VkIG9uIGNvbmZpZ1xuXHRcdGNvbnN0IHsgd2luZG93czogdXNlZFdpbmRvd3MsIGZpbGVzT3BlbmVkSW5XaW5kb3cgfSA9IGF3YWl0IHRoaXMuZG9PcGVuKG9wZW5Db25maWcsIHdvcmtzcGFjZXNUb09wZW4sIGZvbGRlcnNUb09wZW4sIGVtcHR5V2luZG93c1dpdGhCYWNrdXBzVG9SZXN0b3JlLCBtYXliZU9wZW5FbXB0eVdpbmRvdywgZmlsZXNUb09wZW4sIGZvbGRlcnNUb0FkZCwgZm9sZGVyc1RvUmVtb3ZlKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgd2luZG93c01hbmFnZXIjb3BlbiB1c2VkIHdpbmRvdyBjb3VudCAke3VzZWRXaW5kb3dzLmxlbmd0aH0gKHdvcmtzcGFjZXNUb09wZW46ICR7d29ya3NwYWNlc1RvT3Blbi5sZW5ndGh9LCBmb2xkZXJzVG9PcGVuOiAke2ZvbGRlcnNUb09wZW4ubGVuZ3RofSwgZW1wdHlUb1Jlc3RvcmU6ICR7ZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmUubGVuZ3RofSwgbWF5YmVPcGVuRW1wdHlXaW5kb3c6ICR7bWF5YmVPcGVuRW1wdHlXaW5kb3d9KWApO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIHBhc3MgZm9jdXMgdG8gdGhlIG1vc3QgcmVsZXZhbnQgb2YgdGhlIHdpbmRvd3MgaWYgd2Ugb3BlbiBtdWx0aXBsZVxuXHRcdGlmICh1c2VkV2luZG93cy5sZW5ndGggPiAxKSB7XG5cblx0XHRcdC8vIDEuKSBmb2N1cyB3aW5kb3cgd2Ugb3BlbmVkIGZpbGVzIGluIGFsd2F5cyB3aXRoIGhpZ2hlc3QgcHJpb3JpdHlcblx0XHRcdGlmIChmaWxlc09wZW5lZEluV2luZG93KSB7XG5cdFx0XHRcdGZpbGVzT3BlbmVkSW5XaW5kb3cuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBmaW5kIGEgZ29vZCB3aW5kb3cgYmFzZWQgb24gb3BlbiBwYXJhbXNcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCBmb2N1c0xhc3RBY3RpdmUgPSB0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIuc3RhdGUubGFzdEFjdGl2ZVdpbmRvdyAmJiAhb3BlbkNvbmZpZy5mb3JjZUVtcHR5ICYmICFvcGVuQ29uZmlnLmNsaS5fLmxlbmd0aCAmJiAhb3BlbkNvbmZpZy5jbGlbJ2ZpbGUtdXJpJ10gJiYgIW9wZW5Db25maWcuY2xpWydmb2xkZXItdXJpJ10gJiYgIW9wZW5Db25maWcudXJpc1RvT3Blbj8ubGVuZ3RoO1xuXHRcdFx0XHRsZXQgZm9jdXNMYXN0T3BlbmVkID0gdHJ1ZTtcblx0XHRcdFx0bGV0IGZvY3VzTGFzdFdpbmRvdyA9IHRydWU7XG5cblx0XHRcdFx0Ly8gMi4pIGZvY3VzIGxhc3QgYWN0aXZlIHdpbmRvdyBpZiB3ZSBhcmUgbm90IGluc3RydWN0ZWQgdG8gb3BlbiBhbnkgcGF0aHNcblx0XHRcdFx0aWYgKGZvY3VzTGFzdEFjdGl2ZSkge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RBY3RpdmVXaW5kb3cgPSB1c2VkV2luZG93cy5maWx0ZXIod2luZG93ID0+IHRoaXMud2luZG93c1N0YXRlSGFuZGxlci5zdGF0ZS5sYXN0QWN0aXZlV2luZG93ICYmIHdpbmRvdy5iYWNrdXBQYXRoID09PSB0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIuc3RhdGUubGFzdEFjdGl2ZVdpbmRvdy5iYWNrdXBQYXRoKTtcblx0XHRcdFx0XHRpZiAobGFzdEFjdGl2ZVdpbmRvdy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGxhc3RBY3RpdmVXaW5kb3dbMF0uZm9jdXMoKTtcblx0XHRcdFx0XHRcdGZvY3VzTGFzdE9wZW5lZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0Zm9jdXNMYXN0V2luZG93ID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gMy4pIGlmIGluc3RydWN0ZWQgdG8gb3BlbiBwYXRocywgZm9jdXMgbGFzdCB3aW5kb3cgd2hpY2ggaXMgbm90IHJlc3RvcmVkXG5cdFx0XHRcdGlmIChmb2N1c0xhc3RPcGVuZWQpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gdXNlZFdpbmRvd3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVzZWRXaW5kb3cgPSB1c2VkV2luZG93c1tpXTtcblx0XHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdFx0KHVzZWRXaW5kb3cub3BlbmVkV29ya3NwYWNlICYmIHVudGl0bGVkV29ya3NwYWNlc1RvUmVzdG9yZS5zb21lKHdvcmtzcGFjZSA9PiB1c2VkV2luZG93Lm9wZW5lZFdvcmtzcGFjZSAmJiB3b3Jrc3BhY2Uud29ya3NwYWNlLmlkID09PSB1c2VkV2luZG93Lm9wZW5lZFdvcmtzcGFjZS5pZCkpIHx8XHQvLyBza2lwIG92ZXIgcmVzdG9yZWQgd29ya3NwYWNlXG5cdFx0XHRcdFx0XHRcdCh1c2VkV2luZG93LmJhY2t1cFBhdGggJiYgZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmUuc29tZShlbXB0eSA9PiB1c2VkV2luZG93LmJhY2t1cFBhdGggJiYgZW1wdHkuYmFja3VwRm9sZGVyID09PSBiYXNlbmFtZSh1c2VkV2luZG93LmJhY2t1cFBhdGgpKSlcdFx0XHRcdFx0XHRcdC8vIHNraXAgb3ZlciByZXN0b3JlZCBlbXB0eSB3aW5kb3dcblx0XHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dXNlZFdpbmRvdy5mb2N1cygpO1xuXHRcdFx0XHRcdFx0Zm9jdXNMYXN0V2luZG93ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyA0LikgZmluYWxseSwgYWx3YXlzIGVuc3VyZSB0byBoYXZlIGF0IGxlYXN0IGxhc3QgdXNlZCB3aW5kb3cgZm9jdXNlZFxuXHRcdFx0XHRpZiAoZm9jdXNMYXN0V2luZG93KSB7XG5cdFx0XHRcdFx0dXNlZFdpbmRvd3NbdXNlZFdpbmRvd3MubGVuZ3RoIC0gMV0uZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGluIHJlY2VudCBkb2N1bWVudCBsaXN0ICh1bmxlc3MgdGhpcyBvcGVucyBmb3IgZXh0ZW5zaW9uIGRldmVsb3BtZW50KVxuXHRcdC8vIEFsc28gZG8gbm90IGFkZCBwYXRocyB3aGVuIGZpbGVzIGFyZSBvcGVuZWQgZm9yIGRpZmZpbmcgb3IgbWVyZ2luZywgb25seSBpZiBvcGVuZWQgaW5kaXZpZHVhbGx5XG5cdFx0Y29uc3QgaXNEaWZmID0gZmlsZXNUb09wZW4gJiYgZmlsZXNUb09wZW4uZmlsZXNUb0RpZmYubGVuZ3RoID4gMDtcblx0XHRjb25zdCBpc01lcmdlID0gZmlsZXNUb09wZW4gJiYgZmlsZXNUb09wZW4uZmlsZXNUb01lcmdlLmxlbmd0aCA+IDA7XG5cdFx0aWYgKCF1c2VkV2luZG93cy5zb21lKHdpbmRvdyA9PiB3aW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QpICYmICFpc0RpZmYgJiYgIWlzTWVyZ2UgJiYgIW9wZW5Db25maWcubm9SZWNlbnRFbnRyeSkge1xuXHRcdFx0Y29uc3QgcmVjZW50czogSVJlY2VudFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHBhdGhUb09wZW4gb2YgcGF0aHNUb09wZW4pIHtcblx0XHRcdFx0aWYgKGlzV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoVG9PcGVuKSAmJiAhcGF0aFRvT3Blbi50cmFuc2llbnQgLyogbmV2ZXIgYWRkIHRyYW5zaWVudCB3b3Jrc3BhY2VzIHRvIGhpc3RvcnkgKi8pIHtcblx0XHRcdFx0XHRyZWNlbnRzLnB1c2goeyBsYWJlbDogcGF0aFRvT3Blbi5sYWJlbCwgd29ya3NwYWNlOiBwYXRoVG9PcGVuLndvcmtzcGFjZSwgcmVtb3RlQXV0aG9yaXR5OiBwYXRoVG9PcGVuLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW4ocGF0aFRvT3BlbikpIHtcblx0XHRcdFx0XHRyZWNlbnRzLnB1c2goeyBsYWJlbDogcGF0aFRvT3Blbi5sYWJlbCwgZm9sZGVyVXJpOiBwYXRoVG9PcGVuLndvcmtzcGFjZS51cmksIHJlbW90ZUF1dGhvcml0eTogcGF0aFRvT3Blbi5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGF0aFRvT3Blbi5maWxlVXJpKSB7XG5cdFx0XHRcdFx0cmVjZW50cy5wdXNoKHsgbGFiZWw6IHBhdGhUb09wZW4ubGFiZWwsIGZpbGVVcmk6IHBhdGhUb09wZW4uZmlsZVVyaSwgcmVtb3RlQXV0aG9yaXR5OiBwYXRoVG9PcGVuLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLndvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuYWRkUmVjZW50bHlPcGVuZWQocmVjZW50cyk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGA8YXBwPiAtLXdhaXRgXG5cdFx0dGhpcy5oYW5kbGVXYWl0TWFya2VyRmlsZShvcGVuQ29uZmlnLCB1c2VkV2luZG93cyk7XG5cblx0XHQvLyBIYW5kbGUgYDxhcHA+IGNoYXRgXG5cdFx0dGhpcy5oYW5kbGVDaGF0UmVxdWVzdChvcGVuQ29uZmlnLCB1c2VkV2luZG93cyk7XG5cblx0XHRyZXR1cm4gdXNlZFdpbmRvd3M7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVdhaXRNYXJrZXJGaWxlKG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbiwgdXNlZFdpbmRvd3M6IElDb2RlV2luZG93W10pOiB2b2lkIHtcblxuXHRcdC8vIElmIHdlIGdvdCBzdGFydGVkIHdpdGggLS13YWl0IGZyb20gdGhlIENMSSwgd2UgbmVlZCB0byBzaWduYWwgdG8gdGhlIG91dHNpZGUgd2hlbiB0aGUgd2luZG93XG5cdFx0Ly8gdXNlZCBmb3IgdGhlIGVkaXQgb3BlcmF0aW9uIGlzIGNsb3NlZCBvciBsb2FkZWQgdG8gYSBkaWZmZXJlbnQgZm9sZGVyIHNvIHRoYXQgdGhlIHdhaXRpbmdcblx0XHQvLyBwcm9jZXNzIGNhbiBjb250aW51ZS4gV2UgZG8gdGhpcyBieSBkZWxldGluZyB0aGUgd2FpdE1hcmtlckZpbGVQYXRoLlxuXHRcdGNvbnN0IHdhaXRNYXJrZXJGaWxlVVJJID0gb3BlbkNvbmZpZy53YWl0TWFya2VyRmlsZVVSSTtcblx0XHRpZiAob3BlbkNvbmZpZy5jb250ZXh0ID09PSBPcGVuQ29udGV4dC5DTEkgJiYgd2FpdE1hcmtlckZpbGVVUkkgJiYgdXNlZFdpbmRvd3MubGVuZ3RoID09PSAxICYmIHVzZWRXaW5kb3dzWzBdKSB7XG5cdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB1c2VkV2luZG93c1swXS53aGVuQ2xvc2VkT3JMb2FkZWQ7XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh3YWl0TWFya2VyRmlsZVVSSSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlIC0gY291bGQgaGF2ZSBiZWVuIGRlbGV0ZWQgZnJvbSB0aGUgd2luZG93IGFscmVhZHlcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNoYXRSZXF1ZXN0KG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbiwgdXNlZFdpbmRvd3M6IElDb2RlV2luZG93W10pOiB2b2lkIHtcblx0XHRpZiAob3BlbkNvbmZpZy5jb250ZXh0ICE9PSBPcGVuQ29udGV4dC5DTEkgfHwgIW9wZW5Db25maWcuY2xpLmNoYXQgfHwgdXNlZFdpbmRvd3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHdpbmRvd0hhbmRsaW5nQ2hhdFJlcXVlc3Q6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkO1xuXHRcdGlmICh1c2VkV2luZG93cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHdpbmRvd0hhbmRsaW5nQ2hhdFJlcXVlc3QgPSB1c2VkV2luZG93c1swXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY2hhdFJlcXVlc3RGb2xkZXIgPSBvcGVuQ29uZmlnLmNsaS5fWzBdOyAvLyBjaGF0IHJlcXVlc3QgZ2V0cyBjd2QoKSBhcyBmb2xkZXIgdG8gb3BlblxuXHRcdFx0aWYgKGNoYXRSZXF1ZXN0Rm9sZGVyKSB7XG5cdFx0XHRcdHdpbmRvd0hhbmRsaW5nQ2hhdFJlcXVlc3QgPSBmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlcih1c2VkV2luZG93cywgVVJJLmZpbGUoY2hhdFJlcXVlc3RGb2xkZXIpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAod2luZG93SGFuZGxpbmdDaGF0UmVxdWVzdCkge1xuXHRcdFx0d2luZG93SGFuZGxpbmdDaGF0UmVxdWVzdC5zZW5kV2hlblJlYWR5KCd2c2NvZGU6aGFuZGxlQ2hhdFJlcXVlc3QnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBvcGVuQ29uZmlnLmNsaS5jaGF0KTtcblx0XHRcdHdpbmRvd0hhbmRsaW5nQ2hhdFJlcXVlc3QuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvT3Blbihcblx0XHRvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24sXG5cdFx0d29ya3NwYWNlc1RvT3BlbjogSVdvcmtzcGFjZVBhdGhUb09wZW5bXSxcblx0XHRmb2xkZXJzVG9PcGVuOiBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbltdLFxuXHRcdGVtcHR5VG9SZXN0b3JlOiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvW10sXG5cdFx0bWF5YmVPcGVuRW1wdHlXaW5kb3c6IGJvb2xlYW4sXG5cdFx0ZmlsZXNUb09wZW46IElGaWxlc1RvT3BlbiB8IHVuZGVmaW5lZCxcblx0XHRmb2xkZXJzVG9BZGQ6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW10sXG5cdFx0Zm9sZGVyc1RvUmVtb3ZlOiBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbltdXG5cdCk6IFByb21pc2U8eyB3aW5kb3dzOiBJQ29kZVdpbmRvd1tdOyBmaWxlc09wZW5lZEluV2luZG93OiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB9PiB7XG5cblx0XHQvLyBLZWVwIHRyYWNrIG9mIHVzZWQgd2luZG93cyBhbmQgcmVtZW1iZXJcblx0XHQvLyBpZiBmaWxlcyBoYXZlIGJlZW4gb3BlbmVkIGluIG9uZSBvZiB0aGVtXG5cdFx0Y29uc3QgdXNlZFdpbmRvd3M6IElDb2RlV2luZG93W10gPSBbXTtcblx0XHRsZXQgZmlsZXNPcGVuZWRJbldpbmRvdzogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0ZnVuY3Rpb24gYWRkVXNlZFdpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93LCBvcGVuZWRGaWxlcz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdHVzZWRXaW5kb3dzLnB1c2god2luZG93KTtcblxuXHRcdFx0aWYgKG9wZW5lZEZpbGVzKSB7XG5cdFx0XHRcdGZpbGVzT3BlbmVkSW5XaW5kb3cgPSB3aW5kb3c7XG5cdFx0XHRcdGZpbGVzVG9PcGVuID0gdW5kZWZpbmVkOyAvLyByZXNldCBgZmlsZXNUb09wZW5gIHNpbmNlIGZpbGVzIGhhdmUgYmVlbiBvcGVuZWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXR0aW5ncyBjYW4gZGVjaWRlIGlmIGZpbGVzL2ZvbGRlcnMgb3BlbiBpbiBuZXcgd2luZG93IG9yIG5vdFxuXHRcdGxldCB7IG9wZW5Gb2xkZXJJbk5ld1dpbmRvdywgb3BlbkZpbGVzSW5OZXdXaW5kb3cgfSA9IHRoaXMuc2hvdWxkT3Blbk5ld1dpbmRvdyhvcGVuQ29uZmlnKTtcblx0XHRpZiAodGhpcy5nZXRTZXNzaW9uc1dpbmRvd0ZvckZvbGRlckhhbmRvZmYob3BlbkNvbmZpZykpIHtcblx0XHRcdG9wZW5Gb2xkZXJJbk5ld1dpbmRvdyA9IGZhbHNlO1xuXHRcdFx0b3BlbkZpbGVzSW5OZXdXaW5kb3cgPSBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgZm9sZGVycyB0byBhZGQvcmVtb3ZlIGJ5IGxvb2tpbmcgZm9yIHRoZSBsYXN0IGFjdGl2ZSB3b3Jrc3BhY2UgKG5vdCBvbiBpbml0aWFsIHN0YXJ0dXApXG5cdFx0aWYgKCFvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwICYmIChmb2xkZXJzVG9BZGQubGVuZ3RoID4gMCB8fCBmb2xkZXJzVG9SZW1vdmUubGVuZ3RoID4gMCkpIHtcblx0XHRcdGNvbnN0IGF1dGhvcml0eSA9IGZvbGRlcnNUb0FkZC5hdCgwKT8ucmVtb3RlQXV0aG9yaXR5ID8/IGZvbGRlcnNUb1JlbW92ZS5hdCgwKT8ucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0Y29uc3QgbGFzdEFjdGl2ZVdpbmRvdyA9IHRoaXMuZ2V0TGFzdEFjdGl2ZVdpbmRvd0ZvckF1dGhvcml0eShhdXRob3JpdHkpO1xuXHRcdFx0aWYgKGxhc3RBY3RpdmVXaW5kb3cpIHtcblx0XHRcdFx0YWRkVXNlZFdpbmRvdyh0aGlzLmRvQWRkUmVtb3ZlRm9sZGVyc0luRXhpc3RpbmdXaW5kb3cobGFzdEFjdGl2ZVdpbmRvdywgZm9sZGVyc1RvQWRkLm1hcChmb2xkZXJUb0FkZCA9PiBmb2xkZXJUb0FkZC53b3Jrc3BhY2UudXJpKSwgZm9sZGVyc1RvUmVtb3ZlLm1hcChmb2xkZXJUb1JlbW92ZSA9PiBmb2xkZXJUb1JlbW92ZS53b3Jrc3BhY2UudXJpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBmaWxlcyB0byBvcGVuL2RpZmYvbWVyZ2Ugb3IgdG8gY3JlYXRlIHdoZW4gd2UgZG9udCBvcGVuIGEgZm9sZGVyIGFuZCB3ZSBkbyBub3QgcmVzdG9yZSBhbnlcblx0XHQvLyBmb2xkZXIvdW50aXRsZWQgZnJvbSBob3QtZXhpdCBieSB0cnlpbmcgdG8gb3BlbiB0aGVtIGluIHRoZSB3aW5kb3cgdGhhdCBmaXRzIGJlc3Rcblx0XHRjb25zdCBwb3RlbnRpYWxOZXdXaW5kb3dzQ291bnQgPSBmb2xkZXJzVG9PcGVuLmxlbmd0aCArIHdvcmtzcGFjZXNUb09wZW4ubGVuZ3RoICsgZW1wdHlUb1Jlc3RvcmUubGVuZ3RoO1xuXHRcdGlmIChmaWxlc1RvT3BlbiAmJiBwb3RlbnRpYWxOZXdXaW5kb3dzQ291bnQgPT09IDApIHtcblxuXHRcdFx0Ly8gRmluZCBzdWl0YWJsZSB3aW5kb3cgb3IgZm9sZGVyIHBhdGggdG8gb3BlbiBmaWxlcyBpblxuXHRcdFx0Y29uc3QgZmlsZVRvQ2hlY2s6IElQYXRoPElFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZCA9IGZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGVbMF0gfHwgZmlsZXNUb09wZW4uZmlsZXNUb0RpZmZbMF0gfHwgZmlsZXNUb09wZW4uZmlsZXNUb01lcmdlWzNdIC8qIFszXSBpcyB0aGUgcmVzdWx0aW5nIG1lcmdlIGZpbGUgKi87XG5cblx0XHRcdC8vIG9ubHkgbG9vayBhdCB0aGUgd2luZG93cyB3aXRoIGNvcnJlY3QgYXV0aG9yaXR5XG5cdFx0XHRjb25zdCB3aW5kb3dzID0gdGhpcy5nZXRXaW5kb3dzKCkuZmlsdGVyKHdpbmRvdyA9PiBmaWxlc1RvT3BlbiAmJiBpc0VxdWFsQXV0aG9yaXR5KHdpbmRvdy5yZW1vdGVBdXRob3JpdHksIGZpbGVzVG9PcGVuLnJlbW90ZUF1dGhvcml0eSkpO1xuXG5cdFx0XHQvLyBmaWd1cmUgb3V0IGEgZ29vZCB3aW5kb3cgdG8gb3BlbiB0aGUgZmlsZXMgaW4gaWYgYW55XG5cdFx0XHQvLyB3aXRoIGEgZmFsbGJhY2sgdG8gdGhlIGxhc3QgYWN0aXZlIHdpbmRvdy5cblx0XHRcdC8vXG5cdFx0XHQvLyBpbiBjYXNlIGBvcGVuRmlsZXNJbk5ld1dpbmRvd2AgaXMgZW5mb3JjZWQsIHdlIHNraXBcblx0XHRcdC8vIHRoaXMgc3RlcC5cblx0XHRcdGxldCB3aW5kb3dUb1VzZUZvckZpbGVzOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChmaWxlVG9DaGVjaz8uZmlsZVVyaSAmJiAhb3BlbkZpbGVzSW5OZXdXaW5kb3cpIHtcblx0XHRcdFx0aWYgKG9wZW5Db25maWcuY29udGV4dCA9PT0gT3BlbkNvbnRleHQuREVTS1RPUCB8fCBvcGVuQ29uZmlnLmNvbnRleHQgPT09IE9wZW5Db250ZXh0LkNMSSB8fCBvcGVuQ29uZmlnLmNvbnRleHQgPT09IE9wZW5Db250ZXh0LkRPQ0sgfHwgb3BlbkNvbmZpZy5jb250ZXh0ID09PSBPcGVuQ29udGV4dC5MSU5LKSB7XG5cdFx0XHRcdFx0d2luZG93VG9Vc2VGb3JGaWxlcyA9IGF3YWl0IGZpbmRXaW5kb3dPbkZpbGUod2luZG93cywgZmlsZVRvQ2hlY2suZmlsZVVyaSwgYXN5bmMgd29ya3NwYWNlID0+IHdvcmtzcGFjZS5jb25maWdQYXRoLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gdGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF3aW5kb3dUb1VzZUZvckZpbGVzKSB7XG5cdFx0XHRcdFx0d2luZG93VG9Vc2VGb3JGaWxlcyA9IHRoaXMuZG9HZXRMYXN0QWN0aXZlV2luZG93KHdpbmRvd3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdlIGZvdW5kIGEgd2luZG93IHRvIG9wZW4gdGhlIGZpbGVzIGluXG5cdFx0XHRpZiAod2luZG93VG9Vc2VGb3JGaWxlcykge1xuXG5cdFx0XHRcdC8vIFdpbmRvdyBpcyB3b3Jrc3BhY2Vcblx0XHRcdFx0aWYgKGlzV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3dUb1VzZUZvckZpbGVzLm9wZW5lZFdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VzVG9PcGVuLnB1c2goeyB3b3Jrc3BhY2U6IHdpbmRvd1RvVXNlRm9yRmlsZXMub3BlbmVkV29ya3NwYWNlLCByZW1vdGVBdXRob3JpdHk6IHdpbmRvd1RvVXNlRm9yRmlsZXMucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2luZG93IGlzIHNpbmdsZSBmb2xkZXJcblx0XHRcdFx0ZWxzZSBpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvd1RvVXNlRm9yRmlsZXMub3BlbmVkV29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdGZvbGRlcnNUb09wZW4ucHVzaCh7IHdvcmtzcGFjZTogd2luZG93VG9Vc2VGb3JGaWxlcy5vcGVuZWRXb3Jrc3BhY2UsIHJlbW90ZUF1dGhvcml0eTogd2luZG93VG9Vc2VGb3JGaWxlcy5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXaW5kb3cgaXMgZW1wdHlcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0YWRkVXNlZFdpbmRvdyh0aGlzLmRvT3BlbkZpbGVzSW5FeGlzdGluZ1dpbmRvdyhvcGVuQ29uZmlnLCB3aW5kb3dUb1VzZUZvckZpbGVzLCBmaWxlc1RvT3BlbiksIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbmFsbHksIGlmIG5vIHdpbmRvdyBvciBmb2xkZXIgaXMgZm91bmQsIGp1c3Qgb3BlbiB0aGUgZmlsZXMgaW4gYW4gZW1wdHkgd2luZG93XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnNXaW5kb3cgPSAhb3BlbkZpbGVzSW5OZXdXaW5kb3cgPyB0aGlzLmdldFNlc3Npb25zV2luZG93Rm9yRm9sZGVySGFuZG9mZihvcGVuQ29uZmlnKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHNlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdFx0YWRkVXNlZFdpbmRvdyh0aGlzLmRvT3BlbkZpbGVzSW5FeGlzdGluZ1dpbmRvdyhvcGVuQ29uZmlnLCBzZXNzaW9uc1dpbmRvdywgZmlsZXNUb09wZW4pLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhZGRVc2VkV2luZG93KGF3YWl0IHRoaXMub3BlbkluQnJvd3NlcldpbmRvdyh7XG5cdFx0XHRcdFx0XHR1c2VyRW52OiBvcGVuQ29uZmlnLnVzZXJFbnYsXG5cdFx0XHRcdFx0XHRjbGk6IG9wZW5Db25maWcuY2xpLFxuXHRcdFx0XHRcdFx0aW5pdGlhbFN0YXJ0dXA6IG9wZW5Db25maWcuaW5pdGlhbFN0YXJ0dXAsXG5cdFx0XHRcdFx0XHRmaWxlc1RvT3Blbixcblx0XHRcdFx0XHRcdGZvcmNlTmV3V2luZG93OiB0cnVlLFxuXHRcdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBmaWxlc1RvT3Blbi5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0XHRmb3JjZU5ld1RhYmJlZFdpbmRvdzogb3BlbkNvbmZpZy5mb3JjZU5ld1RhYmJlZFdpbmRvdyxcblx0XHRcdFx0XHRcdGZvcmNlUHJvZmlsZTogb3BlbkNvbmZpZy5mb3JjZVByb2ZpbGUsXG5cdFx0XHRcdFx0XHRmb3JjZVRlbXBQcm9maWxlOiBvcGVuQ29uZmlnLmZvcmNlVGVtcFByb2ZpbGVcblx0XHRcdFx0XHR9KSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgd29ya3NwYWNlcyB0byBvcGVuIChpbnN0cnVjdGVkIGFuZCB0byByZXN0b3JlKVxuXHRcdGNvbnN0IGFsbFdvcmtzcGFjZXNUb09wZW4gPSBkaXN0aW5jdCh3b3Jrc3BhY2VzVG9PcGVuLCB3b3Jrc3BhY2UgPT4gd29ya3NwYWNlLndvcmtzcGFjZS5pZCk7IC8vIHByZXZlbnQgZHVwbGljYXRlc1xuXHRcdGlmIChhbGxXb3Jrc3BhY2VzVG9PcGVuLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGV4aXN0aW5nIGluc3RhbmNlc1xuXHRcdFx0Y29uc3Qgd2luZG93c09uV29ya3NwYWNlID0gY29hbGVzY2UoYWxsV29ya3NwYWNlc1RvT3Blbi5tYXAod29ya3NwYWNlVG9PcGVuID0+IGZpbmRXaW5kb3dPbldvcmtzcGFjZU9yRm9sZGVyKHRoaXMuZ2V0V2luZG93cygpLCB3b3Jrc3BhY2VUb09wZW4ud29ya3NwYWNlLmNvbmZpZ1BhdGgpKSk7XG5cdFx0XHRpZiAod2luZG93c09uV29ya3NwYWNlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgd2luZG93T25Xb3Jrc3BhY2UgPSB3aW5kb3dzT25Xb3Jrc3BhY2VbMF07XG5cdFx0XHRcdGNvbnN0IGZpbGVzVG9PcGVuSW5XaW5kb3cgPSBpc0VxdWFsQXV0aG9yaXR5KGZpbGVzVG9PcGVuPy5yZW1vdGVBdXRob3JpdHksIHdpbmRvd09uV29ya3NwYWNlLnJlbW90ZUF1dGhvcml0eSkgPyBmaWxlc1RvT3BlbiA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBEbyBvcGVuIGZpbGVzXG5cdFx0XHRcdGFkZFVzZWRXaW5kb3codGhpcy5kb09wZW5GaWxlc0luRXhpc3RpbmdXaW5kb3cob3BlbkNvbmZpZywgd2luZG93T25Xb3Jrc3BhY2UsIGZpbGVzVG9PcGVuSW5XaW5kb3cpLCAhIWZpbGVzVG9PcGVuSW5XaW5kb3cpO1xuXG5cdFx0XHRcdG9wZW5Gb2xkZXJJbk5ld1dpbmRvdyA9IHRydWU7IC8vIGFueSBvdGhlciBmb2xkZXJzIHRvIG9wZW4gbXVzdCBvcGVuIGluIG5ldyB3aW5kb3cgdGhlblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPcGVuIHJlbWFpbmluZyBvbmVzXG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZVRvT3BlbiBvZiBhbGxXb3Jrc3BhY2VzVG9PcGVuKSB7XG5cdFx0XHRcdGlmICh3aW5kb3dzT25Xb3Jrc3BhY2Uuc29tZSh3aW5kb3cgPT4gd2luZG93Lm9wZW5lZFdvcmtzcGFjZSAmJiB3aW5kb3cub3BlbmVkV29ya3NwYWNlLmlkID09PSB3b3Jrc3BhY2VUb09wZW4ud29ya3NwYWNlLmlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBpZ25vcmUgZm9sZGVycyB0aGF0IGFyZSBhbHJlYWR5IG9wZW5cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHdvcmtzcGFjZVRvT3Blbi5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdGNvbnN0IGZpbGVzVG9PcGVuSW5XaW5kb3cgPSBpc0VxdWFsQXV0aG9yaXR5KGZpbGVzVG9PcGVuPy5yZW1vdGVBdXRob3JpdHksIHJlbW90ZUF1dGhvcml0eSkgPyBmaWxlc1RvT3BlbiA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBEbyBvcGVuIGZvbGRlclxuXHRcdFx0XHRhZGRVc2VkV2luZG93KGF3YWl0IHRoaXMuZG9PcGVuRm9sZGVyT3JXb3Jrc3BhY2Uob3BlbkNvbmZpZywgd29ya3NwYWNlVG9PcGVuLCBvcGVuRm9sZGVySW5OZXdXaW5kb3csIGZpbGVzVG9PcGVuSW5XaW5kb3cpLCAhIWZpbGVzVG9PcGVuSW5XaW5kb3cpO1xuXG5cdFx0XHRcdG9wZW5Gb2xkZXJJbk5ld1dpbmRvdyA9IHRydWU7IC8vIGFueSBvdGhlciBmb2xkZXJzIHRvIG9wZW4gbXVzdCBvcGVuIGluIG5ldyB3aW5kb3cgdGhlblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBmb2xkZXJzIHRvIG9wZW4gKGluc3RydWN0ZWQgYW5kIHRvIHJlc3RvcmUpXG5cdFx0Y29uc3QgYWxsRm9sZGVyc1RvT3BlbiA9IGRpc3RpbmN0KGZvbGRlcnNUb09wZW4sIGZvbGRlciA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KGZvbGRlci53b3Jrc3BhY2UudXJpKSk7IC8vIHByZXZlbnQgZHVwbGljYXRlc1xuXHRcdGlmIChhbGxGb2xkZXJzVG9PcGVuLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGV4aXN0aW5nIGluc3RhbmNlc1xuXHRcdFx0Y29uc3Qgd2luZG93c09uRm9sZGVyUGF0aCA9IGNvYWxlc2NlKGFsbEZvbGRlcnNUb09wZW4ubWFwKGZvbGRlclRvT3BlbiA9PiBmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlcih0aGlzLmdldFdpbmRvd3MoKSwgZm9sZGVyVG9PcGVuLndvcmtzcGFjZS51cmkpKSk7XG5cdFx0XHRpZiAod2luZG93c09uRm9sZGVyUGF0aC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHdpbmRvd09uRm9sZGVyUGF0aCA9IHdpbmRvd3NPbkZvbGRlclBhdGhbMF07XG5cdFx0XHRcdGNvbnN0IGZpbGVzVG9PcGVuSW5XaW5kb3cgPSBpc0VxdWFsQXV0aG9yaXR5KGZpbGVzVG9PcGVuPy5yZW1vdGVBdXRob3JpdHksIHdpbmRvd09uRm9sZGVyUGF0aC5yZW1vdGVBdXRob3JpdHkpID8gZmlsZXNUb09wZW4gOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gRG8gb3BlbiBmaWxlc1xuXHRcdFx0XHRhZGRVc2VkV2luZG93KHRoaXMuZG9PcGVuRmlsZXNJbkV4aXN0aW5nV2luZG93KG9wZW5Db25maWcsIHdpbmRvd09uRm9sZGVyUGF0aCwgZmlsZXNUb09wZW5JbldpbmRvdyksICEhZmlsZXNUb09wZW5JbldpbmRvdyk7XG5cblx0XHRcdFx0b3BlbkZvbGRlckluTmV3V2luZG93ID0gdHJ1ZTsgLy8gYW55IG90aGVyIGZvbGRlcnMgdG8gb3BlbiBtdXN0IG9wZW4gaW4gbmV3IHdpbmRvdyB0aGVuXG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW4gcmVtYWluaW5nIG9uZXNcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyVG9PcGVuIG9mIGFsbEZvbGRlcnNUb09wZW4pIHtcblx0XHRcdFx0aWYgKHdpbmRvd3NPbkZvbGRlclBhdGguc29tZSh3aW5kb3cgPT4gaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UpICYmIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwod2luZG93Lm9wZW5lZFdvcmtzcGFjZS51cmksIGZvbGRlclRvT3Blbi53b3Jrc3BhY2UudXJpKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gaWdub3JlIGZvbGRlcnMgdGhhdCBhcmUgYWxyZWFkeSBvcGVuXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSBmb2xkZXJUb09wZW4ucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0XHRjb25zdCBmaWxlc1RvT3BlbkluV2luZG93ID0gaXNFcXVhbEF1dGhvcml0eShmaWxlc1RvT3Blbj8ucmVtb3RlQXV0aG9yaXR5LCByZW1vdGVBdXRob3JpdHkpID8gZmlsZXNUb09wZW4gOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gRG8gb3BlbiBmb2xkZXJcblx0XHRcdFx0YWRkVXNlZFdpbmRvdyhhd2FpdCB0aGlzLmRvT3BlbkZvbGRlck9yV29ya3NwYWNlKG9wZW5Db25maWcsIGZvbGRlclRvT3Blbiwgb3BlbkZvbGRlckluTmV3V2luZG93LCBmaWxlc1RvT3BlbkluV2luZG93KSwgISFmaWxlc1RvT3BlbkluV2luZG93KTtcblxuXHRcdFx0XHRvcGVuRm9sZGVySW5OZXdXaW5kb3cgPSB0cnVlOyAvLyBhbnkgb3RoZXIgZm9sZGVycyB0byBvcGVuIG11c3Qgb3BlbiBpbiBuZXcgd2luZG93IHRoZW5cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgZW1wdHkgdG8gcmVzdG9yZVxuXHRcdGNvbnN0IGFsbEVtcHR5VG9SZXN0b3JlID0gZGlzdGluY3QoZW1wdHlUb1Jlc3RvcmUsIGluZm8gPT4gaW5mby5iYWNrdXBGb2xkZXIpOyAvLyBwcmV2ZW50IGR1cGxpY2F0ZXNcblx0XHRpZiAoYWxsRW1wdHlUb1Jlc3RvcmUubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBlbXB0eVdpbmRvd0JhY2t1cEluZm8gb2YgYWxsRW1wdHlUb1Jlc3RvcmUpIHtcblx0XHRcdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gZW1wdHlXaW5kb3dCYWNrdXBJbmZvLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdFx0Y29uc3QgZmlsZXNUb09wZW5JbldpbmRvdyA9IGlzRXF1YWxBdXRob3JpdHkoZmlsZXNUb09wZW4/LnJlbW90ZUF1dGhvcml0eSwgcmVtb3RlQXV0aG9yaXR5KSA/IGZpbGVzVG9PcGVuIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGFkZFVzZWRXaW5kb3coYXdhaXQgdGhpcy5kb09wZW5FbXB0eShvcGVuQ29uZmlnLCB0cnVlLCByZW1vdGVBdXRob3JpdHksIGZpbGVzVG9PcGVuSW5XaW5kb3csIGVtcHR5V2luZG93QmFja3VwSW5mbyksICEhZmlsZXNUb09wZW5JbldpbmRvdyk7XG5cblx0XHRcdFx0b3BlbkZvbGRlckluTmV3V2luZG93ID0gdHJ1ZTsgLy8gYW55IG90aGVyIGZvbGRlcnMgdG8gb3BlbiBtdXN0IG9wZW4gaW4gbmV3IHdpbmRvdyB0aGVuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSwgb3BlbiBhbiBlbXB0eSB3aW5kb3cgaWZcblx0XHQvLyAtIHdlIHN0aWxsIGhhdmUgZmlsZXMgdG8gb3BlblxuXHRcdC8vIC0gdXNlciBmb3JjZXMgYW4gZW1wdHkgd2luZG93IChlLmcuIHZpYSBjb21tYW5kIGxpbmUpXG5cdFx0Ly8gLSBubyB3aW5kb3cgaGFzIG9wZW5lZCB5ZXRcblx0XHRpZiAoZmlsZXNUb09wZW4gfHwgKG1heWJlT3BlbkVtcHR5V2luZG93ICYmIChvcGVuQ29uZmlnLmZvcmNlRW1wdHkgfHwgdXNlZFdpbmRvd3MubGVuZ3RoID09PSAwKSkpIHtcblx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IGZpbGVzVG9PcGVuID8gZmlsZXNUb09wZW4ucmVtb3RlQXV0aG9yaXR5IDogb3BlbkNvbmZpZy5yZW1vdGVBdXRob3JpdHk7XG5cblx0XHRcdGFkZFVzZWRXaW5kb3coYXdhaXQgdGhpcy5kb09wZW5FbXB0eShvcGVuQ29uZmlnLCBvcGVuRm9sZGVySW5OZXdXaW5kb3csIHJlbW90ZUF1dGhvcml0eSwgZmlsZXNUb09wZW4pLCAhIWZpbGVzVG9PcGVuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB3aW5kb3dzOiBkaXN0aW5jdCh1c2VkV2luZG93cyksIGZpbGVzT3BlbmVkSW5XaW5kb3cgfTtcblx0fVxuXG5cdHByaXZhdGUgZG9PcGVuRmlsZXNJbkV4aXN0aW5nV2luZG93KGNvbmZpZ3VyYXRpb246IElPcGVuQ29uZmlndXJhdGlvbiwgd2luZG93OiBJQ29kZVdpbmRvdywgZmlsZXNUb09wZW4/OiBJRmlsZXNUb09wZW4pOiBJQ29kZVdpbmRvdyB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd3aW5kb3dzTWFuYWdlciNkb09wZW5GaWxlc0luRXhpc3RpbmdXaW5kb3cnLCB7IGZpbGVzVG9PcGVuIH0pO1xuXG5cdFx0dGhpcy5mb2N1c01haW5PckNoaWxkV2luZG93KHdpbmRvdyk7IC8vIG1ha2Ugc3VyZSB3aW5kb3cgb3IgYW55IG9mIHRoZSBjaGlsZHJlbiBoYXMgZm9jdXNcblxuXHRcdGNvbnN0IHBhcmFtczogSU5hdGl2ZU9wZW5GaWxlUmVxdWVzdCA9IHtcblx0XHRcdGZpbGVzVG9PcGVuT3JDcmVhdGU6IGZpbGVzVG9PcGVuPy5maWxlc1RvT3Blbk9yQ3JlYXRlLFxuXHRcdFx0ZmlsZXNUb0RpZmY6IGZpbGVzVG9PcGVuPy5maWxlc1RvRGlmZixcblx0XHRcdGZpbGVzVG9NZXJnZTogZmlsZXNUb09wZW4/LmZpbGVzVG9NZXJnZSxcblx0XHRcdGZpbGVzVG9XYWl0OiBmaWxlc1RvT3Blbj8uZmlsZXNUb1dhaXQsXG5cdFx0XHR0ZXJtUHJvZ3JhbTogY29uZmlndXJhdGlvbj8udXNlckVudj8uWydURVJNX1BST0dSQU0nXVxuXHRcdH07XG5cdFx0d2luZG93LnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpvcGVuRmlsZXMnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBwYXJhbXMpO1xuXG5cdFx0cmV0dXJuIHdpbmRvdztcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNNYWluT3JDaGlsZFdpbmRvdyhtYWluV2luZG93OiBJQ29kZVdpbmRvdyk6IHZvaWQge1xuXHRcdGxldCB3aW5kb3dUb0ZvY3VzOiBJQ29kZVdpbmRvdyB8IElBdXhpbGlhcnlXaW5kb3cgPSBtYWluV2luZG93O1xuXG5cdFx0Y29uc3QgZm9jdXNlZFdpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdygpO1xuXHRcdGlmIChmb2N1c2VkV2luZG93ICYmIGZvY3VzZWRXaW5kb3cuaWQgIT09IG1haW5XaW5kb3cuaWQpIHtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvd0NhbmRpZGF0ZSA9IHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMoZm9jdXNlZFdpbmRvdy53ZWJDb250ZW50cyk7XG5cdFx0XHRpZiAoYXV4aWxpYXJ5V2luZG93Q2FuZGlkYXRlICYmIGF1eGlsaWFyeVdpbmRvd0NhbmRpZGF0ZS5wYXJlbnRJZCA9PT0gbWFpbldpbmRvdy5pZCkge1xuXHRcdFx0XHR3aW5kb3dUb0ZvY3VzID0gYXV4aWxpYXJ5V2luZG93Q2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdpbmRvd1RvRm9jdXMuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9BZGRSZW1vdmVGb2xkZXJzSW5FeGlzdGluZ1dpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93LCBmb2xkZXJzVG9BZGQ6IFVSSVtdLCBmb2xkZXJzVG9SZW1vdmU6IFVSSVtdKTogSUNvZGVXaW5kb3cge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnd2luZG93c01hbmFnZXIjZG9BZGRSZW1vdmVGb2xkZXJzVG9FeGlzdGluZ1dpbmRvdycsIHsgZm9sZGVyc1RvQWRkLCBmb2xkZXJzVG9SZW1vdmUgfSk7XG5cblx0XHR3aW5kb3cuZm9jdXMoKTsgLy8gbWFrZSBzdXJlIHdpbmRvdyBoYXMgZm9jdXNcblxuXHRcdGNvbnN0IHJlcXVlc3Q6IElBZGRSZW1vdmVGb2xkZXJzUmVxdWVzdCA9IHsgZm9sZGVyc1RvQWRkLCBmb2xkZXJzVG9SZW1vdmUgfTtcblx0XHR3aW5kb3cuc2VuZFdoZW5SZWFkeSgndnNjb2RlOmFkZFJlbW92ZUZvbGRlcnMnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCByZXF1ZXN0KTtcblxuXHRcdHJldHVybiB3aW5kb3c7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVDb250ZXh0V2luZG93KG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbiwgZm9yY2VOZXdXaW5kb3c6IGJvb2xlYW4pOiB7IHdpbmRvd1RvVXNlOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZDsgZm9yY2VOZXdXaW5kb3c6IGJvb2xlYW4gfSB7XG5cdFx0aWYgKCFmb3JjZU5ld1dpbmRvdyAmJiB0eXBlb2Ygb3BlbkNvbmZpZy5jb250ZXh0V2luZG93SWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0V2luZG93ID0gdGhpcy5nZXRXaW5kb3dCeUlkKG9wZW5Db25maWcuY29udGV4dFdpbmRvd0lkKTtcblx0XHRcdGlmIChjb250ZXh0V2luZG93Py5jb25maWc/LmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yV2luZG93ID0gdGhpcy5nZXRMYXN0QWN0aXZlTm9uU2Vzc2lvbnNXaW5kb3coKTtcblx0XHRcdFx0aWYgKGVkaXRvcldpbmRvdykge1xuXHRcdFx0XHRcdHJldHVybiB7IHdpbmRvd1RvVXNlOiBlZGl0b3JXaW5kb3csIGZvcmNlTmV3V2luZG93OiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHdpbmRvd1RvVXNlOiB1bmRlZmluZWQsIGZvcmNlTmV3V2luZG93OiB0cnVlIH07IC8vIGRvIG5vdCByZXBsYWNlIHRoZSBhZ2VudHMgd2luZG93XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB3aW5kb3dUb1VzZTogY29udGV4dFdpbmRvdywgZm9yY2VOZXdXaW5kb3cgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgd2luZG93VG9Vc2U6IHVuZGVmaW5lZCwgZm9yY2VOZXdXaW5kb3cgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGFzdEFjdGl2ZU5vblNlc3Npb25zV2luZG93KCk6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kb0dldExhc3RBY3RpdmVXaW5kb3codGhpcy5nZXRXaW5kb3dzKCkuZmlsdGVyKHdpbmRvdyA9PiAhd2luZG93LmNvbmZpZz8uaXNTZXNzaW9uc1dpbmRvdykpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXNzaW9uc1dpbmRvd0ZvckZvbGRlckhhbmRvZmYob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdGlmIChvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG9wZW5Db25maWcuY29udGV4dFdpbmRvd0lkID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgY29udGV4dFdpbmRvdyA9IHRoaXMuZ2V0V2luZG93QnlJZChvcGVuQ29uZmlnLmNvbnRleHRXaW5kb3dJZCk7XG5cdFx0XHRpZiAoY29udGV4dFdpbmRvdz8uY29uZmlnPy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdHJldHVybiBjb250ZXh0V2luZG93O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRleHRXaW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbGFzdEFjdGl2ZVdpbmRvdyA9IHRoaXMuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXHRcdHJldHVybiBsYXN0QWN0aXZlV2luZG93Py5jb25maWc/LmlzU2Vzc2lvbnNXaW5kb3cgPyBsYXN0QWN0aXZlV2luZG93IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kb2ZmRm9sZGVyVG9TZXNzaW9uc1dpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93LCBmb2xkZXJVcmk6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnd2luZG93c01hbmFnZXIjaGFuZG9mZkZvbGRlclRvU2Vzc2lvbnNXaW5kb3cnLCB7IGZvbGRlclVyaTogZm9sZGVyVXJpLnRvU3RyaW5nKCksIHdpbmRvd0lkOiB3aW5kb3cuaWQgfSk7XG5cdFx0d2luZG93LmZvY3VzKCk7XG5cdFx0d2luZG93LnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpzZWxlY3RBZ2VudHNGb2xkZXInLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBmb2xkZXJVcmkudG9KU09OKCksIHVuZGVmaW5lZCwgQWdlbnRzV2luZG93T3BlblNvdXJjZS5Vbmtub3duKTtcblx0fVxuXG5cdHByaXZhdGUgZG9PcGVuRW1wdHkob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uLCBmb3JjZU5ld1dpbmRvdzogYm9vbGVhbiwgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGZpbGVzVG9PcGVuOiBJRmlsZXNUb09wZW4gfCB1bmRlZmluZWQsIGVtcHR5V2luZG93QmFja3VwSW5mbz86IElFbXB0eVdpbmRvd0JhY2t1cEluZm8pOiBQcm9taXNlPElDb2RlV2luZG93PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd3aW5kb3dzTWFuYWdlciNkb09wZW5FbXB0eScsIHsgcmVzdG9yZTogISFlbXB0eVdpbmRvd0JhY2t1cEluZm8sIHJlbW90ZUF1dGhvcml0eSwgZmlsZXNUb09wZW4sIGZvcmNlTmV3V2luZG93IH0pO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVDb250ZXh0V2luZG93KG9wZW5Db25maWcsIGZvcmNlTmV3V2luZG93KTtcblxuXHRcdHJldHVybiB0aGlzLm9wZW5JbkJyb3dzZXJXaW5kb3coe1xuXHRcdFx0dXNlckVudjogb3BlbkNvbmZpZy51c2VyRW52LFxuXHRcdFx0Y2xpOiBvcGVuQ29uZmlnLmNsaSxcblx0XHRcdGluaXRpYWxTdGFydHVwOiBvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0Zm9yY2VOZXdXaW5kb3c6IHJlc29sdmVkLmZvcmNlTmV3V2luZG93LFxuXHRcdFx0Zm9yY2VOZXdUYWJiZWRXaW5kb3c6IG9wZW5Db25maWcuZm9yY2VOZXdUYWJiZWRXaW5kb3csXG5cdFx0XHRmaWxlc1RvT3Blbixcblx0XHRcdHdpbmRvd1RvVXNlOiByZXNvbHZlZC53aW5kb3dUb1VzZSxcblx0XHRcdGVtcHR5V2luZG93QmFja3VwSW5mbyxcblx0XHRcdGZvcmNlUHJvZmlsZTogb3BlbkNvbmZpZy5mb3JjZVByb2ZpbGUsXG5cdFx0XHRmb3JjZVRlbXBQcm9maWxlOiBvcGVuQ29uZmlnLmZvcmNlVGVtcFByb2ZpbGVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9PcGVuRm9sZGVyT3JXb3Jrc3BhY2Uob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uLCBmb2xkZXJPcldvcmtzcGFjZTogSVdvcmtzcGFjZVBhdGhUb09wZW4gfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbiwgZm9yY2VOZXdXaW5kb3c6IGJvb2xlYW4sIGZpbGVzVG9PcGVuOiBJRmlsZXNUb09wZW4gfCB1bmRlZmluZWQsIHdpbmRvd1RvVXNlPzogSUNvZGVXaW5kb3cpOiBQcm9taXNlPElDb2RlV2luZG93PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd3aW5kb3dzTWFuYWdlciNkb09wZW5Gb2xkZXJPcldvcmtzcGFjZScsIHsgZm9sZGVyT3JXb3Jrc3BhY2UsIGZpbGVzVG9PcGVuIH0pO1xuXG5cdFx0aWYgKCF3aW5kb3dUb1VzZSAmJiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW4oZm9sZGVyT3JXb3Jrc3BhY2UpKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uc1dpbmRvdyA9IHRoaXMuZ2V0U2Vzc2lvbnNXaW5kb3dGb3JGb2xkZXJIYW5kb2ZmKG9wZW5Db25maWcpO1xuXHRcdFx0aWYgKHNlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdHRoaXMuaGFuZG9mZkZvbGRlclRvU2Vzc2lvbnNXaW5kb3coc2Vzc2lvbnNXaW5kb3csIGZvbGRlck9yV29ya3NwYWNlLndvcmtzcGFjZS51cmkpO1xuXHRcdFx0XHRpZiAoZmlsZXNUb09wZW4pIHtcblx0XHRcdFx0XHR0aGlzLmRvT3BlbkZpbGVzSW5FeGlzdGluZ1dpbmRvdyhvcGVuQ29uZmlnLCBzZXNzaW9uc1dpbmRvdywgZmlsZXNUb09wZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc2Vzc2lvbnNXaW5kb3cpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghd2luZG93VG9Vc2UpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQ29udGV4dFdpbmRvdyhvcGVuQ29uZmlnLCBmb3JjZU5ld1dpbmRvdyk7XG5cdFx0XHR3aW5kb3dUb1VzZSA9IHJlc29sdmVkLndpbmRvd1RvVXNlO1xuXHRcdFx0Zm9yY2VOZXdXaW5kb3cgPSByZXNvbHZlZC5mb3JjZU5ld1dpbmRvdztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5vcGVuSW5Ccm93c2VyV2luZG93KHtcblx0XHRcdHdvcmtzcGFjZTogZm9sZGVyT3JXb3Jrc3BhY2Uud29ya3NwYWNlLFxuXHRcdFx0dXNlckVudjogb3BlbkNvbmZpZy51c2VyRW52LFxuXHRcdFx0Y2xpOiBvcGVuQ29uZmlnLmNsaSxcblx0XHRcdGluaXRpYWxTdGFydHVwOiBvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBmb2xkZXJPcldvcmtzcGFjZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRmb3JjZU5ld1dpbmRvdyxcblx0XHRcdGZvcmNlTmV3VGFiYmVkV2luZG93OiBvcGVuQ29uZmlnLmZvcmNlTmV3VGFiYmVkV2luZG93LFxuXHRcdFx0ZmlsZXNUb09wZW4sXG5cdFx0XHR3aW5kb3dUb1VzZSxcblx0XHRcdGZvcmNlUHJvZmlsZTogb3BlbkNvbmZpZy5mb3JjZVByb2ZpbGUsXG5cdFx0XHRmb3JjZVRlbXBQcm9maWxlOiBvcGVuQ29uZmlnLmZvcmNlVGVtcFByb2ZpbGVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UGF0aHNUb09wZW4ob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uKTogUHJvbWlzZTxJUGF0aFRvT3BlbltdPiB7XG5cdFx0bGV0IHBhdGhzVG9PcGVuOiBJUGF0aFRvT3BlbltdO1xuXHRcdGxldCBpc0NvbW1hbmRMaW5lT3JBUElDYWxsID0gZmFsc2U7XG5cdFx0bGV0IGlzUmVzdG9yaW5nUGF0aHMgPSBmYWxzZTtcblxuXHRcdC8vIEV4dHJhY3QgcGF0aHM6IGZyb20gQVBJXG5cdFx0aWYgKG9wZW5Db25maWcudXJpc1RvT3BlbiAmJiBvcGVuQ29uZmlnLnVyaXNUb09wZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0cGF0aHNUb09wZW4gPSBhd2FpdCB0aGlzLmRvRXh0cmFjdFBhdGhzRnJvbUFQSShvcGVuQ29uZmlnKTtcblx0XHRcdGlzQ29tbWFuZExpbmVPckFQSUNhbGwgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBmb3JjZSBlbXB0eVxuXHRcdGVsc2UgaWYgKG9wZW5Db25maWcuZm9yY2VFbXB0eSkge1xuXHRcdFx0cGF0aHNUb09wZW4gPSBbRU1QVFlfV0lORE9XXTtcblx0XHR9XG5cblx0XHQvLyBFeHRyYWN0IHBhdGhzOiBmcm9tIENMSVxuXHRcdGVsc2UgaWYgKG9wZW5Db25maWcuY2xpLl8ubGVuZ3RoIHx8IG9wZW5Db25maWcuY2xpWydmb2xkZXItdXJpJ10gfHwgb3BlbkNvbmZpZy5jbGlbJ2ZpbGUtdXJpJ10pIHtcblx0XHRcdHBhdGhzVG9PcGVuID0gYXdhaXQgdGhpcy5kb0V4dHJhY3RQYXRoc0Zyb21DTEkob3BlbkNvbmZpZy5jbGkpO1xuXHRcdFx0aWYgKHBhdGhzVG9PcGVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRwYXRoc1RvT3Blbi5wdXNoKEVNUFRZX1dJTkRPVyk7IC8vIGFkZCBhbiBlbXB0eSB3aW5kb3cgaWYgd2UgZGlkIG5vdCBoYXZlIHdpbmRvd3MgdG8gb3BlbiBmcm9tIGNvbW1hbmQgbGluZVxuXHRcdFx0fVxuXG5cdFx0XHRpc0NvbW1hbmRMaW5lT3JBUElDYWxsID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBFeHRyYWN0IHBhdGhzOiBmcm9tIHByZXZpb3VzIHNlc3Npb25cblx0XHRlbHNlIHtcblx0XHRcdHBhdGhzVG9PcGVuID0gYXdhaXQgdGhpcy5kb0dldFBhdGhzRnJvbUxhc3RTZXNzaW9uKCk7XG5cdFx0XHRpZiAocGF0aHNUb09wZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHBhdGhzVG9PcGVuLnB1c2goRU1QVFlfV0lORE9XKTsgLy8gYWRkIGFuIGVtcHR5IHdpbmRvdyBpZiB3ZSBkaWQgbm90IGhhdmUgd2luZG93cyB0byByZXN0b3JlXG5cdFx0XHR9XG5cblx0XHRcdGlzUmVzdG9yaW5nUGF0aHMgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSB0aGUgY2FzZSBvZiBtdWx0aXBsZSBmb2xkZXJzIGJlaW5nIG9wZW5lZCBmcm9tIENMSSB3aGlsZSB3ZSBhcmVcblx0XHQvLyBub3QgaW4gYC0tYWRkYCBvciBgLS1yZW1vdmVgIG1vZGUgYnkgY3JlYXRpbmcgYW4gdW50aXRsZWQgd29ya3NwYWNlLCBvbmx5IGlmOlxuXHRcdC8vIC0gdGhleSBhbGwgc2hhcmUgdGhlIHNhbWUgcmVtb3RlIGF1dGhvcml0eVxuXHRcdC8vIC0gdGhlcmUgaXMgbm8gZXhpc3Rpbmcgd29ya3NwYWNlIHRvIG9wZW4gdGhhdCBtYXRjaGVzIHRoZXNlIGZvbGRlcnNcblx0XHRpZiAoIW9wZW5Db25maWcuYWRkTW9kZSAmJiAhb3BlbkNvbmZpZy5yZW1vdmVNb2RlICYmIGlzQ29tbWFuZExpbmVPckFQSUNhbGwpIHtcblx0XHRcdGNvbnN0IGZvbGRlcnNUb09wZW4gPSBwYXRoc1RvT3Blbi5maWx0ZXIocGF0aCA9PiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW4ocGF0aCkpO1xuXHRcdFx0aWYgKGZvbGRlcnNUb09wZW4ubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSBmb2xkZXJzVG9PcGVuWzBdLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdFx0aWYgKGZvbGRlcnNUb09wZW4uZXZlcnkoZm9sZGVyVG9PcGVuID0+IGlzRXF1YWxBdXRob3JpdHkoZm9sZGVyVG9PcGVuLnJlbW90ZUF1dGhvcml0eSwgcmVtb3RlQXV0aG9yaXR5KSkpIHtcblx0XHRcdFx0XHRsZXQgd29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGNvbnN0IGxhc3RTZXNzaW9uV29ya3NwYWNlTWF0Y2hpbmdGb2xkZXJzID0gYXdhaXQgdGhpcy5kb0dldFdvcmtzcGFjZU1hdGNoaW5nRm9sZGVyc0Zyb21MYXN0U2Vzc2lvbihyZW1vdGVBdXRob3JpdHksIGZvbGRlcnNUb09wZW4pO1xuXHRcdFx0XHRcdGlmIChsYXN0U2Vzc2lvbldvcmtzcGFjZU1hdGNoaW5nRm9sZGVycykge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlID0gbGFzdFNlc3Npb25Xb3Jrc3BhY2VNYXRjaGluZ0ZvbGRlcnM7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5jcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShmb2xkZXJzVG9PcGVuLm1hcChmb2xkZXIgPT4gKHsgdXJpOiBmb2xkZXIud29ya3NwYWNlLnVyaSB9KSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEFkZCB3b3Jrc3BhY2UgYW5kIHJlbW92ZSBmb2xkZXJzIHRoZXJlYnlcblx0XHRcdFx0XHRwYXRoc1RvT3Blbi5wdXNoKHsgd29ya3NwYWNlLCByZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0XHRcdFx0cGF0aHNUb09wZW4gPSBwYXRoc1RvT3Blbi5maWx0ZXIocGF0aCA9PiAhaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBgd2luZG93LnJlc3RvcmVXaW5kb3dzYCBzZXR0aW5nIHRvIGluY2x1ZGUgYWxsIHdpbmRvd3Ncblx0XHQvLyBmcm9tIHRoZSBwcmV2aW91cyBzZXNzaW9uIGlmIHRoaXMgaXMgdGhlIGluaXRpYWwgc3RhcnR1cCBhbmQgd2UgaGF2ZVxuXHRcdC8vIG5vdCByZXN0b3JlZCB3aW5kb3dzIGFscmVhZHkgb3RoZXJ3aXNlLlxuXHRcdC8vIFVzZSBgdW5zaGlmdGAgdG8gZW5zdXJlIGFueSBuZXcgd2luZG93IHRvIG9wZW4gY29tZXMgbGFzdCBmb3IgcHJvcGVyXG5cdFx0Ly8gZm9jdXMgdHJlYXRtZW50LlxuXHRcdGlmIChvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwICYmICFpc1Jlc3RvcmluZ1BhdGhzICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk/LnJlc3RvcmVXaW5kb3dzID09PSAncHJlc2VydmUnKSB7XG5cdFx0XHRjb25zdCBsYXN0U2Vzc2lvblBhdGhzID0gYXdhaXQgdGhpcy5kb0dldFBhdGhzRnJvbUxhc3RTZXNzaW9uKCk7XG5cdFx0XHRwYXRoc1RvT3Blbi51bnNoaWZ0KC4uLmxhc3RTZXNzaW9uUGF0aHMuZmlsdGVyKHBhdGggPT4gaXNXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGgpIHx8IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoKSB8fCBwYXRoLmJhY2t1cFBhdGgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0aHNUb09wZW47XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRXh0cmFjdFBhdGhzRnJvbUFQSShvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElQYXRoVG9PcGVuW10+IHtcblx0XHRjb25zdCBwYXRoUmVzb2x2ZU9wdGlvbnM6IElQYXRoUmVzb2x2ZU9wdGlvbnMgPSB7XG5cdFx0XHRnb3RvTGluZU1vZGU6IG9wZW5Db25maWcuZ290b0xpbmVNb2RlLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBvcGVuQ29uZmlnLnJlbW90ZUF1dGhvcml0eVxuXHRcdH07XG5cblx0XHRjb25zdCBwYXRoc1RvT3BlbiA9IGF3YWl0IFByb21pc2UuYWxsKGNvYWxlc2NlKG9wZW5Db25maWcudXJpc1RvT3BlbiB8fCBbXSkubWFwKGFzeW5jIHBhdGhUb09wZW4gPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IGF3YWl0IHRoaXMucmVzb2x2ZU9wZW5hYmxlKHBhdGhUb09wZW4sIHBhdGhSZXNvbHZlT3B0aW9ucyk7XG5cblx0XHRcdC8vIFBhdGggZXhpc3RzXG5cdFx0XHRpZiAocGF0aCkge1xuXHRcdFx0XHRwYXRoLmxhYmVsID0gcGF0aFRvT3Blbi5sYWJlbDtcblxuXHRcdFx0XHRyZXR1cm4gcGF0aDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUGF0aCBkb2VzIG5vdCBleGlzdDogc2hvdyBhIHdhcm5pbmcgYm94XG5cdFx0XHRjb25zdCB1cmkgPSB0aGlzLnJlc291cmNlRnJvbU9wZW5hYmxlKHBhdGhUb09wZW4pO1xuXG5cdFx0XHR0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRidXR0b25zOiBbbG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpXSxcblx0XHRcdFx0bWVzc2FnZTogdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gbG9jYWxpemUoJ3BhdGhOb3RFeGlzdFRpdGxlJywgXCJQYXRoIGRvZXMgbm90IGV4aXN0XCIpIDogbG9jYWxpemUoJ3VyaUludmFsaWRUaXRsZScsIFwiVVJJIGNhbiBub3QgYmUgb3BlbmVkXCIpLFxuXHRcdFx0XHRkZXRhaWw6IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3BhdGhOb3RFeGlzdERldGFpbCcsIFwiVGhlIHBhdGggJ3swfScgZG9lcyBub3QgZXhpc3Qgb24gdGhpcyBjb21wdXRlci5cIiwgZ2V0UGF0aExhYmVsKHVyaSwgeyBvczogT1MsIHRpbGRpZnk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSB9KSkgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCd1cmlJbnZhbGlkRGV0YWlsJywgXCJUaGUgVVJJICd7MH0nIGlzIG5vdCB2YWxpZCBhbmQgY2FuIG5vdCBiZSBvcGVuZWQuXCIsIHVyaS50b1N0cmluZyh0cnVlKSlcblx0XHRcdH0sIEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdygpID8/IHVuZGVmaW5lZCk7XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGNvYWxlc2NlKHBhdGhzVG9PcGVuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9FeHRyYWN0UGF0aHNGcm9tQ0xJKGNsaTogTmF0aXZlUGFyc2VkQXJncyk6IFByb21pc2U8SVBhdGhbXT4ge1xuXHRcdGNvbnN0IHBhdGhzVG9PcGVuOiBJUGF0aFRvT3BlbltdID0gW107XG5cdFx0Y29uc3QgcGF0aFJlc29sdmVPcHRpb25zOiBJUGF0aFJlc29sdmVPcHRpb25zID0ge1xuXHRcdFx0aWdub3JlRmlsZU5vdEZvdW5kOiB0cnVlLFxuXHRcdFx0Z290b0xpbmVNb2RlOiBjbGkuZ290byxcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogY2xpLnJlbW90ZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRmb3JjZU9wZW5Xb3Jrc3BhY2VBc0ZpbGU6XG5cdFx0XHRcdC8vIHNwZWNpYWwgY2FzZSBkaWZmIC8gbWVyZ2UgbW9kZSB0byBmb3JjZSBvcGVuXG5cdFx0XHRcdC8vIHdvcmtzcGFjZSBhcyBmaWxlXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDk3MzFcblx0XHRcdFx0Y2xpLmRpZmYgJiYgY2xpLl8ubGVuZ3RoID09PSAyIHx8XG5cdFx0XHRcdGNsaS5tZXJnZSAmJiBjbGkuXy5sZW5ndGggPT09IDRcblx0XHR9O1xuXG5cdFx0Ly8gZm9sZGVyIHVyaXNcblx0XHRjb25zdCBmb2xkZXJVcmlzID0gY2xpWydmb2xkZXItdXJpJ107XG5cdFx0aWYgKGZvbGRlclVyaXMpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkRm9sZGVyVXJpcyA9IGF3YWl0IFByb21pc2UuYWxsKGZvbGRlclVyaXMubWFwKHJhd0ZvbGRlclVyaSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHRoaXMuY2xpQXJnVG9VcmkocmF3Rm9sZGVyVXJpKTtcblx0XHRcdFx0aWYgKCFmb2xkZXJVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZU9wZW5hYmxlKHsgZm9sZGVyVXJpIH0sIHBhdGhSZXNvbHZlT3B0aW9ucyk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHBhdGhzVG9PcGVuLnB1c2goLi4uY29hbGVzY2UocmVzb2x2ZWRGb2xkZXJVcmlzKSk7XG5cdFx0fVxuXG5cdFx0Ly8gZmlsZSB1cmlzXG5cdFx0Y29uc3QgZmlsZVVyaXMgPSBjbGlbJ2ZpbGUtdXJpJ107XG5cdFx0aWYgKGZpbGVVcmlzKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZEZpbGVVcmlzID0gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZVVyaXMubWFwKHJhd0ZpbGVVcmkgPT4ge1xuXHRcdFx0XHRjb25zdCBmaWxlVXJpID0gdGhpcy5jbGlBcmdUb1VyaShyYXdGaWxlVXJpKTtcblx0XHRcdFx0aWYgKCFmaWxlVXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVPcGVuYWJsZShoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKHJhd0ZpbGVVcmkpID8geyB3b3Jrc3BhY2VVcmk6IGZpbGVVcmkgfSA6IHsgZmlsZVVyaSB9LCBwYXRoUmVzb2x2ZU9wdGlvbnMpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRwYXRoc1RvT3Blbi5wdXNoKC4uLmNvYWxlc2NlKHJlc29sdmVkRmlsZVVyaXMpKTtcblx0XHR9XG5cblx0XHQvLyBmb2xkZXIgb3IgZmlsZSBwYXRoc1xuXHRcdGNvbnN0IHJlc29sdmVkQ2xpUGF0aHMgPSBhd2FpdCBQcm9taXNlLmFsbChjbGkuXy5tYXAoY2xpUGF0aCA9PiB7XG5cdFx0XHRyZXR1cm4gcGF0aFJlc29sdmVPcHRpb25zLnJlbW90ZUF1dGhvcml0eSA/IHRoaXMuZG9SZXNvbHZlUmVtb3RlUGF0aChjbGlQYXRoLCBwYXRoUmVzb2x2ZU9wdGlvbnMpIDogdGhpcy5kb1Jlc29sdmVGaWxlUGF0aChjbGlQYXRoLCBwYXRoUmVzb2x2ZU9wdGlvbnMpO1xuXHRcdH0pKTtcblxuXHRcdHBhdGhzVG9PcGVuLnB1c2goLi4uY29hbGVzY2UocmVzb2x2ZWRDbGlQYXRocykpO1xuXG5cdFx0cmV0dXJuIHBhdGhzVG9PcGVuO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGlBcmdUb1VyaShhcmc6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShhcmcpO1xuXHRcdFx0aWYgKCF1cmkuc2NoZW1lKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgSW52YWxpZCBVUkkgaW5wdXQgc3RyaW5nLCBzY2hlbWUgbWlzc2luZzogJHthcmd9YCk7XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICghdXJpLnBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIHVyaS53aXRoKHsgcGF0aDogJy8nIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgSW52YWxpZCBVUkkgaW5wdXQgc3RyaW5nOiAke2FyZ30sICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvR2V0UGF0aHNGcm9tTGFzdFNlc3Npb24oKTogUHJvbWlzZTxJUGF0aFRvT3BlbltdPiB7XG5cdFx0Y29uc3QgcmVzdG9yZVdpbmRvd3NTZXR0aW5nID0gdGhpcy5nZXRSZXN0b3JlV2luZG93c1NldHRpbmcoKTtcblxuXHRcdHN3aXRjaCAocmVzdG9yZVdpbmRvd3NTZXR0aW5nKSB7XG5cblx0XHRcdC8vIG5vbmU6IG5vIHdpbmRvdyB0byByZXN0b3JlXG5cdFx0XHRjYXNlICdub25lJzpcblx0XHRcdFx0cmV0dXJuIFtdO1xuXG5cdFx0XHQvLyBvbmU6IHJlc3RvcmUgbGFzdCBvcGVuZWQgd29ya3NwYWNlL2ZvbGRlciBvciBlbXB0eSB3aW5kb3dcblx0XHRcdC8vIGFsbDogcmVzdG9yZSBhbGwgd2luZG93c1xuXHRcdFx0Ly8gZm9sZGVyczogcmVzdG9yZSBsYXN0IG9wZW5lZCBmb2xkZXJzIG9ubHlcblx0XHRcdGNhc2UgJ29uZSc6XG5cdFx0XHRjYXNlICdhbGwnOlxuXHRcdFx0Y2FzZSAncHJlc2VydmUnOlxuXHRcdFx0Y2FzZSAnZm9sZGVycyc6IHtcblxuXHRcdFx0XHQvLyBDb2xsZWN0IHByZXZpb3VzbHkgb3BlbmVkIHdpbmRvd3Ncblx0XHRcdFx0Y29uc3QgbGFzdFNlc3Npb25XaW5kb3dzOiBJV2luZG93U3RhdGVbXSA9IFtdO1xuXHRcdFx0XHRpZiAocmVzdG9yZVdpbmRvd3NTZXR0aW5nICE9PSAnb25lJykge1xuXHRcdFx0XHRcdGxhc3RTZXNzaW9uV2luZG93cy5wdXNoKC4uLnRoaXMud2luZG93c1N0YXRlSGFuZGxlci5zdGF0ZS5vcGVuZWRXaW5kb3dzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy53aW5kb3dzU3RhdGVIYW5kbGVyLnN0YXRlLmxhc3RBY3RpdmVXaW5kb3cpIHtcblx0XHRcdFx0XHRsYXN0U2Vzc2lvbldpbmRvd3MucHVzaCh0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIuc3RhdGUubGFzdEFjdGl2ZVdpbmRvdyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwYXRoc1RvT3BlbiA9IGF3YWl0IFByb21pc2UuYWxsKGxhc3RTZXNzaW9uV2luZG93cy5tYXAoYXN5bmMgbGFzdFNlc3Npb25XaW5kb3cgPT4ge1xuXG5cdFx0XHRcdFx0Ly8gV29ya3NwYWNlc1xuXHRcdFx0XHRcdGlmIChsYXN0U2Vzc2lvbldpbmRvdy53b3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhdGhUb09wZW4gPSBhd2FpdCB0aGlzLnJlc29sdmVPcGVuYWJsZSh7IHdvcmtzcGFjZVVyaTogbGFzdFNlc3Npb25XaW5kb3cud29ya3NwYWNlLmNvbmZpZ1BhdGggfSwgeyByZW1vdGVBdXRob3JpdHk6IGxhc3RTZXNzaW9uV2luZG93LnJlbW90ZUF1dGhvcml0eSwgcmVqZWN0VHJhbnNpZW50V29ya3NwYWNlczogdHJ1ZSAvKiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE5Njk1ICovIH0pO1xuXHRcdFx0XHRcdFx0aWYgKGlzV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoVG9PcGVuKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcGF0aFRvT3Blbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBGb2xkZXJzXG5cdFx0XHRcdFx0ZWxzZSBpZiAobGFzdFNlc3Npb25XaW5kb3cuZm9sZGVyVXJpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoVG9PcGVuID0gYXdhaXQgdGhpcy5yZXNvbHZlT3BlbmFibGUoeyBmb2xkZXJVcmk6IGxhc3RTZXNzaW9uV2luZG93LmZvbGRlclVyaSB9LCB7IHJlbW90ZUF1dGhvcml0eTogbGFzdFNlc3Npb25XaW5kb3cucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHRcdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoVG9PcGVuKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcGF0aFRvT3Blbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBFbXB0eSB3aW5kb3csIHBvdGVudGlhbGx5IGVkaXRvcnMgb3BlbiB0byBiZSByZXN0b3JlZFxuXHRcdFx0XHRcdGVsc2UgaWYgKHJlc3RvcmVXaW5kb3dzU2V0dGluZyAhPT0gJ2ZvbGRlcnMnICYmIGxhc3RTZXNzaW9uV2luZG93LmJhY2t1cFBhdGgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGJhY2t1cFBhdGg6IGxhc3RTZXNzaW9uV2luZG93LmJhY2t1cFBhdGgsIHJlbW90ZUF1dGhvcml0eTogbGFzdFNlc3Npb25XaW5kb3cucmVtb3RlQXV0aG9yaXR5IH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHJldHVybiBjb2FsZXNjZShwYXRoc1RvT3Blbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXN0b3JlV2luZG93c1NldHRpbmcoKTogUmVzdG9yZVdpbmRvd3NTZXR0aW5nIHtcblx0XHRsZXQgcmVzdG9yZVdpbmRvd3M6IFJlc3RvcmVXaW5kb3dzU2V0dGluZztcblx0XHRpZiAodGhpcy5saWZlY3ljbGVNYWluU2VydmljZS53YXNSZXN0YXJ0ZWQpIHtcblx0XHRcdHJlc3RvcmVXaW5kb3dzID0gJ2FsbCc7IC8vIGFsd2F5cyByZW9wZW4gYWxsIHdpbmRvd3Mgd2hlbiBhbiB1cGRhdGUgd2FzIGFwcGxpZWRcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgd2luZG93Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblx0XHRcdHJlc3RvcmVXaW5kb3dzID0gd2luZG93Q29uZmlnPy5yZXN0b3JlV2luZG93cyB8fCAnYWxsJzsgLy8gYnkgZGVmYXVsdCByZXN0b3JlIGFsbCB3aW5kb3dzXG5cblx0XHRcdGlmICghWydwcmVzZXJ2ZScsICdhbGwnLCAnZm9sZGVycycsICdvbmUnLCAnbm9uZSddLmluY2x1ZGVzKHJlc3RvcmVXaW5kb3dzKSkge1xuXHRcdFx0XHRyZXN0b3JlV2luZG93cyA9ICdhbGwnOyAvLyBieSBkZWZhdWx0IHJlc3RvcmUgYWxsIHdpbmRvd3Ncblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdG9yZVdpbmRvd3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvR2V0V29ya3NwYWNlTWF0Y2hpbmdGb2xkZXJzRnJvbUxhc3RTZXNzaW9uKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkLCBmb2xkZXJzOiBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbltdKTogUHJvbWlzZTxJV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZXMgPSAoYXdhaXQgdGhpcy5kb0dldFBhdGhzRnJvbUxhc3RTZXNzaW9uKCkpLmZpbHRlcihwYXRoID0+IGlzV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoKSk7XG5cdFx0Y29uc3QgZm9sZGVyVXJpcyA9IGZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIud29ya3NwYWNlLnVyaSk7XG5cblx0XHRmb3IgKGNvbnN0IHsgd29ya3NwYWNlIH0gb2Ygd29ya3NwYWNlcykge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRXb3Jrc3BhY2UgPSBhd2FpdCB0aGlzLndvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHRcdGlmIChcblx0XHRcdFx0IXJlc29sdmVkV29ya3NwYWNlIHx8XG5cdFx0XHRcdHJlc29sdmVkV29ya3NwYWNlLnJlbW90ZUF1dGhvcml0eSAhPT0gcmVtb3RlQXV0aG9yaXR5IHx8XG5cdFx0XHRcdHJlc29sdmVkV29ya3NwYWNlLnRyYW5zaWVudCB8fFxuXHRcdFx0XHRyZXNvbHZlZFdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCAhPT0gZm9sZGVycy5sZW5ndGhcblx0XHRcdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9sZGVyU2V0ID0gbmV3IFJlc291cmNlU2V0KGZvbGRlclVyaXMsIHVyaSA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHRcdFx0aWYgKHJlc29sdmVkV29ya3NwYWNlLmZvbGRlcnMuZXZlcnkoZm9sZGVyID0+IGZvbGRlclNldC5oYXMoZm9sZGVyLnVyaSkpKSB7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlZFdvcmtzcGFjZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlT3BlbmFibGUob3BlbmFibGU6IElXaW5kb3dPcGVuYWJsZSwgb3B0aW9uczogSVBhdGhSZXNvbHZlT3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBQcm9taXNlPElQYXRoVG9PcGVuIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBoYW5kbGUgZmlsZTovLyBvcGVuYWJsZXMgd2l0aCBzb21lIGV4dHJhIHZhbGlkYXRpb25cblx0XHRjb25zdCB1cmkgPSB0aGlzLnJlc291cmNlRnJvbU9wZW5hYmxlKG9wZW5hYmxlKTtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRpZiAoaXNGaWxlVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBmb3JjZU9wZW5Xb3Jrc3BhY2VBc0ZpbGU6IHRydWUgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuZG9SZXNvbHZlRmlsZVBhdGgodXJpLmZzUGF0aCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIG5vbiBmaWxlOi8vIG9wZW5hYmxlc1xuXHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZVJlbW90ZU9wZW5hYmxlKG9wZW5hYmxlLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZXNvbHZlUmVtb3RlT3BlbmFibGUob3BlbmFibGU6IElXaW5kb3dPcGVuYWJsZSwgb3B0aW9uczogSVBhdGhSZXNvbHZlT3B0aW9ucyk6IElQYXRoVG9PcGVuPElUZXh0RWRpdG9yT3B0aW9ucz4gfCB1bmRlZmluZWQge1xuXHRcdGxldCB1cmkgPSB0aGlzLnJlc291cmNlRnJvbU9wZW5hYmxlKG9wZW5hYmxlKTtcblxuXHRcdC8vIHVzZSByZW1vdGUgYXV0aG9yaXR5IGZyb20gdnNjb2RlXG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gZ2V0UmVtb3RlQXV0aG9yaXR5KHVyaSkgfHwgb3B0aW9ucy5yZW1vdGVBdXRob3JpdHk7XG5cblx0XHQvLyBub3JtYWxpemUgVVJJXG5cdFx0dXJpID0gcmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yKG5vcm1hbGl6ZVBhdGgodXJpKSk7XG5cblx0XHQvLyBGaWxlXG5cdFx0aWYgKGlzRmlsZVRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdGlmIChvcHRpb25zLmdvdG9MaW5lTW9kZSkge1xuXHRcdFx0XHRjb25zdCB7IHBhdGgsIGxpbmUsIGNvbHVtbiB9ID0gcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUodXJpLnBhdGgpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZmlsZVVyaTogdXJpLndpdGgoeyBwYXRoIH0pLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjogbGluZSA/IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lLCBzdGFydENvbHVtbjogY29sdW1uIHx8IDEgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGZpbGVVcmk6IHVyaSwgcmVtb3RlQXV0aG9yaXR5IH07XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlXG5cdFx0ZWxzZSBpZiAoaXNXb3Jrc3BhY2VUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRyZXR1cm4geyB3b3Jrc3BhY2U6IGdldFdvcmtzcGFjZUlkZW50aWZpZXIodXJpKSwgcmVtb3RlQXV0aG9yaXR5IH07XG5cdFx0fVxuXG5cdFx0Ly8gRm9sZGVyXG5cdFx0cmV0dXJuIHsgd29ya3NwYWNlOiBnZXRTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHVyaSksIHJlbW90ZUF1dGhvcml0eSB9O1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvdXJjZUZyb21PcGVuYWJsZShvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlKTogVVJJIHtcblx0XHRpZiAoaXNXb3Jrc3BhY2VUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRyZXR1cm4gb3BlbmFibGUud29ya3NwYWNlVXJpO1xuXHRcdH1cblxuXHRcdGlmIChpc0ZvbGRlclRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdHJldHVybiBvcGVuYWJsZS5mb2xkZXJVcmk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wZW5hYmxlLmZpbGVVcmk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUZpbGVQYXRoKHBhdGg6IHN0cmluZywgb3B0aW9uczogSVBhdGhSZXNvbHZlT3B0aW9ucywgc2tpcEhhbmRsZVVOQ0Vycm9yPzogYm9vbGVhbik6IFByb21pc2U8SVBhdGhUb09wZW48SVRleHRFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Ly8gRXh0cmFjdCBsaW5lL2NvbCBpbmZvcm1hdGlvbiBmcm9tIHBhdGhcblx0XHRsZXQgbGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjb2x1bW5OdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucy5nb3RvTGluZU1vZGUpIHtcblx0XHRcdCh7IHBhdGgsIGxpbmU6IGxpbmVOdW1iZXIsIGNvbHVtbjogY29sdW1uTnVtYmVyIH0gPSBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZShwYXRoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBwYXRoIGlzIG5vcm1hbGl6ZWQgYW5kIGFic29sdXRlXG5cdFx0cGF0aCA9IHNhbml0aXplRmlsZVBhdGgobm9ybWFsaXplKHBhdGgpLCBjd2QoKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGF0aFN0YXQgPSBhd2FpdCBmcy5wcm9taXNlcy5zdGF0KHBhdGgpO1xuXG5cdFx0XHQvLyBGaWxlXG5cdFx0XHRpZiAocGF0aFN0YXQuaXNGaWxlKCkpIHtcblxuXHRcdFx0XHQvLyBXb3Jrc3BhY2UgKHVubGVzcyBkaXNhYmxlZCB2aWEgZmxhZylcblx0XHRcdFx0aWYgKCFvcHRpb25zLmZvcmNlT3BlbldvcmtzcGFjZUFzRmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2UoVVJJLmZpbGUocGF0aCkpO1xuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblxuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHdvcmtzcGFjZSBpcyB0cmFuc2llbnQgYW5kIHdlIGFyZSB0byBpZ25vcmVcblx0XHRcdFx0XHRcdC8vIHRyYW5zaWVudCB3b3Jrc3BhY2VzLCByZWplY3QgaXQuXG5cdFx0XHRcdFx0XHRpZiAod29ya3NwYWNlLnRyYW5zaWVudCAmJiBvcHRpb25zLnJlamVjdFRyYW5zaWVudFdvcmtzcGFjZXMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0d29ya3NwYWNlOiB7IGlkOiB3b3Jrc3BhY2UuaWQsIGNvbmZpZ1BhdGg6IHdvcmtzcGFjZS5jb25maWdQYXRoIH0sXG5cdFx0XHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0XHRcdGV4aXN0czogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB3b3Jrc3BhY2UucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRcdFx0XHR0cmFuc2llbnQ6IHdvcmtzcGFjZS50cmFuc2llbnRcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmaWxlVXJpOiBVUkkuZmlsZShwYXRoKSxcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRcdGV4aXN0czogdHJ1ZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb246IGxpbmVOdW1iZXIgPyB7IHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlciwgc3RhcnRDb2x1bW46IGNvbHVtbk51bWJlciB8fCAxIH0gOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvbGRlclxuXHRcdFx0ZWxzZSBpZiAocGF0aFN0YXQuaXNEaXJlY3RvcnkoKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHdvcmtzcGFjZTogZ2V0U2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcihVUkkuZmlsZShwYXRoKSwgcGF0aFN0YXQpLFxuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkRpcmVjdG9yeSxcblx0XHRcdFx0XHRleGlzdHM6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3BlY2lhbCBkZXZpY2U6IGluIFBPU0lYIGVudmlyb25tZW50cywgd2UgbWF5IGdldCAvZGV2L251bGwgcGFzc2VkXG5cdFx0XHQvLyBpbiAoZm9yIGV4YW1wbGUgZ2l0IHVzZXMgaXQgdG8gc2lnbmFsIG9uZSBzaWRlIG9mIGEgZGlmZiBkb2VzIG5vdFxuXHRcdFx0Ly8gZXhpc3QpLiBJbiB0aGF0IHNwZWNpYWwgY2FzZSwgdHJlYXQgaXQgbGlrZSBhIGZpbGUgdG8gc3VwcG9ydCB0aGlzXG5cdFx0XHQvLyBzY2VuYXJpbyAoKVxuXHRcdFx0ZWxzZSBpZiAoIWlzV2luZG93cyAmJiBwYXRoID09PSAnL2Rldi9udWxsJykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZpbGVVcmk6IFVSSS5maWxlKHBhdGgpLFxuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0ZXhpc3RzOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0aWYgKGVycm9yLmNvZGUgPT09ICdFUlJfVU5DX0hPU1RfTk9UX0FMTE9XRUQnICYmICFza2lwSGFuZGxlVU5DRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMub25VTkNIb3N0Tm90QWxsb3dlZChwYXRoLCBvcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKHBhdGgpO1xuXG5cdFx0XHQvLyBzaW5jZSBmaWxlIGRvZXMgbm90IHNlZW0gdG8gZXhpc3QgYW55bW9yZSwgcmVtb3ZlIGZyb20gcmVjZW50XG5cdFx0XHR0aGlzLndvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UucmVtb3ZlUmVjZW50bHlPcGVuZWQoW2ZpbGVVcmldKTtcblxuXHRcdFx0Ly8gYXNzdW1lIHRoaXMgaXMgYSBmaWxlIHRoYXQgZG9lcyBub3QgeWV0IGV4aXN0XG5cdFx0XHRpZiAob3B0aW9ucy5pZ25vcmVGaWxlTm90Rm91bmQgJiYgZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmaWxlVXJpLFxuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0ZXhpc3RzOiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEludmFsaWQgcGF0aCBwcm92aWRlZDogJHtwYXRofSwgJHtlcnJvci5tZXNzYWdlfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uVU5DSG9zdE5vdEFsbG93ZWQocGF0aDogc3RyaW5nLCBvcHRpb25zOiBJUGF0aFJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJUGF0aFRvT3BlbjxJVGV4dEVkaXRvck9wdGlvbnM+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUocGF0aCk7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ2FsbG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQWxsb3dcIiksXG5cdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnY2FuY2VsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2FuY2VsXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ2xlYXJuTW9yZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkxlYXJuIE1vcmVcIiksXG5cdFx0XHRdLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1PcGVuTWVzc2FnZScsIFwiVGhlIGhvc3QgJ3swfScgd2FzIG5vdCBmb3VuZCBpbiB0aGUgbGlzdCBvZiBhbGxvd2VkIGhvc3RzLiBEbyB5b3Ugd2FudCB0byBhbGxvdyBpdCBhbnl3YXk/XCIsIHVyaS5hdXRob3JpdHkpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybU9wZW5EZXRhaWwnLCBcIlRoZSBwYXRoICd7MH0nIHVzZXMgYSBob3N0IHRoYXQgaXMgbm90IGFsbG93ZWQuIFVubGVzcyB5b3UgdHJ1c3QgdGhlIGhvc3QsIHlvdSBzaG91bGQgcHJlc3MgJ0NhbmNlbCdcIiwgZ2V0UGF0aExhYmVsKHVyaSwgeyBvczogT1MsIHRpbGRpZnk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSB9KSksXG5cdFx0XHRjaGVja2JveExhYmVsOiBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbicsIFwiUGVybWFuZW50bHkgYWxsb3cgaG9zdCAnezB9J1wiLCB1cmkuYXV0aG9yaXR5KSxcblx0XHRcdGNhbmNlbElkOiAxXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzcG9uc2UgPT09IDApIHtcblx0XHRcdGFkZFVOQ0hvc3RUb0FsbG93bGlzdCh1cmkuYXV0aG9yaXR5KTtcblxuXHRcdFx0aWYgKGNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHQvLyBEdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5NTQzNiwgd2UgY2FuIG9ubHlcblx0XHRcdFx0Ly8gdXBkYXRlIHNldHRpbmdzIGZyb20gd2l0aGluIGEgd2luZG93LiBCdXQgd2UgZG8gbm90IGtub3cgaWYgYSB3aW5kb3dcblx0XHRcdFx0Ly8gaXMgYWJvdXQgdG8gb3BlbiBvciBjYW4gYWxyZWFkeSBoYW5kbGUgdGhlIHJlcXVlc3QsIHNvIHdlIGhhdmUgdG8gc2VuZFxuXHRcdFx0XHQvLyB0byBhbnkgY3VycmVudCB3aW5kb3cgYW5kIGFueSBuZXdseSBvcGVuaW5nIHdpbmRvdy5cblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHsgY2hhbm5lbDogJ3ZzY29kZTpjb25maWd1cmVBbGxvd2VkVU5DSG9zdCcsIGFyZ3M6IHVyaS5hdXRob3JpdHkgfTtcblx0XHRcdFx0dGhpcy5zZW5kVG9Gb2N1c2VkKHJlcXVlc3QuY2hhbm5lbCwgcmVxdWVzdC5hcmdzKTtcblx0XHRcdFx0dGhpcy5zZW5kVG9PcGVuaW5nV2luZG93KHJlcXVlc3QuY2hhbm5lbCwgcmVxdWVzdC5hcmdzKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuZG9SZXNvbHZlRmlsZVBhdGgocGF0aCwgb3B0aW9ucywgdHJ1ZSAvKiBkbyBub3QgaGFuZGxlIFVOQyBlcnJvciBhZ2FpbiAqLyk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3BvbnNlID09PSAyKSB7XG5cdFx0XHRzaGVsbC5vcGVuRXh0ZXJuYWwoJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS13aW5kb3dzLXVuYycpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5vblVOQ0hvc3ROb3RBbGxvd2VkKHBhdGgsIG9wdGlvbnMpOyAvLyBrZWVwIHNob3dpbmcgdGhlIGRpYWxvZyB1bnRpbCBkZWNpc2lvbiAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE4MTk1Nilcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Jlc29sdmVSZW1vdGVQYXRoKHBhdGg6IHN0cmluZywgb3B0aW9uczogSVBhdGhSZXNvbHZlT3B0aW9ucyk6IElQYXRoVG9PcGVuPElUZXh0RWRpdG9yT3B0aW9ucz4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZpcnN0ID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5O1xuXG5cdFx0Ly8gRXh0cmFjdCBsaW5lL2NvbCBpbmZvcm1hdGlvbiBmcm9tIHBhdGhcblx0XHRsZXQgbGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjb2x1bW5OdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChvcHRpb25zLmdvdG9MaW5lTW9kZSkge1xuXHRcdFx0KHsgcGF0aCwgbGluZTogbGluZU51bWJlciwgY29sdW1uOiBjb2x1bW5OdW1iZXIgfSA9IHBhcnNlTGluZUFuZENvbHVtbkF3YXJlKHBhdGgpKTtcblx0XHR9XG5cblx0XHQvLyBtYWtlIGFic29sdXRlXG5cdFx0aWYgKGZpcnN0ICE9PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0aWYgKGlzV2luZG93c0RyaXZlTGV0dGVyKGZpcnN0KSAmJiBwYXRoLmNoYXJDb2RlQXQocGF0aC5jaGFyQ29kZUF0KDEpKSA9PT0gQ2hhckNvZGUuQ29sb24pIHtcblx0XHRcdFx0cGF0aCA9IHRvU2xhc2hlcyhwYXRoKTtcblx0XHRcdH1cblxuXHRcdFx0cGF0aCA9IGAvJHtwYXRofWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogcGF0aCB9KTtcblxuXHRcdC8vIGd1ZXNzIHRoZSBmaWxlIHR5cGU6XG5cdFx0Ly8gLSBpZiBpdCBlbmRzIHdpdGggYSBzbGFzaCBpdCdzIGEgZm9sZGVyXG5cdFx0Ly8gLSBpZiBpbiBnb3RvIGxpbmUgbW9kZSBvciBpZiBpdCBoYXMgYSBmaWxlIGV4dGVuc2lvbiwgaXQncyBhIGZpbGUgb3IgYSB3b3Jrc3BhY2Vcblx0XHQvLyAtIGJ5IGRlZmF1bHRzIGl0J3MgYSBmb2xkZXJcblx0XHRpZiAocGF0aC5jaGFyQ29kZUF0KHBhdGgubGVuZ3RoIC0gMSkgIT09IENoYXJDb2RlLlNsYXNoKSB7XG5cblx0XHRcdC8vIGZpbGUgbmFtZSBlbmRzIHdpdGggLmNvZGUtd29ya3NwYWNlXG5cdFx0XHRpZiAoaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbihwYXRoKSkge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5mb3JjZU9wZW5Xb3Jrc3BhY2VBc0ZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZmlsZVVyaTogdXJpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb246IGxpbmVOdW1iZXIgPyB7IHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlciwgc3RhcnRDb2x1bW46IGNvbHVtbk51bWJlciB8fCAxIH0gOiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IHdvcmtzcGFjZTogZ2V0V29ya3NwYWNlSWRlbnRpZmllcih1cmkpLCByZW1vdGVBdXRob3JpdHkgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZmlsZSBuYW1lIHN0YXJ0cyB3aXRoIGEgZG90IG9yIGhhcyBhbiBmaWxlIGV4dGVuc2lvblxuXHRcdFx0ZWxzZSBpZiAob3B0aW9ucy5nb3RvTGluZU1vZGUgfHwgcG9zaXguYmFzZW5hbWUocGF0aCkuaW5kZXhPZignLicpICE9PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZpbGVVcmk6IHVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb246IGxpbmVOdW1iZXIgPyB7IHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlciwgc3RhcnRDb2x1bW46IGNvbHVtbk51bWJlciB8fCAxIH0gOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHdvcmtzcGFjZTogZ2V0U2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih1cmkpLCByZW1vdGVBdXRob3JpdHkgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkT3Blbk5ld1dpbmRvdyhvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24pOiB7IG9wZW5Gb2xkZXJJbk5ld1dpbmRvdzogYm9vbGVhbjsgb3BlbkZpbGVzSW5OZXdXaW5kb3c6IGJvb2xlYW4gfSB7XG5cblx0XHQvLyBsZXQgdGhlIHVzZXIgc2V0dGluZ3Mgb3ZlcnJpZGUgaG93IGZvbGRlcnMgYXJlIG9wZW4gaW4gYSBuZXcgd2luZG93IG9yIHNhbWUgd2luZG93IHVubGVzcyB3ZSBhcmUgZm9yY2VkXG5cdFx0Y29uc3Qgd2luZG93Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblx0XHRjb25zdCBvcGVuRm9sZGVySW5OZXdXaW5kb3dDb25maWcgPSB3aW5kb3dDb25maWc/Lm9wZW5Gb2xkZXJzSW5OZXdXaW5kb3cgfHwgJ2RlZmF1bHQnIC8qIGRlZmF1bHQgKi87XG5cdFx0Y29uc3Qgb3BlbkZpbGVzSW5OZXdXaW5kb3dDb25maWcgPSB3aW5kb3dDb25maWc/Lm9wZW5GaWxlc0luTmV3V2luZG93IHx8ICdvZmYnIC8qIGRlZmF1bHQgKi87XG5cblx0XHRsZXQgb3BlbkZvbGRlckluTmV3V2luZG93ID0gKG9wZW5Db25maWcucHJlZmVyTmV3V2luZG93IHx8IG9wZW5Db25maWcuZm9yY2VOZXdXaW5kb3cpICYmICFvcGVuQ29uZmlnLmZvcmNlUmV1c2VXaW5kb3c7XG5cdFx0aWYgKCFvcGVuQ29uZmlnLmZvcmNlTmV3V2luZG93ICYmICFvcGVuQ29uZmlnLmZvcmNlUmV1c2VXaW5kb3cgJiYgKG9wZW5Gb2xkZXJJbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29uJyB8fCBvcGVuRm9sZGVySW5OZXdXaW5kb3dDb25maWcgPT09ICdvZmYnKSkge1xuXHRcdFx0b3BlbkZvbGRlckluTmV3V2luZG93ID0gKG9wZW5Gb2xkZXJJbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29uJyk7XG5cdFx0fVxuXG5cdFx0Ly8gbGV0IHRoZSB1c2VyIHNldHRpbmdzIG92ZXJyaWRlIGhvdyBmaWxlcyBhcmUgb3BlbiBpbiBhIG5ldyB3aW5kb3cgb3Igc2FtZSB3aW5kb3cgdW5sZXNzIHdlIGFyZSBmb3JjZWQgKG5vdCBmb3IgZXh0ZW5zaW9uIGRldmVsb3BtZW50IHRob3VnaClcblx0XHRsZXQgb3BlbkZpbGVzSW5OZXdXaW5kb3cgPSBmYWxzZTtcblx0XHRpZiAob3BlbkNvbmZpZy5mb3JjZU5ld1dpbmRvdyB8fCBvcGVuQ29uZmlnLmZvcmNlUmV1c2VXaW5kb3cpIHtcblx0XHRcdG9wZW5GaWxlc0luTmV3V2luZG93ID0gISFvcGVuQ29uZmlnLmZvcmNlTmV3V2luZG93ICYmICFvcGVuQ29uZmlnLmZvcmNlUmV1c2VXaW5kb3c7XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Ly8gbWFjT1M6IGJ5IGRlZmF1bHQgd2Ugb3BlbiBmaWxlcyBpbiBhIG5ldyB3aW5kb3cgaWYgdGhpcyBpcyB0cmlnZ2VyZWQgdmlhIERPQ0sgY29udGV4dFxuXHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGlmIChvcGVuQ29uZmlnLmNvbnRleHQgPT09IE9wZW5Db250ZXh0LkRPQ0spIHtcblx0XHRcdFx0XHRvcGVuRmlsZXNJbk5ld1dpbmRvdyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTGludXgvV2luZG93czogYnkgZGVmYXVsdCB3ZSBvcGVuIGZpbGVzIGluIHRoZSBuZXcgd2luZG93IHVubGVzcyB0cmlnZ2VyZWQgdmlhIERJQUxPRyAvIE1FTlUgY29udGV4dFxuXHRcdFx0Ly8gb3IgZnJvbSB0aGUgaW50ZWdyYXRlZCB0ZXJtaW5hbCB3aGVyZSB3ZSBhc3N1bWUgdGhlIHVzZXIgcHJlZmVycyB0byBvcGVuIGluIHRoZSBjdXJyZW50IHdpbmRvd1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGlmIChvcGVuQ29uZmlnLmNvbnRleHQgIT09IE9wZW5Db250ZXh0LkRJQUxPRyAmJiBvcGVuQ29uZmlnLmNvbnRleHQgIT09IE9wZW5Db250ZXh0Lk1FTlUgJiYgIShvcGVuQ29uZmlnLnVzZXJFbnYgJiYgb3BlbkNvbmZpZy51c2VyRW52WydURVJNX1BST0dSQU0nXSA9PT0gJ3ZzY29kZScpKSB7XG5cdFx0XHRcdFx0b3BlbkZpbGVzSW5OZXdXaW5kb3cgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZpbmFsbHkgY2hlY2sgZm9yIG92ZXJyaWRlcyBvZiBkZWZhdWx0XG5cdFx0XHRpZiAoIW9wZW5Db25maWcuY2xpLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCAmJiAob3BlbkZpbGVzSW5OZXdXaW5kb3dDb25maWcgPT09ICdvbicgfHwgb3BlbkZpbGVzSW5OZXdXaW5kb3dDb25maWcgPT09ICdvZmYnKSkge1xuXHRcdFx0XHRvcGVuRmlsZXNJbk5ld1dpbmRvdyA9IChvcGVuRmlsZXNJbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29uJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgb3BlbkZvbGRlckluTmV3V2luZG93OiAhIW9wZW5Gb2xkZXJJbk5ld1dpbmRvdywgb3BlbkZpbGVzSW5OZXdXaW5kb3cgfTtcblx0fVxuXG5cdGFzeW5jIG9wZW5FeHRlbnNpb25EZXZlbG9wbWVudEhvc3RXaW5kb3coZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoczogc3RyaW5nW10sIG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUNvZGVXaW5kb3dbXT4ge1xuXG5cdFx0Ly8gUmVsb2FkIGFuIGV4aXN0aW5nIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBob3N0IHdpbmRvdyBvbiB0aGUgc2FtZSBwYXRoXG5cdFx0Ly8gV2UgY3VycmVudGx5IGRvIG5vdCBhbGxvdyBtb3JlIHRoYW4gb25lIGV4dGVuc2lvbiBkZXZlbG9wbWVudCB3aW5kb3dcblx0XHQvLyBvbiB0aGUgc2FtZSBleHRlbnNpb24gcGF0aC5cblx0XHRjb25zdCBleGlzdGluZ1dpbmRvdyA9IGZpbmRXaW5kb3dPbkV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCh0aGlzLmdldFdpbmRvd3MoKSwgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRocyk7XG5cdFx0aWYgKGV4aXN0aW5nV2luZG93KSB7XG5cdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnJlbG9hZChleGlzdGluZ1dpbmRvdywgb3BlbkNvbmZpZy5jbGkpO1xuXHRcdFx0ZXhpc3RpbmdXaW5kb3cuZm9jdXMoKTsgLy8gbWFrZSBzdXJlIGl0IGdldHMgZm9jdXMgYW5kIGlzIHJlc3RvcmVkXG5cblx0XHRcdHJldHVybiBbZXhpc3RpbmdXaW5kb3ddO1xuXHRcdH1cblxuXHRcdGxldCBmb2xkZXJVcmlzID0gb3BlbkNvbmZpZy5jbGlbJ2ZvbGRlci11cmknXSB8fCBbXTtcblx0XHRsZXQgZmlsZVVyaXMgPSBvcGVuQ29uZmlnLmNsaVsnZmlsZS11cmknXSB8fCBbXTtcblx0XHRsZXQgY2xpQXJncyA9IG9wZW5Db25maWcuY2xpLl87XG5cblx0XHQvLyBGaWxsIGluIHByZXZpb3VzbHkgb3BlbmVkIHdvcmtzcGFjZSB1bmxlc3MgYW4gZXhwbGljaXQgcGF0aCBpcyBwcm92aWRlZCBhbmQgd2UgYXJlIG5vdCB1bml0IHRlc3Rpbmdcblx0XHRpZiAoIWNsaUFyZ3MubGVuZ3RoICYmICFmb2xkZXJVcmlzLmxlbmd0aCAmJiAhZmlsZVVyaXMubGVuZ3RoICYmICFvcGVuQ29uZmlnLmNsaS5leHRlbnNpb25UZXN0c1BhdGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkRldmVsb3BtZW50V2luZG93U3RhdGUgPSB0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIuc3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdztcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVRvT3BlbiA9IGV4dGVuc2lvbkRldmVsb3BtZW50V2luZG93U3RhdGU/LndvcmtzcGFjZSA/PyBleHRlbnNpb25EZXZlbG9wbWVudFdpbmRvd1N0YXRlPy5mb2xkZXJVcmk7XG5cdFx0XHRpZiAod29ya3NwYWNlVG9PcGVuKSB7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkod29ya3NwYWNlVG9PcGVuKSkge1xuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VUb09wZW4uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRcdGNsaUFyZ3MgPSBbd29ya3NwYWNlVG9PcGVuLmZzUGF0aF07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZvbGRlclVyaXMgPSBbd29ya3NwYWNlVG9PcGVuLnRvU3RyaW5nKCldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAod29ya3NwYWNlVG9PcGVuLmNvbmZpZ1BhdGguc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRcdGNsaUFyZ3MgPSBbb3JpZ2luYWxGU1BhdGgod29ya3NwYWNlVG9PcGVuLmNvbmZpZ1BhdGgpXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZmlsZVVyaXMgPSBbd29ya3NwYWNlVG9PcGVuLmNvbmZpZ1BhdGgudG9TdHJpbmcoKV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlbW90ZUF1dGhvcml0eSA9IG9wZW5Db25maWcucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoIG9mIGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aHMpIHtcblx0XHRcdGlmIChleHRlbnNpb25EZXZlbG9wbWVudFBhdGgubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlcXCtcXC1cXC5dKzovKSkge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoUmVtb3RlQXV0aG9yaXR5ID0gZ2V0UmVtb3RlQXV0aG9yaXR5KHVybCk7XG5cdFx0XHRcdGlmIChleHRlbnNpb25EZXZlbG9wbWVudFBhdGhSZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRpZiAocmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0XHRpZiAoIWlzRXF1YWxBdXRob3JpdHkoZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoUmVtb3RlQXV0aG9yaXR5LCByZW1vdGVBdXRob3JpdHkpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignbW9yZSB0aGFuIG9uZSBleHRlbnNpb24gZGV2ZWxvcG1lbnQgcGF0aCBhdXRob3JpdHknKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5ID0gZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoUmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0aGF0IHdlIGRvIG5vdCB0cnkgdG8gb3Blbjpcblx0XHQvLyAtIGEgd29ya3NwYWNlIG9yIGZvbGRlciB0aGF0IGlzIGFscmVhZHkgb3BlbmVkXG5cdFx0Ly8gLSBhIHdvcmtzcGFjZSBvciBmaWxlIHRoYXQgaGFzIGEgZGlmZmVyZW50IGF1dGhvcml0eSBhcyB0aGUgZXh0ZW5zaW9uIGRldmVsb3BtZW50LlxuXG5cdFx0Y2xpQXJncyA9IGNsaUFyZ3MuZmlsdGVyKHBhdGggPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUocGF0aCk7XG5cdFx0XHRpZiAoZmluZFdpbmRvd09uV29ya3NwYWNlT3JGb2xkZXIodGhpcy5nZXRXaW5kb3dzKCksIHVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaXNFcXVhbEF1dGhvcml0eShnZXRSZW1vdGVBdXRob3JpdHkodXJpKSwgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHR9KTtcblxuXHRcdGZvbGRlclVyaXMgPSBmb2xkZXJVcmlzLmZpbHRlcihmb2xkZXJVcmlTdHIgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gdGhpcy5jbGlBcmdUb1VyaShmb2xkZXJVcmlTdHIpO1xuXHRcdFx0aWYgKGZvbGRlclVyaSAmJiBmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlcih0aGlzLmdldFdpbmRvd3MoKSwgZm9sZGVyVXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmb2xkZXJVcmkgPyBpc0VxdWFsQXV0aG9yaXR5KGdldFJlbW90ZUF1dGhvcml0eShmb2xkZXJVcmkpLCByZW1vdGVBdXRob3JpdHkpIDogZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRmaWxlVXJpcyA9IGZpbGVVcmlzLmZpbHRlcihmaWxlVXJpU3RyID0+IHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSB0aGlzLmNsaUFyZ1RvVXJpKGZpbGVVcmlTdHIpO1xuXHRcdFx0aWYgKGZpbGVVcmkgJiYgZmluZFdpbmRvd09uV29ya3NwYWNlT3JGb2xkZXIodGhpcy5nZXRXaW5kb3dzKCksIGZpbGVVcmkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZpbGVVcmkgPyBpc0VxdWFsQXV0aG9yaXR5KGdldFJlbW90ZUF1dGhvcml0eShmaWxlVXJpKSwgcmVtb3RlQXV0aG9yaXR5KSA6IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0b3BlbkNvbmZpZy5jbGkuXyA9IGNsaUFyZ3M7XG5cdFx0b3BlbkNvbmZpZy5jbGlbJ2ZvbGRlci11cmknXSA9IGZvbGRlclVyaXM7XG5cdFx0b3BlbkNvbmZpZy5jbGlbJ2ZpbGUtdXJpJ10gPSBmaWxlVXJpcztcblxuXHRcdC8vIE9wZW4gaXRcblx0XHRjb25zdCBvcGVuQXJnczogSU9wZW5Db25maWd1cmF0aW9uID0ge1xuXHRcdFx0Y29udGV4dDogb3BlbkNvbmZpZy5jb250ZXh0LFxuXHRcdFx0Y2xpOiBvcGVuQ29uZmlnLmNsaSxcblx0XHRcdGZvcmNlTmV3V2luZG93OiB0cnVlLFxuXHRcdFx0Zm9yY2VFbXB0eTogIWNsaUFyZ3MubGVuZ3RoICYmICFmb2xkZXJVcmlzLmxlbmd0aCAmJiAhZmlsZVVyaXMubGVuZ3RoLFxuXHRcdFx0dXNlckVudjogb3BlbkNvbmZpZy51c2VyRW52LFxuXHRcdFx0bm9SZWNlbnRFbnRyeTogdHJ1ZSxcblx0XHRcdHdhaXRNYXJrZXJGaWxlVVJJOiBvcGVuQ29uZmlnLndhaXRNYXJrZXJGaWxlVVJJLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0Zm9yY2VQcm9maWxlOiBvcGVuQ29uZmlnLmZvcmNlUHJvZmlsZSxcblx0XHRcdGZvcmNlVGVtcFByb2ZpbGU6IG9wZW5Db25maWcuZm9yY2VUZW1wUHJvZmlsZVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGhpcy5vcGVuKG9wZW5BcmdzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkluQnJvd3NlcldpbmRvdyhvcHRpb25zOiBJT3BlbkJyb3dzZXJXaW5kb3dPcHRpb25zKTogUHJvbWlzZTxJQ29kZVdpbmRvdz4ge1xuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk7XG5cblx0XHRjb25zdCBsYXN0QWN0aXZlV2luZG93ID0gdGhpcy5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0Y29uc3QgbmV3V2luZG93UHJvZmlsZSA9IHdpbmRvd0NvbmZpZz8ubmV3V2luZG93UHJvZmlsZVxuXHRcdFx0PyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5wcm9maWxlcy5maW5kKHByb2ZpbGUgPT4gcHJvZmlsZS5uYW1lID09PSB3aW5kb3dDb25maWcubmV3V2luZG93UHJvZmlsZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGUgPSBuZXdXaW5kb3dQcm9maWxlID8/IChsYXN0QWN0aXZlV2luZG93Py5wcm9maWxlPy5pc0FnZW50c1dpbmRvd1Byb2ZpbGUgPyB1bmRlZmluZWQgOiBsYXN0QWN0aXZlV2luZG93Py5wcm9maWxlKSA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblxuXHRcdGxldCB3aW5kb3c6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkO1xuXHRcdGlmICghb3B0aW9ucy5mb3JjZU5ld1dpbmRvdyAmJiAhb3B0aW9ucy5mb3JjZU5ld1RhYmJlZFdpbmRvdykge1xuXHRcdFx0d2luZG93ID0gb3B0aW9ucy53aW5kb3dUb1VzZSB8fCAobGFzdEFjdGl2ZVdpbmRvdz8uY29uZmlnPy5pc1Nlc3Npb25zV2luZG93ID8gdW5kZWZpbmVkIDogbGFzdEFjdGl2ZVdpbmRvdyk7XG5cdFx0XHRpZiAod2luZG93KSB7XG5cdFx0XHRcdHdpbmRvdy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHVwIHRoZSB3aW5kb3cgY29uZmlndXJhdGlvbiBmcm9tIHByb3ZpZGVkIG9wdGlvbnMsIGNvbmZpZyBhbmQgZW52aXJvbm1lbnRcblx0XHRjb25zdCBjb25maWd1cmF0aW9uOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiA9IHtcblxuXHRcdFx0Ly8gSW5oZXJpdCBDTEkgYXJndW1lbnRzIGZyb20gZW52aXJvbm1lbnQgYW5kL29yXG5cdFx0XHQvLyB0aGUgc3BlY2lmaWMgcHJvcGVydGllcyBmcm9tIHRoaXMgbGF1bmNoIGlmIHByb3ZpZGVkXG5cdFx0XHQuLi50aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHRcdC4uLm9wdGlvbnMuY2xpLFxuXG5cdFx0XHRtYWNoaW5lSWQ6IHRoaXMubWFjaGluZUlkLFxuXHRcdFx0c3FtSWQ6IHRoaXMuc3FtSWQsXG5cdFx0XHRkZXZEZXZpY2VJZDogdGhpcy5kZXZEZXZpY2VJZCxcblx0XHRcdGlzUG9ydGFibGU6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc1BvcnRhYmxlLFxuXG5cdFx0XHR3aW5kb3dJZDogLTEsXHQvLyBXaWxsIGJlIGZpbGxlZCBpbiBieSB0aGUgd2luZG93IG9uY2UgbG9hZGVkIGxhdGVyXG5cblx0XHRcdG1haW5QaWQ6IHByb2Nlc3MucGlkLFxuXG5cdFx0XHRhcHBSb290OiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXBwUm9vdCxcblx0XHRcdGV4ZWNQYXRoOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0Y29kZUNhY2hlUGF0aDogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmNvZGVDYWNoZVBhdGgsXG5cdFx0XHQvLyBJZiB3ZSBrbm93IHRoZSBiYWNrdXAgZm9sZGVyIHVwZnJvbnQgKGZvciBlbXB0eSB3aW5kb3dzIHRvIHJlc3RvcmUpLCB3ZSBjYW4gc2V0IGl0XG5cdFx0XHQvLyBkaXJlY3RseSBoZXJlIHdoaWNoIGhlbHBzIGZvciByZXN0b3JpbmcgVUkgc3RhdGUgYXNzb2NpYXRlZCB3aXRoIHRoYXQgd2luZG93LlxuXHRcdFx0Ly8gRm9yIGFsbCBvdGhlciBjYXNlcyB3ZSBmaXJzdCBjYWxsIGludG8gcmVnaXN0ZXJFbXB0eVdpbmRvd0JhY2t1cCgpIHRvIHNldCBpdCBiZWZvcmVcblx0XHRcdC8vIGxvYWRpbmcgdGhlIHdpbmRvdy5cblx0XHRcdGJhY2t1cFBhdGg6IG9wdGlvbnMuZW1wdHlXaW5kb3dCYWNrdXBJbmZvID8gam9pbih0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYmFja3VwSG9tZSwgb3B0aW9ucy5lbXB0eVdpbmRvd0JhY2t1cEluZm8uYmFja3VwRm9sZGVyKSA6IHVuZGVmaW5lZCxcblxuXHRcdFx0cHJvZmlsZXM6IHtcblx0XHRcdFx0aG9tZTogdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UucHJvZmlsZXNIb21lLFxuXHRcdFx0XHRhbGw6IHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLnByb2ZpbGVzLFxuXHRcdFx0XHQvLyBTZXQgdG8gZGVmYXVsdCBwcm9maWxlIGZpcnN0IGFuZCByZXNvbHZlIGFuZCB1cGRhdGUgdGhlIHByb2ZpbGVcblx0XHRcdFx0Ly8gb25seSBhZnRlciB0aGUgd29ya3NwYWNlLWJhY2t1cCBpcyByZWdpc3RlcmVkLlxuXHRcdFx0XHQvLyBCZWNhdXNlLCB3b3Jrc3BhY2UgaWRlbnRpZmllciBvZiBhbiBlbXB0eSB3aW5kb3cgaXMga25vd24gb25seSB0aGVuLlxuXHRcdFx0XHRwcm9maWxlOiBkZWZhdWx0UHJvZmlsZVxuXHRcdFx0fSxcblxuXHRcdFx0aG9tZURpcjogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLnVzZXJIb21lLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSB9KS5mc1BhdGgsXG5cdFx0XHR0bXBEaXI6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS50bXBEaXIud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pLmZzUGF0aCxcblx0XHRcdHVzZXJEYXRhRGlyOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UudXNlckRhdGFQYXRoLFxuXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0d29ya3NwYWNlOiBvcHRpb25zLndvcmtzcGFjZSxcblx0XHRcdHVzZXJFbnY6IHsgLi4udGhpcy5pbml0aWFsVXNlckVudiwgLi4ub3B0aW9ucy51c2VyRW52IH0sXG5cblx0XHRcdG5sczoge1xuXHRcdFx0XHRtZXNzYWdlczogZ2V0TkxTTWVzc2FnZXMoKSxcblx0XHRcdFx0bGFuZ3VhZ2U6IGdldE5MU0xhbmd1YWdlKClcblx0XHRcdH0sXG5cblx0XHRcdGZpbGVzVG9PcGVuT3JDcmVhdGU6IG9wdGlvbnMuZmlsZXNUb09wZW4/LmZpbGVzVG9PcGVuT3JDcmVhdGUsXG5cdFx0XHRmaWxlc1RvRGlmZjogb3B0aW9ucy5maWxlc1RvT3Blbj8uZmlsZXNUb0RpZmYsXG5cdFx0XHRmaWxlc1RvTWVyZ2U6IG9wdGlvbnMuZmlsZXNUb09wZW4/LmZpbGVzVG9NZXJnZSxcblx0XHRcdGZpbGVzVG9XYWl0OiBvcHRpb25zLmZpbGVzVG9PcGVuPy5maWxlc1RvV2FpdCxcblxuXHRcdFx0bG9nTGV2ZWw6IHRoaXMubG9nZ2VyU2VydmljZS5nZXRMb2dMZXZlbCgpLFxuXHRcdFx0bG9nZ2VyczogdGhpcy5sb2dnZXJTZXJ2aWNlLmdldEdsb2JhbExvZ2dlcnMoKSxcblx0XHRcdGxvZ3NQYXRoOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UubG9nc0hvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pLmZzUGF0aCxcblxuXHRcdFx0cHJvZHVjdCxcblx0XHRcdGlzSW5pdGlhbFN0YXJ0dXA6IG9wdGlvbnMuaW5pdGlhbFN0YXJ0dXAsXG5cdFx0XHRwZXJmTWFya3M6IGdldE1hcmtzKCksXG5cdFx0XHRvczogeyByZWxlYXNlOiByZWxlYXNlKCksIGhvc3RuYW1lOiBob3N0bmFtZSgpLCBhcmNoOiBhcmNoKCkgfSxcblxuXHRcdFx0YXV0b0RldGVjdEhpZ2hDb250cmFzdDogd2luZG93Q29uZmlnPy5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ID8/IHRydWUsXG5cdFx0XHRhdXRvRGV0ZWN0Q29sb3JTY2hlbWU6IHdpbmRvd0NvbmZpZz8uYXV0b0RldGVjdENvbG9yU2NoZW1lID8/IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVN1cHBvcnQ6IGFwcC5hY2Nlc3NpYmlsaXR5U3VwcG9ydEVuYWJsZWQsXG5cdFx0XHRjb2xvclNjaGVtZTogdGhpcy50aGVtZU1haW5TZXJ2aWNlLmdldENvbG9yU2NoZW1lKCksXG5cdFx0XHRwb2xpY2llc0RhdGE6IHRoaXMucG9saWN5U2VydmljZS5zZXJpYWxpemUoKSxcblx0XHRcdGNvbnRpbnVlT246IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5jb250aW51ZU9uLFxuXG5cdFx0XHRjc3NNb2R1bGVzOiB0aGlzLmNzc0RldmVsb3BtZW50U2VydmljZS5pc0VuYWJsZWQgPyBhd2FpdCB0aGlzLmNzc0RldmVsb3BtZW50U2VydmljZS5nZXRDc3NNb2R1bGVzKCkgOiB1bmRlZmluZWQsXG5cblx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IGlzV29ya3NwYWNlSWRlbnRpZmllcihvcHRpb25zLndvcmtzcGFjZSkgJiYgaXNFcXVhbChvcHRpb25zLndvcmtzcGFjZS5jb25maWdQYXRoLCB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSksXG5cdFx0fTtcblxuXHRcdC8vIE5ldyB3aW5kb3dcblx0XHRpZiAoIXdpbmRvdykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIuZ2V0TmV3V2luZG93U3RhdGUoY29uZmlndXJhdGlvbik7XG5cblx0XHRcdC8vIENyZWF0ZSB0aGUgd2luZG93XG5cdFx0XHRtYXJrKCdjb2RlL3dpbGxDcmVhdGVDb2RlV2luZG93Jyk7XG5cdFx0XHRjb25zdCBjcmVhdGVkV2luZG93ID0gd2luZG93ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlV2luZG93LCB7XG5cdFx0XHRcdHN0YXRlLFxuXHRcdFx0XHRleHRlbnNpb25EZXZlbG9wbWVudFBhdGg6IGNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoLFxuXHRcdFx0XHRpc0V4dGVuc2lvblRlc3RIb3N0OiAhIWNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uVGVzdHNQYXRoLFxuXHRcdFx0XHRpc1Nlc3Npb25zV2luZG93OiBjb25maWd1cmF0aW9uLmlzU2Vzc2lvbnNXaW5kb3dcblx0XHRcdH0pO1xuXHRcdFx0bWFyaygnY29kZS9kaWRDcmVhdGVDb2RlV2luZG93Jyk7XG5cblx0XHRcdC8vIEFkZCBhcyB3aW5kb3cgdGFiIGlmIGNvbmZpZ3VyZWQgKG1hY09TIG9ubHkpXG5cdFx0XHRpZiAob3B0aW9ucy5mb3JjZU5ld1RhYmJlZFdpbmRvdykge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSB0aGlzLmdldExhc3RBY3RpdmVXaW5kb3coKTtcblx0XHRcdFx0YWN0aXZlV2luZG93Py5hZGRUYWJiZWRXaW5kb3coY3JlYXRlZFdpbmRvdyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkZCB0byBvdXIgbGlzdCBvZiB3aW5kb3dzXG5cdFx0XHR0aGlzLndpbmRvd3Muc2V0KGNyZWF0ZWRXaW5kb3cuaWQsIGNyZWF0ZWRXaW5kb3cpO1xuXG5cdFx0XHQvLyBJbmRpY2F0ZSBuZXcgd2luZG93IHZpYSBldmVudFxuXHRcdFx0dGhpcy5fb25EaWRPcGVuV2luZG93LmZpcmUoY3JlYXRlZFdpbmRvdyk7XG5cblx0XHRcdC8vIEluZGljYXRlIG51bWJlciBjaGFuZ2UgdmlhIGV2ZW50XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdpbmRvd3NDb3VudC5maXJlKHsgb2xkQ291bnQ6IHRoaXMuZ2V0V2luZG93Q291bnQoKSAtIDEsIG5ld0NvdW50OiB0aGlzLmdldFdpbmRvd0NvdW50KCkgfSk7XG5cblx0XHRcdC8vIFdpbmRvdyBFdmVudHNcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZWRXaW5kb3cub25EaWRTaWduYWxSZWFkeSgoKSA9PiB0aGlzLl9vbkRpZFNpZ25hbFJlYWR5V2luZG93LmZpcmUoY3JlYXRlZFdpbmRvdykpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKGNyZWF0ZWRXaW5kb3cub25EaWRDbG9zZSkoKCkgPT4gdGhpcy5vbldpbmRvd0Nsb3NlZChjcmVhdGVkV2luZG93LCBkaXNwb3NhYmxlcykpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKGNyZWF0ZWRXaW5kb3cub25EaWREZXN0cm95KSgoKSA9PiB0aGlzLm9uV2luZG93RGVzdHJveWVkKGNyZWF0ZWRXaW5kb3cpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFdpbmRvdy5vbkRpZE1heGltaXplKCgpID0+IHRoaXMuX29uRGlkTWF4aW1pemVXaW5kb3cuZmlyZShjcmVhdGVkV2luZG93KSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZWRXaW5kb3cub25EaWRVbm1heGltaXplKCgpID0+IHRoaXMuX29uRGlkVW5tYXhpbWl6ZVdpbmRvdy5maXJlKGNyZWF0ZWRXaW5kb3cpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFdpbmRvdy5vbkRpZEVudGVyRnVsbFNjcmVlbigoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUZ1bGxTY3JlZW4uZmlyZSh7IHdpbmRvdzogY3JlYXRlZFdpbmRvdywgZnVsbHNjcmVlbjogdHJ1ZSB9KSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZWRXaW5kb3cub25EaWRMZWF2ZUZ1bGxTY3JlZW4oKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VGdWxsU2NyZWVuLmZpcmUoeyB3aW5kb3c6IGNyZWF0ZWRXaW5kb3csIGZ1bGxzY3JlZW46IGZhbHNlIH0pKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFdpbmRvdy5vbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudSgoeyB4LCB5IH0pID0+IHRoaXMuX29uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51LmZpcmUoeyB3aW5kb3c6IGNyZWF0ZWRXaW5kb3csIHgsIHkgfSkpKTtcblxuXHRcdFx0Y29uc3Qgd2ViQ29udGVudHMgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChjcmVhdGVkV2luZG93Lndpbj8ud2ViQ29udGVudHMpO1xuXHRcdFx0d2ViQ29udGVudHMucmVtb3ZlQWxsTGlzdGVuZXJzKCdkZXZ0b29scy1yZWxvYWQtcGFnZScpOyAvLyByZW1vdmUgYnVpbHQgaW4gbGlzdGVuZXIgc28gd2UgY2FuIGhhbmRsZSB0aGlzIG9uIG91ciBvd25cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih3ZWJDb250ZW50cywgJ2RldnRvb2xzLXJlbG9hZC1wYWdlJykoKCkgPT4gdGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5yZWxvYWQoY3JlYXRlZFdpbmRvdykpKTtcblxuXHRcdFx0Ly8gTGlmZWN5Y2xlXG5cdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnJlZ2lzdGVyV2luZG93KGNyZWF0ZWRXaW5kb3cpO1xuXHRcdH1cblxuXHRcdC8vIEV4aXN0aW5nIHdpbmRvd1xuXHRcdGVsc2Uge1xuXG5cdFx0XHQvLyBTb21lIGNvbmZpZ3VyYXRpb24gdGhpbmdzIGdldCBpbmhlcml0ZWQgaWYgdGhlIHdpbmRvdyBpcyBiZWluZyByZXVzZWQgYW5kIHdlIGFyZVxuXHRcdFx0Ly8gaW4gZXh0ZW5zaW9uIGRldmVsb3BtZW50IGhvc3QgbW9kZS4gVGhlc2Ugb3B0aW9ucyBhcmUgYWxsIGRldmVsb3BtZW50IHJlbGF0ZWQuXG5cdFx0XHRjb25zdCBjdXJyZW50V2luZG93Q29uZmlnID0gd2luZG93LmNvbmZpZztcblx0XHRcdGlmICghY29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGggJiYgY3VycmVudFdpbmRvd0NvbmZpZz8uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoID0gY3VycmVudFdpbmRvd0NvbmZpZy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGg7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kID0gY3VycmVudFdpbmRvd0NvbmZpZy5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQ7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25bJ2VuYWJsZS1wcm9wb3NlZC1hcGknXSA9IGN1cnJlbnRXaW5kb3dDb25maWdbJ2VuYWJsZS1wcm9wb3NlZC1hcGknXTtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi52ZXJib3NlID0gY3VycmVudFdpbmRvd0NvbmZpZy52ZXJib3NlO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uWydpbnNwZWN0LWV4dGVuc2lvbnMnXSA9IGN1cnJlbnRXaW5kb3dDb25maWdbJ2luc3BlY3QtZXh0ZW5zaW9ucyddO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uWydpbnNwZWN0LWJyay1leHRlbnNpb25zJ10gPSBjdXJyZW50V2luZG93Q29uZmlnWydpbnNwZWN0LWJyay1leHRlbnNpb25zJ107XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24uZGVidWdJZCA9IGN1cnJlbnRXaW5kb3dDb25maWcuZGVidWdJZDtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi5leHRlbnNpb25FbnZpcm9ubWVudCA9IGN1cnJlbnRXaW5kb3dDb25maWcuZXh0ZW5zaW9uRW52aXJvbm1lbnQ7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25bJ2V4dGVuc2lvbnMtZGlyJ10gPSBjdXJyZW50V2luZG93Q29uZmlnWydleHRlbnNpb25zLWRpciddO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uWydkaXNhYmxlLWV4dGVuc2lvbnMnXSA9IGN1cnJlbnRXaW5kb3dDb25maWdbJ2Rpc2FibGUtZXh0ZW5zaW9ucyddO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uWydkaXNhYmxlLWV4dGVuc2lvbiddID0gY3VycmVudFdpbmRvd0NvbmZpZ1snZGlzYWJsZS1leHRlbnNpb24nXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgd2luZG93IGlkZW50aWZpZXIgYW5kIHNlc3Npb24gbm93XG5cdFx0Ly8gdGhhdCB3ZSBoYXZlIHRoZSB3aW5kb3cgb2JqZWN0IGluIGhhbmQuXG5cdFx0Y29uZmlndXJhdGlvbi53aW5kb3dJZCA9IHdpbmRvdy5pZDtcblxuXHRcdC8vIElmIHRoZSB3aW5kb3cgd2FzIGFscmVhZHkgbG9hZGVkLCBtYWtlIHN1cmUgdG8gdW5sb2FkIGl0XG5cdFx0Ly8gZmlyc3QgYW5kIG9ubHkgbG9hZCB0aGUgbmV3IGNvbmZpZ3VyYXRpb24gaWYgdGhhdCB3YXNcblx0XHQvLyBub3QgdmV0b2VkXG5cdFx0aWYgKHdpbmRvdy5pc1JlYWR5KSB7XG5cdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnVubG9hZCh3aW5kb3csIFVubG9hZFJlYXNvbi5MT0FEKS50aGVuKGFzeW5jIHZldG8gPT4ge1xuXHRcdFx0XHRpZiAoIXZldG8pIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvT3BlbkluQnJvd3NlcldpbmRvdyh3aW5kb3csIGNvbmZpZ3VyYXRpb24sIG9wdGlvbnMsIGRlZmF1bHRQcm9maWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9PcGVuSW5Ccm93c2VyV2luZG93KHdpbmRvdywgY29uZmlndXJhdGlvbiwgb3B0aW9ucywgZGVmYXVsdFByb2ZpbGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB3aW5kb3c7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvT3BlbkluQnJvd3NlcldpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93LCBjb25maWd1cmF0aW9uOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiwgb3B0aW9uczogSU9wZW5Ccm93c2VyV2luZG93T3B0aW9ucywgZGVmYXVsdFByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJlZ2lzdGVyIHdpbmRvdyBmb3IgYmFja3VwcyB1bmxlc3MgdGhlIHdpbmRvd1xuXHRcdC8vIGlzIGZvciBleHRlbnNpb24gZGV2ZWxvcG1lbnQsIHdoZXJlIHdlIGRvIG5vdFxuXHRcdC8vIGtlZXAgYW55IGJhY2t1cHMuXG5cblx0XHRpZiAoIWNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKSB7XG5cdFx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlKSkge1xuXHRcdFx0XHRjb25maWd1cmF0aW9uLmJhY2t1cFBhdGggPSB0aGlzLmJhY2t1cE1haW5TZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHtcblx0XHRcdFx0XHR3b3Jrc3BhY2U6IGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlLFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogY29uZmlndXJhdGlvbi5yZW1vdGVBdXRob3JpdHlcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcihjb25maWd1cmF0aW9uLndvcmtzcGFjZSkpIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi5iYWNrdXBQYXRoID0gdGhpcy5iYWNrdXBNYWluU2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh7XG5cdFx0XHRcdFx0Zm9sZGVyVXJpOiBjb25maWd1cmF0aW9uLndvcmtzcGFjZS51cmksXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBjb25maWd1cmF0aW9uLnJlbW90ZUF1dGhvcml0eVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cblx0XHRcdFx0Ly8gRW1wdHkgd2luZG93cyBhcmUgc3BlY2lhbCBpbiB0aGF0IHRoZXkgcHJvdmlkZSBubyB3b3Jrc3BhY2Ugb25cblx0XHRcdFx0Ly8gdGhlaXIgY29uZmlndXJhdGlvbi4gVG8gcHJvcGVybHkgcmVnaXN0ZXIgdGhlbSB3aXRoIHRoZSBiYWNrdXBcblx0XHRcdFx0Ly8gc2VydmljZSwgd2UgZWl0aGVyIHVzZSB0aGUgcHJvdmlkZWQgYXNzb2NpYXRlZCBgYmFja3VwRm9sZGVyYFxuXHRcdFx0XHQvLyBpbiBjYXNlIHdlIHJlc3RvcmUgYSBwcmV2aW91c2x5IG9wZW5lZCBlbXB0eSB3aW5kb3cgb3Igd2UgaGF2ZVxuXHRcdFx0XHQvLyB0byBnZW5lcmF0ZSBhIG5ldyBlbXB0eSB3aW5kb3cgd29ya3NwYWNlIGlkZW50aWZpZXIgdG8gYmUgdXNlZFxuXHRcdFx0XHQvLyBhcyBgYmFja3VwRm9sZGVyYC5cblxuXHRcdFx0XHRjb25maWd1cmF0aW9uLmJhY2t1cFBhdGggPSB0aGlzLmJhY2t1cE1haW5TZXJ2aWNlLnJlZ2lzdGVyRW1wdHlXaW5kb3dCYWNrdXAoe1xuXHRcdFx0XHRcdGJhY2t1cEZvbGRlcjogb3B0aW9ucy5lbXB0eVdpbmRvd0JhY2t1cEluZm8/LmJhY2t1cEZvbGRlciA/PyBjcmVhdGVFbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIoKS5pZCxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IGNvbmZpZ3VyYXRpb24ucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlID8/IHRvV29ya3NwYWNlSWRlbnRpZmllcihjb25maWd1cmF0aW9uLmJhY2t1cFBhdGgsIGZhbHNlKTtcblxuXHRcdGlmIChjb25maWd1cmF0aW9uLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ucHJvZmlsZXMucHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlzQWdlbnRzV2luZG93UHJvZmlsZSkgPz8gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UuY3JlYXRlQWdlbnRzV2luZG93UHJvZmlsZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcm9maWxlUHJvbWlzZSA9IHRoaXMucmVzb2x2ZVByb2ZpbGVGb3JCcm93c2VyV2luZG93KG9wdGlvbnMsIHdvcmtzcGFjZSwgZGVmYXVsdFByb2ZpbGUpO1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHByb2ZpbGVQcm9taXNlIGluc3RhbmNlb2YgUHJvbWlzZSA/IGF3YWl0IHByb2ZpbGVQcm9taXNlIDogcHJvZmlsZVByb21pc2U7XG5cdFx0XHRjb25maWd1cmF0aW9uLnByb2ZpbGVzLnByb2ZpbGUgPSBwcm9maWxlO1xuXG5cdFx0XHRpZiAoIWNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKSB7XG5cdFx0XHRcdC8vIEFzc29jaWF0ZSB0aGUgY29uZmlndXJlZCBwcm9maWxlIHRvIHRoZSB3b3Jrc3BhY2Vcblx0XHRcdFx0Ly8gdW5sZXNzIHRoZSB3aW5kb3cgaXMgZm9yIGV4dGVuc2lvbiBkZXZlbG9wbWVudCxcblx0XHRcdFx0Ly8gd2hlcmUgd2UgZG8gbm90IHBlcnNpc3QgdGhlIGFzc29jaWF0aW9uc1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5zZXRQcm9maWxlRm9yV29ya3NwYWNlKHdvcmtzcGFjZSwgcHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTG9hZCBpdFxuXHRcdHdpbmRvdy5sb2FkKGNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlUHJvZmlsZUZvckJyb3dzZXJXaW5kb3cob3B0aW9uczogSU9wZW5Ccm93c2VyV2luZG93T3B0aW9ucywgd29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgZGVmYXVsdFByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+IHwgSVVzZXJEYXRhUHJvZmlsZSB7XG5cdFx0aWYgKG9wdGlvbnMuZm9yY2VQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAubmFtZSA9PT0gb3B0aW9ucy5mb3JjZVByb2ZpbGUpID8/IHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLmNyZWF0ZU5hbWVkUHJvZmlsZShvcHRpb25zLmZvcmNlUHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuZm9yY2VUZW1wUHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLmNyZWF0ZVRyYW5zaWVudFByb2ZpbGUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UuZ2V0UHJvZmlsZUZvcldvcmtzcGFjZSh3b3Jrc3BhY2UpID8/IGRlZmF1bHRQcm9maWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbldpbmRvd0Nsb3NlZCh3aW5kb3c6IElDb2RlV2luZG93LCBkaXNwb3NhYmxlczogSURpc3Bvc2FibGUpOiB2b2lkIHtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIG91ciBsaXN0IHNvIHRoYXQgRWxlY3Ryb24gY2FuIGNsZWFuIGl0IHVwXG5cdFx0dGhpcy53aW5kb3dzLmRlbGV0ZSh3aW5kb3cuaWQpO1xuXG5cdFx0Ly8gRW1pdFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV2luZG93c0NvdW50LmZpcmUoeyBvbGRDb3VudDogdGhpcy5nZXRXaW5kb3dDb3VudCgpICsgMSwgbmV3Q291bnQ6IHRoaXMuZ2V0V2luZG93Q291bnQoKSB9KTtcblxuXHRcdC8vIENsZWFuIHVwXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbldpbmRvd0Rlc3Ryb3llZCh3aW5kb3c6IElDb2RlV2luZG93KTogdm9pZCB7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBvdXIgbGlzdCBzbyB0aGF0IEVsZWN0cm9uIGNhbiBjbGVhbiBpdCB1cFxuXHRcdHRoaXMud2luZG93cy5kZWxldGUod2luZG93LmlkKTtcblxuXHRcdC8vIEVtaXRcblx0XHR0aGlzLl9vbkRpZERlc3Ryb3lXaW5kb3cuZmlyZSh3aW5kb3cpO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFdpbmRvdygpOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd2luZG93ID0gQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG5cdFx0aWYgKHdpbmRvdykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0V2luZG93QnlJZCh3aW5kb3cuaWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRMYXN0QWN0aXZlV2luZG93KCk6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kb0dldExhc3RBY3RpdmVXaW5kb3codGhpcy5nZXRXaW5kb3dzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYXN0QWN0aXZlV2luZG93Rm9yQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRvR2V0TGFzdEFjdGl2ZVdpbmRvdyh0aGlzLmdldFdpbmRvd3MoKS5maWx0ZXIod2luZG93ID0+IGlzRXF1YWxBdXRob3JpdHkod2luZG93LnJlbW90ZUF1dGhvcml0eSwgcmVtb3RlQXV0aG9yaXR5KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldExhc3RBY3RpdmVXaW5kb3cod2luZG93czogSUNvZGVXaW5kb3dbXSk6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZ2V0TGFzdEZvY3VzZWQod2luZG93cyk7XG5cdH1cblxuXHRzZW5kVG9Gb2N1c2VkKGNoYW5uZWw6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXNlZFdpbmRvdyA9IHRoaXMuZ2V0Rm9jdXNlZFdpbmRvdygpIHx8IHRoaXMuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXG5cdFx0Zm9jdXNlZFdpbmRvdz8uc2VuZFdoZW5SZWFkeShjaGFubmVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAuLi5hcmdzKTtcblx0fVxuXG5cdHNlbmRUb09wZW5pbmdXaW5kb3coY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMub25EaWRTaWduYWxSZWFkeVdpbmRvdykod2luZG93ID0+IHtcblx0XHRcdHdpbmRvdy5zZW5kV2hlblJlYWR5KGNoYW5uZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIC4uLmFyZ3MpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNlbmRUb0FsbChjaGFubmVsOiBzdHJpbmcsIHBheWxvYWQ/OiB1bmtub3duLCB3aW5kb3dJZHNUb0lnbm9yZT86IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRXaW5kb3dzKCkpIHtcblx0XHRcdGlmICh3aW5kb3dJZHNUb0lnbm9yZSAmJiB3aW5kb3dJZHNUb0lnbm9yZS5pbmRleE9mKHdpbmRvdy5pZCkgPj0gMCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gZG8gbm90IHNlbmQgaWYgd2UgYXJlIGluc3RydWN0ZWQgdG8gaWdub3JlIGl0XG5cdFx0XHR9XG5cblx0XHRcdHdpbmRvdy5zZW5kV2hlblJlYWR5KGNoYW5uZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHBheWxvYWQpO1xuXHRcdH1cblx0fVxuXG5cdGdldFdpbmRvd3MoKTogSUNvZGVXaW5kb3dbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy53aW5kb3dzLnZhbHVlcygpKTtcblx0fVxuXG5cdGdldFdpbmRvd0NvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMud2luZG93cy5zaXplO1xuXHR9XG5cblx0Z2V0V2luZG93QnlJZCh3aW5kb3dJZDogbnVtYmVyKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndpbmRvd3MuZ2V0KHdpbmRvd0lkKTtcblx0fVxuXG5cdGdldFdpbmRvd0J5V2ViQ29udGVudHMod2ViQ29udGVudHM6IFdlYkNvbnRlbnRzKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJyb3dzZXJXaW5kb3cgPSBCcm93c2VyV2luZG93LmZyb21XZWJDb250ZW50cyh3ZWJDb250ZW50cyk7XG5cdFx0aWYgKCFicm93c2VyV2luZG93KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuZ2V0V2luZG93QnlJZChicm93c2VyV2luZG93LmlkKTtcblxuXHRcdHJldHVybiB3aW5kb3c/Lm1hdGNoZXMod2ViQ29udGVudHMpID8gd2luZG93IDogdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLEtBQUssZUFBNEIsYUFBYTtBQUN2RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFVBQVUsU0FBUyxZQUFZO0FBQ3hDLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0IseUJBQXlCLGtCQUFrQixpQkFBaUI7QUFDM0YsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGVBQWU7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
