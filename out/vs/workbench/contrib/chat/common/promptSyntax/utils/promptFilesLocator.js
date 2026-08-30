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
import { URI } from "../../../../../../base/common/uri.js";
import { isAbsolute } from "../../../../../../base/common/path.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import * as nls from "../../../../../../nls.js";
import { FileOperation, FileOperationError, FileOperationResult, IFileService } from "../../../../../../platform/files/common/files.js";
import { getPromptFileLocationsConfigKey, isTildePath, PromptsConfig } from "../config/config.js";
import { basename, dirname, isEqual, isEqualOrParent, joinPath } from "../../../../../../base/common/resources.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { AGENTS_SOURCE_FOLDER, CLAUDE_CONFIG_FOLDER, COPILOT_CONFIG_FOLDER, GITHUB_CONFIG_FOLDER, getPromptFileExtension, getPromptFileType, LEGACY_MODE_FILE_EXTENSION, getCleanPromptName, AGENT_FILE_EXTENSION, getPromptFileDefaultLocations, SKILL_FILENAME } from "../config/promptFileLocations.js";
import { PromptFileSource, PromptsType } from "../promptTypes.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { getExcludes, ISearchService, QueryType } from "../../../../../services/search/common/search.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { AgentInstructionFileType, PromptsStorage } from "../service/promptsService.js";
import { IUserDataProfileService } from "../../../../../services/userDataProfile/common/userDataProfile.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { equalsIgnoreCase } from "../../../../../../base/common/strings.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { AGENT_HOST_SCHEME } from "../../../../../../platform/agentHost/common/agentHostUri.js";
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;
let PromptFilesLocator = class {
  constructor(fileService, configService, workspaceService, environmentService, searchService, userDataService, logService, pathService, workspaceTrustManagementService) {
    this.fileService = fileService;
    this.configService = configService;
    this.workspaceService = workspaceService;
    this.environmentService = environmentService;
    this.searchService = searchService;
    this.userDataService = userDataService;
    this.logService = logService;
    this.pathService = pathService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    const userDataPromptsHome = this.userDataService.currentProfile.promptsHome;
    this.userDataFolder = {
      uri: userDataPromptsHome,
      searchRoot: userDataPromptsHome,
      filePattern: void 0,
      source: PromptFileSource.UserData,
      storage: PromptsStorage.user,
      displayPath: nls.localize("promptsUserDataFolder", "User Data"),
      isDefault: true
    };
  }
  getWorkspaceFolders() {
    return this.workspaceService.getWorkspace().folders.filter((f) => f.uri.scheme !== AGENT_HOST_SCHEME);
  }
  getWorkspaceFolder(resource) {
    return this.workspaceService.getWorkspaceFolder(resource) ?? void 0;
  }
  onDidChangeWorkspaceFolders() {
    return Event.map(this.workspaceService.onDidChangeWorkspaceFolders, () => void 0);
  }
  /**
   * Returns the configured prompt source folders for the given type.
   * Subclasses can override to filter out unsupported sources.
   */
  getPromptSourceFolders(type) {
    return PromptsConfig.promptSourceFolders(this.configService, type);
  }
  /**
   * Returns the default prompt source folders for the given type.
   * Subclasses can override to filter out unsupported sources.
   */
  getDefaultSourceFolders(type) {
    return getPromptFileDefaultLocations(type);
  }
  async getWorkspaceFolderRoots(includeParents, logger, root) {
    const workspaceFolders = root ? root.scheme === AGENT_HOST_SCHEME ? [] : [{ uri: root }] : this.getWorkspaceFolders();
    if (includeParents) {
      const roots = new ResourceSet();
      const userHome = await this.pathService.userHome();
      for (const workspaceFolder of workspaceFolders) {
        roots.add(workspaceFolder.uri);
        const parents = await this.findParentRepoFolders(workspaceFolder.uri, userHome, roots, logger);
        for (const parent of parents) {
          roots.add(parent);
        }
      }
      return [...roots];
    }
    return workspaceFolders.map((f) => f.uri);
  }
  /**
   * Walks up from {@link folderUri} collecting parent folders until a
   * repository root (a folder containing `.git`) is found.  Returns the
   * intermediate parent folders only when a repo root is found; returns
   * an empty array when the walk reaches the filesystem root, the user
   * home directory, or a folder already present in {@link seen}.
   */
  async findParentRepoFolders(folderUri, userHome, seen, logger) {
    const candidates = [];
    let current = folderUri;
    while (true) {
      try {
        const isRepoRoot = await this.fileService.exists(joinPath(current, ".git"));
        if (isRepoRoot) {
          if ((await this.workspaceTrustManagementService.getUriTrustInfo(current)).trusted) {
            candidates.push(current);
            return candidates;
          }
          logger?.logInfo(`Repository root found at ${current.toString()}, but it is not trusted. Skipping parent folder inclusion for this workspace folder.`);
          return [];
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger?.logInfo(`No repository root found for folder ${folderUri.toString()}. Error accessing ${joinPath(current, ".git")}: ${msg}.`);
        return [];
      }
      candidates.push(current);
      const parent = dirname(current);
      if (isEqual(current, parent) || current.path === "/" || isEqual(userHome, parent) || seen.has(parent)) {
        break;
      }
      current = parent;
    }
    logger?.logInfo(`No repository root found for folder ${folderUri.toString()}.`);
    return [];
  }
  /**
   * List all prompt files from the filesystem.
   *
   * @returns List of prompt files found in the workspace.
   */
  async listFiles(type, storage, token, root) {
    const files = await this.listFilesWithSource(type, storage, token, root);
    return files.map((file) => file.uri);
  }
  async listFilesWithSource(type, storage, token, root) {
    if (storage !== PromptsStorage.user && storage !== PromptsStorage.local) {
      throw new Error(`Unsupported prompt file storage: ${storage}`);
    }
    const configuredLocations = this.getPromptSourceFolders(type);
    const localRoot = storage === PromptsStorage.local ? root : void 0;
    const absoluteLocations = await this.toAbsoluteLocations(type, configuredLocations.filter((location) => location.storage === storage), void 0, localRoot);
    if (storage === PromptsStorage.user && this.isUserDataPromptType(type)) {
      const localLocations = await this.toAbsoluteLocations(type, configuredLocations.filter((location) => location.storage === PromptsStorage.local));
      absoluteLocations.push(...localLocations.filter((location) => this.sourceFolderOverlapsUserData(type, location.searchRoot)));
      absoluteLocations.push(this.userDataFolder);
    }
    const paths = new ResourceSet();
    const result = [];
    for (const { searchRoot, filePattern, source, storage: sourceStorage } of absoluteLocations) {
      const files = filePattern === void 0 ? await this.resolveFilesAtLocation(searchRoot, type, token, 0, localRoot) : await this.searchFilesInLocation(searchRoot, filePattern, token);
      for (const file of files) {
        if (getPromptFileType(file) !== type || paths.has(file)) {
          continue;
        }
        const isUserDataFile = this.isUserDataPromptFile(type, file);
        if (isUserDataFile && storage !== PromptsStorage.user || !isUserDataFile && sourceStorage !== storage) {
          continue;
        }
        paths.add(file);
        result.push({ uri: file, source: isUserDataFile ? PromptFileSource.UserData : source });
      }
      if (token.isCancellationRequested) {
        return [];
      }
    }
    return result;
  }
  isUserDataPromptType(type) {
    return type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt;
  }
  isUserDataPromptFile(type, resource) {
    return this.isUserDataPromptType(type) && isEqualOrParent(resource, this.userDataFolder.uri);
  }
  sourceFolderOverlapsUserData(type, searchRoot) {
    return this.isUserDataPromptType(type) && (isEqualOrParent(searchRoot, this.userDataFolder.uri) || isEqualOrParent(this.userDataFolder.uri, searchRoot));
  }
  createFilesUpdatedEvent(type) {
    const disposables = new DisposableStore();
    const eventEmitter = disposables.add(new Emitter());
    const token = disposables.add(new CancellationTokenSource()).token;
    const externalFolderWatchers = disposables.add(new DisposableStore());
    const key = getPromptFileLocationsConfigKey(type);
    const userDataFolder = this.userDataService.currentProfile.promptsHome;
    let parentFolders = [];
    const updateExternalFolderWatchers = () => {
      externalFolderWatchers.clear();
      for (const folder of parentFolders) {
        if (!this.getWorkspaceFolder(folder.searchRoot)) {
          const recursive = folder.filePattern !== void 0 || type === PromptsType.instructions;
          externalFolderWatchers.add(this.fileService.watch(folder.searchRoot, { recursive, excludes: [] }));
        }
      }
    };
    const update = async () => {
      try {
        const configuredLocations = this.getPromptSourceFolders(type);
        parentFolders = await this.toAbsoluteLocations(type, configuredLocations, void 0);
        if (token.isCancellationRequested) {
          return;
        }
        updateExternalFolderWatchers();
      } catch (err) {
        this.logService.error(`Error updating prompt file watchers after config change:`, err);
      }
    };
    disposables.add(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(key) || e.affectsConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS)) {
        void update();
        eventEmitter.fire();
      }
    }));
    disposables.add(this.onDidChangeWorkspaceFolders()(() => {
      void update();
      eventEmitter.fire();
    }));
    disposables.add(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
      void update();
      eventEmitter.fire();
    }));
    disposables.add(this.fileService.onDidFilesChange((e) => {
      if (e.affects(userDataFolder)) {
        eventEmitter.fire();
        return;
      }
      if (parentFolders.some((folder) => e.affects(folder.searchRoot))) {
        eventEmitter.fire();
        return;
      }
    }));
    disposables.add(this.fileService.watch(userDataFolder));
    void update();
    return { event: eventEmitter.event, dispose: () => disposables.dispose() };
  }
  createAgentInstructionsUpdatedEvent() {
    const disposables = new DisposableStore();
    const eventEmitter = disposables.add(new Emitter());
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => cts.dispose(true)));
    const token = cts.token;
    const watchers = disposables.add(new DisposableStore());
    const watchedRoots = new ResourceSet();
    const addWatch = (resource) => {
      if (token.isCancellationRequested) {
        return;
      }
      if (watchedRoots.has(resource)) {
        return;
      }
      watchedRoots.add(resource);
      watchers.add(this.fileService.watch(resource));
    };
    const updateWatchers = async () => {
      watchers.clear();
      watchedRoots.clear();
      const watchWorkspaceRoots = this.configService.getValue(PromptsConfig.USE_AGENT_MD) || this.configService.getValue(PromptsConfig.USE_CLAUDE_MD);
      const watchClaudeFolders = this.configService.getValue(PromptsConfig.USE_CLAUDE_MD);
      const watchCopilotFolders = this.configService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
      const includeParents = this.configService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
      const workspaceRoots = await this.getWorkspaceFolderRoots(includeParents);
      if (token.isCancellationRequested) {
        return;
      }
      const userHome = await this.pathService.userHome();
      if (token.isCancellationRequested) {
        return;
      }
      for (const workspaceRoot of workspaceRoots) {
        if (watchWorkspaceRoots) {
          addWatch(workspaceRoot);
        }
        if (watchClaudeFolders) {
          addWatch(joinPath(workspaceRoot, CLAUDE_CONFIG_FOLDER));
        }
        if (watchCopilotFolders) {
          addWatch(joinPath(workspaceRoot, GITHUB_CONFIG_FOLDER));
        }
      }
      if (watchClaudeFolders) {
        addWatch(joinPath(userHome, CLAUDE_CONFIG_FOLDER));
      }
      if (watchCopilotFolders) {
        addWatch(joinPath(userHome, COPILOT_CONFIG_FOLDER));
      }
    };
    const refresh = () => {
      void updateWatchers();
      eventEmitter.fire();
    };
    disposables.add(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(PromptsConfig.USE_AGENT_MD) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_MD) || e.affectsConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES) || e.affectsConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS)) {
        refresh();
      }
    }));
    disposables.add(this.onDidChangeWorkspaceFolders()(() => {
      refresh();
    }));
    disposables.add(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
      refresh();
    }));
    disposables.add(this.fileService.onDidFilesChange((e) => {
      for (const watchedRoot of watchedRoots) {
        if (e.affects(watchedRoot)) {
          eventEmitter.fire();
          return;
        }
      }
    }));
    disposables.add(this.fileService.onDidRunOperation((e) => {
      for (const watchedRoot of watchedRoots) {
        if (isEqualOrParent(e.resource, watchedRoot)) {
          eventEmitter.fire();
          return;
        }
        if (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.MOVE) || e.isOperation(FileOperation.COPY)) {
          if (isEqualOrParent(e.target.resource, watchedRoot)) {
            eventEmitter.fire();
            return;
          }
        }
      }
    }));
    void updateWatchers();
    return { event: eventEmitter.event, dispose: () => disposables.dispose() };
  }
  /**
   * Gets the hook source folders for creating new hooks.
   * Returns configured hook folders, excluding Claude paths (which are read-only).
   */
  async getHookSourceFolders() {
    const configuredLocations = this.getPromptSourceFolders(PromptsType.hook);
    const allowedHookFolders = configuredLocations.filter(
      (loc) => !loc.path.startsWith(".claude/") && !loc.path.includes("/.claude/")
    );
    const absoluteLocations = await this.toAbsoluteLocations(PromptsType.hook, allowedHookFolders);
    const seen = new ResourceSet();
    const result = [];
    for (const location of absoluteLocations) {
      if (!seen.has(location.searchRoot)) {
        seen.add(location.searchRoot);
        result.push({ ...location, uri: location.searchRoot, filePattern: void 0 });
      }
    }
    return result;
  }
  /**
   * Get all possible unambiguous prompt file source folders based on
   * the current workspace folder structure.
   *
   * This method is currently primarily used by the `> Create Prompt`
   * command that providers users with the list of destination folders
   * for a newly created prompt file. Because such a list cannot contain
   * paths that include `glob pattern` in them, we need to process config
   * values and try to create a list of clear and unambiguous locations.
   *
   * @returns List of possible unambiguous prompt file folders.
   */
  async getConfigBasedSourceFolders(type) {
    const configuredLocations = this.getPromptSourceFolders(type);
    const absoluteLocations = await this.toAbsoluteLocations(type, configuredLocations);
    if (type !== PromptsType.prompt && type !== PromptsType.instructions) {
      return absoluteLocations.map((l) => l.uri);
    }
    const result = new ResourceSet();
    for (const absoluteLocation of absoluteLocations) {
      let location = absoluteLocation.uri;
      const baseName = basename(location);
      const filePatterns = ["*.md", `*${getPromptFileExtension(type)}`];
      for (const filePattern of filePatterns) {
        if (baseName === filePattern) {
          location = dirname(location);
          continue;
        }
      }
      if (baseName === "*") {
        location = dirname(location);
      }
      if (isValidGlob(location.path) === true) {
        continue;
      }
      result.add(location);
    }
    return [...result];
  }
  /**
   * Gets all resolved source folders for the given prompt type with metadata.
   * This method merges configured locations with default locations and resolves them
   * to absolute paths, including displayPath and isDefault information.
   *
   * The returned order prefers workspace (local) folders first, then user folders.
   * This is used for UX like the "Create Prompt" command where workspace is preferred.
   *
   * @param type The type of prompt files.
   * @returns List of resolved source folders with metadata.
   */
  async getResolvedSourceFolders(type) {
    const absoluteLocations = await this.getLocalStorageFolders(type);
    const localFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.local);
    const userFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.user);
    return this.dedupeSourceFolders([...localFolders, ...userFolders]);
  }
  /**
   * Gets all resolved source folders in the same order that file discovery
   * searches them (user folders first, then local/workspace folders).
   * This matches the order used by {@link listFiles} and should be used
   * for debug/diagnostic output so the displayed order is accurate.
   */
  async getSourceFoldersInDiscoveryOrder(type) {
    const absoluteLocations = await this.getLocalStorageFolders(type);
    const userFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.user);
    const localFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.local);
    return this.dedupeSourceFolders([...userFolders, ...localFolders]);
  }
  /**
   * Gets all local (workspace) storage folders for the given prompt type.
   * This merges default folders with configured locations.
   */
  async getLocalStorageFolders(type) {
    const configuredLocations = this.getPromptSourceFolders(type);
    const defaultFolders = this.getDefaultSourceFolders(type);
    const isConfigured = PromptsConfig.getLocationsValue(this.configService, type) !== void 0;
    const allFolders = isConfigured ? configuredLocations : defaultFolders;
    const absoluteLocations = await this.toAbsoluteLocations(type, allFolders, defaultFolders);
    if (type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt) {
      absoluteLocations.push(this.userDataFolder);
    }
    return absoluteLocations;
  }
  /**
   * Deduplicates source folders by URI.
   */
  dedupeSourceFolders(folders) {
    const seen = new ResourceSet();
    const result = [];
    for (const folder of folders) {
      if (!seen.has(folder.uri)) {
        seen.add(folder.uri);
        result.push(folder);
      }
    }
    return result;
  }
  /**
   * Converts locations defined in `settings` to absolute filesystem path URIs with metadata.
   * This conversion is needed because locations in settings can be relative,
   * hence we need to resolve them based on the current workspace folders.
   * If userHome is provided, paths starting with `~` will be expanded. Otherwise these paths are ignored.
   * Preserves the type and location properties from the source folder definitions.
   */
  async toAbsoluteLocations(type, configuredLocations, defaultLocations, root) {
    const result = [];
    const seen = new ResourceSet();
    const userHome = await this.pathService.userHome();
    const rootFolders = await this.getWorkspaceFolderRoots(this.configService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true, void 0, root);
    const defaultPaths = new Set(defaultLocations?.map((loc) => loc.path));
    const validLocations = configuredLocations.filter((sourceFolder) => {
      if (type === PromptsType.instructions || type === PromptsType.prompt) {
        const path = sourceFolder.path;
        if (hasGlobPattern(path)) {
          if (type === PromptsType.prompt) {
            this.logService.warn(`[Deprecated] Glob patterns (* and **) in prompt file locations are deprecated: "${path}". Consider using explicit paths instead.`);
          } else if (type === PromptsType.instructions) {
            this.logService.info(`Glob patterns (* and **) detected in instruction file location: "${path}". Consider using explicit paths for better performance.`);
          }
        }
        return true;
      }
      const configuredLocation = sourceFolder.path;
      if (!isValidPromptFolderPath(configuredLocation)) {
        this.logService.warn(`Skipping invalid path (glob patterns and absolute paths not supported): ${configuredLocation}`);
        return false;
      }
      return true;
    });
    for (const sourceFolder of validLocations) {
      const configuredLocation = sourceFolder.path;
      const isDefault = defaultPaths?.has(configuredLocation);
      try {
        if (isTildePath(configuredLocation)) {
          const uri = joinPath(userHome, configuredLocation.substring(2));
          if (!seen.has(uri)) {
            seen.add(uri);
            const { searchRoot, filePattern } = resolveSearchLocation(type, uri);
            result.push({ uri, searchRoot, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
          }
          continue;
        }
        if (isAbsolute(configuredLocation)) {
          let uri = URI.file(configuredLocation);
          const remoteAuthority = this.environmentService.remoteAuthority;
          if (remoteAuthority) {
            uri = uri.with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });
          }
          if (!seen.has(uri)) {
            seen.add(uri);
            const { searchRoot, filePattern } = resolveSearchLocation(type, uri);
            result.push({ uri, searchRoot, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
          }
        } else {
          for (const folder of rootFolders) {
            const absolutePath = joinPath(folder, configuredLocation);
            if (!seen.has(absolutePath)) {
              seen.add(absolutePath);
              const { searchRoot, filePattern } = resolveSearchLocation(type, absolutePath);
              result.push({ uri: absolutePath, searchRoot, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
            }
          }
        }
      } catch (error) {
        this.logService.error(`Failed to resolve prompt file location: ${configuredLocation}`, error);
      }
    }
    return result;
  }
  /**
   * Uses the file service to resolve the provided location and return either the file at the location of files in the directory.
   * For instruction folders, this searches recursively (up to {@link MAX_INSTRUCTIONS_RECURSION_DEPTH} levels deep) provided
   * the location is not a workspace folder root and does not contain wildcards, to support subdirectories while avoiding
   * accidentally broad traversal.
   */
  async resolveFilesAtLocation(location, type, token, depth = 0, root) {
    if (type === PromptsType.skill) {
      return this.findAgentSkillsInFolder(location, token);
    }
    const isWorkspaceRoot = depth === 0 && (root ? isEqual(root, location) : this.getWorkspaceFolders().some((f) => isEqual(f.uri, location)));
    const recursive = type === PromptsType.instructions && !isWorkspaceRoot && !hasGlobPattern(location.path) && depth < MAX_INSTRUCTIONS_RECURSION_DEPTH;
    try {
      const info = await this.fileService.resolve(location);
      if (token.isCancellationRequested) {
        return [];
      }
      if (info.isFile) {
        return [info.resource];
      } else if (info.isDirectory && info.children) {
        const result = [];
        for (const child of info.children) {
          if (child.isFile) {
            result.push(child.resource);
          } else if (recursive && child.isDirectory) {
            const subFiles = await this.resolveFilesAtLocation(child.resource, type, token, depth + 1, root);
            result.push(...subFiles);
          }
        }
        return result;
      }
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
      } else {
        this.logService.error(`Failed to resolve files at location: ${location.toString()}`, e);
      }
    }
    return [];
  }
  /**
   * Uses the search service to find all files at the provided location.
   * Requires a FileSearchProvider to be available for the folder's scheme.
   */
  async searchFilesInLocation(folder, filePattern, token) {
    if (!this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
      this.logService.warn(`[PromptFilesLocator] No FileSearchProvider available for scheme '${folder.scheme}'. Cannot search for pattern '${filePattern}' in ${folder.toString()}`);
      return [];
    }
    const disregardIgnoreFiles = this.configService.getValue("explorer.excludeGitIgnore");
    const workspaceRoot = this.getWorkspaceFolder(folder);
    const getExcludePattern = (folder2) => getExcludes(this.configService.getValue({ resource: folder2 })) || {};
    const searchOptions = {
      folderQueries: [{ folder, disregardIgnoreFiles }],
      type: QueryType.File,
      shouldGlobMatchFilePattern: true,
      excludePattern: workspaceRoot ? getExcludePattern(workspaceRoot.uri) : void 0,
      ignoreGlobCase: true,
      sortByScore: true,
      filePattern
    };
    try {
      const searchResult = await this.searchService.fileSearch(searchOptions, token);
      if (token.isCancellationRequested) {
        return [];
      }
      return searchResult.results.map((r) => r.resource);
    } catch (e) {
      if (!isCancellationError(e)) {
        throw e;
      }
    }
    return [];
  }
  /**
   * Gets list of `AGENTS.md` files anywhere in the workspace.
   */
  async findAgentMDsInWorkspace(token) {
    const result = await Promise.all(this.getWorkspaceFolders().map((folder) => this.findAgentMDsInFolder(folder.uri, token)));
    return result.flat(1);
  }
  async findAgentMDsInFolder(folder, token) {
    if (this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
      const disregardIgnoreFiles = this.configService.getValue("explorer.excludeGitIgnore");
      const getExcludePattern = (folder2) => getExcludes(this.configService.getValue({ resource: folder2 })) || {};
      const searchOptions = {
        folderQueries: [{ folder, disregardIgnoreFiles }],
        type: QueryType.File,
        shouldGlobMatchFilePattern: true,
        excludePattern: getExcludePattern(folder),
        filePattern: "**/AGENTS.md",
        ignoreGlobCase: true
      };
      try {
        const searchResult = await this.searchService.fileSearch(searchOptions, token);
        if (token.isCancellationRequested) {
          return [];
        }
        const results = [];
        for (const r of searchResult.results) {
          const realPath = void 0;
          results.push({ uri: r.resource, realPath, type: AgentInstructionFileType.agentsMd });
        }
        return results;
      } catch (e) {
        if (!isCancellationError(e)) {
          throw e;
        }
      }
      return [];
    } else {
      return this.findAgentMDsUsingFileService(folder, token);
    }
  }
  /**
   * Recursively traverses a folder using the file service to find AGENTS.md files.
   * This is used as a fallback when no FileSearchProvider is available for the scheme.
   */
  async findAgentMDsUsingFileService(folder, token) {
    const result = [];
    const agentsMdFileName = "agents.md";
    const traverse = async (uri) => {
      if (token.isCancellationRequested) {
        return;
      }
      try {
        const stat = await this.fileService.resolve(uri);
        if (stat.isFile && stat.name.toLowerCase() === agentsMdFileName) {
          const realPath = stat.isSymbolicLink ? await this.fileService.realpath(stat.resource) : void 0;
          result.push({ uri: stat.resource, realPath, type: AgentInstructionFileType.agentsMd });
        } else if (stat.isDirectory && stat.children) {
          for (const child of stat.children) {
            await traverse(child.resource);
          }
        }
      } catch (error) {
        this.logService.trace(`[PromptFilesLocator] Error traversing ${uri.toString()}: ${error}`);
      }
    };
    await traverse(folder);
    return result;
  }
  async findFilesInRoots(roots, folder, paths, token, result = []) {
    const toResolve = roots.map((root) => ({ resource: folder !== void 0 ? joinPath(root, folder) : root }));
    const resolvedRoots = await this.fileService.resolveAll(toResolve);
    if (token.isCancellationRequested) {
      return result;
    }
    for (const root of resolvedRoots) {
      if (root.success && root.stat?.children) {
        for (const child of root.stat.children) {
          if (child.isFile) {
            const matchingPath = paths.find((p) => equalsIgnoreCase(p.fileName, child.name));
            if (matchingPath) {
              const realPath = child.isSymbolicLink ? await this.fileService.realpath(child.resource) : void 0;
              result.push({ uri: child.resource, realPath, type: matchingPath.type });
            }
          }
        }
      }
    }
    return result;
  }
  getAgentFileURIFromModeFile(oldURI) {
    if (oldURI.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
      let newLocation;
      const workspaceFolder = this.getWorkspaceFolder(oldURI);
      if (workspaceFolder) {
        newLocation = joinPath(workspaceFolder.uri, AGENTS_SOURCE_FOLDER, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
      } else if (isEqualOrParent(oldURI, this.userDataService.currentProfile.promptsHome)) {
        newLocation = joinPath(this.userDataService.currentProfile.promptsHome, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
      }
      return newLocation;
    }
    return void 0;
  }
  async findAgentSkillsInFolder(uri, token) {
    try {
      const result = [];
      const stat = await this.fileService.resolve(uri);
      if (stat.isDirectory && stat.children) {
        for (const child of stat.children) {
          try {
            if (token.isCancellationRequested) {
              return [];
            }
            if (child.isDirectory) {
              const skillFile = joinPath(child.resource, SKILL_FILENAME);
              const skillStat = await this.fileService.resolve(skillFile);
              if (skillStat.isFile) {
                result.push(skillStat.resource);
              }
            }
          } catch (error) {
          }
        }
      }
      return result;
    } catch (e) {
      if (!isCancellationError(e)) {
        this.logService.trace(`[PromptFilesLocator] Error searching for skills in ${uri.toString()}: ${e}`);
      }
      return [];
    }
  }
  /**
   * Searches for skills in all configured locations.
   */
  async findAgentSkills(token) {
    const configuredLocations = this.getPromptSourceFolders(PromptsType.skill);
    const absoluteLocations = await this.toAbsoluteLocations(PromptsType.skill, configuredLocations);
    const allResults = [];
    for (const { uri, source, storage } of absoluteLocations) {
      if (token.isCancellationRequested) {
        return [];
      }
      const results = await this.findAgentSkillsInFolder(uri, token);
      for (const skillUri of results) {
        allResults.push({ uri: skillUri, source, storage, type: PromptsType.skill });
      }
    }
    return allResults;
  }
};
PromptFilesLocator = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, ISearchService),
  __decorateParam(5, IUserDataProfileService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IPathService),
  __decorateParam(8, IWorkspaceTrustManagementService)
], PromptFilesLocator);
function hasGlobPattern(path) {
  return path.includes("*");
}
function isValidGlob(pattern) {
  let squareBrackets = false;
  let squareBracketsCount = 0;
  let curlyBrackets = false;
  let curlyBracketsCount = 0;
  let previousCharacter;
  for (const char of pattern) {
    if (previousCharacter === "\\") {
      previousCharacter = char;
      continue;
    }
    if (char === "*") {
      return true;
    }
    if (char === "?") {
      return true;
    }
    if (char === "[") {
      squareBrackets = true;
      squareBracketsCount++;
      previousCharacter = char;
      continue;
    }
    if (char === "]") {
      squareBrackets = true;
      squareBracketsCount--;
      previousCharacter = char;
      continue;
    }
    if (char === "{") {
      curlyBrackets = true;
      curlyBracketsCount++;
      continue;
    }
    if (char === "}") {
      curlyBrackets = true;
      curlyBracketsCount--;
      previousCharacter = char;
      continue;
    }
    previousCharacter = char;
  }
  if (squareBrackets && squareBracketsCount === 0) {
    return true;
  }
  if (curlyBrackets && curlyBracketsCount === 0) {
    return true;
  }
  return false;
}
function resolveSearchLocation(type, location) {
  if (type !== PromptsType.instructions && type !== PromptsType.prompt) {
    return { searchRoot: location };
  }
  const segments = location.path.split("/");
  let i = 0;
  while (i < segments.length && isValidGlob(segments[i]) === false) {
    i++;
  }
  if (i === segments.length) {
    return { searchRoot: location };
  }
  const parent = location.with({ path: segments.slice(0, i).join("/") });
  if (i === segments.length - 1 && segments[i] === "*" || segments[i] === ``) {
    return { searchRoot: parent };
  }
  return {
    searchRoot: parent,
    filePattern: segments.slice(i).join("/")
  };
}
const VALID_PROMPT_FOLDER_PATTERN = "^(?![A-Za-z]:[\\\\/])(?!/)(?!~(?!/))(?!.*\\\\)(?!.*[*?\\[\\]{}]).*\\S.*$";
const VALID_PROMPT_FOLDER_REGEX = new RegExp(VALID_PROMPT_FOLDER_PATTERN);
function isValidPromptFolderPath(path) {
  return VALID_PROMPT_FOLDER_REGEX.test(path);
}
export {
  PromptFilesLocator,
  VALID_PROMPT_FOLDER_PATTERN,
  hasGlobPattern,
  isValidGlob,
  isValidPromptFolderPath
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFx1dGlsc1xccHJvbXB0RmlsZXNMb2NhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0UHJvbXB0RmlsZUxvY2F0aW9uc0NvbmZpZ0tleSwgaXNUaWxkZVBhdGgsIFByb21wdHNDb25maWcgfSBmcm9tICcuLi9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsLCBpc0VxdWFsT3JQYXJlbnQsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQUdFTlRTX1NPVVJDRV9GT0xERVIsIENMQVVERV9DT05GSUdfRk9MREVSLCBDT1BJTE9UX0NPTkZJR19GT0xERVIsIEdJVEhVQl9DT05GSUdfRk9MREVSLCBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uLCBnZXRQcm9tcHRGaWxlVHlwZSwgTEVHQUNZX01PREVfRklMRV9FWFRFTlNJT04sIGdldENsZWFuUHJvbXB0TmFtZSwgQUdFTlRfRklMRV9FWFRFTlNJT04sIGdldFByb21wdEZpbGVEZWZhdWx0TG9jYXRpb25zLCBTS0lMTF9GSUxFTkFNRSwgSVByb21wdFNvdXJjZUZvbGRlciwgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyIH0gZnJvbSAnLi4vY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVNvdXJjZSwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZXRFeGNsdWRlcywgSUZpbGVRdWVyeSwgSVNlYXJjaENvbmZpZ3VyYXRpb24sIElTZWFyY2hTZXJ2aWNlLCBRdWVyeVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUsIElQcm9tcHRQYXRoLCBJQWdlbnRJbnN0cnVjdGlvbkZpbGUsIExvZ2dlciwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVxdWFsc0lnbm9yZUNhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcblxuLyoqXG4gKiBNYXhpbXVtIHJlY3Vyc2lvbiBkZXB0aCB3aGVuIHRyYXZlcnNpbmcgc3ViZGlyZWN0b3JpZXMgZm9yIGluc3RydWN0aW9uIGZpbGVzLlxuICovXG5jb25zdCBNQVhfSU5TVFJVQ1RJT05TX1JFQ1VSU0lPTl9ERVBUSCA9IDU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtzcGFjZUluc3RydWN0aW9uRmlsZSB7XG5cdHJlYWRvbmx5IGZpbGVOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZTtcbn1cblxuLyoqXG4gKiBVdGlsaXR5IGNsYXNzIHRvIGxvY2F0ZSBwcm9tcHQgZmlsZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRGaWxlc0xvY2F0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFGb2xkZXI6IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoU2VydmljZTogSVNlYXJjaFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cblx0XHRjb25zdCB1c2VyRGF0YVByb21wdHNIb21lID0gdGhpcy51c2VyRGF0YVNlcnZpY2UuY3VycmVudFByb2ZpbGUucHJvbXB0c0hvbWU7XG5cdFx0dGhpcy51c2VyRGF0YUZvbGRlciA9IHtcblx0XHRcdHVyaTogdXNlckRhdGFQcm9tcHRzSG9tZSxcblx0XHRcdHNlYXJjaFJvb3Q6IHVzZXJEYXRhUHJvbXB0c0hvbWUsXG5cdFx0XHRmaWxlUGF0dGVybjogdW5kZWZpbmVkLFxuXHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdGRpc3BsYXlQYXRoOiBubHMubG9jYWxpemUoJ3Byb21wdHNVc2VyRGF0YUZvbGRlcicsIFwiVXNlciBEYXRhXCIpLFxuXHRcdFx0aXNEZWZhdWx0OiB0cnVlXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRXb3Jrc3BhY2VGb2xkZXJzKCk6IHJlYWRvbmx5IElXb3Jrc3BhY2VGb2xkZXJbXSB7XG5cdFx0Ly8gQWdlbnQgaG9zdCB3b3Jrc3BhY2UgZm9sZGVycyBzdXJmYWNlIGN1c3RvbWl6YXRpb25zIHRocm91Z2ggQUhQXG5cdFx0Ly8gKHNlc3Npb24gc3RhdGUgKyBmaW5kQWdlbnRTa2lsbHMpLCBub3QgdmlhIGZpbGVzeXN0ZW0gc2Nhbm5pbmcuXG5cdFx0Ly8gSW5jbHVkaW5nIHRoZW0gaGVyZSB3b3VsZCBpc3N1ZSBhIGByZXNvdXJjZUxpc3RgIEpTT04tUlBDIHBlclxuXHRcdC8vIGNvbmZpZ3VyZWQgbG9jYXRpb24gZm9yIGV2ZXJ5IG5vbmV4aXN0ZW50IGAuZ2l0aHViYCAvIGAuY2xhdWRlYFxuXHRcdC8vIGZvbGRlciBvbiB0aGUgcmVtb3RlLlxuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5maWx0ZXIoZiA9PiBmLnVyaS5zY2hlbWUgIT09IEFHRU5UX0hPU1RfU0NIRU1FKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2U6IFVSSSk6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMud29ya3NwYWNlU2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMsICgpID0+IHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY29uZmlndXJlZCBwcm9tcHQgc291cmNlIGZvbGRlcnMgZm9yIHRoZSBnaXZlbiB0eXBlLlxuXHQgKiBTdWJjbGFzc2VzIGNhbiBvdmVycmlkZSB0byBmaWx0ZXIgb3V0IHVuc3VwcG9ydGVkIHNvdXJjZXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0UHJvbXB0U291cmNlRm9sZGVycyh0eXBlOiBQcm9tcHRzVHlwZSk6IElQcm9tcHRTb3VyY2VGb2xkZXJbXSB7XG5cdFx0cmV0dXJuIFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyh0aGlzLmNvbmZpZ1NlcnZpY2UsIHR5cGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGRlZmF1bHQgcHJvbXB0IHNvdXJjZSBmb2xkZXJzIGZvciB0aGUgZ2l2ZW4gdHlwZS5cblx0ICogU3ViY2xhc3NlcyBjYW4gb3ZlcnJpZGUgdG8gZmlsdGVyIG91dCB1bnN1cHBvcnRlZCBzb3VyY2VzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGdldERlZmF1bHRTb3VyY2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogcmVhZG9ubHkgSVByb21wdFNvdXJjZUZvbGRlcltdIHtcblx0XHRyZXR1cm4gZ2V0UHJvbXB0RmlsZURlZmF1bHRMb2NhdGlvbnModHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0V29ya3NwYWNlRm9sZGVyUm9vdHMoaW5jbHVkZVBhcmVudHM6IGJvb2xlYW4sIGxvZ2dlcj86IExvZ2dlciwgcm9vdD86IFVSSSk6IFByb21pc2U8VVJJW10+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gcm9vdFxuXHRcdFx0PyByb290LnNjaGVtZSA9PT0gQUdFTlRfSE9TVF9TQ0hFTUUgPyBbXSA6IFt7IHVyaTogcm9vdCB9XVxuXHRcdFx0OiB0aGlzLmdldFdvcmtzcGFjZUZvbGRlcnMoKTtcblx0XHRpZiAoaW5jbHVkZVBhcmVudHMpIHtcblx0XHRcdGNvbnN0IHJvb3RzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlRm9sZGVyIG9mIHdvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdFx0cm9vdHMuYWRkKHdvcmtzcGFjZUZvbGRlci51cmkpO1xuXHRcdFx0XHQvLyBXYWxrIHVwIGZyb20gdGhlIHdvcmtzcGFjZSBmb2xkZXIgdG8gZmluZCB0aGUgcmVwb3NpdG9yeSByb290XG5cdFx0XHRcdC8vICguZ2l0IGZvbGRlcikuIE9ubHkgaW5jbHVkZSBwYXJlbnQgZm9sZGVycyBpZiBhIHJlcG8gcm9vdCBpc1xuXHRcdFx0XHQvLyBhY3R1YWxseSBmb3VuZDsgb3RoZXJ3aXNlIGtlZXAgb25seSB0aGUgd29ya3NwYWNlIGZvbGRlci5cblx0XHRcdFx0Y29uc3QgcGFyZW50cyA9IGF3YWl0IHRoaXMuZmluZFBhcmVudFJlcG9Gb2xkZXJzKHdvcmtzcGFjZUZvbGRlci51cmksIHVzZXJIb21lLCByb290cywgbG9nZ2VyKTtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXJlbnQgb2YgcGFyZW50cykge1xuXHRcdFx0XHRcdHJvb3RzLmFkZChwYXJlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnJvb3RzXTtcblx0XHR9XG5cdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlcnMubWFwKGYgPT4gZi51cmkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhbGtzIHVwIGZyb20ge0BsaW5rIGZvbGRlclVyaX0gY29sbGVjdGluZyBwYXJlbnQgZm9sZGVycyB1bnRpbCBhXG5cdCAqIHJlcG9zaXRvcnkgcm9vdCAoYSBmb2xkZXIgY29udGFpbmluZyBgLmdpdGApIGlzIGZvdW5kLiAgUmV0dXJucyB0aGVcblx0ICogaW50ZXJtZWRpYXRlIHBhcmVudCBmb2xkZXJzIG9ubHkgd2hlbiBhIHJlcG8gcm9vdCBpcyBmb3VuZDsgcmV0dXJuc1xuXHQgKiBhbiBlbXB0eSBhcnJheSB3aGVuIHRoZSB3YWxrIHJlYWNoZXMgdGhlIGZpbGVzeXN0ZW0gcm9vdCwgdGhlIHVzZXJcblx0ICogaG9tZSBkaXJlY3RvcnksIG9yIGEgZm9sZGVyIGFscmVhZHkgcHJlc2VudCBpbiB7QGxpbmsgc2Vlbn0uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGZpbmRQYXJlbnRSZXBvRm9sZGVycyhmb2xkZXJVcmk6IFVSSSwgdXNlckhvbWU6IFVSSSwgc2VlbjogUmVzb3VyY2VTZXQsIGxvZ2dlcj86IExvZ2dlcik6IFByb21pc2U8VVJJW10+IHtcblx0XHRjb25zdCBjYW5kaWRhdGVzOiBVUklbXSA9IFtdO1xuXHRcdGxldCBjdXJyZW50ID0gZm9sZGVyVXJpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpc1JlcG9Sb290ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoam9pblBhdGgoY3VycmVudCwgJy5naXQnKSk7XG5cdFx0XHRcdGlmIChpc1JlcG9Sb290KSB7XG5cdFx0XHRcdFx0aWYgKChhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKGN1cnJlbnQpKS50cnVzdGVkKSB7XG5cdFx0XHRcdFx0XHRjYW5kaWRhdGVzLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlcztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bG9nZ2VyPy5sb2dJbmZvKGBSZXBvc2l0b3J5IHJvb3QgZm91bmQgYXQgJHtjdXJyZW50LnRvU3RyaW5nKCl9LCBidXQgaXQgaXMgbm90IHRydXN0ZWQuIFNraXBwaW5nIHBhcmVudCBmb2xkZXIgaW5jbHVzaW9uIGZvciB0aGlzIHdvcmtzcGFjZSBmb2xkZXIuYCk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdOyAvLyBpZiB0aGUgcmVwbyByb290IGlzbid0IHRydXN0ZWQsIGRvbid0IGluY2x1ZGUgaXQgb3IgYW55IHBhcmVudHNcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG5cdFx0XHRcdGxvZ2dlcj8ubG9nSW5mbyhgTm8gcmVwb3NpdG9yeSByb290IGZvdW5kIGZvciBmb2xkZXIgJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0uIEVycm9yIGFjY2Vzc2luZyAke2pvaW5QYXRoKGN1cnJlbnQsICcuZ2l0Jyl9OiAke21zZ30uYCk7XG5cdFx0XHRcdHJldHVybiBbXTsgLy8gaWYgd2UgY2FuJ3QgYWNjZXNzIHRoZSBmb2xkZXIsIHJldHVybiBhbiBlbXB0eSBsaXN0IHRvIGF2b2lkIHRyZWF0aW5nIGl0IGFzIGEgbm9uLXJlcG9zaXRvcnkgd2hlbiB3ZSBtaWdodCBqdXN0IGhhdmUgYSBwZXJtaXNzaW9uIGlzc3VlXG5cdFx0XHR9XG5cdFx0XHRjYW5kaWRhdGVzLnB1c2goY3VycmVudCk7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBkaXJuYW1lKGN1cnJlbnQpO1xuXHRcdFx0Ly8gU3RvcCB3YWxraW5nIHVwIHdoZW4gd2UgcmVhY2ggYSBmaWxlc3lzdGVtIHJvb3QgKGZpeGVkLXBvaW50XG5cdFx0XHQvLyBvZiBkaXJuYW1lLCBlLmcuICcvJyBvciBhIFdpbmRvd3MgZHJpdmUgcm9vdCBsaWtlICdEOlxcJyksXG5cdFx0XHQvLyB0aGUgdXNlciBob21lIGRpcmVjdG9yeSwgb3IgYW4gYWxyZWFkeS1zZWVuIGZvbGRlci5cblx0XHRcdGlmIChpc0VxdWFsKGN1cnJlbnQsIHBhcmVudCkgfHwgY3VycmVudC5wYXRoID09PSAnLycgfHwgaXNFcXVhbCh1c2VySG9tZSwgcGFyZW50KSB8fCBzZWVuLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudCA9IHBhcmVudDtcblx0XHR9XG5cdFx0Ly8gbm8gcmVwbyBmb3VuZFxuXHRcdGxvZ2dlcj8ubG9nSW5mbyhgTm8gcmVwb3NpdG9yeSByb290IGZvdW5kIGZvciBmb2xkZXIgJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0uYCk7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYWxsIHByb21wdCBmaWxlcyBmcm9tIHRoZSBmaWxlc3lzdGVtLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBMaXN0IG9mIHByb21wdCBmaWxlcyBmb3VuZCBpbiB0aGUgd29ya3NwYWNlLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGxpc3RGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcm9vdD86IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHRoaXMubGlzdEZpbGVzV2l0aFNvdXJjZSh0eXBlLCBzdG9yYWdlLCB0b2tlbiwgcm9vdCk7XG5cdFx0cmV0dXJuIGZpbGVzLm1hcChmaWxlID0+IGZpbGUudXJpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBsaXN0RmlsZXNXaXRoU291cmNlKHR5cGU6IFByb21wdHNUeXBlLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCByb290PzogVVJJKTogUHJvbWlzZTxyZWFkb25seSB7IHVyaTogVVJJOyBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UgfVtdPiB7XG5cdFx0aWYgKHN0b3JhZ2UgIT09IFByb21wdHNTdG9yYWdlLnVzZXIgJiYgc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcHJvbXB0IGZpbGUgc3RvcmFnZTogJHtzdG9yYWdlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRMb2NhdGlvbnMgPSB0aGlzLmdldFByb21wdFNvdXJjZUZvbGRlcnModHlwZSk7XG5cdFx0Y29uc3QgbG9jYWxSb290ID0gc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwgPyByb290IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFic29sdXRlTG9jYXRpb25zID0gYXdhaXQgdGhpcy50b0Fic29sdXRlTG9jYXRpb25zKHR5cGUsIGNvbmZpZ3VyZWRMb2NhdGlvbnMuZmlsdGVyKGxvY2F0aW9uID0+IGxvY2F0aW9uLnN0b3JhZ2UgPT09IHN0b3JhZ2UpLCB1bmRlZmluZWQsIGxvY2FsUm9vdCk7XG5cblx0XHRpZiAoc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlciAmJiB0aGlzLmlzVXNlckRhdGFQcm9tcHRUeXBlKHR5cGUpKSB7XG5cdFx0XHRjb25zdCBsb2NhbExvY2F0aW9ucyA9IGF3YWl0IHRoaXMudG9BYnNvbHV0ZUxvY2F0aW9ucyh0eXBlLCBjb25maWd1cmVkTG9jYXRpb25zLmZpbHRlcihsb2NhdGlvbiA9PiBsb2NhdGlvbi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCkpO1xuXHRcdFx0YWJzb2x1dGVMb2NhdGlvbnMucHVzaCguLi5sb2NhbExvY2F0aW9ucy5maWx0ZXIobG9jYXRpb24gPT4gdGhpcy5zb3VyY2VGb2xkZXJPdmVybGFwc1VzZXJEYXRhKHR5cGUsIGxvY2F0aW9uLnNlYXJjaFJvb3QpKSk7XG5cdFx0XHRhYnNvbHV0ZUxvY2F0aW9ucy5wdXNoKHRoaXMudXNlckRhdGFGb2xkZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdGhzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiB7IHVyaTogVVJJOyBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UgfVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHsgc2VhcmNoUm9vdCwgZmlsZVBhdHRlcm4sIHNvdXJjZSwgc3RvcmFnZTogc291cmNlU3RvcmFnZSB9IG9mIGFic29sdXRlTG9jYXRpb25zKSB7XG5cdFx0XHRjb25zdCBmaWxlcyA9IChmaWxlUGF0dGVybiA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0XHQ/IGF3YWl0IHRoaXMucmVzb2x2ZUZpbGVzQXRMb2NhdGlvbihzZWFyY2hSb290LCB0eXBlLCB0b2tlbiwgMCwgbG9jYWxSb290KSAvLyBpZiB0aGUgbG9jYXRpb24gZG9lcyBub3QgY29udGFpbiBhIGdsb2IgcGF0dGVybiwgcmVzb2x2ZSB0aGUgbG9jYXRpb24gZGlyZWN0bHlcblx0XHRcdFx0OiBhd2FpdCB0aGlzLnNlYXJjaEZpbGVzSW5Mb2NhdGlvbihzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgdG9rZW4pO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdGlmIChnZXRQcm9tcHRGaWxlVHlwZShmaWxlKSAhPT0gdHlwZSB8fCBwYXRocy5oYXMoZmlsZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlzVXNlckRhdGFGaWxlID0gdGhpcy5pc1VzZXJEYXRhUHJvbXB0RmlsZSh0eXBlLCBmaWxlKTtcblx0XHRcdFx0aWYgKChpc1VzZXJEYXRhRmlsZSAmJiBzdG9yYWdlICE9PSBQcm9tcHRzU3RvcmFnZS51c2VyKVxuXHRcdFx0XHRcdHx8ICghaXNVc2VyRGF0YUZpbGUgJiYgc291cmNlU3RvcmFnZSAhPT0gc3RvcmFnZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBhdGhzLmFkZChmaWxlKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyB1cmk6IGZpbGUsIHNvdXJjZTogaXNVc2VyRGF0YUZpbGUgPyBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhIDogc291cmNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgaXNVc2VyRGF0YVByb21wdFR5cGUodHlwZTogUHJvbXB0c1R5cGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQgfHwgdHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIHx8IHR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdDtcblx0fVxuXG5cdHByaXZhdGUgaXNVc2VyRGF0YVByb21wdEZpbGUodHlwZTogUHJvbXB0c1R5cGUsIHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc1VzZXJEYXRhUHJvbXB0VHlwZSh0eXBlKSAmJiBpc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHRoaXMudXNlckRhdGFGb2xkZXIudXJpKTtcblx0fVxuXG5cdHByaXZhdGUgc291cmNlRm9sZGVyT3ZlcmxhcHNVc2VyRGF0YSh0eXBlOiBQcm9tcHRzVHlwZSwgc2VhcmNoUm9vdDogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNVc2VyRGF0YVByb21wdFR5cGUodHlwZSlcblx0XHRcdCYmIChpc0VxdWFsT3JQYXJlbnQoc2VhcmNoUm9vdCwgdGhpcy51c2VyRGF0YUZvbGRlci51cmkpIHx8IGlzRXF1YWxPclBhcmVudCh0aGlzLnVzZXJEYXRhRm9sZGVyLnVyaSwgc2VhcmNoUm9vdCkpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUZpbGVzVXBkYXRlZEV2ZW50KHR5cGU6IFByb21wdHNUeXBlKTogeyByZWFkb25seSBldmVudDogRXZlbnQ8dm9pZD47IGRpc3Bvc2U6ICgpID0+IHZvaWQgfSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZXZlbnRFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IHRva2VuID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKS50b2tlbjsgLy8gdHJhY2sgdGhlIGRpc3Bvc2FsIG9mIHRoZSBldmVudCBsaXN0ZW5lcnMgc28gd2UgY2FuIGNhbmNlbCBhbnkgaW4tZmxpZ2h0IGFzeW5jIG9wZXJhdGlvbnMgd2hlbiB0aGUgZXZlbnQgaXMgZGlzcG9zZWRcblxuXHRcdGNvbnN0IGV4dGVybmFsRm9sZGVyV2F0Y2hlcnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBrZXkgPSBnZXRQcm9tcHRGaWxlTG9jYXRpb25zQ29uZmlnS2V5KHR5cGUpO1xuXHRcdGNvbnN0IHVzZXJEYXRhRm9sZGVyID0gdGhpcy51c2VyRGF0YVNlcnZpY2UuY3VycmVudFByb2ZpbGUucHJvbXB0c0hvbWU7XG5cblx0XHRsZXQgcGFyZW50Rm9sZGVyczogcmVhZG9ubHkgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10gPSBbXTtcblxuXHRcdGNvbnN0IHVwZGF0ZUV4dGVybmFsRm9sZGVyV2F0Y2hlcnMgPSAoKSA9PiB7XG5cdFx0XHRleHRlcm5hbEZvbGRlcldhdGNoZXJzLmNsZWFyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBwYXJlbnRGb2xkZXJzKSB7XG5cdFx0XHRcdGlmICghdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyLnNlYXJjaFJvb3QpKSB7XG5cdFx0XHRcdFx0Ly8gaWYgdGhlIGZvbGRlciBpcyBub3QgcGFydCBvZiB0aGUgd29ya3NwYWNlLCB3ZSBuZWVkIHRvIHdhdGNoIGl0XG5cdFx0XHRcdFx0Y29uc3QgcmVjdXJzaXZlID0gZm9sZGVyLmZpbGVQYXR0ZXJuICE9PSB1bmRlZmluZWQgfHwgdHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOyAvLyBpbnN0cnVjdGlvbnMgY2FuIGJlIGluIHN1YmZvbGRlcnMsIHNvIHdhdGNoIHJlY3Vyc2l2ZWx5XG5cdFx0XHRcdFx0ZXh0ZXJuYWxGb2xkZXJXYXRjaGVycy5hZGQodGhpcy5maWxlU2VydmljZS53YXRjaChmb2xkZXIuc2VhcmNoUm9vdCwgeyByZWN1cnNpdmUsIGV4Y2x1ZGVzOiBbXSB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9ucyA9IHRoaXMuZ2V0UHJvbXB0U291cmNlRm9sZGVycyh0eXBlKTtcblx0XHRcdFx0cGFyZW50Rm9sZGVycyA9IGF3YWl0IHRoaXMudG9BYnNvbHV0ZUxvY2F0aW9ucyh0eXBlLCBjb25maWd1cmVkTG9jYXRpb25zLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cGRhdGVFeHRlcm5hbEZvbGRlcldhdGNoZXJzKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB1cGRhdGluZyBwcm9tcHQgZmlsZSB3YXRjaGVycyBhZnRlciBjb25maWcgY2hhbmdlOmAsIGVycik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWdTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGtleSkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MpKSB7XG5cdFx0XHRcdHZvaWQgdXBkYXRlKCk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygpKCgpID0+IHtcblx0XHRcdHZvaWQgdXBkYXRlKCk7XG5cdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMoKCkgPT4ge1xuXHRcdFx0dm9pZCB1cGRhdGUoKTtcblx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzKHVzZXJEYXRhRm9sZGVyKSkge1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFyZW50Rm9sZGVycy5zb21lKGZvbGRlciA9PiBlLmFmZmVjdHMoZm9sZGVyLnNlYXJjaFJvb3QpKSkge1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHVzZXJEYXRhRm9sZGVyKSk7XG5cblx0XHR2b2lkIHVwZGF0ZSgpO1xuXG5cdFx0cmV0dXJuIHsgZXZlbnQ6IGV2ZW50RW1pdHRlci5ldmVudCwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpIH07XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQWdlbnRJbnN0cnVjdGlvbnNVcGRhdGVkRXZlbnQoKTogeyByZWFkb25seSBldmVudDogRXZlbnQ8dm9pZD47IGRpc3Bvc2U6ICgpID0+IHZvaWQgfSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZXZlbnRFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRjb25zdCB0b2tlbiA9IGN0cy50b2tlbjtcblx0XHRjb25zdCB3YXRjaGVycyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHdhdGNoZWRSb290cyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0Y29uc3QgYWRkV2F0Y2ggPSAocmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh3YXRjaGVkUm9vdHMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHdhdGNoZWRSb290cy5hZGQocmVzb3VyY2UpO1xuXHRcdFx0d2F0Y2hlcnMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2gocmVzb3VyY2UpKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlV2F0Y2hlcnMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR3YXRjaGVycy5jbGVhcigpO1xuXHRcdFx0d2F0Y2hlZFJvb3RzLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IHdhdGNoV29ya3NwYWNlUm9vdHMgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfTUQpIHx8IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DTEFVREVfTUQpO1xuXHRcdFx0Y29uc3Qgd2F0Y2hDbGF1ZGVGb2xkZXJzID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NMQVVERV9NRCk7XG5cdFx0XHRjb25zdCB3YXRjaENvcGlsb3RGb2xkZXJzID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NPUElMT1RfSU5TVFJVQ1RJT05fRklMRVMpO1xuXHRcdFx0Y29uc3QgaW5jbHVkZVBhcmVudHMgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TKSA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVJvb3RzID0gYXdhaXQgdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyhpbmNsdWRlUGFyZW50cyk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZVJvb3Qgb2Ygd29ya3NwYWNlUm9vdHMpIHtcblx0XHRcdFx0aWYgKHdhdGNoV29ya3NwYWNlUm9vdHMpIHtcblx0XHRcdFx0XHRhZGRXYXRjaCh3b3Jrc3BhY2VSb290KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAod2F0Y2hDbGF1ZGVGb2xkZXJzKSB7XG5cdFx0XHRcdFx0YWRkV2F0Y2goam9pblBhdGgod29ya3NwYWNlUm9vdCwgQ0xBVURFX0NPTkZJR19GT0xERVIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAod2F0Y2hDb3BpbG90Rm9sZGVycykge1xuXHRcdFx0XHRcdGFkZFdhdGNoKGpvaW5QYXRoKHdvcmtzcGFjZVJvb3QsIEdJVEhVQl9DT05GSUdfRk9MREVSKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHdhdGNoQ2xhdWRlRm9sZGVycykge1xuXHRcdFx0XHRhZGRXYXRjaChqb2luUGF0aCh1c2VySG9tZSwgQ0xBVURFX0NPTkZJR19GT0xERVIpKTtcblx0XHRcdH1cblx0XHRcdGlmICh3YXRjaENvcGlsb3RGb2xkZXJzKSB7XG5cdFx0XHRcdGFkZFdhdGNoKGpvaW5QYXRoKHVzZXJIb21lLCBDT1BJTE9UX0NPTkZJR19GT0xERVIpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmcmVzaCA9ICgpID0+IHtcblx0XHRcdHZvaWQgdXBkYXRlV2F0Y2hlcnMoKTtcblx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX01EKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NMQVVERV9NRCkgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DT1BJTE9UX0lOU1RSVUNUSU9OX0ZJTEVTKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUylcblx0XHRcdCkge1xuXHRcdFx0XHRyZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygpKCgpID0+IHtcblx0XHRcdHJlZnJlc2goKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzKCgpID0+IHtcblx0XHRcdHJlZnJlc2goKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGZvciAoY29uc3Qgd2F0Y2hlZFJvb3Qgb2Ygd2F0Y2hlZFJvb3RzKSB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHMod2F0Y2hlZFJvb3QpKSB7XG5cdFx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHdhdGNoZWRSb290IG9mIHdhdGNoZWRSb290cykge1xuXHRcdFx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KGUucmVzb3VyY2UsIHdhdGNoZWRSb290KSkge1xuXHRcdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ1JFQVRFKSB8fCBlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uTU9WRSkgfHwgZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkNPUFkpKSB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWxPclBhcmVudChlLnRhcmdldC5yZXNvdXJjZSwgd2F0Y2hlZFJvb3QpKSB7XG5cdFx0XHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHZvaWQgdXBkYXRlV2F0Y2hlcnMoKTtcblxuXHRcdHJldHVybiB7IGV2ZW50OiBldmVudEVtaXR0ZXIuZXZlbnQsIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGhvb2sgc291cmNlIGZvbGRlcnMgZm9yIGNyZWF0aW5nIG5ldyBob29rcy5cblx0ICogUmV0dXJucyBjb25maWd1cmVkIGhvb2sgZm9sZGVycywgZXhjbHVkaW5nIENsYXVkZSBwYXRocyAod2hpY2ggYXJlIHJlYWQtb25seSkuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0SG9va1NvdXJjZUZvbGRlcnMoKTogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRMb2NhdGlvbnMgPSB0aGlzLmdldFByb21wdFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuaG9vayk7XG5cblx0XHQvLyBJZ25vcmUgY2xhdWRlIGZvbGRlcnMgc2luY2UgdGhleSBhcmVuJ3QgZmlyc3QtY2xhc3Mgc3VwcG9ydGVkLCBzbyB3ZSBkb24ndCB3YW50IHRvIGNyZWF0ZSBpbnZhbGlkIGZvcm1hdHNcblx0XHQvLyBDaGVjayBmb3IgLmNsYXVkZSBhcyBhbiBhY3R1YWwgcGF0aCBzZWdtZW50IChzdGFydHMgd2l0aCBcIi5jbGF1ZGUvXCIgb3IgY29udGFpbnMgXCIvLmNsYXVkZS9cIilcblx0XHRjb25zdCBhbGxvd2VkSG9va0ZvbGRlcnMgPSBjb25maWd1cmVkTG9jYXRpb25zLmZpbHRlcihsb2MgPT5cblx0XHRcdCFsb2MucGF0aC5zdGFydHNXaXRoKCcuY2xhdWRlLycpICYmICFsb2MucGF0aC5pbmNsdWRlcygnLy5jbGF1ZGUvJylcblx0XHQpO1xuXG5cdFx0Ly8gQ29udmVydCB0byBhYnNvbHV0ZSBsb2NhdGlvbnMgd2l0aCBtZXRhZGF0YVxuXHRcdGNvbnN0IGFic29sdXRlTG9jYXRpb25zID0gYXdhaXQgdGhpcy50b0Fic29sdXRlTG9jYXRpb25zKFByb21wdHNUeXBlLmhvb2ssIGFsbG93ZWRIb29rRm9sZGVycyk7XG5cblx0XHQvLyBEZWR1cGxpY2F0ZSBieSBzZWFyY2ggcm9vdCwga2VlcGluZyB0aGUgZmlyc3Qgb2NjdXJyZW5jZVxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCByZXN1bHQ6IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBsb2NhdGlvbiBvZiBhYnNvbHV0ZUxvY2F0aW9ucykge1xuXHRcdFx0Ly8gRm9yIGhvb2sgY29uZmlncywgZW50cmllcyBhcmUgZGlyZWN0b3JpZXMgdW5sZXNzIHRoZSBwYXRoIGVuZHMgd2l0aCAuanNvbiAoc3BlY2lmaWMgZmlsZSlcblx0XHRcdC8vIERlZmF1bHQgZW50cmllcyBoYXZlIGZpbGVQYXR0ZXJuLCB1c2VyIGVudHJpZXMgZG9uJ3QgYnV0IGFyZSBzdGlsbCBkaXJlY3Rvcmllc1xuXHRcdFx0Ly8gc2VhcmNoUm9vdCBhbHJlYWR5IHBvaW50cyB0byB0aGUgY29ycmVjdCBkaXJlY3Rvcnkgb3Igc3BlY2lmaWMgZmlsZSB0byB1c2UgaW4gYm90aCBjYXNlc1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhsb2NhdGlvbi5zZWFyY2hSb290KSkge1xuXHRcdFx0XHRzZWVuLmFkZChsb2NhdGlvbi5zZWFyY2hSb290KTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyAuLi5sb2NhdGlvbiwgdXJpOiBsb2NhdGlvbi5zZWFyY2hSb290LCBmaWxlUGF0dGVybjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGFsbCBwb3NzaWJsZSB1bmFtYmlndW91cyBwcm9tcHQgZmlsZSBzb3VyY2UgZm9sZGVycyBiYXNlZCBvblxuXHQgKiB0aGUgY3VycmVudCB3b3Jrc3BhY2UgZm9sZGVyIHN0cnVjdHVyZS5cblx0ICpcblx0ICogVGhpcyBtZXRob2QgaXMgY3VycmVudGx5IHByaW1hcmlseSB1c2VkIGJ5IHRoZSBgPiBDcmVhdGUgUHJvbXB0YFxuXHQgKiBjb21tYW5kIHRoYXQgcHJvdmlkZXJzIHVzZXJzIHdpdGggdGhlIGxpc3Qgb2YgZGVzdGluYXRpb24gZm9sZGVyc1xuXHQgKiBmb3IgYSBuZXdseSBjcmVhdGVkIHByb21wdCBmaWxlLiBCZWNhdXNlIHN1Y2ggYSBsaXN0IGNhbm5vdCBjb250YWluXG5cdCAqIHBhdGhzIHRoYXQgaW5jbHVkZSBgZ2xvYiBwYXR0ZXJuYCBpbiB0aGVtLCB3ZSBuZWVkIHRvIHByb2Nlc3MgY29uZmlnXG5cdCAqIHZhbHVlcyBhbmQgdHJ5IHRvIGNyZWF0ZSBhIGxpc3Qgb2YgY2xlYXIgYW5kIHVuYW1iaWd1b3VzIGxvY2F0aW9ucy5cblx0ICpcblx0ICogQHJldHVybnMgTGlzdCBvZiBwb3NzaWJsZSB1bmFtYmlndW91cyBwcm9tcHQgZmlsZSBmb2xkZXJzLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyh0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRjb25zdCBjb25maWd1cmVkTG9jYXRpb25zID0gdGhpcy5nZXRQcm9tcHRTb3VyY2VGb2xkZXJzKHR5cGUpO1xuXHRcdGNvbnN0IGFic29sdXRlTG9jYXRpb25zID0gYXdhaXQgdGhpcy50b0Fic29sdXRlTG9jYXRpb25zKHR5cGUsIGNvbmZpZ3VyZWRMb2NhdGlvbnMpO1xuXG5cdFx0Ly8gRm9yIGFueXRoaW5nIHRoYXQgZG9lc24ndCBzdXBwb3J0IGdsb2IgcGF0dGVybnMsIHdlIGNhbiByZXR1cm5cblx0XHRpZiAodHlwZSAhPT0gUHJvbXB0c1R5cGUucHJvbXB0ICYmIHR5cGUgIT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdFx0cmV0dXJuIGFic29sdXRlTG9jYXRpb25zLm1hcChsID0+IGwudXJpKTtcblx0XHR9XG5cblx0XHQvLyBsb2NhdGlvbnMgaW4gdGhlIHNldHRpbmdzIGNhbiBjb250YWluIGdsb2IgcGF0dGVybnMgc28gd2UgbmVlZFxuXHRcdC8vIHRvIHByb2Nlc3MgdGhlbSB0byBnZXQgXCJjbGVhblwiIHBhdGhzOyB0aGUgZ29hbCBoZXJlIGlzIHRvIGhhdmVcblx0XHQvLyBhIGxpc3Qgb2YgdW5hbWJpZ3VvdXMgZm9sZGVyIHBhdGhzIHdoZXJlIHByb21wdCBmaWxlcyBhcmUgc3RvcmVkXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Zm9yIChjb25zdCBhYnNvbHV0ZUxvY2F0aW9uIG9mIGFic29sdXRlTG9jYXRpb25zKSB7XG5cdFx0XHRsZXQgbG9jYXRpb24gPSBhYnNvbHV0ZUxvY2F0aW9uLnVyaTtcblx0XHRcdGNvbnN0IGJhc2VOYW1lID0gYmFzZW5hbWUobG9jYXRpb24pO1xuXG5cdFx0XHQvLyBpZiBhIHBhdGggZW5kcyB3aXRoIGEgd2VsbC1rbm93biBcImFueSBmaWxlXCIgcGF0dGVybiwgcmVtb3ZlXG5cdFx0XHQvLyBpdCBzbyB3ZSBjYW4gZ2V0IHRoZSBkaXJuYW1lIHBhdGggb2YgdGhhdCBzZXR0aW5nIHZhbHVlXG5cdFx0XHRjb25zdCBmaWxlUGF0dGVybnMgPSBbJyoubWQnLCBgKiR7Z2V0UHJvbXB0RmlsZUV4dGVuc2lvbih0eXBlKX1gXTtcblx0XHRcdGZvciAoY29uc3QgZmlsZVBhdHRlcm4gb2YgZmlsZVBhdHRlcm5zKSB7XG5cdFx0XHRcdGlmIChiYXNlTmFtZSA9PT0gZmlsZVBhdHRlcm4pIHtcblx0XHRcdFx0XHRsb2NhdGlvbiA9IGRpcm5hbWUobG9jYXRpb24pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGxpa2V3aXNlLCBpZiB0aGUgcGF0dGVybiBlbmRzIHdpdGggc2luZ2xlIGAqYCAoYW55IGZpbGUgbmFtZSlcblx0XHRcdC8vIHJlbW92ZSBpdCB0byBnZXQgdGhlIGRpcm5hbWUgcGF0aCBvZiB0aGUgc2V0dGluZyB2YWx1ZVxuXHRcdFx0aWYgKGJhc2VOYW1lID09PSAnKicpIHtcblx0XHRcdFx0bG9jYXRpb24gPSBkaXJuYW1lKGxvY2F0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaWYgYWZ0ZXIgcmVwbGFjaW5nIHRoZSBcImZpbGUgbmFtZVwiIGdsb2IgcGF0dGVybiwgdGhlIHBhdGhcblx0XHRcdC8vIHN0aWxsIGNvbnRhaW5zIGEgZ2xvYiBwYXR0ZXJuLCB0aGVuIGlnbm9yZSB0aGUgcGF0aFxuXHRcdFx0aWYgKGlzVmFsaWRHbG9iKGxvY2F0aW9uLnBhdGgpID09PSB0cnVlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQuYWRkKGxvY2F0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLnJlc3VsdF07XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBhbGwgcmVzb2x2ZWQgc291cmNlIGZvbGRlcnMgZm9yIHRoZSBnaXZlbiBwcm9tcHQgdHlwZSB3aXRoIG1ldGFkYXRhLlxuXHQgKiBUaGlzIG1ldGhvZCBtZXJnZXMgY29uZmlndXJlZCBsb2NhdGlvbnMgd2l0aCBkZWZhdWx0IGxvY2F0aW9ucyBhbmQgcmVzb2x2ZXMgdGhlbVxuXHQgKiB0byBhYnNvbHV0ZSBwYXRocywgaW5jbHVkaW5nIGRpc3BsYXlQYXRoIGFuZCBpc0RlZmF1bHQgaW5mb3JtYXRpb24uXG5cdCAqXG5cdCAqIFRoZSByZXR1cm5lZCBvcmRlciBwcmVmZXJzIHdvcmtzcGFjZSAobG9jYWwpIGZvbGRlcnMgZmlyc3QsIHRoZW4gdXNlciBmb2xkZXJzLlxuXHQgKiBUaGlzIGlzIHVzZWQgZm9yIFVYIGxpa2UgdGhlIFwiQ3JlYXRlIFByb21wdFwiIGNvbW1hbmQgd2hlcmUgd29ya3NwYWNlIGlzIHByZWZlcnJlZC5cblx0ICpcblx0ICogQHBhcmFtIHR5cGUgVGhlIHR5cGUgb2YgcHJvbXB0IGZpbGVzLlxuXHQgKiBAcmV0dXJucyBMaXN0IG9mIHJlc29sdmVkIHNvdXJjZSBmb2xkZXJzIHdpdGggbWV0YWRhdGEuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0UmVzb2x2ZWRTb3VyY2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXT4ge1xuXHRcdGNvbnN0IGFic29sdXRlTG9jYXRpb25zID0gYXdhaXQgdGhpcy5nZXRMb2NhbFN0b3JhZ2VGb2xkZXJzKHR5cGUpO1xuXG5cdFx0Y29uc3QgbG9jYWxGb2xkZXJzID0gYWJzb2x1dGVMb2NhdGlvbnMuZmlsdGVyKGxvYyA9PiBsb2Muc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdGNvbnN0IHVzZXJGb2xkZXJzID0gYWJzb2x1dGVMb2NhdGlvbnMuZmlsdGVyKGxvYyA9PiBsb2Muc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcik7XG5cdFx0cmV0dXJuIHRoaXMuZGVkdXBlU291cmNlRm9sZGVycyhbLi4ubG9jYWxGb2xkZXJzLCAuLi51c2VyRm9sZGVyc10pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgYWxsIHJlc29sdmVkIHNvdXJjZSBmb2xkZXJzIGluIHRoZSBzYW1lIG9yZGVyIHRoYXQgZmlsZSBkaXNjb3Zlcnlcblx0ICogc2VhcmNoZXMgdGhlbSAodXNlciBmb2xkZXJzIGZpcnN0LCB0aGVuIGxvY2FsL3dvcmtzcGFjZSBmb2xkZXJzKS5cblx0ICogVGhpcyBtYXRjaGVzIHRoZSBvcmRlciB1c2VkIGJ5IHtAbGluayBsaXN0RmlsZXN9IGFuZCBzaG91bGQgYmUgdXNlZFxuXHQgKiBmb3IgZGVidWcvZGlhZ25vc3RpYyBvdXRwdXQgc28gdGhlIGRpc3BsYXllZCBvcmRlciBpcyBhY2N1cmF0ZS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZXRTb3VyY2VGb2xkZXJzSW5EaXNjb3ZlcnlPcmRlcih0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8cmVhZG9ubHkgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10+IHtcblx0XHRjb25zdCBhYnNvbHV0ZUxvY2F0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxTdG9yYWdlRm9sZGVycyh0eXBlKTtcblx0XHRjb25zdCB1c2VyRm9sZGVycyA9IGFic29sdXRlTG9jYXRpb25zLmZpbHRlcihsb2MgPT4gbG9jLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdGNvbnN0IGxvY2FsRm9sZGVycyA9IGFic29sdXRlTG9jYXRpb25zLmZpbHRlcihsb2MgPT4gbG9jLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHRyZXR1cm4gdGhpcy5kZWR1cGVTb3VyY2VGb2xkZXJzKFsuLi51c2VyRm9sZGVycywgLi4ubG9jYWxGb2xkZXJzXSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBhbGwgbG9jYWwgKHdvcmtzcGFjZSkgc3RvcmFnZSBmb2xkZXJzIGZvciB0aGUgZ2l2ZW4gcHJvbXB0IHR5cGUuXG5cdCAqIFRoaXMgbWVyZ2VzIGRlZmF1bHQgZm9sZGVycyB3aXRoIGNvbmZpZ3VyZWQgbG9jYXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRMb2NhbFN0b3JhZ2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRMb2NhdGlvbnMgPSB0aGlzLmdldFByb21wdFNvdXJjZUZvbGRlcnModHlwZSk7XG5cdFx0Y29uc3QgZGVmYXVsdEZvbGRlcnMgPSB0aGlzLmdldERlZmF1bHRTb3VyY2VGb2xkZXJzKHR5cGUpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgbG9jYXRpb25zIHNldHRpbmcgaXMgY29uZmlndXJlZCwgYGdldFByb21wdFNvdXJjZUZvbGRlcnMoKWBcblx0XHQvLyBhbHJlYWR5IHJldHVybnMgdGhlIGVuYWJsZWQgZGVmYXVsdHMgcGx1cyBhbnkgY3VzdG9tIGxvY2F0aW9ucyBhbmRcblx0XHQvLyBvbWl0cyBleHBsaWNpdGx5IGRpc2FibGVkIGRlZmF1bHRzOyB1c2UgaXQgZGlyZWN0bHkgc28gYSBkaXNhYmxlZFxuXHRcdC8vIGRlZmF1bHQgKGUuZy4gXCJjaGF0LmFnZW50U2tpbGxzTG9jYXRpb25zXCI6IHsgXCIuZ2l0aHViL3NraWxsc1wiOiBmYWxzZSB9KVxuXHRcdC8vIGRvZXMgbm90IHJlYXBwZWFyLiBPbmx5IGZhbGwgYmFjayB0byB0aGUgcmF3IGRlZmF1bHRzIHdoZW4gdGhlIHNldHRpbmdcblx0XHQvLyBpcyB1bnNldCAoaW4gd2hpY2ggY2FzZSBgZ2V0UHJvbXB0U291cmNlRm9sZGVycygpYCByZXR1cm5zIGFuIGVtcHR5IGxpc3QpLlxuXHRcdGNvbnN0IGlzQ29uZmlndXJlZCA9IFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUodGhpcy5jb25maWdTZXJ2aWNlLCB0eXBlKSAhPT0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFsbEZvbGRlcnMgPSBpc0NvbmZpZ3VyZWQgPyBjb25maWd1cmVkTG9jYXRpb25zIDogZGVmYXVsdEZvbGRlcnM7XG5cblx0XHRjb25zdCBhYnNvbHV0ZUxvY2F0aW9ucyA9IGF3YWl0IHRoaXMudG9BYnNvbHV0ZUxvY2F0aW9ucyh0eXBlLCBhbGxGb2xkZXJzLCBkZWZhdWx0Rm9sZGVycyk7XG5cdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50IHx8IHR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB8fCB0eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpIHtcblx0XHRcdGFic29sdXRlTG9jYXRpb25zLnB1c2godGhpcy51c2VyRGF0YUZvbGRlcik7XG5cdFx0fVxuXHRcdHJldHVybiBhYnNvbHV0ZUxvY2F0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKiBEZWR1cGxpY2F0ZXMgc291cmNlIGZvbGRlcnMgYnkgVVJJLlxuXHQgKi9cblx0cHJpdmF0ZSBkZWR1cGVTb3VyY2VGb2xkZXJzKGZvbGRlcnM6IHJlYWRvbmx5IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdKTogSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10ge1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCByZXN1bHQ6IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZm9sZGVycykge1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhmb2xkZXIudXJpKSkge1xuXHRcdFx0XHRzZWVuLmFkZChmb2xkZXIudXJpKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goZm9sZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBsb2NhdGlvbnMgZGVmaW5lZCBpbiBgc2V0dGluZ3NgIHRvIGFic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCBVUklzIHdpdGggbWV0YWRhdGEuXG5cdCAqIFRoaXMgY29udmVyc2lvbiBpcyBuZWVkZWQgYmVjYXVzZSBsb2NhdGlvbnMgaW4gc2V0dGluZ3MgY2FuIGJlIHJlbGF0aXZlLFxuXHQgKiBoZW5jZSB3ZSBuZWVkIHRvIHJlc29sdmUgdGhlbSBiYXNlZCBvbiB0aGUgY3VycmVudCB3b3Jrc3BhY2UgZm9sZGVycy5cblx0ICogSWYgdXNlckhvbWUgaXMgcHJvdmlkZWQsIHBhdGhzIHN0YXJ0aW5nIHdpdGggYH5gIHdpbGwgYmUgZXhwYW5kZWQuIE90aGVyd2lzZSB0aGVzZSBwYXRocyBhcmUgaWdub3JlZC5cblx0ICogUHJlc2VydmVzIHRoZSB0eXBlIGFuZCBsb2NhdGlvbiBwcm9wZXJ0aWVzIGZyb20gdGhlIHNvdXJjZSBmb2xkZXIgZGVmaW5pdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHRvQWJzb2x1dGVMb2NhdGlvbnModHlwZTogUHJvbXB0c1R5cGUsIGNvbmZpZ3VyZWRMb2NhdGlvbnM6IHJlYWRvbmx5IElQcm9tcHRTb3VyY2VGb2xkZXJbXSwgZGVmYXVsdExvY2F0aW9ucz86IHJlYWRvbmx5IElQcm9tcHRTb3VyY2VGb2xkZXJbXSwgcm9vdD86IFVSSSk6IFByb21pc2U8SVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdID0gW107XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0Y29uc3Qgcm9vdEZvbGRlcnMgPSBhd2FpdCB0aGlzLmdldFdvcmtzcGFjZUZvbGRlclJvb3RzKHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MpID09PSB0cnVlLCB1bmRlZmluZWQsIHJvb3QpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2V0IG9mIGRlZmF1bHQgcGF0aHMgZm9yIHF1aWNrIGxvb2t1cFxuXHRcdGNvbnN0IGRlZmF1bHRQYXRocyA9IG5ldyBTZXQoZGVmYXVsdExvY2F0aW9ucz8ubWFwKGxvYyA9PiBsb2MucGF0aCkpO1xuXG5cdFx0Ly8gRmlsdGVyIGFuZCB2YWxpZGF0ZSBza2lsbCBwYXRocyBiZWZvcmUgcmVzb2x2aW5nXG5cdFx0Y29uc3QgdmFsaWRMb2NhdGlvbnMgPSBjb25maWd1cmVkTG9jYXRpb25zLmZpbHRlcihzb3VyY2VGb2xkZXIgPT4ge1xuXHRcdFx0Ly8gVE9ETzogZGVwcmVjYXRlIGdsb2IgcGF0dGVybnMgZm9yIHByb21wdHMgYW5kIGluc3RydWN0aW9ucyBpbiB0aGUgZnV0dXJlXG5cdFx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIHx8IHR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdFx0XHRjb25zdCBwYXRoID0gc291cmNlRm9sZGVyLnBhdGg7XG5cdFx0XHRcdGlmIChoYXNHbG9iUGF0dGVybihwYXRoKSkge1xuXHRcdFx0XHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbRGVwcmVjYXRlZF0gR2xvYiBwYXR0ZXJucyAoKiBhbmQgKiopIGluIHByb21wdCBmaWxlIGxvY2F0aW9ucyBhcmUgZGVwcmVjYXRlZDogXCIke3BhdGh9XCIuIENvbnNpZGVyIHVzaW5nIGV4cGxpY2l0IHBhdGhzIGluc3RlYWQuYCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBHbG9iIHBhdHRlcm5zICgqIGFuZCAqKikgZGV0ZWN0ZWQgaW4gaW5zdHJ1Y3Rpb24gZmlsZSBsb2NhdGlvbjogXCIke3BhdGh9XCIuIENvbnNpZGVyIHVzaW5nIGV4cGxpY2l0IHBhdGhzIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2UuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9uID0gc291cmNlRm9sZGVyLnBhdGg7XG5cdFx0XHRpZiAoIWlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKGNvbmZpZ3VyZWRMb2NhdGlvbikpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFNraXBwaW5nIGludmFsaWQgcGF0aCAoZ2xvYiBwYXR0ZXJucyBhbmQgYWJzb2x1dGUgcGF0aHMgbm90IHN1cHBvcnRlZCk6ICR7Y29uZmlndXJlZExvY2F0aW9ufWApO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3Qgc291cmNlRm9sZGVyIG9mIHZhbGlkTG9jYXRpb25zKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkTG9jYXRpb24gPSBzb3VyY2VGb2xkZXIucGF0aDtcblx0XHRcdGNvbnN0IGlzRGVmYXVsdCA9IGRlZmF1bHRQYXRocz8uaGFzKGNvbmZpZ3VyZWRMb2NhdGlvbik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBIYW5kbGUgdGlsZGUgcGF0aHMgd2hlbiB1c2VySG9tZSBpcyBwcm92aWRlZFxuXHRcdFx0XHRpZiAoaXNUaWxkZVBhdGgoY29uZmlndXJlZExvY2F0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IGpvaW5QYXRoKHVzZXJIb21lLCBjb25maWd1cmVkTG9jYXRpb24uc3Vic3RyaW5nKDIpKTtcblx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKHVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCB7IHNlYXJjaFJvb3QsIGZpbGVQYXR0ZXJuIH0gPSByZXNvbHZlU2VhcmNoTG9jYXRpb24odHlwZSwgdXJpKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpLCBzZWFyY2hSb290OiBzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgc291cmNlOiBzb3VyY2VGb2xkZXIuc291cmNlLCBzdG9yYWdlOiBzb3VyY2VGb2xkZXIuc3RvcmFnZSwgZGlzcGxheVBhdGg6IGNvbmZpZ3VyZWRMb2NhdGlvbiwgaXNEZWZhdWx0IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc0Fic29sdXRlKGNvbmZpZ3VyZWRMb2NhdGlvbikpIHtcblx0XHRcdFx0XHRsZXQgdXJpID0gVVJJLmZpbGUoY29uZmlndXJlZExvY2F0aW9uKTtcblx0XHRcdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0Ly8gaWYgdGhlIGxvY2F0aW9uIGlzIGFic29sdXRlIGFuZCB3ZSBhcmUgaW4gYSByZW1vdGUgZW52aXJvbm1lbnQsXG5cdFx0XHRcdFx0XHQvLyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gYSBmaWxlIFVSSSB3aXRoIHRoZSByZW1vdGUgYXV0aG9yaXR5XG5cdFx0XHRcdFx0XHR1cmkgPSB1cmkud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVSZW1vdGUsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKHVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCB7IHNlYXJjaFJvb3QsIGZpbGVQYXR0ZXJuIH0gPSByZXNvbHZlU2VhcmNoTG9jYXRpb24odHlwZSwgdXJpKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpLCBzZWFyY2hSb290OiBzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgc291cmNlOiBzb3VyY2VGb2xkZXIuc291cmNlLCBzdG9yYWdlOiBzb3VyY2VGb2xkZXIuc3RvcmFnZSwgZGlzcGxheVBhdGg6IGNvbmZpZ3VyZWRMb2NhdGlvbiwgaXNEZWZhdWx0IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiByb290Rm9sZGVycykge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWJzb2x1dGVQYXRoID0gam9pblBhdGgoZm9sZGVyLCBjb25maWd1cmVkTG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhhYnNvbHV0ZVBhdGgpKSB7XG5cdFx0XHRcdFx0XHRcdHNlZW4uYWRkKGFic29sdXRlUGF0aCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgc2VhcmNoUm9vdCwgZmlsZVBhdHRlcm4gfSA9IHJlc29sdmVTZWFyY2hMb2NhdGlvbih0eXBlLCBhYnNvbHV0ZVBhdGgpO1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogYWJzb2x1dGVQYXRoLCBzZWFyY2hSb290OiBzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgc291cmNlOiBzb3VyY2VGb2xkZXIuc291cmNlLCBzdG9yYWdlOiBzb3VyY2VGb2xkZXIuc3RvcmFnZSwgZGlzcGxheVBhdGg6IGNvbmZpZ3VyZWRMb2NhdGlvbiwgaXNEZWZhdWx0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcmVzb2x2ZSBwcm9tcHQgZmlsZSBsb2NhdGlvbjogJHtjb25maWd1cmVkTG9jYXRpb259YCwgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogVXNlcyB0aGUgZmlsZSBzZXJ2aWNlIHRvIHJlc29sdmUgdGhlIHByb3ZpZGVkIGxvY2F0aW9uIGFuZCByZXR1cm4gZWl0aGVyIHRoZSBmaWxlIGF0IHRoZSBsb2NhdGlvbiBvZiBmaWxlcyBpbiB0aGUgZGlyZWN0b3J5LlxuXHQgKiBGb3IgaW5zdHJ1Y3Rpb24gZm9sZGVycywgdGhpcyBzZWFyY2hlcyByZWN1cnNpdmVseSAodXAgdG8ge0BsaW5rIE1BWF9JTlNUUlVDVElPTlNfUkVDVVJTSU9OX0RFUFRIfSBsZXZlbHMgZGVlcCkgcHJvdmlkZWRcblx0ICogdGhlIGxvY2F0aW9uIGlzIG5vdCBhIHdvcmtzcGFjZSBmb2xkZXIgcm9vdCBhbmQgZG9lcyBub3QgY29udGFpbiB3aWxkY2FyZHMsIHRvIHN1cHBvcnQgc3ViZGlyZWN0b3JpZXMgd2hpbGUgYXZvaWRpbmdcblx0ICogYWNjaWRlbnRhbGx5IGJyb2FkIHRyYXZlcnNhbC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZpbGVzQXRMb2NhdGlvbihsb2NhdGlvbjogVVJJLCB0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBkZXB0aDogbnVtYmVyID0gMCwgcm9vdD86IFVSSSk6IFByb21pc2U8VVJJW10+IHtcblx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbmRBZ2VudFNraWxsc0luRm9sZGVyKGxvY2F0aW9uLCB0b2tlbik7XG5cdFx0fVxuXHRcdC8vIFJlY3Vyc2UgaW50byBzdWJkaXJlY3RvcmllcyBmb3IgaW5zdHJ1Y3Rpb24gZm9sZGVycywgYnV0IG9ubHkgaWY6XG5cdFx0Ly8gLSB0aGUgbG9jYXRpb24gaXMgbm90IGEgd29ya3NwYWNlIGZvbGRlciByb290ICh0byBhdm9pZCBmdWxsIHdvcmtzcGFjZSB0cmF2ZXJzYWwpXG5cdFx0Ly8gLSB0aGUgcGF0aCBkb2VzIG5vdCBjb250YWluIHdpbGRjYXJkcyAoYWxyZWFkeSBmaWx0ZXJlZCB1cHN0cmVhbSwgYnV0IGd1YXJkIGhlcmUgdG9vKVxuXHRcdC8vIC0gdGhlIHJlY3Vyc2lvbiBkZXB0aCBoYXNuJ3QgZXhjZWVkZWQgdGhlIGxpbWl0XG5cdFx0Y29uc3QgaXNXb3Jrc3BhY2VSb290ID0gZGVwdGggPT09IDAgJiYgKHJvb3QgPyBpc0VxdWFsKHJvb3QsIGxvY2F0aW9uKSA6IHRoaXMuZ2V0V29ya3NwYWNlRm9sZGVycygpLnNvbWUoZiA9PiBpc0VxdWFsKGYudXJpLCBsb2NhdGlvbikpKTtcblx0XHRjb25zdCByZWN1cnNpdmUgPSB0eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNcblx0XHRcdCYmICFpc1dvcmtzcGFjZVJvb3Rcblx0XHRcdCYmICFoYXNHbG9iUGF0dGVybihsb2NhdGlvbi5wYXRoKVxuXHRcdFx0JiYgZGVwdGggPCBNQVhfSU5TVFJVQ1RJT05TX1JFQ1VSU0lPTl9ERVBUSDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShsb2NhdGlvbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluZm8uaXNGaWxlKSB7XG5cdFx0XHRcdHJldHVybiBbaW5mby5yZXNvdXJjZV07XG5cdFx0XHR9IGVsc2UgaWYgKGluZm8uaXNEaXJlY3RvcnkgJiYgaW5mby5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IFVSSVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgaW5mby5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHJlY3Vyc2l2ZSAmJiBjaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0Ly8gUmVjdXJzaXZlbHkgc2VhcmNoIHN1YmRpcmVjdG9yaWVzIGZvciBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHRcdGNvbnN0IHN1YkZpbGVzID0gYXdhaXQgdGhpcy5yZXNvbHZlRmlsZXNBdExvY2F0aW9uKGNoaWxkLnJlc291cmNlLCB0eXBlLCB0b2tlbiwgZGVwdGggKyAxLCByb290KTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKC4uLnN1YkZpbGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byByZXNvbHZlIGZpbGVzIGF0IGxvY2F0aW9uOiAke2xvY2F0aW9uLnRvU3RyaW5nKCl9YCwgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVc2VzIHRoZSBzZWFyY2ggc2VydmljZSB0byBmaW5kIGFsbCBmaWxlcyBhdCB0aGUgcHJvdmlkZWQgbG9jYXRpb24uXG5cdCAqIFJlcXVpcmVzIGEgRmlsZVNlYXJjaFByb3ZpZGVyIHRvIGJlIGF2YWlsYWJsZSBmb3IgdGhlIGZvbGRlcidzIHNjaGVtZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgc2VhcmNoRmlsZXNJbkxvY2F0aW9uKGZvbGRlcjogVVJJLCBmaWxlUGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0Ly8gQ2hlY2sgaWYgYSBGaWxlU2VhcmNoUHJvdmlkZXIgaXMgYXZhaWxhYmxlIGZvciB0aGlzIHNjaGVtZVxuXHRcdGlmICghdGhpcy5zZWFyY2hTZXJ2aWNlLnNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcihmb2xkZXIuc2NoZW1lKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtQcm9tcHRGaWxlc0xvY2F0b3JdIE5vIEZpbGVTZWFyY2hQcm92aWRlciBhdmFpbGFibGUgZm9yIHNjaGVtZSAnJHtmb2xkZXIuc2NoZW1lfScuIENhbm5vdCBzZWFyY2ggZm9yIHBhdHRlcm4gJyR7ZmlsZVBhdHRlcm59JyBpbiAke2ZvbGRlci50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3JlZ2FyZElnbm9yZUZpbGVzID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdleHBsb3Jlci5leGNsdWRlR2l0SWdub3JlJyk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyKTtcblxuXHRcdGNvbnN0IGdldEV4Y2x1ZGVQYXR0ZXJuID0gKGZvbGRlcjogVVJJKSA9PiBnZXRFeGNsdWRlcyh0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IGZvbGRlciB9KSkgfHwge307XG5cdFx0Y29uc3Qgc2VhcmNoT3B0aW9uczogSUZpbGVRdWVyeSA9IHtcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7IGZvbGRlciwgZGlzcmVnYXJkSWdub3JlRmlsZXMgfV0sXG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdHNob3VsZEdsb2JNYXRjaEZpbGVQYXR0ZXJuOiB0cnVlLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHdvcmtzcGFjZVJvb3QgPyBnZXRFeGNsdWRlUGF0dGVybih3b3Jrc3BhY2VSb290LnVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRpZ25vcmVHbG9iQ2FzZTogdHJ1ZSxcblx0XHRcdHNvcnRCeVNjb3JlOiB0cnVlLFxuXHRcdFx0ZmlsZVBhdHRlcm5cblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlYXJjaFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKHNlYXJjaE9wdGlvbnMsIHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2VhcmNoUmVzdWx0LnJlc3VsdHMubWFwKHIgPT4gci5yZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGxpc3Qgb2YgYEFHRU5UUy5tZGAgZmlsZXMgYW55d2hlcmUgaW4gdGhlIHdvcmtzcGFjZS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBmaW5kQWdlbnRNRHNJbldvcmtzcGFjZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudEluc3RydWN0aW9uRmlsZVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkubWFwKGZvbGRlciA9PiB0aGlzLmZpbmRBZ2VudE1Ec0luRm9sZGVyKGZvbGRlci51cmksIHRva2VuKSkpO1xuXHRcdHJldHVybiByZXN1bHQuZmxhdCgxKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmluZEFnZW50TURzSW5Gb2xkZXIoZm9sZGVyOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10+IHtcblx0XHQvLyBDaGVjayBpZiBhIEZpbGVTZWFyY2hQcm92aWRlciBpcyBhdmFpbGFibGUgZm9yIHRoaXMgc2NoZW1lXG5cdFx0aWYgKHRoaXMuc2VhcmNoU2VydmljZS5zY2hlbWVIYXNGaWxlU2VhcmNoUHJvdmlkZXIoZm9sZGVyLnNjaGVtZSkpIHtcblx0XHRcdC8vIFVzZSB0aGUgc2VhcmNoIHNlcnZpY2UgaWYgYSBGaWxlU2VhcmNoUHJvdmlkZXIgaXMgYXZhaWxhYmxlXG5cdFx0XHRjb25zdCBkaXNyZWdhcmRJZ25vcmVGaWxlcyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZXhwbG9yZXIuZXhjbHVkZUdpdElnbm9yZScpO1xuXHRcdFx0Y29uc3QgZ2V0RXhjbHVkZVBhdHRlcm4gPSAoZm9sZGVyOiBVUkkpID0+IGdldEV4Y2x1ZGVzKHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oeyByZXNvdXJjZTogZm9sZGVyIH0pKSB8fCB7fTtcblx0XHRcdGNvbnN0IHNlYXJjaE9wdGlvbnM6IElGaWxlUXVlcnkgPSB7XG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7IGZvbGRlciwgZGlzcmVnYXJkSWdub3JlRmlsZXMgfV0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0XHRzaG91bGRHbG9iTWF0Y2hGaWxlUGF0dGVybjogdHJ1ZSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IGdldEV4Y2x1ZGVQYXR0ZXJuKGZvbGRlciksXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnKiovQUdFTlRTLm1kJyxcblx0XHRcdFx0aWdub3JlR2xvYkNhc2U6IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZWFyY2hSZXN1bHQgPSBhd2FpdCB0aGlzLnNlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaChzZWFyY2hPcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBSZXNvbHZlIHJlYWwgcGF0aHMgZm9yIGR1cGxpY2F0ZSBkZXRlY3Rpb25cblx0XHRcdFx0Y29uc3QgcmVzdWx0czogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHNlYXJjaFJlc3VsdC5yZXN1bHRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhbFBhdGggPSB1bmRlZmluZWQ7IC8vIFdlIGNhbiBza2lwIHJlYWxwYXRoIHJlc29sdXRpb24gaGVyZSBmb3IgcGVyZm9ybWFuY2U7IGR1cGxpY2F0ZXMgY2FuIGJlIGhhbmRsZWQgbGF0ZXIgaWYgbmVlZGVkXG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHsgdXJpOiByLnJlc291cmNlLCByZWFsUGF0aCwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmFnZW50c01kIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHRzO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZhbGxiYWNrIHRvIHJlY3Vyc2l2ZSB0cmF2ZXJzYWwgdXNpbmcgZmlsZSBzZXJ2aWNlXG5cdFx0XHRyZXR1cm4gdGhpcy5maW5kQWdlbnRNRHNVc2luZ0ZpbGVTZXJ2aWNlKGZvbGRlciwgdG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYSBmb2xkZXIgdXNpbmcgdGhlIGZpbGUgc2VydmljZSB0byBmaW5kIEFHRU5UUy5tZCBmaWxlcy5cblx0ICogVGhpcyBpcyB1c2VkIGFzIGEgZmFsbGJhY2sgd2hlbiBubyBGaWxlU2VhcmNoUHJvdmlkZXIgaXMgYXZhaWxhYmxlIGZvciB0aGUgc2NoZW1lLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBmaW5kQWdlbnRNRHNVc2luZ0ZpbGVTZXJ2aWNlKGZvbGRlcjogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudEluc3RydWN0aW9uRmlsZVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSA9IFtdO1xuXHRcdGNvbnN0IGFnZW50c01kRmlsZU5hbWUgPSAnYWdlbnRzLm1kJztcblxuXHRcdGNvbnN0IHRyYXZlcnNlID0gYXN5bmMgKHVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHVyaSk7XG5cdFx0XHRcdGlmIChzdGF0LmlzRmlsZSAmJiBzdGF0Lm5hbWUudG9Mb3dlckNhc2UoKSA9PT0gYWdlbnRzTWRGaWxlTmFtZSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlYWxQYXRoID0gc3RhdC5pc1N5bWJvbGljTGluayA/IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhbHBhdGgoc3RhdC5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyB1cmk6IHN0YXQucmVzb3VyY2UsIHJlYWxQYXRoLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuYWdlbnRzTWQgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSAmJiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Ly8gUmVjdXJzaXZlbHkgdHJhdmVyc2Ugc3ViZGlyZWN0b3JpZXNcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRyYXZlcnNlKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMgZm9yIGluZGl2aWR1YWwgZmlsZXMvZm9sZGVycyAoZS5nLiwgcGVybWlzc2lvbiBkZW5pZWQpXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Byb21wdEZpbGVzTG9jYXRvcl0gRXJyb3IgdHJhdmVyc2luZyAke3VyaS50b1N0cmluZygpfTogJHtlcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgdHJhdmVyc2UoZm9sZGVyKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblxuXG5cdHB1YmxpYyBhc3luYyBmaW5kRmlsZXNJblJvb3RzKHJvb3RzOiBVUklbXSwgZm9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhdGhzOiBJV29ya3NwYWNlSW5zdHJ1Y3Rpb25GaWxlW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcmVzdWx0OiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSA9IFtdKTogUHJvbWlzZTxJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXT4ge1xuXHRcdGNvbnN0IHRvUmVzb2x2ZSA9IHJvb3RzLm1hcChyb290ID0+ICh7IHJlc291cmNlOiBmb2xkZXIgIT09IHVuZGVmaW5lZCA/IGpvaW5QYXRoKHJvb3QsIGZvbGRlcikgOiByb290IH0pKTtcblx0XHRjb25zdCByZXNvbHZlZFJvb3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlQWxsKHRvUmVzb2x2ZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHJvb3Qgb2YgcmVzb2x2ZWRSb290cykge1xuXHRcdFx0aWYgKHJvb3Quc3VjY2VzcyAmJiByb290LnN0YXQ/LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygcm9vdC5zdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKGNoaWxkLmlzRmlsZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdQYXRoID0gcGF0aHMuZmluZChwID0+IGVxdWFsc0lnbm9yZUNhc2UocC5maWxlTmFtZSwgY2hpbGQubmFtZSkpO1xuXHRcdFx0XHRcdFx0aWYgKG1hdGNoaW5nUGF0aCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWFsUGF0aCA9IGNoaWxkLmlzU3ltYm9saWNMaW5rID8gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFscGF0aChjaGlsZC5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiBjaGlsZC5yZXNvdXJjZSwgcmVhbFBhdGgsIHR5cGU6IG1hdGNoaW5nUGF0aC50eXBlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldEFnZW50RmlsZVVSSUZyb21Nb2RlRmlsZShvbGRVUkk6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG9sZFVSSS5wYXRoLmVuZHNXaXRoKExFR0FDWV9NT0RFX0ZJTEVfRVhURU5TSU9OKSkge1xuXHRcdFx0bGV0IG5ld0xvY2F0aW9uO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXIob2xkVVJJKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0bmV3TG9jYXRpb24gPSBqb2luUGF0aCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBBR0VOVFNfU09VUkNFX0ZPTERFUiwgZ2V0Q2xlYW5Qcm9tcHROYW1lKG9sZFVSSSkgKyBBR0VOVF9GSUxFX0VYVEVOU0lPTik7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRXF1YWxPclBhcmVudChvbGRVUkksIHRoaXMudXNlckRhdGFTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnByb21wdHNIb21lKSkge1xuXHRcdFx0XHRuZXdMb2NhdGlvbiA9IGpvaW5QYXRoKHRoaXMudXNlckRhdGFTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnByb21wdHNIb21lLCBnZXRDbGVhblByb21wdE5hbWUob2xkVVJJKSArIEFHRU5UX0ZJTEVfRVhURU5TSU9OKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXdMb2NhdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmluZEFnZW50U2tpbGxzSW5Gb2xkZXIodXJpOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBVUklbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh1cmkpO1xuXHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkgJiYgc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHQvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZSBzdWJkaXJlY3Rvcmllc1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBza2lsbEZpbGUgPSBqb2luUGF0aChjaGlsZC5yZXNvdXJjZSwgU0tJTExfRklMRU5BTUUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBza2lsbFN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoc2tpbGxGaWxlKTtcblx0XHRcdFx0XHRcdFx0aWYgKHNraWxsU3RhdC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChza2lsbFN0YXQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMgZm9yIGluZGl2aWR1YWwgZmlsZXMvZm9sZGVycyAoZS5nLiwgcGVybWlzc2lvbiBkZW5pZWQpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtQcm9tcHRGaWxlc0xvY2F0b3JdIEVycm9yIHNlYXJjaGluZyBmb3Igc2tpbGxzIGluICR7dXJpLnRvU3RyaW5nKCl9OiAke2V9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlYXJjaGVzIGZvciBza2lsbHMgaW4gYWxsIGNvbmZpZ3VyZWQgbG9jYXRpb25zLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGZpbmRBZ2VudFNraWxscyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcm9tcHRQYXRoW10+IHtcblx0XHRjb25zdCBjb25maWd1cmVkTG9jYXRpb25zID0gdGhpcy5nZXRQcm9tcHRTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRjb25zdCBhYnNvbHV0ZUxvY2F0aW9ucyA9IGF3YWl0IHRoaXMudG9BYnNvbHV0ZUxvY2F0aW9ucyhQcm9tcHRzVHlwZS5za2lsbCwgY29uZmlndXJlZExvY2F0aW9ucyk7XG5cdFx0Y29uc3QgYWxsUmVzdWx0czogSVByb21wdFBhdGhbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IHVyaSwgc291cmNlLCBzdG9yYWdlIH0gb2YgYWJzb2x1dGVMb2NhdGlvbnMpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5maW5kQWdlbnRTa2lsbHNJbkZvbGRlcih1cmksIHRva2VuKTtcblx0XHRcdGZvciAoY29uc3Qgc2tpbGxVcmkgb2YgcmVzdWx0cykge1xuXHRcdFx0XHRhbGxSZXN1bHRzLnB1c2goeyB1cmk6IHNraWxsVXJpLCBzb3VyY2UsIHN0b3JhZ2UsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBhbGxSZXN1bHRzO1xuXHR9XG59XG5cblxuLyoqXG4gKiBDaGVja3MgaWYgdGhlIHByb3ZpZGVkIHBhdGggY29udGFpbnMgYSBnbG9iIHBhdHRlcm4gKCogb3IgKiopLlxuICogVXNlZCB0byBkZXRlY3QgZGVwcmVjYXRlZCBnbG9iIHVzYWdlIGluIHByb21wdCBmaWxlIGxvY2F0aW9ucy5cbiAqXG4gKiBAcGFyYW0gcGF0aCAtIHBhdGggdG8gY2hlY2tcbiAqIEByZXR1cm5zIGB0cnVlYCBpZiB0aGUgcGF0aCBjb250YWlucyBgKmAgb3IgYCoqYCwgYGZhbHNlYCBvdGhlcndpc2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc0dsb2JQYXR0ZXJuKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGF0aC5pbmNsdWRlcygnKicpO1xufVxuXG5cbi8qKlxuICogQ2hlY2tzIGlmIHRoZSBwcm92aWRlZCBgcGF0dGVybmAgY291bGQgYmUgYSB2YWxpZCBnbG9iIHBhdHRlcm4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkR2xvYihwYXR0ZXJuOiBzdHJpbmcpOiBib29sZWFuIHtcblx0bGV0IHNxdWFyZUJyYWNrZXRzID0gZmFsc2U7XG5cdGxldCBzcXVhcmVCcmFja2V0c0NvdW50ID0gMDtcblxuXHRsZXQgY3VybHlCcmFja2V0cyA9IGZhbHNlO1xuXHRsZXQgY3VybHlCcmFja2V0c0NvdW50ID0gMDtcblxuXHRsZXQgcHJldmlvdXNDaGFyYWN0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBjaGFyIG9mIHBhdHRlcm4pIHtcblx0XHQvLyBza2lwIGFsbCBlc2NhcGVkIGNoYXJhY3RlcnNcblx0XHRpZiAocHJldmlvdXNDaGFyYWN0ZXIgPT09ICdcXFxcJykge1xuXHRcdFx0cHJldmlvdXNDaGFyYWN0ZXIgPSBjaGFyO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXIgPT09ICcqJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXIgPT09ICc/Jykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXIgPT09ICdbJykge1xuXHRcdFx0c3F1YXJlQnJhY2tldHMgPSB0cnVlO1xuXHRcdFx0c3F1YXJlQnJhY2tldHNDb3VudCsrO1xuXG5cdFx0XHRwcmV2aW91c0NoYXJhY3RlciA9IGNoYXI7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoY2hhciA9PT0gJ10nKSB7XG5cdFx0XHRzcXVhcmVCcmFja2V0cyA9IHRydWU7XG5cdFx0XHRzcXVhcmVCcmFja2V0c0NvdW50LS07XG5cdFx0XHRwcmV2aW91c0NoYXJhY3RlciA9IGNoYXI7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoY2hhciA9PT0gJ3snKSB7XG5cdFx0XHRjdXJseUJyYWNrZXRzID0gdHJ1ZTtcblx0XHRcdGN1cmx5QnJhY2tldHNDb3VudCsrO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXIgPT09ICd9Jykge1xuXHRcdFx0Y3VybHlCcmFja2V0cyA9IHRydWU7XG5cdFx0XHRjdXJseUJyYWNrZXRzQ291bnQtLTtcblx0XHRcdHByZXZpb3VzQ2hhcmFjdGVyID0gY2hhcjtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdHByZXZpb3VzQ2hhcmFjdGVyID0gY2hhcjtcblx0fVxuXG5cdC8vIGlmIHNxdWFyZSBicmFja2V0cyBleGlzdCBhbmQgYXJlIGluIHBhaXJzLCB0aGlzIGlzIGEgYHZhbGlkIGdsb2JgXG5cdGlmIChzcXVhcmVCcmFja2V0cyAmJiAoc3F1YXJlQnJhY2tldHNDb3VudCA9PT0gMCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIGlmIGN1cmx5IGJyYWNrZXRzIGV4aXN0IGFuZCBhcmUgaW4gcGFpcnMsIHRoaXMgaXMgYSBgdmFsaWQgZ2xvYmBcblx0aWYgKGN1cmx5QnJhY2tldHMgJiYgKGN1cmx5QnJhY2tldHNDb3VudCA9PT0gMCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuaW50ZXJmYWNlIElTZWFyY2hMb2NhdGlvblJlc3VsdCB7XG5cdHJlYWRvbmx5IHNlYXJjaFJvb3Q6IFVSSTtcblx0cmVhZG9ubHkgZmlsZVBhdHRlcm4/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHNlYXJjaCByb290IGFuZCBvcHRpb25hbCBmaWxlIHBhdHRlcm4gZm9yIHRoZSBwcm92aWRlZCBsb2NhdGlvbi5cbiAqIEZvciBwYXRocyB3aXRoIGdsb2IgcGF0dGVybnMsIGZpbmRzIHRoZSBkZWVwZXN0IG5vbi1nbG9iIGFuY2VzdG9yIGRpcmVjdG9yeS5cbiAqXG4gKiBBc3N1bWVzIHRoYXQgdGhlIGxvY2F0aW9uIHRoYXQgaXMgcHJvdmlkZWQgaGFzIGEgdmFsaWQgcGF0aCAoaXMgYWJzdHJhY3QpXG4gKlxuICogIyMgRXhhbXBsZXNcbiAqXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBhc3NlcnQuc3RyaWN0RGVlcEVxdWFsKFxuICogICAgIHJlc29sdmVTZWFyY2hMb2NhdGlvbihQcm9tcHRzVHlwZS5wcm9tcHQsIFVSSS5maWxlKCcvaG9tZS91c2VyL3tmb2xkZXIxLGZvbGRlcjJ9L2ZpbGUubWQnKSksXG4gKiAgICAgeyBzZWFyY2hSb290OiBVUkkuZmlsZSgnL2hvbWUvdXNlcicpLCBmaWxlUGF0dGVybjogJ3tmb2xkZXIxLGZvbGRlcjJ9L2ZpbGUubWQnIH0sXG4gKiAgICAgJ011c3QgZmluZCBjb3JyZWN0IG5vbi1nbG9iIHNlYXJjaCByb290LicsXG4gKiApO1xuICogYGBgXG4gKi9cbmZ1bmN0aW9uIHJlc29sdmVTZWFyY2hMb2NhdGlvbih0eXBlOiBQcm9tcHRzVHlwZSwgbG9jYXRpb246IFVSSSk6IElTZWFyY2hMb2NhdGlvblJlc3VsdCB7XG5cdGlmICh0eXBlICE9PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgJiYgdHlwZSAhPT0gUHJvbXB0c1R5cGUucHJvbXB0KSB7XG5cdFx0Ly8gb25seSBpbnN0cnVjdGlvbnMgYW5kIHByb21wdHMgc3VwcG9ydCBnbG9iIHBhdHRlcm5zLCBzbyB3ZSBjYW4gcmV0dXJuIHRoZSBsb2NhdGlvbiBhcyBpc1xuXHRcdHJldHVybiB7IHNlYXJjaFJvb3Q6IGxvY2F0aW9uIH07XG5cdH1cblxuXHRjb25zdCBzZWdtZW50cyA9IGxvY2F0aW9uLnBhdGguc3BsaXQoJy8nKTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IHNlZ21lbnRzLmxlbmd0aCAmJiBpc1ZhbGlkR2xvYihzZWdtZW50c1tpXSkgPT09IGZhbHNlKSB7XG5cdFx0aSsrO1xuXHR9XG5cdGlmIChpID09PSBzZWdtZW50cy5sZW5ndGgpIHtcblx0XHQvLyB0aGUgcGF0aCBkb2VzIG5vdCBjb250YWluIGEgZ2xvYiBwYXR0ZXJuLCBzbyB3ZSBjYW5cblx0XHQvLyBqdXN0IGZpbmQgYWxsIHByb21wdCBmaWxlcyBpbiB0aGUgcHJvdmlkZWQgbG9jYXRpb25cblx0XHRyZXR1cm4geyBzZWFyY2hSb290OiBsb2NhdGlvbiB9O1xuXHR9XG5cdGNvbnN0IHBhcmVudCA9IGxvY2F0aW9uLndpdGgoeyBwYXRoOiBzZWdtZW50cy5zbGljZSgwLCBpKS5qb2luKCcvJykgfSk7XG5cdGlmIChpID09PSBzZWdtZW50cy5sZW5ndGggLSAxICYmIHNlZ21lbnRzW2ldID09PSAnKicgfHwgc2VnbWVudHNbaV0gPT09IGBgKSB7XG5cdFx0cmV0dXJuIHsgc2VhcmNoUm9vdDogcGFyZW50IH07XG5cdH1cblxuXHQvLyB0aGUgcGF0aCBjb250YWlucyBhIGdsb2IgcGF0dGVybiwgc28gd2Ugc2VhcmNoIGluIGxhc3QgZm9sZGVyIHRoYXQgZG9lcyBub3QgY29udGFpbiBhIGdsb2IgcGF0dGVyblxuXHRyZXR1cm4ge1xuXHRcdHNlYXJjaFJvb3Q6IHBhcmVudCxcblx0XHRmaWxlUGF0dGVybjogc2VnbWVudHMuc2xpY2UoaSkuam9pbignLycpXG5cdH07XG59XG5cblxuLyoqXG4gKiBSZWdleCBwYXR0ZXJuIHN0cmluZyBmb3IgdmFsaWRhdGluZyBwYXRocyBmb3IgYWxsIHByb21wdCBmaWxlcy5cbiAqIFBhdGhzIG9ubHkgc3VwcG9ydDpcbiAqIC0gUmVsYXRpdmUgcGF0aHM6IHNvbWVGb2xkZXIsIC4vc29tZUZvbGRlclxuICogLSBVc2VyIGhvbWUgcGF0aHM6IH4vZm9sZGVyIChvbmx5IGZvcndhcmQgc2xhc2gsIG5vdCBiYWNrc2xhc2ggZm9yIGNyb3NzLXBsYXRmb3JtIHNoYXJpbmcpXG4gKiAtIFBhcmVudCByZWxhdGl2ZSBwYXRocyBmb3IgbW9ub3JlcG9zOiAuLi9mb2xkZXJcbiAqXG4gKiBOT1Qgc3VwcG9ydGVkOlxuICogLSBBYnNvbHV0ZSBwYXRocyAocG9ydGFiaWxpdHkgaXNzdWUpXG4gKiAtIEdsb2IgcGF0dGVybnMgd2l0aCAqIG9yICoqIChwZXJmb3JtYW5jZSBpc3N1ZSlcbiAqIC0gQmFja3NsYXNoZXMgKHBhdGhzIHNob3VsZCBiZSBzaGFyZWFibGUgaW4gcmVwb3MgYWNyb3NzIHBsYXRmb3JtcylcbiAqIC0gVGlsZGUgd2l0aG91dCBmb3J3YXJkIHNsYXNoIChlLmcuLCB+YWJjLCB+XFxmb2xkZXIpXG4gKiAtIEVtcHR5IG9yIHdoaXRlc3BhY2Utb25seSBwYXRoc1xuICpcbiAqIFRoZSByZWdleCB2YWxpZGF0ZXM6XG4gKiAtIE5vdCBhIFdpbmRvd3MgYWJzb2x1dGUgcGF0aCAoZS5nLiwgQzpcXCwgQzovKVxuICogLSBOb3Qgc3RhcnRpbmcgd2l0aCAvIChVbml4IGFic29sdXRlIHBhdGgpXG4gKiAtIE5vIGJhY2tzbGFzaGVzIGFueXdoZXJlICh1c2UgZm9yd2FyZCBzbGFzaGVzIG9ubHkpXG4gKiAtIElmIHN0YXJ0cyB3aXRoIH4sIG11c3QgYmUgZm9sbG93ZWQgYnkgL1xuICogLSBObyBnbG9iIHBhdHRlcm4gY2hhcmFjdGVyczogKiA/IFsgXSB7IH1cbiAqIC0gQXQgbGVhc3Qgb25lIG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlclxuICovXG5leHBvcnQgY29uc3QgVkFMSURfUFJPTVBUX0ZPTERFUl9QQVRURVJOID0gJ14oPyFbQS1aYS16XTpbXFxcXFxcXFwvXSkoPyEvKSg/IX4oPyEvKSkoPyEuKlxcXFxcXFxcKSg/IS4qWyo/XFxcXFtcXFxcXXt9XSkuKlxcXFxTLiokJztcbmNvbnN0IFZBTElEX1BST01QVF9GT0xERVJfUkVHRVggPSBuZXcgUmVnRXhwKFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTik7XG5cbi8qKlxuICogVmFsaWRhdGVzIGlmIGEgcGF0aCBpcyBhbGxvd2VkIGZvciBzaW1wbGlmaWVkIHBhdGggY29uZmlndXJhdGlvbnMuXG4gKiBPbmx5IGZvcndhcmQgc2xhc2hlcyBhcmUgc3VwcG9ydGVkIHRvIGVuc3VyZSBwYXRocyBhcmUgc2hhcmVhYmxlIGFjcm9zcyBwbGF0Zm9ybXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIFZBTElEX1BST01QVF9GT0xERVJfUkVHRVgudGVzdChwYXRoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWUsb0JBQW9CLHFCQUFxQixvQkFBb0I7QUFDckYsU0FBUyxpQ0FBaUMsYUFBYSxxQkFBcUI7QUFDNUUsU0FBUyxVQUFVLFNBQVMsU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQ3RFLFNBQVMsZ0NBQWtEO0FBQzNELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCLHNCQUFzQix1QkFBdUIsc0JBQXNCLHdCQUF3QixtQkFBbUIsNEJBQTRCLG9CQUFvQixzQkFBc0IsK0JBQStCLHNCQUF3RTtBQUMxVCxTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBK0MsZ0JBQWdCLGlCQUFpQjtBQUN6RixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBc0Usc0JBQXNCO0FBQ3JHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHlCQUF5QjtBQUtsQyxNQUFNLG1DQUFtQztBQVVsQyxJQUFNLHFCQUFOLE1BQXlCO0FBQUEsRUFJL0IsWUFDZ0MsYUFDUyxlQUNHLGtCQUNJLG9CQUNkLGVBQ1MsaUJBQ1osWUFDQyxhQUNvQixpQ0FDbEQ7QUFUOEI7QUFDUztBQUNHO0FBQ0k7QUFDZDtBQUNTO0FBQ1o7QUFDQztBQUNvQjtBQUduRCxVQUFNLHNCQUFzQixLQUFLLGdCQUFnQixlQUFlO0FBQ2hFLFNBQUssaUJBQWlCO0FBQUEsTUFDckIsS0FBSztBQUFBLE1BQ0wsWUFBWTtBQUFBLE1BQ1osYUFBYTtBQUFBLE1BQ2IsUUFBUSxpQkFBaUI7QUFBQSxNQUN6QixTQUFTLGVBQWU7QUFBQSxNQUN4QixhQUFhLElBQUksU0FBUyx5QkFBeUIsV0FBVztBQUFBLE1BQzlELFdBQVc7QUFBQSxJQUNaO0FBQUEsRUFDRDtBQUFBLEVBRVUsc0JBQW1EO0FBTTVELFdBQU8sS0FBSyxpQkFBaUIsYUFBYSxFQUFFLFFBQVEsT0FBTyxPQUFLLEVBQUUsSUFBSSxXQUFXLGlCQUFpQjtBQUFBLEVBQ25HO0FBQUEsRUFFVSxtQkFBbUIsVUFBNkM7QUFDekUsV0FBTyxLQUFLLGlCQUFpQixtQkFBbUIsUUFBUSxLQUFLO0FBQUEsRUFDOUQ7QUFBQSxFQUVVLDhCQUEyQztBQUNwRCxXQUFPLE1BQU0sSUFBSSxLQUFLLGlCQUFpQiw2QkFBNkIsTUFBTSxNQUFTO0FBQUEsRUFDcEY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVUsdUJBQXVCLE1BQTBDO0FBQzFFLFdBQU8sY0FBYyxvQkFBb0IsS0FBSyxlQUFlLElBQUk7QUFBQSxFQUNsRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNVSx3QkFBd0IsTUFBbUQ7QUFDcEYsV0FBTyw4QkFBOEIsSUFBSTtBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFhLHdCQUF3QixnQkFBeUIsUUFBaUIsTUFBNEI7QUFDMUcsVUFBTSxtQkFBbUIsT0FDdEIsS0FBSyxXQUFXLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQ3ZELEtBQUssb0JBQW9CO0FBQzVCLFFBQUksZ0JBQWdCO0FBQ25CLFlBQU0sUUFBUSxJQUFJLFlBQVk7QUFDOUIsWUFBTSxXQUFXLE1BQU0sS0FBSyxZQUFZLFNBQVM7QUFDakQsaUJBQVcsbUJBQW1CLGtCQUFrQjtBQUMvQyxjQUFNLElBQUksZ0JBQWdCLEdBQUc7QUFJN0IsY0FBTSxVQUFVLE1BQU0sS0FBSyxzQkFBc0IsZ0JBQWdCLEtBQUssVUFBVSxPQUFPLE1BQU07QUFDN0YsbUJBQVcsVUFBVSxTQUFTO0FBQzdCLGdCQUFNLElBQUksTUFBTTtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLGFBQU8sQ0FBQyxHQUFHLEtBQUs7QUFBQSxJQUNqQjtBQUNBLFdBQU8saUJBQWlCLElBQUksT0FBSyxFQUFFLEdBQUc7QUFBQSxFQUN2QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSxNQUFjLHNCQUFzQixXQUFnQixVQUFlLE1BQW1CLFFBQWlDO0FBQ3RILFVBQU0sYUFBb0IsQ0FBQztBQUMzQixRQUFJLFVBQVU7QUFDZCxXQUFPLE1BQU07QUFDWixVQUFJO0FBQ0gsY0FBTSxhQUFhLE1BQU0sS0FBSyxZQUFZLE9BQU8sU0FBUyxTQUFTLE1BQU0sQ0FBQztBQUMxRSxZQUFJLFlBQVk7QUFDZixlQUFLLE1BQU0sS0FBSyxnQ0FBZ0MsZ0JBQWdCLE9BQU8sR0FBRyxTQUFTO0FBQ2xGLHVCQUFXLEtBQUssT0FBTztBQUN2QixtQkFBTztBQUFBLFVBQ1I7QUFDQSxrQkFBUSxRQUFRLDRCQUE0QixRQUFRLFNBQVMsQ0FBQyxzRkFBc0Y7QUFDcEosaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFBQSxNQUNELFNBQVMsR0FBRztBQUNYLGNBQU0sTUFBTSxhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQztBQUNyRCxnQkFBUSxRQUFRLHVDQUF1QyxVQUFVLFNBQVMsQ0FBQyxxQkFBcUIsU0FBUyxTQUFTLE1BQU0sQ0FBQyxLQUFLLEdBQUcsR0FBRztBQUNwSSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsaUJBQVcsS0FBSyxPQUFPO0FBQ3ZCLFlBQU0sU0FBUyxRQUFRLE9BQU87QUFJOUIsVUFBSSxRQUFRLFNBQVMsTUFBTSxLQUFLLFFBQVEsU0FBUyxPQUFPLFFBQVEsVUFBVSxNQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sR0FBRztBQUN0RztBQUFBLE1BQ0Q7QUFDQSxnQkFBVTtBQUFBLElBQ1g7QUFFQSxZQUFRLFFBQVEsdUNBQXVDLFVBQVUsU0FBUyxDQUFDLEdBQUc7QUFDOUUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWEsVUFBVSxNQUFtQixTQUF5QixPQUEwQixNQUFxQztBQUNqSSxVQUFNLFFBQVEsTUFBTSxLQUFLLG9CQUFvQixNQUFNLFNBQVMsT0FBTyxJQUFJO0FBQ3ZFLFdBQU8sTUFBTSxJQUFJLFVBQVEsS0FBSyxHQUFHO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQWEsb0JBQW9CLE1BQW1CLFNBQXlCLE9BQTBCLE1BQXdFO0FBQzlLLFFBQUksWUFBWSxlQUFlLFFBQVEsWUFBWSxlQUFlLE9BQU87QUFDeEUsWUFBTSxJQUFJLE1BQU0sb0NBQW9DLE9BQU8sRUFBRTtBQUFBLElBQzlEO0FBRUEsVUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsSUFBSTtBQUM1RCxVQUFNLFlBQVksWUFBWSxlQUFlLFFBQVEsT0FBTztBQUM1RCxVQUFNLG9CQUFvQixNQUFNLEtBQUssb0JBQW9CLE1BQU0sb0JBQW9CLE9BQU8sY0FBWSxTQUFTLFlBQVksT0FBTyxHQUFHLFFBQVcsU0FBUztBQUV6SixRQUFJLFlBQVksZUFBZSxRQUFRLEtBQUsscUJBQXFCLElBQUksR0FBRztBQUN2RSxZQUFNLGlCQUFpQixNQUFNLEtBQUssb0JBQW9CLE1BQU0sb0JBQW9CLE9BQU8sY0FBWSxTQUFTLFlBQVksZUFBZSxLQUFLLENBQUM7QUFDN0ksd0JBQWtCLEtBQUssR0FBRyxlQUFlLE9BQU8sY0FBWSxLQUFLLDZCQUE2QixNQUFNLFNBQVMsVUFBVSxDQUFDLENBQUM7QUFDekgsd0JBQWtCLEtBQUssS0FBSyxjQUFjO0FBQUEsSUFDM0M7QUFFQSxVQUFNLFFBQVEsSUFBSSxZQUFZO0FBQzlCLFVBQU0sU0FBbUQsQ0FBQztBQUUxRCxlQUFXLEVBQUUsWUFBWSxhQUFhLFFBQVEsU0FBUyxjQUFjLEtBQUssbUJBQW1CO0FBQzVGLFlBQU0sUUFBUyxnQkFBZ0IsU0FDNUIsTUFBTSxLQUFLLHVCQUF1QixZQUFZLE1BQU0sT0FBTyxHQUFHLFNBQVMsSUFDdkUsTUFBTSxLQUFLLHNCQUFzQixZQUFZLGFBQWEsS0FBSztBQUNsRSxpQkFBVyxRQUFRLE9BQU87QUFDekIsWUFBSSxrQkFBa0IsSUFBSSxNQUFNLFFBQVEsTUFBTSxJQUFJLElBQUksR0FBRztBQUN4RDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLGlCQUFpQixLQUFLLHFCQUFxQixNQUFNLElBQUk7QUFDM0QsWUFBSyxrQkFBa0IsWUFBWSxlQUFlLFFBQzdDLENBQUMsa0JBQWtCLGtCQUFrQixTQUFVO0FBQ25EO0FBQUEsUUFDRDtBQUVBLGNBQU0sSUFBSSxJQUFJO0FBQ2QsZUFBTyxLQUFLLEVBQUUsS0FBSyxNQUFNLFFBQVEsaUJBQWlCLGlCQUFpQixXQUFXLE9BQU8sQ0FBQztBQUFBLE1BQ3ZGO0FBQ0EsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxxQkFBcUIsTUFBNEI7QUFDeEQsV0FBTyxTQUFTLFlBQVksU0FBUyxTQUFTLFlBQVksZ0JBQWdCLFNBQVMsWUFBWTtBQUFBLEVBQ2hHO0FBQUEsRUFFUSxxQkFBcUIsTUFBbUIsVUFBd0I7QUFDdkUsV0FBTyxLQUFLLHFCQUFxQixJQUFJLEtBQUssZ0JBQWdCLFVBQVUsS0FBSyxlQUFlLEdBQUc7QUFBQSxFQUM1RjtBQUFBLEVBRVEsNkJBQTZCLE1BQW1CLFlBQTBCO0FBQ2pGLFdBQU8sS0FBSyxxQkFBcUIsSUFBSSxNQUNoQyxnQkFBZ0IsWUFBWSxLQUFLLGVBQWUsR0FBRyxLQUFLLGdCQUFnQixLQUFLLGVBQWUsS0FBSyxVQUFVO0FBQUEsRUFDakg7QUFBQSxFQUVPLHdCQUF3QixNQUF5RTtBQUN2RyxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUN4RCxVQUFNLFFBQVEsWUFBWSxJQUFJLElBQUksd0JBQXdCLENBQUMsRUFBRTtBQUU3RCxVQUFNLHlCQUF5QixZQUFZLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUNwRSxVQUFNLE1BQU0sZ0NBQWdDLElBQUk7QUFDaEQsVUFBTSxpQkFBaUIsS0FBSyxnQkFBZ0IsZUFBZTtBQUUzRCxRQUFJLGdCQUF3RCxDQUFDO0FBRTdELFVBQU0sK0JBQStCLE1BQU07QUFDMUMsNkJBQXVCLE1BQU07QUFDN0IsaUJBQVcsVUFBVSxlQUFlO0FBQ25DLFlBQUksQ0FBQyxLQUFLLG1CQUFtQixPQUFPLFVBQVUsR0FBRztBQUVoRCxnQkFBTSxZQUFZLE9BQU8sZ0JBQWdCLFVBQWEsU0FBUyxZQUFZO0FBQzNFLGlDQUF1QixJQUFJLEtBQUssWUFBWSxNQUFNLE9BQU8sWUFBWSxFQUFFLFdBQVcsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQUEsUUFDbEc7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxZQUFZO0FBQzFCLFVBQUk7QUFDSCxjQUFNLHNCQUFzQixLQUFLLHVCQUF1QixJQUFJO0FBQzVELHdCQUFnQixNQUFNLEtBQUssb0JBQW9CLE1BQU0scUJBQXFCLE1BQVM7QUFFbkYsWUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLFFBQ0Q7QUFDQSxxQ0FBNkI7QUFBQSxNQUM5QixTQUFTLEtBQUs7QUFDYixhQUFLLFdBQVcsTUFBTSw0REFBNEQsR0FBRztBQUFBLE1BQ3RGO0FBQUEsSUFDRDtBQUNBLGdCQUFZLElBQUksS0FBSyxjQUFjLHlCQUF5QixPQUFLO0FBQ2hFLFVBQUksRUFBRSxxQkFBcUIsR0FBRyxLQUFLLEVBQUUscUJBQXFCLGNBQWMsa0NBQWtDLEdBQUc7QUFDNUcsYUFBSyxPQUFPO0FBQ1oscUJBQWEsS0FBSztBQUFBLE1BQ25CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssNEJBQTRCLEVBQUUsTUFBTTtBQUN4RCxXQUFLLE9BQU87QUFDWixtQkFBYSxLQUFLO0FBQUEsSUFDbkIsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLGdDQUFnQywwQkFBMEIsTUFBTTtBQUNwRixXQUFLLE9BQU87QUFDWixtQkFBYSxLQUFLO0FBQUEsSUFDbkIsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLFlBQVksaUJBQWlCLE9BQUs7QUFDdEQsVUFBSSxFQUFFLFFBQVEsY0FBYyxHQUFHO0FBQzlCLHFCQUFhLEtBQUs7QUFDbEI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxjQUFjLEtBQUssWUFBVSxFQUFFLFFBQVEsT0FBTyxVQUFVLENBQUMsR0FBRztBQUMvRCxxQkFBYSxLQUFLO0FBQ2xCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLFlBQVksTUFBTSxjQUFjLENBQUM7QUFFdEQsU0FBSyxPQUFPO0FBRVosV0FBTyxFQUFFLE9BQU8sYUFBYSxPQUFPLFNBQVMsTUFBTSxZQUFZLFFBQVEsRUFBRTtBQUFBLEVBQzFFO0FBQUEsRUFFTyxzQ0FBNEY7QUFDbEcsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sZUFBZSxZQUFZLElBQUksSUFBSSxRQUFjLENBQUM7QUFDeEQsVUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLGdCQUFZLElBQUksYUFBYSxNQUFNLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQztBQUNyRCxVQUFNLFFBQVEsSUFBSTtBQUNsQixVQUFNLFdBQVcsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDdEQsVUFBTSxlQUFlLElBQUksWUFBWTtBQUVyQyxVQUFNLFdBQVcsQ0FBQyxhQUFrQjtBQUNuQyxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsTUFDRDtBQUNBLFVBQUksYUFBYSxJQUFJLFFBQVEsR0FBRztBQUMvQjtBQUFBLE1BQ0Q7QUFFQSxtQkFBYSxJQUFJLFFBQVE7QUFDekIsZUFBUyxJQUFJLEtBQUssWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUFBLElBQzlDO0FBRUEsVUFBTSxpQkFBaUIsWUFBWTtBQUNsQyxlQUFTLE1BQU07QUFDZixtQkFBYSxNQUFNO0FBRW5CLFlBQU0sc0JBQXNCLEtBQUssY0FBYyxTQUFTLGNBQWMsWUFBWSxLQUFLLEtBQUssY0FBYyxTQUFTLGNBQWMsYUFBYTtBQUM5SSxZQUFNLHFCQUFxQixLQUFLLGNBQWMsU0FBUyxjQUFjLGFBQWE7QUFDbEYsWUFBTSxzQkFBc0IsS0FBSyxjQUFjLFNBQVMsY0FBYyw2QkFBNkI7QUFDbkcsWUFBTSxpQkFBaUIsS0FBSyxjQUFjLFNBQVMsY0FBYyxrQ0FBa0MsTUFBTTtBQUN6RyxZQUFNLGlCQUFpQixNQUFNLEtBQUssd0JBQXdCLGNBQWM7QUFDeEUsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLE1BQ0Q7QUFDQSxZQUFNLFdBQVcsTUFBTSxLQUFLLFlBQVksU0FBUztBQUNqRCxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsTUFDRDtBQUVBLGlCQUFXLGlCQUFpQixnQkFBZ0I7QUFDM0MsWUFBSSxxQkFBcUI7QUFDeEIsbUJBQVMsYUFBYTtBQUFBLFFBQ3ZCO0FBQ0EsWUFBSSxvQkFBb0I7QUFDdkIsbUJBQVMsU0FBUyxlQUFlLG9CQUFvQixDQUFDO0FBQUEsUUFDdkQ7QUFDQSxZQUFJLHFCQUFxQjtBQUN4QixtQkFBUyxTQUFTLGVBQWUsb0JBQW9CLENBQUM7QUFBQSxRQUN2RDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLG9CQUFvQjtBQUN2QixpQkFBUyxTQUFTLFVBQVUsb0JBQW9CLENBQUM7QUFBQSxNQUNsRDtBQUNBLFVBQUkscUJBQXFCO0FBQ3hCLGlCQUFTLFNBQVMsVUFBVSxxQkFBcUIsQ0FBQztBQUFBLE1BQ25EO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxNQUFNO0FBQ3JCLFdBQUssZUFBZTtBQUNwQixtQkFBYSxLQUFLO0FBQUEsSUFDbkI7QUFFQSxnQkFBWSxJQUFJLEtBQUssY0FBYyx5QkFBeUIsT0FBSztBQUNoRSxVQUNDLEVBQUUscUJBQXFCLGNBQWMsWUFBWSxLQUNqRCxFQUFFLHFCQUFxQixjQUFjLGFBQWEsS0FDbEQsRUFBRSxxQkFBcUIsY0FBYyw2QkFBNkIsS0FDbEUsRUFBRSxxQkFBcUIsY0FBYyxrQ0FBa0MsR0FDdEU7QUFDRCxnQkFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksS0FBSyw0QkFBNEIsRUFBRSxNQUFNO0FBQ3hELGNBQVE7QUFBQSxJQUNULENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksS0FBSyxnQ0FBZ0MsMEJBQTBCLE1BQU07QUFDcEYsY0FBUTtBQUFBLElBQ1QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLFlBQVksaUJBQWlCLE9BQUs7QUFDdEQsaUJBQVcsZUFBZSxjQUFjO0FBQ3ZDLFlBQUksRUFBRSxRQUFRLFdBQVcsR0FBRztBQUMzQix1QkFBYSxLQUFLO0FBQ2xCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksS0FBSyxZQUFZLGtCQUFrQixPQUFLO0FBQ3ZELGlCQUFXLGVBQWUsY0FBYztBQUN2QyxZQUFJLGdCQUFnQixFQUFFLFVBQVUsV0FBVyxHQUFHO0FBQzdDLHVCQUFhLEtBQUs7QUFDbEI7QUFBQSxRQUNEO0FBQ0EsWUFBSSxFQUFFLFlBQVksY0FBYyxNQUFNLEtBQUssRUFBRSxZQUFZLGNBQWMsSUFBSSxLQUFLLEVBQUUsWUFBWSxjQUFjLElBQUksR0FBRztBQUNsSCxjQUFJLGdCQUFnQixFQUFFLE9BQU8sVUFBVSxXQUFXLEdBQUc7QUFDcEQseUJBQWEsS0FBSztBQUNsQjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxlQUFlO0FBRXBCLFdBQU8sRUFBRSxPQUFPLGFBQWEsT0FBTyxTQUFTLE1BQU0sWUFBWSxRQUFRLEVBQUU7QUFBQSxFQUMxRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFhLHVCQUF3RTtBQUNwRixVQUFNLHNCQUFzQixLQUFLLHVCQUF1QixZQUFZLElBQUk7QUFJeEUsVUFBTSxxQkFBcUIsb0JBQW9CO0FBQUEsTUFBTyxTQUNyRCxDQUFDLElBQUksS0FBSyxXQUFXLFVBQVUsS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLFdBQVc7QUFBQSxJQUNuRTtBQUdBLFVBQU0sb0JBQW9CLE1BQU0sS0FBSyxvQkFBb0IsWUFBWSxNQUFNLGtCQUFrQjtBQUc3RixVQUFNLE9BQU8sSUFBSSxZQUFZO0FBQzdCLFVBQU0sU0FBd0MsQ0FBQztBQUMvQyxlQUFXLFlBQVksbUJBQW1CO0FBSXpDLFVBQUksQ0FBQyxLQUFLLElBQUksU0FBUyxVQUFVLEdBQUc7QUFDbkMsYUFBSyxJQUFJLFNBQVMsVUFBVTtBQUM1QixlQUFPLEtBQUssRUFBRSxHQUFHLFVBQVUsS0FBSyxTQUFTLFlBQVksYUFBYSxPQUFVLENBQUM7QUFBQSxNQUM5RTtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY0EsTUFBYSw0QkFBNEIsTUFBNEM7QUFDcEYsVUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsSUFBSTtBQUM1RCxVQUFNLG9CQUFvQixNQUFNLEtBQUssb0JBQW9CLE1BQU0sbUJBQW1CO0FBR2xGLFFBQUksU0FBUyxZQUFZLFVBQVUsU0FBUyxZQUFZLGNBQWM7QUFDckUsYUFBTyxrQkFBa0IsSUFBSSxPQUFLLEVBQUUsR0FBRztBQUFBLElBQ3hDO0FBS0EsVUFBTSxTQUFTLElBQUksWUFBWTtBQUMvQixlQUFXLG9CQUFvQixtQkFBbUI7QUFDakQsVUFBSSxXQUFXLGlCQUFpQjtBQUNoQyxZQUFNLFdBQVcsU0FBUyxRQUFRO0FBSWxDLFlBQU0sZUFBZSxDQUFDLFFBQVEsSUFBSSx1QkFBdUIsSUFBSSxDQUFDLEVBQUU7QUFDaEUsaUJBQVcsZUFBZSxjQUFjO0FBQ3ZDLFlBQUksYUFBYSxhQUFhO0FBQzdCLHFCQUFXLFFBQVEsUUFBUTtBQUMzQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBSUEsVUFBSSxhQUFhLEtBQUs7QUFDckIsbUJBQVcsUUFBUSxRQUFRO0FBQUEsTUFDNUI7QUFJQSxVQUFJLFlBQVksU0FBUyxJQUFJLE1BQU0sTUFBTTtBQUN4QztBQUFBLE1BQ0Q7QUFFQSxhQUFPLElBQUksUUFBUTtBQUFBLElBQ3BCO0FBRUEsV0FBTyxDQUFDLEdBQUcsTUFBTTtBQUFBLEVBQ2xCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBYUEsTUFBYSx5QkFBeUIsTUFBb0U7QUFDekcsVUFBTSxvQkFBb0IsTUFBTSxLQUFLLHVCQUF1QixJQUFJO0FBRWhFLFVBQU0sZUFBZSxrQkFBa0IsT0FBTyxTQUFPLElBQUksWUFBWSxlQUFlLEtBQUs7QUFDekYsVUFBTSxjQUFjLGtCQUFrQixPQUFPLFNBQU8sSUFBSSxZQUFZLGVBQWUsSUFBSTtBQUN2RixXQUFPLEtBQUssb0JBQW9CLENBQUMsR0FBRyxjQUFjLEdBQUcsV0FBVyxDQUFDO0FBQUEsRUFDbEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQWEsaUNBQWlDLE1BQW9FO0FBQ2pILFVBQU0sb0JBQW9CLE1BQU0sS0FBSyx1QkFBdUIsSUFBSTtBQUNoRSxVQUFNLGNBQWMsa0JBQWtCLE9BQU8sU0FBTyxJQUFJLFlBQVksZUFBZSxJQUFJO0FBQ3ZGLFVBQU0sZUFBZSxrQkFBa0IsT0FBTyxTQUFPLElBQUksWUFBWSxlQUFlLEtBQUs7QUFDekYsV0FBTyxLQUFLLG9CQUFvQixDQUFDLEdBQUcsYUFBYSxHQUFHLFlBQVksQ0FBQztBQUFBLEVBQ2xFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsdUJBQXVCLE1BQW9FO0FBQ3hHLFVBQU0sc0JBQXNCLEtBQUssdUJBQXVCLElBQUk7QUFDNUQsVUFBTSxpQkFBaUIsS0FBSyx3QkFBd0IsSUFBSTtBQVF4RCxVQUFNLGVBQWUsY0FBYyxrQkFBa0IsS0FBSyxlQUFlLElBQUksTUFBTTtBQUNuRixVQUFNLGFBQWEsZUFBZSxzQkFBc0I7QUFFeEQsVUFBTSxvQkFBb0IsTUFBTSxLQUFLLG9CQUFvQixNQUFNLFlBQVksY0FBYztBQUN6RixRQUFJLFNBQVMsWUFBWSxTQUFTLFNBQVMsWUFBWSxnQkFBZ0IsU0FBUyxZQUFZLFFBQVE7QUFDbkcsd0JBQWtCLEtBQUssS0FBSyxjQUFjO0FBQUEsSUFDM0M7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1Esb0JBQW9CLFNBQWdGO0FBQzNHLFVBQU0sT0FBTyxJQUFJLFlBQVk7QUFDN0IsVUFBTSxTQUF3QyxDQUFDO0FBQy9DLGVBQVcsVUFBVSxTQUFTO0FBQzdCLFVBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxHQUFHLEdBQUc7QUFDMUIsYUFBSyxJQUFJLE9BQU8sR0FBRztBQUNuQixlQUFPLEtBQUssTUFBTTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLE1BQWMsb0JBQW9CLE1BQW1CLHFCQUFxRCxrQkFBbUQsTUFBb0Q7QUFDaE4sVUFBTSxTQUF3QyxDQUFDO0FBQy9DLFVBQU0sT0FBTyxJQUFJLFlBQVk7QUFFN0IsVUFBTSxXQUFXLE1BQU0sS0FBSyxZQUFZLFNBQVM7QUFDakQsVUFBTSxjQUFjLE1BQU0sS0FBSyx3QkFBd0IsS0FBSyxjQUFjLFNBQVMsY0FBYyxrQ0FBa0MsTUFBTSxNQUFNLFFBQVcsSUFBSTtBQUc5SixVQUFNLGVBQWUsSUFBSSxJQUFJLGtCQUFrQixJQUFJLFNBQU8sSUFBSSxJQUFJLENBQUM7QUFHbkUsVUFBTSxpQkFBaUIsb0JBQW9CLE9BQU8sa0JBQWdCO0FBRWpFLFVBQUksU0FBUyxZQUFZLGdCQUFnQixTQUFTLFlBQVksUUFBUTtBQUNyRSxjQUFNLE9BQU8sYUFBYTtBQUMxQixZQUFJLGVBQWUsSUFBSSxHQUFHO0FBQ3pCLGNBQUksU0FBUyxZQUFZLFFBQVE7QUFDaEMsaUJBQUssV0FBVyxLQUFLLG1GQUFtRixJQUFJLDJDQUEyQztBQUFBLFVBQ3hKLFdBQVcsU0FBUyxZQUFZLGNBQWM7QUFDN0MsaUJBQUssV0FBVyxLQUFLLG9FQUFvRSxJQUFJLDBEQUEwRDtBQUFBLFVBQ3hKO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxxQkFBcUIsYUFBYTtBQUN4QyxVQUFJLENBQUMsd0JBQXdCLGtCQUFrQixHQUFHO0FBQ2pELGFBQUssV0FBVyxLQUFLLDJFQUEyRSxrQkFBa0IsRUFBRTtBQUNwSCxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxlQUFXLGdCQUFnQixnQkFBZ0I7QUFDMUMsWUFBTSxxQkFBcUIsYUFBYTtBQUN4QyxZQUFNLFlBQVksY0FBYyxJQUFJLGtCQUFrQjtBQUN0RCxVQUFJO0FBRUgsWUFBSSxZQUFZLGtCQUFrQixHQUFHO0FBQ3BDLGdCQUFNLE1BQU0sU0FBUyxVQUFVLG1CQUFtQixVQUFVLENBQUMsQ0FBQztBQUM5RCxjQUFJLENBQUMsS0FBSyxJQUFJLEdBQUcsR0FBRztBQUNuQixpQkFBSyxJQUFJLEdBQUc7QUFDWixrQkFBTSxFQUFFLFlBQVksWUFBWSxJQUFJLHNCQUFzQixNQUFNLEdBQUc7QUFDbkUsbUJBQU8sS0FBSyxFQUFFLEtBQUssWUFBd0IsYUFBYSxRQUFRLGFBQWEsUUFBUSxTQUFTLGFBQWEsU0FBUyxhQUFhLG9CQUFvQixVQUFVLENBQUM7QUFBQSxVQUNqSztBQUNBO0FBQUEsUUFDRDtBQUVBLFlBQUksV0FBVyxrQkFBa0IsR0FBRztBQUNuQyxjQUFJLE1BQU0sSUFBSSxLQUFLLGtCQUFrQjtBQUNyQyxnQkFBTSxrQkFBa0IsS0FBSyxtQkFBbUI7QUFDaEQsY0FBSSxpQkFBaUI7QUFHcEIsa0JBQU0sSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLGNBQWMsV0FBVyxnQkFBZ0IsQ0FBQztBQUFBLFVBQzVFO0FBQ0EsY0FBSSxDQUFDLEtBQUssSUFBSSxHQUFHLEdBQUc7QUFDbkIsaUJBQUssSUFBSSxHQUFHO0FBQ1osa0JBQU0sRUFBRSxZQUFZLFlBQVksSUFBSSxzQkFBc0IsTUFBTSxHQUFHO0FBQ25FLG1CQUFPLEtBQUssRUFBRSxLQUFLLFlBQXdCLGFBQWEsUUFBUSxhQUFhLFFBQVEsU0FBUyxhQUFhLFNBQVMsYUFBYSxvQkFBb0IsVUFBVSxDQUFDO0FBQUEsVUFDaks7QUFBQSxRQUNELE9BQU87QUFDTixxQkFBVyxVQUFVLGFBQWE7QUFDakMsa0JBQU0sZUFBZSxTQUFTLFFBQVEsa0JBQWtCO0FBQ3hELGdCQUFJLENBQUMsS0FBSyxJQUFJLFlBQVksR0FBRztBQUM1QixtQkFBSyxJQUFJLFlBQVk7QUFDckIsb0JBQU0sRUFBRSxZQUFZLFlBQVksSUFBSSxzQkFBc0IsTUFBTSxZQUFZO0FBQzVFLHFCQUFPLEtBQUssRUFBRSxLQUFLLGNBQWMsWUFBd0IsYUFBYSxRQUFRLGFBQWEsUUFBUSxTQUFTLGFBQWEsU0FBUyxhQUFhLG9CQUFvQixVQUFVLENBQUM7QUFBQSxZQUMvSztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxTQUFTLE9BQU87QUFDZixhQUFLLFdBQVcsTUFBTSwyQ0FBMkMsa0JBQWtCLElBQUksS0FBSztBQUFBLE1BQzdGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLHVCQUF1QixVQUFlLE1BQW1CLE9BQTBCLFFBQWdCLEdBQUcsTUFBNEI7QUFDL0ksUUFBSSxTQUFTLFlBQVksT0FBTztBQUMvQixhQUFPLEtBQUssd0JBQXdCLFVBQVUsS0FBSztBQUFBLElBQ3BEO0FBS0EsVUFBTSxrQkFBa0IsVUFBVSxNQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsSUFBSSxLQUFLLG9CQUFvQixFQUFFLEtBQUssT0FBSyxRQUFRLEVBQUUsS0FBSyxRQUFRLENBQUM7QUFDdEksVUFBTSxZQUFZLFNBQVMsWUFBWSxnQkFDbkMsQ0FBQyxtQkFDRCxDQUFDLGVBQWUsU0FBUyxJQUFJLEtBQzdCLFFBQVE7QUFDWixRQUFJO0FBQ0gsWUFBTSxPQUFPLE1BQU0sS0FBSyxZQUFZLFFBQVEsUUFBUTtBQUNwRCxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFDQSxVQUFJLEtBQUssUUFBUTtBQUNoQixlQUFPLENBQUMsS0FBSyxRQUFRO0FBQUEsTUFDdEIsV0FBVyxLQUFLLGVBQWUsS0FBSyxVQUFVO0FBQzdDLGNBQU0sU0FBZ0IsQ0FBQztBQUN2QixtQkFBVyxTQUFTLEtBQUssVUFBVTtBQUNsQyxjQUFJLE1BQU0sUUFBUTtBQUNqQixtQkFBTyxLQUFLLE1BQU0sUUFBUTtBQUFBLFVBQzNCLFdBQVcsYUFBYSxNQUFNLGFBQWE7QUFFMUMsa0JBQU0sV0FBVyxNQUFNLEtBQUssdUJBQXVCLE1BQU0sVUFBVSxNQUFNLE9BQU8sUUFBUSxHQUFHLElBQUk7QUFDL0YsbUJBQU8sS0FBSyxHQUFHLFFBQVE7QUFBQSxVQUN4QjtBQUFBLFFBQ0Q7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsU0FBUyxHQUFHO0FBQ1gsVUFBSSxhQUFhLHNCQUFzQixFQUFFLHdCQUF3QixvQkFBb0IsZ0JBQWdCO0FBQUEsTUFFckcsT0FBTztBQUNOLGFBQUssV0FBVyxNQUFNLHdDQUF3QyxTQUFTLFNBQVMsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUN2RjtBQUFBLElBQ0Q7QUFDQSxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsc0JBQXNCLFFBQWEsYUFBaUMsT0FBMEM7QUFFM0gsUUFBSSxDQUFDLEtBQUssY0FBYyw0QkFBNEIsT0FBTyxNQUFNLEdBQUc7QUFDbkUsV0FBSyxXQUFXLEtBQUssb0VBQW9FLE9BQU8sTUFBTSxpQ0FBaUMsV0FBVyxRQUFRLE9BQU8sU0FBUyxDQUFDLEVBQUU7QUFDN0ssYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sdUJBQXVCLEtBQUssY0FBYyxTQUFrQiwyQkFBMkI7QUFFN0YsVUFBTSxnQkFBZ0IsS0FBSyxtQkFBbUIsTUFBTTtBQUVwRCxVQUFNLG9CQUFvQixDQUFDQSxZQUFnQixZQUFZLEtBQUssY0FBYyxTQUErQixFQUFFLFVBQVVBLFFBQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNwSSxVQUFNLGdCQUE0QjtBQUFBLE1BQ2pDLGVBQWUsQ0FBQyxFQUFFLFFBQVEscUJBQXFCLENBQUM7QUFBQSxNQUNoRCxNQUFNLFVBQVU7QUFBQSxNQUNoQiw0QkFBNEI7QUFBQSxNQUM1QixnQkFBZ0IsZ0JBQWdCLGtCQUFrQixjQUFjLEdBQUcsSUFBSTtBQUFBLE1BQ3ZFLGdCQUFnQjtBQUFBLE1BQ2hCLGFBQWE7QUFBQSxNQUNiO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSCxZQUFNLGVBQWUsTUFBTSxLQUFLLGNBQWMsV0FBVyxlQUFlLEtBQUs7QUFDN0UsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsYUFBTyxhQUFhLFFBQVEsSUFBSSxPQUFLLEVBQUUsUUFBUTtBQUFBLElBQ2hELFNBQVMsR0FBRztBQUNYLFVBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHO0FBQzVCLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUNBLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWEsd0JBQXdCLE9BQTREO0FBQ2hHLFVBQU0sU0FBUyxNQUFNLFFBQVEsSUFBSSxLQUFLLG9CQUFvQixFQUFFLElBQUksWUFBVSxLQUFLLHFCQUFxQixPQUFPLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDdkgsV0FBTyxPQUFPLEtBQUssQ0FBQztBQUFBLEVBQ3JCO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixRQUFhLE9BQTREO0FBRTNHLFFBQUksS0FBSyxjQUFjLDRCQUE0QixPQUFPLE1BQU0sR0FBRztBQUVsRSxZQUFNLHVCQUF1QixLQUFLLGNBQWMsU0FBa0IsMkJBQTJCO0FBQzdGLFlBQU0sb0JBQW9CLENBQUNBLFlBQWdCLFlBQVksS0FBSyxjQUFjLFNBQStCLEVBQUUsVUFBVUEsUUFBTyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ3BJLFlBQU0sZ0JBQTRCO0FBQUEsUUFDakMsZUFBZSxDQUFDLEVBQUUsUUFBUSxxQkFBcUIsQ0FBQztBQUFBLFFBQ2hELE1BQU0sVUFBVTtBQUFBLFFBQ2hCLDRCQUE0QjtBQUFBLFFBQzVCLGdCQUFnQixrQkFBa0IsTUFBTTtBQUFBLFFBQ3hDLGFBQWE7QUFBQSxRQUNiLGdCQUFnQjtBQUFBLE1BQ2pCO0FBRUEsVUFBSTtBQUNILGNBQU0sZUFBZSxNQUFNLEtBQUssY0FBYyxXQUFXLGVBQWUsS0FBSztBQUM3RSxZQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGlCQUFPLENBQUM7QUFBQSxRQUNUO0FBRUEsY0FBTSxVQUFtQyxDQUFDO0FBQzFDLG1CQUFXLEtBQUssYUFBYSxTQUFTO0FBQ3JDLGdCQUFNLFdBQVc7QUFDakIsa0JBQVEsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLFVBQVUsTUFBTSx5QkFBeUIsU0FBUyxDQUFDO0FBQUEsUUFDcEY7QUFDQSxlQUFPO0FBQUEsTUFDUixTQUFTLEdBQUc7QUFDWCxZQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRztBQUM1QixnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQ0EsYUFBTyxDQUFDO0FBQUEsSUFDVCxPQUFPO0FBRU4sYUFBTyxLQUFLLDZCQUE2QixRQUFRLEtBQUs7QUFBQSxJQUN2RDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYyw2QkFBNkIsUUFBYSxPQUE0RDtBQUNuSCxVQUFNLFNBQWtDLENBQUM7QUFDekMsVUFBTSxtQkFBbUI7QUFFekIsVUFBTSxXQUFXLE9BQU8sUUFBNEI7QUFDbkQsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLE1BQ0Q7QUFFQSxVQUFJO0FBQ0gsY0FBTSxPQUFPLE1BQU0sS0FBSyxZQUFZLFFBQVEsR0FBRztBQUMvQyxZQUFJLEtBQUssVUFBVSxLQUFLLEtBQUssWUFBWSxNQUFNLGtCQUFrQjtBQUNoRSxnQkFBTSxXQUFXLEtBQUssaUJBQWlCLE1BQU0sS0FBSyxZQUFZLFNBQVMsS0FBSyxRQUFRLElBQUk7QUFDeEYsaUJBQU8sS0FBSyxFQUFFLEtBQUssS0FBSyxVQUFVLFVBQVUsTUFBTSx5QkFBeUIsU0FBUyxDQUFDO0FBQUEsUUFDdEYsV0FBVyxLQUFLLGVBQWUsS0FBSyxVQUFVO0FBRTdDLHFCQUFXLFNBQVMsS0FBSyxVQUFVO0FBQ2xDLGtCQUFNLFNBQVMsTUFBTSxRQUFRO0FBQUEsVUFDOUI7QUFBQSxRQUNEO0FBQUEsTUFDRCxTQUFTLE9BQU87QUFFZixhQUFLLFdBQVcsTUFBTSx5Q0FBeUMsSUFBSSxTQUFTLENBQUMsS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUMxRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsTUFBTTtBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBSUEsTUFBYSxpQkFBaUIsT0FBYyxRQUE0QixPQUFvQyxPQUEwQixTQUFrQyxDQUFDLEdBQXFDO0FBQzdNLFVBQU0sWUFBWSxNQUFNLElBQUksV0FBUyxFQUFFLFVBQVUsV0FBVyxTQUFZLFNBQVMsTUFBTSxNQUFNLElBQUksS0FBSyxFQUFFO0FBQ3hHLFVBQU0sZ0JBQWdCLE1BQU0sS0FBSyxZQUFZLFdBQVcsU0FBUztBQUNqRSxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGFBQU87QUFBQSxJQUNSO0FBQ0EsZUFBVyxRQUFRLGVBQWU7QUFDakMsVUFBSSxLQUFLLFdBQVcsS0FBSyxNQUFNLFVBQVU7QUFDeEMsbUJBQVcsU0FBUyxLQUFLLEtBQUssVUFBVTtBQUN2QyxjQUFJLE1BQU0sUUFBUTtBQUNqQixrQkFBTSxlQUFlLE1BQU0sS0FBSyxPQUFLLGlCQUFpQixFQUFFLFVBQVUsTUFBTSxJQUFJLENBQUM7QUFDN0UsZ0JBQUksY0FBYztBQUNqQixvQkFBTSxXQUFXLE1BQU0saUJBQWlCLE1BQU0sS0FBSyxZQUFZLFNBQVMsTUFBTSxRQUFRLElBQUk7QUFDMUYscUJBQU8sS0FBSyxFQUFFLEtBQUssTUFBTSxVQUFVLFVBQVUsTUFBTSxhQUFhLEtBQUssQ0FBQztBQUFBLFlBQ3ZFO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyw0QkFBNEIsUUFBOEI7QUFDaEUsUUFBSSxPQUFPLEtBQUssU0FBUywwQkFBMEIsR0FBRztBQUNyRCxVQUFJO0FBQ0osWUFBTSxrQkFBa0IsS0FBSyxtQkFBbUIsTUFBTTtBQUN0RCxVQUFJLGlCQUFpQjtBQUNwQixzQkFBYyxTQUFTLGdCQUFnQixLQUFLLHNCQUFzQixtQkFBbUIsTUFBTSxJQUFJLG9CQUFvQjtBQUFBLE1BQ3BILFdBQVcsZ0JBQWdCLFFBQVEsS0FBSyxnQkFBZ0IsZUFBZSxXQUFXLEdBQUc7QUFDcEYsc0JBQWMsU0FBUyxLQUFLLGdCQUFnQixlQUFlLGFBQWEsbUJBQW1CLE1BQU0sSUFBSSxvQkFBb0I7QUFBQSxNQUMxSDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLEtBQVUsT0FBMEM7QUFDekYsUUFBSTtBQUNILFlBQU0sU0FBZ0IsQ0FBQztBQUN2QixZQUFNLE9BQU8sTUFBTSxLQUFLLFlBQVksUUFBUSxHQUFHO0FBQy9DLFVBQUksS0FBSyxlQUFlLEtBQUssVUFBVTtBQUV0QyxtQkFBVyxTQUFTLEtBQUssVUFBVTtBQUNsQyxjQUFJO0FBQ0gsZ0JBQUksTUFBTSx5QkFBeUI7QUFDbEMscUJBQU8sQ0FBQztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxNQUFNLGFBQWE7QUFDdEIsb0JBQU0sWUFBWSxTQUFTLE1BQU0sVUFBVSxjQUFjO0FBQ3pELG9CQUFNLFlBQVksTUFBTSxLQUFLLFlBQVksUUFBUSxTQUFTO0FBQzFELGtCQUFJLFVBQVUsUUFBUTtBQUNyQix1QkFBTyxLQUFLLFVBQVUsUUFBUTtBQUFBLGNBQy9CO0FBQUEsWUFDRDtBQUFBLFVBQ0QsU0FBUyxPQUFPO0FBQUEsVUFFaEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSLFNBQVMsR0FBRztBQUNYLFVBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHO0FBQzVCLGFBQUssV0FBVyxNQUFNLHNEQUFzRCxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUFBLE1BQ25HO0FBQ0EsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWEsZ0JBQWdCLE9BQWtEO0FBQzlFLFVBQU0sc0JBQXNCLEtBQUssdUJBQXVCLFlBQVksS0FBSztBQUN6RSxVQUFNLG9CQUFvQixNQUFNLEtBQUssb0JBQW9CLFlBQVksT0FBTyxtQkFBbUI7QUFDL0YsVUFBTSxhQUE0QixDQUFDO0FBRW5DLGVBQVcsRUFBRSxLQUFLLFFBQVEsUUFBUSxLQUFLLG1CQUFtQjtBQUN6RCxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFDQSxZQUFNLFVBQVUsTUFBTSxLQUFLLHdCQUF3QixLQUFLLEtBQUs7QUFDN0QsaUJBQVcsWUFBWSxTQUFTO0FBQy9CLG1CQUFXLEtBQUssRUFBRSxLQUFLLFVBQVUsUUFBUSxTQUFTLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFBQSxNQUM1RTtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBcDJCYSxxQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBYlU7QUE4MkJOLFNBQVMsZUFBZSxNQUF1QjtBQUNyRCxTQUFPLEtBQUssU0FBUyxHQUFHO0FBQ3pCO0FBTU8sU0FBUyxZQUFZLFNBQTBCO0FBQ3JELE1BQUksaUJBQWlCO0FBQ3JCLE1BQUksc0JBQXNCO0FBRTFCLE1BQUksZ0JBQWdCO0FBQ3BCLE1BQUkscUJBQXFCO0FBRXpCLE1BQUk7QUFDSixhQUFXLFFBQVEsU0FBUztBQUUzQixRQUFJLHNCQUFzQixNQUFNO0FBQy9CLDBCQUFvQjtBQUNwQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQVMsS0FBSztBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksU0FBUyxLQUFLO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxTQUFTLEtBQUs7QUFDakIsdUJBQWlCO0FBQ2pCO0FBRUEsMEJBQW9CO0FBQ3BCO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUyxLQUFLO0FBQ2pCLHVCQUFpQjtBQUNqQjtBQUNBLDBCQUFvQjtBQUNwQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQVMsS0FBSztBQUNqQixzQkFBZ0I7QUFDaEI7QUFDQTtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQVMsS0FBSztBQUNqQixzQkFBZ0I7QUFDaEI7QUFDQSwwQkFBb0I7QUFDcEI7QUFBQSxJQUNEO0FBRUEsd0JBQW9CO0FBQUEsRUFDckI7QUFHQSxNQUFJLGtCQUFtQix3QkFBd0IsR0FBSTtBQUNsRCxXQUFPO0FBQUEsRUFDUjtBQUdBLE1BQUksaUJBQWtCLHVCQUF1QixHQUFJO0FBQ2hELFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTztBQUNSO0FBdUJBLFNBQVMsc0JBQXNCLE1BQW1CLFVBQXNDO0FBQ3ZGLE1BQUksU0FBUyxZQUFZLGdCQUFnQixTQUFTLFlBQVksUUFBUTtBQUVyRSxXQUFPLEVBQUUsWUFBWSxTQUFTO0FBQUEsRUFDL0I7QUFFQSxRQUFNLFdBQVcsU0FBUyxLQUFLLE1BQU0sR0FBRztBQUN4QyxNQUFJLElBQUk7QUFDUixTQUFPLElBQUksU0FBUyxVQUFVLFlBQVksU0FBUyxDQUFDLENBQUMsTUFBTSxPQUFPO0FBQ2pFO0FBQUEsRUFDRDtBQUNBLE1BQUksTUFBTSxTQUFTLFFBQVE7QUFHMUIsV0FBTyxFQUFFLFlBQVksU0FBUztBQUFBLEVBQy9CO0FBQ0EsUUFBTSxTQUFTLFNBQVMsS0FBSyxFQUFFLE1BQU0sU0FBUyxNQUFNLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxFQUFFLENBQUM7QUFDckUsTUFBSSxNQUFNLFNBQVMsU0FBUyxLQUFLLFNBQVMsQ0FBQyxNQUFNLE9BQU8sU0FBUyxDQUFDLE1BQU0sSUFBSTtBQUMzRSxXQUFPLEVBQUUsWUFBWSxPQUFPO0FBQUEsRUFDN0I7QUFHQSxTQUFPO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixhQUFhLFNBQVMsTUFBTSxDQUFDLEVBQUUsS0FBSyxHQUFHO0FBQUEsRUFDeEM7QUFDRDtBQXlCTyxNQUFNLDhCQUE4QjtBQUMzQyxNQUFNLDRCQUE0QixJQUFJLE9BQU8sMkJBQTJCO0FBTWpFLFNBQVMsd0JBQXdCLE1BQXVCO0FBQzlELFNBQU8sMEJBQTBCLEtBQUssSUFBSTtBQUMzQzsiLAogICJuYW1lcyI6IFsiZm9sZGVyIl0KfQo=
