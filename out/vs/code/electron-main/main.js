import "../../platform/update/common/update.config.contribution.js";
import { app, dialog } from "electron";
import { unlinkSync, promises } from "fs";
import { URI } from "../../base/common/uri.js";
import { coalesce, distinct } from "../../base/common/arrays.js";
import { Promises, retry } from "../../base/common/async.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { ExpectedError, setUnexpectedErrorHandler } from "../../base/common/errors.js";
import { isValidBasename, parseLineAndColumnAware, sanitizeFilePath } from "../../base/common/extpath.js";
import { Event } from "../../base/common/event.js";
import { getPathLabel } from "../../base/common/labels.js";
import { Schemas } from "../../base/common/network.js";
import { basename, join, resolve } from "../../base/common/path.js";
import { mark } from "../../base/common/performance.js";
import { isLinux, isMacintosh, isWindows, OS } from "../../base/common/platform.js";
import { cwd } from "../../base/common/process.js";
import { rtrim, trim } from "../../base/common/strings.js";
import { Promises as FSPromises } from "../../base/node/pfs.js";
import { ProxyChannel } from "../../base/parts/ipc/common/ipc.js";
import { connect as nodeIPCConnect, serve as nodeIPCServe, XDG_RUNTIME_DIR } from "../../base/parts/ipc/node/ipc.net.js";
import { CodeApplication } from "./app.js";
import { localize } from "../../nls.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { ConfigurationService } from "../../platform/configuration/common/configurationService.js";
import { DiagnosticsService } from "../../platform/diagnostics/node/diagnosticsService.js";
import { EnvironmentMainService, IEnvironmentMainService } from "../../platform/environment/electron-main/environmentMainService.js";
import { addArg, parseMainProcessArgv } from "../../platform/environment/node/argvHelper.js";
import { writeForgeStartupLog } from "../../platform/environment/node/forgeStartupLog.js";
import { createWaitMarkerFileSync } from "../../platform/environment/node/wait.js";
import { IFileService } from "../../platform/files/common/files.js";
import { FileService } from "../../platform/files/common/fileService.js";
import { DiskFileSystemProvider } from "../../platform/files/node/diskFileSystemProvider.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { InstantiationService } from "../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../platform/instantiation/common/serviceCollection.js";
import { ILifecycleMainService, LifecycleMainService } from "../../platform/lifecycle/electron-main/lifecycleMainService.js";
import { BufferLogger } from "../../platform/log/common/bufferLog.js";
import { ConsoleMainLogger, getLogLevel, ILoggerService, ILogService, isDevConsoleLogForwardingEnabled, registerDevConsoleLogForwarder } from "../../platform/log/common/log.js";
import product from "../../platform/product/common/product.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { IProtocolMainService } from "../../platform/protocol/electron-main/protocol.js";
import { ProtocolMainService } from "../../platform/protocol/electron-main/protocolMainService.js";
import { ITunnelService } from "../../platform/tunnel/common/tunnel.js";
import { TunnelService } from "../../platform/tunnel/node/tunnelService.js";
import { IRequestService } from "../../platform/request/common/request.js";
import { RequestService } from "../../platform/request/electron-utility/requestService.js";
import { ISignService } from "../../platform/sign/common/sign.js";
import { SignService } from "../../platform/sign/node/signService.js";
import { IStateReadService, IStateService } from "../../platform/state/node/state.js";
import { NullTelemetryService } from "../../platform/telemetry/common/telemetryUtils.js";
import { IThemeMainService } from "../../platform/theme/electron-main/themeMainService.js";
import { IUserDataProfilesMainService, UserDataProfilesMainService } from "../../platform/userDataProfile/electron-main/userDataProfile.js";
import { isInnoSetupInstall } from "../../platform/update/electron-main/win32UpdateType.js";
import { IPolicyService, NullPolicyService } from "../../platform/policy/common/policy.js";
import { NativePolicyService } from "../../platform/policy/node/nativePolicyService.js";
import { FilePolicyService } from "../../platform/policy/common/filePolicyService.js";
import { MultiplexPolicyService } from "../../platform/policy/common/multiplexPolicyService.js";
import { GITHUB_COPILOT_MACOS_BUNDLE_ID, GITHUB_COPILOT_WIN32_POLICY_NAME, GITHUB_COPILOT_WIN32_REGISTRY_PATH, INativeManagedSettingsService, IFileManagedSettingsService, MANAGED_SETTINGS_FILE_NAME, MANAGED_SETTINGS_LINUX_FILE_PATH, MANAGED_SETTINGS_MACOS_FILE_PATH, MANAGED_SETTINGS_WINDOWS_DIR, NullNativeManagedSettingsService, NullFileManagedSettingsService } from "../../platform/policy/common/copilotManagedSettings.js";
import { FileManagedSettingsService } from "../../platform/policy/common/fileManagedSettingsService.js";
import { NativeManagedSettingsService } from "../../platform/policy/node/nativeManagedSettingsService.js";
import { DisposableStore } from "../../base/common/lifecycle.js";
import { IUriIdentityService } from "../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../platform/uriIdentity/common/uriIdentityService.js";
import { ILoggerMainService, LoggerMainService } from "../../platform/log/electron-main/loggerService.js";
import { LogService } from "../../platform/log/common/logService.js";
import { massageMessageBoxOptions } from "../../platform/dialogs/electron-main/dialogMainUtils.js";
import { SaveStrategy, StateService } from "../../platform/state/node/stateService.js";
import { FileUserDataProvider } from "../../platform/userData/common/fileUserDataProvider.js";
import { addUNCHostToAllowlist, getUNCHost } from "../../base/node/unc.js";
import { ThemeMainService } from "../../platform/theme/electron-main/themeMainServiceImpl.js";
import { LINUX_SYSTEM_POLICY_FILE_PATH } from "../../base/common/policy.js";
class CodeMain {
  main() {
    try {
      this.startup();
    } catch (error) {
      console.error(error.message);
      app.exit(1);
    }
  }
  async startup() {
    setUnexpectedErrorHandler((err) => console.error(err));
    const [instantiationService, instanceEnvironment, environmentMainService, configurationService, stateMainService, bufferLogger, productService, userDataProfilesMainService] = this.createServices();
    try {
      try {
        await this.initServices(environmentMainService, userDataProfilesMainService, configurationService, stateMainService, productService);
      } catch (error) {
        this.handleStartupDataDirError(environmentMainService, productService, error);
        throw error;
      }
      await instantiationService.invokeFunction(async (accessor) => {
        const logService = accessor.get(ILogService);
        const lifecycleMainService = accessor.get(ILifecycleMainService);
        const fileService = accessor.get(IFileService);
        const loggerService = accessor.get(ILoggerService);
        const mainProcessNodeIpcServer = await this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, true);
        FSPromises.writeFile(environmentMainService.mainLockfile, String(process.pid)).catch((err) => {
          logService.warn(`app#startup(): Error writing main lockfile: ${err.stack}`);
        });
        bufferLogger.logger = loggerService.createLogger("main", { name: localize("mainLog", "Main") });
        Event.once(lifecycleMainService.onWillShutdown)((evt) => {
          fileService.dispose();
          configurationService.dispose();
          evt.join("instanceLockfile", promises.unlink(environmentMainService.mainLockfile).catch(() => {
          }));
        });
        const innoSetupActive = await this.checkInnoSetupMutex(productService, logService);
        if (innoSetupActive) {
          const message = `${productService.nameShort} is currently being updated. Please wait for the update to complete before launching.`;
          instantiationService.invokeFunction(this.quit, new Error(message));
          return;
        }
        return instantiationService.createInstance(CodeApplication, mainProcessNodeIpcServer, instanceEnvironment).startup();
      });
    } catch (error) {
      instantiationService.invokeFunction(this.quit, error);
    }
  }
  createServices() {
    const services = new ServiceCollection();
    const disposables = new DisposableStore();
    process.once("exit", () => disposables.dispose());
    const productService = { _serviceBrand: void 0, ...product };
    services.set(IProductService, productService);
    const environmentMainService = new EnvironmentMainService(this.resolveArgs(), productService);
    const instanceEnvironment = this.patchEnvironment(environmentMainService);
    services.set(IEnvironmentMainService, environmentMainService);
    writeForgeStartupLog(environmentMainService.logsHome, productService);
    const loggerService = new LoggerMainService(getLogLevel(environmentMainService), environmentMainService.logsHome);
    services.set(ILoggerMainService, loggerService);
    const bufferLogger = new BufferLogger(loggerService.getLogLevel());
    const logService = disposables.add(new LogService(bufferLogger, [new ConsoleMainLogger(loggerService.getLogLevel())]));
    if (!environmentMainService.isBuilt && isDevConsoleLogForwardingEnabled) {
      disposables.add(registerDevConsoleLogForwarder(logService));
    }
    services.set(ILogService, logService);
    const fileService = new FileService(logService);
    services.set(IFileService, fileService);
    const diskFileSystemProvider = new DiskFileSystemProvider(logService);
    fileService.registerProvider(Schemas.file, diskFileSystemProvider);
    const uriIdentityService = new UriIdentityService(fileService);
    services.set(IUriIdentityService, uriIdentityService);
    const stateService = new StateService(SaveStrategy.DELAYED, environmentMainService, logService, fileService);
    services.set(IStateReadService, stateService);
    services.set(IStateService, stateService);
    const userDataProfilesMainService = new UserDataProfilesMainService(stateService, uriIdentityService, environmentMainService, fileService, logService, productService);
    services.set(IUserDataProfilesMainService, userDataProfilesMainService);
    fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesMainService, uriIdentityService, logService));
    let policyService;
    const policyProductName = isWindows ? productService.parentPolicyConfig?.win32RegValueName ?? productService.win32RegValueName : productService.parentPolicyConfig?.darwinBundleIdentifier ?? productService.darwinBundleIdentifier;
    const policyServices = [];
    if (isWindows && policyProductName) {
      policyServices.push(disposables.add(new NativePolicyService(logService, policyProductName)));
    } else if (isMacintosh && policyProductName) {
      policyServices.push(disposables.add(new NativePolicyService(logService, policyProductName)));
    } else if (isLinux) {
      policyServices.push(disposables.add(new FilePolicyService(URI.file(LINUX_SYSTEM_POLICY_FILE_PATH), fileService, logService)));
    } else if (environmentMainService.policyFile) {
      policyServices.push(disposables.add(new FilePolicyService(environmentMainService.policyFile, fileService, logService)));
    }
    let nativeManagedSettingsService;
    if (isWindows) {
      nativeManagedSettingsService = disposables.add(new NativeManagedSettingsService(logService, GITHUB_COPILOT_WIN32_POLICY_NAME, { registryPath: GITHUB_COPILOT_WIN32_REGISTRY_PATH }));
    } else if (isMacintosh) {
      nativeManagedSettingsService = disposables.add(new NativeManagedSettingsService(logService, GITHUB_COPILOT_MACOS_BUNDLE_ID));
    }
    if (nativeManagedSettingsService) {
      services.set(INativeManagedSettingsService, nativeManagedSettingsService);
    } else {
      services.set(INativeManagedSettingsService, new NullNativeManagedSettingsService());
    }
    let fileManagedSettingsPath;
    if (isWindows) {
      const programFiles = process.env["ProgramFiles"];
      if (programFiles) {
        fileManagedSettingsPath = join(programFiles, MANAGED_SETTINGS_WINDOWS_DIR, MANAGED_SETTINGS_FILE_NAME);
      }
    } else if (isMacintosh) {
      fileManagedSettingsPath = MANAGED_SETTINGS_MACOS_FILE_PATH;
    } else if (isLinux) {
      fileManagedSettingsPath = MANAGED_SETTINGS_LINUX_FILE_PATH;
    }
    if (fileManagedSettingsPath) {
      const fileManagedSettingsService = disposables.add(new FileManagedSettingsService(URI.file(fileManagedSettingsPath), fileService, logService));
      services.set(IFileManagedSettingsService, fileManagedSettingsService);
    } else {
      services.set(IFileManagedSettingsService, new NullFileManagedSettingsService());
    }
    if (policyServices.length > 1) {
      policyService = disposables.add(new MultiplexPolicyService(policyServices, logService));
    } else if (policyServices.length === 1) {
      policyService = policyServices[0];
    } else {
      policyService = new NullPolicyService();
    }
    services.set(IPolicyService, policyService);
    const configurationService = new ConfigurationService(userDataProfilesMainService.defaultProfile.settingsResource, fileService, policyService, logService);
    services.set(IConfigurationService, configurationService);
    services.set(ILifecycleMainService, new SyncDescriptor(LifecycleMainService, void 0, false));
    services.set(IRequestService, new SyncDescriptor(RequestService, void 0, true));
    services.set(IThemeMainService, new SyncDescriptor(ThemeMainService));
    services.set(ISignService, new SyncDescriptor(
      SignService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(ITunnelService, new SyncDescriptor(TunnelService));
    services.set(IProtocolMainService, new ProtocolMainService(environmentMainService, userDataProfilesMainService, logService));
    return [new InstantiationService(services, true), instanceEnvironment, environmentMainService, configurationService, stateService, bufferLogger, productService, userDataProfilesMainService];
  }
  patchEnvironment(environmentMainService) {
    const instanceEnvironment = {
      VSCODE_IPC_HOOK: environmentMainService.mainIPCHandle
    };
    ["VSCODE_NLS_CONFIG", "VSCODE_PORTABLE"].forEach((key) => {
      const value = process.env[key];
      if (typeof value === "string") {
        instanceEnvironment[key] = value;
      }
    });
    Object.assign(process.env, instanceEnvironment);
    return instanceEnvironment;
  }
  async initServices(environmentMainService, userDataProfilesMainService, configurationService, stateService, productService) {
    await Promises.settled([
      // Environment service (paths)
      Promise.all([
        this.allowWindowsUNCPath(environmentMainService.extensionsPath),
        // enable extension paths on UNC drives...
        environmentMainService.codeCachePath,
        // ...other user-data-derived paths should already be enlisted from `main.js`
        environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
        userDataProfilesMainService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath,
        environmentMainService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath,
        environmentMainService.localHistoryHome.with({ scheme: Schemas.file }).fsPath,
        environmentMainService.backupHome
      ].map((path) => path ? promises.mkdir(path, { recursive: true }) : void 0)),
      // State service
      stateService.init(),
      // Configuration service
      configurationService.initialize()
    ]);
    userDataProfilesMainService.init();
  }
  allowWindowsUNCPath(path) {
    if (isWindows) {
      const host = getUNCHost(path);
      if (host) {
        addUNCHostToAllowlist(host);
      }
    }
    return path;
  }
  async claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, retry2) {
    let mainProcessNodeIpcServer;
    try {
      mark("code/willStartMainServer");
      mainProcessNodeIpcServer = await nodeIPCServe(environmentMainService.mainIPCHandle);
      mark("code/didStartMainServer");
      Event.once(lifecycleMainService.onWillShutdown)(() => mainProcessNodeIpcServer.dispose());
    } catch (error) {
      if (error.code !== "EADDRINUSE") {
        this.handleStartupDataDirError(environmentMainService, productService, error);
        throw error;
      }
      let client;
      try {
        client = await nodeIPCConnect(environmentMainService.mainIPCHandle, "main");
      } catch (error2) {
        if (!retry2 || isWindows || error2.code !== "ECONNREFUSED") {
          if (error2.code === "EPERM") {
            this.showStartupWarningDialog(
              localize("secondInstanceAdmin", "Another instance of {0} is already running as administrator.", productService.nameShort),
              localize("secondInstanceAdminDetail", "Please close the other instance and try again."),
              productService
            );
          }
          throw error2;
        }
        try {
          unlinkSync(environmentMainService.mainIPCHandle);
        } catch (error3) {
          logService.warn("Could not delete obsolete instance handle", error3);
          throw error3;
        }
        return this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, false);
      }
      if (environmentMainService.extensionTestsLocationURI && !environmentMainService.debugExtensionHost.break) {
        const msg = `Running extension tests from the command line is currently only supported if no other instance of ${productService.nameShort} is running.`;
        logService.error(msg);
        client.dispose();
        throw new Error(msg);
      }
      let startupWarningDialogHandle = void 0;
      if (!environmentMainService.args.wait && !environmentMainService.args.status) {
        startupWarningDialogHandle = setTimeout(() => {
          this.showStartupWarningDialog(
            localize("secondInstanceNoResponse", "Another instance of {0} is running but not responding", productService.nameShort),
            localize("secondInstanceNoResponseDetail", "Please close all other instances and try again."),
            productService
          );
        }, 1e4);
      }
      const otherInstanceLaunchMainService = ProxyChannel.toService(client.getChannel("launch"), { disableMarshalling: true });
      const otherInstanceDiagnosticsMainService = ProxyChannel.toService(client.getChannel("diagnostics"), { disableMarshalling: true });
      if (environmentMainService.args.status) {
        return instantiationService.invokeFunction(async () => {
          const diagnosticsService = new DiagnosticsService(NullTelemetryService, productService);
          const mainDiagnostics = await otherInstanceDiagnosticsMainService.getMainDiagnostics();
          const remoteDiagnostics = await otherInstanceDiagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true });
          const diagnostics = await diagnosticsService.getDiagnostics(mainDiagnostics, remoteDiagnostics);
          console.log(diagnostics);
          throw new ExpectedError();
        });
      }
      if (isWindows) {
        await this.windowsAllowSetForegroundWindow(otherInstanceLaunchMainService, logService);
      }
      logService.trace("Sending env to running instance...");
      await otherInstanceLaunchMainService.start(environmentMainService.args, process.env);
      client.dispose();
      if (startupWarningDialogHandle) {
        clearTimeout(startupWarningDialogHandle);
      }
      throw new ExpectedError("Sent env to running instance. Terminating...");
    }
    if (environmentMainService.args.status) {
      console.log(localize("statusWarning", "Warning: The --status argument can only be used if {0} is already running. Please run it again after {0} has started.", productService.nameShort));
      throw new ExpectedError("Terminating...");
    }
    process.env["VSCODE_PID"] = String(process.pid);
    return mainProcessNodeIpcServer;
  }
  handleStartupDataDirError(environmentMainService, productService, error) {
    if (error.code === "EACCES" || error.code === "EPERM") {
      const directories = coalesce([environmentMainService.userDataPath, environmentMainService.extensionsPath, XDG_RUNTIME_DIR]).map((folder) => getPathLabel(URI.file(folder), { os: OS, tildify: environmentMainService }));
      this.showStartupWarningDialog(
        localize("startupDataDirError", "Unable to write program user data."),
        localize("startupUserDataAndExtensionsDirErrorDetail", "{0}\n\nPlease make sure the following directories are writeable:\n\n{1}", toErrorMessage(error), directories.join("\n")),
        productService
      );
    }
  }
  showStartupWarningDialog(message, detail, productService) {
    dialog.showMessageBoxSync(massageMessageBoxOptions({
      type: "warning",
      buttons: [localize({ key: "close", comment: ["&& denotes a mnemonic"] }, "&&Close")],
      message,
      detail
    }, productService).options);
  }
  async windowsAllowSetForegroundWindow(launchMainService, logService) {
    if (isWindows) {
      const processId = await launchMainService.getMainProcessId();
      logService.trace("Sending some foreground love to the running instance:", processId);
      try {
        (await import("windows-foreground-love")).allowSetForegroundWindow(processId);
      } catch (error) {
        logService.error(error);
      }
    }
  }
  quit(accessor, reason) {
    const logService = accessor.get(ILogService);
    const lifecycleMainService = accessor.get(ILifecycleMainService);
    let exitCode = 0;
    if (reason) {
      if (reason.isExpected) {
        if (reason.message) {
          logService.trace(reason.message);
        }
      } else {
        exitCode = 1;
        if (reason.stack) {
          logService.error(reason.stack);
        } else {
          logService.error(`Startup error: ${reason.toString()}`);
        }
      }
    }
    lifecycleMainService.kill(exitCode);
  }
  async checkInnoSetupMutex(productService, logService) {
    if (!(isWindows && productService.win32MutexName && productService.win32VersionedUpdate && isInnoSetupInstall())) {
      return false;
    }
    try {
      const updatingMutexName = `${productService.win32MutexName}-updating`;
      const mutex = await import("@vscode/windows-mutex");
      if (!mutex.isActive(updatingMutexName)) {
        return false;
      }
      const pollIntervalMs = 250, retries = 120;
      logService.info(`checkInnoSetupMutex: ${updatingMutexName} is held, waiting up to ${pollIntervalMs * retries / 1e3}s for setup to finish...`);
      const start = Date.now();
      try {
        await retry(async () => {
          if (mutex.isActive(updatingMutexName)) {
            throw new Error("mutex still held");
          }
        }, pollIntervalMs, retries);
        logService.info(`checkInnoSetupMutex: ${updatingMutexName} released after ${Date.now() - start}ms`);
        return false;
      } catch {
        logService.warn(`checkInnoSetupMutex: ${updatingMutexName} still held after ${Date.now() - start}ms, giving up`);
        return true;
      }
    } catch (error) {
      logService.error("Failed to check Inno Setup mutex:", error);
      return false;
    }
  }
  //#region Command line arguments utilities
  resolveArgs() {
    const args = this.validatePaths(parseMainProcessArgv(process.argv));
    if (args.wait && !args.waitMarkerFilePath) {
      const waitMarkerFilePath = createWaitMarkerFileSync(args.verbose);
      if (waitMarkerFilePath) {
        addArg(process.argv, "--waitMarkerFilePath", waitMarkerFilePath);
        args.waitMarkerFilePath = waitMarkerFilePath;
      }
    }
    if (args.chat) {
      if (args.chat["new-window"]) {
        args["new-window"] = true;
      } else if (args.chat["reuse-window"]) {
        args["reuse-window"] = true;
      } else if (args.chat["profile"]) {
        args["profile"] = args.chat["profile"];
      } else {
        args._ = [cwd()];
      }
    }
    return args;
  }
  validatePaths(args) {
    const defaultKeybindingsExportPath = args["export-default-keybindings"];
    if (defaultKeybindingsExportPath) {
      args["export-default-keybindings"] = sanitizeFilePath(defaultKeybindingsExportPath, cwd());
    }
    if (args["open-url"]) {
      args._urls = args._;
      args._ = [];
    }
    if (!args["remote"]) {
      const paths = this.doValidatePaths(args._, args.goto);
      args._ = paths;
    }
    return args;
  }
  doValidatePaths(args, gotoLineMode) {
    const currentWorkingDir = cwd();
    const result = args.map((arg) => {
      let pathCandidate = String(arg);
      let parsedPath = void 0;
      if (gotoLineMode) {
        parsedPath = parseLineAndColumnAware(pathCandidate);
        pathCandidate = parsedPath.path;
      }
      if (pathCandidate) {
        pathCandidate = this.preparePath(currentWorkingDir, pathCandidate);
      }
      const sanitizedFilePath = sanitizeFilePath(pathCandidate, currentWorkingDir);
      const filePathBasename = basename(sanitizedFilePath);
      if (filePathBasename && !isValidBasename(filePathBasename)) {
        return null;
      }
      if (gotoLineMode && parsedPath) {
        parsedPath.path = sanitizedFilePath;
        return this.toPath(parsedPath);
      }
      return sanitizedFilePath;
    });
    const caseInsensitive = isWindows || isMacintosh;
    const distinctPaths = distinct(result, (path) => path && caseInsensitive ? path.toLowerCase() : path || "");
    return coalesce(distinctPaths);
  }
  preparePath(cwd2, path) {
    if (isWindows) {
      path = rtrim(path, '"');
    }
    path = trim(trim(path, " "), "	");
    if (isWindows) {
      path = resolve(cwd2, path);
      path = rtrim(path, ".");
    }
    return path;
  }
  toPath(pathWithLineAndCol) {
    const segments = [pathWithLineAndCol.path];
    if (typeof pathWithLineAndCol.line === "number") {
      segments.push(String(pathWithLineAndCol.line));
    }
    if (typeof pathWithLineAndCol.column === "number") {
      segments.push(String(pathWithLineAndCol.column));
    }
    return segments.join(":");
  }
  //#endregion
}
const code = new CodeMain();
code.main();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi1tYWluXFxtYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5jb25maWcuY29udHJpYnV0aW9uLmpzJztcblxuaW1wb3J0IHsgYXBwLCBkaWFsb2cgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyB1bmxpbmtTeW5jLCBwcm9taXNlcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIHJldHJ5IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRXhwZWN0ZWRFcnJvciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJUGF0aFdpdGhMaW5lQW5kQ29sdW1uLCBpc1ZhbGlkQmFzZW5hbWUsIHBhcnNlTGluZUFuZENvbHVtbkF3YXJlLCBzYW5pdGl6ZUZpbGVQYXRoIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGdldFBhdGhMYWJlbCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pbiwgcmVzb2x2ZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MsIE9TIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY3dkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBydHJpbSwgdHJpbSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgYXMgRlNQcm9taXNlcyB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBDbGllbnQgYXMgTm9kZUlQQ0NsaWVudCB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IGNvbm5lY3QgYXMgbm9kZUlQQ0Nvbm5lY3QsIHNlcnZlIGFzIG5vZGVJUENTZXJ2ZSwgU2VydmVyIGFzIE5vZGVJUENTZXJ2ZXIsIFhER19SVU5USU1FX0RJUiB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBDb2RlQXBwbGljYXRpb24gfSBmcm9tICcuL2FwcC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWdub3N0aWNzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kaWFnbm9zdGljcy9lbGVjdHJvbi1tYWluL2RpYWdub3N0aWNzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlhZ25vc3RpY3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZGlhZ25vc3RpY3Mvbm9kZS9kaWFnbm9zdGljc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50TWFpblNlcnZpY2UsIElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFkZEFyZywgcGFyc2VNYWluUHJvY2Vzc0FyZ3YgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9ub2RlL2FyZ3ZIZWxwZXIuanMnO1xuaW1wb3J0IHsgd3JpdGVGb3JnZVN0YXJ0dXBMb2cgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9ub2RlL2ZvcmdlU3RhcnR1cExvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXYWl0TWFya2VyRmlsZVN5bmMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9ub2RlL3dhaXQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9ub2RlL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGF1bmNoTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sYXVuY2gvZWxlY3Ryb24tbWFpbi9sYXVuY2hNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIExpZmVjeWNsZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnVmZmVyTG9nZ2VyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9idWZmZXJMb2cuanMnO1xuaW1wb3J0IHsgQ29uc29sZU1haW5Mb2dnZXIsIGdldExvZ0xldmVsLCBJTG9nZ2VyU2VydmljZSwgSUxvZ1NlcnZpY2UsIGlzRGV2Q29uc29sZUxvZ0ZvcndhcmRpbmdFbmFibGVkLCByZWdpc3RlckRldkNvbnNvbGVMb2dGb3J3YXJkZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm90b2NvbE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvdG9jb2wvZWxlY3Ryb24tbWFpbi9wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvdG9jb2wvZWxlY3Ryb24tbWFpbi9wcm90b2NvbE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUdW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgVHVubmVsU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9ub2RlL3R1bm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvZWxlY3Ryb24tdXRpbGl0eS9yZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2lnblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zaWduL2NvbW1vbi9zaWduLmpzJztcbmltcG9ydCB7IFNpZ25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vc2lnbi9ub2RlL3NpZ25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdGF0ZVJlYWRTZXJ2aWNlLCBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVRoZW1lTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90aGVtZS9lbGVjdHJvbi1tYWluL3RoZW1lTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSwgVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2VsZWN0cm9uLW1haW4vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGlzSW5ub1NldHVwSW5zdGFsbCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL3dpbjMyVXBkYXRlVHlwZS5qcyc7XG5pbXBvcnQgeyBJUG9saWN5U2VydmljZSwgTnVsbFBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcG9saWN5L25vZGUvbmF0aXZlUG9saWN5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vZmlsZVBvbGljeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTXVsdGlwbGV4UG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vbXVsdGlwbGV4UG9saWN5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfQ09QSUxPVF9NQUNPU19CVU5ETEVfSUQsIEdJVEhVQl9DT1BJTE9UX1dJTjMyX1BPTElDWV9OQU1FLCBHSVRIVUJfQ09QSUxPVF9XSU4zMl9SRUdJU1RSWV9QQVRILCBJTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSwgSUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBNQU5BR0VEX1NFVFRJTkdTX0ZJTEVfTkFNRSwgTUFOQUdFRF9TRVRUSU5HU19MSU5VWF9GSUxFX1BBVEgsIE1BTkFHRURfU0VUVElOR1NfTUFDT1NfRklMRV9QQVRILCBNQU5BR0VEX1NFVFRJTkdTX1dJTkRPV1NfRElSLCBOdWxsTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSwgTnVsbEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCB7IEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9maWxlTWFuYWdlZFNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcG9saWN5L25vZGUvbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dnZXJNYWluU2VydmljZSwgTG9nZ2VyTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvZWxlY3Ryb24tbWFpbi9sb2dnZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFzc2FnZU1lc3NhZ2VCb3hPcHRpb25zIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9lbGVjdHJvbi1tYWluL2RpYWxvZ01haW5VdGlscy5qcyc7XG5pbXBvcnQgeyBTYXZlU3RyYXRlZ3ksIFN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0YXRlL25vZGUvc3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVVc2VyRGF0YVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXNlckRhdGEvY29tbW9uL2ZpbGVVc2VyRGF0YVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCwgZ2V0VU5DSG9zdCB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgVGhlbWVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RoZW1lL2VsZWN0cm9uLW1haW4vdGhlbWVNYWluU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgTElOVVhfU1lTVEVNX1BPTElDWV9GSUxFX1BBVEggfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuXG4vKipcbiAqIFRoZSBtYWluIFZTIENvZGUgZW50cnkgcG9pbnQuXG4gKlxuICogTm90ZTogVGhpcyBjbGFzcyBjYW4gZXhpc3QgbW9yZSB0aGFuIG9uY2UgZm9yIGV4YW1wbGUgd2hlbiBWUyBDb2RlIGlzIGFscmVhZHlcbiAqIHJ1bm5pbmcgYW5kIGEgc2Vjb25kIGluc3RhbmNlIGlzIHN0YXJ0ZWQgZnJvbSB0aGUgY29tbWFuZCBsaW5lLiBJdCB3aWxsIGFsd2F5c1xuICogdHJ5IHRvIGNvbW11bmljYXRlIHdpdGggYW4gZXhpc3RpbmcgaW5zdGFuY2UgdG8gcHJldmVudCB0aGF0IDIgVlMgQ29kZSBpbnN0YW5jZXNcbiAqIGFyZSBydW5uaW5nIGF0IHRoZSBzYW1lIHRpbWUuXG4gKi9cbmNsYXNzIENvZGVNYWluIHtcblxuXHRtYWluKCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnN0YXJ0dXAoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnJvci5tZXNzYWdlKTtcblx0XHRcdGFwcC5leGl0KDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RhcnR1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFNldCB0aGUgZXJyb3IgaGFuZGxlciBlYXJseSBlbm91Z2ggc28gdGhhdCB3ZSBhcmUgbm90IGdldHRpbmcgdGhlXG5cdFx0Ly8gZGVmYXVsdCBlbGVjdHJvbiBlcnJvciBkaWFsb2cgcG9wcGluZyB1cFxuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoZXJyID0+IGNvbnNvbGUuZXJyb3IoZXJyKSk7XG5cblx0XHQvLyBDcmVhdGUgc2VydmljZXNcblx0XHRjb25zdCBbaW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbmNlRW52aXJvbm1lbnQsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0ZU1haW5TZXJ2aWNlLCBidWZmZXJMb2dnZXIsIHByb2R1Y3RTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2VdID0gdGhpcy5jcmVhdGVTZXJ2aWNlcygpO1xuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gSW5pdCBzZXJ2aWNlc1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5pbml0U2VydmljZXMoZW52aXJvbm1lbnRNYWluU2VydmljZSwgdXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgc3RhdGVNYWluU2VydmljZSwgcHJvZHVjdFNlcnZpY2UpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBTaG93IGEgZGlhbG9nIGZvciBlcnJvcnMgdGhhdCBjYW4gYmUgcmVzb2x2ZWQgYnkgdGhlIHVzZXJcblx0XHRcdFx0dGhpcy5oYW5kbGVTdGFydHVwRGF0YURpckVycm9yKGVudmlyb25tZW50TWFpblNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBlcnJvcik7XG5cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0YXJ0dXBcblx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGxpZmVjeWNsZU1haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaWZlY3ljbGVNYWluU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGxvZ2dlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ2dlclNlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIENyZWF0ZSB0aGUgbWFpbiBJUEMgc2VydmVyIGJ5IHRyeWluZyB0byBiZSB0aGUgc2VydmVyXG5cdFx0XHRcdC8vIElmIHRoaXMgdGhyb3dzIGFuIGVycm9yIGl0IG1lYW5zIHdlIGFyZSBub3QgdGhlIGZpcnN0XG5cdFx0XHRcdC8vIGluc3RhbmNlIG9mIFZTIENvZGUgcnVubmluZyBhbmQgc28gd2Ugd291bGQgcXVpdC5cblx0XHRcdFx0Y29uc3QgbWFpblByb2Nlc3NOb2RlSXBjU2VydmVyID0gYXdhaXQgdGhpcy5jbGFpbUluc3RhbmNlKGxvZ1NlcnZpY2UsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGxpZmVjeWNsZU1haW5TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpO1xuXG5cdFx0XHRcdC8vIFdyaXRlIGEgbG9ja2ZpbGUgdG8gaW5kaWNhdGUgYW4gaW5zdGFuY2UgaXMgcnVubmluZ1xuXHRcdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNzg2MSNpc3N1ZWNvbW1lbnQtODc3NDE3NDUxKVxuXHRcdFx0XHRGU1Byb21pc2VzLndyaXRlRmlsZShlbnZpcm9ubWVudE1haW5TZXJ2aWNlLm1haW5Mb2NrZmlsZSwgU3RyaW5nKHByb2Nlc3MucGlkKSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYGFwcCNzdGFydHVwKCk6IEVycm9yIHdyaXRpbmcgbWFpbiBsb2NrZmlsZTogJHtlcnIuc3RhY2t9YCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIERlbGF5IGNyZWF0aW9uIG9mIHNwZGxvZyBmb3IgcGVyZiByZWFzb25zIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzI5MDYpXG5cdFx0XHRcdGJ1ZmZlckxvZ2dlci5sb2dnZXIgPSBsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcignbWFpbicsIHsgbmFtZTogbG9jYWxpemUoJ21haW5Mb2cnLCBcIk1haW5cIikgfSk7XG5cblx0XHRcdFx0Ly8gTGlmZWN5Y2xlXG5cdFx0XHRcdEV2ZW50Lm9uY2UobGlmZWN5Y2xlTWFpblNlcnZpY2Uub25XaWxsU2h1dGRvd24pKGV2dCA9PiB7XG5cdFx0XHRcdFx0ZmlsZVNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRldnQuam9pbignaW5zdGFuY2VMb2NrZmlsZScsIHByb21pc2VzLnVubGluayhlbnZpcm9ubWVudE1haW5TZXJ2aWNlLm1haW5Mb2NrZmlsZSkuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmVkICovIH0pKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgSW5ubyBTZXR1cCBpcyBydW5uaW5nLiBCcmllZmx5IHdhaXQgZm9yIHRoZSB1cGRhdGluZyBtdXRleCB0byBiZSByZWxlYXNlZCBiZWZvcmUgcmVmdXNpbmcgdG8gbGF1bmNoLlxuXHRcdFx0XHRjb25zdCBpbm5vU2V0dXBBY3RpdmUgPSBhd2FpdCB0aGlzLmNoZWNrSW5ub1NldHVwTXV0ZXgocHJvZHVjdFNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRpZiAoaW5ub1NldHVwQWN0aXZlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGAke3Byb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydH0gaXMgY3VycmVudGx5IGJlaW5nIHVwZGF0ZWQuIFBsZWFzZSB3YWl0IGZvciB0aGUgdXBkYXRlIHRvIGNvbXBsZXRlIGJlZm9yZSBsYXVuY2hpbmcuYDtcblx0XHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0aGlzLnF1aXQsIG5ldyBFcnJvcihtZXNzYWdlKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVBcHBsaWNhdGlvbiwgbWFpblByb2Nlc3NOb2RlSXBjU2VydmVyLCBpbnN0YW5jZUVudmlyb25tZW50KS5zdGFydHVwKCk7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5xdWl0LCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXJ2aWNlcygpOiBbSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBJUHJvY2Vzc0Vudmlyb25tZW50LCBJRW52aXJvbm1lbnRNYWluU2VydmljZSwgQ29uZmlndXJhdGlvblNlcnZpY2UsIFN0YXRlU2VydmljZSwgQnVmZmVyTG9nZ2VyLCBJUHJvZHVjdFNlcnZpY2UsIFVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZV0ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cHJvY2Vzcy5vbmNlKCdleGl0JywgKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdC8vIFByb2R1Y3Rcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH07XG5cdFx0c2VydmljZXMuc2V0KElQcm9kdWN0U2VydmljZSwgcHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0Ly8gRW52aXJvbm1lbnRcblx0XHRjb25zdCBlbnZpcm9ubWVudE1haW5TZXJ2aWNlID0gbmV3IEVudmlyb25tZW50TWFpblNlcnZpY2UodGhpcy5yZXNvbHZlQXJncygpLCBwcm9kdWN0U2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFuY2VFbnZpcm9ubWVudCA9IHRoaXMucGF0Y2hFbnZpcm9ubWVudChlbnZpcm9ubWVudE1haW5TZXJ2aWNlKTsgLy8gUGF0Y2ggYHByb2Nlc3MuZW52YCB3aXRoIHRoZSBpbnN0YW5jZSdzIGVudmlyb25tZW50XG5cdFx0c2VydmljZXMuc2V0KElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLCBlbnZpcm9ubWVudE1haW5TZXJ2aWNlKTtcblx0XHR3cml0ZUZvcmdlU3RhcnR1cExvZyhlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmxvZ3NIb21lLCBwcm9kdWN0U2VydmljZSk7XG5cblx0XHQvLyBMb2dnZXJcblx0XHRjb25zdCBsb2dnZXJTZXJ2aWNlID0gbmV3IExvZ2dlck1haW5TZXJ2aWNlKGdldExvZ0xldmVsKGVudmlyb25tZW50TWFpblNlcnZpY2UpLCBlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmxvZ3NIb21lKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvZ2dlck1haW5TZXJ2aWNlLCBsb2dnZXJTZXJ2aWNlKTtcblxuXHRcdC8vIExvZzogV2UgbmVlZCB0byBidWZmZXIgdGhlIHNwZGxvZyBsb2dzIHVudGlsIHdlIGFyZSBzdXJlXG5cdFx0Ly8gd2UgYXJlIHRoZSBvbmx5IGluc3RhbmNlIHJ1bm5pbmcsIG90aGVyd2lzZSB3ZSdsbCBoYXZlIGNvbmN1cnJlbnRcblx0XHQvLyBsb2cgZmlsZSBhY2Nlc3Mgb24gV2luZG93cyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQxMjE4KVxuXHRcdGNvbnN0IGJ1ZmZlckxvZ2dlciA9IG5ldyBCdWZmZXJMb2dnZXIobG9nZ2VyU2VydmljZS5nZXRMb2dMZXZlbCgpKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMb2dTZXJ2aWNlKGJ1ZmZlckxvZ2dlciwgW25ldyBDb25zb2xlTWFpbkxvZ2dlcihsb2dnZXJTZXJ2aWNlLmdldExvZ0xldmVsKCkpXSkpO1xuXHRcdGlmICghZW52aXJvbm1lbnRNYWluU2VydmljZS5pc0J1aWx0ICYmIGlzRGV2Q29uc29sZUxvZ0ZvcndhcmRpbmdFbmFibGVkKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJEZXZDb25zb2xlTG9nRm9yd2FyZGVyKGxvZ1NlcnZpY2UpKTtcblx0XHR9XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdC8vIEZpbGVzXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihsb2dTZXJ2aWNlKTtcblx0XHRmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZGlza0ZpbGVTeXN0ZW1Qcm92aWRlcik7XG5cblx0XHQvLyBVUkkgSWRlbnRpdHlcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVVyaUlkZW50aXR5U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblxuXHRcdC8vIFN0YXRlXG5cdFx0Y29uc3Qgc3RhdGVTZXJ2aWNlID0gbmV3IFN0YXRlU2VydmljZShTYXZlU3RyYXRlZ3kuREVMQVlFRCwgZW52aXJvbm1lbnRNYWluU2VydmljZSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJU3RhdGVSZWFkU2VydmljZSwgc3RhdGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVN0YXRlU2VydmljZSwgc3RhdGVTZXJ2aWNlKTtcblxuXHRcdC8vIFVzZXIgRGF0YSBQcm9maWxlc1xuXHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSA9IG5ldyBVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2Uoc3RhdGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSk7XG5cblx0XHQvLyBVc2UgRmlsZVVzZXJEYXRhUHJvdmlkZXIgZm9yIHVzZXIgZGF0YSB0b1xuXHRcdC8vIGVuYWJsZSBhdG9taWMgcmVhZCAvIHdyaXRlIG9wZXJhdGlvbnMuXG5cdFx0ZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCBuZXcgRmlsZVVzZXJEYXRhUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyLCBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB1c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gUG9saWN5XG5cdFx0bGV0IHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBvbGljeVByb2R1Y3ROYW1lID0gaXNXaW5kb3dzXG5cdFx0XHQ/IChwcm9kdWN0U2VydmljZS5wYXJlbnRQb2xpY3lDb25maWc/LndpbjMyUmVnVmFsdWVOYW1lID8/IHByb2R1Y3RTZXJ2aWNlLndpbjMyUmVnVmFsdWVOYW1lKVxuXHRcdFx0OiAocHJvZHVjdFNlcnZpY2UucGFyZW50UG9saWN5Q29uZmlnPy5kYXJ3aW5CdW5kbGVJZGVudGlmaWVyID8/IHByb2R1Y3RTZXJ2aWNlLmRhcndpbkJ1bmRsZUlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHBvbGljeVNlcnZpY2VzOiBJUG9saWN5U2VydmljZVtdID0gW107XG5cdFx0aWYgKGlzV2luZG93cyAmJiBwb2xpY3lQcm9kdWN0TmFtZSkge1xuXHRcdFx0cG9saWN5U2VydmljZXMucHVzaChkaXNwb3NhYmxlcy5hZGQobmV3IE5hdGl2ZVBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgcG9saWN5UHJvZHVjdE5hbWUpKSk7XG5cdFx0fSBlbHNlIGlmIChpc01hY2ludG9zaCAmJiBwb2xpY3lQcm9kdWN0TmFtZSkge1xuXHRcdFx0cG9saWN5U2VydmljZXMucHVzaChkaXNwb3NhYmxlcy5hZGQobmV3IE5hdGl2ZVBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgcG9saWN5UHJvZHVjdE5hbWUpKSk7XG5cdFx0fSBlbHNlIGlmIChpc0xpbnV4KSB7XG5cdFx0XHRwb2xpY3lTZXJ2aWNlcy5wdXNoKGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVBvbGljeVNlcnZpY2UoVVJJLmZpbGUoTElOVVhfU1lTVEVNX1BPTElDWV9GSUxFX1BBVEgpLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpKTtcblx0XHR9IGVsc2UgaWYgKGVudmlyb25tZW50TWFpblNlcnZpY2UucG9saWN5RmlsZSkge1xuXHRcdFx0cG9saWN5U2VydmljZXMucHVzaChkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVQb2xpY3lTZXJ2aWNlKGVudmlyb25tZW50TWFpblNlcnZpY2UucG9saWN5RmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKSk7XG5cdFx0fVxuXG5cdFx0bGV0IG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2U6IE5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0bmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZShsb2dTZXJ2aWNlLCBHSVRIVUJfQ09QSUxPVF9XSU4zMl9QT0xJQ1lfTkFNRSwgeyByZWdpc3RyeVBhdGg6IEdJVEhVQl9DT1BJTE9UX1dJTjMyX1JFR0lTVFJZX1BBVEggfSkpO1xuXHRcdH0gZWxzZSBpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobG9nU2VydmljZSwgR0lUSFVCX0NPUElMT1RfTUFDT1NfQlVORExFX0lEKSk7XG5cdFx0fVxuXHRcdGlmIChuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSB7XG5cdFx0XHRzZXJ2aWNlcy5zZXQoSU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXJ2aWNlcy5zZXQoSU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIG5ldyBOdWxsTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSgpKTtcblx0XHR9XG5cblx0XHQvLyBGaWxlLWJhc2VkIG1hbmFnZWQgc2V0dGluZ3Ncblx0XHRsZXQgZmlsZU1hbmFnZWRTZXR0aW5nc1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBwcm9ncmFtRmlsZXMgPSBwcm9jZXNzLmVudlsnUHJvZ3JhbUZpbGVzJ107XG5cdFx0XHRpZiAocHJvZ3JhbUZpbGVzKSB7XG5cdFx0XHRcdGZpbGVNYW5hZ2VkU2V0dGluZ3NQYXRoID0gam9pbihwcm9ncmFtRmlsZXMsIE1BTkFHRURfU0VUVElOR1NfV0lORE9XU19ESVIsIE1BTkFHRURfU0VUVElOR1NfRklMRV9OQU1FKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRmaWxlTWFuYWdlZFNldHRpbmdzUGF0aCA9IE1BTkFHRURfU0VUVElOR1NfTUFDT1NfRklMRV9QQVRIO1xuXHRcdH0gZWxzZSBpZiAoaXNMaW51eCkge1xuXHRcdFx0ZmlsZU1hbmFnZWRTZXR0aW5nc1BhdGggPSBNQU5BR0VEX1NFVFRJTkdTX0xJTlVYX0ZJTEVfUEFUSDtcblx0XHR9XG5cdFx0aWYgKGZpbGVNYW5hZ2VkU2V0dGluZ3NQYXRoKSB7XG5cdFx0XHRjb25zdCBmaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoVVJJLmZpbGUoZmlsZU1hbmFnZWRTZXR0aW5nc1BhdGgpLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdFx0c2VydmljZXMuc2V0KElGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSwgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXJ2aWNlcy5zZXQoSUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBuZXcgTnVsbEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKCkpO1xuXHRcdH1cblxuXHRcdGlmIChwb2xpY3lTZXJ2aWNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlKHBvbGljeVNlcnZpY2VzLCBsb2dTZXJ2aWNlKSk7XG5cdFx0fSBlbHNlIGlmIChwb2xpY3lTZXJ2aWNlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHBvbGljeVNlcnZpY2UgPSBwb2xpY3lTZXJ2aWNlc1swXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cG9saWN5U2VydmljZSA9IG5ldyBOdWxsUG9saWN5U2VydmljZSgpO1xuXHRcdH1cblx0XHRzZXJ2aWNlcy5zZXQoSVBvbGljeVNlcnZpY2UsIHBvbGljeVNlcnZpY2UpO1xuXG5cdFx0Ly8gQ29uZmlndXJhdGlvblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgcG9saWN5U2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gTGlmZWN5Y2xlXG5cdFx0c2VydmljZXMuc2V0KElMaWZlY3ljbGVNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKExpZmVjeWNsZU1haW5TZXJ2aWNlLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cblx0XHQvLyBSZXF1ZXN0XG5cdFx0c2VydmljZXMuc2V0KElSZXF1ZXN0U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFJlcXVlc3RTZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUpKTtcblxuXHRcdC8vIFRoZW1lc1xuXHRcdHNlcnZpY2VzLnNldChJVGhlbWVNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRoZW1lTWFpblNlcnZpY2UpKTtcblxuXHRcdC8vIFNpZ25pbmdcblx0XHRzZXJ2aWNlcy5zZXQoSVNpZ25TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoU2lnblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblxuXHRcdC8vIFR1bm5lbFxuXHRcdHNlcnZpY2VzLnNldChJVHVubmVsU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFR1bm5lbFNlcnZpY2UpKTtcblxuXHRcdC8vIFByb3RvY29sIChpbnN0YW50aWF0ZWQgZWFybHkgYW5kIG5vdCB1c2luZyBzeW5jIGRlc2NyaXB0b3IgZm9yIHNlY3VyaXR5IHJlYXNvbnMpXG5cdFx0c2VydmljZXMuc2V0KElQcm90b2NvbE1haW5TZXJ2aWNlLCBuZXcgUHJvdG9jb2xNYWluU2VydmljZShlbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdHJldHVybiBbbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzLCB0cnVlKSwgaW5zdGFuY2VFbnZpcm9ubWVudCwgZW52aXJvbm1lbnRNYWluU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXRlU2VydmljZSwgYnVmZmVyTG9nZ2VyLCBwcm9kdWN0U2VydmljZSwgdXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlXTtcblx0fVxuXG5cdHByaXZhdGUgcGF0Y2hFbnZpcm9ubWVudChlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSk6IElQcm9jZXNzRW52aXJvbm1lbnQge1xuXHRcdGNvbnN0IGluc3RhbmNlRW52aXJvbm1lbnQ6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7XG5cdFx0XHRWU0NPREVfSVBDX0hPT0s6IGVudmlyb25tZW50TWFpblNlcnZpY2UubWFpbklQQ0hhbmRsZVxuXHRcdH07XG5cblx0XHRbJ1ZTQ09ERV9OTFNfQ09ORklHJywgJ1ZTQ09ERV9QT1JUQUJMRSddLmZvckVhY2goa2V5ID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gcHJvY2Vzcy5lbnZba2V5XTtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGluc3RhbmNlRW52aXJvbm1lbnRba2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0T2JqZWN0LmFzc2lnbihwcm9jZXNzLmVudiwgaW5zdGFuY2VFbnZpcm9ubWVudCk7XG5cblx0XHRyZXR1cm4gaW5zdGFuY2VFbnZpcm9ubWVudDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdFNlcnZpY2VzKGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2U6IFVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0ZVNlcnZpY2U6IFN0YXRlU2VydmljZSwgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQ8dW5rbm93bj4oW1xuXG5cdFx0XHQvLyBFbnZpcm9ubWVudCBzZXJ2aWNlIChwYXRocylcblx0XHRcdFByb21pc2UuYWxsPHN0cmluZyB8IHVuZGVmaW5lZD4oW1xuXHRcdFx0XHR0aGlzLmFsbG93V2luZG93c1VOQ1BhdGgoZW52aXJvbm1lbnRNYWluU2VydmljZS5leHRlbnNpb25zUGF0aCksIC8vIGVuYWJsZSBleHRlbnNpb24gcGF0aHMgb24gVU5DIGRyaXZlcy4uLlxuXHRcdFx0XHRlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmNvZGVDYWNoZVBhdGgsXHRcdFx0XHRcdFx0XHQgLy8gLi4ub3RoZXIgdXNlci1kYXRhLWRlcml2ZWQgcGF0aHMgc2hvdWxkIGFscmVhZHkgYmUgZW5saXN0ZWQgZnJvbSBgbWFpbi5qc2Bcblx0XHRcdFx0ZW52aXJvbm1lbnRNYWluU2VydmljZS5sb2dzSG9tZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkuZnNQYXRoLFxuXHRcdFx0XHR1c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pLmZzUGF0aCxcblx0XHRcdFx0ZW52aXJvbm1lbnRNYWluU2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkuZnNQYXRoLFxuXHRcdFx0XHRlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmxvY2FsSGlzdG9yeUhvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pLmZzUGF0aCxcblx0XHRcdFx0ZW52aXJvbm1lbnRNYWluU2VydmljZS5iYWNrdXBIb21lXG5cdFx0XHRdLm1hcChwYXRoID0+IHBhdGggPyBwcm9taXNlcy5ta2RpcihwYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KSA6IHVuZGVmaW5lZCkpLFxuXG5cdFx0XHQvLyBTdGF0ZSBzZXJ2aWNlXG5cdFx0XHRzdGF0ZVNlcnZpY2UuaW5pdCgpLFxuXG5cdFx0XHQvLyBDb25maWd1cmF0aW9uIHNlcnZpY2Vcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluaXRpYWxpemUoKVxuXHRcdF0pO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB1c2VyIGRhdGEgcHJvZmlsZXMgYWZ0ZXIgaW5pdGlhbGl6aW5nIHRoZSBzdGF0ZVxuXHRcdHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5pbml0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFsbG93V2luZG93c1VOQ1BhdGgocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBob3N0ID0gZ2V0VU5DSG9zdChwYXRoKTtcblx0XHRcdGlmIChob3N0KSB7XG5cdFx0XHRcdGFkZFVOQ0hvc3RUb0FsbG93bGlzdChob3N0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0aDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xhaW1JbnN0YW5jZShsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgZW52aXJvbm1lbnRNYWluU2VydmljZTogSUVudmlyb25tZW50TWFpblNlcnZpY2UsIGxpZmVjeWNsZU1haW5TZXJ2aWNlOiBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsIHJldHJ5OiBib29sZWFuKTogUHJvbWlzZTxOb2RlSVBDU2VydmVyPiB7XG5cblx0XHQvLyBUcnkgdG8gc2V0dXAgYSBzZXJ2ZXIgZm9yIHJ1bm5pbmcuIElmIHRoYXQgc3VjY2VlZHMgaXQgbWVhbnNcblx0XHQvLyB3ZSBhcmUgdGhlIGZpcnN0IGluc3RhbmNlIHRvIHN0YXJ0dXAuIE90aGVyd2lzZSBpdCBpcyBsaWtlbHlcblx0XHQvLyB0aGF0IGFub3RoZXIgaW5zdGFuY2UgaXMgYWxyZWFkeSBydW5uaW5nLlxuXHRcdGxldCBtYWluUHJvY2Vzc05vZGVJcGNTZXJ2ZXI6IE5vZGVJUENTZXJ2ZXI7XG5cdFx0dHJ5IHtcblx0XHRcdG1hcmsoJ2NvZGUvd2lsbFN0YXJ0TWFpblNlcnZlcicpO1xuXHRcdFx0bWFpblByb2Nlc3NOb2RlSXBjU2VydmVyID0gYXdhaXQgbm9kZUlQQ1NlcnZlKGVudmlyb25tZW50TWFpblNlcnZpY2UubWFpbklQQ0hhbmRsZSk7XG5cdFx0XHRtYXJrKCdjb2RlL2RpZFN0YXJ0TWFpblNlcnZlcicpO1xuXHRcdFx0RXZlbnQub25jZShsaWZlY3ljbGVNYWluU2VydmljZS5vbldpbGxTaHV0ZG93bikoKCkgPT4gbWFpblByb2Nlc3NOb2RlSXBjU2VydmVyLmRpc3Bvc2UoKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gSGFuZGxlIHVuZXhwZWN0ZWQgZXJyb3JzICh0aGUgb25seSBleHBlY3RlZCBlcnJvciBpcyBFQUREUklOVVNFIHRoYXRcblx0XHRcdC8vIGluZGljYXRlcyBhbm90aGVyIGluc3RhbmNlIG9mIFZTIENvZGUgaXMgcnVubmluZylcblx0XHRcdGlmIChlcnJvci5jb2RlICE9PSAnRUFERFJJTlVTRScpIHtcblxuXHRcdFx0XHQvLyBTaG93IGEgZGlhbG9nIGZvciBlcnJvcnMgdGhhdCBjYW4gYmUgcmVzb2x2ZWQgYnkgdGhlIHVzZXJcblx0XHRcdFx0dGhpcy5oYW5kbGVTdGFydHVwRGF0YURpckVycm9yKGVudmlyb25tZW50TWFpblNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBlcnJvcik7XG5cblx0XHRcdFx0Ly8gQW55IG90aGVyIHJ1bnRpbWUgZXJyb3IgaXMganVzdCBwcmludGVkIHRvIHRoZSBjb25zb2xlXG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB0aGVyZSdzIGEgcnVubmluZyBpbnN0YW5jZSwgbGV0J3MgY29ubmVjdCB0byBpdFxuXHRcdFx0bGV0IGNsaWVudDogTm9kZUlQQ0NsaWVudDxzdHJpbmc+O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2xpZW50ID0gYXdhaXQgbm9kZUlQQ0Nvbm5lY3QoZW52aXJvbm1lbnRNYWluU2VydmljZS5tYWluSVBDSGFuZGxlLCAnbWFpbicpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBIYW5kbGUgdW5leHBlY3RlZCBjb25uZWN0aW9uIGVycm9ycyBieSBzaG93aW5nIGEgZGlhbG9nIHRvIHRoZSB1c2VyXG5cdFx0XHRcdGlmICghcmV0cnkgfHwgaXNXaW5kb3dzIHx8IGVycm9yLmNvZGUgIT09ICdFQ09OTlJFRlVTRUQnKSB7XG5cdFx0XHRcdFx0aWYgKGVycm9yLmNvZGUgPT09ICdFUEVSTScpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2hvd1N0YXJ0dXBXYXJuaW5nRGlhbG9nKFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnc2Vjb25kSW5zdGFuY2VBZG1pbicsIFwiQW5vdGhlciBpbnN0YW5jZSBvZiB7MH0gaXMgYWxyZWFkeSBydW5uaW5nIGFzIGFkbWluaXN0cmF0b3IuXCIsIHByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZWNvbmRJbnN0YW5jZUFkbWluRGV0YWlsJywgXCJQbGVhc2UgY2xvc2UgdGhlIG90aGVyIGluc3RhbmNlIGFuZCB0cnkgYWdhaW4uXCIpLFxuXHRcdFx0XHRcdFx0XHRwcm9kdWN0U2VydmljZVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGl0IGhhcHBlbnMgb24gTGludXggYW5kIE9TIFggdGhhdCB0aGUgcGlwZSBpcyBsZWZ0IGJlaGluZFxuXHRcdFx0XHQvLyBsZXQncyBkZWxldGUgaXQsIHNpbmNlIHdlIGNhbid0IGNvbm5lY3QgdG8gaXQgYW5kIHRoZW5cblx0XHRcdFx0Ly8gcmV0cnkgdGhlIHdob2xlIHRoaW5nXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dW5saW5rU3luYyhlbnZpcm9ubWVudE1haW5TZXJ2aWNlLm1haW5JUENIYW5kbGUpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2Uud2FybignQ291bGQgbm90IGRlbGV0ZSBvYnNvbGV0ZSBpbnN0YW5jZSBoYW5kbGUnLCBlcnJvcik7XG5cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmNsYWltSW5zdGFuY2UobG9nU2VydmljZSwgZW52aXJvbm1lbnRNYWluU2VydmljZSwgbGlmZWN5Y2xlTWFpblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUZXN0cyBmcm9tIENMSSByZXF1aXJlIHRvIGJlIHRoZSBvbmx5IGluc3RhbmNlIGN1cnJlbnRseVxuXHRcdFx0aWYgKGVudmlyb25tZW50TWFpblNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSAmJiAhZW52aXJvbm1lbnRNYWluU2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuYnJlYWspIHtcblx0XHRcdFx0Y29uc3QgbXNnID0gYFJ1bm5pbmcgZXh0ZW5zaW9uIHRlc3RzIGZyb20gdGhlIGNvbW1hbmQgbGluZSBpcyBjdXJyZW50bHkgb25seSBzdXBwb3J0ZWQgaWYgbm8gb3RoZXIgaW5zdGFuY2Ugb2YgJHtwcm9kdWN0U2VydmljZS5uYW1lU2hvcnR9IGlzIHJ1bm5pbmcuYDtcblx0XHRcdFx0bG9nU2VydmljZS5lcnJvcihtc2cpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihtc2cpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IGEgd2FybmluZyBkaWFsb2cgYWZ0ZXIgc29tZSB0aW1lb3V0IGlmIGl0IHRha2VzIGxvbmcgdG8gdGFsayB0byB0aGUgb3RoZXIgaW5zdGFuY2Vcblx0XHRcdC8vIFNraXAgdGhpcyBpZiB3ZSBhcmUgcnVubmluZyB3aXRoIC0td2FpdCB3aGVyZSBpdCBpcyBleHBlY3RlZCB0aGF0IHdlIHdhaXQgZm9yIGEgd2hpbGUuXG5cdFx0XHQvLyBBbHNvIHNraXAgd2hlbiBnYXRoZXJpbmcgZGlhZ25vc3RpY3MgKC0tc3RhdHVzKSB3aGljaCBjYW4gdGFrZSBhIGxvbmdlciB0aW1lLlxuXHRcdFx0bGV0IHN0YXJ0dXBXYXJuaW5nRGlhbG9nSGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3Mud2FpdCAmJiAhZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLnN0YXR1cykge1xuXHRcdFx0XHRzdGFydHVwV2FybmluZ0RpYWxvZ0hhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuc2hvd1N0YXJ0dXBXYXJuaW5nRGlhbG9nKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NlY29uZEluc3RhbmNlTm9SZXNwb25zZScsIFwiQW5vdGhlciBpbnN0YW5jZSBvZiB7MH0gaXMgcnVubmluZyBidXQgbm90IHJlc3BvbmRpbmdcIiwgcHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZWNvbmRJbnN0YW5jZU5vUmVzcG9uc2VEZXRhaWwnLCBcIlBsZWFzZSBjbG9zZSBhbGwgb3RoZXIgaW5zdGFuY2VzIGFuZCB0cnkgYWdhaW4uXCIpLFxuXHRcdFx0XHRcdFx0cHJvZHVjdFNlcnZpY2Vcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9LCAxMDAwMCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG90aGVySW5zdGFuY2VMYXVuY2hNYWluU2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SUxhdW5jaE1haW5TZXJ2aWNlPihjbGllbnQuZ2V0Q2hhbm5lbCgnbGF1bmNoJyksIHsgZGlzYWJsZU1hcnNoYWxsaW5nOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgb3RoZXJJbnN0YW5jZURpYWdub3N0aWNzTWFpblNlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElEaWFnbm9zdGljc01haW5TZXJ2aWNlPihjbGllbnQuZ2V0Q2hhbm5lbCgnZGlhZ25vc3RpY3MnKSwgeyBkaXNhYmxlTWFyc2hhbGxpbmc6IHRydWUgfSk7XG5cblx0XHRcdC8vIFByb2Nlc3MgSW5mb1xuXHRcdFx0aWYgKGVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncy5zdGF0dXMpIHtcblx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBkaWFnbm9zdGljc1NlcnZpY2UgPSBuZXcgRGlhZ25vc3RpY3NTZXJ2aWNlKE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgbWFpbkRpYWdub3N0aWNzID0gYXdhaXQgb3RoZXJJbnN0YW5jZURpYWdub3N0aWNzTWFpblNlcnZpY2UuZ2V0TWFpbkRpYWdub3N0aWNzKCk7XG5cdFx0XHRcdFx0Y29uc3QgcmVtb3RlRGlhZ25vc3RpY3MgPSBhd2FpdCBvdGhlckluc3RhbmNlRGlhZ25vc3RpY3NNYWluU2VydmljZS5nZXRSZW1vdGVEaWFnbm9zdGljcyh7IGluY2x1ZGVQcm9jZXNzZXM6IHRydWUsIGluY2x1ZGVXb3Jrc3BhY2VNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRjb25zdCBkaWFnbm9zdGljcyA9IGF3YWl0IGRpYWdub3N0aWNzU2VydmljZS5nZXREaWFnbm9zdGljcyhtYWluRGlhZ25vc3RpY3MsIHJlbW90ZURpYWdub3N0aWNzKTtcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhkaWFnbm9zdGljcyk7XG5cblx0XHRcdFx0XHR0aHJvdyBuZXcgRXhwZWN0ZWRFcnJvcigpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2luZG93czogYWxsb3cgdG8gc2V0IGZvcmVncm91bmRcblx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzQWxsb3dTZXRGb3JlZ3JvdW5kV2luZG93KG90aGVySW5zdGFuY2VMYXVuY2hNYWluU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlbmQgZW52aXJvbm1lbnQgb3Zlci4uLlxuXHRcdFx0bG9nU2VydmljZS50cmFjZSgnU2VuZGluZyBlbnYgdG8gcnVubmluZyBpbnN0YW5jZS4uLicpO1xuXHRcdFx0YXdhaXQgb3RoZXJJbnN0YW5jZUxhdW5jaE1haW5TZXJ2aWNlLnN0YXJ0KGVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncywgcHJvY2Vzcy5lbnYgYXMgSVByb2Nlc3NFbnZpcm9ubWVudCk7XG5cblx0XHRcdC8vIENsZWFudXBcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIE5vdyB0aGF0IHdlIHN0YXJ0ZWQsIG1ha2Ugc3VyZSB0aGUgd2FybmluZyBkaWFsb2cgaXMgcHJldmVudGVkXG5cdFx0XHRpZiAoc3RhcnR1cFdhcm5pbmdEaWFsb2dIYW5kbGUpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHN0YXJ0dXBXYXJuaW5nRGlhbG9nSGFuZGxlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IEV4cGVjdGVkRXJyb3IoJ1NlbnQgZW52IHRvIHJ1bm5pbmcgaW5zdGFuY2UuIFRlcm1pbmF0aW5nLi4uJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJpbnQgLS1zdGF0dXMgdXNhZ2UgaW5mb1xuXHRcdGlmIChlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3Muc3RhdHVzKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhsb2NhbGl6ZSgnc3RhdHVzV2FybmluZycsIFwiV2FybmluZzogVGhlIC0tc3RhdHVzIGFyZ3VtZW50IGNhbiBvbmx5IGJlIHVzZWQgaWYgezB9IGlzIGFscmVhZHkgcnVubmluZy4gUGxlYXNlIHJ1biBpdCBhZ2FpbiBhZnRlciB7MH0gaGFzIHN0YXJ0ZWQuXCIsIHByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkpO1xuXG5cdFx0XHR0aHJvdyBuZXcgRXhwZWN0ZWRFcnJvcignVGVybWluYXRpbmcuLi4nKTtcblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIFZTQ09ERV9QSUQgdmFyaWFibGUgaGVyZSB3aGVuIHdlIGFyZSBzdXJlIHdlIGFyZSB0aGUgZmlyc3Rcblx0XHQvLyBpbnN0YW5jZSB0byBzdGFydHVwLiBPdGhlcndpc2Ugd2Ugd291bGQgd3JvbmdseSBvdmVyd3JpdGUgdGhlIFBJRFxuXHRcdHByb2Nlc3MuZW52WydWU0NPREVfUElEJ10gPSBTdHJpbmcocHJvY2Vzcy5waWQpO1xuXG5cdFx0cmV0dXJuIG1haW5Qcm9jZXNzTm9kZUlwY1NlcnZlcjtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlU3RhcnR1cERhdGFEaXJFcnJvcihlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSwgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSwgZXJyb3I6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbik6IHZvaWQge1xuXHRcdGlmIChlcnJvci5jb2RlID09PSAnRUFDQ0VTJyB8fCBlcnJvci5jb2RlID09PSAnRVBFUk0nKSB7XG5cdFx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGNvYWxlc2NlKFtlbnZpcm9ubWVudE1haW5TZXJ2aWNlLnVzZXJEYXRhUGF0aCwgZW52aXJvbm1lbnRNYWluU2VydmljZS5leHRlbnNpb25zUGF0aCwgWERHX1JVTlRJTUVfRElSXSkubWFwKGZvbGRlciA9PiBnZXRQYXRoTGFiZWwoVVJJLmZpbGUoZm9sZGVyKSwgeyBvczogT1MsIHRpbGRpZnk6IGVudmlyb25tZW50TWFpblNlcnZpY2UgfSkpO1xuXG5cdFx0XHR0aGlzLnNob3dTdGFydHVwV2FybmluZ0RpYWxvZyhcblx0XHRcdFx0bG9jYWxpemUoJ3N0YXJ0dXBEYXRhRGlyRXJyb3InLCBcIlVuYWJsZSB0byB3cml0ZSBwcm9ncmFtIHVzZXIgZGF0YS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzdGFydHVwVXNlckRhdGFBbmRFeHRlbnNpb25zRGlyRXJyb3JEZXRhaWwnLCBcInswfVxcblxcblBsZWFzZSBtYWtlIHN1cmUgdGhlIGZvbGxvd2luZyBkaXJlY3RvcmllcyBhcmUgd3JpdGVhYmxlOlxcblxcbnsxfVwiLCB0b0Vycm9yTWVzc2FnZShlcnJvciksIGRpcmVjdG9yaWVzLmpvaW4oJ1xcbicpKSxcblx0XHRcdFx0cHJvZHVjdFNlcnZpY2Vcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93U3RhcnR1cFdhcm5pbmdEaWFsb2cobWVzc2FnZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZywgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSk6IHZvaWQge1xuXG5cdFx0Ly8gdXNlIHN5bmMgdmFyaWFudCBoZXJlIGJlY2F1c2Ugd2UgbGlrZWx5IGV4aXQgYWZ0ZXIgdGhpcyBtZXRob2Rcblx0XHQvLyBkdWUgdG8gc3RhcnR1cCBpc3N1ZXMgYW5kIG90aGVyd2lzZSB0aGUgZGlhbG9nIHNlZW1zIHRvIGRpc2FwcGVhclxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDQ0OTNcblxuXHRcdGRpYWxvZy5zaG93TWVzc2FnZUJveFN5bmMobWFzc2FnZU1lc3NhZ2VCb3hPcHRpb25zKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdGJ1dHRvbnM6IFtsb2NhbGl6ZSh7IGtleTogJ2Nsb3NlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2xvc2VcIildLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGRldGFpbFxuXHRcdH0sIHByb2R1Y3RTZXJ2aWNlKS5vcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2luZG93c0FsbG93U2V0Rm9yZWdyb3VuZFdpbmRvdyhsYXVuY2hNYWluU2VydmljZTogSUxhdW5jaE1haW5TZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHByb2Nlc3NJZCA9IGF3YWl0IGxhdW5jaE1haW5TZXJ2aWNlLmdldE1haW5Qcm9jZXNzSWQoKTtcblxuXHRcdFx0bG9nU2VydmljZS50cmFjZSgnU2VuZGluZyBzb21lIGZvcmVncm91bmQgbG92ZSB0byB0aGUgcnVubmluZyBpbnN0YW5jZTonLCBwcm9jZXNzSWQpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHQoYXdhaXQgaW1wb3J0KCd3aW5kb3dzLWZvcmVncm91bmQtbG92ZScpKS5hbGxvd1NldEZvcmVncm91bmRXaW5kb3cocHJvY2Vzc0lkKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcXVpdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVhc29uPzogRXhwZWN0ZWRFcnJvciB8IEVycm9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3QgbGlmZWN5Y2xlTWFpblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpZmVjeWNsZU1haW5TZXJ2aWNlKTtcblxuXHRcdGxldCBleGl0Q29kZSA9IDA7XG5cblx0XHRpZiAocmVhc29uKSB7XG5cdFx0XHRpZiAoKHJlYXNvbiBhcyBFeHBlY3RlZEVycm9yKS5pc0V4cGVjdGVkKSB7XG5cdFx0XHRcdGlmIChyZWFzb24ubWVzc2FnZSkge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UocmVhc29uLm1lc3NhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleGl0Q29kZSA9IDE7IC8vIHNpZ25hbCBlcnJvciB0byB0aGUgb3V0c2lkZVxuXG5cdFx0XHRcdGlmIChyZWFzb24uc3RhY2spIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKHJlYXNvbi5zdGFjayk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS5lcnJvcihgU3RhcnR1cCBlcnJvcjogJHtyZWFzb24udG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxpZmVjeWNsZU1haW5TZXJ2aWNlLmtpbGwoZXhpdENvZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0lubm9TZXR1cE11dGV4KHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCEoaXNXaW5kb3dzICYmIHByb2R1Y3RTZXJ2aWNlLndpbjMyTXV0ZXhOYW1lICYmIHByb2R1Y3RTZXJ2aWNlLndpbjMyVmVyc2lvbmVkVXBkYXRlICYmIGlzSW5ub1NldHVwSW5zdGFsbCgpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB1cGRhdGluZ011dGV4TmFtZSA9IGAke3Byb2R1Y3RTZXJ2aWNlLndpbjMyTXV0ZXhOYW1lfS11cGRhdGluZ2A7XG5cdFx0XHRjb25zdCBtdXRleCA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS93aW5kb3dzLW11dGV4Jyk7XG5cblx0XHRcdGlmICghbXV0ZXguaXNBY3RpdmUodXBkYXRpbmdNdXRleE5hbWUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2FpdCBicmllZmx5IGZvciBzZXR1cCB0ZWFyZG93biB0byByZWxlYXNlIHRoZSBtdXRleDsgSW5ubydzIGBub3dhaXQgcG9zdGluc3RhbGxgIHJ1bmNvZGUgY2FuIHJhY2UgdGhlIHNldHVwIHByb2Nlc3MgZXhpdC5cblx0XHRcdGNvbnN0IHBvbGxJbnRlcnZhbE1zID0gMjUwLCByZXRyaWVzID0gMTIwOyAvLyAzMHMgdG90YWxcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgY2hlY2tJbm5vU2V0dXBNdXRleDogJHt1cGRhdGluZ011dGV4TmFtZX0gaXMgaGVsZCwgd2FpdGluZyB1cCB0byAkeyhwb2xsSW50ZXJ2YWxNcyAqIHJldHJpZXMpIC8gMTAwMH1zIGZvciBzZXR1cCB0byBmaW5pc2guLi5gKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAobXV0ZXguaXNBY3RpdmUodXBkYXRpbmdNdXRleE5hbWUpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ211dGV4IHN0aWxsIGhlbGQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHBvbGxJbnRlcnZhbE1zLCByZXRyaWVzKTtcblx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGBjaGVja0lubm9TZXR1cE11dGV4OiAke3VwZGF0aW5nTXV0ZXhOYW1lfSByZWxlYXNlZCBhZnRlciAke0RhdGUubm93KCkgLSBzdGFydH1tc2ApO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBjaGVja0lubm9TZXR1cE11dGV4OiAke3VwZGF0aW5nTXV0ZXhOYW1lfSBzdGlsbCBoZWxkIGFmdGVyICR7RGF0ZS5ub3coKSAtIHN0YXJ0fW1zLCBnaXZpbmcgdXBgKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjaGVjayBJbm5vIFNldHVwIG11dGV4OicsIGVycm9yKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gQ29tbWFuZCBsaW5lIGFyZ3VtZW50cyB1dGlsaXRpZXNcblxuXHRwcml2YXRlIHJlc29sdmVBcmdzKCk6IE5hdGl2ZVBhcnNlZEFyZ3Mge1xuXG5cdFx0Ly8gUGFyc2UgYXJndW1lbnRzXG5cdFx0Y29uc3QgYXJncyA9IHRoaXMudmFsaWRhdGVQYXRocyhwYXJzZU1haW5Qcm9jZXNzQXJndihwcm9jZXNzLmFyZ3YpKTtcblxuXHRcdGlmIChhcmdzLndhaXQgJiYgIWFyZ3Mud2FpdE1hcmtlckZpbGVQYXRoKSB7XG5cdFx0XHQvLyBJZiB3ZSBhcmUgc3RhcnRlZCB3aXRoIC0td2FpdCBjcmVhdGUgYSByYW5kb20gdGVtcG9yYXJ5IGZpbGVcblx0XHRcdC8vIGFuZCBwYXNzIGl0IG92ZXIgdG8gdGhlIHN0YXJ0aW5nIGluc3RhbmNlLiBXZSBjYW4gdXNlIHRoaXMgZmlsZVxuXHRcdFx0Ly8gdG8gd2FpdCBmb3IgaXQgdG8gYmUgZGVsZXRlZCB0byBtb25pdG9yIHRoYXQgdGhlIGVkaXRlZCBmaWxlXG5cdFx0XHQvLyBpcyBjbG9zZWQgYW5kIHRoZW4gZXhpdCB0aGUgd2FpdGluZyBwcm9jZXNzLlxuXHRcdFx0Ly9cblx0XHRcdC8vIE5vdGU6IHdlIGFyZSBub3QgZG9pbmcgdGhpcyBpZiB0aGUgd2FpdCBtYXJrZXIgaGFzIGJlZW4gYWxyZWFkeVxuXHRcdFx0Ly8gYWRkZWQgYXMgYXJndW1lbnQuIFRoaXMgY2FuIGhhcHBlbiBpZiBWUyBDb2RlIHdhcyBzdGFydGVkIGZyb20gQ0xJLlxuXHRcdFx0Y29uc3Qgd2FpdE1hcmtlckZpbGVQYXRoID0gY3JlYXRlV2FpdE1hcmtlckZpbGVTeW5jKGFyZ3MudmVyYm9zZSk7XG5cdFx0XHRpZiAod2FpdE1hcmtlckZpbGVQYXRoKSB7XG5cdFx0XHRcdGFkZEFyZyhwcm9jZXNzLmFyZ3YsICctLXdhaXRNYXJrZXJGaWxlUGF0aCcsIHdhaXRNYXJrZXJGaWxlUGF0aCk7XG5cdFx0XHRcdGFyZ3Mud2FpdE1hcmtlckZpbGVQYXRoID0gd2FpdE1hcmtlckZpbGVQYXRoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhcmdzLmNoYXQpIHtcblx0XHRcdGlmIChhcmdzLmNoYXRbJ25ldy13aW5kb3cnXSkge1xuXHRcdFx0XHQvLyBBcHBseSBgLS1uZXctd2luZG93YCBmbGFnIHRvIHRoZSBtYWluIGFyZ3VtZW50c1xuXHRcdFx0XHRhcmdzWyduZXctd2luZG93J10gPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChhcmdzLmNoYXRbJ3JldXNlLXdpbmRvdyddKSB7XG5cdFx0XHRcdC8vIEFwcGx5IGAtLXJldXNlLXdpbmRvd2AgZmxhZyB0byB0aGUgbWFpbiBhcmd1bWVudHNcblx0XHRcdFx0YXJnc1sncmV1c2Utd2luZG93J10gPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChhcmdzLmNoYXRbJ3Byb2ZpbGUnXSkge1xuXHRcdFx0XHQvLyBBcHBseSBgLS1wcm9maWxlYCBmbGFnIHRvIHRoZSBtYWluIGFyZ3VtZW50c1xuXHRcdFx0XHRhcmdzWydwcm9maWxlJ10gPSBhcmdzLmNoYXRbJ3Byb2ZpbGUnXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFVubGVzcyB3ZSBhcmUgc3RhcnRlZCB3aXRoIHNwZWNpZmljIGluc3RydWN0aW9ucyBhYm91dFxuXHRcdFx0XHQvLyBuZXcgd2luZG93cyBvciByZXVzaW5nIGV4aXN0aW5nIG9uZXMsIGFsd2F5cyB0YWtlIHRoZVxuXHRcdFx0XHQvLyBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IGFzIHdvcmtzcGFjZSB0byBvcGVuLlxuXHRcdFx0XHRhcmdzLl8gPSBbY3dkKCldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBhcmdzO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVBhdGhzKGFyZ3M6IE5hdGl2ZVBhcnNlZEFyZ3MpOiBOYXRpdmVQYXJzZWRBcmdzIHtcblx0XHRjb25zdCBkZWZhdWx0S2V5YmluZGluZ3NFeHBvcnRQYXRoID0gYXJnc1snZXhwb3J0LWRlZmF1bHQta2V5YmluZGluZ3MnXTtcblx0XHRpZiAoZGVmYXVsdEtleWJpbmRpbmdzRXhwb3J0UGF0aCkge1xuXHRcdFx0YXJnc1snZXhwb3J0LWRlZmF1bHQta2V5YmluZGluZ3MnXSA9IHNhbml0aXplRmlsZVBhdGgoZGVmYXVsdEtleWJpbmRpbmdzRXhwb3J0UGF0aCwgY3dkKCkpO1xuXHRcdH1cblxuXHRcdC8vIFRyYWNrIFVSTHMgaWYgdGhleSdyZSBnb2luZyB0byBiZSB1c2VkXG5cdFx0aWYgKGFyZ3NbJ29wZW4tdXJsJ10pIHtcblx0XHRcdGFyZ3MuX3VybHMgPSBhcmdzLl87XG5cdFx0XHRhcmdzLl8gPSBbXTtcblx0XHR9XG5cblx0XHQvLyBOb3JtYWxpemUgcGF0aHMgYW5kIHdhdGNoIG91dCBmb3IgZ290byBsaW5lIG1vZGVcblx0XHRpZiAoIWFyZ3NbJ3JlbW90ZSddKSB7XG5cdFx0XHRjb25zdCBwYXRocyA9IHRoaXMuZG9WYWxpZGF0ZVBhdGhzKGFyZ3MuXywgYXJncy5nb3RvKTtcblx0XHRcdGFyZ3MuXyA9IHBhdGhzO1xuXHRcdH1cblxuXHRcdHJldHVybiBhcmdzO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1ZhbGlkYXRlUGF0aHMoYXJnczogc3RyaW5nW10sIGdvdG9MaW5lTW9kZT86IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgY3VycmVudFdvcmtpbmdEaXIgPSBjd2QoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhcmdzLm1hcChhcmcgPT4ge1xuXHRcdFx0bGV0IHBhdGhDYW5kaWRhdGUgPSBTdHJpbmcoYXJnKTtcblxuXHRcdFx0bGV0IHBhcnNlZFBhdGg6IElQYXRoV2l0aExpbmVBbmRDb2x1bW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZ290b0xpbmVNb2RlKSB7XG5cdFx0XHRcdHBhcnNlZFBhdGggPSBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZShwYXRoQ2FuZGlkYXRlKTtcblx0XHRcdFx0cGF0aENhbmRpZGF0ZSA9IHBhcnNlZFBhdGgucGF0aDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhdGhDYW5kaWRhdGUpIHtcblx0XHRcdFx0cGF0aENhbmRpZGF0ZSA9IHRoaXMucHJlcGFyZVBhdGgoY3VycmVudFdvcmtpbmdEaXIsIHBhdGhDYW5kaWRhdGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzYW5pdGl6ZWRGaWxlUGF0aCA9IHNhbml0aXplRmlsZVBhdGgocGF0aENhbmRpZGF0ZSwgY3VycmVudFdvcmtpbmdEaXIpO1xuXG5cdFx0XHRjb25zdCBmaWxlUGF0aEJhc2VuYW1lID0gYmFzZW5hbWUoc2FuaXRpemVkRmlsZVBhdGgpO1xuXHRcdFx0aWYgKGZpbGVQYXRoQmFzZW5hbWUgLyogY2FuIGJlIGVtcHR5IGlmIGNvZGUgaXMgb3BlbmVkIG9uIHJvb3QgKi8gJiYgIWlzVmFsaWRCYXNlbmFtZShmaWxlUGF0aEJhc2VuYW1lKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDsgLy8gZG8gbm90IGFsbG93IGludmFsaWQgZmlsZSBuYW1lc1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZ290b0xpbmVNb2RlICYmIHBhcnNlZFBhdGgpIHtcblx0XHRcdFx0cGFyc2VkUGF0aC5wYXRoID0gc2FuaXRpemVkRmlsZVBhdGg7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMudG9QYXRoKHBhcnNlZFBhdGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gc2FuaXRpemVkRmlsZVBhdGg7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYXNlSW5zZW5zaXRpdmUgPSBpc1dpbmRvd3MgfHwgaXNNYWNpbnRvc2g7XG5cdFx0Y29uc3QgZGlzdGluY3RQYXRocyA9IGRpc3RpbmN0KHJlc3VsdCwgcGF0aCA9PiBwYXRoICYmIGNhc2VJbnNlbnNpdGl2ZSA/IHBhdGgudG9Mb3dlckNhc2UoKSA6IChwYXRoIHx8ICcnKSk7XG5cblx0XHRyZXR1cm4gY29hbGVzY2UoZGlzdGluY3RQYXRocyk7XG5cdH1cblxuXHRwcml2YXRlIHByZXBhcmVQYXRoKGN3ZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXG5cdFx0Ly8gVHJpbSB0cmFpbGluZyBxdW90ZXNcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRwYXRoID0gcnRyaW0ocGF0aCwgJ1wiJyk7IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDk4XG5cdFx0fVxuXG5cdFx0Ly8gVHJpbSB3aGl0ZXNwYWNlc1xuXHRcdHBhdGggPSB0cmltKHRyaW0ocGF0aCwgJyAnKSwgJ1xcdCcpO1xuXG5cdFx0aWYgKGlzV2luZG93cykge1xuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBwYXRoIGFnYWluc3QgY3dkIGlmIGl0IGlzIHJlbGF0aXZlXG5cdFx0XHRwYXRoID0gcmVzb2x2ZShjd2QsIHBhdGgpO1xuXG5cdFx0XHQvLyBUcmltIHRyYWlsaW5nICcuJyBjaGFycyBvbiBXaW5kb3dzIHRvIHByZXZlbnQgaW52YWxpZCBmaWxlIG5hbWVzXG5cdFx0XHRwYXRoID0gcnRyaW0ocGF0aCwgJy4nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0aDtcblx0fVxuXG5cdHByaXZhdGUgdG9QYXRoKHBhdGhXaXRoTGluZUFuZENvbDogSVBhdGhXaXRoTGluZUFuZENvbHVtbik6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc2VnbWVudHMgPSBbcGF0aFdpdGhMaW5lQW5kQ29sLnBhdGhdO1xuXG5cdFx0aWYgKHR5cGVvZiBwYXRoV2l0aExpbmVBbmRDb2wubGluZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHNlZ21lbnRzLnB1c2goU3RyaW5nKHBhdGhXaXRoTGluZUFuZENvbC5saW5lKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBwYXRoV2l0aExpbmVBbmRDb2wuY29sdW1uID09PSAnbnVtYmVyJykge1xuXHRcdFx0c2VnbWVudHMucHVzaChTdHJpbmcocGF0aFdpdGhMaW5lQW5kQ29sLmNvbHVtbikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzZWdtZW50cy5qb2luKCc6Jyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuLy8gTWFpbiBTdGFydHVwXG5jb25zdCBjb2RlID0gbmV3IENvZGVNYWluKCk7XG5jb2RlLm1haW4oKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFFUCxTQUFTLEtBQUssY0FBYztBQUM1QixTQUFTLFlBQVksZ0JBQWdCO0FBQ3JDLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsVUFBVSxhQUFhO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZSxpQ0FBaUM7QUFDekQsU0FBaUMsaUJBQWlCLHlCQUF5Qix3QkFBd0I7QUFDbkcsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsTUFBTSxlQUFlO0FBQ3hDLFNBQVMsWUFBWTtBQUNyQixTQUE4QixTQUFTLGFBQWEsV0FBVyxVQUFVO0FBQ3pFLFNBQVMsV0FBVztBQUNwQixTQUFTLE9BQU8sWUFBWTtBQUM1QixTQUFTLFlBQVksa0JBQWtCO0FBQ3ZDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsV0FBVyxnQkFBZ0IsU0FBUyxjQUF1Qyx1QkFBdUI7QUFDM0csU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyx3QkFBd0IsK0JBQStCO0FBQ2hFLFNBQVMsUUFBUSw0QkFBNEI7QUFDN0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyx1QkFBdUIsNEJBQTRCO0FBQzVELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CLGFBQWEsZ0JBQWdCLGFBQWEs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QUFRLEtBQUs7QUFDbEIsV0FBSyxJQUFJLENBQUM7QUFBQSxJQUNYO0FBR0EsUUFBSSxDQUFDLEtBQUssUUFBUSxHQUFHO0FBQ3BCLFlBQU0sUUFBUSxLQUFLLGdCQUFnQixLQUFLLEdBQUcsS0FBSyxJQUFJO0FBQ3BELFdBQUssSUFBSTtBQUFBLElBQ1Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQWdCLE1BQWdCLGNBQWtDO0FBQ3pFLFVBQU0sb0JBQW9CLElBQUk7QUFDOUIsVUFBTSxTQUFTLEtBQUssSUFBSSxTQUFPO0FBQzlCLFVBQUksZ0JBQWdCLE9BQU8sR0FBRztBQUU5QixVQUFJLGFBQWlEO0FBQ3JELFVBQUksY0FBYztBQUNqQixxQkFBYSx3QkFBd0IsYUFBYTtBQUNsRCx3QkFBZ0IsV0FBVztBQUFBLE1BQzVCO0FBRUEsVUFBSSxlQUFlO0FBQ2xCLHdCQUFnQixLQUFLLFlBQVksbUJBQW1CLGFBQWE7QUFBQSxNQUNsRTtBQUVBLFlBQU0sb0JBQW9CLGlCQUFpQixlQUFlLGlCQUFpQjtBQUUzRSxZQUFNLG1CQUFtQixTQUFTLGlCQUFpQjtBQUNuRCxVQUFJLG9CQUFpRSxDQUFDLGdCQUFnQixnQkFBZ0IsR0FBRztBQUN4RyxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksZ0JBQWdCLFlBQVk7QUFDL0IsbUJBQVcsT0FBTztBQUVsQixlQUFPLEtBQUssT0FBTyxVQUFVO0FBQUEsTUFDOUI7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsVUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxVQUFNLGdCQUFnQixTQUFTLFFBQVEsVUFBUSxRQUFRLGtCQUFrQixLQUFLLFlBQVksSUFBSyxRQUFRLEVBQUc7QUFFMUcsV0FBTyxTQUFTLGFBQWE7QUFBQSxFQUM5QjtBQUFBLEVBRVEsWUFBWUMsTUFBYSxNQUFzQjtBQUd0RCxRQUFJLFdBQVc7QUFDZCxhQUFPLE1BQU0sTUFBTSxHQUFHO0FBQUEsSUFDdkI7QUFHQSxXQUFPLEtBQUssS0FBSyxNQUFNLEdBQUcsR0FBRyxHQUFJO0FBRWpDLFFBQUksV0FBVztBQUdkLGFBQU8sUUFBUUEsTUFBSyxJQUFJO0FBR3hCLGFBQU8sTUFBTSxNQUFNLEdBQUc7QUFBQSxJQUN2QjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxPQUFPLG9CQUFvRDtBQUNsRSxVQUFNLFdBQVcsQ0FBQyxtQkFBbUIsSUFBSTtBQUV6QyxRQUFJLE9BQU8sbUJBQW1CLFNBQVMsVUFBVTtBQUNoRCxlQUFTLEtBQUssT0FBTyxtQkFBbUIsSUFBSSxDQUFDO0FBQUEsSUFDOUM7QUFFQSxRQUFJLE9BQU8sbUJBQW1CLFdBQVcsVUFBVTtBQUNsRCxlQUFTLEtBQUssT0FBTyxtQkFBbUIsTUFBTSxDQUFDO0FBQUEsSUFDaEQ7QUFFQSxXQUFPLFNBQVMsS0FBSyxHQUFHO0FBQUEsRUFDekI7QUFBQTtBQUdEO0FBR0EsTUFBTSxPQUFPLElBQUksU0FBUztBQUMxQixLQUFLLEtBQUs7IiwKICAibmFtZXMiOiBbInJldHJ5IiwgImVycm9yIiwgImN3ZCJdCn0K
