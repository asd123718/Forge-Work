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
import { $, getActiveElement, getTotalHeight, getWindow, h, reset, trackFocus } from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { IAccessibleViewService } from "../../../../platform/accessibility/browser/accessibleView.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { MenuWorkbenchButtonBar } from "../../../../platform/actions/browser/buttonbar.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import product from "../../../../platform/product/common/product.js";
import { asCssVariable, asCssVariableName, editorBackground, inputBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../common/theme.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { ChatWidget } from "../../chat/browser/widget/chatWidget.js";
import { chatRequestBackground } from "../../chat/common/widget/chatColors.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ChatMode } from "../../chat/common/chatModes.js";
import { ChatAgentVoteDirection, IChatService } from "../../chat/common/chatService/chatService.js";
import { isResponseVM } from "../../chat/common/model/chatViewModel.js";
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED, inlineChatBackground, inlineChatForeground } from "../common/inlineChat.js";
import "./media/inlineChat.css";
let InlineChatWidget = class {
  constructor(location, options, _instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, _textModelResolverService, chatService, hoverService, chatEntitlementService, markdownRendererService) {
    this._instantiationService = _instantiationService;
    this._textModelResolverService = _textModelResolverService;
    this._elements = h(
      "div.inline-chat@root",
      [
        h("div.chat-widget@chatWidget"),
        h("div.accessibleViewer@accessibleViewer"),
        h("div.status@status", [
          h("div.label.info.hidden@infoLabel"),
          h("div.actions.hidden@toolbar1"),
          h("div.label.status.hidden@statusLabel"),
          h("div.actions.secondary.hidden@toolbar2"),
          h("div.label.disclaimer.hidden@disclaimerLabel")
        ])
      ]
    );
    this._store = new DisposableStore();
    this._onDidChangeHeight = this._store.add(new Emitter());
    this.onDidChangeHeight = Event.filter(this._onDidChangeHeight.event, (_) => !this.#isLayouting);
    this.#requestInProgress = observableValue(this, false);
    this.requestInProgress = this.#requestInProgress;
    this.#isLayouting = false;
    this.#options = options;
    this.#keybindingService = keybindingService;
    this.#accessibilityService = accessibilityService;
    this.#configurationService = configurationService;
    this.#accessibleViewService = accessibleViewService;
    this.#chatService = chatService;
    this.#chatEntitlementService = chatEntitlementService;
    this.#markdownRendererService = markdownRendererService;
    this.scopedContextKeyService = this._store.add(contextKeyService.createScoped(this._elements.chatWidget));
    const scopedInstaService = _instantiationService.createChild(
      new ServiceCollection([
        IContextKeyService,
        this.scopedContextKeyService
      ]),
      this._store
    );
    this.chatWidget = scopedInstaService.createInstance(
      ChatWidget,
      location,
      { isInlineChat: true },
      {
        autoScroll: true,
        defaultElementHeight: 32,
        renderStyle: "minimal",
        renderInputOnTop: false,
        renderFollowups: true,
        supportsFileReferences: true,
        filter: (item) => {
          if (!isResponseVM(item) || item.errorDetails) {
            return true;
          }
          const emptyResponse = item.response.value.length === 0;
          if (emptyResponse) {
            return false;
          }
          if (item.response.value.every((item2) => item2.kind === "textEditGroup" && options.chatWidgetViewOptions?.rendererOptions?.renderTextEditsAsSummary?.(item2.uri))) {
            return false;
          }
          return true;
        },
        dndContainer: this._elements.root,
        defaultMode: ChatMode.Ask,
        ...options.chatWidgetViewOptions
      },
      {
        listForeground: inlineChatForeground,
        listBackground: inlineChatBackground,
        overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
        inputEditorBackground: inputBackground,
        resultEditorBackground: editorBackground
      }
    );
    this._elements.root.classList.toggle("in-zone-widget", !!options.inZoneWidget);
    this.chatWidget.render(this._elements.chatWidget);
    this._elements.chatWidget.style.setProperty(asCssVariableName(chatRequestBackground), asCssVariable(inlineChatBackground));
    this.chatWidget.setVisible(true);
    this._store.add(this.chatWidget);
    const ctxResponse = ChatContextKeys.isResponse.bindTo(this.scopedContextKeyService);
    const ctxResponseVote = ChatContextKeys.responseVote.bindTo(this.scopedContextKeyService);
    const ctxResponseSupportIssues = ChatContextKeys.responseSupportsIssueReporting.bindTo(this.scopedContextKeyService);
    const ctxResponseError = ChatContextKeys.responseHasError.bindTo(this.scopedContextKeyService);
    const ctxResponseErrorFiltered = ChatContextKeys.responseIsFiltered.bindTo(this.scopedContextKeyService);
    const viewModelStore = this._store.add(new DisposableStore());
    this._store.add(this.chatWidget.onDidChangeViewModel(() => {
      viewModelStore.clear();
      const viewModel = this.chatWidget.viewModel;
      if (!viewModel) {
        return;
      }
      viewModelStore.add(toDisposable(() => {
        toolbar2.context = void 0;
        ctxResponse.reset();
        ctxResponseVote.reset();
        ctxResponseError.reset();
        ctxResponseErrorFiltered.reset();
        ctxResponseSupportIssues.reset();
      }));
      viewModelStore.add(viewModel.onDidChange(() => {
        this.#requestInProgress.set(viewModel.model.requestInProgress.get(), void 0);
        const last = viewModel.getItems().at(-1);
        toolbar2.context = last;
        ctxResponse.set(isResponseVM(last));
        ctxResponseVote.set(isResponseVM(last) ? last.vote === ChatAgentVoteDirection.Down ? "down" : last.vote === ChatAgentVoteDirection.Up ? "up" : "" : "");
        ctxResponseError.set(isResponseVM(last) && last.errorDetails !== void 0);
        ctxResponseErrorFiltered.set(!!(isResponseVM(last) && last.errorDetails?.responseIsFiltered));
        ctxResponseSupportIssues.set(isResponseVM(last) && (last.agent?.metadata.supportIssueReporting ?? false));
        this._onDidChangeHeight.fire();
      }));
      this._onDidChangeHeight.fire();
    }));
    this._store.add(this.chatWidget.onDidChangeContentHeight(() => {
      this._onDidChangeHeight.fire();
    }));
    this.#ctxResponseFocused = CTX_INLINE_CHAT_RESPONSE_FOCUSED.bindTo(contextKeyService);
    const tracker = this._store.add(trackFocus(this.domNode));
    this._store.add(tracker.onDidBlur(() => this.#ctxResponseFocused.set(false)));
    this._store.add(tracker.onDidFocus(() => this.#ctxResponseFocused.set(true)));
    this.#ctxInputEditorFocused = CTX_INLINE_CHAT_FOCUSED.bindTo(contextKeyService);
    this._store.add(this.chatWidget.inputEditor.onDidFocusEditorWidget(() => this.#ctxInputEditorFocused.set(true)));
    this._store.add(this.chatWidget.inputEditor.onDidBlurEditorWidget(() => this.#ctxInputEditorFocused.set(false)));
    if (options.statusMenuId) {
      const statusMenuOptions = options.statusMenuId.options;
      const statusButtonBar = scopedInstaService.createInstance(MenuWorkbenchButtonBar, this._elements.toolbar1, options.statusMenuId.menu, {
        toolbarOptions: { primaryGroup: "0_main" },
        telemetrySource: options.chatWidgetViewOptions?.menus?.telemetrySource,
        menuOptions: { renderShortTitle: true },
        ...statusMenuOptions
      });
      this._store.add(statusButtonBar.onDidChange(() => this._onDidChangeHeight.fire()));
      this._store.add(statusButtonBar);
    }
    const toolbar2 = scopedInstaService.createInstance(MenuWorkbenchToolBar, this._elements.toolbar2, options.secondaryMenuId ?? MenuId.for(""), {
      telemetrySource: options.chatWidgetViewOptions?.menus?.telemetrySource,
      menuOptions: { renderShortTitle: true, shouldForwardArgs: true },
      actionViewItemProvider: (action, options2) => {
        return createActionViewItem(scopedInstaService, action, options2);
      }
    });
    this._store.add(toolbar2.onDidChangeMenuItems(() => this._onDidChangeHeight.fire()));
    this._store.add(toolbar2);
    this._store.add(this.#configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.InlineChat)) {
        this.#updateAriaLabel();
      }
    }));
    this._elements.root.tabIndex = 0;
    this._elements.statusLabel.tabIndex = 0;
    this.#updateAriaLabel();
    this.#setupDisclaimer();
    this._store.add(hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this._elements.statusLabel, () => {
      return this._elements.statusLabel.dataset["title"];
    }));
    this._store.add(this.#chatService.onDidPerformUserAction((e) => {
      if (isEqual(e.sessionResource, this.chatWidget.viewModel?.model.sessionResource) && e.action.kind === "vote") {
        this.updateStatus(localize("feedbackThanks", "Thank you for your feedback!"), { resetAfter: 1250 });
      }
    }));
  }
  #ctxInputEditorFocused;
  #ctxResponseFocused;
  #requestInProgress;
  #isLayouting;
  #options;
  #keybindingService;
  #accessibilityService;
  #configurationService;
  #accessibleViewService;
  #chatService;
  #chatEntitlementService;
  #markdownRendererService;
  #updateAriaLabel() {
    this._elements.root.ariaLabel = this.#accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
    if (this.#accessibilityService.isScreenReaderOptimized()) {
      let label = defaultAriaLabel;
      if (this.#configurationService.getValue(AccessibilityVerbositySettingId.InlineChat)) {
        const kbLabel = this.#keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
        label = kbLabel ? localize("inlineChat.accessibilityHelp", "Inline Chat Input, Use {0} for Inline Chat Accessibility Help.", kbLabel) : localize("inlineChat.accessibilityHelpNoKb", "Inline Chat Input, Run the Inline Chat Accessibility Help command for more information.");
      }
      this.chatWidget.inputEditor.updateOptions({ ariaLabel: label });
    }
  }
  #setupDisclaimer() {
    const disposables = this._store.add(new DisposableStore());
    this._store.add(autorun((reader) => {
      disposables.clear();
      reset(this._elements.disclaimerLabel);
      const sentiment = this.#chatEntitlementService.sentimentObs.read(reader);
      const anonymous = this.#chatEntitlementService.anonymousObs.read(reader);
      const requestInProgress = this.#chatService.requestInProgressObs.read(reader);
      const showDisclaimer = !sentiment.completed && anonymous && !requestInProgress;
      this._elements.disclaimerLabel.classList.toggle("hidden", !showDisclaimer);
      if (showDisclaimer) {
        const renderedMarkdown = disposables.add(this.#markdownRendererService.render(new MarkdownString(localize({ key: "termsDisclaimer", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", product.defaultChatAgent?.provider?.default?.name ?? "", product.defaultChatAgent?.provider?.default?.name ?? "", product.defaultChatAgent?.termsStatementUrl ?? "", product.defaultChatAgent?.privacyStatementUrl ?? ""), { isTrusted: true })));
        this._elements.disclaimerLabel.appendChild(renderedMarkdown.element);
      }
      this._onDidChangeHeight.fire();
    }));
  }
  dispose() {
    this._store.dispose();
  }
  get domNode() {
    return this._elements.root;
  }
  layout(widgetDim) {
    const contentHeight = this.contentHeight;
    this.#isLayouting = true;
    try {
      this._doLayout(widgetDim);
    } finally {
      this.#isLayouting = false;
      if (this.contentHeight !== contentHeight) {
        this._onDidChangeHeight.fire();
      }
    }
  }
  _doLayout(dimension) {
    const extraHeight = this._getExtraHeight();
    const statusHeight = getTotalHeight(this._elements.status);
    this._elements.root.style.height = `${dimension.height - extraHeight}px`;
    this._elements.root.style.width = `${dimension.width}px`;
    this.chatWidget.layout(
      dimension.height - statusHeight - extraHeight,
      dimension.width
    );
  }
  /**
   * The content height of this widget is the size that would require no scrolling
   */
  get contentHeight() {
    const data = {
      chatWidgetContentHeight: this.chatWidget.contentHeight,
      statusHeight: getTotalHeight(this._elements.status),
      extraHeight: this._getExtraHeight()
    };
    const result = data.chatWidgetContentHeight + data.statusHeight + data.extraHeight;
    return result;
  }
  get minHeight() {
    let maxWidgetOutputHeight = 100;
    for (const item of this.chatWidget.viewModel?.getItems() ?? []) {
      if (isResponseVM(item) && item.response.value.some((r) => r.kind === "textEditGroup" && !r.state?.applied)) {
        maxWidgetOutputHeight = 270;
        break;
      }
    }
    let value = this.contentHeight;
    value -= this.chatWidget.contentHeight;
    value += Math.min(this.chatWidget.input.height.get() + maxWidgetOutputHeight, this.chatWidget.contentHeight);
    return value;
  }
  _getExtraHeight() {
    return this.#options.inZoneWidget ? 1 : 2 + 4;
  }
  updateInfo(message) {
    this._elements.infoLabel.classList.toggle("hidden", !message);
    const renderedMessage = renderLabelWithIcons(message);
    reset(this._elements.infoLabel, ...renderedMessage);
    this._onDidChangeHeight.fire();
  }
  updateStatus(message, ops = {}) {
    const isTempMessage = typeof ops.resetAfter === "number";
    if (isTempMessage && !this._elements.statusLabel.dataset["state"]) {
      const statusLabel = this._elements.statusLabel.innerText;
      const title = this._elements.statusLabel.dataset["title"];
      const classes = Array.from(this._elements.statusLabel.classList.values());
      setTimeout(() => {
        this.updateStatus(statusLabel, { classes, keepMessage: true, title });
      }, ops.resetAfter);
    }
    const renderedMessage = renderLabelWithIcons(message);
    reset(this._elements.statusLabel, ...renderedMessage);
    this._elements.statusLabel.className = `label status ${(ops.classes ?? []).join(" ")}`;
    this._elements.statusLabel.classList.toggle("hidden", !message);
    if (isTempMessage) {
      this._elements.statusLabel.dataset["state"] = "temp";
    } else {
      delete this._elements.statusLabel.dataset["state"];
    }
    if (ops.title) {
      this._elements.statusLabel.dataset["title"] = ops.title;
    } else {
      delete this._elements.statusLabel.dataset["title"];
    }
    this._onDidChangeHeight.fire();
  }
  reset() {
    this.chatWidget.attachmentModel.clear(true);
    this.chatWidget.saveState();
    reset(this._elements.statusLabel);
    this._elements.statusLabel.classList.toggle("hidden", true);
    this._elements.toolbar1.classList.add("hidden");
    this._elements.toolbar2.classList.add("hidden");
    this.updateInfo("");
    this._elements.accessibleViewer.classList.toggle("hidden", true);
    this._onDidChangeHeight.fire();
  }
  focus() {
    this.chatWidget.focusInput();
  }
  hasFocus() {
    return this.domNode.contains(getActiveElement());
  }
};
InlineChatWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IAccessibilityService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAccessibleViewService),
  __decorateParam(8, ITextModelService),
  __decorateParam(9, IChatService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IChatEntitlementService),
  __decorateParam(12, IMarkdownRendererService)
], InlineChatWidget);
const defaultAriaLabel = localize("aria-label", "Inline Chat Input");
let EditorBasedInlineChatWidget = class extends InlineChatWidget {
  constructor(location, parentEditor, options, contextKeyService, keybindingService, instantiationService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService, hoverService, layoutService, chatEntitlementService, markdownRendererService) {
    const overflowWidgetsNode = layoutService.getContainer(getWindow(parentEditor.getContainerDomNode())).appendChild($(".inline-chat-overflow.monaco-editor"));
    super(location, {
      ...options,
      chatWidgetViewOptions: {
        ...options.chatWidgetViewOptions,
        editorOverflowWidgetsDomNode: overflowWidgetsNode
      }
    }, instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService, hoverService, chatEntitlementService, markdownRendererService);
    this._store.add(toDisposable(() => {
      overflowWidgetsNode.remove();
    }));
  }
  // --- layout
  _doLayout(dimension) {
    const newHeight = dimension.height;
    super._doLayout(dimension.with(void 0, newHeight));
    this._elements.root.style.height = `${dimension.height - this._getExtraHeight()}px`;
  }
  reset() {
    this.chatWidget.setInput();
    super.reset();
  }
};
EditorBasedInlineChatWidget = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IAccessibilityService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAccessibleViewService),
  __decorateParam(9, ITextModelService),
  __decorateParam(10, IChatService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, ILayoutService),
  __decorateParam(13, IChatEntitlementService),
  __decorateParam(14, IMarkdownRendererService)
], EditorBasedInlineChatWidget);
export {
  EditorBasedInlineChatWidget,
  InlineChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGdldEFjdGl2ZUVsZW1lbnQsIGdldFRvdGFsSGVpZ2h0LCBnZXRXaW5kb3csIGgsIHJlc2V0LCB0cmFja0ZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEJ1dHRvbkJhck9wdGlvbnMsIE1lbnVXb3JrYmVuY2hCdXR0b25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYnV0dG9uYmFyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBhc0Nzc1ZhcmlhYmxlTmFtZSwgZWRpdG9yQmFja2dyb3VuZCwgaW5wdXRCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBjaGF0UmVxdWVzdEJhY2tncm91bmQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi93aWRnZXQvY2hhdENvbG9ycy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9GT0NVU0VELCBDVFhfSU5MSU5FX0NIQVRfUkVTUE9OU0VfRk9DVVNFRCwgaW5saW5lQ2hhdEJhY2tncm91bmQsIGlubGluZUNoYXRGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vY29tbW9uL2lubGluZUNoYXQuanMnO1xuaW1wb3J0ICcuL21lZGlhL2lubGluZUNoYXQuY3NzJztcblxuZXhwb3J0IGludGVyZmFjZSBJbmxpbmVDaGF0V2lkZ2V0Vmlld1N0YXRlIHtcblx0ZWRpdG9yVmlld1N0YXRlOiBJQ29kZUVkaXRvclZpZXdTdGF0ZTtcblx0aW5wdXQ6IHN0cmluZztcblx0cGxhY2Vob2xkZXI6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5saW5lQ2hhdFdpZGdldENvbnN0cnVjdGlvbk9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgbWVudSB0aGF0IHJlbmRlcmVkIGFzIGJ1dHRvbiBiYXIsIHVzZSBmb3IgYWNjZXB0LCBkaXNjYXJkIGV0Y1xuXHQgKi9cblx0c3RhdHVzTWVudUlkPzogeyBtZW51OiBNZW51SWQ7IG9wdGlvbnM6IElXb3JrYmVuY2hCdXR0b25CYXJPcHRpb25zIH07XG5cblx0c2Vjb25kYXJ5TWVudUlkPzogTWVudUlkO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9ucyBmb3IgdGhlIGNoYXQgd2lkZ2V0XG5cdCAqL1xuXHRjaGF0V2lkZ2V0Vmlld09wdGlvbnM/OiBJQ2hhdFdpZGdldFZpZXdPcHRpb25zO1xuXG5cdGluWm9uZVdpZGdldD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBJbmxpbmVDaGF0V2lkZ2V0IHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2VsZW1lbnRzID0gaChcblx0XHQnZGl2LmlubGluZS1jaGF0QHJvb3QnLFxuXHRcdFtcblx0XHRcdGgoJ2Rpdi5jaGF0LXdpZGdldEBjaGF0V2lkZ2V0JyksXG5cdFx0XHRoKCdkaXYuYWNjZXNzaWJsZVZpZXdlckBhY2Nlc3NpYmxlVmlld2VyJyksXG5cdFx0XHRoKCdkaXYuc3RhdHVzQHN0YXR1cycsIFtcblx0XHRcdFx0aCgnZGl2LmxhYmVsLmluZm8uaGlkZGVuQGluZm9MYWJlbCcpLFxuXHRcdFx0XHRoKCdkaXYuYWN0aW9ucy5oaWRkZW5AdG9vbGJhcjEnKSxcblx0XHRcdFx0aCgnZGl2LmxhYmVsLnN0YXR1cy5oaWRkZW5Ac3RhdHVzTGFiZWwnKSxcblx0XHRcdFx0aCgnZGl2LmFjdGlvbnMuc2Vjb25kYXJ5LmhpZGRlbkB0b29sYmFyMicpLFxuXHRcdFx0XHRoKCdkaXYubGFiZWwuZGlzY2xhaW1lci5oaWRkZW5AZGlzY2xhaW1lckxhYmVsJyksXG5cdFx0XHRdKSxcblx0XHRdXG5cdCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRyZWFkb25seSAjY3R4SW5wdXRFZGl0b3JGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cmVhZG9ubHkgI2N0eFJlc3BvbnNlRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cmVhZG9ubHkgY2hhdFdpZGdldDogQ2hhdFdpZGdldDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gPSBFdmVudC5maWx0ZXIodGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQsIF8gPT4gIXRoaXMuI2lzTGF5b3V0aW5nKTtcblxuXHRyZWFkb25seSAjcmVxdWVzdEluUHJvZ3Jlc3MgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSByZXF1ZXN0SW5Qcm9ncmVzczogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLiNyZXF1ZXN0SW5Qcm9ncmVzcztcblxuXHQjaXNMYXlvdXRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRyZWFkb25seSBzY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdHJlYWRvbmx5ICNvcHRpb25zOiBJSW5saW5lQ2hhdFdpZGdldENvbnN0cnVjdGlvbk9wdGlvbnM7XG5cdHJlYWRvbmx5ICNrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlO1xuXHRyZWFkb25seSAjYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZTtcblx0cmVhZG9ubHkgI2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5ICNhY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2U7XG5cdHJlYWRvbmx5ICNjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlO1xuXHRyZWFkb25seSAjY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2U7XG5cdHJlYWRvbmx5ICNtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxvY2F0aW9uOiBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyxcblx0XHRvcHRpb25zOiBJSW5saW5lQ2hhdFdpZGdldENvbnN0cnVjdGlvbk9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIGFjY2Vzc2libGVWaWV3U2VydmljZTogSUFjY2Vzc2libGVWaWV3U2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy4jb3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy4ja2V5YmluZGluZ1NlcnZpY2UgPSBrZXliaW5kaW5nU2VydmljZTtcblx0XHR0aGlzLiNhY2Nlc3NpYmlsaXR5U2VydmljZSA9IGFjY2Vzc2liaWxpdHlTZXJ2aWNlO1xuXHRcdHRoaXMuI2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy4jYWNjZXNzaWJsZVZpZXdTZXJ2aWNlID0gYWNjZXNzaWJsZVZpZXdTZXJ2aWNlO1xuXHRcdHRoaXMuI2NoYXRTZXJ2aWNlID0gY2hhdFNlcnZpY2U7XG5cdFx0dGhpcy4jY2hhdEVudGl0bGVtZW50U2VydmljZSA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U7XG5cdFx0dGhpcy4jbWFya2Rvd25SZW5kZXJlclNlcnZpY2UgPSBtYXJrZG93blJlbmRlcmVyU2VydmljZTtcblxuXHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9zdG9yZS5hZGQoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX2VsZW1lbnRzLmNoYXRXaWRnZXQpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YVNlcnZpY2UgPSBfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2Vcblx0XHRcdF0pLFxuXHRcdFx0dGhpcy5fc3RvcmVcblx0XHQpO1xuXG5cdFx0dGhpcy5jaGF0V2lkZ2V0ID0gc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFdpZGdldCxcblx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0eyBpc0lubGluZUNoYXQ6IHRydWUgfSxcblx0XHRcdHtcblx0XHRcdFx0YXV0b1Njcm9sbDogdHJ1ZSxcblx0XHRcdFx0ZGVmYXVsdEVsZW1lbnRIZWlnaHQ6IDMyLFxuXHRcdFx0XHRyZW5kZXJTdHlsZTogJ21pbmltYWwnLFxuXHRcdFx0XHRyZW5kZXJJbnB1dE9uVG9wOiBmYWxzZSxcblx0XHRcdFx0cmVuZGVyRm9sbG93dXBzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0ZpbGVSZWZlcmVuY2VzOiB0cnVlLFxuXHRcdFx0XHRmaWx0ZXI6IGl0ZW0gPT4ge1xuXHRcdFx0XHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pIHx8IGl0ZW0uZXJyb3JEZXRhaWxzKSB7XG5cdFx0XHRcdFx0XHQvLyBzaG93IGFsbCByZXF1ZXN0cyBhbmQgZXJyb3JzXG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZW1wdHlSZXNwb25zZSA9IGl0ZW0ucmVzcG9uc2UudmFsdWUubGVuZ3RoID09PSAwO1xuXHRcdFx0XHRcdGlmIChlbXB0eVJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpdGVtLnJlc3BvbnNlLnZhbHVlLmV2ZXJ5KGl0ZW0gPT4gaXRlbS5raW5kID09PSAndGV4dEVkaXRHcm91cCcgJiYgb3B0aW9ucy5jaGF0V2lkZ2V0Vmlld09wdGlvbnM/LnJlbmRlcmVyT3B0aW9ucz8ucmVuZGVyVGV4dEVkaXRzQXNTdW1tYXJ5Py4oaXRlbS51cmkpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZG5kQ29udGFpbmVyOiB0aGlzLl9lbGVtZW50cy5yb290LFxuXHRcdFx0XHRkZWZhdWx0TW9kZTogQ2hhdE1vZGUuQXNrLFxuXHRcdFx0XHQuLi5vcHRpb25zLmNoYXRXaWRnZXRWaWV3T3B0aW9uc1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGlzdEZvcmVncm91bmQ6IGlubGluZUNoYXRGb3JlZ3JvdW5kLFxuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogaW5saW5lQ2hhdEJhY2tncm91bmQsXG5cdFx0XHRcdG92ZXJsYXlCYWNrZ3JvdW5kOiBFRElUT1JfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5ELFxuXHRcdFx0XHRpbnB1dEVkaXRvckJhY2tncm91bmQ6IGlucHV0QmFja2dyb3VuZCxcblx0XHRcdFx0cmVzdWx0RWRpdG9yQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZFxuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdpbi16b25lLXdpZGdldCcsICEhb3B0aW9ucy5pblpvbmVXaWRnZXQpO1xuXHRcdHRoaXMuY2hhdFdpZGdldC5yZW5kZXIodGhpcy5fZWxlbWVudHMuY2hhdFdpZGdldCk7XG5cdFx0dGhpcy5fZWxlbWVudHMuY2hhdFdpZGdldC5zdHlsZS5zZXRQcm9wZXJ0eShhc0Nzc1ZhcmlhYmxlTmFtZShjaGF0UmVxdWVzdEJhY2tncm91bmQpLCBhc0Nzc1ZhcmlhYmxlKGlubGluZUNoYXRCYWNrZ3JvdW5kKSk7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY2hhdFdpZGdldCk7XG5cblx0XHRjb25zdCBjdHhSZXNwb25zZSA9IENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdHhSZXNwb25zZVZvdGUgPSBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VWb3RlLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdHhSZXNwb25zZVN1cHBvcnRJc3N1ZXMgPSBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VTdXBwb3J0c0lzc3VlUmVwb3J0aW5nLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdHhSZXNwb25zZUVycm9yID0gQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlSGFzRXJyb3IuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGN0eFJlc3BvbnNlRXJyb3JGaWx0ZXJlZCA9IENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUlzRmlsdGVyZWQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsU3RvcmUgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jaGF0V2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKCgpID0+IHtcblx0XHRcdHZpZXdNb2RlbFN0b3JlLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuY2hhdFdpZGdldC52aWV3TW9kZWw7XG5cdFx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZpZXdNb2RlbFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0b29sYmFyMi5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjdHhSZXNwb25zZS5yZXNldCgpO1xuXHRcdFx0XHRjdHhSZXNwb25zZVZvdGUucmVzZXQoKTtcblx0XHRcdFx0Y3R4UmVzcG9uc2VFcnJvci5yZXNldCgpO1xuXHRcdFx0XHRjdHhSZXNwb25zZUVycm9yRmlsdGVyZWQucmVzZXQoKTtcblx0XHRcdFx0Y3R4UmVzcG9uc2VTdXBwb3J0SXNzdWVzLnJlc2V0KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbFN0b3JlLmFkZCh2aWV3TW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXG5cdFx0XHRcdHRoaXMuI3JlcXVlc3RJblByb2dyZXNzLnNldCh2aWV3TW9kZWwubW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3QgbGFzdCA9IHZpZXdNb2RlbC5nZXRJdGVtcygpLmF0KC0xKTtcblx0XHRcdFx0dG9vbGJhcjIuY29udGV4dCA9IGxhc3Q7XG5cblx0XHRcdFx0Y3R4UmVzcG9uc2Uuc2V0KGlzUmVzcG9uc2VWTShsYXN0KSk7XG5cdFx0XHRcdGN0eFJlc3BvbnNlVm90ZS5zZXQoaXNSZXNwb25zZVZNKGxhc3QpID8gbGFzdC52b3RlID09PSBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLkRvd24gPyAnZG93bicgOiBsYXN0LnZvdGUgPT09IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uVXAgPyAndXAnIDogJycgOiAnJyk7XG5cdFx0XHRcdGN0eFJlc3BvbnNlRXJyb3Iuc2V0KGlzUmVzcG9uc2VWTShsYXN0KSAmJiBsYXN0LmVycm9yRGV0YWlscyAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdFx0Y3R4UmVzcG9uc2VFcnJvckZpbHRlcmVkLnNldCgoISEoaXNSZXNwb25zZVZNKGxhc3QpICYmIGxhc3QuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzRmlsdGVyZWQpKSk7XG5cdFx0XHRcdGN0eFJlc3BvbnNlU3VwcG9ydElzc3Vlcy5zZXQoaXNSZXNwb25zZVZNKGxhc3QpICYmIChsYXN0LmFnZW50Py5tZXRhZGF0YS5zdXBwb3J0SXNzdWVSZXBvcnRpbmcgPz8gZmFsc2UpKTtcblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY2hhdFdpZGdldC5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGNvbnRleHQga2V5c1xuXHRcdHRoaXMuI2N0eFJlc3BvbnNlRm9jdXNlZCA9IENUWF9JTkxJTkVfQ0hBVF9SRVNQT05TRV9GT0NVU0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IHRoaXMuX3N0b3JlLmFkZCh0cmFja0ZvY3VzKHRoaXMuZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0cmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLiNjdHhSZXNwb25zZUZvY3VzZWQuc2V0KGZhbHNlKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0cmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy4jY3R4UmVzcG9uc2VGb2N1c2VkLnNldCh0cnVlKSkpO1xuXG5cdFx0dGhpcy4jY3R4SW5wdXRFZGl0b3JGb2N1c2VkID0gQ1RYX0lOTElORV9DSEFUX0ZPQ1VTRUQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jaGF0V2lkZ2V0LmlucHV0RWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy4jY3R4SW5wdXRFZGl0b3JGb2N1c2VkLnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNoYXRXaWRnZXQuaW5wdXRFZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuI2N0eElucHV0RWRpdG9yRm9jdXNlZC5zZXQoZmFsc2UpKSk7XG5cblxuXHRcdC8vIEJVVFRPTiBiYXJcblx0XHRpZiAob3B0aW9ucy5zdGF0dXNNZW51SWQpIHtcblx0XHRcdGNvbnN0IHN0YXR1c01lbnVPcHRpb25zID0gb3B0aW9ucy5zdGF0dXNNZW51SWQub3B0aW9ucztcblx0XHRcdGNvbnN0IHN0YXR1c0J1dHRvbkJhciA9IHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoQnV0dG9uQmFyLCB0aGlzLl9lbGVtZW50cy50b29sYmFyMSwgb3B0aW9ucy5zdGF0dXNNZW51SWQubWVudSwge1xuXHRcdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICcwX21haW4nIH0sXG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogb3B0aW9ucy5jaGF0V2lkZ2V0Vmlld09wdGlvbnM/Lm1lbnVzPy50ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdFx0Li4uc3RhdHVzTWVudU9wdGlvbnMsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZChzdGF0dXNCdXR0b25CYXIub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoc3RhdHVzQnV0dG9uQmFyKTtcblx0XHR9XG5cblx0XHQvLyBzZWNvbmRhcnkgdG9vbGJhclxuXHRcdGNvbnN0IHRvb2xiYXIyID0gc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLl9lbGVtZW50cy50b29sYmFyMiwgb3B0aW9ucy5zZWNvbmRhcnlNZW51SWQgPz8gTWVudUlkLmZvcignJyksIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogb3B0aW9ucy5jaGF0V2lkZ2V0Vmlld09wdGlvbnM/Lm1lbnVzPy50ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRtZW51T3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlLCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFTZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0b29sYmFyMi5vbkRpZENoYW5nZU1lbnVJdGVtcygoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodG9vbGJhcjIpO1xuXG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy4jY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5JbmxpbmVDaGF0KSkge1xuXHRcdFx0XHR0aGlzLiN1cGRhdGVBcmlhTGFiZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy4jdXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0dGhpcy4jc2V0dXBEaXNjbGFpbWVyKCk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuZGF0YXNldFsndGl0bGUnXTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy4jY2hhdFNlcnZpY2Uub25EaWRQZXJmb3JtVXNlckFjdGlvbihlID0+IHtcblx0XHRcdGlmIChpc0VxdWFsKGUuc2Vzc2lvblJlc291cmNlLCB0aGlzLmNoYXRXaWRnZXQudmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpICYmIGUuYWN0aW9uLmtpbmQgPT09ICd2b3RlJykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyhsb2NhbGl6ZSgnZmVlZGJhY2tUaGFua3MnLCBcIlRoYW5rIHlvdSBmb3IgeW91ciBmZWVkYmFjayFcIiksIHsgcmVzZXRBZnRlcjogMTI1MCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQjdXBkYXRlQXJpYUxhYmVsKCk6IHZvaWQge1xuXG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5hcmlhTGFiZWwgPSB0aGlzLiNhY2Nlc3NpYmxlVmlld1NlcnZpY2UuZ2V0T3BlbkFyaWFIaW50KEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuSW5saW5lQ2hhdCk7XG5cblx0XHRpZiAodGhpcy4jYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0bGV0IGxhYmVsID0gZGVmYXVsdEFyaWFMYWJlbDtcblx0XHRcdGlmICh0aGlzLiNjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLklubGluZUNoYXQpKSB7XG5cdFx0XHRcdGNvbnN0IGtiTGFiZWwgPSB0aGlzLiNrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0TGFiZWwoKTtcblx0XHRcdFx0bGFiZWwgPSBrYkxhYmVsXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnaW5saW5lQ2hhdC5hY2Nlc3NpYmlsaXR5SGVscCcsIFwiSW5saW5lIENoYXQgSW5wdXQsIFVzZSB7MH0gZm9yIElubGluZSBDaGF0IEFjY2Vzc2liaWxpdHkgSGVscC5cIiwga2JMYWJlbClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdpbmxpbmVDaGF0LmFjY2Vzc2liaWxpdHlIZWxwTm9LYicsIFwiSW5saW5lIENoYXQgSW5wdXQsIFJ1biB0aGUgSW5saW5lIENoYXQgQWNjZXNzaWJpbGl0eSBIZWxwIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jaGF0V2lkZ2V0LmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWw6IGxhYmVsIH0pO1xuXHRcdH1cblx0fVxuXG5cdCNzZXR1cERpc2NsYWltZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmVzZXQodGhpcy5fZWxlbWVudHMuZGlzY2xhaW1lckxhYmVsKTtcblxuXHRcdFx0Y29uc3Qgc2VudGltZW50ID0gdGhpcy4jY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYW5vbnltb3VzID0gdGhpcy4jY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEluUHJvZ3Jlc3MgPSB0aGlzLiNjaGF0U2VydmljZS5yZXF1ZXN0SW5Qcm9ncmVzc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHNob3dEaXNjbGFpbWVyID0gIXNlbnRpbWVudC5jb21wbGV0ZWQgJiYgYW5vbnltb3VzICYmICFyZXF1ZXN0SW5Qcm9ncmVzcztcblx0XHRcdHRoaXMuX2VsZW1lbnRzLmRpc2NsYWltZXJMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvd0Rpc2NsYWltZXIpO1xuXG5cdFx0XHRpZiAoc2hvd0Rpc2NsYWltZXIpIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLiNtYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKHsga2V5OiAndGVybXNEaXNjbGFpbWVyJywgY29tbWVudDogWyd7TG9ja2VkPVwiXSh7Mn0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHszfSlcIn0nXSB9LCBcIkJ5IGNvbnRpbnVpbmcgd2l0aCB7MH0gQ29waWxvdCwgeW91IGFncmVlIHRvIHsxfSdzIFtUZXJtc10oezJ9KSBhbmQgW1ByaXZhY3kgU3RhdGVtZW50XSh7M30pXCIsIHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXI/LmRlZmF1bHQ/Lm5hbWUgPz8gJycsIHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXI/LmRlZmF1bHQ/Lm5hbWUgPz8gJycsIHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8udGVybXNTdGF0ZW1lbnRVcmwgPz8gJycsIHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJpdmFjeVN0YXRlbWVudFVybCA/PyAnJyksIHsgaXNUcnVzdGVkOiB0cnVlIH0pKSk7XG5cdFx0XHRcdHRoaXMuX2VsZW1lbnRzLmRpc2NsYWltZXJMYWJlbC5hcHBlbmRDaGlsZChyZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRzLnJvb3Q7XG5cdH1cblxuXHRsYXlvdXQod2lkZ2V0RGltOiBEaW1lbnNpb24pIHtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5jb250ZW50SGVpZ2h0O1xuXHRcdHRoaXMuI2lzTGF5b3V0aW5nID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fZG9MYXlvdXQod2lkZ2V0RGltKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy4jaXNMYXlvdXRpbmcgPSBmYWxzZTtcblxuXHRcdFx0aWYgKHRoaXMuY29udGVudEhlaWdodCAhPT0gY29udGVudEhlaWdodCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9kb0xheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGV4dHJhSGVpZ2h0ID0gdGhpcy5fZ2V0RXh0cmFIZWlnaHQoKTtcblx0XHRjb25zdCBzdGF0dXNIZWlnaHQgPSBnZXRUb3RhbEhlaWdodCh0aGlzLl9lbGVtZW50cy5zdGF0dXMpO1xuXG5cdFx0Ly8gY29uc29sZS5sb2coJ1pPTkUjV2lkZ2V0I2xheW91dCcsIHsgaGVpZ2h0OiBkaW1lbnNpb24uaGVpZ2h0LCBleHRyYUhlaWdodCwgcHJvZ3Jlc3NIZWlnaHQsIGZvbGxvd1Vwc0hlaWdodCwgc3RhdHVzSGVpZ2h0LCBMSVNUOiBkaW1lbnNpb24uaGVpZ2h0IC0gcHJvZ3Jlc3NIZWlnaHQgLSBmb2xsb3dVcHNIZWlnaHQgLSBzdGF0dXNIZWlnaHQgLSBleHRyYUhlaWdodCB9KTtcblxuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3Quc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodCAtIGV4dHJhSGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLndpZHRoID0gYCR7ZGltZW5zaW9uLndpZHRofXB4YDtcblxuXHRcdHRoaXMuY2hhdFdpZGdldC5sYXlvdXQoXG5cdFx0XHRkaW1lbnNpb24uaGVpZ2h0IC0gc3RhdHVzSGVpZ2h0IC0gZXh0cmFIZWlnaHQsXG5cdFx0XHRkaW1lbnNpb24ud2lkdGhcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBjb250ZW50IGhlaWdodCBvZiB0aGlzIHdpZGdldCBpcyB0aGUgc2l6ZSB0aGF0IHdvdWxkIHJlcXVpcmUgbm8gc2Nyb2xsaW5nXG5cdCAqL1xuXHRnZXQgY29udGVudEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGRhdGEgPSB7XG5cdFx0XHRjaGF0V2lkZ2V0Q29udGVudEhlaWdodDogdGhpcy5jaGF0V2lkZ2V0LmNvbnRlbnRIZWlnaHQsXG5cdFx0XHRzdGF0dXNIZWlnaHQ6IGdldFRvdGFsSGVpZ2h0KHRoaXMuX2VsZW1lbnRzLnN0YXR1cyksXG5cdFx0XHRleHRyYUhlaWdodDogdGhpcy5fZ2V0RXh0cmFIZWlnaHQoKVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGF0YS5jaGF0V2lkZ2V0Q29udGVudEhlaWdodCArIGRhdGEuc3RhdHVzSGVpZ2h0ICsgZGF0YS5leHRyYUhlaWdodDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0IG1pbkhlaWdodCgpOiBudW1iZXIge1xuXHRcdC8vIFRoZSBjaGF0IHdpZGdldCBpcyB2YXJpYWJsZSBoZWlnaHQgYW5kIHN1cHBvcnRzIHNjcm9sbGluZy4gSXQgc2hvdWxkIGJlXG5cdFx0Ly8gYXQgbGVhc3QgXCJtYXhXaWRnZXRIZWlnaHRcIiBoaWdoIGFuZCBhdCBtb3N0IHRoZSBjb250ZW50IGhlaWdodC5cblxuXHRcdGxldCBtYXhXaWRnZXRPdXRwdXRIZWlnaHQgPSAxMDA7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuY2hhdFdpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCkgPz8gW10pIHtcblx0XHRcdGlmIChpc1Jlc3BvbnNlVk0oaXRlbSkgJiYgaXRlbS5yZXNwb25zZS52YWx1ZS5zb21lKHIgPT4gci5raW5kID09PSAndGV4dEVkaXRHcm91cCcgJiYgIXIuc3RhdGU/LmFwcGxpZWQpKSB7XG5cdFx0XHRcdG1heFdpZGdldE91dHB1dEhlaWdodCA9IDI3MDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHZhbHVlID0gdGhpcy5jb250ZW50SGVpZ2h0O1xuXHRcdHZhbHVlIC09IHRoaXMuY2hhdFdpZGdldC5jb250ZW50SGVpZ2h0O1xuXHRcdHZhbHVlICs9IE1hdGgubWluKHRoaXMuY2hhdFdpZGdldC5pbnB1dC5oZWlnaHQuZ2V0KCkgKyBtYXhXaWRnZXRPdXRwdXRIZWlnaHQsIHRoaXMuY2hhdFdpZGdldC5jb250ZW50SGVpZ2h0KTtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEV4dHJhSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuI29wdGlvbnMuaW5ab25lV2lkZ2V0ID8gMSA6ICgyIC8qYm9yZGVyKi8gKyA0IC8qc2hhZG93Ki8pO1xuXHR9XG5cblx0dXBkYXRlSW5mbyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50cy5pbmZvTGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIW1lc3NhZ2UpO1xuXHRcdGNvbnN0IHJlbmRlcmVkTWVzc2FnZSA9IHJlbmRlckxhYmVsV2l0aEljb25zKG1lc3NhZ2UpO1xuXHRcdHJlc2V0KHRoaXMuX2VsZW1lbnRzLmluZm9MYWJlbCwgLi4ucmVuZGVyZWRNZXNzYWdlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHR1cGRhdGVTdGF0dXMobWVzc2FnZTogc3RyaW5nLCBvcHM6IHsgY2xhc3Nlcz86IHN0cmluZ1tdOyByZXNldEFmdGVyPzogbnVtYmVyOyBrZWVwTWVzc2FnZT86IGJvb2xlYW47IHRpdGxlPzogc3RyaW5nIH0gPSB7fSkge1xuXHRcdGNvbnN0IGlzVGVtcE1lc3NhZ2UgPSB0eXBlb2Ygb3BzLnJlc2V0QWZ0ZXIgPT09ICdudW1iZXInO1xuXHRcdGlmIChpc1RlbXBNZXNzYWdlICYmICF0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5kYXRhc2V0WydzdGF0ZSddKSB7XG5cdFx0XHRjb25zdCBzdGF0dXNMYWJlbCA9IHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLmlubmVyVGV4dDtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuZGF0YXNldFsndGl0bGUnXTtcblx0XHRcdGNvbnN0IGNsYXNzZXMgPSBBcnJheS5mcm9tKHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLmNsYXNzTGlzdC52YWx1ZXMoKSk7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoc3RhdHVzTGFiZWwsIHsgY2xhc3Nlcywga2VlcE1lc3NhZ2U6IHRydWUsIHRpdGxlIH0pO1xuXHRcdFx0fSwgb3BzLnJlc2V0QWZ0ZXIpO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJlZE1lc3NhZ2UgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhtZXNzYWdlKTtcblx0XHRyZXNldCh0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbCwgLi4ucmVuZGVyZWRNZXNzYWdlKTtcblx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5jbGFzc05hbWUgPSBgbGFiZWwgc3RhdHVzICR7KG9wcy5jbGFzc2VzID8/IFtdKS5qb2luKCcgJyl9YDtcblx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhbWVzc2FnZSk7XG5cdFx0aWYgKGlzVGVtcE1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLmRhdGFzZXRbJ3N0YXRlJ10gPSAndGVtcCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5kYXRhc2V0WydzdGF0ZSddO1xuXHRcdH1cblxuXHRcdGlmIChvcHMudGl0bGUpIHtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLmRhdGFzZXRbJ3RpdGxlJ10gPSBvcHMudGl0bGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5kYXRhc2V0Wyd0aXRsZSddO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHRyZXNldCgpIHtcblx0XHR0aGlzLmNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmNsZWFyKHRydWUpO1xuXHRcdHRoaXMuY2hhdFdpZGdldC5zYXZlU3RhdGUoKTtcblxuXHRcdHJlc2V0KHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsKTtcblx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCB0cnVlKTtcblx0XHR0aGlzLl9lbGVtZW50cy50b29sYmFyMS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0aGlzLl9lbGVtZW50cy50b29sYmFyMi5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0aGlzLnVwZGF0ZUluZm8oJycpO1xuXG5cdFx0dGhpcy5fZWxlbWVudHMuYWNjZXNzaWJsZVZpZXdlci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCB0cnVlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHR0aGlzLmNoYXRXaWRnZXQuZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0aGFzRm9jdXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZS5jb250YWlucyhnZXRBY3RpdmVFbGVtZW50KCkpO1xuXHR9XG5cbn1cblxuY29uc3QgZGVmYXVsdEFyaWFMYWJlbCA9IGxvY2FsaXplKCdhcmlhLWxhYmVsJywgXCJJbmxpbmUgQ2hhdCBJbnB1dFwiKTtcblxuZXhwb3J0IGNsYXNzIEVkaXRvckJhc2VkSW5saW5lQ2hhdFdpZGdldCBleHRlbmRzIElubGluZUNoYXRXaWRnZXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxvY2F0aW9uOiBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyxcblx0XHRwYXJlbnRFZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdG9wdGlvbnM6IElJbmxpbmVDaGF0V2lkZ2V0Q29uc3RydWN0aW9uT3B0aW9ucyxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIGFjY2Vzc2libGVWaWV3U2VydmljZTogSUFjY2Vzc2libGVWaWV3U2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBvdmVyZmxvd1dpZGdldHNOb2RlID0gbGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KHBhcmVudEVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkpKS5hcHBlbmRDaGlsZCgkKCcuaW5saW5lLWNoYXQtb3ZlcmZsb3cubW9uYWNvLWVkaXRvcicpKTtcblx0XHRzdXBlcihsb2NhdGlvbiwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGNoYXRXaWRnZXRWaWV3T3B0aW9uczoge1xuXHRcdFx0XHQuLi5vcHRpb25zLmNoYXRXaWRnZXRWaWV3T3B0aW9ucyxcblx0XHRcdFx0ZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogb3ZlcmZsb3dXaWRnZXRzTm9kZVxuXHRcdFx0fVxuXHRcdH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLCB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UsIGNoYXRTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0b3ZlcmZsb3dXaWRnZXRzTm9kZS5yZW1vdmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gbGF5b3V0XG5cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RvTGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cblx0XHRjb25zdCBuZXdIZWlnaHQgPSBkaW1lbnNpb24uaGVpZ2h0O1xuXG5cdFx0c3VwZXIuX2RvTGF5b3V0KGRpbWVuc2lvbi53aXRoKHVuZGVmaW5lZCwgbmV3SGVpZ2h0KSk7XG5cblx0XHQvLyB1cGRhdGUvZml4IHRoZSBoZWlnaHQgb2YgdGhlIHpvbmUgd2hpY2ggd2FzIHNldCB0byBuZXdIZWlnaHQgaW4gc3VwZXIuX2RvTGF5b3V0XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0IC0gdGhpcy5fZ2V0RXh0cmFIZWlnaHQoKX1weGA7XG5cdH1cblxuXHRvdmVycmlkZSByZXNldCgpIHtcblx0XHR0aGlzLmNoYXRXaWRnZXQuc2V0SW5wdXQoKTtcblx0XHRzdXBlci5yZXNldCgpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFjLGtCQUFrQixnQkFBZ0IsV0FBVyxHQUFHLE9BQU8sa0JBQWtCO0FBRWhHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLFNBQXNCLHVCQUF1QjtBQUN0RCxTQUFTLGVBQWU7QUFHeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBcUMsOEJBQThCO0FBQ25FLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsZUFBZSxtQkFBbUIsa0JBQWtCLHVCQUF1QjtBQUNwRixTQUFTLHVDQUF1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
