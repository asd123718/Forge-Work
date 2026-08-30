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
import * as DOM from "../../../../../../base/browser/dom.js";
import * as domSanitize from "../../../../../../base/browser/domSanitize.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { disposableTimeout, raceCancellation } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { tokenizeToStringSync } from "../../../../../../editor/common/languages/textToHtmlTokenizer.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { CellEditState, CellFocusMode, CellFoldingState, EXPAND_CELL_INPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { collapsedIcon, expandedIcon } from "../../notebookIcons.js";
import { CellEditorOptions } from "./cellEditorOptions.js";
import { collapsedCellTTPolicy } from "../notebookRenderingCommon.js";
import { WordHighlighterContribution } from "../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js";
let MarkupCell = class extends Disposable {
  constructor(notebookEditor, viewCell, templateData, renderedEditors, accessibilityService, contextKeyService, instantiationService, languageService, configurationService, keybindingService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this.renderedEditors = renderedEditors;
    this.accessibilityService = accessibilityService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.editor = null;
    this.localDisposables = this._register(new DisposableStore());
    this.focusSwitchDisposable = this._register(new MutableDisposable());
    this.editorDisposables = this._register(new DisposableStore());
    this._isDisposed = false;
    this.constructDOM();
    this.editorPart = templateData.editorPart;
    this.cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
    this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
    this.editorOptions = this.cellEditorOptions.getValue(this.viewCell.internalMetadata, this.viewCell.uri);
    this._register(toDisposable(() => renderedEditors.delete(this.viewCell)));
    this.registerListeners();
    this.templateData.cellParts.scheduleRenderCell(this.viewCell);
    this._register(toDisposable(() => {
      this.templateData.cellParts.unrenderCell(this.viewCell);
    }));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
      this.viewUpdate();
    }));
    this.updateForHover();
    this.updateForFocusModeChange();
    this.foldingState = viewCell.foldingState;
    this.layoutFoldingIndicator();
    this.updateFoldingIconShowClass();
    if (this.viewCell.layoutInfo.totalHeight > 0) {
      this.relayoutCell();
    }
    this.viewUpdate();
    this.layoutCellParts();
    this._register(this.viewCell.onDidChangeLayout(() => {
      this.layoutCellParts();
    }));
  }
  layoutCellParts() {
    this.templateData.cellParts.updateInternalLayoutNow(this.viewCell);
  }
  constructDOM() {
    const id = `aria-markup-cell-${this.viewCell.id}`;
    this.markdownAccessibilityContainer = this.templateData.cellContainer;
    this.markdownAccessibilityContainer.id = id;
    this.markdownAccessibilityContainer.style.height = "1px";
    this.markdownAccessibilityContainer.style.overflow = "hidden";
    this.markdownAccessibilityContainer.style.position = "absolute";
    this.markdownAccessibilityContainer.style.top = "100000px";
    this.markdownAccessibilityContainer.style.left = "10000px";
    this.markdownAccessibilityContainer.ariaHidden = "false";
    this.templateData.rootContainer.setAttribute("aria-describedby", id);
    this.templateData.container.classList.toggle("webview-backed-markdown-cell", true);
  }
  registerListeners() {
    this._register(this.viewCell.onDidChangeState((e) => {
      this.templateData.cellParts.updateState(this.viewCell, e);
    }));
    this._register(this.viewCell.model.onDidChangeMetadata(() => {
      this.viewUpdate();
    }));
    this._register(this.viewCell.onDidChangeState((e) => {
      if (e.editStateChanged || e.contentChanged) {
        this.viewUpdate();
      }
      if (e.focusModeChanged) {
        this.updateForFocusModeChange();
      }
      if (e.foldingStateChanged) {
        const foldingState = this.viewCell.foldingState;
        if (foldingState !== this.foldingState) {
          this.foldingState = foldingState;
          this.layoutFoldingIndicator();
        }
      }
      if (e.cellIsHoveredChanged) {
        this.updateForHover();
      }
      if (e.inputCollapsedChanged) {
        this.updateCollapsedState();
        this.viewUpdate();
      }
      if (e.cellLineNumberChanged) {
        this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
      }
    }));
    this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
      if (e.showFoldingControls) {
        this.updateFoldingIconShowClass();
      }
    }));
    this._register(this.viewCell.onDidChangeLayout((e) => {
      const layoutInfo = this.editor?.getLayoutInfo();
      if (e.outerWidth && this.viewCell.getEditState() === CellEditState.Editing && layoutInfo && layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
        this.onCellEditorWidthChange();
      }
    }));
    this._register(this.cellEditorOptions.onDidChange(() => this.updateMarkupCellOptions()));
  }
  updateMarkupCellOptions() {
    this.updateEditorOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
    if (this.editor) {
      this.editor.updateOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
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
            indentSize: this.cellEditorOptions.indentSize,
            tabSize: this.cellEditorOptions.tabSize,
            insertSpaces: this.cellEditorOptions.insertSpaces
          });
        }
      });
    }
  }
  updateCollapsedState() {
    if (this.viewCell.isInputCollapsed) {
      this.notebookEditor.hideMarkupPreviews([this.viewCell]);
    } else {
      this.notebookEditor.unhideMarkupPreviews([this.viewCell]);
    }
  }
  updateForHover() {
    this.templateData.container.classList.toggle("markdown-cell-hover", this.viewCell.cellIsHovered);
  }
  updateForFocusModeChange() {
    if (this.viewCell.focusMode === CellFocusMode.Editor) {
      this.focusEditorIfNeeded();
    }
    this.templateData.container.classList.toggle("cell-editor-focus", this.viewCell.focusMode === CellFocusMode.Editor);
  }
  dispose() {
    this._isDisposed = true;
    if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
      this.notebookEditor.focusContainer();
    }
    this.viewCell.detachTextEditor();
    super.dispose();
  }
  updateFoldingIconShowClass() {
    const showFoldingIcon = this.notebookEditor.notebookOptions.getDisplayOptions().showFoldingControls;
    this.templateData.foldingIndicator.classList.remove("mouseover", "always");
    this.templateData.foldingIndicator.classList.add(showFoldingIcon);
  }
  viewUpdate() {
    if (this.viewCell.isInputCollapsed) {
      this.viewUpdateCollapsed();
    } else if (this.viewCell.getEditState() === CellEditState.Editing) {
      this.viewUpdateEditing();
    } else {
      this.viewUpdatePreview();
    }
  }
  viewUpdateCollapsed() {
    DOM.show(this.templateData.cellInputCollapsedContainer);
    DOM.hide(this.editorPart);
    this.templateData.cellInputCollapsedContainer.innerText = "";
    const markdownIcon = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$("span"));
    markdownIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.markdown));
    const element = DOM.$("div");
    element.classList.add("cell-collapse-preview");
    const richEditorText = this.getRichText(this.viewCell.textBuffer, this.viewCell.language);
    element.innerText = richEditorText;
    element.innerHTML = collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText;
    this.templateData.cellInputCollapsedContainer.appendChild(element);
    const expandIcon = DOM.append(element, DOM.$("span.expandInputIcon"));
    expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
    const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
    if (keybinding) {
      element.title = localize("cellExpandInputButtonLabelWithDoubleClick", "Double-click to expand cell input ({0})", keybinding.getLabel());
      expandIcon.title = localize("cellExpandInputButtonLabel", "Expand Cell Input ({0})", keybinding.getLabel());
    }
    this.markdownAccessibilityContainer.ariaHidden = "true";
    this.templateData.container.classList.toggle("input-collapsed", true);
    this.viewCell.renderedMarkdownHeight = 0;
    this.viewCell.layoutChange({});
  }
  getRichText(buffer, language) {
    return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
  }
  viewUpdateEditing() {
    let editorHeight;
    DOM.show(this.editorPart);
    this.markdownAccessibilityContainer.ariaHidden = "true";
    DOM.hide(this.templateData.cellInputCollapsedContainer);
    this.notebookEditor.hideMarkupPreviews([this.viewCell]);
    this.templateData.container.classList.toggle("input-collapsed", false);
    this.templateData.container.classList.toggle("markdown-cell-edit-mode", true);
    if (this.editor && this.editor.hasModel()) {
      editorHeight = this.editor.getContentHeight();
      this.viewCell.attachTextEditor(this.editor);
      this.focusEditorIfNeeded();
      this.bindEditorListeners(this.editor);
      this.editor.layout({
        width: this.viewCell.layoutInfo.editorWidth,
        height: editorHeight
      });
    } else {
      this.editorDisposables.clear();
      const width = this.notebookEditor.notebookOptions.computeMarkdownCellEditorWidth(this.notebookEditor.getLayoutInfo().width);
      const lineNum = this.viewCell.lineCount;
      const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
      const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
      editorHeight = Math.max(lineNum, 1) * lineHeight + editorPadding.top + editorPadding.bottom;
      this.templateData.editorContainer.innerText = "";
      const editorContextKeyService = this.contextKeyService.createScoped(this.templateData.editorPart);
      EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
      const editorInstaService = this.editorDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
      this.editorDisposables.add(editorContextKeyService);
      this.editor = this.editorDisposables.add(editorInstaService.createInstance(CodeEditorWidget, this.templateData.editorContainer, {
        ...this.editorOptions,
        dimension: {
          width,
          height: editorHeight
        },
        allowVariableLineHeights: false
        // overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
      }, {
        contributions: this.notebookEditor.creationOptions.cellEditorContributions
      }));
      this.templateData.currentEditor = this.editor;
      this.editorDisposables.add(this.editor.onDidBlurEditorWidget(() => {
        if (this.editor) {
          WordHighlighterContribution.get(this.editor)?.stopHighlighting();
        }
      }));
      this.editorDisposables.add(this.editor.onDidFocusEditorWidget(() => {
        if (this.editor) {
          WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
        }
      }));
      const cts = new CancellationTokenSource();
      this.editorDisposables.add({ dispose() {
        cts.dispose(true);
      } });
      raceCancellation(this.viewCell.resolveTextModel(), cts.token).then((model) => {
        if (!model) {
          return;
        }
        this.editor.setModel(model);
        model.updateOptions({
          indentSize: this.cellEditorOptions.indentSize,
          tabSize: this.cellEditorOptions.tabSize,
          insertSpaces: this.cellEditorOptions.insertSpaces
        });
        const realContentHeight = this.editor.getContentHeight();
        if (realContentHeight !== editorHeight) {
          this.editor.layout(
            {
              width,
              height: realContentHeight
            }
          );
          editorHeight = realContentHeight;
        }
        this.viewCell.attachTextEditor(this.editor);
        if (this.viewCell.getEditState() === CellEditState.Editing) {
          this.focusEditorIfNeeded();
        }
        this.bindEditorListeners(this.editor);
        this.viewCell.editorHeight = editorHeight;
      });
    }
    this.viewCell.editorHeight = editorHeight;
    this.focusEditorIfNeeded();
    this.renderedEditors.set(this.viewCell, this.editor);
  }
  viewUpdatePreview() {
    this.viewCell.detachTextEditor();
    DOM.hide(this.editorPart);
    DOM.hide(this.templateData.cellInputCollapsedContainer);
    this.markdownAccessibilityContainer.ariaHidden = "false";
    this.templateData.container.classList.toggle("input-collapsed", false);
    this.templateData.container.classList.toggle("markdown-cell-edit-mode", false);
    this.renderedEditors.delete(this.viewCell);
    this.markdownAccessibilityContainer.innerText = "";
    if (this.viewCell.renderedHtml) {
      if (this.accessibilityService.isScreenReaderOptimized()) {
        domSanitize.safeSetInnerHtml(this.markdownAccessibilityContainer, this.viewCell.renderedHtml);
      } else {
        DOM.clearNode(this.markdownAccessibilityContainer);
      }
    }
    this.notebookEditor.createMarkupPreview(this.viewCell);
  }
  focusEditorIfNeeded() {
    if (this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
      if (!this.editor) {
        return;
      }
      this.editor.focus();
      const primarySelection = this.editor.getSelection();
      if (!primarySelection) {
        return;
      }
      this.notebookEditor.revealRangeInViewAsync(this.viewCell, primarySelection);
    }
  }
  layoutEditor(dimension) {
    this.editor?.layout(dimension);
  }
  onCellEditorWidthChange() {
    const realContentHeight = this.editor.getContentHeight();
    this.layoutEditor(
      {
        width: this.viewCell.layoutInfo.editorWidth,
        height: realContentHeight
      }
    );
  }
  relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
    this.layoutFoldingIndicator();
  }
  updateEditorOptions(newValue) {
    this.editorOptions = newValue;
    this.editor?.updateOptions(this.editorOptions);
  }
  layoutFoldingIndicator() {
    switch (this.foldingState) {
      case CellFoldingState.None:
        this.templateData.foldingIndicator.style.display = "none";
        this.templateData.foldingIndicator.innerText = "";
        break;
      case CellFoldingState.Collapsed:
        this.templateData.foldingIndicator.style.display = "";
        DOM.reset(this.templateData.foldingIndicator, renderIcon(collapsedIcon));
        break;
      case CellFoldingState.Expanded:
        this.templateData.foldingIndicator.style.display = "";
        DOM.reset(this.templateData.foldingIndicator, renderIcon(expandedIcon));
        break;
      default:
        break;
    }
  }
  bindEditorListeners(editor) {
    this.localDisposables.clear();
    this.focusSwitchDisposable.clear();
    this.localDisposables.add(editor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        this.onCellEditorHeightChange(editor, e.contentHeight);
      }
    }));
    this.localDisposables.add(editor.onDidChangeCursorSelection((e) => {
      if (e.source === "restoreState") {
        return;
      }
      const selections = editor.getSelections();
      if (selections?.length) {
        const contentHeight = editor.getContentHeight();
        const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;
        if (contentHeight !== layoutContentHeight) {
          this.onCellEditorHeightChange(editor, contentHeight);
        }
        const lastSelection = selections[selections.length - 1];
        this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
      }
    }));
    const updateFocusMode = () => this.viewCell.focusMode = editor.hasWidgetFocus() ? CellFocusMode.Editor : CellFocusMode.Container;
    this.localDisposables.add(editor.onDidFocusEditorWidget(() => {
      updateFocusMode();
    }));
    this.localDisposables.add(editor.onDidBlurEditorWidget(() => {
      if (this.templateData.container.ownerDocument.activeElement?.contains(this.templateData.container)) {
        this.focusSwitchDisposable.value = disposableTimeout(() => updateFocusMode(), 300);
      } else {
        updateFocusMode();
      }
    }));
    updateFocusMode();
  }
  onCellEditorHeightChange(editor, newHeight) {
    const viewLayout = editor.getLayoutInfo();
    this.viewCell.editorHeight = newHeight;
    editor.layout(
      {
        width: viewLayout.width,
        height: newHeight
      }
    );
  }
};
MarkupCell = __decorateClass([
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IKeybindingService)
], MarkupCell);
export {
  MarkupCell
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXG1hcmt1cENlbGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TYW5pdGl6ZSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyB0b2tlbml6ZVRvU3RyaW5nU3luYyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3RleHRUb0h0bWxUb2tlbml6ZXIuanMnO1xuaW1wb3J0IHsgSVJlYWRvbmx5VGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgQ2VsbEZvY3VzTW9kZSwgQ2VsbEZvbGRpbmdTdGF0ZSwgRVhQQU5EX0NFTExfSU5QVVRfQ09NTUFORF9JRCwgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIElDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IGNvbGxhcHNlZEljb24sIGV4cGFuZGVkSWNvbiB9IGZyb20gJy4uLy4uL25vdGVib29rSWNvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2NlbGxFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IGNvbGxhcHNlZENlbGxUVFBvbGljeSwgTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGUgfSBmcm9tICcuLi9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL21hcmt1cENlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvd29yZEhpZ2hsaWdodGVyL2Jyb3dzZXIvd29yZEhpZ2hsaWdodGVyLmpzJztcblxuZXhwb3J0IGNsYXNzIE1hcmt1cENlbGwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGVkaXRvcjogQ29kZUVkaXRvcldpZGdldCB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgbWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZWRpdG9yUGFydDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBmb2N1c1N3aXRjaERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGZvbGRpbmdTdGF0ZTogQ2VsbEZvbGRpbmdTdGF0ZTtcblx0cHJpdmF0ZSBjZWxsRWRpdG9yT3B0aW9uczogQ2VsbEVkaXRvck9wdGlvbnM7XG5cdHByaXZhdGUgZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnM7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdDZWxsOiBNYXJrdXBDZWxsVmlld01vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVEYXRhOiBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVkRWRpdG9yczogTWFwPElDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZD4sXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNvbnN0cnVjdERPTSgpO1xuXHRcdHRoaXMuZWRpdG9yUGFydCA9IHRlbXBsYXRlRGF0YS5lZGl0b3JQYXJ0O1xuXHRcdHRoaXMuY2VsbEVkaXRvck9wdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2VsbEVkaXRvck9wdGlvbnModGhpcy5ub3RlYm9va0VkaXRvci5nZXRCYXNlQ2VsbEVkaXRvck9wdGlvbnModmlld0NlbGwubGFuZ3VhZ2UpLCB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuc2V0TGluZU51bWJlcnModGhpcy52aWV3Q2VsbC5saW5lTnVtYmVycyk7XG5cdFx0dGhpcy5lZGl0b3JPcHRpb25zID0gdGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5nZXRWYWx1ZSh0aGlzLnZpZXdDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMudmlld0NlbGwudXJpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiByZW5kZXJlZEVkaXRvcnMuZGVsZXRlKHRoaXMudmlld0NlbGwpKSk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXG5cdFx0Ly8gdXBkYXRlIGZvciBpbml0IHN0YXRlXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY2VsbFBhcnRzLnNjaGVkdWxlUmVuZGVyQ2VsbCh0aGlzLnZpZXdDZWxsKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jZWxsUGFydHMudW5yZW5kZXJDZWxsKHRoaXMudmlld0NlbGwpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy52aWV3VXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVGb3JIb3ZlcigpO1xuXHRcdHRoaXMudXBkYXRlRm9yRm9jdXNNb2RlQ2hhbmdlKCk7XG5cdFx0dGhpcy5mb2xkaW5nU3RhdGUgPSB2aWV3Q2VsbC5mb2xkaW5nU3RhdGU7XG5cdFx0dGhpcy5sYXlvdXRGb2xkaW5nSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy51cGRhdGVGb2xkaW5nSWNvblNob3dDbGFzcygpO1xuXG5cdFx0Ly8gdGhlIG1hcmtkb3duIHByZXZpZXcncyBoZWlnaHQgbWlnaHQgYWxyZWFkeSBiZSB1cGRhdGVkIGFmdGVyIHRoZSByZW5kZXJlciBjYWxscyBgZWxlbWVudC5nZXRIZWlnaHQoKWBcblx0XHRpZiAodGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0ID4gMCkge1xuXHRcdFx0dGhpcy5yZWxheW91dENlbGwoKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdVcGRhdGUoKTtcblxuXHRcdHRoaXMubGF5b3V0Q2VsbFBhcnRzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Q2VsbC5vbkRpZENoYW5nZUxheW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmxheW91dENlbGxQYXJ0cygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGxheW91dENlbGxQYXJ0cygpIHtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jZWxsUGFydHMudXBkYXRlSW50ZXJuYWxMYXlvdXROb3codGhpcy52aWV3Q2VsbCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdERPTSgpIHtcblx0XHQvLyBDcmVhdGUgYW4gZWxlbWVudCB0aGF0IGlzIG9ubHkgdXNlZCB0byBhbm5vdW5jZSBtYXJrdXAgY2VsbCBjb250ZW50IHRvIHNjcmVlbiByZWFkZXJzXG5cdFx0Y29uc3QgaWQgPSBgYXJpYS1tYXJrdXAtY2VsbC0ke3RoaXMudmlld0NlbGwuaWR9YDtcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lciA9IHRoaXMudGVtcGxhdGVEYXRhLmNlbGxDb250YWluZXI7XG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuaWQgPSBpZDtcblx0XHQvLyBIaWRlIHRoZSBlbGVtZW50IGZyb20gbm9uLXNjcmVlbiByZWFkZXJzXG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzFweCc7XG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuc3R5bGUudG9wID0gJzEwMDAwMHB4Jztcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gJzEwMDAwcHgnO1xuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLmFyaWFIaWRkZW4gPSAnZmFsc2UnO1xuXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEucm9vdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpYmVkYnknLCBpZCk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3dlYnZpZXctYmFja2VkLW1hcmtkb3duLWNlbGwnLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Q2VsbC5vbkRpZENoYW5nZVN0YXRlKGUgPT4ge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuY2VsbFBhcnRzLnVwZGF0ZVN0YXRlKHRoaXMudmlld0NlbGwsIGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NlbGwubW9kZWwub25EaWRDaGFuZ2VNZXRhZGF0YSgoKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdVcGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uRGlkQ2hhbmdlU3RhdGUoKGUpID0+IHtcblx0XHRcdGlmIChlLmVkaXRTdGF0ZUNoYW5nZWQgfHwgZS5jb250ZW50Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnZpZXdVcGRhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuZm9jdXNNb2RlQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZvckZvY3VzTW9kZUNoYW5nZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5mb2xkaW5nU3RhdGVDaGFuZ2VkKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdTdGF0ZSA9IHRoaXMudmlld0NlbGwuZm9sZGluZ1N0YXRlO1xuXG5cdFx0XHRcdGlmIChmb2xkaW5nU3RhdGUgIT09IHRoaXMuZm9sZGluZ1N0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2xkaW5nU3RhdGUgPSBmb2xkaW5nU3RhdGU7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRGb2xkaW5nSW5kaWNhdG9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuY2VsbElzSG92ZXJlZENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGb3JIb3ZlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5pbnB1dENvbGxhcHNlZENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb2xsYXBzZWRTdGF0ZSgpO1xuXHRcdFx0XHR0aGlzLnZpZXdVcGRhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuY2VsbExpbmVOdW1iZXJDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuc2V0TGluZU51bWJlcnModGhpcy52aWV3Q2VsbC5saW5lTnVtYmVycyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMub25EaWRDaGFuZ2VPcHRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2hvd0ZvbGRpbmdDb250cm9scykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZvbGRpbmdJY29uU2hvd0NsYXNzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Q2VsbC5vbkRpZENoYW5nZUxheW91dCgoZSkgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuZWRpdG9yPy5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0XHRpZiAoZS5vdXRlcldpZHRoICYmIHRoaXMudmlld0NlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyAmJiBsYXlvdXRJbmZvICYmIGxheW91dEluZm8ud2lkdGggIT09IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aCkge1xuXHRcdFx0XHR0aGlzLm9uQ2VsbEVkaXRvcldpZHRoQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZU1hcmt1cENlbGxPcHRpb25zKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWFya3VwQ2VsbE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JPcHRpb25zKHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuZ2V0VXBkYXRlZFZhbHVlKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpKTtcblxuXHRcdGlmICh0aGlzLmVkaXRvcikge1xuXHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh0aGlzLmNlbGxFZGl0b3JPcHRpb25zLmdldFVwZGF0ZWRWYWx1ZSh0aGlzLnZpZXdDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMudmlld0NlbGwudXJpKSk7XG5cblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlKCkgeyBjdHMuZGlzcG9zZSh0cnVlKTsgfSB9KTtcblx0XHRcdHJhY2VDYW5jZWxsYXRpb24odGhpcy52aWV3Q2VsbC5yZXNvbHZlVGV4dE1vZGVsKCksIGN0cy50b2tlbikudGhlbihtb2RlbCA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0XHRpbmRlbnRTaXplOiB0aGlzLmNlbGxFZGl0b3JPcHRpb25zLmluZGVudFNpemUsXG5cdFx0XHRcdFx0XHR0YWJTaXplOiB0aGlzLmNlbGxFZGl0b3JPcHRpb25zLnRhYlNpemUsXG5cdFx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbGxhcHNlZFN0YXRlKCkge1xuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmlzSW5wdXRDb2xsYXBzZWQpIHtcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuaGlkZU1hcmt1cFByZXZpZXdzKFt0aGlzLnZpZXdDZWxsXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IudW5oaWRlTWFya3VwUHJldmlld3MoW3RoaXMudmlld0NlbGxdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZvckhvdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdtYXJrZG93bi1jZWxsLWhvdmVyJywgdGhpcy52aWV3Q2VsbC5jZWxsSXNIb3ZlcmVkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRm9yRm9jdXNNb2RlQ2hhbmdlKCkge1xuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IpIHtcblx0XHRcdHRoaXMuZm9jdXNFZGl0b3JJZk5lZWRlZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjZWxsLWVkaXRvci1mb2N1cycsIHRoaXMudmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvcik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0Ly8gbW92ZSBmb2N1cyBiYWNrIHRvIHRoZSBjZWxsIGxpc3Qgb3RoZXJ3aXNlIHRoZSBmb2N1cyBnb2VzIHRvIGJvZHlcblx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCkgPT09IHRoaXMudmlld0NlbGwgJiYgdGhpcy52aWV3Q2VsbC5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yICYmICh0aGlzLm5vdGVib29rRWRpdG9yLmhhc0VkaXRvckZvY3VzKCkgfHwgdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmJvZHkpKSB7XG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzQ29udGFpbmVyKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3Q2VsbC5kZXRhY2hUZXh0RWRpdG9yKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb2xkaW5nSWNvblNob3dDbGFzcygpIHtcblx0XHRjb25zdCBzaG93Rm9sZGluZ0ljb24gPSB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLnNob3dGb2xkaW5nQ29udHJvbHM7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuZm9sZGluZ0luZGljYXRvci5jbGFzc0xpc3QucmVtb3ZlKCdtb3VzZW92ZXInLCAnYWx3YXlzJyk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuZm9sZGluZ0luZGljYXRvci5jbGFzc0xpc3QuYWRkKHNob3dGb2xkaW5nSWNvbik7XG5cdH1cblxuXHRwcml2YXRlIHZpZXdVcGRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwuaXNJbnB1dENvbGxhcHNlZCkge1xuXHRcdFx0dGhpcy52aWV3VXBkYXRlQ29sbGFwc2VkKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnZpZXdDZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcpIHtcblx0XHRcdHRoaXMudmlld1VwZGF0ZUVkaXRpbmcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aWV3VXBkYXRlUHJldmlldygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmlld1VwZGF0ZUNvbGxhcHNlZCgpOiB2b2lkIHtcblx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpO1xuXHRcdERPTS5oaWRlKHRoaXMuZWRpdG9yUGFydCk7XG5cblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRjb25zdCBtYXJrZG93bkljb24gPSBET00uYXBwZW5kKHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lciwgRE9NLiQoJ3NwYW4nKSk7XG5cdFx0bWFya2Rvd25JY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5tYXJrZG93bikpO1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IERPTS4kKCdkaXYnKTtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NlbGwtY29sbGFwc2UtcHJldmlldycpO1xuXHRcdGNvbnN0IHJpY2hFZGl0b3JUZXh0ID0gdGhpcy5nZXRSaWNoVGV4dCh0aGlzLnZpZXdDZWxsLnRleHRCdWZmZXIsIHRoaXMudmlld0NlbGwubGFuZ3VhZ2UpO1xuXHRcdGVsZW1lbnQuaW5uZXJUZXh0ID0gcmljaEVkaXRvclRleHQ7XG5cdFx0ZWxlbWVudC5pbm5lckhUTUwgPSAoY29sbGFwc2VkQ2VsbFRUUG9saWN5Py5jcmVhdGVIVE1MKHJpY2hFZGl0b3JUZXh0KSA/PyByaWNoRWRpdG9yVGV4dCkgYXMgc3RyaW5nO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50KTtcblxuXHRcdGNvbnN0IGV4cGFuZEljb24gPSBET00uYXBwZW5kKGVsZW1lbnQsIERPTS4kKCdzcGFuLmV4cGFuZElucHV0SWNvbicpKTtcblx0XHRleHBhbmRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5tb3JlKSk7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhFWFBBTkRfQ0VMTF9JTlBVVF9DT01NQU5EX0lEKTtcblx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0ZWxlbWVudC50aXRsZSA9IGxvY2FsaXplKCdjZWxsRXhwYW5kSW5wdXRCdXR0b25MYWJlbFdpdGhEb3VibGVDbGljaycsIFwiRG91YmxlLWNsaWNrIHRvIGV4cGFuZCBjZWxsIGlucHV0ICh7MH0pXCIsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSk7XG5cdFx0XHRleHBhbmRJY29uLnRpdGxlID0gbG9jYWxpemUoJ2NlbGxFeHBhbmRJbnB1dEJ1dHRvbkxhYmVsJywgXCJFeHBhbmQgQ2VsbCBJbnB1dCAoezB9KVwiLCBrZXliaW5kaW5nLmdldExhYmVsKCkpO1xuXHRcdH1cblxuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLmFyaWFIaWRkZW4gPSAndHJ1ZSc7XG5cblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaW5wdXQtY29sbGFwc2VkJywgdHJ1ZSk7XG5cdFx0dGhpcy52aWV3Q2VsbC5yZW5kZXJlZE1hcmtkb3duSGVpZ2h0ID0gMDtcblx0XHR0aGlzLnZpZXdDZWxsLmxheW91dENoYW5nZSh7fSk7XG5cdH1cblxuXG5cdHByaXZhdGUgZ2V0UmljaFRleHQoYnVmZmVyOiBJUmVhZG9ubHlUZXh0QnVmZmVyLCBsYW5ndWFnZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRva2VuaXplVG9TdHJpbmdTeW5jKHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCBidWZmZXIuZ2V0TGluZUNvbnRlbnQoMSksIGxhbmd1YWdlKTtcblx0fVxuXG5cdHByaXZhdGUgdmlld1VwZGF0ZUVkaXRpbmcoKTogdm9pZCB7XG5cdFx0Ly8gc3dpdGNoIHRvIGVkaXRpbmcgbW9kZVxuXHRcdGxldCBlZGl0b3JIZWlnaHQ6IG51bWJlcjtcblxuXHRcdERPTS5zaG93KHRoaXMuZWRpdG9yUGFydCk7XG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuYXJpYUhpZGRlbiA9ICd0cnVlJztcblx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpO1xuXG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5oaWRlTWFya3VwUHJldmlld3MoW3RoaXMudmlld0NlbGxdKTtcblxuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbnB1dC1jb2xsYXBzZWQnLCBmYWxzZSk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ21hcmtkb3duLWNlbGwtZWRpdC1tb2RlJywgdHJ1ZSk7XG5cblx0XHRpZiAodGhpcy5lZGl0b3IgJiYgdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0ZWRpdG9ySGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpO1xuXG5cdFx0XHQvLyBub3QgZmlyc3QgdGltZSwgd2UgZG9uJ3QgbmVlZCB0byBjcmVhdGUgZWRpdG9yXG5cdFx0XHR0aGlzLnZpZXdDZWxsLmF0dGFjaFRleHRFZGl0b3IodGhpcy5lZGl0b3IpO1xuXHRcdFx0dGhpcy5mb2N1c0VkaXRvcklmTmVlZGVkKCk7XG5cblx0XHRcdHRoaXMuYmluZEVkaXRvckxpc3RlbmVycyh0aGlzLmVkaXRvcik7XG5cblx0XHRcdHRoaXMuZWRpdG9yLmxheW91dCh7XG5cdFx0XHRcdHdpZHRoOiB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGgsXG5cdFx0XHRcdGhlaWdodDogZWRpdG9ySGVpZ2h0XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5jb21wdXRlTWFya2Rvd25DZWxsRWRpdG9yV2lkdGgodGhpcy5ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkud2lkdGgpO1xuXHRcdFx0Y29uc3QgbGluZU51bSA9IHRoaXMudmlld0NlbGwubGluZUNvdW50O1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5mb250SW5mbz8ubGluZUhlaWdodCB8fCAxNztcblx0XHRcdGNvbnN0IGVkaXRvclBhZGRpbmcgPSB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yUGFkZGluZyh0aGlzLnZpZXdDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMudmlld0NlbGwudXJpKTtcblx0XHRcdGVkaXRvckhlaWdodCA9IE1hdGgubWF4KGxpbmVOdW0sIDEpICogbGluZUhlaWdodCArIGVkaXRvclBhZGRpbmcudG9wICsgZWRpdG9yUGFkZGluZy5ib3R0b207XG5cblx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvckNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblxuXHRcdFx0Ly8gY3JlYXRlIGEgc3BlY2lhbCBjb250ZXh0IGtleSBzZXJ2aWNlIHRoYXQgc2V0IHRoZSBpbkNvbXBvc2l0ZUVkaXRvci1jb250ZXh0a2V5XG5cdFx0XHRjb25zdCBlZGl0b3JDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvclBhcnQpO1xuXHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaW5Db21wb3NpdGVFZGl0b3IuYmluZFRvKGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0XHRjb25zdCBlZGl0b3JJbnN0YVNlcnZpY2UgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBlZGl0b3JDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChlZGl0b3JDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdHRoaXMuZWRpdG9yID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoZWRpdG9ySW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvckNvbnRhaW5lciwge1xuXHRcdFx0XHQuLi50aGlzLmVkaXRvck9wdGlvbnMsXG5cdFx0XHRcdGRpbWVuc2lvbjoge1xuXHRcdFx0XHRcdHdpZHRoOiB3aWR0aCxcblx0XHRcdFx0XHRoZWlnaHQ6IGVkaXRvckhlaWdodFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHM6IGZhbHNlLFxuXHRcdFx0XHQvLyBvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiB0aGlzLm5vdGVib29rRWRpdG9yLmdldE92ZXJmbG93Q29udGFpbmVyRG9tTm9kZSgpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbnM6IHRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRpb25PcHRpb25zLmNlbGxFZGl0b3JDb250cmlidXRpb25zXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jdXJyZW50RWRpdG9yID0gdGhpcy5lZGl0b3I7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5lZGl0b3IpIHtcblx0XHRcdFx0XHRXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KHRoaXMuZWRpdG9yKT8uc3RvcEhpZ2hsaWdodGluZygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZWRpdG9yKSB7XG5cdFx0XHRcdFx0V29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldCh0aGlzLmVkaXRvcik/LnJlc3RvcmVWaWV3U3RhdGUodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2UoKSB7IGN0cy5kaXNwb3NlKHRydWUpOyB9IH0pO1xuXHRcdFx0cmFjZUNhbmNlbGxhdGlvbih0aGlzLnZpZXdDZWxsLnJlc29sdmVUZXh0TW9kZWwoKSwgY3RzLnRva2VuKS50aGVuKG1vZGVsID0+IHtcblx0XHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZWRpdG9yIS5zZXRNb2RlbChtb2RlbCk7XG5cdFx0XHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdGluZGVudFNpemU6IHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuaW5kZW50U2l6ZSxcblx0XHRcdFx0XHR0YWJTaXplOiB0aGlzLmNlbGxFZGl0b3JPcHRpb25zLnRhYlNpemUsXG5cdFx0XHRcdFx0aW5zZXJ0U3BhY2VzOiB0aGlzLmNlbGxFZGl0b3JPcHRpb25zLmluc2VydFNwYWNlcyxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVhbENvbnRlbnRIZWlnaHQgPSB0aGlzLmVkaXRvciEuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdFx0XHRpZiAocmVhbENvbnRlbnRIZWlnaHQgIT09IGVkaXRvckhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yIS5sYXlvdXQoXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHdpZHRoOiB3aWR0aCxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0OiByZWFsQ29udGVudEhlaWdodFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0ZWRpdG9ySGVpZ2h0ID0gcmVhbENvbnRlbnRIZWlnaHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLmF0dGFjaFRleHRFZGl0b3IodGhpcy5lZGl0b3IhKTtcblxuXHRcdFx0XHRpZiAodGhpcy52aWV3Q2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c0VkaXRvcklmTmVlZGVkKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmJpbmRFZGl0b3JMaXN0ZW5lcnModGhpcy5lZGl0b3IhKTtcblxuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLmVkaXRvckhlaWdodCA9IGVkaXRvckhlaWdodDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld0NlbGwuZWRpdG9ySGVpZ2h0ID0gZWRpdG9ySGVpZ2h0O1xuXHRcdHRoaXMuZm9jdXNFZGl0b3JJZk5lZWRlZCgpO1xuXHRcdHRoaXMucmVuZGVyZWRFZGl0b3JzLnNldCh0aGlzLnZpZXdDZWxsLCB0aGlzLmVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIHZpZXdVcGRhdGVQcmV2aWV3KCk6IHZvaWQge1xuXHRcdHRoaXMudmlld0NlbGwuZGV0YWNoVGV4dEVkaXRvcigpO1xuXHRcdERPTS5oaWRlKHRoaXMuZWRpdG9yUGFydCk7XG5cdFx0RE9NLmhpZGUodGhpcy50ZW1wbGF0ZURhdGEuY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyKTtcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5hcmlhSGlkZGVuID0gJ2ZhbHNlJztcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaW5wdXQtY29sbGFwc2VkJywgZmFsc2UpO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdtYXJrZG93bi1jZWxsLWVkaXQtbW9kZScsIGZhbHNlKTtcblxuXHRcdHRoaXMucmVuZGVyZWRFZGl0b3JzLmRlbGV0ZSh0aGlzLnZpZXdDZWxsKTtcblxuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdGlmICh0aGlzLnZpZXdDZWxsLnJlbmRlcmVkSHRtbCkge1xuXHRcdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHRkb21TYW5pdGl6ZS5zYWZlU2V0SW5uZXJIdG1sKHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLCB0aGlzLnZpZXdDZWxsLnJlbmRlcmVkSHRtbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRET00uY2xlYXJOb2RlKHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0ZU1hcmt1cFByZXZpZXcodGhpcy52aWV3Q2VsbCk7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzRWRpdG9ySWZOZWVkZWQoKSB7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvciAmJlxuXHRcdFx0KHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSB8fCB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYm9keSlcblx0XHQpIHsgLy8gRG9uJ3Qgc3RlYWwgZm9jdXMgZnJvbSBvdGhlciB3b3JrYmVuY2ggcGFydHMsIGJ1dCBpZiBib2R5IGhhcyBmb2N1cywgd2UgY2FuIHRha2UgaXRcblx0XHRcdGlmICghdGhpcy5lZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXG5cdFx0XHRjb25zdCBwcmltYXJ5U2VsZWN0aW9uID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoIXByaW1hcnlTZWxlY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnJldmVhbFJhbmdlSW5WaWV3QXN5bmModGhpcy52aWV3Q2VsbCwgcHJpbWFyeVNlbGVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRFZGl0b3IoZGltZW5zaW9uOiBET00uSURpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yPy5sYXlvdXQoZGltZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgb25DZWxsRWRpdG9yV2lkdGhDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhbENvbnRlbnRIZWlnaHQgPSB0aGlzLmVkaXRvciEuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdHRoaXMubGF5b3V0RWRpdG9yKFxuXHRcdFx0e1xuXHRcdFx0XHR3aWR0aDogdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IHJlYWxDb250ZW50SGVpZ2h0XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIExFVCB0aGUgY29udGVudCBzaXplIG9ic2VydmVyIHRvIGhhbmRsZSBpdFxuXHRcdC8vIHRoaXMudmlld0NlbGwuZWRpdG9ySGVpZ2h0ID0gcmVhbENvbnRlbnRIZWlnaHQ7XG5cdFx0Ly8gdGhpcy5yZWxheW91dENlbGwoKTtcblx0fVxuXG5cdHJlbGF5b3V0Q2VsbCgpOiB2b2lkIHtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmxheW91dE5vdGVib29rQ2VsbCh0aGlzLnZpZXdDZWxsLCB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8udG90YWxIZWlnaHQpO1xuXHRcdHRoaXMubGF5b3V0Rm9sZGluZ0luZGljYXRvcigpO1xuXHR9XG5cblx0dXBkYXRlRWRpdG9yT3B0aW9ucyhuZXdWYWx1ZTogSUVkaXRvck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvck9wdGlvbnMgPSBuZXdWYWx1ZTtcblx0XHR0aGlzLmVkaXRvcj8udXBkYXRlT3B0aW9ucyh0aGlzLmVkaXRvck9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRGb2xkaW5nSW5kaWNhdG9yKCkge1xuXHRcdHN3aXRjaCAodGhpcy5mb2xkaW5nU3RhdGUpIHtcblx0XHRcdGNhc2UgQ2VsbEZvbGRpbmdTdGF0ZS5Ob25lOlxuXHRcdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5mb2xkaW5nSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmZvbGRpbmdJbmRpY2F0b3IuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDZWxsRm9sZGluZ1N0YXRlLkNvbGxhcHNlZDpcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZm9sZGluZ0luZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdERPTS5yZXNldCh0aGlzLnRlbXBsYXRlRGF0YS5mb2xkaW5nSW5kaWNhdG9yLCByZW5kZXJJY29uKGNvbGxhcHNlZEljb24pKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENlbGxGb2xkaW5nU3RhdGUuRXhwYW5kZWQ6XG5cdFx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmZvbGRpbmdJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRET00ucmVzZXQodGhpcy50ZW1wbGF0ZURhdGEuZm9sZGluZ0luZGljYXRvciwgcmVuZGVySWNvbihleHBhbmRlZEljb24pKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYmluZEVkaXRvckxpc3RlbmVycyhlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQpIHtcblxuXHRcdHRoaXMubG9jYWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZm9jdXNTd2l0Y2hEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHR0aGlzLmxvY2FsRGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENvbnRlbnRTaXplQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuY29udGVudEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5vbkNlbGxFZGl0b3JIZWlnaHRDaGFuZ2UoZWRpdG9yLCBlLmNvbnRlbnRIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMubG9jYWxEaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5zb3VyY2UgPT09ICdyZXN0b3JlU3RhdGUnKSB7XG5cdFx0XHRcdC8vIGRvIG5vdCByZXZlYWwgdGhlIGNlbGwgaW50byB2aWV3IGlmIHRoaXMgc2VsZWN0aW9uIGNoYW5nZSB3YXMgY2F1c2VkIGJ5IHJlc3RvcmluZyBlZGl0b3JzLi4uXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cblx0XHRcdGlmIChzZWxlY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IGVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHRcdGNvbnN0IGxheW91dENvbnRlbnRIZWlnaHQgPSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9ySGVpZ2h0O1xuXG5cdFx0XHRcdGlmIChjb250ZW50SGVpZ2h0ICE9PSBsYXlvdXRDb250ZW50SGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5vbkNlbGxFZGl0b3JIZWlnaHRDaGFuZ2UoZWRpdG9yLCBjb250ZW50SGVpZ2h0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYXN0U2VsZWN0aW9uID0gc2VsZWN0aW9uc1tzZWxlY3Rpb25zLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnJldmVhbFJhbmdlSW5WaWV3QXN5bmModGhpcy52aWV3Q2VsbCwgbGFzdFNlbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlRm9jdXNNb2RlID0gKCkgPT4gdGhpcy52aWV3Q2VsbC5mb2N1c01vZGUgPSBlZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSA/IENlbGxGb2N1c01vZGUuRWRpdG9yIDogQ2VsbEZvY3VzTW9kZS5Db250YWluZXI7XG5cdFx0dGhpcy5sb2NhbERpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVGb2N1c01vZGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmxvY2FsRGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0Ly8gdGhpcyBpcyBmb3IgYSBzcGVjaWFsIGNhc2U6XG5cdFx0XHQvLyB1c2VycyBjbGljayB0aGUgc3RhdHVzIGJhciBlbXB0eSBzcGFjZSwgd2hpY2ggd2Ugd2lsbCB0aGVuIGZvY3VzIHRoZSBlZGl0b3Jcblx0XHRcdC8vIHNvIHdlIGRvbid0IHdhbnQgdG8gdXBkYXRlIHRoZSBmb2N1cyBzdGF0ZSB0b28gZWFnZXJseVxuXHRcdFx0aWYgKHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ/LmNvbnRhaW5zKHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lcikpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1N3aXRjaERpc3Bvc2FibGUudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB1cGRhdGVGb2N1c01vZGUoKSwgMzAwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVwZGF0ZUZvY3VzTW9kZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHVwZGF0ZUZvY3VzTW9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNlbGxFZGl0b3JIZWlnaHRDaGFuZ2UoZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LCBuZXdIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdMYXlvdXQgPSBlZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHRoaXMudmlld0NlbGwuZWRpdG9ySGVpZ2h0ID0gbmV3SGVpZ2h0O1xuXHRcdGVkaXRvci5sYXlvdXQoXG5cdFx0XHR7XG5cdFx0XHRcdHdpZHRoOiB2aWV3TGF5b3V0LndpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IG5ld0hlaWdodFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBRTdFLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZSxlQUFlLGtCQUFrQixvQ0FBbUY7QUFDNUksU0FBUyxlQUFlLG9CQUFvQjtBQUM1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUF5RDtBQUVsRSxTQUFTLG1DQUFtQztBQUVyQyxJQUFNLGFBQU4sY0FBeUIsV0FBVztBQUFBLEVBZTFDLFlBQ2tCLGdCQUNBLFVBQ0EsY0FDQSxpQkFDdUIsc0JBQ0gsbUJBQ0csc0JBQ0wsaUJBQ0osc0JBQ0gsbUJBQzNCO0FBQ0QsVUFBTTtBQVhXO0FBQ0E7QUFDQTtBQUNBO0FBQ3VCO0FBQ0g7QUFDRztBQUNMO0FBQ0o7QUFDSDtBQXZCN0IsU0FBUSxTQUFrQztBQUsxQyxT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
