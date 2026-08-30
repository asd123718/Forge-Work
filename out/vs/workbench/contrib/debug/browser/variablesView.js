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
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { toAction } from "../../../../base/common/actions.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { createMatches } from "../../../../base/common/filters.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLES_FOCUSED, DebugVisualizationType, IDebugService, VARIABLES_VIEW_ID, WATCH_VIEW_ID } from "../common/debug.js";
import { getContextForVariable } from "../common/debugContext.js";
import { ErrorScope, Expression, Scope, StackFrame, Variable, VisualizedExpression, getUriForDebugMemory } from "../common/debugModel.js";
import { IDebugVisualizerService } from "../common/debugVisualizers.js";
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, renderViewTree } from "./baseDebugView.js";
import { ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, COPY_VALUE_ID, COPY_VALUE_LABEL, setDataBreakpointInfoResponse } from "./debugCommands.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
const $ = dom.$;
let forgetScopes = true;
let variableInternalContext;
let VariablesView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, configurationService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, hoverService, menuService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.menuService = menuService;
    this.needsRefresh = false;
    this.savedViewState = /* @__PURE__ */ new Map();
    this.autoExpandedScopes = /* @__PURE__ */ new Set();
    this.updateTreeScheduler = this._register(new RunOnceScheduler(async () => {
      const stackFrame = this.debugService.getViewModel().focusedStackFrame;
      this.needsRefresh = false;
      const input = this.tree.getInput();
      if (input) {
        this.savedViewState.set(input.getId(), this.tree.getViewState());
      }
      if (!stackFrame) {
        await this.tree.setInput(null);
        return;
      }
      const viewState = this.savedViewState.get(stackFrame.getId());
      await this.tree.setInput(stackFrame, viewState);
      const scopes = await stackFrame.getScopes();
      const toExpand = scopes.find((s) => !s.expensive);
      if (toExpand && this.tree.hasNode(toExpand)) {
        this.autoExpandedScopes.add(toExpand.getId());
        await this.tree.expand(toExpand);
      }
    }, 400));
  }
  get treeSelection() {
    return this.tree.getSelection();
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-variables");
    const treeContainer = renderViewTree(container);
    const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "VariablesView",
      treeContainer,
      new VariablesDelegate(),
      [
        this.instantiationService.createInstance(VariablesRenderer, expressionRenderer),
        this.instantiationService.createInstance(VisualizedVariableRenderer, expressionRenderer),
        new ScopesRenderer(),
        new ScopeErrorRenderer()
      ],
      this.instantiationService.createInstance(VariablesDataSource),
      {
        accessibilityProvider: new VariablesAccessibilityProvider(),
        identityProvider: { getId: (element) => element.getId() },
        keyboardNavigationLabelProvider: expressionAndScopeLabelProvider,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
    this.tree.setInput(this.debugService.getViewModel().focusedStackFrame ?? null);
    CONTEXT_VARIABLES_FOCUSED.bindTo(this.tree.contextKeyService);
    this._register(this.debugService.getViewModel().onDidFocusStackFrame((sf) => {
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        return;
      }
      const timeout = sf.explicit ? 0 : void 0;
      this.updateTreeScheduler.schedule(timeout);
    }));
    this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
      const stackFrame = this.debugService.getViewModel().focusedStackFrame;
      if (stackFrame && forgetScopes) {
        stackFrame.forgetScopes();
      }
      forgetScopes = true;
      this.tree.updateChildren();
    }));
    this._register(this.tree);
    this._register(this.tree.onMouseDblClick((e) => this.onMouseDblClick(e)));
    this._register(this.tree.onContextMenu(async (e) => await this.onContextMenu(e)));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.updateTreeScheduler.schedule();
      }
    }));
    let horizontalScrolling;
    this._register(this.debugService.getViewModel().onDidSelectExpression((e) => {
      const variable = e?.expression;
      if (variable && this.tree.hasNode(variable)) {
        horizontalScrolling = this.tree.options.horizontalScrolling;
        if (horizontalScrolling) {
          this.tree.updateOptions({ horizontalScrolling: false });
        }
        this.tree.rerender(variable);
      } else if (!e && horizontalScrolling !== void 0) {
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
    this._register(this.debugService.onDidEndSession(() => {
      this.savedViewState.clear();
      this.autoExpandedScopes.clear();
    }));
  }
  layoutBody(width, height) {
    super.layoutBody(height, width);
    this.tree.layout(width, height);
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  onMouseDblClick(e) {
    if (this.canSetExpressionValue(e.element)) {
      this.debugService.getViewModel().setSelectedExpression(e.element, false);
    }
  }
  canSetExpressionValue(e) {
    const session = this.debugService.getViewModel().focusedSession;
    if (!session) {
      return false;
    }
    if (e instanceof VisualizedExpression) {
      return !!e.treeItem.canEdit;
    }
    if (!session.capabilities?.supportsSetVariable && !session.capabilities?.supportsSetExpression) {
      return false;
    }
    return e instanceof Variable && !e.presentationHint?.attributes?.includes("readOnly") && !e.presentationHint?.lazy;
  }
  async onContextMenu(e) {
    const element = e.element;
    if (element instanceof Scope) {
      return this.openContextMenuForScope(e, element);
    }
    if (!(element instanceof Variable) || !element.value) {
      return;
    }
    return openContextMenuForVariableTreeElement(this.contextKeyService, this.menuService, this.contextMenuService, MenuId.DebugVariablesContext, e);
  }
  openContextMenuForScope(e, scope) {
    const context = { scope: { name: scope.name } };
    const menu = this.menuService.getMenuActions(MenuId.DebugScopesContext, this.contextKeyService, { arg: context, shouldForwardArgs: false });
    const { secondary } = getContextMenuActions(menu, "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => secondary
    });
  }
};
VariablesView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IViewDescriptorService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IMenuService)
], VariablesView);
async function openContextMenuForVariableTreeElement(parentContextKeyService, menuService, contextMenuService, menuId, e) {
  const variable = e.element;
  if (!(variable instanceof Variable) || !variable.value) {
    return;
  }
  const contextKeyService = await getContextForVariableMenuWithDataAccess(parentContextKeyService, variable);
  const context = getVariablesContext(variable);
  const menu = menuService.getMenuActions(menuId, contextKeyService, { arg: context, shouldForwardArgs: false });
  const { secondary } = getContextMenuActions(menu, "inline");
  contextMenuService.showContextMenu({
    getAnchor: () => e.anchor,
    getActions: () => secondary
  });
}
const getVariablesContext = (variable) => ({
  sessionId: variable.getSession()?.getId(),
  container: variable.parent instanceof Expression ? { expression: variable.parent.name } : variable.parent.toDebugProtocolObject(),
  variable: variable.toDebugProtocolObject()
});
async function getContextForVariableMenuWithDataAccess(parentContext, variable) {
  const session = variable.getSession();
  if (!session || !session.capabilities.supportsDataBreakpoints) {
    return getContextForVariableMenuBase(parentContext, variable);
  }
  const contextKeys = [];
  const dataBreakpointInfoResponse = await session.dataBreakpointInfo(variable.name, variable.parent.reference);
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
  return getContextForVariableMenuBase(parentContext, variable, contextKeys);
}
function getContextForVariableMenuBase(parentContext, variable, additionalContext = []) {
  variableInternalContext = variable;
  return getContextForVariable(parentContext, variable, additionalContext);
}
function isStackFrame(obj) {
  return obj instanceof StackFrame;
}
class VariablesDataSource extends AbstractExpressionDataSource {
  hasChildren(element) {
    if (!element) {
      return false;
    }
    if (isStackFrame(element)) {
      return true;
    }
    return element.hasChildren;
  }
  doGetChildren(element) {
    if (isStackFrame(element)) {
      return element.getScopes();
    }
    return element.getChildren();
  }
}
class VariablesDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof ErrorScope) {
      return ScopeErrorRenderer.ID;
    }
    if (element instanceof Scope) {
      return ScopesRenderer.ID;
    }
    if (element instanceof VisualizedExpression) {
      return VisualizedVariableRenderer.ID;
    }
    return VariablesRenderer.ID;
  }
}
const _ScopesRenderer = class _ScopesRenderer {
  get templateId() {
    return _ScopesRenderer.ID;
  }
  renderTemplate(container) {
    const name = dom.append(container, $(".scope"));
    const label = new HighlightedLabel(name);
    return { name, label };
  }
  renderElement(element, index, templateData) {
    templateData.label.set(element.element.name, createMatches(element.filterData));
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
  }
};
_ScopesRenderer.ID = "scope";
let ScopesRenderer = _ScopesRenderer;
const _ScopeErrorRenderer = class _ScopeErrorRenderer {
  get templateId() {
    return _ScopeErrorRenderer.ID;
  }
  renderTemplate(container) {
    const wrapper = dom.append(container, $(".scope"));
    const error = dom.append(wrapper, $(".error"));
    return { error };
  }
  renderElement(element, index, templateData) {
    templateData.error.innerText = element.element.name;
  }
  disposeTemplate() {
  }
};
_ScopeErrorRenderer.ID = "scopeError";
let ScopeErrorRenderer = _ScopeErrorRenderer;
let VisualizedVariableRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, debugService, contextViewService, hoverService, menuService, contextKeyService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
  }
  /**
   * Registers a helper that rerenders the tree when visualization is requested
   * or cancelled./
   */
  static rendererOnVisualizationRange(model, tree) {
    return model.onDidChangeVisualization(({ original }) => {
      if (!tree.hasNode(original)) {
        return;
      }
      const parent = tree.getParentElement(original);
      tree.updateChildren(parent, false, false);
    });
  }
  get templateId() {
    return VisualizedVariableRenderer.ID;
  }
  renderElement(node, index, data) {
    data.elementDisposable.clear();
    super.renderExpressionElement(node.element, node, data);
  }
  renderExpression(expression, data, highlights) {
    const viz = expression;
    let text = viz.name;
    if (viz.value && typeof viz.name === "string") {
      text += ":";
    }
    data.label.set(text, highlights, viz.name);
    data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, viz, {
      showChanged: false,
      maxValueLength: 1024,
      colorize: true,
      session: expression.getSession()
    }));
  }
  getInputBoxOptions(expression) {
    const viz = expression;
    return {
      initialValue: expression.value,
      ariaLabel: localize("variableValueAriaLabel", "Type new variable value"),
      validationOptions: {
        validation: () => viz.errorMessage ? { content: viz.errorMessage } : null
      },
      onFinish: (value, success) => {
        viz.errorMessage = void 0;
        if (success) {
          viz.edit(value).then(() => {
            forgetScopes = false;
            this.debugService.getViewModel().updateViews();
          });
        }
      }
    };
  }
  renderActionBar(actionBar, expression, _data) {
    const viz = expression;
    const contextKeyService = viz.original ? getContextForVariableMenuBase(this.contextKeyService, viz.original) : this.contextKeyService;
    const context = viz.original ? getVariablesContext(viz.original) : void 0;
    const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { primary } = getContextMenuActions(menu, "inline");
    if (viz.original) {
      const action = toAction({
        id: "debugViz",
        label: localize("removeVisualizer", "Remove Visualizer"),
        class: ThemeIcon.asClassName(Codicon.eye),
        run: () => this.debugService.getViewModel().setVisualizedExpression(viz.original, void 0)
      });
      action.checked = true;
      primary.push(action);
      actionBar.domNode.style.display = "initial";
    }
    actionBar.clear();
    actionBar.context = context;
    actionBar.push(primary, { icon: true, label: false });
  }
};
VisualizedVariableRenderer.ID = "viz";
VisualizedVariableRenderer = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], VisualizedVariableRenderer);
let VariablesRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, menuService, contextKeyService, visualization, contextMenuService, debugService, contextViewService, hoverService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.visualization = visualization;
    this.contextMenuService = contextMenuService;
  }
  get templateId() {
    return VariablesRenderer.ID;
  }
  renderExpression(expression, data, highlights) {
    data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression, {
      highlights,
      showChanged: true
    }));
  }
  renderElement(node, index, data) {
    data.elementDisposable.clear();
    super.renderExpressionElement(node.element, node, data);
  }
  getInputBoxOptions(expression) {
    const variable = expression;
    return {
      initialValue: expression.value,
      ariaLabel: localize("variableValueAriaLabel", "Type new variable value"),
      validationOptions: {
        validation: () => variable.errorMessage ? { content: variable.errorMessage } : null
      },
      onFinish: (value, success) => {
        variable.errorMessage = void 0;
        const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
        if (success && variable.value !== value && focusedStackFrame) {
          variable.setVariable(value, focusedStackFrame).then(() => {
            forgetScopes = false;
            this.debugService.getViewModel().updateViews();
          });
        }
      }
    };
  }
  renderActionBar(actionBar, expression, data) {
    const variable = expression;
    const contextKeyService = getContextForVariableMenuBase(this.contextKeyService, variable);
    const context = getVariablesContext(variable);
    const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { primary } = getContextMenuActions(menu, "inline");
    actionBar.clear();
    actionBar.context = context;
    actionBar.push(primary, { icon: true, label: false });
    const cts = new CancellationTokenSource();
    data.elementDisposable.add(toDisposable(() => cts.dispose(true)));
    this.visualization.getApplicableFor(expression, cts.token).then((result) => {
      data.elementDisposable.add(result);
      const originalExpression = expression instanceof VisualizedExpression && expression.original || expression;
      const actions = result.object.map((v) => toAction({ id: "debugViz", label: v.name, class: v.iconClass || "debug-viz-icon", run: this.useVisualizer(v, originalExpression, cts.token) }));
      if (actions.length === 0) {
      } else if (actions.length === 1) {
        actionBar.push(actions[0], { icon: true, label: false });
      } else {
        actionBar.push(toAction({ id: "debugViz", label: localize("useVisualizer", "Visualize Variable..."), class: ThemeIcon.asClassName(Codicon.eye), run: () => this.pickVisualizer(actions, originalExpression, data) }), { icon: true, label: false });
      }
    });
  }
  pickVisualizer(actions, expression, data) {
    this.contextMenuService.showContextMenu({
      getAnchor: () => data.actionBar.getContainer(),
      getActions: () => actions
    });
  }
  useVisualizer(viz, expression, token) {
    return async () => {
      const resolved = await viz.resolve(token);
      if (token.isCancellationRequested) {
        return;
      }
      if (resolved.type === DebugVisualizationType.Command) {
        viz.execute();
      } else {
        const replacement = await this.visualization.getVisualizedNodeFor(resolved.id, expression);
        if (replacement) {
          this.debugService.getViewModel().setVisualizedExpression(expression, replacement);
        }
      }
    };
  }
};
VariablesRenderer.ID = "variable";
VariablesRenderer = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IDebugVisualizerService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IDebugService),
  __decorateParam(6, IContextViewService),
  __decorateParam(7, IHoverService)
], VariablesRenderer);
class VariablesAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("variablesAriaTreeLabel", "Debug Variables");
  }
  getAriaLabel(element) {
    if (element instanceof Scope) {
      return localize("variableScopeAriaLabel", "Scope {0}", element.name);
    }
    if (element instanceof Variable) {
      return localize({ key: "variableAriaLabel", comment: ["Placeholders are variable name and variable value respectivly. They should not be translated."] }, "{0}, value {1}", element.name, element.value);
    }
    return null;
  }
}
const SET_VARIABLE_ID = "debug.setVariable";
CommandsRegistry.registerCommand({
  id: SET_VARIABLE_ID,
  handler: (accessor) => {
    const debugService = accessor.get(IDebugService);
    debugService.getViewModel().setSelectedExpression(variableInternalContext, false);
  }
});
CommandsRegistry.registerCommand({
  metadata: {
    description: COPY_VALUE_LABEL
  },
  id: COPY_VALUE_ID,
  handler: async (accessor, arg, ctx) => {
    const debugService = accessor.get(IDebugService);
    const clipboardService = accessor.get(IClipboardService);
    let elementContext = "";
    let elements;
    if (!arg) {
      const viewService = accessor.get(IViewsService);
      const focusedView = viewService.getFocusedView();
      let view;
      if (focusedView?.id === WATCH_VIEW_ID) {
        view = viewService.getActiveViewWithId(WATCH_VIEW_ID);
        elementContext = "watch";
      } else if (focusedView?.id === VARIABLES_VIEW_ID) {
        view = viewService.getActiveViewWithId(VARIABLES_VIEW_ID);
        elementContext = "variables";
      }
      if (!view) {
        return;
      }
      elements = view.treeSelection.filter((e) => e instanceof Expression || e instanceof Variable);
    } else if (arg instanceof Variable || arg instanceof Expression) {
      elementContext = "watch";
      elements = [arg];
    } else {
      elementContext = "variables";
      elements = variableInternalContext ? [variableInternalContext] : [];
    }
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    const session = debugService.getViewModel().focusedSession;
    if (!stackFrame || !session || elements.length === 0) {
      return;
    }
    const evalContext = session.capabilities.supportsClipboardContext ? "clipboard" : elementContext;
    const toEvaluate = elements.map((element) => element instanceof Variable ? element.evaluateName || element.value : element.name);
    try {
      const evaluations = await Promise.all(toEvaluate.map((expr) => session.evaluate(expr, stackFrame.frameId, evalContext)));
      const result = coalesce(evaluations).map((evaluation) => evaluation.body.result);
      if (result.length) {
        clipboardService.writeText(result.join("\n"));
      }
    } catch (e) {
      const result = elements.map((element) => element.value);
      clipboardService.writeText(result.join("\n"));
    }
  }
});
const VIEW_MEMORY_ID = "workbench.debug.viewlet.action.viewMemory";
const HEX_EDITOR_EXTENSION_ID = "ms-vscode.hexeditor";
const HEX_EDITOR_EDITOR_ID = "hexEditor.hexedit";
CommandsRegistry.registerCommand({
  id: VIEW_MEMORY_ID,
  handler: async (accessor, arg, ctx) => {
    const debugService = accessor.get(IDebugService);
    let sessionId;
    let memoryReference;
    if ("sessionId" in arg) {
      if (!arg.sessionId || !arg.variable.memoryReference) {
        return;
      }
      sessionId = arg.sessionId;
      memoryReference = arg.variable.memoryReference;
    } else {
      if (!arg.memoryReference) {
        return;
      }
      const focused = debugService.getViewModel().focusedSession;
      if (!focused) {
        return;
      }
      sessionId = focused.getId();
      memoryReference = arg.memoryReference;
    }
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const editorService = accessor.get(IEditorService);
    const notificationService = accessor.get(INotificationService);
    const extensionService = accessor.get(IExtensionService);
    const telemetryService = accessor.get(ITelemetryService);
    const ext = await extensionService.getExtension(HEX_EDITOR_EXTENSION_ID);
    if (ext || await tryInstallHexEditor(extensionsWorkbenchService, notificationService)) {
      telemetryService.publicLog("debug/didViewMemory", {
        debugType: debugService.getModel().getSession(sessionId)?.configuration.type
      });
      await editorService.openEditor({
        resource: getUriForDebugMemory(sessionId, memoryReference),
        options: {
          revealIfOpened: true,
          override: HEX_EDITOR_EDITOR_ID
        }
      }, SIDE_GROUP);
    }
  }
});
async function tryInstallHexEditor(extensionsWorkbenchService, notificationService) {
  try {
    await extensionsWorkbenchService.install(HEX_EDITOR_EXTENSION_ID, {
      justification: localize("viewMemory.prompt", "Inspecting binary data requires this extension."),
      enable: true
    }, ProgressLocation.Notification);
    return true;
  } catch (error) {
    notificationService.error(error);
    return false;
  }
}
CommandsRegistry.registerCommand({
  metadata: {
    description: COPY_EVALUATE_PATH_LABEL
  },
  id: COPY_EVALUATE_PATH_ID,
  handler: async (accessor, context) => {
    const clipboardService = accessor.get(IClipboardService);
    if (context instanceof Variable) {
      await clipboardService.writeText(context.evaluateName);
    } else {
      await clipboardService.writeText(context.variable.evaluateName);
    }
  }
});
CommandsRegistry.registerCommand({
  metadata: {
    description: ADD_TO_WATCH_LABEL
  },
  id: ADD_TO_WATCH_ID,
  handler: async (accessor, context) => {
    const debugService = accessor.get(IDebugService);
    debugService.addWatchExpression(context.variable.evaluateName);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "variables.collapse",
      viewId: VARIABLES_VIEW_ID,
      title: localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", VARIABLES_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
export {
  SET_VARIABLE_ID,
  VIEW_MEMORY_ID,
  VariablesRenderer,
  VariablesView,
  VisualizedVariableRenderer,
  openContextMenuForVariableTreeElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFx2YXJpYWJsZXNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCwgSUhpZ2hsaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBBc3luY0RhdGFUcmVlLCBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZU1vdXNlRXZlbnQsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUsIGNyZWF0ZU1hdGNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3QWN0aW9uLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0NIQU5HRVNfU1VQUE9SVEVELCBDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfQUNDRVNTRURfU1VQUE9SVEVELCBDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfUkVBRF9TVVBQT1JURUQsIENPTlRFWFRfVkFSSUFCTEVTX0ZPQ1VTRUQsIERlYnVnVmlzdWFsaXphdGlvblR5cGUsIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1ZpZXdXaXRoVmFyaWFibGVzLCBJRXhwcmVzc2lvbiwgSVNjb3BlLCBJU3RhY2tGcmFtZSwgSVZpZXdNb2RlbCwgVkFSSUFCTEVTX1ZJRVdfSUQsIFdBVENIX1ZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgZ2V0Q29udGV4dEZvclZhcmlhYmxlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBFcnJvclNjb3BlLCBFeHByZXNzaW9uLCBTY29wZSwgU3RhY2tGcmFtZSwgVmFyaWFibGUsIFZpc3VhbGl6ZWRFeHByZXNzaW9uLCBnZXRVcmlGb3JEZWJ1Z01lbW9yeSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IERlYnVnVmlzdWFsaXplciwgSURlYnVnVmlzdWFsaXplclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZGVidWdWaXN1YWxpemVycy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEV4cHJlc3Npb25EYXRhU291cmNlLCBBYnN0cmFjdEV4cHJlc3Npb25zUmVuZGVyZXIsIGV4cHJlc3Npb25BbmRTY29wZUxhYmVsUHJvdmlkZXIsIElFeHByZXNzaW9uVGVtcGxhdGVEYXRhLCBJSW5wdXRCb3hPcHRpb25zLCByZW5kZXJWaWV3VHJlZSB9IGZyb20gJy4vYmFzZURlYnVnVmlldy5qcyc7XG5pbXBvcnQgeyBBRERfVE9fV0FUQ0hfSUQsIEFERF9UT19XQVRDSF9MQUJFTCwgQ09QWV9FVkFMVUFURV9QQVRIX0lELCBDT1BZX0VWQUxVQVRFX1BBVEhfTEFCRUwsIENPUFlfVkFMVUVfSUQsIENPUFlfVkFMVUVfTEFCRUwsIHNldERhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyIH0gZnJvbSAnLi9kZWJ1Z0V4cHJlc3Npb25SZW5kZXJlci5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcbmxldCBmb3JnZXRTY29wZXMgPSB0cnVlO1xuXG5sZXQgdmFyaWFibGVJbnRlcm5hbENvbnRleHQ6IFZhcmlhYmxlIHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSVZhcmlhYmxlc0NvbnRleHQge1xuXHRzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y29udGFpbmVyOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlIHwgRGVidWdQcm90b2NvbC5TY29wZSB8IERlYnVnUHJvdG9jb2wuRXZhbHVhdGVBcmd1bWVudHM7XG5cdHZhcmlhYmxlOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlO1xufVxuXG5leHBvcnQgY2xhc3MgVmFyaWFibGVzVmlldyBleHRlbmRzIFZpZXdQYW5lIGltcGxlbWVudHMgSURlYnVnVmlld1dpdGhWYXJpYWJsZXMge1xuXG5cdHByaXZhdGUgdXBkYXRlVHJlZVNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBuZWVkc1JlZnJlc2ggPSBmYWxzZTtcblx0cHJpdmF0ZSB0cmVlITogV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJU3RhY2tGcmFtZSB8IG51bGwsIElFeHByZXNzaW9uIHwgSVNjb3BlLCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSBzYXZlZFZpZXdTdGF0ZSA9IG5ldyBNYXA8c3RyaW5nLCBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZT4oKTtcblx0cHJpdmF0ZSBhdXRvRXhwYW5kZWRTY29wZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwdWJsaWMgZ2V0IHRyZWVTZWxlY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHQvLyBVc2Ugc2NoZWR1bGVyIHRvIHByZXZlbnQgdW5uZWNlc3NhcnkgZmxhc2hpbmdcblx0XHR0aGlzLnVwZGF0ZVRyZWVTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cblx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMudHJlZS5nZXRJbnB1dCgpO1xuXHRcdFx0aWYgKGlucHV0KSB7XG5cdFx0XHRcdHRoaXMuc2F2ZWRWaWV3U3RhdGUuc2V0KGlucHV0LmdldElkKCksIHRoaXMudHJlZS5nZXRWaWV3U3RhdGUoKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXN0YWNrRnJhbWUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnNldElucHV0KG51bGwpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMuc2F2ZWRWaWV3U3RhdGUuZ2V0KHN0YWNrRnJhbWUuZ2V0SWQoKSk7XG5cdFx0XHRhd2FpdCB0aGlzLnRyZWUuc2V0SW5wdXQoc3RhY2tGcmFtZSwgdmlld1N0YXRlKTtcblxuXHRcdFx0Ly8gQXV0b21hdGljYWxseSBleHBhbmQgdGhlIGZpcnN0IG5vbi1leHBlbnNpdmUgc2NvcGVcblx0XHRcdGNvbnN0IHNjb3BlcyA9IGF3YWl0IHN0YWNrRnJhbWUuZ2V0U2NvcGVzKCk7XG5cdFx0XHRjb25zdCB0b0V4cGFuZCA9IHNjb3Blcy5maW5kKHMgPT4gIXMuZXhwZW5zaXZlKTtcblxuXHRcdFx0Ly8gQSByYWNlIGNvbmRpdGlvbiBjb3VsZCBiZSBwcmVzZW50IGNhdXNpbmcgdGhlIHNjb3BlcyBoZXJlIHRvIGJlIGRpZmZlcmVudCBmcm9tIHRoZSBzY29wZXMgdGhhdCB0aGUgdHJlZSBqdXN0IHJldHJpZXZlZC5cblx0XHRcdC8vIElmIHRoYXQgaGFwcGVuZWQsIGRvbid0IHRyeSB0byByZXZlYWwgYW55dGhpbmcsIGl0IHdpbGwgYmUgc3RyYWlnaHRlbmVkIG91dCBvbiB0aGUgbmV4dCB1cGRhdGVcblx0XHRcdGlmICh0b0V4cGFuZCAmJiB0aGlzLnRyZWUuaGFzTm9kZSh0b0V4cGFuZCkpIHtcblx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRTY29wZXMuYWRkKHRvRXhwYW5kLmdldElkKCkpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKHRvRXhwYW5kKTtcblx0XHRcdH1cblx0XHR9LCA0MDApKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVidWctcGFuZScpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy12YXJpYWJsZXMnKTtcblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gcmVuZGVyVmlld1RyZWUoY29udGFpbmVyKTtcblx0XHRjb25zdCBleHByZXNzaW9uUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnRXhwcmVzc2lvblJlbmRlcmVyKTtcblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SVN0YWNrRnJhbWUgfCBudWxsLCBJRXhwcmVzc2lvbiB8IElTY29wZSwgRnV6enlTY29yZT4sICdWYXJpYWJsZXNWaWV3JywgdHJlZUNvbnRhaW5lciwgbmV3IFZhcmlhYmxlc0RlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmFyaWFibGVzUmVuZGVyZXIsIGV4cHJlc3Npb25SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIsIGV4cHJlc3Npb25SZW5kZXJlciksXG5cdFx0XHRcdG5ldyBTY29wZXNSZW5kZXJlcigpLFxuXHRcdFx0XHRuZXcgU2NvcGVFcnJvclJlbmRlcmVyKCksXG5cdFx0XHRdLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWYXJpYWJsZXNEYXRhU291cmNlKSwge1xuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgVmFyaWFibGVzQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAoZWxlbWVudDogSUV4cHJlc3Npb24gfCBJU2NvcGUpID0+IGVsZW1lbnQuZ2V0SWQoKSB9LFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogZXhwcmVzc2lvbkFuZFNjb3BlTGFiZWxQcm92aWRlcixcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLnJlbmRlcmVyT25WaXN1YWxpemF0aW9uUmFuZ2UodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCksIHRoaXMudHJlZSkpO1xuXHRcdHRoaXMudHJlZS5zZXRJbnB1dCh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZSA/PyBudWxsKTtcblxuXHRcdENPTlRFWFRfVkFSSUFCTEVTX0ZPQ1VTRUQuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU3RhY2tGcmFtZShzZiA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWZyZXNoIHRoZSB0cmVlIGltbWVkaWF0ZWx5IGlmIHRoZSB1c2VyIGV4cGxpY3RseSBjaGFuZ2VkIHN0YWNrIGZyYW1lcy5cblx0XHRcdC8vIE90aGVyd2lzZSBwb3N0cG9uZSB0aGUgcmVmcmVzaCB1bnRpbCB1c2VyIHN0b3BzIHN0ZXBwaW5nLlxuXHRcdFx0Y29uc3QgdGltZW91dCA9IHNmLmV4cGxpY2l0ID8gMCA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudXBkYXRlVHJlZVNjaGVkdWxlci5zY2hlZHVsZSh0aW1lb3V0KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25XaWxsVXBkYXRlVmlld3MoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0aWYgKHN0YWNrRnJhbWUgJiYgZm9yZ2V0U2NvcGVzKSB7XG5cdFx0XHRcdHN0YWNrRnJhbWUuZm9yZ2V0U2NvcGVzKCk7XG5cdFx0XHR9XG5cdFx0XHRmb3JnZXRTY29wZXMgPSB0cnVlO1xuXHRcdFx0dGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uTW91c2VEYmxDbGljayhlID0+IHRoaXMub25Nb3VzZURibENsaWNrKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoYXN5bmMgZSA9PiBhd2FpdCB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlICYmIHRoaXMubmVlZHNSZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVHJlZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRsZXQgaG9yaXpvbnRhbFNjcm9sbGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZFNlbGVjdEV4cHJlc3Npb24oZSA9PiB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZSA9IGU/LmV4cHJlc3Npb247XG5cdFx0XHRpZiAodmFyaWFibGUgJiYgdGhpcy50cmVlLmhhc05vZGUodmFyaWFibGUpKSB7XG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmcgPSB0aGlzLnRyZWUub3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXHRcdFx0XHRpZiAoaG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0XHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKHsgaG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnRyZWUucmVyZW5kZXIodmFyaWFibGUpO1xuXHRcdFx0fSBlbHNlIGlmICghZSAmJiBob3Jpem9udGFsU2Nyb2xsaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsU2Nyb2xsaW5nOiBob3Jpem9udGFsU2Nyb2xsaW5nIH0pO1xuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEV2YWx1YXRlTGF6eUV4cHJlc3Npb24oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFZhcmlhYmxlICYmIHRoaXMudHJlZS5oYXNOb2RlKGUpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbihlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkRW5kU2Vzc2lvbigoKSA9PiB7XG5cdFx0XHR0aGlzLnNhdmVkVmlld1N0YXRlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmF1dG9FeHBhbmRlZFNjb3Blcy5jbGVhcigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vdXNlRGJsQ2xpY2soZTogSVRyZWVNb3VzZUV2ZW50PElFeHByZXNzaW9uIHwgSVNjb3BlPik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhblNldEV4cHJlc3Npb25WYWx1ZShlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5zZXRTZWxlY3RlZEV4cHJlc3Npb24oZS5lbGVtZW50LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjYW5TZXRFeHByZXNzaW9uVmFsdWUoZTogSUV4cHJlc3Npb24gfCBJU2NvcGUgfCBudWxsKTogZSBpcyBJRXhwcmVzc2lvbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChlIGluc3RhbmNlb2YgVmlzdWFsaXplZEV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiAhIWUudHJlZUl0ZW0uY2FuRWRpdDtcblx0XHR9XG5cblx0XHRpZiAoIXNlc3Npb24uY2FwYWJpbGl0aWVzPy5zdXBwb3J0c1NldFZhcmlhYmxlICYmICFzZXNzaW9uLmNhcGFiaWxpdGllcz8uc3VwcG9ydHNTZXRFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGUgaW5zdGFuY2VvZiBWYXJpYWJsZSAmJiAhZS5wcmVzZW50YXRpb25IaW50Py5hdHRyaWJ1dGVzPy5pbmNsdWRlcygncmVhZE9ubHknKSAmJiAhZS5wcmVzZW50YXRpb25IaW50Py5sYXp5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxJRXhwcmVzc2lvbiB8IElTY29wZT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXG5cdFx0Ly8gSGFuZGxlIHNjb3BlIGNvbnRleHQgbWVudVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2NvcGUpIHtcblx0XHRcdHJldHVybiB0aGlzLm9wZW5Db250ZXh0TWVudUZvclNjb3BlKGUsIGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSB2YXJpYWJsZSBjb250ZXh0IG1lbnVcblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgVmFyaWFibGUpIHx8ICFlbGVtZW50LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wZW5Db250ZXh0TWVudUZvclZhcmlhYmxlVHJlZUVsZW1lbnQodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5tZW51U2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIE1lbnVJZC5EZWJ1Z1ZhcmlhYmxlc0NvbnRleHQsIGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuQ29udGV4dE1lbnVGb3JTY29wZShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SUV4cHJlc3Npb24gfCBJU2NvcGU+LCBzY29wZTogU2NvcGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZXh0ID0geyBzY29wZTogeyBuYW1lOiBzY29wZS5uYW1lIH0gfTtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRGVidWdTY29wZXNDb250ZXh0LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB7IGFyZzogY29udGV4dCwgc2hvdWxkRm9yd2FyZEFyZ3M6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHsgc2Vjb25kYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBzZWNvbmRhcnlcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3BlbkNvbnRleHRNZW51Rm9yVmFyaWFibGVUcmVlRWxlbWVudChwYXJlbnRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsIG1lbnVJZDogTWVudUlkLCBlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SUV4cHJlc3Npb24gfCBJU2NvcGU+KSB7XG5cdGNvbnN0IHZhcmlhYmxlID0gZS5lbGVtZW50O1xuXHRpZiAoISh2YXJpYWJsZSBpbnN0YW5jZW9mIFZhcmlhYmxlKSB8fCAhdmFyaWFibGUudmFsdWUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGF3YWl0IGdldENvbnRleHRGb3JWYXJpYWJsZU1lbnVXaXRoRGF0YUFjY2VzcyhwYXJlbnRDb250ZXh0S2V5U2VydmljZSwgdmFyaWFibGUpO1xuXHRjb25zdCBjb250ZXh0OiBJVmFyaWFibGVzQ29udGV4dCA9IGdldFZhcmlhYmxlc0NvbnRleHQodmFyaWFibGUpO1xuXHRjb25zdCBtZW51ID0gbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMobWVudUlkLCBjb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGNvbnRleHQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KTtcblxuXHRjb25zdCB7IHNlY29uZGFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblx0Y29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRnZXRBY3Rpb25zOiAoKSA9PiBzZWNvbmRhcnlcblx0fSk7XG59XG5cbmNvbnN0IGdldFZhcmlhYmxlc0NvbnRleHQgPSAodmFyaWFibGU6IFZhcmlhYmxlKTogSVZhcmlhYmxlc0NvbnRleHQgPT4gKHtcblx0c2Vzc2lvbklkOiB2YXJpYWJsZS5nZXRTZXNzaW9uKCk/LmdldElkKCksXG5cdGNvbnRhaW5lcjogdmFyaWFibGUucGFyZW50IGluc3RhbmNlb2YgRXhwcmVzc2lvblxuXHRcdD8geyBleHByZXNzaW9uOiB2YXJpYWJsZS5wYXJlbnQubmFtZSB9XG5cdFx0OiAodmFyaWFibGUucGFyZW50IGFzIChWYXJpYWJsZSB8IFNjb3BlKSkudG9EZWJ1Z1Byb3RvY29sT2JqZWN0KCksXG5cdHZhcmlhYmxlOiB2YXJpYWJsZS50b0RlYnVnUHJvdG9jb2xPYmplY3QoKVxufSk7XG5cbi8qKlxuICogR2V0cyBhIGNvbnRleHQga2V5IG92ZXJsYXkgdGhhdCBoYXMgY29udGV4dCBmb3IgdGhlIGdpdmVuIHZhcmlhYmxlLCBpbmNsdWRpbmcgZGF0YSBhY2Nlc3MgaW5mby5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0Q29udGV4dEZvclZhcmlhYmxlTWVudVdpdGhEYXRhQWNjZXNzKHBhcmVudENvbnRleHQ6IElDb250ZXh0S2V5U2VydmljZSwgdmFyaWFibGU6IFZhcmlhYmxlKSB7XG5cdGNvbnN0IHNlc3Npb24gPSB2YXJpYWJsZS5nZXRTZXNzaW9uKCk7XG5cdGlmICghc2Vzc2lvbiB8fCAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEYXRhQnJlYWtwb2ludHMpIHtcblx0XHRyZXR1cm4gZ2V0Q29udGV4dEZvclZhcmlhYmxlTWVudUJhc2UocGFyZW50Q29udGV4dCwgdmFyaWFibGUpO1xuXHR9XG5cblx0Y29uc3QgY29udGV4dEtleXM6IFtzdHJpbmcsIHVua25vd25dW10gPSBbXTtcblx0Y29uc3QgZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLmRhdGFCcmVha3BvaW50SW5mbyh2YXJpYWJsZS5uYW1lLCB2YXJpYWJsZS5wYXJlbnQucmVmZXJlbmNlKTtcblx0Y29uc3QgZGF0YUJyZWFrcG9pbnRJZCA9IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlPy5kYXRhSWQ7XG5cdGNvbnN0IGRhdGFCcmVha3BvaW50QWNjZXNzVHlwZXMgPSBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZT8uYWNjZXNzVHlwZXM7XG5cdHNldERhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlKGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlKTtcblxuXHRpZiAoIWRhdGFCcmVha3BvaW50QWNjZXNzVHlwZXMpIHtcblx0XHRjb250ZXh0S2V5cy5wdXNoKFtDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfQ0hBTkdFU19TVVBQT1JURUQua2V5LCAhIWRhdGFCcmVha3BvaW50SWRdKTtcblx0fSBlbHNlIHtcblx0XHRmb3IgKGNvbnN0IGFjY2Vzc1R5cGUgb2YgZGF0YUJyZWFrcG9pbnRBY2Nlc3NUeXBlcykge1xuXHRcdFx0c3dpdGNoIChhY2Nlc3NUeXBlKSB7XG5cdFx0XHRcdGNhc2UgJ3JlYWQnOlxuXHRcdFx0XHRcdGNvbnRleHRLZXlzLnB1c2goW0NPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9JU19SRUFEX1NVUFBPUlRFRC5rZXksICEhZGF0YUJyZWFrcG9pbnRJZF0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd3cml0ZSc6XG5cdFx0XHRcdFx0Y29udGV4dEtleXMucHVzaChbQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0NIQU5HRVNfU1VQUE9SVEVELmtleSwgISFkYXRhQnJlYWtwb2ludElkXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3JlYWRXcml0ZSc6XG5cdFx0XHRcdFx0Y29udGV4dEtleXMucHVzaChbQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0lTX0FDQ0VTU0VEX1NVUFBPUlRFRC5rZXksICEhZGF0YUJyZWFrcG9pbnRJZF0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBnZXRDb250ZXh0Rm9yVmFyaWFibGVNZW51QmFzZShwYXJlbnRDb250ZXh0LCB2YXJpYWJsZSwgY29udGV4dEtleXMpO1xufVxuXG4vKipcbiAqIEdldHMgYSBjb250ZXh0IGtleSBvdmVybGF5IHRoYXQgaGFzIGNvbnRleHQgZm9yIHRoZSBnaXZlbiB2YXJpYWJsZS5cbiAqL1xuZnVuY3Rpb24gZ2V0Q29udGV4dEZvclZhcmlhYmxlTWVudUJhc2UocGFyZW50Q29udGV4dDogSUNvbnRleHRLZXlTZXJ2aWNlLCB2YXJpYWJsZTogVmFyaWFibGUsIGFkZGl0aW9uYWxDb250ZXh0OiBbc3RyaW5nLCB1bmtub3duXVtdID0gW10pIHtcblx0dmFyaWFibGVJbnRlcm5hbENvbnRleHQgPSB2YXJpYWJsZTtcblx0cmV0dXJuIGdldENvbnRleHRGb3JWYXJpYWJsZShwYXJlbnRDb250ZXh0LCB2YXJpYWJsZSwgYWRkaXRpb25hbENvbnRleHQpO1xufVxuXG5mdW5jdGlvbiBpc1N0YWNrRnJhbWUob2JqOiBhbnkpOiBvYmogaXMgSVN0YWNrRnJhbWUge1xuXHRyZXR1cm4gb2JqIGluc3RhbmNlb2YgU3RhY2tGcmFtZTtcbn1cblxuY2xhc3MgVmFyaWFibGVzRGF0YVNvdXJjZSBleHRlbmRzIEFic3RyYWN0RXhwcmVzc2lvbkRhdGFTb3VyY2U8SVN0YWNrRnJhbWUgfCBudWxsLCBJRXhwcmVzc2lvbiB8IElTY29wZT4ge1xuXG5cdHB1YmxpYyBvdmVycmlkZSBoYXNDaGlsZHJlbihlbGVtZW50OiBJU3RhY2tGcmFtZSB8IG51bGwgfCBJRXhwcmVzc2lvbiB8IElTY29wZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXNTdGFja0ZyYW1lKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudC5oYXNDaGlsZHJlbjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBkb0dldENoaWxkcmVuKGVsZW1lbnQ6IElTdGFja0ZyYW1lIHwgSUV4cHJlc3Npb24gfCBJU2NvcGUpOiBQcm9taXNlPChJRXhwcmVzc2lvbiB8IElTY29wZSlbXT4ge1xuXHRcdGlmIChpc1N0YWNrRnJhbWUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmdldFNjb3BlcygpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50LmdldENoaWxkcmVuKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTY29wZVRlbXBsYXRlRGF0YSB7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRsYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcbn1cblxuY2xhc3MgVmFyaWFibGVzRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJRXhwcmVzc2lvbiB8IElTY29wZT4ge1xuXG5cdGdldEhlaWdodChlbGVtZW50OiBJRXhwcmVzc2lvbiB8IElTY29wZSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJRXhwcmVzc2lvbiB8IElTY29wZSk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBFcnJvclNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gU2NvcGVFcnJvclJlbmRlcmVyLklEO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2NvcGUpIHtcblx0XHRcdHJldHVybiBTY29wZXNSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFZpc3VhbGl6ZWRFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFZhcmlhYmxlc1JlbmRlcmVyLklEO1xuXHR9XG59XG5cbmNsYXNzIFNjb3Blc1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJU2NvcGUsIEZ1enp5U2NvcmUsIElTY29wZVRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzY29wZSc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU2NvcGVzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNjb3BlVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBuYW1lID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5zY29wZScpKTtcblx0XHRjb25zdCBsYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKG5hbWUpO1xuXG5cdFx0cmV0dXJuIHsgbmFtZSwgbGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElTY29wZSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNjb3BlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldChlbGVtZW50LmVsZW1lbnQubmFtZSwgY3JlYXRlTWF0Y2hlcyhlbGVtZW50LmZpbHRlckRhdGEpKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTY29wZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTY29wZUVycm9yVGVtcGxhdGVEYXRhIHtcblx0ZXJyb3I6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBTY29wZUVycm9yUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElTY29wZSwgRnV6enlTY29yZSwgSVNjb3BlRXJyb3JUZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2NvcGVFcnJvcic7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU2NvcGVFcnJvclJlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTY29wZUVycm9yVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB3cmFwcGVyID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5zY29wZScpKTtcblx0XHRjb25zdCBlcnJvciA9IGRvbS5hcHBlbmQod3JhcHBlciwgJCgnLmVycm9yJykpO1xuXHRcdHJldHVybiB7IGVycm9yIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJU2NvcGUsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTY29wZUVycm9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVycm9yLmlubmVyVGV4dCA9IGVsZW1lbnQuZWxlbWVudC5uYW1lO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKCk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdEV4cHJlc3Npb25zUmVuZGVyZXIge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3Zpeic7XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIGhlbHBlciB0aGF0IHJlcmVuZGVycyB0aGUgdHJlZSB3aGVuIHZpc3VhbGl6YXRpb24gaXMgcmVxdWVzdGVkXG5cdCAqIG9yIGNhbmNlbGxlZC4vXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHJlbmRlcmVyT25WaXN1YWxpemF0aW9uUmFuZ2UobW9kZWw6IElWaWV3TW9kZWwsIHRyZWU6IEFzeW5jRGF0YVRyZWU8YW55LCBhbnksIGFueT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIG1vZGVsLm9uRGlkQ2hhbmdlVmlzdWFsaXphdGlvbigoeyBvcmlnaW5hbCB9KSA9PiB7XG5cdFx0XHRpZiAoIXRyZWUuaGFzTm9kZShvcmlnaW5hbCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJlbnQ6IElFeHByZXNzaW9uID0gdHJlZS5nZXRQYXJlbnRFbGVtZW50KG9yaWdpbmFsKTtcblx0XHRcdHRyZWUudXBkYXRlQ2hpbGRyZW4ocGFyZW50LCBmYWxzZSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXIsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGRlYnVnU2VydmljZSwgY29udGV4dFZpZXdTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLklEO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeHByZXNzaW9uLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0c3VwZXIucmVuZGVyRXhwcmVzc2lvbkVsZW1lbnQobm9kZS5lbGVtZW50LCBub2RlLCBkYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJFeHByZXNzaW9uKGV4cHJlc3Npb246IElFeHByZXNzaW9uLCBkYXRhOiBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSwgaGlnaGxpZ2h0czogSUhpZ2hsaWdodFtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgdml6ID0gZXhwcmVzc2lvbiBhcyBWaXN1YWxpemVkRXhwcmVzc2lvbjtcblxuXHRcdGxldCB0ZXh0ID0gdml6Lm5hbWU7XG5cdFx0aWYgKHZpei52YWx1ZSAmJiB0eXBlb2Ygdml6Lm5hbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0ZXh0ICs9ICc6Jztcblx0XHR9XG5cdFx0ZGF0YS5sYWJlbC5zZXQodGV4dCwgaGlnaGxpZ2h0cywgdml6Lm5hbWUpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhbHVlKGRhdGEudmFsdWUsIHZpeiwge1xuXHRcdFx0c2hvd0NoYW5nZWQ6IGZhbHNlLFxuXHRcdFx0bWF4VmFsdWVMZW5ndGg6IDEwMjQsXG5cdFx0XHRjb2xvcml6ZTogdHJ1ZSxcblx0XHRcdHNlc3Npb246IGV4cHJlc3Npb24uZ2V0U2Vzc2lvbigpLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRJbnB1dEJveE9wdGlvbnMoZXhwcmVzc2lvbjogSUV4cHJlc3Npb24pOiBJSW5wdXRCb3hPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aXogPSA8VmlzdWFsaXplZEV4cHJlc3Npb24+ZXhwcmVzc2lvbjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5pdGlhbFZhbHVlOiBleHByZXNzaW9uLnZhbHVlLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgndmFyaWFibGVWYWx1ZUFyaWFMYWJlbCcsIFwiVHlwZSBuZXcgdmFyaWFibGUgdmFsdWVcIiksXG5cdFx0XHR2YWxpZGF0aW9uT3B0aW9uczoge1xuXHRcdFx0XHR2YWxpZGF0aW9uOiAoKSA9PiB2aXouZXJyb3JNZXNzYWdlID8gKHsgY29udGVudDogdml6LmVycm9yTWVzc2FnZSB9KSA6IG51bGxcblx0XHRcdH0sXG5cdFx0XHRvbkZpbmlzaDogKHZhbHVlOiBzdHJpbmcsIHN1Y2Nlc3M6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dml6LmVycm9yTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0XHR2aXouZWRpdCh2YWx1ZSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBEbyBub3QgcmVmcmVzaCBzY29wZXMgZHVlIHRvIGEgbm9kZSBsaW1pdGF0aW9uICMxNTUyMFxuXHRcdFx0XHRcdFx0Zm9yZ2V0U2NvcGVzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS51cGRhdGVWaWV3cygpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJBY3Rpb25CYXIoYWN0aW9uQmFyOiBBY3Rpb25CYXIsIGV4cHJlc3Npb246IElFeHByZXNzaW9uLCBfZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEpIHtcblx0XHRjb25zdCB2aXogPSBleHByZXNzaW9uIGFzIFZpc3VhbGl6ZWRFeHByZXNzaW9uO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdml6Lm9yaWdpbmFsID8gZ2V0Q29udGV4dEZvclZhcmlhYmxlTWVudUJhc2UodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdml6Lm9yaWdpbmFsKSA6IHRoaXMuY29udGV4dEtleVNlcnZpY2U7XG5cdFx0Y29uc3QgY29udGV4dCA9IHZpei5vcmlnaW5hbCA/IGdldFZhcmlhYmxlc0NvbnRleHQodml6Lm9yaWdpbmFsKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRGVidWdWYXJpYWJsZXNDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGNvbnRleHQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblxuXHRcdGlmICh2aXoub3JpZ2luYWwpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdkZWJ1Z1ZpeicsIGxhYmVsOiBsb2NhbGl6ZSgncmVtb3ZlVmlzdWFsaXplcicsICdSZW1vdmUgVmlzdWFsaXplcicpLCBjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllKSwgcnVuOiAoKSA9PiB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5zZXRWaXN1YWxpemVkRXhwcmVzc2lvbih2aXoub3JpZ2luYWwhLCB1bmRlZmluZWQpXG5cdFx0XHR9KTtcblx0XHRcdGFjdGlvbi5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdHByaW1hcnkucHVzaChhY3Rpb24pO1xuXHRcdFx0YWN0aW9uQmFyLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdpbml0aWFsJztcblx0XHR9XG5cdFx0YWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0YWN0aW9uQmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdGFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWYXJpYWJsZXNSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0RXhwcmVzc2lvbnNSZW5kZXJlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3ZhcmlhYmxlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXIsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlzdWFsaXphdGlvbjogSURlYnVnVmlzdWFsaXplclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGRlYnVnU2VydmljZSwgY29udGV4dFZpZXdTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVmFyaWFibGVzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyRXhwcmVzc2lvbihleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEsIGhpZ2hsaWdodHM6IElIaWdobGlnaHRbXSk6IHZvaWQge1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhcmlhYmxlKGRhdGEsIGV4cHJlc3Npb24gYXMgVmFyaWFibGUsIHtcblx0XHRcdGhpZ2hsaWdodHMsXG5cdFx0XHRzaG93Q2hhbmdlZDogdHJ1ZSxcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUV4cHJlc3Npb24sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRzdXBlci5yZW5kZXJFeHByZXNzaW9uRWxlbWVudChub2RlLmVsZW1lbnQsIG5vZGUsIGRhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldElucHV0Qm94T3B0aW9ucyhleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IElJbnB1dEJveE9wdGlvbnMge1xuXHRcdGNvbnN0IHZhcmlhYmxlID0gPFZhcmlhYmxlPmV4cHJlc3Npb247XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluaXRpYWxWYWx1ZTogZXhwcmVzc2lvbi52YWx1ZSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3ZhcmlhYmxlVmFsdWVBcmlhTGFiZWwnLCBcIlR5cGUgbmV3IHZhcmlhYmxlIHZhbHVlXCIpLFxuXHRcdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHtcblx0XHRcdFx0dmFsaWRhdGlvbjogKCkgPT4gdmFyaWFibGUuZXJyb3JNZXNzYWdlID8gKHsgY29udGVudDogdmFyaWFibGUuZXJyb3JNZXNzYWdlIH0pIDogbnVsbFxuXHRcdFx0fSxcblx0XHRcdG9uRmluaXNoOiAodmFsdWU6IHN0cmluZywgc3VjY2VzczogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHR2YXJpYWJsZS5lcnJvck1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRTdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0XHRcdGlmIChzdWNjZXNzICYmIHZhcmlhYmxlLnZhbHVlICE9PSB2YWx1ZSAmJiBmb2N1c2VkU3RhY2tGcmFtZSkge1xuXHRcdFx0XHRcdHZhcmlhYmxlLnNldFZhcmlhYmxlKHZhbHVlLCBmb2N1c2VkU3RhY2tGcmFtZSlcblx0XHRcdFx0XHRcdC8vIE5lZWQgdG8gZm9yY2Ugd2F0Y2ggZXhwcmVzc2lvbnMgYW5kIHZhcmlhYmxlcyB0byB1cGRhdGUgc2luY2UgYSB2YXJpYWJsZSBjaGFuZ2UgY2FuIGhhdmUgYW4gZWZmZWN0IG9uIGJvdGhcblx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gRG8gbm90IHJlZnJlc2ggc2NvcGVzIGR1ZSB0byBhIG5vZGUgbGltaXRhdGlvbiAjMTU1MjBcblx0XHRcdFx0XHRcdFx0Zm9yZ2V0U2NvcGVzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnVwZGF0ZVZpZXdzKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQWN0aW9uQmFyKGFjdGlvbkJhcjogQWN0aW9uQmFyLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEpIHtcblx0XHRjb25zdCB2YXJpYWJsZSA9IGV4cHJlc3Npb24gYXMgVmFyaWFibGU7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBnZXRDb250ZXh0Rm9yVmFyaWFibGVNZW51QmFzZSh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB2YXJpYWJsZSk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gZ2V0VmFyaWFibGVzQ29udGV4dCh2YXJpYWJsZSk7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnVmFyaWFibGVzQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBjb250ZXh0LCBzaG91bGRGb3J3YXJkQXJnczogZmFsc2UgfSk7XG5cdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXG5cdFx0YWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0YWN0aW9uQmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdGFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0dGhpcy52aXN1YWxpemF0aW9uLmdldEFwcGxpY2FibGVGb3IoZXhwcmVzc2lvbiwgY3RzLnRva2VuKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZChyZXN1bHQpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbEV4cHJlc3Npb24gPSAoZXhwcmVzc2lvbiBpbnN0YW5jZW9mIFZpc3VhbGl6ZWRFeHByZXNzaW9uICYmIGV4cHJlc3Npb24ub3JpZ2luYWwpIHx8IGV4cHJlc3Npb247XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gcmVzdWx0Lm9iamVjdC5tYXAodiA9PiB0b0FjdGlvbih7IGlkOiAnZGVidWdWaXonLCBsYWJlbDogdi5uYW1lLCBjbGFzczogdi5pY29uQ2xhc3MgfHwgJ2RlYnVnLXZpei1pY29uJywgcnVuOiB0aGlzLnVzZVZpc3VhbGl6ZXIodiwgb3JpZ2luYWxFeHByZXNzaW9uLCBjdHMudG9rZW4pIH0pKTtcblx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBuby1vcFxuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRhY3Rpb25CYXIucHVzaChhY3Rpb25zWzBdLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFjdGlvbkJhci5wdXNoKHRvQWN0aW9uKHsgaWQ6ICdkZWJ1Z1ZpeicsIGxhYmVsOiBsb2NhbGl6ZSgndXNlVmlzdWFsaXplcicsICdWaXN1YWxpemUgVmFyaWFibGUuLi4nKSwgY2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZSksIHJ1bjogKCkgPT4gdGhpcy5waWNrVmlzdWFsaXplcihhY3Rpb25zLCBvcmlnaW5hbEV4cHJlc3Npb24sIGRhdGEpIH0pLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcGlja1Zpc3VhbGl6ZXIoYWN0aW9uczogSUFjdGlvbltdLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEpIHtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBkYXRhLmFjdGlvbkJhciEuZ2V0Q29udGFpbmVyKCksXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1c2VWaXN1YWxpemVyKHZpejogRGVidWdWaXN1YWxpemVyLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0cmV0dXJuIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdml6LnJlc29sdmUodG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc29sdmVkLnR5cGUgPT09IERlYnVnVmlzdWFsaXphdGlvblR5cGUuQ29tbWFuZCkge1xuXHRcdFx0XHR2aXouZXhlY3V0ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBhd2FpdCB0aGlzLnZpc3VhbGl6YXRpb24uZ2V0VmlzdWFsaXplZE5vZGVGb3IocmVzb2x2ZWQuaWQsIGV4cHJlc3Npb24pO1xuXHRcdFx0XHRpZiAocmVwbGFjZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5zZXRWaXN1YWxpemVkRXhwcmVzc2lvbihleHByZXNzaW9uLCByZXBsYWNlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFZhcmlhYmxlc0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElFeHByZXNzaW9uIHwgSVNjb3BlPiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCd2YXJpYWJsZXNBcmlhVHJlZUxhYmVsJywgXCJEZWJ1ZyBWYXJpYWJsZXNcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSUV4cHJlc3Npb24gfCBJU2NvcGUpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3ZhcmlhYmxlU2NvcGVBcmlhTGFiZWwnLCBcIlNjb3BlIHswfVwiLCBlbGVtZW50Lm5hbWUpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoeyBrZXk6ICd2YXJpYWJsZUFyaWFMYWJlbCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXJzIGFyZSB2YXJpYWJsZSBuYW1lIGFuZCB2YXJpYWJsZSB2YWx1ZSByZXNwZWN0aXZseS4gVGhleSBzaG91bGQgbm90IGJlIHRyYW5zbGF0ZWQuJ10gfSwgXCJ7MH0sIHZhbHVlIHsxfVwiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQudmFsdWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBTRVRfVkFSSUFCTEVfSUQgPSAnZGVidWcuc2V0VmFyaWFibGUnO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0VUX1ZBUklBQkxFX0lELFxuXHRoYW5kbGVyOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0ZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnNldFNlbGVjdGVkRXhwcmVzc2lvbih2YXJpYWJsZUludGVybmFsQ29udGV4dCwgZmFsc2UpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiBDT1BZX1ZBTFVFX0xBQkVMLFxuXHR9LFxuXHRpZDogQ09QWV9WQUxVRV9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IFZhcmlhYmxlIHwgRXhwcmVzc2lvbiB8IElWYXJpYWJsZXNDb250ZXh0IHwgdW5kZWZpbmVkLCBjdHg/OiAoVmFyaWFibGUgfCBFeHByZXNzaW9uKVtdKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGxldCBlbGVtZW50Q29udGV4dCA9ICcnO1xuXHRcdGxldCBlbGVtZW50czogKFZhcmlhYmxlIHwgRXhwcmVzc2lvbilbXTtcblx0XHRpZiAoIWFyZykge1xuXHRcdFx0Y29uc3Qgdmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRjb25zdCBmb2N1c2VkVmlldyA9IHZpZXdTZXJ2aWNlLmdldEZvY3VzZWRWaWV3KCk7XG5cdFx0XHRsZXQgdmlldzogSURlYnVnVmlld1dpdGhWYXJpYWJsZXMgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGZvY3VzZWRWaWV3Py5pZCA9PT0gV0FUQ0hfVklFV19JRCkge1xuXHRcdFx0XHR2aWV3ID0gdmlld1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZDxJRGVidWdWaWV3V2l0aFZhcmlhYmxlcz4oV0FUQ0hfVklFV19JRCk7XG5cdFx0XHRcdGVsZW1lbnRDb250ZXh0ID0gJ3dhdGNoJztcblx0XHRcdH0gZWxzZSBpZiAoZm9jdXNlZFZpZXc/LmlkID09PSBWQVJJQUJMRVNfVklFV19JRCkge1xuXHRcdFx0XHR2aWV3ID0gdmlld1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZDxJRGVidWdWaWV3V2l0aFZhcmlhYmxlcz4oVkFSSUFCTEVTX1ZJRVdfSUQpO1xuXHRcdFx0XHRlbGVtZW50Q29udGV4dCA9ICd2YXJpYWJsZXMnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGVsZW1lbnRzID0gdmlldy50cmVlU2VsZWN0aW9uLmZpbHRlcihlID0+IGUgaW5zdGFuY2VvZiBFeHByZXNzaW9uIHx8IGUgaW5zdGFuY2VvZiBWYXJpYWJsZSk7XG5cdFx0fSBlbHNlIGlmIChhcmcgaW5zdGFuY2VvZiBWYXJpYWJsZSB8fCBhcmcgaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRlbGVtZW50Q29udGV4dCA9ICd3YXRjaCc7XG5cdFx0XHRlbGVtZW50cyA9IFthcmddO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbGVtZW50Q29udGV4dCA9ICd2YXJpYWJsZXMnO1xuXHRcdFx0ZWxlbWVudHMgPSB2YXJpYWJsZUludGVybmFsQ29udGV4dCA/IFt2YXJpYWJsZUludGVybmFsQ29udGV4dF0gOiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFja0ZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0aWYgKCFzdGFja0ZyYW1lIHx8ICFzZXNzaW9uIHx8IGVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV2YWxDb250ZXh0ID0gc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDbGlwYm9hcmRDb250ZXh0ID8gJ2NsaXBib2FyZCcgOiBlbGVtZW50Q29udGV4dDtcblx0XHRjb25zdCB0b0V2YWx1YXRlID0gZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gZWxlbWVudCBpbnN0YW5jZW9mIFZhcmlhYmxlID8gKGVsZW1lbnQuZXZhbHVhdGVOYW1lIHx8IGVsZW1lbnQudmFsdWUpIDogZWxlbWVudC5uYW1lKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBldmFsdWF0aW9ucyA9IGF3YWl0IFByb21pc2UuYWxsKHRvRXZhbHVhdGUubWFwKGV4cHIgPT4gc2Vzc2lvbi5ldmFsdWF0ZShleHByLCBzdGFja0ZyYW1lLmZyYW1lSWQsIGV2YWxDb250ZXh0KSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29hbGVzY2UoZXZhbHVhdGlvbnMpLm1hcChldmFsdWF0aW9uID0+IGV2YWx1YXRpb24uYm9keS5yZXN1bHQpO1xuXHRcdFx0aWYgKHJlc3VsdC5sZW5ndGgpIHtcblx0XHRcdFx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQocmVzdWx0LmpvaW4oJ1xcbicpKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBlbGVtZW50cy5tYXAoZWxlbWVudCA9PiBlbGVtZW50LnZhbHVlKTtcblx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHJlc3VsdC5qb2luKCdcXG4nKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IFZJRVdfTUVNT1JZX0lEID0gJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi52aWV3TWVtb3J5JztcblxuY29uc3QgSEVYX0VESVRPUl9FWFRFTlNJT05fSUQgPSAnbXMtdnNjb2RlLmhleGVkaXRvcic7XG5jb25zdCBIRVhfRURJVE9SX0VESVRPUl9JRCA9ICdoZXhFZGl0b3IuaGV4ZWRpdCc7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFZJRVdfTUVNT1JZX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZzogSVZhcmlhYmxlc0NvbnRleHQgfCBJRXhwcmVzc2lvbiwgY3R4PzogKFZhcmlhYmxlIHwgRXhwcmVzc2lvbilbXSkgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRsZXQgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdFx0bGV0IG1lbW9yeVJlZmVyZW5jZTogc3RyaW5nO1xuXHRcdGlmICgnc2Vzc2lvbklkJyBpbiBhcmcpIHsgLy8gSVZhcmlhYmxlc0NvbnRleHRcblx0XHRcdGlmICghYXJnLnNlc3Npb25JZCB8fCAhYXJnLnZhcmlhYmxlLm1lbW9yeVJlZmVyZW5jZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9uSWQgPSBhcmcuc2Vzc2lvbklkO1xuXHRcdFx0bWVtb3J5UmVmZXJlbmNlID0gYXJnLnZhcmlhYmxlLm1lbW9yeVJlZmVyZW5jZTtcblx0XHR9IGVsc2UgeyAvLyBJRXhwcmVzc2lvblxuXHRcdFx0aWYgKCFhcmcubWVtb3J5UmVmZXJlbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvY3VzZWQgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0XHRpZiAoIWZvY3VzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXNzaW9uSWQgPSBmb2N1c2VkLmdldElkKCk7XG5cdFx0XHRtZW1vcnlSZWZlcmVuY2UgPSBhcmcubWVtb3J5UmVmZXJlbmNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBleHQgPSBhd2FpdCBleHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihIRVhfRURJVE9SX0VYVEVOU0lPTl9JRCk7XG5cdFx0aWYgKGV4dCB8fCBhd2FpdCB0cnlJbnN0YWxsSGV4RWRpdG9yKGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0LyogX19HRFBSX19cblx0XHRcdFx0XCJkZWJ1Zy9kaWRWaWV3TWVtb3J5XCIgOiB7XG5cdFx0XHRcdFx0XCJvd25lclwiOiBcImNvbm5vcjQzMTJcIixcblx0XHRcdFx0XHRcImRlYnVnVHlwZVwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9XG5cdFx0XHRcdH1cblx0XHRcdCovXG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnZGVidWcvZGlkVmlld01lbW9yeScsIHtcblx0XHRcdFx0ZGVidWdUeXBlOiBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25JZCk/LmNvbmZpZ3VyYXRpb24udHlwZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogZ2V0VXJpRm9yRGVidWdNZW1vcnkoc2Vzc2lvbklkLCBtZW1vcnlSZWZlcmVuY2UpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0cmV2ZWFsSWZPcGVuZWQ6IHRydWUsXG5cdFx0XHRcdFx0b3ZlcnJpZGU6IEhFWF9FRElUT1JfRURJVE9SX0lELFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgU0lERV9HUk9VUCk7XG5cdFx0fVxuXHR9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gdHJ5SW5zdGFsbEhleEVkaXRvcihleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0cnkge1xuXHRcdGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoSEVYX0VESVRPUl9FWFRFTlNJT05fSUQsIHtcblx0XHRcdGp1c3RpZmljYXRpb246IGxvY2FsaXplKFwidmlld01lbW9yeS5wcm9tcHRcIiwgXCJJbnNwZWN0aW5nIGJpbmFyeSBkYXRhIHJlcXVpcmVzIHRoaXMgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdGVuYWJsZTogdHJ1ZVxuXHRcdH0sIFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiBDT1BZX0VWQUxVQVRFX1BBVEhfTEFCRUwsXG5cdH0sXG5cdGlkOiBDT1BZX0VWQUxVQVRFX1BBVEhfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSVZhcmlhYmxlc0NvbnRleHQgfCBWYXJpYWJsZSkgPT4ge1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGlmIChjb250ZXh0IGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGNvbnRleHQuZXZhbHVhdGVOYW1lISk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGNvbnRleHQudmFyaWFibGUuZXZhbHVhdGVOYW1lISk7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiBBRERfVE9fV0FUQ0hfTEFCRUwsXG5cdH0sXG5cdGlkOiBBRERfVE9fV0FUQ0hfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSVZhcmlhYmxlc0NvbnRleHQpID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0ZGVidWdTZXJ2aWNlLmFkZFdhdGNoRXhwcmVzc2lvbihjb250ZXh0LnZhcmlhYmxlLmV2YWx1YXRlTmFtZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPFZhcmlhYmxlc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd2YXJpYWJsZXMuY29sbGFwc2UnLFxuXHRcdFx0dmlld0lkOiBWQVJJQUJMRVNfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWQVJJQUJMRVNfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFZhcmlhYmxlc1ZpZXcpIHtcblx0XHR2aWV3LmNvbGxhcHNlQWxsKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyx3QkFBb0M7QUFLN0MsU0FBa0IsZ0JBQWdCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FB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
