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
import { Action } from "../../../../base/common/actions.js";
import { timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../base/common/platform.js";
import { dirname, isEqualOrParent, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
import { PluginSourceKind } from "../common/plugins/pluginMarketplaceService.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
function sanitizeCacheSegment(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}
function gitRevisionCacheSuffix(ref, sha) {
  if (sha) {
    return [`sha_${sanitizeCacheSegment(sha)}`];
  }
  if (ref) {
    return [`ref_${sanitizeCacheSegment(ref)}`];
  }
  return [];
}
function shellEscapeArg(value) {
  if (isWindows) {
    return `"${value.replace(/[`$"]/g, "`$&")}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function formatShellCommand(args) {
  const [command, ...rest] = args;
  return [command, ...rest.map((arg) => shellEscapeArg(arg))].join(" ");
}
let AbstractGitPluginSource = class {
  constructor(_commandService, _fileService, _logService, _notificationService, _pluginGit, _progressService) {
    this._commandService = _commandService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._pluginGit = _pluginGit;
    this._progressService = _progressService;
  }
  getCleanupTarget(cacheRoot, descriptor) {
    return this._getRepoDir(cacheRoot, descriptor);
  }
  /**
   * Returns the on-disk directory of the cloned repository. Subclasses that
   * support a sub-path within a repository should override this to return the
   * repository root, while {@link getInstallUri} returns root + sub-path.
   */
  _getRepoDir(cacheRoot, descriptor) {
    return this.getInstallUri(cacheRoot, descriptor);
  }
  async ensure(cacheRoot, plugin, options) {
    const descriptor = plugin.sourceDescriptor;
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const repoExists = await this._fileService.exists(repoDir);
    const label = this._displayLabel(descriptor);
    if (repoExists) {
      await this._checkoutRevision(repoDir, descriptor, options?.failureLabel ?? label);
      return this.getInstallUri(cacheRoot, descriptor);
    }
    const progressTitle = options?.progressTitle ?? localize("cloningPluginSource", "Cloning plugin source '{0}'...", label);
    const failureLabel = options?.failureLabel ?? label;
    const ref = descriptor.ref;
    await this._cloneRepository(repoDir, this._cloneUrl(descriptor), progressTitle, failureLabel, ref);
    await this._checkoutRevision(repoDir, descriptor, failureLabel);
    return this.getInstallUri(cacheRoot, descriptor);
  }
  async update(cacheRoot, plugin, options) {
    const descriptor = plugin.sourceDescriptor;
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      this._logService.warn(`[${this.kind}] Cannot update plugin '${options?.pluginName ?? plugin.name}': source repository not cloned`);
      return false;
    }
    const updateLabel = options?.pluginName ?? plugin.name;
    const failureLabel = options?.failureLabel ?? updateLabel;
    try {
      const doUpdate = async (cts2) => {
        const git = descriptor;
        let changed;
        if (git.sha) {
          const headBefore = await this._pluginGit.revParse(repoDir, "HEAD").catch(() => void 0);
          await this._pluginGit.fetch(repoDir, cts2?.token);
          await this._checkoutRevision(repoDir, descriptor, failureLabel, cts2?.token);
          const headAfter = await this._pluginGit.revParse(repoDir, "HEAD").catch(() => void 0);
          changed = headBefore !== headAfter;
        } else {
          changed = await this._pluginGit.pull(repoDir, cts2?.token);
          await this._checkoutRevision(repoDir, descriptor, failureLabel, cts2?.token);
        }
        return changed;
      };
      if (options?.silent) {
        return await doUpdate();
      }
      const cts = new CancellationTokenSource();
      try {
        return await this._progressService.withProgress(
          {
            location: ProgressLocation.Notification,
            title: localize("updatingPluginSource", "Updating plugin '{0}'...", updateLabel),
            cancellable: true
          },
          () => doUpdate(cts),
          () => cts.dispose(true)
        );
      } finally {
        cts.dispose();
      }
    } catch (err) {
      this._logService.error(`[${this.kind}] Failed to update plugin source '${updateLabel}':`, err);
      if (!options?.silent) {
        this._notificationService.notify({
          severity: Severity.Error,
          message: localize("pullPluginSourceFailed", "Failed to update plugin '{0}': {1}", failureLabel, err?.message ?? String(err))
        });
      }
      throw err;
    }
  }
  // -- internal helpers ---
  async _cloneRepository(repoDir, cloneUrl, progressTitle, failureLabel, ref) {
    const cts = new CancellationTokenSource();
    try {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: progressTitle,
          cancellable: true
        },
        async () => {
          await this._fileService.createFolder(dirname(repoDir));
          await this._pluginGit.cloneRepository(cloneUrl, repoDir, ref, cts.token);
        },
        () => cts.dispose(true)
      );
    } catch (err) {
      this._logService.error(`[${this.kind}] Failed to clone ${cloneUrl}:`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("cloneFailed", "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err))
      });
      throw err;
    } finally {
      cts.dispose();
    }
  }
  async _checkoutRevision(repoDir, descriptor, failureLabel, token) {
    const git = descriptor;
    if (!git.sha && !git.ref) {
      return;
    }
    try {
      if (git.sha) {
        await this._pluginGit.checkout(repoDir, git.sha, true, token);
        return;
      }
      await this._pluginGit.checkout(repoDir, git.ref, void 0, token);
    } catch (err) {
      this._logService.error(`[${this.kind}] Failed to checkout revision for '${failureLabel}':`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("checkoutPluginSourceFailed", "Failed to checkout plugin '{0}' to requested revision: {1}", failureLabel, err?.message ?? String(err))
      });
      throw err;
    }
  }
};
AbstractGitPluginSource = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IPluginGitService),
  __decorateParam(5, IProgressService)
], AbstractGitPluginSource);
class RelativePathPluginSource {
  constructor() {
    this.kind = PluginSourceKind.RelativePath;
  }
  getInstallUri(_cacheRoot, _descriptor) {
    throw new Error("Use getPluginInstallUri() for relative-path sources");
  }
  async ensure(_cacheRoot, _plugin, _options) {
    throw new Error("Use ensureRepository() for relative-path sources");
  }
  async update(_cacheRoot, _plugin, _options) {
    throw new Error("Use pullRepository() for relative-path sources");
  }
  getCleanupTarget(_cacheRoot, _descriptor) {
    return void 0;
  }
  getLabel(descriptor) {
    return descriptor.path || ".";
  }
}
class GitHubPluginSource extends AbstractGitPluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.GitHub;
  }
  /** Returns the URI where the plugin content lives (repo root + optional sub-path). */
  getInstallUri(cacheRoot, descriptor) {
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const gh = descriptor;
    if (gh.path) {
      const normalizedPath = gh.path.trim().replace(/^\.?\/+|\/+$/g, "");
      if (normalizedPath) {
        const target = joinPath(repoDir, normalizedPath);
        if (isEqualOrParent(target, repoDir)) {
          return target;
        }
      }
    }
    return repoDir;
  }
  /** Returns the cloned repository root (without sub-path). */
  _getRepoDir(cacheRoot, descriptor) {
    const gh = descriptor;
    const [owner, repo] = gh.repo.split("/");
    return joinPath(cacheRoot, "github.com", owner, repo, ...gitRevisionCacheSuffix(gh.ref, gh.sha));
  }
  getLabel(descriptor) {
    const gh = descriptor;
    return gh.path ? `${gh.repo}/${gh.path}` : gh.repo;
  }
  _cloneUrl(descriptor) {
    return `https://github.com/${descriptor.repo}.git`;
  }
  _displayLabel(descriptor) {
    return descriptor.repo;
  }
}
class GitUrlPluginSource extends AbstractGitPluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.GitUrl;
  }
  /** Returns the URI where the plugin content lives (repo root + optional sub-path). */
  getInstallUri(cacheRoot, descriptor) {
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const git = descriptor;
    if (git.path) {
      const normalizedPath = git.path.trim().replace(/^\.?\/+|\/+$/g, "");
      if (normalizedPath) {
        const target = joinPath(repoDir, normalizedPath);
        if (isEqualOrParent(target, repoDir)) {
          return target;
        }
      }
    }
    return repoDir;
  }
  /** Returns the cloned repository root (without sub-path). */
  _getRepoDir(cacheRoot, descriptor) {
    const git = descriptor;
    const segments = this._gitUrlCacheSegments(git.url, git.ref, git.sha);
    return joinPath(cacheRoot, ...segments);
  }
  getLabel(descriptor) {
    const git = descriptor;
    return git.path ? `${git.url}/${git.path}` : git.url;
  }
  _cloneUrl(descriptor) {
    return descriptor.url;
  }
  _displayLabel(descriptor) {
    return descriptor.url;
  }
  _gitUrlCacheSegments(url, ref, sha) {
    try {
      const parsed = URI.parse(url);
      const authority = (parsed.authority || "unknown").replace(/[\\/:*?"<>|]/g, "_").toLowerCase();
      const pathPart = parsed.path.replace(/^\/+/, "").replace(/\.git$/i, "").replace(/\/+$/g, "");
      const segments = pathPart.split("/").map((s) => s.replace(/[\\/:*?"<>|]/g, "_"));
      return [authority, ...segments, ...gitRevisionCacheSuffix(ref, sha)];
    } catch {
      return ["git", url.replace(/[\\/:*?"<>|]/g, "_"), ...gitRevisionCacheSuffix(ref, sha)];
    }
  }
}
let AbstractPackagePluginSource = class {
  constructor(_dialogService, _fileService, _logService, _notificationService, _progressService, _terminalService) {
    this._dialogService = _dialogService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._progressService = _progressService;
    this._terminalService = _terminalService;
  }
  getCleanupTarget(cacheRoot, descriptor) {
    return this._getCacheDir(cacheRoot, descriptor);
  }
  async ensure(cacheRoot, plugin, _options) {
    const cacheDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
    await this._fileService.createFolder(cacheDir);
    return cacheDir;
  }
  async update(cacheRoot, plugin, _options) {
    const installDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
    const pluginDir = this.getInstallUri(cacheRoot, plugin.sourceDescriptor);
    await this.runInstall(installDir, pluginDir, plugin, { silent: _options?.silent });
    return true;
  }
  async runInstall(installDir, pluginDir, plugin, options) {
    const args = this._buildInstallArgs(installDir, plugin);
    const command = formatShellCommand(args);
    const confirmed = await this._confirmTerminalCommand(plugin.name, command, options?.silent);
    if (!confirmed) {
      return void 0;
    }
    const progressTitle = localize("installingPackagePlugin", "Installing {0} plugin '{1}'...", this._managerName, plugin.name);
    const { success, terminal } = await this._runTerminalCommand(command, progressTitle);
    if (!success) {
      return void 0;
    }
    const exists = await this._fileService.exists(pluginDir);
    if (!exists) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("packagePluginNotFound", "{0} package '{1}' was not found after installation.", this._managerName, this.getLabel(plugin.sourceDescriptor))
      });
      return void 0;
    }
    terminal?.dispose();
    return { pluginDir };
  }
  // -- terminal helpers (moved from PluginInstallService) ---
  async _confirmTerminalCommand(pluginName, command, silent) {
    if (silent) {
      return new Promise((resolve) => {
        const n = this._notificationService.notify({
          severity: Severity.Info,
          message: localize("confirmPluginInstallNotification", "Plugin '{0}' wants to run: {1}", pluginName, command),
          actions: {
            primary: [
              new Action("installPlugin", localize("install", "Install"), void 0, true, async () => resolve(true))
            ]
          }
        });
        Event.once(n.onDidClose)(() => resolve(false));
      });
    }
    const { confirmed } = await this._dialogService.confirm({
      type: "question",
      message: localize("confirmPluginInstall", "Install Plugin '{0}'?", pluginName),
      detail: localize("confirmPluginInstallDetail", "This will run the following command in a terminal:\n\n{0}", command),
      primaryButton: localize({ key: "confirmInstall", comment: ["&& denotes a mnemonic"] }, "&&Install")
    });
    return confirmed;
  }
  async _runTerminalCommand(command, progressTitle) {
    let terminal;
    try {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: progressTitle,
          cancellable: false
        },
        async () => {
          terminal = await this._terminalService.createTerminal({
            config: {
              name: localize("pluginInstallTerminal", "Plugin Install"),
              forceShellIntegration: true,
              isTransient: true,
              isFeatureTerminal: true
            }
          });
          await terminal.processReady;
          this._terminalService.setActiveInstance(terminal);
          const commandResultPromise = this._waitForTerminalCommandCompletion(terminal);
          await terminal.runCommand(command, true);
          const exitCode = await commandResultPromise;
          if (exitCode !== 0) {
            throw new Error(localize("terminalCommandExitCode", "Command exited with code {0}", exitCode));
          }
        }
      );
      return { success: true, terminal };
    } catch (err) {
      this._logService.error(`[${this.kind}] Terminal command failed:`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("terminalCommandFailed", "Plugin installation command failed: {0}", err?.message ?? String(err))
      });
      return { success: false, terminal };
    }
  }
  _waitForTerminalCommandCompletion(terminal) {
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let isResolved = false;
      const resolveAndDispose = (exitCode) => {
        if (isResolved) {
          return;
        }
        isResolved = true;
        disposables.dispose();
        resolve(exitCode);
      };
      const attachCommandFinishedListener = () => {
        const commandDetection = terminal.capabilities.get(TerminalCapability.CommandDetection);
        if (!commandDetection) {
          return;
        }
        disposables.add(commandDetection.onCommandFinished((command) => {
          resolveAndDispose(command.exitCode ?? 0);
        }));
      };
      attachCommandFinishedListener();
      disposables.add(terminal.capabilities.onDidAddCommandDetectionCapability(() => attachCommandFinishedListener()));
      const timeoutHandle = timeout(12e4);
      disposables.add(toDisposable(() => timeoutHandle.cancel()));
      void timeoutHandle.then(() => {
        if (isResolved) {
          return;
        }
        this._logService.warn(`[${this.kind}] Terminal command completion timed out`);
        resolveAndDispose(void 0);
      });
    });
  }
};
AbstractPackagePluginSource = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, ITerminalService)
], AbstractPackagePluginSource);
class NpmPluginSource extends AbstractPackagePluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.Npm;
    this._managerName = "npm";
  }
  getInstallUri(cacheRoot, descriptor) {
    const npm = descriptor;
    return joinPath(cacheRoot, "npm", sanitizeCacheSegment(npm.package), "node_modules", npm.package);
  }
  getLabel(descriptor) {
    const npm = descriptor;
    return npm.version ? `${npm.package}@${npm.version}` : npm.package;
  }
  _getCacheDir(cacheRoot, descriptor) {
    const npm = descriptor;
    return joinPath(cacheRoot, "npm", sanitizeCacheSegment(npm.package));
  }
  _buildInstallArgs(installDir, plugin) {
    const npm = plugin.sourceDescriptor;
    const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
    const args = ["npm", "install", "--prefix", installDir.fsPath, packageSpec];
    if (npm.registry) {
      args.push("--registry", npm.registry);
    }
    return args;
  }
}
class PipPluginSource extends AbstractPackagePluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.Pip;
    this._managerName = "pip";
  }
  getInstallUri(cacheRoot, descriptor) {
    const pip = descriptor;
    return joinPath(cacheRoot, "pip", sanitizeCacheSegment(pip.package));
  }
  getLabel(descriptor) {
    const pip = descriptor;
    return pip.version ? `${pip.package}==${pip.version}` : pip.package;
  }
  _getCacheDir(cacheRoot, descriptor) {
    const pip = descriptor;
    return joinPath(cacheRoot, "pip", sanitizeCacheSegment(pip.package));
  }
  _buildInstallArgs(installDir, plugin) {
    const pip = plugin.sourceDescriptor;
    const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
    const args = ["pip", "install", "--target", installDir.fsPath, packageSpec];
    if (pip.registry) {
      args.push("--index-url", pip.registry);
    }
    return args;
  }
}
export {
  AbstractPackagePluginSource,
  GitHubPluginSource,
  GitUrlPluginSource,
  NpmPluginSource,
  PipPluginSource,
  RelativePathPluginSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHBsdWdpblNvdXJjZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgaXNFcXVhbE9yUGFyZW50LCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSwgdHlwZSBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElFbnN1cmVSZXBvc2l0b3J5T3B0aW9ucywgSVB1bGxSZXBvc2l0b3J5T3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlBsdWdpblNvdXJjZSwgSUdpdFVybFBsdWdpblNvdXJjZSwgSU1hcmtldHBsYWNlUGx1Z2luLCBJTnBtUGx1Z2luU291cmNlLCBJUGlwUGx1Z2luU291cmNlLCBJUGx1Z2luU291cmNlRGVzY3JpcHRvciwgUGx1Z2luU291cmNlS2luZCB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luU291cmNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5HaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luR2l0U2VydmljZS5qcyc7XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gU2hhcmVkIGhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBzYW5pdGl6ZUNhY2hlU2VnbWVudChuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gbmFtZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgJ18nKTtcbn1cblxuZnVuY3Rpb24gZ2l0UmV2aXNpb25DYWNoZVN1ZmZpeChyZWY/OiBzdHJpbmcsIHNoYT86IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0aWYgKHNoYSkge1xuXHRcdHJldHVybiBbYHNoYV8ke3Nhbml0aXplQ2FjaGVTZWdtZW50KHNoYSl9YF07XG5cdH1cblx0aWYgKHJlZikge1xuXHRcdHJldHVybiBbYHJlZl8ke3Nhbml0aXplQ2FjaGVTZWdtZW50KHJlZil9YF07XG5cdH1cblx0cmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBzaGVsbEVzY2FwZUFyZyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKGlzV2luZG93cykge1xuXHRcdHJldHVybiBgXCIke3ZhbHVlLnJlcGxhY2UoL1tgJFwiXS9nLCAnYCQmJyl9XCJgO1xuXHR9XG5cdHJldHVybiBgJyR7dmFsdWUucmVwbGFjZSgvJy9nLCBgJ1xcXFwnJ2ApfSdgO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRTaGVsbENvbW1hbmQoYXJnczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRjb25zdCBbY29tbWFuZCwgLi4ucmVzdF0gPSBhcmdzO1xuXHRyZXR1cm4gW2NvbW1hbmQsIC4uLnJlc3QubWFwKGFyZyA9PiBzaGVsbEVzY2FwZUFyZyhhcmcpKV0uam9pbignICcpO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEJhc2UgZm9yIGdpdC1iYXNlZCBzb3VyY2VzIChHaXRIdWIgc2hvcnRoYW5kICYgYXJiaXRyYXJ5IEdpdCBVUkwpXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RHaXRQbHVnaW5Tb3VyY2UgaW1wbGVtZW50cyBJUGx1Z2luU291cmNlIHtcblx0YWJzdHJhY3QgcmVhZG9ubHkga2luZDogUGx1Z2luU291cmNlS2luZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQbHVnaW5HaXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcGx1Z2luR2l0OiBJUGx1Z2luR2l0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0KSB7IH1cblxuXHRhYnN0cmFjdCBnZXRJbnN0YWxsVXJpKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSTtcblx0YWJzdHJhY3QgZ2V0TGFiZWwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmc7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfY2xvbmVVcmwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmc7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZGlzcGxheUxhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nO1xuXG5cdGdldENsZWFudXBUYXJnZXQoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0UmVwb0RpcihjYWNoZVJvb3QsIGRlc2NyaXB0b3IpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG9uLWRpc2sgZGlyZWN0b3J5IG9mIHRoZSBjbG9uZWQgcmVwb3NpdG9yeS4gU3ViY2xhc3NlcyB0aGF0XG5cdCAqIHN1cHBvcnQgYSBzdWItcGF0aCB3aXRoaW4gYSByZXBvc2l0b3J5IHNob3VsZCBvdmVycmlkZSB0aGlzIHRvIHJldHVybiB0aGVcblx0ICogcmVwb3NpdG9yeSByb290LCB3aGlsZSB7QGxpbmsgZ2V0SW5zdGFsbFVyaX0gcmV0dXJucyByb290ICsgc3ViLXBhdGguXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2dldFJlcG9EaXIoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRJbnN0YWxsVXJpKGNhY2hlUm9vdCwgZGVzY3JpcHRvcik7XG5cdH1cblxuXHRhc3luYyBlbnN1cmUoY2FjaGVSb290OiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBvcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gcGx1Z2luLnNvdXJjZURlc2NyaXB0b3I7XG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuX2dldFJlcG9EaXIoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fZGlzcGxheUxhYmVsKGRlc2NyaXB0b3IpO1xuXG5cdFx0aWYgKHJlcG9FeGlzdHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NoZWNrb3V0UmV2aXNpb24ocmVwb0RpciwgZGVzY3JpcHRvciwgb3B0aW9ucz8uZmFpbHVyZUxhYmVsID8/IGxhYmVsKTtcblx0XHRcdHJldHVybiB0aGlzLmdldEluc3RhbGxVcmkoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9ncmVzc1RpdGxlID0gb3B0aW9ucz8ucHJvZ3Jlc3NUaXRsZSA/PyBsb2NhbGl6ZSgnY2xvbmluZ1BsdWdpblNvdXJjZScsIFwiQ2xvbmluZyBwbHVnaW4gc291cmNlICd7MH0nLi4uXCIsIGxhYmVsKTtcblx0XHRjb25zdCBmYWlsdXJlTGFiZWwgPSBvcHRpb25zPy5mYWlsdXJlTGFiZWwgPz8gbGFiZWw7XG5cdFx0Y29uc3QgcmVmID0gKGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZSB8IElHaXRVcmxQbHVnaW5Tb3VyY2UpLnJlZjtcblxuXHRcdGF3YWl0IHRoaXMuX2Nsb25lUmVwb3NpdG9yeShyZXBvRGlyLCB0aGlzLl9jbG9uZVVybChkZXNjcmlwdG9yKSwgcHJvZ3Jlc3NUaXRsZSwgZmFpbHVyZUxhYmVsLCByZWYpO1xuXHRcdGF3YWl0IHRoaXMuX2NoZWNrb3V0UmV2aXNpb24ocmVwb0RpciwgZGVzY3JpcHRvciwgZmFpbHVyZUxhYmVsKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRJbnN0YWxsVXJpKGNhY2hlUm9vdCwgZGVzY3JpcHRvcik7XG5cdH1cblxuXHRhc3luYyB1cGRhdGUoY2FjaGVSb290OiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBvcHRpb25zPzogSVB1bGxSZXBvc2l0b3J5T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBwbHVnaW4uc291cmNlRGVzY3JpcHRvcjtcblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5fZ2V0UmVwb0RpcihjYWNoZVJvb3QsIGRlc2NyaXB0b3IpO1xuXHRcdGNvbnN0IHJlcG9FeGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocmVwb0Rpcik7XG5cdFx0aWYgKCFyZXBvRXhpc3RzKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMua2luZH1dIENhbm5vdCB1cGRhdGUgcGx1Z2luICcke29wdGlvbnM/LnBsdWdpbk5hbWUgPz8gcGx1Z2luLm5hbWV9Jzogc291cmNlIHJlcG9zaXRvcnkgbm90IGNsb25lZGApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZUxhYmVsID0gb3B0aW9ucz8ucGx1Z2luTmFtZSA/PyBwbHVnaW4ubmFtZTtcblx0XHRjb25zdCBmYWlsdXJlTGFiZWwgPSBvcHRpb25zPy5mYWlsdXJlTGFiZWwgPz8gdXBkYXRlTGFiZWw7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZG9VcGRhdGUgPSBhc3luYyAoY3RzPzogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgZ2l0ID0gZGVzY3JpcHRvciBhcyBJR2l0SHViUGx1Z2luU291cmNlIHwgSUdpdFVybFBsdWdpblNvdXJjZTtcblx0XHRcdFx0bGV0IGNoYW5nZWQ6IGJvb2xlYW47XG5cdFx0XHRcdGlmIChnaXQuc2hhKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZEJlZm9yZSA9IGF3YWl0IHRoaXMuX3BsdWdpbkdpdC5yZXZQYXJzZShyZXBvRGlyLCAnSEVBRCcpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcGx1Z2luR2l0LmZldGNoKHJlcG9EaXIsIGN0cz8udG9rZW4pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NoZWNrb3V0UmV2aXNpb24ocmVwb0RpciwgZGVzY3JpcHRvciwgZmFpbHVyZUxhYmVsLCBjdHM/LnRva2VuKTtcblx0XHRcdFx0XHRjb25zdCBoZWFkQWZ0ZXIgPSBhd2FpdCB0aGlzLl9wbHVnaW5HaXQucmV2UGFyc2UocmVwb0RpciwgJ0hFQUQnKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGNoYW5nZWQgPSBoZWFkQmVmb3JlICE9PSBoZWFkQWZ0ZXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IGF3YWl0IHRoaXMuX3BsdWdpbkdpdC5wdWxsKHJlcG9EaXIsIGN0cz8udG9rZW4pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NoZWNrb3V0UmV2aXNpb24ocmVwb0RpciwgZGVzY3JpcHRvciwgZmFpbHVyZUxhYmVsLCBjdHM/LnRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY2hhbmdlZDtcblx0XHRcdH07XG5cblx0XHRcdGlmIChvcHRpb25zPy5zaWxlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGRvVXBkYXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd1cGRhdGluZ1BsdWdpblNvdXJjZScsIFwiVXBkYXRpbmcgcGx1Z2luICd7MH0nLi4uXCIsIHVwZGF0ZUxhYmVsKSxcblx0XHRcdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0KCkgPT4gZG9VcGRhdGUoY3RzKSxcblx0XHRcdFx0XHQoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSxcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbJHt0aGlzLmtpbmR9XSBGYWlsZWQgdG8gdXBkYXRlIHBsdWdpbiBzb3VyY2UgJyR7dXBkYXRlTGFiZWx9JzpgLCBlcnIpO1xuXHRcdFx0aWYgKCFvcHRpb25zPy5zaWxlbnQpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncHVsbFBsdWdpblNvdXJjZUZhaWxlZCcsIFwiRmFpbGVkIHRvIHVwZGF0ZSBwbHVnaW4gJ3swfSc6IHsxfVwiLCBmYWlsdXJlTGFiZWwsIGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIGludGVybmFsIGhlbHBlcnMgLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfY2xvbmVSZXBvc2l0b3J5KHJlcG9EaXI6IFVSSSwgY2xvbmVVcmw6IHN0cmluZywgcHJvZ3Jlc3NUaXRsZTogc3RyaW5nLCBmYWlsdXJlTGFiZWw6IHN0cmluZywgcmVmPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IHByb2dyZXNzVGl0bGUsXG5cdFx0XHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGlybmFtZShyZXBvRGlyKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcGx1Z2luR2l0LmNsb25lUmVwb3NpdG9yeShjbG9uZVVybCwgcmVwb0RpciwgcmVmLCBjdHMudG9rZW4pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbJHt0aGlzLmtpbmR9XSBGYWlsZWQgdG8gY2xvbmUgJHtjbG9uZVVybH06YCwgZXJyKTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2xvbmVGYWlsZWQnLCBcIkZhaWxlZCB0byBpbnN0YWxsIHBsdWdpbiAnezB9JzogezF9XCIsIGZhaWx1cmVMYWJlbCwgZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKSxcblx0XHRcdH0pO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoZWNrb3V0UmV2aXNpb24ocmVwb0RpcjogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvciwgZmFpbHVyZUxhYmVsOiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnaXQgPSBkZXNjcmlwdG9yIGFzIElHaXRIdWJQbHVnaW5Tb3VyY2UgfCBJR2l0VXJsUGx1Z2luU291cmNlO1xuXHRcdGlmICghZ2l0LnNoYSAmJiAhZ2l0LnJlZikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZ2l0LnNoYSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9wbHVnaW5HaXQuY2hlY2tvdXQocmVwb0RpciwgZ2l0LnNoYSwgdHJ1ZSwgdG9rZW4pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBnaXQucmVmIGlzIGd1YXJhbnRlZWQgbm9uLW51bGxpc2ggYnkgdGhlIGd1YXJkIGFib3ZlXG5cdFx0XHRhd2FpdCB0aGlzLl9wbHVnaW5HaXQuY2hlY2tvdXQocmVwb0RpciwgZ2l0LnJlZiEsIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7dGhpcy5raW5kfV0gRmFpbGVkIHRvIGNoZWNrb3V0IHJldmlzaW9uIGZvciAnJHtmYWlsdXJlTGFiZWx9JzpgLCBlcnIpO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjaGVja291dFBsdWdpblNvdXJjZUZhaWxlZCcsIFwiRmFpbGVkIHRvIGNoZWNrb3V0IHBsdWdpbiAnezB9JyB0byByZXF1ZXN0ZWQgcmV2aXNpb246IHsxfVwiLCBmYWlsdXJlTGFiZWwsIGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSksXG5cdFx0XHR9KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBSZWxhdGl2ZVBhdGggXHUyMDE0IHBsdWdpbiBsaXZlcyBpbnNpZGUgYSBzaGFyZWQgbWFya2V0cGxhY2UgcmVwb3NpdG9yeVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBSZWxhdGl2ZVBhdGhQbHVnaW5Tb3VyY2UgaW1wbGVtZW50cyBJUGx1Z2luU291cmNlIHtcblx0cmVhZG9ubHkga2luZCA9IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoO1xuXG5cdGdldEluc3RhbGxVcmkoX2NhY2hlUm9vdDogVVJJLCBfZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVXNlIGdldFBsdWdpbkluc3RhbGxVcmkoKSBmb3IgcmVsYXRpdmUtcGF0aCBzb3VyY2VzJyk7XG5cdH1cblxuXHRhc3luYyBlbnN1cmUoX2NhY2hlUm9vdDogVVJJLCBfcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4sIF9vcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZSBlbnN1cmVSZXBvc2l0b3J5KCkgZm9yIHJlbGF0aXZlLXBhdGggc291cmNlcycpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlKF9jYWNoZVJvb3Q6IFVSSSwgX3BsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBfb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZSBwdWxsUmVwb3NpdG9yeSgpIGZvciByZWxhdGl2ZS1wYXRoIHNvdXJjZXMnKTtcblx0fVxuXG5cdGdldENsZWFudXBUYXJnZXQoX2NhY2hlUm9vdDogVVJJLCBfZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIChkZXNjcmlwdG9yIGFzIHsgcGF0aDogc3RyaW5nIH0pLnBhdGggfHwgJy4nO1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gR2l0SHViIFx1MjAxNCBgeyBzb3VyY2U6IFwiZ2l0aHViXCIsIHJlcG86IFwib3duZXIvcmVwb1wiIH1gXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGNsYXNzIEdpdEh1YlBsdWdpblNvdXJjZSBleHRlbmRzIEFic3RyYWN0R2l0UGx1Z2luU291cmNlIHtcblx0cmVhZG9ubHkga2luZCA9IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViO1xuXG5cdC8qKiBSZXR1cm5zIHRoZSBVUkkgd2hlcmUgdGhlIHBsdWdpbiBjb250ZW50IGxpdmVzIChyZXBvIHJvb3QgKyBvcHRpb25hbCBzdWItcGF0aCkuICovXG5cdGdldEluc3RhbGxVcmkoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5fZ2V0UmVwb0RpcihjYWNoZVJvb3QsIGRlc2NyaXB0b3IpO1xuXHRcdGNvbnN0IGdoID0gZGVzY3JpcHRvciBhcyBJR2l0SHViUGx1Z2luU291cmNlO1xuXHRcdGlmIChnaC5wYXRoKSB7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkUGF0aCA9IGdoLnBhdGgudHJpbSgpLnJlcGxhY2UoL15cXC4/XFwvK3xcXC8rJC9nLCAnJyk7XG5cdFx0XHRpZiAobm9ybWFsaXplZFBhdGgpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgocmVwb0Rpciwgbm9ybWFsaXplZFBhdGgpO1xuXHRcdFx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KHRhcmdldCwgcmVwb0RpcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXBvRGlyO1xuXHR9XG5cblx0LyoqIFJldHVybnMgdGhlIGNsb25lZCByZXBvc2l0b3J5IHJvb3QgKHdpdGhvdXQgc3ViLXBhdGgpLiAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldFJlcG9EaXIoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHRjb25zdCBnaCA9IGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZTtcblx0XHRjb25zdCBbb3duZXIsIHJlcG9dID0gZ2gucmVwby5zcGxpdCgnLycpO1xuXHRcdHJldHVybiBqb2luUGF0aChjYWNoZVJvb3QsICdnaXRodWIuY29tJywgb3duZXIsIHJlcG8sIC4uLmdpdFJldmlzaW9uQ2FjaGVTdWZmaXgoZ2gucmVmLCBnaC5zaGEpKTtcblx0fVxuXG5cdGdldExhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRjb25zdCBnaCA9IGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZTtcblx0XHRyZXR1cm4gZ2gucGF0aCA/IGAke2doLnJlcG99LyR7Z2gucGF0aH1gIDogZ2gucmVwbztcblx0fVxuXG5cdHByb3RlY3RlZCBfY2xvbmVVcmwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7KGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZSkucmVwb30uZ2l0YDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZGlzcGxheUxhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZSkucmVwbztcblx0fVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEdpdFVybCBcdTIwMTQgYHsgc291cmNlOiBcInVybFwiLCB1cmw6IFwiaHR0cHM6Ly9cdTIwMjYvcmVwby5naXRcIiB9YFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBHaXRVcmxQbHVnaW5Tb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdEdpdFBsdWdpblNvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQgPSBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybDtcblxuXHQvKiogUmV0dXJucyB0aGUgVVJJIHdoZXJlIHRoZSBwbHVnaW4gY29udGVudCBsaXZlcyAocmVwbyByb290ICsgb3B0aW9uYWwgc3ViLXBhdGgpLiAqL1xuXHRnZXRJbnN0YWxsVXJpKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuX2dldFJlcG9EaXIoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0XHRjb25zdCBnaXQgPSBkZXNjcmlwdG9yIGFzIElHaXRVcmxQbHVnaW5Tb3VyY2U7XG5cdFx0aWYgKGdpdC5wYXRoKSB7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkUGF0aCA9IGdpdC5wYXRoLnRyaW0oKS5yZXBsYWNlKC9eXFwuP1xcLyt8XFwvKyQvZywgJycpO1xuXHRcdFx0aWYgKG5vcm1hbGl6ZWRQYXRoKSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJlcG9EaXIsIG5vcm1hbGl6ZWRQYXRoKTtcblx0XHRcdFx0aWYgKGlzRXF1YWxPclBhcmVudCh0YXJnZXQsIHJlcG9EaXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVwb0Rpcjtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHRoZSBjbG9uZWQgcmVwb3NpdG9yeSByb290ICh3aXRob3V0IHN1Yi1wYXRoKS4gKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRSZXBvRGlyKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0Y29uc3QgZ2l0ID0gZGVzY3JpcHRvciBhcyBJR2l0VXJsUGx1Z2luU291cmNlO1xuXHRcdGNvbnN0IHNlZ21lbnRzID0gdGhpcy5fZ2l0VXJsQ2FjaGVTZWdtZW50cyhnaXQudXJsLCBnaXQucmVmLCBnaXQuc2hhKTtcblx0XHRyZXR1cm4gam9pblBhdGgoY2FjaGVSb290LCAuLi5zZWdtZW50cyk7XG5cdH1cblxuXHRnZXRMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgZ2l0ID0gZGVzY3JpcHRvciBhcyBJR2l0VXJsUGx1Z2luU291cmNlO1xuXHRcdHJldHVybiBnaXQucGF0aCA/IGAke2dpdC51cmx9LyR7Z2l0LnBhdGh9YCA6IGdpdC51cmw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2Nsb25lVXJsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKGRlc2NyaXB0b3IgYXMgSUdpdFVybFBsdWdpblNvdXJjZSkudXJsO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kaXNwbGF5TGFiZWwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiAoZGVzY3JpcHRvciBhcyBJR2l0VXJsUGx1Z2luU291cmNlKS51cmw7XG5cdH1cblxuXHRwcml2YXRlIF9naXRVcmxDYWNoZVNlZ21lbnRzKHVybDogc3RyaW5nLCByZWY/OiBzdHJpbmcsIHNoYT86IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKHVybCk7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSAocGFyc2VkLmF1dGhvcml0eSB8fCAndW5rbm93bicpLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XS9nLCAnXycpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBwYXRoUGFydCA9IHBhcnNlZC5wYXRoLnJlcGxhY2UoL15cXC8rLywgJycpLnJlcGxhY2UoL1xcLmdpdCQvaSwgJycpLnJlcGxhY2UoL1xcLyskL2csICcnKTtcblx0XHRcdGNvbnN0IHNlZ21lbnRzID0gcGF0aFBhcnQuc3BsaXQoJy8nKS5tYXAocyA9PiBzLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XS9nLCAnXycpKTtcblx0XHRcdHJldHVybiBbYXV0aG9yaXR5LCAuLi5zZWdtZW50cywgLi4uZ2l0UmV2aXNpb25DYWNoZVN1ZmZpeChyZWYsIHNoYSldO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFsnZ2l0JywgdXJsLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XS9nLCAnXycpLCAuLi5naXRSZXZpc2lvbkNhY2hlU3VmZml4KHJlZiwgc2hhKV07XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQmFzZSBmb3IgcGFja2FnZS1tYW5hZ2VyLWJhc2VkIHNvdXJjZXMgKG5wbSwgcGlwKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFBhY2thZ2VQbHVnaW5Tb3VyY2UgaW1wbGVtZW50cyBJUGx1Z2luU291cmNlIHtcblx0YWJzdHJhY3QgcmVhZG9ubHkga2luZDogUGx1Z2luU291cmNlS2luZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YWJzdHJhY3QgZ2V0SW5zdGFsbFVyaShjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkk7XG5cdGFic3RyYWN0IGdldExhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nO1xuXG5cdGdldENsZWFudXBUYXJnZXQoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2FjaGVEaXIoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHBhcmVudCBkaXJlY3RvcnkgKHByZWZpeCAvIHRhcmdldCkgd2hlcmUgdGhlIHBhY2thZ2Vcblx0ICogbWFuYWdlciBpbnN0YWxscyBpbnRvLiBUaGlzIGlzIGFib3ZlIHRoZSBhY3R1YWwgcGx1Z2luIGNvbnRlbnQgZGlyLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRDYWNoZURpcihjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkk7XG5cblx0LyoqIEJ1aWxkIHRoZSB0ZXJtaW5hbCBjb21tYW5kIGFyZ3MgZm9yIGluc3RhbGwuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfYnVpbGRJbnN0YWxsQXJncyhpbnN0YWxsRGlyOiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogc3RyaW5nW107XG5cblx0LyoqIEh1bWFuLXJlYWRhYmxlIHBhY2thZ2UgbWFuYWdlciBuYW1lIGZvciBtZXNzYWdlcy4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldCBfbWFuYWdlck5hbWUoKTogc3RyaW5nO1xuXG5cdGFzeW5jIGVuc3VyZShjYWNoZVJvb3Q6IFVSSSwgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4sIF9vcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBjYWNoZURpciA9IHRoaXMuX2dldENhY2hlRGlyKGNhY2hlUm9vdCwgcGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihjYWNoZURpcik7XG5cdFx0cmV0dXJuIGNhY2hlRGlyO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlKGNhY2hlUm9vdDogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgX29wdGlvbnM/OiBJUHVsbFJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gRm9yIHBhY2thZ2UtbWFuYWdlciBzb3VyY2VzLCBcInVwZGF0ZVwiIHJlLXJ1bnMgaW5zdGFsbC5cblx0XHRjb25zdCBpbnN0YWxsRGlyID0gdGhpcy5fZ2V0Q2FjaGVEaXIoY2FjaGVSb290LCBwbHVnaW4uc291cmNlRGVzY3JpcHRvcik7XG5cdFx0Y29uc3QgcGx1Z2luRGlyID0gdGhpcy5nZXRJbnN0YWxsVXJpKGNhY2hlUm9vdCwgcGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdGF3YWl0IHRoaXMucnVuSW5zdGFsbChpbnN0YWxsRGlyLCBwbHVnaW5EaXIsIHBsdWdpbiwgeyBzaWxlbnQ6IF9vcHRpb25zPy5zaWxlbnQgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBydW5JbnN0YWxsKGluc3RhbGxEaXI6IFVSSSwgcGx1Z2luRGlyOiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBvcHRpb25zPzogeyBzaWxlbnQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHsgcGx1Z2luRGlyOiBVUkkgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSB0aGlzLl9idWlsZEluc3RhbGxBcmdzKGluc3RhbGxEaXIsIHBsdWdpbik7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGZvcm1hdFNoZWxsQ29tbWFuZChhcmdzKTtcblx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLl9jb25maXJtVGVybWluYWxDb21tYW5kKHBsdWdpbi5uYW1lLCBjb21tYW5kLCBvcHRpb25zPy5zaWxlbnQpO1xuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2dyZXNzVGl0bGUgPSBsb2NhbGl6ZSgnaW5zdGFsbGluZ1BhY2thZ2VQbHVnaW4nLCBcIkluc3RhbGxpbmcgezB9IHBsdWdpbiAnezF9Jy4uLlwiLCB0aGlzLl9tYW5hZ2VyTmFtZSwgcGx1Z2luLm5hbWUpO1xuXHRcdGNvbnN0IHsgc3VjY2VzcywgdGVybWluYWwgfSA9IGF3YWl0IHRoaXMuX3J1blRlcm1pbmFsQ29tbWFuZChjb21tYW5kLCBwcm9ncmVzc1RpdGxlKTtcblx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHBsdWdpbkRpcik7XG5cdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncGFja2FnZVBsdWdpbk5vdEZvdW5kJywgXCJ7MH0gcGFja2FnZSAnezF9JyB3YXMgbm90IGZvdW5kIGFmdGVyIGluc3RhbGxhdGlvbi5cIiwgdGhpcy5fbWFuYWdlck5hbWUsIHRoaXMuZ2V0TGFiZWwocGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0ZXJtaW5hbD8uZGlzcG9zZSgpO1xuXHRcdHJldHVybiB7IHBsdWdpbkRpciB9O1xuXHR9XG5cblx0Ly8gLS0gdGVybWluYWwgaGVscGVycyAobW92ZWQgZnJvbSBQbHVnaW5JbnN0YWxsU2VydmljZSkgLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlybVRlcm1pbmFsQ29tbWFuZChwbHVnaW5OYW1lOiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZywgc2lsZW50PzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChzaWxlbnQpIHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgbiA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybVBsdWdpbkluc3RhbGxOb3RpZmljYXRpb24nLCBcIlBsdWdpbiAnezB9JyB3YW50cyB0byBydW46IHsxfVwiLCBwbHVnaW5OYW1lLCBjb21tYW5kKSxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBbXG5cdFx0XHRcdFx0XHRcdG5ldyBBY3Rpb24oJ2luc3RhbGxQbHVnaW4nLCBsb2NhbGl6ZSgnaW5zdGFsbCcsIFwiSW5zdGFsbFwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiByZXNvbHZlKHRydWUpKSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0RXZlbnQub25jZShuLm9uRGlkQ2xvc2UpKCgpID0+IHJlc29sdmUoZmFsc2UpKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtUGx1Z2luSW5zdGFsbCcsIFwiSW5zdGFsbCBQbHVnaW4gJ3swfSc/XCIsIHBsdWdpbk5hbWUpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybVBsdWdpbkluc3RhbGxEZXRhaWwnLCBcIlRoaXMgd2lsbCBydW4gdGhlIGZvbGxvd2luZyBjb21tYW5kIGluIGEgdGVybWluYWw6XFxuXFxuezB9XCIsIGNvbW1hbmQpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdjb25maXJtSW5zdGFsbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkluc3RhbGxcIiksXG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNvbmZpcm1lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blRlcm1pbmFsQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIHByb2dyZXNzVGl0bGU6IHN0cmluZykge1xuXHRcdGxldCB0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IHByb2dyZXNzVGl0bGUsXG5cdFx0XHRcdFx0Y2FuY2VsbGFibGU6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGVybWluYWwgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdwbHVnaW5JbnN0YWxsVGVybWluYWwnLCBcIlBsdWdpbiBJbnN0YWxsXCIpLFxuXHRcdFx0XHRcdFx0XHRmb3JjZVNoZWxsSW50ZWdyYXRpb246IHRydWUsXG5cdFx0XHRcdFx0XHRcdGlzVHJhbnNpZW50OiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogdHJ1ZSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YXdhaXQgdGVybWluYWwucHJvY2Vzc1JlYWR5O1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbCk7XG5cblx0XHRcdFx0XHRjb25zdCBjb21tYW5kUmVzdWx0UHJvbWlzZSA9IHRoaXMuX3dhaXRGb3JUZXJtaW5hbENvbW1hbmRDb21wbGV0aW9uKHRlcm1pbmFsKTtcblx0XHRcdFx0XHRhd2FpdCB0ZXJtaW5hbC5ydW5Db21tYW5kKGNvbW1hbmQsIHRydWUpO1xuXHRcdFx0XHRcdGNvbnN0IGV4aXRDb2RlID0gYXdhaXQgY29tbWFuZFJlc3VsdFByb21pc2U7XG5cdFx0XHRcdFx0aWYgKGV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3Rlcm1pbmFsQ29tbWFuZEV4aXRDb2RlJywgXCJDb21tYW5kIGV4aXRlZCB3aXRoIGNvZGUgezB9XCIsIGV4aXRDb2RlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgdGVybWluYWwgfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFske3RoaXMua2luZH1dIFRlcm1pbmFsIGNvbW1hbmQgZmFpbGVkOmAsIGVycik7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Rlcm1pbmFsQ29tbWFuZEZhaWxlZCcsIFwiUGx1Z2luIGluc3RhbGxhdGlvbiBjb21tYW5kIGZhaWxlZDogezB9XCIsIGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSksXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCB0ZXJtaW5hbCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dhaXRGb3JUZXJtaW5hbENvbW1hbmRDb21wbGV0aW9uKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCBpc1Jlc29sdmVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHJlc29sdmVBbmREaXNwb3NlID0gKGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkID0+IHtcblx0XHRcdFx0aWYgKGlzUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aXNSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZShleGl0Q29kZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhdHRhY2hDb21tYW5kRmluaXNoZWRMaXN0ZW5lciA9ICgpOiB2b2lkID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHRlcm1pbmFsLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdFx0XHRpZiAoIWNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbW1hbmREZXRlY3Rpb24ub25Db21tYW5kRmluaXNoZWQoKGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlQW5kRGlzcG9zZShjb21tYW5kLmV4aXRDb2RlID8/IDApO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRhdHRhY2hDb21tYW5kRmluaXNoZWRMaXN0ZW5lcigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRlcm1pbmFsLmNhcGFiaWxpdGllcy5vbkRpZEFkZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KCgpID0+IGF0dGFjaENvbW1hbmRGaW5pc2hlZExpc3RlbmVyKCkpKTtcblxuXHRcdFx0Y29uc3QgdGltZW91dEhhbmRsZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gPSB0aW1lb3V0KDEyMF8wMDApO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aW1lb3V0SGFuZGxlLmNhbmNlbCgpKSk7XG5cdFx0XHR2b2lkIHRpbWVvdXRIYW5kbGUudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1Jlc29sdmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5raW5kfV0gVGVybWluYWwgY29tbWFuZCBjb21wbGV0aW9uIHRpbWVkIG91dGApO1xuXHRcdFx0XHRyZXNvbHZlQW5kRGlzcG9zZSh1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBucG0gXHUyMDE0IGB7IHNvdXJjZTogXCJucG1cIiwgcGFja2FnZTogXCJAb3JnL3BsdWdpblwiIH1gXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGNsYXNzIE5wbVBsdWdpblNvdXJjZSBleHRlbmRzIEFic3RyYWN0UGFja2FnZVBsdWdpblNvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQgPSBQbHVnaW5Tb3VyY2VLaW5kLk5wbTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9tYW5hZ2VyTmFtZSA9ICducG0nO1xuXG5cdGdldEluc3RhbGxVcmkoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHRjb25zdCBucG0gPSBkZXNjcmlwdG9yIGFzIElOcG1QbHVnaW5Tb3VyY2U7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGNhY2hlUm9vdCwgJ25wbScsIHNhbml0aXplQ2FjaGVTZWdtZW50KG5wbS5wYWNrYWdlKSwgJ25vZGVfbW9kdWxlcycsIG5wbS5wYWNrYWdlKTtcblx0fVxuXG5cdGdldExhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRjb25zdCBucG0gPSBkZXNjcmlwdG9yIGFzIElOcG1QbHVnaW5Tb3VyY2U7XG5cdFx0cmV0dXJuIG5wbS52ZXJzaW9uID8gYCR7bnBtLnBhY2thZ2V9QCR7bnBtLnZlcnNpb259YCA6IG5wbS5wYWNrYWdlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRDYWNoZURpcihjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkge1xuXHRcdGNvbnN0IG5wbSA9IGRlc2NyaXB0b3IgYXMgSU5wbVBsdWdpblNvdXJjZTtcblx0XHRyZXR1cm4gam9pblBhdGgoY2FjaGVSb290LCAnbnBtJywgc2FuaXRpemVDYWNoZVNlZ21lbnQobnBtLnBhY2thZ2UpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfYnVpbGRJbnN0YWxsQXJncyhpbnN0YWxsRGlyOiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IG5wbSA9IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yIGFzIElOcG1QbHVnaW5Tb3VyY2U7XG5cdFx0Y29uc3QgcGFja2FnZVNwZWMgPSBucG0udmVyc2lvbiA/IGAke25wbS5wYWNrYWdlfUAke25wbS52ZXJzaW9ufWAgOiBucG0ucGFja2FnZTtcblx0XHRjb25zdCBhcmdzID0gWyducG0nLCAnaW5zdGFsbCcsICctLXByZWZpeCcsIGluc3RhbGxEaXIuZnNQYXRoLCBwYWNrYWdlU3BlY107XG5cdFx0aWYgKG5wbS5yZWdpc3RyeSkge1xuXHRcdFx0YXJncy5wdXNoKCctLXJlZ2lzdHJ5JywgbnBtLnJlZ2lzdHJ5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFyZ3M7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBwaXAgXHUyMDE0IGB7IHNvdXJjZTogXCJwaXBcIiwgcGFja2FnZTogXCJteS1wbHVnaW5cIiB9YFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBQaXBQbHVnaW5Tb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdFBhY2thZ2VQbHVnaW5Tb3VyY2Uge1xuXHRyZWFkb25seSBraW5kID0gUGx1Z2luU291cmNlS2luZC5QaXA7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbWFuYWdlck5hbWUgPSAncGlwJztcblxuXHRnZXRJbnN0YWxsVXJpKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0Y29uc3QgcGlwID0gZGVzY3JpcHRvciBhcyBJUGlwUGx1Z2luU291cmNlO1xuXHRcdHJldHVybiBqb2luUGF0aChjYWNoZVJvb3QsICdwaXAnLCBzYW5pdGl6ZUNhY2hlU2VnbWVudChwaXAucGFja2FnZSkpO1xuXHR9XG5cblx0Z2V0TGFiZWwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHBpcCA9IGRlc2NyaXB0b3IgYXMgSVBpcFBsdWdpblNvdXJjZTtcblx0XHRyZXR1cm4gcGlwLnZlcnNpb24gPyBgJHtwaXAucGFja2FnZX09PSR7cGlwLnZlcnNpb259YCA6IHBpcC5wYWNrYWdlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRDYWNoZURpcihjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkge1xuXHRcdGNvbnN0IHBpcCA9IGRlc2NyaXB0b3IgYXMgSVBpcFBsdWdpblNvdXJjZTtcblx0XHRyZXR1cm4gam9pblBhdGgoY2FjaGVSb290LCAncGlwJywgc2FuaXRpemVDYWNoZVNlZ21lbnQocGlwLnBhY2thZ2UpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfYnVpbGRJbnN0YWxsQXJncyhpbnN0YWxsRGlyOiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHBpcCA9IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yIGFzIElQaXBQbHVnaW5Tb3VyY2U7XG5cdFx0Y29uc3QgcGFja2FnZVNwZWMgPSBwaXAudmVyc2lvbiA/IGAke3BpcC5wYWNrYWdlfT09JHtwaXAudmVyc2lvbn1gIDogcGlwLnBhY2thZ2U7XG5cdFx0Y29uc3QgYXJncyA9IFsncGlwJywgJ2luc3RhbGwnLCAnLS10YXJnZXQnLCBpbnN0YWxsRGlyLmZzUGF0aCwgcGFja2FnZVNwZWNdO1xuXHRcdGlmIChwaXAucmVnaXN0cnkpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1pbmRleC11cmwnLCBwaXAucmVnaXN0cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJncztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBNEIsZUFBZTtBQUMzQyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUNuRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLDBCQUFpRDtBQUMxRCxTQUE0Qix3QkFBd0I7QUFFcEQsU0FBb0ksd0JBQXdCO0FBRTVKLFNBQVMseUJBQXlCO0FBTWxDLFNBQVMscUJBQXFCLE1BQXNCO0FBQ25ELFNBQU8sS0FBSyxRQUFRLGlCQUFpQixHQUFHO0FBQ3pDO0FBRUEsU0FBUyx1QkFBdUIsS0FBYyxLQUF3QjtBQUNyRSxNQUFJLEtBQUs7QUFDUixXQUFPLENBQUMsT0FBTyxxQkFBcUIsR0FBRyxDQUFDLEVBQUU7QUFBQSxFQUMzQztBQUNBLE1BQUksS0FBSztBQUNSLFdBQU8sQ0FBQyxPQUFPLHFCQUFxQixHQUFHLENBQUMsRUFBRTtBQUFBLEVBQzNDO0FBQ0EsU0FBTyxDQUFDO0FBQ1Q7QUFFQSxTQUFTLGVBQWUsT0FBdUI7QUFDOUMsTUFBSSxXQUFXO0FBQ2QsV0FBTyxJQUFJLE1BQU0sUUFBUSxVQUFVLEtBQUssQ0FBQztBQUFBLEVBQzFDO0FBQ0EsU0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNLE9BQU8sQ0FBQztBQUN4QztBQUVBLFNBQVMsbUJBQW1CLE1BQWlDO0FBQzVELFFBQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxJQUFJO0FBQzNCLFNBQU8sQ0FBQyxTQUFTLEdBQUcsS0FBSyxJQUFJLFNBQU8sZUFBZSxHQUFHLENBQUMsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUNuRTtBQU1BLElBQWUsMEJBQWYsTUFBZ0U7QUFBQSxFQUUvRCxZQUNxQyxpQkFDSCxjQUNELGFBQ1Msc0JBQ0gsWUFDRCxrQkFDcEM7QUFObUM7QUFDSDtBQUNEO0FBQ1M7QUFDSDtBQUNEO0FBQUEsRUFDbEM7QUFBQSxFQU9KLGlCQUFpQixXQUFnQixZQUFzRDtBQUN0RixXQUFPLEtBQUssWUFBWSxXQUFXLFVBQVU7QUFBQSxFQUM5QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9VLFlBQVksV0FBZ0IsWUFBMEM7QUFDL0UsV0FBTyxLQUFLLGNBQWMsV0FBVyxVQUFVO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLE1BQU0sT0FBTyxXQUFnQixRQUE0QixTQUFrRDtBQUMxRyxVQUFNLGFBQWEsT0FBTztBQUMxQixVQUFNLFVBQVUsS0FBSyxZQUFZLFdBQVcsVUFBVTtBQUN0RCxVQUFNLGFBQWEsTUFBTSxLQUFLLGFBQWEsT0FBTyxPQUFPO0FBQ3pELFVBQU0sUUFBUSxLQUFLLGNBQWMsVUFBVTtBQUUzQyxRQUFJLFlBQVk7QUFDZixZQUFNLEtBQUssa0JBQWtCLFNBQVMsWUFBWSxTQUFTLGdCQUFnQixLQUFLO0FBQ2hGLGFBQU8sS0FBSyxjQUFjLFdBQVcsVUFBVTtBQUFBLElBQ2hEO0FBRUEsVUFBTSxnQkFBZ0IsU0FBUyxpQkFBaUIsU0FBUyx1QkFBdUIsa0NBQWtDLEtBQUs7QUFDdkgsVUFBTSxlQUFlLFNBQVMsZ0JBQWdCO0FBQzlDLFVBQU0sTUFBTyxXQUF5RDtBQUV0RSxVQUFNLEtBQUssaUJBQWlCLFNBQVMsS0FBSyxVQUFVLFVBQVUsR0FBRyxlQUFlLGNBQWMsR0FBRztBQUNqRyxVQUFNLEtBQUssa0JBQWtCLFNBQVMsWUFBWSxZQUFZO0FBQzlELFdBQU8sS0FBSyxjQUFjLFdBQVcsVUFBVTtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxNQUFNLE9BQU8sV0FBZ0IsUUFBNEIsU0FBb0Q7QUFDNUcsVUFBTSxhQUFhLE9BQU87QUFDMUIsVUFBTSxVQUFVLEtBQUssWUFBWSxXQUFXLFVBQVU7QUFDdEQsVUFBTSxhQUFhLE1BQU0sS0FBSyxhQUFhLE9BQU8sT0FBTztBQUN6RCxRQUFJLENBQUMsWUFBWTtBQUNoQixXQUFLLFlBQVksS0FBSyxJQUFJLEtBQUssSUFBSSwyQkFBMkIsU0FBUyxjQUFjLE9BQU8sSUFBSSxpQ0FBaUM7QUFDakksYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGNBQWMsU0FBUyxjQUFjLE9BQU87QUFDbEQsVUFBTSxlQUFlLFNBQVMsZ0JBQWdCO0FBRTlDLFFBQUk7QUFDSCxZQUFNLFdBQVcsT0FBT0EsU0FBa0M7QUFDekQsY0FBTSxNQUFNO0FBQ1osWUFBSTtBQUNKLFlBQUksSUFBSSxLQUFLO0FBQ1osZ0JBQU0sYUFBYSxNQUFNLEtBQUssV0FBVyxTQUFTLFNBQVMsTUFBTSxFQUFFLE1BQU0sTUFBTSxNQUFTO0FBQ3hGLGdCQUFNLEtBQUssV0FBVyxNQUFNLFNBQVNBLE1BQUssS0FBSztBQUMvQyxnQkFBTSxLQUFLLGtCQUFrQixTQUFTLFlBQVksY0FBY0EsTUFBSyxLQUFLO0FBQzFFLGdCQUFNLFlBQVksTUFBTSxLQUFLLFdBQVcsU0FBUyxTQUFTLE1BQU0sRUFBRSxNQUFNLE1BQU0sTUFBUztBQUN2RixvQkFBVSxlQUFlO0FBQUEsUUFDMUIsT0FBTztBQUNOLG9CQUFVLE1BQU0sS0FBSyxXQUFXLEtBQUssU0FBU0EsTUFBSyxLQUFLO0FBQ3hELGdCQUFNLEtBQUssa0JBQWtCLFNBQVMsWUFBWSxjQUFjQSxNQUFLLEtBQUs7QUFBQSxRQUMzRTtBQUNBLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxTQUFTLFFBQVE7QUFDcEIsZUFBTyxNQUFNLFNBQVM7QUFBQSxNQUN2QjtBQUVBLFlBQU0sTUFBTSxJQUFJLHdCQUF3QjtBQUN4QyxVQUFJO0FBQ0gsZUFBTyxNQUFNLEtBQUssaUJBQWlCO0FBQUEsVUFDbEM7QUFBQSxZQUNDLFVBQVUsaUJBQWlCO0FBQUEsWUFDM0IsT0FBTyxTQUFTLHdCQUF3Qiw0QkFBNEIsV0FBVztBQUFBLFlBQy9FLGFBQWE7QUFBQSxVQUNkO0FBQUEsVUFDQSxNQUFNLFNBQVMsR0FBRztBQUFBLFVBQ2xCLE1BQU0sSUFBSSxRQUFRLElBQUk7QUFBQSxRQUN2QjtBQUFBLE1BQ0QsVUFBRTtBQUNELFlBQUksUUFBUTtBQUFBLE1BQ2I7QUFBQSxJQUNELFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLElBQUksS0FBSyxJQUFJLHFDQUFxQyxXQUFXLE1BQU0sR0FBRztBQUM3RixVQUFJLENBQUMsU0FBUyxRQUFRO0FBQ3JCLGFBQUsscUJBQXFCLE9BQU87QUFBQSxVQUNoQyxVQUFVLFNBQVM7QUFBQSxVQUNuQixTQUFTLFNBQVMsMEJBQTBCLHNDQUFzQyxjQUFjLEtBQUssV0FBVyxPQUFPLEdBQUcsQ0FBQztBQUFBLFFBQzVILENBQUM7QUFBQSxNQUNGO0FBQ0EsWUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLE1BQWMsaUJBQWlCLFNBQWMsVUFBa0IsZUFBdUIsY0FBc0IsS0FBNkI7QUFDeEksVUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLFFBQUk7QUFDSCxZQUFNLEtBQUssaUJBQWlCO0FBQUEsUUFDM0I7QUFBQSxVQUNDLFVBQVUsaUJBQWlCO0FBQUEsVUFDM0IsT0FBTztBQUFBLFVBQ1AsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxRQUNBLFlBQVk7QUFDWCxnQkFBTSxLQUFLLGFBQWEsYUFBYSxRQUFRLE9BQU8sQ0FBQztBQUNyRCxnQkFBTSxLQUFLLFdBQVcsZ0JBQWdCLFVBQVUsU0FBUyxLQUFLLElBQUksS0FBSztBQUFBLFFBQ3hFO0FBQUEsUUFDQSxNQUFNLElBQUksUUFBUSxJQUFJO0FBQUEsTUFDdkI7QUFBQSxJQUNELFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLElBQUksS0FBSyxJQUFJLHFCQUFxQixRQUFRLEtBQUssR0FBRztBQUN6RSxXQUFLLHFCQUFxQixPQUFPO0FBQUEsUUFDaEMsVUFBVSxTQUFTO0FBQUEsUUFDbkIsU0FBUyxTQUFTLGVBQWUsdUNBQXVDLGNBQWMsS0FBSyxXQUFXLE9BQU8sR0FBRyxDQUFDO0FBQUEsTUFDbEgsQ0FBQztBQUNELFlBQU07QUFBQSxJQUNQLFVBQUU7QUFDRCxVQUFJLFFBQVE7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsU0FBYyxZQUFxQyxjQUFzQixPQUEwQztBQUNsSixVQUFNLE1BQU07QUFDWixRQUFJLENBQUMsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLO0FBQ3pCO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSCxVQUFJLElBQUksS0FBSztBQUNaLGNBQU0sS0FBSyxXQUFXLFNBQVMsU0FBUyxJQUFJLEtBQUssTUFBTSxLQUFLO0FBQzVEO0FBQUEsTUFDRDtBQUVBLFlBQU0sS0FBSyxXQUFXLFNBQVMsU0FBUyxJQUFJLEtBQU0sUUFBVyxLQUFLO0FBQUEsSUFDbkUsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLE1BQU0sSUFBSSxLQUFLLElBQUksc0NBQXNDLFlBQVksTUFBTSxHQUFHO0FBQy9GLFdBQUsscUJBQXFCLE9BQU87QUFBQSxRQUNoQyxVQUFVLFNBQVM7QUFBQSxRQUNuQixTQUFTLFNBQVMsOEJBQThCLDhEQUE4RCxjQUFjLEtBQUssV0FBVyxPQUFPLEdBQUcsQ0FBQztBQUFBLE1BQ3hKLENBQUM7QUFDRCxZQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFDRDtBQS9KZSwwQkFBZjtBQUFBLEVBR0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUlk7QUFxS1IsTUFBTSx5QkFBa0Q7QUFBQSxFQUF4RDtBQUNOLFNBQVMsT0FBTyxpQkFBaUI7QUFBQTtBQUFBLEVBRWpDLGNBQWMsWUFBaUIsYUFBMkM7QUFDekUsVUFBTSxJQUFJLE1BQU0scURBQXFEO0FBQUEsRUFDdEU7QUFBQSxFQUVBLE1BQU0sT0FBTyxZQUFpQixTQUE2QixVQUFtRDtBQUM3RyxVQUFNLElBQUksTUFBTSxrREFBa0Q7QUFBQSxFQUNuRTtBQUFBLEVBRUEsTUFBTSxPQUFPLFlBQWlCLFNBQTZCLFVBQXFEO0FBQy9HLFVBQU0sSUFBSSxNQUFNLGdEQUFnRDtBQUFBLEVBQ2pFO0FBQUEsRUFFQSxpQkFBaUIsWUFBaUIsYUFBdUQ7QUFDeEYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFNBQVMsWUFBNkM7QUFDckQsV0FBUSxXQUFnQyxRQUFRO0FBQUEsRUFDakQ7QUFDRDtBQU1PLE1BQU0sMkJBQTJCLHdCQUF3QjtBQUFBLEVBQXpEO0FBQUE7QUFDTixTQUFTLE9BQU8saUJBQWlCO0FBQUE7QUFBQTtBQUFBLEVBR2pDLGNBQWMsV0FBZ0IsWUFBMEM7QUFDdkUsVUFBTSxVQUFVLEtBQUssWUFBWSxXQUFXLFVBQVU7QUFDdEQsVUFBTSxLQUFLO0FBQ1gsUUFBSSxHQUFHLE1BQU07QUFDWixZQUFNLGlCQUFpQixHQUFHLEtBQUssS0FBSyxFQUFFLFFBQVEsaUJBQWlCLEVBQUU7QUFDakUsVUFBSSxnQkFBZ0I7QUFDbkIsY0FBTSxTQUFTLFNBQVMsU0FBUyxjQUFjO0FBQy9DLFlBQUksZ0JBQWdCLFFBQVEsT0FBTyxHQUFHO0FBQ3JDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR21CLFlBQVksV0FBZ0IsWUFBMEM7QUFDeEYsVUFBTSxLQUFLO0FBQ1gsVUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLEdBQUcsS0FBSyxNQUFNLEdBQUc7QUFDdkMsV0FBTyxTQUFTLFdBQVcsY0FBYyxPQUFPLE1BQU0sR0FBRyx1QkFBdUIsR0FBRyxLQUFLLEdBQUcsR0FBRyxDQUFDO0FBQUEsRUFDaEc7QUFBQSxFQUVBLFNBQVMsWUFBNkM7QUFDckQsVUFBTSxLQUFLO0FBQ1gsV0FBTyxHQUFHLE9BQU8sR0FBRyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksS0FBSyxHQUFHO0FBQUEsRUFDL0M7QUFBQSxFQUVVLFVBQVUsWUFBNkM7QUFDaEUsV0FBTyxzQkFBdUIsV0FBbUMsSUFBSTtBQUFBLEVBQ3RFO0FBQUEsRUFFVSxjQUFjLFlBQTZDO0FBQ3BFLFdBQVEsV0FBbUM7QUFBQSxFQUM1QztBQUNEO0FBTU8sTUFBTSwyQkFBMkIsd0JBQXdCO0FBQUEsRUFBekQ7QUFBQTtBQUNOLFNBQVMsT0FBTyxpQkFBaUI7QUFBQTtBQUFBO0FBQUEsRUFHakMsY0FBYyxXQUFnQixZQUEwQztBQUN2RSxVQUFNLFVBQVUsS0FBSyxZQUFZLFdBQVcsVUFBVTtBQUN0RCxVQUFNLE1BQU07QUFDWixRQUFJLElBQUksTUFBTTtBQUNiLFlBQU0saUJBQWlCLElBQUksS0FBSyxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsRUFBRTtBQUNsRSxVQUFJLGdCQUFnQjtBQUNuQixjQUFNLFNBQVMsU0FBUyxTQUFTLGNBQWM7QUFDL0MsWUFBSSxnQkFBZ0IsUUFBUSxPQUFPLEdBQUc7QUFDckMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFHbUIsWUFBWSxXQUFnQixZQUEwQztBQUN4RixVQUFNLE1BQU07QUFDWixVQUFNLFdBQVcsS0FBSyxxQkFBcUIsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEdBQUc7QUFDcEUsV0FBTyxTQUFTLFdBQVcsR0FBRyxRQUFRO0FBQUEsRUFDdkM7QUFBQSxFQUVBLFNBQVMsWUFBNkM7QUFDckQsVUFBTSxNQUFNO0FBQ1osV0FBTyxJQUFJLE9BQU8sR0FBRyxJQUFJLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxJQUFJO0FBQUEsRUFDbEQ7QUFBQSxFQUVVLFVBQVUsWUFBNkM7QUFDaEUsV0FBUSxXQUFtQztBQUFBLEVBQzVDO0FBQUEsRUFFVSxjQUFjLFlBQTZDO0FBQ3BFLFdBQVEsV0FBbUM7QUFBQSxFQUM1QztBQUFBLEVBRVEscUJBQXFCLEtBQWEsS0FBYyxLQUF3QjtBQUMvRSxRQUFJO0FBQ0gsWUFBTSxTQUFTLElBQUksTUFBTSxHQUFHO0FBQzVCLFlBQU0sYUFBYSxPQUFPLGFBQWEsV0FBVyxRQUFRLGlCQUFpQixHQUFHLEVBQUUsWUFBWTtBQUM1RixZQUFNLFdBQVcsT0FBTyxLQUFLLFFBQVEsUUFBUSxFQUFFLEVBQUUsUUFBUSxXQUFXLEVBQUUsRUFBRSxRQUFRLFNBQVMsRUFBRTtBQUMzRixZQUFNLFdBQVcsU0FBUyxNQUFNLEdBQUcsRUFBRSxJQUFJLE9BQUssRUFBRSxRQUFRLGlCQUFpQixHQUFHLENBQUM7QUFDN0UsYUFBTyxDQUFDLFdBQVcsR0FBRyxVQUFVLEdBQUcsdUJBQXVCLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDcEUsUUFBUTtBQUNQLGFBQU8sQ0FBQyxPQUFPLElBQUksUUFBUSxpQkFBaUIsR0FBRyxHQUFHLEdBQUcsdUJBQXVCLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDdEY7QUFBQSxFQUNEO0FBQ0Q7QUFNTyxJQUFlLDhCQUFmLE1BQW9FO0FBQUEsRUFFMUUsWUFDb0MsZ0JBQ0YsY0FDRCxhQUNTLHNCQUNKLGtCQUNBLGtCQUNwQztBQU5rQztBQUNGO0FBQ0Q7QUFDUztBQUNKO0FBQ0E7QUFBQSxFQUNsQztBQUFBLEVBS0osaUJBQWlCLFdBQWdCLFlBQXNEO0FBQ3RGLFdBQU8sS0FBSyxhQUFhLFdBQVcsVUFBVTtBQUFBLEVBQy9DO0FBQUEsRUFjQSxNQUFNLE9BQU8sV0FBZ0IsUUFBNEIsVUFBbUQ7QUFDM0csVUFBTSxXQUFXLEtBQUssYUFBYSxXQUFXLE9BQU8sZ0JBQWdCO0FBQ3JFLFVBQU0sS0FBSyxhQUFhLGFBQWEsUUFBUTtBQUM3QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxPQUFPLFdBQWdCLFFBQTRCLFVBQXFEO0FBRTdHLFVBQU0sYUFBYSxLQUFLLGFBQWEsV0FBVyxPQUFPLGdCQUFnQjtBQUN2RSxVQUFNLFlBQVksS0FBSyxjQUFjLFdBQVcsT0FBTyxnQkFBZ0I7QUFDdkUsVUFBTSxLQUFLLFdBQVcsWUFBWSxXQUFXLFFBQVEsRUFBRSxRQUFRLFVBQVUsT0FBTyxDQUFDO0FBQ2pGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLFdBQVcsWUFBaUIsV0FBZ0IsUUFBNEIsU0FBeUU7QUFDdEosVUFBTSxPQUFPLEtBQUssa0JBQWtCLFlBQVksTUFBTTtBQUN0RCxVQUFNLFVBQVUsbUJBQW1CLElBQUk7QUFDdkMsVUFBTSxZQUFZLE1BQU0sS0FBSyx3QkFBd0IsT0FBTyxNQUFNLFNBQVMsU0FBUyxNQUFNO0FBQzFGLFFBQUksQ0FBQyxXQUFXO0FBQ2YsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixTQUFTLDJCQUEyQixrQ0FBa0MsS0FBSyxjQUFjLE9BQU8sSUFBSTtBQUMxSCxVQUFNLEVBQUUsU0FBUyxTQUFTLElBQUksTUFBTSxLQUFLLG9CQUFvQixTQUFTLGFBQWE7QUFDbkYsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssYUFBYSxPQUFPLFNBQVM7QUFDdkQsUUFBSSxDQUFDLFFBQVE7QUFDWixXQUFLLHFCQUFxQixPQUFPO0FBQUEsUUFDaEMsVUFBVSxTQUFTO0FBQUEsUUFDbkIsU0FBUyxTQUFTLHlCQUF5Qix1REFBdUQsS0FBSyxjQUFjLEtBQUssU0FBUyxPQUFPLGdCQUFnQixDQUFDO0FBQUEsTUFDNUosQ0FBQztBQUNELGFBQU87QUFBQSxJQUNSO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLFdBQU8sRUFBRSxVQUFVO0FBQUEsRUFDcEI7QUFBQTtBQUFBLEVBSUEsTUFBYyx3QkFBd0IsWUFBb0IsU0FBaUIsUUFBb0M7QUFDOUcsUUFBSSxRQUFRO0FBQ1gsYUFBTyxJQUFJLFFBQWlCLGFBQVc7QUFDdEMsY0FBTSxJQUFJLEtBQUsscUJBQXFCLE9BQU87QUFBQSxVQUMxQyxVQUFVLFNBQVM7QUFBQSxVQUNuQixTQUFTLFNBQVMsb0NBQW9DLGtDQUFrQyxZQUFZLE9BQU87QUFBQSxVQUMzRyxTQUFTO0FBQUEsWUFDUixTQUFTO0FBQUEsY0FDUixJQUFJLE9BQU8saUJBQWlCLFNBQVMsV0FBVyxTQUFTLEdBQUcsUUFBVyxNQUFNLFlBQVksUUFBUSxJQUFJLENBQUM7QUFBQSxZQUN2RztBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFFRCxjQUFNLEtBQUssRUFBRSxVQUFVLEVBQUUsTUFBTSxRQUFRLEtBQUssQ0FBQztBQUFBLE1BQzlDLENBQUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxFQUFFLFVBQVUsSUFBSSxNQUFNLEtBQUssZUFBZSxRQUFRO0FBQUEsTUFDdkQsTUFBTTtBQUFBLE1BQ04sU0FBUyxTQUFTLHdCQUF3Qix5QkFBeUIsVUFBVTtBQUFBLE1BQzdFLFFBQVEsU0FBUyw4QkFBOEIsNkRBQTZELE9BQU87QUFBQSxNQUNuSCxlQUFlLFNBQVMsRUFBRSxLQUFLLGtCQUFrQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxXQUFXO0FBQUEsSUFDbkcsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixTQUFpQixlQUF1QjtBQUN6RSxRQUFJO0FBQ0osUUFBSTtBQUNILFlBQU0sS0FBSyxpQkFBaUI7QUFBQSxRQUMzQjtBQUFBLFVBQ0MsVUFBVSxpQkFBaUI7QUFBQSxVQUMzQixPQUFPO0FBQUEsVUFDUCxhQUFhO0FBQUEsUUFDZDtBQUFBLFFBQ0EsWUFBWTtBQUNYLHFCQUFXLE1BQU0sS0FBSyxpQkFBaUIsZUFBZTtBQUFBLFlBQ3JELFFBQVE7QUFBQSxjQUNQLE1BQU0sU0FBUyx5QkFBeUIsZ0JBQWdCO0FBQUEsY0FDeEQsdUJBQXVCO0FBQUEsY0FDdkIsYUFBYTtBQUFBLGNBQ2IsbUJBQW1CO0FBQUEsWUFDcEI7QUFBQSxVQUNELENBQUM7QUFDRCxnQkFBTSxTQUFTO0FBQ2YsZUFBSyxpQkFBaUIsa0JBQWtCLFFBQVE7QUFFaEQsZ0JBQU0sdUJBQXVCLEtBQUssa0NBQWtDLFFBQVE7QUFDNUUsZ0JBQU0sU0FBUyxXQUFXLFNBQVMsSUFBSTtBQUN2QyxnQkFBTSxXQUFXLE1BQU07QUFDdkIsY0FBSSxhQUFhLEdBQUc7QUFDbkIsa0JBQU0sSUFBSSxNQUFNLFNBQVMsMkJBQTJCLGdDQUFnQyxRQUFRLENBQUM7QUFBQSxVQUM5RjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsYUFBTyxFQUFFLFNBQVMsTUFBTSxTQUFTO0FBQUEsSUFDbEMsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLE1BQU0sSUFBSSxLQUFLLElBQUksOEJBQThCLEdBQUc7QUFDckUsV0FBSyxxQkFBcUIsT0FBTztBQUFBLFFBQ2hDLFVBQVUsU0FBUztBQUFBLFFBQ25CLFNBQVMsU0FBUyx5QkFBeUIsMkNBQTJDLEtBQUssV0FBVyxPQUFPLEdBQUcsQ0FBQztBQUFBLE1BQ2xILENBQUM7QUFDRCxhQUFPLEVBQUUsU0FBUyxPQUFPLFNBQVM7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtDQUFrQyxVQUEwRDtBQUNuRyxXQUFPLElBQUksUUFBNEIsYUFBVztBQUNqRCxZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBSSxhQUFhO0FBRWpCLFlBQU0sb0JBQW9CLENBQUMsYUFBdUM7QUFDakUsWUFBSSxZQUFZO0FBQ2Y7QUFBQSxRQUNEO0FBQ0EscUJBQWE7QUFDYixvQkFBWSxRQUFRO0FBQ3BCLGdCQUFRLFFBQVE7QUFBQSxNQUNqQjtBQUVBLFlBQU0sZ0NBQWdDLE1BQVk7QUFDakQsY0FBTSxtQkFBbUIsU0FBUyxhQUFhLElBQUksbUJBQW1CLGdCQUFnQjtBQUN0RixZQUFJLENBQUMsa0JBQWtCO0FBQ3RCO0FBQUEsUUFDRDtBQUNBLG9CQUFZLElBQUksaUJBQWlCLGtCQUFrQixDQUFDLFlBQThCO0FBQ2pGLDRCQUFrQixRQUFRLFlBQVksQ0FBQztBQUFBLFFBQ3hDLENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFFQSxvQ0FBOEI7QUFDOUIsa0JBQVksSUFBSSxTQUFTLGFBQWEsbUNBQW1DLE1BQU0sOEJBQThCLENBQUMsQ0FBQztBQUUvRyxZQUFNLGdCQUF5QyxRQUFRLElBQU87QUFDOUQsa0JBQVksSUFBSSxhQUFhLE1BQU0sY0FBYyxPQUFPLENBQUMsQ0FBQztBQUMxRCxXQUFLLGNBQWMsS0FBSyxNQUFNO0FBQzdCLFlBQUksWUFBWTtBQUNmO0FBQUEsUUFDRDtBQUNBLGFBQUssWUFBWSxLQUFLLElBQUksS0FBSyxJQUFJLHlDQUF5QztBQUM1RSwwQkFBa0IsTUFBUztBQUFBLE1BQzVCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFqTHNCLDhCQUFmO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSbUI7QUF1TGYsTUFBTSx3QkFBd0IsNEJBQTRCO0FBQUEsRUFBMUQ7QUFBQTtBQUNOLFNBQVMsT0FBTyxpQkFBaUI7QUFDakMsU0FBbUIsZUFBZTtBQUFBO0FBQUEsRUFFbEMsY0FBYyxXQUFnQixZQUEwQztBQUN2RSxVQUFNLE1BQU07QUFDWixXQUFPLFNBQVMsV0FBVyxPQUFPLHFCQUFxQixJQUFJLE9BQU8sR0FBRyxnQkFBZ0IsSUFBSSxPQUFPO0FBQUEsRUFDakc7QUFBQSxFQUVBLFNBQVMsWUFBNkM7QUFDckQsVUFBTSxNQUFNO0FBQ1osV0FBTyxJQUFJLFVBQVUsR0FBRyxJQUFJLE9BQU8sSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJO0FBQUEsRUFDNUQ7QUFBQSxFQUVVLGFBQWEsV0FBZ0IsWUFBMEM7QUFDaEYsVUFBTSxNQUFNO0FBQ1osV0FBTyxTQUFTLFdBQVcsT0FBTyxxQkFBcUIsSUFBSSxPQUFPLENBQUM7QUFBQSxFQUNwRTtBQUFBLEVBRVUsa0JBQWtCLFlBQWlCLFFBQXNDO0FBQ2xGLFVBQU0sTUFBTSxPQUFPO0FBQ25CLFVBQU0sY0FBYyxJQUFJLFVBQVUsR0FBRyxJQUFJLE9BQU8sSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJO0FBQ3hFLFVBQU0sT0FBTyxDQUFDLE9BQU8sV0FBVyxZQUFZLFdBQVcsUUFBUSxXQUFXO0FBQzFFLFFBQUksSUFBSSxVQUFVO0FBQ2pCLFdBQUssS0FBSyxjQUFjLElBQUksUUFBUTtBQUFBLElBQ3JDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQU1PLE1BQU0sd0JBQXdCLDRCQUE0QjtBQUFBLEVBQTFEO0FBQUE7QUFDTixTQUFTLE9BQU8saUJBQWlCO0FBQ2pDLFNBQW1CLGVBQWU7QUFBQTtBQUFBLEVBRWxDLGNBQWMsV0FBZ0IsWUFBMEM7QUFDdkUsVUFBTSxNQUFNO0FBQ1osV0FBTyxTQUFTLFdBQVcsT0FBTyxxQkFBcUIsSUFBSSxPQUFPLENBQUM7QUFBQSxFQUNwRTtBQUFBLEVBRUEsU0FBUyxZQUE2QztBQUNyRCxVQUFNLE1BQU07QUFDWixXQUFPLElBQUksVUFBVSxHQUFHLElBQUksT0FBTyxLQUFLLElBQUksT0FBTyxLQUFLLElBQUk7QUFBQSxFQUM3RDtBQUFBLEVBRVUsYUFBYSxXQUFnQixZQUEwQztBQUNoRixVQUFNLE1BQU07QUFDWixXQUFPLFNBQVMsV0FBVyxPQUFPLHFCQUFxQixJQUFJLE9BQU8sQ0FBQztBQUFBLEVBQ3BFO0FBQUEsRUFFVSxrQkFBa0IsWUFBaUIsUUFBc0M7QUFDbEYsVUFBTSxNQUFNLE9BQU87QUFDbkIsVUFBTSxjQUFjLElBQUksVUFBVSxHQUFHLElBQUksT0FBTyxLQUFLLElBQUksT0FBTyxLQUFLLElBQUk7QUFDekUsVUFBTSxPQUFPLENBQUMsT0FBTyxXQUFXLFlBQVksV0FBVyxRQUFRLFdBQVc7QUFDMUUsUUFBSSxJQUFJLFVBQVU7QUFDakIsV0FBSyxLQUFLLGVBQWUsSUFBSSxRQUFRO0FBQUEsSUFDdEM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJjdHMiXQp9Cg==
