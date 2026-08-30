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
import { localize } from "../../../../../../nls.js";
import * as DOM from "../../../../../../base/browser/dom.js";
import { raceCancellation } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { clamp } from "../../../../../../base/common/numbers.js";
import * as strings from "../../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { EditorOption } from "../../../../../../editor/common/config/editorOptions.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { tokenizeToStringSync } from "../../../../../../editor/common/languages/textToHtmlTokenizer.js";
import { CodeActionController } from "../../../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { outputDisplayLimit } from "../../viewModel/codeCellViewModel.js";
import { collapsedCellTTPolicy } from "../notebookRenderingCommon.js";
import { CellEditorOptions } from "./cellEditorOptions.js";
import { CellOutputContainer } from "./cellOutput.js";
import { CollapsedCodeCellExecutionIcon } from "./codeCellExecutionIcon.js";
import { INotebookLoggingService } from "../../../common/notebookLoggingService.js";
let CodeCell = class extends Disposable {
  constructor(notebookEditor, viewCell, templateData, editorPool, instantiationService, keybindingService, languageService, configurationService, notebookExecutionStateService, notebookLogService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this.editorPool = editorPool;
    this.instantiationService = instantiationService;
    this.keybindingService = keybindingService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this._isDisposed = false;
    this._useNewApproachForEditorLayout = true;
    this._pointerDownInEditor = false;
    this._pointerDraggingInEditor = false;
    const cellIndex = this.notebookEditor.getCellIndex(this.viewCell);
    const debugPrefix = `[Cell ${cellIndex}]`;
    const debug = this._debug = (output) => {
      notebookLogService.debug("CellLayout", `${debugPrefix} ${output}`);
    };
    this._cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
    this._outputContainerRenderer = this.instantiationService.createInstance(CellOutputContainer, notebookEditor, viewCell, templateData, { limit: outputDisplayLimit });
    this.cellParts = this._register(templateData.cellParts.concatContentPart([this._cellEditorOptions, this._outputContainerRenderer], DOM.getWindow(notebookEditor.getDomNode())));
    const initialEditorDimension = { height: this.calculateInitEditorHeight(), width: this.viewCell.layoutInfo.editorWidth };
    this._cellLayout = new CodeCellLayout(this._useNewApproachForEditorLayout, notebookEditor, viewCell, templateData, { debug }, initialEditorDimension);
    this.initializeEditor(initialEditorDimension);
    this._renderedInputCollapseState = false;
    this.registerNotebookEditorListeners();
    this.registerViewCellLayoutChange();
    this.registerCellEditorEventListeners();
    this.registerMouseListener();
    this._register(Event.any(this.viewCell.onDidStartExecution, this.viewCell.onDidStopExecution)((e) => {
      this.cellParts.updateForExecutionState(this.viewCell, e);
    }));
    this._register(this.viewCell.onDidChangeState((e) => {
      this.cellParts.updateState(this.viewCell, e);
      if (e.outputIsHoveredChanged) {
        this.updateForOutputHover();
      }
      if (e.outputIsFocusedChanged) {
        this.updateForOutputFocus();
      }
      if (e.metadataChanged || e.internalMetadataChanged) {
        this.updateEditorOptions();
      }
      if (e.inputCollapsedChanged || e.outputCollapsedChanged) {
        this.viewCell.pauseLayout();
        const updated = this.updateForCollapseState();
        this.viewCell.resumeLayout();
        if (updated) {
          this.relayoutCell();
        }
      }
      if (e.focusModeChanged) {
        this.updateEditorForFocusModeChange(true);
      }
    }));
    this.updateEditorOptions();
    this.updateEditorForFocusModeChange(false);
    this.updateForOutputHover();
    this.updateForOutputFocus();
    this.cellParts.scheduleRenderCell(this.viewCell);
    this._register(toDisposable(() => {
      this.cellParts.unrenderCell(this.viewCell);
    }));
    this.viewCell.editorHeight = initialEditorDimension.height;
    this._outputContainerRenderer.render();
    this._renderedOutputCollapseState = false;
    this.initialViewUpdateExpanded();
    this._register(this.viewCell.onLayoutInfoRead(() => {
      this.cellParts.prepareLayout();
    }));
    const executionItemElement = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$(".collapsed-execution-icon"));
    this._register(toDisposable(() => {
      executionItemElement.remove();
    }));
    this._collapsedExecutionIcon = this._register(this.instantiationService.createInstance(CollapsedCodeCellExecutionIcon, this.notebookEditor, this.viewCell, executionItemElement));
    this.updateForCollapseState();
    this._register(Event.runAndSubscribe(viewCell.onDidChangeOutputs, this.updateForOutputs.bind(this)));
    this._register(Event.runAndSubscribe(viewCell.onDidChangeLayout, this.updateForLayout.bind(this)));
    this._cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
    templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
  }
  updateCodeCellOptions(templateData) {
    templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
    const cts = new CancellationTokenSource();
    this._register({ dispose() {
      cts.dispose(true);
    } });
    raceCancellation(this.viewCell.resolveTextModel(), cts.token).then((model) => {
      if (this._isDisposed) {
        return;
      }
      if (model) {
        model.updateOptions({
          indentSize: this._cellEditorOptions.indentSize,
          tabSize: this._cellEditorOptions.tabSize,
          insertSpaces: this._cellEditorOptions.insertSpaces
        });
      }
    });
  }
  updateForLayout() {
    this._pendingLayout?.dispose();
    this._pendingLayout = DOM.modify(DOM.getWindow(this.notebookEditor.getDomNode()), () => {
      this.cellParts.updateInternalLayoutNow(this.viewCell);
    });
  }
  updateForOutputHover() {
    this.templateData.container.classList.toggle("cell-output-hover", this.viewCell.outputIsHovered);
  }
  updateForOutputFocus() {
    this.templateData.container.classList.toggle("cell-output-focus", this.viewCell.outputIsFocused);
  }
  calculateInitEditorHeight() {
    const lineNum = this.viewCell.lineCount;
    const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
    const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
    const editorHeight = this.viewCell.layoutInfo.editorHeight === 0 ? lineNum * lineHeight + editorPadding.top + editorPadding.bottom : this.viewCell.layoutInfo.editorHeight;
    return editorHeight;
  }
  initializeEditor(dimension) {
    this._debug(`Initialize Editor ${dimension.height} x ${dimension.width}, Scroll Top = ${this.notebookEditor.scrollTop}`);
    this._cellLayout.layoutEditor("init");
    this.layoutEditor(dimension);
    const cts = new CancellationTokenSource();
    this._register({ dispose() {
      cts.dispose(true);
    } });
    raceCancellation(this.viewCell.resolveTextModel(), cts.token).then((model) => {
      if (this._isDisposed || model?.isDisposed()) {
        return;
      }
      if (model && this.templateData.editor) {
        this._reigsterModelListeners(model);
        this.templateData.editor.setModel(model);
        if (this._isDisposed) {
          return;
        }
        model.updateOptions({
          indentSize: this._cellEditorOptions.indentSize,
          tabSize: this._cellEditorOptions.tabSize,
          insertSpaces: this._cellEditorOptions.insertSpaces
        });
        this.viewCell.attachTextEditor(this.templateData.editor, this.viewCell.layoutInfo.estimatedHasHorizontalScrolling);
        const focusEditorIfNeeded = () => {
          if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
            this.templateData.editor.focus();
          }
        };
        focusEditorIfNeeded();
        const realContentHeight = this.templateData.editor.getContentHeight();
        if (realContentHeight !== dimension.height) {
          this.onCellEditorHeightChange("onDidResolveTextModel");
        }
        if (this._isDisposed) {
          return;
        }
        focusEditorIfNeeded();
      }
      this._register(this._cellEditorOptions.onDidChange(() => this.updateCodeCellOptions(this.templateData)));
    });
  }
  updateForOutputs() {
    DOM.setVisibility(this.viewCell.outputsViewModels.length > 0, this.templateData.focusSinkElement);
  }
  updateEditorOptions() {
    const editor = this.templateData.editor;
    if (!editor) {
      return;
    }
    const isReadonly = this.notebookEditor.isReadOnly;
    const padding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
    const options = editor.getOptions();
    if (options.get(EditorOption.readOnly) !== isReadonly || options.get(EditorOption.padding) !== padding) {
      editor.updateOptions({
        readOnly: this.notebookEditor.isReadOnly,
        padding: this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri)
      });
    }
  }
  registerNotebookEditorListeners() {
    this._register(this.notebookEditor.onDidScroll(() => {
      this.adjustEditorPosition();
      this._cellLayout.layoutEditor("nbDidScroll");
    }));
    this._register(this.notebookEditor.onDidChangeLayout(() => {
      this.adjustEditorPosition();
      this.onCellWidthChange("nbLayoutChange");
    }));
  }
  adjustEditorPosition() {
    if (this._useNewApproachForEditorLayout) {
      return;
    }
    const extraOffset = -6 - 1;
    const min = 0;
    const scrollTop = this.notebookEditor.scrollTop;
    const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
    const diff = scrollTop - elementTop + extraOffset;
    const notebookEditorLayout = this.notebookEditor.getLayoutInfo();
    const editorMaxHeight = notebookEditorLayout.height - notebookEditorLayout.stickyHeight - 26;
    const maxTop = this.viewCell.layoutInfo.editorHeight - editorMaxHeight;
    const top = maxTop > 20 ? clamp(min, diff, maxTop) : min;
    this.templateData.editorPart.style.top = `${top}px`;
    this.templateData.editor.setScrollTop(top);
  }
  registerViewCellLayoutChange() {
    this._register(this.viewCell.onDidChangeLayout((e) => {
      if (e.outerWidth !== void 0) {
        const layoutInfo = this.templateData.editor.getLayoutInfo();
        if (layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
          this.onCellWidthChange("viewCellLayoutChange");
          this.adjustEditorPosition();
        }
      }
    }));
  }
  registerCellEditorEventListeners() {
    this._register(this.templateData.editor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        if (this.viewCell.layoutInfo.editorHeight !== e.contentHeight) {
          this.onCellEditorHeightChange(`onDidContentSizeChange`);
          this.adjustEditorPosition();
        }
      }
    }));
    if (this._useNewApproachForEditorLayout) {
      this._register(this.templateData.editor.onDidScrollChange((e) => {
        if (this._pointerDownInEditor || this._pointerDraggingInEditor) {
          return;
        }
        if (this._cellLayout.editorVisibility === "Invisible" || !this.templateData.editor.hasTextFocus()) {
          return;
        }
        if (this._cellLayout._lastChangedEditorScrolltop === e.scrollTop || this._cellLayout.isUpdatingLayout) {
          return;
        }
        const scrollTop = this.notebookEditor.scrollTop;
        const diff = e.scrollTop - (this._cellLayout._lastChangedEditorScrolltop ?? 0);
        if (this._cellLayout.editorVisibility === "Full (Small Viewport)" && typeof this._cellLayout._lastChangedEditorScrolltop === "number") {
          this._debug(`Scroll Change (1) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setEditorScrollTop: ${e.scrollTop})`);
        } else if (this._cellLayout.editorVisibility === "Bottom Clipped" && typeof this._cellLayout._lastChangedEditorScrolltop === "number") {
          this._debug(`Scroll Change (2) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setNotebookScrollTop: ${scrollTop + e.scrollTop})`);
          this.notebookEditor.setScrollTop(scrollTop + e.scrollTop);
        } else if (this._cellLayout.editorVisibility === "Top Clipped" && typeof this._cellLayout._lastChangedEditorScrolltop === "number") {
          const newScrollTop = scrollTop + diff - 1;
          this._debug(`Scroll Change (3) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setNotebookScrollTop?: ${newScrollTop})`);
          if (scrollTop !== newScrollTop) {
            this.notebookEditor.setScrollTop(newScrollTop);
          }
        } else {
          this._debug(`Scroll Change (4) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop})`);
          this._cellLayout._lastChangedEditorScrolltop = void 0;
        }
      }));
    }
    this._register(this.templateData.editor.onDidChangeCursorSelection((e) => {
      if (
        // do not reveal the cell into view if this selection change was caused by restoring editors
        e.source === "restoreState" || e.oldModelVersionId === 0 || !this.templateData.editor.hasTextFocus()
      ) {
        return;
      }
      if ((this._pointerDownInEditor || this._pointerDraggingInEditor) && this._useNewApproachForEditorLayout) {
        return;
      }
      const selections = this.templateData.editor.getSelections();
      if (selections?.length) {
        const contentHeight = this.templateData.editor.getContentHeight();
        const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;
        if (contentHeight !== layoutContentHeight) {
          if (!this._useNewApproachForEditorLayout) {
            this._debug(`onDidChangeCursorSelection`);
            this.onCellEditorHeightChange("onDidChangeCursorSelection");
          }
          if (this._isDisposed) {
            return;
          }
        }
        const lastSelection = selections[selections.length - 1];
        this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
      }
    }));
    this._register(this.templateData.editor.onDidBlurEditorWidget(() => {
      CodeActionController.get(this.templateData.editor)?.hideLightBulbWidget();
    }));
  }
  _reigsterModelListeners(model) {
    this._register(model.onDidChangeTokens(() => {
      if (this.viewCell.isInputCollapsed && this._inputCollapseElement) {
        const content = this._getRichTextFromLineTokens(model);
        this._inputCollapseElement.innerHTML = collapsedCellTTPolicy?.createHTML(content) ?? content;
        this._attachInputExpandButton(this._inputCollapseElement);
      }
    }));
  }
  registerMouseListener() {
    const resetPointerState = () => {
      this._pointerDownInEditor = false;
      this._pointerDraggingInEditor = false;
      this._cellLayout.setPointerDown(false);
    };
    this._register(this.templateData.editor.onMouseDown((e) => {
      if (e.event.rightButton) {
        e.event.preventDefault();
      }
      if (this._useNewApproachForEditorLayout) {
        if (e.event.leftButton) {
          this._pointerDownInEditor = true;
          this._pointerDraggingInEditor = false;
          this._cellLayout.setPointerDown(false);
        }
      }
    }));
    if (this._useNewApproachForEditorLayout) {
      this._register(this.templateData.editor.onMouseMove((e) => {
        if (!this._pointerDownInEditor) {
          return;
        }
        if (!e.event.leftButton) {
          resetPointerState();
          return;
        }
        if (!this._pointerDraggingInEditor) {
          this._pointerDraggingInEditor = true;
          this._cellLayout.setPointerDown(true);
        }
      }));
    }
    if (this._useNewApproachForEditorLayout) {
      const win = DOM.getWindow(this.notebookEditor.getDomNode());
      this._register(DOM.addDisposableListener(win, "mouseup", resetPointerState));
      this._register(DOM.addDisposableListener(win, "pointerup", resetPointerState));
      this._register(DOM.addDisposableListener(win, "pointercancel", resetPointerState));
      this._register(DOM.addDisposableListener(win, "blur", resetPointerState));
      this._register(DOM.addDisposableListener(win, "keydown", (e) => {
        if (e.key === "Escape" && (this._pointerDownInEditor || this._pointerDraggingInEditor)) {
          resetPointerState();
        }
      }));
    }
  }
  shouldPreserveEditor() {
    return this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body);
  }
  updateEditorForFocusModeChange(sync) {
    if (this.shouldPreserveEditor()) {
      if (sync) {
        this.templateData.editor.focus();
      } else {
        this._register(DOM.runAtThisOrScheduleAtNextAnimationFrame(DOM.getWindow(this.templateData.container), () => {
          this.templateData.editor.focus();
        }));
      }
    }
    this.templateData.container.classList.toggle("cell-editor-focus", this.viewCell.focusMode === CellFocusMode.Editor);
    this.templateData.container.classList.toggle("cell-output-focus", this.viewCell.focusMode === CellFocusMode.Output);
  }
  updateForCollapseState() {
    if (this.viewCell.isOutputCollapsed === this._renderedOutputCollapseState && this.viewCell.isInputCollapsed === this._renderedInputCollapseState) {
      return false;
    }
    this.viewCell.layoutChange({ editorHeight: true });
    if (this.viewCell.isInputCollapsed) {
      this._collapseInput();
    } else {
      this._showInput();
    }
    if (this.viewCell.isOutputCollapsed) {
      this._collapseOutput();
    } else {
      this._showOutput(false);
    }
    this.relayoutCell();
    this._renderedOutputCollapseState = this.viewCell.isOutputCollapsed;
    this._renderedInputCollapseState = this.viewCell.isInputCollapsed;
    return true;
  }
  _collapseInput() {
    DOM.hide(this.templateData.editorPart);
    this.templateData.container.classList.toggle("input-collapsed", true);
    this._removeInputCollapsePreview();
    this._collapsedExecutionIcon.setVisibility(true);
    const richEditorText = this.templateData.editor.hasModel() ? this._getRichTextFromLineTokens(this.templateData.editor.getModel()) : this._getRichText(this.viewCell.textBuffer, this.viewCell.language);
    const element = DOM.$("div.cell-collapse-preview");
    element.innerHTML = collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText;
    this._inputCollapseElement = element;
    this.templateData.cellInputCollapsedContainer.appendChild(element);
    this._attachInputExpandButton(element);
    DOM.show(this.templateData.cellInputCollapsedContainer);
  }
  _attachInputExpandButton(element) {
    const expandIcon = DOM.$("span.expandInputIcon");
    const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
    if (keybinding) {
      element.title = localize("cellExpandInputButtonLabelWithDoubleClick", "Double-click to expand cell input ({0})", keybinding.getLabel());
      expandIcon.title = localize("cellExpandInputButtonLabel", "Expand Cell Input ({0})", keybinding.getLabel());
    }
    expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
    element.appendChild(expandIcon);
  }
  _showInput() {
    this._collapsedExecutionIcon.setVisibility(false);
    DOM.show(this.templateData.editorPart);
    DOM.hide(this.templateData.cellInputCollapsedContainer);
  }
  _getRichText(buffer, language) {
    return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
  }
  _getRichTextFromLineTokens(model) {
    let result = `<div class="monaco-tokenized-source">`;
    const firstLineTokens = model.tokenization.getLineTokens(1);
    const viewLineTokens = firstLineTokens.inflate();
    const line = model.getLineContent(1);
    let startOffset = 0;
    for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
      const type = viewLineTokens.getClassName(j);
      const endIndex = viewLineTokens.getEndOffset(j);
      result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
      startOffset = endIndex;
    }
    result += `</div>`;
    return result;
  }
  _removeInputCollapsePreview() {
    const children = this.templateData.cellInputCollapsedContainer.children;
    const elements = [];
    for (let i = 0; i < children.length; i++) {
      if (children[i].classList.contains("cell-collapse-preview")) {
        elements.push(children[i]);
      }
    }
    elements.forEach((element) => {
      element.remove();
    });
  }
  _updateOutputInnerContainer(hide) {
    const children = this.templateData.outputContainer.domNode.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].classList.contains("output-inner-container")) {
        DOM.setVisibility(!hide, children[i]);
      }
    }
  }
  _collapseOutput() {
    this.templateData.container.classList.toggle("output-collapsed", true);
    DOM.show(this.templateData.cellOutputCollapsedContainer);
    this._updateOutputInnerContainer(true);
    this._outputContainerRenderer.viewUpdateHideOuputs();
  }
  _showOutput(initRendering) {
    this.templateData.container.classList.toggle("output-collapsed", false);
    DOM.hide(this.templateData.cellOutputCollapsedContainer);
    this._updateOutputInnerContainer(false);
    this._outputContainerRenderer.viewUpdateShowOutputs(initRendering);
  }
  initialViewUpdateExpanded() {
    this.templateData.container.classList.toggle("input-collapsed", false);
    DOM.show(this.templateData.editorPart);
    DOM.hide(this.templateData.cellInputCollapsedContainer);
    this.templateData.container.classList.toggle("output-collapsed", false);
    this._showOutput(true);
  }
  layoutEditor(dimension) {
    if (this._useNewApproachForEditorLayout) {
      return;
    }
    const editorLayout = this.notebookEditor.getLayoutInfo();
    const maxHeight = Math.min(
      editorLayout.height - editorLayout.stickyHeight - 26,
      dimension.height
    );
    this._debug(`Layout Editor: Width = ${dimension.width}, Height = ${maxHeight} (Requested: ${dimension.height}, Editor Layout Height: ${editorLayout.height}, Sticky: ${editorLayout.stickyHeight})`);
    this.templateData.editor.layout({
      width: dimension.width,
      height: maxHeight
    }, true);
  }
  onCellWidthChange(dbgReasonForChange) {
    this._debug(`Cell Editor Width Change, ${dbgReasonForChange}, Content Height = ${this.templateData.editor.getContentHeight()}`);
    const height = this.templateData.editor.getContentHeight();
    if (this.templateData.editor.hasModel()) {
      this._debug(`**** Updating Cell Editor Height (1), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height} ****`);
      this.viewCell.editorHeight = height;
      this.relayoutCell();
      this.layoutEditor(
        {
          width: this.viewCell.layoutInfo.editorWidth,
          height
        }
      );
    } else {
      this._debug(`Cell Editor Width Change without model, return (1), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height}`);
    }
    this._cellLayout.layoutEditor(dbgReasonForChange);
  }
  onCellEditorHeightChange(dbgReasonForChange) {
    const height = this.templateData.editor.getContentHeight();
    if (!this.templateData.editor.hasModel()) {
      this._debug(`Cell Editor Height Change without model, return (2), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo()}`);
    }
    this._debug(`Cell Editor Height Change (${dbgReasonForChange}): ${height}`);
    this._debug(`**** Updating Cell Editor Height (2), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height} ****`);
    const viewLayout = this.templateData.editor.getLayoutInfo();
    this.viewCell.editorHeight = height;
    this.relayoutCell();
    this.layoutEditor(
      {
        width: viewLayout.width,
        height
      }
    );
    this._cellLayout.layoutEditor(dbgReasonForChange);
  }
  relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
  }
  dispose() {
    this._isDisposed = true;
    if (this.shouldPreserveEditor()) {
      this.editorPool.preserveFocusedEditor(this.viewCell);
    }
    this.viewCell.detachTextEditor();
    this._removeInputCollapsePreview();
    this._outputContainerRenderer.dispose();
    this._pendingLayout?.dispose();
    super.dispose();
  }
};
CodeCell = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, INotebookExecutionStateService),
  __decorateParam(9, INotebookLoggingService)
], CodeCell);
class CodeCellLayout {
  constructor(_enabled, notebookEditor, viewCell, templateData, _logService, _initialEditorDimension) {
    this._enabled = _enabled;
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this._logService = _logService;
    this._initialEditorDimension = _initialEditorDimension;
    this._initialized = false;
    this._pointerDown = false;
  }
  get editorVisibility() {
    return this._editorVisibility;
  }
  get isUpdatingLayout() {
    return this._isUpdatingLayout;
  }
  setPointerDown(isDown) {
    this._pointerDown = isDown;
  }
  /**
   * Dynamically lays out the code cell's Monaco editor to simulate a "sticky" run/exec area while
   * constraining the visible editor height to the notebook viewport. It adjusts two things:
   *  - The absolute `top` offset of the editor part inside the cell (so the run / execution order
   *    area remains visible for a limited vertical travel band ~45px).
   *  - The editor's layout height plus the editor's internal scroll position (`editorScrollTop`) to
   *    crop content when the cell is partially visible (top or bottom clipped) or when content is
   *    taller than the viewport.
   *
   * Additional invariants:
   *  - Content height stability: once the layout has been initialized, scroll-driven re-layouts can
   *    observe transient Monaco content heights that reflect the current clipped layout (rather than
   *    the full input height). To keep the notebook list layout stable (avoiding overlapping cells
   *    while navigating/scrolling), we store the actual content height in `_establishedContentHeight`
   *    and reuse it for scroll-driven relayouts. This prevents the editor from shrinking back to its
   *    initial height after content has been added (e.g., pasting text) or when Monaco reports a
   *    transient smaller content height while the cell is clipped.
   *
   *    We refresh `_establishedContentHeight` when the editor's content size changes
   *    (`onDidContentSizeChange`) and also when width/layout changes can affect wrapping-driven height
   *    (`viewCellLayoutChange`/`nbLayoutChange`).
   *  - Pointer-drag gating: while the user is holding the mouse button down in the editor (drag
   *    selection or potential drag selection), we avoid programmatic `editor.setScrollTop(...)` updates
   *    to prevent selection/scroll feedback loops and "stuck selection" behavior.
   *
   * ---------------------------------------------------------------------------
   * SECTION 1. OVERALL NOTEBOOK VIEW (EACH CELL HAS AN 18px GAP ABOVE IT)
   * Legend:
   *   GAP (between cells & before first cell) ............. 18px
   *   CELL PADDING (top & bottom inside cell) ............. 6px
   *   STATUS BAR HEIGHT (typical) ......................... 22px
   *   LINE HEIGHT (logic clamp) ........................... 21px
   *   BORDER/OUTLINE HEIGHT (visual conceal adjustment) ... 1px
   *   EDITOR_HEIGHT (example visible editor) .............. 200px (capped by viewport)
   *   EDITOR_CONTENT_HEIGHT (example full content) ........ 380px (e.g. 50 lines)
   *   extraOffset = -(CELL_PADDING + BORDER_HEIGHT) ....... -7
   *
   *   (The list ensures the editor's laid out height never exceeds viewport height.)
   *
   *   ┌────────────────────────────── Notebook Viewport (scrolling container) ────────────────────────────┐
   *   │ (scrollTop)                                                                                       │
   *   │                                                                                                   │
   *   │  18px GAP (top spacing before first cell)                                                         │
   *   │  ▼                                                                                                │
   *   │  ┌──────── Cell A Outer Container ────────────────────────────────────────────────────────────┐   │
   *   │  │ ▲ 6px top padding                                                                          │   │
   *   │  │ │                                                                                          │   │
   *   │  │ │  ┌─ Execution Order / Run Column (~45px vertical travel band)─┐  ┌─ Editor Part ───────┐ │   │
   *   │  │ │  │ (Run button, execution # label)                            │  │ Visible Lines ...   │ │   │
   *   │  │ │  │                                                            │  │                     │ │   │
   *   │  │ │  │                                                            │  │ EDITOR_HEIGHT=200px │ │   │
   *   │  │ │  │                                                            │  │ (Content=380px)     │ │   │
   *   │  │ │  └────────────────────────────────────────────────────────────┘  └─────────────────────┘ │   │
   *   │  │ │                                                                                          │   │
   *   │  │ │  ┌─ Status Bar (22px) ─────────────────────────────────────────────────────────────────┐ │   │
   *   │  │ │  │ language | indent | selection info | kernel/status bits ...                         │ │   │
   *   │  │ │  └─────────────────────────────────────────────────────────────────────────────────────┘ │   │
   *   │  │ │                                                                                          │   │
   *   │  │ ▼ 6px bottom padding                                                                       │   │
   *   │  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
   *   │  18px GAP                                                                                         │
   *   │  ┌──────── Cell B Outer Container ────────────────────────────────────────────────────────────┐   │
   *   │  │ (same structure as Cell A)                                                                 │   │
   *   │  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
   *   │                                                                                                   │
   *   │ (scrollBottom)                                                                                    │
   *   └───────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * SECTION 2. SINGLE CELL STRUCTURE (VERTICAL LAYERS)
   *
   *   Inter-Cell GAP (18px)
   *   ┌─────────────────────────────── Cell Wrapper (<li>) ──────────────────────────────┐
   *   │ ┌──────────────────────────── .cell-inner-container ───────────────────────────┐ │
   *   │ │ 6px top padding                                                              │ │
   *   │ │                                                                              │ │
   *   │ │ ┌─ Left Gutter (Run / Exec / Focus Border) ─┬──────── Editor Part ─────────┐ │ │
   *   │ │ │  Sticky vertical travel (~45px allowance) │  (Monaco surface)            │ │ │
   *   │ │ │                                         │  Visible height 200px          │ │ │
   *   │ │ │                                         │  Content height 380px          │ │ │
   *   │ │ └─────────────────────────────────────────┴────────────────────────────────┘ │ │
   *   │ │                                                                              │ │
   *   │ │ ┌─ Status Bar (22px) ──────────────────────────────────────────────────────┐ │ │
   *   │ │ │ language | indent | selection | kernel | state                           │ │ │
   *   │ │ └──────────────────────────────────────────────────────────────────────────┘ │ │
   *   │ │ 6px bottom padding                                                           │ │
   *   │ └──────────────────────────────────────────────────────────────────────────────┘ │
   *   │ (Outputs region begins at outputContainerOffset below input area)                │
   *   └──────────────────────────────────────────────────────────────────────────────────┘
   */
  layoutEditor(reason) {
    if (!this._enabled) {
      return;
    }
    const element = this.templateData.editorPart;
    if (this.viewCell.isInputCollapsed) {
      element.style.top = "";
      return;
    }
    const LINE_HEIGHT = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight;
    const CELL_TOP_MARGIN = this.viewCell.layoutInfo.topMargin;
    const CELL_OUTLINE_WIDTH = this.viewCell.layoutInfo.outlineWidth;
    const STATUSBAR_HEIGHT = this.viewCell.layoutInfo.statusBarHeight;
    const editor = this.templateData.editor;
    const editorLayout = this.templateData.editor.getLayoutInfo();
    const editorWidth = this._initialized && (reason === "nbLayoutChange" || reason === "viewCellLayoutChange") ? this.viewCell.layoutInfo.editorWidth : editorLayout.width;
    const editorHeight = this.viewCell.layoutInfo.editorHeight;
    const scrollTop = this.notebookEditor.scrollTop;
    const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
    const elementBottom = this.notebookEditor.getAbsoluteBottomOfElement(this.viewCell);
    const elementHeight = this.notebookEditor.getHeightOfElement(this.viewCell);
    let editorContentHeight;
    const isInit = !this._initialized && reason === "init";
    if (isInit) {
      editorContentHeight = this._initialEditorDimension.height;
      this._establishedContentHeight = editorContentHeight;
    } else {
      const gotContentHeight = editor.getContentHeight();
      const fallbackEditorContentHeight = gotContentHeight === -1 ? Math.max(editor.getLayoutInfo().height, this._initialEditorDimension.height) : gotContentHeight;
      const shouldRefreshContentHeight = !this._initialized || reason === "onDidContentSizeChange" || reason === "viewCellLayoutChange" || reason === "nbLayoutChange";
      if (shouldRefreshContentHeight) {
        editorContentHeight = fallbackEditorContentHeight;
        this._establishedContentHeight = editorContentHeight;
      } else {
        editorContentHeight = this._establishedContentHeight ?? fallbackEditorContentHeight;
      }
    }
    const editorBottom = elementTop + this.viewCell.layoutInfo.outputContainerOffset;
    const scrollBottom = this.notebookEditor.scrollBottom;
    const viewportHeight = scrollBottom - scrollTop === 0 ? this.notebookEditor.getLayoutInfo().height : scrollBottom - scrollTop;
    const outputContainerOffset = this.viewCell.layoutInfo.outputContainerOffset;
    const scrollDirection = typeof this._previousScrollBottom === "number" ? scrollBottom < this._previousScrollBottom ? "up" : "down" : "down";
    this._previousScrollBottom = scrollBottom;
    let top = Math.max(0, scrollTop - elementTop - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH);
    const possibleEditorHeight = editorHeight - top;
    if (possibleEditorHeight < LINE_HEIGHT) {
      top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
    }
    let height = editorContentHeight;
    let editorScrollTop = 0;
    if (scrollTop <= elementTop + CELL_TOP_MARGIN) {
      const minimumEditorHeight = LINE_HEIGHT + this.notebookEditor.notebookOptions.getLayoutConfiguration().editorTopPadding;
      if (scrollBottom >= editorBottom) {
        height = clamp(editorContentHeight, minimumEditorHeight, editorContentHeight);
        this._editorVisibility = "Full";
      } else {
        height = clamp(scrollBottom - (elementTop + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT, minimumEditorHeight, editorContentHeight) + 2 * CELL_OUTLINE_WIDTH;
        this._editorVisibility = "Bottom Clipped";
        editorScrollTop = 0;
      }
    } else {
      if (viewportHeight <= editorContentHeight && scrollBottom <= editorBottom) {
        const minimumEditorHeight = LINE_HEIGHT + this.notebookEditor.notebookOptions.getLayoutConfiguration().editorTopPadding;
        height = clamp(viewportHeight - STATUSBAR_HEIGHT, minimumEditorHeight, editorContentHeight - STATUSBAR_HEIGHT) + 2 * CELL_OUTLINE_WIDTH;
        this._editorVisibility = "Full (Small Viewport)";
        editorScrollTop = top;
      } else {
        const minimumEditorHeight = LINE_HEIGHT;
        height = clamp(editorContentHeight - (scrollTop - (elementTop + CELL_TOP_MARGIN)), minimumEditorHeight, editorContentHeight);
        if (scrollTop > editorBottom) {
          this._editorVisibility = "Invisible";
        } else {
          this._editorVisibility = "Top Clipped";
        }
        editorScrollTop = editorContentHeight - height;
      }
    }
    this._logService.debug(`${reason} (${this._editorVisibility}, ${this._initialized})`);
    this._logService.debug(`=> Editor Top = ${top}px (editHeight = ${editorHeight}, editContentHeight: ${editorContentHeight})`);
    this._logService.debug(`=> eleTop = ${elementTop}, eleBottom = ${elementBottom}, eleHeight = ${elementHeight}`);
    this._logService.debug(`=> scrollTop = ${scrollTop}, top = ${top}`);
    this._logService.debug(`=> cellTopMargin = ${CELL_TOP_MARGIN}, cellBottomMargin = ${this.viewCell.layoutInfo.topMargin}, cellOutline = ${CELL_OUTLINE_WIDTH}`);
    this._logService.debug(`=> scrollBottom: ${scrollBottom}, editBottom: ${editorBottom}, viewport: ${viewportHeight}, scroll: ${scrollDirection}, contOffset: ${outputContainerOffset})`);
    this._logService.debug(`=> Editor Height = ${height}px, Width: ${editorWidth}px, Initial Width: ${this._initialEditorDimension.width}, EditorScrollTop = ${editorScrollTop}px, StatusbarHeight = ${STATUSBAR_HEIGHT}, lineHeight = ${this.notebookEditor.getLayoutInfo().fontInfo.lineHeight}`);
    try {
      this._isUpdatingLayout = true;
      element.style.top = `${top}px`;
      editor.layout({
        width: this._initialized ? editorWidth : this._initialEditorDimension.width,
        height
      }, true);
      if (!this._pointerDown && editorScrollTop >= 0) {
        this._lastChangedEditorScrolltop = editorScrollTop;
        editor.setScrollTop(editorScrollTop);
      }
    } finally {
      this._initialized = true;
      this._isUpdatingLayout = false;
      this._logService.debug("Updated Editor Layout");
    }
  }
}
export {
  CodeCell,
  CodeCellLayout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXGNvZGVDZWxsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gYWxsb3ctYW55LXVuaWNvZGUtY29tbWVudC1maWxlXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS8yZC9kaW1lbnNpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IHRva2VuaXplVG9TdHJpbmdTeW5jIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvdGV4dFRvSHRtbFRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBJUmVhZG9ubHlUZXh0QnVmZmVyLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEZvY3VzTW9kZSwgRVhQQU5EX0NFTExfSU5QVVRfQ09NTUFORF9JRCwgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxWaWV3TW9kZWwsIG91dHB1dERpc3BsYXlMaW1pdCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsUGFydHNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vY2VsbFBhcnQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsRWRpdG9yUG9vbCB9IGZyb20gJy4uL25vdGVib29rQ2VsbEVkaXRvclBvb2wuanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSwgY29sbGFwc2VkQ2VsbFRUUG9saWN5IH0gZnJvbSAnLi4vbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2NlbGxFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IENlbGxPdXRwdXRDb250YWluZXIgfSBmcm9tICcuL2NlbGxPdXRwdXQuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2VkQ29kZUNlbGxFeGVjdXRpb25JY29uIH0gZnJvbSAnLi9jb2RlQ2VsbEV4ZWN1dGlvbkljb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIENvZGVDZWxsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX291dHB1dENvbnRhaW5lclJlbmRlcmVyOiBDZWxsT3V0cHV0Q29udGFpbmVyO1xuXHRwcml2YXRlIF9pbnB1dENvbGxhcHNlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcmVuZGVyZWRJbnB1dENvbGxhcHNlU3RhdGU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbmRlcmVkT3V0cHV0Q29sbGFwc2VTdGF0ZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNlbGxQYXJ0czogQ2VsbFBhcnRzQ29sbGVjdGlvbjtcblxuXHRwcml2YXRlIF9jb2xsYXBzZWRFeGVjdXRpb25JY29uOiBDb2xsYXBzZWRDb2RlQ2VsbEV4ZWN1dGlvbkljb247XG5cdHByaXZhdGUgX2NlbGxFZGl0b3JPcHRpb25zOiBDZWxsRWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSBfdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQgPSB0cnVlO1xuXHRwcml2YXRlIF9wb2ludGVyRG93bkluRWRpdG9yID0gZmFsc2U7XG5cdHByaXZhdGUgX3BvaW50ZXJEcmFnZ2luZ0luRWRpdG9yID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NlbGxMYXlvdXQ6IENvZGVDZWxsTGF5b3V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1ZzogKG91dHB1dDogc3RyaW5nKSA9PiB2b2lkO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdDZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlRGF0YTogQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBvb2w6IE5vdGVib29rQ2VsbEVkaXRvclBvb2wsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSBub3RlYm9va0xvZ1NlcnZpY2U6IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGNlbGxJbmRleCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KHRoaXMudmlld0NlbGwpO1xuXHRcdGNvbnN0IGRlYnVnUHJlZml4ID0gYFtDZWxsICR7Y2VsbEluZGV4fV1gO1xuXHRcdGNvbnN0IGRlYnVnID0gdGhpcy5fZGVidWcgPSAob3V0cHV0OiBzdHJpbmcpID0+IHtcblx0XHRcdG5vdGVib29rTG9nU2VydmljZS5kZWJ1ZygnQ2VsbExheW91dCcsIGAke2RlYnVnUHJlZml4fSAke291dHB1dH1gKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fY2VsbEVkaXRvck9wdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2VsbEVkaXRvck9wdGlvbnModGhpcy5ub3RlYm9va0VkaXRvci5nZXRCYXNlQ2VsbEVkaXRvck9wdGlvbnModmlld0NlbGwubGFuZ3VhZ2UpLCB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX291dHB1dENvbnRhaW5lclJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsT3V0cHV0Q29udGFpbmVyLCBub3RlYm9va0VkaXRvciwgdmlld0NlbGwsIHRlbXBsYXRlRGF0YSwgeyBsaW1pdDogb3V0cHV0RGlzcGxheUxpbWl0IH0pO1xuXHRcdHRoaXMuY2VsbFBhcnRzID0gdGhpcy5fcmVnaXN0ZXIodGVtcGxhdGVEYXRhLmNlbGxQYXJ0cy5jb25jYXRDb250ZW50UGFydChbdGhpcy5fY2VsbEVkaXRvck9wdGlvbnMsIHRoaXMuX291dHB1dENvbnRhaW5lclJlbmRlcmVyXSwgRE9NLmdldFdpbmRvdyhub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkpKSk7XG5cblx0XHRjb25zdCBpbml0aWFsRWRpdG9yRGltZW5zaW9uID0geyBoZWlnaHQ6IHRoaXMuY2FsY3VsYXRlSW5pdEVkaXRvckhlaWdodCgpLCB3aWR0aDogdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRoIH07XG5cdFx0dGhpcy5fY2VsbExheW91dCA9IG5ldyBDb2RlQ2VsbExheW91dCh0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCwgbm90ZWJvb2tFZGl0b3IsIHZpZXdDZWxsLCB0ZW1wbGF0ZURhdGEsIHsgZGVidWcgfSwgaW5pdGlhbEVkaXRvckRpbWVuc2lvbik7XG5cdFx0dGhpcy5pbml0aWFsaXplRWRpdG9yKGluaXRpYWxFZGl0b3JEaW1lbnNpb24pO1xuXHRcdHRoaXMuX3JlbmRlcmVkSW5wdXRDb2xsYXBzZVN0YXRlID0gZmFsc2U7IC8vIGVkaXRvciBpcyBhbHdheXMgZXhwYW5kZWQgaW5pdGlhbGx5XG5cblx0XHR0aGlzLnJlZ2lzdGVyTm90ZWJvb2tFZGl0b3JMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyVmlld0NlbGxMYXlvdXRDaGFuZ2UoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ2VsbEVkaXRvckV2ZW50TGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5yZWdpc3Rlck1vdXNlTGlzdGVuZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLnZpZXdDZWxsLm9uRGlkU3RhcnRFeGVjdXRpb24sIHRoaXMudmlld0NlbGwub25EaWRTdG9wRXhlY3V0aW9uKSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5jZWxsUGFydHMudXBkYXRlRm9yRXhlY3V0aW9uU3RhdGUodGhpcy52aWV3Q2VsbCwgZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Q2VsbC5vbkRpZENoYW5nZVN0YXRlKGUgPT4ge1xuXHRcdFx0dGhpcy5jZWxsUGFydHMudXBkYXRlU3RhdGUodGhpcy52aWV3Q2VsbCwgZSk7XG5cblx0XHRcdGlmIChlLm91dHB1dElzSG92ZXJlZENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGb3JPdXRwdXRIb3ZlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5vdXRwdXRJc0ZvY3VzZWRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRm9yT3V0cHV0Rm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUubWV0YWRhdGFDaGFuZ2VkIHx8IGUuaW50ZXJuYWxNZXRhZGF0YUNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmlucHV0Q29sbGFwc2VkQ2hhbmdlZCB8fCBlLm91dHB1dENvbGxhcHNlZENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC5wYXVzZUxheW91dCgpO1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gdGhpcy51cGRhdGVGb3JDb2xsYXBzZVN0YXRlKCk7XG5cdFx0XHRcdHRoaXMudmlld0NlbGwucmVzdW1lTGF5b3V0KCk7XG5cdFx0XHRcdGlmICh1cGRhdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5yZWxheW91dENlbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5mb2N1c01vZGVDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRWRpdG9yRm9yRm9jdXNNb2RlQ2hhbmdlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdHRoaXMudXBkYXRlRWRpdG9yRm9yRm9jdXNNb2RlQ2hhbmdlKGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZUZvck91dHB1dEhvdmVyKCk7XG5cdFx0dGhpcy51cGRhdGVGb3JPdXRwdXRGb2N1cygpO1xuXG5cdFx0dGhpcy5jZWxsUGFydHMuc2NoZWR1bGVSZW5kZXJDZWxsKHRoaXMudmlld0NlbGwpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuY2VsbFBhcnRzLnVucmVuZGVyQ2VsbCh0aGlzLnZpZXdDZWxsKTtcblx0XHR9KSk7XG5cblxuXHRcdC8vIFJlbmRlciBPdXRwdXRzXG5cdFx0dGhpcy52aWV3Q2VsbC5lZGl0b3JIZWlnaHQgPSBpbml0aWFsRWRpdG9yRGltZW5zaW9uLmhlaWdodDtcblx0XHR0aGlzLl9vdXRwdXRDb250YWluZXJSZW5kZXJlci5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZW5kZXJlZE91dHB1dENvbGxhcHNlU3RhdGUgPSBmYWxzZTsgLy8gdGhlIG91dHB1dCBpcyBhbHdheXMgcmVuZGVyZWQgaW5pdGlhbGx5XG5cdFx0Ly8gTmVlZCB0byBkbyB0aGlzIGFmdGVyIHRoZSBpbnRpYWwgcmVuZGVyT3V0cHV0XG5cdFx0dGhpcy5pbml0aWFsVmlld1VwZGF0ZUV4cGFuZGVkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uTGF5b3V0SW5mb1JlYWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5jZWxsUGFydHMucHJlcGFyZUxheW91dCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGlvbkl0ZW1FbGVtZW50ID0gRE9NLmFwcGVuZCh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIsIERPTS4kKCcuY29sbGFwc2VkLWV4ZWN1dGlvbi1pY29uJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRleGVjdXRpb25JdGVtRWxlbWVudC5yZW1vdmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fY29sbGFwc2VkRXhlY3V0aW9uSWNvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29sbGFwc2VkQ29kZUNlbGxFeGVjdXRpb25JY29uLCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLnZpZXdDZWxsLCBleGVjdXRpb25JdGVtRWxlbWVudCkpO1xuXHRcdHRoaXMudXBkYXRlRm9yQ29sbGFwc2VTdGF0ZSgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHZpZXdDZWxsLm9uRGlkQ2hhbmdlT3V0cHV0cywgdGhpcy51cGRhdGVGb3JPdXRwdXRzLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodmlld0NlbGwub25EaWRDaGFuZ2VMYXlvdXQsIHRoaXMudXBkYXRlRm9yTGF5b3V0LmJpbmQodGhpcykpKTtcblxuXHRcdHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLnNldExpbmVOdW1iZXJzKHRoaXMudmlld0NlbGwubGluZU51bWJlcnMpO1xuXHRcdHRlbXBsYXRlRGF0YS5lZGl0b3IudXBkYXRlT3B0aW9ucyh0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucy5nZXRVcGRhdGVkVmFsdWUodGhpcy52aWV3Q2VsbC5pbnRlcm5hbE1ldGFkYXRhLCB0aGlzLnZpZXdDZWxsLnVyaSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb2RlQ2VsbE9wdGlvbnModGVtcGxhdGVEYXRhOiBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlKSB7XG5cdFx0dGVtcGxhdGVEYXRhLmVkaXRvci51cGRhdGVPcHRpb25zKHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLmdldFVwZGF0ZWRWYWx1ZSh0aGlzLnZpZXdDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMudmlld0NlbGwudXJpKSk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2UoKSB7IGN0cy5kaXNwb3NlKHRydWUpOyB9IH0pO1xuXHRcdHJhY2VDYW5jZWxsYXRpb24odGhpcy52aWV3Q2VsbC5yZXNvbHZlVGV4dE1vZGVsKCksIGN0cy50b2tlbikudGhlbihtb2RlbCA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRpbmRlbnRTaXplOiB0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucy5pbmRlbnRTaXplLFxuXHRcdFx0XHRcdHRhYlNpemU6IHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLnRhYlNpemUsXG5cdFx0XHRcdFx0aW5zZXJ0U3BhY2VzOiB0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucy5pbnNlcnRTcGFjZXMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVuZGluZ0xheW91dDogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JMYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQgPSBET00ubW9kaWZ5KERPTS5nZXRXaW5kb3codGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmNlbGxQYXJ0cy51cGRhdGVJbnRlcm5hbExheW91dE5vdyh0aGlzLnZpZXdDZWxsKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRm9yT3V0cHV0SG92ZXIoKSB7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NlbGwtb3V0cHV0LWhvdmVyJywgdGhpcy52aWV3Q2VsbC5vdXRwdXRJc0hvdmVyZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JPdXRwdXRGb2N1cygpIHtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1vdXRwdXQtZm9jdXMnLCB0aGlzLnZpZXdDZWxsLm91dHB1dElzRm9jdXNlZCk7XG5cdH1cblxuXHRwcml2YXRlIGNhbGN1bGF0ZUluaXRFZGl0b3JIZWlnaHQoKSB7XG5cdFx0Y29uc3QgbGluZU51bSA9IHRoaXMudmlld0NlbGwubGluZUNvdW50O1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZm9udEluZm8/LmxpbmVIZWlnaHQgfHwgMTc7XG5cdFx0Y29uc3QgZWRpdG9yUGFkZGluZyA9IHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVFZGl0b3JQYWRkaW5nKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpO1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQgPT09IDBcblx0XHRcdD8gbGluZU51bSAqIGxpbmVIZWlnaHQgKyBlZGl0b3JQYWRkaW5nLnRvcCArIGVkaXRvclBhZGRpbmcuYm90dG9tXG5cdFx0XHQ6IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQ7XG5cdFx0cmV0dXJuIGVkaXRvckhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZUVkaXRvcihkaW1lbnNpb246IElEaW1lbnNpb24pIHtcblx0XHR0aGlzLl9kZWJ1ZyhgSW5pdGlhbGl6ZSBFZGl0b3IgJHtkaW1lbnNpb24uaGVpZ2h0fSB4ICR7ZGltZW5zaW9uLndpZHRofSwgU2Nyb2xsIFRvcCA9ICR7dGhpcy5ub3RlYm9va0VkaXRvci5zY3JvbGxUb3B9YCk7XG5cdFx0dGhpcy5fY2VsbExheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblx0XHR0aGlzLmxheW91dEVkaXRvcihkaW1lbnNpb24pO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlKCkgeyBjdHMuZGlzcG9zZSh0cnVlKTsgfSB9KTtcblx0XHRyYWNlQ2FuY2VsbGF0aW9uKHRoaXMudmlld0NlbGwucmVzb2x2ZVRleHRNb2RlbCgpLCBjdHMudG9rZW4pLnRoZW4obW9kZWwgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQgfHwgbW9kZWw/LmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCAmJiB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fcmVpZ3N0ZXJNb2RlbExpc3RlbmVycyhtb2RlbCk7XG5cblx0XHRcdFx0Ly8gc2V0IG1vZGVsIGNhbiB0cmlnZ2VyIHZpZXcgdXBkYXRlLCB3aGljaCBjYW4gbGVhZCB0byBkaXNwb3NlIG9mIHRoaXMgY2VsbFxuXHRcdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3Iuc2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0aW5kZW50U2l6ZTogdGhpcy5fY2VsbEVkaXRvck9wdGlvbnMuaW5kZW50U2l6ZSxcblx0XHRcdFx0XHR0YWJTaXplOiB0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucy50YWJTaXplLFxuXHRcdFx0XHRcdGluc2VydFNwYWNlczogdGhpcy5fY2VsbEVkaXRvck9wdGlvbnMuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC5hdHRhY2hUZXh0RWRpdG9yKHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvciwgdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVzdGltYXRlZEhhc0hvcml6b250YWxTY3JvbGxpbmcpO1xuXHRcdFx0XHRjb25zdCBmb2N1c0VkaXRvcklmTmVlZGVkID0gKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpID09PSB0aGlzLnZpZXdDZWxsICYmXG5cdFx0XHRcdFx0XHR0aGlzLnZpZXdDZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IgJiZcblx0XHRcdFx0XHRcdCh0aGlzLm5vdGVib29rRWRpdG9yLmhhc0VkaXRvckZvY3VzKCkgfHwgdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmJvZHkpKSAvLyBEb24ndCBzdGVhbCBmb2N1cyBmcm9tIG90aGVyIHdvcmtiZW5jaCBwYXJ0cywgYnV0IGlmIGJvZHkgaGFzIGZvY3VzLCB3ZSBjYW4gdGFrZSBpdFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Zm9jdXNFZGl0b3JJZk5lZWRlZCgpO1xuXG5cdFx0XHRcdGNvbnN0IHJlYWxDb250ZW50SGVpZ2h0ID0gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdFx0aWYgKHJlYWxDb250ZW50SGVpZ2h0ICE9PSBkaW1lbnNpb24uaGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5vbkNlbGxFZGl0b3JIZWlnaHRDaGFuZ2UoJ29uRGlkUmVzb2x2ZVRleHRNb2RlbCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb2N1c0VkaXRvcklmTmVlZGVkKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlQ29kZUNlbGxPcHRpb25zKHRoaXMudGVtcGxhdGVEYXRhKSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JPdXRwdXRzKCk6IHZvaWQge1xuXHRcdERPTS5zZXRWaXNpYmlsaXR5KHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoID4gMCwgdGhpcy50ZW1wbGF0ZURhdGEuZm9jdXNTaW5rRWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvck9wdGlvbnMoKSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNSZWFkb25seSA9IHRoaXMubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seTtcblx0XHRjb25zdCBwYWRkaW5nID0gdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUVkaXRvclBhZGRpbmcodGhpcy52aWV3Q2VsbC5pbnRlcm5hbE1ldGFkYXRhLCB0aGlzLnZpZXdDZWxsLnVyaSk7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGVkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSkgIT09IGlzUmVhZG9ubHkgfHwgb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnBhZGRpbmcpICE9PSBwYWRkaW5nKSB7XG5cdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdHJlYWRPbmx5OiB0aGlzLm5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHksIHBhZGRpbmc6IHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVFZGl0b3JQYWRkaW5nKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTm90ZWJvb2tFZGl0b3JMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ub3RlYm9va0VkaXRvci5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHR0aGlzLmFkanVzdEVkaXRvclBvc2l0aW9uKCk7XG5cdFx0XHR0aGlzLl9jZWxsTGF5b3V0LmxheW91dEVkaXRvcignbmJEaWRTY3JvbGwnKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTGF5b3V0KCgpID0+IHtcblx0XHRcdHRoaXMuYWRqdXN0RWRpdG9yUG9zaXRpb24oKTtcblx0XHRcdHRoaXMub25DZWxsV2lkdGhDaGFuZ2UoJ25iTGF5b3V0Q2hhbmdlJyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGp1c3RFZGl0b3JQb3NpdGlvbigpIHtcblx0XHRpZiAodGhpcy5fdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXh0cmFPZmZzZXQgPSAtNiAvKiogZGlzdGFuY2UgdG8gdGhlIHRvcCBvZiB0aGUgY2VsbCBlZGl0b3IsIHdoaWNoIGlzIDZweCB1bmRlciB0aGUgZm9jdXMgaW5kaWNhdG9yICovIC0gMSAvKiogYm9yZGVyICovO1xuXHRcdGNvbnN0IG1pbiA9IDA7XG5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLm5vdGVib29rRWRpdG9yLnNjcm9sbFRvcDtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRBYnNvbHV0ZVRvcE9mRWxlbWVudCh0aGlzLnZpZXdDZWxsKTtcblx0XHRjb25zdCBkaWZmID0gc2Nyb2xsVG9wIC0gZWxlbWVudFRvcCArIGV4dHJhT2Zmc2V0O1xuXG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JMYXlvdXQgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKTtcblxuXHRcdC8vIHdlIHNob3VsZCBzdG9wIGFkanVzdGluZyB0aGUgdG9wIHdoZW4gdXNlcnMgYXJlIHZpZXdpbmcgdGhlIGJvdHRvbSBvZiB0aGUgY2VsbCBlZGl0b3Jcblx0XHRjb25zdCBlZGl0b3JNYXhIZWlnaHQgPSBub3RlYm9va0VkaXRvckxheW91dC5oZWlnaHRcblx0XHRcdC0gbm90ZWJvb2tFZGl0b3JMYXlvdXQuc3RpY2t5SGVpZ2h0XG5cdFx0XHQtIDI2IC8qKiBub3RlYm9vayB0b29sYmFyICovO1xuXG5cdFx0Y29uc3QgbWF4VG9wID1cblx0XHRcdHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHRcblx0XHRcdC8vICsgdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLnN0YXR1c0JhckhlaWdodFxuXHRcdFx0LSBlZGl0b3JNYXhIZWlnaHRcblx0XHRcdDtcblx0XHRjb25zdCB0b3AgPSBtYXhUb3AgPiAyMCA/XG5cdFx0XHRjbGFtcChtaW4sIGRpZmYsIG1heFRvcCkgOlxuXHRcdFx0bWluO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvclBhcnQuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHQvLyBzY3JvbGwgdGhlIGVkaXRvciB3aXRoIHRvcFxuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5zZXRTY3JvbGxUb3AodG9wKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJWaWV3Q2VsbExheW91dENoYW5nZSgpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uRGlkQ2hhbmdlTGF5b3V0KChlKSA9PiB7XG5cdFx0XHRpZiAoZS5vdXRlcldpZHRoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0XHRcdGlmIChsYXlvdXRJbmZvLndpZHRoICE9PSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGgpIHtcblx0XHRcdFx0XHR0aGlzLm9uQ2VsbFdpZHRoQ2hhbmdlKCd2aWV3Q2VsbExheW91dENoYW5nZScpO1xuXHRcdFx0XHRcdHRoaXMuYWRqdXN0RWRpdG9yUG9zaXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDZWxsRWRpdG9yRXZlbnRMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmNvbnRlbnRIZWlnaHRDaGFuZ2VkKSB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9ySGVpZ2h0ICE9PSBlLmNvbnRlbnRIZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLm9uQ2VsbEVkaXRvckhlaWdodENoYW5nZShgb25EaWRDb250ZW50U2l6ZUNoYW5nZWApO1xuXHRcdFx0XHRcdHRoaXMuYWRqdXN0RWRpdG9yUG9zaXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHQvLyBPcHRpb24gNDogR2F0ZSBzY3JvbGwtZHJpdmVuIHJlYWN0aW9ucyBkdXJpbmcgYWN0aXZlIGRyYWctc2VsZWN0aW9uXG5cdFx0XHRcdGlmICh0aGlzLl9wb2ludGVyRG93bkluRWRpdG9yIHx8IHRoaXMuX3BvaW50ZXJEcmFnZ2luZ0luRWRpdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9jZWxsTGF5b3V0LmVkaXRvclZpc2liaWxpdHkgPT09ICdJbnZpc2libGUnIHx8ICF0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2NlbGxMYXlvdXQuX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wID09PSBlLnNjcm9sbFRvcCB8fCB0aGlzLl9jZWxsTGF5b3V0LmlzVXBkYXRpbmdMYXlvdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5ub3RlYm9va0VkaXRvci5zY3JvbGxUb3A7XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBlLnNjcm9sbFRvcCAtICh0aGlzLl9jZWxsTGF5b3V0Ll9sYXN0Q2hhbmdlZEVkaXRvclNjcm9sbHRvcCA/PyAwKTtcblx0XHRcdFx0aWYgKHRoaXMuX2NlbGxMYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSA9PT0gJ0Z1bGwgKFNtYWxsIFZpZXdwb3J0KScgJiYgdHlwZW9mIHRoaXMuX2NlbGxMYXlvdXQuX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnKGBTY3JvbGwgQ2hhbmdlICgxKSA9ICR7ZS5zY3JvbGxUb3B9IGNoYW5nZWQgYnkgJHtkaWZmfSAobm90ZWJvb2sgc2Nyb2xsVG9wOiAke3Njcm9sbFRvcH0sIHNldEVkaXRvclNjcm9sbFRvcDogJHtlLnNjcm9sbFRvcH0pYCk7XG5cdFx0XHRcdFx0Ly8gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLnNldFNjcm9sbFRvcChlLnNjcm9sbFRvcCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY2VsbExheW91dC5lZGl0b3JWaXNpYmlsaXR5ID09PSAnQm90dG9tIENsaXBwZWQnICYmIHR5cGVvZiB0aGlzLl9jZWxsTGF5b3V0Ll9sYXN0Q2hhbmdlZEVkaXRvclNjcm9sbHRvcCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1ZyhgU2Nyb2xsIENoYW5nZSAoMikgPSAke2Uuc2Nyb2xsVG9wfSBjaGFuZ2VkIGJ5ICR7ZGlmZn0gKG5vdGVib29rIHNjcm9sbFRvcDogJHtzY3JvbGxUb3B9LCBzZXROb3RlYm9va1Njcm9sbFRvcDogJHtzY3JvbGxUb3AgKyBlLnNjcm9sbFRvcH0pYCk7XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wICsgZS5zY3JvbGxUb3ApO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2NlbGxMYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSA9PT0gJ1RvcCBDbGlwcGVkJyAmJiB0eXBlb2YgdGhpcy5fY2VsbExheW91dC5fbGFzdENoYW5nZWRFZGl0b3JTY3JvbGx0b3AgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3U2Nyb2xsVG9wID0gc2Nyb2xsVG9wICsgZGlmZiAtIDE7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWcoYFNjcm9sbCBDaGFuZ2UgKDMpID0gJHtlLnNjcm9sbFRvcH0gY2hhbmdlZCBieSAke2RpZmZ9IChub3RlYm9vayBzY3JvbGxUb3A6ICR7c2Nyb2xsVG9wfSwgc2V0Tm90ZWJvb2tTY3JvbGxUb3A/OiAke25ld1Njcm9sbFRvcH0pYCk7XG5cdFx0XHRcdFx0aWYgKHNjcm9sbFRvcCAhPT0gbmV3U2Nyb2xsVG9wKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnNldFNjcm9sbFRvcChuZXdTY3JvbGxUb3ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1ZyhgU2Nyb2xsIENoYW5nZSAoNCkgPSAke2Uuc2Nyb2xsVG9wfSBjaGFuZ2VkIGJ5ICR7ZGlmZn0gKG5vdGVib29rIHNjcm9sbFRvcDogJHtzY3JvbGxUb3B9KWApO1xuXHRcdFx0XHRcdHRoaXMuX2NlbGxMYXlvdXQuX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdC8vIGRvIG5vdCByZXZlYWwgdGhlIGNlbGwgaW50byB2aWV3IGlmIHRoaXMgc2VsZWN0aW9uIGNoYW5nZSB3YXMgY2F1c2VkIGJ5IHJlc3RvcmluZyBlZGl0b3JzXG5cdFx0XHRcdGUuc291cmNlID09PSAncmVzdG9yZVN0YXRlJyB8fCBlLm9sZE1vZGVsVmVyc2lvbklkID09PSAwXG5cdFx0XHRcdC8vIG5vciBpZiB0aGUgdGV4dCBlZGl0b3IgaXMgbm90IGFjdHVhbGx5IGZvY3VzZWQgKGUuZy4gaW5saW5lIGNoYXQgaXMgZm9jdXNlZCBhbmQgbW9kaWZ5aW5nIHRoZSBjZWxsIGNvbnRlbnQpXG5cdFx0XHRcdHx8ICF0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuaGFzVGV4dEZvY3VzKClcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wdGlvbiAzOiBBdm9pZCByZWxheW91dHMgZHVyaW5nIGFjdGl2ZSBwb2ludGVyIGRyYWcgdG8gcHJldmVudCBzdHVjayBzZWxlY3Rpb24gbW9kZVxuXHRcdFx0aWYgKCh0aGlzLl9wb2ludGVyRG93bkluRWRpdG9yIHx8IHRoaXMuX3BvaW50ZXJEcmFnZ2luZ0luRWRpdG9yKSAmJiB0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXG5cdFx0XHRpZiAoc2VsZWN0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdFx0XHRjb25zdCBsYXlvdXRDb250ZW50SGVpZ2h0ID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvckhlaWdodDtcblxuXHRcdFx0XHRpZiAoY29udGVudEhlaWdodCAhPT0gbGF5b3V0Q29udGVudEhlaWdodCkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnKGBvbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbmApO1xuXHRcdFx0XHRcdFx0dGhpcy5vbkNlbGxFZGl0b3JIZWlnaHRDaGFuZ2UoJ29uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGFzdFNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbc2VsZWN0aW9ucy5sZW5ndGggLSAxXTtcblx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5yZXZlYWxSYW5nZUluVmlld0FzeW5jKHRoaXMudmlld0NlbGwsIGxhc3RTZWxlY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0Q29kZUFjdGlvbkNvbnRyb2xsZXIuZ2V0KHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvcik/LmhpZGVMaWdodEJ1bGJXaWRnZXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWlnc3Rlck1vZGVsTGlzdGVuZXJzKG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwub25EaWRDaGFuZ2VUb2tlbnMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudmlld0NlbGwuaXNJbnB1dENvbGxhcHNlZCAmJiB0aGlzLl9pbnB1dENvbGxhcHNlRWxlbWVudCkge1xuXHRcdFx0XHQvLyBmbHVzaCB0aGUgY29sbGFwc2VkIGlucHV0IHdpdGggdGhlIGxhdGVzdCB0b2tlbnNcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX2dldFJpY2hUZXh0RnJvbUxpbmVUb2tlbnMobW9kZWwpO1xuXHRcdFx0XHR0aGlzLl9pbnB1dENvbGxhcHNlRWxlbWVudC5pbm5lckhUTUwgPSAoY29sbGFwc2VkQ2VsbFRUUG9saWN5Py5jcmVhdGVIVE1MKGNvbnRlbnQpID8/IGNvbnRlbnQpIGFzIHN0cmluZztcblx0XHRcdFx0dGhpcy5fYXR0YWNoSW5wdXRFeHBhbmRCdXR0b24odGhpcy5faW5wdXRDb2xsYXBzZUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNb3VzZUxpc3RlbmVyKCkge1xuXHRcdC8vIFBvaW50ZXItc3RhdGUgaGFuZGxpbmcgaW4gbm90ZWJvb2sgY2VsbCBlZGl0b3JzIGhhcyBhIGNvdXBsZSBvZiBlYXN5LXRvLXJlZ3Jlc3MgZWRnZSBjYXNlczpcblx0XHQvLyAxKSBIb2xkaW5nIHRoZSBsZWZ0IG1vdXNlIGJ1dHRvbiB3aGlsZSB3aGVlbC90cmFja3BhZCBzY3JvbGxpbmcgc2hvdWxkIHNjcm9sbCBhcyB1c3VhbC5cblx0XHQvLyAgICBXZSB0aGVyZWZvcmUgb25seSB0cmVhdCB0aGUgaW50ZXJhY3Rpb24gYXMgYW4gXCJhY3RpdmUgZHJhZyBzZWxlY3Rpb25cIiBhZnRlciBhY3R1YWwgcG9pbnRlciBtb3ZlbWVudC5cblx0XHQvLyAyKSBcIlN0dWNrIHNlbGVjdGlvbiBtb2RlXCIgY2FuIG9jY3VyIGlmIHdlIG1pc3MgdGhlIGNvcnJlc3BvbmRpbmcgbW91c2V1cCAoZS5nLiByZWxlYXNpbmcgb3V0c2lkZSB0aGUgd2luZG93LFxuXHRcdC8vICAgIGZvY3VzIGxvc3MsIG9yIEVTQyBjYW5jZWxsaW5nIE1vbmFjbyBzZWxlY3Rpb24vZHJhZykuIFdoZW4gdGhpcyBoYXBwZW5zLCBsZWF2aW5nIGFueSBvZiBvdXIgZHJhZy9wb2ludGVyXG5cdFx0Ly8gICAgZmxhZ3Mgc2V0IHdpbGwgaW5jb3JyZWN0bHkgZ2F0ZSBzY3JvbGwvbGF5b3V0IHN5bmNpbmcgYW5kIG1ha2UgdGhlIGVkaXRvciBmZWVsIHN0dWNrLlxuXHRcdC8vICAgIFRvIGF2b2lkIHRoYXQsIHdlIHJlc2V0IHN0YXRlIG9uIG11bHRpcGxlIGNhbmNlbGxhdGlvbiBwYXRocyBhbmQgYWxzbyBzZWxmLWhlYWwgb24gbW91c2Vtb3ZlLlxuXHRcdGNvbnN0IHJlc2V0UG9pbnRlclN0YXRlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fcG9pbnRlckRvd25JbkVkaXRvciA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcG9pbnRlckRyYWdnaW5nSW5FZGl0b3IgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2NlbGxMYXlvdXQuc2V0UG9pbnRlckRvd24oZmFsc2UpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3Iub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHQvLyBwcmV2ZW50IGRlZmF1bHQgb24gcmlnaHQgbW91c2UgY2xpY2ssIG90aGVyd2lzZSBpdCB3aWxsIHRyaWdnZXIgdW5leHBlY3RlZCBmb2N1cyBjaGFuZ2VzXG5cdFx0XHQvLyB0aGUgY2F0Y2ggaXMsIGl0IG1lYW5zIHdlIGRvbid0IGFsbG93IGN1c3RvbWl6YXRpb24gb2YgcmlnaHQgYnV0dG9uIG1vdXNlIGRvd24gaGFuZGxlcnMgb3RoZXIgdGhhbiB0aGUgYnVpbHQgaW4gb25lcy5cblx0XHRcdGlmIChlLmV2ZW50LnJpZ2h0QnV0dG9uKSB7XG5cdFx0XHRcdGUuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3VzZU5ld0FwcHJvYWNoRm9yRWRpdG9yTGF5b3V0KSB7XG5cdFx0XHRcdC8vIFRyYWNrIHBvaW50ZXItZG93biBhbmQgcG9pbnRlci1kcmFnIHNlcGFyYXRlbHkuXG5cdFx0XHRcdC8vIEhvbGRpbmcgdGhlIGxlZnQgYnV0dG9uIHdoaWxlIHdoZWVsL3RyYWNrcGFkIHNjcm9sbGluZyBzaG91bGQgYmVoYXZlIGxpa2Ugbm9ybWFsIHNjcm9sbGluZy5cblx0XHRcdFx0aWYgKGUuZXZlbnQubGVmdEJ1dHRvbikge1xuXHRcdFx0XHRcdHRoaXMuX3BvaW50ZXJEb3duSW5FZGl0b3IgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3BvaW50ZXJEcmFnZ2luZ0luRWRpdG9yID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fY2VsbExheW91dC5zZXRQb2ludGVyRG93bihmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5fdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5vbk1vdXNlTW92ZShlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9wb2ludGVyRG93bkluRWRpdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2VsZi1oZWFsOiBpZiB3ZSBtaXNzZWQgYSBtb3VzZXVwIChlLmcuIGZvY3VzIGxvc3MpLCBjbGVhciB0aGUgZHJhZyBzdGF0ZSBhcyBzb29uIGFzIHdlIGNhbiBvYnNlcnZlIGl0LlxuXHRcdFx0XHRpZiAoIWUuZXZlbnQubGVmdEJ1dHRvbikge1xuXHRcdFx0XHRcdHJlc2V0UG9pbnRlclN0YXRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9wb2ludGVyRHJhZ2dpbmdJbkVkaXRvcikge1xuXHRcdFx0XHRcdC8vIE9ubHkgY29uc2lkZXIgaXQgYSBkcmFnLXNlbGVjdGlvbiBvbmNlIHRoZSBwb2ludGVyIGFjdHVhbGx5IG1vdmVzIHdpdGggdGhlIGxlZnQgYnV0dG9uIGRvd24uXG5cdFx0XHRcdFx0dGhpcy5fcG9pbnRlckRyYWdnaW5nSW5FZGl0b3IgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2NlbGxMYXlvdXQuc2V0UG9pbnRlckRvd24odHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQpIHtcblx0XHRcdC8vIEVuc3VyZSB3ZSByZXNldCBwb2ludGVyLWRvd24gZXZlbiBpZiBtb3VzZXVwIGxhbmRzIG91dHNpZGUgdGhlIGVkaXRvclxuXHRcdFx0Y29uc3Qgd2luID0gRE9NLmdldFdpbmRvdyh0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ21vdXNldXAnLCByZXNldFBvaW50ZXJTdGF0ZSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW4sICdwb2ludGVydXAnLCByZXNldFBvaW50ZXJTdGF0ZSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW4sICdwb2ludGVyY2FuY2VsJywgcmVzZXRQb2ludGVyU3RhdGUpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luLCAnYmx1cicsIHJlc2V0UG9pbnRlclN0YXRlKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRXNjYXBlJyAmJiAodGhpcy5fcG9pbnRlckRvd25JbkVkaXRvciB8fCB0aGlzLl9wb2ludGVyRHJhZ2dpbmdJbkVkaXRvcikpIHtcblx0XHRcdFx0XHRyZXNldFBvaW50ZXJTdGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRQcmVzZXJ2ZUVkaXRvcigpIHtcblx0XHQvLyBUaGUgRE9NIGZvY3VzIG5lZWRzIHRvIGJlIGFkanVzdGVkOlxuXHRcdC8vIHdoZW4gYSBjZWxsIGVkaXRvciBzaG91bGQgYmUgZm9jdXNlZFxuXHRcdC8vIHRoZSBkb2N1bWVudCBhY3RpdmUgZWxlbWVudCBpcyBpbnNpZGUgdGhlIG5vdGVib29rIGVkaXRvciBvciB0aGUgZG9jdW1lbnQgYm9keSAoY2VsbCBlZGl0b3IgYmVpbmcgZGlzcG9zZWQgcHJldmlvdXNseSlcblx0XHRyZXR1cm4gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCkgPT09IHRoaXMudmlld0NlbGxcblx0XHRcdCYmIHRoaXMudmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvclxuXHRcdFx0JiYgKHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSB8fCB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYm9keSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvckZvckZvY3VzTW9kZUNoYW5nZShzeW5jOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkUHJlc2VydmVFZGl0b3IoKSkge1xuXHRcdFx0aWYgKHN5bmMpIHtcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihET00ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKERPTS5nZXRXaW5kb3codGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NlbGwtZWRpdG9yLWZvY3VzJywgdGhpcy52aWV3Q2VsbC5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yKTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1vdXRwdXQtZm9jdXMnLCB0aGlzLnZpZXdDZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5PdXRwdXQpO1xuXHR9XG5cdHByaXZhdGUgdXBkYXRlRm9yQ29sbGFwc2VTdGF0ZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy52aWV3Q2VsbC5pc091dHB1dENvbGxhcHNlZCA9PT0gdGhpcy5fcmVuZGVyZWRPdXRwdXRDb2xsYXBzZVN0YXRlICYmXG5cdFx0XHR0aGlzLnZpZXdDZWxsLmlzSW5wdXRDb2xsYXBzZWQgPT09IHRoaXMuX3JlbmRlcmVkSW5wdXRDb2xsYXBzZVN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3Q2VsbC5sYXlvdXRDaGFuZ2UoeyBlZGl0b3JIZWlnaHQ6IHRydWUgfSk7XG5cblx0XHRpZiAodGhpcy52aWV3Q2VsbC5pc0lucHV0Q29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUlucHV0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3dJbnB1dCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmlzT3V0cHV0Q29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZU91dHB1dCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaG93T3V0cHV0KGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbGF5b3V0Q2VsbCgpO1xuXG5cdFx0dGhpcy5fcmVuZGVyZWRPdXRwdXRDb2xsYXBzZVN0YXRlID0gdGhpcy52aWV3Q2VsbC5pc091dHB1dENvbGxhcHNlZDtcblx0XHR0aGlzLl9yZW5kZXJlZElucHV0Q29sbGFwc2VTdGF0ZSA9IHRoaXMudmlld0NlbGwuaXNJbnB1dENvbGxhcHNlZDtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGFwc2VJbnB1dCgpIHtcblx0XHQvLyBoaWRlIHRoZSBlZGl0b3IgYW5kIGV4ZWN1dGlvbiBsYWJlbCwga2VlcCB0aGUgcnVuIGJ1dHRvblxuXHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvclBhcnQpO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbnB1dC1jb2xsYXBzZWQnLCB0cnVlKTtcblxuXHRcdC8vIHJlbW92ZSBpbnB1dCBwcmV2aWV3XG5cdFx0dGhpcy5fcmVtb3ZlSW5wdXRDb2xsYXBzZVByZXZpZXcoKTtcblxuXHRcdHRoaXMuX2NvbGxhcHNlZEV4ZWN1dGlvbkljb24uc2V0VmlzaWJpbGl0eSh0cnVlKTtcblxuXHRcdC8vIHVwZGF0ZSBwcmV2aWV3XG5cdFx0Y29uc3QgcmljaEVkaXRvclRleHQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuaGFzTW9kZWwoKSA/IHRoaXMuX2dldFJpY2hUZXh0RnJvbUxpbmVUb2tlbnModGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldE1vZGVsKCkpIDogdGhpcy5fZ2V0UmljaFRleHQodGhpcy52aWV3Q2VsbC50ZXh0QnVmZmVyLCB0aGlzLnZpZXdDZWxsLmxhbmd1YWdlKTtcblx0XHRjb25zdCBlbGVtZW50ID0gRE9NLiQoJ2Rpdi5jZWxsLWNvbGxhcHNlLXByZXZpZXcnKTtcblx0XHRlbGVtZW50LmlubmVySFRNTCA9IChjb2xsYXBzZWRDZWxsVFRQb2xpY3k/LmNyZWF0ZUhUTUwocmljaEVkaXRvclRleHQpID8/IHJpY2hFZGl0b3JUZXh0KSBhcyBzdHJpbmc7XG5cdFx0dGhpcy5faW5wdXRDb2xsYXBzZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50KTtcblx0XHR0aGlzLl9hdHRhY2hJbnB1dEV4cGFuZEJ1dHRvbihlbGVtZW50KTtcblxuXHRcdERPTS5zaG93KHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2hJbnB1dEV4cGFuZEJ1dHRvbihlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IGV4cGFuZEljb24gPSBET00uJCgnc3Bhbi5leHBhbmRJbnB1dEljb24nKTtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEVYUEFORF9DRUxMX0lOUFVUX0NPTU1BTkRfSUQpO1xuXHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRlbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ2NlbGxFeHBhbmRJbnB1dEJ1dHRvbkxhYmVsV2l0aERvdWJsZUNsaWNrJywgXCJEb3VibGUtY2xpY2sgdG8gZXhwYW5kIGNlbGwgaW5wdXQgKHswfSlcIiwga2V5YmluZGluZy5nZXRMYWJlbCgpKTtcblx0XHRcdGV4cGFuZEljb24udGl0bGUgPSBsb2NhbGl6ZSgnY2VsbEV4cGFuZElucHV0QnV0dG9uTGFiZWwnLCBcIkV4cGFuZCBDZWxsIElucHV0ICh7MH0pXCIsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSk7XG5cdFx0fVxuXG5cdFx0ZXhwYW5kSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubW9yZSkpO1xuXHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQoZXhwYW5kSWNvbik7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93SW5wdXQoKSB7XG5cdFx0dGhpcy5fY29sbGFwc2VkRXhlY3V0aW9uSWNvbi5zZXRWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3JQYXJ0KTtcblx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmljaFRleHQoYnVmZmVyOiBJUmVhZG9ubHlUZXh0QnVmZmVyLCBsYW5ndWFnZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRva2VuaXplVG9TdHJpbmdTeW5jKHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCBidWZmZXIuZ2V0TGluZUNvbnRlbnQoMSksIGxhbmd1YWdlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJpY2hUZXh0RnJvbUxpbmVUb2tlbnMobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRsZXQgcmVzdWx0ID0gYDxkaXYgY2xhc3M9XCJtb25hY28tdG9rZW5pemVkLXNvdXJjZVwiPmA7XG5cblx0XHRjb25zdCBmaXJzdExpbmVUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucygxKTtcblx0XHRjb25zdCB2aWV3TGluZVRva2VucyA9IGZpcnN0TGluZVRva2Vucy5pbmZsYXRlKCk7XG5cdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KDEpO1xuXHRcdGxldCBzdGFydE9mZnNldCA9IDA7XG5cdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSB2aWV3TGluZVRva2Vucy5nZXRDb3VudCgpOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRjb25zdCB0eXBlID0gdmlld0xpbmVUb2tlbnMuZ2V0Q2xhc3NOYW1lKGopO1xuXHRcdFx0Y29uc3QgZW5kSW5kZXggPSB2aWV3TGluZVRva2Vucy5nZXRFbmRPZmZzZXQoaik7XG5cdFx0XHRyZXN1bHQgKz0gYDxzcGFuIGNsYXNzPVwiJHt0eXBlfVwiPiR7c3RyaW5ncy5lc2NhcGUobGluZS5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIGVuZEluZGV4KSl9PC9zcGFuPmA7XG5cdFx0XHRzdGFydE9mZnNldCA9IGVuZEluZGV4O1xuXHRcdH1cblxuXHRcdHJlc3VsdCArPSBgPC9kaXY+YDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlSW5wdXRDb2xsYXBzZVByZXZpZXcoKSB7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSB0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIuY2hpbGRyZW47XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoY2hpbGRyZW5baV0uY2xhc3NMaXN0LmNvbnRhaW5zKCdjZWxsLWNvbGxhcHNlLXByZXZpZXcnKSkge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKGNoaWxkcmVuW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0ZWxlbWVudC5yZW1vdmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU91dHB1dElubmVyQ29udGFpbmVyKGhpZGU6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjaGlsZHJlbiA9IHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lci5kb21Ob2RlLmNoaWxkcmVuO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChjaGlsZHJlbltpXS5jbGFzc0xpc3QuY29udGFpbnMoJ291dHB1dC1pbm5lci1jb250YWluZXInKSkge1xuXHRcdFx0XHRET00uc2V0VmlzaWJpbGl0eSghaGlkZSwgY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbGxhcHNlT3V0cHV0KCkge1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdXRwdXQtY29sbGFwc2VkJywgdHJ1ZSk7XG5cdFx0RE9NLnNob3codGhpcy50ZW1wbGF0ZURhdGEuY2VsbE91dHB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cdFx0dGhpcy5fdXBkYXRlT3V0cHV0SW5uZXJDb250YWluZXIodHJ1ZSk7XG5cdFx0dGhpcy5fb3V0cHV0Q29udGFpbmVyUmVuZGVyZXIudmlld1VwZGF0ZUhpZGVPdXB1dHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dPdXRwdXQoaW5pdFJlbmRlcmluZzogYm9vbGVhbikge1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdXRwdXQtY29sbGFwc2VkJywgZmFsc2UpO1xuXHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLmNlbGxPdXRwdXRDb2xsYXBzZWRDb250YWluZXIpO1xuXHRcdHRoaXMuX3VwZGF0ZU91dHB1dElubmVyQ29udGFpbmVyKGZhbHNlKTtcblx0XHR0aGlzLl9vdXRwdXRDb250YWluZXJSZW5kZXJlci52aWV3VXBkYXRlU2hvd091dHB1dHMoaW5pdFJlbmRlcmluZyk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxWaWV3VXBkYXRlRXhwYW5kZWQoKTogdm9pZCB7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2lucHV0LWNvbGxhcHNlZCcsIGZhbHNlKTtcblx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3JQYXJ0KTtcblx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdXRwdXQtY29sbGFwc2VkJywgZmFsc2UpO1xuXHRcdHRoaXMuX3Nob3dPdXRwdXQodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dEVkaXRvcihkaW1lbnNpb246IElEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yTGF5b3V0ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4oXG5cdFx0XHRlZGl0b3JMYXlvdXQuaGVpZ2h0XG5cdFx0XHQtIGVkaXRvckxheW91dC5zdGlja3lIZWlnaHRcblx0XHRcdC0gMjYgLyoqIG5vdGVib29rIHRvb2xiYXIgKi8sXG5cdFx0XHRkaW1lbnNpb24uaGVpZ2h0XG5cdFx0KTtcblx0XHR0aGlzLl9kZWJ1ZyhgTGF5b3V0IEVkaXRvcjogV2lkdGggPSAke2RpbWVuc2lvbi53aWR0aH0sIEhlaWdodCA9ICR7bWF4SGVpZ2h0fSAoUmVxdWVzdGVkOiAke2RpbWVuc2lvbi5oZWlnaHR9LCBFZGl0b3IgTGF5b3V0IEhlaWdodDogJHtlZGl0b3JMYXlvdXQuaGVpZ2h0fSwgU3RpY2t5OiAke2VkaXRvckxheW91dC5zdGlja3lIZWlnaHR9KWApO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5sYXlvdXQoe1xuXHRcdFx0d2lkdGg6IGRpbWVuc2lvbi53aWR0aCxcblx0XHRcdGhlaWdodDogbWF4SGVpZ2h0XG5cdFx0fSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2VsbFdpZHRoQ2hhbmdlKGRiZ1JlYXNvbkZvckNoYW5nZTogQ2VsbExheW91dENoYW5nZVJlYXNvbik6IHZvaWQge1xuXHRcdHRoaXMuX2RlYnVnKGBDZWxsIEVkaXRvciBXaWR0aCBDaGFuZ2UsICR7ZGJnUmVhc29uRm9yQ2hhbmdlfSwgQ29udGVudCBIZWlnaHQgPSAke3RoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCl9YCk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRpZiAodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX2RlYnVnKGAqKioqIFVwZGF0aW5nIENlbGwgRWRpdG9yIEhlaWdodCAoMSksIENvbnRlbnRIZWlnaHQ6ICR7aGVpZ2h0fSwgQ29kZUNlbGxMYXlvdXRJbmZvLkVkaXRvcldpZHRoICR7dGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRofSwgRWRpdG9yTGF5b3V0SW5mbyAke3RoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0fSAqKioqYCk7XG5cdFx0XHR0aGlzLnZpZXdDZWxsLmVkaXRvckhlaWdodCA9IGhlaWdodDtcblx0XHRcdHRoaXMucmVsYXlvdXRDZWxsKCk7XG5cdFx0XHR0aGlzLmxheW91dEVkaXRvcihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdpZHRoOiB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGgsXG5cdFx0XHRcdFx0aGVpZ2h0XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RlYnVnKGBDZWxsIEVkaXRvciBXaWR0aCBDaGFuZ2Ugd2l0aG91dCBtb2RlbCwgcmV0dXJuICgxKSwgQ29udGVudEhlaWdodDogJHtoZWlnaHR9LCBDb2RlQ2VsbExheW91dEluZm8uRWRpdG9yV2lkdGggJHt0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGh9LCBFZGl0b3JMYXlvdXRJbmZvICR7dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHR9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NlbGxMYXlvdXQubGF5b3V0RWRpdG9yKGRiZ1JlYXNvbkZvckNoYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2VsbEVkaXRvckhlaWdodENoYW5nZShkYmdSZWFzb25Gb3JDaGFuZ2U6IENlbGxMYXlvdXRDaGFuZ2VSZWFzb24pOiB2b2lkIHtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdGlmICghdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX2RlYnVnKGBDZWxsIEVkaXRvciBIZWlnaHQgQ2hhbmdlIHdpdGhvdXQgbW9kZWwsIHJldHVybiAoMiksIENvbnRlbnRIZWlnaHQ6ICR7aGVpZ2h0fSwgQ29kZUNlbGxMYXlvdXRJbmZvLkVkaXRvcldpZHRoICR7dGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRofSwgRWRpdG9yTGF5b3V0SW5mbyAke3RoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRMYXlvdXRJbmZvKCl9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlYnVnKGBDZWxsIEVkaXRvciBIZWlnaHQgQ2hhbmdlICgke2RiZ1JlYXNvbkZvckNoYW5nZX0pOiAke2hlaWdodH1gKTtcblx0XHR0aGlzLl9kZWJ1ZyhgKioqKiBVcGRhdGluZyBDZWxsIEVkaXRvciBIZWlnaHQgKDIpLCBDb250ZW50SGVpZ2h0OiAke2hlaWdodH0sIENvZGVDZWxsTGF5b3V0SW5mby5FZGl0b3JXaWR0aCAke3RoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aH0sIEVkaXRvckxheW91dEluZm8gJHt0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodH0gKioqKmApO1xuXHRcdGNvbnN0IHZpZXdMYXlvdXQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHRoaXMudmlld0NlbGwuZWRpdG9ySGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMucmVsYXlvdXRDZWxsKCk7XG5cdFx0dGhpcy5sYXlvdXRFZGl0b3IoXG5cdFx0XHR7XG5cdFx0XHRcdHdpZHRoOiB2aWV3TGF5b3V0LndpZHRoLFxuXHRcdFx0XHRoZWlnaHRcblx0XHRcdH1cblx0XHQpO1xuXHRcdHRoaXMuX2NlbGxMYXlvdXQubGF5b3V0RWRpdG9yKGRiZ1JlYXNvbkZvckNoYW5nZSk7XG5cdH1cblxuXHRyZWxheW91dENlbGwoKSB7XG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5sYXlvdXROb3RlYm9va0NlbGwodGhpcy52aWV3Q2VsbCwgdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cblx0XHQvLyBtb3ZlIGZvY3VzIGJhY2sgdG8gdGhlIGNlbGwgbGlzdCBvdGhlcndpc2UgdGhlIGZvY3VzIGdvZXMgdG8gYm9keVxuXHRcdGlmICh0aGlzLnNob3VsZFByZXNlcnZlRWRpdG9yKCkpIHtcblx0XHRcdC8vIG5vdyB0aGUgZm9jdXMgaXMgb24gdGhlIG1vbmFjbyBlZGl0b3IgZm9yIHRoZSBjZWxsIGJ1dCBkZXRhY2hlZCBmcm9tIHRoZSByb3dzLlxuXHRcdFx0dGhpcy5lZGl0b3JQb29sLnByZXNlcnZlRm9jdXNlZEVkaXRvcih0aGlzLnZpZXdDZWxsKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDZWxsLmRldGFjaFRleHRFZGl0b3IoKTtcblx0XHR0aGlzLl9yZW1vdmVJbnB1dENvbGxhcHNlUHJldmlldygpO1xuXHRcdHRoaXMuX291dHB1dENvbnRhaW5lclJlbmRlcmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nTGF5b3V0Py5kaXNwb3NlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxudHlwZSBDZWxsTGF5b3V0Q2hhbmdlUmVhc29uID0gJ25iTGF5b3V0Q2hhbmdlJyB8ICduYkRpZFNjcm9sbCcgfCAndmlld0NlbGxMYXlvdXRDaGFuZ2UnIHwgJ2luaXQnIHwgJ29uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uJyB8ICdvbkRpZENvbnRlbnRTaXplQ2hhbmdlJyB8ICdvbkRpZFJlc29sdmVUZXh0TW9kZWwnO1xuXG5leHBvcnQgY2xhc3MgQ29kZUNlbGxMYXlvdXQge1xuXHRwcml2YXRlIF9lZGl0b3JWaXNpYmlsaXR5PzogJ0Z1bGwnIHwgJ1RvcCBDbGlwcGVkJyB8ICdCb3R0b20gQ2xpcHBlZCcgfCAnRnVsbCAoU21hbGwgVmlld3BvcnQpJyB8ICdJbnZpc2libGUnO1xuXHRwdWJsaWMgZ2V0IGVkaXRvclZpc2liaWxpdHkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvclZpc2liaWxpdHk7XG5cdH1cblx0cHJpdmF0ZSBfaXNVcGRhdGluZ0xheW91dD86IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgaXNVcGRhdGluZ0xheW91dCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faXNVcGRhdGluZ0xheW91dDtcblx0fVxuXHRwdWJsaWMgX3ByZXZpb3VzU2Nyb2xsQm90dG9tPzogbnVtYmVyO1xuXHRwdWJsaWMgX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wPzogbnVtYmVyO1xuXHRwcml2YXRlIF9pbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9wb2ludGVyRG93bjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHQ/OiBudW1iZXI7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZWQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3Q2VsbDogQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZURhdGE6IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogeyBkZWJ1ZzogKG91dHB1dDogc3RyaW5nKSA9PiB2b2lkIH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbEVkaXRvckRpbWVuc2lvbjogSURpbWVuc2lvblxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBzZXRQb2ludGVyRG93bihpc0Rvd246IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9wb2ludGVyRG93biA9IGlzRG93bjtcblx0fVxuXHQvKipcblx0ICogRHluYW1pY2FsbHkgbGF5cyBvdXQgdGhlIGNvZGUgY2VsbCdzIE1vbmFjbyBlZGl0b3IgdG8gc2ltdWxhdGUgYSBcInN0aWNreVwiIHJ1bi9leGVjIGFyZWEgd2hpbGVcblx0ICogY29uc3RyYWluaW5nIHRoZSB2aXNpYmxlIGVkaXRvciBoZWlnaHQgdG8gdGhlIG5vdGVib29rIHZpZXdwb3J0LiBJdCBhZGp1c3RzIHR3byB0aGluZ3M6XG5cdCAqICAtIFRoZSBhYnNvbHV0ZSBgdG9wYCBvZmZzZXQgb2YgdGhlIGVkaXRvciBwYXJ0IGluc2lkZSB0aGUgY2VsbCAoc28gdGhlIHJ1biAvIGV4ZWN1dGlvbiBvcmRlclxuXHQgKiAgICBhcmVhIHJlbWFpbnMgdmlzaWJsZSBmb3IgYSBsaW1pdGVkIHZlcnRpY2FsIHRyYXZlbCBiYW5kIH40NXB4KS5cblx0ICogIC0gVGhlIGVkaXRvcidzIGxheW91dCBoZWlnaHQgcGx1cyB0aGUgZWRpdG9yJ3MgaW50ZXJuYWwgc2Nyb2xsIHBvc2l0aW9uIChgZWRpdG9yU2Nyb2xsVG9wYCkgdG9cblx0ICogICAgY3JvcCBjb250ZW50IHdoZW4gdGhlIGNlbGwgaXMgcGFydGlhbGx5IHZpc2libGUgKHRvcCBvciBib3R0b20gY2xpcHBlZCkgb3Igd2hlbiBjb250ZW50IGlzXG5cdCAqICAgIHRhbGxlciB0aGFuIHRoZSB2aWV3cG9ydC5cblx0ICpcblx0ICogQWRkaXRpb25hbCBpbnZhcmlhbnRzOlxuXHQgKiAgLSBDb250ZW50IGhlaWdodCBzdGFiaWxpdHk6IG9uY2UgdGhlIGxheW91dCBoYXMgYmVlbiBpbml0aWFsaXplZCwgc2Nyb2xsLWRyaXZlbiByZS1sYXlvdXRzIGNhblxuXHQgKiAgICBvYnNlcnZlIHRyYW5zaWVudCBNb25hY28gY29udGVudCBoZWlnaHRzIHRoYXQgcmVmbGVjdCB0aGUgY3VycmVudCBjbGlwcGVkIGxheW91dCAocmF0aGVyIHRoYW5cblx0ICogICAgdGhlIGZ1bGwgaW5wdXQgaGVpZ2h0KS4gVG8ga2VlcCB0aGUgbm90ZWJvb2sgbGlzdCBsYXlvdXQgc3RhYmxlIChhdm9pZGluZyBvdmVybGFwcGluZyBjZWxsc1xuXHQgKiAgICB3aGlsZSBuYXZpZ2F0aW5nL3Njcm9sbGluZyksIHdlIHN0b3JlIHRoZSBhY3R1YWwgY29udGVudCBoZWlnaHQgaW4gYF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHRgXG5cdCAqICAgIGFuZCByZXVzZSBpdCBmb3Igc2Nyb2xsLWRyaXZlbiByZWxheW91dHMuIFRoaXMgcHJldmVudHMgdGhlIGVkaXRvciBmcm9tIHNocmlua2luZyBiYWNrIHRvIGl0c1xuXHQgKiAgICBpbml0aWFsIGhlaWdodCBhZnRlciBjb250ZW50IGhhcyBiZWVuIGFkZGVkIChlLmcuLCBwYXN0aW5nIHRleHQpIG9yIHdoZW4gTW9uYWNvIHJlcG9ydHMgYVxuXHQgKiAgICB0cmFuc2llbnQgc21hbGxlciBjb250ZW50IGhlaWdodCB3aGlsZSB0aGUgY2VsbCBpcyBjbGlwcGVkLlxuXHQgKlxuXHQgKiAgICBXZSByZWZyZXNoIGBfZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0YCB3aGVuIHRoZSBlZGl0b3IncyBjb250ZW50IHNpemUgY2hhbmdlc1xuXHQgKiAgICAoYG9uRGlkQ29udGVudFNpemVDaGFuZ2VgKSBhbmQgYWxzbyB3aGVuIHdpZHRoL2xheW91dCBjaGFuZ2VzIGNhbiBhZmZlY3Qgd3JhcHBpbmctZHJpdmVuIGhlaWdodFxuXHQgKiAgICAoYHZpZXdDZWxsTGF5b3V0Q2hhbmdlYC9gbmJMYXlvdXRDaGFuZ2VgKS5cblx0ICogIC0gUG9pbnRlci1kcmFnIGdhdGluZzogd2hpbGUgdGhlIHVzZXIgaXMgaG9sZGluZyB0aGUgbW91c2UgYnV0dG9uIGRvd24gaW4gdGhlIGVkaXRvciAoZHJhZ1xuXHQgKiAgICBzZWxlY3Rpb24gb3IgcG90ZW50aWFsIGRyYWcgc2VsZWN0aW9uKSwgd2UgYXZvaWQgcHJvZ3JhbW1hdGljIGBlZGl0b3Iuc2V0U2Nyb2xsVG9wKC4uLilgIHVwZGF0ZXNcblx0ICogICAgdG8gcHJldmVudCBzZWxlY3Rpb24vc2Nyb2xsIGZlZWRiYWNrIGxvb3BzIGFuZCBcInN0dWNrIHNlbGVjdGlvblwiIGJlaGF2aW9yLlxuXHQgKlxuXHQgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0ICogU0VDVElPTiAxLiBPVkVSQUxMIE5PVEVCT09LIFZJRVcgKEVBQ0ggQ0VMTCBIQVMgQU4gMThweCBHQVAgQUJPVkUgSVQpXG5cdCAqIExlZ2VuZDpcblx0ICogICBHQVAgKGJldHdlZW4gY2VsbHMgJiBiZWZvcmUgZmlyc3QgY2VsbCkgLi4uLi4uLi4uLi4uLiAxOHB4XG5cdCAqICAgQ0VMTCBQQURESU5HICh0b3AgJiBib3R0b20gaW5zaWRlIGNlbGwpIC4uLi4uLi4uLi4uLi4gNnB4XG5cdCAqICAgU1RBVFVTIEJBUiBIRUlHSFQgKHR5cGljYWwpIC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4gMjJweFxuXHQgKiAgIExJTkUgSEVJR0hUIChsb2dpYyBjbGFtcCkgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uIDIxcHhcblx0ICogICBCT1JERVIvT1VUTElORSBIRUlHSFQgKHZpc3VhbCBjb25jZWFsIGFkanVzdG1lbnQpIC4uLiAxcHhcblx0ICogICBFRElUT1JfSEVJR0hUIChleGFtcGxlIHZpc2libGUgZWRpdG9yKSAuLi4uLi4uLi4uLi4uLiAyMDBweCAoY2FwcGVkIGJ5IHZpZXdwb3J0KVxuXHQgKiAgIEVESVRPUl9DT05URU5UX0hFSUdIVCAoZXhhbXBsZSBmdWxsIGNvbnRlbnQpIC4uLi4uLi4uIDM4MHB4IChlLmcuIDUwIGxpbmVzKVxuXHQgKiAgIGV4dHJhT2Zmc2V0ID0gLShDRUxMX1BBRERJTkcgKyBCT1JERVJfSEVJR0hUKSAuLi4uLi4uIC03XG5cdCAqXG5cdCAqICAgKFRoZSBsaXN0IGVuc3VyZXMgdGhlIGVkaXRvcidzIGxhaWQgb3V0IGhlaWdodCBuZXZlciBleGNlZWRzIHZpZXdwb3J0IGhlaWdodC4pXG5cdCAqXG5cdCAqICAgXHUyNTBDXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIE5vdGVib29rIFZpZXdwb3J0IChzY3JvbGxpbmcgY29udGFpbmVyKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTBcblx0ICogICBcdTI1MDIgKHNjcm9sbFRvcCkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIDE4cHggR0FQICh0b3Agc3BhY2luZyBiZWZvcmUgZmlyc3QgY2VsbCkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjVCQyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTBDXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIENlbGwgQSBPdXRlciBDb250YWluZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTEwICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNUIyIDZweCB0b3AgcGFkZGluZyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MENcdTI1MDAgRXhlY3V0aW9uIE9yZGVyIC8gUnVuIENvbHVtbiAofjQ1cHggdmVydGljYWwgdHJhdmVsIGJhbmQpXHUyNTAwXHUyNTEwICBcdTI1MENcdTI1MDAgRWRpdG9yIFBhcnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTEwIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgXHUyNTAyIChSdW4gYnV0dG9uLCBleGVjdXRpb24gIyBsYWJlbCkgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICBcdTI1MDIgVmlzaWJsZSBMaW5lcyAuLi4gICBcdTI1MDIgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgXHUyNTAyIEVESVRPUl9IRUlHSFQ9MjAwcHggXHUyNTAyIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICBcdTI1MDIgKENvbnRlbnQ9MzgwcHgpICAgICBcdTI1MDIgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTggIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOCBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgIFx1MjUwQ1x1MjUwMCBTdGF0dXMgQmFyICgyMnB4KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MDIgbGFuZ3VhZ2UgfCBpbmRlbnQgfCBzZWxlY3Rpb24gaW5mbyB8IGtlcm5lbC9zdGF0dXMgYml0cyAuLi4gICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgXHUyNTE0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTE4IFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjVCQyA2cHggYm90dG9tIHBhZGRpbmcgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTE0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTE4ICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICAxOHB4IEdBUCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MENcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgQ2VsbCBCIE91dGVyIENvbnRhaW5lciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiAoc2FtZSBzdHJ1Y3R1cmUgYXMgQ2VsbCBBKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTggICBcdTI1MDJcblx0ICogICBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgKHNjcm9sbEJvdHRvbSkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDJcblx0ICogICBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MThcblx0ICpcblx0ICogU0VDVElPTiAyLiBTSU5HTEUgQ0VMTCBTVFJVQ1RVUkUgKFZFUlRJQ0FMIExBWUVSUylcblx0ICpcblx0ICogICBJbnRlci1DZWxsIEdBUCAoMThweClcblx0ICogICBcdTI1MENcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgQ2VsbCBXcmFwcGVyICg8bGk+KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTBcblx0ICogICBcdTI1MDIgXHUyNTBDXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIC5jZWxsLWlubmVyLWNvbnRhaW5lciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiA2cHggdG9wIHBhZGRpbmcgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTBDXHUyNTAwIExlZnQgR3V0dGVyIChSdW4gLyBFeGVjIC8gRm9jdXMgQm9yZGVyKSBcdTI1MDBcdTI1MkNcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgRWRpdG9yIFBhcnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTEwIFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyIFx1MjUwMiAgU3RpY2t5IHZlcnRpY2FsIHRyYXZlbCAofjQ1cHggYWxsb3dhbmNlKSBcdTI1MDIgIChNb25hY28gc3VyZmFjZSkgICAgICAgICAgICBcdTI1MDIgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgIFZpc2libGUgaGVpZ2h0IDIwMHB4ICAgICAgICAgIFx1MjUwMiBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgQ29udGVudCBoZWlnaHQgMzgwcHggICAgICAgICAgXHUyNTAyIFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUzNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOCBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyIFx1MjUwQ1x1MjUwMCBTdGF0dXMgQmFyICgyMnB4KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTAyIGxhbmd1YWdlIHwgaW5kZW50IHwgc2VsZWN0aW9uIHwga2VybmVsIHwgc3RhdGUgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTE0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTE4IFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyIDZweCBib3R0b20gcGFkZGluZyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTggXHUyNTAyXG5cdCAqICAgXHUyNTAyIChPdXRwdXRzIHJlZ2lvbiBiZWdpbnMgYXQgb3V0cHV0Q29udGFpbmVyT2Zmc2V0IGJlbG93IGlucHV0IGFyZWEpICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOFxuXHQgKi9cblx0cHVibGljIGxheW91dEVkaXRvcihyZWFzb246IENlbGxMYXlvdXRDaGFuZ2VSZWFzb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvclBhcnQ7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwuaXNJbnB1dENvbGxhcHNlZCkge1xuXHRcdFx0ZWxlbWVudC5zdHlsZS50b3AgPSAnJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBMSU5FX0hFSUdIVCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmZvbnRJbmZvLmxpbmVIZWlnaHQ7IC8vIDIxO1xuXHRcdGNvbnN0IENFTExfVE9QX01BUkdJTiA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby50b3BNYXJnaW47XG5cdFx0Y29uc3QgQ0VMTF9PVVRMSU5FX1dJRFRIID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLm91dGxpbmVXaWR0aDsgLy8gMSBleHRyYSBweCBmb3IgYm9yZGVyICh3ZSBkb24ndCB3YW50IHRvIGJlIGFibGUgdG8gc2VlIHRoZSBjZWxsIGJvcmRlciB3aGVuIHNjcm9sbGluZyB1cCk7XG5cdFx0Y29uc3QgU1RBVFVTQkFSX0hFSUdIVCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5zdGF0dXNCYXJIZWlnaHQ7XG5cblxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvcjtcblx0XHRjb25zdCBlZGl0b3JMYXlvdXQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdC8vIElmIHdlJ3ZlIGFscmVhZHkgaW5pdGlhbGl6ZWQgb25jZSwgd2Ugc2hvdWxkIHVzZSB0aGUgdmlld0NlbGwgbGF5b3V0IGluZm8gZm9yIGVkaXRvciB3aWR0aC5cblx0XHQvLyBFLmcuIHdoZW4gcmVzaXppbmcgVlMgQ29kZSB3aW5kb3cgb3Igbm90ZWJvb2sgZWRpdG9yIChob3Jpem9udGFsIHNwYWNlIGNoYW5nZXMpLlxuXHRcdGNvbnN0IGVkaXRvcldpZHRoID0gdGhpcy5faW5pdGlhbGl6ZWQgJiYgKHJlYXNvbiA9PT0gJ25iTGF5b3V0Q2hhbmdlJyB8fCByZWFzb24gPT09ICd2aWV3Q2VsbExheW91dENoYW5nZScpID8gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRoIDogZWRpdG9yTGF5b3V0LndpZHRoO1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQ7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5ub3RlYm9va0VkaXRvci5zY3JvbGxUb3A7XG5cdFx0Y29uc3QgZWxlbWVudFRvcCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQodGhpcy52aWV3Q2VsbCk7XG5cdFx0Y29uc3QgZWxlbWVudEJvdHRvbSA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQodGhpcy52aWV3Q2VsbCk7XG5cdFx0Y29uc3QgZWxlbWVudEhlaWdodCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0SGVpZ2h0T2ZFbGVtZW50KHRoaXMudmlld0NlbGwpO1xuXHRcdGxldCBlZGl0b3JDb250ZW50SGVpZ2h0OiBudW1iZXI7XG5cdFx0Y29uc3QgaXNJbml0ID0gIXRoaXMuX2luaXRpYWxpemVkICYmIHJlYXNvbiA9PT0gJ2luaXQnO1xuXHRcdGlmIChpc0luaXQpIHtcblx0XHRcdC8vIENPTlRFTlQgSEVJR0hUIFNFTEVDVElPTiAoSU5JVClcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdC8vIEVkaXRvcnMgYXJlIHBvb2xlZCBhbmQgbWF5IGJlIHJlLWF0dGFjaGVkIHRvIGRpZmZlcmVudCBjZWxscyBhcyB0aGUgdXNlciBzY3JvbGxzLlxuXHRcdFx0Ly8gQXQgdGhlIG1vbWVudCBhIHBvb2xlZCBlZGl0b3IgaXMgZmlyc3QgYXR0YWNoZWQgdG8gYSBuZXcgY2VsbCwgTW9uYWNvIGNhbiBzdGlsbFxuXHRcdFx0Ly8gcmVwb3J0IHRoZSBwcmV2aW91cyBjZWxsJ3MgYGdldENvbnRlbnRIZWlnaHQoKWAgKGZvciBleGFtcGxlIGEgdGFsbCBtdWx0aS1saW5lXG5cdFx0XHQvLyBjZWxsKSBldmVuIHRob3VnaCB0aGUgbmV3IGNlbGwgb25seSBjb250YWlucyBhIHNpbmdsZSBsaW5lLiBJZiB3ZSB0cnVzdGVkIHRoYXRcblx0XHRcdC8vIHN0YWxlIHZhbHVlIGhlcmUsIHRoZSB2ZXJ5IGZpcnN0IGxheW91dCBvZiB0aGUgbmV3IGNlbGwgd291bGQgcmVuZGVyIHdpdGggYW5cblx0XHRcdC8vIG92ZXJzaXplZCBlZGl0b3IgYW5kIHZpc3VhbGx5IG92ZXJsYXAgdGhlIG5leHQgY2VsbC5cblx0XHRcdC8vXG5cdFx0XHQvLyBUbyBhdm9pZCB0aGlzLCB0aGUgaW5pdGlhbCBsYXlvdXQgaWdub3JlcyBgZ2V0Q29udGVudEhlaWdodCgpYCBlbnRpcmVseSBhbmQgdXNlc1xuXHRcdFx0Ly8gdGhlIG5vdGVib29rJ3Mgb3duIG5vdGlvbiBvZiB0aGUgZWRpdG9yIGhlaWdodCBmb3IgdGhpcyBjZWxsXG5cdFx0XHQvLyAoYF9pbml0aWFsRWRpdG9yRGltZW5zaW9uLmhlaWdodGApLiBUaGlzIHZhbHVlIGlzIGRlcml2ZWQgZnJvbSB0aGUgY2VsbCBtb2RlbFxuXHRcdFx0Ly8gKGxpbmUgY291bnQgKyBwYWRkaW5nKSBhbmQgaXMgc3RhYmxlIGFjcm9zcyBlZGl0b3IgcmV1c2UuIE9uY2UgdGhlIG1vZGVsIGhhc1xuXHRcdFx0Ly8gYmVlbiByZXNvbHZlZCBhbmQgTW9uYWNvIHJlcG9ydHMgYSByZWFsIGNvbnRlbnQgaGVpZ2h0LCBzdWJzZXF1ZW50IGxheW91dFxuXHRcdFx0Ly8gcmVhc29ucyAoYG9uRGlkQ29udGVudFNpemVDaGFuZ2VgLCBgdmlld0NlbGxMYXlvdXRDaGFuZ2VgLCBgbmJMYXlvdXRDaGFuZ2VgKVxuXHRcdFx0Ly8gd2lsbCByZWZyZXNoIGBfZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0YCBpbiB0aGUgbm9ybWFsIHdheS5cblx0XHRcdGVkaXRvckNvbnRlbnRIZWlnaHQgPSB0aGlzLl9pbml0aWFsRWRpdG9yRGltZW5zaW9uLmhlaWdodDtcblx0XHRcdHRoaXMuX2VzdGFibGlzaGVkQ29udGVudEhlaWdodCA9IGVkaXRvckNvbnRlbnRIZWlnaHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIENPTlRFTlQgSEVJR0hUIFNFTEVDVElPTiAoTk9OLUlOSVQpXG5cdFx0XHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdFx0Ly8gRm9yIGFsbCBub24taW5pdCByZWFzb25zLCB3ZSByZWx5IG9uIE1vbmFjbydzIGBnZXRDb250ZW50SGVpZ2h0KClgIHRvZ2V0aGVyIHdpdGhcblx0XHRcdC8vIGBfZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0YCB0byBrZWVwIHRoZSBub3RlYm9vayBsaXN0IGxheW91dCBzdGFibGUgd2hpbGVcblx0XHRcdC8vIHNjcm9sbGluZyBhbmQgcmVzaXppbmc6XG5cdFx0XHQvLyAgLSBgb25EaWRDb250ZW50U2l6ZUNoYW5nZWAgLyBgdmlld0NlbGxMYXlvdXRDaGFuZ2VgIC8gYG5iTGF5b3V0Q2hhbmdlYCB1cGRhdGVcblx0XHRcdC8vICAgIGBfZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0YCB0byB0aGUgbGF0ZXN0IGZ1bGwgY29udGVudCBoZWlnaHQuXG5cdFx0XHQvLyAgLSBgbmJEaWRTY3JvbGxgIHJldXNlcyBgX2VzdGFibGlzaGVkQ29udGVudEhlaWdodGAgc28gdGhhdCB0cmFuc2llbnQsIHNtYWxsZXJcblx0XHRcdC8vICAgIHZhbHVlcyByZXBvcnRlZCB3aGlsZSB0aGUgZWRpdG9yIGl0c2VsZiBpcyBjbGlwcGVkIGRvIG5vdCBzaHJpbmsgdGhlIHJvd1xuXHRcdFx0Ly8gICAgaGVpZ2h0ICh3aGljaCB3b3VsZCBvdGhlcndpc2UgY2F1c2Ugb3ZlcmxhcHBpbmcgY2VsbHMpLlxuXHRcdFx0Y29uc3QgZ290Q29udGVudEhlaWdodCA9IGVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHQvLyBJZiB3ZSd2ZSBhbHJlYWR5IGNhbGN1bGF0ZWQgdGhlIGVkaXRvciBjb250ZW50IGhlaWdodCBvbmNlIGJlZm9yZSBhbmQgdGhlIGNvbnRlbnRzIGhhdmVuJ3QgY2hhbmdlZCwgdXNlIHRoYXQuXG5cdFx0XHRjb25zdCBmYWxsYmFja0VkaXRvckNvbnRlbnRIZWlnaHQgPSBnb3RDb250ZW50SGVpZ2h0ID09PSAtMSA/IE1hdGgubWF4KGVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0LCB0aGlzLl9pbml0aWFsRWRpdG9yRGltZW5zaW9uLmhlaWdodCkgOiBnb3RDb250ZW50SGVpZ2h0O1xuXHRcdFx0Y29uc3Qgc2hvdWxkUmVmcmVzaENvbnRlbnRIZWlnaHQgPSAhdGhpcy5faW5pdGlhbGl6ZWQgfHwgcmVhc29uID09PSAnb25EaWRDb250ZW50U2l6ZUNoYW5nZScgfHwgcmVhc29uID09PSAndmlld0NlbGxMYXlvdXRDaGFuZ2UnIHx8IHJlYXNvbiA9PT0gJ25iTGF5b3V0Q2hhbmdlJztcblx0XHRcdGlmIChzaG91bGRSZWZyZXNoQ29udGVudEhlaWdodCkge1xuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGVzdGFibGlzaGVkIGNvbnRlbnQgaGVpZ2h0IHdoZW4gY29udGVudCBjaGFuZ2VzLCBkdXJpbmcgaW5pdGlhbGl6YXRpb24sXG5cdFx0XHRcdC8vIG9yIHdoZW4gd2lkdGgvbGF5b3V0IGNoYW5nZXMgY2FuIGFmZmVjdCB3cmFwcGluZy1kcml2ZW4gaGVpZ2h0LlxuXHRcdFx0XHRlZGl0b3JDb250ZW50SGVpZ2h0ID0gZmFsbGJhY2tFZGl0b3JDb250ZW50SGVpZ2h0O1xuXHRcdFx0XHR0aGlzLl9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHQgPSBlZGl0b3JDb250ZW50SGVpZ2h0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUmV1c2UgdGhlIHByZXZpb3VzbHkgZXN0YWJsaXNoZWQgY29udGVudCBoZWlnaHQgdG8gYXZvaWQgdHJhbnNpZW50IE1vbmFjbyBjb250ZW50IGhlaWdodCBjaGFuZ2VzIGR1cmluZyBzY3JvbGxcblx0XHRcdFx0ZWRpdG9yQ29udGVudEhlaWdodCA9IHRoaXMuX2VzdGFibGlzaGVkQ29udGVudEhlaWdodCA/PyBmYWxsYmFja0VkaXRvckNvbnRlbnRIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRvckJvdHRvbSA9IGVsZW1lbnRUb3AgKyB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0Q29udGFpbmVyT2Zmc2V0O1xuXHRcdGNvbnN0IHNjcm9sbEJvdHRvbSA9IHRoaXMubm90ZWJvb2tFZGl0b3Iuc2Nyb2xsQm90dG9tO1xuXHRcdC8vIFdoZW4gbG9hZGluZywgc2Nyb2xsQm90dG9tIC1zY3JvbGxUb3AgPT09IDA7XG5cdFx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSBzY3JvbGxCb3R0b20gLSBzY3JvbGxUb3AgPT09IDAgPyB0aGlzLm5vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQgOiBzY3JvbGxCb3R0b20gLSBzY3JvbGxUb3A7XG5cdFx0Y29uc3Qgb3V0cHV0Q29udGFpbmVyT2Zmc2V0ID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLm91dHB1dENvbnRhaW5lck9mZnNldDtcblx0XHRjb25zdCBzY3JvbGxEaXJlY3Rpb246ICdkb3duJyB8ICd1cCcgPSB0eXBlb2YgdGhpcy5fcHJldmlvdXNTY3JvbGxCb3R0b20gPT09ICdudW1iZXInID8gKHNjcm9sbEJvdHRvbSA8IHRoaXMuX3ByZXZpb3VzU2Nyb2xsQm90dG9tID8gJ3VwJyA6ICdkb3duJykgOiAnZG93bic7XG5cdFx0dGhpcy5fcHJldmlvdXNTY3JvbGxCb3R0b20gPSBzY3JvbGxCb3R0b207XG5cblx0XHRsZXQgdG9wID0gTWF0aC5tYXgoMCwgc2Nyb2xsVG9wIC0gZWxlbWVudFRvcCAtIENFTExfVE9QX01BUkdJTiAtIENFTExfT1VUTElORV9XSURUSCk7XG5cdFx0Y29uc3QgcG9zc2libGVFZGl0b3JIZWlnaHQgPSBlZGl0b3JIZWlnaHQgLSB0b3A7XG5cdFx0aWYgKHBvc3NpYmxlRWRpdG9ySGVpZ2h0IDwgTElORV9IRUlHSFQpIHtcblx0XHRcdHRvcCA9IHRvcCAtIChMSU5FX0hFSUdIVCAtIHBvc3NpYmxlRWRpdG9ySGVpZ2h0KSAtIENFTExfT1VUTElORV9XSURUSDtcblx0XHR9XG5cblx0XHRsZXQgaGVpZ2h0ID0gZWRpdG9yQ29udGVudEhlaWdodDtcblx0XHRsZXQgZWRpdG9yU2Nyb2xsVG9wID0gMDtcblx0XHRpZiAoc2Nyb2xsVG9wIDw9IChlbGVtZW50VG9wICsgQ0VMTF9UT1BfTUFSR0lOKSkge1xuXHRcdFx0Y29uc3QgbWluaW11bUVkaXRvckhlaWdodCA9IExJTkVfSEVJR0hUICsgdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpLmVkaXRvclRvcFBhZGRpbmc7XG5cdFx0XHRpZiAoc2Nyb2xsQm90dG9tID49IGVkaXRvckJvdHRvbSkge1xuXHRcdFx0XHRoZWlnaHQgPSBjbGFtcChlZGl0b3JDb250ZW50SGVpZ2h0LCBtaW5pbXVtRWRpdG9ySGVpZ2h0LCBlZGl0b3JDb250ZW50SGVpZ2h0KTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yVmlzaWJpbGl0eSA9ICdGdWxsJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhlaWdodCA9IGNsYW1wKHNjcm9sbEJvdHRvbSAtIChlbGVtZW50VG9wICsgQ0VMTF9UT1BfTUFSR0lOKSAtIFNUQVRVU0JBUl9IRUlHSFQsIG1pbmltdW1FZGl0b3JIZWlnaHQsIGVkaXRvckNvbnRlbnRIZWlnaHQpICsgKDIgKiBDRUxMX09VVExJTkVfV0lEVEgpOyAvLyBXZSBkb24ndCB3YW50IGJvdHRvbSBib3JkZXIgdG8gYmUgdmlzaWJsZS47XG5cdFx0XHRcdHRoaXMuX2VkaXRvclZpc2liaWxpdHkgPSAnQm90dG9tIENsaXBwZWQnO1xuXHRcdFx0XHRlZGl0b3JTY3JvbGxUb3AgPSAwO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmlld3BvcnRIZWlnaHQgPD0gZWRpdG9yQ29udGVudEhlaWdodCAmJiBzY3JvbGxCb3R0b20gPD0gZWRpdG9yQm90dG9tKSB7XG5cdFx0XHRcdGNvbnN0IG1pbmltdW1FZGl0b3JIZWlnaHQgPSBMSU5FX0hFSUdIVCArIHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKS5lZGl0b3JUb3BQYWRkaW5nO1xuXHRcdFx0XHRoZWlnaHQgPSBjbGFtcCh2aWV3cG9ydEhlaWdodCAtIFNUQVRVU0JBUl9IRUlHSFQsIG1pbmltdW1FZGl0b3JIZWlnaHQsIGVkaXRvckNvbnRlbnRIZWlnaHQgLSBTVEFUVVNCQVJfSEVJR0hUKSArICgyICogQ0VMTF9PVVRMSU5FX1dJRFRIKTsgLy8gV2UgZG9uJ3Qgd2FudCBib3R0b20gYm9yZGVyIHRvIGJlIHZpc2libGUuXG5cdFx0XHRcdHRoaXMuX2VkaXRvclZpc2liaWxpdHkgPSAnRnVsbCAoU21hbGwgVmlld3BvcnQpJztcblx0XHRcdFx0ZWRpdG9yU2Nyb2xsVG9wID0gdG9wO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbWluaW11bUVkaXRvckhlaWdodCA9IExJTkVfSEVJR0hUO1xuXHRcdFx0XHRoZWlnaHQgPSBjbGFtcChlZGl0b3JDb250ZW50SGVpZ2h0IC0gKHNjcm9sbFRvcCAtIChlbGVtZW50VG9wICsgQ0VMTF9UT1BfTUFSR0lOKSksIG1pbmltdW1FZGl0b3JIZWlnaHQsIGVkaXRvckNvbnRlbnRIZWlnaHQpO1xuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgY2VsbCBpcyB2aXNpYmxlLlxuXHRcdFx0XHRpZiAoc2Nyb2xsVG9wID4gZWRpdG9yQm90dG9tKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yVmlzaWJpbGl0eSA9ICdJbnZpc2libGUnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvclZpc2liaWxpdHkgPSAnVG9wIENsaXBwZWQnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVkaXRvclNjcm9sbFRvcCA9IGVkaXRvckNvbnRlbnRIZWlnaHQgLSBoZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgJHtyZWFzb259ICgke3RoaXMuX2VkaXRvclZpc2liaWxpdHl9LCAke3RoaXMuX2luaXRpYWxpemVkfSlgKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGA9PiBFZGl0b3IgVG9wID0gJHt0b3B9cHggKGVkaXRIZWlnaHQgPSAke2VkaXRvckhlaWdodH0sIGVkaXRDb250ZW50SGVpZ2h0OiAke2VkaXRvckNvbnRlbnRIZWlnaHR9KWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYD0+IGVsZVRvcCA9ICR7ZWxlbWVudFRvcH0sIGVsZUJvdHRvbSA9ICR7ZWxlbWVudEJvdHRvbX0sIGVsZUhlaWdodCA9ICR7ZWxlbWVudEhlaWdodH1gKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGA9PiBzY3JvbGxUb3AgPSAke3Njcm9sbFRvcH0sIHRvcCA9ICR7dG9wfWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYD0+IGNlbGxUb3BNYXJnaW4gPSAke0NFTExfVE9QX01BUkdJTn0sIGNlbGxCb3R0b21NYXJnaW4gPSAke3RoaXMudmlld0NlbGwubGF5b3V0SW5mby50b3BNYXJnaW59LCBjZWxsT3V0bGluZSA9ICR7Q0VMTF9PVVRMSU5FX1dJRFRIfWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYD0+IHNjcm9sbEJvdHRvbTogJHtzY3JvbGxCb3R0b219LCBlZGl0Qm90dG9tOiAke2VkaXRvckJvdHRvbX0sIHZpZXdwb3J0OiAke3ZpZXdwb3J0SGVpZ2h0fSwgc2Nyb2xsOiAke3Njcm9sbERpcmVjdGlvbn0sIGNvbnRPZmZzZXQ6ICR7b3V0cHV0Q29udGFpbmVyT2Zmc2V0fSlgKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGA9PiBFZGl0b3IgSGVpZ2h0ID0gJHtoZWlnaHR9cHgsIFdpZHRoOiAke2VkaXRvcldpZHRofXB4LCBJbml0aWFsIFdpZHRoOiAke3RoaXMuX2luaXRpYWxFZGl0b3JEaW1lbnNpb24ud2lkdGh9LCBFZGl0b3JTY3JvbGxUb3AgPSAke2VkaXRvclNjcm9sbFRvcH1weCwgU3RhdHVzYmFySGVpZ2h0ID0gJHtTVEFUVVNCQVJfSEVJR0hUfSwgbGluZUhlaWdodCA9ICR7dGhpcy5ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkuZm9udEluZm8ubGluZUhlaWdodH1gKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pc1VwZGF0aW5nTGF5b3V0ID0gdHJ1ZTtcblx0XHRcdGVsZW1lbnQuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdGVkaXRvci5sYXlvdXQoe1xuXHRcdFx0XHR3aWR0aDogdGhpcy5faW5pdGlhbGl6ZWQgPyBlZGl0b3JXaWR0aCA6IHRoaXMuX2luaXRpYWxFZGl0b3JEaW1lbnNpb24ud2lkdGgsXG5cdFx0XHRcdGhlaWdodFxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0XHQvLyBPcHRpb24gMzogQXZvaWQgcHJvZ3JhbW1hdGljIHNjcm9sbFRvcCBjaGFuZ2VzIHdoaWxlIHVzZXIgaXMgYWN0aXZlbHkgZHJhZ2dpbmcgc2VsZWN0aW9uXG5cdFx0XHRpZiAoIXRoaXMuX3BvaW50ZXJEb3duICYmIGVkaXRvclNjcm9sbFRvcCA+PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wID0gZWRpdG9yU2Nyb2xsVG9wO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKGVkaXRvclNjcm9sbFRvcCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2lzVXBkYXRpbmdMYXlvdXQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1VwZGF0ZWQgRWRpdG9yIExheW91dCcpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGFBQWE7QUFDdEIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZUFBZSxvQ0FBbUU7QUFDM0YsU0FBNEIsMEJBQTBCO0FBR3RELFNBQWlDLDZCQUE2QjtBQUM5RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNDQUFzQztBQUMv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
