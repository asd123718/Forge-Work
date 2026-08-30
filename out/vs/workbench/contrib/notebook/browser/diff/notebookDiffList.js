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
import "./notebookDiff.css";
import * as DOM from "../../../../../base/browser/dom.js";
import * as domStylesheets from "../../../../../base/browser/domStylesheets.js";
import { isMonacoEditor, MouseController } from "../../../../../base/browser/ui/list/listWidget.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IListService, WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { DIFF_CELL_MARGIN } from "./notebookDiffEditorBrowser.js";
import { CellDiffPlaceholderElement, CollapsedCellOverlayWidget, DeletedElement, getOptimizedNestedCodeEditorWidgetOptions, InsertElement, ModifiedElement, NotebookDocumentMetadataElement, UnchangedCellOverlayWidget } from "./diffComponents.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { DiffEditorWidget } from "../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { CodiconActionViewItem } from "../view/cellParts/cellActionView.js";
import { createBareFontInfoFromRawSettings } from "../../../../../editor/common/config/fontInfoFromSettings.js";
import { PixelRatio } from "../../../../../base/browser/pixelRatio.js";
import { WorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { fixedDiffEditorOptions, fixedEditorOptions } from "./diffCellEditorOptions.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { localize } from "../../../../../nls.js";
import { EditorExtensionsRegistry } from "../../../../../editor/browser/editorExtensions.js";
let NotebookCellTextDiffListDelegate = class {
  constructor(targetWindow, configurationService) {
    this.configurationService = configurationService;
    const editorOptions = this.configurationService.getValue("editor");
    this.lineHeight = createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value).lineHeight;
  }
  getHeight(element) {
    return element.getHeight(this.lineHeight);
  }
  hasDynamicHeight(element) {
    return false;
  }
  getTemplateId(element) {
    switch (element.type) {
      case "delete":
      case "insert":
        return CellDiffSingleSideRenderer.TEMPLATE_ID;
      case "modified":
      case "unchanged":
        return CellDiffSideBySideRenderer.TEMPLATE_ID;
      case "placeholder":
        return CellDiffPlaceholderRenderer.TEMPLATE_ID;
      case "modifiedMetadata":
      case "unchangedMetadata":
        return NotebookDocumentMetadataDiffRenderer.TEMPLATE_ID;
    }
  }
};
NotebookCellTextDiffListDelegate = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookCellTextDiffListDelegate);
let CellDiffPlaceholderRenderer = class {
  constructor(notebookEditor, instantiationService) {
    this.notebookEditor = notebookEditor;
    this.instantiationService = instantiationService;
  }
  get templateId() {
    return CellDiffPlaceholderRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const body = DOM.$(".cell-placeholder-body");
    DOM.append(container, body);
    const elementDisposables = new DisposableStore();
    const marginOverlay = new CollapsedCellOverlayWidget(body);
    const contents = DOM.append(body, DOM.$(".contents"));
    const placeholder = DOM.append(contents, DOM.$("span.text", { title: localize("notebook.diff.hiddenCells.expandAll", "Double click to show") }));
    return {
      body,
      container,
      placeholder,
      marginOverlay,
      elementDisposables
    };
  }
  renderElement(element, index, templateData) {
    templateData.body.classList.remove("left", "right", "full");
    templateData.elementDisposables.add(this.instantiationService.createInstance(CellDiffPlaceholderElement, element, templateData));
  }
  disposeTemplate(templateData) {
    templateData.container.innerText = "";
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
};
CellDiffPlaceholderRenderer.TEMPLATE_ID = "cell_diff_placeholder";
CellDiffPlaceholderRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], CellDiffPlaceholderRenderer);
let NotebookDocumentMetadataDiffRenderer = class {
  constructor(notebookEditor, instantiationService, contextMenuService, keybindingService, menuService, contextKeyService, notificationService, themeService, accessibilityService) {
    this.notebookEditor = notebookEditor;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.notificationService = notificationService;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
  }
  get templateId() {
    return NotebookDocumentMetadataDiffRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const body = DOM.$(".cell-body");
    DOM.append(container, body);
    const diffEditorContainer = DOM.$(".cell-diff-editor-container");
    DOM.append(body, diffEditorContainer);
    const cellHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".input-header-container"));
    const sourceContainer = DOM.append(diffEditorContainer, DOM.$(".source-container"));
    const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);
    const inputToolbarContainer = DOM.append(sourceContainer, DOM.$(".editor-input-toolbar-container"));
    const cellToolbarContainer = DOM.append(inputToolbarContainer, DOM.$("div.property-toolbar"));
    const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, cellToolbarContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          const item = new CodiconActionViewItem(action, { hoverDelegate: options.hoverDelegate }, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
          return item;
        }
        return void 0;
      },
      highlightToggledItems: true
    });
    const borderContainer = DOM.append(body, DOM.$(".border-container"));
    const leftBorder = DOM.append(borderContainer, DOM.$(".left-border"));
    const rightBorder = DOM.append(borderContainer, DOM.$(".right-border"));
    const topBorder = DOM.append(borderContainer, DOM.$(".top-border"));
    const bottomBorder = DOM.append(borderContainer, DOM.$(".bottom-border"));
    const marginOverlay = new UnchangedCellOverlayWidget(body);
    const elementDisposables = new DisposableStore();
    return {
      body,
      container,
      diffEditorContainer,
      cellHeaderContainer,
      sourceEditor: editor,
      editorContainer,
      inputToolbarContainer,
      toolbar,
      leftBorder,
      rightBorder,
      topBorder,
      bottomBorder,
      marginOverlay,
      elementDisposables
    };
  }
  _buildSourceEditor(sourceContainer) {
    return buildDiffEditorWidget(this.instantiationService, this.notebookEditor, sourceContainer, { readOnly: true });
  }
  renderElement(element, index, templateData) {
    templateData.body.classList.remove("full");
    templateData.elementDisposables.add(this.instantiationService.createInstance(NotebookDocumentMetadataElement, this.notebookEditor, element, templateData));
  }
  disposeTemplate(templateData) {
    templateData.container.innerText = "";
    templateData.sourceEditor.dispose();
    templateData.toolbar?.dispose();
    templateData.elementDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    if (templateData.toolbar) {
      templateData.toolbar.context = void 0;
    }
    templateData.elementDisposables.clear();
  }
};
NotebookDocumentMetadataDiffRenderer.TEMPLATE_ID = "notebook_metadata_diff_side_by_side";
NotebookDocumentMetadataDiffRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IAccessibilityService)
], NotebookDocumentMetadataDiffRenderer);
let CellDiffSingleSideRenderer = class {
  constructor(notebookEditor, instantiationService) {
    this.notebookEditor = notebookEditor;
    this.instantiationService = instantiationService;
  }
  get templateId() {
    return CellDiffSingleSideRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const body = DOM.$(".cell-body");
    DOM.append(container, body);
    const diffEditorContainer = DOM.$(".cell-diff-editor-container");
    DOM.append(body, diffEditorContainer);
    const diagonalFill = DOM.append(body, DOM.$(".diagonal-fill"));
    const cellHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".input-header-container"));
    const sourceContainer = DOM.append(diffEditorContainer, DOM.$(".source-container"));
    const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);
    const metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".metadata-header-container"));
    const metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$(".metadata-info-container"));
    const outputHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".output-header-container"));
    const outputInfoContainer = DOM.append(diffEditorContainer, DOM.$(".output-info-container"));
    const borderContainer = DOM.append(body, DOM.$(".border-container"));
    const leftBorder = DOM.append(borderContainer, DOM.$(".left-border"));
    const rightBorder = DOM.append(borderContainer, DOM.$(".right-border"));
    const topBorder = DOM.append(borderContainer, DOM.$(".top-border"));
    const bottomBorder = DOM.append(borderContainer, DOM.$(".bottom-border"));
    return {
      body,
      container,
      editorContainer,
      diffEditorContainer,
      diagonalFill,
      cellHeaderContainer,
      sourceEditor: editor,
      metadataHeaderContainer,
      metadataInfoContainer,
      outputHeaderContainer,
      outputInfoContainer,
      leftBorder,
      rightBorder,
      topBorder,
      bottomBorder,
      elementDisposables: new DisposableStore()
    };
  }
  _buildSourceEditor(sourceContainer) {
    return buildSourceEditor(this.instantiationService, this.notebookEditor, sourceContainer);
  }
  renderElement(element, index, templateData) {
    templateData.body.classList.remove("left", "right", "full");
    switch (element.type) {
      case "delete":
        templateData.elementDisposables.add(this.instantiationService.createInstance(DeletedElement, this.notebookEditor, element, templateData));
        return;
      case "insert":
        templateData.elementDisposables.add(this.instantiationService.createInstance(InsertElement, this.notebookEditor, element, templateData));
        return;
      default:
        break;
    }
  }
  disposeTemplate(templateData) {
    templateData.container.innerText = "";
    templateData.sourceEditor.dispose();
    templateData.elementDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
};
CellDiffSingleSideRenderer.TEMPLATE_ID = "cell_diff_single";
CellDiffSingleSideRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], CellDiffSingleSideRenderer);
let CellDiffSideBySideRenderer = class {
  constructor(notebookEditor, instantiationService, contextMenuService, keybindingService, menuService, contextKeyService, notificationService, themeService, accessibilityService) {
    this.notebookEditor = notebookEditor;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.notificationService = notificationService;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
  }
  get templateId() {
    return CellDiffSideBySideRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const body = DOM.$(".cell-body");
    DOM.append(container, body);
    const diffEditorContainer = DOM.$(".cell-diff-editor-container");
    DOM.append(body, diffEditorContainer);
    const cellHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".input-header-container"));
    const sourceContainer = DOM.append(diffEditorContainer, DOM.$(".source-container"));
    const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);
    const inputToolbarContainer = DOM.append(sourceContainer, DOM.$(".editor-input-toolbar-container"));
    const cellToolbarContainer = DOM.append(inputToolbarContainer, DOM.$("div.property-toolbar"));
    const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, cellToolbarContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          const item = new CodiconActionViewItem(action, { hoverDelegate: options.hoverDelegate }, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
          return item;
        }
        return void 0;
      },
      highlightToggledItems: true
    });
    const metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".metadata-header-container"));
    const metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$(".metadata-info-container"));
    const outputHeaderContainer = DOM.append(diffEditorContainer, DOM.$(".output-header-container"));
    const outputInfoContainer = DOM.append(diffEditorContainer, DOM.$(".output-info-container"));
    const borderContainer = DOM.append(body, DOM.$(".border-container"));
    const leftBorder = DOM.append(borderContainer, DOM.$(".left-border"));
    const rightBorder = DOM.append(borderContainer, DOM.$(".right-border"));
    const topBorder = DOM.append(borderContainer, DOM.$(".top-border"));
    const bottomBorder = DOM.append(borderContainer, DOM.$(".bottom-border"));
    const marginOverlay = new UnchangedCellOverlayWidget(body);
    const elementDisposables = new DisposableStore();
    return {
      body,
      container,
      diffEditorContainer,
      cellHeaderContainer,
      sourceEditor: editor,
      editorContainer,
      inputToolbarContainer,
      toolbar,
      metadataHeaderContainer,
      metadataInfoContainer,
      outputHeaderContainer,
      outputInfoContainer,
      leftBorder,
      rightBorder,
      topBorder,
      bottomBorder,
      marginOverlay,
      elementDisposables
    };
  }
  _buildSourceEditor(sourceContainer) {
    return buildDiffEditorWidget(this.instantiationService, this.notebookEditor, sourceContainer);
  }
  renderElement(element, index, templateData) {
    templateData.body.classList.remove("left", "right", "full");
    switch (element.type) {
      case "unchanged":
        templateData.elementDisposables.add(this.instantiationService.createInstance(ModifiedElement, this.notebookEditor, element, templateData));
        return;
      case "modified":
        templateData.elementDisposables.add(this.instantiationService.createInstance(ModifiedElement, this.notebookEditor, element, templateData));
        return;
      default:
        break;
    }
  }
  disposeTemplate(templateData) {
    templateData.container.innerText = "";
    templateData.sourceEditor.dispose();
    templateData.toolbar?.dispose();
    templateData.elementDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    if (templateData.toolbar) {
      templateData.toolbar.context = void 0;
    }
    templateData.elementDisposables.clear();
  }
};
CellDiffSideBySideRenderer.TEMPLATE_ID = "cell_diff_side_by_side";
CellDiffSideBySideRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IAccessibilityService)
], CellDiffSideBySideRenderer);
class NotebookMouseController extends MouseController {
  onViewPointer(e) {
    if (isMonacoEditor(e.browserEvent.target)) {
      const focus = typeof e.index === "undefined" ? [] : [e.index];
      this.list.setFocus(focus, e.browserEvent);
    } else {
      super.onViewPointer(e);
    }
  }
}
let NotebookTextDiffList = class extends WorkbenchList {
  get rowsContainer() {
    return this.view.containerDomNode;
  }
  constructor(listUser, container, delegate, renderers, contextKeyService, options, listService, configurationService, instantiationService) {
    super(listUser, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService);
  }
  createMouseController(options) {
    return new NotebookMouseController(this);
  }
  getCellViewScrollTop(element) {
    const index = this.indexOf(element);
    return this.view.elementTop(index);
  }
  getScrollHeight() {
    return this.view.scrollHeight;
  }
  triggerScrollFromMouseWheelEvent(browserEvent) {
    this.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this.view.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  clear() {
    super.splice(0, this.length);
  }
  updateElementHeight2(element, size) {
    const viewIndex = this.indexOf(element);
    const focused = this.getFocus();
    this.view.updateElementHeight(viewIndex, size, focused.length ? focused[0] : null);
  }
  style(styles) {
    const selectorSuffix = this.view.domId;
    if (!this.styleElement) {
      this.styleElement = domStylesheets.createStyleSheet(this.view.domNode);
    }
    const suffix = selectorSuffix && `.${selectorSuffix}`;
    const content = [];
    if (styles.listBackground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows { background: ${styles.listBackground}; }`);
    }
    if (styles.listFocusBackground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
    }
    if (styles.listActiveSelectionBackground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`);
    }
    if (styles.listActiveSelectionForeground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
    }
    if (styles.listFocusAndSelectionBackground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
    }
    if (styles.listFocusAndSelectionForeground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
    }
    if (styles.listInactiveFocusBackground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`);
    }
    if (styles.listInactiveSelectionBackground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`);
    }
    if (styles.listInactiveSelectionForeground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
    }
    if (styles.listHoverBackground) {
      content.push(`.monaco-list${suffix}:not(.drop-target) > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { background-color:  ${styles.listHoverBackground}; }`);
    }
    if (styles.listHoverForeground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
    }
    if (styles.listSelectionOutline) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listFocusOutline) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
    }
    if (styles.listInactiveFocusOutline) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
    }
    if (styles.listHoverOutline) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
    }
    if (styles.listDropOverBackground) {
      content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
    }
    const newStyles = content.join("\n");
    if (newStyles !== this.styleElement.textContent) {
      this.styleElement.textContent = newStyles;
    }
  }
};
NotebookTextDiffList = __decorateClass([
  __decorateParam(6, IListService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService)
], NotebookTextDiffList);
function buildDiffEditorWidget(instantiationService, notebookEditor, sourceContainer, options = {}) {
  const editorContainer = DOM.append(sourceContainer, DOM.$(".editor-container"));
  const editor = instantiationService.createInstance(DiffEditorWidget, editorContainer, {
    ...fixedDiffEditorOptions,
    overflowWidgetsDomNode: notebookEditor.getOverflowContainerDomNode(),
    originalEditable: false,
    ignoreTrimWhitespace: false,
    automaticLayout: false,
    dimension: {
      height: 0,
      width: 0
    },
    renderSideBySide: true,
    useInlineViewWhenSpaceIsLimited: false,
    ...options
  }, {
    originalEditor: getOptimizedNestedCodeEditorWidgetOptions(),
    modifiedEditor: getOptimizedNestedCodeEditorWidgetOptions()
  });
  return {
    editor,
    editorContainer
  };
}
function buildSourceEditor(instantiationService, notebookEditor, sourceContainer, options = {}) {
  const editorContainer = DOM.append(sourceContainer, DOM.$(".editor-container"));
  const skipContributions = [
    "editor.contrib.emptyTextEditorHint"
  ];
  const editor = instantiationService.createInstance(CodeEditorWidget, editorContainer, {
    ...fixedEditorOptions,
    glyphMargin: false,
    dimension: {
      width: (notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN) / 2 - 18,
      height: 0
    },
    automaticLayout: false,
    overflowWidgetsDomNode: notebookEditor.getOverflowContainerDomNode(),
    allowVariableLineHeights: false,
    readOnly: true
  }, {
    contributions: EditorExtensionsRegistry.getEditorContributions().filter((c) => skipContributions.indexOf(c.id) === -1)
  });
  return { editor, editorContainer };
}
export {
  CellDiffPlaceholderRenderer,
  CellDiffSideBySideRenderer,
  CellDiffSingleSideRenderer,
  NotebookCellTextDiffListDelegate,
  NotebookDocumentMetadataDiffRenderer,
  NotebookMouseController,
  NotebookTextDiffList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxkaWZmXFxub3RlYm9va0RpZmZMaXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL25vdGVib29rRGlmZi5jc3MnO1xuaW1wb3J0IHsgSUxpc3RNb3VzZUV2ZW50LCBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IElMaXN0T3B0aW9ucywgSUxpc3RTdHlsZXMsIGlzTW9uYWNvRWRpdG9yLCBJU3R5bGVDb250cm9sbGVyLCBNb3VzZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIElXb3JrYmVuY2hMaXN0T3B0aW9ucywgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaWZmRWxlbWVudFBsYWNlaG9sZGVyVmlld01vZGVsLCBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlLCBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFWaWV3TW9kZWwsIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCwgU2luZ2xlU2lkZURpZmZFbGVtZW50Vmlld01vZGVsIH0gZnJvbSAnLi9kaWZmRWxlbWVudFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyVGVtcGxhdGUsIENlbGxEaWZmU2lkZUJ5U2lkZVJlbmRlclRlbXBsYXRlLCBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJUZW1wbGF0ZSwgRElGRl9DRUxMX01BUkdJTiwgSU5vdGVib29rVGV4dERpZmZFZGl0b3IsIE5vdGVib29rRG9jdW1lbnREaWZmRWxlbWVudFJlbmRlclRlbXBsYXRlIH0gZnJvbSAnLi9ub3RlYm9va0RpZmZFZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxEaWZmUGxhY2Vob2xkZXJFbGVtZW50LCBDb2xsYXBzZWRDZWxsT3ZlcmxheVdpZGdldCwgRGVsZXRlZEVsZW1lbnQsIGdldE9wdGltaXplZE5lc3RlZENvZGVFZGl0b3JXaWRnZXRPcHRpb25zLCBJbnNlcnRFbGVtZW50LCBNb2RpZmllZEVsZW1lbnQsIE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YUVsZW1lbnQsIFVuY2hhbmdlZENlbGxPdmVybGF5V2lkZ2V0IH0gZnJvbSAnLi9kaWZmQ29tcG9uZW50cy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uL3ZpZXcvY2VsbFBhcnRzL2NlbGxBY3Rpb25WaWV3LmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm9Gcm9tU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBmaXhlZERpZmZFZGl0b3JPcHRpb25zLCBmaXhlZEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2RpZmZDZWxsRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ2VsbFRleHREaWZmTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SURpZmZFbGVtZW50Vmlld01vZGVsQmFzZT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0YXJnZXRXaW5kb3c6IFdpbmRvdyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpO1xuXHRcdHRoaXMubGluZUhlaWdodCA9IGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyhlZGl0b3JPcHRpb25zLCBQaXhlbFJhdGlvLmdldEluc3RhbmNlKHRhcmdldFdpbmRvdykudmFsdWUpLmxpbmVIZWlnaHQ7XG5cdH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuZ2V0SGVpZ2h0KHRoaXMubGluZUhlaWdodCk7XG5cdH1cblxuXHRoYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoZWxlbWVudC50eXBlKSB7XG5cdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0Y2FzZSAnaW5zZXJ0Jzpcblx0XHRcdFx0cmV0dXJuIENlbGxEaWZmU2luZ2xlU2lkZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0Y2FzZSAndW5jaGFuZ2VkJzpcblx0XHRcdFx0cmV0dXJuIENlbGxEaWZmU2lkZUJ5U2lkZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdFx0Y2FzZSAncGxhY2Vob2xkZXInOlxuXHRcdFx0XHRyZXR1cm4gQ2VsbERpZmZQbGFjZWhvbGRlclJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdFx0Y2FzZSAnbW9kaWZpZWRNZXRhZGF0YSc6XG5cdFx0XHRjYXNlICd1bmNoYW5nZWRNZXRhZGF0YSc6XG5cdFx0XHRcdHJldHVybiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFEaWZmUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPERpZmZFbGVtZW50UGxhY2Vob2xkZXJWaWV3TW9kZWwsIENlbGxEaWZmUGxhY2Vob2xkZXJSZW5kZXJUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnY2VsbF9kaWZmX3BsYWNlaG9sZGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rVGV4dERpZmZFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogQ2VsbERpZmZQbGFjZWhvbGRlclJlbmRlclRlbXBsYXRlIHtcblx0XHRjb25zdCBib2R5ID0gRE9NLiQoJy5jZWxsLXBsYWNlaG9sZGVyLWJvZHknKTtcblx0XHRET00uYXBwZW5kKGNvbnRhaW5lciwgYm9keSk7XG5cblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbWFyZ2luT3ZlcmxheSA9IG5ldyBDb2xsYXBzZWRDZWxsT3ZlcmxheVdpZGdldChib2R5KTtcblx0XHRjb25zdCBjb250ZW50cyA9IERPTS5hcHBlbmQoYm9keSwgRE9NLiQoJy5jb250ZW50cycpKTtcblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IERPTS5hcHBlbmQoY29udGVudHMsIERPTS4kKCdzcGFuLnRleHQnLCB7IHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5oaWRkZW5DZWxscy5leHBhbmRBbGwnLCAnRG91YmxlIGNsaWNrIHRvIHNob3cnKSB9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ym9keSxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHBsYWNlaG9sZGVyLFxuXHRcdFx0bWFyZ2luT3ZlcmxheSxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IERpZmZFbGVtZW50UGxhY2Vob2xkZXJWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQ2VsbERpZmZQbGFjZWhvbGRlclJlbmRlclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbGVmdCcsICdyaWdodCcsICdmdWxsJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsRGlmZlBsYWNlaG9sZGVyRWxlbWVudCwgZWxlbWVudCwgdGVtcGxhdGVEYXRhKSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogRGlmZkVsZW1lbnRQbGFjZWhvbGRlclZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YURpZmZSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8Tm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhVmlld01vZGVsLCBOb3RlYm9va0RvY3VtZW50RGlmZkVsZW1lbnRSZW5kZXJUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnbm90ZWJvb2tfbWV0YWRhdGFfZGlmZl9zaWRlX2J5X3NpZGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhRGlmZlJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IE5vdGVib29rRG9jdW1lbnREaWZmRWxlbWVudFJlbmRlclRlbXBsYXRlIHtcblx0XHRjb25zdCBib2R5ID0gRE9NLiQoJy5jZWxsLWJvZHknKTtcblx0XHRET00uYXBwZW5kKGNvbnRhaW5lciwgYm9keSk7XG5cdFx0Y29uc3QgZGlmZkVkaXRvckNvbnRhaW5lciA9IERPTS4kKCcuY2VsbC1kaWZmLWVkaXRvci1jb250YWluZXInKTtcblx0XHRET00uYXBwZW5kKGJvZHksIGRpZmZFZGl0b3JDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgY2VsbEhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5pbnB1dC1oZWFkZXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5zb3VyY2UtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHsgZWRpdG9yLCBlZGl0b3JDb250YWluZXIgfSA9IHRoaXMuX2J1aWxkU291cmNlRWRpdG9yKHNvdXJjZUNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBpbnB1dFRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKHNvdXJjZUNvbnRhaW5lciwgRE9NLiQoJy5lZGl0b3ItaW5wdXQtdG9vbGJhci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGlucHV0VG9vbGJhckNvbnRhaW5lciwgRE9NLiQoJ2Rpdi5wcm9wZXJ0eS10b29sYmFyJykpO1xuXHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGNlbGxUb29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBuZXcgQ29kaWNvbkFjdGlvblZpZXdJdGVtKGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnRoZW1lU2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IGJvcmRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQoYm9keSwgRE9NLiQoJy5ib3JkZXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGxlZnRCb3JkZXIgPSBET00uYXBwZW5kKGJvcmRlckNvbnRhaW5lciwgRE9NLiQoJy5sZWZ0LWJvcmRlcicpKTtcblx0XHRjb25zdCByaWdodEJvcmRlciA9IERPTS5hcHBlbmQoYm9yZGVyQ29udGFpbmVyLCBET00uJCgnLnJpZ2h0LWJvcmRlcicpKTtcblx0XHRjb25zdCB0b3BCb3JkZXIgPSBET00uYXBwZW5kKGJvcmRlckNvbnRhaW5lciwgRE9NLiQoJy50b3AtYm9yZGVyJykpO1xuXHRcdGNvbnN0IGJvdHRvbUJvcmRlciA9IERPTS5hcHBlbmQoYm9yZGVyQ29udGFpbmVyLCBET00uJCgnLmJvdHRvbS1ib3JkZXInKSk7XG5cdFx0Y29uc3QgbWFyZ2luT3ZlcmxheSA9IG5ldyBVbmNoYW5nZWRDZWxsT3ZlcmxheVdpZGdldChib2R5KTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ym9keSxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGRpZmZFZGl0b3JDb250YWluZXIsXG5cdFx0XHRjZWxsSGVhZGVyQ29udGFpbmVyLFxuXHRcdFx0c291cmNlRWRpdG9yOiBlZGl0b3IsXG5cdFx0XHRlZGl0b3JDb250YWluZXIsXG5cdFx0XHRpbnB1dFRvb2xiYXJDb250YWluZXIsXG5cdFx0XHR0b29sYmFyLFxuXHRcdFx0bGVmdEJvcmRlcixcblx0XHRcdHJpZ2h0Qm9yZGVyLFxuXHRcdFx0dG9wQm9yZGVyLFxuXHRcdFx0Ym90dG9tQm9yZGVyLFxuXHRcdFx0bWFyZ2luT3ZlcmxheSxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZFNvdXJjZUVkaXRvcihzb3VyY2VDb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGJ1aWxkRGlmZkVkaXRvcldpZGdldCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLm5vdGVib29rRWRpdG9yLCBzb3VyY2VDb250YWluZXIsIHsgcmVhZE9ubHk6IHRydWUgfSk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBOb3RlYm9va0RvY3VtZW50RGlmZkVsZW1lbnRSZW5kZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ2Z1bGwnKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YUVsZW1lbnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGVsZW1lbnQsIHRlbXBsYXRlRGF0YSkpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogTm90ZWJvb2tEb2N1bWVudERpZmZFbGVtZW50UmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS50b29sYmFyPy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogTm90ZWJvb2tEb2N1bWVudERpZmZFbGVtZW50UmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAodGVtcGxhdGVEYXRhLnRvb2xiYXIpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50b29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8U2luZ2xlU2lkZURpZmZFbGVtZW50Vmlld01vZGVsLCBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJUZW1wbGF0ZSB8IENlbGxEaWZmU2lkZUJ5U2lkZVJlbmRlclRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjZWxsX2RpZmZfc2luZ2xlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rVGV4dERpZmZFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgYm9keSA9IERPTS4kKCcuY2VsbC1ib2R5Jyk7XG5cdFx0RE9NLmFwcGVuZChjb250YWluZXIsIGJvZHkpO1xuXHRcdGNvbnN0IGRpZmZFZGl0b3JDb250YWluZXIgPSBET00uJCgnLmNlbGwtZGlmZi1lZGl0b3ItY29udGFpbmVyJyk7XG5cdFx0RE9NLmFwcGVuZChib2R5LCBkaWZmRWRpdG9yQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGRpYWdvbmFsRmlsbCA9IERPTS5hcHBlbmQoYm9keSwgRE9NLiQoJy5kaWFnb25hbC1maWxsJykpO1xuXG5cdFx0Y29uc3QgY2VsbEhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5pbnB1dC1oZWFkZXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5zb3VyY2UtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHsgZWRpdG9yLCBlZGl0b3JDb250YWluZXIgfSA9IHRoaXMuX2J1aWxkU291cmNlRWRpdG9yKHNvdXJjZUNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBtZXRhZGF0YUhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5tZXRhZGF0YS1oZWFkZXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IG1ldGFkYXRhSW5mb0NvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5tZXRhZGF0YS1pbmZvLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IG91dHB1dEhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5vdXRwdXQtaGVhZGVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBvdXRwdXRJbmZvQ29udGFpbmVyID0gRE9NLmFwcGVuZChkaWZmRWRpdG9yQ29udGFpbmVyLCBET00uJCgnLm91dHB1dC1pbmZvLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGJvcmRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQoYm9keSwgRE9NLiQoJy5ib3JkZXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGxlZnRCb3JkZXIgPSBET00uYXBwZW5kKGJvcmRlckNvbnRhaW5lciwgRE9NLiQoJy5sZWZ0LWJvcmRlcicpKTtcblx0XHRjb25zdCByaWdodEJvcmRlciA9IERPTS5hcHBlbmQoYm9yZGVyQ29udGFpbmVyLCBET00uJCgnLnJpZ2h0LWJvcmRlcicpKTtcblx0XHRjb25zdCB0b3BCb3JkZXIgPSBET00uYXBwZW5kKGJvcmRlckNvbnRhaW5lciwgRE9NLiQoJy50b3AtYm9yZGVyJykpO1xuXHRcdGNvbnN0IGJvdHRvbUJvcmRlciA9IERPTS5hcHBlbmQoYm9yZGVyQ29udGFpbmVyLCBET00uJCgnLmJvdHRvbS1ib3JkZXInKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ym9keSxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGVkaXRvckNvbnRhaW5lcixcblx0XHRcdGRpZmZFZGl0b3JDb250YWluZXIsXG5cdFx0XHRkaWFnb25hbEZpbGwsXG5cdFx0XHRjZWxsSGVhZGVyQ29udGFpbmVyLFxuXHRcdFx0c291cmNlRWRpdG9yOiBlZGl0b3IsXG5cdFx0XHRtZXRhZGF0YUhlYWRlckNvbnRhaW5lcixcblx0XHRcdG1ldGFkYXRhSW5mb0NvbnRhaW5lcixcblx0XHRcdG91dHB1dEhlYWRlckNvbnRhaW5lcixcblx0XHRcdG91dHB1dEluZm9Db250YWluZXIsXG5cdFx0XHRsZWZ0Qm9yZGVyLFxuXHRcdFx0cmlnaHRCb3JkZXIsXG5cdFx0XHR0b3BCb3JkZXIsXG5cdFx0XHRib3R0b21Cb3JkZXIsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZFNvdXJjZUVkaXRvcihzb3VyY2VDb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGJ1aWxkU291cmNlRWRpdG9yKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMubm90ZWJvb2tFZGl0b3IsIHNvdXJjZUNvbnRhaW5lcik7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IFNpbmdsZVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ2xlZnQnLCAncmlnaHQnLCAnZnVsbCcpO1xuXG5cdFx0c3dpdGNoIChlbGVtZW50LnR5cGUpIHtcblx0XHRcdGNhc2UgJ2RlbGV0ZSc6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVsZXRlZEVsZW1lbnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGVsZW1lbnQsIHRlbXBsYXRlRGF0YSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc2VydEVsZW1lbnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGVsZW1lbnQsIHRlbXBsYXRlRGF0YSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUVkaXRvci5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBTaW5nbGVTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQ2VsbERpZmZTaW5nbGVTaWRlUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCwgQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NlbGxfZGlmZl9zaWRlX2J5X3NpZGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyVGVtcGxhdGUge1xuXHRcdGNvbnN0IGJvZHkgPSBET00uJCgnLmNlbGwtYm9keScpO1xuXHRcdERPTS5hcHBlbmQoY29udGFpbmVyLCBib2R5KTtcblx0XHRjb25zdCBkaWZmRWRpdG9yQ29udGFpbmVyID0gRE9NLiQoJy5jZWxsLWRpZmYtZWRpdG9yLWNvbnRhaW5lcicpO1xuXHRcdERPTS5hcHBlbmQoYm9keSwgZGlmZkVkaXRvckNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBjZWxsSGVhZGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChkaWZmRWRpdG9yQ29udGFpbmVyLCBET00uJCgnLmlucHV0LWhlYWRlci1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgc291cmNlQ29udGFpbmVyID0gRE9NLmFwcGVuZChkaWZmRWRpdG9yQ29udGFpbmVyLCBET00uJCgnLnNvdXJjZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgeyBlZGl0b3IsIGVkaXRvckNvbnRhaW5lciB9ID0gdGhpcy5fYnVpbGRTb3VyY2VFZGl0b3Ioc291cmNlQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGlucHV0VG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoc291cmNlQ29udGFpbmVyLCBET00uJCgnLmVkaXRvci1pbnB1dC10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjZWxsVG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoaW5wdXRUb29sYmFyQ29udGFpbmVyLCBET00uJCgnZGl2LnByb3BlcnR5LXRvb2xiYXInKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgY2VsbFRvb2xiYXJDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IG5ldyBDb2RpY29uQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9LCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMudGhlbWVTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwgdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWV0YWRhdGFIZWFkZXJDb250YWluZXIgPSBET00uYXBwZW5kKGRpZmZFZGl0b3JDb250YWluZXIsIERPTS4kKCcubWV0YWRhdGEtaGVhZGVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBtZXRhZGF0YUluZm9Db250YWluZXIgPSBET00uYXBwZW5kKGRpZmZFZGl0b3JDb250YWluZXIsIERPTS4kKCcubWV0YWRhdGEtaW5mby1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBvdXRwdXRIZWFkZXJDb250YWluZXIgPSBET00uYXBwZW5kKGRpZmZFZGl0b3JDb250YWluZXIsIERPTS4kKCcub3V0cHV0LWhlYWRlci1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgb3V0cHV0SW5mb0NvbnRhaW5lciA9IERPTS5hcHBlbmQoZGlmZkVkaXRvckNvbnRhaW5lciwgRE9NLiQoJy5vdXRwdXQtaW5mby1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBib3JkZXJDb250YWluZXIgPSBET00uYXBwZW5kKGJvZHksIERPTS4kKCcuYm9yZGVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBsZWZ0Qm9yZGVyID0gRE9NLmFwcGVuZChib3JkZXJDb250YWluZXIsIERPTS4kKCcubGVmdC1ib3JkZXInKSk7XG5cdFx0Y29uc3QgcmlnaHRCb3JkZXIgPSBET00uYXBwZW5kKGJvcmRlckNvbnRhaW5lciwgRE9NLiQoJy5yaWdodC1ib3JkZXInKSk7XG5cdFx0Y29uc3QgdG9wQm9yZGVyID0gRE9NLmFwcGVuZChib3JkZXJDb250YWluZXIsIERPTS4kKCcudG9wLWJvcmRlcicpKTtcblx0XHRjb25zdCBib3R0b21Cb3JkZXIgPSBET00uYXBwZW5kKGJvcmRlckNvbnRhaW5lciwgRE9NLiQoJy5ib3R0b20tYm9yZGVyJykpO1xuXHRcdGNvbnN0IG1hcmdpbk92ZXJsYXkgPSBuZXcgVW5jaGFuZ2VkQ2VsbE92ZXJsYXlXaWRnZXQoYm9keSk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGJvZHksXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRkaWZmRWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0Y2VsbEhlYWRlckNvbnRhaW5lcixcblx0XHRcdHNvdXJjZUVkaXRvcjogZWRpdG9yLFxuXHRcdFx0ZWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0aW5wdXRUb29sYmFyQ29udGFpbmVyLFxuXHRcdFx0dG9vbGJhcixcblx0XHRcdG1ldGFkYXRhSGVhZGVyQ29udGFpbmVyLFxuXHRcdFx0bWV0YWRhdGFJbmZvQ29udGFpbmVyLFxuXHRcdFx0b3V0cHV0SGVhZGVyQ29udGFpbmVyLFxuXHRcdFx0b3V0cHV0SW5mb0NvbnRhaW5lcixcblx0XHRcdGxlZnRCb3JkZXIsXG5cdFx0XHRyaWdodEJvcmRlcixcblx0XHRcdHRvcEJvcmRlcixcblx0XHRcdGJvdHRvbUJvcmRlcixcblx0XHRcdG1hcmdpbk92ZXJsYXksXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRTb3VyY2VFZGl0b3Ioc291cmNlQ29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHJldHVybiBidWlsZERpZmZFZGl0b3JXaWRnZXQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5ub3RlYm9va0VkaXRvciwgc291cmNlQ29udGFpbmVyKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IENlbGxEaWZmU2lkZUJ5U2lkZVJlbmRlclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbGVmdCcsICdyaWdodCcsICdmdWxsJyk7XG5cblx0XHRzd2l0Y2ggKGVsZW1lbnQudHlwZSkge1xuXHRcdFx0Y2FzZSAndW5jaGFuZ2VkJzpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2RpZmllZEVsZW1lbnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGVsZW1lbnQsIHRlbXBsYXRlRGF0YSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICdtb2RpZmllZCc6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kaWZpZWRFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yLCBlbGVtZW50LCB0ZW1wbGF0ZURhdGEpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS50b29sYmFyPy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAodGVtcGxhdGVEYXRhLnRvb2xiYXIpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50b29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tNb3VzZUNvbnRyb2xsZXI8VD4gZXh0ZW5kcyBNb3VzZUNvbnRyb2xsZXI8VD4ge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25WaWV3UG9pbnRlcihlOiBJTGlzdE1vdXNlRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRpZiAoaXNNb25hY29FZGl0b3IoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0eXBlb2YgZS5pbmRleCA9PT0gJ3VuZGVmaW5lZCcgPyBbXSA6IFtlLmluZGV4XTtcblx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhmb2N1cywgZS5icm93c2VyRXZlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tUZXh0RGlmZkxpc3QgZXh0ZW5kcyBXb3JrYmVuY2hMaXN0PElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2U+IGltcGxlbWVudHMgSURpc3Bvc2FibGUsIElTdHlsZUNvbnRyb2xsZXIge1xuXHRwcml2YXRlIHN0eWxlRWxlbWVudD86IEhUTUxTdHlsZUVsZW1lbnQ7XG5cblx0Z2V0IHJvd3NDb250YWluZXIoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuY29udGFpbmVyRG9tTm9kZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxpc3RVc2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SURpZmZFbGVtZW50Vmlld01vZGVsQmFzZT4sXG5cdFx0cmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UsIENlbGxEaWZmU2luZ2xlU2lkZVJlbmRlclRlbXBsYXRlIHwgQ2VsbERpZmZTaWRlQnlTaWRlUmVuZGVyVGVtcGxhdGUgfCBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyVGVtcGxhdGUgfCBOb3RlYm9va0RvY3VtZW50RGlmZkVsZW1lbnRSZW5kZXJUZW1wbGF0ZT5bXSxcblx0XHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hMaXN0T3B0aW9uczxJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlPixcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdHN1cGVyKGxpc3RVc2VyLCBjb250YWluZXIsIGRlbGVnYXRlLCByZW5kZXJlcnMsIG9wdGlvbnMsIGNvbnRleHRLZXlTZXJ2aWNlLCBsaXN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVNb3VzZUNvbnRyb2xsZXIob3B0aW9uczogSUxpc3RPcHRpb25zPElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2U+KTogTW91c2VDb250cm9sbGVyPElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2U+IHtcblx0XHRyZXR1cm4gbmV3IE5vdGVib29rTW91c2VDb250cm9sbGVyKHRoaXMpO1xuXHR9XG5cblx0Z2V0Q2VsbFZpZXdTY3JvbGxUb3AoZWxlbWVudDogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmluZGV4T2YoZWxlbWVudCk7XG5cdFx0Ly8gaWYgKGluZGV4ID09PSB1bmRlZmluZWQgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0Ly8gXHR0aGlzLl9nZXRWaWV3SW5kZXhVcHBlckJvdW5kKGVsZW1lbnQpO1xuXHRcdC8vIFx0dGhyb3cgbmV3IExpc3RFcnJvcih0aGlzLmxpc3RVc2VyLCBgSW52YWxpZCBpbmRleCAke2luZGV4fWApO1xuXHRcdC8vIH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXcuZWxlbWVudFRvcChpbmRleCk7XG5cdH1cblxuXHRnZXRTY3JvbGxIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxIZWlnaHQ7XG5cdH1cblxuXHR0cmlnZ2VyU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpIHtcblx0XHR0aGlzLnZpZXcuZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRkZWxlZ2F0ZVZlcnRpY2FsU2Nyb2xsYmFyUG9pbnRlckRvd24oYnJvd3NlckV2ZW50OiBQb2ludGVyRXZlbnQpIHtcblx0XHR0aGlzLnZpZXcuZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHRzdXBlci5zcGxpY2UoMCwgdGhpcy5sZW5ndGgpO1xuXHR9XG5cblxuXHR1cGRhdGVFbGVtZW50SGVpZ2h0MihlbGVtZW50OiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlLCBzaXplOiBudW1iZXIpIHtcblx0XHRjb25zdCB2aWV3SW5kZXggPSB0aGlzLmluZGV4T2YoZWxlbWVudCk7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuZ2V0Rm9jdXMoKTtcblxuXHRcdHRoaXMudmlldy51cGRhdGVFbGVtZW50SGVpZ2h0KHZpZXdJbmRleCwgc2l6ZSwgZm9jdXNlZC5sZW5ndGggPyBmb2N1c2VkWzBdIDogbnVsbCk7XG5cdH1cblxuXHRvdmVycmlkZSBzdHlsZShzdHlsZXM6IElMaXN0U3R5bGVzKSB7XG5cdFx0Y29uc3Qgc2VsZWN0b3JTdWZmaXggPSB0aGlzLnZpZXcuZG9tSWQ7XG5cdFx0aWYgKCF0aGlzLnN0eWxlRWxlbWVudCkge1xuXHRcdFx0dGhpcy5zdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0cy5jcmVhdGVTdHlsZVNoZWV0KHRoaXMudmlldy5kb21Ob2RlKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3VmZml4ID0gc2VsZWN0b3JTdWZmaXggJiYgYC4ke3NlbGVjdG9yU3VmZml4fWA7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGlmIChzdHlsZXMubGlzdEJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyB7IGJhY2tncm91bmQ6ICR7c3R5bGVzLmxpc3RCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0JhY2tncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0ZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyA+IGRpdi5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdFx0Lm1vbmFjby1kcmFnLWltYWdlJHtzdWZmaXh9LFxuXHRcdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZC5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZH07IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdFx0Lm1vbmFjby1kcmFnLWltYWdlJHtzdWZmaXh9LFxuXHRcdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZC5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmR9OyB9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBjb2xvcjogJHtzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RIb3ZlckJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9Om5vdCguZHJvcC10YXJnZXQpID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3c6aG92ZXI6bm90KC5zZWxlY3RlZCk6bm90KC5mb2N1c2VkKSB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SG92ZXJCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEhvdmVyRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdzpob3Zlcjpub3QoLnNlbGVjdGVkKTpub3QoLmZvY3VzZWQpIHsgY29sb3I6ICAke3N0eWxlcy5saXN0SG92ZXJGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdFNlbGVjdGlvbk91dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7c3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tZHJhZy1pbWFnZSR7c3VmZml4fSxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IDFweCBzb2xpZCAke3N0eWxlcy5saXN0Rm9jdXNPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSA+IGRpdi5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SG92ZXJPdXRsaW5lKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSA+IGRpdi5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93OmhvdmVyIHsgb3V0bGluZTogMXB4IGRhc2hlZCAke3N0eWxlcy5saXN0SG92ZXJPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3REcm9wT3ZlckJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fS5kcm9wLXRhcmdldCxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cy5kcm9wLXRhcmdldCxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93LmRyb3AtdGFyZ2V0IHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdERyb3BPdmVyQmFja2dyb3VuZH0gIWltcG9ydGFudDsgY29sb3I6IGluaGVyaXQgIWltcG9ydGFudDsgfVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U3R5bGVzID0gY29udGVudC5qb2luKCdcXG4nKTtcblx0XHRpZiAobmV3U3R5bGVzICE9PSB0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCkge1xuXHRcdFx0dGhpcy5zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBuZXdTdHlsZXM7XG5cdFx0fVxuXHR9XG59XG5cblxuZnVuY3Rpb24gYnVpbGREaWZmRWRpdG9yV2lkZ2V0KGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvciwgc291cmNlQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zID0ge30pIHtcblx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gRE9NLmFwcGVuZChzb3VyY2VDb250YWluZXIsIERPTS4kKCcuZWRpdG9yLWNvbnRhaW5lcicpKTtcblxuXHRjb25zdCBlZGl0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9yV2lkZ2V0LCBlZGl0b3JDb250YWluZXIsIHtcblx0XHQuLi5maXhlZERpZmZFZGl0b3JPcHRpb25zLFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IG5vdGVib29rRWRpdG9yLmdldE92ZXJmbG93Q29udGFpbmVyRG9tTm9kZSgpLFxuXHRcdG9yaWdpbmFsRWRpdGFibGU6IGZhbHNlLFxuXHRcdGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSxcblx0XHRhdXRvbWF0aWNMYXlvdXQ6IGZhbHNlLFxuXHRcdGRpbWVuc2lvbjoge1xuXHRcdFx0aGVpZ2h0OiAwLFxuXHRcdFx0d2lkdGg6IDBcblx0XHR9LFxuXHRcdHJlbmRlclNpZGVCeVNpZGU6IHRydWUsXG5cdFx0dXNlSW5saW5lVmlld1doZW5TcGFjZUlzTGltaXRlZDogZmFsc2UsXG5cdFx0Li4ub3B0aW9uc1xuXHR9LCB7XG5cdFx0b3JpZ2luYWxFZGl0b3I6IGdldE9wdGltaXplZE5lc3RlZENvZGVFZGl0b3JXaWRnZXRPcHRpb25zKCksXG5cdFx0bW9kaWZpZWRFZGl0b3I6IGdldE9wdGltaXplZE5lc3RlZENvZGVFZGl0b3JXaWRnZXRPcHRpb25zKClcblx0fSk7XG5cblx0cmV0dXJuIHtcblx0XHRlZGl0b3IsXG5cdFx0ZWRpdG9yQ29udGFpbmVyXG5cdH07XG59XG5cbmZ1bmN0aW9uIGJ1aWxkU291cmNlRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvciwgc291cmNlQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgPSB7fSkge1xuXHRjb25zdCBlZGl0b3JDb250YWluZXIgPSBET00uYXBwZW5kKHNvdXJjZUNvbnRhaW5lciwgRE9NLiQoJy5lZGl0b3ItY29udGFpbmVyJykpO1xuXHRjb25zdCBza2lwQ29udHJpYnV0aW9ucyA9IFtcblx0XHQnZWRpdG9yLmNvbnRyaWIuZW1wdHlUZXh0RWRpdG9ySGludCdcblx0XTtcblx0Y29uc3QgZWRpdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgZWRpdG9yQ29udGFpbmVyLCB7XG5cdFx0Li4uZml4ZWRFZGl0b3JPcHRpb25zLFxuXHRcdGdseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRkaW1lbnNpb246IHtcblx0XHRcdHdpZHRoOiAobm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoIC0gMiAqIERJRkZfQ0VMTF9NQVJHSU4pIC8gMiAtIDE4LFxuXHRcdFx0aGVpZ2h0OiAwXG5cdFx0fSxcblx0XHRhdXRvbWF0aWNMYXlvdXQ6IGZhbHNlLFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IG5vdGVib29rRWRpdG9yLmdldE92ZXJmbG93Q29udGFpbmVyRG9tTm9kZSgpLFxuXHRcdGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0czogZmFsc2UsXG5cdFx0cmVhZE9ubHk6IHRydWUsXG5cdH0sIHtcblx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpLmZpbHRlcihjID0+IHNraXBDb250cmlidXRpb25zLmluZGV4T2YoYy5pZCkgPT09IC0xKVxuXHR9KTtcblxuXHRyZXR1cm4geyBlZGl0b3IsIGVkaXRvckNvbnRhaW5lciB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBRVAsWUFBWSxTQUFTO0FBQ3JCLFlBQVksb0JBQW9CO0FBQ2hDLFNBQW9DLGdCQUFrQyx1QkFBdUI7QUFDN0YsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxjQUFxQyxxQkFBcUI7QUFDbkUsU0FBUyxxQkFBcUI7QUFFOUIsU0FBZ0gsd0JBQTRGO0FBQzVNLFNBQVMsNEJBQTRCLDRCQUE0QixnQkFBZ0IsMkNBQTJDLGVBQWUs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
