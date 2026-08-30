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
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import * as dom from "../../../../../base/browser/dom.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, markAsSingleton, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { MenuEntryActionViewItem } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { katexContainerClassName, katexContainerLatexAttributeName } from "../../../markdown/common/markedKatexExtension.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { isChatTreeItem, isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { IChatWidgetService } from "../chat.js";
import { CHAT_CATEGORY, stringifyItem } from "./chatActions.js";
import { toPortableMarkdown } from "../widget/chatClipboard.js";
const CopyItemActionId = "workbench.action.chat.copyItem";
const copyFeedbackDuration = 1200;
const copyIconClasses = ThemeIcon.asClassNameArray(Codicon.copy);
const copiedIconClasses = ThemeIcon.asClassNameArray(Codicon.check);
class ChatCopyActionViewItem extends MenuEntryActionViewItem {
  constructor() {
    super(...arguments);
    this.copiedStateReset = this._register(new MutableDisposable());
    this.actionRunnerListener = this._register(new MutableDisposable());
    this.copied = false;
  }
  get actionRunner() {
    return super.actionRunner;
  }
  set actionRunner(actionRunner) {
    super.actionRunner = actionRunner;
    this.bindActionRunner(actionRunner);
  }
  render(container) {
    super.render(container);
    this.bindActionRunner(super.actionRunner);
    if (!this.element || !this.label) {
      return;
    }
    this.element.classList.add("chat-copy-action");
    this.clearLabelIconClasses();
    this.label.style.backgroundImage = "";
    this.label.classList.remove("icon");
    this.label.textContent = "";
    this.label.setAttribute("aria-hidden", "true");
    const iconContainer = dom.append(this.label, dom.$(".chat-copy-action-icons"));
    const copyIcon = dom.append(iconContainer, dom.$(".chat-copy-action-icon.chat-copy-action-icon-copy"));
    copyIcon.classList.add(...copyIconClasses);
    copyIcon.setAttribute("aria-hidden", "true");
    const copiedIcon = dom.append(iconContainer, dom.$(".chat-copy-action-icon.chat-copy-action-icon-copied"));
    copiedIcon.classList.add(...copiedIconClasses);
    copiedIcon.setAttribute("aria-hidden", "true");
    this.renderCopiedState();
  }
  getTooltip() {
    return this.copied ? localize("interactive.copyItem.copied", "Copied") : super.getTooltip();
  }
  updateAriaLabel() {
    this.element?.setAttribute("aria-label", this.copied ? localize("interactive.copyItem.copiedAriaLabel", "Copied") : localize("interactive.copyItem.ariaLabel", "Copy"));
  }
  updateClass() {
    super.updateClass();
    this.clearLabelIconClasses();
    if (this.label) {
      this.label.style.backgroundImage = "";
      this.label.classList.remove("icon");
    }
  }
  clearLabelIconClasses() {
    this.label?.classList.remove(...copyIconClasses, ...copiedIconClasses);
  }
  renderCopiedState() {
    this.element?.classList.toggle("copied", this.copied);
    this.updateTooltip();
  }
  bindActionRunner(actionRunner) {
    this.actionRunnerListener.value = actionRunner.onDidRun((e) => {
      if (e.action !== this.action || e.error) {
        return;
      }
      this.copied = true;
      this.renderCopiedState();
      this.copiedStateReset.value = disposableTimeout(() => {
        this.copied = false;
        this.renderCopiedState();
      }, copyFeedbackDuration);
      status(localize("interactive.copyItem.status", "Copied to clipboard"));
    });
  }
}
let ChatCopyActionRendering = class extends Disposable {
  constructor(actionViewItemService, instantiationService) {
    super();
    const disposable = this._register(actionViewItemService.register(MenuId.ChatMessageFooter, CopyItemActionId, (action, options) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ChatCopyActionViewItem, action, options);
    }));
    markAsSingleton(disposable);
  }
};
ChatCopyActionRendering.ID = "chat.copyActionRendering";
ChatCopyActionRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService)
], ChatCopyActionRendering);
function registerChatCopyActions() {
  registerAction2(class CopyAllAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.copyAll",
        title: localize2("interactive.copyAll.label", "Copy All"),
        f1: false,
        category: CHAT_CATEGORY,
        menu: {
          id: MenuId.ChatContext,
          when: ChatContextKeys.responseIsFiltered.negate(),
          group: "copy"
        }
      });
    }
    run(accessor, context) {
      const clipboardService = accessor.get(IClipboardService);
      const chatWidgetService = accessor.get(IChatWidgetService);
      const widget = (isRequestVM(context) || isResponseVM(context)) && chatWidgetService.getWidgetBySessionResource(context.sessionResource) || chatWidgetService.lastFocusedWidget;
      if (widget) {
        const viewModel = widget.viewModel;
        const sessionAsText = viewModel?.getItems().filter((item) => isRequestVM(item) || isResponseVM(item) && !item.errorDetails?.responseIsFiltered).map((item) => stringifyItem(item)).join("\n\n");
        if (sessionAsText) {
          clipboardService.writeText(toPortableMarkdown(sessionAsText));
        }
      }
    }
  });
  registerAction2(class CopyItemAction extends Action2 {
    constructor() {
      super({
        id: CopyItemActionId,
        title: localize2("interactive.copyItem.label", "Copy"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.copy,
        menu: [
          {
            id: MenuId.ChatContext,
            when: ChatContextKeys.responseIsFiltered.negate(),
            group: "copy"
          },
          {
            id: MenuId.ChatMessageFooter,
            group: "navigation",
            order: 1,
            when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseIsFiltered.negate())
          }
        ]
      });
    }
    async run(accessor, ...args) {
      const chatWidgetService = accessor.get(IChatWidgetService);
      const clipboardService = accessor.get(IClipboardService);
      const widget = chatWidgetService.lastFocusedWidget;
      let item = args[0];
      if (!isChatTreeItem(item)) {
        item = widget?.getFocus();
        if (!item) {
          return;
        }
      }
      const nativeSelection = dom.getActiveWindow().getSelection();
      const selectedText = nativeSelection?.toString();
      if (widget && selectedText && selectedText.length > 0 && dom.isAncestor(dom.getActiveElement(), widget.domNode)) {
        await clipboardService.writeText(selectedText);
        return;
      }
      if (!isRequestVM(item) && !isResponseVM(item)) {
        return;
      }
      const text = stringifyItem(item, false);
      await clipboardService.writeText(toPortableMarkdown(text));
    }
  });
  registerAction2(class CopyFinalResponseAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.copyFinalResponse",
        title: localize2("interactive.copyFinalResponse.label", "Copy Final Response"),
        f1: false,
        category: CHAT_CATEGORY,
        menu: {
          id: MenuId.ChatContext,
          when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseIsFiltered.negate()),
          group: "copy"
        }
      });
    }
    async run(accessor, ...args) {
      const chatWidgetService = accessor.get(IChatWidgetService);
      const clipboardService = accessor.get(IClipboardService);
      const widget = chatWidgetService.lastFocusedWidget;
      let item = args[0];
      if (!isChatTreeItem(item)) {
        item = widget?.getFocus();
        if (!item) {
          return;
        }
      }
      if (!isResponseVM(item)) {
        return;
      }
      const text = item.response.getFinalResponse();
      if (text) {
        await clipboardService.writeText(toPortableMarkdown(text));
      }
    }
  });
  registerAction2(class CopyKatexMathSourceAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.copyKatexMathSource",
        title: localize2("chat.copyKatexMathSource.label", "Copy Math Source"),
        f1: false,
        category: CHAT_CATEGORY,
        menu: {
          id: MenuId.ChatContext,
          group: "copy",
          when: ChatContextKeys.isKatexMathElement
        }
      });
    }
    async run(accessor, ...args) {
      const chatWidgetService = accessor.get(IChatWidgetService);
      const clipboardService = accessor.get(IClipboardService);
      const widget = chatWidgetService.lastFocusedWidget;
      let item = args[0];
      if (!isChatTreeItem(item)) {
        item = widget?.getFocus();
        if (!item) {
          return;
        }
      }
      let selectedElement = null;
      const activeElement = dom.getActiveElement();
      const nativeSelection = dom.getActiveWindow().getSelection();
      if (widget && nativeSelection && nativeSelection.rangeCount > 0 && dom.isAncestor(activeElement, widget.domNode)) {
        const range = nativeSelection.getRangeAt(0);
        selectedElement = range.commonAncestorContainer;
        if (selectedElement.nodeType === Node.TEXT_NODE) {
          selectedElement = selectedElement.parentElement;
        }
      }
      if (!selectedElement) {
        selectedElement = activeElement?.querySelector(`.${katexContainerClassName}`) ?? null;
      }
      const katexElement = dom.isHTMLElement(selectedElement) ? selectedElement.closest(`.${katexContainerClassName}`) : null;
      const latexSource = katexElement?.getAttribute(katexContainerLatexAttributeName) || "";
      if (latexSource) {
        await clipboardService.writeText(latexSource);
      }
    }
  });
}
export {
  ChatCopyActionRendering,
  ChatCopyActionViewItem,
  registerChatCopyActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRDb3B5QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgbWFya0FzU2luZ2xldG9uLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBrYXRleENvbnRhaW5lckNsYXNzTmFtZSwga2F0ZXhDb250YWluZXJMYXRleEF0dHJpYnV0ZU5hbWUgfSBmcm9tICcuLi8uLi8uLi9tYXJrZG93bi9jb21tb24vbWFya2VkS2F0ZXhFeHRlbnNpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNDaGF0VHJlZUl0ZW0sIGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0sIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSwgc3RyaW5naWZ5SXRlbSB9IGZyb20gJy4vY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgdG9Qb3J0YWJsZU1hcmtkb3duIH0gZnJvbSAnLi4vd2lkZ2V0L2NoYXRDbGlwYm9hcmQuanMnO1xuXG5jb25zdCBDb3B5SXRlbUFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb3B5SXRlbSc7XG5jb25zdCBjb3B5RmVlZGJhY2tEdXJhdGlvbiA9IDEyMDA7XG5jb25zdCBjb3B5SWNvbkNsYXNzZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNvcHkpO1xuY29uc3QgY29waWVkSWNvbkNsYXNzZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZWNrKTtcblxuZXhwb3J0IGNsYXNzIENoYXRDb3B5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb3BpZWRTdGF0ZVJlc2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblJ1bm5lckxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGNvcGllZCA9IGZhbHNlO1xuXG5cdG92ZXJyaWRlIGdldCBhY3Rpb25SdW5uZXIoKTogSUFjdGlvblJ1bm5lciB7XG5cdFx0cmV0dXJuIHN1cGVyLmFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdG92ZXJyaWRlIHNldCBhY3Rpb25SdW5uZXIoYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyKSB7XG5cdFx0c3VwZXIuYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXHRcdHRoaXMuYmluZEFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLmJpbmRBY3Rpb25SdW5uZXIoc3VwZXIuYWN0aW9uUnVubmVyKTtcblxuXHRcdGlmICghdGhpcy5lbGVtZW50IHx8ICF0aGlzLmxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtY29weS1hY3Rpb24nKTtcblx0XHR0aGlzLmNsZWFyTGFiZWxJY29uQ2xhc3NlcygpO1xuXHRcdHRoaXMubGFiZWwuc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdpY29uJyk7XG5cdFx0dGhpcy5sYWJlbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmxhYmVsLCBkb20uJCgnLmNoYXQtY29weS1hY3Rpb24taWNvbnMnKSk7XG5cdFx0Y29uc3QgY29weUljb24gPSBkb20uYXBwZW5kKGljb25Db250YWluZXIsIGRvbS4kKCcuY2hhdC1jb3B5LWFjdGlvbi1pY29uLmNoYXQtY29weS1hY3Rpb24taWNvbi1jb3B5JykpO1xuXHRcdGNvcHlJY29uLmNsYXNzTGlzdC5hZGQoLi4uY29weUljb25DbGFzc2VzKTtcblx0XHRjb3B5SWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IGNvcGllZEljb24gPSBkb20uYXBwZW5kKGljb25Db250YWluZXIsIGRvbS4kKCcuY2hhdC1jb3B5LWFjdGlvbi1pY29uLmNoYXQtY29weS1hY3Rpb24taWNvbi1jb3BpZWQnKSk7XG5cdFx0Y29waWVkSWNvbi5jbGFzc0xpc3QuYWRkKC4uLmNvcGllZEljb25DbGFzc2VzKTtcblx0XHRjb3BpZWRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0dGhpcy5yZW5kZXJDb3BpZWRTdGF0ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5jb3BpZWRcblx0XHRcdD8gbG9jYWxpemUoJ2ludGVyYWN0aXZlLmNvcHlJdGVtLmNvcGllZCcsIFwiQ29waWVkXCIpXG5cdFx0XHQ6IHN1cGVyLmdldFRvb2x0aXAoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVBcmlhTGFiZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50Py5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmNvcGllZFxuXHRcdFx0PyBsb2NhbGl6ZSgnaW50ZXJhY3RpdmUuY29weUl0ZW0uY29waWVkQXJpYUxhYmVsJywgXCJDb3BpZWRcIilcblx0XHRcdDogbG9jYWxpemUoJ2ludGVyYWN0aXZlLmNvcHlJdGVtLmFyaWFMYWJlbCcsIFwiQ29weVwiKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2xhc3MoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlQ2xhc3MoKTtcblx0XHR0aGlzLmNsZWFyTGFiZWxJY29uQ2xhc3NlcygpO1xuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHR0aGlzLmxhYmVsLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdpY29uJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckxhYmVsSWNvbkNsYXNzZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5sYWJlbD8uY2xhc3NMaXN0LnJlbW92ZSguLi5jb3B5SWNvbkNsYXNzZXMsIC4uLmNvcGllZEljb25DbGFzc2VzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29waWVkU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QudG9nZ2xlKCdjb3BpZWQnLCB0aGlzLmNvcGllZCk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdH1cblxuXHRwcml2YXRlIGJpbmRBY3Rpb25SdW5uZXIoYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25SdW5uZXJMaXN0ZW5lci52YWx1ZSA9IGFjdGlvblJ1bm5lci5vbkRpZFJ1bihlID0+IHtcblx0XHRcdGlmIChlLmFjdGlvbiAhPT0gdGhpcy5hY3Rpb24gfHwgZS5lcnJvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY29waWVkID0gdHJ1ZTtcblx0XHRcdHRoaXMucmVuZGVyQ29waWVkU3RhdGUoKTtcblx0XHRcdHRoaXMuY29waWVkU3RhdGVSZXNldC52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5jb3BpZWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5yZW5kZXJDb3BpZWRTdGF0ZSgpO1xuXHRcdFx0fSwgY29weUZlZWRiYWNrRHVyYXRpb24pO1xuXHRcdFx0c3RhdHVzKGxvY2FsaXplKCdpbnRlcmFjdGl2ZS5jb3B5SXRlbS5zdGF0dXMnLCBcIkNvcGllZCB0byBjbGlwYm9hcmRcIikpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29weUFjdGlvblJlbmRlcmluZyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdC5jb3B5QWN0aW9uUmVuZGVyaW5nJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51SWQuQ2hhdE1lc3NhZ2VGb290ZXIsIENvcHlJdGVtQWN0aW9uSWQsIChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdENvcHlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9KSk7XG5cblx0XHRtYXJrQXNTaW5nbGV0b24oZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ2hhdENvcHlBY3Rpb25zKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29weUFsbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb3B5QWxsJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuY29weUFsbC5sYWJlbCcsIFwiQ29weSBBbGxcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRDb250ZXh0LFxuXHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUlzRmlsdGVyZWQubmVnYXRlKCksXG5cdFx0XHRcdFx0Z3JvdXA6ICdjb3B5Jyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogQ2hhdFRyZWVJdGVtKSB7XG5cdFx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSAoKGlzUmVxdWVzdFZNKGNvbnRleHQpIHx8IGlzUmVzcG9uc2VWTShjb250ZXh0KSkgJiYgY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpKSB8fCBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGVsID0gd2lkZ2V0LnZpZXdNb2RlbDtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbkFzVGV4dCA9IHZpZXdNb2RlbD8uZ2V0SXRlbXMoKVxuXHRcdFx0XHRcdC5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIChJQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKSA9PiBpc1JlcXVlc3RWTShpdGVtKSB8fCAoaXNSZXNwb25zZVZNKGl0ZW0pICYmICFpdGVtLmVycm9yRGV0YWlscz8ucmVzcG9uc2VJc0ZpbHRlcmVkKSlcblx0XHRcdFx0XHQubWFwKGl0ZW0gPT4gc3RyaW5naWZ5SXRlbShpdGVtKSlcblx0XHRcdFx0XHQuam9pbignXFxuXFxuJyk7XG5cdFx0XHRcdGlmIChzZXNzaW9uQXNUZXh0KSB7XG5cdFx0XHRcdFx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodG9Qb3J0YWJsZU1hcmtkb3duKHNlc3Npb25Bc1RleHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvcHlJdGVtQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBDb3B5SXRlbUFjdGlvbklkLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5jb3B5SXRlbS5sYWJlbCcsIFwiQ29weVwiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jb3B5LFxuXHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUlzRmlsdGVyZWQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRncm91cDogJ2NvcHknLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TWVzc2FnZUZvb3Rlcixcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZSwgQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlSXNGaWx0ZXJlZC5uZWdhdGUoKSksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdGxldCBpdGVtID0gYXJnc1swXSBhcyBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWlzQ2hhdFRyZWVJdGVtKGl0ZW0pKSB7XG5cdFx0XHRcdGl0ZW0gPSB3aWRnZXQ/LmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGVyZSBpcyBhIHRleHQgc2VsZWN0aW9uLCBhbmQgZm9jdXMgaXMgaW5zaWRlIHRoZSB3aWRnZXQsIGNvcHkgdGhlIHNlbGVjdGVkIHRleHQuXG5cdFx0XHQvLyBPdGhlcndpc2UsIGNvbnRleHQgbWVudSB3aXRoIG5vIHNlbGVjdGlvbiAtPiBjb3B5IHRoZSBmdWxsIGl0ZW1cblx0XHRcdGNvbnN0IG5hdGl2ZVNlbGVjdGlvbiA9IGRvbS5nZXRBY3RpdmVXaW5kb3coKS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9IG5hdGl2ZVNlbGVjdGlvbj8udG9TdHJpbmcoKTtcblx0XHRcdGlmICh3aWRnZXQgJiYgc2VsZWN0ZWRUZXh0ICYmIHNlbGVjdGVkVGV4dC5sZW5ndGggPiAwICYmIGRvbS5pc0FuY2VzdG9yKGRvbS5nZXRBY3RpdmVFbGVtZW50KCksIHdpZGdldC5kb21Ob2RlKSkge1xuXHRcdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChzZWxlY3RlZFRleHQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNSZXF1ZXN0Vk0oaXRlbSkgJiYgIWlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRleHQgPSBzdHJpbmdpZnlJdGVtKGl0ZW0sIGZhbHNlKTtcblx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRvUG9ydGFibGVNYXJrZG93bih0ZXh0KSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29weUZpbmFsUmVzcG9uc2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29weUZpbmFsUmVzcG9uc2UnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5jb3B5RmluYWxSZXNwb25zZS5sYWJlbCcsIFwiQ29weSBGaW5hbCBSZXNwb25zZVwiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdENvbnRleHQsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLCBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VJc0ZpbHRlcmVkLm5lZ2F0ZSgpKSxcblx0XHRcdFx0XHRncm91cDogJ2NvcHknLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdGxldCBpdGVtID0gYXJnc1swXSBhcyBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWlzQ2hhdFRyZWVJdGVtKGl0ZW0pKSB7XG5cdFx0XHRcdGl0ZW0gPSB3aWRnZXQ/LmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRleHQgPSBpdGVtLnJlc3BvbnNlLmdldEZpbmFsUmVzcG9uc2UoKTtcblx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRvUG9ydGFibGVNYXJrZG93bih0ZXh0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29weUthdGV4TWF0aFNvdXJjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb3B5S2F0ZXhNYXRoU291cmNlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5jb3B5S2F0ZXhNYXRoU291cmNlLmxhYmVsJywgXCJDb3B5IE1hdGggU291cmNlXCIpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ2NvcHknLFxuXHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pc0thdGV4TWF0aEVsZW1lbnQsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0bGV0IGl0ZW0gPSBhcmdzWzBdIGFzIENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICghaXNDaGF0VHJlZUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0aXRlbSA9IHdpZGdldD8uZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRyeSB0byBmaW5kIGEgS2FUZVggZWxlbWVudCBmcm9tIHRoZSBzZWxlY3Rpb24gb3IgYWN0aXZlIGVsZW1lbnRcblx0XHRcdGxldCBzZWxlY3RlZEVsZW1lbnQ6IE5vZGUgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgYSBzZWxlY3Rpb24sIGFuZCBmb2N1cyBpcyBpbnNpZGUgdGhlIHdpZGdldCwgZXh0cmFjdCB0aGUgaW5uZXIgS2FUZVggZWxlbWVudC5cblx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdFx0Y29uc3QgbmF0aXZlU2VsZWN0aW9uID0gZG9tLmdldEFjdGl2ZVdpbmRvdygpLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKHdpZGdldCAmJiBuYXRpdmVTZWxlY3Rpb24gJiYgbmF0aXZlU2VsZWN0aW9uLnJhbmdlQ291bnQgPiAwICYmIGRvbS5pc0FuY2VzdG9yKGFjdGl2ZUVsZW1lbnQsIHdpZGdldC5kb21Ob2RlKSkge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IG5hdGl2ZVNlbGVjdGlvbi5nZXRSYW5nZUF0KDApO1xuXHRcdFx0XHRzZWxlY3RlZEVsZW1lbnQgPSByYW5nZS5jb21tb25BbmNlc3RvckNvbnRhaW5lcjtcblxuXHRcdFx0XHQvLyBJZiBpdCdzIGEgdGV4dCBub2RlLCBnZXQgaXRzIHBhcmVudCBlbGVtZW50XG5cdFx0XHRcdGlmIChzZWxlY3RlZEVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRFbGVtZW50ID0gc2VsZWN0ZWRFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBmYWxsYmFjayB0byBxdWVyeWluZyBmcm9tIHRoZSBhY3RpdmUgZWxlbWVudFxuXHRcdFx0aWYgKCFzZWxlY3RlZEVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdHNlbGVjdGVkRWxlbWVudCA9IGFjdGl2ZUVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoYC4ke2thdGV4Q29udGFpbmVyQ2xhc3NOYW1lfWApID8/IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEV4dHJhY3QgdGhlIExhVGVYIHNvdXJjZSBmcm9tIHRoZSBhbm5vdGF0aW9uIGVsZW1lbnRcblx0XHRcdGNvbnN0IGthdGV4RWxlbWVudCA9IGRvbS5pc0hUTUxFbGVtZW50KHNlbGVjdGVkRWxlbWVudCkgPyBzZWxlY3RlZEVsZW1lbnQuY2xvc2VzdChgLiR7a2F0ZXhDb250YWluZXJDbGFzc05hbWV9YCkgOiBudWxsO1xuXHRcdFx0Y29uc3QgbGF0ZXhTb3VyY2UgPSBrYXRleEVsZW1lbnQ/LmdldEF0dHJpYnV0ZShrYXRleENvbnRhaW5lckxhdGV4QXR0cmlidXRlTmFtZSkgfHwgJyc7XG5cdFx0XHRpZiAobGF0ZXhTb3VyY2UpIHtcblx0XHRcdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQobGF0ZXhTb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxTQUFTLFFBQVEsZ0JBQWdCLHVCQUF1QjtBQUNqRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHlCQUF5Qix3Q0FBd0M7QUFDMUUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBd0QsZ0JBQWdCLGFB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
