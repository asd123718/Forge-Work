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
import * as dom from "../../../../base/browser/dom.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import * as lifecycle from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { ContentWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ModelDecorationOptions } from "../../../../editor/common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import * as nls from "../../../../nls.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { asCssVariable, editorHoverBackground, editorHoverBorder, editorHoverForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IDebugService } from "../common/debug.js";
import { Expression, Variable, VisualizedExpression } from "../common/debugModel.js";
import { getEvaluatableExpressionAtPosition } from "../common/debugUtils.js";
import { AbstractExpressionDataSource } from "./baseDebugView.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
import { VariablesRenderer, VisualizedVariableRenderer, openContextMenuForVariableTreeElement } from "./variablesView.js";
const $ = dom.$;
var ShowDebugHoverResult = /* @__PURE__ */ ((ShowDebugHoverResult2) => {
  ShowDebugHoverResult2[ShowDebugHoverResult2["NOT_CHANGED"] = 0] = "NOT_CHANGED";
  ShowDebugHoverResult2[ShowDebugHoverResult2["NOT_AVAILABLE"] = 1] = "NOT_AVAILABLE";
  ShowDebugHoverResult2[ShowDebugHoverResult2["CANCELLED"] = 2] = "CANCELLED";
  return ShowDebugHoverResult2;
})(ShowDebugHoverResult || {});
async function doFindExpression(container, namesToFind) {
  if (!container) {
    return null;
  }
  const children = await container.getChildren();
  const filtered = children.filter((v) => namesToFind[0] === v.name);
  if (filtered.length !== 1) {
    return null;
  }
  if (namesToFind.length === 1) {
    return filtered[0];
  } else {
    return doFindExpression(filtered[0], namesToFind.slice(1));
  }
}
async function findExpressionInStackFrame(stackFrame, namesToFind) {
  const scopes = await stackFrame.getScopes();
  const nonExpensive = scopes.filter((s) => !s.expensive);
  const expressions = coalesce(await Promise.all(nonExpensive.map((scope) => doFindExpression(scope, namesToFind))));
  return expressions.length > 0 && expressions.every((e) => e.value === expressions[0].value) ? expressions[0] : void 0;
}
let DebugHoverWidget = class {
  constructor(editor, debugService, instantiationService, menuService, contextKeyService, contextMenuService) {
    this.editor = editor;
    this.debugService = debugService;
    this.instantiationService = instantiationService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    // editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this.isUpdatingTree = false;
    this.highlightDecorations = this.editor.createDecorationsCollection();
    this.toDispose = [];
    this.showAtPosition = null;
    this.positionPreference = [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
    this.debugHoverComputer = this.instantiationService.createInstance(DebugHoverComputer, this.editor);
    this.expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
  }
  get isShowingComplexValue() {
    return this.complexValueContainer?.hidden === false;
  }
  create() {
    this.domNode = $(".debug-hover-widget");
    this.complexValueContainer = dom.append(this.domNode, $(".complex-value"));
    this.complexValueTitle = dom.append(this.complexValueContainer, $(".title"));
    this.treeContainer = dom.append(this.complexValueContainer, $(".debug-hover-tree"));
    this.treeContainer.setAttribute("role", "tree");
    const tip = dom.append(this.complexValueContainer, $(".tip"));
    tip.textContent = nls.localize({ key: "quickTip", comment: ['"switch to editor language hover" means to show the programming language hover widget instead of the debug hover'] }, "Hold {0} key to switch to editor language hover", isMacintosh ? "Option" : "Alt");
    const dataSource = this.instantiationService.createInstance(DebugHoverDataSource);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "DebugHover",
      this.treeContainer,
      new DebugHoverDelegate(),
      [
        this.instantiationService.createInstance(VariablesRenderer, this.expressionRenderer),
        this.instantiationService.createInstance(VisualizedVariableRenderer, this.expressionRenderer)
      ],
      dataSource,
      {
        accessibilityProvider: new DebugHoverAccessibilityProvider(),
        mouseSupport: false,
        horizontalScrolling: true,
        useShadows: false,
        keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.name },
        overrideStyles: {
          listBackground: editorHoverBackground
        }
      }
    );
    this.toDispose.push(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
    this.toDispose.push(this.tree);
    this.valueContainer = $(".value");
    this.valueContainer.tabIndex = 0;
    this.valueContainer.setAttribute("role", "tooltip");
    this.scrollbar = new DomScrollableElement(this.valueContainer, { horizontal: ScrollbarVisibility.Hidden });
    this.domNode.appendChild(this.scrollbar.getDomNode());
    this.toDispose.push(this.scrollbar);
    this.editor.applyFontInfo(this.domNode);
    this.domNode.style.backgroundColor = asCssVariable(editorHoverBackground);
    this.domNode.style.border = `1px solid ${asCssVariable(editorHoverBorder)}`;
    this.domNode.style.color = asCssVariable(editorHoverForeground);
    this.toDispose.push(this.tree.onContextMenu(async (e) => await this.onContextMenu(e)));
    this.toDispose.push(this.tree.onDidChangeContentHeight(() => {
      if (!this.isUpdatingTree) {
        this.layoutTreeAndContainer();
      }
    }));
    this.toDispose.push(this.tree.onDidChangeContentWidth(() => {
      if (!this.isUpdatingTree) {
        this.layoutTreeAndContainer();
      }
    }));
    this.registerListeners();
    this.editor.addContentWidget(this);
  }
  async onContextMenu(e) {
    const variable = e.element;
    if (!(variable instanceof Variable) || !variable.value) {
      return;
    }
    return openContextMenuForVariableTreeElement(this.contextKeyService, this.menuService, this.contextMenuService, MenuId.DebugHoverContext, e);
  }
  registerListeners() {
    this.toDispose.push(dom.addStandardDisposableListener(this.domNode, "keydown", (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
      }
    }));
    this.toDispose.push(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this.editor.applyFontInfo(this.domNode);
      }
    }));
    this.toDispose.push(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
      if (e instanceof Variable && this.tree.hasNode(e)) {
        await this.tree.updateChildren(e, false, true);
        await this.tree.expand(e);
      }
    }));
  }
  isHovered() {
    return !!this.domNode?.matches(":hover");
  }
  isVisible() {
    return !!this._isVisible;
  }
  willBeVisible() {
    return !!this.showCancellationSource;
  }
  getId() {
    return DebugHoverWidget.ID;
  }
  getDomNode() {
    return this.domNode;
  }
  /**
   * Gets whether the given coordinates are in the safe triangle formed from
   * the position at which the hover was initiated.
   */
  isInSafeTriangle(x, y) {
    return this._isVisible && !!this.safeTriangle?.contains(x, y);
  }
  async showAt(position, focus, mouseEvent) {
    this.showCancellationSource?.dispose(true);
    const cancellationSource = this.showCancellationSource = new CancellationTokenSource();
    const session = this.debugService.getViewModel().focusedSession;
    if (!session || !this.editor.hasModel()) {
      this.hide();
      return 1 /* NOT_AVAILABLE */;
    }
    const result = await this.debugHoverComputer.compute(position, cancellationSource.token);
    if (cancellationSource.token.isCancellationRequested) {
      this.hide();
      return 2 /* CANCELLED */;
    }
    if (!result.range) {
      this.hide();
      return 1 /* NOT_AVAILABLE */;
    }
    if (this.isVisible() && !result.rangeChanged) {
      return 0 /* NOT_CHANGED */;
    }
    const expression = await this.debugHoverComputer.evaluate(session);
    if (cancellationSource.token.isCancellationRequested) {
      this.hide();
      return 2 /* CANCELLED */;
    }
    if (!expression || expression instanceof Expression && !expression.available) {
      this.hide();
      return 1 /* NOT_AVAILABLE */;
    }
    this.highlightDecorations.set([{
      range: result.range,
      options: DebugHoverWidget._HOVER_HIGHLIGHT_DECORATION_OPTIONS
    }]);
    return this.doShow(session, result.range.getStartPosition(), expression, focus, mouseEvent);
  }
  async doShow(session, position, expression, focus, mouseEvent) {
    if (!this.domNode) {
      this.create();
    }
    this.showAtPosition = position;
    const store = new lifecycle.DisposableStore();
    this._isVisible = { store };
    if (!expression.hasChildren) {
      this.complexValueContainer.hidden = true;
      this.valueContainer.hidden = false;
      store.add(this.expressionRenderer.renderValue(this.valueContainer, expression, {
        showChanged: false,
        colorize: true,
        hover: false,
        session
      }));
      this.valueContainer.title = "";
      this.editor.layoutContentWidget(this);
      this.safeTriangle = mouseEvent && new dom.SafeTriangle(mouseEvent.posx, mouseEvent.posy, this.domNode);
      this.scrollbar.scanDomNode();
      if (focus) {
        this.editor.render();
        this.valueContainer.focus();
      }
      return void 0;
    }
    this.valueContainer.hidden = true;
    this.expressionToRender = expression;
    store.add(this.expressionRenderer.renderValue(this.complexValueTitle, expression, { hover: false, session }));
    this.editor.layoutContentWidget(this);
    this.safeTriangle = mouseEvent && new dom.SafeTriangle(mouseEvent.posx, mouseEvent.posy, this.domNode);
    this.tree.scrollTop = 0;
    this.tree.scrollLeft = 0;
    this.complexValueContainer.hidden = false;
    if (focus) {
      this.editor.render();
      this.tree.domFocus();
    }
  }
  layoutTreeAndContainer() {
    this.layoutTree();
    this.editor.layoutContentWidget(this);
  }
  layoutTree() {
    const scrollBarHeight = 10;
    let maxHeightToAvoidCursorOverlay = Infinity;
    if (this.showAtPosition) {
      const editorTop = this.editor.getDomNode()?.offsetTop || 0;
      const containerTop = this.treeContainer.offsetTop + editorTop;
      const hoveredCharTop = this.editor.getTopForLineNumber(this.showAtPosition.lineNumber, true) - this.editor.getScrollTop();
      if (containerTop < hoveredCharTop) {
        maxHeightToAvoidCursorOverlay = hoveredCharTop + editorTop - 22;
      }
    }
    const treeHeight = Math.min(Math.max(266, this.editor.getLayoutInfo().height * 0.55), this.tree.contentHeight + scrollBarHeight, maxHeightToAvoidCursorOverlay);
    const realTreeWidth = this.tree.contentWidth;
    const treeWidth = clamp(realTreeWidth, 400, 550);
    this.tree.layout(treeHeight, treeWidth);
    this.treeContainer.style.height = `${treeHeight}px`;
    this.scrollbar.scanDomNode();
  }
  beforeRender() {
    if (this.expressionToRender) {
      const expression = this.expressionToRender;
      this.expressionToRender = void 0;
      this.isUpdatingTree = true;
      this.tree.setInput(expression).finally(() => {
        this.isUpdatingTree = false;
      });
    }
    return null;
  }
  afterRender(positionPreference) {
    if (positionPreference) {
      this.positionPreference = [positionPreference];
    }
  }
  hide() {
    if (this.showCancellationSource) {
      this.showCancellationSource.dispose(true);
      this.showCancellationSource = void 0;
    }
    if (!this._isVisible) {
      return;
    }
    if (dom.isAncestorOfActiveElement(this.domNode)) {
      this.editor.focus();
    }
    this._isVisible.store.dispose();
    this._isVisible = void 0;
    this.highlightDecorations.clear();
    this.editor.layoutContentWidget(this);
    this.positionPreference = [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
  }
  getPosition() {
    return this._isVisible ? {
      position: this.showAtPosition,
      preference: this.positionPreference
    } : null;
  }
  dispose() {
    this.toDispose = lifecycle.dispose(this.toDispose);
  }
};
DebugHoverWidget.ID = "debug.hoverWidget";
DebugHoverWidget._HOVER_HIGHLIGHT_DECORATION_OPTIONS = ModelDecorationOptions.register({
  description: "bdebug-hover-highlight",
  className: "hoverHighlight"
});
DebugHoverWidget = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService)
], DebugHoverWidget);
class DebugHoverAccessibilityProvider {
  getWidgetAriaLabel() {
    return nls.localize("treeAriaLabel", "Debug Hover");
  }
  getAriaLabel(element) {
    return nls.localize({ key: "variableAriaLabel", comment: ["Do not translate placeholders. Placeholders are name and value of a variable."] }, "{0}, value {1}, variables, debug", element.name, element.value);
  }
}
class DebugHoverDataSource extends AbstractExpressionDataSource {
  hasChildren(element) {
    return element.hasChildren;
  }
  doGetChildren(element) {
    return element.getChildren();
  }
}
class DebugHoverDelegate {
  getHeight(element) {
    return 18;
  }
  getTemplateId(element) {
    if (element instanceof VisualizedExpression) {
      return VisualizedVariableRenderer.ID;
    }
    return VariablesRenderer.ID;
  }
}
let DebugHoverComputer = class {
  constructor(editor, debugService, languageFeaturesService, logService) {
    this.editor = editor;
    this.debugService = debugService;
    this.languageFeaturesService = languageFeaturesService;
    this.logService = logService;
  }
  async compute(position, token) {
    const session = this.debugService.getViewModel().focusedSession;
    if (!session || !this.editor.hasModel()) {
      return { rangeChanged: false };
    }
    const model = this.editor.getModel();
    const result = await getEvaluatableExpressionAtPosition(this.languageFeaturesService, model, position, token);
    if (!result) {
      return { rangeChanged: false };
    }
    const { range, matchingExpression } = result;
    const rangeChanged = !this._current?.range.equalsRange(range);
    this._current = { expression: matchingExpression, range: Range.lift(range) };
    return { rangeChanged, range: this._current.range };
  }
  async evaluate(session) {
    if (!this._current) {
      this.logService.error("No expression to evaluate");
      return;
    }
    const textModel = this.editor.getModel();
    const debugSource = textModel && session.getSourceForUri(textModel?.uri);
    if (session.capabilities.supportsEvaluateForHovers) {
      const expression = new Expression(this._current.expression);
      await expression.evaluate(session, this.debugService.getViewModel().focusedStackFrame, "hover", void 0, debugSource ? {
        line: this._current.range.startLineNumber,
        column: this._current.range.startColumn,
        source: debugSource.raw
      } : void 0);
      return expression;
    } else {
      const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
      if (focusedStackFrame) {
        return await findExpressionInStackFrame(
          focusedStackFrame,
          coalesce(this._current.expression.split(".").map((word) => word.trim()))
        );
      }
    }
    return void 0;
  }
};
DebugHoverComputer = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ILogService)
], DebugHoverComputer);
export {
  DebugHoverWidget,
  ShowDebugHoverResult,
  findExpressionInStackFrame
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0hvdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlQ29udGV4dE1lbnVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBsaWZlY3ljbGUgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlLzJkL2RpbWVuc2lvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIGVkaXRvckhvdmVyQmFja2dyb3VuZCwgZWRpdG9ySG92ZXJCb3JkZXIsIGVkaXRvckhvdmVyRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbkNvbnRhaW5lciwgSVN0YWNrRnJhbWUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRXhwcmVzc2lvbiwgVmFyaWFibGUsIFZpc3VhbGl6ZWRFeHByZXNzaW9uIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0RXZhbHVhdGFibGVFeHByZXNzaW9uQXRQb3NpdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXhwcmVzc2lvbkRhdGFTb3VyY2UgfSBmcm9tICcuL2Jhc2VEZWJ1Z1ZpZXcuanMnO1xuaW1wb3J0IHsgRGVidWdFeHByZXNzaW9uUmVuZGVyZXIgfSBmcm9tICcuL2RlYnVnRXhwcmVzc2lvblJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFZhcmlhYmxlc1JlbmRlcmVyLCBWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlciwgb3BlbkNvbnRleHRNZW51Rm9yVmFyaWFibGVUcmVlRWxlbWVudCB9IGZyb20gJy4vdmFyaWFibGVzVmlldy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuZXhwb3J0IGNvbnN0IGVudW0gU2hvd0RlYnVnSG92ZXJSZXN1bHQge1xuXHROT1RfQ0hBTkdFRCxcblx0Tk9UX0FWQUlMQUJMRSxcblx0Q0FOQ0VMTEVELFxufVxuXG5hc3luYyBmdW5jdGlvbiBkb0ZpbmRFeHByZXNzaW9uKGNvbnRhaW5lcjogSUV4cHJlc3Npb25Db250YWluZXIsIG5hbWVzVG9GaW5kOiBzdHJpbmdbXSk6IFByb21pc2U8SUV4cHJlc3Npb24gfCBudWxsPiB7XG5cdGlmICghY29udGFpbmVyKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IGNvbnRhaW5lci5nZXRDaGlsZHJlbigpO1xuXHQvLyBsb29rIGZvciBvdXIgdmFyaWFibGUgaW4gdGhlIGxpc3QuIEZpcnN0IGZpbmQgdGhlIHBhcmVudHMgb2YgdGhlIGhvdmVyZWQgdmFyaWFibGUgaWYgdGhlcmUgYXJlIGFueS5cblx0Y29uc3QgZmlsdGVyZWQgPSBjaGlsZHJlbi5maWx0ZXIodiA9PiBuYW1lc1RvRmluZFswXSA9PT0gdi5uYW1lKTtcblx0aWYgKGZpbHRlcmVkLmxlbmd0aCAhPT0gMSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aWYgKG5hbWVzVG9GaW5kLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiBmaWx0ZXJlZFswXTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZG9GaW5kRXhwcmVzc2lvbihmaWx0ZXJlZFswXSwgbmFtZXNUb0ZpbmQuc2xpY2UoMSkpO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaW5kRXhwcmVzc2lvbkluU3RhY2tGcmFtZShzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSwgbmFtZXNUb0ZpbmQ6IHN0cmluZ1tdKTogUHJvbWlzZTxJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBzY29wZXMgPSBhd2FpdCBzdGFja0ZyYW1lLmdldFNjb3BlcygpO1xuXHRjb25zdCBub25FeHBlbnNpdmUgPSBzY29wZXMuZmlsdGVyKHMgPT4gIXMuZXhwZW5zaXZlKTtcblx0Y29uc3QgZXhwcmVzc2lvbnMgPSBjb2FsZXNjZShhd2FpdCBQcm9taXNlLmFsbChub25FeHBlbnNpdmUubWFwKHNjb3BlID0+IGRvRmluZEV4cHJlc3Npb24oc2NvcGUsIG5hbWVzVG9GaW5kKSkpKTtcblxuXHQvLyBvbmx5IHNob3cgaWYgYWxsIGV4cHJlc3Npb25zIGZvdW5kIGhhdmUgdGhlIHNhbWUgdmFsdWVcblx0cmV0dXJuIGV4cHJlc3Npb25zLmxlbmd0aCA+IDAgJiYgZXhwcmVzc2lvbnMuZXZlcnkoZSA9PiBlLnZhbHVlID09PSBleHByZXNzaW9uc1swXS52YWx1ZSkgPyBleHByZXNzaW9uc1swXSA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnSG92ZXJXaWRnZXQgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2RlYnVnLmhvdmVyV2lkZ2V0Jztcblx0Ly8gZWRpdG9yLklDb250ZW50V2lkZ2V0LmFsbG93RWRpdG9yT3ZlcmZsb3dcblx0cmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdyA9IHRydWU7XG5cblx0Ly8gdG9kb0Bjb25ub3I0MzEyOiBtb3ZlIG1vcmUgcHJvcGVydGllcyB0aGF0IGFyZSBvbmx5IHZhbGlkIHdoaWxlIGEgaG92ZXJcblx0Ly8gaXMgaGFwcGVuaW5nIGludG8gYF9pc1Zpc2libGVgXG5cdHByaXZhdGUgX2lzVmlzaWJsZT86IHtcblx0XHRzdG9yZTogbGlmZWN5Y2xlLkRpc3Bvc2FibGVTdG9yZTtcblx0fTtcblx0cHJpdmF0ZSBzYWZlVHJpYW5nbGU/OiBkb20uU2FmZVRyaWFuZ2xlO1xuXHRwcml2YXRlIHNob3dDYW5jZWxsYXRpb25Tb3VyY2U/OiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0cHJpdmF0ZSBkb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdHJlZSE6IEFzeW5jRGF0YVRyZWU8SUV4cHJlc3Npb24sIElFeHByZXNzaW9uLCBhbnk+O1xuXHRwcml2YXRlIHNob3dBdFBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGw7XG5cdHByaXZhdGUgcG9zaXRpb25QcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlW107XG5cdHByaXZhdGUgcmVhZG9ubHkgaGlnaGxpZ2h0RGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgY29tcGxleFZhbHVlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY29tcGxleFZhbHVlVGl0bGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB2YWx1ZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IGxpZmVjeWNsZS5JRGlzcG9zYWJsZVtdO1xuXHRwcml2YXRlIHNjcm9sbGJhciE6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIGRlYnVnSG92ZXJDb21wdXRlcjogRGVidWdIb3ZlckNvbXB1dGVyO1xuXHRwcml2YXRlIGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXI7XG5cblx0cHJpdmF0ZSBleHByZXNzaW9uVG9SZW5kZXI6IElFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGlzVXBkYXRpbmdUcmVlID0gZmFsc2U7XG5cblx0cHVibGljIGdldCBpc1Nob3dpbmdDb21wbGV4VmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcGxleFZhbHVlQ29udGFpbmVyPy5oaWRkZW4gPT09IGZhbHNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmhpZ2hsaWdodERlY29yYXRpb25zID0gdGhpcy5lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBbXTtcblxuXHRcdHRoaXMuc2hvd0F0UG9zaXRpb24gPSBudWxsO1xuXHRcdHRoaXMucG9zaXRpb25QcmVmZXJlbmNlID0gW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUsIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1ddO1xuXHRcdHRoaXMuZGVidWdIb3ZlckNvbXB1dGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z0hvdmVyQ29tcHV0ZXIsIHRoaXMuZWRpdG9yKTtcblx0XHR0aGlzLmV4cHJlc3Npb25SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdFeHByZXNzaW9uUmVuZGVyZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlID0gJCgnLmRlYnVnLWhvdmVyLXdpZGdldCcpO1xuXHRcdHRoaXMuY29tcGxleFZhbHVlQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsICQoJy5jb21wbGV4LXZhbHVlJykpO1xuXHRcdHRoaXMuY29tcGxleFZhbHVlVGl0bGUgPSBkb20uYXBwZW5kKHRoaXMuY29tcGxleFZhbHVlQ29udGFpbmVyLCAkKCcudGl0bGUnKSk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbXBsZXhWYWx1ZUNvbnRhaW5lciwgJCgnLmRlYnVnLWhvdmVyLXRyZWUnKSk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICd0cmVlJyk7XG5cdFx0Y29uc3QgdGlwID0gZG9tLmFwcGVuZCh0aGlzLmNvbXBsZXhWYWx1ZUNvbnRhaW5lciwgJCgnLnRpcCcpKTtcblx0XHR0aXAudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoeyBrZXk6ICdxdWlja1RpcCcsIGNvbW1lbnQ6IFsnXCJzd2l0Y2ggdG8gZWRpdG9yIGxhbmd1YWdlIGhvdmVyXCIgbWVhbnMgdG8gc2hvdyB0aGUgcHJvZ3JhbW1pbmcgbGFuZ3VhZ2UgaG92ZXIgd2lkZ2V0IGluc3RlYWQgb2YgdGhlIGRlYnVnIGhvdmVyJ10gfSwgJ0hvbGQgezB9IGtleSB0byBzd2l0Y2ggdG8gZWRpdG9yIGxhbmd1YWdlIGhvdmVyJywgaXNNYWNpbnRvc2ggPyAnT3B0aW9uJyA6ICdBbHQnKTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z0hvdmVyRGF0YVNvdXJjZSk7XG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbiwgYW55PiwgJ0RlYnVnSG92ZXInLCB0aGlzLnRyZWVDb250YWluZXIsIG5ldyBEZWJ1Z0hvdmVyRGVsZWdhdGUoKSwgW1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWYXJpYWJsZXNSZW5kZXJlciwgdGhpcy5leHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlciwgdGhpcy5leHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdF0sXG5cdFx0XHRkYXRhU291cmNlLCB7XG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBEZWJ1Z0hvdmVyQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogdHJ1ZSxcblx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogeyBnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGU6IElFeHByZXNzaW9uKSA9PiBlLm5hbWUgfSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JIb3ZlckJhY2tncm91bmRcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIucmVuZGVyZXJPblZpc3VhbGl6YXRpb25SYW5nZSh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKSwgdGhpcy50cmVlKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLnRyZWUpO1xuXG5cdFx0dGhpcy52YWx1ZUNvbnRhaW5lciA9ICQoJy52YWx1ZScpO1xuXHRcdHRoaXMudmFsdWVDb250YWluZXIudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMudmFsdWVDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3Rvb2x0aXAnKTtcblx0XHR0aGlzLnNjcm9sbGJhciA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLnZhbHVlQ29udGFpbmVyLCB7IGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuIH0pO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5zY3JvbGxiYXIpO1xuXG5cdFx0dGhpcy5lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLmRvbU5vZGUpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGVkaXRvckhvdmVyQmFja2dyb3VuZCk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKGVkaXRvckhvdmVyQm9yZGVyKX1gO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5jb2xvciA9IGFzQ3NzVmFyaWFibGUoZWRpdG9ySG92ZXJGb3JlZ3JvdW5kKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy50cmVlLm9uQ29udGV4dE1lbnUoYXN5bmMgZSA9PiBhd2FpdCB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNVcGRhdGluZ1RyZWUpIHtcblx0XHRcdFx0Ly8gRG9uJ3QgZG8gYSBsYXlvdXQgaW4gdGhlIG1pZGRsZSBvZiB0aGUgYXN5bmMgc2V0SW5wdXRcblx0XHRcdFx0dGhpcy5sYXlvdXRUcmVlQW5kQ29udGFpbmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29udGVudFdpZHRoKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5pc1VwZGF0aW5nVHJlZSkge1xuXHRcdFx0XHQvLyBEb24ndCBkbyBhIGxheW91dCBpbiB0aGUgbWlkZGxlIG9mIHRoZSBhc3luYyBzZXRJbnB1dFxuXHRcdFx0XHR0aGlzLmxheW91dFRyZWVBbmRDb250YWluZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SUV4cHJlc3Npb24+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSBlLmVsZW1lbnQ7XG5cdFx0aWYgKCEodmFyaWFibGUgaW5zdGFuY2VvZiBWYXJpYWJsZSkgfHwgIXZhcmlhYmxlLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wZW5Db250ZXh0TWVudUZvclZhcmlhYmxlVHJlZUVsZW1lbnQodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5tZW51U2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIE1lbnVJZC5EZWJ1Z0hvdmVyQ29udGV4dCwgZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2tleWRvd24nLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRFdmFsdWF0ZUxhenlFeHByZXNzaW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBWYXJpYWJsZSAmJiB0aGlzLnRyZWUuaGFzTm9kZShlKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGlzSG92ZXJlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmRvbU5vZGU/Lm1hdGNoZXMoJzpob3ZlcicpO1xuXHR9XG5cblx0aXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2lzVmlzaWJsZTtcblx0fVxuXG5cdHdpbGxCZVZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5zaG93Q2FuY2VsbGF0aW9uU291cmNlO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gRGVidWdIb3ZlcldpZGdldC5JRDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIHRoZSBnaXZlbiBjb29yZGluYXRlcyBhcmUgaW4gdGhlIHNhZmUgdHJpYW5nbGUgZm9ybWVkIGZyb21cblx0ICogdGhlIHBvc2l0aW9uIGF0IHdoaWNoIHRoZSBob3ZlciB3YXMgaW5pdGlhdGVkLlxuXHQgKi9cblx0aXNJblNhZmVUcmlhbmdsZSh4OiBudW1iZXIsIHk6IG51bWJlcikge1xuXHRcdHJldHVybiB0aGlzLl9pc1Zpc2libGUgJiYgISF0aGlzLnNhZmVUcmlhbmdsZT8uY29udGFpbnMoeCwgeSk7XG5cdH1cblxuXHRhc3luYyBzaG93QXQocG9zaXRpb246IFBvc2l0aW9uLCBmb2N1czogYm9vbGVhbiwgbW91c2VFdmVudD86IElNb3VzZUV2ZW50KTogUHJvbWlzZTx2b2lkIHwgU2hvd0RlYnVnSG92ZXJSZXN1bHQ+IHtcblx0XHR0aGlzLnNob3dDYW5jZWxsYXRpb25Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uU291cmNlID0gdGhpcy5zaG93Q2FuY2VsbGF0aW9uU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXG5cdFx0aWYgKCFzZXNzaW9uIHx8ICF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdHJldHVybiBTaG93RGVidWdIb3ZlclJlc3VsdC5OT1RfQVZBSUxBQkxFO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVidWdIb3ZlckNvbXB1dGVyLmNvbXB1dGUocG9zaXRpb24sIGNhbmNlbGxhdGlvblNvdXJjZS50b2tlbik7XG5cdFx0aWYgKGNhbmNlbGxhdGlvblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRyZXR1cm4gU2hvd0RlYnVnSG92ZXJSZXN1bHQuQ0FOQ0VMTEVEO1xuXHRcdH1cblxuXHRcdGlmICghcmVzdWx0LnJhbmdlKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdHJldHVybiBTaG93RGVidWdIb3ZlclJlc3VsdC5OT1RfQVZBSUxBQkxFO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpICYmICFyZXN1bHQucmFuZ2VDaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm4gU2hvd0RlYnVnSG92ZXJSZXN1bHQuTk9UX0NIQU5HRUQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwcmVzc2lvbiA9IGF3YWl0IHRoaXMuZGVidWdIb3ZlckNvbXB1dGVyLmV2YWx1YXRlKHNlc3Npb24pO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0cmV0dXJuIFNob3dEZWJ1Z0hvdmVyUmVzdWx0LkNBTkNFTExFRDtcblx0XHR9XG5cblx0XHRpZiAoIWV4cHJlc3Npb24gfHwgKGV4cHJlc3Npb24gaW5zdGFuY2VvZiBFeHByZXNzaW9uICYmICFleHByZXNzaW9uLmF2YWlsYWJsZSkpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0cmV0dXJuIFNob3dEZWJ1Z0hvdmVyUmVzdWx0Lk5PVF9BVkFJTEFCTEU7XG5cdFx0fVxuXG5cdFx0dGhpcy5oaWdobGlnaHREZWNvcmF0aW9ucy5zZXQoW3tcblx0XHRcdHJhbmdlOiByZXN1bHQucmFuZ2UsXG5cdFx0XHRvcHRpb25zOiBEZWJ1Z0hvdmVyV2lkZ2V0Ll9IT1ZFUl9ISUdITElHSFRfREVDT1JBVElPTl9PUFRJT05TXG5cdFx0fV0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuZG9TaG93KHNlc3Npb24sIHJlc3VsdC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIGV4cHJlc3Npb24sIGZvY3VzLCBtb3VzZUV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9IT1ZFUl9ISUdITElHSFRfREVDT1JBVElPTl9PUFRJT05TID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdiZGVidWctaG92ZXItaGlnaGxpZ2h0Jyxcblx0XHRjbGFzc05hbWU6ICdob3ZlckhpZ2hsaWdodCdcblx0fSk7XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Nob3coc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcG9zaXRpb246IFBvc2l0aW9uLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZm9jdXM6IGJvb2xlYW4sIG1vdXNlRXZlbnQ6IElNb3VzZUV2ZW50IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGUpIHtcblx0XHRcdHRoaXMuY3JlYXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zaG93QXRQb3NpdGlvbiA9IHBvc2l0aW9uO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IGxpZmVjeWNsZS5EaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB7IHN0b3JlIH07XG5cblx0XHRpZiAoIWV4cHJlc3Npb24uaGFzQ2hpbGRyZW4pIHtcblx0XHRcdHRoaXMuY29tcGxleFZhbHVlQ29udGFpbmVyLmhpZGRlbiA9IHRydWU7XG5cdFx0XHR0aGlzLnZhbHVlQ29udGFpbmVyLmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhbHVlKHRoaXMudmFsdWVDb250YWluZXIsIGV4cHJlc3Npb24sIHtcblx0XHRcdFx0c2hvd0NoYW5nZWQ6IGZhbHNlLFxuXHRcdFx0XHRjb2xvcml6ZTogdHJ1ZSxcblx0XHRcdFx0aG92ZXI6IGZhbHNlLFxuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy52YWx1ZUNvbnRhaW5lci50aXRsZSA9ICcnO1xuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHRcdHRoaXMuc2FmZVRyaWFuZ2xlID0gbW91c2VFdmVudCAmJiBuZXcgZG9tLlNhZmVUcmlhbmdsZShtb3VzZUV2ZW50LnBvc3gsIG1vdXNlRXZlbnQucG9zeSwgdGhpcy5kb21Ob2RlKTtcblx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IucmVuZGVyKCk7XG5cdFx0XHRcdHRoaXMudmFsdWVDb250YWluZXIuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLnZhbHVlQ29udGFpbmVyLmhpZGRlbiA9IHRydWU7XG5cblx0XHR0aGlzLmV4cHJlc3Npb25Ub1JlbmRlciA9IGV4cHJlc3Npb247XG5cdFx0c3RvcmUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhbHVlKHRoaXMuY29tcGxleFZhbHVlVGl0bGUsIGV4cHJlc3Npb24sIHsgaG92ZXI6IGZhbHNlLCBzZXNzaW9uIH0pKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuc2FmZVRyaWFuZ2xlID0gbW91c2VFdmVudCAmJiBuZXcgZG9tLlNhZmVUcmlhbmdsZShtb3VzZUV2ZW50LnBvc3gsIG1vdXNlRXZlbnQucG9zeSwgdGhpcy5kb21Ob2RlKTtcblx0XHR0aGlzLnRyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHR0aGlzLnRyZWUuc2Nyb2xsTGVmdCA9IDA7XG5cdFx0dGhpcy5jb21wbGV4VmFsdWVDb250YWluZXIuaGlkZGVuID0gZmFsc2U7XG5cblx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnJlbmRlcigpO1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRUcmVlQW5kQ29udGFpbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMubGF5b3V0VHJlZSgpO1xuXHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFRyZWUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsQmFySGVpZ2h0ID0gMTA7XG5cdFx0bGV0IG1heEhlaWdodFRvQXZvaWRDdXJzb3JPdmVybGF5ID0gSW5maW5pdHk7XG5cdFx0aWYgKHRoaXMuc2hvd0F0UG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IGVkaXRvclRvcCA9IHRoaXMuZWRpdG9yLmdldERvbU5vZGUoKT8ub2Zmc2V0VG9wIHx8IDA7XG5cdFx0XHRjb25zdCBjb250YWluZXJUb3AgPSB0aGlzLnRyZWVDb250YWluZXIub2Zmc2V0VG9wICsgZWRpdG9yVG9wO1xuXHRcdFx0Y29uc3QgaG92ZXJlZENoYXJUb3AgPSB0aGlzLmVkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHRoaXMuc2hvd0F0UG9zaXRpb24ubGluZU51bWJlciwgdHJ1ZSkgLSB0aGlzLmVkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHRcdGlmIChjb250YWluZXJUb3AgPCBob3ZlcmVkQ2hhclRvcCkge1xuXHRcdFx0XHRtYXhIZWlnaHRUb0F2b2lkQ3Vyc29yT3ZlcmxheSA9IGhvdmVyZWRDaGFyVG9wICsgZWRpdG9yVG9wIC0gMjI7IC8vIDIyIGlzIG1vbmFjbyB0b3AgcGFkZGluZyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iL2ExZGYyZDczMTkzODJkNDJmNjZhZDdmNDExYWYwMWU0Y2M0OWM4MGEvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9jb250ZW50V2lkZ2V0cy9jb250ZW50V2lkZ2V0cy50cyNMMzY0XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHRyZWVIZWlnaHQgPSBNYXRoLm1pbihNYXRoLm1heCgyNjYsIHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQgKiAwLjU1KSwgdGhpcy50cmVlLmNvbnRlbnRIZWlnaHQgKyBzY3JvbGxCYXJIZWlnaHQsIG1heEhlaWdodFRvQXZvaWRDdXJzb3JPdmVybGF5KTtcblxuXHRcdGNvbnN0IHJlYWxUcmVlV2lkdGggPSB0aGlzLnRyZWUuY29udGVudFdpZHRoO1xuXHRcdGNvbnN0IHRyZWVXaWR0aCA9IGNsYW1wKHJlYWxUcmVlV2lkdGgsIDQwMCwgNTUwKTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KHRyZWVIZWlnaHQsIHRyZWVXaWR0aCk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RyZWVIZWlnaHR9cHhgO1xuXHRcdHRoaXMuc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRiZWZvcmVSZW5kZXIoKTogSURpbWVuc2lvbiB8IG51bGwge1xuXHRcdC8vIGJlZm9yZVJlbmRlciB3aWxsIGJlIGNhbGxlZCBlYWNoIHRpbWUgdGhlIGhvdmVyIHNpemUgY2hhbmdlcywgYW5kIHRoZSBjb250ZW50IHdpZGdldCBpcyBsYXllZCBvdXQgYWdhaW4uXG5cdFx0aWYgKHRoaXMuZXhwcmVzc2lvblRvUmVuZGVyKSB7XG5cdFx0XHRjb25zdCBleHByZXNzaW9uID0gdGhpcy5leHByZXNzaW9uVG9SZW5kZXI7XG5cdFx0XHR0aGlzLmV4cHJlc3Npb25Ub1JlbmRlciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gRG8gdGhpcyBpbiBiZWZvcmVSZW5kZXIgb25jZSB0aGUgY29udGVudCB3aWRnZXQgaXMgbm8gbG9uZ2VyIGRpc3BsYXk9bm9uZSBzbyB0aGF0IGl0cyBlbGVtZW50cycgc2l6ZXMgd2lsbCBiZSBtZWFzdXJlZCBjb3JyZWN0bHkuXG5cdFx0XHR0aGlzLmlzVXBkYXRpbmdUcmVlID0gdHJ1ZTtcblx0XHRcdHRoaXMudHJlZS5zZXRJbnB1dChleHByZXNzaW9uKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy5pc1VwZGF0aW5nVHJlZSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhZnRlclJlbmRlcihwb3NpdGlvblByZWZlcmVuY2U6IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfCBudWxsKSB7XG5cdFx0aWYgKHBvc2l0aW9uUHJlZmVyZW5jZSkge1xuXHRcdFx0Ly8gUmVtZW1iZXIgd2hlcmUgdGhlIGVkaXRvciBwbGFjZWQgeW91IHRvIGtlZXAgcG9zaXRpb24gc3RhYmxlICMxMDkyMjZcblx0XHRcdHRoaXMucG9zaXRpb25QcmVmZXJlbmNlID0gW3Bvc2l0aW9uUHJlZmVyZW5jZV07XG5cdFx0fVxuXHR9XG5cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNob3dDYW5jZWxsYXRpb25Tb3VyY2UpIHtcblx0XHRcdHRoaXMuc2hvd0NhbmNlbGxhdGlvblNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdFx0dGhpcy5zaG93Q2FuY2VsbGF0aW9uU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuZG9tTm9kZSkpIHtcblx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzVmlzaWJsZS5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5oaWdobGlnaHREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5wb3NpdGlvblByZWZlcmVuY2UgPSBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRSwgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPV107XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVmlzaWJsZSA/IHtcblx0XHRcdHBvc2l0aW9uOiB0aGlzLnNob3dBdFBvc2l0aW9uLFxuXHRcdFx0cHJlZmVyZW5jZTogdGhpcy5wb3NpdGlvblByZWZlcmVuY2Vcblx0XHR9IDogbnVsbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBsaWZlY3ljbGUuZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxuY2xhc3MgRGVidWdIb3ZlckFjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElFeHByZXNzaW9uPiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndHJlZUFyaWFMYWJlbCcsIFwiRGVidWcgSG92ZXJcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSUV4cHJlc3Npb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoeyBrZXk6ICd2YXJpYWJsZUFyaWFMYWJlbCcsIGNvbW1lbnQ6IFsnRG8gbm90IHRyYW5zbGF0ZSBwbGFjZWhvbGRlcnMuIFBsYWNlaG9sZGVycyBhcmUgbmFtZSBhbmQgdmFsdWUgb2YgYSB2YXJpYWJsZS4nXSB9LCBcInswfSwgdmFsdWUgezF9LCB2YXJpYWJsZXMsIGRlYnVnXCIsIGVsZW1lbnQubmFtZSwgZWxlbWVudC52YWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgRGVidWdIb3ZlckRhdGFTb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdEV4cHJlc3Npb25EYXRhU291cmNlPElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbj4ge1xuXG5cdHB1YmxpYyBvdmVycmlkZSBoYXNDaGlsZHJlbihlbGVtZW50OiBJRXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbGVtZW50Lmhhc0NoaWxkcmVuO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRvR2V0Q2hpbGRyZW4oZWxlbWVudDogSUV4cHJlc3Npb24pOiBQcm9taXNlPElFeHByZXNzaW9uW10+IHtcblx0XHRyZXR1cm4gZWxlbWVudC5nZXRDaGlsZHJlbigpO1xuXHR9XG59XG5cbmNsYXNzIERlYnVnSG92ZXJEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElFeHByZXNzaW9uPiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBJRXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIDE4O1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBWaXN1YWxpemVkRXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRyZXR1cm4gVmFyaWFibGVzUmVuZGVyZXIuSUQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElEZWJ1Z0hvdmVyQ29tcHV0ZVJlc3VsdCB7XG5cdHJhbmdlQ2hhbmdlZDogYm9vbGVhbjtcblx0cmFuZ2U/OiBSYW5nZTtcbn1cblxuY2xhc3MgRGVidWdIb3ZlckNvbXB1dGVyIHtcblx0cHJpdmF0ZSBfY3VycmVudD86IHtcblx0XHRyYW5nZTogUmFuZ2U7XG5cdFx0ZXhwcmVzc2lvbjogc3RyaW5nO1xuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgYXN5bmMgY29tcHV0ZShwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SURlYnVnSG92ZXJDb21wdXRlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmICghc2Vzc2lvbiB8fCAhdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIHsgcmFuZ2VDaGFuZ2VkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRFdmFsdWF0YWJsZUV4cHJlc3Npb25BdFBvc2l0aW9uKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCBwb3NpdGlvbiwgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4geyByYW5nZUNoYW5nZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByYW5nZSwgbWF0Y2hpbmdFeHByZXNzaW9uIH0gPSByZXN1bHQ7XG5cdFx0Y29uc3QgcmFuZ2VDaGFuZ2VkID0gIXRoaXMuX2N1cnJlbnQ/LnJhbmdlLmVxdWFsc1JhbmdlKHJhbmdlKTtcblx0XHR0aGlzLl9jdXJyZW50ID0geyBleHByZXNzaW9uOiBtYXRjaGluZ0V4cHJlc3Npb24sIHJhbmdlOiBSYW5nZS5saWZ0KHJhbmdlKSB9O1xuXHRcdHJldHVybiB7IHJhbmdlQ2hhbmdlZCwgcmFuZ2U6IHRoaXMuX2N1cnJlbnQucmFuZ2UgfTtcblx0fVxuXG5cdGFzeW5jIGV2YWx1YXRlKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPElFeHByZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ05vIGV4cHJlc3Npb24gdG8gZXZhbHVhdGUnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGRlYnVnU291cmNlID0gdGV4dE1vZGVsICYmIHNlc3Npb24uZ2V0U291cmNlRm9yVXJpKHRleHRNb2RlbD8udXJpKTtcblxuXHRcdGlmIChzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0V2YWx1YXRlRm9ySG92ZXJzKSB7XG5cdFx0XHRjb25zdCBleHByZXNzaW9uID0gbmV3IEV4cHJlc3Npb24odGhpcy5fY3VycmVudC5leHByZXNzaW9uKTtcblx0XHRcdGF3YWl0IGV4cHJlc3Npb24uZXZhbHVhdGUoc2Vzc2lvbiwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWUsICdob3ZlcicsIHVuZGVmaW5lZCwgZGVidWdTb3VyY2UgPyB7XG5cdFx0XHRcdGxpbmU6IHRoaXMuX2N1cnJlbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRjb2x1bW46IHRoaXMuX2N1cnJlbnQucmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdHNvdXJjZTogZGVidWdTb3VyY2UucmF3LFxuXHRcdFx0fSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gZXhwcmVzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZm9jdXNlZFN0YWNrRnJhbWUgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRcdGlmIChmb2N1c2VkU3RhY2tGcmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgZmluZEV4cHJlc3Npb25JblN0YWNrRnJhbWUoXG5cdFx0XHRcdFx0Zm9jdXNlZFN0YWNrRnJhbWUsXG5cdFx0XHRcdFx0Y29hbGVzY2UodGhpcy5fY3VycmVudC5leHByZXNzaW9uLnNwbGl0KCcuJykubWFwKHdvcmQgPT4gd29yZC50cmltKCkpKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBS3JCLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVDQUE0RjtBQUNyRyxTQUFvQyxvQkFBb0I7QUFHeEQsU0FBUyxhQUFhO0FBRXRCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0NBQWdDO0FBQ3pDLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWUsdUJBQXVCLG1CQUFtQiw2QkFBNkI7QUFDL0YsU0FBUyxxQkFBb0Y7QUFDN0YsU0FBUyxZQUFZLFVBQVUsNEJBQTRCO0FBQzNELFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CLDRCQUE0Qiw2Q0FBNkM7QUFFckcsTUFBTSxJQUFJLElBQUk7QUFFUCxJQUFXLHVCQUFYLGtCQUFXQSwwQkFBWDtBQUNOLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFDQSxFQUFBQSw0Q0FBQTtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFNbEIsZUFBZSxpQkFBaUIsV0FBaUMsYUFBb0Q7QUFDcEgsTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sV0FBVyxNQUFNLFVBQVUsWUFBWTtBQUU3QyxRQUFNLFdBQVcsU0FBUyxPQUFPLE9BQUss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
