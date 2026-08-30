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
import * as dom from "../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../base/browser/domStylesheets.js";
import { ToolBar } from "../../../base/browser/ui/toolbar/toolbar.js";
import { Button } from "../../../base/browser/ui/button/button.js";
import { CountBadge } from "../../../base/browser/ui/countBadge/countBadge.js";
import { ProgressBar } from "../../../base/browser/ui/progressbar/progressbar.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, MutableDisposable, dispose } from "../../../base/common/lifecycle.js";
import Severity from "../../../base/common/severity.js";
import { isString } from "../../../base/common/types.js";
import { isModifierKey } from "../../../base/common/keyCodes.js";
import { localize } from "../../../nls.js";
import { QuickInputHideReason, QuickPickFocus } from "../common/quickInput.js";
import { QuickInputBox } from "./quickInputBox.js";
import { QuickPick, backButton, InputBox, QuickWidget, InQuickInputContextKey, QuickInputTypeContextKey, EndOfQuickInputBoxContextKey, QuickInputAlignmentContextKey } from "./quickInput.js";
import { ILayoutService } from "../../layout/browser/layoutService.js";
import { mainWindow } from "../../../base/browser/window.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { QuickInputList } from "./quickInputList.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import "./quickInputActions.js";
import { autorun, observableValue } from "../../../base/common/observable.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { Platform, platform, setTimeout0 } from "../../../base/common/platform.js";
import { getWindowControlsStyle, WindowControlsStyle } from "../../window/common/window.js";
import { getZoomFactor } from "../../../base/browser/browser.js";
import { TriStateCheckbox, createToggleActionViewItemProvider } from "../../../base/browser/ui/toggle/toggle.js";
import { defaultCheckboxStyles } from "../../theme/browser/defaultStyles.js";
import { QuickInputTreeController } from "./tree/quickInputTreeController.js";
import { QuickTree } from "./tree/quickTree.js";
import { AnchorAlignment, AnchorPosition, layout2d } from "../../../base/common/layout.js";
import { getAnchorRect } from "../../../base/browser/ui/contextview/contextview.js";
const $ = dom.$;
const VIEWSTATE_STORAGE_KEY = "workbench.quickInput.viewState";
const QUICK_INPUT_MOTION_CLOSING_CLASS = "quick-input-widget-closing";
const QUICK_INPUT_OVERLAY_CLASS = "quick-input-widget-overlay";
const QUICK_INPUT_CLOSE_ANIMATION_DURATION = 150;
const QUICK_INPUT_MOTION_ANCESTOR_CLASSES = ["style-override", "monaco-enable-motion"];
function getQuickInputWidth(availableWidth) {
  return Math.min(availableWidth * 0.62, 600);
}
let QuickInputController = class extends Disposable {
  constructor(options, layoutService, instantiationService, contextKeyService, storageService, contextMenuService) {
    super();
    this.options = options;
    this.layoutService = layoutService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.contextMenuService = contextMenuService;
    this.enabled = true;
    this.onDidAcceptEmitter = this._register(new Emitter());
    this.onDidCustomEmitter = this._register(new Emitter());
    this.onDidTriggerButtonEmitter = this._register(new Emitter());
    this.keyMods = { ctrlCmd: false, alt: false, shift: false };
    this.controller = null;
    this.onShowEmitter = this._register(new Emitter());
    this.onShow = this.onShowEmitter.event;
    this.onHideEmitter = this._register(new Emitter());
    this.onHide = this.onHideEmitter.event;
    this.closeAnimation = this._register(new MutableDisposable());
    this._alignment = observableValue(this, "top");
    this.alignment = this._alignment;
    this.backButton = backButton;
    this.inQuickInputContext = InQuickInputContextKey.bindTo(contextKeyService);
    this.quickInputTypeContext = QuickInputTypeContextKey.bindTo(contextKeyService);
    this.endOfQuickInputBoxContext = EndOfQuickInputBoxContextKey.bindTo(contextKeyService);
    this.idPrefix = options.idPrefix;
    this._container = options.container;
    this.styles = options.styles;
    this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => this.registerKeyModsListeners(window, disposables), { window: mainWindow, disposables: this._store }));
    this._register(dom.onWillUnregisterWindow((window) => {
      if (this.ui && dom.getWindow(this.ui.container) === window) {
        this.reparentUI(this.layoutService.mainContainer);
        this.layout(this.layoutService.mainContainerDimension, this.layoutService.mainContainerOffset.quickPickTop);
      }
    }));
    this.viewState = this.loadViewState();
  }
  get currentQuickInput() {
    return this.controller ?? void 0;
  }
  get container() {
    return this._container;
  }
  registerKeyModsListeners(window, disposables) {
    const listener = (e) => {
      this.keyMods.ctrlCmd = e.ctrlKey || e.metaKey;
      this.keyMods.alt = e.altKey;
      this.keyMods.shift = e.shiftKey;
    };
    for (const event of [dom.EventType.KEY_DOWN, dom.EventType.KEY_UP, dom.EventType.MOUSE_DOWN]) {
      disposables.add(dom.addDisposableListener(window, event, listener, true));
    }
  }
  getUI(showInActiveContainer) {
    if (this.ui) {
      if (showInActiveContainer) {
        if (dom.getWindow(this._container) !== dom.getWindow(this.layoutService.activeContainer)) {
          this.reparentUI(this.layoutService.activeContainer);
          this.layout(this.layoutService.activeContainerDimension, this.layoutService.activeContainerOffset.quickPickTop);
        }
      }
      return this.ui;
    }
    const container = dom.append(this._container, $(".quick-input-widget.show-file-icons"));
    container.tabIndex = -1;
    container.style.display = "none";
    const styleSheet = domStylesheetsJs.createStyleSheet(container);
    const titleBar = dom.append(container, $(".quick-input-titlebar"));
    const leftActionBar = this._register(new ToolBar(titleBar, this.contextMenuService, {
      hoverDelegate: this.options.hoverDelegate,
      actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
      icon: true,
      label: false
    }));
    leftActionBar.getElement().classList.add("quick-input-left-action-bar");
    const title = dom.append(titleBar, $(".quick-input-title"));
    const rightActionBar = this._register(new ToolBar(titleBar, this.contextMenuService, {
      hoverDelegate: this.options.hoverDelegate,
      actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
      icon: true,
      label: false
    }));
    rightActionBar.getElement().classList.add("quick-input-right-action-bar");
    const headerContainer = dom.append(container, $(".quick-input-header"));
    const checkAll = this._register(new TriStateCheckbox(localize("quickInput.checkAll", "Toggle all checkboxes"), false, { ...defaultCheckboxStyles, size: 15 }));
    dom.append(headerContainer, checkAll.domNode);
    this._register(checkAll.onChange(() => {
      const checked = checkAll.checked;
      list.setAllVisibleChecked(checked === true);
    }));
    this._register(dom.addDisposableListener(checkAll.domNode, dom.EventType.CLICK, (e) => {
      if (e.x || e.y) {
        inputBox.setFocus();
      }
    }));
    const description2 = dom.append(headerContainer, $(".quick-input-description"));
    const inputContainer = dom.append(headerContainer, $(".quick-input-and-message"));
    const filterContainer = dom.append(inputContainer, $(".quick-input-filter"));
    const inputBox = this._register(new QuickInputBox(filterContainer, this.styles.inputBox, this.styles.toggle));
    inputBox.setAttribute("aria-describedby", `${this.idPrefix}message`);
    const visibleCountContainer = dom.append(filterContainer, $(".quick-input-visible-count"));
    visibleCountContainer.setAttribute("aria-live", "polite");
    visibleCountContainer.setAttribute("aria-atomic", "true");
    const visibleCount = this._register(new CountBadge(visibleCountContainer, { countFormat: localize({ key: "quickInput.visibleCount", comment: ["This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers."] }, "{0} Results") }, this.styles.countBadge));
    const countContainer = dom.append(filterContainer, $(".quick-input-count"));
    countContainer.setAttribute("aria-live", "polite");
    const count = this._register(new CountBadge(countContainer, { countFormat: localize({ key: "quickInput.countSelected", comment: ["This tells the user how many items are selected in a list of items to select from. The items can be anything."] }, "{0} Selected") }, this.styles.countBadge));
    const inlineActionBar = this._register(new ToolBar(headerContainer, this.contextMenuService, {
      hoverDelegate: this.options.hoverDelegate,
      actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
      icon: true,
      label: false
    }));
    inlineActionBar.getElement().classList.add("quick-input-inline-action-bar");
    const okContainer = dom.append(headerContainer, $(".quick-input-action"));
    const ok = this._register(new Button(okContainer, this.styles.button));
    ok.label = localize("ok", "OK");
    this._register(ok.onDidClick((e) => {
      this.onDidAcceptEmitter.fire();
    }));
    const customButtonContainer = dom.append(headerContainer, $(".quick-input-action"));
    const customButton = this._register(new Button(customButtonContainer, { ...this.styles.button, supportIcons: true }));
    customButton.label = localize("custom", "Custom");
    this._register(customButton.onDidClick((e) => {
      this.onDidCustomEmitter.fire();
    }));
    const message = dom.append(inputContainer, $(`#${this.idPrefix}message.quick-input-message`));
    const progressBar = this._register(new ProgressBar(container, this.styles.progressBar));
    progressBar.getContainer().classList.add("quick-input-progress");
    const widget = dom.append(container, $(".quick-input-html-widget"));
    widget.tabIndex = -1;
    const description1 = dom.append(container, $(".quick-input-description"));
    const listId = this.idPrefix + "list";
    const list = this._register(this.instantiationService.createInstance(QuickInputList, container, this.options.hoverDelegate, this.options.linkOpenerDelegate, listId, this.styles));
    inputBox.setAttribute("aria-controls", listId);
    this._register(list.onDidChangeFocus(() => {
      if (inputBox.hasFocus()) {
        const activeDescendant = list.getActiveDescendant();
        if (activeDescendant) {
          inputBox.setAttribute("aria-activedescendant", activeDescendant);
          inputBox.setListFocusMode(true);
        } else {
          inputBox.removeAttribute("aria-activedescendant");
          inputBox.setListFocusMode(false);
        }
      }
    }));
    this._register(list.onChangedAllVisibleChecked((checked) => {
      checkAll.checked = checked;
    }));
    this._register(list.onChangedVisibleCount((c) => {
      visibleCount.setCount(c);
    }));
    this._register(list.onChangedCheckedCount((c) => {
      setTimeout0(() => count.setCount(c));
    }));
    this._register(list.onLeave(() => {
      setTimeout(() => {
        if (!this.controller) {
          return;
        }
        inputBox.setFocus();
        if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
          list.clearFocus();
        }
      }, 0);
    }));
    const tree = this._register(this.instantiationService.createInstance(
      QuickInputTreeController,
      container,
      this.options.hoverDelegate,
      this.styles
    ));
    this._register(tree.tree.onDidChangeFocus(() => {
      if (inputBox.hasFocus()) {
        const activeDescendant = tree.getActiveDescendant();
        if (activeDescendant) {
          inputBox.setAttribute("aria-activedescendant", activeDescendant);
          inputBox.setListFocusMode(true);
        } else {
          inputBox.removeAttribute("aria-activedescendant");
          inputBox.setListFocusMode(false);
        }
      }
    }));
    this._register(tree.onLeave(() => {
      setTimeout(() => {
        if (!this.controller) {
          return;
        }
        inputBox.setFocus();
        tree.tree.setFocus([]);
      }, 0);
    }));
    this._register(tree.onDidAccept(() => {
      this.onDidAcceptEmitter.fire();
    }));
    this._register(tree.tree.onDidChangeContentHeight(() => this.updateLayout()));
    const focusTracker = dom.trackFocus(container);
    this._register(focusTracker);
    this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e) => {
      const ui = this.getUI();
      if (dom.isAncestor(e.relatedTarget, ui.inputContainer)) {
        const value = ui.inputBox.isSelectionAtEnd();
        if (this.endOfQuickInputBoxContext.get() !== value) {
          this.endOfQuickInputBoxContext.set(value);
        }
      }
      if (dom.isAncestor(e.relatedTarget, ui.container)) {
        return;
      }
      this.inQuickInputContext.set(true);
      this.previousFocusElement = dom.isHTMLElement(e.relatedTarget) ? e.relatedTarget : void 0;
    }, true));
    this._register(focusTracker.onDidBlur(() => {
      if (!this.getUI().ignoreFocusOut && !this.options.ignoreFocusOut()) {
        this.hide(QuickInputHideReason.Blur);
      }
      this.inQuickInputContext.set(false);
      this.endOfQuickInputBoxContext.set(false);
      this.previousFocusElement = void 0;
    }));
    this._register(inputBox.onKeyDown((e) => {
      const value = this.getUI().inputBox.isSelectionAtEnd();
      if (this.endOfQuickInputBoxContext.get() !== value) {
        this.endOfQuickInputBoxContext.set(value);
      }
      if (!isModifierKey(e.keyCode)) {
        inputBox.removeAttribute("aria-activedescendant");
        inputBox.setListFocusMode(false);
      }
    }));
    this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e) => {
      inputBox.setFocus();
    }));
    this.dndController = this._register(this.instantiationService.createInstance(
      QuickInputDragAndDropController,
      this._container,
      container,
      [
        {
          node: titleBar,
          includeChildren: true,
          excludeNodes: [leftActionBar.getElement(), rightActionBar.getElement()]
        },
        {
          node: headerContainer,
          includeChildren: false
        }
      ],
      this.viewState
    ));
    this._register(autorun((reader) => {
      const dndViewState = this.dndController?.dndViewState.read(reader);
      if (!dndViewState) {
        return;
      }
      if (dndViewState.top !== void 0 && dndViewState.left !== void 0) {
        this.viewState = {
          ...this.viewState,
          top: dndViewState.top,
          left: dndViewState.left
        };
      } else {
        this.viewState = void 0;
      }
      this.updateLayout();
      if (dndViewState.done) {
        this.saveViewState(this.viewState);
      }
    }));
    this._register(autorun((reader) => {
      this._alignment.set(this.dndController.alignment.read(reader), void 0);
    }));
    this.ui = {
      container,
      styleSheet,
      leftActionBar,
      titleBar,
      title,
      description1,
      description2,
      widget,
      rightActionBar,
      inlineActionBar,
      checkAll,
      inputContainer,
      filterContainer,
      inputBox,
      visibleCountContainer,
      visibleCount,
      countContainer,
      count,
      okContainer,
      ok,
      message,
      customButtonContainer,
      customButton,
      list,
      tree,
      progressBar,
      onDidAccept: this.onDidAcceptEmitter.event,
      onDidCustom: this.onDidCustomEmitter.event,
      onDidTriggerButton: this.onDidTriggerButtonEmitter.event,
      ignoreFocusOut: false,
      keyMods: this.keyMods,
      show: (controller) => this.show(controller),
      hide: () => this.hide(),
      setVisibilities: (visibilities) => this.setVisibilities(visibilities),
      setEnabled: (enabled) => this.setEnabled(enabled),
      setContextKey: (contextKey) => this.options.setContextKey(contextKey),
      linkOpenerDelegate: (content) => this.options.linkOpenerDelegate(content)
    };
    this.updateStyles();
    return this.ui;
  }
  reparentUI(container) {
    if (this.ui) {
      this._container = container;
      dom.append(this._container, this.ui.container);
      this.dndController?.reparentUI(this._container);
    }
  }
  pick(picks, options = {}, token = CancellationToken.None) {
    return new Promise((doResolve, reject) => {
      let resolve = (result) => {
        resolve = doResolve;
        options.onKeyMods?.(input.keyMods);
        doResolve(result);
      };
      if (token.isCancellationRequested) {
        resolve(void 0);
        return;
      }
      const input = this.createQuickPick({ useSeparators: true });
      let activeItem;
      const disposables = [
        input,
        input.onDidAccept(() => {
          if (input.canSelectMany) {
            resolve(input.selectedItems.slice());
            input.hide();
          } else {
            const result = input.activeItems[0];
            if (result) {
              resolve(result);
              input.hide();
            }
          }
        }),
        input.onDidChangeActive((items) => {
          const focused = items[0];
          if (focused && options.onDidFocus) {
            options.onDidFocus(focused);
          }
        }),
        input.onDidChangeSelection((items) => {
          if (!input.canSelectMany) {
            const result = items[0];
            if (result) {
              resolve(result);
              input.hide();
            }
          }
        }),
        input.onDidTriggerItemButton((event) => options.onDidTriggerItemButton && options.onDidTriggerItemButton({
          ...event,
          removeItem: () => {
            const index = input.items.indexOf(event.item);
            if (index !== -1) {
              const items = input.items.slice();
              const removed = items.splice(index, 1);
              const activeItems = input.activeItems.filter((activeItem2) => activeItem2 !== removed[0]);
              const keepScrollPositionBefore = input.keepScrollPosition;
              input.keepScrollPosition = true;
              input.items = items;
              if (activeItems) {
                input.activeItems = activeItems;
              }
              input.keepScrollPosition = keepScrollPositionBefore;
            }
          }
        })),
        input.onDidTriggerSeparatorButton((event) => options.onDidTriggerSeparatorButton?.(event)),
        input.onDidChangeValue((value) => {
          if (activeItem && !value && (input.activeItems.length !== 1 || input.activeItems[0] !== activeItem)) {
            input.activeItems = [activeItem];
          }
        }),
        token.onCancellationRequested(() => {
          input.hide();
        }),
        input.onDidHide(() => {
          dispose(disposables);
          resolve(void 0);
        })
      ];
      input.title = options.title;
      if (options.value) {
        input.value = options.value;
      }
      input.canSelectMany = !!options.canPickMany;
      input.placeholder = options.placeHolder;
      input.prompt = options.prompt;
      input.ignoreFocusOut = !!options.ignoreFocusLost;
      input.matchOnDescription = !!options.matchOnDescription;
      input.matchOnDetail = !!options.matchOnDetail;
      if (options.sortByLabel !== void 0) {
        input.sortByLabel = options.sortByLabel;
      }
      input.matchOnLabel = options.matchOnLabel === void 0 || options.matchOnLabel;
      input.quickNavigate = options.quickNavigate;
      input.hideInput = !!options.hideInput;
      input.contextKey = options.contextKey;
      input.anchor = options.anchor;
      input.anchorPosition = options.anchorPosition;
      input.busy = true;
      Promise.all([picks, options.activeItem]).then(([items, _activeItem]) => {
        activeItem = _activeItem;
        input.busy = false;
        input.items = items;
        if (input.canSelectMany) {
          input.selectedItems = items.filter((item) => item.type !== "separator" && item.picked);
        }
        if (activeItem) {
          input.activeItems = [activeItem];
        }
      });
      input.show();
      Promise.resolve(picks).then(void 0, (err) => {
        reject(err);
        input.hide();
      });
    });
  }
  setValidationOnInput(input, validationResult) {
    if (validationResult && isString(validationResult)) {
      input.severity = Severity.Error;
      input.validationMessage = validationResult;
    } else if (validationResult && !isString(validationResult)) {
      input.severity = validationResult.severity;
      input.validationMessage = validationResult.content;
    } else {
      input.severity = Severity.Ignore;
      input.validationMessage = void 0;
    }
  }
  input(options = {}, token = CancellationToken.None) {
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve(void 0);
        return;
      }
      const input = this.createInputBox();
      const validateInput = options.validateInput || (() => Promise.resolve(void 0));
      const onDidValueChange = Event.debounce(input.onDidChangeValue, (last, cur) => cur, 100);
      let validationValue = options.value || "";
      let validation = Promise.resolve(validateInput(validationValue));
      const disposables = [
        input,
        onDidValueChange((value) => {
          if (value !== validationValue) {
            validation = Promise.resolve(validateInput(value));
            validationValue = value;
          }
          validation.then((result) => {
            if (value === validationValue) {
              this.setValidationOnInput(input, result);
            }
          });
        }),
        input.onDidAccept(() => {
          const value = input.value;
          if (value !== validationValue) {
            validation = Promise.resolve(validateInput(value));
            validationValue = value;
          }
          validation.then((result) => {
            if (!result || !isString(result) && result.severity !== Severity.Error) {
              resolve(value);
              input.hide();
            } else if (value === validationValue) {
              this.setValidationOnInput(input, result);
            }
          });
        }),
        token.onCancellationRequested(() => {
          input.hide();
        }),
        input.onDidHide(() => {
          dispose(disposables);
          resolve(void 0);
        })
      ];
      input.title = options.title;
      input.value = options.value || "";
      input.valueSelection = options.valueSelection;
      input.prompt = options.prompt;
      input.placeholder = options.placeHolder;
      input.password = !!options.password;
      input.ignoreFocusOut = !!options.ignoreFocusLost;
      input.show();
    });
  }
  createQuickPick(options = { useSeparators: false }) {
    const ui = this.getUI(true);
    return new QuickPick(ui);
  }
  createInputBox() {
    const ui = this.getUI(true);
    return new InputBox(ui);
  }
  setAlignment(alignment) {
    if (this.controller?.anchor) {
      return;
    }
    this.dndController?.setAlignment(alignment);
  }
  createQuickWidget() {
    const ui = this.getUI(true);
    return new QuickWidget(ui);
  }
  createQuickTree() {
    const ui = this.getUI(true);
    return new QuickTree(ui);
  }
  show(controller) {
    this.completeCloseAnimation();
    const ui = this.getUI(true);
    const oldController = this.controller;
    this.controller = controller;
    oldController?.didHide();
    if (dom.isHTMLElement(controller.anchor)) {
      const anchorWindow = dom.getWindow(controller.anchor);
      if (dom.getWindow(this._container) !== anchorWindow) {
        this.reparentUI(this.layoutService.getContainer(anchorWindow));
      }
    }
    this.setEnabled(true);
    ui.leftActionBar.setActions([]);
    ui.title.textContent = "";
    ui.description1.textContent = "";
    ui.description2.textContent = "";
    dom.reset(ui.widget);
    ui.rightActionBar.setActions([]);
    ui.inlineActionBar.setActions([]);
    ui.checkAll.checked = false;
    ui.inputBox.placeholder = "";
    ui.inputBox.password = false;
    ui.inputBox.showDecoration(Severity.Ignore);
    ui.visibleCount.setCount(0);
    ui.count.setCount(0);
    ui.countContainer.style.right = "4px";
    dom.reset(ui.message);
    ui.progressBar.stop();
    ui.progressBar.getContainer().setAttribute("aria-hidden", "true");
    ui.list.setElements([]);
    ui.list.matchOnDescription = false;
    ui.list.matchOnDetail = false;
    ui.list.matchOnLabel = true;
    ui.list.sortByLabel = true;
    ui.tree.updateFilterOptions({
      matchOnDescription: false,
      matchOnLabel: true
    });
    ui.tree.sortByLabel = true;
    ui.ignoreFocusOut = false;
    ui.inputBox.toggles = void 0;
    ui.inputBox.actions = void 0;
    ui.inputBox.setHeight(void 0);
    const backKeybindingLabel = this.options.backKeybindingLabel();
    backButton.tooltip = backKeybindingLabel ? localize("quickInput.backWithKeybinding", "Back ({0})", backKeybindingLabel) : localize("quickInput.back", "Back");
    this.overlayLayoutCorrection = void 0;
    ui.container.classList.toggle(QUICK_INPUT_OVERLAY_CLASS, controller.anchorPosition === "overlay");
    ui.container.style.display = "";
    this.updateLayout();
    this.dndController?.setEnabled(!controller.anchor);
    this.dndController?.layoutContainer();
    if (controller.anchor) {
      this._alignment.set("custom", void 0);
    } else {
      this._alignment.set(this.dndController?.alignment.get() ?? "top", void 0);
    }
    this.onShowEmitter.fire();
    ui.inputBox.setFocus();
    this.quickInputTypeContext.set(controller.type);
  }
  isVisible() {
    return !!this.controller;
  }
  setVisibilities(visibilities) {
    const ui = this.getUI();
    ui.title.style.display = visibilities.title ? "" : "none";
    ui.description1.style.display = visibilities.description && (visibilities.inputBox || visibilities.checkAll) ? "" : "none";
    ui.description2.style.display = visibilities.description && !(visibilities.inputBox || visibilities.checkAll) ? "" : "none";
    ui.checkAll.domNode.style.display = visibilities.checkAll ? "" : "none";
    ui.inputContainer.style.display = visibilities.inputBox ? "" : "none";
    ui.filterContainer.style.display = visibilities.inputBox ? "" : "none";
    ui.visibleCountContainer.style.display = visibilities.visibleCount ? "" : "none";
    ui.countContainer.style.display = visibilities.count ? "" : "none";
    ui.okContainer.style.display = visibilities.ok ? "" : "none";
    ui.customButtonContainer.style.display = visibilities.customButton ? "" : "none";
    ui.message.style.display = visibilities.message ? "" : "none";
    ui.progressBar.getContainer().style.display = visibilities.progressBar ? "" : "none";
    ui.list.displayed = !!visibilities.list;
    ui.tree.displayed = !!visibilities.tree;
    ui.container.classList.toggle("show-checkboxes", !!visibilities.checkBox);
    ui.container.classList.toggle("hidden-input", !visibilities.inputBox && !visibilities.description);
    this.overlayLayoutCorrection = void 0;
    this.updateLayout();
  }
  setEnabled(enabled) {
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      const ui = this.getUI();
      for (let i = 0; i < ui.leftActionBar.getItemsLength(); i++) {
        const action = ui.leftActionBar.getItemAction(i);
        if (action) {
          action.enabled = enabled;
        }
      }
      for (let i = 0; i < ui.rightActionBar.getItemsLength(); i++) {
        const action = ui.rightActionBar.getItemAction(i);
        if (action) {
          action.enabled = enabled;
        }
      }
      if (enabled) {
        ui.checkAll.enable();
      } else {
        ui.checkAll.disable();
      }
      ui.inputBox.enabled = enabled;
      ui.ok.enabled = enabled;
      ui.list.enabled = enabled;
    }
  }
  hide(reason) {
    const controller = this.controller;
    if (!controller) {
      return;
    }
    controller.willHide(reason);
    const container = this.ui?.container;
    const focusChanged = container && !dom.isAncestorOfActiveElement(container);
    this.controller = null;
    this.onHideEmitter.fire();
    if (container) {
      if (!container.classList.contains(QUICK_INPUT_OVERLAY_CLASS) && dom.hasParentWithClass(container, QUICK_INPUT_MOTION_ANCESTOR_CLASSES)) {
        container.inert = true;
        container.classList.add(QUICK_INPUT_MOTION_CLOSING_CLASS);
        this.closeAnimation.value = disposableTimeout(() => this.completeCloseAnimation(), QUICK_INPUT_CLOSE_ANIMATION_DURATION);
      } else {
        container.style.display = "none";
      }
    }
    if (!focusChanged) {
      let currentElement = this.previousFocusElement;
      while (currentElement && !currentElement.offsetParent) {
        currentElement = currentElement.parentElement ?? void 0;
      }
      if (currentElement?.offsetParent) {
        currentElement.focus();
        this.previousFocusElement = void 0;
      } else {
        this.options.returnFocus();
      }
    }
    controller.didHide(reason);
  }
  completeCloseAnimation() {
    if (!this.closeAnimation.value) {
      return;
    }
    this.closeAnimation.clear();
    const container = this.ui?.container;
    if (container) {
      container.inert = false;
      container.classList.remove(QUICK_INPUT_MOTION_CLOSING_CLASS);
      container.style.display = "none";
    }
  }
  dispose() {
    this.completeCloseAnimation();
    super.dispose();
  }
  focus() {
    if (this.isVisible()) {
      const ui = this.getUI();
      if (ui.inputBox.enabled) {
        ui.inputBox.setFocus();
      } else {
        ui.list.domFocus();
      }
    }
  }
  toggle() {
    if (!this.isVisible()) {
      return;
    }
    if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
      this.getUI().list.toggleCheckbox();
    } else if (this.controller instanceof QuickTree) {
      this.getUI().tree.toggleCheckbox();
    }
  }
  toggleHover() {
    if (this.isVisible() && this.controller instanceof QuickPick) {
      this.getUI().list.toggleHover();
    }
  }
  navigate(next, quickNavigate) {
    if (this.isVisible() && this.getUI().list.displayed) {
      this.getUI().list.focus(next ? QuickPickFocus.Next : QuickPickFocus.Previous);
      if (quickNavigate && this.controller instanceof QuickPick) {
        this.controller.quickNavigate = quickNavigate;
      }
    }
  }
  async accept(keyMods = { alt: false, ctrlCmd: false, shift: false }) {
    this.keyMods.alt = keyMods.alt;
    this.keyMods.ctrlCmd = keyMods.ctrlCmd;
    this.keyMods.shift = keyMods.shift;
    this.onDidAcceptEmitter.fire();
  }
  async back() {
    this.onDidTriggerButtonEmitter.fire(this.backButton);
  }
  async cancel(reason) {
    this.hide(reason);
  }
  layout(dimension, titleBarOffset) {
    this.dimension = dimension;
    this.titleBarOffset = titleBarOffset;
    this.overlayLayoutCorrection = void 0;
    this.updateLayout();
  }
  updateLayout() {
    if (this.ui && this.isVisible()) {
      const style = this.ui.container.style;
      let width = getQuickInputWidth(this.dimension.width);
      style.width = width + "px";
      let listHeight = this.dimension && this.dimension.height * 0.4;
      let overlayAnchor;
      if (this.controller?.anchor) {
        const target = this.controller.anchor;
        const isElement = dom.isHTMLElement(target);
        const anchorWindow = isElement ? dom.getWindow(target) : dom.getActiveWindow();
        const container = this.layoutService.getContainer(anchorWindow).getBoundingClientRect();
        const verticalPadding = 6 + 26 + 16;
        let anchor = getAnchorRect(target);
        let preferredAnchorPosition = AnchorPosition.ABOVE;
        let listHeightRatio = 0.2;
        let maxListHeight = 200;
        if (this.controller.anchorPosition === "overlay") {
          overlayAnchor = anchor;
          this.ui.inputBox.setHeight(anchor.height);
          width = anchor.width;
          listHeightRatio = 0.4;
          anchor = { ...anchor, height: 0 };
          maxListHeight = Math.min(400, container.bottom - anchor.top - verticalPadding);
          preferredAnchorPosition = AnchorPosition.BELOW;
        } else {
          width = 380;
        }
        listHeight = this.dimension ? Math.min(this.dimension.height * listHeightRatio, maxListHeight) : maxListHeight;
        const containerHeight = Math.floor(listHeight) + verticalPadding;
        const { top, left, right, bottom, anchorAlignment, anchorPosition } = layout2d(container, { width, height: containerHeight }, anchor, { anchorPosition: preferredAnchorPosition });
        if (anchorAlignment === AnchorAlignment.RIGHT) {
          style.right = `${right}px`;
          style.left = "initial";
        } else {
          style.left = `${left}px`;
          style.right = "initial";
        }
        if (anchorPosition === AnchorPosition.ABOVE) {
          style.bottom = `${bottom}px`;
          style.top = "initial";
        } else {
          style.top = `${top}px`;
          style.bottom = "initial";
        }
        style.width = `${width}px`;
        style.height = "";
      } else {
        style.top = `${this.viewState?.top !== void 0 ? Math.round(this.dimension.height * this.viewState.top) : this.titleBarOffset}px`;
        style.left = `${Math.round(this.dimension.width * (this.viewState?.left ?? 0.5) - width / 2)}px`;
        style.right = "";
        style.bottom = "";
        style.height = "";
      }
      if (overlayAnchor) {
        this.alignOverlayInput(overlayAnchor);
      }
      this.ui.inputBox.layout();
      this.ui.list.layout(listHeight);
      this.ui.tree.layout(listHeight);
    }
  }
  alignOverlayInput(anchor) {
    const style = this.ui.container.style;
    let correction = this.overlayLayoutCorrection;
    if (!correction || correction.anchor.left !== anchor.left || correction.anchor.top !== anchor.top || correction.anchor.width !== anchor.width || correction.anchor.height !== anchor.height) {
      this.ui.inputBox.layout();
      const input = this.ui.filterContainer.getBoundingClientRect();
      correction = this.overlayLayoutCorrection = {
        anchor,
        left: anchor.left - input.left,
        right: input.right - (anchor.left + anchor.width),
        top: anchor.top - input.top,
        bottom: input.bottom - (anchor.top + anchor.height),
        width: anchor.width - input.width
      };
    }
    style.width = `${parseFloat(style.width) + correction.width}px`;
    if (style.left !== "initial") {
      style.left = `${parseFloat(style.left) + correction.left}px`;
    } else {
      style.right = `${parseFloat(style.right) + correction.right}px`;
    }
    if (style.top !== "initial") {
      style.top = `${parseFloat(style.top) + correction.top}px`;
    } else {
      style.bottom = `${parseFloat(style.bottom) + correction.bottom}px`;
    }
  }
  applyStyles(styles) {
    this.styles = styles;
    this.updateStyles();
  }
  updateStyles() {
    if (this.ui) {
      const {
        quickInputTitleBackground,
        quickInputBackground,
        quickInputForeground,
        widgetBorder
      } = this.styles.widget;
      this.ui.titleBar.style.backgroundColor = quickInputTitleBackground ?? "";
      this.ui.container.style.backgroundColor = quickInputBackground ?? "";
      this.ui.container.style.color = quickInputForeground ?? "";
      this.ui.container.style.border = widgetBorder ? `1px solid ${widgetBorder}` : "";
      this.ui.list.style(this.styles.list);
      this.ui.tree.tree.style(this.styles.list);
      const content = [];
      if (this.styles.pickerGroup.pickerGroupBorder) {
        content.push(`.quick-input-list .quick-input-list-entry { border-top-color:  ${this.styles.pickerGroup.pickerGroupBorder}; }`);
      }
      if (this.styles.pickerGroup.pickerGroupForeground) {
        content.push(`.quick-input-list .quick-input-list-separator { color:  ${this.styles.pickerGroup.pickerGroupForeground}; }`);
      }
      if (this.styles.pickerGroup.pickerGroupForeground) {
        content.push(`.quick-input-list .quick-input-list-separator-as-item { color: var(--vscode-descriptionForeground); }`);
      }
      if (this.styles.keybindingLabel.keybindingLabelBackground || this.styles.keybindingLabel.keybindingLabelBorder || this.styles.keybindingLabel.keybindingLabelBottomBorder || this.styles.keybindingLabel.keybindingLabelShadow || this.styles.keybindingLabel.keybindingLabelForeground) {
        content.push(".quick-input-list .monaco-keybinding > .monaco-keybinding-key {");
        if (this.styles.keybindingLabel.keybindingLabelBackground) {
          content.push(`background-color: ${this.styles.keybindingLabel.keybindingLabelBackground};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelBorder) {
          content.push(`border-color: ${this.styles.keybindingLabel.keybindingLabelBorder};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelBottomBorder) {
          content.push(`border-bottom-color: ${this.styles.keybindingLabel.keybindingLabelBottomBorder};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelShadow) {
          content.push(`box-shadow: inset 0 -1px 0 ${this.styles.keybindingLabel.keybindingLabelShadow};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelForeground) {
          content.push(`color: ${this.styles.keybindingLabel.keybindingLabelForeground};`);
        }
        content.push("}");
      }
      const newStyles = content.join("\n");
      if (newStyles !== this.ui.styleSheet.textContent) {
        this.ui.styleSheet.textContent = newStyles;
      }
    }
  }
  loadViewState() {
    try {
      const data = JSON.parse(this.storageService.get(VIEWSTATE_STORAGE_KEY, StorageScope.APPLICATION, "{}"));
      if (data.top !== void 0 || data.left !== void 0) {
        return data;
      }
    } catch {
    }
    return void 0;
  }
  saveViewState(viewState) {
    const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
    if (!isMainWindow) {
      return;
    }
    if (viewState !== void 0) {
      this.storageService.store(VIEWSTATE_STORAGE_KEY, JSON.stringify(viewState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(VIEWSTATE_STORAGE_KEY, StorageScope.APPLICATION);
    }
  }
};
QuickInputController = __decorateClass([
  __decorateParam(1, ILayoutService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IContextMenuService)
], QuickInputController);
let QuickInputDragAndDropController = class extends Disposable {
  constructor(_container, _quickInputContainer, _quickInputDragAreas, initialViewState, _layoutService, contextKeyService, configurationService) {
    super();
    this._container = _container;
    this._quickInputContainer = _quickInputContainer;
    this._quickInputDragAreas = _quickInputDragAreas;
    this._layoutService = _layoutService;
    this.configurationService = configurationService;
    this.dndViewState = observableValue(this, void 0);
    this._enabled = true;
    this._snapThreshold = 20;
    this._snapLineHorizontalRatio = 0.25;
    this._alignment = observableValue(this, "top");
    this.alignment = this._alignment;
    this._quickInputAlignmentContext = QuickInputAlignmentContextKey.bindTo(contextKeyService);
    const customWindowControls = getWindowControlsStyle(this.configurationService) === WindowControlsStyle.CUSTOM;
    this._controlsOnLeft = customWindowControls && platform === Platform.Mac;
    this._controlsOnRight = customWindowControls && (platform === Platform.Windows || platform === Platform.Linux);
    this._registerLayoutListener();
    this.registerMouseListeners();
    this.dndViewState.set({ ...initialViewState, done: true }, void 0);
    if (initialViewState?.top !== void 0 && initialViewState?.left !== void 0) {
      this._setAlignmentState(void 0);
    }
  }
  reparentUI(container) {
    this._container = container;
  }
  layoutContainer(dimension = this._layoutService.activeContainerDimension) {
    if (!this._enabled) {
      return;
    }
    const state = this.dndViewState.get();
    const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
    if (state?.top !== void 0 && state?.left !== void 0) {
      const a = Math.round(state.left * 100) / 100;
      const b = dimension.width;
      const c = dragAreaRect.width;
      const d = a * b - c / 2;
      this._layout(state.top * dimension.height, d);
    }
  }
  setEnabled(enabled) {
    this._enabled = enabled;
    this._quickInputContainer.classList.toggle("no-drag", !enabled);
  }
  _setAlignmentState(value) {
    this._quickInputAlignmentContext.set(value);
    this._alignment.set(value ?? "custom", void 0);
  }
  setAlignment(alignment, done = true) {
    if (alignment === "top") {
      this.dndViewState.set({
        top: this._getTopSnapValue() / this._container.clientHeight,
        left: (this._getCenterXSnapValue() + this._quickInputContainer.clientWidth / 2) / this._container.clientWidth,
        done
      }, void 0);
      this._setAlignmentState("top");
    } else if (alignment === "center") {
      this.dndViewState.set({
        top: this._getCenterYSnapValue() / this._container.clientHeight,
        left: (this._getCenterXSnapValue() + this._quickInputContainer.clientWidth / 2) / this._container.clientWidth,
        done
      }, void 0);
      this._setAlignmentState("center");
    } else {
      this.dndViewState.set({ top: alignment.top, left: alignment.left, done }, void 0);
      this._setAlignmentState(void 0);
    }
  }
  _registerLayoutListener() {
    this._register(Event.filter(this._layoutService.onDidLayoutContainer, (e) => e.container === this._container)((e) => this.layoutContainer(e.dimension)));
  }
  registerMouseListeners() {
    const dragArea = this._quickInputContainer;
    this._register(dom.addDisposableGenericMouseUpListener(dragArea, (event) => {
      if (!this._enabled) {
        return;
      }
      const originEvent = new StandardMouseEvent(dom.getWindow(dragArea), event);
      if (originEvent.detail !== 2) {
        return;
      }
      const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
      if (!area || area.excludeNodes?.some((node) => dom.isAncestor(originEvent.target, node))) {
        return;
      }
      this.dndViewState.set({ top: void 0, left: void 0, done: true }, void 0);
      this._setAlignmentState("top");
    }));
    this._register(dom.addDisposableGenericMouseDownListener(dragArea, (e) => {
      if (!this._enabled) {
        return;
      }
      const activeWindow = dom.getWindow(this._layoutService.activeContainer);
      const originEvent = new StandardMouseEvent(activeWindow, e);
      const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
      if (!area || area.excludeNodes?.some((node) => dom.isAncestor(originEvent.target, node))) {
        return;
      }
      const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
      const dragOffsetX = originEvent.browserEvent.clientX - dragAreaRect.left;
      const dragOffsetY = originEvent.browserEvent.clientY - dragAreaRect.top;
      let isMovingQuickInput = false;
      const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e2) => {
        const mouseMoveEvent = new StandardMouseEvent(activeWindow, e2);
        mouseMoveEvent.preventDefault();
        if (!isMovingQuickInput) {
          isMovingQuickInput = true;
        }
        this._layout(e2.clientY - dragOffsetY, e2.clientX - dragOffsetX);
      });
      const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e2) => {
        if (isMovingQuickInput) {
          const state = this.dndViewState.get();
          this.dndViewState.set({ top: state?.top, left: state?.left, done: true }, void 0);
        }
        mouseMoveListener.dispose();
        mouseUpListener.dispose();
      });
    }));
  }
  _layout(topCoordinate, leftCoordinate) {
    const snapCoordinateYTop = this._getTopSnapValue();
    const snapCoordinateY = this._getCenterYSnapValue();
    const snapCoordinateX = this._getCenterXSnapValue();
    topCoordinate = Math.max(0, Math.min(topCoordinate, this._container.clientHeight - this._quickInputContainer.clientHeight));
    if (topCoordinate < this._layoutService.activeContainerOffset.top) {
      if (this._controlsOnLeft) {
        leftCoordinate = Math.max(leftCoordinate, 80 / getZoomFactor(dom.getActiveWindow()));
      } else if (this._controlsOnRight) {
        leftCoordinate = Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth - 140 / getZoomFactor(dom.getActiveWindow()));
      }
    }
    const snappingToTop = Math.abs(topCoordinate - snapCoordinateYTop) < this._snapThreshold;
    topCoordinate = snappingToTop ? snapCoordinateYTop : topCoordinate;
    const snappingToCenter = Math.abs(topCoordinate - snapCoordinateY) < this._snapThreshold;
    topCoordinate = snappingToCenter ? snapCoordinateY : topCoordinate;
    const top = topCoordinate / this._container.clientHeight;
    leftCoordinate = Math.max(0, Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth));
    const snappingToCenterX = Math.abs(leftCoordinate - snapCoordinateX) < this._snapThreshold;
    leftCoordinate = snappingToCenterX ? snapCoordinateX : leftCoordinate;
    const b = this._container.clientWidth;
    const c = this._quickInputContainer.clientWidth;
    const d = leftCoordinate;
    const left = (d + c / 2) / b;
    this.dndViewState.set({ top, left, done: false }, void 0);
    if (snappingToCenterX) {
      if (snappingToTop) {
        this._setAlignmentState("top");
        return;
      } else if (snappingToCenter) {
        this._setAlignmentState("center");
        return;
      }
    }
    this._setAlignmentState(void 0);
  }
  _getTopSnapValue() {
    return this._layoutService.activeContainerOffset.quickPickTop;
  }
  _getCenterYSnapValue() {
    return Math.round(this._container.clientHeight * this._snapLineHorizontalRatio);
  }
  _getCenterXSnapValue() {
    return Math.round(this._container.clientWidth / 2) - Math.round(this._quickInputContainer.clientWidth / 2);
  }
};
QuickInputDragAndDropController = __decorateClass([
  __decorateParam(4, ILayoutService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService)
], QuickInputDragAndDropController);
export {
  QuickInputController,
  getQuickInputWidth
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcYnJvd3NlclxccXVpY2tJbnB1dENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNNb2RpZmllcktleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnB1dEJveCwgSUlucHV0T3B0aW9ucywgSUtleU1vZHMsIElQaWNrT3B0aW9ucywgSVF1aWNrSW5wdXQsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb24sIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tXaWRnZXQsIFF1aWNrSW5wdXRIaWRlUmVhc29uLCBRdWlja1BpY2tJbnB1dCwgUXVpY2tQaWNrRm9jdXMsIFF1aWNrSW5wdXRUeXBlLCBJUXVpY2tUcmVlLCBJUXVpY2tUcmVlSXRlbSwgUXVpY2tJbnB1dEFsaWdubWVudCB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRCb3ggfSBmcm9tICcuL3F1aWNrSW5wdXRCb3guanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFVJLCBXcml0ZWFibGUsIElRdWlja0lucHV0U3R5bGVzLCBJUXVpY2tJbnB1dE9wdGlvbnMsIFF1aWNrUGljaywgYmFja0J1dHRvbiwgSW5wdXRCb3gsIFZpc2liaWxpdGllcywgUXVpY2tXaWRnZXQsIEluUXVpY2tJbnB1dENvbnRleHRLZXksIFF1aWNrSW5wdXRUeXBlQ29udGV4dEtleSwgRW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dEtleSwgUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkgfSBmcm9tICcuL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dExpc3QgfSBmcm9tICcuL3F1aWNrSW5wdXRMaXN0LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCAnLi9xdWlja0lucHV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1biwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybSwgcGxhdGZvcm0sIHNldFRpbWVvdXQwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93Q29udHJvbHNTdHlsZSwgV2luZG93Q29udHJvbHNTdHlsZSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IGdldFpvb21GYWN0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBUcmlTdGF0ZUNoZWNrYm94LCBjcmVhdGVUb2dnbGVBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRUcmVlQ29udHJvbGxlciB9IGZyb20gJy4vdHJlZS9xdWlja0lucHV0VHJlZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUXVpY2tUcmVlIH0gZnJvbSAnLi90cmVlL3F1aWNrVHJlZS5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQsIEFuY2hvclBvc2l0aW9uLCBJUmVjdCwgbGF5b3V0MmQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0IHsgZ2V0QW5jaG9yUmVjdCwgSUFuY2hvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgVklFV1NUQVRFX1NUT1JBR0VfS0VZID0gJ3dvcmtiZW5jaC5xdWlja0lucHV0LnZpZXdTdGF0ZSc7XG5jb25zdCBRVUlDS19JTlBVVF9NT1RJT05fQ0xPU0lOR19DTEFTUyA9ICdxdWljay1pbnB1dC13aWRnZXQtY2xvc2luZyc7XG5jb25zdCBRVUlDS19JTlBVVF9PVkVSTEFZX0NMQVNTID0gJ3F1aWNrLWlucHV0LXdpZGdldC1vdmVybGF5JztcbmNvbnN0IFFVSUNLX0lOUFVUX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTiA9IDE1MDtcbmNvbnN0IFFVSUNLX0lOUFVUX01PVElPTl9BTkNFU1RPUl9DTEFTU0VTID0gWydzdHlsZS1vdmVycmlkZScsICdtb25hY28tZW5hYmxlLW1vdGlvbiddO1xuXG50eXBlIFF1aWNrSW5wdXRWaWV3U3RhdGUgPSB7XG5cdHJlYWRvbmx5IHRvcD86IG51bWJlcjtcblx0cmVhZG9ubHkgbGVmdD86IG51bWJlcjtcbn07XG5cbnR5cGUgUXVpY2tJbnB1dE92ZXJsYXlMYXlvdXRDb3JyZWN0aW9uID0ge1xuXHRyZWFkb25seSBhbmNob3I6IElSZWN0O1xuXHRyZWFkb25seSBsZWZ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHJpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRvcDogbnVtYmVyO1xuXHRyZWFkb25seSBib3R0b206IG51bWJlcjtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRRdWlja0lucHV0V2lkdGgoYXZhaWxhYmxlV2lkdGg6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1pbihhdmFpbGFibGVXaWR0aCAqIDAuNjIsIDYwMCk7XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja0lucHV0Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIGlkUHJlZml4OiBzdHJpbmc7XG5cdHByaXZhdGUgdWk6IFF1aWNrSW5wdXRVSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkaW1lbnNpb24/OiBkb20uSURpbWVuc2lvbjtcblx0cHJpdmF0ZSB0aXRsZUJhck9mZnNldD86IG51bWJlcjtcblx0cHJpdmF0ZSBvdmVybGF5TGF5b3V0Q29ycmVjdGlvbjogUXVpY2tJbnB1dE92ZXJsYXlMYXlvdXRDb3JyZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVuYWJsZWQgPSB0cnVlO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQWNjZXB0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ3VzdG9tRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tJbnB1dEJ1dHRvbj4oKSk7XG5cdHByaXZhdGUga2V5TW9kczogV3JpdGVhYmxlPElLZXlNb2RzPiA9IHsgY3RybENtZDogZmFsc2UsIGFsdDogZmFsc2UsIHNoaWZ0OiBmYWxzZSB9O1xuXG5cdHByaXZhdGUgY29udHJvbGxlcjogSVF1aWNrSW5wdXQgfCBudWxsID0gbnVsbDtcblx0Z2V0IGN1cnJlbnRRdWlja0lucHV0KCkgeyByZXR1cm4gdGhpcy5jb250cm9sbGVyID8/IHVuZGVmaW5lZDsgfVxuXG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGdldCBjb250YWluZXIoKSB7IHJldHVybiB0aGlzLl9jb250YWluZXI7IH1cblxuXHRwcml2YXRlIHN0eWxlczogSVF1aWNrSW5wdXRTdHlsZXM7XG5cblx0cHJpdmF0ZSBvblNob3dFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uU2hvdyA9IHRoaXMub25TaG93RW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIG9uSGlkZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25IaWRlID0gdGhpcy5vbkhpZGVFbWl0dGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcHJldmlvdXNGb2N1c0VsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHZpZXdTdGF0ZTogUXVpY2tJbnB1dFZpZXdTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkbmRDb250cm9sbGVyOiBRdWlja0lucHV0RHJhZ0FuZERyb3BDb250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNsb3NlQW5pbWF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGlnbm1lbnQgPSBvYnNlcnZhYmxlVmFsdWU8UXVpY2tJbnB1dEFsaWdubWVudD4odGhpcywgJ3RvcCcpO1xuXHRyZWFkb25seSBhbGlnbm1lbnQ6IElPYnNlcnZhYmxlPFF1aWNrSW5wdXRBbGlnbm1lbnQ+ID0gdGhpcy5fYWxpZ25tZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5RdWlja0lucHV0Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFR5cGVDb250ZXh0OiBJQ29udGV4dEtleTxRdWlja0lucHV0VHlwZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBvcHRpb25zOiBJUXVpY2tJbnB1dE9wdGlvbnMsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmluUXVpY2tJbnB1dENvbnRleHQgPSBJblF1aWNrSW5wdXRDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5xdWlja0lucHV0VHlwZUNvbnRleHQgPSBRdWlja0lucHV0VHlwZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmVuZE9mUXVpY2tJbnB1dEJveENvbnRleHQgPSBFbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmlkUHJlZml4ID0gb3B0aW9ucy5pZFByZWZpeDtcblx0XHR0aGlzLl9jb250YWluZXIgPSBvcHRpb25zLmNvbnRhaW5lcjtcblx0XHR0aGlzLnN0eWxlcyA9IG9wdGlvbnMuc3R5bGVzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShkb20ub25EaWRSZWdpc3RlcldpbmRvdywgKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiB0aGlzLnJlZ2lzdGVyS2V5TW9kc0xpc3RlbmVycyh3aW5kb3csIGRpc3Bvc2FibGVzKSwgeyB3aW5kb3c6IG1haW5XaW5kb3csIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLm9uV2lsbFVucmVnaXN0ZXJXaW5kb3cod2luZG93ID0+IHtcblx0XHRcdGlmICh0aGlzLnVpICYmIGRvbS5nZXRXaW5kb3codGhpcy51aS5jb250YWluZXIpID09PSB3aW5kb3cpIHtcblx0XHRcdFx0Ly8gVGhlIHdpbmRvdyB0aGlzIHF1aWNrIGlucHV0IGlzIGNvbnRhaW5lZCBpbiBpcyBhYm91dCB0b1xuXHRcdFx0XHQvLyBjbG9zZSwgc28gd2UgaGF2ZSB0byBtYWtlIHN1cmUgdG8gcmVwYXJlbnQgaXQgYmFjayB0byBhblxuXHRcdFx0XHQvLyBleGlzdGluZyBwYXJlbnQgdG8gbm90IGxvb3NlIGZ1bmN0aW9uYWxpdHkuXG5cdFx0XHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk1ODcwKVxuXHRcdFx0XHR0aGlzLnJlcGFyZW50VUkodGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lckRpbWVuc2lvbiwgdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJPZmZzZXQucXVpY2tQaWNrVG9wKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy52aWV3U3RhdGUgPSB0aGlzLmxvYWRWaWV3U3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJLZXlNb2RzTGlzdGVuZXJzKHdpbmRvdzogV2luZG93LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSAoZTogS2V5Ym9hcmRFdmVudCB8IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdHRoaXMua2V5TW9kcy5jdHJsQ21kID0gZS5jdHJsS2V5IHx8IGUubWV0YUtleTtcblx0XHRcdHRoaXMua2V5TW9kcy5hbHQgPSBlLmFsdEtleTtcblx0XHRcdHRoaXMua2V5TW9kcy5zaGlmdCA9IGUuc2hpZnRLZXk7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgW2RvbS5FdmVudFR5cGUuS0VZX0RPV04sIGRvbS5FdmVudFR5cGUuS0VZX1VQLCBkb20uRXZlbnRUeXBlLk1PVVNFX0RPV05dKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3csIGV2ZW50LCBsaXN0ZW5lciwgdHJ1ZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VUkoc2hvd0luQWN0aXZlQ29udGFpbmVyPzogYm9vbGVhbik6IFF1aWNrSW5wdXRVSSB7XG5cdFx0aWYgKHRoaXMudWkpIHtcblx0XHRcdC8vIEluIG9yZGVyIHRvIHN1cHBvcnQgYXV4IHdpbmRvd3MsIHJlLXBhcmVudCB0aGUgY29udHJvbGxlclxuXHRcdFx0Ly8gaWYgdGhlIG9yaWdpbmFsIGV2ZW50IGlzIGZyb20gYSBkaWZmZXJlbnQgZG9jdW1lbnRcblx0XHRcdGlmIChzaG93SW5BY3RpdmVDb250YWluZXIpIHtcblx0XHRcdFx0aWYgKGRvbS5nZXRXaW5kb3codGhpcy5fY29udGFpbmVyKSAhPT0gZG9tLmdldFdpbmRvdyh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyKSkge1xuXHRcdFx0XHRcdHRoaXMucmVwYXJlbnRVSSh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyKTtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyRGltZW5zaW9uLCB0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyT2Zmc2V0LnF1aWNrUGlja1RvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMudWk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLl9jb250YWluZXIsICQoJy5xdWljay1pbnB1dC13aWRnZXQuc2hvdy1maWxlLWljb25zJykpO1xuXHRcdGNvbnRhaW5lci50YWJJbmRleCA9IC0xO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Y29uc3Qgc3R5bGVTaGVldCA9IGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGl0bGVCYXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LXRpdGxlYmFyJykpO1xuXG5cdFx0Y29uc3QgbGVmdEFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb29sQmFyKHRpdGxlQmFyLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBjcmVhdGVUb2dnbGVBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuc3R5bGVzLnRvZ2dsZSksXG5cdFx0XHRpY29uOiB0cnVlLFxuXHRcdFx0bGFiZWw6IGZhbHNlXG5cdFx0fSkpO1xuXHRcdGxlZnRBY3Rpb25CYXIuZ2V0RWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ3F1aWNrLWlucHV0LWxlZnQtYWN0aW9uLWJhcicpO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBkb20uYXBwZW5kKHRpdGxlQmFyLCAkKCcucXVpY2staW5wdXQtdGl0bGUnKSk7XG5cblx0XHRjb25zdCByaWdodEFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb29sQmFyKHRpdGxlQmFyLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBjcmVhdGVUb2dnbGVBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuc3R5bGVzLnRvZ2dsZSksXG5cdFx0XHRpY29uOiB0cnVlLFxuXHRcdFx0bGFiZWw6IGZhbHNlXG5cdFx0fSkpO1xuXHRcdHJpZ2h0QWN0aW9uQmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdxdWljay1pbnB1dC1yaWdodC1hY3Rpb24tYmFyJyk7XG5cblx0XHRjb25zdCBoZWFkZXJDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWhlYWRlcicpKTtcblxuXHRcdGNvbnN0IGNoZWNrQWxsID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRyaVN0YXRlQ2hlY2tib3gobG9jYWxpemUoJ3F1aWNrSW5wdXQuY2hlY2tBbGwnLCBcIlRvZ2dsZSBhbGwgY2hlY2tib3hlc1wiKSwgZmFsc2UsIHsgLi4uZGVmYXVsdENoZWNrYm94U3R5bGVzLCBzaXplOiAxNSB9KSk7XG5cdFx0ZG9tLmFwcGVuZChoZWFkZXJDb250YWluZXIsIGNoZWNrQWxsLmRvbU5vZGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoZWNrQWxsLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IGNoZWNrZWQgPSBjaGVja0FsbC5jaGVja2VkO1xuXHRcdFx0bGlzdC5zZXRBbGxWaXNpYmxlQ2hlY2tlZChjaGVja2VkID09PSB0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjaGVja0FsbC5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLnggfHwgZS55KSB7IC8vIEF2b2lkICdjbGljaycgdHJpZ2dlcmVkIGJ5ICdzcGFjZScuLi5cblx0XHRcdFx0aW5wdXRCb3guc2V0Rm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbjIgPSBkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IGlucHV0Q29udGFpbmVyID0gZG9tLmFwcGVuZChoZWFkZXJDb250YWluZXIsICQoJy5xdWljay1pbnB1dC1hbmQtbWVzc2FnZScpKTtcblx0XHRjb25zdCBmaWx0ZXJDb250YWluZXIgPSBkb20uYXBwZW5kKGlucHV0Q29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtZmlsdGVyJykpO1xuXG5cdFx0Y29uc3QgaW5wdXRCb3ggPSB0aGlzLl9yZWdpc3RlcihuZXcgUXVpY2tJbnB1dEJveChmaWx0ZXJDb250YWluZXIsIHRoaXMuc3R5bGVzLmlucHV0Qm94LCB0aGlzLnN0eWxlcy50b2dnbGUpKTtcblx0XHRpbnB1dEJveC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpYmVkYnknLCBgJHt0aGlzLmlkUHJlZml4fW1lc3NhZ2VgKTtcblxuXHRcdGNvbnN0IHZpc2libGVDb3VudENvbnRhaW5lciA9IGRvbS5hcHBlbmQoZmlsdGVyQ29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtdmlzaWJsZS1jb3VudCcpKTtcblx0XHR2aXNpYmxlQ291bnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0dmlzaWJsZUNvdW50Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1hdG9taWMnLCAndHJ1ZScpO1xuXHRcdGNvbnN0IHZpc2libGVDb3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb3VudEJhZGdlKHZpc2libGVDb3VudENvbnRhaW5lciwgeyBjb3VudEZvcm1hdDogbG9jYWxpemUoeyBrZXk6ICdxdWlja0lucHV0LnZpc2libGVDb3VudCcsIGNvbW1lbnQ6IFsnVGhpcyB0ZWxscyB0aGUgdXNlciBob3cgbWFueSBpdGVtcyBhcmUgc2hvd24gaW4gYSBsaXN0IG9mIGl0ZW1zIHRvIHNlbGVjdCBmcm9tLiBUaGUgaXRlbXMgY2FuIGJlIGFueXRoaW5nLiBDdXJyZW50bHkgbm90IHZpc2libGUsIGJ1dCByZWFkIGJ5IHNjcmVlbiByZWFkZXJzLiddIH0sIFwiezB9IFJlc3VsdHNcIikgfSwgdGhpcy5zdHlsZXMuY291bnRCYWRnZSkpO1xuXG5cdFx0Y29uc3QgY291bnRDb250YWluZXIgPSBkb20uYXBwZW5kKGZpbHRlckNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWNvdW50JykpO1xuXHRcdGNvdW50Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuXHRcdGNvbnN0IGNvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvdW50QmFkZ2UoY291bnRDb250YWluZXIsIHsgY291bnRGb3JtYXQ6IGxvY2FsaXplKHsga2V5OiAncXVpY2tJbnB1dC5jb3VudFNlbGVjdGVkJywgY29tbWVudDogWydUaGlzIHRlbGxzIHRoZSB1c2VyIGhvdyBtYW55IGl0ZW1zIGFyZSBzZWxlY3RlZCBpbiBhIGxpc3Qgb2YgaXRlbXMgdG8gc2VsZWN0IGZyb20uIFRoZSBpdGVtcyBjYW4gYmUgYW55dGhpbmcuJ10gfSwgXCJ7MH0gU2VsZWN0ZWRcIikgfSwgdGhpcy5zdHlsZXMuY291bnRCYWRnZSkpO1xuXG5cdFx0Y29uc3QgaW5saW5lQWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvb2xCYXIoaGVhZGVyQ29udGFpbmVyLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBjcmVhdGVUb2dnbGVBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuc3R5bGVzLnRvZ2dsZSksXG5cdFx0XHRpY29uOiB0cnVlLFxuXHRcdFx0bGFiZWw6IGZhbHNlXG5cdFx0fSkpO1xuXHRcdGlubGluZUFjdGlvbkJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgncXVpY2staW5wdXQtaW5saW5lLWFjdGlvbi1iYXInKTtcblxuXHRcdGNvbnN0IG9rQ29udGFpbmVyID0gZG9tLmFwcGVuZChoZWFkZXJDb250YWluZXIsICQoJy5xdWljay1pbnB1dC1hY3Rpb24nKSk7XG5cdFx0Y29uc3Qgb2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKG9rQ29udGFpbmVyLCB0aGlzLnN0eWxlcy5idXR0b24pKTtcblx0XHRvay5sYWJlbCA9IGxvY2FsaXplKCdvaycsIFwiT0tcIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob2sub25EaWRDbGljayhlID0+IHtcblx0XHRcdHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjdXN0b21CdXR0b25Db250YWluZXIgPSBkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWFjdGlvbicpKTtcblx0XHRjb25zdCBjdXN0b21CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGN1c3RvbUJ1dHRvbkNvbnRhaW5lciwgeyAuLi50aGlzLnN0eWxlcy5idXR0b24sIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0Y3VzdG9tQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2N1c3RvbScsIFwiQ3VzdG9tXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGN1c3RvbUJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0dGhpcy5vbkRpZEN1c3RvbUVtaXR0ZXIuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBkb20uYXBwZW5kKGlucHV0Q29udGFpbmVyLCAkKGAjJHt0aGlzLmlkUHJlZml4fW1lc3NhZ2UucXVpY2staW5wdXQtbWVzc2FnZWApKTtcblxuXHRcdGNvbnN0IHByb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKGNvbnRhaW5lciwgdGhpcy5zdHlsZXMucHJvZ3Jlc3NCYXIpKTtcblx0XHRwcm9ncmVzc0Jhci5nZXRDb250YWluZXIoKS5jbGFzc0xpc3QuYWRkKCdxdWljay1pbnB1dC1wcm9ncmVzcycpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5xdWljay1pbnB1dC1odG1sLXdpZGdldCcpKTtcblx0XHR3aWRnZXQudGFiSW5kZXggPSAtMTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uMSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtZGVzY3JpcHRpb24nKSk7XG5cblx0XHQvLyBMaXN0XG5cdFx0Y29uc3QgbGlzdElkID0gdGhpcy5pZFByZWZpeCArICdsaXN0Jztcblx0XHRjb25zdCBsaXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0lucHV0TGlzdCwgY29udGFpbmVyLCB0aGlzLm9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSwgdGhpcy5vcHRpb25zLmxpbmtPcGVuZXJEZWxlZ2F0ZSwgbGlzdElkLCB0aGlzLnN0eWxlcykpO1xuXHRcdGlucHV0Qm94LnNldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycsIGxpc3RJZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlzdC5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHtcblx0XHRcdGlmIChpbnB1dEJveC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZURlc2NlbmRhbnQgPSBsaXN0LmdldEFjdGl2ZURlc2NlbmRhbnQoKTtcblx0XHRcdFx0aWYgKGFjdGl2ZURlc2NlbmRhbnQpIHtcblx0XHRcdFx0XHRpbnB1dEJveC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIGFjdGl2ZURlc2NlbmRhbnQpO1xuXHRcdFx0XHRcdGlucHV0Qm94LnNldExpc3RGb2N1c01vZGUodHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5wdXRCb3gucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcblx0XHRcdFx0XHRpbnB1dEJveC5zZXRMaXN0Rm9jdXNNb2RlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uQ2hhbmdlZEFsbFZpc2libGVDaGVja2VkKGNoZWNrZWQgPT4ge1xuXHRcdFx0Ly8gVE9ETzogU3VwcG9ydCB0cmktc3RhdGUgY2hlY2tib3ggd2hlbiB3ZSByZW1vdmUgdGhlIC5pbmRlbnQgcHJvcGVydHkgdGhhdCBpcyBmYWtpbmcgdHJlZSBzdHJ1Y3R1cmUuXG5cdFx0XHRjaGVja0FsbC5jaGVja2VkID0gY2hlY2tlZDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlzdC5vbkNoYW5nZWRWaXNpYmxlQ291bnQoYyA9PiB7XG5cdFx0XHR2aXNpYmxlQ291bnQuc2V0Q291bnQoYyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25DaGFuZ2VkQ2hlY2tlZENvdW50KGMgPT4ge1xuXHRcdFx0Ly8gVE9ET0BUeWxlckxlb25oYXJkdDogV2l0aG91dCB0aGlzIHNldFRpbWVvdXQsIHRoZSBzY3JlZW4gcmVhZGVyIHdpbGwgbm90IHJlYWQgb3V0XG5cdFx0XHQvLyB0aGUgZmluYWwgY291bnQgb2YgY2hlY2tlZCBpdGVtcyBjb3JyZWN0bHkuIEludmVzdGlnYXRlIGEgYmV0dGVyIHdheVxuXHRcdFx0Ly8gdG8gZG8gdGhpcy4gcmVmIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTg2MTdcblx0XHRcdHNldFRpbWVvdXQwKCgpID0+IGNvdW50LnNldENvdW50KGMpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlzdC5vbkxlYXZlKCgpID0+IHtcblx0XHRcdC8vIERlZmVyIHRvIGF2b2lkIHRoZSBpbnB1dCBmaWVsZCByZWFjdGluZyB0byB0aGUgdHJpZ2dlcmluZyBrZXkuXG5cdFx0XHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDM2NzVcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnB1dEJveC5zZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAodGhpcy5jb250cm9sbGVyIGluc3RhbmNlb2YgUXVpY2tQaWNrICYmIHRoaXMuY29udHJvbGxlci5jYW5TZWxlY3RNYW55KSB7XG5cdFx0XHRcdFx0bGlzdC5jbGVhckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDApO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyZWVcblx0XHRjb25zdCB0cmVlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFF1aWNrSW5wdXRUcmVlQ29udHJvbGxlcixcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHRoaXMub3B0aW9ucy5ob3ZlckRlbGVnYXRlLFxuXHRcdFx0dGhpcy5zdHlsZXNcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0cmVlLnRyZWUub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHRpZiAoaW5wdXRCb3guaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVEZXNjZW5kYW50ID0gdHJlZS5nZXRBY3RpdmVEZXNjZW5kYW50KCk7XG5cdFx0XHRcdGlmIChhY3RpdmVEZXNjZW5kYW50KSB7XG5cdFx0XHRcdFx0aW5wdXRCb3guc2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnLCBhY3RpdmVEZXNjZW5kYW50KTtcblx0XHRcdFx0XHRpbnB1dEJveC5zZXRMaXN0Rm9jdXNNb2RlKHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlucHV0Qm94LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XG5cdFx0XHRcdFx0aW5wdXRCb3guc2V0TGlzdEZvY3VzTW9kZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodHJlZS5vbkxlYXZlKCgpID0+IHtcblx0XHRcdC8vIERlZmVyIHRvIGF2b2lkIHRoZSBpbnB1dCBmaWVsZCByZWFjdGluZyB0byB0aGUgdHJpZ2dlcmluZyBrZXkuXG5cdFx0XHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDM2NzVcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnB1dEJveC5zZXRGb2N1cygpO1xuXHRcdFx0XHR0cmVlLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0fSwgMCk7XG5cdFx0fSkpO1xuXHRcdC8vIFdpcmUgdXAgdHJlZSdzIGFjY2VwdCBldmVudCB0byB0aGUgVUkncyBhY2NlcHQgZW1pdHRlciBmb3Igbm9uLXBpY2thYmxlIGl0ZW1zXG5cdFx0dGhpcy5fcmVnaXN0ZXIodHJlZS5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHR0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUudHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4gdGhpcy51cGRhdGVMYXlvdXQoKSkpO1xuXG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gZG9tLnRyYWNrRm9jdXMoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkZPQ1VTLCBlID0+IHtcblx0XHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSgpO1xuXHRcdFx0aWYgKGRvbS5pc0FuY2VzdG9yKGUucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCwgdWkuaW5wdXRDb250YWluZXIpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gdWkuaW5wdXRCb3guaXNTZWxlY3Rpb25BdEVuZCgpO1xuXHRcdFx0XHRpZiAodGhpcy5lbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0LmdldCgpICE9PSB2YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dC5zZXQodmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBJZ25vcmUgZm9jdXMgZXZlbnRzIHdpdGhpbiBjb250YWluZXJcblx0XHRcdGlmIChkb20uaXNBbmNlc3RvcihlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQsIHVpLmNvbnRhaW5lcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5pblF1aWNrSW5wdXRDb250ZXh0LnNldCh0cnVlKTtcblx0XHRcdHRoaXMucHJldmlvdXNGb2N1c0VsZW1lbnQgPSBkb20uaXNIVE1MRWxlbWVudChlLnJlbGF0ZWRUYXJnZXQpID8gZS5yZWxhdGVkVGFyZ2V0IDogdW5kZWZpbmVkO1xuXHRcdH0sIHRydWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5nZXRVSSgpLmlnbm9yZUZvY3VzT3V0ICYmICF0aGlzLm9wdGlvbnMuaWdub3JlRm9jdXNPdXQoKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoUXVpY2tJbnB1dEhpZGVSZWFzb24uQmx1cik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmluUXVpY2tJbnB1dENvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5wcmV2aW91c0ZvY3VzRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5wdXRCb3gub25LZXlEb3duKGUgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmdldFVJKCkuaW5wdXRCb3guaXNTZWxlY3Rpb25BdEVuZCgpO1xuXHRcdFx0aWYgKHRoaXMuZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dC5nZXQoKSAhPT0gdmFsdWUpIHtcblx0XHRcdFx0dGhpcy5lbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0LnNldCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBBbGxvdyBzY3JlZW4gcmVhZGVycyB0byByZWFkIHdoYXQncyBpbiB0aGUgaW5wdXRcblx0XHRcdC8vIE5vdGU6IHRoaXMgd29ya3MgZm9yIGFycm93IGtleXMgYW5kIHNlbGVjdGlvbiBjaGFuZ2VzLFxuXHRcdFx0Ly8gYnV0IG5vdCBmb3IgZGVsZXRpb25zIHNpbmNlIHRoYXQgb2Z0ZW4gdHJpZ2dlcnMgYVxuXHRcdFx0Ly8gY2hhbmdlIGluIHRoZSBsaXN0LlxuXHRcdFx0Ly8gRG9uJ3QgcmVtb3ZlIGFyaWEtYWN0aXZlZGVzY2VuZGFudCB3aGVuIG9ubHkgbW9kaWZpZXIga2V5cyBhcmUgcHJlc3NlZFxuXHRcdFx0Ly8gdG8gcHJldmVudCBzY3JlZW4gcmVhZGVyIHJlLWFubm91bmNlbWVudHMgd2hlbiB1c2VycyBwcmVzcyBDdHJsIHRvIHNpbGVuY2Ugc3BlZWNoLlxuXHRcdFx0Ly8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjcxMDMyXG5cdFx0XHRpZiAoIWlzTW9kaWZpZXJLZXkoZS5rZXlDb2RlKSkge1xuXHRcdFx0XHRpbnB1dEJveC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xuXHRcdFx0XHQvLyBSZXNldCBBUklBIHBvcHVwIG1vZGUgdG8gYWxsb3cgbm9ybWFsIHRleHQgZWRpdGluZyB3aXRoIGFycm93IGtleXNcblx0XHRcdFx0aW5wdXRCb3guc2V0TGlzdEZvY3VzTW9kZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkZPQ1VTLCAoZTogRm9jdXNFdmVudCkgPT4ge1xuXHRcdFx0aW5wdXRCb3guc2V0Rm9jdXMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBEcmFnIGFuZCBEcm9wIHN1cHBvcnRcblx0XHR0aGlzLmRuZENvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UXVpY2tJbnB1dERyYWdBbmREcm9wQ29udHJvbGxlcixcblx0XHRcdHRoaXMuX2NvbnRhaW5lcixcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5vZGU6IHRpdGxlQmFyLFxuXHRcdFx0XHRcdGluY2x1ZGVDaGlsZHJlbjogdHJ1ZSxcblx0XHRcdFx0XHRleGNsdWRlTm9kZXM6IFtsZWZ0QWN0aW9uQmFyLmdldEVsZW1lbnQoKSwgcmlnaHRBY3Rpb25CYXIuZ2V0RWxlbWVudCgpXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bm9kZTogaGVhZGVyQ29udGFpbmVyLFxuXHRcdFx0XHRcdGluY2x1ZGVDaGlsZHJlbjogZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdHRoaXMudmlld1N0YXRlXG5cdFx0KSk7XG5cblx0XHQvLyBEbkQgdXBkYXRlIGxheW91dFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRuZFZpZXdTdGF0ZSA9IHRoaXMuZG5kQ29udHJvbGxlcj8uZG5kVmlld1N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZG5kVmlld1N0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRuZFZpZXdTdGF0ZS50b3AgIT09IHVuZGVmaW5lZCAmJiBkbmRWaWV3U3RhdGUubGVmdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMudmlld1N0YXRlID0ge1xuXHRcdFx0XHRcdC4uLnRoaXMudmlld1N0YXRlLFxuXHRcdFx0XHRcdHRvcDogZG5kVmlld1N0YXRlLnRvcCxcblx0XHRcdFx0XHRsZWZ0OiBkbmRWaWV3U3RhdGUubGVmdFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUmVzZXQgcG9zaXRpb24vc2l6ZVxuXHRcdFx0XHR0aGlzLnZpZXdTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVMYXlvdXQoKTtcblxuXHRcdFx0Ly8gU2F2ZSBwb3NpdGlvblxuXHRcdFx0aWYgKGRuZFZpZXdTdGF0ZS5kb25lKSB7XG5cdFx0XHRcdHRoaXMuc2F2ZVZpZXdTdGF0ZSh0aGlzLnZpZXdTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTWlycm9yIERuRCBhbGlnbm1lbnQgaW50byB0aGUgc3RhYmxlIG9ic2VydmFibGVcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9hbGlnbm1lbnQuc2V0KHRoaXMuZG5kQ29udHJvbGxlciEuYWxpZ25tZW50LnJlYWQocmVhZGVyKSwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVpID0ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0c3R5bGVTaGVldCxcblx0XHRcdGxlZnRBY3Rpb25CYXIsXG5cdFx0XHR0aXRsZUJhcixcblx0XHRcdHRpdGxlLFxuXHRcdFx0ZGVzY3JpcHRpb24xLFxuXHRcdFx0ZGVzY3JpcHRpb24yLFxuXHRcdFx0d2lkZ2V0LFxuXHRcdFx0cmlnaHRBY3Rpb25CYXIsXG5cdFx0XHRpbmxpbmVBY3Rpb25CYXIsXG5cdFx0XHRjaGVja0FsbCxcblx0XHRcdGlucHV0Q29udGFpbmVyLFxuXHRcdFx0ZmlsdGVyQ29udGFpbmVyLFxuXHRcdFx0aW5wdXRCb3gsXG5cdFx0XHR2aXNpYmxlQ291bnRDb250YWluZXIsXG5cdFx0XHR2aXNpYmxlQ291bnQsXG5cdFx0XHRjb3VudENvbnRhaW5lcixcblx0XHRcdGNvdW50LFxuXHRcdFx0b2tDb250YWluZXIsXG5cdFx0XHRvayxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRjdXN0b21CdXR0b25Db250YWluZXIsXG5cdFx0XHRjdXN0b21CdXR0b24sXG5cdFx0XHRsaXN0LFxuXHRcdFx0dHJlZSxcblx0XHRcdHByb2dyZXNzQmFyLFxuXHRcdFx0b25EaWRBY2NlcHQ6IHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWRDdXN0b206IHRoaXMub25EaWRDdXN0b21FbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWRUcmlnZ2VyQnV0dG9uOiB0aGlzLm9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRpZ25vcmVGb2N1c091dDogZmFsc2UsXG5cdFx0XHRrZXlNb2RzOiB0aGlzLmtleU1vZHMsXG5cdFx0XHRzaG93OiBjb250cm9sbGVyID0+IHRoaXMuc2hvdyhjb250cm9sbGVyKSxcblx0XHRcdGhpZGU6ICgpID0+IHRoaXMuaGlkZSgpLFxuXHRcdFx0c2V0VmlzaWJpbGl0aWVzOiB2aXNpYmlsaXRpZXMgPT4gdGhpcy5zZXRWaXNpYmlsaXRpZXModmlzaWJpbGl0aWVzKSxcblx0XHRcdHNldEVuYWJsZWQ6IGVuYWJsZWQgPT4gdGhpcy5zZXRFbmFibGVkKGVuYWJsZWQpLFxuXHRcdFx0c2V0Q29udGV4dEtleTogY29udGV4dEtleSA9PiB0aGlzLm9wdGlvbnMuc2V0Q29udGV4dEtleShjb250ZXh0S2V5KSxcblx0XHRcdGxpbmtPcGVuZXJEZWxlZ2F0ZTogY29udGVudCA9PiB0aGlzLm9wdGlvbnMubGlua09wZW5lckRlbGVnYXRlKGNvbnRlbnQpXG5cdFx0fTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdHJldHVybiB0aGlzLnVpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBhcmVudFVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy51aSkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLl9jb250YWluZXIsIHRoaXMudWkuY29udGFpbmVyKTtcblx0XHRcdHRoaXMuZG5kQ29udHJvbGxlcj8ucmVwYXJlbnRVSSh0aGlzLl9jb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdHBpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtLCBPIGV4dGVuZHMgSVBpY2tPcHRpb25zPFQ+PihwaWNrczogUHJvbWlzZTxRdWlja1BpY2tJbnB1dDxUPltdPiB8IFF1aWNrUGlja0lucHV0PFQ+W10sIG9wdGlvbnM6IElQaWNrT3B0aW9uczxUPiA9IHt9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTwoTyBleHRlbmRzIHsgY2FuUGlja01hbnk6IHRydWUgfSA/IFRbXSA6IFQpIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHlwZSBSID0gKE8gZXh0ZW5kcyB7IGNhblBpY2tNYW55OiB0cnVlIH0gPyBUW10gOiBUKSB8IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Uj4oKGRvUmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgcmVzb2x2ZSA9IChyZXN1bHQ6IFIpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSA9IGRvUmVzb2x2ZTtcblx0XHRcdFx0b3B0aW9ucy5vbktleU1vZHM/LihpbnB1dC5rZXlNb2RzKTtcblx0XHRcdFx0ZG9SZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9O1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmNyZWF0ZVF1aWNrUGljazxUPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0XHRsZXQgYWN0aXZlSXRlbTogVCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gW1xuXHRcdFx0XHRpbnB1dCxcblx0XHRcdFx0aW5wdXQub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChpbnB1dC5jYW5TZWxlY3RNYW55KSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKDxSPmlucHV0LnNlbGVjdGVkSXRlbXMuc2xpY2UoKSk7XG5cdFx0XHRcdFx0XHRpbnB1dC5oaWRlKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGlucHV0LmFjdGl2ZUl0ZW1zWzBdO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKDxSPnJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRpbnB1dC5vbkRpZENoYW5nZUFjdGl2ZShpdGVtcyA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZm9jdXNlZCA9IGl0ZW1zWzBdO1xuXHRcdFx0XHRcdGlmIChmb2N1c2VkICYmIG9wdGlvbnMub25EaWRGb2N1cykge1xuXHRcdFx0XHRcdFx0b3B0aW9ucy5vbkRpZEZvY3VzKGZvY3VzZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHRcdGlucHV0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGl0ZW1zID0+IHtcblx0XHRcdFx0XHRpZiAoIWlucHV0LmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGl0ZW1zWzBdO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKDxSPnJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRpbnB1dC5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGV2ZW50ID0+IG9wdGlvbnMub25EaWRUcmlnZ2VySXRlbUJ1dHRvbiAmJiBvcHRpb25zLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oe1xuXHRcdFx0XHRcdC4uLmV2ZW50LFxuXHRcdFx0XHRcdHJlbW92ZUl0ZW06ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gaW5wdXQuaXRlbXMuaW5kZXhPZihldmVudC5pdGVtKTtcblx0XHRcdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaXRlbXMgPSBpbnB1dC5pdGVtcy5zbGljZSgpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZW1vdmVkID0gaXRlbXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlSXRlbXMgPSBpbnB1dC5hY3RpdmVJdGVtcy5maWx0ZXIoYWN0aXZlSXRlbSA9PiBhY3RpdmVJdGVtICE9PSByZW1vdmVkWzBdKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qga2VlcFNjcm9sbFBvc2l0aW9uQmVmb3JlID0gaW5wdXQua2VlcFNjcm9sbFBvc2l0aW9uO1xuXHRcdFx0XHRcdFx0XHRpbnB1dC5rZWVwU2Nyb2xsUG9zaXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRpbnB1dC5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHRcdFx0XHRpZiAoYWN0aXZlSXRlbXMpIHtcblx0XHRcdFx0XHRcdFx0XHRpbnB1dC5hY3RpdmVJdGVtcyA9IGFjdGl2ZUl0ZW1zO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlucHV0LmtlZXBTY3JvbGxQb3NpdGlvbiA9IGtlZXBTY3JvbGxQb3NpdGlvbkJlZm9yZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0aW5wdXQub25EaWRUcmlnZ2VyU2VwYXJhdG9yQnV0dG9uKGV2ZW50ID0+IG9wdGlvbnMub25EaWRUcmlnZ2VyU2VwYXJhdG9yQnV0dG9uPy4oZXZlbnQpKSxcblx0XHRcdFx0aW5wdXQub25EaWRDaGFuZ2VWYWx1ZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZUl0ZW0gJiYgIXZhbHVlICYmIChpbnB1dC5hY3RpdmVJdGVtcy5sZW5ndGggIT09IDEgfHwgaW5wdXQuYWN0aXZlSXRlbXNbMF0gIT09IGFjdGl2ZUl0ZW0pKSB7XG5cdFx0XHRcdFx0XHRpbnB1dC5hY3RpdmVJdGVtcyA9IFthY3RpdmVJdGVtXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0aW5wdXQub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NlKGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XTtcblx0XHRcdGlucHV0LnRpdGxlID0gb3B0aW9ucy50aXRsZTtcblx0XHRcdGlmIChvcHRpb25zLnZhbHVlKSB7XG5cdFx0XHRcdGlucHV0LnZhbHVlID0gb3B0aW9ucy52YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlucHV0LmNhblNlbGVjdE1hbnkgPSAhIW9wdGlvbnMuY2FuUGlja01hbnk7XG5cdFx0XHRpbnB1dC5wbGFjZWhvbGRlciA9IG9wdGlvbnMucGxhY2VIb2xkZXI7XG5cdFx0XHRpbnB1dC5wcm9tcHQgPSBvcHRpb25zLnByb21wdDtcblx0XHRcdGlucHV0Lmlnbm9yZUZvY3VzT3V0ID0gISFvcHRpb25zLmlnbm9yZUZvY3VzTG9zdDtcblx0XHRcdGlucHV0Lm1hdGNoT25EZXNjcmlwdGlvbiA9ICEhb3B0aW9ucy5tYXRjaE9uRGVzY3JpcHRpb247XG5cdFx0XHRpbnB1dC5tYXRjaE9uRGV0YWlsID0gISFvcHRpb25zLm1hdGNoT25EZXRhaWw7XG5cdFx0XHRpZiAob3B0aW9ucy5zb3J0QnlMYWJlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlucHV0LnNvcnRCeUxhYmVsID0gb3B0aW9ucy5zb3J0QnlMYWJlbDtcblx0XHRcdH1cblx0XHRcdGlucHV0Lm1hdGNoT25MYWJlbCA9IChvcHRpb25zLm1hdGNoT25MYWJlbCA9PT0gdW5kZWZpbmVkKSB8fCBvcHRpb25zLm1hdGNoT25MYWJlbDsgLy8gZGVmYXVsdCB0byB0cnVlXG5cdFx0XHRpbnB1dC5xdWlja05hdmlnYXRlID0gb3B0aW9ucy5xdWlja05hdmlnYXRlO1xuXHRcdFx0aW5wdXQuaGlkZUlucHV0ID0gISFvcHRpb25zLmhpZGVJbnB1dDtcblx0XHRcdGlucHV0LmNvbnRleHRLZXkgPSBvcHRpb25zLmNvbnRleHRLZXk7XG5cdFx0XHRpbnB1dC5hbmNob3IgPSBvcHRpb25zLmFuY2hvcjtcblx0XHRcdGlucHV0LmFuY2hvclBvc2l0aW9uID0gb3B0aW9ucy5hbmNob3JQb3NpdGlvbjtcblx0XHRcdGlucHV0LmJ1c3kgPSB0cnVlO1xuXHRcdFx0UHJvbWlzZS5hbGwoW3BpY2tzLCBvcHRpb25zLmFjdGl2ZUl0ZW1dKVxuXHRcdFx0XHQudGhlbigoW2l0ZW1zLCBfYWN0aXZlSXRlbV0pID0+IHtcblx0XHRcdFx0XHRhY3RpdmVJdGVtID0gX2FjdGl2ZUl0ZW07XG5cdFx0XHRcdFx0aW5wdXQuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHRcdGlucHV0Lml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdFx0aWYgKGlucHV0LmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0XHRcdGlucHV0LnNlbGVjdGVkSXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgIT09ICdzZXBhcmF0b3InICYmIGl0ZW0ucGlja2VkKSBhcyBUW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChhY3RpdmVJdGVtKSB7XG5cdFx0XHRcdFx0XHRpbnB1dC5hY3RpdmVJdGVtcyA9IFthY3RpdmVJdGVtXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0aW5wdXQuc2hvdygpO1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKHBpY2tzKS50aGVuKHVuZGVmaW5lZCwgZXJyID0+IHtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRWYWxpZGF0aW9uT25JbnB1dChpbnB1dDogSUlucHV0Qm94LCB2YWxpZGF0aW9uUmVzdWx0OiBzdHJpbmcgfCB7XG5cdFx0Y29udGVudDogc3RyaW5nO1xuXHRcdHNldmVyaXR5OiBTZXZlcml0eTtcblx0fSB8IG51bGwgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmFsaWRhdGlvblJlc3VsdCAmJiBpc1N0cmluZyh2YWxpZGF0aW9uUmVzdWx0KSkge1xuXHRcdFx0aW5wdXQuc2V2ZXJpdHkgPSBTZXZlcml0eS5FcnJvcjtcblx0XHRcdGlucHV0LnZhbGlkYXRpb25NZXNzYWdlID0gdmFsaWRhdGlvblJlc3VsdDtcblx0XHR9IGVsc2UgaWYgKHZhbGlkYXRpb25SZXN1bHQgJiYgIWlzU3RyaW5nKHZhbGlkYXRpb25SZXN1bHQpKSB7XG5cdFx0XHRpbnB1dC5zZXZlcml0eSA9IHZhbGlkYXRpb25SZXN1bHQuc2V2ZXJpdHk7XG5cdFx0XHRpbnB1dC52YWxpZGF0aW9uTWVzc2FnZSA9IHZhbGlkYXRpb25SZXN1bHQuY29udGVudDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5wdXQuc2V2ZXJpdHkgPSBTZXZlcml0eS5JZ25vcmU7XG5cdFx0XHRpbnB1dC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRpbnB1dChvcHRpb25zOiBJSW5wdXRPcHRpb25zID0ge30sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuY3JlYXRlSW5wdXRCb3goKTtcblx0XHRcdGNvbnN0IHZhbGlkYXRlSW5wdXQgPSBvcHRpb25zLnZhbGlkYXRlSW5wdXQgfHwgKCgpID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IG9uRGlkVmFsdWVDaGFuZ2UgPSBFdmVudC5kZWJvdW5jZShpbnB1dC5vbkRpZENoYW5nZVZhbHVlLCAobGFzdCwgY3VyKSA9PiBjdXIsIDEwMCk7XG5cdFx0XHRsZXQgdmFsaWRhdGlvblZhbHVlID0gb3B0aW9ucy52YWx1ZSB8fCAnJztcblx0XHRcdGxldCB2YWxpZGF0aW9uID0gUHJvbWlzZS5yZXNvbHZlKHZhbGlkYXRlSW5wdXQodmFsaWRhdGlvblZhbHVlKSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IFtcblx0XHRcdFx0aW5wdXQsXG5cdFx0XHRcdG9uRGlkVmFsdWVDaGFuZ2UodmFsdWUgPT4ge1xuXHRcdFx0XHRcdGlmICh2YWx1ZSAhPT0gdmFsaWRhdGlvblZhbHVlKSB7XG5cdFx0XHRcdFx0XHR2YWxpZGF0aW9uID0gUHJvbWlzZS5yZXNvbHZlKHZhbGlkYXRlSW5wdXQodmFsdWUpKTtcblx0XHRcdFx0XHRcdHZhbGlkYXRpb25WYWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR2YWxpZGF0aW9uLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gdmFsaWRhdGlvblZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0VmFsaWRhdGlvbk9uSW5wdXQoaW5wdXQsIHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRpbnB1dC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBpbnB1dC52YWx1ZTtcblx0XHRcdFx0XHRpZiAodmFsdWUgIT09IHZhbGlkYXRpb25WYWx1ZSkge1xuXHRcdFx0XHRcdFx0dmFsaWRhdGlvbiA9IFByb21pc2UucmVzb2x2ZSh2YWxpZGF0ZUlucHV0KHZhbHVlKSk7XG5cdFx0XHRcdFx0XHR2YWxpZGF0aW9uVmFsdWUgPSB2YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dmFsaWRhdGlvbi50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3VsdCB8fCAoIWlzU3RyaW5nKHJlc3VsdCkgJiYgcmVzdWx0LnNldmVyaXR5ICE9PSBTZXZlcml0eS5FcnJvcikpIHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IHZhbGlkYXRpb25WYWx1ZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFZhbGlkYXRpb25PbklucHV0KGlucHV0LCByZXN1bHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0dG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdGlucHV0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9KSxcblx0XHRcdF07XG5cblx0XHRcdGlucHV0LnRpdGxlID0gb3B0aW9ucy50aXRsZTtcblx0XHRcdGlucHV0LnZhbHVlID0gb3B0aW9ucy52YWx1ZSB8fCAnJztcblx0XHRcdGlucHV0LnZhbHVlU2VsZWN0aW9uID0gb3B0aW9ucy52YWx1ZVNlbGVjdGlvbjtcblx0XHRcdGlucHV0LnByb21wdCA9IG9wdGlvbnMucHJvbXB0O1xuXHRcdFx0aW5wdXQucGxhY2Vob2xkZXIgPSBvcHRpb25zLnBsYWNlSG9sZGVyO1xuXHRcdFx0aW5wdXQucGFzc3dvcmQgPSAhIW9wdGlvbnMucGFzc3dvcmQ7XG5cdFx0XHRpbnB1dC5pZ25vcmVGb2N1c091dCA9ICEhb3B0aW9ucy5pZ25vcmVGb2N1c0xvc3Q7XG5cdFx0XHRpbnB1dC5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRiYWNrQnV0dG9uID0gYmFja0J1dHRvbjtcblxuXHRjcmVhdGVRdWlja1BpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihvcHRpb25zOiB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk6IElRdWlja1BpY2s8VCwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+O1xuXHRjcmVhdGVRdWlja1BpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihvcHRpb25zPzogeyB1c2VTZXBhcmF0b3JzOiBib29sZWFuIH0pOiBJUXVpY2tQaWNrPFQsIHsgdXNlU2VwYXJhdG9yczogZmFsc2UgfT47XG5cdGNyZWF0ZVF1aWNrUGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KG9wdGlvbnM6IHsgdXNlU2VwYXJhdG9yczogYm9vbGVhbiB9ID0geyB1c2VTZXBhcmF0b3JzOiBmYWxzZSB9KTogSVF1aWNrUGljazxULCB7IHVzZVNlcGFyYXRvcnM6IGJvb2xlYW4gfT4ge1xuXHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSh0cnVlKTtcblx0XHRyZXR1cm4gbmV3IFF1aWNrUGljazxULCB0eXBlb2Ygb3B0aW9ucz4odWkpO1xuXHR9XG5cblx0Y3JlYXRlSW5wdXRCb3goKTogSUlucHV0Qm94IHtcblx0XHRjb25zdCB1aSA9IHRoaXMuZ2V0VUkodHJ1ZSk7XG5cdFx0cmV0dXJuIG5ldyBJbnB1dEJveCh1aSk7XG5cdH1cblxuXHRzZXRBbGlnbm1lbnQoYWxpZ25tZW50OiAndG9wJyB8ICdjZW50ZXInIHwgeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250cm9sbGVyPy5hbmNob3IpIHtcblx0XHRcdHJldHVybjsgLy8gYW5jaG9yZWQgaW5wdXRzIG93biB0aGVpciBvd24gcG9zaXRpb25pbmdcblx0XHR9XG5cdFx0dGhpcy5kbmRDb250cm9sbGVyPy5zZXRBbGlnbm1lbnQoYWxpZ25tZW50KTtcblx0fVxuXG5cdGNyZWF0ZVF1aWNrV2lkZ2V0KCk6IElRdWlja1dpZGdldCB7XG5cdFx0Y29uc3QgdWkgPSB0aGlzLmdldFVJKHRydWUpO1xuXHRcdHJldHVybiBuZXcgUXVpY2tXaWRnZXQodWkpO1xuXHR9XG5cblx0Y3JlYXRlUXVpY2tUcmVlPFQgZXh0ZW5kcyBJUXVpY2tUcmVlSXRlbT4oKTogSVF1aWNrVHJlZTxUPiB7XG5cdFx0Y29uc3QgdWkgPSB0aGlzLmdldFVJKHRydWUpO1xuXHRcdHJldHVybiBuZXcgUXVpY2tUcmVlPFQ+KHVpKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdyhjb250cm9sbGVyOiBJUXVpY2tJbnB1dCkge1xuXHRcdHRoaXMuY29tcGxldGVDbG9zZUFuaW1hdGlvbigpO1xuXHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSh0cnVlKTtcblx0XHRjb25zdCBvbGRDb250cm9sbGVyID0gdGhpcy5jb250cm9sbGVyO1xuXHRcdHRoaXMuY29udHJvbGxlciA9IGNvbnRyb2xsZXI7XG5cdFx0b2xkQ29udHJvbGxlcj8uZGlkSGlkZSgpO1xuXG5cdFx0Ly8gQW5jaG9yZWQgY29udHJvbGxlcnMgYWx3YXlzIHJlbmRlciBpbiB0aGUgd2luZG93IHRoYXQgb3ducyB0aGVpciBhbmNob3IgZWxlbWVudC5cblx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQoY29udHJvbGxlci5hbmNob3IpKSB7XG5cdFx0XHRjb25zdCBhbmNob3JXaW5kb3cgPSBkb20uZ2V0V2luZG93KGNvbnRyb2xsZXIuYW5jaG9yKTtcblx0XHRcdGlmIChkb20uZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lcikgIT09IGFuY2hvcldpbmRvdykge1xuXHRcdFx0XHR0aGlzLnJlcGFyZW50VUkodGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihhbmNob3JXaW5kb3cpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNldEVuYWJsZWQodHJ1ZSk7XG5cdFx0dWkubGVmdEFjdGlvbkJhci5zZXRBY3Rpb25zKFtdKTtcblx0XHR1aS50aXRsZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHVpLmRlc2NyaXB0aW9uMS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHVpLmRlc2NyaXB0aW9uMi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGRvbS5yZXNldCh1aS53aWRnZXQpO1xuXHRcdHVpLnJpZ2h0QWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdHVpLmlubGluZUFjdGlvbkJhci5zZXRBY3Rpb25zKFtdKTtcblx0XHR1aS5jaGVja0FsbC5jaGVja2VkID0gZmFsc2U7XG5cdFx0Ly8gdWkuaW5wdXRCb3gudmFsdWUgPSAnJzsgQXZvaWQgdHJpZ2dlcmluZyBhbiBldmVudC5cblx0XHR1aS5pbnB1dEJveC5wbGFjZWhvbGRlciA9ICcnO1xuXHRcdHVpLmlucHV0Qm94LnBhc3N3b3JkID0gZmFsc2U7XG5cdFx0dWkuaW5wdXRCb3guc2hvd0RlY29yYXRpb24oU2V2ZXJpdHkuSWdub3JlKTtcblx0XHR1aS52aXNpYmxlQ291bnQuc2V0Q291bnQoMCk7XG5cdFx0dWkuY291bnQuc2V0Q291bnQoMCk7XG5cdFx0dWkuY291bnRDb250YWluZXIuc3R5bGUucmlnaHQgPSAnNHB4Jztcblx0XHRkb20ucmVzZXQodWkubWVzc2FnZSk7XG5cdFx0dWkucHJvZ3Jlc3NCYXIuc3RvcCgpO1xuXHRcdHVpLnByb2dyZXNzQmFyLmdldENvbnRhaW5lcigpLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHVpLmxpc3Quc2V0RWxlbWVudHMoW10pO1xuXHRcdHVpLmxpc3QubWF0Y2hPbkRlc2NyaXB0aW9uID0gZmFsc2U7XG5cdFx0dWkubGlzdC5tYXRjaE9uRGV0YWlsID0gZmFsc2U7XG5cdFx0dWkubGlzdC5tYXRjaE9uTGFiZWwgPSB0cnVlO1xuXHRcdHVpLmxpc3Quc29ydEJ5TGFiZWwgPSB0cnVlO1xuXHRcdHVpLnRyZWUudXBkYXRlRmlsdGVyT3B0aW9ucyh7XG5cdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IGZhbHNlLFxuXHRcdFx0bWF0Y2hPbkxhYmVsOiB0cnVlXG5cdFx0fSk7XG5cdFx0dWkudHJlZS5zb3J0QnlMYWJlbCA9IHRydWU7XG5cdFx0dWkuaWdub3JlRm9jdXNPdXQgPSBmYWxzZTtcblx0XHR1aS5pbnB1dEJveC50b2dnbGVzID0gdW5kZWZpbmVkO1xuXHRcdHVpLmlucHV0Qm94LmFjdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0dWkuaW5wdXRCb3guc2V0SGVpZ2h0KHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBiYWNrS2V5YmluZGluZ0xhYmVsID0gdGhpcy5vcHRpb25zLmJhY2tLZXliaW5kaW5nTGFiZWwoKTtcblx0XHRiYWNrQnV0dG9uLnRvb2x0aXAgPSBiYWNrS2V5YmluZGluZ0xhYmVsID8gbG9jYWxpemUoJ3F1aWNrSW5wdXQuYmFja1dpdGhLZXliaW5kaW5nJywgXCJCYWNrICh7MH0pXCIsIGJhY2tLZXliaW5kaW5nTGFiZWwpIDogbG9jYWxpemUoJ3F1aWNrSW5wdXQuYmFjaycsIFwiQmFja1wiKTtcblxuXHRcdHRoaXMub3ZlcmxheUxheW91dENvcnJlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dWkuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoUVVJQ0tfSU5QVVRfT1ZFUkxBWV9DTEFTUywgY29udHJvbGxlci5hbmNob3JQb3NpdGlvbiA9PT0gJ292ZXJsYXknKTtcblx0XHR1aS5jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMudXBkYXRlTGF5b3V0KCk7XG5cdFx0dGhpcy5kbmRDb250cm9sbGVyPy5zZXRFbmFibGVkKCFjb250cm9sbGVyLmFuY2hvcik7XG5cdFx0dGhpcy5kbmRDb250cm9sbGVyPy5sYXlvdXRDb250YWluZXIoKTtcblx0XHRpZiAoY29udHJvbGxlci5hbmNob3IpIHtcblx0XHRcdC8vIEFuY2hvcmVkIHF1aWNrIGlucHV0cyBhcmUgcG9zaXRpb25lZCBuZWFyIGEgc3BlY2lmaWMgZWxlbWVudCwgbm90XG5cdFx0XHQvLyBhdCB0aGUgZGVmYXVsdCB0b3AgbG9jYXRpb24sIHNvIHJlcG9ydCB0aGVtIGFzIGN1c3RvbS1wb3NpdGlvbmVkLlxuXHRcdFx0dGhpcy5fYWxpZ25tZW50LnNldCgnY3VzdG9tJywgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmUtc3luYyBmcm9tIERuRCBpbiBjYXNlIGEgcHJldmlvdXMgYW5jaG9yZWQgaW5wdXQgbGVmdCB1cyBzdGFsZS5cblx0XHRcdHRoaXMuX2FsaWdubWVudC5zZXQodGhpcy5kbmRDb250cm9sbGVyPy5hbGlnbm1lbnQuZ2V0KCkgPz8gJ3RvcCcsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMub25TaG93RW1pdHRlci5maXJlKCk7XG5cdFx0dWkuaW5wdXRCb3guc2V0Rm9jdXMoKTtcblx0XHR0aGlzLnF1aWNrSW5wdXRUeXBlQ29udGV4dC5zZXQoY29udHJvbGxlci50eXBlKTtcblx0fVxuXG5cdGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmNvbnRyb2xsZXI7XG5cdH1cblxuXHRwcml2YXRlIHNldFZpc2liaWxpdGllcyh2aXNpYmlsaXRpZXM6IFZpc2liaWxpdGllcykge1xuXHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSgpO1xuXHRcdHVpLnRpdGxlLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMudGl0bGUgPyAnJyA6ICdub25lJztcblx0XHR1aS5kZXNjcmlwdGlvbjEuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5kZXNjcmlwdGlvbiAmJiAodmlzaWJpbGl0aWVzLmlucHV0Qm94IHx8IHZpc2liaWxpdGllcy5jaGVja0FsbCkgPyAnJyA6ICdub25lJztcblx0XHR1aS5kZXNjcmlwdGlvbjIuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5kZXNjcmlwdGlvbiAmJiAhKHZpc2liaWxpdGllcy5pbnB1dEJveCB8fCB2aXNpYmlsaXRpZXMuY2hlY2tBbGwpID8gJycgOiAnbm9uZSc7XG5cdFx0dWkuY2hlY2tBbGwuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmNoZWNrQWxsID8gJycgOiAnbm9uZSc7XG5cdFx0dWkuaW5wdXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5pbnB1dEJveCA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLmZpbHRlckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmlucHV0Qm94ID8gJycgOiAnbm9uZSc7XG5cdFx0dWkudmlzaWJsZUNvdW50Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMudmlzaWJsZUNvdW50ID8gJycgOiAnbm9uZSc7XG5cdFx0dWkuY291bnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5jb3VudCA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLm9rQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMub2sgPyAnJyA6ICdub25lJztcblx0XHR1aS5jdXN0b21CdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5jdXN0b21CdXR0b24gPyAnJyA6ICdub25lJztcblx0XHR1aS5tZXNzYWdlLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMubWVzc2FnZSA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLnByb2dyZXNzQmFyLmdldENvbnRhaW5lcigpLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMucHJvZ3Jlc3NCYXIgPyAnJyA6ICdub25lJztcblx0XHR1aS5saXN0LmRpc3BsYXllZCA9ICEhdmlzaWJpbGl0aWVzLmxpc3Q7XG5cdFx0dWkudHJlZS5kaXNwbGF5ZWQgPSAhIXZpc2liaWxpdGllcy50cmVlO1xuXHRcdHVpLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWNoZWNrYm94ZXMnLCAhIXZpc2liaWxpdGllcy5jaGVja0JveCk7XG5cdFx0dWkuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbi1pbnB1dCcsICF2aXNpYmlsaXRpZXMuaW5wdXRCb3ggJiYgIXZpc2liaWxpdGllcy5kZXNjcmlwdGlvbik7XG5cdFx0dGhpcy5vdmVybGF5TGF5b3V0Q29ycmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnVwZGF0ZUxheW91dCgpOyAvLyBUT0RPXG5cdH1cblxuXHRwcml2YXRlIHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdGlmIChlbmFibGVkICE9PSB0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHRjb25zdCB1aSA9IHRoaXMuZ2V0VUkoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdWkubGVmdEFjdGlvbkJhci5nZXRJdGVtc0xlbmd0aCgpOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gdWkubGVmdEFjdGlvbkJhci5nZXRJdGVtQWN0aW9uKGkpO1xuXHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0YWN0aW9uLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHVpLnJpZ2h0QWN0aW9uQmFyLmdldEl0ZW1zTGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB1aS5yaWdodEFjdGlvbkJhci5nZXRJdGVtQWN0aW9uKGkpO1xuXHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0YWN0aW9uLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHR1aS5jaGVja0FsbC5lbmFibGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVpLmNoZWNrQWxsLmRpc2FibGUoKTtcblx0XHRcdH1cblx0XHRcdHVpLmlucHV0Qm94LmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0dWkub2suZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHR1aS5saXN0LmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdH1cblx0fVxuXG5cdGhpZGUocmVhc29uPzogUXVpY2tJbnB1dEhpZGVSZWFzb24pIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jb250cm9sbGVyO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLndpbGxIaWRlKHJlYXNvbik7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLnVpPy5jb250YWluZXI7XG5cdFx0Y29uc3QgZm9jdXNDaGFuZ2VkID0gY29udGFpbmVyICYmICFkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChjb250YWluZXIpO1xuXHRcdHRoaXMuY29udHJvbGxlciA9IG51bGw7XG5cdFx0dGhpcy5vbkhpZGVFbWl0dGVyLmZpcmUoKTtcblx0XHRpZiAoY29udGFpbmVyKSB7XG5cdFx0XHRpZiAoIWNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoUVVJQ0tfSU5QVVRfT1ZFUkxBWV9DTEFTUykgJiYgZG9tLmhhc1BhcmVudFdpdGhDbGFzcyhjb250YWluZXIsIFFVSUNLX0lOUFVUX01PVElPTl9BTkNFU1RPUl9DTEFTU0VTKSkge1xuXHRcdFx0XHRjb250YWluZXIuaW5lcnQgPSB0cnVlO1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChRVUlDS19JTlBVVF9NT1RJT05fQ0xPU0lOR19DTEFTUyk7XG5cdFx0XHRcdHRoaXMuY2xvc2VBbmltYXRpb24udmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB0aGlzLmNvbXBsZXRlQ2xvc2VBbmltYXRpb24oKSwgUVVJQ0tfSU5QVVRfQ0xPU0VfQU5JTUFUSU9OX0RVUkFUSU9OKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWZvY3VzQ2hhbmdlZCkge1xuXHRcdFx0bGV0IGN1cnJlbnRFbGVtZW50ID0gdGhpcy5wcmV2aW91c0ZvY3VzRWxlbWVudDtcblx0XHRcdHdoaWxlIChjdXJyZW50RWxlbWVudCAmJiAhY3VycmVudEVsZW1lbnQub2Zmc2V0UGFyZW50KSB7XG5cdFx0XHRcdGN1cnJlbnRFbGVtZW50ID0gY3VycmVudEVsZW1lbnQucGFyZW50RWxlbWVudCA/PyB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudEVsZW1lbnQ/Lm9mZnNldFBhcmVudCkge1xuXHRcdFx0XHRjdXJyZW50RWxlbWVudC5mb2N1cygpO1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzRm9jdXNFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vcHRpb25zLnJldHVybkZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuZGlkSGlkZShyZWFzb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wbGV0ZUNsb3NlQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jbG9zZUFuaW1hdGlvbi52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2xvc2VBbmltYXRpb24uY2xlYXIoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLnVpPy5jb250YWluZXI7XG5cdFx0aWYgKGNvbnRhaW5lcikge1xuXHRcdFx0Y29udGFpbmVyLmluZXJ0ID0gZmFsc2U7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShRVUlDS19JTlBVVF9NT1RJT05fQ0xPU0lOR19DTEFTUyk7XG5cdFx0XHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY29tcGxldGVDbG9zZUFuaW1hdGlvbigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRjb25zdCB1aSA9IHRoaXMuZ2V0VUkoKTtcblx0XHRcdGlmICh1aS5pbnB1dEJveC5lbmFibGVkKSB7XG5cdFx0XHRcdHVpLmlucHV0Qm94LnNldEZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1aS5saXN0LmRvbUZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlKCkge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jb250cm9sbGVyIGluc3RhbmNlb2YgUXVpY2tQaWNrICYmIHRoaXMuY29udHJvbGxlci5jYW5TZWxlY3RNYW55KSB7XG5cdFx0XHR0aGlzLmdldFVJKCkubGlzdC50b2dnbGVDaGVja2JveCgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jb250cm9sbGVyIGluc3RhbmNlb2YgUXVpY2tUcmVlKSB7XG5cdFx0XHR0aGlzLmdldFVJKCkudHJlZS50b2dnbGVDaGVja2JveCgpO1xuXHRcdH1cblx0fVxuXG5cdHRvZ2dsZUhvdmVyKCkge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpICYmIHRoaXMuY29udHJvbGxlciBpbnN0YW5jZW9mIFF1aWNrUGljaykge1xuXHRcdFx0dGhpcy5nZXRVSSgpLmxpc3QudG9nZ2xlSG92ZXIoKTtcblx0XHR9XG5cdH1cblxuXHRuYXZpZ2F0ZShuZXh0OiBib29sZWFuLCBxdWlja05hdmlnYXRlPzogSVF1aWNrTmF2aWdhdGVDb25maWd1cmF0aW9uKSB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkgJiYgdGhpcy5nZXRVSSgpLmxpc3QuZGlzcGxheWVkKSB7XG5cdFx0XHR0aGlzLmdldFVJKCkubGlzdC5mb2N1cyhuZXh0ID8gUXVpY2tQaWNrRm9jdXMuTmV4dCA6IFF1aWNrUGlja0ZvY3VzLlByZXZpb3VzKTtcblx0XHRcdGlmIChxdWlja05hdmlnYXRlICYmIHRoaXMuY29udHJvbGxlciBpbnN0YW5jZW9mIFF1aWNrUGljaykge1xuXHRcdFx0XHR0aGlzLmNvbnRyb2xsZXIucXVpY2tOYXZpZ2F0ZSA9IHF1aWNrTmF2aWdhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYWNjZXB0KGtleU1vZHM6IElLZXlNb2RzID0geyBhbHQ6IGZhbHNlLCBjdHJsQ21kOiBmYWxzZSwgc2hpZnQ6IGZhbHNlIH0pIHtcblx0XHQvLyBXaGVuIGFjY2VwdGluZyB0aGUgaXRlbSBwcm9ncmFtbWF0aWNhbGx5LCBpdCBpcyBpbXBvcnRhbnQgdGhhdFxuXHRcdC8vIHdlIHVwZGF0ZSBga2V5TW9kc2AgZWl0aGVyIGZyb20gdGhlIHByb3ZpZGVkIHNldCBvciB1bnNldCBpdFxuXHRcdC8vIGJlY2F1c2UgdGhlIGFjY2VwdCBkaWQgbm90IGhhcHBlbiBmcm9tIG1vdXNlIG9yIGtleWJvYXJkXG5cdFx0Ly8gaW50ZXJhY3Rpb24gb24gdGhlIGxpc3QgaXRzZWxmXG5cdFx0dGhpcy5rZXlNb2RzLmFsdCA9IGtleU1vZHMuYWx0O1xuXHRcdHRoaXMua2V5TW9kcy5jdHJsQ21kID0ga2V5TW9kcy5jdHJsQ21kO1xuXHRcdHRoaXMua2V5TW9kcy5zaGlmdCA9IGtleU1vZHMuc2hpZnQ7XG5cblx0XHR0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHRhc3luYyBiYWNrKCkge1xuXHRcdHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5maXJlKHRoaXMuYmFja0J1dHRvbik7XG5cdH1cblxuXHRhc3luYyBjYW5jZWwocmVhc29uPzogUXVpY2tJbnB1dEhpZGVSZWFzb24pIHtcblx0XHR0aGlzLmhpZGUocmVhc29uKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IGRvbS5JRGltZW5zaW9uLCB0aXRsZUJhck9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy50aXRsZUJhck9mZnNldCA9IHRpdGxlQmFyT2Zmc2V0O1xuXHRcdHRoaXMub3ZlcmxheUxheW91dENvcnJlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy51cGRhdGVMYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGF5b3V0KCkge1xuXHRcdGlmICh0aGlzLnVpICYmIHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdGNvbnN0IHN0eWxlID0gdGhpcy51aS5jb250YWluZXIuc3R5bGU7XG5cdFx0XHRsZXQgd2lkdGggPSBnZXRRdWlja0lucHV0V2lkdGgodGhpcy5kaW1lbnNpb24hLndpZHRoKTtcblx0XHRcdHN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xuXG5cdFx0XHRsZXQgbGlzdEhlaWdodCA9IHRoaXMuZGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uLmhlaWdodCAqIDAuNDtcblx0XHRcdGxldCBvdmVybGF5QW5jaG9yOiBJUmVjdCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gUG9zaXRpb25cblx0XHRcdGlmICh0aGlzLmNvbnRyb2xsZXI/LmFuY2hvcikge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmNvbnRyb2xsZXIuYW5jaG9yIGFzIEhUTUxFbGVtZW50IHwgSUFuY2hvcjtcblx0XHRcdFx0Y29uc3QgaXNFbGVtZW50ID0gZG9tLmlzSFRNTEVsZW1lbnQodGFyZ2V0KTtcblx0XHRcdFx0Y29uc3QgYW5jaG9yV2luZG93ID0gaXNFbGVtZW50ID8gZG9tLmdldFdpbmRvdyh0YXJnZXQpIDogZG9tLmdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGFuY2hvcldpbmRvdykuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdGNvbnN0IHZlcnRpY2FsUGFkZGluZyA9IDYgKyAyNiArIDE2OyAvLyBBY2NvdW50cyBmb3IgaW5wdXQgYm94IGFuZCBwYWRkaW5nXG5cblx0XHRcdFx0bGV0IGFuY2hvciA9IGdldEFuY2hvclJlY3QodGFyZ2V0KTtcblx0XHRcdFx0bGV0IHByZWZlcnJlZEFuY2hvclBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQUJPVkU7XG5cdFx0XHRcdGxldCBsaXN0SGVpZ2h0UmF0aW8gPSAwLjI7XG5cdFx0XHRcdGxldCBtYXhMaXN0SGVpZ2h0ID0gMjAwO1xuXG5cdFx0XHRcdGlmICh0aGlzLmNvbnRyb2xsZXIuYW5jaG9yUG9zaXRpb24gPT09ICdvdmVybGF5Jykge1xuXHRcdFx0XHRcdG92ZXJsYXlBbmNob3IgPSBhbmNob3I7XG5cdFx0XHRcdFx0dGhpcy51aS5pbnB1dEJveC5zZXRIZWlnaHQoYW5jaG9yLmhlaWdodCk7XG5cdFx0XHRcdFx0d2lkdGggPSBhbmNob3Iud2lkdGg7XG5cdFx0XHRcdFx0bGlzdEhlaWdodFJhdGlvID0gMC40O1xuXHRcdFx0XHRcdGFuY2hvciA9IHsgLi4uYW5jaG9yLCBoZWlnaHQ6IDAgfTtcblx0XHRcdFx0XHRtYXhMaXN0SGVpZ2h0ID0gTWF0aC5taW4oNDAwLCBjb250YWluZXIuYm90dG9tIC0gYW5jaG9yLnRvcCAtIHZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRcdFx0cHJlZmVycmVkQW5jaG9yUG9zaXRpb24gPSBBbmNob3JQb3NpdGlvbi5CRUxPVztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3aWR0aCA9IDM4MDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxpc3RIZWlnaHQgPSB0aGlzLmRpbWVuc2lvbiA/IE1hdGgubWluKHRoaXMuZGltZW5zaW9uLmhlaWdodCAqIGxpc3RIZWlnaHRSYXRpbywgbWF4TGlzdEhlaWdodCkgOiBtYXhMaXN0SGVpZ2h0O1xuXG5cdFx0XHRcdC8vIEJld2FyZTpcblx0XHRcdFx0Ly8gV2UgbmVlZCB0byBhZGQgc29tZSBleHRyYSBwaXhlbHMgdG8gdGhlIGhlaWdodCB0byBhY2NvdW50IGZvciB0aGUgaW5wdXQgYW5kIHBhZGRpbmcuXG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lckhlaWdodCA9IE1hdGguZmxvb3IobGlzdEhlaWdodCkgKyB2ZXJ0aWNhbFBhZGRpbmc7XG5cdFx0XHRcdGNvbnN0IHsgdG9wLCBsZWZ0LCByaWdodCwgYm90dG9tLCBhbmNob3JBbGlnbm1lbnQsIGFuY2hvclBvc2l0aW9uIH0gPSBsYXlvdXQyZChjb250YWluZXIsIHsgd2lkdGgsIGhlaWdodDogY29udGFpbmVySGVpZ2h0IH0sIGFuY2hvciwgeyBhbmNob3JQb3NpdGlvbjogcHJlZmVycmVkQW5jaG9yUG9zaXRpb24gfSk7XG5cblx0XHRcdFx0aWYgKGFuY2hvckFsaWdubWVudCA9PT0gQW5jaG9yQWxpZ25tZW50LlJJR0hUKSB7XG5cdFx0XHRcdFx0c3R5bGUucmlnaHQgPSBgJHtyaWdodH1weGA7XG5cdFx0XHRcdFx0c3R5bGUubGVmdCA9ICdpbml0aWFsJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0XHRcdFx0c3R5bGUucmlnaHQgPSAnaW5pdGlhbCc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYW5jaG9yUG9zaXRpb24gPT09IEFuY2hvclBvc2l0aW9uLkFCT1ZFKSB7XG5cdFx0XHRcdFx0c3R5bGUuYm90dG9tID0gYCR7Ym90dG9tfXB4YDtcblx0XHRcdFx0XHRzdHlsZS50b3AgPSAnaW5pdGlhbCc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdFx0XHRzdHlsZS5ib3R0b20gPSAnaW5pdGlhbCc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0c3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdHlsZS50b3AgPSBgJHt0aGlzLnZpZXdTdGF0ZT8udG9wICE9PSB1bmRlZmluZWQgPyBNYXRoLnJvdW5kKHRoaXMuZGltZW5zaW9uIS5oZWlnaHQgKiB0aGlzLnZpZXdTdGF0ZS50b3ApIDogdGhpcy50aXRsZUJhck9mZnNldH1weGA7XG5cdFx0XHRcdHN0eWxlLmxlZnQgPSBgJHtNYXRoLnJvdW5kKCh0aGlzLmRpbWVuc2lvbiEud2lkdGggKiAodGhpcy52aWV3U3RhdGU/LmxlZnQgPz8gMC41IC8qIGNlbnRlciAqLykpIC0gKHdpZHRoIC8gMikpfXB4YDtcblx0XHRcdFx0c3R5bGUucmlnaHQgPSAnJztcblx0XHRcdFx0c3R5bGUuYm90dG9tID0gJyc7XG5cdFx0XHRcdHN0eWxlLmhlaWdodCA9ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3ZlcmxheUFuY2hvcikge1xuXHRcdFx0XHR0aGlzLmFsaWduT3ZlcmxheUlucHV0KG92ZXJsYXlBbmNob3IpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHRcdHRoaXMudWkubGlzdC5sYXlvdXQobGlzdEhlaWdodCk7XG5cdFx0XHR0aGlzLnVpLnRyZWUubGF5b3V0KGxpc3RIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWxpZ25PdmVybGF5SW5wdXQoYW5jaG9yOiBJUmVjdCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0eWxlID0gdGhpcy51aSEuY29udGFpbmVyLnN0eWxlO1xuXHRcdGxldCBjb3JyZWN0aW9uID0gdGhpcy5vdmVybGF5TGF5b3V0Q29ycmVjdGlvbjtcblx0XHRpZiAoIWNvcnJlY3Rpb24gfHwgY29ycmVjdGlvbi5hbmNob3IubGVmdCAhPT0gYW5jaG9yLmxlZnQgfHwgY29ycmVjdGlvbi5hbmNob3IudG9wICE9PSBhbmNob3IudG9wIHx8IGNvcnJlY3Rpb24uYW5jaG9yLndpZHRoICE9PSBhbmNob3Iud2lkdGggfHwgY29ycmVjdGlvbi5hbmNob3IuaGVpZ2h0ICE9PSBhbmNob3IuaGVpZ2h0KSB7XG5cdFx0XHR0aGlzLnVpIS5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy51aSEuZmlsdGVyQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29ycmVjdGlvbiA9IHRoaXMub3ZlcmxheUxheW91dENvcnJlY3Rpb24gPSB7XG5cdFx0XHRcdGFuY2hvcixcblx0XHRcdFx0bGVmdDogYW5jaG9yLmxlZnQgLSBpbnB1dC5sZWZ0LFxuXHRcdFx0XHRyaWdodDogaW5wdXQucmlnaHQgLSAoYW5jaG9yLmxlZnQgKyBhbmNob3Iud2lkdGgpLFxuXHRcdFx0XHR0b3A6IGFuY2hvci50b3AgLSBpbnB1dC50b3AsXG5cdFx0XHRcdGJvdHRvbTogaW5wdXQuYm90dG9tIC0gKGFuY2hvci50b3AgKyBhbmNob3IuaGVpZ2h0KSxcblx0XHRcdFx0d2lkdGg6IGFuY2hvci53aWR0aCAtIGlucHV0LndpZHRoLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRzdHlsZS53aWR0aCA9IGAke3BhcnNlRmxvYXQoc3R5bGUud2lkdGgpICsgY29ycmVjdGlvbi53aWR0aH1weGA7XG5cdFx0aWYgKHN0eWxlLmxlZnQgIT09ICdpbml0aWFsJykge1xuXHRcdFx0c3R5bGUubGVmdCA9IGAke3BhcnNlRmxvYXQoc3R5bGUubGVmdCkgKyBjb3JyZWN0aW9uLmxlZnR9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHlsZS5yaWdodCA9IGAke3BhcnNlRmxvYXQoc3R5bGUucmlnaHQpICsgY29ycmVjdGlvbi5yaWdodH1weGA7XG5cdFx0fVxuXHRcdGlmIChzdHlsZS50b3AgIT09ICdpbml0aWFsJykge1xuXHRcdFx0c3R5bGUudG9wID0gYCR7cGFyc2VGbG9hdChzdHlsZS50b3ApICsgY29ycmVjdGlvbi50b3B9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHlsZS5ib3R0b20gPSBgJHtwYXJzZUZsb2F0KHN0eWxlLmJvdHRvbSkgKyBjb3JyZWN0aW9uLmJvdHRvbX1weGA7XG5cdFx0fVxuXHR9XG5cblx0YXBwbHlTdHlsZXMoc3R5bGVzOiBJUXVpY2tJbnB1dFN0eWxlcykge1xuXHRcdHRoaXMuc3R5bGVzID0gc3R5bGVzO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0eWxlcygpIHtcblx0XHRpZiAodGhpcy51aSkge1xuXHRcdFx0Y29uc3Qge1xuXHRcdFx0XHRxdWlja0lucHV0VGl0bGVCYWNrZ3JvdW5kLCBxdWlja0lucHV0QmFja2dyb3VuZCwgcXVpY2tJbnB1dEZvcmVncm91bmQsIHdpZGdldEJvcmRlcixcblx0XHRcdH0gPSB0aGlzLnN0eWxlcy53aWRnZXQ7XG5cdFx0XHR0aGlzLnVpLnRpdGxlQmFyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHF1aWNrSW5wdXRUaXRsZUJhY2tncm91bmQgPz8gJyc7XG5cdFx0XHR0aGlzLnVpLmNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBxdWlja0lucHV0QmFja2dyb3VuZCA/PyAnJztcblx0XHRcdHRoaXMudWkuY29udGFpbmVyLnN0eWxlLmNvbG9yID0gcXVpY2tJbnB1dEZvcmVncm91bmQgPz8gJyc7XG5cdFx0XHR0aGlzLnVpLmNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSB3aWRnZXRCb3JkZXIgPyBgMXB4IHNvbGlkICR7d2lkZ2V0Qm9yZGVyfWAgOiAnJztcblx0XHRcdHRoaXMudWkubGlzdC5zdHlsZSh0aGlzLnN0eWxlcy5saXN0KTtcblx0XHRcdHRoaXMudWkudHJlZS50cmVlLnN0eWxlKHRoaXMuc3R5bGVzLmxpc3QpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKHRoaXMuc3R5bGVzLnBpY2tlckdyb3VwLnBpY2tlckdyb3VwQm9yZGVyKSB7XG5cdFx0XHRcdGNvbnRlbnQucHVzaChgLnF1aWNrLWlucHV0LWxpc3QgLnF1aWNrLWlucHV0LWxpc3QtZW50cnkgeyBib3JkZXItdG9wLWNvbG9yOiAgJHt0aGlzLnN0eWxlcy5waWNrZXJHcm91cC5waWNrZXJHcm91cEJvcmRlcn07IH1gKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnN0eWxlcy5waWNrZXJHcm91cC5waWNrZXJHcm91cEZvcmVncm91bmQpIHtcblx0XHRcdFx0Y29udGVudC5wdXNoKGAucXVpY2staW5wdXQtbGlzdCAucXVpY2staW5wdXQtbGlzdC1zZXBhcmF0b3IgeyBjb2xvcjogICR7dGhpcy5zdHlsZXMucGlja2VyR3JvdXAucGlja2VyR3JvdXBGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc3R5bGVzLnBpY2tlckdyb3VwLnBpY2tlckdyb3VwRm9yZWdyb3VuZCkge1xuXHRcdFx0XHRjb250ZW50LnB1c2goYC5xdWljay1pbnB1dC1saXN0IC5xdWljay1pbnB1dC1saXN0LXNlcGFyYXRvci1hcy1pdGVtIHsgY29sb3I6IHZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpOyB9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQmFja2dyb3VuZCB8fFxuXHRcdFx0XHR0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm9yZGVyIHx8XG5cdFx0XHRcdHRoaXMuc3R5bGVzLmtleWJpbmRpbmdMYWJlbC5rZXliaW5kaW5nTGFiZWxCb3R0b21Cb3JkZXIgfHxcblx0XHRcdFx0dGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbFNoYWRvdyB8fFxuXHRcdFx0XHR0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsRm9yZWdyb3VuZCkge1xuXHRcdFx0XHRjb250ZW50LnB1c2goJy5xdWljay1pbnB1dC1saXN0IC5tb25hY28ta2V5YmluZGluZyA+IC5tb25hY28ta2V5YmluZGluZy1rZXkgeycpO1xuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEJhY2tncm91bmQpIHtcblx0XHRcdFx0XHRjb250ZW50LnB1c2goYGJhY2tncm91bmQtY29sb3I6ICR7dGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEJhY2tncm91bmR9O2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm9yZGVyKSB7XG5cdFx0XHRcdFx0Ly8gT3JkZXIgbWF0dGVycyBoZXJlLiBgYm9yZGVyLWNvbG9yYCBtdXN0IGNvbWUgYmVmb3JlIGBib3JkZXItYm90dG9tLWNvbG9yYC5cblx0XHRcdFx0XHRjb250ZW50LnB1c2goYGJvcmRlci1jb2xvcjogJHt0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm9yZGVyfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEJvdHRvbUJvcmRlcikge1xuXHRcdFx0XHRcdGNvbnRlbnQucHVzaChgYm9yZGVyLWJvdHRvbS1jb2xvcjogJHt0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm90dG9tQm9yZGVyfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbFNoYWRvdykge1xuXHRcdFx0XHRcdGNvbnRlbnQucHVzaChgYm94LXNoYWRvdzogaW5zZXQgMCAtMXB4IDAgJHt0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsU2hhZG93fTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEZvcmVncm91bmQpIHtcblx0XHRcdFx0XHRjb250ZW50LnB1c2goYGNvbG9yOiAke3RoaXMuc3R5bGVzLmtleWJpbmRpbmdMYWJlbC5rZXliaW5kaW5nTGFiZWxGb3JlZ3JvdW5kfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250ZW50LnB1c2goJ30nKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3U3R5bGVzID0gY29udGVudC5qb2luKCdcXG4nKTtcblx0XHRcdGlmIChuZXdTdHlsZXMgIT09IHRoaXMudWkuc3R5bGVTaGVldC50ZXh0Q29udGVudCkge1xuXHRcdFx0XHR0aGlzLnVpLnN0eWxlU2hlZXQudGV4dENvbnRlbnQgPSBuZXdTdHlsZXM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVmlld1N0YXRlKCk6IFF1aWNrSW5wdXRWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhID0gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChWSUVXU1RBVEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJ3t9JykpO1xuXHRcdFx0aWYgKGRhdGEudG9wICE9PSB1bmRlZmluZWQgfHwgZGF0YS5sZWZ0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7IH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVWaWV3U3RhdGUodmlld1N0YXRlOiBRdWlja0lucHV0Vmlld1N0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNNYWluV2luZG93ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lciA9PT0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cdFx0aWYgKCFpc01haW5XaW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmlld1N0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVklFV1NUQVRFX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh2aWV3U3RhdGUpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFZJRVdTVEFURV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVpY2tJbnB1dENvbnRyb2xsZXJIb3N0IGV4dGVuZHMgSUxheW91dFNlcnZpY2UgeyB9XG5cbmNsYXNzIFF1aWNrSW5wdXREcmFnQW5kRHJvcENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZG5kVmlld1N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPHsgdG9wPzogbnVtYmVyOyBsZWZ0PzogbnVtYmVyOyBkb25lOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBfZW5hYmxlZCA9IHRydWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc25hcFRocmVzaG9sZCA9IDIwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbmFwTGluZUhvcml6b250YWxSYXRpbyA9IDAuMjU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJvbHNPbkxlZnQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyb2xzT25SaWdodDogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0QWxpZ25tZW50Q29udGV4dDogSUNvbnRleHRLZXk8J2NlbnRlcicgfCAndG9wJyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsaWdubWVudCA9IG9ic2VydmFibGVWYWx1ZTxRdWlja0lucHV0QWxpZ25tZW50Pih0aGlzLCAndG9wJyk7XG5cdHJlYWRvbmx5IGFsaWdubWVudDogSU9ic2VydmFibGU8UXVpY2tJbnB1dEFsaWdubWVudD4gPSB0aGlzLl9hbGlnbm1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIF9xdWlja0lucHV0RHJhZ0FyZWFzOiB7IG5vZGU6IEhUTUxFbGVtZW50OyBpbmNsdWRlQ2hpbGRyZW46IGJvb2xlYW47IGV4Y2x1ZGVOb2Rlcz86IEhUTUxFbGVtZW50W10gfVtdLFxuXHRcdGluaXRpYWxWaWV3U3RhdGU6IFF1aWNrSW5wdXRWaWV3U3RhdGUgfCB1bmRlZmluZWQsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3F1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0ID0gUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdXN0b21XaW5kb3dDb250cm9scyA9IGdldFdpbmRvd0NvbnRyb2xzU3R5bGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgPT09IFdpbmRvd0NvbnRyb2xzU3R5bGUuQ1VTVE9NO1xuXG5cdFx0Ly8gRG8gbm90IGFsbG93IHRoZSB3aWRnZXQgdG8gb3ZlcmZsb3cgb3IgdW5kZXJmbG93IHdpbmRvdyBjb250cm9scy5cblx0XHQvLyBVc2UgQ1NTIGNhbGN1bGF0aW9ucyB0byBhdm9pZCBoYXZpbmcgdG8gZm9yY2UgbGF5b3V0IHdpdGggYC5jbGllbnRXaWR0aGBcblx0XHR0aGlzLl9jb250cm9sc09uTGVmdCA9IGN1c3RvbVdpbmRvd0NvbnRyb2xzICYmIHBsYXRmb3JtID09PSBQbGF0Zm9ybS5NYWM7XG5cdFx0dGhpcy5fY29udHJvbHNPblJpZ2h0ID0gY3VzdG9tV2luZG93Q29udHJvbHMgJiYgKHBsYXRmb3JtID09PSBQbGF0Zm9ybS5XaW5kb3dzIHx8IHBsYXRmb3JtID09PSBQbGF0Zm9ybS5MaW51eCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMYXlvdXRMaXN0ZW5lcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJNb3VzZUxpc3RlbmVycygpO1xuXHRcdHRoaXMuZG5kVmlld1N0YXRlLnNldCh7IC4uLmluaXRpYWxWaWV3U3RhdGUsIGRvbmU6IHRydWUgfSwgdW5kZWZpbmVkKTtcblx0XHQvLyBJbml0aWFsaXplIGFsaWdubWVudCBmcm9tIHJlc3RvcmVkIHN0YXRlLiBUaGUgZXhhY3Qgc25hcCBhbGlnbm1lbnQgd2lsbFxuXHRcdC8vIGJlIHJlZmluZWQgaW4gbGF5b3V0Q29udGFpbmVyKCkgb25jZSBwaXhlbCBkaW1lbnNpb25zIGFyZSBhdmFpbGFibGUuXG5cdFx0aWYgKGluaXRpYWxWaWV3U3RhdGU/LnRvcCAhPT0gdW5kZWZpbmVkICYmIGluaXRpYWxWaWV3U3RhdGU/LmxlZnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRyZXBhcmVudFVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdH1cblxuXHRsYXlvdXRDb250YWluZXIoZGltZW5zaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZG5kVmlld1N0YXRlLmdldCgpO1xuXHRcdGNvbnN0IGRyYWdBcmVhUmVjdCA9IHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0aWYgKHN0YXRlPy50b3AgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZT8ubGVmdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBhID0gTWF0aC5yb3VuZChzdGF0ZS5sZWZ0ICogMWUyKSAvIDFlMjtcblx0XHRcdGNvbnN0IGIgPSBkaW1lbnNpb24ud2lkdGg7XG5cdFx0XHRjb25zdCBjID0gZHJhZ0FyZWFSZWN0LndpZHRoO1xuXHRcdFx0Y29uc3QgZCA9IGEgKiBiIC0gYyAvIDI7XG5cdFx0XHR0aGlzLl9sYXlvdXQoc3RhdGUudG9wICogZGltZW5zaW9uLmhlaWdodCwgZCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0dGhpcy5fcXVpY2tJbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCduby1kcmFnJywgIWVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QWxpZ25tZW50U3RhdGUodmFsdWU6ICd0b3AnIHwgJ2NlbnRlcicgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9xdWlja0lucHV0QWxpZ25tZW50Q29udGV4dC5zZXQodmFsdWUpO1xuXHRcdHRoaXMuX2FsaWdubWVudC5zZXQodmFsdWUgPz8gJ2N1c3RvbScsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRBbGlnbm1lbnQoYWxpZ25tZW50OiAndG9wJyB8ICdjZW50ZXInIHwgeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyIH0sIGRvbmUgPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKGFsaWdubWVudCA9PT0gJ3RvcCcpIHtcblx0XHRcdHRoaXMuZG5kVmlld1N0YXRlLnNldCh7XG5cdFx0XHRcdHRvcDogdGhpcy5fZ2V0VG9wU25hcFZhbHVlKCkgLyB0aGlzLl9jb250YWluZXIuY2xpZW50SGVpZ2h0LFxuXHRcdFx0XHRsZWZ0OiAodGhpcy5fZ2V0Q2VudGVyWFNuYXBWYWx1ZSgpICsgKHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuY2xpZW50V2lkdGggLyAyKSkgLyB0aGlzLl9jb250YWluZXIuY2xpZW50V2lkdGgsXG5cdFx0XHRcdGRvbmVcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRBbGlnbm1lbnRTdGF0ZSgndG9wJyk7XG5cdFx0fSBlbHNlIGlmIChhbGlnbm1lbnQgPT09ICdjZW50ZXInKSB7XG5cdFx0XHR0aGlzLmRuZFZpZXdTdGF0ZS5zZXQoe1xuXHRcdFx0XHR0b3A6IHRoaXMuX2dldENlbnRlcllTbmFwVmFsdWUoKSAvIHRoaXMuX2NvbnRhaW5lci5jbGllbnRIZWlnaHQsXG5cdFx0XHRcdGxlZnQ6ICh0aGlzLl9nZXRDZW50ZXJYU25hcFZhbHVlKCkgKyAodGhpcy5fcXVpY2tJbnB1dENvbnRhaW5lci5jbGllbnRXaWR0aCAvIDIpKSAvIHRoaXMuX2NvbnRhaW5lci5jbGllbnRXaWR0aCxcblx0XHRcdFx0ZG9uZVxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3NldEFsaWdubWVudFN0YXRlKCdjZW50ZXInKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kbmRWaWV3U3RhdGUuc2V0KHsgdG9wOiBhbGlnbm1lbnQudG9wLCBsZWZ0OiBhbGlnbm1lbnQubGVmdCwgZG9uZSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckxheW91dExpc3RlbmVyKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkTGF5b3V0Q29udGFpbmVyLCBlID0+IGUuY29udGFpbmVyID09PSB0aGlzLl9jb250YWluZXIpKChlKSA9PiB0aGlzLmxheW91dENvbnRhaW5lcihlLmRpbWVuc2lvbikpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNb3VzZUxpc3RlbmVycygpOiB2b2lkIHtcblx0XHRjb25zdCBkcmFnQXJlYSA9IHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXI7XG5cblx0XHQvLyBEb3VibGUgY2xpY2tcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIoZHJhZ0FyZWEsIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3JpZ2luRXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3coZHJhZ0FyZWEpLCBldmVudCk7XG5cdFx0XHRpZiAob3JpZ2luRXZlbnQuZGV0YWlsICE9PSAyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWdub3JlIGV2ZW50IGlmIHRoZSB0YXJnZXQgaXMgbm90IHRoZSBkcmFnIGFyZWFcblx0XHRcdGNvbnN0IGFyZWEgPSB0aGlzLl9xdWlja0lucHV0RHJhZ0FyZWFzLmZpbmQoKHsgbm9kZSwgaW5jbHVkZUNoaWxkcmVuIH0pID0+IGluY2x1ZGVDaGlsZHJlbiA/IGRvbS5pc0FuY2VzdG9yKG9yaWdpbkV2ZW50LnRhcmdldCwgbm9kZSkgOiBvcmlnaW5FdmVudC50YXJnZXQgPT09IG5vZGUpO1xuXHRcdFx0aWYgKCFhcmVhIHx8IGFyZWEuZXhjbHVkZU5vZGVzPy5zb21lKG5vZGUgPT4gZG9tLmlzQW5jZXN0b3Iob3JpZ2luRXZlbnQudGFyZ2V0LCBub2RlKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRuZFZpZXdTdGF0ZS5zZXQoeyB0b3A6IHVuZGVmaW5lZCwgbGVmdDogdW5kZWZpbmVkLCBkb25lOiB0cnVlIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRBbGlnbm1lbnRTdGF0ZSgndG9wJyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTW91c2UgZG93blxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGRyYWdBcmVhLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBvcmlnaW5FdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoYWN0aXZlV2luZG93LCBlKTtcblxuXHRcdFx0Ly8gSWdub3JlIGV2ZW50IGlmIHRoZSB0YXJnZXQgaXMgbm90IHRoZSBkcmFnIGFyZWFcblx0XHRcdGNvbnN0IGFyZWEgPSB0aGlzLl9xdWlja0lucHV0RHJhZ0FyZWFzLmZpbmQoKHsgbm9kZSwgaW5jbHVkZUNoaWxkcmVuIH0pID0+IGluY2x1ZGVDaGlsZHJlbiA/IGRvbS5pc0FuY2VzdG9yKG9yaWdpbkV2ZW50LnRhcmdldCwgbm9kZSkgOiBvcmlnaW5FdmVudC50YXJnZXQgPT09IG5vZGUpO1xuXHRcdFx0aWYgKCFhcmVhIHx8IGFyZWEuZXhjbHVkZU5vZGVzPy5zb21lKG5vZGUgPT4gZG9tLmlzQW5jZXN0b3Iob3JpZ2luRXZlbnQudGFyZ2V0LCBub2RlKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb3VzZSBwb3NpdGlvbiBvZmZzZXQgcmVsYXRpdmUgdG8gZHJhZ0FyZWFcblx0XHRcdGNvbnN0IGRyYWdBcmVhUmVjdCA9IHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBkcmFnT2Zmc2V0WCA9IG9yaWdpbkV2ZW50LmJyb3dzZXJFdmVudC5jbGllbnRYIC0gZHJhZ0FyZWFSZWN0LmxlZnQ7XG5cdFx0XHRjb25zdCBkcmFnT2Zmc2V0WSA9IG9yaWdpbkV2ZW50LmJyb3dzZXJFdmVudC5jbGllbnRZIC0gZHJhZ0FyZWFSZWN0LnRvcDtcblxuXHRcdFx0bGV0IGlzTW92aW5nUXVpY2tJbnB1dCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgbW91c2VNb3ZlTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZU1vdmVMaXN0ZW5lcihhY3RpdmVXaW5kb3csIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vdXNlTW92ZUV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChhY3RpdmVXaW5kb3csIGUpO1xuXHRcdFx0XHRtb3VzZU1vdmVFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRcdGlmICghaXNNb3ZpbmdRdWlja0lucHV0KSB7XG5cdFx0XHRcdFx0aXNNb3ZpbmdRdWlja0lucHV0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xheW91dChlLmNsaWVudFkgLSBkcmFnT2Zmc2V0WSwgZS5jbGllbnRYIC0gZHJhZ09mZnNldFgpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBtb3VzZVVwTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIoYWN0aXZlV2luZG93LCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNNb3ZpbmdRdWlja0lucHV0KSB7XG5cdFx0XHRcdFx0Ly8gU2F2ZSBwb3NpdGlvblxuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5kbmRWaWV3U3RhdGUuZ2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5kbmRWaWV3U3RhdGUuc2V0KHsgdG9wOiBzdGF0ZT8udG9wLCBsZWZ0OiBzdGF0ZT8ubGVmdCwgZG9uZTogdHJ1ZSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGlzcG9zZSBsaXN0ZW5lcnNcblx0XHRcdFx0bW91c2VNb3ZlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRtb3VzZVVwTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0KHRvcENvb3JkaW5hdGU6IG51bWJlciwgbGVmdENvb3JkaW5hdGU6IG51bWJlcikge1xuXHRcdGNvbnN0IHNuYXBDb29yZGluYXRlWVRvcCA9IHRoaXMuX2dldFRvcFNuYXBWYWx1ZSgpO1xuXHRcdGNvbnN0IHNuYXBDb29yZGluYXRlWSA9IHRoaXMuX2dldENlbnRlcllTbmFwVmFsdWUoKTtcblx0XHRjb25zdCBzbmFwQ29vcmRpbmF0ZVggPSB0aGlzLl9nZXRDZW50ZXJYU25hcFZhbHVlKCk7XG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBxdWljayBpbnB1dCBpcyBub3QgbW92ZWQgb3V0c2lkZSB0aGUgY29udGFpbmVyXG5cdFx0dG9wQ29vcmRpbmF0ZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRvcENvb3JkaW5hdGUsIHRoaXMuX2NvbnRhaW5lci5jbGllbnRIZWlnaHQgLSB0aGlzLl9xdWlja0lucHV0Q29udGFpbmVyLmNsaWVudEhlaWdodCkpO1xuXG5cdFx0aWYgKHRvcENvb3JkaW5hdGUgPCB0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lck9mZnNldC50b3ApIHtcblx0XHRcdGlmICh0aGlzLl9jb250cm9sc09uTGVmdCkge1xuXHRcdFx0XHRsZWZ0Q29vcmRpbmF0ZSA9IE1hdGgubWF4KGxlZnRDb29yZGluYXRlLCA4MCAvIGdldFpvb21GYWN0b3IoZG9tLmdldEFjdGl2ZVdpbmRvdygpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2NvbnRyb2xzT25SaWdodCkge1xuXHRcdFx0XHRsZWZ0Q29vcmRpbmF0ZSA9IE1hdGgubWluKGxlZnRDb29yZGluYXRlLCB0aGlzLl9jb250YWluZXIuY2xpZW50V2lkdGggLSB0aGlzLl9xdWlja0lucHV0Q29udGFpbmVyLmNsaWVudFdpZHRoIC0gKDE0MCAvIGdldFpvb21GYWN0b3IoZG9tLmdldEFjdGl2ZVdpbmRvdygpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNuYXBwaW5nVG9Ub3AgPSBNYXRoLmFicyh0b3BDb29yZGluYXRlIC0gc25hcENvb3JkaW5hdGVZVG9wKSA8IHRoaXMuX3NuYXBUaHJlc2hvbGQ7XG5cdFx0dG9wQ29vcmRpbmF0ZSA9IHNuYXBwaW5nVG9Ub3AgPyBzbmFwQ29vcmRpbmF0ZVlUb3AgOiB0b3BDb29yZGluYXRlO1xuXHRcdGNvbnN0IHNuYXBwaW5nVG9DZW50ZXIgPSBNYXRoLmFicyh0b3BDb29yZGluYXRlIC0gc25hcENvb3JkaW5hdGVZKSA8IHRoaXMuX3NuYXBUaHJlc2hvbGQ7XG5cdFx0dG9wQ29vcmRpbmF0ZSA9IHNuYXBwaW5nVG9DZW50ZXIgPyBzbmFwQ29vcmRpbmF0ZVkgOiB0b3BDb29yZGluYXRlO1xuXHRcdGNvbnN0IHRvcCA9IHRvcENvb3JkaW5hdGUgLyB0aGlzLl9jb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBxdWljayBpbnB1dCBpcyBub3QgbW92ZWQgb3V0c2lkZSB0aGUgY29udGFpbmVyXG5cdFx0bGVmdENvb3JkaW5hdGUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihsZWZ0Q29vcmRpbmF0ZSwgdGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoIC0gdGhpcy5fcXVpY2tJbnB1dENvbnRhaW5lci5jbGllbnRXaWR0aCkpO1xuXHRcdGNvbnN0IHNuYXBwaW5nVG9DZW50ZXJYID0gTWF0aC5hYnMobGVmdENvb3JkaW5hdGUgLSBzbmFwQ29vcmRpbmF0ZVgpIDwgdGhpcy5fc25hcFRocmVzaG9sZDtcblx0XHRsZWZ0Q29vcmRpbmF0ZSA9IHNuYXBwaW5nVG9DZW50ZXJYID8gc25hcENvb3JkaW5hdGVYIDogbGVmdENvb3JkaW5hdGU7XG5cblx0XHRjb25zdCBiID0gdGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGMgPSB0aGlzLl9xdWlja0lucHV0Q29udGFpbmVyLmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGQgPSBsZWZ0Q29vcmRpbmF0ZTtcblx0XHRjb25zdCBsZWZ0ID0gKGQgKyBjIC8gMikgLyBiO1xuXG5cdFx0dGhpcy5kbmRWaWV3U3RhdGUuc2V0KHsgdG9wLCBsZWZ0LCBkb25lOiBmYWxzZSB9LCB1bmRlZmluZWQpO1xuXHRcdGlmIChzbmFwcGluZ1RvQ2VudGVyWCkge1xuXHRcdFx0aWYgKHNuYXBwaW5nVG9Ub3ApIHtcblx0XHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUoJ3RvcCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKHNuYXBwaW5nVG9DZW50ZXIpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUoJ2NlbnRlcicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NldEFsaWdubWVudFN0YXRlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb3BTbmFwVmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyT2Zmc2V0LnF1aWNrUGlja1RvcDtcblx0fVxuXG5cdHByaXZhdGUgX2dldENlbnRlcllTbmFwVmFsdWUoKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5fY29udGFpbmVyLmNsaWVudEhlaWdodCAqIHRoaXMuX3NuYXBMaW5lSG9yaXpvbnRhbFJhdGlvKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENlbnRlclhTbmFwVmFsdWUoKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoIC8gMikgLSBNYXRoLnJvdW5kKHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuY2xpZW50V2lkdGggLyAyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQTBDLG1CQUFtQixlQUFlO0FBQ3JGLE9BQU8sY0FBYztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFrSyxzQkFBc0Msc0JBQXVGO0FBQy9SLFNBQVMscUJBQXFCO0FBQzlCLFNBQXlFLFdBQVcsWUFBWSxVQUF3QixhQUFhLHdCQUF3QiwwQkFBMEIsOEJBQThCLHFDQUFxQztBQUMxUCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFzQiwwQkFBMEI7QUFDaEQsT0FBTztBQUNQLFNBQXNCLFNBQVMsdUJBQXVCO0FBQ3RELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsNkJBQTZCO0FB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
