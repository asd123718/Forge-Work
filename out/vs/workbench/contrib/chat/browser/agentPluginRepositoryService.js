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
import { SequencerByKey } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { revive } from "../../../../base/common/marshalling.js";
import { dirname, isEqual, isEqualOrParent, joinPath } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { MarketplaceReferenceKind, PluginSourceKind } from "../common/plugins/pluginMarketplaceService.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
import { GitHubPluginSource, GitUrlPluginSource, NpmPluginSource, PipPluginSource, RelativePathPluginSource } from "./pluginSources.js";
const MARKETPLACE_INDEX_STORAGE_KEY = "chat.plugins.marketplaces.index.v1";
const SHA_REF_PATTERN = /^[0-9a-f]{40}$/i;
let AgentPluginRepositoryService = class {
  constructor(_commandService, environmentService, _fileService, instantiationService, _logService, _notificationService, _pluginGit, _progressService, _storageService, userDataProfileService) {
    this._commandService = _commandService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._pluginGit = _pluginGit;
    this._progressService = _progressService;
    this._storageService = _storageService;
    this._marketplaceIndex = new Lazy(() => this._loadMarketplaceIndex());
    this._cloneSequencer = new SequencerByKey();
    this.agentPluginsHome = userDataProfileService.currentProfile.agentPluginsHome;
    const legacyCacheRoot = joinPath(environmentService.cacheHome, "agentPlugins");
    const oldCacheRoot = environmentService.cacheHome.scheme === "file" ? legacyCacheRoot : this.agentPluginsHome;
    this._cacheRoot = this.agentPluginsHome;
    if (!isEqual(oldCacheRoot, this.agentPluginsHome)) {
      this._migrationDone = this._migrateDirectory(oldCacheRoot);
    } else {
      this._migrationDone = Promise.resolve();
    }
    this._pluginSources = /* @__PURE__ */ new Map([
      [PluginSourceKind.RelativePath, new RelativePathPluginSource()],
      [PluginSourceKind.GitHub, instantiationService.createInstance(GitHubPluginSource)],
      [PluginSourceKind.GitUrl, instantiationService.createInstance(GitUrlPluginSource)],
      [PluginSourceKind.Npm, instantiationService.createInstance(NpmPluginSource)],
      [PluginSourceKind.Pip, instantiationService.createInstance(PipPluginSource)]
    ]);
  }
  getPluginSource(kind) {
    const repo = this._pluginSources.get(kind);
    if (!repo) {
      throw new Error(`No source repository registered for kind '${kind}'`);
    }
    return repo;
  }
  getRepositoryUri(marketplace, marketplaceType) {
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri && marketplace.localRepositoryUri) {
      return marketplace.localRepositoryUri;
    }
    const indexed = this._marketplaceIndex.value.get(marketplace.canonicalId);
    if (indexed?.repositoryUri) {
      return indexed.repositoryUri;
    }
    return this._getRepoCacheDirForReference(marketplace);
  }
  getPluginInstallUri(plugin) {
    if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
      return this.getPluginSourceInstallUri(plugin.sourceDescriptor);
    }
    const repoDir = this.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    const normalizedSource = plugin.source.trim().replace(/^\.?\/+|\/+$/g, "");
    const pluginDir = normalizedSource ? joinPath(repoDir, normalizedSource) : repoDir;
    if (!isEqualOrParent(pluginDir, repoDir)) {
      throw new Error(`Invalid plugin source path '${plugin.source}'`);
    }
    return pluginDir;
  }
  async ensureRepository(marketplace, options) {
    await this._migrationDone;
    const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
    return this._cloneSequencer.queue(repoDir.fsPath, async () => {
      const repoExists = await this._fileService.exists(repoDir);
      if (repoExists) {
        const refreshedAt = this._isRefreshDue(marketplace, options) ? await this._refreshRepository(repoDir, marketplace, options?.token) : void 0;
        this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType, refreshedAt);
        return repoDir;
      }
      if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
        throw new Error(`Local marketplace repository does not exist: ${repoDir.fsPath}`);
      }
      const progressTitle = options?.progressTitle ?? localize("preparingMarketplace", "Preparing plugin marketplace '{0}'...", marketplace.displayLabel);
      const failureLabel = options?.failureLabel ?? marketplace.displayLabel;
      await this._cloneRepository(repoDir, marketplace.cloneUrl, progressTitle, failureLabel, marketplace.ref, options?.token);
      this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType, Date.now());
      return repoDir;
    });
  }
  /**
   * Whether an existing clone is stale enough to warrant a silent pull.
   * Local (user-owned) directories and SHA-pinned refs are never refreshed.
   */
  _isRefreshDue(marketplace, options) {
    const refreshIfOlderThanMs = options?.refreshIfOlderThanMs;
    if (refreshIfOlderThanMs === void 0 || options?.token?.isCancellationRequested) {
      return false;
    }
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri || SHA_REF_PATTERN.test(marketplace.ref ?? "")) {
      return false;
    }
    const lastRefreshedAt = this._marketplaceIndex.value.get(marketplace.canonicalId)?.lastRefreshedAt;
    return lastRefreshedAt === void 0 || Date.now() - lastRefreshedAt >= refreshIfOlderThanMs;
  }
  /**
   * Silently pulls an existing clone, never throwing — a marketplace that
   * cannot be refreshed still serves its cached contents.
   *
   * Returns the timestamp to record as the last refresh attempt, or
   * `undefined` when the pull was cancelled so that cancellation does not
   * suppress the next attempt. Genuine failures are recorded, otherwise an
   * unreachable remote would be retried on every single fetch.
   */
  async _refreshRepository(repoDir, marketplace, token) {
    try {
      await this._pluginGit.pull(repoDir, token);
    } catch (err) {
      if (isCancellationError(err)) {
        return void 0;
      }
      this._logService.debug(`[AgentPluginRepositoryService] Failed to refresh ${marketplace.displayLabel}:`, err);
    }
    return token?.isCancellationRequested ? void 0 : Date.now();
  }
  async pullRepository(marketplace, options) {
    const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      this._logService.warn(`[AgentPluginRepositoryService] Cannot update plugin '${options?.pluginName ?? marketplace.displayLabel}': repository not cloned`);
      return false;
    }
    const updateLabel = options?.pluginName ?? marketplace.displayLabel;
    try {
      const changed = options?.silent ? await this._pluginGit.pull(repoDir) : await this._pullWithProgress(repoDir, updateLabel);
      this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType, Date.now());
      return changed;
    } catch (err) {
      this._logService.error(`[AgentPluginRepositoryService] Failed to update ${marketplace.displayLabel}:`, err);
      if (!options?.silent) {
        const primaryActions = [new Action("showGitOutput", localize("showGitOutput", "Show Git Output"), void 0, true, () => this._commandService.executeCommand("git.showOutput"))];
        const failureLabel = options?.failureLabel ?? updateLabel;
        if (marketplace.kind !== MarketplaceReferenceKind.LocalFileUri) {
          primaryActions.push(new Action("purgeAndRecloneMarketplace", localize("purgeAndRecloneMarketplace", "Purge Marketplace Cache and Reclone"), void 0, true, () => this._purgeAndRecloneMarketplace(marketplace, options?.marketplaceType, failureLabel)));
        }
        this._notificationService.notify({
          severity: Severity.Error,
          message: localize("pullFailed", "Failed to update plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
          actions: {
            primary: primaryActions
          }
        });
      }
      throw err;
    }
  }
  /** Pulls a clone behind a cancellable progress notification. */
  async _pullWithProgress(repoDir, updateLabel) {
    const cts = new CancellationTokenSource();
    try {
      return await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize("updatingPlugin", "Updating plugin '{0}'...", updateLabel),
          cancellable: true
        },
        () => this._pluginGit.pull(repoDir, cts.token),
        () => cts.dispose(true)
      );
    } finally {
      cts.dispose();
    }
  }
  async _purgeAndRecloneMarketplace(marketplace, marketplaceType, label) {
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
      return;
    }
    const repoDir = this.getRepositoryUri(marketplace, marketplaceType);
    try {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize("purgingMarketplace", "Purging plugin marketplace '{0}'...", marketplace.displayLabel),
          cancellable: false
        },
        async () => {
          const exists = await this._fileService.exists(repoDir);
          if (exists) {
            await this._fileService.del(repoDir, { recursive: true, useTrash: false });
          }
          await this.ensureRepository(marketplace, {
            marketplaceType,
            progressTitle: localize("recloningMarketplace", "Recloning plugin marketplace '{0}'...", marketplace.displayLabel),
            failureLabel: label
          });
        }
      );
      this._notificationService.info(localize("purgeMarketplaceSuccess", "Recloned plugin marketplace '{0}'. Try updating plugins again.", marketplace.displayLabel));
    } catch (err) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("purgeMarketplaceFailed", "Failed to purge plugin marketplace '{0}': {1}", marketplace.displayLabel, err?.message ?? String(err)),
        actions: {
          primary: [new Action("showGitOutput", localize("showGitOutput", "Show Git Output"), void 0, true, () => {
            return this._commandService.executeCommand("git.showOutput");
          })]
        }
      });
    }
  }
  _getRepoCacheDirForReference(reference) {
    return joinPath(this._cacheRoot, ...reference.cacheSegments);
  }
  _loadMarketplaceIndex() {
    const result = /* @__PURE__ */ new Map();
    const stored = this._storageService.getObject(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
    if (!stored) {
      return result;
    }
    const revived = revive(stored);
    for (const [canonicalId, entry] of Object.entries(revived)) {
      if (!entry || !entry.repositoryUri) {
        continue;
      }
      result.set(canonicalId, {
        repositoryUri: entry.repositoryUri,
        marketplaceType: entry.marketplaceType,
        lastRefreshedAt: entry.lastRefreshedAt
      });
    }
    return result;
  }
  _updateMarketplaceIndex(marketplace, repositoryUri, marketplaceType, lastRefreshedAt) {
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
      return;
    }
    const previous = this._marketplaceIndex.value.get(marketplace.canonicalId);
    const updatedLastRefreshedAt = lastRefreshedAt ?? previous?.lastRefreshedAt;
    if (previous && previous.repositoryUri.toString() === repositoryUri.toString() && previous.marketplaceType === marketplaceType && previous.lastRefreshedAt === updatedLastRefreshedAt) {
      return;
    }
    this._marketplaceIndex.value.set(marketplace.canonicalId, { repositoryUri, marketplaceType, lastRefreshedAt: updatedLastRefreshedAt });
    this._saveMarketplaceIndex();
  }
  _saveMarketplaceIndex() {
    const serialized = {};
    for (const [canonicalId, entry] of this._marketplaceIndex.value) {
      serialized[canonicalId] = JSON.parse(JSON.stringify({
        repositoryUri: entry.repositoryUri,
        marketplaceType: entry.marketplaceType,
        lastRefreshedAt: entry.lastRefreshedAt
      }));
    }
    if (Object.keys(serialized).length === 0) {
      this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
      return;
    }
    this._storageService.store(MARKETPLACE_INDEX_STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  async _cloneRepository(repoDir, cloneUrl, progressTitle, failureLabel, ref, token) {
    const cts = new CancellationTokenSource();
    const tokenListener = token?.onCancellationRequested(() => cts.cancel());
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
      this._logService.error(`[AgentPluginRepositoryService] Failed to clone ${cloneUrl}:`, err);
      if (!isCancellationError(err)) {
        this._notificationService.notify({
          severity: Severity.Error,
          message: localize("cloneFailed", "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
          actions: {
            primary: [new Action("showGitOutput", localize("showGitOutput", "Show Git Output"), void 0, true, () => {
              this._commandService.executeCommand("git.showOutput");
            })]
          }
        });
      }
      throw err;
    } finally {
      tokenListener?.dispose();
      cts.dispose();
    }
  }
  getPluginSourceInstallUri(sourceDescriptor) {
    return this.getPluginSource(sourceDescriptor.kind).getInstallUri(this._cacheRoot, sourceDescriptor);
  }
  async ensurePluginSource(plugin, options) {
    await this._migrationDone;
    const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
    if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
      return this.ensureRepository(plugin.marketplaceReference, options);
    }
    return repo.ensure(this._cacheRoot, plugin, options);
  }
  async updatePluginSource(plugin, options) {
    const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
    if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
      return this.pullRepository(plugin.marketplaceReference, options);
    }
    return repo.update(this._cacheRoot, plugin, options);
  }
  async fetchRepository(marketplace) {
    const repoDir = this.getRepositoryUri(marketplace);
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      return false;
    }
    try {
      await this._pluginGit.fetchRepository(repoDir);
      const behindCount = await this._pluginGit.revListCount(repoDir, "HEAD", "@{u}");
      return behindCount > 0;
    } catch (err) {
      this._logService.debug(`[AgentPluginRepositoryService] Silent fetch failed for ${marketplace.displayLabel}:`, err);
      return false;
    }
  }
  async cleanupPluginSource(plugin, otherInstalledDescriptors) {
    const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
    const cleanupDir = repo.getCleanupTarget(this._cacheRoot, plugin.sourceDescriptor);
    if (!cleanupDir) {
      return;
    }
    if (otherInstalledDescriptors) {
      const shared = otherInstalledDescriptors.some((other) => {
        const otherRepo = this.getPluginSource(other.kind);
        const otherTarget = otherRepo.getCleanupTarget(this._cacheRoot, other);
        return otherTarget && isEqual(otherTarget, cleanupDir);
      });
      if (shared) {
        this._logService.info(`[${plugin.sourceDescriptor.kind}] Skipping cleanup of shared cache: ${cleanupDir.toString()}`);
        return;
      }
    }
    try {
      const exists = await this._fileService.exists(cleanupDir);
      if (exists) {
        await this._fileService.del(cleanupDir, { recursive: true });
        this._logService.info(`[${plugin.sourceDescriptor.kind}] Removed plugin cache: ${cleanupDir.toString()}`);
      }
    } catch (err) {
      this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to remove plugin cache '${cleanupDir.toString()}':`, err);
    }
    try {
      await this._pruneEmptyParents(cleanupDir);
    } catch (err) {
      this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to cleanup plugin source:`, err);
    }
  }
  /**
   * Walk from {@link child}'s parent toward {@link _cacheRoot}, removing
   * each directory that is empty. Stops as soon as a non-empty directory
   * is found or the cache root is reached. Only operates on descendants
   * of the cache root — returns immediately for paths outside it.
   */
  async _pruneEmptyParents(child) {
    if (!isEqualOrParent(child, this._cacheRoot)) {
      return;
    }
    let current = dirname(child);
    while (isEqualOrParent(current, this._cacheRoot) && !isEqual(current, this._cacheRoot)) {
      try {
        const stat = await this._fileService.resolve(current);
        if (stat.children && stat.children.length > 0) {
          break;
        }
        await this._fileService.del(current);
      } catch {
        break;
      }
      current = dirname(current);
    }
  }
  /**
   * One-time migration of plugin files from the old internal cache
   * directory (`{cacheHome}/agentPlugins/`) to the new well-known
   * location (`~/{dataFolderName}/agent-plugins/`).
   */
  async _migrateDirectory(oldCacheRoot) {
    try {
      const oldExists = await this._fileService.exists(oldCacheRoot);
      if (!oldExists) {
        return;
      }
      const newExists = await this._fileService.exists(this.agentPluginsHome);
      if (newExists) {
        this._logService.info("[AgentPluginRepositoryService] Both old and new agent-plugins directories exist; skipping directory migration");
        return;
      }
      this._logService.info(`[AgentPluginRepositoryService] Migrating agent plugins from ${oldCacheRoot.toString()} to ${this.agentPluginsHome.toString()}`);
      await this._fileService.move(oldCacheRoot, this.agentPluginsHome, false);
      this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
      this._marketplaceIndex.value.clear();
    } catch (error) {
      this._logService.error("[AgentPluginRepositoryService] Directory migration failed", error);
    }
  }
};
AgentPluginRepositoryService = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IPluginGitService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IUserDataProfileService)
], AgentPluginRepositoryService);
export {
  AgentPluginRepositoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50LCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB0eXBlIHsgRHRvIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCBJRW5zdXJlUmVwb3NpdG9yeU9wdGlvbnMsIElQdWxsUmVwb3NpdG9yeU9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXRwbGFjZVBsdWdpbiwgSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBJUGx1Z2luU291cmNlRGVzY3JpcHRvciwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLCBNYXJrZXRwbGFjZVR5cGUsIFBsdWdpblNvdXJjZUtpbmQgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpblNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpblNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luR2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUGx1Z2luU291cmNlLCBHaXRVcmxQbHVnaW5Tb3VyY2UsIE5wbVBsdWdpblNvdXJjZSwgUGlwUGx1Z2luU291cmNlLCBSZWxhdGl2ZVBhdGhQbHVnaW5Tb3VyY2UgfSBmcm9tICcuL3BsdWdpblNvdXJjZXMuanMnO1xuXG5jb25zdCBNQVJLRVRQTEFDRV9JTkRFWF9TVE9SQUdFX0tFWSA9ICdjaGF0LnBsdWdpbnMubWFya2V0cGxhY2VzLmluZGV4LnYxJztcblxuLyoqIEZ1bGwgY29tbWl0IFNIQSBcdTIwMTQgYSByZWYgcGlubmVkIHRvIG9uZSBoYXMgbm90aGluZyB0byBwdWxsLiAqL1xuY29uc3QgU0hBX1JFRl9QQVRURVJOID0gL15bMC05YS1mXXs0MH0kL2k7XG5cbmludGVyZmFjZSBJTWFya2V0cGxhY2VJbmRleEVudHJ5IHtcblx0cmVwb3NpdG9yeVVyaTogVVJJO1xuXHRtYXJrZXRwbGFjZVR5cGU/OiBNYXJrZXRwbGFjZVR5cGU7XG5cdGxhc3RSZWZyZXNoZWRBdD86IG51bWJlcjtcbn1cblxudHlwZSBJU3RvcmVkTWFya2V0cGxhY2VJbmRleCA9IER0bzxSZWNvcmQ8c3RyaW5nLCBJTWFya2V0cGxhY2VJbmRleEVudHJ5Pj47XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBhZ2VudFBsdWdpbnNIb21lOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlUm9vdDogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXRwbGFjZUluZGV4ID0gbmV3IExhenk8TWFwPHN0cmluZywgSU1hcmtldHBsYWNlSW5kZXhFbnRyeT4+KCgpID0+IHRoaXMuX2xvYWRNYXJrZXRwbGFjZUluZGV4KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5Tb3VyY2VzOiBSZWFkb25seU1hcDxQbHVnaW5Tb3VyY2VLaW5kLCBJUGx1Z2luU291cmNlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xvbmVTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9taWdyYXRpb25Eb25lOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUGx1Z2luR2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5HaXQ6IElQbHVnaW5HaXRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHQvLyBPbiBuYXRpdmUsIHVzZSB0aGUgd2VsbC1rbm93biB+L3tkYXRhRm9sZGVyTmFtZX0vYWdlbnQtcGx1Z2lucy8gcGF0aFxuXHRcdC8vIHNvIHRoYXQgZXh0ZXJuYWwgdG9vbHMgY2FuIGRpc2NvdmVyIGl0LiBPbiB3ZWIsIGZhbGwgYmFjayB0byB0aGVcblx0XHQvLyBpbnRlcm5hbCBjYWNoZSBsb2NhdGlvbi5cblx0XHR0aGlzLmFnZW50UGx1Z2luc0hvbWUgPSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmFnZW50UGx1Z2luc0hvbWU7XG5cdFx0Y29uc3QgbGVnYWN5Q2FjaGVSb290ID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmNhY2hlSG9tZSwgJ2FnZW50UGx1Z2lucycpO1xuXHRcdGNvbnN0IG9sZENhY2hlUm9vdCA9IGVudmlyb25tZW50U2VydmljZS5jYWNoZUhvbWUuc2NoZW1lID09PSAnZmlsZSdcblx0XHRcdD8gbGVnYWN5Q2FjaGVSb290XG5cdFx0XHQ6IHRoaXMuYWdlbnRQbHVnaW5zSG9tZTtcblx0XHR0aGlzLl9jYWNoZVJvb3QgPSB0aGlzLmFnZW50UGx1Z2luc0hvbWU7XG5cblx0XHQvLyBNaWdyYXRlIHBsdWdpbiBmaWxlcyBmcm9tIHRoZSBvbGQgaW50ZXJuYWwgY2FjaGUgZGlyZWN0b3J5IHRvIHRoZVxuXHRcdC8vIG5ldyB3ZWxsLWtub3duIGxvY2F0aW9uLiBUaGlzIGlzIGEgb25lLXRpbWUgb3BlcmF0aW9uLlxuXHRcdGlmICghaXNFcXVhbChvbGRDYWNoZVJvb3QsIHRoaXMuYWdlbnRQbHVnaW5zSG9tZSkpIHtcblx0XHRcdHRoaXMuX21pZ3JhdGlvbkRvbmUgPSB0aGlzLl9taWdyYXRlRGlyZWN0b3J5KG9sZENhY2hlUm9vdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21pZ3JhdGlvbkRvbmUgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBwZXIta2luZCBzb3VyY2UgcmVwb3NpdG9yeSBtYXAgdmlhIGluc3RhbnRpYXRpb24gc2VydmljZSBzb1xuXHRcdC8vIGVhY2ggcmVwb3NpdG9yeSBjYW4gaW5qZWN0IGl0cyBvd24gZGVwZW5kZW5jaWVzLlxuXHRcdHRoaXMuX3BsdWdpblNvdXJjZXMgPSBuZXcgTWFwPFBsdWdpblNvdXJjZUtpbmQsIElQbHVnaW5Tb3VyY2U+KFtcblx0XHRcdFtQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgbmV3IFJlbGF0aXZlUGF0aFBsdWdpblNvdXJjZSgpXSxcblx0XHRcdFtQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2l0SHViUGx1Z2luU291cmNlKV0sXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdpdFVybFBsdWdpblNvdXJjZSldLFxuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuTnBtLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOcG1QbHVnaW5Tb3VyY2UpXSxcblx0XHRcdFtQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlwUGx1Z2luU291cmNlKV0sXG5cdFx0XSk7XG5cdH1cblxuXHRnZXRQbHVnaW5Tb3VyY2Uoa2luZDogUGx1Z2luU291cmNlS2luZCk6IElQbHVnaW5Tb3VyY2Uge1xuXHRcdGNvbnN0IHJlcG8gPSB0aGlzLl9wbHVnaW5Tb3VyY2VzLmdldChraW5kKTtcblx0XHRpZiAoIXJlcG8pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc291cmNlIHJlcG9zaXRvcnkgcmVnaXN0ZXJlZCBmb3Iga2luZCAnJHtraW5kfSdgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcG87XG5cdH1cblxuXHRnZXRSZXBvc2l0b3J5VXJpKG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIG1hcmtldHBsYWNlVHlwZT86IE1hcmtldHBsYWNlVHlwZSk6IFVSSSB7XG5cdFx0aWYgKG1hcmtldHBsYWNlLmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkgJiYgbWFya2V0cGxhY2UubG9jYWxSZXBvc2l0b3J5VXJpKSB7XG5cdFx0XHRyZXR1cm4gbWFya2V0cGxhY2UubG9jYWxSZXBvc2l0b3J5VXJpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ZWQgPSB0aGlzLl9tYXJrZXRwbGFjZUluZGV4LnZhbHVlLmdldChtYXJrZXRwbGFjZS5jYW5vbmljYWxJZCk7XG5cdFx0aWYgKGluZGV4ZWQ/LnJlcG9zaXRvcnlVcmkpIHtcblx0XHRcdHJldHVybiBpbmRleGVkLnJlcG9zaXRvcnlVcmk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dldFJlcG9DYWNoZURpckZvclJlZmVyZW5jZShtYXJrZXRwbGFjZSk7XG5cdH1cblxuXHRnZXRQbHVnaW5JbnN0YWxsVXJpKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogVVJJIHtcblx0XHRpZiAocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCAhPT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFBsdWdpblNvdXJjZUluc3RhbGxVcmkocGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdH1cblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5nZXRSZXBvc2l0b3J5VXJpKHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGx1Z2luLm1hcmtldHBsYWNlVHlwZSk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZFNvdXJjZSA9IHBsdWdpbi5zb3VyY2UudHJpbSgpLnJlcGxhY2UoL15cXC4/XFwvK3xcXC8rJC9nLCAnJyk7XG5cdFx0Y29uc3QgcGx1Z2luRGlyID0gbm9ybWFsaXplZFNvdXJjZSA/IGpvaW5QYXRoKHJlcG9EaXIsIG5vcm1hbGl6ZWRTb3VyY2UpIDogcmVwb0Rpcjtcblx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChwbHVnaW5EaXIsIHJlcG9EaXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgcGx1Z2luIHNvdXJjZSBwYXRoICcke3BsdWdpbi5zb3VyY2V9J2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gcGx1Z2luRGlyO1xuXHR9XG5cblx0YXN5bmMgZW5zdXJlUmVwb3NpdG9yeShtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBvcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxVUkk+IHtcblx0XHRhd2FpdCB0aGlzLl9taWdyYXRpb25Eb25lO1xuXHRcdGNvbnN0IHJlcG9EaXIgPSB0aGlzLmdldFJlcG9zaXRvcnlVcmkobWFya2V0cGxhY2UsIG9wdGlvbnM/Lm1hcmtldHBsYWNlVHlwZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2Nsb25lU2VxdWVuY2VyLnF1ZXVlKHJlcG9EaXIuZnNQYXRoLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdFx0aWYgKHJlcG9FeGlzdHMpIHtcblx0XHRcdFx0Y29uc3QgcmVmcmVzaGVkQXQgPSB0aGlzLl9pc1JlZnJlc2hEdWUobWFya2V0cGxhY2UsIG9wdGlvbnMpXG5cdFx0XHRcdFx0PyBhd2FpdCB0aGlzLl9yZWZyZXNoUmVwb3NpdG9yeShyZXBvRGlyLCBtYXJrZXRwbGFjZSwgb3B0aW9ucz8udG9rZW4pXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZU1hcmtldHBsYWNlSW5kZXgobWFya2V0cGxhY2UsIHJlcG9EaXIsIG9wdGlvbnM/Lm1hcmtldHBsYWNlVHlwZSwgcmVmcmVzaGVkQXQpO1xuXHRcdFx0XHRyZXR1cm4gcmVwb0Rpcjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1hcmtldHBsYWNlLmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMb2NhbCBtYXJrZXRwbGFjZSByZXBvc2l0b3J5IGRvZXMgbm90IGV4aXN0OiAke3JlcG9EaXIuZnNQYXRofWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm9ncmVzc1RpdGxlID0gb3B0aW9ucz8ucHJvZ3Jlc3NUaXRsZSA/PyBsb2NhbGl6ZSgncHJlcGFyaW5nTWFya2V0cGxhY2UnLCBcIlByZXBhcmluZyBwbHVnaW4gbWFya2V0cGxhY2UgJ3swfScuLi5cIiwgbWFya2V0cGxhY2UuZGlzcGxheUxhYmVsKTtcblx0XHRcdGNvbnN0IGZhaWx1cmVMYWJlbCA9IG9wdGlvbnM/LmZhaWx1cmVMYWJlbCA/PyBtYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWw7XG5cdFx0XHRhd2FpdCB0aGlzLl9jbG9uZVJlcG9zaXRvcnkocmVwb0RpciwgbWFya2V0cGxhY2UuY2xvbmVVcmwsIHByb2dyZXNzVGl0bGUsIGZhaWx1cmVMYWJlbCwgbWFya2V0cGxhY2UucmVmLCBvcHRpb25zPy50b2tlbik7XG5cdFx0XHR0aGlzLl91cGRhdGVNYXJrZXRwbGFjZUluZGV4KG1hcmtldHBsYWNlLCByZXBvRGlyLCBvcHRpb25zPy5tYXJrZXRwbGFjZVR5cGUsIERhdGUubm93KCkpO1xuXHRcdFx0cmV0dXJuIHJlcG9EaXI7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhbiBleGlzdGluZyBjbG9uZSBpcyBzdGFsZSBlbm91Z2ggdG8gd2FycmFudCBhIHNpbGVudCBwdWxsLlxuXHQgKiBMb2NhbCAodXNlci1vd25lZCkgZGlyZWN0b3JpZXMgYW5kIFNIQS1waW5uZWQgcmVmcyBhcmUgbmV2ZXIgcmVmcmVzaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNSZWZyZXNoRHVlKG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIG9wdGlvbnM6IElFbnN1cmVSZXBvc2l0b3J5T3B0aW9ucyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlZnJlc2hJZk9sZGVyVGhhbk1zID0gb3B0aW9ucz8ucmVmcmVzaElmT2xkZXJUaGFuTXM7XG5cdFx0aWYgKHJlZnJlc2hJZk9sZGVyVGhhbk1zID09PSB1bmRlZmluZWQgfHwgb3B0aW9ucz8udG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1hcmtldHBsYWNlLmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkgfHwgU0hBX1JFRl9QQVRURVJOLnRlc3QobWFya2V0cGxhY2UucmVmID8/ICcnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RSZWZyZXNoZWRBdCA9IHRoaXMuX21hcmtldHBsYWNlSW5kZXgudmFsdWUuZ2V0KG1hcmtldHBsYWNlLmNhbm9uaWNhbElkKT8ubGFzdFJlZnJlc2hlZEF0O1xuXHRcdHJldHVybiBsYXN0UmVmcmVzaGVkQXQgPT09IHVuZGVmaW5lZCB8fCBEYXRlLm5vdygpIC0gbGFzdFJlZnJlc2hlZEF0ID49IHJlZnJlc2hJZk9sZGVyVGhhbk1zO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNpbGVudGx5IHB1bGxzIGFuIGV4aXN0aW5nIGNsb25lLCBuZXZlciB0aHJvd2luZyBcdTIwMTQgYSBtYXJrZXRwbGFjZSB0aGF0XG5cdCAqIGNhbm5vdCBiZSByZWZyZXNoZWQgc3RpbGwgc2VydmVzIGl0cyBjYWNoZWQgY29udGVudHMuXG5cdCAqXG5cdCAqIFJldHVybnMgdGhlIHRpbWVzdGFtcCB0byByZWNvcmQgYXMgdGhlIGxhc3QgcmVmcmVzaCBhdHRlbXB0LCBvclxuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBwdWxsIHdhcyBjYW5jZWxsZWQgc28gdGhhdCBjYW5jZWxsYXRpb24gZG9lcyBub3Rcblx0ICogc3VwcHJlc3MgdGhlIG5leHQgYXR0ZW1wdC4gR2VudWluZSBmYWlsdXJlcyBhcmUgcmVjb3JkZWQsIG90aGVyd2lzZSBhblxuXHQgKiB1bnJlYWNoYWJsZSByZW1vdGUgd291bGQgYmUgcmV0cmllZCBvbiBldmVyeSBzaW5nbGUgZmV0Y2guXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoUmVwb3NpdG9yeShyZXBvRGlyOiBVUkksIG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3BsdWdpbkdpdC5wdWxsKHJlcG9EaXIsIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBGYWlsZWQgdG8gcmVmcmVzaCAke21hcmtldHBsYWNlLmRpc3BsYXlMYWJlbH06YCwgZXJyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID8gdW5kZWZpbmVkIDogRGF0ZS5ub3coKTtcblx0fVxuXG5cdGFzeW5jIHB1bGxSZXBvc2l0b3J5KG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIG9wdGlvbnM/OiBJUHVsbFJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuZ2V0UmVwb3NpdG9yeVVyaShtYXJrZXRwbGFjZSwgb3B0aW9ucz8ubWFya2V0cGxhY2VUeXBlKTtcblx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdGlmICghcmVwb0V4aXN0cykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZV0gQ2Fubm90IHVwZGF0ZSBwbHVnaW4gJyR7b3B0aW9ucz8ucGx1Z2luTmFtZSA/PyBtYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWx9JzogcmVwb3NpdG9yeSBub3QgY2xvbmVkYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlTGFiZWwgPSBvcHRpb25zPy5wbHVnaW5OYW1lID8/IG1hcmtldHBsYWNlLmRpc3BsYXlMYWJlbDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gb3B0aW9ucz8uc2lsZW50XG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5fcGx1Z2luR2l0LnB1bGwocmVwb0Rpcilcblx0XHRcdFx0OiBhd2FpdCB0aGlzLl9wdWxsV2l0aFByb2dyZXNzKHJlcG9EaXIsIHVwZGF0ZUxhYmVsKTtcblxuXHRcdFx0Ly8gQW4gZXhwbGljaXQgcHVsbCBsZWF2ZXMgdGhlIGNsb25lIGV4YWN0bHkgYXMgZnJlc2ggYXMgYSBzdGFsZVxuXHRcdFx0Ly8gcmVmcmVzaCB3b3VsZCwgc28gcmVjb3JkIGl0IFx1MjAxNCBvdGhlcndpc2UgZmxvd3MgdGhhdCBwdWxsIGFuZCB0aGVuXG5cdFx0XHQvLyByZS1yZWFkIHRoZSBtYXJrZXRwbGFjZSAoZS5nLiBgdXBkYXRlQWxsUGx1Z2luc2ApIHdvdWxkIHB1bGwgdGhlXG5cdFx0XHQvLyBzYW1lIHJlcG9zaXRvcnkgdHdpY2UgaW4gYSByb3cuXG5cdFx0XHR0aGlzLl91cGRhdGVNYXJrZXRwbGFjZUluZGV4KG1hcmtldHBsYWNlLCByZXBvRGlyLCBvcHRpb25zPy5tYXJrZXRwbGFjZVR5cGUsIERhdGUubm93KCkpO1xuXHRcdFx0cmV0dXJuIGNoYW5nZWQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZV0gRmFpbGVkIHRvIHVwZGF0ZSAke21hcmtldHBsYWNlLmRpc3BsYXlMYWJlbH06YCwgZXJyKTtcblx0XHRcdGlmICghb3B0aW9ucz8uc2lsZW50KSB7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zID0gW25ldyBBY3Rpb24oJ3Nob3dHaXRPdXRwdXQnLCBsb2NhbGl6ZSgnc2hvd0dpdE91dHB1dCcsIFwiU2hvdyBHaXQgT3V0cHV0XCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdnaXQuc2hvd091dHB1dCcpKV07XG5cdFx0XHRcdGNvbnN0IGZhaWx1cmVMYWJlbCA9IG9wdGlvbnM/LmZhaWx1cmVMYWJlbCA/PyB1cGRhdGVMYWJlbDtcblxuXHRcdFx0XHRpZiAobWFya2V0cGxhY2Uua2luZCAhPT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkxvY2FsRmlsZVVyaSkge1xuXHRcdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2gobmV3IEFjdGlvbigncHVyZ2VBbmRSZWNsb25lTWFya2V0cGxhY2UnLCBsb2NhbGl6ZSgncHVyZ2VBbmRSZWNsb25lTWFya2V0cGxhY2UnLCBcIlB1cmdlIE1hcmtldHBsYWNlIENhY2hlIGFuZCBSZWNsb25lXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMuX3B1cmdlQW5kUmVjbG9uZU1hcmtldHBsYWNlKG1hcmtldHBsYWNlLCBvcHRpb25zPy5tYXJrZXRwbGFjZVR5cGUsIGZhaWx1cmVMYWJlbCkpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3B1bGxGYWlsZWQnLCBcIkZhaWxlZCB0byB1cGRhdGUgcGx1Z2luICd7MH0nOiB7MX1cIiwgZmFpbHVyZUxhYmVsLCBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IHByaW1hcnlBY3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBQdWxscyBhIGNsb25lIGJlaGluZCBhIGNhbmNlbGxhYmxlIHByb2dyZXNzIG5vdGlmaWNhdGlvbi4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcHVsbFdpdGhQcm9ncmVzcyhyZXBvRGlyOiBVUkksIHVwZGF0ZUxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd1cGRhdGluZ1BsdWdpbicsIFwiVXBkYXRpbmcgcGx1Z2luICd7MH0nLi4uXCIsIHVwZGF0ZUxhYmVsKSxcblx0XHRcdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fcGx1Z2luR2l0LnB1bGwocmVwb0RpciwgY3RzLnRva2VuKSxcblx0XHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSksXG5cdFx0XHQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3B1cmdlQW5kUmVjbG9uZU1hcmtldHBsYWNlKG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlIHwgdW5kZWZpbmVkLCBsYWJlbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKG1hcmtldHBsYWNlLmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5nZXRSZXBvc2l0b3J5VXJpKG1hcmtldHBsYWNlLCBtYXJrZXRwbGFjZVR5cGUpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncHVyZ2luZ01hcmtldHBsYWNlJywgXCJQdXJnaW5nIHBsdWdpbiBtYXJrZXRwbGFjZSAnezB9Jy4uLlwiLCBtYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0XHRcdGNhbmNlbGxhYmxlOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhyZXBvRGlyKTtcblx0XHRcdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwocmVwb0RpciwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5lbnN1cmVSZXBvc2l0b3J5KG1hcmtldHBsYWNlLCB7XG5cdFx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHRcdFx0XHRwcm9ncmVzc1RpdGxlOiBsb2NhbGl6ZSgncmVjbG9uaW5nTWFya2V0cGxhY2UnLCBcIlJlY2xvbmluZyBwbHVnaW4gbWFya2V0cGxhY2UgJ3swfScuLi5cIiwgbWFya2V0cGxhY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdFx0XHRcdGZhaWx1cmVMYWJlbDogbGFiZWwsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgncHVyZ2VNYXJrZXRwbGFjZVN1Y2Nlc3MnLCBcIlJlY2xvbmVkIHBsdWdpbiBtYXJrZXRwbGFjZSAnezB9Jy4gVHJ5IHVwZGF0aW5nIHBsdWdpbnMgYWdhaW4uXCIsIG1hcmtldHBsYWNlLmRpc3BsYXlMYWJlbCkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwdXJnZU1hcmtldHBsYWNlRmFpbGVkJywgXCJGYWlsZWQgdG8gcHVyZ2UgcGx1Z2luIG1hcmtldHBsYWNlICd7MH0nOiB7MX1cIiwgbWFya2V0cGxhY2UuZGlzcGxheUxhYmVsLCBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLFxuXHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogW25ldyBBY3Rpb24oJ3Nob3dHaXRPdXRwdXQnLCBsb2NhbGl6ZSgnc2hvd0dpdE91dHB1dCcsIFwiU2hvdyBHaXQgT3V0cHV0XCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZ2l0LnNob3dPdXRwdXQnKTtcblx0XHRcdFx0XHR9KV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXBvQ2FjaGVEaXJGb3JSZWZlcmVuY2UocmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBVUkkge1xuXHRcdHJldHVybiBqb2luUGF0aCh0aGlzLl9jYWNoZVJvb3QsIC4uLnJlZmVyZW5jZS5jYWNoZVNlZ21lbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRNYXJrZXRwbGFjZUluZGV4KCk6IE1hcDxzdHJpbmcsIElNYXJrZXRwbGFjZUluZGV4RW50cnk+IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgSU1hcmtldHBsYWNlSW5kZXhFbnRyeT4oKTtcblx0XHRjb25zdCBzdG9yZWQgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8SVN0b3JlZE1hcmtldHBsYWNlSW5kZXg+KE1BUktFVFBMQUNFX0lOREVYX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghc3RvcmVkKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldml2ZWQgPSByZXZpdmU8SVN0b3JlZE1hcmtldHBsYWNlSW5kZXg+KHN0b3JlZCk7XG5cdFx0Zm9yIChjb25zdCBbY2Fub25pY2FsSWQsIGVudHJ5XSBvZiBPYmplY3QuZW50cmllcyhyZXZpdmVkKSkge1xuXHRcdFx0aWYgKCFlbnRyeSB8fCAhZW50cnkucmVwb3NpdG9yeVVyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LnNldChjYW5vbmljYWxJZCwge1xuXHRcdFx0XHRyZXBvc2l0b3J5VXJpOiBlbnRyeS5yZXBvc2l0b3J5VXJpLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IGVudHJ5Lm1hcmtldHBsYWNlVHlwZSxcblx0XHRcdFx0bGFzdFJlZnJlc2hlZEF0OiBlbnRyeS5sYXN0UmVmcmVzaGVkQXQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWFya2V0cGxhY2VJbmRleChtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCByZXBvc2l0b3J5VXJpOiBVUkksIG1hcmtldHBsYWNlVHlwZT86IE1hcmtldHBsYWNlVHlwZSwgbGFzdFJlZnJlc2hlZEF0PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKG1hcmtldHBsYWNlLmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX21hcmtldHBsYWNlSW5kZXgudmFsdWUuZ2V0KG1hcmtldHBsYWNlLmNhbm9uaWNhbElkKTtcblx0XHRjb25zdCB1cGRhdGVkTGFzdFJlZnJlc2hlZEF0ID0gbGFzdFJlZnJlc2hlZEF0ID8/IHByZXZpb3VzPy5sYXN0UmVmcmVzaGVkQXQ7XG5cdFx0aWYgKHByZXZpb3VzICYmIHByZXZpb3VzLnJlcG9zaXRvcnlVcmkudG9TdHJpbmcoKSA9PT0gcmVwb3NpdG9yeVVyaS50b1N0cmluZygpICYmIHByZXZpb3VzLm1hcmtldHBsYWNlVHlwZSA9PT0gbWFya2V0cGxhY2VUeXBlICYmIHByZXZpb3VzLmxhc3RSZWZyZXNoZWRBdCA9PT0gdXBkYXRlZExhc3RSZWZyZXNoZWRBdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21hcmtldHBsYWNlSW5kZXgudmFsdWUuc2V0KG1hcmtldHBsYWNlLmNhbm9uaWNhbElkLCB7IHJlcG9zaXRvcnlVcmksIG1hcmtldHBsYWNlVHlwZSwgbGFzdFJlZnJlc2hlZEF0OiB1cGRhdGVkTGFzdFJlZnJlc2hlZEF0IH0pO1xuXHRcdHRoaXMuX3NhdmVNYXJrZXRwbGFjZUluZGV4KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlTWFya2V0cGxhY2VJbmRleCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJpYWxpemVkOiBJU3RvcmVkTWFya2V0cGxhY2VJbmRleCA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2Nhbm9uaWNhbElkLCBlbnRyeV0gb2YgdGhpcy5fbWFya2V0cGxhY2VJbmRleC52YWx1ZSkge1xuXHRcdFx0c2VyaWFsaXplZFtjYW5vbmljYWxJZF0gPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0cmVwb3NpdG9yeVVyaTogZW50cnkucmVwb3NpdG9yeVVyaSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBlbnRyeS5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHRcdGxhc3RSZWZyZXNoZWRBdDogZW50cnkubGFzdFJlZnJlc2hlZEF0LFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChPYmplY3Qua2V5cyhzZXJpYWxpemVkKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShNQVJLRVRQTEFDRV9JTkRFWF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShNQVJLRVRQTEFDRV9JTkRFWF9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nsb25lUmVwb3NpdG9yeShyZXBvRGlyOiBVUkksIGNsb25lVXJsOiBzdHJpbmcsIHByb2dyZXNzVGl0bGU6IHN0cmluZywgZmFpbHVyZUxhYmVsOiBzdHJpbmcsIHJlZj86IHN0cmluZywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdC8vIENhbmNlbGxpbmcgdGhlIGNhbGxlciAoZS5nLiB0aGUgbWFya2V0cGxhY2UgcmVmcmVzaCBwcm9ncmVzcykgbXVzdFxuXHRcdC8vIGFsc28gYWJvcnQgYSBmaXJzdC10aW1lIGNsb25lLCBub3QganVzdCBhbiBpbmNyZW1lbnRhbCByZWZyZXNoLlxuXHRcdGNvbnN0IHRva2VuTGlzdGVuZXIgPSB0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY3RzLmNhbmNlbCgpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHR0aXRsZTogcHJvZ3Jlc3NUaXRsZSxcblx0XHRcdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihkaXJuYW1lKHJlcG9EaXIpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wbHVnaW5HaXQuY2xvbmVSZXBvc2l0b3J5KGNsb25lVXJsLCByZXBvRGlyLCByZWYsIGN0cy50b2tlbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IGN0cy5kaXNwb3NlKHRydWUpLFxuXHRcdFx0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBGYWlsZWQgdG8gY2xvbmUgJHtjbG9uZVVybH06YCwgZXJyKTtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Nsb25lRmFpbGVkJywgXCJGYWlsZWQgdG8gaW5zdGFsbCBwbHVnaW4gJ3swfSc6IHsxfVwiLCBmYWlsdXJlTGFiZWwsIGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSksXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW25ldyBBY3Rpb24oJ3Nob3dHaXRPdXRwdXQnLCBsb2NhbGl6ZSgnc2hvd0dpdE91dHB1dCcsIFwiU2hvdyBHaXQgT3V0cHV0XCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2dpdC5zaG93T3V0cHV0Jyk7XG5cdFx0XHRcdFx0XHR9KV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRva2VuTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaShzb3VyY2VEZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGx1Z2luU291cmNlKHNvdXJjZURlc2NyaXB0b3Iua2luZCkuZ2V0SW5zdGFsbFVyaSh0aGlzLl9jYWNoZVJvb3QsIHNvdXJjZURlc2NyaXB0b3IpO1xuXHR9XG5cblx0YXN5bmMgZW5zdXJlUGx1Z2luU291cmNlKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBvcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxVUkk+IHtcblx0XHRhd2FpdCB0aGlzLl9taWdyYXRpb25Eb25lO1xuXHRcdGNvbnN0IHJlcG8gPSB0aGlzLmdldFBsdWdpblNvdXJjZShwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kKTtcblx0XHRpZiAocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBvcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcG8uZW5zdXJlKHRoaXMuX2NhY2hlUm9vdCwgcGx1Z2luLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVBsdWdpblNvdXJjZShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5nZXRQbHVnaW5Tb3VyY2UocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCk7XG5cdFx0aWYgKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wdWxsUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVwby51cGRhdGUodGhpcy5fY2FjaGVSb290LCBwbHVnaW4sIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2hSZXBvc2l0b3J5KG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5nZXRSZXBvc2l0b3J5VXJpKG1hcmtldHBsYWNlKTtcblx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdGlmICghcmVwb0V4aXN0cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wbHVnaW5HaXQuZmV0Y2hSZXBvc2l0b3J5KHJlcG9EaXIpO1xuXHRcdFx0Y29uc3QgYmVoaW5kQ291bnQgPSBhd2FpdCB0aGlzLl9wbHVnaW5HaXQucmV2TGlzdENvdW50KHJlcG9EaXIsICdIRUFEJywgJ0B7dX0nKTtcblx0XHRcdHJldHVybiBiZWhpbmRDb3VudCA+IDA7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZV0gU2lsZW50IGZldGNoIGZhaWxlZCBmb3IgJHttYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWx9OmAsIGVycik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xlYW51cFBsdWdpblNvdXJjZShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3RoZXJJbnN0YWxsZWREZXNjcmlwdG9ycz86IHJlYWRvbmx5IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5nZXRQbHVnaW5Tb3VyY2UocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCk7XG5cdFx0Y29uc3QgY2xlYW51cERpciA9IHJlcG8uZ2V0Q2xlYW51cFRhcmdldCh0aGlzLl9jYWNoZVJvb3QsIHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHRpZiAoIWNsZWFudXBEaXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGRlbGV0aW9uIHdoZW4gYW5vdGhlciBpbnN0YWxsZWQgcGx1Z2luIHNoYXJlcyB0aGUgc2FtZVxuXHRcdC8vIGNsZWFudXAgdGFyZ2V0IChlLmcuIHNhbWUgY2xvbmVkIHJlcG9zaXRvcnkgd2l0aCBkaWZmZXJlbnQgc3ViLXBhdGhzKS5cblx0XHRpZiAob3RoZXJJbnN0YWxsZWREZXNjcmlwdG9ycykge1xuXHRcdFx0Y29uc3Qgc2hhcmVkID0gb3RoZXJJbnN0YWxsZWREZXNjcmlwdG9ycy5zb21lKG90aGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgb3RoZXJSZXBvID0gdGhpcy5nZXRQbHVnaW5Tb3VyY2Uob3RoZXIua2luZCk7XG5cdFx0XHRcdGNvbnN0IG90aGVyVGFyZ2V0ID0gb3RoZXJSZXBvLmdldENsZWFudXBUYXJnZXQodGhpcy5fY2FjaGVSb290LCBvdGhlcik7XG5cdFx0XHRcdHJldHVybiBvdGhlclRhcmdldCAmJiBpc0VxdWFsKG90aGVyVGFyZ2V0LCBjbGVhbnVwRGlyKTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHNoYXJlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske3BsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmR9XSBTa2lwcGluZyBjbGVhbnVwIG9mIHNoYXJlZCBjYWNoZTogJHtjbGVhbnVwRGlyLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGNsZWFudXBEaXIpO1xuXHRcdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwoY2xlYW51cERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH1dIFJlbW92ZWQgcGx1Z2luIGNhY2hlOiAke2NsZWFudXBEaXIudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH1dIEZhaWxlZCB0byByZW1vdmUgcGx1Z2luIGNhY2hlICcke2NsZWFudXBEaXIudG9TdHJpbmcoKX0nOmAsIGVycik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFBydW5lIGVtcHR5IHBhcmVudCBkaXJlY3RvcmllcyB1cCB0byAoYnV0IG5vdCBpbmNsdWRpbmcpIHRoZSBjYWNoZSByb290XG5cdFx0XHQvLyBzbyB3ZSBkb24ndCBsZWF2ZSBkYW5nbGluZyBvd25lci9hdXRob3JpdHkgZm9sZGVycyBiZWhpbmQuXG5cdFx0XHRhd2FpdCB0aGlzLl9wcnVuZUVtcHR5UGFyZW50cyhjbGVhbnVwRGlyKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH1dIEZhaWxlZCB0byBjbGVhbnVwIHBsdWdpbiBzb3VyY2U6YCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2FsayBmcm9tIHtAbGluayBjaGlsZH0ncyBwYXJlbnQgdG93YXJkIHtAbGluayBfY2FjaGVSb290fSwgcmVtb3Zpbmdcblx0ICogZWFjaCBkaXJlY3RvcnkgdGhhdCBpcyBlbXB0eS4gU3RvcHMgYXMgc29vbiBhcyBhIG5vbi1lbXB0eSBkaXJlY3Rvcnlcblx0ICogaXMgZm91bmQgb3IgdGhlIGNhY2hlIHJvb3QgaXMgcmVhY2hlZC4gT25seSBvcGVyYXRlcyBvbiBkZXNjZW5kYW50c1xuXHQgKiBvZiB0aGUgY2FjaGUgcm9vdCBcdTIwMTQgcmV0dXJucyBpbW1lZGlhdGVseSBmb3IgcGF0aHMgb3V0c2lkZSBpdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3BydW5lRW1wdHlQYXJlbnRzKGNoaWxkOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChjaGlsZCwgdGhpcy5fY2FjaGVSb290KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY3VycmVudCA9IGRpcm5hbWUoY2hpbGQpO1xuXHRcdHdoaWxlIChpc0VxdWFsT3JQYXJlbnQoY3VycmVudCwgdGhpcy5fY2FjaGVSb290KSAmJiAhaXNFcXVhbChjdXJyZW50LCB0aGlzLl9jYWNoZVJvb3QpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShjdXJyZW50KTtcblx0XHRcdFx0aWYgKHN0YXQuY2hpbGRyZW4gJiYgc3RhdC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKGN1cnJlbnQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudCA9IGRpcm5hbWUoY3VycmVudCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9uZS10aW1lIG1pZ3JhdGlvbiBvZiBwbHVnaW4gZmlsZXMgZnJvbSB0aGUgb2xkIGludGVybmFsIGNhY2hlXG5cdCAqIGRpcmVjdG9yeSAoYHtjYWNoZUhvbWV9L2FnZW50UGx1Z2lucy9gKSB0byB0aGUgbmV3IHdlbGwta25vd25cblx0ICogbG9jYXRpb24gKGB+L3tkYXRhRm9sZGVyTmFtZX0vYWdlbnQtcGx1Z2lucy9gKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21pZ3JhdGVEaXJlY3Rvcnkob2xkQ2FjaGVSb290OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb2xkRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKG9sZENhY2hlUm9vdCk7XG5cdFx0XHRpZiAoIW9sZEV4aXN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld0V4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLmFnZW50UGx1Z2luc0hvbWUpO1xuXHRcdFx0aWYgKG5ld0V4aXN0cykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBCb3RoIG9sZCBhbmQgbmV3IGFnZW50LXBsdWdpbnMgZGlyZWN0b3JpZXMgZXhpc3Q7IHNraXBwaW5nIGRpcmVjdG9yeSBtaWdyYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBNaWdyYXRpbmcgYWdlbnQgcGx1Z2lucyBmcm9tICR7b2xkQ2FjaGVSb290LnRvU3RyaW5nKCl9IHRvICR7dGhpcy5hZ2VudFBsdWdpbnNIb21lLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5tb3ZlKG9sZENhY2hlUm9vdCwgdGhpcy5hZ2VudFBsdWdpbnNIb21lLCBmYWxzZSk7XG5cblx0XHRcdC8vIENsZWFyIHRoZSBtYXJrZXRwbGFjZSBpbmRleCBcdTIwMTQgaXQgY2FjaGVzIHJlcG9zaXRvcnkgVVJJcyB0aGF0XG5cdFx0XHQvLyBwb2ludGVkIHRvIHRoZSBvbGQgbG9jYXRpb24gYW5kIHdvdWxkIGNhdXNlIHBhdGggbWlzbWF0Y2hlcy5cblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShNQVJLRVRQTEFDRV9JTkRFWF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHRoaXMuX21hcmtldHBsYWNlSW5kZXgudmFsdWUuY2xlYXIoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2VdIERpcmVjdG9yeSBtaWdyYXRpb24gZmFpbGVkJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLHNCQUFzQjtBQUMvQixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMsU0FBUyxpQkFBaUIsZ0JBQWdCO0FBRTVELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFD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
