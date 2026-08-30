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
import "./bannerController.css";
import { localize } from "../../../../nls.js";
import { $, append, clearNode } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Action } from "../../../../base/common/actions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { widgetClose } from "../../../../platform/theme/common/iconRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
const BANNER_ELEMENT_HEIGHT = 26;
let BannerController = class extends Disposable {
  constructor(_editor, instantiationService) {
    super();
    this._editor = _editor;
    this.instantiationService = instantiationService;
    this.banner = this._register(this.instantiationService.createInstance(Banner));
  }
  hide() {
    this._editor.setBanner(null, 0);
    this.banner.clear();
  }
  show(item) {
    this.banner.show({
      ...item,
      onClose: () => {
        this.hide();
        item.onClose?.();
      }
    });
    this._editor.setBanner(this.banner.element, BANNER_ELEMENT_HEIGHT);
  }
};
BannerController = __decorateClass([
  __decorateParam(1, IInstantiationService)
], BannerController);
let Banner = class extends Disposable {
  constructor(instantiationService, markdownRendererService) {
    super();
    this.instantiationService = instantiationService;
    this.markdownRendererService = markdownRendererService;
    this.element = $("div.editor-banner");
    this.element.tabIndex = 0;
  }
  getAriaLabel(item) {
    if (item.ariaLabel) {
      return item.ariaLabel;
    }
    if (typeof item.message === "string") {
      return item.message;
    }
    return void 0;
  }
  getBannerMessage(message) {
    if (typeof message === "string") {
      const element = $("span");
      element.innerText = message;
      return element;
    }
    return this.markdownRendererService.render(message).element;
  }
  clear() {
    clearNode(this.element);
  }
  show(item) {
    clearNode(this.element);
    const ariaLabel = this.getAriaLabel(item);
    if (ariaLabel) {
      this.element.setAttribute("aria-label", ariaLabel);
    }
    const iconContainer = append(this.element, $("div.icon-container"));
    iconContainer.setAttribute("aria-hidden", "true");
    if (item.icon) {
      iconContainer.appendChild($(`div${ThemeIcon.asCSSSelector(item.icon)}`));
    }
    const messageContainer = append(this.element, $("div.message-container"));
    messageContainer.setAttribute("aria-hidden", "true");
    messageContainer.appendChild(this.getBannerMessage(item.message));
    this.messageActionsContainer = append(this.element, $("div.message-actions-container"));
    if (item.actions) {
      for (const action of item.actions) {
        this._register(this.instantiationService.createInstance(Link, this.messageActionsContainer, { ...action, tabIndex: -1 }, {}));
      }
    }
    const actionBarContainer = append(this.element, $("div.action-container"));
    this.actionBar = this._register(new ActionBar(actionBarContainer));
    this.actionBar.push(this._register(
      new Action(
        "banner.close",
        localize("closeBanner", "Close Banner"),
        ThemeIcon.asClassName(widgetClose),
        true,
        () => {
          if (typeof item.onClose === "function") {
            item.onClose();
          }
        }
      )
    ), { icon: true, label: false });
    this.actionBar.setFocusable(false);
  }
};
Banner = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IMarkdownRendererService)
], Banner);
export {
  BannerController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHVuaWNvZGVIaWdobGlnaHRlclxcYnJvd3NlclxcYmFubmVyQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgJy4vYmFubmVyQ29udHJvbGxlci5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBjbGVhck5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaW5rRGVzY3JpcHRvciwgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgd2lkZ2V0Q2xvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5cbmNvbnN0IEJBTk5FUl9FTEVNRU5UX0hFSUdIVCA9IDI2O1xuXG5leHBvcnQgY2xhc3MgQmFubmVyQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGJhbm5lcjogQmFubmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmJhbm5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmFubmVyKSk7XG5cdH1cblxuXHRwdWJsaWMgaGlkZSgpIHtcblx0XHR0aGlzLl9lZGl0b3Iuc2V0QmFubmVyKG51bGwsIDApO1xuXHRcdHRoaXMuYmFubmVyLmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgc2hvdyhpdGVtOiBJQmFubmVySXRlbSkge1xuXHRcdHRoaXMuYmFubmVyLnNob3coe1xuXHRcdFx0Li4uaXRlbSxcblx0XHRcdG9uQ2xvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRcdGl0ZW0ub25DbG9zZT8uKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fZWRpdG9yLnNldEJhbm5lcih0aGlzLmJhbm5lci5lbGVtZW50LCBCQU5ORVJfRUxFTUVOVF9IRUlHSFQpO1xuXHR9XG59XG5cbi8vIFRPRE9AaGVkaWV0OiBJbnZlc3RpZ2F0ZSBpZiB0aGlzIGNhbiBiZSByZXVzZWQgYnkgdGhlIHdvcmtzcGFjZSBiYW5uZXIgKGJhbm5lclBhcnQudHMpLlxuY2xhc3MgQmFubmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIG1lc3NhZ2VBY3Rpb25zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGFjdGlvbkJhcjogQWN0aW9uQmFyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnZGl2LmVkaXRvci1iYW5uZXInKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBcmlhTGFiZWwoaXRlbTogSUJhbm5lckl0ZW0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpdGVtLmFyaWFMYWJlbCkge1xuXHRcdFx0cmV0dXJuIGl0ZW0uYXJpYUxhYmVsO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGl0ZW0ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBpdGVtLm1lc3NhZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QmFubmVyTWVzc2FnZShtZXNzYWdlOiBNYXJrZG93blN0cmluZyB8IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnc3BhbicpO1xuXHRcdFx0ZWxlbWVudC5pbm5lclRleHQgPSBtZXNzYWdlO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1lc3NhZ2UpLmVsZW1lbnQ7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXIoKSB7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuZWxlbWVudCk7XG5cdH1cblxuXHRwdWJsaWMgc2hvdyhpdGVtOiBJQmFubmVySXRlbSkge1xuXHRcdC8vIENsZWFyIHByZXZpb3VzIGl0ZW1cblx0XHRjbGVhck5vZGUodGhpcy5lbGVtZW50KTtcblxuXHRcdC8vIEJhbm5lciBhcmlhIGxhYmVsXG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5nZXRBcmlhTGFiZWwoaXRlbSk7XG5cdFx0aWYgKGFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWNvblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdkaXYuaWNvbi1jb250YWluZXInKSk7XG5cdFx0aWNvbkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGlmIChpdGVtLmljb24pIHtcblx0XHRcdGljb25Db250YWluZXIuYXBwZW5kQ2hpbGQoJChgZGl2JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpdGVtLmljb24pfWApKTtcblx0XHR9XG5cblx0XHQvLyBNZXNzYWdlXG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ2Rpdi5tZXNzYWdlLWNvbnRhaW5lcicpKTtcblx0XHRtZXNzYWdlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdG1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5nZXRCYW5uZXJNZXNzYWdlKGl0ZW0ubWVzc2FnZSkpO1xuXG5cdFx0Ly8gTWVzc2FnZSBBY3Rpb25zXG5cdFx0dGhpcy5tZXNzYWdlQWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ2Rpdi5tZXNzYWdlLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGlmIChpdGVtLmFjdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGl0ZW0uYWN0aW9ucykge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIHRoaXMubWVzc2FnZUFjdGlvbnNDb250YWluZXIsIHsgLi4uYWN0aW9uLCB0YWJJbmRleDogLTEgfSwge30pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBY3Rpb25cblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdkaXYuYWN0aW9uLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyQ29udGFpbmVyKSk7XG5cdFx0dGhpcy5hY3Rpb25CYXIucHVzaCh0aGlzLl9yZWdpc3Rlcihcblx0XHRcdG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdiYW5uZXIuY2xvc2UnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY2xvc2VCYW5uZXInLCBcIkNsb3NlIEJhbm5lclwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHdpZGdldENsb3NlKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaXRlbS5vbkNsb3NlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRpdGVtLm9uQ2xvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdClcblx0XHQpLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR0aGlzLmFjdGlvbkJhci5zZXRGb2N1c2FibGUoZmFsc2UpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhbm5lckl0ZW0ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSBhY3Rpb25zPzogSUxpbmtEZXNjcmlwdG9yW107XG5cdHJlYWRvbmx5IGFyaWFMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgb25DbG9zZT86ICgpID0+IHZvaWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLEdBQUcsUUFBUSxpQkFBaUI7QUFDckMsU0FB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
