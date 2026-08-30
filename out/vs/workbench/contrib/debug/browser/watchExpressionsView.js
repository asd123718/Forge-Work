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
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../base/browser/ui/list/list.js";
import { ElementsDragAndDropData, ListViewTargetSector } from "../../../../base/browser/ui/list/listView.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize } from "../../../../nls.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { CONTEXT_CAN_VIEW_MEMORY, CONTEXT_EXPRESSION_SELECTED, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_VARIABLE_TYPE, CONTEXT_WATCH_EXPRESSIONS_EXIST, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_WATCH_ITEM_TYPE, IDebugService, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, WATCH_VIEW_ID, CONTEXT_DEBUG_TYPE } from "../common/debug.js";
import { Expression, Variable, VisualizedExpression } from "../common/debugModel.js";
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, renderViewTree } from "./baseDebugView.js";
import { COPY_WATCH_EXPRESSION_COMMAND_ID, setDataBreakpointInfoResponse } from "./debugCommands.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
import { watchExpressionsAdd, watchExpressionsRemoveAll } from "./debugIcons.js";
import { VariablesRenderer, VisualizedVariableRenderer } from "./variablesView.js";
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
let ignoreViewUpdates = false;
let useCachedEvaluation = false;
let WatchExpressionsView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, themeService, hoverService, menuService, logService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.menuService = menuService;
    this.logService = logService;
    this.needsRefresh = false;
    this.watchExpressionsUpdatedScheduler = this._register(new RunOnceScheduler(() => {
      this.needsRefresh = false;
      this.tree.updateChildren();
    }, 50));
    this.watchExpressionsExist = CONTEXT_WATCH_EXPRESSIONS_EXIST.bindTo(contextKeyService);
    this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
    this.expressionRenderer = instantiationService.createInstance(DebugExpressionRenderer);
  }
  get treeSelection() {
    return this.tree.getSelection();
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-watch");
    const treeContainer = renderViewTree(container);
    const expressionsRenderer = this.instantiationService.createInstance(WatchExpressionsRenderer, this.expressionRenderer);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "WatchExpressions",
      treeContainer,
      new WatchExpressionsDelegate(),
      [
        expressionsRenderer,
        this.instantiationService.createInstance(VariablesRenderer, this.expressionRenderer),
        this.instantiationService.createInstance(VisualizedVariableRenderer, this.expressionRenderer)
      ],
      this.instantiationService.createInstance(WatchExpressionsDataSource),
      {
        accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
        identityProvider: { getId: (element) => element.getId() },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (e) => {
            if (e === this.debugService.getViewModel().getSelectedExpression()?.expression) {
              return void 0;
            }
            return expressionAndScopeLabelProvider.getKeyboardNavigationLabel(e);
          }
        },
        dnd: new WatchExpressionsDragAndDrop(this.debugService),
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(this.tree);
    this.tree.setInput(this.debugService);
    CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.tree.contextKeyService);
    this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.tree.onMouseDblClick((e) => this.onMouseDblClick(e)));
    this._register(this.debugService.getModel().onDidChangeWatchExpressions(async (we) => {
      this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
      } else {
        if (we && !we.name) {
          useCachedEvaluation = true;
        }
        await this.tree.updateChildren();
        useCachedEvaluation = false;
        if (we instanceof Expression) {
          this.tree.reveal(we);
        }
      }
    }));
    this._register(this.debugService.getViewModel().onDidFocusStackFrame(() => {
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        return;
      }
      if (!this.watchExpressionsUpdatedScheduler.isScheduled()) {
        this.watchExpressionsUpdatedScheduler.schedule();
      }
    }));
    this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
      if (!ignoreViewUpdates) {
        this.tree.updateChildren();
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.watchExpressionsUpdatedScheduler.schedule();
      }
    }));
    let horizontalScrolling;
    this._register(this.debugService.getViewModel().onDidSelectExpression((e) => {
      const expression = e?.expression;
      if (expression && this.tree.hasNode(expression)) {
        horizontalScrolling = this.tree.options.horizontalScrolling;
        if (horizontalScrolling) {
          this.tree.updateOptions({ horizontalScrolling: false });
        }
        if (expression.name) {
          this.tree.rerender(expression);
        }
      } else if (!expression && horizontalScrolling !== void 0) {
        this.tree.updateOptions({ horizontalScrolling });
        horizontalScrolling = void 0;
      }
    }));
    this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
      if (e instanceof Variable && this.tree.hasNode(e)) {
        await this.tree.updateChildren(e, false, true);
        await this.tree.expand(e);
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  onMouseDblClick(e) {
    if (e.browserEvent.target.className.indexOf("twistie") >= 0) {
      return;
    }
    const element = e.element;
    const selectedExpression = this.debugService.getViewModel().getSelectedExpression();
    if (element instanceof Expression && element !== selectedExpression?.expression || element instanceof VisualizedExpression && element.treeItem.canEdit) {
      this.debugService.getViewModel().setSelectedExpression(element, false);
    } else if (!element) {
      this.debugService.addWatchExpression();
    }
  }
  async onContextMenu(e) {
    const element = e.element;
    if (!element) {
      return;
    }
    const selection = this.tree.getSelection();
    const contextKeyService = element && await getContextForWatchExpressionMenuWithDataAccess(this.contextKeyService, element, this.debugService, this.logService);
    const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: element, shouldForwardArgs: false });
    const { secondary } = getContextMenuActions(menu, "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => secondary,
      getActionsContext: () => element && selection.includes(element) ? selection : element ? [element] : []
    });
  }
};
WatchExpressionsView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, ILogService)
], WatchExpressionsView);
class WatchExpressionsDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof Expression) {
      return WatchExpressionsRenderer.ID;
    }
    if (element instanceof VisualizedExpression) {
      return VisualizedVariableRenderer.ID;
    }
    return VariablesRenderer.ID;
  }
}
function isDebugService(element) {
  return typeof element.getConfigurationManager === "function";
}
class WatchExpressionsDataSource extends AbstractExpressionDataSource {
  hasChildren(element) {
    return isDebugService(element) || element.hasChildren;
  }
  doGetChildren(element) {
    if (isDebugService(element)) {
      const debugService = element;
      const watchExpressions = debugService.getModel().getWatchExpressions();
      const viewModel = debugService.getViewModel();
      return Promise.all(watchExpressions.map((we) => !!we.name && !useCachedEvaluation ? we.evaluate(viewModel.focusedSession, viewModel.focusedStackFrame, "watch").then(() => we) : Promise.resolve(we)));
    }
    return element.getChildren();
  }
}
let WatchExpressionsRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, menuService, contextKeyService, debugService, contextViewService, hoverService, configurationService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
  }
  get templateId() {
    return WatchExpressionsRenderer.ID;
  }
  renderElement(node, index, data) {
    data.elementDisposable.clear();
    data.elementDisposable.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.showVariableTypes")) {
        super.renderExpressionElement(node.element, node, data);
      }
    }));
    super.renderExpressionElement(node.element, node, data);
  }
  renderExpression(expression, data, highlights) {
    let text;
    data.type.textContent = "";
    const showType = this.configurationService.getValue("debug").showVariableTypes;
    if (showType && expression.type) {
      text = typeof expression.value === "string" ? `${expression.name}: ` : expression.name;
      data.type.textContent = expression.type + " =";
    } else {
      text = typeof expression.value === "string" ? `${expression.name} =` : expression.name;
    }
    let title;
    if (expression.type) {
      if (showType) {
        title = `${expression.name}`;
      } else {
        title = expression.type === expression.value ? expression.type : `${expression.type}`;
      }
    } else {
      title = expression.value;
    }
    data.label.set(text, highlights, title);
    data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, expression, {
      showChanged: true,
      maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
      colorize: true,
      session: expression.getSession()
    }));
  }
  getInputBoxOptions(expression, settingValue) {
    if (settingValue) {
      return {
        initialValue: expression.value,
        ariaLabel: localize("typeNewValue", "Type new value"),
        onFinish: async (value, success) => {
          if (success && value) {
            const focusedFrame = this.debugService.getViewModel().focusedStackFrame;
            if (focusedFrame && (expression instanceof Variable || expression instanceof Expression)) {
              await expression.setExpression(value, focusedFrame);
              this.debugService.getViewModel().updateViews();
            }
          }
        }
      };
    }
    return {
      initialValue: expression.name ? expression.name : "",
      ariaLabel: localize("watchExpressionInputAriaLabel", "Type watch expression"),
      placeholder: localize("watchExpressionPlaceholder", "Expression to watch"),
      onFinish: (value, success) => {
        if (success && value) {
          this.debugService.renameWatchExpression(expression.getId(), value);
          ignoreViewUpdates = true;
          this.debugService.getViewModel().updateViews();
          ignoreViewUpdates = false;
        } else if (!expression.name) {
          this.debugService.removeWatchExpressions(expression.getId());
        }
      }
    };
  }
  renderActionBar(actionBar, expression) {
    const contextKeyService = getContextForWatchExpressionMenu(this.contextKeyService, expression);
    const context = expression;
    const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { primary } = getContextMenuActions(menu, "inline");
    actionBar.clear();
    actionBar.context = context;
    actionBar.push(primary, { icon: true, label: false });
  }
};
WatchExpressionsRenderer.ID = "watchexpression";
WatchExpressionsRenderer = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IDebugService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IConfigurationService)
], WatchExpressionsRenderer);
function getContextForWatchExpressionMenu(parentContext, expression, additionalContext = []) {
  const session = expression.getSession();
  return parentContext.createOverlay([
    [CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT.key, "evaluateName" in expression],
    [CONTEXT_WATCH_ITEM_TYPE.key, expression instanceof Expression ? "expression" : expression instanceof Variable ? "variable" : void 0],
    [CONTEXT_CAN_VIEW_MEMORY.key, !!session?.capabilities.supportsReadMemoryRequest && expression.memoryReference !== void 0],
    [CONTEXT_VARIABLE_IS_READONLY.key, !!expression.presentationHint?.attributes?.includes("readOnly") || expression.presentationHint?.lazy],
    [CONTEXT_VARIABLE_TYPE.key, expression.type],
    [CONTEXT_DEBUG_TYPE.key, session?.configuration.type],
    ...additionalContext
  ]);
}
async function getContextForWatchExpressionMenuWithDataAccess(parentContext, expression, debugService, logService) {
  const session = expression.getSession();
  if (!session || !session.capabilities.supportsDataBreakpoints) {
    return getContextForWatchExpressionMenu(parentContext, expression);
  }
  const contextKeys = [];
  const stackFrame = debugService.getViewModel().focusedStackFrame;
  let dataBreakpointInfoResponse;
  try {
    if ("evaluateName" in expression && expression.evaluateName) {
      dataBreakpointInfoResponse = await session.dataBreakpointInfo(
        expression.evaluateName,
        void 0,
        stackFrame?.frameId
      );
    } else if (expression instanceof Variable) {
      dataBreakpointInfoResponse = await session.dataBreakpointInfo(
        expression.name,
        expression.parent.reference,
        stackFrame?.frameId
      );
    } else {
      dataBreakpointInfoResponse = await session.dataBreakpointInfo(
        expression.name,
        void 0,
        stackFrame?.frameId
      );
    }
  } catch (error) {
    logService.error("Failed to get data breakpoint info for watch expression:", error);
  }
  const dataBreakpointId = dataBreakpointInfoResponse?.dataId;
  const dataBreakpointAccessTypes = dataBreakpointInfoResponse?.accessTypes;
  setDataBreakpointInfoResponse(dataBreakpointInfoResponse);
  if (!dataBreakpointAccessTypes) {
    contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
  } else {
    for (const accessType of dataBreakpointAccessTypes) {
      switch (accessType) {
        case "read":
          contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED.key, !!dataBreakpointId]);
          break;
        case "write":
          contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
          break;
        case "readWrite":
          contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED.key, !!dataBreakpointId]);
          break;
      }
    }
  }
  return getContextForWatchExpressionMenu(parentContext, expression, contextKeys);
}
class WatchExpressionsAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize({ comment: ["Debug is a noun in this context, not a verb."], key: "watchAriaTreeLabel" }, "Debug Watch Expressions");
  }
  getAriaLabel(element) {
    if (element instanceof Expression) {
      return localize("watchExpressionAriaLabel", "{0}, value {1}", element.name, element.value);
    }
    return localize("watchVariableAriaLabel", "{0}, value {1}", element.name, element.value);
  }
}
class WatchExpressionsDragAndDrop {
  constructor(debugService) {
    this.debugService = debugService;
  }
  onDragStart(data, originalEvent) {
    if (data instanceof ElementsDragAndDropData) {
      originalEvent.dataTransfer.setData("text/plain", data.elements[0].name);
    }
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    if (!(data instanceof ElementsDragAndDropData)) {
      return false;
    }
    const expressions = data.elements;
    if (!(expressions.length > 0 && expressions[0] instanceof Expression)) {
      return false;
    }
    let dropEffectPosition = void 0;
    if (targetIndex === void 0) {
      dropEffectPosition = ListDragOverEffectPosition.After;
      targetIndex = -1;
    } else {
      switch (targetSector) {
        case ListViewTargetSector.TOP:
        case ListViewTargetSector.CENTER_TOP:
          dropEffectPosition = ListDragOverEffectPosition.Before;
          break;
        case ListViewTargetSector.CENTER_BOTTOM:
        case ListViewTargetSector.BOTTOM:
          dropEffectPosition = ListDragOverEffectPosition.After;
          break;
      }
    }
    return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition }, feedback: [targetIndex] };
  }
  getDragURI(element) {
    if (!(element instanceof Expression) || element === this.debugService.getViewModel().getSelectedExpression()?.expression) {
      return null;
    }
    return element.getId();
  }
  getDragLabel(elements) {
    if (elements.length === 1) {
      return elements[0].name;
    }
    return void 0;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
    if (!(data instanceof ElementsDragAndDropData)) {
      return;
    }
    const draggedElement = data.elements[0];
    if (!(draggedElement instanceof Expression)) {
      throw new Error("Invalid dragged element");
    }
    const watches = this.debugService.getModel().getWatchExpressions();
    const sourcePosition = watches.indexOf(draggedElement);
    let targetPosition;
    if (targetElement instanceof Expression) {
      targetPosition = watches.indexOf(targetElement);
      switch (targetSector) {
        case ListViewTargetSector.BOTTOM:
        case ListViewTargetSector.CENTER_BOTTOM:
          targetPosition++;
          break;
      }
      if (sourcePosition < targetPosition) {
        targetPosition--;
      }
    } else {
      targetPosition = watches.length - 1;
    }
    this.debugService.moveWatchExpression(draggedElement.getId(), targetPosition);
  }
  dispose() {
  }
}
registerAction2(class Collapse extends ViewAction {
  constructor() {
    super({
      id: "watch.collapse",
      viewId: WATCH_VIEW_ID,
      title: localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      menu: {
        id: MenuId.ViewTitle,
        order: 30,
        group: "navigation",
        when: ContextKeyExpr.equals("view", WATCH_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
const ADD_WATCH_ID = "workbench.debug.viewlet.action.addWatchExpression";
const ADD_WATCH_LABEL = localize("addWatchExpression", "Add Expression");
registerAction2(class AddWatchExpressionAction extends Action2 {
  constructor() {
    super({
      id: ADD_WATCH_ID,
      title: ADD_WATCH_LABEL,
      f1: false,
      icon: watchExpressionsAdd,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", WATCH_VIEW_ID)
      }
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.addWatchExpression();
  }
});
const REMOVE_WATCH_EXPRESSIONS_COMMAND_ID = "workbench.debug.viewlet.action.removeAllWatchExpressions";
const REMOVE_WATCH_EXPRESSIONS_LABEL = localize("removeAllWatchExpressions", "Remove All Expressions");
registerAction2(class RemoveAllWatchExpressionsAction extends Action2 {
  constructor() {
    super({
      id: REMOVE_WATCH_EXPRESSIONS_COMMAND_ID,
      // Use old and long id for backwards compatibility
      title: REMOVE_WATCH_EXPRESSIONS_LABEL,
      f1: false,
      icon: watchExpressionsRemoveAll,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      menu: {
        id: MenuId.ViewTitle,
        order: 20,
        group: "navigation",
        when: ContextKeyExpr.equals("view", WATCH_VIEW_ID)
      }
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.removeWatchExpressions();
  }
});
registerAction2(class CopyExpression extends ViewAction {
  constructor() {
    super({
      id: COPY_WATCH_EXPRESSION_COMMAND_ID,
      title: localize("copyWatchExpression", "Copy Expression"),
      f1: false,
      viewId: WATCH_VIEW_ID,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(
          FocusedViewContext.isEqualTo(WATCH_VIEW_ID),
          CONTEXT_EXPRESSION_SELECTED.negate()
        )
      },
      menu: {
        id: MenuId.DebugWatchContext,
        order: 20,
        group: "3_modification",
        when: CONTEXT_WATCH_ITEM_TYPE.isEqualTo("expression")
      }
    });
  }
  runInView(accessor, view, value) {
    const clipboardService = accessor.get(IClipboardService);
    if (!value) {
      value = view.treeSelection.at(-1);
    }
    if (value) {
      clipboardService.writeText(value.name);
    }
  }
});
const COPY_ALL_WATCH_EXPRESSIONS_COMMAND_ID = "workbench.debug.viewlet.action.copyAllWatchExpressions";
registerAction2(class CopyAllWatchExpressions extends ViewAction {
  constructor() {
    super({
      id: COPY_ALL_WATCH_EXPRESSIONS_COMMAND_ID,
      title: localize("copyAllWatchExpressions", "Copy All"),
      f1: false,
      viewId: WATCH_VIEW_ID,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      menu: {
        id: MenuId.DebugWatchContext,
        order: 45,
        group: "3_modification"
      }
    });
  }
  runInView(accessor) {
    const clipboardService = accessor.get(IClipboardService);
    const debugService = accessor.get(IDebugService);
    const watches = debugService.getModel().getWatchExpressions();
    const lines = watches.map((w) => `${w.name}: ${w.value}`);
    clipboardService.writeText(lines.join("\n"));
  }
});
export {
  ADD_WATCH_ID,
  ADD_WATCH_LABEL,
  COPY_ALL_WATCH_EXPRESSIONS_COMMAND_ID,
  REMOVE_WATCH_EXPRESSIONS_COMMAND_ID,
  REMOVE_WATCH_EXPRESSIONS_LABEL,
  WatchExpressionsRenderer,
  WatchExpressionsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFx3YXRjaEV4cHJlc3Npb25zVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbiwgTGlzdERyYWdPdmVyRWZmZWN0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEsIExpc3RWaWV3VGFyZ2V0U2VjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uLCBJVHJlZU1vdXNlRXZlbnQsIElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRDb250ZXh0TWVudUFjdGlvbnMsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3QWN0aW9uLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IEZvY3VzZWRWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQ0FOX1ZJRVdfTUVNT1JZLCBDT05URVhUX0VYUFJFU1NJT05fU0VMRUNURUQsIENPTlRFWFRfVkFSSUFCTEVfSVNfUkVBRE9OTFksIENPTlRFWFRfVkFSSUFCTEVfVFlQRSwgQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19FWElTVCwgQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19GT0NVU0VELCBDT05URVhUX1dBVENIX0lURU1fVFlQRSwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnU2VydmljZSwgSURlYnVnVmlld1dpdGhWYXJpYWJsZXMsIElFeHByZXNzaW9uLCBDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfQ0hBTkdFU19TVVBQT1JURUQsIENPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9JU19BQ0NFU1NFRF9TVVBQT1JURUQsIENPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9JU19SRUFEX1NVUFBPUlRFRCwgQ09OVEVYVF9WQVJJQUJMRV9FVkFMVUFURV9OQU1FX1BSRVNFTlQsIFdBVENIX1ZJRVdfSUQsIENPTlRFWFRfREVCVUdfVFlQRSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBFeHByZXNzaW9uLCBWYXJpYWJsZSwgVmlzdWFsaXplZEV4cHJlc3Npb24gfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEV4cHJlc3Npb25EYXRhU291cmNlLCBBYnN0cmFjdEV4cHJlc3Npb25zUmVuZGVyZXIsIGV4cHJlc3Npb25BbmRTY29wZUxhYmVsUHJvdmlkZXIsIElFeHByZXNzaW9uVGVtcGxhdGVEYXRhLCBJSW5wdXRCb3hPcHRpb25zLCByZW5kZXJWaWV3VHJlZSB9IGZyb20gJy4vYmFzZURlYnVnVmlldy5qcyc7XG5pbXBvcnQgeyBDT1BZX1dBVENIX0VYUFJFU1NJT05fQ09NTUFORF9JRCwgc2V0RGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgfSBmcm9tICcuL2RlYnVnQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRGVidWdFeHByZXNzaW9uUmVuZGVyZXIgfSBmcm9tICcuL2RlYnVnRXhwcmVzc2lvblJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHdhdGNoRXhwcmVzc2lvbnNBZGQsIHdhdGNoRXhwcmVzc2lvbnNSZW1vdmVBbGwgfSBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgVmFyaWFibGVzUmVuZGVyZXIsIFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyIH0gZnJvbSAnLi92YXJpYWJsZXNWaWV3LmpzJztcblxuY29uc3QgTUFYX1ZBTFVFX1JFTkRFUl9MRU5HVEhfSU5fVklFV0xFVCA9IDEwMjQ7XG5sZXQgaWdub3JlVmlld1VwZGF0ZXMgPSBmYWxzZTtcbmxldCB1c2VDYWNoZWRFdmFsdWF0aW9uID0gZmFsc2U7XG5cbmV4cG9ydCBjbGFzcyBXYXRjaEV4cHJlc3Npb25zVmlldyBleHRlbmRzIFZpZXdQYW5lIGltcGxlbWVudHMgSURlYnVnVmlld1dpdGhWYXJpYWJsZXMge1xuXG5cdHByaXZhdGUgd2F0Y2hFeHByZXNzaW9uc1VwZGF0ZWRTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgbmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SURlYnVnU2VydmljZSB8IElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbiwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgd2F0Y2hFeHByZXNzaW9uc0V4aXN0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyO1xuXG5cdHB1YmxpYyBnZXQgdHJlZVNlbGVjdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMud2F0Y2hFeHByZXNzaW9uc1VwZGF0ZWRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXHRcdFx0dGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0fSwgNTApKTtcblx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnNFeGlzdCA9IENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRVhJU1QuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnNFeGlzdC5zZXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRXYXRjaEV4cHJlc3Npb25zKCkubGVuZ3RoID4gMCk7XG5cdFx0dGhpcy5leHByZXNzaW9uUmVuZGVyZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RlYnVnLXBhbmUnKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGVidWctd2F0Y2gnKTtcblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gcmVuZGVyVmlld1RyZWUoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGV4cHJlc3Npb25zUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdhdGNoRXhwcmVzc2lvbnNSZW5kZXJlciwgdGhpcy5leHByZXNzaW9uUmVuZGVyZXIpO1xuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJRGVidWdTZXJ2aWNlIHwgSUV4cHJlc3Npb24sIElFeHByZXNzaW9uLCBGdXp6eVNjb3JlPiwgJ1dhdGNoRXhwcmVzc2lvbnMnLCB0cmVlQ29udGFpbmVyLCBuZXcgV2F0Y2hFeHByZXNzaW9uc0RlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdGV4cHJlc3Npb25zUmVuZGVyZXIsXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmFyaWFibGVzUmVuZGVyZXIsIHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlciwgdGhpcy5leHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdFx0XSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2F0Y2hFeHByZXNzaW9uc0RhdGFTb3VyY2UpLCB7XG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBXYXRjaEV4cHJlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAoZWxlbWVudDogSUV4cHJlc3Npb24pID0+IGVsZW1lbnQuZ2V0SWQoKSB9LFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGU6IElFeHByZXNzaW9uKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUgPT09IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmdldFNlbGVjdGVkRXhwcmVzc2lvbigpPy5leHByZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHQvLyBEb24ndCBmaWx0ZXIgaW5wdXQgYm94XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBleHByZXNzaW9uQW5kU2NvcGVMYWJlbFByb3ZpZGVyLmdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZG5kOiBuZXcgV2F0Y2hFeHByZXNzaW9uc0RyYWdBbmREcm9wKHRoaXMuZGVidWdTZXJ2aWNlKSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUpO1xuXHRcdHRoaXMudHJlZS5zZXRJbnB1dCh0aGlzLmRlYnVnU2VydmljZSk7XG5cdFx0Q09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19GT0NVU0VELmJpbmRUbyh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIucmVuZGVyZXJPblZpc3VhbGl6YXRpb25SYW5nZSh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKSwgdGhpcy50cmVlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Nb3VzZURibENsaWNrKGUgPT4gdGhpcy5vbk1vdXNlRGJsQ2xpY2soZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLm9uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucyhhc3luYyB3ZSA9PiB7XG5cdFx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnNFeGlzdC5zZXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRXYXRjaEV4cHJlc3Npb25zKCkubGVuZ3RoID4gMCk7XG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh3ZSAmJiAhd2UubmFtZSkge1xuXHRcdFx0XHRcdC8vIFdlIGFyZSBhZGRpbmcgYSBuZXcgaW5wdXQgYm94LCBubyBuZWVkIHRvIHJlLWV2YWx1YXRlIHdhdGNoIGV4cHJlc3Npb25zXG5cdFx0XHRcdFx0dXNlQ2FjaGVkRXZhbHVhdGlvbiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHRcdHVzZUNhY2hlZEV2YWx1YXRpb24gPSBmYWxzZTtcblx0XHRcdFx0aWYgKHdlIGluc3RhbmNlb2YgRXhwcmVzc2lvbikge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwod2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTdGFja0ZyYW1lKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy53YXRjaEV4cHJlc3Npb25zVXBkYXRlZFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMud2F0Y2hFeHByZXNzaW9uc1VwZGF0ZWRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25XaWxsVXBkYXRlVmlld3MoKCkgPT4ge1xuXHRcdFx0aWYgKCFpZ25vcmVWaWV3VXBkYXRlcykge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLm5lZWRzUmVmcmVzaCkge1xuXHRcdFx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnNVcGRhdGVkU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGxldCBob3Jpem9udGFsU2Nyb2xsaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkU2VsZWN0RXhwcmVzc2lvbihlID0+IHtcblx0XHRcdGNvbnN0IGV4cHJlc3Npb24gPSBlPy5leHByZXNzaW9uO1xuXHRcdFx0aWYgKGV4cHJlc3Npb24gJiYgdGhpcy50cmVlLmhhc05vZGUoZXhwcmVzc2lvbikpIHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZyA9IHRoaXMudHJlZS5vcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmc7XG5cdFx0XHRcdGlmIChob3Jpem9udGFsU2Nyb2xsaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChleHByZXNzaW9uLm5hbWUpIHtcblx0XHRcdFx0XHQvLyBPbmx5IHJlcmVuZGVyIGlmIHRoZSBpbnB1dCBpcyBhbHJlYWR5IGRvbmUgc2luY2Ugb3RoZXJ3aXNlIHRoZSB0cmVlIGlzIG5vdCB5ZXQgYXdhcmUgb2YgdGhlIG5ldyBlbGVtZW50XG5cdFx0XHRcdFx0dGhpcy50cmVlLnJlcmVuZGVyKGV4cHJlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKCFleHByZXNzaW9uICYmIGhvcml6b250YWxTY3JvbGxpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWxTY3JvbGxpbmc6IGhvcml6b250YWxTY3JvbGxpbmcgfSk7XG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmcgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRFdmFsdWF0ZUxhenlFeHByZXNzaW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBWYXJpYWJsZSAmJiB0aGlzLnRyZWUuaGFzTm9kZShlKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vdXNlRGJsQ2xpY2soZTogSVRyZWVNb3VzZUV2ZW50PElFeHByZXNzaW9uPik6IHZvaWQge1xuXHRcdGlmICgoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc05hbWUuaW5kZXhPZigndHdpc3RpZScpID49IDApIHtcblx0XHRcdC8vIElnbm9yZSBkb3VibGUgY2xpY2sgZXZlbnRzIG9uIHR3aXN0aWVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdC8vIGRvdWJsZSBjbGljayBvbiBwcmltaXRpdmUgdmFsdWU6IG9wZW4gaW5wdXQgYm94IHRvIGJlIGFibGUgdG8gc2VsZWN0IGFuZCBjb3B5IHZhbHVlLlxuXHRcdGNvbnN0IHNlbGVjdGVkRXhwcmVzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmdldFNlbGVjdGVkRXhwcmVzc2lvbigpO1xuXHRcdGlmICgoZWxlbWVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb24gJiYgZWxlbWVudCAhPT0gc2VsZWN0ZWRFeHByZXNzaW9uPy5leHByZXNzaW9uKSB8fCAoZWxlbWVudCBpbnN0YW5jZW9mIFZpc3VhbGl6ZWRFeHByZXNzaW9uICYmIGVsZW1lbnQudHJlZUl0ZW0uY2FuRWRpdCkpIHtcblx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnNldFNlbGVjdGVkRXhwcmVzc2lvbihlbGVtZW50LCBmYWxzZSk7XG5cdFx0fSBlbHNlIGlmICghZWxlbWVudCkge1xuXHRcdFx0Ly8gRG91YmxlIGNsaWNrIGluIHdhdGNoIHBhbmVsIHRyaWdnZXJzIHRvIGFkZCBhIG5ldyB3YXRjaCBleHByZXNzaW9uXG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5hZGRXYXRjaEV4cHJlc3Npb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PElFeHByZXNzaW9uPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBlbGVtZW50ICYmIGF3YWl0IGdldENvbnRleHRGb3JXYXRjaEV4cHJlc3Npb25NZW51V2l0aERhdGFBY2Nlc3ModGhpcy5jb250ZXh0S2V5U2VydmljZSwgZWxlbWVudCwgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnV2F0Y2hDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGVsZW1lbnQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KTtcblx0XHRjb25zdCB7IHNlY29uZGFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gc2Vjb25kYXJ5LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGVsZW1lbnQgJiYgc2VsZWN0aW9uLmluY2x1ZGVzKGVsZW1lbnQpID8gc2VsZWN0aW9uIDogZWxlbWVudCA/IFtlbGVtZW50XSA6IFtdXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgV2F0Y2hFeHByZXNzaW9uc0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUV4cHJlc3Npb24+IHtcblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IElFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElFeHByZXNzaW9uKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiBXYXRjaEV4cHJlc3Npb25zUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBWaXN1YWxpemVkRXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLklEO1xuXHRcdH1cblxuXHRcdC8vIFZhcmlhYmxlXG5cdFx0cmV0dXJuIFZhcmlhYmxlc1JlbmRlcmVyLklEO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzRGVidWdTZXJ2aWNlKGVsZW1lbnQ6IGFueSk6IGVsZW1lbnQgaXMgSURlYnVnU2VydmljZSB7XG5cdHJldHVybiB0eXBlb2YgZWxlbWVudC5nZXRDb25maWd1cmF0aW9uTWFuYWdlciA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuY2xhc3MgV2F0Y2hFeHByZXNzaW9uc0RhdGFTb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdEV4cHJlc3Npb25EYXRhU291cmNlPElEZWJ1Z1NlcnZpY2UsIElFeHByZXNzaW9uPiB7XG5cblx0cHVibGljIG92ZXJyaWRlIGhhc0NoaWxkcmVuKGVsZW1lbnQ6IElFeHByZXNzaW9uIHwgSURlYnVnU2VydmljZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0RlYnVnU2VydmljZShlbGVtZW50KSB8fCBlbGVtZW50Lmhhc0NoaWxkcmVuO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRvR2V0Q2hpbGRyZW4oZWxlbWVudDogSURlYnVnU2VydmljZSB8IElFeHByZXNzaW9uKTogUHJvbWlzZTxBcnJheTxJRXhwcmVzc2lvbj4+IHtcblx0XHRpZiAoaXNEZWJ1Z1NlcnZpY2UoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGVsZW1lbnQ7XG5cdFx0XHRjb25zdCB3YXRjaEV4cHJlc3Npb25zID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0V2F0Y2hFeHByZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHdhdGNoRXhwcmVzc2lvbnMubWFwKHdlID0+ICEhd2UubmFtZSAmJiAhdXNlQ2FjaGVkRXZhbHVhdGlvblxuXHRcdFx0XHQ/IHdlLmV2YWx1YXRlKHZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiEsIHZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZSEsICd3YXRjaCcpLnRoZW4oKCkgPT4gd2UpXG5cdFx0XHRcdDogUHJvbWlzZS5yZXNvbHZlKHdlKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50LmdldENoaWxkcmVuKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgV2F0Y2hFeHByZXNzaW9uc1JlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RFeHByZXNzaW9uc1JlbmRlcmVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd2F0Y2hleHByZXNzaW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXIsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGRlYnVnU2VydmljZSwgY29udGV4dFZpZXdTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIFdhdGNoRXhwcmVzc2lvbnNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRXhwcmVzc2lvbiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLnNob3dWYXJpYWJsZVR5cGVzJykpIHtcblx0XHRcdFx0c3VwZXIucmVuZGVyRXhwcmVzc2lvbkVsZW1lbnQobm9kZS5lbGVtZW50LCBub2RlLCBkYXRhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0c3VwZXIucmVuZGVyRXhwcmVzc2lvbkVsZW1lbnQobm9kZS5lbGVtZW50LCBub2RlLCBkYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJFeHByZXNzaW9uKGV4cHJlc3Npb246IElFeHByZXNzaW9uLCBkYXRhOiBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSwgaGlnaGxpZ2h0czogSUhpZ2hsaWdodFtdKTogdm9pZCB7XG5cdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRkYXRhLnR5cGUudGV4dENvbnRlbnQgPSAnJztcblx0XHRjb25zdCBzaG93VHlwZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuc2hvd1ZhcmlhYmxlVHlwZXM7XG5cdFx0aWYgKHNob3dUeXBlICYmIGV4cHJlc3Npb24udHlwZSkge1xuXHRcdFx0dGV4dCA9IHR5cGVvZiBleHByZXNzaW9uLnZhbHVlID09PSAnc3RyaW5nJyA/IGAke2V4cHJlc3Npb24ubmFtZX06IGAgOiBleHByZXNzaW9uLm5hbWU7XG5cdFx0XHQvL3JlbmRlciB0eXBlXG5cdFx0XHRkYXRhLnR5cGUudGV4dENvbnRlbnQgPSBleHByZXNzaW9uLnR5cGUgKyAnID0nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZXh0ID0gdHlwZW9mIGV4cHJlc3Npb24udmFsdWUgPT09ICdzdHJpbmcnID8gYCR7ZXhwcmVzc2lvbi5uYW1lfSA9YCA6IGV4cHJlc3Npb24ubmFtZTtcblx0XHR9XG5cblx0XHRsZXQgdGl0bGU6IHN0cmluZztcblx0XHRpZiAoZXhwcmVzc2lvbi50eXBlKSB7XG5cdFx0XHRpZiAoc2hvd1R5cGUpIHtcblx0XHRcdFx0dGl0bGUgPSBgJHtleHByZXNzaW9uLm5hbWV9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRpdGxlID0gZXhwcmVzc2lvbi50eXBlID09PSBleHByZXNzaW9uLnZhbHVlID9cblx0XHRcdFx0XHRleHByZXNzaW9uLnR5cGUgOlxuXHRcdFx0XHRcdGAke2V4cHJlc3Npb24udHlwZX1gO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aXRsZSA9IGV4cHJlc3Npb24udmFsdWU7XG5cdFx0fVxuXG5cdFx0ZGF0YS5sYWJlbC5zZXQodGV4dCwgaGlnaGxpZ2h0cywgdGl0bGUpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhbHVlKGRhdGEudmFsdWUsIGV4cHJlc3Npb24sIHtcblx0XHRcdHNob3dDaGFuZ2VkOiB0cnVlLFxuXHRcdFx0bWF4VmFsdWVMZW5ndGg6IE1BWF9WQUxVRV9SRU5ERVJfTEVOR1RIX0lOX1ZJRVdMRVQsXG5cdFx0XHRjb2xvcml6ZTogdHJ1ZSxcblx0XHRcdHNlc3Npb246IGV4cHJlc3Npb24uZ2V0U2Vzc2lvbigpLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRJbnB1dEJveE9wdGlvbnMoZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIHNldHRpbmdWYWx1ZTogYm9vbGVhbik6IElJbnB1dEJveE9wdGlvbnMge1xuXHRcdGlmIChzZXR0aW5nVmFsdWUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluaXRpYWxWYWx1ZTogZXhwcmVzc2lvbi52YWx1ZSxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgndHlwZU5ld1ZhbHVlJywgXCJUeXBlIG5ldyB2YWx1ZVwiKSxcblx0XHRcdFx0b25GaW5pc2g6IGFzeW5jICh2YWx1ZTogc3RyaW5nLCBzdWNjZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHN1Y2Nlc3MgJiYgdmFsdWUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZvY3VzZWRGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0XHRcdFx0aWYgKGZvY3VzZWRGcmFtZSAmJiAoZXhwcmVzc2lvbiBpbnN0YW5jZW9mIFZhcmlhYmxlIHx8IGV4cHJlc3Npb24gaW5zdGFuY2VvZiBFeHByZXNzaW9uKSkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBleHByZXNzaW9uLnNldEV4cHJlc3Npb24odmFsdWUsIGZvY3VzZWRGcmFtZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnVwZGF0ZVZpZXdzKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbml0aWFsVmFsdWU6IGV4cHJlc3Npb24ubmFtZSA/IGV4cHJlc3Npb24ubmFtZSA6ICcnLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnd2F0Y2hFeHByZXNzaW9uSW5wdXRBcmlhTGFiZWwnLCBcIlR5cGUgd2F0Y2ggZXhwcmVzc2lvblwiKSxcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnd2F0Y2hFeHByZXNzaW9uUGxhY2Vob2xkZXInLCBcIkV4cHJlc3Npb24gdG8gd2F0Y2hcIiksXG5cdFx0XHRvbkZpbmlzaDogKHZhbHVlOiBzdHJpbmcsIHN1Y2Nlc3M6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHN1Y2Nlc3MgJiYgdmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5yZW5hbWVXYXRjaEV4cHJlc3Npb24oZXhwcmVzc2lvbi5nZXRJZCgpLCB2YWx1ZSk7XG5cdFx0XHRcdFx0aWdub3JlVmlld1VwZGF0ZXMgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnVwZGF0ZVZpZXdzKCk7XG5cdFx0XHRcdFx0aWdub3JlVmlld1VwZGF0ZXMgPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIGlmICghZXhwcmVzc2lvbi5uYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhleHByZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJBY3Rpb25CYXIoYWN0aW9uQmFyOiBBY3Rpb25CYXIsIGV4cHJlc3Npb246IElFeHByZXNzaW9uKSB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBnZXRDb250ZXh0Rm9yV2F0Y2hFeHByZXNzaW9uTWVudSh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCBleHByZXNzaW9uKTtcblx0XHRjb25zdCBjb250ZXh0ID0gZXhwcmVzc2lvbjtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRGVidWdXYXRjaENvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IGFyZzogY29udGV4dCwgc2hvdWxkRm9yd2FyZEFyZ3M6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXG5cdFx0YWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0YWN0aW9uQmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdGFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG59XG5cbi8qKlxuICogR2V0cyBhIGNvbnRleHQga2V5IG92ZXJsYXkgdGhhdCBoYXMgY29udGV4dCBmb3IgdGhlIGdpdmVuIGV4cHJlc3Npb24uXG4gKi9cbmZ1bmN0aW9uIGdldENvbnRleHRGb3JXYXRjaEV4cHJlc3Npb25NZW51KHBhcmVudENvbnRleHQ6IElDb250ZXh0S2V5U2VydmljZSwgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIGFkZGl0aW9uYWxDb250ZXh0OiBbc3RyaW5nLCB1bmtub3duXVtdID0gW10pIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IGV4cHJlc3Npb24uZ2V0U2Vzc2lvbigpO1xuXHRyZXR1cm4gcGFyZW50Q29udGV4dC5jcmVhdGVPdmVybGF5KFtcblx0XHRbQ09OVEVYVF9WQVJJQUJMRV9FVkFMVUFURV9OQU1FX1BSRVNFTlQua2V5LCAnZXZhbHVhdGVOYW1lJyBpbiBleHByZXNzaW9uXSxcblx0XHRbQ09OVEVYVF9XQVRDSF9JVEVNX1RZUEUua2V5LCBleHByZXNzaW9uIGluc3RhbmNlb2YgRXhwcmVzc2lvbiA/ICdleHByZXNzaW9uJyA6IGV4cHJlc3Npb24gaW5zdGFuY2VvZiBWYXJpYWJsZSA/ICd2YXJpYWJsZScgOiB1bmRlZmluZWRdLFxuXHRcdFtDT05URVhUX0NBTl9WSUVXX01FTU9SWS5rZXksICEhc2Vzc2lvbj8uY2FwYWJpbGl0aWVzLnN1cHBvcnRzUmVhZE1lbW9yeVJlcXVlc3QgJiYgZXhwcmVzc2lvbi5tZW1vcnlSZWZlcmVuY2UgIT09IHVuZGVmaW5lZF0sXG5cdFx0W0NPTlRFWFRfVkFSSUFCTEVfSVNfUkVBRE9OTFkua2V5LCAhIWV4cHJlc3Npb24ucHJlc2VudGF0aW9uSGludD8uYXR0cmlidXRlcz8uaW5jbHVkZXMoJ3JlYWRPbmx5JykgfHwgZXhwcmVzc2lvbi5wcmVzZW50YXRpb25IaW50Py5sYXp5XSxcblx0XHRbQ09OVEVYVF9WQVJJQUJMRV9UWVBFLmtleSwgZXhwcmVzc2lvbi50eXBlXSxcblx0XHRbQ09OVEVYVF9ERUJVR19UWVBFLmtleSwgc2Vzc2lvbj8uY29uZmlndXJhdGlvbi50eXBlXSxcblx0XHQuLi5hZGRpdGlvbmFsQ29udGV4dFxuXHRdKTtcbn1cblxuLyoqXG4gKiBHZXRzIGEgY29udGV4dCBrZXkgb3ZlcmxheSB0aGF0IGhhcyBjb250ZXh0IGZvciB0aGUgZ2l2ZW4gZXhwcmVzc2lvbiwgaW5jbHVkaW5nIGRhdGEgYWNjZXNzIGluZm8uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldENvbnRleHRGb3JXYXRjaEV4cHJlc3Npb25NZW51V2l0aERhdGFBY2Nlc3MocGFyZW50Q29udGV4dDogSUNvbnRleHRLZXlTZXJ2aWNlLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkge1xuXHRjb25zdCBzZXNzaW9uID0gZXhwcmVzc2lvbi5nZXRTZXNzaW9uKCk7XG5cdGlmICghc2Vzc2lvbiB8fCAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEYXRhQnJlYWtwb2ludHMpIHtcblx0XHRyZXR1cm4gZ2V0Q29udGV4dEZvcldhdGNoRXhwcmVzc2lvbk1lbnUocGFyZW50Q29udGV4dCwgZXhwcmVzc2lvbik7XG5cdH1cblxuXHRjb25zdCBjb250ZXh0S2V5czogW3N0cmluZywgdW5rbm93bl1bXSA9IFtdO1xuXHRjb25zdCBzdGFja0ZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRsZXQgZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2U7XG5cblx0dHJ5IHtcblx0XHQvLyBQZXIgREFQIHNwZWM6XG5cdFx0Ly8gLSBJZiBldmFsdWF0ZU5hbWUgaXMgYXZhaWxhYmxlOiB1c2UgaXQgYXMgYW4gZXhwcmVzc2lvbiAodG9wLWxldmVsIGV2YWx1YXRpb24pXG5cdFx0Ly8gLSBPdGhlcndpc2UsIGNoZWNrIGlmIGl0J3MgYSBWYXJpYWJsZTogdXNlIG5hbWUgKyBwYXJlbnQgcmVmZXJlbmNlIChjb250YWluZXItcmVsYXRpdmUpXG5cdFx0Ly8gLSBPdGhlcndpc2U6IHVzZSBuYW1lIGFzIGFuIGV4cHJlc3Npb25cblx0XHRpZiAoJ2V2YWx1YXRlTmFtZScgaW4gZXhwcmVzc2lvbiAmJiBleHByZXNzaW9uLmV2YWx1YXRlTmFtZSkge1xuXHRcdFx0Ly8gVXNlIGV2YWx1YXRlTmFtZSBpZiBhdmFpbGFibGUgKG1vcmUgcHJlY2lzZSBmb3IgZXZhbHVhdGlvbiBjb250ZXh0KVxuXHRcdFx0ZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLmRhdGFCcmVha3BvaW50SW5mbyhcblx0XHRcdFx0ZXhwcmVzc2lvbi5ldmFsdWF0ZU5hbWUgYXMgc3RyaW5nLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHN0YWNrRnJhbWU/LmZyYW1lSWRcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmIChleHByZXNzaW9uIGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRcdC8vIFZhcmlhYmxlIHdpdGhvdXQgZXZhbHVhdGVOYW1lOiB1c2UgbmFtZSByZWxhdGl2ZSB0byBwYXJlbnQgY29udGFpbmVyXG5cdFx0XHRkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSA9IGF3YWl0IHNlc3Npb24uZGF0YUJyZWFrcG9pbnRJbmZvKFxuXHRcdFx0XHRleHByZXNzaW9uLm5hbWUsXG5cdFx0XHRcdGV4cHJlc3Npb24ucGFyZW50LnJlZmVyZW5jZSxcblx0XHRcdFx0c3RhY2tGcmFtZT8uZnJhbWVJZFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRXhwcmVzc2lvbiB3aXRob3V0IGV2YWx1YXRlTmFtZTogdXNlIG5hbWUgYXMgdGhlIGV4cHJlc3Npb24gdG8gZXZhbHVhdGVcblx0XHRcdGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5kYXRhQnJlYWtwb2ludEluZm8oXG5cdFx0XHRcdGV4cHJlc3Npb24ubmFtZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRzdGFja0ZyYW1lPy5mcmFtZUlkXG5cdFx0XHQpO1xuXHRcdH1cblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHQvLyBzaWxlbnRseSBjb250aW51ZSB3aXRob3V0IGRhdGEgYnJlYWtwb2ludCBzdXBwb3J0IGZvciB0aGlzIGl0ZW1cblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGRhdGEgYnJlYWtwb2ludCBpbmZvIGZvciB3YXRjaCBleHByZXNzaW9uOicsIGVycm9yKTtcblx0fVxuXG5cdGNvbnN0IGRhdGFCcmVha3BvaW50SWQgPSBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZT8uZGF0YUlkO1xuXHRjb25zdCBkYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGVzID0gZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2U/LmFjY2Vzc1R5cGVzO1xuXHRzZXREYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZShkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSk7XG5cblx0aWYgKCFkYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGVzKSB7XG5cdFx0Y29udGV4dEtleXMucHVzaChbQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0NIQU5HRVNfU1VQUE9SVEVELmtleSwgISFkYXRhQnJlYWtwb2ludElkXSk7XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChjb25zdCBhY2Nlc3NUeXBlIG9mIGRhdGFCcmVha3BvaW50QWNjZXNzVHlwZXMpIHtcblx0XHRcdHN3aXRjaCAoYWNjZXNzVHlwZSkge1xuXHRcdFx0XHRjYXNlICdyZWFkJzpcblx0XHRcdFx0XHRjb250ZXh0S2V5cy5wdXNoKFtDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfUkVBRF9TVVBQT1JURUQua2V5LCAhIWRhdGFCcmVha3BvaW50SWRdKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnd3JpdGUnOlxuXHRcdFx0XHRcdGNvbnRleHRLZXlzLnB1c2goW0NPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9DSEFOR0VTX1NVUFBPUlRFRC5rZXksICEhZGF0YUJyZWFrcG9pbnRJZF0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZWFkV3JpdGUnOlxuXHRcdFx0XHRcdGNvbnRleHRLZXlzLnB1c2goW0NPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9JU19BQ0NFU1NFRF9TVVBQT1JURUQua2V5LCAhIWRhdGFCcmVha3BvaW50SWRdKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZ2V0Q29udGV4dEZvcldhdGNoRXhwcmVzc2lvbk1lbnUocGFyZW50Q29udGV4dCwgZXhwcmVzc2lvbiwgY29udGV4dEtleXMpO1xufVxuXG5cbmNsYXNzIFdhdGNoRXhwcmVzc2lvbnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJRXhwcmVzc2lvbj4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnRGVidWcgaXMgYSBub3VuIGluIHRoaXMgY29udGV4dCwgbm90IGEgdmVyYi4nXSwga2V5OiAnd2F0Y2hBcmlhVHJlZUxhYmVsJyB9LCBcIkRlYnVnIFdhdGNoIEV4cHJlc3Npb25zXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IElFeHByZXNzaW9uKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnd2F0Y2hFeHByZXNzaW9uQXJpYUxhYmVsJywgXCJ7MH0sIHZhbHVlIHsxfVwiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQudmFsdWUpO1xuXHRcdH1cblxuXHRcdC8vIFZhcmlhYmxlXG5cdFx0cmV0dXJuIGxvY2FsaXplKCd3YXRjaFZhcmlhYmxlQXJpYUxhYmVsJywgXCJ7MH0sIHZhbHVlIHsxfVwiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQudmFsdWUpO1xuXHR9XG59XG5cbmNsYXNzIFdhdGNoRXhwcmVzc2lvbnNEcmFnQW5kRHJvcCBpbXBsZW1lbnRzIElUcmVlRHJhZ0FuZERyb3A8SUV4cHJlc3Npb24+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSkgeyB9XG5cdG9uRHJhZ1N0YXJ0PyhkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSB7XG5cdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2ZlciEuc2V0RGF0YSgndGV4dC9wbGFpbicsIGRhdGEuZWxlbWVudHNbMF0ubmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0aWYgKCEoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cHJlc3Npb25zID0gKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8SUV4cHJlc3Npb24+KS5lbGVtZW50cztcblx0XHRpZiAoIShleHByZXNzaW9ucy5sZW5ndGggPiAwICYmIGV4cHJlc3Npb25zWzBdIGluc3RhbmNlb2YgRXhwcmVzc2lvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgZHJvcEVmZmVjdFBvc2l0aW9uOiBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gSG92ZXJpbmcgb3ZlciB0aGUgbGlzdFxuXHRcdFx0ZHJvcEVmZmVjdFBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXI7XG5cdFx0XHR0YXJnZXRJbmRleCA9IC0xO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBIb3ZlcmluZyBvdmVyIGFuIGVsZW1lbnRcblx0XHRcdHN3aXRjaCAodGFyZ2V0U2VjdG9yKSB7XG5cdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuVE9QOlxuXHRcdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkNFTlRFUl9UT1A6XG5cdFx0XHRcdFx0ZHJvcEVmZmVjdFBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQmVmb3JlOyBicmVhaztcblx0XHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NOlxuXHRcdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkJPVFRPTTpcblx0XHRcdFx0XHRkcm9wRWZmZWN0UG9zaXRpb24gPSBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5BZnRlcjsgYnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWNjZXB0OiB0cnVlLCBlZmZlY3Q6IHsgdHlwZTogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlLCBwb3NpdGlvbjogZHJvcEVmZmVjdFBvc2l0aW9uIH0sIGZlZWRiYWNrOiBbdGFyZ2V0SW5kZXhdIH0gc2F0aXNmaWVzIElUcmVlRHJhZ092ZXJSZWFjdGlvbjtcblx0fVxuXG5cdGdldERyYWdVUkkoZWxlbWVudDogSUV4cHJlc3Npb24pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRXhwcmVzc2lvbikgfHwgZWxlbWVudCA9PT0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZ2V0U2VsZWN0ZWRFeHByZXNzaW9uKCk/LmV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50LmdldElkKCk7XG5cdH1cblxuXHRnZXREcmFnTGFiZWwoZWxlbWVudHM6IElFeHByZXNzaW9uW10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChlbGVtZW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBlbGVtZW50c1swXS5uYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IElFeHByZXNzaW9uLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIShkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHJhZ2dlZEVsZW1lbnQgPSAoZGF0YSBhcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxJRXhwcmVzc2lvbj4pLmVsZW1lbnRzWzBdO1xuXHRcdGlmICghKGRyYWdnZWRFbGVtZW50IGluc3RhbmNlb2YgRXhwcmVzc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkcmFnZ2VkIGVsZW1lbnQnKTtcblx0XHR9XG5cblx0XHRjb25zdCB3YXRjaGVzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRXYXRjaEV4cHJlc3Npb25zKCk7XG5cdFx0Y29uc3Qgc291cmNlUG9zaXRpb24gPSB3YXRjaGVzLmluZGV4T2YoZHJhZ2dlZEVsZW1lbnQpO1xuXG5cdFx0bGV0IHRhcmdldFBvc2l0aW9uO1xuXHRcdGlmICh0YXJnZXRFbGVtZW50IGluc3RhbmNlb2YgRXhwcmVzc2lvbikge1xuXHRcdFx0dGFyZ2V0UG9zaXRpb24gPSB3YXRjaGVzLmluZGV4T2YodGFyZ2V0RWxlbWVudCk7XG5cblx0XHRcdHN3aXRjaCAodGFyZ2V0U2VjdG9yKSB7XG5cdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQk9UVE9NOlxuXHRcdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkNFTlRFUl9CT1RUT006XG5cdFx0XHRcdFx0dGFyZ2V0UG9zaXRpb24rKzsgYnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzb3VyY2VQb3NpdGlvbiA8IHRhcmdldFBvc2l0aW9uKSB7XG5cdFx0XHRcdHRhcmdldFBvc2l0aW9uLS07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldFBvc2l0aW9uID0gd2F0Y2hlcy5sZW5ndGggLSAxO1xuXHRcdH1cblxuXHRcdHRoaXMuZGVidWdTZXJ2aWNlLm1vdmVXYXRjaEV4cHJlc3Npb24oZHJhZ2dlZEVsZW1lbnQuZ2V0SWQoKSwgdGFyZ2V0UG9zaXRpb24pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29sbGFwc2UgZXh0ZW5kcyBWaWV3QWN0aW9uPFdhdGNoRXhwcmVzc2lvbnNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd2F0Y2guY29sbGFwc2UnLFxuXHRcdFx0dmlld0lkOiBXQVRDSF9WSUVXX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb2xsYXBzZScsIFwiQ29sbGFwc2UgQWxsXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19FWElTVCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiAzMCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgV0FUQ0hfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFdhdGNoRXhwcmVzc2lvbnNWaWV3KSB7XG5cdFx0dmlldy5jb2xsYXBzZUFsbCgpO1xuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IEFERF9XQVRDSF9JRCA9ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24uYWRkV2F0Y2hFeHByZXNzaW9uJzsgLy8gVXNlIG9sZCBhbmQgbG9uZyBpZCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbmV4cG9ydCBjb25zdCBBRERfV0FUQ0hfTEFCRUwgPSBsb2NhbGl6ZSgnYWRkV2F0Y2hFeHByZXNzaW9uJywgXCJBZGQgRXhwcmVzc2lvblwiKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFkZFdhdGNoRXhwcmVzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQUREX1dBVENIX0lELFxuXHRcdFx0dGl0bGU6IEFERF9XQVRDSF9MQUJFTCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IHdhdGNoRXhwcmVzc2lvbnNBZGQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBXQVRDSF9WSUVXX0lEKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGRlYnVnU2VydmljZS5hZGRXYXRjaEV4cHJlc3Npb24oKTtcblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBSRU1PVkVfV0FUQ0hfRVhQUkVTU0lPTlNfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24ucmVtb3ZlQWxsV2F0Y2hFeHByZXNzaW9ucyc7XG5leHBvcnQgY29uc3QgUkVNT1ZFX1dBVENIX0VYUFJFU1NJT05TX0xBQkVMID0gbG9jYWxpemUoJ3JlbW92ZUFsbFdhdGNoRXhwcmVzc2lvbnMnLCBcIlJlbW92ZSBBbGwgRXhwcmVzc2lvbnNcIik7XG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVtb3ZlQWxsV2F0Y2hFeHByZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUkVNT1ZFX1dBVENIX0VYUFJFU1NJT05TX0NPTU1BTkRfSUQsIC8vIFVzZSBvbGQgYW5kIGxvbmcgaWQgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0XHR0aXRsZTogUkVNT1ZFX1dBVENIX0VYUFJFU1NJT05TX0xBQkVMLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogd2F0Y2hFeHByZXNzaW9uc1JlbW92ZUFsbCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19FWElTVCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgV0FUQ0hfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlV2F0Y2hFeHByZXNzaW9ucygpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvcHlFeHByZXNzaW9uIGV4dGVuZHMgVmlld0FjdGlvbjxXYXRjaEV4cHJlc3Npb25zVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09QWV9XQVRDSF9FWFBSRVNTSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvcHlXYXRjaEV4cHJlc3Npb24nLCBcIkNvcHkgRXhwcmVzc2lvblwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHZpZXdJZDogV0FUQ0hfVklFV19JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19FWElTVCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlDLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdEZvY3VzZWRWaWV3Q29udGV4dC5pc0VxdWFsVG8oV0FUQ0hfVklFV19JRCksXG5cdFx0XHRcdFx0Q09OVEVYVF9FWFBSRVNTSU9OX1NFTEVDVEVELm5lZ2F0ZSgpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z1dhdGNoQ29udGV4dCxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0XHRncm91cDogJzNfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9XQVRDSF9JVEVNX1RZUEUuaXNFcXVhbFRvKCdleHByZXNzaW9uJylcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogV2F0Y2hFeHByZXNzaW9uc1ZpZXcsIHZhbHVlPzogSUV4cHJlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IHZpZXcudHJlZVNlbGVjdGlvbi5hdCgtMSk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodmFsdWUubmFtZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IENPUFlfQUxMX1dBVENIX0VYUFJFU1NJT05TX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmNvcHlBbGxXYXRjaEV4cHJlc3Npb25zJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvcHlBbGxXYXRjaEV4cHJlc3Npb25zIGV4dGVuZHMgVmlld0FjdGlvbjxXYXRjaEV4cHJlc3Npb25zVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09QWV9BTExfV0FUQ0hfRVhQUkVTU0lPTlNfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29weUFsbFdhdGNoRXhwcmVzc2lvbnMnLCBcIkNvcHkgQWxsXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0dmlld0lkOiBXQVRDSF9WSUVXX0lELFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX1dBVENIX0VYUFJFU1NJT05TX0VYSVNULFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnV2F0Y2hDb250ZXh0LFxuXHRcdFx0XHRvcmRlcjogNDUsXG5cdFx0XHRcdGdyb3VwOiAnM19tb2RpZmljYXRpb24nXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgd2F0Y2hlcyA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFdhdGNoRXhwcmVzc2lvbnMoKTtcblx0XHRjb25zdCBsaW5lcyA9IHdhdGNoZXMubWFwKHcgPT4gYCR7dy5uYW1lfTogJHt3LnZhbHVlfWApO1xuXHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVFBLFNBQStCLDRCQUE0Qiw4QkFBOEI7QUFDekYsU0FBUyx5QkFBeUIsNEJBQTRCO0FBRzlELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUV4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE4QjtBQUN2QyxTQUFTLFNBQVMsY0FBYyxRQUFRLHVCQUF1QjtBQUMvRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsWUFBWSxnQkFBZ0I7QUFFckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx5QkFBeUIsNkJBQTZCLDhCQUE4Qix1QkFBdUIsaUNBQWlDLG1DQUFtQyx5QkFBOEMsZUFBcUQsNENBQTRDLGdEQUFnRCw0Q0FBNEMsd0NBQXdDLGVBQWUsMEJBQTBCO0FBQ3BmLFNBQVMsWUFBWSxVQUFVLDRCQUE0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
