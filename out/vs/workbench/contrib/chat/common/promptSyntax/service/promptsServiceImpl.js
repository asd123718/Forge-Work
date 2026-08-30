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
import { CancellationToken, CancellationTokenPool } from "../../../../../../base/common/cancellation.js";
import { CancellationError, isCancellationError } from "../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { parse as parseJSONC } from "../../../../../../base/common/json.js";
import { getParseErrorMessage } from "../../../../../../base/common/jsonErrorMessages.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { autorun, observableFromEvent } from "../../../../../../base/common/observable.js";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { basename, dirname, isEqual, joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IUserDataProfileService } from "../../../../../services/userDataProfile/common/userDataProfile.js";
import { PromptsConfig } from "../config/config.js";
import { AGENT_MD_FILENAME, CLAUDE_CONFIG_FOLDER, CLAUDE_LOCAL_MD_FILENAME, CLAUDE_MD_FILENAME, COPILOT_CONFIG_FOLDER, COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, DICTATION_INSTRUCTIONS_FILENAME, getCleanPromptName, getSkillFolderName, GITHUB_CONFIG_FOLDER, isInClaudeRulesFolder, VOICE_INSTRUCTIONS_FILENAME } from "../config/promptFileLocations.js";
import { PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target, getPromptsTypeForLanguageId } from "../promptTypes.js";
import { PromptFilesLocator } from "../utils/promptFilesLocator.js";
import { evaluateApplyToPattern, PromptFileParser, PromptHeaderAttributes } from "../promptFileParser.js";
import { IAgentSource, PromptsStorage, AgentInstructionFileType, matchesSessionType } from "./promptsService.js";
import { Delayer, raceCancellationError } from "../../../../../../base/common/async.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { parseSubagentHooksFromYaml } from "../hookSchema.js";
import { HookSourceFormat, parseHooksFromFile } from "../hookCompatibility.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { getTarget, mapClaudeModels, mapClaudeTools } from "../languageProviders/promptFileAttributes.js";
import { getCanonicalPluginCommandId, IAgentPluginService } from "../../plugins/agentPluginService.js";
import { isContributionEnabled } from "../../enablement.js";
import { assertNever } from "../../../../../../base/common/assert.js";
import { ExtensionPromptFileService } from "./extensionPromptFileService.js";
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../../../platform/policy/common/copilotManagedSettings.js";
import { isPromptTypeBlocked } from "../../customizationLockdown.js";
import { isAgentPluginForceEnabledByPolicy } from "../../plugins/agentPluginEnablement.js";
import { ChatConfiguration } from "../../constants.js";
let PromptsService = class extends Disposable {
  constructor(logger, labelService, modelService, instantiationService, userDataService, configurationService, fileService, storageService, telemetryService, workspaceService, pathService, agentPluginService, workspaceTrustService) {
    super();
    this.logger = logger;
    this.labelService = labelService;
    this.modelService = modelService;
    this.instantiationService = instantiationService;
    this.userDataService = userDataService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.workspaceService = workspaceService;
    this.pathService = pathService;
    this.agentPluginService = agentPluginService;
    this.workspaceTrustService = workspaceTrustService;
    this.agentInstructionsWatcher = this._register(new MutableDisposable());
    this._onDidChangeAgentInstructions = this._register(new Emitter({
      onWillAddFirstListener: () => {
        const store = new DisposableStore();
        const agentInstructionsUpdatedEvent = this.fileLocator.createAgentInstructionsUpdatedEvent();
        store.add(agentInstructionsUpdatedEvent);
        store.add(agentInstructionsUpdatedEvent.event(() => this._onDidChangeAgentInstructions.fire()));
        this.agentInstructionsWatcher.value = store;
      },
      onDidRemoveLastListener: () => {
        this.agentInstructionsWatcher.clear();
      }
    }));
    /**
     * Synchronous mirror of the names exposed by {@link getPromptSlashCommands},
     * maintained for {@link hasPromptSlashCommand} so callers (e.g. the chat request
     * parser) can disambiguate `<cmd>:<sub>` vs bare `<cmd>` without an async hop.
     */
    this.knownPromptSlashCommandNames = /* @__PURE__ */ new Set();
    /**
     * Cache for parsed prompt files keyed by URI.
     * The number in the returned tuple is textModel.getVersionId(), which is an internal VS Code counter that increments every time the text model's content changes.
     */
    this.cachedParsedPromptFromModels = new ResourceMap();
    /**
     * Cached file locations commands. Caching only happens if the corresponding `fileLocatorEvents` event is used.
     */
    this.cachedFileLocations = {};
    /**
     * Lazily created events that notify listeners when the file locations for a given prompt type change.
     * An event is created on demand for each prompt type and can be used by consumers to react to updates
     * in the set of prompt files (e.g., when prompt files are added, removed, or modified).
     */
    this.fileLocatorEvents = {};
    this._onDidPluginPromptFilesChange = this._register(new Emitter());
    this._onDidPluginHooksChange = this._register(new Emitter());
    this._pluginPromptFilesByType = /* @__PURE__ */ new Map();
    this.knownPromptSlashCommandsHydrationStarted = false;
    // --- Enabled Prompt Files -----------------------------------------------------------
    this.disabledPromptsStorageKeyPrefix = "chat.disabledPromptFiles.";
    this.fileLocator = this.createPromptFilesLocator();
    this._register(this.modelService.onModelRemoved((model) => {
      this.cachedParsedPromptFromModels.delete(model.uri);
    }));
    this.extensionPromptFiles = this._register(this.instantiationService.createInstance(ExtensionPromptFileService));
    const onDidChangeExtensionPromptFiles = this.extensionPromptFiles.onDidChange;
    const onDidChangeCustomizationLockdown = Event.filter(
      this.configurationService.onDidChangeConfiguration,
      (e) => e.affectsConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG) || e.affectsConfiguration(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG)
    );
    this._register(onDidChangeCustomizationLockdown(() => {
      this.cachedFileLocations[PromptsType.agent] = void 0;
      this.cachedFileLocations[PromptsType.skill] = void 0;
      this.cachedFileLocations[PromptsType.hook] = void 0;
      this.cachedFileLocations[PromptsType.instructions] = void 0;
      this._onDidChangeAgentInstructions.fire();
    }));
    this._register(onDidChangeExtensionPromptFiles((e) => {
      this.cachedFileLocations[e.type] = void 0;
    }));
    const modelChangeEvent = this._register(new ModelChangeTracker(this.modelService)).onDidPromptChange;
    this.cachedCustomAgents = this._register(new CachedPromise(
      (token) => this.computeAgentDiscoveryInfo(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.agent),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.agent),
        Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS)),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.agent),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.agent),
        onDidChangeCustomizationLockdown,
        this.workspaceTrustService.onDidChangeTrust
      )
    ));
    this.cachedSlashCommands = this._register(new CachedPromise(
      (token) => this.computeSlashCommandDiscoveryInfo(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.prompt),
        this.getFileLocatorEvent(PromptsType.skill),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.prompt),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.skill),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.prompt || e.type === PromptsType.skill),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.prompt || t === PromptsType.skill),
        onDidChangeCustomizationLockdown
      )
    ));
    this.cachedSkills = this._register(new CachedPromise(
      (token) => this.computeSkillDiscovery(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.skill),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.skill),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.skill),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.skill),
        onDidChangeCustomizationLockdown
      )
    ));
    this.cachedHooks = this._register(new CachedPromise(
      (token) => this.computeHooks(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.hook),
        Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_HOOKS)),
        onDidChangeCustomizationLockdown,
        this._onDidPluginHooksChange.event,
        this.workspaceTrustService.onDidChangeTrust
      )
    ));
    this.cachedInstructions = this._register(new CachedPromise(
      (token) => this.computeInstructionFiles(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.instructions),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.instructions),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.instructions),
        onDidChangeCustomizationLockdown
      )
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.prompt,
      (plugin, reader) => plugin.commands.read(reader)
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.skill,
      (plugin, reader) => plugin.skills.read(reader)
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.agent,
      (plugin, reader) => plugin.agents.read(reader)
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.instructions,
      (plugin, reader) => plugin.instructions.read(reader)
    ));
    const managedHooksOnly = observableFromEvent(
      this,
      onDidChangeCustomizationLockdown,
      () => this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true
    );
    const enabledPluginsPolicy = observableFromEvent(
      this,
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
      () => this.configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue
    );
    this._register(autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      const managedHooksOnlyValue = managedHooksOnly.read(reader);
      const enabledPluginsPolicyValue = enabledPluginsPolicy.read(reader);
      const hookFiles = [];
      for (const plugin of plugins) {
        if (isContributionEnabled(plugin.enablement.read(reader)) && (!managedHooksOnlyValue || isAgentPluginForceEnabledByPolicy(plugin, enabledPluginsPolicyValue))) {
          for (const hook of plugin.hooks.read(reader)) {
            hookFiles.push({
              uri: hook.uri,
              storage: PromptsStorage.plugin,
              type: PromptsType.hook,
              name: getCanonicalPluginCommandId(plugin, hook.originalId),
              pluginUri: plugin.uri,
              pluginLabel: plugin.label,
              source: PromptFileSource.Plugin
            });
          }
        }
      }
      this._pluginPromptFilesByType.set(PromptsType.hook, hookFiles);
      this.cachedFileLocations[PromptsType.hook] = void 0;
      this._onDidPluginHooksChange.fire();
    }));
  }
  watchPluginPromptFilesForType(type, getItems) {
    return autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      const nextFiles = [];
      for (const plugin of plugins) {
        if (!isContributionEnabled(plugin.enablement.read(reader))) {
          continue;
        }
        for (const item of getItems(plugin, reader)) {
          nextFiles.push({
            uri: item.uri,
            storage: PromptsStorage.plugin,
            type,
            name: getCanonicalPluginCommandId(plugin, item.name),
            pluginUri: plugin.uri,
            pluginLabel: plugin.label,
            source: PromptFileSource.Plugin
          });
        }
      }
      nextFiles.sort((a, b) => `${a.name ?? ""}|${a.uri.toString()}`.localeCompare(`${b.name ?? ""}|${b.uri.toString()}`));
      this._pluginPromptFilesByType.set(type, nextFiles);
      this.cachedFileLocations[type] = void 0;
      this._onDidPluginPromptFilesChange.fire(type);
    });
  }
  createPromptFilesLocator() {
    return this.instantiationService.createInstance(PromptFilesLocator);
  }
  getFileLocatorEvent(type) {
    let event = this.fileLocatorEvents[type];
    if (!event) {
      event = this.fileLocatorEvents[type] = this._register(this.fileLocator.createFilesUpdatedEvent(type)).event;
      this._register(event(() => {
        this.cachedFileLocations[type] = void 0;
      }));
    }
    return event;
  }
  getParsedPromptFile(textModel) {
    const cached = this.cachedParsedPromptFromModels.get(textModel.uri);
    if (cached && cached[0] === textModel.getVersionId()) {
      return cached[1];
    }
    const ast = new PromptFileParser().parse(textModel.uri, textModel.getValue());
    if (!cached || cached[0] < textModel.getVersionId()) {
      this.cachedParsedPromptFromModels.set(textModel.uri, [textModel.getVersionId(), ast]);
    }
    return ast;
  }
  async listPromptFiles(type, token) {
    let listPromise = this.cachedFileLocations[type];
    if (!listPromise) {
      listPromise = this.computeListPromptFiles(type, token);
      if (!this.fileLocatorEvents[type]) {
        return listPromise;
      }
      this.cachedFileLocations[type] = listPromise;
      return listPromise;
    }
    return listPromise;
  }
  async computeListPromptFiles(type, token) {
    const allowStandalone = !this.areStandalonePromptFilesBlocked(type);
    const prompts = await Promise.all([
      allowStandalone ? this.fileLocator.listFilesWithSource(type, PromptsStorage.user, token).then((files) => files.map((file) => ({ ...file, storage: PromptsStorage.user, type }))) : [],
      allowStandalone ? this.fileLocator.listFilesWithSource(type, PromptsStorage.local, token).then((files) => files.map((file) => ({ ...file, storage: PromptsStorage.local, type }))) : [],
      this.getExtensionPromptFiles(type, token),
      this._pluginPromptFilesByType.get(type) ?? [],
      this.getBuiltinPromptFiles(type, token)
    ]);
    return prompts.flat();
  }
  /**
   * Collects diagnostic information about which source folders were searched for display in the debug panel.
   */
  async _collectSourceFolderDiagnostics(type) {
    if (this.areStandalonePromptFilesBlocked(type)) {
      return [];
    }
    const resolvedFolders = await this.fileLocator.getSourceFoldersInDiscoveryOrder(type);
    return resolvedFolders.map((folder) => ({
      uri: folder.uri,
      storage: folder.storage
    }));
  }
  /**
   * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
   * This will be called by the extension host bridge when
   * an extension registers a provider via vscode.chat.registerCustomAgentProvider(),
   * registerInstructionsProvider(), or registerPromptFileProvider().
   */
  registerPromptFileProvider(extension, type, provider) {
    return this.extensionPromptFiles.registerPromptFileProvider(extension, type, provider);
  }
  async listPromptFilesForStorage(type, storage, token, root) {
    let promptPaths;
    switch (storage) {
      case PromptsStorage.extension:
        promptPaths = await this.getExtensionPromptFiles(type, token);
        break;
      case PromptsStorage.local:
        promptPaths = this.areStandalonePromptFilesBlocked(type) ? [] : await this.fileLocator.listFilesWithSource(type, PromptsStorage.local, token, root).then((files) => files.map((file) => ({ ...file, storage: PromptsStorage.local, type })));
        break;
      case PromptsStorage.user:
        promptPaths = this.areStandalonePromptFilesBlocked(type) ? [] : await this.fileLocator.listFilesWithSource(type, PromptsStorage.user, token).then((files) => files.map((file) => ({ ...file, storage: PromptsStorage.user, type })));
        break;
      case PromptsStorage.plugin:
        promptPaths = this._pluginPromptFilesByType.get(type) ?? [];
        break;
      case PromptsStorage.builtIn:
        promptPaths = await this.getBuiltinPromptFiles(type, token);
        break;
      default:
        throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
    }
    return promptPaths;
  }
  getExtensionPromptFiles(type, token) {
    return this.extensionPromptFiles.getExtensionPromptFiles(type, token);
  }
  /**
   * Returns the built-in prompt files of the given type. The base service ships
   * no built-in prompts; subclasses (e.g. the Agents app) override this to
   * contribute bundled prompts such as built-in skills.
   */
  async getBuiltinPromptFiles(type, token) {
    return [];
  }
  async getSourceFolders(type) {
    if (this.areStandalonePromptFilesBlocked(type)) {
      return [];
    }
    const result = [];
    if (type === PromptsType.hook) {
      const hooksFolders = await this.fileLocator.getHookSourceFolders();
      for (const folder of hooksFolders) {
        result.push({ uri: folder.uri, storage: folder.storage, type, source: folder.source });
      }
      return result;
    }
    if (type === PromptsType.skill) {
      const resolvedFolders = await this.fileLocator.getResolvedSourceFolders(type);
      for (const folder of resolvedFolders) {
        result.push({ uri: folder.searchRoot, storage: folder.storage, type, source: folder.source });
      }
      return result;
    }
    for (const uri of await this.fileLocator.getConfigBasedSourceFolders(type)) {
      result.push({ uri, storage: PromptsStorage.local, type });
    }
    const userHome = this.userDataService.currentProfile.promptsHome;
    result.push({ uri: userHome, storage: PromptsStorage.user, type });
    return result;
  }
  async getResolvedSourceFolders(type) {
    if (this.areStandalonePromptFilesBlocked(type)) {
      return [];
    }
    return this.fileLocator.getResolvedSourceFolders(type);
  }
  areStandalonePromptFilesBlocked(type) {
    const strictPluginOnly = this.configurationService.getValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
    return isPromptTypeBlocked(strictPluginOnly, type) || type === PromptsType.hook && this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true;
  }
  areAgentHooksAllowed(promptPath) {
    if (this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true) {
      if (promptPath.storage !== PromptsStorage.plugin || !promptPath.pluginUri) {
        return false;
      }
      const plugin = this.agentPluginService.plugins.get().find((candidate) => isEqual(candidate.uri, promptPath.pluginUri));
      const enabledPluginsPolicy = this.configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue;
      return plugin !== void 0 && isAgentPluginForceEnabledByPolicy(plugin, enabledPluginsPolicy);
    }
    const strictPluginOnly = this.configurationService.getValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
    return !isPromptTypeBlocked(strictPluginOnly, PromptsType.hook) || promptPath.storage !== PromptsStorage.local && promptPath.storage !== PromptsStorage.user;
  }
  // slash prompt commands
  /**
   * Emitter for slash commands change events.
   */
  get onDidChangeSlashCommands() {
    return this.cachedSlashCommands.onDidChangePromise;
  }
  async getPromptSlashCommands(token) {
    const discoveryInfo = await this.cachedSlashCommands.get(token);
    const result = this.slashCommandsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  /**
   * Computes discovery info for slash commands, combining prompts and skills.
   */
  async computeSlashCommandDiscoveryInfo(token) {
    const stopWatch = StopWatch.create(true);
    const promptFiles = await this.listPromptFiles(PromptsType.prompt, token);
    const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
    const skills = useAgentSkills ? await this.listPromptFiles(PromptsType.skill, token) : [];
    const disabledSkills = this.getDisabledPromptFiles(PromptsType.skill);
    const enabledSkills = skills.filter((s) => !disabledSkills.has(s.uri)).sort((a, b) => this.getSkillPriority(a) - this.getSkillPriority(b));
    const slashCommandFiles = [
      ...promptFiles,
      ...enabledSkills
    ];
    const parseResults = await Promise.all(slashCommandFiles.map(async (promptPath) => {
      try {
        const parsedPromptFile = await this.parseNew(promptPath.uri, token);
        let rawName;
        if (promptPath.type === PromptsType.skill) {
          rawName = getSkillFolderName(promptPath.uri);
        } else {
          rawName = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(promptPath.uri);
        }
        const name = promptPath.source === PromptFileSource.Plugin && promptPath.pluginUri ? getCanonicalPluginCommandId({ uri: promptPath.pluginUri, label: promptPath.pluginLabel }, rawName) : rawName;
        const description = parsedPromptFile?.header?.description ?? promptPath.description;
        const argumentHint = parsedPromptFile?.header?.argumentHint;
        const userInvocable = parsedPromptFile?.header?.userInvocable;
        return { status: "loaded", promptPath: this.withPromptPathMetadata(promptPath, name, description), argumentHint, userInvocable };
      } catch (e) {
        if (!isCancellationError(e)) {
          this.logger.error(`[computeSlashCommandDiscoveryInfo] Failed to parse prompt file for slash command: ${promptPath.uri}`, e instanceof Error ? e.message : String(e));
        }
        return { status: "skipped", skipReason: "parse-error", errorMessage: e instanceof Error ? e.message : String(e), promptPath };
      }
    }));
    const seenSkillNames = /* @__PURE__ */ new Set();
    const files = [];
    for (const result of parseResults) {
      if (result.status === "loaded" && result.promptPath.type === PromptsType.skill) {
        const name = result.promptPath.name;
        if (name !== void 0) {
          if (seenSkillNames.has(name)) {
            files.push({ status: "skipped", skipReason: "duplicate-name", promptPath: result.promptPath });
            continue;
          }
          seenSkillNames.add(name);
        }
      }
      files.push(result);
    }
    const promptSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.prompt);
    const sourceFolders = [...promptSourceFolders];
    if (useAgentSkills) {
      const skillSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
      sourceFolders.push(...skillSourceFolders);
    }
    return { type: PromptsType.prompt, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
  /**
   * Derives IChatPromptSlashCommand[] from cached discovery info.
   */
  slashCommandsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    const seen = new ResourceSet();
    for (const file of discoveryInfo.files) {
      if (file.status === "loaded") {
        result.push(this.asChatPromptSlashCommand(file.argumentHint, file.userInvocable, file.promptPath));
        seen.add(file.promptPath.uri);
      }
    }
    for (const model of this.modelService.getModels()) {
      if (model.getLanguageId() === PROMPT_LANGUAGE_ID && model.uri.scheme === Schemas.untitled && !seen.has(model.uri)) {
        const parsedPromptFile = this.getParsedPromptFile(model);
        const name = parsedPromptFile?.header?.name ?? getCleanPromptName(model.uri);
        const description = parsedPromptFile?.header?.description;
        result.push(this.asChatPromptSlashCommand(parsedPromptFile?.header?.argumentHint, parsedPromptFile?.header?.userInvocable, { uri: model.uri, storage: PromptsStorage.local, type: PromptsType.prompt, name, description }));
      }
    }
    return result;
  }
  isValidSlashCommandName(command) {
    return command.match(/^[\p{L}\d_\-\.:]+$/u) !== null;
  }
  hasPromptSlashCommand(name) {
    if (!this.knownPromptSlashCommandsHydrationStarted) {
      this.knownPromptSlashCommandsHydrationStarted = true;
      this.refreshKnownPromptSlashCommandNames();
      this._register(this.onDidChangeSlashCommands(() => this.refreshKnownPromptSlashCommandNames()));
    }
    return this.knownPromptSlashCommandNames.has(name);
  }
  refreshKnownPromptSlashCommandNames() {
    this.getPromptSlashCommands(CancellationToken.None).then((commands) => {
      this.knownPromptSlashCommandNames.clear();
      for (const cmd of commands) {
        this.knownPromptSlashCommandNames.add(cmd.name);
      }
    }, () => {
    });
  }
  async resolvePromptSlashCommand(name, sessionType, token) {
    const commands = await this.getPromptSlashCommands(token);
    const command = commands.find((cmd) => cmd.name === name && matchesSessionType(cmd.sessionTypes, sessionType));
    if (command) {
      return {
        ...command,
        parsedPromptFile: await this.parseNew(command.uri, token)
      };
    }
    return void 0;
  }
  asChatPromptSlashCommand(argumentHint, userInvocable, promptPath) {
    let name = promptPath.name ?? getCleanPromptName(promptPath.uri);
    name = name.replace(/[^\p{L}\d_\-\.:]+/gu, "-");
    return {
      uri: promptPath.uri,
      name,
      source: promptPath.source,
      storage: promptPath.storage,
      type: promptPath.type,
      extension: promptPath.extension,
      pluginUri: promptPath.pluginUri,
      pluginLabel: promptPath.pluginLabel,
      description: promptPath.description,
      argumentHint,
      userInvocable: userInvocable ?? true,
      sessionTypes: promptPath.sessionTypes
    };
  }
  async getPromptSlashCommandName(uri, token) {
    const slashCommands = await this.getPromptSlashCommands(token);
    const slashCommand = slashCommands.find((c) => isEqual(c.uri, uri));
    if (!slashCommand) {
      return getCleanPromptName(uri);
    }
    return slashCommand.name;
  }
  // custom agents
  /**
   * Emitter for custom agents change events.
   */
  get onDidChangeCustomAgents() {
    return this.cachedCustomAgents.onDidChangePromise;
  }
  get onDidChangeInstructions() {
    return this.cachedInstructions.onDidChangePromise;
  }
  get onDidChangeAgentInstructions() {
    return this._onDidChangeAgentInstructions.event;
  }
  async getCustomAgents(token) {
    const discoveryInfo = await this.cachedCustomAgents.get(token);
    const result = this.agentsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  /**
   * Derives ICustomAgent[] from cached discovery info.
   */
  agentsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    for (const file of discoveryInfo.files) {
      if (file.agent) {
        result.push(file.agent);
      }
    }
    return result;
  }
  async computeAgentDiscoveryInfo(token) {
    const stopWatch = StopWatch.create(true);
    const allAgentFiles = await this.listPromptFiles(PromptsType.agent, token);
    const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);
    const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);
    const isWorkspaceTrusted = this.workspaceTrustService.isWorkspaceTrusted();
    const userHomeUri = await this.pathService.userHome();
    const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
    const defaultFolder = this.workspaceService.getWorkspace().folders[0];
    const files = await Promise.all(allAgentFiles.map(async (promptPath) => {
      const uri = promptPath.uri;
      const isEnabled = !disabledAgents.has(uri);
      try {
        const ast = await this.parseNew(uri, token);
        let hooks;
        const hooksRaw = ast.header?.hooksRaw;
        if (useChatHooks && isWorkspaceTrusted && hooksRaw && this.areAgentHooksAllowed(promptPath)) {
          const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(uri) ?? defaultFolder;
          const workspaceRootUri = hookWorkspaceFolder?.uri;
          const target = getTarget(PromptsType.agent, ast.header ?? promptPath.uri);
          hooks = parseSubagentHooksFromYaml(hooksRaw, workspaceRootUri, userHome, target);
        }
        const extra = {
          sessionTypes: promptPath.sessionTypes,
          hooks,
          name: promptPath.name,
          description: promptPath.description,
          source: IAgentSource.fromPromptPath(promptPath),
          enabled: isEnabled
        };
        const agent = CustomAgent.fromParsedPromptFile(ast, extra);
        const status = isEnabled ? "loaded" : "skipped";
        const skipReason = isEnabled ? void 0 : "disabled";
        return { status, skipReason, promptPath: this.withPromptPathMetadata(promptPath, agent.name, agent.description), agent };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
          this.logger.warn(`[computeAgentDiscoveryInfo] Skipping agent file that does not exist: ${uri}`, error.message);
        } else if (!isCancellationError(e)) {
          this.logger.error(`[computeAgentDiscoveryInfo] Failed to parse agent file: ${uri}`, error);
        }
        return {
          status: "skipped",
          skipReason: "parse-error",
          errorMessage: error.message,
          promptPath
        };
      }
    }));
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.agent);
    return { type: PromptsType.agent, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
  async parseNew(uri, token) {
    const model = this.modelService.getModel(uri);
    if (model) {
      return this.getParsedPromptFile(model);
    }
    const fileContent = await this.fileService.readFile(uri);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return new PromptFileParser().parse(uri, fileContent.value.toString());
  }
  registerContributedFile(type, uri, extension, name, description, when, sessionTypes) {
    return this.extensionPromptFiles.registerContributedFile(type, uri, extension, name, description, when, sessionTypes);
  }
  getPromptLocationLabel(promptPath) {
    switch (promptPath.storage) {
      case PromptsStorage.local:
        return this.labelService.getUriLabel(dirname(promptPath.uri), { relative: true });
      case PromptsStorage.user:
        return localize("user-data-dir.capitalized", "User Data");
      case PromptsStorage.extension: {
        return localize("extension.with.id", "Extension: {0}", promptPath.extension.displayName ?? promptPath.extension.id);
      }
      case PromptsStorage.plugin:
        return localize("plugin.capitalized", "Plugin");
      case PromptsStorage.builtIn:
        return localize("builtin.capitalized", "Built-in");
      default:
        assertNever(promptPath, "Unknown prompt storage type");
    }
  }
  async listNestedAgentMDs(token) {
    if (this.areStandalonePromptFilesBlocked(PromptsType.instructions)) {
      return [];
    }
    const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
    if (!useAgentMD) {
      return [];
    }
    const useNestedAgentMD = this.configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
    if (useNestedAgentMD) {
      return await this.fileLocator.findAgentMDsInWorkspace(token);
    }
    return [];
  }
  async listAgentInstructions(token, logger) {
    if (this.areStandalonePromptFilesBlocked(PromptsType.instructions)) {
      return [];
    }
    const resolvedAgentFiles = [];
    const promises = [];
    const includeParents = this.configurationService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
    const rootFolders = await this.fileLocator.getWorkspaceFolderRoots(includeParents, logger);
    const rootFiles = [];
    const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
    if (!useAgentMD) {
      logger?.logInfo("Agent MD files are disabled via configuration.");
    } else {
      rootFiles.push({ fileName: AGENT_MD_FILENAME, type: AgentInstructionFileType.agentsMd });
    }
    const useClaudeMD = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_MD);
    if (!useClaudeMD) {
      logger?.logInfo("Claude MD files are disabled via configuration.");
    } else {
      const claudeMdFile = { fileName: CLAUDE_MD_FILENAME, type: AgentInstructionFileType.claudeMd };
      rootFiles.push(claudeMdFile);
      rootFiles.push({ fileName: CLAUDE_LOCAL_MD_FILENAME, type: AgentInstructionFileType.claudeMd });
      promises.push(this.fileLocator.findFilesInRoots(rootFolders, CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles));
      promises.push(this.fileLocator.findFilesInRoots([await this.pathService.userHome()], CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles));
    }
    const useCopilotInstructionsFiles = this.configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
    if (!useCopilotInstructionsFiles) {
      logger?.logInfo("Copilot instructions files are disabled via configuration.");
    } else {
      const copilotInstructionsFile = { fileName: COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, type: AgentInstructionFileType.copilotInstructionsMd };
      promises.push(this.fileLocator.findFilesInRoots(rootFolders, GITHUB_CONFIG_FOLDER, [copilotInstructionsFile], token, resolvedAgentFiles));
      promises.push(this.fileLocator.findFilesInRoots([await this.pathService.userHome()], COPILOT_CONFIG_FOLDER, [copilotInstructionsFile], token, resolvedAgentFiles));
    }
    promises.push(this.fileLocator.findFilesInRoots(rootFolders, void 0, rootFiles, token, resolvedAgentFiles));
    await Promise.all(promises);
    if (token.isCancellationRequested) {
      return [];
    }
    const seenFileURI = new ResourceSet();
    const symlinks = [];
    const result = [];
    const add = (file) => {
      if (file.realPath) {
        symlinks.push(file);
      } else {
        result.push(file);
        seenFileURI.add(file.uri);
      }
      return true;
    };
    resolvedAgentFiles.forEach(add);
    for (const symlink of symlinks) {
      if (seenFileURI.has(symlink.realPath)) {
        logger?.logInfo(`Skipping symlinked agent instructions file ${symlink.uri} as target already included: ${symlink.realPath}`);
      } else {
        result.push(symlink);
        seenFileURI.add(symlink.realPath);
      }
    }
    return result.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
  }
  async getVoiceInstructions(token) {
    return this.getSpeechInstructions(VOICE_INSTRUCTIONS_FILENAME, "voice", token);
  }
  async getDictationInstructions(token) {
    return this.getSpeechInstructions(DICTATION_INSTRUCTIONS_FILENAME, "dictation", token);
  }
  async getSpeechInstructions(fileName, kind, token) {
    const userHome = await this.pathService.userHome();
    if (token.isCancellationRequested) {
      return void 0;
    }
    const candidates = [joinPath(userHome, COPILOT_CONFIG_FOLDER, fileName)];
    if (this.workspaceTrustService.isWorkspaceTrusted()) {
      const workspaceRoots = await this.fileLocator.getWorkspaceFolderRoots(false);
      if (token.isCancellationRequested) {
        return void 0;
      }
      candidates.push(...workspaceRoots.map((root) => joinPath(root, GITHUB_CONFIG_FOLDER, fileName)));
    }
    const contents = [];
    for (const candidate of candidates) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      try {
        const content = (await this.fileService.readFile(candidate, void 0, token)).value.toString().trim();
        if (token.isCancellationRequested) {
          return void 0;
        }
        if (content) {
          contents.push(content);
        }
      } catch (error) {
        if (token.isCancellationRequested || isCancellationError(error)) {
          return void 0;
        }
        if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
          this.logger.warn(`[PromptsService] Failed to read ${kind} instructions from ${candidate.toString()}: ${error}`);
        }
      }
    }
    return contents.length > 0 ? contents.join("\n\n") : void 0;
  }
  getAgentFileURIFromModeFile(oldURI) {
    return this.fileLocator.getAgentFileURIFromModeFile(oldURI);
  }
  getDisabledPromptFiles(type) {
    const disabledKey = this.disabledPromptsStorageKeyPrefix + type;
    const value = this.storageService.get(disabledKey, StorageScope.PROFILE, "[]");
    const result = new ResourceSet();
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr)) {
        for (const s of arr) {
          try {
            result.add(URI.revive(s));
          } catch {
          }
        }
      }
    } catch {
    }
    return result;
  }
  setDisabledPromptFiles(type, uris) {
    const disabled = Array.from(uris).map((uri) => uri.toJSON());
    this.storageService.store(this.disabledPromptsStorageKeyPrefix + type, JSON.stringify(disabled), StorageScope.PROFILE, StorageTarget.USER);
    if (type === PromptsType.agent) {
      this.cachedCustomAgents.refresh();
    } else if (type === PromptsType.skill) {
      this.cachedSkills.refresh();
      this.cachedSlashCommands.refresh();
    }
  }
  // Agent skills
  sanitizeAgentSkillText(text) {
    return text.replace(/<[^>]+>/g, "");
  }
  truncateAgentSkillName(name, uri) {
    const MAX_NAME_LENGTH = 64;
    const sanitized = this.sanitizeAgentSkillText(name);
    if (sanitized !== name) {
      this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_NAME_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_NAME_LENGTH);
    }
    return sanitized;
  }
  truncateAgentSkillDescription(description, uri) {
    if (!description) {
      return void 0;
    }
    const MAX_DESCRIPTION_LENGTH = 1024;
    const sanitized = this.sanitizeAgentSkillText(description);
    if (sanitized !== description) {
      this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
    }
    return sanitized;
  }
  get onDidChangeSkills() {
    return this.cachedSkills.onDidChangePromise;
  }
  get onDidChangeHooks() {
    return this.cachedHooks.onDidChangePromise;
  }
  async findAgentSkills(token) {
    const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
    if (!useAgentSkills) {
      return void 0;
    }
    const discoveryInfo = await this.cachedSkills.get(token);
    const result = this.skillsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  /**
   * Derives IAgentSkill[] from cached discovery info.
   */
  skillsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    for (const file of discoveryInfo.files) {
      if (file.status === "loaded" && file.promptPath.name) {
        const sanitizedDescription = this.truncateAgentSkillDescription(file.promptPath.description, file.promptPath.uri);
        result.push({
          uri: file.promptPath.uri,
          storage: file.promptPath.storage,
          name: file.promptPath.name,
          description: sanitizedDescription,
          disableModelInvocation: file.disableModelInvocation ?? false,
          userInvocable: file.userInvocable ?? true,
          pluginUri: file.promptPath.pluginUri,
          pluginLabel: file.promptPath.pluginLabel,
          extension: file.promptPath.extension,
          sessionTypes: file.promptPath.sessionTypes
        });
      }
    }
    return result;
  }
  /**
   * Computes the full skill discovery info, including source folders and telemetry.
   */
  async computeSkillDiscovery(token) {
    const stopWatch = StopWatch.create(true);
    const files = await this.computeSkillDiscoveryInfo(token);
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
    const skillsBySource = /* @__PURE__ */ new Map();
    for (const file of files) {
      if (file.status === "loaded" && file.promptPath.name) {
        const source = file.promptPath.source;
        if (source) {
          skillsBySource.set(source, (skillsBySource.get(source) || 0) + 1);
        }
      }
    }
    let skippedMissingName = 0;
    let skippedMissingDescription = 0;
    let skippedDuplicateName = 0;
    let skippedParseFailed = 0;
    let skippedNameMismatch = 0;
    for (const file of files) {
      if (file.status === "skipped") {
        switch (file.skipReason) {
          case "missing-name":
            skippedMissingName++;
            break;
          case "missing-description":
            skippedMissingDescription++;
            break;
          case "duplicate-name":
            skippedDuplicateName++;
            break;
          case "name-mismatch":
            skippedNameMismatch++;
            break;
          case "parse-error":
            skippedParseFailed++;
            break;
        }
      }
    }
    const totalSkillsFound = files.filter((f) => f.status === "loaded" && f.promptPath.name).length;
    this.telemetryService.publicLog2("agentSkillsFound", {
      totalSkillsFound,
      claudePersonal: skillsBySource.get(PromptFileSource.ClaudePersonal) ?? 0,
      claudeWorkspace: skillsBySource.get(PromptFileSource.ClaudeWorkspace) ?? 0,
      copilotPersonal: skillsBySource.get(PromptFileSource.CopilotPersonal) ?? 0,
      githubWorkspace: skillsBySource.get(PromptFileSource.GitHubWorkspace) ?? 0,
      agentsPersonal: skillsBySource.get(PromptFileSource.AgentsPersonal) ?? 0,
      agentsWorkspace: skillsBySource.get(PromptFileSource.AgentsWorkspace) ?? 0,
      configWorkspace: skillsBySource.get(PromptFileSource.ConfigWorkspace) ?? 0,
      configPersonal: skillsBySource.get(PromptFileSource.ConfigPersonal) ?? 0,
      extensionContribution: skillsBySource.get(PromptFileSource.ExtensionContribution) ?? 0,
      extensionAPI: skillsBySource.get(PromptFileSource.ExtensionAPI) ?? 0,
      plugin: skillsBySource.get(PromptFileSource.Plugin) ?? 0,
      skippedDuplicateName,
      skippedMissingName,
      skippedMissingDescription,
      skippedNameMismatch,
      skippedParseFailed
    });
    return { type: PromptsType.skill, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
  async getHooks(token) {
    const discoveryInfo = await this.cachedHooks.get(token);
    const result = discoveryInfo.hooksInfo;
    return result;
  }
  async getDiscoveryInfo(type, token) {
    switch (type) {
      case PromptsType.instructions:
        return this.cachedInstructions.get(token);
      case PromptsType.prompt:
        return this.cachedSlashCommands.get(token);
      case PromptsType.agent:
        return this.cachedCustomAgents.get(token);
      case PromptsType.skill:
        return this.cachedSkills.get(token);
      case PromptsType.hook:
        return this.cachedHooks.get(token);
    }
  }
  async getInstructionFiles(token) {
    const discoveryInfo = await this.cachedInstructions.get(token);
    const result = this.instructionsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  instructionsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    for (const file of discoveryInfo.files) {
      if (file.status === "loaded" && file.promptPath.name) {
        result.push({
          uri: file.promptPath.uri,
          storage: file.promptPath.storage,
          extension: file.promptPath.extension,
          pluginUri: file.promptPath.pluginUri,
          source: file.promptPath.source,
          name: file.promptPath.name,
          description: file.promptPath.description,
          pattern: file.pattern,
          sessionTypes: file.promptPath.sessionTypes
        });
      }
    }
    return result;
  }
  withPromptPathMetadata(promptPath, name, description) {
    return { ...promptPath, name, description };
  }
  async computeInstructionFiles(token) {
    return await this.getInstructionsDiscoveryInfo(token);
  }
  async computeHooks(token) {
    const stopWatch = StopWatch.create(true);
    const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);
    if (!useChatHooks || !this.workspaceTrustService.isWorkspaceTrusted()) {
      const hookFiles2 = await this.listPromptFiles(PromptsType.hook, token);
      const skipReason = !useChatHooks ? "disabled" : "workspace-untrusted";
      const files2 = hookFiles2.map((promptPath) => ({
        status: "skipped",
        skipReason,
        promptPath: this.withPromptPathMetadata(promptPath, basename(promptPath.uri), promptPath.description)
      }));
      const sourceFolders2 = await this._collectSourceFolderDiagnostics(PromptsType.hook);
      return { type: PromptsType.hook, files: files2, sourceFolders: sourceFolders2, hooksInfo: void 0, durationInMillis: stopWatch.elapsed() };
    }
    const useClaudeHooks = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_HOOKS);
    const hookFiles = await this.listPromptFiles(PromptsType.hook, token);
    this.logger.trace(`[PromptsService] Found ${hookFiles.length} hook file(s).`);
    const userHomeUri = await this.pathService.userHome();
    const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
    const defaultFolder = this.workspaceService.getWorkspace().folders[0];
    const fileResults = await Promise.all(hookFiles.map(async (hookFile) => {
      const name = basename(hookFile.uri);
      if (hookFile.storage === PromptsStorage.plugin) {
        return {
          file: {
            status: "loaded",
            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
          }
        };
      }
      try {
        const content = await this.fileService.readFile(hookFile.uri);
        const parseErrors = [];
        const json = parseJSONC(content.value.toString(), parseErrors);
        if (parseErrors.length > 0) {
          const first = parseErrors[0];
          const message = getParseErrorMessage(first.error) || "Invalid JSON";
          return {
            file: {
              status: "skipped",
              skipReason: "parse-error",
              errorMessage: `${message} at offset ${first.offset}`,
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            }
          };
        }
        if (!json || typeof json !== "object") {
          return {
            file: {
              status: "skipped",
              skipReason: "parse-error",
              errorMessage: "Invalid hooks file: must be a JSON object",
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            }
          };
        }
        const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(hookFile.uri) ?? defaultFolder;
        const workspaceRootUri = hookWorkspaceFolder?.uri;
        const { format, hooks: parsedHooks, disabledAllHooks } = parseHooksFromFile(hookFile.uri, json, workspaceRootUri, userHome);
        if (disabledAllHooks) {
          this.logger.trace(`[PromptsService] Skipping hook file with disableAllHooks: ${hookFile.uri}`);
          return {
            file: {
              status: "skipped",
              skipReason: "all-hooks-disabled",
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            }
          };
        }
        if (format === HookSourceFormat.Claude && useClaudeHooks === false) {
          const hasAnyCommands = [...parsedHooks.values()].some(({ hooks: cmds }) => cmds.length > 0);
          this.logger.trace(`[PromptsService] Skipping Claude hook file (disabled via setting): ${hookFile.uri}`);
          return {
            file: {
              status: "skipped",
              skipReason: "claude-hooks-disabled",
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            },
            hasDisabledClaudeHooks: hasAnyCommands
          };
        }
        const hooks = /* @__PURE__ */ new Map();
        for (const [hookType, { hooks: commands }] of parsedHooks) {
          for (const command of commands) {
            let bucket = hooks.get(hookType);
            if (!bucket) {
              bucket = [];
              hooks.set(hookType, bucket);
            }
            bucket.push(command);
            this.logger.trace(`[PromptsService] Collected ${hookType} hook from ${hookFile.uri} (format: ${format})`);
          }
        }
        return {
          file: { status: "loaded", promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description) },
          hooks,
          sourceUri: hookFile.uri
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[PromptsService] Failed to parse hook file: ${hookFile.uri}`, error);
        return {
          file: {
            status: "skipped",
            skipReason: "parse-error",
            errorMessage: msg,
            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
          }
        };
      }
    }));
    const files = [];
    let hasDisabledClaudeHooks = false;
    const collectedHooks = /* @__PURE__ */ new Map();
    for (const { file, hooks, sourceUri, hasDisabledClaudeHooks: disabled } of fileResults) {
      if (file) {
        files.push(file);
      }
      if (disabled) {
        hasDisabledClaudeHooks = true;
      }
      if (hooks && sourceUri) {
        for (const [hookType, commands] of hooks) {
          let bucket = collectedHooks.get(hookType);
          if (!bucket) {
            bucket = [];
            collectedHooks.set(hookType, bucket);
          }
          for (const command of commands) {
            bucket.push({ ...command, sourceUri });
          }
        }
      }
    }
    const plugins = this.agentPluginService.plugins.get();
    const managedHooksOnlyValue = this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true;
    const enabledPluginsPolicyValue = this.configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue;
    for (const plugin of plugins) {
      if (!isContributionEnabled(plugin.enablement.get()) || managedHooksOnlyValue && !isAgentPluginForceEnabledByPolicy(plugin, enabledPluginsPolicyValue)) {
        continue;
      }
      for (const hook of plugin.hooks.get()) {
        let bucket = collectedHooks.get(hook.type);
        if (!bucket) {
          bucket = [];
          collectedHooks.set(hook.type, bucket);
        }
        for (const command of hook.hooks) {
          bucket.push({ ...command, sourceUri: hook.uri });
        }
      }
    }
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.hook);
    if (collectedHooks.size === 0) {
      this.logger.trace("[PromptsService] No valid hooks collected.");
      return { type: PromptsType.hook, files, sourceFolders, hooksInfo: void 0, durationInMillis: stopWatch.elapsed() };
    }
    const result = Object.fromEntries(collectedHooks);
    this.logger.trace(`[PromptsService] Collected hooks: ${JSON.stringify(Object.keys(result))}`);
    return { type: PromptsType.hook, files, sourceFolders, hooksInfo: { hooks: result, hasDisabledClaudeHooks }, durationInMillis: stopWatch.elapsed() };
  }
  /**
   * Precedence used when deduplicating skills that share the same canonical
   * name: workspace > personal > plugin > extension API > extension contribution.
   * Lower numbers win.
   */
  getSkillPriority(skill) {
    if (skill.storage === PromptsStorage.local) {
      return 0;
    }
    if (skill.storage === PromptsStorage.user) {
      return 1;
    }
    if (skill.storage === PromptsStorage.plugin) {
      return 2;
    }
    if (skill.source === PromptFileSource.ExtensionAPI) {
      return 3;
    }
    if (skill.source === PromptFileSource.ExtensionContribution) {
      return 4;
    }
    return 5;
  }
  /**
   * Returns the discovery results for skill files.
   */
  async computeSkillDiscoveryInfo(token) {
    const files = [];
    const seenNames = /* @__PURE__ */ new Set();
    const nameToUri = /* @__PURE__ */ new Map();
    const allSkills = [];
    const standaloneSkills = this.areStandalonePromptFilesBlocked(PromptsType.skill) ? [] : await this.fileLocator.findAgentSkills(token);
    const skills = await Promise.all([
      Promise.resolve(standaloneSkills),
      this.getExtensionPromptFiles(PromptsType.skill, token),
      Promise.resolve(this._pluginPromptFilesByType.get(PromptsType.skill) ?? []),
      this.getBuiltinPromptFiles(PromptsType.skill, token)
    ]);
    for (const skillList of skills) {
      allSkills.push(...skillList);
    }
    allSkills.sort((a, b) => this.getSkillPriority(a) - this.getSkillPriority(b));
    for (const skill of allSkills) {
      const uri = skill.uri;
      const promptPath = skill;
      try {
        const parsedFile = await this.parseNew(uri, token);
        const folderName = getSkillFolderName(uri);
        let name = parsedFile.header?.name;
        const description = parsedFile.header?.description;
        if (!name) {
          this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
          name = folderName;
        }
        let sanitizedName = this.truncateAgentSkillName(name, uri);
        if (sanitizedName !== folderName) {
          this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
          sanitizedName = folderName;
        }
        if (seenNames.has(sanitizedName)) {
          this.logger.debug(`[computeSkillDiscoveryInfo] Skipping duplicate agent skill name: ${sanitizedName} at ${uri}`);
          files.push({ status: "skipped", skipReason: "duplicate-name", duplicateOf: nameToUri.get(sanitizedName), promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description) });
          continue;
        }
        seenNames.add(sanitizedName);
        nameToUri.set(sanitizedName, uri);
        const disableModelInvocation = parsedFile.header?.disableModelInvocation === true;
        const userInvocable = parsedFile.header?.userInvocable !== false;
        files.push({ status: "loaded", promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description), disableModelInvocation, userInvocable });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[computeSkillDiscoveryInfo] Failed to validate Agent skill file: ${uri}`, msg);
        files.push({
          status: "skipped",
          skipReason: "parse-error",
          errorMessage: msg,
          promptPath
        });
      }
    }
    return files;
  }
  async getInstructionsDiscoveryInfo(token) {
    const stopWatch = StopWatch.create(true);
    const files = [];
    const instructionsFiles = await this.listPromptFiles(PromptsType.instructions, token);
    for (const promptPath of instructionsFiles) {
      const uri = promptPath.uri;
      try {
        const parsedPromptFile = await this.parseNew(uri, token);
        const name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
        const description = parsedPromptFile?.header?.description ?? promptPath.description;
        const pattern = evaluateApplyToPattern(parsedPromptFile.header, isInClaudeRulesFolder(uri));
        files.push({
          status: "loaded",
          pattern,
          promptPath: this.withPromptPathMetadata(promptPath, name, description)
        });
      } catch (e) {
        files.push({
          status: "skipped",
          skipReason: "parse-error",
          errorMessage: e instanceof Error ? e.message : String(e),
          promptPath
        });
      }
    }
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.instructions);
    return { type: PromptsType.instructions, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
};
PromptsService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IUserDataProfileService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IPathService),
  __decorateParam(11, IAgentPluginService),
  __decorateParam(12, IWorkspaceTrustManagementService)
], PromptsService);
class CachedPromise extends Disposable {
  constructor(computeFn, getEvent, delay = 0) {
    super();
    this.computeFn = computeFn;
    this.getEvent = getEvent;
    this.delay = delay;
    this.cachedPromise = void 0;
    this.cachedPool = void 0;
    this.onDidUpdatePromiseEmitter = this._register(new Emitter());
    const delayer = this._register(new Delayer(this.delay));
    this._register(this.getEvent()(() => {
      this.cachedPromise = void 0;
      delayer.trigger(() => this.onDidUpdatePromiseEmitter.fire());
    }));
  }
  get onDidChangePromise() {
    return this.onDidUpdatePromiseEmitter.event;
  }
  get(token) {
    if (this.cachedPool?.token.isCancellationRequested) {
      this.cachedPromise = void 0;
      this.cachedPool = void 0;
    }
    let pool = this.cachedPool;
    if (this.cachedPromise === void 0) {
      pool = new CancellationTokenPool();
      const promise = this.computeFn(pool.token).catch((err) => {
        if (this.cachedPromise === promise) {
          this.cachedPromise = void 0;
        }
        throw err;
      });
      promise.finally(() => {
        if (this.cachedPool === pool) {
          this.cachedPool = void 0;
        }
        pool.dispose();
      });
      this.cachedPromise = promise;
      this.cachedPool = pool;
    }
    pool?.add(token);
    return raceCancellationError(this.cachedPromise, token);
  }
  refresh() {
    this.cachedPromise = void 0;
    this.onDidUpdatePromiseEmitter?.fire();
  }
}
class ModelChangeTracker extends Disposable {
  constructor(modelService) {
    super();
    this.listeners = new ResourceMap();
    this.onDidPromptModelChange = this._register(new Emitter());
    const onAdd = (model) => {
      const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
      if (promptType !== void 0) {
        this.listeners.set(model.uri, model.onDidChangeContent(() => this.onDidPromptModelChange.fire({ uri: model.uri, promptType })));
      }
      return promptType;
    };
    const onRemove = (languageId, uri) => {
      const promptType = getPromptsTypeForLanguageId(languageId);
      if (promptType !== void 0) {
        this.listeners.get(uri)?.dispose();
        this.listeners.delete(uri);
      }
      return promptType;
    };
    this._register(modelService.onModelAdded((model) => onAdd(model)));
    this._register(modelService.onModelLanguageChanged((e) => {
      const removedPromptType = onRemove(e.oldLanguageId, e.model.uri);
      const addedPromptType = onAdd(e.model);
      if (removedPromptType !== addedPromptType) {
        if (removedPromptType) {
          this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: removedPromptType });
        }
        if (addedPromptType) {
          this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: addedPromptType });
        }
      }
    }));
    this._register(modelService.onModelRemoved((model) => onRemove(model.getLanguageId(), model.uri)));
  }
  get onDidPromptChange() {
    return this.onDidPromptModelChange.event;
  }
  dispose() {
    super.dispose();
    this.listeners.forEach((listener) => listener.dispose());
    this.listeners.clear();
  }
}
var CustomAgent;
((CustomAgent2) => {
  function fromParsedPromptFile(ast, extra) {
    const uri = ast.uri;
    const { hooks, sessionTypes, enabled } = extra;
    let metadata;
    if (ast.header) {
      const advanced = ast.header.getAttribute(PromptHeaderAttributes.advancedOptions);
      if (advanced && advanced.value.type === "map") {
        metadata = {};
        for (const [key, value] of Object.entries(advanced.value)) {
          if (value.type === "scalar") {
            metadata[key] = value;
          }
        }
      }
    }
    const toolReferences = [];
    if (ast.body) {
      const bodyOffset = ast.body.offset;
      const bodyVarRefs = ast.body.variableReferences;
      for (let i = bodyVarRefs.length - 1; i >= 0; i--) {
        const { name: name2, offset, fullLength } = bodyVarRefs[i];
        const range = new OffsetRange(offset - bodyOffset, offset - bodyOffset + fullLength);
        toolReferences.push({ name: name2, range });
      }
    }
    const agentInstructions = { content: ast.body?.getContent() ?? "", toolReferences, metadata };
    const name = ast.header?.name ?? extra.name ?? getCleanPromptName(uri);
    const description = ast.header?.description ?? extra.description;
    const target = getTarget(PromptsType.agent, ast.header ?? uri);
    const id = uri.toString();
    const source = extra.source;
    if (!ast.header) {
      return { id, uri, name, agentInstructions, source, target, visibility: { userInvocable: true, agentInvocable: true }, sessionTypes, hooks, enabled };
    }
    const visibility = {
      userInvocable: ast.header.userInvocable !== false,
      agentInvocable: ast.header.infer !== void 0 ? ast.header.infer === true : ast.header.disableModelInvocation !== true
    };
    let model = ast.header.model;
    if (target === Target.Claude && model) {
      model = mapClaudeModels(model);
    }
    let { tools, handOffs, argumentHint, agents } = ast.header;
    if (target === Target.Claude && tools) {
      tools = mapClaudeTools(tools);
    }
    return { id, uri, name, description, model, tools, handOffs, argumentHint, target, visibility, agents, agentInstructions, source, sessionTypes, hooks, enabled };
  }
  CustomAgent2.fromParsedPromptFile = fromParsedPromptFile;
})(CustomAgent || (CustomAgent = {}));
export {
  CustomAgent,
  PromptsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxzZXJ2aWNlXFxwcm9tcHRzU2VydmljZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Qb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUGFyc2VFcnJvciwgcGFyc2UgYXMgcGFyc2VKU09OQyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgZ2V0UGFyc2VFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSVJlYWRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IHR5cGUgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVZhcmlhYmxlUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IFByb21wdHNDb25maWcgfSBmcm9tICcuLi9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCB7IEFHRU5UX01EX0ZJTEVOQU1FLCBDTEFVREVfQ09ORklHX0ZPTERFUiwgQ0xBVURFX0xPQ0FMX01EX0ZJTEVOQU1FLCBDTEFVREVfTURfRklMRU5BTUUsIENPUElMT1RfQ09ORklHX0ZPTERFUiwgQ09QSUxPVF9DVVNUT01fSU5TVFJVQ1RJT05TX0ZJTEVOQU1FLCBESUNUQVRJT05fSU5TVFJVQ1RJT05TX0ZJTEVOQU1FLCBnZXRDbGVhblByb21wdE5hbWUsIGdldFNraWxsRm9sZGVyTmFtZSwgR0lUSFVCX0NPTkZJR19GT0xERVIsIElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlciwgaXNJbkNsYXVkZVJ1bGVzRm9sZGVyLCBWT0lDRV9JTlNUUlVDVElPTlNfRklMRU5BTUUgfSBmcm9tICcuLi9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQUk9NUFRfTEFOR1VBR0VfSUQsIFByb21wdEZpbGVTb3VyY2UsIFByb21wdHNUeXBlLCBUYXJnZXQsIGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZCB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VJbnN0cnVjdGlvbkZpbGUsIFByb21wdEZpbGVzTG9jYXRvciB9IGZyb20gJy4uL3V0aWxzL3Byb21wdEZpbGVzTG9jYXRvci5qcyc7XG5pbXBvcnQgeyBldmFsdWF0ZUFwcGx5VG9QYXR0ZXJuLCBQcm9tcHRGaWxlUGFyc2VyLCBQYXJzZWRQcm9tcHRGaWxlLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRJbnN0cnVjdGlvbnMsIElBZ2VudFNvdXJjZSwgSUNoYXRQcm9tcHRTbGFzaENvbW1hbmQsIElDb25maWd1cmVkSG9va3NJbmZvLCBJQ3VzdG9tQWdlbnQsIElFeHRlbnNpb25Qcm9tcHRQYXRoLCBJTG9jYWxQcm9tcHRQYXRoLCBJUGx1Z2luUHJvbXB0UGF0aCwgSUJ1aWx0aW5Qcm9tcHRQYXRoLCBJUHJvbXB0UGF0aCwgSVByb21wdHNTZXJ2aWNlLCBJQWdlbnRTa2lsbCwgSUluc3RydWN0aW9uRGlzY292ZXJ5SW5mbywgSUluc3RydWN0aW9uRGlzY292ZXJ5UmVzdWx0LCBJSW5zdHJ1Y3Rpb25GaWxlLCBJVXNlclByb21wdFBhdGgsIFByb21wdHNTdG9yYWdlLCBJUHJvbXB0RmlsZUNvbnRleHQsIElQcm9tcHRGaWxlUmVzb3VyY2UsIElQcm9tcHREaXNjb3ZlcnlJbmZvLCBJUHJvbXB0RmlsZURpc2NvdmVyeVJlc3VsdCwgSVByb21wdFNvdXJjZUZvbGRlclJlc3VsdCwgSUN1c3RvbUFnZW50VmlzaWJpbGl0eSwgSUFnZW50SW5zdHJ1Y3Rpb25GaWxlLCBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUsIExvZ2dlciwgSVNsYXNoQ29tbWFuZERpc2NvdmVyeUluZm8sIElTbGFzaENvbW1hbmREaXNjb3ZlcnlSZXN1bHQsIElBZ2VudERpc2NvdmVyeUluZm8sIElBZ2VudERpc2NvdmVyeVJlc3VsdCwgSUhvb2tEaXNjb3ZlcnlJbmZvLCBJUmVzb2x2ZWRDaGF0UHJvbXB0U2xhc2hDb21tYW5kLCBtYXRjaGVzU2Vzc2lvblR5cGUgfSBmcm9tICcuL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0SG9va3MsIHBhcnNlU3ViYWdlbnRIb29rc0Zyb21ZYW1sIH0gZnJvbSAnLi4vaG9va1NjaGVtYS5qcyc7XG5pbXBvcnQgeyB0eXBlIElQYXJzZWRIb29rQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uL2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBIb29rU291cmNlRm9ybWF0LCBwYXJzZUhvb2tzRnJvbUZpbGUgfSBmcm9tICcuLi9ob29rQ29tcGF0aWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0VGFyZ2V0LCBtYXBDbGF1ZGVNb2RlbHMsIG1hcENsYXVkZVRvb2xzIH0gZnJvbSAnLi4vbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q2Fub25pY2FsUGx1Z2luQ29tbWFuZElkLCBJQWdlbnRQbHVnaW4sIElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblByb21wdEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25Qcm9tcHRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcsIENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCB7IGlzUHJvbXB0VHlwZUJsb2NrZWQsIFN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY3VzdG9taXphdGlvbkxvY2tkb3duLmpzJztcbmltcG9ydCB7IGlzQWdlbnRQbHVnaW5Gb3JjZUVuYWJsZWRCeVBvbGljeSB9IGZyb20gJy4uLy4uL3BsdWdpbnMvYWdlbnRQbHVnaW5FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29uc3RhbnRzLmpzJztcblxuLyoqXG4gKiBQcm92aWRlcyBwcm9tcHQgc2VydmljZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvbXB0c1NlcnZpY2Uge1xuXHRwdWJsaWMgZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFByb21wdCBmaWxlcyBsb2NhdG9yIHV0aWxpdHkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVMb2NhdG9yOiBQcm9tcHRGaWxlc0xvY2F0b3I7XG5cblx0LyoqXG5cdCAqIENhY2hlZCBhZ2VudCBkaXNjb3ZlcnkgaW5mby5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGVkQ3VzdG9tQWdlbnRzOiBDYWNoZWRQcm9taXNlPElBZ2VudERpc2NvdmVyeUluZm8+O1xuXG5cdC8qKlxuXHQgKiBDYWNoZWQgc2xhc2ggY29tbWFuZCBkaXNjb3ZlcnkgaW5mby5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGVkU2xhc2hDb21tYW5kczogQ2FjaGVkUHJvbWlzZTxJU2xhc2hDb21tYW5kRGlzY292ZXJ5SW5mbz47XG5cblx0LyoqXG5cdCAqIENhY2hlZCBob29rcy4gSW52YWxpZGF0ZWQgd2hlbiBob29rIGZpbGVzIGNoYW5nZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGVkSG9va3M6IENhY2hlZFByb21pc2U8SUhvb2tEaXNjb3ZlcnlJbmZvPjtcblxuXHQvKipcblx0ICogQ2FjaGVkIHNraWxsIGRpc2NvdmVyeSBpbmZvLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZWRTa2lsbHM6IENhY2hlZFByb21pc2U8SVByb21wdERpc2NvdmVyeUluZm8+O1xuXG5cdC8qKlxuXHQgKiBDYWNoZWQgaW5zdHJ1Y3Rpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZWRJbnN0cnVjdGlvbnM6IENhY2hlZFByb21pc2U8SUluc3RydWN0aW9uRGlzY292ZXJ5SW5mbz47XG5cdHByaXZhdGUgcmVhZG9ubHkgYWdlbnRJbnN0cnVjdGlvbnNXYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHtcblx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGFnZW50SW5zdHJ1Y3Rpb25zVXBkYXRlZEV2ZW50ID0gdGhpcy5maWxlTG9jYXRvci5jcmVhdGVBZ2VudEluc3RydWN0aW9uc1VwZGF0ZWRFdmVudCgpO1xuXHRcdFx0c3RvcmUuYWRkKGFnZW50SW5zdHJ1Y3Rpb25zVXBkYXRlZEV2ZW50KTtcblx0XHRcdHN0b3JlLmFkZChhZ2VudEluc3RydWN0aW9uc1VwZGF0ZWRFdmVudC5ldmVudCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zLmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5hZ2VudEluc3RydWN0aW9uc1dhdGNoZXIudmFsdWUgPSBzdG9yZTtcblx0XHR9LFxuXHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHR0aGlzLmFnZW50SW5zdHJ1Y3Rpb25zV2F0Y2hlci5jbGVhcigpO1xuXHRcdH1cblx0fSkpO1xuXG5cdC8qKlxuXHQgKiBTeW5jaHJvbm91cyBtaXJyb3Igb2YgdGhlIG5hbWVzIGV4cG9zZWQgYnkge0BsaW5rIGdldFByb21wdFNsYXNoQ29tbWFuZHN9LFxuXHQgKiBtYWludGFpbmVkIGZvciB7QGxpbmsgaGFzUHJvbXB0U2xhc2hDb21tYW5kfSBzbyBjYWxsZXJzIChlLmcuIHRoZSBjaGF0IHJlcXVlc3Rcblx0ICogcGFyc2VyKSBjYW4gZGlzYW1iaWd1YXRlIGA8Y21kPjo8c3ViPmAgdnMgYmFyZSBgPGNtZD5gIHdpdGhvdXQgYW4gYXN5bmMgaG9wLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBrbm93blByb21wdFNsYXNoQ29tbWFuZE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIENhY2hlIGZvciBwYXJzZWQgcHJvbXB0IGZpbGVzIGtleWVkIGJ5IFVSSS5cblx0ICogVGhlIG51bWJlciBpbiB0aGUgcmV0dXJuZWQgdHVwbGUgaXMgdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLCB3aGljaCBpcyBhbiBpbnRlcm5hbCBWUyBDb2RlIGNvdW50ZXIgdGhhdCBpbmNyZW1lbnRzIGV2ZXJ5IHRpbWUgdGhlIHRleHQgbW9kZWwncyBjb250ZW50IGNoYW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlZFBhcnNlZFByb21wdEZyb21Nb2RlbHMgPSBuZXcgUmVzb3VyY2VNYXA8W251bWJlciwgUGFyc2VkUHJvbXB0RmlsZV0+KCk7XG5cblx0LyoqXG5cdCAqIENhY2hlZCBmaWxlIGxvY2F0aW9ucyBjb21tYW5kcy4gQ2FjaGluZyBvbmx5IGhhcHBlbnMgaWYgdGhlIGNvcnJlc3BvbmRpbmcgYGZpbGVMb2NhdG9yRXZlbnRzYCBldmVudCBpcyB1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZWRGaWxlTG9jYXRpb25zOiB7IFtrZXkgaW4gUHJvbXB0c1R5cGVdPzogUHJvbWlzZTxyZWFkb25seSBJUHJvbXB0UGF0aFtdPiB9ID0ge307XG5cblx0LyoqXG5cdCAqIExhemlseSBjcmVhdGVkIGV2ZW50cyB0aGF0IG5vdGlmeSBsaXN0ZW5lcnMgd2hlbiB0aGUgZmlsZSBsb2NhdGlvbnMgZm9yIGEgZ2l2ZW4gcHJvbXB0IHR5cGUgY2hhbmdlLlxuXHQgKiBBbiBldmVudCBpcyBjcmVhdGVkIG9uIGRlbWFuZCBmb3IgZWFjaCBwcm9tcHQgdHlwZSBhbmQgY2FuIGJlIHVzZWQgYnkgY29uc3VtZXJzIHRvIHJlYWN0IHRvIHVwZGF0ZXNcblx0ICogaW4gdGhlIHNldCBvZiBwcm9tcHQgZmlsZXMgKGUuZy4sIHdoZW4gcHJvbXB0IGZpbGVzIGFyZSBhZGRlZCwgcmVtb3ZlZCwgb3IgbW9kaWZpZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlTG9jYXRvckV2ZW50czogeyBba2V5IGluIFByb21wdHNUeXBlXT86IEV2ZW50PHZvaWQ+IH0gPSB7fTtcblxuXG5cdC8qKlxuXHQgKiBPd25zIHRoZSByZWdpc3RyeSBvZiBleHRlbnNpb24tY29udHJpYnV0ZWQgcHJvbXB0IGZpbGVzIChib3RoIHZpYVxuXHQgKiBjb250cmlidXRpb24gcG9pbnRzIGFuZCB2aWEgcHJvdmlkZXIgQVBJKS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uUHJvbXB0RmlsZXM6IEV4dGVuc2lvblByb21wdEZpbGVTZXJ2aWNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUGx1Z2luUHJvbXB0RmlsZXNDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm9tcHRzVHlwZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUGx1Z2luSG9va3NDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSBfcGx1Z2luUHJvbXB0RmlsZXNCeVR5cGUgPSBuZXcgTWFwPFByb21wdHNUeXBlLCByZWFkb25seSBJUGx1Z2luUHJvbXB0UGF0aFtdPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZmlsZUxvY2F0b3IgPSB0aGlzLmNyZWF0ZVByb21wdEZpbGVzTG9jYXRvcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQoKG1vZGVsKSA9PiB7XG5cdFx0XHR0aGlzLmNhY2hlZFBhcnNlZFByb21wdEZyb21Nb2RlbHMuZGVsZXRlKG1vZGVsLnVyaSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25Qcm9tcHRGaWxlcyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uUHJvbXB0RmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUV4dGVuc2lvblByb21wdEZpbGVzID0gdGhpcy5leHRlbnNpb25Qcm9tcHRGaWxlcy5vbkRpZENoYW5nZTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25Mb2NrZG93biA9IEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbixcblx0XHRcdGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25Mb2NrZG93bigoKSA9PiB7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbUHJvbXB0c1R5cGUuYWdlbnRdID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5jYWNoZWRGaWxlTG9jYXRpb25zW1Byb21wdHNUeXBlLnNraWxsXSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1tQcm9tcHRzVHlwZS5ob29rXSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1tQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9ucy5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW52YWxpZGF0ZSB0aGUgY2FjaGVkIGZpbGUgbG9jYXRpb24gbGlzdCB3aGVuZXZlciBhbiBleHRlbnNpb24gY29udHJpYnV0aW9uXG5cdFx0Ly8gb3IgcHJvdmlkZXIgZm9yIHRoZSBzYW1lIHR5cGUgY2hhbmdlcyAob3IgaXRzIGB3aGVuYCByZS1ldmFsdWF0ZXMpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRXh0ZW5zaW9uUHJvbXB0RmlsZXMoZSA9PiB7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbZS50eXBlXSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbENoYW5nZUV2ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE1vZGVsQ2hhbmdlVHJhY2tlcih0aGlzLm1vZGVsU2VydmljZSkpLm9uRGlkUHJvbXB0Q2hhbmdlO1xuXHRcdHRoaXMuY2FjaGVkQ3VzdG9tQWdlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhY2hlZFByb21pc2UoXG5cdFx0XHQodG9rZW4pID0+IHRoaXMuY29tcHV0ZUFnZW50RGlzY292ZXJ5SW5mbyh0b2tlbiksXG5cdFx0XHQoKSA9PiBFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMuZ2V0RmlsZUxvY2F0b3JFdmVudChQcm9tcHRzVHlwZS5hZ2VudCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihtb2RlbENoYW5nZUV2ZW50LCBlID0+IGUucHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTKSksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihvbkRpZENoYW5nZUV4dGVuc2lvblByb21wdEZpbGVzLCBlID0+IGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5fb25EaWRQbHVnaW5Qcm9tcHRGaWxlc0NoYW5nZS5ldmVudCwgdCA9PiB0ID09PSBQcm9tcHRzVHlwZS5hZ2VudCksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbkxvY2tkb3duLFxuXHRcdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0U2VydmljZS5vbkRpZENoYW5nZVRydXN0LFxuXHRcdFx0KVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5jYWNoZWRTbGFzaENvbW1hbmRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhY2hlZFByb21pc2UoXG5cdFx0XHQodG9rZW4pID0+IHRoaXMuY29tcHV0ZVNsYXNoQ29tbWFuZERpc2NvdmVyeUluZm8odG9rZW4pLFxuXHRcdFx0KCkgPT4gRXZlbnQuYW55KFxuXHRcdFx0XHR0aGlzLmdldEZpbGVMb2NhdG9yRXZlbnQoUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0dGhpcy5nZXRGaWxlTG9jYXRvckV2ZW50KFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG1vZGVsQ2hhbmdlRXZlbnQsIGUgPT4gZS5wcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIobW9kZWxDaGFuZ2VFdmVudCwgZSA9PiBlLnByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG9uRGlkQ2hhbmdlRXh0ZW5zaW9uUHJvbXB0RmlsZXMsIGUgPT4gZS50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQgfHwgZS50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLl9vbkRpZFBsdWdpblByb21wdEZpbGVzQ2hhbmdlLmV2ZW50LCB0ID0+IHQgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCB0ID09PSBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbkxvY2tkb3duKSxcblx0XHQpKTtcblxuXHRcdHRoaXMuY2FjaGVkU2tpbGxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhY2hlZFByb21pc2UoXG5cdFx0XHQodG9rZW4pID0+IHRoaXMuY29tcHV0ZVNraWxsRGlzY292ZXJ5KHRva2VuKSxcblx0XHRcdCgpID0+IEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5nZXRGaWxlTG9jYXRvckV2ZW50KFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG1vZGVsQ2hhbmdlRXZlbnQsIGUgPT4gZS5wcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihvbkRpZENoYW5nZUV4dGVuc2lvblByb21wdEZpbGVzLCBlID0+IGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5fb25EaWRQbHVnaW5Qcm9tcHRGaWxlc0NoYW5nZS5ldmVudCwgdCA9PiB0ID09PSBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbkxvY2tkb3duKVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5jYWNoZWRIb29rcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYWNoZWRQcm9taXNlKFxuXHRcdFx0KHRva2VuKSA9PiB0aGlzLmNvbXB1dGVIb29rcyh0b2tlbiksXG5cdFx0XHQoKSA9PiBFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMuZ2V0RmlsZUxvY2F0b3JFdmVudChQcm9tcHRzVHlwZS5ob29rKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DTEFVREVfSE9PS1MpKSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDdXN0b21pemF0aW9uTG9ja2Rvd24sXG5cdFx0XHRcdHRoaXMuX29uRGlkUGx1Z2luSG9va3NDaGFuZ2UuZXZlbnQsXG5cdFx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QsXG5cdFx0XHQpXG5cdFx0KSk7XG5cblx0XHR0aGlzLmNhY2hlZEluc3RydWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYWNoZWRQcm9taXNlKFxuXHRcdFx0KHRva2VuKSA9PiB0aGlzLmNvbXB1dGVJbnN0cnVjdGlvbkZpbGVzKHRva2VuKSxcblx0XHRcdCgpID0+IEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5nZXRGaWxlTG9jYXRvckV2ZW50KFByb21wdHNUeXBlLmluc3RydWN0aW9ucyksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihvbkRpZENoYW5nZUV4dGVuc2lvblByb21wdEZpbGVzLCBlID0+IGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkUGx1Z2luUHJvbXB0RmlsZXNDaGFuZ2UuZXZlbnQsIHQgPT4gdCA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDdXN0b21pemF0aW9uTG9ja2Rvd24sXG5cdFx0XHQpXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndhdGNoUGx1Z2luUHJvbXB0RmlsZXNGb3JUeXBlKFxuXHRcdFx0UHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0KHBsdWdpbiwgcmVhZGVyKSA9PiBwbHVnaW4uY29tbWFuZHMucmVhZChyZWFkZXIpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2F0Y2hQbHVnaW5Qcm9tcHRGaWxlc0ZvclR5cGUoXG5cdFx0XHRQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdChwbHVnaW4sIHJlYWRlcikgPT4gcGx1Z2luLnNraWxscy5yZWFkKHJlYWRlciksXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53YXRjaFBsdWdpblByb21wdEZpbGVzRm9yVHlwZShcblx0XHRcdFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0KHBsdWdpbiwgcmVhZGVyKSA9PiBwbHVnaW4uYWdlbnRzLnJlYWQocmVhZGVyKSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndhdGNoUGx1Z2luUHJvbXB0RmlsZXNGb3JUeXBlKFxuXHRcdFx0UHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0KHBsdWdpbiwgcmVhZGVyKSA9PiBwbHVnaW4uaW5zdHJ1Y3Rpb25zLnJlYWQocmVhZGVyKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IG1hbmFnZWRIb29rc09ubHkgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbkxvY2tkb3duLFxuXHRcdFx0KCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcpID09PSB0cnVlKTtcblx0XHRjb25zdCBlbmFibGVkUGx1Z2luc1BvbGljeSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zKSksXG5cdFx0XHQoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KENoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zKS5wb2xpY3lWYWx1ZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5zID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtYW5hZ2VkSG9va3NPbmx5VmFsdWUgPSBtYW5hZ2VkSG9va3NPbmx5LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zUG9saWN5VmFsdWUgPSBlbmFibGVkUGx1Z2luc1BvbGljeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBob29rRmlsZXM6IElQbHVnaW5Qcm9tcHRQYXRoW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIHBsdWdpbnMpIHtcblx0XHRcdFx0aWYgKGlzQ29udHJpYnV0aW9uRW5hYmxlZChwbHVnaW4uZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpXG5cdFx0XHRcdFx0JiYgKCFtYW5hZ2VkSG9va3NPbmx5VmFsdWUgfHwgaXNBZ2VudFBsdWdpbkZvcmNlRW5hYmxlZEJ5UG9saWN5KHBsdWdpbiwgZW5hYmxlZFBsdWdpbnNQb2xpY3lWYWx1ZSkpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBob29rIG9mIHBsdWdpbi5ob29rcy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdGhvb2tGaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dXJpOiBob29rLnVyaSxcblx0XHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5ob29rLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBnZXRDYW5vbmljYWxQbHVnaW5Db21tYW5kSWQocGx1Z2luLCBob29rLm9yaWdpbmFsSWQpLFxuXHRcdFx0XHRcdFx0XHRwbHVnaW5Vcmk6IHBsdWdpbi51cmksXG5cdFx0XHRcdFx0XHRcdHBsdWdpbkxhYmVsOiBwbHVnaW4ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5QbHVnaW4sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcGx1Z2luUHJvbXB0RmlsZXNCeVR5cGUuc2V0KFByb21wdHNUeXBlLmhvb2ssIGhvb2tGaWxlcyk7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbUHJvbXB0c1R5cGUuaG9va10gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZFBsdWdpbkhvb2tzQ2hhbmdlLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoUGx1Z2luUHJvbXB0RmlsZXNGb3JUeXBlKFxuXHRcdHR5cGU6IFByb21wdHNUeXBlLFxuXHRcdGdldEl0ZW1zOiAocGx1Z2luOiBJQWdlbnRQbHVnaW4sIHJlYWRlcjogSVJlYWRlcikgPT4gcmVhZG9ubHkgeyB1cmk6IFVSSTsgbmFtZTogc3RyaW5nIH1bXSxcblx0KSB7XG5cdFx0cmV0dXJuIGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG5leHRGaWxlczogSVBsdWdpblByb21wdFBhdGhbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgcGx1Z2lucykge1xuXHRcdFx0XHRpZiAoIWlzQ29udHJpYnV0aW9uRW5hYmxlZChwbHVnaW4uZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGdldEl0ZW1zKHBsdWdpbiwgcmVhZGVyKSkge1xuXHRcdFx0XHRcdG5leHRGaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRcdHVyaTogaXRlbS51cmksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sXG5cdFx0XHRcdFx0XHR0eXBlLFxuXHRcdFx0XHRcdFx0bmFtZTogZ2V0Q2Fub25pY2FsUGx1Z2luQ29tbWFuZElkKHBsdWdpbiwgaXRlbS5uYW1lKSxcblx0XHRcdFx0XHRcdHBsdWdpblVyaTogcGx1Z2luLnVyaSxcblx0XHRcdFx0XHRcdHBsdWdpbkxhYmVsOiBwbHVnaW4ubGFiZWwsXG5cdFx0XHRcdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuUGx1Z2luLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdG5leHRGaWxlcy5zb3J0KChhLCBiKSA9PiBgJHthLm5hbWUgPz8gJyd9fCR7YS51cmkudG9TdHJpbmcoKX1gLmxvY2FsZUNvbXBhcmUoYCR7Yi5uYW1lID8/ICcnfXwke2IudXJpLnRvU3RyaW5nKCl9YCkpO1xuXHRcdFx0dGhpcy5fcGx1Z2luUHJvbXB0RmlsZXNCeVR5cGUuc2V0KHR5cGUsIG5leHRGaWxlcyk7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbdHlwZV0gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZFBsdWdpblByb21wdEZpbGVzQ2hhbmdlLmZpcmUodHlwZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlUHJvbXB0RmlsZXNMb2NhdG9yKCk6IFByb21wdEZpbGVzTG9jYXRvciB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmlsZUxvY2F0b3JFdmVudCh0eXBlOiBQcm9tcHRzVHlwZSk6IEV2ZW50PHZvaWQ+IHtcblx0XHRsZXQgZXZlbnQgPSB0aGlzLmZpbGVMb2NhdG9yRXZlbnRzW3R5cGVdO1xuXHRcdGlmICghZXZlbnQpIHtcblx0XHRcdGV2ZW50ID0gdGhpcy5maWxlTG9jYXRvckV2ZW50c1t0eXBlXSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZUxvY2F0b3IuY3JlYXRlRmlsZXNVcGRhdGVkRXZlbnQodHlwZSkpLmV2ZW50O1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbdHlwZV0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHJldHVybiBldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXRQYXJzZWRQcm9tcHRGaWxlKHRleHRNb2RlbDogSVRleHRNb2RlbCk6IFBhcnNlZFByb21wdEZpbGUge1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuY2FjaGVkUGFyc2VkUHJvbXB0RnJvbU1vZGVscy5nZXQodGV4dE1vZGVsLnVyaSk7XG5cdFx0aWYgKGNhY2hlZCAmJiBjYWNoZWRbMF0gPT09IHRleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZFsxXTtcblx0XHR9XG5cdFx0Y29uc3QgYXN0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh0ZXh0TW9kZWwudXJpLCB0ZXh0TW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0aWYgKCFjYWNoZWQgfHwgY2FjaGVkWzBdIDwgdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpKSB7XG5cdFx0XHR0aGlzLmNhY2hlZFBhcnNlZFByb21wdEZyb21Nb2RlbHMuc2V0KHRleHRNb2RlbC51cmksIFt0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksIGFzdF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gYXN0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGxpc3RQcm9tcHRGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJUHJvbXB0UGF0aFtdPiB7XG5cdFx0bGV0IGxpc3RQcm9taXNlID0gdGhpcy5jYWNoZWRGaWxlTG9jYXRpb25zW3R5cGVdO1xuXHRcdGlmICghbGlzdFByb21pc2UpIHtcblx0XHRcdGxpc3RQcm9taXNlID0gdGhpcy5jb21wdXRlTGlzdFByb21wdEZpbGVzKHR5cGUsIHRva2VuKTtcblx0XHRcdGlmICghdGhpcy5maWxlTG9jYXRvckV2ZW50c1t0eXBlXSkge1xuXHRcdFx0XHRyZXR1cm4gbGlzdFByb21pc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbdHlwZV0gPSBsaXN0UHJvbWlzZTtcblx0XHRcdHJldHVybiBsaXN0UHJvbWlzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGxpc3RQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlTGlzdFByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElQcm9tcHRQYXRoW10+IHtcblx0XHRjb25zdCBhbGxvd1N0YW5kYWxvbmUgPSAhdGhpcy5hcmVTdGFuZGFsb25lUHJvbXB0RmlsZXNCbG9ja2VkKHR5cGUpO1xuXHRcdGNvbnN0IHByb21wdHMgPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRhbGxvd1N0YW5kYWxvbmUgPyB0aGlzLmZpbGVMb2NhdG9yLmxpc3RGaWxlc1dpdGhTb3VyY2UodHlwZSwgUHJvbXB0c1N0b3JhZ2UudXNlciwgdG9rZW4pLnRoZW4oZmlsZXMgPT4gZmlsZXMubWFwKGZpbGUgPT4gKHsgLi4uZmlsZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZSB9IHNhdGlzZmllcyBJVXNlclByb21wdFBhdGgpKSkgOiBbXSxcblx0XHRcdGFsbG93U3RhbmRhbG9uZSA/IHRoaXMuZmlsZUxvY2F0b3IubGlzdEZpbGVzV2l0aFNvdXJjZSh0eXBlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdG9rZW4pLnRoZW4oZmlsZXMgPT4gZmlsZXMubWFwKGZpbGUgPT4gKHsgLi4uZmlsZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGUgfSBzYXRpc2ZpZXMgSUxvY2FsUHJvbXB0UGF0aCkpKSA6IFtdLFxuXHRcdFx0dGhpcy5nZXRFeHRlbnNpb25Qcm9tcHRGaWxlcyh0eXBlLCB0b2tlbiksXG5cdFx0XHR0aGlzLl9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZS5nZXQodHlwZSkgPz8gW10sXG5cdFx0XHR0aGlzLmdldEJ1aWx0aW5Qcm9tcHRGaWxlcyh0eXBlLCB0b2tlbiksXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4gcHJvbXB0cy5mbGF0KCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29sbGVjdHMgZGlhZ25vc3RpYyBpbmZvcm1hdGlvbiBhYm91dCB3aGljaCBzb3VyY2UgZm9sZGVycyB3ZXJlIHNlYXJjaGVkIGZvciBkaXNwbGF5IGluIHRoZSBkZWJ1ZyBwYW5lbC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbGxlY3RTb3VyY2VGb2xkZXJEaWFnbm9zdGljcyh0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8SVByb21wdFNvdXJjZUZvbGRlclJlc3VsdFtdPiB7XG5cdFx0aWYgKHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlZEZvbGRlcnMgPSBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmdldFNvdXJjZUZvbGRlcnNJbkRpc2NvdmVyeU9yZGVyKHR5cGUpO1xuXHRcdHJldHVybiByZXNvbHZlZEZvbGRlcnMubWFwKGZvbGRlciA9PiAoe1xuXHRcdFx0dXJpOiBmb2xkZXIudXJpLFxuXHRcdFx0c3RvcmFnZTogZm9sZGVyLnN0b3JhZ2UsXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIHByb21wdCBmaWxlIHByb3ZpZGVyIChDdXN0b21BZ2VudFByb3ZpZGVyLCBJbnN0cnVjdGlvbnNQcm92aWRlciwgb3IgUHJvbXB0RmlsZVByb3ZpZGVyKS5cblx0ICogVGhpcyB3aWxsIGJlIGNhbGxlZCBieSB0aGUgZXh0ZW5zaW9uIGhvc3QgYnJpZGdlIHdoZW5cblx0ICogYW4gZXh0ZW5zaW9uIHJlZ2lzdGVycyBhIHByb3ZpZGVyIHZpYSB2c2NvZGUuY2hhdC5yZWdpc3RlckN1c3RvbUFnZW50UHJvdmlkZXIoKSxcblx0ICogcmVnaXN0ZXJJbnN0cnVjdGlvbnNQcm92aWRlcigpLCBvciByZWdpc3RlclByb21wdEZpbGVQcm92aWRlcigpLlxuXHQgKi9cblx0cHVibGljIHJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0eXBlOiBQcm9tcHRzVHlwZSwgcHJvdmlkZXI6IHtcblx0XHRvbkRpZENoYW5nZVByb21wdEZpbGVzPzogRXZlbnQ8dm9pZD47XG5cdFx0cHJvdmlkZVByb21wdEZpbGVzOiAoY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SVByb21wdEZpbGVSZXNvdXJjZVtdIHwgdW5kZWZpbmVkPjtcblx0fSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Qcm9tcHRGaWxlcy5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIHR5cGUsIHByb3ZpZGVyKTtcblx0fVxuXG5cblx0cHVibGljIGFzeW5jIGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZTogUHJvbXB0c1R5cGUsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJvb3Q/OiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IElQcm9tcHRQYXRoW10+IHtcblx0XHRsZXQgcHJvbXB0UGF0aHM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW107XG5cdFx0c3dpdGNoIChzdG9yYWdlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbjpcblx0XHRcdFx0cHJvbXB0UGF0aHMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvblByb21wdEZpbGVzKHR5cGUsIHRva2VuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmxvY2FsOlxuXHRcdFx0XHRwcm9tcHRQYXRocyA9IHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlKSA/IFtdIDogYXdhaXQgdGhpcy5maWxlTG9jYXRvci5saXN0RmlsZXNXaXRoU291cmNlKHR5cGUsIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0b2tlbiwgcm9vdCkudGhlbihmaWxlcyA9PiBmaWxlcy5tYXAoZmlsZSA9PiAoeyAuLi5maWxlLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZSB9IHNhdGlzZmllcyBJTG9jYWxQcm9tcHRQYXRoKSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UudXNlcjpcblx0XHRcdFx0cHJvbXB0UGF0aHMgPSB0aGlzLmFyZVN0YW5kYWxvbmVQcm9tcHRGaWxlc0Jsb2NrZWQodHlwZSkgPyBbXSA6IGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IubGlzdEZpbGVzV2l0aFNvdXJjZSh0eXBlLCBQcm9tcHRzU3RvcmFnZS51c2VyLCB0b2tlbikudGhlbihmaWxlcyA9PiBmaWxlcy5tYXAoZmlsZSA9PiAoeyAuLi5maWxlLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlIH0gc2F0aXNmaWVzIElVc2VyUHJvbXB0UGF0aCkpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLnBsdWdpbjpcblx0XHRcdFx0cHJvbXB0UGF0aHMgPSB0aGlzLl9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZS5nZXQodHlwZSkgPz8gW107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5idWlsdEluOlxuXHRcdFx0XHRwcm9tcHRQYXRocyA9IGF3YWl0IHRoaXMuZ2V0QnVpbHRpblByb21wdEZpbGVzKHR5cGUsIHRva2VuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlXSBVbnN1cHBvcnRlZCBwcm9tcHQgc3RvcmFnZSB0eXBlOiAke3N0b3JhZ2V9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb21wdFBhdGhzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25Qcm9tcHRGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJRXh0ZW5zaW9uUHJvbXB0UGF0aFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uUHJvbXB0RmlsZXMuZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXModHlwZSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGJ1aWx0LWluIHByb21wdCBmaWxlcyBvZiB0aGUgZ2l2ZW4gdHlwZS4gVGhlIGJhc2Ugc2VydmljZSBzaGlwc1xuXHQgKiBubyBidWlsdC1pbiBwcm9tcHRzOyBzdWJjbGFzc2VzIChlLmcuIHRoZSBBZ2VudHMgYXBwKSBvdmVycmlkZSB0aGlzIHRvXG5cdCAqIGNvbnRyaWJ1dGUgYnVuZGxlZCBwcm9tcHRzIHN1Y2ggYXMgYnVpbHQtaW4gc2tpbGxzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIGdldEJ1aWx0aW5Qcm9tcHRGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJQnVpbHRpblByb21wdFBhdGhbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRTb3VyY2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBJUHJvbXB0UGF0aFtdPiB7XG5cdFx0aWYgKHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElQcm9tcHRQYXRoW10gPSBbXTtcblxuXHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5ob29rKSB7XG5cdFx0XHQvLyBGb3IgaG9va3MsIHJldHVybiB0aGUgQ29waWxvdCBob29rcyBmb2xkZXIgZm9yIGNyZWF0aW5nIG5ldyBob29rc1xuXHRcdFx0Ly8gKENsYXVkZSBwYXRocyBhcmUgcmVhZC1vbmx5IGFuZCBub3QgaW5jbHVkZWQgaGVyZSlcblx0XHRcdGNvbnN0IGhvb2tzRm9sZGVycyA9IGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IuZ2V0SG9va1NvdXJjZUZvbGRlcnMoKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGhvb2tzRm9sZGVycykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogZm9sZGVyLnVyaSwgc3RvcmFnZTogZm9sZGVyLnN0b3JhZ2UsIHR5cGUsIHNvdXJjZTogZm9sZGVyLnNvdXJjZSB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHQvLyBTa2lsbHMgaGF2ZSBib3RoIHdvcmtzcGFjZSBhbmQgdXNlci1sZXZlbCBzb3VyY2UgZm9sZGVycyAoZS5nLlxuXHRcdFx0Ly8gfi8uY29waWxvdC9za2lsbHMpLiBVc2UgdGhlIHJlc29sdmVkIHNvdXJjZSBmb2xkZXJzIHNvIGVhY2hcblx0XHRcdC8vIGxvY2F0aW9uIHJlcG9ydHMgaXRzIGFjdHVhbCBzdG9yYWdlIChsb2NhbCB2cyB1c2VyKSwgb3RoZXJ3aXNlXG5cdFx0XHQvLyBjcmVhdGluZyBhIHVzZXItbGV2ZWwgc2tpbGwgZmFpbHMgd2l0aCBcIk5vIHNraWxsIHNvdXJjZSBmb2xkZXJzIGZvdW5kXCIuXG5cdFx0XHRjb25zdCByZXNvbHZlZEZvbGRlcnMgPSBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHJlc29sdmVkRm9sZGVycykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogZm9sZGVyLnNlYXJjaFJvb3QsIHN0b3JhZ2U6IGZvbGRlci5zdG9yYWdlLCB0eXBlLCBzb3VyY2U6IGZvbGRlci5zb3VyY2UgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IuZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKHR5cGUpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHVyaSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGUgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLnVzZXJEYXRhU2VydmljZS5jdXJyZW50UHJvZmlsZS5wcm9tcHRzSG9tZTtcblx0XHRyZXN1bHQucHVzaCh7IHVyaTogdXNlckhvbWUsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGUgfSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8cmVhZG9ubHkgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10+IHtcblx0XHRpZiAodGhpcy5hcmVTdGFuZGFsb25lUHJvbXB0RmlsZXNCbG9ja2VkKHR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmZpbGVMb2NhdG9yLmdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlOiBQcm9tcHRzVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0cmljdFBsdWdpbk9ubHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uPihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyk7XG5cdFx0cmV0dXJuIGlzUHJvbXB0VHlwZUJsb2NrZWQoc3RyaWN0UGx1Z2luT25seSwgdHlwZSlcblx0XHRcdHx8ICh0eXBlID09PSBQcm9tcHRzVHlwZS5ob29rICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHKSA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFyZUFnZW50SG9va3NBbGxvd2VkKHByb21wdFBhdGg6IElQcm9tcHRQYXRoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHKSA9PT0gdHJ1ZSkge1xuXHRcdFx0aWYgKHByb21wdFBhdGguc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luIHx8ICFwcm9tcHRQYXRoLnBsdWdpblVyaSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwbHVnaW4gPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpLmZpbmQoY2FuZGlkYXRlID0+IGlzRXF1YWwoY2FuZGlkYXRlLnVyaSwgcHJvbXB0UGF0aC5wbHVnaW5VcmkpKTtcblx0XHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zUG9saWN5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5FbmFibGVkUGx1Z2lucykucG9saWN5VmFsdWU7XG5cdFx0XHRyZXR1cm4gcGx1Z2luICE9PSB1bmRlZmluZWQgJiYgaXNBZ2VudFBsdWdpbkZvcmNlRW5hYmxlZEJ5UG9saWN5KHBsdWdpbiwgZW5hYmxlZFBsdWdpbnNQb2xpY3kpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0cmljdFBsdWdpbk9ubHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uPihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyk7XG5cdFx0cmV0dXJuICFpc1Byb21wdFR5cGVCbG9ja2VkKHN0cmljdFBsdWdpbk9ubHksIFByb21wdHNUeXBlLmhvb2spXG5cdFx0XHR8fCAocHJvbXB0UGF0aC5zdG9yYWdlICE9PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCAmJiBwcm9tcHRQYXRoLnN0b3JhZ2UgIT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHR9XG5cblx0Ly8gc2xhc2ggcHJvbXB0IGNvbW1hbmRzXG5cblx0LyoqXG5cdCAqIEVtaXR0ZXIgZm9yIHNsYXNoIGNvbW1hbmRzIGNoYW5nZSBldmVudHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkU2xhc2hDb21tYW5kcy5vbkRpZENoYW5nZVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10+IHtcblx0XHRjb25zdCBkaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGhpcy5jYWNoZWRTbGFzaENvbW1hbmRzLmdldCh0b2tlbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5zbGFzaENvbW1hbmRzRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyBkaXNjb3ZlcnkgaW5mbyBmb3Igc2xhc2ggY29tbWFuZHMsIGNvbWJpbmluZyBwcm9tcHRzIGFuZCBza2lsbHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVTbGFzaENvbW1hbmREaXNjb3ZlcnlJbmZvKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNsYXNoQ29tbWFuZERpc2NvdmVyeUluZm8+IHtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdGNvbnN0IHByb21wdEZpbGVzID0gYXdhaXQgdGhpcy5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCB0b2tlbik7XG5cdFx0Y29uc3QgdXNlQWdlbnRTa2lsbHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUyk7XG5cdFx0Y29uc3Qgc2tpbGxzID0gdXNlQWdlbnRTa2lsbHMgPyBhd2FpdCB0aGlzLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgdG9rZW4pIDogW107XG5cdFx0Y29uc3QgZGlzYWJsZWRTa2lsbHMgPSB0aGlzLmdldERpc2FibGVkUHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdC8vIE9yZGVyIHNraWxscyBieSBwcmVjZWRlbmNlIGJlZm9yZSBwYXJzaW5nIHNvIHRoYXQgdGhlIGR1cGxpY2F0ZS1uYW1lXG5cdFx0Ly8gZGVkdXAgYmVsb3cga2VlcHMgYSBkZXRlcm1pbmlzdGljIHdpbm5lciAoZS5nLiB3b3Jrc3BhY2Ugb3ZlciBwZXJzb25hbCkuXG5cdFx0Y29uc3QgZW5hYmxlZFNraWxscyA9IHNraWxsc1xuXHRcdFx0LmZpbHRlcihzID0+ICFkaXNhYmxlZFNraWxscy5oYXMocy51cmkpKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IHRoaXMuZ2V0U2tpbGxQcmlvcml0eShhKSAtIHRoaXMuZ2V0U2tpbGxQcmlvcml0eShiKSk7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kRmlsZXMgPSBbXG5cdFx0XHQuLi5wcm9tcHRGaWxlcyxcblx0XHRcdC4uLmVuYWJsZWRTa2lsbHMsXG5cdFx0XTtcblxuXHRcdGNvbnN0IHBhcnNlUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHNsYXNoQ29tbWFuZEZpbGVzLm1hcChhc3luYyBwcm9tcHRQYXRoID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFByb21wdEZpbGUgPSBhd2FpdCB0aGlzLnBhcnNlTmV3KHByb21wdFBhdGgudXJpLCB0b2tlbik7XG5cdFx0XHRcdGxldCByYXdOYW1lOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChwcm9tcHRQYXRoLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIHNraWxscywgYWx3YXlzIHVzZSB0aGUgZm9sZGVyIG5hbWUgYXMgdGhlIGNhbm9uaWNhbCBuYW1lXG5cdFx0XHRcdFx0Ly8gKGNvbnNpc3RlbnQgd2l0aCBjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvKVxuXHRcdFx0XHRcdHJhd05hbWUgPSBnZXRTa2lsbEZvbGRlck5hbWUocHJvbXB0UGF0aC51cmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJhd05hbWUgPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/Lm5hbWUgPz8gcHJvbXB0UGF0aC5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZShwcm9tcHRQYXRoLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRm9yIHBsdWdpbiByZXNvdXJjZXMsIGVuc3VyZSB0aGUgY2Fub25pY2FsIHBsdWdpbiBwcmVmaXggaXMgYWx3YXlzIHByZXNlcnZlZCBldmVuIHdoZW4gdGhlXG5cdFx0XHRcdC8vIGZpbGUncyBmcm9udG1hdHRlciBvdmVycmlkZXMgdGhlIG5hbWUuXG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBwcm9tcHRQYXRoLnNvdXJjZSA9PT0gUHJvbXB0RmlsZVNvdXJjZS5QbHVnaW4gJiYgcHJvbXB0UGF0aC5wbHVnaW5Vcmlcblx0XHRcdFx0XHQ/IGdldENhbm9uaWNhbFBsdWdpbkNvbW1hbmRJZCh7IHVyaTogcHJvbXB0UGF0aC5wbHVnaW5VcmksIGxhYmVsOiBwcm9tcHRQYXRoLnBsdWdpbkxhYmVsIH0sIHJhd05hbWUpXG5cdFx0XHRcdFx0OiByYXdOYW1lO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8uZGVzY3JpcHRpb24gPz8gcHJvbXB0UGF0aC5kZXNjcmlwdGlvbjtcblx0XHRcdFx0Y29uc3QgYXJndW1lbnRIaW50ID0gcGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5hcmd1bWVudEhpbnQ7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGUgPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/LnVzZXJJbnZvY2FibGU7XG5cdFx0XHRcdHJldHVybiB7IHN0YXR1czogJ2xvYWRlZCcsIHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBuYW1lLCBkZXNjcmlwdGlvbiksIGFyZ3VtZW50SGludCwgdXNlckludm9jYWJsZSB9IHNhdGlzZmllcyBJU2xhc2hDb21tYW5kRGlzY292ZXJ5UmVzdWx0O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW2NvbXB1dGVTbGFzaENvbW1hbmREaXNjb3ZlcnlJbmZvXSBGYWlsZWQgdG8gcGFyc2UgcHJvbXB0IGZpbGUgZm9yIHNsYXNoIGNvbW1hbmQ6ICR7cHJvbXB0UGF0aC51cml9YCwgZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdza2lwcGVkJywgc2tpcFJlYXNvbjogJ3BhcnNlLWVycm9yJywgZXJyb3JNZXNzYWdlOiBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSksIHByb21wdFBhdGggfSBzYXRpc2ZpZXMgSVNsYXNoQ29tbWFuZERpc2NvdmVyeVJlc3VsdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEZWR1cGxpY2F0ZSBza2lsbHMgdGhhdCByZXNvbHZlIHRvIHRoZSBzYW1lIGNhbm9uaWNhbCBuYW1lLiBUaGlzIGNhblxuXHRcdC8vIGhhcHBlbiB3aGVuIHR3byBza2lsbCBsb2NhdGlvbnMgcG9pbnQgYXQgdGhlIHNhbWUgZmlsZXMsIGUuZy4gd2hlblxuXHRcdC8vIGB+Ly5jbGF1ZGUvc2tpbGxzYCBpcyBhIHN5bWxpbmsgdG8gYH4vLmFnZW50cy9za2lsbHNgIChjcmVhdGVkIGJ5XG5cdFx0Ly8gYG5weCBza2lsbHNgKS4gV2l0aG91dCB0aGlzLCBldmVyeSBzdWNoIHNraWxsIHdvdWxkIGFwcGVhciB0d2ljZSBpblxuXHRcdC8vIHRoZSBgL2AgbWVudS4gYHBhcnNlUmVzdWx0c2AgcHJlc2VydmVzIGlucHV0IG9yZGVyLCBzbyBza2lsbHMgYXJlXG5cdFx0Ly8gYWxyZWFkeSBzb3J0ZWQgYnkgcHJlY2VkZW5jZTsgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYSBuYW1lIHdpbnMuXG5cdFx0Y29uc3Qgc2VlblNraWxsTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBmaWxlczogSVNsYXNoQ29tbWFuZERpc2NvdmVyeVJlc3VsdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgcGFyc2VSZXN1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2xvYWRlZCcgJiYgcmVzdWx0LnByb21wdFBhdGgudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IHJlc3VsdC5wcm9tcHRQYXRoLm5hbWU7XG5cdFx0XHRcdGlmIChuYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpZiAoc2VlblNraWxsTmFtZXMuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgc3RhdHVzOiAnc2tpcHBlZCcsIHNraXBSZWFzb246ICdkdXBsaWNhdGUtbmFtZScsIHByb21wdFBhdGg6IHJlc3VsdC5wcm9tcHRQYXRoIH0pO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNlZW5Ta2lsbE5hbWVzLmFkZChuYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZmlsZXMucHVzaChyZXN1bHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdFNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3MoUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRjb25zdCBzb3VyY2VGb2xkZXJzID0gWy4uLnByb21wdFNvdXJjZUZvbGRlcnNdO1xuXG5cdFx0aWYgKHVzZUFnZW50U2tpbGxzKSB7XG5cdFx0XHRjb25zdCBza2lsbFNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3MoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0c291cmNlRm9sZGVycy5wdXNoKC4uLnNraWxsU291cmNlRm9sZGVycyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgZmlsZXMsIHNvdXJjZUZvbGRlcnMsIGR1cmF0aW9uSW5NaWxsaXM6IHN0b3BXYXRjaC5lbGFwc2VkKCkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXJpdmVzIElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10gZnJvbSBjYWNoZWQgZGlzY292ZXJ5IGluZm8uXG5cdCAqL1xuXHRwcml2YXRlIHNsYXNoQ29tbWFuZHNGcm9tRGlzY292ZXJ5SW5mbyhkaXNjb3ZlcnlJbmZvOiBJU2xhc2hDb21tYW5kRGlzY292ZXJ5SW5mbyk6IHJlYWRvbmx5IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUNoYXRQcm9tcHRTbGFzaENvbW1hbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXNjb3ZlcnlJbmZvLmZpbGVzKSB7XG5cdFx0XHRpZiAoZmlsZS5zdGF0dXMgPT09ICdsb2FkZWQnKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuYXNDaGF0UHJvbXB0U2xhc2hDb21tYW5kKGZpbGUuYXJndW1lbnRIaW50LCBmaWxlLnVzZXJJbnZvY2FibGUsIGZpbGUucHJvbXB0UGF0aCkpO1xuXHRcdFx0XHRzZWVuLmFkZChmaWxlLnByb21wdFBhdGgudXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbmNsdWRlIHVudGl0bGVkIHByb21wdCBtb2RlbHMgbm90IGNvdmVyZWQgYnkgZGlzY292ZXJ5XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbHMoKSkge1xuXHRcdFx0aWYgKG1vZGVsLmdldExhbmd1YWdlSWQoKSA9PT0gUFJPTVBUX0xBTkdVQUdFX0lEICYmIG1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgJiYgIXNlZW4uaGFzKG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkUHJvbXB0RmlsZSA9IHRoaXMuZ2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbCk7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/Lm5hbWUgPz8gZ2V0Q2xlYW5Qcm9tcHROYW1lKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5kZXNjcmlwdGlvbjtcblx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5hc0NoYXRQcm9tcHRTbGFzaENvbW1hbmQocGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5hcmd1bWVudEhpbnQsIHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8udXNlckludm9jYWJsZSwgeyB1cmk6IG1vZGVsLnVyaSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZSwgZGVzY3JpcHRpb24gfSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbW1hbmQubWF0Y2goL15bXFxwe0x9XFxkX1xcLVxcLjpdKyQvdSkgIT09IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgaGFzUHJvbXB0U2xhc2hDb21tYW5kKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5rbm93blByb21wdFNsYXNoQ29tbWFuZHNIeWRyYXRpb25TdGFydGVkKSB7XG5cdFx0XHR0aGlzLmtub3duUHJvbXB0U2xhc2hDb21tYW5kc0h5ZHJhdGlvblN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5yZWZyZXNoS25vd25Qcm9tcHRTbGFzaENvbW1hbmROYW1lcygpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKCkgPT4gdGhpcy5yZWZyZXNoS25vd25Qcm9tcHRTbGFzaENvbW1hbmROYW1lcygpKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMuaGFzKG5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBrbm93blByb21wdFNsYXNoQ29tbWFuZHNIeWRyYXRpb25TdGFydGVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWZyZXNoS25vd25Qcm9tcHRTbGFzaENvbW1hbmROYW1lcygpOiB2b2lkIHtcblx0XHR0aGlzLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihjb21tYW5kcyA9PiB7XG5cdFx0XHR0aGlzLmtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdHRoaXMua25vd25Qcm9tcHRTbGFzaENvbW1hbmROYW1lcy5hZGQoY21kLm5hbWUpO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgLyogZGlzY292ZXJ5IGZhaWx1cmVzIGFscmVhZHkgbG9nZ2VkOyBzeW5jIGNhY2hlIHN0YXlzIGFzLWlzICovIH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVQcm9tcHRTbGFzaENvbW1hbmQobmFtZTogc3RyaW5nLCBzZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSZXNvbHZlZENoYXRQcm9tcHRTbGFzaENvbW1hbmQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb21tYW5kcyA9IGF3YWl0IHRoaXMuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyh0b2tlbik7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGNvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSBuYW1lICYmIG1hdGNoZXNTZXNzaW9uVHlwZShjbWQuc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZSkpO1xuXHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5jb21tYW5kLFxuXHRcdFx0XHRwYXJzZWRQcm9tcHRGaWxlOiBhd2FpdCB0aGlzLnBhcnNlTmV3KGNvbW1hbmQudXJpLCB0b2tlbiksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc0NoYXRQcm9tcHRTbGFzaENvbW1hbmQoYXJndW1lbnRIaW50OiBzdHJpbmcgfCB1bmRlZmluZWQsIHVzZXJJbnZvY2FibGU6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHByb21wdFBhdGg6IElQcm9tcHRQYXRoKTogSUNoYXRQcm9tcHRTbGFzaENvbW1hbmQge1xuXHRcdGxldCBuYW1lID0gcHJvbXB0UGF0aC5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZShwcm9tcHRQYXRoLnVyaSk7XG5cdFx0bmFtZSA9IG5hbWUucmVwbGFjZSgvW15cXHB7TH1cXGRfXFwtXFwuOl0rL2d1LCAnLScpOyAvLyByZXBsYWNlIHNwYWNlcyB3aXRoIGRhc2hlc1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHByb21wdFBhdGgudXJpLFxuXHRcdFx0bmFtZTogbmFtZSxcblx0XHRcdHNvdXJjZTogcHJvbXB0UGF0aC5zb3VyY2UsXG5cdFx0XHRzdG9yYWdlOiBwcm9tcHRQYXRoLnN0b3JhZ2UsXG5cdFx0XHR0eXBlOiBwcm9tcHRQYXRoLnR5cGUsXG5cdFx0XHRleHRlbnNpb246IHByb21wdFBhdGguZXh0ZW5zaW9uLFxuXHRcdFx0cGx1Z2luVXJpOiBwcm9tcHRQYXRoLnBsdWdpblVyaSxcblx0XHRcdHBsdWdpbkxhYmVsOiBwcm9tcHRQYXRoLnBsdWdpbkxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHByb21wdFBhdGguZGVzY3JpcHRpb24sXG5cdFx0XHRhcmd1bWVudEhpbnQ6IGFyZ3VtZW50SGludCxcblx0XHRcdHVzZXJJbnZvY2FibGU6IHVzZXJJbnZvY2FibGUgPz8gdHJ1ZSxcblx0XHRcdHNlc3Npb25UeXBlczogcHJvbXB0UGF0aC5zZXNzaW9uVHlwZXMsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRQcm9tcHRTbGFzaENvbW1hbmROYW1lKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCB0aGlzLmdldFByb21wdFNsYXNoQ29tbWFuZHModG9rZW4pO1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjID0+IGlzRXF1YWwoYy51cmksIHVyaSkpO1xuXHRcdGlmICghc2xhc2hDb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBzbGFzaENvbW1hbmQubmFtZTtcblx0fVxuXG5cdC8vIGN1c3RvbSBhZ2VudHNcblxuXHQvKipcblx0ICogRW1pdHRlciBmb3IgY3VzdG9tIGFnZW50cyBjaGFuZ2UgZXZlbnRzLlxuXHQgKi9cblx0cHVibGljIGdldCBvbkRpZENoYW5nZUN1c3RvbUFnZW50cygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkQ3VzdG9tQWdlbnRzLm9uRGlkQ2hhbmdlUHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNhY2hlZEluc3RydWN0aW9ucy5vbkRpZENoYW5nZVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnMoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEN1c3RvbUFnZW50cyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21BZ2VudFtdPiB7XG5cdFx0Y29uc3QgZGlzY292ZXJ5SW5mbyA9IGF3YWl0IHRoaXMuY2FjaGVkQ3VzdG9tQWdlbnRzLmdldCh0b2tlbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5hZ2VudHNGcm9tRGlzY292ZXJ5SW5mbyhkaXNjb3ZlcnlJbmZvKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIERlcml2ZXMgSUN1c3RvbUFnZW50W10gZnJvbSBjYWNoZWQgZGlzY292ZXJ5IGluZm8uXG5cdCAqL1xuXHRwcml2YXRlIGFnZW50c0Zyb21EaXNjb3ZlcnlJbmZvKGRpc2NvdmVyeUluZm86IElBZ2VudERpc2NvdmVyeUluZm8pOiByZWFkb25seSBJQ3VzdG9tQWdlbnRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ3VzdG9tQWdlbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXNjb3ZlcnlJbmZvLmZpbGVzKSB7XG5cdFx0XHRpZiAoZmlsZS5hZ2VudCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChmaWxlLmFnZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZUFnZW50RGlzY292ZXJ5SW5mbyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudERpc2NvdmVyeUluZm8+IHtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdGNvbnN0IGFsbEFnZW50RmlsZXMgPSBhd2FpdCB0aGlzLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgdG9rZW4pO1xuXHRcdGNvbnN0IGRpc2FibGVkQWdlbnRzID0gdGhpcy5nZXREaXNhYmxlZFByb21wdEZpbGVzKFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRjb25zdCB1c2VDaGF0SG9va3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MpO1xuXHRcdGNvbnN0IGlzV29ya3NwYWNlVHJ1c3RlZCA9IHRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpO1xuXG5cdFx0Ly8gR2V0IHVzZXIgaG9tZSBmb3IgdGlsZGUgZXhwYW5zaW9uIGluIGhvb2sgY3dkIHBhdGhzXG5cdFx0Y29uc3QgdXNlckhvbWVVcmkgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB1c2VySG9tZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHVzZXJIb21lVXJpLmZzUGF0aCA6IHVzZXJIb21lVXJpLnBhdGg7XG5cdFx0Y29uc3QgZGVmYXVsdEZvbGRlciA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBQcm9taXNlLmFsbChhbGxBZ2VudEZpbGVzLm1hcChhc3luYyAocHJvbXB0UGF0aCk6IFByb21pc2U8SUFnZW50RGlzY292ZXJ5UmVzdWx0PiA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBwcm9tcHRQYXRoLnVyaTtcblx0XHRcdGNvbnN0IGlzRW5hYmxlZCA9ICFkaXNhYmxlZEFnZW50cy5oYXModXJpKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYXN0ID0gYXdhaXQgdGhpcy5wYXJzZU5ldyh1cmksIHRva2VuKTtcblxuXHRcdFx0XHQvLyBQYXJzZSBob29rcyBmcm9tIHRoZSBmcm9udG1hdHRlciBpZiBwcmVzZW50XG5cdFx0XHRcdGxldCBob29rczogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgaG9va3NSYXcgPSBhc3QuaGVhZGVyPy5ob29rc1Jhdztcblx0XHRcdFx0aWYgKHVzZUNoYXRIb29rcyAmJiBpc1dvcmtzcGFjZVRydXN0ZWQgJiYgaG9va3NSYXcgJiYgdGhpcy5hcmVBZ2VudEhvb2tzQWxsb3dlZChwcm9tcHRQYXRoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tXb3Jrc3BhY2VGb2xkZXIgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHVyaSkgPz8gZGVmYXVsdEZvbGRlcjtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VSb290VXJpID0gaG9va1dvcmtzcGFjZUZvbGRlcj8udXJpO1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IGdldFRhcmdldChQcm9tcHRzVHlwZS5hZ2VudCwgYXN0LmhlYWRlciA/PyBwcm9tcHRQYXRoLnVyaSk7XG5cdFx0XHRcdFx0aG9va3MgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc1Jhdywgd29ya3NwYWNlUm9vdFVyaSwgdXNlckhvbWUsIHRhcmdldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXh0cmEgPSB7XG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiBwcm9tcHRQYXRoLnNlc3Npb25UeXBlcyxcblx0XHRcdFx0XHRob29rcyxcblx0XHRcdFx0XHRuYW1lOiBwcm9tcHRQYXRoLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHByb21wdFBhdGguZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0c291cmNlOiBJQWdlbnRTb3VyY2UuZnJvbVByb21wdFBhdGgocHJvbXB0UGF0aCksXG5cdFx0XHRcdFx0ZW5hYmxlZDogaXNFbmFibGVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IEN1c3RvbUFnZW50LmZyb21QYXJzZWRQcm9tcHRGaWxlKGFzdCwgZXh0cmEpO1xuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSBpc0VuYWJsZWQgPyAnbG9hZGVkJyA6ICdza2lwcGVkJztcblx0XHRcdFx0Y29uc3Qgc2tpcFJlYXNvbiA9IGlzRW5hYmxlZCA/IHVuZGVmaW5lZCA6ICdkaXNhYmxlZCc7XG5cdFx0XHRcdHJldHVybiB7IHN0YXR1cywgc2tpcFJlYXNvbiwgcHJvbXB0UGF0aDogdGhpcy53aXRoUHJvbXB0UGF0aE1ldGFkYXRhKHByb21wdFBhdGgsIGFnZW50Lm5hbWUsIGFnZW50LmRlc2NyaXB0aW9uKSwgYWdlbnQgfTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKFN0cmluZyhlKSk7XG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIud2FybihgW2NvbXB1dGVBZ2VudERpc2NvdmVyeUluZm9dIFNraXBwaW5nIGFnZW50IGZpbGUgdGhhdCBkb2VzIG5vdCBleGlzdDogJHt1cml9YCwgZXJyb3IubWVzc2FnZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW2NvbXB1dGVBZ2VudERpc2NvdmVyeUluZm9dIEZhaWxlZCB0byBwYXJzZSBhZ2VudCBmaWxlOiAke3VyaX1gLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRza2lwUmVhc29uOiAncGFyc2UtZXJyb3InLFxuXHRcdFx0XHRcdGVycm9yTWVzc2FnZTogZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0XHRwcm9tcHRQYXRoLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3MoUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdHJldHVybiB7IHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBmaWxlcywgc291cmNlRm9sZGVycywgZHVyYXRpb25Jbk1pbGxpczogc3RvcFdhdGNoLmVsYXBzZWQoKSB9O1xuXHR9XG5cblxuXHRwdWJsaWMgYXN5bmMgcGFyc2VOZXcodXJpOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UGFyc2VkUHJvbXB0RmlsZT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwodXJpKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFBhcnNlZFByb21wdEZpbGUobW9kZWwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJDb250cmlidXRlZEZpbGUodHlwZTogUHJvbXB0c1R5cGUsIHVyaTogVVJJLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgbmFtZT86IHN0cmluZywgZGVzY3JpcHRpb24/OiBzdHJpbmcsIHdoZW4/OiBzdHJpbmcsIHNlc3Npb25UeXBlcz86IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uUHJvbXB0RmlsZXMucmVnaXN0ZXJDb250cmlidXRlZEZpbGUodHlwZSwgdXJpLCBleHRlbnNpb24sIG5hbWUsIGRlc2NyaXB0aW9uLCB3aGVuLCBzZXNzaW9uVHlwZXMpO1xuXHR9XG5cblx0Z2V0UHJvbXB0TG9jYXRpb25MYWJlbChwcm9tcHRQYXRoOiBJUHJvbXB0UGF0aCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChwcm9tcHRQYXRoLnN0b3JhZ2UpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UubG9jYWw6IHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHByb21wdFBhdGgudXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UudXNlcjogcmV0dXJuIGxvY2FsaXplKCd1c2VyLWRhdGEtZGlyLmNhcGl0YWxpemVkJywgJ1VzZXIgRGF0YScpO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb246IHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdleHRlbnNpb24ud2l0aC5pZCcsICdFeHRlbnNpb246IHswfScsIHByb21wdFBhdGguZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IHByb21wdFBhdGguZXh0ZW5zaW9uLmlkKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UucGx1Z2luOiByZXR1cm4gbG9jYWxpemUoJ3BsdWdpbi5jYXBpdGFsaXplZCcsICdQbHVnaW4nKTtcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbjogcmV0dXJuIGxvY2FsaXplKCdidWlsdGluLmNhcGl0YWxpemVkJywgJ0J1aWx0LWluJyk7XG5cdFx0XHRkZWZhdWx0OiBhc3NlcnROZXZlcihwcm9tcHRQYXRoLCAnVW5rbm93biBwcm9tcHQgc3RvcmFnZSB0eXBlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGxpc3ROZXN0ZWRBZ2VudE1Ecyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudEluc3RydWN0aW9uRmlsZVtdPiB7XG5cdFx0aWYgKHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZChQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHVzZUFnZW50TUQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0FHRU5UX01EKTtcblx0XHRpZiAoIXVzZUFnZW50TUQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgdXNlTmVzdGVkQWdlbnRNRCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfTkVTVEVEX0FHRU5UX01EKTtcblx0XHRpZiAodXNlTmVzdGVkQWdlbnRNRCkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IuZmluZEFnZW50TURzSW5Xb3Jrc3BhY2UodG9rZW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbGlzdEFnZW50SW5zdHJ1Y3Rpb25zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgbG9nZ2VyOiBMb2dnZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPElBZ2VudEluc3RydWN0aW9uRmlsZVtdPiB7XG5cdFx0aWYgKHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZChQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkQWdlbnRGaWxlczogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXTtcblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXT5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgaW5jbHVkZVBhcmVudHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUykgPT09IHRydWU7XG5cdFx0Y29uc3Qgcm9vdEZvbGRlcnMgPSBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmdldFdvcmtzcGFjZUZvbGRlclJvb3RzKGluY2x1ZGVQYXJlbnRzLCBsb2dnZXIpO1xuXG5cdFx0Y29uc3Qgcm9vdEZpbGVzOiBJV29ya3NwYWNlSW5zdHJ1Y3Rpb25GaWxlW10gPSBbXTtcblx0XHRjb25zdCB1c2VBZ2VudE1EID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9NRCk7XG5cdFx0aWYgKCF1c2VBZ2VudE1EKSB7XG5cdFx0XHRsb2dnZXI/LmxvZ0luZm8oJ0FnZW50IE1EIGZpbGVzIGFyZSBkaXNhYmxlZCB2aWEgY29uZmlndXJhdGlvbi4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cm9vdEZpbGVzLnB1c2goeyBmaWxlTmFtZTogQUdFTlRfTURfRklMRU5BTUUsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5hZ2VudHNNZCB9KTtcblx0XHR9XG5cdFx0Y29uc3QgdXNlQ2xhdWRlTUQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NMQVVERV9NRCk7XG5cdFx0aWYgKCF1c2VDbGF1ZGVNRCkge1xuXHRcdFx0bG9nZ2VyPy5sb2dJbmZvKCdDbGF1ZGUgTUQgZmlsZXMgYXJlIGRpc2FibGVkIHZpYSBjb25maWd1cmF0aW9uLicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjbGF1ZGVNZEZpbGUgPSB7IGZpbGVOYW1lOiBDTEFVREVfTURfRklMRU5BTUUsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jbGF1ZGVNZCB9O1xuXHRcdFx0cm9vdEZpbGVzLnB1c2goY2xhdWRlTWRGaWxlKTsgLy8gQ0xBVURFLm1kIGluIHdvcmtzcGFjZSByb290XG5cdFx0XHRyb290RmlsZXMucHVzaCh7IGZpbGVOYW1lOiBDTEFVREVfTE9DQUxfTURfRklMRU5BTUUsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jbGF1ZGVNZCB9KTsgLy8gQ0xBVURFLmxvY2FsLm1kIGluIHdvcmtzcGFjZSByb290XG5cblx0XHRcdHByb21pc2VzLnB1c2godGhpcy5maWxlTG9jYXRvci5maW5kRmlsZXNJblJvb3RzKHJvb3RGb2xkZXJzLCBDTEFVREVfQ09ORklHX0ZPTERFUiwgW2NsYXVkZU1kRmlsZV0sIHRva2VuLCByZXNvbHZlZEFnZW50RmlsZXMpKTsgLy8gQ0xBVURFLm1kIGluIC5jbGF1ZGUgZm9sZGVyIHVuZGVyIHdvcmtzcGFjZSByb290XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuZmlsZUxvY2F0b3IuZmluZEZpbGVzSW5Sb290cyhbYXdhaXQgdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpXSwgQ0xBVURFX0NPTkZJR19GT0xERVIsIFtjbGF1ZGVNZEZpbGVdLCB0b2tlbiwgcmVzb2x2ZWRBZ2VudEZpbGVzKSk7IC8vIENMQVVERS5tZCBpbiBpbiB+Ly5jbGF1ZGUgZm9sZGVyXG5cdFx0fVxuXHRcdGNvbnN0IHVzZUNvcGlsb3RJbnN0cnVjdGlvbnNGaWxlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQ09QSUxPVF9JTlNUUlVDVElPTl9GSUxFUyk7XG5cdFx0aWYgKCF1c2VDb3BpbG90SW5zdHJ1Y3Rpb25zRmlsZXMpIHtcblx0XHRcdGxvZ2dlcj8ubG9nSW5mbygnQ29waWxvdCBpbnN0cnVjdGlvbnMgZmlsZXMgYXJlIGRpc2FibGVkIHZpYSBjb25maWd1cmF0aW9uLicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb3BpbG90SW5zdHJ1Y3Rpb25zRmlsZSA9IHsgZmlsZU5hbWU6IENPUElMT1RfQ1VTVE9NX0lOU1RSVUNUSU9OU19GSUxFTkFNRSwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCB9O1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLmZpbGVMb2NhdG9yLmZpbmRGaWxlc0luUm9vdHMocm9vdEZvbGRlcnMsIEdJVEhVQl9DT05GSUdfRk9MREVSLCBbY29waWxvdEluc3RydWN0aW9uc0ZpbGVdLCB0b2tlbiwgcmVzb2x2ZWRBZ2VudEZpbGVzKSk7IC8vIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kIGluIC5naXRodWIgZm9sZGVyIHVuZGVyIHdvcmtzcGFjZSByb290XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuZmlsZUxvY2F0b3IuZmluZEZpbGVzSW5Sb290cyhbYXdhaXQgdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpXSwgQ09QSUxPVF9DT05GSUdfRk9MREVSLCBbY29waWxvdEluc3RydWN0aW9uc0ZpbGVdLCB0b2tlbiwgcmVzb2x2ZWRBZ2VudEZpbGVzKSk7IC8vIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kIGluIH4vLmNvcGlsb3QgZm9sZGVyXG5cdFx0fVxuXG5cdFx0cHJvbWlzZXMucHVzaCh0aGlzLmZpbGVMb2NhdG9yLmZpbmRGaWxlc0luUm9vdHMocm9vdEZvbGRlcnMsIHVuZGVmaW5lZCwgcm9vdEZpbGVzLCB0b2tlbiwgcmVzb2x2ZWRBZ2VudEZpbGVzKSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdC8vIGZpcnN0IGxvb2sgYXQgbm9uLXN5bWxpbmtlZCBmaWxlcywgdGhlbiBhZGQgc3ltbGlua3Mgb25seSBpZiB0YXJnZXQgbm90IGFscmVhZHkgaW5jbHVkZWRcblx0XHRjb25zdCBzZWVuRmlsZVVSSSA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGNvbnN0IHN5bWxpbmtzOiAoSUFnZW50SW5zdHJ1Y3Rpb25GaWxlICYgeyByZWFsUGF0aDogVVJJIH0pW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHQ6IElBZ2VudEluc3RydWN0aW9uRmlsZVtdID0gW107XG5cdFx0Y29uc3QgYWRkID0gKGZpbGU6IElBZ2VudEluc3RydWN0aW9uRmlsZSkgPT4ge1xuXHRcdFx0aWYgKGZpbGUucmVhbFBhdGgpIHtcblx0XHRcdFx0c3ltbGlua3MucHVzaChmaWxlIGFzIElBZ2VudEluc3RydWN0aW9uRmlsZSAmIHsgcmVhbFBhdGg6IFVSSSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGZpbGUpO1xuXHRcdFx0XHRzZWVuRmlsZVVSSS5hZGQoZmlsZS51cmkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblx0XHRyZXNvbHZlZEFnZW50RmlsZXMuZm9yRWFjaChhZGQpO1xuXHRcdGZvciAoY29uc3Qgc3ltbGluayBvZiBzeW1saW5rcykge1xuXHRcdFx0aWYgKHNlZW5GaWxlVVJJLmhhcyhzeW1saW5rLnJlYWxQYXRoKSkge1xuXHRcdFx0XHRsb2dnZXI/LmxvZ0luZm8oYFNraXBwaW5nIHN5bWxpbmtlZCBhZ2VudCBpbnN0cnVjdGlvbnMgZmlsZSAke3N5bWxpbmsudXJpfSBhcyB0YXJnZXQgYWxyZWFkeSBpbmNsdWRlZDogJHtzeW1saW5rLnJlYWxQYXRofWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goc3ltbGluayk7XG5cdFx0XHRcdHNlZW5GaWxlVVJJLmFkZChzeW1saW5rLnJlYWxQYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFZvaWNlSW5zdHJ1Y3Rpb25zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3BlZWNoSW5zdHJ1Y3Rpb25zKFZPSUNFX0lOU1RSVUNUSU9OU19GSUxFTkFNRSwgJ3ZvaWNlJywgdG9rZW4pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldERpY3RhdGlvbkluc3RydWN0aW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFNwZWVjaEluc3RydWN0aW9ucyhESUNUQVRJT05fSU5TVFJVQ1RJT05TX0ZJTEVOQU1FLCAnZGljdGF0aW9uJywgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTcGVlY2hJbnN0cnVjdGlvbnMoZmlsZU5hbWU6IHN0cmluZywga2luZDogJ3ZvaWNlJyB8ICdkaWN0YXRpb24nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHVzZXJIb21lID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IFtqb2luUGF0aCh1c2VySG9tZSwgQ09QSUxPVF9DT05GSUdfRk9MREVSLCBmaWxlTmFtZSldO1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlUm9vdHMgPSBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmdldFdvcmtzcGFjZUZvbGRlclJvb3RzKGZhbHNlKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y2FuZGlkYXRlcy5wdXNoKC4uLndvcmtzcGFjZVJvb3RzLm1hcChyb290ID0+IGpvaW5QYXRoKHJvb3QsIEdJVEhVQl9DT05GSUdfRk9MREVSLCBmaWxlTmFtZSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShjYW5kaWRhdGUsIHVuZGVmaW5lZCwgdG9rZW4pKS52YWx1ZS50b1N0cmluZygpLnRyaW0oKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRcdGNvbnRlbnRzLnB1c2goY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci53YXJuKGBbUHJvbXB0c1NlcnZpY2VdIEZhaWxlZCB0byByZWFkICR7a2luZH0gaW5zdHJ1Y3Rpb25zIGZyb20gJHtjYW5kaWRhdGUudG9TdHJpbmcoKX06ICR7ZXJyb3J9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRlbnRzLmxlbmd0aCA+IDAgPyBjb250ZW50cy5qb2luKCdcXG5cXG4nKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBZ2VudEZpbGVVUklGcm9tTW9kZUZpbGUob2xkVVJJOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmZpbGVMb2NhdG9yLmdldEFnZW50RmlsZVVSSUZyb21Nb2RlRmlsZShvbGRVUkkpO1xuXHR9XG5cblx0Ly8gLS0tIEVuYWJsZWQgUHJvbXB0IEZpbGVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNhYmxlZFByb21wdHNTdG9yYWdlS2V5UHJlZml4ID0gJ2NoYXQuZGlzYWJsZWRQcm9tcHRGaWxlcy4nO1xuXG5cdHB1YmxpYyBnZXREaXNhYmxlZFByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlKTogUmVzb3VyY2VTZXQge1xuXHRcdC8vIE1pZ3JhdGlvbjogaWYgZGlzYWJsZWQga2V5IGFic2VudCBidXQgbGVnYWN5IGVuYWJsZWQga2V5IHByZXNlbnQsIGNvbnZlcnQgb25jZS5cblx0XHRjb25zdCBkaXNhYmxlZEtleSA9IHRoaXMuZGlzYWJsZWRQcm9tcHRzU3RvcmFnZUtleVByZWZpeCArIHR5cGU7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChkaXNhYmxlZEtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhcnIgPSBKU09OLnBhcnNlKHZhbHVlKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGFycikpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIGFycikge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuYWRkKFVSSS5yZXZpdmUocykpO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmUgaW52YWxpZCBzdG9yYWdlIHZhbHVlc1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHNldERpc2FibGVkUHJvbXB0RmlsZXModHlwZTogUHJvbXB0c1R5cGUsIHVyaXM6IFJlc291cmNlU2V0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBBcnJheS5mcm9tKHVyaXMpLm1hcCh1cmkgPT4gdXJpLnRvSlNPTigpKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuZGlzYWJsZWRQcm9tcHRzU3RvcmFnZUtleVByZWZpeCArIHR5cGUsIEpTT04uc3RyaW5naWZ5KGRpc2FibGVkKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KSB7XG5cdFx0XHR0aGlzLmNhY2hlZEN1c3RvbUFnZW50cy5yZWZyZXNoKCk7XG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0dGhpcy5jYWNoZWRTa2lsbHMucmVmcmVzaCgpO1xuXHRcdFx0dGhpcy5jYWNoZWRTbGFzaENvbW1hbmRzLnJlZnJlc2goKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBZ2VudCBza2lsbHNcblxuXHRwcml2YXRlIHNhbml0aXplQWdlbnRTa2lsbFRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBSZW1vdmUgWE1MIHRhZ3Ncblx0XHRyZXR1cm4gdGV4dC5yZXBsYWNlKC88W14+XSs+L2csICcnKTtcblx0fVxuXG5cdHByaXZhdGUgdHJ1bmNhdGVBZ2VudFNraWxsTmFtZShuYW1lOiBzdHJpbmcsIHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBNQVhfTkFNRV9MRU5HVEggPSA2NDtcblx0XHRjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplQWdlbnRTa2lsbFRleHQobmFtZSk7XG5cdFx0aWYgKHNhbml0aXplZCAhPT0gbmFtZSkge1xuXHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFtmaW5kQWdlbnRTa2lsbHNdIEFnZW50IHNraWxsIG5hbWUgY29udGFpbnMgWE1MIHRhZ3MsIHJlbW92ZWQ6ICR7dXJpfWApO1xuXHRcdH1cblx0XHRpZiAoc2FuaXRpemVkLmxlbmd0aCA+IE1BWF9OQU1FX0xFTkdUSCkge1xuXHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFtmaW5kQWdlbnRTa2lsbHNdIEFnZW50IHNraWxsIG5hbWUgZXhjZWVkcyAke01BWF9OQU1FX0xFTkdUSH0gY2hhcmFjdGVycywgdHJ1bmNhdGVkOiAke3VyaX1gKTtcblx0XHRcdHJldHVybiBzYW5pdGl6ZWQuc3Vic3RyaW5nKDAsIE1BWF9OQU1FX0xFTkdUSCk7XG5cdFx0fVxuXHRcdHJldHVybiBzYW5pdGl6ZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRydW5jYXRlQWdlbnRTa2lsbERlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHVyaTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBNQVhfREVTQ1JJUFRJT05fTEVOR1RIID0gMTAyNDtcblx0XHRjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplQWdlbnRTa2lsbFRleHQoZGVzY3JpcHRpb24pO1xuXHRcdGlmIChzYW5pdGl6ZWQgIT09IGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2ZpbmRBZ2VudFNraWxsc10gQWdlbnQgc2tpbGwgZGVzY3JpcHRpb24gY29udGFpbnMgWE1MIHRhZ3MsIHJlbW92ZWQ6ICR7dXJpfWApO1xuXHRcdH1cblx0XHRpZiAoc2FuaXRpemVkLmxlbmd0aCA+IE1BWF9ERVNDUklQVElPTl9MRU5HVEgpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbZmluZEFnZW50U2tpbGxzXSBBZ2VudCBza2lsbCBkZXNjcmlwdGlvbiBleGNlZWRzICR7TUFYX0RFU0NSSVBUSU9OX0xFTkdUSH0gY2hhcmFjdGVycywgdHJ1bmNhdGVkOiAke3VyaX1gKTtcblx0XHRcdHJldHVybiBzYW5pdGl6ZWQuc3Vic3RyaW5nKDAsIE1BWF9ERVNDUklQVElPTl9MRU5HVEgpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2FuaXRpemVkO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZENoYW5nZVNraWxscygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkU2tpbGxzLm9uRGlkQ2hhbmdlUHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VIb29rcygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkSG9va3Mub25EaWRDaGFuZ2VQcm9taXNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZpbmRBZ2VudFNraWxscyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudFNraWxsW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB1c2VBZ2VudFNraWxscyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTKTtcblx0XHRpZiAoIXVzZUFnZW50U2tpbGxzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2NvdmVyeUluZm8gPSBhd2FpdCB0aGlzLmNhY2hlZFNraWxscy5nZXQodG9rZW4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2tpbGxzRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXJpdmVzIElBZ2VudFNraWxsW10gZnJvbSBjYWNoZWQgZGlzY292ZXJ5IGluZm8uXG5cdCAqL1xuXHRwcml2YXRlIHNraWxsc0Zyb21EaXNjb3ZlcnlJbmZvKGRpc2NvdmVyeUluZm86IElQcm9tcHREaXNjb3ZlcnlJbmZvKTogSUFnZW50U2tpbGxbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQWdlbnRTa2lsbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGRpc2NvdmVyeUluZm8uZmlsZXMpIHtcblx0XHRcdGlmIChmaWxlLnN0YXR1cyA9PT0gJ2xvYWRlZCcgJiYgZmlsZS5wcm9tcHRQYXRoLm5hbWUpIHtcblx0XHRcdFx0Y29uc3Qgc2FuaXRpemVkRGVzY3JpcHRpb24gPSB0aGlzLnRydW5jYXRlQWdlbnRTa2lsbERlc2NyaXB0aW9uKGZpbGUucHJvbXB0UGF0aC5kZXNjcmlwdGlvbiwgZmlsZS5wcm9tcHRQYXRoLnVyaSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHR1cmk6IGZpbGUucHJvbXB0UGF0aC51cmksXG5cdFx0XHRcdFx0c3RvcmFnZTogZmlsZS5wcm9tcHRQYXRoLnN0b3JhZ2UsXG5cdFx0XHRcdFx0bmFtZTogZmlsZS5wcm9tcHRQYXRoLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNhbml0aXplZERlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb246IGZpbGUuZGlzYWJsZU1vZGVsSW52b2NhdGlvbiA/PyBmYWxzZSxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiBmaWxlLnVzZXJJbnZvY2FibGUgPz8gdHJ1ZSxcblx0XHRcdFx0XHRwbHVnaW5Vcmk6IGZpbGUucHJvbXB0UGF0aC5wbHVnaW5VcmksXG5cdFx0XHRcdFx0cGx1Z2luTGFiZWw6IGZpbGUucHJvbXB0UGF0aC5wbHVnaW5MYWJlbCxcblx0XHRcdFx0XHRleHRlbnNpb246IGZpbGUucHJvbXB0UGF0aC5leHRlbnNpb24sXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiBmaWxlLnByb21wdFBhdGguc2Vzc2lvblR5cGVzLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgZnVsbCBza2lsbCBkaXNjb3ZlcnkgaW5mbywgaW5jbHVkaW5nIHNvdXJjZSBmb2xkZXJzIGFuZCB0ZWxlbWV0cnkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVTa2lsbERpc2NvdmVyeSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcm9tcHREaXNjb3ZlcnlJbmZvPiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKTtcblx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHRoaXMuY29tcHV0ZVNraWxsRGlzY292ZXJ5SW5mbyh0b2tlbik7XG5cdFx0Y29uc3Qgc291cmNlRm9sZGVycyA9IGF3YWl0IHRoaXMuX2NvbGxlY3RTb3VyY2VGb2xkZXJEaWFnbm9zdGljcyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cblx0XHQvLyBDb3VudCBieSBzb3VyY2UgZm9yIHRlbGVtZXRyeVxuXHRcdGNvbnN0IHNraWxsc0J5U291cmNlID0gbmV3IE1hcDxQcm9tcHRGaWxlU291cmNlLCBudW1iZXI+KCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRpZiAoZmlsZS5zdGF0dXMgPT09ICdsb2FkZWQnICYmIGZpbGUucHJvbXB0UGF0aC5uYW1lKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IGZpbGUucHJvbXB0UGF0aC5zb3VyY2U7XG5cdFx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0XHRza2lsbHNCeVNvdXJjZS5zZXQoc291cmNlLCAoc2tpbGxzQnlTb3VyY2UuZ2V0KHNvdXJjZSkgfHwgMCkgKyAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvdW50IHNraXAgcmVhc29ucyBmb3IgdGVsZW1ldHJ5XG5cdFx0bGV0IHNraXBwZWRNaXNzaW5nTmFtZSA9IDA7XG5cdFx0bGV0IHNraXBwZWRNaXNzaW5nRGVzY3JpcHRpb24gPSAwO1xuXHRcdGxldCBza2lwcGVkRHVwbGljYXRlTmFtZSA9IDA7XG5cdFx0bGV0IHNraXBwZWRQYXJzZUZhaWxlZCA9IDA7XG5cdFx0bGV0IHNraXBwZWROYW1lTWlzbWF0Y2ggPSAwO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0aWYgKGZpbGUuc3RhdHVzID09PSAnc2tpcHBlZCcpIHtcblx0XHRcdFx0c3dpdGNoIChmaWxlLnNraXBSZWFzb24pIHtcblx0XHRcdFx0XHRjYXNlICdtaXNzaW5nLW5hbWUnOiBza2lwcGVkTWlzc2luZ05hbWUrKzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbWlzc2luZy1kZXNjcmlwdGlvbic6IHNraXBwZWRNaXNzaW5nRGVzY3JpcHRpb24rKzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZHVwbGljYXRlLW5hbWUnOiBza2lwcGVkRHVwbGljYXRlTmFtZSsrOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICduYW1lLW1pc21hdGNoJzogc2tpcHBlZE5hbWVNaXNtYXRjaCsrOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICdwYXJzZS1lcnJvcic6IHNraXBwZWRQYXJzZUZhaWxlZCsrOyBicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNlbmQgdGVsZW1ldHJ5IGFib3V0IHNraWxsIHVzYWdlXG5cdFx0dHlwZSBBZ2VudFNraWxsc0ZvdW5kRXZlbnQgPSB7XG5cdFx0XHR0b3RhbFNraWxsc0ZvdW5kOiBudW1iZXI7XG5cdFx0XHRjbGF1ZGVQZXJzb25hbDogbnVtYmVyO1xuXHRcdFx0Y2xhdWRlV29ya3NwYWNlOiBudW1iZXI7XG5cdFx0XHRjb3BpbG90UGVyc29uYWw6IG51bWJlcjtcblx0XHRcdGdpdGh1YldvcmtzcGFjZTogbnVtYmVyO1xuXHRcdFx0YWdlbnRzUGVyc29uYWw6IG51bWJlcjtcblx0XHRcdGFnZW50c1dvcmtzcGFjZTogbnVtYmVyO1xuXHRcdFx0Y29uZmlnUGVyc29uYWw6IG51bWJlcjtcblx0XHRcdGNvbmZpZ1dvcmtzcGFjZTogbnVtYmVyO1xuXHRcdFx0ZXh0ZW5zaW9uQ29udHJpYnV0aW9uOiBudW1iZXI7XG5cdFx0XHRleHRlbnNpb25BUEk6IG51bWJlcjtcblx0XHRcdHBsdWdpbjogbnVtYmVyO1xuXHRcdFx0c2tpcHBlZER1cGxpY2F0ZU5hbWU6IG51bWJlcjtcblx0XHRcdHNraXBwZWRNaXNzaW5nTmFtZTogbnVtYmVyO1xuXHRcdFx0c2tpcHBlZE1pc3NpbmdEZXNjcmlwdGlvbjogbnVtYmVyO1xuXHRcdFx0c2tpcHBlZE5hbWVNaXNtYXRjaDogbnVtYmVyO1xuXHRcdFx0c2tpcHBlZFBhcnNlRmFpbGVkOiBudW1iZXI7XG5cdFx0fTtcblxuXHRcdHR5cGUgQWdlbnRTa2lsbHNGb3VuZENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0dG90YWxTa2lsbHNGb3VuZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RvdGFsIG51bWJlciBvZiBhZ2VudCBza2lsbHMgZm91bmQuJyB9O1xuXHRcdFx0Y2xhdWRlUGVyc29uYWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgQ2xhdWRlIHBlcnNvbmFsIHNraWxscy4nIH07XG5cdFx0XHRjbGF1ZGVXb3Jrc3BhY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgQ2xhdWRlIHdvcmtzcGFjZSBza2lsbHMuJyB9O1xuXHRcdFx0Y29waWxvdFBlcnNvbmFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIENvcGlsb3QgcGVyc29uYWwgc2tpbGxzLicgfTtcblx0XHRcdGdpdGh1YldvcmtzcGFjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBHaXRIdWIgd29ya3NwYWNlIHNraWxscy4nIH07XG5cdFx0XHRhZ2VudHNQZXJzb25hbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiAuYWdlbnRzIHBlcnNvbmFsIHNraWxscy4nIH07XG5cdFx0XHRhZ2VudHNXb3Jrc3BhY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgLmFnZW50cyB3b3Jrc3BhY2Ugc2tpbGxzLicgfTtcblx0XHRcdGNvbmZpZ1BlcnNvbmFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGN1c3RvbSBjb25maWd1cmVkIHBlcnNvbmFsIHNraWxscy4nIH07XG5cdFx0XHRjb25maWdXb3Jrc3BhY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgY3VzdG9tIGNvbmZpZ3VyZWQgd29ya3NwYWNlIHNraWxscy4nIH07XG5cdFx0XHRleHRlbnNpb25Db250cmlidXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIHNraWxscy4nIH07XG5cdFx0XHRleHRlbnNpb25BUEk6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9uIEFQSSBwcm92aWRlZCBza2lsbHMuJyB9O1xuXHRcdFx0cGx1Z2luOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHBsdWdpbiBwcm92aWRlZCBza2lsbHMuJyB9O1xuXHRcdFx0c2tpcHBlZER1cGxpY2F0ZU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2Ygc2tpbGxzIHNraXBwZWQgZHVlIHRvIGR1cGxpY2F0ZSBuYW1lcy4nIH07XG5cdFx0XHRza2lwcGVkTWlzc2luZ05hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2Ygc2tpbGxzIHNraXBwZWQgZHVlIHRvIG1pc3NpbmcgbmFtZSBhdHRyaWJ1dGUuJyB9O1xuXHRcdFx0c2tpcHBlZE1pc3NpbmdEZXNjcmlwdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBza2lsbHMgc2tpcHBlZCBkdWUgdG8gbWlzc2luZyBkZXNjcmlwdGlvbiBhdHRyaWJ1dGUuJyB9O1xuXHRcdFx0c2tpcHBlZE5hbWVNaXNtYXRjaDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBza2lsbHMgc2tpcHBlZCBkdWUgdG8gbmFtZSBub3QgbWF0Y2hpbmcgZm9sZGVyIG5hbWUuJyB9O1xuXHRcdFx0c2tpcHBlZFBhcnNlRmFpbGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHNraWxscyBza2lwcGVkIGR1ZSB0byBwYXJzZSBmYWlsdXJlcy4nIH07XG5cdFx0XHRvd25lcjogJ3B3YW5nMzQ3Jztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3MgYWdlbnQgc2tpbGwgdXNhZ2UsIGRpc2NvdmVyeSwgYW5kIHNraXBwZWQgZmlsZXMuJztcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG90YWxTa2lsbHNGb3VuZCA9IGZpbGVzLmZpbHRlcihmID0+IGYuc3RhdHVzID09PSAnbG9hZGVkJyAmJiBmLnByb21wdFBhdGgubmFtZSkubGVuZ3RoO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFnZW50U2tpbGxzRm91bmRFdmVudCwgQWdlbnRTa2lsbHNGb3VuZENsYXNzaWZpY2F0aW9uPignYWdlbnRTa2lsbHNGb3VuZCcsIHtcblx0XHRcdHRvdGFsU2tpbGxzRm91bmQsXG5cdFx0XHRjbGF1ZGVQZXJzb25hbDogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuQ2xhdWRlUGVyc29uYWwpID8/IDAsXG5cdFx0XHRjbGF1ZGVXb3Jrc3BhY2U6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkNsYXVkZVdvcmtzcGFjZSkgPz8gMCxcblx0XHRcdGNvcGlsb3RQZXJzb25hbDogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuQ29waWxvdFBlcnNvbmFsKSA/PyAwLFxuXHRcdFx0Z2l0aHViV29ya3NwYWNlOiBza2lsbHNCeVNvdXJjZS5nZXQoUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UpID8/IDAsXG5cdFx0XHRhZ2VudHNQZXJzb25hbDogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuQWdlbnRzUGVyc29uYWwpID8/IDAsXG5cdFx0XHRhZ2VudHNXb3Jrc3BhY2U6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkFnZW50c1dvcmtzcGFjZSkgPz8gMCxcblx0XHRcdGNvbmZpZ1dvcmtzcGFjZTogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuQ29uZmlnV29ya3NwYWNlKSA/PyAwLFxuXHRcdFx0Y29uZmlnUGVyc29uYWw6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1BlcnNvbmFsKSA/PyAwLFxuXHRcdFx0ZXh0ZW5zaW9uQ29udHJpYnV0aW9uOiBza2lsbHNCeVNvdXJjZS5nZXQoUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25Db250cmlidXRpb24pID8/IDAsXG5cdFx0XHRleHRlbnNpb25BUEk6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkFQSSkgPz8gMCxcblx0XHRcdHBsdWdpbjogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuUGx1Z2luKSA/PyAwLFxuXHRcdFx0c2tpcHBlZER1cGxpY2F0ZU5hbWUsXG5cdFx0XHRza2lwcGVkTWlzc2luZ05hbWUsXG5cdFx0XHRza2lwcGVkTWlzc2luZ0Rlc2NyaXB0aW9uLFxuXHRcdFx0c2tpcHBlZE5hbWVNaXNtYXRjaCxcblx0XHRcdHNraXBwZWRQYXJzZUZhaWxlZFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIGZpbGVzLCBzb3VyY2VGb2xkZXJzLCBkdXJhdGlvbkluTWlsbGlzOiBzdG9wV2F0Y2guZWxhcHNlZCgpIH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0SG9va3ModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ29uZmlndXJlZEhvb2tzSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpc2NvdmVyeUluZm8gPSBhd2FpdCB0aGlzLmNhY2hlZEhvb2tzLmdldCh0b2tlbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGlzY292ZXJ5SW5mby5ob29rc0luZm87XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXREaXNjb3ZlcnlJbmZvKHR5cGU6IFByb21wdHNUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcm9tcHREaXNjb3ZlcnlJbmZvPiB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FjaGVkSW5zdHJ1Y3Rpb25zLmdldCh0b2tlbik7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FjaGVkU2xhc2hDb21tYW5kcy5nZXQodG9rZW4pO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FjaGVkQ3VzdG9tQWdlbnRzLmdldCh0b2tlbik7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5jYWNoZWRTa2lsbHMuZ2V0KHRva2VuKTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FjaGVkSG9va3MuZ2V0KHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0SW5zdHJ1Y3Rpb25GaWxlcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElJbnN0cnVjdGlvbkZpbGVbXT4ge1xuXHRcdGNvbnN0IGRpc2NvdmVyeUluZm8gPSBhd2FpdCB0aGlzLmNhY2hlZEluc3RydWN0aW9ucy5nZXQodG9rZW4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuaW5zdHJ1Y3Rpb25zRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgaW5zdHJ1Y3Rpb25zRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbzogSUluc3RydWN0aW9uRGlzY292ZXJ5SW5mbyk6IElJbnN0cnVjdGlvbkZpbGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJSW5zdHJ1Y3Rpb25GaWxlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGlzY292ZXJ5SW5mby5maWxlcykge1xuXHRcdFx0aWYgKGZpbGUuc3RhdHVzID09PSAnbG9hZGVkJyAmJiBmaWxlLnByb21wdFBhdGgubmFtZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBmaWxlLnByb21wdFBhdGgudXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IGZpbGUucHJvbXB0UGF0aC5zdG9yYWdlLFxuXHRcdFx0XHRcdGV4dGVuc2lvbjogZmlsZS5wcm9tcHRQYXRoLmV4dGVuc2lvbixcblx0XHRcdFx0XHRwbHVnaW5Vcmk6IGZpbGUucHJvbXB0UGF0aC5wbHVnaW5VcmksXG5cdFx0XHRcdFx0c291cmNlOiBmaWxlLnByb21wdFBhdGguc291cmNlLFxuXHRcdFx0XHRcdG5hbWU6IGZpbGUucHJvbXB0UGF0aC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBmaWxlLnByb21wdFBhdGguZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cGF0dGVybjogZmlsZS5wYXR0ZXJuLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogZmlsZS5wcm9tcHRQYXRoLnNlc3Npb25UeXBlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhQcm9tcHRQYXRoTWV0YWRhdGEocHJvbXB0UGF0aDogSVByb21wdFBhdGgsIG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IElQcm9tcHRQYXRoIHtcblx0XHRyZXR1cm4geyAuLi5wcm9tcHRQYXRoLCBuYW1lLCBkZXNjcmlwdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlSW5zdHJ1Y3Rpb25GaWxlcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElJbnN0cnVjdGlvbkRpc2NvdmVyeUluZm8+IHtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5nZXRJbnN0cnVjdGlvbnNEaXNjb3ZlcnlJbmZvKHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZUhvb2tzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUhvb2tEaXNjb3ZlcnlJbmZvPiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKTtcblx0XHRjb25zdCB1c2VDaGF0SG9va3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MpO1xuXG5cdFx0aWYgKCF1c2VDaGF0SG9va3MgfHwgIXRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRjb25zdCBob29rRmlsZXMgPSBhd2FpdCB0aGlzLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5ob29rLCB0b2tlbik7XG5cdFx0XHRjb25zdCBza2lwUmVhc29uOiBJUHJvbXB0RmlsZURpc2NvdmVyeVJlc3VsdFsnc2tpcFJlYXNvbiddID0gIXVzZUNoYXRIb29rcyA/ICdkaXNhYmxlZCcgOiAnd29ya3NwYWNlLXVudHJ1c3RlZCc7XG5cdFx0XHRjb25zdCBmaWxlcyA9IGhvb2tGaWxlcy5tYXAocHJvbXB0UGF0aCA9PiAoe1xuXHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyBhcyBjb25zdCxcblx0XHRcdFx0c2tpcFJlYXNvbixcblx0XHRcdFx0cHJvbXB0UGF0aDogdGhpcy53aXRoUHJvbXB0UGF0aE1ldGFkYXRhKHByb21wdFBhdGgsIGJhc2VuYW1lKHByb21wdFBhdGgudXJpKSwgcHJvbXB0UGF0aC5kZXNjcmlwdGlvbiksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBzb3VyY2VGb2xkZXJzID0gYXdhaXQgdGhpcy5fY29sbGVjdFNvdXJjZUZvbGRlckRpYWdub3N0aWNzKFByb21wdHNUeXBlLmhvb2spO1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgZmlsZXMsIHNvdXJjZUZvbGRlcnMsIGhvb2tzSW5mbzogdW5kZWZpbmVkLCBkdXJhdGlvbkluTWlsbGlzOiBzdG9wV2F0Y2guZWxhcHNlZCgpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlQ2xhdWRlSG9va3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFByb21wdHNDb25maWcuVVNFX0NMQVVERV9IT09LUyk7XG5cdFx0Y29uc3QgaG9va0ZpbGVzID0gYXdhaXQgdGhpcy5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgdG9rZW4pO1xuXG5cdFx0dGhpcy5sb2dnZXIudHJhY2UoYFtQcm9tcHRzU2VydmljZV0gRm91bmQgJHtob29rRmlsZXMubGVuZ3RofSBob29rIGZpbGUocykuYCk7XG5cblx0XHQvLyBHZXQgdXNlciBob21lIGZvciB0aWxkZSBleHBhbnNpb25cblx0XHRjb25zdCB1c2VySG9tZVVyaSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRjb25zdCB1c2VySG9tZSA9IHVzZXJIb21lVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gdXNlckhvbWVVcmkuZnNQYXRoIDogdXNlckhvbWVVcmkucGF0aDtcblxuXHRcdGNvbnN0IGRlZmF1bHRGb2xkZXIgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblxuXHRcdC8vIFByb2Nlc3MgZWFjaCBob29rIGZpbGUgaW4gcGFyYWxsZWxcblx0XHRjb25zdCBmaWxlUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGhvb2tGaWxlcy5tYXAoYXN5bmMgKGhvb2tGaWxlKTogUHJvbWlzZTx7XG5cdFx0XHRmaWxlPzogSVByb21wdEZpbGVEaXNjb3ZlcnlSZXN1bHQ7XG5cdFx0XHRob29rcz86IE1hcDxIb29rVHlwZSwgSVBhcnNlZEhvb2tDb21tYW5kW10+O1xuXHRcdFx0c291cmNlVXJpPzogVVJJO1xuXHRcdFx0aGFzRGlzYWJsZWRDbGF1ZGVIb29rcz86IGJvb2xlYW47XG5cdFx0fT4gPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lKGhvb2tGaWxlLnVyaSk7XG5cblx0XHRcdC8vIFBsdWdpbnMgYXJlIGhhbmRsZWQgc2VwYXJhdGVseSBkb3duIGJlbG93IGJlY2F1c2UgdGhleSBkbyB0aGVpciBvd24gcGFyc2luZytpbnRlcnBvbGF0aW9uXG5cdFx0XHRpZiAoaG9va0ZpbGUuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZmlsZToge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiAnbG9hZGVkJyxcblx0XHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShob29rRmlsZSwgbmFtZSwgaG9va0ZpbGUuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGhvb2tGaWxlLnVyaSk7XG5cdFx0XHRcdGNvbnN0IHBhcnNlRXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdFx0Y29uc3QganNvbiA9IHBhcnNlSlNPTkMoY29udGVudC52YWx1ZS50b1N0cmluZygpLCBwYXJzZUVycm9ycyk7XG5cblx0XHRcdFx0aWYgKHBhcnNlRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdCA9IHBhcnNlRXJyb3JzWzBdO1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBnZXRQYXJzZUVycm9yTWVzc2FnZShmaXJzdC5lcnJvcikgfHwgJ0ludmFsaWQgSlNPTic7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZpbGU6IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRcdFx0XHRcdHNraXBSZWFzb246ICdwYXJzZS1lcnJvcicsXG5cdFx0XHRcdFx0XHRcdGVycm9yTWVzc2FnZTogYCR7bWVzc2FnZX0gYXQgb2Zmc2V0ICR7Zmlyc3Qub2Zmc2V0fWAsXG5cdFx0XHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShob29rRmlsZSwgbmFtZSwgaG9va0ZpbGUuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVmFsaWRhdGUgaXQncyBhbiBvYmplY3Rcblx0XHRcdFx0aWYgKCFqc29uIHx8IHR5cGVvZiBqc29uICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRmaWxlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0XHRcdFx0XHRza2lwUmVhc29uOiAncGFyc2UtZXJyb3InLFxuXHRcdFx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6ICdJbnZhbGlkIGhvb2tzIGZpbGU6IG11c3QgYmUgYSBKU09OIG9iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShob29rRmlsZSwgbmFtZSwgaG9va0ZpbGUuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSB0aGUgd29ya3NwYWNlIGZvbGRlciB0aGF0IGNvbnRhaW5zIHRoaXMgaG9vayBmaWxlIGZvciBjd2QgcmVzb2x1dGlvbixcblx0XHRcdFx0Ly8gZmFsbGluZyBiYWNrIHRvIHRoZSBmaXJzdCB3b3Jrc3BhY2UgZm9sZGVyIGZvciB1c2VyLWxldmVsIGhvb2tzIG91dHNpZGUgdGhlIHdvcmtzcGFjZVxuXHRcdFx0XHRjb25zdCBob29rV29ya3NwYWNlRm9sZGVyID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihob29rRmlsZS51cmkpID8/IGRlZmF1bHRGb2xkZXI7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVJvb3RVcmkgPSBob29rV29ya3NwYWNlRm9sZGVyPy51cmk7XG5cblx0XHRcdFx0Ly8gVXNlIGZvcm1hdC1hd2FyZSBwYXJzaW5nIHRoYXQgaGFuZGxlcyBDb3BpbG90IGFuZCBDbGF1ZGUgZm9ybWF0c1xuXHRcdFx0XHRjb25zdCB7IGZvcm1hdCwgaG9va3M6IHBhcnNlZEhvb2tzLCBkaXNhYmxlZEFsbEhvb2tzIH0gPSBwYXJzZUhvb2tzRnJvbUZpbGUoaG9va0ZpbGUudXJpLCBqc29uLCB3b3Jrc3BhY2VSb290VXJpLCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Ly8gU2tpcCBmaWxlcyB0aGF0IGhhdmUgYWxsIGhvb2tzIGRpc2FibGVkXG5cdFx0XHRcdGlmIChkaXNhYmxlZEFsbEhvb2tzKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIudHJhY2UoYFtQcm9tcHRzU2VydmljZV0gU2tpcHBpbmcgaG9vayBmaWxlIHdpdGggZGlzYWJsZUFsbEhvb2tzOiAke2hvb2tGaWxlLnVyaX1gKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZmlsZToge1xuXHRcdFx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRcdFx0c2tpcFJlYXNvbjogJ2FsbC1ob29rcy1kaXNhYmxlZCcsXG5cdFx0XHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShob29rRmlsZSwgbmFtZSwgaG9va0ZpbGUuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2tpcCBDbGF1ZGUgaG9va3Mgd2hlbiB0aGUgc2V0dGluZyBpcyBkaXNhYmxlZCAoYWZ0ZXIgcGFyc2luZyB0byBjaGVjayBmb3IgY29tbWFuZHMpXG5cdFx0XHRcdGlmIChmb3JtYXQgPT09IEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlICYmIHVzZUNsYXVkZUhvb2tzID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdGNvbnN0IGhhc0FueUNvbW1hbmRzID0gWy4uLnBhcnNlZEhvb2tzLnZhbHVlcygpXS5zb21lKCh7IGhvb2tzOiBjbWRzIH0pID0+IGNtZHMubGVuZ3RoID4gMCk7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIudHJhY2UoYFtQcm9tcHRzU2VydmljZV0gU2tpcHBpbmcgQ2xhdWRlIGhvb2sgZmlsZSAoZGlzYWJsZWQgdmlhIHNldHRpbmcpOiAke2hvb2tGaWxlLnVyaX1gKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZmlsZToge1xuXHRcdFx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRcdFx0c2tpcFJlYXNvbjogJ2NsYXVkZS1ob29rcy1kaXNhYmxlZCcsXG5cdFx0XHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShob29rRmlsZSwgbmFtZSwgaG9va0ZpbGUuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGhhc0Rpc2FibGVkQ2xhdWRlSG9va3M6IGhhc0FueUNvbW1hbmRzLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBob29rcyA9IG5ldyBNYXA8SG9va1R5cGUsIElQYXJzZWRIb29rQ29tbWFuZFtdPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtob29rVHlwZSwgeyBob29rczogY29tbWFuZHMgfV0gb2YgcGFyc2VkSG9va3MpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHMpIHtcblx0XHRcdFx0XHRcdGxldCBidWNrZXQgPSBob29rcy5nZXQoaG9va1R5cGUpO1xuXHRcdFx0XHRcdFx0aWYgKCFidWNrZXQpIHtcblx0XHRcdFx0XHRcdFx0YnVja2V0ID0gW107XG5cdFx0XHRcdFx0XHRcdGhvb2tzLnNldChob29rVHlwZSwgYnVja2V0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJ1Y2tldC5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dnZXIudHJhY2UoYFtQcm9tcHRzU2VydmljZV0gQ29sbGVjdGVkICR7aG9va1R5cGV9IGhvb2sgZnJvbSAke2hvb2tGaWxlLnVyaX0gKGZvcm1hdDogJHtmb3JtYXR9KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZmlsZTogeyBzdGF0dXM6ICdsb2FkZWQnLCBwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSB9LFxuXHRcdFx0XHRcdGhvb2tzLFxuXHRcdFx0XHRcdHNvdXJjZVVyaTogaG9va0ZpbGUudXJpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgbXNnID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRcdFx0XHR0aGlzLmxvZ2dlci53YXJuKGBbUHJvbXB0c1NlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSBob29rIGZpbGU6ICR7aG9va0ZpbGUudXJpfWAsIGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmaWxlOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRcdHNraXBSZWFzb246ICdwYXJzZS1lcnJvcicsXG5cdFx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IG1zZyxcblx0XHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShob29rRmlsZSwgbmFtZSwgaG9va0ZpbGUuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTWVyZ2UgcmVzdWx0cyBmcm9tIHBhcmFsbGVsIHByb2Nlc3Npbmdcblx0XHRjb25zdCBmaWxlczogSVByb21wdEZpbGVEaXNjb3ZlcnlSZXN1bHRbXSA9IFtdO1xuXHRcdGxldCBoYXNEaXNhYmxlZENsYXVkZUhvb2tzID0gZmFsc2U7XG5cdFx0Y29uc3QgY29sbGVjdGVkSG9va3MgPSBuZXcgTWFwPEhvb2tUeXBlLCBJUGFyc2VkSG9va0NvbW1hbmRbXT4oKTtcblxuXHRcdGZvciAoY29uc3QgeyBmaWxlLCBob29rcywgc291cmNlVXJpLCBoYXNEaXNhYmxlZENsYXVkZUhvb2tzOiBkaXNhYmxlZCB9IG9mIGZpbGVSZXN1bHRzKSB7XG5cdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRmaWxlcy5wdXNoKGZpbGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpc2FibGVkKSB7XG5cdFx0XHRcdGhhc0Rpc2FibGVkQ2xhdWRlSG9va3MgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhvb2tzICYmIHNvdXJjZVVyaSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtob29rVHlwZSwgY29tbWFuZHNdIG9mIGhvb2tzKSB7XG5cdFx0XHRcdFx0bGV0IGJ1Y2tldCA9IGNvbGxlY3RlZEhvb2tzLmdldChob29rVHlwZSk7XG5cdFx0XHRcdFx0aWYgKCFidWNrZXQpIHtcblx0XHRcdFx0XHRcdGJ1Y2tldCA9IFtdO1xuXHRcdFx0XHRcdFx0Y29sbGVjdGVkSG9va3Muc2V0KGhvb2tUeXBlLCBidWNrZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHMpIHtcblx0XHRcdFx0XHRcdGJ1Y2tldC5wdXNoKHsgLi4uY29tbWFuZCwgc291cmNlVXJpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbGxlY3QgaG9va3MgZnJvbSBhZ2VudCBwbHVnaW5zXG5cdFx0Y29uc3QgcGx1Z2lucyA9IHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCk7XG5cdFx0Y29uc3QgbWFuYWdlZEhvb2tzT25seVZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcpID09PSB0cnVlO1xuXHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zUG9saWN5VmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KENoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zKS5wb2xpY3lWYWx1ZTtcblx0XHRmb3IgKGNvbnN0IHBsdWdpbiBvZiBwbHVnaW5zKSB7XG5cdFx0XHRpZiAoIWlzQ29udHJpYnV0aW9uRW5hYmxlZChwbHVnaW4uZW5hYmxlbWVudC5nZXQoKSlcblx0XHRcdFx0fHwgKG1hbmFnZWRIb29rc09ubHlWYWx1ZSAmJiAhaXNBZ2VudFBsdWdpbkZvcmNlRW5hYmxlZEJ5UG9saWN5KHBsdWdpbiwgZW5hYmxlZFBsdWdpbnNQb2xpY3lWYWx1ZSkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBob29rIG9mIHBsdWdpbi5ob29rcy5nZXQoKSkge1xuXHRcdFx0XHRsZXQgYnVja2V0ID0gY29sbGVjdGVkSG9va3MuZ2V0KGhvb2sudHlwZSk7XG5cdFx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdFx0YnVja2V0ID0gW107XG5cdFx0XHRcdFx0Y29sbGVjdGVkSG9va3Muc2V0KGhvb2sudHlwZSwgYnVja2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgaG9vay5ob29rcykge1xuXHRcdFx0XHRcdGJ1Y2tldC5wdXNoKHsgLi4uY29tbWFuZCwgc291cmNlVXJpOiBob29rLnVyaSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3MoUHJvbXB0c1R5cGUuaG9vayk7XG5cblx0XHQvLyBDaGVjayBpZiBhbnkgaG9va3Mgd2VyZSBjb2xsZWN0ZWRcblx0XHRpZiAoY29sbGVjdGVkSG9va3Muc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2dnZXIudHJhY2UoJ1tQcm9tcHRzU2VydmljZV0gTm8gdmFsaWQgaG9va3MgY29sbGVjdGVkLicpO1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgZmlsZXMsIHNvdXJjZUZvbGRlcnMsIGhvb2tzSW5mbzogdW5kZWZpbmVkLCBkdXJhdGlvbkluTWlsbGlzOiBzdG9wV2F0Y2guZWxhcHNlZCgpIH07XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgdGhlIHJlc3VsdFxuXHRcdGNvbnN0IHJlc3VsdDogQ2hhdFJlcXVlc3RIb29rcyA9IE9iamVjdC5mcm9tRW50cmllcyhjb2xsZWN0ZWRIb29rcykgYXMgQ2hhdFJlcXVlc3RIb29rcztcblxuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbUHJvbXB0c1NlcnZpY2VdIENvbGxlY3RlZCBob29rczogJHtKU09OLnN0cmluZ2lmeShPYmplY3Qua2V5cyhyZXN1bHQpKX1gKTtcblx0XHRyZXR1cm4geyB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBmaWxlcywgc291cmNlRm9sZGVycywgaG9va3NJbmZvOiB7IGhvb2tzOiByZXN1bHQsIGhhc0Rpc2FibGVkQ2xhdWRlSG9va3MgfSwgZHVyYXRpb25Jbk1pbGxpczogc3RvcFdhdGNoLmVsYXBzZWQoKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFByZWNlZGVuY2UgdXNlZCB3aGVuIGRlZHVwbGljYXRpbmcgc2tpbGxzIHRoYXQgc2hhcmUgdGhlIHNhbWUgY2Fub25pY2FsXG5cdCAqIG5hbWU6IHdvcmtzcGFjZSA+IHBlcnNvbmFsID4gcGx1Z2luID4gZXh0ZW5zaW9uIEFQSSA+IGV4dGVuc2lvbiBjb250cmlidXRpb24uXG5cdCAqIExvd2VyIG51bWJlcnMgd2luLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRTa2lsbFByaW9yaXR5KHNraWxsOiBJUHJvbXB0UGF0aCk6IG51bWJlciB7XG5cdFx0aWYgKHNraWxsLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gMDsgLy8gd29ya3NwYWNlXG5cdFx0fVxuXHRcdGlmIChza2lsbC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKSB7XG5cdFx0XHRyZXR1cm4gMTsgLy8gcGVyc29uYWxcblx0XHR9XG5cdFx0aWYgKHNraWxsLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbikge1xuXHRcdFx0cmV0dXJuIDI7IC8vIHBsdWdpblxuXHRcdH1cblx0XHRpZiAoc2tpbGwuc291cmNlID09PSBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkFQSSkge1xuXHRcdFx0cmV0dXJuIDM7XG5cdFx0fVxuXHRcdGlmIChza2lsbC5zb3VyY2UgPT09IFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQ29udHJpYnV0aW9uKSB7XG5cdFx0XHRyZXR1cm4gNDtcblx0XHR9XG5cdFx0cmV0dXJuIDU7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgZGlzY292ZXJ5IHJlc3VsdHMgZm9yIHNraWxsIGZpbGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByb21wdEZpbGVEaXNjb3ZlcnlSZXN1bHRbXT4ge1xuXHRcdGNvbnN0IGZpbGVzOiBJUHJvbXB0RmlsZURpc2NvdmVyeVJlc3VsdFtdID0gW107XG5cdFx0Y29uc3Qgc2Vlbk5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbmFtZVRvVXJpID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblxuXHRcdC8vIENvbGxlY3QgYWxsIHNraWxscyB3aXRoIHRoZWlyIG1ldGFkYXRhIGZvciBzb3J0aW5nXG5cdFx0Y29uc3QgYWxsU2tpbGxzOiBBcnJheTxJUHJvbXB0UGF0aD4gPSBbXTtcblx0XHRjb25zdCBzdGFuZGFsb25lU2tpbGxzID0gdGhpcy5hcmVTdGFuZGFsb25lUHJvbXB0RmlsZXNCbG9ja2VkKFByb21wdHNUeXBlLnNraWxsKVxuXHRcdFx0PyBbXVxuXHRcdFx0OiBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmZpbmRBZ2VudFNraWxscyh0b2tlbik7XG5cdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKHN0YW5kYWxvbmVTa2lsbHMpLFxuXHRcdFx0dGhpcy5nZXRFeHRlbnNpb25Qcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgdG9rZW4pLFxuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKHRoaXMuX3BsdWdpblByb21wdEZpbGVzQnlUeXBlLmdldChQcm9tcHRzVHlwZS5za2lsbCkgPz8gW10pLFxuXHRcdFx0dGhpcy5nZXRCdWlsdGluUHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIHRva2VuKVxuXHRcdF0pO1xuXHRcdGZvciAoY29uc3Qgc2tpbGxMaXN0IG9mIHNraWxscykge1xuXHRcdFx0YWxsU2tpbGxzLnB1c2goLi4uc2tpbGxMaXN0KTtcblx0XHR9XG5cdFx0Ly8gU3RhYmxlIHNvcnQ7IHdlIHNob3VsZCBrZWVwIG9yZGVyIGNvbnNpc3RlbnQgdG8gdGhlIG9yZGVyIGluIHRoZSB1c2VyJ3MgY29uZmlndXJhdGlvbiBvYmplY3Rcblx0XHRhbGxTa2lsbHMuc29ydCgoYSwgYikgPT4gdGhpcy5nZXRTa2lsbFByaW9yaXR5KGEpIC0gdGhpcy5nZXRTa2lsbFByaW9yaXR5KGIpKTtcblxuXHRcdGZvciAoY29uc3Qgc2tpbGwgb2YgYWxsU2tpbGxzKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBza2lsbC51cmk7XG5cdFx0XHRjb25zdCBwcm9tcHRQYXRoID0gc2tpbGw7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZEZpbGUgPSBhd2FpdCB0aGlzLnBhcnNlTmV3KHVyaSwgdG9rZW4pO1xuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lID0gZ2V0U2tpbGxGb2xkZXJOYW1lKHVyaSk7XG5cblx0XHRcdFx0bGV0IG5hbWUgPSBwYXJzZWRGaWxlLmhlYWRlcj8ubmFtZTtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBwYXJzZWRGaWxlLmhlYWRlcj8uZGVzY3JpcHRpb247XG5cblx0XHRcdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFtjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvXSBBZ2VudCBza2lsbCBmaWxlIG1pc3NpbmcgbmFtZSBhdHRyaWJ1dGUsIHVzaW5nIGZvbGRlciBuYW1lIFwiJHtmb2xkZXJOYW1lfVwiOiAke3VyaX1gKTtcblx0XHRcdFx0XHRuYW1lID0gZm9sZGVyTmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgc2FuaXRpemVkTmFtZSA9IHRoaXMudHJ1bmNhdGVBZ2VudFNraWxsTmFtZShuYW1lLCB1cmkpO1xuXHRcdFx0XHRpZiAoc2FuaXRpemVkTmFtZSAhPT0gZm9sZGVyTmFtZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbY29tcHV0ZVNraWxsRGlzY292ZXJ5SW5mb10gQWdlbnQgc2tpbGwgbmFtZSBcIiR7c2FuaXRpemVkTmFtZX1cIiBkb2VzIG5vdCBtYXRjaCBmb2xkZXIgbmFtZSBcIiR7Zm9sZGVyTmFtZX1cIiwgdXNpbmcgZm9sZGVyIG5hbWU6ICR7dXJpfWApO1xuXHRcdFx0XHRcdHNhbml0aXplZE5hbWUgPSBmb2xkZXJOYW1lO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHNlZW5OYW1lcy5oYXMoc2FuaXRpemVkTmFtZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2NvbXB1dGVTa2lsbERpc2NvdmVyeUluZm9dIFNraXBwaW5nIGR1cGxpY2F0ZSBhZ2VudCBza2lsbCBuYW1lOiAke3Nhbml0aXplZE5hbWV9IGF0ICR7dXJpfWApO1xuXHRcdFx0XHRcdGZpbGVzLnB1c2goeyBzdGF0dXM6ICdza2lwcGVkJywgc2tpcFJlYXNvbjogJ2R1cGxpY2F0ZS1uYW1lJywgZHVwbGljYXRlT2Y6IG5hbWVUb1VyaS5nZXQoc2FuaXRpemVkTmFtZSksIHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBzYW5pdGl6ZWROYW1lLCBkZXNjcmlwdGlvbikgfSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZWVuTmFtZXMuYWRkKHNhbml0aXplZE5hbWUpO1xuXHRcdFx0XHRuYW1lVG9Vcmkuc2V0KHNhbml0aXplZE5hbWUsIHVyaSk7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVNb2RlbEludm9jYXRpb24gPSBwYXJzZWRGaWxlLmhlYWRlcj8uZGlzYWJsZU1vZGVsSW52b2NhdGlvbiA9PT0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgdXNlckludm9jYWJsZSA9IHBhcnNlZEZpbGUuaGVhZGVyPy51c2VySW52b2NhYmxlICE9PSBmYWxzZTtcblxuXHRcdFx0XHRmaWxlcy5wdXNoKHsgc3RhdHVzOiAnbG9hZGVkJywgcHJvbXB0UGF0aDogdGhpcy53aXRoUHJvbXB0UGF0aE1ldGFkYXRhKHByb21wdFBhdGgsIHNhbml0aXplZE5hbWUsIGRlc2NyaXB0aW9uKSwgZGlzYWJsZU1vZGVsSW52b2NhdGlvbiwgdXNlckludm9jYWJsZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW2NvbXB1dGVTa2lsbERpc2NvdmVyeUluZm9dIEZhaWxlZCB0byB2YWxpZGF0ZSBBZ2VudCBza2lsbCBmaWxlOiAke3VyaX1gLCBtc2cpO1xuXHRcdFx0XHRmaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRza2lwUmVhc29uOiAncGFyc2UtZXJyb3InLFxuXHRcdFx0XHRcdGVycm9yTWVzc2FnZTogbXNnLFxuXHRcdFx0XHRcdHByb21wdFBhdGgsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmaWxlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0SW5zdHJ1Y3Rpb25zRGlzY292ZXJ5SW5mbyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElJbnN0cnVjdGlvbkRpc2NvdmVyeUluZm8+IHtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdGNvbnN0IGZpbGVzOiBJSW5zdHJ1Y3Rpb25EaXNjb3ZlcnlSZXN1bHRbXSA9IFtdO1xuXG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zRmlsZXMgPSBhd2FpdCB0aGlzLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHRva2VuKTtcblx0XHRmb3IgKGNvbnN0IHByb21wdFBhdGggb2YgaW5zdHJ1Y3Rpb25zRmlsZXMpIHtcblx0XHRcdGNvbnN0IHVyaSA9IHByb21wdFBhdGgudXJpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWRQcm9tcHRGaWxlID0gYXdhaXQgdGhpcy5wYXJzZU5ldyh1cmksIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8ubmFtZSA/PyBwcm9tcHRQYXRoLm5hbWUgPz8gZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSk7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5kZXNjcmlwdGlvbiA/PyBwcm9tcHRQYXRoLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRjb25zdCBwYXR0ZXJuID0gZXZhbHVhdGVBcHBseVRvUGF0dGVybihwYXJzZWRQcm9tcHRGaWxlLmhlYWRlciwgaXNJbkNsYXVkZVJ1bGVzRm9sZGVyKHVyaSkpO1xuXHRcdFx0XHRmaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRzdGF0dXM6ICdsb2FkZWQnLFxuXHRcdFx0XHRcdHBhdHRlcm4sXG5cdFx0XHRcdFx0cHJvbXB0UGF0aDogdGhpcy53aXRoUHJvbXB0UGF0aE1ldGFkYXRhKHByb21wdFBhdGgsIG5hbWUsIGRlc2NyaXB0aW9uKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0XHRcdHNraXBSZWFzb246ICdwYXJzZS1lcnJvcicsXG5cdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSksXG5cdFx0XHRcdFx0cHJvbXB0UGF0aCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlRm9sZGVycyA9IGF3YWl0IHRoaXMuX2NvbGxlY3RTb3VyY2VGb2xkZXJEaWFnbm9zdGljcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdHJldHVybiB7IHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgZmlsZXMsIHNvdXJjZUZvbGRlcnMsIGR1cmF0aW9uSW5NaWxsaXM6IHN0b3BXYXRjaC5lbGFwc2VkKCkgfTtcblx0fVxufVxuXG4vLyBoZWxwZXJzXG5cbmNsYXNzIENhY2hlZFByb21pc2U8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBjYWNoZWRQcm9taXNlOiBQcm9taXNlPFQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhY2hlZFBvb2w6IENhbmNlbGxhdGlvblRva2VuUG9vbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFVwZGF0ZVByb21pc2VFbWl0dGVyOiBFbWl0dGVyPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY29tcHV0ZUZuOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPFQ+LCBwcml2YXRlIHJlYWRvbmx5IGdldEV2ZW50OiAoKSA9PiBFdmVudDx2b2lkPiwgcHJpdmF0ZSByZWFkb25seSBkZWxheTogbnVtYmVyID0gMCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5vbkRpZFVwZGF0ZVByb21pc2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgZGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KHRoaXMuZGVsYXkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdldEV2ZW50KCkoKCkgPT4ge1xuXHRcdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMub25EaWRVcGRhdGVQcm9taXNlRW1pdHRlci5maXJlKCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VQcm9taXNlKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5vbkRpZFVwZGF0ZVByb21pc2VFbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGdldCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0XHQvLyBJZiBhIHByZXZpb3VzIGluLWZsaWdodCBjb21wdXRhdGlvbiBoYWQgYWxsIG9mIGl0cyBjYWxsZXJzIGNhbmNlbCwgdGhlIHBvb2wnc1xuXHRcdC8vIHRva2VuIHdpbGwgaGF2ZSBmaXJlZCBhbmQgdGhlIGNvbXB1dGF0aW9uIG1heSBoYXZlIHJlamVjdGVkL2Fib3J0ZWQuIEEgbmV3XG5cdFx0Ly8gY2FsbGVyIGFycml2aW5nIGluIHRoYXQgd2luZG93IG11c3Qgbm90IGluaGVyaXQgdGhhdCBjYW5jZWxsYXRpb24sIHNvIHN0YXJ0XG5cdFx0Ly8gZnJlc2guXG5cdFx0aWYgKHRoaXMuY2FjaGVkUG9vbD8udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY2FjaGVkUG9vbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHBvb2wgPSB0aGlzLmNhY2hlZFBvb2w7XG5cdFx0aWYgKHRoaXMuY2FjaGVkUHJvbWlzZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBBZ2dyZWdhdGUgY2FsbGVycycgdG9rZW5zIHNvIHRoZSBzaGFyZWQgY29tcHV0YXRpb24gaXMgY2FuY2VsbGVkXG5cdFx0XHQvLyBvbmx5IGFmdGVyIGV2ZXJ5IGxpdmUgY2FsbGVyIGhhcyBjYW5jZWxsZWQuIEEgc2luZ2xlIGNhbGxlcidzXG5cdFx0XHQvLyBjYW5jZWxsYXRpb24gbm8gbG9uZ2VyIGFib3J0cyB0aGUgd29yayBmb3IgdGhlIG90aGVycy5cblx0XHRcdHBvb2wgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Qb29sKCk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5jb21wdXRlRm4ocG9vbC50b2tlbikuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVkUHJvbWlzZSA9PT0gcHJvbWlzZSkge1xuXHRcdFx0XHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9KTtcblx0XHRcdC8vIFRoZSBwb29sIGlzIG9ubHkgbWVhbmluZ2Z1bCB3aGlsZSB0aGUgY29tcHV0YXRpb24gaXMgaW4gZmxpZ2h0LlxuXHRcdFx0cHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVkUG9vbCA9PT0gcG9vbCkge1xuXHRcdFx0XHRcdHRoaXMuY2FjaGVkUG9vbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRwb29sIS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHByb21pc2U7XG5cdFx0XHR0aGlzLmNhY2hlZFBvb2wgPSBwb29sO1xuXHRcdH1cblx0XHRwb29sPy5hZGQodG9rZW4pO1xuXHRcdHJldHVybiByYWNlQ2FuY2VsbGF0aW9uRXJyb3IodGhpcy5jYWNoZWRQcm9taXNlLCB0b2tlbik7XG5cdH1cblxuXHRwdWJsaWMgcmVmcmVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlZFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5vbkRpZFVwZGF0ZVByb21pc2VFbWl0dGVyPy5maXJlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIE1vZGVsQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZTtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG59XG5cbmNsYXNzIE1vZGVsQ2hhbmdlVHJhY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGlzdGVuZXJzID0gbmV3IFJlc291cmNlTWFwPElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkUHJvbXB0TW9kZWxDaGFuZ2U6IEVtaXR0ZXI8TW9kZWxDaGFuZ2VFdmVudD47XG5cblx0cHVibGljIGdldCBvbkRpZFByb21wdENoYW5nZSgpOiBFdmVudDxNb2RlbENoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMub25EaWRQcm9tcHRNb2RlbENoYW5nZS5ldmVudDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5vbkRpZFByb21wdE1vZGVsQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TW9kZWxDaGFuZ2VFdmVudD4oKSk7XG5cdFx0Y29uc3Qgb25BZGQgPSAobW9kZWw6IElUZXh0TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IHByb21wdFR5cGUgPSBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHRcdGlmIChwcm9tcHRUeXBlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5saXN0ZW5lcnMuc2V0KG1vZGVsLnVyaSwgbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHRoaXMub25EaWRQcm9tcHRNb2RlbENoYW5nZS5maXJlKHsgdXJpOiBtb2RlbC51cmksIHByb21wdFR5cGUgfSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwcm9tcHRUeXBlO1xuXHRcdH07XG5cdFx0Y29uc3Qgb25SZW1vdmUgPSAobGFuZ3VhZ2VJZDogc3RyaW5nLCB1cmk6IFVSSSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbXB0VHlwZSA9IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKTtcblx0XHRcdGlmIChwcm9tcHRUeXBlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5saXN0ZW5lcnMuZ2V0KHVyaSk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5saXN0ZW5lcnMuZGVsZXRlKHVyaSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvbXB0VHlwZTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQobW9kZWwgPT4gb25BZGQobW9kZWwpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWxTZXJ2aWNlLm9uTW9kZWxMYW5ndWFnZUNoYW5nZWQoZSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdmVkUHJvbXB0VHlwZSA9IG9uUmVtb3ZlKGUub2xkTGFuZ3VhZ2VJZCwgZS5tb2RlbC51cmkpO1xuXHRcdFx0Y29uc3QgYWRkZWRQcm9tcHRUeXBlID0gb25BZGQoZS5tb2RlbCk7XG5cdFx0XHRpZiAocmVtb3ZlZFByb21wdFR5cGUgIT09IGFkZGVkUHJvbXB0VHlwZSkge1xuXHRcdFx0XHRpZiAocmVtb3ZlZFByb21wdFR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLm9uRGlkUHJvbXB0TW9kZWxDaGFuZ2UuZmlyZSh7IHVyaTogZS5tb2RlbC51cmksIHByb21wdFR5cGU6IHJlbW92ZWRQcm9tcHRUeXBlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhZGRlZFByb21wdFR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLm9uRGlkUHJvbXB0TW9kZWxDaGFuZ2UuZmlyZSh7IHVyaTogZS5tb2RlbC51cmksIHByb21wdFR5cGU6IGFkZGVkUHJvbXB0VHlwZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQobW9kZWwgPT4gb25SZW1vdmUobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBtb2RlbC51cmkpKSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5saXN0ZW5lcnMuZm9yRWFjaChsaXN0ZW5lciA9PiBsaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdHRoaXMubGlzdGVuZXJzLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDdXN0b21BZ2VudCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tUGFyc2VkUHJvbXB0RmlsZShhc3Q6IFBhcnNlZFByb21wdEZpbGUsIGV4dHJhOiB7IG5hbWU/OiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyBzb3VyY2U6IElBZ2VudFNvdXJjZTsgaG9va3M/OiBDaGF0UmVxdWVzdEhvb2tzOyBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkOyBlbmFibGVkOiBib29sZWFuIH0pOiBJQ3VzdG9tQWdlbnQge1xuXHRcdGNvbnN0IHVyaSA9IGFzdC51cmk7XG5cdFx0Y29uc3QgeyBob29rcywgc2Vzc2lvblR5cGVzLCBlbmFibGVkIH0gPSBleHRyYTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0bGV0IG1ldGFkYXRhOiBhbnkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFzdC5oZWFkZXIpIHtcblx0XHRcdGNvbnN0IGFkdmFuY2VkID0gYXN0LmhlYWRlci5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZHZhbmNlZE9wdGlvbnMpO1xuXHRcdFx0aWYgKGFkdmFuY2VkICYmIGFkdmFuY2VkLnZhbHVlLnR5cGUgPT09ICdtYXAnKSB7XG5cdFx0XHRcdG1ldGFkYXRhID0ge307XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGFkdmFuY2VkLnZhbHVlKSkge1xuXHRcdFx0XHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdFx0bWV0YWRhdGFba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCB0b29sUmVmZXJlbmNlczogSVZhcmlhYmxlUmVmZXJlbmNlW10gPSBbXTtcblx0XHRpZiAoYXN0LmJvZHkpIHtcblx0XHRcdGNvbnN0IGJvZHlPZmZzZXQgPSBhc3QuYm9keS5vZmZzZXQ7XG5cdFx0XHRjb25zdCBib2R5VmFyUmVmcyA9IGFzdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcztcblx0XHRcdGZvciAobGV0IGkgPSBib2R5VmFyUmVmcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkgeyAvLyBpbiByZXZlcnNlIG9yZGVyXG5cdFx0XHRcdGNvbnN0IHsgbmFtZSwgb2Zmc2V0LCBmdWxsTGVuZ3RoIH0gPSBib2R5VmFyUmVmc1tpXTtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2Uob2Zmc2V0IC0gYm9keU9mZnNldCwgb2Zmc2V0IC0gYm9keU9mZnNldCArIGZ1bGxMZW5ndGgpO1xuXHRcdFx0XHR0b29sUmVmZXJlbmNlcy5wdXNoKHsgbmFtZSwgcmFuZ2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWdlbnRJbnN0cnVjdGlvbnMgPSB7IGNvbnRlbnQ6IGFzdC5ib2R5Py5nZXRDb250ZW50KCkgPz8gJycsIHRvb2xSZWZlcmVuY2VzLCBtZXRhZGF0YSB9IHNhdGlzZmllcyBJQWdlbnRJbnN0cnVjdGlvbnM7XG5cblx0XHRjb25zdCBuYW1lID0gYXN0LmhlYWRlcj8ubmFtZSA/PyBleHRyYS5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZSh1cmkpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXN0LmhlYWRlcj8uZGVzY3JpcHRpb24gPz8gZXh0cmEuZGVzY3JpcHRpb247XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZ2V0VGFyZ2V0KFByb21wdHNUeXBlLmFnZW50LCBhc3QuaGVhZGVyID8/IHVyaSk7XG5cdFx0Y29uc3QgaWQgPSB1cmkudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IGV4dHJhLnNvdXJjZTtcblx0XHRpZiAoIWFzdC5oZWFkZXIpIHtcblx0XHRcdHJldHVybiB7IGlkLCB1cmksIG5hbWUsIGFnZW50SW5zdHJ1Y3Rpb25zLCBzb3VyY2UsIHRhcmdldCwgdmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LCBzZXNzaW9uVHlwZXMsIGhvb2tzLCBlbmFibGVkIH07XG5cdFx0fVxuXHRcdGNvbnN0IHZpc2liaWxpdHkgPSB7XG5cdFx0XHR1c2VySW52b2NhYmxlOiBhc3QuaGVhZGVyLnVzZXJJbnZvY2FibGUgIT09IGZhbHNlLFxuXHRcdFx0YWdlbnRJbnZvY2FibGU6IGFzdC5oZWFkZXIuaW5mZXIgIT09IHVuZGVmaW5lZCA/IGFzdC5oZWFkZXIuaW5mZXIgPT09IHRydWUgOiBhc3QuaGVhZGVyLmRpc2FibGVNb2RlbEludm9jYXRpb24gIT09IHRydWUsXG5cdFx0fSBzYXRpc2ZpZXMgSUN1c3RvbUFnZW50VmlzaWJpbGl0eTtcblxuXHRcdGxldCBtb2RlbCA9IGFzdC5oZWFkZXIubW9kZWw7XG5cdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSAmJiBtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBtYXBDbGF1ZGVNb2RlbHMobW9kZWwpO1xuXHRcdH1cblx0XHRsZXQgeyB0b29scywgaGFuZE9mZnMsIGFyZ3VtZW50SGludCwgYWdlbnRzIH0gPSBhc3QuaGVhZGVyO1xuXHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUgJiYgdG9vbHMpIHtcblx0XHRcdHRvb2xzID0gbWFwQ2xhdWRlVG9vbHModG9vbHMpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBpZCwgdXJpLCBuYW1lLCBkZXNjcmlwdGlvbiwgbW9kZWwsIHRvb2xzLCBoYW5kT2ZmcywgYXJndW1lbnRIaW50LCB0YXJnZXQsIHZpc2liaWxpdHksIGFnZW50cywgYWdlbnRJbnN0cnVjdGlvbnMsIHNvdXJjZSwgc2Vzc2lvblR5cGVzLCBob29rcywgZW5hYmxlZCB9O1xuXG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUIsNkJBQTZCO0FBQ3pELFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFxQixTQUFTLGtCQUFrQjtBQUNoRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQWtCLDJCQUEyQjtBQUN0RCxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsVUFBVSxTQUFTLFNBQVMsZ0JBQWdCO0FBQ3JELFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtB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QkFBa0I7QUFBQSxNQUM1QyxnQkFBZ0IsSUFBSSxPQUFPLFVBQVUsU0FBWSxJQUFJLE9BQU8sVUFBVSxPQUFPLElBQUksT0FBTywyQkFBMkI7QUFBQSxJQUNwSDtBQUVBLFFBQUksUUFBUSxJQUFJLE9BQU87QUFDdkIsUUFBSSxXQUFXLE9BQU8sVUFBVSxPQUFPO0FBQ3RDLGNBQVEsZ0JBQWdCLEtBQUs7QUFBQSxJQUM5QjtBQUNBLFFBQUksRUFBRSxPQUFPLFVBQVUsY0FBYyxPQUFPLElBQUksSUFBSTtBQUNwRCxRQUFJLFdBQVcsT0FBTyxVQUFVLE9BQU87QUFDdEMsY0FBUSxlQUFlLEtBQUs7QUFBQSxJQUM3QjtBQUNBLFdBQU8sRUFBRSxJQUFJLEtBQUssTUFBTSxhQUFhLE9BQU8sT0FBTyxVQUFVLGNBQWMsUUFBUSxZQUFZLFFBQVEsbUJBQW1CLFFBQVEsY0FBYyxPQUFPLFFBQVE7QUFBQSxFQUVoSztBQXRETyxFQUFBRCxhQUFTO0FBQUEsR0FEQTsiLAogICJuYW1lcyI6IFsiaG9va0ZpbGVzIiwgImZpbGVzIiwgInNvdXJjZUZvbGRlcnMiLCAiQ3VzdG9tQWdlbnQiLCAibmFtZSJdCn0K
