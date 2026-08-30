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
import "../../../platform/hover/browser/hoverService.js";
import "../../../platform/undoRedo/common/undoRedoService.js";
import "../../browser/services/inlineCompletionsService.js";
import "../../common/services/languageFeatureDebounce.js";
import "../../common/services/languageFeaturesService.js";
import "../../common/services/semanticTokensStylingService.js";
import "./standaloneCodeEditorService.js";
import "./standaloneLayoutService.js";
import * as dom from "../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { renderAsPlaintext } from "../../../base/browser/markdownRenderer.js";
import { mainWindow } from "../../../base/browser/window.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter, Event, ValueWithChangeEvent } from "../../../base/common/event.js";
import { KeyCodeChord, decodeKeybinding } from "../../../base/common/keybindings.js";
import { Disposable, DisposableStore, ImmortalReference, combinedDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { OS, isLinux, isMacintosh } from "../../../base/common/platform.js";
import { basename } from "../../../base/common/resources.js";
import Severity from "../../../base/common/severity.js";
import * as strings from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { AccessibilityService } from "../../../platform/accessibility/browser/accessibilityService.js";
import { IAccessibilityService } from "../../../platform/accessibility/common/accessibility.js";
import { IAccessibilitySignalService } from "../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IMenuService } from "../../../platform/actions/common/actions.js";
import { MenuService } from "../../../platform/actions/common/menuService.js";
import { BrowserClipboardService } from "../../../platform/clipboard/browser/clipboardService.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry, ICommandService } from "../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { Configuration, ConfigurationChangeEvent, ConfigurationModel } from "../../../platform/configuration/common/configurationModels.js";
import { DefaultConfiguration } from "../../../platform/configuration/common/configurations.js";
import { ContextKeyService } from "../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { ContextMenuService } from "../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService, IContextViewService } from "../../../platform/contextview/browser/contextView.js";
import { ContextViewService } from "../../../platform/contextview/browser/contextViewService.js";
import { IDataChannelService, NullDataChannelService } from "../../../platform/dataChannel/common/dataChannel.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, getSingletonServiceDescriptors, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { IInstantiationService, createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { InstantiationService } from "../../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { AbstractKeybindingService } from "../../../platform/keybinding/common/abstractKeybindingService.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { KeybindingResolver } from "../../../platform/keybinding/common/keybindingResolver.js";
import { KeybindingsRegistry } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { ResolvedKeybindingItem } from "../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../../platform/keybinding/common/usLayoutResolvedKeybinding.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { ILayoutService } from "../../../platform/layout/browser/layoutService.js";
import { IListService, ListService } from "../../../platform/list/browser/listService.js";
import { ConsoleLogger, ILogService, ILoggerService, NullLoggerService } from "../../../platform/log/common/log.js";
import { LogService } from "../../../platform/log/common/logService.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { MarkerService } from "../../../platform/markers/common/markerService.js";
import { INotificationService, NoOpNotification, NotificationsFilter } from "../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { IEditorProgressService, IProgressService } from "../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IStorageService, InMemoryStorageService } from "../../../platform/storage/common/storage.js";
import { ITelemetryService, TelemetryLevel } from "../../../platform/telemetry/common/telemetry.js";
import { IUserInteractionService } from "../../../platform/userInteraction/browser/userInteractionService.js";
import { UserInteractionService } from "../../../platform/userInteraction/browser/userInteractionServiceImpl.js";
import { IWebWorkerService } from "../../../platform/webWorker/browser/webWorkerService.js";
import { IWorkspaceContextService, STANDALONE_EDITOR_WORKSPACE_ID, WorkbenchState, WorkspaceFolder } from "../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../platform/workspace/common/workspaceTrust.js";
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from "../../browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { OpenerService } from "../../browser/services/openerService.js";
import { IRenameSymbolTrackerService, NullRenameSymbolTrackerService } from "../../browser/services/renameSymbolTrackerService.js";
import { isDiffEditorConfigurationKey, isEditorConfigurationKey } from "../../common/config/editorConfigurationSchema.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { EditOperation } from "../../common/core/editOperation.js";
import { Position as Pos } from "../../common/core/position.js";
import { Range } from "../../common/core/range.js";
import { getEditorFeatures } from "../../common/editorFeatures.js";
import { ILanguageService } from "../../common/languages/language.js";
import { LanguageService } from "../../common/services/languageService.js";
import { IMarkerDecorationsService } from "../../common/services/markerDecorations.js";
import { MarkerDecorationsService } from "../../common/services/markerDecorationsService.js";
import { IModelService } from "../../common/services/model.js";
import { ModelService } from "../../common/services/modelService.js";
import { ITextModelService } from "../../common/services/resolverService.js";
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from "../../common/services/textResourceConfiguration.js";
import { ITreeSitterLibraryService } from "../../common/services/treeSitter/treeSitterLibraryService.js";
import { StandaloneServicesNLS } from "../../common/standaloneStrings.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { StandaloneQuickInputService } from "./quickInput/standaloneQuickInputService.js";
import { StandaloneWebWorkerService } from "./services/standaloneWebWorkerService.js";
import { StandaloneThemeService } from "./standaloneThemeService.js";
import { StandaloneTreeSitterLibraryService } from "./standaloneTreeSitterLibraryService.js";
class SimpleModel {
  constructor(model) {
    this.disposed = false;
    this.model = model;
    this._onWillDispose = new Emitter();
  }
  get onWillDispose() {
    return this._onWillDispose.event;
  }
  resolve() {
    return Promise.resolve();
  }
  get textEditorModel() {
    return this.model;
  }
  createSnapshot() {
    return this.model.createSnapshot();
  }
  isReadonly() {
    return false;
  }
  dispose() {
    this.disposed = true;
    this._onWillDispose.fire();
  }
  isDisposed() {
    return this.disposed;
  }
  isResolved() {
    return true;
  }
  getLanguageId() {
    return this.model.getLanguageId();
  }
}
let StandaloneTextModelService = class {
  constructor(modelService) {
    this.modelService = modelService;
  }
  createModelReference(resource) {
    const model = this.modelService.getModel(resource);
    if (!model) {
      return Promise.reject(new Error(`Model not found`));
    }
    return Promise.resolve(new ImmortalReference(new SimpleModel(model)));
  }
  registerTextModelContentProvider(scheme, provider) {
    return {
      dispose: function() {
      }
    };
  }
  canHandleResource(resource) {
    return false;
  }
};
StandaloneTextModelService = __decorateClass([
  __decorateParam(0, IModelService)
], StandaloneTextModelService);
const _StandaloneEditorProgressService = class _StandaloneEditorProgressService {
  show() {
    return _StandaloneEditorProgressService.NULL_PROGRESS_RUNNER;
  }
  async showWhile(promise, delay) {
    await promise;
  }
};
_StandaloneEditorProgressService.NULL_PROGRESS_RUNNER = {
  done: () => {
  },
  total: () => {
  },
  worked: () => {
  }
};
let StandaloneEditorProgressService = _StandaloneEditorProgressService;
class StandaloneProgressService {
  withProgress(_options, task, onDidCancel) {
    return task({
      report: () => {
      }
    });
  }
}
class StandaloneEnvironmentService {
  constructor() {
    this.stateResource = URI.from({ scheme: "monaco", authority: "stateResource" });
    this.userRoamingDataHome = URI.from({ scheme: "monaco", authority: "userRoamingDataHome" });
    this.keyboardLayoutResource = URI.from({ scheme: "monaco", authority: "keyboardLayoutResource" });
    this.argvResource = URI.from({ scheme: "monaco", authority: "argvResource" });
    this.untitledWorkspacesHome = URI.from({ scheme: "monaco", authority: "untitledWorkspacesHome" });
    this.workspaceStorageHome = URI.from({ scheme: "monaco", authority: "workspaceStorageHome" });
    this.appSharedDataHome = URI.from({ scheme: "monaco", authority: "appSharedDataHome" });
    this.localHistoryHome = URI.from({ scheme: "monaco", authority: "localHistoryHome" });
    this.cacheHome = URI.from({ scheme: "monaco", authority: "cacheHome" });
    this.userDataSyncHome = URI.from({ scheme: "monaco", authority: "userDataSyncHome" });
    this.sync = void 0;
    this.continueOn = void 0;
    this.editSessionId = void 0;
    this.debugExtensionHost = { port: null, break: false };
    this.isExtensionDevelopment = false;
    this.disableExtensions = false;
    this.disableExperiments = false;
    this.enableExtensions = void 0;
    this.extensionDevelopmentLocationURI = void 0;
    this.extensionDevelopmentKind = void 0;
    this.extensionTestsLocationURI = void 0;
    this.logsHome = URI.from({ scheme: "monaco", authority: "logsHome" });
    this.logLevel = void 0;
    this.extensionLogLevel = void 0;
    this.verbose = false;
    this.isBuilt = false;
    this.disableTelemetry = false;
    this.serviceMachineIdResource = URI.from({ scheme: "monaco", authority: "serviceMachineIdResource" });
    this.agentSessionsWorkspace = URI.from({ scheme: "monaco", authority: "agentSessionsWorkspace" });
    this.policyFile = void 0;
  }
}
class StandaloneDialogService {
  constructor() {
    this.onWillShowDialog = Event.None;
    this.onDidShowDialog = Event.None;
  }
  async confirm(confirmation) {
    const confirmed = this.doConfirm(confirmation.message, confirmation.detail);
    return {
      confirmed,
      checkboxChecked: false
      // unsupported
    };
  }
  doConfirm(message, detail) {
    let messageText = message;
    if (detail) {
      messageText = messageText + "\n\n" + (typeof detail === "object" ? renderAsPlaintext(detail) : detail);
    }
    return mainWindow.confirm(messageText);
  }
  async prompt(prompt) {
    let result = void 0;
    const confirmed = this.doConfirm(prompt.message, prompt.detail);
    if (confirmed) {
      const promptButtons = [...prompt.buttons ?? []];
      if (prompt.cancelButton && typeof prompt.cancelButton !== "string" && typeof prompt.cancelButton !== "boolean") {
        promptButtons.push(prompt.cancelButton);
      }
      result = await promptButtons[0]?.run({ checkboxChecked: false });
    }
    return { result };
  }
  async info(message, detail) {
    await this.prompt({ type: Severity.Info, message, detail });
  }
  async warn(message, detail) {
    await this.prompt({ type: Severity.Warning, message, detail });
  }
  async error(message, detail) {
    await this.prompt({ type: Severity.Error, message, detail });
  }
  input() {
    return Promise.resolve({ confirmed: false });
  }
  about() {
    return Promise.resolve(void 0);
  }
}
const _StandaloneNotificationService = class _StandaloneNotificationService {
  constructor() {
    this.onDidChangeFilter = Event.None;
  }
  info(message) {
    return this.notify({ severity: Severity.Info, message });
  }
  warn(message) {
    return this.notify({ severity: Severity.Warning, message });
  }
  error(error) {
    return this.notify({ severity: Severity.Error, message: error });
  }
  notify(notification) {
    switch (notification.severity) {
      case Severity.Error:
        console.error(notification.message);
        break;
      case Severity.Warning:
        console.warn(notification.message);
        break;
      default:
        console.log(notification.message);
        break;
    }
    return _StandaloneNotificationService.NO_OP;
  }
  prompt(severity, message, choices, options) {
    return _StandaloneNotificationService.NO_OP;
  }
  status(message, options) {
    return { close: () => {
    } };
  }
  setFilter(filter) {
  }
  getFilter(source) {
    return NotificationsFilter.OFF;
  }
  getFilters() {
    return [];
  }
  removeFilter(sourceId) {
  }
};
_StandaloneNotificationService.NO_OP = new NoOpNotification();
let StandaloneNotificationService = _StandaloneNotificationService;
let StandaloneCommandService = class {
  constructor(instantiationService) {
    this._onWillExecuteCommand = new Emitter();
    this._onDidExecuteCommand = new Emitter();
    this.onWillExecuteCommand = this._onWillExecuteCommand.event;
    this.onDidExecuteCommand = this._onDidExecuteCommand.event;
    this._instantiationService = instantiationService;
  }
  executeCommand(id, ...args) {
    const command = CommandsRegistry.getCommand(id);
    if (!command) {
      return Promise.reject(new Error(`command '${id}' not found`));
    }
    try {
      this._onWillExecuteCommand.fire({ commandId: id, args });
      const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]);
      this._onDidExecuteCommand.fire({ commandId: id, args });
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }
};
StandaloneCommandService = __decorateClass([
  __decorateParam(0, IInstantiationService)
], StandaloneCommandService);
let StandaloneKeybindingService = class extends AbstractKeybindingService {
  constructor(contextKeyService, commandService, telemetryService, notificationService, logService, codeEditorService) {
    super(contextKeyService, commandService, telemetryService, notificationService, logService);
    this._cachedResolver = null;
    this._dynamicKeybindings = [];
    this._domNodeListeners = [];
    const addContainer = (domNode) => {
      const disposables = new DisposableStore();
      disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e) => {
        const keyEvent = new StandardKeyboardEvent(e);
        const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
        if (shouldPreventDefault) {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
        }
      }));
      disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_UP, (e) => {
        const keyEvent = new StandardKeyboardEvent(e);
        const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
        if (shouldPreventDefault) {
          keyEvent.preventDefault();
        }
      }));
      this._domNodeListeners.push(new DomNodeListeners(domNode, disposables));
    };
    const removeContainer = (domNode) => {
      for (let i = 0; i < this._domNodeListeners.length; i++) {
        const domNodeListeners = this._domNodeListeners[i];
        if (domNodeListeners.domNode === domNode) {
          this._domNodeListeners.splice(i, 1);
          domNodeListeners.dispose();
        }
      }
    };
    const addCodeEditor = (codeEditor) => {
      if (codeEditor.getOption(EditorOption.inDiffEditor)) {
        return;
      }
      addContainer(codeEditor.getContainerDomNode());
    };
    const removeCodeEditor = (codeEditor) => {
      if (codeEditor.getOption(EditorOption.inDiffEditor)) {
        return;
      }
      removeContainer(codeEditor.getContainerDomNode());
    };
    this._register(codeEditorService.onCodeEditorAdd(addCodeEditor));
    this._register(codeEditorService.onCodeEditorRemove(removeCodeEditor));
    codeEditorService.listCodeEditors().forEach(addCodeEditor);
    const addDiffEditor = (diffEditor) => {
      addContainer(diffEditor.getContainerDomNode());
    };
    const removeDiffEditor = (diffEditor) => {
      removeContainer(diffEditor.getContainerDomNode());
    };
    this._register(codeEditorService.onDiffEditorAdd(addDiffEditor));
    this._register(codeEditorService.onDiffEditorRemove(removeDiffEditor));
    codeEditorService.listDiffEditors().forEach(addDiffEditor);
  }
  addDynamicKeybinding(command, keybinding, handler, when) {
    return combinedDisposable(
      CommandsRegistry.registerCommand(command, handler),
      this.addDynamicKeybindings([{
        keybinding,
        command,
        when
      }])
    );
  }
  addDynamicKeybindings(rules) {
    const entries = rules.map((rule) => {
      const keybinding = decodeKeybinding(rule.keybinding, OS);
      return {
        keybinding,
        command: rule.command ?? null,
        commandArgs: rule.commandArgs,
        when: rule.when,
        weight1: 1e3,
        weight2: 0,
        extensionId: null,
        isBuiltinExtension: false
      };
    });
    this._dynamicKeybindings = this._dynamicKeybindings.concat(entries);
    this.updateResolver();
    return toDisposable(() => {
      for (let i = 0; i < this._dynamicKeybindings.length; i++) {
        if (this._dynamicKeybindings[i] === entries[0]) {
          this._dynamicKeybindings.splice(i, entries.length);
          this.updateResolver();
          return;
        }
      }
    });
  }
  updateResolver() {
    this._cachedResolver = null;
    this._onDidUpdateKeybindings.fire();
  }
  _getResolver() {
    if (!this._cachedResolver) {
      const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
      const overrides = this._toNormalizedKeybindingItems(this._dynamicKeybindings, false);
      this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
    }
    return this._cachedResolver;
  }
  _documentHasFocus() {
    return mainWindow.document.hasFocus();
  }
  _toNormalizedKeybindingItems(items, isDefault) {
    const result = [];
    let resultLen = 0;
    for (const item of items) {
      const when = item.when || void 0;
      const keybinding = item.keybinding;
      if (!keybinding) {
        result[resultLen++] = new ResolvedKeybindingItem(void 0, item.command, item.commandArgs, when, isDefault, null, false);
      } else {
        const resolvedKeybindings = USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
        for (const resolvedKeybinding of resolvedKeybindings) {
          result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
        }
      }
    }
    return result;
  }
  resolveKeybinding(keybinding) {
    return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
  }
  resolveKeyboardEvent(keyboardEvent) {
    const chord = new KeyCodeChord(
      keyboardEvent.ctrlKey,
      keyboardEvent.shiftKey,
      keyboardEvent.altKey,
      keyboardEvent.metaKey,
      keyboardEvent.keyCode
    );
    return new USLayoutResolvedKeybinding([chord], OS);
  }
  resolveUserBinding(userBinding) {
    return [];
  }
  _dumpDebugInfo() {
    return "";
  }
  _dumpDebugInfoJSON() {
    return "";
  }
  registerSchemaContribution(contribution) {
    return Disposable.None;
  }
  /**
   * not yet supported
   */
  enableKeybindingHoldMode(commandId) {
    return void 0;
  }
};
StandaloneKeybindingService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ICodeEditorService)
], StandaloneKeybindingService);
class DomNodeListeners extends Disposable {
  constructor(domNode, disposables) {
    super();
    this.domNode = domNode;
    this._register(disposables);
  }
}
function isConfigurationOverrides(thing) {
  return !!thing && typeof thing === "object" && (!thing.overrideIdentifier || typeof thing.overrideIdentifier === "string") && (!thing.resource || thing.resource instanceof URI);
}
let StandaloneConfigurationService = class {
  constructor(logService) {
    this.logService = logService;
    this._onDidChangeConfiguration = new Emitter();
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    const defaultConfiguration = new DefaultConfiguration(logService);
    this._configuration = new Configuration(
      defaultConfiguration.reload(),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      logService
    );
    defaultConfiguration.dispose();
  }
  getValue(arg1, arg2) {
    const section = typeof arg1 === "string" ? arg1 : void 0;
    const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
    return this._configuration.getValue(section, overrides, void 0);
  }
  updateValues(values) {
    const previous = { data: this._configuration.toData() };
    const changedKeys = [];
    for (const entry of values) {
      const [key, value] = entry;
      if (this.getValue(key) === value) {
        continue;
      }
      this._configuration.updateValue(key, value);
      changedKeys.push(key);
    }
    if (changedKeys.length > 0) {
      const configurationChangeEvent = new ConfigurationChangeEvent({ keys: changedKeys, overrides: [] }, previous, this._configuration, void 0, this.logService);
      configurationChangeEvent.source = ConfigurationTarget.MEMORY;
      this._onDidChangeConfiguration.fire(configurationChangeEvent);
    }
    return Promise.resolve();
  }
  updateValue(key, value, arg3, arg4) {
    return this.updateValues([[key, value]]);
  }
  inspect(key, options = {}) {
    return this._configuration.inspect(key, options, void 0);
  }
  keys() {
    return this._configuration.keys(void 0);
  }
  reloadConfiguration() {
    return Promise.resolve(void 0);
  }
  getConfigurationData() {
    const emptyModel = {
      contents: {},
      keys: [],
      overrides: []
    };
    return {
      defaults: emptyModel,
      policy: emptyModel,
      application: emptyModel,
      userLocal: emptyModel,
      userRemote: emptyModel,
      workspace: emptyModel,
      folders: []
    };
  }
};
StandaloneConfigurationService = __decorateClass([
  __decorateParam(0, ILogService)
], StandaloneConfigurationService);
let StandaloneResourceConfigurationService = class extends Disposable {
  constructor(configurationService, modelService, languageService) {
    super();
    this.configurationService = configurationService;
    this.modelService = modelService;
    this.languageService = languageService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      this._onDidChangeConfiguration.fire({ affectedKeys: e.affectedKeys, affectsConfiguration: (resource, configuration) => e.affectsConfiguration(configuration) });
    }));
  }
  getValue(resource, arg2, arg3) {
    const position = Pos.isIPosition(arg2) ? arg2 : null;
    const section = position ? typeof arg3 === "string" ? arg3 : void 0 : typeof arg2 === "string" ? arg2 : void 0;
    const language = resource ? this.getLanguage(resource, position) : void 0;
    if (typeof section === "undefined") {
      return this.configurationService.getValue({
        resource,
        overrideIdentifier: language
      });
    }
    return this.configurationService.getValue(section, {
      resource,
      overrideIdentifier: language
    });
  }
  inspect(resource, position, section) {
    const language = resource ? this.getLanguage(resource, position) : void 0;
    return this.configurationService.inspect(section, { resource, overrideIdentifier: language });
  }
  getLanguage(resource, position) {
    const model = this.modelService.getModel(resource);
    if (model) {
      return position ? model.getLanguageIdAtPosition(position.lineNumber, position.column) : model.getLanguageId();
    }
    return this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
  }
  updateValue(resource, key, value, configurationTarget) {
    return this.configurationService.updateValue(key, value, { resource }, configurationTarget);
  }
};
StandaloneResourceConfigurationService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService)
], StandaloneResourceConfigurationService);
let StandaloneResourcePropertiesService = class {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return isLinux || isMacintosh ? "\n" : "\r\n";
  }
};
StandaloneResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], StandaloneResourcePropertiesService);
class StandaloneTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.NONE;
    this.sessionId = "someValue.sessionId";
    this.machineId = "someValue.machineId";
    this.sqmId = "someValue.sqmId";
    this.devDeviceId = "someValue.devDeviceId";
    this.firstSessionDate = "someValue.firstSessionDate";
    this.sendErrorTelemetry = false;
  }
  setEnabled() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
  publicLog() {
  }
  publicLog2() {
  }
  publicLogError() {
  }
  publicLogError2() {
  }
}
const _StandaloneWorkspaceContextService = class _StandaloneWorkspaceContextService {
  constructor() {
    this._onDidChangeWorkspaceName = new Emitter();
    this.onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;
    this._onWillChangeWorkspaceFolders = new Emitter();
    this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
    this._onDidChangeWorkspaceFolders = new Emitter();
    this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
    this._onDidChangeWorkbenchState = new Emitter();
    this.onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;
    const resource = URI.from({ scheme: _StandaloneWorkspaceContextService.SCHEME, authority: "model", path: "/" });
    this.workspace = { id: STANDALONE_EDITOR_WORKSPACE_ID, folders: [new WorkspaceFolder({ uri: resource, name: "", index: 0 })] };
  }
  getCompleteWorkspace() {
    return Promise.resolve(this.getWorkspace());
  }
  getWorkspace() {
    return this.workspace;
  }
  getWorkbenchState() {
    if (this.workspace) {
      if (this.workspace.configuration) {
        return WorkbenchState.WORKSPACE;
      }
      return WorkbenchState.FOLDER;
    }
    return WorkbenchState.EMPTY;
  }
  hasWorkspaceData() {
    return this.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  getWorkspaceFolder(resource) {
    return resource && resource.scheme === _StandaloneWorkspaceContextService.SCHEME ? this.workspace.folders[0] : null;
  }
  isInsideWorkspace(resource) {
    return resource && resource.scheme === _StandaloneWorkspaceContextService.SCHEME;
  }
  isCurrentWorkspace(workspaceIdOrFolder) {
    return true;
  }
};
_StandaloneWorkspaceContextService.SCHEME = "inmemory";
let StandaloneWorkspaceContextService = _StandaloneWorkspaceContextService;
function updateConfigurationService(configurationService, source, isDiffEditor) {
  if (!source) {
    return;
  }
  if (!(configurationService instanceof StandaloneConfigurationService)) {
    return;
  }
  const toUpdate = [];
  Object.keys(source).forEach((key) => {
    if (isEditorConfigurationKey(key)) {
      toUpdate.push([`editor.${key}`, source[key]]);
    }
    if (isDiffEditor && isDiffEditorConfigurationKey(key)) {
      toUpdate.push([`diffEditor.${key}`, source[key]]);
    }
  });
  if (toUpdate.length > 0) {
    configurationService.updateValues(toUpdate);
  }
}
let StandaloneBulkEditService = class {
  constructor(_modelService) {
    this._modelService = _modelService;
  }
  hasPreviewHandler() {
    return false;
  }
  setPreviewHandler() {
    return Disposable.None;
  }
  async apply(editsIn, _options) {
    const edits = Array.isArray(editsIn) ? editsIn : ResourceEdit.convert(editsIn);
    const textEdits = /* @__PURE__ */ new Map();
    for (const edit of edits) {
      if (!(edit instanceof ResourceTextEdit)) {
        throw new Error("bad edit - only text edits are supported");
      }
      const model = this._modelService.getModel(edit.resource);
      if (!model) {
        throw new Error("bad edit - model not found");
      }
      if (typeof edit.versionId === "number" && model.getVersionId() !== edit.versionId) {
        throw new Error("bad state - model changed in the meantime");
      }
      let array = textEdits.get(model);
      if (!array) {
        array = [];
        textEdits.set(model, array);
      }
      array.push(EditOperation.replaceMove(Range.lift(edit.textEdit.range), edit.textEdit.text));
    }
    let totalEdits = 0;
    let totalFiles = 0;
    for (const [model, edits2] of textEdits) {
      model.pushStackElement();
      model.pushEditOperations([], edits2, () => []);
      model.pushStackElement();
      totalFiles += 1;
      totalEdits += edits2.length;
    }
    return {
      ariaSummary: strings.format(StandaloneServicesNLS.bulkEditServiceSummary, totalEdits, totalFiles),
      isApplied: totalEdits > 0
    };
  }
};
StandaloneBulkEditService = __decorateClass([
  __decorateParam(0, IModelService)
], StandaloneBulkEditService);
class StandaloneUriLabelService {
  constructor() {
    this.onDidChangeFormatters = Event.None;
  }
  getUriLabel(resource, options) {
    if (resource.scheme === "file") {
      return resource.fsPath;
    }
    return resource.path;
  }
  getUriBasenameLabel(resource) {
    return basename(resource);
  }
  getWorkspaceLabel(workspace, options) {
    return "";
  }
  getSeparator(scheme, authority) {
    return "/";
  }
  registerFormatter(formatter) {
    throw new Error("Not implemented");
  }
  registerCachedFormatter(formatter) {
    return this.registerFormatter(formatter);
  }
  getHostLabel() {
    return "";
  }
  getHostTooltip() {
    return void 0;
  }
}
let StandaloneContextViewService = class extends ContextViewService {
  constructor(layoutService, _codeEditorService) {
    super(layoutService);
    this._codeEditorService = _codeEditorService;
  }
  showContextView(delegate, container, shadowRoot) {
    if (!container) {
      const codeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
      if (codeEditor) {
        container = codeEditor.getContainerDomNode();
      }
    }
    return super.showContextView(delegate, container, shadowRoot);
  }
};
StandaloneContextViewService = __decorateClass([
  __decorateParam(0, ILayoutService),
  __decorateParam(1, ICodeEditorService)
], StandaloneContextViewService);
class StandaloneWorkspaceTrustManagementService {
  constructor() {
    this._neverEmitter = new Emitter();
    this.onDidChangeTrust = this._neverEmitter.event;
    this.onDidChangeTrustedFolders = this._neverEmitter.event;
    this.workspaceResolved = Promise.resolve();
    this.workspaceTrustInitialized = Promise.resolve();
    this.acceptsOutOfWorkspaceFiles = true;
  }
  isWorkspaceTrusted() {
    return true;
  }
  isWorkspaceTrustForced() {
    return false;
  }
  canSetParentFolderTrust() {
    return false;
  }
  async setParentFolderTrust(trusted) {
  }
  canSetWorkspaceTrust() {
    return false;
  }
  async setWorkspaceTrust(trusted) {
  }
  getUriTrustInfo(uri) {
    throw new Error("Method not supported.");
  }
  async setUrisTrust(uri, trusted) {
  }
  getTrustedUris() {
    return [];
  }
  async setTrustedUris(uris) {
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    throw new Error("Method not supported.");
  }
}
class StandaloneLanguageService extends LanguageService {
  constructor() {
    super();
  }
}
class StandaloneLogService extends LogService {
  constructor() {
    super(new ConsoleLogger());
  }
}
let StandaloneContextMenuService = class extends ContextMenuService {
  constructor(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService) {
    super(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
    this.configure({ blockMouse: false });
  }
};
StandaloneContextMenuService = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], StandaloneContextMenuService);
class StandaloneAccessbilitySignalService {
  async playSignal(cue, options) {
  }
  async playSignals(cues) {
  }
  getEnabledState(signal, userGesture, modality) {
    return ValueWithChangeEvent.const(false);
  }
  getDelayMs(signal, modality) {
    return 0;
  }
  isSoundEnabled(cue) {
    return false;
  }
  isAnnouncementEnabled(cue) {
    return false;
  }
  onSoundEnabledChanged(cue) {
    return Event.None;
  }
  async playSound(cue, allowManyInParallel) {
  }
  playSignalLoop(cue) {
    return toDisposable(() => {
    });
  }
}
class StandaloneDefaultAccountService {
  constructor() {
    this.onDidChangeDefaultAccount = Event.None;
    this.onDidChangePolicyData = Event.None;
    this.policyData = null;
    this.currentDefaultAccount = null;
    this.copilotTokenInfo = null;
    this.onDidChangeCopilotTokenInfo = Event.None;
    this.managedSettingsFetchStatus = null;
    this.managedSettingsFetchedAt = null;
    this.managedSettingsRawResponse = null;
    this.managedSettingsCompatibilityError = null;
    this.onDidChangeManagedSettingsCompatibilityError = Event.None;
  }
  async getDefaultAccount() {
    return null;
  }
  setDefaultAccountProvider() {
  }
  async refresh() {
    return null;
  }
  getDefaultAccountAuthenticationProvider() {
    return { id: "default", name: "Default", enterprise: false };
  }
  resolveGitHubUrl(path) {
    return `https://github.com/${path}`;
  }
  async signIn() {
    return null;
  }
  async signOut() {
  }
}
registerSingleton(IWebWorkerService, StandaloneWebWorkerService, InstantiationType.Eager);
registerSingleton(ILogService, StandaloneLogService, InstantiationType.Eager);
registerSingleton(IConfigurationService, StandaloneConfigurationService, InstantiationType.Eager);
registerSingleton(ITextResourceConfigurationService, StandaloneResourceConfigurationService, InstantiationType.Eager);
registerSingleton(ITextResourcePropertiesService, StandaloneResourcePropertiesService, InstantiationType.Eager);
registerSingleton(IWorkspaceContextService, StandaloneWorkspaceContextService, InstantiationType.Eager);
registerSingleton(ILabelService, StandaloneUriLabelService, InstantiationType.Eager);
registerSingleton(ITelemetryService, StandaloneTelemetryService, InstantiationType.Eager);
registerSingleton(IDialogService, StandaloneDialogService, InstantiationType.Eager);
registerSingleton(IEnvironmentService, StandaloneEnvironmentService, InstantiationType.Eager);
registerSingleton(INotificationService, StandaloneNotificationService, InstantiationType.Eager);
registerSingleton(IMarkerService, MarkerService, InstantiationType.Eager);
registerSingleton(ILanguageService, StandaloneLanguageService, InstantiationType.Eager);
registerSingleton(IStandaloneThemeService, StandaloneThemeService, InstantiationType.Eager);
registerSingleton(IModelService, ModelService, InstantiationType.Eager);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, InstantiationType.Eager);
registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Eager);
registerSingleton(IProgressService, StandaloneProgressService, InstantiationType.Eager);
registerSingleton(IEditorProgressService, StandaloneEditorProgressService, InstantiationType.Eager);
registerSingleton(IStorageService, InMemoryStorageService, InstantiationType.Eager);
registerSingleton(IBulkEditService, StandaloneBulkEditService, InstantiationType.Eager);
registerSingleton(IWorkspaceTrustManagementService, StandaloneWorkspaceTrustManagementService, InstantiationType.Eager);
registerSingleton(ITextModelService, StandaloneTextModelService, InstantiationType.Eager);
registerSingleton(IAccessibilityService, AccessibilityService, InstantiationType.Eager);
registerSingleton(IListService, ListService, InstantiationType.Eager);
registerSingleton(ICommandService, StandaloneCommandService, InstantiationType.Eager);
registerSingleton(IKeybindingService, StandaloneKeybindingService, InstantiationType.Eager);
registerSingleton(IQuickInputService, StandaloneQuickInputService, InstantiationType.Eager);
registerSingleton(IContextViewService, StandaloneContextViewService, InstantiationType.Eager);
registerSingleton(IOpenerService, OpenerService, InstantiationType.Eager);
registerSingleton(IClipboardService, BrowserClipboardService, InstantiationType.Eager);
registerSingleton(IContextMenuService, StandaloneContextMenuService, InstantiationType.Eager);
registerSingleton(IMenuService, MenuService, InstantiationType.Eager);
registerSingleton(IAccessibilitySignalService, StandaloneAccessbilitySignalService, InstantiationType.Eager);
registerSingleton(ITreeSitterLibraryService, StandaloneTreeSitterLibraryService, InstantiationType.Eager);
registerSingleton(ILoggerService, NullLoggerService, InstantiationType.Eager);
registerSingleton(IDataChannelService, NullDataChannelService, InstantiationType.Eager);
registerSingleton(IDefaultAccountService, StandaloneDefaultAccountService, InstantiationType.Eager);
registerSingleton(IRenameSymbolTrackerService, NullRenameSymbolTrackerService, InstantiationType.Eager);
registerSingleton(IUserInteractionService, UserInteractionService, InstantiationType.Eager);
var StandaloneServices;
((StandaloneServices2) => {
  const serviceCollection = new ServiceCollection();
  for (const [id, descriptor] of getSingletonServiceDescriptors()) {
    serviceCollection.set(id, descriptor);
  }
  const instantiationService = new InstantiationService(serviceCollection, true);
  serviceCollection.set(IInstantiationService, instantiationService);
  function get(serviceId) {
    if (!initialized) {
      initialize({});
    }
    const r = serviceCollection.get(serviceId);
    if (!r) {
      throw new Error("Missing service " + serviceId);
    }
    if (r instanceof SyncDescriptor) {
      return instantiationService.invokeFunction((accessor) => accessor.get(serviceId));
    } else {
      return r;
    }
  }
  StandaloneServices2.get = get;
  let initialized = false;
  const onDidInitialize = new Emitter();
  function initialize(overrides) {
    if (initialized) {
      return instantiationService;
    }
    initialized = true;
    for (const [id, descriptor] of getSingletonServiceDescriptors()) {
      if (!serviceCollection.get(id)) {
        serviceCollection.set(id, descriptor);
      }
    }
    for (const serviceId in overrides) {
      if (overrides.hasOwnProperty(serviceId)) {
        const serviceIdentifier = createDecorator(serviceId);
        const r = serviceCollection.get(serviceIdentifier);
        if (r instanceof SyncDescriptor) {
          serviceCollection.set(serviceIdentifier, overrides[serviceId]);
        }
      }
    }
    const editorFeatures = getEditorFeatures();
    for (const feature of editorFeatures) {
      try {
        instantiationService.createInstance(feature);
      } catch (err) {
        onUnexpectedError(err);
      }
    }
    onDidInitialize.fire();
    return instantiationService;
  }
  StandaloneServices2.initialize = initialize;
  function withServices(callback) {
    if (initialized) {
      return callback();
    }
    const disposable = new DisposableStore();
    const listener = disposable.add(onDidInitialize.event(() => {
      listener.dispose();
      disposable.add(callback());
    }));
    return disposable;
  }
  StandaloneServices2.withServices = withServices;
})(StandaloneServices || (StandaloneServices = {}));
export {
  StandaloneCommandService,
  StandaloneConfigurationService,
  StandaloneKeybindingService,
  StandaloneNotificationService,
  StandaloneServices,
  updateConfigurationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXHN0YW5kYWxvbmVTZXJ2aWNlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcbmltcG9ydCAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9jb21tb24vc2VydmljZXMvc2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vc3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi9zdGFuZGFsb25lTGF5b3V0U2VydmljZS5qcyc7XG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJUG9saWN5RGF0YSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQsIFZhbHVlV2l0aENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZUNob3JkLCBLZXliaW5kaW5nLCBSZXNvbHZlZEtleWJpbmRpbmcsIGRlY29kZUtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCBJbW1vcnRhbFJlZmVyZW5jZSwgY29tYmluZWREaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgT1MsIGlzTGludXgsIGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5TW9kYWxpdHksIEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSwgU291bmQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL21lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2Jyb3dzZXIvY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZEV2ZW50LCBJQ29tbWFuZEhhbmRsZXIsIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvbkRhdGEsIElDb25maWd1cmF0aW9uTW9kZWwsIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb24sIENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgQ29uZmlndXJhdGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dE1lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld0RlbGVnYXRlLCBJQ29udGV4dFZpZXdTZXJ2aWNlLCBJT3BlbkNvbnRleHRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGF0YUNoYW5uZWxTZXJ2aWNlLCBOdWxsRGF0YUNoYW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGF0YUNoYW5uZWwvY29tbW9uL2RhdGFDaGFubmVsLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpcm1hdGlvbiwgSUNvbmZpcm1hdGlvblJlc3VsdCwgSURpYWxvZ1NlcnZpY2UsIElJbnB1dFJlc3VsdCwgSVByb21wdCwgSVByb21wdEJhc2VCdXR0b24sIElQcm9tcHRSZXN1bHQsIElQcm9tcHRSZXN1bHRXaXRoQ2FuY2VsLCBJUHJvbXB0V2l0aEN1c3RvbUNhbmNlbCwgSVByb21wdFdpdGhEZWZhdWx0Q2FuY2VsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kLCBJRW52aXJvbm1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uSG9zdERlYnVnUGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycywgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZUlkZW50aWZpZXIsIGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9hYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSwgSUtleWJvYXJkRXZlbnQsIEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nUmVzb2x2ZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdJdGVtLCBLZXliaW5kaW5nc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL3VzTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElGb3JtYXR0ZXJDaGFuZ2VFdmVudCwgSUxhYmVsU2VydmljZSwgUmVzb3VyY2VMYWJlbEZvcm1hdHRlciwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnNvbGVMb2dnZXIsIElMb2dTZXJ2aWNlLCBJTG9nZ2VyU2VydmljZSwgTnVsbExvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uLCBJTm90aWZpY2F0aW9uSGFuZGxlLCBJTm90aWZpY2F0aW9uU2VydmljZSwgSU5vdGlmaWNhdGlvblNvdXJjZSwgSU5vdGlmaWNhdGlvblNvdXJjZUZpbHRlciwgSVByb21wdENob2ljZSwgSVByb21wdE9wdGlvbnMsIElTdGF0dXNIYW5kbGUsIElTdGF0dXNNZXNzYWdlT3B0aW9ucywgTm9PcE5vdGlmaWNhdGlvbiwgTm90aWZpY2F0aW9uc0ZpbHRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzLCBJUHJvZ3Jlc3NDb21wb3NpdGVPcHRpb25zLCBJUHJvZ3Jlc3NEaWFsb2dPcHRpb25zLCBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zLCBJUHJvZ3Jlc3NPcHRpb25zLCBJUHJvZ3Jlc3NSdW5uZXIsIElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1N0ZXAsIElQcm9ncmVzc1dpbmRvd09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQsIElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50LCBJV29ya3NwYWNlSWRlbnRpZmllciwgU1RBTkRBTE9ORV9FRElUT1JfV09SS1NQQUNFX0lELCBXb3JrYmVuY2hTdGF0ZSwgV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudCwgSVdvcmtzcGFjZVRydXN0VXJpSW5mbyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdE9wdGlvbnMsIElCdWxrRWRpdFJlc3VsdCwgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VFZGl0LCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9vcGVuZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgTnVsbFJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0RpZmZFZGl0b3JDb25maWd1cmF0aW9uS2V5LCBpc0VkaXRvckNvbmZpZ3VyYXRpb25LZXkgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24sIElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIGFzIFBvcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yRmVhdHVyZXMgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRWRpdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgSVRleHRTbmFwc2hvdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbWFya2VyRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21hcmtlckRlY29yYXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0YW5kYWxvbmVTZXJ2aWNlc05MUyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGFuZGFsb25lU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi9xdWlja0lucHV0L3N0YW5kYWxvbmVRdWlja0lucHV0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lV2ViV29ya2VyU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvc3RhbmRhbG9uZVdlYldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4vc3RhbmRhbG9uZVRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi9zdGFuZGFsb25lVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcblxuY2xhc3MgU2ltcGxlTW9kZWwgaW1wbGVtZW50cyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2U6IEVtaXR0ZXI8dm9pZD47XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHR0aGlzLm1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uV2lsbERpc3Bvc2UoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIHJlc29sdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHVibGljIGdldCB0ZXh0RWRpdG9yTW9kZWwoKTogSVRleHRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QoKTogSVRleHRTbmFwc2hvdCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0fVxuXG5cdHB1YmxpYyBpc1JlYWRvbmx5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRpc3Bvc2VkO1xuXHR9XG5cblx0cHVibGljIGlzUmVzb2x2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0fVxufVxuXG5jbGFzcyBTdGFuZGFsb25lVGV4dE1vZGVsU2VydmljZSBpbXBsZW1lbnRzIElUZXh0TW9kZWxTZXJ2aWNlIHtcblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHsgfVxuXG5cdHB1YmxpYyBjcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblxuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYE1vZGVsIG5vdCBmb3VuZGApKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBJbW1vcnRhbFJlZmVyZW5jZShuZXcgU2ltcGxlTW9kZWwobW9kZWwpKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiBmdW5jdGlvbiAoKSB7IC8qIG5vIG9wICovIH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZUVkaXRvclByb2dyZXNzU2VydmljZSBpbXBsZW1lbnRzIElFZGl0b3JQcm9ncmVzc1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyBOVUxMX1BST0dSRVNTX1JVTk5FUjogSVByb2dyZXNzUnVubmVyID0ge1xuXHRcdGRvbmU6ICgpID0+IHsgfSxcblx0XHR0b3RhbDogKCkgPT4geyB9LFxuXHRcdHdvcmtlZDogKCkgPT4geyB9XG5cdH07XG5cblx0c2hvdyhpbmZpbml0ZTogdHJ1ZSwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXI7XG5cdHNob3codG90YWw6IG51bWJlciwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXI7XG5cdHNob3coKTogSVByb2dyZXNzUnVubmVyIHtcblx0XHRyZXR1cm4gU3RhbmRhbG9uZUVkaXRvclByb2dyZXNzU2VydmljZS5OVUxMX1BST0dSRVNTX1JVTk5FUjtcblx0fVxuXG5cdGFzeW5jIHNob3dXaGlsZShwcm9taXNlOiBQcm9taXNlPHVua25vd24+LCBkZWxheT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVByb2dyZXNzU2VydmljZSBpbXBsZW1lbnRzIElQcm9ncmVzc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHdpdGhQcm9ncmVzczxSPihfb3B0aW9uczogSVByb2dyZXNzT3B0aW9ucyB8IElQcm9ncmVzc0RpYWxvZ09wdGlvbnMgfCBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zIHwgSVByb2dyZXNzV2luZG93T3B0aW9ucyB8IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsIHRhc2s6IChwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KSA9PiBQcm9taXNlPFI+LCBvbkRpZENhbmNlbD86ICgoY2hvaWNlPzogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCk6IFByb21pc2U8Uj4ge1xuXHRcdHJldHVybiB0YXNrKHtcblx0XHRcdHJlcG9ydDogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVFbnZpcm9ubWVudFNlcnZpY2UgaW1wbGVtZW50cyBJRW52aXJvbm1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBzdGF0ZVJlc291cmNlOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ3N0YXRlUmVzb3VyY2UnIH0pO1xuXHRyZWFkb25seSB1c2VyUm9hbWluZ0RhdGFIb21lOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ3VzZXJSb2FtaW5nRGF0YUhvbWUnIH0pO1xuXHRyZWFkb25seSBrZXlib2FyZExheW91dFJlc291cmNlOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ2tleWJvYXJkTGF5b3V0UmVzb3VyY2UnIH0pO1xuXHRyZWFkb25seSBhcmd2UmVzb3VyY2U6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnYXJndlJlc291cmNlJyB9KTtcblx0cmVhZG9ubHkgdW50aXRsZWRXb3Jrc3BhY2VzSG9tZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICd1bnRpdGxlZFdvcmtzcGFjZXNIb21lJyB9KTtcblx0cmVhZG9ubHkgd29ya3NwYWNlU3RvcmFnZUhvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnd29ya3NwYWNlU3RvcmFnZUhvbWUnIH0pO1xuXHRyZWFkb25seSBhcHBTaGFyZWREYXRhSG9tZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICdhcHBTaGFyZWREYXRhSG9tZScgfSk7XG5cdHJlYWRvbmx5IGxvY2FsSGlzdG9yeUhvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnbG9jYWxIaXN0b3J5SG9tZScgfSk7XG5cdHJlYWRvbmx5IGNhY2hlSG9tZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICdjYWNoZUhvbWUnIH0pO1xuXHRyZWFkb25seSB1c2VyRGF0YVN5bmNIb21lOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ3VzZXJEYXRhU3luY0hvbWUnIH0pO1xuXHRyZWFkb25seSBzeW5jOiAnb24nIHwgJ29mZicgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRpbnVlT24/OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGVkaXRTZXNzaW9uSWQ/OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRlYnVnRXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3REZWJ1Z1BhcmFtcyA9IHsgcG9ydDogbnVsbCwgYnJlYWs6IGZhbHNlIH07XG5cdHJlYWRvbmx5IGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgZGlzYWJsZUV4dGVuc2lvbnM6IGJvb2xlYW4gfCBzdHJpbmdbXSA9IGZhbHNlO1xuXHRyZWFkb25seSBkaXNhYmxlRXhwZXJpbWVudHM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgZW5hYmxlRXh0ZW5zaW9ucz86IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSBleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJPzogVVJJW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbkRldmVsb3BtZW50S2luZD86IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSST86IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9nc0hvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnbG9nc0hvbWUnIH0pO1xuXHRyZWFkb25seSBsb2dMZXZlbD86IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uTG9nTGV2ZWw/OiBbc3RyaW5nLCBzdHJpbmddW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHZlcmJvc2U6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgaXNCdWlsdDogYm9vbGVhbiA9IGZhbHNlO1xuXHRyZWFkb25seSBkaXNhYmxlVGVsZW1ldHJ5OiBib29sZWFuID0gZmFsc2U7XG5cdHJlYWRvbmx5IHNlcnZpY2VNYWNoaW5lSWRSZXNvdXJjZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICdzZXJ2aWNlTWFjaGluZUlkUmVzb3VyY2UnIH0pO1xuXHRyZWFkb25seSBhZ2VudFNlc3Npb25zV29ya3NwYWNlOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ2FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UnIH0pO1xuXHRyZWFkb25seSBwb2xpY3lGaWxlPzogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBTdGFuZGFsb25lRGlhbG9nU2VydmljZSBpbXBsZW1lbnRzIElEaWFsb2dTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25XaWxsU2hvd0RpYWxvZyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU2hvd0RpYWxvZyA9IEV2ZW50Lk5vbmU7XG5cblx0YXN5bmMgY29uZmlybShjb25maXJtYXRpb246IElDb25maXJtYXRpb24pOiBQcm9taXNlPElDb25maXJtYXRpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBjb25maXJtZWQgPSB0aGlzLmRvQ29uZmlybShjb25maXJtYXRpb24ubWVzc2FnZSwgY29uZmlybWF0aW9uLmRldGFpbCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlybWVkLFxuXHRcdFx0Y2hlY2tib3hDaGVja2VkOiBmYWxzZSAvLyB1bnN1cHBvcnRlZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGRvQ29uZmlybShtZXNzYWdlOiBzdHJpbmcsIGRldGFpbD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGxldCBtZXNzYWdlVGV4dCA9IG1lc3NhZ2U7XG5cdFx0aWYgKGRldGFpbCkge1xuXHRcdFx0bWVzc2FnZVRleHQgPSBtZXNzYWdlVGV4dCArICdcXG5cXG4nICsgKHR5cGVvZiBkZXRhaWwgPT09ICdvYmplY3QnID8gcmVuZGVyQXNQbGFpbnRleHQoZGV0YWlsKSA6IGRldGFpbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1haW5XaW5kb3cuY29uZmlybShtZXNzYWdlVGV4dCk7XG5cdH1cblxuXHRwcm9tcHQ8VD4ocHJvbXB0OiBJUHJvbXB0V2l0aEN1c3RvbUNhbmNlbDxUPik6IFByb21pc2U8SVByb21wdFJlc3VsdFdpdGhDYW5jZWw8VD4+O1xuXHRwcm9tcHQ8VD4ocHJvbXB0OiBJUHJvbXB0PFQ+KTogUHJvbWlzZTxJUHJvbXB0UmVzdWx0PFQ+Pjtcblx0cHJvbXB0PFQ+KHByb21wdDogSVByb21wdFdpdGhEZWZhdWx0Q2FuY2VsPFQ+KTogUHJvbWlzZTxJUHJvbXB0UmVzdWx0PFQ+Pjtcblx0YXN5bmMgcHJvbXB0PFQ+KHByb21wdDogSVByb21wdDxUPiB8IElQcm9tcHRXaXRoQ3VzdG9tQ2FuY2VsPFQ+KTogUHJvbWlzZTxJUHJvbXB0UmVzdWx0PFQ+IHwgSVByb21wdFJlc3VsdFdpdGhDYW5jZWw8VD4+IHtcblx0XHRsZXQgcmVzdWx0OiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IHRoaXMuZG9Db25maXJtKHByb21wdC5tZXNzYWdlLCBwcm9tcHQuZGV0YWlsKTtcblx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRjb25zdCBwcm9tcHRCdXR0b25zOiBJUHJvbXB0QmFzZUJ1dHRvbjxUPltdID0gWy4uLihwcm9tcHQuYnV0dG9ucyA/PyBbXSldO1xuXHRcdFx0aWYgKHByb21wdC5jYW5jZWxCdXR0b24gJiYgdHlwZW9mIHByb21wdC5jYW5jZWxCdXR0b24gIT09ICdzdHJpbmcnICYmIHR5cGVvZiBwcm9tcHQuY2FuY2VsQnV0dG9uICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0cHJvbXB0QnV0dG9ucy5wdXNoKHByb21wdC5jYW5jZWxCdXR0b24pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQgPSBhd2FpdCBwcm9tcHRCdXR0b25zWzBdPy5ydW4oeyBjaGVja2JveENoZWNrZWQ6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHJlc3VsdCB9O1xuXHR9XG5cblx0YXN5bmMgaW5mbyhtZXNzYWdlOiBzdHJpbmcsIGRldGFpbD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucHJvbXB0KHsgdHlwZTogU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgZGV0YWlsIH0pO1xuXHR9XG5cblx0YXN5bmMgd2FybihtZXNzYWdlOiBzdHJpbmcsIGRldGFpbD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucHJvbXB0KHsgdHlwZTogU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZSwgZGV0YWlsIH0pO1xuXHR9XG5cblx0YXN5bmMgZXJyb3IobWVzc2FnZTogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnByb21wdCh7IHR5cGU6IFNldmVyaXR5LkVycm9yLCBtZXNzYWdlLCBkZXRhaWwgfSk7XG5cdH1cblxuXHRpbnB1dCgpOiBQcm9taXNlPElJbnB1dFJlc3VsdD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBjb25maXJtZWQ6IGZhbHNlIH0pOyAvLyB1bnN1cHBvcnRlZFxuXHR9XG5cblx0YWJvdXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFuZGFsb25lTm90aWZpY2F0aW9uU2VydmljZSBpbXBsZW1lbnRzIElOb3RpZmljYXRpb25TZXJ2aWNlIHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbHRlcjogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTk9fT1A6IElOb3RpZmljYXRpb25IYW5kbGUgPSBuZXcgTm9PcE5vdGlmaWNhdGlvbigpO1xuXG5cdHB1YmxpYyBpbmZvKG1lc3NhZ2U6IHN0cmluZyk6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHJldHVybiB0aGlzLm5vdGlmeSh7IHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLCBtZXNzYWdlIH0pO1xuXHR9XG5cblx0cHVibGljIHdhcm4obWVzc2FnZTogc3RyaW5nKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0cmV0dXJuIHRoaXMubm90aWZ5KHsgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2UgfSk7XG5cdH1cblxuXHRwdWJsaWMgZXJyb3IoZXJyb3I6IHN0cmluZyB8IEVycm9yKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0cmV0dXJuIHRoaXMubm90aWZ5KHsgc2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBlcnJvciB9KTtcblx0fVxuXG5cdHB1YmxpYyBub3RpZnkobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0c3dpdGNoIChub3RpZmljYXRpb24uc2V2ZXJpdHkpIHtcblx0XHRcdGNhc2UgU2V2ZXJpdHkuRXJyb3I6XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3Iobm90aWZpY2F0aW9uLm1lc3NhZ2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU2V2ZXJpdHkuV2FybmluZzpcblx0XHRcdFx0Y29uc29sZS53YXJuKG5vdGlmaWNhdGlvbi5tZXNzYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRjb25zb2xlLmxvZyhub3RpZmljYXRpb24ubWVzc2FnZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBTdGFuZGFsb25lTm90aWZpY2F0aW9uU2VydmljZS5OT19PUDtcblx0fVxuXG5cdHB1YmxpYyBwcm9tcHQoc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIGNob2ljZXM6IElQcm9tcHRDaG9pY2VbXSwgb3B0aW9ucz86IElQcm9tcHRPcHRpb25zKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0cmV0dXJuIFN0YW5kYWxvbmVOb3RpZmljYXRpb25TZXJ2aWNlLk5PX09QO1xuXHR9XG5cblx0cHVibGljIHN0YXR1cyhtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgb3B0aW9ucz86IElTdGF0dXNNZXNzYWdlT3B0aW9ucyk6IElTdGF0dXNIYW5kbGUge1xuXHRcdHJldHVybiB7IGNsb3NlOiAoKSA9PiB7IH0gfTtcblx0fVxuXG5cdHB1YmxpYyBzZXRGaWx0ZXIoZmlsdGVyOiBOb3RpZmljYXRpb25zRmlsdGVyIHwgSU5vdGlmaWNhdGlvblNvdXJjZUZpbHRlcik6IHZvaWQgeyB9XG5cblx0cHVibGljIGdldEZpbHRlcihzb3VyY2U/OiBJTm90aWZpY2F0aW9uU291cmNlKTogTm90aWZpY2F0aW9uc0ZpbHRlciB7XG5cdFx0cmV0dXJuIE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGO1xuXHR9XG5cblx0cHVibGljIGdldEZpbHRlcnMoKTogSU5vdGlmaWNhdGlvblNvdXJjZUZpbHRlcltdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlRmlsdGVyKHNvdXJjZUlkOiBzdHJpbmcpOiB2b2lkIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgU3RhbmRhbG9uZUNvbW1hbmRTZXJ2aWNlIGltcGxlbWVudHMgSUNvbW1hbmRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxFeGVjdXRlQ29tbWFuZCA9IG5ldyBFbWl0dGVyPElDb21tYW5kRXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXhlY3V0ZUNvbW1hbmQgPSBuZXcgRW1pdHRlcjxJQ29tbWFuZEV2ZW50PigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50PElDb21tYW5kRXZlbnQ+ID0gdGhpcy5fb25XaWxsRXhlY3V0ZUNvbW1hbmQuZXZlbnQ7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudDxJQ29tbWFuZEV2ZW50PiA9IHRoaXMuX29uRGlkRXhlY3V0ZUNvbW1hbmQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdH1cblxuXHRwdWJsaWMgZXhlY3V0ZUNvbW1hbmQ8VD4oaWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChpZCk7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBjb21tYW5kICcke2lkfScgbm90IGZvdW5kYCkpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vbldpbGxFeGVjdXRlQ29tbWFuZC5maXJlKHsgY29tbWFuZElkOiBpZCwgYXJncyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uLmFwcGx5KHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCBbY29tbWFuZC5oYW5kbGVyLCAuLi5hcmdzXSkgYXMgVDtcblxuXHRcdFx0dGhpcy5fb25EaWRFeGVjdXRlQ29tbWFuZC5maXJlKHsgY29tbWFuZElkOiBpZCwgYXJncyB9KTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElLZXliaW5kaW5nUnVsZSB7XG5cdGtleWJpbmRpbmc6IG51bWJlcjtcblx0Y29tbWFuZD86IHN0cmluZyB8IG51bGw7XG5cdGNvbW1hbmRBcmdzPzogdW5rbm93bjtcblx0d2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZSBleHRlbmRzIEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2Uge1xuXHRwcml2YXRlIF9jYWNoZWRSZXNvbHZlcjogS2V5YmluZGluZ1Jlc29sdmVyIHwgbnVsbDtcblx0cHJpdmF0ZSBfZHluYW1pY0tleWJpbmRpbmdzOiBJS2V5YmluZGluZ0l0ZW1bXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZUxpc3RlbmVyczogRG9tTm9kZUxpc3RlbmVyc1tdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHRLZXlTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLl9jYWNoZWRSZXNvbHZlciA9IG51bGw7XG5cdFx0dGhpcy5fZHluYW1pY0tleWJpbmRpbmdzID0gW107XG5cdFx0dGhpcy5fZG9tTm9kZUxpc3RlbmVycyA9IFtdO1xuXG5cdFx0Y29uc3QgYWRkQ29udGFpbmVyID0gKGRvbU5vZGU6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Ly8gZm9yIHN0YW5kYXJkIGtleWJpbmRpbmdzXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkb21Ob2RlLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXlFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGNvbnN0IHNob3VsZFByZXZlbnREZWZhdWx0ID0gdGhpcy5fZGlzcGF0Y2goa2V5RXZlbnQsIGtleUV2ZW50LnRhcmdldCk7XG5cdFx0XHRcdGlmIChzaG91bGRQcmV2ZW50RGVmYXVsdCkge1xuXHRcdFx0XHRcdGtleUV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0a2V5RXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gZm9yIHNpbmdsZSBtb2RpZmllciBjaG9yZCBrZXliaW5kaW5ncyAoZS5nLiBzaGlmdCBzaGlmdClcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvbU5vZGUsIGRvbS5FdmVudFR5cGUuS0VZX1VQLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXlFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGNvbnN0IHNob3VsZFByZXZlbnREZWZhdWx0ID0gdGhpcy5fc2luZ2xlTW9kaWZpZXJEaXNwYXRjaChrZXlFdmVudCwga2V5RXZlbnQudGFyZ2V0KTtcblx0XHRcdFx0aWYgKHNob3VsZFByZXZlbnREZWZhdWx0KSB7XG5cdFx0XHRcdFx0a2V5RXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlTGlzdGVuZXJzLnB1c2gobmV3IERvbU5vZGVMaXN0ZW5lcnMoZG9tTm9kZSwgZGlzcG9zYWJsZXMpKTtcblx0XHR9O1xuXHRcdGNvbnN0IHJlbW92ZUNvbnRhaW5lciA9IChkb21Ob2RlOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9kb21Ob2RlTGlzdGVuZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGRvbU5vZGVMaXN0ZW5lcnMgPSB0aGlzLl9kb21Ob2RlTGlzdGVuZXJzW2ldO1xuXHRcdFx0XHRpZiAoZG9tTm9kZUxpc3RlbmVycy5kb21Ob2RlID09PSBkb21Ob2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5fZG9tTm9kZUxpc3RlbmVycy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0ZG9tTm9kZUxpc3RlbmVycy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYWRkQ29kZUVkaXRvciA9IChjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcikgPT4ge1xuXHRcdFx0aWYgKGNvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbkRpZmZFZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGFkZENvbnRhaW5lcihjb2RlRWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSk7XG5cdFx0fTtcblx0XHRjb25zdCByZW1vdmVDb2RlRWRpdG9yID0gKGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yKSA9PiB7XG5cdFx0XHRpZiAoY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVtb3ZlQ29udGFpbmVyKGNvZGVFZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3JTZXJ2aWNlLm9uQ29kZUVkaXRvckFkZChhZGRDb2RlRWRpdG9yKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2Uub25Db2RlRWRpdG9yUmVtb3ZlKHJlbW92ZUNvZGVFZGl0b3IpKTtcblx0XHRjb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKS5mb3JFYWNoKGFkZENvZGVFZGl0b3IpO1xuXG5cdFx0Y29uc3QgYWRkRGlmZkVkaXRvciA9IChkaWZmRWRpdG9yOiBJRGlmZkVkaXRvcikgPT4ge1xuXHRcdFx0YWRkQ29udGFpbmVyKGRpZmZFZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKTtcblx0XHR9O1xuXHRcdGNvbnN0IHJlbW92ZURpZmZFZGl0b3IgPSAoZGlmZkVkaXRvcjogSURpZmZFZGl0b3IpID0+IHtcblx0XHRcdHJlbW92ZUNvbnRhaW5lcihkaWZmRWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5vbkRpZmZFZGl0b3JBZGQoYWRkRGlmZkVkaXRvcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3JTZXJ2aWNlLm9uRGlmZkVkaXRvclJlbW92ZShyZW1vdmVEaWZmRWRpdG9yKSk7XG5cdFx0Y29kZUVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKCkuZm9yRWFjaChhZGREaWZmRWRpdG9yKTtcblx0fVxuXG5cdHB1YmxpYyBhZGREeW5hbWljS2V5YmluZGluZyhjb21tYW5kOiBzdHJpbmcsIGtleWJpbmRpbmc6IG51bWJlciwgaGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyLCB3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoY29tbWFuZCwgaGFuZGxlciksXG5cdFx0XHR0aGlzLmFkZER5bmFtaWNLZXliaW5kaW5ncyhbe1xuXHRcdFx0XHRrZXliaW5kaW5nLFxuXHRcdFx0XHRjb21tYW5kLFxuXHRcdFx0XHR3aGVuXG5cdFx0XHR9XSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGFkZER5bmFtaWNLZXliaW5kaW5ncyhydWxlczogSUtleWJpbmRpbmdSdWxlW10pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZW50cmllczogSUtleWJpbmRpbmdJdGVtW10gPSBydWxlcy5tYXAoKHJ1bGUpID0+IHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBkZWNvZGVLZXliaW5kaW5nKHJ1bGUua2V5YmluZGluZywgT1MpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2V5YmluZGluZyxcblx0XHRcdFx0Y29tbWFuZDogcnVsZS5jb21tYW5kID8/IG51bGwsXG5cdFx0XHRcdGNvbW1hbmRBcmdzOiBydWxlLmNvbW1hbmRBcmdzLFxuXHRcdFx0XHR3aGVuOiBydWxlLndoZW4sXG5cdFx0XHRcdHdlaWdodDE6IDEwMDAsXG5cdFx0XHRcdHdlaWdodDI6IDAsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBudWxsLFxuXHRcdFx0XHRpc0J1aWx0aW5FeHRlbnNpb246IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX2R5bmFtaWNLZXliaW5kaW5ncyA9IHRoaXMuX2R5bmFtaWNLZXliaW5kaW5ncy5jb25jYXQoZW50cmllcyk7XG5cblx0XHR0aGlzLnVwZGF0ZVJlc29sdmVyKCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdC8vIFNlYXJjaCB0aGUgZmlyc3QgZW50cnkgYW5kIHJlbW92ZSB0aGVtIGFsbCBzaW5jZSB0aGV5IHdpbGwgYmUgY29udGlndW91c1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9keW5hbWljS2V5YmluZGluZ3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuX2R5bmFtaWNLZXliaW5kaW5nc1tpXSA9PT0gZW50cmllc1swXSkge1xuXHRcdFx0XHRcdHRoaXMuX2R5bmFtaWNLZXliaW5kaW5ncy5zcGxpY2UoaSwgZW50cmllcy5sZW5ndGgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlUmVzb2x2ZXIoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVzb2x2ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGVkUmVzb2x2ZXIgPSBudWxsO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlS2V5YmluZGluZ3MuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRSZXNvbHZlcigpOiBLZXliaW5kaW5nUmVzb2x2ZXIge1xuXHRcdGlmICghdGhpcy5fY2FjaGVkUmVzb2x2ZXIpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gdGhpcy5fdG9Ob3JtYWxpemVkS2V5YmluZGluZ0l0ZW1zKEtleWJpbmRpbmdzUmVnaXN0cnkuZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCksIHRydWUpO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gdGhpcy5fdG9Ob3JtYWxpemVkS2V5YmluZGluZ0l0ZW1zKHRoaXMuX2R5bmFtaWNLZXliaW5kaW5ncywgZmFsc2UpO1xuXHRcdFx0dGhpcy5fY2FjaGVkUmVzb2x2ZXIgPSBuZXcgS2V5YmluZGluZ1Jlc29sdmVyKGRlZmF1bHRzLCBvdmVycmlkZXMsIChzdHIpID0+IHRoaXMuX2xvZyhzdHIpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFJlc29sdmVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kb2N1bWVudEhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBtYWluV2luZG93LmRvY3VtZW50Lmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF90b05vcm1hbGl6ZWRLZXliaW5kaW5nSXRlbXMoaXRlbXM6IElLZXliaW5kaW5nSXRlbVtdLCBpc0RlZmF1bHQ6IGJvb2xlYW4pOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCB3aGVuID0gaXRlbS53aGVuIHx8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBpdGVtLmtleWJpbmRpbmc7XG5cblx0XHRcdGlmICgha2V5YmluZGluZykge1xuXHRcdFx0XHQvLyBUaGlzIG1pZ2h0IGJlIGEgcmVtb3ZhbCBrZXliaW5kaW5nIGl0ZW0gaW4gdXNlciBzZXR0aW5ncyA9PiBhY2NlcHQgaXRcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHVuZGVmaW5lZCwgaXRlbS5jb21tYW5kLCBpdGVtLmNvbW1hbmRBcmdzLCB3aGVuLCBpc0RlZmF1bHQsIG51bGwsIGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZ3MgPSBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZy5yZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nLCBPUyk7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVzb2x2ZWRLZXliaW5kaW5nIG9mIHJlc29sdmVkS2V5YmluZGluZ3MpIHtcblx0XHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0ocmVzb2x2ZWRLZXliaW5kaW5nLCBpdGVtLmNvbW1hbmQsIGl0ZW0uY29tbWFuZEFyZ3MsIHdoZW4sIGlzRGVmYXVsdCwgbnVsbCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nOiBLZXliaW5kaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdHJldHVybiBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZy5yZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nLCBPUyk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUtleWJvYXJkRXZlbnQoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiBSZXNvbHZlZEtleWJpbmRpbmcge1xuXHRcdGNvbnN0IGNob3JkID0gbmV3IEtleUNvZGVDaG9yZChcblx0XHRcdGtleWJvYXJkRXZlbnQuY3RybEtleSxcblx0XHRcdGtleWJvYXJkRXZlbnQuc2hpZnRLZXksXG5cdFx0XHRrZXlib2FyZEV2ZW50LmFsdEtleSxcblx0XHRcdGtleWJvYXJkRXZlbnQubWV0YUtleSxcblx0XHRcdGtleWJvYXJkRXZlbnQua2V5Q29kZVxuXHRcdCk7XG5cdFx0cmV0dXJuIG5ldyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyhbY2hvcmRdLCBPUyk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZVVzZXJCaW5kaW5nKHVzZXJCaW5kaW5nOiBzdHJpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHVibGljIF9kdW1wRGVidWdJbmZvKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHVibGljIF9kdW1wRGVidWdJbmZvSlNPTigpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclNjaGVtYUNvbnRyaWJ1dGlvbihjb250cmlidXRpb246IEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHQvKipcblx0ICogbm90IHlldCBzdXBwb3J0ZWRcblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBlbmFibGVLZXliaW5kaW5nSG9sZE1vZGUoY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIERvbU5vZGVMaXN0ZW5lcnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmVcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMge1xuXHRyZXR1cm4gISF0aGluZ1xuXHRcdCYmIHR5cGVvZiB0aGluZyA9PT0gJ29iamVjdCdcblx0XHQmJiAoISh0aGluZyBhcyBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcykub3ZlcnJpZGVJZGVudGlmaWVyIHx8IHR5cGVvZiAodGhpbmcgYXMgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpLm92ZXJyaWRlSWRlbnRpZmllciA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKCEodGhpbmcgYXMgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpLnJlc291cmNlIHx8ICh0aGluZyBhcyBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcykucmVzb3VyY2UgaW5zdGFuY2VvZiBVUkkpO1xufVxuXG5leHBvcnQgY2xhc3MgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBuZXcgRW1pdHRlcjxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFdmVudDxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gbmV3IENvbmZpZ3VyYXRpb24oXG5cdFx0XHRkZWZhdWx0Q29uZmlndXJhdGlvbi5yZWxvYWQoKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpLFxuXHRcdFx0bG9nU2VydmljZVxuXHRcdCk7XG5cdFx0ZGVmYXVsdENvbmZpZ3VyYXRpb24uZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0VmFsdWU8VD4oKTogVDtcblx0Z2V0VmFsdWU8VD4oc2VjdGlvbjogc3RyaW5nKTogVDtcblx0Z2V0VmFsdWU8VD4ob3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQ7XG5cdGdldFZhbHVlPFQ+KHNlY3Rpb246IHN0cmluZywgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQ7XG5cdGdldFZhbHVlKGFyZzE/OiB1bmtub3duLCBhcmcyPzogdW5rbm93bik6IHVua25vd24ge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSB0eXBlb2YgYXJnMSA9PT0gJ3N0cmluZycgPyBhcmcxIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG92ZXJyaWRlcyA9IGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcyhhcmcxKSA/IGFyZzEgOiBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMikgPyBhcmcyIDoge307XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uZ2V0VmFsdWUoc2VjdGlvbiwgb3ZlcnJpZGVzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVZhbHVlcyh2YWx1ZXM6IFtzdHJpbmcsIHVua25vd25dW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHsgZGF0YTogdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKSB9O1xuXG5cdFx0Y29uc3QgY2hhbmdlZEtleXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHZhbHVlcykge1xuXHRcdFx0Y29uc3QgW2tleSwgdmFsdWVdID0gZW50cnk7XG5cdFx0XHRpZiAodGhpcy5nZXRWYWx1ZShrZXkpID09PSB2YWx1ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSk7XG5cdFx0XHRjaGFuZ2VkS2V5cy5wdXNoKGtleSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZWRLZXlzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCA9IG5ldyBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQoeyBrZXlzOiBjaGFuZ2VkS2V5cywgb3ZlcnJpZGVzOiBbXSB9LCBwcmV2aW91cywgdGhpcy5fY29uZmlndXJhdGlvbiwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LnNvdXJjZSA9IENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmZpcmUoY29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBhcmczPzogdW5rbm93biwgYXJnND86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVWYWx1ZXMoW1trZXksIHZhbHVlXV0pO1xuXHR9XG5cblx0cHVibGljIGluc3BlY3Q8Qz4oa2V5OiBzdHJpbmcsIG9wdGlvbnM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzID0ge30pOiBJQ29uZmlndXJhdGlvblZhbHVlPEM+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5pbnNwZWN0PEM+KGtleSwgb3B0aW9ucywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCkge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmtleXModW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWxvYWRDb25maWd1cmF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb25maWd1cmF0aW9uRGF0YSgpOiBJQ29uZmlndXJhdGlvbkRhdGEgfCBudWxsIHtcblx0XHRjb25zdCBlbXB0eU1vZGVsOiBJQ29uZmlndXJhdGlvbk1vZGVsID0ge1xuXHRcdFx0Y29udGVudHM6IHt9LFxuXHRcdFx0a2V5czogW10sXG5cdFx0XHRvdmVycmlkZXM6IFtdXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVmYXVsdHM6IGVtcHR5TW9kZWwsXG5cdFx0XHRwb2xpY3k6IGVtcHR5TW9kZWwsXG5cdFx0XHRhcHBsaWNhdGlvbjogZW1wdHlNb2RlbCxcblx0XHRcdHVzZXJMb2NhbDogZW1wdHlNb2RlbCxcblx0XHRcdHVzZXJSZW1vdGU6IGVtcHR5TW9kZWwsXG5cdFx0XHR3b3Jrc3BhY2U6IGVtcHR5TW9kZWwsXG5cdFx0XHRmb2xkZXJzOiBbXVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7IGFmZmVjdGVkS2V5czogZS5hZmZlY3RlZEtleXMsIGFmZmVjdHNDb25maWd1cmF0aW9uOiAocmVzb3VyY2U6IFVSSSwgY29uZmlndXJhdGlvbjogc3RyaW5nKSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24pIH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldFZhbHVlPFQ+KHJlc291cmNlOiBVUkksIHNlY3Rpb24/OiBzdHJpbmcpOiBUO1xuXHRnZXRWYWx1ZTxUPihyZXNvdXJjZTogVVJJLCBwb3NpdGlvbj86IElQb3NpdGlvbiwgc2VjdGlvbj86IHN0cmluZyk6IFQ7XG5cdGdldFZhbHVlPFQ+KHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGFyZzI/OiB1bmtub3duLCBhcmczPzogdW5rbm93bikge1xuXHRcdGNvbnN0IHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsID0gUG9zLmlzSVBvc2l0aW9uKGFyZzIpID8gYXJnMiA6IG51bGw7XG5cdFx0Y29uc3Qgc2VjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gcG9zaXRpb24gPyAodHlwZW9mIGFyZzMgPT09ICdzdHJpbmcnID8gYXJnMyA6IHVuZGVmaW5lZCkgOiAodHlwZW9mIGFyZzIgPT09ICdzdHJpbmcnID8gYXJnMiA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSByZXNvdXJjZSA/IHRoaXMuZ2V0TGFuZ3VhZ2UocmVzb3VyY2UsIHBvc2l0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIHNlY3Rpb24gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxUPih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VD4oc2VjdGlvbiwge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlXG5cdFx0fSk7XG5cdH1cblxuXHRpbnNwZWN0PFQ+KHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsLCBzZWN0aW9uOiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PFQ+PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSByZXNvdXJjZSA/IHRoaXMuZ2V0TGFuZ3VhZ2UocmVzb3VyY2UsIHBvc2l0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFQ+KHNlY3Rpb24sIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhbmd1YWdlKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gcG9zaXRpb24gPyBtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pIDogbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlKTtcblx0fVxuXG5cdHVwZGF0ZVZhbHVlKHJlc291cmNlOiBVUkksIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgY29uZmlndXJhdGlvblRhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCB7IHJlc291cmNlIH0sIGNvbmZpZ3VyYXRpb25UYXJnZXQpO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIGltcGxlbWVudHMgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRnZXRFT0wocmVzb3VyY2U6IFVSSSwgbGFuZ3VhZ2U/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGVvbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLmVvbCcsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSwgcmVzb3VyY2UgfSk7XG5cdFx0aWYgKGVvbCAmJiB0eXBlb2YgZW9sID09PSAnc3RyaW5nJyAmJiBlb2wgIT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIGVvbDtcblx0XHR9XG5cdFx0cmV0dXJuIChpc0xpbnV4IHx8IGlzTWFjaW50b3NoKSA/ICdcXG4nIDogJ1xcclxcbic7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVRlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLk5PTkU7XG5cdHJlYWRvbmx5IHNlc3Npb25JZCA9ICdzb21lVmFsdWUuc2Vzc2lvbklkJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3NvbWVWYWx1ZS5tYWNoaW5lSWQnO1xuXHRyZWFkb25seSBzcW1JZCA9ICdzb21lVmFsdWUuc3FtSWQnO1xuXHRyZWFkb25seSBkZXZEZXZpY2VJZCA9ICdzb21lVmFsdWUuZGV2RGV2aWNlSWQnO1xuXHRyZWFkb25seSBmaXJzdFNlc3Npb25EYXRlID0gJ3NvbWVWYWx1ZS5maXJzdFNlc3Npb25EYXRlJztcblx0cmVhZG9ubHkgc2VuZEVycm9yVGVsZW1ldHJ5ID0gZmFsc2U7XG5cdHNldEVuYWJsZWQoKTogdm9pZCB7IH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHNldENvbW1vblByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZygpIHsgfVxuXHRwdWJsaWNMb2cyKCkgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yKCkgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yMigpIHsgfVxufVxuXG5jbGFzcyBTdGFuZGFsb25lV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgaW1wbGVtZW50cyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Uge1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0NIRU1FID0gJ2lubWVtb3J5JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gbmV3IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQ+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzOiBFdmVudDxJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnM6IEV2ZW50PElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUgPSBuZXcgRW1pdHRlcjxXb3JrYmVuY2hTdGF0ZT4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGU6IEV2ZW50PFdvcmtiZW5jaFN0YXRlPiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2U6IElXb3Jrc3BhY2U7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU3RhbmRhbG9uZVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLlNDSEVNRSwgYXV0aG9yaXR5OiAnbW9kZWwnLCBwYXRoOiAnLycgfSk7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSB7IGlkOiBTVEFOREFMT05FX0VESVRPUl9XT1JLU1BBQ0VfSUQsIGZvbGRlcnM6IFtuZXcgV29ya3NwYWNlRm9sZGVyKHsgdXJpOiByZXNvdXJjZSwgbmFtZTogJycsIGluZGV4OiAwIH0pXSB9O1xuXHR9XG5cblx0Z2V0Q29tcGxldGVXb3Jrc3BhY2UoKTogUHJvbWlzZTxJV29ya3NwYWNlPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmdldFdvcmtzcGFjZSgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmtiZW5jaFN0YXRlKCk6IFdvcmtiZW5jaFN0YXRlIHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2UpIHtcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuRk9MREVSO1xuXHRcdH1cblx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRwdWJsaWMgaGFzV29ya3NwYWNlRGF0YSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2U6IFVSSSk6IElXb3Jrc3BhY2VGb2xkZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gcmVzb3VyY2UgJiYgcmVzb3VyY2Uuc2NoZW1lID09PSBTdGFuZGFsb25lV29ya3NwYWNlQ29udGV4dFNlcnZpY2UuU0NIRU1FID8gdGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXSA6IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgaXNJbnNpZGVXb3Jrc3BhY2UocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiByZXNvdXJjZSAmJiByZXNvdXJjZS5zY2hlbWUgPT09IFN0YW5kYWxvbmVXb3Jrc3BhY2VDb250ZXh0U2VydmljZS5TQ0hFTUU7XG5cdH1cblxuXHRwdWJsaWMgaXNDdXJyZW50V29ya3NwYWNlKHdvcmtzcGFjZUlkT3JGb2xkZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgc291cmNlOiBhbnksIGlzRGlmZkVkaXRvcjogYm9vbGVhbik6IHZvaWQge1xuXHRpZiAoIXNvdXJjZSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoIShjb25maWd1cmF0aW9uU2VydmljZSBpbnN0YW5jZW9mIFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgdG9VcGRhdGU6IFtzdHJpbmcsIHVua25vd25dW10gPSBbXTtcblx0T2JqZWN0LmtleXMoc291cmNlKS5mb3JFYWNoKChrZXkpID0+IHtcblx0XHRpZiAoaXNFZGl0b3JDb25maWd1cmF0aW9uS2V5KGtleSkpIHtcblx0XHRcdHRvVXBkYXRlLnB1c2goW2BlZGl0b3IuJHtrZXl9YCwgc291cmNlW2tleV1dKTtcblx0XHR9XG5cdFx0aWYgKGlzRGlmZkVkaXRvciAmJiBpc0RpZmZFZGl0b3JDb25maWd1cmF0aW9uS2V5KGtleSkpIHtcblx0XHRcdHRvVXBkYXRlLnB1c2goW2BkaWZmRWRpdG9yLiR7a2V5fWAsIHNvdXJjZVtrZXldXSk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKHRvVXBkYXRlLmxlbmd0aCA+IDApIHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZXModG9VcGRhdGUpO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVCdWxrRWRpdFNlcnZpY2UgaW1wbGVtZW50cyBJQnVsa0VkaXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdC8vXG5cdH1cblxuXHRoYXNQcmV2aWV3SGFuZGxlcigpOiBmYWxzZSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0c2V0UHJldmlld0hhbmRsZXIoKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRhc3luYyBhcHBseShlZGl0c0luOiBSZXNvdXJjZUVkaXRbXSB8IFdvcmtzcGFjZUVkaXQsIF9vcHRpb25zPzogSUJ1bGtFZGl0T3B0aW9ucyk6IFByb21pc2U8SUJ1bGtFZGl0UmVzdWx0PiB7XG5cdFx0Y29uc3QgZWRpdHMgPSBBcnJheS5pc0FycmF5KGVkaXRzSW4pID8gZWRpdHNJbiA6IFJlc291cmNlRWRpdC5jb252ZXJ0KGVkaXRzSW4pO1xuXHRcdGNvbnN0IHRleHRFZGl0cyA9IG5ldyBNYXA8SVRleHRNb2RlbCwgSVNpbmdsZUVkaXRPcGVyYXRpb25bXT4oKTtcblxuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdFx0aWYgKCEoZWRpdCBpbnN0YW5jZW9mIFJlc291cmNlVGV4dEVkaXQpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignYmFkIGVkaXQgLSBvbmx5IHRleHQgZWRpdHMgYXJlIHN1cHBvcnRlZCcpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZWRpdC5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignYmFkIGVkaXQgLSBtb2RlbCBub3QgZm91bmQnKTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgZWRpdC52ZXJzaW9uSWQgPT09ICdudW1iZXInICYmIG1vZGVsLmdldFZlcnNpb25JZCgpICE9PSBlZGl0LnZlcnNpb25JZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2JhZCBzdGF0ZSAtIG1vZGVsIGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lJyk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXJyYXkgPSB0ZXh0RWRpdHMuZ2V0KG1vZGVsKTtcblx0XHRcdGlmICghYXJyYXkpIHtcblx0XHRcdFx0YXJyYXkgPSBbXTtcblx0XHRcdFx0dGV4dEVkaXRzLnNldChtb2RlbCwgYXJyYXkpO1xuXHRcdFx0fVxuXHRcdFx0YXJyYXkucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2VNb3ZlKFJhbmdlLmxpZnQoZWRpdC50ZXh0RWRpdC5yYW5nZSksIGVkaXQudGV4dEVkaXQudGV4dCkpO1xuXHRcdH1cblxuXG5cdFx0bGV0IHRvdGFsRWRpdHMgPSAwO1xuXHRcdGxldCB0b3RhbEZpbGVzID0gMDtcblx0XHRmb3IgKGNvbnN0IFttb2RlbCwgZWRpdHNdIG9mIHRleHRFZGl0cykge1xuXHRcdFx0bW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBlZGl0cywgKCkgPT4gW10pO1xuXHRcdFx0bW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dG90YWxGaWxlcyArPSAxO1xuXHRcdFx0dG90YWxFZGl0cyArPSBlZGl0cy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFyaWFTdW1tYXJ5OiBzdHJpbmdzLmZvcm1hdChTdGFuZGFsb25lU2VydmljZXNOTFMuYnVsa0VkaXRTZXJ2aWNlU3VtbWFyeSwgdG90YWxFZGl0cywgdG90YWxGaWxlcyksXG5cdFx0XHRpc0FwcGxpZWQ6IHRvdGFsRWRpdHMgPiAwXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBTdGFuZGFsb25lVXJpTGFiZWxTZXJ2aWNlIGltcGxlbWVudHMgSUxhYmVsU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9ybWF0dGVyczogRXZlbnQ8SUZvcm1hdHRlckNoYW5nZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cblx0cHVibGljIGdldFVyaUxhYmVsKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IHJlbGF0aXZlPzogYm9vbGVhbjsgZm9yY2VOb1RpbGRpZnk/OiBib29sZWFuIH0pOiBzdHJpbmcge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09ICdmaWxlJykge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlLmZzUGF0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc291cmNlLnBhdGg7XG5cdH1cblxuXHRnZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiBiYXNlbmFtZShyZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29ya3NwYWNlTGFiZWwod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgVVJJIHwgSVdvcmtzcGFjZSwgb3B0aW9ucz86IHsgdmVyYm9zZTogVmVyYm9zaXR5IH0pOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHB1YmxpYyBnZXRTZXBhcmF0b3Ioc2NoZW1lOiBzdHJpbmcsIGF1dGhvcml0eT86IHN0cmluZyk6ICcvJyB8ICdcXFxcJyB7XG5cdFx0cmV0dXJuICcvJztcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckZvcm1hdHRlcihmb3JtYXR0ZXI6IFJlc291cmNlTGFiZWxGb3JtYXR0ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckNhY2hlZEZvcm1hdHRlcihmb3JtYXR0ZXI6IFJlc291cmNlTGFiZWxGb3JtYXR0ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMucmVnaXN0ZXJGb3JtYXR0ZXIoZm9ybWF0dGVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRIb3N0TGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SG9zdFRvb2x0aXAoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cblxuY2xhc3MgU3RhbmRhbG9uZUNvbnRleHRWaWV3U2VydmljZSBleHRlbmRzIENvbnRleHRWaWV3U2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGF5b3V0U2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG93Q29udGV4dFZpZXcoZGVsZWdhdGU6IElDb250ZXh0Vmlld0RlbGVnYXRlLCBjb250YWluZXI/OiBIVE1MRWxlbWVudCwgc2hhZG93Um9vdD86IGJvb2xlYW4pOiBJT3BlbkNvbnRleHRWaWV3IHtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkgfHwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29udGFpbmVyID0gY29kZUVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5zaG93Q29udGV4dFZpZXcoZGVsZWdhdGUsIGNvbnRhaW5lciwgc2hhZG93Um9vdCk7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9uZXZlckVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxuZXZlcj4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHJ1c3Q6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fbmV2ZXJFbWl0dGVyLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzOiBFdmVudDx2b2lkPiA9IHRoaXMuX25ldmVyRW1pdHRlci5ldmVudDtcblx0cHVibGljIHJlYWRvbmx5IHdvcmtzcGFjZVJlc29sdmVkID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHB1YmxpYyByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHB1YmxpYyByZWFkb25seSBhY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcyA9IHRydWU7XG5cblx0aXNXb3Jrc3BhY2VUcnVzdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlzV29ya3NwYWNlVHJ1c3RGb3JjZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNhblNldFBhcmVudEZvbGRlclRydXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRhc3luYyBzZXRQYXJlbnRGb2xkZXJUcnVzdCh0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cdGNhblNldFdvcmtzcGFjZVRydXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRhc3luYyBzZXRXb3Jrc3BhY2VUcnVzdCh0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cdGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSk6IFByb21pc2U8SVdvcmtzcGFjZVRydXN0VXJpSW5mbz4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBzdXBwb3J0ZWQuJyk7XG5cdH1cblx0YXN5bmMgc2V0VXJpc1RydXN0KHVyaTogVVJJW10sIHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub29wXG5cdH1cblx0Z2V0VHJ1c3RlZFVyaXMoKTogVVJJW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRhc3luYyBzZXRUcnVzdGVkVXJpcyh1cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXHRhZGRXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudChwYXJ0aWNpcGFudDogSVdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50KTogSURpc3Bvc2FibGUge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBzdXBwb3J0ZWQuJyk7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZUxhbmd1YWdlU2VydmljZSBleHRlbmRzIExhbmd1YWdlU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZUxvZ1NlcnZpY2UgZXh0ZW5kcyBMb2dTZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIobmV3IENvbnNvbGVMb2dnZXIoKSk7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZUNvbnRleHRNZW51U2VydmljZSBleHRlbmRzIENvbnRleHRNZW51U2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0ZWxlbWV0cnlTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb250ZXh0Vmlld1NlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY29uZmlndXJlKHsgYmxvY2tNb3VzZTogZmFsc2UgfSk7IC8vIHdlIGRvIG5vdCB3YW50IHRoYXQgaW4gdGhlIHN0YW5kYWxvbmUgZWRpdG9yXG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZUFjY2Vzc2JpbGl0eVNpZ25hbFNlcnZpY2UgaW1wbGVtZW50cyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGFzeW5jIHBsYXlTaWduYWwoY3VlOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBvcHRpb25zOiB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0YXN5bmMgcGxheVNpZ25hbHMoY3VlczogQWNjZXNzaWJpbGl0eVNpZ25hbFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRnZXRFbmFibGVkU3RhdGUoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCB1c2VyR2VzdHVyZTogYm9vbGVhbiwgbW9kYWxpdHk/OiBBY2Nlc3NpYmlsaXR5TW9kYWxpdHkgfCB1bmRlZmluZWQpOiBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBWYWx1ZVdpdGhDaGFuZ2VFdmVudC5jb25zdChmYWxzZSk7XG5cdH1cblxuXHRnZXREZWxheU1zKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgbW9kYWxpdHk6IEFjY2Vzc2liaWxpdHlNb2RhbGl0eSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRpc1NvdW5kRW5hYmxlZChjdWU6IEFjY2Vzc2liaWxpdHlTaWduYWwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpc0Fubm91bmNlbWVudEVuYWJsZWQoY3VlOiBBY2Nlc3NpYmlsaXR5U2lnbmFsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0b25Tb3VuZEVuYWJsZWRDaGFuZ2VkKGN1ZTogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuTm9uZTtcblx0fVxuXG5cdGFzeW5jIHBsYXlTb3VuZChjdWU6IFNvdW5kLCBhbGxvd01hbnlJblBhcmFsbGVsPzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cdHBsYXlTaWduYWxMb29wKGN1ZTogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZURlZmF1bHRBY2NvdW50U2VydmljZSBpbXBsZW1lbnRzIElEZWZhdWx0QWNjb3VudFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50OiBFdmVudDxJRGVmYXVsdEFjY291bnQgfCBudWxsPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUG9saWN5RGF0YTogRXZlbnQ8SVBvbGljeURhdGEgfCBudWxsPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IHBvbGljeURhdGE6IElQb2xpY3lEYXRhIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IGN1cnJlbnREZWZhdWx0QWNjb3VudDogSURlZmF1bHRBY2NvdW50IHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IGNvcGlsb3RUb2tlbkluZm8gPSBudWxsO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm86IEV2ZW50PG51bGw+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXM6IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQ6IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZTogdW5rbm93biA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciA9IG51bGw7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID0gRXZlbnQuTm9uZTtcblxuXHRhc3luYyBnZXREZWZhdWx0QWNjb3VudCgpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0cmV0dXJuIHsgaWQ6ICdkZWZhdWx0JywgbmFtZTogJ0RlZmF1bHQnLCBlbnRlcnByaXNlOiBmYWxzZSB9O1xuXHR9XG5cblx0cmVzb2x2ZUdpdEh1YlVybChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cGF0aH1gO1xuXHR9XG5cblx0YXN5bmMgc2lnbkluKCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2lnbk91dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBuby1vcFxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvck92ZXJyaWRlU2VydmljZXMge1xuXHRbaW5kZXg6IHN0cmluZ106IHVua25vd247XG59XG5cblxucmVnaXN0ZXJTaW5nbGV0b24oSVdlYldvcmtlclNlcnZpY2UsIFN0YW5kYWxvbmVXZWJXb3JrZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTG9nU2VydmljZSwgU3RhbmRhbG9uZUxvZ1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDb25maWd1cmF0aW9uU2VydmljZSwgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIFN0YW5kYWxvbmVSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIFN0YW5kYWxvbmVSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFN0YW5kYWxvbmVXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxhYmVsU2VydmljZSwgU3RhbmRhbG9uZVVyaUxhYmVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVRlbGVtZXRyeVNlcnZpY2UsIFN0YW5kYWxvbmVUZWxlbWV0cnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJRGlhbG9nU2VydmljZSwgU3RhbmRhbG9uZURpYWxvZ1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElFbnZpcm9ubWVudFNlcnZpY2UsIFN0YW5kYWxvbmVFbnZpcm9ubWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RpZmljYXRpb25TZXJ2aWNlLCBTdGFuZGFsb25lTm90aWZpY2F0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU1hcmtlclNlcnZpY2UsIE1hcmtlclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElMYW5ndWFnZVNlcnZpY2UsIFN0YW5kYWxvbmVMYW5ndWFnZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlLCBTdGFuZGFsb25lVGhlbWVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTW9kZWxTZXJ2aWNlLCBNb2RlbFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UsIE1hcmtlckRlY29yYXRpb25zU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVByb2dyZXNzU2VydmljZSwgU3RhbmRhbG9uZVByb2dyZXNzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUVkaXRvclByb2dyZXNzU2VydmljZSwgU3RhbmRhbG9uZUVkaXRvclByb2dyZXNzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQnVsa0VkaXRTZXJ2aWNlLCBTdGFuZGFsb25lQnVsa0VkaXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgU3RhbmRhbG9uZVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElUZXh0TW9kZWxTZXJ2aWNlLCBTdGFuZGFsb25lVGV4dE1vZGVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBBY2Nlc3NpYmlsaXR5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNvbW1hbmRTZXJ2aWNlLCBTdGFuZGFsb25lQ29tbWFuZFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElLZXliaW5kaW5nU2VydmljZSwgU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJUXVpY2tJbnB1dFNlcnZpY2UsIFN0YW5kYWxvbmVRdWlja0lucHV0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNvbnRleHRWaWV3U2VydmljZSwgU3RhbmRhbG9uZUNvbnRleHRWaWV3U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU9wZW5lclNlcnZpY2UsIE9wZW5lclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDbGlwYm9hcmRTZXJ2aWNlLCBCcm93c2VyQ2xpcGJvYXJkU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNvbnRleHRNZW51U2VydmljZSwgU3RhbmRhbG9uZUNvbnRleHRNZW51U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU1lbnVTZXJ2aWNlLCBNZW51U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCBTdGFuZGFsb25lQWNjZXNzYmlsaXR5U2lnbmFsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgU3RhbmRhbG9uZVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxvZ2dlclNlcnZpY2UsIE51bGxMb2dnZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJRGF0YUNoYW5uZWxTZXJ2aWNlLCBOdWxsRGF0YUNoYW5uZWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCBTdGFuZGFsb25lRGVmYXVsdEFjY291bnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJUmVuYW1lU3ltYm9sVHJhY2tlclNlcnZpY2UsIE51bGxSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UsIFVzZXJJbnRlcmFjdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcblxuLyoqXG4gKiBXZSBkb24ndCB3YW50IHRvIGVhZ2VybHkgaW5zdGFudGlhdGUgc2VydmljZXMgYmVjYXVzZSBlbWJlZGRlcnMgZ2V0IGEgb25lIHRpbWUgY2hhbmNlXG4gKiB0byBvdmVycmlkZSBzZXJ2aWNlcyB3aGVuIHRoZXkgY3JlYXRlIHRoZSBmaXJzdCBlZGl0b3IuXG4gKi9cbmV4cG9ydCBuYW1lc3BhY2UgU3RhbmRhbG9uZVNlcnZpY2VzIHtcblxuXHRjb25zdCBzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRmb3IgKGNvbnN0IFtpZCwgZGVzY3JpcHRvcl0gb2YgZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzKCkpIHtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbi5zZXQoaWQsIGRlc2NyaXB0b3IpO1xuXHR9XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZUNvbGxlY3Rpb24sIHRydWUpO1xuXHRzZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGdldDxUPihzZXJ2aWNlSWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+KTogVCB7XG5cdFx0aWYgKCFpbml0aWFsaXplZCkge1xuXHRcdFx0aW5pdGlhbGl6ZSh7fSk7XG5cdFx0fVxuXHRcdGNvbnN0IHIgPSBzZXJ2aWNlQ29sbGVjdGlvbi5nZXQoc2VydmljZUlkKTtcblx0XHRpZiAoIXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2luZyBzZXJ2aWNlICcgKyBzZXJ2aWNlSWQpO1xuXHRcdH1cblx0XHRpZiAociBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoc2VydmljZUlkKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiByO1xuXHRcdH1cblx0fVxuXG5cdGxldCBpbml0aWFsaXplZCA9IGZhbHNlO1xuXHRjb25zdCBvbkRpZEluaXRpYWxpemUgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRleHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZShvdmVycmlkZXM6IElFZGl0b3JPdmVycmlkZVNlcnZpY2VzKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHRpZiAoaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHR9XG5cdFx0aW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gQWRkIHNpbmdsZXRvbnMgdGhhdCB3ZXJlIHJlZ2lzdGVyZWQgYWZ0ZXIgdGhpcyBtb2R1bGUgbG9hZGVkXG5cdFx0Zm9yIChjb25zdCBbaWQsIGRlc2NyaXB0b3JdIG9mIGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycygpKSB7XG5cdFx0XHRpZiAoIXNlcnZpY2VDb2xsZWN0aW9uLmdldChpZCkpIHtcblx0XHRcdFx0c2VydmljZUNvbGxlY3Rpb24uc2V0KGlkLCBkZXNjcmlwdG9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzZXJ2aWNlIGNvbGxlY3Rpb24gd2l0aCB0aGUgb3ZlcnJpZGVzLCBidXQgb25seSBpZiB0aGVcblx0XHQvLyBzZXJ2aWNlIHdhcyBub3QgaW5zdGFudGlhdGVkIGluIHRoZSBtZWFudGltZS5cblx0XHRmb3IgKGNvbnN0IHNlcnZpY2VJZCBpbiBvdmVycmlkZXMpIHtcblx0XHRcdGlmIChvdmVycmlkZXMuaGFzT3duUHJvcGVydHkoc2VydmljZUlkKSkge1xuXHRcdFx0XHRjb25zdCBzZXJ2aWNlSWRlbnRpZmllciA9IGNyZWF0ZURlY29yYXRvcihzZXJ2aWNlSWQpO1xuXHRcdFx0XHRjb25zdCByID0gc2VydmljZUNvbGxlY3Rpb24uZ2V0KHNlcnZpY2VJZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKHIgaW5zdGFuY2VvZiBTeW5jRGVzY3JpcHRvcikge1xuXHRcdFx0XHRcdHNlcnZpY2VDb2xsZWN0aW9uLnNldChzZXJ2aWNlSWRlbnRpZmllciwgb3ZlcnJpZGVzW3NlcnZpY2VJZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgYWxsIGVkaXRvciBmZWF0dXJlc1xuXHRcdGNvbnN0IGVkaXRvckZlYXR1cmVzID0gZ2V0RWRpdG9yRmVhdHVyZXMoKTtcblx0XHRmb3IgKGNvbnN0IGZlYXR1cmUgb2YgZWRpdG9yRmVhdHVyZXMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGZlYXR1cmUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0b25EaWRJbml0aWFsaXplLmZpcmUoKTtcblxuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeGVjdXRlcyBjYWxsYmFjayBvbmNlIHNlcnZpY2VzIGFyZSBpbml0aWFsaXplZC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiB3aXRoU2VydmljZXMoY2FsbGJhY2s6ICgpID0+IElEaXNwb3NhYmxlKTogSURpc3Bvc2FibGUge1xuXHRcdGlmIChpbml0aWFsaXplZCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZS5hZGQob25EaWRJbml0aWFsaXplLmV2ZW50KCgpID0+IHtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGRpc3Bvc2FibGUuYWRkKGNhbGxiYWNrKCkpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFFUCxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx5QkFBeUI7QUFD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
