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
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { EditorPaneSelectionChangeReason } from "../../../common/editor.js";
import { getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { InteractiveEditorInput } from "./interactiveEditorInput.js";
import { NotebookEditorExtensionsRegistry } from "../../notebook/browser/notebookEditorExtensions.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ExecutionStateCellStatusBarContrib, TimerCellStatusBarContrib } from "../../notebook/browser/contrib/cellStatusBar/executionStatusBarItemController.js";
import { INotebookKernelService } from "../../notebook/common/notebookKernelService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from "./interactiveCommon.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NotebookOptions } from "../../notebook/browser/notebookOptions.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { createActionViewItem, getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { ParameterHintsController } from "../../../../editor/contrib/parameterHints/browser/parameterHints.js";
import { MenuPreventer } from "../../codeEditor/browser/menuPreventer.js";
import { SelectionClipboardContributionID } from "../../codeEditor/browser/selectionClipboard.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { TabCompletionController } from "../../snippets/browser/tabCompletion.js";
import { MarkerController } from "../../../../editor/contrib/gotoError/browser/gotoError.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { TextEditorSelectionSource } from "../../../../platform/editor/common/editor.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../notebook/common/notebookExecutionStateService.js";
import { NOTEBOOK_KERNEL } from "../../notebook/common/notebookContextKeys.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isEqual } from "../../../../base/common/resources.js";
import { NotebookFindContrib } from "../../notebook/browser/contrib/find/notebookFindWidget.js";
import { INTERACTIVE_WINDOW_EDITOR_ID } from "../../notebook/common/notebookCommon.js";
import "./interactiveEditor.css";
import { deepClone } from "../../../../base/common/objects.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { ReplInputHintContentWidget } from "./replInputHintContentWidget.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { INLINE_CHAT_ID } from "../../inlineChat/common/inlineChat.js";
const DECORATION_KEY = "interactiveInputDecoration";
const INTERACTIVE_EDITOR_VIEW_STATE_PREFERENCE_KEY = "InteractiveEditorViewState";
const INPUT_CELL_VERTICAL_PADDING = 8;
const INPUT_CELL_HORIZONTAL_PADDING_RIGHT = 10;
const INPUT_EDITOR_PADDING = 8;
let InteractiveEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, notebookWidgetService, contextKeyService, codeEditorService, notebookKernelService, languageService, keybindingService, configurationService, menuService, contextMenuService, editorGroupService, textResourceConfigurationService, notebookExecutionStateService, extensionService) {
    super(
      INTERACTIVE_WINDOW_EDITOR_ID,
      group,
      telemetryService,
      themeService,
      storageService
    );
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
    this._notebookExecutionStateService = notebookExecutionStateService;
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
    this._register(codeEditorService.registerDecorationType("interactive-decoration", DECORATION_KEY, {}));
    this._register(this._keybindingService.onDidUpdateKeybindings(this._updateInputHint, this));
    this._register(this._notebookExecutionStateService.onDidChangeExecution((e) => {
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
    const menu = this._register(this._menuService.createMenu(MenuId.InteractiveInputExecute, this._contextKeyService));
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
    if (!(input instanceof InteractiveEditorInput)) {
      return void 0;
    }
    this._saveEditorViewState(input);
    return this._loadNotebookEditorViewState(input);
  }
  _saveEditorViewState(input) {
    if (this._notebookWidget.value && input instanceof InteractiveEditorInput) {
      if (this._notebookWidget.value.isDisposed) {
        return;
      }
      const state = this._notebookWidget.value.getEditorViewState();
      const editorState = this._codeEditorWidget.saveViewState();
      this._editorMemento.saveEditorState(this.group, input.notebookEditorInput.resource, {
        notebook: state,
        input: editorState
      });
    }
  }
  _loadNotebookEditorViewState(input) {
    const result = this._editorMemento.loadEditorState(this.group, input.notebookEditorInput.resource);
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
    const notebookInput = input.notebookEditorInput;
    this._notebookWidget.value?.onWillHide();
    this._codeEditorWidget?.dispose();
    this._widgetDisposableStore.clear();
    this._notebookWidget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, notebookInput, {
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
    this._codeEditorWidget = this._instantiationService.createInstance(CodeEditorWidget, this._inputEditorContainer, this._editorOptions, {
      ...{
        isSimpleWidget: false,
        contributions: EditorExtensionsRegistry.getSomeEditorContributions([
          MenuPreventer.ID,
          SelectionClipboardContributionID,
          ContextMenuController.ID,
          SuggestController.ID,
          ParameterHintsController.ID,
          SnippetController2.ID,
          TabCompletionController.ID,
          ContentHoverController.ID,
          GlyphHoverController.ID,
          MarkerController.ID,
          INLINE_CHAT_ID
        ])
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
      throw new Error("The Interactive Window model could not be resolved");
    }
    this._notebookWidget.value?.setParentContextKeyService(this._contextKeyService);
    const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
    await this._extensionService.whenInstalledExtensionsRegistered();
    await this._notebookWidget.value.setModel(model.notebook, viewState?.notebook);
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
    const languageId = this._notebookWidget.value?.activeKernel?.supportedLanguages[0] ?? input.language ?? PLAINTEXT_LANGUAGE_ID;
    const editorModel = await input.resolveInput(languageId);
    editorModel.setLanguage(languageId);
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
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModel(() => {
      this._updateInputHint();
    }));
    this._widgetDisposableStore.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ReplEditorSettings.showExecutionHint)) {
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
      if (this.input?.resource) {
        const historyService = this.input.historyService;
        if (!historyService.matchesCurrent(this.input.resource, value)) {
          historyService.replaceLast(this.input.resource, value);
        }
      }
    }));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidScroll(() => this._onDidChangeScroll.fire()));
    this._syncWithKernel();
    this._updateInputHint();
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
      activeCodeEditor: this._codeEditorWidget,
      onDidChangeActiveEditor: Event.None
    };
  }
};
InteractiveEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotebookEditorService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ICodeEditorService),
  __decorateParam(8, INotebookKernelService),
  __decorateParam(9, ILanguageService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IMenuService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IEditorGroupsService),
  __decorateParam(15, ITextResourceConfigurationService),
  __decorateParam(16, INotebookExecutionStateService),
  __decorateParam(17, IExtensionService)
], InteractiveEditor);
export {
  InteractiveEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGludGVyYWN0aXZlXFxicm93c2VyXFxpbnRlcmFjdGl2ZUVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9pbnRlcmFjdGl2ZS5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclZpZXdTdGF0ZSwgSUNvbXBvc2l0ZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24sIElFZGl0b3JNZW1lbnRvLCBJRWRpdG9yT3BlbkNvbnRleHQsIElFZGl0b3JQYW5lU2Nyb2xsUG9zaXRpb24sIElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQsIElFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEludGVyYWN0aXZlRWRpdG9ySW5wdXQgfSBmcm9tICcuL2ludGVyYWN0aXZlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvck9wdGlvbnMsIElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUJvcnJvd1ZhbHVlLCBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEdyb3Vwc09yZGVyLCBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4ZWN1dGlvblN0YXRlQ2VsbFN0YXR1c0JhckNvbnRyaWIsIFRpbWVyQ2VsbFN0YXR1c0JhckNvbnRyaWIgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvY2VsbFN0YXR1c0Jhci9leGVjdXRpb25TdGF0dXNCYXJJdGVtQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9yU2V0dGluZ3MsIElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWSB9IGZyb20gJy4vaW50ZXJhY3RpdmVDb21tb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va09wdGlvbnMgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSwgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFBhcmFtZXRlckhpbnRzQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BhcmFtZXRlckhpbnRzL2Jyb3dzZXIvcGFyYW1ldGVySGludHMuanMnO1xuaW1wb3J0IHsgTWVudVByZXZlbnRlciB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9tZW51UHJldmVudGVyLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklEIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NlbGVjdGlvbkNsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0TWVudUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb250ZXh0bWVudS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgVGFiQ29tcGxldGlvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9zbmlwcGV0cy9icm93c2VyL3RhYkNvbXBsZXRpb24uanMnO1xuaW1wb3J0IHsgTWFya2VyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9FcnJvci9icm93c2VyL2dvdG9FcnJvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucywgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0tFUk5FTCB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZENvbnRyaWIgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvZmluZC9ub3RlYm9va0ZpbmRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSU5URVJBQ1RJVkVfV0lORE9XX0VESVRPUl9JRCB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgJy4vaW50ZXJhY3RpdmVFZGl0b3IuY3NzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2NvbnRlbnRIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgR2x5cGhIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2dseXBoSG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFJlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0IH0gZnJvbSAnLi9yZXBsSW5wdXRIaW50Q29udGVudFdpZGdldC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElOTElORV9DSEFUX0lEIH0gZnJvbSAnLi4vLi4vaW5saW5lQ2hhdC9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9yQ29udHJvbCB9IGZyb20gJy4uLy4uL3JlcGxOb3RlYm9vay9icm93c2VyL3JlcGxFZGl0b3IuanMnO1xuXG5jb25zdCBERUNPUkFUSU9OX0tFWSA9ICdpbnRlcmFjdGl2ZUlucHV0RGVjb3JhdGlvbic7XG5jb25zdCBJTlRFUkFDVElWRV9FRElUT1JfVklFV19TVEFURV9QUkVGRVJFTkNFX0tFWSA9ICdJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZSc7XG5cbmNvbnN0IElOUFVUX0NFTExfVkVSVElDQUxfUEFERElORyA9IDg7XG5jb25zdCBJTlBVVF9DRUxMX0hPUklaT05UQUxfUEFERElOR19SSUdIVCA9IDEwO1xuY29uc3QgSU5QVVRfRURJVE9SX1BBRERJTkcgPSA4O1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGUge1xuXHRyZWFkb25seSBub3RlYm9vaz86IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZTtcblx0cmVhZG9ubHkgaW5wdXQ/OiBJQ29kZUVkaXRvclZpZXdTdGF0ZSB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJhY3RpdmVFZGl0b3JPcHRpb25zIGV4dGVuZHMgSVRleHRFZGl0b3JPcHRpb25zIHtcblx0cmVhZG9ubHkgdmlld1N0YXRlPzogSW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGU7XG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGl2ZUVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUgaW1wbGVtZW50cyBJRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcge1xuXHRwcml2YXRlIF9yb290RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9zdHlsZUVsZW1lbnQhOiBIVE1MU3R5bGVFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va0VkaXRvckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va1dpZGdldDogSUJvcnJvd1ZhbHVlPE5vdGVib29rRWRpdG9yV2lkZ2V0PiA9IHsgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRwcml2YXRlIF9pbnB1dENlbGxDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaW5wdXRGb2N1c0luZGljYXRvciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9pbnB1dFJ1bkJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9pbnB1dEVkaXRvckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jb2RlRWRpdG9yV2lkZ2V0ITogQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSBfbm90ZWJvb2tXaWRnZXRTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgX25vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZTtcblx0cHJpdmF0ZSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZTtcblx0cHJpdmF0ZSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZTtcblx0cHJpdmF0ZSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlO1xuXHRwcml2YXRlIF9lZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlO1xuXHRwcml2YXRlIF9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlO1xuXHRwcml2YXRlIF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0RGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9sYXN0TGF5b3V0RGltZW5zaW9ucz86IHsgcmVhZG9ubHkgZGltZW5zaW9uOiBET00uRGltZW5zaW9uOyByZWFkb25seSBwb3NpdGlvbjogRE9NLklEb21Qb3NpdGlvbiB9O1xuXHRwcml2YXRlIF9lZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSBfbm90ZWJvb2tPcHRpb25zOiBOb3RlYm9va09wdGlvbnM7XG5cdHByaXZhdGUgX2VkaXRvck1lbWVudG86IElFZGl0b3JNZW1lbnRvPEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfcnVuYnV0dG9uVG9vbGJhcjogVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGludEVsZW1lbnQ6IFJlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkRm9jdXNXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0b3ZlcnJpZGUgZ2V0IG9uRGlkRm9jdXMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRGb2N1c1dpZGdldC5ldmVudDsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNjcm9sbCA9IHRoaXMuX29uRGlkQ2hhbmdlU2Nyb2xsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIG5vdGVib29rV2lkZ2V0U2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdElOVEVSQUNUSVZFX1dJTkRPV19FRElUT1JfSUQsXG5cdFx0XHRncm91cCxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZVxuXHRcdCk7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXRTZXJ2aWNlID0gbm90ZWJvb2tXaWRnZXRTZXJ2aWNlO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZSA9IGxhbmd1YWdlU2VydmljZTtcblx0XHR0aGlzLl9rZXliaW5kaW5nU2VydmljZSA9IGtleWJpbmRpbmdTZXJ2aWNlO1xuXHRcdHRoaXMuX21lbnVTZXJ2aWNlID0gbWVudVNlcnZpY2U7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlID0gY29udGV4dE1lbnVTZXJ2aWNlO1xuXHRcdHRoaXMuX2VkaXRvckdyb3VwU2VydmljZSA9IGVkaXRvckdyb3VwU2VydmljZTtcblx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlO1xuXHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UgPSBleHRlbnNpb25TZXJ2aWNlO1xuXG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQgPSBET00uJCgnLmludGVyYWN0aXZlLWVkaXRvcicpO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX3Jvb3RFbGVtZW50KSk7XG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdpc0NvbXBvc2l0ZU5vdGVib29rJywgdHJ1ZSk7XG5cdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXG5cdFx0dGhpcy5fZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbXB1dGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvcicpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ25vdGVib29rJykpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbXB1dGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX25vdGVib29rT3B0aW9ucyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3B0aW9ucywgdGhpcy53aW5kb3csIHRydWUsIHsgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbjogJ2hvdmVyJywgZ2xvYmFsVG9vbGJhcjogdHJ1ZSwgc3RpY2t5U2Nyb2xsRW5hYmxlZDogZmFsc2UsIGRyYWdBbmREcm9wRW5hYmxlZDogZmFsc2UsIGRpc2FibGVSdWxlcnM6IHRydWUgfSk7XG5cdFx0dGhpcy5fZWRpdG9yTWVtZW50byA9IHRoaXMuZ2V0RWRpdG9yTWVtZW50bzxJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZT4oZWRpdG9yR3JvdXBTZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgSU5URVJBQ1RJVkVfRURJVE9SX1ZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZSgnaW50ZXJhY3RpdmUtZGVjb3JhdGlvbicsIERFQ09SQVRJT05fS0VZLCB7fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3ModGhpcy5fdXBkYXRlSW5wdXRIaW50LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsICYmIGlzRXF1YWwoZS5ub3RlYm9vaywgdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnZpZXdNb2RlbD8ubm90ZWJvb2tEb2N1bWVudC51cmkpKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uZ2V0Q2VsbEJ5SGFuZGxlKGUuY2VsbEhhbmRsZSk7XG5cdFx0XHRcdGlmIChjZWxsICYmIGUuY2hhbmdlZD8uc3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLl9zY3JvbGxJZk5lY2Vzc2FyeShjZWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlucHV0Q2VsbENvbnRhaW5lckhlaWdodCgpIHtcblx0XHRyZXR1cm4gMTkgKyAyICsgSU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HICogMiArIElOUFVUX0VESVRPUl9QQURESU5HICogMjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlucHV0Q2VsbEVkaXRvckhlaWdodCgpIHtcblx0XHRyZXR1cm4gMTkgKyBJTlBVVF9FRElUT1JfUEFERElORyAqIDI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRET00uYXBwZW5kKHBhcmVudCwgdGhpcy5fcm9vdEVsZW1lbnQpO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5fcm9vdEVsZW1lbnQsIERPTS4kKCcubm90ZWJvb2stZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX3Jvb3RFbGVtZW50LCBET00uJCgnLmlucHV0LWNlbGwtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9pbnB1dEZvY3VzSW5kaWNhdG9yID0gRE9NLmFwcGVuZCh0aGlzLl9pbnB1dENlbGxDb250YWluZXIsIERPTS4kKCcuaW5wdXQtZm9jdXMtaW5kaWNhdG9yJykpO1xuXHRcdHRoaXMuX2lucHV0UnVuQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9pbnB1dENlbGxDb250YWluZXIsIERPTS4kKCcucnVuLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fc2V0dXBSdW5CdXR0b25Ub29sYmFyKHRoaXMuX2lucHV0UnVuQnV0dG9uQ29udGFpbmVyKTtcblx0XHR0aGlzLl9pbnB1dEVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLCBET00uJCgnLmlucHV0LWVkaXRvci1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fY3JlYXRlTGF5b3V0U3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFJ1bkJ1dHRvblRvb2xiYXIocnVuQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5JbnRlcmFjdGl2ZUlucHV0RXhlY3V0ZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR0aGlzLl9ydW5idXR0b25Ub29sYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvb2xCYXIocnVuQnV0dG9uQ29udGFpbmVyLCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCksXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRyZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50OiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdHRoaXMuX3J1bmJ1dHRvblRvb2xiYXIuc2V0QWN0aW9ucyhbLi4ucHJpbWFyeSwgLi4uc2Vjb25kYXJ5XSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVMYXlvdXRTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50ID0gZG9tU3R5bGVzaGVldHMuY3JlYXRlU3R5bGVTaGVldCh0aGlzLl9yb290RWxlbWVudCk7XG5cdFx0Y29uc3Qgc3R5bGVTaGVldHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCB7XG5cdFx0XHRjb2RlQ2VsbExlZnRNYXJnaW4sXG5cdFx0XHRjZWxsUnVuR3V0dGVyXG5cdFx0fSA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRMYXlvdXRDb25maWd1cmF0aW9uKCk7XG5cdFx0Y29uc3Qge1xuXHRcdFx0Zm9jdXNJbmRpY2F0b3Jcblx0XHR9ID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCk7XG5cdFx0Y29uc3QgbGVmdE1hcmdpbiA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbigpO1xuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciB7XG5cdFx0XHRcdHBhZGRpbmc6ICR7SU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HfXB4ICR7SU5QVVRfQ0VMTF9IT1JJWk9OVEFMX1BBRERJTkdfUklHSFR9cHggJHtJTlBVVF9DRUxMX1ZFUlRJQ0FMX1BBRERJTkd9cHggJHtsZWZ0TWFyZ2lufXB4O1xuXHRcdFx0fVxuXHRcdGApO1xuXHRcdGlmIChmb2N1c0luZGljYXRvciA9PT0gJ2d1dHRlcicpIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lcjpmb2N1cy13aXRoaW4gLmlucHV0LWZvY3VzLWluZGljYXRvcjo6YmVmb3JlIHtcblx0XHRcdFx0XHRib3JkZXItY29sb3I6IHZhcigtLXZzY29kZS1ub3RlYm9vay1mb2N1c2VkQ2VsbEJvcmRlcikgIWltcG9ydGFudDtcblx0XHRcdFx0fVxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1mb2N1cy1pbmRpY2F0b3I6OmJlZm9yZSB7XG5cdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2staW5hY3RpdmVGb2N1c2VkQ2VsbEJvcmRlcikgIWltcG9ydGFudDtcblx0XHRcdFx0fVxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciAuaW5wdXQtZm9jdXMtaW5kaWNhdG9yIHtcblx0XHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0XHR0b3A6ICR7SU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HfXB4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIHtcblx0XHRcdFx0XHRib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tdnNjb2RlLW5vdGVib29rLWluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gYm9yZGVyXG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIge1xuXHRcdFx0XHRcdGJvcmRlci10b3A6IDFweCBzb2xpZCB2YXIoLS12c2NvZGUtbm90ZWJvb2staW5hY3RpdmVGb2N1c2VkQ2VsbEJvcmRlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIgLmlucHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdFx0ZGlzcGxheTogbm9uZTtcblx0XHRcdFx0fVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciAucnVuLWJ1dHRvbi1jb250YWluZXIge1xuXHRcdFx0XHR3aWR0aDogJHtjZWxsUnVuR3V0dGVyfXB4O1xuXHRcdFx0XHRsZWZ0OiAke2NvZGVDZWxsTGVmdE1hcmdpbn1weDtcblx0XHRcdFx0bWFyZ2luLXRvcDogJHtJTlBVVF9FRElUT1JfUEFERElORyAtIDJ9cHg7XG5cdFx0XHR9XG5cdFx0YCk7XG5cblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBzdHlsZVNoZWV0cy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVFZGl0b3JPcHRpb25zKCk6IElFZGl0b3JPcHRpb25zIHtcblx0XHRsZXQgb3ZlcnJpZGVJZGVudGlmaWVyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllciA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKT8uZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdH1cblx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gZGVlcENsb25lKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJywgeyBvdmVycmlkZUlkZW50aWZpZXIgfSkpO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnNPdmVycmlkZSA9IGdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbXB1dGVkID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHQuLi5lZGl0b3JPcHRpb25zLFxuXHRcdFx0Li4uZWRpdG9yT3B0aW9uc092ZXJyaWRlLFxuXHRcdFx0Li4ue1xuXHRcdFx0XHRnbHlwaE1hcmdpbjogdHJ1ZSxcblx0XHRcdFx0cGFkZGluZzoge1xuXHRcdFx0XHRcdHRvcDogSU5QVVRfRURJVE9SX1BBRERJTkcsXG5cdFx0XHRcdFx0Ym90dG9tOiBJTlBVVF9FRElUT1JfUEFERElOR1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRob3Zlcjoge1xuXHRcdFx0XHRcdGVuYWJsZWQ6ICdvbicgYXMgY29uc3Rcblx0XHRcdFx0fSxcblx0XHRcdFx0cnVsZXJzOiBbXVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNvbXB1dGVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Vmlld1N0YXRlKCk6IEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQ7XG5cdFx0aWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBJbnRlcmFjdGl2ZUVkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0XHRyZXR1cm4gdGhpcy5fbG9hZE5vdGVib29rRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlICYmIGlucHV0IGluc3RhbmNlb2YgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCkge1xuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLmdldEVkaXRvclZpZXdTdGF0ZSgpO1xuXHRcdFx0Y29uc3QgZWRpdG9yU3RhdGUgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LnNhdmVWaWV3U3RhdGUoKTtcblx0XHRcdHRoaXMuX2VkaXRvck1lbWVudG8uc2F2ZUVkaXRvclN0YXRlKHRoaXMuZ3JvdXAsIGlucHV0Lm5vdGVib29rRWRpdG9ySW5wdXQucmVzb3VyY2UsIHtcblx0XHRcdFx0bm90ZWJvb2s6IHN0YXRlLFxuXHRcdFx0XHRpbnB1dDogZWRpdG9yU3RhdGVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dDogSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCk6IEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9lZGl0b3JNZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCBpbnB1dC5ub3RlYm9va0VkaXRvcklucHV0LnJlc291cmNlKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHQvLyB3aGVuIHdlIGRvbid0IGhhdmUgYSB2aWV3IHN0YXRlIGZvciB0aGUgZ3JvdXAvaW5wdXQtdHVwbGUgdGhlbiB3ZSB0cnkgdG8gdXNlIGFuIGV4aXN0aW5nXG5cdFx0Ly8gZWRpdG9yIGZvciB0aGUgc2FtZSByZXNvdXJjZS5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRpZiAoZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZSAhPT0gdGhpcyAmJiBncm91cC5hY3RpdmVFZGl0b3JQYW5lID09PSB0aGlzICYmIGdyb3VwLmFjdGl2ZUVkaXRvcj8ubWF0Y2hlcyhpbnB1dCkpIHtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uZ2V0RWRpdG9yVmlld1N0YXRlKCk7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bm90ZWJvb2ssXG5cdFx0XHRcdFx0aW5wdXRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IEludGVyYWN0aXZlRWRpdG9ySW5wdXQsIG9wdGlvbnM6IEludGVyYWN0aXZlRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3RlYm9va0lucHV0ID0gaW5wdXQubm90ZWJvb2tFZGl0b3JJbnB1dDtcblxuXHRcdC8vIHRoZXJlIGN1cnJlbnRseSBpcyBhIHdpZGdldCB3aGljaCB3ZSBzdGlsbCBvd24gc29cblx0XHQvLyB3ZSBuZWVkIHRvIGhpZGUgaXQgYmVmb3JlIGdldHRpbmcgYSBuZXcgd2lkZ2V0XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/Lm9uV2lsbEhpZGUoKTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQ/LmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQgPSA8SUJvcnJvd1ZhbHVlPE5vdGVib29rRWRpdG9yV2lkZ2V0Pj50aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0aGlzLl9ub3RlYm9va1dpZGdldFNlcnZpY2UucmV0cmlldmVXaWRnZXQsIHRoaXMuZ3JvdXAuaWQsIG5vdGVib29rSW5wdXQsIHtcblx0XHRcdGlzUmVwbEhpc3Rvcnk6IHRydWUsXG5cdFx0XHRpc1JlYWRPbmx5OiB0cnVlLFxuXHRcdFx0Y29udHJpYnV0aW9uczogTm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRFeGVjdXRpb25TdGF0ZUNlbGxTdGF0dXNCYXJDb250cmliLmlkLFxuXHRcdFx0XHRUaW1lckNlbGxTdGF0dXNCYXJDb250cmliLmlkLFxuXHRcdFx0XHROb3RlYm9va0ZpbmRDb250cmliLmlkXG5cdFx0XHRdKSxcblx0XHRcdG1lbnVJZHM6IHtcblx0XHRcdFx0bm90ZWJvb2tUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVUb29sYmFyLFxuXHRcdFx0XHRjZWxsVGl0bGVUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsVGl0bGUsXG5cdFx0XHRcdGNlbGxEZWxldGVUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsRGVsZXRlLFxuXHRcdFx0XHRjZWxsSW5zZXJ0VG9vbGJhcjogTWVudUlkLk5vdGVib29rQ2VsbEJldHdlZW4sXG5cdFx0XHRcdGNlbGxUb3BJbnNlcnRUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsTGlzdFRvcCxcblx0XHRcdFx0Y2VsbEV4ZWN1dGVUb29sYmFyOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsRXhlY3V0ZSxcblx0XHRcdFx0Y2VsbEV4ZWN1dGVQcmltYXJ5OiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHRjZWxsRWRpdG9yQ29udHJpYnV0aW9uczogRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFNvbWVFZGl0b3JDb250cmlidXRpb25zKFtcblx0XHRcdFx0U2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQsXG5cdFx0XHRcdENvbnRleHRNZW51Q29udHJvbGxlci5JRCxcblx0XHRcdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0R2x5cGhIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdE1hcmtlckNvbnRyb2xsZXIuSURcblx0XHRcdF0pLFxuXHRcdFx0b3B0aW9uczogdGhpcy5fbm90ZWJvb2tPcHRpb25zLFxuXHRcdFx0Y29kZVdpbmRvdzogdGhpcy53aW5kb3dcblx0XHR9LCB1bmRlZmluZWQsIHRoaXMud2luZG93KTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCB0aGlzLl9pbnB1dEVkaXRvckNvbnRhaW5lciwgdGhpcy5fZWRpdG9yT3B0aW9ucywge1xuXHRcdFx0Li4ue1xuXHRcdFx0XHRpc1NpbXBsZVdpZGdldDogZmFsc2UsXG5cdFx0XHRcdGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbXG5cdFx0XHRcdFx0TWVudVByZXZlbnRlci5JRCxcblx0XHRcdFx0XHRTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCxcblx0XHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFx0U3VnZ2VzdENvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFx0UGFyYW1ldGVySGludHNDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdFNuaXBwZXRDb250cm9sbGVyMi5JRCxcblx0XHRcdFx0XHRUYWJDb21wbGV0aW9uQ29udHJvbGxlci5JRCxcblx0XHRcdFx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdEdseXBoSG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdE1hcmtlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFx0SU5MSU5FX0NIQVRfSUQsXG5cdFx0XHRcdF0pXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi5oZWlnaHQgLSB0aGlzLmlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEubGF5b3V0KG5ldyBET00uRGltZW5zaW9uKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0KSwgdGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIpO1xuXHRcdFx0Y29uc3QgbGVmdE1hcmdpbiA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbigpO1xuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4odGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAvIDIsIHRoaXMuaW5wdXRDZWxsRWRpdG9ySGVpZ2h0KTtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQubGF5b3V0KHRoaXMuX3ZhbGlkYXRlRGltZW5zaW9uKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi53aWR0aCAtIGxlZnRNYXJnaW4gLSBJTlBVVF9DRUxMX0hPUklaT05UQUxfUEFERElOR19SSUdIVCwgbWF4SGVpZ2h0KSk7XG5cdFx0XHR0aGlzLl9pbnB1dEZvY3VzSW5kaWNhdG9yLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuaW5wdXRDZWxsRWRpdG9ySGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS50b3AgPSBgJHt0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24uaGVpZ2h0IC0gdGhpcy5pbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLndpZHRofXB4YDtcblx0XHR9XG5cblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdGlmICh0aGlzLl9ydW5idXR0b25Ub29sYmFyKSB7XG5cdFx0XHR0aGlzLl9ydW5idXR0b25Ub29sYmFyLmNvbnRleHQgPSBpbnB1dC5yZXNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIEludGVyYWN0aXZlIFdpbmRvdyBtb2RlbCBjb3VsZCBub3QgYmUgcmVzb2x2ZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2V0UGFyZW50Q29udGV4dEtleVNlcnZpY2UodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gb3B0aW9ucz8udmlld1N0YXRlID8/IHRoaXMuX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dCk7XG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRhd2FpdCB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuc2V0TW9kZWwobW9kZWwubm90ZWJvb2ssIHZpZXdTdGF0ZT8ubm90ZWJvb2spO1xuXHRcdG1vZGVsLm5vdGVib29rLnNldENlbGxDb2xsYXBzZURlZmF1bHQodGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxDb2xsYXBzZURlZmF1bHQoKSk7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLnNldE9wdGlvbnMoe1xuXHRcdFx0aXNSZWFkT25seTogdHJ1ZVxuXHRcdH0pO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLm9uRGlkUmVzaXplT3V0cHV0KChjdm0pID0+IHtcblx0XHRcdHRoaXMuX3Njcm9sbElmTmVjZXNzYXJ5KGN2bSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLm9uRGlkRm9jdXNXaWRnZXQoKCkgPT4gdGhpcy5fb25EaWRGb2N1c1dpZGdldC5maXJlKCkpKTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rT3B0aW9ucy5vbkRpZENoYW5nZU9wdGlvbnMoZSA9PiB7XG5cdFx0XHRpZiAoZS5jb21wYWN0VmlldyB8fCBlLmZvY3VzSW5kaWNhdG9yKSB7XG5cdFx0XHRcdC8vIHVwZGF0ZSB0aGUgc3R5bGluZ1xuXHRcdFx0XHR0aGlzLl9zdHlsZUVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVMYXlvdXRTdHlsZXMoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zICYmIHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLCB0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5wb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMpIHtcblx0XHRcdFx0bW9kZWwubm90ZWJvb2suc2V0Q2VsbENvbGxhcHNlRGVmYXVsdCh0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbENvbGxhcHNlRGVmYXVsdCgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LmFjdGl2ZUtlcm5lbD8uc3VwcG9ydGVkTGFuZ3VhZ2VzWzBdID8/IGlucHV0Lmxhbmd1YWdlID8/IFBMQUlOVEVYVF9MQU5HVUFHRV9JRDtcblx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IGF3YWl0IGlucHV0LnJlc29sdmVJbnB1dChsYW5ndWFnZUlkKTtcblx0XHRlZGl0b3JNb2RlbC5zZXRMYW5ndWFnZShsYW5ndWFnZUlkKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LnNldE1vZGVsKGVkaXRvck1vZGVsKTtcblx0XHRpZiAodmlld1N0YXRlPy5pbnB1dCkge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5yZXN0b3JlVmlld1N0YXRlKHZpZXdTdGF0ZS5pbnB1dCk7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRvck9wdGlvbnMgPSB0aGlzLl9jb21wdXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQudXBkYXRlT3B0aW9ucyh0aGlzLl9lZGl0b3JPcHRpb25zKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuX29uRGlkRm9jdXNXaWRnZXQuZmlyZSgpKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoIWUuY29udGVudEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0V2lkZ2V0cyh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24sIHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLnBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyByZWFzb246IHRoaXMuX3RvRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbihlKSB9KSkpO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgcmVhc29uOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkVESVQgfSkpKTtcblxuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VOb3RlYm9va0FmZmluaXR5KHRoaXMuX3N5bmNXaXRoS2VybmVsLCB0aGlzKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VTZWxlY3RlZE5vdGVib29rcyh0aGlzLl9zeW5jV2l0aEtlcm5lbCwgdGhpcykpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZXBsRWRpdG9yU2V0dGluZ3Muc2hvd0V4ZWN1dGlvbkhpbnQpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGN1cnNvckF0Qm91bmRhcnlDb250ZXh0ID0gSU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKGlucHV0LnJlc291cmNlICYmIGlucHV0Lmhpc3RvcnlTZXJ2aWNlLmhhcyhpbnB1dC5yZXNvdXJjZSkpIHtcblx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgndG9wJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnbm9uZScpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCh7IHBvc2l0aW9uIH0pID0+IHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuX2dldFZpZXdNb2RlbCgpITtcblx0XHRcdGNvbnN0IGxhc3RMaW5lTnVtYmVyID0gdmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbGFzdExpbmVDb2wgPSB2aWV3TW9kZWwuZ2V0TGluZUxlbmd0aChsYXN0TGluZU51bWJlcikgKyAxO1xuXHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0Y29uc3QgZmlyc3RMaW5lID0gdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIgPT09IDEgJiYgdmlld1Bvc2l0aW9uLmNvbHVtbiA9PT0gMTtcblx0XHRcdGNvbnN0IGxhc3RMaW5lID0gdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIgPT09IGxhc3RMaW5lTnVtYmVyICYmIHZpZXdQb3NpdGlvbi5jb2x1bW4gPT09IGxhc3RMaW5lQ29sO1xuXG5cdFx0XHRpZiAoZmlyc3RMaW5lKSB7XG5cdFx0XHRcdGlmIChsYXN0TGluZSkge1xuXHRcdFx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnYm90aCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgndG9wJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChsYXN0TGluZSkge1xuXHRcdFx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnYm90dG9tJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCdub25lJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKGVkaXRvck1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGVkaXRvck1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRpZiAodGhpcy5pbnB1dD8ucmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSAodGhpcy5pbnB1dCBhcyBJbnRlcmFjdGl2ZUVkaXRvcklucHV0KS5oaXN0b3J5U2VydmljZTtcblx0XHRcdFx0aWYgKCFoaXN0b3J5U2VydmljZS5tYXRjaGVzQ3VycmVudCh0aGlzLmlucHV0LnJlc291cmNlLCB2YWx1ZSkpIHtcblx0XHRcdFx0XHRoaXN0b3J5U2VydmljZS5yZXBsYWNlTGFzdCh0aGlzLmlucHV0LnJlc291cmNlLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVNjcm9sbC5maXJlKCkpKTtcblxuXHRcdHRoaXMuX3N5bmNXaXRoS2VybmVsKCk7XG5cblx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF90b0VkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24oZTogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50KTogRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbiB7XG5cdFx0c3dpdGNoIChlLnNvdXJjZSkge1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLlBST0dSQU1NQVRJQzogcmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uUFJPR1JBTU1BVElDO1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLk5BVklHQVRJT046IHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLk5BVklHQVRJT047XG5cdFx0XHRjYXNlIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UuSlVNUDogcmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uSlVNUDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLlVTRVI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2VsbEF0Qm90dG9tKGNlbGw6IElDZWxsVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy52aXNpYmxlUmFuZ2VzIHx8IFtdO1xuXHRcdGNvbnN0IGNlbGxJbmRleCA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdFx0aWYgKGNlbGxJbmRleCA9PT0gTWF0aC5tYXgoLi4udmlzaWJsZVJhbmdlcy5tYXAocmFuZ2UgPT4gcmFuZ2UuZW5kIC0gMSkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Nyb2xsSWZOZWNlc3NhcnkoY3ZtOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLmdldENlbGxJbmRleChjdm0pO1xuXHRcdGlmIChpbmRleCA9PT0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLmdldExlbmd0aCgpIC0gMSkge1xuXHRcdFx0Ly8gSWYgd2UncmUgYWxyZWFkeSBhdCB0aGUgYm90dG9tIG9yIGF1dG8gc2Nyb2xsIGlzIGVuYWJsZWQsIHNjcm9sbCB0byB0aGUgYm90dG9tXG5cdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVwbEVkaXRvclNldHRpbmdzLmludGVyYWN0aXZlV2luZG93QWx3YXlzU2Nyb2xsT25OZXdDZWxsKSB8fCB0aGlzLl9jZWxsQXRCb3R0b20oY3ZtKSkge1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuc2Nyb2xsVG9Cb3R0b20oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jV2l0aEtlcm5lbCgpIHtcblx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy50ZXh0TW9kZWw7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5nZXRNb2RlbCgpO1xuXG5cdFx0aWYgKG5vdGVib29rICYmIHRleHRNb2RlbCkge1xuXHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0XHRjb25zdCBzZWxlY3RlZE9yU3VnZ2VzdGVkID0gaW5mby5zZWxlY3RlZFxuXHRcdFx0XHQ/PyAoaW5mby5zdWdnZXN0aW9ucy5sZW5ndGggPT09IDEgPyBpbmZvLnN1Z2dlc3Rpb25zWzBdIDogdW5kZWZpbmVkKVxuXHRcdFx0XHQ/PyAoaW5mby5hbGwubGVuZ3RoID09PSAxID8gaW5mby5hbGxbMF0gOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRpZiAoc2VsZWN0ZWRPclN1Z2dlc3RlZCkge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZSA9IHNlbGVjdGVkT3JTdWdnZXN0ZWQuc3VwcG9ydGVkTGFuZ3VhZ2VzWzBdO1xuXHRcdFx0XHQvLyBBbGwga2VybmVscyB3aWxsIGluaXRpYWxseSBsaXN0IHBsYWludGV4dCBhcyB0aGUgc3VwcG9ydGVkIGxhbmd1YWdlIGJlZm9yZSB0aGV5IHByb3Blcmx5IGluaXRpYWxpemVkLlxuXHRcdFx0XHRpZiAobGFuZ3VhZ2UgJiYgbGFuZ3VhZ2UgIT09ICdwbGFpbnRleHQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3TW9kZSA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGxhbmd1YWdlKS5sYW5ndWFnZUlkO1xuXHRcdFx0XHRcdHRleHRNb2RlbC5zZXRMYW5ndWFnZShuZXdNb2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdE5PVEVCT09LX0tFUk5FTC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpLnNldChzZWxlY3RlZE9yU3VnZ2VzdGVkLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uLCBwb3NpdGlvbjogRE9NLklEb21Qb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ21pZC13aWR0aCcsIGRpbWVuc2lvbi53aWR0aCA8IDEwMDAgJiYgZGltZW5zaW9uLndpZHRoID49IDYwMCk7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93LXdpZHRoJywgZGltZW5zaW9uLndpZHRoIDwgNjAwKTtcblx0XHRjb25zdCBlZGl0b3JIZWlnaHRDaGFuZ2VkID0gZGltZW5zaW9uLmhlaWdodCAhPT0gdGhpcy5fbGFzdExheW91dERpbWVuc2lvbnM/LmRpbWVuc2lvbi5oZWlnaHQ7XG5cdFx0dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMgPSB7IGRpbWVuc2lvbiwgcG9zaXRpb24gfTtcblxuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9ySGVpZ2h0Q2hhbmdlZCAmJiB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRTdWdnZXN0Q29udHJvbGxlci5nZXQodGhpcy5fY29kZUVkaXRvcldpZGdldCk/LmNhbmNlbFN1Z2dlc3RXaWRnZXQoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24uaGVpZ2h0IC0gdGhpcy5pbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2xheW91dFdpZGdldHMoZGltZW5zaW9uLCBwb3NpdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRXaWRnZXRzKGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiwgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24pIHtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5oYXNNb2RlbCgpID8gdGhpcy5fY29kZUVkaXRvcldpZGdldC5nZXRDb250ZW50SGVpZ2h0KCkgOiB0aGlzLmlucHV0Q2VsbEVkaXRvckhlaWdodDtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1pbihkaW1lbnNpb24uaGVpZ2h0IC8gMiwgY29udGVudEhlaWdodCk7XG5cdFx0Y29uc3QgbGVmdE1hcmdpbiA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbigpO1xuXG5cdFx0Y29uc3QgaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0ID0gbWF4SGVpZ2h0ICsgSU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HICogMjtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0IC0gaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5sYXlvdXQoZGltZW5zaW9uLndpdGgoZGltZW5zaW9uLndpZHRoLCBkaW1lbnNpb24uaGVpZ2h0IC0gaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0KSwgdGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIsIHBvc2l0aW9uKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmxheW91dCh0aGlzLl92YWxpZGF0ZURpbWVuc2lvbihkaW1lbnNpb24ud2lkdGggLSBsZWZ0TWFyZ2luIC0gSU5QVVRfQ0VMTF9IT1JJWk9OVEFMX1BBRERJTkdfUklHSFQsIG1heEhlaWdodCkpO1xuXHRcdHRoaXMuX2lucHV0Rm9jdXNJbmRpY2F0b3Iuc3R5bGUuaGVpZ2h0ID0gYCR7Y29udGVudEhlaWdodH1weGA7XG5cdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLnRvcCA9IGAke2RpbWVuc2lvbi5oZWlnaHQgLSBpbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbi53aWR0aH1weGA7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZURpbWVuc2lvbih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuXHRcdHJldHVybiBuZXcgRE9NLkRpbWVuc2lvbihNYXRoLm1heCgwLCB3aWR0aCksIE1hdGgubWF4KDAsIGhlaWdodCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzQ29uZmxpY3RpbmdEZWNvcmF0aW9uKCkge1xuXHRcdHJldHVybiBCb29sZWFuKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0TGluZURlY29yYXRpb25zKDEpPy5maW5kKChkKSA9PlxuXHRcdFx0ZC5vcHRpb25zLmJlZm9yZUNvbnRlbnRDbGFzc05hbWVcblx0XHRcdHx8IGQub3B0aW9ucy5hZnRlckNvbnRlbnRDbGFzc05hbWVcblx0XHRcdHx8IGQub3B0aW9ucy5iZWZvcmU/LmNvbnRlbnRcblx0XHRcdHx8IGQub3B0aW9ucy5hZnRlcj8uY29udGVudFxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSW5wdXRIaW50KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3VsZEhpZGUgPVxuXHRcdFx0IXRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuaGFzTW9kZWwoKSB8fFxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVwbEVkaXRvclNldHRpbmdzLnNob3dFeGVjdXRpb25IaW50KSA9PT0gZmFsc2UgfHxcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKSEuZ2V0VmFsdWVMZW5ndGgoKSAhPT0gMCB8fFxuXHRcdFx0dGhpcy5faGFzQ29uZmxpY3RpbmdEZWNvcmF0aW9uKCk7XG5cblx0XHRpZiAoIXRoaXMuX2hpbnRFbGVtZW50ICYmICFzaG91bGRIaWRlKSB7XG5cdFx0XHR0aGlzLl9oaW50RWxlbWVudCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0LCB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2hpbnRFbGVtZW50ICYmIHNob3VsZEhpZGUpIHtcblx0XHRcdHRoaXMuX2hpbnRFbGVtZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2hpbnRFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldFNjcm9sbFBvc2l0aW9uKCk6IElFZGl0b3JQYW5lU2Nyb2xsUG9zaXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxUb3A6IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5zY3JvbGxUb3AgPz8gMCxcblx0XHRcdHNjcm9sbExlZnQ6IDBcblx0XHR9O1xuXHR9XG5cblx0c2V0U2Nyb2xsUG9zaXRpb24ocG9zaXRpb246IElFZGl0b3JQYW5lU2Nyb2xsUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2V0U2Nyb2xsVG9wKHBvc2l0aW9uLnNjcm9sbFRvcCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/Lm9uU2hvdygpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzSGlzdG9yeSgpIHtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuZm9jdXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRFZGl0b3JWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5zZXRFZGl0b3JWaXNpYmxlKHZpc2libGUpO1xuXHRcdHRoaXMuX2dyb3VwTGlzdGVuZXIudmFsdWUgPSB0aGlzLmdyb3VwLm9uV2lsbENsb3NlRWRpdG9yKGUgPT4gdGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZShlLmVkaXRvcikpO1xuXG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdFx0aWYgKHRoaXMuaW5wdXQgJiYgdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUpIHtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUub25XaWxsSGlkZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpIHtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUpIHtcblx0XHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUodGhpcy5pbnB1dCk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZS5vbldpbGxIaWRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldD8uZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQgPSB7IHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuY2xlYXIoKTtcblxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldENvbnRyb2woKTogUmVwbEVkaXRvckNvbnRyb2wgJiBJQ29tcG9zaXRlQ29kZUVkaXRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5vdGVib29rRWRpdG9yOiB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSxcblx0XHRcdGFjdGl2ZUNvZGVFZGl0b3I6IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZUVkaXRvcjogRXZlbnQuTm9uZVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixZQUFZLG9CQUFvQjtBQUVoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQix5QkFBeUI7QUFDbkQsU0FBUyww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
