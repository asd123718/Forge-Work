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
import "./media/chatViewTitleControl.css";
import { addDisposableListener, EventType, h } from "../../../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { localize } from "../../../../../../nls.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AgentSessionsPicker } from "../../agentSessions/agentSessionsPicker.js";
let ChatViewTitleControl = class extends Disposable {
  constructor(container, delegate, instantiationService) {
    super();
    this.container = container;
    this.delegate = delegate;
    this.instantiationService = instantiationService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this.title = void 0;
    this.titleLabel = this._register(new MutableDisposable());
    this.modelDisposables = this._register(new MutableDisposable());
    this.lastKnownHeight = 0;
    this.render(this.container);
    this.registerActions();
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID,
          title: localize("chat.pickAgentSession", "Pick Agent Session"),
          f1: false,
          menu: [{
            id: MenuId.ChatViewSessionTitleNavigationToolbar,
            group: "navigation",
            order: 2
          }]
        });
      }
      async run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, that.titleLabel.value?.element, void 0);
        await agentSessionsPicker.pickAgentSession();
      }
    }));
  }
  render(parent) {
    const elements = h("div.chat-view-title-container", [
      h("div.chat-view-title-inner", [
        h("div.chat-view-title-navigation-toolbar@navigationToolbar"),
        h("div.chat-view-title-actions-toolbar@actionsToolbar")
      ])
    ]);
    this.navigationToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.navigationToolbar, MenuId.ChatViewSessionTitleNavigationToolbar, {
      actionViewItemProvider: (action) => {
        if (action.id === ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID) {
          this.titleLabel.value = new ChatViewTitleLabel(action);
          this.titleLabel.value.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);
          return this.titleLabel.value;
        }
        return void 0;
      },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      menuOptions: { shouldForwardArgs: true }
    }));
    this.actionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.actionsToolbar, MenuId.ChatViewSessionTitleToolbar, {
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide
    }));
    this.titleContainer = elements.root;
    this._register(Gesture.addTarget(this.titleContainer));
    for (const eventType of [TouchEventType.Tap, EventType.CLICK]) {
      this._register(addDisposableListener(this.titleContainer, eventType, () => {
        this.delegate.focusChat();
      }));
    }
    parent.appendChild(this.titleContainer);
  }
  update(model) {
    this.model = model;
    this.modelDisposables.value = model?.onDidChange((e) => {
      if (e.kind === "setCustomTitle" || e.kind === "addRequest") {
        this.doUpdate();
      }
    });
    this.doUpdate();
  }
  doUpdate() {
    const markdownTitle = new MarkdownString(this.model?.title ?? "");
    this.title = renderAsPlaintext(markdownTitle);
    this.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);
    const context = this.model && {
      $mid: MarshalledId.ChatViewContext,
      sessionResource: this.model.sessionResource
    };
    if (this.navigationToolbar) {
      this.navigationToolbar.context = context;
    }
    if (this.actionsToolbar) {
      this.actionsToolbar.context = context;
    }
  }
  updateTitle(title) {
    if (!this.titleContainer) {
      return;
    }
    this.titleContainer.classList.toggle("visible", this.shouldRender());
    this.titleLabel.value?.updateTitle(title);
    const currentHeight = this.getHeight();
    if (currentHeight !== this.lastKnownHeight) {
      this.lastKnownHeight = currentHeight;
      this._onDidChangeHeight.fire();
    }
  }
  shouldRender() {
    return !!this.model?.title;
  }
  getHeight() {
    if (!this.titleContainer || this.titleContainer.style.display === "none") {
      return 0;
    }
    return this.titleContainer.offsetHeight;
  }
};
ChatViewTitleControl.DEFAULT_TITLE = localize("chat", "Chat");
ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID = "workbench.action.chat.pickAgentSession";
ChatViewTitleControl = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChatViewTitleControl);
class ChatViewTitleLabel extends ActionViewItem {
  constructor(action, options) {
    super(null, action, { ...options, icon: false, label: true });
    this.titleLabel = void 0;
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-view-title-action-item");
    this.label?.classList.add("chat-view-title-label-container");
    this.titleLabel = this.label?.appendChild(h("span.chat-view-title-label").root);
    this.updateLabel();
  }
  updateTitle(title) {
    this.title = title;
    this.updateLabel();
  }
  updateLabel() {
    if (!this.titleLabel) {
      return;
    }
    if (this.title) {
      this.titleLabel.textContent = this.title;
    } else {
      this.titleLabel.textContent = "";
    }
  }
}
export {
  ChatViewTitleControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldEhvc3RzXFx2aWV3UGFuZVxcY2hhdFZpZXdUaXRsZUNvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFZpZXdUaXRsZUNvbnRyb2wuY3NzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRWaWV3VGl0bGVBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zUGlja2VyIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zUGlja2VyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFZpZXdUaXRsZURlbGVnYXRlIHtcblx0Zm9jdXNDaGF0KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Vmlld1RpdGxlQ29udHJvbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfVElUTEUgPSBsb2NhbGl6ZSgnY2hhdCcsIFwiQ2hhdFwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUElDS19BR0VOVF9TRVNTSU9OX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucGlja0FnZW50U2Vzc2lvbic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB0aXRsZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGl0bGVMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0Vmlld1RpdGxlTGFiZWw+KCkpO1xuXG5cdHByaXZhdGUgbW9kZWw6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kZWxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIG5hdmlnYXRpb25Ub29sYmFyPzogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgYWN0aW9uc1Rvb2xiYXI/OiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblxuXHRwcml2YXRlIGxhc3RLbm93bkhlaWdodCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElDaGF0Vmlld1RpdGxlRGVsZWdhdGUsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlbmRlcih0aGlzLmNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IENoYXRWaWV3VGl0bGVDb250cm9sLlBJQ0tfQUdFTlRfU0VTU0lPTl9BQ1RJT05fSUQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LnBpY2tBZ2VudFNlc3Npb24nLCBcIlBpY2sgQWdlbnQgU2Vzc2lvblwiKSxcblx0XHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFZpZXdTZXNzaW9uVGl0bGVOYXZpZ2F0aW9uVG9vbGJhcixcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHRjb25zdCBhZ2VudFNlc3Npb25zUGlja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc1BpY2tlciwgdGhhdC50aXRsZUxhYmVsLnZhbHVlPy5lbGVtZW50LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudFNlc3Npb25zUGlja2VyLnBpY2tBZ2VudFNlc3Npb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBoKCdkaXYuY2hhdC12aWV3LXRpdGxlLWNvbnRhaW5lcicsIFtcblx0XHRcdGgoJ2Rpdi5jaGF0LXZpZXctdGl0bGUtaW5uZXInLCBbXG5cdFx0XHRcdGgoJ2Rpdi5jaGF0LXZpZXctdGl0bGUtbmF2aWdhdGlvbi10b29sYmFyQG5hdmlnYXRpb25Ub29sYmFyJyksXG5cdFx0XHRcdGgoJ2Rpdi5jaGF0LXZpZXctdGl0bGUtYWN0aW9ucy10b29sYmFyQGFjdGlvbnNUb29sYmFyJyksXG5cdFx0XHRdKSxcblx0XHRdKTtcblxuXHRcdC8vIFRvb2xiYXIgb24gdGhlIGxlZnRcblx0XHR0aGlzLm5hdmlnYXRpb25Ub29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgZWxlbWVudHMubmF2aWdhdGlvblRvb2xiYXIsIE1lbnVJZC5DaGF0Vmlld1Nlc3Npb25UaXRsZU5hdmlnYXRpb25Ub29sYmFyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IENoYXRWaWV3VGl0bGVDb250cm9sLlBJQ0tfQUdFTlRfU0VTU0lPTl9BQ1RJT05fSUQpIHtcblx0XHRcdFx0XHR0aGlzLnRpdGxlTGFiZWwudmFsdWUgPSBuZXcgQ2hhdFZpZXdUaXRsZUxhYmVsKGFjdGlvbik7XG5cdFx0XHRcdFx0dGhpcy50aXRsZUxhYmVsLnZhbHVlLnVwZGF0ZVRpdGxlKHRoaXMudGl0bGUgPz8gQ2hhdFZpZXdUaXRsZUNvbnRyb2wuREVGQVVMVF9USVRMRSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy50aXRsZUxhYmVsLnZhbHVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQWN0aW9ucyB0b29sYmFyIG9uIHRoZSByaWdodFxuXHRcdHRoaXMuYWN0aW9uc1Rvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBlbGVtZW50cy5hY3Rpb25zVG9vbGJhciwgTWVudUlkLkNoYXRWaWV3U2Vzc2lvblRpdGxlVG9vbGJhciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZVxuXHRcdH0pKTtcblxuXHRcdC8vIFRpdGxlIGNvbnRyb2xzXG5cdFx0dGhpcy50aXRsZUNvbnRhaW5lciA9IGVsZW1lbnRzLnJvb3Q7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQodGhpcy50aXRsZUNvbnRhaW5lcikpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtUb3VjaEV2ZW50VHlwZS5UYXAsIEV2ZW50VHlwZS5DTElDS10pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRpdGxlQ29udGFpbmVyLCBldmVudFR5cGUsICgpID0+IHtcblx0XHRcdFx0dGhpcy5kZWxlZ2F0ZS5mb2N1c0NoYXQoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy50aXRsZUNvbnRhaW5lcik7XG5cdH1cblxuXHR1cGRhdGUobW9kZWw6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsID0gbW9kZWw7XG5cblx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMudmFsdWUgPSBtb2RlbD8ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAnc2V0Q3VzdG9tVGl0bGUnIHx8IGUua2luZCA9PT0gJ2FkZFJlcXVlc3QnKSB7XG5cdFx0XHRcdHRoaXMuZG9VcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuZG9VcGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFya2Rvd25UaXRsZSA9IG5ldyBNYXJrZG93blN0cmluZyh0aGlzLm1vZGVsPy50aXRsZSA/PyAnJyk7XG5cdFx0dGhpcy50aXRsZSA9IHJlbmRlckFzUGxhaW50ZXh0KG1hcmtkb3duVGl0bGUpO1xuXG5cdFx0dGhpcy51cGRhdGVUaXRsZSh0aGlzLnRpdGxlID8/IENoYXRWaWV3VGl0bGVDb250cm9sLkRFRkFVTFRfVElUTEUpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMubW9kZWwgJiYge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNoYXRWaWV3Q29udGV4dCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy5tb2RlbC5zZXNzaW9uUmVzb3VyY2Vcblx0XHR9IHNhdGlzZmllcyBJQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQ7XG5cblx0XHRpZiAodGhpcy5uYXZpZ2F0aW9uVG9vbGJhcikge1xuXHRcdFx0dGhpcy5uYXZpZ2F0aW9uVG9vbGJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3Rpb25zVG9vbGJhcikge1xuXHRcdFx0dGhpcy5hY3Rpb25zVG9vbGJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGl0bGVDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB0aGlzLnNob3VsZFJlbmRlcigpKTtcblx0XHR0aGlzLnRpdGxlTGFiZWwudmFsdWU/LnVwZGF0ZVRpdGxlKHRpdGxlKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRIZWlnaHQgPSB0aGlzLmdldEhlaWdodCgpO1xuXHRcdGlmIChjdXJyZW50SGVpZ2h0ICE9PSB0aGlzLmxhc3RLbm93bkhlaWdodCkge1xuXHRcdFx0dGhpcy5sYXN0S25vd25IZWlnaHQgPSBjdXJyZW50SGVpZ2h0O1xuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRSZW5kZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5tb2RlbD8udGl0bGU7IC8vIHdlIG5lZWQgYSBjaGF0IHNob3dpbmcgYW5kIG5vdCBiZWluZyBlbXB0eVxuXHR9XG5cblx0Z2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLnRpdGxlQ29udGFpbmVyIHx8IHRoaXMudGl0bGVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50aXRsZUNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdH1cbn1cblxuY2xhc3MgQ2hhdFZpZXdUaXRsZUxhYmVsIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHRpdGxlTGFiZWw6IEhUTUxTcGFuRWxlbWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM/OiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC12aWV3LXRpdGxlLWFjdGlvbi1pdGVtJyk7XG5cdFx0dGhpcy5sYWJlbD8uY2xhc3NMaXN0LmFkZCgnY2hhdC12aWV3LXRpdGxlLWxhYmVsLWNvbnRhaW5lcicpO1xuXG5cdFx0dGhpcy50aXRsZUxhYmVsID0gdGhpcy5sYWJlbD8uYXBwZW5kQ2hpbGQoaCgnc3Bhbi5jaGF0LXZpZXctdGl0bGUtbGFiZWwnKS5yb290KTtcblxuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0fVxuXG5cdHVwZGF0ZVRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cblx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRpdGxlTGFiZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50aXRsZSkge1xuXHRcdFx0dGhpcy50aXRsZUxhYmVsLnRleHRDb250ZW50ID0gdGhpcy50aXRsZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50aXRsZUxhYmVsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLHVCQUF1QixXQUFXLFNBQVM7QUFDcEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6RCxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyw2QkFBK0M7QUFHeEQsU0FBUyxzQkFBOEM7QUFFdkQsU0FBUywyQkFBMkI7QUFNN0IsSUFBTSx1QkFBTixjQUFtQyxXQUFXO0FBQUEsRUFxQnBELFlBQ2tCLFdBQ0EsVUFDdUIsc0JBQ3ZDO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFDdUI7QUFuQnpDLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDeEUsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFFckQsU0FBUSxRQUE0QjtBQUdwQyxTQUFRLGFBQWEsS0FBSyxVQUFVLElBQUksa0JBQXNDLENBQUM7QUFHL0UsU0FBUSxtQkFBbUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFLakUsU0FBUSxrQkFBa0I7QUFTekIsU0FBSyxP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
