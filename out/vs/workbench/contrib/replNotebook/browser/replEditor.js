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
import "./media/interactive.css";
import * as DOM from "../../../../base/browser/dom.js";
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { EditorPaneSelectionChangeReason } from "../../../common/editor.js";
import { getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { NotebookEditorExtensionsRegistry } from "../../notebook/browser/notebookEditorExtensions.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { getDefaultNotebookCreationOptions, NotebookEditorWidget } from "../../notebook/browser/notebookEditorWidget.js";
import { GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ExecutionStateCellStatusBarContrib, TimerCellStatusBarContrib } from "../../notebook/browser/contrib/cellStatusBar/executionStatusBarItemController.js";
import { INotebookKernelService } from "../../notebook/common/notebookKernelService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from "../../interactive/browser/interactiveCommon.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NotebookOptions } from "../../notebook/browser/notebookOptions.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { createActionViewItem, getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { SelectionClipboardContributionID } from "../../codeEditor/browser/selectionClipboard.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { MarkerController } from "../../../../editor/contrib/gotoError/browser/gotoError.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { TextEditorSelectionSource } from "../../../../platform/editor/common/editor.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../notebook/common/notebookExecutionStateService.js";
import { NOTEBOOK_KERNEL } from "../../notebook/common/notebookContextKeys.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isEqual } from "../../../../base/common/resources.js";
import { NotebookFindContrib } from "../../notebook/browser/contrib/find/notebookFindWidget.js";
import { REPL_EDITOR_ID } from "../../notebook/common/notebookCommon.js";
import "./interactiveEditor.css";
import { deepClone } from "../../../../base/common/objects.js";
import { GlyphHoverController } from "../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { ReplEditorInput } from "./replEditorInput.js";
import { ReplInputHintContentWidget } from "../../interactive/browser/replInputHintContentWidget.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
const INTERACTIVE_EDITOR_VIEW_STATE_PREFERENCE_KEY = "InteractiveEditorViewState";
const INPUT_CELL_VERTICAL_PADDING = 8;
const INPUT_CELL_HORIZONTAL_PADDING_RIGHT = 10;
const INPUT_EDITOR_PADDING = 8;
let ReplEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, notebookWidgetService, contextKeyService, notebookKernelService, languageService, keybindingService, configurationService, menuService, contextMenuService, editorGroupService, textResourceConfigurationService, notebookExecutionStateService, extensionService, _accessibilityService) {
    super(
      REPL_EDITOR_ID,
      group,
      telemetryService,
      themeService,
      storageService
    );
    this._accessibilityService = _accessibilityService;
    this._notebookWidget = { value: void 0 };
    this._widgetDisposableStore = this._register(new DisposableStore());
    this._groupListener = this._register(new MutableDisposable());
    this._onDidFocusWidget = this._register(new Emitter());
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeScroll = this._register(new Emitter());
    this.onDidChangeScroll = this._onDidChangeScroll.event;
    this._notebookWidgetService = notebookWidgetService;
    this._configurationService = configurationService;
    this._notebookKernelService = notebookKernelService;
    this._languageService = languageService;
    this._keybindingService = keybindingService;
    this._menuService = menuService;
    this._contextMenuService = contextMenuService;
    this._editorGroupService = editorGroupService;
    this._extensionService = extensionService;
    this._rootElement = DOM.$(".interactive-editor");
    this._contextKeyService = this._register(contextKeyService.createScoped(this._rootElement));
    this._contextKeyService.createKey("isCompositeNotebook", true);
    this._instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
    this._editorOptions = this._computeEditorOptions();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor") || e.affectsConfiguration("notebook")) {
        this._editorOptions = this._computeEditorOptions();
      }
    }));
    this._notebookOptions = instantiationService.createInstance(NotebookOptions, this.window, true, { cellToolbarInteraction: "hover", globalToolbar: true, stickyScrollEnabled: false, dragAndDropEnabled: false, disableRulers: true });
    this._editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, INTERACTIVE_EDITOR_VIEW_STATE_PREFERENCE_KEY);
    this._register(this._keybindingService.onDidUpdateKeybindings(this._updateInputHint, this));
    this._register(notebookExecutionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && isEqual(e.notebook, this._notebookWidget.value?.viewModel?.notebookDocument.uri)) {
        const cell = this._notebookWidget.value?.getCellByHandle(e.cellHandle);
        if (cell && e.changed?.state) {
          this._scrollIfNecessary(cell);
        }
      }
    }));
  }
  get onDidFocus() {
    return this._onDidFocusWidget.event;
  }
  get inputCellContainerHeight() {
    return 19 + 2 + INPUT_CELL_VERTICAL_PADDING * 2 + INPUT_EDITOR_PADDING * 2;
  }
  get inputCellEditorHeight() {
    return 19 + INPUT_EDITOR_PADDING * 2;
  }
  createEditor(parent) {
    DOM.append(parent, this._rootElement);
    this._rootElement.style.position = "relative";
    this._notebookEditorContainer = DOM.append(this._rootElement, DOM.$(".notebook-editor-container"));
    this._inputCellContainer = DOM.append(this._rootElement, DOM.$(".input-cell-container"));
    this._inputCellContainer.style.position = "absolute";
    this._inputCellContainer.style.height = `${this.inputCellContainerHeight}px`;
    this._inputFocusIndicator = DOM.append(this._inputCellContainer, DOM.$(".input-focus-indicator"));
    this._inputRunButtonContainer = DOM.append(this._inputCellContainer, DOM.$(".run-button-container"));
    this._setupRunButtonToolbar(this._inputRunButtonContainer);
    this._inputEditorContainer = DOM.append(this._inputCellContainer, DOM.$(".input-editor-container"));
    this._createLayoutStyles();
  }
  _setupRunButtonToolbar(runButtonContainer) {
    const menu = this._register(this._menuService.createMenu(MenuId.ReplInputExecute, this._contextKeyService));
    this._runbuttonToolbar = this._register(new ToolBar(runButtonContainer, this._contextMenuService, {
      getKeyBinding: (action) => this._keybindingService.lookupKeybinding(action.id),
      actionViewItemProvider: (action, options) => {
        return createActionViewItem(this._instantiationService, action, options);
      },
      renderDropdownAsChildElement: true
    }));
    const { primary, secondary } = getActionBarActions(menu.getActions({ shouldForwardArgs: true }));
    this._runbuttonToolbar.setActions([...primary, ...secondary]);
  }
  _createLayoutStyles() {
    this._styleElement = domStylesheets.createStyleSheet(this._rootElement);
    const styleSheets = [];
    const {
      codeCellLeftMargin,
      cellRunGutter
    } = this._notebookOptions.getLayoutConfiguration();
    const {
      focusIndicator
    } = this._notebookOptions.getDisplayOptions();
    const leftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
    styleSheets.push(`
			.interactive-editor .input-cell-container {
				padding: ${INPUT_CELL_VERTICAL_PADDING}px ${INPUT_CELL_HORIZONTAL_PADDING_RIGHT}px ${INPUT_CELL_VERTICAL_PADDING}px ${leftMargin}px;
			}
		`);
    if (focusIndicator === "gutter") {
      styleSheets.push(`
				.interactive-editor .input-cell-container:focus-within .input-focus-indicator::before {
					border-color: var(--vscode-notebook-focusedCellBorder) !important;
				}
				.interactive-editor .input-focus-indicator::before {
					border-color: var(--vscode-notebook-inactiveFocusedCellBorder) !important;
				}
				.interactive-editor .input-cell-container .input-focus-indicator {
					display: block;
					top: ${INPUT_CELL_VERTICAL_PADDING}px;
				}
				.interactive-editor .input-cell-container {
					border-top: 1px solid var(--vscode-notebook-inactiveFocusedCellBorder);
				}
			`);
    } else {
      styleSheets.push(`
				.interactive-editor .input-cell-container {
					border-top: 1px solid var(--vscode-notebook-inactiveFocusedCellBorder);
				}
				.interactive-editor .input-cell-container .input-focus-indicator {
					display: none;
				}
			`);
    }
    styleSheets.push(`
			.interactive-editor .input-cell-container .run-button-container {
				width: ${cellRunGutter}px;
				left: ${codeCellLeftMargin}px;
				margin-top: ${INPUT_EDITOR_PADDING - 2}px;
			}
		`);
    this._styleElement.textContent = styleSheets.join("\n");
  }
  _computeEditorOptions() {
    let overrideIdentifier = void 0;
    if (this._codeEditorWidget) {
      overrideIdentifier = this._codeEditorWidget.getModel()?.getLanguageId();
    }
    const editorOptions = deepClone(this._configurationService.getValue("editor", { overrideIdentifier }));
    const editorOptionsOverride = getSimpleEditorOptions(this._configurationService);
    const computed = Object.freeze({
      ...editorOptions,
      ...editorOptionsOverride,
      ...{
        ariaLabel: localize("replEditorInput", "REPL Input"),
        glyphMargin: true,
        padding: {
          top: INPUT_EDITOR_PADDING,
          bottom: INPUT_EDITOR_PADDING
        },
        hover: {
          enabled: "on"
        },
        rulers: []
      }
    });
    return computed;
  }
  saveState() {
    this._saveEditorViewState(this.input);
    super.saveState();
  }
  getViewState() {
    const input = this.input;
    if (!(input instanceof ReplEditorInput)) {
      return void 0;
    }
    this._saveEditorViewState(input);
    return this._loadNotebookEditorViewState(input);
  }
  _saveEditorViewState(input) {
    if (this._notebookWidget.value && input instanceof ReplEditorInput) {
      if (this._notebookWidget.value.isDisposed) {
        return;
      }
      const state = this._notebookWidget.value.getEditorViewState();
      const editorState = this._codeEditorWidget.saveViewState();
      this._editorMemento.saveEditorState(this.group, input.resource, {
        notebook: state,
        input: editorState
      });
    }
  }
  _loadNotebookEditorViewState(input) {
    const result = this._editorMemento.loadEditorState(this.group, input.resource);
    if (result) {
      return result;
    }
    for (const group of this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (group.activeEditorPane !== this && group.activeEditorPane === this && group.activeEditor?.matches(input)) {
        const notebook = this._notebookWidget.value?.getEditorViewState();
        const input2 = this._codeEditorWidget.saveViewState();
        return {
          notebook,
          input: input2
        };
      }
    }
    return;
  }
  async setInput(input, options, context, token) {
    this._notebookWidget.value?.onWillHide();
    this._codeEditorWidget?.dispose();
    this._widgetDisposableStore.clear();
    this._notebookWidget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, input, {
      isReplHistory: true,
      isReadOnly: true,
      contributions: NotebookEditorExtensionsRegistry.getSomeEditorContributions([
        ExecutionStateCellStatusBarContrib.id,
        TimerCellStatusBarContrib.id,
        NotebookFindContrib.id
      ]),
      menuIds: {
        notebookToolbar: MenuId.InteractiveToolbar,
        cellTitleToolbar: MenuId.InteractiveCellTitle,
        cellDeleteToolbar: MenuId.InteractiveCellDelete,
        cellInsertToolbar: MenuId.NotebookCellBetween,
        cellTopInsertToolbar: MenuId.NotebookCellListTop,
        cellExecuteToolbar: MenuId.InteractiveCellExecute,
        cellExecutePrimary: void 0
      },
      cellEditorContributions: EditorExtensionsRegistry.getSomeEditorContributions([
        SelectionClipboardContributionID,
        ContextMenuController.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        MarkerController.ID
      ]),
      options: this._notebookOptions,
      codeWindow: this.window
    }, void 0, this.window);
    const skipContributions = [
      "workbench.notebook.cellToolbar",
      "editor.contrib.inlineCompletionsController"
    ];
    const inputContributions = getDefaultNotebookCreationOptions().cellEditorContributions?.filter((c) => skipContributions.indexOf(c.id) === -1);
    this._codeEditorWidget = this._instantiationService.createInstance(CodeEditorWidget, this._inputEditorContainer, this._editorOptions, {
      ...{
        isSimpleWidget: false,
        contributions: inputContributions
      }
    });
    if (this._lastLayoutDimensions) {
      this._notebookEditorContainer.style.height = `${this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight}px`;
      this._notebookWidget.value.layout(new DOM.Dimension(this._lastLayoutDimensions.dimension.width, this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight), this._notebookEditorContainer);
      const leftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
      const maxHeight = Math.min(this._lastLayoutDimensions.dimension.height / 2, this.inputCellEditorHeight);
      this._codeEditorWidget.layout(this._validateDimension(this._lastLayoutDimensions.dimension.width - leftMargin - INPUT_CELL_HORIZONTAL_PADDING_RIGHT, maxHeight));
      this._inputFocusIndicator.style.height = `${this.inputCellEditorHeight}px`;
      this._inputCellContainer.style.top = `${this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight}px`;
      this._inputCellContainer.style.width = `${this._lastLayoutDimensions.dimension.width}px`;
    }
    await super.setInput(input, options, context, token);
    const model = await input.resolve();
    if (this._runbuttonToolbar) {
      this._runbuttonToolbar.context = input.resource;
    }
    if (model === null) {
      throw new Error("The REPL model could not be resolved");
    }
    this._notebookWidget.value?.setParentContextKeyService(this._contextKeyService);
    const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
    await this._extensionService.whenInstalledExtensionsRegistered();
    await this._notebookWidget.value.setModel(model.notebook, viewState?.notebook, void 0, "repl");
    model.notebook.setCellCollapseDefault(this._notebookOptions.getCellCollapseDefault());
    this._notebookWidget.value.setOptions({
      isReadOnly: true
    });
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidResizeOutput((cvm) => {
      this._scrollIfNecessary(cvm);
    }));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidFocusWidget(() => this._onDidFocusWidget.fire()));
    this._widgetDisposableStore.add(this._notebookOptions.onDidChangeOptions((e) => {
      if (e.compactView || e.focusIndicator) {
        this._styleElement?.remove();
        this._createLayoutStyles();
      }
      if (this._lastLayoutDimensions && this.isVisible()) {
        this.layout(this._lastLayoutDimensions.dimension, this._lastLayoutDimensions.position);
      }
      if (e.interactiveWindowCollapseCodeCells) {
        model.notebook.setCellCollapseDefault(this._notebookOptions.getCellCollapseDefault());
      }
    }));
    const editorModel = await input.resolveInput(model.notebook);
    this._codeEditorWidget.setModel(editorModel);
    if (viewState?.input) {
      this._codeEditorWidget.restoreViewState(viewState.input);
    }
    this._editorOptions = this._computeEditorOptions();
    this._codeEditorWidget.updateOptions(this._editorOptions);
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidFocusEditorWidget(() => this._onDidFocusWidget.fire()));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidContentSizeChange((e) => {
      if (!e.contentHeightChanged) {
        return;
      }
      if (this._lastLayoutDimensions) {
        this._layoutWidgets(this._lastLayoutDimensions.dimension, this._lastLayoutDimensions.position);
      }
    }));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeCursorPosition((e) => this._onDidChangeSelection.fire({ reason: this._toEditorPaneSelectionChangeReason(e) })));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModelContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));
    this._widgetDisposableStore.add(this._notebookKernelService.onDidChangeNotebookAffinity(this._syncWithKernel, this));
    this._widgetDisposableStore.add(this._notebookKernelService.onDidChangeSelectedNotebooks(this._syncWithKernel, this));
    this._widgetDisposableStore.add(this.themeService.onDidColorThemeChange(() => {
      if (this.isVisible()) {
        this._updateInputHint();
      }
    }));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModelContent(() => {
      if (this.isVisible()) {
        this._updateInputHint();
      }
    }));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModelDecorations(() => {
      if (this.isVisible()) {
        this._updateInputHint();
      }
    }));
    const cursorAtBoundaryContext = INTERACTIVE_INPUT_CURSOR_BOUNDARY.bindTo(this._contextKeyService);
    if (input.resource && input.historyService.has(input.resource)) {
      cursorAtBoundaryContext.set("top");
    } else {
      cursorAtBoundaryContext.set("none");
    }
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeCursorPosition(({ position }) => {
      const viewModel = this._codeEditorWidget._getViewModel();
      const lastLineNumber = viewModel.getLineCount();
      const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
      const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
      const firstLine = viewPosition.lineNumber === 1 && viewPosition.column === 1;
      const lastLine = viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol;
      if (firstLine) {
        if (lastLine) {
          cursorAtBoundaryContext.set("both");
        } else {
          cursorAtBoundaryContext.set("top");
        }
      } else {
        if (lastLine) {
          cursorAtBoundaryContext.set("bottom");
        } else {
          cursorAtBoundaryContext.set("none");
        }
      }
    }));
    this._widgetDisposableStore.add(editorModel.onDidChangeContent(() => {
      const value = editorModel.getValue();
      if (this.input?.resource && value !== "") {
        const historyService = this.input.historyService;
        if (!historyService.matchesCurrent(this.input.resource, value)) {
          historyService.replaceLast(this.input.resource, value);
        }
      }
    }));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidScroll(() => this._onDidChangeScroll.fire()));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidChangeViewCells(this.handleViewCellChange, this));
    this._updateInputHint();
    this._syncWithKernel();
  }
  handleViewCellChange(e) {
    const notebookWidget = this._notebookWidget.value;
    if (!notebookWidget) {
      return;
    }
    for (const splice of e.splices) {
      const [_start, _delete, addedCells] = splice;
      if (addedCells.length) {
        const viewModel = notebookWidget.viewModel;
        if (viewModel) {
          this.handleAppend(notebookWidget, viewModel);
          break;
        }
      }
    }
  }
  handleAppend(notebookWidget, viewModel) {
    this._notebookWidgetService.updateReplContextKey(viewModel.notebookDocument.uri.toString());
    const navigateToCell = this._configurationService.getValue("accessibility.replEditor.autoFocusReplExecution");
    if (this._accessibilityService.isScreenReaderOptimized()) {
      if (navigateToCell === "lastExecution") {
        setTimeout(() => {
          const lastCellIndex = viewModel.length - 1;
          if (lastCellIndex >= 0) {
            const cell = viewModel.viewCells[lastCellIndex];
            notebookWidget.focusNotebookCell(cell, "container");
          }
        }, 0);
      } else if (navigateToCell === "input") {
        this._codeEditorWidget.focus();
      }
    }
  }
  setOptions(options) {
    this._notebookWidget.value?.setOptions(options);
    super.setOptions(options);
  }
  _toEditorPaneSelectionChangeReason(e) {
    switch (e.source) {
      case TextEditorSelectionSource.PROGRAMMATIC:
        return EditorPaneSelectionChangeReason.PROGRAMMATIC;
      case TextEditorSelectionSource.NAVIGATION:
        return EditorPaneSelectionChangeReason.NAVIGATION;
      case TextEditorSelectionSource.JUMP:
        return EditorPaneSelectionChangeReason.JUMP;
      default:
        return EditorPaneSelectionChangeReason.USER;
    }
  }
  _cellAtBottom(cell) {
    const visibleRanges = this._notebookWidget.value?.visibleRanges || [];
    const cellIndex = this._notebookWidget.value?.getCellIndex(cell);
    if (cellIndex === Math.max(...visibleRanges.map((range) => range.end - 1))) {
      return true;
    }
    return false;
  }
  _scrollIfNecessary(cvm) {
    const index = this._notebookWidget.value.getCellIndex(cvm);
    if (index === this._notebookWidget.value.getLength() - 1) {
      if (this._configurationService.getValue(ReplEditorSettings.interactiveWindowAlwaysScrollOnNewCell) || this._cellAtBottom(cvm)) {
        this._notebookWidget.value.scrollToBottom();
      }
    }
  }
  _syncWithKernel() {
    const notebook = this._notebookWidget.value?.textModel;
    const textModel = this._codeEditorWidget.getModel();
    if (notebook && textModel) {
      const info = this._notebookKernelService.getMatchingKernel(notebook);
      const selectedOrSuggested = info.selected ?? (info.suggestions.length === 1 ? info.suggestions[0] : void 0) ?? (info.all.length === 1 ? info.all[0] : void 0);
      if (selectedOrSuggested) {
        const language = selectedOrSuggested.supportedLanguages[0];
        if (language && language !== "plaintext") {
          const newMode = this._languageService.createById(language).languageId;
          textModel.setLanguage(newMode);
        }
        NOTEBOOK_KERNEL.bindTo(this._contextKeyService).set(selectedOrSuggested.id);
      }
    }
  }
  layout(dimension, position) {
    this._rootElement.classList.toggle("mid-width", dimension.width < 1e3 && dimension.width >= 600);
    this._rootElement.classList.toggle("narrow-width", dimension.width < 600);
    const editorHeightChanged = dimension.height !== this._lastLayoutDimensions?.dimension.height;
    this._lastLayoutDimensions = { dimension, position };
    if (!this._notebookWidget.value) {
      return;
    }
    if (editorHeightChanged && this._codeEditorWidget) {
      SuggestController.get(this._codeEditorWidget)?.cancelSuggestWidget();
    }
    this._notebookEditorContainer.style.height = `${this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight}px`;
    this._layoutWidgets(dimension, position);
  }
  _layoutWidgets(dimension, position) {
    const contentHeight = this._codeEditorWidget.hasModel() ? this._codeEditorWidget.getContentHeight() : this.inputCellEditorHeight;
    const maxHeight = Math.min(dimension.height / 2, contentHeight);
    const leftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
    const inputCellContainerHeight = maxHeight + INPUT_CELL_VERTICAL_PADDING * 2;
    this._notebookEditorContainer.style.height = `${dimension.height - inputCellContainerHeight}px`;
    this._notebookWidget.value.layout(dimension.with(dimension.width, dimension.height - inputCellContainerHeight), this._notebookEditorContainer, position);
    this._codeEditorWidget.layout(this._validateDimension(dimension.width - leftMargin - INPUT_CELL_HORIZONTAL_PADDING_RIGHT, maxHeight));
    this._inputFocusIndicator.style.height = `${contentHeight}px`;
    this._inputCellContainer.style.top = `${dimension.height - inputCellContainerHeight}px`;
    this._inputCellContainer.style.width = `${dimension.width}px`;
  }
  _validateDimension(width, height) {
    return new DOM.Dimension(Math.max(0, width), Math.max(0, height));
  }
  _hasConflictingDecoration() {
    return Boolean(this._codeEditorWidget.getLineDecorations(1)?.find(
      (d) => d.options.beforeContentClassName || d.options.afterContentClassName || d.options.before?.content || d.options.after?.content
    ));
  }
  _updateInputHint() {
    if (!this._codeEditorWidget) {
      return;
    }
    const shouldHide = !this._codeEditorWidget.hasModel() || this._configurationService.getValue(ReplEditorSettings.showExecutionHint) === false || this._codeEditorWidget.getModel().getValueLength() !== 0 || this._hasConflictingDecoration();
    if (!this._hintElement && !shouldHide) {
      this._hintElement = this._instantiationService.createInstance(ReplInputHintContentWidget, this._codeEditorWidget);
    } else if (this._hintElement && shouldHide) {
      this._hintElement.dispose();
      this._hintElement = void 0;
    }
  }
  getScrollPosition() {
    return {
      scrollTop: this._notebookWidget.value?.scrollTop ?? 0,
      scrollLeft: 0
    };
  }
  setScrollPosition(position) {
    this._notebookWidget.value?.setScrollTop(position.scrollTop);
  }
  focus() {
    super.focus();
    this._notebookWidget.value?.onShow();
    this._codeEditorWidget.focus();
  }
  focusHistory() {
    this._notebookWidget.value.focus();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    this._groupListener.value = this.group.onWillCloseEditor((e) => this._saveEditorViewState(e.editor));
    if (!visible) {
      this._saveEditorViewState(this.input);
      if (this.input && this._notebookWidget.value) {
        this._notebookWidget.value.onWillHide();
      }
    }
    this._updateInputHint();
  }
  clearInput() {
    if (this._notebookWidget.value) {
      this._saveEditorViewState(this.input);
      this._notebookWidget.value.onWillHide();
    }
    this._codeEditorWidget?.dispose();
    this._notebookWidget = { value: void 0 };
    this._widgetDisposableStore.clear();
    super.clearInput();
  }
  getControl() {
    return {
      notebookEditor: this._notebookWidget.value,
      activeCodeEditor: this.getActiveCodeEditor(),
      onDidChangeActiveEditor: Event.None
    };
  }
  getActiveCodeEditor() {
    if (!this._codeEditorWidget) {
      return void 0;
    }
    return this._codeEditorWidget.hasWidgetFocus() || !this._notebookWidget.value?.activeCodeEditor ? this._codeEditorWidget : this._notebookWidget.value.activeCodeEditor;
  }
};
ReplEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotebookEditorService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, INotebookKernelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IContextMenuService),
  __decorateParam(13, IEditorGroupsService),
  __decorateParam(14, ITextResourceConfigurationService),
  __decorateParam(15, INotebookExecutionStateService),
  __decorateParam(16, IExtensionService),
  __decorateParam(17, IAccessibilityService)
], ReplEditor);
function isReplEditorControl(control) {
  const candidate = control;
  return candidate?.activeCodeEditor instanceof CodeEditorWidget && candidate?.notebookEditor instanceof NotebookEditorWidget;
}
export {
  ReplEditor,
  isReplEditorControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlcGxOb3RlYm9va1xcYnJvd3NlclxccmVwbEVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9pbnRlcmFjdGl2ZS5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclZpZXdTdGF0ZSwgSUNvbXBvc2l0ZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24sIElFZGl0b3JNZW1lbnRvLCBJRWRpdG9yT3BlbkNvbnRleHQsIElFZGl0b3JQYW5lU2Nyb2xsUG9zaXRpb24sIElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQsIElFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3JPcHRpb25zLCBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUsIElOb3RlYm9va1ZpZXdDZWxsc1VwZGF0ZUV2ZW50IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQm9ycm93VmFsdWUsIElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0Tm90ZWJvb2tDcmVhdGlvbk9wdGlvbnMsIE5vdGVib29rRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBHcm91cHNPcmRlciwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeGVjdXRpb25TdGF0ZUNlbGxTdGF0dXNCYXJDb250cmliLCBUaW1lckNlbGxTdGF0dXNCYXJDb250cmliIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2NlbGxTdGF0dXNCYXIvZXhlY3V0aW9uU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlcGxFZGl0b3JTZXR0aW5ncywgSU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZIH0gZnJvbSAnLi4vLi4vaW50ZXJhY3RpdmUvYnJvd3Nlci9pbnRlcmFjdGl2ZUNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9ucyB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tPcHRpb25zLmpzJztcbmltcG9ydCB7IFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2VsZWN0aW9uQ2xpcGJvYXJkLmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbnRleHRtZW51L2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgTWFya2VyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9FcnJvci9icm93c2VyL2dvdG9FcnJvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucywgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0tFUk5FTCB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZENvbnRyaWIgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvZmluZC9ub3RlYm9va0ZpbmRXaWRnZXQuanMnO1xuaW1wb3J0IHsgUkVQTF9FRElUT1JfSUQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0ICcuL2ludGVyYWN0aXZlRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBHbHlwaEhvdmVyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvZ2x5cGhIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9ySW5wdXQgfSBmcm9tICcuL3JlcGxFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZXBsSW5wdXRIaW50Q29udGVudFdpZGdldCB9IGZyb20gJy4uLy4uL2ludGVyYWN0aXZlL2Jyb3dzZXIvcmVwbElucHV0SGludENvbnRlbnRXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cbmNvbnN0IElOVEVSQUNUSVZFX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZID0gJ0ludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlJztcblxuY29uc3QgSU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HID0gODtcbmNvbnN0IElOUFVUX0NFTExfSE9SSVpPTlRBTF9QQURESU5HX1JJR0hUID0gMTA7XG5jb25zdCBJTlBVVF9FRElUT1JfUEFERElORyA9IDg7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGUge1xuXHRyZWFkb25seSBub3RlYm9vaz86IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZTtcblx0cmVhZG9ubHkgaW5wdXQ/OiBJQ29kZUVkaXRvclZpZXdTdGF0ZSB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJhY3RpdmVFZGl0b3JPcHRpb25zIGV4dGVuZHMgSVRleHRFZGl0b3JPcHRpb25zIHtcblx0cmVhZG9ubHkgdmlld1N0YXRlPzogSW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGU7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSBpbXBsZW1lbnRzIElFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyB7XG5cdHByaXZhdGUgX3Jvb3RFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3N0eWxlRWxlbWVudCE6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByaXZhdGUgX25vdGVib29rRWRpdG9yQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX25vdGVib29rV2lkZ2V0OiBJQm9ycm93VmFsdWU8Tm90ZWJvb2tFZGl0b3JXaWRnZXQ+ID0geyB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdHByaXZhdGUgX2lucHV0Q2VsbENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9pbnB1dEZvY3VzSW5kaWNhdG9yITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2lucHV0UnVuQnV0dG9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2lucHV0RWRpdG9yQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2NvZGVFZGl0b3JXaWRnZXQhOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIF9ub3RlYm9va1dpZGdldFNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2U7XG5cdHByaXZhdGUgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0cHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSBfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlO1xuXHRwcml2YXRlIF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlO1xuXHRwcml2YXRlIF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlO1xuXHRwcml2YXRlIF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2U7XG5cdHByaXZhdGUgX2VkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2U7XG5cdHByaXZhdGUgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXREaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2xhc3RMYXlvdXREaW1lbnNpb25zPzogeyByZWFkb25seSBkaW1lbnNpb246IERPTS5EaW1lbnNpb247IHJlYWRvbmx5IHBvc2l0aW9uOiBET00uSURvbVBvc2l0aW9uIH07XG5cdHByaXZhdGUgX2VkaXRvck9wdGlvbnM6IElFZGl0b3JPcHRpb25zO1xuXHRwcml2YXRlIF9ub3RlYm9va09wdGlvbnM6IE5vdGVib29rT3B0aW9ucztcblx0cHJpdmF0ZSBfZWRpdG9yTWVtZW50bzogSUVkaXRvck1lbWVudG88SW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9ydW5idXR0b25Ub29sYmFyOiBUb29sQmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oaW50RWxlbWVudDogUmVwbElucHV0SGludENvbnRlbnRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25EaWRGb2N1c1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRvdmVycmlkZSBnZXQgb25EaWRGb2N1cygpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZEZvY3VzV2lkZ2V0LmV2ZW50OyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Nyb2xsID0gdGhpcy5fb25EaWRDaGFuZ2VTY3JvbGwuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvclNlcnZpY2Ugbm90ZWJvb2tXaWRnZXRTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRSRVBMX0VESVRPUl9JRCxcblx0XHRcdGdyb3VwLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdHRoZW1lU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlXG5cdFx0KTtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldFNlcnZpY2UgPSBub3RlYm9va1dpZGdldFNlcnZpY2U7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UgPSBub3RlYm9va0tlcm5lbFNlcnZpY2U7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlO1xuXHRcdHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlID0ga2V5YmluZGluZ1NlcnZpY2U7XG5cdFx0dGhpcy5fbWVudVNlcnZpY2UgPSBtZW51U2VydmljZTtcblx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UgPSBjb250ZXh0TWVudVNlcnZpY2U7XG5cdFx0dGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlID0gZWRpdG9yR3JvdXBTZXJ2aWNlO1xuXHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UgPSBleHRlbnNpb25TZXJ2aWNlO1xuXG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQgPSBET00uJCgnLmludGVyYWN0aXZlLWVkaXRvcicpO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX3Jvb3RFbGVtZW50KSk7XG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdpc0NvbXBvc2l0ZU5vdGVib29rJywgdHJ1ZSk7XG5cdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXG5cdFx0dGhpcy5fZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbXB1dGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvcicpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ25vdGVib29rJykpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbXB1dGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX25vdGVib29rT3B0aW9ucyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3B0aW9ucywgdGhpcy53aW5kb3csIHRydWUsIHsgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbjogJ2hvdmVyJywgZ2xvYmFsVG9vbGJhcjogdHJ1ZSwgc3RpY2t5U2Nyb2xsRW5hYmxlZDogZmFsc2UsIGRyYWdBbmREcm9wRW5hYmxlZDogZmFsc2UsIGRpc2FibGVSdWxlcnM6IHRydWUgfSk7XG5cdFx0dGhpcy5fZWRpdG9yTWVtZW50byA9IHRoaXMuZ2V0RWRpdG9yTWVtZW50bzxJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZT4oZWRpdG9yR3JvdXBTZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgSU5URVJBQ1RJVkVfRURJVE9SX1ZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fa2V5YmluZGluZ1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncyh0aGlzLl91cGRhdGVJbnB1dEhpbnQsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5vbkRpZENoYW5nZUV4ZWN1dGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUudHlwZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UeXBlLmNlbGwgJiYgaXNFcXVhbChlLm5vdGVib29rLCB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8udmlld01vZGVsPy5ub3RlYm9va0RvY3VtZW50LnVyaSkpIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5nZXRDZWxsQnlIYW5kbGUoZS5jZWxsSGFuZGxlKTtcblx0XHRcdFx0aWYgKGNlbGwgJiYgZS5jaGFuZ2VkPy5zdGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Njcm9sbElmTmVjZXNzYXJ5KGNlbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0KCkge1xuXHRcdHJldHVybiAxOSArIDIgKyBJTlBVVF9DRUxMX1ZFUlRJQ0FMX1BBRERJTkcgKiAyICsgSU5QVVRfRURJVE9SX1BBRERJTkcgKiAyO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaW5wdXRDZWxsRWRpdG9ySGVpZ2h0KCkge1xuXHRcdHJldHVybiAxOSArIElOUFVUX0VESVRPUl9QQURESU5HICogMjtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdERPTS5hcHBlbmQocGFyZW50LCB0aGlzLl9yb290RWxlbWVudCk7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9yb290RWxlbWVudCwgRE9NLiQoJy5ub3RlYm9vay1lZGl0b3ItY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5fcm9vdEVsZW1lbnQsIERPTS4kKCcuaW5wdXQtY2VsbC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5pbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2lucHV0Rm9jdXNJbmRpY2F0b3IgPSBET00uYXBwZW5kKHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lciwgRE9NLiQoJy5pbnB1dC1mb2N1cy1pbmRpY2F0b3InKSk7XG5cdFx0dGhpcy5faW5wdXRSdW5CdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lciwgRE9NLiQoJy5ydW4tYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9zZXR1cFJ1bkJ1dHRvblRvb2xiYXIodGhpcy5faW5wdXRSdW5CdXR0b25Db250YWluZXIpO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9pbnB1dENlbGxDb250YWluZXIsIERPTS4kKCcuaW5wdXQtZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9jcmVhdGVMYXlvdXRTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwUnVuQnV0dG9uVG9vbGJhcihydW5CdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLlJlcGxJbnB1dEV4ZWN1dGUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcnVuYnV0dG9uVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb29sQmFyKHJ1bkJ1dHRvbkNvbnRhaW5lciwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9ydW5idXR0b25Ub29sYmFyLnNldEFjdGlvbnMoWy4uLnByaW1hcnksIC4uLnNlY29uZGFyeV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTGF5b3V0U3R5bGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzLmNyZWF0ZVN0eWxlU2hlZXQodGhpcy5fcm9vdEVsZW1lbnQpO1xuXHRcdGNvbnN0IHN0eWxlU2hlZXRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qge1xuXHRcdFx0Y29kZUNlbGxMZWZ0TWFyZ2luLFxuXHRcdFx0Y2VsbFJ1bkd1dHRlclxuXHRcdH0gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGNvbnN0IHtcblx0XHRcdGZvY3VzSW5kaWNhdG9yXG5cdFx0fSA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpO1xuXHRcdGNvbnN0IGxlZnRNYXJnaW4gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4oKTtcblxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIge1xuXHRcdFx0XHRwYWRkaW5nOiAke0lOUFVUX0NFTExfVkVSVElDQUxfUEFERElOR31weCAke0lOUFVUX0NFTExfSE9SSVpPTlRBTF9QQURESU5HX1JJR0hUfXB4ICR7SU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HfXB4ICR7bGVmdE1hcmdpbn1weDtcblx0XHRcdH1cblx0XHRgKTtcblx0XHRpZiAoZm9jdXNJbmRpY2F0b3IgPT09ICdndXR0ZXInKSB7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXI6Zm9jdXMtd2l0aGluIC5pbnB1dC1mb2N1cy1pbmRpY2F0b3I6OmJlZm9yZSB7XG5cdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2stZm9jdXNlZENlbGxCb3JkZXIpICFpbXBvcnRhbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtZm9jdXMtaW5kaWNhdG9yOjpiZWZvcmUge1xuXHRcdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLW5vdGVib29rLWluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXIpICFpbXBvcnRhbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIgLmlucHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdFx0dG9wOiAke0lOUFVUX0NFTExfVkVSVElDQUxfUEFERElOR31weDtcblx0XHRcdFx0fVxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciB7XG5cdFx0XHRcdFx0Ym9yZGVyLXRvcDogMXB4IHNvbGlkIHZhcigtLXZzY29kZS1ub3RlYm9vay1pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGJvcmRlclxuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIHtcblx0XHRcdFx0XHRib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tdnNjb2RlLW5vdGVib29rLWluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIC5pbnB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRcdGRpc3BsYXk6IG5vbmU7XG5cdFx0XHRcdH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIgLnJ1bi1idXR0b24tY29udGFpbmVyIHtcblx0XHRcdFx0d2lkdGg6ICR7Y2VsbFJ1bkd1dHRlcn1weDtcblx0XHRcdFx0bGVmdDogJHtjb2RlQ2VsbExlZnRNYXJnaW59cHg7XG5cdFx0XHRcdG1hcmdpbi10b3A6ICR7SU5QVVRfRURJVE9SX1BBRERJTkcgLSAyfXB4O1xuXHRcdFx0fVxuXHRcdGApO1xuXG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gc3R5bGVTaGVldHMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlRWRpdG9yT3B0aW9ucygpOiBJRWRpdG9yT3B0aW9ucyB7XG5cdFx0bGV0IG92ZXJyaWRlSWRlbnRpZmllcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXIgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk/LmdldExhbmd1YWdlSWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IGRlZXBDbG9uZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicsIHsgb3ZlcnJpZGVJZGVudGlmaWVyIH0pKTtcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zT3ZlcnJpZGUgPSBnZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb21wdXRlZCA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0Li4uZWRpdG9yT3B0aW9ucyxcblx0XHRcdC4uLmVkaXRvck9wdGlvbnNPdmVycmlkZSxcblx0XHRcdC4uLntcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgncmVwbEVkaXRvcklucHV0JywgXCJSRVBMIElucHV0XCIpLFxuXHRcdFx0XHRnbHlwaE1hcmdpbjogdHJ1ZSxcblx0XHRcdFx0cGFkZGluZzoge1xuXHRcdFx0XHRcdHRvcDogSU5QVVRfRURJVE9SX1BBRERJTkcsXG5cdFx0XHRcdFx0Ym90dG9tOiBJTlBVVF9FRElUT1JfUEFERElOR1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRob3Zlcjoge1xuXHRcdFx0XHRcdGVuYWJsZWQ6ICdvbicgYXMgY29uc3Rcblx0XHRcdFx0fSxcblx0XHRcdFx0cnVsZXJzOiBbXVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNvbXB1dGVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Vmlld1N0YXRlKCk6IEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQ7XG5cdFx0aWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBSZXBsRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHRcdHJldHVybiB0aGlzLl9sb2FkTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZUVkaXRvclZpZXdTdGF0ZShpbnB1dDogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUgJiYgaW5wdXQgaW5zdGFuY2VvZiBSZXBsRWRpdG9ySW5wdXQpIHtcblx0XHRcdGlmICh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZS5nZXRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHRcdGNvbnN0IGVkaXRvclN0YXRlID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3JNZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCBpbnB1dC5yZXNvdXJjZSwge1xuXHRcdFx0XHRub3RlYm9vazogc3RhdGUsXG5cdFx0XHRcdGlucHV0OiBlZGl0b3JTdGF0ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZE5vdGVib29rRWRpdG9yVmlld1N0YXRlKGlucHV0OiBSZXBsRWRpdG9ySW5wdXQpOiBJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZWRpdG9yTWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgaW5wdXQucmVzb3VyY2UpO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdC8vIHdoZW4gd2UgZG9uJ3QgaGF2ZSBhIHZpZXcgc3RhdGUgZm9yIHRoZSBncm91cC9pbnB1dC10dXBsZSB0aGVuIHdlIHRyeSB0byB1c2UgYW4gZXhpc3Rpbmdcblx0XHQvLyBlZGl0b3IgZm9yIHRoZSBzYW1lIHJlc291cmNlLlxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdGlmIChncm91cC5hY3RpdmVFZGl0b3JQYW5lICE9PSB0aGlzICYmIGdyb3VwLmFjdGl2ZUVkaXRvclBhbmUgPT09IHRoaXMgJiYgZ3JvdXAuYWN0aXZlRWRpdG9yPy5tYXRjaGVzKGlucHV0KSkge1xuXHRcdFx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5nZXRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LnNhdmVWaWV3U3RhdGUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRub3RlYm9vayxcblx0XHRcdFx0XHRpbnB1dFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogUmVwbEVkaXRvcklucHV0LCBvcHRpb25zOiBJbnRlcmFjdGl2ZUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gdGhlcmUgY3VycmVudGx5IGlzIGEgd2lkZ2V0IHdoaWNoIHdlIHN0aWxsIG93biBzb1xuXHRcdC8vIHdlIG5lZWQgdG8gaGlkZSBpdCBiZWZvcmUgZ2V0dGluZyBhIG5ldyB3aWRnZXRcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8ub25XaWxsSGlkZSgpO1xuXG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldD8uZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldCA9IDxJQm9ycm93VmFsdWU8Tm90ZWJvb2tFZGl0b3JXaWRnZXQ+PnRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRoaXMuX25vdGVib29rV2lkZ2V0U2VydmljZS5yZXRyaWV2ZVdpZGdldCwgdGhpcy5ncm91cC5pZCwgaW5wdXQsIHtcblx0XHRcdGlzUmVwbEhpc3Rvcnk6IHRydWUsXG5cdFx0XHRpc1JlYWRPbmx5OiB0cnVlLFxuXHRcdFx0Y29udHJpYnV0aW9uczogTm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRFeGVjdXRpb25TdGF0ZUNlbGxTdGF0dXNCYXJDb250cmliLmlkLFxuXHRcdFx0XHRUaW1lckNlbGxTdGF0dXNCYXJDb250cmliLmlkLFxuXHRcdFx0XHROb3RlYm9va0ZpbmRDb250cmliLmlkXG5cdFx0XHRdKSxcblx0XHRcdG1lbnVJZHM6IHtcblx0XHRcdFx0bm90ZWJvb2tUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVUb29sYmFyLFxuXHRcdFx0XHRjZWxsVGl0bGVUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsVGl0bGUsXG5cdFx0XHRcdGNlbGxEZWxldGVUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsRGVsZXRlLFxuXHRcdFx0XHRjZWxsSW5zZXJ0VG9vbGJhcjogTWVudUlkLk5vdGVib29rQ2VsbEJldHdlZW4sXG5cdFx0XHRcdGNlbGxUb3BJbnNlcnRUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsTGlzdFRvcCxcblx0XHRcdFx0Y2VsbEV4ZWN1dGVUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsRXhlY3V0ZSxcblx0XHRcdFx0Y2VsbEV4ZWN1dGVQcmltYXJ5OiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHRjZWxsRWRpdG9yQ29udHJpYnV0aW9uczogRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFNvbWVFZGl0b3JDb250cmlidXRpb25zKFtcblx0XHRcdFx0U2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQsXG5cdFx0XHRcdENvbnRleHRNZW51Q29udHJvbGxlci5JRCxcblx0XHRcdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0R2x5cGhIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdE1hcmtlckNvbnRyb2xsZXIuSURcblx0XHRcdF0pLFxuXHRcdFx0b3B0aW9uczogdGhpcy5fbm90ZWJvb2tPcHRpb25zLFxuXHRcdFx0Y29kZVdpbmRvdzogdGhpcy53aW5kb3dcblx0XHR9LCB1bmRlZmluZWQsIHRoaXMud2luZG93KTtcblxuXHRcdGNvbnN0IHNraXBDb250cmlidXRpb25zID0gW1xuXHRcdFx0J3dvcmtiZW5jaC5ub3RlYm9vay5jZWxsVG9vbGJhcicsXG5cdFx0XHQnZWRpdG9yLmNvbnRyaWIuaW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyJ1xuXHRcdF07XG5cblx0XHRjb25zdCBpbnB1dENvbnRyaWJ1dGlvbnMgPSBnZXREZWZhdWx0Tm90ZWJvb2tDcmVhdGlvbk9wdGlvbnMoKS5jZWxsRWRpdG9yQ29udHJpYnV0aW9ucz8uZmlsdGVyKGMgPT4gc2tpcENvbnRyaWJ1dGlvbnMuaW5kZXhPZihjLmlkKSA9PT0gLTEpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCB0aGlzLl9pbnB1dEVkaXRvckNvbnRhaW5lciwgdGhpcy5fZWRpdG9yT3B0aW9ucywge1xuXHRcdFx0Li4ue1xuXHRcdFx0XHRpc1NpbXBsZVdpZGdldDogZmFsc2UsXG5cdFx0XHRcdGNvbnRyaWJ1dGlvbnM6IGlucHV0Q29udHJpYnV0aW9ucyxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucykge1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5sYXlvdXQobmV3IERPTS5EaW1lbnNpb24odGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLndpZHRoLCB0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24uaGVpZ2h0IC0gdGhpcy5pbnB1dENlbGxDb250YWluZXJIZWlnaHQpLCB0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBsZWZ0TWFyZ2luID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luKCk7XG5cdFx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1pbih0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24uaGVpZ2h0IC8gMiwgdGhpcy5pbnB1dENlbGxFZGl0b3JIZWlnaHQpO1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5sYXlvdXQodGhpcy5fdmFsaWRhdGVEaW1lbnNpb24odGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLndpZHRoIC0gbGVmdE1hcmdpbiAtIElOUFVUX0NFTExfSE9SSVpPTlRBTF9QQURESU5HX1JJR0hULCBtYXhIZWlnaHQpKTtcblx0XHRcdHRoaXMuX2lucHV0Rm9jdXNJbmRpY2F0b3Iuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5pbnB1dENlbGxFZGl0b3JIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLnRvcCA9IGAke3RoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi5oZWlnaHQgLSB0aGlzLmlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24ud2lkdGh9cHhgO1xuXHRcdH1cblxuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cdFx0aWYgKHRoaXMuX3J1bmJ1dHRvblRvb2xiYXIpIHtcblx0XHRcdHRoaXMuX3J1bmJ1dHRvblRvb2xiYXIuY29udGV4dCA9IGlucHV0LnJlc291cmNlO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGUgUkVQTCBtb2RlbCBjb3VsZCBub3QgYmUgcmVzb2x2ZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2V0UGFyZW50Q29udGV4dEtleVNlcnZpY2UodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gb3B0aW9ucz8udmlld1N0YXRlID8/IHRoaXMuX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dCk7XG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRhd2FpdCB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuc2V0TW9kZWwobW9kZWwubm90ZWJvb2ssIHZpZXdTdGF0ZT8ubm90ZWJvb2ssIHVuZGVmaW5lZCwgJ3JlcGwnKTtcblx0XHRtb2RlbC5ub3RlYm9vay5zZXRDZWxsQ29sbGFwc2VEZWZhdWx0KHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsQ29sbGFwc2VEZWZhdWx0KCkpO1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5zZXRPcHRpb25zKHtcblx0XHRcdGlzUmVhZE9ubHk6IHRydWVcblx0XHR9KTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5vbkRpZFJlc2l6ZU91dHB1dCgoY3ZtKSA9PiB7XG5cdFx0XHR0aGlzLl9zY3JvbGxJZk5lY2Vzc2FyeShjdm0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5vbkRpZEZvY3VzV2lkZ2V0KCgpID0+IHRoaXMuX29uRGlkRm9jdXNXaWRnZXQuZmlyZSgpKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va09wdGlvbnMub25EaWRDaGFuZ2VPcHRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuY29tcGFjdFZpZXcgfHwgZS5mb2N1c0luZGljYXRvcikge1xuXHRcdFx0XHQvLyB1cGRhdGUgdGhlIHN0eWxpbmdcblx0XHRcdFx0dGhpcy5fc3R5bGVFbGVtZW50Py5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5fY3JlYXRlTGF5b3V0U3R5bGVzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucyAmJiB0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbiwgdGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMucG9zaXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzKSB7XG5cdFx0XHRcdG1vZGVsLm5vdGVib29rLnNldENlbGxDb2xsYXBzZURlZmF1bHQodGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxDb2xsYXBzZURlZmF1bHQoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSBhd2FpdCBpbnB1dC5yZXNvbHZlSW5wdXQobW9kZWwubm90ZWJvb2spO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuc2V0TW9kZWwoZWRpdG9yTW9kZWwpO1xuXHRcdGlmICh2aWV3U3RhdGU/LmlucHV0KSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LnJlc3RvcmVWaWV3U3RhdGUodmlld1N0YXRlLmlucHV0KTtcblx0XHR9XG5cdFx0dGhpcy5fZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbXB1dGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC51cGRhdGVPcHRpb25zKHRoaXMuX2VkaXRvck9wdGlvbnMpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy5fb25EaWRGb2N1c1dpZGdldC5maXJlKCkpKTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDb250ZW50U2l6ZUNoYW5nZShlID0+IHtcblx0XHRcdGlmICghZS5jb250ZW50SGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucykge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRXaWRnZXRzKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbiwgdGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMucG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSh7IHJlYXNvbjogdGhpcy5fdG9FZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uKGUpIH0pKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyByZWFzb246IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uRURJVCB9KSkpO1xuXG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZU5vdGVib29rQWZmaW5pdHkodGhpcy5fc3luY1dpdGhLZXJuZWwsIHRoaXMpKTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZVNlbGVjdGVkTm90ZWJvb2tzKHRoaXMuX3N5bmNXaXRoS2VybmVsLCB0aGlzKSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dCA9IElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChpbnB1dC5yZXNvdXJjZSAmJiBpbnB1dC5oaXN0b3J5U2VydmljZS5oYXMoaW5wdXQucmVzb3VyY2UpKSB7XG5cdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ3RvcCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ25vbmUnKTtcblx0XHR9XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoeyBwb3NpdGlvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Ll9nZXRWaWV3TW9kZWwoKSE7XG5cdFx0XHRjb25zdCBsYXN0TGluZU51bWJlciA9IHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IGxhc3RMaW5lQ29sID0gdmlld01vZGVsLmdldExpbmVMZW5ndGgobGFzdExpbmVOdW1iZXIpICsgMTtcblx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGZpcnN0TGluZSA9IHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID09PSAxICYmIHZpZXdQb3NpdGlvbi5jb2x1bW4gPT09IDE7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID09PSBsYXN0TGluZU51bWJlciAmJiB2aWV3UG9zaXRpb24uY29sdW1uID09PSBsYXN0TGluZUNvbDtcblxuXHRcdFx0aWYgKGZpcnN0TGluZSkge1xuXHRcdFx0XHRpZiAobGFzdExpbmUpIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ2JvdGgnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ3RvcCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAobGFzdExpbmUpIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ2JvdHRvbScpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnbm9uZScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZChlZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBlZGl0b3JNb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdFx0aWYgKHRoaXMuaW5wdXQ/LnJlc291cmNlICYmIHZhbHVlICE9PSAnJykge1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9ICh0aGlzLmlucHV0IGFzIFJlcGxFZGl0b3JJbnB1dCkuaGlzdG9yeVNlcnZpY2U7XG5cdFx0XHRcdGlmICghaGlzdG9yeVNlcnZpY2UubWF0Y2hlc0N1cnJlbnQodGhpcy5pbnB1dC5yZXNvdXJjZSwgdmFsdWUpKSB7XG5cdFx0XHRcdFx0aGlzdG9yeVNlcnZpY2UucmVwbGFjZUxhc3QodGhpcy5pbnB1dC5yZXNvdXJjZSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEub25EaWRTY3JvbGwoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VTY3JvbGwuZmlyZSgpKSk7XG5cblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLm9uRGlkQ2hhbmdlVmlld0NlbGxzKHRoaXMuaGFuZGxlVmlld0NlbGxDaGFuZ2UsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdHRoaXMuX3N5bmNXaXRoS2VybmVsKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVZpZXdDZWxsQ2hhbmdlKGU6IElOb3RlYm9va1ZpZXdDZWxsc1VwZGF0ZUV2ZW50KSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tXaWRnZXQgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZTtcblx0XHRpZiAoIW5vdGVib29rV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzcGxpY2Ugb2YgZS5zcGxpY2VzKSB7XG5cdFx0XHRjb25zdCBbX3N0YXJ0LCBfZGVsZXRlLCBhZGRlZENlbGxzXSA9IHNwbGljZTtcblx0XHRcdGlmIChhZGRlZENlbGxzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBub3RlYm9va1dpZGdldC52aWV3TW9kZWw7XG5cdFx0XHRcdGlmICh2aWV3TW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZUFwcGVuZChub3RlYm9va1dpZGdldCwgdmlld01vZGVsKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQXBwZW5kKG5vdGVib29rV2lkZ2V0OiBOb3RlYm9va0VkaXRvcldpZGdldCwgdmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCkge1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0U2VydmljZS51cGRhdGVSZXBsQ29udGV4dEtleSh2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudC51cmkudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgbmF2aWdhdGVUb0NlbGwgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS5yZXBsRWRpdG9yLmF1dG9Gb2N1c1JlcGxFeGVjdXRpb24nKTtcblx0XHRpZiAodGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0aWYgKG5hdmlnYXRlVG9DZWxsID09PSAnbGFzdEV4ZWN1dGlvbicpIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdENlbGxJbmRleCA9IHZpZXdNb2RlbC5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdGlmIChsYXN0Q2VsbEluZGV4ID49IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwudmlld0NlbGxzW2xhc3RDZWxsSW5kZXhdO1xuXHRcdFx0XHRcdFx0bm90ZWJvb2tXaWRnZXQuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2NvbnRhaW5lcicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9IGVsc2UgaWYgKG5hdmlnYXRlVG9DZWxsID09PSAnaW5wdXQnKSB7XG5cdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXRPcHRpb25zKG9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHRzdXBlci5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9FZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uKGU6IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCk6IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24ge1xuXHRcdHN3aXRjaCAoZS5zb3VyY2UpIHtcblx0XHRcdGNhc2UgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5QUk9HUkFNTUFUSUM6IHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLlBST0dSQU1NQVRJQztcblx0XHRcdGNhc2UgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5OQVZJR0FUSU9OOiByZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5OQVZJR0FUSU9OO1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLkpVTVA6IHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkpVTVA7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5VU0VSO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NlbGxBdEJvdHRvbShjZWxsOiBJQ2VsbFZpZXdNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8udmlzaWJsZVJhbmdlcyB8fCBbXTtcblx0XHRjb25zdCBjZWxsSW5kZXggPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdGlmIChjZWxsSW5kZXggPT09IE1hdGgubWF4KC4uLnZpc2libGVSYW5nZXMubWFwKHJhbmdlID0+IHJhbmdlLmVuZCAtIDEpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3Njcm9sbElmTmVjZXNzYXJ5KGN2bTogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5nZXRDZWxsSW5kZXgoY3ZtKTtcblx0XHRpZiAoaW5kZXggPT09IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5nZXRMZW5ndGgoKSAtIDEpIHtcblx0XHRcdC8vIElmIHdlJ3JlIGFscmVhZHkgYXQgdGhlIGJvdHRvbSBvciBhdXRvIHNjcm9sbCBpcyBlbmFibGVkLCBzY3JvbGwgdG8gdGhlIGJvdHRvbVxuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlcGxFZGl0b3JTZXR0aW5ncy5pbnRlcmFjdGl2ZVdpbmRvd0Fsd2F5c1Njcm9sbE9uTmV3Q2VsbCkgfHwgdGhpcy5fY2VsbEF0Qm90dG9tKGN2bSkpIHtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLnNjcm9sbFRvQm90dG9tKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3luY1dpdGhLZXJuZWwoKSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8udGV4dE1vZGVsO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKTtcblxuXHRcdGlmIChub3RlYm9vayAmJiB0ZXh0TW9kZWwpIHtcblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2spO1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRPclN1Z2dlc3RlZCA9IGluZm8uc2VsZWN0ZWRcblx0XHRcdFx0Pz8gKGluZm8uc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAxID8gaW5mby5zdWdnZXN0aW9uc1swXSA6IHVuZGVmaW5lZClcblx0XHRcdFx0Pz8gKGluZm8uYWxsLmxlbmd0aCA9PT0gMSA/IGluZm8uYWxsWzBdIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0aWYgKHNlbGVjdGVkT3JTdWdnZXN0ZWQpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBzZWxlY3RlZE9yU3VnZ2VzdGVkLnN1cHBvcnRlZExhbmd1YWdlc1swXTtcblx0XHRcdFx0Ly8gQWxsIGtlcm5lbHMgd2lsbCBpbml0aWFsbHkgbGlzdCBwbGFpbnRleHQgYXMgdGhlIHN1cHBvcnRlZCBsYW5ndWFnZSBiZWZvcmUgdGhleSBwcm9wZXJseSBpbml0aWFsaXplZC5cblx0XHRcdFx0aWYgKGxhbmd1YWdlICYmIGxhbmd1YWdlICE9PSAncGxhaW50ZXh0Jykge1xuXHRcdFx0XHRcdGNvbnN0IG5ld01vZGUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZSkubGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHR0ZXh0TW9kZWwuc2V0TGFuZ3VhZ2UobmV3TW9kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHROT1RFQk9PS19LRVJORUwuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKS5zZXQoc2VsZWN0ZWRPclN1Z2dlc3RlZC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiwgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtaWQtd2lkdGgnLCBkaW1lbnNpb24ud2lkdGggPCAxMDAwICYmIGRpbWVuc2lvbi53aWR0aCA+PSA2MDApO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdy13aWR0aCcsIGRpbWVuc2lvbi53aWR0aCA8IDYwMCk7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0Q2hhbmdlZCA9IGRpbWVuc2lvbi5oZWlnaHQgIT09IHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zPy5kaW1lbnNpb24uaGVpZ2h0O1xuXHRcdHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zID0geyBkaW1lbnNpb24sIHBvc2l0aW9uIH07XG5cblx0XHRpZiAoIXRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvckhlaWdodENoYW5nZWQgJiYgdGhpcy5fY29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpPy5jYW5jZWxTdWdnZXN0V2lkZ2V0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9sYXlvdXRXaWRnZXRzKGRpbWVuc2lvbiwgcG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0V2lkZ2V0cyhkaW1lbnNpb246IERPTS5EaW1lbnNpb24sIHBvc2l0aW9uOiBET00uSURvbVBvc2l0aW9uKSB7XG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuaGFzTW9kZWwoKSA/IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0Q29udGVudEhlaWdodCgpIDogdGhpcy5pbnB1dENlbGxFZGl0b3JIZWlnaHQ7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4oZGltZW5zaW9uLmhlaWdodCAvIDIsIGNvbnRlbnRIZWlnaHQpO1xuXHRcdGNvbnN0IGxlZnRNYXJnaW4gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4oKTtcblxuXHRcdGNvbnN0IGlucHV0Q2VsbENvbnRhaW5lckhlaWdodCA9IG1heEhlaWdodCArIElOUFVUX0NFTExfVkVSVElDQUxfUEFERElORyAqIDI7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodCAtIGlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEubGF5b3V0KGRpbWVuc2lvbi53aXRoKGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCAtIGlucHV0Q2VsbENvbnRhaW5lckhlaWdodCksIHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyLCBwb3NpdGlvbik7XG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5sYXlvdXQodGhpcy5fdmFsaWRhdGVEaW1lbnNpb24oZGltZW5zaW9uLndpZHRoIC0gbGVmdE1hcmdpbiAtIElOUFVUX0NFTExfSE9SSVpPTlRBTF9QQURESU5HX1JJR0hULCBtYXhIZWlnaHQpKTtcblx0XHR0aGlzLl9pbnB1dEZvY3VzSW5kaWNhdG9yLnN0eWxlLmhlaWdodCA9IGAke2NvbnRlbnRIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS50b3AgPSBgJHtkaW1lbnNpb24uaGVpZ2h0IC0gaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGh9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVEaW1lbnNpb24od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRyZXR1cm4gbmV3IERPTS5EaW1lbnNpb24oTWF0aC5tYXgoMCwgd2lkdGgpLCBNYXRoLm1heCgwLCBoZWlnaHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0NvbmZsaWN0aW5nRGVjb3JhdGlvbigpIHtcblx0XHRyZXR1cm4gQm9vbGVhbih0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldExpbmVEZWNvcmF0aW9ucygxKT8uZmluZCgoZCkgPT5cblx0XHRcdGQub3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lXG5cdFx0XHR8fCBkLm9wdGlvbnMuYWZ0ZXJDb250ZW50Q2xhc3NOYW1lXG5cdFx0XHR8fCBkLm9wdGlvbnMuYmVmb3JlPy5jb250ZW50XG5cdFx0XHR8fCBkLm9wdGlvbnMuYWZ0ZXI/LmNvbnRlbnRcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUlucHV0SGludCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRIaWRlID1cblx0XHRcdCF0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lmhhc01vZGVsKCkgfHxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlcGxFZGl0b3JTZXR0aW5ncy5zaG93RXhlY3V0aW9uSGludCkgPT09IGZhbHNlIHx8XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldE1vZGVsKCkhLmdldFZhbHVlTGVuZ3RoKCkgIT09IDAgfHxcblx0XHRcdHRoaXMuX2hhc0NvbmZsaWN0aW5nRGVjb3JhdGlvbigpO1xuXG5cdFx0aWYgKCF0aGlzLl9oaW50RWxlbWVudCAmJiAhc2hvdWxkSGlkZSkge1xuXHRcdFx0dGhpcy5faGludEVsZW1lbnQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsSW5wdXRIaW50Q29udGVudFdpZGdldCwgdGhpcy5fY29kZUVkaXRvcldpZGdldCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9oaW50RWxlbWVudCAmJiBzaG91bGRIaWRlKSB7XG5cdFx0XHR0aGlzLl9oaW50RWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9oaW50RWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRnZXRTY3JvbGxQb3NpdGlvbigpOiBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Nyb2xsVG9wOiB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2Nyb2xsVG9wID8/IDAsXG5cdFx0XHRzY3JvbGxMZWZ0OiAwXG5cdFx0fTtcblx0fVxuXG5cdHNldFNjcm9sbFBvc2l0aW9uKHBvc2l0aW9uOiBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnNldFNjcm9sbFRvcChwb3NpdGlvbi5zY3JvbGxUb3ApO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKSB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5vblNob3coKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c0hpc3RvcnkoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLmZvY3VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0XHR0aGlzLl9ncm91cExpc3RlbmVyLnZhbHVlID0gdGhpcy5ncm91cC5vbldpbGxDbG9zZUVkaXRvcihlID0+IHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUoZS5lZGl0b3IpKTtcblxuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRcdGlmICh0aGlzLmlucHV0ICYmIHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLm9uV2lsbEhpZGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUub25XaWxsSGlkZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQ/LmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0ID0geyB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCk6IFJlcGxFZGl0b3JDb250cm9sICYgSUNvbXBvc2l0ZUNvZGVFZGl0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRub3RlYm9va0VkaXRvcjogdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUsXG5cdFx0XHRhY3RpdmVDb2RlRWRpdG9yOiB0aGlzLmdldEFjdGl2ZUNvZGVFZGl0b3IoKSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlRWRpdG9yOiBFdmVudC5Ob25lXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ29kZUVkaXRvcigpIHtcblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lmhhc1dpZGdldEZvY3VzKCkgfHwgIXRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5hY3RpdmVDb2RlRWRpdG9yID9cblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQgOlxuXHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUuYWN0aXZlQ29kZUVkaXRvcjtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBSZXBsRWRpdG9yQ29udHJvbCA9IHsgYWN0aXZlQ29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQ7IG5vdGVib29rRWRpdG9yOiBOb3RlYm9va0VkaXRvcldpZGdldCB8IHVuZGVmaW5lZCB9O1xuXG5leHBvcnQgZnVuY3Rpb24gaXNSZXBsRWRpdG9yQ29udHJvbChjb250cm9sOiB1bmtub3duKTogY29udHJvbCBpcyBSZXBsRWRpdG9yQ29udHJvbCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGNvbnRyb2wgYXMgUmVwbEVkaXRvckNvbnRyb2w7XG5cdHJldHVybiBjYW5kaWRhdGU/LmFjdGl2ZUNvZGVFZGl0b3IgaW5zdGFuY2VvZiBDb2RlRWRpdG9yV2lkZ2V0ICYmIGNhbmRpZGF0ZT8ubm90ZWJvb2tFZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcldpZGdldDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixZQUFZLG9CQUFvQjtBQUVoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQix5QkFBeUI7QUFDbkQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1Q0FBaUs7QUFDMUssU0FBUyw4QkFB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d0I7QUFDM0QsVUFBTSxpQkFBaUIsT0FBTztBQUM5QixTQUFLLGVBQWUsUUFBUSxLQUFLLE1BQU0sa0JBQWtCLE9BQUssS0FBSyxxQkFBcUIsRUFBRSxNQUFNLENBQUM7QUFFakcsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLHFCQUFxQixLQUFLLEtBQUs7QUFDcEMsVUFBSSxLQUFLLFNBQVMsS0FBSyxnQkFBZ0IsT0FBTztBQUM3QyxhQUFLLGdCQUFnQixNQUFNLFdBQVc7QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFFQSxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUyxhQUFhO0FBQ3JCLFFBQUksS0FBSyxnQkFBZ0IsT0FBTztBQUMvQixXQUFLLHFCQUFxQixLQUFLLEtBQUs7QUFDcEMsV0FBSyxnQkFBZ0IsTUFBTSxXQUFXO0FBQUEsSUFDdkM7QUFFQSxTQUFLLG1CQUFtQixRQUFRO0FBRWhDLFNBQUssa0JBQWtCLEVBQUUsT0FBTyxPQUFVO0FBQzFDLFNBQUssdUJBQXVCLE1BQU07QUFFbEMsVUFBTSxXQUFXO0FBQUEsRUFDbEI7QUFBQSxFQUVTLGFBQXVEO0FBQy9ELFdBQU87QUFBQSxNQUNOLGdCQUFnQixLQUFLLGdCQUFnQjtBQUFBLE1BQ3JDLGtCQUFrQixLQUFLLG9CQUFvQjtBQUFBLE1BQzNDLHlCQUF5QixNQUFNO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0I7QUFDN0IsUUFBSSxDQUFDLEtBQUssbUJBQW1CO0FBQzVCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLGtCQUFrQixlQUFlLEtBQUssQ0FBQyxLQUFLLGdCQUFnQixPQUFPLG1CQUM5RSxLQUFLLG9CQUNMLEtBQUssZ0JBQWdCLE1BQU07QUFBQSxFQUM3QjtBQUNEO0FBN3FCYSxhQUFOO0FBQUEsRUF1Q0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F2RFU7QUFpckJOLFNBQVMsb0JBQW9CLFNBQWdEO0FBQ25GLFFBQU0sWUFBWTtBQUNsQixTQUFPLFdBQVcsNEJBQTRCLG9CQUFvQixXQUFXLDBCQUEwQjtBQUN4RzsiLAogICJuYW1lcyI6IFsiaW5wdXQiXQp9Cg==
