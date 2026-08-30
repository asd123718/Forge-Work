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
import { renderAsPlaintext } from "../../../../../../../base/browser/markdownRenderer.js";
import { status } from "../../../../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../../../../nls.js";
import { AccessibilityWorkbenchSettingId } from "../../../../../accessibility/browser/accessibilityConfiguration.js";
import { ChatProgressSubPart } from "../chatProgressContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
const skipHref = "#skip";
let ChatOtherClientToolProgressPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, renderer, announcedToolProgressKeys, instantiationService, configurationService) {
    super(toolInvocation);
    this.codeblocks = [];
    const invocationMessage = typeof toolInvocation.invocationMessage === "string" ? toolInvocation.invocationMessage : renderAsPlaintext(toolInvocation.invocationMessage);
    const content = localize(
      "agentHost.otherClientTool.runningWithSkip",
      "{0} [Skip?](#skip)",
      escapeMarkdownSyntaxTokens(invocationMessage)
    );
    let cancelled = false;
    const rendered = this._register(renderer.render(new MarkdownString(content, { isTrusted: true }), {
      actionHandler: (href) => {
        if (href === skipHref && !cancelled) {
          cancelled = true;
          toolInvocation.otherClientToolCall?.cancel();
        }
      }
    }));
    const skipLink = rendered.element.querySelector(`a[data-href="${skipHref}"]`);
    if (skipLink) {
      skipLink.setAttribute("role", "button");
      skipLink.href = "";
    }
    const announcementKey = `progress:${toolInvocation.toolCallId}`;
    if (announcedToolProgressKeys && configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates) && !announcedToolProgressKeys.has(announcementKey)) {
      announcedToolProgressKeys.add(announcementKey);
      status(localize("agentHost.otherClientTool.runningWithSkip.a11y", "{0} Skip?", invocationMessage));
    }
    this.domNode = this._register(instantiationService.createInstance(
      ChatProgressSubPart,
      rendered.element,
      Codicon.check,
      void 0
    )).domNode;
  }
};
ChatOtherClientToolProgressPart = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService)
], ChatOtherClientToolProgressPart);
export {
  ChatOtherClientToolProgressPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdE90aGVyQ2xpZW50VG9vbFByb2dyZXNzUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRQcm9ncmVzc1N1YlBhcnQgfSBmcm9tICcuLi9jaGF0UHJvZ3Jlc3NDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydC5qcyc7XG5cbmNvbnN0IHNraXBIcmVmID0gJyNza2lwJztcblxuZXhwb3J0IGNsYXNzIENoYXRPdGhlckNsaWVudFRvb2xQcm9ncmVzc1BhcnQgZXh0ZW5kcyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB7XG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbik7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uTWVzc2FnZSA9IHR5cGVvZiB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdD8gdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2Vcblx0XHRcdDogcmVuZGVyQXNQbGFpbnRleHQodG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBsb2NhbGl6ZShcblx0XHRcdCdhZ2VudEhvc3Qub3RoZXJDbGllbnRUb29sLnJ1bm5pbmdXaXRoU2tpcCcsXG5cdFx0XHQnezB9IFtTa2lwP10oI3NraXApJyxcblx0XHRcdGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGludm9jYXRpb25NZXNzYWdlKSxcblx0XHQpO1xuXHRcdGxldCBjYW5jZWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKHJlbmRlcmVyLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCwgeyBpc1RydXN0ZWQ6IHRydWUgfSksIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IGhyZWYgPT4ge1xuXHRcdFx0XHRpZiAoaHJlZiA9PT0gc2tpcEhyZWYgJiYgIWNhbmNlbGxlZCkge1xuXHRcdFx0XHRcdGNhbmNlbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0dG9vbEludm9jYXRpb24ub3RoZXJDbGllbnRUb29sQ2FsbD8uY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNraXBMaW5rID0gcmVuZGVyZWQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PihgYVtkYXRhLWhyZWY9XCIke3NraXBIcmVmfVwiXWApO1xuXHRcdGlmIChza2lwTGluaykge1xuXHRcdFx0c2tpcExpbmsuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0c2tpcExpbmsuaHJlZiA9ICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFubm91bmNlbWVudEtleSA9IGBwcm9ncmVzczoke3Rvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWR9YDtcblx0XHRpZiAoYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5c1xuXHRcdFx0JiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5WZXJib3NlQ2hhdFByb2dyZXNzVXBkYXRlcylcblx0XHRcdCYmICFhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLmhhcyhhbm5vdW5jZW1lbnRLZXkpKSB7XG5cdFx0XHRhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLmFkZChhbm5vdW5jZW1lbnRLZXkpO1xuXHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhZ2VudEhvc3Qub3RoZXJDbGllbnRUb29sLnJ1bm5pbmdXaXRoU2tpcC5hMTF5JywgJ3swfSBTa2lwPycsIGludm9jYXRpb25NZXNzYWdlKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0UHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0cmVuZGVyZWQuZWxlbWVudCxcblx0XHRcdENvZGljb24uY2hlY2ssXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KSkuZG9tTm9kZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCLHNCQUFzQjtBQUMzRCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFDQUFxQztBQUU5QyxNQUFNLFdBQVc7QUFFVixJQUFNLGtDQUFOLGNBQThDLDhCQUE4QjtBQUFBLEVBSWxGLFlBQ0MsZ0JBQ0EsVUFDQSwyQkFDdUIsc0JBQ0Esc0JBQ3RCO0FBQ0QsVUFBTSxjQUFjO0FBVHJCLFNBQVMsYUFBbUMsQ0FBQztBQVc1QyxVQUFNLG9CQUFvQixPQUFPLGVBQWUsc0JBQXNCLFdBQ25FLGVBQWUsb0JBQ2Ysa0JBQWtCLGVBQWUsaUJBQWlCO0FBQ3JELFVBQU0sVUFBVTtBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsTUFDQSwyQkFBMkIsaUJBQWlCO0FBQUEsSUFDN0M7QUFDQSxRQUFJLFlBQVk7QUFDaEIsVUFBTSxXQUFXLEtBQUssVUFBVSxTQUFTLE9BQU8sSUFBSSxlQUFlLFNBQVMsRUFBRSxXQUFXLEtBQUssQ0FBQyxHQUFHO0FBQUEsTUFDakcsZUFBZSxVQUFRO0FBQ3RCLFlBQUksU0FBUyxZQUFZLENBQUMsV0FBVztBQUNwQyxzQkFBWTtBQUNaLHlCQUFlLHFCQUFxQixPQUFPO0FBQUEsUUFDNUM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsU0FBUyxRQUFRLGNBQWlDLGdCQUFnQixRQUFRLElBQUk7QUFDL0YsUUFBSSxVQUFVO0FBQ2IsZUFBUyxhQUFhLFFBQVEsUUFBUTtBQUN0QyxlQUFTLE9BQU87QUFBQSxJQUNqQjtBQUVBLFVBQU0sa0JBQWtCLFlBQVksZUFBZSxVQUFVO0FBQzdELFFBQUksNkJBQ0EscUJBQXFCLFNBQVMsZ0NBQWdDLDBCQUEwQixLQUN4RixDQUFDLDBCQUEwQixJQUFJLGVBQWUsR0FBRztBQUNwRCxnQ0FBMEIsSUFBSSxlQUFlO0FBQzdDLGFBQU8sU0FBUyxrREFBa0QsYUFBYSxpQkFBaUIsQ0FBQztBQUFBLElBQ2xHO0FBRUEsU0FBSyxVQUFVLEtBQUssVUFBVSxxQkFBcUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUMsRUFBRTtBQUFBLEVBQ0o7QUFDRDtBQXBEYSxrQ0FBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFtdCn0K
