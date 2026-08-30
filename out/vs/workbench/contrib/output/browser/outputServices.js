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
import { Event, Emitter } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { OUTPUT_VIEW_ID, LOG_MIME, OUTPUT_MIME, Extensions, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_FILE_OUTPUT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, isSingleSourceOutputChannelDescriptor, HIDE_CATEGORY_FILTER_CONTEXT, isMultiSourceOutputChannelDescriptor } from "../../../services/output/common/output.js";
import { OutputLinkProvider } from "./outputLinkProvider.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ILogService, ILoggerService, LogLevel, LogLevelToString } from "../../../../platform/log/common/log.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { DelegatedOutputChannelModel, FileOutputChannelModel, MultiFileOutputChannelModel } from "../common/outputChannelModel.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { localize } from "../../../../nls.js";
import { joinPath } from "../../../../base/common/resources.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { telemetryLogId } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { toLocalISOString } from "../../../../base/common/date.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IDefaultLogLevelsService } from "../../../services/log/common/defaultLogLevels.js";
const OUTPUT_ACTIVE_CHANNEL_KEY = "output.activechannel";
let OutputChannel = class extends Disposable {
  constructor(outputChannelDescriptor, outputLocation, outputDirPromise, languageService, instantiationService) {
    super();
    this.outputChannelDescriptor = outputChannelDescriptor;
    this.outputLocation = outputLocation;
    this.outputDirPromise = outputDirPromise;
    this.languageService = languageService;
    this.instantiationService = instantiationService;
    this.scrollLock = false;
    this.id = outputChannelDescriptor.id;
    this.label = outputChannelDescriptor.label;
    this.uri = URI.from({ scheme: Schemas.outputChannel, path: this.id });
    this.model = this._register(this.createOutputChannelModel(this.uri, outputChannelDescriptor));
  }
  createOutputChannelModel(uri, outputChannelDescriptor) {
    const language = outputChannelDescriptor.languageId ? this.languageService.createById(outputChannelDescriptor.languageId) : this.languageService.createByMimeType(outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME);
    if (isMultiSourceOutputChannelDescriptor(outputChannelDescriptor)) {
      return this.instantiationService.createInstance(MultiFileOutputChannelModel, uri, language, [...outputChannelDescriptor.source]);
    }
    if (isSingleSourceOutputChannelDescriptor(outputChannelDescriptor)) {
      return this.instantiationService.createInstance(FileOutputChannelModel, uri, language, outputChannelDescriptor.source);
    }
    return this.instantiationService.createInstance(DelegatedOutputChannelModel, this.id, uri, language, this.outputLocation, this.outputDirPromise);
  }
  getLogEntries() {
    return this.model.getLogEntries();
  }
  append(output) {
    this.model.append(output);
  }
  update(mode, till) {
    this.model.update(mode, till, true);
  }
  clear() {
    this.model.clear();
  }
  replace(value) {
    this.model.replace(value);
  }
};
OutputChannel = __decorateClass([
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IInstantiationService)
], OutputChannel);
class OutputViewFilters extends Disposable {
  constructor(options, contextKeyService) {
    super();
    this.contextKeyService = contextKeyService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._filterText = "";
    this._includePatterns = [];
    this._excludePatterns = [];
    this._trace = SHOW_TRACE_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._trace.set(options.trace);
    this._debug = SHOW_DEBUG_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._debug.set(options.debug);
    this._info = SHOW_INFO_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._info.set(options.info);
    this._warning = SHOW_WARNING_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._warning.set(options.warning);
    this._error = SHOW_ERROR_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._error.set(options.error);
    this._categories = HIDE_CATEGORY_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._categories.set(options.sources);
    this.filterHistory = options.filterHistory;
  }
  get text() {
    return this._filterText;
  }
  set text(filterText) {
    if (this._filterText !== filterText) {
      this._filterText = filterText;
      const { includePatterns, excludePatterns } = this.parseText(filterText);
      this._includePatterns = includePatterns;
      this._excludePatterns = excludePatterns;
      this._onDidChange.fire();
    }
  }
  parseText(filterText) {
    const includePatterns = [];
    const excludePatterns = [];
    const patterns = this.splitByCommaRespectingQuotes(filterText);
    for (const pattern of patterns) {
      const trimmed = pattern.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (trimmed.startsWith("!")) {
        const negativePattern = trimmed.substring(1).trim();
        if (negativePattern.length > 0) {
          excludePatterns.push(negativePattern);
        }
      } else {
        includePatterns.push(trimmed);
      }
    }
    return { includePatterns, excludePatterns };
  }
  get includePatterns() {
    return this._includePatterns;
  }
  get excludePatterns() {
    return this._excludePatterns;
  }
  splitByCommaRespectingQuotes(text) {
    const patterns = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!inQuotes && char === '"') {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        current += char;
      } else if (!inQuotes && char === ",") {
        if (current.length > 0) {
          patterns.push(current);
        }
        current = "";
      } else {
        current += char;
      }
    }
    if (current.length > 0) {
      patterns.push(current);
    }
    return patterns;
  }
  get trace() {
    return !!this._trace.get();
  }
  set trace(trace) {
    if (this._trace.get() !== trace) {
      this._trace.set(trace);
      this._onDidChange.fire();
    }
  }
  get debug() {
    return !!this._debug.get();
  }
  set debug(debug) {
    if (this._debug.get() !== debug) {
      this._debug.set(debug);
      this._onDidChange.fire();
    }
  }
  get info() {
    return !!this._info.get();
  }
  set info(info) {
    if (this._info.get() !== info) {
      this._info.set(info);
      this._onDidChange.fire();
    }
  }
  get warning() {
    return !!this._warning.get();
  }
  set warning(warning) {
    if (this._warning.get() !== warning) {
      this._warning.set(warning);
      this._onDidChange.fire();
    }
  }
  get error() {
    return !!this._error.get();
  }
  set error(error) {
    if (this._error.get() !== error) {
      this._error.set(error);
      this._onDidChange.fire();
    }
  }
  get categories() {
    return this._categories.get() || ",";
  }
  set categories(categories) {
    this._categories.set(categories);
    this._onDidChange.fire();
  }
  toggleCategory(category) {
    const categories = this.categories;
    if (this.hasCategory(category)) {
      this.categories = categories.replace(`,${category},`, ",");
    } else {
      this.categories = `${categories}${category},`;
    }
  }
  hasCategory(category) {
    if (category === ",") {
      return false;
    }
    return this.categories.includes(`,${category},`);
  }
}
let OutputService = class extends Disposable {
  constructor(storageService, instantiationService, textModelService, logService, loggerService, lifecycleService, viewsService, contextKeyService, defaultLogLevelsService, fileDialogService, fileService, environmentService) {
    super();
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.textModelService = textModelService;
    this.logService = logService;
    this.loggerService = loggerService;
    this.lifecycleService = lifecycleService;
    this.viewsService = viewsService;
    this.defaultLogLevelsService = defaultLogLevelsService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.channels = this._register(new DisposableMap());
    this._onActiveOutputChannel = this._register(new Emitter());
    this.onActiveOutputChannel = this._onActiveOutputChannel.event;
    this.outputFolderCreationPromise = null;
    this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, "");
    this.activeOutputChannelContext = ACTIVE_OUTPUT_CHANNEL_CONTEXT.bindTo(contextKeyService);
    this.activeOutputChannelContext.set(this.activeChannelIdInStorage);
    this._register(this.onActiveOutputChannel((channel) => this.activeOutputChannelContext.set(channel)));
    this.activeFileOutputChannelContext = CONTEXT_ACTIVE_FILE_OUTPUT.bindTo(contextKeyService);
    this.activeLogOutputChannelContext = CONTEXT_ACTIVE_LOG_FILE_OUTPUT.bindTo(contextKeyService);
    this.activeOutputChannelLevelSettableContext = CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE.bindTo(contextKeyService);
    this.activeOutputChannelLevelContext = CONTEXT_ACTIVE_OUTPUT_LEVEL.bindTo(contextKeyService);
    this.activeOutputChannelLevelIsDefaultContext = CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.bindTo(contextKeyService);
    this.outputLocation = joinPath(environmentService.windowLogsPath, `output_${toLocalISOString(/* @__PURE__ */ new Date()).replace(/-|:|\.\d+Z$/g, "")}`);
    this._register(textModelService.registerTextModelContentProvider(Schemas.outputChannel, this));
    this._register(instantiationService.createInstance(OutputLinkProvider));
    const registry = Registry.as(Extensions.OutputChannels);
    for (const channelIdentifier of registry.getChannels()) {
      this.onDidRegisterChannel(channelIdentifier.id);
    }
    this._register(registry.onDidRegisterChannel((id) => this.onDidRegisterChannel(id)));
    this._register(registry.onDidUpdateChannelSources((channel) => this.onDidUpdateChannelSources(channel)));
    this._register(registry.onDidRemoveChannel((channel) => this.onDidRemoveChannel(channel)));
    if (!this.activeChannel) {
      const channels = this.getChannelDescriptors();
      this.setActiveChannel(channels && channels.length > 0 ? this.getChannel(channels[0].id) : void 0);
    }
    this._register(Event.filter(this.viewsService.onDidChangeViewVisibility, (e) => e.id === OUTPUT_VIEW_ID && e.visible)(() => {
      if (this.activeChannel) {
        this.viewsService.getActiveViewWithId(OUTPUT_VIEW_ID)?.showChannel(this.activeChannel, true);
      }
    }));
    this._register(this.loggerService.onDidChangeLogLevel(() => {
      this.setLevelContext();
      this.setLevelIsDefaultContext();
    }));
    this._register(this.defaultLogLevelsService.onDidChangeDefaultLogLevels(() => {
      this.setLevelIsDefaultContext();
    }));
    this._register(this.lifecycleService.onDidShutdown(() => this.dispose()));
    this.filters = this._register(new OutputViewFilters({
      filterHistory: [],
      trace: true,
      debug: true,
      info: true,
      warning: true,
      error: true,
      sources: ""
    }, contextKeyService));
  }
  provideTextContent(resource) {
    const channel = this.getChannel(resource.path);
    if (channel) {
      return channel.model.loadModel();
    }
    return null;
  }
  async showChannel(id, preserveFocus) {
    const channel = this.getChannel(id);
    if (this.activeChannel?.id !== channel?.id) {
      this.setActiveChannel(channel);
      this._onActiveOutputChannel.fire(id);
    }
    const outputView = await this.viewsService.openView(OUTPUT_VIEW_ID, !preserveFocus);
    if (outputView && channel) {
      outputView.showChannel(channel, !!preserveFocus);
    }
  }
  getChannel(id) {
    return this.channels.get(id);
  }
  getChannelDescriptor(id) {
    return Registry.as(Extensions.OutputChannels).getChannel(id);
  }
  getChannelDescriptors() {
    return Registry.as(Extensions.OutputChannels).getChannels();
  }
  getActiveChannel() {
    return this.activeChannel;
  }
  canSetLogLevel(channel) {
    return channel.log && channel.id !== telemetryLogId;
  }
  getLogLevel(channel) {
    if (!channel.log) {
      return void 0;
    }
    const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
    if (sources.length === 0) {
      return void 0;
    }
    const logLevel = this.loggerService.getLogLevel();
    return sources.reduce((prev, curr) => Math.min(prev, this.loggerService.getLogLevel(curr.resource) ?? logLevel), LogLevel.Error);
  }
  setLogLevel(channel, logLevel) {
    if (!channel.log) {
      return;
    }
    const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
    if (sources.length === 0) {
      return;
    }
    for (const source of sources) {
      this.loggerService.setLogLevel(source.resource, logLevel);
    }
  }
  registerCompoundLogChannel(descriptors) {
    const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
    descriptors.sort((a, b) => a.label.localeCompare(b.label));
    const id = descriptors.map((r) => r.id.toLowerCase()).join("-");
    if (!outputChannelRegistry.getChannel(id)) {
      outputChannelRegistry.registerChannel({
        id,
        label: descriptors.map((r) => r.label).join(", "),
        log: descriptors.some((r) => r.log),
        user: true,
        source: descriptors.map((descriptor) => {
          if (isSingleSourceOutputChannelDescriptor(descriptor)) {
            return [{ resource: descriptor.source.resource, name: descriptor.source.name ?? descriptor.label }];
          }
          if (isMultiSourceOutputChannelDescriptor(descriptor)) {
            return descriptor.source;
          }
          const channel = this.getChannel(descriptor.id);
          if (channel) {
            return channel.model.source;
          }
          return [];
        }).flat()
      });
    }
    return id;
  }
  async saveOutputAs(outputPath, ...channels) {
    let channel;
    if (channels.length > 1) {
      const compoundChannelId = this.registerCompoundLogChannel(channels);
      channel = this.getChannel(compoundChannelId);
    } else {
      channel = this.getChannel(channels[0].id);
    }
    if (!channel) {
      return;
    }
    try {
      let uri = outputPath;
      if (!uri) {
        const name = channels.length > 1 ? "output" : channels[0].label;
        uri = await this.fileDialogService.showSaveDialog({
          title: localize("saveLog.dialogTitle", "Save Output As"),
          availableFileSystems: [Schemas.file],
          defaultUri: joinPath(await this.fileDialogService.defaultFilePath(), `${name}.log`),
          filters: [{
            name,
            extensions: ["log"]
          }]
        });
      }
      if (!uri) {
        return;
      }
      const modelRef = await this.textModelService.createModelReference(channel.uri);
      try {
        await this.fileService.writeFile(uri, VSBuffer.fromString(modelRef.object.textEditorModel.getValue()));
      } finally {
        modelRef.dispose();
      }
      return;
    } finally {
      if (channels.length > 1) {
        Registry.as(Extensions.OutputChannels).removeChannel(channel.id);
      }
    }
  }
  async onDidRegisterChannel(channelId) {
    const channel = this.createChannel(channelId);
    this.channels.set(channelId, channel);
    if (!this.activeChannel || this.activeChannelIdInStorage === channelId) {
      this.setActiveChannel(channel);
      this._onActiveOutputChannel.fire(channelId);
      const outputView = this.viewsService.getActiveViewWithId(OUTPUT_VIEW_ID);
      outputView?.showChannel(channel, true);
    }
  }
  onDidUpdateChannelSources(channel) {
    const outputChannel = this.channels.get(channel.id);
    if (outputChannel) {
      outputChannel.model.updateChannelSources(channel.source);
    }
  }
  onDidRemoveChannel(channel) {
    if (this.activeChannel?.id === channel.id) {
      const channels = this.getChannelDescriptors();
      if (channels[0]) {
        this.showChannel(channels[0].id);
      }
    }
    this.channels.deleteAndDispose(channel.id);
  }
  createChannel(id) {
    const channel = this.instantiateChannel(id);
    this._register(Event.once(channel.model.onDispose)(() => {
      if (this.activeChannel === channel) {
        const channels = this.getChannelDescriptors();
        const channel2 = channels.length ? this.getChannel(channels[0].id) : void 0;
        if (channel2 && this.viewsService.isViewVisible(OUTPUT_VIEW_ID)) {
          this.showChannel(channel2.id);
        } else {
          this.setActiveChannel(void 0);
        }
      }
      Registry.as(Extensions.OutputChannels).removeChannel(id);
    }));
    return channel;
  }
  instantiateChannel(id) {
    const channelData = Registry.as(Extensions.OutputChannels).getChannel(id);
    if (!channelData) {
      this.logService.error(`Channel '${id}' is not registered yet`);
      throw new Error(`Channel '${id}' is not registered yet`);
    }
    if (!this.outputFolderCreationPromise) {
      this.outputFolderCreationPromise = this.fileService.createFolder(this.outputLocation).then(() => void 0);
    }
    return this.instantiationService.createInstance(OutputChannel, channelData, this.outputLocation, this.outputFolderCreationPromise);
  }
  setLevelContext() {
    const descriptor = this.activeChannel?.outputChannelDescriptor;
    const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : void 0;
    this.activeOutputChannelLevelContext.set(channelLogLevel !== void 0 ? LogLevelToString(channelLogLevel) : "");
  }
  async setLevelIsDefaultContext() {
    const descriptor = this.activeChannel?.outputChannelDescriptor;
    const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : void 0;
    if (channelLogLevel !== void 0) {
      const channelDefaultLogLevel = this.defaultLogLevelsService.getDefaultLogLevel(descriptor?.extensionId);
      this.activeOutputChannelLevelIsDefaultContext.set(channelDefaultLogLevel === channelLogLevel);
    } else {
      this.activeOutputChannelLevelIsDefaultContext.set(false);
    }
  }
  setActiveChannel(channel) {
    this.activeChannel = channel;
    const descriptor = channel?.outputChannelDescriptor;
    this.activeFileOutputChannelContext.set(!!descriptor && isSingleSourceOutputChannelDescriptor(descriptor));
    this.activeLogOutputChannelContext.set(!!descriptor?.log);
    this.activeOutputChannelLevelSettableContext.set(descriptor !== void 0 && this.canSetLogLevel(descriptor));
    this.setLevelIsDefaultContext();
    this.setLevelContext();
    if (this.activeChannel) {
      this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE);
    }
  }
};
OutputService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ILoggerService),
  __decorateParam(5, ILifecycleService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IDefaultLogLevelsService),
  __decorateParam(9, IFileDialogService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IWorkbenchEnvironmentService)
], OutputService);
export {
  OutputService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dHB1dFxcYnJvd3Nlclxcb3V0cHV0U2VydmljZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElPdXRwdXRDaGFubmVsLCBJT3V0cHV0U2VydmljZSwgT1VUUFVUX1ZJRVdfSUQsIExPR19NSU1FLCBPVVRQVVRfTUlNRSwgT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUsIElPdXRwdXRDaGFubmVsRGVzY3JpcHRvciwgRXh0ZW5zaW9ucywgSU91dHB1dENoYW5uZWxSZWdpc3RyeSwgQUNUSVZFX09VVFBVVF9DSEFOTkVMX0NPTlRFWFQsIENPTlRFWFRfQUNUSVZFX0ZJTEVfT1VUUFVULCBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUxfU0VUVEFCTEUsIENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTCwgQ09OVEVYVF9BQ1RJVkVfT1VUUFVUX0xFVkVMX0lTX0RFRkFVTFQsIElPdXRwdXRWaWV3RmlsdGVycywgU0hPV19ERUJVR19GSUxURVJfQ09OVEVYVCwgU0hPV19FUlJPUl9GSUxURVJfQ09OVEVYVCwgU0hPV19JTkZPX0ZJTFRFUl9DT05URVhULCBTSE9XX1RSQUNFX0ZJTFRFUl9DT05URVhULCBTSE9XX1dBUk5JTkdfRklMVEVSX0NPTlRFWFQsIENPTlRFWFRfQUNUSVZFX0xPR19GSUxFX09VVFBVVCwgSU11bHRpU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IsIGlzU2luZ2xlU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IsIEhJREVfQ0FURUdPUllfRklMVEVSX0NPTlRFWFQsIGlzTXVsdGlTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvciwgSUxvZ0VudHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgT3V0cHV0TGlua1Byb3ZpZGVyIH0gZnJvbSAnLi9vdXRwdXRMaW5rUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UsIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UsIExvZ0xldmVsLCBMb2dMZXZlbFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBEZWxlZ2F0ZWRPdXRwdXRDaGFubmVsTW9kZWwsIEZpbGVPdXRwdXRDaGFubmVsTW9kZWwsIElPdXRwdXRDaGFubmVsTW9kZWwsIE11bHRpRmlsZU91dHB1dENoYW5uZWxNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9vdXRwdXRDaGFubmVsTW9kZWwuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgT3V0cHV0Vmlld1BhbmUgfSBmcm9tICcuL291dHB1dFZpZXcuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHRlbGVtZXRyeUxvZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyB0b0xvY2FsSVNPU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sb2cvY29tbW9uL2RlZmF1bHRMb2dMZXZlbHMuanMnO1xuXG5jb25zdCBPVVRQVVRfQUNUSVZFX0NIQU5ORUxfS0VZID0gJ291dHB1dC5hY3RpdmVjaGFubmVsJztcblxuY2xhc3MgT3V0cHV0Q2hhbm5lbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT3V0cHV0Q2hhbm5lbCB7XG5cblx0c2Nyb2xsTG9jazogYm9vbGVhbiA9IGZhbHNlO1xuXHRyZWFkb25seSBtb2RlbDogSU91dHB1dENoYW5uZWxNb2RlbDtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgb3V0cHV0Q2hhbm5lbERlc2NyaXB0b3I6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG91dHB1dExvY2F0aW9uOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXREaXJQcm9taXNlOiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaWQgPSBvdXRwdXRDaGFubmVsRGVzY3JpcHRvci5pZDtcblx0XHR0aGlzLmxhYmVsID0gb3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IubGFiZWw7XG5cdFx0dGhpcy51cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5vdXRwdXRDaGFubmVsLCBwYXRoOiB0aGlzLmlkIH0pO1xuXHRcdHRoaXMubW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU91dHB1dENoYW5uZWxNb2RlbCh0aGlzLnVyaSwgb3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3V0cHV0Q2hhbm5lbE1vZGVsKHVyaTogVVJJLCBvdXRwdXRDaGFubmVsRGVzY3JpcHRvcjogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKTogSU91dHB1dENoYW5uZWxNb2RlbCB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBvdXRwdXRDaGFubmVsRGVzY3JpcHRvci5sYW5ndWFnZUlkID8gdGhpcy5sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChvdXRwdXRDaGFubmVsRGVzY3JpcHRvci5sYW5ndWFnZUlkKSA6IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5TWltZVR5cGUob3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IubG9nID8gTE9HX01JTUUgOiBPVVRQVVRfTUlNRSk7XG5cdFx0aWYgKGlzTXVsdGlTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihvdXRwdXRDaGFubmVsRGVzY3JpcHRvcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE11bHRpRmlsZU91dHB1dENoYW5uZWxNb2RlbCwgdXJpLCBsYW5ndWFnZSwgWy4uLm91dHB1dENoYW5uZWxEZXNjcmlwdG9yLnNvdXJjZV0pO1xuXHRcdH1cblx0XHRpZiAoaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihvdXRwdXRDaGFubmVsRGVzY3JpcHRvcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVPdXRwdXRDaGFubmVsTW9kZWwsIHVyaSwgbGFuZ3VhZ2UsIG91dHB1dENoYW5uZWxEZXNjcmlwdG9yLnNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlbGVnYXRlZE91dHB1dENoYW5uZWxNb2RlbCwgdGhpcy5pZCwgdXJpLCBsYW5ndWFnZSwgdGhpcy5vdXRwdXRMb2NhdGlvbiwgdGhpcy5vdXRwdXREaXJQcm9taXNlKTtcblx0fVxuXG5cdGdldExvZ0VudHJpZXMoKTogUmVhZG9ubHlBcnJheTxJTG9nRW50cnk+IHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMb2dFbnRyaWVzKCk7XG5cdH1cblxuXHRhcHBlbmQob3V0cHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLmFwcGVuZChvdXRwdXQpO1xuXHR9XG5cblx0dXBkYXRlKG1vZGU6IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCB0aWxsPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGUobW9kZSwgdGlsbCwgdHJ1ZSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLmNsZWFyKCk7XG5cdH1cblxuXHRyZXBsYWNlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnJlcGxhY2UodmFsdWUpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJT3V0cHV0RmlsdGVyT3B0aW9ucyB7XG5cdGZpbHRlckhpc3Rvcnk6IHN0cmluZ1tdO1xuXHR0cmFjZTogYm9vbGVhbjtcblx0ZGVidWc6IGJvb2xlYW47XG5cdGluZm86IGJvb2xlYW47XG5cdHdhcm5pbmc6IGJvb2xlYW47XG5cdGVycm9yOiBib29sZWFuO1xuXHRzb3VyY2VzOiBzdHJpbmc7XG59XG5cbmNsYXNzIE91dHB1dFZpZXdGaWx0ZXJzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPdXRwdXRWaWV3RmlsdGVycyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJT3V0cHV0RmlsdGVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3RyYWNlID0gU0hPV19UUkFDRV9GSUxURVJfQ09OVEVYVC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdHJhY2Uuc2V0KG9wdGlvbnMudHJhY2UpO1xuXG5cdFx0dGhpcy5fZGVidWcgPSBTSE9XX0RFQlVHX0ZJTFRFUl9DT05URVhULmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9kZWJ1Zy5zZXQob3B0aW9ucy5kZWJ1Zyk7XG5cblx0XHR0aGlzLl9pbmZvID0gU0hPV19JTkZPX0ZJTFRFUl9DT05URVhULmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9pbmZvLnNldChvcHRpb25zLmluZm8pO1xuXG5cdFx0dGhpcy5fd2FybmluZyA9IFNIT1dfV0FSTklOR19GSUxURVJfQ09OVEVYVC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fd2FybmluZy5zZXQob3B0aW9ucy53YXJuaW5nKTtcblxuXHRcdHRoaXMuX2Vycm9yID0gU0hPV19FUlJPUl9GSUxURVJfQ09OVEVYVC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZXJyb3Iuc2V0KG9wdGlvbnMuZXJyb3IpO1xuXG5cdFx0dGhpcy5fY2F0ZWdvcmllcyA9IEhJREVfQ0FURUdPUllfRklMVEVSX0NPTlRFWFQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NhdGVnb3JpZXMuc2V0KG9wdGlvbnMuc291cmNlcyk7XG5cblx0XHR0aGlzLmZpbHRlckhpc3RvcnkgPSBvcHRpb25zLmZpbHRlckhpc3Rvcnk7XG5cdH1cblxuXHRmaWx0ZXJIaXN0b3J5OiBzdHJpbmdbXTtcblxuXHRwcml2YXRlIF9maWx0ZXJUZXh0ID0gJyc7XG5cdHByaXZhdGUgX2luY2x1ZGVQYXR0ZXJuczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfZXhjbHVkZVBhdHRlcm5zOiBzdHJpbmdbXSA9IFtdO1xuXHRnZXQgdGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJUZXh0O1xuXHR9XG5cdHNldCB0ZXh0KGZpbHRlclRleHQ6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9maWx0ZXJUZXh0ICE9PSBmaWx0ZXJUZXh0KSB7XG5cdFx0XHR0aGlzLl9maWx0ZXJUZXh0ID0gZmlsdGVyVGV4dDtcblx0XHRcdGNvbnN0IHsgaW5jbHVkZVBhdHRlcm5zLCBleGNsdWRlUGF0dGVybnMgfSA9IHRoaXMucGFyc2VUZXh0KGZpbHRlclRleHQpO1xuXHRcdFx0dGhpcy5faW5jbHVkZVBhdHRlcm5zID0gaW5jbHVkZVBhdHRlcm5zO1xuXHRcdFx0dGhpcy5fZXhjbHVkZVBhdHRlcm5zID0gZXhjbHVkZVBhdHRlcm5zO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIHBhcnNlVGV4dChmaWx0ZXJUZXh0OiBzdHJpbmcpOiB7IGluY2x1ZGVQYXR0ZXJuczogc3RyaW5nW107IGV4Y2x1ZGVQYXR0ZXJuczogc3RyaW5nW10gfSB7XG5cdFx0Y29uc3QgaW5jbHVkZVBhdHRlcm5zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuczogc3RyaW5nW10gPSBbXTtcblxuXHRcdC8vIFBhcnNlIHBhdHRlcm5zIHJlc3BlY3RpbmcgcXVvdGVkIHN0cmluZ3Ncblx0XHRjb25zdCBwYXR0ZXJucyA9IHRoaXMuc3BsaXRCeUNvbW1hUmVzcGVjdGluZ1F1b3RlcyhmaWx0ZXJUZXh0KTtcblxuXHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdFx0Y29uc3QgdHJpbW1lZCA9IHBhdHRlcm4udHJpbSgpO1xuXHRcdFx0aWYgKHRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHJpbW1lZC5zdGFydHNXaXRoKCchJykpIHtcblx0XHRcdFx0Ly8gTmVnYXRpdmUgZmlsdGVyIC0gcmVtb3ZlIHRoZSAhIHByZWZpeFxuXHRcdFx0XHRjb25zdCBuZWdhdGl2ZVBhdHRlcm4gPSB0cmltbWVkLnN1YnN0cmluZygxKS50cmltKCk7XG5cdFx0XHRcdGlmIChuZWdhdGl2ZVBhdHRlcm4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJucy5wdXNoKG5lZ2F0aXZlUGF0dGVybik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJucy5wdXNoKHRyaW1tZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGluY2x1ZGVQYXR0ZXJucywgZXhjbHVkZVBhdHRlcm5zIH07XG5cdH1cblxuXHRnZXQgaW5jbHVkZVBhdHRlcm5zKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5faW5jbHVkZVBhdHRlcm5zO1xuXHR9XG5cblx0Z2V0IGV4Y2x1ZGVQYXR0ZXJucygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4Y2x1ZGVQYXR0ZXJucztcblx0fVxuXG5cdHByaXZhdGUgc3BsaXRCeUNvbW1hUmVzcGVjdGluZ1F1b3Rlcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcGF0dGVybnM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGN1cnJlbnQgPSAnJztcblx0XHRsZXQgaW5RdW90ZXMgPSBmYWxzZTtcblx0XHRsZXQgcXVvdGVDaGFyID0gJyc7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNoYXIgPSB0ZXh0W2ldO1xuXG5cdFx0XHRpZiAoIWluUXVvdGVzICYmIChjaGFyID09PSAnXCInKSkge1xuXHRcdFx0XHQvLyBTdGFydCBvZiBxdW90ZWQgc3RyaW5nXG5cdFx0XHRcdGluUXVvdGVzID0gdHJ1ZTtcblx0XHRcdFx0cXVvdGVDaGFyID0gY2hhcjtcblx0XHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdFx0fSBlbHNlIGlmIChpblF1b3RlcyAmJiBjaGFyID09PSBxdW90ZUNoYXIpIHtcblx0XHRcdFx0Ly8gRW5kIG9mIHF1b3RlZCBzdHJpbmdcblx0XHRcdFx0aW5RdW90ZXMgPSBmYWxzZTtcblx0XHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdFx0fSBlbHNlIGlmICghaW5RdW90ZXMgJiYgY2hhciA9PT0gJywnKSB7XG5cdFx0XHRcdC8vIENvbW1hIG91dHNpZGUgcXVvdGVzIC0gc3BsaXQgaGVyZVxuXHRcdFx0XHRpZiAoY3VycmVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cGF0dGVybnMucHVzaChjdXJyZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50ID0gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRoZSBsYXN0IHBhdHRlcm5cblx0XHRpZiAoY3VycmVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRwYXR0ZXJucy5wdXNoKGN1cnJlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXR0ZXJucztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYWNlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0Z2V0IHRyYWNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3RyYWNlLmdldCgpO1xuXHR9XG5cdHNldCB0cmFjZSh0cmFjZTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl90cmFjZS5nZXQoKSAhPT0gdHJhY2UpIHtcblx0XHRcdHRoaXMuX3RyYWNlLnNldCh0cmFjZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWc6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRnZXQgZGVidWcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fZGVidWcuZ2V0KCk7XG5cdH1cblx0c2V0IGRlYnVnKGRlYnVnOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2RlYnVnLmdldCgpICE9PSBkZWJ1Zykge1xuXHRcdFx0dGhpcy5fZGVidWcuc2V0KGRlYnVnKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmZvOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0Z2V0IGluZm8oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW5mby5nZXQoKTtcblx0fVxuXHRzZXQgaW5mbyhpbmZvOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2luZm8uZ2V0KCkgIT09IGluZm8pIHtcblx0XHRcdHRoaXMuX2luZm8uc2V0KGluZm8pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhcm5pbmc6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRnZXQgd2FybmluZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl93YXJuaW5nLmdldCgpO1xuXHR9XG5cdHNldCB3YXJuaW5nKHdhcm5pbmc6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fd2FybmluZy5nZXQoKSAhPT0gd2FybmluZykge1xuXHRcdFx0dGhpcy5fd2FybmluZy5zZXQod2FybmluZyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXJyb3I6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRnZXQgZXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fZXJyb3IuZ2V0KCk7XG5cdH1cblx0c2V0IGVycm9yKGVycm9yOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2Vycm9yLmdldCgpICE9PSBlcnJvcikge1xuXHRcdFx0dGhpcy5fZXJyb3Iuc2V0KGVycm9yKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYXRlZ29yaWVzOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRnZXQgY2F0ZWdvcmllcygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jYXRlZ29yaWVzLmdldCgpIHx8ICcsJztcblx0fVxuXHRzZXQgY2F0ZWdvcmllcyhjYXRlZ29yaWVzOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9jYXRlZ29yaWVzLnNldChjYXRlZ29yaWVzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHR0b2dnbGVDYXRlZ29yeShjYXRlZ29yeTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2F0ZWdvcmllcyA9IHRoaXMuY2F0ZWdvcmllcztcblx0XHRpZiAodGhpcy5oYXNDYXRlZ29yeShjYXRlZ29yeSkpIHtcblx0XHRcdHRoaXMuY2F0ZWdvcmllcyA9IGNhdGVnb3JpZXMucmVwbGFjZShgLCR7Y2F0ZWdvcnl9LGAsICcsJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2F0ZWdvcmllcyA9IGAke2NhdGVnb3JpZXN9JHtjYXRlZ29yeX0sYDtcblx0XHR9XG5cdH1cblxuXHRoYXNDYXRlZ29yeShjYXRlZ29yeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKGNhdGVnb3J5ID09PSAnLCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY2F0ZWdvcmllcy5pbmNsdWRlcyhgLCR7Y2F0ZWdvcnl9LGApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRwdXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPdXRwdXRTZXJ2aWNlLCBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNoYW5uZWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBPdXRwdXRDaGFubmVsPigpKTtcblx0cHJpdmF0ZSBhY3RpdmVDaGFubmVsSWRJblN0b3JhZ2U6IHN0cmluZztcblx0cHJpdmF0ZSBhY3RpdmVDaGFubmVsPzogT3V0cHV0Q2hhbm5lbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkFjdGl2ZU91dHB1dENoYW5uZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkFjdGl2ZU91dHB1dENoYW5uZWw6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkFjdGl2ZU91dHB1dENoYW5uZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVPdXRwdXRDaGFubmVsQ29udGV4dDogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVGaWxlT3V0cHV0Q2hhbm5lbENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUxvZ091dHB1dENoYW5uZWxDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVPdXRwdXRDaGFubmVsTGV2ZWxTZXR0YWJsZUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbENvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlT3V0cHV0Q2hhbm5lbExldmVsSXNEZWZhdWx0Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRMb2NhdGlvbjogVVJJO1xuXG5cdHJlYWRvbmx5IGZpbHRlcnM6IE91dHB1dFZpZXdGaWx0ZXJzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdExvZ0xldmVsc1NlcnZpY2U6IElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmFjdGl2ZUNoYW5uZWxJZEluU3RvcmFnZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KE9VVFBVVF9BQ1RJVkVfQ0hBTk5FTF9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICcnKTtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxDb250ZXh0ID0gQUNUSVZFX09VVFBVVF9DSEFOTkVMX0NPTlRFWFQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxDb250ZXh0LnNldCh0aGlzLmFjdGl2ZUNoYW5uZWxJZEluU3RvcmFnZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkFjdGl2ZU91dHB1dENoYW5uZWwoY2hhbm5lbCA9PiB0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxDb250ZXh0LnNldChjaGFubmVsKSkpO1xuXG5cdFx0dGhpcy5hY3RpdmVGaWxlT3V0cHV0Q2hhbm5lbENvbnRleHQgPSBDT05URVhUX0FDVElWRV9GSUxFX09VVFBVVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYWN0aXZlTG9nT3V0cHV0Q2hhbm5lbENvbnRleHQgPSBDT05URVhUX0FDVElWRV9MT0dfRklMRV9PVVRQVVQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbFNldHRhYmxlQ29udGV4dCA9IENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTF9TRVRUQUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYWN0aXZlT3V0cHV0Q2hhbm5lbExldmVsQ29udGV4dCA9IENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYWN0aXZlT3V0cHV0Q2hhbm5lbExldmVsSXNEZWZhdWx0Q29udGV4dCA9IENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTF9JU19ERUZBVUxULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLm91dHB1dExvY2F0aW9uID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLndpbmRvd0xvZ3NQYXRoLCBgb3V0cHV0XyR7dG9Mb2NhbElTT1N0cmluZyhuZXcgRGF0ZSgpKS5yZXBsYWNlKC8tfDp8XFwuXFxkK1okL2csICcnKX1gKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFzIHRleHQgbW9kZWwgY29udGVudCBwcm92aWRlciBmb3Igb3V0cHV0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihTY2hlbWFzLm91dHB1dENoYW5uZWwsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPdXRwdXRMaW5rUHJvdmlkZXIpKTtcblxuXHRcdC8vIENyZWF0ZSBvdXRwdXQgY2hhbm5lbHMgZm9yIGFscmVhZHkgcmVnaXN0ZXJlZCBjaGFubmVsc1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscyk7XG5cdFx0Zm9yIChjb25zdCBjaGFubmVsSWRlbnRpZmllciBvZiByZWdpc3RyeS5nZXRDaGFubmVscygpKSB7XG5cdFx0XHR0aGlzLm9uRGlkUmVnaXN0ZXJDaGFubmVsKGNoYW5uZWxJZGVudGlmaWVyLmlkKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0cnkub25EaWRSZWdpc3RlckNoYW5uZWwoaWQgPT4gdGhpcy5vbkRpZFJlZ2lzdGVyQ2hhbm5lbChpZCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RyeS5vbkRpZFVwZGF0ZUNoYW5uZWxTb3VyY2VzKGNoYW5uZWwgPT4gdGhpcy5vbkRpZFVwZGF0ZUNoYW5uZWxTb3VyY2VzKGNoYW5uZWwpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0cnkub25EaWRSZW1vdmVDaGFubmVsKGNoYW5uZWwgPT4gdGhpcy5vbkRpZFJlbW92ZUNoYW5uZWwoY2hhbm5lbCkpKTtcblxuXHRcdC8vIFNldCBhY3RpdmUgY2hhbm5lbCB0byBmaXJzdCBjaGFubmVsIGlmIG5vdCBzZXRcblx0XHRpZiAoIXRoaXMuYWN0aXZlQ2hhbm5lbCkge1xuXHRcdFx0Y29uc3QgY2hhbm5lbHMgPSB0aGlzLmdldENoYW5uZWxEZXNjcmlwdG9ycygpO1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVDaGFubmVsKGNoYW5uZWxzICYmIGNoYW5uZWxzLmxlbmd0aCA+IDAgPyB0aGlzLmdldENoYW5uZWwoY2hhbm5lbHNbMF0uaWQpIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy52aWV3c1NlcnZpY2Uub25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eSwgZSA9PiBlLmlkID09PSBPVVRQVVRfVklFV19JRCAmJiBlLnZpc2libGUpKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUNoYW5uZWwpIHtcblx0XHRcdFx0dGhpcy52aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZDxPdXRwdXRWaWV3UGFuZT4oT1VUUFVUX1ZJRVdfSUQpPy5zaG93Q2hhbm5lbCh0aGlzLmFjdGl2ZUNoYW5uZWwsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubG9nZ2VyU2VydmljZS5vbkRpZENoYW5nZUxvZ0xldmVsKCgpID0+IHtcblx0XHRcdHRoaXMuc2V0TGV2ZWxDb250ZXh0KCk7XG5cdFx0XHR0aGlzLnNldExldmVsSXNEZWZhdWx0Q29udGV4dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlRGVmYXVsdExvZ0xldmVscygoKSA9PiB7XG5cdFx0XHR0aGlzLnNldExldmVsSXNEZWZhdWx0Q29udGV4dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbkRpZFNodXRkb3duKCgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cblx0XHR0aGlzLmZpbHRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgT3V0cHV0Vmlld0ZpbHRlcnMoe1xuXHRcdFx0ZmlsdGVySGlzdG9yeTogW10sXG5cdFx0XHR0cmFjZTogdHJ1ZSxcblx0XHRcdGRlYnVnOiB0cnVlLFxuXHRcdFx0aW5mbzogdHJ1ZSxcblx0XHRcdHdhcm5pbmc6IHRydWUsXG5cdFx0XHRlcnJvcjogdHJ1ZSxcblx0XHRcdHNvdXJjZXM6ICcnLFxuXHRcdH0sIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdH1cblxuXHRwcm92aWRlVGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbD4gfCBudWxsIHtcblx0XHRjb25zdCBjaGFubmVsID0gPE91dHB1dENoYW5uZWw+dGhpcy5nZXRDaGFubmVsKHJlc291cmNlLnBhdGgpO1xuXHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRyZXR1cm4gY2hhbm5lbC5tb2RlbC5sb2FkTW9kZWwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBzaG93Q2hhbm5lbChpZDogc3RyaW5nLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmdldENoYW5uZWwoaWQpO1xuXHRcdGlmICh0aGlzLmFjdGl2ZUNoYW5uZWw/LmlkICE9PSBjaGFubmVsPy5pZCkge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVDaGFubmVsKGNoYW5uZWwpO1xuXHRcdFx0dGhpcy5fb25BY3RpdmVPdXRwdXRDaGFubmVsLmZpcmUoaWQpO1xuXHRcdH1cblx0XHRjb25zdCBvdXRwdXRWaWV3ID0gYXdhaXQgdGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXc8T3V0cHV0Vmlld1BhbmU+KE9VVFBVVF9WSUVXX0lELCAhcHJlc2VydmVGb2N1cyk7XG5cdFx0aWYgKG91dHB1dFZpZXcgJiYgY2hhbm5lbCkge1xuXHRcdFx0b3V0cHV0Vmlldy5zaG93Q2hhbm5lbChjaGFubmVsLCAhIXByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdGdldENoYW5uZWwoaWQ6IHN0cmluZyk6IE91dHB1dENoYW5uZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWxzLmdldChpZCk7XG5cdH1cblxuXHRnZXRDaGFubmVsRGVzY3JpcHRvcihpZDogc3RyaW5nKTogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gUmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscykuZ2V0Q2hhbm5lbChpZCk7XG5cdH1cblxuXHRnZXRDaGFubmVsRGVzY3JpcHRvcnMoKTogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yW10ge1xuXHRcdHJldHVybiBSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKS5nZXRDaGFubmVscygpO1xuXHR9XG5cblx0Z2V0QWN0aXZlQ2hhbm5lbCgpOiBJT3V0cHV0Q2hhbm5lbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlQ2hhbm5lbDtcblx0fVxuXG5cdGNhblNldExvZ0xldmVsKGNoYW5uZWw6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjaGFubmVsLmxvZyAmJiBjaGFubmVsLmlkICE9PSB0ZWxlbWV0cnlMb2dJZDtcblx0fVxuXG5cdGdldExvZ0xldmVsKGNoYW5uZWw6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcik6IExvZ0xldmVsIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWNoYW5uZWwubG9nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VzID0gaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsKSA/IFtjaGFubmVsLnNvdXJjZV0gOiBpc011bHRpU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IoY2hhbm5lbCkgPyBjaGFubmVsLnNvdXJjZSA6IFtdO1xuXHRcdGlmIChzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBsb2dMZXZlbCA9IHRoaXMubG9nZ2VyU2VydmljZS5nZXRMb2dMZXZlbCgpO1xuXHRcdHJldHVybiBzb3VyY2VzLnJlZHVjZSgocHJldiwgY3VycikgPT4gTWF0aC5taW4ocHJldiwgdGhpcy5sb2dnZXJTZXJ2aWNlLmdldExvZ0xldmVsKGN1cnIucmVzb3VyY2UpID8/IGxvZ0xldmVsKSwgTG9nTGV2ZWwuRXJyb3IpO1xuXHR9XG5cblx0c2V0TG9nTGV2ZWwoY2hhbm5lbDogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yLCBsb2dMZXZlbDogTG9nTGV2ZWwpOiB2b2lkIHtcblx0XHRpZiAoIWNoYW5uZWwubG9nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZXMgPSBpc1NpbmdsZVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWwpID8gW2NoYW5uZWwuc291cmNlXSA6IGlzTXVsdGlTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsKSA/IGNoYW5uZWwuc291cmNlIDogW107XG5cdFx0aWYgKHNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc291cmNlIG9mIHNvdXJjZXMpIHtcblx0XHRcdHRoaXMubG9nZ2VyU2VydmljZS5zZXRMb2dMZXZlbChzb3VyY2UucmVzb3VyY2UsIGxvZ0xldmVsKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlckNvbXBvdW5kTG9nQ2hhbm5lbChkZXNjcmlwdG9yczogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IG91dHB1dENoYW5uZWxSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpO1xuXHRcdGRlc2NyaXB0b3JzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cdFx0Y29uc3QgaWQgPSBkZXNjcmlwdG9ycy5tYXAociA9PiByLmlkLnRvTG93ZXJDYXNlKCkpLmpvaW4oJy0nKTtcblx0XHRpZiAoIW91dHB1dENoYW5uZWxSZWdpc3RyeS5nZXRDaGFubmVsKGlkKSkge1xuXHRcdFx0b3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5LnJlZ2lzdGVyQ2hhbm5lbCh7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRsYWJlbDogZGVzY3JpcHRvcnMubWFwKHIgPT4gci5sYWJlbCkuam9pbignLCAnKSxcblx0XHRcdFx0bG9nOiBkZXNjcmlwdG9ycy5zb21lKHIgPT4gci5sb2cpLFxuXHRcdFx0XHR1c2VyOiB0cnVlLFxuXHRcdFx0XHRzb3VyY2U6IGRlc2NyaXB0b3JzLm1hcChkZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0XHRpZiAoaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihkZXNjcmlwdG9yKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFt7IHJlc291cmNlOiBkZXNjcmlwdG9yLnNvdXJjZS5yZXNvdXJjZSwgbmFtZTogZGVzY3JpcHRvci5zb3VyY2UubmFtZSA/PyBkZXNjcmlwdG9yLmxhYmVsIH1dO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNNdWx0aVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKGRlc2NyaXB0b3IpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZGVzY3JpcHRvci5zb3VyY2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmdldENoYW5uZWwoZGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdFx0aWYgKGNoYW5uZWwpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjaGFubmVsLm1vZGVsLnNvdXJjZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9KS5mbGF0KCksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0YXN5bmMgc2F2ZU91dHB1dEFzKG91dHB1dFBhdGg/OiBVUkksIC4uLmNoYW5uZWxzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBjaGFubmVsOiBJT3V0cHV0Q2hhbm5lbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY2hhbm5lbHMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3QgY29tcG91bmRDaGFubmVsSWQgPSB0aGlzLnJlZ2lzdGVyQ29tcG91bmRMb2dDaGFubmVsKGNoYW5uZWxzKTtcblx0XHRcdGNoYW5uZWwgPSB0aGlzLmdldENoYW5uZWwoY29tcG91bmRDaGFubmVsSWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaGFubmVsID0gdGhpcy5nZXRDaGFubmVsKGNoYW5uZWxzWzBdLmlkKTtcblx0XHR9XG5cblx0XHRpZiAoIWNoYW5uZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0bGV0IHVyaTogVVJJIHwgdW5kZWZpbmVkID0gb3V0cHV0UGF0aDtcblx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBjaGFubmVscy5sZW5ndGggPiAxID8gJ291dHB1dCcgOiBjaGFubmVsc1swXS5sYWJlbDtcblx0XHRcdFx0dXJpID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzYXZlTG9nLmRpYWxvZ1RpdGxlJywgXCJTYXZlIE91dHB1dCBBc1wiKSxcblx0XHRcdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtczogW1NjaGVtYXMuZmlsZV0sXG5cdFx0XHRcdFx0ZGVmYXVsdFVyaTogam9pblBhdGgoYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKSwgYCR7bmFtZX0ubG9nYCksXG5cdFx0XHRcdFx0ZmlsdGVyczogW3tcblx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHRleHRlbnNpb25zOiBbJ2xvZyddXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2hhbm5lbC51cmkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmFsdWUoKSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdGlmIChjaGFubmVscy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLnJlbW92ZUNoYW5uZWwoY2hhbm5lbC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZFJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmNyZWF0ZUNoYW5uZWwoY2hhbm5lbElkKTtcblx0XHR0aGlzLmNoYW5uZWxzLnNldChjaGFubmVsSWQsIGNoYW5uZWwpO1xuXHRcdGlmICghdGhpcy5hY3RpdmVDaGFubmVsIHx8IHRoaXMuYWN0aXZlQ2hhbm5lbElkSW5TdG9yYWdlID09PSBjaGFubmVsSWQpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlQ2hhbm5lbChjaGFubmVsKTtcblx0XHRcdHRoaXMuX29uQWN0aXZlT3V0cHV0Q2hhbm5lbC5maXJlKGNoYW5uZWxJZCk7XG5cdFx0XHRjb25zdCBvdXRwdXRWaWV3ID0gdGhpcy52aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZDxPdXRwdXRWaWV3UGFuZT4oT1VUUFVUX1ZJRVdfSUQpO1xuXHRcdFx0b3V0cHV0Vmlldz8uc2hvd0NoYW5uZWwoY2hhbm5lbCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFVwZGF0ZUNoYW5uZWxTb3VyY2VzKGNoYW5uZWw6IElNdWx0aVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3V0cHV0Q2hhbm5lbCA9IHRoaXMuY2hhbm5lbHMuZ2V0KGNoYW5uZWwuaWQpO1xuXHRcdGlmIChvdXRwdXRDaGFubmVsKSB7XG5cdFx0XHRvdXRwdXRDaGFubmVsLm1vZGVsLnVwZGF0ZUNoYW5uZWxTb3VyY2VzKGNoYW5uZWwuc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUmVtb3ZlQ2hhbm5lbChjaGFubmVsOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hY3RpdmVDaGFubmVsPy5pZCA9PT0gY2hhbm5lbC5pZCkge1xuXHRcdFx0Y29uc3QgY2hhbm5lbHMgPSB0aGlzLmdldENoYW5uZWxEZXNjcmlwdG9ycygpO1xuXHRcdFx0aWYgKGNoYW5uZWxzWzBdKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0NoYW5uZWwoY2hhbm5lbHNbMF0uaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmNoYW5uZWxzLmRlbGV0ZUFuZERpc3Bvc2UoY2hhbm5lbC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNoYW5uZWwoaWQ6IHN0cmluZyk6IE91dHB1dENoYW5uZWwge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmluc3RhbnRpYXRlQ2hhbm5lbChpZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZShjaGFubmVsLm1vZGVsLm9uRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuYWN0aXZlQ2hhbm5lbCA9PT0gY2hhbm5lbCkge1xuXHRcdFx0XHRjb25zdCBjaGFubmVscyA9IHRoaXMuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCk7XG5cdFx0XHRcdGNvbnN0IGNoYW5uZWwgPSBjaGFubmVscy5sZW5ndGggPyB0aGlzLmdldENoYW5uZWwoY2hhbm5lbHNbMF0uaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY2hhbm5lbCAmJiB0aGlzLnZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKE9VVFBVVF9WSUVXX0lEKSkge1xuXHRcdFx0XHRcdHRoaXMuc2hvd0NoYW5uZWwoY2hhbm5lbC5pZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBY3RpdmVDaGFubmVsKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLnJlbW92ZUNoYW5uZWwoaWQpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBjaGFubmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBvdXRwdXRGb2xkZXJDcmVhdGlvblByb21pc2U6IFByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBpbnN0YW50aWF0ZUNoYW5uZWwoaWQ6IHN0cmluZyk6IE91dHB1dENoYW5uZWwge1xuXHRcdGNvbnN0IGNoYW5uZWxEYXRhID0gUmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscykuZ2V0Q2hhbm5lbChpZCk7XG5cdFx0aWYgKCFjaGFubmVsRGF0YSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDaGFubmVsICcke2lkfScgaXMgbm90IHJlZ2lzdGVyZWQgeWV0YCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYW5uZWwgJyR7aWR9JyBpcyBub3QgcmVnaXN0ZXJlZCB5ZXRgKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm91dHB1dEZvbGRlckNyZWF0aW9uUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5vdXRwdXRGb2xkZXJDcmVhdGlvblByb21pc2UgPSB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih0aGlzLm91dHB1dExvY2F0aW9uKS50aGVuKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dHB1dENoYW5uZWwsIGNoYW5uZWxEYXRhLCB0aGlzLm91dHB1dExvY2F0aW9uLCB0aGlzLm91dHB1dEZvbGRlckNyZWF0aW9uUHJvbWlzZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldExldmVsQ29udGV4dCgpOiB2b2lkIHtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gdGhpcy5hY3RpdmVDaGFubmVsPy5vdXRwdXRDaGFubmVsRGVzY3JpcHRvcjtcblx0XHRjb25zdCBjaGFubmVsTG9nTGV2ZWwgPSBkZXNjcmlwdG9yID8gdGhpcy5nZXRMb2dMZXZlbChkZXNjcmlwdG9yKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbENvbnRleHQuc2V0KGNoYW5uZWxMb2dMZXZlbCAhPT0gdW5kZWZpbmVkID8gTG9nTGV2ZWxUb1N0cmluZyhjaGFubmVsTG9nTGV2ZWwpIDogJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXRMZXZlbElzRGVmYXVsdENvbnRleHQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHRoaXMuYWN0aXZlQ2hhbm5lbD8ub3V0cHV0Q2hhbm5lbERlc2NyaXB0b3I7XG5cdFx0Y29uc3QgY2hhbm5lbExvZ0xldmVsID0gZGVzY3JpcHRvciA/IHRoaXMuZ2V0TG9nTGV2ZWwoZGVzY3JpcHRvcikgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNoYW5uZWxMb2dMZXZlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjaGFubmVsRGVmYXVsdExvZ0xldmVsID0gdGhpcy5kZWZhdWx0TG9nTGV2ZWxzU2VydmljZS5nZXREZWZhdWx0TG9nTGV2ZWwoZGVzY3JpcHRvcj8uZXh0ZW5zaW9uSWQpO1xuXHRcdFx0dGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsTGV2ZWxJc0RlZmF1bHRDb250ZXh0LnNldChjaGFubmVsRGVmYXVsdExvZ0xldmVsID09PSBjaGFubmVsTG9nTGV2ZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbElzRGVmYXVsdENvbnRleHQuc2V0KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEFjdGl2ZUNoYW5uZWwoY2hhbm5lbDogT3V0cHV0Q2hhbm5lbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlQ2hhbm5lbCA9IGNoYW5uZWw7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IGNoYW5uZWw/Lm91dHB1dENoYW5uZWxEZXNjcmlwdG9yO1xuXHRcdHRoaXMuYWN0aXZlRmlsZU91dHB1dENoYW5uZWxDb250ZXh0LnNldCghIWRlc2NyaXB0b3IgJiYgaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihkZXNjcmlwdG9yKSk7XG5cdFx0dGhpcy5hY3RpdmVMb2dPdXRwdXRDaGFubmVsQ29udGV4dC5zZXQoISFkZXNjcmlwdG9yPy5sb2cpO1xuXHRcdHRoaXMuYWN0aXZlT3V0cHV0Q2hhbm5lbExldmVsU2V0dGFibGVDb250ZXh0LnNldChkZXNjcmlwdG9yICE9PSB1bmRlZmluZWQgJiYgdGhpcy5jYW5TZXRMb2dMZXZlbChkZXNjcmlwdG9yKSk7XG5cdFx0dGhpcy5zZXRMZXZlbElzRGVmYXVsdENvbnRleHQoKTtcblx0XHR0aGlzLnNldExldmVsQ29udGV4dCgpO1xuXG5cdFx0aWYgKHRoaXMuYWN0aXZlQ2hhbm5lbCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShPVVRQVVRfQUNUSVZFX0NIQU5ORUxfS0VZLCB0aGlzLmFjdGl2ZUNoYW5uZWwuaWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKE9VVFBVVF9BQ1RJVkVfQ0hBTk5FTF9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWSxxQkFBcUI7QUFDMUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBeUMsZ0JBQWdCLFVBQVUsYUFBZ0UsWUFBb0MsK0JBQStCLDRCQUE0QixzQ0FBc0MsNkJBQTZCLHdDQUE0RCwyQkFBMkIsMkJBQTJCLDBCQUEwQiwyQkFBMkIsNkJBQTZCLGdDQUFxRSx1Q0FBdUMsOEJBQThCLDRDQUF1RDtBQUMxcUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBb0Q7QUFFN0QsU0FBUyxhQUFhLGdCQUFnQixVQUFVLHdCQUF3QjtBQUN4RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2Qix3QkFBNkMsbUNBQW1DO0FBQ3RILFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQXNCLDBCQUEwQjtBQUNo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QUFBQSxJQUN4RDtBQUNBLFFBQUksQ0FBQyxLQUFLLDZCQUE2QjtBQUN0QyxXQUFLLDhCQUE4QixLQUFLLFlBQVksYUFBYSxLQUFLLGNBQWMsRUFBRSxLQUFLLE1BQU0sTUFBUztBQUFBLElBQzNHO0FBQ0EsV0FBTyxLQUFLLHFCQUFxQixlQUFlLGVBQWUsYUFBYSxLQUFLLGdCQUFnQixLQUFLLDJCQUEyQjtBQUFBLEVBQ2xJO0FBQUEsRUFFUSxrQkFBd0I7QUFDL0IsVUFBTSxhQUFhLEtBQUssZUFBZTtBQUN2QyxVQUFNLGtCQUFrQixhQUFhLEtBQUssWUFBWSxVQUFVLElBQUk7QUFDcEUsU0FBSyxnQ0FBZ0MsSUFBSSxvQkFBb0IsU0FBWSxpQkFBaUIsZUFBZSxJQUFJLEVBQUU7QUFBQSxFQUNoSDtBQUFBLEVBRUEsTUFBYywyQkFBMEM7QUFDdkQsVUFBTSxhQUFhLEtBQUssZUFBZTtBQUN2QyxVQUFNLGtCQUFrQixhQUFhLEtBQUssWUFBWSxVQUFVLElBQUk7QUFDcEUsUUFBSSxvQkFBb0IsUUFBVztBQUNsQyxZQUFNLHlCQUF5QixLQUFLLHdCQUF3QixtQkFBbUIsWUFBWSxXQUFXO0FBQ3RHLFdBQUsseUNBQXlDLElBQUksMkJBQTJCLGVBQWU7QUFBQSxJQUM3RixPQUFPO0FBQ04sV0FBSyx5Q0FBeUMsSUFBSSxLQUFLO0FBQUEsSUFDeEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsU0FBMEM7QUFDbEUsU0FBSyxnQkFBZ0I7QUFDckIsVUFBTSxhQUFhLFNBQVM7QUFDNUIsU0FBSywrQkFBK0IsSUFBSSxDQUFDLENBQUMsY0FBYyxzQ0FBc0MsVUFBVSxDQUFDO0FBQ3pHLFNBQUssOEJBQThCLElBQUksQ0FBQyxDQUFDLFlBQVksR0FBRztBQUN4RCxTQUFLLHdDQUF3QyxJQUFJLGVBQWUsVUFBYSxLQUFLLGVBQWUsVUFBVSxDQUFDO0FBQzVHLFNBQUsseUJBQXlCO0FBQzlCLFNBQUssZ0JBQWdCO0FBRXJCLFFBQUksS0FBSyxlQUFlO0FBQ3ZCLFdBQUssZUFBZSxNQUFNLDJCQUEyQixLQUFLLGNBQWMsSUFBSSxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsSUFDMUgsT0FBTztBQUNOLFdBQUssZUFBZSxPQUFPLDJCQUEyQixhQUFhLFNBQVM7QUFBQSxJQUM3RTtBQUFBLEVBQ0Q7QUFDRDtBQXhVYSxnQkFBTjtBQUFBLEVBdUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxDVTsiLAogICJuYW1lcyI6IFsiY2hhbm5lbCJdCn0K
