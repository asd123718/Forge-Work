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
import { $, clearNode, hide, show } from "../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ChatResourceGroupWidget } from "./chatResourceGroupWidget.js";
let ChatThinkingExternalResourceWidget = class extends Disposable {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this.resourcePartsByToolCallId = /* @__PURE__ */ new Map();
    this.resourceGroupWidget = this._register(new MutableDisposable());
    this.resourceGroupWidgetHeightListener = this._register(new MutableDisposable());
    this.isCollapsed = true;
    this.domNode = $(".chat-thinking-external-resources");
    hide(this.domNode);
  }
  setToolInvocationParts(toolCallId, parts) {
    if (parts.length === 0) {
      return;
    }
    this.resourcePartsByToolCallId.set(toolCallId, parts);
    this.rebuild();
  }
  removeToolInvocation(toolCallId) {
    if (!this.resourcePartsByToolCallId.delete(toolCallId)) {
      return;
    }
    this.rebuild();
  }
  setCollapsed(collapsed) {
    this.isCollapsed = collapsed;
    if (!this.resourceGroupWidget.value) {
      hide(this.domNode);
      return;
    }
    if (this.isCollapsed) {
      show(this.domNode);
    } else {
      hide(this.domNode);
    }
  }
  rebuild() {
    const allParts = [];
    for (const parts of this.resourcePartsByToolCallId.values()) {
      allParts.push(...parts);
    }
    this.resourceGroupWidgetHeightListener.clear();
    this.resourceGroupWidget.clear();
    clearNode(this.domNode);
    if (allParts.length === 0) {
      hide(this.domNode);
      this._onDidChangeHeight.fire();
      return;
    }
    const widget = this.instantiationService.createInstance(ChatResourceGroupWidget, allParts);
    this.resourceGroupWidgetHeightListener.value = widget.onDidChangeHeight(() => this._onDidChangeHeight.fire());
    this.resourceGroupWidget.value = widget;
    this.domNode.appendChild(widget.domNode);
    this.setCollapsed(this.isCollapsed);
    this._onDidChangeHeight.fire();
  }
};
ChatThinkingExternalResourceWidget = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ChatThinkingExternalResourceWidget);
export {
  ChatThinkingExternalResourceWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRoaW5raW5nRXh0ZXJuYWxSZXNvdXJjZXNXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBjbGVhck5vZGUsIGhpZGUsIHNob3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzb3VyY2VHcm91cFdpZGdldCB9IGZyb20gJy4vY2hhdFJlc291cmNlR3JvdXBXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW5wdXRPdXRwdXRDb250ZW50UGFydC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGhpbmtpbmdFeHRlcm5hbFJlc291cmNlV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlUGFydHNCeVRvb2xDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUdyb3VwV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRSZXNvdXJjZUdyb3VwV2lkZ2V0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUdyb3VwV2lkZ2V0SGVpZ2h0TGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIGlzQ29sbGFwc2VkID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuY2hhdC10aGlua2luZy1leHRlcm5hbC1yZXNvdXJjZXMnKTtcblx0XHRoaWRlKHRoaXMuZG9tTm9kZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VG9vbEludm9jYXRpb25QYXJ0cyh0b29sQ2FsbElkOiBzdHJpbmcsIHBhcnRzOiBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdKTogdm9pZCB7XG5cdFx0aWYgKHBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVzb3VyY2VQYXJ0c0J5VG9vbENhbGxJZC5zZXQodG9vbENhbGxJZCwgcGFydHMpO1xuXG5cdFx0dGhpcy5yZWJ1aWxkKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVG9vbEludm9jYXRpb24odG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlc291cmNlUGFydHNCeVRvb2xDYWxsSWQuZGVsZXRlKHRvb2xDYWxsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWJ1aWxkKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29sbGFwc2VkKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuaXNDb2xsYXBzZWQgPSBjb2xsYXBzZWQ7XG5cblx0XHRpZiAoIXRoaXMucmVzb3VyY2VHcm91cFdpZGdldC52YWx1ZSkge1xuXHRcdFx0aGlkZSh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzQ29sbGFwc2VkKSB7XG5cdFx0XHRzaG93KHRoaXMuZG9tTm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhpZGUodGhpcy5kb21Ob2RlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYnVpbGQoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWxsUGFydHM6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHBhcnRzIG9mIHRoaXMucmVzb3VyY2VQYXJ0c0J5VG9vbENhbGxJZC52YWx1ZXMoKSkge1xuXHRcdFx0YWxsUGFydHMucHVzaCguLi5wYXJ0cyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXNvdXJjZUdyb3VwV2lkZ2V0SGVpZ2h0TGlzdGVuZXIuY2xlYXIoKTtcblx0XHR0aGlzLnJlc291cmNlR3JvdXBXaWRnZXQuY2xlYXIoKTtcblx0XHRjbGVhck5vZGUodGhpcy5kb21Ob2RlKTtcblxuXHRcdGlmIChhbGxQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdGhpZGUodGhpcy5kb21Ob2RlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXNvdXJjZUdyb3VwV2lkZ2V0LCBhbGxQYXJ0cyk7XG5cdFx0dGhpcy5yZXNvdXJjZUdyb3VwV2lkZ2V0SGVpZ2h0TGlzdGVuZXIudmFsdWUgPSB3aWRnZXQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpKTtcblx0XHR0aGlzLnJlc291cmNlR3JvdXBXaWRnZXQudmFsdWUgPSB3aWRnZXQ7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHR0aGlzLnNldENvbGxhcHNlZCh0aGlzLmlzQ29sbGFwc2VkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLFdBQVcsTUFBTSxZQUFZO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUdqQyxJQUFNLHFDQUFOLGNBQWlELFdBQVc7QUFBQSxFQVdsRSxZQUN5QyxzQkFDdkM7QUFDRCxVQUFNO0FBRmtDO0FBVHpDLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDeEUsU0FBZ0Isb0JBQW9CLEtBQUssbUJBQW1CO0FBRTVELFNBQWlCLDRCQUE0QixvQkFBSSxJQUEwQztBQUMzRixTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksa0JBQTJDLENBQUM7QUFDdEcsU0FBaUIsb0NBQW9DLEtBQUssVUFBVSxJQUFJLGtCQUErQixDQUFDO0FBQ3hHLFNBQVEsY0FBYztBQU1yQixTQUFLLFVBQVUsRUFBRSxtQ0FBbUM7QUFDcEQsU0FBSyxLQUFLLE9BQU87QUFBQSxFQUNsQjtBQUFBLEVBRU8sdUJBQXVCLFlBQW9CLE9BQTJDO0FBQzVGLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBRUEsU0FBSywwQkFBMEIsSUFBSSxZQUFZLEtBQUs7QUFFcEQsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRU8scUJBQXFCLFlBQTBCO0FBQ3JELFFBQUksQ0FBQyxLQUFLLDBCQUEwQixPQUFPLFVBQVUsR0FBRztBQUN2RDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFTyxhQUFhLFdBQTBCO0FBQzdDLFNBQUssY0FBYztBQUVuQixRQUFJLENBQUMsS0FBSyxvQkFBb0IsT0FBTztBQUNwQyxXQUFLLEtBQUssT0FBTztBQUNqQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssYUFBYTtBQUNyQixXQUFLLEtBQUssT0FBTztBQUFBLElBQ2xCLE9BQU87QUFDTixXQUFLLEtBQUssT0FBTztBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBRVEsVUFBZ0I7QUFDdkIsVUFBTSxXQUF5QyxDQUFDO0FBQ2hELGVBQVcsU0FBUyxLQUFLLDBCQUEwQixPQUFPLEdBQUc7QUFDNUQsZUFBUyxLQUFLLEdBQUcsS0FBSztBQUFBLElBQ3ZCO0FBRUEsU0FBSyxrQ0FBa0MsTUFBTTtBQUM3QyxTQUFLLG9CQUFvQixNQUFNO0FBQy9CLGNBQVUsS0FBSyxPQUFPO0FBRXRCLFFBQUksU0FBUyxXQUFXLEdBQUc7QUFDMUIsV0FBSyxLQUFLLE9BQU87QUFDakIsV0FBSyxtQkFBbUIsS0FBSztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsS0FBSyxxQkFBcUIsZUFBZSx5QkFBeUIsUUFBUTtBQUN6RixTQUFLLGtDQUFrQyxRQUFRLE9BQU8sa0JBQWtCLE1BQU0sS0FBSyxtQkFBbUIsS0FBSyxDQUFDO0FBQzVHLFNBQUssb0JBQW9CLFFBQVE7QUFDakMsU0FBSyxRQUFRLFlBQVksT0FBTyxPQUFPO0FBQ3ZDLFNBQUssYUFBYSxLQUFLLFdBQVc7QUFDbEMsU0FBSyxtQkFBbUIsS0FBSztBQUFBLEVBQzlCO0FBQ0Q7QUEzRWEscUNBQU47QUFBQSxFQVlKO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
