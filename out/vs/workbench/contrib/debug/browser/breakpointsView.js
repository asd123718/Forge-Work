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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox, TriStateCheckbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Orientation } from "../../../../base/browser/ui/splitview/splitview.js";
import { Action } from "../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import * as resources from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { Constants } from "../../../../base/common/uint.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize, localize2 } from "../../../../nls.js";
import { getActionBarActions, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { BREAKPOINTS_VIEW_ID, BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_BREAKPOINT_HAS_MODES, CONTEXT_BREAKPOINT_INPUT_FOCUSED, CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES, CONTEXT_BREAKPOINT_ITEM_TYPE, CONTEXT_BREAKPOINT_SUPPORTS_CONDITION, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_IN_DEBUG_MODE, CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, DEBUG_SCHEME, DataBreakpointSetType, DebuggerString, IDebugService, State } from "../common/debug.js";
import { Breakpoint, DataBreakpoint, ExceptionBreakpoint, FunctionBreakpoint, InstructionBreakpoint } from "../common/debugModel.js";
import { DisassemblyViewInput } from "../common/disassemblyViewInput.js";
import * as icons from "./debugIcons.js";
import { equals } from "../../../../base/common/arrays.js";
import { hasKey } from "../../../../base/common/types.js";
const $ = dom.$;
function createCheckbox(disposables) {
  const checkbox = new Checkbox("", false, defaultCheckboxStyles);
  checkbox.domNode.tabIndex = -1;
  disposables.add(checkbox);
  return checkbox;
}
const MAX_VISIBLE_BREAKPOINTS = 9;
function getExpandedBodySize(model, sessionId, countLimit) {
  const length = model.getBreakpoints().length + model.getExceptionBreakpointsForSession(sessionId).length + model.getFunctionBreakpoints().length + model.getDataBreakpoints().length + model.getInstructionBreakpoints().length;
  return Math.min(countLimit, length) * 22;
}
class BreakpointsFolderItem {
  constructor(uri, breakpoints) {
    this.uri = uri;
    this.breakpoints = breakpoints;
  }
  getId() {
    return this.uri.toString();
  }
  get enabled() {
    return this.breakpoints.every((bp) => bp.enabled);
  }
  get indeterminate() {
    const enabledCount = this.breakpoints.filter((bp) => bp.enabled).length;
    return enabledCount > 0 && enabledCount < this.breakpoints.length;
  }
}
function getModeKindForBreakpoint(breakpoint) {
  const kind = breakpoint instanceof Breakpoint ? "source" : breakpoint instanceof InstructionBreakpoint ? "instruction" : "exception";
  return kind;
}
let BreakpointsView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, instantiationService, themeService, editorService, contextViewService, configurationService, viewDescriptorService, contextKeyService, openerService, labelService, menuService, hoverService, languageService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.editorService = editorService;
    this.contextViewService = contextViewService;
    this.labelService = labelService;
    this.languageService = languageService;
    this.needsRefresh = false;
    this.needsStateChange = false;
    this.ignoreLayout = false;
    this.collapsedState = /* @__PURE__ */ new Set();
    this.menu = menuService.createMenu(MenuId.DebugBreakpointsContext, contextKeyService);
    this._register(this.menu);
    this.breakpointItemType = CONTEXT_BREAKPOINT_ITEM_TYPE.bindTo(contextKeyService);
    this.breakpointIsDataBytes = CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES.bindTo(contextKeyService);
    this.breakpointHasMultipleModes = CONTEXT_BREAKPOINT_HAS_MODES.bindTo(contextKeyService);
    this.breakpointSupportsCondition = CONTEXT_BREAKPOINT_SUPPORTS_CONDITION.bindTo(contextKeyService);
    this.breakpointInputFocused = CONTEXT_BREAKPOINT_INPUT_FOCUSED.bindTo(contextKeyService);
    this._register(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
    this._register(this.debugService.getViewModel().onDidFocusSession(() => this.onBreakpointsChange()));
    this._register(this.debugService.onDidChangeState(() => this.onStateChange()));
    this.hintDelayer = this._register(new RunOnceScheduler(() => this.updateBreakpointsHint(true), 4e3));
  }
  getPresentation() {
    return this.configurationService.getValue("debug.breakpointsView.presentation");
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-breakpoints");
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "BreakpointsView",
      container,
      new BreakpointsDelegate(this),
      [
        this.instantiationService.createInstance(BreakpointsFolderRenderer),
        this.instantiationService.createInstance(BreakpointsRenderer, this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType),
        new ExceptionBreakpointsRenderer(this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType, this.debugService, this.hoverService),
        new ExceptionBreakpointInputRenderer(this, this.debugService, this.contextViewService),
        this.instantiationService.createInstance(FunctionBreakpointsRenderer, this.menu, this.breakpointSupportsCondition, this.breakpointItemType),
        new FunctionBreakpointInputRenderer(this, this.debugService, this.contextViewService, this.hoverService, this.labelService),
        this.instantiationService.createInstance(DataBreakpointsRenderer, this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType, this.breakpointIsDataBytes),
        new DataBreakpointInputRenderer(this, this.debugService, this.contextViewService, this.hoverService, this.labelService),
        this.instantiationService.createInstance(InstructionBreakpointsRenderer)
      ],
      {
        compressionEnabled: this.getPresentation() === "tree",
        hideTwistiesOfChildlessElements: true,
        identityProvider: {
          getId: (element) => element.getId()
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            if (element instanceof BreakpointsFolderItem) {
              return resources.basenameOrAuthority(element.uri);
            }
            if (element instanceof Breakpoint) {
              return `${resources.basenameOrAuthority(element.uri)}:${element.lineNumber}`;
            }
            if (element instanceof FunctionBreakpoint) {
              return element.name;
            }
            if (element instanceof DataBreakpoint) {
              return element.description;
            }
            if (element instanceof ExceptionBreakpoint) {
              return element.label || element.filter;
            }
            if (element instanceof InstructionBreakpoint) {
              return `0x${element.address.toString(16)}`;
            }
            return "";
          },
          getCompressedNodeKeyboardNavigationLabel: (elements) => {
            return elements.map((e) => {
              if (e instanceof BreakpointsFolderItem) {
                return resources.basenameOrAuthority(e.uri);
              }
              return "";
            }).join("/");
          }
        },
        accessibilityProvider: new BreakpointsAccessibilityProvider(this.debugService, this.labelService),
        multipleSelectionSupport: false,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(this.tree);
    CONTEXT_BREAKPOINTS_FOCUSED.bindTo(this.tree.contextKeyService);
    this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
    this._register(this.tree.onMouseMiddleClick(async ({ element }) => {
      if (element instanceof Breakpoint) {
        await this.debugService.removeBreakpoints(element.getId());
      } else if (element instanceof FunctionBreakpoint) {
        await this.debugService.removeFunctionBreakpoints(element.getId());
      } else if (element instanceof DataBreakpoint) {
        await this.debugService.removeDataBreakpoints(element.getId());
      } else if (element instanceof InstructionBreakpoint) {
        await this.debugService.removeInstructionBreakpoints(element.instructionReference, element.offset);
      } else if (element instanceof BreakpointsFolderItem) {
        await this.debugService.removeBreakpoints(element.breakpoints.map((bp) => bp.getId()));
      }
    }));
    this._register(this.tree.onDidOpen(async (e) => {
      const element = e.element;
      if (!element) {
        return;
      }
      if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.button === 1) {
        return;
      }
      if (element instanceof Breakpoint) {
        openBreakpointSource(element, e.sideBySide, e.editorOptions.preserveFocus || false, e.editorOptions.pinned || !e.editorOptions.preserveFocus, this.debugService, this.editorService);
      }
      if (element instanceof InstructionBreakpoint) {
        const disassemblyView = await this.editorService.openEditor(DisassemblyViewInput.instance);
        disassemblyView.goToInstructionAndOffset(element.instructionReference, element.offset, dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail === 2);
      }
      if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail === 2 && element instanceof FunctionBreakpoint && element !== this.inputBoxData?.breakpoint) {
        this.renderInputBox({ breakpoint: element, type: "name" });
      }
    }));
    this._register(this.tree.onKeyDown((e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Space) && !dom.isEditableElement(e.target)) {
        const focused = this.tree.getFocus();
        if (focused.length > 0) {
          const element = focused[0];
          if (element && !(element instanceof BreakpointsFolderItem)) {
            this.debugService.enableOrDisableBreakpoints(!element.enabled, element);
            event.preventDefault();
            event.stopPropagation();
          }
        }
      }
    }));
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const element = e.node.element;
      if (element instanceof BreakpointsFolderItem) {
        if (e.node.collapsed) {
          this.collapsedState.add(element.getId());
        } else {
          this.collapsedState.delete(element.getId());
        }
        this.updateSize();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.breakpointsView.presentation")) {
        const presentation = this.getPresentation();
        this.tree.updateOptions({ compressionEnabled: presentation === "tree" });
        this.onBreakpointsChange();
      }
    }));
    this.setTreeInput();
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible) {
        if (this.needsRefresh) {
          this.onBreakpointsChange();
        }
        if (this.needsStateChange) {
          this.onStateChange();
        }
      }
    }));
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    this._register(containerModel.onDidChangeAllViewDescriptors(() => {
      this.updateSize();
    }));
  }
  renderHeaderTitle(container, title) {
    super.renderHeaderTitle(container, title);
    const iconLabelContainer = dom.append(container, $("span.breakpoint-warning"));
    this.hintContainer = this._register(new IconLabel(iconLabelContainer, {
      supportIcons: true,
      hoverDelegate: {
        showHover: (options, focus) => this.hoverService.showInstantHover({ content: options.content, target: this.hintContainer.element }, focus),
        delay: this.configurationService.getValue("workbench.hover.delay")
      }
    }));
    dom.hide(this.hintContainer.element);
  }
  focus() {
    super.focus();
    this.tree?.domFocus();
  }
  renderInputBox(data) {
    this._inputBoxData = data;
    this.onBreakpointsChange();
    this._inputBoxData = void 0;
  }
  get inputBoxData() {
    return this._inputBoxData;
  }
  layoutBody(height, width) {
    if (this.ignoreLayout) {
      return;
    }
    super.layoutBody(height, width);
    this.tree?.layout(height, width);
    try {
      this.ignoreLayout = true;
      this.updateSize();
    } finally {
      this.ignoreLayout = false;
    }
  }
  onTreeContextMenu(e) {
    const element = e.element;
    if (element instanceof BreakpointsFolderItem) {
      this.breakpointItemType.set("breakpointFolder");
      const { secondary: secondary2 } = getContextMenuActions(this.menu.getActions({ arg: element, shouldForwardArgs: false }), "inline");
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => secondary2,
        getActionsContext: () => element
      });
      return;
    }
    const type = element instanceof Breakpoint ? "breakpoint" : element instanceof ExceptionBreakpoint ? "exceptionBreakpoint" : element instanceof FunctionBreakpoint ? "functionBreakpoint" : element instanceof DataBreakpoint ? "dataBreakpoint" : element instanceof InstructionBreakpoint ? "instructionBreakpoint" : void 0;
    this.breakpointItemType.set(type);
    const session = this.debugService.getViewModel().focusedSession;
    const conditionSupported = element instanceof ExceptionBreakpoint ? element.supportsCondition : !session || !!session.capabilities.supportsConditionalBreakpoints;
    this.breakpointSupportsCondition.set(conditionSupported);
    this.breakpointIsDataBytes.set(element instanceof DataBreakpoint && element.src.type === DataBreakpointSetType.Address);
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes(getModeKindForBreakpoint(element)).length > 1);
    const { secondary } = getContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }), "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => secondary,
      getActionsContext: () => element
    });
  }
  updateSize() {
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    const rowHeight = 22;
    this.minimumBodySize = this.orientation === Orientation.VERTICAL ? Math.min(MAX_VISIBLE_BREAKPOINTS * rowHeight, this.tree.contentHeight) : 170;
    this.maximumBodySize = this.orientation === Orientation.VERTICAL && containerModel.visibleViewDescriptors.length > 1 ? this.tree.contentHeight : Number.POSITIVE_INFINITY;
  }
  updateBreakpointsHint(delayed = false) {
    if (!this.hintContainer) {
      return;
    }
    const currentType = this.debugService.getViewModel().focusedSession?.configuration.type;
    const dbg = currentType ? this.debugService.getAdapterManager().getDebugger(currentType) : void 0;
    const message = dbg?.strings?.[DebuggerString.UnverifiedBreakpoints];
    const debuggerHasUnverifiedBps = message && this.debugService.getModel().getBreakpoints().filter((bp) => {
      if (bp.verified || !bp.enabled) {
        return false;
      }
      const langId = this.languageService.guessLanguageIdByFilepathOrFirstLine(bp.uri);
      return langId && dbg.interestedInLanguage(langId);
    });
    if (message && debuggerHasUnverifiedBps?.length && this.debugService.getModel().areBreakpointsActivated()) {
      if (delayed) {
        const mdown = new MarkdownString(void 0, { isTrusted: true }).appendMarkdown(message);
        this.hintContainer.setLabel("$(warning)", void 0, { title: { markdown: mdown, markdownNotSupportedFallback: message } });
        dom.show(this.hintContainer.element);
      } else {
        this.hintDelayer.schedule();
      }
    } else {
      dom.hide(this.hintContainer.element);
    }
  }
  onBreakpointsChange() {
    if (this.isBodyVisible()) {
      if (this.tree) {
        this.setTreeInput();
        this.needsRefresh = false;
      }
      this.updateBreakpointsHint();
      this.updateSize();
    } else {
      this.needsRefresh = true;
    }
  }
  onStateChange() {
    if (this.isBodyVisible()) {
      this.needsStateChange = false;
      const thread = this.debugService.getViewModel().focusedThread;
      let found = false;
      if (thread && thread.stoppedDetails && thread.stoppedDetails.hitBreakpointIds && thread.stoppedDetails.hitBreakpointIds.length > 0) {
        const hitBreakpointIds = thread.stoppedDetails.hitBreakpointIds;
        const elements = this.flatElements;
        const hitElement = elements.find((e) => {
          const id = e.getIdFromAdapter(thread.session.getId());
          return typeof id === "number" && hitBreakpointIds.indexOf(id) !== -1;
        });
        if (hitElement) {
          this.tree.setFocus([hitElement]);
          this.tree.setSelection([hitElement]);
          found = true;
          this.autoFocusedElement = hitElement;
        }
      }
      if (!found) {
        const focus = this.tree.getFocus();
        const selection = this.tree.getSelection();
        if (this.autoFocusedElement && equals(focus, selection) && selection.includes(this.autoFocusedElement)) {
          this.tree.setFocus([]);
          this.tree.setSelection([]);
        }
        this.autoFocusedElement = void 0;
      }
      this.updateBreakpointsHint();
    } else {
      this.needsStateChange = true;
    }
  }
  setTreeInput() {
    const treeInput = this.getTreeElements();
    this.tree.setChildren(null, treeInput);
  }
  getTreeElements() {
    const model = this.debugService.getModel();
    const sessionId = this.debugService.getViewModel().focusedSession?.getId();
    const showAsTree = this.getPresentation() === "tree";
    const result = [];
    for (const exBp of model.getExceptionBreakpointsForSession(sessionId)) {
      result.push({ element: exBp, incompressible: true });
    }
    for (const funcBp of model.getFunctionBreakpoints()) {
      result.push({ element: funcBp, incompressible: true });
    }
    for (const dataBp of model.getDataBreakpoints()) {
      result.push({ element: dataBp, incompressible: true });
    }
    const sourceBreakpoints = model.getBreakpoints();
    if (showAsTree && sourceBreakpoints.length > 0) {
      const breakpointsByUri = /* @__PURE__ */ new Map();
      for (const bp of sourceBreakpoints) {
        const key = bp.uri.toString();
        if (!breakpointsByUri.has(key)) {
          breakpointsByUri.set(key, []);
        }
        breakpointsByUri.get(key).push(bp);
      }
      for (const [uriStr, breakpoints] of breakpointsByUri) {
        const uri = URI.parse(uriStr);
        const folderItem = new BreakpointsFolderItem(uri, breakpoints);
        breakpoints.sort((a, b) => a.lineNumber - b.lineNumber);
        const children = breakpoints.map((bp) => ({
          element: bp,
          incompressible: false
        }));
        result.push({
          element: folderItem,
          incompressible: false,
          collapsed: this.collapsedState.has(folderItem.getId()),
          children
        });
      }
    } else {
      for (const bp of sourceBreakpoints) {
        result.push({ element: bp, incompressible: true });
      }
    }
    for (const instrBp of model.getInstructionBreakpoints()) {
      result.push({ element: instrBp, incompressible: true });
    }
    return result;
  }
  get flatElements() {
    const model = this.debugService.getModel();
    const sessionId = this.debugService.getViewModel().focusedSession?.getId();
    const elements = model.getExceptionBreakpointsForSession(sessionId).concat(model.getFunctionBreakpoints()).concat(model.getDataBreakpoints()).concat(model.getBreakpoints()).concat(model.getInstructionBreakpoints());
    return elements;
  }
};
BreakpointsView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IContextViewService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IOpenerService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, ILanguageService)
], BreakpointsView);
class BreakpointsDelegate {
  constructor(view) {
    this.view = view;
  }
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof BreakpointsFolderItem) {
      return BreakpointsFolderRenderer.ID;
    }
    if (element instanceof Breakpoint) {
      return BreakpointsRenderer.ID;
    }
    if (element instanceof FunctionBreakpoint) {
      const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
      if (!element.name || inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
        return FunctionBreakpointInputRenderer.ID;
      }
      return FunctionBreakpointsRenderer.ID;
    }
    if (element instanceof ExceptionBreakpoint) {
      const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
      if (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
        return ExceptionBreakpointInputRenderer.ID;
      }
      return ExceptionBreakpointsRenderer.ID;
    }
    if (element instanceof DataBreakpoint) {
      const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
      if (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
        return DataBreakpointInputRenderer.ID;
      }
      return DataBreakpointsRenderer.ID;
    }
    if (element instanceof InstructionBreakpoint) {
      return InstructionBreakpointsRenderer.ID;
    }
    return "";
  }
}
const breakpointIdToActionBarDomeNode = /* @__PURE__ */ new Map();
let BreakpointsFolderRenderer = class {
  constructor(debugService, labelService, hoverService) {
    this.debugService = debugService;
    this.labelService = labelService;
    this.hoverService = hoverService;
  }
  get templateId() {
    return BreakpointsFolderRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.container = container;
    container.classList.add("breakpoint", "breakpoint-folder");
    data.templateDisposables.add(toDisposable(() => {
      container.classList.remove("breakpoint", "breakpoint-folder");
    }));
    data.checkbox = new TriStateCheckbox("", false, defaultCheckboxStyles);
    data.checkbox.domNode.tabIndex = -1;
    data.templateDisposables.add(data.checkbox);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      const checked = data.checkbox.checked;
      const enabled = checked === "mixed" ? true : checked;
      for (const bp of data.context.breakpoints) {
        this.debugService.enableOrDisableBreakpoints(enabled, bp);
      }
    }));
    dom.append(data.container, data.checkbox.domNode);
    data.name = dom.append(data.container, $("span.name"));
    dom.append(data.container, $("span.file-path"));
    data.actionBar = new ActionBar(data.container);
    data.templateDisposables.add(data.actionBar);
    return data;
  }
  renderElement(node, _index, data) {
    const folderItem = node.element;
    data.context = folderItem;
    data.name.textContent = this.labelService.getUriBasenameLabel(folderItem.uri);
    data.container.classList.toggle("disabled", !this.debugService.getModel().areBreakpointsActivated());
    const fullPath = this.labelService.getUriLabel(folderItem.uri, { relative: true });
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.container, fullPath));
    if (folderItem.indeterminate) {
      data.checkbox.checked = "mixed";
    } else {
      data.checkbox.checked = folderItem.enabled;
    }
    data.actionBar.clear();
    const removeAction = data.elementDisposables.add(new Action(
      "debug.removeBreakpointsInFile",
      localize("removeBreakpointsInFile", "Remove Breakpoints in File"),
      ThemeIcon.asClassName(Codicon.close),
      true,
      async () => {
        for (const bp of folderItem.breakpoints) {
          await this.debugService.removeBreakpoints(bp.getId());
        }
      }
    ));
    data.actionBar.push(removeAction, { icon: true, label: false });
  }
  renderCompressedElements(node, _index, data) {
    const elements = node.element.elements;
    const folderItem = elements[elements.length - 1];
    data.context = folderItem;
    const names = elements.map((e) => resources.basenameOrAuthority(e.uri));
    data.name.textContent = names.join("/");
    const fullPath = this.labelService.getUriLabel(folderItem.uri, { relative: true });
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.container, fullPath));
    if (folderItem.indeterminate) {
      data.checkbox.checked = "mixed";
    } else {
      data.checkbox.checked = folderItem.enabled;
    }
    data.actionBar.clear();
    const removeAction = data.elementDisposables.add(new Action(
      "debug.removeBreakpointsInFile",
      localize("removeBreakpointsInFile", "Remove Breakpoints in File"),
      ThemeIcon.asClassName(Codicon.close),
      true,
      async () => {
        for (const bp of folderItem.breakpoints) {
          await this.debugService.removeBreakpoints(bp.getId());
        }
      }
    ));
    data.actionBar.push(removeAction, { icon: true, label: false });
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
BreakpointsFolderRenderer.ID = "breakpointFolder";
BreakpointsFolderRenderer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IHoverService)
], BreakpointsFolderRenderer);
let BreakpointsRenderer = class {
  constructor(menu, breakpointHasMultipleModes, breakpointSupportsCondition, breakpointItemType, debugService, hoverService, labelService, textModelService) {
    this.menu = menu;
    this.breakpointHasMultipleModes = breakpointHasMultipleModes;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.textModelService = textModelService;
  }
  get templateId() {
    return BreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = container;
    container.classList.add("breakpoint");
    data.templateDisposables.add(toDisposable(() => {
      container.classList.remove("breakpoint");
    }));
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.filePath = dom.append(data.breakpoint, $("span.file-path"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, index, data) {
    const breakpoint = node.element;
    data.context = breakpoint;
    if (node.depth > 1) {
      this.renderBreakpointLineLabel(breakpoint, data);
    } else {
      this.renderBreakpointFileLabel(breakpoint, data);
    }
    this.renderBreakpointCommon(breakpoint, data);
  }
  renderCompressedElements(node, index, data) {
    const breakpoint = node.element.elements[node.element.elements.length - 1];
    data.context = breakpoint;
    this.renderBreakpointFileLabel(breakpoint, data);
    this.renderBreakpointCommon(breakpoint, data);
  }
  renderBreakpointCommon(breakpoint, data) {
    data.breakpoint.classList.toggle("disabled", !this.debugService.getModel().areBreakpointsActivated());
    let badgeContent = breakpoint.lineNumber.toString();
    if (breakpoint.column) {
      badgeContent += `:${breakpoint.column}`;
    }
    if (breakpoint.modeLabel) {
      badgeContent = `${breakpoint.modeLabel}: ${badgeContent}`;
    }
    data.badge.textContent = badgeContent;
    data.checkbox.checked = breakpoint.enabled;
    const { message, icon } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), breakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, breakpoint.message || message || ""));
    const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
    if (debugActive && !breakpoint.verified) {
      data.breakpoint.classList.add("disabled");
    }
    const session = this.debugService.getViewModel().focusedSession;
    this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
    this.breakpointItemType.set("breakpoint");
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes("source").length > 1);
    const { primary } = getActionBarActions(this.menu.getActions({ arg: breakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(breakpoint.getId(), data.actionBar.domNode);
  }
  renderBreakpointFileLabel(breakpoint, data) {
    data.name.textContent = resources.basenameOrAuthority(breakpoint.uri);
    data.filePath.textContent = this.labelService.getUriLabel(resources.dirname(breakpoint.uri), { relative: true });
  }
  renderBreakpointLineLabel(breakpoint, data) {
    data.name.textContent = localize("loading", "Loading...");
    data.filePath.textContent = "";
    this.textModelService.createModelReference(breakpoint.uri).then((reference) => {
      if (data.context !== breakpoint) {
        reference.dispose();
        return;
      }
      data.elementDisposables.add(reference);
      const model = reference.object.textEditorModel;
      if (model && breakpoint.lineNumber <= model.getLineCount()) {
        const lineContent = model.getLineContent(breakpoint.lineNumber).trim();
        data.name.textContent = lineContent || localize("emptyLine", "(empty line)");
      } else {
        data.name.textContent = localize("lineNotFound", "(line not found)");
      }
    }).catch(() => {
      if (data.context === breakpoint) {
        data.name.textContent = localize("cannotLoadLine", "(cannot load line)");
      }
    });
  }
  disposeElement(node, index, template) {
    template.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
BreakpointsRenderer.ID = "breakpoints";
BreakpointsRenderer = __decorateClass([
  __decorateParam(4, IDebugService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, ITextModelService)
], BreakpointsRenderer);
const _ExceptionBreakpointsRenderer = class _ExceptionBreakpointsRenderer {
  constructor(menu, breakpointHasMultipleModes, breakpointSupportsCondition, breakpointItemType, debugService, hoverService) {
    this.menu = menu;
    this.breakpointHasMultipleModes = breakpointHasMultipleModes;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.debugService = debugService;
    this.hoverService = hoverService;
  }
  get templateId() {
    return _ExceptionBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.condition = dom.append(data.breakpoint, $("span.condition"));
    data.breakpoint.classList.add("exception");
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, index, data) {
    const exceptionBreakpoint = node.element;
    this.renderExceptionBreakpoint(exceptionBreakpoint, data);
  }
  renderCompressedElements(node, index, data) {
    const exceptionBreakpoint = node.element.elements[node.element.elements.length - 1];
    this.renderExceptionBreakpoint(exceptionBreakpoint, data);
  }
  renderExceptionBreakpoint(exceptionBreakpoint, data) {
    data.context = exceptionBreakpoint;
    data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;
    const exceptionBreakpointtitle = exceptionBreakpoint.verified ? exceptionBreakpoint.description || data.name.textContent : exceptionBreakpoint.message || localize("unverifiedExceptionBreakpoint", "Unverified Exception Breakpoint");
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, exceptionBreakpointtitle));
    data.breakpoint.classList.toggle("disabled", !exceptionBreakpoint.verified);
    data.checkbox.checked = exceptionBreakpoint.enabled;
    data.condition.textContent = exceptionBreakpoint.condition || "";
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.condition, localize("expressionCondition", "Expression condition: {0}", exceptionBreakpoint.condition)));
    if (exceptionBreakpoint.modeLabel) {
      data.badge.textContent = exceptionBreakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
    this.breakpointSupportsCondition.set(exceptionBreakpoint.supportsCondition);
    this.breakpointItemType.set("exceptionBreakpoint");
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes("exception").length > 1);
    const { primary } = getActionBarActions(this.menu.getActions({ arg: exceptionBreakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(exceptionBreakpoint.getId(), data.actionBar.domNode);
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_ExceptionBreakpointsRenderer.ID = "exceptionbreakpoints";
let ExceptionBreakpointsRenderer = _ExceptionBreakpointsRenderer;
let FunctionBreakpointsRenderer = class {
  constructor(menu, breakpointSupportsCondition, breakpointItemType, debugService, hoverService, labelService) {
    this.menu = menu;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return FunctionBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.condition = dom.append(data.breakpoint, $("span.condition"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, _index, data) {
    this.renderFunctionBreakpoint(node.element, data);
  }
  renderCompressedElements(node, _index, data) {
    this.renderFunctionBreakpoint(node.element.elements[node.element.elements.length - 1], data);
  }
  renderFunctionBreakpoint(functionBreakpoint, data) {
    data.context = functionBreakpoint;
    data.name.textContent = functionBreakpoint.name;
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), functionBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ? message : ""));
    data.checkbox.checked = functionBreakpoint.enabled;
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, message ? message : ""));
    if (functionBreakpoint.condition && functionBreakpoint.hitCondition) {
      data.condition.textContent = localize("expressionAndHitCount", "Condition: {0} | Hit Count: {1}", functionBreakpoint.condition, functionBreakpoint.hitCondition);
    } else {
      data.condition.textContent = functionBreakpoint.condition || functionBreakpoint.hitCondition || "";
    }
    if (functionBreakpoint.modeLabel) {
      data.badge.textContent = functionBreakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
    const session = this.debugService.getViewModel().focusedSession;
    data.breakpoint.classList.toggle("disabled", session && !session.capabilities.supportsFunctionBreakpoints || !this.debugService.getModel().areBreakpointsActivated());
    if (session && !session.capabilities.supportsFunctionBreakpoints) {
      data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, localize("functionBreakpointsNotSupported", "Function breakpoints are not supported by this debug type")));
    }
    this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
    this.breakpointItemType.set("functionBreakpoint");
    const { primary } = getActionBarActions(this.menu.getActions({ arg: functionBreakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(functionBreakpoint.getId(), data.actionBar.domNode);
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
FunctionBreakpointsRenderer.ID = "functionbreakpoints";
FunctionBreakpointsRenderer = __decorateClass([
  __decorateParam(3, IDebugService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, ILabelService)
], FunctionBreakpointsRenderer);
let DataBreakpointsRenderer = class {
  constructor(menu, breakpointHasMultipleModes, breakpointSupportsCondition, breakpointItemType, breakpointIsDataBytes, debugService, hoverService, labelService) {
    this.menu = menu;
    this.breakpointHasMultipleModes = breakpointHasMultipleModes;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.breakpointIsDataBytes = breakpointIsDataBytes;
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return DataBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.accessType = dom.append(data.breakpoint, $("span.access-type"));
    data.condition = dom.append(data.breakpoint, $("span.condition"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, _index, data) {
    this.renderDataBreakpoint(node.element, data);
  }
  renderCompressedElements(node, _index, data) {
    this.renderDataBreakpoint(node.element.elements[node.element.elements.length - 1], data);
  }
  renderDataBreakpoint(dataBreakpoint, data) {
    data.context = dataBreakpoint;
    data.name.textContent = dataBreakpoint.description;
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), dataBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ? message : ""));
    data.checkbox.checked = dataBreakpoint.enabled;
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, message ? message : ""));
    if (dataBreakpoint.modeLabel) {
      data.badge.textContent = dataBreakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
    const session = this.debugService.getViewModel().focusedSession;
    data.breakpoint.classList.toggle("disabled", session && !session.capabilities.supportsDataBreakpoints || !this.debugService.getModel().areBreakpointsActivated());
    if (session && !session.capabilities.supportsDataBreakpoints) {
      data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, localize("dataBreakpointsNotSupported", "Data breakpoints are not supported by this debug type")));
    }
    if (dataBreakpoint.accessType) {
      const accessType = dataBreakpoint.accessType === "read" ? localize("read", "Read") : dataBreakpoint.accessType === "write" ? localize("write", "Write") : localize("access", "Access");
      data.accessType.textContent = accessType;
    } else {
      data.accessType.textContent = "";
    }
    if (dataBreakpoint.condition && dataBreakpoint.hitCondition) {
      data.condition.textContent = localize("expressionAndHitCount", "Condition: {0} | Hit Count: {1}", dataBreakpoint.condition, dataBreakpoint.hitCondition);
    } else {
      data.condition.textContent = dataBreakpoint.condition || dataBreakpoint.hitCondition || "";
    }
    this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes("data").length > 1);
    this.breakpointItemType.set("dataBreakpoint");
    this.breakpointIsDataBytes.set(dataBreakpoint.src.type === DataBreakpointSetType.Address);
    const { primary } = getActionBarActions(this.menu.getActions({ arg: dataBreakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(dataBreakpoint.getId(), data.actionBar.domNode);
    this.breakpointIsDataBytes.reset();
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
DataBreakpointsRenderer.ID = "databreakpoints";
DataBreakpointsRenderer = __decorateClass([
  __decorateParam(5, IDebugService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, ILabelService)
], DataBreakpointsRenderer);
let InstructionBreakpointsRenderer = class {
  constructor(debugService, hoverService, labelService) {
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return InstructionBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.address = dom.append(data.breakpoint, $("span.file-path"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, index, data) {
    this.renderInstructionBreakpoint(node.element, data);
  }
  renderCompressedElements(node, index, data) {
    this.renderInstructionBreakpoint(node.element.elements[node.element.elements.length - 1], data);
  }
  renderInstructionBreakpoint(breakpoint, data) {
    data.context = breakpoint;
    data.breakpoint.classList.toggle("disabled", !this.debugService.getModel().areBreakpointsActivated());
    data.name.textContent = "0x" + breakpoint.address.toString(16);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.name, localize("debug.decimal.address", "Decimal Address: {0}", breakpoint.address.toString())));
    data.checkbox.checked = breakpoint.enabled;
    const { message, icon } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), breakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, breakpoint.message || message || ""));
    const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
    if (debugActive && !breakpoint.verified) {
      data.breakpoint.classList.add("disabled");
    }
    if (breakpoint.modeLabel) {
      data.badge.textContent = breakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
InstructionBreakpointsRenderer.ID = "instructionBreakpoints";
InstructionBreakpointsRenderer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, ILabelService)
], InstructionBreakpointsRenderer);
const _FunctionBreakpointInputRenderer = class _FunctionBreakpointInputRenderer {
  constructor(view, debugService, contextViewService, hoverService, labelService) {
    this.view = view;
    this.debugService = debugService;
    this.contextViewService = contextViewService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return _FunctionBreakpointInputRenderer.ID;
  }
  renderTemplate(container) {
    const template = /* @__PURE__ */ Object.create(null);
    const toDispose = new DisposableStore();
    const breakpoint = dom.append(container, $(".breakpoint"));
    template.icon = $(".icon");
    template.checkbox = createCheckbox(toDispose);
    dom.append(breakpoint, template.icon);
    dom.append(breakpoint, template.checkbox.domNode);
    this.view.breakpointInputFocused.set(true);
    const inputBoxContainer = dom.append(breakpoint, $(".inputBoxContainer"));
    const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles });
    toDispose.add(inputBox);
    const wrapUp = (success) => {
      template.updating = true;
      try {
        this.view.breakpointInputFocused.set(false);
        const id = template.breakpoint.getId();
        if (success) {
          if (template.type === "name") {
            this.debugService.updateFunctionBreakpoint(id, { name: inputBox.value });
          }
          if (template.type === "condition") {
            this.debugService.updateFunctionBreakpoint(id, { condition: inputBox.value });
          }
          if (template.type === "hitCount") {
            this.debugService.updateFunctionBreakpoint(id, { hitCondition: inputBox.value });
          }
        } else {
          if (template.type === "name" && !template.breakpoint.name) {
            this.debugService.removeFunctionBreakpoints(id);
          } else {
            this.view.renderInputBox(void 0);
          }
        }
      } finally {
        template.updating = false;
      }
    };
    toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, "keydown", (e) => {
      const isEscape = e.equals(KeyCode.Escape);
      const isEnter = e.equals(KeyCode.Enter);
      if (isEscape || isEnter) {
        e.preventDefault();
        e.stopPropagation();
        wrapUp(isEnter);
      }
    }));
    toDispose.add(dom.addDisposableListener(inputBox.inputElement, "blur", () => {
      if (!template.updating) {
        wrapUp(!!inputBox.value);
      }
    }));
    template.inputBox = inputBox;
    template.elementDisposables = new DisposableStore();
    template.templateDisposables = toDispose;
    template.templateDisposables.add(template.elementDisposables);
    return template;
  }
  renderElement(node, _index, data) {
    const functionBreakpoint = node.element;
    data.breakpoint = functionBreakpoint;
    data.type = this.view.inputBoxData?.type || "name";
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), functionBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ? message : ""));
    data.checkbox.checked = functionBreakpoint.enabled;
    data.checkbox.disable();
    data.inputBox.value = functionBreakpoint.name || "";
    let placeholder = localize("functionBreakpointPlaceholder", "Function to break on");
    let ariaLabel = localize("functionBreakPointInputAriaLabel", "Type function breakpoint.");
    if (data.type === "condition") {
      data.inputBox.value = functionBreakpoint.condition || "";
      placeholder = localize("functionBreakpointExpressionPlaceholder", "Break when expression evaluates to true");
      ariaLabel = localize("functionBreakPointExpresionAriaLabel", "Type expression. Function breakpoint will break when expression evaluates to true");
    } else if (data.type === "hitCount") {
      data.inputBox.value = functionBreakpoint.hitCondition || "";
      placeholder = localize("functionBreakpointHitCountPlaceholder", "Break when hit count is met");
      ariaLabel = localize("functionBreakPointHitCountAriaLabel", "Type hit count. Function breakpoint will break when hit count is met.");
    }
    data.inputBox.setAriaLabel(ariaLabel);
    data.inputBox.setPlaceHolder(placeholder);
    setTimeout(() => {
      data.inputBox.focus();
      data.inputBox.select();
    }, 0);
  }
  renderCompressedElements(node, _index, data) {
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_FunctionBreakpointInputRenderer.ID = "functionbreakpointinput";
let FunctionBreakpointInputRenderer = _FunctionBreakpointInputRenderer;
const _DataBreakpointInputRenderer = class _DataBreakpointInputRenderer {
  constructor(view, debugService, contextViewService, hoverService, labelService) {
    this.view = view;
    this.debugService = debugService;
    this.contextViewService = contextViewService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return _DataBreakpointInputRenderer.ID;
  }
  renderTemplate(container) {
    const template = /* @__PURE__ */ Object.create(null);
    const toDispose = new DisposableStore();
    const breakpoint = dom.append(container, $(".breakpoint"));
    template.icon = $(".icon");
    template.checkbox = createCheckbox(toDispose);
    dom.append(breakpoint, template.icon);
    dom.append(breakpoint, template.checkbox.domNode);
    this.view.breakpointInputFocused.set(true);
    const inputBoxContainer = dom.append(breakpoint, $(".inputBoxContainer"));
    const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles });
    toDispose.add(inputBox);
    const wrapUp = (success) => {
      template.updating = true;
      try {
        this.view.breakpointInputFocused.set(false);
        const id = template.breakpoint.getId();
        if (success) {
          if (template.type === "condition") {
            this.debugService.updateDataBreakpoint(id, { condition: inputBox.value });
          }
          if (template.type === "hitCount") {
            this.debugService.updateDataBreakpoint(id, { hitCondition: inputBox.value });
          }
        } else {
          this.view.renderInputBox(void 0);
        }
      } finally {
        template.updating = false;
      }
    };
    toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, "keydown", (e) => {
      const isEscape = e.equals(KeyCode.Escape);
      const isEnter = e.equals(KeyCode.Enter);
      if (isEscape || isEnter) {
        e.preventDefault();
        e.stopPropagation();
        wrapUp(isEnter);
      }
    }));
    toDispose.add(dom.addDisposableListener(inputBox.inputElement, "blur", () => {
      if (!template.updating) {
        wrapUp(!!inputBox.value);
      }
    }));
    template.inputBox = inputBox;
    template.elementDisposables = new DisposableStore();
    template.templateDisposables = toDispose;
    template.templateDisposables.add(template.elementDisposables);
    return template;
  }
  renderElement(node, _index, data) {
    const dataBreakpoint = node.element;
    data.breakpoint = dataBreakpoint;
    data.type = this.view.inputBoxData?.type || "condition";
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), dataBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ?? ""));
    data.checkbox.checked = dataBreakpoint.enabled;
    data.checkbox.disable();
    data.inputBox.value = "";
    let placeholder = "";
    let ariaLabel = "";
    if (data.type === "condition") {
      data.inputBox.value = dataBreakpoint.condition || "";
      placeholder = localize("dataBreakpointExpressionPlaceholder", "Break when expression evaluates to true");
      ariaLabel = localize("dataBreakPointExpresionAriaLabel", "Type expression. Data breakpoint will break when expression evaluates to true");
    } else if (data.type === "hitCount") {
      data.inputBox.value = dataBreakpoint.hitCondition || "";
      placeholder = localize("dataBreakpointHitCountPlaceholder", "Break when hit count is met");
      ariaLabel = localize("dataBreakPointHitCountAriaLabel", "Type hit count. Data breakpoint will break when hit count is met.");
    }
    data.inputBox.setAriaLabel(ariaLabel);
    data.inputBox.setPlaceHolder(placeholder);
    setTimeout(() => {
      data.inputBox.focus();
      data.inputBox.select();
    }, 0);
  }
  renderCompressedElements(node, _index, data) {
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_DataBreakpointInputRenderer.ID = "databreakpointinput";
let DataBreakpointInputRenderer = _DataBreakpointInputRenderer;
const _ExceptionBreakpointInputRenderer = class _ExceptionBreakpointInputRenderer {
  constructor(view, debugService, contextViewService) {
    this.view = view;
    this.debugService = debugService;
    this.contextViewService = contextViewService;
  }
  get templateId() {
    return _ExceptionBreakpointInputRenderer.ID;
  }
  renderTemplate(container) {
    const toDispose = new DisposableStore();
    const breakpoint = dom.append(container, $(".breakpoint"));
    breakpoint.classList.add("exception");
    const checkbox = createCheckbox(toDispose);
    dom.append(breakpoint, checkbox.domNode);
    this.view.breakpointInputFocused.set(true);
    const inputBoxContainer = dom.append(breakpoint, $(".inputBoxContainer"));
    const inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
      ariaLabel: localize("exceptionBreakpointAriaLabel", "Type exception breakpoint condition"),
      inputBoxStyles: defaultInputBoxStyles
    });
    toDispose.add(inputBox);
    const wrapUp = (success) => {
      if (!templateData.currentBreakpoint) {
        return;
      }
      this.view.breakpointInputFocused.set(false);
      let newCondition = templateData.currentBreakpoint.condition;
      if (success) {
        newCondition = inputBox.value !== "" ? inputBox.value : void 0;
      }
      this.debugService.setExceptionBreakpointCondition(templateData.currentBreakpoint, newCondition);
    };
    toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, "keydown", (e) => {
      const isEscape = e.equals(KeyCode.Escape);
      const isEnter = e.equals(KeyCode.Enter);
      if (isEscape || isEnter) {
        e.preventDefault();
        e.stopPropagation();
        wrapUp(isEnter);
      }
    }));
    toDispose.add(dom.addDisposableListener(inputBox.inputElement, "blur", () => {
      setTimeout(() => {
        wrapUp(true);
      });
    }));
    const elementDisposables = new DisposableStore();
    toDispose.add(elementDisposables);
    const templateData = {
      inputBox,
      checkbox,
      templateDisposables: toDispose,
      elementDisposables: new DisposableStore()
    };
    return templateData;
  }
  renderElement(node, _index, data) {
    const exceptionBreakpoint = node.element;
    const placeHolder = exceptionBreakpoint.conditionDescription || localize("exceptionBreakpointPlaceholder", "Break when expression evaluates to true");
    data.inputBox.setPlaceHolder(placeHolder);
    data.currentBreakpoint = exceptionBreakpoint;
    data.checkbox.checked = exceptionBreakpoint.enabled;
    data.checkbox.disable();
    data.inputBox.value = exceptionBreakpoint.condition || "";
    setTimeout(() => {
      data.inputBox.focus();
      data.inputBox.select();
    }, 0);
  }
  renderCompressedElements(node, _index, data) {
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_ExceptionBreakpointInputRenderer.ID = "exceptionbreakpointinput";
let ExceptionBreakpointInputRenderer = _ExceptionBreakpointInputRenderer;
class BreakpointsAccessibilityProvider {
  constructor(debugService, labelService) {
    this.debugService = debugService;
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return localize("breakpoints", "Breakpoints");
  }
  getRole() {
    return "checkbox";
  }
  isChecked(element) {
    if (element instanceof BreakpointsFolderItem) {
      return element.enabled;
    }
    return element.enabled;
  }
  getAriaLabel(element) {
    if (element instanceof BreakpointsFolderItem) {
      return localize("breakpointFolder", "Breakpoints in {0}, {1} breakpoints", resources.basenameOrAuthority(element.uri), element.breakpoints.length);
    }
    if (element instanceof ExceptionBreakpoint) {
      return element.toString();
    }
    const { message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), element, this.labelService, this.debugService.getModel());
    const toString = element.toString();
    return message ? `${toString}, ${message}` : toString;
  }
}
function openBreakpointSource(breakpoint, sideBySide, preserveFocus, pinned, debugService, editorService) {
  if (breakpoint.uri.scheme === DEBUG_SCHEME && debugService.state === State.Inactive) {
    return Promise.resolve(void 0);
  }
  const selection = breakpoint.endLineNumber ? {
    startLineNumber: breakpoint.lineNumber,
    endLineNumber: breakpoint.endLineNumber,
    startColumn: breakpoint.column || 1,
    endColumn: breakpoint.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
  } : {
    startLineNumber: breakpoint.lineNumber,
    startColumn: breakpoint.column || 1,
    endLineNumber: breakpoint.lineNumber,
    endColumn: breakpoint.column || Constants.MAX_SAFE_SMALL_INTEGER
  };
  return editorService.openEditor({
    resource: breakpoint.uri,
    options: {
      preserveFocus,
      selection,
      revealIfOpened: true,
      selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
      pinned
    }
  }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
}
function getBreakpointMessageAndIcon(state, breakpointsActivated, breakpoint, labelService, debugModel) {
  const debugActive = state === State.Running || state === State.Stopped;
  const breakpointIcon = breakpoint instanceof DataBreakpoint ? icons.dataBreakpoint : breakpoint instanceof FunctionBreakpoint ? icons.functionBreakpoint : breakpoint.logMessage ? icons.logBreakpoint : icons.breakpoint;
  if (!breakpoint.enabled || !breakpointsActivated) {
    return {
      icon: breakpointIcon.disabled,
      message: breakpoint.logMessage ? localize("disabledLogpoint", "Disabled Logpoint") : localize("disabledBreakpoint", "Disabled Breakpoint")
    };
  }
  const appendMessage = (text) => {
    return breakpoint.message ? text.concat(", " + breakpoint.message) : text;
  };
  if (debugActive && breakpoint instanceof Breakpoint && breakpoint.pending) {
    return {
      icon: icons.breakpoint.pending
    };
  }
  if (debugActive && !breakpoint.verified) {
    return {
      icon: breakpointIcon.unverified,
      message: breakpoint.message ? breakpoint.message : breakpoint.logMessage ? localize("unverifiedLogpoint", "Unverified Logpoint") : localize("unverifiedBreakpoint", "Unverified Breakpoint"),
      showAdapterUnverifiedMessage: true
    };
  }
  if (breakpoint instanceof DataBreakpoint) {
    if (!breakpoint.supported) {
      return {
        icon: breakpointIcon.unverified,
        message: localize("dataBreakpointUnsupported", "Data breakpoints not supported by this debug type")
      };
    }
    return {
      icon: breakpointIcon.regular,
      message: breakpoint.message || localize("dataBreakpoint", "Data Breakpoint")
    };
  }
  if (breakpoint instanceof FunctionBreakpoint) {
    if (!breakpoint.supported) {
      return {
        icon: breakpointIcon.unverified,
        message: localize("functionBreakpointUnsupported", "Function breakpoints not supported by this debug type")
      };
    }
    const messages = [];
    messages.push(breakpoint.message || localize("functionBreakpoint", "Function Breakpoint"));
    if (breakpoint.condition) {
      messages.push(localize("expression", "Condition: {0}", breakpoint.condition));
    }
    if (breakpoint.hitCondition) {
      messages.push(localize("hitCount", "Hit Count: {0}", breakpoint.hitCondition));
    }
    return {
      icon: breakpointIcon.regular,
      message: appendMessage(messages.join("\n"))
    };
  }
  if (breakpoint instanceof InstructionBreakpoint) {
    if (!breakpoint.supported) {
      return {
        icon: breakpointIcon.unverified,
        message: localize("instructionBreakpointUnsupported", "Instruction breakpoints not supported by this debug type")
      };
    }
    const messages = [];
    if (breakpoint.message) {
      messages.push(breakpoint.message);
    } else if (breakpoint.instructionReference) {
      messages.push(localize("instructionBreakpointAtAddress", "Instruction breakpoint at address {0}", breakpoint.instructionReference));
    } else {
      messages.push(localize("instructionBreakpoint", "Instruction breakpoint"));
    }
    if (breakpoint.hitCondition) {
      messages.push(localize("hitCount", "Hit Count: {0}", breakpoint.hitCondition));
    }
    return {
      icon: breakpointIcon.regular,
      message: appendMessage(messages.join("\n"))
    };
  }
  let triggeringBreakpoint;
  if (breakpoint instanceof Breakpoint && breakpoint.triggeredBy) {
    triggeringBreakpoint = debugModel.getBreakpoints().find((bp) => bp.getId() === breakpoint.triggeredBy);
  }
  if (breakpoint.logMessage || breakpoint.condition || breakpoint.hitCondition || triggeringBreakpoint) {
    const messages = [];
    let icon = breakpoint.logMessage ? icons.logBreakpoint.regular : icons.conditionalBreakpoint.regular;
    if (!breakpoint.supported) {
      icon = icons.debugBreakpointUnsupported;
      messages.push(localize("breakpointUnsupported", "Breakpoints of this type are not supported by the debugger"));
    }
    if (breakpoint.logMessage) {
      messages.push(localize("logMessage", "Log Message: {0}", breakpoint.logMessage));
    }
    if (breakpoint.condition) {
      messages.push(localize("expression", "Condition: {0}", breakpoint.condition));
    }
    if (breakpoint.hitCondition) {
      messages.push(localize("hitCount", "Hit Count: {0}", breakpoint.hitCondition));
    }
    if (triggeringBreakpoint) {
      messages.push(localize("triggeredBy", "Hit after breakpoint: {0}", `${labelService.getUriLabel(triggeringBreakpoint.uri, { relative: true })}: ${triggeringBreakpoint.lineNumber}`));
    }
    return {
      icon,
      message: appendMessage(messages.join("\n"))
    };
  }
  const message = breakpoint.message ? breakpoint.message : breakpoint instanceof Breakpoint && labelService ? labelService.getUriLabel(breakpoint.uri) : localize("breakpoint", "Breakpoint");
  return {
    icon: breakpointIcon.regular,
    message
  };
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.addFunctionBreakpointAction",
      title: {
        ...localize2("addFunctionBreakpoint", "Add Function Breakpoint"),
        mnemonicTitle: localize({ key: "miFunctionBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Function Breakpoint...")
      },
      f1: true,
      icon: icons.watchExpressionsAddFuncBreakpoint,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 10,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }, {
        id: MenuId.MenubarNewBreakpointMenu,
        group: "1_breakpoints",
        order: 3,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    const viewService = accessor.get(IViewsService);
    await viewService.openView(BREAKPOINTS_VIEW_ID);
    debugService.addFunctionBreakpoint();
  }
});
class MemoryBreakpointAction extends Action2 {
  async run(accessor, existingBreakpoint) {
    const debugService = accessor.get(IDebugService);
    const session = debugService.getViewModel().focusedSession;
    if (!session) {
      return;
    }
    let defaultValue = void 0;
    if (existingBreakpoint && existingBreakpoint.src.type === DataBreakpointSetType.Address) {
      defaultValue = `${existingBreakpoint.src.address} + ${existingBreakpoint.src.bytes}`;
    }
    const quickInput = accessor.get(IQuickInputService);
    const notifications = accessor.get(INotificationService);
    const range = await this.getRange(quickInput, defaultValue);
    if (!range) {
      return;
    }
    let info;
    try {
      info = await session.dataBytesBreakpointInfo(range.address, range.bytes);
    } catch (e) {
      notifications.error(localize("dataBreakpointError", "Failed to set data breakpoint at {0}: {1}", range.address, e.message));
    }
    if (!info?.dataId) {
      return;
    }
    let accessType = "write";
    if (info.accessTypes && info.accessTypes?.length > 1) {
      const accessTypes = info.accessTypes.map((type) => ({ label: type }));
      const selectedAccessType = await quickInput.pick(accessTypes, { placeHolder: localize("dataBreakpointAccessType", "Select the access type to monitor") });
      if (!selectedAccessType) {
        return;
      }
      accessType = selectedAccessType.label;
    }
    const src = { type: DataBreakpointSetType.Address, ...range };
    if (existingBreakpoint) {
      await debugService.removeDataBreakpoints(existingBreakpoint.getId());
    }
    await debugService.addDataBreakpoint({
      description: info.description,
      src,
      canPersist: true,
      accessTypes: info.accessTypes,
      accessType,
      initialSessionData: { session, dataId: info.dataId }
    });
  }
  getRange(quickInput, defaultValue) {
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      const input = disposables.add(quickInput.createInputBox());
      input.prompt = localize("dataBreakpointMemoryRangePrompt", "Enter a memory range in which to break");
      input.placeholder = localize("dataBreakpointMemoryRangePlaceholder", "Absolute range (0x1234 - 0x1300) or range of bytes after an address (0x1234 + 0xff)");
      if (defaultValue) {
        input.value = defaultValue;
        input.valueSelection = [0, defaultValue.length];
      }
      disposables.add(input.onDidChangeValue((e) => {
        const err = this.parseAddress(e, false);
        input.validationMessage = err?.error;
      }));
      disposables.add(input.onDidAccept(() => {
        const r = this.parseAddress(input.value, true);
        if (hasKey(r, { error: true })) {
          input.validationMessage = r.error;
        } else {
          resolve(r);
        }
        input.dispose();
      }));
      disposables.add(input.onDidHide(() => {
        resolve(void 0);
        disposables.dispose();
      }));
      input.ignoreFocusOut = true;
      input.show();
    });
  }
  parseAddress(range, isFinal) {
    const parts = /^(\S+)\s*(?:([+-])\s*(\S+))?/.exec(range);
    if (!parts) {
      return { error: localize("dataBreakpointAddrFormat", 'Address should be a range of numbers the form "[Start] - [End]" or "[Start] + [Bytes]"') };
    }
    const isNum = (e) => isFinal ? /^0x[0-9a-f]*|[0-9]*$/i.test(e) : /^0x[0-9a-f]+|[0-9]+$/i.test(e);
    const [, startStr, sign = "+", endStr = "1"] = parts;
    for (const n of [startStr, endStr]) {
      if (!isNum(n)) {
        return { error: localize("dataBreakpointAddrStartEnd", 'Number must be a decimal integer or hex value starting with "0x", got {0}', n) };
      }
    }
    if (!isFinal) {
      return;
    }
    const start = BigInt(startStr);
    const end = BigInt(endStr);
    const address = `0x${start.toString(16)}`;
    if (sign === "-") {
      if (start > end) {
        return { error: localize("dataBreakpointAddrOrder", "End ({1}) should be greater than Start ({0})", startStr, endStr) };
      }
      return { address, bytes: Number(end - start) };
    }
    return { address, bytes: Number(end) };
  }
}
registerAction2(class extends MemoryBreakpointAction {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.addDataBreakpointOnAddress",
      title: {
        ...localize2("addDataBreakpointOnAddress", "Add Data Breakpoint at Address"),
        mnemonicTitle: localize({ key: "miDataBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Data Breakpoint...")
      },
      f1: true,
      icon: icons.watchExpressionsAddDataBreakpoint,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 11,
        when: ContextKeyExpr.and(CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID))
      }, {
        id: MenuId.MenubarNewBreakpointMenu,
        group: "1_breakpoints",
        order: 4,
        when: CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED
      }]
    });
  }
});
registerAction2(class extends MemoryBreakpointAction {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.editDataBreakpointOnAddress",
      title: localize2("editDataBreakpointOnAddress", "Edit Address..."),
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        when: ContextKeyExpr.and(CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES),
        group: "navigation",
        order: 15
      }]
    });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.toggleBreakpointsActivatedAction",
      title: localize2("activateBreakpoints", "Toggle Activate Breakpoints"),
      f1: true,
      icon: icons.breakpointsActivate,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 20,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.setBreakpointsActivated(!debugService.getModel().areBreakpointsActivated());
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.removeBreakpoint",
      title: localize("removeBreakpoint", "Remove Breakpoint"),
      icon: Codicon.removeClose,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "3_modification",
        order: 10,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint")
      }, {
        id: MenuId.DebugBreakpointsContext,
        group: "inline",
        order: 20,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint")
      }]
    });
  }
  async run(accessor, breakpoint) {
    const debugService = accessor.get(IDebugService);
    if (breakpoint instanceof Breakpoint) {
      await debugService.removeBreakpoints(breakpoint.getId());
    } else if (breakpoint instanceof FunctionBreakpoint) {
      await debugService.removeFunctionBreakpoints(breakpoint.getId());
    } else if (breakpoint instanceof DataBreakpoint) {
      await debugService.removeDataBreakpoints(breakpoint.getId());
    } else if (breakpoint instanceof InstructionBreakpoint) {
      await debugService.removeInstructionBreakpoints(breakpoint.instructionReference, breakpoint.offset);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.removeAllBreakpoints",
      title: {
        ...localize2("removeAllBreakpoints", "Remove All Breakpoints"),
        mnemonicTitle: localize({ key: "miRemoveAllBreakpoints", comment: ["&& denotes a mnemonic"] }, "Remove &&All Breakpoints")
      },
      f1: true,
      icon: icons.breakpointsRemoveAll,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 30,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }, {
        id: MenuId.DebugBreakpointsContext,
        group: "3_modification",
        order: 20,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }, {
        id: MenuId.MenubarDebugMenu,
        group: "5_breakpoints",
        order: 3,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.removeBreakpoints();
    debugService.removeFunctionBreakpoints();
    debugService.removeDataBreakpoints();
    debugService.removeInstructionBreakpoints();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.enableAllBreakpoints",
      title: {
        ...localize2("enableAllBreakpoints", "Enable All Breakpoints"),
        mnemonicTitle: localize({ key: "miEnableAllBreakpoints", comment: ["&& denotes a mnemonic"] }, "&&Enable All Breakpoints")
      },
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "z_commands",
        order: 10,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }, {
        id: MenuId.MenubarDebugMenu,
        group: "5_breakpoints",
        order: 1,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    await debugService.enableOrDisableBreakpoints(true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.disableAllBreakpoints",
      title: {
        ...localize2("disableAllBreakpoints", "Disable All Breakpoints"),
        mnemonicTitle: localize({ key: "miDisableAllBreakpoints", comment: ["&& denotes a mnemonic"] }, "Disable A&&ll Breakpoints")
      },
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "z_commands",
        order: 20,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }, {
        id: MenuId.MenubarDebugMenu,
        group: "5_breakpoints",
        order: 2,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    await debugService.enableOrDisableBreakpoints(false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.reapplyBreakpointsAction",
      title: localize2("reapplyAllBreakpoints", "Reapply All Breakpoints"),
      f1: true,
      precondition: CONTEXT_IN_DEBUG_MODE,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "z_commands",
        order: 30,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    await debugService.setBreakpointsActivated(true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.toggleBreakpointsPresentation",
      title: localize2("toggleBreakpointsPresentation", "Toggle Breakpoints View Presentation"),
      f1: true,
      icon: icons.breakpointsViewIcon,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 10,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentPresentation = configurationService.getValue("debug.breakpointsView.presentation");
    const newPresentation = currentPresentation === "tree" ? "list" : "tree";
    await configurationService.updateValue("debug.breakpointsView.presentation", newPresentation);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editBreakpoint",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editCondition", "Edit Condition..."),
      icon: Codicon.edit,
      precondition: CONTEXT_BREAKPOINT_SUPPORTS_CONDITION,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("functionBreakpoint"),
        group: "navigation",
        order: 10
      }, {
        id: MenuId.DebugBreakpointsContext,
        group: "inline",
        order: 10
      }]
    });
  }
  async runInView(accessor, view, breakpoint) {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    if (breakpoint instanceof Breakpoint) {
      const editor = await openBreakpointSource(breakpoint, false, false, true, debugService, editorService);
      if (editor) {
        const codeEditor = editor.getControl();
        if (isCodeEditor(codeEditor)) {
          codeEditor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(breakpoint.lineNumber, breakpoint.column);
        }
      }
    } else if (breakpoint instanceof FunctionBreakpoint) {
      const contextMenuService = accessor.get(IContextMenuService);
      const actions = [
        new Action("breakpoint.editCondition", localize("editCondition", "Edit Condition..."), void 0, true, async () => view.renderInputBox({ breakpoint, type: "condition" })),
        new Action("breakpoint.editCondition", localize("editHitCount", "Edit Hit Count..."), void 0, true, async () => view.renderInputBox({ breakpoint, type: "hitCount" }))
      ];
      const domNode = breakpointIdToActionBarDomeNode.get(breakpoint.getId());
      if (domNode) {
        contextMenuService.showContextMenu({
          getActions: () => actions,
          getAnchor: () => domNode,
          onHide: () => dispose(actions)
        });
      }
    } else {
      view.renderInputBox({ breakpoint, type: "condition" });
    }
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editFunctionBreakpoint",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editBreakpoint", "Edit Function Condition..."),
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "navigation",
        order: 10,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("functionBreakpoint")
      }]
    });
  }
  runInView(_accessor, view, breakpoint) {
    view.renderInputBox({ breakpoint, type: "name" });
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editFunctionBreakpointHitCount",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editHitCount", "Edit Hit Count..."),
      precondition: CONTEXT_BREAKPOINT_SUPPORTS_CONDITION,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "navigation",
        order: 20,
        when: ContextKeyExpr.or(CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("functionBreakpoint"), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("dataBreakpoint"))
      }]
    });
  }
  runInView(_accessor, view, breakpoint) {
    view.renderInputBox({ breakpoint, type: "hitCount" });
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editBreakpointMode",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editMode", "Edit Mode..."),
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "navigation",
        order: 20,
        when: ContextKeyExpr.and(
          CONTEXT_BREAKPOINT_HAS_MODES,
          ContextKeyExpr.or(CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("breakpoint"), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("exceptionBreakpoint"), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("instructionBreakpoint"))
        )
      }]
    });
  }
  async runInView(accessor, view, breakpoint) {
    const debugService = accessor.get(IDebugService);
    const kind = getModeKindForBreakpoint(breakpoint);
    const modes = debugService.getModel().getBreakpointModes(kind);
    const picked = await accessor.get(IQuickInputService).pick(
      modes.map((mode) => ({ label: mode.label, description: mode.description, mode: mode.mode })),
      { placeHolder: localize("selectBreakpointMode", "Select Breakpoint Mode") }
    );
    if (!picked) {
      return;
    }
    if (kind === "source") {
      const data = /* @__PURE__ */ new Map();
      data.set(breakpoint.getId(), { mode: picked.mode, modeLabel: picked.label });
      debugService.updateBreakpoints(breakpoint.originalUri, data, false);
    } else if (breakpoint instanceof InstructionBreakpoint) {
      debugService.removeInstructionBreakpoints(breakpoint.instructionReference, breakpoint.offset);
      debugService.addInstructionBreakpoint({ ...breakpoint.toJSON(), mode: picked.mode, modeLabel: picked.label });
    } else if (breakpoint instanceof ExceptionBreakpoint) {
      breakpoint.mode = picked.mode;
      breakpoint.modeLabel = picked.label;
      debugService.setExceptionBreakpointCondition(breakpoint, breakpoint.condition);
    }
  }
});
export {
  BreakpointsFolderItem,
  BreakpointsView,
  getBreakpointMessageAndIcon,
  getExpandedBodySize,
  openBreakpointSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxicmVha3BvaW50c1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCwgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQXJpYVJvbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IEljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IENoZWNrYm94LCBUcmlTdGF0ZUNoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZUVsZW1lbnQsIElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMsIGdldENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZpZXdBY3Rpb24sIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCUkVBS1BPSU5UU19WSUVXX0lELCBCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQsIENPTlRFWFRfQlJFQUtQT0lOVFNfRVhJU1QsIENPTlRFWFRfQlJFQUtQT0lOVFNfRk9DVVNFRCwgQ09OVEVYVF9CUkVBS1BPSU5UX0hBU19NT0RFUywgQ09OVEVYVF9CUkVBS1BPSU5UX0lOUFVUX0ZPQ1VTRUQsIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX0lTX0RBVEFfQllURVMsIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUsIENPTlRFWFRfQlJFQUtQT0lOVF9TVVBQT1JUU19DT05ESVRJT04sIENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSwgQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX1NFVF9EQVRBX0JSRUFLUE9JTlRfQllURVNfU1VQUE9SVEVELCBERUJVR19TQ0hFTUUsIERhdGFCcmVha3BvaW50U2V0VHlwZSwgRGF0YUJyZWFrcG9pbnRTb3VyY2UsIERlYnVnZ2VyU3RyaW5nLCBJQmFzZUJyZWFrcG9pbnQsIElCcmVha3BvaW50LCBJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiwgSUJyZWFrcG9pbnRVcGRhdGVEYXRhLCBJRGF0YUJyZWFrcG9pbnQsIElEYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSwgSURlYnVnTW9kZWwsIElEZWJ1Z1NlcnZpY2UsIElFbmFibGVtZW50LCBJRXhjZXB0aW9uQnJlYWtwb2ludCwgSUZ1bmN0aW9uQnJlYWtwb2ludCwgSUluc3RydWN0aW9uQnJlYWtwb2ludCwgU3RhdGUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgQnJlYWtwb2ludCwgRGF0YUJyZWFrcG9pbnQsIEV4Y2VwdGlvbkJyZWFrcG9pbnQsIEZ1bmN0aW9uQnJlYWtwb2ludCwgSW5zdHJ1Y3Rpb25CcmVha3BvaW50IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgRGlzYXNzZW1ibHlWaWV3SW5wdXQgfSBmcm9tICcuLi9jb21tb24vZGlzYXNzZW1ibHlWaWV3SW5wdXQuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCB7IERpc2Fzc2VtYmx5VmlldyB9IGZyb20gJy4vZGlzYXNzZW1ibHlWaWV3LmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuZnVuY3Rpb24gY3JlYXRlQ2hlY2tib3goZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IENoZWNrYm94IHtcblx0Y29uc3QgY2hlY2tib3ggPSBuZXcgQ2hlY2tib3goJycsIGZhbHNlLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpO1xuXHRjaGVja2JveC5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdGRpc3Bvc2FibGVzLmFkZChjaGVja2JveCk7XG5cblx0cmV0dXJuIGNoZWNrYm94O1xufVxuXG5jb25zdCBNQVhfVklTSUJMRV9CUkVBS1BPSU5UUyA9IDk7XG5leHBvcnQgZnVuY3Rpb24gZ2V0RXhwYW5kZWRCb2R5U2l6ZShtb2RlbDogSURlYnVnTW9kZWwsIHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb3VudExpbWl0OiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBsZW5ndGggPSBtb2RlbC5nZXRCcmVha3BvaW50cygpLmxlbmd0aCArIG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uSWQpLmxlbmd0aCArIG1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKS5sZW5ndGggKyBtb2RlbC5nZXREYXRhQnJlYWtwb2ludHMoKS5sZW5ndGggKyBtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoO1xuXHRyZXR1cm4gTWF0aC5taW4oY291bnRMaW1pdCwgbGVuZ3RoKSAqIDIyO1xufVxudHlwZSBCcmVha3BvaW50SXRlbSA9IElCcmVha3BvaW50IHwgSUZ1bmN0aW9uQnJlYWtwb2ludCB8IElEYXRhQnJlYWtwb2ludCB8IElFeGNlcHRpb25CcmVha3BvaW50IHwgSUluc3RydWN0aW9uQnJlYWtwb2ludDtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgZmlsZSBub2RlIGluIHRoZSBicmVha3BvaW50cyB0cmVlIHRoYXQgZ3JvdXBzIGJyZWFrcG9pbnRzIGJ5IGZpbGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcmVha3BvaW50c0ZvbGRlckl0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB1cmk6IFVSSSxcblx0XHRyZWFkb25seSBicmVha3BvaW50czogSUJyZWFrcG9pbnRbXVxuXHQpIHsgfVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudXJpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5icmVha3BvaW50cy5ldmVyeShicCA9PiBicC5lbmFibGVkKTtcblx0fVxuXG5cdGdldCBpbmRldGVybWluYXRlKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVuYWJsZWRDb3VudCA9IHRoaXMuYnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IGJwLmVuYWJsZWQpLmxlbmd0aDtcblx0XHRyZXR1cm4gZW5hYmxlZENvdW50ID4gMCAmJiBlbmFibGVkQ291bnQgPCB0aGlzLmJyZWFrcG9pbnRzLmxlbmd0aDtcblx0fVxufVxuXG50eXBlIEJyZWFrcG9pbnRUcmVlRWxlbWVudCA9IEJyZWFrcG9pbnRzRm9sZGVySXRlbSB8IEJyZWFrcG9pbnRJdGVtO1xuXG5pbnRlcmZhY2UgSW5wdXRCb3hEYXRhIHtcblx0YnJlYWtwb2ludDogSUZ1bmN0aW9uQnJlYWtwb2ludCB8IElFeGNlcHRpb25CcmVha3BvaW50IHwgSURhdGFCcmVha3BvaW50O1xuXHR0eXBlOiAnY29uZGl0aW9uJyB8ICdoaXRDb3VudCcgfCAnbmFtZSc7XG59XG5cbmZ1bmN0aW9uIGdldE1vZGVLaW5kRm9yQnJlYWtwb2ludChicmVha3BvaW50OiBJQnJlYWtwb2ludCkge1xuXHRjb25zdCBraW5kID0gYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQgPyAnc291cmNlJyA6IGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQgPyAnaW5zdHJ1Y3Rpb24nIDogJ2V4Y2VwdGlvbic7XG5cdHJldHVybiBraW5kO1xufVxuXG5leHBvcnQgY2xhc3MgQnJlYWtwb2ludHNWaWV3IGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8QnJlYWtwb2ludFRyZWVFbGVtZW50LCB2b2lkPjtcblx0cHJpdmF0ZSBuZWVkc1JlZnJlc2ggPSBmYWxzZTtcblx0cHJpdmF0ZSBuZWVkc1N0YXRlQ2hhbmdlID0gZmFsc2U7XG5cdHByaXZhdGUgaWdub3JlTGF5b3V0ID0gZmFsc2U7XG5cdHByaXZhdGUgbWVudTogSU1lbnU7XG5cdHByaXZhdGUgYnJlYWtwb2ludEl0ZW1UeXBlOiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIGJyZWFrcG9pbnRJc0RhdGFCeXRlczogSUNvbnRleHRLZXk8Ym9vbGVhbiB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2lucHV0Qm94RGF0YTogSW5wdXRCb3hEYXRhIHwgdW5kZWZpbmVkO1xuXHRicmVha3BvaW50SW5wdXRGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBhdXRvRm9jdXNlZEVsZW1lbnQ6IEJyZWFrcG9pbnRJdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbGxhcHNlZFN0YXRlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSBoaW50Q29udGFpbmVyOiBJY29uTGFiZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGludERlbGF5ZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBnZXRQcmVzZW50YXRpb24oKTogJ3RyZWUnIHwgJ2xpc3QnIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwndHJlZScgfCAnbGlzdCc+KCdkZWJ1Zy5icmVha3BvaW50c1ZpZXcucHJlc2VudGF0aW9uJyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHR0aGlzLm1lbnUgPSBtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudSk7XG5cdFx0dGhpcy5icmVha3BvaW50SXRlbVR5cGUgPSBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5icmVha3BvaW50SXNEYXRhQnl0ZXMgPSBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9JU19EQVRBX0JZVEVTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5icmVha3BvaW50SGFzTXVsdGlwbGVNb2RlcyA9IENPTlRFWFRfQlJFQUtQT0lOVF9IQVNfTU9ERVMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbiA9IENPTlRFWFRfQlJFQUtQT0lOVF9TVVBQT1JUU19DT05ESVRJT04uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRJbnB1dEZvY3VzZWQgPSBDT05URVhUX0JSRUFLUE9JTlRfSU5QVVRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VCcmVha3BvaW50cygoKSA9PiB0aGlzLm9uQnJlYWtwb2ludHNDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTZXNzaW9uKCgpID0+IHRoaXMub25CcmVha3BvaW50c0NoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB0aGlzLm9uU3RhdGVDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuaGludERlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnVwZGF0ZUJyZWFrcG9pbnRzSGludCh0cnVlKSwgNDAwMCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy1wYW5lJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2RlYnVnLWJyZWFrcG9pbnRzJyk7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxCcmVha3BvaW50VHJlZUVsZW1lbnQsIHZvaWQ+LFxuXHRcdFx0J0JyZWFrcG9pbnRzVmlldycsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgQnJlYWtwb2ludHNEZWxlZ2F0ZSh0aGlzKSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmVha3BvaW50c0ZvbGRlclJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmVha3BvaW50c1JlbmRlcmVyLCB0aGlzLm1lbnUsIHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMsIHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLCB0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZSksXG5cdFx0XHRcdG5ldyBFeGNlcHRpb25CcmVha3BvaW50c1JlbmRlcmVyKHRoaXMubWVudSwgdGhpcy5icmVha3BvaW50SGFzTXVsdGlwbGVNb2RlcywgdGhpcy5icmVha3BvaW50U3VwcG9ydHNDb25kaXRpb24sIHRoaXMuYnJlYWtwb2ludEl0ZW1UeXBlLCB0aGlzLmRlYnVnU2VydmljZSwgdGhpcy5ob3ZlclNlcnZpY2UpLFxuXHRcdFx0XHRuZXcgRXhjZXB0aW9uQnJlYWtwb2ludElucHV0UmVuZGVyZXIodGhpcywgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGdW5jdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIsIHRoaXMubWVudSwgdGhpcy5icmVha3BvaW50U3VwcG9ydHNDb25kaXRpb24sIHRoaXMuYnJlYWtwb2ludEl0ZW1UeXBlKSxcblx0XHRcdFx0bmV3IEZ1bmN0aW9uQnJlYWtwb2ludElucHV0UmVuZGVyZXIodGhpcywgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB0aGlzLmhvdmVyU2VydmljZSwgdGhpcy5sYWJlbFNlcnZpY2UpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERhdGFCcmVha3BvaW50c1JlbmRlcmVyLCB0aGlzLm1lbnUsIHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMsIHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLCB0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZSwgdGhpcy5icmVha3BvaW50SXNEYXRhQnl0ZXMpLFxuXHRcdFx0XHRuZXcgRGF0YUJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyKHRoaXMsIHRoaXMuZGVidWdTZXJ2aWNlLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgdGhpcy5ob3ZlclNlcnZpY2UsIHRoaXMubGFiZWxTZXJ2aWNlKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0cnVjdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIpLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiB0aGlzLmdldFByZXNlbnRhdGlvbigpID09PSAndHJlZScsXG5cdFx0XHRcdGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IHRydWUsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IEJyZWFrcG9pbnRUcmVlRWxlbWVudCkgPT4gZWxlbWVudC5nZXRJZCgpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGVsZW1lbnQ6IEJyZWFrcG9pbnRUcmVlRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50c0ZvbGRlckl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KGVsZW1lbnQudXJpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYCR7cmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkoZWxlbWVudC51cmkpfToke2VsZW1lbnQubGluZU51bWJlcn1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubmFtZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEV4Y2VwdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWwgfHwgZWxlbWVudC5maWx0ZXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEluc3RydWN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYDB4JHtlbGVtZW50LmFkZHJlc3MudG9TdHJpbmcoMTYpfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZWxlbWVudHM6IEJyZWFrcG9pbnRUcmVlRWxlbWVudFtdKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudHMubWFwKGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiByZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eShlLnVyaSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdFx0fSkuam9pbignLycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgQnJlYWtwb2ludHNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIodGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMubGFiZWxTZXJ2aWNlKSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlc1xuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlKTtcblxuXHRcdENPTlRFWFRfQlJFQUtQT0lOVFNfRk9DVVNFRC5iaW5kVG8odGhpcy50cmVlLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KHRoaXMub25UcmVlQ29udGV4dE1lbnUsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbk1vdXNlTWlkZGxlQ2xpY2soYXN5bmMgKHsgZWxlbWVudCB9KSA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoZWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVEYXRhQnJlYWtwb2ludHMoZWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEluc3RydWN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGVsZW1lbnQuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIGVsZW1lbnQub2Zmc2V0KTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhlbGVtZW50LmJyZWFrcG9pbnRzLm1hcChicCA9PiBicC5nZXRJZCgpKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3Blbihhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZG9tLmlzTW91c2VFdmVudChlLmJyb3dzZXJFdmVudCkgJiYgZS5icm93c2VyRXZlbnQuYnV0dG9uID09PSAxKSB7IC8vIG1pZGRsZSBjbGlja1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCkge1xuXHRcdFx0XHRvcGVuQnJlYWtwb2ludFNvdXJjZShlbGVtZW50LCBlLnNpZGVCeVNpZGUsIGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzIHx8IGZhbHNlLCBlLmVkaXRvck9wdGlvbnMucGlubmVkIHx8ICFlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cywgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMuZWRpdG9yU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEluc3RydWN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRjb25zdCBkaXNhc3NlbWJseVZpZXcgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihEaXNhc3NlbWJseVZpZXdJbnB1dC5pbnN0YW5jZSk7XG5cdFx0XHRcdC8vIEZvY3VzIG9uIGRvdWJsZSBjbGlja1xuXHRcdFx0XHQoZGlzYXNzZW1ibHlWaWV3IGFzIERpc2Fzc2VtYmx5VmlldykuZ29Ub0luc3RydWN0aW9uQW5kT2Zmc2V0KGVsZW1lbnQuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIGVsZW1lbnQub2Zmc2V0LCBkb20uaXNNb3VzZUV2ZW50KGUuYnJvd3NlckV2ZW50KSAmJiBlLmJyb3dzZXJFdmVudC5kZXRhaWwgPT09IDIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRvbS5pc01vdXNlRXZlbnQoZS5icm93c2VyRXZlbnQpICYmIGUuYnJvd3NlckV2ZW50LmRldGFpbCA9PT0gMiAmJiBlbGVtZW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50ICYmIGVsZW1lbnQgIT09IHRoaXMuaW5wdXRCb3hEYXRhPy5icmVha3BvaW50KSB7XG5cdFx0XHRcdC8vIGRvdWJsZSBjbGlja1xuXHRcdFx0XHR0aGlzLnJlbmRlcklucHV0Qm94KHsgYnJlYWtwb2ludDogZWxlbWVudCwgdHlwZTogJ25hbWUnIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbktleURvd24oZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpICYmICFkb20uaXNFZGl0YWJsZUVsZW1lbnQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBmb2N1c2VkWzBdO1xuXHRcdFx0XHRcdGlmIChlbGVtZW50ICYmICEoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFlbGVtZW50LmVuYWJsZWQsIGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGNvbGxhcHNlZCBzdGF0ZSBhbmQgdXBkYXRlIHNpemUgKGl0ZW1zIGFyZSBleHBhbmRlZCBieSBkZWZhdWx0KVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5ub2RlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0XHRpZiAoZS5ub2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdHRoaXMuY29sbGFwc2VkU3RhdGUuYWRkKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5jb2xsYXBzZWRTdGF0ZS5kZWxldGUoZWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byBjb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5icmVha3BvaW50c1ZpZXcucHJlc2VudGF0aW9uJykpIHtcblx0XHRcdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gdGhpcy5nZXRQcmVzZW50YXRpb24oKTtcblx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZU9wdGlvbnMoeyBjb21wcmVzc2lvbkVuYWJsZWQ6IHByZXNlbnRhdGlvbiA9PT0gJ3RyZWUnIH0pO1xuXHRcdFx0XHR0aGlzLm9uQnJlYWtwb2ludHNDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnNldFRyZWVJbnB1dCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0aWYgKHRoaXMubmVlZHNSZWZyZXNoKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkJyZWFrcG9pbnRzQ2hhbmdlKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5uZWVkc1N0YXRlQ2hhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy5vblN0YXRlQ2hhbmdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodGhpcy5pZCkhKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250YWluZXJNb2RlbC5vbkRpZENoYW5nZUFsbFZpZXdEZXNjcmlwdG9ycygoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lciwgdGl0bGUpO1xuXG5cdFx0Y29uc3QgaWNvbkxhYmVsQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uYnJlYWtwb2ludC13YXJuaW5nJykpO1xuXHRcdHRoaXMuaGludENvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJY29uTGFiZWwoaWNvbkxhYmVsQ29udGFpbmVyLCB7XG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsIGhvdmVyRGVsZWdhdGU6IHtcblx0XHRcdFx0c2hvd0hvdmVyOiAob3B0aW9ucywgZm9jdXM/KSA9PiB0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHsgY29udGVudDogb3B0aW9ucy5jb250ZW50LCB0YXJnZXQ6IHRoaXMuaGludENvbnRhaW5lciEuZWxlbWVudCB9LCBmb2N1cyksXG5cdFx0XHRcdGRlbGF5OiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScpXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRvbS5oaWRlKHRoaXMuaGludENvbnRhaW5lci5lbGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlPy5kb21Gb2N1cygpO1xuXHR9XG5cblx0cmVuZGVySW5wdXRCb3goZGF0YTogSW5wdXRCb3hEYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5faW5wdXRCb3hEYXRhID0gZGF0YTtcblx0XHR0aGlzLm9uQnJlYWtwb2ludHNDaGFuZ2UoKTtcblx0XHR0aGlzLl9pbnB1dEJveERhdGEgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgaW5wdXRCb3hEYXRhKCk6IElucHV0Qm94RGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0Qm94RGF0YTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaWdub3JlTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRyZWU/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5pZ25vcmVMYXlvdXQgPSB0cnVlO1xuXHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaWdub3JlTGF5b3V0ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRyZWVDb250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8QnJlYWtwb2ludFRyZWVFbGVtZW50IHwgbnVsbD4pOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludHNGb2xkZXJJdGVtKSB7XG5cdFx0XHQvLyBGb3IgZm9sZGVyIGl0ZW1zLCBzaG93IGZpbGUtbGV2ZWwgY29udGV4dCBtZW51XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZS5zZXQoJ2JyZWFrcG9pbnRGb2xkZXInKTtcblx0XHRcdGNvbnN0IHsgc2Vjb25kYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBhcmc6IGVsZW1lbnQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KSwgJ2lubGluZScpO1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gc2Vjb25kYXJ5LFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZWxlbWVudFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHlwZSA9IGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50ID8gJ2JyZWFrcG9pbnQnIDogZWxlbWVudCBpbnN0YW5jZW9mIEV4Y2VwdGlvbkJyZWFrcG9pbnQgPyAnZXhjZXB0aW9uQnJlYWtwb2ludCcgOlxuXHRcdFx0ZWxlbWVudCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCA/ICdmdW5jdGlvbkJyZWFrcG9pbnQnIDogZWxlbWVudCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50ID8gJ2RhdGFCcmVha3BvaW50JyA6XG5cdFx0XHRcdGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQgPyAnaW5zdHJ1Y3Rpb25CcmVha3BvaW50JyA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZS5zZXQodHlwZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGNvbnN0IGNvbmRpdGlvblN1cHBvcnRlZCA9IGVsZW1lbnQgaW5zdGFuY2VvZiBFeGNlcHRpb25CcmVha3BvaW50ID8gZWxlbWVudC5zdXBwb3J0c0NvbmRpdGlvbiA6ICghc2Vzc2lvbiB8fCAhIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyk7XG5cdFx0dGhpcy5icmVha3BvaW50U3VwcG9ydHNDb25kaXRpb24uc2V0KGNvbmRpdGlvblN1cHBvcnRlZCk7XG5cdFx0dGhpcy5icmVha3BvaW50SXNEYXRhQnl0ZXMuc2V0KGVsZW1lbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCAmJiBlbGVtZW50LnNyYy50eXBlID09PSBEYXRhQnJlYWtwb2ludFNldFR5cGUuQWRkcmVzcyk7XG5cdFx0dGhpcy5icmVha3BvaW50SGFzTXVsdGlwbGVNb2Rlcy5zZXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50TW9kZXMoZ2V0TW9kZUtpbmRGb3JCcmVha3BvaW50KGVsZW1lbnQgYXMgSUJyZWFrcG9pbnQpKS5sZW5ndGggPiAxKTtcblxuXHRcdGNvbnN0IHsgc2Vjb25kYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBhcmc6IGUuZWxlbWVudCwgc2hvdWxkRm9yd2FyZEFyZ3M6IGZhbHNlIH0pLCAnaW5saW5lJyk7XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHNlY29uZGFyeSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlbGVtZW50XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNpemUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpISk7XG5cblx0XHQvLyBDYWxjdWxhdGUgdmlzaWJsZSByb3cgY291bnQgZnJvbSB0cmVlJ3MgY29udGVudCBoZWlnaHRcblx0XHQvLyBFYWNoIHJvdyBpcyAyMnB4IGhpZ2hcblx0XHRjb25zdCByb3dIZWlnaHQgPSAyMjtcblxuXHRcdHRoaXMubWluaW11bUJvZHlTaXplID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyBNYXRoLm1pbihNQVhfVklTSUJMRV9CUkVBS1BPSU5UUyAqIHJvd0hlaWdodCwgdGhpcy50cmVlLmNvbnRlbnRIZWlnaHQpIDogMTcwO1xuXHRcdHRoaXMubWF4aW11bUJvZHlTaXplID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgJiYgY29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPiAxID8gdGhpcy50cmVlLmNvbnRlbnRIZWlnaHQgOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJyZWFrcG9pbnRzSGludChkZWxheWVkID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGludENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRUeXBlID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb24/LmNvbmZpZ3VyYXRpb24udHlwZTtcblx0XHRjb25zdCBkYmcgPSBjdXJyZW50VHlwZSA/IHRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuZ2V0RGVidWdnZXIoY3VycmVudFR5cGUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBkYmc/LnN0cmluZ3M/LltEZWJ1Z2dlclN0cmluZy5VbnZlcmlmaWVkQnJlYWtwb2ludHNdO1xuXHRcdGNvbnN0IGRlYnVnZ2VySGFzVW52ZXJpZmllZEJwcyA9IG1lc3NhZ2UgJiYgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cygpLmZpbHRlcihicCA9PiB7XG5cdFx0XHRpZiAoYnAudmVyaWZpZWQgfHwgIWJwLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsYW5nSWQgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5ndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoYnAudXJpKTtcblx0XHRcdHJldHVybiBsYW5nSWQgJiYgZGJnLmludGVyZXN0ZWRJbkxhbmd1YWdlKGxhbmdJZCk7XG5cdFx0fSk7XG5cblx0XHRpZiAobWVzc2FnZSAmJiBkZWJ1Z2dlckhhc1VudmVyaWZpZWRCcHM/Lmxlbmd0aCAmJiB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpIHtcblx0XHRcdGlmIChkZWxheWVkKSB7XG5cdFx0XHRcdGNvbnN0IG1kb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBpc1RydXN0ZWQ6IHRydWUgfSkuYXBwZW5kTWFya2Rvd24obWVzc2FnZSk7XG5cdFx0XHRcdHRoaXMuaGludENvbnRhaW5lci5zZXRMYWJlbCgnJCh3YXJuaW5nKScsIHVuZGVmaW5lZCwgeyB0aXRsZTogeyBtYXJrZG93bjogbWRvd24sIG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IG1lc3NhZ2UgfSB9KTtcblx0XHRcdFx0ZG9tLnNob3codGhpcy5oaW50Q29udGFpbmVyLmVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5oaW50RGVsYXllci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLmhpbnRDb250YWluZXIuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkJyZWFrcG9pbnRzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0XHR0aGlzLnNldFRyZWVJbnB1dCgpO1xuXHRcdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVCcmVha3BvaW50c0hpbnQoKTtcblx0XHRcdHRoaXMudXBkYXRlU2l6ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblN0YXRlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0dGhpcy5uZWVkc1N0YXRlQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkVGhyZWFkO1xuXHRcdFx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdFx0XHRpZiAodGhyZWFkICYmIHRocmVhZC5zdG9wcGVkRGV0YWlscyAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMuaGl0QnJlYWtwb2ludElkcyAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMuaGl0QnJlYWtwb2ludElkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGhpdEJyZWFrcG9pbnRJZHMgPSB0aHJlYWQuc3RvcHBlZERldGFpbHMuaGl0QnJlYWtwb2ludElkcztcblx0XHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLmZsYXRFbGVtZW50cztcblx0XHRcdFx0Y29uc3QgaGl0RWxlbWVudCA9IGVsZW1lbnRzLmZpbmQoZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBlLmdldElkRnJvbUFkYXB0ZXIodGhyZWFkLnNlc3Npb24uZ2V0SWQoKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHR5cGVvZiBpZCA9PT0gJ251bWJlcicgJiYgaGl0QnJlYWtwb2ludElkcy5pbmRleE9mKGlkKSAhPT0gLTE7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoaGl0RWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbaGl0RWxlbWVudF0pO1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW2hpdEVsZW1lbnRdKTtcblx0XHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5hdXRvRm9jdXNlZEVsZW1lbnQgPSBoaXRFbGVtZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRcdC8vIERlc2VsZWN0IGJyZWFrcG9pbnQgaW4gYnJlYWtwb2ludCB2aWV3IHdoZW4gbm8gbG9uZ2VyIHN0b3BwZWQgb24gaXQgIzEyNTUyOFxuXHRcdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMudHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGlmICh0aGlzLmF1dG9Gb2N1c2VkRWxlbWVudCAmJiBlcXVhbHMoZm9jdXMsIHNlbGVjdGlvbikgJiYgc2VsZWN0aW9uLmluY2x1ZGVzKHRoaXMuYXV0b0ZvY3VzZWRFbGVtZW50KSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hdXRvRm9jdXNlZEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUJyZWFrcG9pbnRzSGludCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5lZWRzU3RhdGVDaGFuZ2UgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0VHJlZUlucHV0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHRyZWVJbnB1dCA9IHRoaXMuZ2V0VHJlZUVsZW1lbnRzKCk7XG5cdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIHRyZWVJbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyZWVFbGVtZW50cygpOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PEJyZWFrcG9pbnRUcmVlRWxlbWVudD5bXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uPy5nZXRJZCgpO1xuXHRcdGNvbnN0IHNob3dBc1RyZWUgPSB0aGlzLmdldFByZXNlbnRhdGlvbigpID09PSAndHJlZSc7XG5cblx0XHRjb25zdCByZXN1bHQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8QnJlYWtwb2ludFRyZWVFbGVtZW50PltdID0gW107XG5cblx0XHQvLyBFeGNlcHRpb24gYnJlYWtwb2ludHMgYXQgdGhlIHRvcCAocm9vdCBsZXZlbClcblx0XHRmb3IgKGNvbnN0IGV4QnAgb2YgbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKHNlc3Npb25JZCkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgZWxlbWVudDogZXhCcCwgaW5jb21wcmVzc2libGU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gRnVuY3Rpb24gYnJlYWtwb2ludHMgKHJvb3QgbGV2ZWwpXG5cdFx0Zm9yIChjb25zdCBmdW5jQnAgb2YgbW9kZWwuZ2V0RnVuY3Rpb25CcmVha3BvaW50cygpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IGVsZW1lbnQ6IGZ1bmNCcCwgaW5jb21wcmVzc2libGU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGF0YSBicmVha3BvaW50cyAocm9vdCBsZXZlbClcblx0XHRmb3IgKGNvbnN0IGRhdGFCcCBvZiBtb2RlbC5nZXREYXRhQnJlYWtwb2ludHMoKSkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBlbGVtZW50OiBkYXRhQnAsIGluY29tcHJlc3NpYmxlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIFNvdXJjZSBicmVha3BvaW50cyAtIGdyb3VwIGJ5IGZpbGUgaWYgc2hvd0FzVHJlZSBpcyBlbmFibGVkXG5cdFx0Y29uc3Qgc291cmNlQnJlYWtwb2ludHMgPSBtb2RlbC5nZXRCcmVha3BvaW50cygpO1xuXHRcdGlmIChzaG93QXNUcmVlICYmIHNvdXJjZUJyZWFrcG9pbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIEdyb3VwIGJyZWFrcG9pbnRzIGJ5IFVSSVxuXHRcdFx0Y29uc3QgYnJlYWtwb2ludHNCeVVyaSA9IG5ldyBNYXA8c3RyaW5nLCBJQnJlYWtwb2ludFtdPigpO1xuXHRcdFx0Zm9yIChjb25zdCBicCBvZiBzb3VyY2VCcmVha3BvaW50cykge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBicC51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKCFicmVha3BvaW50c0J5VXJpLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0YnJlYWtwb2ludHNCeVVyaS5zZXQoa2V5LCBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWtwb2ludHNCeVVyaS5nZXQoa2V5KSEucHVzaChicCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSBmb2xkZXIgaXRlbXMgZm9yIGVhY2ggZmlsZVxuXHRcdFx0Zm9yIChjb25zdCBbdXJpU3RyLCBicmVha3BvaW50c10gb2YgYnJlYWtwb2ludHNCeVVyaSkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodXJpU3RyKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVySXRlbSA9IG5ldyBCcmVha3BvaW50c0ZvbGRlckl0ZW0odXJpLCBicmVha3BvaW50cyk7XG5cblx0XHRcdFx0Ly8gU29ydCBicmVha3BvaW50cyBieSBsaW5lIG51bWJlclxuXHRcdFx0XHRicmVha3BvaW50cy5zb3J0KChhLCBiKSA9PiBhLmxpbmVOdW1iZXIgLSBiLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PEJyZWFrcG9pbnRUcmVlRWxlbWVudD5bXSA9IGJyZWFrcG9pbnRzLm1hcChicCA9PiAoe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IGJwLFxuXHRcdFx0XHRcdGluY29tcHJlc3NpYmxlOiBmYWxzZVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IGZvbGRlckl0ZW0sXG5cdFx0XHRcdFx0aW5jb21wcmVzc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogdGhpcy5jb2xsYXBzZWRTdGF0ZS5oYXMoZm9sZGVySXRlbS5nZXRJZCgpKSxcblx0XHRcdFx0XHRjaGlsZHJlblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmxhdCBtb2RlIC0ganVzdCBhZGQgYWxsIHNvdXJjZSBicmVha3BvaW50c1xuXHRcdFx0Zm9yIChjb25zdCBicCBvZiBzb3VyY2VCcmVha3BvaW50cykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IGVsZW1lbnQ6IGJwLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbnN0cnVjdGlvbiBicmVha3BvaW50cyAocm9vdCBsZXZlbClcblx0XHRmb3IgKGNvbnN0IGluc3RyQnAgb2YgbW9kZWwuZ2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IGVsZW1lbnQ6IGluc3RyQnAsIGluY29tcHJlc3NpYmxlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCBmbGF0RWxlbWVudHMoKTogQnJlYWtwb2ludEl0ZW1bXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uPy5nZXRJZCgpO1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gKDxSZWFkb25seUFycmF5PElFbmFibGVtZW50Pj5tb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbklkKSkuY29uY2F0KG1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKSkuY29uY2F0KG1vZGVsLmdldERhdGFCcmVha3BvaW50cygpKS5jb25jYXQobW9kZWwuZ2V0QnJlYWtwb2ludHMoKSkuY29uY2F0KG1vZGVsLmdldEluc3RydWN0aW9uQnJlYWtwb2ludHMoKSk7XG5cblx0XHRyZXR1cm4gZWxlbWVudHMgYXMgQnJlYWtwb2ludEl0ZW1bXTtcblx0fVxufVxuXG5jbGFzcyBCcmVha3BvaW50c0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8QnJlYWtwb2ludFRyZWVFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSB2aWV3OiBCcmVha3BvaW50c1ZpZXcpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IEJyZWFrcG9pbnRUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBCcmVha3BvaW50VHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludHNGb2xkZXJJdGVtKSB7XG5cdFx0XHRyZXR1cm4gQnJlYWtwb2ludHNGb2xkZXJSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50KSB7XG5cdFx0XHRyZXR1cm4gQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGNvbnN0IGlucHV0Qm94QnJlYWtwb2ludCA9IHRoaXMudmlldy5pbnB1dEJveERhdGE/LmJyZWFrcG9pbnQ7XG5cdFx0XHRpZiAoIWVsZW1lbnQubmFtZSB8fCAoaW5wdXRCb3hCcmVha3BvaW50ICYmIGlucHV0Qm94QnJlYWtwb2ludC5nZXRJZCgpID09PSBlbGVtZW50LmdldElkKCkpKSB7XG5cdFx0XHRcdHJldHVybiBGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyLklEO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gRnVuY3Rpb25CcmVha3BvaW50c1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEV4Y2VwdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGNvbnN0IGlucHV0Qm94QnJlYWtwb2ludCA9IHRoaXMudmlldy5pbnB1dEJveERhdGE/LmJyZWFrcG9pbnQ7XG5cdFx0XHRpZiAoaW5wdXRCb3hCcmVha3BvaW50ICYmIGlucHV0Qm94QnJlYWtwb2ludC5nZXRJZCgpID09PSBlbGVtZW50LmdldElkKCkpIHtcblx0XHRcdFx0cmV0dXJuIEV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyLklEO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEV4Y2VwdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdGNvbnN0IGlucHV0Qm94QnJlYWtwb2ludCA9IHRoaXMudmlldy5pbnB1dEJveERhdGE/LmJyZWFrcG9pbnQ7XG5cdFx0XHRpZiAoaW5wdXRCb3hCcmVha3BvaW50ICYmIGlucHV0Qm94QnJlYWtwb2ludC5nZXRJZCgpID09PSBlbGVtZW50LmdldElkKCkpIHtcblx0XHRcdFx0cmV0dXJuIERhdGFCcmVha3BvaW50SW5wdXRSZW5kZXJlci5JRDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIERhdGFCcmVha3BvaW50c1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEluc3RydWN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0cmV0dXJuIEluc3RydWN0aW9uQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHRyZXR1cm4gJyc7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElCYXNlQnJlYWtwb2ludFRlbXBsYXRlRGF0YSB7XG5cdGJyZWFrcG9pbnQ6IEhUTUxFbGVtZW50O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0Y2hlY2tib3g6IENoZWNrYm94O1xuXHRjb250ZXh0OiBCcmVha3BvaW50SXRlbTtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGJhZGdlOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElCYXNlQnJlYWtwb2ludFdpdGhJY29uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSUJhc2VCcmVha3BvaW50VGVtcGxhdGVEYXRhIHtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSBleHRlbmRzIElCYXNlQnJlYWtwb2ludFdpdGhJY29uVGVtcGxhdGVEYXRhIHtcblx0ZmlsZVBhdGg6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEge1xuXHRjb25kaXRpb246IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSBleHRlbmRzIElCYXNlQnJlYWtwb2ludFdpdGhJY29uVGVtcGxhdGVEYXRhIHtcblx0Y29uZGl0aW9uOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YSBleHRlbmRzIElCYXNlQnJlYWtwb2ludFdpdGhJY29uVGVtcGxhdGVEYXRhIHtcblx0YWNjZXNzVHlwZTogSFRNTEVsZW1lbnQ7XG5cdGNvbmRpdGlvbjogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhIGV4dGVuZHMgSUJhc2VCcmVha3BvaW50V2l0aEljb25UZW1wbGF0ZURhdGEge1xuXHRhZGRyZXNzOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSB7XG5cdGlucHV0Qm94OiBJbnB1dEJveDtcblx0Y2hlY2tib3g6IENoZWNrYm94O1xuXHRpY29uOiBIVE1MRWxlbWVudDtcblx0YnJlYWtwb2ludDogSUZ1bmN0aW9uQnJlYWtwb2ludDtcblx0dGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0dHlwZTogJ2hpdENvdW50JyB8ICdjb25kaXRpb24nIHwgJ25hbWUnO1xuXHR1cGRhdGluZz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJRGF0YUJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSB7XG5cdGlucHV0Qm94OiBJbnB1dEJveDtcblx0Y2hlY2tib3g6IENoZWNrYm94O1xuXHRpY29uOiBIVE1MRWxlbWVudDtcblx0YnJlYWtwb2ludDogSURhdGFCcmVha3BvaW50O1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0dGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHR0eXBlOiAnaGl0Q291bnQnIHwgJ2NvbmRpdGlvbicgfCAnbmFtZSc7XG5cdHVwZGF0aW5nPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEge1xuXHRpbnB1dEJveDogSW5wdXRCb3g7XG5cdGNoZWNrYm94OiBDaGVja2JveDtcblx0Y3VycmVudEJyZWFrcG9pbnQ/OiBJRXhjZXB0aW9uQnJlYWtwb2ludDtcblx0dGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNoZWNrYm94OiBUcmlTdGF0ZUNoZWNrYm94O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGNvbnRleHQ6IEJyZWFrcG9pbnRzRm9sZGVySXRlbTtcblx0dGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY29uc3QgYnJlYWtwb2ludElkVG9BY3Rpb25CYXJEb21lTm9kZSA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRWxlbWVudD4oKTtcblxuY2xhc3MgQnJlYWtwb2ludHNGb2xkZXJSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8QnJlYWtwb2ludHNGb2xkZXJJdGVtLCB2b2lkLCBJQnJlYWtwb2ludHNGb2xkZXJUZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnYnJlYWtwb2ludEZvbGRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEJyZWFrcG9pbnRzRm9sZGVyUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJQnJlYWtwb2ludHNGb2xkZXJUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblxuXHRcdGRhdGEuY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdicmVha3BvaW50JywgJ2JyZWFrcG9pbnQtZm9sZGVyJyk7XG5cblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYnJlYWtwb2ludCcsICdicmVha3BvaW50LWZvbGRlcicpO1xuXHRcdH0pKTtcblxuXHRcdGRhdGEuY2hlY2tib3ggPSBuZXcgVHJpU3RhdGVDaGVja2JveCgnJywgZmFsc2UsIGRlZmF1bHRDaGVja2JveFN0eWxlcyk7XG5cdFx0ZGF0YS5jaGVja2JveC5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmNoZWNrYm94KTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hlY2tlZCA9IGRhdGEuY2hlY2tib3guY2hlY2tlZDtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBjaGVja2VkID09PSAnbWl4ZWQnID8gdHJ1ZSA6IGNoZWNrZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGJwIG9mIGRhdGEuY29udGV4dC5icmVha3BvaW50cykge1xuXHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGVkLCBicCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZChkYXRhLmNvbnRhaW5lciwgZGF0YS5jaGVja2JveC5kb21Ob2RlKTtcblx0XHRkYXRhLm5hbWUgPSBkb20uYXBwZW5kKGRhdGEuY29udGFpbmVyLCAkKCdzcGFuLm5hbWUnKSk7XG5cdFx0ZG9tLmFwcGVuZChkYXRhLmNvbnRhaW5lciwgJCgnc3Bhbi5maWxlLXBhdGgnKSk7XG5cblx0XHRkYXRhLmFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZGF0YS5jb250YWluZXIpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5hY3Rpb25CYXIpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxCcmVha3BvaW50c0ZvbGRlckl0ZW0sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9sZGVySXRlbSA9IG5vZGUuZWxlbWVudDtcblx0XHRkYXRhLmNvbnRleHQgPSBmb2xkZXJJdGVtO1xuXG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChmb2xkZXJJdGVtLnVyaSk7XG5cdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblxuXHRcdGNvbnN0IGZ1bGxQYXRoID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZm9sZGVySXRlbS51cmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmNvbnRhaW5lciwgZnVsbFBhdGgpKTtcblxuXHRcdC8vIFNldCBjaGVja2JveCBzdGF0ZVxuXHRcdGlmIChmb2xkZXJJdGVtLmluZGV0ZXJtaW5hdGUpIHtcblx0XHRcdGRhdGEuY2hlY2tib3guY2hlY2tlZCA9ICdtaXhlZCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuY2hlY2tib3guY2hlY2tlZCA9IGZvbGRlckl0ZW0uZW5hYmxlZDtcblx0XHR9XG5cblx0XHQvLyBBZGQgcmVtb3ZlIGFjdGlvblxuXHRcdGRhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3QgcmVtb3ZlQWN0aW9uID0gZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQnZGVidWcucmVtb3ZlQnJlYWtwb2ludHNJbkZpbGUnLFxuXHRcdFx0bG9jYWxpemUoJ3JlbW92ZUJyZWFrcG9pbnRzSW5GaWxlJywgXCJSZW1vdmUgQnJlYWtwb2ludHMgaW4gRmlsZVwiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdHRydWUsXG5cdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgYnAgb2YgZm9sZGVySXRlbS5icmVha3BvaW50cykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJwLmdldElkKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIucHVzaChyZW1vdmVBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPEJyZWFrcG9pbnRzRm9sZGVySXRlbT4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBub2RlLmVsZW1lbnQuZWxlbWVudHM7XG5cdFx0Y29uc3QgZm9sZGVySXRlbSA9IGVsZW1lbnRzW2VsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdGRhdGEuY29udGV4dCA9IGZvbGRlckl0ZW07XG5cblx0XHQvLyBGb3IgY29tcHJlc3NlZCBub2Rlcywgc2hvdyB0aGUgY29tYmluZWQgcGF0aFxuXHRcdGNvbnN0IG5hbWVzID0gZWxlbWVudHMubWFwKGUgPT4gcmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkoZS51cmkpKTtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBuYW1lcy5qb2luKCcvJyk7XG5cblx0XHRjb25zdCBmdWxsUGF0aCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGZvbGRlckl0ZW0udXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5jb250YWluZXIsIGZ1bGxQYXRoKSk7XG5cblx0XHQvLyBTZXQgY2hlY2tib3ggc3RhdGVcblx0XHRpZiAoZm9sZGVySXRlbS5pbmRldGVybWluYXRlKSB7XG5cdFx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSAnbWl4ZWQnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBmb2xkZXJJdGVtLmVuYWJsZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHJlbW92ZSBhY3Rpb25cblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGNvbnN0IHJlbW92ZUFjdGlvbiA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J2RlYnVnLnJlbW92ZUJyZWFrcG9pbnRzSW5GaWxlJyxcblx0XHRcdGxvY2FsaXplKCdyZW1vdmVCcmVha3BvaW50c0luRmlsZScsIFwiUmVtb3ZlIEJyZWFrcG9pbnRzIGluIEZpbGVcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHR0cnVlLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGJwIG9mIGZvbGRlckl0ZW0uYnJlYWtwb2ludHMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicC5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLnB1c2gocmVtb3ZlQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxCcmVha3BvaW50c0ZvbGRlckl0ZW0sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8QnJlYWtwb2ludHNGb2xkZXJJdGVtPiwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEJyZWFrcG9pbnRzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElCcmVha3BvaW50LCB2b2lkLCBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbWVudTogSU1lbnUsXG5cdFx0cHJpdmF0ZSBicmVha3BvaW50SGFzTXVsdGlwbGVNb2RlczogSUNvbnRleHRLZXk8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSBicmVha3BvaW50U3VwcG9ydHNDb25kaXRpb246IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludEl0ZW1UeXBlOiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+LFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdicmVha3BvaW50cyc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRhdGE6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHRkYXRhLmJyZWFrcG9pbnQgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2JyZWFrcG9pbnQnKTtcblxuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdicmVha3BvaW50Jyk7XG5cdFx0fSkpO1xuXG5cdFx0ZGF0YS5pY29uID0gJCgnLmljb24nKTtcblx0XHRkYXRhLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3goZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKTtcblxuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5jaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZGF0YS5jb250ZXh0LmVuYWJsZWQsIGRhdGEuY29udGV4dCk7XG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsIGRhdGEuaWNvbik7XG5cdFx0ZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsIGRhdGEuY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRkYXRhLm5hbWUgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5uYW1lJykpO1xuXG5cdFx0ZGF0YS5maWxlUGF0aCA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLmZpbGUtcGF0aCcpKTtcblx0XHRkYXRhLmFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZGF0YS5icmVha3BvaW50KTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuYWN0aW9uQmFyKTtcblx0XHRjb25zdCBiYWRnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCcuYmFkZ2UtY29udGFpbmVyJykpO1xuXHRcdGRhdGEuYmFkZ2UgPSBkb20uYXBwZW5kKGJhZGdlQ29udGFpbmVyLCAkKCdzcGFuLmxpbmUtbnVtYmVyLm1vbmFjby1jb3VudC1iYWRnZScpKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0ZGF0YS5jb250ZXh0ID0gYnJlYWtwb2ludDtcblxuXHRcdGlmIChub2RlLmRlcHRoID4gMSkge1xuXHRcdFx0dGhpcy5yZW5kZXJCcmVha3BvaW50TGluZUxhYmVsKGJyZWFrcG9pbnQsIGRhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbmRlckJyZWFrcG9pbnRGaWxlTGFiZWwoYnJlYWtwb2ludCwgZGF0YSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJCcmVha3BvaW50Q29tbW9uKGJyZWFrcG9pbnQsIGRhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElCcmVha3BvaW50Piwgdm9pZD4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgYnJlYWtwb2ludCA9IG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0ZGF0YS5jb250ZXh0ID0gYnJlYWtwb2ludDtcblx0XHR0aGlzLnJlbmRlckJyZWFrcG9pbnRGaWxlTGFiZWwoYnJlYWtwb2ludCwgZGF0YSk7XG5cdFx0dGhpcy5yZW5kZXJCcmVha3BvaW50Q29tbW9uKGJyZWFrcG9pbnQsIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJCcmVha3BvaW50Q29tbW9uKGJyZWFrcG9pbnQ6IElCcmVha3BvaW50LCBkYXRhOiBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuYnJlYWtwb2ludC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICF0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpO1xuXHRcdGxldCBiYWRnZUNvbnRlbnQgPSBicmVha3BvaW50LmxpbmVOdW1iZXIudG9TdHJpbmcoKTtcblx0XHRpZiAoYnJlYWtwb2ludC5jb2x1bW4pIHtcblx0XHRcdGJhZGdlQ29udGVudCArPSBgOiR7YnJlYWtwb2ludC5jb2x1bW59YDtcblx0XHR9XG5cdFx0aWYgKGJyZWFrcG9pbnQubW9kZUxhYmVsKSB7XG5cdFx0XHRiYWRnZUNvbnRlbnQgPSBgJHticmVha3BvaW50Lm1vZGVMYWJlbH06ICR7YmFkZ2VDb250ZW50fWA7XG5cdFx0fVxuXHRcdGRhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSBiYWRnZUNvbnRlbnQ7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gYnJlYWtwb2ludC5lbmFibGVkO1xuXG5cdFx0Y29uc3QgeyBtZXNzYWdlLCBpY29uIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgYnJlYWtwb2ludCwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmJyZWFrcG9pbnQsIGJyZWFrcG9pbnQubWVzc2FnZSB8fCBtZXNzYWdlIHx8ICcnKSk7XG5cblx0XHRjb25zdCBkZWJ1Z0FjdGl2ZSA9IHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5SdW5uaW5nIHx8IHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkO1xuXHRcdGlmIChkZWJ1Z0FjdGl2ZSAmJiAhYnJlYWtwb2ludC52ZXJpZmllZCkge1xuXHRcdFx0ZGF0YS5icmVha3BvaW50LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLnNldCghc2Vzc2lvbiB8fCAhIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyk7XG5cdFx0dGhpcy5icmVha3BvaW50SXRlbVR5cGUuc2V0KCdicmVha3BvaW50Jyk7XG5cdFx0dGhpcy5icmVha3BvaW50SGFzTXVsdGlwbGVNb2Rlcy5zZXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50TW9kZXMoJ3NvdXJjZScpLmxlbmd0aCA+IDEpO1xuXHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyh0aGlzLm1lbnUuZ2V0QWN0aW9ucyh7IGFyZzogYnJlYWtwb2ludCwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSksICdpbmxpbmUnKTtcblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLnB1c2gocHJpbWFyeSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0YnJlYWtwb2ludElkVG9BY3Rpb25CYXJEb21lTm9kZS5zZXQoYnJlYWtwb2ludC5nZXRJZCgpLCBkYXRhLmFjdGlvbkJhci5kb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQnJlYWtwb2ludEZpbGVMYWJlbChicmVha3BvaW50OiBJQnJlYWtwb2ludCwgZGF0YTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSByZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eShicmVha3BvaW50LnVyaSk7XG5cdFx0ZGF0YS5maWxlUGF0aC50ZXh0Q29udGVudCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlcy5kaXJuYW1lKGJyZWFrcG9pbnQudXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQnJlYWtwb2ludExpbmVMYWJlbChicmVha3BvaW50OiBJQnJlYWtwb2ludCwgZGF0YTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbG9hZGluZycsIFwiTG9hZGluZy4uLlwiKTtcblx0XHRkYXRhLmZpbGVQYXRoLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHR0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoYnJlYWtwb2ludC51cmkpLnRoZW4ocmVmZXJlbmNlID0+IHtcblx0XHRcdGlmIChkYXRhLmNvbnRleHQgIT09IGJyZWFrcG9pbnQpIHtcblx0XHRcdFx0cmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJlZmVyZW5jZSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0aWYgKG1vZGVsICYmIGJyZWFrcG9pbnQubGluZU51bWJlciA8PSBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGJyZWFrcG9pbnQubGluZU51bWJlcikudHJpbSgpO1xuXHRcdFx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBsaW5lQ29udGVudCB8fCBsb2NhbGl6ZSgnZW1wdHlMaW5lJywgXCIoZW1wdHkgbGluZSlcIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbGluZU5vdEZvdW5kJywgXCIobGluZSBub3QgZm91bmQpXCIpO1xuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKCgpID0+IHtcblx0XHRcdGlmIChkYXRhLmNvbnRleHQgPT09IGJyZWFrcG9pbnQpIHtcblx0XHRcdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Nhbm5vdExvYWRMaW5lJywgXCIoY2Fubm90IGxvYWQgbGluZSlcIik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBFeGNlcHRpb25CcmVha3BvaW50c1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJRXhjZXB0aW9uQnJlYWtwb2ludCwgdm9pZCwgSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1lbnU6IElNZW51LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXM6IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRJdGVtVHlwZTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4Y2VwdGlvbmJyZWFrcG9pbnRzJztcblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gRXhjZXB0aW9uQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRXhjZXB0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRkYXRhLmJyZWFrcG9pbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJyZWFrcG9pbnQnKSk7XG5cblx0XHRkYXRhLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3goZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWRhdGEuY29udGV4dC5lbmFibGVkLCBkYXRhLmNvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0ZGF0YS5uYW1lID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4ubmFtZScpKTtcblx0XHRkYXRhLmNvbmRpdGlvbiA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLmNvbmRpdGlvbicpKTtcblx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LmFkZCgnZXhjZXB0aW9uJyk7XG5cblx0XHRkYXRhLmFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZGF0YS5icmVha3BvaW50KTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuYWN0aW9uQmFyKTtcblx0XHRjb25zdCBiYWRnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCcuYmFkZ2UtY29udGFpbmVyJykpO1xuXHRcdGRhdGEuYmFkZ2UgPSBkb20uYXBwZW5kKGJhZGdlQ29udGFpbmVyLCAkKCdzcGFuLmxpbmUtbnVtYmVyLm1vbmFjby1jb3VudC1iYWRnZScpKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUV4Y2VwdGlvbkJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4Y2VwdGlvbkJyZWFrcG9pbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGhpcy5yZW5kZXJFeGNlcHRpb25CcmVha3BvaW50KGV4Y2VwdGlvbkJyZWFrcG9pbnQsIGRhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElFeGNlcHRpb25CcmVha3BvaW50Piwgdm9pZD4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhjZXB0aW9uQnJlYWtwb2ludCA9IG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0dGhpcy5yZW5kZXJFeGNlcHRpb25CcmVha3BvaW50KGV4Y2VwdGlvbkJyZWFrcG9pbnQsIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJFeGNlcHRpb25CcmVha3BvaW50KGV4Y2VwdGlvbkJyZWFrcG9pbnQ6IElFeGNlcHRpb25CcmVha3BvaW50LCBkYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuY29udGV4dCA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQ7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gZXhjZXB0aW9uQnJlYWtwb2ludC5sYWJlbCB8fCBgJHtleGNlcHRpb25CcmVha3BvaW50LmZpbHRlcn0gZXhjZXB0aW9uc2A7XG5cdFx0Y29uc3QgZXhjZXB0aW9uQnJlYWtwb2ludHRpdGxlID0gZXhjZXB0aW9uQnJlYWtwb2ludC52ZXJpZmllZCA/IChleGNlcHRpb25CcmVha3BvaW50LmRlc2NyaXB0aW9uIHx8IGRhdGEubmFtZS50ZXh0Q29udGVudCkgOiBleGNlcHRpb25CcmVha3BvaW50Lm1lc3NhZ2UgfHwgbG9jYWxpemUoJ3VudmVyaWZpZWRFeGNlcHRpb25CcmVha3BvaW50JywgXCJVbnZlcmlmaWVkIEV4Y2VwdGlvbiBCcmVha3BvaW50XCIpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5icmVha3BvaW50LCBleGNlcHRpb25CcmVha3BvaW50dGl0bGUpKTtcblx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhZXhjZXB0aW9uQnJlYWtwb2ludC52ZXJpZmllZCk7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gZXhjZXB0aW9uQnJlYWtwb2ludC5lbmFibGVkO1xuXHRcdGRhdGEuY29uZGl0aW9uLnRleHRDb250ZW50ID0gZXhjZXB0aW9uQnJlYWtwb2ludC5jb25kaXRpb24gfHwgJyc7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmNvbmRpdGlvbiwgbG9jYWxpemUoJ2V4cHJlc3Npb25Db25kaXRpb24nLCBcIkV4cHJlc3Npb24gY29uZGl0aW9uOiB7MH1cIiwgZXhjZXB0aW9uQnJlYWtwb2ludC5jb25kaXRpb24pKSk7XG5cblx0XHRpZiAoZXhjZXB0aW9uQnJlYWtwb2ludC5tb2RlTGFiZWwpIHtcblx0XHRcdGRhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSBleGNlcHRpb25CcmVha3BvaW50Lm1vZGVMYWJlbDtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHR0aGlzLmJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbi5zZXQoKGV4Y2VwdGlvbkJyZWFrcG9pbnQgYXMgRXhjZXB0aW9uQnJlYWtwb2ludCkuc3VwcG9ydHNDb25kaXRpb24pO1xuXHRcdHRoaXMuYnJlYWtwb2ludEl0ZW1UeXBlLnNldCgnZXhjZXB0aW9uQnJlYWtwb2ludCcpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMuc2V0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludE1vZGVzKCdleGNlcHRpb24nKS5sZW5ndGggPiAxKTtcblx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBhcmc6IGV4Y2VwdGlvbkJyZWFrcG9pbnQsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCAnaW5saW5lJyk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdGJyZWFrcG9pbnRJZFRvQWN0aW9uQmFyRG9tZU5vZGUuc2V0KGV4Y2VwdGlvbkJyZWFrcG9pbnQuZ2V0SWQoKSwgZGF0YS5hY3Rpb25CYXIuZG9tTm9kZSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUV4Y2VwdGlvbkJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRXhjZXB0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRnVuY3Rpb25CcmVha3BvaW50c1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxGdW5jdGlvbkJyZWFrcG9pbnQsIHZvaWQsIElGdW5jdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1lbnU6IElNZW51LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRJdGVtVHlwZTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPixcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZnVuY3Rpb25icmVha3BvaW50cyc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEZ1bmN0aW9uQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRnVuY3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0ZGF0YS5icmVha3BvaW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5icmVha3BvaW50JykpO1xuXG5cdFx0ZGF0YS5pY29uID0gJCgnLmljb24nKTtcblx0XHRkYXRhLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3goZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWRhdGEuY29udGV4dC5lbmFibGVkLCBkYXRhLmNvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmljb24pO1xuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0ZGF0YS5uYW1lID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4ubmFtZScpKTtcblx0XHRkYXRhLmNvbmRpdGlvbiA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLmNvbmRpdGlvbicpKTtcblxuXHRcdGRhdGEuYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihkYXRhLmJyZWFrcG9pbnQpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5hY3Rpb25CYXIpO1xuXHRcdGNvbnN0IGJhZGdlQ29udGFpbmVyID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJy5iYWRnZS1jb250YWluZXInKSk7XG5cdFx0ZGF0YS5iYWRnZSA9IGRvbS5hcHBlbmQoYmFkZ2VDb250YWluZXIsICQoJ3NwYW4ubGluZS1udW1iZXIubW9uYWNvLWNvdW50LWJhZGdlJykpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxGdW5jdGlvbkJyZWFrcG9pbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRnVuY3Rpb25CcmVha3BvaW50KG5vZGUuZWxlbWVudCwgZGF0YSk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RnVuY3Rpb25CcmVha3BvaW50Piwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJGdW5jdGlvbkJyZWFrcG9pbnQobm9kZS5lbGVtZW50LmVsZW1lbnRzW25vZGUuZWxlbWVudC5lbGVtZW50cy5sZW5ndGggLSAxXSwgZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckZ1bmN0aW9uQnJlYWtwb2ludChmdW5jdGlvbkJyZWFrcG9pbnQ6IEZ1bmN0aW9uQnJlYWtwb2ludCwgZGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuY29udGV4dCA9IGZ1bmN0aW9uQnJlYWtwb2ludDtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmdW5jdGlvbkJyZWFrcG9pbnQubmFtZTtcblx0XHRjb25zdCB7IGljb24sIG1lc3NhZ2UgfSA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbih0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBmdW5jdGlvbkJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5pY29uLCBtZXNzYWdlID8gbWVzc2FnZSA6ICcnKSk7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gZnVuY3Rpb25CcmVha3BvaW50LmVuYWJsZWQ7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmJyZWFrcG9pbnQsIG1lc3NhZ2UgPyBtZXNzYWdlIDogJycpKTtcblx0XHRpZiAoZnVuY3Rpb25CcmVha3BvaW50LmNvbmRpdGlvbiAmJiBmdW5jdGlvbkJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKSB7XG5cdFx0XHRkYXRhLmNvbmRpdGlvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdleHByZXNzaW9uQW5kSGl0Q291bnQnLCBcIkNvbmRpdGlvbjogezB9IHwgSGl0IENvdW50OiB7MX1cIiwgZnVuY3Rpb25CcmVha3BvaW50LmNvbmRpdGlvbiwgZnVuY3Rpb25CcmVha3BvaW50LmhpdENvbmRpdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuY29uZGl0aW9uLnRleHRDb250ZW50ID0gZnVuY3Rpb25CcmVha3BvaW50LmNvbmRpdGlvbiB8fCBmdW5jdGlvbkJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uIHx8ICcnO1xuXHRcdH1cblxuXHRcdGlmIChmdW5jdGlvbkJyZWFrcG9pbnQubW9kZUxhYmVsKSB7XG5cdFx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gZnVuY3Rpb25CcmVha3BvaW50Lm1vZGVMYWJlbDtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBNYXJrIGZ1bmN0aW9uIGJyZWFrcG9pbnRzIGFzIGRpc2FibGVkIGlmIGRlYWN0aXZhdGVkIG9yIGlmIGRlYnVnIHR5cGUgZG9lcyBub3Qgc3VwcG9ydCB0aGVtICM5MDk5XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGRhdGEuYnJlYWtwb2ludC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIChzZXNzaW9uICYmICFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHMpIHx8ICF0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpO1xuXHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHMpIHtcblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5icmVha3BvaW50LCBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha3BvaW50c05vdFN1cHBvcnRlZCcsIFwiRnVuY3Rpb24gYnJlYWtwb2ludHMgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBkZWJ1ZyB0eXBlXCIpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5icmVha3BvaW50U3VwcG9ydHNDb25kaXRpb24uc2V0KCFzZXNzaW9uIHx8ICEhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZS5zZXQoJ2Z1bmN0aW9uQnJlYWtwb2ludCcpO1xuXHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyh0aGlzLm1lbnUuZ2V0QWN0aW9ucyh7IGFyZzogZnVuY3Rpb25CcmVha3BvaW50LCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSwgJ2lubGluZScpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRicmVha3BvaW50SWRUb0FjdGlvbkJhckRvbWVOb2RlLnNldChmdW5jdGlvbkJyZWFrcG9pbnQuZ2V0SWQoKSwgZGF0YS5hY3Rpb25CYXIuZG9tTm9kZSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8RnVuY3Rpb25CcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxGdW5jdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBEYXRhQnJlYWtwb2ludHNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8RGF0YUJyZWFrcG9pbnQsIHZvaWQsIElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbWVudTogSU1lbnUsXG5cdFx0cHJpdmF0ZSBicmVha3BvaW50SGFzTXVsdGlwbGVNb2RlczogSUNvbnRleHRLZXk8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSBicmVha3BvaW50U3VwcG9ydHNDb25kaXRpb246IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludEl0ZW1UeXBlOiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludElzRGF0YUJ5dGVzOiBJQ29udGV4dEtleTxib29sZWFuIHwgdW5kZWZpbmVkPixcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZGF0YWJyZWFrcG9pbnRzJztcblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gRGF0YUJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURhdGFCcmVha3BvaW50VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJRGF0YUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEuYnJlYWtwb2ludCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYnJlYWtwb2ludCcpKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHRkYXRhLmljb24gPSAkKCcuaWNvbicpO1xuXHRcdGRhdGEuY2hlY2tib3ggPSBjcmVhdGVDaGVja2JveChkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5jaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZGF0YS5jb250ZXh0LmVuYWJsZWQsIGRhdGEuY29udGV4dCk7XG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsIGRhdGEuaWNvbik7XG5cdFx0ZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsIGRhdGEuY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRkYXRhLm5hbWUgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGRhdGEuYWNjZXNzVHlwZSA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLmFjY2Vzcy10eXBlJykpO1xuXHRcdGRhdGEuY29uZGl0aW9uID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4uY29uZGl0aW9uJykpO1xuXG5cdFx0ZGF0YS5hY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGRhdGEuYnJlYWtwb2ludCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmFjdGlvbkJhcik7XG5cdFx0Y29uc3QgYmFkZ2VDb250YWluZXIgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnLmJhZGdlLWNvbnRhaW5lcicpKTtcblx0XHRkYXRhLmJhZGdlID0gZG9tLmFwcGVuZChiYWRnZUNvbnRhaW5lciwgJCgnc3Bhbi5saW5lLW51bWJlci5tb25hY28tY291bnQtYmFkZ2UnKSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPERhdGFCcmVha3BvaW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRGF0YUJyZWFrcG9pbnQobm9kZS5lbGVtZW50LCBkYXRhKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxEYXRhQnJlYWtwb2ludD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSURhdGFCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEYXRhQnJlYWtwb2ludChub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdLCBkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGF0YUJyZWFrcG9pbnQoZGF0YUJyZWFrcG9pbnQ6IERhdGFCcmVha3BvaW50LCBkYXRhOiBJRGF0YUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmNvbnRleHQgPSBkYXRhQnJlYWtwb2ludDtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBkYXRhQnJlYWtwb2ludC5kZXNjcmlwdGlvbjtcblx0XHRjb25zdCB7IGljb24sIG1lc3NhZ2UgfSA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbih0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBkYXRhQnJlYWtwb2ludCwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmljb24sIG1lc3NhZ2UgPyBtZXNzYWdlIDogJycpKTtcblx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBkYXRhQnJlYWtwb2ludC5lbmFibGVkO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5icmVha3BvaW50LCBtZXNzYWdlID8gbWVzc2FnZSA6ICcnKSk7XG5cblx0XHRpZiAoZGF0YUJyZWFrcG9pbnQubW9kZUxhYmVsKSB7XG5cdFx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gZGF0YUJyZWFrcG9pbnQubW9kZUxhYmVsO1xuXHRcdFx0ZGF0YS5iYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5iYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgZGF0YSBicmVha3BvaW50cyBhcyBkaXNhYmxlZCBpZiBkZWFjdGl2YXRlZCBvciBpZiBkZWJ1ZyB0eXBlIGRvZXMgbm90IHN1cHBvcnQgdGhlbVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAoc2Vzc2lvbiAmJiAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEYXRhQnJlYWtwb2ludHMpIHx8ICF0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpO1xuXHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0RhdGFCcmVha3BvaW50cykge1xuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmJyZWFrcG9pbnQsIGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludHNOb3RTdXBwb3J0ZWQnLCBcIkRhdGEgYnJlYWtwb2ludHMgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBkZWJ1ZyB0eXBlXCIpKSk7XG5cdFx0fVxuXHRcdGlmIChkYXRhQnJlYWtwb2ludC5hY2Nlc3NUeXBlKSB7XG5cdFx0XHRjb25zdCBhY2Nlc3NUeXBlID0gZGF0YUJyZWFrcG9pbnQuYWNjZXNzVHlwZSA9PT0gJ3JlYWQnID8gbG9jYWxpemUoJ3JlYWQnLCBcIlJlYWRcIikgOiBkYXRhQnJlYWtwb2ludC5hY2Nlc3NUeXBlID09PSAnd3JpdGUnID8gbG9jYWxpemUoJ3dyaXRlJywgXCJXcml0ZVwiKSA6IGxvY2FsaXplKCdhY2Nlc3MnLCBcIkFjY2Vzc1wiKTtcblx0XHRcdGRhdGEuYWNjZXNzVHlwZS50ZXh0Q29udGVudCA9IGFjY2Vzc1R5cGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuYWNjZXNzVHlwZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdH1cblx0XHRpZiAoZGF0YUJyZWFrcG9pbnQuY29uZGl0aW9uICYmIGRhdGFCcmVha3BvaW50LmhpdENvbmRpdGlvbikge1xuXHRcdFx0ZGF0YS5jb25kaXRpb24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXhwcmVzc2lvbkFuZEhpdENvdW50JywgXCJDb25kaXRpb246IHswfSB8IEhpdCBDb3VudDogezF9XCIsIGRhdGFCcmVha3BvaW50LmNvbmRpdGlvbiwgZGF0YUJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5jb25kaXRpb24udGV4dENvbnRlbnQgPSBkYXRhQnJlYWtwb2ludC5jb25kaXRpb24gfHwgZGF0YUJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uIHx8ICcnO1xuXHRcdH1cblxuXHRcdHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLnNldCghc2Vzc2lvbiB8fCAhIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyk7XG5cdFx0dGhpcy5icmVha3BvaW50SGFzTXVsdGlwbGVNb2Rlcy5zZXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50TW9kZXMoJ2RhdGEnKS5sZW5ndGggPiAxKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZS5zZXQoJ2RhdGFCcmVha3BvaW50Jyk7XG5cdFx0dGhpcy5icmVha3BvaW50SXNEYXRhQnl0ZXMuc2V0KGRhdGFCcmVha3BvaW50LnNyYy50eXBlID09PSBEYXRhQnJlYWtwb2ludFNldFR5cGUuQWRkcmVzcyk7XG5cdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgYXJnOiBkYXRhQnJlYWtwb2ludCwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSksICdpbmxpbmUnKTtcblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLnB1c2gocHJpbWFyeSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0YnJlYWtwb2ludElkVG9BY3Rpb25CYXJEb21lTm9kZS5zZXQoZGF0YUJyZWFrcG9pbnQuZ2V0SWQoKSwgZGF0YS5hY3Rpb25CYXIuZG9tTm9kZSk7XG5cdFx0dGhpcy5icmVha3BvaW50SXNEYXRhQnl0ZXMucmVzZXQoKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxEYXRhQnJlYWtwb2ludCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxEYXRhQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElCYXNlQnJlYWtwb2ludFdpdGhJY29uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEluc3RydWN0aW9uQnJlYWtwb2ludHNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SUluc3RydWN0aW9uQnJlYWtwb2ludCwgdm9pZCwgSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdpbnN0cnVjdGlvbkJyZWFrcG9pbnRzJztcblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gSW5zdHJ1Y3Rpb25CcmVha3BvaW50c1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRhdGE6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRkYXRhLmJyZWFrcG9pbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJyZWFrcG9pbnQnKSk7XG5cblx0XHRkYXRhLmljb24gPSAkKCcuaWNvbicpO1xuXHRcdGRhdGEuY2hlY2tib3ggPSBjcmVhdGVDaGVja2JveChkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5jaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZGF0YS5jb250ZXh0LmVuYWJsZWQsIGRhdGEuY29udGV4dCk7XG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsIGRhdGEuaWNvbik7XG5cdFx0ZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsIGRhdGEuY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRkYXRhLm5hbWUgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5uYW1lJykpO1xuXG5cdFx0ZGF0YS5hZGRyZXNzID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4uZmlsZS1wYXRoJykpO1xuXHRcdGRhdGEuYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihkYXRhLmJyZWFrcG9pbnQpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5hY3Rpb25CYXIpO1xuXHRcdGNvbnN0IGJhZGdlQ29udGFpbmVyID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJy5iYWRnZS1jb250YWluZXInKSk7XG5cdFx0ZGF0YS5iYWRnZSA9IGRvbS5hcHBlbmQoYmFkZ2VDb250YWluZXIsICQoJ3NwYW4ubGluZS1udW1iZXIubW9uYWNvLWNvdW50LWJhZGdlJykpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJSW5zdHJ1Y3Rpb25CcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVySW5zdHJ1Y3Rpb25CcmVha3BvaW50KG5vZGUuZWxlbWVudCwgZGF0YSk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUluc3RydWN0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJJbnN0cnVjdGlvbkJyZWFrcG9pbnQobm9kZS5lbGVtZW50LmVsZW1lbnRzW25vZGUuZWxlbWVudC5lbGVtZW50cy5sZW5ndGggLSAxXSwgZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckluc3RydWN0aW9uQnJlYWtwb2ludChicmVha3BvaW50OiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50LCBkYXRhOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5jb250ZXh0ID0gYnJlYWtwb2ludDtcblx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblxuXHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9ICcweCcgKyBicmVha3BvaW50LmFkZHJlc3MudG9TdHJpbmcoMTYpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5uYW1lLCBsb2NhbGl6ZSgnZGVidWcuZGVjaW1hbC5hZGRyZXNzJywgXCJEZWNpbWFsIEFkZHJlc3M6IHswfVwiLCBicmVha3BvaW50LmFkZHJlc3MudG9TdHJpbmcoKSkpKTtcblx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBicmVha3BvaW50LmVuYWJsZWQ7XG5cblx0XHRjb25zdCB7IG1lc3NhZ2UsIGljb24gfSA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbih0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBicmVha3BvaW50LCB0aGlzLmxhYmVsU2VydmljZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKSk7XG5cdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuYnJlYWtwb2ludCwgYnJlYWtwb2ludC5tZXNzYWdlIHx8IG1lc3NhZ2UgfHwgJycpKTtcblxuXHRcdGNvbnN0IGRlYnVnQWN0aXZlID0gdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUgPT09IFN0YXRlLlJ1bm5pbmcgfHwgdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQ7XG5cdFx0aWYgKGRlYnVnQWN0aXZlICYmICFicmVha3BvaW50LnZlcmlmaWVkKSB7XG5cdFx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHR9XG5cblx0XHRpZiAoYnJlYWtwb2ludC5tb2RlTGFiZWwpIHtcblx0XHRcdGRhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSBicmVha3BvaW50Lm1vZGVMYWJlbDtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUluc3RydWN0aW9uQnJlYWtwb2ludCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUluc3RydWN0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEZ1bmN0aW9uQnJlYWtwb2ludElucHV0UmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElGdW5jdGlvbkJyZWFrcG9pbnQsIHZvaWQsIElGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdmlldzogQnJlYWtwb2ludHNWaWV3LFxuXHRcdHByaXZhdGUgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2Z1bmN0aW9uYnJlYWtwb2ludGlucHV0JztcblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gRnVuY3Rpb25CcmVha3BvaW50SW5wdXRSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHRlbXBsYXRlOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGJyZWFrcG9pbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJyZWFrcG9pbnQnKSk7XG5cdFx0dGVtcGxhdGUuaWNvbiA9ICQoJy5pY29uJyk7XG5cdFx0dGVtcGxhdGUuY2hlY2tib3ggPSBjcmVhdGVDaGVja2JveCh0b0Rpc3Bvc2UpO1xuXG5cdFx0ZG9tLmFwcGVuZChicmVha3BvaW50LCB0ZW1wbGF0ZS5pY29uKTtcblx0XHRkb20uYXBwZW5kKGJyZWFrcG9pbnQsIHRlbXBsYXRlLmNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdHRoaXMudmlldy5icmVha3BvaW50SW5wdXRGb2N1c2VkLnNldCh0cnVlKTtcblx0XHRjb25zdCBpbnB1dEJveENvbnRhaW5lciA9IGRvbS5hcHBlbmQoYnJlYWtwb2ludCwgJCgnLmlucHV0Qm94Q29udGFpbmVyJykpO1xuXG5cblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChpbnB1dEJveENvbnRhaW5lciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHsgaW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9KTtcblxuXHRcdHRvRGlzcG9zZS5hZGQoaW5wdXRCb3gpO1xuXG5cdFx0Y29uc3Qgd3JhcFVwID0gKHN1Y2Nlc3M6IGJvb2xlYW4pID0+IHtcblx0XHRcdHRlbXBsYXRlLnVwZGF0aW5nID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMudmlldy5icmVha3BvaW50SW5wdXRGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0XHRcdGNvbnN0IGlkID0gdGVtcGxhdGUuYnJlYWtwb2ludC5nZXRJZCgpO1xuXG5cdFx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdFx0aWYgKHRlbXBsYXRlLnR5cGUgPT09ICduYW1lJykge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UudXBkYXRlRnVuY3Rpb25CcmVha3BvaW50KGlkLCB7IG5hbWU6IGlucHV0Qm94LnZhbHVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGVtcGxhdGUudHlwZSA9PT0gJ2NvbmRpdGlvbicpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludChpZCwgeyBjb25kaXRpb246IGlucHV0Qm94LnZhbHVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGVtcGxhdGUudHlwZSA9PT0gJ2hpdENvdW50Jykge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UudXBkYXRlRnVuY3Rpb25CcmVha3BvaW50KGlkLCB7IGhpdENvbmRpdGlvbjogaW5wdXRCb3gudmFsdWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh0ZW1wbGF0ZS50eXBlID09PSAnbmFtZScgJiYgIXRlbXBsYXRlLmJyZWFrcG9pbnQubmFtZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhpZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMudmlldy5yZW5kZXJJbnB1dEJveCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGVtcGxhdGUudXBkYXRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dG9EaXNwb3NlLmFkZChkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCAna2V5ZG93bicsIChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNFc2NhcGUgPSBlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSk7XG5cdFx0XHRjb25zdCBpc0VudGVyID0gZS5lcXVhbHMoS2V5Q29kZS5FbnRlcik7XG5cdFx0XHRpZiAoaXNFc2NhcGUgfHwgaXNFbnRlcikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHdyYXBVcChpc0VudGVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dG9EaXNwb3NlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgJ2JsdXInLCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRlbXBsYXRlLnVwZGF0aW5nKSB7XG5cdFx0XHRcdHdyYXBVcCghIWlucHV0Qm94LnZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZS5pbnB1dEJveCA9IGlucHV0Qm94O1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0ZW1wbGF0ZS50ZW1wbGF0ZURpc3Bvc2FibGVzID0gdG9EaXNwb3NlO1xuXHRcdHRlbXBsYXRlLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8RnVuY3Rpb25CcmVha3BvaW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGZ1bmN0aW9uQnJlYWtwb2ludCA9IG5vZGUuZWxlbWVudDtcblx0XHRkYXRhLmJyZWFrcG9pbnQgPSBmdW5jdGlvbkJyZWFrcG9pbnQ7XG5cdFx0ZGF0YS50eXBlID0gdGhpcy52aWV3LmlucHV0Qm94RGF0YT8udHlwZSB8fCAnbmFtZSc7IC8vIElmIHRoZXJlIGlzIG5vIHR5cGUgc2V0IHRha2UgdGhlICduYW1lJyBhcyB0aGUgZGVmYXVsdFxuXHRcdGNvbnN0IHsgaWNvbiwgbWVzc2FnZSB9ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCksIGZ1bmN0aW9uQnJlYWtwb2ludCwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXG5cdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuaWNvbiwgbWVzc2FnZSA/IG1lc3NhZ2UgOiAnJykpO1xuXHRcdGRhdGEuY2hlY2tib3guY2hlY2tlZCA9IGZ1bmN0aW9uQnJlYWtwb2ludC5lbmFibGVkO1xuXHRcdGRhdGEuY2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSBmdW5jdGlvbkJyZWFrcG9pbnQubmFtZSB8fCAnJztcblxuXHRcdGxldCBwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdmdW5jdGlvbkJyZWFrcG9pbnRQbGFjZWhvbGRlcicsIFwiRnVuY3Rpb24gdG8gYnJlYWsgb25cIik7XG5cdFx0bGV0IGFyaWFMYWJlbCA9IGxvY2FsaXplKCdmdW5jdGlvbkJyZWFrUG9pbnRJbnB1dEFyaWFMYWJlbCcsIFwiVHlwZSBmdW5jdGlvbiBicmVha3BvaW50LlwiKTtcblx0XHRpZiAoZGF0YS50eXBlID09PSAnY29uZGl0aW9uJykge1xuXHRcdFx0ZGF0YS5pbnB1dEJveC52YWx1ZSA9IGZ1bmN0aW9uQnJlYWtwb2ludC5jb25kaXRpb24gfHwgJyc7XG5cdFx0XHRwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdmdW5jdGlvbkJyZWFrcG9pbnRFeHByZXNzaW9uUGxhY2Vob2xkZXInLCBcIkJyZWFrIHdoZW4gZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZVwiKTtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdmdW5jdGlvbkJyZWFrUG9pbnRFeHByZXNpb25BcmlhTGFiZWwnLCBcIlR5cGUgZXhwcmVzc2lvbi4gRnVuY3Rpb24gYnJlYWtwb2ludCB3aWxsIGJyZWFrIHdoZW4gZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZVwiKTtcblx0XHR9IGVsc2UgaWYgKGRhdGEudHlwZSA9PT0gJ2hpdENvdW50Jykge1xuXHRcdFx0ZGF0YS5pbnB1dEJveC52YWx1ZSA9IGZ1bmN0aW9uQnJlYWtwb2ludC5oaXRDb25kaXRpb24gfHwgJyc7XG5cdFx0XHRwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdmdW5jdGlvbkJyZWFrcG9pbnRIaXRDb3VudFBsYWNlaG9sZGVyJywgXCJCcmVhayB3aGVuIGhpdCBjb3VudCBpcyBtZXRcIik7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha1BvaW50SGl0Q291bnRBcmlhTGFiZWwnLCBcIlR5cGUgaGl0IGNvdW50LiBGdW5jdGlvbiBicmVha3BvaW50IHdpbGwgYnJlYWsgd2hlbiBoaXQgY291bnQgaXMgbWV0LlwiKTtcblx0XHR9XG5cdFx0ZGF0YS5pbnB1dEJveC5zZXRBcmlhTGFiZWwoYXJpYUxhYmVsKTtcblx0XHRkYXRhLmlucHV0Qm94LnNldFBsYWNlSG9sZGVyKHBsYWNlaG9sZGVyKTtcblxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0ZGF0YS5pbnB1dEJveC5mb2N1cygpO1xuXHRcdFx0ZGF0YS5pbnB1dEJveC5zZWxlY3QoKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRnVuY3Rpb25CcmVha3BvaW50Piwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBGdW5jdGlvbiBicmVha3BvaW50cyBhcmUgbm90IGNvbXByZXNzaWJsZVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElGdW5jdGlvbkJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUZ1bmN0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBEYXRhQnJlYWtwb2ludElucHV0UmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElEYXRhQnJlYWtwb2ludCwgdm9pZCwgSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXc6IEJyZWFrcG9pbnRzVmlldyxcblx0XHRwcml2YXRlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRwcml2YXRlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHsgfVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdkYXRhYnJlYWtwb2ludGlucHV0JztcblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gRGF0YUJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEYXRhQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0ZW1wbGF0ZTogSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGJyZWFrcG9pbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJyZWFrcG9pbnQnKSk7XG5cdFx0dGVtcGxhdGUuaWNvbiA9ICQoJy5pY29uJyk7XG5cdFx0dGVtcGxhdGUuY2hlY2tib3ggPSBjcmVhdGVDaGVja2JveCh0b0Rpc3Bvc2UpO1xuXG5cdFx0ZG9tLmFwcGVuZChicmVha3BvaW50LCB0ZW1wbGF0ZS5pY29uKTtcblx0XHRkb20uYXBwZW5kKGJyZWFrcG9pbnQsIHRlbXBsYXRlLmNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdHRoaXMudmlldy5icmVha3BvaW50SW5wdXRGb2N1c2VkLnNldCh0cnVlKTtcblx0XHRjb25zdCBpbnB1dEJveENvbnRhaW5lciA9IGRvbS5hcHBlbmQoYnJlYWtwb2ludCwgJCgnLmlucHV0Qm94Q29udGFpbmVyJykpO1xuXG5cblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChpbnB1dEJveENvbnRhaW5lciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHsgaW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9KTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblxuXHRcdGNvbnN0IHdyYXBVcCA9IChzdWNjZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS51cGRhdGluZyA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnZpZXcuYnJlYWtwb2ludElucHV0Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRjb25zdCBpZCA9IHRlbXBsYXRlLmJyZWFrcG9pbnQuZ2V0SWQoKTtcblxuXHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdGlmICh0ZW1wbGF0ZS50eXBlID09PSAnY29uZGl0aW9uJykge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UudXBkYXRlRGF0YUJyZWFrcG9pbnQoaWQsIHsgY29uZGl0aW9uOiBpbnB1dEJveC52YWx1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRlbXBsYXRlLnR5cGUgPT09ICdoaXRDb3VudCcpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZURhdGFCcmVha3BvaW50KGlkLCB7IGhpdENvbmRpdGlvbjogaW5wdXRCb3gudmFsdWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudmlldy5yZW5kZXJJbnB1dEJveCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0ZW1wbGF0ZS51cGRhdGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0b0Rpc3Bvc2UuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsICdrZXlkb3duJywgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBpc0VzY2FwZSA9IGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKTtcblx0XHRcdGNvbnN0IGlzRW50ZXIgPSBlLmVxdWFscyhLZXlDb2RlLkVudGVyKTtcblx0XHRcdGlmIChpc0VzY2FwZSB8fCBpc0VudGVyKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0d3JhcFVwKGlzRW50ZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCAnYmx1cicsICgpID0+IHtcblx0XHRcdGlmICghdGVtcGxhdGUudXBkYXRpbmcpIHtcblx0XHRcdFx0d3JhcFVwKCEhaW5wdXRCb3gudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRlbXBsYXRlLmlucHV0Qm94ID0gaW5wdXRCb3g7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRlbXBsYXRlLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSB0b0Rpc3Bvc2U7XG5cdFx0dGVtcGxhdGUudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxEYXRhQnJlYWtwb2ludCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJRGF0YUJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGFCcmVha3BvaW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGRhdGEuYnJlYWtwb2ludCA9IGRhdGFCcmVha3BvaW50O1xuXHRcdGRhdGEudHlwZSA9IHRoaXMudmlldy5pbnB1dEJveERhdGE/LnR5cGUgfHwgJ2NvbmRpdGlvbic7IC8vIElmIHRoZXJlIGlzIG5vIHR5cGUgc2V0IHRha2UgdGhlICdjb25kaXRpb24nIGFzIHRoZSBkZWZhdWx0XG5cdFx0Y29uc3QgeyBpY29uLCBtZXNzYWdlIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgZGF0YUJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblxuXHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmljb24sIG1lc3NhZ2UgPz8gJycpKTtcblx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBkYXRhQnJlYWtwb2ludC5lbmFibGVkO1xuXHRcdGRhdGEuY2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSAnJztcblx0XHRsZXQgcGxhY2Vob2xkZXIgPSAnJztcblx0XHRsZXQgYXJpYUxhYmVsID0gJyc7XG5cdFx0aWYgKGRhdGEudHlwZSA9PT0gJ2NvbmRpdGlvbicpIHtcblx0XHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSBkYXRhQnJlYWtwb2ludC5jb25kaXRpb24gfHwgJyc7XG5cdFx0XHRwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludEV4cHJlc3Npb25QbGFjZWhvbGRlcicsIFwiQnJlYWsgd2hlbiBleHByZXNzaW9uIGV2YWx1YXRlcyB0byB0cnVlXCIpO1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2RhdGFCcmVha1BvaW50RXhwcmVzaW9uQXJpYUxhYmVsJywgXCJUeXBlIGV4cHJlc3Npb24uIERhdGEgYnJlYWtwb2ludCB3aWxsIGJyZWFrIHdoZW4gZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZVwiKTtcblx0XHR9IGVsc2UgaWYgKGRhdGEudHlwZSA9PT0gJ2hpdENvdW50Jykge1xuXHRcdFx0ZGF0YS5pbnB1dEJveC52YWx1ZSA9IGRhdGFCcmVha3BvaW50LmhpdENvbmRpdGlvbiB8fCAnJztcblx0XHRcdHBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2RhdGFCcmVha3BvaW50SGl0Q291bnRQbGFjZWhvbGRlcicsIFwiQnJlYWsgd2hlbiBoaXQgY291bnQgaXMgbWV0XCIpO1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2RhdGFCcmVha1BvaW50SGl0Q291bnRBcmlhTGFiZWwnLCBcIlR5cGUgaGl0IGNvdW50LiBEYXRhIGJyZWFrcG9pbnQgd2lsbCBicmVhayB3aGVuIGhpdCBjb3VudCBpcyBtZXQuXCIpO1xuXHRcdH1cblx0XHRkYXRhLmlucHV0Qm94LnNldEFyaWFMYWJlbChhcmlhTGFiZWwpO1xuXHRcdGRhdGEuaW5wdXRCb3guc2V0UGxhY2VIb2xkZXIocGxhY2Vob2xkZXIpO1xuXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRkYXRhLmlucHV0Qm94LmZvY3VzKCk7XG5cdFx0XHRkYXRhLmlucHV0Qm94LnNlbGVjdCgpO1xuXHRcdH0sIDApO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElEYXRhQnJlYWtwb2ludD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBEYXRhIGJyZWFrcG9pbnRzIGFyZSBub3QgY29tcHJlc3NpYmxlXG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SURhdGFCcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRGF0YUJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SURhdGFCcmVha3BvaW50Piwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRGF0YUJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBFeGNlcHRpb25CcmVha3BvaW50SW5wdXRSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SUV4Y2VwdGlvbkJyZWFrcG9pbnQsIHZvaWQsIElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXc6IEJyZWFrcG9pbnRzVmlldyxcblx0XHRwcml2YXRlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRwcml2YXRlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0KSB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4Y2VwdGlvbmJyZWFrcG9pbnRpbnB1dCc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGJyZWFrcG9pbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJyZWFrcG9pbnQnKSk7XG5cdFx0YnJlYWtwb2ludC5jbGFzc0xpc3QuYWRkKCdleGNlcHRpb24nKTtcblx0XHRjb25zdCBjaGVja2JveCA9IGNyZWF0ZUNoZWNrYm94KHRvRGlzcG9zZSk7XG5cblx0XHRkb20uYXBwZW5kKGJyZWFrcG9pbnQsIGNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdHRoaXMudmlldy5icmVha3BvaW50SW5wdXRGb2N1c2VkLnNldCh0cnVlKTtcblx0XHRjb25zdCBpbnB1dEJveENvbnRhaW5lciA9IGRvbS5hcHBlbmQoYnJlYWtwb2ludCwgJCgnLmlucHV0Qm94Q29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGlucHV0Qm94ID0gbmV3IElucHV0Qm94KGlucHV0Qm94Q29udGFpbmVyLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnZXhjZXB0aW9uQnJlYWtwb2ludEFyaWFMYWJlbCcsIFwiVHlwZSBleGNlcHRpb24gYnJlYWtwb2ludCBjb25kaXRpb25cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzXG5cdFx0fSk7XG5cblxuXHRcdHRvRGlzcG9zZS5hZGQoaW5wdXRCb3gpO1xuXHRcdGNvbnN0IHdyYXBVcCA9IChzdWNjZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoIXRlbXBsYXRlRGF0YS5jdXJyZW50QnJlYWtwb2ludCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudmlldy5icmVha3BvaW50SW5wdXRGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0XHRsZXQgbmV3Q29uZGl0aW9uID0gdGVtcGxhdGVEYXRhLmN1cnJlbnRCcmVha3BvaW50LmNvbmRpdGlvbjtcblx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdG5ld0NvbmRpdGlvbiA9IGlucHV0Qm94LnZhbHVlICE9PSAnJyA/IGlucHV0Qm94LnZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2Uuc2V0RXhjZXB0aW9uQnJlYWtwb2ludENvbmRpdGlvbih0ZW1wbGF0ZURhdGEuY3VycmVudEJyZWFrcG9pbnQsIG5ld0NvbmRpdGlvbik7XG5cdFx0fTtcblxuXHRcdHRvRGlzcG9zZS5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGlzRXNjYXBlID0gZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpO1xuXHRcdFx0Y29uc3QgaXNFbnRlciA9IGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpO1xuXHRcdFx0aWYgKGlzRXNjYXBlIHx8IGlzRW50ZXIpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR3cmFwVXAoaXNFbnRlcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRvRGlzcG9zZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsICdibHVyJywgKCkgPT4ge1xuXHRcdFx0Ly8gTmVlZCB0byByZWFjdCB3aXRoIGEgdGltZW91dCBvbiB0aGUgYmx1ciBldmVudCBkdWUgdG8gcG9zc2libGUgY29uY3VyZW50IHNwbGljZXMgIzU2NDQzXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0d3JhcFVwKHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRvRGlzcG9zZS5hZGQoZWxlbWVudERpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSA9IHtcblx0XHRcdGlucHV0Qm94LFxuXHRcdFx0Y2hlY2tib3gsXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzOiB0b0Rpc3Bvc2UsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSxcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlRGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPEV4Y2VwdGlvbkJyZWFrcG9pbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4Y2VwdGlvbkJyZWFrcG9pbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0Y29uc3QgcGxhY2VIb2xkZXIgPSBleGNlcHRpb25CcmVha3BvaW50LmNvbmRpdGlvbkRlc2NyaXB0aW9uIHx8IGxvY2FsaXplKCdleGNlcHRpb25CcmVha3BvaW50UGxhY2Vob2xkZXInLCBcIkJyZWFrIHdoZW4gZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZVwiKTtcblx0XHRkYXRhLmlucHV0Qm94LnNldFBsYWNlSG9sZGVyKHBsYWNlSG9sZGVyKTtcblx0XHRkYXRhLmN1cnJlbnRCcmVha3BvaW50ID0gZXhjZXB0aW9uQnJlYWtwb2ludDtcblx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBleGNlcHRpb25CcmVha3BvaW50LmVuYWJsZWQ7XG5cdFx0ZGF0YS5jaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0ZGF0YS5pbnB1dEJveC52YWx1ZSA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQuY29uZGl0aW9uIHx8ICcnO1xuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0ZGF0YS5pbnB1dEJveC5mb2N1cygpO1xuXHRcdFx0ZGF0YS5pbnB1dEJveC5zZWxlY3QoKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRXhjZXB0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIEV4Y2VwdGlvbiBicmVha3BvaW50cyBhcmUgbm90IGNvbXByZXNzaWJsZVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeGNlcHRpb25CcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRXhjZXB0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEJyZWFrcG9pbnRzQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8QnJlYWtwb2ludFRyZWVFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2JyZWFrcG9pbnRzJywgXCJCcmVha3BvaW50c1wiKTtcblx0fVxuXG5cdGdldFJvbGUoKTogQXJpYVJvbGUge1xuXHRcdHJldHVybiAnY2hlY2tib3gnO1xuXHR9XG5cblx0aXNDaGVja2VkKGVsZW1lbnQ6IEJyZWFrcG9pbnRUcmVlRWxlbWVudCkge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludHNGb2xkZXJJdGVtKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5lbmFibGVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudC5lbmFibGVkO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IEJyZWFrcG9pbnRUcmVlRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludHNGb2xkZXJJdGVtKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2JyZWFrcG9pbnRGb2xkZXInLCBcIkJyZWFrcG9pbnRzIGluIHswfSwgezF9IGJyZWFrcG9pbnRzXCIsIHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KGVsZW1lbnQudXJpKSwgZWxlbWVudC5icmVha3BvaW50cy5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRXhjZXB0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IG1lc3NhZ2UgfSA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbih0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBlbGVtZW50IGFzIElCcmVha3BvaW50IHwgSURhdGFCcmVha3BvaW50IHwgSUZ1bmN0aW9uQnJlYWtwb2ludCwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXHRcdGNvbnN0IHRvU3RyaW5nID0gZWxlbWVudC50b1N0cmluZygpO1xuXG5cdFx0cmV0dXJuIG1lc3NhZ2UgPyBgJHt0b1N0cmluZ30sICR7bWVzc2FnZX1gIDogdG9TdHJpbmc7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5CcmVha3BvaW50U291cmNlKGJyZWFrcG9pbnQ6IElCcmVha3BvaW50LCBzaWRlQnlTaWRlOiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBwaW5uZWQ6IGJvb2xlYW4sIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSwgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdGlmIChicmVha3BvaW50LnVyaS5zY2hlbWUgPT09IERFQlVHX1NDSEVNRSAmJiBkZWJ1Z1NlcnZpY2Uuc3RhdGUgPT09IFN0YXRlLkluYWN0aXZlKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0Y29uc3Qgc2VsZWN0aW9uID0gYnJlYWtwb2ludC5lbmRMaW5lTnVtYmVyID8ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogYnJlYWtwb2ludC5saW5lTnVtYmVyLFxuXHRcdGVuZExpbmVOdW1iZXI6IGJyZWFrcG9pbnQuZW5kTGluZU51bWJlcixcblx0XHRzdGFydENvbHVtbjogYnJlYWtwb2ludC5jb2x1bW4gfHwgMSxcblx0XHRlbmRDb2x1bW46IGJyZWFrcG9pbnQuZW5kQ29sdW1uIHx8IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSXG5cdH0gOiB7XG5cdFx0c3RhcnRMaW5lTnVtYmVyOiBicmVha3BvaW50LmxpbmVOdW1iZXIsXG5cdFx0c3RhcnRDb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uIHx8IDEsXG5cdFx0ZW5kTGluZU51bWJlcjogYnJlYWtwb2ludC5saW5lTnVtYmVyLFxuXHRcdGVuZENvbHVtbjogYnJlYWtwb2ludC5jb2x1bW4gfHwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVJcblx0fTtcblxuXHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRyZXNvdXJjZTogYnJlYWtwb2ludC51cmksXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0cHJlc2VydmVGb2N1cyxcblx0XHRcdHNlbGVjdGlvbixcblx0XHRcdHJldmVhbElmT3BlbmVkOiB0cnVlLFxuXHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQsXG5cdFx0XHRwaW5uZWRcblx0XHR9XG5cdH0sIHNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbihzdGF0ZTogU3RhdGUsIGJyZWFrcG9pbnRzQWN0aXZhdGVkOiBib29sZWFuLCBicmVha3BvaW50OiBCcmVha3BvaW50SXRlbSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBkZWJ1Z01vZGVsOiBJRGVidWdNb2RlbCk6IHsgbWVzc2FnZT86IHN0cmluZzsgaWNvbjogVGhlbWVJY29uOyBzaG93QWRhcHRlclVudmVyaWZpZWRNZXNzYWdlPzogYm9vbGVhbiB9IHtcblx0Y29uc3QgZGVidWdBY3RpdmUgPSBzdGF0ZSA9PT0gU3RhdGUuUnVubmluZyB8fCBzdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZDtcblxuXHRjb25zdCBicmVha3BvaW50SWNvbiA9IGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCA/IGljb25zLmRhdGFCcmVha3BvaW50IDogYnJlYWtwb2ludCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCA/IGljb25zLmZ1bmN0aW9uQnJlYWtwb2ludCA6IGJyZWFrcG9pbnQubG9nTWVzc2FnZSA/IGljb25zLmxvZ0JyZWFrcG9pbnQgOiBpY29ucy5icmVha3BvaW50O1xuXG5cdGlmICghYnJlYWtwb2ludC5lbmFibGVkIHx8ICFicmVha3BvaW50c0FjdGl2YXRlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi5kaXNhYmxlZCxcblx0XHRcdG1lc3NhZ2U6IGJyZWFrcG9pbnQubG9nTWVzc2FnZSA/IGxvY2FsaXplKCdkaXNhYmxlZExvZ3BvaW50JywgXCJEaXNhYmxlZCBMb2dwb2ludFwiKSA6IGxvY2FsaXplKCdkaXNhYmxlZEJyZWFrcG9pbnQnLCBcIkRpc2FibGVkIEJyZWFrcG9pbnRcIiksXG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IGFwcGVuZE1lc3NhZ2UgPSAodGV4dDogc3RyaW5nKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gYnJlYWtwb2ludC5tZXNzYWdlID8gdGV4dC5jb25jYXQoJywgJyArIGJyZWFrcG9pbnQubWVzc2FnZSkgOiB0ZXh0O1xuXHR9O1xuXG5cdGlmIChkZWJ1Z0FjdGl2ZSAmJiBicmVha3BvaW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCAmJiBicmVha3BvaW50LnBlbmRpbmcpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbjogaWNvbnMuYnJlYWtwb2ludC5wZW5kaW5nXG5cdFx0fTtcblx0fVxuXG5cdGlmIChkZWJ1Z0FjdGl2ZSAmJiAhYnJlYWtwb2ludC52ZXJpZmllZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi51bnZlcmlmaWVkLFxuXHRcdFx0bWVzc2FnZTogYnJlYWtwb2ludC5tZXNzYWdlID8gYnJlYWtwb2ludC5tZXNzYWdlIDogKGJyZWFrcG9pbnQubG9nTWVzc2FnZSA/IGxvY2FsaXplKCd1bnZlcmlmaWVkTG9ncG9pbnQnLCBcIlVudmVyaWZpZWQgTG9ncG9pbnRcIikgOiBsb2NhbGl6ZSgndW52ZXJpZmllZEJyZWFrcG9pbnQnLCBcIlVudmVyaWZpZWQgQnJlYWtwb2ludFwiKSksXG5cdFx0XHRzaG93QWRhcHRlclVudmVyaWZpZWRNZXNzYWdlOiB0cnVlXG5cdFx0fTtcblx0fVxuXG5cdGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQpIHtcblx0XHRpZiAoIWJyZWFrcG9pbnQuc3VwcG9ydGVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi51bnZlcmlmaWVkLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRVbnN1cHBvcnRlZCcsIFwiRGF0YSBicmVha3BvaW50cyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgdHlwZVwiKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGljb246IGJyZWFrcG9pbnRJY29uLnJlZ3VsYXIsXG5cdFx0XHRtZXNzYWdlOiBicmVha3BvaW50Lm1lc3NhZ2UgfHwgbG9jYWxpemUoJ2RhdGFCcmVha3BvaW50JywgXCJEYXRhIEJyZWFrcG9pbnRcIilcblx0XHR9O1xuXHR9XG5cblx0aWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRpZiAoIWJyZWFrcG9pbnQuc3VwcG9ydGVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi51bnZlcmlmaWVkLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha3BvaW50VW5zdXBwb3J0ZWQnLCBcIkZ1bmN0aW9uIGJyZWFrcG9pbnRzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBkZWJ1ZyB0eXBlXCIpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bWVzc2FnZXMucHVzaChicmVha3BvaW50Lm1lc3NhZ2UgfHwgbG9jYWxpemUoJ2Z1bmN0aW9uQnJlYWtwb2ludCcsIFwiRnVuY3Rpb24gQnJlYWtwb2ludFwiKSk7XG5cdFx0aWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCdleHByZXNzaW9uJywgXCJDb25kaXRpb246IHswfVwiLCBicmVha3BvaW50LmNvbmRpdGlvbikpO1xuXHRcdH1cblx0XHRpZiAoYnJlYWtwb2ludC5oaXRDb25kaXRpb24pIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2hpdENvdW50JywgXCJIaXQgQ291bnQ6IHswfVwiLCBicmVha3BvaW50LmhpdENvbmRpdGlvbikpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi5yZWd1bGFyLFxuXHRcdFx0bWVzc2FnZTogYXBwZW5kTWVzc2FnZShtZXNzYWdlcy5qb2luKCdcXG4nKSlcblx0XHR9O1xuXHR9XG5cblx0aWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRpZiAoIWJyZWFrcG9pbnQuc3VwcG9ydGVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi51bnZlcmlmaWVkLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25CcmVha3BvaW50VW5zdXBwb3J0ZWQnLCBcIkluc3RydWN0aW9uIGJyZWFrcG9pbnRzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBkZWJ1ZyB0eXBlXCIpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGJyZWFrcG9pbnQubWVzc2FnZSkge1xuXHRcdFx0bWVzc2FnZXMucHVzaChicmVha3BvaW50Lm1lc3NhZ2UpO1xuXHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludC5pbnN0cnVjdGlvblJlZmVyZW5jZSkge1xuXHRcdFx0bWVzc2FnZXMucHVzaChsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25CcmVha3BvaW50QXRBZGRyZXNzJywgXCJJbnN0cnVjdGlvbiBicmVha3BvaW50IGF0IGFkZHJlc3MgezB9XCIsIGJyZWFrcG9pbnQuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZXMucHVzaChsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25CcmVha3BvaW50JywgXCJJbnN0cnVjdGlvbiBicmVha3BvaW50XCIpKTtcblx0XHR9XG5cblx0XHRpZiAoYnJlYWtwb2ludC5oaXRDb25kaXRpb24pIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2hpdENvdW50JywgXCJIaXQgQ291bnQ6IHswfVwiLCBicmVha3BvaW50LmhpdENvbmRpdGlvbikpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi5yZWd1bGFyLFxuXHRcdFx0bWVzc2FnZTogYXBwZW5kTWVzc2FnZShtZXNzYWdlcy5qb2luKCdcXG4nKSlcblx0XHR9O1xuXHR9XG5cblx0Ly8gY2FuIGNoYW5nZSB0aGlzIHdoZW4gYWxsIGJyZWFrcG9pbnQgc3VwcG9ydHMgZGVwZW5kZW50IGJyZWFrcG9pbnQgY29uZGl0aW9uXG5cdGxldCB0cmlnZ2VyaW5nQnJlYWtwb2ludDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQ7XG5cdGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCAmJiBicmVha3BvaW50LnRyaWdnZXJlZEJ5KSB7XG5cdFx0dHJpZ2dlcmluZ0JyZWFrcG9pbnQgPSBkZWJ1Z01vZGVsLmdldEJyZWFrcG9pbnRzKCkuZmluZChicCA9PiBicC5nZXRJZCgpID09PSBicmVha3BvaW50LnRyaWdnZXJlZEJ5KTtcblx0fVxuXG5cdGlmIChicmVha3BvaW50LmxvZ01lc3NhZ2UgfHwgYnJlYWtwb2ludC5jb25kaXRpb24gfHwgYnJlYWtwb2ludC5oaXRDb25kaXRpb24gfHwgdHJpZ2dlcmluZ0JyZWFrcG9pbnQpIHtcblx0XHRjb25zdCBtZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaWNvbiA9IGJyZWFrcG9pbnQubG9nTWVzc2FnZSA/IGljb25zLmxvZ0JyZWFrcG9pbnQucmVndWxhciA6IGljb25zLmNvbmRpdGlvbmFsQnJlYWtwb2ludC5yZWd1bGFyO1xuXHRcdGlmICghYnJlYWtwb2ludC5zdXBwb3J0ZWQpIHtcblx0XHRcdGljb24gPSBpY29ucy5kZWJ1Z0JyZWFrcG9pbnRVbnN1cHBvcnRlZDtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2JyZWFrcG9pbnRVbnN1cHBvcnRlZCcsIFwiQnJlYWtwb2ludHMgb2YgdGhpcyB0eXBlIGFyZSBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBkZWJ1Z2dlclwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGJyZWFrcG9pbnQubG9nTWVzc2FnZSkge1xuXHRcdFx0bWVzc2FnZXMucHVzaChsb2NhbGl6ZSgnbG9nTWVzc2FnZScsIFwiTG9nIE1lc3NhZ2U6IHswfVwiLCBicmVha3BvaW50LmxvZ01lc3NhZ2UpKTtcblx0XHR9XG5cdFx0aWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCdleHByZXNzaW9uJywgXCJDb25kaXRpb246IHswfVwiLCBicmVha3BvaW50LmNvbmRpdGlvbikpO1xuXHRcdH1cblx0XHRpZiAoYnJlYWtwb2ludC5oaXRDb25kaXRpb24pIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2hpdENvdW50JywgXCJIaXQgQ291bnQ6IHswfVwiLCBicmVha3BvaW50LmhpdENvbmRpdGlvbikpO1xuXHRcdH1cblx0XHRpZiAodHJpZ2dlcmluZ0JyZWFrcG9pbnQpIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ3RyaWdnZXJlZEJ5JywgXCJIaXQgYWZ0ZXIgYnJlYWtwb2ludDogezB9XCIsIGAke2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0cmlnZ2VyaW5nQnJlYWtwb2ludC51cmksIHsgcmVsYXRpdmU6IHRydWUgfSl9OiAke3RyaWdnZXJpbmdCcmVha3BvaW50LmxpbmVOdW1iZXJ9YCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uLFxuXHRcdFx0bWVzc2FnZTogYXBwZW5kTWVzc2FnZShtZXNzYWdlcy5qb2luKCdcXG4nKSlcblx0XHR9O1xuXHR9XG5cblx0Y29uc3QgbWVzc2FnZSA9IGJyZWFrcG9pbnQubWVzc2FnZSA/IGJyZWFrcG9pbnQubWVzc2FnZSA6IGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50ICYmIGxhYmVsU2VydmljZSA/IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChicmVha3BvaW50LnVyaSkgOiBsb2NhbGl6ZSgnYnJlYWtwb2ludCcsIFwiQnJlYWtwb2ludFwiKTtcblx0cmV0dXJuIHtcblx0XHRpY29uOiBicmVha3BvaW50SWNvbi5yZWd1bGFyLFxuXHRcdG1lc3NhZ2Vcblx0fTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmFkZEZ1bmN0aW9uQnJlYWtwb2ludEFjdGlvbicsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2FkZEZ1bmN0aW9uQnJlYWtwb2ludCcsIFwiQWRkIEZ1bmN0aW9uIEJyZWFrcG9pbnRcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGdW5jdGlvbkJyZWFrcG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZGdW5jdGlvbiBCcmVha3BvaW50Li4uXCIpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogaWNvbnMud2F0Y2hFeHByZXNzaW9uc0FkZEZ1bmNCcmVha3BvaW50LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQlJFQUtQT0lOVFNfVklFV19JRClcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyTmV3QnJlYWtwb2ludE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9icmVha3BvaW50cycsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEVcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0YXdhaXQgdmlld1NlcnZpY2Uub3BlblZpZXcoQlJFQUtQT0lOVFNfVklFV19JRCk7XG5cdFx0ZGVidWdTZXJ2aWNlLmFkZEZ1bmN0aW9uQnJlYWtwb2ludCgpO1xuXHR9XG59KTtcblxuYWJzdHJhY3QgY2xhc3MgTWVtb3J5QnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4aXN0aW5nQnJlYWtwb2ludD86IElEYXRhQnJlYWtwb2ludCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkZWZhdWx0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGV4aXN0aW5nQnJlYWtwb2ludCAmJiBleGlzdGluZ0JyZWFrcG9pbnQuc3JjLnR5cGUgPT09IERhdGFCcmVha3BvaW50U2V0VHlwZS5BZGRyZXNzKSB7XG5cdFx0XHRkZWZhdWx0VmFsdWUgPSBgJHtleGlzdGluZ0JyZWFrcG9pbnQuc3JjLmFkZHJlc3N9ICsgJHtleGlzdGluZ0JyZWFrcG9pbnQuc3JjLmJ5dGVzfWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVpY2tJbnB1dCA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHJhbmdlID0gYXdhaXQgdGhpcy5nZXRSYW5nZShxdWlja0lucHV0LCBkZWZhdWx0VmFsdWUpO1xuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgaW5mbzogSURhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRpbmZvID0gYXdhaXQgc2Vzc2lvbi5kYXRhQnl0ZXNCcmVha3BvaW50SW5mbyhyYW5nZS5hZGRyZXNzLCByYW5nZS5ieXRlcyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0bm90aWZpY2F0aW9ucy5lcnJvcihsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRFcnJvcicsIFwiRmFpbGVkIHRvIHNldCBkYXRhIGJyZWFrcG9pbnQgYXQgezB9OiB7MX1cIiwgcmFuZ2UuYWRkcmVzcywgZS5tZXNzYWdlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFpbmZvPy5kYXRhSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYWNjZXNzVHlwZTogRGVidWdQcm90b2NvbC5EYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGUgPSAnd3JpdGUnO1xuXHRcdGlmIChpbmZvLmFjY2Vzc1R5cGVzICYmIGluZm8uYWNjZXNzVHlwZXM/Lmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IGFjY2Vzc1R5cGVzID0gaW5mby5hY2Nlc3NUeXBlcy5tYXAodHlwZSA9PiAoeyBsYWJlbDogdHlwZSB9KSk7XG5cdFx0XHRjb25zdCBzZWxlY3RlZEFjY2Vzc1R5cGUgPSBhd2FpdCBxdWlja0lucHV0LnBpY2soYWNjZXNzVHlwZXMsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGUnLCBcIlNlbGVjdCB0aGUgYWNjZXNzIHR5cGUgdG8gbW9uaXRvclwiKSB9KTtcblx0XHRcdGlmICghc2VsZWN0ZWRBY2Nlc3NUeXBlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YWNjZXNzVHlwZSA9IHNlbGVjdGVkQWNjZXNzVHlwZS5sYWJlbDtcblx0XHR9XG5cblx0XHRjb25zdCBzcmM6IERhdGFCcmVha3BvaW50U291cmNlID0geyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuQWRkcmVzcywgLi4ucmFuZ2UgfTtcblx0XHRpZiAoZXhpc3RpbmdCcmVha3BvaW50KSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGV4aXN0aW5nQnJlYWtwb2ludC5nZXRJZCgpKTtcblx0XHR9XG5cblx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuYWRkRGF0YUJyZWFrcG9pbnQoe1xuXHRcdFx0ZGVzY3JpcHRpb246IGluZm8uZGVzY3JpcHRpb24sXG5cdFx0XHRzcmMsXG5cdFx0XHRjYW5QZXJzaXN0OiB0cnVlLFxuXHRcdFx0YWNjZXNzVHlwZXM6IGluZm8uYWNjZXNzVHlwZXMsXG5cdFx0XHRhY2Nlc3NUeXBlOiBhY2Nlc3NUeXBlLFxuXHRcdFx0aW5pdGlhbFNlc3Npb25EYXRhOiB7IHNlc3Npb24sIGRhdGFJZDogaW5mby5kYXRhSWQgfVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSYW5nZShxdWlja0lucHV0OiBJUXVpY2tJbnB1dFNlcnZpY2UsIGRlZmF1bHRWYWx1ZT86IHN0cmluZykge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IGFkZHJlc3M6IHN0cmluZzsgYnl0ZXM6IG51bWJlciB9IHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dC5jcmVhdGVJbnB1dEJveCgpKTtcblx0XHRcdGlucHV0LnByb21wdCA9IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludE1lbW9yeVJhbmdlUHJvbXB0JywgXCJFbnRlciBhIG1lbW9yeSByYW5nZSBpbiB3aGljaCB0byBicmVha1wiKTtcblx0XHRcdGlucHV0LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2RhdGFCcmVha3BvaW50TWVtb3J5UmFuZ2VQbGFjZWhvbGRlcicsICdBYnNvbHV0ZSByYW5nZSAoMHgxMjM0IC0gMHgxMzAwKSBvciByYW5nZSBvZiBieXRlcyBhZnRlciBhbiBhZGRyZXNzICgweDEyMzQgKyAweGZmKScpO1xuXHRcdFx0aWYgKGRlZmF1bHRWYWx1ZSkge1xuXHRcdFx0XHRpbnB1dC52YWx1ZSA9IGRlZmF1bHRWYWx1ZTtcblx0XHRcdFx0aW5wdXQudmFsdWVTZWxlY3Rpb24gPSBbMCwgZGVmYXVsdFZhbHVlLmxlbmd0aF07XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VWYWx1ZShlID0+IHtcblx0XHRcdFx0Y29uc3QgZXJyID0gdGhpcy5wYXJzZUFkZHJlc3MoZSwgZmFsc2UpO1xuXHRcdFx0XHRpbnB1dC52YWxpZGF0aW9uTWVzc2FnZSA9IGVycj8uZXJyb3I7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByID0gdGhpcy5wYXJzZUFkZHJlc3MoaW5wdXQudmFsdWUsIHRydWUpO1xuXHRcdFx0XHRpZiAoaGFzS2V5KHIsIHsgZXJyb3I6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRpbnB1dC52YWxpZGF0aW9uTWVzc2FnZSA9IHIuZXJyb3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnB1dC5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRpbnB1dC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRpbnB1dC5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlQWRkcmVzcyhyYW5nZTogc3RyaW5nLCBpc0ZpbmFsOiBmYWxzZSk6IHsgZXJyb3I6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHBhcnNlQWRkcmVzcyhyYW5nZTogc3RyaW5nLCBpc0ZpbmFsOiB0cnVlKTogeyBlcnJvcjogc3RyaW5nIH0gfCB7IGFkZHJlc3M6IHN0cmluZzsgYnl0ZXM6IG51bWJlciB9O1xuXHRwcml2YXRlIHBhcnNlQWRkcmVzcyhyYW5nZTogc3RyaW5nLCBpc0ZpbmFsOiBib29sZWFuKTogeyBlcnJvcjogc3RyaW5nIH0gfCB7IGFkZHJlc3M6IHN0cmluZzsgYnl0ZXM6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJ0cyA9IC9eKFxcUyspXFxzKig/OihbKy1dKVxccyooXFxTKykpPy8uZXhlYyhyYW5nZSk7XG5cdFx0aWYgKCFwYXJ0cykge1xuXHRcdFx0cmV0dXJuIHsgZXJyb3I6IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludEFkZHJGb3JtYXQnLCAnQWRkcmVzcyBzaG91bGQgYmUgYSByYW5nZSBvZiBudW1iZXJzIHRoZSBmb3JtIFwiW1N0YXJ0XSAtIFtFbmRdXCIgb3IgXCJbU3RhcnRdICsgW0J5dGVzXVwiJykgfTtcblx0XHR9XG5cblx0XHRjb25zdCBpc051bSA9IChlOiBzdHJpbmcpID0+IGlzRmluYWwgPyAvXjB4WzAtOWEtZl0qfFswLTldKiQvaS50ZXN0KGUpIDogL14weFswLTlhLWZdK3xbMC05XSskL2kudGVzdChlKTtcblx0XHRjb25zdCBbLCBzdGFydFN0ciwgc2lnbiA9ICcrJywgZW5kU3RyID0gJzEnXSA9IHBhcnRzO1xuXG5cdFx0Zm9yIChjb25zdCBuIG9mIFtzdGFydFN0ciwgZW5kU3RyXSkge1xuXHRcdFx0aWYgKCFpc051bShuKSkge1xuXHRcdFx0XHRyZXR1cm4geyBlcnJvcjogbG9jYWxpemUoJ2RhdGFCcmVha3BvaW50QWRkclN0YXJ0RW5kJywgJ051bWJlciBtdXN0IGJlIGEgZGVjaW1hbCBpbnRlZ2VyIG9yIGhleCB2YWx1ZSBzdGFydGluZyB3aXRoIFxcXCIweFxcXCIsIGdvdCB7MH0nLCBuKSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaXNGaW5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0ID0gQmlnSW50KHN0YXJ0U3RyKTtcblx0XHRjb25zdCBlbmQgPSBCaWdJbnQoZW5kU3RyKTtcblx0XHRjb25zdCBhZGRyZXNzID0gYDB4JHtzdGFydC50b1N0cmluZygxNil9YDtcblx0XHRpZiAoc2lnbiA9PT0gJy0nKSB7XG5cdFx0XHRpZiAoc3RhcnQgPiBlbmQpIHtcblx0XHRcdFx0cmV0dXJuIHsgZXJyb3I6IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludEFkZHJPcmRlcicsICdFbmQgKHsxfSkgc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiBTdGFydCAoezB9KScsIHN0YXJ0U3RyLCBlbmRTdHIpIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBhZGRyZXNzLCBieXRlczogTnVtYmVyKGVuZCAtIHN0YXJ0KSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGFkZHJlc3MsIGJ5dGVzOiBOdW1iZXIoZW5kKSB9O1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE1lbW9yeUJyZWFrcG9pbnRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5hZGREYXRhQnJlYWtwb2ludE9uQWRkcmVzcycsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2FkZERhdGFCcmVha3BvaW50T25BZGRyZXNzJywgXCJBZGQgRGF0YSBCcmVha3BvaW50IGF0IEFkZHJlc3NcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlEYXRhQnJlYWtwb2ludCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRhdGEgQnJlYWtwb2ludC4uLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IGljb25zLndhdGNoRXhwcmVzc2lvbnNBZGREYXRhQnJlYWtwb2ludCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVF9EQVRBX0JSRUFLUE9JTlRfQllURVNfU1VQUE9SVEVELCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBCUkVBS1BPSU5UU19WSUVXX0lEKSlcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyTmV3QnJlYWtwb2ludE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9icmVha3BvaW50cycsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX1NFVF9EQVRBX0JSRUFLUE9JTlRfQllURVNfU1VQUE9SVEVEXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTWVtb3J5QnJlYWtwb2ludEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmVkaXREYXRhQnJlYWtwb2ludE9uQWRkcmVzcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0RGF0YUJyZWFrcG9pbnRPbkFkZHJlc3MnLCBcIkVkaXQgQWRkcmVzcy4uLlwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVF9EQVRBX0JSRUFLUE9JTlRfQllURVNfU1VQUE9SVEVELCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9JU19EQVRBX0JZVEVTKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDE1LFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi50b2dnbGVCcmVha3BvaW50c0FjdGl2YXRlZEFjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhY3RpdmF0ZUJyZWFrcG9pbnRzJywgJ1RvZ2dsZSBBY3RpdmF0ZSBCcmVha3BvaW50cycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBpY29ucy5icmVha3BvaW50c0FjdGl2YXRlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBCUkVBS1BPSU5UU19WSUVXX0lEKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGRlYnVnU2VydmljZS5zZXRCcmVha3BvaW50c0FjdGl2YXRlZCghZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24ucmVtb3ZlQnJlYWtwb2ludCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlbW92ZUJyZWFrcG9pbnQnLCBcIlJlbW92ZSBCcmVha3BvaW50XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZW1vdmVDbG9zZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19tb2RpZmljYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQnJlYWtwb2ludHNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ2lubGluZScsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5ub3RFcXVhbHNUbygnZXhjZXB0aW9uQnJlYWtwb2ludCcpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicmVha3BvaW50OiBJQmFzZUJyZWFrcG9pbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0aWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50KSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKTtcblx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGJyZWFrcG9pbnQuZ2V0SWQoKSk7XG5cdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5yZW1vdmVEYXRhQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKTtcblx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5yZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGJyZWFrcG9pbnQuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIGJyZWFrcG9pbnQub2Zmc2V0KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24ucmVtb3ZlQWxsQnJlYWtwb2ludHMnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdyZW1vdmVBbGxCcmVha3BvaW50cycsIFwiUmVtb3ZlIEFsbCBCcmVha3BvaW50c1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVJlbW92ZUFsbEJyZWFrcG9pbnRzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlJlbW92ZSAmJkFsbCBCcmVha3BvaW50c1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IGljb25zLmJyZWFrcG9pbnRzUmVtb3ZlQWxsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQlJFQUtQT0lOVFNfVklFV19JRClcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX21vZGlmaWNhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQlJFQUtQT0lOVFNfRVhJU1QsIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKSlcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRGVidWdNZW51LFxuXHRcdFx0XHRncm91cDogJzVfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cygpO1xuXHRcdGRlYnVnU2VydmljZS5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0ZGVidWdTZXJ2aWNlLnJlbW92ZURhdGFCcmVha3BvaW50cygpO1xuXHRcdGRlYnVnU2VydmljZS5yZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24uZW5hYmxlQWxsQnJlYWtwb2ludHMnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdlbmFibGVBbGxCcmVha3BvaW50cycsIFwiRW5hYmxlIEFsbCBCcmVha3BvaW50c1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUVuYWJsZUFsbEJyZWFrcG9pbnRzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRW5hYmxlIEFsbCBCcmVha3BvaW50c1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9CUkVBS1BPSU5UU19FWElTVCwgQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5ub3RFcXVhbHNUbygnZXhjZXB0aW9uQnJlYWtwb2ludCcpKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJEZWJ1Z01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNV9icmVha3BvaW50cycsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEVcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmRpc2FibGVBbGxCcmVha3BvaW50cycsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2Rpc2FibGVBbGxCcmVha3BvaW50cycsIFwiRGlzYWJsZSBBbGwgQnJlYWtwb2ludHNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlEaXNhYmxlQWxsQnJlYWtwb2ludHMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRGlzYWJsZSBBJiZsbCBCcmVha3BvaW50c1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9CUkVBS1BPSU5UU19FWElTVCwgQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5ub3RFcXVhbHNUbygnZXhjZXB0aW9uQnJlYWtwb2ludCcpKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJEZWJ1Z01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNV9icmVha3BvaW50cycsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEVcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGZhbHNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5yZWFwcGx5QnJlYWtwb2ludHNBY3Rpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVhcHBseUFsbEJyZWFrcG9pbnRzJywgJ1JlYXBwbHkgQWxsIEJyZWFrcG9pbnRzJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9JTl9ERUJVR19NT0RFLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDMwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9CUkVBS1BPSU5UU19FWElTVCwgQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5ub3RFcXVhbHNUbygnZXhjZXB0aW9uQnJlYWtwb2ludCcpKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2Uuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQodHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24udG9nZ2xlQnJlYWtwb2ludHNQcmVzZW50YXRpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlQnJlYWtwb2ludHNQcmVzZW50YXRpb24nLCBcIlRvZ2dsZSBCcmVha3BvaW50cyBWaWV3IFByZXNlbnRhdGlvblwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogaWNvbnMuYnJlYWtwb2ludHNWaWV3SWNvbixcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQlJFQUtQT0lOVFNfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY3VycmVudFByZXNlbnRhdGlvbiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdsaXN0JyB8ICd0cmVlJz4oJ2RlYnVnLmJyZWFrcG9pbnRzVmlldy5wcmVzZW50YXRpb24nKTtcblx0XHRjb25zdCBuZXdQcmVzZW50YXRpb24gPSBjdXJyZW50UHJlc2VudGF0aW9uID09PSAndHJlZScgPyAnbGlzdCcgOiAndHJlZSc7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2RlYnVnLmJyZWFrcG9pbnRzVmlldy5wcmVzZW50YXRpb24nLCBuZXdQcmVzZW50YXRpb24pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxCcmVha3BvaW50c1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWJ1Zy5lZGl0QnJlYWtwb2ludCcsXG5cdFx0XHR2aWV3SWQ6IEJSRUFLUE9JTlRTX1ZJRVdfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2VkaXRDb25kaXRpb24nLCBcIkVkaXQgQ29uZGl0aW9uLi4uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5lZGl0LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0JSRUFLUE9JTlRfU1VQUE9SVFNfQ09ORElUSU9OLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5ub3RFcXVhbHNUbygnZnVuY3Rpb25CcmVha3BvaW50JyksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQnJlYWtwb2ludHNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ2lubGluZScsXG5cdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogQnJlYWtwb2ludHNWaWV3LCBicmVha3BvaW50OiBFeGNlcHRpb25CcmVha3BvaW50IHwgQnJlYWtwb2ludCB8IEZ1bmN0aW9uQnJlYWtwb2ludCB8IERhdGFCcmVha3BvaW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgb3BlbkJyZWFrcG9pbnRTb3VyY2UoYnJlYWtwb2ludCwgZmFsc2UsIGZhbHNlLCB0cnVlLCBkZWJ1Z1NlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRcdFx0aWYgKGlzQ29kZUVkaXRvcihjb2RlRWRpdG9yKSkge1xuXHRcdFx0XHRcdGNvZGVFZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uPihCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQpPy5zaG93QnJlYWtwb2ludFdpZGdldChicmVha3BvaW50LmxpbmVOdW1iZXIsIGJyZWFrcG9pbnQuY29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0Y29uc3QgY29udGV4dE1lbnVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0TWVudVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWN0aW9uczogQWN0aW9uW10gPSBbbmV3IEFjdGlvbignYnJlYWtwb2ludC5lZGl0Q29uZGl0aW9uJywgbG9jYWxpemUoJ2VkaXRDb25kaXRpb24nLCBcIkVkaXQgQ29uZGl0aW9uLi4uXCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHZpZXcucmVuZGVySW5wdXRCb3goeyBicmVha3BvaW50LCB0eXBlOiAnY29uZGl0aW9uJyB9KSksXG5cdFx0XHRuZXcgQWN0aW9uKCdicmVha3BvaW50LmVkaXRDb25kaXRpb24nLCBsb2NhbGl6ZSgnZWRpdEhpdENvdW50JywgXCJFZGl0IEhpdCBDb3VudC4uLlwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB2aWV3LnJlbmRlcklucHV0Qm94KHsgYnJlYWtwb2ludCwgdHlwZTogJ2hpdENvdW50JyB9KSldO1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IGJyZWFrcG9pbnRJZFRvQWN0aW9uQmFyRG9tZU5vZGUuZ2V0KGJyZWFrcG9pbnQuZ2V0SWQoKSk7XG5cblx0XHRcdGlmIChkb21Ob2RlKSB7XG5cdFx0XHRcdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBkb21Ob2RlLFxuXHRcdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zZShhY3Rpb25zKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmlldy5yZW5kZXJJbnB1dEJveCh7IGJyZWFrcG9pbnQsIHR5cGU6ICdjb25kaXRpb24nIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxCcmVha3BvaW50c1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWJ1Zy5lZGl0RnVuY3Rpb25CcmVha3BvaW50Jyxcblx0XHRcdHZpZXdJZDogQlJFQUtQT0lOVFNfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZWRpdEJyZWFrcG9pbnQnLCBcIkVkaXQgRnVuY3Rpb24gQ29uZGl0aW9uLi4uXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmlzRXF1YWxUbygnZnVuY3Rpb25CcmVha3BvaW50Jylcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBCcmVha3BvaW50c1ZpZXcsIGJyZWFrcG9pbnQ6IElGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHR2aWV3LnJlbmRlcklucHV0Qm94KHsgYnJlYWtwb2ludCwgdHlwZTogJ25hbWUnIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxCcmVha3BvaW50c1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWJ1Zy5lZGl0RnVuY3Rpb25CcmVha3BvaW50SGl0Q291bnQnLFxuXHRcdFx0dmlld0lkOiBCUkVBS1BPSU5UU19WSUVXX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdlZGl0SGl0Q291bnQnLCBcIkVkaXQgSGl0IENvdW50Li4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0JSRUFLUE9JTlRfU1VQUE9SVFNfQ09ORElUSU9OLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmlzRXF1YWxUbygnZnVuY3Rpb25CcmVha3BvaW50JyksIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUuaXNFcXVhbFRvKCdkYXRhQnJlYWtwb2ludCcpKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IEJyZWFrcG9pbnRzVmlldywgYnJlYWtwb2ludDogSUZ1bmN0aW9uQnJlYWtwb2ludCkge1xuXHRcdHZpZXcucmVuZGVySW5wdXRCb3goeyBicmVha3BvaW50LCB0eXBlOiAnaGl0Q291bnQnIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxCcmVha3BvaW50c1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWJ1Zy5lZGl0QnJlYWtwb2ludE1vZGUnLFxuXHRcdFx0dmlld0lkOiBCUkVBS1BPSU5UU19WSUVXX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdlZGl0TW9kZScsIFwiRWRpdCBNb2RlLi4uXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q09OVEVYVF9CUkVBS1BPSU5UX0hBU19NT0RFUyxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmlzRXF1YWxUbygnYnJlYWtwb2ludCcpLCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmlzRXF1YWxUbygnZXhjZXB0aW9uQnJlYWtwb2ludCcpLCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmlzRXF1YWxUbygnaW5zdHJ1Y3Rpb25CcmVha3BvaW50JykpXG5cdFx0XHRcdClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IEJyZWFrcG9pbnRzVmlldywgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQpIHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qga2luZCA9IGdldE1vZGVLaW5kRm9yQnJlYWtwb2ludChicmVha3BvaW50KTtcblx0XHRjb25zdCBtb2RlcyA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRNb2RlcyhraW5kKTtcblx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKS5waWNrKFxuXHRcdFx0bW9kZXMubWFwKG1vZGUgPT4gKHsgbGFiZWw6IG1vZGUubGFiZWwsIGRlc2NyaXB0aW9uOiBtb2RlLmRlc2NyaXB0aW9uLCBtb2RlOiBtb2RlLm1vZGUgfSkpLFxuXHRcdFx0eyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdEJyZWFrcG9pbnRNb2RlJywgXCJTZWxlY3QgQnJlYWtwb2ludCBNb2RlXCIpIH1cblx0XHQpO1xuXG5cdFx0aWYgKCFwaWNrZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoa2luZCA9PT0gJ3NvdXJjZScpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRVcGRhdGVEYXRhPigpO1xuXHRcdFx0ZGF0YS5zZXQoYnJlYWtwb2ludC5nZXRJZCgpLCB7IG1vZGU6IHBpY2tlZC5tb2RlLCBtb2RlTGFiZWw6IHBpY2tlZC5sYWJlbCB9KTtcblx0XHRcdGRlYnVnU2VydmljZS51cGRhdGVCcmVha3BvaW50cyhicmVha3BvaW50Lm9yaWdpbmFsVXJpLCBkYXRhLCBmYWxzZSk7XG5cdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhicmVha3BvaW50Lmluc3RydWN0aW9uUmVmZXJlbmNlLCBicmVha3BvaW50Lm9mZnNldCk7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KHsgLi4uYnJlYWtwb2ludC50b0pTT04oKSwgbW9kZTogcGlja2VkLm1vZGUsIG1vZGVMYWJlbDogcGlja2VkLmxhYmVsIH0pO1xuXHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEV4Y2VwdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGJyZWFrcG9pbnQubW9kZSA9IHBpY2tlZC5tb2RlO1xuXHRcdFx0YnJlYWtwb2ludC5tb2RlTGFiZWwgPSBwaWNrZWQubGFiZWw7XG5cdFx0XHRkZWJ1Z1NlcnZpY2Uuc2V0RXhjZXB0aW9uQnJlYWtwb2ludENvbmRpdGlvbihicmVha3BvaW50LCBicmVha3BvaW50LmNvbmRpdGlvbik7IC8vIG5vLW9wIHRvIHRyaWdnZXIgYSByZS1zZW5kXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQXlCLDZCQUE2QjtBQUN0RCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsd0JBQXdCO0FBRzNDLFNBQVMsbUJBQW1CO0FBSTVCLFNBQVMsY0FBYztBQUN2QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLFNBQVMsb0JBQW9CO0FBQ3ZELFlBQVksZUFBZTtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxTQUFnQixjQUFjLFFBQVEsdUJBQXVCO0FBQ3RFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQTZCLDBCQUEwQjtBQUNoRSxTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxxQkFBcUI7QUFDOUIs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
