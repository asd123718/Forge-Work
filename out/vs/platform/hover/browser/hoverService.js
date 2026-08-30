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
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { registerThemingParticipant } from "../../theme/common/themeService.js";
import { editorHoverBorder } from "../../theme/common/colorRegistry.js";
import { IHoverService } from "./hover.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { HoverWidget } from "./hoverWidget.js";
import { ContextView, ContextViewDOMPosition } from "../../../base/browser/ui/contextview/contextview.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { addDisposableListener, EventType, getActiveElement, isAncestorOfActiveElement, isAncestor, getWindow, isHTMLElement, isEditableElement } from "../../../base/browser/dom.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { ResultKind } from "../../keybinding/common/keybindingResolver.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { ILayoutService } from "../../layout/browser/layoutService.js";
import { mainWindow } from "../../../base/browser/window.js";
import { HoverStyle, isManagedHoverTooltipMarkdownString } from "../../../base/browser/ui/hover/hover.js";
import { ManagedHoverWidget } from "./updatableHoverWidget.js";
import { timeout, TimeoutTimer } from "../../../base/common/async.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { isNumber, isString } from "../../../base/common/types.js";
import { KeyChord, KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../keybinding/common/keybindingsRegistry.js";
import { stripIcons } from "../../../base/common/iconLabels.js";
const MAX_HOVER_NESTING_DEPTH = 3;
let HoverService = class extends Disposable {
  constructor(_instantiationService, _configurationService, contextMenuService, _keybindingService, _layoutService, _accessibilityService) {
    super();
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._keybindingService = _keybindingService;
    this._layoutService = _layoutService;
    this._accessibilityService = _accessibilityService;
    /**
     * Stack of currently visible hovers. The last entry is the topmost hover.
     * This enables nested hovers where hovering inside a hover can show another hover.
     */
    this._hoverStack = [];
    this._currentDelayedHoverWasShown = false;
    this._delayedHovers = /* @__PURE__ */ new Map();
    this._managedHovers = /* @__PURE__ */ new Map();
    this._register(contextMenuService.onDidShowContextMenu(() => this.hideHover()));
    this._register(KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: "workbench.action.showHover",
      weight: KeybindingWeight.EditorCore,
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
      handler: () => {
        this._showAndFocusHoverForActiveElement();
      }
    }));
  }
  /**
   * Gets the current (topmost) hover from the stack, if any.
   */
  get _currentHover() {
    return this._hoverStack.at(-1)?.hover;
  }
  /**
   * Gets the current (topmost) hover options from the stack, if any.
   */
  get _currentHoverOptions() {
    return this._hoverStack.at(-1)?.options;
  }
  /**
   * Returns whether the target element is inside any of the hovers in the stack.
   * If it is, returns the index of the containing hover, otherwise returns -1.
   */
  _getContainingHoverIndex(target) {
    const targetElements = isHTMLElement(target) ? [target] : target.targetElements;
    for (let i = this._hoverStack.length - 1; i >= 0; i--) {
      for (const targetElement of targetElements) {
        if (isAncestor(targetElement, this._hoverStack[i].hover.domNode)) {
          return i;
        }
      }
    }
    return -1;
  }
  showInstantHover(options, focus, skipLastFocusedUpdate, dontShow) {
    const hover = this._createHover(options, skipLastFocusedUpdate);
    if (!hover) {
      return void 0;
    }
    this._showHover(hover, options, focus);
    return hover.hover;
  }
  showDelayedHover(options, lifecycleOptions) {
    if (options.id === void 0) {
      options.id = getHoverIdFromContent(options.content);
    }
    if (!this._currentDelayedHover || this._currentDelayedHoverWasShown) {
      if (this._currentHover?.isLocked && this._getContainingHoverIndex(options.target) < 0) {
        return void 0;
      }
      if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
        return this._currentHover;
      }
      if (this._currentHover && !this._currentHover.isDisposed && this._currentDelayedHoverGroupId !== void 0 && this._currentDelayedHoverGroupId === lifecycleOptions?.groupId) {
        return this.showInstantHover({
          ...options,
          appearance: {
            ...options.appearance,
            skipFadeInAnimation: true
          }
        });
      }
    } else if (this._currentDelayedHover && getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
      return this._currentDelayedHover;
    }
    const hover = this._createHover(options, void 0);
    if (!hover) {
      this._currentDelayedHover = void 0;
      this._currentDelayedHoverWasShown = false;
      this._currentDelayedHoverGroupId = void 0;
      return void 0;
    }
    this._currentDelayedHover = hover.hover;
    this._currentDelayedHoverWasShown = false;
    this._currentDelayedHoverGroupId = lifecycleOptions?.groupId;
    const delay = lifecycleOptions?.reducedDelay ? this._configurationService.getValue("workbench.hover.reducedDelay") : this._configurationService.getValue("workbench.hover.delay");
    timeout(delay).then(() => {
      if (hover.hover && !hover.hover.isDisposed) {
        this._currentDelayedHoverWasShown = true;
        this._showHover(hover, options);
      }
    });
    return hover.hover;
  }
  setupDelayedHover(target, options, lifecycleOptions) {
    const resolveHoverOptions = (e) => {
      const resolved = {
        ...typeof options === "function" ? options() : options,
        target
      };
      if (resolved.style === HoverStyle.Mouse && e) {
        resolved.target = resolveMouseStyleHoverTarget(target, e);
      }
      return resolved;
    };
    return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
  }
  setupDelayedHoverAtMouse(target, options, lifecycleOptions) {
    const resolveHoverOptions = (e) => ({
      ...typeof options === "function" ? options() : options,
      target: e ? resolveMouseStyleHoverTarget(target, e) : target
    });
    return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
  }
  _setupDelayedHover(target, resolveHoverOptions, lifecycleOptions) {
    const store = new DisposableStore();
    store.add(addDisposableListener(target, EventType.MOUSE_OVER, (e) => {
      this.showDelayedHover(resolveHoverOptions(e), {
        groupId: lifecycleOptions?.groupId,
        reducedDelay: lifecycleOptions?.reducedDelay
      });
    }));
    if (lifecycleOptions?.setupKeyboardEvents) {
      store.add(addDisposableListener(target, EventType.KEY_DOWN, (e) => {
        const evt = new StandardKeyboardEvent(e);
        if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
          this.showInstantHover(resolveHoverOptions(), true);
        }
      }));
    }
    this._delayedHovers.set(target, { show: (focus) => {
      this.showInstantHover(resolveHoverOptions(), focus);
    } });
    store.add(toDisposable(() => this._delayedHovers.delete(target)));
    return store;
  }
  _createHover(options, skipLastFocusedUpdate) {
    this._currentDelayedHover?.dispose();
    this._currentDelayedHover = void 0;
    if (options.content === "") {
      return void 0;
    }
    if (options.id === void 0) {
      options.id = getHoverIdFromContent(options.content);
    }
    const containingHoverIndex = this._getContainingHoverIndex(options.target);
    const isNesting = containingHoverIndex >= 0;
    if (isNesting) {
      if (this._hoverStack.length >= MAX_HOVER_NESTING_DEPTH) {
        return void 0;
      }
    } else {
      if (this._currentHover?.isLocked) {
        return void 0;
      }
      if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
        return void 0;
      }
    }
    this._lastHoverOptions = options;
    const trapFocus = options.trapFocus || this._accessibilityService.isScreenReaderOptimized();
    const activeElement = getActiveElement();
    let lastFocusedElementBeforeOpen;
    if (!skipLastFocusedUpdate) {
      if (trapFocus && activeElement) {
        if (!activeElement.classList.contains("monaco-hover")) {
          lastFocusedElementBeforeOpen = activeElement;
        }
      }
    }
    const hoverDisposables = new DisposableStore();
    const hover = this._instantiationService.createInstance(HoverWidget, options);
    if (options.persistence?.sticky) {
      hover.isLocked = true;
    }
    if (options.position?.hoverPosition && !isNumber(options.position.hoverPosition)) {
      options.target = {
        targetElements: isHTMLElement(options.target) ? [options.target] : options.target.targetElements,
        x: options.position.hoverPosition.x + 10
      };
    }
    hover.onDispose(() => {
      const stackIndex = this._hoverStack.findIndex((entry) => entry.hover === hover);
      if (stackIndex >= 0) {
        const entry = this._hoverStack[stackIndex];
        const hoverWasFocused = isAncestorOfActiveElement(hover.domNode);
        if (hoverWasFocused && entry.lastFocusedElementBeforeOpen) {
          entry.lastFocusedElementBeforeOpen.focus();
        }
        while (this._hoverStack.length > stackIndex + 1) {
          const nestedEntry = this._hoverStack.pop();
          nestedEntry.contextView.dispose();
          nestedEntry.hover.dispose();
        }
        this._hoverStack.splice(stackIndex, 1);
        entry.contextView.dispose();
      }
      hoverDisposables.dispose();
    }, void 0, hoverDisposables);
    if (!options.container) {
      const targetElement = isHTMLElement(options.target) ? options.target : options.target.targetElements[0];
      options.container = this._layoutService.getContainer(getWindow(targetElement));
    }
    hoverDisposables.add(addDisposableListener(getWindow(options.container).document, EventType.MOUSE_DOWN, (e) => {
      if (!isAncestor(e.target, hover.domNode)) {
        this._hideHoverAndDescendants(hover);
      }
    }));
    if (!options.persistence?.sticky) {
      if ("targetElements" in options.target) {
        for (const element of options.target.targetElements) {
          hoverDisposables.add(addDisposableListener(element, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
        }
      } else {
        hoverDisposables.add(addDisposableListener(options.target, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
      }
      const focusedElement = getActiveElement();
      if (focusedElement) {
        const focusedElementDocument = getWindow(focusedElement).document;
        hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_DOWN, (e) => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
        hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_DOWN, (e) => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
        hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_UP, (e) => this._keyUp(e, hover)));
        hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_UP, (e) => this._keyUp(e, hover)));
      }
    }
    if ("IntersectionObserver" in mainWindow) {
      const observer = new IntersectionObserver((e) => this._intersectionChange(e, hover), { threshold: 0 });
      const firstTargetElement = "targetElements" in options.target ? options.target.targetElements[0] : options.target;
      observer.observe(firstTargetElement);
      hoverDisposables.add(toDisposable(() => observer.disconnect()));
    }
    return { hover, lastFocusedElementBeforeOpen, store: hoverDisposables };
  }
  _showHover(result, options, focus) {
    const { hover, lastFocusedElementBeforeOpen, store } = result;
    const containingHoverIndex = this._getContainingHoverIndex(options.target);
    const isNesting = containingHoverIndex >= 0;
    if (!isNesting) {
      this._hideAllHovers();
    } else {
      for (let i = this._hoverStack.length - 1; i > containingHoverIndex; i--) {
        this._hoverStack[i].hover.dispose();
      }
      this._hoverStack.length = containingHoverIndex + 1;
    }
    if (isNesting) {
      for (let i = 0; i <= containingHoverIndex; i++) {
        store.add(this._hoverStack[i].hover.addMouseTrackingElement(hover.domNode));
      }
    }
    const container = options.container ?? this._layoutService.getContainer(getWindow(isHTMLElement(options.target) ? options.target : options.target.targetElements[0]));
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    const stackEntry = {
      hover,
      options,
      contextView,
      lastFocusedElementBeforeOpen
    };
    this._hoverStack.push(stackEntry);
    const delegate = new HoverContextViewDelegate(hover, focus, this._hoverStack.length);
    contextView.show(delegate);
    store.add(hover.onRequestLayout(() => contextView.layout()));
    if (focus || options.persistence?.sticky) {
      const targetWindow = getWindow(container);
      store.add(addDisposableListener(targetWindow, EventType.RESIZE, () => contextView.layout()));
    }
    if (options.onDidHide) {
      const onDidHide = options.onDidHide;
      store.add(toDisposable(() => onDidHide()));
    }
    options.onDidShow?.();
  }
  /**
   * Hides a specific hover and all hovers nested inside it.
   */
  _hideHoverAndDescendants(hover) {
    const stackIndex = this._hoverStack.findIndex((entry) => entry.hover === hover);
    if (stackIndex < 0) {
      return;
    }
    for (let i = this._hoverStack.length - 1; i >= stackIndex; i--) {
      this._hoverStack[i].hover.dispose();
    }
    this._hoverStack.length = stackIndex;
  }
  /**
   * Hides all hovers in the stack.
   */
  _hideAllHovers() {
    for (let i = this._hoverStack.length - 1; i >= 0; i--) {
      this._hoverStack[i].hover.dispose();
    }
    this._hoverStack.length = 0;
  }
  hideHover(force) {
    if (this._hoverStack.length === 0) {
      return;
    }
    if (!force && this._currentHover?.isLocked) {
      return;
    }
    this.doHideHover();
  }
  doHideHover() {
    const length = this._hoverStack.length;
    this._hoverStack[length - 1]?.hover.dispose();
    this._hoverStack.length = length - 1;
  }
  _intersectionChange(entries, hover) {
    const entry = entries[entries.length - 1];
    if (!entry.isIntersecting) {
      hover.dispose();
    }
  }
  showAndFocusLastHover() {
    if (!this._lastHoverOptions) {
      return;
    }
    this.showInstantHover(this._lastHoverOptions, true, true);
  }
  _showAndFocusHoverForActiveElement() {
    let activeElement = getActiveElement();
    while (activeElement) {
      const hover = this._delayedHovers.get(activeElement) ?? this._managedHovers.get(activeElement);
      if (hover) {
        hover.show(true);
        return;
      }
      activeElement = activeElement.parentElement;
    }
  }
  _keyDown(e, hover, hideOnKeyDown) {
    if (e.key === "Alt") {
      for (const entry of this._hoverStack) {
        entry.hover.isLocked = true;
      }
      return;
    }
    const event = new StandardKeyboardEvent(e);
    const keybinding = this._keybindingService.resolveKeyboardEvent(event);
    if (keybinding.getSingleModifierDispatchChords().some((value) => !!value) || this._keybindingService.softDispatch(event, event.target).kind !== ResultKind.NoMatchingKb) {
      return;
    }
    if (hideOnKeyDown && (!this._currentHoverOptions?.trapFocus || e.key !== "Tab")) {
      const stackEntry = this._hoverStack.find((entry) => entry.hover === hover);
      this._hideHoverAndDescendants(hover);
      stackEntry?.lastFocusedElementBeforeOpen?.focus();
    }
  }
  _keyUp(e, hover) {
    if (e.key === "Alt") {
      for (const entry of this._hoverStack) {
        if (!entry.options.persistence?.sticky) {
          entry.hover.isLocked = false;
        }
      }
      const anyMouseIn = this._hoverStack.some((entry) => entry.hover.isMouseIn);
      if (!anyMouseIn) {
        const topEntry = this._hoverStack[this._hoverStack.length - 1];
        this._hideAllHovers();
        topEntry?.lastFocusedElementBeforeOpen?.focus();
      }
    }
  }
  // TODO: Investigate performance of this function. There seems to be a lot of content created
  //       and thrown away on start up
  setupManagedHover(hoverDelegate, targetElement, content, options) {
    if (hoverDelegate.showNativeHover) {
      return setupNativeHover(targetElement, content);
    }
    targetElement.setAttribute("custom-hover", "true");
    if (targetElement.title !== "") {
      console.warn("HTML element already has a title attribute, which will conflict with the custom hover. Please remove the title attribute.");
      targetElement.title = "";
    }
    let hoverPreparation;
    let hoverWidget;
    const hideHover = (disposeWidget, disposePreparation) => {
      const hadHover = hoverWidget !== void 0;
      if (disposeWidget) {
        hoverWidget?.dispose();
        hoverWidget = void 0;
      }
      if (disposePreparation) {
        hoverPreparation?.dispose();
        hoverPreparation = void 0;
      }
      if (hadHover) {
        hoverDelegate.onDidHideHover?.();
        hoverWidget = void 0;
      }
    };
    const triggerShowHover = (delay, focus, target, trapFocus) => {
      return new TimeoutTimer(async () => {
        if (!hoverWidget || hoverWidget.isDisposed) {
          hoverWidget = new ManagedHoverWidget(hoverDelegate, target || targetElement, delay > 0);
          await hoverWidget.update(typeof content === "function" ? content() : content, focus, { ...options, trapFocus });
        }
      }, delay);
    };
    const store = new DisposableStore();
    let isMouseDown = false;
    store.add(addDisposableListener(targetElement, EventType.MOUSE_DOWN, () => {
      isMouseDown = true;
      hideHover(true, true);
    }, true));
    store.add(addDisposableListener(targetElement, EventType.MOUSE_UP, () => {
      isMouseDown = false;
    }, true));
    store.add(addDisposableListener(targetElement, EventType.MOUSE_LEAVE, (e) => {
      isMouseDown = false;
      hideHover(false, e.fromElement === targetElement);
    }, true));
    store.add(addDisposableListener(targetElement, EventType.MOUSE_OVER, (e) => {
      if (hoverPreparation) {
        return;
      }
      const mouseOverStore = new DisposableStore();
      const target = {
        targetElements: [targetElement],
        dispose: () => {
        }
      };
      if (hoverDelegate.placement === void 0 || hoverDelegate.placement === "mouse") {
        const onMouseMove = (e2) => {
          target.x = e2.x + 10;
          if (!eventIsRelatedToTarget(e2, targetElement)) {
            hideHover(true, true);
          }
        };
        mouseOverStore.add(addDisposableListener(targetElement, EventType.MOUSE_MOVE, onMouseMove, true));
      }
      hoverPreparation = mouseOverStore;
      if (!eventIsRelatedToTarget(e, targetElement)) {
        return;
      }
      mouseOverStore.add(triggerShowHover(typeof hoverDelegate.delay === "function" ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
    }, true));
    const onFocus = (e) => {
      if (isMouseDown || hoverPreparation) {
        return;
      }
      if (hoverWidget?.isDisposed) {
        hoverWidget = void 0;
      }
      const fromHover = isHTMLElement(e.relatedTarget) && e.relatedTarget.closest(".monaco-hover");
      if (fromHover || !e.relatedTarget) {
        return;
      }
      if (!eventIsRelatedToTarget(e, targetElement)) {
        return;
      }
      const target = {
        targetElements: [targetElement],
        dispose: () => {
        }
      };
      const toDispose = new DisposableStore();
      const onBlur = () => hideHover(true, true);
      toDispose.add(addDisposableListener(targetElement, EventType.BLUR, onBlur, true));
      toDispose.add(triggerShowHover(typeof hoverDelegate.delay === "function" ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
      hoverPreparation = toDispose;
    };
    if (!isEditableElement(targetElement)) {
      store.add(addDisposableListener(targetElement, EventType.FOCUS, onFocus, true));
    }
    const hover = {
      show: (focus) => {
        hideHover(false, true);
        triggerShowHover(0, focus, void 0, focus);
      },
      hide: () => {
        hideHover(true, true);
      },
      update: async (newContent, hoverOptions) => {
        content = newContent;
        await hoverWidget?.update(content, void 0, hoverOptions);
      },
      dispose: () => {
        this._managedHovers.delete(targetElement);
        store.dispose();
        hideHover(true, true);
      }
    };
    this._managedHovers.set(targetElement, hover);
    return hover;
  }
  showManagedHover(target) {
    const hover = this._managedHovers.get(target);
    if (hover) {
      hover.show(true);
    }
  }
  dispose() {
    this._managedHovers.forEach((hover) => hover.dispose());
    super.dispose();
  }
};
HoverService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, ILayoutService),
  __decorateParam(5, IAccessibilityService)
], HoverService);
function getHoverOptionsIdentity(options) {
  if (options === void 0) {
    return void 0;
  }
  return options?.id ?? options;
}
function getHoverIdFromContent(content) {
  if (isHTMLElement(content)) {
    return void 0;
  }
  if (typeof content === "string") {
    return content.toString();
  }
  return content.value;
}
function getStringContent(contentOrFactory) {
  const content = typeof contentOrFactory === "function" ? contentOrFactory() : contentOrFactory;
  if (isString(content)) {
    return stripIcons(content);
  }
  if (isManagedHoverTooltipMarkdownString(content)) {
    return content.markdownNotSupportedFallback;
  }
  return void 0;
}
function setupNativeHover(targetElement, content) {
  function updateTitle(title) {
    if (title) {
      targetElement.setAttribute("title", title);
    } else {
      targetElement.removeAttribute("title");
    }
  }
  updateTitle(getStringContent(content));
  return {
    update: (content2) => updateTitle(getStringContent(content2)),
    show: () => {
    },
    hide: () => {
    },
    dispose: () => updateTitle(void 0)
  };
}
class HoverContextViewDelegate {
  constructor(_hover, _focus = false, stackDepth = 1) {
    this._hover = _hover;
    this._focus = _focus;
    this.layer = stackDepth;
  }
  get anchorPosition() {
    return this._hover.anchor;
  }
  render(container) {
    this._hover.render(container);
    if (this._focus) {
      this._hover.focus();
    }
    return this._hover;
  }
  getAnchor() {
    return {
      x: this._hover.x,
      y: this._hover.y
    };
  }
  layout() {
    this._hover.layout();
  }
}
function eventIsRelatedToTarget(event, target) {
  return isHTMLElement(event.target) && getHoverTargetElement(event.target, target) === target;
}
function getHoverTargetElement(element, stopElement) {
  stopElement = stopElement ?? getWindow(element).document.body;
  while (!element.hasAttribute("custom-hover") && element !== stopElement) {
    element = element.parentElement;
  }
  return element;
}
function resolveMouseStyleHoverTarget(target, e) {
  return {
    targetElements: [target],
    x: e.x + 10
  };
}
registerSingleton(IHoverService, HoverService, InstantiationType.Delayed);
registerThemingParticipant((theme, collector) => {
  const hoverBorder = theme.getColor(editorHoverBorder);
  if (hoverBorder) {
    collector.addRule(`.monaco-hover.workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
    collector.addRule(`.monaco-hover.workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
  }
});
export {
  HoverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcaG92ZXJcXGJyb3dzZXJcXGhvdmVyU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVkaXRvckhvdmVyQm9yZGVyIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4vaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlcldpZGdldCB9IGZyb20gJy4vaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ29udGV4dFZpZXcsIENvbnRleHRWaWV3RE9NUG9zaXRpb24sIElEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGdldEFjdGl2ZUVsZW1lbnQsIGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQsIGlzQW5jZXN0b3IsIGdldFdpbmRvdywgaXNIVE1MRWxlbWVudCwgaXNFZGl0YWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCBpc01hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZywgdHlwZSBJSG92ZXJMaWZlY3ljbGVPcHRpb25zLCB0eXBlIElIb3Zlck9wdGlvbnMsIHR5cGUgSUhvdmVyVGFyZ2V0LCB0eXBlIElIb3ZlcldpZGdldCwgdHlwZSBJTWFuYWdlZEhvdmVyLCB0eXBlIElNYW5hZ2VkSG92ZXJDb250ZW50T3JGYWN0b3J5LCB0eXBlIElNYW5hZ2VkSG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB0eXBlIHsgSUhvdmVyRGVsZWdhdGUsIElIb3ZlckRlbGVnYXRlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgTWFuYWdlZEhvdmVyV2lkZ2V0IH0gZnJvbSAnLi91cGRhdGFibGVIb3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0LCBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyLCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5cbi8qKlxuICogTWF4aW11bSBuZXN0aW5nIGRlcHRoIGZvciBob3ZlcnMuIFRoaXMgcHJldmVudHMgcnVuYXdheSBuZXN0aW5nLlxuICovXG5jb25zdCBNQVhfSE9WRVJfTkVTVElOR19ERVBUSCA9IDM7XG5cbi8qKlxuICogQW4gZW50cnkgaW4gdGhlIGhvdmVyIHN0YWNrLCByZXByZXNlbnRpbmcgYSBzaW5nbGUgaG92ZXIgYW5kIGl0cyBhc3NvY2lhdGVkIHN0YXRlLlxuICovXG5pbnRlcmZhY2UgSUhvdmVyU3RhY2tFbnRyeSB7XG5cdHJlYWRvbmx5IGhvdmVyOiBIb3ZlcldpZGdldDtcblx0cmVhZG9ubHkgb3B0aW9uczogSUhvdmVyT3B0aW9ucztcblx0cmVhZG9ubHkgY29udGV4dFZpZXc6IENvbnRleHRWaWV3O1xuXHRyZWFkb25seSBsYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZXN1bHQgb2YgY3JlYXRpbmcgYSBob3ZlciwgY29udGFpbmluZyB0aGUgaG92ZXIgd2lkZ2V0IGFuZCBhc3NvY2lhdGVkIHN0YXRlLlxuICovXG5pbnRlcmZhY2UgSUNyZWF0ZUhvdmVyUmVzdWx0IHtcblx0cmVhZG9ubHkgaG92ZXI6IEhvdmVyV2lkZ2V0O1xuXHRyZWFkb25seSBzdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBsYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIEhvdmVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSG92ZXJTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFN0YWNrIG9mIGN1cnJlbnRseSB2aXNpYmxlIGhvdmVycy4gVGhlIGxhc3QgZW50cnkgaXMgdGhlIHRvcG1vc3QgaG92ZXIuXG5cdCAqIFRoaXMgZW5hYmxlcyBuZXN0ZWQgaG92ZXJzIHdoZXJlIGhvdmVyaW5nIGluc2lkZSBhIGhvdmVyIGNhbiBzaG93IGFub3RoZXIgaG92ZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclN0YWNrOiBJSG92ZXJTdGFja0VudHJ5W10gPSBbXTtcblxuXHRwcml2YXRlIF9jdXJyZW50RGVsYXllZEhvdmVyOiBIb3ZlcldpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudERlbGF5ZWRIb3Zlcldhc1Nob3duOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2N1cnJlbnREZWxheWVkSG92ZXJHcm91cElkOiBudW1iZXIgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RIb3Zlck9wdGlvbnM6IElIb3Zlck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGF5ZWRIb3ZlcnMgPSBuZXcgTWFwPEhUTUxFbGVtZW50LCB7IHNob3c6IChmb2N1czogYm9vbGVhbikgPT4gdm9pZCB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYW5hZ2VkSG92ZXJzID0gbmV3IE1hcDxIVE1MRWxlbWVudCwgSU1hbmFnZWRIb3Zlcj4oKTtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgY3VycmVudCAodG9wbW9zdCkgaG92ZXIgZnJvbSB0aGUgc3RhY2ssIGlmIGFueS5cblx0ICovXG5cdHByaXZhdGUgZ2V0IF9jdXJyZW50SG92ZXIoKTogSG92ZXJXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ob3ZlclN0YWNrLmF0KC0xKT8uaG92ZXI7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgY3VycmVudCAodG9wbW9zdCkgaG92ZXIgb3B0aW9ucyBmcm9tIHRoZSBzdGFjaywgaWYgYW55LlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX2N1cnJlbnRIb3Zlck9wdGlvbnMoKTogSUhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvdmVyU3RhY2suYXQoLTEpPy5vcHRpb25zO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgdGFyZ2V0IGVsZW1lbnQgaXMgaW5zaWRlIGFueSBvZiB0aGUgaG92ZXJzIGluIHRoZSBzdGFjay5cblx0ICogSWYgaXQgaXMsIHJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBjb250YWluaW5nIGhvdmVyLCBvdGhlcndpc2UgcmV0dXJucyAtMS5cblx0ICovXG5cdHByaXZhdGUgX2dldENvbnRhaW5pbmdIb3ZlckluZGV4KHRhcmdldDogSFRNTEVsZW1lbnQgfCBJSG92ZXJUYXJnZXQpOiBudW1iZXIge1xuXHRcdGNvbnN0IHRhcmdldEVsZW1lbnRzID0gaXNIVE1MRWxlbWVudCh0YXJnZXQpID8gW3RhcmdldF0gOiB0YXJnZXQudGFyZ2V0RWxlbWVudHM7XG5cdFx0Ly8gU2VhcmNoIGZyb20gdG9wIG9mIHN0YWNrIHRvIGJvdHRvbSAobW9zdCByZWNlbnQgaG92ZXIgZmlyc3QpXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGZvciAoY29uc3QgdGFyZ2V0RWxlbWVudCBvZiB0YXJnZXRFbGVtZW50cykge1xuXHRcdFx0XHRpZiAoaXNBbmNlc3Rvcih0YXJnZXRFbGVtZW50LCB0aGlzLl9ob3ZlclN0YWNrW2ldLmhvdmVyLmRvbU5vZGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRNZW51U2VydmljZS5vbkRpZFNob3dDb250ZXh0TWVudSgoKSA9PiB0aGlzLmhpZGVIb3ZlcigpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zaG93SG92ZXInLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvcmUsXG5cdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUkpLFxuXHRcdFx0aGFuZGxlcjogKCkgPT4geyB0aGlzLl9zaG93QW5kRm9jdXNIb3ZlckZvckFjdGl2ZUVsZW1lbnQoKTsgfSxcblx0XHR9KSk7XG5cdH1cblxuXHRzaG93SW5zdGFudEhvdmVyKG9wdGlvbnM6IElIb3Zlck9wdGlvbnMsIGZvY3VzPzogYm9vbGVhbiwgc2tpcExhc3RGb2N1c2VkVXBkYXRlPzogYm9vbGVhbiwgZG9udFNob3c/OiBib29sZWFuKTogSUhvdmVyV2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX2NyZWF0ZUhvdmVyKG9wdGlvbnMsIHNraXBMYXN0Rm9jdXNlZFVwZGF0ZSk7XG5cdFx0aWYgKCFob3Zlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fc2hvd0hvdmVyKGhvdmVyLCBvcHRpb25zLCBmb2N1cyk7XG5cdFx0cmV0dXJuIGhvdmVyLmhvdmVyO1xuXHR9XG5cblx0c2hvd0RlbGF5ZWRIb3Zlcihcblx0XHRvcHRpb25zOiBJSG92ZXJPcHRpb25zLFxuXHRcdGxpZmVjeWNsZU9wdGlvbnM6IFBpY2s8SUhvdmVyTGlmZWN5Y2xlT3B0aW9ucywgJ2dyb3VwSWQnIHwgJ3JlZHVjZWREZWxheSc+LFxuXHQpOiBJSG92ZXJXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdC8vIFNldCBgaWRgIHRvIGRlZmF1bHQgaWYgaXQncyB1bmRlZmluZWRcblx0XHRpZiAob3B0aW9ucy5pZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvcHRpb25zLmlkID0gZ2V0SG92ZXJJZEZyb21Db250ZW50KG9wdGlvbnMuY29udGVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyIHx8IHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXJXYXNTaG93bikge1xuXHRcdFx0Ly8gQ3VycmVudCBob3ZlciBpcyBsb2NrZWQsIHJlamVjdCBcdTIwMTQgdW5sZXNzIHRoaXMgaXMgYSBuZXN0aW5nIHNjZW5hcmlvXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEhvdmVyPy5pc0xvY2tlZCAmJiB0aGlzLl9nZXRDb250YWluaW5nSG92ZXJJbmRleChvcHRpb25zLnRhcmdldCkgPCAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElkZW50aXR5IGlzIHRoZSBzYW1lLCByZXR1cm4gY3VycmVudCBob3ZlclxuXHRcdFx0aWYgKGdldEhvdmVyT3B0aW9uc0lkZW50aXR5KHRoaXMuX2N1cnJlbnRIb3Zlck9wdGlvbnMpID09PSBnZXRIb3Zlck9wdGlvbnNJZGVudGl0eShvcHRpb25zKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3VycmVudEhvdmVyO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBncm91cCBpZGVudGl0eSwgaWYgaXQncyB0aGUgc2FtZSBza2lwIHRoZSBkZWxheSBhbmQgc2hvdyB0aGUgaG92ZXIgaW1tZWRpYXRlbHlcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50SG92ZXIgJiYgIXRoaXMuX2N1cnJlbnRIb3Zlci5pc0Rpc3Bvc2VkICYmIHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXJHcm91cElkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlckdyb3VwSWQgPT09IGxpZmVjeWNsZU9wdGlvbnM/Lmdyb3VwSWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLmFwcGVhcmFuY2UsXG5cdFx0XHRcdFx0XHRza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXIgJiYgZ2V0SG92ZXJPcHRpb25zSWRlbnRpdHkodGhpcy5fY3VycmVudEhvdmVyT3B0aW9ucykgPT09IGdldEhvdmVyT3B0aW9uc0lkZW50aXR5KG9wdGlvbnMpKSB7XG5cdFx0XHQvLyBJZiB0aGUgaG92ZXIgaXMgdGhlIHNhbWUgYnV0IHRpbWVvdXQgaXMgbm90IGZpbmlzaGVkIHlldCwgcmV0dXJuIHRoZSBjdXJyZW50IGhvdmVyXG5cdFx0XHRyZXR1cm4gdGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlcjtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX2NyZWF0ZUhvdmVyKG9wdGlvbnMsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFob3Zlcikge1xuXHRcdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3ZlciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXJXYXNTaG93biA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlckdyb3VwSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXIgPSBob3Zlci5ob3Zlcjtcblx0XHR0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyV2FzU2hvd24gPSBmYWxzZTtcblx0XHR0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyR3JvdXBJZCA9IGxpZmVjeWNsZU9wdGlvbnM/Lmdyb3VwSWQ7XG5cblx0XHRjb25zdCBkZWxheSA9IGxpZmVjeWNsZU9wdGlvbnM/LnJlZHVjZWREZWxheVxuXHRcdFx0PyB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCd3b3JrYmVuY2guaG92ZXIucmVkdWNlZERlbGF5Jylcblx0XHRcdDogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignd29ya2JlbmNoLmhvdmVyLmRlbGF5Jyk7XG5cdFx0dGltZW91dChkZWxheSkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoaG92ZXIuaG92ZXIgJiYgIWhvdmVyLmhvdmVyLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlcldhc1Nob3duID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc2hvd0hvdmVyKGhvdmVyLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBob3Zlci5ob3Zlcjtcblx0fVxuXG5cdHNldHVwRGVsYXllZEhvdmVyKFxuXHRcdHRhcmdldDogSFRNTEVsZW1lbnQsXG5cdFx0b3B0aW9uczogKCgpID0+IE9taXQ8SUhvdmVyT3B0aW9ucywgJ3RhcmdldCc+KSB8IE9taXQ8SUhvdmVyT3B0aW9ucywgJ3RhcmdldCc+LFxuXHRcdGxpZmVjeWNsZU9wdGlvbnM/OiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVzb2x2ZUhvdmVyT3B0aW9ucyA9IChlPzogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQ6IElIb3Zlck9wdGlvbnMgPSB7XG5cdFx0XHRcdC4uLnR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nID8gb3B0aW9ucygpIDogb3B0aW9ucyxcblx0XHRcdFx0dGFyZ2V0XG5cdFx0XHR9O1xuXHRcdFx0aWYgKHJlc29sdmVkLnN0eWxlID09PSBIb3ZlclN0eWxlLk1vdXNlICYmIGUpIHtcblx0XHRcdFx0cmVzb2x2ZWQudGFyZ2V0ID0gcmVzb2x2ZU1vdXNlU3R5bGVIb3ZlclRhcmdldCh0YXJnZXQsIGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdH07XG5cdFx0cmV0dXJuIHRoaXMuX3NldHVwRGVsYXllZEhvdmVyKHRhcmdldCwgcmVzb2x2ZUhvdmVyT3B0aW9ucywgbGlmZWN5Y2xlT3B0aW9ucyk7XG5cdH1cblxuXHRzZXR1cERlbGF5ZWRIb3ZlckF0TW91c2UoXG5cdFx0dGFyZ2V0OiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiAoKCkgPT4gT21pdDxJSG92ZXJPcHRpb25zLCAndGFyZ2V0JyB8ICdwb3NpdGlvbic+KSB8IE9taXQ8SUhvdmVyT3B0aW9ucywgJ3RhcmdldCcgfCAncG9zaXRpb24nPixcblx0XHRsaWZlY3ljbGVPcHRpb25zPzogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlc29sdmVIb3Zlck9wdGlvbnMgPSAoZT86IE1vdXNlRXZlbnQpID0+ICh7XG5cdFx0XHQuLi50eXBlb2Ygb3B0aW9ucyA9PT0gJ2Z1bmN0aW9uJyA/IG9wdGlvbnMoKSA6IG9wdGlvbnMsXG5cdFx0XHR0YXJnZXQ6IGUgPyByZXNvbHZlTW91c2VTdHlsZUhvdmVyVGFyZ2V0KHRhcmdldCwgZSkgOiB0YXJnZXRcblx0XHR9IHNhdGlzZmllcyBJSG92ZXJPcHRpb25zKTtcblx0XHRyZXR1cm4gdGhpcy5fc2V0dXBEZWxheWVkSG92ZXIodGFyZ2V0LCByZXNvbHZlSG92ZXJPcHRpb25zLCBsaWZlY3ljbGVPcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwRGVsYXllZEhvdmVyKFxuXHRcdHRhcmdldDogSFRNTEVsZW1lbnQsXG5cdFx0cmVzb2x2ZUhvdmVyT3B0aW9uczogKChlPzogTW91c2VFdmVudCkgPT4gSUhvdmVyT3B0aW9ucyksXG5cdFx0bGlmZWN5Y2xlT3B0aW9ucz86IElIb3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdCkge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCBFdmVudFR5cGUuTU9VU0VfT1ZFUiwgZSA9PiB7XG5cdFx0XHR0aGlzLnNob3dEZWxheWVkSG92ZXIocmVzb2x2ZUhvdmVyT3B0aW9ucyhlKSwge1xuXHRcdFx0XHRncm91cElkOiBsaWZlY3ljbGVPcHRpb25zPy5ncm91cElkLFxuXHRcdFx0XHRyZWR1Y2VkRGVsYXk6IGxpZmVjeWNsZU9wdGlvbnM/LnJlZHVjZWREZWxheSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRpZiAobGlmZWN5Y2xlT3B0aW9ucz8uc2V0dXBLZXlib2FyZEV2ZW50cykge1xuXHRcdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2dC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dJbnN0YW50SG92ZXIocmVzb2x2ZUhvdmVyT3B0aW9ucygpLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlbGF5ZWRIb3ZlcnMuc2V0KHRhcmdldCwgeyBzaG93OiAoZm9jdXM6IGJvb2xlYW4pID0+IHsgdGhpcy5zaG93SW5zdGFudEhvdmVyKHJlc29sdmVIb3Zlck9wdGlvbnMoKSwgZm9jdXMpOyB9IH0pO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZGVsYXllZEhvdmVycy5kZWxldGUodGFyZ2V0KSkpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSG92ZXIob3B0aW9uczogSUhvdmVyT3B0aW9ucywgc2tpcExhc3RGb2N1c2VkVXBkYXRlPzogYm9vbGVhbik6IElDcmVhdGVIb3ZlclJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAob3B0aW9ucy5jb250ZW50ID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTZXQgYGlkYCB0byBkZWZhdWx0IGlmIGl0J3MgdW5kZWZpbmVkXG5cdFx0aWYgKG9wdGlvbnMuaWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0b3B0aW9ucy5pZCA9IGdldEhvdmVySWRGcm9tQ29udGVudChvcHRpb25zLmNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSB0YXJnZXQgaXMgaW5zaWRlIGFuIGV4aXN0aW5nIGhvdmVyIChuZXN0aW5nIHNjZW5hcmlvKVxuXHRcdGNvbnN0IGNvbnRhaW5pbmdIb3ZlckluZGV4ID0gdGhpcy5fZ2V0Q29udGFpbmluZ0hvdmVySW5kZXgob3B0aW9ucy50YXJnZXQpO1xuXHRcdGNvbnN0IGlzTmVzdGluZyA9IGNvbnRhaW5pbmdIb3ZlckluZGV4ID49IDA7XG5cblx0XHRpZiAoaXNOZXN0aW5nKSB7XG5cdFx0XHQvLyBDaGVjayBtYXggbmVzdGluZyBkZXB0aFxuXHRcdFx0aWYgKHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoID49IE1BWF9IT1ZFUl9ORVNUSU5HX0RFUFRIKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBXaGVuIG5lc3RpbmcsIGRvbid0IGNoZWNrIGlmIHRoZSBwYXJlbnQgaXMgbG9ja2VkIC0gd2UgYWxsb3cgbmVzdGVkIGhvdmVycyBpbnNpZGUgbG9ja2VkIHBhcmVudHNcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm90IG5lc3Rpbmc6IGNoZWNrIGlmIGN1cnJlbnQgdG9wLWxldmVsIGhvdmVyIGlzIGxvY2tlZFxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRIb3Zlcj8uaXNMb2NrZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgaWRlbnRpdHkgaXMgdGhlIHNhbWUgYXMgY3VycmVudCBob3ZlclxuXHRcdFx0aWYgKGdldEhvdmVyT3B0aW9uc0lkZW50aXR5KHRoaXMuX2N1cnJlbnRIb3Zlck9wdGlvbnMpID09PSBnZXRIb3Zlck9wdGlvbnNJZGVudGl0eShvcHRpb25zKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RIb3Zlck9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdGNvbnN0IHRyYXBGb2N1cyA9IG9wdGlvbnMudHJhcEZvY3VzIHx8IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk7XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRsZXQgbGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3BlbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0Ly8gSEFDSywgcmVtb3ZlIHRoaXMgY2hlY2sgd2hlbiAjMTg5MDc2IGlzIGZpeGVkXG5cdFx0aWYgKCFza2lwTGFzdEZvY3VzZWRVcGRhdGUpIHtcblx0XHRcdGlmICh0cmFwRm9jdXMgJiYgYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0XHRpZiAoIWFjdGl2ZUVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28taG92ZXInKSkge1xuXHRcdFx0XHRcdGxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW4gPSBhY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG92ZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEhvdmVyV2lkZ2V0LCBvcHRpb25zKTtcblx0XHRpZiAob3B0aW9ucy5wZXJzaXN0ZW5jZT8uc3RpY2t5KSB7XG5cdFx0XHRob3Zlci5pc0xvY2tlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQWRqdXN0IHRhcmdldCBwb3NpdGlvbiB3aGVuIGEgbW91c2UgZXZlbnQgaXMgcHJvdmlkZWQgYXMgdGhlIGhvdmVyIHBvc2l0aW9uXG5cdFx0aWYgKG9wdGlvbnMucG9zaXRpb24/LmhvdmVyUG9zaXRpb24gJiYgIWlzTnVtYmVyKG9wdGlvbnMucG9zaXRpb24uaG92ZXJQb3NpdGlvbikpIHtcblx0XHRcdG9wdGlvbnMudGFyZ2V0ID0ge1xuXHRcdFx0XHR0YXJnZXRFbGVtZW50czogaXNIVE1MRWxlbWVudChvcHRpb25zLnRhcmdldCkgPyBbb3B0aW9ucy50YXJnZXRdIDogb3B0aW9ucy50YXJnZXQudGFyZ2V0RWxlbWVudHMsXG5cdFx0XHRcdHg6IG9wdGlvbnMucG9zaXRpb24uaG92ZXJQb3NpdGlvbi54ICsgMTBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aG92ZXIub25EaXNwb3NlKCgpID0+IHtcblx0XHRcdC8vIFBvcCB0aGlzIGhvdmVyIGZyb20gdGhlIHN0YWNrIGlmIGl0J3Mgc3RpbGwgdGhlcmVcblx0XHRcdGNvbnN0IHN0YWNrSW5kZXggPSB0aGlzLl9ob3ZlclN0YWNrLmZpbmRJbmRleChlbnRyeSA9PiBlbnRyeS5ob3ZlciA9PT0gaG92ZXIpO1xuXHRcdFx0aWYgKHN0YWNrSW5kZXggPj0gMCkge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2hvdmVyU3RhY2tbc3RhY2tJbmRleF07XG5cdFx0XHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgdGhpcyBob3ZlciB3YXMgZm9jdXNlZFxuXHRcdFx0XHRjb25zdCBob3Zlcldhc0ZvY3VzZWQgPSBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGhvdmVyLmRvbU5vZGUpO1xuXHRcdFx0XHRpZiAoaG92ZXJXYXNGb2N1c2VkICYmIGVudHJ5Lmxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW4pIHtcblx0XHRcdFx0XHRlbnRyeS5sYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxzbyBkaXNwb3NlIGFsbCBuZXN0ZWQgaG92ZXJzIChob3ZlcnMgYXQgaGlnaGVyIGluZGljZXMgaW4gdGhlIHN0YWNrKVxuXHRcdFx0XHQvLyBEaXNwb3NlIGZyb20gZW5kIHRvIGF2b2lkIGluZGV4IHNoaWZ0aW5nIGlzc3Vlc1xuXHRcdFx0XHR3aGlsZSAodGhpcy5faG92ZXJTdGFjay5sZW5ndGggPiBzdGFja0luZGV4ICsgMSkge1xuXHRcdFx0XHRcdGNvbnN0IG5lc3RlZEVudHJ5ID0gdGhpcy5faG92ZXJTdGFjay5wb3AoKSE7XG5cdFx0XHRcdFx0bmVzdGVkRW50cnkuY29udGV4dFZpZXcuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG5lc3RlZEVudHJ5LmhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBSZW1vdmUgdGhpcyBob3ZlciBmcm9tIHN0YWNrIGFuZCBkaXNwb3NlIGl0cyBjb250ZXh0IHZpZXdcblx0XHRcdFx0dGhpcy5faG92ZXJTdGFjay5zcGxpY2Uoc3RhY2tJbmRleCwgMSk7XG5cdFx0XHRcdGVudHJ5LmNvbnRleHRWaWV3LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0sIHVuZGVmaW5lZCwgaG92ZXJEaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBTZXQgdGhlIGNvbnRhaW5lciBleHBsaWNpdGx5IHRvIGVuYWJsZSBhdXggd2luZG93IHN1cHBvcnRcblx0XHRpZiAoIW9wdGlvbnMuY29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRFbGVtZW50ID0gaXNIVE1MRWxlbWVudChvcHRpb25zLnRhcmdldCkgPyBvcHRpb25zLnRhcmdldCA6IG9wdGlvbnMudGFyZ2V0LnRhcmdldEVsZW1lbnRzWzBdO1xuXHRcdFx0b3B0aW9ucy5jb250YWluZXIgPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3codGFyZ2V0RWxlbWVudCkpO1xuXHRcdH1cblxuXHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnZXRXaW5kb3cob3B0aW9ucy5jb250YWluZXIpLmRvY3VtZW50LCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoIWlzQW5jZXN0b3IoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQsIGhvdmVyLmRvbU5vZGUpKSB7XG5cdFx0XHRcdHRoaXMuX2hpZGVIb3ZlckFuZERlc2NlbmRhbnRzKGhvdmVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIW9wdGlvbnMucGVyc2lzdGVuY2U/LnN0aWNreSkge1xuXHRcdFx0aWYgKCd0YXJnZXRFbGVtZW50cycgaW4gb3B0aW9ucy50YXJnZXQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIG9wdGlvbnMudGFyZ2V0LnRhcmdldEVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5faGlkZUhvdmVyQW5kRGVzY2VuZGFudHMoaG92ZXIpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihvcHRpb25zLnRhcmdldCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLl9oaWRlSG92ZXJBbmREZXNjZW5kYW50cyhob3ZlcikpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdFx0aWYgKGZvY3VzZWRFbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50RG9jdW1lbnQgPSBnZXRXaW5kb3coZm9jdXNlZEVsZW1lbnQpLmRvY3VtZW50O1xuXHRcdFx0XHRob3ZlckRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZm9jdXNlZEVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB0aGlzLl9rZXlEb3duKGUsIGhvdmVyLCAhIW9wdGlvbnMucGVyc2lzdGVuY2U/LmhpZGVPbktleURvd24pKSk7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihmb2N1c2VkRWxlbWVudERvY3VtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4gdGhpcy5fa2V5RG93bihlLCBob3ZlciwgISFvcHRpb25zLnBlcnNpc3RlbmNlPy5oaWRlT25LZXlEb3duKSkpO1xuXHRcdFx0XHRob3ZlckRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZm9jdXNlZEVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfVVAsIGUgPT4gdGhpcy5fa2V5VXAoZSwgaG92ZXIpKSk7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihmb2N1c2VkRWxlbWVudERvY3VtZW50LCBFdmVudFR5cGUuS0VZX1VQLCBlID0+IHRoaXMuX2tleVVwKGUsIGhvdmVyKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICgnSW50ZXJzZWN0aW9uT2JzZXJ2ZXInIGluIG1haW5XaW5kb3cpIHtcblx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IEludGVyc2VjdGlvbk9ic2VydmVyKGUgPT4gdGhpcy5faW50ZXJzZWN0aW9uQ2hhbmdlKGUsIGhvdmVyKSwgeyB0aHJlc2hvbGQ6IDAgfSk7XG5cdFx0XHRjb25zdCBmaXJzdFRhcmdldEVsZW1lbnQgPSAndGFyZ2V0RWxlbWVudHMnIGluIG9wdGlvbnMudGFyZ2V0ID8gb3B0aW9ucy50YXJnZXQudGFyZ2V0RWxlbWVudHNbMF0gOiBvcHRpb25zLnRhcmdldDtcblx0XHRcdG9ic2VydmVyLm9ic2VydmUoZmlyc3RUYXJnZXRFbGVtZW50KTtcblx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBob3ZlciwgbGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3Blbiwgc3RvcmU6IGhvdmVyRGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dIb3ZlcihyZXN1bHQ6IElDcmVhdGVIb3ZlclJlc3VsdCwgb3B0aW9uczogSUhvdmVyT3B0aW9ucywgZm9jdXM/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgeyBob3ZlciwgbGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3Blbiwgc3RvcmUgfSA9IHJlc3VsdDtcblxuXHRcdC8vIENoZWNrIGlmIHRoZSB0YXJnZXQgaXMgaW5zaWRlIGFuIGV4aXN0aW5nIGhvdmVyIChuZXN0aW5nIHNjZW5hcmlvKVxuXHRcdGNvbnN0IGNvbnRhaW5pbmdIb3ZlckluZGV4ID0gdGhpcy5fZ2V0Q29udGFpbmluZ0hvdmVySW5kZXgob3B0aW9ucy50YXJnZXQpO1xuXHRcdGNvbnN0IGlzTmVzdGluZyA9IGNvbnRhaW5pbmdIb3ZlckluZGV4ID49IDA7XG5cblx0XHQvLyBJZiBub3QgbmVzdGluZywgY2xvc2UgYWxsIGV4aXN0aW5nIGhvdmVycyBmaXJzdFxuXHRcdGlmICghaXNOZXN0aW5nKSB7XG5cdFx0XHR0aGlzLl9oaWRlQWxsSG92ZXJzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFdoZW4gbmVzdGluZywgY2xvc2UgYW55IHNpYmxpbmcgaG92ZXJzIChob3ZlcnMgYXQgdGhlIHNhbWUgbGV2ZWwgb3IgZGVlcGVyXG5cdFx0XHQvLyB0aGFuIHRoZSBjb250YWluaW5nIGhvdmVyKS4gVGhpcyBlbnN1cmVzIGhvdmVycyB3aXRoaW4gdGhlIHNhbWUgY29udGFpbmVyXG5cdFx0XHQvLyBhcmUgZXhjbHVzaXZlLlxuXHRcdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoIC0gMTsgaSA+IGNvbnRhaW5pbmdIb3ZlckluZGV4OyBpLS0pIHtcblx0XHRcdFx0dGhpcy5faG92ZXJTdGFja1tpXS5ob3Zlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCA9IGNvbnRhaW5pbmdIb3ZlckluZGV4ICsgMTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIG5lc3RpbmcsIGFkZCB0aGUgbmV3IGhvdmVyJ3MgY29udGFpbmVyIHRvIGFsbCBwYXJlbnQgaG92ZXJzJyBtb3VzZSB0cmFja2Vycy5cblx0XHQvLyBUaGlzIG1ha2VzIHRoZSBwYXJlbnQgaG92ZXJzIHRyZWF0IHRoZSBuZXN0ZWQgaG92ZXIgYXMgcGFydCBvZiB0aGVtc2VsdmVzLFxuXHRcdC8vIHNvIHRoZXkgd29uJ3QgY2xvc2Ugd2hlbiB0aGUgbW91c2UgbW92ZXMgaW50byB0aGUgbmVzdGVkIGhvdmVyLlxuXHRcdGlmIChpc05lc3RpbmcpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDw9IGNvbnRhaW5pbmdIb3ZlckluZGV4OyBpKyspIHtcblx0XHRcdFx0c3RvcmUuYWRkKHRoaXMuX2hvdmVyU3RhY2tbaV0uaG92ZXIuYWRkTW91c2VUcmFja2luZ0VsZW1lbnQoaG92ZXIuZG9tTm9kZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBhIG5ldyBDb250ZXh0VmlldyBmb3IgdGhpcyBob3ZlciB3aXRoIGhpZ2hlciB6LWluZGV4IGZvciBuZXN0ZWQgaG92ZXJzXG5cdFx0Y29uc3QgY29udGFpbmVyID0gb3B0aW9ucy5jb250YWluZXIgPz8gdGhpcy5fbGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KGlzSFRNTEVsZW1lbnQob3B0aW9ucy50YXJnZXQpID8gb3B0aW9ucy50YXJnZXQgOiBvcHRpb25zLnRhcmdldC50YXJnZXRFbGVtZW50c1swXSkpO1xuXHRcdGNvbnN0IGNvbnRleHRWaWV3ID0gbmV3IENvbnRleHRWaWV3KGNvbnRhaW5lciwgQ29udGV4dFZpZXdET01Qb3NpdGlvbi5BQlNPTFVURSk7XG5cblx0XHQvLyBQdXNoIHRvIHN0YWNrXG5cdFx0Y29uc3Qgc3RhY2tFbnRyeTogSUhvdmVyU3RhY2tFbnRyeSA9IHtcblx0XHRcdGhvdmVyLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGNvbnRleHRWaWV3LFxuXHRcdFx0bGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3BlblxuXHRcdH07XG5cdFx0dGhpcy5faG92ZXJTdGFjay5wdXNoKHN0YWNrRW50cnkpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgaG92ZXIgaW4gaXRzIGNvbnRleHQgdmlld1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IEhvdmVyQ29udGV4dFZpZXdEZWxlZ2F0ZShob3ZlciwgZm9jdXMsIHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoKTtcblx0XHRjb250ZXh0Vmlldy5zaG93KGRlbGVnYXRlKTtcblxuXHRcdC8vIFNldCB1cCBsYXlvdXQgaGFuZGxpbmdcblx0XHRzdG9yZS5hZGQoaG92ZXIub25SZXF1ZXN0TGF5b3V0KCgpID0+IGNvbnRleHRWaWV3LmxheW91dCgpKSk7XG5cblx0XHQvLyBSZS1sYXlvdXQgd2hlbiB0aGUgd2luZG93IHJlc2l6ZXMgc28gdGhlIGhvdmVyIHRyYWNrcyBpdHMgYW5jaG9yLlxuXHRcdC8vIE9ubHkgZm9yIGZvY3VzZWQvc3RpY2t5IGhvdmVycyB0aGF0IHBlcnNpc3QgbG9uZyBlbm91Z2ggZm9yIGEgcmVzaXplXG5cdFx0Ly8gdG8gbWF0dGVyOyB0cmFuc2llbnQgaG92ZXJzIGRpc21pc3Mgb24gbW91c2UgbW92ZW1lbnQgYW55d2F5LlxuXHRcdGlmIChmb2N1cyB8fCBvcHRpb25zLnBlcnNpc3RlbmNlPy5zdGlja3kpIHtcblx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csIEV2ZW50VHlwZS5SRVNJWkUsICgpID0+IGNvbnRleHRWaWV3LmxheW91dCgpKSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMub25EaWRIaWRlKSB7XG5cdFx0XHRjb25zdCBvbkRpZEhpZGUgPSBvcHRpb25zLm9uRGlkSGlkZTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb25EaWRIaWRlKCkpKTtcblx0XHR9XG5cdFx0b3B0aW9ucy5vbkRpZFNob3c/LigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGVzIGEgc3BlY2lmaWMgaG92ZXIgYW5kIGFsbCBob3ZlcnMgbmVzdGVkIGluc2lkZSBpdC5cblx0ICovXG5cdHByaXZhdGUgX2hpZGVIb3ZlckFuZERlc2NlbmRhbnRzKGhvdmVyOiBIb3ZlcldpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YWNrSW5kZXggPSB0aGlzLl9ob3ZlclN0YWNrLmZpbmRJbmRleChlbnRyeSA9PiBlbnRyeS5ob3ZlciA9PT0gaG92ZXIpO1xuXHRcdGlmIChzdGFja0luZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2UgYWxsIGhvdmVycyBmcm9tIHRoaXMgaW5kZXggb253YXJkcyAoaW5jbHVkaW5nIG5lc3RlZCBvbmVzKVxuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gc3RhY2tJbmRleDsgaS0tKSB7XG5cdFx0XHR0aGlzLl9ob3ZlclN0YWNrW2ldLmhvdmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXJTdGFjay5sZW5ndGggPSBzdGFja0luZGV4O1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGVzIGFsbCBob3ZlcnMgaW4gdGhlIHN0YWNrLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGlkZUFsbEhvdmVycygpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5faG92ZXJTdGFjay5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0dGhpcy5faG92ZXJTdGFja1tpXS5ob3Zlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoID0gMDtcblx0fVxuXG5cdGhpZGVIb3Zlcihmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faG92ZXJTdGFjay5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBub3QgZm9yY2luZyBhbmQgdGhlIHRvcG1vc3QgaG92ZXIgaXMgbG9ja2VkLCBkb24ndCBoaWRlXG5cdFx0aWYgKCFmb3JjZSAmJiB0aGlzLl9jdXJyZW50SG92ZXI/LmlzTG9ja2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSGlkZSBvbmx5IHRoZSB0b3Btb3N0IGhvdmVyIChwb3AgZnJvbSBzdGFjaylcblx0XHR0aGlzLmRvSGlkZUhvdmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvSGlkZUhvdmVyKCk6IHZvaWQge1xuXHRcdC8vIFBvcCBhbmQgZGlzcG9zZSB0aGUgdG9wbW9zdCBob3ZlclxuXHRcdGNvbnN0IGxlbmd0aCA9IHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoO1xuXHRcdHRoaXMuX2hvdmVyU3RhY2tbbGVuZ3RoIC0gMV0/LmhvdmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCA9IGxlbmd0aCAtIDE7XG5cblx0XHQvLyBBZnRlciBwb3BwaW5nIGEgbmVzdGVkIGhvdmVyLCB1bmxvY2sgdGhlIHBhcmVudCBpZiBpdCB3YXMgbG9ja2VkIGR1ZSB0byBuZXN0aW5nXG5cdFx0Ly8gKE5vdGU6IHRoZSBwYXJlbnQgbWF5IGhhdmUgYmVlbiBleHBsaWNpdGx5IGxvY2tlZCB2aWEgc3RpY2t5LCBzbyB3ZSBvbmx5IHVubG9ja1xuXHRcdC8vIGlmIHRoZXJlIGFyZSByZW1haW5pbmcgaG92ZXJzIGFuZCB0aGV5J3JlIG5vdCBzdGlja3kpXG5cdFx0Ly8gRm9yIHNpbXBsaWNpdHksIHdlIGRvbid0IGF1dG8tdW5sb2NrIGhlcmUgLSB0aGUgcGFyZW50IHJlbWFpbnMgaW4gaXRzIGN1cnJlbnQgbG9jayBzdGF0ZVxuXHR9XG5cblx0cHJpdmF0ZSBfaW50ZXJzZWN0aW9uQ2hhbmdlKGVudHJpZXM6IEludGVyc2VjdGlvbk9ic2VydmVyRW50cnlbXSwgaG92ZXI6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2VudHJpZXMubGVuZ3RoIC0gMV07XG5cdFx0aWYgKCFlbnRyeS5pc0ludGVyc2VjdGluZykge1xuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHNob3dBbmRGb2N1c0xhc3RIb3ZlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2xhc3RIb3Zlck9wdGlvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zaG93SW5zdGFudEhvdmVyKHRoaXMuX2xhc3RIb3Zlck9wdGlvbnMsIHRydWUsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0FuZEZvY3VzSG92ZXJGb3JBY3RpdmVFbGVtZW50KCk6IHZvaWQge1xuXHRcdC8vIFRPRE86IGlmIGhvdmVyIGlzIHZpc2libGUsIGZvY3VzIGl0IHRvIGF2b2lkIGZsaWNrZXJpbmdcblxuXHRcdGxldCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHR3aGlsZSAoYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSB0aGlzLl9kZWxheWVkSG92ZXJzLmdldChhY3RpdmVFbGVtZW50KSA/PyB0aGlzLl9tYW5hZ2VkSG92ZXJzLmdldChhY3RpdmVFbGVtZW50KTtcblx0XHRcdGlmIChob3Zlcikge1xuXHRcdFx0XHRob3Zlci5zaG93KHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGFjdGl2ZUVsZW1lbnQgPSBhY3RpdmVFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfa2V5RG93bihlOiBLZXlib2FyZEV2ZW50LCBob3ZlcjogSG92ZXJXaWRnZXQsIGhpZGVPbktleURvd246IGJvb2xlYW4pIHtcblx0XHRpZiAoZS5rZXkgPT09ICdBbHQnKSB7XG5cdFx0XHQvLyBMb2NrIGFsbCBob3ZlcnMgaW4gdGhlIHN0YWNrIHdoZW4gQWx0IGlzIHByZXNzZWRcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5faG92ZXJTdGFjaykge1xuXHRcdFx0XHRlbnRyeS5ob3Zlci5pc0xvY2tlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UucmVzb2x2ZUtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdGlmIChrZXliaW5kaW5nLmdldFNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hDaG9yZHMoKS5zb21lKHZhbHVlID0+ICEhdmFsdWUpIHx8IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaChldmVudCwgZXZlbnQudGFyZ2V0KS5raW5kICE9PSBSZXN1bHRLaW5kLk5vTWF0Y2hpbmdLYikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaGlkZU9uS2V5RG93biAmJiAoIXRoaXMuX2N1cnJlbnRIb3Zlck9wdGlvbnM/LnRyYXBGb2N1cyB8fCBlLmtleSAhPT0gJ1RhYicpKSB7XG5cdFx0XHQvLyBGaW5kIHRoZSBlbnRyeSBmb3IgdGhpcyBob3ZlciB0byBnZXQgaXRzIGxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW5cblx0XHRcdGNvbnN0IHN0YWNrRW50cnkgPSB0aGlzLl9ob3ZlclN0YWNrLmZpbmQoZW50cnkgPT4gZW50cnkuaG92ZXIgPT09IGhvdmVyKTtcblx0XHRcdHRoaXMuX2hpZGVIb3ZlckFuZERlc2NlbmRhbnRzKGhvdmVyKTtcblx0XHRcdHN0YWNrRW50cnk/Lmxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW4/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfa2V5VXAoZTogS2V5Ym9hcmRFdmVudCwgaG92ZXI6IEhvdmVyV2lkZ2V0KSB7XG5cdFx0aWYgKGUua2V5ID09PSAnQWx0Jykge1xuXHRcdFx0Ly8gVW5sb2NrIGFsbCBob3ZlcnMgaW4gdGhlIHN0YWNrIHdoZW4gQWx0IGlzIHJlbGVhc2VkXG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2hvdmVyU3RhY2spIHtcblx0XHRcdFx0Ly8gT25seSB1bmxvY2sgaWYgbm90IHN0aWNreVxuXHRcdFx0XHRpZiAoIWVudHJ5Lm9wdGlvbnMucGVyc2lzdGVuY2U/LnN0aWNreSkge1xuXHRcdFx0XHRcdGVudHJ5LmhvdmVyLmlzTG9ja2VkID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIEhpZGUgYWxsIGhvdmVycyBpZiB0aGUgbW91c2UgaXMgbm90IG92ZXIgYW55IG9mIHRoZW1cblx0XHRcdGNvbnN0IGFueU1vdXNlSW4gPSB0aGlzLl9ob3ZlclN0YWNrLnNvbWUoZW50cnkgPT4gZW50cnkuaG92ZXIuaXNNb3VzZUluKTtcblx0XHRcdGlmICghYW55TW91c2VJbikge1xuXHRcdFx0XHRjb25zdCB0b3BFbnRyeSA9IHRoaXMuX2hvdmVyU3RhY2tbdGhpcy5faG92ZXJTdGFjay5sZW5ndGggLSAxXTtcblx0XHRcdFx0dGhpcy5faGlkZUFsbEhvdmVycygpO1xuXHRcdFx0XHR0b3BFbnRyeT8ubGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3Blbj8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBUT0RPOiBJbnZlc3RpZ2F0ZSBwZXJmb3JtYW5jZSBvZiB0aGlzIGZ1bmN0aW9uLiBUaGVyZSBzZWVtcyB0byBiZSBhIGxvdCBvZiBjb250ZW50IGNyZWF0ZWRcblx0Ly8gICAgICAgYW5kIHRocm93biBhd2F5IG9uIHN0YXJ0IHVwXG5cdHNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlLCB0YXJnZXRFbGVtZW50OiBIVE1MRWxlbWVudCwgY29udGVudDogSU1hbmFnZWRIb3ZlckNvbnRlbnRPckZhY3RvcnksIG9wdGlvbnM/OiBJTWFuYWdlZEhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZCk6IElNYW5hZ2VkSG92ZXIge1xuXHRcdGlmIChob3ZlckRlbGVnYXRlLnNob3dOYXRpdmVIb3Zlcikge1xuXHRcdFx0cmV0dXJuIHNldHVwTmF0aXZlSG92ZXIodGFyZ2V0RWxlbWVudCwgY29udGVudCk7XG5cdFx0fVxuXG5cdFx0dGFyZ2V0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2N1c3RvbS1ob3ZlcicsICd0cnVlJyk7XG5cblx0XHRpZiAodGFyZ2V0RWxlbWVudC50aXRsZSAhPT0gJycpIHtcblx0XHRcdGNvbnNvbGUud2FybignSFRNTCBlbGVtZW50IGFscmVhZHkgaGFzIGEgdGl0bGUgYXR0cmlidXRlLCB3aGljaCB3aWxsIGNvbmZsaWN0IHdpdGggdGhlIGN1c3RvbSBob3Zlci4gUGxlYXNlIHJlbW92ZSB0aGUgdGl0bGUgYXR0cmlidXRlLicpO1xuXHRcdFx0Ly8gY29uc29sZS50cmFjZSgnU3RhY2sgdHJhY2U6JywgdGFyZ2V0RWxlbWVudC50aXRsZSk7XG5cdFx0XHR0YXJnZXRFbGVtZW50LnRpdGxlID0gJyc7XG5cdFx0fVxuXG5cdFx0bGV0IGhvdmVyUHJlcGFyYXRpb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBob3ZlcldpZGdldDogTWFuYWdlZEhvdmVyV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgaGlkZUhvdmVyID0gKGRpc3Bvc2VXaWRnZXQ6IGJvb2xlYW4sIGRpc3Bvc2VQcmVwYXJhdGlvbjogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29uc3QgaGFkSG92ZXIgPSBob3ZlcldpZGdldCAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGRpc3Bvc2VXaWRnZXQpIHtcblx0XHRcdFx0aG92ZXJXaWRnZXQ/LmRpc3Bvc2UoKTtcblx0XHRcdFx0aG92ZXJXaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGlzcG9zZVByZXBhcmF0aW9uKSB7XG5cdFx0XHRcdGhvdmVyUHJlcGFyYXRpb24/LmRpc3Bvc2UoKTtcblx0XHRcdFx0aG92ZXJQcmVwYXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChoYWRIb3Zlcikge1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlLm9uRGlkSGlkZUhvdmVyPy4oKTtcblx0XHRcdFx0aG92ZXJXaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRyaWdnZXJTaG93SG92ZXIgPSAoZGVsYXk6IG51bWJlciwgZm9jdXM/OiBib29sZWFuLCB0YXJnZXQ/OiBJSG92ZXJEZWxlZ2F0ZVRhcmdldCwgdHJhcEZvY3VzPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBUaW1lb3V0VGltZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWhvdmVyV2lkZ2V0IHx8IGhvdmVyV2lkZ2V0LmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRob3ZlcldpZGdldCA9IG5ldyBNYW5hZ2VkSG92ZXJXaWRnZXQoaG92ZXJEZWxlZ2F0ZSwgdGFyZ2V0IHx8IHRhcmdldEVsZW1lbnQsIGRlbGF5ID4gMCk7XG5cdFx0XHRcdFx0YXdhaXQgaG92ZXJXaWRnZXQudXBkYXRlKHR5cGVvZiBjb250ZW50ID09PSAnZnVuY3Rpb24nID8gY29udGVudCgpIDogY29udGVudCwgZm9jdXMsIHsgLi4ub3B0aW9ucywgdHJhcEZvY3VzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBkZWxheSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBpc01vdXNlRG93biA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0RWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX0RPV04sICgpID0+IHtcblx0XHRcdGlzTW91c2VEb3duID0gdHJ1ZTtcblx0XHRcdGhpZGVIb3Zlcih0cnVlLCB0cnVlKTtcblx0XHR9LCB0cnVlKSk7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRFbGVtZW50LCBFdmVudFR5cGUuTU9VU0VfVVAsICgpID0+IHtcblx0XHRcdGlzTW91c2VEb3duID0gZmFsc2U7XG5cdFx0fSwgdHJ1ZSkpO1xuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0RWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aXNNb3VzZURvd24gPSBmYWxzZTtcblx0XHRcdC8vIEhBQ0s6IGBmcm9tRWxlbWVudGAgaXMgYSBub24tc3RhbmRhcmQgcHJvcGVydHkuIE5vdCBzdXJlIHdoYXQgdG8gcmVwbGFjZSBpdCB3aXRoLFxuXHRcdFx0Ly8gYHJlbGF0ZWRUYXJnZXRgIGlzIE5PVCBlcXVpdmFsZW50LlxuXHRcdFx0aW50ZXJmYWNlIE1vdXNlRXZlbnRXaXRoRnJvbSBleHRlbmRzIE1vdXNlRXZlbnQge1xuXHRcdFx0XHRmcm9tRWxlbWVudDogRWxlbWVudCB8IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRoaWRlSG92ZXIoZmFsc2UsIChlIGFzIE1vdXNlRXZlbnRXaXRoRnJvbSkuZnJvbUVsZW1lbnQgPT09IHRhcmdldEVsZW1lbnQpO1xuXHRcdH0sIHRydWUpKTtcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldEVsZW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGhvdmVyUHJlcGFyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb3VzZU92ZXJTdG9yZTogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCB0YXJnZXQ6IElIb3ZlckRlbGVnYXRlVGFyZ2V0ID0ge1xuXHRcdFx0XHR0YXJnZXRFbGVtZW50czogW3RhcmdldEVsZW1lbnRdLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRpZiAoaG92ZXJEZWxlZ2F0ZS5wbGFjZW1lbnQgPT09IHVuZGVmaW5lZCB8fCBob3ZlckRlbGVnYXRlLnBsYWNlbWVudCA9PT0gJ21vdXNlJykge1xuXHRcdFx0XHQvLyB0cmFjayB0aGUgbW91c2UgcG9zaXRpb25cblx0XHRcdFx0Y29uc3Qgb25Nb3VzZU1vdmUgPSAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRcdHRhcmdldC54ID0gZS54ICsgMTA7XG5cdFx0XHRcdFx0aWYgKCFldmVudElzUmVsYXRlZFRvVGFyZ2V0KGUsIHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRoaWRlSG92ZXIodHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRtb3VzZU92ZXJTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldEVsZW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9NT1ZFLCBvbk1vdXNlTW92ZSwgdHJ1ZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRob3ZlclByZXBhcmF0aW9uID0gbW91c2VPdmVyU3RvcmU7XG5cblx0XHRcdGlmICghZXZlbnRJc1JlbGF0ZWRUb1RhcmdldChlLCB0YXJnZXRFbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIERvIG5vdCBzaG93IGhvdmVyIHdoZW4gdGhlIG1vdXNlIGlzIG92ZXIgYW5vdGhlciBob3ZlciB0YXJnZXRcblx0XHRcdH1cblxuXHRcdFx0bW91c2VPdmVyU3RvcmUuYWRkKHRyaWdnZXJTaG93SG92ZXIodHlwZW9mIGhvdmVyRGVsZWdhdGUuZGVsYXkgPT09ICdmdW5jdGlvbicgPyBob3ZlckRlbGVnYXRlLmRlbGF5KGNvbnRlbnQpIDogaG92ZXJEZWxlZ2F0ZS5kZWxheSwgZmFsc2UsIHRhcmdldCkpO1xuXHRcdH0sIHRydWUpKTtcblxuXHRcdGNvbnN0IG9uRm9jdXMgPSAoZTogRm9jdXNFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGlzTW91c2VEb3duIHx8IGhvdmVyUHJlcGFyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ2xlYW4gdXAgc3RhbGUgcmVmZXJlbmNlIGlmIHRoZSBob3ZlciB3YXMgZGlzbWlzc2VkIGV4dGVybmFsbHlcblx0XHRcdGlmIChob3ZlcldpZGdldD8uaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRob3ZlcldpZGdldCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIElmIGZvY3VzIGlzIHJldHVybmluZyBmcm9tIGEgZGlzbWlzc2VkIGhvdmVyIChlLmcuIEVzYykgb3Jcblx0XHRcdC8vIGZyb20gd2luZG93IHJlYWN0aXZhdGlvbiAoZS5nLiBBbHQtdGFiKSwgZG9uJ3QgcmUtc2hvdy5cblx0XHRcdGNvbnN0IGZyb21Ib3ZlciA9IGlzSFRNTEVsZW1lbnQoZS5yZWxhdGVkVGFyZ2V0KSAmJiBlLnJlbGF0ZWRUYXJnZXQuY2xvc2VzdCgnLm1vbmFjby1ob3ZlcicpO1xuXHRcdFx0aWYgKGZyb21Ib3ZlciB8fCAhZS5yZWxhdGVkVGFyZ2V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghZXZlbnRJc1JlbGF0ZWRUb1RhcmdldChlLCB0YXJnZXRFbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIERvIG5vdCBzaG93IGhvdmVyIHdoZW4gdGhlIGZvY3VzIGlzIG9uIGFub3RoZXIgaG92ZXIgdGFyZ2V0XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldDogSUhvdmVyRGVsZWdhdGVUYXJnZXQgPSB7XG5cdFx0XHRcdHRhcmdldEVsZW1lbnRzOiBbdGFyZ2V0RWxlbWVudF0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRvRGlzcG9zZTogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgb25CbHVyID0gKCkgPT4gaGlkZUhvdmVyKHRydWUsIHRydWUpO1xuXHRcdFx0dG9EaXNwb3NlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0RWxlbWVudCwgRXZlbnRUeXBlLkJMVVIsIG9uQmx1ciwgdHJ1ZSkpO1xuXHRcdFx0dG9EaXNwb3NlLmFkZCh0cmlnZ2VyU2hvd0hvdmVyKHR5cGVvZiBob3ZlckRlbGVnYXRlLmRlbGF5ID09PSAnZnVuY3Rpb24nID8gaG92ZXJEZWxlZ2F0ZS5kZWxheShjb250ZW50KSA6IGhvdmVyRGVsZWdhdGUuZGVsYXksIGZhbHNlLCB0YXJnZXQpKTtcblx0XHRcdGhvdmVyUHJlcGFyYXRpb24gPSB0b0Rpc3Bvc2U7XG5cdFx0fTtcblxuXHRcdC8vIERvIG5vdCBzaG93IGhvdmVyIHdoZW4gZm9jdXNpbmcgYW4gaW5wdXQgb3IgdGV4dGFyZWFcblx0XHRpZiAoIWlzRWRpdGFibGVFbGVtZW50KHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldEVsZW1lbnQsIEV2ZW50VHlwZS5GT0NVUywgb25Gb2N1cywgdHJ1ZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyOiBJTWFuYWdlZEhvdmVyID0ge1xuXHRcdFx0c2hvdzogZm9jdXMgPT4ge1xuXHRcdFx0XHRoaWRlSG92ZXIoZmFsc2UsIHRydWUpOyAvLyB0ZXJtaW5hdGUgYSBvbmdvaW5nIG1vdXNlIG92ZXIgcHJlcGFyYXRpb25cblx0XHRcdFx0dHJpZ2dlclNob3dIb3ZlcigwLCBmb2N1cywgdW5kZWZpbmVkLCBmb2N1cyk7IC8vIHNob3cgaG92ZXIgaW1tZWRpYXRlbHlcblx0XHRcdH0sXG5cdFx0XHRoaWRlOiAoKSA9PiB7XG5cdFx0XHRcdGhpZGVIb3Zlcih0cnVlLCB0cnVlKTtcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGU6IGFzeW5jIChuZXdDb250ZW50LCBob3Zlck9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29udGVudCA9IG5ld0NvbnRlbnQ7XG5cdFx0XHRcdGF3YWl0IGhvdmVyV2lkZ2V0Py51cGRhdGUoY29udGVudCwgdW5kZWZpbmVkLCBob3Zlck9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbWFuYWdlZEhvdmVycy5kZWxldGUodGFyZ2V0RWxlbWVudCk7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0aGlkZUhvdmVyKHRydWUsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fbWFuYWdlZEhvdmVycy5zZXQodGFyZ2V0RWxlbWVudCwgaG92ZXIpO1xuXHRcdHJldHVybiBob3Zlcjtcblx0fVxuXG5cdHNob3dNYW5hZ2VkSG92ZXIodGFyZ2V0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGhvdmVyID0gdGhpcy5fbWFuYWdlZEhvdmVycy5nZXQodGFyZ2V0KTtcblx0XHRpZiAoaG92ZXIpIHtcblx0XHRcdGhvdmVyLnNob3codHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFuYWdlZEhvdmVycy5mb3JFYWNoKGhvdmVyID0+IGhvdmVyLmRpc3Bvc2UoKSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEhvdmVyT3B0aW9uc0lkZW50aXR5KG9wdGlvbnM6IElIb3Zlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBJSG92ZXJPcHRpb25zIHwgbnVtYmVyIHwgc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKG9wdGlvbnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIG9wdGlvbnM/LmlkID8/IG9wdGlvbnM7XG59XG5cbmZ1bmN0aW9uIGdldEhvdmVySWRGcm9tQ29udGVudChjb250ZW50OiBzdHJpbmcgfCBIVE1MRWxlbWVudCB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc0hUTUxFbGVtZW50KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQudG9TdHJpbmcoKTtcblx0fVxuXHRyZXR1cm4gY29udGVudC52YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0U3RyaW5nQ29udGVudChjb250ZW50T3JGYWN0b3J5OiBJTWFuYWdlZEhvdmVyQ29udGVudE9yRmFjdG9yeSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvbnRlbnQgPSB0eXBlb2YgY29udGVudE9yRmFjdG9yeSA9PT0gJ2Z1bmN0aW9uJyA/IGNvbnRlbnRPckZhY3RvcnkoKSA6IGNvbnRlbnRPckZhY3Rvcnk7XG5cdGlmIChpc1N0cmluZyhjb250ZW50KSkge1xuXHRcdC8vIEljb25zIGRvbid0IHJlbmRlciBpbiB0aGUgbmF0aXZlIGhvdmVyIHNvIHdlIHN0cmlwIHRoZW0gb3V0XG5cdFx0cmV0dXJuIHN0cmlwSWNvbnMoY29udGVudCk7XG5cdH1cblx0aWYgKGlzTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nKGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQubWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjaztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzZXR1cE5hdGl2ZUhvdmVyKHRhcmdldEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb250ZW50OiBJTWFuYWdlZEhvdmVyQ29udGVudE9yRmFjdG9yeSk6IElNYW5hZ2VkSG92ZXIge1xuXHRmdW5jdGlvbiB1cGRhdGVUaXRsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRpdGxlKSB7XG5cdFx0XHR0YXJnZXRFbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCB0aXRsZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCd0aXRsZScpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVRpdGxlKGdldFN0cmluZ0NvbnRlbnQoY29udGVudCkpO1xuXHRyZXR1cm4ge1xuXHRcdHVwZGF0ZTogKGNvbnRlbnQpID0+IHVwZGF0ZVRpdGxlKGdldFN0cmluZ0NvbnRlbnQoY29udGVudCkpLFxuXHRcdHNob3c6ICgpID0+IHsgfSxcblx0XHRoaWRlOiAoKSA9PiB7IH0sXG5cdFx0ZGlzcG9zZTogKCkgPT4gdXBkYXRlVGl0bGUodW5kZWZpbmVkKSxcblx0fTtcbn1cblxuY2xhc3MgSG92ZXJDb250ZXh0Vmlld0RlbGVnYXRlIGltcGxlbWVudHMgSURlbGVnYXRlIHtcblxuXHQvLyBSZW5kZXIgb3ZlciBhbGwgb3RoZXIgY29udGV4dCB2aWV3cywgd2l0aCBoaWdoZXIgbGF5ZXJzIGZvciBuZXN0ZWQgaG92ZXJzXG5cdHB1YmxpYyByZWFkb25seSBsYXllcjogbnVtYmVyO1xuXG5cdGdldCBhbmNob3JQb3NpdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5faG92ZXIuYW5jaG9yO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXI6IEhvdmVyV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzOiBib29sZWFuID0gZmFsc2UsXG5cdFx0c3RhY2tEZXB0aDogbnVtYmVyID0gMVxuXHQpIHtcblx0XHQvLyBCYXNlIGxheWVyIGlzIDEsIG5lc3RlZCBob3ZlcnMgZ2V0IGhpZ2hlciBsYXllcnNcblx0XHR0aGlzLmxheWVyID0gc3RhY2tEZXB0aDtcblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5faG92ZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzKSB7XG5cdFx0XHR0aGlzLl9ob3Zlci5mb2N1cygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faG92ZXI7XG5cdH1cblxuXHRnZXRBbmNob3IoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHg6IHRoaXMuX2hvdmVyLngsXG5cdFx0XHR5OiB0aGlzLl9ob3Zlci55XG5cdFx0fTtcblx0fVxuXG5cdGxheW91dCgpIHtcblx0XHR0aGlzLl9ob3Zlci5sYXlvdXQoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBldmVudElzUmVsYXRlZFRvVGFyZ2V0KGV2ZW50OiBVSUV2ZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0hUTUxFbGVtZW50KGV2ZW50LnRhcmdldCkgJiYgZ2V0SG92ZXJUYXJnZXRFbGVtZW50KGV2ZW50LnRhcmdldCwgdGFyZ2V0KSA9PT0gdGFyZ2V0O1xufVxuXG5mdW5jdGlvbiBnZXRIb3ZlclRhcmdldEVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQsIHN0b3BFbGVtZW50PzogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdHN0b3BFbGVtZW50ID0gc3RvcEVsZW1lbnQgPz8gZ2V0V2luZG93KGVsZW1lbnQpLmRvY3VtZW50LmJvZHk7XG5cdHdoaWxlICghZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2N1c3RvbS1ob3ZlcicpICYmIGVsZW1lbnQgIT09IHN0b3BFbGVtZW50KSB7XG5cdFx0ZWxlbWVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudCE7XG5cdH1cblx0cmV0dXJuIGVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVNb3VzZVN0eWxlSG92ZXJUYXJnZXQodGFyZ2V0OiBIVE1MRWxlbWVudCwgZTogTW91c2VFdmVudCk6IElIb3ZlclRhcmdldCB7XG5cdHJldHVybiB7XG5cdFx0dGFyZ2V0RWxlbWVudHM6IFt0YXJnZXRdLFxuXHRcdHg6IGUueCArIDEwXG5cdH07XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElIb3ZlclNlcnZpY2UsIEhvdmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGhvdmVyQm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9ySG92ZXJCb3JkZXIpO1xuXHRpZiAoaG92ZXJCb3JkZXIpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci53b3JrYmVuY2gtaG92ZXIgLmhvdmVyLXJvdzpub3QoOmZpcnN0LWNoaWxkKTpub3QoOmVtcHR5KSB7IGJvcmRlci10b3A6IDFweCBzb2xpZCAke2hvdmVyQm9yZGVyLnRyYW5zcGFyZW50KDAuNSl9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28taG92ZXIud29ya2JlbmNoLWhvdmVyIGhyIHsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICR7aG92ZXJCb3JkZXIudHJhbnNwYXJlbnQoMC41KX07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWEsOEJBQXlDO0FBQy9ELFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsdUJBQXVCLFdBQVcsa0JBQWtCLDJCQUEyQixZQUFZLFdBQVcsZUFBZSx5QkFBeUI7QUFDdkosU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLDJDQUFxTjtBQUUxTyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFNBQVMsb0JBQW9CO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxVQUFVLFNBQVMsY0FB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
