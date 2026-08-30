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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Action } from "../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { posix } from "../../../../base/common/path.js";
import { commonSuffixLength } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { getActionBarActions, getContextMenuActions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { asCssVariable, textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { CALLSTACK_VIEW_ID, CONTEXT_CALLSTACK_FOCUSED, CONTEXT_CALLSTACK_ITEM_STOPPED, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD, CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_STACK_FRAME_SUPPORTS_RESTART, getStateLabel, IDebugService, isFrameDeemphasized, State } from "../common/debug.js";
import { StackFrame, Thread, ThreadAndSessionIds } from "../common/debugModel.js";
import { isSessionAttach } from "../common/debugUtils.js";
import { renderViewTree } from "./baseDebugView.js";
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from "./debugCommands.js";
import * as icons from "./debugIcons.js";
import { createDisconnectMenuItemAction } from "./debugToolBar.js";
const $ = dom.$;
function getSessionContext(element) {
  return {
    sessionId: element.getId()
  };
}
function getThreadContext(element) {
  return {
    ...getSessionContext(element.session),
    threadId: element.getId()
  };
}
function getStackFrameContext(element) {
  return {
    ...getThreadContext(element.thread),
    frameId: element.getId(),
    frameName: element.name,
    frameLocation: { range: element.range, source: element.source.raw }
  };
}
function getContext(element) {
  if (element instanceof StackFrame) {
    return getStackFrameContext(element);
  } else if (element instanceof Thread) {
    return getThreadContext(element);
  } else if (isDebugSession(element)) {
    return getSessionContext(element);
  } else {
    return void 0;
  }
}
function getContextForContributedActions(element) {
  if (element instanceof StackFrame) {
    if (element.source.inMemory) {
      return element.source.raw.path || element.source.reference || element.source.name;
    }
    return element.source.uri.toString();
  }
  if (element instanceof Thread) {
    return element.threadId;
  }
  if (isDebugSession(element)) {
    return element.getId();
  }
  return "";
}
function getSpecificSourceName(stackFrame) {
  let callStack = stackFrame.thread.getStaleCallStack();
  callStack = callStack.length > 0 ? callStack : stackFrame.thread.getCallStack();
  const otherSources = callStack.map((sf) => sf.source).filter((s) => s !== stackFrame.source);
  let suffixLength = 0;
  otherSources.forEach((s) => {
    if (s.name === stackFrame.source.name) {
      suffixLength = Math.max(suffixLength, commonSuffixLength(stackFrame.source.uri.path, s.uri.path));
    }
  });
  if (suffixLength === 0) {
    return stackFrame.source.name;
  }
  const from = Math.max(0, stackFrame.source.uri.path.lastIndexOf(posix.sep, stackFrame.source.uri.path.length - suffixLength - 1));
  return (from > 0 ? "..." : "") + stackFrame.source.uri.path.substring(from);
}
async function expandTo(session, tree) {
  if (session.parentSession) {
    await expandTo(session.parentSession, tree);
  }
  await tree.expand(session);
}
let CallStackView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, themeService, hoverService, menuService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.options = options;
    this.debugService = debugService;
    this.menuService = menuService;
    this.needsRefresh = false;
    this.ignoreSelectionChangedEvent = false;
    this.ignoreFocusStackFrameEvent = false;
    this.autoExpandedSessions = /* @__PURE__ */ new Set();
    this.selectionNeedsUpdate = false;
    this.onCallStackChangeScheduler = this._register(new RunOnceScheduler(async () => {
      const sessions = this.debugService.getModel().getSessions();
      if (sessions.length === 0) {
        this.autoExpandedSessions.clear();
      }
      const thread = sessions.length === 1 && sessions[0].getAllThreads().length === 1 ? sessions[0].getAllThreads()[0] : void 0;
      const stoppedDetails = sessions.length === 1 ? sessions[0].getStoppedDetails() : void 0;
      if (stoppedDetails && (thread || typeof stoppedDetails.threadId !== "number")) {
        this.stateMessageLabel.textContent = stoppedDescription(stoppedDetails);
        this.stateMessageLabelHover.update(stoppedText(stoppedDetails));
        this.stateMessageLabel.classList.toggle("exception", stoppedDetails.reason === "exception");
        this.stateMessage.hidden = false;
      } else if (sessions.length === 1 && sessions[0].state === State.Running) {
        this.stateMessageLabel.textContent = localize({ key: "running", comment: ["indicates state"] }, "Running");
        this.stateMessageLabelHover.update(sessions[0].getLabel());
        this.stateMessageLabel.classList.remove("exception");
        this.stateMessage.hidden = false;
      } else {
        this.stateMessage.hidden = true;
      }
      this.updateActions();
      this.needsRefresh = false;
      await this.tree.updateChildren();
      try {
        const toExpand = /* @__PURE__ */ new Set();
        sessions.forEach((s) => {
          if (s.parentSession && !this.autoExpandedSessions.has(s.parentSession)) {
            toExpand.add(s.parentSession);
          }
        });
        for (const session of toExpand) {
          await expandTo(session, this.tree);
          this.autoExpandedSessions.add(session);
        }
      } catch (e) {
      }
      if (this.selectionNeedsUpdate) {
        this.selectionNeedsUpdate = false;
        await this.updateTreeSelection();
      }
    }, 50));
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.options.title);
    this.stateMessage = dom.append(container, $("span.call-stack-state-message"));
    this.stateMessage.hidden = true;
    this.stateMessageLabel = dom.append(this.stateMessage, $("span.label"));
    this.stateMessageLabelHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.stateMessage, ""));
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-call-stack");
    const treeContainer = renderViewTree(container);
    this.dataSource = new CallStackDataSource(this.debugService);
    this.tree = this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, "CallStackView", treeContainer, new CallStackDelegate(), new CallStackCompressionDelegate(this.debugService), [
      this.instantiationService.createInstance(SessionsRenderer),
      this.instantiationService.createInstance(ThreadsRenderer),
      this.instantiationService.createInstance(StackFramesRenderer),
      this.instantiationService.createInstance(ErrorsRenderer),
      new LoadMoreRenderer(),
      new ShowMoreRenderer()
    ], this.dataSource, {
      accessibilityProvider: new CallStackAccessibilityProvider(),
      compressionEnabled: true,
      autoExpandSingleChildren: true,
      identityProvider: {
        getId: (element) => {
          if (typeof element === "string") {
            return element;
          }
          if (element instanceof Array) {
            return `showMore ${element[0].getId()}`;
          }
          return element.getId();
        }
      },
      keyboardNavigationLabelProvider: {
        getKeyboardNavigationLabel: (e) => {
          if (isDebugSession(e)) {
            return e.getLabel();
          }
          if (e instanceof Thread) {
            return `${e.name} ${e.stateLabel}`;
          }
          if (e instanceof StackFrame || typeof e === "string") {
            return e;
          }
          if (e instanceof ThreadAndSessionIds) {
            return LoadMoreRenderer.LABEL;
          }
          return localize("showMoreStackFrames2", "Show More Stack Frames");
        },
        getCompressedNodeKeyboardNavigationLabel: (e) => {
          const firstItem = e[0];
          if (isDebugSession(firstItem)) {
            return firstItem.getLabel();
          }
          return "";
        }
      },
      expandOnlyOnTwistieClick: true,
      overrideStyles: this.getLocationBasedColors().listOverrideStyles
    });
    CONTEXT_CALLSTACK_FOCUSED.bindTo(this.tree.contextKeyService);
    this.tree.setInput(this.debugService.getModel());
    this._register(this.tree);
    this._register(this.tree.onDidOpen(async (e) => {
      if (this.ignoreSelectionChangedEvent) {
        return;
      }
      const focusStackFrame = (stackFrame, thread, session, options = {}) => {
        this.ignoreFocusStackFrameEvent = true;
        try {
          this.debugService.focusStackFrame(stackFrame, thread, session, { ...options, ...{ explicit: true } });
        } finally {
          this.ignoreFocusStackFrameEvent = false;
        }
      };
      const element = e.element;
      if (element instanceof StackFrame) {
        const opts = {
          preserveFocus: e.editorOptions.preserveFocus,
          sideBySide: e.sideBySide,
          pinned: e.editorOptions.pinned
        };
        focusStackFrame(element, element.thread, element.thread.session, opts);
      }
      if (element instanceof Thread) {
        focusStackFrame(void 0, element, element.session);
      }
      if (isDebugSession(element)) {
        focusStackFrame(void 0, void 0, element);
      }
      if (element instanceof ThreadAndSessionIds) {
        const session = this.debugService.getModel().getSession(element.sessionId);
        const thread = session && session.getThread(element.threadId);
        if (thread) {
          const totalFrames = thread.stoppedDetails?.totalFrames;
          const remainingFramesCount = typeof totalFrames === "number" ? totalFrames - thread.getCallStack().length : void 0;
          await thread.fetchCallStack(remainingFramesCount);
          await this.tree.updateChildren();
        }
      }
      if (element instanceof Array) {
        element.forEach((sf) => this.dataSource.deemphasizedStackFramesToShow.add(sf));
        this.tree.updateChildren();
      }
    }));
    this._register(this.debugService.getModel().onDidChangeCallStack(() => {
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        return;
      }
      if (!this.onCallStackChangeScheduler.isScheduled()) {
        this.onCallStackChangeScheduler.schedule();
      }
    }));
    const onFocusChange = Event.any(this.debugService.getViewModel().onDidFocusStackFrame, this.debugService.getViewModel().onDidFocusSession);
    this._register(onFocusChange(async () => {
      if (this.ignoreFocusStackFrameEvent) {
        return;
      }
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        this.selectionNeedsUpdate = true;
        return;
      }
      if (this.onCallStackChangeScheduler.isScheduled()) {
        this.selectionNeedsUpdate = true;
        return;
      }
      await this.updateTreeSelection();
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    if (this.debugService.state === State.Stopped) {
      this.onCallStackChangeScheduler.schedule(0);
    }
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.onCallStackChangeScheduler.schedule();
      }
    }));
    this._register(this.debugService.onDidNewSession((s) => {
      const sessionListeners = [];
      sessionListeners.push(s.onDidChangeName(() => {
        if (this.tree.hasNode(s)) {
          this.tree.rerender(s);
        }
      }));
      sessionListeners.push(s.onDidEndAdapter(() => dispose(sessionListeners)));
      if (s.parentSession) {
        this.autoExpandedSessions.delete(s.parentSession);
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
  async updateTreeSelection() {
    if (!this.tree || !this.tree.getInput()) {
      return;
    }
    const updateSelectionAndReveal = (element) => {
      this.ignoreSelectionChangedEvent = true;
      try {
        this.tree.setSelection([element]);
        if (this.tree.getRelativeTop(element) === null) {
          this.tree.reveal(element, 0.5);
        } else {
          this.tree.reveal(element);
        }
      } catch (e) {
      } finally {
        this.ignoreSelectionChangedEvent = false;
      }
    };
    const thread = this.debugService.getViewModel().focusedThread;
    const session = this.debugService.getViewModel().focusedSession;
    const stackFrame = this.debugService.getViewModel().focusedStackFrame;
    if (!thread) {
      if (!session) {
        this.tree.setSelection([]);
      } else {
        updateSelectionAndReveal(session);
      }
    } else {
      try {
        await expandTo(thread.session, this.tree);
      } catch (e) {
      }
      try {
        await this.tree.expand(thread);
      } catch (e) {
      }
      const toReveal = stackFrame || session;
      if (toReveal) {
        updateSelectionAndReveal(toReveal);
      }
    }
  }
  onContextMenu(e) {
    const element = e.element;
    let overlay = [];
    if (isDebugSession(element)) {
      overlay = getSessionContextOverlay(element);
    } else if (element instanceof Thread) {
      overlay = getThreadContextOverlay(element);
    } else if (element instanceof StackFrame) {
      overlay = getStackFrameContextOverlay(element);
    }
    const contextKeyService = this.contextKeyService.createOverlay(overlay);
    const menu = this.menuService.getMenuActions(MenuId.DebugCallStackContext, contextKeyService, { arg: getContextForContributedActions(element), shouldForwardArgs: true });
    const result = getContextMenuActions(menu, "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => result.secondary,
      getActionsContext: () => getContext(element)
    });
  }
};
CallStackView = __decorateClass([
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
  __decorateParam(11, IMenuService)
], CallStackView);
function getSessionContextOverlay(session) {
  return [
    [CONTEXT_CALLSTACK_ITEM_TYPE.key, "session"],
    [CONTEXT_CALLSTACK_SESSION_IS_ATTACH.key, isSessionAttach(session)],
    [CONTEXT_CALLSTACK_ITEM_STOPPED.key, session.state === State.Stopped],
    [CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD.key, session.getAllThreads().length === 1]
  ];
}
let SessionsRenderer = class {
  constructor(instantiationService, contextKeyService, hoverService, menuService) {
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.menuService = menuService;
  }
  get templateId() {
    return SessionsRenderer.ID;
  }
  renderTemplate(container) {
    const session = dom.append(container, $(".session"));
    dom.append(session, $(ThemeIcon.asCSSSelector(icons.callstackViewSession)));
    const name = dom.append(session, $(".name"));
    const stateLabel = dom.append(session, $("span.state.label.monaco-count-badge.long"));
    const templateDisposable = new DisposableStore();
    const label = templateDisposable.add(new HighlightedLabel(name));
    const stopActionViewItemDisposables = templateDisposable.add(new DisposableStore());
    const actionBar = templateDisposable.add(new ActionBar(session, {
      actionViewItemProvider: (action, options) => {
        if ((action.id === STOP_ID || action.id === DISCONNECT_ID) && action instanceof MenuItemAction) {
          stopActionViewItemDisposables.clear();
          const item = this.instantiationService.invokeFunction((accessor) => createDisconnectMenuItemAction(action, stopActionViewItemDisposables, accessor, { ...options, menuAsChild: false }));
          if (item) {
            return item;
          }
        }
        if (action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        } else if (action instanceof SubmenuItemAction) {
          return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        return void 0;
      }
    }));
    const elementDisposable = templateDisposable.add(new DisposableStore());
    return { session, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
  }
  renderElement(element, _, data) {
    this.doRenderElement(element.element, createMatches(element.filterData), data);
  }
  renderCompressedElements(node, _index, templateData) {
    const lastElement = node.element.elements[node.element.elements.length - 1];
    const matches = createMatches(node.filterData);
    this.doRenderElement(lastElement, matches, templateData);
  }
  doRenderElement(session, matches, data) {
    const sessionHover = data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.session, localize({ key: "session", comment: ["Session is a noun"] }, "Session")));
    data.label.set(session.getLabel(), matches);
    const stoppedDetails = session.getStoppedDetails();
    const thread = session.getAllThreads().find((t) => t.stopped);
    const contextKeyService = this.contextKeyService.createOverlay(getSessionContextOverlay(session));
    const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));
    const setupActionBar = () => {
      data.actionBar.clear();
      const { primary } = getActionBarActions(menu.getActions({ arg: getContextForContributedActions(session), shouldForwardArgs: true }), "inline");
      data.actionBar.push(primary, { icon: true, label: false });
      data.actionBar.context = getContext(session);
    };
    data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
    setupActionBar();
    data.stateLabel.style.display = "";
    if (stoppedDetails) {
      data.stateLabel.textContent = stoppedDescription(stoppedDetails);
      sessionHover.update(`${session.getLabel()}: ${stoppedText(stoppedDetails)}`);
      data.stateLabel.classList.toggle("exception", stoppedDetails.reason === "exception");
    } else if (thread && thread.stoppedDetails) {
      data.stateLabel.textContent = stoppedDescription(thread.stoppedDetails);
      sessionHover.update(`${session.getLabel()}: ${stoppedText(thread.stoppedDetails)}`);
      data.stateLabel.classList.toggle("exception", thread.stoppedDetails.reason === "exception");
    } else {
      data.stateLabel.textContent = localize({ key: "running", comment: ["indicates state"] }, "Running");
      data.stateLabel.classList.remove("exception");
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
  disposeElement(_element, _, templateData) {
    templateData.elementDisposable.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposable.clear();
  }
};
SessionsRenderer.ID = "session";
SessionsRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IMenuService)
], SessionsRenderer);
function getThreadContextOverlay(thread) {
  return [
    [CONTEXT_CALLSTACK_ITEM_TYPE.key, "thread"],
    [CONTEXT_CALLSTACK_ITEM_STOPPED.key, thread.stopped]
  ];
}
let ThreadsRenderer = class {
  constructor(contextKeyService, hoverService, menuService) {
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.menuService = menuService;
  }
  get templateId() {
    return ThreadsRenderer.ID;
  }
  renderTemplate(container) {
    const thread = dom.append(container, $(".thread"));
    const name = dom.append(thread, $(".name"));
    const stateLabel = dom.append(thread, $("span.state.label.monaco-count-badge.long"));
    const templateDisposable = new DisposableStore();
    const label = templateDisposable.add(new HighlightedLabel(name));
    const actionBar = templateDisposable.add(new ActionBar(thread));
    const elementDisposable = templateDisposable.add(new DisposableStore());
    return { thread, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
  }
  renderElement(element, _index, data) {
    const thread = element.element;
    data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.thread, thread.name));
    data.label.set(thread.name, createMatches(element.filterData));
    data.stateLabel.textContent = thread.stateLabel;
    data.stateLabel.classList.toggle("exception", thread.stoppedDetails?.reason === "exception");
    const contextKeyService = this.contextKeyService.createOverlay(getThreadContextOverlay(thread));
    const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));
    const setupActionBar = () => {
      data.actionBar.clear();
      const { primary } = getActionBarActions(menu.getActions({ arg: getContextForContributedActions(thread), shouldForwardArgs: true }), "inline");
      data.actionBar.push(primary, { icon: true, label: false });
      data.actionBar.context = getContext(thread);
    };
    data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
    setupActionBar();
  }
  renderCompressedElements(_node, _index, _templateData) {
    throw new Error("Method not implemented.");
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposable.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
};
ThreadsRenderer.ID = "thread";
ThreadsRenderer = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, IMenuService)
], ThreadsRenderer);
function getStackFrameContextOverlay(stackFrame) {
  return [
    [CONTEXT_CALLSTACK_ITEM_TYPE.key, "stackFrame"],
    [CONTEXT_STACK_FRAME_SUPPORTS_RESTART.key, stackFrame.canRestart]
  ];
}
let StackFramesRenderer = class {
  constructor(hoverService, labelService, notificationService) {
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.notificationService = notificationService;
  }
  get templateId() {
    return StackFramesRenderer.ID;
  }
  renderTemplate(container) {
    const stackFrame = dom.append(container, $(".stack-frame"));
    const labelDiv = dom.append(stackFrame, $("span.label.expression"));
    const file = dom.append(stackFrame, $(".file"));
    const fileName = dom.append(file, $("span.file-name"));
    const wrapper = dom.append(file, $("span.line-number-wrapper"));
    const lineNumber = dom.append(wrapper, $("span.line-number.monaco-count-badge"));
    const templateDisposable = new DisposableStore();
    const elementDisposables = new DisposableStore();
    templateDisposable.add(elementDisposables);
    const label = templateDisposable.add(new HighlightedLabel(labelDiv));
    const actionBar = templateDisposable.add(new ActionBar(stackFrame));
    return { file, fileName, label, lineNumber, stackFrame, actionBar, templateDisposable, elementDisposables };
  }
  renderElement(element, index, data) {
    const stackFrame = element.element;
    data.stackFrame.classList.toggle("disabled", !stackFrame.source || !stackFrame.source.available || isFrameDeemphasized(stackFrame));
    data.stackFrame.classList.toggle("label", stackFrame.presentationHint === "label");
    const hasActions = !!stackFrame.thread.session.capabilities.supportsRestartFrame && stackFrame.presentationHint !== "label" && stackFrame.presentationHint !== "subtle" && stackFrame.canRestart;
    data.stackFrame.classList.toggle("has-actions", hasActions);
    let title = stackFrame.source.inMemory ? stackFrame.source.uri.path : this.labelService.getUriLabel(stackFrame.source.uri);
    if (stackFrame.source.raw.origin) {
      title += `
${stackFrame.source.raw.origin}`;
    }
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.file, title));
    data.label.set(stackFrame.name, createMatches(element.filterData), stackFrame.name);
    data.fileName.textContent = getSpecificSourceName(stackFrame);
    if (stackFrame.range.startLineNumber !== void 0) {
      data.lineNumber.textContent = `${stackFrame.range.startLineNumber}`;
      if (stackFrame.range.startColumn) {
        data.lineNumber.textContent += `:${stackFrame.range.startColumn}`;
      }
      data.lineNumber.classList.remove("unavailable");
    } else {
      data.lineNumber.classList.add("unavailable");
    }
    data.actionBar.clear();
    if (hasActions) {
      const action = data.elementDisposables.add(new Action("debug.callStack.restartFrame", localize("restartFrame", "Restart Frame"), ThemeIcon.asClassName(icons.debugRestartFrame), true, async () => {
        try {
          await stackFrame.restart();
        } catch (e) {
          this.notificationService.error(e);
        }
      }));
      data.actionBar.push(action, { icon: true, label: false });
    }
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
};
StackFramesRenderer.ID = "stackFrame";
StackFramesRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, INotificationService)
], StackFramesRenderer);
let ErrorsRenderer = class {
  constructor(hoverService) {
    this.hoverService = hoverService;
  }
  get templateId() {
    return ErrorsRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, $(".error"));
    return { label, templateDisposable: new DisposableStore() };
  }
  renderElement(element, index, data) {
    const error = element.element;
    data.label.textContent = error;
    data.templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.label, error));
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeTemplate(templateData) {
  }
};
ErrorsRenderer.ID = "error";
ErrorsRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], ErrorsRenderer);
const _LoadMoreRenderer = class _LoadMoreRenderer {
  constructor() {
  }
  get templateId() {
    return _LoadMoreRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, $(".load-all"));
    label.style.color = asCssVariable(textLinkForeground);
    return { label };
  }
  renderElement(element, index, data) {
    data.label.textContent = _LoadMoreRenderer.LABEL;
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeTemplate(templateData) {
  }
};
_LoadMoreRenderer.ID = "loadMore";
_LoadMoreRenderer.LABEL = localize("loadAllStackFrames", "Load More Stack Frames");
let LoadMoreRenderer = _LoadMoreRenderer;
const _ShowMoreRenderer = class _ShowMoreRenderer {
  constructor() {
  }
  get templateId() {
    return _ShowMoreRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, $(".show-more"));
    label.style.color = asCssVariable(textLinkForeground);
    return { label };
  }
  renderElement(element, index, data) {
    const stackFrames = element.element;
    if (stackFrames.every((sf) => !!(sf.source && sf.source.origin && sf.source.origin === stackFrames[0].source.origin))) {
      data.label.textContent = localize("showMoreAndOrigin", "Show {0} More: {1}", stackFrames.length, stackFrames[0].source.origin);
    } else {
      data.label.textContent = localize("showMoreStackFrames", "Show {0} More Stack Frames", stackFrames.length);
    }
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeTemplate(templateData) {
  }
};
_ShowMoreRenderer.ID = "showMore";
let ShowMoreRenderer = _ShowMoreRenderer;
class CallStackDelegate {
  getHeight(element) {
    if (element instanceof StackFrame && element.presentationHint === "label") {
      return 16;
    }
    if (element instanceof ThreadAndSessionIds || element instanceof Array) {
      return 16;
    }
    return 22;
  }
  getTemplateId(element) {
    if (isDebugSession(element)) {
      return SessionsRenderer.ID;
    }
    if (element instanceof Thread) {
      return ThreadsRenderer.ID;
    }
    if (element instanceof StackFrame) {
      return StackFramesRenderer.ID;
    }
    if (typeof element === "string") {
      return ErrorsRenderer.ID;
    }
    if (element instanceof ThreadAndSessionIds) {
      return LoadMoreRenderer.ID;
    }
    return ShowMoreRenderer.ID;
  }
}
function stoppedText(stoppedDetails) {
  return stoppedDetails.text ?? stoppedDescription(stoppedDetails);
}
function stoppedDescription(stoppedDetails) {
  return stoppedDetails.description || (stoppedDetails.reason ? localize({ key: "pausedOn", comment: ["indicates reason for program being paused"] }, "Paused on {0}", stoppedDetails.reason) : localize("paused", "Paused"));
}
function isDebugModel(obj) {
  return !!obj && typeof obj.getSessions === "function";
}
function isDebugSession(obj) {
  return !!obj && typeof obj.getAllThreads === "function";
}
class CallStackDataSource {
  constructor(debugService) {
    this.debugService = debugService;
    this.deemphasizedStackFramesToShow = /* @__PURE__ */ new WeakSet();
  }
  hasChildren(element) {
    if (isDebugSession(element)) {
      const threads = element.getAllThreads();
      return threads.length > 1 || threads.length === 1 && threads[0].stopped || !!this.debugService.getModel().getSessions().find((s) => s.parentSession === element);
    }
    return isDebugModel(element) || element instanceof Thread && element.stopped;
  }
  async getChildren(element) {
    if (isDebugModel(element)) {
      const sessions = element.getSessions();
      if (sessions.length === 0) {
        return Promise.resolve([]);
      }
      if (sessions.length > 1 || this.debugService.getViewModel().isMultiSessionView()) {
        return Promise.resolve(sessions.filter((s) => !s.parentSession));
      }
      const threads = sessions[0].getAllThreads();
      return threads.length === 1 ? this.getThreadChildren(threads[0]) : Promise.resolve(threads);
    } else if (isDebugSession(element)) {
      const childSessions = this.debugService.getModel().getSessions().filter((s) => s.parentSession === element);
      const threads = element.getAllThreads();
      if (threads.length === 1) {
        const children = await this.getThreadChildren(threads[0]);
        return children.concat(childSessions);
      }
      return Promise.resolve(threads.concat(childSessions));
    } else {
      return this.getThreadChildren(element);
    }
  }
  getThreadChildren(thread) {
    return this.getThreadCallstack(thread).then((children) => {
      const result = [];
      children.forEach((child, index) => {
        if (child instanceof StackFrame && child.source && isFrameDeemphasized(child)) {
          if (!this.deemphasizedStackFramesToShow.has(child)) {
            if (result.length) {
              const last = result[result.length - 1];
              if (last instanceof Array) {
                last.push(child);
                return;
              }
            }
            const nextChild = index < children.length - 1 ? children[index + 1] : void 0;
            if (nextChild instanceof StackFrame && nextChild.source && isFrameDeemphasized(nextChild)) {
              result.push([child]);
              return;
            }
          }
        }
        result.push(child);
      });
      return result;
    });
  }
  async getThreadCallstack(thread) {
    let callStack = thread.getCallStack();
    if (!callStack || !callStack.length) {
      await thread.fetchCallStack();
      callStack = thread.getCallStack();
    }
    if (callStack.length === 1 && thread.session.capabilities.supportsDelayedStackTraceLoading && thread.stoppedDetails && thread.stoppedDetails.totalFrames && thread.stoppedDetails.totalFrames > 1) {
      callStack = callStack.concat(thread.getStaleCallStack().slice(1));
    }
    if (thread.stoppedDetails && thread.stoppedDetails.framesErrorMessage) {
      callStack = callStack.concat([thread.stoppedDetails.framesErrorMessage]);
    }
    if (!thread.reachedEndOfCallStack && thread.stoppedDetails) {
      callStack = callStack.concat([new ThreadAndSessionIds(thread.session.getId(), thread.threadId)]);
    }
    return callStack;
  }
}
class CallStackAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize({ comment: ["Debug is a noun in this context, not a verb."], key: "callStackAriaLabel" }, "Debug Call Stack");
  }
  getWidgetRole() {
    return "treegrid";
  }
  getRole(_element) {
    return "row";
  }
  getAriaLabel(element) {
    if (element instanceof Thread) {
      return localize({ key: "threadAriaLabel", comment: ['Placeholders stand for the thread name and the thread state.For example "Thread 1" and "Stopped'] }, "Thread {0} {1}", element.name, element.stateLabel);
    }
    if (element instanceof StackFrame) {
      return localize("stackFrameAriaLabel", "Stack Frame {0}, line {1}, {2}", element.name, element.range.startLineNumber, getSpecificSourceName(element));
    }
    if (isDebugSession(element)) {
      const thread = element.getAllThreads().find((t) => t.stopped);
      const state = thread ? thread.stateLabel : localize({ key: "running", comment: ["indicates state"] }, "Running");
      return localize({ key: "sessionLabel", comment: ['Placeholders stand for the session name and the session state. For example "Launch Program" and "Running"'] }, "Session {0} {1}", element.getLabel(), state);
    }
    if (typeof element === "string") {
      return element;
    }
    if (element instanceof Array) {
      return localize("showMoreStackFrames", "Show {0} More Stack Frames", element.length);
    }
    return LoadMoreRenderer.LABEL;
  }
}
class CallStackCompressionDelegate {
  constructor(debugService) {
    this.debugService = debugService;
  }
  isIncompressible(stat) {
    if (isDebugSession(stat)) {
      if (stat.compact) {
        return false;
      }
      const sessions = this.debugService.getModel().getSessions();
      if (sessions.some((s) => s.parentSession === stat && s.compact)) {
        return false;
      }
      return true;
    }
    return true;
  }
}
registerAction2(class Collapse extends ViewAction {
  constructor() {
    super({
      id: "callStack.collapse",
      viewId: CALLSTACK_VIEW_ID,
      title: localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      precondition: CONTEXT_DEBUG_STATE.isEqualTo(getStateLabel(State.Stopped)),
      menu: {
        id: MenuId.ViewTitle,
        order: 10,
        group: "navigation",
        when: ContextKeyExpr.equals("view", CALLSTACK_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
function registerCallStackInlineMenuItem(id, title, icon, when, order, precondition) {
  MenuRegistry.appendMenuItem(MenuId.DebugCallStackContext, {
    group: "inline",
    order,
    when,
    command: { id, title, icon, precondition }
  });
}
const threadOrSessionWithOneThread = ContextKeyExpr.or(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("thread"), ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session"), CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD));
registerCallStackInlineMenuItem(PAUSE_ID, PAUSE_LABEL, icons.debugPause, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED.toNegated()), 10, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated());
registerCallStackInlineMenuItem(CONTINUE_ID, CONTINUE_LABEL, icons.debugContinue, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED), 10);
registerCallStackInlineMenuItem(STEP_OVER_ID, STEP_OVER_LABEL, icons.debugStepOver, threadOrSessionWithOneThread, 20, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_INTO_ID, STEP_INTO_LABEL, icons.debugStepInto, threadOrSessionWithOneThread, 30, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_OUT_ID, STEP_OUT_LABEL, icons.debugStepOut, threadOrSessionWithOneThread, 40, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(RESTART_SESSION_ID, RESTART_LABEL, icons.debugRestart, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session"), 50);
registerCallStackInlineMenuItem(STOP_ID, STOP_LABEL, icons.debugStop, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH.toNegated(), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session")), 60);
registerCallStackInlineMenuItem(DISCONNECT_ID, DISCONNECT_LABEL, icons.debugDisconnect, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session")), 60);
export {
  CallStackView,
  getContext,
  getContextForContributedActions,
  getSpecificSourceName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxjYWxsU3RhY2tWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQXJpYVJvbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzZWRUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2NvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVNvdXJjZSwgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMsIEZ1enp5U2NvcmUsIElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgY29tbW9uU3VmZml4TGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uVGl0bGUsIEljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zLCBnZXRDb250ZXh0TWVudUFjdGlvbnMsIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBTdWJtZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yLCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCB0ZXh0TGlua0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3QWN0aW9uLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgQ0FMTFNUQUNLX1ZJRVdfSUQsIENPTlRFWFRfQ0FMTFNUQUNLX0ZPQ1VTRUQsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fU1RPUFBFRCwgQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9UWVBFLCBDT05URVhUX0NBTExTVEFDS19TRVNTSU9OX0hBU19PTkVfVEhSRUFELCBDT05URVhUX0NBTExTVEFDS19TRVNTSU9OX0lTX0FUVEFDSCwgQ09OVEVYVF9ERUJVR19TVEFURSwgQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfTk9fREVCVUcsIENPTlRFWFRfU1RBQ0tfRlJBTUVfU1VQUE9SVFNfUkVTVEFSVCwgZ2V0U3RhdGVMYWJlbCwgSURlYnVnTW9kZWwsIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIElSYXdTdG9wcGVkRGV0YWlscywgaXNGcmFtZURlZW1waGFzaXplZCwgSVN0YWNrRnJhbWUsIElUaHJlYWQsIFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IFN0YWNrRnJhbWUsIFRocmVhZCwgVGhyZWFkQW5kU2Vzc2lvbklkcyB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IGlzU2Vzc2lvbkF0dGFjaCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IHJlbmRlclZpZXdUcmVlIH0gZnJvbSAnLi9iYXNlRGVidWdWaWV3LmpzJztcbmltcG9ydCB7IENPTlRJTlVFX0lELCBDT05USU5VRV9MQUJFTCwgRElTQ09OTkVDVF9JRCwgRElTQ09OTkVDVF9MQUJFTCwgUEFVU0VfSUQsIFBBVVNFX0xBQkVMLCBSRVNUQVJUX0xBQkVMLCBSRVNUQVJUX1NFU1NJT05fSUQsIFNURVBfSU5UT19JRCwgU1RFUF9JTlRPX0xBQkVMLCBTVEVQX09VVF9JRCwgU1RFUF9PVVRfTEFCRUwsIFNURVBfT1ZFUl9JRCwgU1RFUF9PVkVSX0xBQkVMLCBTVE9QX0lELCBTVE9QX0xBQkVMIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEaXNjb25uZWN0TWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuL2RlYnVnVG9vbEJhci5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxudHlwZSBDYWxsU3RhY2tJdGVtID0gSVN0YWNrRnJhbWUgfCBJVGhyZWFkIHwgSURlYnVnU2Vzc2lvbiB8IHN0cmluZyB8IFRocmVhZEFuZFNlc3Npb25JZHMgfCBJU3RhY2tGcmFtZVtdO1xuXG5pbnRlcmZhY2UgSUNhbGxTdGFja0l0ZW1Db250ZXh0IHtcblx0c2Vzc2lvbklkOiBzdHJpbmc7XG5cdHRocmVhZElkPzogc3RyaW5nO1xuXHRmcmFtZUlkPzogc3RyaW5nO1xuXHRmcmFtZU5hbWU/OiBzdHJpbmc7XG5cdGZyYW1lTG9jYXRpb24/OiB7IHJhbmdlOiBJUmFuZ2U7IHNvdXJjZTogRGVidWdQcm90b2NvbC5Tb3VyY2UgfTtcbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvbkNvbnRleHQoZWxlbWVudDogSURlYnVnU2Vzc2lvbik6IElDYWxsU3RhY2tJdGVtQ29udGV4dCB7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkOiBlbGVtZW50LmdldElkKClcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0VGhyZWFkQ29udGV4dChlbGVtZW50OiBJVGhyZWFkKTogSUNhbGxTdGFja0l0ZW1Db250ZXh0IHtcblx0cmV0dXJuIHtcblx0XHQuLi5nZXRTZXNzaW9uQ29udGV4dChlbGVtZW50LnNlc3Npb24pLFxuXHRcdHRocmVhZElkOiBlbGVtZW50LmdldElkKClcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0U3RhY2tGcmFtZUNvbnRleHQoZWxlbWVudDogU3RhY2tGcmFtZSk6IElDYWxsU3RhY2tJdGVtQ29udGV4dCB7XG5cdHJldHVybiB7XG5cdFx0Li4uZ2V0VGhyZWFkQ29udGV4dChlbGVtZW50LnRocmVhZCksXG5cdFx0ZnJhbWVJZDogZWxlbWVudC5nZXRJZCgpLFxuXHRcdGZyYW1lTmFtZTogZWxlbWVudC5uYW1lLFxuXHRcdGZyYW1lTG9jYXRpb246IHsgcmFuZ2U6IGVsZW1lbnQucmFuZ2UsIHNvdXJjZTogZWxlbWVudC5zb3VyY2UucmF3IH1cblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRleHQoZWxlbWVudDogQ2FsbFN0YWNrSXRlbSB8IG51bGwpOiBJQ2FsbFN0YWNrSXRlbUNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUpIHtcblx0XHRyZXR1cm4gZ2V0U3RhY2tGcmFtZUNvbnRleHQoZWxlbWVudCk7XG5cdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCkge1xuXHRcdHJldHVybiBnZXRUaHJlYWRDb250ZXh0KGVsZW1lbnQpO1xuXHR9IGVsc2UgaWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0cmV0dXJuIGdldFNlc3Npb25Db250ZXh0KGVsZW1lbnQpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLy8gRXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcyBjb250ZXh0LCBzaG91bGQgbm90IGJlIGNoYW5nZWQgZXZlbiB0aG91Z2ggaXQgaXMgbm90IGZ1bGx5IGRldGVybWluaXN0aWNcbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250ZXh0Rm9yQ29udHJpYnV0ZWRBY3Rpb25zKGVsZW1lbnQ6IENhbGxTdGFja0l0ZW0gfCBudWxsKTogc3RyaW5nIHwgbnVtYmVyIHtcblx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lKSB7XG5cdFx0aWYgKGVsZW1lbnQuc291cmNlLmluTWVtb3J5KSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5zb3VyY2UucmF3LnBhdGggfHwgZWxlbWVudC5zb3VyY2UucmVmZXJlbmNlIHx8IGVsZW1lbnQuc291cmNlLm5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnQuc291cmNlLnVyaS50b1N0cmluZygpO1xuXHR9XG5cdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkKSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQudGhyZWFkSWQ7XG5cdH1cblx0aWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuZ2V0SWQoKTtcblx0fVxuXG5cdHJldHVybiAnJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNwZWNpZmljU291cmNlTmFtZShzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSk6IHN0cmluZyB7XG5cdC8vIFRvIHJlZHVjZSBmbGFzaGluZyBvZiB0aGUgcGF0aCBuYW1lIGFuZCB0aGUgd2F5IHdlIGZldGNoIHN0YWNrIGZyYW1lc1xuXHQvLyBXZSBuZWVkIHRvIGNvbXB1dGUgdGhlIHNvdXJjZSBuYW1lIGJhc2VkIG9uIHRoZSBvdGhlciBmcmFtZXMgaW4gdGhlIHN0YWxlIGNhbGwgc3RhY2tcblx0bGV0IGNhbGxTdGFjayA9ICg8VGhyZWFkPnN0YWNrRnJhbWUudGhyZWFkKS5nZXRTdGFsZUNhbGxTdGFjaygpO1xuXHRjYWxsU3RhY2sgPSBjYWxsU3RhY2subGVuZ3RoID4gMCA/IGNhbGxTdGFjayA6IHN0YWNrRnJhbWUudGhyZWFkLmdldENhbGxTdGFjaygpO1xuXHRjb25zdCBvdGhlclNvdXJjZXMgPSBjYWxsU3RhY2subWFwKHNmID0+IHNmLnNvdXJjZSkuZmlsdGVyKHMgPT4gcyAhPT0gc3RhY2tGcmFtZS5zb3VyY2UpO1xuXHRsZXQgc3VmZml4TGVuZ3RoID0gMDtcblx0b3RoZXJTb3VyY2VzLmZvckVhY2gocyA9PiB7XG5cdFx0aWYgKHMubmFtZSA9PT0gc3RhY2tGcmFtZS5zb3VyY2UubmFtZSkge1xuXHRcdFx0c3VmZml4TGVuZ3RoID0gTWF0aC5tYXgoc3VmZml4TGVuZ3RoLCBjb21tb25TdWZmaXhMZW5ndGgoc3RhY2tGcmFtZS5zb3VyY2UudXJpLnBhdGgsIHMudXJpLnBhdGgpKTtcblx0XHR9XG5cdH0pO1xuXHRpZiAoc3VmZml4TGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHN0YWNrRnJhbWUuc291cmNlLm5hbWU7XG5cdH1cblxuXHRjb25zdCBmcm9tID0gTWF0aC5tYXgoMCwgc3RhY2tGcmFtZS5zb3VyY2UudXJpLnBhdGgubGFzdEluZGV4T2YocG9zaXguc2VwLCBzdGFja0ZyYW1lLnNvdXJjZS51cmkucGF0aC5sZW5ndGggLSBzdWZmaXhMZW5ndGggLSAxKSk7XG5cdHJldHVybiAoZnJvbSA+IDAgPyAnLi4uJyA6ICcnKSArIHN0YWNrRnJhbWUuc291cmNlLnVyaS5wYXRoLnN1YnN0cmluZyhmcm9tKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZXhwYW5kVG8oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJRGVidWdNb2RlbCwgQ2FsbFN0YWNrSXRlbSwgRnV6enlTY29yZT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKHNlc3Npb24ucGFyZW50U2Vzc2lvbikge1xuXHRcdGF3YWl0IGV4cGFuZFRvKHNlc3Npb24ucGFyZW50U2Vzc2lvbiwgdHJlZSk7XG5cdH1cblx0YXdhaXQgdHJlZS5leHBhbmQoc2Vzc2lvbik7XG59XG5cbmV4cG9ydCBjbGFzcyBDYWxsU3RhY2tWaWV3IGV4dGVuZHMgVmlld1BhbmUge1xuXHRwcml2YXRlIHN0YXRlTWVzc2FnZSE6IEhUTUxTcGFuRWxlbWVudDtcblx0cHJpdmF0ZSBzdGF0ZU1lc3NhZ2VMYWJlbCE6IEhUTUxTcGFuRWxlbWVudDtcblx0cHJpdmF0ZSBzdGF0ZU1lc3NhZ2VMYWJlbEhvdmVyITogSU1hbmFnZWRIb3Zlcjtcblx0cHJpdmF0ZSBvbkNhbGxTdGFja0NoYW5nZVNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBuZWVkc1JlZnJlc2ggPSBmYWxzZTtcblx0cHJpdmF0ZSBpZ25vcmVTZWxlY3Rpb25DaGFuZ2VkRXZlbnQgPSBmYWxzZTtcblx0cHJpdmF0ZSBpZ25vcmVGb2N1c1N0YWNrRnJhbWVFdmVudCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgZGF0YVNvdXJjZSE6IENhbGxTdGFja0RhdGFTb3VyY2U7XG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SURlYnVnTW9kZWwsIENhbGxTdGFja0l0ZW0sIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIGF1dG9FeHBhbmRlZFNlc3Npb25zID0gbmV3IFNldDxJRGVidWdTZXNzaW9uPigpO1xuXHRwcml2YXRlIHNlbGVjdGlvbk5lZWRzVXBkYXRlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdC8vIENyZWF0ZSBzY2hlZHVsZXIgdG8gcHJldmVudCB1bm5lY2Vzc2FyeSBmbGFzaGluZyBvZiB0cmVlIHdoZW4gcmVhY3RpbmcgdG8gY2hhbmdlc1xuXHRcdHRoaXMub25DYWxsU3RhY2tDaGFuZ2VTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcihhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBPbmx5IHNob3cgdGhlIGdsb2JhbCBwYXVzZSBtZXNzYWdlIGlmIHdlIGRvIG5vdCBkaXNwbGF5IHRocmVhZHMuXG5cdFx0XHQvLyBPdGhlcndpc2UgdGhlcmUgd2lsbCBiZSBhIHBhdXNlIG1lc3NhZ2UgcGVyIHRocmVhZCBhbmQgdGhlcmUgaXMgbm8gbmVlZCBmb3IgYSBnbG9iYWwgb25lLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCk7XG5cdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuYXV0b0V4cGFuZGVkU2Vzc2lvbnMuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGhyZWFkID0gc2Vzc2lvbnMubGVuZ3RoID09PSAxICYmIHNlc3Npb25zWzBdLmdldEFsbFRocmVhZHMoKS5sZW5ndGggPT09IDEgPyBzZXNzaW9uc1swXS5nZXRBbGxUaHJlYWRzKClbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzdG9wcGVkRGV0YWlscyA9IHNlc3Npb25zLmxlbmd0aCA9PT0gMSA/IHNlc3Npb25zWzBdLmdldFN0b3BwZWREZXRhaWxzKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc3RvcHBlZERldGFpbHMgJiYgKHRocmVhZCB8fCB0eXBlb2Ygc3RvcHBlZERldGFpbHMudGhyZWFkSWQgIT09ICdudW1iZXInKSkge1xuXHRcdFx0XHR0aGlzLnN0YXRlTWVzc2FnZUxhYmVsLnRleHRDb250ZW50ID0gc3RvcHBlZERlc2NyaXB0aW9uKHN0b3BwZWREZXRhaWxzKTtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbEhvdmVyLnVwZGF0ZShzdG9wcGVkVGV4dChzdG9wcGVkRGV0YWlscykpO1xuXHRcdFx0XHR0aGlzLnN0YXRlTWVzc2FnZUxhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2V4Y2VwdGlvbicsIHN0b3BwZWREZXRhaWxzLnJlYXNvbiA9PT0gJ2V4Y2VwdGlvbicpO1xuXHRcdFx0XHR0aGlzLnN0YXRlTWVzc2FnZS5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAxICYmIHNlc3Npb25zWzBdLnN0YXRlID09PSBTdGF0ZS5SdW5uaW5nKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGVNZXNzYWdlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSh7IGtleTogJ3J1bm5pbmcnLCBjb21tZW50OiBbJ2luZGljYXRlcyBzdGF0ZSddIH0sIFwiUnVubmluZ1wiKTtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbEhvdmVyLnVwZGF0ZShzZXNzaW9uc1swXS5nZXRMYWJlbCgpKTtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdleGNlcHRpb24nKTtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2UuaGlkZGVuID0gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnN0YXRlTWVzc2FnZS5oaWRkZW4gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVBY3Rpb25zKCk7XG5cblx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHRvRXhwYW5kID0gbmV3IFNldDxJRGVidWdTZXNzaW9uPigpO1xuXHRcdFx0XHRzZXNzaW9ucy5mb3JFYWNoKHMgPT4ge1xuXHRcdFx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgZXhwYW5kIHNlc3Npb25zIHRoYXQgaGF2ZSBjaGlsZHJlbiwgYnV0IG9ubHkgZG8gdGhpcyBvbmNlLlxuXHRcdFx0XHRcdGlmIChzLnBhcmVudFNlc3Npb24gJiYgIXRoaXMuYXV0b0V4cGFuZGVkU2Vzc2lvbnMuaGFzKHMucGFyZW50U2Vzc2lvbikpIHtcblx0XHRcdFx0XHRcdHRvRXhwYW5kLmFkZChzLnBhcmVudFNlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0b0V4cGFuZCkge1xuXHRcdFx0XHRcdGF3YWl0IGV4cGFuZFRvKHNlc3Npb24sIHRoaXMudHJlZSk7XG5cdFx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRTZXNzaW9ucy5hZGQoc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gSWdub3JlIHRyZWUgZXhwYW5kIGVycm9ycyBpZiBlbGVtZW50IG5vIGxvbmdlciBwcmVzZW50XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5zZWxlY3Rpb25OZWVkc1VwZGF0ZSkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGlvbk5lZWRzVXBkYXRlID0gZmFsc2U7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlVHJlZVNlbGVjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0sIDUwKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lciwgdGhpcy5vcHRpb25zLnRpdGxlKTtcblxuXHRcdHRoaXMuc3RhdGVNZXNzYWdlID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uY2FsbC1zdGFjay1zdGF0ZS1tZXNzYWdlJykpO1xuXHRcdHRoaXMuc3RhdGVNZXNzYWdlLmhpZGRlbiA9IHRydWU7XG5cdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbCA9IGRvbS5hcHBlbmQodGhpcy5zdGF0ZU1lc3NhZ2UsICQoJ3NwYW4ubGFiZWwnKSk7XG5cdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbEhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuc3RhdGVNZXNzYWdlLCAnJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVidWctcGFuZScpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy1jYWxsLXN0YWNrJyk7XG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IHJlbmRlclZpZXdUcmVlKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmRhdGFTb3VyY2UgPSBuZXcgQ2FsbFN0YWNrRGF0YVNvdXJjZSh0aGlzLmRlYnVnU2VydmljZSk7XG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElEZWJ1Z01vZGVsLCBDYWxsU3RhY2tJdGVtLCBGdXp6eVNjb3JlPiwgJ0NhbGxTdGFja1ZpZXcnLCB0cmVlQ29udGFpbmVyLCBuZXcgQ2FsbFN0YWNrRGVsZWdhdGUoKSwgbmV3IENhbGxTdGFja0NvbXByZXNzaW9uRGVsZWdhdGUodGhpcy5kZWJ1Z1NlcnZpY2UpLCBbXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zUmVuZGVyZXIpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUaHJlYWRzUmVuZGVyZXIpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdGFja0ZyYW1lc1JlbmRlcmVyKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXJyb3JzUmVuZGVyZXIpLFxuXHRcdFx0bmV3IExvYWRNb3JlUmVuZGVyZXIoKSxcblx0XHRcdG5ldyBTaG93TW9yZVJlbmRlcmVyKClcblx0XHRdLCB0aGlzLmRhdGFTb3VyY2UsIHtcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IENhbGxTdGFja0FjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0YXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuOiB0cnVlLFxuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IENhbGxTdGFja0l0ZW0pID0+IHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGBzaG93TW9yZSAke2VsZW1lbnRbMF0uZ2V0SWQoKX1gO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmdldElkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZTogQ2FsbFN0YWNrSXRlbSkgPT4ge1xuXHRcdFx0XHRcdGlmIChpc0RlYnVnU2Vzc2lvbihlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGUuZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBUaHJlYWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBgJHtlLm5hbWV9ICR7ZS5zdGF0ZUxhYmVsfWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgU3RhY2tGcmFtZSB8fCB0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFRocmVhZEFuZFNlc3Npb25JZHMpIHtcblx0XHRcdFx0XHRcdHJldHVybiBMb2FkTW9yZVJlbmRlcmVyLkxBQkVMO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2hvd01vcmVTdGFja0ZyYW1lczInLCBcIlNob3cgTW9yZSBTdGFjayBGcmFtZXNcIik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlOiBDYWxsU3RhY2tJdGVtW10pID0+IHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdEl0ZW0gPSBlWzBdO1xuXHRcdFx0XHRcdGlmIChpc0RlYnVnU2Vzc2lvbihmaXJzdEl0ZW0pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmlyc3RJdGVtLmdldExhYmVsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHR9KTtcblxuXHRcdENPTlRFWFRfQ0FMTFNUQUNLX0ZPQ1VTRUQuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRPcGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaWdub3JlU2VsZWN0aW9uQ2hhbmdlZEV2ZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9jdXNTdGFja0ZyYW1lID0gKHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkLCB0aHJlYWQ6IElUaHJlYWQgfCB1bmRlZmluZWQsIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIG9wdGlvbnM6IHsgZXhwbGljaXQ/OiBib29sZWFuOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgc2lkZUJ5U2lkZT86IGJvb2xlYW47IHBpbm5lZD86IGJvb2xlYW4gfSA9IHt9KSA9PiB7XG5cdFx0XHRcdHRoaXMuaWdub3JlRm9jdXNTdGFja0ZyYW1lRXZlbnQgPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZShzdGFja0ZyYW1lLCB0aHJlYWQsIHNlc3Npb24sIHsgLi4ub3B0aW9ucywgLi4ueyBleHBsaWNpdDogdHJ1ZSB9IH0pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuaWdub3JlRm9jdXNTdGFja0ZyYW1lRXZlbnQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU3RhY2tGcmFtZSkge1xuXHRcdFx0XHRjb25zdCBvcHRzID0ge1xuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRcdHNpZGVCeVNpZGU6IGUuc2lkZUJ5U2lkZSxcblx0XHRcdFx0XHRwaW5uZWQ6IGUuZWRpdG9yT3B0aW9ucy5waW5uZWRcblx0XHRcdFx0fTtcblx0XHRcdFx0Zm9jdXNTdGFja0ZyYW1lKGVsZW1lbnQsIGVsZW1lbnQudGhyZWFkLCBlbGVtZW50LnRocmVhZC5zZXNzaW9uLCBvcHRzKTtcblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkKSB7XG5cdFx0XHRcdGZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIGVsZW1lbnQsIGVsZW1lbnQuc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oZWxlbWVudCkpIHtcblx0XHRcdFx0Zm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBlbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkQW5kU2Vzc2lvbklkcykge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKGVsZW1lbnQuc2Vzc2lvbklkKTtcblx0XHRcdFx0Y29uc3QgdGhyZWFkID0gc2Vzc2lvbiAmJiBzZXNzaW9uLmdldFRocmVhZChlbGVtZW50LnRocmVhZElkKTtcblx0XHRcdFx0aWYgKHRocmVhZCkge1xuXHRcdFx0XHRcdGNvbnN0IHRvdGFsRnJhbWVzID0gdGhyZWFkLnN0b3BwZWREZXRhaWxzPy50b3RhbEZyYW1lcztcblx0XHRcdFx0XHRjb25zdCByZW1haW5pbmdGcmFtZXNDb3VudCA9IHR5cGVvZiB0b3RhbEZyYW1lcyA9PT0gJ251bWJlcicgPyAodG90YWxGcmFtZXMgLSB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHQvLyBHZXQgYWxsIHRoZSByZW1haW5pbmcgZnJhbWVzXG5cdFx0XHRcdFx0YXdhaXQgKDxUaHJlYWQ+dGhyZWFkKS5mZXRjaENhbGxTdGFjayhyZW1haW5pbmdGcmFtZXNDb3VudCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRcdFx0ZWxlbWVudC5mb3JFYWNoKHNmID0+IHRoaXMuZGF0YVNvdXJjZS5kZWVtcGhhc2l6ZWRTdGFja0ZyYW1lc1RvU2hvdy5hZGQoc2YpKTtcblx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUNhbGxTdGFjaygoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMub25DYWxsU3RhY2tDaGFuZ2VTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLm9uQ2FsbFN0YWNrQ2hhbmdlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IG9uRm9jdXNDaGFuZ2UgPSBFdmVudC5hbnk8dW5rbm93bj4odGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRGb2N1c1N0YWNrRnJhbWUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTZXNzaW9uKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkZvY3VzQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlnbm9yZUZvY3VzU3RhY2tGcmFtZUV2ZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnNlbGVjdGlvbk5lZWRzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMub25DYWxsU3RhY2tDaGFuZ2VTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGlvbk5lZWRzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVRyZWVTZWxlY3Rpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblxuXHRcdC8vIFNjaGVkdWxlIHRoZSB1cGRhdGUgb2YgdGhlIGNhbGwgc3RhY2sgdHJlZSBpZiB0aGUgdmlld2xldCBpcyBvcGVuZWQgYWZ0ZXIgYSBzZXNzaW9uIHN0YXJ0ZWQgIzE0Njg0XG5cdFx0aWYgKHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkKSB7XG5cdFx0XHR0aGlzLm9uQ2FsbFN0YWNrQ2hhbmdlU2NoZWR1bGVyLnNjaGVkdWxlKDApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlICYmIHRoaXMubmVlZHNSZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMub25DYWxsU3RhY2tDaGFuZ2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5vbkRpZE5ld1Nlc3Npb24ocyA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uTGlzdGVuZXJzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0XHRzZXNzaW9uTGlzdGVuZXJzLnB1c2gocy5vbkRpZENoYW5nZU5hbWUoKCkgPT4ge1xuXHRcdFx0XHQvLyB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4gaXMgY2FsbGVkIG9uIGEgZGVsYXkgYWZ0ZXIgYSBzZXNzaW9uIGlzIGFkZGVkLFxuXHRcdFx0XHQvLyBzbyBkb24ndCByZXJlbmRlciBpZiB0aGUgdHJlZSBkb2Vzbid0IGhhdmUgdGhlIG5vZGUgeWV0XG5cdFx0XHRcdGlmICh0aGlzLnRyZWUuaGFzTm9kZShzKSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5yZXJlbmRlcihzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5wdXNoKHMub25EaWRFbmRBZGFwdGVyKCgpID0+IGRpc3Bvc2Uoc2Vzc2lvbkxpc3RlbmVycykpKTtcblx0XHRcdGlmIChzLnBhcmVudFNlc3Npb24pIHtcblx0XHRcdFx0Ly8gQSBzZXNzaW9uIHdlIGFscmVhZHkgZXhwYW5kZWQgaGFzIGEgbmV3IGNoaWxkIHNlc3Npb24sIGFsbG93IHRvIGV4cGFuZCBpdCBhZ2Fpbi5cblx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRTZXNzaW9ucy5kZWxldGUocy5wYXJlbnRTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVHJlZVNlbGVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudHJlZSB8fCAhdGhpcy50cmVlLmdldElucHV0KCkpIHtcblx0XHRcdC8vIFRyZWUgbm90IGluaXRpYWxpemVkIHlldFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZVNlbGVjdGlvbkFuZFJldmVhbCA9IChlbGVtZW50OiBJU3RhY2tGcmFtZSB8IElEZWJ1Z1Nlc3Npb24pID0+IHtcblx0XHRcdHRoaXMuaWdub3JlU2VsZWN0aW9uQ2hhbmdlZEV2ZW50ID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW2VsZW1lbnRdKTtcblx0XHRcdFx0Ly8gSWYgdGhlIGVsZW1lbnQgaXMgb3V0c2lkZSBvZiB0aGUgc2NyZWVuIGJvdW5kcyxcblx0XHRcdFx0Ly8gcG9zaXRpb24gaXQgaW4gdGhlIG1pZGRsZVxuXHRcdFx0XHRpZiAodGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGVsZW1lbnQpID09PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnJldmVhbChlbGVtZW50LCAwLjUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwoZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHRcdFx0ZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuaWdub3JlU2VsZWN0aW9uQ2hhbmdlZEV2ZW50ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRUaHJlYWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRpZiAoIXRocmVhZCkge1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uQW5kUmV2ZWFsKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJZ25vcmUgZXJyb3JzIGZyb20gdGhpcyBleHBhbnNpb25zIGJlY2F1c2Ugd2UgYXJlIG5vdCBhd2FyZSBpZiB3ZSByZW5kZXJlZCB0aGUgdGhyZWFkcyBhbmQgc2Vzc2lvbnMgb3Igd2UgaGlkZSB0aGVtIHRvIGRlY2x1dHRlciB0aGUgdmlld1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZXhwYW5kVG8odGhyZWFkLnNlc3Npb24sIHRoaXMudHJlZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQodGhyZWFkKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXG5cdFx0XHRjb25zdCB0b1JldmVhbCA9IHN0YWNrRnJhbWUgfHwgc2Vzc2lvbjtcblx0XHRcdGlmICh0b1JldmVhbCkge1xuXHRcdFx0XHR1cGRhdGVTZWxlY3Rpb25BbmRSZXZlYWwodG9SZXZlYWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8Q2FsbFN0YWNrSXRlbT4pOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdGxldCBvdmVybGF5OiBbc3RyaW5nLCBDb250ZXh0S2V5VmFsdWVdW10gPSBbXTtcblx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oZWxlbWVudCkpIHtcblx0XHRcdG92ZXJsYXkgPSBnZXRTZXNzaW9uQ29udGV4dE92ZXJsYXkoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkKSB7XG5cdFx0XHRvdmVybGF5ID0gZ2V0VGhyZWFkQ29udGV4dE92ZXJsYXkoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgU3RhY2tGcmFtZSkge1xuXHRcdFx0b3ZlcmxheSA9IGdldFN0YWNrRnJhbWVDb250ZXh0T3ZlcmxheShlbGVtZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShvdmVybGF5KTtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRGVidWdDYWxsU3RhY2tDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGdldENvbnRleHRGb3JDb250cmlidXRlZEFjdGlvbnMoZWxlbWVudCksIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiByZXN1bHQuc2Vjb25kYXJ5LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGdldENvbnRleHQoZWxlbWVudClcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRocmVhZFRlbXBsYXRlRGF0YSB7XG5cdHRocmVhZDogSFRNTEVsZW1lbnQ7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRzdGF0ZUxhYmVsOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdGxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0ZWxlbWVudERpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcblx0dGVtcGxhdGVEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uVGVtcGxhdGVEYXRhIHtcblx0c2Vzc2lvbjogSFRNTEVsZW1lbnQ7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRzdGF0ZUxhYmVsOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdGxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0ZWxlbWVudERpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcblx0dGVtcGxhdGVEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuaW50ZXJmYWNlIElFcnJvclRlbXBsYXRlRGF0YSB7XG5cdGxhYmVsOiBIVE1MRWxlbWVudDtcblx0dGVtcGxhdGVEaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJTGFiZWxUZW1wbGF0ZURhdGEge1xuXHRsYWJlbDogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJU3RhY2tGcmFtZVRlbXBsYXRlRGF0YSB7XG5cdHN0YWNrRnJhbWU6IEhUTUxFbGVtZW50O1xuXHRmaWxlOiBIVE1MRWxlbWVudDtcblx0ZmlsZU5hbWU6IEhUTUxFbGVtZW50O1xuXHRsaW5lTnVtYmVyOiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHR0ZW1wbGF0ZURpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmZ1bmN0aW9uIGdldFNlc3Npb25Db250ZXh0T3ZlcmxheShzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogW3N0cmluZywgQ29udGV4dEtleVZhbHVlXVtdIHtcblx0cmV0dXJuIFtcblx0XHRbQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9UWVBFLmtleSwgJ3Nlc3Npb24nXSxcblx0XHRbQ09OVEVYVF9DQUxMU1RBQ0tfU0VTU0lPTl9JU19BVFRBQ0gua2V5LCBpc1Nlc3Npb25BdHRhY2goc2Vzc2lvbildLFxuXHRcdFtDT05URVhUX0NBTExTVEFDS19JVEVNX1NUT1BQRUQua2V5LCBzZXNzaW9uLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkXSxcblx0XHRbQ09OVEVYVF9DQUxMU1RBQ0tfU0VTU0lPTl9IQVNfT05FX1RIUkVBRC5rZXksIHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpLmxlbmd0aCA9PT0gMV0sXG5cdF07XG59XG5cbmNsYXNzIFNlc3Npb25zUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElEZWJ1Z1Nlc3Npb24sIEZ1enp5U2NvcmUsIElTZXNzaW9uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBTZXNzaW9uc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXNzaW9uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBzZXNzaW9uID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9uJykpO1xuXHRcdGRvbS5hcHBlbmQoc2Vzc2lvbiwgJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5jYWxsc3RhY2tWaWV3U2Vzc2lvbikpKTtcblx0XHRjb25zdCBuYW1lID0gZG9tLmFwcGVuZChzZXNzaW9uLCAkKCcubmFtZScpKTtcblx0XHRjb25zdCBzdGF0ZUxhYmVsID0gZG9tLmFwcGVuZChzZXNzaW9uLCAkKCdzcGFuLnN0YXRlLmxhYmVsLm1vbmFjby1jb3VudC1iYWRnZS5sb25nJykpO1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwobmFtZSkpO1xuXG5cdFx0Y29uc3Qgc3RvcEFjdGlvblZpZXdJdGVtRGlzcG9zYWJsZXMgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgQWN0aW9uQmFyKHNlc3Npb24sIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKChhY3Rpb24uaWQgPT09IFNUT1BfSUQgfHwgYWN0aW9uLmlkID09PSBESVNDT05ORUNUX0lEKSAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHN0b3BBY3Rpb25WaWV3SXRlbURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gY3JlYXRlRGlzY29ubmVjdE1lbnVJdGVtQWN0aW9uKGFjdGlvbiBhcyBNZW51SXRlbUFjdGlvbiwgc3RvcEFjdGlvblZpZXdJdGVtRGlzcG9zYWJsZXMsIGFjY2Vzc29yLCB7IC4uLm9wdGlvbnMsIG1lbnVBc0NoaWxkOiBmYWxzZSB9KSk7XG5cdFx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHJldHVybiB7IHNlc3Npb24sIG5hbWUsIHN0YXRlTGFiZWwsIGxhYmVsLCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlLCB0ZW1wbGF0ZURpc3Bvc2FibGUgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElEZWJ1Z1Nlc3Npb24sIEZ1enp5U2NvcmU+LCBfOiBudW1iZXIsIGRhdGE6IElTZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5kb1JlbmRlckVsZW1lbnQoZWxlbWVudC5lbGVtZW50LCBjcmVhdGVNYXRjaGVzKGVsZW1lbnQuZmlsdGVyRGF0YSksIGRhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElEZWJ1Z1Nlc3Npb24+LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNlc3Npb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IGNyZWF0ZU1hdGNoZXMobm9kZS5maWx0ZXJEYXRhKTtcblx0XHR0aGlzLmRvUmVuZGVyRWxlbWVudChsYXN0RWxlbWVudCwgbWF0Y2hlcywgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZW5kZXJFbGVtZW50KHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIG1hdGNoZXM6IElNYXRjaFtdLCBkYXRhOiBJU2Vzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25Ib3ZlciA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLnNlc3Npb24sIGxvY2FsaXplKHsga2V5OiAnc2Vzc2lvbicsIGNvbW1lbnQ6IFsnU2Vzc2lvbiBpcyBhIG5vdW4nXSB9LCBcIlNlc3Npb25cIikpKTtcblx0XHRkYXRhLmxhYmVsLnNldChzZXNzaW9uLmdldExhYmVsKCksIG1hdGNoZXMpO1xuXHRcdGNvbnN0IHN0b3BwZWREZXRhaWxzID0gc2Vzc2lvbi5nZXRTdG9wcGVkRGV0YWlscygpO1xuXHRcdGNvbnN0IHRocmVhZCA9IHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpLmZpbmQodCA9PiB0LnN0b3BwZWQpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoZ2V0U2Vzc2lvbkNvbnRleHRPdmVybGF5KHNlc3Npb24pKTtcblx0XHRjb25zdCBtZW51ID0gZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5EZWJ1Z0NhbGxTdGFja0NvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZXR1cEFjdGlvbkJhciA9ICgpID0+IHtcblx0XHRcdGRhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBhcmc6IGdldENvbnRleHRGb3JDb250cmlidXRlZEFjdGlvbnMoc2Vzc2lvbiksIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCAnaW5saW5lJyk7XG5cdFx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0Ly8gV2UgbmVlZCB0byBzZXQgb3VyIGludGVybmFsIGNvbnRleHQgb24gdGhlIGFjdGlvbiBiYXIsIHNpbmNlIG91ciBjb21tYW5kcyBkZXBlbmQgb24gdGhhdCBvbmVcblx0XHRcdC8vIFdoaWxlIHRoZSBleHRlcm5hbCBjb250ZXh0IG91ciBleHRlbnNpb25zIHJlbHkgb25cblx0XHRcdGRhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBnZXRDb250ZXh0KHNlc3Npb24pO1xuXHRcdH07XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQobWVudS5vbkRpZENoYW5nZSgoKSA9PiBzZXR1cEFjdGlvbkJhcigpKSk7XG5cdFx0c2V0dXBBY3Rpb25CYXIoKTtcblxuXHRcdGRhdGEuc3RhdGVMYWJlbC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cblx0XHRpZiAoc3RvcHBlZERldGFpbHMpIHtcblx0XHRcdGRhdGEuc3RhdGVMYWJlbC50ZXh0Q29udGVudCA9IHN0b3BwZWREZXNjcmlwdGlvbihzdG9wcGVkRGV0YWlscyk7XG5cdFx0XHRzZXNzaW9uSG92ZXIudXBkYXRlKGAke3Nlc3Npb24uZ2V0TGFiZWwoKX06ICR7c3RvcHBlZFRleHQoc3RvcHBlZERldGFpbHMpfWApO1xuXHRcdFx0ZGF0YS5zdGF0ZUxhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2V4Y2VwdGlvbicsIHN0b3BwZWREZXRhaWxzLnJlYXNvbiA9PT0gJ2V4Y2VwdGlvbicpO1xuXHRcdH0gZWxzZSBpZiAodGhyZWFkICYmIHRocmVhZC5zdG9wcGVkRGV0YWlscykge1xuXHRcdFx0ZGF0YS5zdGF0ZUxhYmVsLnRleHRDb250ZW50ID0gc3RvcHBlZERlc2NyaXB0aW9uKHRocmVhZC5zdG9wcGVkRGV0YWlscyk7XG5cdFx0XHRzZXNzaW9uSG92ZXIudXBkYXRlKGAke3Nlc3Npb24uZ2V0TGFiZWwoKX06ICR7c3RvcHBlZFRleHQodGhyZWFkLnN0b3BwZWREZXRhaWxzKX1gKTtcblx0XHRcdGRhdGEuc3RhdGVMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdleGNlcHRpb24nLCB0aHJlYWQuc3RvcHBlZERldGFpbHMucmVhc29uID09PSAnZXhjZXB0aW9uJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuc3RhdGVMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKHsga2V5OiAncnVubmluZycsIGNvbW1lbnQ6IFsnaW5kaWNhdGVzIHN0YXRlJ10gfSwgXCJSdW5uaW5nXCIpO1xuXHRcdFx0ZGF0YS5zdGF0ZUxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2V4Y2VwdGlvbicpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPElEZWJ1Z1Nlc3Npb24sIEZ1enp5U2NvcmU+LCBfOiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNlc3Npb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SURlYnVnU2Vzc2lvbj4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VGhyZWFkQ29udGV4dE92ZXJsYXkodGhyZWFkOiBJVGhyZWFkKTogW3N0cmluZywgQ29udGV4dEtleVZhbHVlXVtdIHtcblx0cmV0dXJuIFtcblx0XHRbQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9UWVBFLmtleSwgJ3RocmVhZCddLFxuXHRcdFtDT05URVhUX0NBTExTVEFDS19JVEVNX1NUT1BQRUQua2V5LCB0aHJlYWQuc3RvcHBlZF1cblx0XTtcbn1cblxuY2xhc3MgVGhyZWFkc1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJVGhyZWFkLCBGdXp6eVNjb3JlLCBJVGhyZWFkVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd0aHJlYWQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFRocmVhZHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVGhyZWFkVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0aHJlYWQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnRocmVhZCcpKTtcblx0XHRjb25zdCBuYW1lID0gZG9tLmFwcGVuZCh0aHJlYWQsICQoJy5uYW1lJykpO1xuXHRcdGNvbnN0IHN0YXRlTGFiZWwgPSBkb20uYXBwZW5kKHRocmVhZCwgJCgnc3Bhbi5zdGF0ZS5sYWJlbC5tb25hY28tY291bnQtYmFkZ2UubG9uZycpKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwobmFtZSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgQWN0aW9uQmFyKHRocmVhZCkpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0cmV0dXJuIHsgdGhyZWFkLCBuYW1lLCBzdGF0ZUxhYmVsLCBsYWJlbCwgYWN0aW9uQmFyLCBlbGVtZW50RGlzcG9zYWJsZSwgdGVtcGxhdGVEaXNwb3NhYmxlIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJVGhyZWFkLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElUaHJlYWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB0aHJlYWQgPSBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEudGhyZWFkLCB0aHJlYWQubmFtZSkpO1xuXHRcdGRhdGEubGFiZWwuc2V0KHRocmVhZC5uYW1lLCBjcmVhdGVNYXRjaGVzKGVsZW1lbnQuZmlsdGVyRGF0YSkpO1xuXHRcdGRhdGEuc3RhdGVMYWJlbC50ZXh0Q29udGVudCA9IHRocmVhZC5zdGF0ZUxhYmVsO1xuXHRcdGRhdGEuc3RhdGVMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdleGNlcHRpb24nLCB0aHJlYWQuc3RvcHBlZERldGFpbHM/LnJlYXNvbiA9PT0gJ2V4Y2VwdGlvbicpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoZ2V0VGhyZWFkQ29udGV4dE92ZXJsYXkodGhyZWFkKSk7XG5cdFx0Y29uc3QgbWVudSA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuRGVidWdDYWxsU3RhY2tDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Y29uc3Qgc2V0dXBBY3Rpb25CYXIgPSAoKSA9PiB7XG5cdFx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXG5cdFx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgYXJnOiBnZXRDb250ZXh0Rm9yQ29udHJpYnV0ZWRBY3Rpb25zKHRocmVhZCksIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCAnaW5saW5lJyk7XG5cdFx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0Ly8gV2UgbmVlZCB0byBzZXQgb3VyIGludGVybmFsIGNvbnRleHQgb24gdGhlIGFjdGlvbiBiYXIsIHNpbmNlIG91ciBjb21tYW5kcyBkZXBlbmQgb24gdGhhdCBvbmVcblx0XHRcdC8vIFdoaWxlIHRoZSBleHRlcm5hbCBjb250ZXh0IG91ciBleHRlbnNpb25zIHJlbHkgb25cblx0XHRcdGRhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBnZXRDb250ZXh0KHRocmVhZCk7XG5cdFx0fTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZChtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHNldHVwQWN0aW9uQmFyKCkpKTtcblx0XHRzZXR1cEFjdGlvbkJhcigpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKF9ub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJVGhyZWFkPiwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCBfdGVtcGxhdGVEYXRhOiBJVGhyZWFkVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElUcmVlTm9kZTxJVGhyZWFkLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRocmVhZFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRocmVhZFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFN0YWNrRnJhbWVDb250ZXh0T3ZlcmxheShzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSk6IFtzdHJpbmcsIENvbnRleHRLZXlWYWx1ZV1bXSB7XG5cdHJldHVybiBbXG5cdFx0W0NPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRS5rZXksICdzdGFja0ZyYW1lJ10sXG5cdFx0W0NPTlRFWFRfU1RBQ0tfRlJBTUVfU1VQUE9SVFNfUkVTVEFSVC5rZXksIHN0YWNrRnJhbWUuY2FuUmVzdGFydF1cblx0XTtcbn1cblxuY2xhc3MgU3RhY2tGcmFtZXNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVN0YWNrRnJhbWUsIEZ1enp5U2NvcmUsIElTdGFja0ZyYW1lVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzdGFja0ZyYW1lJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBTdGFja0ZyYW1lc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTdGFja0ZyYW1lVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBzdGFja0ZyYW1lID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5zdGFjay1mcmFtZScpKTtcblx0XHRjb25zdCBsYWJlbERpdiA9IGRvbS5hcHBlbmQoc3RhY2tGcmFtZSwgJCgnc3Bhbi5sYWJlbC5leHByZXNzaW9uJykpO1xuXHRcdGNvbnN0IGZpbGUgPSBkb20uYXBwZW5kKHN0YWNrRnJhbWUsICQoJy5maWxlJykpO1xuXHRcdGNvbnN0IGZpbGVOYW1lID0gZG9tLmFwcGVuZChmaWxlLCAkKCdzcGFuLmZpbGUtbmFtZScpKTtcblx0XHRjb25zdCB3cmFwcGVyID0gZG9tLmFwcGVuZChmaWxlLCAkKCdzcGFuLmxpbmUtbnVtYmVyLXdyYXBwZXInKSk7XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IGRvbS5hcHBlbmQod3JhcHBlciwgJCgnc3Bhbi5saW5lLW51bWJlci5tb25hY28tY291bnQtYmFkZ2UnKSk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQoZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwobGFiZWxEaXYpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBBY3Rpb25CYXIoc3RhY2tGcmFtZSkpO1xuXG5cdFx0cmV0dXJuIHsgZmlsZSwgZmlsZU5hbWUsIGxhYmVsLCBsaW5lTnVtYmVyLCBzdGFja0ZyYW1lLCBhY3Rpb25CYXIsIHRlbXBsYXRlRGlzcG9zYWJsZSwgZWxlbWVudERpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJU3RhY2tGcmFtZSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElTdGFja0ZyYW1lVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGVsZW1lbnQuZWxlbWVudDtcblx0XHRkYXRhLnN0YWNrRnJhbWUuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhc3RhY2tGcmFtZS5zb3VyY2UgfHwgIXN0YWNrRnJhbWUuc291cmNlLmF2YWlsYWJsZSB8fCBpc0ZyYW1lRGVlbXBoYXNpemVkKHN0YWNrRnJhbWUpKTtcblx0XHRkYXRhLnN0YWNrRnJhbWUuY2xhc3NMaXN0LnRvZ2dsZSgnbGFiZWwnLCBzdGFja0ZyYW1lLnByZXNlbnRhdGlvbkhpbnQgPT09ICdsYWJlbCcpO1xuXHRcdGNvbnN0IGhhc0FjdGlvbnMgPSAhIXN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzUmVzdGFydEZyYW1lICYmIHN0YWNrRnJhbWUucHJlc2VudGF0aW9uSGludCAhPT0gJ2xhYmVsJyAmJiBzdGFja0ZyYW1lLnByZXNlbnRhdGlvbkhpbnQgIT09ICdzdWJ0bGUnICYmIHN0YWNrRnJhbWUuY2FuUmVzdGFydDtcblx0XHRkYXRhLnN0YWNrRnJhbWUuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWFjdGlvbnMnLCBoYXNBY3Rpb25zKTtcblxuXHRcdGxldCB0aXRsZSA9IHN0YWNrRnJhbWUuc291cmNlLmluTWVtb3J5ID8gc3RhY2tGcmFtZS5zb3VyY2UudXJpLnBhdGggOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChzdGFja0ZyYW1lLnNvdXJjZS51cmkpO1xuXHRcdGlmIChzdGFja0ZyYW1lLnNvdXJjZS5yYXcub3JpZ2luKSB7XG5cdFx0XHR0aXRsZSArPSBgXFxuJHtzdGFja0ZyYW1lLnNvdXJjZS5yYXcub3JpZ2lufWA7XG5cdFx0fVxuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5maWxlLCB0aXRsZSkpO1xuXG5cdFx0ZGF0YS5sYWJlbC5zZXQoc3RhY2tGcmFtZS5uYW1lLCBjcmVhdGVNYXRjaGVzKGVsZW1lbnQuZmlsdGVyRGF0YSksIHN0YWNrRnJhbWUubmFtZSk7XG5cdFx0ZGF0YS5maWxlTmFtZS50ZXh0Q29udGVudCA9IGdldFNwZWNpZmljU291cmNlTmFtZShzdGFja0ZyYW1lKTtcblx0XHRpZiAoc3RhY2tGcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGF0YS5saW5lTnVtYmVyLnRleHRDb250ZW50ID0gYCR7c3RhY2tGcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXJ9YDtcblx0XHRcdGlmIChzdGFja0ZyYW1lLnJhbmdlLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRcdGRhdGEubGluZU51bWJlci50ZXh0Q29udGVudCArPSBgOiR7c3RhY2tGcmFtZS5yYW5nZS5zdGFydENvbHVtbn1gO1xuXHRcdFx0fVxuXHRcdFx0ZGF0YS5saW5lTnVtYmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3VuYXZhaWxhYmxlJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEubGluZU51bWJlci5jbGFzc0xpc3QuYWRkKCd1bmF2YWlsYWJsZScpO1xuXHRcdH1cblxuXHRcdGRhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0aWYgKGhhc0FjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKCdkZWJ1Zy5jYWxsU3RhY2sucmVzdGFydEZyYW1lJywgbG9jYWxpemUoJ3Jlc3RhcnRGcmFtZScsIFwiUmVzdGFydCBGcmFtZVwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLmRlYnVnUmVzdGFydEZyYW1lKSwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHN0YWNrRnJhbWUucmVzdGFydCgpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKGFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElTdGFja0ZyYW1lPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVN0YWNrRnJhbWVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElTdGFja0ZyYW1lLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU3RhY2tGcmFtZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTdGFja0ZyYW1lVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRXJyb3JzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPHN0cmluZywgRnV6enlTY29yZSwgSUVycm9yVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdlcnJvcic7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gRXJyb3JzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRXJyb3JUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5lcnJvcicpKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCB0ZW1wbGF0ZURpc3Bvc2FibGU6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8c3RyaW5nLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUVycm9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZXJyb3IgPSBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0ZGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IGVycm9yO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5sYWJlbCwgZXJyb3IpKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxzdHJpbmc+LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXJyb3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRXJyb3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuY2xhc3MgTG9hZE1vcmVSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8VGhyZWFkQW5kU2Vzc2lvbklkcywgRnV6enlTY29yZSwgSUxhYmVsVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdsb2FkTW9yZSc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdsb2FkQWxsU3RhY2tGcmFtZXMnLCBcIkxvYWQgTW9yZSBTdGFjayBGcmFtZXNcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBMb2FkTW9yZVJlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElMYWJlbFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmxvYWQtYWxsJykpO1xuXHRcdGxhYmVsLnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZSh0ZXh0TGlua0ZvcmVncm91bmQpO1xuXHRcdHJldHVybiB7IGxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxUaHJlYWRBbmRTZXNzaW9uSWRzLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUxhYmVsVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IExvYWRNb3JlUmVuZGVyZXIuTEFCRUw7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VGhyZWFkQW5kU2Vzc2lvbklkcz4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElMYWJlbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElMYWJlbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxufVxuXG5jbGFzcyBTaG93TW9yZVJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJU3RhY2tGcmFtZVtdLCBGdXp6eVNjb3JlLCBJTGFiZWxUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nob3dNb3JlJztcblxuXHRjb25zdHJ1Y3RvcigpIHsgfVxuXG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU2hvd01vcmVSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTGFiZWxUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5zaG93LW1vcmUnKSk7XG5cdFx0bGFiZWwuc3R5bGUuY29sb3IgPSBhc0Nzc1ZhcmlhYmxlKHRleHRMaW5rRm9yZWdyb3VuZCk7XG5cdFx0cmV0dXJuIHsgbGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElTdGFja0ZyYW1lW10sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJTGFiZWxUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBzdGFja0ZyYW1lcyA9IGVsZW1lbnQuZWxlbWVudDtcblx0XHRpZiAoc3RhY2tGcmFtZXMuZXZlcnkoc2YgPT4gISEoc2Yuc291cmNlICYmIHNmLnNvdXJjZS5vcmlnaW4gJiYgc2Yuc291cmNlLm9yaWdpbiA9PT0gc3RhY2tGcmFtZXNbMF0uc291cmNlLm9yaWdpbikpKSB7XG5cdFx0XHRkYXRhLmxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Nob3dNb3JlQW5kT3JpZ2luJywgXCJTaG93IHswfSBNb3JlOiB7MX1cIiwgc3RhY2tGcmFtZXMubGVuZ3RoLCBzdGFja0ZyYW1lc1swXS5zb3VyY2Uub3JpZ2luKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzaG93TW9yZVN0YWNrRnJhbWVzJywgXCJTaG93IHswfSBNb3JlIFN0YWNrIEZyYW1lc1wiLCBzdGFja0ZyYW1lcy5sZW5ndGgpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU3RhY2tGcmFtZVtdPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUxhYmVsVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUxhYmVsVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmNsYXNzIENhbGxTdGFja0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8Q2FsbFN0YWNrSXRlbT4ge1xuXG5cdGdldEhlaWdodChlbGVtZW50OiBDYWxsU3RhY2tJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUgJiYgZWxlbWVudC5wcmVzZW50YXRpb25IaW50ID09PSAnbGFiZWwnKSB7XG5cdFx0XHRyZXR1cm4gMTY7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkQW5kU2Vzc2lvbklkcyB8fCBlbGVtZW50IGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRcdHJldHVybiAxNjtcblx0XHR9XG5cblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IENhbGxTdGFja0l0ZW0pOiBzdHJpbmcge1xuXHRcdGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25zUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkKSB7XG5cdFx0XHRyZXR1cm4gVGhyZWFkc1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUpIHtcblx0XHRcdHJldHVybiBTdGFja0ZyYW1lc1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gRXJyb3JzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkQW5kU2Vzc2lvbklkcykge1xuXHRcdFx0cmV0dXJuIExvYWRNb3JlUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0Ly8gZWxlbWVudCBpbnN0YW5jZW9mIEFycmF5XG5cdFx0cmV0dXJuIFNob3dNb3JlUmVuZGVyZXIuSUQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gc3RvcHBlZFRleHQoc3RvcHBlZERldGFpbHM6IElSYXdTdG9wcGVkRGV0YWlscyk6IHN0cmluZyB7XG5cdHJldHVybiBzdG9wcGVkRGV0YWlscy50ZXh0ID8/IHN0b3BwZWREZXNjcmlwdGlvbihzdG9wcGVkRGV0YWlscyk7XG59XG5cbmZ1bmN0aW9uIHN0b3BwZWREZXNjcmlwdGlvbihzdG9wcGVkRGV0YWlsczogSVJhd1N0b3BwZWREZXRhaWxzKTogc3RyaW5nIHtcblx0cmV0dXJuIHN0b3BwZWREZXRhaWxzLmRlc2NyaXB0aW9uIHx8XG5cdFx0KHN0b3BwZWREZXRhaWxzLnJlYXNvbiA/IGxvY2FsaXplKHsga2V5OiAncGF1c2VkT24nLCBjb21tZW50OiBbJ2luZGljYXRlcyByZWFzb24gZm9yIHByb2dyYW0gYmVpbmcgcGF1c2VkJ10gfSwgXCJQYXVzZWQgb24gezB9XCIsIHN0b3BwZWREZXRhaWxzLnJlYXNvbikgOiBsb2NhbGl6ZSgncGF1c2VkJywgXCJQYXVzZWRcIikpO1xufVxuXG5mdW5jdGlvbiBpc0RlYnVnTW9kZWwob2JqOiB1bmtub3duKTogb2JqIGlzIElEZWJ1Z01vZGVsIHtcblx0cmV0dXJuICEhb2JqICYmIHR5cGVvZiAob2JqIGFzIElEZWJ1Z01vZGVsKS5nZXRTZXNzaW9ucyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNEZWJ1Z1Nlc3Npb24ob2JqOiB1bmtub3duKTogb2JqIGlzIElEZWJ1Z1Nlc3Npb24ge1xuXHRyZXR1cm4gISFvYmogJiYgdHlwZW9mIChvYmogYXMgSURlYnVnU2Vzc2lvbikuZ2V0QWxsVGhyZWFkcyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuY2xhc3MgQ2FsbFN0YWNrRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SURlYnVnTW9kZWwsIENhbGxTdGFja0l0ZW0+IHtcblx0ZGVlbXBoYXNpemVkU3RhY2tGcmFtZXNUb1Nob3cgPSBuZXcgV2Vha1NldDxJU3RhY2tGcmFtZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSkgeyB9XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogSURlYnVnTW9kZWwgfCBDYWxsU3RhY2tJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCB0aHJlYWRzID0gZWxlbWVudC5nZXRBbGxUaHJlYWRzKCk7XG5cdFx0XHRyZXR1cm4gKHRocmVhZHMubGVuZ3RoID4gMSkgfHwgKHRocmVhZHMubGVuZ3RoID09PSAxICYmIHRocmVhZHNbMF0uc3RvcHBlZCkgfHwgISEodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnBhcmVudFNlc3Npb24gPT09IGVsZW1lbnQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNEZWJ1Z01vZGVsKGVsZW1lbnQpIHx8IChlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkICYmIGVsZW1lbnQuc3RvcHBlZCk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50OiBJRGVidWdNb2RlbCB8IENhbGxTdGFja0l0ZW0pOiBQcm9taXNlPENhbGxTdGFja0l0ZW1bXT4ge1xuXHRcdGlmIChpc0RlYnVnTW9kZWwoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gZWxlbWVudC5nZXRTZXNzaW9ucygpO1xuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAxIHx8IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmlzTXVsdGlTZXNzaW9uVmlldygpKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc2Vzc2lvbnMuZmlsdGVyKHMgPT4gIXMucGFyZW50U2Vzc2lvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aHJlYWRzID0gc2Vzc2lvbnNbMF0uZ2V0QWxsVGhyZWFkcygpO1xuXHRcdFx0Ly8gT25seSBzaG93IHRoZSB0aHJlYWRzIGluIHRoZSBjYWxsIHN0YWNrIGlmIHRoZXJlIGlzIG1vcmUgdGhhbiAxIHRocmVhZC5cblx0XHRcdHJldHVybiB0aHJlYWRzLmxlbmd0aCA9PT0gMSA/IHRoaXMuZ2V0VGhyZWFkQ2hpbGRyZW4oPFRocmVhZD50aHJlYWRzWzBdKSA6IFByb21pc2UucmVzb2x2ZSh0aHJlYWRzKTtcblx0XHR9IGVsc2UgaWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBjaGlsZFNlc3Npb25zID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpLmZpbHRlcihzID0+IHMucGFyZW50U2Vzc2lvbiA9PT0gZWxlbWVudCk7XG5cdFx0XHRjb25zdCB0aHJlYWRzOiBDYWxsU3RhY2tJdGVtW10gPSBlbGVtZW50LmdldEFsbFRocmVhZHMoKTtcblx0XHRcdGlmICh0aHJlYWRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBEbyBub3Qgc2hvdyB0aHJlYWQgd2hlbiB0aGVyZSBpcyBvbmx5IG9uZSB0byBiZSBjb21wYWN0LlxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHRoaXMuZ2V0VGhyZWFkQ2hpbGRyZW4oPFRocmVhZD50aHJlYWRzWzBdKTtcblx0XHRcdFx0cmV0dXJuIGNoaWxkcmVuLmNvbmNhdChjaGlsZFNlc3Npb25zKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aHJlYWRzLmNvbmNhdChjaGlsZFNlc3Npb25zKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFRocmVhZENoaWxkcmVuKDxUaHJlYWQ+ZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUaHJlYWRDaGlsZHJlbih0aHJlYWQ6IFRocmVhZCk6IFByb21pc2U8Q2FsbFN0YWNrSXRlbVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VGhyZWFkQ2FsbHN0YWNrKHRocmVhZCkudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHQvLyBDaGVjayBpZiBzb21lIHN0YWNrIGZyYW1lcyBzaG91bGQgYmUgaGlkZGVuIHVuZGVyIGEgcGFyZW50IGVsZW1lbnQgc2luY2UgdGhleSBhcmUgZGVlbXBoYXNpemVkXG5cdFx0XHRjb25zdCByZXN1bHQ6IENhbGxTdGFja0l0ZW1bXSA9IFtdO1xuXHRcdFx0Y2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUgJiYgY2hpbGQuc291cmNlICYmIGlzRnJhbWVEZWVtcGhhc2l6ZWQoY2hpbGQpKSB7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIHVzZXIgY2xpY2tlZCB0byBzaG93IHRoZSBkZWVtcGhhc2l6ZWQgc291cmNlXG5cdFx0XHRcdFx0aWYgKCF0aGlzLmRlZW1waGFzaXplZFN0YWNrRnJhbWVzVG9TaG93LmhhcyhjaGlsZCkpIHtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxhc3QgPSByZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdFx0XHRpZiAobGFzdCBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gQ29sbGVjdCBhbGwgdGhlIHN0YWNrZnJhbWVzIHRoYXQgd2lsbCBiZSBcImNvbGxhcHNlZFwiXG5cdFx0XHRcdFx0XHRcdFx0bGFzdC5wdXNoKGNoaWxkKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgbmV4dENoaWxkID0gaW5kZXggPCBjaGlsZHJlbi5sZW5ndGggLSAxID8gY2hpbGRyZW5baW5kZXggKyAxXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGlmIChuZXh0Q2hpbGQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lICYmIG5leHRDaGlsZC5zb3VyY2UgJiYgaXNGcmFtZURlZW1waGFzaXplZChuZXh0Q2hpbGQpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFN0YXJ0IGNvbGxlY3Rpbmcgc3RhY2tmcmFtZXMgdGhhdCB3aWxsIGJlIFwiY29sbGFwc2VkXCJcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goW2NoaWxkXSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXN1bHQucHVzaChjaGlsZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VGhyZWFkQ2FsbHN0YWNrKHRocmVhZDogVGhyZWFkKTogUHJvbWlzZTxBcnJheTxJU3RhY2tGcmFtZSB8IHN0cmluZyB8IFRocmVhZEFuZFNlc3Npb25JZHM+PiB7XG5cdFx0bGV0IGNhbGxTdGFjazogQXJyYXk8SVN0YWNrRnJhbWUgfCBzdHJpbmcgfCBUaHJlYWRBbmRTZXNzaW9uSWRzPiA9IHRocmVhZC5nZXRDYWxsU3RhY2soKTtcblx0XHRpZiAoIWNhbGxTdGFjayB8fCAhY2FsbFN0YWNrLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhyZWFkLmZldGNoQ2FsbFN0YWNrKCk7XG5cdFx0XHRjYWxsU3RhY2sgPSB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbGxTdGFjay5sZW5ndGggPT09IDEgJiYgdGhyZWFkLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGVsYXllZFN0YWNrVHJhY2VMb2FkaW5nICYmIHRocmVhZC5zdG9wcGVkRGV0YWlscyAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzID4gMSkge1xuXHRcdFx0Ly8gVG8gcmVkdWNlIGZsYXNoaW5nIG9mIHRoZSBjYWxsIHN0YWNrIHZpZXcgc2ltcGx5IGFwcGVuZCB0aGUgc3RhbGUgY2FsbCBzdGFja1xuXHRcdFx0Ly8gb25jZSB3ZSBoYXZlIHRoZSBjb3JyZWN0IGRhdGEgdGhlIHRyZWUgd2lsbCByZWZyZXNoIGFuZCB3ZSB3aWxsIG5vIGxvbmdlciBkaXNwbGF5IGl0LlxuXHRcdFx0Y2FsbFN0YWNrID0gY2FsbFN0YWNrLmNvbmNhdCh0aHJlYWQuZ2V0U3RhbGVDYWxsU3RhY2soKS5zbGljZSgxKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRocmVhZC5zdG9wcGVkRGV0YWlscyAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMuZnJhbWVzRXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRjYWxsU3RhY2sgPSBjYWxsU3RhY2suY29uY2F0KFt0aHJlYWQuc3RvcHBlZERldGFpbHMuZnJhbWVzRXJyb3JNZXNzYWdlXSk7XG5cdFx0fVxuXHRcdGlmICghdGhyZWFkLnJlYWNoZWRFbmRPZkNhbGxTdGFjayAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMpIHtcblx0XHRcdGNhbGxTdGFjayA9IGNhbGxTdGFjay5jb25jYXQoW25ldyBUaHJlYWRBbmRTZXNzaW9uSWRzKHRocmVhZC5zZXNzaW9uLmdldElkKCksIHRocmVhZC50aHJlYWRJZCldKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2FsbFN0YWNrO1xuXHR9XG59XG5cbmNsYXNzIENhbGxTdGFja0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPENhbGxTdGFja0l0ZW0+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoeyBjb21tZW50OiBbJ0RlYnVnIGlzIGEgbm91biBpbiB0aGlzIGNvbnRleHQsIG5vdCBhIHZlcmIuJ10sIGtleTogJ2NhbGxTdGFja0FyaWFMYWJlbCcgfSwgXCJEZWJ1ZyBDYWxsIFN0YWNrXCIpO1xuXHR9XG5cblx0Z2V0V2lkZ2V0Um9sZSgpOiBBcmlhUm9sZSB7XG5cdFx0Ly8gVXNlIHRyZWVncmlkIGFzIGEgcm9sZSBzaW5jZSBlYWNoIGVsZW1lbnQgY2FuIGhhdmUgYWRkaXRpb25hbCBhY3Rpb25zIGluc2lkZSAjMTQ2MjEwXG5cdFx0cmV0dXJuICd0cmVlZ3JpZCc7XG5cdH1cblxuXHRnZXRSb2xlKF9lbGVtZW50OiBDYWxsU3RhY2tJdGVtKTogQXJpYVJvbGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiAncm93Jztcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBDYWxsU3RhY2tJdGVtKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKHsga2V5OiAndGhyZWFkQXJpYUxhYmVsJywgY29tbWVudDogWydQbGFjZWhvbGRlcnMgc3RhbmQgZm9yIHRoZSB0aHJlYWQgbmFtZSBhbmQgdGhlIHRocmVhZCBzdGF0ZS5Gb3IgZXhhbXBsZSBcIlRocmVhZCAxXCIgYW5kIFwiU3RvcHBlZCddIH0sIFwiVGhyZWFkIHswfSB7MX1cIiwgZWxlbWVudC5uYW1lLCBlbGVtZW50LnN0YXRlTGFiZWwpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc3RhY2tGcmFtZUFyaWFMYWJlbCcsIFwiU3RhY2sgRnJhbWUgezB9LCBsaW5lIHsxfSwgezJ9XCIsIGVsZW1lbnQubmFtZSwgZWxlbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGdldFNwZWNpZmljU291cmNlTmFtZShlbGVtZW50KSk7XG5cdFx0fVxuXHRcdGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgdGhyZWFkID0gZWxlbWVudC5nZXRBbGxUaHJlYWRzKCkuZmluZCh0ID0+IHQuc3RvcHBlZCk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRocmVhZCA/IHRocmVhZC5zdGF0ZUxhYmVsIDogbG9jYWxpemUoeyBrZXk6ICdydW5uaW5nJywgY29tbWVudDogWydpbmRpY2F0ZXMgc3RhdGUnXSB9LCBcIlJ1bm5pbmdcIik7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoeyBrZXk6ICdzZXNzaW9uTGFiZWwnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVycyBzdGFuZCBmb3IgdGhlIHNlc3Npb24gbmFtZSBhbmQgdGhlIHNlc3Npb24gc3RhdGUuIEZvciBleGFtcGxlIFwiTGF1bmNoIFByb2dyYW1cIiBhbmQgXCJSdW5uaW5nXCInXSB9LCBcIlNlc3Npb24gezB9IHsxfVwiLCBlbGVtZW50LmdldExhYmVsKCksIHN0YXRlKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBlbGVtZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2hvd01vcmVTdGFja0ZyYW1lcycsIFwiU2hvdyB7MH0gTW9yZSBTdGFjayBGcmFtZXNcIiwgZWxlbWVudC5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdC8vIGVsZW1lbnQgaW5zdGFuY2VvZiBUaHJlYWRBbmRTZXNzaW9uSWRzXG5cdFx0cmV0dXJuIExvYWRNb3JlUmVuZGVyZXIuTEFCRUw7XG5cdH1cbn1cblxuY2xhc3MgQ2FsbFN0YWNrQ29tcHJlc3Npb25EZWxlZ2F0ZSBpbXBsZW1lbnRzIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxDYWxsU3RhY2tJdGVtPiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UpIHsgfVxuXG5cdGlzSW5jb21wcmVzc2libGUoc3RhdDogQ2FsbFN0YWNrSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0RlYnVnU2Vzc2lvbihzdGF0KSkge1xuXHRcdFx0aWYgKHN0YXQuY29tcGFjdCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKTtcblx0XHRcdGlmIChzZXNzaW9ucy5zb21lKHMgPT4gcy5wYXJlbnRTZXNzaW9uID09PSBzdGF0ICYmIHMuY29tcGFjdCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29sbGFwc2UgZXh0ZW5kcyBWaWV3QWN0aW9uPENhbGxTdGFja1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjYWxsU3RhY2suY29sbGFwc2UnLFxuXHRcdFx0dmlld0lkOiBDQUxMU1RBQ0tfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKGdldFN0YXRlTGFiZWwoU3RhdGUuU3RvcHBlZCkpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDQUxMU1RBQ0tfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IENhbGxTdGFja1ZpZXcpIHtcblx0XHR2aWV3LmNvbGxhcHNlQWxsKCk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiByZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcgfCBJQ29tbWFuZEFjdGlvblRpdGxlLCBpY29uOiBJY29uLCB3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiwgb3JkZXI6IG51bWJlciwgcHJlY29uZGl0aW9uPzogQ29udGV4dEtleUV4cHJlc3Npb24pOiB2b2lkIHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5EZWJ1Z0NhbGxTdGFja0NvbnRleHQsIHtcblx0XHRncm91cDogJ2lubGluZScsXG5cdFx0b3JkZXIsXG5cdFx0d2hlbixcblx0XHRjb21tYW5kOiB7IGlkLCB0aXRsZSwgaWNvbiwgcHJlY29uZGl0aW9uIH1cblx0fSk7XG59XG5cbmNvbnN0IHRocmVhZE9yU2Vzc2lvbldpdGhPbmVUaHJlYWQgPSBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUuaXNFcXVhbFRvKCd0aHJlYWQnKSwgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRS5pc0VxdWFsVG8oJ3Nlc3Npb24nKSwgQ09OVEVYVF9DQUxMU1RBQ0tfU0VTU0lPTl9IQVNfT05FX1RIUkVBRCkpITtcbnJlZ2lzdGVyQ2FsbFN0YWNrSW5saW5lTWVudUl0ZW0oUEFVU0VfSUQsIFBBVVNFX0xBQkVMLCBpY29ucy5kZWJ1Z1BhdXNlLCBDb250ZXh0S2V5RXhwci5hbmQodGhyZWFkT3JTZXNzaW9uV2l0aE9uZVRocmVhZCwgQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9TVE9QUEVELnRvTmVnYXRlZCgpKSEsIDEwLCBDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19OT19ERUJVRy50b05lZ2F0ZWQoKSk7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKENPTlRJTlVFX0lELCBDT05USU5VRV9MQUJFTCwgaWNvbnMuZGVidWdDb250aW51ZSwgQ29udGV4dEtleUV4cHIuYW5kKHRocmVhZE9yU2Vzc2lvbldpdGhPbmVUaHJlYWQsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fU1RPUFBFRCkhLCAxMCk7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKFNURVBfT1ZFUl9JRCwgU1RFUF9PVkVSX0xBQkVMLCBpY29ucy5kZWJ1Z1N0ZXBPdmVyLCB0aHJlYWRPclNlc3Npb25XaXRoT25lVGhyZWFkLCAyMCwgQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9TVE9QUEVEKTtcbnJlZ2lzdGVyQ2FsbFN0YWNrSW5saW5lTWVudUl0ZW0oU1RFUF9JTlRPX0lELCBTVEVQX0lOVE9fTEFCRUwsIGljb25zLmRlYnVnU3RlcEludG8sIHRocmVhZE9yU2Vzc2lvbldpdGhPbmVUaHJlYWQsIDMwLCBDT05URVhUX0NBTExTVEFDS19JVEVNX1NUT1BQRUQpO1xucmVnaXN0ZXJDYWxsU3RhY2tJbmxpbmVNZW51SXRlbShTVEVQX09VVF9JRCwgU1RFUF9PVVRfTEFCRUwsIGljb25zLmRlYnVnU3RlcE91dCwgdGhyZWFkT3JTZXNzaW9uV2l0aE9uZVRocmVhZCwgNDAsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fU1RPUFBFRCk7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKFJFU1RBUlRfU0VTU0lPTl9JRCwgUkVTVEFSVF9MQUJFTCwgaWNvbnMuZGVidWdSZXN0YXJ0LCBDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUuaXNFcXVhbFRvKCdzZXNzaW9uJyksIDUwKTtcbnJlZ2lzdGVyQ2FsbFN0YWNrSW5saW5lTWVudUl0ZW0oU1RPUF9JRCwgU1RPUF9MQUJFTCwgaWNvbnMuZGVidWdTdG9wLCBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9DQUxMU1RBQ0tfU0VTU0lPTl9JU19BVFRBQ0gudG9OZWdhdGVkKCksIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRS5pc0VxdWFsVG8oJ3Nlc3Npb24nKSkhLCA2MCk7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKERJU0NPTk5FQ1RfSUQsIERJU0NPTk5FQ1RfTEFCRUwsIGljb25zLmRlYnVnRGlzY29ubmVjdCwgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQ0FMTFNUQUNLX1NFU1NJT05fSVNfQVRUQUNILCBDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUuaXNFcXVhbFRvKCdzZXNzaW9uJykpISwgNjApO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUywrQkFBK0I7QUFPeEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBeUM7QUFDbEQsU0FBUyxpQkFBaUIsZUFBNEI7QUFDdEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMscUJBQXFCLHVCQUF1Qix5QkFBeUIsa0NBQWtDO0FBQ2hILFNBQVMsY0FBYyxRQUFRLGdCQUFnQixjQUFjLGlCQUFpQix5QkFBeUI7QUFDdkcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBdUQsMEJBQTBCO0FBQzFGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FB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
