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
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { equals } from "../../../base/common/arrays.js";
import { TimeoutTimer } from "../../../base/common/async.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter, EventBufferer } from "../../../base/common/event.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { isIOS } from "../../../base/common/platform.js";
import Severity from "../../../base/common/severity.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import "./media/quickInput.css";
import { localize } from "../../../nls.js";
import { ItemActivation, NO_KEY_MODS, QuickInputButtonLocation, QuickInputHideReason, QuickInputType, QuickPickFocus } from "../common/quickInput.js";
import { quickInputButtonToAction, quickInputButtonsToActionArrays, renderQuickInputDescription } from "./quickInputUtils.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../hover/browser/hover.js";
import { ContextKeyExpr, RawContextKey } from "../../contextkey/common/contextkey.js";
import { observableValue } from "../../../base/common/observable.js";
const inQuickInputContextKeyValue = "inQuickInput";
const InQuickInputContextKey = new RawContextKey(inQuickInputContextKeyValue, false, localize("inQuickInput", "Whether keyboard focus is inside the quick input control"));
const inQuickInputContext = ContextKeyExpr.has(inQuickInputContextKeyValue);
const quickInputAlignmentContextKeyValue = "quickInputAlignment";
const QuickInputAlignmentContextKey = new RawContextKey(quickInputAlignmentContextKeyValue, "top", localize("quickInputAlignment", "The alignment of the quick input"));
const quickInputTypeContextKeyValue = "quickInputType";
const QuickInputTypeContextKey = new RawContextKey(quickInputTypeContextKeyValue, void 0, localize("quickInputType", "The type of the currently visible quick input"));
const endOfQuickInputBoxContextKeyValue = "cursorAtEndOfQuickInputBox";
const EndOfQuickInputBoxContextKey = new RawContextKey(endOfQuickInputBoxContextKeyValue, false, localize("cursorAtEndOfQuickInputBox", "Whether the cursor in the quick input is at the end of the input box"));
const endOfQuickInputBoxContext = ContextKeyExpr.has(endOfQuickInputBoxContextKeyValue);
const backButton = {
  iconClass: ThemeIcon.asClassName(Codicon.quickInputBack),
  tooltip: localize("quickInput.back", "Back"),
  handle: -1
  // TODO
};
const _QuickInput = class _QuickInput extends Disposable {
  constructor(ui) {
    super();
    this.ui = ui;
    this._visible = observableValue("visible", false);
    this._enabled = true;
    this._busy = false;
    this._ignoreFocusOut = false;
    this._leftButtons = [];
    this._rightButtons = [];
    this._inlineButtons = [];
    this._inputButtons = [];
    this.buttonsUpdated = false;
    this.noValidationMessage = _QuickInput.noPromptMessage;
    this._severity = Severity.Ignore;
    this.onDidTriggerButtonEmitter = this._register(new Emitter());
    this.onDidHideEmitter = this._register(new Emitter());
    this.onWillHideEmitter = this._register(new Emitter());
    this.onDisposeEmitter = this._register(new Emitter());
    this.visibleDisposables = this._register(new DisposableStore());
    this.onDidTriggerButton = this.onDidTriggerButtonEmitter.event;
    this.onDidHide = this.onDidHideEmitter.event;
    this.onWillHide = this.onWillHideEmitter.event;
    this.onDispose = this.onDisposeEmitter.event;
  }
  get visible() {
    return this._visible.get();
  }
  get title() {
    return this._title;
  }
  set title(title) {
    this._title = title;
    this.update();
  }
  get description() {
    return this._description;
  }
  set description(description) {
    this._description = description;
    this.update();
  }
  get step() {
    return this._steps;
  }
  set step(step) {
    this._steps = step;
    this.update();
  }
  get totalSteps() {
    return this._totalSteps;
  }
  set totalSteps(totalSteps) {
    this._totalSteps = totalSteps;
    this.update();
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    this._enabled = enabled;
    this.update();
  }
  get contextKey() {
    return this._contextKey;
  }
  set contextKey(contextKey) {
    this._contextKey = contextKey;
    this.update();
  }
  get busy() {
    return this._busy;
  }
  set busy(busy) {
    this._busy = busy;
    this.update();
  }
  get ignoreFocusOut() {
    return this._ignoreFocusOut;
  }
  set ignoreFocusOut(ignoreFocusOut) {
    const shouldUpdate = this._ignoreFocusOut !== ignoreFocusOut && !isIOS;
    this._ignoreFocusOut = ignoreFocusOut && !isIOS;
    if (shouldUpdate) {
      this.update();
    }
  }
  get titleButtons() {
    return this._leftButtons.length ? [...this._leftButtons, this._rightButtons] : this._rightButtons;
  }
  get buttons() {
    return [
      ...this._leftButtons,
      ...this._rightButtons,
      ...this._inlineButtons,
      ...this._inputButtons
    ];
  }
  set buttons(buttons) {
    const leftButtons = [];
    const rightButtons = [];
    const inlineButtons = [];
    const inputButtons = [];
    for (const button of buttons) {
      if (button === backButton) {
        leftButtons.push(button);
      } else {
        switch (button.location) {
          case QuickInputButtonLocation.Inline:
            inlineButtons.push(button);
            break;
          case QuickInputButtonLocation.Input:
            inputButtons.push(button);
            break;
          default:
            rightButtons.push(button);
            break;
        }
      }
    }
    this._leftButtons = leftButtons;
    this._rightButtons = rightButtons;
    this._inlineButtons = inlineButtons;
    this._inputButtons = inputButtons;
    this.buttonsUpdated = true;
    this.update();
  }
  get validationMessage() {
    return this._validationMessage;
  }
  set validationMessage(validationMessage) {
    this._validationMessage = validationMessage;
    this.update();
  }
  get severity() {
    return this._severity;
  }
  set severity(severity) {
    this._severity = severity;
    this.update();
  }
  show() {
    if (this.visible) {
      return;
    }
    this.visibleDisposables.add(
      this.ui.onDidTriggerButton((button) => {
        if (this.buttons.indexOf(button) !== -1) {
          this.onDidTriggerButtonEmitter.fire(button);
        }
      })
    );
    this.ui.show(this);
    this._visible.set(true, void 0);
    this._lastValidationMessage = void 0;
    this._lastSeverity = void 0;
    if (this.buttons.length) {
      this.buttonsUpdated = true;
    }
    this.update();
  }
  hide() {
    if (!this.visible) {
      return;
    }
    this.ui.hide();
  }
  didHide(reason = QuickInputHideReason.Other) {
    this._visible.set(false, void 0);
    this.visibleDisposables.clear();
    this.onDidHideEmitter.fire({ reason });
  }
  willHide(reason = QuickInputHideReason.Other) {
    this.onWillHideEmitter.fire({ reason });
  }
  update() {
    if (!this.visible) {
      return;
    }
    const title = this.getTitle();
    if (title && this.ui.title.textContent !== title) {
      this.ui.title.textContent = title;
    } else if (!title && this.ui.title.innerHTML !== "&nbsp;") {
      this.ui.title.innerText = "\xA0";
    }
    const description = this.getDescription();
    if (this.ui.description1.textContent !== description) {
      this.ui.description1.textContent = description;
    }
    if (this.ui.description2.textContent !== description) {
      this.ui.description2.textContent = description;
    }
    if (this.busy && !this.busyDelay) {
      this.busyDelay = new TimeoutTimer();
      this.busyDelay.setIfNotSet(() => {
        if (this.visible) {
          this.ui.progressBar.infinite();
          this.ui.progressBar.getContainer().removeAttribute("aria-hidden");
        }
      }, 800);
    }
    if (!this.busy && this.busyDelay) {
      this.ui.progressBar.stop();
      this.ui.progressBar.getContainer().setAttribute("aria-hidden", "true");
      this.busyDelay.cancel();
      this.busyDelay = void 0;
    }
    if (this.buttonsUpdated) {
      this.buttonsUpdated = false;
      const leftActions = quickInputButtonsToActionArrays(
        this._leftButtons,
        "left-button",
        (button) => this.onDidTriggerButtonEmitter.fire(button)
      );
      this.ui.leftActionBar.setActions(leftActions.primary, leftActions.secondary);
      const rightActions = quickInputButtonsToActionArrays(
        this._rightButtons,
        "right-button",
        (button) => this.onDidTriggerButtonEmitter.fire(button)
      );
      this.ui.rightActionBar.setActions(rightActions.primary, rightActions.secondary);
      const inlineActions = quickInputButtonsToActionArrays(
        this._inlineButtons,
        "inline-button",
        (button) => this.onDidTriggerButtonEmitter.fire(button)
      );
      this.ui.inlineActionBar.setActions(inlineActions.primary, inlineActions.secondary);
      const inputButtonOffset = this._inputButtons.length * 22;
      this.ui.countContainer.style.right = inputButtonOffset > 0 ? `${4 + inputButtonOffset}px` : "4px";
      this.ui.inputBox.actions = this._inputButtons.map((button, index) => quickInputButtonToAction(
        button,
        `id-${index}`,
        async () => this.onDidTriggerButtonEmitter.fire(button)
      ));
    }
    this.ui.ignoreFocusOut = this.ignoreFocusOut;
    this.ui.setEnabled(this.enabled);
    this.ui.setContextKey(this.contextKey);
    const validationMessage = this.validationMessage || this.noValidationMessage;
    if (this._lastValidationMessage !== validationMessage) {
      this._lastValidationMessage = validationMessage;
      dom.reset(this.ui.message);
      if (validationMessage) {
        renderQuickInputDescription(validationMessage, this.ui.message, {
          callback: (content) => {
            this.ui.linkOpenerDelegate(content);
          },
          disposables: this.visibleDisposables
        });
      }
    }
    if (this._lastSeverity !== this.severity) {
      this._lastSeverity = this.severity;
      this.showMessageDecoration(this.severity);
    }
  }
  getTitle() {
    if (this.title && this.step) {
      return `${this.title} (${this.getSteps()})`;
    }
    if (this.title) {
      return this.title;
    }
    if (this.step) {
      return this.getSteps();
    }
    return "";
  }
  getDescription() {
    return this.description || "";
  }
  getSteps() {
    if (this.step && this.totalSteps) {
      return localize("quickInput.steps", "{0}/{1}", this.step, this.totalSteps);
    }
    if (this.step) {
      return String(this.step);
    }
    return "";
  }
  showMessageDecoration(severity) {
    this.ui.inputBox.showDecoration(severity);
    if (severity !== Severity.Ignore) {
      const styles = this.ui.inputBox.stylesForType(severity);
      this.ui.message.style.color = styles.foreground ? `${styles.foreground}` : "";
      this.ui.message.style.backgroundColor = styles.background ? `${styles.background}` : "";
      this.ui.message.style.border = styles.border ? `1px solid ${styles.border}` : "";
      this.ui.message.style.marginBottom = "-2px";
    } else {
      this.ui.message.style.color = "";
      this.ui.message.style.backgroundColor = "";
      this.ui.message.style.border = "";
      this.ui.message.style.marginBottom = "";
    }
  }
  dispose() {
    this.hide();
    this.onDisposeEmitter.fire();
    super.dispose();
  }
};
_QuickInput.noPromptMessage = localize("inputModeEntry", "Press 'Enter' to confirm your input or 'Escape' to cancel");
let QuickInput = _QuickInput;
const _QuickPick = class _QuickPick extends QuickInput {
  constructor(ui) {
    super(ui);
    this._value = "";
    this.onDidChangeValueEmitter = this._register(new Emitter());
    this.onWillAcceptEmitter = this._register(new Emitter());
    this.onDidAcceptEmitter = this._register(new Emitter());
    this.onDidCustomEmitter = this._register(new Emitter());
    this._items = [];
    this.itemsUpdated = false;
    this._canSelectMany = false;
    this._canAcceptInBackground = false;
    this._matchOnDescription = false;
    this._matchOnDetail = false;
    this._matchOnLabel = true;
    this._matchOnLabelMode = "fuzzy";
    this._sortByLabel = true;
    this._keepScrollPosition = false;
    this._itemActivation = ItemActivation.FIRST;
    this._activeItems = [];
    this.activeItemsUpdated = false;
    this.activeItemsToConfirm = [];
    this.onDidChangeActiveEmitter = this._register(new Emitter());
    this._selectedItems = [];
    this.selectedItemsUpdated = false;
    this.selectedItemsToConfirm = [];
    this.onDidChangeSelectionEmitter = this._register(new Emitter());
    this.onDidTriggerItemButtonEmitter = this._register(new Emitter());
    this.onDidTriggerSeparatorButtonEmitter = this._register(new Emitter());
    this.valueSelectionUpdated = true;
    this._ok = "default";
    this._customButton = false;
    this._customButtonSecondary = false;
    this._focusEventBufferer = new EventBufferer();
    this.type = QuickInputType.QuickPick;
    this.filterValue = (value) => value;
    this.onDidChangeValue = this.onDidChangeValueEmitter.event;
    this.onWillAccept = this.onWillAcceptEmitter.event;
    this.onDidAccept = this.onDidAcceptEmitter.event;
    this.onDidCustom = this.onDidCustomEmitter.event;
    this.onDidChangeActive = this.onDidChangeActiveEmitter.event;
    this.onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
    this.onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;
    this.onDidTriggerSeparatorButton = this.onDidTriggerSeparatorButtonEmitter.event;
    this.noValidationMessage = void 0;
  }
  get quickNavigate() {
    return this._quickNavigate;
  }
  set quickNavigate(quickNavigate) {
    this._quickNavigate = quickNavigate;
    this.update();
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this.doSetValue(value);
  }
  doSetValue(value, skipUpdate) {
    if (this._value !== value) {
      this._value = value;
      if (!skipUpdate) {
        this.update();
      }
      if (this.visible) {
        const didFilter = this.ui.list.filter(this.filterValue(this._value));
        if (didFilter) {
          this.trySelectFirst();
        }
      }
      this.onDidChangeValueEmitter.fire(this._value);
    }
  }
  set ariaLabel(ariaLabel) {
    this._ariaLabel = ariaLabel;
    this.update();
  }
  get ariaLabel() {
    return this._ariaLabel;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this._placeholder = placeholder;
    this.update();
  }
  get prompt() {
    return this.noValidationMessage;
  }
  set prompt(prompt) {
    this.noValidationMessage = prompt;
    this.update();
  }
  get items() {
    return this._items;
  }
  get scrollTop() {
    return this.ui.list.scrollTop;
  }
  set scrollTop(scrollTop) {
    this.ui.list.scrollTop = scrollTop;
  }
  set items(items) {
    this._items = items;
    this.itemsUpdated = true;
    this.update();
  }
  get canSelectMany() {
    return this._canSelectMany;
  }
  set canSelectMany(canSelectMany) {
    this._canSelectMany = canSelectMany;
    this.update();
  }
  get canAcceptInBackground() {
    return this._canAcceptInBackground;
  }
  set canAcceptInBackground(canAcceptInBackground) {
    this._canAcceptInBackground = canAcceptInBackground;
  }
  get matchOnDescription() {
    return this._matchOnDescription;
  }
  set matchOnDescription(matchOnDescription) {
    this._matchOnDescription = matchOnDescription;
    this.update();
  }
  get matchOnDetail() {
    return this._matchOnDetail;
  }
  set matchOnDetail(matchOnDetail) {
    this._matchOnDetail = matchOnDetail;
    this.update();
  }
  get matchOnLabel() {
    return this._matchOnLabel;
  }
  set matchOnLabel(matchOnLabel) {
    this._matchOnLabel = matchOnLabel;
    this.update();
  }
  get matchOnLabelMode() {
    return this._matchOnLabelMode;
  }
  set matchOnLabelMode(matchOnLabelMode) {
    this._matchOnLabelMode = matchOnLabelMode;
    this.update();
  }
  get sortByLabel() {
    return this._sortByLabel;
  }
  set sortByLabel(sortByLabel) {
    this._sortByLabel = sortByLabel;
    this.update();
  }
  get keepScrollPosition() {
    return this._keepScrollPosition;
  }
  set keepScrollPosition(keepScrollPosition) {
    this._keepScrollPosition = keepScrollPosition;
  }
  get itemActivation() {
    return this._itemActivation;
  }
  set itemActivation(itemActivation) {
    this._itemActivation = itemActivation;
  }
  get activeItems() {
    return this._activeItems;
  }
  set activeItems(activeItems) {
    this._activeItems = activeItems;
    this.activeItemsUpdated = true;
    this.update();
  }
  get selectedItems() {
    return this._selectedItems;
  }
  set selectedItems(selectedItems) {
    this._selectedItems = selectedItems;
    this.selectedItemsUpdated = true;
    this.update();
  }
  get keyMods() {
    if (this._quickNavigate) {
      return NO_KEY_MODS;
    }
    return this.ui.keyMods;
  }
  get valueSelection() {
    const selection = this.ui.inputBox.getSelection();
    if (!selection) {
      return void 0;
    }
    return [selection.start, selection.end];
  }
  set valueSelection(valueSelection) {
    this._valueSelection = valueSelection;
    this.valueSelectionUpdated = true;
    this.update();
  }
  get customButton() {
    return this._customButton;
  }
  set customButton(showCustomButton) {
    this._customButton = showCustomButton;
    this.update();
  }
  get customLabel() {
    return this._customButtonLabel;
  }
  set customLabel(label) {
    this._customButtonLabel = label;
    this.update();
  }
  get customHover() {
    return this._customButtonHover;
  }
  set customHover(hover) {
    this._customButtonHover = hover;
    this.update();
  }
  get customButtonSecondary() {
    return this._customButtonSecondary;
  }
  set customButtonSecondary(secondary) {
    this._customButtonSecondary = secondary ?? false;
    this.update();
  }
  get ok() {
    return this._ok;
  }
  set ok(showOkButton) {
    this._ok = showOkButton;
    this.update();
  }
  get okLabel() {
    return this._okLabel ?? localize("ok", "OK");
  }
  set okLabel(okLabel) {
    this._okLabel = okLabel;
    this.update();
  }
  inputHasFocus() {
    return this.visible ? this.ui.inputBox.hasFocus() : false;
  }
  focusOnInput() {
    this.ui.inputBox.setFocus();
  }
  get hideInput() {
    return !!this._hideInput;
  }
  set hideInput(hideInput) {
    this._hideInput = hideInput;
    this.update();
  }
  get hideCountBadge() {
    return !!this._hideCountBadge;
  }
  set hideCountBadge(hideCountBadge) {
    this._hideCountBadge = hideCountBadge;
    this.update();
  }
  get hideCheckAll() {
    return !!this._hideCheckAll;
  }
  set hideCheckAll(hideCheckAll) {
    this._hideCheckAll = hideCheckAll;
    this.update();
  }
  trySelectFirst() {
    if (!this.canSelectMany) {
      this.ui.list.focus(QuickPickFocus.First);
    }
  }
  show() {
    if (!this.visible) {
      this.visibleDisposables.add(
        this.ui.inputBox.onDidChange((value) => {
          this.doSetValue(
            value,
            true
            /* skip update since this originates from the UI */
          );
        })
      );
      this.visibleDisposables.add(this.ui.onDidAccept(() => {
        if (this.canSelectMany) {
          if (!this.ui.list.getCheckedElements().length) {
            this._selectedItems = [];
            this.onDidChangeSelectionEmitter.fire(this.selectedItems);
          }
        } else if (this.activeItems[0]) {
          this._selectedItems = [this.activeItems[0]];
          this.onDidChangeSelectionEmitter.fire(this.selectedItems);
        }
        this.handleAccept(false);
      }));
      this.visibleDisposables.add(this.ui.onDidCustom(() => {
        this.onDidCustomEmitter.fire();
      }));
      this.visibleDisposables.add(this._focusEventBufferer.wrapEvent(
        this.ui.list.onDidChangeFocus,
        // Only fire the last event
        (_, e) => e
      )((focusedItems) => {
        if (this.activeItemsUpdated) {
          return;
        }
        if (this.activeItemsToConfirm !== this._activeItems && equals(focusedItems, this._activeItems, (a, b) => a === b)) {
          return;
        }
        this._activeItems = focusedItems;
        this.onDidChangeActiveEmitter.fire(focusedItems);
      }));
      this.visibleDisposables.add(this.ui.list.onDidChangeSelection(({ items: selectedItems, event }) => {
        if (this.canSelectMany && !selectedItems.some((i) => i.pickable === false)) {
          if (selectedItems.length) {
            this.ui.list.setSelectedElements([]);
          }
          return;
        }
        if (this.selectedItemsToConfirm !== this._selectedItems && equals(selectedItems, this._selectedItems, (a, b) => a === b)) {
          return;
        }
        this._selectedItems = selectedItems;
        this.onDidChangeSelectionEmitter.fire(selectedItems);
        if (selectedItems.length) {
          this.handleAccept(
            dom.isMouseEvent(event) && event.button === 1
            /* mouse middle click */
          );
        }
      }));
      this.visibleDisposables.add(this.ui.list.onChangedCheckedElements((checkedItems) => {
        if (!this.canSelectMany || !this.visible) {
          return;
        }
        if (this.selectedItemsToConfirm !== this._selectedItems && equals(checkedItems, this._selectedItems, (a, b) => a === b)) {
          return;
        }
        this._selectedItems = checkedItems;
        this.onDidChangeSelectionEmitter.fire(checkedItems);
      }));
      this.visibleDisposables.add(this.ui.list.onButtonTriggered((event) => this.onDidTriggerItemButtonEmitter.fire(event)));
      this.visibleDisposables.add(this.ui.list.onSeparatorButtonTriggered((event) => this.onDidTriggerSeparatorButtonEmitter.fire(event)));
      this.visibleDisposables.add(this.registerQuickNavigation());
      this.valueSelectionUpdated = true;
    }
    super.show();
  }
  handleAccept(inBackground) {
    let veto = false;
    this.onWillAcceptEmitter.fire({ veto: () => veto = true });
    if (!veto) {
      this.onDidAcceptEmitter.fire({ inBackground });
    }
  }
  registerQuickNavigation() {
    return dom.addDisposableListener(this.ui.container, dom.EventType.KEY_UP, (e) => {
      if (this.canSelectMany || !this._quickNavigate) {
        return;
      }
      const keyboardEvent = new StandardKeyboardEvent(e);
      const keyCode = keyboardEvent.keyCode;
      const quickNavKeys = this._quickNavigate.keybindings;
      const wasTriggerKeyPressed = quickNavKeys.some((k) => {
        const chords = k.getChords();
        if (chords.length > 1) {
          return false;
        }
        if (chords[0].shiftKey && keyCode === KeyCode.Shift) {
          if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
            return false;
          }
          return true;
        }
        if (chords[0].altKey && keyCode === KeyCode.Alt) {
          return true;
        }
        if (chords[0].ctrlKey && keyCode === KeyCode.Ctrl) {
          return true;
        }
        if (chords[0].metaKey && keyCode === KeyCode.Meta) {
          return true;
        }
        return false;
      });
      if (wasTriggerKeyPressed) {
        if (this.activeItems[0]) {
          this._selectedItems = [this.activeItems[0]];
          this.onDidChangeSelectionEmitter.fire(this.selectedItems);
          this.handleAccept(false);
        }
        this._quickNavigate = void 0;
      }
    });
  }
  update() {
    if (!this.visible) {
      return;
    }
    const scrollTopBefore = this.keepScrollPosition ? this.scrollTop : 0;
    const hasDescription = !!this.description;
    const visibilities = {
      title: !!this.title || !!this.step || !!this.titleButtons.length,
      description: hasDescription,
      checkAll: this.canSelectMany && !this._hideCheckAll,
      checkBox: this.canSelectMany,
      inputBox: !this._hideInput,
      progressBar: !this._hideInput || hasDescription,
      visibleCount: true,
      count: this.canSelectMany && !this._hideCountBadge,
      ok: this.ok === "default" ? this.canSelectMany : this.ok,
      list: true,
      message: !!this.validationMessage || !!this.prompt,
      customButton: this.customButton
    };
    this.ui.setVisibilities(visibilities);
    super.update();
    if (this.ui.inputBox.value !== this.value) {
      this.ui.inputBox.value = this.value;
    }
    if (this.valueSelectionUpdated) {
      this.valueSelectionUpdated = false;
      this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
    }
    if (this.ui.inputBox.placeholder !== (this.placeholder || "")) {
      this.ui.inputBox.placeholder = this.placeholder || "";
    }
    let ariaLabel = this.ariaLabel;
    if (!ariaLabel && visibilities.inputBox) {
      ariaLabel = this.placeholder;
      if (this.title) {
        ariaLabel = ariaLabel ? `${ariaLabel} - ${this.title}` : this.title;
      }
      if (!ariaLabel) {
        ariaLabel = _QuickPick.DEFAULT_ARIA_LABEL;
      }
    }
    if (this.ui.list.ariaLabel !== ariaLabel) {
      this.ui.list.ariaLabel = ariaLabel ?? null;
    }
    if (this.ui.inputBox.ariaLabel !== ariaLabel) {
      this.ui.inputBox.ariaLabel = ariaLabel ?? "input";
    }
    this.ui.list.matchOnDescription = this.matchOnDescription;
    this.ui.list.matchOnDetail = this.matchOnDetail;
    this.ui.list.matchOnLabel = this.matchOnLabel;
    this.ui.list.matchOnLabelMode = this.matchOnLabelMode;
    this.ui.list.sortByLabel = this.sortByLabel;
    if (this.itemsUpdated) {
      this.itemsUpdated = false;
      this._focusEventBufferer.bufferEvents(() => {
        this.ui.list.setElements(this.items);
        this.ui.list.shouldLoop = !this.canSelectMany;
        this.ui.list.filter(this.filterValue(this.ui.inputBox.value));
        switch (this._itemActivation) {
          case ItemActivation.NONE:
            this._itemActivation = ItemActivation.FIRST;
            break;
          case ItemActivation.SECOND:
            this.ui.list.focus(QuickPickFocus.Second);
            this._itemActivation = ItemActivation.FIRST;
            break;
          case ItemActivation.LAST:
            this.ui.list.focus(QuickPickFocus.Last);
            this._itemActivation = ItemActivation.FIRST;
            break;
          default:
            this.trySelectFirst();
            break;
        }
      });
    }
    if (this.ui.container.classList.contains("show-checkboxes") !== !!this.canSelectMany) {
      if (this.canSelectMany) {
        this.ui.list.clearFocus();
      } else {
        this.trySelectFirst();
      }
    }
    if (this.activeItemsUpdated) {
      this.activeItemsUpdated = false;
      this.activeItemsToConfirm = this._activeItems;
      this.ui.list.setFocusedElements(this.activeItems);
      if (this.activeItemsToConfirm === this._activeItems) {
        this.activeItemsToConfirm = null;
      }
    }
    if (this.selectedItemsUpdated) {
      this.selectedItemsUpdated = false;
      this.selectedItemsToConfirm = this._selectedItems;
      if (this.canSelectMany) {
        this.ui.list.setCheckedElements(this.selectedItems);
      } else {
        this.ui.list.setSelectedElements(this.selectedItems);
      }
      if (this.selectedItemsToConfirm === this._selectedItems) {
        this.selectedItemsToConfirm = null;
      }
    }
    this.ui.ok.label = this.okLabel || "";
    this.ui.customButton.label = this.customLabel || "";
    this.ui.customButton.element.title = this.customHover || "";
    this.ui.customButton.secondary = this.customButtonSecondary || false;
    if (!visibilities.inputBox) {
      this.ui.list.domFocus();
      if (this.canSelectMany) {
        this.ui.list.focus(QuickPickFocus.First);
      }
    }
    if (this.keepScrollPosition) {
      this.scrollTop = scrollTopBefore;
    }
  }
  focus(focus) {
    this.ui.list.focus(focus);
    if (this.canSelectMany) {
      this.ui.list.domFocus();
    }
  }
  accept(inBackground) {
    if (inBackground && !this._canAcceptInBackground) {
      return;
    }
    if (this.activeItems[0] && !this._canSelectMany) {
      this._selectedItems = [this.activeItems[0]];
      this.onDidChangeSelectionEmitter.fire(this.selectedItems);
    }
    this.handleAccept(inBackground ?? false);
  }
};
_QuickPick.DEFAULT_ARIA_LABEL = localize("quickInputBox.ariaLabel", "Type to narrow down results.");
let QuickPick = _QuickPick;
class InputBox extends QuickInput {
  constructor() {
    super(...arguments);
    this._value = "";
    this.valueSelectionUpdated = true;
    this._password = false;
    this.onDidValueChangeEmitter = this._register(new Emitter());
    this.onDidAcceptEmitter = this._register(new Emitter());
    this.type = QuickInputType.InputBox;
    this.onDidChangeValue = this.onDidValueChangeEmitter.event;
    this.onDidAccept = this.onDidAcceptEmitter.event;
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = value || "";
    this.update();
  }
  get valueSelection() {
    const selection = this.ui.inputBox.getSelection();
    if (!selection) {
      return void 0;
    }
    return [selection.start, selection.end];
  }
  set valueSelection(valueSelection) {
    this._valueSelection = valueSelection;
    this.valueSelectionUpdated = true;
    this.update();
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this._placeholder = placeholder;
    this.update();
  }
  get ariaLabel() {
    return this._ariaLabel;
  }
  set ariaLabel(ariaLabel) {
    this._ariaLabel = ariaLabel;
    this.update();
  }
  get password() {
    return this._password;
  }
  set password(password) {
    this._password = password;
    this.update();
  }
  get prompt() {
    return this._prompt;
  }
  set prompt(prompt) {
    this._prompt = prompt;
    this.noValidationMessage = prompt ? localize("inputModeEntryDescription", "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", prompt) : QuickInput.noPromptMessage;
    this.update();
  }
  show() {
    if (!this.visible) {
      this.visibleDisposables.add(
        this.ui.inputBox.onDidChange((value) => {
          if (value === this.value) {
            return;
          }
          this._value = value;
          this.onDidValueChangeEmitter.fire(value);
        })
      );
      this.visibleDisposables.add(this.ui.onDidAccept(() => this.onDidAcceptEmitter.fire()));
      this.valueSelectionUpdated = true;
    }
    super.show();
  }
  accept() {
    this.onDidAcceptEmitter.fire();
  }
  update() {
    if (!this.visible) {
      return;
    }
    this.ui.container.classList.remove("hidden-input");
    const visibilities = {
      title: !!this.title || !!this.step || !!this.titleButtons.length,
      description: !!this.description || !!this.step,
      inputBox: true,
      message: true,
      progressBar: true
    };
    this.ui.setVisibilities(visibilities);
    super.update();
    if (this.ui.inputBox.value !== this.value) {
      this.ui.inputBox.value = this.value;
    }
    if (this.valueSelectionUpdated) {
      this.valueSelectionUpdated = false;
      this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
    }
    if (this.ui.inputBox.placeholder !== (this.placeholder || "")) {
      this.ui.inputBox.placeholder = this.placeholder || "";
    }
    if (this.ui.inputBox.password !== this.password) {
      this.ui.inputBox.password = this.password;
    }
    let ariaLabel = this.ariaLabel;
    if (!ariaLabel && visibilities.inputBox) {
      ariaLabel = this.placeholder ? this.title ? `${this.placeholder} - ${this.title}` : this.placeholder : this.title ? this.title : "input";
    }
    if (this.ui.inputBox.ariaLabel !== ariaLabel) {
      this.ui.inputBox.ariaLabel = ariaLabel || "input";
    }
  }
}
class QuickWidget extends QuickInput {
  constructor() {
    super(...arguments);
    this.type = QuickInputType.QuickWidget;
    this._widgetUpdated = false;
  }
  get widget() {
    return this._widget;
  }
  set widget(widget) {
    if (this._widget !== widget) {
      this._widget = widget;
      this._widgetUpdated = true;
      this.update();
    }
  }
  update() {
    if (!this.visible) {
      return;
    }
    this.ui.setVisibilities({
      title: !!this.title || !!this.step || !!this.titleButtons.length,
      description: !!this.description || !!this.step
    });
    if (this._widgetUpdated) {
      this._widgetUpdated = false;
      if (this._widget) {
        dom.reset(this.ui.widget, this._widget);
      } else {
        dom.reset(this.ui.widget);
      }
    }
    super.update();
  }
}
let QuickInputHoverDelegate = class extends WorkbenchHoverDelegate {
  constructor(configurationService, hoverService) {
    super("mouse", void 0, (options) => this.getOverrideOptions(options), configurationService, hoverService);
  }
  getOverrideOptions(options) {
    const showHoverHint = (dom.isHTMLElement(options.content) ? options.content.textContent ?? "" : typeof options.content === "string" ? options.content : options.content.value).includes("\n");
    return {
      persistence: {
        hideOnKeyDown: false
      },
      appearance: {
        showHoverHint,
        skipFadeInAnimation: true
      }
    };
  }
};
QuickInputHoverDelegate = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IHoverService)
], QuickInputHoverDelegate);
export {
  EndOfQuickInputBoxContextKey,
  InQuickInputContextKey,
  InputBox,
  QuickInput,
  QuickInputAlignmentContextKey,
  QuickInputHoverDelegate,
  QuickInputTypeContextKey,
  QuickPick,
  QuickWidget,
  backButton,
  endOfQuickInputBoxContext,
  endOfQuickInputBoxContextKeyValue,
  inQuickInputContext,
  inQuickInputContextKeyValue,
  quickInputAlignmentContextKeyValue,
  quickInputTypeContextKeyValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcYnJvd3NlclxccXVpY2tJbnB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgSUJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IENvdW50QmFkZ2UsIElDb3VudEJhZGdlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSwgSUhvdmVyRGVsZWdhdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSUlucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nTGFiZWxTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzQmFyU3R5bGVzLCBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBJVG9nZ2xlU3R5bGVzLCBUcmlTdGF0ZUNoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgRXZlbnRCdWZmZXJlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNJT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCAnLi9tZWRpYS9xdWlja0lucHV0LmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5wdXRCb3gsIElLZXlNb2RzLCBJUXVpY2tJbnB1dCwgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0SGlkZUV2ZW50LCBJUXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb24sIElRdWlja1BpY2ssIElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQsIElRdWlja1BpY2tTZXBhcmF0b3IsIElRdWlja1BpY2tTZXBhcmF0b3JCdXR0b25FdmVudCwgSVF1aWNrUGlja1dpbGxBY2NlcHRFdmVudCwgSVF1aWNrV2lkZ2V0LCBJdGVtQWN0aXZhdGlvbiwgTk9fS0VZX01PRFMsIFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiwgUXVpY2tJbnB1dEhpZGVSZWFzb24sIFF1aWNrSW5wdXRUeXBlLCBRdWlja1BpY2tGb2N1cyB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRCb3ggfSBmcm9tICcuL3F1aWNrSW5wdXRCb3guanMnO1xuaW1wb3J0IHsgcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uLCBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzLCByZW5kZXJRdWlja0lucHV0RGVzY3JpcHRpb24gfSBmcm9tICcuL3F1aWNrSW5wdXRVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UsIFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRMaXN0IH0gZnJvbSAnLi9xdWlja0lucHV0TGlzdC5qcyc7XG5pbXBvcnQgdHlwZSB7IElIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRUcmVlQ29udHJvbGxlciB9IGZyb20gJy4vdHJlZS9xdWlja0lucHV0VHJlZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBpblF1aWNrSW5wdXRDb250ZXh0S2V5VmFsdWUgPSAnaW5RdWlja0lucHV0JztcbmV4cG9ydCBjb25zdCBJblF1aWNrSW5wdXRDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oaW5RdWlja0lucHV0Q29udGV4dEtleVZhbHVlLCBmYWxzZSwgbG9jYWxpemUoJ2luUXVpY2tJbnB1dCcsIFwiV2hldGhlciBrZXlib2FyZCBmb2N1cyBpcyBpbnNpZGUgdGhlIHF1aWNrIGlucHV0IGNvbnRyb2xcIikpO1xuZXhwb3J0IGNvbnN0IGluUXVpY2tJbnB1dENvbnRleHQgPSBDb250ZXh0S2V5RXhwci5oYXMoaW5RdWlja0lucHV0Q29udGV4dEtleVZhbHVlKTtcblxuZXhwb3J0IGNvbnN0IHF1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0S2V5VmFsdWUgPSAncXVpY2tJbnB1dEFsaWdubWVudCc7XG5leHBvcnQgY29uc3QgUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTwndG9wJyB8ICdjZW50ZXInIHwgdW5kZWZpbmVkPihxdWlja0lucHV0QWxpZ25tZW50Q29udGV4dEtleVZhbHVlLCAndG9wJywgbG9jYWxpemUoJ3F1aWNrSW5wdXRBbGlnbm1lbnQnLCBcIlRoZSBhbGlnbm1lbnQgb2YgdGhlIHF1aWNrIGlucHV0XCIpKTtcblxuZXhwb3J0IGNvbnN0IHF1aWNrSW5wdXRUeXBlQ29udGV4dEtleVZhbHVlID0gJ3F1aWNrSW5wdXRUeXBlJztcbmV4cG9ydCBjb25zdCBRdWlja0lucHV0VHlwZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxRdWlja0lucHV0VHlwZT4ocXVpY2tJbnB1dFR5cGVDb250ZXh0S2V5VmFsdWUsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3F1aWNrSW5wdXRUeXBlJywgXCJUaGUgdHlwZSBvZiB0aGUgY3VycmVudGx5IHZpc2libGUgcXVpY2sgaW5wdXRcIikpO1xuXG5leHBvcnQgY29uc3QgZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dEtleVZhbHVlID0gJ2N1cnNvckF0RW5kT2ZRdWlja0lucHV0Qm94JztcbmV4cG9ydCBjb25zdCBFbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dEtleVZhbHVlLCBmYWxzZSwgbG9jYWxpemUoJ2N1cnNvckF0RW5kT2ZRdWlja0lucHV0Qm94JywgXCJXaGV0aGVyIHRoZSBjdXJzb3IgaW4gdGhlIHF1aWNrIGlucHV0IGlzIGF0IHRoZSBlbmQgb2YgdGhlIGlucHV0IGJveFwiKSk7XG5leHBvcnQgY29uc3QgZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dCA9IENvbnRleHRLZXlFeHByLmhhcyhlbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0S2V5VmFsdWUpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElRdWlja0lucHV0T3B0aW9ucyB7XG5cdGlkUHJlZml4OiBzdHJpbmc7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGlnbm9yZUZvY3VzT3V0KCk6IGJvb2xlYW47XG5cdGJhY2tLZXliaW5kaW5nTGFiZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzZXRDb250ZXh0S2V5KGlkPzogc3RyaW5nKTogdm9pZDtcblx0bGlua09wZW5lckRlbGVnYXRlKGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQ7XG5cdHJldHVybkZvY3VzKCk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBAdG9kbyBXaXRoIElIb3ZlciBpbiB2cy9lZGl0b3IsIGNhbiB3ZSBkZXBlbmQgb24gdGhlIHNlcnZpY2UgZGlyZWN0bHlcblx0ICogaW5zdGVhZCBvZiBwYXNzaW5nIGl0IHRocm91Z2ggYSBob3ZlciBkZWxlZ2F0ZT9cblx0ICovXG5cdGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXHRzdHlsZXM6IElRdWlja0lucHV0U3R5bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElRdWlja0lucHV0U3R5bGVzIHtcblx0cmVhZG9ubHkgd2lkZ2V0OiBJUXVpY2tJbnB1dFdpZGdldFN0eWxlcztcblx0cmVhZG9ubHkgaW5wdXRCb3g6IElJbnB1dEJveFN0eWxlcztcblx0cmVhZG9ubHkgdG9nZ2xlOiBJVG9nZ2xlU3R5bGVzO1xuXHRyZWFkb25seSBjb3VudEJhZGdlOiBJQ291bnRCYWRnZVN0eWxlcztcblx0cmVhZG9ubHkgYnV0dG9uOiBJQnV0dG9uU3R5bGVzO1xuXHRyZWFkb25seSBwcm9ncmVzc0JhcjogSVByb2dyZXNzQmFyU3R5bGVzO1xuXHRyZWFkb25seSBrZXliaW5kaW5nTGFiZWw6IElLZXliaW5kaW5nTGFiZWxTdHlsZXM7XG5cdHJlYWRvbmx5IGxpc3Q6IElMaXN0U3R5bGVzO1xuXHRyZWFkb25seSBwaWNrZXJHcm91cDogeyBwaWNrZXJHcm91cEJvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkOyBwaWNrZXJHcm91cEZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElRdWlja0lucHV0V2lkZ2V0U3R5bGVzIHtcblx0cmVhZG9ubHkgcXVpY2tJbnB1dEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcXVpY2tJbnB1dEZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcXVpY2tJbnB1dFRpdGxlQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB3aWRnZXRCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgd2lkZ2V0U2hhZG93OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIFdyaXRlYWJsZTxUPiA9IHsgLXJlYWRvbmx5IFtQIGluIGtleW9mIFRdOiBUW1BdIH07XG5cbmV4cG9ydCBjb25zdCBiYWNrQnV0dG9uID0ge1xuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnF1aWNrSW5wdXRCYWNrKSxcblx0dG9vbHRpcDogbG9jYWxpemUoJ3F1aWNrSW5wdXQuYmFjaycsIFwiQmFja1wiKSxcblx0aGFuZGxlOiAtMSAvLyBUT0RPXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFF1aWNrSW5wdXRVSSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHN0eWxlU2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdGxlZnRBY3Rpb25CYXI6IFRvb2xCYXI7XG5cdHRpdGxlQmFyOiBIVE1MRWxlbWVudDtcblx0dGl0bGU6IEhUTUxFbGVtZW50O1xuXHRkZXNjcmlwdGlvbjE6IEhUTUxFbGVtZW50O1xuXHRkZXNjcmlwdGlvbjI6IEhUTUxFbGVtZW50O1xuXHR3aWRnZXQ6IEhUTUxFbGVtZW50O1xuXHRyaWdodEFjdGlvbkJhcjogVG9vbEJhcjtcblx0aW5saW5lQWN0aW9uQmFyOiBUb29sQmFyO1xuXHRjaGVja0FsbDogVHJpU3RhdGVDaGVja2JveDtcblx0aW5wdXRDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRmaWx0ZXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRpbnB1dEJveDogUXVpY2tJbnB1dEJveDtcblx0dmlzaWJsZUNvdW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0dmlzaWJsZUNvdW50OiBDb3VudEJhZGdlO1xuXHRjb3VudENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNvdW50OiBDb3VudEJhZGdlO1xuXHRva0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdG9rOiBCdXR0b247XG5cdG1lc3NhZ2U6IEhUTUxFbGVtZW50O1xuXHRjdXN0b21CdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRjdXN0b21CdXR0b246IEJ1dHRvbjtcblx0cHJvZ3Jlc3NCYXI6IFByb2dyZXNzQmFyO1xuXHRsaXN0OiBRdWlja0lucHV0TGlzdDtcblx0dHJlZTogUXVpY2tJbnB1dFRyZWVDb250cm9sbGVyO1xuXHRyZWFkb25seSBvbkRpZEFjY2VwdDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkQ3VzdG9tOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyQnV0dG9uOiBFdmVudDxJUXVpY2tJbnB1dEJ1dHRvbj47XG5cdGlnbm9yZUZvY3VzT3V0OiBib29sZWFuO1xuXHRrZXlNb2RzOiBXcml0ZWFibGU8SUtleU1vZHM+O1xuXHRzaG93KGNvbnRyb2xsZXI6IFF1aWNrSW5wdXQpOiB2b2lkO1xuXHRzZXRWaXNpYmlsaXRpZXModmlzaWJpbGl0aWVzOiBWaXNpYmlsaXRpZXMpOiB2b2lkO1xuXHRzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXHRzZXRDb250ZXh0S2V5KGNvbnRleHRLZXk/OiBzdHJpbmcpOiB2b2lkO1xuXHRsaW5rT3BlbmVyRGVsZWdhdGUoY29udGVudDogc3RyaW5nKTogdm9pZDtcblx0aGlkZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgdHlwZSBWaXNpYmlsaXRpZXMgPSB7XG5cdHRpdGxlPzogYm9vbGVhbjtcblx0ZGVzY3JpcHRpb24/OiBib29sZWFuO1xuXHRjaGVja0FsbD86IGJvb2xlYW47XG5cdGlucHV0Qm94PzogYm9vbGVhbjtcblx0Y2hlY2tCb3g/OiBib29sZWFuO1xuXHR2aXNpYmxlQ291bnQ/OiBib29sZWFuO1xuXHRjb3VudD86IGJvb2xlYW47XG5cdG1lc3NhZ2U/OiBib29sZWFuO1xuXHRsaXN0PzogYm9vbGVhbjtcblx0dHJlZT86IGJvb2xlYW47XG5cdG9rPzogYm9vbGVhbjtcblx0Y3VzdG9tQnV0dG9uPzogYm9vbGVhbjtcblx0cHJvZ3Jlc3NCYXI/OiBib29sZWFuO1xufTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFF1aWNrSW5wdXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVF1aWNrSW5wdXQge1xuXHRwcm90ZWN0ZWQgc3RhdGljIHJlYWRvbmx5IG5vUHJvbXB0TWVzc2FnZSA9IGxvY2FsaXplKCdpbnB1dE1vZGVFbnRyeScsIFwiUHJlc3MgJ0VudGVyJyB0byBjb25maXJtIHlvdXIgaW5wdXQgb3IgJ0VzY2FwZScgdG8gY2FuY2VsXCIpO1xuXG5cdHByb3RlY3RlZCBfdmlzaWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndmlzaWJsZScsIGZhbHNlKTtcblx0cHJpdmF0ZSBfdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RlcHM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdG90YWxTdGVwczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lbmFibGVkID0gdHJ1ZTtcblx0cHJpdmF0ZSBfY29udGV4dEtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9idXN5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2lnbm9yZUZvY3VzT3V0ID0gZmFsc2U7XG5cdHByaXZhdGUgX2xlZnRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgX3JpZ2h0QnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtdO1xuXHRwcml2YXRlIF9pbmxpbmVCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgX2lucHV0QnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtdO1xuXHRwcml2YXRlIGJ1dHRvbnNVcGRhdGVkID0gZmFsc2U7XG5cdHByb3RlY3RlZCBub1ZhbGlkYXRpb25NZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBRdWlja0lucHV0Lm5vUHJvbXB0TWVzc2FnZTtcblx0cHJpdmF0ZSBfdmFsaWRhdGlvbk1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFZhbGlkYXRpb25NZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NldmVyaXR5OiBTZXZlcml0eSA9IFNldmVyaXR5Lklnbm9yZTtcblx0cHJpdmF0ZSBfbGFzdFNldmVyaXR5OiBTZXZlcml0eSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrSW5wdXRCdXR0b24+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkSGlkZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tJbnB1dEhpZGVFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25XaWxsSGlkZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tJbnB1dEhpZGVFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaXNwb3NlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB2aXNpYmxlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgYnVzeURlbGF5OiBUaW1lb3V0VGltZXIgfCB1bmRlZmluZWQ7XG5cblx0YWJzdHJhY3QgdHlwZTogUXVpY2tJbnB1dFR5cGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHVpOiBRdWlja0lucHV0VUlcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZS5nZXQoKTtcblx0fVxuXG5cdGdldCB0aXRsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGl0bGU7XG5cdH1cblxuXHRzZXQgdGl0bGUodGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3RpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBkZXNjcmlwdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVzY3JpcHRpb247XG5cdH1cblxuXHRzZXQgZGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBzdGVwKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdGVwcztcblx0fVxuXG5cdHNldCBzdGVwKHN0ZXA6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3N0ZXBzID0gc3RlcDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHRvdGFsU3RlcHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RvdGFsU3RlcHM7XG5cdH1cblxuXHRzZXQgdG90YWxTdGVwcyh0b3RhbFN0ZXBzOiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl90b3RhbFN0ZXBzID0gdG90YWxTdGVwcztcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGVuYWJsZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuYWJsZWQ7XG5cdH1cblxuXHRzZXQgZW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBjb250ZXh0S2V5KCkge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0S2V5O1xuXHR9XG5cblx0c2V0IGNvbnRleHRLZXkoY29udGV4dEtleTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY29udGV4dEtleSA9IGNvbnRleHRLZXk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBidXN5KCkge1xuXHRcdHJldHVybiB0aGlzLl9idXN5O1xuXHR9XG5cblx0c2V0IGJ1c3koYnVzeTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2J1c3kgPSBidXN5O1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgaWdub3JlRm9jdXNPdXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lnbm9yZUZvY3VzT3V0O1xuXHR9XG5cblx0c2V0IGlnbm9yZUZvY3VzT3V0KGlnbm9yZUZvY3VzT3V0OiBib29sZWFuKSB7XG5cdFx0Y29uc3Qgc2hvdWxkVXBkYXRlID0gdGhpcy5faWdub3JlRm9jdXNPdXQgIT09IGlnbm9yZUZvY3VzT3V0ICYmICFpc0lPUztcblx0XHR0aGlzLl9pZ25vcmVGb2N1c091dCA9IGlnbm9yZUZvY3VzT3V0ICYmICFpc0lPUztcblx0XHRpZiAoc2hvdWxkVXBkYXRlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgdGl0bGVCdXR0b25zKCkge1xuXHRcdHJldHVybiB0aGlzLl9sZWZ0QnV0dG9ucy5sZW5ndGhcblx0XHRcdD8gWy4uLnRoaXMuX2xlZnRCdXR0b25zLCB0aGlzLl9yaWdodEJ1dHRvbnNdXG5cdFx0XHQ6IHRoaXMuX3JpZ2h0QnV0dG9ucztcblx0fVxuXG5cdGdldCBidXR0b25zKCkge1xuXHRcdHJldHVybiBbXG5cdFx0XHQuLi50aGlzLl9sZWZ0QnV0dG9ucyxcblx0XHRcdC4uLnRoaXMuX3JpZ2h0QnV0dG9ucyxcblx0XHRcdC4uLnRoaXMuX2lubGluZUJ1dHRvbnMsXG5cdFx0XHQuLi50aGlzLl9pbnB1dEJ1dHRvbnNcblx0XHRdO1xuXHR9XG5cblx0c2V0IGJ1dHRvbnMoYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSkge1xuXHRcdGNvbnN0IGxlZnRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0Y29uc3QgcmlnaHRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0Y29uc3QgaW5saW5lQnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtdO1xuXHRcdGNvbnN0IGlucHV0QnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBidXR0b24gb2YgYnV0dG9ucykge1xuXHRcdFx0aWYgKGJ1dHRvbiA9PT0gYmFja0J1dHRvbikge1xuXHRcdFx0XHRsZWZ0QnV0dG9ucy5wdXNoKGJ1dHRvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzd2l0Y2ggKGJ1dHRvbi5sb2NhdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLklubGluZTpcblx0XHRcdFx0XHRcdGlubGluZUJ1dHRvbnMucHVzaChidXR0b24pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24uSW5wdXQ6XG5cdFx0XHRcdFx0XHRpbnB1dEJ1dHRvbnMucHVzaChidXR0b24pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJpZ2h0QnV0dG9ucy5wdXNoKGJ1dHRvbik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xlZnRCdXR0b25zID0gbGVmdEJ1dHRvbnM7XG5cdFx0dGhpcy5fcmlnaHRCdXR0b25zID0gcmlnaHRCdXR0b25zO1xuXHRcdHRoaXMuX2lubGluZUJ1dHRvbnMgPSBpbmxpbmVCdXR0b25zO1xuXHRcdHRoaXMuX2lucHV0QnV0dG9ucyA9IGlucHV0QnV0dG9ucztcblx0XHR0aGlzLmJ1dHRvbnNVcGRhdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHZhbGlkYXRpb25NZXNzYWdlKCkge1xuXHRcdHJldHVybiB0aGlzLl92YWxpZGF0aW9uTWVzc2FnZTtcblx0fVxuXG5cdHNldCB2YWxpZGF0aW9uTWVzc2FnZSh2YWxpZGF0aW9uTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2UgPSB2YWxpZGF0aW9uTWVzc2FnZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHNldmVyaXR5KCkge1xuXHRcdHJldHVybiB0aGlzLl9zZXZlcml0eTtcblx0fVxuXG5cdHNldCBzZXZlcml0eShzZXZlcml0eTogU2V2ZXJpdHkpIHtcblx0XHR0aGlzLl9zZXZlcml0eSA9IHNldmVyaXR5O1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJCdXR0b24gPSB0aGlzLm9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZXZlbnQ7XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZChcblx0XHRcdHRoaXMudWkub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmJ1dHRvbnMuaW5kZXhPZihidXR0b24pICE9PSAtMSkge1xuXHRcdFx0XHRcdHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5maXJlKGJ1dHRvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdCk7XG5cdFx0dGhpcy51aS5zaG93KHRoaXMpO1xuXG5cdFx0Ly8gdXBkYXRlIHByb3BlcnRpZXMgaW4gdGhlIGNvbnRyb2xsZXIgdGhhdCBnZXQgcmVzZXQgaW4gdGhlIHVpLnNob3coKSBjYWxsXG5cdFx0dGhpcy5fdmlzaWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHQvLyBUaGlzIGVuc3VyZXMgdGhlIG1lc3NhZ2UvcHJvbXB0IGdldHMgcmVuZGVyZWRcblx0XHR0aGlzLl9sYXN0VmFsaWRhdGlvbk1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0Ly8gVGhpcyBlbnN1cmVzIHRoZSBpbnB1dCBib3ggaGFzIHRoZSByaWdodCBzZXZlcml0eSBhcHBsaWVkXG5cdFx0dGhpcy5fbGFzdFNldmVyaXR5ID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmJ1dHRvbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyBpZiB0aGVyZSBhcmUgYnV0dG9ucywgdGhlIHVpLnNob3coKSBjbGVhcnMgdGhlbSBvdXQgb2YgdGhlIFVJIHNvIHdlIHNob3VsZFxuXHRcdFx0Ly8gcmVyZW5kZXIgdGhlbS5cblx0XHRcdHRoaXMuYnV0dG9uc1VwZGF0ZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudWkuaGlkZSgpO1xuXHR9XG5cblx0ZGlkSGlkZShyZWFzb24gPSBRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5vbkRpZEhpZGVFbWl0dGVyLmZpcmUoeyByZWFzb24gfSk7XG5cdH1cblxuXHRyZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLm9uRGlkSGlkZUVtaXR0ZXIuZXZlbnQ7XG5cblx0d2lsbEhpZGUocmVhc29uID0gUXVpY2tJbnB1dEhpZGVSZWFzb24uT3RoZXIpOiB2b2lkIHtcblx0XHR0aGlzLm9uV2lsbEhpZGVFbWl0dGVyLmZpcmUoeyByZWFzb24gfSk7XG5cdH1cblx0cmVhZG9ubHkgb25XaWxsSGlkZSA9IHRoaXMub25XaWxsSGlkZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHVwZGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZ2V0VGl0bGUoKTtcblx0XHRpZiAodGl0bGUgJiYgdGhpcy51aS50aXRsZS50ZXh0Q29udGVudCAhPT0gdGl0bGUpIHtcblx0XHRcdHRoaXMudWkudGl0bGUudGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHR9IGVsc2UgaWYgKCF0aXRsZSAmJiB0aGlzLnVpLnRpdGxlLmlubmVySFRNTCAhPT0gJyZuYnNwOycpIHtcblx0XHRcdHRoaXMudWkudGl0bGUuaW5uZXJUZXh0ID0gJ1xcdTAwYTAnO1xuXHRcdH1cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuZ2V0RGVzY3JpcHRpb24oKTtcblx0XHRpZiAodGhpcy51aS5kZXNjcmlwdGlvbjEudGV4dENvbnRlbnQgIT09IGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLnVpLmRlc2NyaXB0aW9uMS50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHRpZiAodGhpcy51aS5kZXNjcmlwdGlvbjIudGV4dENvbnRlbnQgIT09IGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLnVpLmRlc2NyaXB0aW9uMi50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHRpZiAodGhpcy5idXN5ICYmICF0aGlzLmJ1c3lEZWxheSkge1xuXHRcdFx0dGhpcy5idXN5RGVsYXkgPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cdFx0XHR0aGlzLmJ1c3lEZWxheS5zZXRJZk5vdFNldCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnVpLnByb2dyZXNzQmFyLmluZmluaXRlKCk7XG5cdFx0XHRcdFx0dGhpcy51aS5wcm9ncmVzc0Jhci5nZXRDb250YWluZXIoKS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDgwMCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5idXN5ICYmIHRoaXMuYnVzeURlbGF5KSB7XG5cdFx0XHR0aGlzLnVpLnByb2dyZXNzQmFyLnN0b3AoKTtcblx0XHRcdHRoaXMudWkucHJvZ3Jlc3NCYXIuZ2V0Q29udGFpbmVyKCkuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHR0aGlzLmJ1c3lEZWxheS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuYnVzeURlbGF5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5idXR0b25zVXBkYXRlZCkge1xuXHRcdFx0dGhpcy5idXR0b25zVXBkYXRlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgbGVmdEFjdGlvbnMgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKFxuXHRcdFx0XHR0aGlzLl9sZWZ0QnV0dG9ucyxcblx0XHRcdFx0J2xlZnQtYnV0dG9uJyxcblx0XHRcdFx0KGJ1dHRvbikgPT4gdGhpcy5vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyLmZpcmUoYnV0dG9uKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMudWkubGVmdEFjdGlvbkJhci5zZXRBY3Rpb25zKGxlZnRBY3Rpb25zLnByaW1hcnksIGxlZnRBY3Rpb25zLnNlY29uZGFyeSk7XG5cdFx0XHRjb25zdCByaWdodEFjdGlvbnMgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKFxuXHRcdFx0XHR0aGlzLl9yaWdodEJ1dHRvbnMsXG5cdFx0XHRcdCdyaWdodC1idXR0b24nLFxuXHRcdFx0XHQoYnV0dG9uKSA9PiB0aGlzLm9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZmlyZShidXR0b24pXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy51aS5yaWdodEFjdGlvbkJhci5zZXRBY3Rpb25zKHJpZ2h0QWN0aW9ucy5wcmltYXJ5LCByaWdodEFjdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHRcdGNvbnN0IGlubGluZUFjdGlvbnMgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKFxuXHRcdFx0XHR0aGlzLl9pbmxpbmVCdXR0b25zLFxuXHRcdFx0XHQnaW5saW5lLWJ1dHRvbicsXG5cdFx0XHRcdChidXR0b24pID0+IHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5maXJlKGJ1dHRvbilcblx0XHRcdCk7XG5cdFx0XHR0aGlzLnVpLmlubGluZUFjdGlvbkJhci5zZXRBY3Rpb25zKGlubGluZUFjdGlvbnMucHJpbWFyeSwgaW5saW5lQWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdFx0Ly8gQWRqdXN0IGNvdW50IGJhZGdlIHBvc2l0aW9uIGJhc2VkIG9uIGlucHV0IGJ1dHRvbnMgKGVhY2ggYnV0dG9uL3RvZ2dsZSBpcyB+MjJweCB3aWRlKVxuXHRcdFx0Y29uc3QgaW5wdXRCdXR0b25PZmZzZXQgPSB0aGlzLl9pbnB1dEJ1dHRvbnMubGVuZ3RoICogMjI7XG5cdFx0XHR0aGlzLnVpLmNvdW50Q29udGFpbmVyLnN0eWxlLnJpZ2h0ID0gaW5wdXRCdXR0b25PZmZzZXQgPiAwID8gYCR7NCArIGlucHV0QnV0dG9uT2Zmc2V0fXB4YCA6ICc0cHgnO1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5hY3Rpb25zID0gdGhpcy5faW5wdXRCdXR0b25zXG5cdFx0XHRcdC5tYXAoKGJ1dHRvbiwgaW5kZXgpID0+IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihcblx0XHRcdFx0XHRidXR0b24sXG5cdFx0XHRcdFx0YGlkLSR7aW5kZXh9YCxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB0aGlzLm9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZmlyZShidXR0b24pXG5cdFx0XHRcdCkpO1xuXHRcdH1cblx0XHR0aGlzLnVpLmlnbm9yZUZvY3VzT3V0ID0gdGhpcy5pZ25vcmVGb2N1c091dDtcblx0XHR0aGlzLnVpLnNldEVuYWJsZWQodGhpcy5lbmFibGVkKTtcblx0XHR0aGlzLnVpLnNldENvbnRleHRLZXkodGhpcy5jb250ZXh0S2V5KTtcblxuXHRcdGNvbnN0IHZhbGlkYXRpb25NZXNzYWdlID0gdGhpcy52YWxpZGF0aW9uTWVzc2FnZSB8fCB0aGlzLm5vVmFsaWRhdGlvbk1lc3NhZ2U7XG5cdFx0aWYgKHRoaXMuX2xhc3RWYWxpZGF0aW9uTWVzc2FnZSAhPT0gdmFsaWRhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuX2xhc3RWYWxpZGF0aW9uTWVzc2FnZSA9IHZhbGlkYXRpb25NZXNzYWdlO1xuXHRcdFx0ZG9tLnJlc2V0KHRoaXMudWkubWVzc2FnZSk7XG5cdFx0XHRpZiAodmFsaWRhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0cmVuZGVyUXVpY2tJbnB1dERlc2NyaXB0aW9uKHZhbGlkYXRpb25NZXNzYWdlLCB0aGlzLnVpLm1lc3NhZ2UsIHtcblx0XHRcdFx0XHRjYWxsYmFjazogKGNvbnRlbnQpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMudWkubGlua09wZW5lckRlbGVnYXRlKGNvbnRlbnQpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXM6IHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xhc3RTZXZlcml0eSAhPT0gdGhpcy5zZXZlcml0eSkge1xuXHRcdFx0dGhpcy5fbGFzdFNldmVyaXR5ID0gdGhpcy5zZXZlcml0eTtcblx0XHRcdHRoaXMuc2hvd01lc3NhZ2VEZWNvcmF0aW9uKHRoaXMuc2V2ZXJpdHkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VGl0bGUoKSB7XG5cdFx0aWYgKHRoaXMudGl0bGUgJiYgdGhpcy5zdGVwKSB7XG5cdFx0XHRyZXR1cm4gYCR7dGhpcy50aXRsZX0gKCR7dGhpcy5nZXRTdGVwcygpfSlgO1xuXHRcdH1cblx0XHRpZiAodGhpcy50aXRsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudGl0bGU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0ZXApIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFN0ZXBzKCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVzY3JpcHRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGVzY3JpcHRpb24gfHwgJyc7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0ZXBzKCkge1xuXHRcdGlmICh0aGlzLnN0ZXAgJiYgdGhpcy50b3RhbFN0ZXBzKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3F1aWNrSW5wdXQuc3RlcHMnLCBcInswfS97MX1cIiwgdGhpcy5zdGVwLCB0aGlzLnRvdGFsU3RlcHMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zdGVwKSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuc3RlcCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBzaG93TWVzc2FnZURlY29yYXRpb24oc2V2ZXJpdHk6IFNldmVyaXR5KSB7XG5cdFx0dGhpcy51aS5pbnB1dEJveC5zaG93RGVjb3JhdGlvbihzZXZlcml0eSk7XG5cdFx0aWYgKHNldmVyaXR5ICE9PSBTZXZlcml0eS5JZ25vcmUpIHtcblx0XHRcdGNvbnN0IHN0eWxlcyA9IHRoaXMudWkuaW5wdXRCb3guc3R5bGVzRm9yVHlwZShzZXZlcml0eSk7XG5cdFx0XHR0aGlzLnVpLm1lc3NhZ2Uuc3R5bGUuY29sb3IgPSBzdHlsZXMuZm9yZWdyb3VuZCA/IGAke3N0eWxlcy5mb3JlZ3JvdW5kfWAgOiAnJztcblx0XHRcdHRoaXMudWkubWVzc2FnZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBzdHlsZXMuYmFja2dyb3VuZCA/IGAke3N0eWxlcy5iYWNrZ3JvdW5kfWAgOiAnJztcblx0XHRcdHRoaXMudWkubWVzc2FnZS5zdHlsZS5ib3JkZXIgPSBzdHlsZXMuYm9yZGVyID8gYDFweCBzb2xpZCAke3N0eWxlcy5ib3JkZXJ9YCA6ICcnO1xuXHRcdFx0dGhpcy51aS5tZXNzYWdlLnN0eWxlLm1hcmdpbkJvdHRvbSA9ICctMnB4Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51aS5tZXNzYWdlLnN0eWxlLmNvbG9yID0gJyc7XG5cdFx0XHR0aGlzLnVpLm1lc3NhZ2Uuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyc7XG5cdFx0XHR0aGlzLnVpLm1lc3NhZ2Uuc3R5bGUuYm9yZGVyID0gJyc7XG5cdFx0XHR0aGlzLnVpLm1lc3NhZ2Uuc3R5bGUubWFyZ2luQm90dG9tID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cmVhZG9ubHkgb25EaXNwb3NlID0gdGhpcy5vbkRpc3Bvc2VFbWl0dGVyLmV2ZW50O1xuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdFx0dGhpcy5vbkRpc3Bvc2VFbWl0dGVyLmZpcmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tQaWNrPFQgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSwgTyBleHRlbmRzIHsgdXNlU2VwYXJhdG9yczogYm9vbGVhbiB9ID0geyB1c2VTZXBhcmF0b3JzOiBmYWxzZSB9PiBleHRlbmRzIFF1aWNrSW5wdXQgaW1wbGVtZW50cyBJUXVpY2tQaWNrPFQsIE8+IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX0FSSUFfTEFCRUwgPSBsb2NhbGl6ZSgncXVpY2tJbnB1dEJveC5hcmlhTGFiZWwnLCBcIlR5cGUgdG8gbmFycm93IGRvd24gcmVzdWx0cy5cIik7XG5cblx0cHJpdmF0ZSBfdmFsdWUgPSAnJztcblx0cHJpdmF0ZSBfYXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uV2lsbEFjY2VwdEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrV2lsbEFjY2VwdEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZEFjY2VwdEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ3VzdG9tRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF9pdGVtczogTyBleHRlbmRzIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9ID8gQXJyYXk8VCB8IElRdWlja1BpY2tTZXBhcmF0b3I+IDogQXJyYXk8VD4gPSBbXTtcblx0cHJpdmF0ZSBpdGVtc1VwZGF0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRwcml2YXRlIF9jYW5BY2NlcHRJbkJhY2tncm91bmQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbWF0Y2hPbkRlc2NyaXB0aW9uID0gZmFsc2U7XG5cdHByaXZhdGUgX21hdGNoT25EZXRhaWwgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbWF0Y2hPbkxhYmVsID0gdHJ1ZTtcblx0cHJpdmF0ZSBfbWF0Y2hPbkxhYmVsTW9kZTogJ2Z1enp5JyB8ICdjb250aWd1b3VzJyA9ICdmdXp6eSc7XG5cdHByaXZhdGUgX3NvcnRCeUxhYmVsID0gdHJ1ZTtcblx0cHJpdmF0ZSBfa2VlcFNjcm9sbFBvc2l0aW9uID0gZmFsc2U7XG5cdHByaXZhdGUgX2l0ZW1BY3RpdmF0aW9uID0gSXRlbUFjdGl2YXRpb24uRklSU1Q7XG5cdHByaXZhdGUgX2FjdGl2ZUl0ZW1zOiBUW10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVJdGVtc1VwZGF0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBhY3RpdmVJdGVtc1RvQ29uZmlybTogVFtdIHwgbnVsbCA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRbXT4oKSk7XG5cdHByaXZhdGUgX3NlbGVjdGVkSXRlbXM6IFRbXSA9IFtdO1xuXHRwcml2YXRlIHNlbGVjdGVkSXRlbXNVcGRhdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgc2VsZWN0ZWRJdGVtc1RvQ29uZmlybTogVFtdIHwgbnVsbCA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRbXT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRUcmlnZ2VySXRlbUJ1dHRvbkVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PFQ+PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b25FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrUGlja1NlcGFyYXRvckJ1dHRvbkV2ZW50PigpKTtcblx0cHJpdmF0ZSBfdmFsdWVTZWxlY3Rpb246IFJlYWRvbmx5PFtudW1iZXIsIG51bWJlcl0+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZhbHVlU2VsZWN0aW9uVXBkYXRlZCA9IHRydWU7XG5cdHByaXZhdGUgX29rOiBib29sZWFuIHwgJ2RlZmF1bHQnID0gJ2RlZmF1bHQnO1xuXHRwcml2YXRlIF9va0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1c3RvbUJ1dHRvbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9jdXN0b21CdXR0b25MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXN0b21CdXR0b25Ib3Zlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXN0b21CdXR0b25TZWNvbmRhcnkgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcXVpY2tOYXZpZ2F0ZTogSVF1aWNrTmF2aWdhdGVDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oaWRlSW5wdXQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hpZGVDb3VudEJhZGdlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oaWRlQ2hlY2tBbGw6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZvY3VzRXZlbnRCdWZmZXJlciA9IG5ldyBFdmVudEJ1ZmZlcmVyKCk7XG5cblx0cmVhZG9ubHkgdHlwZSA9IFF1aWNrSW5wdXRUeXBlLlF1aWNrUGljaztcblxuXHRjb25zdHJ1Y3Rvcih1aTogUXVpY2tJbnB1dFVJKSB7XG5cdFx0c3VwZXIodWkpO1xuXHRcdHRoaXMubm9WYWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBxdWlja05hdmlnYXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9xdWlja05hdmlnYXRlO1xuXHR9XG5cblx0c2V0IHF1aWNrTmF2aWdhdGUocXVpY2tOYXZpZ2F0ZTogSVF1aWNrTmF2aWdhdGVDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fcXVpY2tOYXZpZ2F0ZSA9IHF1aWNrTmF2aWdhdGU7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCB2YWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdH1cblxuXHRzZXQgdmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuZG9TZXRWYWx1ZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0VmFsdWUodmFsdWU6IHN0cmluZywgc2tpcFVwZGF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmFsdWUgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0aWYgKCFza2lwVXBkYXRlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdGNvbnN0IGRpZEZpbHRlciA9IHRoaXMudWkubGlzdC5maWx0ZXIodGhpcy5maWx0ZXJWYWx1ZSh0aGlzLl92YWx1ZSkpO1xuXHRcdFx0XHRpZiAoZGlkRmlsdGVyKSB7XG5cdFx0XHRcdFx0dGhpcy50cnlTZWxlY3RGaXJzdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlVmFsdWVFbWl0dGVyLmZpcmUodGhpcy5fdmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdGZpbHRlclZhbHVlID0gKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlO1xuXG5cdHNldCBhcmlhTGFiZWwoYXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyaWFMYWJlbDtcblx0fVxuXG5cdGdldCBwbGFjZWhvbGRlcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fcGxhY2Vob2xkZXI7XG5cdH1cblxuXHRzZXQgcGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBwcm9tcHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9WYWxpZGF0aW9uTWVzc2FnZTtcblx0fVxuXG5cdHNldCBwcm9tcHQocHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLm5vVmFsaWRhdGlvbk1lc3NhZ2UgPSBwcm9tcHQ7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdG9uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLm9uRGlkQ2hhbmdlVmFsdWVFbWl0dGVyLmV2ZW50O1xuXG5cdG9uV2lsbEFjY2VwdCA9IHRoaXMub25XaWxsQWNjZXB0RW1pdHRlci5ldmVudDtcblx0b25EaWRBY2NlcHQgPSB0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5ldmVudDtcblxuXHRvbkRpZEN1c3RvbSA9IHRoaXMub25EaWRDdXN0b21FbWl0dGVyLmV2ZW50O1xuXG5cdGdldCBpdGVtcygpIHtcblx0XHRyZXR1cm4gdGhpcy5faXRlbXM7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCkge1xuXHRcdHJldHVybiB0aGlzLnVpLmxpc3Quc2Nyb2xsVG9wO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgc2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy51aS5saXN0LnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0fVxuXG5cdHNldCBpdGVtcyhpdGVtczogTyBleHRlbmRzIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9ID8gQXJyYXk8VCB8IElRdWlja1BpY2tTZXBhcmF0b3I+IDogQXJyYXk8VD4pIHtcblx0XHR0aGlzLl9pdGVtcyA9IGl0ZW1zO1xuXHRcdHRoaXMuaXRlbXNVcGRhdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGNhblNlbGVjdE1hbnkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhblNlbGVjdE1hbnk7XG5cdH1cblxuXHRzZXQgY2FuU2VsZWN0TWFueShjYW5TZWxlY3RNYW55OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY2FuU2VsZWN0TWFueSA9IGNhblNlbGVjdE1hbnk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBjYW5BY2NlcHRJbkJhY2tncm91bmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbkFjY2VwdEluQmFja2dyb3VuZDtcblx0fVxuXG5cdHNldCBjYW5BY2NlcHRJbkJhY2tncm91bmQoY2FuQWNjZXB0SW5CYWNrZ3JvdW5kOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY2FuQWNjZXB0SW5CYWNrZ3JvdW5kID0gY2FuQWNjZXB0SW5CYWNrZ3JvdW5kO1xuXHR9XG5cblx0Z2V0IG1hdGNoT25EZXNjcmlwdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkRlc2NyaXB0aW9uO1xuXHR9XG5cblx0c2V0IG1hdGNoT25EZXNjcmlwdGlvbihtYXRjaE9uRGVzY3JpcHRpb246IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9tYXRjaE9uRGVzY3JpcHRpb24gPSBtYXRjaE9uRGVzY3JpcHRpb247XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBtYXRjaE9uRGV0YWlsKCkge1xuXHRcdHJldHVybiB0aGlzLl9tYXRjaE9uRGV0YWlsO1xuXHR9XG5cblx0c2V0IG1hdGNoT25EZXRhaWwobWF0Y2hPbkRldGFpbDogYm9vbGVhbikge1xuXHRcdHRoaXMuX21hdGNoT25EZXRhaWwgPSBtYXRjaE9uRGV0YWlsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgbWF0Y2hPbkxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9tYXRjaE9uTGFiZWw7XG5cdH1cblxuXHRzZXQgbWF0Y2hPbkxhYmVsKG1hdGNoT25MYWJlbDogYm9vbGVhbikge1xuXHRcdHRoaXMuX21hdGNoT25MYWJlbCA9IG1hdGNoT25MYWJlbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IG1hdGNoT25MYWJlbE1vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoT25MYWJlbE1vZGU7XG5cdH1cblxuXHRzZXQgbWF0Y2hPbkxhYmVsTW9kZShtYXRjaE9uTGFiZWxNb2RlOiAnZnV6enknIHwgJ2NvbnRpZ3VvdXMnKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbkxhYmVsTW9kZSA9IG1hdGNoT25MYWJlbE1vZGU7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBzb3J0QnlMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc29ydEJ5TGFiZWw7XG5cdH1cblxuXHRzZXQgc29ydEJ5TGFiZWwoc29ydEJ5TGFiZWw6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zb3J0QnlMYWJlbCA9IHNvcnRCeUxhYmVsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQga2VlcFNjcm9sbFBvc2l0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9rZWVwU2Nyb2xsUG9zaXRpb247XG5cdH1cblxuXHRzZXQga2VlcFNjcm9sbFBvc2l0aW9uKGtlZXBTY3JvbGxQb3NpdGlvbjogYm9vbGVhbikge1xuXHRcdHRoaXMuX2tlZXBTY3JvbGxQb3NpdGlvbiA9IGtlZXBTY3JvbGxQb3NpdGlvbjtcblx0fVxuXG5cdGdldCBpdGVtQWN0aXZhdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5faXRlbUFjdGl2YXRpb247XG5cdH1cblxuXHRzZXQgaXRlbUFjdGl2YXRpb24oaXRlbUFjdGl2YXRpb246IEl0ZW1BY3RpdmF0aW9uKSB7XG5cdFx0dGhpcy5faXRlbUFjdGl2YXRpb24gPSBpdGVtQWN0aXZhdGlvbjtcblx0fVxuXG5cdGdldCBhY3RpdmVJdGVtcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlSXRlbXM7XG5cdH1cblxuXHRzZXQgYWN0aXZlSXRlbXMoYWN0aXZlSXRlbXM6IFRbXSkge1xuXHRcdHRoaXMuX2FjdGl2ZUl0ZW1zID0gYWN0aXZlSXRlbXM7XG5cdFx0dGhpcy5hY3RpdmVJdGVtc1VwZGF0ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRvbkRpZENoYW5nZUFjdGl2ZSA9IHRoaXMub25EaWRDaGFuZ2VBY3RpdmVFbWl0dGVyLmV2ZW50O1xuXG5cdGdldCBzZWxlY3RlZEl0ZW1zKCkge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZEl0ZW1zO1xuXHR9XG5cblx0c2V0IHNlbGVjdGVkSXRlbXMoc2VsZWN0ZWRJdGVtczogVFtdKSB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IHNlbGVjdGVkSXRlbXM7XG5cdFx0dGhpcy5zZWxlY3RlZEl0ZW1zVXBkYXRlZCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBrZXlNb2RzKCkge1xuXHRcdGlmICh0aGlzLl9xdWlja05hdmlnYXRlKSB7XG5cdFx0XHQvLyBEaXNhYmxlIGtleU1vZHMgd2hlbiBxdWljayBuYXZpZ2F0ZSBpcyBlbmFibGVkXG5cdFx0XHQvLyBiZWNhdXNlIGluIHRoaXMgbW9kZWwgdGhlIGludGVyYWN0aW9uIGlzIHB1cmVseVxuXHRcdFx0Ly8ga2V5Ym9hcmQgZHJpdmVuIGFuZCBDdHJsL0FsdCBhcmUgdHlwaWNhbGx5XG5cdFx0XHQvLyBwcmVzc2VkIGFuZCBob2xkIGR1cmluZyB0aGlzIGludGVyYWN0aW9uLlxuXHRcdFx0cmV0dXJuIE5PX0tFWV9NT0RTO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy51aS5rZXlNb2RzO1xuXHR9XG5cblx0Z2V0IHZhbHVlU2VsZWN0aW9uKCkge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMudWkuaW5wdXRCb3guZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBbc2VsZWN0aW9uLnN0YXJ0LCBzZWxlY3Rpb24uZW5kXTtcblx0fVxuXG5cdHNldCB2YWx1ZVNlbGVjdGlvbih2YWx1ZVNlbGVjdGlvbjogUmVhZG9ubHk8W251bWJlciwgbnVtYmVyXT4gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl92YWx1ZVNlbGVjdGlvbiA9IHZhbHVlU2VsZWN0aW9uO1xuXHRcdHRoaXMudmFsdWVTZWxlY3Rpb25VcGRhdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbUJ1dHRvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tQnV0dG9uO1xuXHR9XG5cblx0c2V0IGN1c3RvbUJ1dHRvbihzaG93Q3VzdG9tQnV0dG9uOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY3VzdG9tQnV0dG9uID0gc2hvd0N1c3RvbUJ1dHRvbjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21CdXR0b25MYWJlbDtcblx0fVxuXG5cdHNldCBjdXN0b21MYWJlbChsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY3VzdG9tQnV0dG9uTGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbUhvdmVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21CdXR0b25Ib3Zlcjtcblx0fVxuXG5cdHNldCBjdXN0b21Ib3Zlcihob3Zlcjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY3VzdG9tQnV0dG9uSG92ZXIgPSBob3Zlcjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbUJ1dHRvblNlY29uZGFyeSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tQnV0dG9uU2Vjb25kYXJ5O1xuXHR9XG5cblx0c2V0IGN1c3RvbUJ1dHRvblNlY29uZGFyeShzZWNvbmRhcnk6IGJvb2xlYW4gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jdXN0b21CdXR0b25TZWNvbmRhcnkgPSBzZWNvbmRhcnkgPz8gZmFsc2U7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBvaygpIHtcblx0XHRyZXR1cm4gdGhpcy5fb2s7XG5cdH1cblxuXHRzZXQgb2soc2hvd09rQnV0dG9uOiBib29sZWFuIHwgJ2RlZmF1bHQnKSB7XG5cdFx0dGhpcy5fb2sgPSBzaG93T2tCdXR0b247XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBva0xhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9va0xhYmVsID8/IGxvY2FsaXplKCdvaycsIFwiT0tcIik7XG5cdH1cblxuXHRzZXQgb2tMYWJlbChva0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9va0xhYmVsID0gb2tMYWJlbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0aW5wdXRIYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aXNpYmxlID8gdGhpcy51aS5pbnB1dEJveC5oYXNGb2N1cygpIDogZmFsc2U7XG5cdH1cblxuXHRmb2N1c09uSW5wdXQoKSB7XG5cdFx0dGhpcy51aS5pbnB1dEJveC5zZXRGb2N1cygpO1xuXHR9XG5cblx0Z2V0IGhpZGVJbnB1dCgpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9oaWRlSW5wdXQ7XG5cdH1cblxuXHRzZXQgaGlkZUlucHV0KGhpZGVJbnB1dDogYm9vbGVhbikge1xuXHRcdHRoaXMuX2hpZGVJbnB1dCA9IGhpZGVJbnB1dDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGhpZGVDb3VudEJhZGdlKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2hpZGVDb3VudEJhZGdlO1xuXHR9XG5cblx0c2V0IGhpZGVDb3VudEJhZGdlKGhpZGVDb3VudEJhZGdlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5faGlkZUNvdW50QmFkZ2UgPSBoaWRlQ291bnRCYWRnZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGhpZGVDaGVja0FsbCgpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9oaWRlQ2hlY2tBbGw7XG5cdH1cblxuXHRzZXQgaGlkZUNoZWNrQWxsKGhpZGVDaGVja0FsbDogYm9vbGVhbikge1xuXHRcdHRoaXMuX2hpZGVDaGVja0FsbCA9IGhpZGVDaGVja0FsbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0b25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5ldmVudDtcblxuXHRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uID0gdGhpcy5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uRW1pdHRlci5ldmVudDtcblxuXHRvbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24gPSB0aGlzLm9uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbkVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSB0cnlTZWxlY3RGaXJzdCgpIHtcblx0XHRpZiAoIXRoaXMuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0dGhpcy51aS5saXN0LmZvY3VzKFF1aWNrUGlja0ZvY3VzLkZpcnN0KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzaG93KCkge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRcdHRoaXMudWkuaW5wdXRCb3gub25EaWRDaGFuZ2UodmFsdWUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuZG9TZXRWYWx1ZSh2YWx1ZSwgdHJ1ZSAvKiBza2lwIHVwZGF0ZSBzaW5jZSB0aGlzIG9yaWdpbmF0ZXMgZnJvbSB0aGUgVUkgKi8pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQodGhpcy51aS5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0XHQvLyBpZiB0aGVyZSBhcmUgbm8gY2hlY2tlZCBlbGVtZW50cywgaXQgbWVhbnMgdGhhdCBhbiBvbkRpZENoYW5nZVNlbGVjdGlvbiBuZXZlciBmaXJlZCB0byBvdmVyd3JpdGVcblx0XHRcdFx0XHQvLyBgX3NlbGVjdGVkSXRlbXNgLiBJbiB0aGF0IGNhc2UsIHdlIHNob3VsZCBlbWl0IG9uZSB3aXRoIGFuIGVtcHR5IGFycmF5IHRvIGVuc3VyZSB0aGF0XG5cdFx0XHRcdFx0Ly8gYC5zZWxlY3RlZEl0ZW1zYCBpcyB1cCB0byBkYXRlLlxuXHRcdFx0XHRcdGlmICghdGhpcy51aS5saXN0LmdldENoZWNrZWRFbGVtZW50cygpLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IFtdO1xuXHRcdFx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZVNlbGVjdGlvbkVtaXR0ZXIuZmlyZSh0aGlzLnNlbGVjdGVkSXRlbXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmFjdGl2ZUl0ZW1zWzBdKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIHNpbmdsZS1zZWxlY3QsIHdlIHNldCBgc2VsZWN0ZWRJdGVtc2AgdG8gdGhlIGl0ZW0gdGhhdCB3YXMgYWNjZXB0ZWQuXG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IFt0aGlzLmFjdGl2ZUl0ZW1zWzBdXTtcblx0XHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5maXJlKHRoaXMuc2VsZWN0ZWRJdGVtcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5oYW5kbGVBY2NlcHQoZmFsc2UpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudWkub25EaWRDdXN0b20oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ3VzdG9tRW1pdHRlci5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fZm9jdXNFdmVudEJ1ZmZlcmVyLndyYXBFdmVudChcblx0XHRcdFx0dGhpcy51aS5saXN0Lm9uRGlkQ2hhbmdlRm9jdXMsXG5cdFx0XHRcdC8vIE9ubHkgZmlyZSB0aGUgbGFzdCBldmVudFxuXHRcdFx0XHQoXywgZSkgPT4gZVxuXHRcdFx0KShmb2N1c2VkSXRlbXMgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5hY3RpdmVJdGVtc1VwZGF0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIEV4cGVjdCBhbm90aGVyIGV2ZW50LlxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmFjdGl2ZUl0ZW1zVG9Db25maXJtICE9PSB0aGlzLl9hY3RpdmVJdGVtcyAmJiBlcXVhbHMoZm9jdXNlZEl0ZW1zLCB0aGlzLl9hY3RpdmVJdGVtcywgKGEsIGIpID0+IGEgPT09IGIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUl0ZW1zID0gZm9jdXNlZEl0ZW1zIGFzIFRbXTtcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUFjdGl2ZUVtaXR0ZXIuZmlyZShmb2N1c2VkSXRlbXMgYXMgVFtdKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnVpLmxpc3Qub25EaWRDaGFuZ2VTZWxlY3Rpb24oKHsgaXRlbXM6IHNlbGVjdGVkSXRlbXMsIGV2ZW50IH0pID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FuU2VsZWN0TWFueSAmJiAhc2VsZWN0ZWRJdGVtcy5zb21lKGkgPT4gaS5waWNrYWJsZSA9PT0gZmFsc2UpKSB7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVpLmxpc3Quc2V0U2VsZWN0ZWRFbGVtZW50cyhbXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zZWxlY3RlZEl0ZW1zVG9Db25maXJtICE9PSB0aGlzLl9zZWxlY3RlZEl0ZW1zICYmIGVxdWFscyhzZWxlY3RlZEl0ZW1zLCB0aGlzLl9zZWxlY3RlZEl0ZW1zLCAoYSwgYikgPT4gYSA9PT0gYikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IHNlbGVjdGVkSXRlbXMgYXMgVFtdO1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5maXJlKHNlbGVjdGVkSXRlbXMgYXMgVFtdKTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVBY2NlcHQoZG9tLmlzTW91c2VFdmVudChldmVudCkgJiYgZXZlbnQuYnV0dG9uID09PSAxIC8qIG1vdXNlIG1pZGRsZSBjbGljayAqLyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnVpLmxpc3Qub25DaGFuZ2VkQ2hlY2tlZEVsZW1lbnRzKGNoZWNrZWRJdGVtcyA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5jYW5TZWxlY3RNYW55IHx8ICF0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuc2VsZWN0ZWRJdGVtc1RvQ29uZmlybSAhPT0gdGhpcy5fc2VsZWN0ZWRJdGVtcyAmJiBlcXVhbHMoY2hlY2tlZEl0ZW1zLCB0aGlzLl9zZWxlY3RlZEl0ZW1zLCAoYSwgYikgPT4gYSA9PT0gYikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IGNoZWNrZWRJdGVtcyBhcyBUW107XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmZpcmUoY2hlY2tlZEl0ZW1zIGFzIFRbXSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQodGhpcy51aS5saXN0Lm9uQnV0dG9uVHJpZ2dlcmVkKGV2ZW50ID0+IHRoaXMub25EaWRUcmlnZ2VySXRlbUJ1dHRvbkVtaXR0ZXIuZmlyZShldmVudCBhcyBJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PFQ+KSkpO1xuXHRcdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudWkubGlzdC5vblNlcGFyYXRvckJ1dHRvblRyaWdnZXJlZChldmVudCA9PiB0aGlzLm9uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbkVtaXR0ZXIuZmlyZShldmVudCkpKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnJlZ2lzdGVyUXVpY2tOYXZpZ2F0aW9uKCkpO1xuXHRcdFx0dGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRzdXBlci5zaG93KCk7IC8vIFRPRE86IFdoeSBoYXZlIHNob3coKSBidWJibGUgdXAgd2hpbGUgdXBkYXRlKCkgdHJpY2tsZXMgZG93bj9cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQWNjZXB0KGluQmFja2dyb3VuZDogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Ly8gRmlndXJlIG91dCB2ZXRvIHZpYSBgb25XaWxsQWNjZXB0YCBldmVudFxuXHRcdGxldCB2ZXRvID0gZmFsc2U7XG5cdFx0dGhpcy5vbldpbGxBY2NlcHRFbWl0dGVyLmZpcmUoeyB2ZXRvOiAoKSA9PiB2ZXRvID0gdHJ1ZSB9KTtcblxuXHRcdC8vIENvbnRpbnVlIHdpdGggYG9uRGlkQWNjZXB0YCBpZiBubyB2ZXRvXG5cdFx0aWYgKCF2ZXRvKSB7XG5cdFx0XHR0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5maXJlKHsgaW5CYWNrZ3JvdW5kIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJRdWlja05hdmlnYXRpb24oKSB7XG5cdFx0cmV0dXJuIGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy51aS5jb250YWluZXIsIGRvbS5FdmVudFR5cGUuS0VZX1VQLCBlID0+IHtcblx0XHRcdGlmICh0aGlzLmNhblNlbGVjdE1hbnkgfHwgIXRoaXMuX3F1aWNrTmF2aWdhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50OiBTdGFuZGFyZEtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0Y29uc3Qga2V5Q29kZSA9IGtleWJvYXJkRXZlbnQua2V5Q29kZTtcblxuXHRcdFx0Ly8gU2VsZWN0IGVsZW1lbnQgd2hlbiBrZXlzIGFyZSBwcmVzc2VkIHRoYXQgc2lnbmFsIGl0XG5cdFx0XHRjb25zdCBxdWlja05hdktleXMgPSB0aGlzLl9xdWlja05hdmlnYXRlLmtleWJpbmRpbmdzO1xuXHRcdFx0Y29uc3Qgd2FzVHJpZ2dlcktleVByZXNzZWQgPSBxdWlja05hdktleXMuc29tZShrID0+IHtcblx0XHRcdFx0Y29uc3QgY2hvcmRzID0gay5nZXRDaG9yZHMoKTtcblx0XHRcdFx0aWYgKGNob3Jkcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNob3Jkc1swXS5zaGlmdEtleSAmJiBrZXlDb2RlID09PSBLZXlDb2RlLlNoaWZ0KSB7XG5cdFx0XHRcdFx0aWYgKGtleWJvYXJkRXZlbnQuY3RybEtleSB8fCBrZXlib2FyZEV2ZW50LmFsdEtleSB8fCBrZXlib2FyZEV2ZW50Lm1ldGFLZXkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gdGhpcyBpcyBhbiBvcHRpbWlzdGljIGNoZWNrIGZvciB0aGUgc2hpZnQga2V5IGJlaW5nIHVzZWQgdG8gbmF2aWdhdGUgYmFjayBpbiBxdWljayBpbnB1dFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNob3Jkc1swXS5hbHRLZXkgJiYga2V5Q29kZSA9PT0gS2V5Q29kZS5BbHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaG9yZHNbMF0uY3RybEtleSAmJiBrZXlDb2RlID09PSBLZXlDb2RlLkN0cmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaG9yZHNbMF0ubWV0YUtleSAmJiBrZXlDb2RlID09PSBLZXlDb2RlLk1ldGEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAod2FzVHJpZ2dlcktleVByZXNzZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuYWN0aXZlSXRlbXNbMF0pIHtcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3RlZEl0ZW1zID0gW3RoaXMuYWN0aXZlSXRlbXNbMF1dO1xuXHRcdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmZpcmUodGhpcy5zZWxlY3RlZEl0ZW1zKTtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZUFjY2VwdChmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVW5zZXQgcXVpY2sgbmF2aWdhdGUgYWZ0ZXIgcHJlc3MuIEl0IGlzIG9ubHkgdmFsaWQgb25jZVxuXHRcdFx0XHQvLyBhbmQgc2hvdWxkIG5vdCByZXN1bHQgaW4gYW55IGJlaGF2aW91ciBjaGFuZ2UgYWZ0ZXJ3YXJkc1xuXHRcdFx0XHQvLyBpZiB0aGUgcGlja2VyIHJlbWFpbnMgb3BlbiBiZWNhdXNlIHRoZXJlIHdhcyBubyBhY3RpdmUgaXRlbVxuXHRcdFx0XHR0aGlzLl9xdWlja05hdmlnYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBzdG9yZSB0aGUgc2Nyb2xsVG9wIGJlZm9yZSBpdCBpcyByZXNldFxuXHRcdGNvbnN0IHNjcm9sbFRvcEJlZm9yZSA9IHRoaXMua2VlcFNjcm9sbFBvc2l0aW9uID8gdGhpcy5zY3JvbGxUb3AgOiAwO1xuXHRcdGNvbnN0IGhhc0Rlc2NyaXB0aW9uID0gISF0aGlzLmRlc2NyaXB0aW9uO1xuXHRcdGNvbnN0IHZpc2liaWxpdGllczogVmlzaWJpbGl0aWVzID0ge1xuXHRcdFx0dGl0bGU6ICEhdGhpcy50aXRsZSB8fCAhIXRoaXMuc3RlcCB8fCAhIXRoaXMudGl0bGVCdXR0b25zLmxlbmd0aCxcblx0XHRcdGRlc2NyaXB0aW9uOiBoYXNEZXNjcmlwdGlvbixcblx0XHRcdGNoZWNrQWxsOiB0aGlzLmNhblNlbGVjdE1hbnkgJiYgIXRoaXMuX2hpZGVDaGVja0FsbCxcblx0XHRcdGNoZWNrQm94OiB0aGlzLmNhblNlbGVjdE1hbnksXG5cdFx0XHRpbnB1dEJveDogIXRoaXMuX2hpZGVJbnB1dCxcblx0XHRcdHByb2dyZXNzQmFyOiAhdGhpcy5faGlkZUlucHV0IHx8IGhhc0Rlc2NyaXB0aW9uLFxuXHRcdFx0dmlzaWJsZUNvdW50OiB0cnVlLFxuXHRcdFx0Y291bnQ6IHRoaXMuY2FuU2VsZWN0TWFueSAmJiAhdGhpcy5faGlkZUNvdW50QmFkZ2UsXG5cdFx0XHRvazogdGhpcy5vayA9PT0gJ2RlZmF1bHQnID8gdGhpcy5jYW5TZWxlY3RNYW55IDogdGhpcy5vayxcblx0XHRcdGxpc3Q6IHRydWUsXG5cdFx0XHRtZXNzYWdlOiAhIXRoaXMudmFsaWRhdGlvbk1lc3NhZ2UgfHwgISF0aGlzLnByb21wdCxcblx0XHRcdGN1c3RvbUJ1dHRvbjogdGhpcy5jdXN0b21CdXR0b25cblx0XHR9O1xuXHRcdHRoaXMudWkuc2V0VmlzaWJpbGl0aWVzKHZpc2liaWxpdGllcyk7XG5cdFx0c3VwZXIudXBkYXRlKCk7XG5cdFx0aWYgKHRoaXMudWkuaW5wdXRCb3gudmFsdWUgIT09IHRoaXMudmFsdWUpIHtcblx0XHRcdHRoaXMudWkuaW5wdXRCb3gudmFsdWUgPSB0aGlzLnZhbHVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQpIHtcblx0XHRcdHRoaXMudmFsdWVTZWxlY3Rpb25VcGRhdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LnNlbGVjdCh0aGlzLl92YWx1ZVNlbGVjdGlvbiAmJiB7IHN0YXJ0OiB0aGlzLl92YWx1ZVNlbGVjdGlvblswXSwgZW5kOiB0aGlzLl92YWx1ZVNlbGVjdGlvblsxXSB9KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudWkuaW5wdXRCb3gucGxhY2Vob2xkZXIgIT09ICh0aGlzLnBsYWNlaG9sZGVyIHx8ICcnKSkge1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5wbGFjZWhvbGRlciA9ICh0aGlzLnBsYWNlaG9sZGVyIHx8ICcnKTtcblx0XHR9XG5cblx0XHRsZXQgYXJpYUxhYmVsID0gdGhpcy5hcmlhTGFiZWw7XG5cdFx0Ly8gT25seSBzZXQgYXJpYSBsYWJlbCB0byB0aGUgaW5wdXQgYm94IHBsYWNlaG9sZGVyIGlmIHdlIGFjdHVhbGx5IGhhdmUgYW4gaW5wdXQgYm94LlxuXHRcdGlmICghYXJpYUxhYmVsICYmIHZpc2liaWxpdGllcy5pbnB1dEJveCkge1xuXHRcdFx0YXJpYUxhYmVsID0gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHRcdC8vIElmIHdlIGhhdmUgYSB0aXRsZSwgaW5jbHVkZSBpdCBpbiB0aGUgYXJpYSBsYWJlbC5cblx0XHRcdGlmICh0aGlzLnRpdGxlKSB7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IGFyaWFMYWJlbFxuXHRcdFx0XHRcdD8gYCR7YXJpYUxhYmVsfSAtICR7dGhpcy50aXRsZX1gXG5cdFx0XHRcdFx0OiB0aGlzLnRpdGxlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhcmlhTGFiZWwpIHtcblx0XHRcdFx0YXJpYUxhYmVsID0gUXVpY2tQaWNrLkRFRkFVTFRfQVJJQV9MQUJFTDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMudWkubGlzdC5hcmlhTGFiZWwgIT09IGFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy51aS5saXN0LmFyaWFMYWJlbCA9IGFyaWFMYWJlbCA/PyBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy51aS5pbnB1dEJveC5hcmlhTGFiZWwgIT09IGFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5hcmlhTGFiZWwgPSBhcmlhTGFiZWwgPz8gJ2lucHV0Jztcblx0XHR9XG5cdFx0dGhpcy51aS5saXN0Lm1hdGNoT25EZXNjcmlwdGlvbiA9IHRoaXMubWF0Y2hPbkRlc2NyaXB0aW9uO1xuXHRcdHRoaXMudWkubGlzdC5tYXRjaE9uRGV0YWlsID0gdGhpcy5tYXRjaE9uRGV0YWlsO1xuXHRcdHRoaXMudWkubGlzdC5tYXRjaE9uTGFiZWwgPSB0aGlzLm1hdGNoT25MYWJlbDtcblx0XHR0aGlzLnVpLmxpc3QubWF0Y2hPbkxhYmVsTW9kZSA9IHRoaXMubWF0Y2hPbkxhYmVsTW9kZTtcblx0XHR0aGlzLnVpLmxpc3Quc29ydEJ5TGFiZWwgPSB0aGlzLnNvcnRCeUxhYmVsO1xuXHRcdGlmICh0aGlzLml0ZW1zVXBkYXRlZCkge1xuXHRcdFx0dGhpcy5pdGVtc1VwZGF0ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2ZvY3VzRXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVpLmxpc3Quc2V0RWxlbWVudHModGhpcy5pdGVtcyk7XG5cdFx0XHRcdC8vIFdlIHdhbnQgZm9jdXMgdG8gZXhpc3QgaW4gdGhlIGxpc3QgaWYgdGhlcmUgYXJlIGl0ZW1zIHNvIHRoYXQgc3BhY2UgY2FuIGJlIHVzZWQgdG8gdG9nZ2xlXG5cdFx0XHRcdHRoaXMudWkubGlzdC5zaG91bGRMb29wID0gIXRoaXMuY2FuU2VsZWN0TWFueTtcblx0XHRcdFx0dGhpcy51aS5saXN0LmZpbHRlcih0aGlzLmZpbHRlclZhbHVlKHRoaXMudWkuaW5wdXRCb3gudmFsdWUpKTtcblx0XHRcdFx0c3dpdGNoICh0aGlzLl9pdGVtQWN0aXZhdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgSXRlbUFjdGl2YXRpb24uTk9ORTpcblx0XHRcdFx0XHRcdHRoaXMuX2l0ZW1BY3RpdmF0aW9uID0gSXRlbUFjdGl2YXRpb24uRklSU1Q7IC8vIG9ubHkgdmFsaWQgb25jZSwgdGhlbiB1bnNldFxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBJdGVtQWN0aXZhdGlvbi5TRUNPTkQ6XG5cdFx0XHRcdFx0XHR0aGlzLnVpLmxpc3QuZm9jdXMoUXVpY2tQaWNrRm9jdXMuU2Vjb25kKTtcblx0XHRcdFx0XHRcdHRoaXMuX2l0ZW1BY3RpdmF0aW9uID0gSXRlbUFjdGl2YXRpb24uRklSU1Q7IC8vIG9ubHkgdmFsaWQgb25jZSwgdGhlbiB1bnNldFxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBJdGVtQWN0aXZhdGlvbi5MQVNUOlxuXHRcdFx0XHRcdFx0dGhpcy51aS5saXN0LmZvY3VzKFF1aWNrUGlja0ZvY3VzLkxhc3QpO1xuXHRcdFx0XHRcdFx0dGhpcy5faXRlbUFjdGl2YXRpb24gPSBJdGVtQWN0aXZhdGlvbi5GSVJTVDsgLy8gb25seSB2YWxpZCBvbmNlLCB0aGVuIHVuc2V0XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0dGhpcy50cnlTZWxlY3RGaXJzdCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAodGhpcy51aS5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdzaG93LWNoZWNrYm94ZXMnKSAhPT0gISF0aGlzLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdGlmICh0aGlzLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0dGhpcy51aS5saXN0LmNsZWFyRm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJ5U2VsZWN0Rmlyc3QoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuYWN0aXZlSXRlbXNVcGRhdGVkKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUl0ZW1zVXBkYXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5hY3RpdmVJdGVtc1RvQ29uZmlybSA9IHRoaXMuX2FjdGl2ZUl0ZW1zO1xuXHRcdFx0dGhpcy51aS5saXN0LnNldEZvY3VzZWRFbGVtZW50cyh0aGlzLmFjdGl2ZUl0ZW1zKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUl0ZW1zVG9Db25maXJtID09PSB0aGlzLl9hY3RpdmVJdGVtcykge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUl0ZW1zVG9Db25maXJtID0gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJdGVtc1VwZGF0ZWQpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRJdGVtc1VwZGF0ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuc2VsZWN0ZWRJdGVtc1RvQ29uZmlybSA9IHRoaXMuX3NlbGVjdGVkSXRlbXM7XG5cdFx0XHRpZiAodGhpcy5jYW5TZWxlY3RNYW55KSB7XG5cdFx0XHRcdHRoaXMudWkubGlzdC5zZXRDaGVja2VkRWxlbWVudHModGhpcy5zZWxlY3RlZEl0ZW1zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudWkubGlzdC5zZXRTZWxlY3RlZEVsZW1lbnRzKHRoaXMuc2VsZWN0ZWRJdGVtcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5zZWxlY3RlZEl0ZW1zVG9Db25maXJtID09PSB0aGlzLl9zZWxlY3RlZEl0ZW1zKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRJdGVtc1RvQ29uZmlybSA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudWkub2subGFiZWwgPSB0aGlzLm9rTGFiZWwgfHwgJyc7XG5cdFx0dGhpcy51aS5jdXN0b21CdXR0b24ubGFiZWwgPSB0aGlzLmN1c3RvbUxhYmVsIHx8ICcnO1xuXHRcdHRoaXMudWkuY3VzdG9tQnV0dG9uLmVsZW1lbnQudGl0bGUgPSB0aGlzLmN1c3RvbUhvdmVyIHx8ICcnO1xuXHRcdHRoaXMudWkuY3VzdG9tQnV0dG9uLnNlY29uZGFyeSA9IHRoaXMuY3VzdG9tQnV0dG9uU2Vjb25kYXJ5IHx8IGZhbHNlO1xuXHRcdGlmICghdmlzaWJpbGl0aWVzLmlucHV0Qm94KSB7XG5cdFx0XHQvLyB3ZSBuZWVkIHRvIG1vdmUgZm9jdXMgaW50byB0aGUgdHJlZSB0byBkZXRlY3Qga2V5YmluZGluZ3Ncblx0XHRcdC8vIHByb3Blcmx5IHdoZW4gdGhlIGlucHV0IGJveCBpcyBub3QgdmlzaWJsZSAocXVpY2sgbmF2KVxuXHRcdFx0dGhpcy51aS5saXN0LmRvbUZvY3VzKCk7XG5cblx0XHRcdC8vIEZvY3VzIHRoZSBmaXJzdCBlbGVtZW50IGluIHRoZSBsaXN0IGlmIG11bHRpc2VsZWN0IGlzIGVuYWJsZWRcblx0XHRcdGlmICh0aGlzLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0dGhpcy51aS5saXN0LmZvY3VzKFF1aWNrUGlja0ZvY3VzLkZpcnN0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIHNjcm9sbCBwb3NpdGlvbiB0byB3aGF0IGl0IHdhcyBiZWZvcmUgdXBkYXRpbmcgdGhlIGl0ZW1zXG5cdFx0aWYgKHRoaXMua2VlcFNjcm9sbFBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLnNjcm9sbFRvcCA9IHNjcm9sbFRvcEJlZm9yZTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cyhmb2N1czogUXVpY2tQaWNrRm9jdXMpOiB2b2lkIHtcblx0XHR0aGlzLnVpLmxpc3QuZm9jdXMoZm9jdXMpO1xuXHRcdC8vIFRvIGFsbG93IHRoaW5ncyBsaWtlIHNwYWNlIHRvIGNoZWNrL3VuY2hlY2sgaXRlbXNcblx0XHRpZiAodGhpcy5jYW5TZWxlY3RNYW55KSB7XG5cdFx0XHR0aGlzLnVpLmxpc3QuZG9tRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRhY2NlcHQoaW5CYWNrZ3JvdW5kPzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChpbkJhY2tncm91bmQgJiYgIXRoaXMuX2NhbkFjY2VwdEluQmFja2dyb3VuZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBuZWVkcyB0byBiZSBlbmFibGVkXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYWN0aXZlSXRlbXNbMF0gJiYgIXRoaXMuX2NhblNlbGVjdE1hbnkpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGVkSXRlbXMgPSBbdGhpcy5hY3RpdmVJdGVtc1swXV07XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5maXJlKHRoaXMuc2VsZWN0ZWRJdGVtcyk7XG5cdFx0fVxuXHRcdHRoaXMuaGFuZGxlQWNjZXB0KGluQmFja2dyb3VuZCA/PyBmYWxzZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIElucHV0Qm94IGV4dGVuZHMgUXVpY2tJbnB1dCBpbXBsZW1lbnRzIElJbnB1dEJveCB7XG5cdHByaXZhdGUgX3ZhbHVlID0gJyc7XG5cdHByaXZhdGUgX3ZhbHVlU2VsZWN0aW9uOiBSZWFkb25seTxbbnVtYmVyLCBudW1iZXJdPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2YWx1ZVNlbGVjdGlvblVwZGF0ZWQgPSB0cnVlO1xuXHRwcml2YXRlIF9wbGFjZWhvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hcmlhTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGFzc3dvcmQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRWYWx1ZUNoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQWNjZXB0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHJlYWRvbmx5IHR5cGUgPSBRdWlja0lucHV0VHlwZS5JbnB1dEJveDtcblxuXHRnZXQgdmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0c2V0IHZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlIHx8ICcnO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgdmFsdWVTZWxlY3Rpb24oKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy51aS5pbnB1dEJveC5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIFtzZWxlY3Rpb24uc3RhcnQsIHNlbGVjdGlvbi5lbmRdO1xuXHR9XG5cblx0c2V0IHZhbHVlU2VsZWN0aW9uKHZhbHVlU2VsZWN0aW9uOiBSZWFkb25seTxbbnVtYmVyLCBudW1iZXJdPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3ZhbHVlU2VsZWN0aW9uID0gdmFsdWVTZWxlY3Rpb247XG5cdFx0dGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgcGxhY2Vob2xkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BsYWNlaG9sZGVyO1xuXHR9XG5cblx0c2V0IHBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgYXJpYUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9hcmlhTGFiZWw7XG5cdH1cblxuXHRzZXQgYXJpYUxhYmVsKGFyaWFMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fYXJpYUxhYmVsID0gYXJpYUxhYmVsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgcGFzc3dvcmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bhc3N3b3JkO1xuXHR9XG5cblx0c2V0IHBhc3N3b3JkKHBhc3N3b3JkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fcGFzc3dvcmQgPSBwYXNzd29yZDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHByb21wdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvbXB0O1xuXHR9XG5cblx0c2V0IHByb21wdChwcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3Byb21wdCA9IHByb21wdDtcblx0XHR0aGlzLm5vVmFsaWRhdGlvbk1lc3NhZ2UgPSBwcm9tcHRcblx0XHRcdD8gbG9jYWxpemUoJ2lucHV0TW9kZUVudHJ5RGVzY3JpcHRpb24nLCBcInswfSAoUHJlc3MgJ0VudGVyJyB0byBjb25maXJtIG9yICdFc2NhcGUnIHRvIGNhbmNlbClcIiwgcHJvbXB0KVxuXHRcdFx0OiBRdWlja0lucHV0Lm5vUHJvbXB0TWVzc2FnZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMub25EaWRWYWx1ZUNoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cmVhZG9ubHkgb25EaWRBY2NlcHQgPSB0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5ldmVudDtcblxuXHRvdmVycmlkZSBzaG93KCkge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRcdHRoaXMudWkuaW5wdXRCb3gub25EaWRDaGFuZ2UodmFsdWUgPT4ge1xuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gdGhpcy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRcdHRoaXMub25EaWRWYWx1ZUNoYW5nZUVtaXR0ZXIuZmlyZSh2YWx1ZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnVpLm9uRGlkQWNjZXB0KCgpID0+IHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmZpcmUoKSkpO1xuXHRcdFx0dGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRzdXBlci5zaG93KCk7XG5cdH1cblxuXHRhY2NlcHQoKTogdm9pZCB7XG5cdFx0dGhpcy5vbkRpZEFjY2VwdEVtaXR0ZXIuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudWkuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbi1pbnB1dCcpO1xuXHRcdGNvbnN0IHZpc2liaWxpdGllczogVmlzaWJpbGl0aWVzID0ge1xuXHRcdFx0dGl0bGU6ICEhdGhpcy50aXRsZSB8fCAhIXRoaXMuc3RlcCB8fCAhIXRoaXMudGl0bGVCdXR0b25zLmxlbmd0aCxcblx0XHRcdGRlc2NyaXB0aW9uOiAhIXRoaXMuZGVzY3JpcHRpb24gfHwgISF0aGlzLnN0ZXAsXG5cdFx0XHRpbnB1dEJveDogdHJ1ZSxcblx0XHRcdG1lc3NhZ2U6IHRydWUsXG5cdFx0XHRwcm9ncmVzc0JhcjogdHJ1ZVxuXHRcdH07XG5cblx0XHR0aGlzLnVpLnNldFZpc2liaWxpdGllcyh2aXNpYmlsaXRpZXMpO1xuXHRcdHN1cGVyLnVwZGF0ZSgpO1xuXHRcdGlmICh0aGlzLnVpLmlucHV0Qm94LnZhbHVlICE9PSB0aGlzLnZhbHVlKSB7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LnZhbHVlID0gdGhpcy52YWx1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmFsdWVTZWxlY3Rpb25VcGRhdGVkKSB7XG5cdFx0XHR0aGlzLnZhbHVlU2VsZWN0aW9uVXBkYXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5zZWxlY3QodGhpcy5fdmFsdWVTZWxlY3Rpb24gJiYgeyBzdGFydDogdGhpcy5fdmFsdWVTZWxlY3Rpb25bMF0sIGVuZDogdGhpcy5fdmFsdWVTZWxlY3Rpb25bMV0gfSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVpLmlucHV0Qm94LnBsYWNlaG9sZGVyICE9PSAodGhpcy5wbGFjZWhvbGRlciB8fCAnJykpIHtcblx0XHRcdHRoaXMudWkuaW5wdXRCb3gucGxhY2Vob2xkZXIgPSAodGhpcy5wbGFjZWhvbGRlciB8fCAnJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVpLmlucHV0Qm94LnBhc3N3b3JkICE9PSB0aGlzLnBhc3N3b3JkKSB7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LnBhc3N3b3JkID0gdGhpcy5wYXNzd29yZDtcblx0XHR9XG5cdFx0bGV0IGFyaWFMYWJlbCA9IHRoaXMuYXJpYUxhYmVsO1xuXHRcdC8vIE9ubHkgc2V0IGFyaWEgbGFiZWwgdG8gdGhlIGlucHV0IGJveCBwbGFjZWhvbGRlciBpZiB3ZSBhY3R1YWxseSBoYXZlIGFuIGlucHV0IGJveC5cblx0XHRpZiAoIWFyaWFMYWJlbCAmJiB2aXNpYmlsaXRpZXMuaW5wdXRCb3gpIHtcblx0XHRcdGFyaWFMYWJlbCA9IHRoaXMucGxhY2Vob2xkZXJcblx0XHRcdFx0PyB0aGlzLnRpdGxlXG5cdFx0XHRcdFx0PyBgJHt0aGlzLnBsYWNlaG9sZGVyfSAtICR7dGhpcy50aXRsZX1gXG5cdFx0XHRcdFx0OiB0aGlzLnBsYWNlaG9sZGVyXG5cdFx0XHRcdDogdGhpcy50aXRsZVxuXHRcdFx0XHRcdD8gdGhpcy50aXRsZVxuXHRcdFx0XHRcdDogJ2lucHV0Jztcblx0XHR9XG5cdFx0aWYgKHRoaXMudWkuaW5wdXRCb3guYXJpYUxhYmVsICE9PSBhcmlhTGFiZWwpIHtcblx0XHRcdHRoaXMudWkuaW5wdXRCb3guYXJpYUxhYmVsID0gYXJpYUxhYmVsIHx8ICdpbnB1dCc7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja1dpZGdldCBleHRlbmRzIFF1aWNrSW5wdXQgaW1wbGVtZW50cyBJUXVpY2tXaWRnZXQge1xuXHRyZWFkb25seSB0eXBlID0gUXVpY2tJbnB1dFR5cGUuUXVpY2tXaWRnZXQ7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2lkZ2V0VXBkYXRlZCA9IGZhbHNlO1xuXG5cdGdldCB3aWRnZXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldDtcblx0fVxuXG5cdHNldCB3aWRnZXQod2lkZ2V0OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl93aWRnZXQgIT09IHdpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0ID0gd2lkZ2V0O1xuXHRcdFx0dGhpcy5fd2lkZ2V0VXBkYXRlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGUoKSB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy51aS5zZXRWaXNpYmlsaXRpZXMoe1xuXHRcdFx0dGl0bGU6ICEhdGhpcy50aXRsZSB8fCAhIXRoaXMuc3RlcCB8fCAhIXRoaXMudGl0bGVCdXR0b25zLmxlbmd0aCxcblx0XHRcdGRlc2NyaXB0aW9uOiAhIXRoaXMuZGVzY3JpcHRpb24gfHwgISF0aGlzLnN0ZXBcblx0XHR9KTtcblx0XHRpZiAodGhpcy5fd2lkZ2V0VXBkYXRlZCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0VXBkYXRlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMuX3dpZGdldCkge1xuXHRcdFx0XHRkb20ucmVzZXQodGhpcy51aS53aWRnZXQsIHRoaXMuX3dpZGdldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkb20ucmVzZXQodGhpcy51aS53aWRnZXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzdXBlci51cGRhdGUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tJbnB1dEhvdmVyRGVsZWdhdGUgZXh0ZW5kcyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdtb3VzZScsIHVuZGVmaW5lZCwgKG9wdGlvbnMpID0+IHRoaXMuZ2V0T3ZlcnJpZGVPcHRpb25zKG9wdGlvbnMpLCBjb25maWd1cmF0aW9uU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3ZlcnJpZGVPcHRpb25zKG9wdGlvbnM6IElIb3ZlckRlbGVnYXRlT3B0aW9ucyk6IFBhcnRpYWw8SUhvdmVyT3B0aW9ucz4ge1xuXHRcdC8vIE9ubHkgc2hvdyB0aGUgaG92ZXIgaGludCBpZiB0aGUgY29udGVudCBpcyBvZiBhIGRlY2VudCBzaXplXG5cdFx0Y29uc3Qgc2hvd0hvdmVySGludCA9IChcblx0XHRcdGRvbS5pc0hUTUxFbGVtZW50KG9wdGlvbnMuY29udGVudClcblx0XHRcdFx0PyBvcHRpb25zLmNvbnRlbnQudGV4dENvbnRlbnQgPz8gJydcblx0XHRcdFx0OiB0eXBlb2Ygb3B0aW9ucy5jb250ZW50ID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdD8gb3B0aW9ucy5jb250ZW50XG5cdFx0XHRcdFx0OiBvcHRpb25zLmNvbnRlbnQudmFsdWVcblx0XHQpLmluY2x1ZGVzKCdcXG4nKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwZXJzaXN0ZW5jZToge1xuXHRcdFx0XHRoaWRlT25LZXlEb3duOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdHNob3dIb3ZlckhpbnQsXG5cdFx0XHRcdHNraXBGYWRlSW5BbmltYXRpb246IHRydWUsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBVXRDLFNBQVMsY0FBYztBQUN2QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFnQixxQkFBcUI7QUFDOUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFhO0FBQ3RCLE9BQU8sY0FBYztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBZ1MsZ0JBQWdCLGFBQWEsMEJBQTBCLHNCQUFzQixnQkFBZ0Isc0JBQXNCO0FBRW5aLFNBQVMsMEJBQTBCLGlDQUFpQyxtQ0FBbUM7QUFDdkcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlLDhCQUE4QjtBQUd0RCxTQUFTLGdCQUFnQixxQkFBcUI7QUFFOUMsU0FBUyx1QkFBdUI7QUFFekIsTUFBTSw4QkFBOEI7QUFDcEMsTUFBTSx5QkFBeUIsSUFBSSxjQUF1Qiw2QkFBNkIsT0FBTyxTQUFTLGdCQUFnQiwwREFBMEQsQ0FBQztBQUNsTCxNQUFNLHNCQUFzQixlQUFlLElBQUksMkJBQTJCO0FBRTFFLE1BQU0scUNBQXFDO0FBQzNDLE1BQU0sZ0NBQWdDLElBQUksY0FBNEMsb0NBQW9DLE9BQU8sU0FBUyx1QkFBdUIsa0NBQWtDLENBQUM7QUFFcE0sTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSwyQkFBMkIsSUFBSSxjQUE4QiwrQkFBK0IsUUFBVyxTQUFTLGtCQUFrQiwrQ0FBK0MsQ0FBQztBQUV4TCxNQUFNLG9DQUFvQztBQUMxQyxNQUFNLCtCQUErQixJQUFJLGNBQXVCLG1DQUFtQyxPQUFPLFNBQVMsOEJBQThCLHNFQUFzRSxDQUFDO0FBQ3hOLE1BQU0sNEJBQTRCLGVBQWUsSUFBSSxpQ0FBaUM7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
