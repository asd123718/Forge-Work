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
import * as dom from "../../../../../../base/browser/dom.js";
import { EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { Button, ButtonWithDropdown } from "../../../../../../base/browser/ui/button/button.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action, Separator } from "../../../../../../base/common/actions.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { localize } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { ChatMarkdownContentPart } from "./chatMarkdownContentPart.js";
import "./media/chatConfirmationWidget.css";
let ChatQueryTitlePart = class extends Disposable {
  constructor(element, _title, subtitle, _renderer, _instantiationService, _chatMarkdownAnchorService) {
    super();
    this.element = element;
    this._title = _title;
    this._renderer = _renderer;
    this._instantiationService = _instantiationService;
    this._chatMarkdownAnchorService = _chatMarkdownAnchorService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._renderedTitle = this._register(new MutableDisposable());
    this._fileWidgetStore = this._register(new DisposableStore());
    element.classList.add("chat-query-title-part");
    this._renderedTitle.value = this.renderTitle(_title);
    element.append(this._renderedTitle.value.element);
    if (subtitle) {
      const str = this.toMdString(subtitle);
      const renderedTitle = this._register(_renderer.render(str, this.getRenderOptions()));
      const wrapper = document.createElement("small");
      wrapper.appendChild(renderedTitle.element);
      element.append(wrapper);
    }
  }
  get title() {
    return this._title;
  }
  set title(value) {
    this._title = value;
    const next = this.renderTitle(value);
    const previousEl = this._renderedTitle.value?.element;
    if (previousEl?.parentElement) {
      previousEl.replaceWith(next.element);
    } else {
      this.element.appendChild(next.element);
    }
    this._renderedTitle.value = next;
  }
  toMdString(value) {
    if (typeof value === "string") {
      return new MarkdownString("", { supportThemeIcons: true }).appendText(value);
    } else {
      return new MarkdownString(value.value, { supportThemeIcons: true, isTrusted: value.isTrusted });
    }
  }
  setOptions(options) {
    this.options = options;
    this.title = this._title;
  }
  renderTitle(value) {
    const renderedTitle = this._renderer.render(this.toMdString(value), this.getRenderOptions());
    this._fileWidgetStore.clear();
    if (this.options?.renderFileWidgets) {
      renderFileWidgets(renderedTitle.element, this._instantiationService, this._chatMarkdownAnchorService, this._fileWidgetStore);
    }
    return renderedTitle;
  }
  getRenderOptions() {
    return {
      ...this.options?.markdownRenderOptions,
      asyncRenderCallback: () => this._onDidChangeHeight.fire()
    };
  }
};
ChatQueryTitlePart = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IChatMarkdownAnchorService)
], ChatQueryTitlePart);
let BaseSimpleChatConfirmationWidget = class extends Disposable {
  constructor(context, options, instantiationService, _markdownRendererService, contextMenuService, contextKeyService) {
    super();
    this.context = context;
    this.instantiationService = instantiationService;
    this._markdownRendererService = _markdownRendererService;
    this._onDidClick = this._register(new Emitter());
    this.messageContentDisposables = this._register(new MutableDisposable());
    const { title, subtitle, message, buttons } = options;
    const elements = dom.h(".chat-confirmation-widget-container@container", [
      dom.h(".chat-confirmation-widget@root", [
        dom.h(".chat-confirmation-widget-title@title"),
        dom.h(".chat-confirmation-widget-message-container", [
          dom.h(".chat-confirmation-widget-message@message"),
          dom.h(".chat-buttons-container@buttonsContainer", [
            dom.h(".chat-buttons@buttons"),
            dom.h(".chat-toolbar@toolbar")
          ])
        ])
      ])
    ]);
    configureAccessibilityContainer(elements.container, title, message);
    this._domNode = elements.root;
    this._register(instantiationService.createInstance(
      ChatQueryTitlePart,
      elements.title,
      title,
      subtitle
    ));
    this.messageElement = elements.message;
    const messageParent = this.messageElement.parentElement;
    const messageNextSibling = this.messageElement.nextSibling;
    this.messageScrollable = this._register(new DomScrollableElement(this.messageElement, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this.messageScrollable.getDomNode().classList.add("chat-confirmation-widget-message-scrollable");
    messageParent?.insertBefore(this.messageScrollable.getDomNode(), messageNextSibling);
    const messageResizeObserver = this._register(new dom.DisposableResizeObserver("BaseSimpleChatConfirmationWidget.message", () => this.messageScrollable.scanDomNode()));
    this._register(messageResizeObserver.observe(this.messageElement));
    this._register(messageResizeObserver.observe(this.messageScrollable.getDomNode()));
    buttons.forEach((buttonData) => {
      const buttonOptions = { ...defaultButtonStyles, small: true, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };
      let button;
      if (buttonData.moreActions) {
        button = new ButtonWithDropdown(elements.buttons, {
          ...buttonOptions,
          contextMenuProvider: contextMenuService,
          addPrimaryActionToDropdown: false,
          actions: buttonData.moreActions.map((action) => {
            if (action instanceof Separator) {
              return action;
            }
            return this._register(new Action(
              action.label,
              action.label,
              void 0,
              !action.disabled,
              () => {
                this._onDidClick.fire({ button: action, isTouchClick: false });
                return Promise.resolve();
              }
            ));
          })
        });
      } else {
        button = new Button(elements.buttons, buttonOptions);
      }
      this._register(button);
      button.label = buttonData.label;
      this._register(button.onDidClick((event) => this._onDidClick.fire({ button: buttonData, isTouchClick: !!event && event.type === TouchEventType.Tap })));
      if (buttonData.onDidChangeDisablement) {
        this._register(buttonData.onDidChangeDisablement((disabled) => button.enabled = !disabled));
      }
    });
    if (options?.toolbarData) {
      const overlay = contextKeyService.createOverlay([
        ["chatConfirmationPartType", options.toolbarData.partType],
        ["chatConfirmationPartSource", options.toolbarData.partSource]
      ]);
      const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
      this._register(nestedInsta.createInstance(
        MenuWorkbenchToolBar,
        elements.toolbar,
        MenuId.ChatConfirmationMenu,
        {
          // buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
          menuOptions: {
            arg: options.toolbarData.arg,
            shouldForwardArgs: true
          }
        }
      ));
    }
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  get domNode() {
    return this._domNode;
  }
  setShowButtons(showButton) {
    this.domNode.classList.toggle("hideButtons", !showButton);
  }
  renderMessage(element) {
    const store = new DisposableStore();
    const messageContentResizeObserver = store.add(new dom.DisposableResizeObserver("BaseSimpleChatConfirmationWidget.messageContent", () => this.messageScrollable.scanDomNode()));
    store.add(messageContentResizeObserver.observe(element));
    this.messageContentDisposables.value = store;
    this.messageElement.append(element);
    this.messageScrollable.scanDomNode();
  }
};
BaseSimpleChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService)
], BaseSimpleChatConfirmationWidget);
let SimpleChatConfirmationWidget = class extends BaseSimpleChatConfirmationWidget {
  constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService) {
    super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService);
    this.updateMessage(options.message);
  }
  updateMessage(message) {
    this._renderedMessage?.remove();
    const renderedMessage = this._register(this._markdownRendererService.render(
      typeof message === "string" ? new MarkdownString(message) : message
    ));
    this.renderMessage(renderedMessage.element);
    this._renderedMessage = renderedMessage.element;
  }
};
SimpleChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService)
], SimpleChatConfirmationWidget);
let BaseChatConfirmationWidget = class extends Disposable {
  constructor(_context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
    super();
    this._context = _context;
    this.instantiationService = instantiationService;
    this.markdownRendererService = markdownRendererService;
    this.contextMenuService = contextMenuService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this._onDidClick = this._register(new Emitter());
    this._buttons = [];
    this.messageContentDisposables = this._register(new MutableDisposable());
    this.markdownContentPart = this._register(new MutableDisposable());
    const { title, subtitle, message, buttons, icon, footerBanner } = options;
    this.fileWidgetOptions = options.fileWidgetOptions;
    const elements = dom.h(".chat-confirmation-widget-container@container", [
      dom.h(".chat-confirmation-widget2@root", [
        dom.h(".chat-confirmation-widget-title", [
          dom.h(".chat-title@title"),
          dom.h(".chat-toolbar-container@buttonsContainer", [
            dom.h(".chat-toolbar@toolbar")
          ])
        ]),
        dom.h(".chat-confirmation-widget-message@message"),
        dom.h(".chat-confirmation-widget-buttons", [
          dom.h(".chat-buttons@buttons")
        ])
      ])
    ]);
    configureAccessibilityContainer(elements.container, title, message, footerBanner);
    this._domNode = elements.root;
    this._buttonsDomNode = elements.buttons;
    this._register(instantiationService.createInstance(
      ChatQueryTitlePart,
      elements.title,
      new MarkdownString(icon ? `$(${icon.id}) ${typeof title === "string" ? title : title.value}` : typeof title === "string" ? title : title.value),
      subtitle
    ));
    this.messageElement = elements.message;
    const messageParent = this.messageElement.parentElement;
    const messageNextSibling = this.messageElement.nextSibling;
    this.messageScrollable = this._register(new DomScrollableElement(this.messageElement, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this.messageScrollable.getDomNode().classList.add("chat-confirmation-widget-message-scrollable");
    messageParent?.insertBefore(this.messageScrollable.getDomNode(), messageNextSibling);
    const messageResizeObserver = this._register(new dom.DisposableResizeObserver("BaseChatConfirmationWidget.message", () => this.messageScrollable.scanDomNode()));
    this._register(messageResizeObserver.observe(this.messageElement));
    this._register(messageResizeObserver.observe(this.messageScrollable.getDomNode()));
    if (footerBanner) {
      this.messageScrollable.getDomNode().insertAdjacentElement("afterend", footerBanner);
      if (!footerBanner.hasAttribute("aria-live")) {
        footerBanner.setAttribute("aria-live", "polite");
      }
    }
    this.updateButtons(buttons);
    if (options?.toolbarData) {
      const overlay = contextKeyService.createOverlay([
        ["chatConfirmationPartType", options.toolbarData.partType],
        ["chatConfirmationPartSource", options.toolbarData.partSource]
      ]);
      const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
      this._register(nestedInsta.createInstance(
        MenuWorkbenchToolBar,
        elements.toolbar,
        MenuId.ChatConfirmationMenu,
        {
          // buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
          menuOptions: {
            arg: options.toolbarData.arg,
            shouldForwardArgs: true
          }
        }
      ));
    }
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  get domNode() {
    return this._domNode;
  }
  setShowButtons(showButton) {
    this.domNode.classList.toggle("hideButtons", !showButton);
  }
  get codeblocksPartId() {
    return this.markdownContentPart.value?.codeblocksPartId;
  }
  get codeblocks() {
    return this.markdownContentPart.value?.codeblocks;
  }
  updateButtons(buttons) {
    const focusedButton = this._buttons.find((button) => button.widget.hasFocus());
    const focusedDropdown = focusedButton?.widget instanceof ButtonWithDropdown && focusedButton.widget.dropdownButton.hasFocus();
    this._buttons = [];
    while (this._buttonsDomNode.children.length > 0) {
      this._buttonsDomNode.children[0].remove();
    }
    for (const buttonData of buttons) {
      const buttonOptions = { ...defaultButtonStyles, small: true, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };
      let button;
      if (buttonData.moreActions) {
        button = new ButtonWithDropdown(this._buttonsDomNode, {
          ...buttonOptions,
          contextMenuProvider: this.contextMenuService,
          addPrimaryActionToDropdown: false,
          actions: buttonData.moreActions.map((action) => {
            if (action instanceof Separator) {
              return action;
            }
            return this._register(new Action(
              action.label,
              action.label,
              void 0,
              !action.disabled,
              () => {
                this._onDidClick.fire({ button: action, isTouchClick: false });
                return Promise.resolve();
              }
            ));
          })
        });
      } else {
        button = new Button(this._buttonsDomNode, buttonOptions);
      }
      this._register(button);
      this._buttons.push({ label: buttonData.label, widget: button });
      button.label = buttonData.label;
      this._register(button.onDidClick((event) => this._onDidClick.fire({ button: buttonData, isTouchClick: !!event && event.type === TouchEventType.Tap })));
      if (buttonData.onDidChangeDisablement) {
        this._register(buttonData.onDidChangeDisablement((disabled) => button.enabled = !disabled));
      }
    }
    const buttonToFocus = focusedButton && this._buttons.find((button) => button.label === focusedButton.label)?.widget;
    if (focusedDropdown && buttonToFocus instanceof ButtonWithDropdown) {
      buttonToFocus.dropdownButton.focus();
    } else {
      buttonToFocus?.focus();
    }
  }
  renderMessage(element) {
    this.markdownContentPart.clear();
    if (!dom.isHTMLElement(element)) {
      const part = this._register(this.instantiationService.createInstance(
        ChatMarkdownContentPart,
        {
          kind: "markdownContent",
          content: typeof element === "string" ? new MarkdownString().appendMarkdown(element) : element
        },
        this._context,
        this._context.editorPool,
        false,
        this._context.codeBlockStartIndex,
        this.markdownRendererService,
        void 0,
        this._context.currentWidth.get(),
        {
          allowInlineDiffs: true,
          horizontalPadding: 6
        }
      ));
      renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store, this.fileWidgetOptions);
      this.markdownContentPart.value = part;
      element = part.domNode;
    }
    dom.clearNode(this.messageElement);
    const store = new DisposableStore();
    const messageContentResizeObserver = store.add(new dom.DisposableResizeObserver("BaseChatConfirmationWidget.messageContent", () => this.messageScrollable.scanDomNode()));
    store.add(messageContentResizeObserver.observe(element));
    if (this.markdownContentPart.value) {
      store.add(this.markdownContentPart.value.onDidChangeHeight(() => this.messageScrollable.scanDomNode()));
    }
    this.messageContentDisposables.value = store;
    this.messageElement.append(element);
    this.messageScrollable.scanDomNode();
  }
};
BaseChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatMarkdownAnchorService)
], BaseChatConfirmationWidget);
let ChatConfirmationWidget = class extends BaseChatConfirmationWidget {
  constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
    super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService);
    this.renderMessage(options.message);
  }
  updateMessage(message) {
    this._renderedMessage?.remove();
    const renderedMessage = this._register(this.markdownRendererService.render(
      typeof message === "string" ? new MarkdownString(message) : message
    ));
    this.renderMessage(renderedMessage.element);
    this._renderedMessage = renderedMessage.element;
  }
};
ChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatMarkdownAnchorService)
], ChatConfirmationWidget);
let ChatCustomConfirmationWidget = class extends BaseChatConfirmationWidget {
  constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
    super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService);
    this.renderMessage(options.message);
  }
};
ChatCustomConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatMarkdownAnchorService)
], ChatCustomConfirmationWidget);
function configureAccessibilityContainer(container, title, message, footerBanner) {
  container.tabIndex = 0;
  const titleAsString = typeof title === "string" ? title : title.value;
  const messageAsString = typeof message === "string" ? message : message && "value" in message ? message.value : message && "textContent" in message ? message.textContent : "";
  const bannerAsString = footerBanner?.textContent?.trim() ?? "";
  container.setAttribute("aria-label", bannerAsString ? localize("chat.confirmationWidget.ariaLabelWithBannerTitleMessageBanner", "Chat Confirmation Dialog {0} {1} {2}", titleAsString, messageAsString, bannerAsString) : localize("chat.confirmationWidget.ariaLabel", "Chat Confirmation Dialog {0} {1}", titleAsString, messageAsString));
  container.classList.add("chat-confirmation-widget-container");
}
export {
  ChatConfirmationWidget,
  ChatCustomConfirmationWidget,
  ChatQueryTitlePart,
  SimpleChatConfirmationWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdENvbmZpcm1hdGlvbldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duLCBNYXJrZG93blJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25XaXRoRHJvcGRvd24sIElCdXR0b24sIElCdXR0b25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB0eXBlIHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJUmVuZGVyRmlsZVdpZGdldHNPcHRpb25zLCByZW5kZXJGaWxlV2lkZ2V0cyB9IGZyb20gJy4vY2hhdElubGluZUFuY2hvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25Db250ZW50UGFydCwgSUNoYXRNYXJrZG93bkNvbnRlbnRQYXJ0T3B0aW9ucyB9IGZyb20gJy4vY2hhdE1hcmtkb3duQ29udGVudFBhcnQuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRDb25maXJtYXRpb25XaWRnZXQuY3NzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjxUPiB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGlzU2Vjb25kYXJ5PzogYm9vbGVhbjtcblx0dG9vbHRpcD86IHN0cmluZztcblx0ZGF0YTogVDtcblx0ZGlzYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpc2FibGVtZW50PzogRXZlbnQ8Ym9vbGVhbj47XG5cdG1vcmVBY3Rpb25zPzogKElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPFQ+IHwgU2VwYXJhdG9yKVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29uZmlybWF0aW9uQnV0dG9uQ2xpY2tFdmVudDxUPiB7XG5cdHJlYWRvbmx5IGJ1dHRvbjogSUNoYXRDb25maXJtYXRpb25CdXR0b248VD47XG5cdC8qKlxuXHQgKiBUcnVlIHdoZW4gdGhlIGNsaWNrIG9yaWdpbmF0ZWQgZnJvbSBhIHRvdWNoIHRhcCAodnMuIG1vdXNlL2tleWJvYXJkL3Byb2dyYW1tYXRpYykuXG5cdCAqIENhbGxlcnMgdGhhdCByZXN0b3JlIGZvY3VzIGFmdGVyIGNvbmZpcm1hdGlvbiAoZS5nLiB0byB0aGUgY2hhdCBpbnB1dCkgc2hvdWxkXG5cdCAqIHNraXAgdGhhdCBiZWhhdmlvciB3aGVuIHRoaXMgaXMgdHJ1ZSB0byBhdm9pZCBwb3BwaW5nIHRoZSBvbi1zY3JlZW4ga2V5Ym9hcmQgb24gbW9iaWxlLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNUb3VjaENsaWNrOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29uZmlybWF0aW9uV2lkZ2V0T3B0aW9uczxUPiB7XG5cdHRpdGxlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0c3VidGl0bGU/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdGJ1dHRvbnM6IElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPFQ+W107XG5cdHRvb2xiYXJEYXRhPzogeyBhcmc6IHVua25vd247IHBhcnRUeXBlOiBzdHJpbmc7IHBhcnRTb3VyY2U/OiBzdHJpbmcgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFF1ZXJ5VGl0bGVQYXJ0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyT3B0aW9ucz86IE1hcmtkb3duUmVuZGVyT3B0aW9ucztcblx0cmVhZG9ubHkgcmVuZGVyRmlsZVdpZGdldHM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFF1ZXJ5VGl0bGVQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlZFRpdGxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElSZW5kZXJlZE1hcmtkb3duPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVdpZGdldFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBvcHRpb25zOiBJQ2hhdFF1ZXJ5VGl0bGVQYXJ0T3B0aW9ucyB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgZ2V0IHRpdGxlKCkge1xuXHRcdHJldHVybiB0aGlzLl90aXRsZTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdGl0bGUodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZykge1xuXHRcdHRoaXMuX3RpdGxlID0gdmFsdWU7XG5cblx0XHRjb25zdCBuZXh0ID0gdGhpcy5yZW5kZXJUaXRsZSh2YWx1ZSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0VsID0gdGhpcy5fcmVuZGVyZWRUaXRsZS52YWx1ZT8uZWxlbWVudDtcblx0XHRpZiAocHJldmlvdXNFbD8ucGFyZW50RWxlbWVudCkge1xuXHRcdFx0cHJldmlvdXNFbC5yZXBsYWNlV2l0aChuZXh0LmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQobmV4dC5lbGVtZW50KTsgLy8gdW5yZWFjaGFibGU/XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyZWRUaXRsZS52YWx1ZSA9IG5leHQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgX3RpdGxlOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcsXG5cdFx0c3VidGl0bGU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVyeS10aXRsZS1wYXJ0Jyk7XG5cblx0XHR0aGlzLl9yZW5kZXJlZFRpdGxlLnZhbHVlID0gdGhpcy5yZW5kZXJUaXRsZShfdGl0bGUpO1xuXHRcdGVsZW1lbnQuYXBwZW5kKHRoaXMuX3JlbmRlcmVkVGl0bGUudmFsdWUuZWxlbWVudCk7XG5cdFx0aWYgKHN1YnRpdGxlKSB7XG5cdFx0XHRjb25zdCBzdHIgPSB0aGlzLnRvTWRTdHJpbmcoc3VidGl0bGUpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRUaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKF9yZW5kZXJlci5yZW5kZXIoc3RyLCB0aGlzLmdldFJlbmRlck9wdGlvbnMoKSkpO1xuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NtYWxsJyk7XG5cdFx0XHR3cmFwcGVyLmFwcGVuZENoaWxkKHJlbmRlcmVkVGl0bGUuZWxlbWVudCk7XG5cdFx0XHRlbGVtZW50LmFwcGVuZCh3cmFwcGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvTWRTdHJpbmcodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pLmFwcGVuZFRleHQodmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKHZhbHVlLnZhbHVlLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLCBpc1RydXN0ZWQ6IHZhbHVlLmlzVHJ1c3RlZCB9KTtcblx0XHR9XG5cdH1cblxuXHRzZXRPcHRpb25zKG9wdGlvbnM6IElDaGF0UXVlcnlUaXRsZVBhcnRPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLnRpdGxlID0gdGhpcy5fdGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRpdGxlKHZhbHVlOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcpOiBJUmVuZGVyZWRNYXJrZG93biB7XG5cdFx0Y29uc3QgcmVuZGVyZWRUaXRsZSA9IHRoaXMuX3JlbmRlcmVyLnJlbmRlcih0aGlzLnRvTWRTdHJpbmcodmFsdWUpLCB0aGlzLmdldFJlbmRlck9wdGlvbnMoKSk7XG5cdFx0dGhpcy5fZmlsZVdpZGdldFN0b3JlLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucz8ucmVuZGVyRmlsZVdpZGdldHMpIHtcblx0XHRcdHJlbmRlckZpbGVXaWRnZXRzKHJlbmRlcmVkVGl0bGUuZWxlbWVudCwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuX2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIHRoaXMuX2ZpbGVXaWRnZXRTdG9yZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZW5kZXJlZFRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZW5kZXJPcHRpb25zKCk6IE1hcmtkb3duUmVuZGVyT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnRoaXMub3B0aW9ucz8ubWFya2Rvd25SZW5kZXJPcHRpb25zLFxuXHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpLFxuXHRcdH07XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZVNpbXBsZUNoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0Q29uZmlybWF0aW9uQnV0dG9uQ2xpY2tFdmVudDxUPj4oKSk7XG5cdGdldCBvbkRpZENsaWNrKCk6IEV2ZW50PElDaGF0Q29uZmlybWF0aW9uQnV0dG9uQ2xpY2tFdmVudDxUPj4geyByZXR1cm4gdGhpcy5fb25EaWRDbGljay5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRzZXRTaG93QnV0dG9ucyhzaG93QnV0dG9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGVCdXR0b25zJywgIXNob3dCdXR0b24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZVNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VDb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0b3B0aW9uczogSUNoYXRDb25maXJtYXRpb25XaWRnZXRPcHRpb25zPFQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHsgdGl0bGUsIHN1YnRpdGxlLCBtZXNzYWdlLCBidXR0b25zIH0gPSBvcHRpb25zO1xuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSBkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC1jb250YWluZXJAY29udGFpbmVyJywgW1xuXHRcdFx0ZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXRAcm9vdCcsIFtcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtdGl0bGVAdGl0bGUnKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZS1jb250YWluZXInLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZUBtZXNzYWdlJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWJ1dHRvbnMtY29udGFpbmVyQGJ1dHRvbnNDb250YWluZXInLCBbXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYnV0dG9uc0BidXR0b25zJyksXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9vbGJhckB0b29sYmFyJyksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XSksXG5cdFx0XSk7XG5cdFx0Y29uZmlndXJlQWNjZXNzaWJpbGl0eUNvbnRhaW5lcihlbGVtZW50cy5jb250YWluZXIsIHRpdGxlLCBtZXNzYWdlKTtcblx0XHR0aGlzLl9kb21Ob2RlID0gZWxlbWVudHMucm9vdDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFF1ZXJ5VGl0bGVQYXJ0LFxuXHRcdFx0ZWxlbWVudHMudGl0bGUsXG5cdFx0XHR0aXRsZSxcblx0XHRcdHN1YnRpdGxlLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5tZXNzYWdlRWxlbWVudCA9IGVsZW1lbnRzLm1lc3NhZ2U7XG5cdFx0Y29uc3QgbWVzc2FnZVBhcmVudCA9IHRoaXMubWVzc2FnZUVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHRjb25zdCBtZXNzYWdlTmV4dFNpYmxpbmcgPSB0aGlzLm1lc3NhZ2VFbGVtZW50Lm5leHRTaWJsaW5nO1xuXHRcdHRoaXMubWVzc2FnZVNjcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5tZXNzYWdlRWxlbWVudCwge1xuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLmdldERvbU5vZGUoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZS1zY3JvbGxhYmxlJyk7XG5cdFx0bWVzc2FnZVBhcmVudD8uaW5zZXJ0QmVmb3JlKHRoaXMubWVzc2FnZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLCBtZXNzYWdlTmV4dFNpYmxpbmcpO1xuXHRcdGNvbnN0IG1lc3NhZ2VSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdCYXNlU2ltcGxlQ2hhdENvbmZpcm1hdGlvbldpZGdldC5tZXNzYWdlJywgKCkgPT4gdGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVzc2FnZVJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5tZXNzYWdlRWxlbWVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1lc3NhZ2VSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMubWVzc2FnZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKSk7XG5cblx0XHQvLyBDcmVhdGUgYnV0dG9uc1xuXHRcdGJ1dHRvbnMuZm9yRWFjaChidXR0b25EYXRhID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbk9wdGlvbnM6IElCdXR0b25PcHRpb25zID0geyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzbWFsbDogdHJ1ZSwgc2Vjb25kYXJ5OiBidXR0b25EYXRhLmlzU2Vjb25kYXJ5LCB0aXRsZTogYnV0dG9uRGF0YS50b29sdGlwLCBkaXNhYmxlZDogYnV0dG9uRGF0YS5kaXNhYmxlZCB9O1xuXG5cdFx0XHRsZXQgYnV0dG9uOiBJQnV0dG9uO1xuXHRcdFx0aWYgKGJ1dHRvbkRhdGEubW9yZUFjdGlvbnMpIHtcblx0XHRcdFx0YnV0dG9uID0gbmV3IEJ1dHRvbldpdGhEcm9wZG93bihlbGVtZW50cy5idXR0b25zLCB7XG5cdFx0XHRcdFx0Li4uYnV0dG9uT3B0aW9ucyxcblx0XHRcdFx0XHRjb250ZXh0TWVudVByb3ZpZGVyOiBjb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdFx0YWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd246IGZhbHNlLFxuXHRcdFx0XHRcdGFjdGlvbnM6IGJ1dHRvbkRhdGEubW9yZUFjdGlvbnMubWFwKGFjdGlvbiA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdFx0YWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0IWFjdGlvbi5kaXNhYmxlZCxcblx0XHRcdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZSh7IGJ1dHRvbjogYWN0aW9uLCBpc1RvdWNoQ2xpY2s6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1dHRvbiA9IG5ldyBCdXR0b24oZWxlbWVudHMuYnV0dG9ucywgYnV0dG9uT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbik7XG5cdFx0XHRidXR0b24ubGFiZWwgPSBidXR0b25EYXRhLmxhYmVsO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soZXZlbnQgPT4gdGhpcy5fb25EaWRDbGljay5maXJlKHsgYnV0dG9uOiBidXR0b25EYXRhLCBpc1RvdWNoQ2xpY2s6ICEhZXZlbnQgJiYgZXZlbnQudHlwZSA9PT0gVG91Y2hFdmVudFR5cGUuVGFwIH0pKSk7XG5cdFx0XHRpZiAoYnV0dG9uRGF0YS5vbkRpZENoYW5nZURpc2FibGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbkRhdGEub25EaWRDaGFuZ2VEaXNhYmxlbWVudChkaXNhYmxlZCA9PiBidXR0b24uZW5hYmxlZCA9ICFkaXNhYmxlZCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIHRvb2xiYXIgaWYgYWN0aW9ucyBhcmUgcHJvdmlkZWRcblx0XHRpZiAob3B0aW9ucz8udG9vbGJhckRhdGEpIHtcblx0XHRcdGNvbnN0IG92ZXJsYXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFx0WydjaGF0Q29uZmlybWF0aW9uUGFydFR5cGUnLCBvcHRpb25zLnRvb2xiYXJEYXRhLnBhcnRUeXBlXSxcblx0XHRcdFx0WydjaGF0Q29uZmlybWF0aW9uUGFydFNvdXJjZScsIG9wdGlvbnMudG9vbGJhckRhdGEucGFydFNvdXJjZV0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IG5lc3RlZEluc3RhID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIG92ZXJsYXldKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobmVzdGVkSW5zdGEuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE1lbnVXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0XHRlbGVtZW50cy50b29sYmFyLFxuXHRcdFx0XHRNZW51SWQuQ2hhdENvbmZpcm1hdGlvbk1lbnUsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBidXR0b25Db25maWdQcm92aWRlcjogKCkgPT4gKHsgc2hvd0xhYmVsOiBmYWxzZSwgc2hvd0ljb246IHRydWUgfSksXG5cdFx0XHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGFyZzogb3B0aW9ucy50b29sYmFyRGF0YS5hcmcsXG5cdFx0XHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJNZXNzYWdlKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRlbnRSZXNpemVPYnNlcnZlciA9IHN0b3JlLmFkZChuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQmFzZVNpbXBsZUNoYXRDb25maXJtYXRpb25XaWRnZXQubWVzc2FnZUNvbnRlbnQnLCAoKSA9PiB0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHRzdG9yZS5hZGQobWVzc2FnZUNvbnRlbnRSZXNpemVPYnNlcnZlci5vYnNlcnZlKGVsZW1lbnQpKTtcblx0XHR0aGlzLm1lc3NhZ2VDb250ZW50RGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LmFwcGVuZChlbGVtZW50KTtcblx0XHR0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdH1cbn1cblxuLyoqIEBkZXByZWNhdGVkIFVzZSBDaGF0Q29uZmlybWF0aW9uV2lkZ2V0IGluc3RlYWQgKi9cbmV4cG9ydCBjbGFzcyBTaW1wbGVDaGF0Q29uZmlybWF0aW9uV2lkZ2V0PFQ+IGV4dGVuZHMgQmFzZVNpbXBsZUNoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4ge1xuXHRwcml2YXRlIF9yZW5kZXJlZE1lc3NhZ2U6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdG9wdGlvbnM6IElDaGF0Q29uZmlybWF0aW9uV2lkZ2V0T3B0aW9uczxUPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQsIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtYXJrZG93blJlbmRlcmVyU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy51cGRhdGVNZXNzYWdlKG9wdGlvbnMubWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZE1lc3NhZ2U/LnJlbW92ZSgpO1xuXHRcdGNvbnN0IHJlbmRlcmVkTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihcblx0XHRcdHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlKSA6IG1lc3NhZ2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50KTtcblx0XHR0aGlzLl9yZW5kZXJlZE1lc3NhZ2UgPSByZW5kZXJlZE1lc3NhZ2UuZWxlbWVudDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29uZmlybWF0aW9uV2lkZ2V0Mk9wdGlvbnM8VD4ge1xuXHR0aXRsZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBIVE1MRWxlbWVudDtcblx0aWNvbj86IFRoZW1lSWNvbjtcblx0c3VidGl0bGU/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdGZvb3RlckJhbm5lcj86IEhUTUxFbGVtZW50O1xuXHRidXR0b25zOiBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjxUPltdO1xuXHR0b29sYmFyRGF0YT86IHsgYXJnOiB1bmtub3duOyBwYXJ0VHlwZTogc3RyaW5nOyBwYXJ0U291cmNlPzogc3RyaW5nIH07XG5cdGZpbGVXaWRnZXRPcHRpb25zPzogSVJlbmRlckZpbGVXaWRnZXRzT3B0aW9ucztcbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZUNoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0Q29uZmlybWF0aW9uQnV0dG9uQ2xpY2tFdmVudDxUPj4oKSk7XG5cdGdldCBvbkRpZENsaWNrKCk6IEV2ZW50PElDaGF0Q29uZmlybWF0aW9uQnV0dG9uQ2xpY2tFdmVudDxUPj4geyByZXR1cm4gdGhpcy5fb25EaWRDbGljay5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIF9idXR0b25zRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2J1dHRvbnM6IHsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZzsgcmVhZG9ubHkgd2lkZ2V0OiBJQnV0dG9uIH1bXSA9IFtdO1xuXG5cdHNldFNob3dCdXR0b25zKHNob3dCdXR0b246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZUJ1dHRvbnMnLCAhc2hvd0J1dHRvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlU2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZUNvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duQ29udGVudFBhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2hhdE1hcmtkb3duQ29udGVudFBhcnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVXaWRnZXRPcHRpb25zOiBJUmVuZGVyRmlsZVdpZGdldHNPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBnZXQgY29kZWJsb2Nrc1BhcnRJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5tYXJrZG93bkNvbnRlbnRQYXJ0LnZhbHVlPy5jb2RlYmxvY2tzUGFydElkO1xuXHR9XG5cblx0cHVibGljIGdldCBjb2RlYmxvY2tzKCkge1xuXHRcdHJldHVybiB0aGlzLm1hcmtkb3duQ29udGVudFBhcnQudmFsdWU/LmNvZGVibG9ja3M7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdG9wdGlvbnM6IElDaGF0Q29uZmlybWF0aW9uV2lkZ2V0Mk9wdGlvbnM8VD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHsgdGl0bGUsIHN1YnRpdGxlLCBtZXNzYWdlLCBidXR0b25zLCBpY29uLCBmb290ZXJCYW5uZXIgfSA9IG9wdGlvbnM7XG5cdFx0dGhpcy5maWxlV2lkZ2V0T3B0aW9ucyA9IG9wdGlvbnMuZmlsZVdpZGdldE9wdGlvbnM7XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWNvbnRhaW5lckBjb250YWluZXInLCBbXG5cdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldDJAcm9vdCcsIFtcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtdGl0bGUnLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRpdGxlQHRpdGxlJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2xiYXItY29udGFpbmVyQGJ1dHRvbnNDb250YWluZXInLCBbXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9vbGJhckB0b29sYmFyJyksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC1tZXNzYWdlQG1lc3NhZ2UnKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtYnV0dG9ucycsIFtcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYnV0dG9uc0BidXR0b25zJyksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XSksXSk7XG5cblx0XHRjb25maWd1cmVBY2Nlc3NpYmlsaXR5Q29udGFpbmVyKGVsZW1lbnRzLmNvbnRhaW5lciwgdGl0bGUsIG1lc3NhZ2UsIGZvb3RlckJhbm5lcik7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGVsZW1lbnRzLnJvb3Q7XG5cdFx0dGhpcy5fYnV0dG9uc0RvbU5vZGUgPSBlbGVtZW50cy5idXR0b25zO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0UXVlcnlUaXRsZVBhcnQsXG5cdFx0XHRlbGVtZW50cy50aXRsZSxcblx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhpY29uID8gYCQoJHtpY29uLmlkfSkgJHt0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZX1gIDogdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IHRpdGxlIDogdGl0bGUudmFsdWUpLFxuXHRcdFx0c3VidGl0bGUsXG5cdFx0KSk7XG5cblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50ID0gZWxlbWVudHMubWVzc2FnZTtcblx0XHRjb25zdCBtZXNzYWdlUGFyZW50ID0gdGhpcy5tZXNzYWdlRWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXHRcdGNvbnN0IG1lc3NhZ2VOZXh0U2libGluZyA9IHRoaXMubWVzc2FnZUVsZW1lbnQubmV4dFNpYmxpbmc7XG5cdFx0dGhpcy5tZXNzYWdlU2Nyb2xsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLm1lc3NhZ2VFbGVtZW50LCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMubWVzc2FnZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLmNsYXNzTGlzdC5hZGQoJ2NoYXQtY29uZmlybWF0aW9uLXdpZGdldC1tZXNzYWdlLXNjcm9sbGFibGUnKTtcblx0XHRtZXNzYWdlUGFyZW50Py5pbnNlcnRCZWZvcmUodGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCksIG1lc3NhZ2VOZXh0U2libGluZyk7XG5cdFx0Y29uc3QgbWVzc2FnZVJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0Jhc2VDaGF0Q29uZmlybWF0aW9uV2lkZ2V0Lm1lc3NhZ2UnLCAoKSA9PiB0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZXNzYWdlUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLm1lc3NhZ2VFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVzc2FnZVJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpKTtcblxuXHRcdGlmIChmb290ZXJCYW5uZXIpIHtcblx0XHRcdHRoaXMubWVzc2FnZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJlbmQnLCBmb290ZXJCYW5uZXIpO1xuXHRcdFx0aWYgKCFmb290ZXJCYW5uZXIuaGFzQXR0cmlidXRlKCdhcmlhLWxpdmUnKSkge1xuXHRcdFx0XHRmb290ZXJCYW5uZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVCdXR0b25zKGJ1dHRvbnMpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRvb2xiYXIgaWYgYWN0aW9ucyBhcmUgcHJvdmlkZWRcblx0XHRpZiAob3B0aW9ucz8udG9vbGJhckRhdGEpIHtcblx0XHRcdGNvbnN0IG92ZXJsYXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFx0WydjaGF0Q29uZmlybWF0aW9uUGFydFR5cGUnLCBvcHRpb25zLnRvb2xiYXJEYXRhLnBhcnRUeXBlXSxcblx0XHRcdFx0WydjaGF0Q29uZmlybWF0aW9uUGFydFNvdXJjZScsIG9wdGlvbnMudG9vbGJhckRhdGEucGFydFNvdXJjZV0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IG5lc3RlZEluc3RhID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIG92ZXJsYXldKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobmVzdGVkSW5zdGEuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE1lbnVXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0XHRlbGVtZW50cy50b29sYmFyLFxuXHRcdFx0XHRNZW51SWQuQ2hhdENvbmZpcm1hdGlvbk1lbnUsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBidXR0b25Db25maWdQcm92aWRlcjogKCkgPT4gKHsgc2hvd0xhYmVsOiBmYWxzZSwgc2hvd0ljb246IHRydWUgfSksXG5cdFx0XHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGFyZzogb3B0aW9ucy50b29sYmFyRGF0YS5hcmcsXG5cdFx0XHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUJ1dHRvbnMoYnV0dG9uczogSUNoYXRDb25maXJtYXRpb25CdXR0b248VD5bXSkge1xuXHRcdGNvbnN0IGZvY3VzZWRCdXR0b24gPSB0aGlzLl9idXR0b25zLmZpbmQoYnV0dG9uID0+IGJ1dHRvbi53aWRnZXQuaGFzRm9jdXMoKSk7XG5cdFx0Y29uc3QgZm9jdXNlZERyb3Bkb3duID0gZm9jdXNlZEJ1dHRvbj8ud2lkZ2V0IGluc3RhbmNlb2YgQnV0dG9uV2l0aERyb3Bkb3duICYmIGZvY3VzZWRCdXR0b24ud2lkZ2V0LmRyb3Bkb3duQnV0dG9uLmhhc0ZvY3VzKCk7XG5cdFx0dGhpcy5fYnV0dG9ucyA9IFtdO1xuXG5cdFx0d2hpbGUgKHRoaXMuX2J1dHRvbnNEb21Ob2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2J1dHRvbnNEb21Ob2RlLmNoaWxkcmVuWzBdLnJlbW92ZSgpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgYnV0dG9uRGF0YSBvZiBidXR0b25zKSB7XG5cdFx0XHRjb25zdCBidXR0b25PcHRpb25zOiBJQnV0dG9uT3B0aW9ucyA9IHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc21hbGw6IHRydWUsIHNlY29uZGFyeTogYnV0dG9uRGF0YS5pc1NlY29uZGFyeSwgdGl0bGU6IGJ1dHRvbkRhdGEudG9vbHRpcCwgZGlzYWJsZWQ6IGJ1dHRvbkRhdGEuZGlzYWJsZWQgfTtcblxuXHRcdFx0bGV0IGJ1dHRvbjogSUJ1dHRvbjtcblx0XHRcdGlmIChidXR0b25EYXRhLm1vcmVBY3Rpb25zKSB7XG5cdFx0XHRcdGJ1dHRvbiA9IG5ldyBCdXR0b25XaXRoRHJvcGRvd24odGhpcy5fYnV0dG9uc0RvbU5vZGUsIHtcblx0XHRcdFx0XHQuLi5idXR0b25PcHRpb25zLFxuXHRcdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHRcdGFkZFByaW1hcnlBY3Rpb25Ub0Ryb3Bkb3duOiBmYWxzZSxcblx0XHRcdFx0XHRhY3Rpb25zOiBidXR0b25EYXRhLm1vcmVBY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0XHRcdGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCFhY3Rpb24uZGlzYWJsZWQsXG5cdFx0XHRcdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoeyBidXR0b246IGFjdGlvbiwgaXNUb3VjaENsaWNrOiBmYWxzZSB9KTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidXR0b24gPSBuZXcgQnV0dG9uKHRoaXMuX2J1dHRvbnNEb21Ob2RlLCBidXR0b25PcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uKTtcblx0XHRcdHRoaXMuX2J1dHRvbnMucHVzaCh7IGxhYmVsOiBidXR0b25EYXRhLmxhYmVsLCB3aWRnZXQ6IGJ1dHRvbiB9KTtcblx0XHRcdGJ1dHRvbi5sYWJlbCA9IGJ1dHRvbkRhdGEubGFiZWw7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljayhldmVudCA9PiB0aGlzLl9vbkRpZENsaWNrLmZpcmUoeyBidXR0b246IGJ1dHRvbkRhdGEsIGlzVG91Y2hDbGljazogISFldmVudCAmJiBldmVudC50eXBlID09PSBUb3VjaEV2ZW50VHlwZS5UYXAgfSkpKTtcblx0XHRcdGlmIChidXR0b25EYXRhLm9uRGlkQ2hhbmdlRGlzYWJsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uRGF0YS5vbkRpZENoYW5nZURpc2FibGVtZW50KGRpc2FibGVkID0+IGJ1dHRvbi5lbmFibGVkID0gIWRpc2FibGVkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uVG9Gb2N1cyA9IGZvY3VzZWRCdXR0b24gJiYgdGhpcy5fYnV0dG9ucy5maW5kKGJ1dHRvbiA9PiBidXR0b24ubGFiZWwgPT09IGZvY3VzZWRCdXR0b24ubGFiZWwpPy53aWRnZXQ7XG5cdFx0aWYgKGZvY3VzZWREcm9wZG93biAmJiBidXR0b25Ub0ZvY3VzIGluc3RhbmNlb2YgQnV0dG9uV2l0aERyb3Bkb3duKSB7XG5cdFx0XHRidXR0b25Ub0ZvY3VzLmRyb3Bkb3duQnV0dG9uLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1dHRvblRvRm9jdXM/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlck1lc3NhZ2UoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtkb3duQ29udGVudFBhcnQuY2xlYXIoKTtcblxuXHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdFx0Y29udGVudDogdHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oZWxlbWVudCkgOiBlbGVtZW50XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoaXMuX2NvbnRleHQsXG5cdFx0XHRcdHRoaXMuX2NvbnRleHQuZWRpdG9yUG9vbCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHRoaXMuX2NvbnRleHQuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdFx0dGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR0aGlzLl9jb250ZXh0LmN1cnJlbnRXaWR0aC5nZXQoKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFsbG93SW5saW5lRGlmZnM6IHRydWUsXG5cdFx0XHRcdFx0aG9yaXpvbnRhbFBhZGRpbmc6IDYsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0TWFya2Rvd25Db250ZW50UGFydE9wdGlvbnMsXG5cdFx0XHQpKTtcblx0XHRcdHJlbmRlckZpbGVXaWRnZXRzKHBhcnQuZG9tTm9kZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCB0aGlzLl9zdG9yZSwgdGhpcy5maWxlV2lkZ2V0T3B0aW9ucyk7XG5cblx0XHRcdHRoaXMubWFya2Rvd25Db250ZW50UGFydC52YWx1ZSA9IHBhcnQ7XG5cdFx0XHRlbGVtZW50ID0gcGFydC5kb21Ob2RlO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5tZXNzYWdlRWxlbWVudCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRlbnRSZXNpemVPYnNlcnZlciA9IHN0b3JlLmFkZChuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQmFzZUNoYXRDb25maXJtYXRpb25XaWRnZXQubWVzc2FnZUNvbnRlbnQnLCAoKSA9PiB0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHRzdG9yZS5hZGQobWVzc2FnZUNvbnRlbnRSZXNpemVPYnNlcnZlci5vYnNlcnZlKGVsZW1lbnQpKTtcblx0XHRpZiAodGhpcy5tYXJrZG93bkNvbnRlbnRQYXJ0LnZhbHVlKSB7XG5cdFx0XHRzdG9yZS5hZGQodGhpcy5tYXJrZG93bkNvbnRlbnRQYXJ0LnZhbHVlLm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHRoaXMubWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKSkpO1xuXHRcdH1cblx0XHR0aGlzLm1lc3NhZ2VDb250ZW50RGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LmFwcGVuZChlbGVtZW50KTtcblx0XHR0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdH1cbn1cbmV4cG9ydCBjbGFzcyBDaGF0Q29uZmlybWF0aW9uV2lkZ2V0PFQ+IGV4dGVuZHMgQmFzZUNoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4ge1xuXHRwcml2YXRlIF9yZW5kZXJlZE1lc3NhZ2U6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdG9wdGlvbnM6IElDaGF0Q29uZmlybWF0aW9uV2lkZ2V0Mk9wdGlvbnM8VD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGV4dCwgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlKTtcblx0XHR0aGlzLnJlbmRlck1lc3NhZ2Uob3B0aW9ucy5tZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkTWVzc2FnZT8ucmVtb3ZlKCk7XG5cdFx0Y29uc3QgcmVuZGVyZWRNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoXG5cdFx0XHR0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSkgOiBtZXNzYWdlLFxuXHRcdCkpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShyZW5kZXJlZE1lc3NhZ2UuZWxlbWVudCk7XG5cdFx0dGhpcy5fcmVuZGVyZWRNZXNzYWdlID0gcmVuZGVyZWRNZXNzYWdlLmVsZW1lbnQ7XG5cdH1cbn1cbmV4cG9ydCBjbGFzcyBDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0PFQ+IGV4dGVuZHMgQmFzZUNoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRvcHRpb25zOiBJQ2hhdENvbmZpcm1hdGlvbldpZGdldDJPcHRpb25zPFQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQsIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtYXJrZG93blJlbmRlcmVyU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKG9wdGlvbnMubWVzc2FnZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29uZmlndXJlQWNjZXNzaWJpbGl0eUNvbnRhaW5lcihjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aXRsZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLCBtZXNzYWdlPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQsIGZvb3RlckJhbm5lcj86IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdGNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cdGNvbnN0IHRpdGxlQXNTdHJpbmcgPSB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZTtcblx0Y29uc3QgbWVzc2FnZUFzU3RyaW5nID0gdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZSA6IG1lc3NhZ2UgJiYgJ3ZhbHVlJyBpbiBtZXNzYWdlID8gbWVzc2FnZS52YWx1ZSA6IG1lc3NhZ2UgJiYgJ3RleHRDb250ZW50JyBpbiBtZXNzYWdlID8gbWVzc2FnZS50ZXh0Q29udGVudCA6ICcnO1xuXHRjb25zdCBiYW5uZXJBc1N0cmluZyA9IGZvb3RlckJhbm5lcj8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJztcblx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGJhbm5lckFzU3RyaW5nXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdC5jb25maXJtYXRpb25XaWRnZXQuYXJpYUxhYmVsV2l0aEJhbm5lclRpdGxlTWVzc2FnZUJhbm5lcicsIFwiQ2hhdCBDb25maXJtYXRpb24gRGlhbG9nIHswfSB7MX0gezJ9XCIsIHRpdGxlQXNTdHJpbmcsIG1lc3NhZ2VBc1N0cmluZywgYmFubmVyQXNTdHJpbmcpXG5cdFx0OiBsb2NhbGl6ZSgnY2hhdC5jb25maXJtYXRpb25XaWRnZXQuYXJpYUxhYmVsJywgXCJDaGF0IENvbmZpcm1hdGlvbiBEaWFsb2cgezB9IHsxfVwiLCB0aXRsZUFzU3RyaW5nLCBtZXNzYWdlQXNTdHJpbmcpKTtcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtY29uZmlybWF0aW9uLXdpZGdldC1jb250YWluZXInKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNB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
