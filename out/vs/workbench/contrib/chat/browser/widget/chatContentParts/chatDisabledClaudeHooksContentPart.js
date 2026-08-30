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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../../../nls.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { PromptsConfig } from "../../../common/promptSyntax/config/config.js";
import "./media/chatDisabledClaudeHooksContent.css";
let ChatDisabledClaudeHooksContentPart = class extends Disposable {
  constructor(_context, _openerService, _markdownRendererService) {
    super();
    this._openerService = _openerService;
    this._markdownRendererService = _markdownRendererService;
    this.domNode = dom.$(".chat-disabled-claude-hooks");
    const messageContainer = dom.$(".chat-disabled-claude-hooks-message");
    const icon = dom.$(".chat-disabled-claude-hooks-icon");
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    const enableLink = createMarkdownCommandLink({
      text: localize("chat.disabledClaudeHooks.enableLink", "Enable"),
      id: "workbench.action.openSettings",
      arguments: [PromptsConfig.USE_CLAUDE_HOOKS],
      tooltip: localize("chat.disabledClaudeHooks.enableLink.tooltip", "Open settings to enable Claude Code hooks")
    });
    const message = localize("chat.disabledClaudeHooks.message", "Claude Code hooks are available for this workspace. {0}", enableLink);
    const content = new MarkdownString(message, { isTrusted: true });
    const rendered = this._register(this._markdownRendererService.render(content, {
      actionHandler: (href) => openLinkFromMarkdown(this._openerService, href, true)
    }));
    messageContainer.appendChild(icon);
    messageContainer.appendChild(rendered.element);
    this.domNode.appendChild(messageContainer);
  }
  hasSameContent(other) {
    return other.kind === "disabledClaudeHooks";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatDisabledClaudeHooksContentPart = __decorateClass([
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IMarkdownRendererService)
], ChatDisabledClaudeHooksContentPart);
export {
  ChatDisabledClaudeHooksContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdERpc2FibGVkQ2xhdWRlSG9va3NDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIG9wZW5MaW5rRnJvbU1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0RGlzYWJsZWRDbGF1ZGVIb29rc0NvbnRlbnQuY3NzJztcblxuZXhwb3J0IGNsYXNzIENoYXREaXNhYmxlZENsYXVkZUhvb2tzQ29udGVudFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuY2hhdC1kaXNhYmxlZC1jbGF1ZGUtaG9va3MnKTtcblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LWRpc2FibGVkLWNsYXVkZS1ob29rcy1tZXNzYWdlJyk7XG5cblx0XHRjb25zdCBpY29uID0gZG9tLiQoJy5jaGF0LWRpc2FibGVkLWNsYXVkZS1ob29rcy1pY29uJyk7XG5cdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uaW5mbykpO1xuXG5cdFx0Y29uc3QgZW5hYmxlTGluayA9IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmsoe1xuXHRcdFx0dGV4dDogbG9jYWxpemUoJ2NoYXQuZGlzYWJsZWRDbGF1ZGVIb29rcy5lbmFibGVMaW5rJywgXCJFbmFibGVcIiksXG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyxcblx0XHRcdGFyZ3VtZW50czogW1Byb21wdHNDb25maWcuVVNFX0NMQVVERV9IT09LU10sXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5kaXNhYmxlZENsYXVkZUhvb2tzLmVuYWJsZUxpbmsudG9vbHRpcCcsIFwiT3BlbiBzZXR0aW5ncyB0byBlbmFibGUgQ2xhdWRlIENvZGUgaG9va3NcIiksXG5cdFx0fSk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0LmRpc2FibGVkQ2xhdWRlSG9va3MubWVzc2FnZScsIFwiQ2xhdWRlIENvZGUgaG9va3MgYXJlIGF2YWlsYWJsZSBmb3IgdGhpcyB3b3Jrc3BhY2UuIHswfVwiLCBlbmFibGVMaW5rKTtcblx0XHRjb25zdCBjb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UsIHsgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoY29udGVudCwge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjogKGhyZWYpID0+IG9wZW5MaW5rRnJvbU1hcmtkb3duKHRoaXMuX29wZW5lclNlcnZpY2UsIGhyZWYsIHRydWUpLFxuXHRcdH0pKTtcblxuXHRcdG1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XG5cdFx0bWVzc2FnZUNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQobWVzc2FnZUNvbnRhaW5lcik7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ2Rpc2FibGVkQ2xhdWRlSG9va3MnO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkIsc0JBQXNCO0FBQzFELFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMEJBQTBCLDRCQUE0QjtBQUMvRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUcvQixTQUFTLHFCQUFxQjtBQUM5QixPQUFPO0FBRUEsSUFBTSxxQ0FBTixjQUFpRCxXQUF1QztBQUFBLEVBRzlGLFlBQ0MsVUFDaUMsZ0JBQ1UsMEJBQzFDO0FBQ0QsVUFBTTtBQUgyQjtBQUNVO0FBSTNDLFNBQUssVUFBVSxJQUFJLEVBQUUsNkJBQTZCO0FBQ2xELFVBQU0sbUJBQW1CLElBQUksRUFBRSxxQ0FBcUM7QUFFcEUsVUFBTSxPQUFPLElBQUksRUFBRSxrQ0FBa0M7QUFDckQsU0FBSyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLElBQUksQ0FBQztBQUU5RCxVQUFNLGFBQWEsMEJBQTBCO0FBQUEsTUFDNUMsTUFBTSxTQUFTLHVDQUF1QyxRQUFRO0FBQUEsTUFDOUQsSUFBSTtBQUFBLE1BQ0osV0FBVyxDQUFDLGNBQWMsZ0JBQWdCO0FBQUEsTUFDMUMsU0FBUyxTQUFTLCtDQUErQywyQ0FBMkM7QUFBQSxJQUM3RyxDQUFDO0FBQ0QsVUFBTSxVQUFVLFNBQVMsb0NBQW9DLDJEQUEyRCxVQUFVO0FBQ2xJLFVBQU0sVUFBVSxJQUFJLGVBQWUsU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBRS9ELFVBQU0sV0FBVyxLQUFLLFVBQVUsS0FBSyx5QkFBeUIsT0FBTyxTQUFTO0FBQUEsTUFDN0UsZUFBZSxDQUFDLFNBQVMscUJBQXFCLEtBQUssZ0JBQWdCLE1BQU0sSUFBSTtBQUFBLElBQzlFLENBQUMsQ0FBQztBQUVGLHFCQUFpQixZQUFZLElBQUk7QUFDakMscUJBQWlCLFlBQVksU0FBUyxPQUFPO0FBQzdDLFNBQUssUUFBUSxZQUFZLGdCQUFnQjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxlQUFlLE9BQXNDO0FBQ3BELFdBQU8sTUFBTSxTQUFTO0FBQUEsRUFDdkI7QUFBQSxFQUVBLGNBQWMsWUFBK0I7QUFDNUMsU0FBSyxVQUFVLFVBQVU7QUFBQSxFQUMxQjtBQUNEO0FBekNhLHFDQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
