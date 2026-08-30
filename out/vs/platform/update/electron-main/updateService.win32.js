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
import { spawn } from "child_process";
import { app } from "electron";
import { unlinkSync, writeFileSync } from "fs";
import { mkdir, readFile, unlink } from "fs/promises";
import { release, tmpdir } from "os";
import { Delayer, ProcessTimeRunOnceScheduler, timeout } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { memoize } from "../../../base/common/decorators.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { hash } from "../../../base/common/hash.js";
import * as path from "../../../base/common/path.js";
import { basename } from "../../../base/common/path.js";
import { transform } from "../../../base/common/stream.js";
import { URI } from "../../../base/common/uri.js";
import { checksum } from "../../../base/node/crypto.js";
import * as pfs from "../../../base/node/pfs.js";
import { killTree } from "../../../base/node/processes.js";
import { getWindowsRelease } from "../../../base/node/windowsVersion.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { IFileService } from "../../files/common/files.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IMeteredConnectionService } from "../../meteredConnection/common/meteredConnection.js";
import { INativeHostMainService } from "../../native/electron-main/nativeHostMainService.js";
import { IProductService } from "../../product/common/productService.js";
import { asJson, IRequestService } from "../../request/common/request.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { DisablementReason, State, StateType, UpdateType } from "../common/update.js";
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders } from "./abstractUpdateService.js";
import { getRelaunchArguments } from "./updateRelaunchArguments.js";
import { getWin32UpdateType } from "./win32UpdateType.js";
const RELAUNCH_ARGUMENTS_FILE_PREFIX = "relaunch-args-";
let _updateType = void 0;
function getUpdateType() {
  if (typeof _updateType === "undefined") {
    _updateType = getWin32UpdateType();
  }
  return _updateType;
}
let Win32UpdateService = class extends AbstractUpdateService {
  constructor(lifecycleMainService, configurationService, telemetryService, environmentMainService, requestService, logService, fileService, nativeHostMainService, productService, applicationStorageMainService, meteredConnectionService) {
    super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);
    this.fileService = fileService;
    this.nativeHostMainService = nativeHostMainService;
    this.readyMutexName = `${productService.win32MutexName}-ready`;
    this.updatingMutexName = `${productService.win32MutexName}-updating`;
    this.setupMutexName = `${productService.win32MutexName}setup`;
    lifecycleMainService.setRelaunchHandler(this);
  }
  get cachePathSync() {
    return path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
  }
  get cachePath() {
    const result = this.cachePathSync;
    return mkdir(result, { recursive: true }).then(() => result);
  }
  get mutex() {
    return import("@vscode/windows-mutex");
  }
  handleRelaunch(options) {
    if (options?.addArgs || options?.removeArgs) {
      return false;
    }
    if (this.state.type !== StateType.Ready || !this.availableUpdate) {
      return false;
    }
    this.logService.trace("update#handleRelaunch(): running raw#quitAndInstall()");
    this.doQuitAndInstall();
    return true;
  }
  async initialize() {
    if (this.productService.win32VersionedUpdate) {
      const cachePath = await this.cachePath;
      app.setPath("appUpdate", cachePath);
      await this.unlink(path.join(cachePath, "session-ending.flag"));
    }
    const osRelease = await getWindowsRelease();
    const osNodeRelease = release();
    this.telemetryService.publicLog2("windowsUpdateInit", { osRelease, osNodeRelease });
    if (this.productService.target === "user" && await this.nativeHostMainService.isAdmin(void 0)) {
      this.setState(State.Disabled(DisablementReason.RunningAsAdmin));
      this.logService.info("update#ctor - updates are disabled due to running as Admin in user setup");
      return;
    }
    await super.initialize();
  }
  async postInitialize() {
    if (!this.productService.win32VersionedUpdate) {
      return;
    }
    const exePath = app.getPath("exe");
    const exeDir = path.dirname(exePath);
    const updatingVersionPath = path.join(exeDir, "updating_version");
    if (await pfs.Promises.exists(updatingVersionPath)) {
      try {
        const updatingVersion = (await readFile(updatingVersionPath, "utf8")).trim();
        this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
        const updatePackagePath = await this.getUpdatePackagePath(updatingVersion);
        if (await pfs.Promises.exists(updatePackagePath)) {
          await this._applySpecificUpdate(updatePackagePath, updatingVersion);
          this.logService.info(`update#doCheckForUpdates - successfully applied update to version ${updatingVersion}`);
        }
      } catch (e) {
        this.logService.error(`update#doCheckForUpdates - could not read ${updatingVersionPath}`, e);
      } finally {
      }
    } else {
      await this.collectGarbage();
    }
  }
  async collectGarbage() {
    if (!this.productService.win32VersionedUpdate) {
      return;
    }
    const fastUpdatesEnabled = this.configurationService.getValue("update.enableWindowsBackgroundUpdates");
    if (!fastUpdatesEnabled || this.productService.target !== "user" || !this.productService.commit) {
      return;
    }
    const exePath = app.getPath("exe");
    const exeDir = path.dirname(exePath);
    const versionedResourcesFolder = this.productService.commit.substring(0, 10);
    const innoUpdater = path.join(exeDir, versionedResourcesFolder, "tools", "inno_updater.exe");
    const exeName = basename(exePath);
    await new Promise((resolve) => {
      const child = spawn(innoUpdater, ["--gc", exePath, versionedResourcesFolder, exeName], {
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
        timeout: 2 * 60 * 1e3
      });
      child.once("error", (err) => {
        this.logService.error("update#collectGarbage - failed to spawn inno_updater", err);
        resolve();
      });
      child.once("exit", () => resolve());
    });
  }
  buildUpdateFeedUrl(quality, commit, options) {
    let platform = `win32-${process.arch}`;
    if (getUpdateType() === UpdateType.Archive) {
      platform += "-archive";
    } else if (this.productService.target === "user") {
      platform += "-user";
    }
    return createUpdateURL(this.productService.updateUrl, platform, quality, commit, options);
  }
  doCheckForUpdates(explicit, pendingCommit) {
    if (!this.quality) {
      return;
    }
    const internalOrg = this.getInternalOrg();
    const background = !explicit && !internalOrg;
    const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit, { background, internalOrg });
    if (this.state.type !== StateType.Overwriting) {
      this.setState(State.CheckingForUpdates(explicit));
    }
    this.checkCancellationTokenSource?.dispose(true);
    const cts = this.checkCancellationTokenSource = new CancellationTokenSource();
    const token = cts.token;
    const headers = getUpdateRequestHeaders(this.productService.version);
    const promise = this.requestService.request({ url, headers, callSite: "updateService.win32.checkForUpdates" }, token).then(asJson).then((update) => {
      const updateType = getUpdateType();
      if (token.isCancellationRequested) {
        return Promise.resolve(null);
      }
      if (!update || !update.url || !update.version || !update.productVersion) {
        if (this.state.type === StateType.Overwriting) {
          this._overwrite = false;
          this.setState(State.Ready(this.state.update, this.state.explicit, false));
        } else {
          this.setState(State.Idle(updateType, void 0, explicit || void 0));
        }
        return Promise.resolve(null);
      }
      if (updateType === UpdateType.Archive) {
        this.setState(State.AvailableForDownload(update));
        return Promise.resolve(null);
      }
      if (!explicit && this.meteredConnectionService.isConnectionMetered) {
        this.logService.info("update#doCheckForUpdates - update available but skipping download because connection is metered");
        this.setState(State.AvailableForDownload(update));
        return Promise.resolve(null);
      }
      const startTime = Date.now();
      this.setState(State.Downloading(update, explicit, this._overwrite, 0, void 0, startTime));
      return this.cleanup(update.version).then(() => {
        return this.getUpdatePackagePath(update.version).then((updatePackagePath) => {
          return pfs.Promises.exists(updatePackagePath).then((exists) => {
            if (exists) {
              return Promise.resolve(updatePackagePath);
            }
            const downloadPath = `${updatePackagePath}.tmp`;
            return this.requestService.request({ url: update.url, callSite: "updateService.win32.downloadUpdate" }, token).then((context) => {
              const contentLengthHeader = context.res.headers["content-length"];
              const contentLength = typeof contentLengthHeader === "string" ? contentLengthHeader : void 0;
              const totalBytes = contentLength ? parseInt(contentLength, 10) : void 0;
              let downloadedBytes = 0;
              const progressDelayer = new Delayer(500);
              const progressStream = transform(
                context.stream,
                {
                  data: (data) => {
                    downloadedBytes += data.byteLength;
                    progressDelayer.trigger(() => {
                      this.setState(State.Downloading(update, explicit, this._overwrite, downloadedBytes, totalBytes, startTime));
                    });
                    return data;
                  }
                },
                (chunks) => VSBuffer.concat(chunks)
              );
              return this.fileService.writeFile(URI.file(downloadPath), progressStream).finally(() => progressDelayer.dispose());
            }).then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => void 0).then(() => pfs.Promises.rename(
              downloadPath,
              updatePackagePath,
              false
              /* no retry */
            )).then(() => updatePackagePath);
          });
        }).then((packagePath) => {
          if (token.isCancellationRequested) {
            return;
          }
          this.availableUpdate = { packagePath };
          this.saveUpdateMetadata(update);
          this.setState(State.Downloaded(update, explicit, this._overwrite));
          const fastUpdatesEnabled = this.configurationService.getValue("update.enableWindowsBackgroundUpdates");
          if (fastUpdatesEnabled && this.productService.target === "user") {
            this.doApplyUpdate();
          } else {
            this.setState(State.Ready(update, explicit, this._overwrite));
          }
        });
      });
    }).then(void 0, (err) => {
      if (token.isCancellationRequested || isCancellationError(err)) {
        return;
      }
      this.telemetryService.publicLog2("update:error", { messageHash: String(hash(String(err))) });
      this.logService.error(err);
      const message = explicit ? err.message || err : void 0;
      if (this.state.type === StateType.Overwriting) {
        this._overwrite = false;
        this.setState(State.Ready(this.state.update, this.state.explicit, false));
      } else {
        this.setState(State.Idle(getUpdateType(), message));
      }
    });
    this.checkPromise = promise;
    promise.finally(() => {
      if (this.checkCancellationTokenSource === cts) {
        this.checkCancellationTokenSource = void 0;
      }
      if (this.checkPromise === promise) {
        this.checkPromise = void 0;
      }
      cts.dispose();
    });
  }
  async doDownloadUpdate(state) {
    if (state.update.url) {
      this.nativeHostMainService.openExternal(void 0, state.update.url);
    }
    this.setState(State.Idle(getUpdateType()));
  }
  async getUpdatePackagePath(version) {
    const cachePath = await this.cachePath;
    return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
  }
  async cleanup(exceptVersion = null) {
    const relaunchArgumentsFileName = exceptVersion ? `${RELAUNCH_ARGUMENTS_FILE_PREFIX}${exceptVersion}` : void 0;
    const filter = exceptVersion ? (one) => one !== relaunchArgumentsFileName && !new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one) : () => true;
    const cachePath = await this.cachePath;
    const versions = await pfs.Promises.readdir(cachePath);
    const promises = versions.filter(filter).map((one) => this.unlink(path.join(cachePath, one)));
    await Promise.all(promises);
  }
  async doApplyUpdate() {
    if (this.state.type !== StateType.Downloaded) {
      return Promise.resolve(void 0);
    }
    if (!this.availableUpdate) {
      return Promise.resolve(void 0);
    }
    const update = this.state.update;
    const explicit = this.state.explicit;
    this.setState(State.Updating(update, explicit));
    const cachePath = await this.cachePath;
    const sessionEndFlagPath = path.join(cachePath, "session-ending.flag");
    const cancelFilePath = path.join(cachePath, `cancel.flag`);
    const progressFilePath = path.join(cachePath, `update-progress`);
    this.availableUpdate.updateFilePath = path.join(cachePath, `CodeSetup-${this.productService.quality}-${update.version}.flag`);
    this.availableUpdate.cancelFilePath = cancelFilePath;
    const mutex = await this.mutex;
    const skippedSpawn = this.isInstallerActive(mutex);
    if (skippedSpawn) {
      this.logService.info("update#doApplyUpdate: another instance is already running setup, waiting for it to finish");
    } else {
      await this.unlink(cancelFilePath);
      await this.unlink(progressFilePath);
      await pfs.Promises.writeFile(this.availableUpdate.updateFilePath, "flag");
      const installerArgs = [
        "/verysilent",
        "/log",
        `/update="${this.availableUpdate.updateFilePath}"`,
        `/progress="${progressFilePath}"`,
        `/sessionend="${sessionEndFlagPath}"`,
        `/cancel="${cancelFilePath}"`,
        "/nocloseapplications",
        "/mergetasks=runcode,!desktopicon,!quicklaunchicon"
      ];
      const relaunchArgsFilePath = this.getRelaunchArgumentsFilePath(cachePath, update.version);
      installerArgs.push(`/relaunchargs="${relaunchArgsFilePath}"`);
      const child = spawn(
        this.availableUpdate.packagePath,
        installerArgs,
        {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          windowsVerbatimArguments: true,
          env: { ...process.env, __COMPAT_LAYER: "RunAsInvoker" }
        }
      );
      this.availableUpdate.updateProcess = child;
      child.once("exit", () => {
        this.availableUpdate = void 0;
        this.setState(State.Idle(getUpdateType()));
      });
    }
    this.updateCancellationTokenSource?.dispose(true);
    const cts = this.updateCancellationTokenSource = new CancellationTokenSource();
    const token = cts.token;
    const poll = async () => {
      let seenRunning = skippedSpawn;
      while (this.state.type === StateType.Updating && !token.isCancellationRequested) {
        if (mutex.isActive(this.readyMutexName)) {
          this.setState(State.Ready(update, explicit, this._overwrite));
          return;
        }
        if (this.isInstallerActive(mutex)) {
          seenRunning = true;
        } else if (seenRunning) {
          if (!this.availableUpdate?.updateProcess) {
            this.availableUpdate = void 0;
            this.setState(State.Idle(getUpdateType()));
          }
          return;
        }
        try {
          const progressContent = await readFile(progressFilePath, "utf8");
          if (!token.isCancellationRequested) {
            const [currentStr, maxStr] = progressContent.split(",");
            const currentProgress = parseInt(currentStr, 10);
            const maxProgress = parseInt(maxStr, 10);
            if (!isNaN(currentProgress) && !isNaN(maxProgress) && this.state.type === StateType.Updating) {
              if (this.state.currentProgress !== currentProgress || this.state.maxProgress !== maxProgress) {
                this.setState(State.Updating(update, explicit, currentProgress, maxProgress));
              }
            }
          }
        } catch {
        }
        await timeout(500);
      }
    };
    const cancelTimeout = new ProcessTimeRunOnceScheduler(() => {
      this.logService.warn("update#doApplyUpdate: polling timed out waiting for update to be ready");
      this.setState(State.Idle(getUpdateType(), "Update did not complete within expected time"));
    }, 60 * 60 * 1e3);
    cancelTimeout.schedule();
    poll().finally(() => {
      cancelTimeout.dispose();
      if (this.updateCancellationTokenSource === cts) {
        this.updateCancellationTokenSource = void 0;
      }
      cts.dispose();
    });
  }
  async cancelUpdate() {
    const hadInFlightCheck = !!this.checkCancellationTokenSource;
    const hadPendingUpdate = !!this.availableUpdate;
    this.checkCancellationTokenSource?.dispose(true);
    this.checkCancellationTokenSource = void 0;
    if (hadInFlightCheck) {
      try {
        await this.checkPromise;
      } catch {
      }
      await this.cleanupTempFiles();
    }
    await this.cancelPendingUpdate();
    if (hadInFlightCheck || hadPendingUpdate) {
      this.collectGarbage().catch((err) => this.logService.error("update#collectGarbage - failed to collect garbage", err));
    }
  }
  async cleanupTempFiles() {
    try {
      const cachePath = await this.cachePath;
      const files = await pfs.Promises.readdir(cachePath);
      await Promise.all(files.filter((file) => file.endsWith(".tmp")).map((file) => this.unlink(path.join(cachePath, file))));
    } catch (err) {
      this.logService.warn("update#cleanupTempFiles: failed to remove temporary download files", err);
    }
  }
  async cancelPendingUpdate() {
    if (!this.availableUpdate) {
      return;
    }
    const { updateProcess, updateFilePath, cancelFilePath } = this.availableUpdate;
    if (!updateProcess && this.isInstallerActive(await this.mutex)) {
      throw new Error("Cannot cancel pending update: another instance is still running setup");
    }
    this.updateCancellationTokenSource?.dispose(true);
    this.updateCancellationTokenSource = void 0;
    if (updateProcess && updateProcess.exitCode === null) {
      this.logService.trace("update#cancelPendingUpdate: cancelling pending update");
      updateProcess.removeAllListeners();
      const exitPromise = new Promise((resolve) => updateProcess.once("exit", () => resolve(true)));
      if (cancelFilePath) {
        try {
          await pfs.Promises.writeFile(cancelFilePath, "cancel");
        } catch (err) {
          this.logService.warn("update#cancelPendingUpdate: failed to write cancel file", err);
        }
      }
      const pid = updateProcess.pid;
      const exited = await Promise.race([exitPromise, timeout(30 * 1e3).then(() => false)]);
      if (pid && !exited) {
        this.logService.trace("update#cancelPendingUpdate: process did not exit gracefully, killing process tree");
        await killTree(pid, true);
      }
    }
    await this.unlink(updateFilePath);
    await this.unlink(cancelFilePath);
    this.availableUpdate = void 0;
  }
  doQuitAndInstall() {
    if (this.state.type !== StateType.Ready && this.state.type !== StateType.Restarting || !this.availableUpdate) {
      return;
    }
    this.logService.trace("update#quitAndInstall(): running raw#quitAndInstall()");
    if (this.availableUpdate.updateFilePath) {
      this.writeRelaunchArgumentsFile(this.cachePathSync, this.state.update.version);
      try {
        unlinkSync(this.availableUpdate.updateFilePath);
      } catch {
      }
    } else {
      const installerArgs = ["/silent", "/log", "/mergetasks=runcode,!desktopicon,!quicklaunchicon"];
      const relaunchArgsFilePath = this.writeRelaunchArgumentsFile(this.cachePathSync, this.state.update.version);
      if (relaunchArgsFilePath) {
        installerArgs.push(`/relaunchargs="${relaunchArgsFilePath}"`);
      }
      spawn(this.availableUpdate.packagePath, installerArgs, {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
        windowsVerbatimArguments: true,
        env: { ...process.env, __COMPAT_LAYER: "RunAsInvoker" }
      });
    }
  }
  getRelaunchArgumentsFilePath(cachePath, version) {
    return path.join(cachePath, `${RELAUNCH_ARGUMENTS_FILE_PREFIX}${version}`);
  }
  /**
   * Writes the arguments from {@link getRelaunchArguments} to a file in the update cache and returns its path (or
   * `undefined` when there is nothing to carry forward). The installer reads it and passes the arguments to `Code.exe`.
   */
  writeRelaunchArgumentsFile(cachePath, version) {
    const relaunchArguments = getRelaunchArguments(this.environmentMainService.args, process.argv);
    const relaunchArgsFilePath = this.getRelaunchArgumentsFilePath(cachePath, version);
    if (!relaunchArguments) {
      try {
        unlinkSync(relaunchArgsFilePath);
      } catch {
      }
      return void 0;
    }
    try {
      writeFileSync(relaunchArgsFilePath, relaunchArguments);
      return relaunchArgsFilePath;
    } catch (err) {
      this.logService.error("update#writeRelaunchArgumentsFile: failed to write relaunch arguments", err);
      return void 0;
    }
  }
  async saveUpdateMetadata(update) {
    try {
      const cachePath = await this.cachePath;
      const metadataPath = path.join(cachePath, "update-metadata.json");
      await pfs.Promises.writeFile(metadataPath, JSON.stringify(update));
    } catch (e) {
      this.logService.error("update#saveUpdateMetadata: failed to save", e);
    }
  }
  async loadUpdateMetadata() {
    try {
      const cachePath = await this.cachePath;
      const metadataPath = path.join(cachePath, "update-metadata.json");
      if (await pfs.Promises.exists(metadataPath)) {
        const content = await readFile(metadataPath, "utf8");
        return JSON.parse(content);
      }
    } catch (e) {
      this.logService.error("update#loadUpdateMetadata: failed to load", e);
    }
    return void 0;
  }
  getUpdateType() {
    return getUpdateType();
  }
  async _applySpecificUpdate(packagePath, commit) {
    if (this.state.type !== StateType.Idle) {
      return;
    }
    const fastUpdatesEnabled = this.configurationService.getValue("update.enableWindowsBackgroundUpdates");
    const update = await this.loadUpdateMetadata() ?? { version: commit ?? "unknown", productVersion: "unknown" };
    this.setState(State.Downloading(update, true, false));
    this.availableUpdate = { packagePath };
    this.setState(State.Downloaded(update, true, false));
    if (fastUpdatesEnabled && this.productService.target === "user") {
      this.doApplyUpdate();
    } else {
      this.setState(State.Ready(update, true, false));
    }
  }
  isInstallerActive(mutex) {
    return mutex.isActive(this.updatingMutexName) || mutex.isActive(this.setupMutexName);
  }
  async unlink(path2) {
    if (path2) {
      try {
        await unlink(path2);
      } catch (err) {
        const error = err;
        if (error && error.code === "ENOENT") {
          return;
        } else {
          this.logService.warn(`update#unlink: failed to unlink ${basename(path2)}`, err);
        }
      }
    }
  }
};
__decorateClass([
  memoize
], Win32UpdateService.prototype, "cachePath", 1);
__decorateClass([
  memoize
], Win32UpdateService.prototype, "mutex", 1);
Win32UpdateService = __decorateClass([
  __decorateParam(0, ILifecycleMainService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, IRequestService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IFileService),
  __decorateParam(7, INativeHostMainService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IApplicationStorageMainService),
  __decorateParam(10, IMeteredConnectionService)
], Win32UpdateService);
export {
  Win32UpdateService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXBkYXRlXFxlbGVjdHJvbi1tYWluXFx1cGRhdGVTZXJ2aWNlLndpbjMyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgYXBwIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgdW5saW5rU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IG1rZGlyLCByZWFkRmlsZSwgdW5saW5rIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgcmVsZWFzZSwgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgRGVsYXllciwgUHJvY2Vzc1RpbWVSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IHRyYW5zZm9ybSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY2hlY2tzdW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvY3J5cHRvLmpzJztcbmltcG9ydCAqIGFzIHBmcyBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGtpbGxUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dzUmVsZWFzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS93aW5kb3dzVmVyc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIElSZWxhdW5jaEhhbmRsZXIsIElSZWxhdW5jaE9wdGlvbnMgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL25hdGl2ZS9lbGVjdHJvbi1tYWluL25hdGl2ZUhvc3RNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9lbGVjdHJvbi1tYWluL3N0b3JhZ2VNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEF2YWlsYWJsZUZvckRvd25sb2FkLCBEaXNhYmxlbWVudFJlYXNvbiwgSVVwZGF0ZSwgU3RhdGUsIFN0YXRlVHlwZSwgVXBkYXRlVHlwZSB9IGZyb20gJy4uL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RVcGRhdGVTZXJ2aWNlLCBjcmVhdGVVcGRhdGVVUkwsIGdldFVwZGF0ZVJlcXVlc3RIZWFkZXJzLCBJVXBkYXRlVVJMT3B0aW9ucywgVXBkYXRlRXJyb3JDbGFzc2lmaWNhdGlvbiB9IGZyb20gJy4vYWJzdHJhY3RVcGRhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlbGF1bmNoQXJndW1lbnRzIH0gZnJvbSAnLi91cGRhdGVSZWxhdW5jaEFyZ3VtZW50cy5qcyc7XG5pbXBvcnQgeyBnZXRXaW4zMlVwZGF0ZVR5cGUgfSBmcm9tICcuL3dpbjMyVXBkYXRlVHlwZS5qcyc7XG5cbmludGVyZmFjZSBJQXZhaWxhYmxlVXBkYXRlIHtcblx0cGFja2FnZVBhdGg6IHN0cmluZztcblx0dXBkYXRlRmlsZVBhdGg/OiBzdHJpbmc7XG5cdC8qKiBGaWxlIHBhdGggdXNlZCB0byBzaWduYWwgdGhlIElubm8gU2V0dXAgaW5zdGFsbGVyIHRvIGNhbmNlbCAqL1xuXHRjYW5jZWxGaWxlUGF0aD86IHN0cmluZztcblx0LyoqIFRoZSBJbm5vIFNldHVwIHByb2Nlc3MgdGhhdCBpcyBhcHBseWluZyB0aGUgdXBkYXRlIGluIHRoZSBiYWNrZ3JvdW5kICovXG5cdHVwZGF0ZVByb2Nlc3M/OiBDaGlsZFByb2Nlc3M7XG59XG5cbmNvbnN0IFJFTEFVTkNIX0FSR1VNRU5UU19GSUxFX1BSRUZJWCA9ICdyZWxhdW5jaC1hcmdzLSc7XG5cbmxldCBfdXBkYXRlVHlwZTogVXBkYXRlVHlwZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbmZ1bmN0aW9uIGdldFVwZGF0ZVR5cGUoKTogVXBkYXRlVHlwZSB7XG5cdGlmICh0eXBlb2YgX3VwZGF0ZVR5cGUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0X3VwZGF0ZVR5cGUgPSBnZXRXaW4zMlVwZGF0ZVR5cGUoKTtcblx0fVxuXG5cdHJldHVybiBfdXBkYXRlVHlwZTtcbn1cblxuZXhwb3J0IGNsYXNzIFdpbjMyVXBkYXRlU2VydmljZSBleHRlbmRzIEFic3RyYWN0VXBkYXRlU2VydmljZSBpbXBsZW1lbnRzIElSZWxhdW5jaEhhbmRsZXIge1xuXG5cdHByaXZhdGUgYXZhaWxhYmxlVXBkYXRlOiBJQXZhaWxhYmxlVXBkYXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHVwZGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0LyoqIENhbmNlbHMgYW4gaW4tZmxpZ2h0IGNoZWNrL2Rvd25sb2FkIGNoYWluIChlLmcuIHdoZW4gdXBkYXRlcyBhcmUgZGlzYWJsZWQgYXQgcnVudGltZSkuICovXG5cdHByaXZhdGUgY2hlY2tDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdC8qKiBTZXR0bGVzIHdoZW4gdGhlIGluLWZsaWdodCBjaGVjay9kb3dubG9hZCBjaGFpbiBoYXMgZnVsbHkgdW53b3VuZDsgdXNlZCBieSB0aGUgY2FuY2VsIHBhdGguICovXG5cdHByaXZhdGUgY2hlY2tQcm9taXNlOiBQcm9taXNlPHVua25vd24+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVhZHlNdXRleE5hbWU6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGluZ011dGV4TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNldHVwTXV0ZXhOYW1lOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBnZXQgY2FjaGVQYXRoU3luYygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBwYXRoLmpvaW4odG1wZGlyKCksIGB2c2NvZGUtJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHl9LSR7dGhpcy5wcm9kdWN0U2VydmljZS50YXJnZXR9LSR7cHJvY2Vzcy5hcmNofWApO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGNhY2hlUGF0aCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY2FjaGVQYXRoU3luYztcblx0XHRyZXR1cm4gbWtkaXIocmVzdWx0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KS50aGVuKCgpID0+IHJlc3VsdCk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIGdldCBtdXRleCgpOiBQcm9taXNlPHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1tdXRleCcpPiB7XG5cdFx0cmV0dXJuIGltcG9ydCgnQHZzY29kZS93aW5kb3dzLW11dGV4Jyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIGxpZmVjeWNsZU1haW5TZXJ2aWNlOiBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgZW52aXJvbm1lbnRNYWluU2VydmljZTogSUVudmlyb25tZW50TWFpblNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RNYWluU2VydmljZTogSU5hdGl2ZUhvc3RNYWluU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSBhcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZTogSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLFxuXHRcdEBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIG1ldGVyZWRDb25uZWN0aW9uU2VydmljZTogSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGlmZWN5Y2xlTWFpblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlbnZpcm9ubWVudE1haW5TZXJ2aWNlLCByZXF1ZXN0U2VydmljZSwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLCBtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsIHRydWUpO1xuXG5cdFx0dGhpcy5yZWFkeU11dGV4TmFtZSA9IGAke3Byb2R1Y3RTZXJ2aWNlLndpbjMyTXV0ZXhOYW1lfS1yZWFkeWA7XG5cdFx0dGhpcy51cGRhdGluZ011dGV4TmFtZSA9IGAke3Byb2R1Y3RTZXJ2aWNlLndpbjMyTXV0ZXhOYW1lfS11cGRhdGluZ2A7XG5cdFx0dGhpcy5zZXR1cE11dGV4TmFtZSA9IGAke3Byb2R1Y3RTZXJ2aWNlLndpbjMyTXV0ZXhOYW1lfXNldHVwYDtcblxuXHRcdGxpZmVjeWNsZU1haW5TZXJ2aWNlLnNldFJlbGF1bmNoSGFuZGxlcih0aGlzKTtcblx0fVxuXG5cdGhhbmRsZVJlbGF1bmNoKG9wdGlvbnM/OiBJUmVsYXVuY2hPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0aWYgKG9wdGlvbnM/LmFkZEFyZ3MgfHwgb3B0aW9ucz8ucmVtb3ZlQXJncykge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSBjYW5ub3QgYXBwbHkgYW4gdXBkYXRlIGFuZCByZXN0YXJ0IHdpdGggZGlmZmVyZW50IGFyZ3Ncblx0XHR9XG5cblx0XHRpZiAodGhpcy5zdGF0ZS50eXBlICE9PSBTdGF0ZVR5cGUuUmVhZHkgfHwgIXRoaXMuYXZhaWxhYmxlVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIG9ubHkgaGFuZGxlIHRoZSByZWxhdW5jaCB3aGVuIHdlIGhhdmUgYSBwZW5kaW5nIHVwZGF0ZVxuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI2hhbmRsZVJlbGF1bmNoKCk6IHJ1bm5pbmcgcmF3I3F1aXRBbmRJbnN0YWxsKCknKTtcblx0XHR0aGlzLmRvUXVpdEFuZEluc3RhbGwoKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2Uud2luMzJWZXJzaW9uZWRVcGRhdGUpIHtcblx0XHRcdGNvbnN0IGNhY2hlUGF0aCA9IGF3YWl0IHRoaXMuY2FjaGVQYXRoO1xuXHRcdFx0YXBwLnNldFBhdGgoJ2FwcFVwZGF0ZScsIGNhY2hlUGF0aCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVubGluayhwYXRoLmpvaW4oY2FjaGVQYXRoLCAnc2Vzc2lvbi1lbmRpbmcuZmxhZycpKTtcblx0XHR9XG5cblx0XHQvLyBTZW5kIHRlbGVtZXRyeVxuXHRcdHR5cGUgV2luZG93c1VwZGF0ZUluaXRFdmVudCA9IHtcblx0XHRcdG9zUmVsZWFzZTogc3RyaW5nO1xuXHRcdFx0b3NOb2RlUmVsZWFzZTogc3RyaW5nO1xuXHRcdH07XG5cdFx0dHlwZSBXaW5kb3dzVXBkYXRlSW5pdENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3NSZWxlYXNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIFdpbmRvd3MgT1MgcmVsZWFzZSB2ZXJzaW9uIGZyb20gcmVnaXN0cnkuJyB9O1xuXHRcdFx0b3NOb2RlUmVsZWFzZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBXaW5kb3dzIE9TIHJlbGVhc2UgdmVyc2lvbiBmcm9tIG9zLnJlbGVhc2UoKS4nIH07XG5cdFx0XHRvd25lcjogJ2RtaXRyaXYnO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrcyBXaW5kb3dzIE9TIHJlbGVhc2UgaW5mb3JtYXRpb24gZHVyaW5nIHVwZGF0ZSBpbml0aWFsaXphdGlvbi4nO1xuXHRcdH07XG5cdFx0Y29uc3Qgb3NSZWxlYXNlID0gYXdhaXQgZ2V0V2luZG93c1JlbGVhc2UoKTtcblx0XHRjb25zdCBvc05vZGVSZWxlYXNlID0gcmVsZWFzZSgpO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdpbmRvd3NVcGRhdGVJbml0RXZlbnQsIFdpbmRvd3NVcGRhdGVJbml0Q2xhc3NpZmljYXRpb24+KCd3aW5kb3dzVXBkYXRlSW5pdCcsIHsgb3NSZWxlYXNlLCBvc05vZGVSZWxlYXNlIH0pO1xuXG5cdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UudGFyZ2V0ID09PSAndXNlcicgJiYgYXdhaXQgdGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2UuaXNBZG1pbih1bmRlZmluZWQpKSB7XG5cdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkRpc2FibGVkKERpc2FibGVtZW50UmVhc29uLlJ1bm5pbmdBc0FkbWluKSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2N0b3IgLSB1cGRhdGVzIGFyZSBkaXNhYmxlZCBkdWUgdG8gcnVubmluZyBhcyBBZG1pbiBpbiB1c2VyIHNldHVwJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgc3VwZXIuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHBvc3RJbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5wcm9kdWN0U2VydmljZS53aW4zMlZlcnNpb25lZFVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDaGVjayBmb3IgcGVuZGluZyB1cGRhdGUgZnJvbSBwcmV2aW91cyBzZXNzaW9uXG5cdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSBhcHAgaXMgcXVpdCByaWdodCBhZnRlciB0aGUgdXBkYXRlIGhhcyBiZWVuXG5cdFx0Ly8gZG93bmxvYWRlZCBhbmQgYmVmb3JlIHRoZSB1cGRhdGUgaGFzIGJlZW4gYXBwbGllZC5cblx0XHRjb25zdCBleGVQYXRoID0gYXBwLmdldFBhdGgoJ2V4ZScpO1xuXHRcdGNvbnN0IGV4ZURpciA9IHBhdGguZGlybmFtZShleGVQYXRoKTtcblx0XHRjb25zdCB1cGRhdGluZ1ZlcnNpb25QYXRoID0gcGF0aC5qb2luKGV4ZURpciwgJ3VwZGF0aW5nX3ZlcnNpb24nKTtcblx0XHRpZiAoYXdhaXQgcGZzLlByb21pc2VzLmV4aXN0cyh1cGRhdGluZ1ZlcnNpb25QYXRoKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXBkYXRpbmdWZXJzaW9uID0gKGF3YWl0IHJlYWRGaWxlKHVwZGF0aW5nVmVyc2lvblBhdGgsICd1dGY4JykpLnRyaW0oKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYHVwZGF0ZSNkb0NoZWNrRm9yVXBkYXRlcyAtIGFwcGxpY2F0aW9uIHdhcyB1cGRhdGluZyB0byB2ZXJzaW9uICR7dXBkYXRpbmdWZXJzaW9ufWApO1xuXHRcdFx0XHRjb25zdCB1cGRhdGVQYWNrYWdlUGF0aCA9IGF3YWl0IHRoaXMuZ2V0VXBkYXRlUGFja2FnZVBhdGgodXBkYXRpbmdWZXJzaW9uKTtcblx0XHRcdFx0aWYgKGF3YWl0IHBmcy5Qcm9taXNlcy5leGlzdHModXBkYXRlUGFja2FnZVBhdGgpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlTcGVjaWZpY1VwZGF0ZSh1cGRhdGVQYWNrYWdlUGF0aCwgdXBkYXRpbmdWZXJzaW9uKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgdXBkYXRlI2RvQ2hlY2tGb3JVcGRhdGVzIC0gc3VjY2Vzc2Z1bGx5IGFwcGxpZWQgdXBkYXRlIHRvIHZlcnNpb24gJHt1cGRhdGluZ1ZlcnNpb259YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGB1cGRhdGUjZG9DaGVja0ZvclVwZGF0ZXMgLSBjb3VsZCBub3QgcmVhZCAke3VwZGF0aW5nVmVyc2lvblBhdGh9YCwgZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHQvLyB1cGRhdGluZ1ZlcnNpb25QYXRoIHdpbGwgYmUgZGVsZXRlZCBieSBpbm5vIHNldHVwLlxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbGxlY3RHYXJiYWdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb2xsZWN0R2FyYmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2Uud2luMzJWZXJzaW9uZWRVcGRhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmYXN0VXBkYXRlc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd1cGRhdGUuZW5hYmxlV2luZG93c0JhY2tncm91bmRVcGRhdGVzJyk7XG5cdFx0Ly8gR0MgZm9yIGJhY2tncm91bmQgdXBkYXRlcyBpbiBzeXN0ZW0gc2V0dXAgaGFwcGVucyB2aWEgaW5ub19zZXR1cCBzaW5jZSBpdCByZXF1aXJlcyBlbGV2YXRlZCBwZXJtaXNzaW9ucy5cblx0XHRpZiAoIWZhc3RVcGRhdGVzRW5hYmxlZCB8fCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnRhcmdldCAhPT0gJ3VzZXInIHx8ICF0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZVBhdGggPSBhcHAuZ2V0UGF0aCgnZXhlJyk7XG5cdFx0Y29uc3QgZXhlRGlyID0gcGF0aC5kaXJuYW1lKGV4ZVBhdGgpO1xuXHRcdGNvbnN0IHZlcnNpb25lZFJlc291cmNlc0ZvbGRlciA9IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0LnN1YnN0cmluZygwLCAxMCk7XG5cdFx0Y29uc3QgaW5ub1VwZGF0ZXIgPSBwYXRoLmpvaW4oZXhlRGlyLCB2ZXJzaW9uZWRSZXNvdXJjZXNGb2xkZXIsICd0b29scycsICdpbm5vX3VwZGF0ZXIuZXhlJyk7XG5cdFx0Y29uc3QgZXhlTmFtZSA9IGJhc2VuYW1lKGV4ZVBhdGgpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBzcGF3bihpbm5vVXBkYXRlciwgWyctLWdjJywgZXhlUGF0aCwgdmVyc2lvbmVkUmVzb3VyY2VzRm9sZGVyLCBleGVOYW1lXSwge1xuXHRcdFx0XHRzdGRpbzogWydpZ25vcmUnLCAnaWdub3JlJywgJ2lnbm9yZSddLFxuXHRcdFx0XHR3aW5kb3dzSGlkZTogdHJ1ZSxcblx0XHRcdFx0dGltZW91dDogMiAqIDYwICogMTAwMFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBSZXNvbHZlIG9uICdlcnJvcicgdG9vIChtaXNzaW5nIGlubm9fdXBkYXRlciAvIHBlcm1pc3Npb24gZGVuaWVkKSBzbyB0aGUgYXdhaXRlZCBwcm9taXNlIGFsd2F5cyBzZXR0bGVzLlxuXHRcdFx0Y2hpbGQub25jZSgnZXJyb3InLCBlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3VwZGF0ZSNjb2xsZWN0R2FyYmFnZSAtIGZhaWxlZCB0byBzcGF3biBpbm5vX3VwZGF0ZXInLCBlcnIpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KTtcblx0XHRcdGNoaWxkLm9uY2UoJ2V4aXQnLCAoKSA9PiByZXNvbHZlKCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGJ1aWxkVXBkYXRlRmVlZFVybChxdWFsaXR5OiBzdHJpbmcsIGNvbW1pdDogc3RyaW5nLCBvcHRpb25zPzogSVVwZGF0ZVVSTE9wdGlvbnMpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBwbGF0Zm9ybSA9IGB3aW4zMi0ke3Byb2Nlc3MuYXJjaH1gO1xuXG5cdFx0aWYgKGdldFVwZGF0ZVR5cGUoKSA9PT0gVXBkYXRlVHlwZS5BcmNoaXZlKSB7XG5cdFx0XHRwbGF0Zm9ybSArPSAnLWFyY2hpdmUnO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5wcm9kdWN0U2VydmljZS50YXJnZXQgPT09ICd1c2VyJykge1xuXHRcdFx0cGxhdGZvcm0gKz0gJy11c2VyJztcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlVXBkYXRlVVJMKHRoaXMucHJvZHVjdFNlcnZpY2UudXBkYXRlVXJsISwgcGxhdGZvcm0sIHF1YWxpdHksIGNvbW1pdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9DaGVja0ZvclVwZGF0ZXMoZXhwbGljaXQ6IGJvb2xlYW4sIHBlbmRpbmdDb21taXQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucXVhbGl0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGludGVybmFsT3JnID0gdGhpcy5nZXRJbnRlcm5hbE9yZygpO1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSAhZXhwbGljaXQgJiYgIWludGVybmFsT3JnO1xuXHRcdGNvbnN0IHVybCA9IHRoaXMuYnVpbGRVcGRhdGVGZWVkVXJsKHRoaXMucXVhbGl0eSwgcGVuZGluZ0NvbW1pdCA/PyB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCEsIHsgYmFja2dyb3VuZCwgaW50ZXJuYWxPcmcgfSk7XG5cblx0XHQvLyBPbmx5IHNldCBDaGVja2luZ0ZvclVwZGF0ZXMgaWYgd2UncmUgbm90IGFscmVhZHkgaW4gT3ZlcndyaXRpbmcgc3RhdGVcblx0XHRpZiAodGhpcy5zdGF0ZS50eXBlICE9PSBTdGF0ZVR5cGUuT3ZlcndyaXRpbmcpIHtcblx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuQ2hlY2tpbmdGb3JVcGRhdGVzKGV4cGxpY2l0KSk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgdGhpcyBjaGVjay9kb3dubG9hZCBjaGFpbiBzbyBpdCBjYW4gYmUgY2FuY2VsbGVkIGlmIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGF0IHJ1bnRpbWUuXG5cdFx0dGhpcy5jaGVja0NhbmNlbGxhdGlvblRva2VuU291cmNlPy5kaXNwb3NlKHRydWUpO1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMuY2hlY2tDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGdldFVwZGF0ZVJlcXVlc3RIZWFkZXJzKHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbik7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7IHVybCwgaGVhZGVycywgY2FsbFNpdGU6ICd1cGRhdGVTZXJ2aWNlLndpbjMyLmNoZWNrRm9yVXBkYXRlcycgfSwgdG9rZW4pXG5cdFx0XHQudGhlbjxJVXBkYXRlIHwgbnVsbD4oYXNKc29uKVxuXHRcdFx0LnRoZW4odXBkYXRlID0+IHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlVHlwZSA9IGdldFVwZGF0ZVR5cGUoKTtcblxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF1cGRhdGUgfHwgIXVwZGF0ZS51cmwgfHwgIXVwZGF0ZS52ZXJzaW9uIHx8ICF1cGRhdGUucHJvZHVjdFZlcnNpb24pIHtcblx0XHRcdFx0XHQvLyBJZiB3ZSB3ZXJlIGNoZWNraW5nIGZvciBhbiBvdmVyd3JpdGUgdXBkYXRlIGFuZCBmb3VuZCBub3RoaW5nIG5ld2VyLFxuXHRcdFx0XHRcdC8vIHJlc3RvcmUgdGhlIFJlYWR5IHN0YXRlIHdpdGggdGhlIHBlbmRpbmcgdXBkYXRlXG5cdFx0XHRcdFx0aWYgKHRoaXMuc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLk92ZXJ3cml0aW5nKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vdmVyd3JpdGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuUmVhZHkodGhpcy5zdGF0ZS51cGRhdGUsIHRoaXMuc3RhdGUuZXhwbGljaXQsIGZhbHNlKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuSWRsZSh1cGRhdGVUeXBlLCB1bmRlZmluZWQsIGV4cGxpY2l0IHx8IHVuZGVmaW5lZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHVwZGF0ZVR5cGUgPT09IFVwZGF0ZVR5cGUuQXJjaGl2ZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuQXZhaWxhYmxlRm9yRG93bmxvYWQodXBkYXRlKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdoZW4gY29ubmVjdGlvbiBpcyBtZXRlcmVkIGFuZCB0aGlzIGlzIG5vdCBhbiBleHBsaWNpdCBjaGVjayxcblx0XHRcdFx0Ly8gc2hvdyB1cGRhdGUgaXMgYXZhaWxhYmxlIGJ1dCBkb24ndCBzdGFydCBkb3dubG9hZGluZ1xuXHRcdFx0XHRpZiAoIWV4cGxpY2l0ICYmIHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmlzQ29ubmVjdGlvbk1ldGVyZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2RvQ2hlY2tGb3JVcGRhdGVzIC0gdXBkYXRlIGF2YWlsYWJsZSBidXQgc2tpcHBpbmcgZG93bmxvYWQgYmVjYXVzZSBjb25uZWN0aW9uIGlzIG1ldGVyZWQnKTtcblx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkF2YWlsYWJsZUZvckRvd25sb2FkKHVwZGF0ZSkpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkRvd25sb2FkaW5nKHVwZGF0ZSwgZXhwbGljaXQsIHRoaXMuX292ZXJ3cml0ZSwgMCwgdW5kZWZpbmVkLCBzdGFydFRpbWUpKTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5jbGVhbnVwKHVwZGF0ZS52ZXJzaW9uKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRVcGRhdGVQYWNrYWdlUGF0aCh1cGRhdGUudmVyc2lvbikudGhlbih1cGRhdGVQYWNrYWdlUGF0aCA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGZzLlByb21pc2VzLmV4aXN0cyh1cGRhdGVQYWNrYWdlUGF0aCkudGhlbihleGlzdHMgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1cGRhdGVQYWNrYWdlUGF0aCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRjb25zdCBkb3dubG9hZFBhdGggPSBgJHt1cGRhdGVQYWNrYWdlUGF0aH0udG1wYDtcblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHsgdXJsOiB1cGRhdGUudXJsLCBjYWxsU2l0ZTogJ3VwZGF0ZVNlcnZpY2Uud2luMzIuZG93bmxvYWRVcGRhdGUnIH0sIHRva2VuKVxuXHRcdFx0XHRcdFx0XHRcdC50aGVuKGNvbnRleHQgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gR2V0IHRvdGFsIHNpemUgZnJvbSBDb250ZW50LUxlbmd0aCBoZWFkZXJcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRMZW5ndGhIZWFkZXIgPSBjb250ZXh0LnJlcy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGVudExlbmd0aCA9IHR5cGVvZiBjb250ZW50TGVuZ3RoSGVhZGVyID09PSAnc3RyaW5nJyA/IGNvbnRlbnRMZW5ndGhIZWFkZXIgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB0b3RhbEJ5dGVzID0gY29udGVudExlbmd0aCA/IHBhcnNlSW50KGNvbnRlbnRMZW5ndGgsIDEwKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gVHJhY2sgZG93bmxvYWRlZCBieXRlcyBhbmQgdXBkYXRlIHN0YXRlIHBlcmlvZGljYWxseSB1c2luZyBEZWxheWVyXG5cdFx0XHRcdFx0XHRcdFx0XHRsZXQgZG93bmxvYWRlZEJ5dGVzID0gMDtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzRGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwMCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc1N0cmVhbSA9IHRyYW5zZm9ybTxWU0J1ZmZlciwgVlNCdWZmZXI+KFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZXh0LnN0cmVhbSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRhdGE6IGRhdGEgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZG93bmxvYWRlZEJ5dGVzICs9IGRhdGEuYnl0ZUxlbmd0aDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHByb2dyZXNzRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5Eb3dubG9hZGluZyh1cGRhdGUsIGV4cGxpY2l0LCB0aGlzLl9vdmVyd3JpdGUsIGRvd25sb2FkZWRCeXRlcywgdG90YWxCeXRlcywgc3RhcnRUaW1lKSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBkYXRhO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2h1bmtzID0+IFZTQnVmZmVyLmNvbmNhdChjaHVua3MpXG5cdFx0XHRcdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUoZG93bmxvYWRQYXRoKSwgcHJvZ3Jlc3NTdHJlYW0pXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC5maW5hbGx5KCgpID0+IHByb2dyZXNzRGVsYXllci5kaXNwb3NlKCkpO1xuXHRcdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRcdFx0LnRoZW4odXBkYXRlLnNoYTI1Nmhhc2ggPyAoKSA9PiBjaGVja3N1bShkb3dubG9hZFBhdGgsIHVwZGF0ZS5zaGEyNTZoYXNoKSA6ICgpID0+IHVuZGVmaW5lZClcblx0XHRcdFx0XHRcdFx0XHQudGhlbigoKSA9PiBwZnMuUHJvbWlzZXMucmVuYW1lKGRvd25sb2FkUGF0aCwgdXBkYXRlUGFja2FnZVBhdGgsIGZhbHNlIC8qIG5vIHJldHJ5ICovKSlcblx0XHRcdFx0XHRcdFx0XHQudGhlbigoKSA9PiB1cGRhdGVQYWNrYWdlUGF0aCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KS50aGVuKHBhY2thZ2VQYXRoID0+IHtcblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlID0geyBwYWNrYWdlUGF0aCB9O1xuXHRcdFx0XHRcdFx0dGhpcy5zYXZlVXBkYXRlTWV0YWRhdGEodXBkYXRlKTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuRG93bmxvYWRlZCh1cGRhdGUsIGV4cGxpY2l0LCB0aGlzLl9vdmVyd3JpdGUpKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgZmFzdFVwZGF0ZXNFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgndXBkYXRlLmVuYWJsZVdpbmRvd3NCYWNrZ3JvdW5kVXBkYXRlcycpO1xuXHRcdFx0XHRcdFx0aWYgKGZhc3RVcGRhdGVzRW5hYmxlZCAmJiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnRhcmdldCA9PT0gJ3VzZXInKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZG9BcHBseVVwZGF0ZSgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5SZWFkeSh1cGRhdGUsIGV4cGxpY2l0LCB0aGlzLl9vdmVyd3JpdGUpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdFx0LnRoZW4odW5kZWZpbmVkLCBlcnIgPT4ge1xuXHRcdFx0XHQvLyBUaGUgY2hhaW4gd2FzIGNhbmNlbGxlZCBiZWNhdXNlIHVwZGF0ZXMgYXJlIGJlaW5nIGRpc2FibGVkOyBsZWF2ZSBzdGF0ZSB0byB0aGUgZGlzYWJsZSBmbG93LlxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBtZXNzYWdlSGFzaDogc3RyaW5nIH0sIFVwZGF0ZUVycm9yQ2xhc3NpZmljYXRpb24+KCd1cGRhdGU6ZXJyb3InLCB7IG1lc3NhZ2VIYXNoOiBTdHJpbmcoaGFzaChTdHJpbmcoZXJyKSkpIH0pO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblxuXHRcdFx0XHQvLyBvbmx5IHNob3cgbWVzc2FnZSB3aGVuIGV4cGxpY2l0bHkgY2hlY2tpbmcgZm9yIHVwZGF0ZXNcblx0XHRcdFx0Y29uc3QgbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gZXhwbGljaXQgPyAoZXJyLm1lc3NhZ2UgfHwgZXJyKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBJZiB3ZSB3ZXJlIGNoZWNraW5nIGZvciBhbiBvdmVyd3JpdGUgdXBkYXRlIGFuZCBpdCBmYWlsZWQsXG5cdFx0XHRcdC8vIHJlc3RvcmUgdGhlIFJlYWR5IHN0YXRlIHdpdGggdGhlIHBlbmRpbmcgdXBkYXRlXG5cdFx0XHRcdGlmICh0aGlzLnN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5PdmVyd3JpdGluZykge1xuXHRcdFx0XHRcdHRoaXMuX292ZXJ3cml0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuUmVhZHkodGhpcy5zdGF0ZS51cGRhdGUsIHRoaXMuc3RhdGUuZXhwbGljaXQsIGZhbHNlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5JZGxlKGdldFVwZGF0ZVR5cGUoKSwgbWVzc2FnZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdHRoaXMuY2hlY2tQcm9taXNlID0gcHJvbWlzZTtcblxuXHRcdHByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jaGVja0NhbmNlbGxhdGlvblRva2VuU291cmNlID09PSBjdHMpIHtcblx0XHRcdFx0dGhpcy5jaGVja0NhbmNlbGxhdGlvblRva2VuU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY2hlY2tQcm9taXNlID09PSBwcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuY2hlY2tQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb0Rvd25sb2FkVXBkYXRlKHN0YXRlOiBBdmFpbGFibGVGb3JEb3dubG9hZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzdGF0ZS51cGRhdGUudXJsKSB7XG5cdFx0XHR0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5vcGVuRXh0ZXJuYWwodW5kZWZpbmVkLCBzdGF0ZS51cGRhdGUudXJsKTtcblx0XHR9XG5cdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5JZGxlKGdldFVwZGF0ZVR5cGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRVcGRhdGVQYWNrYWdlUGF0aCh2ZXJzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNhY2hlUGF0aCA9IGF3YWl0IHRoaXMuY2FjaGVQYXRoO1xuXHRcdHJldHVybiBwYXRoLmpvaW4oY2FjaGVQYXRoLCBgQ29kZVNldHVwLSR7dGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5fS0ke3ZlcnNpb259LmV4ZWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhbnVwKGV4Y2VwdFZlcnNpb246IHN0cmluZyB8IG51bGwgPSBudWxsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVsYXVuY2hBcmd1bWVudHNGaWxlTmFtZSA9IGV4Y2VwdFZlcnNpb24gPyBgJHtSRUxBVU5DSF9BUkdVTUVOVFNfRklMRV9QUkVGSVh9JHtleGNlcHRWZXJzaW9ufWAgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZmlsdGVyID0gZXhjZXB0VmVyc2lvblxuXHRcdFx0PyAob25lOiBzdHJpbmcpID0+IG9uZSAhPT0gcmVsYXVuY2hBcmd1bWVudHNGaWxlTmFtZSAmJiAhKG5ldyBSZWdFeHAoYCR7dGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5fS0ke2V4Y2VwdFZlcnNpb259XFxcXC5leGUkYCkudGVzdChvbmUpKVxuXHRcdFx0OiAoKSA9PiB0cnVlO1xuXG5cdFx0Y29uc3QgY2FjaGVQYXRoID0gYXdhaXQgdGhpcy5jYWNoZVBhdGg7XG5cdFx0Y29uc3QgdmVyc2lvbnMgPSBhd2FpdCBwZnMuUHJvbWlzZXMucmVhZGRpcihjYWNoZVBhdGgpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZXMgPSB2ZXJzaW9ucy5maWx0ZXIoZmlsdGVyKS5tYXAob25lID0+IHRoaXMudW5saW5rKHBhdGguam9pbihjYWNoZVBhdGgsIG9uZSkpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9BcHBseVVwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdGF0ZS50eXBlICE9PSBTdGF0ZVR5cGUuRG93bmxvYWRlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5hdmFpbGFibGVVcGRhdGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGUgPSB0aGlzLnN0YXRlLnVwZGF0ZTtcblx0XHRjb25zdCBleHBsaWNpdCA9IHRoaXMuc3RhdGUuZXhwbGljaXQ7XG5cdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5VcGRhdGluZyh1cGRhdGUsIGV4cGxpY2l0KSk7XG5cblx0XHRjb25zdCBjYWNoZVBhdGggPSBhd2FpdCB0aGlzLmNhY2hlUGF0aDtcblx0XHRjb25zdCBzZXNzaW9uRW5kRmxhZ1BhdGggPSBwYXRoLmpvaW4oY2FjaGVQYXRoLCAnc2Vzc2lvbi1lbmRpbmcuZmxhZycpO1xuXHRcdGNvbnN0IGNhbmNlbEZpbGVQYXRoID0gcGF0aC5qb2luKGNhY2hlUGF0aCwgYGNhbmNlbC5mbGFnYCk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NGaWxlUGF0aCA9IHBhdGguam9pbihjYWNoZVBhdGgsIGB1cGRhdGUtcHJvZ3Jlc3NgKTtcblx0XHR0aGlzLmF2YWlsYWJsZVVwZGF0ZS51cGRhdGVGaWxlUGF0aCA9IHBhdGguam9pbihjYWNoZVBhdGgsIGBDb2RlU2V0dXAtJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHl9LSR7dXBkYXRlLnZlcnNpb259LmZsYWdgKTtcblx0XHR0aGlzLmF2YWlsYWJsZVVwZGF0ZS5jYW5jZWxGaWxlUGF0aCA9IGNhbmNlbEZpbGVQYXRoO1xuXG5cdFx0Y29uc3QgbXV0ZXggPSBhd2FpdCB0aGlzLm11dGV4O1xuXHRcdGNvbnN0IHNraXBwZWRTcGF3biA9IHRoaXMuaXNJbnN0YWxsZXJBY3RpdmUobXV0ZXgpO1xuXG5cdFx0Ly8gU2tpcCB0aGUgc3Bhd24gaWYgYW5vdGhlciBJbm5vIFNldHVwIGlzIGFscmVhZHkgcnVubmluZyBmb3IgdGhpcyBwcm9kdWN0IChiYWNrZ3JvdW5kIHVwZGF0ZSBvciBhIG1hbnVhbCBpbnN0YWxsZXIpO1xuXHRcdC8vIG90aGVyd2lzZSBJbm5vJ3MgXCJTZXR1cCBpcyBhbHJlYWR5IHJ1bm5pbmdcIiBtb2RhbCBwb3BzIHVwLiBUaGUgYC1yZWFkeWAgbXV0ZXggcG9sbCBiZWxvdyBzdGlsbCBhZHZhbmNlcyBvdXIgc3RhdGUgd2hlbiBpdCBmaW5pc2hlcy5cblx0XHRpZiAoc2tpcHBlZFNwYXduKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2RvQXBwbHlVcGRhdGU6IGFub3RoZXIgaW5zdGFuY2UgaXMgYWxyZWFkeSBydW5uaW5nIHNldHVwLCB3YWl0aW5nIGZvciBpdCB0byBmaW5pc2gnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy51bmxpbmsoY2FuY2VsRmlsZVBhdGgpO1xuXHRcdFx0YXdhaXQgdGhpcy51bmxpbmsocHJvZ3Jlc3NGaWxlUGF0aCk7XG5cdFx0XHRhd2FpdCBwZnMuUHJvbWlzZXMud3JpdGVGaWxlKHRoaXMuYXZhaWxhYmxlVXBkYXRlLnVwZGF0ZUZpbGVQYXRoLCAnZmxhZycpO1xuXG5cdFx0XHRjb25zdCBpbnN0YWxsZXJBcmdzID0gW1xuXHRcdFx0XHQnL3ZlcnlzaWxlbnQnLFxuXHRcdFx0XHQnL2xvZycsXG5cdFx0XHRcdGAvdXBkYXRlPVwiJHt0aGlzLmF2YWlsYWJsZVVwZGF0ZS51cGRhdGVGaWxlUGF0aH1cImAsXG5cdFx0XHRcdGAvcHJvZ3Jlc3M9XCIke3Byb2dyZXNzRmlsZVBhdGh9XCJgLFxuXHRcdFx0XHRgL3Nlc3Npb25lbmQ9XCIke3Nlc3Npb25FbmRGbGFnUGF0aH1cImAsXG5cdFx0XHRcdGAvY2FuY2VsPVwiJHtjYW5jZWxGaWxlUGF0aH1cImAsXG5cdFx0XHRcdCcvbm9jbG9zZWFwcGxpY2F0aW9ucycsXG5cdFx0XHRcdCcvbWVyZ2V0YXNrcz1ydW5jb2RlLCFkZXNrdG9waWNvbiwhcXVpY2tsYXVuY2hpY29uJ1xuXHRcdFx0XTtcblxuXHRcdFx0Ly8gVGhlIHJlc3RhcnRpbmcgaW5zdGFuY2UgcG9wdWxhdGVzIHRoaXMgZmlsZSBpbW1lZGlhdGVseSBiZWZvcmUgcmVsZWFzaW5nIHRoZSBpbnN0YWxsZXIuXG5cdFx0XHRjb25zdCByZWxhdW5jaEFyZ3NGaWxlUGF0aCA9IHRoaXMuZ2V0UmVsYXVuY2hBcmd1bWVudHNGaWxlUGF0aChjYWNoZVBhdGgsIHVwZGF0ZS52ZXJzaW9uKTtcblx0XHRcdGluc3RhbGxlckFyZ3MucHVzaChgL3JlbGF1bmNoYXJncz1cIiR7cmVsYXVuY2hBcmdzRmlsZVBhdGh9XCJgKTtcblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBzcGF3bih0aGlzLmF2YWlsYWJsZVVwZGF0ZS5wYWNrYWdlUGF0aCxcblx0XHRcdFx0aW5zdGFsbGVyQXJncyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRldGFjaGVkOiB0cnVlLFxuXHRcdFx0XHRcdHN0ZGlvOiBbJ2lnbm9yZScsICdpZ25vcmUnLCAnaWdub3JlJ10sXG5cdFx0XHRcdFx0d2luZG93c1ZlcmJhdGltQXJndW1lbnRzOiB0cnVlLFxuXHRcdFx0XHRcdGVudjogeyAuLi5wcm9jZXNzLmVudiwgX19DT01QQVRfTEFZRVI6ICdSdW5Bc0ludm9rZXInIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVHJhY2sgdGhlIHByb2Nlc3Mgc28gd2UgY2FuIGNhbmNlbCBpdCBpZiBuZWVkZWRcblx0XHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlLnVwZGF0ZVByb2Nlc3MgPSBjaGlsZDtcblxuXHRcdFx0Y2hpbGQub25jZSgnZXhpdCcsICgpID0+IHtcblx0XHRcdFx0dGhpcy5hdmFpbGFibGVVcGRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuSWRsZShnZXRVcGRhdGVUeXBlKCkpKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy51cGRhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXG5cdFx0Y29uc3QgcG9sbCA9IGFzeW5jICgpID0+IHtcblx0XHRcdC8vIElmIHdlIHNraXBwZWQgdGhlIHNwYXduLCB0aGUgZm9yZWlnbiBpbnN0YWxsZXIgd2FzIGFjdGl2ZSB3aGVuIHdlIHN0YXJ0ZWQ7IHRyZWF0IHRoYXQgYXMgaGF2aW5nIHNlZW4gaXQgcnVuXG5cdFx0XHQvLyBzbyBhIHF1aWNrIGV4aXQgKGNhbmNlbC9mYWlsKSBiZWZvcmUgdGhlIGZpcnN0IHBvbGwgaXRlcmF0aW9uIHN0aWxsIGRyb3BzIHVzIHRvIElkbGUuXG5cdFx0XHRsZXQgc2VlblJ1bm5pbmcgPSBza2lwcGVkU3Bhd247XG5cdFx0XHR3aGlsZSAodGhpcy5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuVXBkYXRpbmcgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGlmIChtdXRleC5pc0FjdGl2ZSh0aGlzLnJlYWR5TXV0ZXhOYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuUmVhZHkodXBkYXRlLCBleHBsaWNpdCwgdGhpcy5fb3ZlcndyaXRlKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW5ubyBnb25lIHdpdGhvdXQgYC1yZWFkeWAgPT4gaW5zdGFsbCBjYW5jZWxsZWQvZmFpbGVkOyBkcm9wIHRvIElkbGUuXG5cdFx0XHRcdGlmICh0aGlzLmlzSW5zdGFsbGVyQWN0aXZlKG11dGV4KSkge1xuXHRcdFx0XHRcdHNlZW5SdW5uaW5nID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZWVuUnVubmluZykge1xuXHRcdFx0XHRcdGlmICghdGhpcy5hdmFpbGFibGVVcGRhdGU/LnVwZGF0ZVByb2Nlc3MpIHtcblx0XHRcdFx0XHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5JZGxlKGdldFVwZGF0ZVR5cGUoKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzQ29udGVudCA9IGF3YWl0IHJlYWRGaWxlKHByb2dyZXNzRmlsZVBhdGgsICd1dGY4Jyk7XG5cdFx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgW2N1cnJlbnRTdHIsIG1heFN0cl0gPSBwcm9ncmVzc0NvbnRlbnQuc3BsaXQoJywnKTtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRQcm9ncmVzcyA9IHBhcnNlSW50KGN1cnJlbnRTdHIsIDEwKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1heFByb2dyZXNzID0gcGFyc2VJbnQobWF4U3RyLCAxMCk7XG5cdFx0XHRcdFx0XHRpZiAoIWlzTmFOKGN1cnJlbnRQcm9ncmVzcykgJiYgIWlzTmFOKG1heFByb2dyZXNzKSAmJiB0aGlzLnN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5VcGRhdGluZykge1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5zdGF0ZS5jdXJyZW50UHJvZ3Jlc3MgIT09IGN1cnJlbnRQcm9ncmVzcyB8fCB0aGlzLnN0YXRlLm1heFByb2dyZXNzICE9PSBtYXhQcm9ncmVzcykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuVXBkYXRpbmcodXBkYXRlLCBleHBsaWNpdCwgY3VycmVudFByb2dyZXNzLCBtYXhQcm9ncmVzcykpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBQcm9ncmVzcyBmaWxlIG1heSBub3QgZXhpc3QgeWV0IG9yIGJlIGxvY2tlZCwgaWdub3JlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNhbmNlbFRpbWVvdXQgPSBuZXcgUHJvY2Vzc1RpbWVSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCd1cGRhdGUjZG9BcHBseVVwZGF0ZTogcG9sbGluZyB0aW1lZCBvdXQgd2FpdGluZyBmb3IgdXBkYXRlIHRvIGJlIHJlYWR5Jyk7XG5cdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLklkbGUoZ2V0VXBkYXRlVHlwZSgpLCAnVXBkYXRlIGRpZCBub3QgY29tcGxldGUgd2l0aGluIGV4cGVjdGVkIHRpbWUnKSk7XG5cdFx0fSwgNjAgKiA2MCAqIDEwMDApO1xuXG5cdFx0Ly8gUG9sbCBmb3IgcHJvZ3Jlc3MgYW5kIHJlYWR5IG11dGV4IGZvciAxIGhvdXIuXG5cdFx0Y2FuY2VsVGltZW91dC5zY2hlZHVsZSgpO1xuXHRcdHBvbGwoKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGNhbmNlbFRpbWVvdXQuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHRoaXMudXBkYXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPT09IGN0cykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBjYW5jZWxVcGRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQWJvcnQgYW4gaW4tZmxpZ2h0IGNoZWNrL2Rvd25sb2FkIHNvIGl0IG5ldmVyIHJlYWNoZXMgdGhlIGJhY2tncm91bmQgaW5zdGFsbGVyLlxuXHRcdGNvbnN0IGhhZEluRmxpZ2h0Q2hlY2sgPSAhIXRoaXMuY2hlY2tDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0XHRjb25zdCBoYWRQZW5kaW5nVXBkYXRlID0gISF0aGlzLmF2YWlsYWJsZVVwZGF0ZTtcblx0XHR0aGlzLmNoZWNrQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy5jaGVja0NhbmNlbGxhdGlvblRva2VuU291cmNlID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gT25seSBjbGVhbiB1cCBpZiBhIGNoZWNrL2Rvd25sb2FkIHdhcyBpbiBmbGlnaHQ7IGF2b2lkcyBjcmVhdGluZyB0aGUgY2FjaGUgZGlyIHdoZW4ganVzdCBkaXNhYmxlZC5cblx0XHRpZiAoaGFkSW5GbGlnaHRDaGVjaykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jaGVja1Byb21pc2U7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gdGhlIGNoYWluIHN3YWxsb3dzIGl0cyBvd24gZXJyb3JzOyBpZ25vcmVcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuY2xlYW51cFRlbXBGaWxlcygpO1xuXHRcdH1cblxuXHRcdC8vIFRlYXIgZG93biBhbnkgcGVuZGluZyAoZG93bmxvYWRlZC9hcHBseWluZykgdXBkYXRlLlxuXHRcdGF3YWl0IHRoaXMuY2FuY2VsUGVuZGluZ1VwZGF0ZSgpO1xuXG5cdFx0Ly8gUmVjbGFpbSBhIHBhcnRpYWwgdmVyc2lvbmVkLXJlc291cmNlIGZvbGRlciBhIGNhbmNlbGxlZCB1cGRhdGUgbWF5IGxlYXZlOyBvbmx5IGFmdGVyIHJlYWwgdGVhcmRvd24uXG5cdFx0aWYgKGhhZEluRmxpZ2h0Q2hlY2sgfHwgaGFkUGVuZGluZ1VwZGF0ZSkge1xuXHRcdFx0dGhpcy5jb2xsZWN0R2FyYmFnZSgpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3VwZGF0ZSNjb2xsZWN0R2FyYmFnZSAtIGZhaWxlZCB0byBjb2xsZWN0IGdhcmJhZ2UnLCBlcnIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFudXBUZW1wRmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlUGF0aCA9IGF3YWl0IHRoaXMuY2FjaGVQYXRoO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBwZnMuUHJvbWlzZXMucmVhZGRpcihjYWNoZVBhdGgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5lbmRzV2l0aCgnLnRtcCcpKS5tYXAoZmlsZSA9PiB0aGlzLnVubGluayhwYXRoLmpvaW4oY2FjaGVQYXRoLCBmaWxlKSkpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCd1cGRhdGUjY2xlYW51cFRlbXBGaWxlczogZmFpbGVkIHRvIHJlbW92ZSB0ZW1wb3JhcnkgZG93bmxvYWQgZmlsZXMnLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBjYW5jZWxQZW5kaW5nVXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5hdmFpbGFibGVVcGRhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IHVwZGF0ZVByb2Nlc3MsIHVwZGF0ZUZpbGVQYXRoLCBjYW5jZWxGaWxlUGF0aCB9ID0gdGhpcy5hdmFpbGFibGVVcGRhdGU7XG5cblx0XHQvLyBBbm90aGVyIGluc3RhbmNlIG93bnMgdGhlIGluc3RhbGxlcjogYWJvcnQgaWYgaXQncyBzdGlsbCBydW5uaW5nIHNvIHdlIGRvbid0IHN0YXJ0IGEgbmV3XG5cdFx0Ly8gdXBkYXRlIGN5Y2xlIG9uIHRvcCBvZiBpdDsga2VlcCBgYXZhaWxhYmxlVXBkYXRlYCBzbyBxdWl0LWFuZC1pbnN0YWxsIGNhbiBzdGlsbCBjb21wbGV0ZS5cblx0XHRpZiAoIXVwZGF0ZVByb2Nlc3MgJiYgdGhpcy5pc0luc3RhbGxlckFjdGl2ZShhd2FpdCB0aGlzLm11dGV4KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY2FuY2VsIHBlbmRpbmcgdXBkYXRlOiBhbm90aGVyIGluc3RhbmNlIGlzIHN0aWxsIHJ1bm5pbmcgc2V0dXAnKTtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgdGhlIHBvbGxpbmcgbG9vcFxuXHRcdHRoaXMudXBkYXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy51cGRhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh1cGRhdGVQcm9jZXNzICYmIHVwZGF0ZVByb2Nlc3MuZXhpdENvZGUgPT09IG51bGwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI2NhbmNlbFBlbmRpbmdVcGRhdGU6IGNhbmNlbGxpbmcgcGVuZGluZyB1cGRhdGUnKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGFsbCBsaXN0ZW5lcnMgdG8gcHJldmVudCB0aGUgZXhpdCBoYW5kbGVyIGZyb20gY2hhbmdpbmcgc3RhdGVcblx0XHRcdHVwZGF0ZVByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG5cdFx0XHRjb25zdCBleGl0UHJvbWlzZSA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gdXBkYXRlUHJvY2Vzcy5vbmNlKCdleGl0JywgKCkgPT4gcmVzb2x2ZSh0cnVlKSkpO1xuXG5cdFx0XHQvLyBXcml0ZSB0aGUgY2FuY2VsIGZpbGUgdG8gc2lnbmFsIElubm8gU2V0dXAgdG8gZXhpdCBncmFjZWZ1bGx5XG5cdFx0XHRpZiAoY2FuY2VsRmlsZVBhdGgpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBwZnMuUHJvbWlzZXMud3JpdGVGaWxlKGNhbmNlbEZpbGVQYXRoLCAnY2FuY2VsJyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCd1cGRhdGUjY2FuY2VsUGVuZGluZ1VwZGF0ZTogZmFpbGVkIHRvIHdyaXRlIGNhbmNlbCBmaWxlJywgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgcHJvY2VzcyB0byBleGl0IGdyYWNlZnVsbHksIHRoZW4gZm9yY2Uta2lsbCBpZiBuZWVkZWRcblx0XHRcdGNvbnN0IHBpZCA9IHVwZGF0ZVByb2Nlc3MucGlkO1xuXHRcdFx0Y29uc3QgZXhpdGVkID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtleGl0UHJvbWlzZSwgdGltZW91dCgzMCAqIDEwMDApLnRoZW4oKCkgPT4gZmFsc2UpXSk7XG5cdFx0XHRpZiAocGlkICYmICFleGl0ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjY2FuY2VsUGVuZGluZ1VwZGF0ZTogcHJvY2VzcyBkaWQgbm90IGV4aXQgZ3JhY2VmdWxseSwga2lsbGluZyBwcm9jZXNzIHRyZWUnKTtcblx0XHRcdFx0YXdhaXQga2lsbFRyZWUocGlkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDbGVhbiB1cCB0aGUgZmxhZyBmaWxlXG5cdFx0YXdhaXQgdGhpcy51bmxpbmsodXBkYXRlRmlsZVBhdGgpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgdGhlIGNhbmNlbCBmaWxlXG5cdFx0YXdhaXQgdGhpcy51bmxpbmsoY2FuY2VsRmlsZVBhdGgpO1xuXG5cdFx0dGhpcy5hdmFpbGFibGVVcGRhdGUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZG9RdWl0QW5kSW5zdGFsbCgpOiB2b2lkIHtcblx0XHRpZiAoKHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLlJlYWR5ICYmIHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLlJlc3RhcnRpbmcpIHx8ICF0aGlzLmF2YWlsYWJsZVVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI3F1aXRBbmRJbnN0YWxsKCk6IHJ1bm5pbmcgcmF3I3F1aXRBbmRJbnN0YWxsKCknKTtcblxuXHRcdGlmICh0aGlzLmF2YWlsYWJsZVVwZGF0ZS51cGRhdGVGaWxlUGF0aCkge1xuXHRcdFx0dGhpcy53cml0ZVJlbGF1bmNoQXJndW1lbnRzRmlsZSh0aGlzLmNhY2hlUGF0aFN5bmMsIHRoaXMuc3RhdGUudXBkYXRlLnZlcnNpb24pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dW5saW5rU3luYyh0aGlzLmF2YWlsYWJsZVVwZGF0ZS51cGRhdGVGaWxlUGF0aCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluc3RhbGxlckFyZ3MgPSBbJy9zaWxlbnQnLCAnL2xvZycsICcvbWVyZ2V0YXNrcz1ydW5jb2RlLCFkZXNrdG9waWNvbiwhcXVpY2tsYXVuY2hpY29uJ107XG5cblx0XHRcdC8vIFByZXNlcnZlIHNlc3Npb24gZGVmaW5pbmcgYXJndW1lbnRzIChlLmcuIC0tZXh0ZW5zaW9ucy1kaXIpIGFjcm9zcyB0aGUgaW5zdGFsbGVyIHJlbGF1bmNoIChzZWUgIzMyMjY2MykuXG5cdFx0XHRjb25zdCByZWxhdW5jaEFyZ3NGaWxlUGF0aCA9IHRoaXMud3JpdGVSZWxhdW5jaEFyZ3VtZW50c0ZpbGUodGhpcy5jYWNoZVBhdGhTeW5jLCB0aGlzLnN0YXRlLnVwZGF0ZS52ZXJzaW9uKTtcblx0XHRcdGlmIChyZWxhdW5jaEFyZ3NGaWxlUGF0aCkge1xuXHRcdFx0XHRpbnN0YWxsZXJBcmdzLnB1c2goYC9yZWxhdW5jaGFyZ3M9XCIke3JlbGF1bmNoQXJnc0ZpbGVQYXRofVwiYCk7XG5cdFx0XHR9XG5cblx0XHRcdHNwYXduKHRoaXMuYXZhaWxhYmxlVXBkYXRlLnBhY2thZ2VQYXRoLCBpbnN0YWxsZXJBcmdzLCB7XG5cdFx0XHRcdGRldGFjaGVkOiB0cnVlLFxuXHRcdFx0XHRzdGRpbzogWydpZ25vcmUnLCAnaWdub3JlJywgJ2lnbm9yZSddLFxuXHRcdFx0XHR3aW5kb3dzVmVyYmF0aW1Bcmd1bWVudHM6IHRydWUsXG5cdFx0XHRcdGVudjogeyAuLi5wcm9jZXNzLmVudiwgX19DT01QQVRfTEFZRVI6ICdSdW5Bc0ludm9rZXInIH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVsYXVuY2hBcmd1bWVudHNGaWxlUGF0aChjYWNoZVBhdGg6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcGF0aC5qb2luKGNhY2hlUGF0aCwgYCR7UkVMQVVOQ0hfQVJHVU1FTlRTX0ZJTEVfUFJFRklYfSR7dmVyc2lvbn1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXcml0ZXMgdGhlIGFyZ3VtZW50cyBmcm9tIHtAbGluayBnZXRSZWxhdW5jaEFyZ3VtZW50c30gdG8gYSBmaWxlIGluIHRoZSB1cGRhdGUgY2FjaGUgYW5kIHJldHVybnMgaXRzIHBhdGggKG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byBjYXJyeSBmb3J3YXJkKS4gVGhlIGluc3RhbGxlciByZWFkcyBpdCBhbmQgcGFzc2VzIHRoZSBhcmd1bWVudHMgdG8gYENvZGUuZXhlYC5cblx0ICovXG5cdHByaXZhdGUgd3JpdGVSZWxhdW5jaEFyZ3VtZW50c0ZpbGUoY2FjaGVQYXRoOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVsYXVuY2hBcmd1bWVudHMgPSBnZXRSZWxhdW5jaEFyZ3VtZW50cyh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncywgcHJvY2Vzcy5hcmd2KTtcblx0XHRjb25zdCByZWxhdW5jaEFyZ3NGaWxlUGF0aCA9IHRoaXMuZ2V0UmVsYXVuY2hBcmd1bWVudHNGaWxlUGF0aChjYWNoZVBhdGgsIHZlcnNpb24pO1xuXG5cdFx0aWYgKCFyZWxhdW5jaEFyZ3VtZW50cykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dW5saW5rU3luYyhyZWxhdW5jaEFyZ3NGaWxlUGF0aCk7IC8vIHJlbW92ZSBhbnkgc3RhbGUgZmlsZSBmcm9tIGEgcHJldmlvdXMgcmVsYXVuY2hcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHdyaXRlRmlsZVN5bmMocmVsYXVuY2hBcmdzRmlsZVBhdGgsIHJlbGF1bmNoQXJndW1lbnRzKTtcblx0XHRcdHJldHVybiByZWxhdW5jaEFyZ3NGaWxlUGF0aDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcigndXBkYXRlI3dyaXRlUmVsYXVuY2hBcmd1bWVudHNGaWxlOiBmYWlsZWQgdG8gd3JpdGUgcmVsYXVuY2ggYXJndW1lbnRzJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlVXBkYXRlTWV0YWRhdGEodXBkYXRlOiBJVXBkYXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlUGF0aCA9IGF3YWl0IHRoaXMuY2FjaGVQYXRoO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGFQYXRoID0gcGF0aC5qb2luKGNhY2hlUGF0aCwgJ3VwZGF0ZS1tZXRhZGF0YS5qc29uJyk7XG5cdFx0XHRhd2FpdCBwZnMuUHJvbWlzZXMud3JpdGVGaWxlKG1ldGFkYXRhUGF0aCwgSlNPTi5zdHJpbmdpZnkodXBkYXRlKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCd1cGRhdGUjc2F2ZVVwZGF0ZU1ldGFkYXRhOiBmYWlsZWQgdG8gc2F2ZScsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZFVwZGF0ZU1ldGFkYXRhKCk6IFByb21pc2U8SVVwZGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYWNoZVBhdGggPSBhd2FpdCB0aGlzLmNhY2hlUGF0aDtcblx0XHRcdGNvbnN0IG1ldGFkYXRhUGF0aCA9IHBhdGguam9pbihjYWNoZVBhdGgsICd1cGRhdGUtbWV0YWRhdGEuanNvbicpO1xuXHRcdFx0aWYgKGF3YWl0IHBmcy5Qcm9taXNlcy5leGlzdHMobWV0YWRhdGFQYXRoKSkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEZpbGUobWV0YWRhdGFQYXRoLCAndXRmOCcpO1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3VwZGF0ZSNsb2FkVXBkYXRlTWV0YWRhdGE6IGZhaWxlZCB0byBsb2FkJywgZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VXBkYXRlVHlwZSgpOiBVcGRhdGVUeXBlIHtcblx0XHRyZXR1cm4gZ2V0VXBkYXRlVHlwZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgX2FwcGx5U3BlY2lmaWNVcGRhdGUocGFja2FnZVBhdGg6IHN0cmluZywgY29tbWl0Pzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLklkbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmYXN0VXBkYXRlc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd1cGRhdGUuZW5hYmxlV2luZG93c0JhY2tncm91bmRVcGRhdGVzJyk7XG5cdFx0Y29uc3QgdXBkYXRlOiBJVXBkYXRlID0gYXdhaXQgdGhpcy5sb2FkVXBkYXRlTWV0YWRhdGEoKSA/PyB7IHZlcnNpb246IGNvbW1pdCA/PyAndW5rbm93bicsIHByb2R1Y3RWZXJzaW9uOiAndW5rbm93bicgfTtcblxuXHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuRG93bmxvYWRpbmcodXBkYXRlLCB0cnVlLCBmYWxzZSkpO1xuXHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlID0geyBwYWNrYWdlUGF0aCB9O1xuXHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuRG93bmxvYWRlZCh1cGRhdGUsIHRydWUsIGZhbHNlKSk7XG5cblx0XHRpZiAoZmFzdFVwZGF0ZXNFbmFibGVkICYmIHRoaXMucHJvZHVjdFNlcnZpY2UudGFyZ2V0ID09PSAndXNlcicpIHtcblx0XHRcdHRoaXMuZG9BcHBseVVwZGF0ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLlJlYWR5KHVwZGF0ZSwgdHJ1ZSwgZmFsc2UpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzSW5zdGFsbGVyQWN0aXZlKG11dGV4OiB0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnKSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBtdXRleC5pc0FjdGl2ZSh0aGlzLnVwZGF0aW5nTXV0ZXhOYW1lKSB8fCBtdXRleC5pc0FjdGl2ZSh0aGlzLnNldHVwTXV0ZXhOYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdW5saW5rKHBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChwYXRoKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB1bmxpbmsocGF0aCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBlcnIgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0XHRpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYHVwZGF0ZSN1bmxpbms6IGZhaWxlZCB0byB1bmxpbmsgJHtiYXNlbmFtZShwYXRoKX1gLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQXVCLGFBQWE7QUFDcEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWSxxQkFBcUI7QUFDMUMsU0FBUyxPQUFPLFVBQVUsY0FBYztBQUN4QyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFNBQVMsNkJBQTZCLGVBQWU7QUFDOUQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsWUFBWTtBQUNyQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUFpRTtBQUMxRSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlD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
