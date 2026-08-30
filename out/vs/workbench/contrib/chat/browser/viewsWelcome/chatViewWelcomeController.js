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
import { asCSSUrl } from "../../../../../base/browser/cssValue.js";
import * as dom from "../../../../../base/browser/dom.js";
import { createCSSRule } from "../../../../../base/browser/domStylesheets.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Event } from "../../../../../base/common/event.js";
import { StringSHA1 } from "../../../../../base/common/hash.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { chatViewsWelcomeRegistry } from "./chatViewsWelcome.js";
const $ = dom.$;
let ChatViewWelcomeController = class extends Disposable {
  constructor(container, delegate, location, contextKeyService, instantiationService) {
    super();
    this.container = container;
    this.delegate = delegate;
    this.location = location;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.enabled = false;
    this.enabledDisposables = this._register(new DisposableStore());
    this.renderDisposables = this._register(new DisposableStore());
    this._isShowingWelcome = observableValue(this, false);
    this.element = dom.append(this.container, dom.$(".chat-view-welcome"));
    this._register(Event.runAndSubscribe(
      delegate.onDidChangeViewWelcomeState,
      () => this.update()
    ));
    this._register(chatViewsWelcomeRegistry.onDidChange(() => this.update(true)));
  }
  get isShowingWelcome() {
    return this._isShowingWelcome;
  }
  getMatchingWelcomeView() {
    const descriptors = chatViewsWelcomeRegistry.get();
    const matchingDescriptors = descriptors.filter((descriptor) => this.contextKeyService.contextMatchesRules(descriptor.when));
    return matchingDescriptors.at(0);
  }
  update(force) {
    const enabled = this.delegate.shouldShowWelcome();
    if (this.enabled === enabled && !force) {
      return;
    }
    this.enabled = enabled;
    this.enabledDisposables.clear();
    if (!enabled) {
      this.container.classList.toggle("chat-view-welcome-visible", false);
      this.renderDisposables.clear();
      this._isShowingWelcome.set(false, void 0);
      return;
    }
    const descriptors = chatViewsWelcomeRegistry.get();
    if (descriptors.length) {
      this.render(descriptors);
      const descriptorKeys = new Set(descriptors.flatMap((d) => d.when.keys()));
      this.enabledDisposables.add(this.contextKeyService.onDidChangeContext((e) => {
        if (e.affectsSome(descriptorKeys)) {
          this.render(descriptors);
        }
      }));
    }
  }
  render(descriptors) {
    this.renderDisposables.clear();
    dom.clearNode(this.element);
    const matchingDescriptors = descriptors.filter((descriptor) => this.contextKeyService.contextMatchesRules(descriptor.when));
    const enabledDescriptor = matchingDescriptors.at(0);
    if (enabledDescriptor) {
      const content = {
        icon: enabledDescriptor.icon,
        title: enabledDescriptor.title,
        message: enabledDescriptor.content
      };
      const welcomeView = this.renderDisposables.add(this.instantiationService.createInstance(ChatViewWelcomePart, content, { firstLinkToButton: true, location: this.location }));
      this.element.appendChild(welcomeView.element);
      this.container.classList.toggle("chat-view-welcome-visible", true);
      this._isShowingWelcome.set(true, void 0);
    } else {
      this.container.classList.toggle("chat-view-welcome-visible", false);
      this._isShowingWelcome.set(false, void 0);
    }
  }
};
ChatViewWelcomeController = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService)
], ChatViewWelcomeController);
let ChatViewWelcomePart = class extends Disposable {
  constructor(content, options, openerService, logService, markdownRendererService) {
    super();
    this.content = content;
    this.openerService = openerService;
    this.logService = logService;
    this.markdownRendererService = markdownRendererService;
    this.element = dom.$(".chat-welcome-view");
    try {
      const icon = dom.append(this.element, $(".chat-welcome-view-icon"));
      if (content.useLargeIcon) {
        icon.classList.add("large-icon");
      }
      if (content.icon) {
        if (ThemeIcon.isThemeIcon(content.icon)) {
          const iconElement = renderIcon(content.icon);
          icon.appendChild(iconElement);
        } else if (URI.isUri(content.icon)) {
          const cssUrl = asCSSUrl(content.icon);
          const hash = new StringSHA1();
          hash.update(cssUrl);
          const iconId = `chat-welcome-icon-${hash.digest()}`;
          const iconClass = `.chat-welcome-view-icon.${iconId}`;
          createCSSRule(iconClass, `
					mask: ${cssUrl} no-repeat 50% 50%;
					-webkit-mask: ${cssUrl} no-repeat 50% 50%;
					background-color: var(--vscode-icon-foreground);
				`);
          icon.classList.add(iconId, "custom-icon");
        }
      }
      const title = dom.append(this.element, $(".chat-welcome-view-title"));
      title.textContent = content.title;
      const message = dom.append(this.element, $(".chat-welcome-view-message"));
      const messageResult = this.renderMarkdownMessageContent(content.message, options);
      dom.append(message, messageResult.element);
      if (content.additionalMessage) {
        const disclaimers = dom.append(this.element, $(".chat-welcome-view-disclaimer"));
        if (typeof content.additionalMessage === "string") {
          disclaimers.textContent = content.additionalMessage;
        } else {
          const additionalMessageResult = this.renderMarkdownMessageContent(content.additionalMessage, options);
          disclaimers.appendChild(additionalMessageResult.element);
        }
      }
      if (content.tips) {
        const tips = dom.append(this.element, $(".chat-welcome-view-tips"));
        const tipsResult = this._register(this.markdownRendererService.render(content.tips));
        tips.appendChild(tipsResult.element);
      }
    } catch (err) {
      this.logService.error("Failed to render chat view welcome content", err);
    }
  }
  needsRerender(content) {
    return !!(this.content.title !== content.title || this.content.message.value !== content.message.value || this.content.additionalMessage !== content.additionalMessage || this.content.tips?.value !== content.tips?.value);
  }
  renderMarkdownMessageContent(content, options) {
    const messageResult = this._register(this.markdownRendererService.render(content));
    const firstLink = options?.firstLinkToButton ? messageResult.element.querySelector("a") : void 0;
    if (firstLink) {
      const target = firstLink.getAttribute("data-href");
      const button = this._register(new Button(firstLink.parentElement, defaultButtonStyles));
      button.label = firstLink.textContent ?? "";
      if (target) {
        this._register(button.onDidClick(() => {
          this.openerService.open(target, { allowCommands: true });
        }));
      }
      firstLink.replaceWith(button.element);
    }
    return messageResult;
  }
};
ChatViewWelcomePart = __decorateClass([
  __decorateParam(2, IOpenerService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IMarkdownRendererService)
], ChatViewWelcomePart);
export {
  ChatViewWelcomeController,
  ChatViewWelcomePart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZpZXdzV2VsY29tZVxcY2hhdFZpZXdXZWxjb21lQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQ1NTVXJsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNTU1J1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU3RyaW5nU0hBMSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgY2hhdFZpZXdzV2VsY29tZVJlZ2lzdHJ5LCBJQ2hhdFZpZXdzV2VsY29tZURlc2NyaXB0b3IgfSBmcm9tICcuL2NoYXRWaWV3c1dlbGNvbWUuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdXZWxjb21lRGVsZWdhdGUge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGU6IEV2ZW50PHZvaWQ+O1xuXHRzaG91bGRTaG93V2VsY29tZSgpOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXdXZWxjb21lQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVuYWJsZWREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzU2hvd2luZ1dlbGNvbWU6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwdWJsaWMgZ2V0IGlzU2hvd2luZ1dlbGNvbWUoKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Nob3dpbmdXZWxjb21lO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElWaWV3V2VsY29tZURlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LXZpZXctd2VsY29tZScpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRkZWxlZ2F0ZS5vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUsXG5cdFx0XHQoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdFZpZXdzV2VsY29tZVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlKHRydWUpKSk7XG5cdH1cblxuXHRnZXRNYXRjaGluZ1dlbGNvbWVWaWV3KCk6IElDaGF0Vmlld3NXZWxjb21lRGVzY3JpcHRvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvcnMgPSBjaGF0Vmlld3NXZWxjb21lUmVnaXN0cnkuZ2V0KCk7XG5cdFx0Y29uc3QgbWF0Y2hpbmdEZXNjcmlwdG9ycyA9IGRlc2NyaXB0b3JzLmZpbHRlcihkZXNjcmlwdG9yID0+IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhkZXNjcmlwdG9yLndoZW4pKTtcblx0XHRyZXR1cm4gbWF0Y2hpbmdEZXNjcmlwdG9ycy5hdCgwKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLmRlbGVnYXRlLnNob3VsZFNob3dXZWxjb21lKCk7XG5cdFx0aWYgKHRoaXMuZW5hYmxlZCA9PT0gZW5hYmxlZCAmJiAhZm9yY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdmlldy13ZWxjb21lLXZpc2libGUnLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9pc1Nob3dpbmdXZWxjb21lLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdG9ycyA9IGNoYXRWaWV3c1dlbGNvbWVSZWdpc3RyeS5nZXQoKTtcblx0XHRpZiAoZGVzY3JpcHRvcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnJlbmRlcihkZXNjcmlwdG9ycyk7XG5cblx0XHRcdGNvbnN0IGRlc2NyaXB0b3JLZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoZGVzY3JpcHRvcnMuZmxhdE1hcChkID0+IGQud2hlbi5rZXlzKCkpKTtcblx0XHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUoZGVzY3JpcHRvcktleXMpKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXIoZGVzY3JpcHRvcnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoZGVzY3JpcHRvcnM6IFJlYWRvbmx5QXJyYXk8SUNoYXRWaWV3c1dlbGNvbWVEZXNjcmlwdG9yPik6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZWxlbWVudCEpO1xuXG5cdFx0Y29uc3QgbWF0Y2hpbmdEZXNjcmlwdG9ycyA9IGRlc2NyaXB0b3JzLmZpbHRlcihkZXNjcmlwdG9yID0+IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhkZXNjcmlwdG9yLndoZW4pKTtcblx0XHRjb25zdCBlbmFibGVkRGVzY3JpcHRvciA9IG1hdGNoaW5nRGVzY3JpcHRvcnMuYXQoMCk7XG5cdFx0aWYgKGVuYWJsZWREZXNjcmlwdG9yKSB7XG5cdFx0XHRjb25zdCBjb250ZW50OiBJQ2hhdFZpZXdXZWxjb21lQ29udGVudCA9IHtcblx0XHRcdFx0aWNvbjogZW5hYmxlZERlc2NyaXB0b3IuaWNvbixcblx0XHRcdFx0dGl0bGU6IGVuYWJsZWREZXNjcmlwdG9yLnRpdGxlLFxuXHRcdFx0XHRtZXNzYWdlOiBlbmFibGVkRGVzY3JpcHRvci5jb250ZW50XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgd2VsY29tZVZpZXcgPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3V2VsY29tZVBhcnQsIGNvbnRlbnQsIHsgZmlyc3RMaW5rVG9CdXR0b246IHRydWUsIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uIH0pKTtcblx0XHRcdHRoaXMuZWxlbWVudCEuYXBwZW5kQ2hpbGQod2VsY29tZVZpZXcuZWxlbWVudCk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZpZXctd2VsY29tZS12aXNpYmxlJywgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9pc1Nob3dpbmdXZWxjb21lLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZpZXctd2VsY29tZS12aXNpYmxlJywgZmFsc2UpO1xuXHRcdFx0dGhpcy5faXNTaG93aW5nV2VsY29tZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRWaWV3V2VsY29tZUNvbnRlbnQge1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uIHwgVVJJO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBtZXNzYWdlOiBJTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IGFkZGl0aW9uYWxNZXNzYWdlPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHR0aXBzPzogSU1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSBpbnB1dFBhcnQ/OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdXNlTGFyZ2VJY29uPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFZpZXdXZWxjb21lUmVuZGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGZpcnN0TGlua1RvQnV0dG9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uO1xuXHRyZWFkb25seSBpc1dpZGdldEFnZW50V2VsY29tZVZpZXdDb250ZW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRWaWV3V2VsY29tZVBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250ZW50OiBJQ2hhdFZpZXdXZWxjb21lQ29udGVudCxcblx0XHRvcHRpb25zOiBJQ2hhdFZpZXdXZWxjb21lUmVuZGVyT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IGRvbS4kKCcuY2hhdC13ZWxjb21lLXZpZXcnKTtcblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIEljb25cblx0XHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmNoYXQtd2VsY29tZS12aWV3LWljb24nKSk7XG5cdFx0XHRpZiAoY29udGVudC51c2VMYXJnZUljb24pIHtcblx0XHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKCdsYXJnZS1pY29uJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udGVudC5pY29uKSB7XG5cdFx0XHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oY29udGVudC5pY29uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gcmVuZGVySWNvbihjb250ZW50Lmljb24pO1xuXHRcdFx0XHRcdGljb24uYXBwZW5kQ2hpbGQoaWNvbkVsZW1lbnQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaShjb250ZW50Lmljb24pKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3NzVXJsID0gYXNDU1NVcmwoY29udGVudC5pY29uKTtcblx0XHRcdFx0XHRjb25zdCBoYXNoID0gbmV3IFN0cmluZ1NIQTEoKTtcblx0XHRcdFx0XHRoYXNoLnVwZGF0ZShjc3NVcmwpO1xuXHRcdFx0XHRcdGNvbnN0IGljb25JZCA9IGBjaGF0LXdlbGNvbWUtaWNvbi0ke2hhc2guZGlnZXN0KCl9YDtcblx0XHRcdFx0XHRjb25zdCBpY29uQ2xhc3MgPSBgLmNoYXQtd2VsY29tZS12aWV3LWljb24uJHtpY29uSWR9YDtcblxuXHRcdFx0XHRcdGNyZWF0ZUNTU1J1bGUoaWNvbkNsYXNzLCBgXG5cdFx0XHRcdFx0bWFzazogJHtjc3NVcmx9IG5vLXJlcGVhdCA1MCUgNTAlO1xuXHRcdFx0XHRcdC13ZWJraXQtbWFzazogJHtjc3NVcmx9IG5vLXJlcGVhdCA1MCUgNTAlO1xuXHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1pY29uLWZvcmVncm91bmQpO1xuXHRcdFx0XHRgKTtcblx0XHRcdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoaWNvbklkLCAnY3VzdG9tLWljb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGl0bGUgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmNoYXQtd2VsY29tZS12aWV3LXRpdGxlJykpO1xuXHRcdFx0dGl0bGUudGV4dENvbnRlbnQgPSBjb250ZW50LnRpdGxlO1xuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jaGF0LXdlbGNvbWUtdmlldy1tZXNzYWdlJykpO1xuXG5cdFx0XHRjb25zdCBtZXNzYWdlUmVzdWx0ID0gdGhpcy5yZW5kZXJNYXJrZG93bk1lc3NhZ2VDb250ZW50KGNvbnRlbnQubWVzc2FnZSwgb3B0aW9ucyk7XG5cdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2UsIG1lc3NhZ2VSZXN1bHQuZWxlbWVudCk7XG5cblx0XHRcdC8vIEFkZGl0aW9uYWwgbWVzc2FnZVxuXHRcdFx0aWYgKGNvbnRlbnQuYWRkaXRpb25hbE1lc3NhZ2UpIHtcblx0XHRcdFx0Y29uc3QgZGlzY2xhaW1lcnMgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmNoYXQtd2VsY29tZS12aWV3LWRpc2NsYWltZXInKSk7XG5cdFx0XHRcdGlmICh0eXBlb2YgY29udGVudC5hZGRpdGlvbmFsTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRkaXNjbGFpbWVycy50ZXh0Q29udGVudCA9IGNvbnRlbnQuYWRkaXRpb25hbE1lc3NhZ2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbE1lc3NhZ2VSZXN1bHQgPSB0aGlzLnJlbmRlck1hcmtkb3duTWVzc2FnZUNvbnRlbnQoY29udGVudC5hZGRpdGlvbmFsTWVzc2FnZSwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0ZGlzY2xhaW1lcnMuYXBwZW5kQ2hpbGQoYWRkaXRpb25hbE1lc3NhZ2VSZXN1bHQuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVGlwc1xuXHRcdFx0aWYgKGNvbnRlbnQudGlwcykge1xuXHRcdFx0XHRjb25zdCB0aXBzID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jaGF0LXdlbGNvbWUtdmlldy10aXBzJykpO1xuXHRcdFx0XHRjb25zdCB0aXBzUmVzdWx0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoY29udGVudC50aXBzKSk7XG5cdFx0XHRcdHRpcHMuYXBwZW5kQ2hpbGQodGlwc1Jlc3VsdC5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHJlbmRlciBjaGF0IHZpZXcgd2VsY29tZSBjb250ZW50JywgZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbmVlZHNSZXJlbmRlcihjb250ZW50OiBJQ2hhdFZpZXdXZWxjb21lQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIEhldXJpc3RpYyBiYXNlZCBvbiBjb250ZW50IHRoYXQgY2hhbmdlcyBiZXR3ZWVuIHN0YXRlc1xuXHRcdHJldHVybiAhIShcblx0XHRcdHRoaXMuY29udGVudC50aXRsZSAhPT0gY29udGVudC50aXRsZSB8fFxuXHRcdFx0dGhpcy5jb250ZW50Lm1lc3NhZ2UudmFsdWUgIT09IGNvbnRlbnQubWVzc2FnZS52YWx1ZSB8fFxuXHRcdFx0dGhpcy5jb250ZW50LmFkZGl0aW9uYWxNZXNzYWdlICE9PSBjb250ZW50LmFkZGl0aW9uYWxNZXNzYWdlIHx8XG5cdFx0XHR0aGlzLmNvbnRlbnQudGlwcz8udmFsdWUgIT09IGNvbnRlbnQudGlwcz8udmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZG93bk1lc3NhZ2VDb250ZW50KGNvbnRlbnQ6IElNYXJrZG93blN0cmluZywgb3B0aW9uczogSUNoYXRWaWV3V2VsY29tZVJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBJUmVuZGVyZWRNYXJrZG93biB7XG5cdFx0Y29uc3QgbWVzc2FnZVJlc3VsdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGNvbnRlbnQpKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBmaXJzdExpbmsgPSBvcHRpb25zPy5maXJzdExpbmtUb0J1dHRvbiA/IG1lc3NhZ2VSZXN1bHQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdhJykgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGZpcnN0TGluaykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZmlyc3RMaW5rLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyk7XG5cdFx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGZpcnN0TGluay5wYXJlbnRFbGVtZW50ISwgZGVmYXVsdEJ1dHRvblN0eWxlcykpO1xuXHRcdFx0YnV0dG9uLmxhYmVsID0gZmlyc3RMaW5rLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odGFyZ2V0LCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGZpcnN0TGluay5yZXBsYWNlV2l0aChidXR0b24uZWxlbWVudCk7XG5cdFx0fVxuXHRcdHJldHVybiBtZXNzYWdlUmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBMkMsdUJBQXVCO0FBQ2xFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGdDQUE2RDtBQUV0RSxNQUFNLElBQUksSUFBSTtBQU9QLElBQU0sNEJBQU4sY0FBd0MsV0FBVztBQUFBLEVBWXpELFlBQ2tCLFdBQ0EsVUFDQSxVQUNXLG1CQUNHLHNCQUM5QjtBQUNELFVBQU07QUFOVztBQUNBO0FBQ0E7QUFDVztBQUNHO0FBZGhDLFNBQVEsVUFBVTtBQUNsQixTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDMUUsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRXpFLFNBQWlCLG9CQUFrRCxnQkFBZ0IsTUFBTSxLQUFLO0FBYzdGLFNBQUssVUFBVSxJQUFJLE9BQU8sS0FBSyxXQUFXLElBQUksRUFBRSxvQkFBb0IsQ0FBQztBQUNyRSxTQUFLLFVBQVUsTUFBTTtBQUFBLE1BQ3BCLFNBQVM7QUFBQSxNQUNULE1BQU0sS0FBSyxPQUFPO0FBQUEsSUFBQyxDQUFDO0FBQ3JCLFNBQUssVUFBVSx5QkFBeUIsWUFBWSxNQUFNLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQzdFO0FBQUEsRUFsQkEsSUFBVyxtQkFBeUM7QUFDbkQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBa0JBLHlCQUFrRTtBQUNqRSxVQUFNLGNBQWMseUJBQXlCLElBQUk7QUFDakQsVUFBTSxzQkFBc0IsWUFBWSxPQUFPLGdCQUFjLEtBQUssa0JBQWtCLG9CQUFvQixXQUFXLElBQUksQ0FBQztBQUN4SCxXQUFPLG9CQUFvQixHQUFHLENBQUM7QUFBQSxFQUNoQztBQUFBLEVBRVEsT0FBTyxPQUF1QjtBQUNyQyxVQUFNLFVBQVUsS0FBSyxTQUFTLGtCQUFrQjtBQUNoRCxRQUFJLEtBQUssWUFBWSxXQUFXLENBQUMsT0FBTztBQUN2QztBQUFBLElBQ0Q7QUFFQSxTQUFLLFVBQVU7QUFDZixTQUFLLG1CQUFtQixNQUFNO0FBRTlCLFFBQUksQ0FBQyxTQUFTO0FBQ2IsV0FBSyxVQUFVLFVBQVUsT0FBTyw2QkFBNkIsS0FBSztBQUNsRSxXQUFLLGtCQUFrQixNQUFNO0FBQzdCLFdBQUssa0JBQWtCLElBQUksT0FBTyxNQUFTO0FBQzNDO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyx5QkFBeUIsSUFBSTtBQUNqRCxRQUFJLFlBQVksUUFBUTtBQUN2QixXQUFLLE9BQU8sV0FBVztBQUV2QixZQUFNLGlCQUE4QixJQUFJLElBQUksWUFBWSxRQUFRLE9BQUssRUFBRSxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQ25GLFdBQUssbUJBQW1CLElBQUksS0FBSyxrQkFBa0IsbUJBQW1CLE9BQUs7QUFDMUUsWUFBSSxFQUFFLFlBQVksY0FBYyxHQUFHO0FBQ2xDLGVBQUssT0FBTyxXQUFXO0FBQUEsUUFDeEI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFUSxPQUFPLGFBQStEO0FBQzdFLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsUUFBSSxVQUFVLEtBQUssT0FBUTtBQUUzQixVQUFNLHNCQUFzQixZQUFZLE9BQU8sZ0JBQWMsS0FBSyxrQkFBa0Isb0JBQW9CLFdBQVcsSUFBSSxDQUFDO0FBQ3hILFVBQU0sb0JBQW9CLG9CQUFvQixHQUFHLENBQUM7QUFDbEQsUUFBSSxtQkFBbUI7QUFDdEIsWUFBTSxVQUFtQztBQUFBLFFBQ3hDLE1BQU0sa0JBQWtCO0FBQUEsUUFDeEIsT0FBTyxrQkFBa0I7QUFBQSxRQUN6QixTQUFTLGtCQUFrQjtBQUFBLE1BQzVCO0FBQ0EsWUFBTSxjQUFjLEtBQUssa0JBQWtCLElBQUksS0FBSyxxQkFBcUIsZUFBZSxxQkFBcUIsU0FBUyxFQUFFLG1CQUFtQixNQUFNLFVBQVUsS0FBSyxTQUFTLENBQUMsQ0FBQztBQUMzSyxXQUFLLFFBQVMsWUFBWSxZQUFZLE9BQU87QUFDN0MsV0FBSyxVQUFVLFVBQVUsT0FBTyw2QkFBNkIsSUFBSTtBQUNqRSxXQUFLLGtCQUFrQixJQUFJLE1BQU0sTUFBUztBQUFBLElBQzNDLE9BQU87QUFDTixXQUFLLFVBQVUsVUFBVSxPQUFPLDZCQUE2QixLQUFLO0FBQ2xFLFdBQUssa0JBQWtCLElBQUksT0FBTyxNQUFTO0FBQUEsSUFDNUM7QUFBQSxFQUNEO0FBQ0Q7QUFwRmEsNEJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxHQWpCVTtBQXNHTixJQUFNLHNCQUFOLGNBQWtDLFdBQVc7QUFBQSxFQUduRCxZQUNpQixTQUNoQixTQUN3QixlQUNILFlBQ3NCLHlCQUMxQztBQUNELFVBQU07QUFOVTtBQUVRO0FBQ0g7QUFDc0I7QUFJM0MsU0FBSyxVQUFVLElBQUksRUFBRSxvQkFBb0I7QUFFekMsUUFBSTtBQUdILFlBQU0sT0FBTyxJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUseUJBQXlCLENBQUM7QUFDbEUsVUFBSSxRQUFRLGNBQWM7QUFDekIsYUFBSyxVQUFVLElBQUksWUFBWTtBQUFBLE1BQ2hDO0FBQ0EsVUFBSSxRQUFRLE1BQU07QUFDakIsWUFBSSxVQUFVLFlBQVksUUFBUSxJQUFJLEdBQUc7QUFDeEMsZ0JBQU0sY0FBYyxXQUFXLFFBQVEsSUFBSTtBQUMzQyxlQUFLLFlBQVksV0FBVztBQUFBLFFBQzdCLFdBQVcsSUFBSSxNQUFNLFFBQVEsSUFBSSxHQUFHO0FBQ25DLGdCQUFNLFNBQVMsU0FBUyxRQUFRLElBQUk7QUFDcEMsZ0JBQU0sT0FBTyxJQUFJLFdBQVc7QUFDNUIsZUFBSyxPQUFPLE1BQU07QUFDbEIsZ0JBQU0sU0FBUyxxQkFBcUIsS0FBSyxPQUFPLENBQUM7QUFDakQsZ0JBQU0sWUFBWSwyQkFBMkIsTUFBTTtBQUVuRCx3QkFBYyxXQUFXO0FBQUEsYUFDakIsTUFBTTtBQUFBLHFCQUNFLE1BQU07QUFBQTtBQUFBLEtBRXRCO0FBQ0EsZUFBSyxVQUFVLElBQUksUUFBUSxhQUFhO0FBQUEsUUFDekM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxRQUFRLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSwwQkFBMEIsQ0FBQztBQUNwRSxZQUFNLGNBQWMsUUFBUTtBQUU1QixZQUFNLFVBQVUsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLDRCQUE0QixDQUFDO0FBRXhFLFlBQU0sZ0JBQWdCLEtBQUssNkJBQTZCLFFBQVEsU0FBUyxPQUFPO0FBQ2hGLFVBQUksT0FBTyxTQUFTLGNBQWMsT0FBTztBQUd6QyxVQUFJLFFBQVEsbUJBQW1CO0FBQzlCLGNBQU0sY0FBYyxJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsK0JBQStCLENBQUM7QUFDL0UsWUFBSSxPQUFPLFFBQVEsc0JBQXNCLFVBQVU7QUFDbEQsc0JBQVksY0FBYyxRQUFRO0FBQUEsUUFDbkMsT0FBTztBQUNOLGdCQUFNLDBCQUEwQixLQUFLLDZCQUE2QixRQUFRLG1CQUFtQixPQUFPO0FBQ3BHLHNCQUFZLFlBQVksd0JBQXdCLE9BQU87QUFBQSxRQUN4RDtBQUFBLE1BQ0Q7QUFHQSxVQUFJLFFBQVEsTUFBTTtBQUNqQixjQUFNLE9BQU8sSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLHlCQUF5QixDQUFDO0FBQ2xFLGNBQU0sYUFBYSxLQUFLLFVBQVUsS0FBSyx3QkFBd0IsT0FBTyxRQUFRLElBQUksQ0FBQztBQUNuRixhQUFLLFlBQVksV0FBVyxPQUFPO0FBQUEsTUFDcEM7QUFBQSxJQUNELFNBQVMsS0FBSztBQUNiLFdBQUssV0FBVyxNQUFNLDhDQUE4QyxHQUFHO0FBQUEsSUFDeEU7QUFBQSxFQUNEO0FBQUEsRUFFTyxjQUFjLFNBQTJDO0FBRS9ELFdBQU8sQ0FBQyxFQUNQLEtBQUssUUFBUSxVQUFVLFFBQVEsU0FDL0IsS0FBSyxRQUFRLFFBQVEsVUFBVSxRQUFRLFFBQVEsU0FDL0MsS0FBSyxRQUFRLHNCQUFzQixRQUFRLHFCQUMzQyxLQUFLLFFBQVEsTUFBTSxVQUFVLFFBQVEsTUFBTTtBQUFBLEVBQzdDO0FBQUEsRUFFUSw2QkFBNkIsU0FBMEIsU0FBdUU7QUFDckksVUFBTSxnQkFBZ0IsS0FBSyxVQUFVLEtBQUssd0JBQXdCLE9BQU8sT0FBTyxDQUFDO0FBRWpGLFVBQU0sWUFBWSxTQUFTLG9CQUFvQixjQUFjLFFBQVEsY0FBYyxHQUFHLElBQUk7QUFDMUYsUUFBSSxXQUFXO0FBQ2QsWUFBTSxTQUFTLFVBQVUsYUFBYSxXQUFXO0FBQ2pELFlBQU0sU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPLFVBQVUsZUFBZ0IsbUJBQW1CLENBQUM7QUFDdkYsYUFBTyxRQUFRLFVBQVUsZUFBZTtBQUN4QyxVQUFJLFFBQVE7QUFDWCxhQUFLLFVBQVUsT0FBTyxXQUFXLE1BQU07QUFDdEMsZUFBSyxjQUFjLEtBQUssUUFBUSxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsUUFDeEQsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUNBLGdCQUFVLFlBQVksT0FBTyxPQUFPO0FBQUEsSUFDckM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBaEdhLHNCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
