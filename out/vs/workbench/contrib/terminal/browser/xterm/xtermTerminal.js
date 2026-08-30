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
import * as dom from "../../../../../base/browser/dom.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ITerminalLogService, TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { XtermTerminalConstants, ITerminalConfigurationService } from "../terminal.js";
import { LogLevel } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { MarkNavigationAddon, ScrollPosition } from "./markNavigationAddon.js";
import { localize } from "../../../../../nls.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { PANEL_BACKGROUND } from "../../../../common/theme.js";
import { TERMINAL_FOREGROUND_COLOR, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, ansiColorIdentifiers, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_BORDER_COLOR, TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR, TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR, TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_OVERVIEW_RULER_BORDER_COLOR } from "../../common/terminalColorRegistry.js";
import { ShellIntegrationAddon } from "../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { DecorationAddon } from "./decorationAddon.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { Emitter } from "../../../../../base/common/event.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TerminalContextKeys } from "../../common/terminalContextKey.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { debounce } from "../../../../../base/common/decorators.js";
import { MouseWheelClassifier } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { StandardWheelEvent } from "../../../../../base/browser/mouseEvent.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { XtermAddonImporter } from "./xtermAddonImporter.js";
import { equals } from "../../../../../base/common/objects.js";
import { isNumber } from "../../../../../base/common/types.js";
import { clamp } from "../../../../../base/common/numbers.js";
import { LayoutSettings } from "../../../../services/layout/browser/layoutService.js";
var RenderConstants = /* @__PURE__ */ ((RenderConstants2) => {
  RenderConstants2[RenderConstants2["SmoothScrollDuration"] = 125] = "SmoothScrollDuration";
  return RenderConstants2;
})(RenderConstants || {});
var TerminalScrollbarWidth = /* @__PURE__ */ ((TerminalScrollbarWidth2) => {
  TerminalScrollbarWidth2[TerminalScrollbarWidth2["Default"] = 14] = "Default";
  TerminalScrollbarWidth2[TerminalScrollbarWidth2["ModernUI"] = 10] = "ModernUI";
  return TerminalScrollbarWidth2;
})(TerminalScrollbarWidth || {});
var TextBlinkConstants = /* @__PURE__ */ ((TextBlinkConstants2) => {
  TextBlinkConstants2[TextBlinkConstants2["IntervalDuration"] = 600] = "IntervalDuration";
  return TextBlinkConstants2;
})(TextBlinkConstants || {});
function getFullBufferLineAsString(lineIndex, buffer) {
  let line = buffer.getLine(lineIndex);
  if (!line) {
    return { lineData: void 0, lineIndex };
  }
  let lineData = line.translateToString(true);
  while (lineIndex > 0 && line.isWrapped) {
    line = buffer.getLine(--lineIndex);
    if (!line) {
      break;
    }
    lineData = line.translateToString(false) + lineData;
  }
  return { lineData, lineIndex };
}
let XtermTerminal = class extends Disposable {
  /**
   * @param xtermCtor The xterm.js constructor, this is passed in so it can be fetched lazily
   * outside of this class such that {@link raw} is not nullable.
   */
  constructor(resource, xtermCtor, options, _onDidExecuteText, _configurationService, _instantiationService, _logService, _notificationService, _themeService, _telemetryService, _terminalConfigurationService, _clipboardService, contextKeyService, _accessibilitySignalService, layoutService) {
    super();
    this._onDidExecuteText = _onDidExecuteText;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._themeService = _themeService;
    this._telemetryService = _telemetryService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._clipboardService = _clipboardService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._isPhysicalMouseWheel = MouseWheelClassifier.INSTANCE.isPhysicalMouseWheel();
    this._progressState = { state: 0, value: 0 };
    this._webglContextLossListener = this._register(new MutableDisposable());
    this._webglAddonLoading = false;
    this._webglAddonLoadId = 0;
    this._ligaturesAddon = this._register(new MutableDisposable());
    this._attachedDisposables = this._register(new DisposableStore());
    this._onDidRequestRunCommand = this._register(new Emitter());
    this.onDidRequestRunCommand = this._onDidRequestRunCommand.event;
    this._onDidRequestCopyAsHtml = this._register(new Emitter());
    this.onDidRequestCopyAsHtml = this._onDidRequestCopyAsHtml.event;
    this._onDidRequestRefreshDimensions = this._register(new Emitter());
    this.onDidRequestRefreshDimensions = this._onDidRequestRefreshDimensions.event;
    this._onDidChangeFindResults = this._register(new Emitter());
    this.onDidChangeFindResults = this._onDidChangeFindResults.event;
    this._onBeforeSearch = this._register(new Emitter());
    this.onBeforeSearch = this._onBeforeSearch.event;
    this._onAfterSearch = this._register(new Emitter());
    this.onAfterSearch = this._onAfterSearch.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidChangeProgress = this._register(new Emitter());
    this.onDidChangeProgress = this._onDidChangeProgress.event;
    this._xtermAddonLoader = options.xtermAddonImporter ?? new XtermAddonImporter();
    this._xtermColorProvider = options.xtermColorProvider;
    this._capabilities = options.capabilities;
    this._disableOverviewRuler = options.disableOverviewRuler ?? false;
    this._mainDocument = layoutService.mainContainer.ownerDocument;
    const font = this._terminalConfigurationService.getFont(dom.getActiveWindow(), void 0, true);
    const config = this._terminalConfigurationService.config;
    const editorOptions = this._configurationService.getValue("editor");
    this.raw = this._register(new xtermCtor({
      allowProposedApi: true,
      cols: options.cols,
      rows: options.rows,
      documentOverride: this._mainDocument,
      altClickMovesCursor: config.altClickMovesCursor && editorOptions.multiCursorModifier === "alt",
      scrollback: config.scrollback,
      theme: this.getXtermTheme(),
      drawBoldTextInBrightColors: config.drawBoldTextInBrightColors,
      fontFamily: font.fontFamily,
      fontWeight: config.fontWeight,
      fontWeightBold: config.fontWeightBold,
      fontSize: font.fontSize,
      letterSpacing: font.letterSpacing,
      lineHeight: font.lineHeight,
      logLevel: vscodeToXtermLogLevel(this._logService.getLevel()),
      logger: this._logService,
      minimumContrastRatio: config.minimumContrastRatio,
      tabStopWidth: config.tabStopWidth,
      cursorBlink: config.cursorBlinking,
      blinkIntervalDuration: config.textBlinking ? 600 /* IntervalDuration */ : 0,
      cursorStyle: vscodeToXtermCursorStyle(config.cursorStyle),
      cursorInactiveStyle: vscodeToXtermCursorStyle(config.cursorStyleInactive),
      cursorWidth: config.cursorWidth,
      macOptionIsMeta: config.macOptionIsMeta,
      macOptionClickForcesSelection: config.macOptionClickForcesSelection,
      rightClickSelectsWord: config.rightClickBehavior === "selectWord",
      fastScrollSensitivity: config.fastScrollSensitivity,
      scrollSensitivity: config.mouseWheelScrollSensitivity,
      scrollOnEraseInDisplay: true,
      wordSeparator: config.wordSeparators,
      scrollbar: this._getScrollbarOptions(),
      ignoreBracketedPasteMode: config.ignoreBracketedPasteMode,
      rescaleOverlappingGlyphs: config.rescaleOverlappingGlyphs,
      vtExtensions: {
        kittyKeyboard: config.enableKittyKeyboardProtocol,
        win32InputMode: config.enableWin32InputMode
      },
      allowTransparency: config.enableImages,
      windowOptions: {
        getWinSizePixels: true,
        getCellSizePixels: true,
        getWinSizeChars: true
      }
    }));
    this._updateSmoothScrolling();
    this._core = this.raw._core;
    if (!options.detached) {
      this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(TerminalSettingId.GpuAcceleration)) {
          XtermTerminal._suggestedRendererType = void 0;
        }
        if (e.affectsConfiguration("terminal.integrated") || e.affectsConfiguration("editor.fastScrollSensitivity") || e.affectsConfiguration("editor.mouseWheelScrollSensitivity") || e.affectsConfiguration("editor.multiCursorModifier") || e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
          this.updateConfig();
        }
        if (e.affectsConfiguration(TerminalSettingId.UnicodeVersion)) {
          this._updateUnicodeVersion();
        }
        if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled)) {
          this._updateTheme();
        }
      }));
      this._register(this._themeService.onDidColorThemeChange((theme) => this._updateTheme(theme)));
      this._register(this._logService.onDidChangeLogLevel((e) => this.raw.options.logLevel = vscodeToXtermLogLevel(e)));
    }
    this._register(this.raw.onSelectionChange(() => {
      this._onDidChangeSelection.fire();
      if (this.isFocused) {
        this._anyFocusedTerminalHasSelection.set(this.raw.hasSelection());
      }
    }));
    this._register(this.raw.onData((e) => this._lastInputEvent = e));
    this._updateUnicodeVersion();
    this._markNavigationAddon = this._instantiationService.createInstance(MarkNavigationAddon, options.capabilities);
    this.raw.loadAddon(this._markNavigationAddon);
    this._decorationAddon = this._instantiationService.createInstance(DecorationAddon, resource, this._capabilities);
    this._register(this._decorationAddon.onDidRequestRunCommand((e) => this._onDidRequestRunCommand.fire(e)));
    this._register(this._decorationAddon.onDidRequestCopyAsHtml((e) => this._onDidRequestCopyAsHtml.fire(e)));
    this.raw.loadAddon(this._decorationAddon);
    this._shellIntegrationAddon = new ShellIntegrationAddon(options.shellIntegrationNonce ?? "", options.disableShellIntegrationReporting, this._onDidExecuteText, this._telemetryService, this._logService);
    this.raw.loadAddon(this._shellIntegrationAddon);
    this._xtermAddonLoader.importAddon("clipboard").then((ClipboardAddon) => {
      if (this._store.isDisposed) {
        return;
      }
      this._clipboardAddon = this._instantiationService.createInstance(ClipboardAddon, void 0, {
        async readText(type) {
          return _clipboardService.readText(type === "p" ? "selection" : "clipboard");
        },
        async writeText(type, text) {
          return _clipboardService.writeText(text, type === "p" ? "selection" : "clipboard");
        }
      });
      this.raw.loadAddon(this._clipboardAddon);
    });
    this._xtermAddonLoader.importAddon("progress").then((ProgressAddon) => {
      if (this._store.isDisposed) {
        return;
      }
      const progressAddon = this._instantiationService.createInstance(ProgressAddon);
      this.raw.loadAddon(progressAddon);
      const updateProgress = () => {
        if (!equals(this._progressState, progressAddon.progress)) {
          this._progressState = progressAddon.progress;
          this._onDidChangeProgress.fire(this._progressState);
        }
      };
      this._register(progressAddon.onChange(() => updateProgress()));
      updateProgress();
      const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
      if (commandDetection) {
        this._register(commandDetection.onCommandFinished(() => progressAddon.progress = { state: 0, value: 0 }));
      } else {
        const disposable = this._capabilities.onDidAddCapability((e) => {
          if (e.id === TerminalCapability.CommandDetection) {
            this._register(e.capability.onCommandFinished(() => progressAddon.progress = { state: 0, value: 0 }));
            this._store.delete(disposable);
          }
        });
        this._store.add(disposable);
      }
    });
    this._anyTerminalFocusContextKey = TerminalContextKeys.focusInAny.bindTo(contextKeyService);
    this._anyFocusedTerminalHasSelection = TerminalContextKeys.textSelectedInFocused.bindTo(contextKeyService);
  }
  get lastInputEvent() {
    return this._lastInputEvent;
  }
  get progressState() {
    return this._progressState;
  }
  get buffer() {
    return this.raw.buffer;
  }
  get cols() {
    return this.raw.cols;
  }
  get findResult() {
    return this._lastFindResult;
  }
  get isStdinDisabled() {
    return !!this.raw.options.disableStdin;
  }
  get isGpuAccelerated() {
    return !!this._webglAddon;
  }
  get isImageAddonLoaded() {
    return !!this._imageAddon;
  }
  get markTracker() {
    return this._markNavigationAddon;
  }
  get shellIntegration() {
    return this._shellIntegrationAddon;
  }
  get decorationAddon() {
    return this._decorationAddon;
  }
  get textureAtlas() {
    const canvas = this._webglAddon?.textureAtlas;
    if (!canvas) {
      return void 0;
    }
    return createImageBitmap(canvas);
  }
  get isFocused() {
    if (!this.raw.element) {
      return false;
    }
    return dom.isAncestorOfActiveElement(this.raw.element);
  }
  *getBufferReverseIterator() {
    for (let i = this.raw.buffer.active.length - 1; i >= 0; i--) {
      const { lineData, lineIndex } = getFullBufferLineAsString(i, this.raw.buffer.active);
      if (lineData) {
        i = lineIndex;
        yield lineData;
      }
    }
  }
  getContentsAsText(startMarker, endMarker) {
    const lines = [];
    const buffer = this.raw.buffer.active;
    if (endMarker?.line === -1) {
      throw new Error("Cannot get contents of a disposed endMarker");
    }
    const startLine = startMarker === void 0 || startMarker.line === -1 ? 0 : startMarker.line;
    const endLine = endMarker?.line ?? buffer.length - 1;
    for (let y = startLine; y <= endLine; y++) {
      lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
    }
    return lines.join("\n");
  }
  async getContentsAsHtml() {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    return this._serializeAddon.serializeAsHTML();
  }
  async getCommandOutputAsHtml(command, maxLines) {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    let startLine;
    let startCol;
    if (command.executedMarker && command.executedMarker.line >= 0) {
      startLine = command.executedMarker.line;
      startCol = Math.max(command.executedX ?? 0, 0);
    } else {
      startLine = command.marker?.line !== void 0 ? command.marker.line + 1 : 1;
      startCol = Math.max(command.startX ?? 0, 0);
    }
    let endLine = command.endMarker?.line !== void 0 ? command.endMarker.line - 1 : this.raw.buffer.active.length - 1;
    if (endLine < startLine) {
      return { text: "", truncated: false };
    }
    let emptyLinesFromEnd = 0;
    for (let i = endLine; i >= startLine; i--) {
      const line = this.raw.buffer.active.getLine(i);
      if (line && line.translateToString(true).trim() === "") {
        emptyLinesFromEnd++;
      } else {
        break;
      }
    }
    endLine = endLine - emptyLinesFromEnd;
    let emptyLinesFromStart = 0;
    for (let i = startLine; i <= endLine; i++) {
      const line = this.raw.buffer.active.getLine(i);
      if (line && line.translateToString(true, i === startLine ? startCol : void 0).trim() === "") {
        if (i === startLine) {
          startCol = 0;
        }
        emptyLinesFromStart++;
      } else {
        break;
      }
    }
    startLine = startLine + emptyLinesFromStart;
    if (maxLines && endLine - startLine > maxLines) {
      startLine = endLine - maxLines;
      startCol = 0;
    }
    const bufferLine = this.raw.buffer.active.getLine(startLine);
    if (bufferLine) {
      startCol = Math.min(startCol, bufferLine.length);
    }
    const range = { startLine, endLine, startCol };
    const result = this._serializeAddon.serializeAsHTML({ range });
    return { text: result, truncated: endLine - startLine >= maxLines };
  }
  async getSelectionAsHtml(command) {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    if (command) {
      const length = command.getOutput()?.length;
      const row = command.marker?.line;
      if (!length || !row) {
        throw new Error(`No row ${row} or output length ${length} for command ${command}`);
      }
      this.raw.select(0, row + 1, length - Math.floor(length / this.raw.cols));
    }
    const result = this._serializeAddon.serializeAsHTML({ onlySelection: true });
    if (command) {
      this.raw.clearSelection();
    }
    return result;
  }
  attachToElement(container, partialOptions) {
    const options = { enableGpu: true, ...partialOptions };
    if (!this._attached) {
      this.raw.open(container);
    }
    if (options.enableGpu) {
      if (this._shouldLoadWebgl()) {
        this._enableWebglRenderer();
      }
    }
    if (!this.raw.element || !this.raw.textarea) {
      throw new Error("xterm elements not set after open");
    }
    const ad = this._attachedDisposables;
    ad.clear();
    ad.add(dom.addDisposableListener(this.raw.textarea, "focus", () => this._setFocused(true)));
    ad.add(dom.addDisposableListener(this.raw.textarea, "blur", () => this._setFocused(false)));
    ad.add(dom.addDisposableListener(this.raw.textarea, "focusout", () => this._setFocused(false)));
    ad.add(dom.addDisposableListener(this.raw.element, dom.EventType.MOUSE_WHEEL, (e) => {
      const classifier = MouseWheelClassifier.INSTANCE;
      classifier.acceptStandardWheelEvent(new StandardWheelEvent(e));
      const value = classifier.isPhysicalMouseWheel();
      if (value !== this._isPhysicalMouseWheel) {
        this._isPhysicalMouseWheel = value;
        this._updateSmoothScrolling();
      }
    }, { passive: true }));
    this._refreshLigaturesAddon();
    this._attached = { container, options };
    return this._attached?.container.querySelector(".xterm-screen");
  }
  _setFocused(isFocused) {
    this._onDidChangeFocus.fire(isFocused);
    this._anyTerminalFocusContextKey.set(isFocused);
    this._anyFocusedTerminalHasSelection.set(isFocused && this.raw.hasSelection());
  }
  write(data, callback) {
    this.raw.write(data, callback);
  }
  resize(columns, rows) {
    this._logService.debug("resizing", columns, rows);
    this.raw.resize(columns, rows);
  }
  updateLogLevel() {
    this.raw.options.logLevel = vscodeToXtermLogLevel(this._logService.getLevel());
  }
  /**
   * The width, in pixels, of the vertical scrollbar. Narrower under the Modern
   * UI Update experiment so it matches the modernized workbench scrollbars.
   */
  get scrollbarWidth() {
    return this._configurationService.getValue(LayoutSettings.MODERN_UI) === true ? 10 /* ModernUI */ : 14 /* Default */;
  }
  /**
   * Builds the xterm.js `scrollbar` option using {@link scrollbarWidth}. Returns
   * `undefined` when the overview ruler is disabled (e.g. detached terminals).
   */
  _getScrollbarOptions() {
    if (this._disableOverviewRuler) {
      return void 0;
    }
    return {
      width: this.scrollbarWidth,
      overviewRuler: {
        showTopBorder: true
      }
    };
  }
  updateConfig() {
    const config = this._terminalConfigurationService.config;
    this.raw.options.altClickMovesCursor = config.altClickMovesCursor;
    this._setCursorBlink(config.cursorBlinking);
    this._setTextBlinking(config.textBlinking);
    this._setCursorStyle(config.cursorStyle);
    this._setCursorStyleInactive(config.cursorStyleInactive);
    this._setCursorWidth(config.cursorWidth);
    this.raw.options.scrollback = config.scrollback;
    this.raw.options.drawBoldTextInBrightColors = config.drawBoldTextInBrightColors;
    this.raw.options.minimumContrastRatio = config.minimumContrastRatio;
    this.raw.options.tabStopWidth = config.tabStopWidth;
    this.raw.options.fastScrollSensitivity = config.fastScrollSensitivity;
    this.raw.options.scrollSensitivity = config.mouseWheelScrollSensitivity;
    this.raw.options.macOptionIsMeta = config.macOptionIsMeta;
    const editorOptions = this._configurationService.getValue("editor");
    this.raw.options.altClickMovesCursor = config.altClickMovesCursor && editorOptions.multiCursorModifier === "alt";
    this.raw.options.macOptionClickForcesSelection = config.macOptionClickForcesSelection;
    this.raw.options.rightClickSelectsWord = config.rightClickBehavior === "selectWord";
    this.raw.options.wordSeparator = config.wordSeparators;
    this.raw.options.scrollbar = this._getScrollbarOptions();
    this.raw.options.ignoreBracketedPasteMode = config.ignoreBracketedPasteMode;
    this.raw.options.rescaleOverlappingGlyphs = config.rescaleOverlappingGlyphs;
    this.raw.options.allowTransparency = config.enableImages;
    this.raw.options.vtExtensions = {
      kittyKeyboard: config.enableKittyKeyboardProtocol,
      win32InputMode: config.enableWin32InputMode
    };
    this._updateSmoothScrolling();
    if (this._attached) {
      if (this._attached.options.enableGpu) {
        if (this._shouldLoadWebgl()) {
          this._enableWebglRenderer();
        } else {
          this._disposeOfWebglRenderer();
        }
      }
      this._refreshLigaturesAddon();
    }
  }
  _updateSmoothScrolling() {
    this.raw.options.smoothScrollDuration = this._terminalConfigurationService.config.smoothScrolling && this._isPhysicalMouseWheel ? 125 /* SmoothScrollDuration */ : 0;
  }
  _shouldLoadWebgl() {
    return this._terminalConfigurationService.config.gpuAcceleration === "auto" && XtermTerminal._suggestedRendererType === void 0 || this._terminalConfigurationService.config.gpuAcceleration === "on";
  }
  forceRedraw() {
    this.raw.clearTextureAtlas();
  }
  clearDecorations() {
    this._decorationAddon?.clearDecorations();
  }
  forceRefresh() {
    this._core.viewport?._innerRefresh();
  }
  async findNext(term, searchOptions) {
    this._updateFindColors(searchOptions);
    return (await this._getSearchAddon()).findNext(term, searchOptions);
  }
  async findPrevious(term, searchOptions) {
    this._updateFindColors(searchOptions);
    return (await this._getSearchAddon()).findPrevious(term, searchOptions);
  }
  _updateFindColors(searchOptions) {
    const theme = this._themeService.getColorTheme();
    const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
    const findMatchBackground = theme.getColor(TERMINAL_FIND_MATCH_BACKGROUND_COLOR);
    const findMatchBorder = theme.getColor(TERMINAL_FIND_MATCH_BORDER_COLOR);
    const findMatchOverviewRuler = theme.getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
    const findMatchHighlightBackground = theme.getColor(TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR);
    const findMatchHighlightBorder = theme.getColor(TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR);
    const findMatchHighlightOverviewRuler = theme.getColor(TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR);
    searchOptions.decorations = {
      activeMatchBackground: findMatchBackground?.toString(),
      activeMatchBorder: findMatchBorder?.toString() || "transparent",
      activeMatchColorOverviewRuler: findMatchOverviewRuler?.toString() || "transparent",
      // decoration bgs don't support the alpha channel so blend it with the regular bg
      matchBackground: terminalBackground ? findMatchHighlightBackground?.blend(terminalBackground).toString() : void 0,
      matchBorder: findMatchHighlightBorder?.toString() || "transparent",
      matchOverviewRuler: findMatchHighlightOverviewRuler?.toString() || "transparent"
    };
  }
  _getSearchAddon() {
    if (!this._searchAddonPromise) {
      this._searchAddonPromise = this._xtermAddonLoader.importAddon("search").then((AddonCtor) => {
        if (this._store.isDisposed) {
          return Promise.reject("Could not create search addon, terminal is disposed");
        }
        this._searchAddon = new AddonCtor({ highlightLimit: XtermTerminalConstants.SearchHighlightLimit });
        this.raw.loadAddon(this._searchAddon);
        this._store.add(this._searchAddon.onDidChangeResults((results) => {
          this._lastFindResult = results;
          this._onDidChangeFindResults.fire(results);
        }));
        this._store.add(this._searchAddon.onBeforeSearch(() => {
          this._onBeforeSearch.fire();
        }));
        this._store.add(this._searchAddon.onAfterSearch(() => {
          this._onAfterSearch.fire();
        }));
        return this._searchAddon;
      });
    }
    return this._searchAddonPromise;
  }
  clearSearchDecorations() {
    this._searchAddon?.clearDecorations();
  }
  clearActiveSearchDecoration() {
    this._searchAddon?.clearActiveDecoration();
  }
  getFont() {
    return this._terminalConfigurationService.getFont(dom.getWindow(this.raw.element), this._core);
  }
  getLongestViewportWrappedLineLength() {
    let maxLineLength = 0;
    for (let i = this.raw.buffer.active.length - 1; i >= this.raw.buffer.active.viewportY; i--) {
      const lineInfo = this._getWrappedLineCount(i, this.raw.buffer.active);
      maxLineLength = Math.max(maxLineLength, lineInfo.lineCount * this.raw.cols - lineInfo.endSpaces || 0);
      i = lineInfo.currentIndex;
    }
    return maxLineLength;
  }
  _getWrappedLineCount(index, buffer) {
    let line = buffer.getLine(index);
    if (!line) {
      throw new Error("Could not get line");
    }
    let currentIndex = index;
    let endSpaces = 0;
    for (let i = Math.min(line.length, this.raw.cols) - 1; i >= 0; i--) {
      if (!line?.getCell(i)?.getChars()) {
        endSpaces++;
      } else {
        break;
      }
    }
    while (line?.isWrapped && currentIndex > 0) {
      currentIndex--;
      line = buffer.getLine(currentIndex);
    }
    return { lineCount: index - currentIndex + 1, currentIndex, endSpaces };
  }
  scrollDownLine() {
    this.raw.scrollLines(1);
  }
  scrollDownPage() {
    this.raw.scrollPages(1);
  }
  scrollToBottom() {
    this.raw.scrollToBottom();
  }
  scrollUpLine() {
    this.raw.scrollLines(-1);
  }
  scrollUpPage() {
    this.raw.scrollPages(-1);
  }
  scrollToTop() {
    this.raw.scrollToTop();
  }
  scrollToLine(line, position = ScrollPosition.Top) {
    this.markTracker.scrollToLine(line, position);
  }
  clearBuffer() {
    this.raw.clear();
    this._capabilities.get(TerminalCapability.CommandDetection)?.handlePromptStart();
    this._capabilities.get(TerminalCapability.CommandDetection)?.handleCommandStart();
    this._accessibilitySignalService.playSignal(AccessibilitySignal.clear);
  }
  reset() {
    this.raw.reset();
  }
  hasSelection() {
    return this.raw.hasSelection();
  }
  clearSelection() {
    this.raw.clearSelection();
  }
  selectMarkedRange(fromMarkerId, toMarkerId, scrollIntoView = false) {
    const detectionCapability = this.shellIntegration.capabilities.get(TerminalCapability.BufferMarkDetection);
    if (!detectionCapability) {
      return;
    }
    const start = detectionCapability.getMark(fromMarkerId);
    const end = detectionCapability.getMark(toMarkerId);
    if (start === void 0 || end === void 0) {
      return;
    }
    this.raw.selectLines(start.line, end.line);
    if (scrollIntoView) {
      this.raw.scrollToLine(start.line);
    }
  }
  selectAll() {
    this.raw.focus();
    this.raw.selectAll();
  }
  focus() {
    this.raw.focus();
  }
  async copySelection(asHtml, command) {
    if (this.hasSelection() || asHtml && command) {
      if (asHtml) {
        let listener2 = function(e) {
          if (e.clipboardData) {
            if (!e.clipboardData.types.includes("text/plain")) {
              e.clipboardData.setData("text/plain", command?.getOutput() ?? "");
            }
            e.clipboardData.setData("text/html", textAsHtml);
          }
          e.preventDefault();
        };
        var listener = listener2;
        const textAsHtml = await this.getSelectionAsHtml(command);
        const doc = dom.getDocument(this.raw.element);
        doc.addEventListener("copy", listener2);
        doc.execCommand("copy");
        doc.removeEventListener("copy", listener2);
      } else {
        await this._clipboardService.writeText(this.raw.getSelection());
      }
    } else {
      this._notificationService.warn(localize("terminal.integrated.copySelection.noSelection", "The terminal has no selection to copy"));
    }
  }
  _setCursorBlink(blink) {
    if (this.raw.options.cursorBlink !== blink) {
      this.raw.options.cursorBlink = blink;
      this.raw.refresh(0, this.raw.rows - 1);
    }
  }
  _setTextBlinking(enabled) {
    const blinkIntervalDuration = enabled ? 600 /* IntervalDuration */ : 0;
    const options = this.raw.options;
    if (options.blinkIntervalDuration !== blinkIntervalDuration) {
      options.blinkIntervalDuration = blinkIntervalDuration;
    }
  }
  _setCursorStyle(style) {
    const mapped = vscodeToXtermCursorStyle(style);
    if (this.raw.options.cursorStyle !== mapped) {
      this.raw.options.cursorStyle = mapped;
    }
  }
  _setCursorStyleInactive(style) {
    const mapped = vscodeToXtermCursorStyle(style);
    if (this.raw.options.cursorInactiveStyle !== mapped) {
      this.raw.options.cursorInactiveStyle = mapped;
    }
  }
  _setCursorWidth(width) {
    if (this.raw.options.cursorWidth !== width) {
      this.raw.options.cursorWidth = width;
    }
  }
  async _enableWebglRenderer() {
    if (!this.raw.element) {
      return;
    }
    const customGlyphs = this._getWebglCustomGlyphs();
    if ((this._webglAddon || this._webglAddonLoading) && this._webglAddonCustomGlyphs === customGlyphs) {
      return;
    }
    this._disposeOfWebglRenderer();
    const loadId = this._webglAddonLoadId;
    this._webglAddonLoading = true;
    this._webglAddonCustomGlyphs = customGlyphs;
    let Addon;
    try {
      Addon = await this._xtermAddonLoader.importAddon("webgl");
    } catch (error) {
      if (loadId === this._webglAddonLoadId) {
        this._webglAddonLoading = false;
        this._webglAddonCustomGlyphs = void 0;
      }
      throw error;
    }
    if (loadId !== this._webglAddonLoadId) {
      return;
    }
    this._webglAddonLoading = false;
    if (!this.raw.element) {
      this._webglAddonCustomGlyphs = void 0;
      return;
    }
    const currentCustomGlyphs = this._getWebglCustomGlyphs();
    if (customGlyphs !== currentCustomGlyphs) {
      this._webglAddonCustomGlyphs = void 0;
      await this._enableWebglRenderer();
      return;
    }
    this._webglAddon = new Addon({
      customGlyphs
    });
    try {
      this.raw.loadAddon(this._webglAddon);
      this._logService.trace("Webgl was loaded");
      this._webglContextLossListener.value = this._webglAddon.onContextLoss(() => {
        this._logService.info(`Webgl lost context, disposing of webgl renderer`);
        this._disposeOfWebglRenderer();
      });
      this._refreshImageAddon();
      this._onDidRequestRefreshDimensions.fire();
    } catch (e) {
      this._logService.warn(`Webgl could not be loaded. Falling back to the DOM renderer`, e);
      XtermTerminal._suggestedRendererType = "dom";
      this._disposeOfWebglRenderer();
    }
  }
  _getWebglCustomGlyphs() {
    return this._terminalConfigurationService.config.customGlyphs && this.raw.element?.ownerDocument === this._mainDocument;
  }
  async _refreshLigaturesAddon() {
    if (!this.raw.element) {
      return;
    }
    const ligaturesConfig = this._terminalConfigurationService.config.fontLigatures;
    let shouldRecreateWebglRenderer = false;
    if (ligaturesConfig?.enabled) {
      const ligatureOptions = {
        fontFeatureSettings: ligaturesConfig.featureSettings,
        fallbackLigatures: ligaturesConfig.fallbackLigatures
      };
      if (this._ligaturesAddon.value && !equals(ligatureOptions, this._ligaturesAddonConfig)) {
        this._ligaturesAddon.clear();
        this._ligaturesAddonConfig = void 0;
      }
      if (!this._ligaturesAddon.value) {
        const LigaturesAddon = await this._xtermAddonLoader.importAddon("ligatures");
        if (this._store.isDisposed) {
          return;
        }
        this._ligaturesAddon.value = this._instantiationService.createInstance(LigaturesAddon, ligatureOptions);
        this._ligaturesAddonConfig = ligatureOptions;
        this.raw.loadAddon(this._ligaturesAddon.value);
        shouldRecreateWebglRenderer = true;
      }
    } else {
      if (!this._ligaturesAddon.value) {
        return;
      }
      this._ligaturesAddon.clear();
      this._ligaturesAddonConfig = void 0;
      shouldRecreateWebglRenderer = true;
    }
    if (shouldRecreateWebglRenderer && this._webglAddon) {
      this._disposeOfWebglRenderer();
      await this._enableWebglRenderer();
    }
  }
  async _refreshImageAddon() {
    if (this._terminalConfigurationService.config.enableImages && this._webglAddon) {
      if (!this._imageAddon) {
        const AddonCtor = await this._xtermAddonLoader.importAddon("image");
        this._imageAddon = new AddonCtor();
        this.raw.loadAddon(this._imageAddon);
        this._telemetryService.publicLog2("terminal/imageAddonActivated");
        this._register(this._imageAddon.onImageAdded(() => {
          this._telemetryService.publicLog2("terminal/imageAdded");
        }));
      }
    } else {
      try {
        this._imageAddon?.dispose();
      } catch {
      }
      this._imageAddon = void 0;
    }
  }
  _disposeOfWebglRenderer() {
    this._webglAddonLoadId++;
    this._webglAddonLoading = false;
    this._webglAddonCustomGlyphs = void 0;
    this._webglContextLossListener.clear();
    if (!this._webglAddon) {
      return;
    }
    try {
      this._webglAddon?.dispose();
    } catch {
    }
    this._webglAddon = void 0;
    this._refreshImageAddon();
    this._onDidRequestRefreshDimensions.fire();
  }
  async getRangeAsVT(startMarker, endMarker, skipLastLine) {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    const lastLine = this.raw.buffer.active.length - 1;
    if (lastLine < 0) {
      return "";
    }
    const hasValidEndMarker = isNumber(endMarker?.line);
    const start = clamp(isNumber(startMarker?.line) && startMarker.line > -1 ? startMarker.line : 0, 0, lastLine);
    let end = hasValidEndMarker ? endMarker.line : this.raw.buffer.active.length - 1;
    if (skipLastLine && hasValidEndMarker) {
      end = end - 1;
    }
    end = clamp(Math.max(end, start), start, lastLine);
    return this._serializeAddon.serialize({
      range: {
        start,
        end
      }
    });
  }
  getXtermTheme(theme) {
    if (!theme) {
      theme = this._themeService.getColorTheme();
    }
    const config = this._terminalConfigurationService.config;
    const hideOverviewRuler = ["never", "gutter"].includes(config.shellIntegration?.decorationsEnabled ?? "");
    const foregroundColor = theme.getColor(TERMINAL_FOREGROUND_COLOR);
    const backgroundColor = this._xtermColorProvider.getBackgroundColor(theme);
    const cursorColor = theme.getColor(TERMINAL_CURSOR_FOREGROUND_COLOR) || foregroundColor;
    const cursorAccentColor = theme.getColor(TERMINAL_CURSOR_BACKGROUND_COLOR) || backgroundColor;
    const selectionBackgroundColor = theme.getColor(TERMINAL_SELECTION_BACKGROUND_COLOR);
    const selectionInactiveBackgroundColor = theme.getColor(TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR);
    const selectionForegroundColor = theme.getColor(TERMINAL_SELECTION_FOREGROUND_COLOR) || void 0;
    return {
      background: backgroundColor?.toString(),
      foreground: foregroundColor?.toString(),
      cursor: cursorColor?.toString(),
      cursorAccent: cursorAccentColor?.toString(),
      selectionBackground: selectionBackgroundColor?.toString(),
      selectionInactiveBackground: selectionInactiveBackgroundColor?.toString(),
      selectionForeground: selectionForegroundColor?.toString(),
      overviewRulerBorder: hideOverviewRuler ? "#0000" : theme.getColor(TERMINAL_OVERVIEW_RULER_BORDER_COLOR)?.toString(),
      scrollbarSliderActiveBackground: theme.getColor(scrollbarSliderActiveBackground)?.toString(),
      scrollbarSliderBackground: theme.getColor(scrollbarSliderBackground)?.toString(),
      scrollbarSliderHoverBackground: theme.getColor(scrollbarSliderHoverBackground)?.toString(),
      black: theme.getColor(ansiColorIdentifiers[0])?.toString(),
      red: theme.getColor(ansiColorIdentifiers[1])?.toString(),
      green: theme.getColor(ansiColorIdentifiers[2])?.toString(),
      yellow: theme.getColor(ansiColorIdentifiers[3])?.toString(),
      blue: theme.getColor(ansiColorIdentifiers[4])?.toString(),
      magenta: theme.getColor(ansiColorIdentifiers[5])?.toString(),
      cyan: theme.getColor(ansiColorIdentifiers[6])?.toString(),
      white: theme.getColor(ansiColorIdentifiers[7])?.toString(),
      brightBlack: theme.getColor(ansiColorIdentifiers[8])?.toString(),
      brightRed: theme.getColor(ansiColorIdentifiers[9])?.toString(),
      brightGreen: theme.getColor(ansiColorIdentifiers[10])?.toString(),
      brightYellow: theme.getColor(ansiColorIdentifiers[11])?.toString(),
      brightBlue: theme.getColor(ansiColorIdentifiers[12])?.toString(),
      brightMagenta: theme.getColor(ansiColorIdentifiers[13])?.toString(),
      brightCyan: theme.getColor(ansiColorIdentifiers[14])?.toString(),
      brightWhite: theme.getColor(ansiColorIdentifiers[15])?.toString()
    };
  }
  _updateTheme(theme) {
    this.raw.options.theme = this.getXtermTheme(theme);
  }
  /**
   * Updates the terminal theme. Use this to externally trigger a theme
   * refresh for detached terminals that skip global service listeners.
   */
  updateTheme() {
    this._updateTheme();
  }
  refresh() {
    this._updateTheme();
    this._decorationAddon.refreshLayouts();
    if (this._webglAddon || this._webglAddonLoading) {
      this._enableWebglRenderer();
    }
  }
  async _updateUnicodeVersion() {
    if (!this._unicode11Addon && this._terminalConfigurationService.config.unicodeVersion === "11") {
      const Addon = await this._xtermAddonLoader.importAddon("unicode11");
      this._unicode11Addon = new Addon();
      this.raw.loadAddon(this._unicode11Addon);
    }
    if (this.raw.unicode.activeVersion !== this._terminalConfigurationService.config.unicodeVersion) {
      this.raw.unicode.activeVersion = this._terminalConfigurationService.config.unicodeVersion;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _writeText(data) {
    this.raw.write(data);
  }
  dispose() {
    this._anyTerminalFocusContextKey.reset();
    this._anyFocusedTerminalHasSelection.reset();
    this._disposeOfWebglRenderer();
    this._onDidDispose.fire();
    super.dispose();
  }
};
XtermTerminal._suggestedRendererType = void 0;
__decorateClass([
  debounce(100)
], XtermTerminal.prototype, "_refreshLigaturesAddon", 1);
__decorateClass([
  debounce(100)
], XtermTerminal.prototype, "_refreshImageAddon", 1);
XtermTerminal = __decorateClass([
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITerminalLogService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ITerminalConfigurationService),
  __decorateParam(11, IClipboardService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IAccessibilitySignalService),
  __decorateParam(14, ILayoutService)
], XtermTerminal);
function getXtermScaledDimensions(w, font, width, height) {
  if (!font.charWidth || !font.charHeight) {
    return null;
  }
  const scaledWidthAvailable = width * w.devicePixelRatio;
  const scaledCharWidth = font.charWidth * w.devicePixelRatio + font.letterSpacing;
  const cols = Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
  const scaledHeightAvailable = height * w.devicePixelRatio;
  const scaledCharHeight = Math.ceil(font.charHeight * w.devicePixelRatio);
  const scaledLineHeight = Math.floor(scaledCharHeight * font.lineHeight);
  const rows = Math.max(Math.floor(scaledHeightAvailable / scaledLineHeight), 1);
  return { rows, cols };
}
function vscodeToXtermLogLevel(logLevel) {
  switch (logLevel) {
    case LogLevel.Trace:
      return "trace";
    case LogLevel.Debug:
      return "debug";
    case LogLevel.Info:
      return "info";
    case LogLevel.Warning:
      return "warn";
    case LogLevel.Error:
      return "error";
    default:
      return "off";
  }
}
function vscodeToXtermCursorStyle(style) {
  if (style === "line") {
    return "bar";
  }
  return style;
}
export {
  XtermTerminal,
  getXtermScaledDimensions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx4dGVybVxceHRlcm1UZXJtaW5hbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgSUJ1ZmZlciwgSVRlcm1pbmFsT3B0aW9ucywgSVRoZW1lLCBUZXJtaW5hbCBhcyBSYXdYdGVybVRlcm1pbmFsLCBMb2dMZXZlbCBhcyBYdGVybUxvZ0xldmVsLCBJTWFya2VyIGFzIElYdGVybU1hcmtlciB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgdHlwZSB7IElTZWFyY2hPcHRpb25zLCBTZWFyY2hBZGRvbiBhcyBTZWFyY2hBZGRvblR5cGUgfSBmcm9tICdAeHRlcm0vYWRkb24tc2VhcmNoJztcbmltcG9ydCB0eXBlIHsgVW5pY29kZTExQWRkb24gYXMgVW5pY29kZTExQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXVuaWNvZGUxMSc7XG5pbXBvcnQgdHlwZSB7IElMaWdhdHVyZU9wdGlvbnMsIExpZ2F0dXJlc0FkZG9uIGFzIExpZ2F0dXJlc0FkZG9uVHlwZSB9IGZyb20gJ0B4dGVybS9hZGRvbi1saWdhdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBXZWJnbEFkZG9uIGFzIFdlYmdsQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXdlYmdsJztcbmltcG9ydCB0eXBlIHsgU2VyaWFsaXplQWRkb24gYXMgU2VyaWFsaXplQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXNlcmlhbGl6ZSc7XG5pbXBvcnQgdHlwZSB7IEltYWdlQWRkb24gYXMgSW1hZ2VBZGRvblR5cGUgfSBmcm9tICdAeHRlcm0vYWRkb24taW1hZ2UnO1xuaW1wb3J0IHR5cGUgeyBDbGlwYm9hcmRBZGRvbiBhcyBDbGlwYm9hcmRBZGRvblR5cGUgfSBmcm9tICdAeHRlcm0vYWRkb24tY2xpcGJvYXJkJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElYdGVybUNvcmUgfSBmcm9tICcuLi94dGVybS1wcml2YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVNoZWxsSW50ZWdyYXRpb24sIElUZXJtaW5hbExvZ1NlcnZpY2UsIFRlcm1pbmFsU2V0dGluZ0lkLCB0eXBlIElEZWNvcmF0aW9uQWRkb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsRm9udCwgSVRlcm1pbmFsQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJTWFya1RyYWNrZXIsIElJbnRlcm5hbFh0ZXJtVGVybWluYWwsIElYdGVybVRlcm1pbmFsLCBJWHRlcm1Db2xvclByb3ZpZGVyLCBYdGVybVRlcm1pbmFsQ29uc3RhbnRzLCBJWHRlcm1BdHRhY2hUb0VsZW1lbnRPcHRpb25zLCBJRGV0YWNoZWRYdGVybVRlcm1pbmFsLCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrTmF2aWdhdGlvbkFkZG9uLCBTY3JvbGxQb3NpdGlvbiB9IGZyb20gJy4vbWFya05hdmlnYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBURVJNSU5BTF9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9DVVJTT1JfRk9SRUdST1VORF9DT0xPUiwgVEVSTUlOQUxfQ1VSU09SX0JBQ0tHUk9VTkRfQ09MT1IsIGFuc2lDb2xvcklkZW50aWZpZXJzLCBURVJNSU5BTF9TRUxFQ1RJT05fQkFDS0dST1VORF9DT0xPUiwgVEVSTUlOQUxfRklORF9NQVRDSF9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GSU5EX01BVENIX0hJR0hMSUdIVF9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GSU5EX01BVENIX0JPUkRFUl9DT0xPUiwgVEVSTUlOQUxfT1ZFUlZJRVdfUlVMRVJfRklORF9NQVRDSF9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GSU5EX01BVENIX0hJR0hMSUdIVF9CT1JERVJfQ09MT1IsIFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9TRUxFQ1RJT05fRk9SRUdST1VORF9DT0xPUiwgVEVSTUlOQUxfSU5BQ1RJVkVfU0VMRUNUSU9OX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0JPUkRFUl9DT0xPUiB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3h0ZXJtL3NoZWxsSW50ZWdyYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERlY29yYXRpb25BZGRvbiB9IGZyb20gJy4vZGVjb3JhdGlvbkFkZG9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSwgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBNb3VzZVdoZWVsQ2xhc3NpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCwgU3RhbmRhcmRXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kLCBzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kLCBzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBYdGVybUFkZG9uSW1wb3J0ZXIgfSBmcm9tICcuL3h0ZXJtQWRkb25JbXBvcnRlci5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB0eXBlIHsgSVByb2dyZXNzU3RhdGUgfSBmcm9tICdAeHRlcm0vYWRkb24tcHJvZ3Jlc3MnO1xuaW1wb3J0IHR5cGUgeyBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IExheW91dFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5cbmNvbnN0IGVudW0gUmVuZGVyQ29uc3RhbnRzIHtcblx0U21vb3RoU2Nyb2xsRHVyYXRpb24gPSAxMjVcbn1cblxuY29uc3QgZW51bSBUZXJtaW5hbFNjcm9sbGJhcldpZHRoIHtcblx0LyoqIERlZmF1bHQgeHRlcm0uanMgdmVydGljYWwgc2Nyb2xsYmFyIHdpZHRoLiAqL1xuXHREZWZhdWx0ID0gMTQsXG5cdC8qKiBOYXJyb3dlciBzY3JvbGxiYXIgdXNlZCB3aGVuIHRoZSBNb2Rlcm4gVUkgVXBkYXRlIGV4cGVyaW1lbnQgaXMgZW5hYmxlZC4gKi9cblx0TW9kZXJuVUkgPSAxMFxufVxuXG5jb25zdCBlbnVtIFRleHRCbGlua0NvbnN0YW50cyB7XG5cdEludGVydmFsRHVyYXRpb24gPSA2MDBcbn1cblxuXG5mdW5jdGlvbiBnZXRGdWxsQnVmZmVyTGluZUFzU3RyaW5nKGxpbmVJbmRleDogbnVtYmVyLCBidWZmZXI6IElCdWZmZXIpOiB7IGxpbmVEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGxpbmVJbmRleDogbnVtYmVyIH0ge1xuXHRsZXQgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGxpbmVJbmRleCk7XG5cdGlmICghbGluZSkge1xuXHRcdHJldHVybiB7IGxpbmVEYXRhOiB1bmRlZmluZWQsIGxpbmVJbmRleCB9O1xuXHR9XG5cdGxldCBsaW5lRGF0YSA9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSk7XG5cdHdoaWxlIChsaW5lSW5kZXggPiAwICYmIGxpbmUuaXNXcmFwcGVkKSB7XG5cdFx0bGluZSA9IGJ1ZmZlci5nZXRMaW5lKC0tbGluZUluZGV4KTtcblx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRsaW5lRGF0YSA9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcoZmFsc2UpICsgbGluZURhdGE7XG5cdH1cblx0cmV0dXJuIHsgbGluZURhdGEsIGxpbmVJbmRleCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElYdGVybVRlcm1pbmFsT3B0aW9ucyB7XG5cdC8qKiBUaGUgY29sdW1ucyB0byBpbml0aWFsaXplIHRoZSB0ZXJtaW5hbCB3aXRoLiAqL1xuXHRjb2xzOiBudW1iZXI7XG5cdC8qKiBUaGUgcm93cyB0byBpbml0aWFsaXplIHRoZSB0ZXJtaW5hbCB3aXRoLiAqL1xuXHRyb3dzOiBudW1iZXI7XG5cdC8qKiBUaGUgY29sb3IgcHJvdmlkZXIgZm9yIHRoZSB0ZXJtaW5hbC4gKi9cblx0eHRlcm1Db2xvclByb3ZpZGVyOiBJWHRlcm1Db2xvclByb3ZpZGVyO1xuXHQvKiogVGhlIGNhcGFiaWxpdGllcyBvZiB0aGUgdGVybWluYWwuICovXG5cdGNhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXHQvKiogVGhlIHNoZWxsIGludGVncmF0aW9uIG5vbmNlIHRvIHZlcmlmeSBkYXRhIGNvbWluZyBmcm9tIFNJIGlzIHRydXN0d29ydGh5LiAqL1xuXHRzaGVsbEludGVncmF0aW9uTm9uY2U/OiBzdHJpbmc7XG5cdC8qKiBXaGV0aGVyIHRvIGRpc2FibGUgc2hlbGwgaW50ZWdyYXRpb24gdGVsZW1ldHJ5IHJlcG9ydGluZy4gKi9cblx0ZGlzYWJsZVNoZWxsSW50ZWdyYXRpb25SZXBvcnRpbmc/OiBib29sZWFuO1xuXHQvKiogVGhlIG9iamVjdCB0aGF0IGltcG9ydHMgeHRlcm0gYWRkb25zLCBzZXQgdGhpcyB0byBpbmplY3QgYW4gaW1wb3J0ZXIgaW4gdGVzdHMuICovXG5cdHh0ZXJtQWRkb25JbXBvcnRlcj86IFh0ZXJtQWRkb25JbXBvcnRlcjtcblx0LyoqIFdoZXRoZXIgdG8gZGlzYWJsZSB0aGUgb3ZlcnZpZXcgcnVsZXIuICovXG5cdGRpc2FibGVPdmVydmlld1J1bGVyPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgc2tpcHMgcmVnaXN0ZXJpbmcgbGlzdGVuZXJzIG9uIGdsb2JhbCBzaW5nbGV0b24gc2VydmljZXNcblx0ICogKGNvbmZpZ3VyYXRpb24sIHRoZW1lLCBsb2cgbGV2ZWwpIHRvIGF2b2lkIGFjY3VtdWxhdGluZyBsaXN0ZW5lcnMgd2hlblxuXHQgKiBtYW55IGRldGFjaGVkIHRlcm1pbmFscyBhcmUgY3JlYXRlZCBjb25jdXJyZW50bHkuIFRoZSBjYWxsZXIgc2hvdWxkIHVzZVxuXHQgKiB7QGxpbmsgWHRlcm1UZXJtaW5hbC51cGRhdGVDb25maWd9LCB7QGxpbmsgWHRlcm1UZXJtaW5hbC51cGRhdGVUaGVtZX0sXG5cdCAqIGFuZCB7QGxpbmsgWHRlcm1UZXJtaW5hbC51cGRhdGVMb2dMZXZlbH0gdG8gYXBwbHkgdGhvc2UgY2hhbmdlcyBleHRlcm5hbGx5LlxuXHQgKi9cblx0ZGV0YWNoZWQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFdyYXBzIHRoZSB4dGVybSBvYmplY3Qgd2l0aCBhZGRpdGlvbmFsIGZ1bmN0aW9uYWxpdHkuIEludGVyYWN0aW9uIHdpdGggdGhlIGJhY2tpbmcgcHJvY2VzcyBpcyBvdXRcbiAqIG9mIHRoZSBzY29wZSBvZiB0aGlzIGNsYXNzLlxuICovXG5leHBvcnQgY2xhc3MgWHRlcm1UZXJtaW5hbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJWHRlcm1UZXJtaW5hbCwgSURldGFjaGVkWHRlcm1UZXJtaW5hbCwgSUludGVybmFsWHRlcm1UZXJtaW5hbCB7XG5cdC8qKiBUaGUgcmF3IHh0ZXJtLmpzIGluc3RhbmNlICovXG5cdHJlYWRvbmx5IHJhdzogUmF3WHRlcm1UZXJtaW5hbDtcblx0cHJpdmF0ZSBfY29yZTogSVh0ZXJtQ29yZTtcblx0cHJpdmF0ZSByZWFkb25seSBfeHRlcm1BZGRvbkxvYWRlcjogWHRlcm1BZGRvbkltcG9ydGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF94dGVybUNvbG9yUHJvdmlkZXI6IElYdGVybUNvbG9yUHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNhYmxlT3ZlcnZpZXdSdWxlcjogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpbkRvY3VtZW50OiBEb2N1bWVudDtcblxuXHRwcml2YXRlIHN0YXRpYyBfc3VnZ2VzdGVkUmVuZGVyZXJUeXBlOiAnZG9tJyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXR0YWNoZWQ/OiB7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7IG9wdGlvbnM6IElYdGVybUF0dGFjaFRvRWxlbWVudE9wdGlvbnMgfTtcblx0cHJpdmF0ZSBfaXNQaHlzaWNhbE1vdXNlV2hlZWwgPSBNb3VzZVdoZWVsQ2xhc3NpZmllci5JTlNUQU5DRS5pc1BoeXNpY2FsTW91c2VXaGVlbCgpO1xuXHRwcml2YXRlIF9sYXN0SW5wdXRFdmVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbGFzdElucHV0RXZlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xhc3RJbnB1dEV2ZW50OyB9XG5cdHByaXZhdGUgX3Byb2dyZXNzU3RhdGU6IElQcm9ncmVzc1N0YXRlID0geyBzdGF0ZTogMCwgdmFsdWU6IDAgfTtcblx0Z2V0IHByb2dyZXNzU3RhdGUoKTogSVByb2dyZXNzU3RhdGUgeyByZXR1cm4gdGhpcy5fcHJvZ3Jlc3NTdGF0ZTsgfVxuXHRnZXQgYnVmZmVyKCkgeyByZXR1cm4gdGhpcy5yYXcuYnVmZmVyOyB9XG5cdGdldCBjb2xzKCkgeyByZXR1cm4gdGhpcy5yYXcuY29sczsgfVxuXG5cdC8vIEFsd2F5cyBvbiBhZGRvbnNcblx0cHJpdmF0ZSBfbWFya05hdmlnYXRpb25BZGRvbjogTWFya05hdmlnYXRpb25BZGRvbjtcblx0cHJpdmF0ZSBfc2hlbGxJbnRlZ3JhdGlvbkFkZG9uOiBTaGVsbEludGVncmF0aW9uQWRkb247XG5cdHByaXZhdGUgX2RlY29yYXRpb25BZGRvbjogRGVjb3JhdGlvbkFkZG9uO1xuXG5cdC8vIEFsd2F5cyBvbiBkeW5hbWljbHkgaW1wb3J0ZWQgYWRkb25zXG5cdHByaXZhdGUgX2NsaXBib2FyZEFkZG9uPzogQ2xpcGJvYXJkQWRkb25UeXBlO1xuXG5cdC8vIE9wdGlvbmFsIGFkZG9uc1xuXHRwcml2YXRlIF9zZWFyY2hBZGRvbj86IFNlYXJjaEFkZG9uVHlwZTtcblx0cHJpdmF0ZSBfdW5pY29kZTExQWRkb24/OiBVbmljb2RlMTFBZGRvblR5cGU7XG5cdHByaXZhdGUgX3dlYmdsQWRkb24/OiBXZWJnbEFkZG9uVHlwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2ViZ2xDb250ZXh0TG9zc0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF93ZWJnbEFkZG9uQ3VzdG9tR2x5cGhzPzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfd2ViZ2xBZGRvbkxvYWRpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfd2ViZ2xBZGRvbkxvYWRJZCA9IDA7XG5cdHByaXZhdGUgX3NlcmlhbGl6ZUFkZG9uPzogU2VyaWFsaXplQWRkb25UeXBlO1xuXHRwcml2YXRlIF9pbWFnZUFkZG9uPzogSW1hZ2VBZGRvblR5cGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpZ2F0dXJlc0FkZG9uOiBNdXRhYmxlRGlzcG9zYWJsZTxMaWdhdHVyZXNBZGRvblR5cGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9saWdhdHVyZXNBZGRvbkNvbmZpZz86IElMaWdhdHVyZU9wdGlvbnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXR0YWNoZWREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FueVRlcm1pbmFsRm9jdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYW55Rm9jdXNlZFRlcm1pbmFsSGFzU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9sYXN0RmluZFJlc3VsdDogeyByZXN1bHRJbmRleDogbnVtYmVyOyByZXN1bHRDb3VudDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdGdldCBmaW5kUmVzdWx0KCk6IHsgcmVzdWx0SW5kZXg6IG51bWJlcjsgcmVzdWx0Q291bnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xhc3RGaW5kUmVzdWx0OyB9XG5cblx0Z2V0IGlzU3RkaW5EaXNhYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5yYXcub3B0aW9ucy5kaXNhYmxlU3RkaW47IH1cblx0Z2V0IGlzR3B1QWNjZWxlcmF0ZWQoKTogYm9vbGVhbiB7IHJldHVybiAhIXRoaXMuX3dlYmdsQWRkb247IH1cblx0Z2V0IGlzSW1hZ2VBZGRvbkxvYWRlZCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5faW1hZ2VBZGRvbjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdFJ1bkNvbW1hbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQ7IG5vTmV3TGluZT86IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFJ1bkNvbW1hbmQgPSB0aGlzLl9vbkRpZFJlcXVlc3RSdW5Db21tYW5kLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RDb3B5QXNIdG1sID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RDb3B5QXNIdG1sID0gdGhpcy5fb25EaWRSZXF1ZXN0Q29weUFzSHRtbC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0UmVmcmVzaERpbWVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0UmVmcmVzaERpbWVuc2lvbnMgPSB0aGlzLl9vbkRpZFJlcXVlc3RSZWZyZXNoRGltZW5zaW9ucy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaW5kUmVzdWx0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVzdWx0SW5kZXg6IG51bWJlcjsgcmVzdWx0Q291bnQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaW5kUmVzdWx0cyA9IHRoaXMuX29uRGlkQ2hhbmdlRmluZFJlc3VsdHMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlU2VhcmNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlU2VhcmNoID0gdGhpcy5fb25CZWZvcmVTZWFyY2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQWZ0ZXJTZWFyY2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25BZnRlclNlYXJjaCA9IHRoaXMuX29uQWZ0ZXJTZWFyY2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1cyA9IHRoaXMuX29uRGlkQ2hhbmdlRm9jdXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2UgPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvZ3Jlc3NTdGF0ZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZ3Jlc3MgPSB0aGlzLl9vbkRpZENoYW5nZVByb2dyZXNzLmV2ZW50O1xuXG5cdGdldCBtYXJrVHJhY2tlcigpOiBJTWFya1RyYWNrZXIgeyByZXR1cm4gdGhpcy5fbWFya05hdmlnYXRpb25BZGRvbjsgfVxuXHRnZXQgc2hlbGxJbnRlZ3JhdGlvbigpOiBJU2hlbGxJbnRlZ3JhdGlvbiB7IHJldHVybiB0aGlzLl9zaGVsbEludGVncmF0aW9uQWRkb247IH1cblx0Z2V0IGRlY29yYXRpb25BZGRvbigpOiBJRGVjb3JhdGlvbkFkZG9uIHsgcmV0dXJuIHRoaXMuX2RlY29yYXRpb25BZGRvbjsgfVxuXG5cdGdldCB0ZXh0dXJlQXRsYXMoKTogUHJvbWlzZTxJbWFnZUJpdG1hcD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhbnZhcyA9IHRoaXMuX3dlYmdsQWRkb24/LnRleHR1cmVBdGxhcztcblx0XHRpZiAoIWNhbnZhcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGNyZWF0ZUltYWdlQml0bWFwKGNhbnZhcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzRm9jdXNlZCgpIHtcblx0XHRpZiAoIXRoaXMucmF3LmVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMucmF3LmVsZW1lbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB4dGVybUN0b3IgVGhlIHh0ZXJtLmpzIGNvbnN0cnVjdG9yLCB0aGlzIGlzIHBhc3NlZCBpbiBzbyBpdCBjYW4gYmUgZmV0Y2hlZCBsYXppbHlcblx0ICogb3V0c2lkZSBvZiB0aGlzIGNsYXNzIHN1Y2ggdGhhdCB7QGxpbmsgcmF3fSBpcyBub3QgbnVsbGFibGUuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHh0ZXJtQ3RvcjogdHlwZW9mIFJhd1h0ZXJtVGVybWluYWwsXG5cdFx0b3B0aW9uczogSVh0ZXJtVGVybWluYWxPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXhlY3V0ZVRleHQ6IEV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl94dGVybUFkZG9uTG9hZGVyID0gb3B0aW9ucy54dGVybUFkZG9uSW1wb3J0ZXIgPz8gbmV3IFh0ZXJtQWRkb25JbXBvcnRlcigpO1xuXHRcdHRoaXMuX3h0ZXJtQ29sb3JQcm92aWRlciA9IG9wdGlvbnMueHRlcm1Db2xvclByb3ZpZGVyO1xuXHRcdHRoaXMuX2NhcGFiaWxpdGllcyA9IG9wdGlvbnMuY2FwYWJpbGl0aWVzO1xuXHRcdHRoaXMuX2Rpc2FibGVPdmVydmlld1J1bGVyID0gb3B0aW9ucy5kaXNhYmxlT3ZlcnZpZXdSdWxlciA/PyBmYWxzZTtcblx0XHR0aGlzLl9tYWluRG9jdW1lbnQgPSBsYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIub3duZXJEb2N1bWVudDtcblxuXHRcdGNvbnN0IGZvbnQgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZG9tLmdldEFjdGl2ZVdpbmRvdygpLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpO1xuXG5cdFx0dGhpcy5yYXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgeHRlcm1DdG9yKHtcblx0XHRcdGFsbG93UHJvcG9zZWRBcGk6IHRydWUsXG5cdFx0XHRjb2xzOiBvcHRpb25zLmNvbHMsXG5cdFx0XHRyb3dzOiBvcHRpb25zLnJvd3MsXG5cdFx0XHRkb2N1bWVudE92ZXJyaWRlOiB0aGlzLl9tYWluRG9jdW1lbnQsXG5cdFx0XHRhbHRDbGlja01vdmVzQ3Vyc29yOiBjb25maWcuYWx0Q2xpY2tNb3Zlc0N1cnNvciAmJiBlZGl0b3JPcHRpb25zLm11bHRpQ3Vyc29yTW9kaWZpZXIgPT09ICdhbHQnLFxuXHRcdFx0c2Nyb2xsYmFjazogY29uZmlnLnNjcm9sbGJhY2ssXG5cdFx0XHR0aGVtZTogdGhpcy5nZXRYdGVybVRoZW1lKCksXG5cdFx0XHRkcmF3Qm9sZFRleHRJbkJyaWdodENvbG9yczogY29uZmlnLmRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzLFxuXHRcdFx0Zm9udEZhbWlseTogZm9udC5mb250RmFtaWx5LFxuXHRcdFx0Zm9udFdlaWdodDogY29uZmlnLmZvbnRXZWlnaHQsXG5cdFx0XHRmb250V2VpZ2h0Qm9sZDogY29uZmlnLmZvbnRXZWlnaHRCb2xkLFxuXHRcdFx0Zm9udFNpemU6IGZvbnQuZm9udFNpemUsXG5cdFx0XHRsZXR0ZXJTcGFjaW5nOiBmb250LmxldHRlclNwYWNpbmcsXG5cdFx0XHRsaW5lSGVpZ2h0OiBmb250LmxpbmVIZWlnaHQsXG5cdFx0XHRsb2dMZXZlbDogdnNjb2RlVG9YdGVybUxvZ0xldmVsKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSksXG5cdFx0XHRsb2dnZXI6IHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHRtaW5pbXVtQ29udHJhc3RSYXRpbzogY29uZmlnLm1pbmltdW1Db250cmFzdFJhdGlvLFxuXHRcdFx0dGFiU3RvcFdpZHRoOiBjb25maWcudGFiU3RvcFdpZHRoLFxuXHRcdFx0Y3Vyc29yQmxpbms6IGNvbmZpZy5jdXJzb3JCbGlua2luZyxcblx0XHRcdGJsaW5rSW50ZXJ2YWxEdXJhdGlvbjogY29uZmlnLnRleHRCbGlua2luZyA/IFRleHRCbGlua0NvbnN0YW50cy5JbnRlcnZhbER1cmF0aW9uIDogMCxcblx0XHRcdGN1cnNvclN0eWxlOiB2c2NvZGVUb1h0ZXJtQ3Vyc29yU3R5bGU8J2N1cnNvclN0eWxlJz4oY29uZmlnLmN1cnNvclN0eWxlKSxcblx0XHRcdGN1cnNvckluYWN0aXZlU3R5bGU6IHZzY29kZVRvWHRlcm1DdXJzb3JTdHlsZShjb25maWcuY3Vyc29yU3R5bGVJbmFjdGl2ZSksXG5cdFx0XHRjdXJzb3JXaWR0aDogY29uZmlnLmN1cnNvcldpZHRoLFxuXHRcdFx0bWFjT3B0aW9uSXNNZXRhOiBjb25maWcubWFjT3B0aW9uSXNNZXRhLFxuXHRcdFx0bWFjT3B0aW9uQ2xpY2tGb3JjZXNTZWxlY3Rpb246IGNvbmZpZy5tYWNPcHRpb25DbGlja0ZvcmNlc1NlbGVjdGlvbixcblx0XHRcdHJpZ2h0Q2xpY2tTZWxlY3RzV29yZDogY29uZmlnLnJpZ2h0Q2xpY2tCZWhhdmlvciA9PT0gJ3NlbGVjdFdvcmQnLFxuXHRcdFx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiBjb25maWcuZmFzdFNjcm9sbFNlbnNpdGl2aXR5LFxuXHRcdFx0c2Nyb2xsU2Vuc2l0aXZpdHk6IGNvbmZpZy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHksXG5cdFx0XHRzY3JvbGxPbkVyYXNlSW5EaXNwbGF5OiB0cnVlLFxuXHRcdFx0d29yZFNlcGFyYXRvcjogY29uZmlnLndvcmRTZXBhcmF0b3JzLFxuXHRcdFx0c2Nyb2xsYmFyOiB0aGlzLl9nZXRTY3JvbGxiYXJPcHRpb25zKCksXG5cdFx0XHRpZ25vcmVCcmFja2V0ZWRQYXN0ZU1vZGU6IGNvbmZpZy5pZ25vcmVCcmFja2V0ZWRQYXN0ZU1vZGUsXG5cdFx0XHRyZXNjYWxlT3ZlcmxhcHBpbmdHbHlwaHM6IGNvbmZpZy5yZXNjYWxlT3ZlcmxhcHBpbmdHbHlwaHMsXG5cdFx0XHR2dEV4dGVuc2lvbnM6IHtcblx0XHRcdFx0a2l0dHlLZXlib2FyZDogY29uZmlnLmVuYWJsZUtpdHR5S2V5Ym9hcmRQcm90b2NvbCxcblx0XHRcdFx0d2luMzJJbnB1dE1vZGU6IGNvbmZpZy5lbmFibGVXaW4zMklucHV0TW9kZSxcblx0XHRcdH0sXG5cdFx0XHRhbGxvd1RyYW5zcGFyZW5jeTogY29uZmlnLmVuYWJsZUltYWdlcyxcblx0XHRcdHdpbmRvd09wdGlvbnM6IHtcblx0XHRcdFx0Z2V0V2luU2l6ZVBpeGVsczogdHJ1ZSxcblx0XHRcdFx0Z2V0Q2VsbFNpemVQaXhlbHM6IHRydWUsXG5cdFx0XHRcdGdldFdpblNpemVDaGFyczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVNtb290aFNjcm9sbGluZygpO1xuXHRcdGludGVyZmFjZSBJVGVybWluYWxXaXRoQ29yZSBleHRlbmRzIFJhd1h0ZXJtVGVybWluYWwge1xuXHRcdFx0X2NvcmU6IElYdGVybUNvcmU7XG5cdFx0fVxuXHRcdHRoaXMuX2NvcmUgPSAodGhpcy5yYXcgYXMgSVRlcm1pbmFsV2l0aENvcmUpLl9jb3JlIGFzIElYdGVybUNvcmU7XG5cblx0XHQvLyBTa2lwIGdsb2JhbCBzZXJ2aWNlIGxpc3RlbmVycyBmb3IgZGV0YWNoZWQgdGVybWluYWxzIHRvIGF2b2lkXG5cdFx0Ly8gYWNjdW11bGF0aW5nIGxpc3RlbmVycyB3aGVuIG1hbnkgZGV0YWNoZWQgaW5zdGFuY2VzIGV4aXN0IGNvbmN1cnJlbnRseS5cblx0XHRpZiAoIW9wdGlvbnMuZGV0YWNoZWQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihhc3luYyBlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuR3B1QWNjZWxlcmF0aW9uKSkge1xuXHRcdFx0XHRcdFh0ZXJtVGVybWluYWwuX3N1Z2dlc3RlZFJlbmRlcmVyVHlwZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbigndGVybWluYWwuaW50ZWdyYXRlZCcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHknKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5JykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm11bHRpQ3Vyc29yTW9kaWZpZXInKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLk1PREVSTl9VSSkpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlVuaWNvZGVWZXJzaW9uKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVVuaWNvZGVWZXJzaW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkRlY29yYXRpb25zRW5hYmxlZCkpIHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVUaGVtZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhlbWUgPT4gdGhpcy5fdXBkYXRlVGhlbWUodGhlbWUpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sb2dTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9nTGV2ZWwoZSA9PiB0aGlzLnJhdy5vcHRpb25zLmxvZ0xldmVsID0gdnNjb2RlVG9YdGVybUxvZ0xldmVsKGUpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmaXJlIGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmF3Lm9uU2VsZWN0aW9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoKTtcblx0XHRcdGlmICh0aGlzLmlzRm9jdXNlZCkge1xuXHRcdFx0XHR0aGlzLl9hbnlGb2N1c2VkVGVybWluYWxIYXNTZWxlY3Rpb24uc2V0KHRoaXMucmF3Lmhhc1NlbGVjdGlvbigpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yYXcub25EYXRhKGUgPT4gdGhpcy5fbGFzdElucHV0RXZlbnQgPSBlKSk7XG5cblx0XHQvLyBMb2FkIGFkZG9uc1xuXHRcdHRoaXMuX3VwZGF0ZVVuaWNvZGVWZXJzaW9uKCk7XG5cdFx0dGhpcy5fbWFya05hdmlnYXRpb25BZGRvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtOYXZpZ2F0aW9uQWRkb24sIG9wdGlvbnMuY2FwYWJpbGl0aWVzKTtcblx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5fbWFya05hdmlnYXRpb25BZGRvbik7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkFkZG9uID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVjb3JhdGlvbkFkZG9uLCByZXNvdXJjZSwgdGhpcy5fY2FwYWJpbGl0aWVzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWNvcmF0aW9uQWRkb24ub25EaWRSZXF1ZXN0UnVuQ29tbWFuZChlID0+IHRoaXMuX29uRGlkUmVxdWVzdFJ1bkNvbW1hbmQuZmlyZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlY29yYXRpb25BZGRvbi5vbkRpZFJlcXVlc3RDb3B5QXNIdG1sKGUgPT4gdGhpcy5fb25EaWRSZXF1ZXN0Q29weUFzSHRtbC5maXJlKGUpKSk7XG5cdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX2RlY29yYXRpb25BZGRvbik7XG5cdFx0dGhpcy5fc2hlbGxJbnRlZ3JhdGlvbkFkZG9uID0gbmV3IFNoZWxsSW50ZWdyYXRpb25BZGRvbihvcHRpb25zLnNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyAnJywgb3B0aW9ucy5kaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZywgdGhpcy5fb25EaWRFeGVjdXRlVGV4dCwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX3NoZWxsSW50ZWdyYXRpb25BZGRvbik7XG5cdFx0dGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignY2xpcGJvYXJkJykudGhlbihDbGlwYm9hcmRBZGRvbiA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGlwYm9hcmRBZGRvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsaXBib2FyZEFkZG9uLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0YXN5bmMgcmVhZFRleHQodHlwZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdFx0XHRyZXR1cm4gX2NsaXBib2FyZFNlcnZpY2UucmVhZFRleHQodHlwZSA9PT0gJ3AnID8gJ3NlbGVjdGlvbicgOiAnY2xpcGJvYXJkJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jIHdyaXRlVGV4dCh0eXBlOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHJldHVybiBfY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGV4dCwgdHlwZSA9PT0gJ3AnID8gJ3NlbGVjdGlvbicgOiAnY2xpcGJvYXJkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX2NsaXBib2FyZEFkZG9uKTtcblx0XHR9KTtcblx0XHR0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCdwcm9ncmVzcycpLnRoZW4oUHJvZ3Jlc3NBZGRvbiA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcm9ncmVzc0FkZG9uID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZ3Jlc3NBZGRvbik7XG5cdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24ocHJvZ3Jlc3NBZGRvbik7XG5cdFx0XHRjb25zdCB1cGRhdGVQcm9ncmVzcyA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCFlcXVhbHModGhpcy5fcHJvZ3Jlc3NTdGF0ZSwgcHJvZ3Jlc3NBZGRvbi5wcm9ncmVzcykpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm9ncmVzc1N0YXRlID0gcHJvZ3Jlc3NBZGRvbi5wcm9ncmVzcztcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb2dyZXNzLmZpcmUodGhpcy5fcHJvZ3Jlc3NTdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihwcm9ncmVzc0FkZG9uLm9uQ2hhbmdlKCgpID0+IHVwZGF0ZVByb2dyZXNzKCkpKTtcblx0XHRcdHVwZGF0ZVByb2dyZXNzKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0XHRpZiAoY29tbWFuZERldGVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEZpbmlzaGVkKCgpID0+IHByb2dyZXNzQWRkb24ucHJvZ3Jlc3MgPSB7IHN0YXRlOiAwLCB2YWx1ZTogMCB9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5pZCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKChlLmNhcGFiaWxpdHkgYXMgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkpLm9uQ29tbWFuZEZpbmlzaGVkKCgpID0+IHByb2dyZXNzQWRkb24ucHJvZ3Jlc3MgPSB7IHN0YXRlOiAwLCB2YWx1ZTogMCB9KSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fYW55VGVybWluYWxGb2N1c0NvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzSW5BbnkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hbnlGb2N1c2VkVGVybWluYWxIYXNTZWxlY3Rpb24gPSBUZXJtaW5hbENvbnRleHRLZXlzLnRleHRTZWxlY3RlZEluRm9jdXNlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0KmdldEJ1ZmZlclJldmVyc2VJdGVyYXRvcigpOiBJdGVyYWJsZUl0ZXJhdG9yPHN0cmluZz4ge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCB7IGxpbmVEYXRhLCBsaW5lSW5kZXggfSA9IGdldEZ1bGxCdWZmZXJMaW5lQXNTdHJpbmcoaSwgdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZSk7XG5cdFx0XHRpZiAobGluZURhdGEpIHtcblx0XHRcdFx0aSA9IGxpbmVJbmRleDtcblx0XHRcdFx0eWllbGQgbGluZURhdGE7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q29udGVudHNBc1RleHQoc3RhcnRNYXJrZXI/OiBJWHRlcm1NYXJrZXIsIGVuZE1hcmtlcj86IElYdGVybU1hcmtlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZTtcblx0XHRpZiAoZW5kTWFya2VyPy5saW5lID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZ2V0IGNvbnRlbnRzIG9mIGEgZGlzcG9zZWQgZW5kTWFya2VyJyk7XG5cdFx0fVxuXHRcdC8vIFdoZW4gdGhlIHN0YXJ0IG1hcmtlciBpcyBkaXNwb3NlZCAoc2Nyb2xsZWQgb3V0IG9mIHRoZSBidWZmZXIgZHVlIHRvXG5cdFx0Ly8gc2Nyb2xsYmFjayBsaW1pdHMpLCBmYWxsIGJhY2sgdG8gbGluZSAwIHRvIHJldHVybiB3aGF0ZXZlciByZW1haW5zIGluXG5cdFx0Ly8gdGhlIGJ1ZmZlciByYXRoZXIgdGhhbiBsb3NpbmcgYWxsIG91dHB1dC5cblx0XHRjb25zdCBzdGFydExpbmUgPSAoc3RhcnRNYXJrZXIgPT09IHVuZGVmaW5lZCB8fCBzdGFydE1hcmtlci5saW5lID09PSAtMSkgPyAwIDogc3RhcnRNYXJrZXIubGluZTtcblx0XHRjb25zdCBlbmRMaW5lID0gZW5kTWFya2VyPy5saW5lID8/IGJ1ZmZlci5sZW5ndGggLSAxO1xuXHRcdGZvciAobGV0IHkgPSBzdGFydExpbmU7IHkgPD0gZW5kTGluZTsgeSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGJ1ZmZlci5nZXRMaW5lKHkpPy50cmFuc2xhdGVUb1N0cmluZyh0cnVlKSA/PyAnJyk7XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdGFzeW5jIGdldENvbnRlbnRzQXNIdG1sKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKCF0aGlzLl9zZXJpYWxpemVBZGRvbikge1xuXHRcdFx0Y29uc3QgQWRkb24gPSBhd2FpdCB0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCdzZXJpYWxpemUnKTtcblx0XHRcdHRoaXMuX3NlcmlhbGl6ZUFkZG9uID0gbmV3IEFkZG9uKCk7XG5cdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5fc2VyaWFsaXplQWRkb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVBZGRvbi5zZXJpYWxpemVBc0hUTUwoKTtcblx0fVxuXG5cdGFzeW5jIGdldENvbW1hbmRPdXRwdXRBc0h0bWwoY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCwgbWF4TGluZXM6IG51bWJlcik6IFByb21pc2U8eyB0ZXh0OiBzdHJpbmc7IHRydW5jYXRlZD86IGJvb2xlYW4gfT4ge1xuXHRcdGlmICghdGhpcy5fc2VyaWFsaXplQWRkb24pIHtcblx0XHRcdGNvbnN0IEFkZG9uID0gYXdhaXQgdGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignc2VyaWFsaXplJyk7XG5cdFx0XHR0aGlzLl9zZXJpYWxpemVBZGRvbiA9IG5ldyBBZGRvbigpO1xuXHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX3NlcmlhbGl6ZUFkZG9uKTtcblx0XHR9XG5cdFx0bGV0IHN0YXJ0TGluZTogbnVtYmVyO1xuXHRcdGxldCBzdGFydENvbDogbnVtYmVyO1xuXHRcdGlmIChjb21tYW5kLmV4ZWN1dGVkTWFya2VyICYmIGNvbW1hbmQuZXhlY3V0ZWRNYXJrZXIubGluZSA+PSAwKSB7XG5cdFx0XHRzdGFydExpbmUgPSBjb21tYW5kLmV4ZWN1dGVkTWFya2VyLmxpbmU7XG5cdFx0XHRzdGFydENvbCA9IE1hdGgubWF4KGNvbW1hbmQuZXhlY3V0ZWRYID8/IDAsIDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydExpbmUgPSBjb21tYW5kLm1hcmtlcj8ubGluZSAhPT0gdW5kZWZpbmVkID8gY29tbWFuZC5tYXJrZXIubGluZSArIDEgOiAxO1xuXHRcdFx0c3RhcnRDb2wgPSBNYXRoLm1heChjb21tYW5kLnN0YXJ0WCA/PyAwLCAwKTtcblx0XHR9XG5cblx0XHRsZXQgZW5kTGluZSA9IGNvbW1hbmQuZW5kTWFya2VyPy5saW5lICE9PSB1bmRlZmluZWQgPyBjb21tYW5kLmVuZE1hcmtlci5saW5lIC0gMSA6IHRoaXMucmF3LmJ1ZmZlci5hY3RpdmUubGVuZ3RoIC0gMTtcblx0XHRpZiAoZW5kTGluZSA8IHN0YXJ0TGluZSkge1xuXHRcdFx0cmV0dXJuIHsgdGV4dDogJycsIHRydW5jYXRlZDogZmFsc2UgfTtcblx0XHR9XG5cdFx0Ly8gVHJpbSBlbXB0eSBsaW5lcyBmcm9tIHRoZSBlbmRcblx0XHRsZXQgZW1wdHlMaW5lc0Zyb21FbmQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSBlbmRMaW5lOyBpID49IHN0YXJ0TGluZTsgaS0tKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKGkpO1xuXHRcdFx0aWYgKGxpbmUgJiYgbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlKS50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRcdGVtcHR5TGluZXNGcm9tRW5kKys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0ZW5kTGluZSA9IGVuZExpbmUgLSBlbXB0eUxpbmVzRnJvbUVuZDtcblxuXHRcdC8vIFRyaW0gZW1wdHkgbGluZXMgZnJvbSB0aGUgc3RhcnRcblx0XHRsZXQgZW1wdHlMaW5lc0Zyb21TdGFydCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0TGluZTsgaSA8PSBlbmRMaW5lOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmdldExpbmUoaSk7XG5cdFx0XHRpZiAobGluZSAmJiBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUsIGkgPT09IHN0YXJ0TGluZSA/IHN0YXJ0Q29sIDogdW5kZWZpbmVkKS50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRcdGlmIChpID09PSBzdGFydExpbmUpIHtcblx0XHRcdFx0XHRzdGFydENvbCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZW1wdHlMaW5lc0Zyb21TdGFydCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN0YXJ0TGluZSA9IHN0YXJ0TGluZSArIGVtcHR5TGluZXNGcm9tU3RhcnQ7XG5cblx0XHRpZiAobWF4TGluZXMgJiYgZW5kTGluZSAtIHN0YXJ0TGluZSA+IG1heExpbmVzKSB7XG5cdFx0XHRzdGFydExpbmUgPSBlbmRMaW5lIC0gbWF4TGluZXM7XG5cdFx0XHRzdGFydENvbCA9IDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVmZmVyTGluZSA9IHRoaXMucmF3LmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShzdGFydExpbmUpO1xuXHRcdGlmIChidWZmZXJMaW5lKSB7XG5cdFx0XHRzdGFydENvbCA9IE1hdGgubWluKHN0YXJ0Q29sLCBidWZmZXJMaW5lLmxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSB7IHN0YXJ0TGluZSwgZW5kTGluZSwgc3RhcnRDb2wgfTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9zZXJpYWxpemVBZGRvbi5zZXJpYWxpemVBc0hUTUwoeyByYW5nZSB9KTtcblx0XHRyZXR1cm4geyB0ZXh0OiByZXN1bHQsIHRydW5jYXRlZDogKGVuZExpbmUgLSBzdGFydExpbmUpID49IG1heExpbmVzIH07XG5cdH1cblxuXHRhc3luYyBnZXRTZWxlY3Rpb25Bc0h0bWwoY29tbWFuZD86IElUZXJtaW5hbENvbW1hbmQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy5fc2VyaWFsaXplQWRkb24pIHtcblx0XHRcdGNvbnN0IEFkZG9uID0gYXdhaXQgdGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignc2VyaWFsaXplJyk7XG5cdFx0XHR0aGlzLl9zZXJpYWxpemVBZGRvbiA9IG5ldyBBZGRvbigpO1xuXHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX3NlcmlhbGl6ZUFkZG9uKTtcblx0XHR9XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IGNvbW1hbmQuZ2V0T3V0cHV0KCk/Lmxlbmd0aDtcblx0XHRcdGNvbnN0IHJvdyA9IGNvbW1hbmQubWFya2VyPy5saW5lO1xuXHRcdFx0aWYgKCFsZW5ndGggfHwgIXJvdykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHJvdyAke3Jvd30gb3Igb3V0cHV0IGxlbmd0aCAke2xlbmd0aH0gZm9yIGNvbW1hbmQgJHtjb21tYW5kfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yYXcuc2VsZWN0KDAsIHJvdyArIDEsIGxlbmd0aCAtIE1hdGguZmxvb3IobGVuZ3RoIC8gdGhpcy5yYXcuY29scykpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9zZXJpYWxpemVBZGRvbi5zZXJpYWxpemVBc0hUTUwoeyBvbmx5U2VsZWN0aW9uOiB0cnVlIH0pO1xuXHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHR0aGlzLnJhdy5jbGVhclNlbGVjdGlvbigpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHBhcnRpYWxPcHRpb25zPzogUGFydGlhbDxJWHRlcm1BdHRhY2hUb0VsZW1lbnRPcHRpb25zPik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBvcHRpb25zOiBJWHRlcm1BdHRhY2hUb0VsZW1lbnRPcHRpb25zID0geyBlbmFibGVHcHU6IHRydWUsIC4uLnBhcnRpYWxPcHRpb25zIH07XG5cdFx0aWYgKCF0aGlzLl9hdHRhY2hlZCkge1xuXHRcdFx0dGhpcy5yYXcub3Blbihjb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIFRPRE86IE1vdmUgYmVmb3JlIG9wZW4gc28gdGhlIERPTSByZW5kZXJlciBkb2Vzbid0IGluaXRpYWxpemVcblx0XHRpZiAob3B0aW9ucy5lbmFibGVHcHUpIHtcblx0XHRcdGlmICh0aGlzLl9zaG91bGRMb2FkV2ViZ2woKSkge1xuXHRcdFx0XHR0aGlzLl9lbmFibGVXZWJnbFJlbmRlcmVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnJhdy5lbGVtZW50IHx8ICF0aGlzLnJhdy50ZXh0YXJlYSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd4dGVybSBlbGVtZW50cyBub3Qgc2V0IGFmdGVyIG9wZW4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBhZCA9IHRoaXMuX2F0dGFjaGVkRGlzcG9zYWJsZXM7XG5cdFx0YWQuY2xlYXIoKTtcblx0XHRhZC5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJhdy50ZXh0YXJlYSwgJ2ZvY3VzJywgKCkgPT4gdGhpcy5fc2V0Rm9jdXNlZCh0cnVlKSkpO1xuXHRcdGFkLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucmF3LnRleHRhcmVhLCAnYmx1cicsICgpID0+IHRoaXMuX3NldEZvY3VzZWQoZmFsc2UpKSk7XG5cdFx0YWQuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yYXcudGV4dGFyZWEsICdmb2N1c291dCcsICgpID0+IHRoaXMuX3NldEZvY3VzZWQoZmFsc2UpKSk7XG5cblx0XHQvLyBUcmFjayB3aGVlbCBldmVudHMgaW4gbW91c2Ugd2hlZWwgY2xhc3NpZmllciBhbmQgdXBkYXRlIHNtb290aFNjcm9sbGluZyB3aGVuIGl0IGNoYW5nZXNcblx0XHQvLyBhcyBpdCBtdXN0IGJlIGRpc2FibGVkIHdoZW4gYSB0cmFja3BhZCBpcyB1c2VkXG5cdFx0YWQuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yYXcuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9XSEVFTCwgKGU6IElNb3VzZVdoZWVsRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGNsYXNzaWZpZXIgPSBNb3VzZVdoZWVsQ2xhc3NpZmllci5JTlNUQU5DRTtcblx0XHRcdGNsYXNzaWZpZXIuYWNjZXB0U3RhbmRhcmRXaGVlbEV2ZW50KG5ldyBTdGFuZGFyZFdoZWVsRXZlbnQoZSkpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBjbGFzc2lmaWVyLmlzUGh5c2ljYWxNb3VzZVdoZWVsKCk7XG5cdFx0XHRpZiAodmFsdWUgIT09IHRoaXMuX2lzUGh5c2ljYWxNb3VzZVdoZWVsKSB7XG5cdFx0XHRcdHRoaXMuX2lzUGh5c2ljYWxNb3VzZVdoZWVsID0gdmFsdWU7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNtb290aFNjcm9sbGluZygpO1xuXHRcdFx0fVxuXHRcdH0sIHsgcGFzc2l2ZTogdHJ1ZSB9KSk7XG5cblx0XHR0aGlzLl9yZWZyZXNoTGlnYXR1cmVzQWRkb24oKTtcblxuXHRcdHRoaXMuX2F0dGFjaGVkID0geyBjb250YWluZXIsIG9wdGlvbnMgfTtcblx0XHQvLyBTY3JlZW4gbXVzdCBiZSBjcmVhdGVkIGF0IHRoaXMgcG9pbnQgYXMgeHRlcm0ub3BlbiBpcyBjYWxsZWRcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNoZWQ/LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcueHRlcm0tc2NyZWVuJykhO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Rm9jdXNlZChpc0ZvY3VzZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmZpcmUoaXNGb2N1c2VkKTtcblx0XHR0aGlzLl9hbnlUZXJtaW5hbEZvY3VzQ29udGV4dEtleS5zZXQoaXNGb2N1c2VkKTtcblx0XHR0aGlzLl9hbnlGb2N1c2VkVGVybWluYWxIYXNTZWxlY3Rpb24uc2V0KGlzRm9jdXNlZCAmJiB0aGlzLnJhdy5oYXNTZWxlY3Rpb24oKSk7XG5cdH1cblxuXHR3cml0ZShkYXRhOiBzdHJpbmcgfCBVaW50OEFycmF5LCBjYWxsYmFjaz86ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy53cml0ZShkYXRhLCBjYWxsYmFjayk7XG5cdH1cblxuXHRyZXNpemUoY29sdW1uczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdyZXNpemluZycsIGNvbHVtbnMsIHJvd3MpO1xuXHRcdHRoaXMucmF3LnJlc2l6ZShjb2x1bW5zLCByb3dzKTtcblx0fVxuXG5cdHVwZGF0ZUxvZ0xldmVsKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMubG9nTGV2ZWwgPSB2c2NvZGVUb1h0ZXJtTG9nTGV2ZWwodGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgd2lkdGgsIGluIHBpeGVscywgb2YgdGhlIHZlcnRpY2FsIHNjcm9sbGJhci4gTmFycm93ZXIgdW5kZXIgdGhlIE1vZGVyblxuXHQgKiBVSSBVcGRhdGUgZXhwZXJpbWVudCBzbyBpdCBtYXRjaGVzIHRoZSBtb2Rlcm5pemVkIHdvcmtiZW5jaCBzY3JvbGxiYXJzLlxuXHQgKi9cblx0Z2V0IHNjcm9sbGJhcldpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLk1PREVSTl9VSSkgPT09IHRydWVcblx0XHRcdD8gVGVybWluYWxTY3JvbGxiYXJXaWR0aC5Nb2Rlcm5VSVxuXHRcdFx0OiBUZXJtaW5hbFNjcm9sbGJhcldpZHRoLkRlZmF1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSB4dGVybS5qcyBgc2Nyb2xsYmFyYCBvcHRpb24gdXNpbmcge0BsaW5rIHNjcm9sbGJhcldpZHRofS4gUmV0dXJuc1xuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBvdmVydmlldyBydWxlciBpcyBkaXNhYmxlZCAoZS5nLiBkZXRhY2hlZCB0ZXJtaW5hbHMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U2Nyb2xsYmFyT3B0aW9ucygpOiB7IHdpZHRoOiBudW1iZXI7IG92ZXJ2aWV3UnVsZXI6IHsgc2hvd1RvcEJvcmRlcjogYm9vbGVhbiB9IH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9kaXNhYmxlT3ZlcnZpZXdSdWxlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZHRoOiB0aGlzLnNjcm9sbGJhcldpZHRoLFxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHRzaG93VG9wQm9yZGVyOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dXBkYXRlQ29uZmlnKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMuYWx0Q2xpY2tNb3Zlc0N1cnNvciA9IGNvbmZpZy5hbHRDbGlja01vdmVzQ3Vyc29yO1xuXHRcdHRoaXMuX3NldEN1cnNvckJsaW5rKGNvbmZpZy5jdXJzb3JCbGlua2luZyk7XG5cdFx0dGhpcy5fc2V0VGV4dEJsaW5raW5nKGNvbmZpZy50ZXh0QmxpbmtpbmcpO1xuXHRcdHRoaXMuX3NldEN1cnNvclN0eWxlKGNvbmZpZy5jdXJzb3JTdHlsZSk7XG5cdFx0dGhpcy5fc2V0Q3Vyc29yU3R5bGVJbmFjdGl2ZShjb25maWcuY3Vyc29yU3R5bGVJbmFjdGl2ZSk7XG5cdFx0dGhpcy5fc2V0Q3Vyc29yV2lkdGgoY29uZmlnLmN1cnNvcldpZHRoKTtcblx0XHR0aGlzLnJhdy5vcHRpb25zLnNjcm9sbGJhY2sgPSBjb25maWcuc2Nyb2xsYmFjaztcblx0XHR0aGlzLnJhdy5vcHRpb25zLmRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzID0gY29uZmlnLmRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMubWluaW11bUNvbnRyYXN0UmF0aW8gPSBjb25maWcubWluaW11bUNvbnRyYXN0UmF0aW87XG5cdFx0dGhpcy5yYXcub3B0aW9ucy50YWJTdG9wV2lkdGggPSBjb25maWcudGFiU3RvcFdpZHRoO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5ID0gY29uZmlnLmZhc3RTY3JvbGxTZW5zaXRpdml0eTtcblx0XHR0aGlzLnJhdy5vcHRpb25zLnNjcm9sbFNlbnNpdGl2aXR5ID0gY29uZmlnLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTtcblx0XHR0aGlzLnJhdy5vcHRpb25zLm1hY09wdGlvbklzTWV0YSA9IGNvbmZpZy5tYWNPcHRpb25Jc01ldGE7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5hbHRDbGlja01vdmVzQ3Vyc29yID0gY29uZmlnLmFsdENsaWNrTW92ZXNDdXJzb3IgJiYgZWRpdG9yT3B0aW9ucy5tdWx0aUN1cnNvck1vZGlmaWVyID09PSAnYWx0Jztcblx0XHR0aGlzLnJhdy5vcHRpb25zLm1hY09wdGlvbkNsaWNrRm9yY2VzU2VsZWN0aW9uID0gY29uZmlnLm1hY09wdGlvbkNsaWNrRm9yY2VzU2VsZWN0aW9uO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMucmlnaHRDbGlja1NlbGVjdHNXb3JkID0gY29uZmlnLnJpZ2h0Q2xpY2tCZWhhdmlvciA9PT0gJ3NlbGVjdFdvcmQnO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMud29yZFNlcGFyYXRvciA9IGNvbmZpZy53b3JkU2VwYXJhdG9ycztcblx0XHR0aGlzLnJhdy5vcHRpb25zLnNjcm9sbGJhciA9IHRoaXMuX2dldFNjcm9sbGJhck9wdGlvbnMoKTtcblx0XHR0aGlzLnJhdy5vcHRpb25zLmlnbm9yZUJyYWNrZXRlZFBhc3RlTW9kZSA9IGNvbmZpZy5pZ25vcmVCcmFja2V0ZWRQYXN0ZU1vZGU7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5yZXNjYWxlT3ZlcmxhcHBpbmdHbHlwaHMgPSBjb25maWcucmVzY2FsZU92ZXJsYXBwaW5nR2x5cGhzO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMuYWxsb3dUcmFuc3BhcmVuY3kgPSBjb25maWcuZW5hYmxlSW1hZ2VzO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMudnRFeHRlbnNpb25zID0ge1xuXHRcdFx0a2l0dHlLZXlib2FyZDogY29uZmlnLmVuYWJsZUtpdHR5S2V5Ym9hcmRQcm90b2NvbCxcblx0XHRcdHdpbjMySW5wdXRNb2RlOiBjb25maWcuZW5hYmxlV2luMzJJbnB1dE1vZGUsXG5cdFx0fTtcblxuXHRcdHRoaXMuX3VwZGF0ZVNtb290aFNjcm9sbGluZygpO1xuXHRcdGlmICh0aGlzLl9hdHRhY2hlZCkge1xuXHRcdFx0aWYgKHRoaXMuX2F0dGFjaGVkLm9wdGlvbnMuZW5hYmxlR3B1KSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zaG91bGRMb2FkV2ViZ2woKSkge1xuXHRcdFx0XHRcdHRoaXMuX2VuYWJsZVdlYmdsUmVuZGVyZXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZnJlc2hMaWdhdHVyZXNBZGRvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNtb290aFNjcm9sbGluZygpIHtcblx0XHR0aGlzLnJhdy5vcHRpb25zLnNtb290aFNjcm9sbER1cmF0aW9uID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuc21vb3RoU2Nyb2xsaW5nICYmIHRoaXMuX2lzUGh5c2ljYWxNb3VzZVdoZWVsID8gUmVuZGVyQ29uc3RhbnRzLlNtb290aFNjcm9sbER1cmF0aW9uIDogMDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZExvYWRXZWJnbCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmdwdUFjY2VsZXJhdGlvbiA9PT0gJ2F1dG8nICYmIFh0ZXJtVGVybWluYWwuX3N1Z2dlc3RlZFJlbmRlcmVyVHlwZSA9PT0gdW5kZWZpbmVkKSB8fCB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5ncHVBY2NlbGVyYXRpb24gPT09ICdvbic7XG5cdH1cblxuXHRmb3JjZVJlZHJhdygpIHtcblx0XHR0aGlzLnJhdy5jbGVhclRleHR1cmVBdGxhcygpO1xuXHR9XG5cblx0Y2xlYXJEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uQWRkb24/LmNsZWFyRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdGZvcmNlUmVmcmVzaCgpIHtcblx0XHR0aGlzLl9jb3JlLnZpZXdwb3J0Py5faW5uZXJSZWZyZXNoKCk7XG5cdH1cblxuXHRhc3luYyBmaW5kTmV4dCh0ZXJtOiBzdHJpbmcsIHNlYXJjaE9wdGlvbnM6IElTZWFyY2hPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fdXBkYXRlRmluZENvbG9ycyhzZWFyY2hPcHRpb25zKTtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX2dldFNlYXJjaEFkZG9uKCkpLmZpbmROZXh0KHRlcm0sIHNlYXJjaE9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgZmluZFByZXZpb3VzKHRlcm06IHN0cmluZywgc2VhcmNoT3B0aW9uczogSVNlYXJjaE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLl91cGRhdGVGaW5kQ29sb3JzKHNlYXJjaE9wdGlvbnMpO1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZ2V0U2VhcmNoQWRkb24oKSkuZmluZFByZXZpb3VzKHRlcm0sIHNlYXJjaE9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRmluZENvbG9ycyhzZWFyY2hPcHRpb25zOiBJU2VhcmNoT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHQvLyBUaGVtZSBjb2xvciBuYW1lcyBhbGlnbiB3aXRoIG1vbmFjby92c2NvZGUgd2hlcmVhcyB4dGVybS5qcyBoYXMgc29tZSBkaWZmZXJlbnQgbmFtaW5nLlxuXHRcdC8vIFRoZSBtYXBwaW5nIGlzIGFzIGZvbGxvd3M6XG5cdFx0Ly8gLSBmaW5kTWF0Y2ggLT4gYWN0aXZlTWF0Y2hcblx0XHQvLyAtIGZpbmRNYXRjaEhpZ2hsaWdodCAtPiBtYXRjaFxuXHRcdGNvbnN0IHRlcm1pbmFsQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1IpIHx8IHRoZW1lLmdldENvbG9yKFBBTkVMX0JBQ0tHUk9VTkQpO1xuXHRcdGNvbnN0IGZpbmRNYXRjaEJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9GSU5EX01BVENIX0JBQ0tHUk9VTkRfQ09MT1IpO1xuXHRcdGNvbnN0IGZpbmRNYXRjaEJvcmRlciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0ZJTkRfTUFUQ0hfQk9SREVSX0NPTE9SKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hPdmVydmlld1J1bGVyID0gdGhlbWUuZ2V0Q29sb3IoVEVSTUlOQUxfT1ZFUlZJRVdfUlVMRVJfQ1VSU09SX0ZPUkVHUk9VTkRfQ09MT1IpO1xuXHRcdGNvbnN0IGZpbmRNYXRjaEhpZ2hsaWdodEJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9GSU5EX01BVENIX0hJR0hMSUdIVF9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9GSU5EX01BVENIX0hJR0hMSUdIVF9CT1JERVJfQ09MT1IpO1xuXHRcdGNvbnN0IGZpbmRNYXRjaEhpZ2hsaWdodE92ZXJ2aWV3UnVsZXIgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9PVkVSVklFV19SVUxFUl9GSU5EX01BVENIX0ZPUkVHUk9VTkRfQ09MT1IpO1xuXHRcdHNlYXJjaE9wdGlvbnMuZGVjb3JhdGlvbnMgPSB7XG5cdFx0XHRhY3RpdmVNYXRjaEJhY2tncm91bmQ6IGZpbmRNYXRjaEJhY2tncm91bmQ/LnRvU3RyaW5nKCksXG5cdFx0XHRhY3RpdmVNYXRjaEJvcmRlcjogZmluZE1hdGNoQm9yZGVyPy50b1N0cmluZygpIHx8ICd0cmFuc3BhcmVudCcsXG5cdFx0XHRhY3RpdmVNYXRjaENvbG9yT3ZlcnZpZXdSdWxlcjogZmluZE1hdGNoT3ZlcnZpZXdSdWxlcj8udG9TdHJpbmcoKSB8fCAndHJhbnNwYXJlbnQnLFxuXHRcdFx0Ly8gZGVjb3JhdGlvbiBiZ3MgZG9uJ3Qgc3VwcG9ydCB0aGUgYWxwaGEgY2hhbm5lbCBzbyBibGVuZCBpdCB3aXRoIHRoZSByZWd1bGFyIGJnXG5cdFx0XHRtYXRjaEJhY2tncm91bmQ6IHRlcm1pbmFsQmFja2dyb3VuZCA/IGZpbmRNYXRjaEhpZ2hsaWdodEJhY2tncm91bmQ/LmJsZW5kKHRlcm1pbmFsQmFja2dyb3VuZCkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGNoQm9yZGVyOiBmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXI/LnRvU3RyaW5nKCkgfHwgJ3RyYW5zcGFyZW50Jyxcblx0XHRcdG1hdGNoT3ZlcnZpZXdSdWxlcjogZmluZE1hdGNoSGlnaGxpZ2h0T3ZlcnZpZXdSdWxlcj8udG9TdHJpbmcoKSB8fCAndHJhbnNwYXJlbnQnXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3NlYXJjaEFkZG9uUHJvbWlzZTogUHJvbWlzZTxTZWFyY2hBZGRvblR5cGU+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9nZXRTZWFyY2hBZGRvbigpOiBQcm9taXNlPFNlYXJjaEFkZG9uVHlwZT4ge1xuXHRcdGlmICghdGhpcy5fc2VhcmNoQWRkb25Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9zZWFyY2hBZGRvblByb21pc2UgPSB0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCdzZWFyY2gnKS50aGVuKChBZGRvbkN0b3IpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoJ0NvdWxkIG5vdCBjcmVhdGUgc2VhcmNoIGFkZG9uLCB0ZXJtaW5hbCBpcyBkaXNwb3NlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NlYXJjaEFkZG9uID0gbmV3IEFkZG9uQ3Rvcih7IGhpZ2hsaWdodExpbWl0OiBYdGVybVRlcm1pbmFsQ29uc3RhbnRzLlNlYXJjaEhpZ2hsaWdodExpbWl0IH0pO1xuXHRcdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5fc2VhcmNoQWRkb24pO1xuXHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fc2VhcmNoQWRkb24ub25EaWRDaGFuZ2VSZXN1bHRzKChyZXN1bHRzOiB7IHJlc3VsdEluZGV4OiBudW1iZXI7IHJlc3VsdENvdW50OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RGaW5kUmVzdWx0ID0gcmVzdWx0cztcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZpbmRSZXN1bHRzLmZpcmUocmVzdWx0cyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3NlYXJjaEFkZG9uLm9uQmVmb3JlU2VhcmNoKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9vbkJlZm9yZVNlYXJjaC5maXJlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3NlYXJjaEFkZG9uLm9uQWZ0ZXJTZWFyY2goKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX29uQWZ0ZXJTZWFyY2guZmlyZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zZWFyY2hBZGRvbjtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2VhcmNoQWRkb25Qcm9taXNlO1xuXHR9XG5cblx0Y2xlYXJTZWFyY2hEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWFyY2hBZGRvbj8uY2xlYXJEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0Y2xlYXJBY3RpdmVTZWFyY2hEZWNvcmF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaEFkZG9uPy5jbGVhckFjdGl2ZURlY29yYXRpb24oKTtcblx0fVxuXG5cdGdldEZvbnQoKTogSVRlcm1pbmFsRm9udCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChkb20uZ2V0V2luZG93KHRoaXMucmF3LmVsZW1lbnQpLCB0aGlzLl9jb3JlKTtcblx0fVxuXG5cdGdldExvbmdlc3RWaWV3cG9ydFdyYXBwZWRMaW5lTGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0bGV0IG1heExpbmVMZW5ndGggPSAwO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCAtIDE7IGkgPj0gdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS52aWV3cG9ydFk7IGktLSkge1xuXHRcdFx0Y29uc3QgbGluZUluZm8gPSB0aGlzLl9nZXRXcmFwcGVkTGluZUNvdW50KGksIHRoaXMucmF3LmJ1ZmZlci5hY3RpdmUpO1xuXHRcdFx0bWF4TGluZUxlbmd0aCA9IE1hdGgubWF4KG1heExpbmVMZW5ndGgsICgobGluZUluZm8ubGluZUNvdW50ICogdGhpcy5yYXcuY29scykgLSBsaW5lSW5mby5lbmRTcGFjZXMpIHx8IDApO1xuXHRcdFx0aSA9IGxpbmVJbmZvLmN1cnJlbnRJbmRleDtcblx0XHR9XG5cdFx0cmV0dXJuIG1heExpbmVMZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXcmFwcGVkTGluZUNvdW50KGluZGV4OiBudW1iZXIsIGJ1ZmZlcjogSUJ1ZmZlcik6IHsgbGluZUNvdW50OiBudW1iZXI7IGN1cnJlbnRJbmRleDogbnVtYmVyOyBlbmRTcGFjZXM6IG51bWJlciB9IHtcblx0XHRsZXQgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGluZGV4KTtcblx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGdldCBsaW5lJyk7XG5cdFx0fVxuXHRcdGxldCBjdXJyZW50SW5kZXggPSBpbmRleDtcblx0XHRsZXQgZW5kU3BhY2VzID0gMDtcblx0XHQvLyBsaW5lLmxlbmd0aCBtYXkgZXhjZWVkIGNvbHMgYXMgaXQgZG9lc24ndCBuZWNlc3NhcmlseSB0cmltIHRoZSBiYWNraW5nIGFycmF5IG9uIHJlc2l6ZVxuXHRcdGZvciAobGV0IGkgPSBNYXRoLm1pbihsaW5lLmxlbmd0aCwgdGhpcy5yYXcuY29scykgLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKCFsaW5lPy5nZXRDZWxsKGkpPy5nZXRDaGFycygpKSB7XG5cdFx0XHRcdGVuZFNwYWNlcysrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHdoaWxlIChsaW5lPy5pc1dyYXBwZWQgJiYgY3VycmVudEluZGV4ID4gMCkge1xuXHRcdFx0Y3VycmVudEluZGV4LS07XG5cdFx0XHRsaW5lID0gYnVmZmVyLmdldExpbmUoY3VycmVudEluZGV4KTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbGluZUNvdW50OiBpbmRleCAtIGN1cnJlbnRJbmRleCArIDEsIGN1cnJlbnRJbmRleCwgZW5kU3BhY2VzIH07XG5cdH1cblxuXHRzY3JvbGxEb3duTGluZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5zY3JvbGxMaW5lcygxKTtcblx0fVxuXG5cdHNjcm9sbERvd25QYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LnNjcm9sbFBhZ2VzKDEpO1xuXHR9XG5cblx0c2Nyb2xsVG9Cb3R0b20oKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuc2Nyb2xsVG9Cb3R0b20oKTtcblx0fVxuXG5cdHNjcm9sbFVwTGluZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5zY3JvbGxMaW5lcygtMSk7XG5cdH1cblxuXHRzY3JvbGxVcFBhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuc2Nyb2xsUGFnZXMoLTEpO1xuXHR9XG5cblx0c2Nyb2xsVG9Ub3AoKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuc2Nyb2xsVG9Ub3AoKTtcblx0fVxuXG5cdHNjcm9sbFRvTGluZShsaW5lOiBudW1iZXIsIHBvc2l0aW9uOiBTY3JvbGxQb3NpdGlvbiA9IFNjcm9sbFBvc2l0aW9uLlRvcCk6IHZvaWQge1xuXHRcdHRoaXMubWFya1RyYWNrZXIuc2Nyb2xsVG9MaW5lKGxpbmUsIHBvc2l0aW9uKTtcblx0fVxuXG5cdGNsZWFyQnVmZmVyKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LmNsZWFyKCk7XG5cdFx0Ly8geHRlcm0uanMgZG9lcyBub3QgY2xlYXIgdGhlIGZpcnN0IHByb21wdCwgc28gdHJpZ2dlciB0aGVzZSB0byBzaW11bGF0ZVxuXHRcdC8vIHRoZSBwcm9tcHQgYmVpbmcgd3JpdHRlblxuXHRcdHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pPy5oYW5kbGVQcm9tcHRTdGFydCgpO1xuXHRcdHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pPy5oYW5kbGVDb21tYW5kU3RhcnQoKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuY2xlYXIpO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcucmVzZXQoKTtcblx0fVxuXG5cdGhhc1NlbGVjdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yYXcuaGFzU2VsZWN0aW9uKCk7XG5cdH1cblxuXHRjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5jbGVhclNlbGVjdGlvbigpO1xuXHR9XG5cblx0c2VsZWN0TWFya2VkUmFuZ2UoZnJvbU1hcmtlcklkOiBzdHJpbmcsIHRvTWFya2VySWQ6IHN0cmluZywgc2Nyb2xsSW50b1ZpZXcgPSBmYWxzZSkge1xuXHRcdGNvbnN0IGRldGVjdGlvbkNhcGFiaWxpdHkgPSB0aGlzLnNoZWxsSW50ZWdyYXRpb24uY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbik7XG5cdFx0aWYgKCFkZXRlY3Rpb25DYXBhYmlsaXR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBkZXRlY3Rpb25DYXBhYmlsaXR5LmdldE1hcmsoZnJvbU1hcmtlcklkKTtcblx0XHRjb25zdCBlbmQgPSBkZXRlY3Rpb25DYXBhYmlsaXR5LmdldE1hcmsodG9NYXJrZXJJZCk7XG5cdFx0aWYgKHN0YXJ0ID09PSB1bmRlZmluZWQgfHwgZW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJhdy5zZWxlY3RMaW5lcyhzdGFydC5saW5lLCBlbmQubGluZSk7XG5cdFx0aWYgKHNjcm9sbEludG9WaWV3KSB7XG5cdFx0XHR0aGlzLnJhdy5zY3JvbGxUb0xpbmUoc3RhcnQubGluZSk7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0QWxsKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LmZvY3VzKCk7XG5cdFx0dGhpcy5yYXcuc2VsZWN0QWxsKCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5mb2N1cygpO1xuXHR9XG5cblx0YXN5bmMgY29weVNlbGVjdGlvbihhc0h0bWw/OiBib29sZWFuLCBjb21tYW5kPzogSVRlcm1pbmFsQ29tbWFuZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmhhc1NlbGVjdGlvbigpIHx8IChhc0h0bWwgJiYgY29tbWFuZCkpIHtcblx0XHRcdGlmIChhc0h0bWwpIHtcblx0XHRcdFx0Y29uc3QgdGV4dEFzSHRtbCA9IGF3YWl0IHRoaXMuZ2V0U2VsZWN0aW9uQXNIdG1sKGNvbW1hbmQpO1xuXHRcdFx0XHRmdW5jdGlvbiBsaXN0ZW5lcihlOiBDbGlwYm9hcmRFdmVudCkge1xuXHRcdFx0XHRcdGlmIChlLmNsaXBib2FyZERhdGEpIHtcblx0XHRcdFx0XHRcdGlmICghZS5jbGlwYm9hcmREYXRhLnR5cGVzLmluY2x1ZGVzKCd0ZXh0L3BsYWluJykpIHtcblx0XHRcdFx0XHRcdFx0ZS5jbGlwYm9hcmREYXRhLnNldERhdGEoJ3RleHQvcGxhaW4nLCBjb21tYW5kPy5nZXRPdXRwdXQoKSA/PyAnJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlLmNsaXBib2FyZERhdGEuc2V0RGF0YSgndGV4dC9odG1sJywgdGV4dEFzSHRtbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkb2MgPSBkb20uZ2V0RG9jdW1lbnQodGhpcy5yYXcuZWxlbWVudCk7XG5cdFx0XHRcdGRvYy5hZGRFdmVudExpc3RlbmVyKCdjb3B5JywgbGlzdGVuZXIpO1xuXHRcdFx0XHRkb2MuZXhlY0NvbW1hbmQoJ2NvcHknKTtcblx0XHRcdFx0ZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvcHknLCBsaXN0ZW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh0aGlzLnJhdy5nZXRTZWxlY3Rpb24oKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb3B5U2VsZWN0aW9uLm5vU2VsZWN0aW9uJywgJ1RoZSB0ZXJtaW5hbCBoYXMgbm8gc2VsZWN0aW9uIHRvIGNvcHknKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q3Vyc29yQmxpbmsoYmxpbms6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5yYXcub3B0aW9ucy5jdXJzb3JCbGluayAhPT0gYmxpbmspIHtcblx0XHRcdHRoaXMucmF3Lm9wdGlvbnMuY3Vyc29yQmxpbmsgPSBibGluaztcblx0XHRcdHRoaXMucmF3LnJlZnJlc2goMCwgdGhpcy5yYXcucm93cyAtIDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldFRleHRCbGlua2luZyhlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgYmxpbmtJbnRlcnZhbER1cmF0aW9uID0gZW5hYmxlZCA/IFRleHRCbGlua0NvbnN0YW50cy5JbnRlcnZhbER1cmF0aW9uIDogMDtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5yYXcub3B0aW9ucztcblx0XHRpZiAob3B0aW9ucy5ibGlua0ludGVydmFsRHVyYXRpb24gIT09IGJsaW5rSW50ZXJ2YWxEdXJhdGlvbikge1xuXHRcdFx0b3B0aW9ucy5ibGlua0ludGVydmFsRHVyYXRpb24gPSBibGlua0ludGVydmFsRHVyYXRpb247XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q3Vyc29yU3R5bGUoc3R5bGU6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25bJ2N1cnNvclN0eWxlJ10pOiB2b2lkIHtcblx0XHRjb25zdCBtYXBwZWQgPSB2c2NvZGVUb1h0ZXJtQ3Vyc29yU3R5bGU8J2N1cnNvclN0eWxlJz4oc3R5bGUpO1xuXHRcdGlmICh0aGlzLnJhdy5vcHRpb25zLmN1cnNvclN0eWxlICE9PSBtYXBwZWQpIHtcblx0XHRcdHRoaXMucmF3Lm9wdGlvbnMuY3Vyc29yU3R5bGUgPSBtYXBwZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q3Vyc29yU3R5bGVJbmFjdGl2ZShzdHlsZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblsnY3Vyc29yU3R5bGVJbmFjdGl2ZSddKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFwcGVkID0gdnNjb2RlVG9YdGVybUN1cnNvclN0eWxlKHN0eWxlKTtcblx0XHRpZiAodGhpcy5yYXcub3B0aW9ucy5jdXJzb3JJbmFjdGl2ZVN0eWxlICE9PSBtYXBwZWQpIHtcblx0XHRcdHRoaXMucmF3Lm9wdGlvbnMuY3Vyc29ySW5hY3RpdmVTdHlsZSA9IG1hcHBlZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDdXJzb3JXaWR0aCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmF3Lm9wdGlvbnMuY3Vyc29yV2lkdGggIT09IHdpZHRoKSB7XG5cdFx0XHR0aGlzLnJhdy5vcHRpb25zLmN1cnNvcldpZHRoID0gd2lkdGg7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5hYmxlV2ViZ2xSZW5kZXJlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDdXJyZW50bHkgd2ViZ2wgb3B0aW9ucyBjYW4gb25seSBiZSBzcGVjaWZpZWQgb24gYWRkb24gY3JlYXRpb25cblx0XHRpZiAoIXRoaXMucmF3LmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VzdG9tR2x5cGhzID0gdGhpcy5fZ2V0V2ViZ2xDdXN0b21HbHlwaHMoKTtcblx0XHRpZiAoKHRoaXMuX3dlYmdsQWRkb24gfHwgdGhpcy5fd2ViZ2xBZGRvbkxvYWRpbmcpICYmIHRoaXMuX3dlYmdsQWRkb25DdXN0b21HbHlwaHMgPT09IGN1c3RvbUdseXBocykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2Ugb2YgZXhpc3RpbmcgYWRkb24gYmVmb3JlIGNyZWF0aW5nIGEgbmV3IG9uZSB0byBhdm9pZCBsZWFraW5nIFdlYkdMIGNvbnRleHRzXG5cdFx0dGhpcy5fZGlzcG9zZU9mV2ViZ2xSZW5kZXJlcigpO1xuXG5cdFx0Y29uc3QgbG9hZElkID0gdGhpcy5fd2ViZ2xBZGRvbkxvYWRJZDtcblx0XHR0aGlzLl93ZWJnbEFkZG9uTG9hZGluZyA9IHRydWU7XG5cdFx0dGhpcy5fd2ViZ2xBZGRvbkN1c3RvbUdseXBocyA9IGN1c3RvbUdseXBocztcblxuXHRcdGxldCBBZGRvbjogdHlwZW9mIFdlYmdsQWRkb25UeXBlO1xuXHRcdHRyeSB7XG5cdFx0XHRBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3dlYmdsJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChsb2FkSWQgPT09IHRoaXMuX3dlYmdsQWRkb25Mb2FkSWQpIHtcblx0XHRcdFx0dGhpcy5fd2ViZ2xBZGRvbkxvYWRpbmcgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fd2ViZ2xBZGRvbkN1c3RvbUdseXBocyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHRpZiAobG9hZElkICE9PSB0aGlzLl93ZWJnbEFkZG9uTG9hZElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2ViZ2xBZGRvbkxvYWRpbmcgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMucmF3LmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3dlYmdsQWRkb25DdXN0b21HbHlwaHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEN1c3RvbUdseXBocyA9IHRoaXMuX2dldFdlYmdsQ3VzdG9tR2x5cGhzKCk7XG5cdFx0aWYgKGN1c3RvbUdseXBocyAhPT0gY3VycmVudEN1c3RvbUdseXBocykge1xuXHRcdFx0dGhpcy5fd2ViZ2xBZGRvbkN1c3RvbUdseXBocyA9IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IHRoaXMuX2VuYWJsZVdlYmdsUmVuZGVyZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl93ZWJnbEFkZG9uID0gbmV3IEFkZG9uKHtcblx0XHRcdGN1c3RvbUdseXBoc1xuXHRcdH0pO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5fd2ViZ2xBZGRvbik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdXZWJnbCB3YXMgbG9hZGVkJyk7XG5cdFx0XHR0aGlzLl93ZWJnbENvbnRleHRMb3NzTGlzdGVuZXIudmFsdWUgPSB0aGlzLl93ZWJnbEFkZG9uLm9uQ29udGV4dExvc3MoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFdlYmdsIGxvc3QgY29udGV4dCwgZGlzcG9zaW5nIG9mIHdlYmdsIHJlbmRlcmVyYCk7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VPZldlYmdsUmVuZGVyZXIoKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVmcmVzaEltYWdlQWRkb24oKTtcblx0XHRcdC8vIFdlYkdMIHJlbmRlcmVyIGNlbGwgZGltZW5zaW9ucyBkaWZmZXIgZnJvbSB0aGUgRE9NIHJlbmRlcmVyLCBtYWtlIHN1cmUgdGhlIHRlcm1pbmFsXG5cdFx0XHQvLyBnZXRzIHJlc2l6ZWQgYWZ0ZXIgdGhlIHdlYmdsIGFkZG9uIGlzIGxvYWRlZFxuXHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0UmVmcmVzaERpbWVuc2lvbnMuZmlyZSgpO1xuXHRcdFx0Ly8gVW5jb21tZW50IHRvIGFkZCB0aGUgdGV4dHVyZSBhdGxhcyB0byB0aGUgRE9NXG5cdFx0XHQvLyBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdC8vIFx0aWYgKHRoaXMuX3dlYmdsQWRkb24/LnRleHR1cmVBdGxhcykge1xuXHRcdFx0Ly8gXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5fd2ViZ2xBZGRvbj8udGV4dHVyZUF0bGFzKTtcblx0XHRcdC8vIFx0fVxuXHRcdFx0Ly8gfSwgNTAwMCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBXZWJnbCBjb3VsZCBub3QgYmUgbG9hZGVkLiBGYWxsaW5nIGJhY2sgdG8gdGhlIERPTSByZW5kZXJlcmAsIGUpO1xuXHRcdFx0WHRlcm1UZXJtaW5hbC5fc3VnZ2VzdGVkUmVuZGVyZXJUeXBlID0gJ2RvbSc7XG5cdFx0XHR0aGlzLl9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0V2ViZ2xDdXN0b21HbHlwaHMoKTogYm9vbGVhbiB7XG5cdFx0Ly8gVGhlIGN1c3RvbSBnbHlwaCByYXN0ZXJpemVyIGNyZWF0ZXMgYSBjYW52YXMgdGhyb3VnaCB0aGUgcmVuZGVyaW5nIGRvY3VtZW50LCB3aGljaCBpcyBibG9ja2VkIGluIGF1eGlsaWFyeSB3aW5kb3dzLlxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5jdXN0b21HbHlwaHMgJiYgdGhpcy5yYXcuZWxlbWVudD8ub3duZXJEb2N1bWVudCA9PT0gdGhpcy5fbWFpbkRvY3VtZW50O1xuXHR9XG5cblx0QGRlYm91bmNlKDEwMClcblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaExpZ2F0dXJlc0FkZG9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5yYXcuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaWdhdHVyZXNDb25maWcgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5mb250TGlnYXR1cmVzO1xuXHRcdGxldCBzaG91bGRSZWNyZWF0ZVdlYmdsUmVuZGVyZXIgPSBmYWxzZTtcblx0XHRpZiAobGlnYXR1cmVzQ29uZmlnPy5lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBsaWdhdHVyZU9wdGlvbnM6IElMaWdhdHVyZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGZvbnRGZWF0dXJlU2V0dGluZ3M6IGxpZ2F0dXJlc0NvbmZpZy5mZWF0dXJlU2V0dGluZ3MsXG5cdFx0XHRcdGZhbGxiYWNrTGlnYXR1cmVzOiBsaWdhdHVyZXNDb25maWcuZmFsbGJhY2tMaWdhdHVyZXMsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKHRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlICYmICFlcXVhbHMobGlnYXR1cmVPcHRpb25zLCB0aGlzLl9saWdhdHVyZXNBZGRvbkNvbmZpZykpIHtcblx0XHRcdFx0dGhpcy5fbGlnYXR1cmVzQWRkb24uY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fbGlnYXR1cmVzQWRkb25Db25maWcgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IExpZ2F0dXJlc0FkZG9uID0gYXdhaXQgdGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignbGlnYXR1cmVzJyk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGlnYXR1cmVzQWRkb24sIGxpZ2F0dXJlT3B0aW9ucyk7XG5cdFx0XHRcdHRoaXMuX2xpZ2F0dXJlc0FkZG9uQ29uZmlnID0gbGlnYXR1cmVPcHRpb25zO1xuXHRcdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5fbGlnYXR1cmVzQWRkb24udmFsdWUpO1xuXHRcdFx0XHRzaG91bGRSZWNyZWF0ZVdlYmdsUmVuZGVyZXIgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xpZ2F0dXJlc0FkZG9uLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9saWdhdHVyZXNBZGRvbkNvbmZpZyA9IHVuZGVmaW5lZDtcblx0XHRcdHNob3VsZFJlY3JlYXRlV2ViZ2xSZW5kZXJlciA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZFJlY3JlYXRlV2ViZ2xSZW5kZXJlciAmJiB0aGlzLl93ZWJnbEFkZG9uKSB7XG5cdFx0XHQvLyBSZS1jcmVhdGUgdGhlIHdlYmdsIGFkZG9uIHdoZW4gbGlnYXR1cmVzIHN0YXRlIGNoYW5nZXMgdG8gc28gdGhlIHRleHR1cmUgYXRsYXMgcGlja3MgdXBcblx0XHRcdC8vIHN0eWxlcyBmcm9tIHRoZSBET00uXG5cdFx0XHR0aGlzLl9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9lbmFibGVXZWJnbFJlbmRlcmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0QGRlYm91bmNlKDEwMClcblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaEltYWdlQWRkb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSBhbGxvdyB0aGUgaW1hZ2UgYWRkb24gd2hlbiB3ZWJnbCBpcyBiZWluZyB1c2VkIHRvIGF2b2lkIHBvc3NpYmxlIEdQVSBpc3N1ZXNcblx0XHRpZiAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlSW1hZ2VzICYmIHRoaXMuX3dlYmdsQWRkb24pIHtcblx0XHRcdGlmICghdGhpcy5faW1hZ2VBZGRvbikge1xuXHRcdFx0XHRjb25zdCBBZGRvbkN0b3IgPSBhd2FpdCB0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCdpbWFnZScpO1xuXHRcdFx0XHR0aGlzLl9pbWFnZUFkZG9uID0gbmV3IEFkZG9uQ3RvcigpO1xuXHRcdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5faW1hZ2VBZGRvbik7XG5cdFx0XHRcdHR5cGUgVGVybWluYWxJbWFnZUFkZG9uQWN0aXZhdGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdhbnRob255a2ltMSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIHRoZSB4dGVybS5qcyBpbWFnZSBhZGRvbiBpcyBsb2FkZWQsIGluY2x1ZGluZyBkeW5hbWljIGVuYWJsZW1lbnQnO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIFRlcm1pbmFsSW1hZ2VBZGRvbkFjdGl2YXRlZENsYXNzaWZpY2F0aW9uPigndGVybWluYWwvaW1hZ2VBZGRvbkFjdGl2YXRlZCcpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbWFnZUFkZG9uLm9uSW1hZ2VBZGRlZCgoKSA9PiB7XG5cdFx0XHRcdFx0dHlwZSBUZXJtaW5hbEltYWdlQWRkZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnYW50aG9ueWtpbTEnO1xuXHRcdFx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIGFuIGltYWdlIGlzIGFkZGVkIHRvIHRoZSB0ZXJtaW5hbCB2aWEgdGhlIGltYWdlIGFkZG9uJztcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwgVGVybWluYWxJbWFnZUFkZGVkQ2xhc3NpZmljYXRpb24+KCd0ZXJtaW5hbC9pbWFnZUFkZGVkJyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5faW1hZ2VBZGRvbj8uZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW1hZ2VBZGRvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dlYmdsQWRkb25Mb2FkSWQrKztcblx0XHR0aGlzLl93ZWJnbEFkZG9uTG9hZGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3dlYmdsQWRkb25DdXN0b21HbHlwaHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2ViZ2xDb250ZXh0TG9zc0xpc3RlbmVyLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLl93ZWJnbEFkZG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl93ZWJnbEFkZG9uPy5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cdFx0dGhpcy5fd2ViZ2xBZGRvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWZyZXNoSW1hZ2VBZGRvbigpO1xuXHRcdC8vIFdlYkdMIHJlbmRlcmVyIGNlbGwgZGltZW5zaW9ucyBkaWZmZXIgZnJvbSB0aGUgRE9NIHJlbmRlcmVyLCBtYWtlIHN1cmUgdGhlIHRlcm1pbmFsXG5cdFx0Ly8gZ2V0cyByZXNpemVkIGFmdGVyIHRoZSB3ZWJnbCBhZGRvbiBpcyBkaXNwb3NlZFxuXHRcdHRoaXMuX29uRGlkUmVxdWVzdFJlZnJlc2hEaW1lbnNpb25zLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGdldFJhbmdlQXNWVChzdGFydE1hcmtlcj86IElYdGVybU1hcmtlciwgZW5kTWFya2VyPzogSVh0ZXJtTWFya2VyLCBza2lwTGFzdExpbmU/OiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX3NlcmlhbGl6ZUFkZG9uKSB7XG5cdFx0XHRjb25zdCBBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3NlcmlhbGl6ZScpO1xuXHRcdFx0dGhpcy5fc2VyaWFsaXplQWRkb24gPSBuZXcgQWRkb24oKTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9zZXJpYWxpemVBZGRvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdExpbmUgPSB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCAtIDE7XG5cdFx0aWYgKGxhc3RMaW5lIDwgMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1ZhbGlkRW5kTWFya2VyID0gaXNOdW1iZXIoZW5kTWFya2VyPy5saW5lKTtcblx0XHRjb25zdCBzdGFydCA9IGNsYW1wKGlzTnVtYmVyKHN0YXJ0TWFya2VyPy5saW5lKSAmJiBzdGFydE1hcmtlci5saW5lID4gLTEgPyBzdGFydE1hcmtlci5saW5lIDogMCwgMCwgbGFzdExpbmUpO1xuXHRcdGxldCBlbmQgPSBoYXNWYWxpZEVuZE1hcmtlciA/IGVuZE1hcmtlci5saW5lIDogdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS5sZW5ndGggLSAxO1xuXHRcdGlmIChza2lwTGFzdExpbmUgJiYgaGFzVmFsaWRFbmRNYXJrZXIpIHtcblx0XHRcdGVuZCA9IGVuZCAtIDE7XG5cdFx0fVxuXHRcdGVuZCA9IGNsYW1wKE1hdGgubWF4KGVuZCwgc3RhcnQpLCBzdGFydCwgbGFzdExpbmUpO1xuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVBZGRvbi5zZXJpYWxpemUoe1xuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnQsXG5cdFx0XHRcdGVuZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblxuXHRnZXRYdGVybVRoZW1lKHRoZW1lPzogSUNvbG9yVGhlbWUpOiBJVGhlbWUge1xuXHRcdGlmICghdGhlbWUpIHtcblx0XHRcdHRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZztcblx0XHRjb25zdCBoaWRlT3ZlcnZpZXdSdWxlciA9IFsnbmV2ZXInLCAnZ3V0dGVyJ10uaW5jbHVkZXMoY29uZmlnLnNoZWxsSW50ZWdyYXRpb24/LmRlY29yYXRpb25zRW5hYmxlZCA/PyAnJyk7XG5cblx0XHRjb25zdCBmb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9GT1JFR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl94dGVybUNvbG9yUHJvdmlkZXIuZ2V0QmFja2dyb3VuZENvbG9yKHRoZW1lKTtcblx0XHRjb25zdCBjdXJzb3JDb2xvciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SKSB8fCBmb3JlZ3JvdW5kQ29sb3I7XG5cdFx0Y29uc3QgY3Vyc29yQWNjZW50Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9DVVJTT1JfQkFDS0dST1VORF9DT0xPUikgfHwgYmFja2dyb3VuZENvbG9yO1xuXHRcdGNvbnN0IHNlbGVjdGlvbkJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBzZWxlY3Rpb25JbmFjdGl2ZUJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0lOQUNUSVZFX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBzZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9TRUxFQ1RJT05fRk9SRUdST1VORF9DT0xPUikgfHwgdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGJhY2tncm91bmQ6IGJhY2tncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdGZvcmVncm91bmQ6IGZvcmVncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdGN1cnNvcjogY3Vyc29yQ29sb3I/LnRvU3RyaW5nKCksXG5cdFx0XHRjdXJzb3JBY2NlbnQ6IGN1cnNvckFjY2VudENvbG9yPy50b1N0cmluZygpLFxuXHRcdFx0c2VsZWN0aW9uQmFja2dyb3VuZDogc2VsZWN0aW9uQmFja2dyb3VuZENvbG9yPy50b1N0cmluZygpLFxuXHRcdFx0c2VsZWN0aW9uSW5hY3RpdmVCYWNrZ3JvdW5kOiBzZWxlY3Rpb25JbmFjdGl2ZUJhY2tncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdHNlbGVjdGlvbkZvcmVncm91bmQ6IHNlbGVjdGlvbkZvcmVncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IGhpZGVPdmVydmlld1J1bGVyID8gJyMwMDAwJyA6IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0JPUkRFUl9DT0xPUik/LnRvU3RyaW5nKCksXG5cdFx0XHRzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdHNjcm9sbGJhclNsaWRlckJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKHNjcm9sbGJhclNsaWRlckJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0c2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0YmxhY2s6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzBdKT8udG9TdHJpbmcoKSxcblx0XHRcdHJlZDogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbMV0pPy50b1N0cmluZygpLFxuXHRcdFx0Z3JlZW46IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzJdKT8udG9TdHJpbmcoKSxcblx0XHRcdHllbGxvdzogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbM10pPy50b1N0cmluZygpLFxuXHRcdFx0Ymx1ZTogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbNF0pPy50b1N0cmluZygpLFxuXHRcdFx0bWFnZW50YTogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbNV0pPy50b1N0cmluZygpLFxuXHRcdFx0Y3lhbjogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbNl0pPy50b1N0cmluZygpLFxuXHRcdFx0d2hpdGU6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzddKT8udG9TdHJpbmcoKSxcblx0XHRcdGJyaWdodEJsYWNrOiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1s4XSk/LnRvU3RyaW5nKCksXG5cdFx0XHRicmlnaHRSZWQ6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzldKT8udG9TdHJpbmcoKSxcblx0XHRcdGJyaWdodEdyZWVuOiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1sxMF0pPy50b1N0cmluZygpLFxuXHRcdFx0YnJpZ2h0WWVsbG93OiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1sxMV0pPy50b1N0cmluZygpLFxuXHRcdFx0YnJpZ2h0Qmx1ZTogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbMTJdKT8udG9TdHJpbmcoKSxcblx0XHRcdGJyaWdodE1hZ2VudGE6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzEzXSk/LnRvU3RyaW5nKCksXG5cdFx0XHRicmlnaHRDeWFuOiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1sxNF0pPy50b1N0cmluZygpLFxuXHRcdFx0YnJpZ2h0V2hpdGU6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzE1XSk/LnRvU3RyaW5nKClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGhlbWUodGhlbWU/OiBJQ29sb3JUaGVtZSk6IHZvaWQge1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMudGhlbWUgPSB0aGlzLmdldFh0ZXJtVGhlbWUodGhlbWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHRlcm1pbmFsIHRoZW1lLiBVc2UgdGhpcyB0byBleHRlcm5hbGx5IHRyaWdnZXIgYSB0aGVtZVxuXHQgKiByZWZyZXNoIGZvciBkZXRhY2hlZCB0ZXJtaW5hbHMgdGhhdCBza2lwIGdsb2JhbCBzZXJ2aWNlIGxpc3RlbmVycy5cblx0ICovXG5cdHVwZGF0ZVRoZW1lKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lKCk7XG5cdH1cblxuXHRyZWZyZXNoKCkge1xuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkFkZG9uLnJlZnJlc2hMYXlvdXRzKCk7XG5cdFx0aWYgKHRoaXMuX3dlYmdsQWRkb24gfHwgdGhpcy5fd2ViZ2xBZGRvbkxvYWRpbmcpIHtcblx0XHRcdHRoaXMuX2VuYWJsZVdlYmdsUmVuZGVyZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVVbmljb2RlVmVyc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3VuaWNvZGUxMUFkZG9uICYmIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uID09PSAnMTEnKSB7XG5cdFx0XHRjb25zdCBBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3VuaWNvZGUxMScpO1xuXHRcdFx0dGhpcy5fdW5pY29kZTExQWRkb24gPSBuZXcgQWRkb24oKTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl91bmljb2RlMTFBZGRvbik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJhdy51bmljb2RlLmFjdGl2ZVZlcnNpb24gIT09IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uKSB7XG5cdFx0XHR0aGlzLnJhdy51bmljb2RlLmFjdGl2ZVZlcnNpb24gPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy51bmljb2RlVmVyc2lvbjtcblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdF93cml0ZVRleHQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcud3JpdGUoZGF0YSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FueVRlcm1pbmFsRm9jdXNDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0dGhpcy5fYW55Rm9jdXNlZFRlcm1pbmFsSGFzU2VsZWN0aW9uLnJlc2V0KCk7XG5cdFx0dGhpcy5fZGlzcG9zZU9mV2ViZ2xSZW5kZXJlcigpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRYdGVybVNjYWxlZERpbWVuc2lvbnModzogV2luZG93LCBmb250OiBJVGVybWluYWxGb250LCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHsgcm93czogbnVtYmVyOyBjb2xzOiBudW1iZXIgfSB8IG51bGwge1xuXHRpZiAoIWZvbnQuY2hhcldpZHRoIHx8ICFmb250LmNoYXJIZWlnaHQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vIEJlY2F1c2UgeHRlcm0uanMgY29udmVydHMgZnJvbSBDU1MgcGl4ZWxzIHRvIGFjdHVhbCBwaXhlbHMgdGhyb3VnaFxuXHQvLyB0aGUgdXNlIG9mIGNhbnZhcywgd2luZG93LmRldmljZVBpeGVsUmF0aW8gbmVlZHMgdG8gYmUgdXNlZCBoZXJlIGluXG5cdC8vIG9yZGVyIHRvIGJlIHByZWNpc2UuIGZvbnQuY2hhcldpZHRoL2NoYXJIZWlnaHQgYWxvbmUgYXMgaW5zdWZmaWNpZW50XG5cdC8vIHdoZW4gd2luZG93LmRldmljZVBpeGVsUmF0aW8gY2hhbmdlcy5cblx0Y29uc3Qgc2NhbGVkV2lkdGhBdmFpbGFibGUgPSB3aWR0aCAqIHcuZGV2aWNlUGl4ZWxSYXRpbztcblxuXHRjb25zdCBzY2FsZWRDaGFyV2lkdGggPSBmb250LmNoYXJXaWR0aCAqIHcuZGV2aWNlUGl4ZWxSYXRpbyArIGZvbnQubGV0dGVyU3BhY2luZztcblx0Y29uc3QgY29scyA9IE1hdGgubWF4KE1hdGguZmxvb3Ioc2NhbGVkV2lkdGhBdmFpbGFibGUgLyBzY2FsZWRDaGFyV2lkdGgpLCAxKTtcblxuXHRjb25zdCBzY2FsZWRIZWlnaHRBdmFpbGFibGUgPSBoZWlnaHQgKiB3LmRldmljZVBpeGVsUmF0aW87XG5cdGNvbnN0IHNjYWxlZENoYXJIZWlnaHQgPSBNYXRoLmNlaWwoZm9udC5jaGFySGVpZ2h0ICogdy5kZXZpY2VQaXhlbFJhdGlvKTtcblx0Y29uc3Qgc2NhbGVkTGluZUhlaWdodCA9IE1hdGguZmxvb3Ioc2NhbGVkQ2hhckhlaWdodCAqIGZvbnQubGluZUhlaWdodCk7XG5cdGNvbnN0IHJvd3MgPSBNYXRoLm1heChNYXRoLmZsb29yKHNjYWxlZEhlaWdodEF2YWlsYWJsZSAvIHNjYWxlZExpbmVIZWlnaHQpLCAxKTtcblxuXHRyZXR1cm4geyByb3dzLCBjb2xzIH07XG59XG5cbmZ1bmN0aW9uIHZzY29kZVRvWHRlcm1Mb2dMZXZlbChsb2dMZXZlbDogTG9nTGV2ZWwpOiBYdGVybUxvZ0xldmVsIHtcblx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6IHJldHVybiAndHJhY2UnO1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6IHJldHVybiAnZGVidWcnO1xuXHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzogcmV0dXJuICdpbmZvJztcblx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IHJldHVybiAnd2Fybic7XG5cdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjogcmV0dXJuICdlcnJvcic7XG5cdFx0ZGVmYXVsdDogcmV0dXJuICdvZmYnO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ3Vyc29yU3R5bGVWc2NvZGVUb1h0ZXJtTWFwIHtcblx0J2N1cnNvclN0eWxlJzogTm9uTnVsbGFibGU8SVRlcm1pbmFsT3B0aW9uc1snY3Vyc29yU3R5bGUnXT47XG5cdCdjdXJzb3JTdHlsZUluYWN0aXZlJzogTm9uTnVsbGFibGU8SVRlcm1pbmFsT3B0aW9uc1snY3Vyc29ySW5hY3RpdmVTdHlsZSddPjtcbn1cbmZ1bmN0aW9uIHZzY29kZVRvWHRlcm1DdXJzb3JTdHlsZTxUIGV4dGVuZHMgJ2N1cnNvclN0eWxlJyB8ICdjdXJzb3JTdHlsZUluYWN0aXZlJz4oc3R5bGU6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25bVF0pOiBJQ3Vyc29yU3R5bGVWc2NvZGVUb1h0ZXJtTWFwW1RdIHtcblx0Ly8gJ2xpbmUnIGlzIHVzZWQgaW5zdGVhZCBvZiBiYXIgaW4gVlMgQ29kZSB0byBiZSBjb25zaXN0ZW50IHdpdGggZWRpdG9yLmN1cnNvclN0eWxlXG5cdGlmIChzdHlsZSA9PT0gJ2xpbmUnKSB7XG5cdFx0cmV0dXJuICdiYXInO1xuXHR9XG5cdHJldHVybiBzdHlsZSBhcyBJQ3Vyc29yU3R5bGVWc2NvZGVUb1h0ZXJtTWFwW1RdO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFhQSxZQUFZLFNBQVM7QUFFckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFFL0QsU0FBNEIscUJBQXFCLHlCQUFnRDtBQUVqRyxTQUFvRix3QkFBOEUscUNBQXFDO0FBQ3ZNLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCLHNCQUFzQjtBQUNwRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFzQixxQkFBcUI7QUFDM0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBMkIsMkJBQTJCLGtDQUFrQyxrQ0FBa0Msc0JBQXNCLHFDQUFxQyxzQ0FBc0MsZ0RBQWdELGtDQUFrQyxxREFBcUQsNENBQTRDLGlEQUFpRCxxQ0FBcUMsOENBQThDLDRDQUE0QztBQUN2a0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7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aUNOLFNBQVMseUJBQXlCLEdBQVcsTUFBcUIsT0FBZSxRQUF1RDtBQUM5SSxNQUFJLENBQUMsS0FBSyxhQUFhLENBQUMsS0FBSyxZQUFZO0FBQ3hDLFdBQU87QUFBQSxFQUNSO0FBTUEsUUFBTSx1QkFBdUIsUUFBUSxFQUFFO0FBRXZDLFFBQU0sa0JBQWtCLEtBQUssWUFBWSxFQUFFLG1CQUFtQixLQUFLO0FBQ25FLFFBQU0sT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLHVCQUF1QixlQUFlLEdBQUcsQ0FBQztBQUUzRSxRQUFNLHdCQUF3QixTQUFTLEVBQUU7QUFDekMsUUFBTSxtQkFBbUIsS0FBSyxLQUFLLEtBQUssYUFBYSxFQUFFLGdCQUFnQjtBQUN2RSxRQUFNLG1CQUFtQixLQUFLLE1BQU0sbUJBQW1CLEtBQUssVUFBVTtBQUN0RSxRQUFNLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSx3QkFBd0IsZ0JBQWdCLEdBQUcsQ0FBQztBQUU3RSxTQUFPLEVBQUUsTUFBTSxLQUFLO0FBQ3JCO0FBRUEsU0FBUyxzQkFBc0IsVUFBbUM7QUFDakUsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSyxTQUFTO0FBQU8sYUFBTztBQUFBLElBQzVCLEtBQUssU0FBUztBQUFPLGFBQU87QUFBQSxJQUM1QixLQUFLLFNBQVM7QUFBTSxhQUFPO0FBQUEsSUFDM0IsS0FBSyxTQUFTO0FBQVMsYUFBTztBQUFBLElBQzlCLEtBQUssU0FBUztBQUFPLGFBQU87QUFBQSxJQUM1QjtBQUFTLGFBQU87QUFBQSxFQUNqQjtBQUNEO0FBTUEsU0FBUyx5QkFBMEUsT0FBbUU7QUFFckosTUFBSSxVQUFVLFFBQVE7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIlJlbmRlckNvbnN0YW50cyIsICJUZXJtaW5hbFNjcm9sbGJhcldpZHRoIiwgIlRleHRCbGlua0NvbnN0YW50cyIsICJsaXN0ZW5lciJdCn0K
