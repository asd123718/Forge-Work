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
import { Dimension, getActiveWindow, trackFocus } from "../../../../../base/browser/dom.js";
import { createCancelablePromise, DeferredPromise } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { MicrotaskDelay } from "../../../../../base/common/symbols.js";
import { localize } from "../../../../../nls.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IChatWidgetService } from "../../../chat/browser/chat.js";
import { IChatAgentService } from "../../../chat/common/participants/chatAgents.js";
import { isCellTextEditOperationArray } from "../../../chat/common/model/chatModel.js";
import { ChatMode } from "../../../chat/common/chatModes.js";
import { IChatService } from "../../../chat/common/chatService/chatService.js";
import { ChatAgentLocation } from "../../../chat/common/constants.js";
import { InlineChatWidget } from "../../../inlineChat/browser/inlineChatWidget.js";
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from "../../../inlineChat/common/inlineChat.js";
import { TerminalStickyScrollContribution } from "../../stickyScroll/browser/terminalStickyScrollContribution.js";
import "./media/terminalChatWidget.css";
import { MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from "./terminalChat.js";
import { isResponseVM } from "../../../chat/common/model/chatViewModel.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["HorizontalMargin"] = 10] = "HorizontalMargin";
  Constants2[Constants2["VerticalMargin"] = 30] = "VerticalMargin";
  Constants2[Constants2["RightPadding"] = 12] = "RightPadding";
  Constants2[Constants2["MaxHeight"] = 480] = "MaxHeight";
  Constants2[Constants2["MaxHeightPercentageOfViewport"] = 0.75] = "MaxHeightPercentageOfViewport";
  return Constants2;
})(Constants || {});
var Message = /* @__PURE__ */ ((Message2) => {
  Message2[Message2["None"] = 0] = "None";
  Message2[Message2["AcceptSession"] = 1] = "AcceptSession";
  Message2[Message2["CancelSession"] = 2] = "CancelSession";
  Message2[Message2["PauseSession"] = 4] = "PauseSession";
  Message2[Message2["CancelRequest"] = 8] = "CancelRequest";
  Message2[Message2["CancelInput"] = 16] = "CancelInput";
  Message2[Message2["AcceptInput"] = 32] = "AcceptInput";
  Message2[Message2["ReturnInput"] = 64] = "ReturnInput";
  return Message2;
})(Message || {});
let TerminalChatWidget = class extends Disposable {
  constructor(_terminalElement, _instance, _xterm, contextKeyService, _chatService, _storageService, instantiationService, _chatAgentService, _chatWidgetService) {
    super();
    this._terminalElement = _terminalElement;
    this._instance = _instance;
    this._xterm = _xterm;
    this._chatService = _chatService;
    this._storageService = _storageService;
    this._chatAgentService = _chatAgentService;
    this._chatWidgetService = _chatWidgetService;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._messages = this._store.add(new Emitter());
    this._viewStateStorageKey = "terminal-inline-chat-view-state";
    this._terminalAgentName = "terminal";
    this._model = this._register(new MutableDisposable());
    this._sessionDisposables = this._register(new MutableDisposable());
    this._requestInProgress = observableValue(this, false);
    this.requestInProgress = this._requestInProgress;
    this._focusedContextKey = TerminalChatContextKeys.focused.bindTo(contextKeyService);
    this._visibleContextKey = TerminalChatContextKeys.visible.bindTo(contextKeyService);
    this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(contextKeyService);
    this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(contextKeyService);
    this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(contextKeyService);
    this._container = document.createElement("div");
    this._container.classList.add("terminal-inline-chat");
    this._terminalElement.appendChild(this._container);
    this._inlineChatWidget = instantiationService.createInstance(
      TerminalInlineChatWidget,
      {
        location: ChatAgentLocation.Terminal,
        resolveData: () => {
          return void 0;
        }
      },
      {
        statusMenuId: {
          menu: MENU_TERMINAL_CHAT_WIDGET_STATUS,
          options: {
            buttonConfigProvider: (action) => ({
              showLabel: action.id !== TerminalChatCommandId.RerunRequest,
              showIcon: action.id === TerminalChatCommandId.RerunRequest,
              isSecondary: action.id !== TerminalChatCommandId.RunCommand && action.id !== TerminalChatCommandId.RunFirstCommand
            })
          }
        },
        secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
        chatWidgetViewOptions: {
          menus: {
            telemetrySource: "terminal-inline-chat",
            executeToolbar: MenuId.ChatExecute,
            inputSideToolbar: MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR
          },
          defaultMode: ChatMode.Ask
        }
      }
    );
    this._register(this._inlineChatWidget.chatWidget.onDidChangeViewModel(() => this._saveInputState()));
    this._register(Event.any(
      this._inlineChatWidget.onDidChangeHeight,
      this._instance.onDimensionsChanged,
      this._inlineChatWidget.chatWidget.onDidChangeContentHeight,
      Event.fromObservableLight(this._inlineChatWidget.chatWidget.input.selectedLanguageModel),
      Event.debounce(this._xterm.raw.onCursorMove, () => void 0, MicrotaskDelay)
    )(() => this._relayout()));
    const observer = new ResizeObserver(() => this._relayout());
    observer.observe(this._terminalElement);
    this._register(toDisposable(() => observer.disconnect()));
    this._resetPlaceholder();
    this._container.appendChild(this._inlineChatWidget.domNode);
    this._focusTracker = this._register(trackFocus(this._container));
    this._register(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
    this._register(this._focusTracker.onDidBlur(() => this._focusedContextKey.set(false)));
    this._register(autorun((r) => {
      const isBusy = this._inlineChatWidget.requestInProgress.read(r);
      this._container.classList.toggle("busy", isBusy);
      this._inlineChatWidget.toggleStatus(!!this._inlineChatWidget.responseContent);
      if (isBusy || !this._inlineChatWidget.responseContent) {
        this._responseContainsCodeBlockContextKey.set(false);
        this._responseContainsMulitpleCodeBlocksContextKey.set(false);
      } else {
        Promise.all([
          this._inlineChatWidget.getCodeBlockInfo(0),
          this._inlineChatWidget.getCodeBlockInfo(1)
        ]).then(([firstCodeBlock, secondCodeBlock]) => {
          this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
          this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
          this._inlineChatWidget.updateToolbar(true);
        });
      }
    }));
    this.hide();
  }
  get inlineChatWidget() {
    return this._inlineChatWidget;
  }
  get lastResponseContent() {
    return this._lastResponseContent;
  }
  _relayout() {
    if (this._dimension) {
      this._doLayout();
    }
  }
  _doLayout() {
    const xtermElement = this._xterm.raw.element;
    if (!xtermElement) {
      return;
    }
    const style = getActiveWindow().getComputedStyle(xtermElement);
    const xtermLeftPadding = parseInt(style.paddingLeft);
    const width = xtermElement.clientWidth - xtermLeftPadding - 12 /* RightPadding */;
    if (width === 0) {
      return;
    }
    const terminalViewportHeight = this._getTerminalViewportHeight();
    const widgetAllowedPercentBasedHeight = (terminalViewportHeight ?? 0) * 0.75 /* MaxHeightPercentageOfViewport */;
    const height = Math.max(Math.min(480 /* MaxHeight */, this._inlineChatWidget.contentHeight, widgetAllowedPercentBasedHeight), this._inlineChatWidget.minHeight);
    if (height === 0) {
      return;
    }
    this._dimension = new Dimension(width, height);
    this._inlineChatWidget.layout(this._dimension);
    this._inlineChatWidget.domNode.style.paddingLeft = `${xtermLeftPadding}px`;
    this._updateXtermViewportPosition();
  }
  _resetPlaceholder() {
    const defaultAgent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Terminal);
    this.inlineChatWidget.placeholder = defaultAgent?.description ?? localize("askAboutCommands", "Ask about commands");
  }
  async reveal() {
    await this._createSession();
    this._doLayout();
    this._container.classList.remove("hide");
    this._visibleContextKey.set(true);
    this._resetPlaceholder();
    this._inlineChatWidget.focus();
    this._instance.scrollToBottom();
  }
  _getTerminalCursorTop() {
    const font = this._instance.xterm?.getFont();
    if (!font?.charHeight) {
      return;
    }
    const terminalWrapperHeight = this._getTerminalViewportHeight() ?? 0;
    const cellHeight = font.charHeight * font.lineHeight;
    const topPadding = terminalWrapperHeight - this._instance.rows * cellHeight;
    const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
    return topPadding + cursorY * cellHeight;
  }
  _updateXtermViewportPosition() {
    const top = this._getTerminalCursorTop();
    if (!top) {
      return;
    }
    this._container.style.top = `${top}px`;
    const terminalViewportHeight = this._getTerminalViewportHeight();
    if (!terminalViewportHeight) {
      return;
    }
    const widgetAllowedPercentBasedHeight = terminalViewportHeight * 0.75 /* MaxHeightPercentageOfViewport */;
    const height = Math.max(Math.min(480 /* MaxHeight */, this._inlineChatWidget.contentHeight, widgetAllowedPercentBasedHeight), this._inlineChatWidget.minHeight);
    if (top > terminalViewportHeight - height && terminalViewportHeight - height > 0) {
      this._setTerminalViewportOffset(top - (terminalViewportHeight - height));
    } else {
      this._setTerminalViewportOffset(void 0);
    }
  }
  _getTerminalViewportHeight() {
    return this._terminalElement.clientHeight;
  }
  hide() {
    this._container.classList.add("hide");
    this._inlineChatWidget.reset();
    this._resetPlaceholder();
    this._inlineChatWidget.updateToolbar(false);
    this._visibleContextKey.set(false);
    this._inlineChatWidget.value = "";
    this._instance.focus();
    this._setTerminalViewportOffset(void 0);
    this._onDidHide.fire();
  }
  _setTerminalViewportOffset(offset) {
    if (offset === void 0 || this._container.classList.contains("hide")) {
      this._terminalElement.style.position = "";
      this._terminalElement.style.bottom = "";
      TerminalStickyScrollContribution.get(this._instance)?.hideUnlock();
    } else {
      this._terminalElement.style.position = "relative";
      this._terminalElement.style.bottom = `${offset}px`;
      TerminalStickyScrollContribution.get(this._instance)?.hideLock();
    }
  }
  focus() {
    this.inlineChatWidget.focus();
  }
  hasFocus() {
    return this._inlineChatWidget.hasFocus();
  }
  setValue(value) {
    this._inlineChatWidget.value = value ?? "";
  }
  async acceptCommand(shouldExecute) {
    const code = await this.inlineChatWidget.getCodeBlockInfo(0);
    if (!code) {
      return;
    }
    const value = code.getValue();
    this._instance.runCommand(value, shouldExecute);
    this.clear();
  }
  get focusTracker() {
    return this._focusTracker;
  }
  async _createSession() {
    this._sessionCtor = createCancelablePromise(async (token) => {
      if (!this._model.value) {
        const modelRef = this._chatService.startNewLocalSession(ChatAgentLocation.Terminal);
        this._model.value = modelRef;
        const model = modelRef.object;
        this._inlineChatWidget.setChatModel(model);
        this._resetPlaceholder();
      }
    });
    this._sessionDisposables.value = toDisposable(() => this._sessionCtor?.cancel());
  }
  _saveInputState() {
    const inputState = this._inlineChatWidget.chatWidget.getInputState();
    if (inputState) {
      this._storageService.store(this._viewStateStorageKey, JSON.stringify(inputState), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  clear() {
    this.cancel();
    this._model.clear();
    this._responseContainsCodeBlockContextKey.reset();
    this._requestActiveContextKey.reset();
    this.hide();
    this.setValue(void 0);
  }
  async acceptInput(query, options) {
    if (!this._model.value) {
      await this.reveal();
    }
    this._messages.fire(32 /* AcceptInput */);
    const lastInput = this._inlineChatWidget.value;
    if (!lastInput) {
      return;
    }
    this._activeRequestCts?.cancel();
    this._activeRequestCts = new CancellationTokenSource();
    const store = new DisposableStore();
    this._requestActiveContextKey.set(true);
    const response = await this._inlineChatWidget.chatWidget.acceptInput(lastInput, { isVoiceInput: options?.isVoiceInput });
    this._currentRequestId = response?.requestId;
    const responsePromise = new DeferredPromise();
    try {
      this._requestActiveContextKey.set(true);
      if (response) {
        store.add(response.onDidChange(async () => {
          if (response.isCanceled) {
            this._requestActiveContextKey.set(false);
            responsePromise.complete(void 0);
            return;
          }
          if (response.isComplete) {
            this._requestActiveContextKey.set(false);
            this._requestActiveContextKey.set(false);
            const firstCodeBlock = await this._inlineChatWidget.getCodeBlockInfo(0);
            const secondCodeBlock = await this._inlineChatWidget.getCodeBlockInfo(1);
            this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
            this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
            this._inlineChatWidget.updateToolbar(true);
            responsePromise.complete(response);
          }
        }));
      }
      await responsePromise.p;
      this._lastResponseContent = response?.response.getMarkdown();
      return response;
    } catch {
      this._lastResponseContent = void 0;
      return;
    } finally {
      store.dispose();
    }
  }
  cancel() {
    this._sessionCtor?.cancel();
    this._sessionCtor = void 0;
    this._activeRequestCts?.cancel();
    this._requestActiveContextKey.set(false);
    const model = this._inlineChatWidget.getChatModel();
    if (!model?.sessionResource) {
      return;
    }
    void this._chatService.cancelCurrentRequestForSession(model?.sessionResource, "terminalChat");
  }
  async viewInChat() {
    const widget = await this._chatWidgetService.revealWidget();
    const currentRequest = this._inlineChatWidget.chatWidget.viewModel?.model.getRequests().find((r) => r.id === this._currentRequestId);
    if (!widget || !currentRequest?.response) {
      return;
    }
    const message = [];
    for (const item of currentRequest.response.response.value) {
      if (item.kind === "textEditGroup") {
        for (const group of item.edits) {
          message.push({
            kind: "textEdit",
            edits: group,
            uri: item.uri
          });
        }
      } else if (item.kind === "notebookEditGroup") {
        for (const group of item.edits) {
          if (isCellTextEditOperationArray(group)) {
            message.push({
              kind: "textEdit",
              edits: group.map((e) => e.edit),
              uri: group[0].uri
            });
          } else {
            message.push({
              kind: "notebookEdit",
              edits: group,
              uri: item.uri
            });
          }
        }
      } else {
        message.push(item);
      }
    }
    this._chatService.addCompleteRequest(
      widget.viewModel.sessionResource,
      `@${this._terminalAgentName} ${currentRequest.message.text}`,
      currentRequest.variableData,
      currentRequest.attempt,
      {
        message,
        result: currentRequest.response.result,
        followups: currentRequest.response.followups
      }
    );
    widget.focusResponseItem();
    this.hide();
  }
};
TerminalChatWidget = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IChatAgentService),
  __decorateParam(8, IChatWidgetService)
], TerminalChatWidget);
let TerminalInlineChatWidget = class extends InlineChatWidget {
  constructor(location, options, instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService, hoverService, chatEntitlementService, markdownRendererService, _modelService) {
    super(location, options, instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService, hoverService, chatEntitlementService, markdownRendererService);
    this._modelService = _modelService;
  }
  get value() {
    return this.chatWidget.getInput();
  }
  set value(value) {
    this.chatWidget.setInput(value);
  }
  selectAll() {
    this.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
  }
  set placeholder(value) {
    this.chatWidget.setInputPlaceholder(value);
  }
  toggleStatus(show) {
    this._elements.toolbar1.classList.toggle("hidden", !show);
    this._elements.toolbar2.classList.toggle("hidden", !show);
    this._elements.status.classList.toggle("hidden", !show);
    this._elements.infoLabel.classList.toggle("hidden", !show);
    this._onDidChangeHeight.fire();
  }
  updateToolbar(show) {
    this._elements.root.classList.toggle("toolbar", show);
    this._elements.toolbar1.classList.toggle("hidden", !show);
    this._elements.toolbar2.classList.toggle("hidden", !show);
    this._elements.status.classList.toggle("actions", show);
    this._elements.infoLabel.classList.toggle("hidden", show);
    this._onDidChangeHeight.fire();
  }
  get responseContent() {
    const requests = this.chatWidget.viewModel?.model.getRequests();
    return requests?.at(-1)?.response?.response.toString();
  }
  getChatModel() {
    return this.chatWidget.viewModel?.model;
  }
  setChatModel(chatModel) {
    chatModel.inputModel.setState({ inputText: "", selections: [] });
    this.chatWidget.setModel(chatModel);
  }
  async getCodeBlockInfo(codeBlockIndex) {
    const { viewModel } = this.chatWidget;
    if (!viewModel) {
      return void 0;
    }
    const items = viewModel.getItems().filter((i) => isResponseVM(i));
    const item = items.at(-1);
    if (!item) {
      return;
    }
    const codeBlocks = this.chatWidget.getCodeBlockInfosForResponse(item);
    const info = codeBlocks[codeBlockIndex];
    if (info?.uri) {
      return this._modelService.getModel(info.uri) ?? void 0;
    }
    const markdown = item.response.getMarkdown();
    let currentCodeBlockIndex = 0;
    let foundText;
    for (const line of markdown.split("\n")) {
      if (line.startsWith("```") && foundText === void 0) {
        foundText = "";
      } else if (line.startsWith("```") && foundText !== void 0) {
        if (currentCodeBlockIndex === codeBlockIndex) {
          break;
        }
        currentCodeBlockIndex++;
        foundText = void 0;
      } else if (foundText !== void 0) {
        foundText += (foundText ? "\n" : "") + line;
      }
    }
    if (foundText !== void 0 && currentCodeBlockIndex === codeBlockIndex) {
      return this._modelService.createModel(foundText, null, void 0, true);
    }
    return void 0;
  }
};
TerminalInlineChatWidget = __decorateClass([
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
  __decorateParam(12, IMarkdownRendererService),
  __decorateParam(13, IModelService)
], TerminalInlineChatWidget);
export {
  TerminalChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdFxcYnJvd3NlclxcdGVybWluYWxDaGF0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCBhcyBSYXdYdGVybVRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IERpbWVuc2lvbiwgZ2V0QWN0aXZlV2luZG93LCBJRm9jdXNUcmFja2VyLCB0cmFja0ZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUsIHR5cGUgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE1pY3JvdGFza0RlbGF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDaGF0QWNjZXB0SW5wdXRPcHRpb25zLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVzcG9uc2VNb2RlbCwgaXNDZWxsVGV4dEVkaXRPcGVyYXRpb25BcnJheSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsUmVmZXJlbmNlLCBJQ2hhdFByb2dyZXNzLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ2hhdFdpZGdldENvbnN0cnVjdGlvbk9wdGlvbnMsIElubGluZUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBNRU5VX0lOTElORV9DSEFUX1dJREdFVF9TRUNPTkRBUlkgfSBmcm9tICcuLi8uLi8uLi9pbmxpbmVDaGF0L2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCB0eXBlIElYdGVybVRlcm1pbmFsIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0aWNreVNjcm9sbENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL3N0aWNreVNjcm9sbC9icm93c2VyL3Rlcm1pbmFsU3RpY2t5U2Nyb2xsQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi9tZWRpYS90ZXJtaW5hbENoYXRXaWRnZXQuY3NzJztcbmltcG9ydCB7IE1FTlVfVEVSTUlOQUxfQ0hBVF9XSURHRVRfSU5QVVRfU0lERV9UT09MQkFSLCBNRU5VX1RFUk1JTkFMX0NIQVRfV0lER0VUX1NUQVRVUywgVGVybWluYWxDaGF0Q29tbWFuZElkLCBUZXJtaW5hbENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4vdGVybWluYWxDaGF0LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0SG9yaXpvbnRhbE1hcmdpbiA9IDEwLFxuXHRWZXJ0aWNhbE1hcmdpbiA9IDMwLFxuXHQvKiogVGhlIHJpZ2h0IHBhZGRpbmcgb2YgdGhlIHdpZGdldCwgdGhpcyBzaG91bGQgYWxpZ24gZXhhY3RseSB3aXRoIHRoYXQgaW4gdGhlIGVkaXRvci4gKi9cblx0UmlnaHRQYWRkaW5nID0gMTIsXG5cdC8qKiBUaGUgbWF4IGFsbG93ZWQgaGVpZ2h0IG9mIHRoZSB3aWRnZXQuICovXG5cdE1heEhlaWdodCA9IDQ4MCxcblx0LyoqIFRoZSBtYXggYWxsb3dlZCBoZWlnaHQgb2YgdGhlIHdpZGdldCBhcyBhIHBlcmNlbnRhZ2Ugb2YgdGhlIHRlcm1pbmFsIHZpZXdwb3J0LiAqL1xuXHRNYXhIZWlnaHRQZXJjZW50YWdlT2ZWaWV3cG9ydCA9IDAuNzUsXG59XG5cbmNvbnN0IGVudW0gTWVzc2FnZSB7XG5cdE5vbmUgPSAwLFxuXHRBY2NlcHRTZXNzaW9uID0gMSA8PCAwLFxuXHRDYW5jZWxTZXNzaW9uID0gMSA8PCAxLFxuXHRQYXVzZVNlc3Npb24gPSAxIDw8IDIsXG5cdENhbmNlbFJlcXVlc3QgPSAxIDw8IDMsXG5cdENhbmNlbElucHV0ID0gMSA8PCA0LFxuXHRBY2NlcHRJbnB1dCA9IDEgPDwgNSxcblx0UmV0dXJuSW5wdXQgPSAxIDw8IDYsXG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbENoYXRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSGlkZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lQ2hhdFdpZGdldDogVGVybWluYWxJbmxpbmVDaGF0V2lkZ2V0O1xuXHRwdWJsaWMgZ2V0IGlubGluZUNoYXRXaWRnZXQoKTogVGVybWluYWxJbmxpbmVDaGF0V2lkZ2V0IHsgcmV0dXJuIHRoaXMuX2lubGluZUNoYXRXaWRnZXQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c1RyYWNrZXI6IElGb2N1c1RyYWNrZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdEFjdGl2ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNwb25zZUNvbnRhaW5zQ29kZUJsb2NrQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3BvbnNlQ29udGFpbnNNdWxpdHBsZUNvZGVCbG9ja3NDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9tZXNzYWdlcyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxNZXNzYWdlPigpKTtcblxuXHRwcml2YXRlIF92aWV3U3RhdGVTdG9yYWdlS2V5ID0gJ3Rlcm1pbmFsLWlubGluZS1jaGF0LXZpZXctc3RhdGUnO1xuXG5cdHByaXZhdGUgX2xhc3RSZXNwb25zZUNvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGxhc3RSZXNwb25zZUNvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFJlc3BvbnNlQ29udGVudDtcblx0fVxuXG5cdHByaXZhdGUgX3Rlcm1pbmFsQWdlbnROYW1lID0gJ3Rlcm1pbmFsJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogTXV0YWJsZURpc3Bvc2FibGU8SUNoYXRNb2RlbFJlZmVyZW5jZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNwb3NhYmxlczogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgX3Nlc3Npb25DdG9yOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jdXJyZW50UmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVJlcXVlc3RDdHM/OiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0SW5Qcm9ncmVzcyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IHJlcXVlc3RJblByb2dyZXNzOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX3JlcXVlc3RJblByb2dyZXNzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3h0ZXJtOiBJWHRlcm1UZXJtaW5hbCAmIHsgcmF3OiBSYXdYdGVybVRlcm1pbmFsIH0sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9mb2N1c2VkQ29udGV4dEtleSA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmZvY3VzZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl92aXNpYmxlQ29udGV4dEtleSA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnZpc2libGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZXF1ZXN0QWN0aXZlQ29udGV4dEtleSA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlcXVlc3RBY3RpdmUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZXNwb25zZUNvbnRhaW5zQ29kZUJsb2NrQ29udGV4dEtleSA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlQ29udGFpbnNDb2RlQmxvY2suYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZXNwb25zZUNvbnRhaW5zTXVsaXRwbGVDb2RlQmxvY2tzQ29udGV4dEtleSA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlQ29udGFpbnNNdWx0aXBsZUNvZGVCbG9ja3MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0ZXJtaW5hbC1pbmxpbmUtY2hhdCcpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xuXG5cdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VGVybWluYWxJbmxpbmVDaGF0V2lkZ2V0LFxuXHRcdFx0e1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwsXG5cdFx0XHRcdHJlc29sdmVEYXRhOiAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gVE9ET0BtZWdhbnJvZ2dlIHJldHVybiBzb21ldGhpbmcgdGhhdCBpZGVudGlmaWVzIHRoaXMgdGVybWluYWxcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRzdGF0dXNNZW51SWQ6IHtcblx0XHRcdFx0XHRtZW51OiBNRU5VX1RFUk1JTkFMX0NIQVRfV0lER0VUX1NUQVRVUyxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRidXR0b25Db25maWdQcm92aWRlcjogYWN0aW9uID0+ICh7XG5cdFx0XHRcdFx0XHRcdHNob3dMYWJlbDogYWN0aW9uLmlkICE9PSBUZXJtaW5hbENoYXRDb21tYW5kSWQuUmVydW5SZXF1ZXN0LFxuXHRcdFx0XHRcdFx0XHRzaG93SWNvbjogYWN0aW9uLmlkID09PSBUZXJtaW5hbENoYXRDb21tYW5kSWQuUmVydW5SZXF1ZXN0LFxuXHRcdFx0XHRcdFx0XHRpc1NlY29uZGFyeTogYWN0aW9uLmlkICE9PSBUZXJtaW5hbENoYXRDb21tYW5kSWQuUnVuQ29tbWFuZCAmJiBhY3Rpb24uaWQgIT09IFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5SdW5GaXJzdENvbW1hbmRcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZWNvbmRhcnlNZW51SWQ6IE1FTlVfSU5MSU5FX0NIQVRfV0lER0VUX1NFQ09OREFSWSxcblx0XHRcdFx0Y2hhdFdpZGdldFZpZXdPcHRpb25zOiB7XG5cdFx0XHRcdFx0bWVudXM6IHtcblx0XHRcdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ3Rlcm1pbmFsLWlubGluZS1jaGF0Jyxcblx0XHRcdFx0XHRcdGV4ZWN1dGVUb29sYmFyOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHRcdFx0XHRpbnB1dFNpZGVUb29sYmFyOiBNRU5VX1RFUk1JTkFMX0NIQVRfV0lER0VUX0lOUFVUX1NJREVfVE9PTEJBUixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlZmF1bHRNb2RlOiBDaGF0TW9kZS5Bc2tcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lubGluZUNoYXRXaWRnZXQuY2hhdFdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCgoKSA9PiB0aGlzLl9zYXZlSW5wdXRTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldC5vbkRpZENoYW5nZUhlaWdodCxcblx0XHRcdHRoaXMuX2luc3RhbmNlLm9uRGltZW5zaW9uc0NoYW5nZWQsXG5cdFx0XHR0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmNoYXRXaWRnZXQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LFxuXHRcdFx0RXZlbnQuZnJvbU9ic2VydmFibGVMaWdodCh0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmNoYXRXaWRnZXQuaW5wdXQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsKSxcblx0XHRcdEV2ZW50LmRlYm91bmNlKHRoaXMuX3h0ZXJtLnJhdy5vbkN1cnNvck1vdmUsICgpID0+IHZvaWQgMCwgTWljcm90YXNrRGVsYXkpLFxuXHRcdCkoKCkgPT4gdGhpcy5fcmVsYXlvdXQoKSkpO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKCkgPT4gdGhpcy5fcmVsYXlvdXQoKSk7XG5cdFx0b2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLl90ZXJtaW5hbEVsZW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBvYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblxuXHRcdHRoaXMuX3Jlc2V0UGxhY2Vob2xkZXIoKTtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5faW5saW5lQ2hhdFdpZGdldC5kb21Ob2RlKTtcblxuXHRcdHRoaXMuX2ZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKHRyYWNrRm9jdXModGhpcy5fY29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5fZm9jdXNlZENvbnRleHRLZXkuc2V0KHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLl9mb2N1c2VkQ29udGV4dEtleS5zZXQoZmFsc2UpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgaXNCdXN5ID0gdGhpcy5faW5saW5lQ2hhdFdpZGdldC5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHIpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2J1c3knLCBpc0J1c3kpO1xuXG5cdFx0XHR0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LnRvZ2dsZVN0YXR1cyghIXRoaXMuX2lubGluZUNoYXRXaWRnZXQucmVzcG9uc2VDb250ZW50KTtcblxuXHRcdFx0aWYgKGlzQnVzeSB8fCAhdGhpcy5faW5saW5lQ2hhdFdpZGdldC5yZXNwb25zZUNvbnRlbnQpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VDb250YWluc0NvZGVCbG9ja0NvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VDb250YWluc011bGl0cGxlQ29kZUJsb2Nrc0NvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmdldENvZGVCbG9ja0luZm8oMCksXG5cdFx0XHRcdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldC5nZXRDb2RlQmxvY2tJbmZvKDEpXG5cdFx0XHRcdF0pLnRoZW4oKFtmaXJzdENvZGVCbG9jaywgc2Vjb25kQ29kZUJsb2NrXSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3BvbnNlQ29udGFpbnNDb2RlQmxvY2tDb250ZXh0S2V5LnNldCghIWZpcnN0Q29kZUJsb2NrKTtcblx0XHRcdFx0XHR0aGlzLl9yZXNwb25zZUNvbnRhaW5zTXVsaXRwbGVDb2RlQmxvY2tzQ29udGV4dEtleS5zZXQoISFzZWNvbmRDb2RlQmxvY2spO1xuXHRcdFx0XHRcdHRoaXMuX2lubGluZUNoYXRXaWRnZXQudXBkYXRlVG9vbGJhcih0cnVlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5oaWRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9kaW1lbnNpb24/OiBEaW1lbnNpb247XG5cblx0cHJpdmF0ZSBfcmVsYXlvdXQoKSB7XG5cdFx0aWYgKHRoaXMuX2RpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5fZG9MYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb0xheW91dCgpIHtcblx0XHRjb25zdCB4dGVybUVsZW1lbnQgPSB0aGlzLl94dGVybS5yYXchLmVsZW1lbnQ7XG5cdFx0aWYgKCF4dGVybUVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdHlsZSA9IGdldEFjdGl2ZVdpbmRvdygpLmdldENvbXB1dGVkU3R5bGUoeHRlcm1FbGVtZW50KTtcblxuXHRcdC8vIENhbGN1bGF0ZSB3aWR0aFxuXHRcdGNvbnN0IHh0ZXJtTGVmdFBhZGRpbmcgPSBwYXJzZUludChzdHlsZS5wYWRkaW5nTGVmdCk7XG5cdFx0Y29uc3Qgd2lkdGggPSB4dGVybUVsZW1lbnQuY2xpZW50V2lkdGggLSB4dGVybUxlZnRQYWRkaW5nIC0gQ29uc3RhbnRzLlJpZ2h0UGFkZGluZztcblx0XHRpZiAod2lkdGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDYWxjdWxhdGUgaGVpZ2h0XG5cdFx0Y29uc3QgdGVybWluYWxWaWV3cG9ydEhlaWdodCA9IHRoaXMuX2dldFRlcm1pbmFsVmlld3BvcnRIZWlnaHQoKTtcblx0XHRjb25zdCB3aWRnZXRBbGxvd2VkUGVyY2VudEJhc2VkSGVpZ2h0ID0gKHRlcm1pbmFsVmlld3BvcnRIZWlnaHQgPz8gMCkgKiBDb25zdGFudHMuTWF4SGVpZ2h0UGVyY2VudGFnZU9mVmlld3BvcnQ7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoTWF0aC5taW4oQ29uc3RhbnRzLk1heEhlaWdodCwgdGhpcy5faW5saW5lQ2hhdFdpZGdldC5jb250ZW50SGVpZ2h0LCB3aWRnZXRBbGxvd2VkUGVyY2VudEJhc2VkSGVpZ2h0KSwgdGhpcy5faW5saW5lQ2hhdFdpZGdldC5taW5IZWlnaHQpO1xuXHRcdGlmIChoZWlnaHQgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMYXlvdXRcblx0XHR0aGlzLl9kaW1lbnNpb24gPSBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdHRoaXMuX2lubGluZUNoYXRXaWRnZXQubGF5b3V0KHRoaXMuX2RpbWVuc2lvbik7XG5cdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldC5kb21Ob2RlLnN0eWxlLnBhZGRpbmdMZWZ0ID0gYCR7eHRlcm1MZWZ0UGFkZGluZ31weGA7XG5cdFx0dGhpcy5fdXBkYXRlWHRlcm1WaWV3cG9ydFBvc2l0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldFBsYWNlaG9sZGVyKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKTtcblx0XHR0aGlzLmlubGluZUNoYXRXaWRnZXQucGxhY2Vob2xkZXIgPSBkZWZhdWx0QWdlbnQ/LmRlc2NyaXB0aW9uID8/IGxvY2FsaXplKCdhc2tBYm91dENvbW1hbmRzJywgJ0FzayBhYm91dCBjb21tYW5kcycpO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2NyZWF0ZVNlc3Npb24oKTtcblx0XHR0aGlzLl9kb0xheW91dCgpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuX3Jlc2V0UGxhY2Vob2xkZXIoKTtcblx0XHR0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmZvY3VzKCk7XG5cdFx0dGhpcy5faW5zdGFuY2Uuc2Nyb2xsVG9Cb3R0b20oKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsQ3Vyc29yVG9wKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9udCA9IHRoaXMuX2luc3RhbmNlLnh0ZXJtPy5nZXRGb250KCk7XG5cdFx0aWYgKCFmb250Py5jaGFySGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsV3JhcHBlckhlaWdodCA9IHRoaXMuX2dldFRlcm1pbmFsVmlld3BvcnRIZWlnaHQoKSA/PyAwO1xuXHRcdGNvbnN0IGNlbGxIZWlnaHQgPSBmb250LmNoYXJIZWlnaHQgKiBmb250LmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgdG9wUGFkZGluZyA9IHRlcm1pbmFsV3JhcHBlckhlaWdodCAtICh0aGlzLl9pbnN0YW5jZS5yb3dzICogY2VsbEhlaWdodCk7XG5cdFx0Y29uc3QgY3Vyc29yWSA9ICh0aGlzLl9pbnN0YW5jZS54dGVybT8ucmF3LmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSA/PyAwKSArIDE7XG5cdFx0cmV0dXJuIHRvcFBhZGRpbmcgKyBjdXJzb3JZICogY2VsbEhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVh0ZXJtVmlld3BvcnRQb3NpdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0b3AgPSB0aGlzLl9nZXRUZXJtaW5hbEN1cnNvclRvcCgpO1xuXHRcdGlmICghdG9wKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdGNvbnN0IHRlcm1pbmFsVmlld3BvcnRIZWlnaHQgPSB0aGlzLl9nZXRUZXJtaW5hbFZpZXdwb3J0SGVpZ2h0KCk7XG5cdFx0aWYgKCF0ZXJtaW5hbFZpZXdwb3J0SGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0QWxsb3dlZFBlcmNlbnRCYXNlZEhlaWdodCA9IHRlcm1pbmFsVmlld3BvcnRIZWlnaHQgKiBDb25zdGFudHMuTWF4SGVpZ2h0UGVyY2VudGFnZU9mVmlld3BvcnQ7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoTWF0aC5taW4oQ29uc3RhbnRzLk1heEhlaWdodCwgdGhpcy5faW5saW5lQ2hhdFdpZGdldC5jb250ZW50SGVpZ2h0LCB3aWRnZXRBbGxvd2VkUGVyY2VudEJhc2VkSGVpZ2h0KSwgdGhpcy5faW5saW5lQ2hhdFdpZGdldC5taW5IZWlnaHQpO1xuXHRcdGlmICh0b3AgPiB0ZXJtaW5hbFZpZXdwb3J0SGVpZ2h0IC0gaGVpZ2h0ICYmIHRlcm1pbmFsVmlld3BvcnRIZWlnaHQgLSBoZWlnaHQgPiAwKSB7XG5cdFx0XHR0aGlzLl9zZXRUZXJtaW5hbFZpZXdwb3J0T2Zmc2V0KHRvcCAtICh0ZXJtaW5hbFZpZXdwb3J0SGVpZ2h0IC0gaGVpZ2h0KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NldFRlcm1pbmFsVmlld3BvcnRPZmZzZXQodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUZXJtaW5hbFZpZXdwb3J0SGVpZ2h0KCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsRWxlbWVudC5jbGllbnRIZWlnaHQ7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldC5yZXNldCgpO1xuXHRcdHRoaXMuX3Jlc2V0UGxhY2Vob2xkZXIoKTtcblx0XHR0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LnVwZGF0ZVRvb2xiYXIoZmFsc2UpO1xuXHRcdHRoaXMuX3Zpc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldC52YWx1ZSA9ICcnO1xuXHRcdHRoaXMuX2luc3RhbmNlLmZvY3VzKCk7XG5cdFx0dGhpcy5fc2V0VGVybWluYWxWaWV3cG9ydE9mZnNldCh1bmRlZmluZWQpO1xuXHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdH1cblx0cHJpdmF0ZSBfc2V0VGVybWluYWxWaWV3cG9ydE9mZnNldChvZmZzZXQ6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChvZmZzZXQgPT09IHVuZGVmaW5lZCB8fCB0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRlJykpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICcnO1xuXHRcdFx0dGhpcy5fdGVybWluYWxFbGVtZW50LnN0eWxlLmJvdHRvbSA9ICcnO1xuXHRcdFx0VGVybWluYWxTdGlja3lTY3JvbGxDb250cmlidXRpb24uZ2V0KHRoaXMuX2luc3RhbmNlKT8uaGlkZVVubG9jaygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdFx0dGhpcy5fdGVybWluYWxFbGVtZW50LnN0eWxlLmJvdHRvbSA9IGAke29mZnNldH1weGA7XG5cdFx0XHRUZXJtaW5hbFN0aWNreVNjcm9sbENvbnRyaWJ1dGlvbi5nZXQodGhpcy5faW5zdGFuY2UpPy5oaWRlTG9jaygpO1xuXHRcdH1cblx0fVxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmlubGluZUNoYXRXaWRnZXQuZm9jdXMoKTtcblx0fVxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faW5saW5lQ2hhdFdpZGdldC5oYXNGb2N1cygpO1xuXHR9XG5cblx0c2V0VmFsdWUodmFsdWU/OiBzdHJpbmcpIHtcblx0XHR0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LnZhbHVlID0gdmFsdWUgPz8gJyc7XG5cdH1cblxuXHRhc3luYyBhY2NlcHRDb21tYW5kKHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb2RlID0gYXdhaXQgdGhpcy5pbmxpbmVDaGF0V2lkZ2V0LmdldENvZGVCbG9ja0luZm8oMCk7XG5cdFx0aWYgKCFjb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gY29kZS5nZXRWYWx1ZSgpO1xuXHRcdHRoaXMuX2luc3RhbmNlLnJ1bkNvbW1hbmQodmFsdWUsIHNob3VsZEV4ZWN1dGUpO1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZm9jdXNUcmFja2VyKCk6IElGb2N1c1RyYWNrZXIge1xuXHRcdHJldHVybiB0aGlzLl9mb2N1c1RyYWNrZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Nlc3Npb25DdG9yID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4oYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9tb2RlbC52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX2NoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKTtcblx0XHRcdFx0dGhpcy5fbW9kZWwudmFsdWUgPSBtb2RlbFJlZjtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cdFx0XHRcdHRoaXMuX2lubGluZUNoYXRXaWRnZXQuc2V0Q2hhdE1vZGVsKG1vZGVsKTtcblx0XHRcdFx0dGhpcy5fcmVzZXRQbGFjZWhvbGRlcigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9zZXNzaW9uQ3Rvcj8uY2FuY2VsKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZUlucHV0U3RhdGUoKSB7XG5cdFx0Y29uc3QgaW5wdXRTdGF0ZSA9IHRoaXMuX2lubGluZUNoYXRXaWRnZXQuY2hhdFdpZGdldC5nZXRJbnB1dFN0YXRlKCk7XG5cdFx0aWYgKGlucHV0U3RhdGUpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuX3ZpZXdTdGF0ZVN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGlucHV0U3RhdGUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdHRoaXMuX21vZGVsLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzcG9uc2VDb250YWluc0NvZGVCbG9ja0NvbnRleHRLZXkucmVzZXQoKTtcblx0XHR0aGlzLl9yZXF1ZXN0QWN0aXZlQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdHRoaXMuaGlkZSgpO1xuXHRcdHRoaXMuc2V0VmFsdWUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdElucHV0KHF1ZXJ5Pzogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRBY2NlcHRJbnB1dE9wdGlvbnMpOiBQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fbW9kZWwudmFsdWUpIHtcblx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsKCk7XG5cdFx0fVxuXHRcdHRoaXMuX21lc3NhZ2VzLmZpcmUoTWVzc2FnZS5BY2NlcHRJbnB1dCk7XG5cdFx0Y29uc3QgbGFzdElucHV0ID0gdGhpcy5faW5saW5lQ2hhdFdpZGdldC52YWx1ZTtcblx0XHRpZiAoIWxhc3RJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVSZXF1ZXN0Q3RzPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9hY3RpdmVSZXF1ZXN0Q3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fcmVxdWVzdEFjdGl2ZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5faW5saW5lQ2hhdFdpZGdldC5jaGF0V2lkZ2V0LmFjY2VwdElucHV0KGxhc3RJbnB1dCwgeyBpc1ZvaWNlSW5wdXQ6IG9wdGlvbnM/LmlzVm9pY2VJbnB1dCB9KTtcblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdElkID0gcmVzcG9uc2U/LnJlcXVlc3RJZDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4oKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fcmVxdWVzdEFjdGl2ZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdFx0aWYgKHJlc3BvbnNlKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChyZXNwb25zZS5vbkRpZENoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc3BvbnNlLmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlcXVlc3RBY3RpdmVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHRcdFx0XHRyZXNwb25zZVByb21pc2UuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJlc3BvbnNlLmlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlcXVlc3RBY3RpdmVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXF1ZXN0QWN0aXZlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlyc3RDb2RlQmxvY2sgPSBhd2FpdCB0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmdldENvZGVCbG9ja0luZm8oMCk7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWNvbmRDb2RlQmxvY2sgPSBhd2FpdCB0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmdldENvZGVCbG9ja0luZm8oMSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNwb25zZUNvbnRhaW5zQ29kZUJsb2NrQ29udGV4dEtleS5zZXQoISFmaXJzdENvZGVCbG9jayk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNwb25zZUNvbnRhaW5zTXVsaXRwbGVDb2RlQmxvY2tzQ29udGV4dEtleS5zZXQoISFzZWNvbmRDb2RlQmxvY2spO1xuXHRcdFx0XHRcdFx0dGhpcy5faW5saW5lQ2hhdFdpZGdldC51cGRhdGVUb29sYmFyKHRydWUpO1xuXHRcdFx0XHRcdFx0cmVzcG9uc2VQcm9taXNlLmNvbXBsZXRlKHJlc3BvbnNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHJlc3BvbnNlUHJvbWlzZS5wO1xuXHRcdFx0dGhpcy5fbGFzdFJlc3BvbnNlQ29udGVudCA9IHJlc3BvbnNlPy5yZXNwb25zZS5nZXRNYXJrZG93bigpO1xuXHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbGFzdFJlc3BvbnNlQ29udGVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uQ3Rvcj8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkN0b3IgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYWN0aXZlUmVxdWVzdEN0cz8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fcmVxdWVzdEFjdGl2ZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2lubGluZUNoYXRXaWRnZXQuZ2V0Q2hhdE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbD8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZvaWQgdGhpcy5fY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKG1vZGVsPy5zZXNzaW9uUmVzb3VyY2UsICd0ZXJtaW5hbENoYXQnKTtcblx0fVxuXG5cdGFzeW5jIHZpZXdJbkNoYXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0Y29uc3QgY3VycmVudFJlcXVlc3QgPSB0aGlzLl9pbmxpbmVDaGF0V2lkZ2V0LmNoYXRXaWRnZXQudmlld01vZGVsPy5tb2RlbC5nZXRSZXF1ZXN0cygpLmZpbmQociA9PiByLmlkID09PSB0aGlzLl9jdXJyZW50UmVxdWVzdElkKTtcblx0XHRpZiAoIXdpZGdldCB8fCAhY3VycmVudFJlcXVlc3Q/LnJlc3BvbnNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZTogSUNoYXRQcm9ncmVzc1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGN1cnJlbnRSZXF1ZXN0LnJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRpZiAoaXRlbS5raW5kID09PSAndGV4dEVkaXRHcm91cCcpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBpdGVtLmVkaXRzKSB7XG5cdFx0XHRcdFx0bWVzc2FnZS5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHRcdFx0XHRlZGl0czogZ3JvdXAsXG5cdFx0XHRcdFx0XHR1cmk6IGl0ZW0udXJpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXRlbS5raW5kID09PSAnbm90ZWJvb2tFZGl0R3JvdXAnKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgaXRlbS5lZGl0cykge1xuXHRcdFx0XHRcdGlmIChpc0NlbGxUZXh0RWRpdE9wZXJhdGlvbkFycmF5KGdyb3VwKSkge1xuXHRcdFx0XHRcdFx0bWVzc2FnZS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdFx0XHRcdFx0ZWRpdHM6IGdyb3VwLm1hcChlID0+IGUuZWRpdCksXG5cdFx0XHRcdFx0XHRcdHVyaTogZ3JvdXBbMF0udXJpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWVzc2FnZS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHRcdFx0XHRcdGVkaXRzOiBncm91cCxcblx0XHRcdFx0XHRcdFx0dXJpOiBpdGVtLnVyaVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXNzYWdlLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhdFNlcnZpY2UuYWRkQ29tcGxldGVSZXF1ZXN0KHdpZGdldCEudmlld01vZGVsIS5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRgQCR7dGhpcy5fdGVybWluYWxBZ2VudE5hbWV9ICR7Y3VycmVudFJlcXVlc3QubWVzc2FnZS50ZXh0fWAsXG5cdFx0XHRjdXJyZW50UmVxdWVzdC52YXJpYWJsZURhdGEsXG5cdFx0XHRjdXJyZW50UmVxdWVzdC5hdHRlbXB0LFxuXHRcdFx0e1xuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRyZXN1bHQ6IGN1cnJlbnRSZXF1ZXN0LnJlc3BvbnNlIS5yZXN1bHQsXG5cdFx0XHRcdGZvbGxvd3VwczogY3VycmVudFJlcXVlc3QucmVzcG9uc2UhLmZvbGxvd3Vwc1xuXHRcdFx0fSk7XG5cdFx0d2lkZ2V0LmZvY3VzUmVzcG9uc2VJdGVtKCk7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdH1cbn1cblxuXG5jbGFzcyBUZXJtaW5hbElubGluZUNoYXRXaWRnZXQgZXh0ZW5kcyBJbmxpbmVDaGF0V2lkZ2V0IHtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxvY2F0aW9uOiBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyxcblx0XHRvcHRpb25zOiBJSW5saW5lQ2hhdFdpZGdldENvbnN0cnVjdGlvbk9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2libGVWaWV3U2VydmljZSBhY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9jYXRpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLCB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UsIGNoYXRTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblx0fVxuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmNoYXRXaWRnZXQuZ2V0SW5wdXQoKTtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnNldElucHV0KHZhbHVlKTtcblx0fVxuXG5cdHNlbGVjdEFsbCgpIHtcblx0XHR0aGlzLmNoYXRXaWRnZXQuaW5wdXRFZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIDEpKTtcblx0fVxuXG5cdHNldCBwbGFjZWhvbGRlcih2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnNldElucHV0UGxhY2Vob2xkZXIodmFsdWUpO1xuXHR9XG5cblx0dG9nZ2xlU3RhdHVzKHNob3c6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9lbGVtZW50cy50b29sYmFyMS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvdyk7XG5cdFx0dGhpcy5fZWxlbWVudHMudG9vbGJhcjIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXNob3cpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1cy5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvdyk7XG5cdFx0dGhpcy5fZWxlbWVudHMuaW5mb0xhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFzaG93KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHR1cGRhdGVUb29sYmFyKHNob3c6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ3Rvb2xiYXInLCBzaG93KTtcblx0XHR0aGlzLl9lbGVtZW50cy50b29sYmFyMS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvdyk7XG5cdFx0dGhpcy5fZWxlbWVudHMudG9vbGJhcjIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXNob3cpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1cy5jbGFzc0xpc3QudG9nZ2xlKCdhY3Rpb25zJywgc2hvdyk7XG5cdFx0dGhpcy5fZWxlbWVudHMuaW5mb0xhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIHNob3cpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdGdldCByZXNwb25zZUNvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXF1ZXN0cyA9IHRoaXMuY2hhdFdpZGdldC52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0cmV0dXJuIHJlcXVlc3RzPy5hdCgtMSk/LnJlc3BvbnNlPy5yZXNwb25zZS50b1N0cmluZygpO1xuXHR9XG5cblx0Z2V0Q2hhdE1vZGVsKCk6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNoYXRXaWRnZXQudmlld01vZGVsPy5tb2RlbDtcblx0fVxuXG5cdHNldENoYXRNb2RlbChjaGF0TW9kZWw6IElDaGF0TW9kZWwpIHtcblx0XHRjaGF0TW9kZWwuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7IGlucHV0VGV4dDogJycsIHNlbGVjdGlvbnM6IFtdIH0pO1xuXHRcdHRoaXMuY2hhdFdpZGdldC5zZXRNb2RlbChjaGF0TW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29kZUJsb2NrSW5mbyhjb2RlQmxvY2tJbmRleDogbnVtYmVyKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgeyB2aWV3TW9kZWwgfSA9IHRoaXMuY2hhdFdpZGdldDtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXMgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKS5maWx0ZXIoaSA9PiBpc1Jlc3BvbnNlVk0oaSkpO1xuXHRcdGNvbnN0IGl0ZW0gPSBpdGVtcy5hdCgtMSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTG9vayBmb3IgdGhlIGNvZGUgYmxvY2sgaW4gdGhlIHJlbmRlcmVkIHJlc3BvbnNlXG5cdFx0Y29uc3QgY29kZUJsb2NrcyA9IHRoaXMuY2hhdFdpZGdldC5nZXRDb2RlQmxvY2tJbmZvc0ZvclJlc3BvbnNlKGl0ZW0pO1xuXHRcdGNvbnN0IGluZm8gPSBjb2RlQmxvY2tzW2NvZGVCbG9ja0luZGV4XTtcblx0XHRpZiAoaW5mbz8udXJpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKGluZm8udXJpKSA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2s6IGlmIHRoZSBjb2RlIGJsb2NrIGhhc24ndCBiZWVuIHJlbmRlcmVkIHlldCAoZS5nLiBkdWUgdG9cblx0XHQvLyB0aW1pbmcgYmV0d2VlbiByZXNwb25zZSBjb21wbGV0aW9uIGFuZCBsaXN0IHJlbmRlcmluZyksIHBhcnNlIHRoZVxuXHRcdC8vIG1hcmtkb3duIGRpcmVjdGx5IGFuZCBjcmVhdGUgYSB0cmFuc2llbnQgbW9kZWwuXG5cdFx0Y29uc3QgbWFya2Rvd24gPSBpdGVtLnJlc3BvbnNlLmdldE1hcmtkb3duKCk7XG5cdFx0bGV0IGN1cnJlbnRDb2RlQmxvY2tJbmRleCA9IDA7XG5cdFx0bGV0IGZvdW5kVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIG1hcmtkb3duLnNwbGl0KCdcXG4nKSkge1xuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnYGBgJykgJiYgZm91bmRUZXh0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Zm91bmRUZXh0ID0gJyc7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnYGBgJykgJiYgZm91bmRUZXh0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRDb2RlQmxvY2tJbmRleCA9PT0gY29kZUJsb2NrSW5kZXgpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50Q29kZUJsb2NrSW5kZXgrKztcblx0XHRcdFx0Zm91bmRUZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIGlmIChmb3VuZFRleHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRmb3VuZFRleHQgKz0gKGZvdW5kVGV4dCA/ICdcXG4nIDogJycpICsgbGluZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZm91bmRUZXh0ICE9PSB1bmRlZmluZWQgJiYgY3VycmVudENvZGVCbG9ja0luZGV4ID09PSBjb2RlQmxvY2tJbmRleCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbChmb3VuZFRleHQsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFdBQVcsaUJBQWdDLGtCQUFrQjtBQUN0RSxTQUE0Qix5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
