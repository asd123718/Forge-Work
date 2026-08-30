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
import { PixelRatio } from "../../../../../../base/browser/pixelRatio.js";
import * as DOM from "../../../../../../base/browser/dom.js";
import { FastDomNode } from "../../../../../../base/browser/fastDomNode.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { createBareFontInfoFromRawSettings } from "../../../../../../editor/common/config/fontInfoFromSettings.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../../editor/common/languages/modesRegistry.js";
import { localize } from "../../../../../../nls.js";
import { IMenuService } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { CellPartsCollection } from "../cellPart.js";
import { CellChatPart } from "../cellParts/chat/cellChatPart.js";
import { CellComments } from "../cellParts/cellComments.js";
import { CellContextKeyPart } from "../cellParts/cellContextKeys.js";
import { CellDecorations } from "../cellParts/cellDecorations.js";
import { CellDragAndDropPart } from "../cellParts/cellDnd.js";
import { CodeCellDragImageRenderer } from "../cellParts/cellDragRenderer.js";
import { CellEditorOptions } from "../cellParts/cellEditorOptions.js";
import { CellExecutionPart } from "../cellParts/cellExecution.js";
import { CellFocusPart } from "../cellParts/cellFocus.js";
import { CellFocusIndicator } from "../cellParts/cellFocusIndicator.js";
import { CellProgressBar } from "../cellParts/cellProgressBar.js";
import { CellEditorStatusBar } from "../cellParts/cellStatusPart.js";
import { BetweenCellToolbar, CellTitleToolbarPart } from "../cellParts/cellToolbars.js";
import { CodeCell } from "../cellParts/codeCell.js";
import { RunToolbar } from "../cellParts/codeCellRunToolbar.js";
import { CollapsedCellInput } from "../cellParts/collapsedCellInput.js";
import { CollapsedCellOutput } from "../cellParts/collapsedCellOutput.js";
import { FoldedCellHint } from "../cellParts/foldedCellHint.js";
import { MarkupCell } from "../cellParts/markupCell.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
const $ = DOM.$;
let NotebookCellListDelegate = class extends Disposable {
  constructor(targetWindow, configurationService) {
    super();
    this.configurationService = configurationService;
    const editorOptions = this.configurationService.getValue("editor");
    this.lineHeight = createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value).lineHeight;
  }
  getHeight(element) {
    return element.getHeight(this.lineHeight);
  }
  getDynamicHeight(element) {
    return element.getDynamicHeight();
  }
  getTemplateId(element) {
    if (element.cellKind === CellKind.Markup) {
      return MarkupCellRenderer.TEMPLATE_ID;
    } else {
      return CodeCellRenderer.TEMPLATE_ID;
    }
  }
};
NotebookCellListDelegate = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookCellListDelegate);
class AbstractCellRenderer extends Disposable {
  constructor(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, language, dndController) {
    super();
    this.instantiationService = instantiationService;
    this.notebookEditor = notebookEditor;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.contextKeyServiceProvider = contextKeyServiceProvider;
    this.dndController = dndController;
    this.editorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(language), this.notebookEditor.notebookOptions, configurationService));
  }
  dispose() {
    super.dispose();
    this.dndController = void 0;
  }
}
let MarkupCellRenderer = class extends AbstractCellRenderer {
  constructor(notebookEditor, dndController, renderedEditors, contextKeyServiceProvider, configurationService, instantiationService, contextMenuService, menuService, keybindingService, notificationService, notebookExecutionStateService) {
    super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, "markdown", dndController);
    this.renderedEditors = renderedEditors;
    this._notebookExecutionStateService = notebookExecutionStateService;
  }
  get templateId() {
    return MarkupCellRenderer.TEMPLATE_ID;
  }
  renderTemplate(rootContainer) {
    rootContainer.classList.add("markdown-cell-row");
    const container = DOM.append(rootContainer, DOM.$(".cell-inner-container"));
    const templateDisposables = new DisposableStore();
    const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
    const decorationContainer = DOM.append(rootContainer, $(".cell-decoration"));
    const titleToolbarContainer = DOM.append(container, $(".cell-title-toolbar"));
    const focusIndicatorTop = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-top")));
    const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left")));
    const foldingIndicator = DOM.append(focusIndicatorLeft.domNode, DOM.$(".notebook-folding-indicator"));
    const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right")));
    const codeInnerContent = DOM.append(container, $(".cell.code"));
    const editorPart = DOM.append(codeInnerContent, $(".cell-editor-part"));
    const cellChatPart = DOM.append(editorPart, $(".cell-chat-part"));
    const cellInputCollapsedContainer = DOM.append(codeInnerContent, $(".input-collapse-container"));
    cellInputCollapsedContainer.style.display = "none";
    const editorContainer = DOM.append(editorPart, $(".cell-editor-container"));
    editorPart.style.display = "none";
    const cellCommentPartContainer = DOM.append(container, $(".cell-comment-container"));
    const innerContent = DOM.append(container, $(".cell.markdown"));
    const bottomCellContainer = DOM.append(container, $(".cell-bottom-toolbar-container"));
    const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const rootClassDelegate = {
      toggle: (className, force) => container.classList.toggle(className, force)
    };
    const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
      CellTitleToolbarPart,
      titleToolbarContainer,
      rootClassDelegate,
      this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
      this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar,
      this.notebookEditor
    ));
    const focusIndicatorBottom = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-bottom")));
    const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), [
      templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
      templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, void 0)),
      templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom)),
      templateDisposables.add(new FoldedCellHint(this.notebookEditor, DOM.append(container, $(".notebook-folded-hint")), this._notebookExecutionStateService)),
      templateDisposables.add(new CellDecorations(this.notebookEditor, rootContainer, decorationContainer)),
      templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
      templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
      templateDisposables.add(new CellFocusPart(container, void 0, this.notebookEditor)),
      templateDisposables.add(new CellDragAndDropPart(container)),
      templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor))
    ], [
      titleToolbar,
      templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellContainer))
    ]);
    templateDisposables.add(cellParts);
    const templateData = {
      rootContainer,
      cellInputCollapsedContainer,
      instantiationService: scopedInstaService,
      container,
      cellContainer: innerContent,
      editorPart,
      editorContainer,
      foldingIndicator,
      templateDisposables,
      elementDisposables: templateDisposables.add(new DisposableStore()),
      cellParts,
      toJSON: () => {
        return {};
      }
    };
    return templateData;
  }
  renderElement(element, index, templateData, details) {
    if (!this.notebookEditor.hasModel()) {
      throw new Error("The notebook editor is not attached with view model yet.");
    }
    templateData.currentRenderedCell = element;
    templateData.currentEditor = void 0;
    templateData.editorPart.style.display = "none";
    templateData.cellContainer.innerText = "";
    if (details?.height === void 0) {
      return;
    }
    templateData.elementDisposables.add(templateData.instantiationService.createInstance(MarkupCell, this.notebookEditor, element, templateData, this.renderedEditors));
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
};
MarkupCellRenderer.TEMPLATE_ID = "markdown_cell";
MarkupCellRenderer = __decorateClass([
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, INotebookExecutionStateService)
], MarkupCellRenderer);
let CodeCellRenderer = class extends AbstractCellRenderer {
  constructor(notebookEditor, renderedEditors, editorPool, dndController, contextKeyServiceProvider, configurationService, contextMenuService, menuService, instantiationService, keybindingService, notificationService) {
    super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, PLAINTEXT_LANGUAGE_ID, dndController);
    this.renderedEditors = renderedEditors;
    this.editorPool = editorPool;
  }
  get templateId() {
    return CodeCellRenderer.TEMPLATE_ID;
  }
  renderTemplate(rootContainer) {
    rootContainer.classList.add("code-cell-row");
    const container = DOM.append(rootContainer, DOM.$(".cell-inner-container"));
    const templateDisposables = new DisposableStore();
    const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
    const decorationContainer = DOM.append(rootContainer, $(".cell-decoration"));
    const focusIndicatorTop = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-top")));
    const titleToolbarContainer = DOM.append(container, $(".cell-title-toolbar"));
    const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left")));
    const cellChatPart = DOM.append(container, $(".cell-chat-part"));
    const cellContainer = DOM.append(container, $(".cell.code"));
    const runButtonContainer = DOM.append(cellContainer, $(".run-button-container"));
    const cellInputCollapsedContainer = DOM.append(cellContainer, $(".input-collapse-container"));
    cellInputCollapsedContainer.style.display = "none";
    const executionOrderLabel = DOM.append(focusIndicatorLeft.domNode, $("div.execution-count-label"));
    executionOrderLabel.title = localize("cellExecutionOrderCountLabel", "Execution Order");
    const editorPart = DOM.append(cellContainer, $(".cell-editor-part"));
    const editorContainer = DOM.append(editorPart, $(".cell-editor-container"));
    const cellCommentPartContainer = DOM.append(container, $(".cell-comment-container"));
    const editorContextKeyService = templateDisposables.add(this.contextKeyServiceProvider(editorPart));
    const editorInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
    EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
    const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
      ...this.editorOptions.getDefaultValue(),
      allowVariableLineHeights: false,
      dimension: {
        width: 0,
        height: 0
      },
      scrollbar: {
        vertical: "hidden",
        horizontal: "auto",
        handleMouseWheel: false,
        useShadows: false
      }
    }, {
      contributions: this.notebookEditor.creationOptions.cellEditorContributions
    });
    templateDisposables.add(editor);
    const outputContainer = new FastDomNode(DOM.append(container, $(".output")));
    const cellOutputCollapsedContainer = DOM.append(outputContainer.domNode, $(".output-collapse-container"));
    const outputShowMoreContainer = new FastDomNode(DOM.append(container, $(".output-show-more-container")));
    const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right")));
    const focusSinkElement = DOM.append(container, $(".cell-editor-focus-sink"));
    focusSinkElement.setAttribute("tabindex", "0");
    const bottomCellToolbarContainer = DOM.append(container, $(".cell-bottom-toolbar-container"));
    const focusIndicatorBottom = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-bottom")));
    const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const rootClassDelegate = {
      toggle: (className, force) => container.classList.toggle(className, force)
    };
    const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
      CellTitleToolbarPart,
      titleToolbarContainer,
      rootClassDelegate,
      this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
      this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar,
      this.notebookEditor
    ));
    const focusIndicatorPart = templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom));
    const contentParts = [
      focusIndicatorPart,
      templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
      templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, editor)),
      templateDisposables.add(scopedInstaService.createInstance(CellProgressBar, editorPart, cellInputCollapsedContainer)),
      templateDisposables.add(new CellDecorations(this.notebookEditor, rootContainer, decorationContainer)),
      templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
      templateDisposables.add(scopedInstaService.createInstance(CellExecutionPart, this.notebookEditor, executionOrderLabel)),
      templateDisposables.add(scopedInstaService.createInstance(CollapsedCellOutput, this.notebookEditor, cellOutputCollapsedContainer)),
      templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
      templateDisposables.add(new CellFocusPart(container, focusSinkElement, this.notebookEditor)),
      templateDisposables.add(new CellDragAndDropPart(container)),
      templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor))
    ];
    const { cellExecutePrimary, cellExecuteToolbar } = this.notebookEditor.creationOptions.menuIds;
    if (cellExecutePrimary && cellExecuteToolbar) {
      contentParts.push(templateDisposables.add(
        scopedInstaService.createInstance(RunToolbar, this.notebookEditor, contextKeyService, container, runButtonContainer, cellExecutePrimary, cellExecuteToolbar)
      ));
    }
    const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), contentParts, [
      titleToolbar,
      templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellToolbarContainer))
    ]);
    templateDisposables.add(cellParts);
    const templateData = {
      rootContainer,
      editorPart,
      cellInputCollapsedContainer,
      cellOutputCollapsedContainer,
      instantiationService: scopedInstaService,
      container,
      cellContainer,
      focusSinkElement,
      outputContainer,
      outputShowMoreContainer,
      editor,
      templateDisposables,
      elementDisposables: templateDisposables.add(new DisposableStore()),
      cellParts,
      toJSON: () => {
        return {};
      }
    };
    const dragHandles = [focusIndicatorLeft.domNode, focusIndicatorPart.codeFocusIndicator.domNode, focusIndicatorPart.outputFocusIndicator.domNode];
    this.dndController?.registerDragHandle(templateData, rootContainer, dragHandles, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, "code"));
    return templateData;
  }
  renderElement(element, index, templateData, details) {
    if (!this.notebookEditor.hasModel()) {
      throw new Error("The notebook editor is not attached with view model yet.");
    }
    templateData.currentRenderedCell = element;
    if (details?.height === void 0) {
      return;
    }
    templateData.outputContainer.domNode.innerText = "";
    templateData.outputContainer.domNode.appendChild(templateData.cellOutputCollapsedContainer);
    templateData.elementDisposables.add(templateData.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData, this.editorPool));
    this.renderedEditors.set(element, templateData.editor);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    this.renderedEditors.delete(element);
  }
};
CodeCellRenderer.TEMPLATE_ID = "code_cell";
CodeCellRenderer = __decorateClass([
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService)
], CodeCellRenderer);
export {
  CodeCellRenderer,
  MarkupCellRenderer,
  NotebookCellListDelegate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxyZW5kZXJlcnNcXGNlbGxSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFBpeGVsUmF0aW8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvcGl4ZWxSYXRpby5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzLCBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm9Gcm9tU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsUGFydHNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vY2VsbFBhcnQuanMnO1xuaW1wb3J0IHsgQ2VsbENoYXRQYXJ0IH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NoYXQvY2VsbENoYXRQYXJ0LmpzJztcbmltcG9ydCB7IENlbGxDb21tZW50cyB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgQ2VsbENvbnRleHRLZXlQYXJ0IH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDZWxsRGVjb3JhdGlvbnMgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbERlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IENlbGxEcmFnQW5kRHJvcENvbnRyb2xsZXIsIENlbGxEcmFnQW5kRHJvcFBhcnQgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbERuZC5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbERyYWdJbWFnZVJlbmRlcmVyIH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxEcmFnUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEV4ZWN1dGlvblBhcnQgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbEV4ZWN1dGlvbi5qcyc7XG5pbXBvcnQgeyBDZWxsRm9jdXNQYXJ0IH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxGb2N1cy5qcyc7XG5pbXBvcnQgeyBDZWxsRm9jdXNJbmRpY2F0b3IgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbEZvY3VzSW5kaWNhdG9yLmpzJztcbmltcG9ydCB7IENlbGxQcm9ncmVzc0JhciB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsUHJvZ3Jlc3NCYXIuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRvclN0YXR1c0JhciB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsU3RhdHVzUGFydC5qcyc7XG5pbXBvcnQgeyBCZXR3ZWVuQ2VsbFRvb2xiYXIsIENlbGxUaXRsZVRvb2xiYXJQYXJ0IH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxUb29sYmFycy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbCB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jb2RlQ2VsbC5qcyc7XG5pbXBvcnQgeyBSdW5Ub29sYmFyIH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NvZGVDZWxsUnVuVG9vbGJhci5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzZWRDZWxsSW5wdXQgfSBmcm9tICcuLi9jZWxsUGFydHMvY29sbGFwc2VkQ2VsbElucHV0LmpzJztcbmltcG9ydCB7IENvbGxhcHNlZENlbGxPdXRwdXQgfSBmcm9tICcuLi9jZWxsUGFydHMvY29sbGFwc2VkQ2VsbE91dHB1dC5qcyc7XG5pbXBvcnQgeyBGb2xkZWRDZWxsSGludCB9IGZyb20gJy4uL2NlbGxQYXJ0cy9mb2xkZWRDZWxsSGludC5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsIH0gZnJvbSAnLi4vY2VsbFBhcnRzL21hcmt1cENlbGwuanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSwgTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGUgfSBmcm9tICcuLi9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL21hcmt1cENlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbEVkaXRvclBvb2wgfSBmcm9tICcuLi9ub3RlYm9va0NlbGxFZGl0b3JQb29sLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDZWxsTGlzdERlbGVnYXRlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPENlbGxWaWV3TW9kZWw+IHtcblx0cHJpdmF0ZSByZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dGFyZ2V0V2luZG93OiBXaW5kb3csXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0dGhpcy5saW5lSGVpZ2h0ID0gY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzKGVkaXRvck9wdGlvbnMsIFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UodGFyZ2V0V2luZG93KS52YWx1ZSkubGluZUhlaWdodDtcblx0fVxuXG5cdGdldEhlaWdodChlbGVtZW50OiBDZWxsVmlld01vZGVsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gZWxlbWVudC5nZXRIZWlnaHQodGhpcy5saW5lSGVpZ2h0KTtcblx0fVxuXG5cdGdldER5bmFtaWNIZWlnaHQoZWxlbWVudDogQ2VsbFZpZXdNb2RlbCk6IG51bWJlciB8IG51bGwge1xuXHRcdHJldHVybiBlbGVtZW50LmdldER5bmFtaWNIZWlnaHQoKTtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogQ2VsbFZpZXdNb2RlbCk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0cmV0dXJuIE1hcmt1cENlbGxSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIENvZGVDZWxsUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q2VsbFJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByb3RlY3RlZCByZWFkb25seSBlZGl0b3JPcHRpb25zOiBDZWxsRWRpdG9yT3B0aW9ucztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlUHJvdmlkZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0bGFuZ3VhZ2U6IHN0cmluZyxcblx0XHRwcm90ZWN0ZWQgZG5kQ29udHJvbGxlcjogQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlciB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWRpdG9yT3B0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDZWxsRWRpdG9yT3B0aW9ucyh0aGlzLm5vdGVib29rRWRpdG9yLmdldEJhc2VDZWxsRWRpdG9yT3B0aW9ucyhsYW5ndWFnZSksIHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kbmRDb250cm9sbGVyID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrdXBDZWxsUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdENlbGxSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8TWFya3VwQ2VsbFZpZXdNb2RlbCwgTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ21hcmtkb3duX2NlbGwnO1xuXG5cdHByaXZhdGUgX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdGRuZENvbnRyb2xsZXI6IENlbGxEcmFnQW5kRHJvcENvbnRyb2xsZXIsXG5cdFx0cHJpdmF0ZSByZW5kZXJlZEVkaXRvcnM6IE1hcDxJQ2VsbFZpZXdNb2RlbCwgSUNvZGVFZGl0b3I+LFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlUHJvdmlkZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBub3RlYm9va0VkaXRvciwgY29udGV4dE1lbnVTZXJ2aWNlLCBtZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZVByb3ZpZGVyLCAnbWFya2Rvd24nLCBkbmRDb250cm9sbGVyKTtcblx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlO1xuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIE1hcmt1cENlbGxSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHJvb3RDb250YWluZXI6IEhUTUxFbGVtZW50KTogTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGUge1xuXHRcdHJvb3RDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWFya2Rvd24tY2VsbC1yb3cnKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBET00uYXBwZW5kKHJvb3RDb250YWluZXIsIERPTS4kKCcuY2VsbC1pbm5lci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2VQcm92aWRlcihjb250YWluZXIpKTtcblx0XHRjb25zdCBkZWNvcmF0aW9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChyb290Q29udGFpbmVyLCAkKCcuY2VsbC1kZWNvcmF0aW9uJykpO1xuXHRcdGNvbnN0IHRpdGxlVG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2VsbC10aXRsZS10b29sYmFyJykpO1xuXG5cdFx0Y29uc3QgZm9jdXNJbmRpY2F0b3JUb3AgPSBuZXcgRmFzdERvbU5vZGUoRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWZvY3VzLWluZGljYXRvci5jZWxsLWZvY3VzLWluZGljYXRvci10b3AnKSkpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yTGVmdCA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJy5jZWxsLWZvY3VzLWluZGljYXRvci5jZWxsLWZvY3VzLWluZGljYXRvci1zaWRlLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQnKSkpO1xuXHRcdGNvbnN0IGZvbGRpbmdJbmRpY2F0b3IgPSBET00uYXBwZW5kKGZvY3VzSW5kaWNhdG9yTGVmdC5kb21Ob2RlLCBET00uJCgnLm5vdGVib29rLWZvbGRpbmctaW5kaWNhdG9yJykpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yUmlnaHQgPSBuZXcgRmFzdERvbU5vZGUoRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3Itc2lkZS5jZWxsLWZvY3VzLWluZGljYXRvci1yaWdodCcpKSk7XG5cblx0XHRjb25zdCBjb2RlSW5uZXJDb250ZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLmNvZGUnKSk7XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IERPTS5hcHBlbmQoY29kZUlubmVyQ29udGVudCwgJCgnLmNlbGwtZWRpdG9yLXBhcnQnKSk7XG5cdFx0Y29uc3QgY2VsbENoYXRQYXJ0ID0gRE9NLmFwcGVuZChlZGl0b3JQYXJ0LCAkKCcuY2VsbC1jaGF0LXBhcnQnKSk7XG5cdFx0Y29uc3QgY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb2RlSW5uZXJDb250ZW50LCAkKCcuaW5wdXQtY29sbGFwc2UtY29udGFpbmVyJykpO1xuXHRcdGNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZWRpdG9yUGFydCwgJCgnLmNlbGwtZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHRlZGl0b3JQYXJ0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgY2VsbENvbW1lbnRQYXJ0Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWNvbW1lbnQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGlubmVyQ29udGVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2VsbC5tYXJrZG93bicpKTtcblx0XHRjb25zdCBib3R0b21DZWxsQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhU2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRjb25zdCByb290Q2xhc3NEZWxlZ2F0ZSA9IHtcblx0XHRcdHRvZ2dsZTogKGNsYXNzTmFtZTogc3RyaW5nLCBmb3JjZT86IGJvb2xlYW4pID0+IGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKGNsYXNzTmFtZSwgZm9yY2UpXG5cdFx0fTtcblx0XHRjb25zdCB0aXRsZVRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDZWxsVGl0bGVUb29sYmFyUGFydCxcblx0XHRcdHRpdGxlVG9vbGJhckNvbnRhaW5lcixcblx0XHRcdHJvb3RDbGFzc0RlbGVnYXRlLFxuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMubWVudUlkcy5jZWxsVGl0bGVUb29sYmFyLFxuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMubWVudUlkcy5jZWxsRGVsZXRlVG9vbGJhcixcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IpKTtcblx0XHRjb25zdCBmb2N1c0luZGljYXRvckJvdHRvbSA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtZm9jdXMtaW5kaWNhdG9yLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWJvdHRvbScpKSk7XG5cblx0XHRjb25zdCBjZWxsUGFydHMgPSBuZXcgQ2VsbFBhcnRzQ29sbGVjdGlvbihET00uZ2V0V2luZG93KHJvb3RDb250YWluZXIpLCBbXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbENoYXRQYXJ0LCB0aGlzLm5vdGVib29rRWRpdG9yLCBjZWxsQ2hhdFBhcnQpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsRWRpdG9yU3RhdHVzQmFyLCB0aGlzLm5vdGVib29rRWRpdG9yLCBjb250YWluZXIsIGVkaXRvclBhcnQsIHVuZGVmaW5lZCkpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENlbGxGb2N1c0luZGljYXRvcih0aGlzLm5vdGVib29rRWRpdG9yLCB0aXRsZVRvb2xiYXIsIGZvY3VzSW5kaWNhdG9yVG9wLCBmb2N1c0luZGljYXRvckxlZnQsIGZvY3VzSW5kaWNhdG9yUmlnaHQsIGZvY3VzSW5kaWNhdG9yQm90dG9tKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgRm9sZGVkQ2VsbEhpbnQodGhpcy5ub3RlYm9va0VkaXRvciwgRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5ub3RlYm9vay1mb2xkZWQtaGludCcpKSwgdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBDZWxsRGVjb3JhdGlvbnModGhpcy5ub3RlYm9va0VkaXRvciwgcm9vdENvbnRhaW5lciwgZGVjb3JhdGlvbkNvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxDb21tZW50cywgdGhpcy5ub3RlYm9va0VkaXRvciwgY2VsbENvbW1lbnRQYXJ0Q29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ29sbGFwc2VkQ2VsbElucHV0KHRoaXMubm90ZWJvb2tFZGl0b3IsIGNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENlbGxGb2N1c1BhcnQoY29udGFpbmVyLCB1bmRlZmluZWQsIHRoaXMubm90ZWJvb2tFZGl0b3IpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBDZWxsRHJhZ0FuZERyb3BQYXJ0KGNvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxDb250ZXh0S2V5UGFydCwgdGhpcy5ub3RlYm9va0VkaXRvcikpLFxuXHRcdF0sIFtcblx0XHRcdHRpdGxlVG9vbGJhcixcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShCZXR3ZWVuQ2VsbFRvb2xiYXIsIHRoaXMubm90ZWJvb2tFZGl0b3IsIHRpdGxlVG9vbGJhckNvbnRhaW5lciwgYm90dG9tQ2VsbENvbnRhaW5lcikpXG5cdFx0XSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChjZWxsUGFydHMpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhOiBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZSA9IHtcblx0XHRcdHJvb3RDb250YWluZXIsXG5cdFx0XHRjZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogc2NvcGVkSW5zdGFTZXJ2aWNlLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0Y2VsbENvbnRhaW5lcjogaW5uZXJDb250ZW50LFxuXHRcdFx0ZWRpdG9yUGFydCxcblx0XHRcdGVkaXRvckNvbnRhaW5lcixcblx0XHRcdGZvbGRpbmdJbmRpY2F0b3IsXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzOiB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLFxuXHRcdFx0Y2VsbFBhcnRzLFxuXHRcdFx0dG9KU09OOiAoKSA9PiB7IHJldHVybiB7fTsgfVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGVtcGxhdGVEYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBNYXJrdXBDZWxsVmlld01vZGVsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IE1hcmtkb3duQ2VsbFJlbmRlclRlbXBsYXRlLCBkZXRhaWxzPzogSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBub3RlYm9vayBlZGl0b3IgaXMgbm90IGF0dGFjaGVkIHdpdGggdmlldyBtb2RlbCB5ZXQuJyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmN1cnJlbnRSZW5kZXJlZENlbGwgPSBlbGVtZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5jdXJyZW50RWRpdG9yID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5lZGl0b3JQYXJ0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmNlbGxDb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRpZiAoZGV0YWlscz8uaGVpZ2h0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya3VwQ2VsbCwgdGhpcy5ub3RlYm9va0VkaXRvciwgZWxlbWVudCwgdGVtcGxhdGVEYXRhLCB0aGlzLnJlbmRlcmVkRWRpdG9ycykpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSUNlbGxWaWV3TW9kZWwsIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IE1hcmtkb3duQ2VsbFJlbmRlclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2RlQ2VsbFJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RDZWxsUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPENvZGVDZWxsVmlld01vZGVsLCBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjb2RlX2NlbGwnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlbmRlcmVkRWRpdG9yczogTWFwPElDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvcj4sXG5cdFx0cHJpdmF0ZSBlZGl0b3JQb29sOiBOb3RlYm9va0NlbGxFZGl0b3JQb29sLFxuXHRcdGRuZENvbnRyb2xsZXI6IENlbGxEcmFnQW5kRHJvcENvbnRyb2xsZXIsXG5cdFx0Y29udGV4dEtleVNlcnZpY2VQcm92aWRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IElTY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGVib29rRWRpdG9yLCBjb250ZXh0TWVudVNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlUHJvdmlkZXIsIFBMQUlOVEVYVF9MQU5HVUFHRV9JRCwgZG5kQ29udHJvbGxlcik7XG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gQ29kZUNlbGxSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHJvb3RDb250YWluZXI6IEhUTUxFbGVtZW50KTogQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSB7XG5cdFx0cm9vdENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjb2RlLWNlbGwtcm93Jyk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gRE9NLmFwcGVuZChyb290Q29udGFpbmVyLCBET00uJCgnLmNlbGwtaW5uZXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlUHJvdmlkZXIoY29udGFpbmVyKSk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQocm9vdENvbnRhaW5lciwgJCgnLmNlbGwtZGVjb3JhdGlvbicpKTtcblx0XHRjb25zdCBmb2N1c0luZGljYXRvclRvcCA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtZm9jdXMtaW5kaWNhdG9yLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXRvcCcpKSk7XG5cdFx0Y29uc3QgdGl0bGVUb29sYmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLXRpdGxlLXRvb2xiYXInKSk7XG5cblx0XHQvLyBUaGlzIGlzIGFsc28gdGhlIGRyYWcgaGFuZGxlXG5cdFx0Y29uc3QgZm9jdXNJbmRpY2F0b3JMZWZ0ID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmNlbGwtZm9jdXMtaW5kaWNhdG9yLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXNpZGUuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCcpKSk7XG5cdFx0Y29uc3QgY2VsbENoYXRQYXJ0ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWNoYXQtcGFydCcpKTtcblx0XHRjb25zdCBjZWxsQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLmNvZGUnKSk7XG5cdFx0Y29uc3QgcnVuQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChjZWxsQ29udGFpbmVyLCAkKCcucnVuLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyID0gRE9NLmFwcGVuZChjZWxsQ29udGFpbmVyLCAkKCcuaW5wdXQtY29sbGFwc2UtY29udGFpbmVyJykpO1xuXHRcdGNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbk9yZGVyTGFiZWwgPSBET00uYXBwZW5kKGZvY3VzSW5kaWNhdG9yTGVmdC5kb21Ob2RlLCAkKCdkaXYuZXhlY3V0aW9uLWNvdW50LWxhYmVsJykpO1xuXHRcdGV4ZWN1dGlvbk9yZGVyTGFiZWwudGl0bGUgPSBsb2NhbGl6ZSgnY2VsbEV4ZWN1dGlvbk9yZGVyQ291bnRMYWJlbCcsICdFeGVjdXRpb24gT3JkZXInKTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0gRE9NLmFwcGVuZChjZWxsQ29udGFpbmVyLCAkKCcuY2VsbC1lZGl0b3ItcGFydCcpKTtcblx0XHRjb25zdCBlZGl0b3JDb250YWluZXIgPSBET00uYXBwZW5kKGVkaXRvclBhcnQsICQoJy5jZWxsLWVkaXRvci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgY2VsbENvbW1lbnRQYXJ0Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWNvbW1lbnQtY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gY3JlYXRlIGEgc3BlY2lhbCBjb250ZXh0IGtleSBzZXJ2aWNlIHRoYXQgc2V0IHRoZSBpbkNvbXBvc2l0ZUVkaXRvci1jb250ZXh0a2V5XG5cdFx0Y29uc3QgZWRpdG9yQ29udGV4dEtleVNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlUHJvdmlkZXIoZWRpdG9yUGFydCkpO1xuXHRcdGNvbnN0IGVkaXRvckluc3RhU2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRFZGl0b3JDb250ZXh0S2V5cy5pbkNvbXBvc2l0ZUVkaXRvci5iaW5kVG8oZWRpdG9yQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvckluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCBlZGl0b3JDb250YWluZXIsIHtcblx0XHRcdC4uLnRoaXMuZWRpdG9yT3B0aW9ucy5nZXREZWZhdWx0VmFsdWUoKSxcblx0XHRcdGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0czogZmFsc2UsXG5cdFx0XHRkaW1lbnNpb246IHtcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogMFxuXHRcdFx0fSxcblx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHR2ZXJ0aWNhbDogJ2hpZGRlbicsXG5cdFx0XHRcdGhvcml6b250YWw6ICdhdXRvJyxcblx0XHRcdFx0aGFuZGxlTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRjb250cmlidXRpb25zOiB0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0aW9uT3B0aW9ucy5jZWxsRWRpdG9yQ29udHJpYnV0aW9uc1xuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZWRpdG9yKTtcblxuXHRcdGNvbnN0IG91dHB1dENvbnRhaW5lciA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm91dHB1dCcpKSk7XG5cdFx0Y29uc3QgY2VsbE91dHB1dENvbGxhcHNlZENvbnRhaW5lciA9IERPTS5hcHBlbmQob3V0cHV0Q29udGFpbmVyLmRvbU5vZGUsICQoJy5vdXRwdXQtY29sbGFwc2UtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IG91dHB1dFNob3dNb3JlQ29udGFpbmVyID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3V0cHV0LXNob3ctbW9yZS1jb250YWluZXInKSkpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yUmlnaHQgPSBuZXcgRmFzdERvbU5vZGUoRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3Itc2lkZS5jZWxsLWZvY3VzLWluZGljYXRvci1yaWdodCcpKSk7XG5cdFx0Y29uc3QgZm9jdXNTaW5rRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2VsbC1lZGl0b3ItZm9jdXMtc2luaycpKTtcblx0XHRmb2N1c1NpbmtFbGVtZW50LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdGNvbnN0IGJvdHRvbUNlbGxUb29sYmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBmb2N1c0luZGljYXRvckJvdHRvbSA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtZm9jdXMtaW5kaWNhdG9yLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWJvdHRvbScpKSk7XG5cblx0XHRjb25zdCBzY29wZWRJbnN0YVNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3Qgcm9vdENsYXNzRGVsZWdhdGUgPSB7XG5cdFx0XHR0b2dnbGU6IChjbGFzc05hbWU6IHN0cmluZywgZm9yY2U/OiBib29sZWFuKSA9PiBjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShjbGFzc05hbWUsIGZvcmNlKVxuXHRcdH07XG5cdFx0Y29uc3QgdGl0bGVUb29sYmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2VsbFRpdGxlVG9vbGJhclBhcnQsXG5cdFx0XHR0aXRsZVRvb2xiYXJDb250YWluZXIsXG5cdFx0XHRyb290Q2xhc3NEZWxlZ2F0ZSxcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRpb25PcHRpb25zLm1lbnVJZHMuY2VsbFRpdGxlVG9vbGJhcixcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRpb25PcHRpb25zLm1lbnVJZHMuY2VsbERlbGV0ZVRvb2xiYXIsXG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yKSk7XG5cblx0XHRjb25zdCBmb2N1c0luZGljYXRvclBhcnQgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ2VsbEZvY3VzSW5kaWNhdG9yKHRoaXMubm90ZWJvb2tFZGl0b3IsIHRpdGxlVG9vbGJhciwgZm9jdXNJbmRpY2F0b3JUb3AsIGZvY3VzSW5kaWNhdG9yTGVmdCwgZm9jdXNJbmRpY2F0b3JSaWdodCwgZm9jdXNJbmRpY2F0b3JCb3R0b20pKTtcblx0XHRjb25zdCBjb250ZW50UGFydHMgPSBbXG5cdFx0XHRmb2N1c0luZGljYXRvclBhcnQsXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbENoYXRQYXJ0LCB0aGlzLm5vdGVib29rRWRpdG9yLCBjZWxsQ2hhdFBhcnQpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsRWRpdG9yU3RhdHVzQmFyLCB0aGlzLm5vdGVib29rRWRpdG9yLCBjb250YWluZXIsIGVkaXRvclBhcnQsIGVkaXRvcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxQcm9ncmVzc0JhciwgZWRpdG9yUGFydCwgY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ2VsbERlY29yYXRpb25zKHRoaXMubm90ZWJvb2tFZGl0b3IsIHJvb3RDb250YWluZXIsIGRlY29yYXRpb25Db250YWluZXIpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsQ29tbWVudHMsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGNlbGxDb21tZW50UGFydENvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxFeGVjdXRpb25QYXJ0LCB0aGlzLm5vdGVib29rRWRpdG9yLCBleGVjdXRpb25PcmRlckxhYmVsKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29sbGFwc2VkQ2VsbE91dHB1dCwgdGhpcy5ub3RlYm9va0VkaXRvciwgY2VsbE91dHB1dENvbGxhcHNlZENvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENvbGxhcHNlZENlbGxJbnB1dCh0aGlzLm5vdGVib29rRWRpdG9yLCBjZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBDZWxsRm9jdXNQYXJ0KGNvbnRhaW5lciwgZm9jdXNTaW5rRWxlbWVudCwgdGhpcy5ub3RlYm9va0VkaXRvcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENlbGxEcmFnQW5kRHJvcFBhcnQoY29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbENvbnRleHRLZXlQYXJ0LCB0aGlzLm5vdGVib29rRWRpdG9yKSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgY2VsbEV4ZWN1dGVQcmltYXJ5LCBjZWxsRXhlY3V0ZVRvb2xiYXIgfSA9IHRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRpb25PcHRpb25zLm1lbnVJZHM7XG5cdFx0aWYgKGNlbGxFeGVjdXRlUHJpbWFyeSAmJiBjZWxsRXhlY3V0ZVRvb2xiYXIpIHtcblx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0XHRzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUnVuVG9vbGJhciwgdGhpcy5ub3RlYm9va0VkaXRvciwgY29udGV4dEtleVNlcnZpY2UsIGNvbnRhaW5lciwgcnVuQnV0dG9uQ29udGFpbmVyLCBjZWxsRXhlY3V0ZVByaW1hcnksIGNlbGxFeGVjdXRlVG9vbGJhcilcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxQYXJ0cyA9IG5ldyBDZWxsUGFydHNDb2xsZWN0aW9uKERPTS5nZXRXaW5kb3cocm9vdENvbnRhaW5lciksIGNvbnRlbnRQYXJ0cywgW1xuXHRcdFx0dGl0bGVUb29sYmFyLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJldHdlZW5DZWxsVG9vbGJhciwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGl0bGVUb29sYmFyQ29udGFpbmVyLCBib3R0b21DZWxsVG9vbGJhckNvbnRhaW5lcikpXG5cdFx0XSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChjZWxsUGFydHMpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhOiBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlID0ge1xuXHRcdFx0cm9vdENvbnRhaW5lcixcblx0XHRcdGVkaXRvclBhcnQsXG5cdFx0XHRjZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIsXG5cdFx0XHRjZWxsT3V0cHV0Q29sbGFwc2VkQ29udGFpbmVyLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IHNjb3BlZEluc3RhU2VydmljZSxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGNlbGxDb250YWluZXIsXG5cdFx0XHRmb2N1c1NpbmtFbGVtZW50LFxuXHRcdFx0b3V0cHV0Q29udGFpbmVyLFxuXHRcdFx0b3V0cHV0U2hvd01vcmVDb250YWluZXIsXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzOiB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLFxuXHRcdFx0Y2VsbFBhcnRzLFxuXHRcdFx0dG9KU09OOiAoKSA9PiB7IHJldHVybiB7fTsgfVxuXHRcdH07XG5cblx0XHQvLyBmb2N1c0luZGljYXRvckxlZnQgY292ZXJzIHRoZSBsZWZ0IG1hcmdpbiBhcmVhXG5cdFx0Ly8gY29kZS9vdXRwdXRGb2N1c0luZGljYXRvciBuZWVkIHRvIGJlIHJlZ2lzdGVyZWQgYXMgZHJhZyBoYW5kbGVycyBzbyB0aGVpciBjbGljayBoYW5kbGVycyBkb24ndCB0YWtlIG92ZXJcblx0XHRjb25zdCBkcmFnSGFuZGxlcyA9IFtmb2N1c0luZGljYXRvckxlZnQuZG9tTm9kZSwgZm9jdXNJbmRpY2F0b3JQYXJ0LmNvZGVGb2N1c0luZGljYXRvci5kb21Ob2RlLCBmb2N1c0luZGljYXRvclBhcnQub3V0cHV0Rm9jdXNJbmRpY2F0b3IuZG9tTm9kZV07XG5cdFx0dGhpcy5kbmRDb250cm9sbGVyPy5yZWdpc3RlckRyYWdIYW5kbGUodGVtcGxhdGVEYXRhLCByb290Q29udGFpbmVyLCBkcmFnSGFuZGxlcywgKCkgPT4gbmV3IENvZGVDZWxsRHJhZ0ltYWdlUmVuZGVyZXIoKS5nZXREcmFnSW1hZ2UodGVtcGxhdGVEYXRhLCB0ZW1wbGF0ZURhdGEuZWRpdG9yLCAnY29kZScpKTtcblx0XHRyZXR1cm4gdGVtcGxhdGVEYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBDb2RlQ2VsbFZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLCBkZXRhaWxzPzogSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBub3RlYm9vayBlZGl0b3IgaXMgbm90IGF0dGFjaGVkIHdpdGggdmlldyBtb2RlbCB5ZXQuJyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmN1cnJlbnRSZW5kZXJlZENlbGwgPSBlbGVtZW50O1xuXG5cdFx0aWYgKGRldGFpbHM/LmhlaWdodCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lci5kb21Ob2RlLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIuZG9tTm9kZS5hcHBlbmRDaGlsZCh0ZW1wbGF0ZURhdGEuY2VsbE91dHB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUNlbGwsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGVsZW1lbnQsIHRlbXBsYXRlRGF0YSwgdGhpcy5lZGl0b3JQb29sKSk7XG5cdFx0dGhpcy5yZW5kZXJlZEVkaXRvcnMuc2V0KGVsZW1lbnQsIHRlbXBsYXRlRGF0YS5lZGl0b3IpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElDZWxsVmlld01vZGVsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5yZW5kZXJlZEVkaXRvcnMuZGVsZXRlKGVsZW1lbnQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksU0FBUztBQUNyQixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLFlBQVksdUJBQXVCO0FBRTVDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMs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
