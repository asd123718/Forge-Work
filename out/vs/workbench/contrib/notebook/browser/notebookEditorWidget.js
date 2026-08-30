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
import "./media/notebook.css";
import "./media/notebookCellChat.css";
import "./media/notebookCellEditorHint.css";
import "./media/notebookCellInsertToolbar.css";
import "./media/notebookCellStatusBar.css";
import "./media/notebookCellTitleToolbar.css";
import "./media/notebookFocusIndicator.css";
import "./media/notebookToolbar.css";
import "./media/notebookDnd.css";
import "./media/notebookFolding.css";
import "./media/notebookCellOutput.css";
import "./media/notebookEditorStickyScroll.css";
import "./media/notebookKernelActionViewItem.css";
import "./media/notebookOutline.css";
import "./media/notebookChatEditController.css";
import "./media/notebookChatEditorOverlay.css";
import * as DOM from "../../../../base/browser/dom.js";
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import { OverlayLayoutElement } from "../../../../base/browser/overlayLayoutElement.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { SequencerByKey } from "../../../../base/common/async.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { setTimeout0 } from "../../../../base/common/platform.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { FontMeasurements } from "../../../../editor/browser/config/fontMeasurements.js";
import { createBareFontInfoFromRawSettings } from "../../../../editor/common/config/fontInfoFromSettings.js";
import { Range } from "../../../../editor/common/core/range.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { registerZIndex, ZIndex } from "../../../../platform/layout/browser/zIndexRegistry.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { contrastBorder, errorForeground, focusBorder, foreground, listInactiveSelectionBackground, registerColor, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, transparent } from "../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_PANE_BACKGROUND, PANEL_BORDER, SIDE_BAR_BACKGROUND } from "../../../common/theme.js";
import { debugIconStartForeground } from "../../debug/browser/debugColors.js";
import { CellEditState, CellFocusMode, CellRevealRangeType, CellRevealType, RenderOutputType, ScrollToRevealBehavior } from "./notebookBrowser.js";
import { NotebookEditorExtensionsRegistry } from "./notebookEditorExtensions.js";
import { INotebookEditorService } from "./services/notebookEditorService.js";
import { notebookDebug } from "./notebookLogger.js";
import { NotebookLayoutChangedEvent } from "./notebookViewEvents.js";
import { CellContextKeyManager } from "./view/cellParts/cellContextKeys.js";
import { CellDragAndDropController } from "./view/cellParts/cellDnd.js";
import { ListViewInfoAccessor, NotebookCellList, NOTEBOOK_WEBVIEW_BOUNDARY } from "./view/notebookCellList.js";
import { BackLayerWebView } from "./view/renderers/backLayerWebView.js";
import { CodeCellRenderer, MarkupCellRenderer, NotebookCellListDelegate } from "./view/renderers/cellRenderer.js";
import { CodeCellViewModel, outputDisplayLimit } from "./viewModel/codeCellViewModel.js";
import { NotebookEventDispatcher } from "./viewModel/eventDispatcher.js";
import { MarkupCellViewModel } from "./viewModel/markupCellViewModel.js";
import { NotebookViewModel } from "./viewModel/notebookViewModelImpl.js";
import { ViewContext } from "./viewModel/viewContext.js";
import { NotebookEditorWorkbenchToolbar } from "./viewParts/notebookEditorToolbar.js";
import { NotebookEditorContextKeys } from "./viewParts/notebookEditorWidgetContextKeys.js";
import { NotebookOverviewRuler } from "./viewParts/notebookOverviewRuler.js";
import { ListTopCellToolbar } from "./viewParts/notebookTopCellToolbar.js";
import { CellEditType, CellKind, NotebookFindScopeType, RENDERER_NOT_AVAILABLE, SelectionStateType } from "../common/notebookCommon.js";
import { NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED } from "../common/notebookContextKeys.js";
import { INotebookExecutionService } from "../common/notebookExecutionService.js";
import { INotebookKernelService } from "../common/notebookKernelService.js";
import { NotebookOptions, OutputInnerContainerTopPadding } from "./notebookOptions.js";
import { cellRangesToIndexes } from "../common/notebookRange.js";
import { INotebookRendererMessagingService } from "../common/notebookRendererMessagingService.js";
import { INotebookService } from "../common/notebookService.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { BaseCellEditorOptions } from "./viewModel/cellEditorOptions.js";
import { FloatingEditorClickMenu } from "../../../browser/codeeditor.js";
import { CellFindMatchModel } from "./contrib/find/findModel.js";
import { INotebookLoggingService } from "../common/notebookLoggingService.js";
import { Schemas } from "../../../../base/common/network.js";
import { DropIntoEditorController } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { CopyPasteController } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { NotebookStickyScroll } from "./viewParts/notebookEditorStickyScroll.js";
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { PreventDefaultContextMenuItemsContextKeyName } from "../../webview/browser/webview.contribution.js";
import { NotebookAccessibilityProvider } from "./notebookAccessibilityProvider.js";
import { NotebookHorizontalTracker } from "./viewParts/notebookHorizontalTracker.js";
import { NotebookCellEditorPool } from "./view/notebookCellEditorPool.js";
import { InlineCompletionsController } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { NotebookCellLayoutManager } from "./notebookCellLayoutManager.js";
import { FloatingEditorToolbar } from "../../../../editor/contrib/floatingMenu/browser/floatingMenu.js";
const $ = DOM.$;
function getDefaultNotebookCreationOptions() {
  const skipContributions = [
    "editor.contrib.review",
    FloatingEditorClickMenu.ID,
    FloatingEditorToolbar.ID,
    "editor.contrib.dirtydiff",
    "editor.contrib.testingOutputPeek",
    "editor.contrib.testingDecorations",
    "store.contrib.stickyScrollController",
    "editor.contrib.findController",
    "editor.contrib.emptyTextEditorHint"
  ];
  const contributions = EditorExtensionsRegistry.getEditorContributions().filter((c) => skipContributions.indexOf(c.id) === -1);
  return {
    menuIds: {
      notebookToolbar: MenuId.NotebookToolbar,
      cellTitleToolbar: MenuId.NotebookCellTitle,
      cellDeleteToolbar: MenuId.NotebookCellDelete,
      cellInsertToolbar: MenuId.NotebookCellBetween,
      cellTopInsertToolbar: MenuId.NotebookCellListTop,
      cellExecuteToolbar: MenuId.NotebookCellExecute,
      cellExecutePrimary: MenuId.NotebookCellExecutePrimary
    },
    cellEditorContributions: contributions
  };
}
let NotebookEditorWidget = class extends Disposable {
  constructor(creationOptions, dimension, instantiationService, editorGroupsService, notebookRendererMessaging, notebookEditorService, notebookKernelService, _notebookService, configurationService, contextKeyService, layoutService, contextMenuService, telemetryService, notebookExecutionService, editorProgressService, logService) {
    super();
    this.creationOptions = creationOptions;
    this.editorGroupsService = editorGroupsService;
    this.notebookRendererMessaging = notebookRendererMessaging;
    this.notebookEditorService = notebookEditorService;
    this.notebookKernelService = notebookKernelService;
    this._notebookService = _notebookService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.contextMenuService = contextMenuService;
    this.telemetryService = telemetryService;
    this.notebookExecutionService = notebookExecutionService;
    this.editorProgressService = editorProgressService;
    this.logService = logService;
    //#region Eventing
    this._onDidChangeCellState = this._register(new Emitter());
    this.onDidChangeCellState = this._onDidChangeCellState.event;
    this._onDidChangeViewCells = this._register(new Emitter());
    this.onDidChangeViewCells = this._onDidChangeViewCells.event;
    this._onWillChangeModel = this._register(new Emitter());
    this.onWillChangeModel = this._onWillChangeModel.event;
    this._onDidChangeModel = this._register(new Emitter());
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._onDidAttachViewModel = this._register(new Emitter());
    this.onDidAttachViewModel = this._onDidAttachViewModel.event;
    this._onDidChangeOptions = this._register(new Emitter());
    this.onDidChangeOptions = this._onDidChangeOptions.event;
    this._onDidChangeDecorations = this._register(new Emitter());
    this.onDidChangeDecorations = this._onDidChangeDecorations.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidChangeLayout = this._register(new Emitter());
    this.onDidChangeLayout = this._onDidChangeLayout.event;
    this._onDidChangeActiveCell = this._register(new Emitter());
    this.onDidChangeActiveCell = this._onDidChangeActiveCell.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeVisibleRanges = this._register(new Emitter());
    this.onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;
    this._onDidFocusEmitter = this._register(new Emitter());
    this.onDidFocusWidget = this._onDidFocusEmitter.event;
    this._onDidBlurEmitter = this._register(new Emitter());
    this.onDidBlurWidget = this._onDidBlurEmitter.event;
    this._onDidChangeActiveEditor = this._register(new Emitter());
    this.onDidChangeActiveEditor = this._onDidChangeActiveEditor.event;
    this._onDidChangeActiveKernel = this._register(new Emitter());
    this.onDidChangeActiveKernel = this._onDidChangeActiveKernel.event;
    this._onMouseUp = this._register(new Emitter());
    this.onMouseUp = this._onMouseUp.event;
    this._onMouseDown = this._register(new Emitter());
    this.onMouseDown = this._onMouseDown.event;
    this._onDidReceiveMessage = this._register(new Emitter());
    this.onDidReceiveMessage = this._onDidReceiveMessage.event;
    this._onDidRenderOutput = this._register(new Emitter());
    this.onDidRenderOutput = this._onDidRenderOutput.event;
    this._onDidRemoveOutput = this._register(new Emitter());
    this.onDidRemoveOutput = this._onDidRemoveOutput.event;
    this._onDidResizeOutputEmitter = this._register(new Emitter());
    this.onDidResizeOutput = this._onDidResizeOutputEmitter.event;
    this._webview = null;
    this._webviewResolvePromise = null;
    this._webviewTransparentCover = null;
    this._listDelegate = null;
    this._dndController = null;
    this._listTopCellToolbar = null;
    this._renderedEditors = /* @__PURE__ */ new Map();
    this._localStore = this._register(new DisposableStore());
    this._localCellStateListeners = [];
    this._contributions = /* @__PURE__ */ new Map();
    this._insetModifyQueueByOutputId = new SequencerByKey();
    this._cellContextKeyManager = null;
    this._uuid = generateUuid();
    this._webviewFocused = false;
    this._isVisible = false;
    this._isDisposed = false;
    this._baseCellEditorOptions = /* @__PURE__ */ new Map();
    this._debugFlag = false;
    this._backgroundMarkdownRenderRunning = false;
    this._lastCellWithEditorFocus = null;
    this._pendingOutputHeightAcks = /* @__PURE__ */ new Map();
    this._dimension = dimension;
    this.isReplHistory = creationOptions.isReplHistory ?? false;
    this._readOnly = creationOptions.isReadOnly ?? false;
    this._overlayLayout = this._register(new OverlayLayoutElement());
    this._overlayContainer = this._overlayLayout.content;
    this.scopedContextKeyService = this._register(contextKeyService.createScoped(this._overlayContainer));
    this.instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this._notebookOptions = creationOptions.options ?? this.instantiationService.createInstance(NotebookOptions, this.creationOptions?.codeWindow ?? mainWindow, this._readOnly, void 0);
    this._register(this._notebookOptions);
    const eventDispatcher = this._register(new NotebookEventDispatcher());
    this._viewContext = new ViewContext(
      this._notebookOptions,
      eventDispatcher,
      (language) => this.getBaseCellEditorOptions(language)
    );
    this._register(this._viewContext.eventDispatcher.onDidChangeLayout(() => {
      this._onDidChangeLayout.fire();
    }));
    this._register(this._viewContext.eventDispatcher.onDidChangeCellState((e) => {
      this._onDidChangeCellState.fire(e);
    }));
    this._register(_notebookService.onDidChangeOutputRenderers(() => {
      this._updateOutputRenderers();
    }));
    this._register(this.instantiationService.createInstance(NotebookEditorContextKeys, this));
    this._register(notebookKernelService.onDidChangeSelectedNotebooks((e) => {
      if (isEqual(e.notebook, this.viewModel?.uri)) {
        this._loadKernelPreloads();
        this._onDidChangeActiveKernel.fire();
      }
    }));
    this._scrollBeyondLastLine = this.configurationService.getValue("editor.scrollBeyondLastLine");
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.scrollBeyondLastLine")) {
        this._scrollBeyondLastLine = this.configurationService.getValue("editor.scrollBeyondLastLine");
        if (this._dimension && this._isVisible) {
          this.layout(this._dimension);
        }
      }
    }));
    this._register(this._notebookOptions.onDidChangeOptions((e) => {
      if (e.cellStatusBarVisibility || e.cellToolbarLocation || e.cellToolbarInteraction) {
        this._updateForNotebookConfiguration();
      }
      if (e.fontFamily) {
        this._generateFontInfo();
      }
      if (e.compactView || e.focusIndicator || e.insertToolbarPosition || e.cellToolbarLocation || e.dragAndDropEnabled || e.fontSize || e.markupFontSize || e.markdownLineHeight || e.fontFamily || e.insertToolbarAlignment || e.outputFontSize || e.outputLineHeight || e.outputFontFamily || e.outputWordWrap || e.outputScrolling || e.outputLinkifyFilePaths || e.minimalError) {
        this._styleElement?.remove();
        this._createLayoutStyles();
        this._webview?.updateOptions({
          ...this.notebookOptions.computeWebviewOptions(),
          fontFamily: this._generateFontFamily()
        });
      }
      if (this._dimension && this._isVisible) {
        this.layout(this._dimension);
      }
    }));
    const container = creationOptions.codeWindow ? this.layoutService.getContainer(creationOptions.codeWindow) : this.layoutService.mainContainer;
    this.notebookEditorService.addNotebookEditor(this);
    const id = generateUuid();
    this._overlayContainer.id = `notebook-${id}`;
    this._overlayContainer.className = "notebookOverlay";
    this._overlayContainer.classList.add("notebook-editor");
    this._overlayContainer.inert = true;
    this._overlayContainer.style.visibility = "hidden";
    container.appendChild(this._overlayLayout.root);
    this._createBody(this._overlayContainer);
    this._generateFontInfo();
    this._isVisible = true;
    this._editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.scopedContextKeyService);
    this._outputFocus = NOTEBOOK_OUTPUT_FOCUSED.bindTo(this.scopedContextKeyService);
    this._outputInputFocus = NOTEBOOK_OUTPUT_INPUT_FOCUSED.bindTo(this.scopedContextKeyService);
    this._editorEditable = NOTEBOOK_EDITOR_EDITABLE.bindTo(this.scopedContextKeyService);
    this._cursorNavMode = NOTEBOOK_CURSOR_NAVIGATION_MODE.bindTo(this.scopedContextKeyService);
    new RawContextKey(PreventDefaultContextMenuItemsContextKeyName, false).bindTo(this.scopedContextKeyService).set(true);
    this._editorEditable.set(!creationOptions.isReadOnly);
    let contributions;
    if (Array.isArray(this.creationOptions.contributions)) {
      contributions = this.creationOptions.contributions;
    } else {
      contributions = NotebookEditorExtensionsRegistry.getEditorContributions();
    }
    for (const desc of contributions) {
      let contribution;
      try {
        contribution = this.instantiationService.createInstance(desc.ctor, this);
      } catch (err) {
        onUnexpectedError(err);
      }
      if (contribution) {
        if (!this._contributions.has(desc.id)) {
          this._contributions.set(desc.id, contribution);
        } else {
          contribution.dispose();
          throw new Error(`DUPLICATE notebook editor contribution: '${desc.id}'`);
        }
      }
    }
    this._updateForNotebookConfiguration();
  }
  get isVisible() {
    return this._isVisible;
  }
  get isDisposed() {
    return this._isDisposed;
  }
  set viewModel(newModel) {
    this._onWillChangeModel.fire(this._notebookViewModel?.notebookDocument);
    this._notebookViewModel = newModel;
    this._onDidChangeModel.fire(newModel?.notebookDocument);
  }
  get viewModel() {
    return this._notebookViewModel;
  }
  get textModel() {
    return this._notebookViewModel?.notebookDocument;
  }
  get isReadOnly() {
    return this._notebookViewModel?.options.isReadOnly ?? false;
  }
  get activeCodeEditor() {
    if (this._isDisposed) {
      return;
    }
    const [focused] = this._list.getFocusedElements();
    return this._renderedEditors.get(focused);
  }
  get activeCellAndCodeEditor() {
    if (this._isDisposed) {
      return;
    }
    const [focused] = this._list.getFocusedElements();
    const editor = this._renderedEditors.get(focused);
    if (!editor) {
      return;
    }
    return [focused, editor];
  }
  get codeEditors() {
    return [...this._renderedEditors];
  }
  get visibleRanges() {
    return this._list ? this._list.visibleRanges || [] : [];
  }
  get notebookOptions() {
    return this._notebookOptions;
  }
  _debug(...args) {
    if (!this._debugFlag) {
      return;
    }
    notebookDebug(...args);
  }
  /**
   * EditorId
   */
  getId() {
    return this._uuid;
  }
  getViewModel() {
    return this.viewModel;
  }
  getLength() {
    return this.viewModel?.length ?? 0;
  }
  getSelections() {
    return this.viewModel?.getSelections() ?? [{ start: 0, end: 0 }];
  }
  setSelections(selections) {
    if (!this.viewModel) {
      return;
    }
    const focus = this.viewModel.getFocus();
    this.viewModel.updateSelectionsState({
      kind: SelectionStateType.Index,
      focus,
      selections
    });
  }
  getFocus() {
    return this.viewModel?.getFocus() ?? { start: 0, end: 0 };
  }
  setFocus(focus) {
    if (!this.viewModel) {
      return;
    }
    const selections = this.viewModel.getSelections();
    this.viewModel.updateSelectionsState({
      kind: SelectionStateType.Index,
      focus,
      selections
    });
  }
  getSelectionViewModels() {
    if (!this.viewModel) {
      return [];
    }
    const cellsSet = /* @__PURE__ */ new Set();
    return this.viewModel.getSelections().map((range) => this.viewModel.viewCells.slice(range.start, range.end)).reduce((a, b) => {
      b.forEach((cell) => {
        if (!cellsSet.has(cell.handle)) {
          cellsSet.add(cell.handle);
          a.push(cell);
        }
      });
      return a;
    }, []);
  }
  hasModel() {
    return !!this._notebookViewModel;
  }
  showProgress() {
    this._currentProgress = this.editorProgressService.show(true);
  }
  hideProgress() {
    if (this._currentProgress) {
      this._currentProgress.done();
      this._currentProgress = void 0;
    }
  }
  //#region Editor Core
  getBaseCellEditorOptions(language) {
    const existingOptions = this._baseCellEditorOptions.get(language);
    if (existingOptions) {
      return existingOptions;
    } else {
      const options = new BaseCellEditorOptions(this, this.notebookOptions, this.configurationService, language);
      this._baseCellEditorOptions.set(language, options);
      return options;
    }
  }
  _updateForNotebookConfiguration() {
    if (!this._overlayContainer) {
      return;
    }
    this._overlayContainer.classList.remove("cell-title-toolbar-left");
    this._overlayContainer.classList.remove("cell-title-toolbar-right");
    this._overlayContainer.classList.remove("cell-title-toolbar-hidden");
    const cellToolbarLocation = this._notebookOptions.computeCellToolbarLocation(this.viewModel?.viewType);
    this._overlayContainer.classList.add(`cell-title-toolbar-${cellToolbarLocation}`);
    const cellToolbarInteraction = this._notebookOptions.getDisplayOptions().cellToolbarInteraction;
    let cellToolbarInteractionState = "hover";
    this._overlayContainer.classList.remove("cell-toolbar-hover");
    this._overlayContainer.classList.remove("cell-toolbar-click");
    if (cellToolbarInteraction === "hover" || cellToolbarInteraction === "click") {
      cellToolbarInteractionState = cellToolbarInteraction;
    }
    this._overlayContainer.classList.add(`cell-toolbar-${cellToolbarInteractionState}`);
  }
  _generateFontInfo() {
    const editorOptions = this.configurationService.getValue("editor");
    const targetWindow = DOM.getWindow(this.getDomNode());
    this._fontInfo = FontMeasurements.readFontInfo(targetWindow, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value));
  }
  _createBody(parent) {
    this._notebookTopToolbarContainer = document.createElement("div");
    this._notebookTopToolbarContainer.classList.add("notebook-toolbar-container");
    this._notebookTopToolbarContainer.style.display = "none";
    DOM.append(parent, this._notebookTopToolbarContainer);
    this._notebookStickyScrollContainer = document.createElement("div");
    this._notebookStickyScrollContainer.classList.add("notebook-sticky-scroll-container");
    DOM.append(parent, this._notebookStickyScrollContainer);
    this._body = document.createElement("div");
    DOM.append(parent, this._body);
    this._body.classList.add("cell-list-container");
    this._createLayoutStyles();
    this._createCellList();
    this._notebookOverviewRulerContainer = document.createElement("div");
    this._notebookOverviewRulerContainer.classList.add("notebook-overview-ruler-container");
    this._list.scrollableElement.appendChild(this._notebookOverviewRulerContainer);
    this._registerNotebookOverviewRuler();
    this._register(this.instantiationService.createInstance(NotebookHorizontalTracker, this, this._list.scrollableElement));
    this._overflowContainer = document.createElement("div");
    this._overflowContainer.classList.add("notebook-overflow-widget-container", "monaco-editor");
    DOM.append(parent, this._overflowContainer);
  }
  _generateFontFamily() {
    return this._fontInfo?.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
  }
  _createLayoutStyles() {
    this._styleElement = domStylesheets.createStyleSheet(this._body);
    const {
      cellRightMargin,
      cellTopMargin,
      cellRunGutter,
      cellBottomMargin,
      codeCellLeftMargin,
      markdownCellGutter,
      markdownCellLeftMargin,
      markdownCellBottomMargin,
      markdownCellTopMargin,
      collapsedIndicatorHeight,
      focusIndicator,
      insertToolbarPosition,
      outputFontSize,
      focusIndicatorLeftMargin,
      focusIndicatorGap
    } = this._notebookOptions.getLayoutConfiguration();
    const {
      insertToolbarAlignment,
      compactView,
      fontSize
    } = this._notebookOptions.getDisplayOptions();
    const getCellEditorContainerLeftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
    const { bottomToolbarGap, bottomToolbarHeight } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
    const styleSheets = [];
    if (!this._fontInfo) {
      this._generateFontInfo();
    }
    const fontFamily = this._generateFontFamily();
    styleSheets.push(`
		.notebook-editor {
			--notebook-cell-output-font-size: ${outputFontSize}px;
			--notebook-cell-input-preview-font-size: ${fontSize}px;
			--notebook-cell-input-preview-font-family: ${fontFamily};
		}
		`);
    if (compactView) {
      styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
    } else {
      styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${codeCellLeftMargin}px; }`);
    }
    if (focusIndicator === "border") {
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom:before,
			.monaco-workbench .notebookOverlay .monaco-list .markdown-cell-row .cell-inner-container:before,
			.monaco-workbench .notebookOverlay .monaco-list .markdown-cell-row .cell-inner-container:after {
				content: "";
				position: absolute;
				width: 100%;
				height: 1px;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-right:before {
				content: "";
				position: absolute;
				width: 1px;
				height: 100%;
				z-index: 10;
			}

			/* top border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top:before {
				border-top: 1px solid transparent;
			}

			/* left border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left:before {
				border-left: 1px solid transparent;
			}

			/* bottom border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom:before {
				border-bottom: 1px solid transparent;
			}

			/* right border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-right:before {
				border-right: 1px solid transparent;
			}
			`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-right:before,
			.monaco-workbench .notebookOverlay .monaco-list.selection-multiple .monaco-list-row.code-cell-row.selected .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list.selection-multiple .monaco-list-row.code-cell-row.selected .cell-focus-indicator-right:before {
				top: -${cellTopMargin}px; height: calc(100% + ${cellTopMargin + cellBottomMargin}px)
			}`);
    } else {
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-left: 3px solid transparent;
				border-radius: 4px;
				width: 0px;
				margin-left: ${focusIndicatorLeftMargin}px;
				border-color: var(--vscode-notebook-inactiveFocusedCellBorder) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-output-hover .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .markdown-cell-hover .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row:hover .cell-focus-indicator-left .codeOutput-focus-indicator-container {
				display: block;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator-container:hover .codeOutput-focus-indicator {
				border-left: 5px solid transparent;
				margin-left: ${focusIndicatorLeftMargin - 1}px;
			}
			`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-inner-container.cell-output-focus .cell-focus-indicator-left .codeOutput-focus-indicator,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-inner-container .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-color: var(--vscode-notebook-focusedCellBorder) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-inner-container .cell-focus-indicator-left .output-focus-indicator {
				margin-top: ${focusIndicatorGap}px;
			}
			`);
    }
    if (insertToolbarPosition === "betweenCells" || insertToolbarPosition === "both") {
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: flex; }`);
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container { display: flex; }`);
    } else {
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: none; }`);
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container { display: none; }`);
    }
    if (insertToolbarAlignment === "left") {
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .action-item:first-child,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .action-item:first-child, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .action-item:first-child {
				margin-right: 0px !important;
			}`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .monaco-toolbar .action-label,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .monaco-toolbar .action-label, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar .action-label {
				padding: 0px !important;
				justify-content: center;
				border-radius: 4px;
			}`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container {
				align-items: flex-start;
				justify-content: left;
				margin: 0 16px 0 ${8 + codeCellLeftMargin}px;
			}`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container,
			.notebookOverlay .cell-bottom-toolbar-container .action-item {
				border: 0px;
			}`);
    }
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .code-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .code-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .code-cell-row div.cell { margin-right: ${cellRightMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell { margin-right: ${cellRightMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row > .cell-inner-container { padding-top: ${cellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container.webview-backed-markdown-cell { padding: 0; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .webview-backed-markdown-cell.markdown-cell-edit-mode .cell.code { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .output { margin: 0px ${cellRightMargin}px 0px ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .output { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { left: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton { left: -${cellRunGutter}px; }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton {
			position: absolute;
			width: ${cellRunGutter}px;
			padding: 6px 0px;
		}`);
    styleSheets.push(`.notebookOverlay .output-show-more-container { margin: 0px ${cellRightMargin}px 0px ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .output-show-more-container { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell.markdown { padding-left: ${cellRunGutter}px; }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container .notebook-folding-indicator { left: ${(markdownCellGutter - 20) / 2 + markdownCellLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay > .cell-list-container .notebook-folded-hint { left: ${markdownCellGutter + markdownCellLeftMargin + 8}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row :not(.webview-backed-markdown-cell) .cell-focus-indicator-top { height: ${cellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-side { bottom: ${bottomToolbarGap}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.code-cell-row .cell-focus-indicator-left { width: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row .cell-focus-indicator-left { width: ${codeCellLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator.cell-focus-indicator-right { width: ${cellRightMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom { height: ${cellBottomMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-shadow-container-bottom { top: ${cellBottomMargin}px; }`);
    styleSheets.push(`
			.notebookOverlay .monaco-list.selection-multiple .monaco-list-row:has(+ .monaco-list-row.selected) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin}px;
			}
		`);
    styleSheets.push(`
			.notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-multiCellHighlight:has(+ .monaco-list-row.nb-multiCellHighlight) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin}px;
				background-color: var(--vscode-notebook-symbolHighlightBackground) !important;
			}

			.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-multiCellHighlight:has(+ .monaco-list-row.nb-multiCellHighlight) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin - 6}px;
				background-color: var(--vscode-notebook-symbolHighlightBackground) !important;
			}
		`);
    styleSheets.push(`
			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview {
				line-height: ${collapsedIndicatorHeight}px;
			}

			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview .monaco-tokenized-source {
				max-height: ${collapsedIndicatorHeight}px;
			}
		`);
    styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay.cell-title-toolbar-right > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			right: ${cellRightMargin + 26}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-left > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			left: ${getCellEditorContainerLeftMargin + 16}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-hidden > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			display: none;
		}`);
    styleSheets.push(`
		.monaco-workbench .notebookOverlay .output > div.foreground.output-inner-container {
			padding: ${OutputInnerContainerTopPadding}px 8px;
		}
		.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .output-collapse-container {
			padding: ${OutputInnerContainerTopPadding}px 8px;
		}
		`);
    styleSheets.push(`
		.monaco-workbench .notebookOverlay .cell-chat-part {
			margin: 0 ${cellRightMargin}px 6px 4px;
		}
		`);
    this._styleElement.textContent = styleSheets.join("\n");
  }
  _createCellList() {
    this._body.classList.add("cell-list-container");
    this._dndController = this._register(new CellDragAndDropController(this, this._body));
    const getScopedContextKeyService = (container) => this._list.contextKeyService.createScoped(container);
    this._editorPool = this._register(this.instantiationService.createInstance(NotebookCellEditorPool, this, getScopedContextKeyService));
    const renderers = [
      this.instantiationService.createInstance(CodeCellRenderer, this, this._renderedEditors, this._editorPool, this._dndController, getScopedContextKeyService),
      this.instantiationService.createInstance(MarkupCellRenderer, this, this._dndController, this._renderedEditors, getScopedContextKeyService)
    ];
    renderers.forEach((renderer) => {
      this._register(renderer);
    });
    this._listDelegate = this.instantiationService.createInstance(NotebookCellListDelegate, DOM.getWindow(this.getDomNode()));
    this._register(this._listDelegate);
    const accessibilityProvider = this.instantiationService.createInstance(NotebookAccessibilityProvider, () => this.viewModel, this.isReplHistory);
    this._register(accessibilityProvider);
    this._list = this.instantiationService.createInstance(
      NotebookCellList,
      "NotebookCellList",
      this._body,
      this._viewContext.notebookOptions,
      this._listDelegate,
      renderers,
      this.scopedContextKeyService,
      {
        setRowLineHeight: false,
        setRowHeight: false,
        supportDynamicHeights: true,
        horizontalScrolling: false,
        keyboardSupport: false,
        mouseSupport: true,
        multipleSelectionSupport: true,
        selectionNavigation: true,
        typeNavigationEnabled: true,
        paddingTop: 0,
        paddingBottom: 0,
        transformOptimization: false,
        //(isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
        initialSize: this._dimension,
        styleController: (_suffix) => {
          return this._list;
        },
        overrideStyles: {
          listBackground: notebookEditorBackground,
          listActiveSelectionBackground: notebookEditorBackground,
          listActiveSelectionForeground: foreground,
          listFocusAndSelectionBackground: notebookEditorBackground,
          listFocusAndSelectionForeground: foreground,
          listFocusBackground: notebookEditorBackground,
          listFocusForeground: foreground,
          listHoverForeground: foreground,
          listHoverBackground: notebookEditorBackground,
          listHoverOutline: focusBorder,
          listFocusOutline: focusBorder,
          listInactiveSelectionBackground: notebookEditorBackground,
          listInactiveSelectionForeground: foreground,
          listInactiveFocusBackground: notebookEditorBackground,
          listInactiveFocusOutline: notebookEditorBackground
        },
        accessibilityProvider
      }
    );
    this._cellLayoutManager = new NotebookCellLayoutManager(this, this._list, this.logService);
    this._dndController.setList(this._list);
    this._register(this._list);
    this._listViewInfoAccessor = new ListViewInfoAccessor(this._list);
    this._register(this._listViewInfoAccessor);
    this._register(combinedDisposable(...renderers));
    this._listTopCellToolbar = this._register(this.instantiationService.createInstance(ListTopCellToolbar, this, this.notebookOptions));
    this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $(".webview-cover"));
    this._webviewTransparentCover.style.display = "none";
    this._register(DOM.addStandardDisposableGenericMouseDownListener(this._overlayContainer, (e) => {
      if (e.target.classList.contains("slider") && this._webviewTransparentCover) {
        this._webviewTransparentCover.style.display = "block";
      }
    }));
    this._register(DOM.addStandardDisposableGenericMouseUpListener(this._overlayContainer, () => {
      if (this._webviewTransparentCover) {
        this._webviewTransparentCover.style.display = "none";
      }
    }));
    this._register(this._list.onMouseDown((e) => {
      if (e.element) {
        this._onMouseDown.fire({ event: e.browserEvent, target: e.element });
      }
    }));
    this._register(this._list.onMouseUp((e) => {
      if (e.element) {
        this._onMouseUp.fire({ event: e.browserEvent, target: e.element });
      }
    }));
    this._register(this._list.onDidChangeFocus((_e) => {
      this._onDidChangeActiveEditor.fire(this);
      this._onDidChangeActiveCell.fire();
      this._onDidChangeFocus.fire();
      this._cursorNavMode.set(false);
    }));
    this._register(this._list.onContextMenu((e) => {
      this.showListContextMenu(e);
    }));
    this._register(this._list.onDidChangeVisibleRanges(() => {
      this._onDidChangeVisibleRanges.fire();
    }));
    this._register(this._list.onDidScroll((e) => {
      if (e.scrollTop !== e.oldScrollTop) {
        this._onDidScroll.fire();
        this.clearActiveCellWidgets();
      }
      if (e.scrollTop === e.oldScrollTop && e.scrollHeightChanged) {
        this._onDidChangeLayout.fire();
      }
    }));
    this._focusTracker = this._register(DOM.trackFocus(this.getDomNode()));
    this._register(this._focusTracker.onDidBlur(() => {
      this._editorFocus.set(false);
      this.viewModel?.setEditorFocus(false);
      this._onDidBlurEmitter.fire();
    }));
    this._register(this._focusTracker.onDidFocus(() => {
      this._editorFocus.set(true);
      this.viewModel?.setEditorFocus(true);
      this._onDidFocusEmitter.fire();
    }));
    this._registerNotebookActionsToolbar();
    this._registerNotebookStickyScroll();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(accessibilityProvider.verbositySettingId)) {
        this._list.ariaLabel = accessibilityProvider?.getWidgetAriaLabel();
      }
    }));
  }
  showListContextMenu(e) {
    this.contextMenuService.showContextMenu({
      menuId: MenuId.NotebookCellTitle,
      menuActionOptions: {
        shouldForwardArgs: true
      },
      contextKeyService: this.scopedContextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => {
        return {
          from: "cellContainer"
        };
      }
    });
  }
  _registerNotebookOverviewRuler() {
    this._notebookOverviewRuler = this._register(this.instantiationService.createInstance(NotebookOverviewRuler, this, this._notebookOverviewRulerContainer));
  }
  _registerNotebookActionsToolbar() {
    this._notebookTopToolbar = this._register(this.instantiationService.createInstance(NotebookEditorWorkbenchToolbar, this, this.scopedContextKeyService, this._notebookOptions, this._notebookTopToolbarContainer));
    this._register(this._notebookTopToolbar.onDidChangeVisibility(() => {
      if (this._dimension && this._isVisible) {
        this.layout(this._dimension);
      }
    }));
  }
  _registerNotebookStickyScroll() {
    this._notebookStickyScroll = this._register(this.instantiationService.createInstance(NotebookStickyScroll, this._notebookStickyScrollContainer, this, this._list, (sizeDelta) => {
      if (this.isDisposed) {
        return;
      }
      if (this._dimension && this._isVisible) {
        if (sizeDelta > 0) {
          this.layout(this._dimension);
          this.setScrollTop(this.scrollTop + sizeDelta);
        } else if (sizeDelta < 0) {
          this.setScrollTop(this.scrollTop + sizeDelta);
          this.layout(this._dimension);
        }
      }
      this._onDidScroll.fire();
    }));
  }
  _updateOutputRenderers() {
    if (!this.viewModel || !this._webview) {
      return;
    }
    this._webview.updateOutputRenderers();
    this.viewModel.viewCells.forEach((cell) => {
      cell.outputsViewModels.forEach((output) => {
        if (output.pickedMimeType?.rendererId === RENDERER_NOT_AVAILABLE) {
          output.resetRenderer();
        }
      });
    });
  }
  getDomNode() {
    return this._overlayContainer;
  }
  getOverflowContainerDomNode() {
    return this._overflowContainer;
  }
  getInnerWebview() {
    return this._webview?.webview;
  }
  setEditorProgressService(editorProgressService) {
    this.editorProgressService = editorProgressService;
  }
  setParentContextKeyService(parentContextKeyService) {
    this.scopedContextKeyService.updateParent(parentContextKeyService);
  }
  async setModel(textModel, viewState, perf, viewType) {
    if (this.viewModel === void 0 || !this.viewModel.equal(textModel)) {
      const oldBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
      this._detachModel();
      await this._attachModel(textModel, viewType ?? textModel.viewType, viewState, perf);
      const newBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
      if (oldBottomToolbarDimensions.bottomToolbarGap !== newBottomToolbarDimensions.bottomToolbarGap || oldBottomToolbarDimensions.bottomToolbarHeight !== newBottomToolbarDimensions.bottomToolbarHeight) {
        this._styleElement?.remove();
        this._createLayoutStyles();
        this._webview?.updateOptions({
          ...this.notebookOptions.computeWebviewOptions(),
          fontFamily: this._generateFontFamily()
        });
      }
      this.telemetryService.publicLog2("notebook/editorOpened", {
        scheme: textModel.uri.scheme,
        ext: extname(textModel.uri),
        viewType: textModel.viewType,
        isRepl: this.isReplHistory
      });
    } else {
      this.restoreListViewState(viewState);
    }
    this._restoreSelectedKernel(viewState);
    this._loadKernelPreloads();
    this._dndController?.clearGlobalDragState();
    this._localStore.add(this._list.onDidChangeFocus(() => {
      this.updateContextKeysOnFocusChange();
    }));
    this.updateContextKeysOnFocusChange();
    this._backgroundMarkdownRendering();
  }
  _backgroundMarkdownRendering() {
    if (this._backgroundMarkdownRenderRunning) {
      return;
    }
    this._backgroundMarkdownRenderRunning = true;
    DOM.runWhenWindowIdle(DOM.getWindow(this.getDomNode()), (deadline) => {
      this._backgroundMarkdownRenderingWithDeadline(deadline);
    });
  }
  _backgroundMarkdownRenderingWithDeadline(deadline) {
    const endTime = Date.now() + deadline.timeRemaining();
    const execute = () => {
      try {
        this._backgroundMarkdownRenderRunning = true;
        if (this._isDisposed) {
          return;
        }
        if (!this.viewModel) {
          return;
        }
        const firstMarkupCell = this.viewModel.viewCells.find((cell) => cell.cellKind === CellKind.Markup && !this._webview?.markupPreviewMapping.has(cell.id) && !this.cellIsHidden(cell));
        if (!firstMarkupCell) {
          return;
        }
        this.createMarkupPreview(firstMarkupCell);
      } finally {
        this._backgroundMarkdownRenderRunning = false;
      }
      if (Date.now() < endTime) {
        setTimeout0(execute);
      } else {
        this._backgroundMarkdownRendering();
      }
    };
    execute();
  }
  updateContextKeysOnFocusChange() {
    if (!this.viewModel) {
      return;
    }
    const focused = this._list.getFocusedElements()[0];
    if (focused) {
      if (!this._cellContextKeyManager) {
        this._cellContextKeyManager = this._localStore.add(this.instantiationService.createInstance(CellContextKeyManager, this, focused));
      }
      this._cellContextKeyManager.updateForElement(focused);
    }
  }
  async setOptions(options) {
    if (options?.isReadOnly !== void 0) {
      this._readOnly = options?.isReadOnly;
    }
    if (!this.viewModel) {
      return;
    }
    this.viewModel.updateOptions({ isReadOnly: this._readOnly });
    this.notebookOptions.updateOptions(this._readOnly);
    const cellOptions = options?.cellOptions ?? this._parseIndexedCellOptions(options);
    if (cellOptions) {
      const cell = this.viewModel.viewCells.find((cell2) => cell2.uri.toString() === cellOptions.resource.toString());
      if (cell) {
        this.focusElement(cell);
        const selection = cellOptions.options?.selection;
        if (selection) {
          cell.updateEditState(CellEditState.Editing, "setOptions");
          cell.focusMode = CellFocusMode.Editor;
          await this.revealRangeInCenterIfOutsideViewportAsync(cell, new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber || selection.startLineNumber, selection.endColumn || selection.startColumn));
        } else {
          this._list.revealCell(cell, options?.cellRevealType ?? CellRevealType.CenterIfOutsideViewport);
        }
        const editor = this._renderedEditors.get(cell);
        if (editor) {
          if (cellOptions.options?.selection) {
            const { selection: selection2 } = cellOptions.options;
            const editorSelection = new Range(selection2.startLineNumber, selection2.startColumn, selection2.endLineNumber || selection2.startLineNumber, selection2.endColumn || selection2.startColumn);
            editor.setSelection(editorSelection);
            editor.revealPositionInCenterIfOutsideViewport({
              lineNumber: selection2.startLineNumber,
              column: selection2.startColumn
            });
            await this.revealRangeInCenterIfOutsideViewportAsync(cell, editorSelection);
          }
          if (!cellOptions.options?.preserveFocus) {
            editor.focus();
          }
        }
      }
    }
    if (options?.cellSelections) {
      const focusCellIndex = options.cellSelections[0].start;
      const focusedCell = this.viewModel.cellAt(focusCellIndex);
      if (focusedCell) {
        this.viewModel.updateSelectionsState({
          kind: SelectionStateType.Index,
          focus: { start: focusCellIndex, end: focusCellIndex + 1 },
          selections: options.cellSelections
        });
        this.revealInCenterIfOutsideViewport(focusedCell);
      }
    }
    this._updateForOptions();
    this._onDidChangeOptions.fire();
  }
  _parseIndexedCellOptions(options) {
    if (options?.indexedCellOptions) {
      const cell = this.cellAt(options.indexedCellOptions.index);
      if (cell) {
        return {
          resource: cell.uri,
          options: {
            selection: options.indexedCellOptions.selection,
            preserveFocus: false
          }
        };
      }
    }
    return void 0;
  }
  _detachModel() {
    this._localStore.clear();
    dispose(this._localCellStateListeners);
    this._list.detachViewModel();
    this.viewModel?.dispose();
    this.viewModel = void 0;
    this._webview?.dispose();
    this._webview?.element.remove();
    this._webview = null;
    this._list.clear();
  }
  _updateForOptions() {
    if (!this.viewModel) {
      return;
    }
    this._editorEditable.set(!this.viewModel.options.isReadOnly);
    this._overflowContainer.classList.toggle("notebook-editor-editable", !this.viewModel.options.isReadOnly);
    this.getDomNode().classList.toggle("notebook-editor-editable", !this.viewModel.options.isReadOnly);
  }
  async _resolveWebview() {
    if (!this.textModel) {
      return null;
    }
    if (this._webviewResolvePromise) {
      return this._webviewResolvePromise;
    }
    if (!this._webview) {
      this._ensureWebview(this.getId(), this.textModel.viewType, this.textModel.uri);
    }
    this._webviewResolvePromise = (async () => {
      if (!this._webview) {
        throw new Error("Notebook output webview object is not created successfully.");
      }
      await this._webview.createWebview(this.creationOptions.codeWindow ?? mainWindow);
      if (!this._webview.webview) {
        throw new Error("Notebook output webview element was not created successfully.");
      }
      this._localStore.add(this._webview.webview.onDidBlur(() => {
        this._outputFocus.set(false);
        this._webviewFocused = false;
        this.updateEditorFocus();
        this.updateCellFocusMode();
      }));
      this._localStore.add(this._webview.webview.onDidFocus(() => {
        this._outputFocus.set(true);
        this.updateEditorFocus();
        this._webviewFocused = true;
      }));
      this._localStore.add(this._webview.onMessage((e) => {
        this._onDidReceiveMessage.fire(e);
      }));
      return this._webview;
    })();
    return this._webviewResolvePromise;
  }
  _ensureWebview(id, viewType, resource) {
    if (this._webview) {
      return;
    }
    const that = this;
    this._webview = this.instantiationService.createInstance(BackLayerWebView, {
      get creationOptions() {
        return that.creationOptions;
      },
      setScrollTop(scrollTop) {
        that._list.scrollTop = scrollTop;
      },
      triggerScroll(event) {
        that._list.triggerScrollFromMouseWheelEvent(event);
      },
      getCellByInfo: that.getCellByInfo.bind(that),
      getCellById: that._getCellById.bind(that),
      toggleNotebookCellSelection: that._toggleNotebookCellSelection.bind(that),
      focusNotebookCell: that.focusNotebookCell.bind(that),
      focusNextNotebookCell: that.focusNextNotebookCell.bind(that),
      updateOutputHeight: that._updateOutputHeight.bind(that),
      scheduleOutputHeightAck: that._scheduleOutputHeightAck.bind(that),
      updateMarkupCellHeight: that._updateMarkupCellHeight.bind(that),
      setMarkupCellEditState: that._setMarkupCellEditState.bind(that),
      didStartDragMarkupCell: that._didStartDragMarkupCell.bind(that),
      didDragMarkupCell: that._didDragMarkupCell.bind(that),
      didDropMarkupCell: that._didDropMarkupCell.bind(that),
      didEndDragMarkupCell: that._didEndDragMarkupCell.bind(that),
      didResizeOutput: that._didResizeOutput.bind(that),
      updatePerformanceMetadata: that._updatePerformanceMetadata.bind(that),
      didFocusOutputInputChange: that._didFocusOutputInputChange.bind(that)
    }, id, viewType, resource, {
      ...this._notebookOptions.computeWebviewOptions(),
      fontFamily: this._generateFontFamily()
    }, this.notebookRendererMessaging.getScoped(this._uuid));
    this._webview.element.style.width = "100%";
    this._list.attachWebview(this._webview.element);
  }
  async _attachModel(textModel, viewType, viewState, perf) {
    this._ensureWebview(this.getId(), textModel.viewType, textModel.uri);
    this.viewModel = this.instantiationService.createInstance(NotebookViewModel, viewType, textModel, this._viewContext, this.getLayoutInfo(), { isReadOnly: this._readOnly });
    this._viewContext.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
    this.notebookOptions.updateOptions(this._readOnly);
    this._updateForOptions();
    this._updateForNotebookConfiguration();
    {
      this.viewModel.restoreEditorViewState(viewState);
      const contributionsState = viewState?.contributionsState || {};
      for (const [id, contribution] of this._contributions) {
        if (typeof contribution.restoreViewState === "function") {
          contribution.restoreViewState(contributionsState[id]);
        }
      }
    }
    this._localStore.add(this.viewModel.onDidChangeViewCells((e) => {
      this._onDidChangeViewCells.fire(e);
    }));
    this._localStore.add(this.viewModel.onDidChangeSelection(() => {
      this._onDidChangeSelection.fire();
      this.updateSelectedMarkdownPreviews();
    }));
    this._localStore.add(this._list.onWillScroll((e) => {
      if (this._webview?.isResolved()) {
        this._webviewTransparentCover.style.transform = `translateY(${e.scrollTop})`;
      }
    }));
    let hasPendingChangeContentHeight = false;
    const renderScrollHeightDisposable = this._localStore.add(new MutableDisposable());
    this._localStore.add(this._list.onDidChangeContentHeight(() => {
      if (hasPendingChangeContentHeight) {
        return;
      }
      hasPendingChangeContentHeight = true;
      renderScrollHeightDisposable.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
        hasPendingChangeContentHeight = false;
        this._updateScrollHeight();
      }, 100);
    }));
    this._localStore.add(this._list.onDidRemoveOutputs((outputs) => {
      outputs.forEach((output) => this.removeInset(output));
    }));
    this._localStore.add(this._list.onDidHideOutputs((outputs) => {
      outputs.forEach((output) => this.hideInset(output));
    }));
    this._localStore.add(this._list.onDidRemoveCellsFromView((cells) => {
      const hiddenCells = [];
      const deletedCells = [];
      for (const cell of cells) {
        if (cell.cellKind === CellKind.Markup) {
          const mdCell = cell;
          if (this.viewModel?.viewCells.find((cell2) => cell2.handle === mdCell.handle)) {
            hiddenCells.push(mdCell);
          } else {
            deletedCells.push(mdCell);
          }
        }
      }
      this.hideMarkupPreviews(hiddenCells);
      this.deleteMarkupPreviews(deletedCells);
    }));
    await this._warmupWithMarkdownRenderer(this.viewModel, viewState, perf);
    perf?.mark("customMarkdownLoaded");
    this._localCellStateListeners = this.viewModel.viewCells.map((cell) => this._bindCellListener(cell));
    this._lastCellWithEditorFocus = this.viewModel.viewCells.find((viewCell) => this.getActiveCell() === viewCell && viewCell.focusMode === CellFocusMode.Editor) ?? null;
    this._localStore.add(this.viewModel.onDidChangeViewCells((e) => {
      if (this._isDisposed) {
        return;
      }
      [...e.splices].reverse().forEach((splice) => {
        const [start, deleted, newCells] = splice;
        const deletedCells = this._localCellStateListeners.splice(start, deleted, ...newCells.map((cell) => this._bindCellListener(cell)));
        dispose(deletedCells);
      });
      if (e.splices.some((s) => s[2].some((cell) => cell.cellKind === CellKind.Markup))) {
        this._backgroundMarkdownRendering();
      }
    }));
    if (this._dimension) {
      this._list.layout(this.getBodyHeight(this._dimension.height), this._dimension.width);
    } else {
      this._list.layout();
    }
    this._dndController?.clearGlobalDragState();
    this.restoreListViewState(viewState);
  }
  _bindCellListener(cell) {
    const store = new DisposableStore();
    store.add(cell.onDidChangeLayout((e) => {
      if (e.totalHeight || e.outerWidth) {
        this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight, e.context);
      }
    }));
    if (cell.cellKind === CellKind.Code) {
      store.add(cell.onDidRemoveOutputs((outputs) => {
        outputs.forEach((output) => this.removeInset(output));
      }));
    }
    store.add(cell.onDidChangeState((e) => {
      if (e.inputCollapsedChanged && cell.isInputCollapsed && cell.cellKind === CellKind.Markup) {
        this.hideMarkupPreviews([cell]);
      }
      if (e.outputCollapsedChanged && cell.isOutputCollapsed && cell.cellKind === CellKind.Code) {
        cell.outputsViewModels.forEach((output) => this.hideInset(output));
      }
      if (e.focusModeChanged) {
        this._validateCellFocusMode(cell);
      }
    }));
    store.add(cell.onCellDecorationsChanged((e) => {
      e.added.forEach((options) => {
        if (options.className) {
          this.deltaCellContainerClassNames(cell.id, [options.className], [], cell.cellKind);
        }
        if (options.outputClassName) {
          this.deltaCellContainerClassNames(cell.id, [options.outputClassName], [], cell.cellKind);
        }
      });
      e.removed.forEach((options) => {
        if (options.className) {
          this.deltaCellContainerClassNames(cell.id, [], [options.className], cell.cellKind);
        }
        if (options.outputClassName) {
          this.deltaCellContainerClassNames(cell.id, [], [options.outputClassName], cell.cellKind);
        }
      });
    }));
    return store;
  }
  _validateCellFocusMode(cell) {
    if (cell.focusMode !== CellFocusMode.Editor) {
      return;
    }
    if (this._lastCellWithEditorFocus && this._lastCellWithEditorFocus !== cell) {
      this._lastCellWithEditorFocus.focusMode = CellFocusMode.Container;
    }
    this._lastCellWithEditorFocus = cell;
  }
  async _warmupWithMarkdownRenderer(viewModel, viewState, perf) {
    this.logService.debug("NotebookEditorWidget", "warmup " + this.viewModel?.uri.toString());
    await this._resolveWebview();
    perf?.mark("webviewCommLoaded");
    this.logService.debug("NotebookEditorWidget", "warmup - webview resolved");
    this._webview.element.style.visibility = "hidden";
    await this._warmupViewportMarkdownCells(viewModel, viewState);
    this.logService.debug("NotebookEditorWidget", "warmup - viewport warmed up");
    this._list.layout(0, 0);
    this._list.attachViewModel(viewModel);
    this._list.scrollTop = viewState?.scrollPosition?.top ?? 0;
    this._debug("finish initial viewport warmup and view state restore.");
    this._webview.element.style.visibility = "visible";
    this.logService.debug("NotebookEditorWidget", "warmup - list view model attached, set to visible");
    this._onDidAttachViewModel.fire();
  }
  async _warmupViewportMarkdownCells(viewModel, viewState) {
    if (viewState && viewState.cellTotalHeights) {
      const totalHeightCache = viewState.cellTotalHeights;
      const scrollTop = viewState.scrollPosition?.top ?? 0;
      const scrollBottom = scrollTop + Math.max(this._dimension?.height ?? 0, 1080);
      let offset = 0;
      const requests = [];
      for (let i = 0; i < viewModel.length; i++) {
        const cell = viewModel.cellAt(i);
        const cellHeight = totalHeightCache[i] ?? 0;
        if (offset + cellHeight < scrollTop) {
          offset += cellHeight;
          continue;
        }
        if (cell.cellKind === CellKind.Markup) {
          requests.push([cell, offset]);
        }
        offset += cellHeight;
        if (offset > scrollBottom) {
          break;
        }
      }
      await this._webview.initializeMarkup(requests.map(([model, offset2]) => this.createMarkupCellInitialization(model, offset2)));
    } else {
      const initRequests = viewModel.viewCells.filter((cell) => cell.cellKind === CellKind.Markup).slice(0, 5).map((cell) => this.createMarkupCellInitialization(cell, -1e4));
      await this._webview.initializeMarkup(initRequests);
      let offset = 0;
      const offsetUpdateRequests = [];
      const scrollBottom = Math.max(this._dimension?.height ?? 0, 1080);
      for (const cell of viewModel.viewCells) {
        if (cell.cellKind === CellKind.Markup) {
          offsetUpdateRequests.push({ id: cell.id, top: offset });
        }
        offset += cell.getHeight(this.getLayoutInfo().fontInfo.lineHeight);
        if (offset > scrollBottom) {
          break;
        }
      }
      this._webview?.updateScrollTops([], offsetUpdateRequests);
    }
  }
  createMarkupCellInitialization(model, offset) {
    return {
      mime: model.mime,
      cellId: model.id,
      cellHandle: model.handle,
      content: model.getText(),
      offset,
      visible: false,
      metadata: model.metadata
    };
  }
  restoreListViewState(viewState) {
    if (!this.viewModel) {
      return;
    }
    if (viewState?.scrollPosition !== void 0) {
      this._list.scrollTop = viewState.scrollPosition.top;
      this._list.scrollLeft = viewState.scrollPosition.left;
    } else {
      this._list.scrollTop = 0;
      this._list.scrollLeft = 0;
    }
    const focusIdx = typeof viewState?.focus === "number" ? viewState.focus : 0;
    if (focusIdx < this.viewModel.length) {
      const element = this.viewModel.cellAt(focusIdx);
      if (element) {
        this.viewModel?.updateSelectionsState({
          kind: SelectionStateType.Handle,
          primary: element.handle,
          selections: [element.handle]
        });
      }
    } else if (this._list.length > 0) {
      this.viewModel.updateSelectionsState({
        kind: SelectionStateType.Index,
        focus: { start: 0, end: 1 },
        selections: [{ start: 0, end: 1 }]
      });
    }
    if (viewState?.editorFocused) {
      const cell = this.viewModel.cellAt(focusIdx);
      if (cell) {
        cell.focusMode = CellFocusMode.Editor;
      }
    }
  }
  _restoreSelectedKernel(viewState) {
    if (viewState?.selectedKernelId && this.textModel) {
      const matching = this.notebookKernelService.getMatchingKernel(this.textModel);
      const kernel = matching.all.find((k) => k.id === viewState.selectedKernelId);
      if (kernel && !matching.selected) {
        this.notebookKernelService.selectKernelForNotebook(kernel, this.textModel);
      }
    }
  }
  getEditorViewState() {
    const state = this.viewModel?.getEditorViewState();
    if (!state) {
      return {
        editingCells: {},
        cellLineNumberStates: {},
        editorViewStates: {},
        collapsedInputCells: {},
        collapsedOutputCells: {}
      };
    }
    if (this._list) {
      state.scrollPosition = { left: this._list.scrollLeft, top: this._list.scrollTop };
      const cellHeights = {};
      for (let i = 0; i < this.viewModel.length; i++) {
        const elm = this.viewModel.cellAt(i);
        cellHeights[i] = elm.layoutInfo.totalHeight;
      }
      state.cellTotalHeights = cellHeights;
      if (this.viewModel) {
        const focusRange = this.viewModel.getFocus();
        const element = this.viewModel.cellAt(focusRange.start);
        if (element) {
          const itemDOM = this._list.domElementOfElement(element);
          const editorFocused = element.getEditState() === CellEditState.Editing && !!(itemDOM && itemDOM.ownerDocument.activeElement && itemDOM.contains(itemDOM.ownerDocument.activeElement));
          state.editorFocused = editorFocused;
          state.focus = focusRange.start;
        }
      }
    }
    const contributionsState = {};
    for (const [id, contribution] of this._contributions) {
      if (typeof contribution.saveViewState === "function") {
        contributionsState[id] = contribution.saveViewState();
      }
    }
    state.contributionsState = contributionsState;
    if (this.textModel?.uri.scheme === Schemas.untitled) {
      state.selectedKernelId = this.activeKernel?.id;
    }
    return state;
  }
  _allowScrollBeyondLastLine() {
    return this._scrollBeyondLastLine && !this.isReplHistory;
  }
  getBodyHeight(dimensionHeight) {
    return Math.max(dimensionHeight - (this._notebookTopToolbar?.useGlobalToolbar ? (
      /** Toolbar height */
      26
    ) : 0), 0);
  }
  layout(dimension, shadowElement, position) {
    if (!shadowElement && !this._shadowElement) {
      this._dimension = dimension;
      return;
    }
    if (dimension.width <= 0 || dimension.height <= 0) {
      this.onWillHide();
      return;
    }
    const whenContainerStylesLoaded = this.layoutService.whenContainerStylesLoaded(DOM.getWindow(this.getDomNode()));
    if (whenContainerStylesLoaded) {
      whenContainerStylesLoaded.then(() => this.layoutNotebook(dimension, shadowElement));
    } else {
      this.layoutNotebook(dimension, shadowElement);
    }
  }
  layoutNotebook(dimension, shadowElement) {
    if (shadowElement) {
      this._shadowElement = shadowElement;
    }
    this._dimension = dimension;
    const newBodyHeight = this.getBodyHeight(dimension.height) - this.getLayoutInfo().stickyHeight;
    DOM.size(this._body, dimension.width, newBodyHeight);
    const newCellListHeight = newBodyHeight;
    if (this._list.getRenderHeight() < newCellListHeight) {
      this._list.updateOptions({ paddingBottom: this._allowScrollBeyondLastLine() ? Math.max(0, newCellListHeight - 50) : 0, paddingTop: 0 });
      this._list.layout(newCellListHeight, dimension.width);
    } else {
      this._list.layout(newCellListHeight, dimension.width);
      this._list.updateOptions({ paddingBottom: this._allowScrollBeyondLastLine() ? Math.max(0, newCellListHeight - 50) : 0, paddingTop: 0 });
    }
    this._overlayContainer.inert = false;
    this.layoutContainerOverShadowElement(shadowElement ?? this._shadowElement);
    if (this._webviewTransparentCover) {
      this._webviewTransparentCover.style.height = `${dimension.height}px`;
      this._webviewTransparentCover.style.width = `${dimension.width}px`;
    }
    this._notebookTopToolbar.layout(this._dimension);
    this._notebookOverviewRuler.layout();
    this._viewContext?.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
  }
  layoutContainerOverShadowElement(anchorElement) {
    if (!anchorElement) {
      return;
    }
    const modalEditorContainer = this.editorGroupsService.activeModalEditorPart?.modalElement;
    const isModal = DOM.isHTMLElement(modalEditorContainer) && modalEditorContainer.contains(anchorElement);
    const clippingContainer = isModal ? void 0 : this.layoutService.getContainer(DOM.getWindow(this.getDomNode()), Parts.EDITOR_PART);
    this._overlayContainer.style.visibility = "visible";
    this._overlayLayout.setAnchorElement(anchorElement, { clippingContainer });
    this._overlayLayout.reapplyLayoutStyles();
  }
  //#endregion
  //#region Focus tracker
  focus() {
    this._isVisible = true;
    this._editorFocus.set(true);
    if (this._webviewFocused) {
      this._webview?.focusWebview();
    } else {
      if (this.viewModel) {
        const focusRange = this.viewModel.getFocus();
        const element = this.viewModel.cellAt(focusRange.start);
        if (!this.hasEditorFocus()) {
          this.focusContainer();
          this.updateEditorFocus();
        }
        if (element && element.focusMode === CellFocusMode.Editor) {
          element.updateEditState(CellEditState.Editing, "editorWidget.focus");
          element.focusMode = CellFocusMode.Editor;
          this.focusEditor(element);
          return;
        }
      }
      this._list.domFocus();
    }
    if (this._currentProgress) {
      this.showProgress();
    }
  }
  onShow() {
    this._isVisible = true;
  }
  focusEditor(activeElement) {
    for (const [element, editor] of this._renderedEditors.entries()) {
      if (element === activeElement) {
        editor.focus();
        return;
      }
    }
  }
  focusContainer(clearSelection = false) {
    if (this._webviewFocused) {
      this._webview?.focusWebview();
    } else {
      this._list.focusContainer(clearSelection);
    }
  }
  selectOutputContent(cell) {
    this._webview?.selectOutputContents(cell);
  }
  selectInputContents(cell) {
    this._webview?.selectInputContents(cell);
  }
  onWillHide() {
    this._isVisible = false;
    this._editorFocus.set(false);
    this._overlayContainer.inert = true;
    this._overlayContainer.style.visibility = "hidden";
    this._overlayContainer.style.left = "-50000px";
    this._notebookTopToolbarContainer.style.display = "none";
    this.clearActiveCellWidgets();
  }
  clearActiveCellWidgets() {
    this._renderedEditors.forEach((editor, cell) => {
      if (this.getActiveCell() === cell && editor) {
        SuggestController.get(editor)?.cancelSuggestWidget();
        DropIntoEditorController.get(editor)?.clearWidgets();
        CopyPasteController.get(editor)?.clearWidgets();
      }
    });
    this._renderedEditors.forEach((editor, cell) => {
      const controller = InlineCompletionsController.get(editor);
      if (controller?.model.get()?.inlineEditState.get()) {
        editor.render(true);
      }
    });
  }
  editorHasDomFocus() {
    return DOM.isAncestorOfActiveElement(this.getDomNode());
  }
  updateEditorFocus() {
    this._focusTracker.refreshState();
    const focused = this.editorHasDomFocus();
    this._editorFocus.set(focused);
    this.viewModel?.setEditorFocus(focused);
  }
  updateCellFocusMode() {
    const activeCell = this.getActiveCell();
    if (activeCell?.focusMode === CellFocusMode.Output && !this._webviewFocused) {
      activeCell.focusMode = CellFocusMode.Container;
    }
  }
  hasEditorFocus() {
    this.updateEditorFocus();
    return this.editorHasDomFocus();
  }
  hasWebviewFocus() {
    return this._webviewFocused;
  }
  hasOutputTextSelection() {
    if (!this.hasEditorFocus()) {
      return false;
    }
    const windowSelection = DOM.getWindow(this.getDomNode()).getSelection();
    if (windowSelection?.rangeCount !== 1) {
      return false;
    }
    const activeSelection = windowSelection.getRangeAt(0);
    if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
      return false;
    }
    let container = activeSelection.commonAncestorContainer;
    if (!this._body.contains(container)) {
      return false;
    }
    while (container && container !== this._body) {
      if (container.classList && container.classList.contains("output")) {
        return true;
      }
      container = container.parentNode;
    }
    return false;
  }
  _didFocusOutputInputChange(hasFocus) {
    this._outputInputFocus.set(hasFocus);
  }
  //#endregion
  //#region Editor Features
  focusElement(cell) {
    this.viewModel?.updateSelectionsState({
      kind: SelectionStateType.Handle,
      primary: cell.handle,
      selections: [cell.handle]
    });
  }
  get scrollTop() {
    return this._list.scrollTop;
  }
  get scrollBottom() {
    return this._list.scrollTop + this._list.getRenderHeight();
  }
  getAbsoluteTopOfElement(cell) {
    return this._list.getCellViewScrollTop(cell);
  }
  getAbsoluteBottomOfElement(cell) {
    return this._list.getCellViewScrollBottom(cell);
  }
  getHeightOfElement(cell) {
    return this._list.elementHeight(cell);
  }
  scrollToBottom() {
    this._list.scrollToBottom();
  }
  setScrollTop(scrollTop) {
    this._list.scrollTop = scrollTop;
  }
  revealCellRangeInView(range) {
    return this._list.revealCells(range);
  }
  revealInView(cell) {
    return this._list.revealCell(cell, CellRevealType.Default);
  }
  revealInViewAtTop(cell) {
    this._list.revealCell(cell, CellRevealType.Top);
  }
  revealInCenter(cell) {
    this._list.revealCell(cell, CellRevealType.Center);
  }
  async revealInCenterIfOutsideViewport(cell) {
    await this._list.revealCell(cell, CellRevealType.CenterIfOutsideViewport);
  }
  async revealFirstLineIfOutsideViewport(cell) {
    await this._list.revealCell(cell, CellRevealType.FirstLineIfOutsideViewport);
  }
  async revealLineInViewAsync(cell, line) {
    return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.Default);
  }
  async revealLineInCenterAsync(cell, line) {
    return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.Center);
  }
  async revealLineInCenterIfOutsideViewportAsync(cell, line) {
    return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.CenterIfOutsideViewport);
  }
  async revealRangeInViewAsync(cell, range) {
    return this._list.revealRangeInCell(cell, range, CellRevealRangeType.Default);
  }
  async revealRangeInCenterAsync(cell, range) {
    return this._list.revealRangeInCell(cell, range, CellRevealRangeType.Center);
  }
  async revealRangeInCenterIfOutsideViewportAsync(cell, range) {
    return this._list.revealRangeInCell(cell, range, CellRevealRangeType.CenterIfOutsideViewport);
  }
  revealCellOffsetInCenter(cell, offset) {
    return this._list.revealCellOffsetInCenter(cell, offset);
  }
  revealOffsetInCenterIfOutsideViewport(offset) {
    return this._list.revealOffsetInCenterIfOutsideViewport(offset);
  }
  getViewIndexByModelIndex(index) {
    if (!this._listViewInfoAccessor) {
      return -1;
    }
    const cell = this.viewModel?.viewCells[index];
    if (!cell) {
      return -1;
    }
    return this._listViewInfoAccessor.getViewIndex(cell);
  }
  getViewHeight(cell) {
    if (!this._listViewInfoAccessor) {
      return -1;
    }
    return this._listViewInfoAccessor.getViewHeight(cell);
  }
  getCellRangeFromViewRange(startIndex, endIndex) {
    return this._listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex);
  }
  getCellsInRange(range) {
    return this._listViewInfoAccessor.getCellsInRange(range);
  }
  setCellEditorSelection(cell, range) {
    this._list.setCellEditorSelection(cell, range);
  }
  setHiddenAreas(_ranges) {
    return this._list.setHiddenAreas(_ranges, true);
  }
  getVisibleRangesPlusViewportAboveAndBelow() {
    return this._listViewInfoAccessor.getVisibleRangesPlusViewportAboveAndBelow();
  }
  //#endregion
  //#region Decorations
  deltaCellDecorations(oldDecorations, newDecorations) {
    const ret = this.viewModel?.deltaCellDecorations(oldDecorations, newDecorations) || [];
    this._onDidChangeDecorations.fire();
    return ret;
  }
  deltaCellContainerClassNames(cellId, added, removed, cellkind) {
    if (cellkind === CellKind.Markup) {
      this._webview?.deltaMarkupPreviewClassNames(cellId, added, removed);
    } else {
      this._webview?.deltaCellOutputContainerClassNames(cellId, added, removed);
    }
  }
  changeModelDecorations(callback) {
    return this.viewModel?.changeModelDecorations(callback) || null;
  }
  //#endregion
  //#region View Zones
  changeViewZones(callback) {
    this._list.changeViewZones(callback);
    this._onDidChangeLayout.fire();
  }
  getViewZoneLayoutInfo(id) {
    return this._list.getViewZoneLayoutInfo(id);
  }
  //#endregion
  //#region Overlay
  changeCellOverlays(callback) {
    this._list.changeCellOverlays(callback);
  }
  //#endregion
  //#region Kernel/Execution
  async _loadKernelPreloads() {
    if (!this.hasModel()) {
      return;
    }
    const { selected } = this.notebookKernelService.getMatchingKernel(this.textModel);
    if (!this._webview?.isResolved()) {
      await this._resolveWebview();
    }
    this._webview?.updateKernelPreloads(selected);
  }
  get activeKernel() {
    return this.textModel && this.notebookKernelService.getSelectedOrSuggestedKernel(this.textModel);
  }
  async cancelNotebookCells(cells) {
    if (!this.viewModel || !this.hasModel()) {
      return;
    }
    if (!cells) {
      cells = this.viewModel.viewCells;
    }
    return this.notebookExecutionService.cancelNotebookCellHandles(this.textModel, Array.from(cells).map((cell) => cell.handle));
  }
  async executeNotebookCells(cells) {
    if (!this.viewModel || !this.hasModel()) {
      this.logService.info("notebookEditorWidget", "No NotebookViewModel, cannot execute cells");
      return;
    }
    if (!cells) {
      cells = this.viewModel.viewCells;
    }
    return this.notebookExecutionService.executeNotebookCells(this.textModel, Array.from(cells).map((c) => c.model), this.scopedContextKeyService);
  }
  //#endregion
  async layoutNotebookCell(cell, height, context) {
    return this._cellLayoutManager?.layoutNotebookCell(cell, height);
  }
  getActiveCell() {
    const elements = this._list.getFocusedElements();
    if (elements && elements.length) {
      return elements[0];
    }
    return void 0;
  }
  _toggleNotebookCellSelection(selectedCell, selectFromPrevious) {
    const currentSelections = this._list.getSelectedElements();
    const isSelected = currentSelections.includes(selectedCell);
    const previousSelection = selectFromPrevious ? currentSelections[currentSelections.length - 1] ?? selectedCell : selectedCell;
    const selectedIndex = this._list.getViewIndex(selectedCell);
    const previousIndex = this._list.getViewIndex(previousSelection);
    const cellsInSelectionRange = this.getCellsInViewRange(selectedIndex, previousIndex);
    if (isSelected) {
      this._list.selectElements(currentSelections.filter((current) => !cellsInSelectionRange.includes(current)));
    } else {
      this.focusElement(selectedCell);
      this._list.selectElements([...currentSelections.filter((current) => !cellsInSelectionRange.includes(current)), ...cellsInSelectionRange]);
    }
  }
  getCellsInViewRange(fromInclusive, toInclusive) {
    const selectedCellsInRange = [];
    for (let index = 0; index < this._list.length; ++index) {
      const cell = this._list.element(index);
      if (cell) {
        if (index >= fromInclusive && index <= toInclusive || index >= toInclusive && index <= fromInclusive) {
          selectedCellsInRange.push(cell);
        }
      }
    }
    return selectedCellsInRange;
  }
  async focusNotebookCell(cell, focusItem, options) {
    if (this._isDisposed) {
      return;
    }
    cell.focusedOutputId = void 0;
    if (focusItem === "editor") {
      cell.isInputCollapsed = false;
      this.focusElement(cell);
      this._list.focusView();
      cell.updateEditState(CellEditState.Editing, "focusNotebookCell");
      cell.focusMode = CellFocusMode.Editor;
      if (!options?.skipReveal) {
        if (typeof options?.focusEditorLine === "number") {
          this._cursorNavMode.set(true);
          await this.revealLineInViewAsync(cell, options.focusEditorLine);
          const editor = this._renderedEditors.get(cell);
          const focusEditorLine = options.focusEditorLine;
          editor?.setSelection({
            startLineNumber: focusEditorLine,
            startColumn: 1,
            endLineNumber: focusEditorLine,
            endColumn: 1
          });
        } else {
          const selectionsStartPosition = cell.getSelectionsStartPosition();
          if (selectionsStartPosition?.length) {
            const firstSelectionPosition = selectionsStartPosition[0];
            await this.revealRangeInViewAsync(cell, Range.fromPositions(firstSelectionPosition, firstSelectionPosition));
          } else {
            await this.revealInView(cell);
          }
        }
      }
    } else if (focusItem === "output") {
      this.focusElement(cell);
      if (!this.hasEditorFocus()) {
        this._list.focusView();
      }
      if (!this._webview) {
        return;
      }
      const firstOutputId = cell.outputsViewModels.find((o) => o.model.alternativeOutputId)?.model.alternativeOutputId;
      const focusElementId = options?.outputId ?? firstOutputId ?? cell.id;
      this._webview.focusOutput(focusElementId, options?.altOutputId, options?.outputWebviewFocused || this._webviewFocused);
      cell.updateEditState(CellEditState.Preview, "focusNotebookCell");
      cell.focusMode = CellFocusMode.Output;
      cell.focusedOutputId = options?.outputId;
      this._outputFocus.set(true);
      if (!options?.skipReveal) {
        this.revealInCenterIfOutsideViewport(cell);
      }
    } else {
      const itemDOM = this._list.domElementOfElement(cell);
      if (itemDOM && itemDOM.ownerDocument.activeElement && itemDOM.contains(itemDOM.ownerDocument.activeElement)) {
        itemDOM.ownerDocument.activeElement.blur();
      }
      this._webview?.blurOutput();
      cell.updateEditState(CellEditState.Preview, "focusNotebookCell");
      cell.focusMode = CellFocusMode.Container;
      this.focusElement(cell);
      if (!options?.skipReveal) {
        if (typeof options?.focusEditorLine === "number") {
          this._cursorNavMode.set(true);
          await this.revealInView(cell);
        } else if (options?.revealBehavior === ScrollToRevealBehavior.firstLine) {
          await this.revealFirstLineIfOutsideViewport(cell);
        } else if (options?.revealBehavior === ScrollToRevealBehavior.fullCell) {
          await this.revealInView(cell);
        } else {
          await this.revealInCenterIfOutsideViewport(cell);
        }
      }
      this._list.focusView();
      this.updateEditorFocus();
    }
  }
  async focusNextNotebookCell(cell, focusItem) {
    const idx = this.viewModel?.getCellIndex(cell);
    if (typeof idx !== "number") {
      return;
    }
    const newCell = this.viewModel?.cellAt(idx + 1);
    if (!newCell) {
      return;
    }
    await this.focusNotebookCell(newCell, focusItem);
  }
  //#endregion
  //#region Find
  async _warmupCell(viewCell) {
    if (viewCell.isOutputCollapsed) {
      return;
    }
    const outputs = viewCell.outputsViewModels;
    for (const output of outputs.slice(0, outputDisplayLimit)) {
      const [mimeTypes, pick] = output.resolveMimeTypes(this.textModel, void 0);
      if (!mimeTypes.find((mimeType) => mimeType.isTrusted) || mimeTypes.length === 0) {
        continue;
      }
      const pickedMimeTypeRenderer = mimeTypes[pick];
      if (!pickedMimeTypeRenderer) {
        return;
      }
      const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
      if (!renderer) {
        return;
      }
      const result = { type: RenderOutputType.Extension, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
      const inset = this._webview?.insetMapping.get(result.source);
      if (!inset || !inset.initialized) {
        const p = new Promise((resolve) => {
          this._register(Event.any(this.onDidRenderOutput, this.onDidRemoveOutput)((e) => {
            if (e.model === result.source.model) {
              resolve();
            }
          }));
        });
        this.createOutput(viewCell, result, 0, false);
        await p;
      } else {
        this.createOutput(viewCell, result, 0, false);
      }
      return;
    }
  }
  async _warmupAll(includeOutput) {
    if (!this.hasModel() || !this.viewModel) {
      return;
    }
    const cells = this.viewModel.viewCells;
    const requests = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].cellKind === CellKind.Markup && !this._webview.markupPreviewMapping.has(cells[i].id)) {
        requests.push(this.createMarkupPreview(cells[i]));
      }
    }
    if (includeOutput && this._list) {
      for (let i = 0; i < this._list.length; i++) {
        const cell = this._list.element(i);
        if (cell?.cellKind === CellKind.Code) {
          requests.push(this._warmupCell(cell));
        }
      }
    }
    return Promise.all(requests);
  }
  async _warmupSelection(includeOutput, selectedCellRanges) {
    if (!this.hasModel() || !this.viewModel) {
      return;
    }
    const cells = this.viewModel.viewCells;
    const requests = [];
    for (const range of selectedCellRanges) {
      for (let i = range.start; i < range.end; i++) {
        if (cells[i].cellKind === CellKind.Markup && !this._webview.markupPreviewMapping.has(cells[i].id)) {
          requests.push(this.createMarkupPreview(cells[i]));
        }
      }
    }
    if (includeOutput && this._list) {
      for (const range of selectedCellRanges) {
        for (let i = range.start; i < range.end; i++) {
          const cell = this._list.element(i);
          if (cell?.cellKind === CellKind.Code) {
            requests.push(this._warmupCell(cell));
          }
        }
      }
    }
    return Promise.all(requests);
  }
  async find(query, options, token, skipWarmup = false, shouldGetSearchPreviewInfo = false, ownerID) {
    if (!this._notebookViewModel) {
      return [];
    }
    if (!ownerID) {
      ownerID = this.getId();
    }
    const findMatches = this._notebookViewModel.find(query, options).filter((match) => match.length > 0);
    if (!options.includeMarkupPreview && !options.includeOutput || options.findScope?.findScopeType === NotebookFindScopeType.Text) {
      this._webview?.findStop(ownerID);
      return findMatches;
    }
    const matchMap = {};
    findMatches.forEach((match) => {
      matchMap[match.cell.id] = match;
    });
    if (this._webview) {
      const start = Date.now();
      if (options.findScope && options.findScope.findScopeType === NotebookFindScopeType.Cells && options.findScope.selectedCellRanges) {
        await this._warmupSelection(!!options.includeOutput, options.findScope.selectedCellRanges);
      } else {
        await this._warmupAll(!!options.includeOutput);
      }
      const end = Date.now();
      this.logService.debug("Find", `Warmup time: ${end - start}ms`);
      if (token.isCancellationRequested) {
        return [];
      }
      let findIds = [];
      if (options.findScope && options.findScope.findScopeType === NotebookFindScopeType.Cells && options.findScope.selectedCellRanges) {
        const selectedIndexes = cellRangesToIndexes(options.findScope.selectedCellRanges);
        findIds = selectedIndexes.map((index) => this._notebookViewModel?.viewCells[index].id ?? "");
      }
      const webviewMatches = await this._webview.find(query, { caseSensitive: options.caseSensitive, wholeWord: options.wholeWord, includeMarkup: !!options.includeMarkupPreview, includeOutput: !!options.includeOutput, shouldGetSearchPreviewInfo, ownerID, findIds });
      if (token.isCancellationRequested) {
        return [];
      }
      webviewMatches.forEach((match) => {
        const cell = this._notebookViewModel.viewCells.find((cell2) => cell2.id === match.cellId);
        if (!cell) {
          return;
        }
        if (match.type === "preview") {
          if (cell.getEditState() === CellEditState.Preview && !options.includeMarkupPreview) {
            return;
          }
          if (cell.getEditState() === CellEditState.Editing && options.includeMarkupInput) {
            return;
          }
        } else {
          if (!options.includeOutput) {
            return;
          }
        }
        const exisitingMatch = matchMap[match.cellId];
        if (exisitingMatch) {
          exisitingMatch.webviewMatches.push(match);
        } else {
          matchMap[match.cellId] = new CellFindMatchModel(
            this._notebookViewModel.viewCells.find((cell2) => cell2.id === match.cellId),
            this._notebookViewModel.viewCells.findIndex((cell2) => cell2.id === match.cellId),
            [],
            [match]
          );
        }
      });
    }
    const ret = [];
    this._notebookViewModel.viewCells.forEach((cell, index) => {
      if (matchMap[cell.id]) {
        ret.push(new CellFindMatchModel(cell, index, matchMap[cell.id].contentMatches, matchMap[cell.id].webviewMatches));
      }
    });
    return ret;
  }
  async findHighlightCurrent(matchIndex, ownerID) {
    if (!this._webview) {
      return 0;
    }
    return this._webview?.findHighlightCurrent(matchIndex, ownerID ?? this.getId());
  }
  async findUnHighlightCurrent(matchIndex, ownerID) {
    if (!this._webview) {
      return;
    }
    return this._webview?.findUnHighlightCurrent(matchIndex, ownerID ?? this.getId());
  }
  findStop(ownerID) {
    this._webview?.findStop(ownerID ?? this.getId());
  }
  //#endregion
  //#region MISC
  getLayoutInfo() {
    if (!this._list) {
      throw new Error("Editor is not initalized successfully");
    }
    if (!this._fontInfo) {
      this._generateFontInfo();
    }
    let listViewOffset = 0;
    if (this._dimension) {
      listViewOffset = (this._notebookTopToolbar?.useGlobalToolbar ? (
        /** Toolbar height */
        26
      ) : 0) + (this._notebookStickyScroll?.getCurrentStickyHeight() ?? 0);
    }
    return {
      width: this._dimension?.width ?? 0,
      height: this._dimension?.height ?? 0,
      scrollHeight: this._list?.getScrollHeight() ?? 0,
      fontInfo: this._fontInfo,
      stickyHeight: this._notebookStickyScroll?.getCurrentStickyHeight() ?? 0,
      listViewOffsetTop: listViewOffset
    };
  }
  async createMarkupPreview(cell) {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    if (!this._webview || !this._list.webviewElement) {
      return;
    }
    if (!this.viewModel || !this._list.viewModel) {
      return;
    }
    if (this.viewModel.getCellIndex(cell) === -1) {
      return;
    }
    if (this.cellIsHidden(cell)) {
      return;
    }
    const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
    const top = !!webviewTop ? 0 - webviewTop : 0;
    const cellTop = this._list.getCellViewScrollTop(cell);
    await this._webview.showMarkupPreview({
      mime: cell.mime,
      cellHandle: cell.handle,
      cellId: cell.id,
      content: cell.getText(),
      offset: cellTop + top,
      visible: true,
      metadata: cell.metadata
    });
  }
  cellIsHidden(cell) {
    const modelIndex = this.viewModel.getCellIndex(cell);
    const foldedRanges = this.viewModel.getHiddenRanges();
    return foldedRanges.some((range) => modelIndex >= range.start && modelIndex <= range.end);
  }
  async unhideMarkupPreviews(cells) {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    await this._webview?.unhideMarkupPreviews(cells.map((cell) => cell.id));
  }
  async hideMarkupPreviews(cells) {
    if (!this._webview || !cells.length) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    await this._webview?.hideMarkupPreviews(cells.map((cell) => cell.id));
  }
  async deleteMarkupPreviews(cells) {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    await this._webview?.deleteMarkupPreviews(cells.map((cell) => cell.id));
  }
  async updateSelectedMarkdownPreviews() {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    const selectedCells = this.getSelectionViewModels().map((cell) => cell.id);
    await this._webview?.updateMarkupPreviewSelections(selectedCells.length > 1 ? selectedCells : []);
  }
  async createOutput(cell, output, offset, createWhenIdle) {
    this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
      if (this._isDisposed || !this._webview) {
        return;
      }
      if (!this._webview.isResolved()) {
        await this._resolveWebview();
      }
      if (!this._webview) {
        return;
      }
      if (!this._list.webviewElement) {
        return;
      }
      if (output.type === RenderOutputType.Extension) {
        this.notebookRendererMessaging.prepare(output.renderer.id);
      }
      const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
      const top = !!webviewTop ? 0 - webviewTop : 0;
      const cellTop = this._list.getCellViewScrollTop(cell) + top;
      const existingOutput = this._webview.insetMapping.get(output.source);
      if (!existingOutput || !existingOutput.renderer && output.type === RenderOutputType.Extension) {
        if (createWhenIdle) {
          this._webview.requestCreateOutputWhenWebviewIdle({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
        } else {
          this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
        }
      } else if (existingOutput.renderer && output.type === RenderOutputType.Extension && existingOutput.renderer.id !== output.renderer.id) {
        this._webview.removeInsets([output.source]);
        this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
      } else if (existingOutput.versionId !== output.source.model.versionId) {
        this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
      } else {
        const outputIndex = cell.outputsViewModels.indexOf(output.source);
        const outputOffset = cell.getOutputOffset(outputIndex);
        this._webview.updateScrollTops([{
          cell,
          output: output.source,
          cellTop,
          outputOffset,
          forceDisplay: !cell.isOutputCollapsed
        }], []);
      }
    });
  }
  async updateOutput(cell, output, offset) {
    this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
      if (this._isDisposed || !this._webview || cell.isOutputCollapsed) {
        return;
      }
      if (!this._webview.isResolved()) {
        await this._resolveWebview();
      }
      if (!this._webview || !this._list.webviewElement) {
        return;
      }
      if (!this._webview.insetMapping.has(output.source)) {
        return this.createOutput(cell, output, offset, false);
      }
      if (output.type === RenderOutputType.Extension) {
        this.notebookRendererMessaging.prepare(output.renderer.id);
      }
      const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
      const top = !!webviewTop ? 0 - webviewTop : 0;
      const cellTop = this._list.getCellViewScrollTop(cell) + top;
      this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
    });
  }
  async copyOutputImage(cellOutput) {
    this._webview?.copyImage(cellOutput);
  }
  removeInset(output) {
    this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
      if (this._isDisposed || !this._webview) {
        return;
      }
      if (this._webview?.isResolved()) {
        this._webview.removeInsets([output]);
      }
      this._onDidRemoveOutput.fire(output);
    });
  }
  hideInset(output) {
    this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
      if (this._isDisposed || !this._webview) {
        return;
      }
      if (this._webview?.isResolved()) {
        this._webview.hideInset(output);
      }
    });
  }
  //#region --- webview IPC ----
  postMessage(message) {
    if (this._webview?.isResolved()) {
      this._webview.postKernelMessage(message);
    }
  }
  //#endregion
  addClassName(className) {
    this._overlayContainer.classList.add(className);
  }
  removeClassName(className) {
    this._overlayContainer.classList.remove(className);
  }
  cellAt(index) {
    return this.viewModel?.cellAt(index);
  }
  getCellByInfo(cellInfo) {
    const { cellHandle } = cellInfo;
    return this.viewModel?.viewCells.find((vc) => vc.handle === cellHandle);
  }
  getCellByHandle(handle) {
    return this.viewModel?.getCellByHandle(handle);
  }
  getCellIndex(cell) {
    return this.viewModel?.getCellIndexByHandle(cell.handle);
  }
  getNextVisibleCellIndex(index) {
    return this.viewModel?.getNextVisibleCellIndex(index);
  }
  getPreviousVisibleCellIndex(index) {
    return this.viewModel?.getPreviousVisibleCellIndex(index);
  }
  _updateScrollHeight() {
    if (this._isDisposed || !this._webview?.isResolved()) {
      return;
    }
    if (!this._list.webviewElement) {
      return;
    }
    const scrollHeight = this._list.scrollHeight;
    this._webview.element.style.height = `${scrollHeight + NOTEBOOK_WEBVIEW_BOUNDARY * 2}px`;
    const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
    const top = !!webviewTop ? 0 - webviewTop : 0;
    const updateItems = [];
    const removedItems = [];
    this._webview?.insetMapping.forEach((value, key) => {
      const cell = this.viewModel?.getCellByHandle(value.cellInfo.cellHandle);
      if (!cell || !(cell instanceof CodeCellViewModel)) {
        return;
      }
      const viewIndex = this._list.getViewIndex(cell);
      if (viewIndex === void 0) {
        return;
      }
      const outputIndex = cell.outputsViewModels.indexOf(key);
      if (outputIndex < 0) {
        removedItems.push(key);
        return;
      }
      const cellTop = this._list.getCellViewScrollTop(cell);
      const outputOffset = cell.getOutputOffset(outputIndex);
      updateItems.push({
        cell,
        output: key,
        cellTop: cellTop + top,
        outputOffset,
        forceDisplay: false
      });
    });
    this._webview.removeInsets(removedItems);
    const markdownUpdateItems = [];
    for (const cellId of this._webview.markupPreviewMapping.keys()) {
      const cell = this.viewModel?.viewCells.find((cell2) => cell2.id === cellId);
      if (cell) {
        const cellTop = this._list.getCellViewScrollTop(cell);
        markdownUpdateItems.push({ id: cellId, top: cellTop + top });
      }
    }
    if (markdownUpdateItems.length || updateItems.length) {
      this._debug("_list.onDidChangeContentHeight/markdown", markdownUpdateItems);
      this._webview?.updateScrollTops(updateItems, markdownUpdateItems);
    }
  }
  //#endregion
  //#region BacklayerWebview delegate
  _updateOutputHeight(cellInfo, output, outputHeight, isInit, source) {
    const cell = this.viewModel?.viewCells.find((vc) => vc.handle === cellInfo.cellHandle);
    if (cell && cell instanceof CodeCellViewModel) {
      const outputIndex = cell.outputsViewModels.indexOf(output);
      if (outputIndex > -1) {
        this._debug("update cell output", cell.handle, outputHeight);
        cell.updateOutputHeight(outputIndex, outputHeight, source);
        this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight);
        if (isInit) {
          this._onDidRenderOutput.fire(output);
        }
      } else {
        this._debug("tried to update cell output that does not exist");
      }
    }
  }
  _scheduleOutputHeightAck(cellInfo, outputId, height) {
    const wasEmpty = this._pendingOutputHeightAcks.size === 0;
    this._pendingOutputHeightAcks.set(outputId, { cellId: cellInfo.cellId, outputId, height });
    if (wasEmpty) {
      DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
        this._debug("ack height");
        this._updateScrollHeight();
        this._webview?.ackHeight([...this._pendingOutputHeightAcks.values()]);
        this._pendingOutputHeightAcks.clear();
      }, -1);
    }
  }
  _getCellById(cellId) {
    return this.viewModel?.viewCells.find((vc) => vc.id === cellId);
  }
  _updateMarkupCellHeight(cellId, height, isInit) {
    const cell = this._getCellById(cellId);
    if (cell && cell instanceof MarkupCellViewModel) {
      const { bottomToolbarGap } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
      this._debug("updateMarkdownCellHeight", cell.handle, height + bottomToolbarGap, isInit);
      cell.renderedMarkdownHeight = height;
    }
  }
  _setMarkupCellEditState(cellId, editState) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      this.revealInView(cell);
      cell.updateEditState(editState, "setMarkdownCellEditState");
    }
  }
  _didStartDragMarkupCell(cellId, event) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
      this._dndController?.startExplicitDrag(cell, event.dragOffsetY - webviewOffset);
    }
  }
  _didDragMarkupCell(cellId, event) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
      this._dndController?.explicitDrag(cell, event.dragOffsetY - webviewOffset);
    }
  }
  _didDropMarkupCell(cellId, event) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
      event.dragOffsetY -= webviewOffset;
      this._dndController?.explicitDrop(cell, event);
    }
  }
  _didEndDragMarkupCell(cellId) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      this._dndController?.endExplicitDrag(cell);
    }
  }
  _didResizeOutput(cellId) {
    const cell = this._getCellById(cellId);
    if (cell) {
      this._onDidResizeOutputEmitter.fire(cell);
    }
  }
  _updatePerformanceMetadata(cellId, executionId, duration, rendererId) {
    if (!this.hasModel()) {
      return;
    }
    const cell = this._getCellById(cellId);
    const cellIndex = !cell ? void 0 : this.getCellIndex(cell);
    if (cell?.internalMetadata.executionId === executionId && cellIndex !== void 0) {
      const renderDurationMap = cell.internalMetadata.renderDuration || {};
      renderDurationMap[rendererId] = (renderDurationMap[rendererId] ?? 0) + duration;
      this.textModel.applyEdits([
        {
          editType: CellEditType.PartialInternalMetadata,
          index: cellIndex,
          internalMetadata: {
            executionId,
            renderDuration: renderDurationMap
          }
        }
      ], true, void 0, () => void 0, void 0, false);
    }
  }
  //#endregion
  //#region Editor Contributions
  getContribution(id) {
    return this._contributions.get(id) || null;
  }
  //#endregion
  dispose() {
    this._isDisposed = true;
    this._webview?.dispose();
    this._webview = null;
    this.notebookEditorService.removeNotebookEditor(this);
    dispose(this._contributions.values());
    this._contributions.clear();
    this._localStore.clear();
    dispose(this._localCellStateListeners);
    this._list.dispose();
    this._cellLayoutManager?.dispose();
    this._listTopCellToolbar?.dispose();
    this._overlayContainer.remove();
    this.viewModel?.dispose();
    this._renderedEditors.clear();
    this._baseCellEditorOptions.forEach((v) => v.dispose());
    this._baseCellEditorOptions.clear();
    this._notebookOverviewRulerContainer.remove();
    super.dispose();
    this._webview = null;
    this._webviewResolvePromise = null;
    this._webviewTransparentCover = null;
    this._dndController = null;
    this._listTopCellToolbar = null;
    this._notebookViewModel = void 0;
    this._cellContextKeyManager = null;
    this._notebookTopToolbar = null;
    this._list = null;
    this._listViewInfoAccessor = null;
    this._listDelegate = null;
  }
  toJSON() {
    return {
      notebookUri: this.viewModel?.uri
    };
  }
};
NotebookEditorWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorGroupsService),
  __decorateParam(4, INotebookRendererMessagingService),
  __decorateParam(5, INotebookEditorService),
  __decorateParam(6, INotebookKernelService),
  __decorateParam(7, INotebookService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IWorkbenchLayoutService),
  __decorateParam(11, IContextMenuService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, INotebookExecutionService),
  __decorateParam(14, IEditorProgressService),
  __decorateParam(15, INotebookLoggingService)
], NotebookEditorWidget);
registerZIndex(ZIndex.Base, 5, "notebook-progress-bar");
registerZIndex(ZIndex.Base, 10, "notebook-list-insertion-indicator");
registerZIndex(ZIndex.Base, 20, "notebook-cell-editor-outline");
registerZIndex(ZIndex.Base, 25, "notebook-scrollbar");
registerZIndex(ZIndex.Base, 26, "notebook-cell-status");
registerZIndex(ZIndex.Base, 26, "notebook-folding-indicator");
registerZIndex(ZIndex.Base, 27, "notebook-output");
registerZIndex(ZIndex.Base, 28, "notebook-cell-bottom-toolbar-container");
registerZIndex(ZIndex.Base, 29, "notebook-run-button-container");
registerZIndex(ZIndex.Base, 29, "notebook-input-collapse-condicon");
registerZIndex(ZIndex.Base, 30, "notebook-cell-output-toolbar");
registerZIndex(ZIndex.Sash, 1, "notebook-cell-expand-part-button");
registerZIndex(ZIndex.Sash, 2, "notebook-cell-toolbar");
registerZIndex(ZIndex.Sash, 3, "notebook-cell-toolbar-dropdown-active");
const notebookCellBorder = registerColor("notebook.cellBorderColor", {
  dark: transparent(listInactiveSelectionBackground, 1),
  light: transparent(listInactiveSelectionBackground, 1),
  hcDark: PANEL_BORDER,
  hcLight: PANEL_BORDER
}, nls.localize("notebook.cellBorderColor", "The border color for notebook cells."));
const focusedEditorBorderColor = registerColor("notebook.focusedEditorBorder", focusBorder, nls.localize("notebook.focusedEditorBorder", "The color of the notebook cell editor border."));
const cellStatusIconSuccess = registerColor("notebookStatusSuccessIcon.foreground", debugIconStartForeground, nls.localize("notebookStatusSuccessIcon.foreground", "The error icon color of notebook cells in the cell status bar."));
const runningCellRulerDecorationColor = registerColor("notebookEditorOverviewRuler.runningCellForeground", debugIconStartForeground, nls.localize("notebookEditorOverviewRuler.runningCellForeground", "The color of the running cell decoration in the notebook editor overview ruler."));
const cellStatusIconError = registerColor("notebookStatusErrorIcon.foreground", errorForeground, nls.localize("notebookStatusErrorIcon.foreground", "The error icon color of notebook cells in the cell status bar."));
const cellStatusIconRunning = registerColor("notebookStatusRunningIcon.foreground", foreground, nls.localize("notebookStatusRunningIcon.foreground", "The running icon color of notebook cells in the cell status bar."));
const notebookOutputContainerBorderColor = registerColor("notebook.outputContainerBorderColor", null, nls.localize("notebook.outputContainerBorderColor", "The border color of the notebook output container."));
const notebookOutputContainerColor = registerColor("notebook.outputContainerBackgroundColor", null, nls.localize("notebook.outputContainerBackgroundColor", "The color of the notebook output container background."));
const CELL_TOOLBAR_SEPERATOR = registerColor("notebook.cellToolbarSeparator", {
  dark: Color.fromHex("#808080").transparent(0.35),
  light: Color.fromHex("#808080").transparent(0.35),
  hcDark: contrastBorder,
  hcLight: contrastBorder
}, nls.localize("notebook.cellToolbarSeparator", "The color of the separator in the cell bottom toolbar"));
const focusedCellBackground = registerColor("notebook.focusedCellBackground", null, nls.localize("focusedCellBackground", "The background color of a cell when the cell is focused."));
const selectedCellBackground = registerColor("notebook.selectedCellBackground", {
  dark: listInactiveSelectionBackground,
  light: listInactiveSelectionBackground,
  hcDark: null,
  hcLight: null
}, nls.localize("selectedCellBackground", "The background color of a cell when the cell is selected."));
const cellHoverBackground = registerColor("notebook.cellHoverBackground", {
  dark: transparent(focusedCellBackground, 0.5),
  light: transparent(focusedCellBackground, 0.7),
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.cellHoverBackground", "The background color of a cell when the cell is hovered."));
const selectedCellBorder = registerColor("notebook.selectedCellBorder", {
  dark: notebookCellBorder,
  light: notebookCellBorder,
  hcDark: contrastBorder,
  hcLight: contrastBorder
}, nls.localize("notebook.selectedCellBorder", "The color of the cell's top and bottom border when the cell is selected but not focused."));
const inactiveSelectedCellBorder = registerColor("notebook.inactiveSelectedCellBorder", {
  dark: null,
  light: null,
  hcDark: focusBorder,
  hcLight: focusBorder
}, nls.localize("notebook.inactiveSelectedCellBorder", "The color of the cell's borders when multiple cells are selected."));
const focusedCellBorder = registerColor("notebook.focusedCellBorder", focusBorder, nls.localize("notebook.focusedCellBorder", "The color of the cell's focus indicator borders when the cell is focused."));
const inactiveFocusedCellBorder = registerColor("notebook.inactiveFocusedCellBorder", notebookCellBorder, nls.localize("notebook.inactiveFocusedCellBorder", "The color of the cell's top and bottom border when a cell is focused while the primary focus is outside of the editor."));
const cellStatusBarItemHover = registerColor("notebook.cellStatusBarItemHoverBackground", {
  light: new Color(new RGBA(0, 0, 0, 0.08)),
  dark: new Color(new RGBA(255, 255, 255, 0.15)),
  hcDark: new Color(new RGBA(255, 255, 255, 0.15)),
  hcLight: new Color(new RGBA(0, 0, 0, 0.08))
}, nls.localize("notebook.cellStatusBarItemHoverBackground", "The background color of notebook cell status bar items."));
const cellInsertionIndicator = registerColor("notebook.cellInsertionIndicator", focusBorder, nls.localize("notebook.cellInsertionIndicator", "The color of the notebook cell insertion indicator."));
const listScrollbarSliderBackground = registerColor("notebookScrollbarSlider.background", scrollbarSliderBackground, nls.localize("notebookScrollbarSliderBackground", "Notebook scrollbar slider background color."));
const listScrollbarSliderHoverBackground = registerColor("notebookScrollbarSlider.hoverBackground", scrollbarSliderHoverBackground, nls.localize("notebookScrollbarSliderHoverBackground", "Notebook scrollbar slider background color when hovering."));
const listScrollbarSliderActiveBackground = registerColor("notebookScrollbarSlider.activeBackground", scrollbarSliderActiveBackground, nls.localize("notebookScrollbarSliderActiveBackground", "Notebook scrollbar slider background color when clicked on."));
const cellSymbolHighlight = registerColor("notebook.symbolHighlightBackground", {
  dark: Color.fromHex("#ffffff0b"),
  light: Color.fromHex("#fdff0033"),
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.symbolHighlightBackground", "Background color of highlighted cell"));
const cellEditorBackground = registerColor("notebook.cellEditorBackground", {
  light: SIDE_BAR_BACKGROUND,
  dark: SIDE_BAR_BACKGROUND,
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.cellEditorBackground", "Cell editor background color."));
const notebookEditorBackground = registerColor("notebook.editorBackground", {
  light: EDITOR_PANE_BACKGROUND,
  dark: EDITOR_PANE_BACKGROUND,
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.editorBackground", "Notebook background color."));
export {
  CELL_TOOLBAR_SEPERATOR,
  NotebookEditorWidget,
  cellEditorBackground,
  cellHoverBackground,
  cellInsertionIndicator,
  cellStatusBarItemHover,
  cellStatusIconError,
  cellStatusIconRunning,
  cellStatusIconSuccess,
  cellSymbolHighlight,
  focusedCellBackground,
  focusedCellBorder,
  focusedEditorBorderColor,
  getDefaultNotebookCreationOptions,
  inactiveFocusedCellBorder,
  inactiveSelectedCellBorder,
  listScrollbarSliderActiveBackground,
  listScrollbarSliderBackground,
  listScrollbarSliderHoverBackground,
  notebookCellBorder,
  notebookOutputContainerBorderColor,
  notebookOutputContainerColor,
  runningCellRulerDecorationColor,
  selectedCellBackground,
  selectedCellBorder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxub3RlYm9va0VkaXRvcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9vay5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2VsbENoYXQuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0NlbGxFZGl0b3JIaW50LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2tDZWxsSW5zZXJ0VG9vbGJhci5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2VsbFN0YXR1c0Jhci5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2VsbFRpdGxlVG9vbGJhci5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rRm9jdXNJbmRpY2F0b3IuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va1Rvb2xiYXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0RuZC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rRm9sZGluZy5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2VsbE91dHB1dC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rRWRpdG9yU3RpY2t5U2Nyb2xsLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2tLZXJuZWxBY3Rpb25WaWV3SXRlbS5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rT3V0bGluZS5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2hhdEVkaXRDb250cm9sbGVyLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2tDaGF0RWRpdG9yT3ZlcmxheS5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQsIFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IE92ZXJsYXlMYXlvdXRFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL292ZXJsYXlMYXlvdXRFbGVtZW50LmpzJztcbmltcG9ydCB7IElMaXN0Q29udGV4dE1lbnVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvciwgUkdCQSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHNldFRpbWVvdXQwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBGb250TWVhc3VyZW1lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2ZvbnRNZWFzdXJlbWVudHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvRnJvbVNldHRpbmdzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU3VnZ2VzdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJaSW5kZXgsIFpJbmRleCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL3pJbmRleFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1J1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyLCBlcnJvckZvcmVncm91bmQsIGZvY3VzQm9yZGVyLCBmb3JlZ3JvdW5kLCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCByZWdpc3RlckNvbG9yLCBzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kLCBzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kLCBzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQsIHRyYW5zcGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRURJVE9SX1BBTkVfQkFDS0dST1VORCwgUEFORUxfQk9SREVSLCBTSURFX0JBUl9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGRlYnVnSWNvblN0YXJ0Rm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uL2RlYnVnL2Jyb3dzZXIvZGVidWdDb2xvcnMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCwgQ2VsbEZvY3VzTW9kZSwgQ2VsbExheW91dENvbnRleHQsIENlbGxSZXZlYWxSYW5nZVR5cGUsIENlbGxSZXZlYWxUeXBlLCBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSwgSUJhc2VDZWxsRWRpdG9yT3B0aW9ucywgSUNlbGxPdXRwdXRWaWV3TW9kZWwsIElDZWxsVmlld01vZGVsLCBJQ29tbW9uQ2VsbEluZm8sIElEaXNwbGF5T3V0cHV0TGF5b3V0VXBkYXRlUmVxdWVzdCwgSUZvY3VzTm90ZWJvb2tDZWxsT3B0aW9ucywgSUluc2V0UmVuZGVyT3V0cHV0LCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBJTm90ZWJvb2tDZWxsT3ZlcmxheUNoYW5nZUFjY2Vzc29yLCBJTm90ZWJvb2tEZWx0YURlY29yYXRpb24sIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbiwgSU5vdGVib29rRWRpdG9yQ3JlYXRpb25PcHRpb25zLCBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSwgSU5vdGVib29rRWRpdG9yTW91c2VFdmVudCwgSU5vdGVib29rRWRpdG9yT3B0aW9ucywgSU5vdGVib29rRWRpdG9yVmlld1N0YXRlLCBJTm90ZWJvb2tWaWV3Q2VsbHNVcGRhdGVFdmVudCwgSU5vdGVib29rVmlld1pvbmVDaGFuZ2VBY2Nlc3NvciwgSU5vdGVib29rV2Vidmlld01lc3NhZ2UsIFJlbmRlck91dHB1dFR5cGUsIFNjcm9sbFRvUmV2ZWFsQmVoYXZpb3IgfSBmcm9tICcuL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4vbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBub3RlYm9va0RlYnVnIH0gZnJvbSAnLi9ub3RlYm9va0xvZ2dlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxTdGF0ZUNoYW5nZWRFdmVudCwgTm90ZWJvb2tMYXlvdXRDaGFuZ2VkRXZlbnQsIE5vdGVib29rTGF5b3V0SW5mbyB9IGZyb20gJy4vbm90ZWJvb2tWaWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IENlbGxDb250ZXh0S2V5TWFuYWdlciB9IGZyb20gJy4vdmlldy9jZWxsUGFydHMvY2VsbENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENlbGxEcmFnQW5kRHJvcENvbnRyb2xsZXIgfSBmcm9tICcuL3ZpZXcvY2VsbFBhcnRzL2NlbGxEbmQuanMnO1xuaW1wb3J0IHsgTGlzdFZpZXdJbmZvQWNjZXNzb3IsIE5vdGVib29rQ2VsbExpc3QsIE5PVEVCT09LX1dFQlZJRVdfQk9VTkRBUlkgfSBmcm9tICcuL3ZpZXcvbm90ZWJvb2tDZWxsTGlzdC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsTGlzdCB9IGZyb20gJy4vdmlldy9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBCYWNrTGF5ZXJXZWJWaWV3IH0gZnJvbSAnLi92aWV3L3JlbmRlcmVycy9iYWNrTGF5ZXJXZWJWaWV3LmpzJztcbmltcG9ydCB7IENvZGVDZWxsUmVuZGVyZXIsIE1hcmt1cENlbGxSZW5kZXJlciwgTm90ZWJvb2tDZWxsTGlzdERlbGVnYXRlIH0gZnJvbSAnLi92aWV3L3JlbmRlcmVycy9jZWxsUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUFja091dHB1dEhlaWdodCwgSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbiB9IGZyb20gJy4vdmlldy9yZW5kZXJlcnMvd2Vidmlld01lc3NhZ2VzLmpzJztcbmltcG9ydCB7IENvZGVDZWxsVmlld01vZGVsLCBvdXRwdXREaXNwbGF5TGltaXQgfSBmcm9tICcuL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0V2ZW50RGlzcGF0Y2hlciB9IGZyb20gJy4vdmlld01vZGVsL2V2ZW50RGlzcGF0Y2hlci5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi92aWV3TW9kZWwvbWFya3VwQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsVmlld01vZGVsLCBOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4vdmlld01vZGVsL25vdGVib29rVmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yV29ya2JlbmNoVG9vbGJhciB9IGZyb20gJy4vdmlld1BhcnRzL25vdGVib29rRWRpdG9yVG9vbGJhci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi92aWV3UGFydHMvbm90ZWJvb2tFZGl0b3JXaWRnZXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va092ZXJ2aWV3UnVsZXIgfSBmcm9tICcuL3ZpZXdQYXJ0cy9ub3RlYm9va092ZXJ2aWV3UnVsZXIuanMnO1xuaW1wb3J0IHsgTGlzdFRvcENlbGxUb29sYmFyIH0gZnJvbSAnLi92aWV3UGFydHMvbm90ZWJvb2tUb3BDZWxsVG9vbGJhci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxLaW5kLCBJTm90ZWJvb2tGaW5kT3B0aW9ucywgTm90ZWJvb2tGaW5kU2NvcGVUeXBlLCBSRU5ERVJFUl9OT1RfQVZBSUxBQkxFLCBTZWxlY3Rpb25TdGF0ZVR5cGUgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfQ1VSU09SX05BVklHQVRJT05fTU9ERSwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQsIE5PVEVCT09LX09VVFBVVF9JTlBVVF9GT0NVU0VEIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPcHRpb25zLCBPdXRwdXRJbm5lckNvbnRhaW5lclRvcFBhZGRpbmcgfSBmcm9tICcuL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBjZWxsUmFuZ2VzVG9JbmRleGVzLCBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXZWJ2aWV3RWxlbWVudCB9IGZyb20gJy4uLy4uL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tQZXJmTWFya3MgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tQZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBCYXNlQ2VsbEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL3ZpZXdNb2RlbC9jZWxsRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBGbG9hdGluZ0VkaXRvckNsaWNrTWVudSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29kZWVkaXRvci5qcyc7XG5pbXBvcnQgeyBDZWxsRmluZE1hdGNoTW9kZWwgfSBmcm9tICcuL2NvbnRyaWIvZmluZC9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBEcm9wSW50b0VkaXRvckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9kcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ29weVBhc3RlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvcHlQYXN0ZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tTdGlja3lTY3JvbGwgfSBmcm9tICcuL3ZpZXdQYXJ0cy9ub3RlYm9va0VkaXRvclN0aWNreVNjcm9sbC5qcyc7XG5pbXBvcnQgeyBQaXhlbFJhdGlvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3BpeGVsUmF0aW8uanMnO1xuaW1wb3J0IHsgUHJldmVudERlZmF1bHRDb250ZXh0TWVudUl0ZW1zQ29udGV4dEtleU5hbWUgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuL25vdGVib29rQWNjZXNzaWJpbGl0eVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE5vdGVib29rSG9yaXpvbnRhbFRyYWNrZXIgfSBmcm9tICcuL3ZpZXdQYXJ0cy9ub3RlYm9va0hvcml6b250YWxUcmFja2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbEVkaXRvclBvb2wgfSBmcm9tICcuL3ZpZXcvbm90ZWJvb2tDZWxsRWRpdG9yUG9vbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvaW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbExheW91dE1hbmFnZXIgfSBmcm9tICcuL25vdGVib29rQ2VsbExheW91dE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgRmxvYXRpbmdFZGl0b3JUb29sYmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmxvYXRpbmdNZW51L2Jyb3dzZXIvZmxvYXRpbmdNZW51LmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVmYXVsdE5vdGVib29rQ3JlYXRpb25PcHRpb25zKCk6IElOb3RlYm9va0VkaXRvckNyZWF0aW9uT3B0aW9ucyB7XG5cdC8vIFdlIGlubGluZWQgdGhlIGlkIHRvIGF2b2lkIGxvYWRpbmcgY29tbWVudCBjb250cmliIGluIHRlc3RzXG5cdGNvbnN0IHNraXBDb250cmlidXRpb25zID0gW1xuXHRcdCdlZGl0b3IuY29udHJpYi5yZXZpZXcnLFxuXHRcdEZsb2F0aW5nRWRpdG9yQ2xpY2tNZW51LklELFxuXHRcdEZsb2F0aW5nRWRpdG9yVG9vbGJhci5JRCxcblx0XHQnZWRpdG9yLmNvbnRyaWIuZGlydHlkaWZmJyxcblx0XHQnZWRpdG9yLmNvbnRyaWIudGVzdGluZ091dHB1dFBlZWsnLFxuXHRcdCdlZGl0b3IuY29udHJpYi50ZXN0aW5nRGVjb3JhdGlvbnMnLFxuXHRcdCdzdG9yZS5jb250cmliLnN0aWNreVNjcm9sbENvbnRyb2xsZXInLFxuXHRcdCdlZGl0b3IuY29udHJpYi5maW5kQ29udHJvbGxlcicsXG5cdFx0J2VkaXRvci5jb250cmliLmVtcHR5VGV4dEVkaXRvckhpbnQnXG5cdF07XG5cdGNvbnN0IGNvbnRyaWJ1dGlvbnMgPSBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpLmZpbHRlcihjID0+IHNraXBDb250cmlidXRpb25zLmluZGV4T2YoYy5pZCkgPT09IC0xKTtcblxuXHRyZXR1cm4ge1xuXHRcdG1lbnVJZHM6IHtcblx0XHRcdG5vdGVib29rVG9vbGJhcjogTWVudUlkLk5vdGVib29rVG9vbGJhcixcblx0XHRcdGNlbGxUaXRsZVRvb2xiYXI6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdGNlbGxEZWxldGVUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsRGVsZXRlLFxuXHRcdFx0Y2VsbEluc2VydFRvb2xiYXI6IE1lbnVJZC5Ob3RlYm9va0NlbGxCZXR3ZWVuLFxuXHRcdFx0Y2VsbFRvcEluc2VydFRvb2xiYXI6IE1lbnVJZC5Ob3RlYm9va0NlbGxMaXN0VG9wLFxuXHRcdFx0Y2VsbEV4ZWN1dGVUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsRXhlY3V0ZSxcblx0XHRcdGNlbGxFeGVjdXRlUHJpbWFyeTogTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGVQcmltYXJ5LFxuXHRcdH0sXG5cdFx0Y2VsbEVkaXRvckNvbnRyaWJ1dGlvbnM6IGNvbnRyaWJ1dGlvbnNcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRWRpdG9yV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckRlbGVnYXRlLCBJTm90ZWJvb2tFZGl0b3Ige1xuXHQvLyNyZWdpb24gRXZlbnRpbmdcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDZWxsU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxOb3RlYm9va0NlbGxTdGF0ZUNoYW5nZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2VsbFN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VDZWxsU3RhdGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld0NlbGxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGVib29rVmlld0NlbGxzVXBkYXRlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdDZWxsczogRXZlbnQ8SU5vdGVib29rVmlld0NlbGxzVXBkYXRlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3Q2VsbHMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENoYW5nZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Tm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxDaGFuZ2VNb2RlbDogRXZlbnQ8Tm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQ+ID0gdGhpcy5fb25XaWxsQ2hhbmdlTW9kZWwuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWw6IEV2ZW50PE5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWwuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQXR0YWNoVmlld01vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQXR0YWNoVmlld01vZGVsOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQXR0YWNoVmlld01vZGVsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcHRpb25zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9ucy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZWNvcmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURlY29yYXRpb25zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2Nyb2xsOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxheW91dDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUxheW91dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVDZWxsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlQ2VsbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNlbGwuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2libGVSYW5nZXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNXaWRnZXQgPSB0aGlzLl9vbkRpZEZvY3VzRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEJsdXJXaWRnZXQgPSB0aGlzLl9vbkRpZEJsdXJFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHRoaXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUVkaXRvcjogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUVkaXRvci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVLZXJuZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVLZXJuZWw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVLZXJuZWwuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VVcDogRW1pdHRlcjxJTm90ZWJvb2tFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RlYm9va0VkaXRvck1vdXNlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbk1vdXNlVXA6IEV2ZW50PElOb3RlYm9va0VkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fb25Nb3VzZVVwLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlRG93bjogRW1pdHRlcjxJTm90ZWJvb2tFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RlYm9va0VkaXRvck1vdXNlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbk1vdXNlRG93bjogRXZlbnQ8SU5vdGVib29rRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbk1vdXNlRG93bi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RlYm9va1dlYnZpZXdNZXNzYWdlPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWNlaXZlTWVzc2FnZTogRXZlbnQ8SU5vdGVib29rV2Vidmlld01lc3NhZ2U+ID0gdGhpcy5fb25EaWRSZWNlaXZlTWVzc2FnZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5kZXJPdXRwdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2VsbE91dHB1dFZpZXdNb2RlbD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRSZW5kZXJPdXRwdXQgPSB0aGlzLl9vbkRpZFJlbmRlck91dHB1dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmVPdXRwdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2VsbE91dHB1dFZpZXdNb2RlbD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRSZW1vdmVPdXRwdXQgPSB0aGlzLl9vbkRpZFJlbW92ZU91dHB1dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXNpemVPdXRwdXRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNlbGxWaWV3TW9kZWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc2l6ZU91dHB1dCA9IHRoaXMuX29uRGlkUmVzaXplT3V0cHV0RW1pdHRlci5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblx0cHJpdmF0ZSBfb3ZlcmxheUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9vdmVybGF5TGF5b3V0ITogT3ZlcmxheUxheW91dEVsZW1lbnQ7XG5cdHByaXZhdGUgX25vdGVib29rVG9wVG9vbGJhckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va1RvcFRvb2xiYXIhOiBOb3RlYm9va0VkaXRvcldvcmtiZW5jaFRvb2xiYXI7XG5cdHByaXZhdGUgX25vdGVib29rU3RpY2t5U2Nyb2xsQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX25vdGVib29rU3RpY2t5U2Nyb2xsITogTm90ZWJvb2tTdGlja3lTY3JvbGw7XG5cdHByaXZhdGUgX25vdGVib29rT3ZlcnZpZXdSdWxlckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va092ZXJ2aWV3UnVsZXIhOiBOb3RlYm9va092ZXJ2aWV3UnVsZXI7XG5cdHByaXZhdGUgX2JvZHkhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc3R5bGVFbGVtZW50ITogSFRNTFN0eWxlRWxlbWVudDtcblx0cHJpdmF0ZSBfb3ZlcmZsb3dDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfd2VidmlldzogQmFja0xheWVyV2ViVmlldzxJQ29tbW9uQ2VsbEluZm8+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3dlYnZpZXdSZXNvbHZlUHJvbWlzZTogUHJvbWlzZTxCYWNrTGF5ZXJXZWJWaWV3PElDb21tb25DZWxsSW5mbz4gfCBudWxsPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF93ZWJ2aWV3VHJhbnNwYXJlbnRDb3ZlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfbGlzdERlbGVnYXRlOiBOb3RlYm9va0NlbGxMaXN0RGVsZWdhdGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfbGlzdCE6IElOb3RlYm9va0NlbGxMaXN0O1xuXHRwcml2YXRlIF9saXN0Vmlld0luZm9BY2Nlc3NvciE6IExpc3RWaWV3SW5mb0FjY2Vzc29yO1xuXHRwcml2YXRlIF9kbmRDb250cm9sbGVyOiBDZWxsRHJhZ0FuZERyb3BDb250cm9sbGVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2xpc3RUb3BDZWxsVG9vbGJhcjogTGlzdFRvcENlbGxUb29sYmFyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3JlbmRlcmVkRWRpdG9yczogTWFwPElDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvcj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgX2VkaXRvclBvb2whOiBOb3RlYm9va0NlbGxFZGl0b3JQb29sO1xuXHRwcml2YXRlIF92aWV3Q29udGV4dDogVmlld0NvbnRleHQ7XG5cdHByaXZhdGUgX25vdGVib29rVmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxTdG9yZTogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfbG9jYWxDZWxsU3RhdGVMaXN0ZW5lcnM6IERpc3Bvc2FibGVTdG9yZVtdID0gW107XG5cdHByaXZhdGUgX2ZvbnRJbmZvOiBGb250SW5mbyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGltZW5zaW9uPzogRE9NLkRpbWVuc2lvbjtcblx0cHJpdmF0ZSBfc2hhZG93RWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jZWxsTGF5b3V0TWFuYWdlcjogTm90ZWJvb2tDZWxsTGF5b3V0TWFuYWdlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX291dHB1dEZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yRWRpdGFibGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJzb3JOYXZNb2RlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0SW5wdXRGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByb3RlY3RlZCByZWFkb25seSBfY29udHJpYnV0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24+KCk7XG5cdHByaXZhdGUgX3Njcm9sbEJleW9uZExhc3RMaW5lOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnNldE1vZGlmeVF1ZXVlQnlPdXRwdXRJZCA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2NlbGxDb250ZXh0S2V5TWFuYWdlcjogQ2VsbENvbnRleHRLZXlNYW5hZ2VyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3V1aWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0cHJpdmF0ZSBfZm9jdXNUcmFja2VyITogRE9NLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgX3dlYnZpZXdGb2N1c2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzVmlzaWJsZSA9IGZhbHNlO1xuXHRnZXQgaXNWaXNpYmxlKCkge1xuXHRcdHJldHVybiB0aGlzLl9pc1Zpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Z2V0IGlzRGlzcG9zZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRGlzcG9zZWQ7XG5cdH1cblxuXHRzZXQgdmlld01vZGVsKG5ld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29uV2lsbENoYW5nZU1vZGVsLmZpcmUodGhpcy5fbm90ZWJvb2tWaWV3TW9kZWw/Lm5vdGVib29rRG9jdW1lbnQpO1xuXHRcdHRoaXMuX25vdGVib29rVmlld01vZGVsID0gbmV3TW9kZWw7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5maXJlKG5ld01vZGVsPy5ub3RlYm9va0RvY3VtZW50KTtcblx0fVxuXG5cdGdldCB2aWV3TW9kZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rVmlld01vZGVsO1xuXHR9XG5cblx0Z2V0IHRleHRNb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWw/Lm5vdGVib29rRG9jdW1lbnQ7XG5cdH1cblxuXHRnZXQgaXNSZWFkT25seSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWw/Lm9wdGlvbnMuaXNSZWFkT25seSA/PyBmYWxzZTtcblx0fVxuXG5cdGdldCBhY3RpdmVDb2RlRWRpdG9yKCk6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtmb2N1c2VkXSA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5nZXQoZm9jdXNlZCk7XG5cdH1cblxuXHRnZXQgYWN0aXZlQ2VsbEFuZENvZGVFZGl0b3IoKTogW0lDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvcl0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2ZvY3VzZWRdID0gdGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9yZW5kZXJlZEVkaXRvcnMuZ2V0KGZvY3VzZWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiBbZm9jdXNlZCwgZWRpdG9yXTtcblx0fVxuXG5cdGdldCBjb2RlRWRpdG9ycygpOiBbSUNlbGxWaWV3TW9kZWwsIElDb2RlRWRpdG9yXVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3JlbmRlcmVkRWRpdG9yc107XG5cdH1cblxuXHRnZXQgdmlzaWJsZVJhbmdlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdCA/ICh0aGlzLl9saXN0LnZpc2libGVSYW5nZXMgfHwgW10pIDogW107XG5cdH1cblxuXHRwcml2YXRlIF9iYXNlQ2VsbEVkaXRvck9wdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUJhc2VDZWxsRWRpdG9yT3B0aW9ucz4oKTtcblxuXHRyZWFkb25seSBpc1JlcGxIaXN0b3J5OiBib29sZWFuO1xuXHRwcml2YXRlIF9yZWFkT25seTogYm9vbGVhbjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va09wdGlvbnM6IE5vdGVib29rT3B0aW9ucztcblxuXHRwcml2YXRlIF9jdXJyZW50UHJvZ3Jlc3M6IElQcm9ncmVzc1J1bm5lciB8IHVuZGVmaW5lZDtcblxuXHRnZXQgbm90ZWJvb2tPcHRpb25zKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va09wdGlvbnM7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjcmVhdGlvbk9wdGlvbnM6IElOb3RlYm9va0VkaXRvckNyZWF0aW9uT3B0aW9ucyxcblx0XHRkaW1lbnNpb246IERPTS5EaW1lbnNpb24gfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nOiBJTm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvclNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRXhlY3V0aW9uU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBwcml2YXRlIGVkaXRvclByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2RpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblxuXHRcdHRoaXMuaXNSZXBsSGlzdG9yeSA9IGNyZWF0aW9uT3B0aW9ucy5pc1JlcGxIaXN0b3J5ID8/IGZhbHNlO1xuXHRcdHRoaXMuX3JlYWRPbmx5ID0gY3JlYXRpb25PcHRpb25zLmlzUmVhZE9ubHkgPz8gZmFsc2U7XG5cblx0XHR0aGlzLl9vdmVybGF5TGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE92ZXJsYXlMYXlvdXRFbGVtZW50KCkpO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIgPSB0aGlzLl9vdmVybGF5TGF5b3V0LmNvbnRlbnQ7XG5cdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLl9vdmVybGF5Q29udGFpbmVyKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdHRoaXMuX25vdGVib29rT3B0aW9ucyA9IGNyZWF0aW9uT3B0aW9ucy5vcHRpb25zID8/XG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3B0aW9ucywgdGhpcy5jcmVhdGlvbk9wdGlvbnM/LmNvZGVXaW5kb3cgPz8gbWFpbldpbmRvdywgdGhpcy5fcmVhZE9ubHksIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tPcHRpb25zKTtcblx0XHRjb25zdCBldmVudERpc3BhdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tFdmVudERpc3BhdGNoZXIoKSk7XG5cdFx0dGhpcy5fdmlld0NvbnRleHQgPSBuZXcgVmlld0NvbnRleHQoXG5cdFx0XHR0aGlzLl9ub3RlYm9va09wdGlvbnMsXG5cdFx0XHRldmVudERpc3BhdGNoZXIsXG5cdFx0XHRsYW5ndWFnZSA9PiB0aGlzLmdldEJhc2VDZWxsRWRpdG9yT3B0aW9ucyhsYW5ndWFnZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ZpZXdDb250ZXh0LmV2ZW50RGlzcGF0Y2hlci5vbkRpZENoYW5nZUxheW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxheW91dC5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ZpZXdDb250ZXh0LmV2ZW50RGlzcGF0Y2hlci5vbkRpZENoYW5nZUNlbGxTdGF0ZShlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2VsbFN0YXRlLmZpcmUoZSk7XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLl9yZWdpc3Rlcihfbm90ZWJvb2tTZXJ2aWNlLm9uRGlkQ2hhbmdlT3V0cHV0UmVuZGVyZXJzKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZU91dHB1dFJlbmRlcmVycygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tFZGl0b3JDb250ZXh0S2V5cywgdGhpcykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VsZWN0ZWROb3RlYm9va3MoZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlLm5vdGVib29rLCB0aGlzLnZpZXdNb2RlbD8udXJpKSkge1xuXHRcdFx0XHR0aGlzLl9sb2FkS2VybmVsUHJlbG9hZHMoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVLZXJuZWwuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3Njcm9sbEJleW9uZExhc3RMaW5lID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLnNjcm9sbEJleW9uZExhc3RMaW5lJyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3Iuc2Nyb2xsQmV5b25kTGFzdExpbmUnKSkge1xuXHRcdFx0XHR0aGlzLl9zY3JvbGxCZXlvbmRMYXN0TGluZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5zY3JvbGxCZXlvbmRMYXN0TGluZScpO1xuXHRcdFx0XHRpZiAodGhpcy5fZGltZW5zaW9uICYmIHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2RpbWVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va09wdGlvbnMub25EaWRDaGFuZ2VPcHRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuY2VsbFN0YXR1c0JhclZpc2liaWxpdHkgfHwgZS5jZWxsVG9vbGJhckxvY2F0aW9uIHx8IGUuY2VsbFRvb2xiYXJJbnRlcmFjdGlvbikge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVGb3JOb3RlYm9va0NvbmZpZ3VyYXRpb24oKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuZm9udEZhbWlseSkge1xuXHRcdFx0XHR0aGlzLl9nZW5lcmF0ZUZvbnRJbmZvKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmNvbXBhY3RWaWV3XG5cdFx0XHRcdHx8IGUuZm9jdXNJbmRpY2F0b3Jcblx0XHRcdFx0fHwgZS5pbnNlcnRUb29sYmFyUG9zaXRpb25cblx0XHRcdFx0fHwgZS5jZWxsVG9vbGJhckxvY2F0aW9uXG5cdFx0XHRcdHx8IGUuZHJhZ0FuZERyb3BFbmFibGVkXG5cdFx0XHRcdHx8IGUuZm9udFNpemVcblx0XHRcdFx0fHwgZS5tYXJrdXBGb250U2l6ZVxuXHRcdFx0XHR8fCBlLm1hcmtkb3duTGluZUhlaWdodFxuXHRcdFx0XHR8fCBlLmZvbnRGYW1pbHlcblx0XHRcdFx0fHwgZS5pbnNlcnRUb29sYmFyQWxpZ25tZW50XG5cdFx0XHRcdHx8IGUub3V0cHV0Rm9udFNpemVcblx0XHRcdFx0fHwgZS5vdXRwdXRMaW5lSGVpZ2h0XG5cdFx0XHRcdHx8IGUub3V0cHV0Rm9udEZhbWlseVxuXHRcdFx0XHR8fCBlLm91dHB1dFdvcmRXcmFwXG5cdFx0XHRcdHx8IGUub3V0cHV0U2Nyb2xsaW5nXG5cdFx0XHRcdHx8IGUub3V0cHV0TGlua2lmeUZpbGVQYXRoc1xuXHRcdFx0XHR8fCBlLm1pbmltYWxFcnJvclxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZUxheW91dFN0eWxlcygpO1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3Py51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHQuLi50aGlzLm5vdGVib29rT3B0aW9ucy5jb21wdXRlV2Vidmlld09wdGlvbnMoKSxcblx0XHRcdFx0XHRmb250RmFtaWx5OiB0aGlzLl9nZW5lcmF0ZUZvbnRGYW1pbHkoKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2RpbWVuc2lvbiAmJiB0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fZGltZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGlvbk9wdGlvbnMuY29kZVdpbmRvdyA/IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoY3JlYXRpb25PcHRpb25zLmNvZGVXaW5kb3cpIDogdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cblx0XHR0aGlzLm5vdGVib29rRWRpdG9yU2VydmljZS5hZGROb3RlYm9va0VkaXRvcih0aGlzKTtcblxuXHRcdGNvbnN0IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5pZCA9IGBub3RlYm9vay0ke2lkfWA7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc05hbWUgPSAnbm90ZWJvb2tPdmVybGF5Jztcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLWVkaXRvcicpO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuaW5lcnQgPSB0cnVlO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX292ZXJsYXlMYXlvdXQucm9vdCk7XG5cblx0XHR0aGlzLl9jcmVhdGVCb2R5KHRoaXMuX292ZXJsYXlDb250YWluZXIpO1xuXHRcdHRoaXMuX2dlbmVyYXRlRm9udEluZm8oKTtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMuX2VkaXRvckZvY3VzID0gTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX291dHB1dEZvY3VzID0gTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX291dHB1dElucHV0Rm9jdXMgPSBOT1RFQk9PS19PVVRQVVRfSU5QVVRfRk9DVVNFRC5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZWRpdG9yRWRpdGFibGUgPSBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N1cnNvck5hdk1vZGUgPSBOT1RFQk9PS19DVVJTT1JfTkFWSUdBVElPTl9NT0RFLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHQvLyBOZXZlciBkaXNwbGF5IHRoZSBuYXRpdmUgY3V0L2NvcHkgY29udGV4dCBtZW51IGl0ZW1zIGluIG5vdGVib29rc1xuXHRcdG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KFByZXZlbnREZWZhdWx0Q29udGV4dE1lbnVJdGVtc0NvbnRleHRLZXlOYW1lLCBmYWxzZSkuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblxuXHRcdHRoaXMuX2VkaXRvckVkaXRhYmxlLnNldCghY3JlYXRpb25PcHRpb25zLmlzUmVhZE9ubHkpO1xuXG5cdFx0bGV0IGNvbnRyaWJ1dGlvbnM6IElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodGhpcy5jcmVhdGlvbk9wdGlvbnMuY29udHJpYnV0aW9ucykpIHtcblx0XHRcdGNvbnRyaWJ1dGlvbnMgPSB0aGlzLmNyZWF0aW9uT3B0aW9ucy5jb250cmlidXRpb25zO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250cmlidXRpb25zID0gTm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgY29udHJpYnV0aW9ucykge1xuXHRcdFx0bGV0IGNvbnRyaWJ1dGlvbjogSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29udHJpYnV0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShkZXNjLmN0b3IsIHRoaXMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udHJpYnV0aW9uKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fY29udHJpYnV0aW9ucy5oYXMoZGVzYy5pZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9jb250cmlidXRpb25zLnNldChkZXNjLmlkLCBjb250cmlidXRpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBEVVBMSUNBVEUgbm90ZWJvb2sgZWRpdG9yIGNvbnRyaWJ1dGlvbjogJyR7ZGVzYy5pZH0nYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVGb3JOb3RlYm9va0NvbmZpZ3VyYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX2RlYnVnRmxhZzogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2RlYnVnKC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGlmICghdGhpcy5fZGVidWdGbGFnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bm90ZWJvb2tEZWJ1ZyguLi5hcmdzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFZGl0b3JJZFxuXHQgKi9cblx0cHVibGljIGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3V1aWQ7XG5cdH1cblxuXHRnZXRWaWV3TW9kZWwoKTogTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbDtcblx0fVxuXG5cdGdldExlbmd0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/Lmxlbmd0aCA/PyAwO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LmdldFNlbGVjdGlvbnMoKSA/PyBbeyBzdGFydDogMCwgZW5kOiAwIH1dO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBJQ2VsbFJhbmdlW10pIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLnZpZXdNb2RlbC5nZXRGb2N1cygpO1xuXHRcdHRoaXMudmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogZm9jdXMsXG5cdFx0XHRzZWxlY3Rpb25zOiBzZWxlY3Rpb25zXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRGb2N1cygpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LmdldEZvY3VzKCkgPz8geyBzdGFydDogMCwgZW5kOiAwIH07XG5cdH1cblxuXHRzZXRGb2N1cyhmb2N1czogSUNlbGxSYW5nZSkge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy52aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdHRoaXMudmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogZm9jdXMsXG5cdFx0XHRzZWxlY3Rpb25zOiBzZWxlY3Rpb25zXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRTZWxlY3Rpb25WaWV3TW9kZWxzKCk6IElDZWxsVmlld01vZGVsW10ge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsc1NldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsLmdldFNlbGVjdGlvbnMoKS5tYXAocmFuZ2UgPT4gdGhpcy52aWV3TW9kZWwhLnZpZXdDZWxscy5zbGljZShyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKSkucmVkdWNlKChhLCBiKSA9PiB7XG5cdFx0XHRiLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRcdGlmICghY2VsbHNTZXQuaGFzKGNlbGwuaGFuZGxlKSkge1xuXHRcdFx0XHRcdGNlbGxzU2V0LmFkZChjZWxsLmhhbmRsZSk7XG5cdFx0XHRcdFx0YS5wdXNoKGNlbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIGE7XG5cdFx0fSwgW10gYXMgSUNlbGxWaWV3TW9kZWxbXSk7XG5cdH1cblxuXHRoYXNNb2RlbCgpOiB0aGlzIGlzIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlIHtcblx0XHRyZXR1cm4gISF0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbDtcblx0fVxuXG5cdHNob3dQcm9ncmVzcygpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3MgPSB0aGlzLmVkaXRvclByb2dyZXNzU2VydmljZS5zaG93KHRydWUpO1xuXHR9XG5cblx0aGlkZVByb2dyZXNzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRQcm9ncmVzcy5kb25lKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3MgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIEVkaXRvciBDb3JlXG5cblx0Z2V0QmFzZUNlbGxFZGl0b3JPcHRpb25zKGxhbmd1YWdlOiBzdHJpbmcpOiBJQmFzZUNlbGxFZGl0b3JPcHRpb25zIHtcblx0XHRjb25zdCBleGlzdGluZ09wdGlvbnMgPSB0aGlzLl9iYXNlQ2VsbEVkaXRvck9wdGlvbnMuZ2V0KGxhbmd1YWdlKTtcblxuXHRcdGlmIChleGlzdGluZ09wdGlvbnMpIHtcblx0XHRcdHJldHVybiBleGlzdGluZ09wdGlvbnM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBuZXcgQmFzZUNlbGxFZGl0b3JPcHRpb25zKHRoaXMsIHRoaXMubm90ZWJvb2tPcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZSk7XG5cdFx0XHR0aGlzLl9iYXNlQ2VsbEVkaXRvck9wdGlvbnMuc2V0KGxhbmd1YWdlLCBvcHRpb25zKTtcblx0XHRcdHJldHVybiBvcHRpb25zO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZvck5vdGVib29rQ29uZmlndXJhdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuX292ZXJsYXlDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NlbGwtdGl0bGUtdG9vbGJhci1sZWZ0Jyk7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjZWxsLXRpdGxlLXRvb2xiYXItcmlnaHQnKTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NlbGwtdGl0bGUtdG9vbGJhci1oaWRkZW4nKTtcblx0XHRjb25zdCBjZWxsVG9vbGJhckxvY2F0aW9uID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmNvbXB1dGVDZWxsVG9vbGJhckxvY2F0aW9uKHRoaXMudmlld01vZGVsPy52aWV3VHlwZSk7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGBjZWxsLXRpdGxlLXRvb2xiYXItJHtjZWxsVG9vbGJhckxvY2F0aW9ufWApO1xuXG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbiA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLmNlbGxUb29sYmFySW50ZXJhY3Rpb247XG5cdFx0bGV0IGNlbGxUb29sYmFySW50ZXJhY3Rpb25TdGF0ZSA9ICdob3Zlcic7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjZWxsLXRvb2xiYXItaG92ZXInKTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NlbGwtdG9vbGJhci1jbGljaycpO1xuXG5cdFx0aWYgKGNlbGxUb29sYmFySW50ZXJhY3Rpb24gPT09ICdob3ZlcicgfHwgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbiA9PT0gJ2NsaWNrJykge1xuXHRcdFx0Y2VsbFRvb2xiYXJJbnRlcmFjdGlvblN0YXRlID0gY2VsbFRvb2xiYXJJbnRlcmFjdGlvbjtcblx0XHR9XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGBjZWxsLXRvb2xiYXItJHtjZWxsVG9vbGJhckludGVyYWN0aW9uU3RhdGV9YCk7XG5cblx0fVxuXG5cdHByaXZhdGUgX2dlbmVyYXRlRm9udEluZm8oKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InKTtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9mb250SW5mbyA9IEZvbnRNZWFzdXJlbWVudHMucmVhZEZvbnRJbmZvKHRhcmdldFdpbmRvdywgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzKGVkaXRvck9wdGlvbnMsIFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UodGFyZ2V0V2luZG93KS52YWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQm9keShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLXRvb2xiYXItY29udGFpbmVyJyk7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0RE9NLmFwcGVuZChwYXJlbnQsIHRoaXMuX25vdGVib29rVG9wVG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbENvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX25vdGVib29rU3RpY2t5U2Nyb2xsQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLXN0aWNreS1zY3JvbGwtY29udGFpbmVyJyk7XG5cdFx0RE9NLmFwcGVuZChwYXJlbnQsIHRoaXMuX25vdGVib29rU3RpY2t5U2Nyb2xsQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2JvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRET00uYXBwZW5kKHBhcmVudCwgdGhpcy5fYm9keSk7XG5cblx0XHR0aGlzLl9ib2R5LmNsYXNzTGlzdC5hZGQoJ2NlbGwtbGlzdC1jb250YWluZXInKTtcblx0XHR0aGlzLl9jcmVhdGVMYXlvdXRTdHlsZXMoKTtcblx0XHR0aGlzLl9jcmVhdGVDZWxsTGlzdCgpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tPdmVydmlld1J1bGVyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fbm90ZWJvb2tPdmVydmlld1J1bGVyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLW92ZXJ2aWV3LXJ1bGVyLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX2xpc3Quc2Nyb2xsYWJsZUVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fbm90ZWJvb2tPdmVydmlld1J1bGVyQ29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlck5vdGVib29rT3ZlcnZpZXdSdWxlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0hvcml6b250YWxUcmFja2VyLCB0aGlzLCB0aGlzLl9saXN0LnNjcm9sbGFibGVFbGVtZW50KSk7XG5cblx0XHR0aGlzLl9vdmVyZmxvd0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX292ZXJmbG93Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLW92ZXJmbG93LXdpZGdldC1jb250YWluZXInLCAnbW9uYWNvLWVkaXRvcicpO1xuXHRcdERPTS5hcHBlbmQocGFyZW50LCB0aGlzLl9vdmVyZmxvd0NvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZUZvbnRGYW1pbHkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvbnRJbmZvPy5mb250RmFtaWx5ID8/IGBcIlNGIE1vbm9cIiwgTW9uYWNvLCBNZW5sbywgQ29uc29sYXMsIFwiVWJ1bnR1IE1vbm9cIiwgXCJMaWJlcmF0aW9uIE1vbm9cIiwgXCJEZWphVnUgU2FucyBNb25vXCIsIFwiQ291cmllciBOZXdcIiwgbW9ub3NwYWNlYDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUxheW91dFN0eWxlcygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0cy5jcmVhdGVTdHlsZVNoZWV0KHRoaXMuX2JvZHkpO1xuXHRcdGNvbnN0IHtcblx0XHRcdGNlbGxSaWdodE1hcmdpbixcblx0XHRcdGNlbGxUb3BNYXJnaW4sXG5cdFx0XHRjZWxsUnVuR3V0dGVyLFxuXHRcdFx0Y2VsbEJvdHRvbU1hcmdpbixcblx0XHRcdGNvZGVDZWxsTGVmdE1hcmdpbixcblx0XHRcdG1hcmtkb3duQ2VsbEd1dHRlcixcblx0XHRcdG1hcmtkb3duQ2VsbExlZnRNYXJnaW4sXG5cdFx0XHRtYXJrZG93bkNlbGxCb3R0b21NYXJnaW4sXG5cdFx0XHRtYXJrZG93bkNlbGxUb3BNYXJnaW4sXG5cdFx0XHRjb2xsYXBzZWRJbmRpY2F0b3JIZWlnaHQsXG5cdFx0XHRmb2N1c0luZGljYXRvcixcblx0XHRcdGluc2VydFRvb2xiYXJQb3NpdGlvbixcblx0XHRcdG91dHB1dEZvbnRTaXplLFxuXHRcdFx0Zm9jdXNJbmRpY2F0b3JMZWZ0TWFyZ2luLFxuXHRcdFx0Zm9jdXNJbmRpY2F0b3JHYXBcblx0XHR9ID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKTtcblxuXHRcdGNvbnN0IHtcblx0XHRcdGluc2VydFRvb2xiYXJBbGlnbm1lbnQsXG5cdFx0XHRjb21wYWN0Vmlldyxcblx0XHRcdGZvbnRTaXplXG5cdFx0fSA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpO1xuXG5cdFx0Y29uc3QgZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4oKTtcblxuXHRcdGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCwgYm90dG9tVG9vbGJhckhlaWdodCB9ID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh0aGlzLnZpZXdNb2RlbD8udmlld1R5cGUpO1xuXG5cdFx0Y29uc3Qgc3R5bGVTaGVldHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKCF0aGlzLl9mb250SW5mbykge1xuXHRcdFx0dGhpcy5fZ2VuZXJhdGVGb250SW5mbygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSB0aGlzLl9nZW5lcmF0ZUZvbnRGYW1pbHkoKTtcblxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdC5ub3RlYm9vay1lZGl0b3Ige1xuXHRcdFx0LS1ub3RlYm9vay1jZWxsLW91dHB1dC1mb250LXNpemU6ICR7b3V0cHV0Rm9udFNpemV9cHg7XG5cdFx0XHQtLW5vdGVib29rLWNlbGwtaW5wdXQtcHJldmlldy1mb250LXNpemU6ICR7Zm9udFNpemV9cHg7XG5cdFx0XHQtLW5vdGVib29rLWNlbGwtaW5wdXQtcHJldmlldy1mb250LWZhbWlseTogJHtmb250RmFtaWx5fTtcblx0XHR9XG5cdFx0YCk7XG5cblx0XHRpZiAoY29tcGFjdFZpZXcpIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1hcmtkb3duLWNlbGwtcm93IGRpdi5jZWxsLmNvZGUgeyBtYXJnaW4tbGVmdDogJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tYXJrZG93bi1jZWxsLXJvdyBkaXYuY2VsbC5jb2RlIHsgbWFyZ2luLWxlZnQ6ICR7Y29kZUNlbGxMZWZ0TWFyZ2lufXB4OyB9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gZm9jdXMgaW5kaWNhdG9yXG5cdFx0aWYgKGZvY3VzSW5kaWNhdG9yID09PSAnYm9yZGVyJykge1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci10b3A6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItYm90dG9tOmJlZm9yZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tYXJrZG93bi1jZWxsLXJvdyAuY2VsbC1pbm5lci1jb250YWluZXI6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1hcmtkb3duLWNlbGwtcm93IC5jZWxsLWlubmVyLWNvbnRhaW5lcjphZnRlciB7XG5cdFx0XHRcdGNvbnRlbnQ6IFwiXCI7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0d2lkdGg6IDEwMCU7XG5cdFx0XHRcdGhlaWdodDogMXB4O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0OmJlZm9yZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXJpZ2h0OmJlZm9yZSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFwiXCI7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0d2lkdGg6IDFweDtcblx0XHRcdFx0aGVpZ2h0OiAxMDAlO1xuXHRcdFx0XHR6LWluZGV4OiAxMDtcblx0XHRcdH1cblxuXHRcdFx0LyogdG9wIGJvcmRlciAqL1xuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItdG9wOmJlZm9yZSB7XG5cdFx0XHRcdGJvcmRlci10b3A6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcblx0XHRcdH1cblxuXHRcdFx0LyogbGVmdCBib3JkZXIgKi9cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQ6YmVmb3JlIHtcblx0XHRcdFx0Ym9yZGVyLWxlZnQ6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcblx0XHRcdH1cblxuXHRcdFx0LyogYm90dG9tIGJvcmRlciAqL1xuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItYm90dG9tOmJlZm9yZSB7XG5cdFx0XHRcdGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcblx0XHRcdH1cblxuXHRcdFx0LyogcmlnaHQgYm9yZGVyICovXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1yaWdodDpiZWZvcmUge1xuXHRcdFx0XHRib3JkZXItcmlnaHQ6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcblx0XHRcdH1cblx0XHRcdGApO1xuXG5cdFx0XHQvLyBsZWZ0IGFuZCByaWdodCBib3JkZXIgbWFyZ2luc1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmNvZGUtY2VsbC1yb3cuZm9jdXNlZCAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdDpiZWZvcmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmNvZGUtY2VsbC1yb3cuZm9jdXNlZCAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItcmlnaHQ6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3Quc2VsZWN0aW9uLW11bHRpcGxlIC5tb25hY28tbGlzdC1yb3cuY29kZS1jZWxsLXJvdy5zZWxlY3RlZCAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdDpiZWZvcmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdC5zZWxlY3Rpb24tbXVsdGlwbGUgLm1vbmFjby1saXN0LXJvdy5jb2RlLWNlbGwtcm93LnNlbGVjdGVkIC5jZWxsLWZvY3VzLWluZGljYXRvci1yaWdodDpiZWZvcmUge1xuXHRcdFx0XHR0b3A6IC0ke2NlbGxUb3BNYXJnaW59cHg7IGhlaWdodDogY2FsYygxMDAlICsgJHtjZWxsVG9wTWFyZ2luICsgY2VsbEJvdHRvbU1hcmdpbn1weClcblx0XHRcdH1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdGJvcmRlci1sZWZ0OiAzcHggc29saWQgdHJhbnNwYXJlbnQ7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IDRweDtcblx0XHRcdFx0d2lkdGg6IDBweDtcblx0XHRcdFx0bWFyZ2luLWxlZnQ6ICR7Zm9jdXNJbmRpY2F0b3JMZWZ0TWFyZ2lufXB4O1xuXHRcdFx0XHRib3JkZXItY29sb3I6IHZhcigtLXZzY29kZS1ub3RlYm9vay1pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyKSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQgLmNvZGVPdXRwdXQtZm9jdXMtaW5kaWNhdG9yLWNvbnRhaW5lcixcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtb3V0cHV0LWhvdmVyIC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvci1jb250YWluZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5tYXJrZG93bi1jZWxsLWhvdmVyIC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvci1jb250YWluZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93OmhvdmVyIC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvci1jb250YWluZXIge1xuXHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3ItY29udGFpbmVyOmhvdmVyIC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdGJvcmRlci1sZWZ0OiA1cHggc29saWQgdHJhbnNwYXJlbnQ7XG5cdFx0XHRcdG1hcmdpbi1sZWZ0OiAke2ZvY3VzSW5kaWNhdG9yTGVmdE1hcmdpbiAtIDF9cHg7XG5cdFx0XHR9XG5cdFx0XHRgKTtcblxuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgLmNlbGwtaW5uZXItY29udGFpbmVyLmNlbGwtb3V0cHV0LWZvY3VzIC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvcixcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0OmZvY3VzLXdpdGhpbiAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgLmNlbGwtaW5uZXItY29udGFpbmVyIC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLW5vdGVib29rLWZvY3VzZWRDZWxsQm9yZGVyKSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWlubmVyLWNvbnRhaW5lciAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAub3V0cHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdG1hcmdpbi10b3A6ICR7Zm9jdXNJbmRpY2F0b3JHYXB9cHg7XG5cdFx0XHR9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHQvLyBiZXR3ZWVuIGNlbGwgaW5zZXJ0IHRvb2xiYXJcblx0XHRpZiAoaW5zZXJ0VG9vbGJhclBvc2l0aW9uID09PSAnYmV0d2VlbkNlbGxzJyB8fCBpbnNlcnRUb29sYmFyUG9zaXRpb24gPT09ICdib3RoJykge1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyIHsgZGlzcGxheTogZmxleDsgfWApO1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC52aWV3LXpvbmVzIC5jZWxsLWxpc3QtdG9wLWNlbGwtdG9vbGJhci1jb250YWluZXIgeyBkaXNwbGF5OiBmbGV4OyB9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lciB7IGRpc3BsYXk6IG5vbmU7IH1gKTtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAudmlldy16b25lcyAuY2VsbC1saXN0LXRvcC1jZWxsLXRvb2xiYXItY29udGFpbmVyIHsgZGlzcGxheTogbm9uZTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChpbnNlcnRUb29sYmFyQWxpZ25tZW50ID09PSAnbGVmdCcpIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LXRvcC1jZWxsLXRvb2xiYXItY29udGFpbmVyIC5hY3Rpb24taXRlbTpmaXJzdC1jaGlsZCxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciAuYWN0aW9uLWl0ZW06Zmlyc3QtY2hpbGQsIC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lciAuYWN0aW9uLWl0ZW06Zmlyc3QtY2hpbGQge1xuXHRcdFx0XHRtYXJnaW4tcmlnaHQ6IDBweCAhaW1wb3J0YW50O1xuXHRcdFx0fWApO1xuXG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciAubW9uYWNvLXRvb2xiYXIgLmFjdGlvbi1sYWJlbCxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciAubW9uYWNvLXRvb2xiYXIgLmFjdGlvbi1sYWJlbCwgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyIC5tb25hY28tdG9vbGJhciAuYWN0aW9uLWxhYmVsIHtcblx0XHRcdFx0cGFkZGluZzogMHB4ICFpbXBvcnRhbnQ7XG5cdFx0XHRcdGp1c3RpZnktY29udGVudDogY2VudGVyO1xuXHRcdFx0XHRib3JkZXItcmFkaXVzOiA0cHg7XG5cdFx0XHR9YCk7XG5cblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LXRvcC1jZWxsLXRvb2xiYXItY29udGFpbmVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LXRvcC1jZWxsLXRvb2xiYXItY29udGFpbmVyLCAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdyAuY2VsbC1ib3R0b20tdG9vbGJhci1jb250YWluZXIge1xuXHRcdFx0XHRhbGlnbi1pdGVtczogZmxleC1zdGFydDtcblx0XHRcdFx0anVzdGlmeS1jb250ZW50OiBsZWZ0O1xuXHRcdFx0XHRtYXJnaW46IDAgMTZweCAwICR7OCArIGNvZGVDZWxsTGVmdE1hcmdpbn1weDtcblx0XHRcdH1gKTtcblxuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtdG9wLWNlbGwtdG9vbGJhci1jb250YWluZXIsXG5cdFx0XHQubm90ZWJvb2tPdmVybGF5IC5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lciAuYWN0aW9uLWl0ZW0ge1xuXHRcdFx0XHRib3JkZXI6IDBweDtcblx0XHRcdH1gKTtcblx0XHR9XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5jb2RlLWNlbGwtcm93IGRpdi5jZWxsLmNvZGUgeyBtYXJnaW4tbGVmdDogJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdC8vIENoYXQgRWRpdCwgZGVsZXRlZCBDZWxsIE92ZXJsYXlcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC52aWV3LXpvbmVzIC5jb2RlLWNlbGwtcm93IGRpdi5jZWxsLmNvZGUgeyBtYXJnaW4tbGVmdDogJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdC8vIENoYXQgRWRpdCwgZGVsZXRlZCBDZWxsIE92ZXJsYXlcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC52aWV3LXpvbmVzIC5jb2RlLWNlbGwtcm93IGRpdi5jZWxsIHsgbWFyZ2luLXJpZ2h0OiAke2NlbGxSaWdodE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdyBkaXYuY2VsbCB7IG1hcmdpbi1yaWdodDogJHtjZWxsUmlnaHRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgPiAuY2VsbC1pbm5lci1jb250YWluZXIgeyBwYWRkaW5nLXRvcDogJHtjZWxsVG9wTWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubWFya2Rvd24tY2VsbC1yb3cgPiAuY2VsbC1pbm5lci1jb250YWluZXIgeyBwYWRkaW5nLWJvdHRvbTogJHttYXJrZG93bkNlbGxCb3R0b21NYXJnaW59cHg7IHBhZGRpbmctdG9wOiAke21hcmtkb3duQ2VsbFRvcE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1hcmtkb3duLWNlbGwtcm93ID4gLmNlbGwtaW5uZXItY29udGFpbmVyLndlYnZpZXctYmFja2VkLW1hcmtkb3duLWNlbGwgeyBwYWRkaW5nOiAwOyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubWFya2Rvd24tY2VsbC1yb3cgPiAud2Vidmlldy1iYWNrZWQtbWFya2Rvd24tY2VsbC5tYXJrZG93bi1jZWxsLWVkaXQtbW9kZSAuY2VsbC5jb2RlIHsgcGFkZGluZy1ib3R0b206ICR7bWFya2Rvd25DZWxsQm90dG9tTWFyZ2lufXB4OyBwYWRkaW5nLXRvcDogJHttYXJrZG93bkNlbGxUb3BNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5vdXRwdXQgeyBtYXJnaW46IDBweCAke2NlbGxSaWdodE1hcmdpbn1weCAwcHggJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm91dHB1dCB7IHdpZHRoOiBjYWxjKDEwMCUgLSAke2dldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luICsgY2VsbFJpZ2h0TWFyZ2lufXB4KTsgfWApO1xuXG5cdFx0Ly8gY29tbWVudFxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdyAuY2VsbC1jb21tZW50LWNvbnRhaW5lciB7IGxlZnQ6ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtY29tbWVudC1jb250YWluZXIgeyB3aWR0aDogY2FsYygxMDAlIC0gJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbiArIGNlbGxSaWdodE1hcmdpbn1weCk7IH1gKTtcblxuXHRcdC8vIG91dHB1dCBjb2xsYXBzZSBidXR0b25cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5vdXRwdXQgLm91dHB1dC1jb2xsYXBzZS1jb250YWluZXIgLmV4cGFuZEJ1dHRvbiB7IGxlZnQ6IC0ke2NlbGxSdW5HdXR0ZXJ9cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5vdXRwdXQgLm91dHB1dC1jb2xsYXBzZS1jb250YWluZXIgLmV4cGFuZEJ1dHRvbiB7XG5cdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7XG5cdFx0XHR3aWR0aDogJHtjZWxsUnVuR3V0dGVyfXB4O1xuXHRcdFx0cGFkZGluZzogNnB4IDBweDtcblx0XHR9YCk7XG5cblx0XHQvLyBzaG93IG1vcmUgY29udGFpbmVyXG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAub3V0cHV0LXNob3ctbW9yZS1jb250YWluZXIgeyBtYXJnaW46IDBweCAke2NlbGxSaWdodE1hcmdpbn1weCAwcHggJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm91dHB1dC1zaG93LW1vcmUtY29udGFpbmVyIHsgd2lkdGg6IGNhbGMoMTAwJSAtICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4gKyBjZWxsUmlnaHRNYXJnaW59cHgpOyB9YCk7XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgZGl2LmNlbGwubWFya2Rvd24geyBwYWRkaW5nLWxlZnQ6ICR7Y2VsbFJ1bkd1dHRlcn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciAubm90ZWJvb2stZm9sZGluZy1pbmRpY2F0b3IgeyBsZWZ0OiAkeyhtYXJrZG93bkNlbGxHdXR0ZXIgLSAyMCkgLyAyICsgbWFya2Rvd25DZWxsTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciAubm90ZWJvb2stZm9sZGVkLWhpbnQgeyBsZWZ0OiAke21hcmtkb3duQ2VsbEd1dHRlciArIG1hcmtkb3duQ2VsbExlZnRNYXJnaW4gKyA4fXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyA6bm90KC53ZWJ2aWV3LWJhY2tlZC1tYXJrZG93bi1jZWxsKSAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItdG9wIHsgaGVpZ2h0OiAke2NlbGxUb3BNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1zaWRlIHsgYm90dG9tOiAke2JvdHRvbVRvb2xiYXJHYXB9cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmNvZGUtY2VsbC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQgeyB3aWR0aDogJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cubWFya2Rvd24tY2VsbC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQgeyB3aWR0aDogJHtjb2RlQ2VsbExlZnRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci5jZWxsLWZvY3VzLWluZGljYXRvci1yaWdodCB7IHdpZHRoOiAke2NlbGxSaWdodE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWJvdHRvbSB7IGhlaWdodDogJHtjZWxsQm90dG9tTWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1zaGFkb3ctY29udGFpbmVyLWJvdHRvbSB7IHRvcDogJHtjZWxsQm90dG9tTWFyZ2lufXB4OyB9YCk7XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0LnNlbGVjdGlvbi1tdWx0aXBsZSAubW9uYWNvLWxpc3Qtcm93OmhhcygrIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQpIC5jZWxsLWZvY3VzLWluZGljYXRvci1ib3R0b20ge1xuXHRcdFx0XHRoZWlnaHQ6ICR7Ym90dG9tVG9vbGJhckdhcCArIGNlbGxCb3R0b21NYXJnaW59cHg7XG5cdFx0XHR9XG5cdFx0YCk7XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cuY29kZS1jZWxsLXJvdy5uYi1tdWx0aUNlbGxIaWdobGlnaHQ6aGFzKCsgLm1vbmFjby1saXN0LXJvdy5uYi1tdWx0aUNlbGxIaWdobGlnaHQpIC5jZWxsLWZvY3VzLWluZGljYXRvci1ib3R0b20ge1xuXHRcdFx0XHRoZWlnaHQ6ICR7Ym90dG9tVG9vbGJhckdhcCArIGNlbGxCb3R0b21NYXJnaW59cHg7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1ub3RlYm9vay1zeW1ib2xIaWdobGlnaHRCYWNrZ3JvdW5kKSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXG5cdFx0XHQubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Lm1hcmtkb3duLWNlbGwtcm93Lm5iLW11bHRpQ2VsbEhpZ2hsaWdodDpoYXMoKyAubW9uYWNvLWxpc3Qtcm93Lm5iLW11bHRpQ2VsbEhpZ2hsaWdodCkgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWJvdHRvbSB7XG5cdFx0XHRcdGhlaWdodDogJHtib3R0b21Ub29sYmFyR2FwICsgY2VsbEJvdHRvbU1hcmdpbiAtIDZ9cHg7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1ub3RlYm9vay1zeW1ib2xIaWdobGlnaHRCYWNrZ3JvdW5kKSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdGApO1xuXG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5pbnB1dC1jb2xsYXBzZS1jb250YWluZXIgLmNlbGwtY29sbGFwc2UtcHJldmlldyB7XG5cdFx0XHRcdGxpbmUtaGVpZ2h0OiAke2NvbGxhcHNlZEluZGljYXRvckhlaWdodH1weDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmlucHV0LWNvbGxhcHNlLWNvbnRhaW5lciAuY2VsbC1jb2xsYXBzZS1wcmV2aWV3IC5tb25hY28tdG9rZW5pemVkLXNvdXJjZSB7XG5cdFx0XHRcdG1heC1oZWlnaHQ6ICR7Y29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0fXB4O1xuXHRcdFx0fVxuXHRcdGApO1xuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyIC5tb25hY28tdG9vbGJhciB7IGhlaWdodDogJHtib3R0b21Ub29sYmFySGVpZ2h0fXB4IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLnZpZXctem9uZXMgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciAubW9uYWNvLXRvb2xiYXIgeyBoZWlnaHQ6ICR7Ym90dG9tVG9vbGJhckhlaWdodH1weCB9YCk7XG5cblx0XHQvLyBjZWxsIHRvb2xiYXJcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5LmNlbGwtdGl0bGUtdG9vbGJhci1yaWdodCA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtdGl0bGUtdG9vbGJhciB7XG5cdFx0XHRyaWdodDogJHtjZWxsUmlnaHRNYXJnaW4gKyAyNn1weDtcblx0XHR9XG5cdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheS5jZWxsLXRpdGxlLXRvb2xiYXItbGVmdCA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtdGl0bGUtdG9vbGJhciB7XG5cdFx0XHRsZWZ0OiAke2dldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luICsgMTZ9cHg7XG5cdFx0fVxuXHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkuY2VsbC10aXRsZS10b29sYmFyLWhpZGRlbiA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtdGl0bGUtdG9vbGJhciB7XG5cdFx0XHRkaXNwbGF5OiBub25lO1xuXHRcdH1gKTtcblxuXHRcdC8vIGNlbGwgb3V0cHV0IGlubmVydCBjb250YWluZXJcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5vdXRwdXQgPiBkaXYuZm9yZWdyb3VuZC5vdXRwdXQtaW5uZXItY29udGFpbmVyIHtcblx0XHRcdHBhZGRpbmc6ICR7T3V0cHV0SW5uZXJDb250YWluZXJUb3BQYWRkaW5nfXB4IDhweDtcblx0XHR9XG5cdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLm91dHB1dC1jb2xsYXBzZS1jb250YWluZXIge1xuXHRcdFx0cGFkZGluZzogJHtPdXRwdXRJbm5lckNvbnRhaW5lclRvcFBhZGRpbmd9cHggOHB4O1xuXHRcdH1cblx0XHRgKTtcblxuXHRcdC8vIGNoYXRcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWNoYXQtcGFydCB7XG5cdFx0XHRtYXJnaW46IDAgJHtjZWxsUmlnaHRNYXJnaW59cHggNnB4IDRweDtcblx0XHR9XG5cdFx0YCk7XG5cblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBzdHlsZVNoZWV0cy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNlbGxMaXN0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuY2xhc3NMaXN0LmFkZCgnY2VsbC1saXN0LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX2RuZENvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlcih0aGlzLCB0aGlzLl9ib2R5KSk7XG5cdFx0Y29uc3QgZ2V0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4gdGhpcy5fbGlzdC5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKTtcblx0XHR0aGlzLl9lZGl0b3JQb29sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0NlbGxFZGl0b3JQb29sLCB0aGlzLCBnZXRTY29wZWRDb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVycyA9IFtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUNlbGxSZW5kZXJlciwgdGhpcywgdGhpcy5fcmVuZGVyZWRFZGl0b3JzLCB0aGlzLl9lZGl0b3JQb29sLCB0aGlzLl9kbmRDb250cm9sbGVyLCBnZXRTY29wZWRDb250ZXh0S2V5U2VydmljZSksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmt1cENlbGxSZW5kZXJlciwgdGhpcywgdGhpcy5fZG5kQ29udHJvbGxlciwgdGhpcy5fcmVuZGVyZWRFZGl0b3JzLCBnZXRTY29wZWRDb250ZXh0S2V5U2VydmljZSksXG5cdFx0XTtcblxuXHRcdHJlbmRlcmVycy5mb3JFYWNoKHJlbmRlcmVyID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlbmRlcmVyKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2xpc3REZWxlZ2F0ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tDZWxsTGlzdERlbGVnYXRlLCBET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdERlbGVnYXRlKTtcblxuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsICgpID0+IHRoaXMudmlld01vZGVsLCB0aGlzLmlzUmVwbEhpc3RvcnkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjY2Vzc2liaWxpdHlQcm92aWRlcik7XG5cblx0XHR0aGlzLl9saXN0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE5vdGVib29rQ2VsbExpc3QsXG5cdFx0XHQnTm90ZWJvb2tDZWxsTGlzdCcsXG5cdFx0XHR0aGlzLl9ib2R5LFxuXHRcdFx0dGhpcy5fdmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLFxuXHRcdFx0dGhpcy5fbGlzdERlbGVnYXRlLFxuXHRcdFx0cmVuZGVyZXJzLFxuXHRcdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0hlaWdodDogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogdHJ1ZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdG1vdXNlU3VwcG9ydDogdHJ1ZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0cnVlLFxuXHRcdFx0XHRzZWxlY3Rpb25OYXZpZ2F0aW9uOiB0cnVlLFxuXHRcdFx0XHR0eXBlTmF2aWdhdGlvbkVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHBhZGRpbmdUb3A6IDAsXG5cdFx0XHRcdHBhZGRpbmdCb3R0b206IDAsXG5cdFx0XHRcdHRyYW5zZm9ybU9wdGltaXphdGlvbjogZmFsc2UsIC8vKGlzTWFjaW50b3NoICYmIGlzTmF0aXZlKSB8fCBnZXRUaXRsZUJhclN0eWxlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKSA9PT0gJ25hdGl2ZScsXG5cdFx0XHRcdGluaXRpYWxTaXplOiB0aGlzLl9kaW1lbnNpb24sXG5cdFx0XHRcdHN0eWxlQ29udHJvbGxlcjogKF9zdWZmaXg6IHN0cmluZykgPT4geyByZXR1cm4gdGhpcy5fbGlzdDsgfSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0XHRsaXN0QmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBub3RlYm9va0VkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzQmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0ZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEhvdmVyRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0XHRcdFx0XHRsaXN0SG92ZXJCYWNrZ3JvdW5kOiBub3RlYm9va0VkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEhvdmVyT3V0bGluZTogZm9jdXNCb3JkZXIsXG5cdFx0XHRcdFx0bGlzdEZvY3VzT3V0bGluZTogZm9jdXNCb3JkZXIsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBub3RlYm9va0VkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lOiBub3RlYm9va0VkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlclxuXHRcdFx0fSxcblx0XHQpO1xuXHRcdHRoaXMuX2NlbGxMYXlvdXRNYW5hZ2VyID0gbmV3IE5vdGVib29rQ2VsbExheW91dE1hbmFnZXIodGhpcywgdGhpcy5fbGlzdCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9kbmRDb250cm9sbGVyLnNldExpc3QodGhpcy5fbGlzdCk7XG5cblx0XHQvLyBjcmVhdGUgV2Vidmlld1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdCk7XG5cdFx0dGhpcy5fbGlzdFZpZXdJbmZvQWNjZXNzb3IgPSBuZXcgTGlzdFZpZXdJbmZvQWNjZXNzb3IodGhpcy5fbGlzdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdFZpZXdJbmZvQWNjZXNzb3IpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29tYmluZWREaXNwb3NhYmxlKC4uLnJlbmRlcmVycykpO1xuXG5cdFx0Ly8gdG9wIGNlbGwgdG9vbGJhclxuXHRcdHRoaXMuX2xpc3RUb3BDZWxsVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGlzdFRvcENlbGxUb29sYmFyLCB0aGlzLCB0aGlzLm5vdGVib29rT3B0aW9ucykpO1xuXG5cdFx0Ly8gdHJhbnNwYXJlbnQgY292ZXJcblx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3ZlciA9IERPTS5hcHBlbmQodGhpcy5fbGlzdC5yb3dzQ29udGFpbmVyLCAkKCcud2Vidmlldy1jb3ZlcicpKTtcblx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcih0aGlzLl9vdmVybGF5Q29udGFpbmVyLCAoZTogU3RhbmRhcmRNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdzbGlkZXInKSAmJiB0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlcikge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcih0aGlzLl9vdmVybGF5Q29udGFpbmVyLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIpIHtcblx0XHRcdFx0Ly8gbm8gbWF0dGVyIHdoZW5cblx0XHRcdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uTW91c2VEb3duKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9vbk1vdXNlRG93bi5maXJlKHsgZXZlbnQ6IGUuYnJvd3NlckV2ZW50LCB0YXJnZXQ6IGUuZWxlbWVudCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uTW91c2VVcChlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fb25Nb3VzZVVwLmZpcmUoeyBldmVudDogZS5icm93c2VyRXZlbnQsIHRhcmdldDogZS5lbGVtZW50IH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cyhfZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUVkaXRvci5maXJlKHRoaXMpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDZWxsLmZpcmUoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9jdXMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fY3Vyc29yTmF2TW9kZS5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdHRoaXMuc2hvd0xpc3RDb250ZXh0TWVudShlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcygoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2libGVSYW5nZXMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRTY3JvbGwoKGUpID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbFRvcCAhPT0gZS5vbGRTY3JvbGxUb3ApIHtcblx0XHRcdFx0dGhpcy5fb25EaWRTY3JvbGwuZmlyZSgpO1xuXHRcdFx0XHR0aGlzLmNsZWFyQWN0aXZlQ2VsbFdpZGdldHMoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wID09PSBlLm9sZFNjcm9sbFRvcCAmJiBlLnNjcm9sbEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYXlvdXQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2ZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKERPTS50cmFja0ZvY3VzKHRoaXMuZ2V0RG9tTm9kZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3JGb2N1cy5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy52aWV3TW9kZWw/LnNldEVkaXRvckZvY3VzKGZhbHNlKTtcblx0XHRcdHRoaXMuX29uRGlkQmx1ckVtaXR0ZXIuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3JGb2N1cy5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbD8uc2V0RWRpdG9yRm9jdXModHJ1ZSk7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzRW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJOb3RlYm9va0FjdGlvbnNUb29sYmFyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJOb3RlYm9va1N0aWNreVNjcm9sbCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihhY2Nlc3NpYmlsaXR5UHJvdmlkZXIudmVyYm9zaXR5U2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLl9saXN0LmFyaWFMYWJlbCA9IGFjY2Vzc2liaWxpdHlQcm92aWRlcj8uZ2V0V2lkZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93TGlzdENvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxDZWxsVmlld01vZGVsPikge1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmcm9tOiAnY2VsbENvbnRhaW5lcidcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTm90ZWJvb2tPdmVydmlld1J1bGVyKCkge1xuXHRcdHRoaXMuX25vdGVib29rT3ZlcnZpZXdSdWxlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tPdmVydmlld1J1bGVyLCB0aGlzLCB0aGlzLl9ub3RlYm9va092ZXJ2aWV3UnVsZXJDb250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTm90ZWJvb2tBY3Rpb25zVG9vbGJhcigpIHtcblx0XHR0aGlzLl9ub3RlYm9va1RvcFRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRWRpdG9yV29ya2JlbmNoVG9vbGJhciwgdGhpcywgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgdGhpcy5fbm90ZWJvb2tPcHRpb25zLCB0aGlzLl9ub3RlYm9va1RvcFRvb2xiYXJDb250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va1RvcFRvb2xiYXIub25EaWRDaGFuZ2VWaXNpYmlsaXR5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaW1lbnNpb24gJiYgdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2RpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJOb3RlYm9va1N0aWNreVNjcm9sbCgpIHtcblx0XHR0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tTdGlja3lTY3JvbGwsIHRoaXMuX25vdGVib29rU3RpY2t5U2Nyb2xsQ29udGFpbmVyLCB0aGlzLCB0aGlzLl9saXN0LCAoc2l6ZURlbHRhKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2RpbWVuc2lvbiAmJiB0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0aWYgKHNpemVEZWx0YSA+IDApIHsgLy8gZGVsdGEgPiAwID09PiBzdGlja3kgaXMgZ3Jvd2luZywgY2VsbCBsaXN0IHNocmlua2luZ1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2RpbWVuc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyBzaXplRGVsdGEpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNpemVEZWx0YSA8IDApIHsgLy8gZGVsdGEgPCAwID09PiBzdGlja3kgaXMgc2hyaW5raW5nLCBjZWxsIGxpc3QgZ3Jvd2luZ1xuXHRcdFx0XHRcdHRoaXMuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgc2l6ZURlbHRhKTtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9kaW1lbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkU2Nyb2xsLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVPdXRwdXRSZW5kZXJlcnMoKSB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCAhdGhpcy5fd2Vidmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dlYnZpZXcudXBkYXRlT3V0cHV0UmVuZGVyZXJzKCk7XG5cdFx0dGhpcy52aWV3TW9kZWwudmlld0NlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRjZWxsLm91dHB1dHNWaWV3TW9kZWxzLmZvckVhY2gob3V0cHV0ID0+IHtcblx0XHRcdFx0aWYgKG91dHB1dC5waWNrZWRNaW1lVHlwZT8ucmVuZGVyZXJJZCA9PT0gUkVOREVSRVJfTk9UX0FWQUlMQUJMRSkge1xuXHRcdFx0XHRcdG91dHB1dC5yZXNldFJlbmRlcmVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb3ZlcmxheUNvbnRhaW5lcjtcblx0fVxuXG5cdGdldE92ZXJmbG93Q29udGFpbmVyRG9tTm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb3ZlcmZsb3dDb250YWluZXI7XG5cdH1cblxuXHRnZXRJbm5lcldlYnZpZXcoKTogSVdlYnZpZXdFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2Vidmlldz8ud2Vidmlldztcblx0fVxuXG5cdHNldEVkaXRvclByb2dyZXNzU2VydmljZShlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvclByb2dyZXNzU2VydmljZSA9IGVkaXRvclByb2dyZXNzU2VydmljZTtcblx0fVxuXG5cdHNldFBhcmVudENvbnRleHRLZXlTZXJ2aWNlKHBhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiB2b2lkIHtcblx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLnVwZGF0ZVBhcmVudChwYXJlbnRDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBzZXRNb2RlbCh0ZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCB2aWV3U3RhdGU6IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCwgcGVyZj86IE5vdGVib29rUGVyZk1hcmtzLCB2aWV3VHlwZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbCA9PT0gdW5kZWZpbmVkIHx8ICF0aGlzLnZpZXdNb2RlbC5lcXVhbCh0ZXh0TW9kZWwpKSB7XG5cdFx0XHRjb25zdCBvbGRCb3R0b21Ub29sYmFyRGltZW5zaW9ucyA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModGhpcy52aWV3TW9kZWw/LnZpZXdUeXBlKTtcblx0XHRcdHRoaXMuX2RldGFjaE1vZGVsKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9hdHRhY2hNb2RlbCh0ZXh0TW9kZWwsIHZpZXdUeXBlID8/IHRleHRNb2RlbC52aWV3VHlwZSwgdmlld1N0YXRlLCBwZXJmKTtcblx0XHRcdGNvbnN0IG5ld0JvdHRvbVRvb2xiYXJEaW1lbnNpb25zID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh0aGlzLnZpZXdNb2RlbD8udmlld1R5cGUpO1xuXG5cdFx0XHRpZiAob2xkQm90dG9tVG9vbGJhckRpbWVuc2lvbnMuYm90dG9tVG9vbGJhckdhcCAhPT0gbmV3Qm90dG9tVG9vbGJhckRpbWVuc2lvbnMuYm90dG9tVG9vbGJhckdhcFxuXHRcdFx0XHR8fCBvbGRCb3R0b21Ub29sYmFyRGltZW5zaW9ucy5ib3R0b21Ub29sYmFySGVpZ2h0ICE9PSBuZXdCb3R0b21Ub29sYmFyRGltZW5zaW9ucy5ib3R0b21Ub29sYmFySGVpZ2h0KSB7XG5cdFx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZUxheW91dFN0eWxlcygpO1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3Py51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHQuLi50aGlzLm5vdGVib29rT3B0aW9ucy5jb21wdXRlV2Vidmlld09wdGlvbnMoKSxcblx0XHRcdFx0XHRmb250RmFtaWx5OiB0aGlzLl9nZW5lcmF0ZUZvbnRGYW1pbHkoKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHR5cGUgV29ya2JlbmNoTm90ZWJvb2tPcGVuQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAncmVib3JuaXgnO1xuXHRcdFx0XHRjb21tZW50OiAnSWRlbnRpZnkgdGhlIG5vdGVib29rIGVkaXRvciB2aWV3IHR5cGUnO1xuXHRcdFx0XHRzY2hlbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGaWxlIHN5c3RlbSBwcm92aWRlciBzY2hlbWUgZm9yIHRoZSByZXNvdXJjZScgfTtcblx0XHRcdFx0ZXh0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBleHRlbnNpb24gZm9yIHRoZSByZXNvdXJjZScgfTtcblx0XHRcdFx0dmlld1R5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdWaWV3IHR5cGUgb2YgdGhlIG5vdGVib29rIGVkaXRvcicgfTtcblx0XHRcdFx0aXNSZXBsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgbm90ZWJvb2sgZWRpdG9yIGlzIHdpdGhpbiBhIFJFUEwgZWRpdG9yJyB9O1xuXHRcdFx0fTtcblxuXHRcdFx0dHlwZSBXb3JrYmVuY2hOb3RlYm9va09wZW5FdmVudCA9IHtcblx0XHRcdFx0c2NoZW1lOiBzdHJpbmc7XG5cdFx0XHRcdGV4dDogc3RyaW5nO1xuXHRcdFx0XHR2aWV3VHlwZTogc3RyaW5nO1xuXHRcdFx0XHRpc1JlcGw6IGJvb2xlYW47XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hOb3RlYm9va09wZW5FdmVudCwgV29ya2JlbmNoTm90ZWJvb2tPcGVuQ2xhc3NpZmljYXRpb24+KCdub3RlYm9vay9lZGl0b3JPcGVuZWQnLCB7XG5cdFx0XHRcdHNjaGVtZTogdGV4dE1vZGVsLnVyaS5zY2hlbWUsXG5cdFx0XHRcdGV4dDogZXh0bmFtZSh0ZXh0TW9kZWwudXJpKSxcblx0XHRcdFx0dmlld1R5cGU6IHRleHRNb2RlbC52aWV3VHlwZSxcblx0XHRcdFx0aXNSZXBsOiB0aGlzLmlzUmVwbEhpc3Rvcnlcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlc3RvcmVMaXN0Vmlld1N0YXRlKHZpZXdTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzdG9yZVNlbGVjdGVkS2VybmVsKHZpZXdTdGF0ZSk7XG5cblx0XHQvLyBsb2FkIHByZWxvYWRzIGZvciBtYXRjaGluZyBrZXJuZWxcblx0XHR0aGlzLl9sb2FkS2VybmVsUHJlbG9hZHMoKTtcblxuXHRcdC8vIGNsZWFyIHN0YXRlXG5cdFx0dGhpcy5fZG5kQ29udHJvbGxlcj8uY2xlYXJHbG9iYWxEcmFnU3RhdGUoKTtcblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHRLZXlzT25Gb2N1c0NoYW5nZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlQ29udGV4dEtleXNPbkZvY3VzQ2hhbmdlKCk7XG5cdFx0Ly8gcmVuZGVyIG1hcmtkb3duIHRvcCBkb3duIG9uIGlkbGVcblx0XHR0aGlzLl9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgX2JhY2tncm91bmRNYXJrZG93blJlbmRlclJ1bm5pbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYmFja2dyb3VuZE1hcmtkb3duUmVuZGVyaW5nKCkge1xuXHRcdGlmICh0aGlzLl9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJSdW5uaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYmFja2dyb3VuZE1hcmtkb3duUmVuZGVyUnVubmluZyA9IHRydWU7XG5cdFx0RE9NLnJ1bldoZW5XaW5kb3dJZGxlKERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLCAoZGVhZGxpbmUpID0+IHtcblx0XHRcdHRoaXMuX2JhY2tncm91bmRNYXJrZG93blJlbmRlcmluZ1dpdGhEZWFkbGluZShkZWFkbGluZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJpbmdXaXRoRGVhZGxpbmUoZGVhZGxpbmU6IElkbGVEZWFkbGluZSkge1xuXHRcdGNvbnN0IGVuZFRpbWUgPSBEYXRlLm5vdygpICsgZGVhZGxpbmUudGltZVJlbWFpbmluZygpO1xuXG5cdFx0Y29uc3QgZXhlY3V0ZSA9ICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2JhY2tncm91bmRNYXJrZG93blJlbmRlclJ1bm5pbmcgPSB0cnVlO1xuXHRcdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBmaXJzdE1hcmt1cENlbGwgPSB0aGlzLnZpZXdNb2RlbC52aWV3Q2VsbHMuZmluZChjZWxsID0+IGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiAhdGhpcy5fd2Vidmlldz8ubWFya3VwUHJldmlld01hcHBpbmcuaGFzKGNlbGwuaWQpICYmICF0aGlzLmNlbGxJc0hpZGRlbihjZWxsKSkgYXMgTWFya3VwQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFmaXJzdE1hcmt1cENlbGwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmNyZWF0ZU1hcmt1cFByZXZpZXcoZmlyc3RNYXJrdXBDZWxsKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX2JhY2tncm91bmRNYXJrZG93blJlbmRlclJ1bm5pbmcgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKERhdGUubm93KCkgPCBlbmRUaW1lKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQwKGV4ZWN1dGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYmFja2dyb3VuZE1hcmtkb3duUmVuZGVyaW5nKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGV4ZWN1dGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGV4dEtleXNPbkZvY3VzQ2hhbmdlKCkge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXTtcblx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0aWYgKCF0aGlzLl9jZWxsQ29udGV4dEtleU1hbmFnZXIpIHtcblx0XHRcdFx0dGhpcy5fY2VsbENvbnRleHRLZXlNYW5hZ2VyID0gdGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsQ29udGV4dEtleU1hbmFnZXIsIHRoaXMsIGZvY3VzZWQgYXMgQ2VsbFZpZXdNb2RlbCkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jZWxsQ29udGV4dEtleU1hbmFnZXIudXBkYXRlRm9yRWxlbWVudChmb2N1c2VkIGFzIENlbGxWaWV3TW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldE9wdGlvbnMob3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChvcHRpb25zPy5pc1JlYWRPbmx5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlYWRPbmx5ID0gb3B0aW9ucz8uaXNSZWFkT25seTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZWwudXBkYXRlT3B0aW9ucyh7IGlzUmVhZE9ubHk6IHRoaXMuX3JlYWRPbmx5IH0pO1xuXHRcdHRoaXMubm90ZWJvb2tPcHRpb25zLnVwZGF0ZU9wdGlvbnModGhpcy5fcmVhZE9ubHkpO1xuXG5cdFx0Ly8gcmV2ZWFsIGNlbGwgaWYgZWRpdG9yIG9wdGlvbnMgdGVsbCB0byBkbyBzb1xuXHRcdGNvbnN0IGNlbGxPcHRpb25zID0gb3B0aW9ucz8uY2VsbE9wdGlvbnMgPz8gdGhpcy5fcGFyc2VJbmRleGVkQ2VsbE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0aWYgKGNlbGxPcHRpb25zKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLnVyaS50b1N0cmluZygpID09PSBjZWxsT3B0aW9ucy5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNFbGVtZW50KGNlbGwpO1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBjZWxsT3B0aW9ucy5vcHRpb25zPy5zZWxlY3Rpb247XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICdzZXRPcHRpb25zJyk7XG5cdFx0XHRcdFx0Y2VsbC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkVkaXRvcjtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydEFzeW5jKGNlbGwsIG5ldyBSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4sIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIHx8IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4gfHwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWxDZWxsKGNlbGwsIG9wdGlvbnM/LmNlbGxSZXZlYWxUeXBlID8/IENlbGxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5nZXQoY2VsbCkhO1xuXHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0aWYgKGNlbGxPcHRpb25zLm9wdGlvbnM/LnNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBzZWxlY3Rpb24gfSA9IGNlbGxPcHRpb25zLm9wdGlvbnM7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JTZWxlY3Rpb24gPSBuZXcgUmFuZ2Uoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciB8fCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kQ29sdW1uIHx8IHNlbGVjdGlvbi5zdGFydENvbHVtbik7XG5cdFx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKGVkaXRvclNlbGVjdGlvbik7XG5cdFx0XHRcdFx0XHRlZGl0b3IucmV2ZWFsUG9zaXRpb25JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHtcblx0XHRcdFx0XHRcdFx0bGluZU51bWJlcjogc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0Y29sdW1uOiBzZWxlY3Rpb24uc3RhcnRDb2x1bW5cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnRBc3luYyhjZWxsLCBlZGl0b3JTZWxlY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWNlbGxPcHRpb25zLm9wdGlvbnM/LnByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNlbGVjdCBjZWxscyBpZiBvcHRpb25zIHRlbGwgdG8gZG8gc29cblx0XHQvLyB0b2RvQHJlYm9ybml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTgxMDggc3VwcG9ydCBzZWxlY3Rpb25zIG5vdCBqdXN0IGZvY3VzXG5cdFx0Ly8gdG9kb0ByZWJvcm5peCBzdXBwb3J0IG11bHRpcGUgc2VsZWN0aW9uc1xuXHRcdGlmIChvcHRpb25zPy5jZWxsU2VsZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgZm9jdXNDZWxsSW5kZXggPSBvcHRpb25zLmNlbGxTZWxlY3Rpb25zWzBdLnN0YXJ0O1xuXHRcdFx0Y29uc3QgZm9jdXNlZENlbGwgPSB0aGlzLnZpZXdNb2RlbC5jZWxsQXQoZm9jdXNDZWxsSW5kZXgpO1xuXHRcdFx0aWYgKGZvY3VzZWRDZWxsKSB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7XG5cdFx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0XHRcdGZvY3VzOiB7IHN0YXJ0OiBmb2N1c0NlbGxJbmRleCwgZW5kOiBmb2N1c0NlbGxJbmRleCArIDEgfSxcblx0XHRcdFx0XHRzZWxlY3Rpb25zOiBvcHRpb25zLmNlbGxTZWxlY3Rpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLnJldmVhbEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoZm9jdXNlZENlbGwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZUZvck9wdGlvbnMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU9wdGlvbnMuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VJbmRleGVkQ2VsbE9wdGlvbnMob3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChvcHRpb25zPy5pbmRleGVkQ2VsbE9wdGlvbnMpIHtcblx0XHRcdC8vIGNvbnZlcnQgaW5kZXggYmFzZWQgc2VsZWN0aW9uc1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuY2VsbEF0KG9wdGlvbnMuaW5kZXhlZENlbGxPcHRpb25zLmluZGV4KTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IGNlbGwudXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjogb3B0aW9ucy5pbmRleGVkQ2VsbE9wdGlvbnMuc2VsZWN0aW9uLFxuXHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2RldGFjaE1vZGVsKCkge1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuY2xlYXIoKTtcblx0XHRkaXNwb3NlKHRoaXMuX2xvY2FsQ2VsbFN0YXRlTGlzdGVuZXJzKTtcblx0XHR0aGlzLl9saXN0LmRldGFjaFZpZXdNb2RlbCgpO1xuXHRcdHRoaXMudmlld01vZGVsPy5kaXNwb3NlKCk7XG5cdFx0Ly8gYXZvaWQgZXZlbnRcblx0XHR0aGlzLnZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93ZWJ2aWV3Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fd2Vidmlldz8uZWxlbWVudC5yZW1vdmUoKTtcblx0XHR0aGlzLl93ZWJ2aWV3ID0gbnVsbDtcblx0XHR0aGlzLl9saXN0LmNsZWFyKCk7XG5cdH1cblxuXG5cdHByaXZhdGUgX3VwZGF0ZUZvck9wdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvckVkaXRhYmxlLnNldCghdGhpcy52aWV3TW9kZWwub3B0aW9ucy5pc1JlYWRPbmx5KTtcblx0XHR0aGlzLl9vdmVyZmxvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdub3RlYm9vay1lZGl0b3ItZWRpdGFibGUnLCAhdGhpcy52aWV3TW9kZWwub3B0aW9ucy5pc1JlYWRPbmx5KTtcblx0XHR0aGlzLmdldERvbU5vZGUoKS5jbGFzc0xpc3QudG9nZ2xlKCdub3RlYm9vay1lZGl0b3ItZWRpdGFibGUnLCAhdGhpcy52aWV3TW9kZWwub3B0aW9ucy5pc1JlYWRPbmx5KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVXZWJ2aWV3KCk6IFByb21pc2U8QmFja0xheWVyV2ViVmlldzxJQ29tbW9uQ2VsbEluZm8+IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy50ZXh0TW9kZWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl93ZWJ2aWV3UmVzb2x2ZVByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3UmVzb2x2ZVByb21pc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHR0aGlzLl9lbnN1cmVXZWJ2aWV3KHRoaXMuZ2V0SWQoKSwgdGhpcy50ZXh0TW9kZWwudmlld1R5cGUsIHRoaXMudGV4dE1vZGVsLnVyaSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2Vidmlld1Jlc29sdmVQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fd2Vidmlldykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdGVib29rIG91dHB1dCB3ZWJ2aWV3IG9iamVjdCBpcyBub3QgY3JlYXRlZCBzdWNjZXNzZnVsbHkuJyk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuX3dlYnZpZXcuY3JlYXRlV2Vidmlldyh0aGlzLmNyZWF0aW9uT3B0aW9ucy5jb2RlV2luZG93ID8/IG1haW5XaW5kb3cpO1xuXHRcdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LndlYnZpZXcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3RlYm9vayBvdXRwdXQgd2VidmlldyBlbGVtZW50IHdhcyBub3QgY3JlYXRlZCBzdWNjZXNzZnVsbHkuJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX3dlYnZpZXcud2Vidmlldy5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRGb2N1cy5zZXQoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3Rm9jdXNlZCA9IGZhbHNlO1xuXG5cdFx0XHRcdHRoaXMudXBkYXRlRWRpdG9yRm9jdXMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVDZWxsRm9jdXNNb2RlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX3dlYnZpZXcud2Vidmlldy5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb3V0cHV0Rm9jdXMuc2V0KHRydWUpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX3dlYnZpZXdGb2N1c2VkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fd2Vidmlldy5vbk1lc3NhZ2UoZSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZU1lc3NhZ2UuZmlyZShlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX3dlYnZpZXc7XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3UmVzb2x2ZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVXZWJ2aWV3KGlkOiBzdHJpbmcsIHZpZXdUeXBlOiBzdHJpbmcsIHJlc291cmNlOiBVUkkpIHtcblx0XHRpZiAodGhpcy5fd2Vidmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXG5cdFx0dGhpcy5fd2VidmlldyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmFja0xheWVyV2ViVmlldywge1xuXHRcdFx0Z2V0IGNyZWF0aW9uT3B0aW9ucygpIHsgcmV0dXJuIHRoYXQuY3JlYXRpb25PcHRpb25zOyB9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7IHRoYXQuX2xpc3Quc2Nyb2xsVG9wID0gc2Nyb2xsVG9wOyB9LFxuXHRcdFx0dHJpZ2dlclNjcm9sbChldmVudDogSU1vdXNlV2hlZWxFdmVudCkgeyB0aGF0Ll9saXN0LnRyaWdnZXJTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGV2ZW50KTsgfSxcblx0XHRcdGdldENlbGxCeUluZm86IHRoYXQuZ2V0Q2VsbEJ5SW5mby5iaW5kKHRoYXQpLFxuXHRcdFx0Z2V0Q2VsbEJ5SWQ6IHRoYXQuX2dldENlbGxCeUlkLmJpbmQodGhhdCksXG5cdFx0XHR0b2dnbGVOb3RlYm9va0NlbGxTZWxlY3Rpb246IHRoYXQuX3RvZ2dsZU5vdGVib29rQ2VsbFNlbGVjdGlvbi5iaW5kKHRoYXQpLFxuXHRcdFx0Zm9jdXNOb3RlYm9va0NlbGw6IHRoYXQuZm9jdXNOb3RlYm9va0NlbGwuYmluZCh0aGF0KSxcblx0XHRcdGZvY3VzTmV4dE5vdGVib29rQ2VsbDogdGhhdC5mb2N1c05leHROb3RlYm9va0NlbGwuYmluZCh0aGF0KSxcblx0XHRcdHVwZGF0ZU91dHB1dEhlaWdodDogdGhhdC5fdXBkYXRlT3V0cHV0SGVpZ2h0LmJpbmQodGhhdCksXG5cdFx0XHRzY2hlZHVsZU91dHB1dEhlaWdodEFjazogdGhhdC5fc2NoZWR1bGVPdXRwdXRIZWlnaHRBY2suYmluZCh0aGF0KSxcblx0XHRcdHVwZGF0ZU1hcmt1cENlbGxIZWlnaHQ6IHRoYXQuX3VwZGF0ZU1hcmt1cENlbGxIZWlnaHQuYmluZCh0aGF0KSxcblx0XHRcdHNldE1hcmt1cENlbGxFZGl0U3RhdGU6IHRoYXQuX3NldE1hcmt1cENlbGxFZGl0U3RhdGUuYmluZCh0aGF0KSxcblx0XHRcdGRpZFN0YXJ0RHJhZ01hcmt1cENlbGw6IHRoYXQuX2RpZFN0YXJ0RHJhZ01hcmt1cENlbGwuYmluZCh0aGF0KSxcblx0XHRcdGRpZERyYWdNYXJrdXBDZWxsOiB0aGF0Ll9kaWREcmFnTWFya3VwQ2VsbC5iaW5kKHRoYXQpLFxuXHRcdFx0ZGlkRHJvcE1hcmt1cENlbGw6IHRoYXQuX2RpZERyb3BNYXJrdXBDZWxsLmJpbmQodGhhdCksXG5cdFx0XHRkaWRFbmREcmFnTWFya3VwQ2VsbDogdGhhdC5fZGlkRW5kRHJhZ01hcmt1cENlbGwuYmluZCh0aGF0KSxcblx0XHRcdGRpZFJlc2l6ZU91dHB1dDogdGhhdC5fZGlkUmVzaXplT3V0cHV0LmJpbmQodGhhdCksXG5cdFx0XHR1cGRhdGVQZXJmb3JtYW5jZU1ldGFkYXRhOiB0aGF0Ll91cGRhdGVQZXJmb3JtYW5jZU1ldGFkYXRhLmJpbmQodGhhdCksXG5cdFx0XHRkaWRGb2N1c091dHB1dElucHV0Q2hhbmdlOiB0aGF0Ll9kaWRGb2N1c091dHB1dElucHV0Q2hhbmdlLmJpbmQodGhhdCksXG5cdFx0fSwgaWQsIHZpZXdUeXBlLCByZXNvdXJjZSwge1xuXHRcdFx0Li4udGhpcy5fbm90ZWJvb2tPcHRpb25zLmNvbXB1dGVXZWJ2aWV3T3B0aW9ucygpLFxuXHRcdFx0Zm9udEZhbWlseTogdGhpcy5fZ2VuZXJhdGVGb250RmFtaWx5KClcblx0XHR9LCB0aGlzLm5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmcuZ2V0U2NvcGVkKHRoaXMuX3V1aWQpKTtcblxuXHRcdHRoaXMuX3dlYnZpZXcuZWxlbWVudC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblxuXHRcdC8vIGF0dGFjaCB0aGUgd2VidmlldyBjb250YWluZXIgdG8gdGhlIERPTSB0cmVlIGZpcnN0XG5cdFx0dGhpcy5fbGlzdC5hdHRhY2hXZWJ2aWV3KHRoaXMuX3dlYnZpZXcuZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hdHRhY2hNb2RlbCh0ZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCB2aWV3VHlwZTogc3RyaW5nLCB2aWV3U3RhdGU6IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCwgcGVyZj86IE5vdGVib29rUGVyZk1hcmtzKSB7XG5cdFx0dGhpcy5fZW5zdXJlV2Vidmlldyh0aGlzLmdldElkKCksIHRleHRNb2RlbC52aWV3VHlwZSwgdGV4dE1vZGVsLnVyaSk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tWaWV3TW9kZWwsIHZpZXdUeXBlLCB0ZXh0TW9kZWwsIHRoaXMuX3ZpZXdDb250ZXh0LCB0aGlzLmdldExheW91dEluZm8oKSwgeyBpc1JlYWRPbmx5OiB0aGlzLl9yZWFkT25seSB9KTtcblx0XHR0aGlzLl92aWV3Q29udGV4dC5ldmVudERpc3BhdGNoZXIuZW1pdChbbmV3IE5vdGVib29rTGF5b3V0Q2hhbmdlZEV2ZW50KHsgd2lkdGg6IHRydWUsIGZvbnRJbmZvOiB0cnVlIH0sIHRoaXMuZ2V0TGF5b3V0SW5mbygpKV0pO1xuXHRcdHRoaXMubm90ZWJvb2tPcHRpb25zLnVwZGF0ZU9wdGlvbnModGhpcy5fcmVhZE9ubHkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlRm9yT3B0aW9ucygpO1xuXHRcdHRoaXMuX3VwZGF0ZUZvck5vdGVib29rQ29uZmlndXJhdGlvbigpO1xuXG5cdFx0Ly8gcmVzdG9yZSB2aWV3IHN0YXRlcywgaW5jbHVkaW5nIGNvbnRyaWJ1dGlvbnNcblxuXHRcdHtcblx0XHRcdC8vIHJlc3RvcmUgdmlldyBzdGF0ZVxuXHRcdFx0dGhpcy52aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh2aWV3U3RhdGUpO1xuXG5cdFx0XHQvLyBjb250cmlidXRpb24gc3RhdGUgcmVzdG9yZVxuXG5cdFx0XHRjb25zdCBjb250cmlidXRpb25zU3RhdGUgPSB2aWV3U3RhdGU/LmNvbnRyaWJ1dGlvbnNTdGF0ZSB8fCB7fTtcblx0XHRcdGZvciAoY29uc3QgW2lkLCBjb250cmlidXRpb25dIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjb250cmlidXRpb24ucmVzdG9yZVZpZXdTdGF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5yZXN0b3JlVmlld1N0YXRlKGNvbnRyaWJ1dGlvbnNTdGF0ZVtpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy52aWV3TW9kZWwub25EaWRDaGFuZ2VWaWV3Q2VsbHMoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdDZWxscy5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMudmlld01vZGVsLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoKTtcblx0XHRcdHRoaXMudXBkYXRlU2VsZWN0ZWRNYXJrZG93blByZXZpZXdzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fbGlzdC5vbldpbGxTY3JvbGwoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fd2Vidmlldz8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyIS5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke2Uuc2Nyb2xsVG9wfSlgO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBoYXNQZW5kaW5nQ2hhbmdlQ29udGVudEhlaWdodCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlbmRlclNjcm9sbEhlaWdodERpc3Bvc2FibGUgPSB0aGlzLl9sb2NhbFN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fbGlzdC5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKGhhc1BlbmRpbmdDaGFuZ2VDb250ZW50SGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGhhc1BlbmRpbmdDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdHJ1ZTtcblxuXHRcdFx0cmVuZGVyU2Nyb2xsSGVpZ2h0RGlzcG9zYWJsZS52YWx1ZSA9IERPTS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cdFx0XHRcdGhhc1BlbmRpbmdDaGFuZ2VDb250ZW50SGVpZ2h0ID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNjcm9sbEhlaWdodCgpO1xuXHRcdFx0fSwgMTAwKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl9saXN0Lm9uRGlkUmVtb3ZlT3V0cHV0cyhvdXRwdXRzID0+IHtcblx0XHRcdG91dHB1dHMuZm9yRWFjaChvdXRwdXQgPT4gdGhpcy5yZW1vdmVJbnNldChvdXRwdXQpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fbGlzdC5vbkRpZEhpZGVPdXRwdXRzKG91dHB1dHMgPT4ge1xuXHRcdFx0b3V0cHV0cy5mb3JFYWNoKG91dHB1dCA9PiB0aGlzLmhpZGVJbnNldChvdXRwdXQpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fbGlzdC5vbkRpZFJlbW92ZUNlbGxzRnJvbVZpZXcoY2VsbHMgPT4ge1xuXHRcdFx0Y29uc3QgaGlkZGVuQ2VsbHM6IE1hcmt1cENlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZGVsZXRlZENlbGxzOiBNYXJrdXBDZWxsVmlld01vZGVsW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0XHRjb25zdCBtZENlbGwgPSBjZWxsIGFzIE1hcmt1cENlbGxWaWV3TW9kZWw7XG5cdFx0XHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy52aWV3Q2VsbHMuZmluZChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBtZENlbGwuaGFuZGxlKSkge1xuXHRcdFx0XHRcdFx0Ly8gQ2VsbCBoYXMgYmVlbiBmb2xkZWQgYnV0IGlzIHN0aWxsIGluIG1vZGVsXG5cdFx0XHRcdFx0XHRoaWRkZW5DZWxscy5wdXNoKG1kQ2VsbCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIENlbGwgd2FzIGRlbGV0ZWRcblx0XHRcdFx0XHRcdGRlbGV0ZWRDZWxscy5wdXNoKG1kQ2VsbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGlkZU1hcmt1cFByZXZpZXdzKGhpZGRlbkNlbGxzKTtcblx0XHRcdHRoaXMuZGVsZXRlTWFya3VwUHJldmlld3MoZGVsZXRlZENlbGxzKTtcblx0XHR9KSk7XG5cblx0XHQvLyBpbml0IHJlbmRlcmluZ1xuXHRcdGF3YWl0IHRoaXMuX3dhcm11cFdpdGhNYXJrZG93blJlbmRlcmVyKHRoaXMudmlld01vZGVsLCB2aWV3U3RhdGUsIHBlcmYpO1xuXG5cdFx0cGVyZj8ubWFyaygnY3VzdG9tTWFya2Rvd25Mb2FkZWQnKTtcblxuXHRcdC8vIG1vZGVsIGF0dGFjaGVkXG5cdFx0dGhpcy5fbG9jYWxDZWxsU3RhdGVMaXN0ZW5lcnMgPSB0aGlzLnZpZXdNb2RlbC52aWV3Q2VsbHMubWFwKGNlbGwgPT4gdGhpcy5fYmluZENlbGxMaXN0ZW5lcihjZWxsKSk7XG5cdFx0dGhpcy5fbGFzdENlbGxXaXRoRWRpdG9yRm9jdXMgPSB0aGlzLnZpZXdNb2RlbC52aWV3Q2VsbHMuZmluZCh2aWV3Q2VsbCA9PiB0aGlzLmdldEFjdGl2ZUNlbGwoKSA9PT0gdmlld0NlbGwgJiYgdmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvcikgPz8gbnVsbDtcblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMudmlld01vZGVsLm9uRGlkQ2hhbmdlVmlld0NlbGxzKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVwZGF0ZSBjZWxsIGxpc3RlbmVyXG5cdFx0XHRbLi4uZS5zcGxpY2VzXS5yZXZlcnNlKCkuZm9yRWFjaChzcGxpY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBbc3RhcnQsIGRlbGV0ZWQsIG5ld0NlbGxzXSA9IHNwbGljZTtcblx0XHRcdFx0Y29uc3QgZGVsZXRlZENlbGxzID0gdGhpcy5fbG9jYWxDZWxsU3RhdGVMaXN0ZW5lcnMuc3BsaWNlKHN0YXJ0LCBkZWxldGVkLCAuLi5uZXdDZWxscy5tYXAoY2VsbCA9PiB0aGlzLl9iaW5kQ2VsbExpc3RlbmVyKGNlbGwpKSk7XG5cblx0XHRcdFx0ZGlzcG9zZShkZWxldGVkQ2VsbHMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChlLnNwbGljZXMuc29tZShzID0+IHNbMl0uc29tZShjZWxsID0+IGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkpKSB7XG5cdFx0XHRcdHRoaXMuX2JhY2tncm91bmRNYXJrZG93blJlbmRlcmluZygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl9kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMuX2xpc3QubGF5b3V0KHRoaXMuZ2V0Qm9keUhlaWdodCh0aGlzLl9kaW1lbnNpb24uaGVpZ2h0KSwgdGhpcy5fZGltZW5zaW9uLndpZHRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGlzdC5sYXlvdXQoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kbmRDb250cm9sbGVyPy5jbGVhckdsb2JhbERyYWdTdGF0ZSgpO1xuXG5cdFx0Ly8gcmVzdG9yZSBsaXN0IHN0YXRlIGF0IGxhc3QsIGl0IG11c3QgYmUgYWZ0ZXIgbGlzdCBsYXlvdXRcblx0XHR0aGlzLnJlc3RvcmVMaXN0Vmlld1N0YXRlKHZpZXdTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9iaW5kQ2VsbExpc3RlbmVyKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRzdG9yZS5hZGQoY2VsbC5vbkRpZENoYW5nZUxheW91dChlID0+IHtcblx0XHRcdC8vIGUudG90YWxIZWlnaHQgd2lsbCBiZSBmYWxzZSBpdCdzIG5vdCBjaGFuZ2VkXG5cdFx0XHRpZiAoZS50b3RhbEhlaWdodCB8fCBlLm91dGVyV2lkdGgpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXROb3RlYm9va0NlbGwoY2VsbCwgY2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0LCBlLmNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRzdG9yZS5hZGQoKGNlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwpLm9uRGlkUmVtb3ZlT3V0cHV0cygob3V0cHV0cykgPT4ge1xuXHRcdFx0XHRvdXRwdXRzLmZvckVhY2gob3V0cHV0ID0+IHRoaXMucmVtb3ZlSW5zZXQob3V0cHV0KSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0c3RvcmUuYWRkKChjZWxsIGFzIENlbGxWaWV3TW9kZWwpLm9uRGlkQ2hhbmdlU3RhdGUoZSA9PiB7XG5cdFx0XHRpZiAoZS5pbnB1dENvbGxhcHNlZENoYW5nZWQgJiYgY2VsbC5pc0lucHV0Q29sbGFwc2VkICYmIGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHR0aGlzLmhpZGVNYXJrdXBQcmV2aWV3cyhbKGNlbGwgYXMgTWFya3VwQ2VsbFZpZXdNb2RlbCldKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUub3V0cHV0Q29sbGFwc2VkQ2hhbmdlZCAmJiBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkICYmIGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0Y2VsbC5vdXRwdXRzVmlld01vZGVscy5mb3JFYWNoKG91dHB1dCA9PiB0aGlzLmhpZGVJbnNldChvdXRwdXQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuZm9jdXNNb2RlQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl92YWxpZGF0ZUNlbGxGb2N1c01vZGUoY2VsbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGNlbGwub25DZWxsRGVjb3JhdGlvbnNDaGFuZ2VkKGUgPT4ge1xuXHRcdFx0ZS5hZGRlZC5mb3JFYWNoKG9wdGlvbnMgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5jbGFzc05hbWUpIHtcblx0XHRcdFx0XHR0aGlzLmRlbHRhQ2VsbENvbnRhaW5lckNsYXNzTmFtZXMoY2VsbC5pZCwgW29wdGlvbnMuY2xhc3NOYW1lXSwgW10sIGNlbGwuY2VsbEtpbmQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnMub3V0cHV0Q2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWx0YUNlbGxDb250YWluZXJDbGFzc05hbWVzKGNlbGwuaWQsIFtvcHRpb25zLm91dHB1dENsYXNzTmFtZV0sIFtdLCBjZWxsLmNlbGxLaW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGUucmVtb3ZlZC5mb3JFYWNoKG9wdGlvbnMgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5jbGFzc05hbWUpIHtcblx0XHRcdFx0XHR0aGlzLmRlbHRhQ2VsbENvbnRhaW5lckNsYXNzTmFtZXMoY2VsbC5pZCwgW10sIFtvcHRpb25zLmNsYXNzTmFtZV0sIGNlbGwuY2VsbEtpbmQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnMub3V0cHV0Q2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWx0YUNlbGxDb250YWluZXJDbGFzc05hbWVzKGNlbGwuaWQsIFtdLCBbb3B0aW9ucy5vdXRwdXRDbGFzc05hbWVdLCBjZWxsLmNlbGxLaW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblxuXHRwcml2YXRlIF9sYXN0Q2VsbFdpdGhFZGl0b3JGb2N1czogSUNlbGxWaWV3TW9kZWwgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfdmFsaWRhdGVDZWxsRm9jdXNNb2RlKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0aWYgKGNlbGwuZm9jdXNNb2RlICE9PSBDZWxsRm9jdXNNb2RlLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9sYXN0Q2VsbFdpdGhFZGl0b3JGb2N1cyAmJiB0aGlzLl9sYXN0Q2VsbFdpdGhFZGl0b3JGb2N1cyAhPT0gY2VsbCkge1xuXHRcdFx0dGhpcy5fbGFzdENlbGxXaXRoRWRpdG9yRm9jdXMuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5Db250YWluZXI7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGFzdENlbGxXaXRoRWRpdG9yRm9jdXMgPSBjZWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FybXVwV2l0aE1hcmtkb3duUmVuZGVyZXIodmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCwgdmlld1N0YXRlOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQsIHBlcmY/OiBOb3RlYm9va1BlcmZNYXJrcykge1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdOb3RlYm9va0VkaXRvcldpZGdldCcsICd3YXJtdXAgJyArIHRoaXMudmlld01vZGVsPy51cmkudG9TdHJpbmcoKSk7XG5cdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHRwZXJmPy5tYXJrKCd3ZWJ2aWV3Q29tbUxvYWRlZCcpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdOb3RlYm9va0VkaXRvcldpZGdldCcsICd3YXJtdXAgLSB3ZWJ2aWV3IHJlc29sdmVkJyk7XG5cblx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgd2VidmlldyBpcyBub3QgdmlzaWJsZSBvdGhlcndpc2UgdXNlcnMgd2lsbCBzZWUgcHJlLXJlbmRlcmVkIG1hcmtkb3duIGNlbGxzIGluIHdyb25nIHBvc2l0aW9uIGFzIHRoZSBsaXN0IHZpZXcgZG9lc24ndCBoYXZlIGEgY29ycmVjdCBgdG9wYCBvZmZzZXQgeWV0XG5cdFx0dGhpcy5fd2VidmlldyEuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0Ly8gd2FybSB1cCBjYW4gdGFrZSBhcm91bmQgMjAwbXMgdG8gbG9hZCBtYXJrZG93biBsaWJyYXJpZXMsIGV0Yy5cblx0XHRhd2FpdCB0aGlzLl93YXJtdXBWaWV3cG9ydE1hcmtkb3duQ2VsbHModmlld01vZGVsLCB2aWV3U3RhdGUpO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnTm90ZWJvb2tFZGl0b3JXaWRnZXQnLCAnd2FybXVwIC0gdmlld3BvcnQgd2FybWVkIHVwJyk7XG5cblx0XHQvLyB0b2RvQHJlYm9ybml4IEBtamJ2eiwgaXMgdGhpcyB0b28gY29tcGxpY2F0ZWQ/XG5cblx0XHQvKiBub3cgdGhlIHdlYnZpZXcgaXMgcmVhZHksIGFuZCByZXF1ZXN0cyB0byByZW5kZXIgbWFya2Rvd24gYXJlIGZhc3QgZW5vdWdoXG5cdFx0ICogd2UgY2FuIHN0YXJ0IHJlbmRlcmluZyB0aGUgbGlzdCB2aWV3XG5cdFx0ICogcmVuZGVyXG5cdFx0ICogICAtIG1hcmtkb3duIGNlbGwgLT4gcmVxdWVzdCB0byB3ZWJ2aWV3IHRvICgxMG1zLCBiYXNpY2FsbHkganVzdCBsYXRlbmN5IGJldHdlZW4gVUkgYW5kIGlmcmFtZSlcblx0XHQgKiAgIC0gY29kZSBjZWxsIC0+IHJlbmRlciBpbiBwbGFjZVxuXHRcdCAqL1xuXHRcdHRoaXMuX2xpc3QubGF5b3V0KDAsIDApO1xuXHRcdHRoaXMuX2xpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHQvLyBub3cgdGhlIGxpc3Qgd2lkZ2V0IGhhcyBhIGNvcnJlY3QgY29udGVudEhlaWdodC9zY3JvbGxIZWlnaHRcblx0XHQvLyBzZXR0aW5nIHNjcm9sbFRvcCB3aWxsIHdvcmsgcHJvcGVybHlcblx0XHQvLyBhZnRlciBzZXR0aW5nIHNjcm9sbCB0b3AsIHRoZSBsaXN0IHZpZXcgd2lsbCB1cGRhdGUgYHRvcGAgb2YgdGhlIHNjcm9sbGFibGUgZWxlbWVudCwgZS5nLiBgdG9wOiAtNTg0cHhgXG5cdFx0dGhpcy5fbGlzdC5zY3JvbGxUb3AgPSB2aWV3U3RhdGU/LnNjcm9sbFBvc2l0aW9uPy50b3AgPz8gMDtcblx0XHR0aGlzLl9kZWJ1ZygnZmluaXNoIGluaXRpYWwgdmlld3BvcnQgd2FybXVwIGFuZCB2aWV3IHN0YXRlIHJlc3RvcmUuJyk7XG5cdFx0dGhpcy5fd2VidmlldyEuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnTm90ZWJvb2tFZGl0b3JXaWRnZXQnLCAnd2FybXVwIC0gbGlzdCB2aWV3IG1vZGVsIGF0dGFjaGVkLCBzZXQgdG8gdmlzaWJsZScpO1xuXHRcdHRoaXMuX29uRGlkQXR0YWNoVmlld01vZGVsLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhcm11cFZpZXdwb3J0TWFya2Rvd25DZWxscyh2aWV3TW9kZWw6IE5vdGVib29rVmlld01vZGVsLCB2aWV3U3RhdGU6IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2aWV3U3RhdGUgJiYgdmlld1N0YXRlLmNlbGxUb3RhbEhlaWdodHMpIHtcblx0XHRcdGNvbnN0IHRvdGFsSGVpZ2h0Q2FjaGUgPSB2aWV3U3RhdGUuY2VsbFRvdGFsSGVpZ2h0cztcblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHZpZXdTdGF0ZS5zY3JvbGxQb3NpdGlvbj8udG9wID8/IDA7XG5cdFx0XHRjb25zdCBzY3JvbGxCb3R0b20gPSBzY3JvbGxUb3AgKyBNYXRoLm1heCh0aGlzLl9kaW1lbnNpb24/LmhlaWdodCA/PyAwLCAxMDgwKTtcblxuXHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHRjb25zdCByZXF1ZXN0czogW0lDZWxsVmlld01vZGVsLCBudW1iZXJdW10gPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2aWV3TW9kZWwubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHZpZXdNb2RlbC5jZWxsQXQoaSkhO1xuXHRcdFx0XHRjb25zdCBjZWxsSGVpZ2h0ID0gdG90YWxIZWlnaHRDYWNoZVtpXSA/PyAwO1xuXG5cdFx0XHRcdGlmIChvZmZzZXQgKyBjZWxsSGVpZ2h0IDwgc2Nyb2xsVG9wKSB7XG5cdFx0XHRcdFx0b2Zmc2V0ICs9IGNlbGxIZWlnaHQ7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRcdFx0cmVxdWVzdHMucHVzaChbY2VsbCwgb2Zmc2V0XSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvZmZzZXQgKz0gY2VsbEhlaWdodDtcblxuXHRcdFx0XHRpZiAob2Zmc2V0ID4gc2Nyb2xsQm90dG9tKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5fd2VidmlldyEuaW5pdGlhbGl6ZU1hcmt1cChyZXF1ZXN0cy5tYXAoKFttb2RlbCwgb2Zmc2V0XSkgPT4gdGhpcy5jcmVhdGVNYXJrdXBDZWxsSW5pdGlhbGl6YXRpb24obW9kZWwsIG9mZnNldCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5pdFJlcXVlc3RzID0gdmlld01vZGVsLnZpZXdDZWxsc1xuXHRcdFx0XHQuZmlsdGVyKGNlbGwgPT4gY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKVxuXHRcdFx0XHQuc2xpY2UoMCwgNSlcblx0XHRcdFx0Lm1hcChjZWxsID0+IHRoaXMuY3JlYXRlTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uKGNlbGwsIC0xMDAwMCkpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3IS5pbml0aWFsaXplTWFya3VwKGluaXRSZXF1ZXN0cyk7XG5cblx0XHRcdC8vIG5vIGNhY2hlZCB2aWV3IHN0YXRlIHNvIHdlIGFyZSByZW5kZXJpbmcgdGhlIGZpcnN0IHZpZXdwb3J0XG5cdFx0XHQvLyBhZnRlciBhYm92ZSBhc3luYyBjYWxsLCB3ZSBhbHJlYWR5IGdldCBpbml0IGhlaWdodCBmb3IgbWFya2Rvd24gY2VsbHMsIHdlIGNhbiB1cGRhdGUgdGhlaXIgb2Zmc2V0XG5cdFx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRcdGNvbnN0IG9mZnNldFVwZGF0ZVJlcXVlc3RzOiB7IGlkOiBzdHJpbmc7IHRvcDogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsQm90dG9tID0gTWF0aC5tYXgodGhpcy5fZGltZW5zaW9uPy5oZWlnaHQgPz8gMCwgMTA4MCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2Ygdmlld01vZGVsLnZpZXdDZWxscykge1xuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRcdFx0b2Zmc2V0VXBkYXRlUmVxdWVzdHMucHVzaCh7IGlkOiBjZWxsLmlkLCB0b3A6IG9mZnNldCB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG9mZnNldCArPSBjZWxsLmdldEhlaWdodCh0aGlzLmdldExheW91dEluZm8oKS5mb250SW5mby5saW5lSGVpZ2h0KTtcblxuXHRcdFx0XHRpZiAob2Zmc2V0ID4gc2Nyb2xsQm90dG9tKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fd2Vidmlldz8udXBkYXRlU2Nyb2xsVG9wcyhbXSwgb2Zmc2V0VXBkYXRlUmVxdWVzdHMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uKG1vZGVsOiBJQ2VsbFZpZXdNb2RlbCwgb2Zmc2V0OiBudW1iZXIpOiBJTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uIHtcblx0XHRyZXR1cm4gKHtcblx0XHRcdG1pbWU6IG1vZGVsLm1pbWUsXG5cdFx0XHRjZWxsSWQ6IG1vZGVsLmlkLFxuXHRcdFx0Y2VsbEhhbmRsZTogbW9kZWwuaGFuZGxlLFxuXHRcdFx0Y29udGVudDogbW9kZWwuZ2V0VGV4dCgpLFxuXHRcdFx0b2Zmc2V0OiBvZmZzZXQsXG5cdFx0XHR2aXNpYmxlOiBmYWxzZSxcblx0XHRcdG1ldGFkYXRhOiBtb2RlbC5tZXRhZGF0YSxcblx0XHR9KTtcblx0fVxuXG5cdHJlc3RvcmVMaXN0Vmlld1N0YXRlKHZpZXdTdGF0ZTogSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh2aWV3U3RhdGU/LnNjcm9sbFBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2xpc3Quc2Nyb2xsVG9wID0gdmlld1N0YXRlLnNjcm9sbFBvc2l0aW9uLnRvcDtcblx0XHRcdHRoaXMuX2xpc3Quc2Nyb2xsTGVmdCA9IHZpZXdTdGF0ZS5zY3JvbGxQb3NpdGlvbi5sZWZ0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9saXN0LnNjcm9sbFRvcCA9IDA7XG5cdFx0XHR0aGlzLl9saXN0LnNjcm9sbExlZnQgPSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzSWR4ID0gdHlwZW9mIHZpZXdTdGF0ZT8uZm9jdXMgPT09ICdudW1iZXInID8gdmlld1N0YXRlLmZvY3VzIDogMDtcblx0XHRpZiAoZm9jdXNJZHggPCB0aGlzLnZpZXdNb2RlbC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnZpZXdNb2RlbC5jZWxsQXQoZm9jdXNJZHgpO1xuXHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWw/LnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7XG5cdFx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkhhbmRsZSxcblx0XHRcdFx0XHRwcmltYXJ5OiBlbGVtZW50LmhhbmRsZSxcblx0XHRcdFx0XHRzZWxlY3Rpb25zOiBbZWxlbWVudC5oYW5kbGVdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5fbGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRcdGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdFx0c2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMSB9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXdTdGF0ZT8uZWRpdG9yRm9jdXNlZCkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMudmlld01vZGVsLmNlbGxBdChmb2N1c0lkeCk7XG5cdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRjZWxsLmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuRWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVTZWxlY3RlZEtlcm5lbCh2aWV3U3RhdGU6IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh2aWV3U3RhdGU/LnNlbGVjdGVkS2VybmVsSWQgJiYgdGhpcy50ZXh0TW9kZWwpIHtcblx0XHRcdGNvbnN0IG1hdGNoaW5nID0gdGhpcy5ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwodGhpcy50ZXh0TW9kZWwpO1xuXHRcdFx0Y29uc3Qga2VybmVsID0gbWF0Y2hpbmcuYWxsLmZpbmQoayA9PiBrLmlkID09PSB2aWV3U3RhdGUuc2VsZWN0ZWRLZXJuZWxJZCk7XG5cdFx0XHQvLyBTZWxlY3RlZCBrZXJuZWwgbWF5IGhhdmUgYWxyZWFkeSBiZWVuIHBpY2tlZCBwcmlvciB0byB0aGUgdmlldyBzdGF0ZSBsb2FkaW5nXG5cdFx0XHQvLyBJZiBzbywgZG9uJ3Qgb3ZlcndyaXRlIGl0IHdpdGggdGhlIHNhdmVkIGtlcm5lbC5cblx0XHRcdGlmIChrZXJuZWwgJiYgIW1hdGNoaW5nLnNlbGVjdGVkKSB7XG5cdFx0XHRcdHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnNlbGVjdEtlcm5lbEZvck5vdGVib29rKGtlcm5lbCwgdGhpcy50ZXh0TW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldEVkaXRvclZpZXdTdGF0ZSgpOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy52aWV3TW9kZWw/LmdldEVkaXRvclZpZXdTdGF0ZSgpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRpbmdDZWxsczoge30sXG5cdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczoge30sXG5cdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9saXN0KSB7XG5cdFx0XHRzdGF0ZS5zY3JvbGxQb3NpdGlvbiA9IHsgbGVmdDogdGhpcy5fbGlzdC5zY3JvbGxMZWZ0LCB0b3A6IHRoaXMuX2xpc3Quc2Nyb2xsVG9wIH07XG5cdFx0XHRjb25zdCBjZWxsSGVpZ2h0czogeyBba2V5OiBudW1iZXJdOiBudW1iZXIgfSA9IHt9O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnZpZXdNb2RlbCEubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZWxtID0gdGhpcy52aWV3TW9kZWwhLmNlbGxBdChpKSBhcyBDZWxsVmlld01vZGVsO1xuXHRcdFx0XHRjZWxsSGVpZ2h0c1tpXSA9IGVsbS5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0O1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0ZS5jZWxsVG90YWxIZWlnaHRzID0gY2VsbEhlaWdodHM7XG5cblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBmb2N1c1JhbmdlID0gdGhpcy52aWV3TW9kZWwuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMudmlld01vZGVsLmNlbGxBdChmb2N1c1JhbmdlLnN0YXJ0KTtcblx0XHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBpdGVtRE9NID0gdGhpcy5fbGlzdC5kb21FbGVtZW50T2ZFbGVtZW50KGVsZW1lbnQpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvckZvY3VzZWQgPSBlbGVtZW50LmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcgJiYgISEoaXRlbURPTSAmJiBpdGVtRE9NLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiBpdGVtRE9NLmNvbnRhaW5zKGl0ZW1ET00ub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50KSk7XG5cblx0XHRcdFx0XHRzdGF0ZS5lZGl0b3JGb2N1c2VkID0gZWRpdG9yRm9jdXNlZDtcblx0XHRcdFx0XHRzdGF0ZS5mb2N1cyA9IGZvY3VzUmFuZ2Uuc3RhcnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTYXZlIGNvbnRyaWJ1dGlvbiB2aWV3IHN0YXRlc1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnNTdGF0ZTogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtpZCwgY29udHJpYnV0aW9uXSBvZiB0aGlzLl9jb250cmlidXRpb25zKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNvbnRyaWJ1dGlvbi5zYXZlVmlld1N0YXRlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbnNTdGF0ZVtpZF0gPSBjb250cmlidXRpb24uc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzdGF0ZS5jb250cmlidXRpb25zU3RhdGUgPSBjb250cmlidXRpb25zU3RhdGU7XG5cdFx0aWYgKHRoaXMudGV4dE1vZGVsPy51cmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRzdGF0ZS5zZWxlY3RlZEtlcm5lbElkID0gdGhpcy5hY3RpdmVLZXJuZWw/LmlkO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX2FsbG93U2Nyb2xsQmV5b25kTGFzdExpbmUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njcm9sbEJleW9uZExhc3RMaW5lICYmICF0aGlzLmlzUmVwbEhpc3Rvcnk7XG5cdH1cblxuXHRwcml2YXRlIGdldEJvZHlIZWlnaHQoZGltZW5zaW9uSGVpZ2h0OiBudW1iZXIpIHtcblx0XHRyZXR1cm4gTWF0aC5tYXgoZGltZW5zaW9uSGVpZ2h0IC0gKHRoaXMuX25vdGVib29rVG9wVG9vbGJhcj8udXNlR2xvYmFsVG9vbGJhciA/IC8qKiBUb29sYmFyIGhlaWdodCAqLyAyNiA6IDApLCAwKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERPTS5EaW1lbnNpb24sIHNoYWRvd0VsZW1lbnQ/OiBIVE1MRWxlbWVudCwgcG9zaXRpb24/OiBET00uSURvbVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0aWYgKCFzaGFkb3dFbGVtZW50ICYmICF0aGlzLl9zaGFkb3dFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGRpbWVuc2lvbi53aWR0aCA8PSAwIHx8IGRpbWVuc2lvbi5oZWlnaHQgPD0gMCkge1xuXHRcdFx0dGhpcy5vbldpbGxIaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCA9IHRoaXMubGF5b3V0U2VydmljZS53aGVuQ29udGFpbmVyU3R5bGVzTG9hZGVkKERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpKTtcblx0XHRpZiAod2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCkge1xuXHRcdFx0Ly8gSW4gZmxvYXRpbmcgd2luZG93cywgd2UgbmVlZCB0byBlbnN1cmUgdGhhdCB0aGVcblx0XHRcdC8vIGNvbnRhaW5lciBpcyByZWFkeSBmb3IgdXMgdG8gY29tcHV0ZSBjZXJ0YWluXG5cdFx0XHQvLyBsYXlvdXQgcmVsYXRlZCBwcm9wZXJ0aWVzLlxuXHRcdFx0d2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZC50aGVuKCgpID0+IHRoaXMubGF5b3V0Tm90ZWJvb2soZGltZW5zaW9uLCBzaGFkb3dFbGVtZW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGF5b3V0Tm90ZWJvb2soZGltZW5zaW9uLCBzaGFkb3dFbGVtZW50KTtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0Tm90ZWJvb2soZGltZW5zaW9uOiBET00uRGltZW5zaW9uLCBzaGFkb3dFbGVtZW50PzogSFRNTEVsZW1lbnQpIHtcblx0XHRpZiAoc2hhZG93RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fc2hhZG93RWxlbWVudCA9IHNoYWRvd0VsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGltZW5zaW9uID0gZGltZW5zaW9uO1xuXHRcdGNvbnN0IG5ld0JvZHlIZWlnaHQgPSB0aGlzLmdldEJvZHlIZWlnaHQoZGltZW5zaW9uLmhlaWdodCkgLSB0aGlzLmdldExheW91dEluZm8oKS5zdGlja3lIZWlnaHQ7XG5cdFx0RE9NLnNpemUodGhpcy5fYm9keSwgZGltZW5zaW9uLndpZHRoLCBuZXdCb2R5SGVpZ2h0KTtcblxuXHRcdGNvbnN0IG5ld0NlbGxMaXN0SGVpZ2h0ID0gbmV3Qm9keUhlaWdodDtcblx0XHRpZiAodGhpcy5fbGlzdC5nZXRSZW5kZXJIZWlnaHQoKSA8IG5ld0NlbGxMaXN0SGVpZ2h0KSB7XG5cdFx0XHQvLyB0aGUgbmV3IGRpbWVuc2lvbiBpcyBsYXJnZXIgdGhhbiB0aGUgbGlzdCB2aWV3cG9ydCwgdXBkYXRlIGl0cyBhZGRpdGlvbmFsIGhlaWdodCBmaXJzdCwgb3RoZXJ3aXNlIHRoZSBsaXN0IHZpZXcgd2lsbCBtb3ZlIGRvd24gYSBiaXQgKGFzIHRoZSBgc2Nyb2xsQm90dG9tYCB3aWxsIG1vdmUgZG93bilcblx0XHRcdHRoaXMuX2xpc3QudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmdCb3R0b206IHRoaXMuX2FsbG93U2Nyb2xsQmV5b25kTGFzdExpbmUoKSA/IE1hdGgubWF4KDAsIChuZXdDZWxsTGlzdEhlaWdodCAtIDUwKSkgOiAwLCBwYWRkaW5nVG9wOiAwIH0pO1xuXHRcdFx0dGhpcy5fbGlzdC5sYXlvdXQobmV3Q2VsbExpc3RIZWlnaHQsIGRpbWVuc2lvbi53aWR0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHRoZSBuZXcgZGltZW5zaW9uIGlzIHNtYWxsZXIgdGhhbiB0aGUgbGlzdCB2aWV3cG9ydCwgaWYgd2UgdXBkYXRlIHRoZSBhZGRpdGlvbmFsIGhlaWdodCwgdGhlIGBzY3JvbGxCb3R0b21gIHdpbGwgbW92ZSB1cCwgd2hpY2ggbW92ZXMgdGhlIHdob2xlIGxpc3QgdmlldyB1cHdhcmRzIGEgYml0LiBTbyB3ZSBydW4gYSBsYXlvdXQgZmlyc3QuXG5cdFx0XHR0aGlzLl9saXN0LmxheW91dChuZXdDZWxsTGlzdEhlaWdodCwgZGltZW5zaW9uLndpZHRoKTtcblx0XHRcdHRoaXMuX2xpc3QudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmdCb3R0b206IHRoaXMuX2FsbG93U2Nyb2xsQmV5b25kTGFzdExpbmUoKSA/IE1hdGgubWF4KDAsIChuZXdDZWxsTGlzdEhlaWdodCAtIDUwKSkgOiAwLCBwYWRkaW5nVG9wOiAwIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuaW5lcnQgPSBmYWxzZTtcblxuXHRcdHRoaXMubGF5b3V0Q29udGFpbmVyT3ZlclNoYWRvd0VsZW1lbnQoc2hhZG93RWxlbWVudCA/PyB0aGlzLl9zaGFkb3dFbGVtZW50KTtcblxuXHRcdGlmICh0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlcikge1xuXHRcdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIuc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlci5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbi53aWR0aH1weGA7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyLmxheW91dCh0aGlzLl9kaW1lbnNpb24pO1xuXHRcdHRoaXMuX25vdGVib29rT3ZlcnZpZXdSdWxlci5sYXlvdXQoKTtcblxuXHRcdHRoaXMuX3ZpZXdDb250ZXh0Py5ldmVudERpc3BhdGNoZXIuZW1pdChbbmV3IE5vdGVib29rTGF5b3V0Q2hhbmdlZEV2ZW50KHsgd2lkdGg6IHRydWUsIGZvbnRJbmZvOiB0cnVlIH0sIHRoaXMuZ2V0TGF5b3V0SW5mbygpKV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRDb250YWluZXJPdmVyU2hhZG93RWxlbWVudChhbmNob3JFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghYW5jaG9yRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGFsRWRpdG9yQ29udGFpbmVyID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydD8ubW9kYWxFbGVtZW50O1xuXHRcdGNvbnN0IGlzTW9kYWwgPSBET00uaXNIVE1MRWxlbWVudChtb2RhbEVkaXRvckNvbnRhaW5lcikgJiYgbW9kYWxFZGl0b3JDb250YWluZXIuY29udGFpbnMoYW5jaG9yRWxlbWVudCk7XG5cdFx0Y29uc3QgY2xpcHBpbmdDb250YWluZXIgPSBpc01vZGFsID8gdW5kZWZpbmVkIDogdGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdHRoaXMuX292ZXJsYXlMYXlvdXQuc2V0QW5jaG9yRWxlbWVudChhbmNob3JFbGVtZW50LCB7IGNsaXBwaW5nQ29udGFpbmVyIH0pO1xuXHRcdHRoaXMuX292ZXJsYXlMYXlvdXQucmVhcHBseUxheW91dFN0eWxlcygpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZvY3VzIHRyYWNrZXJcblx0Zm9jdXMoKSB7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLl9lZGl0b3JGb2N1cy5zZXQodHJ1ZSk7XG5cblx0XHRpZiAodGhpcy5fd2Vidmlld0ZvY3VzZWQpIHtcblx0XHRcdHRoaXMuX3dlYnZpZXc/LmZvY3VzV2VidmlldygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNSYW5nZSA9IHRoaXMudmlld01vZGVsLmdldEZvY3VzKCk7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnZpZXdNb2RlbC5jZWxsQXQoZm9jdXNSYW5nZS5zdGFydCk7XG5cblx0XHRcdFx0Ly8gVGhlIG5vdGVib29rIGVkaXRvciBkb2Vzbid0IGhhdmUgZm9jdXMgeWV0XG5cdFx0XHRcdGlmICghdGhpcy5oYXNFZGl0b3JGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c0NvbnRhaW5lcigpO1xuXHRcdFx0XHRcdC8vIHRyaWdnZXIgZWRpdG9yIHRvIHVwZGF0ZSBhcyBGb2N1c1RyYWNrZXIgbWlnaHQgbm90IGVtaXQgZm9jdXMgY2hhbmdlIGV2ZW50XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVFZGl0b3JGb2N1cygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVsZW1lbnQgJiYgZWxlbWVudC5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nLCAnZWRpdG9yV2lkZ2V0LmZvY3VzJyk7XG5cdFx0XHRcdFx0ZWxlbWVudC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkVkaXRvcjtcblx0XHRcdFx0XHR0aGlzLmZvY3VzRWRpdG9yKGVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9ncmVzcykge1xuXHRcdFx0Ly8gVGhlIGVkaXRvciBmb3JjZXMgcHJvZ3Jlc3MgdG8gaGlkZSB3aGVuIHN3aXRjaGluZyBlZGl0b3JzLiBTbyBpZiBwcm9ncmVzcyBzaG91bGQgYmUgdmlzaWJsZSwgZm9yY2UgaXQgdG8gc2hvdyB3aGVuIHRoZSBlZGl0b3IgaXMgZm9jdXNlZC5cblx0XHRcdHRoaXMuc2hvd1Byb2dyZXNzKCk7XG5cdFx0fVxuXHR9XG5cblx0b25TaG93KCkge1xuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzRWRpdG9yKGFjdGl2ZUVsZW1lbnQ6IENlbGxWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtlbGVtZW50LCBlZGl0b3JdIG9mIHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChlbGVtZW50ID09PSBhY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRcdGVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNDb250YWluZXIoY2xlYXJTZWxlY3Rpb246IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdGlmICh0aGlzLl93ZWJ2aWV3Rm9jdXNlZCkge1xuXHRcdFx0dGhpcy5fd2Vidmlldz8uZm9jdXNXZWJ2aWV3KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xpc3QuZm9jdXNDb250YWluZXIoY2xlYXJTZWxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdE91dHB1dENvbnRlbnQoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl93ZWJ2aWV3Py5zZWxlY3RPdXRwdXRDb250ZW50cyhjZWxsKTtcblx0fVxuXG5cdHNlbGVjdElucHV0Q29udGVudHMoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl93ZWJ2aWV3Py5zZWxlY3RJbnB1dENvbnRlbnRzKGNlbGwpO1xuXHR9XG5cblx0b25XaWxsSGlkZSgpIHtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl9lZGl0b3JGb2N1cy5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuaW5lcnQgPSB0cnVlO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuc3R5bGUubGVmdCA9ICctNTAwMDBweCc7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5jbGVhckFjdGl2ZUNlbGxXaWRnZXRzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyQWN0aXZlQ2VsbFdpZGdldHMoKSB7XG5cdFx0dGhpcy5fcmVuZGVyZWRFZGl0b3JzLmZvckVhY2goKGVkaXRvciwgY2VsbCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZ2V0QWN0aXZlQ2VsbCgpID09PSBjZWxsICYmIGVkaXRvcikge1xuXHRcdFx0XHRTdWdnZXN0Q29udHJvbGxlci5nZXQoZWRpdG9yKT8uY2FuY2VsU3VnZ2VzdFdpZGdldCgpO1xuXHRcdFx0XHREcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LmNsZWFyV2lkZ2V0cygpO1xuXHRcdFx0XHRDb3B5UGFzdGVDb250cm9sbGVyLmdldChlZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5mb3JFYWNoKChlZGl0b3IsIGNlbGwpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0XHRpZiAoY29udHJvbGxlcj8ubW9kZWwuZ2V0KCk/LmlubGluZUVkaXRTdGF0ZS5nZXQoKSkge1xuXHRcdFx0XHRlZGl0b3IucmVuZGVyKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBlZGl0b3JIYXNEb21Gb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gRE9NLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGhpcy5nZXREb21Ob2RlKCkpO1xuXHR9XG5cblx0dXBkYXRlRWRpdG9yRm9jdXMoKSB7XG5cdFx0Ly8gTm90ZSAtIGZvY3VzIGdvaW5nIHRvIHRoZSB3ZWJ2aWV3IHdpbGwgZmlyZSAnYmx1cicsIGJ1dCB0aGUgd2VidmlldyBlbGVtZW50IHdpbGwgYmVcblx0XHQvLyBhIGRlc2NlbmRlbnQgb2YgdGhlIG5vdGVib29rIGVkaXRvciByb290LlxuXHRcdHRoaXMuX2ZvY3VzVHJhY2tlci5yZWZyZXNoU3RhdGUoKTtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5lZGl0b3JIYXNEb21Gb2N1cygpO1xuXHRcdHRoaXMuX2VkaXRvckZvY3VzLnNldChmb2N1c2VkKTtcblx0XHR0aGlzLnZpZXdNb2RlbD8uc2V0RWRpdG9yRm9jdXMoZm9jdXNlZCk7XG5cdH1cblxuXHR1cGRhdGVDZWxsRm9jdXNNb2RlKCkge1xuXHRcdGNvbnN0IGFjdGl2ZUNlbGwgPSB0aGlzLmdldEFjdGl2ZUNlbGwoKTtcblxuXHRcdGlmIChhY3RpdmVDZWxsPy5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuT3V0cHV0ICYmICF0aGlzLl93ZWJ2aWV3Rm9jdXNlZCkge1xuXHRcdFx0Ly8gb3V0cHV0IHByZXZpb3VzbHkgaGFzIGZvY3VzLCBidXQgbm93IGl0J3MgYmx1cnJlZC5cblx0XHRcdGFjdGl2ZUNlbGwuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5Db250YWluZXI7XG5cdFx0fVxuXHR9XG5cblx0aGFzRWRpdG9yRm9jdXMoKSB7XG5cdFx0Ly8gX2VkaXRvckZvY3VzIGlzIGRyaXZlbiBieSB0aGUgRm9jdXNUcmFja2VyLCB3aGljaCBpcyBvbmx5IGd1YXJhbnRlZWQgdG8gX2V2ZW50dWFsbHlfIGZpcmUgYmx1ci5cblx0XHQvLyBJZiB3ZSBuZWVkIHRvIGtub3cgd2hldGhlciB3ZSBoYXZlIGZvY3VzIGF0IHRoaXMgaW5zdGFudCwgd2UgbmVlZCB0byBjaGVjayB0aGUgRE9NIG1hbnVhbGx5LlxuXHRcdHRoaXMudXBkYXRlRWRpdG9yRm9jdXMoKTtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JIYXNEb21Gb2N1cygpO1xuXHR9XG5cblx0aGFzV2Vidmlld0ZvY3VzKCkge1xuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3Rm9jdXNlZDtcblx0fVxuXG5cdGhhc091dHB1dFRleHRTZWxlY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLmhhc0VkaXRvckZvY3VzKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB3aW5kb3dTZWxlY3Rpb24gPSBET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKS5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAod2luZG93U2VsZWN0aW9uPy5yYW5nZUNvdW50ICE9PSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlU2VsZWN0aW9uID0gd2luZG93U2VsZWN0aW9uLmdldFJhbmdlQXQoMCk7XG5cdFx0aWYgKGFjdGl2ZVNlbGVjdGlvbi5zdGFydENvbnRhaW5lciA9PT0gYWN0aXZlU2VsZWN0aW9uLmVuZENvbnRhaW5lciAmJiBhY3RpdmVTZWxlY3Rpb24uZW5kT2Zmc2V0IC0gYWN0aXZlU2VsZWN0aW9uLnN0YXJ0T2Zmc2V0ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnRhaW5lcjogTm9kZSB8IG51bGwgPSBhY3RpdmVTZWxlY3Rpb24uY29tbW9uQW5jZXN0b3JDb250YWluZXI7XG5cblx0XHRpZiAoIXRoaXMuX2JvZHkuY29udGFpbnMoY29udGFpbmVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHdoaWxlIChjb250YWluZXJcblx0XHRcdCYmXG5cdFx0XHRjb250YWluZXIgIT09IHRoaXMuX2JvZHkpIHtcblx0XHRcdGlmICgoY29udGFpbmVyIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QgJiYgKGNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdvdXRwdXQnKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29udGFpbmVyID0gY29udGFpbmVyLnBhcmVudE5vZGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0X2RpZEZvY3VzT3V0cHV0SW5wdXRDaGFuZ2UoaGFzRm9jdXM6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9vdXRwdXRJbnB1dEZvY3VzLnNldChoYXNGb2N1cyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRWRpdG9yIEZlYXR1cmVzXG5cblx0Zm9jdXNFbGVtZW50KGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy52aWV3TW9kZWw/LnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSGFuZGxlLFxuXHRcdFx0cHJpbWFyeTogY2VsbC5oYW5kbGUsXG5cdFx0XHRzZWxlY3Rpb25zOiBbY2VsbC5oYW5kbGVdXG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnNjcm9sbFRvcDtcblx0fVxuXG5cdGdldCBzY3JvbGxCb3R0b20oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3Quc2Nyb2xsVG9wICsgdGhpcy5fbGlzdC5nZXRSZW5kZXJIZWlnaHQoKTtcblx0fVxuXG5cdGdldEFic29sdXRlVG9wT2ZFbGVtZW50KGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AoY2VsbCk7XG5cdH1cblxuXHRnZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsQm90dG9tKGNlbGwpO1xuXHR9XG5cblx0Z2V0SGVpZ2h0T2ZFbGVtZW50KGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QuZWxlbWVudEhlaWdodChjZWxsKTtcblx0fVxuXG5cdHNjcm9sbFRvQm90dG9tKCkge1xuXHRcdHRoaXMuX2xpc3Quc2Nyb2xsVG9Cb3R0b20oKTtcblx0fVxuXG5cdHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3Quc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuXHR9XG5cblx0cmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KHJhbmdlOiBJQ2VsbFJhbmdlKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsQ2VsbHMocmFuZ2UpO1xuXHR9XG5cblx0cmV2ZWFsSW5WaWV3KGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsQ2VsbChjZWxsLCBDZWxsUmV2ZWFsVHlwZS5EZWZhdWx0KTtcblx0fVxuXG5cdHJldmVhbEluVmlld0F0VG9wKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy5fbGlzdC5yZXZlYWxDZWxsKGNlbGwsIENlbGxSZXZlYWxUeXBlLlRvcCk7XG5cdH1cblxuXHRyZXZlYWxJbkNlbnRlcihjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHRoaXMuX2xpc3QucmV2ZWFsQ2VsbChjZWxsLCBDZWxsUmV2ZWFsVHlwZS5DZW50ZXIpO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGF3YWl0IHRoaXMuX2xpc3QucmV2ZWFsQ2VsbChjZWxsLCBDZWxsUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCk7XG5cdH1cblxuXHRhc3luYyByZXZlYWxGaXJzdExpbmVJZk91dHNpZGVWaWV3cG9ydChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGF3YWl0IHRoaXMuX2xpc3QucmV2ZWFsQ2VsbChjZWxsLCBDZWxsUmV2ZWFsVHlwZS5GaXJzdExpbmVJZk91dHNpZGVWaWV3cG9ydCk7XG5cdH1cblxuXHRhc3luYyByZXZlYWxMaW5lSW5WaWV3QXN5bmMoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGxpbmU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbFJhbmdlSW5DZWxsKGNlbGwsIG5ldyBSYW5nZShsaW5lLCAxLCBsaW5lLCAxKSwgQ2VsbFJldmVhbFJhbmdlVHlwZS5EZWZhdWx0KTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbExpbmVJbkNlbnRlckFzeW5jKGNlbGw6IElDZWxsVmlld01vZGVsLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5yZXZlYWxSYW5nZUluQ2VsbChjZWxsLCBuZXcgUmFuZ2UobGluZSwgMSwgbGluZSwgMSksIENlbGxSZXZlYWxSYW5nZVR5cGUuQ2VudGVyKTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0QXN5bmMoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGxpbmU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbFJhbmdlSW5DZWxsKGNlbGwsIG5ldyBSYW5nZShsaW5lLCAxLCBsaW5lLCAxKSwgQ2VsbFJldmVhbFJhbmdlVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCk7XG5cdH1cblxuXHRhc3luYyByZXZlYWxSYW5nZUluVmlld0FzeW5jKGNlbGw6IElDZWxsVmlld01vZGVsLCByYW5nZTogU2VsZWN0aW9uIHwgUmFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5yZXZlYWxSYW5nZUluQ2VsbChjZWxsLCByYW5nZSwgQ2VsbFJldmVhbFJhbmdlVHlwZS5EZWZhdWx0KTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbFJhbmdlSW5DZW50ZXJBc3luYyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFNlbGVjdGlvbiB8IFJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsUmFuZ2VJbkNlbGwoY2VsbCwgcmFuZ2UsIENlbGxSZXZlYWxSYW5nZVR5cGUuQ2VudGVyKTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydEFzeW5jKGNlbGw6IElDZWxsVmlld01vZGVsLCByYW5nZTogU2VsZWN0aW9uIHwgUmFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5yZXZlYWxSYW5nZUluQ2VsbChjZWxsLCByYW5nZSwgQ2VsbFJldmVhbFJhbmdlVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCk7XG5cdH1cblxuXHRyZXZlYWxDZWxsT2Zmc2V0SW5DZW50ZXIoY2VsbDogSUNlbGxWaWV3TW9kZWwsIG9mZnNldDogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsQ2VsbE9mZnNldEluQ2VudGVyKGNlbGwsIG9mZnNldCk7XG5cdH1cblxuXHRyZXZlYWxPZmZzZXRJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KG9mZnNldDogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsT2Zmc2V0SW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChvZmZzZXQpO1xuXHR9XG5cblx0Z2V0Vmlld0luZGV4QnlNb2RlbEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fbGlzdFZpZXdJbmZvQWNjZXNzb3IpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMudmlld01vZGVsPy52aWV3Q2VsbHNbaW5kZXhdO1xuXHRcdGlmICghY2VsbCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3Nvci5nZXRWaWV3SW5kZXgoY2VsbCk7XG5cdH1cblxuXHRnZXRWaWV3SGVpZ2h0KGNlbGw6IElDZWxsVmlld01vZGVsKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yLmdldFZpZXdIZWlnaHQoY2VsbCk7XG5cdH1cblxuXHRnZXRDZWxsUmFuZ2VGcm9tVmlld1JhbmdlKHN0YXJ0SW5kZXg6IG51bWJlciwgZW5kSW5kZXg6IG51bWJlcik6IElDZWxsUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3Nvci5nZXRDZWxsUmFuZ2VGcm9tVmlld1JhbmdlKHN0YXJ0SW5kZXgsIGVuZEluZGV4KTtcblx0fVxuXG5cdGdldENlbGxzSW5SYW5nZShyYW5nZT86IElDZWxsUmFuZ2UpOiBSZWFkb25seUFycmF5PElDZWxsVmlld01vZGVsPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yLmdldENlbGxzSW5SYW5nZShyYW5nZSk7XG5cdH1cblxuXHRzZXRDZWxsRWRpdG9yU2VsZWN0aW9uKGNlbGw6IElDZWxsVmlld01vZGVsLCByYW5nZTogUmFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnNldENlbGxFZGl0b3JTZWxlY3Rpb24oY2VsbCwgcmFuZ2UpO1xuXHR9XG5cblx0c2V0SGlkZGVuQXJlYXMoX3JhbmdlczogSUNlbGxSYW5nZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3Quc2V0SGlkZGVuQXJlYXMoX3JhbmdlcywgdHJ1ZSk7XG5cdH1cblxuXHRnZXRWaXNpYmxlUmFuZ2VzUGx1c1ZpZXdwb3J0QWJvdmVBbmRCZWxvdygpOiBJQ2VsbFJhbmdlW10ge1xuXHRcdHJldHVybiB0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3Nvci5nZXRWaXNpYmxlUmFuZ2VzUGx1c1ZpZXdwb3J0QWJvdmVBbmRCZWxvdygpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIERlY29yYXRpb25zXG5cblx0ZGVsdGFDZWxsRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnM6IHN0cmluZ1tdLCBuZXdEZWNvcmF0aW9uczogSU5vdGVib29rRGVsdGFEZWNvcmF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmV0ID0gdGhpcy52aWV3TW9kZWw/LmRlbHRhQ2VsbERlY29yYXRpb25zKG9sZERlY29yYXRpb25zLCBuZXdEZWNvcmF0aW9ucykgfHwgW107XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKCk7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGRlbHRhQ2VsbENvbnRhaW5lckNsYXNzTmFtZXMoY2VsbElkOiBzdHJpbmcsIGFkZGVkOiBzdHJpbmdbXSwgcmVtb3ZlZDogc3RyaW5nW10sIGNlbGxraW5kOiBDZWxsS2luZCk6IHZvaWQge1xuXHRcdGlmIChjZWxsa2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3Py5kZWx0YU1hcmt1cFByZXZpZXdDbGFzc05hbWVzKGNlbGxJZCwgYWRkZWQsIHJlbW92ZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3Py5kZWx0YUNlbGxPdXRwdXRDb250YWluZXJDbGFzc05hbWVzKGNlbGxJZCwgYWRkZWQsIHJlbW92ZWQpO1xuXHRcdH1cblx0fVxuXG5cdGNoYW5nZU1vZGVsRGVjb3JhdGlvbnM8VD4oY2FsbGJhY2s6IChjaGFuZ2VBY2Nlc3NvcjogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvcikgPT4gVCk6IFQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LmNoYW5nZU1vZGVsRGVjb3JhdGlvbnM8VD4oY2FsbGJhY2spIHx8IG51bGw7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVmlldyBab25lc1xuXHRjaGFuZ2VWaWV3Wm9uZXMoY2FsbGJhY2s6IChhY2Nlc3NvcjogSU5vdGVib29rVmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3QuY2hhbmdlVmlld1pvbmVzKGNhbGxiYWNrKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxheW91dC5maXJlKCk7XG5cdH1cblxuXHRnZXRWaWV3Wm9uZUxheW91dEluZm8oaWQ6IHN0cmluZyk6IHsgdG9wOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5nZXRWaWV3Wm9uZUxheW91dEluZm8oaWQpO1xuXHR9XG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBPdmVybGF5XG5cdGNoYW5nZUNlbGxPdmVybGF5cyhjYWxsYmFjazogKGFjY2Vzc29yOiBJTm90ZWJvb2tDZWxsT3ZlcmxheUNoYW5nZUFjY2Vzc29yKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC5jaGFuZ2VDZWxsT3ZlcmxheXMoY2FsbGJhY2spO1xuXHR9XG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBLZXJuZWwvRXhlY3V0aW9uXG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZEtlcm5lbFByZWxvYWRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgc2VsZWN0ZWQgfSA9IHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKHRoaXMudGV4dE1vZGVsKTtcblx0XHRpZiAoIXRoaXMuX3dlYnZpZXc/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHR9XG5cdFx0dGhpcy5fd2Vidmlldz8udXBkYXRlS2VybmVsUHJlbG9hZHMoc2VsZWN0ZWQpO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUtlcm5lbCgpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXh0TW9kZWwgJiYgdGhpcy5ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0U2VsZWN0ZWRPclN1Z2dlc3RlZEtlcm5lbCh0aGlzLnRleHRNb2RlbCk7XG5cdH1cblxuXHRhc3luYyBjYW5jZWxOb3RlYm9va0NlbGxzKGNlbGxzPzogSXRlcmFibGU8SUNlbGxWaWV3TW9kZWw+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCAhdGhpcy5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghY2VsbHMpIHtcblx0XHRcdGNlbGxzID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuY2FuY2VsTm90ZWJvb2tDZWxsSGFuZGxlcyh0aGlzLnRleHRNb2RlbCwgQXJyYXkuZnJvbShjZWxscykubWFwKGNlbGwgPT4gY2VsbC5oYW5kbGUpKTtcblx0fVxuXG5cdGFzeW5jIGV4ZWN1dGVOb3RlYm9va0NlbGxzKGNlbGxzPzogSXRlcmFibGU8SUNlbGxWaWV3TW9kZWw+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCAhdGhpcy5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnbm90ZWJvb2tFZGl0b3JXaWRnZXQnLCAnTm8gTm90ZWJvb2tWaWV3TW9kZWwsIGNhbm5vdCBleGVjdXRlIGNlbGxzJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghY2VsbHMpIHtcblx0XHRcdGNlbGxzID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuZXhlY3V0ZU5vdGVib29rQ2VsbHModGhpcy50ZXh0TW9kZWwsIEFycmF5LmZyb20oY2VsbHMpLm1hcChjID0+IGMubW9kZWwpLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdGFzeW5jIGxheW91dE5vdGVib29rQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgaGVpZ2h0OiBudW1iZXIsIGNvbnRleHQ/OiBDZWxsTGF5b3V0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9jZWxsTGF5b3V0TWFuYWdlcj8ubGF5b3V0Tm90ZWJvb2tDZWxsKGNlbGwsIGhlaWdodCk7XG5cdH1cblxuXHRnZXRBY3RpdmVDZWxsKCkge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblxuXHRcdGlmIChlbGVtZW50cyAmJiBlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBlbGVtZW50c1swXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9nZ2xlTm90ZWJvb2tDZWxsU2VsZWN0aW9uKHNlbGVjdGVkQ2VsbDogSUNlbGxWaWV3TW9kZWwsIHNlbGVjdEZyb21QcmV2aW91czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRTZWxlY3Rpb25zID0gdGhpcy5fbGlzdC5nZXRTZWxlY3RlZEVsZW1lbnRzKCk7XG5cdFx0Y29uc3QgaXNTZWxlY3RlZCA9IGN1cnJlbnRTZWxlY3Rpb25zLmluY2x1ZGVzKHNlbGVjdGVkQ2VsbCk7XG5cblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGlvbiA9IHNlbGVjdEZyb21QcmV2aW91cyA/IGN1cnJlbnRTZWxlY3Rpb25zW2N1cnJlbnRTZWxlY3Rpb25zLmxlbmd0aCAtIDFdID8/IHNlbGVjdGVkQ2VsbCA6IHNlbGVjdGVkQ2VsbDtcblx0XHRjb25zdCBzZWxlY3RlZEluZGV4ID0gdGhpcy5fbGlzdC5nZXRWaWV3SW5kZXgoc2VsZWN0ZWRDZWxsKSE7XG5cdFx0Y29uc3QgcHJldmlvdXNJbmRleCA9IHRoaXMuX2xpc3QuZ2V0Vmlld0luZGV4KHByZXZpb3VzU2VsZWN0aW9uKSE7XG5cblx0XHRjb25zdCBjZWxsc0luU2VsZWN0aW9uUmFuZ2UgPSB0aGlzLmdldENlbGxzSW5WaWV3UmFuZ2Uoc2VsZWN0ZWRJbmRleCwgcHJldmlvdXNJbmRleCk7XG5cdFx0aWYgKGlzU2VsZWN0ZWQpIHtcblx0XHRcdC8vIERlc2VsZWN0XG5cdFx0XHR0aGlzLl9saXN0LnNlbGVjdEVsZW1lbnRzKGN1cnJlbnRTZWxlY3Rpb25zLmZpbHRlcihjdXJyZW50ID0+ICFjZWxsc0luU2VsZWN0aW9uUmFuZ2UuaW5jbHVkZXMoY3VycmVudCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQWRkIHRvIHNlbGVjdGlvblxuXHRcdFx0dGhpcy5mb2N1c0VsZW1lbnQoc2VsZWN0ZWRDZWxsKTtcblx0XHRcdHRoaXMuX2xpc3Quc2VsZWN0RWxlbWVudHMoWy4uLmN1cnJlbnRTZWxlY3Rpb25zLmZpbHRlcihjdXJyZW50ID0+ICFjZWxsc0luU2VsZWN0aW9uUmFuZ2UuaW5jbHVkZXMoY3VycmVudCkpLCAuLi5jZWxsc0luU2VsZWN0aW9uUmFuZ2VdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldENlbGxzSW5WaWV3UmFuZ2UoZnJvbUluY2x1c2l2ZTogbnVtYmVyLCB0b0luY2x1c2l2ZTogbnVtYmVyKTogSUNlbGxWaWV3TW9kZWxbXSB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRDZWxsc0luUmFuZ2U6IElDZWxsVmlld01vZGVsW10gPSBbXTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5fbGlzdC5sZW5ndGg7ICsraW5kZXgpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9saXN0LmVsZW1lbnQoaW5kZXgpO1xuXHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0aWYgKChpbmRleCA+PSBmcm9tSW5jbHVzaXZlICYmIGluZGV4IDw9IHRvSW5jbHVzaXZlKSB8fCAoaW5kZXggPj0gdG9JbmNsdXNpdmUgJiYgaW5kZXggPD0gZnJvbUluY2x1c2l2ZSkpIHtcblx0XHRcdFx0XHRzZWxlY3RlZENlbGxzSW5SYW5nZS5wdXNoKGNlbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZWxlY3RlZENlbGxzSW5SYW5nZTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzTm90ZWJvb2tDZWxsKGNlbGw6IElDZWxsVmlld01vZGVsLCBmb2N1c0l0ZW06ICdlZGl0b3InIHwgJ2NvbnRhaW5lcicgfCAnb3V0cHV0Jywgb3B0aW9ucz86IElGb2N1c05vdGVib29rQ2VsbE9wdGlvbnMpIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNlbGwuZm9jdXNlZE91dHB1dElkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGZvY3VzSXRlbSA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdGNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5mb2N1c0VsZW1lbnQoY2VsbCk7XG5cdFx0XHR0aGlzLl9saXN0LmZvY3VzVmlldygpO1xuXG5cdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICdmb2N1c05vdGVib29rQ2VsbCcpO1xuXHRcdFx0Y2VsbC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkVkaXRvcjtcblx0XHRcdGlmICghb3B0aW9ucz8uc2tpcFJldmVhbCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LmZvY3VzRWRpdG9yTGluZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJzb3JOYXZNb2RlLnNldCh0cnVlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbExpbmVJblZpZXdBc3luYyhjZWxsLCBvcHRpb25zLmZvY3VzRWRpdG9yTGluZSk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fcmVuZGVyZWRFZGl0b3JzLmdldChjZWxsKSE7XG5cdFx0XHRcdFx0Y29uc3QgZm9jdXNFZGl0b3JMaW5lID0gb3B0aW9ucy5mb2N1c0VkaXRvckxpbmU7XG5cdFx0XHRcdFx0ZWRpdG9yPy5zZXRTZWxlY3Rpb24oe1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBmb2N1c0VkaXRvckxpbmUsXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGZvY3VzRWRpdG9yTGluZSxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogMVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnNTdGFydFBvc2l0aW9uID0gY2VsbC5nZXRTZWxlY3Rpb25zU3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb25zU3RhcnRQb3NpdGlvbj8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmaXJzdFNlbGVjdGlvblBvc2l0aW9uID0gc2VsZWN0aW9uc1N0YXJ0UG9zaXRpb25bMF07XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbFJhbmdlSW5WaWV3QXN5bmMoY2VsbCwgUmFuZ2UuZnJvbVBvc2l0aW9ucyhmaXJzdFNlbGVjdGlvblBvc2l0aW9uLCBmaXJzdFNlbGVjdGlvblBvc2l0aW9uKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsSW5WaWV3KGNlbGwpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9XG5cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGZvY3VzSXRlbSA9PT0gJ291dHB1dCcpIHtcblx0XHRcdHRoaXMuZm9jdXNFbGVtZW50KGNlbGwpO1xuXG5cdFx0XHRpZiAoIXRoaXMuaGFzRWRpdG9yRm9jdXMoKSkge1xuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzVmlldygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaXJzdE91dHB1dElkID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5maW5kKG8gPT4gby5tb2RlbC5hbHRlcm5hdGl2ZU91dHB1dElkKT8ubW9kZWwuYWx0ZXJuYXRpdmVPdXRwdXRJZDtcblx0XHRcdGNvbnN0IGZvY3VzRWxlbWVudElkID0gb3B0aW9ucz8ub3V0cHV0SWQgPz8gZmlyc3RPdXRwdXRJZCA/PyBjZWxsLmlkO1xuXHRcdFx0dGhpcy5fd2Vidmlldy5mb2N1c091dHB1dChmb2N1c0VsZW1lbnRJZCwgb3B0aW9ucz8uYWx0T3V0cHV0SWQsIG9wdGlvbnM/Lm91dHB1dFdlYnZpZXdGb2N1c2VkIHx8IHRoaXMuX3dlYnZpZXdGb2N1c2VkKTtcblxuXHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCAnZm9jdXNOb3RlYm9va0NlbGwnKTtcblx0XHRcdGNlbGwuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5PdXRwdXQ7XG5cdFx0XHRjZWxsLmZvY3VzZWRPdXRwdXRJZCA9IG9wdGlvbnM/Lm91dHB1dElkO1xuXHRcdFx0dGhpcy5fb3V0cHV0Rm9jdXMuc2V0KHRydWUpO1xuXHRcdFx0aWYgKCFvcHRpb25zPy5za2lwUmV2ZWFsKSB7XG5cdFx0XHRcdHRoaXMucmV2ZWFsSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChjZWxsKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZm9jdXMgY29udGFpbmVyXG5cdFx0XHRjb25zdCBpdGVtRE9NID0gdGhpcy5fbGlzdC5kb21FbGVtZW50T2ZFbGVtZW50KGNlbGwpO1xuXHRcdFx0aWYgKGl0ZW1ET00gJiYgaXRlbURPTS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgaXRlbURPTS5jb250YWlucyhpdGVtRE9NLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdFx0KGl0ZW1ET00ub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50KS5ibHVyKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3dlYnZpZXc/LmJsdXJPdXRwdXQoKTtcblxuXHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCAnZm9jdXNOb3RlYm9va0NlbGwnKTtcblx0XHRcdGNlbGwuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5Db250YWluZXI7XG5cblx0XHRcdHRoaXMuZm9jdXNFbGVtZW50KGNlbGwpO1xuXHRcdFx0aWYgKCFvcHRpb25zPy5za2lwUmV2ZWFsKSB7XG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8uZm9jdXNFZGl0b3JMaW5lID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnNvck5hdk1vZGUuc2V0KHRydWUpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsSW5WaWV3KGNlbGwpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnM/LnJldmVhbEJlaGF2aW9yID09PSBTY3JvbGxUb1JldmVhbEJlaGF2aW9yLmZpcnN0TGluZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsRmlyc3RMaW5lSWZPdXRzaWRlVmlld3BvcnQoY2VsbCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAob3B0aW9ucz8ucmV2ZWFsQmVoYXZpb3IgPT09IFNjcm9sbFRvUmV2ZWFsQmVoYXZpb3IuZnVsbENlbGwpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbEluVmlldyhjZWxsKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoY2VsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2xpc3QuZm9jdXNWaWV3KCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9jdXNOZXh0Tm90ZWJvb2tDZWxsKGNlbGw6IElDZWxsVmlld01vZGVsLCBmb2N1c0l0ZW06ICdlZGl0b3InIHwgJ2NvbnRhaW5lcicgfCAnb3V0cHV0Jykge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMudmlld01vZGVsPy5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdFx0aWYgKHR5cGVvZiBpZHggIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3Q2VsbCA9IHRoaXMudmlld01vZGVsPy5jZWxsQXQoaWR4ICsgMSk7XG5cdFx0aWYgKCFuZXdDZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5mb2N1c05vdGVib29rQ2VsbChuZXdDZWxsLCBmb2N1c0l0ZW0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbmRcblxuXHRwcml2YXRlIGFzeW5jIF93YXJtdXBDZWxsKHZpZXdDZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGlmICh2aWV3Q2VsbC5pc091dHB1dENvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dHMgPSB2aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscztcblx0XHRmb3IgKGNvbnN0IG91dHB1dCBvZiBvdXRwdXRzLnNsaWNlKDAsIG91dHB1dERpc3BsYXlMaW1pdCkpIHtcblx0XHRcdGNvbnN0IFttaW1lVHlwZXMsIHBpY2tdID0gb3V0cHV0LnJlc29sdmVNaW1lVHlwZXModGhpcy50ZXh0TW9kZWwhLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCFtaW1lVHlwZXMuZmluZChtaW1lVHlwZSA9PiBtaW1lVHlwZS5pc1RydXN0ZWQpIHx8IG1pbWVUeXBlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBpY2tlZE1pbWVUeXBlUmVuZGVyZXIgPSBtaW1lVHlwZXNbcGlja107XG5cblx0XHRcdGlmICghcGlja2VkTWltZVR5cGVSZW5kZXJlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldFJlbmRlcmVySW5mbyhwaWNrZWRNaW1lVHlwZVJlbmRlcmVyLnJlbmRlcmVySWQpO1xuXG5cdFx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBJSW5zZXRSZW5kZXJPdXRwdXQgPSB7IHR5cGU6IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uLCByZW5kZXJlciwgc291cmNlOiBvdXRwdXQsIG1pbWVUeXBlOiBwaWNrZWRNaW1lVHlwZVJlbmRlcmVyLm1pbWVUeXBlIH07XG5cdFx0XHRjb25zdCBpbnNldCA9IHRoaXMuX3dlYnZpZXc/Lmluc2V0TWFwcGluZy5nZXQocmVzdWx0LnNvdXJjZSk7XG5cdFx0XHRpZiAoIWluc2V0IHx8ICFpbnNldC5pbml0aWFsaXplZCkge1xuXHRcdFx0XHRjb25zdCBwID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMub25EaWRSZW5kZXJPdXRwdXQsIHRoaXMub25EaWRSZW1vdmVPdXRwdXQpKGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGUubW9kZWwgPT09IHJlc3VsdC5zb3VyY2UubW9kZWwpIHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuY3JlYXRlT3V0cHV0KHZpZXdDZWxsLCByZXN1bHQsIDAsIGZhbHNlKTtcblx0XHRcdFx0YXdhaXQgcDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHJlcXVlc3QgdG8gdXBkYXRlIGl0cyB2aXNpYmlsaXR5XG5cdFx0XHRcdHRoaXMuY3JlYXRlT3V0cHV0KHZpZXdDZWxsLCByZXN1bHQsIDAsIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FybXVwQWxsKGluY2x1ZGVPdXRwdXQ6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuaGFzTW9kZWwoKSB8fCAhdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxscyA9IHRoaXMudmlld01vZGVsLnZpZXdDZWxscztcblx0XHRjb25zdCByZXF1ZXN0cyA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGNlbGxzW2ldLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgIXRoaXMuX3dlYnZpZXchLm1hcmt1cFByZXZpZXdNYXBwaW5nLmhhcyhjZWxsc1tpXS5pZCkpIHtcblx0XHRcdFx0cmVxdWVzdHMucHVzaCh0aGlzLmNyZWF0ZU1hcmt1cFByZXZpZXcoY2VsbHNbaV0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5jbHVkZU91dHB1dCAmJiB0aGlzLl9saXN0KSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2xpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2xpc3QuZWxlbWVudChpKTtcblxuXHRcdFx0XHRpZiAoY2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0XHRyZXF1ZXN0cy5wdXNoKHRoaXMuX3dhcm11cENlbGwoKGNlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVxdWVzdHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FybXVwU2VsZWN0aW9uKGluY2x1ZGVPdXRwdXQ6IGJvb2xlYW4sIHNlbGVjdGVkQ2VsbFJhbmdlczogSUNlbGxSYW5nZVtdKSB7XG5cdFx0aWYgKCF0aGlzLmhhc01vZGVsKCkgfHwgIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbHMgPSB0aGlzLnZpZXdNb2RlbC52aWV3Q2VsbHM7XG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBbXTtcblxuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2Ygc2VsZWN0ZWRDZWxsUmFuZ2VzKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPCByYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0XHRpZiAoY2VsbHNbaV0uY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiAhdGhpcy5fd2VidmlldyEubWFya3VwUHJldmlld01hcHBpbmcuaGFzKGNlbGxzW2ldLmlkKSkge1xuXHRcdFx0XHRcdHJlcXVlc3RzLnB1c2godGhpcy5jcmVhdGVNYXJrdXBQcmV2aWV3KGNlbGxzW2ldKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5jbHVkZU91dHB1dCAmJiB0aGlzLl9saXN0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHNlbGVjdGVkQ2VsbFJhbmdlcykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPCByYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9saXN0LmVsZW1lbnQoaSk7XG5cblx0XHRcdFx0XHRpZiAoY2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0XHRcdHJlcXVlc3RzLnB1c2godGhpcy5fd2FybXVwQ2VsbCgoY2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVxdWVzdHMpO1xuXHR9XG5cblx0YXN5bmMgZmluZChxdWVyeTogc3RyaW5nLCBvcHRpb25zOiBJTm90ZWJvb2tGaW5kT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBza2lwV2FybXVwOiBib29sZWFuID0gZmFsc2UsIHNob3VsZEdldFNlYXJjaFByZXZpZXdJbmZvID0gZmFsc2UsIG93bmVySUQ/OiBzdHJpbmcpOiBQcm9taXNlPENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXT4ge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoIW93bmVySUQpIHtcblx0XHRcdG93bmVySUQgPSB0aGlzLmdldElkKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmluZE1hdGNoZXMgPSB0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbC5maW5kKHF1ZXJ5LCBvcHRpb25zKS5maWx0ZXIobWF0Y2ggPT4gbWF0Y2gubGVuZ3RoID4gMCk7XG5cblx0XHRpZiAoKCFvcHRpb25zLmluY2x1ZGVNYXJrdXBQcmV2aWV3ICYmICFvcHRpb25zLmluY2x1ZGVPdXRwdXQpIHx8IG9wdGlvbnMuZmluZFNjb3BlPy5maW5kU2NvcGVUeXBlID09PSBOb3RlYm9va0ZpbmRTY29wZVR5cGUuVGV4dCkge1xuXHRcdFx0dGhpcy5fd2Vidmlldz8uZmluZFN0b3Aob3duZXJJRCk7XG5cdFx0XHRyZXR1cm4gZmluZE1hdGNoZXM7XG5cdFx0fVxuXG5cdFx0Ly8gc2VhcmNoIGluIHdlYnZpZXcgZW5hYmxlZFxuXG5cdFx0Y29uc3QgbWF0Y2hNYXA6IHsgW2tleTogc3RyaW5nXTogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCB9ID0ge307XG5cdFx0ZmluZE1hdGNoZXMuZm9yRWFjaChtYXRjaCA9PiB7XG5cdFx0XHRtYXRjaE1hcFttYXRjaC5jZWxsLmlkXSA9IG1hdGNoO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdC8vIHJlcXVlc3QgYWxsIG9yIHNvbWUgb3V0cHV0cyB0byBiZSByZW5kZXJlZFxuXHRcdFx0Ly8gbWVhc3VyZSBwZXJmXG5cdFx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0XHRpZiAob3B0aW9ucy5maW5kU2NvcGUgJiYgb3B0aW9ucy5maW5kU2NvcGUuZmluZFNjb3BlVHlwZSA9PT0gTm90ZWJvb2tGaW5kU2NvcGVUeXBlLkNlbGxzICYmIG9wdGlvbnMuZmluZFNjb3BlLnNlbGVjdGVkQ2VsbFJhbmdlcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93YXJtdXBTZWxlY3Rpb24oISFvcHRpb25zLmluY2x1ZGVPdXRwdXQsIG9wdGlvbnMuZmluZFNjb3BlLnNlbGVjdGVkQ2VsbFJhbmdlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93YXJtdXBBbGwoISFvcHRpb25zLmluY2x1ZGVPdXRwdXQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW5kID0gRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnRmluZCcsIGBXYXJtdXAgdGltZTogJHtlbmQgLSBzdGFydH1tc2ApO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZmluZElkczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmIChvcHRpb25zLmZpbmRTY29wZSAmJiBvcHRpb25zLmZpbmRTY29wZS5maW5kU2NvcGVUeXBlID09PSBOb3RlYm9va0ZpbmRTY29wZVR5cGUuQ2VsbHMgJiYgb3B0aW9ucy5maW5kU2NvcGUuc2VsZWN0ZWRDZWxsUmFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkSW5kZXhlcyA9IGNlbGxSYW5nZXNUb0luZGV4ZXMob3B0aW9ucy5maW5kU2NvcGUuc2VsZWN0ZWRDZWxsUmFuZ2VzKTtcblx0XHRcdFx0ZmluZElkcyA9IHNlbGVjdGVkSW5kZXhlcy5tYXA8c3RyaW5nPihpbmRleCA9PiB0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbD8udmlld0NlbGxzW2luZGV4XS5pZCA/PyAnJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYnZpZXdNYXRjaGVzID0gYXdhaXQgdGhpcy5fd2Vidmlldy5maW5kKHF1ZXJ5LCB7IGNhc2VTZW5zaXRpdmU6IG9wdGlvbnMuY2FzZVNlbnNpdGl2ZSwgd2hvbGVXb3JkOiBvcHRpb25zLndob2xlV29yZCwgaW5jbHVkZU1hcmt1cDogISFvcHRpb25zLmluY2x1ZGVNYXJrdXBQcmV2aWV3LCBpbmNsdWRlT3V0cHV0OiAhIW9wdGlvbnMuaW5jbHVkZU91dHB1dCwgc2hvdWxkR2V0U2VhcmNoUHJldmlld0luZm8sIG93bmVySUQsIGZpbmRJZHM6IGZpbmRJZHMgfSk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdC8vIGF0dGFjaCB3ZWJ2aWV3IG1hdGNoZXMgdG8gbW9kZWwgZmluZCBtYXRjaGVzXG5cdFx0XHR3ZWJ2aWV3TWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX25vdGVib29rVmlld01vZGVsIS52aWV3Q2VsbHMuZmluZChjZWxsID0+IGNlbGwuaWQgPT09IG1hdGNoLmNlbGxJZCk7XG5cblx0XHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoLnR5cGUgPT09ICdwcmV2aWV3Jykge1xuXHRcdFx0XHRcdC8vIG1hcmt1cCBwcmV2aWV3XG5cdFx0XHRcdFx0aWYgKGNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuUHJldmlldyAmJiAhb3B0aW9ucy5pbmNsdWRlTWFya3VwUHJldmlldykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcgJiYgb3B0aW9ucy5pbmNsdWRlTWFya3VwSW5wdXQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCFvcHRpb25zLmluY2x1ZGVPdXRwdXQpIHtcblx0XHRcdFx0XHRcdC8vIHNraXAgb3V0cHV0cyBpZiBub3QgaW5jbHVkZWRcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleGlzaXRpbmdNYXRjaCA9IG1hdGNoTWFwW21hdGNoLmNlbGxJZF07XG5cblx0XHRcdFx0aWYgKGV4aXNpdGluZ01hdGNoKSB7XG5cdFx0XHRcdFx0ZXhpc2l0aW5nTWF0Y2gud2Vidmlld01hdGNoZXMucHVzaChtYXRjaCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cblx0XHRcdFx0XHRtYXRjaE1hcFttYXRjaC5jZWxsSWRdID0gbmV3IENlbGxGaW5kTWF0Y2hNb2RlbChcblx0XHRcdFx0XHRcdHRoaXMuX25vdGVib29rVmlld01vZGVsIS52aWV3Q2VsbHMuZmluZChjZWxsID0+IGNlbGwuaWQgPT09IG1hdGNoLmNlbGxJZCkhLFxuXHRcdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwhLnZpZXdDZWxscy5maW5kSW5kZXgoY2VsbCA9PiBjZWxsLmlkID09PSBtYXRjaC5jZWxsSWQpISxcblx0XHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdFx0W21hdGNoXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldDogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdID0gW107XG5cdFx0dGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwudmlld0NlbGxzLmZvckVhY2goKGNlbGwsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAobWF0Y2hNYXBbY2VsbC5pZF0pIHtcblx0XHRcdFx0cmV0LnB1c2gobmV3IENlbGxGaW5kTWF0Y2hNb2RlbChjZWxsLCBpbmRleCwgbWF0Y2hNYXBbY2VsbC5pZF0uY29udGVudE1hdGNoZXMsIG1hdGNoTWFwW2NlbGwuaWRdLndlYnZpZXdNYXRjaGVzKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0YXN5bmMgZmluZEhpZ2hsaWdodEN1cnJlbnQobWF0Y2hJbmRleDogbnVtYmVyLCBvd25lcklEPzogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3Py5maW5kSGlnaGxpZ2h0Q3VycmVudChtYXRjaEluZGV4LCBvd25lcklEID8/IHRoaXMuZ2V0SWQoKSk7XG5cdH1cblxuXHRhc3luYyBmaW5kVW5IaWdobGlnaHRDdXJyZW50KG1hdGNoSW5kZXg6IG51bWJlciwgb3duZXJJRD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fd2Vidmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3Py5maW5kVW5IaWdobGlnaHRDdXJyZW50KG1hdGNoSW5kZXgsIG93bmVySUQgPz8gdGhpcy5nZXRJZCgpKTtcblx0fVxuXG5cdGZpbmRTdG9wKG93bmVySUQ/OiBzdHJpbmcpIHtcblx0XHR0aGlzLl93ZWJ2aWV3Py5maW5kU3RvcChvd25lcklEID8/IHRoaXMuZ2V0SWQoKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTUlTQ1xuXG5cdGdldExheW91dEluZm8oKTogTm90ZWJvb2tMYXlvdXRJbmZvIHtcblx0XHRpZiAoIXRoaXMuX2xpc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRWRpdG9yIGlzIG5vdCBpbml0YWxpemVkIHN1Y2Nlc3NmdWxseScpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZm9udEluZm8pIHtcblx0XHRcdHRoaXMuX2dlbmVyYXRlRm9udEluZm8oKTtcblx0XHR9XG5cblx0XHRsZXQgbGlzdFZpZXdPZmZzZXQgPSAwO1xuXHRcdGlmICh0aGlzLl9kaW1lbnNpb24pIHtcblx0XHRcdGxpc3RWaWV3T2Zmc2V0ID0gKHRoaXMuX25vdGVib29rVG9wVG9vbGJhcj8udXNlR2xvYmFsVG9vbGJhciA/IC8qKiBUb29sYmFyIGhlaWdodCAqLyAyNiA6IDApICsgKHRoaXMuX25vdGVib29rU3RpY2t5U2Nyb2xsPy5nZXRDdXJyZW50U3RpY2t5SGVpZ2h0KCkgPz8gMCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZHRoOiB0aGlzLl9kaW1lbnNpb24/LndpZHRoID8/IDAsXG5cdFx0XHRoZWlnaHQ6IHRoaXMuX2RpbWVuc2lvbj8uaGVpZ2h0ID8/IDAsXG5cdFx0XHRzY3JvbGxIZWlnaHQ6IHRoaXMuX2xpc3Q/LmdldFNjcm9sbEhlaWdodCgpID8/IDAsXG5cdFx0XHRmb250SW5mbzogdGhpcy5fZm9udEluZm8hLFxuXHRcdFx0c3RpY2t5SGVpZ2h0OiB0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbD8uZ2V0Q3VycmVudFN0aWNreUhlaWdodCgpID8/IDAsXG5cdFx0XHRsaXN0Vmlld09mZnNldFRvcDogbGlzdFZpZXdPZmZzZXRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTWFya3VwUHJldmlldyhjZWxsOiBNYXJrdXBDZWxsVmlld01vZGVsKSB7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcgfHwgIXRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudmlld01vZGVsIHx8ICF0aGlzLl9saXN0LnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5nZXRDZWxsSW5kZXgoY2VsbCkgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2VsbElzSGlkZGVuKGNlbGwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2Vidmlld1RvcCA9IHBhcnNlSW50KHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AsIDEwKTtcblx0XHRjb25zdCB0b3AgPSAhIXdlYnZpZXdUb3AgPyAoMCAtIHdlYnZpZXdUb3ApIDogMDtcblxuXHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGwpO1xuXHRcdGF3YWl0IHRoaXMuX3dlYnZpZXcuc2hvd01hcmt1cFByZXZpZXcoe1xuXHRcdFx0bWltZTogY2VsbC5taW1lLFxuXHRcdFx0Y2VsbEhhbmRsZTogY2VsbC5oYW5kbGUsXG5cdFx0XHRjZWxsSWQ6IGNlbGwuaWQsXG5cdFx0XHRjb250ZW50OiBjZWxsLmdldFRleHQoKSxcblx0XHRcdG9mZnNldDogY2VsbFRvcCArIHRvcCxcblx0XHRcdHZpc2libGU6IHRydWUsXG5cdFx0XHRtZXRhZGF0YTogY2VsbC5tZXRhZGF0YSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2VsbElzSGlkZGVuKGNlbGw6IElDZWxsVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWxJbmRleCA9IHRoaXMudmlld01vZGVsIS5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdFx0Y29uc3QgZm9sZGVkUmFuZ2VzID0gdGhpcy52aWV3TW9kZWwhLmdldEhpZGRlblJhbmdlcygpO1xuXHRcdHJldHVybiBmb2xkZWRSYW5nZXMuc29tZShyYW5nZSA9PiBtb2RlbEluZGV4ID49IHJhbmdlLnN0YXJ0ICYmIG1vZGVsSW5kZXggPD0gcmFuZ2UuZW5kKTtcblx0fVxuXG5cdGFzeW5jIHVuaGlkZU1hcmt1cFByZXZpZXdzKGNlbGxzOiByZWFkb25seSBNYXJrdXBDZWxsVmlld01vZGVsW10pIHtcblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlV2VidmlldygpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3dlYnZpZXc/LnVuaGlkZU1hcmt1cFByZXZpZXdzKGNlbGxzLm1hcChjZWxsID0+IGNlbGwuaWQpKTtcblx0fVxuXG5cdGFzeW5jIGhpZGVNYXJrdXBQcmV2aWV3cyhjZWxsczogcmVhZG9ubHkgTWFya3VwQ2VsbFZpZXdNb2RlbFtdKSB7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3IHx8ICFjZWxscy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlV2VidmlldygpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3dlYnZpZXc/LmhpZGVNYXJrdXBQcmV2aWV3cyhjZWxscy5tYXAoY2VsbCA9PiBjZWxsLmlkKSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVNYXJrdXBQcmV2aWV3cyhjZWxsczogcmVhZG9ubHkgTWFya3VwQ2VsbFZpZXdNb2RlbFtdKSB7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3Py5kZWxldGVNYXJrdXBQcmV2aWV3cyhjZWxscy5tYXAoY2VsbCA9PiBjZWxsLmlkKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVNlbGVjdGVkTWFya2Rvd25QcmV2aWV3cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlV2VidmlldygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkQ2VsbHMgPSB0aGlzLmdldFNlbGVjdGlvblZpZXdNb2RlbHMoKS5tYXAoY2VsbCA9PiBjZWxsLmlkKTtcblxuXHRcdC8vIE9ubHkgc2hvdyBzZWxlY3Rpb24gd2hlbiB0aGVyZSBpcyBtb3JlIHRoYW4gMSBjZWxsIHNlbGVjdGVkXG5cdFx0YXdhaXQgdGhpcy5fd2Vidmlldz8udXBkYXRlTWFya3VwUHJldmlld1NlbGVjdGlvbnMoc2VsZWN0ZWRDZWxscy5sZW5ndGggPiAxID8gc2VsZWN0ZWRDZWxscyA6IFtdKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU91dHB1dChjZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCwgb3V0cHV0OiBJSW5zZXRSZW5kZXJPdXRwdXQsIG9mZnNldDogbnVtYmVyLCBjcmVhdGVXaGVuSWRsZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2luc2V0TW9kaWZ5UXVldWVCeU91dHB1dElkLnF1ZXVlKG91dHB1dC5zb3VyY2UubW9kZWwub3V0cHV0SWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8ICF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlV2VidmlldygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3V0cHV0LnR5cGUgPT09IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZy5wcmVwYXJlKG91dHB1dC5yZW5kZXJlci5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYnZpZXdUb3AgPSBwYXJzZUludCh0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wLCAxMCk7XG5cdFx0XHRjb25zdCB0b3AgPSAhIXdlYnZpZXdUb3AgPyAoMCAtIHdlYnZpZXdUb3ApIDogMDtcblxuXHRcdFx0Y29uc3QgY2VsbFRvcCA9IHRoaXMuX2xpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AoY2VsbCkgKyB0b3A7XG5cblx0XHRcdGNvbnN0IGV4aXN0aW5nT3V0cHV0ID0gdGhpcy5fd2Vidmlldy5pbnNldE1hcHBpbmcuZ2V0KG91dHB1dC5zb3VyY2UpO1xuXHRcdFx0aWYgKCFleGlzdGluZ091dHB1dFxuXHRcdFx0XHR8fCAoIWV4aXN0aW5nT3V0cHV0LnJlbmRlcmVyICYmIG91dHB1dC50eXBlID09PSBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbilcblx0XHRcdCkge1xuXHRcdFx0XHRpZiAoY3JlYXRlV2hlbklkbGUpIHtcblx0XHRcdFx0XHR0aGlzLl93ZWJ2aWV3LnJlcXVlc3RDcmVhdGVPdXRwdXRXaGVuV2Vidmlld0lkbGUoeyBjZWxsSWQ6IGNlbGwuaWQsIGNlbGxIYW5kbGU6IGNlbGwuaGFuZGxlLCBjZWxsVXJpOiBjZWxsLnVyaSwgZXhlY3V0aW9uSWQ6IGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5leGVjdXRpb25JZCB9LCBvdXRwdXQsIGNlbGxUb3AsIG9mZnNldCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fd2Vidmlldy5jcmVhdGVPdXRwdXQoeyBjZWxsSWQ6IGNlbGwuaWQsIGNlbGxIYW5kbGU6IGNlbGwuaGFuZGxlLCBjZWxsVXJpOiBjZWxsLnVyaSwgZXhlY3V0aW9uSWQ6IGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5leGVjdXRpb25JZCB9LCBvdXRwdXQsIGNlbGxUb3AsIG9mZnNldCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXhpc3RpbmdPdXRwdXQucmVuZGVyZXJcblx0XHRcdFx0JiYgb3V0cHV0LnR5cGUgPT09IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uXG5cdFx0XHRcdCYmIGV4aXN0aW5nT3V0cHV0LnJlbmRlcmVyLmlkICE9PSBvdXRwdXQucmVuZGVyZXIuaWQpIHtcblx0XHRcdFx0Ly8gc3dpdGNoIG1pbWV0eXBlXG5cdFx0XHRcdHRoaXMuX3dlYnZpZXcucmVtb3ZlSW5zZXRzKFtvdXRwdXQuc291cmNlXSk7XG5cdFx0XHRcdHRoaXMuX3dlYnZpZXcuY3JlYXRlT3V0cHV0KHsgY2VsbElkOiBjZWxsLmlkLCBjZWxsSGFuZGxlOiBjZWxsLmhhbmRsZSwgY2VsbFVyaTogY2VsbC51cmkgfSwgb3V0cHV0LCBjZWxsVG9wLCBvZmZzZXQpO1xuXHRcdFx0fSBlbHNlIGlmIChleGlzdGluZ091dHB1dC52ZXJzaW9uSWQgIT09IG91dHB1dC5zb3VyY2UubW9kZWwudmVyc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMuX3dlYnZpZXcudXBkYXRlT3V0cHV0KHsgY2VsbElkOiBjZWxsLmlkLCBjZWxsSGFuZGxlOiBjZWxsLmhhbmRsZSwgY2VsbFVyaTogY2VsbC51cmksIGV4ZWN1dGlvbklkOiBjZWxsLmludGVybmFsTWV0YWRhdGEuZXhlY3V0aW9uSWQgfSwgb3V0cHV0LCBjZWxsVG9wLCBvZmZzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0SW5kZXggPSBjZWxsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2Yob3V0cHV0LnNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IG91dHB1dE9mZnNldCA9IGNlbGwuZ2V0T3V0cHV0T2Zmc2V0KG91dHB1dEluZGV4KTtcblx0XHRcdFx0dGhpcy5fd2Vidmlldy51cGRhdGVTY3JvbGxUb3BzKFt7XG5cdFx0XHRcdFx0Y2VsbCxcblx0XHRcdFx0XHRvdXRwdXQ6IG91dHB1dC5zb3VyY2UsXG5cdFx0XHRcdFx0Y2VsbFRvcCxcblx0XHRcdFx0XHRvdXRwdXRPZmZzZXQsXG5cdFx0XHRcdFx0Zm9yY2VEaXNwbGF5OiAhY2VsbC5pc091dHB1dENvbGxhcHNlZCxcblx0XHRcdFx0fV0sIFtdKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU91dHB1dChjZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCwgb3V0cHV0OiBJSW5zZXRSZW5kZXJPdXRwdXQsIG9mZnNldDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5faW5zZXRNb2RpZnlRdWV1ZUJ5T3V0cHV0SWQucXVldWUob3V0cHV0LnNvdXJjZS5tb2RlbC5vdXRwdXRJZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQgfHwgIXRoaXMuX3dlYnZpZXcgfHwgY2VsbC5pc091dHB1dENvbGxhcHNlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fd2Vidmlldy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl93ZWJ2aWV3IHx8ICF0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl93ZWJ2aWV3Lmluc2V0TWFwcGluZy5oYXMob3V0cHV0LnNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlT3V0cHV0KGNlbGwsIG91dHB1dCwgb2Zmc2V0LCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvdXRwdXQudHlwZSA9PT0gUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24pIHtcblx0XHRcdFx0dGhpcy5ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nLnByZXBhcmUob3V0cHV0LnJlbmRlcmVyLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2Vidmlld1RvcCA9IHBhcnNlSW50KHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AsIDEwKTtcblx0XHRcdGNvbnN0IHRvcCA9ICEhd2Vidmlld1RvcCA/ICgwIC0gd2Vidmlld1RvcCkgOiAwO1xuXG5cdFx0XHRjb25zdCBjZWxsVG9wID0gdGhpcy5fbGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChjZWxsKSArIHRvcDtcblx0XHRcdHRoaXMuX3dlYnZpZXcudXBkYXRlT3V0cHV0KHsgY2VsbElkOiBjZWxsLmlkLCBjZWxsSGFuZGxlOiBjZWxsLmhhbmRsZSwgY2VsbFVyaTogY2VsbC51cmkgfSwgb3V0cHV0LCBjZWxsVG9wLCBvZmZzZXQpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgY29weU91dHB1dEltYWdlKGNlbGxPdXRwdXQ6IElDZWxsT3V0cHV0Vmlld01vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fd2Vidmlldz8uY29weUltYWdlKGNlbGxPdXRwdXQpO1xuXHR9XG5cblx0cmVtb3ZlSW5zZXQob3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCkge1xuXHRcdHRoaXMuX2luc2V0TW9kaWZ5UXVldWVCeU91dHB1dElkLnF1ZXVlKG91dHB1dC5tb2RlbC5vdXRwdXRJZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQgfHwgIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fd2Vidmlldz8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX3dlYnZpZXcucmVtb3ZlSW5zZXRzKFtvdXRwdXRdKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmVPdXRwdXQuZmlyZShvdXRwdXQpO1xuXHRcdH0pO1xuXHR9XG5cblx0aGlkZUluc2V0KG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl9pbnNldE1vZGlmeVF1ZXVlQnlPdXRwdXRJZC5xdWV1ZShvdXRwdXQubW9kZWwub3V0cHV0SWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8ICF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3dlYnZpZXc/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3LmhpZGVJbnNldChvdXRwdXQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jcmVnaW9uIC0tLSB3ZWJ2aWV3IElQQyAtLS0tXG5cdHBvc3RNZXNzYWdlKG1lc3NhZ2U6IHVua25vd24pIHtcblx0XHRpZiAodGhpcy5fd2Vidmlldz8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3LnBvc3RLZXJuZWxNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdGFkZENsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZykge1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuXHR9XG5cblx0cmVtb3ZlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZSk7XG5cdH1cblxuXHRjZWxsQXQoaW5kZXg6IG51bWJlcik6IElDZWxsVmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LmNlbGxBdChpbmRleCk7XG5cdH1cblxuXHRnZXRDZWxsQnlJbmZvKGNlbGxJbmZvOiBJQ29tbW9uQ2VsbEluZm8pOiBJQ2VsbFZpZXdNb2RlbCB7XG5cdFx0Y29uc3QgeyBjZWxsSGFuZGxlIH0gPSBjZWxsSW5mbztcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LnZpZXdDZWxscy5maW5kKHZjID0+IHZjLmhhbmRsZSA9PT0gY2VsbEhhbmRsZSkgYXMgQ29kZUNlbGxWaWV3TW9kZWw7XG5cdH1cblxuXHRnZXRDZWxsQnlIYW5kbGUoaGFuZGxlOiBudW1iZXIpOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5nZXRDZWxsQnlIYW5kbGUoaGFuZGxlKTtcblx0fVxuXG5cdGdldENlbGxJbmRleChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8uZ2V0Q2VsbEluZGV4QnlIYW5kbGUoY2VsbC5oYW5kbGUpO1xuXHR9XG5cblx0Z2V0TmV4dFZpc2libGVDZWxsSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5nZXROZXh0VmlzaWJsZUNlbGxJbmRleChpbmRleCk7XG5cdH1cblxuXHRnZXRQcmV2aW91c1Zpc2libGVDZWxsSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5nZXRQcmV2aW91c1Zpc2libGVDZWxsSW5kZXgoaW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2Nyb2xsSGVpZ2h0KCkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8ICF0aGlzLl93ZWJ2aWV3Py5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSB0aGlzLl9saXN0LnNjcm9sbEhlaWdodDtcblx0XHR0aGlzLl93ZWJ2aWV3LmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7c2Nyb2xsSGVpZ2h0ICsgTk9URUJPT0tfV0VCVklFV19CT1VOREFSWSAqIDJ9cHhgO1xuXG5cdFx0Y29uc3Qgd2Vidmlld1RvcCA9IHBhcnNlSW50KHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AsIDEwKTtcblx0XHRjb25zdCB0b3AgPSAhIXdlYnZpZXdUb3AgPyAoMCAtIHdlYnZpZXdUb3ApIDogMDtcblxuXHRcdGNvbnN0IHVwZGF0ZUl0ZW1zOiBJRGlzcGxheU91dHB1dExheW91dFVwZGF0ZVJlcXVlc3RbXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW92ZWRJdGVtczogSUNlbGxPdXRwdXRWaWV3TW9kZWxbXSA9IFtdO1xuXHRcdHRoaXMuX3dlYnZpZXc/Lmluc2V0TWFwcGluZy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy52aWV3TW9kZWw/LmdldENlbGxCeUhhbmRsZSh2YWx1ZS5jZWxsSW5mby5jZWxsSGFuZGxlKTtcblx0XHRcdGlmICghY2VsbCB8fCAhKGNlbGwgaW5zdGFuY2VvZiBDb2RlQ2VsbFZpZXdNb2RlbCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2aWV3SW5kZXggPSB0aGlzLl9saXN0LmdldFZpZXdJbmRleChjZWxsKTtcblxuXHRcdFx0aWYgKHZpZXdJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3V0cHV0SW5kZXggPSBjZWxsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2Yoa2V5KTtcblx0XHRcdGlmIChvdXRwdXRJbmRleCA8IDApIHtcblx0XHRcdFx0Ly8gb3V0cHV0IGlzIGFscmVhZHkgZ29uZVxuXHRcdFx0XHRyZW1vdmVkSXRlbXMucHVzaChrZXkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGwpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0T2Zmc2V0ID0gY2VsbC5nZXRPdXRwdXRPZmZzZXQob3V0cHV0SW5kZXgpO1xuXHRcdFx0dXBkYXRlSXRlbXMucHVzaCh7XG5cdFx0XHRcdGNlbGwsXG5cdFx0XHRcdG91dHB1dDoga2V5LFxuXHRcdFx0XHRjZWxsVG9wOiBjZWxsVG9wICsgdG9wLFxuXHRcdFx0XHRvdXRwdXRPZmZzZXQsXG5cdFx0XHRcdGZvcmNlRGlzcGxheTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3dlYnZpZXcucmVtb3ZlSW5zZXRzKHJlbW92ZWRJdGVtcyk7XG5cblx0XHRjb25zdCBtYXJrZG93blVwZGF0ZUl0ZW1zOiB7IGlkOiBzdHJpbmc7IHRvcDogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2VsbElkIG9mIHRoaXMuX3dlYnZpZXcubWFya3VwUHJldmlld01hcHBpbmcua2V5cygpKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy52aWV3TW9kZWw/LnZpZXdDZWxscy5maW5kKGNlbGwgPT4gY2VsbC5pZCA9PT0gY2VsbElkKTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGwpO1xuXHRcdFx0XHQvLyBtYXJrZG93blVwZGF0ZUl0ZW1zLnB1c2goeyBpZDogY2VsbElkLCB0b3A6IGNlbGxUb3AgfSk7XG5cdFx0XHRcdG1hcmtkb3duVXBkYXRlSXRlbXMucHVzaCh7IGlkOiBjZWxsSWQsIHRvcDogY2VsbFRvcCArIHRvcCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobWFya2Rvd25VcGRhdGVJdGVtcy5sZW5ndGggfHwgdXBkYXRlSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9kZWJ1ZygnX2xpc3Qub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0L21hcmtkb3duJywgbWFya2Rvd25VcGRhdGVJdGVtcyk7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3Py51cGRhdGVTY3JvbGxUb3BzKHVwZGF0ZUl0ZW1zLCBtYXJrZG93blVwZGF0ZUl0ZW1zKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQmFja2xheWVyV2VidmlldyBkZWxlZ2F0ZVxuXHRwcml2YXRlIF91cGRhdGVPdXRwdXRIZWlnaHQoY2VsbEluZm86IElDb21tb25DZWxsSW5mbywgb3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgb3V0cHV0SGVpZ2h0OiBudW1iZXIsIGlzSW5pdDogYm9vbGVhbiwgc291cmNlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMudmlld01vZGVsPy52aWV3Q2VsbHMuZmluZCh2YyA9PiB2Yy5oYW5kbGUgPT09IGNlbGxJbmZvLmNlbGxIYW5kbGUpO1xuXHRcdGlmIChjZWxsICYmIGNlbGwgaW5zdGFuY2VvZiBDb2RlQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0SW5kZXggPSBjZWxsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2Yob3V0cHV0KTtcblx0XHRcdGlmIChvdXRwdXRJbmRleCA+IC0xKSB7XG5cdFx0XHRcdHRoaXMuX2RlYnVnKCd1cGRhdGUgY2VsbCBvdXRwdXQnLCBjZWxsLmhhbmRsZSwgb3V0cHV0SGVpZ2h0KTtcblx0XHRcdFx0Y2VsbC51cGRhdGVPdXRwdXRIZWlnaHQob3V0cHV0SW5kZXgsIG91dHB1dEhlaWdodCwgc291cmNlKTtcblx0XHRcdFx0dGhpcy5sYXlvdXROb3RlYm9va0NlbGwoY2VsbCwgY2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0KTtcblxuXHRcdFx0XHRpZiAoaXNJbml0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZW5kZXJPdXRwdXQuZmlyZShvdXRwdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kZWJ1ZygndHJpZWQgdG8gdXBkYXRlIGNlbGwgb3V0cHV0IHRoYXQgZG9lcyBub3QgZXhpc3QnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nT3V0cHV0SGVpZ2h0QWNrcyA9IG5ldyBNYXA8Lyogb3V0cHV0SWQgKi8gc3RyaW5nLCBJQWNrT3V0cHV0SGVpZ2h0PigpO1xuXG5cdHByaXZhdGUgX3NjaGVkdWxlT3V0cHV0SGVpZ2h0QWNrKGNlbGxJbmZvOiBJQ29tbW9uQ2VsbEluZm8sIG91dHB1dElkOiBzdHJpbmcsIGhlaWdodDogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgd2FzRW1wdHkgPSB0aGlzLl9wZW5kaW5nT3V0cHV0SGVpZ2h0QWNrcy5zaXplID09PSAwO1xuXHRcdHRoaXMuX3BlbmRpbmdPdXRwdXRIZWlnaHRBY2tzLnNldChvdXRwdXRJZCwgeyBjZWxsSWQ6IGNlbGxJbmZvLmNlbGxJZCwgb3V0cHV0SWQsIGhlaWdodCB9KTtcblxuXHRcdGlmICh3YXNFbXB0eSkge1xuXHRcdFx0RE9NLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSksICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZGVidWcoJ2FjayBoZWlnaHQnKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlU2Nyb2xsSGVpZ2h0KCk7XG5cblx0XHRcdFx0dGhpcy5fd2Vidmlldz8uYWNrSGVpZ2h0KFsuLi50aGlzLl9wZW5kaW5nT3V0cHV0SGVpZ2h0QWNrcy52YWx1ZXMoKV0pO1xuXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdPdXRwdXRIZWlnaHRBY2tzLmNsZWFyKCk7XG5cdFx0XHR9LCAtMSk7IC8vIC0xIHByaW9yaXR5IGJlY2F1c2UgdGhpcyBkZXBlbmRzIG9uIGNhbGxzIHRvIGxheW91dE5vdGVib29rQ2VsbCwgYW5kIHRoYXQgbWF5IGJlIGNhbGxlZCBtdWx0aXBsZSB0aW1lcyBiZWZvcmUgdGhpcyBydW5zXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2VsbEJ5SWQoY2VsbElkOiBzdHJpbmcpOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy52aWV3Q2VsbHMuZmluZCh2YyA9PiB2Yy5pZCA9PT0gY2VsbElkKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1hcmt1cENlbGxIZWlnaHQoY2VsbElkOiBzdHJpbmcsIGhlaWdodDogbnVtYmVyLCBpc0luaXQ6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fZ2V0Q2VsbEJ5SWQoY2VsbElkKTtcblx0XHRpZiAoY2VsbCAmJiBjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3QgeyBib3R0b21Ub29sYmFyR2FwIH0gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHRoaXMudmlld01vZGVsPy52aWV3VHlwZSk7XG5cdFx0XHR0aGlzLl9kZWJ1ZygndXBkYXRlTWFya2Rvd25DZWxsSGVpZ2h0JywgY2VsbC5oYW5kbGUsIGhlaWdodCArIGJvdHRvbVRvb2xiYXJHYXAsIGlzSW5pdCk7XG5cdFx0XHRjZWxsLnJlbmRlcmVkTWFya2Rvd25IZWlnaHQgPSBoZWlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0TWFya3VwQ2VsbEVkaXRTdGF0ZShjZWxsSWQ6IHN0cmluZywgZWRpdFN0YXRlOiBDZWxsRWRpdFN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2dldENlbGxCeUlkKGNlbGxJZCk7XG5cdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBNYXJrdXBDZWxsVmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLnJldmVhbEluVmlldyhjZWxsKTtcblx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKGVkaXRTdGF0ZSwgJ3NldE1hcmtkb3duQ2VsbEVkaXRTdGF0ZScpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RpZFN0YXJ0RHJhZ01hcmt1cENlbGwoY2VsbElkOiBzdHJpbmcsIGV2ZW50OiB7IGRyYWdPZmZzZXRZOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3Qgd2Vidmlld09mZnNldCA9IHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQgPyAtcGFyc2VJbnQodGhpcy5fbGlzdC53ZWJ2aWV3RWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCwgMTApIDogMDtcblx0XHRcdHRoaXMuX2RuZENvbnRyb2xsZXI/LnN0YXJ0RXhwbGljaXREcmFnKGNlbGwsIGV2ZW50LmRyYWdPZmZzZXRZIC0gd2Vidmlld09mZnNldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlkRHJhZ01hcmt1cENlbGwoY2VsbElkOiBzdHJpbmcsIGV2ZW50OiB7IGRyYWdPZmZzZXRZOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3Qgd2Vidmlld09mZnNldCA9IHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQgPyAtcGFyc2VJbnQodGhpcy5fbGlzdC53ZWJ2aWV3RWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCwgMTApIDogMDtcblx0XHRcdHRoaXMuX2RuZENvbnRyb2xsZXI/LmV4cGxpY2l0RHJhZyhjZWxsLCBldmVudC5kcmFnT2Zmc2V0WSAtIHdlYnZpZXdPZmZzZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RpZERyb3BNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nLCBldmVudDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyOyBjdHJsS2V5OiBib29sZWFuOyBhbHRLZXk6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3Qgd2Vidmlld09mZnNldCA9IHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQgPyAtcGFyc2VJbnQodGhpcy5fbGlzdC53ZWJ2aWV3RWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCwgMTApIDogMDtcblx0XHRcdGV2ZW50LmRyYWdPZmZzZXRZIC09IHdlYnZpZXdPZmZzZXQ7XG5cdFx0XHR0aGlzLl9kbmRDb250cm9sbGVyPy5leHBsaWNpdERyb3AoY2VsbCwgZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RpZEVuZERyYWdNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2dldENlbGxCeUlkKGNlbGxJZCk7XG5cdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBNYXJrdXBDZWxsVmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLl9kbmRDb250cm9sbGVyPy5lbmRFeHBsaWNpdERyYWcoY2VsbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlkUmVzaXplT3V0cHV0KGNlbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2dldENlbGxCeUlkKGNlbGxJZCk7XG5cdFx0aWYgKGNlbGwpIHtcblx0XHRcdHRoaXMuX29uRGlkUmVzaXplT3V0cHV0RW1pdHRlci5maXJlKGNlbGwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVBlcmZvcm1hbmNlTWV0YWRhdGEoY2VsbElkOiBzdHJpbmcsIGV4ZWN1dGlvbklkOiBzdHJpbmcsIGR1cmF0aW9uOiBudW1iZXIsIHJlbmRlcmVySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2dldENlbGxCeUlkKGNlbGxJZCk7XG5cdFx0Y29uc3QgY2VsbEluZGV4ID0gIWNlbGwgPyB1bmRlZmluZWQgOiB0aGlzLmdldENlbGxJbmRleChjZWxsKTtcblx0XHRpZiAoY2VsbD8uaW50ZXJuYWxNZXRhZGF0YS5leGVjdXRpb25JZCA9PT0gZXhlY3V0aW9uSWQgJiYgY2VsbEluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHJlbmRlckR1cmF0aW9uTWFwID0gY2VsbC5pbnRlcm5hbE1ldGFkYXRhLnJlbmRlckR1cmF0aW9uIHx8IHt9O1xuXHRcdFx0cmVuZGVyRHVyYXRpb25NYXBbcmVuZGVyZXJJZF0gPSAocmVuZGVyRHVyYXRpb25NYXBbcmVuZGVyZXJJZF0gPz8gMCkgKyBkdXJhdGlvbjtcblxuXHRcdFx0dGhpcy50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhLFxuXHRcdFx0XHRcdGluZGV4OiBjZWxsSW5kZXgsXG5cdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZXhlY3V0aW9uSWQ6IGV4ZWN1dGlvbklkLFxuXHRcdFx0XHRcdFx0cmVuZGVyRHVyYXRpb246IHJlbmRlckR1cmF0aW9uTWFwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRWRpdG9yIENvbnRyaWJ1dGlvbnNcblx0Z2V0Q29udHJpYnV0aW9uPFQgZXh0ZW5kcyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24+KGlkOiBzdHJpbmcpOiBUIHtcblx0XHRyZXR1cm4gPFQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGlkKSB8fCBudWxsKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0Ly8gZGlzcG9zZSB3ZWJ2aWV3IGZpcnN0XG5cdFx0dGhpcy5fd2Vidmlldz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3dlYnZpZXcgPSBudWxsO1xuXG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvclNlcnZpY2UucmVtb3ZlTm90ZWJvb2tFZGl0b3IodGhpcyk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9jb250cmlidXRpb25zLnZhbHVlcygpKTtcblx0XHR0aGlzLl9jb250cmlidXRpb25zLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmNsZWFyKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9sb2NhbENlbGxTdGF0ZUxpc3RlbmVycyk7XG5cdFx0dGhpcy5fbGlzdC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2VsbExheW91dE1hbmFnZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9saXN0VG9wQ2VsbFRvb2xiYXI/LmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0dGhpcy52aWV3TW9kZWw/LmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5jbGVhcigpO1xuXHRcdHRoaXMuX2Jhc2VDZWxsRWRpdG9yT3B0aW9ucy5mb3JFYWNoKHYgPT4gdi5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuX2Jhc2VDZWxsRWRpdG9yT3B0aW9ucy5jbGVhcigpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tPdmVydmlld1J1bGVyQ29udGFpbmVyLnJlbW92ZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gdW5yZWZcblx0XHR0aGlzLl93ZWJ2aWV3ID0gbnVsbDtcblx0XHR0aGlzLl93ZWJ2aWV3UmVzb2x2ZVByb21pc2UgPSBudWxsO1xuXHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyID0gbnVsbDtcblx0XHR0aGlzLl9kbmRDb250cm9sbGVyID0gbnVsbDtcblx0XHR0aGlzLl9saXN0VG9wQ2VsbFRvb2xiYXIgPSBudWxsO1xuXHRcdHRoaXMuX25vdGVib29rVmlld01vZGVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NlbGxDb250ZXh0S2V5TWFuYWdlciA9IG51bGw7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyID0gbnVsbCE7XG5cdFx0dGhpcy5fbGlzdCA9IG51bGwhO1xuXHRcdHRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yID0gbnVsbCE7XG5cdFx0dGhpcy5fbGlzdERlbGVnYXRlID0gbnVsbDtcblx0fVxuXG5cdHRvSlNPTigpOiB7IG5vdGVib29rVXJpOiBVUkkgfCB1bmRlZmluZWQgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5vdGVib29rVXJpOiB0aGlzLnZpZXdNb2RlbD8udXJpLFxuXHRcdH07XG5cdH1cbn1cblxucmVnaXN0ZXJaSW5kZXgoWkluZGV4LkJhc2UsIDUsICdub3RlYm9vay1wcm9ncmVzcy1iYXInLCk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMTAsICdub3RlYm9vay1saXN0LWluc2VydGlvbi1pbmRpY2F0b3InKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAyMCwgJ25vdGVib29rLWNlbGwtZWRpdG9yLW91dGxpbmUnKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAyNSwgJ25vdGVib29rLXNjcm9sbGJhcicpO1xucmVnaXN0ZXJaSW5kZXgoWkluZGV4LkJhc2UsIDI2LCAnbm90ZWJvb2stY2VsbC1zdGF0dXMnKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAyNiwgJ25vdGVib29rLWZvbGRpbmctaW5kaWNhdG9yJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMjcsICdub3RlYm9vay1vdXRwdXQnKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAyOCwgJ25vdGVib29rLWNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMjksICdub3RlYm9vay1ydW4tYnV0dG9uLWNvbnRhaW5lcicpO1xucmVnaXN0ZXJaSW5kZXgoWkluZGV4LkJhc2UsIDI5LCAnbm90ZWJvb2staW5wdXQtY29sbGFwc2UtY29uZGljb24nKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAzMCwgJ25vdGVib29rLWNlbGwtb3V0cHV0LXRvb2xiYXInKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5TYXNoLCAxLCAnbm90ZWJvb2stY2VsbC1leHBhbmQtcGFydC1idXR0b24nKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5TYXNoLCAyLCAnbm90ZWJvb2stY2VsbC10b29sYmFyJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguU2FzaCwgMywgJ25vdGVib29rLWNlbGwtdG9vbGJhci1kcm9wZG93bi1hY3RpdmUnKTtcblxuZXhwb3J0IGNvbnN0IG5vdGVib29rQ2VsbEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmNlbGxCb3JkZXJDb2xvcicsIHtcblx0ZGFyazogdHJhbnNwYXJlbnQobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgMSksXG5cdGxpZ2h0OiB0cmFuc3BhcmVudChsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCAxKSxcblx0aGNEYXJrOiBQQU5FTF9CT1JERVIsXG5cdGhjTGlnaHQ6IFBBTkVMX0JPUkRFUlxufSwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsQm9yZGVyQ29sb3InLCBcIlRoZSBib3JkZXIgY29sb3IgZm9yIG5vdGVib29rIGNlbGxzLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBmb2N1c2VkRWRpdG9yQm9yZGVyQ29sb3IgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5mb2N1c2VkRWRpdG9yQm9yZGVyJywgZm9jdXNCb3JkZXIsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZm9jdXNlZEVkaXRvckJvcmRlcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBub3RlYm9vayBjZWxsIGVkaXRvciBib3JkZXIuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGNlbGxTdGF0dXNJY29uU3VjY2VzcyA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rU3RhdHVzU3VjY2Vzc0ljb24uZm9yZWdyb3VuZCcsIGRlYnVnSWNvblN0YXJ0Rm9yZWdyb3VuZCwgbmxzLmxvY2FsaXplKCdub3RlYm9va1N0YXR1c1N1Y2Nlc3NJY29uLmZvcmVncm91bmQnLCBcIlRoZSBlcnJvciBpY29uIGNvbG9yIG9mIG5vdGVib29rIGNlbGxzIGluIHRoZSBjZWxsIHN0YXR1cyBiYXIuXCIpKTtcblxuZXhwb3J0IGNvbnN0IHJ1bm5pbmdDZWxsUnVsZXJEZWNvcmF0aW9uQ29sb3IgPSByZWdpc3RlckNvbG9yKCdub3RlYm9va0VkaXRvck92ZXJ2aWV3UnVsZXIucnVubmluZ0NlbGxGb3JlZ3JvdW5kJywgZGVidWdJY29uU3RhcnRGb3JlZ3JvdW5kLCBubHMubG9jYWxpemUoJ25vdGVib29rRWRpdG9yT3ZlcnZpZXdSdWxlci5ydW5uaW5nQ2VsbEZvcmVncm91bmQnLCBcIlRoZSBjb2xvciBvZiB0aGUgcnVubmluZyBjZWxsIGRlY29yYXRpb24gaW4gdGhlIG5vdGVib29rIGVkaXRvciBvdmVydmlldyBydWxlci5cIikpO1xuXG5leHBvcnQgY29uc3QgY2VsbFN0YXR1c0ljb25FcnJvciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rU3RhdHVzRXJyb3JJY29uLmZvcmVncm91bmQnLCBlcnJvckZvcmVncm91bmQsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tTdGF0dXNFcnJvckljb24uZm9yZWdyb3VuZCcsIFwiVGhlIGVycm9yIGljb24gY29sb3Igb2Ygbm90ZWJvb2sgY2VsbHMgaW4gdGhlIGNlbGwgc3RhdHVzIGJhci5cIikpO1xuXG5leHBvcnQgY29uc3QgY2VsbFN0YXR1c0ljb25SdW5uaW5nID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2tTdGF0dXNSdW5uaW5nSWNvbi5mb3JlZ3JvdW5kJywgZm9yZWdyb3VuZCwgbmxzLmxvY2FsaXplKCdub3RlYm9va1N0YXR1c1J1bm5pbmdJY29uLmZvcmVncm91bmQnLCBcIlRoZSBydW5uaW5nIGljb24gY29sb3Igb2Ygbm90ZWJvb2sgY2VsbHMgaW4gdGhlIGNlbGwgc3RhdHVzIGJhci5cIikpO1xuXG5leHBvcnQgY29uc3Qgbm90ZWJvb2tPdXRwdXRDb250YWluZXJCb3JkZXJDb2xvciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLm91dHB1dENvbnRhaW5lckJvcmRlckNvbG9yJywgbnVsbCwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5vdXRwdXRDb250YWluZXJCb3JkZXJDb2xvcicsIFwiVGhlIGJvcmRlciBjb2xvciBvZiB0aGUgbm90ZWJvb2sgb3V0cHV0IGNvbnRhaW5lci5cIikpO1xuXG5leHBvcnQgY29uc3Qgbm90ZWJvb2tPdXRwdXRDb250YWluZXJDb2xvciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLm91dHB1dENvbnRhaW5lckJhY2tncm91bmRDb2xvcicsIG51bGwsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0Q29udGFpbmVyQmFja2dyb3VuZENvbG9yJywgXCJUaGUgY29sb3Igb2YgdGhlIG5vdGVib29rIG91dHB1dCBjb250YWluZXIgYmFja2dyb3VuZC5cIikpO1xuXG4vLyBUT0RPQHJlYm9ybml4IGN1cnJlbnRseSBhbHNvIHVzZWQgZm9yIHRvb2xiYXIgYm9yZGVyLCBpZiB3ZSBrZWVwIGFsbCBvZiB0aGlzLCBwaWNrIGEgZ2VuZXJpYyBuYW1lXG5leHBvcnQgY29uc3QgQ0VMTF9UT09MQkFSX1NFUEVSQVRPUiA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmNlbGxUb29sYmFyU2VwYXJhdG9yJywge1xuXHRkYXJrOiBDb2xvci5mcm9tSGV4KCcjODA4MDgwJykudHJhbnNwYXJlbnQoMC4zNSksXG5cdGxpZ2h0OiBDb2xvci5mcm9tSGV4KCcjODA4MDgwJykudHJhbnNwYXJlbnQoMC4zNSksXG5cdGhjRGFyazogY29udHJhc3RCb3JkZXIsXG5cdGhjTGlnaHQ6IGNvbnRyYXN0Qm9yZGVyXG59LCBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxUb29sYmFyU2VwYXJhdG9yJywgXCJUaGUgY29sb3Igb2YgdGhlIHNlcGFyYXRvciBpbiB0aGUgY2VsbCBib3R0b20gdG9vbGJhclwiKSk7XG5cbmV4cG9ydCBjb25zdCBmb2N1c2VkQ2VsbEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5mb2N1c2VkQ2VsbEJhY2tncm91bmQnLCBudWxsLCBubHMubG9jYWxpemUoJ2ZvY3VzZWRDZWxsQmFja2dyb3VuZCcsIFwiVGhlIGJhY2tncm91bmQgY29sb3Igb2YgYSBjZWxsIHdoZW4gdGhlIGNlbGwgaXMgZm9jdXNlZC5cIikpO1xuXG5leHBvcnQgY29uc3Qgc2VsZWN0ZWRDZWxsQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLnNlbGVjdGVkQ2VsbEJhY2tncm91bmQnLCB7XG5cdGRhcms6IGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsXG5cdGxpZ2h0OiBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIG5scy5sb2NhbGl6ZSgnc2VsZWN0ZWRDZWxsQmFja2dyb3VuZCcsIFwiVGhlIGJhY2tncm91bmQgY29sb3Igb2YgYSBjZWxsIHdoZW4gdGhlIGNlbGwgaXMgc2VsZWN0ZWQuXCIpKTtcblxuXG5leHBvcnQgY29uc3QgY2VsbEhvdmVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmNlbGxIb3ZlckJhY2tncm91bmQnLCB7XG5cdGRhcms6IHRyYW5zcGFyZW50KGZvY3VzZWRDZWxsQmFja2dyb3VuZCwgLjUpLFxuXHRsaWdodDogdHJhbnNwYXJlbnQoZm9jdXNlZENlbGxCYWNrZ3JvdW5kLCAuNyksXG5cdGhjRGFyazogbnVsbCxcblx0aGNMaWdodDogbnVsbFxufSwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsSG92ZXJCYWNrZ3JvdW5kJywgXCJUaGUgYmFja2dyb3VuZCBjb2xvciBvZiBhIGNlbGwgd2hlbiB0aGUgY2VsbCBpcyBob3ZlcmVkLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBzZWxlY3RlZENlbGxCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5zZWxlY3RlZENlbGxCb3JkZXInLCB7XG5cdGRhcms6IG5vdGVib29rQ2VsbEJvcmRlcixcblx0bGlnaHQ6IG5vdGVib29rQ2VsbEJvcmRlcixcblx0aGNEYXJrOiBjb250cmFzdEJvcmRlcixcblx0aGNMaWdodDogY29udHJhc3RCb3JkZXJcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2VsZWN0ZWRDZWxsQm9yZGVyJywgXCJUaGUgY29sb3Igb2YgdGhlIGNlbGwncyB0b3AgYW5kIGJvdHRvbSBib3JkZXIgd2hlbiB0aGUgY2VsbCBpcyBzZWxlY3RlZCBidXQgbm90IGZvY3VzZWQuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGluYWN0aXZlU2VsZWN0ZWRDZWxsQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suaW5hY3RpdmVTZWxlY3RlZENlbGxCb3JkZXInLCB7XG5cdGRhcms6IG51bGwsXG5cdGxpZ2h0OiBudWxsLFxuXHRoY0Rhcms6IGZvY3VzQm9yZGVyLFxuXHRoY0xpZ2h0OiBmb2N1c0JvcmRlclxufSwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5pbmFjdGl2ZVNlbGVjdGVkQ2VsbEJvcmRlcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBjZWxsJ3MgYm9yZGVycyB3aGVuIG11bHRpcGxlIGNlbGxzIGFyZSBzZWxlY3RlZC5cIikpO1xuXG5leHBvcnQgY29uc3QgZm9jdXNlZENlbGxCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5mb2N1c2VkQ2VsbEJvcmRlcicsIGZvY3VzQm9yZGVyLCBubHMubG9jYWxpemUoJ25vdGVib29rLmZvY3VzZWRDZWxsQm9yZGVyJywgXCJUaGUgY29sb3Igb2YgdGhlIGNlbGwncyBmb2N1cyBpbmRpY2F0b3IgYm9yZGVycyB3aGVuIHRoZSBjZWxsIGlzIGZvY3VzZWQuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyJywgbm90ZWJvb2tDZWxsQm9yZGVyLCBubHMubG9jYWxpemUoJ25vdGVib29rLmluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXInLCBcIlRoZSBjb2xvciBvZiB0aGUgY2VsbCdzIHRvcCBhbmQgYm90dG9tIGJvcmRlciB3aGVuIGEgY2VsbCBpcyBmb2N1c2VkIHdoaWxlIHRoZSBwcmltYXJ5IGZvY3VzIGlzIG91dHNpZGUgb2YgdGhlIGVkaXRvci5cIikpO1xuXG5leHBvcnQgY29uc3QgY2VsbFN0YXR1c0Jhckl0ZW1Ib3ZlciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmNlbGxTdGF0dXNCYXJJdGVtSG92ZXJCYWNrZ3JvdW5kJywge1xuXHRsaWdodDogbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDAsIDAuMDgpKSxcblx0ZGFyazogbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjU1LCAyNTUsIDAuMTUpKSxcblx0aGNEYXJrOiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAyNTUsIDI1NSwgMC4xNSkpLFxuXHRoY0xpZ2h0OiBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMCwgMCwgMC4wOCkpLFxufSwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsU3RhdHVzQmFySXRlbUhvdmVyQmFja2dyb3VuZCcsIFwiVGhlIGJhY2tncm91bmQgY29sb3Igb2Ygbm90ZWJvb2sgY2VsbCBzdGF0dXMgYmFyIGl0ZW1zLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBjZWxsSW5zZXJ0aW9uSW5kaWNhdG9yID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suY2VsbEluc2VydGlvbkluZGljYXRvcicsIGZvY3VzQm9yZGVyLCBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxJbnNlcnRpb25JbmRpY2F0b3InLCBcIlRoZSBjb2xvciBvZiB0aGUgbm90ZWJvb2sgY2VsbCBpbnNlcnRpb24gaW5kaWNhdG9yLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBsaXN0U2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rU2Nyb2xsYmFyU2xpZGVyLmJhY2tncm91bmQnLCBzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kLCBubHMubG9jYWxpemUoJ25vdGVib29rU2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZCcsIFwiTm90ZWJvb2sgc2Nyb2xsYmFyIHNsaWRlciBiYWNrZ3JvdW5kIGNvbG9yLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBsaXN0U2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2tTY3JvbGxiYXJTbGlkZXIuaG92ZXJCYWNrZ3JvdW5kJywgc2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kLCBubHMubG9jYWxpemUoJ25vdGVib29rU2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kJywgXCJOb3RlYm9vayBzY3JvbGxiYXIgc2xpZGVyIGJhY2tncm91bmQgY29sb3Igd2hlbiBob3ZlcmluZy5cIikpO1xuXG5leHBvcnQgY29uc3QgbGlzdFNjcm9sbGJhclNsaWRlckFjdGl2ZUJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdub3RlYm9va1Njcm9sbGJhclNsaWRlci5hY3RpdmVCYWNrZ3JvdW5kJywgc2Nyb2xsYmFyU2xpZGVyQWN0aXZlQmFja2dyb3VuZCwgbmxzLmxvY2FsaXplKCdub3RlYm9va1Njcm9sbGJhclNsaWRlckFjdGl2ZUJhY2tncm91bmQnLCBcIk5vdGVib29rIHNjcm9sbGJhciBzbGlkZXIgYmFja2dyb3VuZCBjb2xvciB3aGVuIGNsaWNrZWQgb24uXCIpKTtcblxuZXhwb3J0IGNvbnN0IGNlbGxTeW1ib2xIaWdobGlnaHQgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5zeW1ib2xIaWdobGlnaHRCYWNrZ3JvdW5kJywge1xuXHRkYXJrOiBDb2xvci5mcm9tSGV4KCcjZmZmZmZmMGInKSxcblx0bGlnaHQ6IENvbG9yLmZyb21IZXgoJyNmZGZmMDAzMycpLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc3ltYm9sSGlnaGxpZ2h0QmFja2dyb3VuZCcsIFwiQmFja2dyb3VuZCBjb2xvciBvZiBoaWdobGlnaHRlZCBjZWxsXCIpKTtcblxuZXhwb3J0IGNvbnN0IGNlbGxFZGl0b3JCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suY2VsbEVkaXRvckJhY2tncm91bmQnLCB7XG5cdGxpZ2h0OiBTSURFX0JBUl9CQUNLR1JPVU5ELFxuXHRkYXJrOiBTSURFX0JBUl9CQUNLR1JPVU5ELFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbEVkaXRvckJhY2tncm91bmQnLCBcIkNlbGwgZWRpdG9yIGJhY2tncm91bmQgY29sb3IuXCIpKTtcblxuY29uc3Qgbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suZWRpdG9yQmFja2dyb3VuZCcsIHtcblx0bGlnaHQ6IEVESVRPUl9QQU5FX0JBQ0tHUk9VTkQsXG5cdGRhcms6IEVESVRPUl9QQU5FX0JBQ0tHUk9VTkQsXG5cdGhjRGFyazogbnVsbCxcblx0aGNMaWdodDogbnVsbFxufSwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5lZGl0b3JCYWNrZ3JvdW5kJywgXCJOb3RlYm9vayBiYWNrZ3JvdW5kIGNvbG9yLlwiKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsWUFBWSxvQkFBb0I7QUFFaEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxPQUFPLFlBQVk7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxvQkFBb0IsWUFBWSxpQkFBaUIsU0FBUyx5QkFBeUI7QUFDNUYsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxTQUFTLGVBQWU7QUFFakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFJakMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxhQUFhO0FBRXRCLFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0Isb0JBQW9CLHFCQUFxQjtBQUMvRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5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
