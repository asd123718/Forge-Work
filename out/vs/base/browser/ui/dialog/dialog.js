import "./dialog.css";
import { localize } from "../../../../nls.js";
import { $, addDisposableListener, addStandardDisposableListener, clearNode, EventHelper, EventType, getWindow, hide, isActiveElement, isAncestor, isEditableElement, isHTMLElement, show } from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { ActionBar } from "../actionbar/actionbar.js";
import { ButtonBar, ButtonBarAlignment, ButtonWithDescription, ButtonWithDropdown } from "../button/button.js";
import { Checkbox } from "../toggle/toggle.js";
import { InputBox } from "../inputbox/inputBox.js";
import { Action, toAction } from "../../../common/actions.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { KeyCode, KeyMod } from "../../../common/keyCodes.js";
import { mnemonicButtonLabel } from "../../../common/labels.js";
import { Disposable, toDisposable } from "../../../common/lifecycle.js";
import { isLinux, isMacintosh, isWindows } from "../../../common/platform.js";
import { isActionProvider } from "../dropdown/dropdown.js";
var DialogContentsAlignment = /* @__PURE__ */ ((DialogContentsAlignment2) => {
  DialogContentsAlignment2[DialogContentsAlignment2["Horizontal"] = 0] = "Horizontal";
  DialogContentsAlignment2[DialogContentsAlignment2["Vertical"] = 1] = "Vertical";
  return DialogContentsAlignment2;
})(DialogContentsAlignment || {});
class Dialog extends Disposable {
  constructor(container, message, buttons, options) {
    super();
    this.container = container;
    this.message = message;
    this.options = options;
    this.modalElement = this.container.appendChild($(`.monaco-dialog-modal-block.dimmed`));
    if (options.modalBlockExtraClasses) {
      this.modalElement.classList.add(...options.modalBlockExtraClasses);
    }
    this._register(addStandardDisposableListener(this.modalElement, EventType.CLICK, (e) => {
      if (e.target === this.modalElement) {
        this.element.focus();
      }
    }));
    this.shadowElement = this.modalElement.appendChild($(".dialog-shadow"));
    this.element = this.shadowElement.appendChild($(".monaco-dialog-box"));
    if (options.alignment === 1 /* Vertical */) {
      this.element.classList.add("align-vertical");
    }
    if (options.extraClasses) {
      this.element.classList.add(...options.extraClasses);
    }
    this.element.setAttribute("role", "dialog");
    this.element.tabIndex = -1;
    hide(this.element);
    if (this.options.renderFooter) {
      this.footerContainer = this.element.appendChild($(".dialog-footer-row"));
      const customFooter = this.footerContainer.appendChild($("#monaco-dialog-footer.dialog-footer"));
      this.options.renderFooter(customFooter);
      for (const el of this.footerContainer.querySelectorAll("a")) {
        el.tabIndex = 0;
        this.footerActionToFocus ??= el;
      }
    }
    this.buttonStyles = options.buttonStyles;
    if (Array.isArray(buttons) && buttons.length > 0) {
      this.buttons = buttons;
    } else if (!this.options.disableDefaultAction) {
      this.buttons = [localize("ok", "OK")];
    } else {
      this.buttons = [];
    }
    const buttonsRowElement = this.element.appendChild($(".dialog-buttons-row"));
    this.buttonsContainer = buttonsRowElement.appendChild($(".dialog-buttons"));
    const messageRowElement = this.element.appendChild($(".dialog-message-row"));
    this.iconElement = messageRowElement.appendChild($("#monaco-dialog-icon.dialog-icon"));
    this.iconElement.setAttribute("aria-label", this.getIconAriaLabel());
    this.messageContainer = messageRowElement.appendChild($(".dialog-message-container"));
    const hasDetail = !!this.options.detail || !!this.options.detailElement;
    if (hasDetail || this.options.renderBody) {
      const messageElement = this.messageContainer.appendChild($(".dialog-message"));
      const messageTextElement = messageElement.appendChild($("#monaco-dialog-message-text.dialog-message-text"));
      messageTextElement.innerText = this.message;
    }
    this.messageDetailElement = this.messageContainer.appendChild($("#monaco-dialog-message-detail.dialog-message-detail"));
    if (this.options.detailElement) {
      this.messageDetailElement.appendChild(this.options.detailElement);
    } else if (hasDetail || !this.options.renderBody) {
      this.messageDetailElement.innerText = this.options.detail ? this.options.detail : message;
    } else {
      this.messageDetailElement.style.display = "none";
    }
    if (this.options.renderBody) {
      const customBody = this.messageContainer.appendChild($("#monaco-dialog-message-body.dialog-message-body"));
      this.options.renderBody(customBody);
    }
    if (this.options.renderBody || this.options.detailElement) {
      for (const el of this.messageContainer.querySelectorAll("a")) {
        el.tabIndex = 0;
      }
    }
    if (this.options.inputs) {
      this.inputs = this.options.inputs.map((input) => {
        const inputRowElement = this.messageContainer.appendChild($(".dialog-message-input"));
        const inputBox = this._register(new InputBox(inputRowElement, void 0, {
          placeholder: input.placeholder,
          type: input.type ?? "text",
          inputBoxStyles: options.inputBoxStyles
        }));
        if (input.value) {
          inputBox.value = input.value;
        }
        return inputBox;
      });
    } else {
      this.inputs = [];
    }
    if (this.options.checkboxLabel) {
      const checkboxRowElement = this.messageContainer.appendChild($(".dialog-checkbox-row"));
      const checkbox = this.checkbox = this._register(
        new Checkbox(this.options.checkboxLabel, !!this.options.checkboxChecked, options.checkboxStyles)
      );
      checkboxRowElement.appendChild(checkbox.domNode);
      const checkboxMessageElement = checkboxRowElement.appendChild($(".dialog-checkbox-message"));
      checkboxMessageElement.innerText = this.options.checkboxLabel;
      this._register(addDisposableListener(checkboxMessageElement, EventType.CLICK, () => checkbox.checked = !checkbox.checked));
    }
    const toolbarRowElement = this.element.appendChild($(".dialog-toolbar-row"));
    this.toolbarContainer = toolbarRowElement.appendChild($(".dialog-toolbar"));
    this.applyStyles();
  }
  getIconAriaLabel() {
    let typeLabel = localize("dialogInfoMessage", "Info");
    switch (this.options.type) {
      case "error":
        typeLabel = localize("dialogErrorMessage", "Error");
        break;
      case "warning":
        typeLabel = localize("dialogWarningMessage", "Warning");
        break;
      case "pending":
        typeLabel = localize("dialogPendingMessage", "In Progress");
        break;
      case "none":
      case "info":
      case "question":
      default:
        break;
    }
    return typeLabel;
  }
  updateMessage(message) {
    this.messageDetailElement.innerText = message;
  }
  async show() {
    this.focusToReturn = this.container.ownerDocument.activeElement;
    return new Promise((resolve) => {
      clearNode(this.buttonsContainer);
      const close = () => {
        resolve({
          button: this.options.cancelId || 0,
          checkboxChecked: this.checkbox ? this.checkbox.checked : void 0
        });
        return;
      };
      this._register(toDisposable(close));
      const buttonBar = this.buttonBar = this._register(new ButtonBar(this.buttonsContainer, { alignment: this.options?.alignment === 1 /* Vertical */ ? ButtonBarAlignment.Vertical : ButtonBarAlignment.Horizontal }));
      const buttonMap = this.rearrangeButtons(this.buttons, this.options.cancelId);
      const onButtonClick = (index) => {
        resolve({
          button: buttonMap[index].index,
          checkboxChecked: this.checkbox ? this.checkbox.checked : void 0,
          values: this.inputs.length > 0 ? this.inputs.map((input) => input.value) : void 0
        });
      };
      buttonMap.forEach((_, index) => {
        const primary = buttonMap[index].index === 0;
        let button;
        const buttonOptions = this.options.buttonOptions?.[buttonMap[index]?.index];
        if (primary && this.options?.primaryButtonDropdown) {
          const actions = isActionProvider(this.options.primaryButtonDropdown.actions) ? this.options.primaryButtonDropdown.actions.getActions() : this.options.primaryButtonDropdown.actions;
          button = this._register(buttonBar.addButtonWithDropdown({
            ...this.options.primaryButtonDropdown,
            ...this.buttonStyles,
            dropdownLayer: 2600,
            // ensure the dropdown is above the dialog
            actions: actions.map((action) => toAction({
              ...action,
              run: async () => {
                await action.run();
                onButtonClick(index);
              }
            }))
          }));
        } else if (buttonOptions?.sublabel) {
          button = this._register(buttonBar.addButtonWithDescription({ secondary: !primary, ...this.buttonStyles }));
        } else {
          button = this._register(buttonBar.addButton({ secondary: !primary, ...this.buttonStyles }));
        }
        if (buttonOptions?.styleButton) {
          buttonOptions.styleButton(button);
        }
        button.label = mnemonicButtonLabel(buttonMap[index].label, true);
        if (button instanceof ButtonWithDescription) {
          if (buttonOptions?.sublabel) {
            button.description = buttonOptions?.sublabel;
          }
        }
        this._register(button.onDidClick((e) => {
          if (e) {
            EventHelper.stop(e);
          }
          onButtonClick(index);
        }));
      });
      const window = getWindow(this.container);
      let sawEscapeKeyDown = false;
      this._register(addDisposableListener(window, "keydown", (e) => {
        const evt = new StandardKeyboardEvent(e);
        if (evt.equals(KeyCode.Escape)) {
          sawEscapeKeyDown = true;
        }
        if (evt.equals(KeyMod.Alt)) {
          evt.preventDefault();
        }
        if (evt.equals(KeyCode.Enter)) {
          if (this.inputs.some((input) => input.hasFocus())) {
            EventHelper.stop(e);
            resolve({
              button: buttonMap.find((button) => button.index !== this.options.cancelId)?.index ?? 0,
              checkboxChecked: this.checkbox ? this.checkbox.checked : void 0,
              values: this.inputs.length > 0 ? this.inputs.map((input) => input.value) : void 0
            });
          }
          return;
        }
        if (isMacintosh && evt.equals(KeyMod.CtrlCmd | KeyCode.KeyD)) {
          EventHelper.stop(e);
          const noButton = buttonMap.find((button) => button.index === 1 && button.index !== this.options.cancelId);
          if (noButton) {
            resolve({
              button: noButton.index,
              checkboxChecked: this.checkbox ? this.checkbox.checked : void 0,
              values: this.inputs.length > 0 ? this.inputs.map((input) => input.value) : void 0
            });
          }
          return;
        }
        if (evt.equals(KeyCode.Space)) {
          return;
        }
        let eventHandled = false;
        const isArrowNavigation = evt.equals(KeyCode.RightArrow) || evt.equals(KeyCode.LeftArrow);
        const isEditableTarget = isHTMLElement(e.target) && (isEditableElement(e.target) || e.target.isContentEditable);
        if (evt.equals(KeyCode.Tab) || evt.equals(KeyMod.Shift | KeyCode.Tab) || isArrowNavigation && !isEditableTarget) {
          const focusableElements = [];
          let focusedIndex = -1;
          if (this.messageContainer) {
            const links = this.messageContainer.querySelectorAll("a");
            for (const link of links) {
              focusableElements.push(link);
              if (isActiveElement(link)) {
                focusedIndex = focusableElements.length - 1;
              }
            }
          }
          for (const input of this.inputs) {
            focusableElements.push(input);
            if (input.hasFocus()) {
              focusedIndex = focusableElements.length - 1;
            }
          }
          if (this.checkbox) {
            focusableElements.push(this.checkbox);
            if (this.checkbox.hasFocus()) {
              focusedIndex = focusableElements.length - 1;
            }
          }
          if (this.buttonBar) {
            for (const button of this.buttonBar.buttons) {
              if (button instanceof ButtonWithDropdown) {
                focusableElements.push(button.primaryButton);
                if (button.primaryButton.hasFocus()) {
                  focusedIndex = focusableElements.length - 1;
                }
                focusableElements.push(button.dropdownButton);
                if (button.dropdownButton.hasFocus()) {
                  focusedIndex = focusableElements.length - 1;
                }
              } else {
                focusableElements.push(button);
                if (button.hasFocus()) {
                  focusedIndex = focusableElements.length - 1;
                }
              }
            }
          }
          if (this.footerContainer) {
            const links = this.footerContainer.querySelectorAll("a");
            for (const link of links) {
              focusableElements.push(link);
              if (isActiveElement(link)) {
                focusedIndex = focusableElements.length - 1;
              }
            }
          }
          if (evt.equals(KeyCode.Tab) || evt.equals(KeyCode.RightArrow)) {
            const newFocusedIndex = (focusedIndex + 1) % focusableElements.length;
            focusableElements[newFocusedIndex].focus();
          } else {
            if (focusedIndex === -1) {
              focusedIndex = focusableElements.length;
            }
            let newFocusedIndex = focusedIndex - 1;
            if (newFocusedIndex === -1) {
              newFocusedIndex = focusableElements.length - 1;
            }
            focusableElements[newFocusedIndex].focus();
          }
          eventHandled = true;
        }
        if (eventHandled) {
          EventHelper.stop(e, true);
        } else if (this.options.keyEventProcessor) {
          this.options.keyEventProcessor(evt);
        }
      }, true));
      this._register(addDisposableListener(window, "keyup", (e) => {
        EventHelper.stop(e, true);
        const evt = new StandardKeyboardEvent(e);
        if (!this.options.disableCloseAction && evt.equals(KeyCode.Escape) && sawEscapeKeyDown) {
          close();
        }
      }, true));
      this._register(addDisposableListener(this.element, "focusout", (e) => {
        if (!!e.relatedTarget && !!this.element) {
          if (!isAncestor(e.relatedTarget, this.element)) {
            if (this.options.isExternalFocusAllowed?.(e.relatedTarget)) {
              return;
            }
            this.focusToReturn = e.relatedTarget;
            if (e.target) {
              e.target.focus();
              EventHelper.stop(e, true);
            }
          }
        }
      }, false));
      const spinModifierClassName = "codicon-modifier-spin";
      this.iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.dialogError), ...ThemeIcon.asClassNameArray(Codicon.dialogWarning), ...ThemeIcon.asClassNameArray(Codicon.dialogInfo), ...ThemeIcon.asClassNameArray(Codicon.loading), spinModifierClassName);
      if (this.options.icon) {
        this.iconElement.classList.add(...ThemeIcon.asClassNameArray(this.options.icon));
      } else {
        switch (this.options.type) {
          case "error":
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogError));
            break;
          case "warning":
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogWarning));
            break;
          case "pending":
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), spinModifierClassName);
            break;
          case "none":
            this.iconElement.classList.add("no-codicon");
            break;
          case "info":
          case "question":
          default:
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogInfo));
            break;
        }
      }
      if (!this.options.disableCloseAction && !this.options.disableCloseButton) {
        const actionBar = this._register(new ActionBar(this.toolbarContainer, {}));
        const action = this._register(new Action("dialog.close", localize("dialogClose", "Close Dialog"), ThemeIcon.asClassName(Codicon.dialogClose), true, async () => {
          resolve({
            button: this.options.cancelId || 0,
            checkboxChecked: this.checkbox ? this.checkbox.checked : void 0
          });
        }));
        actionBar.push(action, { icon: true, label: false });
      }
      this.applyStyles();
      this.element.setAttribute("aria-modal", "true");
      this.element.setAttribute("aria-labelledby", "monaco-dialog-icon monaco-dialog-message-text");
      this.element.setAttribute("aria-describedby", "monaco-dialog-icon monaco-dialog-message-text monaco-dialog-message-detail monaco-dialog-message-body monaco-dialog-footer");
      show(this.element);
      this.options.onVisibilityChange?.(window, true);
      this._register(toDisposable(() => this.options.onVisibilityChange?.(window, false)));
      if (this.inputs.length > 0) {
        this.inputs[0].focus();
        this.inputs[0].select();
      } else {
        let focusedButton = false;
        buttonMap.forEach((value, index) => {
          if (value.index === 0) {
            buttonBar.buttons[index].focus();
            focusedButton = true;
          }
        });
        if (!focusedButton) {
          (this.footerActionToFocus ?? this.element).focus();
        }
      }
    });
  }
  applyStyles() {
    const style = this.options.dialogStyles;
    const fgColor = style.dialogForeground;
    const bgColor = style.dialogBackground;
    const shadowColor = style.dialogShadow ? `0 0px 8px ${style.dialogShadow}` : "";
    const border = style.dialogBorder ? `1px solid ${style.dialogBorder}` : "";
    const linkFgColor = style.textLinkForeground;
    this.shadowElement.style.boxShadow = shadowColor;
    this.element.style.color = fgColor ?? "";
    this.element.style.backgroundColor = bgColor ?? "";
    this.element.style.border = border;
    if (linkFgColor) {
      for (const el of [...this.messageContainer.getElementsByTagName("a"), ...this.footerContainer?.getElementsByTagName("a") ?? []]) {
        if (el.classList.contains("monaco-button")) {
          continue;
        }
        el.style.color = linkFgColor;
        el.style.textDecoration = "underline";
      }
    }
    let color;
    switch (this.options.type) {
      case "none":
        break;
      case "error":
        color = style.errorIconForeground;
        break;
      case "warning":
        color = style.warningIconForeground;
        break;
      default:
        color = style.infoIconForeground;
        break;
    }
    if (color) {
      this.iconElement.style.color = color;
    }
  }
  dispose() {
    super.dispose();
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = void 0;
    }
    if (this.focusToReturn && isAncestor(this.focusToReturn, this.container.ownerDocument.body)) {
      this.focusToReturn.focus();
      this.focusToReturn = void 0;
    }
  }
  rearrangeButtons(buttons, cancelId) {
    const buttonMap = buttons.map((label, index) => ({ label, index }));
    if (buttons.length < 2 || this.options.alignment === 1 /* Vertical */) {
      return buttonMap;
    }
    if (isMacintosh || isLinux) {
      if (typeof cancelId === "number" && buttonMap[cancelId]) {
        const cancelButton = buttonMap.splice(cancelId, 1)[0];
        buttonMap.splice(1, 0, cancelButton);
      }
      buttonMap.reverse();
    } else if (isWindows) {
      if (typeof cancelId === "number" && buttonMap[cancelId]) {
        const cancelButton = buttonMap.splice(cancelId, 1)[0];
        buttonMap.push(cancelButton);
      }
    }
    return buttonMap;
  }
}
export {
  Dialog,
  DialogContentsAlignment
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcZGlhbG9nXFxkaWFsb2cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vZGlhbG9nLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyLCBjbGVhck5vZGUsIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIGdldFdpbmRvdywgaGlkZSwgaXNBY3RpdmVFbGVtZW50LCBpc0FuY2VzdG9yLCBpc0VkaXRhYmxlRWxlbWVudCwgaXNIVE1MRWxlbWVudCwgc2hvdyB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uQmFyLCBCdXR0b25CYXJBbGlnbm1lbnQsIEJ1dHRvbldpdGhEZXNjcmlwdGlvbiwgQnV0dG9uV2l0aERyb3Bkb3duLCBJQnV0dG9uLCBJQnV0dG9uU3R5bGVzLCBJQnV0dG9uV2l0aERyb3Bkb3duT3B0aW9ucyB9IGZyb20gJy4uL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUNoZWNrYm94U3R5bGVzLCBDaGVja2JveCB9IGZyb20gJy4uL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSUlucHV0Qm94U3R5bGVzLCBJbnB1dEJveCB9IGZyb20gJy4uL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IG1uZW1vbmljQnV0dG9uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0FjdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vZHJvcGRvd24vZHJvcGRvd24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEaWFsb2dJbnB1dE9wdGlvbnMge1xuXHRyZWFkb25seSBwbGFjZWhvbGRlcj86IHN0cmluZztcblx0cmVhZG9ubHkgdHlwZT86ICd0ZXh0JyB8ICdwYXNzd29yZCc7XG5cdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgZW51bSBEaWFsb2dDb250ZW50c0FsaWdubWVudCB7XG5cdC8qKlxuXHQgKiBEaWFsb2cgY29udGVudHMgYWxpZ24gZnJvbSBsZWZ0IHRvIHJpZ2h0IChpY29uLCBtZXNzYWdlLCBidXR0b25zIG9uIGEgc2VwYXJhdGUgcm93KS5cblx0ICpcblx0ICogTm90ZTogdGhpcyBpcyB0aGUgZGVmYXVsdCBhbGlnbm1lbnQgZm9yIGRpYWxvZ3MuXG5cdCAqL1xuXHRIb3Jpem9udGFsID0gMCxcblxuXHQvKipcblx0ICogRGlhbG9nIGNvbnRlbnRzIGFsaWduIGZyb20gdG9wIHRvIGJvdHRvbSAoaWNvbiwgbWVzc2FnZSwgYnV0dG9ucyBzdGFjayBvbiB0b3Agb2YgZWFjaCBvdGhlcilcblx0ICovXG5cdFZlcnRpY2FsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpYWxvZ09wdGlvbnMge1xuXHRyZWFkb25seSBjYW5jZWxJZD86IG51bWJlcjtcblx0cmVhZG9ubHkgZGV0YWlsPzogc3RyaW5nO1xuXHQvKipcblx0ICogQSBwcmUtcmVuZGVyZWQgZWxlbWVudCB0byBzaG93IGluIHBsYWNlIG9mIHRoZSBwbGFpbi10ZXh0IHtAbGluayBkZXRhaWx9LlxuXHQgKiBVc2VkIHRvIHByZXNlbnQgcmljaCBkZXRhaWwgY29udGVudCAoZS5nLiByZW5kZXJlZCBNYXJrZG93bikgc2luY2UgdGhpc1xuXHQgKiBiYXNlIHdpZGdldCBoYXMgbm8gTWFya2Rvd24gcmVuZGVyaW5nIGNhcGFiaWxpdHkgb2YgaXRzIG93bi4gVGFrZXNcblx0ICogcHJlY2VkZW5jZSBvdmVyIHtAbGluayBkZXRhaWx9IHdoZW4gYm90aCBhcmUgcHJvdmlkZWQuIEFueSBgPGE+YCBlbGVtZW50XG5cdCAqIHdpdGhpbiBpcyBtYWRlIGtleWJvYXJkLWZvY3VzYWJsZSBhbmQgcGFydGljaXBhdGVzIGluIHRhYiBvcmRlciBsaWtlXG5cdCAqIGxpbmtzIHJlbmRlcmVkIHZpYSB7QGxpbmsgcmVuZGVyQm9keX0uXG5cdCAqL1xuXHRyZWFkb25seSBkZXRhaWxFbGVtZW50PzogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFsaWdubWVudD86IERpYWxvZ0NvbnRlbnRzQWxpZ25tZW50O1xuXHRyZWFkb25seSBjaGVja2JveExhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBjaGVja2JveENoZWNrZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB0eXBlPzogJ25vbmUnIHwgJ2luZm8nIHwgJ2Vycm9yJyB8ICdxdWVzdGlvbicgfCAnd2FybmluZycgfCAncGVuZGluZyc7XG5cdHJlYWRvbmx5IGV4dHJhQ2xhc3Nlcz86IHN0cmluZ1tdO1xuXHQvKiogQ2xhc3NlcyB0byBhZGQgdG8gdGhlIGZ1bGwtd2luZG93IG1vZGFsIGJsb2NrZXIuICovXG5cdHJlYWRvbmx5IG1vZGFsQmxvY2tFeHRyYUNsYXNzZXM/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaW5wdXRzPzogSURpYWxvZ0lucHV0T3B0aW9uc1tdO1xuXHRyZWFkb25seSBrZXlFdmVudFByb2Nlc3Nvcj86IChldmVudDogU3RhbmRhcmRLZXlib2FyZEV2ZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSByZW5kZXJCb2R5PzogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IHJlbmRlckZvb3Rlcj86IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSBidXR0b25PcHRpb25zPzogQXJyYXk8dW5kZWZpbmVkIHwgeyBzdWJsYWJlbD86IHN0cmluZzsgc3R5bGVCdXR0b24/OiAoYnV0dG9uOiBJQnV0dG9uKSA9PiB2b2lkIH0+O1xuXHRyZWFkb25seSBwcmltYXJ5QnV0dG9uRHJvcGRvd24/OiBJQnV0dG9uV2l0aERyb3Bkb3duT3B0aW9ucztcblx0cmVhZG9ubHkgZGlzYWJsZUNsb3NlQWN0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZUNsb3NlQnV0dG9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZURlZmF1bHRBY3Rpb24/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGVtcG9yYXJ5IGVzY2FwZSBoYXRjaCBmb3IgZGlhbG9ncyB0aGF0IGVtYmVkIHdpZGdldHMgd2hvc2UgcG9wdXBzIG1vdW50XG5cdCAqIGF0IHdpbmRvdyByb290IChvdXRzaWRlIHRoZSBkaWFsb2cgRE9NKS4gTmVlZGVkIGJlY2F1c2UgdGhlIGZvY3VzIHRyYXBcblx0ICogd291bGQgb3RoZXJ3aXNlIGltbWVkaWF0ZWx5IHJlY2xhaW0gZm9jdXMgZnJvbSBjb250ZXh0IHZpZXdzIGFuZCBwaWNrZXJzLlxuXHQgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyMzkyMCBmb3IgcmVtb3ZhbCBwbGFuLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNFeHRlcm5hbEZvY3VzQWxsb3dlZD86IChyZWxhdGVkVGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gYm9vbGVhbjtcblx0cmVhZG9ubHkgb25WaXNpYmlsaXR5Q2hhbmdlPzogKHdpbmRvdzogV2luZG93LCB2aXNpYmxlOiBib29sZWFuKSA9PiB2b2lkO1xuXHRyZWFkb25seSBidXR0b25TdHlsZXM6IElCdXR0b25TdHlsZXM7XG5cdHJlYWRvbmx5IGNoZWNrYm94U3R5bGVzOiBJQ2hlY2tib3hTdHlsZXM7XG5cdHJlYWRvbmx5IGlucHV0Qm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXM7XG5cdHJlYWRvbmx5IGRpYWxvZ1N0eWxlczogSURpYWxvZ1N0eWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlhbG9nUmVzdWx0IHtcblx0cmVhZG9ubHkgYnV0dG9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNoZWNrYm94Q2hlY2tlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZhbHVlcz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWFsb2dTdHlsZXMge1xuXHRyZWFkb25seSBkaWFsb2dGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRpYWxvZ0JhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZGlhbG9nU2hhZG93OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRpYWxvZ0JvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBlcnJvckljb25Gb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHdhcm5pbmdJY29uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbmZvSWNvbkZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGV4dExpbmtGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBCdXR0b25NYXBFbnRyeSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBEaWFsb2cgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2hhZG93RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbW9kYWxFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBidXR0b25zQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlRGV0YWlsRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZm9vdGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmb290ZXJBY3Rpb25Ub0ZvY3VzOiBIVE1MQW5jaG9yRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBpY29uRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hlY2tib3g6IENoZWNrYm94IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xiYXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGJ1dHRvbkJhcjogQnV0dG9uQmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZvY3VzVG9SZXR1cm46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0czogSW5wdXRCb3hbXTtcblx0cHJpdmF0ZSByZWFkb25seSBidXR0b25zOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBidXR0b25TdHlsZXM6IElCdXR0b25TdHlsZXM7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50LCBwcml2YXRlIG1lc3NhZ2U6IHN0cmluZywgYnV0dG9uczogc3RyaW5nW10gfCB1bmRlZmluZWQsIHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSURpYWxvZ09wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gTW9kYWwgYmFja2dyb3VuZCBibG9ja2VyXG5cdFx0dGhpcy5tb2RhbEVsZW1lbnQgPSB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKGAubW9uYWNvLWRpYWxvZy1tb2RhbC1ibG9jay5kaW1tZWRgKSk7XG5cdFx0aWYgKG9wdGlvbnMubW9kYWxCbG9ja0V4dHJhQ2xhc3Nlcykge1xuXHRcdFx0dGhpcy5tb2RhbEVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5vcHRpb25zLm1vZGFsQmxvY2tFeHRyYUNsYXNzZXMpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RlcihhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm1vZGFsRWxlbWVudCwgRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldCA9PT0gdGhpcy5tb2RhbEVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmZvY3VzKCk7IC8vIGd1aWRlIHVzZXJzIGJhY2sgaW50byB0aGUgZGlhbG9nIGlmIGNsaWNrZWQgZWxzZXdoZXJlXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlhbG9nIEJveFxuXHRcdHRoaXMuc2hhZG93RWxlbWVudCA9IHRoaXMubW9kYWxFbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctc2hhZG93JykpO1xuXHRcdHRoaXMuZWxlbWVudCA9IHRoaXMuc2hhZG93RWxlbWVudC5hcHBlbmRDaGlsZCgkKCcubW9uYWNvLWRpYWxvZy1ib3gnKSk7XG5cdFx0aWYgKG9wdGlvbnMuYWxpZ25tZW50ID09PSBEaWFsb2dDb250ZW50c0FsaWdubWVudC5WZXJ0aWNhbCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2FsaWduLXZlcnRpY2FsJyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmV4dHJhQ2xhc3Nlcykge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4ub3B0aW9ucy5leHRyYUNsYXNzZXMpO1xuXHRcdH1cblx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2RpYWxvZycpO1xuXHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdGhpZGUodGhpcy5lbGVtZW50KTtcblxuXHRcdC8vIEZvb3RlclxuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVuZGVyRm9vdGVyKSB7XG5cdFx0XHR0aGlzLmZvb3RlckNvbnRhaW5lciA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLWZvb3Rlci1yb3cnKSk7XG5cblx0XHRcdGNvbnN0IGN1c3RvbUZvb3RlciA9IHRoaXMuZm9vdGVyQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJyNtb25hY28tZGlhbG9nLWZvb3Rlci5kaWFsb2ctZm9vdGVyJykpO1xuXHRcdFx0dGhpcy5vcHRpb25zLnJlbmRlckZvb3RlcihjdXN0b21Gb290ZXIpO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGZvciAoY29uc3QgZWwgb2YgdGhpcy5mb290ZXJDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnYScpKSB7XG5cdFx0XHRcdGVsLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0dGhpcy5mb290ZXJBY3Rpb25Ub0ZvY3VzID8/PSBlbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCdXR0b25zXG5cdFx0dGhpcy5idXR0b25TdHlsZXMgPSBvcHRpb25zLmJ1dHRvblN0eWxlcztcblxuXHRcdGlmIChBcnJheS5pc0FycmF5KGJ1dHRvbnMpICYmIGJ1dHRvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5idXR0b25zID0gYnV0dG9ucztcblx0XHR9IGVsc2UgaWYgKCF0aGlzLm9wdGlvbnMuZGlzYWJsZURlZmF1bHRBY3Rpb24pIHtcblx0XHRcdHRoaXMuYnV0dG9ucyA9IFtsb2NhbGl6ZSgnb2snLCBcIk9LXCIpXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5idXR0b25zID0gW107XG5cdFx0fVxuXHRcdGNvbnN0IGJ1dHRvbnNSb3dFbGVtZW50ID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctYnV0dG9ucy1yb3cnKSk7XG5cdFx0dGhpcy5idXR0b25zQ29udGFpbmVyID0gYnV0dG9uc1Jvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy1idXR0b25zJykpO1xuXG5cdFx0Ly8gTWVzc2FnZVxuXHRcdGNvbnN0IG1lc3NhZ2VSb3dFbGVtZW50ID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctbWVzc2FnZS1yb3cnKSk7XG5cdFx0dGhpcy5pY29uRWxlbWVudCA9IG1lc3NhZ2VSb3dFbGVtZW50LmFwcGVuZENoaWxkKCQoJyNtb25hY28tZGlhbG9nLWljb24uZGlhbG9nLWljb24nKSk7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmdldEljb25BcmlhTGFiZWwoKSk7XG5cdFx0dGhpcy5tZXNzYWdlQ29udGFpbmVyID0gbWVzc2FnZVJvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy1tZXNzYWdlLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGhhc0RldGFpbCA9ICEhdGhpcy5vcHRpb25zLmRldGFpbCB8fCAhIXRoaXMub3B0aW9ucy5kZXRhaWxFbGVtZW50O1xuXHRcdGlmIChoYXNEZXRhaWwgfHwgdGhpcy5vcHRpb25zLnJlbmRlckJvZHkpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VFbGVtZW50ID0gdGhpcy5tZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctbWVzc2FnZScpKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VUZXh0RWxlbWVudCA9IG1lc3NhZ2VFbGVtZW50LmFwcGVuZENoaWxkKCQoJyNtb25hY28tZGlhbG9nLW1lc3NhZ2UtdGV4dC5kaWFsb2ctbWVzc2FnZS10ZXh0JykpO1xuXHRcdFx0bWVzc2FnZVRleHRFbGVtZW50LmlubmVyVGV4dCA9IHRoaXMubWVzc2FnZTtcblx0XHR9XG5cblx0XHR0aGlzLm1lc3NhZ2VEZXRhaWxFbGVtZW50ID0gdGhpcy5tZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJyNtb25hY28tZGlhbG9nLW1lc3NhZ2UtZGV0YWlsLmRpYWxvZy1tZXNzYWdlLWRldGFpbCcpKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLmRldGFpbEVsZW1lbnQpIHtcblx0XHRcdHRoaXMubWVzc2FnZURldGFpbEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5vcHRpb25zLmRldGFpbEVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAoaGFzRGV0YWlsIHx8ICF0aGlzLm9wdGlvbnMucmVuZGVyQm9keSkge1xuXHRcdFx0dGhpcy5tZXNzYWdlRGV0YWlsRWxlbWVudC5pbm5lclRleHQgPSB0aGlzLm9wdGlvbnMuZGV0YWlsID8gdGhpcy5vcHRpb25zLmRldGFpbCA6IG1lc3NhZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWVzc2FnZURldGFpbEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlckJvZHkpIHtcblx0XHRcdGNvbnN0IGN1c3RvbUJvZHkgPSB0aGlzLm1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnI21vbmFjby1kaWFsb2ctbWVzc2FnZS1ib2R5LmRpYWxvZy1tZXNzYWdlLWJvZHknKSk7XG5cdFx0XHR0aGlzLm9wdGlvbnMucmVuZGVyQm9keShjdXN0b21Cb2R5KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlckJvZHkgfHwgdGhpcy5vcHRpb25zLmRldGFpbEVsZW1lbnQpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Zm9yIChjb25zdCBlbCBvZiB0aGlzLm1lc3NhZ2VDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnYScpKSB7XG5cdFx0XHRcdGVsLnRhYkluZGV4ID0gMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbnB1dHNcblx0XHRpZiAodGhpcy5vcHRpb25zLmlucHV0cykge1xuXHRcdFx0dGhpcy5pbnB1dHMgPSB0aGlzLm9wdGlvbnMuaW5wdXRzLm1hcChpbnB1dCA9PiB7XG5cdFx0XHRcdGNvbnN0IGlucHV0Um93RWxlbWVudCA9IHRoaXMubWVzc2FnZUNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLW1lc3NhZ2UtaW5wdXQnKSk7XG5cblx0XHRcdFx0Y29uc3QgaW5wdXRCb3ggPSB0aGlzLl9yZWdpc3RlcihuZXcgSW5wdXRCb3goaW5wdXRSb3dFbGVtZW50LCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRwbGFjZWhvbGRlcjogaW5wdXQucGxhY2Vob2xkZXIsXG5cdFx0XHRcdFx0dHlwZTogaW5wdXQudHlwZSA/PyAndGV4dCcsXG5cdFx0XHRcdFx0aW5wdXRCb3hTdHlsZXM6IG9wdGlvbnMuaW5wdXRCb3hTdHlsZXNcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGlmIChpbnB1dC52YWx1ZSkge1xuXHRcdFx0XHRcdGlucHV0Qm94LnZhbHVlID0gaW5wdXQudmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gaW5wdXRCb3g7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dHMgPSBbXTtcblx0XHR9XG5cblx0XHQvLyBDaGVja2JveFxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY2hlY2tib3hMYWJlbCkge1xuXHRcdFx0Y29uc3QgY2hlY2tib3hSb3dFbGVtZW50ID0gdGhpcy5tZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctY2hlY2tib3gtcm93JykpO1xuXG5cdFx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuY2hlY2tib3ggPSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdFx0bmV3IENoZWNrYm94KHRoaXMub3B0aW9ucy5jaGVja2JveExhYmVsLCAhIXRoaXMub3B0aW9ucy5jaGVja2JveENoZWNrZWQsIG9wdGlvbnMuY2hlY2tib3hTdHlsZXMpXG5cdFx0XHQpO1xuXG5cdFx0XHRjaGVja2JveFJvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRcdGNvbnN0IGNoZWNrYm94TWVzc2FnZUVsZW1lbnQgPSBjaGVja2JveFJvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy1jaGVja2JveC1tZXNzYWdlJykpO1xuXHRcdFx0Y2hlY2tib3hNZXNzYWdlRWxlbWVudC5pbm5lclRleHQgPSB0aGlzLm9wdGlvbnMuY2hlY2tib3hMYWJlbDtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjaGVja2JveE1lc3NhZ2VFbGVtZW50LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IGNoZWNrYm94LmNoZWNrZWQgPSAhY2hlY2tib3guY2hlY2tlZCkpO1xuXHRcdH1cblxuXHRcdC8vIFRvb2xiYXJcblx0XHRjb25zdCB0b29sYmFyUm93RWxlbWVudCA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLXRvb2xiYXItcm93JykpO1xuXHRcdHRoaXMudG9vbGJhckNvbnRhaW5lciA9IHRvb2xiYXJSb3dFbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctdG9vbGJhcicpKTtcblxuXHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SWNvbkFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGxldCB0eXBlTGFiZWwgPSBsb2NhbGl6ZSgnZGlhbG9nSW5mb01lc3NhZ2UnLCAnSW5mbycpO1xuXHRcdHN3aXRjaCAodGhpcy5vcHRpb25zLnR5cGUpIHtcblx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0dHlwZUxhYmVsID0gbG9jYWxpemUoJ2RpYWxvZ0Vycm9yTWVzc2FnZScsICdFcnJvcicpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3dhcm5pbmcnOlxuXHRcdFx0XHR0eXBlTGFiZWwgPSBsb2NhbGl6ZSgnZGlhbG9nV2FybmluZ01lc3NhZ2UnLCAnV2FybmluZycpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3BlbmRpbmcnOlxuXHRcdFx0XHR0eXBlTGFiZWwgPSBsb2NhbGl6ZSgnZGlhbG9nUGVuZGluZ01lc3NhZ2UnLCAnSW4gUHJvZ3Jlc3MnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdub25lJzpcblx0XHRcdGNhc2UgJ2luZm8nOlxuXHRcdFx0Y2FzZSAncXVlc3Rpb24nOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHR5cGVMYWJlbDtcblx0fVxuXG5cdHVwZGF0ZU1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlRGV0YWlsRWxlbWVudC5pbm5lclRleHQgPSBtZXNzYWdlO1xuXHR9XG5cblx0YXN5bmMgc2hvdygpOiBQcm9taXNlPElEaWFsb2dSZXN1bHQ+IHtcblx0XHR0aGlzLmZvY3VzVG9SZXR1cm4gPSB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SURpYWxvZ1Jlc3VsdD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjbGVhck5vZGUodGhpcy5idXR0b25zQ29udGFpbmVyKTtcblxuXHRcdFx0Y29uc3QgY2xvc2UgPSAoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdGJ1dHRvbjogdGhpcy5vcHRpb25zLmNhbmNlbElkIHx8IDAsXG5cdFx0XHRcdFx0Y2hlY2tib3hDaGVja2VkOiB0aGlzLmNoZWNrYm94ID8gdGhpcy5jaGVja2JveC5jaGVja2VkIDogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKGNsb3NlKSk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbkJhciA9IHRoaXMuYnV0dG9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbkJhcih0aGlzLmJ1dHRvbnNDb250YWluZXIsIHsgYWxpZ25tZW50OiB0aGlzLm9wdGlvbnM/LmFsaWdubWVudCA9PT0gRGlhbG9nQ29udGVudHNBbGlnbm1lbnQuVmVydGljYWwgPyBCdXR0b25CYXJBbGlnbm1lbnQuVmVydGljYWwgOiBCdXR0b25CYXJBbGlnbm1lbnQuSG9yaXpvbnRhbCB9KSk7XG5cdFx0XHRjb25zdCBidXR0b25NYXAgPSB0aGlzLnJlYXJyYW5nZUJ1dHRvbnModGhpcy5idXR0b25zLCB0aGlzLm9wdGlvbnMuY2FuY2VsSWQpO1xuXG5cdFx0XHRjb25zdCBvbkJ1dHRvbkNsaWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0YnV0dG9uOiBidXR0b25NYXBbaW5kZXhdLmluZGV4LFxuXHRcdFx0XHRcdGNoZWNrYm94Q2hlY2tlZDogdGhpcy5jaGVja2JveCA/IHRoaXMuY2hlY2tib3guY2hlY2tlZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2YWx1ZXM6IHRoaXMuaW5wdXRzLmxlbmd0aCA+IDAgPyB0aGlzLmlucHV0cy5tYXAoaW5wdXQgPT4gaW5wdXQudmFsdWUpIDogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQnV0dG9uc1xuXHRcdFx0YnV0dG9uTWFwLmZvckVhY2goKF8sIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnkgPSBidXR0b25NYXBbaW5kZXhdLmluZGV4ID09PSAwO1xuXG5cdFx0XHRcdGxldCBidXR0b246IElCdXR0b247XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbk9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuYnV0dG9uT3B0aW9ucz8uW2J1dHRvbk1hcFtpbmRleF0/LmluZGV4XTtcblx0XHRcdFx0aWYgKHByaW1hcnkgJiYgdGhpcy5vcHRpb25zPy5wcmltYXJ5QnV0dG9uRHJvcGRvd24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25zID0gaXNBY3Rpb25Qcm92aWRlcih0aGlzLm9wdGlvbnMucHJpbWFyeUJ1dHRvbkRyb3Bkb3duLmFjdGlvbnMpID8gdGhpcy5vcHRpb25zLnByaW1hcnlCdXR0b25Ecm9wZG93bi5hY3Rpb25zLmdldEFjdGlvbnMoKSA6IHRoaXMub3B0aW9ucy5wcmltYXJ5QnV0dG9uRHJvcGRvd24uYWN0aW9ucztcblx0XHRcdFx0XHRidXR0b24gPSB0aGlzLl9yZWdpc3RlcihidXR0b25CYXIuYWRkQnV0dG9uV2l0aERyb3Bkb3duKHtcblx0XHRcdFx0XHRcdC4uLnRoaXMub3B0aW9ucy5wcmltYXJ5QnV0dG9uRHJvcGRvd24sXG5cdFx0XHRcdFx0XHQuLi50aGlzLmJ1dHRvblN0eWxlcyxcblx0XHRcdFx0XHRcdGRyb3Bkb3duTGF5ZXI6IDI2MDAsIC8vIGVuc3VyZSB0aGUgZHJvcGRvd24gaXMgYWJvdmUgdGhlIGRpYWxvZ1xuXHRcdFx0XHRcdFx0YWN0aW9uczogYWN0aW9ucy5tYXAoYWN0aW9uID0+IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0Li4uYWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCBhY3Rpb24ucnVuKCk7XG5cblx0XHRcdFx0XHRcdFx0XHRvbkJ1dHRvbkNsaWNrKGluZGV4KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJ1dHRvbk9wdGlvbnM/LnN1YmxhYmVsKSB7XG5cdFx0XHRcdFx0YnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIoYnV0dG9uQmFyLmFkZEJ1dHRvbldpdGhEZXNjcmlwdGlvbih7IHNlY29uZGFyeTogIXByaW1hcnksIC4uLnRoaXMuYnV0dG9uU3R5bGVzIH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRidXR0b24gPSB0aGlzLl9yZWdpc3RlcihidXR0b25CYXIuYWRkQnV0dG9uKHsgc2Vjb25kYXJ5OiAhcHJpbWFyeSwgLi4udGhpcy5idXR0b25TdHlsZXMgfSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGJ1dHRvbk9wdGlvbnM/LnN0eWxlQnV0dG9uKSB7XG5cdFx0XHRcdFx0YnV0dG9uT3B0aW9ucy5zdHlsZUJ1dHRvbihidXR0b24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbW5lbW9uaWNCdXR0b25MYWJlbChidXR0b25NYXBbaW5kZXhdLmxhYmVsLCB0cnVlKTtcblx0XHRcdFx0aWYgKGJ1dHRvbiBpbnN0YW5jZW9mIEJ1dHRvbldpdGhEZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGlmIChidXR0b25PcHRpb25zPy5zdWJsYWJlbCkge1xuXHRcdFx0XHRcdFx0YnV0dG9uLmRlc2NyaXB0aW9uID0gYnV0dG9uT3B0aW9ucz8uc3VibGFiZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlKSB7XG5cdFx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG9uQnV0dG9uQ2xpY2soaW5kZXgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSGFuZGxlIGtleWJvYXJkIGV2ZW50cyBnbG9iYWxseTogVGFiLCBBcnJvdy1MZWZ0L1JpZ2h0XG5cdFx0XHRjb25zdCB3aW5kb3cgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdFx0bGV0IHNhd0VzY2FwZUtleURvd24gPSBmYWxzZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3csICdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdFx0aWYgKGV2dC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdFx0c2F3RXNjYXBlS2V5RG93biA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlNb2QuQWx0KSkge1xuXHRcdFx0XHRcdGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGV2dC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblxuXHRcdFx0XHRcdC8vIEVudGVyIGluIGlucHV0IGZpZWxkIHNob3VsZCBPSyB0aGUgZGlhbG9nXG5cdFx0XHRcdFx0aWYgKHRoaXMuaW5wdXRzLnNvbWUoaW5wdXQgPT4gaW5wdXQuaGFzRm9jdXMoKSkpIHtcblx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdFx0XHRidXR0b246IGJ1dHRvbk1hcC5maW5kKGJ1dHRvbiA9PiBidXR0b24uaW5kZXggIT09IHRoaXMub3B0aW9ucy5jYW5jZWxJZCk/LmluZGV4ID8/IDAsXG5cdFx0XHRcdFx0XHRcdGNoZWNrYm94Q2hlY2tlZDogdGhpcy5jaGVja2JveCA/IHRoaXMuY2hlY2tib3guY2hlY2tlZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0dmFsdWVzOiB0aGlzLmlucHV0cy5sZW5ndGggPiAwID8gdGhpcy5pbnB1dHMubWFwKGlucHV0ID0+IGlucHV0LnZhbHVlKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBsZWF2ZSBkZWZhdWx0IGhhbmRsaW5nXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDbWQrRCAodHJpZ2dlciB0aGUgXCJub1wiL1wiZG8gbm90IHNhdmVcIi1idXR0b24pIChtYWNPUyBvbmx5KVxuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgZXZ0LmVxdWFscyhLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RCkpIHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgbm9CdXR0b24gPSBidXR0b25NYXAuZmluZChidXR0b24gPT4gYnV0dG9uLmluZGV4ID09PSAxICYmIGJ1dHRvbi5pbmRleCAhPT0gdGhpcy5vcHRpb25zLmNhbmNlbElkKTtcblx0XHRcdFx0XHRpZiAobm9CdXR0b24pIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdFx0XHRidXR0b246IG5vQnV0dG9uLmluZGV4LFxuXHRcdFx0XHRcdFx0XHRjaGVja2JveENoZWNrZWQ6IHRoaXMuY2hlY2tib3ggPyB0aGlzLmNoZWNrYm94LmNoZWNrZWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHZhbHVlczogdGhpcy5pbnB1dHMubGVuZ3RoID4gMCA/IHRoaXMuaW5wdXRzLm1hcChpbnB1dCA9PiBpbnB1dC52YWx1ZSkgOiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybjsgLy8gbGVhdmUgZGVmYXVsdCBoYW5kbGluZ1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGV2dC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGxlYXZlIGRlZmF1bHQgaGFuZGxpbmdcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBldmVudEhhbmRsZWQgPSBmYWxzZTtcblxuXHRcdFx0XHQvLyBGb2N1czogTmV4dCAvIFByZXZpb3VzXG5cdFx0XHRcdGNvbnN0IGlzQXJyb3dOYXZpZ2F0aW9uID0gZXZ0LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpIHx8IGV2dC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpO1xuXHRcdFx0XHRjb25zdCBpc0VkaXRhYmxlVGFyZ2V0ID0gaXNIVE1MRWxlbWVudChlLnRhcmdldCkgJiYgKGlzRWRpdGFibGVFbGVtZW50KGUudGFyZ2V0KSB8fCBlLnRhcmdldC5pc0NvbnRlbnRFZGl0YWJsZSk7XG5cdFx0XHRcdGlmIChldnQuZXF1YWxzKEtleUNvZGUuVGFiKSB8fCBldnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSB8fCBpc0Fycm93TmF2aWdhdGlvbiAmJiAhaXNFZGl0YWJsZVRhcmdldCkge1xuXG5cdFx0XHRcdFx0Ly8gQnVpbGQgYSBsaXN0IG9mIGZvY3VzYWJsZSBlbGVtZW50cyBpbiB0aGVpciB2aXN1YWwgb3JkZXJcblx0XHRcdFx0XHRjb25zdCBmb2N1c2FibGVFbGVtZW50czogeyBmb2N1czogKCkgPT4gdm9pZCB9W10gPSBbXTtcblx0XHRcdFx0XHRsZXQgZm9jdXNlZEluZGV4ID0gLTE7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5tZXNzYWdlQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmtzID0gdGhpcy5tZXNzYWdlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGxpbmspO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNBY3RpdmVFbGVtZW50KGxpbmspKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAoY29uc3QgaW5wdXQgb2YgdGhpcy5pbnB1dHMpIHtcblx0XHRcdFx0XHRcdGZvY3VzYWJsZUVsZW1lbnRzLnB1c2goaW5wdXQpO1xuXHRcdFx0XHRcdFx0aWYgKGlucHV0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGhpcy5jaGVja2JveCkge1xuXHRcdFx0XHRcdFx0Zm9jdXNhYmxlRWxlbWVudHMucHVzaCh0aGlzLmNoZWNrYm94KTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmNoZWNrYm94Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGhpcy5idXR0b25CYXIpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYnV0dG9uIG9mIHRoaXMuYnV0dG9uQmFyLmJ1dHRvbnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGJ1dHRvbiBpbnN0YW5jZW9mIEJ1dHRvbldpdGhEcm9wZG93bikge1xuXHRcdFx0XHRcdFx0XHRcdGZvY3VzYWJsZUVsZW1lbnRzLnB1c2goYnV0dG9uLnByaW1hcnlCdXR0b24pO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChidXR0b24ucHJpbWFyeUJ1dHRvbi5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGJ1dHRvbi5kcm9wZG93bkJ1dHRvbik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGJ1dHRvbi5kcm9wZG93bkJ1dHRvbi5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGJ1dHRvbik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGJ1dHRvbi5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0aGlzLmZvb3RlckNvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rcyA9IHRoaXMuZm9vdGVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGxpbmspO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNBY3RpdmVFbGVtZW50KGxpbmspKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEZvY3VzIG5leHQgZWxlbWVudCAod2l0aCB3cmFwcGluZylcblx0XHRcdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlDb2RlLlRhYikgfHwgZXZ0LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdGb2N1c2VkSW5kZXggPSAoZm9jdXNlZEluZGV4ICsgMSkgJSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGg7XG5cdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50c1tuZXdGb2N1c2VkSW5kZXhdLmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRm9jdXMgcHJldmlvdXMgZWxlbWVudCAod2l0aCB3cmFwcGluZylcblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChmb2N1c2VkSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGZvY3VzZWRJbmRleCA9IGZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aDsgLy8gZGVmYXVsdCB0byBmb2N1cyBsYXN0IGVsZW1lbnQgaWYgbm9uZSBoYXZlIGZvY3VzXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGxldCBuZXdGb2N1c2VkSW5kZXggPSBmb2N1c2VkSW5kZXggLSAxO1xuXHRcdFx0XHRcdFx0aWYgKG5ld0ZvY3VzZWRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0bmV3Rm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Zm9jdXNhYmxlRWxlbWVudHNbbmV3Rm9jdXNlZEluZGV4XS5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGV2ZW50SGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZlbnRIYW5kbGVkKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMua2V5RXZlbnRQcm9jZXNzb3IpIHtcblx0XHRcdFx0XHR0aGlzLm9wdGlvbnMua2V5RXZlbnRQcm9jZXNzb3IoZXZ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdHJ1ZSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCAna2V5dXAnLCBlID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMub3B0aW9ucy5kaXNhYmxlQ2xvc2VBY3Rpb24gJiYgZXZ0LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkgJiYgc2F3RXNjYXBlS2V5RG93bikge1xuXHRcdFx0XHRcdGNsb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRydWUpKTtcblxuXHRcdFx0Ly8gRGV0ZWN0IGZvY3VzIG91dFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgJ2ZvY3Vzb3V0JywgZSA9PiB7XG5cdFx0XHRcdGlmICghIWUucmVsYXRlZFRhcmdldCAmJiAhIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdGlmICghaXNBbmNlc3RvcihlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQsIHRoaXMuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdC8vIFRlbXBvcmFyeTogbGV0IGZvY3VzIGVzY2FwZSBmb3IgYm9keS1sZXZlbCBwb3B1cHMuXG5cdFx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyMzkyMFxuXHRcdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5pc0V4dGVybmFsRm9jdXNBbGxvd2VkPy4oZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzVG9SZXR1cm4gPSBlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRcdFx0XHRcdGlmIChlLnRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmZvY3VzKCk7XG5cdFx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LCBmYWxzZSkpO1xuXG5cdFx0XHRjb25zdCBzcGluTW9kaWZpZXJDbGFzc05hbWUgPSAnY29kaWNvbi1tb2RpZmllci1zcGluJztcblxuXHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlhbG9nRXJyb3IpLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpYWxvZ1dhcm5pbmcpLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpYWxvZ0luZm8pLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmxvYWRpbmcpLCBzcGluTW9kaWZpZXJDbGFzc05hbWUpO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmljb24pIHtcblx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMub3B0aW9ucy5pY29uKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzd2l0Y2ggKHRoaXMub3B0aW9ucy50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlhbG9nRXJyb3IpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3dhcm5pbmcnOlxuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlhbG9nV2FybmluZykpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncGVuZGluZyc6XG5cdFx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sb2FkaW5nKSwgc3Bpbk1vZGlmaWVyQ2xhc3NOYW1lKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ25vbmUnOlxuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKCduby1jb2RpY29uJyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdpbmZvJzpcblx0XHRcdFx0XHRjYXNlICdxdWVzdGlvbic6XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpYWxvZ0luZm8pKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5vcHRpb25zLmRpc2FibGVDbG9zZUFjdGlvbiAmJiAhdGhpcy5vcHRpb25zLmRpc2FibGVDbG9zZUJ1dHRvbikge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMudG9vbGJhckNvbnRhaW5lciwge30pKTtcblxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdkaWFsb2cuY2xvc2UnLCBsb2NhbGl6ZSgnZGlhbG9nQ2xvc2UnLCBcIkNsb3NlIERpYWxvZ1wiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGlhbG9nQ2xvc2UpLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRidXR0b246IHRoaXMub3B0aW9ucy5jYW5jZWxJZCB8fCAwLFxuXHRcdFx0XHRcdFx0Y2hlY2tib3hDaGVja2VkOiB0aGlzLmNoZWNrYm94ID8gdGhpcy5jaGVja2JveC5jaGVja2VkIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRhY3Rpb25CYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbW9kYWwnLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbGxlZGJ5JywgJ21vbmFjby1kaWFsb2ctaWNvbiBtb25hY28tZGlhbG9nLW1lc3NhZ2UtdGV4dCcpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmliZWRieScsICdtb25hY28tZGlhbG9nLWljb24gbW9uYWNvLWRpYWxvZy1tZXNzYWdlLXRleHQgbW9uYWNvLWRpYWxvZy1tZXNzYWdlLWRldGFpbCBtb25hY28tZGlhbG9nLW1lc3NhZ2UtYm9keSBtb25hY28tZGlhbG9nLWZvb3RlcicpO1xuXHRcdFx0c2hvdyh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0XHQvLyBOb3RpZnkgdmlzaWJpbGl0eSBjaGFuZ2Vcblx0XHRcdHRoaXMub3B0aW9ucy5vblZpc2liaWxpdHlDaGFuZ2U/Lih3aW5kb3csIHRydWUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMub3B0aW9ucy5vblZpc2liaWxpdHlDaGFuZ2U/Lih3aW5kb3csIGZhbHNlKSkpO1xuXG5cdFx0XHQvLyBGb2N1cyBmaXJzdCBlbGVtZW50IChpbnB1dCBvciBidXR0b24pXG5cdFx0XHRpZiAodGhpcy5pbnB1dHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmlucHV0c1swXS5mb2N1cygpO1xuXHRcdFx0XHR0aGlzLmlucHV0c1swXS5zZWxlY3QoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBmb2N1c2VkQnV0dG9uID0gZmFsc2U7XG5cdFx0XHRcdGJ1dHRvbk1hcC5mb3JFYWNoKCh2YWx1ZSwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRpZiAodmFsdWUuaW5kZXggPT09IDApIHtcblx0XHRcdFx0XHRcdGJ1dHRvbkJhci5idXR0b25zW2luZGV4XS5mb2N1cygpO1xuXHRcdFx0XHRcdFx0Zm9jdXNlZEJ1dHRvbiA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFmb2N1c2VkQnV0dG9uKSB7XG5cdFx0XHRcdFx0KHRoaXMuZm9vdGVyQWN0aW9uVG9Gb2N1cyA/PyB0aGlzLmVsZW1lbnQpLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlTdHlsZXMoKSB7XG5cdFx0Y29uc3Qgc3R5bGUgPSB0aGlzLm9wdGlvbnMuZGlhbG9nU3R5bGVzO1xuXG5cdFx0Y29uc3QgZmdDb2xvciA9IHN0eWxlLmRpYWxvZ0ZvcmVncm91bmQ7XG5cdFx0Y29uc3QgYmdDb2xvciA9IHN0eWxlLmRpYWxvZ0JhY2tncm91bmQ7XG5cdFx0Y29uc3Qgc2hhZG93Q29sb3IgPSBzdHlsZS5kaWFsb2dTaGFkb3cgPyBgMCAwcHggOHB4ICR7c3R5bGUuZGlhbG9nU2hhZG93fWAgOiAnJztcblx0XHRjb25zdCBib3JkZXIgPSBzdHlsZS5kaWFsb2dCb3JkZXIgPyBgMXB4IHNvbGlkICR7c3R5bGUuZGlhbG9nQm9yZGVyfWAgOiAnJztcblx0XHRjb25zdCBsaW5rRmdDb2xvciA9IHN0eWxlLnRleHRMaW5rRm9yZWdyb3VuZDtcblxuXHRcdHRoaXMuc2hhZG93RWxlbWVudC5zdHlsZS5ib3hTaGFkb3cgPSBzaGFkb3dDb2xvcjtcblxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jb2xvciA9IGZnQ29sb3IgPz8gJyc7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJnQ29sb3IgPz8gJyc7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlciA9IGJvcmRlcjtcblxuXHRcdGlmIChsaW5rRmdDb2xvcikge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRmb3IgKGNvbnN0IGVsIG9mIFsuLi50aGlzLm1lc3NhZ2VDb250YWluZXIuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2EnKSwgLi4udGhpcy5mb290ZXJDb250YWluZXI/LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdhJykgPz8gW11dKSB7XG5cdFx0XHRcdGlmIChlbC5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1idXR0b24nKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsLnN0eWxlLmNvbG9yID0gbGlua0ZnQ29sb3I7XG5cdFx0XHRcdC8vIEVuc3VyZSBsaW5rcyBhcmUgZGlzdGluZ3Vpc2hhYmxlIGJ5IG1vcmUgdGhhbiBqdXN0IGNvbG9yIChXQ0FHIDEuNC4xKVxuXHRcdFx0XHRlbC5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBjb2xvcjtcblx0XHRzd2l0Y2ggKHRoaXMub3B0aW9ucy50eXBlKSB7XG5cdFx0XHRjYXNlICdub25lJzpcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdGNvbG9yID0gc3R5bGUuZXJyb3JJY29uRm9yZWdyb3VuZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICd3YXJuaW5nJzpcblx0XHRcdFx0Y29sb3IgPSBzdHlsZS53YXJuaW5nSWNvbkZvcmVncm91bmQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Y29sb3IgPSBzdHlsZS5pbmZvSWNvbkZvcmVncm91bmQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpZiAoY29sb3IpIHtcblx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUuY29sb3IgPSBjb2xvcjtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdGlmICh0aGlzLm1vZGFsRWxlbWVudCkge1xuXHRcdFx0dGhpcy5tb2RhbEVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLm1vZGFsRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5mb2N1c1RvUmV0dXJuICYmIGlzQW5jZXN0b3IodGhpcy5mb2N1c1RvUmV0dXJuLCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmJvZHkpKSB7XG5cdFx0XHR0aGlzLmZvY3VzVG9SZXR1cm4uZm9jdXMoKTtcblx0XHRcdHRoaXMuZm9jdXNUb1JldHVybiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYXJyYW5nZUJ1dHRvbnMoYnV0dG9uczogQXJyYXk8c3RyaW5nPiwgY2FuY2VsSWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IEJ1dHRvbk1hcEVudHJ5W10ge1xuXG5cdFx0Ly8gTWFwcyBlYWNoIGJ1dHRvbiB0byBpdHMgY3VycmVudCBsYWJlbCBhbmQgb2xkIGluZGV4XG5cdFx0Ly8gc28gdGhhdCB3aGVuIHdlIG1vdmUgdGhlbSBhcm91bmQgaXQncyBub3QgYSBwcm9ibGVtXG5cdFx0Y29uc3QgYnV0dG9uTWFwOiBCdXR0b25NYXBFbnRyeVtdID0gYnV0dG9ucy5tYXAoKGxhYmVsLCBpbmRleCkgPT4gKHsgbGFiZWwsIGluZGV4IH0pKTtcblxuXHRcdGlmIChidXR0b25zLmxlbmd0aCA8IDIgfHwgdGhpcy5vcHRpb25zLmFsaWdubWVudCA9PT0gRGlhbG9nQ29udGVudHNBbGlnbm1lbnQuVmVydGljYWwpIHtcblx0XHRcdHJldHVybiBidXR0b25NYXA7IC8vIG9ubHkgbmVlZCB0byByZWFycmFuZ2UgaWYgdGhlcmUgYXJlIDIrIGJ1dHRvbnMgYW5kIHRoZSBhbGlnbm1lbnQgaXMgbGVmdC10by1yaWdodFxuXHRcdH1cblxuXHRcdGlmIChpc01hY2ludG9zaCB8fCBpc0xpbnV4KSB7XG5cblx0XHRcdC8vIExpbnV4OiB0aGUgR05PTUUgSElHIChodHRwczovL2RldmVsb3Blci5nbm9tZS5vcmcvaGlnL3BhdHRlcm5zL2ZlZWRiYWNrL2RpYWxvZ3MuaHRtbD9oaWdobGlnaHQ9ZGlhbG9nKVxuXHRcdFx0Ly8gcmVjb21tZW5kIHRoZSBmb2xsb3dpbmc6XG5cdFx0XHQvLyBcIkFsd2F5cyBlbnN1cmUgdGhhdCB0aGUgY2FuY2VsIGJ1dHRvbiBhcHBlYXJzIGZpcnN0LCBiZWZvcmUgdGhlIGFmZmlybWF0aXZlIGJ1dHRvbi4gSW4gbGVmdC10by1yaWdodFxuXHRcdFx0Ly8gIGxvY2FsZXMsIHRoaXMgaXMgb24gdGhlIGxlZnQuIFRoaXMgYnV0dG9uIG9yZGVyIGVuc3VyZXMgdGhhdCB1c2VycyBiZWNvbWUgYXdhcmUgb2YsIGFuZCBhcmUgcmVtaW5kZWRcblx0XHRcdC8vICBvZiwgdGhlIGFiaWxpdHkgdG8gY2FuY2VsIHByaW9yIHRvIGVuY291bnRlcmluZyB0aGUgYWZmaXJtYXRpdmUgYnV0dG9uLlwiXG5cblx0XHRcdC8vIG1hY09TOiB0aGUgSElHIChodHRwczovL2RldmVsb3Blci5hcHBsZS5jb20vZGVzaWduL2h1bWFuLWludGVyZmFjZS1ndWlkZWxpbmVzL2NvbXBvbmVudHMvcHJlc2VudGF0aW9uL2FsZXJ0cylcblx0XHRcdC8vIHJlY29tbWVuZCB0aGUgZm9sbG93aW5nOlxuXHRcdFx0Ly8gXCJQbGFjZSBidXR0b25zIHdoZXJlIHBlb3BsZSBleHBlY3QuIEluIGdlbmVyYWwsIHBsYWNlIHRoZSBidXR0b24gcGVvcGxlIGFyZSBtb3N0IGxpa2VseSB0byBjaG9vc2Ugb24gdGhlIHRyYWlsaW5nIHNpZGUgaW4gYVxuXHRcdFx0Ly8gIHJvdyBvZiBidXR0b25zIG9yIGF0IHRoZSB0b3AgaW4gYSBzdGFjayBvZiBidXR0b25zLiBBbHdheXMgcGxhY2UgdGhlIGRlZmF1bHQgYnV0dG9uIG9uIHRoZSB0cmFpbGluZyBzaWRlIG9mIGEgcm93IG9yIGF0IHRoZVxuXHRcdFx0Ly8gIHRvcCBvZiBhIHN0YWNrLiBDYW5jZWwgYnV0dG9ucyBhcmUgdHlwaWNhbGx5IG9uIHRoZSBsZWFkaW5nIHNpZGUgb2YgYSByb3cgb3IgYXQgdGhlIGJvdHRvbSBvZiBhIHN0YWNrLlwiXG5cblx0XHRcdGlmICh0eXBlb2YgY2FuY2VsSWQgPT09ICdudW1iZXInICYmIGJ1dHRvbk1hcFtjYW5jZWxJZF0pIHtcblx0XHRcdFx0Y29uc3QgY2FuY2VsQnV0dG9uID0gYnV0dG9uTWFwLnNwbGljZShjYW5jZWxJZCwgMSlbMF07XG5cdFx0XHRcdGJ1dHRvbk1hcC5zcGxpY2UoMSwgMCwgY2FuY2VsQnV0dG9uKTtcblx0XHRcdH1cblxuXHRcdFx0YnV0dG9uTWFwLnJldmVyc2UoKTtcblx0XHR9IGVsc2UgaWYgKGlzV2luZG93cykge1xuXG5cdFx0XHQvLyBXaW5kb3dzOiB0aGUgSElHIChodHRwczovL2xlYXJuLm1pY3Jvc29mdC5jb20vZW4tdXMvd2luZG93cy93aW4zMi91eGd1aWRlL3dpbi1kaWFsb2ctYm94KVxuXHRcdFx0Ly8gcmVjb21tZW5kIHRoZSBmb2xsb3dpbmc6XG5cdFx0XHQvLyBcIk9uZSBvZiB0aGUgZm9sbG93aW5nIHNldHMgb2YgY29uY2lzZSBjb21tYW5kczogWWVzL05vLCBZZXMvTm8vQ2FuY2VsLCBbRG8gaXRdL0NhbmNlbCxcblx0XHRcdC8vICBbRG8gaXRdL1tEb24ndCBkbyBpdF0sIFtEbyBpdF0vW0Rvbid0IGRvIGl0XS9DYW5jZWwuXCJcblxuXHRcdFx0aWYgKHR5cGVvZiBjYW5jZWxJZCA9PT0gJ251bWJlcicgJiYgYnV0dG9uTWFwW2NhbmNlbElkXSkge1xuXHRcdFx0XHRjb25zdCBjYW5jZWxCdXR0b24gPSBidXR0b25NYXAuc3BsaWNlKGNhbmNlbElkLCAxKVswXTtcblx0XHRcdFx0YnV0dG9uTWFwLnB1c2goY2FuY2VsQnV0dG9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYnV0dG9uTWFwO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxHQUFHLHVCQUF1QiwrQkFBK0IsV0FBVyxhQUFhLFdBQVcsV0FBVyxNQUFNLGlCQUFpQixZQUFZLG1CQUFtQixlQUFlLFlBQVk7QUFDak0sU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXLG9CQUFvQix1QkFBdUIsMEJBQThFO0FBQzdJLFNBQTBCLGdCQUFnQjtBQUMxQyxTQUEwQixnQkFBZ0I7QUFDMUMsU0FBUyxRQUFRLGdCQUFnQjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEQsU0FBUyx3QkFBd0I7QUFRMUIsSUFBSywwQkFBTCxrQkFBS0EsNkJBQUw7QUFNTixFQUFBQSxrREFBQSxnQkFBYSxLQUFiO0FBS0EsRUFBQUEsa0RBQUE7QUFYVyxTQUFBQTtBQUFBLEdBQUE7QUErRUwsTUFBTSxlQUFlLFdBQVc7QUFBQSxFQW9CdEMsWUFBb0IsV0FBZ0MsU0FBaUIsU0FBZ0QsU0FBeUI7QUFDN0ksVUFBTTtBQURhO0FBQWdDO0FBQWlFO0FBSXBILFNBQUssZUFBZSxLQUFLLFVBQVUsWUFBWSxFQUFFLG1DQUFtQyxDQUFDO0FBQ3JGLFFBQUksUUFBUSx3QkFBd0I7QUFDbkMsV0FBSyxhQUFhLFVBQVUsSUFBSSxHQUFHLFFBQVEsc0JBQXNCO0FBQUEsSUFDbEU7QUFDQSxTQUFLLFVBQVUsOEJBQThCLEtBQUssY0FBYyxVQUFVLE9BQU8sT0FBSztBQUNyRixVQUFJLEVBQUUsV0FBVyxLQUFLLGNBQWM7QUFDbkMsYUFBSyxRQUFRLE1BQU07QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxnQkFBZ0IsS0FBSyxhQUFhLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQztBQUN0RSxTQUFLLFVBQVUsS0FBSyxjQUFjLFlBQVksRUFBRSxvQkFBb0IsQ0FBQztBQUNyRSxRQUFJLFFBQVEsY0FBYyxrQkFBa0M7QUFDM0QsV0FBSyxRQUFRLFVBQVUsSUFBSSxnQkFBZ0I7QUFBQSxJQUM1QztBQUNBLFFBQUksUUFBUSxjQUFjO0FBQ3pCLFdBQUssUUFBUSxVQUFVLElBQUksR0FBRyxRQUFRLFlBQVk7QUFBQSxJQUNuRDtBQUNBLFNBQUssUUFBUSxhQUFhLFFBQVEsUUFBUTtBQUMxQyxTQUFLLFFBQVEsV0FBVztBQUN4QixTQUFLLEtBQUssT0FBTztBQUdqQixRQUFJLEtBQUssUUFBUSxjQUFjO0FBQzlCLFdBQUssa0JBQWtCLEtBQUssUUFBUSxZQUFZLEVBQUUsb0JBQW9CLENBQUM7QUFFdkUsWUFBTSxlQUFlLEtBQUssZ0JBQWdCLFlBQVksRUFBRSxxQ0FBcUMsQ0FBQztBQUM5RixXQUFLLFFBQVEsYUFBYSxZQUFZO0FBR3RDLGlCQUFXLE1BQU0sS0FBSyxnQkFBZ0IsaUJBQWlCLEdBQUcsR0FBRztBQUM1RCxXQUFHLFdBQVc7QUFDZCxhQUFLLHdCQUF3QjtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUdBLFNBQUssZUFBZSxRQUFRO0FBRTVCLFFBQUksTUFBTSxRQUFRLE9BQU8sS0FBSyxRQUFRLFNBQVMsR0FBRztBQUNqRCxXQUFLLFVBQVU7QUFBQSxJQUNoQixXQUFXLENBQUMsS0FBSyxRQUFRLHNCQUFzQjtBQUM5QyxXQUFLLFVBQVUsQ0FBQyxTQUFTLE1BQU0sSUFBSSxDQUFDO0FBQUEsSUFDckMsT0FBTztBQUNOLFdBQUssVUFBVSxDQUFDO0FBQUEsSUFDakI7QUFDQSxVQUFNLG9CQUFvQixLQUFLLFFBQVEsWUFBWSxFQUFFLHFCQUFxQixDQUFDO0FBQzNFLFNBQUssbUJBQW1CLGtCQUFrQixZQUFZLEVBQUUsaUJBQWlCLENBQUM7QUFHMUUsVUFBTSxvQkFBb0IsS0FBSyxRQUFRLFlBQVksRUFBRSxxQkFBcUIsQ0FBQztBQUMzRSxTQUFLLGNBQWMsa0JBQWtCLFlBQVksRUFBRSxpQ0FBaUMsQ0FBQztBQUNyRixTQUFLLFlBQVksYUFBYSxjQUFjLEtBQUssaUJBQWlCLENBQUM7QUFDbkUsU0FBSyxtQkFBbUIsa0JBQWtCLFlBQVksRUFBRSwyQkFBMkIsQ0FBQztBQUVwRixVQUFNLFlBQVksQ0FBQyxDQUFDLEtBQUssUUFBUSxVQUFVLENBQUMsQ0FBQyxLQUFLLFFBQVE7QUFDMUQsUUFBSSxhQUFhLEtBQUssUUFBUSxZQUFZO0FBQ3pDLFlBQU0saUJBQWlCLEtBQUssaUJBQWlCLFlBQVksRUFBRSxpQkFBaUIsQ0FBQztBQUM3RSxZQUFNLHFCQUFxQixlQUFlLFlBQVksRUFBRSxpREFBaUQsQ0FBQztBQUMxRyx5QkFBbUIsWUFBWSxLQUFLO0FBQUEsSUFDckM7QUFFQSxTQUFLLHVCQUF1QixLQUFLLGlCQUFpQixZQUFZLEVBQUUscURBQXFELENBQUM7QUFDdEgsUUFBSSxLQUFLLFFBQVEsZUFBZTtBQUMvQixXQUFLLHFCQUFxQixZQUFZLEtBQUssUUFBUSxhQUFhO0FBQUEsSUFDakUsV0FBVyxhQUFhLENBQUMsS0FBSyxRQUFRLFlBQVk7QUFDakQsV0FBSyxxQkFBcUIsWUFBWSxLQUFLLFFBQVEsU0FBUyxLQUFLLFFBQVEsU0FBUztBQUFBLElBQ25GLE9BQU87QUFDTixXQUFLLHFCQUFxQixNQUFNLFVBQVU7QUFBQSxJQUMzQztBQUVBLFFBQUksS0FBSyxRQUFRLFlBQVk7QUFDNUIsWUFBTSxhQUFhLEtBQUssaUJBQWlCLFlBQVksRUFBRSxpREFBaUQsQ0FBQztBQUN6RyxXQUFLLFFBQVEsV0FBVyxVQUFVO0FBQUEsSUFDbkM7QUFFQSxRQUFJLEtBQUssUUFBUSxjQUFjLEtBQUssUUFBUSxlQUFlO0FBRTFELGlCQUFXLE1BQU0sS0FBSyxpQkFBaUIsaUJBQWlCLEdBQUcsR0FBRztBQUM3RCxXQUFHLFdBQVc7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxRQUFRLFFBQVE7QUFDeEIsV0FBSyxTQUFTLEtBQUssUUFBUSxPQUFPLElBQUksV0FBUztBQUM5QyxjQUFNLGtCQUFrQixLQUFLLGlCQUFpQixZQUFZLEVBQUUsdUJBQXVCLENBQUM7QUFFcEYsY0FBTSxXQUFXLEtBQUssVUFBVSxJQUFJLFNBQVMsaUJBQWlCLFFBQVc7QUFBQSxVQUN4RSxhQUFhLE1BQU07QUFBQSxVQUNuQixNQUFNLE1BQU0sUUFBUTtBQUFBLFVBQ3BCLGdCQUFnQixRQUFRO0FBQUEsUUFDekIsQ0FBQyxDQUFDO0FBRUYsWUFBSSxNQUFNLE9BQU87QUFDaEIsbUJBQVMsUUFBUSxNQUFNO0FBQUEsUUFDeEI7QUFFQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sV0FBSyxTQUFTLENBQUM7QUFBQSxJQUNoQjtBQUdBLFFBQUksS0FBSyxRQUFRLGVBQWU7QUFDL0IsWUFBTSxxQkFBcUIsS0FBSyxpQkFBaUIsWUFBWSxFQUFFLHNCQUFzQixDQUFDO0FBRXRGLFlBQU0sV0FBVyxLQUFLLFdBQVcsS0FBSztBQUFBLFFBQ3JDLElBQUksU0FBUyxLQUFLLFFBQVEsZUFBZSxDQUFDLENBQUMsS0FBSyxRQUFRLGlCQUFpQixRQUFRLGNBQWM7QUFBQSxNQUNoRztBQUVBLHlCQUFtQixZQUFZLFNBQVMsT0FBTztBQUUvQyxZQUFNLHlCQUF5QixtQkFBbUIsWUFBWSxFQUFFLDBCQUEwQixDQUFDO0FBQzNGLDZCQUF1QixZQUFZLEtBQUssUUFBUTtBQUNoRCxXQUFLLFVBQVUsc0JBQXNCLHdCQUF3QixVQUFVLE9BQU8sTUFBTSxTQUFTLFVBQVUsQ0FBQyxTQUFTLE9BQU8sQ0FBQztBQUFBLElBQzFIO0FBR0EsVUFBTSxvQkFBb0IsS0FBSyxRQUFRLFlBQVksRUFBRSxxQkFBcUIsQ0FBQztBQUMzRSxTQUFLLG1CQUFtQixrQkFBa0IsWUFBWSxFQUFFLGlCQUFpQixDQUFDO0FBRTFFLFNBQUssWUFBWTtBQUFBLEVBQ2xCO0FBQUEsRUFFUSxtQkFBMkI7QUFDbEMsUUFBSSxZQUFZLFNBQVMscUJBQXFCLE1BQU07QUFDcEQsWUFBUSxLQUFLLFFBQVEsTUFBTTtBQUFBLE1BQzFCLEtBQUs7QUFDSixvQkFBWSxTQUFTLHNCQUFzQixPQUFPO0FBQ2xEO0FBQUEsTUFDRCxLQUFLO0FBQ0osb0JBQVksU0FBUyx3QkFBd0IsU0FBUztBQUN0RDtBQUFBLE1BQ0QsS0FBSztBQUNKLG9CQUFZLFNBQVMsd0JBQXdCLGFBQWE7QUFDMUQ7QUFBQSxNQUNELEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMO0FBQ0M7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsU0FBdUI7QUFDcEMsU0FBSyxxQkFBcUIsWUFBWTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxNQUFNLE9BQStCO0FBQ3BDLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxjQUFjO0FBRWxELFdBQU8sSUFBSSxRQUF1QixhQUFXO0FBQzVDLGdCQUFVLEtBQUssZ0JBQWdCO0FBRS9CLFlBQU0sUUFBUSxNQUFNO0FBQ25CLGdCQUFRO0FBQUEsVUFDUCxRQUFRLEtBQUssUUFBUSxZQUFZO0FBQUEsVUFDakMsaUJBQWlCLEtBQUssV0FBVyxLQUFLLFNBQVMsVUFBVTtBQUFBLFFBQzFELENBQUM7QUFDRDtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFVBQVUsYUFBYSxLQUFLLENBQUM7QUFFbEMsWUFBTSxZQUFZLEtBQUssWUFBWSxLQUFLLFVBQVUsSUFBSSxVQUFVLEtBQUssa0JBQWtCLEVBQUUsV0FBVyxLQUFLLFNBQVMsY0FBYyxtQkFBbUMsbUJBQW1CLFdBQVcsbUJBQW1CLFdBQVcsQ0FBQyxDQUFDO0FBQ2pPLFlBQU0sWUFBWSxLQUFLLGlCQUFpQixLQUFLLFNBQVMsS0FBSyxRQUFRLFFBQVE7QUFFM0UsWUFBTSxnQkFBZ0IsQ0FBQyxVQUFrQjtBQUN4QyxnQkFBUTtBQUFBLFVBQ1AsUUFBUSxVQUFVLEtBQUssRUFBRTtBQUFBLFVBQ3pCLGlCQUFpQixLQUFLLFdBQVcsS0FBSyxTQUFTLFVBQVU7QUFBQSxVQUN6RCxRQUFRLEtBQUssT0FBTyxTQUFTLElBQUksS0FBSyxPQUFPLElBQUksV0FBUyxNQUFNLEtBQUssSUFBSTtBQUFBLFFBQzFFLENBQUM7QUFBQSxNQUNGO0FBR0EsZ0JBQVUsUUFBUSxDQUFDLEdBQUcsVUFBVTtBQUMvQixjQUFNLFVBQVUsVUFBVSxLQUFLLEVBQUUsVUFBVTtBQUUzQyxZQUFJO0FBQ0osY0FBTSxnQkFBZ0IsS0FBSyxRQUFRLGdCQUFnQixVQUFVLEtBQUssR0FBRyxLQUFLO0FBQzFFLFlBQUksV0FBVyxLQUFLLFNBQVMsdUJBQXVCO0FBQ25ELGdCQUFNLFVBQVUsaUJBQWlCLEtBQUssUUFBUSxzQkFBc0IsT0FBTyxJQUFJLEtBQUssUUFBUSxzQkFBc0IsUUFBUSxXQUFXLElBQUksS0FBSyxRQUFRLHNCQUFzQjtBQUM1SyxtQkFBUyxLQUFLLFVBQVUsVUFBVSxzQkFBc0I7QUFBQSxZQUN2RCxHQUFHLEtBQUssUUFBUTtBQUFBLFlBQ2hCLEdBQUcsS0FBSztBQUFBLFlBQ1IsZUFBZTtBQUFBO0FBQUEsWUFDZixTQUFTLFFBQVEsSUFBSSxZQUFVLFNBQVM7QUFBQSxjQUN2QyxHQUFHO0FBQUEsY0FDSCxLQUFLLFlBQVk7QUFDaEIsc0JBQU0sT0FBTyxJQUFJO0FBRWpCLDhCQUFjLEtBQUs7QUFBQSxjQUNwQjtBQUFBLFlBQ0QsQ0FBQyxDQUFDO0FBQUEsVUFDSCxDQUFDLENBQUM7QUFBQSxRQUNILFdBQVcsZUFBZSxVQUFVO0FBQ25DLG1CQUFTLEtBQUssVUFBVSxVQUFVLHlCQUF5QixFQUFFLFdBQVcsQ0FBQyxTQUFTLEdBQUcsS0FBSyxhQUFhLENBQUMsQ0FBQztBQUFBLFFBQzFHLE9BQU87QUFDTixtQkFBUyxLQUFLLFVBQVUsVUFBVSxVQUFVLEVBQUUsV0FBVyxDQUFDLFNBQVMsR0FBRyxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQUEsUUFDM0Y7QUFFQSxZQUFJLGVBQWUsYUFBYTtBQUMvQix3QkFBYyxZQUFZLE1BQU07QUFBQSxRQUNqQztBQUVBLGVBQU8sUUFBUSxvQkFBb0IsVUFBVSxLQUFLLEVBQUUsT0FBTyxJQUFJO0FBQy9ELFlBQUksa0JBQWtCLHVCQUF1QjtBQUM1QyxjQUFJLGVBQWUsVUFBVTtBQUM1QixtQkFBTyxjQUFjLGVBQWU7QUFBQSxVQUNyQztBQUFBLFFBQ0Q7QUFDQSxhQUFLLFVBQVUsT0FBTyxXQUFXLE9BQUs7QUFDckMsY0FBSSxHQUFHO0FBQ04sd0JBQVksS0FBSyxDQUFDO0FBQUEsVUFDbkI7QUFFQSx3QkFBYyxLQUFLO0FBQUEsUUFDcEIsQ0FBQyxDQUFDO0FBQUEsTUFDSCxDQUFDO0FBR0QsWUFBTSxTQUFTLFVBQVUsS0FBSyxTQUFTO0FBQ3ZDLFVBQUksbUJBQW1CO0FBQ3ZCLFdBQUssVUFBVSxzQkFBc0IsUUFBUSxXQUFXLE9BQUs7QUFDNUQsY0FBTSxNQUFNLElBQUksc0JBQXNCLENBQUM7QUFFdkMsWUFBSSxJQUFJLE9BQU8sUUFBUSxNQUFNLEdBQUc7QUFDL0IsNkJBQW1CO0FBQUEsUUFDcEI7QUFFQSxZQUFJLElBQUksT0FBTyxPQUFPLEdBQUcsR0FBRztBQUMzQixjQUFJLGVBQWU7QUFBQSxRQUNwQjtBQUVBLFlBQUksSUFBSSxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBRzlCLGNBQUksS0FBSyxPQUFPLEtBQUssV0FBUyxNQUFNLFNBQVMsQ0FBQyxHQUFHO0FBQ2hELHdCQUFZLEtBQUssQ0FBQztBQUVsQixvQkFBUTtBQUFBLGNBQ1AsUUFBUSxVQUFVLEtBQUssWUFBVSxPQUFPLFVBQVUsS0FBSyxRQUFRLFFBQVEsR0FBRyxTQUFTO0FBQUEsY0FDbkYsaUJBQWlCLEtBQUssV0FBVyxLQUFLLFNBQVMsVUFBVTtBQUFBLGNBQ3pELFFBQVEsS0FBSyxPQUFPLFNBQVMsSUFBSSxLQUFLLE9BQU8sSUFBSSxXQUFTLE1BQU0sS0FBSyxJQUFJO0FBQUEsWUFDMUUsQ0FBQztBQUFBLFVBQ0Y7QUFFQTtBQUFBLFFBQ0Q7QUFHQSxZQUFJLGVBQWUsSUFBSSxPQUFPLE9BQU8sVUFBVSxRQUFRLElBQUksR0FBRztBQUM3RCxzQkFBWSxLQUFLLENBQUM7QUFFbEIsZ0JBQU0sV0FBVyxVQUFVLEtBQUssWUFBVSxPQUFPLFVBQVUsS0FBSyxPQUFPLFVBQVUsS0FBSyxRQUFRLFFBQVE7QUFDdEcsY0FBSSxVQUFVO0FBQ2Isb0JBQVE7QUFBQSxjQUNQLFFBQVEsU0FBUztBQUFBLGNBQ2pCLGlCQUFpQixLQUFLLFdBQVcsS0FBSyxTQUFTLFVBQVU7QUFBQSxjQUN6RCxRQUFRLEtBQUssT0FBTyxTQUFTLElBQUksS0FBSyxPQUFPLElBQUksV0FBUyxNQUFNLEtBQUssSUFBSTtBQUFBLFlBQzFFLENBQUM7QUFBQSxVQUNGO0FBRUE7QUFBQSxRQUNEO0FBRUEsWUFBSSxJQUFJLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDOUI7QUFBQSxRQUNEO0FBRUEsWUFBSSxlQUFlO0FBR25CLGNBQU0sb0JBQW9CLElBQUksT0FBTyxRQUFRLFVBQVUsS0FBSyxJQUFJLE9BQU8sUUFBUSxTQUFTO0FBQ3hGLGNBQU0sbUJBQW1CLGNBQWMsRUFBRSxNQUFNLE1BQU0sa0JBQWtCLEVBQUUsTUFBTSxLQUFLLEVBQUUsT0FBTztBQUM3RixZQUFJLElBQUksT0FBTyxRQUFRLEdBQUcsS0FBSyxJQUFJLE9BQU8sT0FBTyxRQUFRLFFBQVEsR0FBRyxLQUFLLHFCQUFxQixDQUFDLGtCQUFrQjtBQUdoSCxnQkFBTSxvQkFBNkMsQ0FBQztBQUNwRCxjQUFJLGVBQWU7QUFFbkIsY0FBSSxLQUFLLGtCQUFrQjtBQUUxQixrQkFBTSxRQUFRLEtBQUssaUJBQWlCLGlCQUFpQixHQUFHO0FBQ3hELHVCQUFXLFFBQVEsT0FBTztBQUN6QixnQ0FBa0IsS0FBSyxJQUFJO0FBQzNCLGtCQUFJLGdCQUFnQixJQUFJLEdBQUc7QUFDMUIsK0JBQWUsa0JBQWtCLFNBQVM7QUFBQSxjQUMzQztBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBRUEscUJBQVcsU0FBUyxLQUFLLFFBQVE7QUFDaEMsOEJBQWtCLEtBQUssS0FBSztBQUM1QixnQkFBSSxNQUFNLFNBQVMsR0FBRztBQUNyQiw2QkFBZSxrQkFBa0IsU0FBUztBQUFBLFlBQzNDO0FBQUEsVUFDRDtBQUVBLGNBQUksS0FBSyxVQUFVO0FBQ2xCLDhCQUFrQixLQUFLLEtBQUssUUFBUTtBQUNwQyxnQkFBSSxLQUFLLFNBQVMsU0FBUyxHQUFHO0FBQzdCLDZCQUFlLGtCQUFrQixTQUFTO0FBQUEsWUFDM0M7QUFBQSxVQUNEO0FBRUEsY0FBSSxLQUFLLFdBQVc7QUFDbkIsdUJBQVcsVUFBVSxLQUFLLFVBQVUsU0FBUztBQUM1QyxrQkFBSSxrQkFBa0Isb0JBQW9CO0FBQ3pDLGtDQUFrQixLQUFLLE9BQU8sYUFBYTtBQUMzQyxvQkFBSSxPQUFPLGNBQWMsU0FBUyxHQUFHO0FBQ3BDLGlDQUFlLGtCQUFrQixTQUFTO0FBQUEsZ0JBQzNDO0FBQ0Esa0NBQWtCLEtBQUssT0FBTyxjQUFjO0FBQzVDLG9CQUFJLE9BQU8sZUFBZSxTQUFTLEdBQUc7QUFDckMsaUNBQWUsa0JBQWtCLFNBQVM7QUFBQSxnQkFDM0M7QUFBQSxjQUNELE9BQU87QUFDTixrQ0FBa0IsS0FBSyxNQUFNO0FBQzdCLG9CQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLGlDQUFlLGtCQUFrQixTQUFTO0FBQUEsZ0JBQzNDO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBRUEsY0FBSSxLQUFLLGlCQUFpQjtBQUV6QixrQkFBTSxRQUFRLEtBQUssZ0JBQWdCLGlCQUFpQixHQUFHO0FBQ3ZELHVCQUFXLFFBQVEsT0FBTztBQUN6QixnQ0FBa0IsS0FBSyxJQUFJO0FBQzNCLGtCQUFJLGdCQUFnQixJQUFJLEdBQUc7QUFDMUIsK0JBQWUsa0JBQWtCLFNBQVM7QUFBQSxjQUMzQztBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBR0EsY0FBSSxJQUFJLE9BQU8sUUFBUSxHQUFHLEtBQUssSUFBSSxPQUFPLFFBQVEsVUFBVSxHQUFHO0FBQzlELGtCQUFNLG1CQUFtQixlQUFlLEtBQUssa0JBQWtCO0FBQy9ELDhCQUFrQixlQUFlLEVBQUUsTUFBTTtBQUFBLFVBQzFDLE9BR0s7QUFDSixnQkFBSSxpQkFBaUIsSUFBSTtBQUN4Qiw2QkFBZSxrQkFBa0I7QUFBQSxZQUNsQztBQUVBLGdCQUFJLGtCQUFrQixlQUFlO0FBQ3JDLGdCQUFJLG9CQUFvQixJQUFJO0FBQzNCLGdDQUFrQixrQkFBa0IsU0FBUztBQUFBLFlBQzlDO0FBRUEsOEJBQWtCLGVBQWUsRUFBRSxNQUFNO0FBQUEsVUFDMUM7QUFFQSx5QkFBZTtBQUFBLFFBQ2hCO0FBRUEsWUFBSSxjQUFjO0FBQ2pCLHNCQUFZLEtBQUssR0FBRyxJQUFJO0FBQUEsUUFDekIsV0FBVyxLQUFLLFFBQVEsbUJBQW1CO0FBQzFDLGVBQUssUUFBUSxrQkFBa0IsR0FBRztBQUFBLFFBQ25DO0FBQUEsTUFDRCxHQUFHLElBQUksQ0FBQztBQUVSLFdBQUssVUFBVSxzQkFBc0IsUUFBUSxTQUFTLE9BQUs7QUFDMUQsb0JBQVksS0FBSyxHQUFHLElBQUk7QUFDeEIsY0FBTSxNQUFNLElBQUksc0JBQXNCLENBQUM7QUFFdkMsWUFBSSxDQUFDLEtBQUssUUFBUSxzQkFBc0IsSUFBSSxPQUFPLFFBQVEsTUFBTSxLQUFLLGtCQUFrQjtBQUN2RixnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNELEdBQUcsSUFBSSxDQUFDO0FBR1IsV0FBSyxVQUFVLHNCQUFzQixLQUFLLFNBQVMsWUFBWSxPQUFLO0FBQ25FLFlBQUksQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxLQUFLLFNBQVM7QUFDeEMsY0FBSSxDQUFDLFdBQVcsRUFBRSxlQUE4QixLQUFLLE9BQU8sR0FBRztBQUc5RCxnQkFBSSxLQUFLLFFBQVEseUJBQXlCLEVBQUUsYUFBNEIsR0FBRztBQUMxRTtBQUFBLFlBQ0Q7QUFDQSxpQkFBSyxnQkFBZ0IsRUFBRTtBQUV2QixnQkFBSSxFQUFFLFFBQVE7QUFDYixjQUFDLEVBQUUsT0FBdUIsTUFBTTtBQUNoQywwQkFBWSxLQUFLLEdBQUcsSUFBSTtBQUFBLFlBQ3pCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELEdBQUcsS0FBSyxDQUFDO0FBRVQsWUFBTSx3QkFBd0I7QUFFOUIsV0FBSyxZQUFZLFVBQVUsT0FBTyxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsV0FBVyxHQUFHLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxhQUFhLEdBQUcsR0FBRyxVQUFVLGlCQUFpQixRQUFRLFVBQVUsR0FBRyxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsT0FBTyxHQUFHLHFCQUFxQjtBQUVwUSxVQUFJLEtBQUssUUFBUSxNQUFNO0FBQ3RCLGFBQUssWUFBWSxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixLQUFLLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDaEYsT0FBTztBQUNOLGdCQUFRLEtBQUssUUFBUSxNQUFNO0FBQUEsVUFDMUIsS0FBSztBQUNKLGlCQUFLLFlBQVksVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxXQUFXLENBQUM7QUFDakY7QUFBQSxVQUNELEtBQUs7QUFDSixpQkFBSyxZQUFZLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsYUFBYSxDQUFDO0FBQ25GO0FBQUEsVUFDRCxLQUFLO0FBQ0osaUJBQUssWUFBWSxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLE9BQU8sR0FBRyxxQkFBcUI7QUFDcEc7QUFBQSxVQUNELEtBQUs7QUFDSixpQkFBSyxZQUFZLFVBQVUsSUFBSSxZQUFZO0FBQzNDO0FBQUEsVUFDRCxLQUFLO0FBQUEsVUFDTCxLQUFLO0FBQUEsVUFDTDtBQUNDLGlCQUFLLFlBQVksVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxVQUFVLENBQUM7QUFDaEY7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxLQUFLLFFBQVEsc0JBQXNCLENBQUMsS0FBSyxRQUFRLG9CQUFvQjtBQUN6RSxjQUFNLFlBQVksS0FBSyxVQUFVLElBQUksVUFBVSxLQUFLLGtCQUFrQixDQUFDLENBQUMsQ0FBQztBQUV6RSxjQUFNLFNBQVMsS0FBSyxVQUFVLElBQUksT0FBTyxnQkFBZ0IsU0FBUyxlQUFlLGNBQWMsR0FBRyxVQUFVLFlBQVksUUFBUSxXQUFXLEdBQUcsTUFBTSxZQUFZO0FBQy9KLGtCQUFRO0FBQUEsWUFDUCxRQUFRLEtBQUssUUFBUSxZQUFZO0FBQUEsWUFDakMsaUJBQWlCLEtBQUssV0FBVyxLQUFLLFNBQVMsVUFBVTtBQUFBLFVBQzFELENBQUM7QUFBQSxRQUNGLENBQUMsQ0FBQztBQUVGLGtCQUFVLEtBQUssUUFBUSxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUFBLE1BQ3BEO0FBRUEsV0FBSyxZQUFZO0FBRWpCLFdBQUssUUFBUSxhQUFhLGNBQWMsTUFBTTtBQUM5QyxXQUFLLFFBQVEsYUFBYSxtQkFBbUIsK0NBQStDO0FBQzVGLFdBQUssUUFBUSxhQUFhLG9CQUFvQiw0SEFBNEg7QUFDMUssV0FBSyxLQUFLLE9BQU87QUFHakIsV0FBSyxRQUFRLHFCQUFxQixRQUFRLElBQUk7QUFDOUMsV0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLFFBQVEscUJBQXFCLFFBQVEsS0FBSyxDQUFDLENBQUM7QUFHbkYsVUFBSSxLQUFLLE9BQU8sU0FBUyxHQUFHO0FBQzNCLGFBQUssT0FBTyxDQUFDLEVBQUUsTUFBTTtBQUNyQixhQUFLLE9BQU8sQ0FBQyxFQUFFLE9BQU87QUFBQSxNQUN2QixPQUFPO0FBQ04sWUFBSSxnQkFBZ0I7QUFDcEIsa0JBQVUsUUFBUSxDQUFDLE9BQU8sVUFBVTtBQUNuQyxjQUFJLE1BQU0sVUFBVSxHQUFHO0FBQ3RCLHNCQUFVLFFBQVEsS0FBSyxFQUFFLE1BQU07QUFDL0IsNEJBQWdCO0FBQUEsVUFDakI7QUFBQSxRQUNELENBQUM7QUFDRCxZQUFJLENBQUMsZUFBZTtBQUNuQixXQUFDLEtBQUssdUJBQXVCLEtBQUssU0FBUyxNQUFNO0FBQUEsUUFDbEQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsY0FBYztBQUNyQixVQUFNLFFBQVEsS0FBSyxRQUFRO0FBRTNCLFVBQU0sVUFBVSxNQUFNO0FBQ3RCLFVBQU0sVUFBVSxNQUFNO0FBQ3RCLFVBQU0sY0FBYyxNQUFNLGVBQWUsYUFBYSxNQUFNLFlBQVksS0FBSztBQUM3RSxVQUFNLFNBQVMsTUFBTSxlQUFlLGFBQWEsTUFBTSxZQUFZLEtBQUs7QUFDeEUsVUFBTSxjQUFjLE1BQU07QUFFMUIsU0FBSyxjQUFjLE1BQU0sWUFBWTtBQUVyQyxTQUFLLFFBQVEsTUFBTSxRQUFRLFdBQVc7QUFDdEMsU0FBSyxRQUFRLE1BQU0sa0JBQWtCLFdBQVc7QUFDaEQsU0FBSyxRQUFRLE1BQU0sU0FBUztBQUU1QixRQUFJLGFBQWE7QUFFaEIsaUJBQVcsTUFBTSxDQUFDLEdBQUcsS0FBSyxpQkFBaUIscUJBQXFCLEdBQUcsR0FBRyxHQUFHLEtBQUssaUJBQWlCLHFCQUFxQixHQUFHLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFDaEksWUFBSSxHQUFHLFVBQVUsU0FBUyxlQUFlLEdBQUc7QUFDM0M7QUFBQSxRQUNEO0FBQ0EsV0FBRyxNQUFNLFFBQVE7QUFFakIsV0FBRyxNQUFNLGlCQUFpQjtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixZQUFRLEtBQUssUUFBUSxNQUFNO0FBQUEsTUFDMUIsS0FBSztBQUNKO0FBQUEsTUFDRCxLQUFLO0FBQ0osZ0JBQVEsTUFBTTtBQUNkO0FBQUEsTUFDRCxLQUFLO0FBQ0osZ0JBQVEsTUFBTTtBQUNkO0FBQUEsTUFDRDtBQUNDLGdCQUFRLE1BQU07QUFDZDtBQUFBLElBQ0Y7QUFDQSxRQUFJLE9BQU87QUFDVixXQUFLLFlBQVksTUFBTSxRQUFRO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFFZCxRQUFJLEtBQUssY0FBYztBQUN0QixXQUFLLGFBQWEsT0FBTztBQUN6QixXQUFLLGVBQWU7QUFBQSxJQUNyQjtBQUVBLFFBQUksS0FBSyxpQkFBaUIsV0FBVyxLQUFLLGVBQWUsS0FBSyxVQUFVLGNBQWMsSUFBSSxHQUFHO0FBQzVGLFdBQUssY0FBYyxNQUFNO0FBQ3pCLFdBQUssZ0JBQWdCO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsU0FBd0IsVUFBZ0Q7QUFJaEcsVUFBTSxZQUE4QixRQUFRLElBQUksQ0FBQyxPQUFPLFdBQVcsRUFBRSxPQUFPLE1BQU0sRUFBRTtBQUVwRixRQUFJLFFBQVEsU0FBUyxLQUFLLEtBQUssUUFBUSxjQUFjLGtCQUFrQztBQUN0RixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksZUFBZSxTQUFTO0FBYzNCLFVBQUksT0FBTyxhQUFhLFlBQVksVUFBVSxRQUFRLEdBQUc7QUFDeEQsY0FBTSxlQUFlLFVBQVUsT0FBTyxVQUFVLENBQUMsRUFBRSxDQUFDO0FBQ3BELGtCQUFVLE9BQU8sR0FBRyxHQUFHLFlBQVk7QUFBQSxNQUNwQztBQUVBLGdCQUFVLFFBQVE7QUFBQSxJQUNuQixXQUFXLFdBQVc7QUFPckIsVUFBSSxPQUFPLGFBQWEsWUFBWSxVQUFVLFFBQVEsR0FBRztBQUN4RCxjQUFNLGVBQWUsVUFBVSxPQUFPLFVBQVUsQ0FBQyxFQUFFLENBQUM7QUFDcEQsa0JBQVUsS0FBSyxZQUFZO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsiRGlhbG9nQ29udGVudHNBbGlnbm1lbnQiXQp9Cg==
