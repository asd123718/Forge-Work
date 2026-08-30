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
import { defineFixture, defineFixtureGroup, defineFixtureVariants } from "@vscode/component-explorer";
import { z } from "zod";
import { DisposableStore, DisposableTracker, MutableDisposable, setDisposableTracker, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ModifierKeyEmitter } from "../../../../base/browser/dom.js";
import "../../../../../../build/vite/style.css";
import "../../../browser/media/style.css";
import "../../../browser/parts/auxiliarybar/media/auxiliaryBarPart.css";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ColorThemeData } from "../../../services/themes/common/colorThemeData.js";
import { ExtensionData } from "../../../services/themes/common/workbenchThemeService.js";
import { ensureGlobalStylesInstalled, getStylesheetDocumentFiles, overrideStylesheetOrder } from "./fixtureUtilsCss.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { IInlineCompletionsService, InlineCompletionsService } from "../../../../editor/browser/services/inlineCompletionsService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../editor/common/services/languageFeaturesService.js";
import { LanguageService } from "../../../../editor/common/services/languageService.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ModelService } from "../../../../editor/common/services/modelService.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ITreeSitterLibraryService } from "../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { ICodeLensCache } from "../../../../editor/contrib/codelens/browser/codeLensCache.js";
import { TestCodeEditorService, TestCommandService } from "../../../../editor/test/browser/editorTestServices.js";
import { TestLanguageConfigurationService } from "../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { TestEditorWorkerService } from "../../../../editor/test/common/services/testEditorWorkerService.js";
import { TestTextResourcePropertiesService } from "../../../../editor/test/common/services/testTextResourcePropertiesService.js";
import { TestTreeSitterLibraryService } from "../../../../editor/test/common/services/testTreeSitterLibraryService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IActionViewItemService, NullActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { IChatPhoneInputPresenter } from "../../../contrib/chat/browser/widget/input/chatPhoneInputPresenter.js";
import { IChatPasteTargetService } from "../../../contrib/chat/browser/chat.js";
import { ChatPasteTargetService } from "../../../contrib/chat/browser/attachments/chatPasteTargetService.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { TestClipboardService } from "../../../../platform/clipboard/test/common/testClipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IDataChannelService, NullDataChannelService } from "../../../../platform/dataChannel/common/dataChannel.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../platform/dialogs/test/common/testDialogService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { MockContextKeyService, MockKeybindingService } from "../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILoggerService, ILogService, NullLoggerService, NullLogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../platform/notification/test/common/testNotificationService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { NullOpenerService } from "../../../../platform/opener/test/common/nullOpenerService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryServiceShape } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { TestThemeService } from "../../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../../platform/undoRedo/common/undoRedoService.js";
import { IUserInteractionService, MockUserInteractionService } from "../../../../platform/userInteraction/browser/userInteractionService.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { TestMenuService } from "../workbenchTestServices.js";
import { IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, IAgentFeedbackService } from "../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js";
import { IChatEditingService } from "../../../contrib/chat/common/editing/chatEditingService.js";
import { ISessionsManagementService } from "../../../../sessions/services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../sessions/services/sessions/browser/sessionsService.js";
import { ICodeReviewService, PRReviewStateKind } from "../../../../sessions/contrib/codeReview/browser/codeReviewService.js";
import { constObservable } from "../../../../base/common/observable.js";
import "./fixtures.css";
import { installFakeRunWhenIdle } from "../../../../base/common/async.js";
import { buildHistoryFromTasks, renderSwimlanes } from "../../../../base/test/common/executionGraph.js";
import { pushRandomOverwrite } from "../../../../base/test/common/randomOverwrite.js";
import {
  captureGlobalTimeApi,
  createLoggingTimeApi,
  createTraceRoot,
  createVirtualTimeApi,
  drainMicrotasksEmbedding,
  nextMacrotask,
  pushGlobalTimeApi,
  TraceContext,
  untilTime,
  VirtualClock,
  VirtualTimeProcessor
} from "../../../../base/test/common/virtualScheduling/index.js";
import "../../../../platform/theme/common/colors/baseColors.js";
import "../../../../platform/theme/common/colors/editorColors.js";
import "../../../../platform/theme/common/colors/listColors.js";
import "../../../../platform/theme/common/colors/miscColors.js";
import "../../../common/theme.js";
import sourceMapSupport from "source-map-support";
sourceMapSupport.install({
  environment: "browser",
  handleUncaughtExceptions: false,
  retrieveSourceMap: (source) => {
    const mapUrl = source + ".map";
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", mapUrl, false);
      xhr.send();
      if (xhr.status === 200) {
        return { url: null, map: xhr.responseText };
      }
    } catch {
    }
    return null;
  }
});
class NullStorageService {
  constructor() {
    this._onDidChangeValue = new Emitter();
    this._onDidChangeTarget = new Emitter();
    this.onDidChangeTarget = this._onDidChangeTarget.event;
    this._onWillSaveState = new Emitter();
    this.onWillSaveState = this._onWillSaveState.event;
  }
  onDidChangeValue(scope, key, disposable) {
    return Event.filter(this._onDidChangeValue.event, (e) => e.scope === scope && (key === void 0 || e.key === key), disposable);
  }
  get(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  getBoolean(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  getNumber(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  getObject(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  store(_key, _value, _scope, _target) {
  }
  storeAll(_entries, _external) {
  }
  remove(_key, _scope) {
  }
  isNew(_scope) {
    return true;
  }
  flush(_reason) {
    return Promise.resolve();
  }
  optimize(_scope) {
    return Promise.resolve();
  }
  log() {
  }
  keys(_scope, _target) {
    return [];
  }
  switch() {
    return Promise.resolve();
  }
  hasScope(_scope) {
    return false;
  }
}
import dark_modern from "../../../../../../extensions/theme-defaults/themes/dark_modern.json";
import dark_plus from "../../../../../../extensions/theme-defaults/themes/dark_plus.json";
import dark_vs from "../../../../../../extensions/theme-defaults/themes/dark_vs.json";
import hc_black from "../../../../../../extensions/theme-defaults/themes/hc_black.json";
import light_modern from "../../../../../../extensions/theme-defaults/themes/light_modern.json";
import light_plus from "../../../../../../extensions/theme-defaults/themes/light_plus.json";
import light_vs from "../../../../../../extensions/theme-defaults/themes/light_vs.json";
const themeJsonModules = {
  "/extensions/theme-defaults/themes/dark_modern.json": dark_modern,
  "/extensions/theme-defaults/themes/dark_plus.json": dark_plus,
  "/extensions/theme-defaults/themes/dark_vs.json": dark_vs,
  "/extensions/theme-defaults/themes/hc_black.json": hc_black,
  "/extensions/theme-defaults/themes/light_modern.json": light_modern,
  "/extensions/theme-defaults/themes/light_plus.json": light_plus,
  "/extensions/theme-defaults/themes/light_vs.json": light_vs
};
const fixtureExtensionResourceLoaderService = new class {
  async readExtensionResource(uri) {
    const content = themeJsonModules[uri.path];
    if (content === void 0) {
      throw new Error(`Fixture extension resource not found: ${uri.toString()}`);
    }
    return content;
  }
  supportsExtensionGalleryResources() {
    return Promise.resolve(false);
  }
  isExtensionGalleryResource() {
    return Promise.resolve(false);
  }
  getExtensionGalleryResourceURL() {
    return Promise.resolve(void 0);
  }
}();
function createBuiltInTheme(themePath, uiTheme) {
  const location = URI.parse(`file://${themePath}`);
  return ColorThemeData.fromExtensionTheme(
    { id: themePath, path: themePath, uiTheme, _watch: false },
    location,
    ExtensionData.fromName("vscode", "theme-defaults", true)
  );
}
const darkTheme = createBuiltInTheme("/extensions/theme-defaults/themes/dark_modern.json", ThemeTypeSelector.VS_DARK);
const lightTheme = createBuiltInTheme("/extensions/theme-defaults/themes/light_modern.json", ThemeTypeSelector.VS);
const darkHighContrastTheme = createBuiltInTheme("/extensions/theme-defaults/themes/hc_black.json", ThemeTypeSelector.HC_BLACK);
const darkThemeVariant = { label: "Dark", background: "dark", theme: darkTheme, scopeThemingParticipants: false };
const lightThemeVariant = { label: "Light", background: "light", theme: lightTheme, scopeThemingParticipants: false };
const additionalThemeVariants = {
  darkHighContrast: { label: "DarkHighContrast", background: "dark", theme: darkHighContrastTheme, scopeThemingParticipants: true }
};
const themeLoadedPromises = /* @__PURE__ */ new WeakMap();
function ensureThemeLoaded(theme) {
  let themeLoadedPromise = themeLoadedPromises.get(theme);
  if (!themeLoadedPromise) {
    themeLoadedPromise = theme.ensureLoaded(fixtureExtensionResourceLoaderService);
    themeLoadedPromises.set(theme, themeLoadedPromise);
  }
  return themeLoadedPromise;
}
async function setupTheme(container, theme, scopeThemingParticipants = false) {
  await ensureThemeLoaded(theme);
  await ensureGlobalStylesInstalled(theme, scopeThemingParticipants);
  container.classList.add("component-fixture", "monaco-workbench", getPlatformClass(), "disable-animations", ...theme.classNames);
}
function parseFixtureInput(input) {
  if (!input || typeof input !== "object") {
    return { reverseStylesheets: false, reverseStylesheetsRange: void 0, enableAnimations: false, outputTimeTrace: false, outputStylesheetFiles: false };
  }
  const record = input;
  return {
    reverseStylesheets: record.reverseStylesheets === true,
    reverseStylesheetsRange: parseReverseStylesheetsRange(record.reverseStylesheetsRange),
    enableAnimations: record.enableAnimations === true,
    outputTimeTrace: !!record.outputTimeTrace,
    outputStylesheetFiles: !!record.outputStylesheetFiles
  };
}
function parseReverseStylesheetsRange(value) {
  if (value && typeof value === "object") {
    const range = value;
    if (typeof range.fromIndex === "number" && typeof range.toIndex === "number") {
      return { fromIndex: range.fromIndex, toIndex: range.toIndex };
    }
  }
  return void 0;
}
function getReverseStylesheetsOption(input) {
  const parsedInput = parseFixtureInput(input);
  return parsedInput.reverseStylesheetsRange ?? parsedInput.reverseStylesheets;
}
const fixtureInputSchema = z.object({
  reverseStylesheets: z.boolean().default(false).describe("Reverse the order of the bundled CSS documents to surface cascade-order dependencies."),
  reverseStylesheetsRange: z.object({
    fromIndex: z.number(),
    toIndex: z.number()
  }).optional().describe("Reverse the bundled CSS documents in this half-open index range."),
  enableAnimations: z.boolean().default(false).describe("Enable CSS animations and transitions."),
  outputTimeTrace: z.boolean().default(false).describe("Return the render's virtual-time trace as its output."),
  outputStylesheetFiles: z.boolean().default(false).describe("Return the bundled stylesheet files as the render output.")
});
function getPlatformClass() {
  const alwaysUseMac = true;
  if (alwaysUseMac) {
    return "mac";
  } else {
    const ua = navigator.userAgent;
    if (ua.includes("Macintosh")) {
      return "mac";
    }
    if (ua.includes("Linux")) {
      return "linux";
    }
    return "windows";
  }
}
class FixtureLogService extends NullLogService {
  warn(message, ...args) {
    console.warn(message, ...args);
  }
  error(message, ...args) {
    console.error(message, ...args);
  }
  critical(message, ...args) {
    console.error(message, ...args);
  }
}
class FixtureModelService extends ModelService {
  dispose() {
    for (const model of this.getModels()) {
      if (!model.isDisposed()) {
        model.dispose();
      }
    }
    super.dispose();
  }
}
let FixtureTextModelService = class extends mock() {
  constructor(_modelService) {
    super();
    this._modelService = _modelService;
  }
  async createModelReference(resource) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      throw new Error(`FixtureTextModelService: no model registered for ${resource.toString()}`);
    }
    return {
      // eslint-disable-next-line local/code-no-dangerous-type-assertions
      object: { textEditorModel: model },
      dispose() {
      }
    };
  }
  registerTextModelContentProvider() {
    return { dispose() {
    } };
  }
  canHandleResource() {
    return false;
  }
};
FixtureTextModelService = __decorateClass([
  __decorateParam(0, IModelService)
], FixtureTextModelService);
function createEditorServices(disposables, options) {
  const services = new ServiceCollection();
  const serviceIdentifiers = [];
  const define = (id, ctor) => {
    if (!services.has(id)) {
      services.set(id, new SyncDescriptor(ctor));
    }
    serviceIdentifiers.push(id);
  };
  const defineInstance = (id, instance) => {
    if (!services.has(id)) {
      services.set(id, instance);
    }
    serviceIdentifiers.push(id);
  };
  const definePartialInstance = (id, instance) => {
    defineInstance(id, instance);
  };
  define(IAccessibilityService, TestAccessibilityService);
  define(IKeybindingService, MockKeybindingService);
  define(IClipboardService, TestClipboardService);
  define(IEditorWorkerService, TestEditorWorkerService);
  defineInstance(IOpenerService, NullOpenerService);
  define(INotificationService, TestNotificationService);
  define(IDialogService, TestDialogService);
  define(IUndoRedoService, UndoRedoService);
  define(ILanguageService, LanguageService);
  define(ILanguageConfigurationService, TestLanguageConfigurationService);
  define(IConfigurationService, TestConfigurationService);
  define(ITextResourcePropertiesService, TestTextResourcePropertiesService);
  defineInstance(IStorageService, new NullStorageService());
  if (options?.colorTheme) {
    defineInstance(IThemeService, new TestThemeService(options.colorTheme));
  } else {
    define(IThemeService, TestThemeService);
  }
  define(ILogService, FixtureLogService);
  define(IModelService, FixtureModelService);
  define(ICodeEditorService, TestCodeEditorService);
  define(IContextKeyService, MockContextKeyService);
  define(ICommandService, TestCommandService);
  define(ITelemetryService, NullTelemetryServiceShape);
  define(ILoggerService, NullLoggerService);
  define(IDataChannelService, NullDataChannelService);
  define(IEnvironmentService, class extends mock() {
    constructor() {
      super(...arguments);
      this.isBuilt = true;
      this.isExtensionDevelopment = false;
    }
  });
  define(ILanguageFeatureDebounceService, LanguageFeatureDebounceService);
  define(ILanguageFeaturesService, LanguageFeaturesService);
  define(ITreeSitterLibraryService, TestTreeSitterLibraryService);
  define(IInlineCompletionsService, InlineCompletionsService);
  defineInstance(ICodeLensCache, {
    _serviceBrand: void 0,
    put: () => {
    },
    get: () => void 0,
    delete: () => {
    }
  });
  defineInstance(IHoverService, {
    _serviceBrand: void 0,
    showDelayedHover: () => void 0,
    setupDelayedHover: () => ({ dispose: () => {
    } }),
    setupDelayedHoverAtMouse: () => ({ dispose: () => {
    } }),
    showInstantHover: () => void 0,
    hideHover: () => {
    },
    showAndFocusLastHover: () => {
    },
    setupManagedHover: () => ({ dispose: () => {
    }, show: () => {
    }, hide: () => {
    }, update: () => {
    } }),
    showManagedHover: () => {
    }
  });
  defineInstance(IDefaultAccountService, {
    _serviceBrand: void 0,
    onDidChangeDefaultAccount: new Emitter().event,
    onDidChangePolicyData: new Emitter().event,
    policyData: null,
    currentDefaultAccount: null,
    copilotTokenInfo: null,
    onDidChangeCopilotTokenInfo: new Emitter().event,
    managedSettingsFetchStatus: null,
    managedSettingsFetchedAt: null,
    managedSettingsRawResponse: null,
    managedSettingsCompatibilityError: null,
    onDidChangeManagedSettingsCompatibilityError: Event.None,
    getDefaultAccount: async () => null,
    getDefaultAccountAuthenticationProvider: () => ({ id: "test", name: "Test", scopes: [], enterprise: false }),
    resolveGitHubUrl: (path) => `https://github.com/${path}`,
    setDefaultAccountProvider: () => {
    },
    refresh: async () => null,
    signIn: async () => null,
    signOut: async () => {
    }
  });
  defineInstance(IUserInteractionService, new MockUserInteractionService(true, false));
  definePartialInstance(IActionWidgetService, {
    _serviceBrand: void 0,
    show: () => {
    },
    hide: () => {
    },
    get isVisible() {
      return false;
    }
  });
  defineInstance(IAccessibilitySignalService, {
    _serviceBrand: void 0,
    playSignal: async () => {
    },
    playSignals: async () => {
    },
    playSignalLoop: () => ({ dispose: () => {
    } }),
    getEnabledState: () => ({ value: false, onDidChange: Event.None, onChange: () => ({ dispose: () => {
    } }) }),
    getDelayMs: () => 0,
    playSound: async () => {
    },
    isSoundEnabled: () => false,
    isAnnouncementEnabled: () => false,
    onSoundEnabledChanged: () => Event.None
  });
  define(ITextModelService, FixtureTextModelService);
  defineInstance(IAgentFeedbackService, {
    _serviceBrand: void 0,
    onDidChangeFeedback: Event.None,
    onDidChangeNavigation: Event.None,
    onDidChangeFeedbackScope: Event.None,
    activeFeedbackSessionResource: constObservable(AGENT_FEEDBACK_NEW_SESSION_RESOURCE),
    onDidAddFeedback: Event.None,
    onDidConvertFeedback: Event.None,
    onDidAddReply: Event.None,
    onDidSubmitFeedback: Event.None,
    onDidRevealSessionComment: Event.None,
    addFeedback: () => void 0,
    removeFeedback: () => {
    },
    updateFeedback: () => {
    },
    acceptFeedback: () => {
    },
    addReply: () => {
    },
    getFeedback: () => [],
    hasLoadedFeedback: () => true,
    getSessionForFile: () => void 0,
    getFeedbackSessionResource: () => void 0,
    registerFeedbackResourceScope: () => toDisposable(() => {
    }),
    getMostRecentSessionForResource: () => void 0,
    revealFeedback: async () => {
    },
    revealSessionComment: async () => {
    },
    getNextFeedback: () => void 0,
    getNextNavigableItem: () => void 0,
    setNavigationAnchor: () => {
    },
    getNavigationBearing: () => ({ activeIdx: -1, totalCount: 0 }),
    clearFeedback: () => {
    },
    markFeedbackSubmitted: () => {
    },
    submitFeedback: async () => false,
    addFeedbackAndSubmit: async () => {
    },
    setFeedbackResolved: async () => {
    }
  });
  definePartialInstance(IChatEditingService, {
    _serviceBrand: void 0,
    editingSessionsObs: constObservable([]),
    startOrContinueGlobalEditingSession: () => void 0,
    getEditingSession: () => void 0
  });
  definePartialInstance(ISessionsManagementService, {
    _serviceBrand: void 0,
    getSession: () => void 0,
    getSessions: () => []
  });
  definePartialInstance(ISessionsService, {
    _serviceBrand: void 0,
    activeSession: constObservable(void 0)
  });
  definePartialInstance(ICodeReviewService, {
    _serviceBrand: void 0,
    getPRReviewState: () => constObservable({ kind: PRReviewStateKind.None }),
    resolvePRReviewThread: async () => {
    },
    markPRReviewCommentConverted: () => {
    }
  });
  options?.additionalServices?.({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    define: (id, ctor) => {
      services.set(id, new SyncDescriptor(ctor));
      serviceIdentifiers.push(id);
    },
    defineInstance: (id, instance) => {
      services.set(id, instance);
      serviceIdentifiers.push(id);
    },
    definePartialInstance: (id, instance) => {
      services.set(id, instance);
      serviceIdentifiers.push(id);
    }
  });
  const instantiationService = disposables.add(new TestInstantiationService(services, true, void 0, true));
  disposables.add(toDisposable(() => {
    for (const id of serviceIdentifiers) {
      const instanceOrDescriptor = services.get(id);
      if (typeof instanceOrDescriptor?.dispose === "function") {
        instanceOrDescriptor.dispose();
      }
    }
  }));
  return instantiationService;
}
function registerWorkbenchServices(registration) {
  registration.defineInstance(IContextMenuService, {
    showContextMenu: () => {
    },
    onDidShowContextMenu: () => ({ dispose: () => {
    } }),
    onDidHideContextMenu: () => ({ dispose: () => {
    } }),
    _serviceBrand: void 0
  });
  registration.defineInstance(IContextViewService, {
    showContextView: () => ({ close: () => {
    } }),
    hideContextView: () => {
    },
    getContextViewElement: () => {
      throw new Error("Not implemented");
    },
    layout: () => {
    },
    anchorAlignment: 0,
    _serviceBrand: void 0
  });
  registration.defineInstance(ILabelService, {
    getUriLabel: (uri) => uri.path,
    getUriBasenameLabel: (uri) => uri.path.split("/").pop() ?? "",
    getWorkspaceLabel: () => "",
    getHostLabel: () => "",
    getSeparator: () => "/",
    registerFormatter: () => ({ dispose: () => {
    } }),
    onDidChangeFormatters: () => ({ dispose: () => {
    } }),
    registerCachedFormatter: () => ({ dispose: () => {
    } }),
    _serviceBrand: void 0,
    getHostTooltip: () => ""
  });
  registration.define(IMenuService, TestMenuService);
  registration.define(IActionViewItemService, NullActionViewItemService);
  registration.defineInstance(IChatPhoneInputPresenter, {
    _serviceBrand: void 0,
    enabled: constObservable(false),
    showCombinedModeAndModelSheet: () => Promise.resolve(),
    setImpl: () => ({ dispose: () => {
    } })
  });
  registration.defineInstance(IWorkspaceTrustManagementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeTrust = Event.None;
      this.workspaceTrustInitialized = Promise.resolve();
    }
    isWorkspaceTrusted() {
      return true;
    }
  }());
  registration.defineInstance(IWorkspaceTrustRequestService, new class extends mock() {
    async requestWorkspaceTrust() {
      return true;
    }
  }());
  registration.defineInstance(IChatPasteTargetService, new ChatPasteTargetService());
}
function createTextModel(instantiationService, text, uri, languageId) {
  const modelService = instantiationService.get(IModelService);
  const languageService = instantiationService.get(ILanguageService);
  const languageSelection = languageId ? languageService.createById(languageId) : null;
  return modelService.createModel(text, languageSelection, uri);
}
function resolveLabels(labels) {
  const result = [];
  if (labels?.kind === "screenshot") {
    result.push(".screenshot");
  } else if (labels?.kind === "animated") {
    result.push("animated");
  }
  if (labels?.blocksCi) {
    result.push("blocks-ci");
  }
  if (labels?.flaky) {
    result.push("flaky");
  }
  return result;
}
class DisposableStackStore {
  constructor() {
    this._items = [];
    this._isDisposed = false;
  }
  add(item) {
    if (this._isDisposed) {
      item.dispose();
      console.warn("Adding to a disposed DisposableStackStore");
    } else {
      this._items.push(item);
    }
    return item;
  }
  dispose() {
    this._isDisposed = true;
    while (this._items.length > 0) {
      this._items.pop().dispose();
    }
  }
}
const realTimeApi = captureGlobalTimeApi();
const logOutsideTime = false;
if (logOutsideTime) {
  const loggingTimeApi = createLoggingTimeApi(realTimeApi, (name, stack, handler) => {
    const handlerStr = typeof handler === "function" ? handler.toString().slice(0, 500) : String(handler);
    console.warn(`[ComponentFixture] Real ${name} called outside of virtual time.
Handler: ${handlerStr}
Stack: ${stack}`);
  });
  pushGlobalTimeApi(loggingTimeApi);
}
let fixtureRenderCounter = 0;
function defineComponentFixture(options) {
  const createFixture = (themeVariant) => defineFixture({
    isolation: "none",
    displayMode: { type: "component" },
    background: themeVariant.background,
    inputSchema: fixtureInputSchema,
    inputControls: {
      reverseStylesheets: { placement: "toolbar", label: "Reverse Stylesheets" },
      enableAnimations: { placement: "toolbar", label: "Enable Animations" }
    },
    render: async (container, context) => {
      const disposableStore = new DisposableStore();
      const input = parseFixtureInput(context.input);
      const { label: themeLabel, theme, scopeThemingParticipants } = themeVariant;
      disposableStore.add(pushRandomOverwrite(42));
      const virtualTimeEnabled = (options.virtualTime?.enabled ?? true) && context.host.kind !== "explorer-ui";
      const leakDetectionEnabled = context.host.kind !== "explorer-ui";
      if (leakDetectionEnabled) {
        ModifierKeyEmitter.getInstance();
      }
      const tracker = leakDetectionEnabled ? new DisposableTracker() : void 0;
      if (tracker) {
        setDisposableTracker(tracker);
      }
      const clock = new VirtualClock((/* @__PURE__ */ new Date("2026-05-14T12:00:00Z")).getTime());
      const p = new VirtualTimeProcessor(
        clock,
        drainMicrotasksEmbedding(realTimeApi),
        realTimeApi,
        { defaultMaxEvents: 100 }
      );
      const virtualTimeApi = createVirtualTimeApi(clock, { fakeRequestAnimationFrame: true });
      const teardownDrainMs = options.virtualTime?.teardownDrainMs ?? 1100;
      context.addDisposable({
        dispose: async () => {
          let teardownTimeApi;
          if (virtualTimeEnabled) {
            teardownTimeApi = pushGlobalTimeApi(virtualTimeApi);
          }
          try {
            disposableStore.dispose();
          } catch (e) {
            console.error(`[ComponentFixture] error disposing fixture: ${e instanceof Error ? e.stack : e}`);
          }
          if (virtualTimeEnabled) {
            try {
              await p.run({
                until: untilTime(clock.now + teardownDrainMs),
                maxEvents: 1e3,
                maxTraceDepth: 5
              });
            } catch (e) {
              console.error(`[ComponentFixture] error draining virtual time during teardown: ${e instanceof Error ? e.stack : e}`);
            }
          }
          teardownTimeApi?.dispose();
          p.dispose();
          if (tracker) {
            setDisposableTracker(null);
            const result = tracker.computeLeakingDisposables();
            if (result) {
              throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`);
            }
          }
        }
      });
      async function actualRender() {
        await setupTheme(container, theme, scopeThemingParticipants);
        const stylesheetOrderOverride = disposableStore.add(new MutableDisposable());
        const updateStylesheetOrder = (input2) => {
          const option = getReverseStylesheetsOption(input2);
          stylesheetOrderOverride.clear();
          if (option !== false) {
            stylesheetOrderOverride.value = overrideStylesheetOrder(option);
          }
        };
        context.watchInput("reverseStylesheets", (_value, input2) => updateStylesheetOrder(input2));
        context.watchInput("reverseStylesheetsRange", (_value, input2) => updateStylesheetOrder(input2));
        context.watchInput("enableAnimations", (value) => {
          container.classList.toggle("disable-animations", !value);
        });
        let renderTimeApi;
        if (virtualTimeEnabled) {
          renderTimeApi = pushGlobalTimeApi(virtualTimeApi);
          disposableStore.add(installFakeRunWhenIdle((_targetWindow, callback, _timeout) => {
            const stackTrace = new Error().stack;
            const trace = TraceContext.instance.currentTrace().child("runWhenIdle", stackTrace);
            return clock.schedule({
              time: clock.now,
              run: () => {
                const deadline = {
                  didTimeout: true,
                  timeRemaining: () => 50
                };
                callback(deadline);
              },
              source: {
                toString() {
                  return "runWhenIdle";
                },
                stackTrace
              },
              trace
            });
          }));
        }
        try {
          const disposableStackStore = disposableStore.add(new DisposableStackStore());
          const result = options.render({ container, disposableStore, disposableStackStore, theme });
          const p2 = virtualTimeEnabled ? p.run({
            until: untilTime(clock.now + (options.virtualTime?.durationMs ?? 1e3)),
            maxEvents: 200,
            maxTraceDepth: 5
          }) : Promise.resolve();
          await Promise.all([
            result instanceof Promise ? result : Promise.resolve(),
            p2
          ]);
        } catch (e) {
          if (virtualTimeEnabled && p.history.length > 0) {
            const startTime = p.history[0].time;
            const history = buildHistoryFromTasks(p.history, startTime);
            console.error(`[ComponentFixture] ${themeLabel} virtual-time history (${p.history.length} tasks):
${renderSwimlanes(history)}`);
          }
          throw e;
        } finally {
          renderTimeApi?.dispose();
        }
      }
      const fixtureRoot = createTraceRoot(`render#${++fixtureRenderCounter}(${themeLabel})`);
      await TraceContext.instance.runAsHandler(fixtureRoot, actualRender, {
        // Trace-reset escapes virtual time so it actually fires.
        afterMicrotaskClosure: (cb) => nextMacrotask(realTimeApi, cb)
      });
      if (input.outputTimeTrace && virtualTimeEnabled && p.history.length > 0) {
        const startTime = p.history[0].time;
        const history = buildHistoryFromTasks(p.history, startTime);
        return { output: renderSwimlanes(history) };
      }
      if (input.outputStylesheetFiles) {
        return { output: { stylesheetFiles: await getStylesheetDocumentFiles() } };
      }
      return void 0;
    }
  });
  const labels = resolveLabels(options.labels);
  const additionalFixtures = Object.fromEntries((options.additionalThemes ?? []).map((additionalTheme) => {
    const themeVariant = additionalThemeVariants[additionalTheme];
    return [themeVariant.label, createFixture(themeVariant)];
  }));
  return defineFixtureVariants(labels.length > 0 ? { labels } : {}, {
    Dark: createFixture(darkThemeVariant),
    Light: createFixture(lightThemeVariant),
    ...additionalFixtures
  });
}
function defineThemedFixtureGroup(optionsOrFixtures, fixtures) {
  if (fixtures) {
    const options = optionsOrFixtures;
    return defineFixtureGroup({
      labels: resolveLabels(options.labels),
      path: options.path
    }, fixtures);
  }
  return defineFixtureGroup(optionsOrFixtures);
}
export {
  DisposableStackStore,
  FixtureLogService,
  FixtureModelService,
  FixtureTextModelService,
  createEditorServices,
  createTextModel,
  darkTheme,
  defineComponentFixture,
  defineThemedFixtureGroup,
  lightTheme,
  registerWorkbenchServices,
  setupTheme
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxmaXh0dXJlVXRpbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBUaGlzIHNob3VsZCBiZSB0aGUgb25seSBwbGFjZSB0aGF0IGlzIGFsbG93ZWQgdG8gaW1wb3J0IGZyb20gQHZzY29kZS9jb21wb25lbnQtZXhwbG9yZXJcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgZGVmaW5lRml4dHVyZSwgZGVmaW5lRml4dHVyZUdyb3VwLCBkZWZpbmVGaXh0dXJlVmFyaWFudHMgfSBmcm9tICdAdnNjb2RlL2NvbXBvbmVudC1leHBsb3Jlcic7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnMsIGxvY2FsL2NvZGUtYW1kLW5vZGUtbW9kdWxlXG5pbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZVRyYWNrZXIsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCBNdXRhYmxlRGlzcG9zYWJsZSwgc2V0RGlzcG9zYWJsZVRyYWNrZXIsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTW9kaWZpZXJLZXlFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vLi4vYnVpbGQvdml0ZS9zdHlsZS5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi9icm93c2VyL21lZGlhL3N0eWxlLmNzcyc7XG4vLyBJbXBvcnQgYXV4aWxpYXJ5QmFyUGFydC5jc3MgaGVyZSAoYmVmb3JlIGFueSBjb250cmliL2NoYXQgQ1NTKSBzbyB0aGUgY2FzY2FkZVxuLy8gbWF0Y2hlcyB0aGUgcHJvZHVjdDogY2hhdC5jc3MgbG9hZHMgbGF0ZXIgYW5kIG92ZXJyaWRlcyB0aGUgYXV4aWxpYXJ5YmFyXG4vLyBydWxlcyB3aGVyZSBhcHBsaWNhYmxlLiBGaXh0dXJlcyB0aGF0IHdyYXAgY29udGVudCBpbiBgLnBhcnQuYXV4aWxpYXJ5YmFyYFxuLy8gcmVseSBvbiB0aGVzZSBydWxlcyB0byByZWNvbG9yIGlubGluZSBlZGl0b3JzIHdpdGggYC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZGAuXG5pbXBvcnQgJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvYXV4aWxpYXJ5YmFyL21lZGlhL2F1eGlsaWFyeUJhclBhcnQuY3NzJztcblxuLy8gVGhlbWVcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlc291cmNlTG9hZGVyL2NvbW1vbi9leHRlbnNpb25SZXNvdXJjZUxvYWRlci5qcyc7XG5pbXBvcnQgeyBUaGVtZVR5cGVTZWxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29sb3JUaGVtZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yVGhlbWVEYXRhLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVHbG9iYWxTdHlsZXNJbnN0YWxsZWQsIGdldFN0eWxlc2hlZXREb2N1bWVudEZpbGVzLCBvdmVycmlkZVN0eWxlc2hlZXRPcmRlciwgUmV2ZXJzZVN0eWxlc2hlZXRzT3B0aW9uIH0gZnJvbSAnLi9maXh0dXJlVXRpbHNDc3MuanMnO1xuXG4vLyBJbnN0YW50aWF0aW9uXG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcblxuLy8gVGVzdCBzZXJ2aWNlIGltcGxlbWVudGF0aW9uc1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UsIElubGluZUNvbXBsZXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2lubGluZUNvbXBsZXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVNpdHRlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVMZW5zQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlbGVucy9icm93c2VyL2NvZGVMZW5zQ2FjaGUuanMnO1xuaW1wb3J0IHsgVGVzdENvZGVFZGl0b3JTZXJ2aWNlLCBUZXN0Q29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9icm93c2VyL2VkaXRvclRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0RWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXN0RWRpdG9yV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvdGVzdC9jb21tb24vdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsIE51bGxBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UGhvbmVJbnB1dFByZXNlbnRlciB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRQYXN0ZVRhcmdldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC90ZXN0L2NvbW1vbi90ZXN0Q2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSURhdGFDaGFubmVsU2VydmljZSwgTnVsbERhdGFDaGFubmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0RGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvdGVzdC9jb21tb24vdGVzdERpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UsIE1vY2tLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UsIElMb2dTZXJ2aWNlLCBOdWxsTG9nZ2VyU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTnVsbE9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvdGVzdC9jb21tb24vbnVsbE9wZW5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQsIElBcHBsaWNhdGlvblN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBJU3RvcmFnZUVudHJ5LCBJU3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlVGFyZ2V0Q2hhbmdlRXZlbnQsIElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCwgSVdpbGxTYXZlU3RhdGVFdmVudCwgSVdvcmtzcGFjZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSwgTW9ja1VzZXJJbnRlcmFjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVzdE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSwgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UsIFBSUmV2aWV3U3RhdGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5cbi8vIEVkaXRvclxuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuXG5pbXBvcnQgJy4vZml4dHVyZXMuY3NzJztcblxuLy8gSW1wb3J0IGNvbG9yIHJlZ2lzdHJhdGlvbnMgdG8gZW5zdXJlIGNvbG9ycyBhcmUgYXZhaWxhYmxlXG5pbXBvcnQgeyBJZGxlRGVhZGxpbmUsIGluc3RhbGxGYWtlUnVuV2hlbklkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBidWlsZEhpc3RvcnlGcm9tVGFza3MsIHJlbmRlclN3aW1sYW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vZXhlY3V0aW9uR3JhcGguanMnO1xuaW1wb3J0IHsgcHVzaFJhbmRvbU92ZXJ3cml0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vcmFuZG9tT3ZlcndyaXRlLmpzJztcbmltcG9ydCB7XG5cdGNhcHR1cmVHbG9iYWxUaW1lQXBpLFxuXHRjcmVhdGVMb2dnaW5nVGltZUFwaSxcblx0Y3JlYXRlVHJhY2VSb290LFxuXHRjcmVhdGVWaXJ0dWFsVGltZUFwaSxcblx0ZHJhaW5NaWNyb3Rhc2tzRW1iZWRkaW5nLFxuXHRuZXh0TWFjcm90YXNrLFxuXHRwdXNoR2xvYmFsVGltZUFwaSxcblx0VHJhY2VDb250ZXh0LFxuXHR1bnRpbFRpbWUsXG5cdFZpcnR1YWxDbG9jayxcblx0VmlydHVhbFRpbWVQcm9jZXNzb3IsXG59IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdmlydHVhbFNjaGVkdWxpbmcvaW5kZXguanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2Jhc2VDb2xvcnMuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2VkaXRvckNvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvbGlzdENvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvbWlzY0NvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHNvdXJjZU1hcFN1cHBvcnQgZnJvbSAnc291cmNlLW1hcC1zdXBwb3J0JztcbnNvdXJjZU1hcFN1cHBvcnQuaW5zdGFsbCh7XG5cdGVudmlyb25tZW50OiAnYnJvd3NlcicsXG5cdGhhbmRsZVVuY2F1Z2h0RXhjZXB0aW9uczogZmFsc2UsXG5cdHJldHJpZXZlU291cmNlTWFwOiAoc291cmNlOiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBtYXBVcmwgPSBzb3VyY2UgKyAnLm1hcCc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdFx0eGhyLm9wZW4oJ0dFVCcsIG1hcFVybCwgZmFsc2UpO1xuXHRcdFx0eGhyLnNlbmQoKTtcblx0XHRcdGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcblx0XHRcdFx0cmV0dXJuIHsgdXJsOiBudWxsIGFzIG5ldmVyLCBtYXA6IHhoci5yZXNwb25zZVRleHQgfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHsgfVxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxufSk7XG5cbi8qKlxuICogQSBzdG9yYWdlIHNlcnZpY2UgdGhhdCBuZXZlciBzdG9yZXMgYW55dGhpbmcgYW5kIGFsd2F5cyByZXR1cm5zIHRoZSBkZWZhdWx0L2ZhbGxiYWNrIHZhbHVlLlxuICogVGhpcyBpcyB1c2VmdWwgZm9yIGZpeHR1cmVzIHdoZXJlIHdlIHdhbnQgY29uc2lzdGVudCBiZWhhdmlvciB3aXRob3V0IHBlcnNpc3RlZCBzdGF0ZS5cbiAqL1xuY2xhc3MgTnVsbFN0b3JhZ2VTZXJ2aWNlIGltcGxlbWVudHMgSVN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZhbHVlID0gbmV3IEVtaXR0ZXI8SVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50PigpO1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SVdvcmtzcGFjZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZXZlbnQsIGUgPT4gZS5zY29wZSA9PT0gc2NvcGUgJiYgKGtleSA9PT0gdW5kZWZpbmVkIHx8IGUua2V5ID09PSBrZXkpLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGFyZ2V0ID0gbmV3IEVtaXR0ZXI8SVN0b3JhZ2VUYXJnZXRDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUYXJnZXQ6IEV2ZW50PElTdG9yYWdlVGFyZ2V0Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VUYXJnZXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2F2ZVN0YXRlID0gbmV3IEVtaXR0ZXI8SVdpbGxTYXZlU3RhdGVFdmVudD4oKTtcblx0cmVhZG9ubHkgb25XaWxsU2F2ZVN0YXRlOiBFdmVudDxJV2lsbFNhdmVTdGF0ZUV2ZW50PiA9IHRoaXMuX29uV2lsbFNhdmVTdGF0ZS5ldmVudDtcblxuXHRnZXQoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IHN0cmluZyk6IHN0cmluZztcblx0Z2V0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQoX2tleTogc3RyaW5nLCBfc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRnZXRCb29sZWFuKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlOiBib29sZWFuKTogYm9vbGVhbjtcblx0Z2V0Qm9vbGVhbihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IGJvb2xlYW4pOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRnZXRCb29sZWFuKF9rZXk6IHN0cmluZywgX3Njb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBib29sZWFuKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0TnVtYmVyKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRnZXROdW1iZXIoX2tleTogc3RyaW5nLCBfc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRnZXRPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IFQpOiBUO1xuXHRnZXRPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZDtcblx0Z2V0T2JqZWN0PFQgZXh0ZW5kcyBvYmplY3Q+KF9rZXk6IHN0cmluZywgX3Njb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRzdG9yZShfa2V5OiBzdHJpbmcsIF92YWx1ZTogc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciB8IHVuZGVmaW5lZCB8IG51bGwsIF9zY29wZTogU3RvcmFnZVNjb3BlLCBfdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0KTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdHN0b3JlQWxsKF9lbnRyaWVzOiBJU3RvcmFnZUVudHJ5W10sIF9leHRlcm5hbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHRyZW1vdmUoX2tleTogc3RyaW5nLCBfc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHRpc05ldyhfc2NvcGU6IFN0b3JhZ2VTY29wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Zmx1c2goX3JlYXNvbj86IFdpbGxTYXZlU3RhdGVSZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRvcHRpbWl6ZShfc2NvcGU6IFN0b3JhZ2VTY29wZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGxvZygpOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0a2V5cyhfc2NvcGU6IFN0b3JhZ2VTY29wZSwgX3RhcmdldDogU3RvcmFnZVRhcmdldCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRzd2l0Y2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0aGFzU2NvcGUoX3Njb3BlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUaGVtZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gRWFnZXJseSBidW5kbGUgYWxsIGJ1aWx0LWluIHRoZW1lIEpTT04gZmlsZXMgc28gdGhleSBjYW4gYmUgc2VydmVkIHRvXG4vLyBgX2xvYWRDb2xvclRoZW1lYCB2aWEgdGhlIElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgY29kZSBwYXRoLiBUaGVcbi8vIHJzcGFjayBjb25maWcgbWFwcyB0aGVzZSBKU09OIGZpbGVzIHRvIGBhc3NldC9zb3VyY2VgLCBzbyB0aGV5IGFyZSBpbXBvcnRlZFxuLy8gYXMgcmF3IHRleHQgKG5vdCBwYXJzZWQgSlNPTikgXHUyMDE0IHRoaXMgbGV0cyBWUyBDb2RlJ3MgSlNPTkMgcGFyc2VyIGhhbmRsZVxuLy8gY29tbWVudHMgYW5kIHRyYWlsaW5nIGNvbW1hcyB0aGUgd2F5IGl0IGRvZXMgaW4gdGhlIHJlYWwgcHJvZHVjdC5cbi8qIGVzbGludC1kaXNhYmxlIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zICovXG5pbXBvcnQgZGFya19tb2Rlcm4gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvZGFya19tb2Rlcm4uanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGRhcmtfcGx1cyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9kYXJrX3BsdXMuanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGRhcmtfdnMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvZGFya192cy5qc29uJyB3aXRoIHsgdHlwZTogJ2pzb24nIH07XG5pbXBvcnQgaGNfYmxhY2sgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvaGNfYmxhY2suanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGxpZ2h0X21vZGVybiBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9saWdodF9tb2Rlcm4uanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGxpZ2h0X3BsdXMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvbGlnaHRfcGx1cy5qc29uJyB3aXRoIHsgdHlwZTogJ2pzb24nIH07XG5pbXBvcnQgbGlnaHRfdnMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvbGlnaHRfdnMuanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuLyogZXNsaW50LWVuYWJsZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJucyAqL1xuXG5jb25zdCB0aGVtZUpzb25Nb2R1bGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2RhcmtfbW9kZXJuLmpzb24nOiBkYXJrX21vZGVybiBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9kYXJrX3BsdXMuanNvbic6IGRhcmtfcGx1cyBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9kYXJrX3ZzLmpzb24nOiBkYXJrX3ZzIGFzIHVua25vd24gYXMgc3RyaW5nLFxuXHQnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2hjX2JsYWNrLmpzb24nOiBoY19ibGFjayBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9saWdodF9tb2Rlcm4uanNvbic6IGxpZ2h0X21vZGVybiBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9saWdodF9wbHVzLmpzb24nOiBsaWdodF9wbHVzIGFzIHVua25vd24gYXMgc3RyaW5nLFxuXHQnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2xpZ2h0X3ZzLmpzb24nOiBsaWdodF92cyBhcyB1bmtub3duIGFzIHN0cmluZyxcbn07XG5cbmNvbnN0IGZpeHR1cmVFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGFzeW5jIHJlYWRFeHRlbnNpb25SZXNvdXJjZSh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IHRoZW1lSnNvbk1vZHVsZXNbdXJpLnBhdGhdO1xuXHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRml4dHVyZSBleHRlbnNpb24gcmVzb3VyY2Ugbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXHRzdXBwb3J0c0V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpOyB9XG5cdGlzRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTsgfVxuXHRnZXRFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG59O1xuXG5mdW5jdGlvbiBjcmVhdGVCdWlsdEluVGhlbWUodGhlbWVQYXRoOiBzdHJpbmcsIHVpVGhlbWU6IFRoZW1lVHlwZVNlbGVjdG9yKTogQ29sb3JUaGVtZURhdGEge1xuXHRjb25zdCBsb2NhdGlvbiA9IFVSSS5wYXJzZShgZmlsZTovLyR7dGhlbWVQYXRofWApO1xuXHRyZXR1cm4gQ29sb3JUaGVtZURhdGEuZnJvbUV4dGVuc2lvblRoZW1lKFxuXHRcdHsgaWQ6IHRoZW1lUGF0aCwgcGF0aDogdGhlbWVQYXRoLCB1aVRoZW1lLCBfd2F0Y2g6IGZhbHNlIH0sXG5cdFx0bG9jYXRpb24sXG5cdFx0RXh0ZW5zaW9uRGF0YS5mcm9tTmFtZSgndnNjb2RlJywgJ3RoZW1lLWRlZmF1bHRzJywgdHJ1ZSlcblx0KTtcbn1cblxuZXhwb3J0IGNvbnN0IGRhcmtUaGVtZSA9IGNyZWF0ZUJ1aWx0SW5UaGVtZSgnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2RhcmtfbW9kZXJuLmpzb24nLCBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLKTtcbmV4cG9ydCBjb25zdCBsaWdodFRoZW1lID0gY3JlYXRlQnVpbHRJblRoZW1lKCcvZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvbGlnaHRfbW9kZXJuLmpzb24nLCBUaGVtZVR5cGVTZWxlY3Rvci5WUyk7XG5jb25zdCBkYXJrSGlnaENvbnRyYXN0VGhlbWUgPSBjcmVhdGVCdWlsdEluVGhlbWUoJy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9oY19ibGFjay5qc29uJywgVGhlbWVUeXBlU2VsZWN0b3IuSENfQkxBQ0spO1xuXG50eXBlIENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQgPSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJhY2tncm91bmQ6ICdkYXJrJyB8ICdsaWdodCc7XG5cdHJlYWRvbmx5IHRoZW1lOiBDb2xvclRoZW1lRGF0YTtcblx0cmVhZG9ubHkgc2NvcGVUaGVtaW5nUGFydGljaXBhbnRzOiBib29sZWFuO1xufTtcbnR5cGUgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZVZhcmlhbnQgPSBDb21wb25lbnRGaXh0dXJlVGhlbWVWYXJpYW50ICYgeyByZWFkb25seSBzY29wZVRoZW1pbmdQYXJ0aWNpcGFudHM6IHRydWUgfTtcblxuY29uc3QgZGFya1RoZW1lVmFyaWFudCA9IHsgbGFiZWw6ICdEYXJrJywgYmFja2dyb3VuZDogJ2RhcmsnLCB0aGVtZTogZGFya1RoZW1lLCBzY29wZVRoZW1pbmdQYXJ0aWNpcGFudHM6IGZhbHNlIH0gYXMgY29uc3Qgc2F0aXNmaWVzIENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQ7XG5jb25zdCBsaWdodFRoZW1lVmFyaWFudCA9IHsgbGFiZWw6ICdMaWdodCcsIGJhY2tncm91bmQ6ICdsaWdodCcsIHRoZW1lOiBsaWdodFRoZW1lLCBzY29wZVRoZW1pbmdQYXJ0aWNpcGFudHM6IGZhbHNlIH0gYXMgY29uc3Qgc2F0aXNmaWVzIENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQ7XG5jb25zdCBhZGRpdGlvbmFsVGhlbWVWYXJpYW50cyA9IHtcblx0ZGFya0hpZ2hDb250cmFzdDogeyBsYWJlbDogJ0RhcmtIaWdoQ29udHJhc3QnLCBiYWNrZ3JvdW5kOiAnZGFyaycsIHRoZW1lOiBkYXJrSGlnaENvbnRyYXN0VGhlbWUsIHNjb3BlVGhlbWluZ1BhcnRpY2lwYW50czogdHJ1ZSB9LFxufSBhcyBjb25zdCBzYXRpc2ZpZXMgUmVjb3JkPHN0cmluZywgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZVZhcmlhbnQ+O1xuZXhwb3J0IHR5cGUgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZSA9IGtleW9mIHR5cGVvZiBhZGRpdGlvbmFsVGhlbWVWYXJpYW50cztcblxuY29uc3QgdGhlbWVMb2FkZWRQcm9taXNlcyA9IG5ldyBXZWFrTWFwPENvbG9yVGhlbWVEYXRhLCBQcm9taXNlPHZvaWQ+PigpO1xuZnVuY3Rpb24gZW5zdXJlVGhlbWVMb2FkZWQodGhlbWU6IENvbG9yVGhlbWVEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdGxldCB0aGVtZUxvYWRlZFByb21pc2UgPSB0aGVtZUxvYWRlZFByb21pc2VzLmdldCh0aGVtZSk7XG5cdGlmICghdGhlbWVMb2FkZWRQcm9taXNlKSB7XG5cdFx0dGhlbWVMb2FkZWRQcm9taXNlID0gdGhlbWUuZW5zdXJlTG9hZGVkKGZpeHR1cmVFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpO1xuXHRcdHRoZW1lTG9hZGVkUHJvbWlzZXMuc2V0KHRoZW1lLCB0aGVtZUxvYWRlZFByb21pc2UpO1xuXHR9XG5cdHJldHVybiB0aGVtZUxvYWRlZFByb21pc2U7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXR1cFRoZW1lKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRoZW1lOiBDb2xvclRoZW1lRGF0YSwgc2NvcGVUaGVtaW5nUGFydGljaXBhbnRzID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgZW5zdXJlVGhlbWVMb2FkZWQodGhlbWUpO1xuXHRhd2FpdCBlbnN1cmVHbG9iYWxTdHlsZXNJbnN0YWxsZWQodGhlbWUsIHNjb3BlVGhlbWluZ1BhcnRpY2lwYW50cyk7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjb21wb25lbnQtZml4dHVyZScsICdtb25hY28td29ya2JlbmNoJywgZ2V0UGxhdGZvcm1DbGFzcygpLCAnZGlzYWJsZS1hbmltYXRpb25zJywgLi4udGhlbWUuY2xhc3NOYW1lcyk7XG59XG5cbi8qKlxuICogVGhlIHJlY29nbml6ZWQgZmllbGRzIG9mIHRoZSBwZXItcmVuZGVyIGBpbnB1dGAgKHBhc3NlZCB2aWEgdGhlIENMSSBgLS1pbnB1dGBcbiAqIGZsYWcpLCBwYXJzZWQgb25jZSBpbnRvIGEgdHlwZWQgc2hhcGUgYnkge0BsaW5rIHBhcnNlRml4dHVyZUlucHV0fS5cbiAqL1xuaW50ZXJmYWNlIEZpeHR1cmVSZW5kZXJJbnB1dCB7XG5cdC8qKiBXaGV0aGVyIGFsbCBzdHlsZXNoZWV0IGRvY3VtZW50cyBzaG91bGQgYmUgcmV2ZXJzZWQuICovXG5cdHJlYWRvbmx5IHJldmVyc2VTdHlsZXNoZWV0czogYm9vbGVhbjtcblx0LyoqIFRoZSBzdHlsZXNoZWV0IGRvY3VtZW50IHJhbmdlIHRvIHJldmVyc2UsIHdoZW4gc2V0LiAqL1xuXHRyZWFkb25seSByZXZlcnNlU3R5bGVzaGVldHNSYW5nZTogRXhjbHVkZTxSZXZlcnNlU3R5bGVzaGVldHNPcHRpb24sIGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciBDU1MgYW5pbWF0aW9ucyBhbmQgdHJhbnNpdGlvbnMgYXJlIGVuYWJsZWQuICovXG5cdHJlYWRvbmx5IGVuYWJsZUFuaW1hdGlvbnM6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSByZW5kZXIgc2hvdWxkIHJldHVybiBpdHMgdmlydHVhbC10aW1lIHRyYWNlIGFzIGBvdXRwdXRgLiAqL1xuXHRyZWFkb25seSBvdXRwdXRUaW1lVHJhY2U6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSByZW5kZXIgc2hvdWxkIHJldHVybiB0aGUgYnVuZGxlZCBzdHlsZXNoZWV0IGZpbGVzIGFzIGBvdXRwdXRgLiAqL1xuXHRyZWFkb25seSBvdXRwdXRTdHlsZXNoZWV0RmlsZXM6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUGFyc2VzIHRoZSB1bnR5cGVkIHJlbmRlciBgaW5wdXRgIGludG8gdGhlIHJlY29nbml6ZWQge0BsaW5rIEZpeHR1cmVSZW5kZXJJbnB1dH1cbiAqIGZpZWxkcy4gVW5rbm93bi9leHRyYSBmaWVsZHMgYXJlIGlnbm9yZWQ7IG1pc3NpbmcgZmllbGRzIGRlZmF1bHQgdG8gb2ZmLlxuICovXG5mdW5jdGlvbiBwYXJzZUZpeHR1cmVJbnB1dChpbnB1dDogdW5rbm93bik6IEZpeHR1cmVSZW5kZXJJbnB1dCB7XG5cdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB7IHJldmVyc2VTdHlsZXNoZWV0czogZmFsc2UsIHJldmVyc2VTdHlsZXNoZWV0c1JhbmdlOiB1bmRlZmluZWQsIGVuYWJsZUFuaW1hdGlvbnM6IGZhbHNlLCBvdXRwdXRUaW1lVHJhY2U6IGZhbHNlLCBvdXRwdXRTdHlsZXNoZWV0RmlsZXM6IGZhbHNlIH07XG5cdH1cblx0Y29uc3QgcmVjb3JkID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdHJldHVybiB7XG5cdFx0cmV2ZXJzZVN0eWxlc2hlZXRzOiByZWNvcmQucmV2ZXJzZVN0eWxlc2hlZXRzID09PSB0cnVlLFxuXHRcdHJldmVyc2VTdHlsZXNoZWV0c1JhbmdlOiBwYXJzZVJldmVyc2VTdHlsZXNoZWV0c1JhbmdlKHJlY29yZC5yZXZlcnNlU3R5bGVzaGVldHNSYW5nZSksXG5cdFx0ZW5hYmxlQW5pbWF0aW9uczogcmVjb3JkLmVuYWJsZUFuaW1hdGlvbnMgPT09IHRydWUsXG5cdFx0b3V0cHV0VGltZVRyYWNlOiAhIXJlY29yZC5vdXRwdXRUaW1lVHJhY2UsXG5cdFx0b3V0cHV0U3R5bGVzaGVldEZpbGVzOiAhIXJlY29yZC5vdXRwdXRTdHlsZXNoZWV0RmlsZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlUmV2ZXJzZVN0eWxlc2hlZXRzUmFuZ2UodmFsdWU6IHVua25vd24pOiBFeGNsdWRlPFJldmVyc2VTdHlsZXNoZWV0c09wdGlvbiwgYm9vbGVhbj4gfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdGNvbnN0IHJhbmdlID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0aWYgKHR5cGVvZiByYW5nZS5mcm9tSW5kZXggPT09ICdudW1iZXInICYmIHR5cGVvZiByYW5nZS50b0luZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHsgZnJvbUluZGV4OiByYW5nZS5mcm9tSW5kZXgsIHRvSW5kZXg6IHJhbmdlLnRvSW5kZXggfTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0UmV2ZXJzZVN0eWxlc2hlZXRzT3B0aW9uKGlucHV0OiB1bmtub3duKTogUmV2ZXJzZVN0eWxlc2hlZXRzT3B0aW9uIHtcblx0Y29uc3QgcGFyc2VkSW5wdXQgPSBwYXJzZUZpeHR1cmVJbnB1dChpbnB1dCk7XG5cdHJldHVybiBwYXJzZWRJbnB1dC5yZXZlcnNlU3R5bGVzaGVldHNSYW5nZSA/PyBwYXJzZWRJbnB1dC5yZXZlcnNlU3R5bGVzaGVldHM7XG59XG5cbi8qKiBJbnB1dHMgZXhwb3NlZCBhcyBDb21wb25lbnQgRXhwbG9yZXIgY29udHJvbHMuICovXG5jb25zdCBmaXh0dXJlSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG5cdHJldmVyc2VTdHlsZXNoZWV0czogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JldmVyc2UgdGhlIG9yZGVyIG9mIHRoZSBidW5kbGVkIENTUyBkb2N1bWVudHMgdG8gc3VyZmFjZSBjYXNjYWRlLW9yZGVyIGRlcGVuZGVuY2llcy4nKSxcblx0cmV2ZXJzZVN0eWxlc2hlZXRzUmFuZ2U6IHoub2JqZWN0KHtcblx0XHRmcm9tSW5kZXg6IHoubnVtYmVyKCksXG5cdFx0dG9JbmRleDogei5udW1iZXIoKSxcblx0fSkub3B0aW9uYWwoKS5kZXNjcmliZSgnUmV2ZXJzZSB0aGUgYnVuZGxlZCBDU1MgZG9jdW1lbnRzIGluIHRoaXMgaGFsZi1vcGVuIGluZGV4IHJhbmdlLicpLFxuXHRlbmFibGVBbmltYXRpb25zOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW5hYmxlIENTUyBhbmltYXRpb25zIGFuZCB0cmFuc2l0aW9ucy4nKSxcblx0b3V0cHV0VGltZVRyYWNlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmV0dXJuIHRoZSByZW5kZXJcXCdzIHZpcnR1YWwtdGltZSB0cmFjZSBhcyBpdHMgb3V0cHV0LicpLFxuXHRvdXRwdXRTdHlsZXNoZWV0RmlsZXM6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXR1cm4gdGhlIGJ1bmRsZWQgc3R5bGVzaGVldCBmaWxlcyBhcyB0aGUgcmVuZGVyIG91dHB1dC4nKSxcbn0pO1xuXG5mdW5jdGlvbiBnZXRQbGF0Zm9ybUNsYXNzKCk6IHN0cmluZyB7XG5cdGNvbnN0IGFsd2F5c1VzZU1hYyA9IHRydWU7XG5cdGlmIChhbHdheXNVc2VNYWMpIHtcblx0XHRyZXR1cm4gJ21hYyc7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuXHRcdGlmICh1YS5pbmNsdWRlcygnTWFjaW50b3NoJykpIHtcblx0XHRcdHJldHVybiAnbWFjJztcblx0XHR9XG5cdFx0aWYgKHVhLmluY2x1ZGVzKCdMaW51eCcpKSB7XG5cdFx0XHRyZXR1cm4gJ2xpbnV4Jztcblx0XHR9XG5cdFx0cmV0dXJuICd3aW5kb3dzJztcblx0fVxufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNlcnZpY2VzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmljZVJlZ2lzdHJhdGlvbiB7XG5cdGRlZmluZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGN0b3I6IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gVCk6IHZvaWQ7XG5cdGRlZmluZUluc3RhbmNlPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFQpOiB2b2lkO1xuXHQvKiogTGlrZSBkZWZpbmVJbnN0YW5jZSBidXQgYWNjZXB0cyBhIHBhcnRpYWwgbW9jayAtIHByb3ZpZGVzIHR5cGUgY2hlY2tpbmcgb24gcHJvdmlkZWQgcHJvcGVydGllcyAqL1xuXHRkZWZpbmVQYXJ0aWFsSW5zdGFuY2U8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBpbnN0YW5jZTogUGFydGlhbDxUPik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3JlYXRlU2VydmljZXNPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBjb2xvciB0aGVtZSB0byB1c2UgZm9yIHRoZSB0aGVtZSBzZXJ2aWNlLlxuXHQgKi9cblx0Y29sb3JUaGVtZT86IElDb2xvclRoZW1lO1xuXHQvKipcblx0ICogQWRkaXRpb25hbCBzZXJ2aWNlcyB0byByZWdpc3RlciBhZnRlciB0aGUgYmFzZSBlZGl0b3Igc2VydmljZXMuXG5cdCAqL1xuXHRhZGRpdGlvbmFsU2VydmljZXM/OiAocmVnaXN0cmF0aW9uOiBTZXJ2aWNlUmVnaXN0cmF0aW9uKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIGBJTG9nU2VydmljZWAgZm9yIGZpeHR1cmVzIHRoYXQgZm9yd2FyZHMgYHdhcm5gLCBgZXJyb3JgLCBhbmQgYGNyaXRpY2FsYFxuICogdG8gdGhlIGJyb3dzZXIgY29uc29sZSBzbyB0aGF0IGVycm9ycyBsb2dnZWQgZHVyaW5nIHJlbmRlciAoZS5nLiBmcm9tXG4gKiBgdHJ5L2NhdGNoYCBibG9ja3MgdGhhdCBzd2FsbG93IGVycm9ycyBpbnRvIHRoZSBsb2cpIGJlY29tZSB2aXNpYmxlIGluXG4gKiB0aGUgY29tcG9uZW50LWV4cGxvcmVyIGNvbnNvbGUgcGFuZWwuXG4gKi9cbmV4cG9ydCBjbGFzcyBGaXh0dXJlTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnNvbGUud2FybihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc29sZS5lcnJvcihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXHRvdmVycmlkZSBjcml0aWNhbChtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc29sZS5lcnJvcihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxufVxuXG4vKipcbiAqIGBNb2RlbFNlcnZpY2VgIGZvciBmaXh0dXJlcyB0aGF0IGRpc3Bvc2VzIGFsbCBvd25lZCB0ZXh0IG1vZGVscyB3aGVuIHRoZVxuICogc2VydmljZSBpdHNlbGYgaXMgZGlzcG9zZWQuIFRoaXMgaXMgc2FmZSBiZWNhdXNlIGBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2VgXG4gKiBpcyB0aGUgZmlyc3QgaXRlbSBhZGRlZCB0byB0aGUgZml4dHVyZSdzIGBEaXNwb3NhYmxlU3RvcmVgLCBzbyBpdCBkaXNwb3Nlc1xuICogbGFzdCAoTElGTykgXHUyMDE0IGFmdGVyIGFsbCB3aWRnZXRzIGhhdmUgYWxyZWFkeSB0b3JuIGRvd24uXG4gKi9cbmV4cG9ydCBjbGFzcyBGaXh0dXJlTW9kZWxTZXJ2aWNlIGV4dGVuZHMgTW9kZWxTZXJ2aWNlIHtcblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMuZ2V0TW9kZWxzKCkpIHtcblx0XHRcdGlmICghbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogYElUZXh0TW9kZWxTZXJ2aWNlYCBmb3IgZml4dHVyZXMgdGhhdCByZXNvbHZlcyBVUklzIGFnYWluc3QgYElNb2RlbFNlcnZpY2VgLlxuICogTW9kZWxzIGNyZWF0ZWQgdmlhIGBjcmVhdGVUZXh0TW9kZWxgICh3aGljaCB1c2VzIGBJTW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsYClcbiAqIGFyZSBhdXRvbWF0aWNhbGx5IHJlc29sdmFibGUuIFVSSXMgd2l0aG91dCBhIGJhY2tpbmcgbW9kZWwgZmFpbCBsb3VkbHkgc29cbiAqIHRoYXQgY2FsbGVycyBkb24ndCBzaWxlbnRseSByZWNlaXZlIGEgbnVsbCBgdGV4dEVkaXRvck1vZGVsYC5cbiAqL1xuZXhwb3J0IGNsYXNzIEZpeHR1cmVUZXh0TW9kZWxTZXJ2aWNlIGV4dGVuZHMgbW9jazxJVGV4dE1vZGVsU2VydmljZT4oKSB7XG5cdGNvbnN0cnVjdG9yKEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGaXh0dXJlVGV4dE1vZGVsU2VydmljZTogbm8gbW9kZWwgcmVnaXN0ZXJlZCBmb3IgJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0b2JqZWN0OiB7IHRleHRFZGl0b3JNb2RlbDogbW9kZWwgfSBhcyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSByZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FuSGFuZGxlUmVzb3VyY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB3aXRoIGFsbCBzZXJ2aWNlcyBuZWVkZWQgZm9yIENvZGVFZGl0b3JXaWRnZXQuXG4gKiBBZGRpdGlvbmFsIHNlcnZpY2VzIGNhbiBiZSByZWdpc3RlcmVkIHZpYSB0aGUgb3B0aW9ucyBjYWxsYmFjay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG9wdGlvbnM/OiBDcmVhdGVTZXJ2aWNlc09wdGlvbnMpOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRjb25zdCBzZXJ2aWNlSWRlbnRpZmllcnM6IFNlcnZpY2VJZGVudGlmaWVyPGFueT5bXSA9IFtdO1xuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGNvbnN0IGRlZmluZSA9IDxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGN0b3I6IG5ldyAoLi4uYXJnczogYW55W10pID0+IFQpID0+IHtcblx0XHRpZiAoIXNlcnZpY2VzLmhhcyhpZCkpIHtcblx0XHRcdHNlcnZpY2VzLnNldChpZCwgbmV3IFN5bmNEZXNjcmlwdG9yKGN0b3IpKTtcblx0XHR9XG5cdFx0c2VydmljZUlkZW50aWZpZXJzLnB1c2goaWQpO1xuXHR9O1xuXG5cdGNvbnN0IGRlZmluZUluc3RhbmNlID0gPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFQpID0+IHtcblx0XHRpZiAoIXNlcnZpY2VzLmhhcyhpZCkpIHtcblx0XHRcdHNlcnZpY2VzLnNldChpZCwgaW5zdGFuY2UpO1xuXHRcdH1cblx0XHRzZXJ2aWNlSWRlbnRpZmllcnMucHVzaChpZCk7XG5cdH07XG5cblx0Y29uc3QgZGVmaW5lUGFydGlhbEluc3RhbmNlID0gPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFBhcnRpYWw8VD4pID0+IHtcblx0XHRkZWZpbmVJbnN0YW5jZShpZCwgaW5zdGFuY2UgYXMgVCk7XG5cdH07XG5cblx0Ly8gQmFzZSBlZGl0b3Igc2VydmljZXNcblx0ZGVmaW5lKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0ZGVmaW5lKElLZXliaW5kaW5nU2VydmljZSwgTW9ja0tleWJpbmRpbmdTZXJ2aWNlKTtcblx0ZGVmaW5lKElDbGlwYm9hcmRTZXJ2aWNlLCBUZXN0Q2xpcGJvYXJkU2VydmljZSk7XG5cdGRlZmluZShJRWRpdG9yV29ya2VyU2VydmljZSwgVGVzdEVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRkZWZpbmVJbnN0YW5jZShJT3BlbmVyU2VydmljZSwgTnVsbE9wZW5lclNlcnZpY2UpO1xuXHRkZWZpbmUoSU5vdGlmaWNhdGlvblNlcnZpY2UsIFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0ZGVmaW5lKElEaWFsb2dTZXJ2aWNlLCBUZXN0RGlhbG9nU2VydmljZSk7XG5cdGRlZmluZShJVW5kb1JlZG9TZXJ2aWNlLCBVbmRvUmVkb1NlcnZpY2UpO1xuXHRkZWZpbmUoSUxhbmd1YWdlU2VydmljZSwgTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0ZGVmaW5lKElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGRlZmluZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGRlZmluZShJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSk7XG5cdGRlZmluZUluc3RhbmNlKElTdG9yYWdlU2VydmljZSwgbmV3IE51bGxTdG9yYWdlU2VydmljZSgpKTtcblx0aWYgKG9wdGlvbnM/LmNvbG9yVGhlbWUpIHtcblx0XHRkZWZpbmVJbnN0YW5jZShJVGhlbWVTZXJ2aWNlLCBuZXcgVGVzdFRoZW1lU2VydmljZShvcHRpb25zLmNvbG9yVGhlbWUpKTtcblx0fSBlbHNlIHtcblx0XHRkZWZpbmUoSVRoZW1lU2VydmljZSwgVGVzdFRoZW1lU2VydmljZSk7XG5cdH1cblx0ZGVmaW5lKElMb2dTZXJ2aWNlLCBGaXh0dXJlTG9nU2VydmljZSk7XG5cdGRlZmluZShJTW9kZWxTZXJ2aWNlLCBGaXh0dXJlTW9kZWxTZXJ2aWNlKTtcblx0ZGVmaW5lKElDb2RlRWRpdG9yU2VydmljZSwgVGVzdENvZGVFZGl0b3JTZXJ2aWNlKTtcblx0ZGVmaW5lKElDb250ZXh0S2V5U2VydmljZSwgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKTtcblx0ZGVmaW5lKElDb21tYW5kU2VydmljZSwgVGVzdENvbW1hbmRTZXJ2aWNlKTtcblx0ZGVmaW5lKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlKTtcblx0ZGVmaW5lKElMb2dnZXJTZXJ2aWNlLCBOdWxsTG9nZ2VyU2VydmljZSk7XG5cdGRlZmluZShJRGF0YUNoYW5uZWxTZXJ2aWNlLCBOdWxsRGF0YUNoYW5uZWxTZXJ2aWNlKTtcblx0ZGVmaW5lKElFbnZpcm9ubWVudFNlcnZpY2UsIGNsYXNzIGV4dGVuZHMgbW9jazxJRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRvdmVycmlkZSBpc0J1aWx0OiBib29sZWFuID0gdHJ1ZTtcblx0XHRvdmVycmlkZSBpc0V4dGVuc2lvbkRldmVsb3BtZW50OiBib29sZWFuID0gZmFsc2U7XG5cdH0pO1xuXHRkZWZpbmUoSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlKTtcblx0ZGVmaW5lKElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRkZWZpbmUoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgVGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSk7XG5cdGRlZmluZShJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLCBJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UpO1xuXHRkZWZpbmVJbnN0YW5jZShJQ29kZUxlbnNDYWNoZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRwdXQ6ICgpID0+IHsgfSxcblx0XHRnZXQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRkZWxldGU6ICgpID0+IHsgfSxcblx0fSk7XG5cdGRlZmluZUluc3RhbmNlKElIb3ZlclNlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0c2hvd0RlbGF5ZWRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNldHVwRGVsYXllZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0c2V0dXBEZWxheWVkSG92ZXJBdE1vdXNlOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0c2hvd0luc3RhbnRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdHNob3dBbmRGb2N1c0xhc3RIb3ZlcjogKCkgPT4geyB9LFxuXHRcdHNldHVwTWFuYWdlZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSwgaGlkZTogKCkgPT4geyB9LCB1cGRhdGU6ICgpID0+IHsgfSB9KSxcblx0XHRzaG93TWFuYWdlZEhvdmVyOiAoKSA9PiB7IH0sXG5cdH0pO1xuXHRkZWZpbmVJbnN0YW5jZShJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQ6IG5ldyBFbWl0dGVyPG51bGw+KCkuZXZlbnQsXG5cdFx0b25EaWRDaGFuZ2VQb2xpY3lEYXRhOiBuZXcgRW1pdHRlcjxudWxsPigpLmV2ZW50LFxuXHRcdHBvbGljeURhdGE6IG51bGwsXG5cdFx0Y3VycmVudERlZmF1bHRBY2NvdW50OiBudWxsLFxuXHRcdGNvcGlsb3RUb2tlbkluZm86IG51bGwsXG5cdFx0b25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvOiBuZXcgRW1pdHRlcjxudWxsPigpLmV2ZW50LFxuXHRcdG1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzOiBudWxsLFxuXHRcdG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVsbCxcblx0XHRtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZTogbnVsbCxcblx0XHRtYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3I6IG51bGwsXG5cdFx0b25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3I6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0RGVmYXVsdEFjY291bnQ6IGFzeW5jICgpID0+IG51bGwsXG5cdFx0Z2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyOiAoKSA9PiAoeyBpZDogJ3Rlc3QnLCBuYW1lOiAnVGVzdCcsIHNjb3BlczogW10sIGVudGVycHJpc2U6IGZhbHNlIH0pLFxuXHRcdHJlc29sdmVHaXRIdWJVcmw6IChwYXRoOiBzdHJpbmcpID0+IGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWAsXG5cdFx0c2V0RGVmYXVsdEFjY291bnRQcm92aWRlcjogKCkgPT4geyB9LFxuXHRcdHJlZnJlc2g6IGFzeW5jICgpID0+IG51bGwsXG5cdFx0c2lnbkluOiBhc3luYyAoKSA9PiBudWxsLFxuXHRcdHNpZ25PdXQ6IGFzeW5jICgpID0+IHsgfSxcblx0fSk7XG5cblx0Ly8gVXNlciBpbnRlcmFjdGlvbiBzZXJ2aWNlIHdpdGggZm9jdXMgc2ltdWxhdGlvbiBlbmFibGVkIChhbGwgZWxlbWVudHMgYXBwZWFyIGZvY3VzZWQgaW4gZml4dHVyZXMpXG5cdGRlZmluZUluc3RhbmNlKElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLCBuZXcgTW9ja1VzZXJJbnRlcmFjdGlvblNlcnZpY2UodHJ1ZSwgZmFsc2UpKTtcblxuXHRkZWZpbmVQYXJ0aWFsSW5zdGFuY2UoSUFjdGlvbldpZGdldFNlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0c2hvdzogKCkgPT4geyB9LFxuXHRcdGhpZGU6ICgpID0+IHsgfSxcblx0XHRnZXQgaXNWaXNpYmxlKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdH0pO1xuXG5cdGRlZmluZUluc3RhbmNlKElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRwbGF5U2lnbmFsOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0cGxheVNpZ25hbHM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRwbGF5U2lnbmFsTG9vcDogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdGdldEVuYWJsZWRTdGF0ZTogKCkgPT4gKHsgdmFsdWU6IGZhbHNlLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgb25DaGFuZ2U6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSB9KSxcblx0XHRnZXREZWxheU1zOiAoKSA9PiAwLFxuXHRcdHBsYXlTb3VuZDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGlzU291bmRFbmFibGVkOiAoKSA9PiBmYWxzZSxcblx0XHRpc0Fubm91bmNlbWVudEVuYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdG9uU291bmRFbmFibGVkQ2hhbmdlZDogKCkgPT4gRXZlbnQuTm9uZSxcblx0fSk7XG5cblx0ZGVmaW5lKElUZXh0TW9kZWxTZXJ2aWNlLCBGaXh0dXJlVGV4dE1vZGVsU2VydmljZSk7XG5cblx0ZGVmaW5lSW5zdGFuY2UoSUFnZW50RmVlZGJhY2tTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlRmVlZGJhY2s6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VOYXZpZ2F0aW9uOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZTogRXZlbnQuTm9uZSxcblx0XHRhY3RpdmVGZWVkYmFja1Nlc3Npb25SZXNvdXJjZTogY29uc3RPYnNlcnZhYmxlKEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFKSxcblx0XHRvbkRpZEFkZEZlZWRiYWNrOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQ29udmVydEZlZWRiYWNrOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQWRkUmVwbHk6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRTdWJtaXRGZWVkYmFjazogRXZlbnQuTm9uZSxcblx0XHRvbkRpZFJldmVhbFNlc3Npb25Db21tZW50OiBFdmVudC5Ob25lLFxuXHRcdGFkZEZlZWRiYWNrOiAoKSA9PiB1bmRlZmluZWQhLFxuXHRcdHJlbW92ZUZlZWRiYWNrOiAoKSA9PiB7IH0sXG5cdFx0dXBkYXRlRmVlZGJhY2s6ICgpID0+IHsgfSxcblx0XHRhY2NlcHRGZWVkYmFjazogKCkgPT4geyB9LFxuXHRcdGFkZFJlcGx5OiAoKSA9PiB7IH0sXG5cdFx0Z2V0RmVlZGJhY2s6ICgpID0+IFtdLFxuXHRcdGhhc0xvYWRlZEZlZWRiYWNrOiAoKSA9PiB0cnVlLFxuXHRcdGdldFNlc3Npb25Gb3JGaWxlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRyZWdpc3RlckZlZWRiYWNrUmVzb3VyY2VTY29wZTogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0Z2V0TW9zdFJlY2VudFNlc3Npb25Gb3JSZXNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHJldmVhbEZlZWRiYWNrOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0cmV2ZWFsU2Vzc2lvbkNvbW1lbnQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRnZXROZXh0RmVlZGJhY2s6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXROZXh0TmF2aWdhYmxlSXRlbTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNldE5hdmlnYXRpb25BbmNob3I6ICgpID0+IHsgfSxcblx0XHRnZXROYXZpZ2F0aW9uQmVhcmluZzogKCkgPT4gKHsgYWN0aXZlSWR4OiAtMSwgdG90YWxDb3VudDogMCB9KSxcblx0XHRjbGVhckZlZWRiYWNrOiAoKSA9PiB7IH0sXG5cdFx0bWFya0ZlZWRiYWNrU3VibWl0dGVkOiAoKSA9PiB7IH0sXG5cdFx0c3VibWl0RmVlZGJhY2s6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdGFkZEZlZWRiYWNrQW5kU3VibWl0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0c2V0RmVlZGJhY2tSZXNvbHZlZDogYXN5bmMgKCkgPT4geyB9LFxuXHR9KTtcblxuXHRkZWZpbmVQYXJ0aWFsSW5zdGFuY2UoSUNoYXRFZGl0aW5nU2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRlZGl0aW5nU2Vzc2lvbnNPYnM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0c3RhcnRPckNvbnRpbnVlR2xvYmFsRWRpdGluZ1Nlc3Npb246ICgpID0+IHVuZGVmaW5lZCEsXG5cdFx0Z2V0RWRpdGluZ1Nlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0fSk7XG5cblx0ZGVmaW5lUGFydGlhbEluc3RhbmNlKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXRTZXNzaW9uczogKCkgPT4gW10sXG5cdH0pO1xuXG5cdGRlZmluZVBhcnRpYWxJbnN0YW5jZShJU2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGFjdGl2ZVNlc3Npb246IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHR9KTtcblxuXHRkZWZpbmVQYXJ0aWFsSW5zdGFuY2UoSUNvZGVSZXZpZXdTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGdldFBSUmV2aWV3U3RhdGU6ICgpID0+IGNvbnN0T2JzZXJ2YWJsZSh7IGtpbmQ6IFBSUmV2aWV3U3RhdGVLaW5kLk5vbmUgfSksXG5cdFx0cmVzb2x2ZVBSUmV2aWV3VGhyZWFkOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0bWFya1BSUmV2aWV3Q29tbWVudENvbnZlcnRlZDogKCkgPT4geyB9LFxuXHR9KTtcblxuXHQvLyBBbGxvdyBhZGRpdGlvbmFsIHNlcnZpY2VzIHRvIG92ZXJyaWRlIGRlZmF1bHRzXG5cdG9wdGlvbnM/LmFkZGl0aW9uYWxTZXJ2aWNlcz8uKHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGRlZmluZTogPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgY3RvcjogbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gVCkgPT4ge1xuXHRcdFx0c2VydmljZXMuc2V0KGlkLCBuZXcgU3luY0Rlc2NyaXB0b3IoY3RvcikpO1xuXHRcdFx0c2VydmljZUlkZW50aWZpZXJzLnB1c2goaWQpO1xuXHRcdH0sXG5cdFx0ZGVmaW5lSW5zdGFuY2U6IDxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGluc3RhbmNlOiBUKSA9PiB7XG5cdFx0XHRzZXJ2aWNlcy5zZXQoaWQsIGluc3RhbmNlKTtcblx0XHRcdHNlcnZpY2VJZGVudGlmaWVycy5wdXNoKGlkKTtcblx0XHR9LFxuXHRcdGRlZmluZVBhcnRpYWxJbnN0YW5jZTogPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFBhcnRpYWw8VD4pID0+IHtcblx0XHRcdHNlcnZpY2VzLnNldChpZCwgaW5zdGFuY2UgYXMgVCk7XG5cdFx0XHRzZXJ2aWNlSWRlbnRpZmllcnMucHVzaChpZCk7XG5cdFx0fSxcblx0fSk7XG5cblx0Ly8gUGFzcyBgX3Byb3BlckRpc3Bvc2U6IHRydWVgIHNvIHRoZSB1bmRlcmx5aW5nIGBJbnN0YW50aWF0aW9uU2VydmljZWAnc1xuXHQvLyBkaXNwb3NlIHJ1bnMsIHdoaWNoIGRpc3Bvc2VzIHNlcnZpY2VzIGl0IGluc3RhbnRpYXRlZCBsYXppbHkgZnJvbVxuXHQvLyBgU3luY0Rlc2NyaXB0b3JgcyAoZS5nLiBNZW51U2VydmljZSwgQ29udGV4dEtleVNlcnZpY2UpLiBXaXRob3V0IHRoaXMsXG5cdC8vIHByb2R1Y3Rpb24gc2VydmljZXMgd2l0aCBpbnRlcm5hbCBEaXNwb3NhYmxlcyBsZWFrIHBhc3QgdGhlIGZpeHR1cmUuXG5cdC8vXG5cdC8vIERvbid0IGFkZCBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgdG8gZGlzcG9zYWJsZXMgaW1tZWRpYXRlbHkgXHUyMDE0IGl0IG11c3Rcblx0Ly8gZGlzcG9zZSBydW5zLCB3aGljaCBkaXNwb3NlcyBzZXJ2aWNlcyBpdCBpbnN0YW50aWF0ZWQgbGF6aWx5IGZyb21cblx0Ly8gYFN5bmNEZXNjcmlwdG9yYHMgKGUuZy4gTWVudVNlcnZpY2UsIENvbnRleHRLZXlTZXJ2aWNlKS4gV2l0aG91dCB0aGlzLFxuXHQvLyBwcm9kdWN0aW9uIHNlcnZpY2VzIHdpdGggaW50ZXJuYWwgRGlzcG9zYWJsZXMgbGVhayBwYXN0IHRoZSBmaXh0dXJlLlxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpKTtcblxuXHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIHNlcnZpY2VJZGVudGlmaWVycykge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2VPckRlc2NyaXB0b3IgPSBzZXJ2aWNlcy5nZXQoaWQpO1xuXHRcdFx0aWYgKHR5cGVvZiBpbnN0YW5jZU9yRGVzY3JpcHRvcj8uZGlzcG9zZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRpbnN0YW5jZU9yRGVzY3JpcHRvci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KSk7XG5cblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVycyBhZGRpdGlvbmFsIHNlcnZpY2VzIG5lZWRlZCBieSB3b3JrYmVuY2ggY29tcG9uZW50cyAobWVyZ2UgZWRpdG9yLCBldGMuKS5cbiAqIFVzZSB3aXRoIGNyZWF0ZUVkaXRvclNlcnZpY2VzIGFkZGl0aW9uYWxTZXJ2aWNlcyBvcHRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZ2lzdHJhdGlvbjogU2VydmljZVJlZ2lzdHJhdGlvbik6IHZvaWQge1xuXHRyZWdpc3RyYXRpb24uZGVmaW5lSW5zdGFuY2UoSUNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdHNob3dDb250ZXh0TWVudTogKCkgPT4geyB9LFxuXHRcdG9uRGlkU2hvd0NvbnRleHRNZW51OiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0b25EaWRIaWRlQ29udGV4dE1lbnU6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdH0pO1xuXG5cdHJlZ2lzdHJhdGlvbi5kZWZpbmVJbnN0YW5jZShJQ29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0c2hvd0NvbnRleHRWaWV3OiAoKSA9PiAoeyBjbG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdGhpZGVDb250ZXh0VmlldzogKCkgPT4geyB9LFxuXHRcdGdldENvbnRleHRWaWV3RWxlbWVudDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGxheW91dDogKCkgPT4geyB9LFxuXHRcdGFuY2hvckFsaWdubWVudDogMCxcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdH0pO1xuXG5cdHJlZ2lzdHJhdGlvbi5kZWZpbmVJbnN0YW5jZShJTGFiZWxTZXJ2aWNlLCB7XG5cdFx0Z2V0VXJpTGFiZWw6ICh1cmk6IFVSSSkgPT4gdXJpLnBhdGgsXG5cdFx0Z2V0VXJpQmFzZW5hbWVMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aC5zcGxpdCgnLycpLnBvcCgpID8/ICcnLFxuXHRcdGdldFdvcmtzcGFjZUxhYmVsOiAoKSA9PiAnJyxcblx0XHRnZXRIb3N0TGFiZWw6ICgpID0+ICcnLFxuXHRcdGdldFNlcGFyYXRvcjogKCkgPT4gJy8nLFxuXHRcdHJlZ2lzdGVyRm9ybWF0dGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0b25EaWRDaGFuZ2VGb3JtYXR0ZXJzOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0cmVnaXN0ZXJDYWNoZWRGb3JtYXR0ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0Z2V0SG9zdFRvb2x0aXA6ICgpID0+ICcnLFxuXHR9KTtcblxuXHRyZWdpc3RyYXRpb24uZGVmaW5lKElNZW51U2VydmljZSwgVGVzdE1lbnVTZXJ2aWNlKTtcblx0cmVnaXN0cmF0aW9uLmRlZmluZShJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLCBOdWxsQWN0aW9uVmlld0l0ZW1TZXJ2aWNlKTtcblxuXHQvLyBOby1vcCBwaG9uZSBwcmVzZW50ZXIgc28gY2hhdC1pbnB1dCBmaXh0dXJlcyBkb24ndCBjcmFzaCBvblxuXHQvLyBgY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuZW5hYmxlZC5nZXQoKWAuIFRoZSByZWFsIGltcGwgaXMgaW5cblx0Ly8gYHZzL3Nlc3Npb25zYCBhbmQgb25seSBhdHRhY2hlcyBpbiB0aGUgYWdlbnRzIHdpbmRvdyBcdTIwMTQgZGVza3RvcFxuXHQvLyBmaXh0dXJlcyBzZWUgdGhlIG5vLW9wIChgZW5hYmxlZCA9PT0gZmFsc2VgLCBzaGVldCBjYWxscyByZXNvbHZlXG5cdC8vIGltbWVkaWF0ZWx5KSB3aGljaCBtYXRjaGVzIGRlc2t0b3AgcnVudGltZSBiZWhhdmlvci5cblx0cmVnaXN0cmF0aW9uLmRlZmluZUluc3RhbmNlKElDaGF0UGhvbmVJbnB1dFByZXNlbnRlciwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRlbmFibGVkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdHNob3dDb21iaW5lZE1vZGVBbmRNb2RlbFNoZWV0OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRzZXRJbXBsOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdH0pO1xuXG5cdC8vIFdvcmtzcGFjZSB0cnVzdCBzdHVicyBzbyBjaGF0LWlucHV0IGZpeHR1cmVzIGNhbiBpbnN0YW50aWF0ZSB0aGUgbW9kZWxcblx0Ly8gcGlja2VyIChNb2RlbFBpY2tlcldpZGdldCByZWFkcyB3b3Jrc3BhY2UgdHJ1c3QgdG8gZGV0ZWN0IFJlc3RyaWN0ZWQgTW9kZSkuXG5cdC8vIFJlcG9ydHMgdGhlIHdvcmtzcGFjZSBhcyB0cnVzdGVkIHNvIHRoZSBwaWNrZXIgcmVuZGVycyBub3JtYWxseS5cblx0cmVnaXN0cmF0aW9uLmRlZmluZUluc3RhbmNlKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBvbkRpZENoYW5nZVRydXN0ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0b3ZlcnJpZGUgaXNXb3Jrc3BhY2VUcnVzdGVkKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHR9KCkpO1xuXHRyZWdpc3RyYXRpb24uZGVmaW5lSW5zdGFuY2UoSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGFzeW5jIHJlcXVlc3RXb3Jrc3BhY2VUcnVzdCgpIHsgcmV0dXJuIHRydWU7IH1cblx0fSgpKTtcblxuXHQvLyBDaGF0IGlucHV0cyByZWdpc3RlciB0aGVtc2VsdmVzIGFzIHBhc3RlIHRhcmdldHMgd2hpbGUgcmVuZGVyaW5nOyB0aGUgcmVhbFxuXHQvLyBzZXJ2aWNlIGlzIGEgcGxhaW4gcmVnaXN0cnkgd2l0aCBubyBkZXBlbmRlbmNpZXMsIHNvIHVzZSBpdCBkaXJlY3RseS5cblx0cmVnaXN0cmF0aW9uLmRlZmluZUluc3RhbmNlKElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlLCBuZXcgQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSgpKTtcbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUZXh0IE1vZGVsc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIENyZWF0ZXMgYSB0ZXh0IG1vZGVsIHVzaW5nIHRoZSBNb2RlbFNlcnZpY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0TW9kZWwoXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdHRleHQ6IHN0cmluZyxcblx0dXJpOiBVUkksXG5cdGxhbmd1YWdlSWQ/OiBzdHJpbmdcbik6IElUZXh0TW9kZWwge1xuXHRjb25zdCBtb2RlbFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU1vZGVsU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSBsYW5ndWFnZUlkID8gbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQobGFuZ3VhZ2VJZCkgOiBudWxsO1xuXHRyZXR1cm4gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKHRleHQsIGxhbmd1YWdlU2VsZWN0aW9uLCB1cmkpO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEZpeHR1cmUgQWRhcHRlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBUaGVtZWRGaXh0dXJlR3JvdXBMYWJlbHMge1xuXHRyZWFkb25seSBraW5kPzogJ3NjcmVlbnNob3QnIHwgJ2FuaW1hdGVkJztcblx0cmVhZG9ubHkgYmxvY2tzQ2k/OiB0cnVlO1xuXHRyZWFkb25seSBmbGFreT86IHRydWU7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVMYWJlbHMobGFiZWxzOiBUaGVtZWRGaXh0dXJlR3JvdXBMYWJlbHMgfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0aWYgKGxhYmVscz8ua2luZCA9PT0gJ3NjcmVlbnNob3QnKSB7XG5cdFx0cmVzdWx0LnB1c2goJy5zY3JlZW5zaG90Jyk7XG5cdH0gZWxzZSBpZiAobGFiZWxzPy5raW5kID09PSAnYW5pbWF0ZWQnKSB7XG5cdFx0cmVzdWx0LnB1c2goJ2FuaW1hdGVkJyk7XG5cdH1cblx0aWYgKGxhYmVscz8uYmxvY2tzQ2kpIHtcblx0XHRyZXN1bHQucHVzaCgnYmxvY2tzLWNpJyk7XG5cdH1cblx0aWYgKGxhYmVscz8uZmxha3kpIHtcblx0XHRyZXN1bHQucHVzaCgnZmxha3knKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZVN0YWNrU3RvcmUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRhZGQ8VCBleHRlbmRzIElEaXNwb3NhYmxlPihpdGVtOiBUKTogVCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdGl0ZW0uZGlzcG9zZSgpO1xuXHRcdFx0Y29uc29sZS53YXJuKCdBZGRpbmcgdG8gYSBkaXNwb3NlZCBEaXNwb3NhYmxlU3RhY2tTdG9yZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0d2hpbGUgKHRoaXMuX2l0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2l0ZW1zLnBvcCgpIS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcblx0ZGlzcG9zYWJsZVN0YWNrU3RvcmU6IERpc3Bvc2FibGVTdGFja1N0b3JlO1xuXHR0aGVtZTogQ29sb3JUaGVtZURhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcG9uZW50Rml4dHVyZU9wdGlvbnMge1xuXHRyZW5kZXI6IChjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD47XG5cdGxhYmVscz86IFRoZW1lZEZpeHR1cmVHcm91cExhYmVscztcblx0dmlydHVhbFRpbWU/OiB7IGVuYWJsZWQ/OiBib29sZWFuOyBkdXJhdGlvbk1zPzogbnVtYmVyOyB0ZWFyZG93bkRyYWluTXM/OiBudW1iZXIgfTtcblx0YWRkaXRpb25hbFRoZW1lcz86IHJlYWRvbmx5IENvbXBvbmVudEZpeHR1cmVBZGRpdGlvbmFsVGhlbWVbXTtcbn1cblxudHlwZSBUaGVtZWRGaXh0dXJlcyA9IFJldHVyblR5cGU8dHlwZW9mIGRlZmluZUZpeHR1cmVWYXJpYW50cz47XG5cbi8vIFBlcm1hbmVudCBsb2dnaW5nIGxheWVyIHRoYXQgZGV0ZWN0cyByZWFsIHRpbWVyIEFQSSB1c2FnZS5cbi8vIEluY2x1ZGVzIGhhbmRsZXIgc291cmNlIGZvciBpZGVudGlmaWNhdGlvbiBzaW5jZSBidW5kbGVkIHN0YWNrIHRyYWNlcyBhcmUgbm90IHVzZWZ1bC5cbmNvbnN0IHJlYWxUaW1lQXBpID0gY2FwdHVyZUdsb2JhbFRpbWVBcGkoKTtcbmNvbnN0IGxvZ091dHNpZGVUaW1lID0gZmFsc2U7XG5pZiAobG9nT3V0c2lkZVRpbWUpIHtcblx0Y29uc3QgbG9nZ2luZ1RpbWVBcGkgPSBjcmVhdGVMb2dnaW5nVGltZUFwaShyZWFsVGltZUFwaSwgKG5hbWUsIHN0YWNrLCBoYW5kbGVyKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlclN0ciA9IHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nID8gaGFuZGxlci50b1N0cmluZygpLnNsaWNlKDAsIDUwMCkgOiBTdHJpbmcoaGFuZGxlcik7XG5cdFx0Y29uc29sZS53YXJuKGBbQ29tcG9uZW50Rml4dHVyZV0gUmVhbCAke25hbWV9IGNhbGxlZCBvdXRzaWRlIG9mIHZpcnR1YWwgdGltZS5cXG5IYW5kbGVyOiAke2hhbmRsZXJTdHJ9XFxuU3RhY2s6ICR7c3RhY2t9YCk7XG5cdH0pO1xuXHRwdXNoR2xvYmFsVGltZUFwaShsb2dnaW5nVGltZUFwaSk7XG59XG5cbmxldCBmaXh0dXJlUmVuZGVyQ291bnRlciA9IDA7XG5cbi8qKlxuICogQ3JlYXRlcyBEYXJrIGFuZCBMaWdodCBmaXh0dXJlIHZhcmlhbnRzIGZyb20gYSBzaW5nbGUgcmVuZGVyIGZ1bmN0aW9uLCB3aXRoIG9wdGlvbmFsIGFkZGl0aW9uYWwgdGhlbWUgdmFyaWFudHMuXG4gKiBUaGUgcmVuZGVyIGZ1bmN0aW9uIHJlY2VpdmVzIGEgY29udGV4dCB3aXRoIGNvbnRhaW5lciBhbmQgZGlzcG9zYWJsZVN0b3JlLlxuICpcbiAqIE5vdGU6IElmIHJlbmRlciByZXR1cm5zIGEgUHJvbWlzZSwgdGhlIGFzeW5jIHdvcmsgd2lsbCBydW4gaW4gYmFja2dyb3VuZC5cbiAqIENvbXBvbmVudC1leHBsb3JlciB3YWl0cyAyIGFuaW1hdGlvbiBmcmFtZXMgYWZ0ZXIgc3luYyByZW5kZXIgcmV0dXJucyxcbiAqIHdoaWNoIHNob3VsZCBiZSBzdWZmaWNpZW50IGZvciBtb3N0IGFzeW5jIHNldHVwLCBidXQgdGltaW5nIGlzIG5vdCBndWFyYW50ZWVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lQ29tcG9uZW50Rml4dHVyZShvcHRpb25zOiBDb21wb25lbnRGaXh0dXJlT3B0aW9ucyk6IFRoZW1lZEZpeHR1cmVzIHtcblx0Y29uc3QgY3JlYXRlRml4dHVyZSA9ICh0aGVtZVZhcmlhbnQ6IENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQpID0+IGRlZmluZUZpeHR1cmUoe1xuXHRcdGlzb2xhdGlvbjogJ25vbmUnLFxuXHRcdGRpc3BsYXlNb2RlOiB7IHR5cGU6ICdjb21wb25lbnQnIH0sXG5cdFx0YmFja2dyb3VuZDogdGhlbWVWYXJpYW50LmJhY2tncm91bmQsXG5cdFx0aW5wdXRTY2hlbWE6IGZpeHR1cmVJbnB1dFNjaGVtYSxcblx0XHRpbnB1dENvbnRyb2xzOiB7XG5cdFx0XHRyZXZlcnNlU3R5bGVzaGVldHM6IHsgcGxhY2VtZW50OiAndG9vbGJhcicsIGxhYmVsOiAnUmV2ZXJzZSBTdHlsZXNoZWV0cycgfSxcblx0XHRcdGVuYWJsZUFuaW1hdGlvbnM6IHsgcGxhY2VtZW50OiAndG9vbGJhcicsIGxhYmVsOiAnRW5hYmxlIEFuaW1hdGlvbnMnIH0sXG5cdFx0fSxcblx0XHRyZW5kZXI6IGFzeW5jIChjb250YWluZXI6IEhUTUxFbGVtZW50LCBjb250ZXh0KSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHBhcnNlRml4dHVyZUlucHV0KGNvbnRleHQuaW5wdXQpO1xuXHRcdFx0Y29uc3QgeyBsYWJlbDogdGhlbWVMYWJlbCwgdGhlbWUsIHNjb3BlVGhlbWluZ1BhcnRpY2lwYW50cyB9ID0gdGhlbWVWYXJpYW50O1xuXG5cdFx0XHQvLyBSZXBsYWNlIE1hdGgucmFuZG9tIHdpdGggYSBzZWVkZWQgUFJORyBzbyBmaXh0dXJlcyByZW5kZXIgZGV0ZXJtaW5pc3RpY2FsbHkuXG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHB1c2hSYW5kb21PdmVyd3JpdGUoNDIpKTtcblxuXHRcdFx0Ly8gRG8gbm90IGVuYWJsZSB2aXJ0dWFsIHRpbWUgaW4gZXhwbG9yZXIgdWksIGFzIG11bHRpcGxlIGZpeHR1cmVzIGFyZSByZW5kZXJlZCBpbiBwYXJhbGxlbC5cblx0XHRcdGNvbnN0IHZpcnR1YWxUaW1lRW5hYmxlZCA9IChvcHRpb25zLnZpcnR1YWxUaW1lPy5lbmFibGVkID8/IHRydWUpICYmIGNvbnRleHQuaG9zdC5raW5kICE9PSAnZXhwbG9yZXItdWknO1xuXHRcdFx0Ly8gRGV0ZWN0IGRpc3Bvc2FibGUgbGVha3MgdGhlIHNhbWUgd2F5IHVuaXQgdGVzdHMgZG8gKGBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGVgKS5cblx0XHRcdC8vIFRoZSB0cmFja2VyIGlzIGdsb2JhbCBhbmQgdGhlcmVmb3JlIHVuc2FmZSB3aGVuIGZpeHR1cmVzIHJlbmRlciBpbiBwYXJhbGxlbCxcblx0XHRcdC8vIHNvIGl0IGlzIG9ubHkgZW5hYmxlZCBvdXRzaWRlIHRoZSBleHBsb3JlciBVSSAoZS5nLiBpbiBzY3JlZW5zaG90L0NJIG1vZGUpLlxuXHRcdFx0Y29uc3QgbGVha0RldGVjdGlvbkVuYWJsZWQgPSB0cnVlICYmIGNvbnRleHQuaG9zdC5raW5kICE9PSAnZXhwbG9yZXItdWknO1xuXHRcdFx0Ly8gV2FybSB1cCB0aGUgYE1vZGlmaWVyS2V5RW1pdHRlcmAgc2luZ2xldG9uIGJlZm9yZSB0aGUgbGVhayB0cmFja2VyXG5cdFx0XHQvLyBzdGFydHMgc28gaXRzIGxvbmctbGl2ZWQgYERpc3Bvc2FibGVTdG9yZWAgKGNyZWF0ZWQgb24gZmlyc3Rcblx0XHRcdC8vIGBNZW51RW50cnlBY3Rpb25WaWV3SXRlbS5yZW5kZXJgKSBkb2Vzbid0IHNob3cgdXAgYXMgYSBsZWFrIGluXG5cdFx0XHQvLyB0aGUgZmlyc3QgZml4dHVyZSB0aGF0IHVzZXMgYSBtZW51IHRvb2xiYXIuXG5cdFx0XHRpZiAobGVha0RldGVjdGlvbkVuYWJsZWQpIHtcblx0XHRcdFx0TW9kaWZpZXJLZXlFbWl0dGVyLmdldEluc3RhbmNlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cmFja2VyID0gbGVha0RldGVjdGlvbkVuYWJsZWQgPyBuZXcgRGlzcG9zYWJsZVRyYWNrZXIoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0cmFja2VyKSB7XG5cdFx0XHRcdHNldERpc3Bvc2FibGVUcmFja2VyKHRyYWNrZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWaXJ0dWFsIHRpbWUgaW5mcmFzdHJ1Y3R1cmUgbGl2ZXMgYWNyb3NzIHRoZSB3aG9sZSBmaXh0dXJlXG5cdFx0XHQvLyBsaWZldGltZSAocmVuZGVyICsgZGlzcG9zZSkuIFRoaXMgbGV0cyB1cyBhZHZhbmNlIHZpcnR1YWwgdGltZVxuXHRcdFx0Ly8gZHVyaW5nIGRpc3Bvc2UgdG8gZHJhaW4gYXN5bmMgY2xlYW51cCB3b3JrIChlLmcuIGBQcm9taXNlLnJhY2VgXG5cdFx0XHQvLyBndWFyZHMgYmVoaW5kIGB0aW1lb3V0KDEwMDApYCB0aGF0IGhvbGQgcmVmZXJlbmNlcyB1bnRpbCB0aGV5XG5cdFx0XHQvLyBzZXR0bGUpIGJlZm9yZSB0aGUgbGVhayB0cmFja2VyIGNoZWNrcyBmb3IgdW5kaXNwb3NlZCBvYmplY3RzLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFNlZWQgdGhlIGNsb2NrIHdpdGggYSBmaXhlZCB3YWxsLWNsb2NrIHRpbWUgc28gYW55IGNvZGUgdW5kZXJcblx0XHRcdC8vIHRlc3QgdGhhdCByZWFkcyBgRGF0ZS5ub3coKWAgLyBgbmV3IERhdGUoKWAgcHJvZHVjZXMgdGhlIHNhbWVcblx0XHRcdC8vIHZhbHVlcyBydW4gYWZ0ZXIgcnVuLiBSZWFsIHRpbWUgd291bGQgb3RoZXJ3aXNlIGxlYWsgaW5cblx0XHRcdC8vIHRocm91Z2ggdGhpcyBzZWVkIGFuZCBtYWtlIHNjcmVlbnNob3RzIHRoYXQgaW5jbHVkZVxuXHRcdFx0Ly8gdGltZS1kZXJpdmVkIGxhYmVscyAoZS5nLiBcIjEgaG91ciBhZ29cIiwgXCJUb2RheVwiKSBkcmlmdFxuXHRcdFx0Ly8gYWNyb3NzIGRheXMsIGhvdXIgYm91bmRhcmllcywgYW5kIERTVCBjaGFuZ2VzLlxuXHRcdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKG5ldyBEYXRlKCcyMDI2LTA1LTE0VDEyOjAwOjAwWicpLmdldFRpbWUoKSk7XG5cdFx0XHRjb25zdCBwID0gbmV3IFZpcnR1YWxUaW1lUHJvY2Vzc29yKFxuXHRcdFx0XHRjbG9jayxcblx0XHRcdFx0ZHJhaW5NaWNyb3Rhc2tzRW1iZWRkaW5nKHJlYWxUaW1lQXBpKSxcblx0XHRcdFx0cmVhbFRpbWVBcGksXG5cdFx0XHRcdHsgZGVmYXVsdE1heEV2ZW50czogMTAwIH0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdmlydHVhbFRpbWVBcGkgPSBjcmVhdGVWaXJ0dWFsVGltZUFwaShjbG9jaywgeyBmYWtlUmVxdWVzdEFuaW1hdGlvbkZyYW1lOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgdGVhcmRvd25EcmFpbk1zID0gb3B0aW9ucy52aXJ0dWFsVGltZT8udGVhcmRvd25EcmFpbk1zID8/IDExMDA7XG5cblx0XHRcdC8vIFNpbmdsZSBhc3luYyBkaXNwb3NlIG9yY2hlc3RyYXRlcyB0ZWFyZG93biBvcmRlcjpcblx0XHRcdC8vICAgMS4gZGlzcG9zZSB1c2VyIGRpc3Bvc2FibGVzIChzeW5jaHJvbm91cyBwYXJ0KVxuXHRcdFx0Ly8gICAyLiBkcmFpbiB2aXJ0dWFsIHRpbWUgKHNvIHRpbWVycyBzY2hlZHVsZWQgZHVyaW5nIGRpc3Bvc2Vcblx0XHRcdC8vICAgICAgXHUyMDE0IGxpa2UgYFByb21pc2UucmFjZShbLi4uLCB0aW1lb3V0KDEwMDApXSlgIFx1MjAxNCBzZXR0bGUgYW5kXG5cdFx0XHQvLyAgICAgIHJlbGVhc2UgdGhlaXIgY2FwdHVyZWQgcmVmZXJlbmNlcylcblx0XHRcdC8vICAgMy4gdGVhciBkb3duIHZpcnR1YWwgdGltZSAodW5pbnN0YWxsIGdsb2JhbCBBUEksIGRpc3Bvc2UgYHBgKVxuXHRcdFx0Ly8gICA0LiBzdG9wIHRyYWNrZXIgYW5kIGNoZWNrIGZvciBsZWFrc1xuXHRcdFx0Ly8gQWxsIG9uIG9uZSBkaXNwb3NhYmxlIHNvIHRoZSBzdGVwcyBydW4gaW4gb3JkZXIuXG5cdFx0XHRjb250ZXh0LmFkZERpc3Bvc2FibGUoe1xuXHRcdFx0XHRkaXNwb3NlOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gUmUtcHVzaCB2aXJ0dWFsIHRpbWUgc28gYW55IGBzZXRUaW1lb3V0YC9gc2V0SW50ZXJ2YWxgXG5cdFx0XHRcdFx0Ly8gY2FsbHMgbWFkZSBieSBgZGlzcG9zZSgpYCBvZiBmaXh0dXJlLW93bmVkIG9iamVjdHNcblx0XHRcdFx0XHQvLyBsYW5kIGluIGBwYCBhbmQgY2FuIGJlIGRyYWluZWQgYmVsb3cuIFJlbmRlciB1bnB1c2hlc1xuXHRcdFx0XHRcdC8vIHZpcnR1YWwgdGltZSB3aGVuIGl0IGNvbXBsZXRlcyAoc28gc2NyZWVuc2hvdCBjYXB0dXJlXG5cdFx0XHRcdFx0Ly8gZXRjLiBjYW4gdXNlIHJlYWwgdGltZXJzKSwgc28gd2UgaGF2ZSB0byBwdXNoIGFnYWluLlxuXHRcdFx0XHRcdGxldCB0ZWFyZG93blRpbWVBcGk6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh2aXJ0dWFsVGltZUVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdHRlYXJkb3duVGltZUFwaSA9IHB1c2hHbG9iYWxUaW1lQXBpKHZpcnR1YWxUaW1lQXBpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50Rml4dHVyZV0gZXJyb3IgZGlzcG9zaW5nIGZpeHR1cmU6ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5zdGFjayA6IGV9YCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHZpcnR1YWxUaW1lRW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgcC5ydW4oe1xuXHRcdFx0XHRcdFx0XHRcdHVudGlsOiB1bnRpbFRpbWUoY2xvY2subm93ICsgdGVhcmRvd25EcmFpbk1zKSxcblx0XHRcdFx0XHRcdFx0XHRtYXhFdmVudHM6IDEwMDAsXG5cdFx0XHRcdFx0XHRcdFx0bWF4VHJhY2VEZXB0aDogNSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRGaXh0dXJlXSBlcnJvciBkcmFpbmluZyB2aXJ0dWFsIHRpbWUgZHVyaW5nIHRlYXJkb3duOiAke2UgaW5zdGFuY2VvZiBFcnJvciA/IGUuc3RhY2sgOiBlfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRlYXJkb3duVGltZUFwaT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHAuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdFx0aWYgKHRyYWNrZXIpIHtcblx0XHRcdFx0XHRcdHNldERpc3Bvc2FibGVUcmFja2VyKG51bGwpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdHJhY2tlci5jb21wdXRlTGVha2luZ0Rpc3Bvc2FibGVzKCk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVGhlcmUgYXJlICR7cmVzdWx0LmxlYWtzLmxlbmd0aH0gdW5kaXNwb3NlZCBkaXNwb3NhYmxlcyEke3Jlc3VsdC5kZXRhaWxzfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiBhY3R1YWxSZW5kZXIoKSB7XG5cdFx0XHRcdGF3YWl0IHNldHVwVGhlbWUoY29udGFpbmVyLCB0aGVtZSwgc2NvcGVUaGVtaW5nUGFydGljaXBhbnRzKTtcblxuXHRcdFx0XHRjb25zdCBzdHlsZXNoZWV0T3JkZXJPdmVycmlkZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRcdFx0Y29uc3QgdXBkYXRlU3R5bGVzaGVldE9yZGVyID0gKGlucHV0OiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9uID0gZ2V0UmV2ZXJzZVN0eWxlc2hlZXRzT3B0aW9uKGlucHV0KTtcblx0XHRcdFx0XHRzdHlsZXNoZWV0T3JkZXJPdmVycmlkZS5jbGVhcigpO1xuXHRcdFx0XHRcdGlmIChvcHRpb24gIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRzdHlsZXNoZWV0T3JkZXJPdmVycmlkZS52YWx1ZSA9IG92ZXJyaWRlU3R5bGVzaGVldE9yZGVyKG9wdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb250ZXh0LndhdGNoSW5wdXQoJ3JldmVyc2VTdHlsZXNoZWV0cycsIChfdmFsdWUsIGlucHV0KSA9PiB1cGRhdGVTdHlsZXNoZWV0T3JkZXIoaW5wdXQpKTtcblx0XHRcdFx0Y29udGV4dC53YXRjaElucHV0KCdyZXZlcnNlU3R5bGVzaGVldHNSYW5nZScsIChfdmFsdWUsIGlucHV0KSA9PiB1cGRhdGVTdHlsZXNoZWV0T3JkZXIoaW5wdXQpKTtcblx0XHRcdFx0Y29udGV4dC53YXRjaElucHV0KCdlbmFibGVBbmltYXRpb25zJywgdmFsdWUgPT4ge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlLWFuaW1hdGlvbnMnLCAhdmFsdWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRsZXQgcmVuZGVyVGltZUFwaTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh2aXJ0dWFsVGltZUVuYWJsZWQpIHtcblx0XHRcdFx0XHRyZW5kZXJUaW1lQXBpID0gcHVzaEdsb2JhbFRpbWVBcGkodmlydHVhbFRpbWVBcGkpO1xuXG5cdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YWxsRmFrZVJ1bldoZW5JZGxlKChfdGFyZ2V0V2luZG93LCBjYWxsYmFjaywgX3RpbWVvdXQ/KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFja1RyYWNlID0gbmV3IEVycm9yKCkuc3RhY2s7XG5cdFx0XHRcdFx0XHRjb25zdCB0cmFjZSA9IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5jaGlsZCgncnVuV2hlbklkbGUnLCBzdGFja1RyYWNlKTtcblx0XHRcdFx0XHRcdHJldHVybiBjbG9jay5zY2hlZHVsZSh7XG5cdFx0XHRcdFx0XHRcdHRpbWU6IGNsb2NrLm5vdyxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZGVhZGxpbmU6IElkbGVEZWFkbGluZSA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdGRpZFRpbWVvdXQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHR0aW1lUmVtYWluaW5nOiAoKSA9PiA1MCxcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdGNhbGxiYWNrKGRlYWRsaW5lKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dG9TdHJpbmcoKSB7IHJldHVybiAncnVuV2hlbklkbGUnOyB9LFxuXHRcdFx0XHRcdFx0XHRcdHN0YWNrVHJhY2UsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHRyYWNlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RhY2tTdG9yZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdGFja1N0b3JlKCkpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG9wdGlvbnMucmVuZGVyKHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2FibGVTdGFja1N0b3JlLCB0aGVtZSB9KTtcblxuXHRcdFx0XHRcdGNvbnN0IHAyID0gdmlydHVhbFRpbWVFbmFibGVkXG5cdFx0XHRcdFx0XHQ/IHAucnVuKHtcblx0XHRcdFx0XHRcdFx0dW50aWw6IHVudGlsVGltZShjbG9jay5ub3cgKyAob3B0aW9ucy52aXJ0dWFsVGltZT8uZHVyYXRpb25NcyA/PyAxMDAwKSksXG5cdFx0XHRcdFx0XHRcdG1heEV2ZW50czogMjAwLFxuXHRcdFx0XHRcdFx0XHRtYXhUcmFjZURlcHRoOiA1LFxuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdDogUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0XHRyZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlID8gcmVzdWx0IDogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0XHRwMixcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGlmICh2aXJ0dWFsVGltZUVuYWJsZWQgJiYgcC5oaXN0b3J5Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IHAuaGlzdG9yeVswXS50aW1lO1xuXHRcdFx0XHRcdFx0Y29uc3QgaGlzdG9yeSA9IGJ1aWxkSGlzdG9yeUZyb21UYXNrcyhwLmhpc3RvcnksIHN0YXJ0VGltZSk7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50Rml4dHVyZV0gJHt0aGVtZUxhYmVsfSB2aXJ0dWFsLXRpbWUgaGlzdG9yeSAoJHtwLmhpc3RvcnkubGVuZ3RofSB0YXNrcyk6XFxuJHtyZW5kZXJTd2ltbGFuZXMoaGlzdG9yeSl9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Ly8gVW5wdXNoIHZpcnR1YWwgdGltZSBzbyB0aGUgcG9zdC1yZW5kZXIgZmxvdyAoc2NyZWVuc2hvdFxuXHRcdFx0XHRcdC8vIGNhcHR1cmUsIHN0YWJpbGl0eSBjaGVja3MsIFx1MjAyNikgcnVucyB3aXRoIHJlYWwgdGltZXJzLlxuXHRcdFx0XHRcdHJlbmRlclRpbWVBcGk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBFdmVyeSByZW5kZXIgZ2V0cyBpdHMgb3duIHRyYWNlIHJvb3Qgc28gdGhhdCBhbnkgZGlhZ25vc3RpY3Ncblx0XHRcdC8vIG91dHB1dCBieSB0aGUgc2NoZWR1bGVyIC8gcHJvY2Vzc29yIHNob3dzIGV4YWN0bHkgd2hpY2ggZml4dHVyZVxuXHRcdFx0Ly8gY2F1c2VkIGVhY2ggcXVldWVkIG9yIGhpc3RvcmljYWwgdGltZXIsIHBsdXMgdGhlIGZ1bGwgY2hhaW4gb2Zcblx0XHRcdC8vIHNldFRpbWVvdXQvckFGIGNhbGxzIHRoYXQgbGVkIHRvIGl0LlxuXHRcdFx0Y29uc3QgZml4dHVyZVJvb3QgPSBjcmVhdGVUcmFjZVJvb3QoYHJlbmRlciMkeysrZml4dHVyZVJlbmRlckNvdW50ZXJ9KCR7dGhlbWVMYWJlbH0pYCk7XG5cblx0XHRcdGF3YWl0IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5Bc0hhbmRsZXIoZml4dHVyZVJvb3QsIGFjdHVhbFJlbmRlciwge1xuXHRcdFx0XHQvLyBUcmFjZS1yZXNldCBlc2NhcGVzIHZpcnR1YWwgdGltZSBzbyBpdCBhY3R1YWxseSBmaXJlcy5cblx0XHRcdFx0YWZ0ZXJNaWNyb3Rhc2tDbG9zdXJlOiBjYiA9PiBuZXh0TWFjcm90YXNrKHJlYWxUaW1lQXBpLCBjYiksXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGlucHV0Lm91dHB1dFRpbWVUcmFjZSAmJiB2aXJ0dWFsVGltZUVuYWJsZWQgJiYgcC5oaXN0b3J5Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gcC5oaXN0b3J5WzBdLnRpbWU7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnkgPSBidWlsZEhpc3RvcnlGcm9tVGFza3MocC5oaXN0b3J5LCBzdGFydFRpbWUpO1xuXHRcdFx0XHRyZXR1cm4geyBvdXRwdXQ6IHJlbmRlclN3aW1sYW5lcyhoaXN0b3J5KSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGUgb3JkZXItZGVwZW5kZW5jeSBiaXNlY3Rpb24gZHJpdmVyIGFza3MgZm9yIHRoZSBsaXN0IG9mIGJ1bmRsZWRcblx0XHRcdC8vIHN0eWxlc2hlZXQgZG9jdW1lbnRzIHNvIGl0IGNhbiBuYW1lIGEgY29uZmxpY3RpbmcgZG9jdW1lbnQgYnkgaW5kZXhcblx0XHRcdC8vIHdpdGhvdXQgaXRzZWxmIHBhcnNpbmcgdGhlIGJ1bmRsZS4gS2VlcGluZyB0aGlzIGtub3dsZWRnZSBpbiB0aGVcblx0XHRcdC8vIHJ1bnRpbWUgbWVhbnMgdGhlIGRyaXZlciBvbmx5IGRlYWxzIGluIGluZGljZXMgYW5kIGltYWdlIGhhc2hlcy5cblx0XHRcdGlmIChpbnB1dC5vdXRwdXRTdHlsZXNoZWV0RmlsZXMpIHtcblx0XHRcdFx0cmV0dXJuIHsgb3V0cHV0OiB7IHN0eWxlc2hlZXRGaWxlczogYXdhaXQgZ2V0U3R5bGVzaGVldERvY3VtZW50RmlsZXMoKSB9IH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IGxhYmVscyA9IHJlc29sdmVMYWJlbHMob3B0aW9ucy5sYWJlbHMpO1xuXHRjb25zdCBhZGRpdGlvbmFsRml4dHVyZXMgPSBPYmplY3QuZnJvbUVudHJpZXMoKG9wdGlvbnMuYWRkaXRpb25hbFRoZW1lcyA/PyBbXSkubWFwKGFkZGl0aW9uYWxUaGVtZSA9PiB7XG5cdFx0Y29uc3QgdGhlbWVWYXJpYW50ID0gYWRkaXRpb25hbFRoZW1lVmFyaWFudHNbYWRkaXRpb25hbFRoZW1lXTtcblx0XHRyZXR1cm4gW3RoZW1lVmFyaWFudC5sYWJlbCwgY3JlYXRlRml4dHVyZSh0aGVtZVZhcmlhbnQpXTtcblx0fSkpO1xuXHRyZXR1cm4gZGVmaW5lRml4dHVyZVZhcmlhbnRzKGxhYmVscy5sZW5ndGggPiAwID8geyBsYWJlbHMgfSA6IHt9LCB7XG5cdFx0RGFyazogY3JlYXRlRml4dHVyZShkYXJrVGhlbWVWYXJpYW50KSxcblx0XHRMaWdodDogY3JlYXRlRml4dHVyZShsaWdodFRoZW1lVmFyaWFudCksXG5cdFx0Li4uYWRkaXRpb25hbEZpeHR1cmVzLFxuXHR9KTtcbn1cblxuaW50ZXJmYWNlIFRoZW1lZEZpeHR1cmVHcm91cE9wdGlvbnMge1xuXHRyZWFkb25seSBwYXRoPzogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbHM/OiBUaGVtZWRGaXh0dXJlR3JvdXBMYWJlbHM7XG59XG5cbnR5cGUgVGhlbWVkRml4dHVyZUdyb3VwRml4dHVyZXMgPSBSZWNvcmQ8c3RyaW5nLCBUaGVtZWRGaXh0dXJlcyB8IFJldHVyblR5cGU8dHlwZW9mIGRlZmluZUZpeHR1cmVHcm91cD4+O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXN0ZWQgZml4dHVyZSBncm91cCBmcm9tIHRoZW1lZCBmaXh0dXJlcy5cbiAqIEUuZy4sIHsgTWVyZ2VFZGl0b3I6IHsgRGFyazogLi4uLCBMaWdodDogLi4uIH0gfSBiZWNvbWVzIGEgbmVzdGVkIGdyb3VwOiBNZXJnZUVkaXRvciA+IERhcmsvTGlnaHRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cChvcHRpb25zOiBUaGVtZWRGaXh0dXJlR3JvdXBPcHRpb25zLCBmaXh0dXJlczogVGhlbWVkRml4dHVyZUdyb3VwRml4dHVyZXMpOiBSZXR1cm5UeXBlPHR5cGVvZiBkZWZpbmVGaXh0dXJlR3JvdXA+O1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cChmaXh0dXJlczogVGhlbWVkRml4dHVyZUdyb3VwRml4dHVyZXMpOiBSZXR1cm5UeXBlPHR5cGVvZiBkZWZpbmVGaXh0dXJlR3JvdXA+O1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cChvcHRpb25zT3JGaXh0dXJlczogVGhlbWVkRml4dHVyZUdyb3VwT3B0aW9ucyB8IFRoZW1lZEZpeHR1cmVHcm91cEZpeHR1cmVzLCBmaXh0dXJlcz86IFRoZW1lZEZpeHR1cmVHcm91cEZpeHR1cmVzKTogUmV0dXJuVHlwZTx0eXBlb2YgZGVmaW5lRml4dHVyZUdyb3VwPiB7XG5cdGlmIChmaXh0dXJlcykge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBvcHRpb25zT3JGaXh0dXJlcyBhcyBUaGVtZWRGaXh0dXJlR3JvdXBPcHRpb25zO1xuXHRcdHJldHVybiBkZWZpbmVGaXh0dXJlR3JvdXAoe1xuXHRcdFx0bGFiZWxzOiByZXNvbHZlTGFiZWxzKG9wdGlvbnMubGFiZWxzKSxcblx0XHRcdHBhdGg6IG9wdGlvbnMucGF0aCxcblx0XHR9LCBmaXh0dXJlcyBhcyBUaGVtZWRGaXh0dXJlR3JvdXBGaXh0dXJlcyk7XG5cdH1cblx0cmV0dXJuIGRlZmluZUZpeHR1cmVHcm91cChvcHRpb25zT3JGaXh0dXJlcyBh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
