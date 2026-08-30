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
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { escapeMarkdownSyntaxTokens, createMarkdownCommandLink, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../../../nls.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { McpCommandIds } from "../../../../mcp/common/mcpCommandIds.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
import { startServerAndWaitForLiveTools } from "../../../../mcp/common/mcpTypesUtils.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatProgressContentPart } from "./chatProgressContentPart.js";
import "./media/chatMcpServersInteractionContent.css";
let ChatMcpServersInteractionContentPart = class extends Disposable {
  constructor(data, context, mcpService, instantiationService, _openerService, _markdownRendererService) {
    super();
    this.data = data;
    this.context = context;
    this.mcpService = mcpService;
    this.instantiationService = instantiationService;
    this._openerService = _openerService;
    this._markdownRendererService = _markdownRendererService;
    this.interactionMd = this._register(new MutableDisposable());
    this.showSpecificServersScheduler = this._register(new RunOnceScheduler(() => this.updateDetailedProgress(this.data.state.get()), 2500));
    this.previousParts = new Lazy(() => {
      if (!isResponseVM(this.context.element)) {
        return [];
      }
      return this.context.element.session.getItems().filter((r, i) => isResponseVM(r) && i < this.context.elementIndex).flatMap((i) => i.response.value.filter((c) => c.kind === "mcpServersStarting")).map((p) => p.state?.get());
    });
    this.domNode = dom.$(".chat-mcp-servers-interaction");
    if (data.state) {
      this._register(autorun((reader) => {
        const state = data.state.read(reader);
        this.updateForState(state);
      }));
    }
  }
  updateForState(state) {
    if (!state.working) {
      this.workingProgressPart?.domNode.remove();
      this.workingProgressPart = void 0;
      this.showSpecificServersScheduler.cancel();
    } else if (!this.workingProgressPart) {
      if (!this.showSpecificServersScheduler.isScheduled()) {
        this.showSpecificServersScheduler.schedule();
      }
    } else if (this.workingProgressPart) {
      this.updateDetailedProgress(state);
    }
    const requiringInteraction = state.serversRequiringInteraction.filter((s) => {
      if (this.data.didStartServerIds?.includes(s.id)) {
        return false;
      }
      if (this.previousParts.value.some((p) => p?.serversRequiringInteraction.some((s2) => s.id === s2.id))) {
        return false;
      }
      return true;
    });
    if (requiringInteraction.length > 0) {
      if (!this.interactionMd.value) {
        this.renderInteractionRequired(requiringInteraction);
      } else {
        this.updateInteractionRequired(this.interactionMd.value.element, requiringInteraction);
      }
    } else if (requiringInteraction.length === 0 && this.interactionContainer) {
      this.interactionContainer.remove();
      this.interactionContainer = void 0;
    }
  }
  createServerCommandLinks(servers) {
    return servers.map((s) => createMarkdownCommandLink({
      text: "`" + escapeMarkdownSyntaxTokens(s.label) + "`",
      id: McpCommandIds.ServerOptions,
      arguments: [s.id],
      tooltip: localize("mcp.server.options.tooltip", "Show options for {0}", s.label)
    }, false)).join(", ");
  }
  updateDetailedProgress(state) {
    const skipText = createMarkdownCommandLink({
      text: localize("mcp.skip.link", "Skip?"),
      id: McpCommandIds.SkipCurrentAutostart,
      tooltip: localize("mcp.skip.tooltip", "Skip starting this MCP server")
    });
    let content;
    if (state.starting.length === 0) {
      content = new MarkdownString(void 0, { isTrusted: true }).appendText(localize("mcp.working.mcp", "Activating MCP extensions...") + " ").appendMarkdown(skipText);
    } else {
      const serverLinks = this.createServerCommandLinks(state.starting);
      content = new MarkdownString(void 0, { isTrusted: true }).appendMarkdown(localize("mcp.starting.servers", "Starting MCP servers {0}...", serverLinks) + " ").appendMarkdown(skipText);
    }
    if (this.workingProgressPart) {
      this.workingProgressPart.updateMessage(content);
    } else {
      this.workingProgressPart = this._register(this.instantiationService.createInstance(
        ChatProgressContentPart,
        { kind: "progressMessage", content },
        this._markdownRendererService,
        this.context,
        true,
        // forceShowSpinner
        true,
        // forceShowMessage
        void 0,
        // icon
        void 0,
        // toolInvocation
        false
        // no shimmer for now
      ));
      this.domNode.appendChild(this.workingProgressPart.domNode);
    }
  }
  renderInteractionRequired(serversRequiringInteraction) {
    this.interactionContainer = dom.$(".chat-mcp-servers-interaction-hint");
    const messageContainer = dom.$(".chat-mcp-servers-message");
    const icon = dom.$(".chat-mcp-servers-icon");
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mcp));
    const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);
    messageContainer.appendChild(icon);
    messageContainer.appendChild(messageMd.element);
    this.interactionContainer.appendChild(messageContainer);
    this.domNode.prepend(this.interactionContainer);
  }
  updateInteractionRequired(oldElement, serversRequiringInteraction) {
    const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);
    oldElement.replaceWith(messageMd.element);
  }
  createInteractionMessage(serversRequiringInteraction) {
    const count = serversRequiringInteraction.length;
    const links = this.createServerCommandLinks(serversRequiringInteraction);
    const content = count === 1 ? localize("mcp.start.single", "The MCP server {0} may have new tools and requires interaction to start. [Start it now?]({1})", links, "#start") : localize("mcp.start.multiple", "The MCP servers {0} may have new tools and require interaction to start. [Start them now?]({1})", links, "#start");
    const str = new MarkdownString(content, { isTrusted: true });
    const messageMd = this.interactionMd.value = this._markdownRendererService.render(str, {
      actionHandler: (content2) => {
        if (!content2.startsWith("command:")) {
          this._start(startLink);
          return Promise.resolve(true);
        }
        return openLinkFromMarkdown(this._openerService, content2, true);
      }
    });
    const startLink = [...messageMd.element.querySelectorAll("a")].find((a) => !a.getAttribute("data-href")?.startsWith("command:"));
    if (!startLink) {
      return { messageMd, startLink: void 0 };
    }
    startLink.setAttribute("role", "button");
    startLink.href = "";
    return { messageMd, startLink };
  }
  async _start(startLink) {
    startLink.style.pointerEvents = "none";
    startLink.style.opacity = "0.7";
    try {
      if (!this.data.state) {
        return;
      }
      const state = this.data.state.get();
      const serversToStart = state.serversRequiringInteraction;
      for (let i = 0; i < serversToStart.length; i++) {
        const serverInfo = serversToStart[i];
        startLink.textContent = localize("mcp.starting", "Starting {0}...", serverInfo.label);
        const server = this.mcpService.servers.get().find((s) => s.definition.id === serverInfo.id);
        if (server) {
          await startServerAndWaitForLiveTools(server, { promptType: "all-untrusted" });
          this.data.didStartServerIds ??= [];
          this.data.didStartServerIds.push(serverInfo.id);
        }
      }
      if (this.interactionContainer) {
        this.interactionContainer.remove();
        this.interactionContainer = void 0;
      }
    } catch (error) {
      startLink.style.pointerEvents = "";
      startLink.style.opacity = "";
      startLink.textContent = "Start now?";
    }
  }
  hasSameContent(other) {
    return other.kind === "mcpServersStarting";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatMcpServersInteractionContentPart = __decorateClass([
  __decorateParam(2, IMcpService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IMarkdownRendererService)
], ChatMcpServersInteractionContentPart);
export {
  ChatMcpServersInteractionContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdE1jcFNlcnZlcnNJbnRlcmFjdGlvbkNvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucywgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluaywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgb3BlbkxpbmtGcm9tTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTWNwQ29tbWFuZElkcyB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBJQXV0b3N0YXJ0UmVzdWx0LCBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgc3RhcnRTZXJ2ZXJBbmRXYWl0Rm9yTGl2ZVRvb2xzIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlc1V0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1NlcmlhbGl6ZWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRQcm9ncmVzc0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0UHJvZ3Jlc3NDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdE1jcFNlcnZlcnNJbnRlcmFjdGlvbkNvbnRlbnQuY3NzJztcblxuZXhwb3J0IGNsYXNzIENoYXRNY3BTZXJ2ZXJzSW50ZXJhY3Rpb25Db250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgd29ya2luZ1Byb2dyZXNzUGFydDogQ2hhdFByb2dyZXNzQ29udGVudFBhcnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW50ZXJhY3Rpb25Db250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGludGVyYWN0aW9uTWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVJlbmRlcmVkTWFya2Rvd24+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNob3dTcGVjaWZpY1NlcnZlcnNTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnVwZGF0ZURldGFpbGVkUHJvZ3Jlc3ModGhpcy5kYXRhLnN0YXRlIS5nZXQoKSksIDI1MDApKTtcblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aW91c1BhcnRzID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdGlmICghaXNSZXNwb25zZVZNKHRoaXMuY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uLmdldEl0ZW1zKClcblx0XHRcdC5maWx0ZXIoKHIsIGkpOiByIGlzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgPT4gaXNSZXNwb25zZVZNKHIpICYmIGkgPCB0aGlzLmNvbnRleHQuZWxlbWVudEluZGV4KVxuXHRcdFx0LmZsYXRNYXAoaSA9PiBpLnJlc3BvbnNlLnZhbHVlLmZpbHRlcihjID0+IGMua2luZCA9PT0gJ21jcFNlcnZlcnNTdGFydGluZycpKVxuXHRcdFx0Lm1hcChwID0+IHAuc3RhdGU/LmdldCgpKTtcblx0fSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkYXRhOiBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZyB8IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nU2VyaWFsaXplZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtbWNwLXNlcnZlcnMtaW50ZXJhY3Rpb24nKTtcblxuXHRcdC8vIExpc3RlbiB0byBhdXRvc3RhcnQgc3RhdGUgY2hhbmdlcyBpZiBhdmFpbGFibGVcblx0XHRpZiAoZGF0YS5zdGF0ZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGRhdGEuc3RhdGUhLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dGhpcy51cGRhdGVGb3JTdGF0ZShzdGF0ZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JTdGF0ZShzdGF0ZTogSUF1dG9zdGFydFJlc3VsdCk6IHZvaWQge1xuXHRcdGlmICghc3RhdGUud29ya2luZykge1xuXHRcdFx0dGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0Py5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zaG93U3BlY2lmaWNTZXJ2ZXJzU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMud29ya2luZ1Byb2dyZXNzUGFydCkge1xuXHRcdFx0aWYgKCF0aGlzLnNob3dTcGVjaWZpY1NlcnZlcnNTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLnNob3dTcGVjaWZpY1NlcnZlcnNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMud29ya2luZ1Byb2dyZXNzUGFydCkge1xuXHRcdFx0dGhpcy51cGRhdGVEZXRhaWxlZFByb2dyZXNzKHN0YXRlKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1aXJpbmdJbnRlcmFjdGlvbiA9IHN0YXRlLnNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbi5maWx0ZXIocyA9PiB7XG5cdFx0XHQvLyBkb24ndCBub3RlIGludGVyYWN0aW9uIGZvciBhIHNlcnZlciB3ZSBhbHJlYWR5IHN0YXJ0ZWRcblx0XHRcdGlmICh0aGlzLmRhdGEuZGlkU3RhcnRTZXJ2ZXJJZHM/LmluY2x1ZGVzKHMuaWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZG9uJ3Qgbm90ZSBpbnRlcmFjdGlvbiBmb3IgYSBzZXJ2ZXIgd2UgcHJldmlvdXNseSBub3RlZCBpbnRlcmFjdGlvbiBmb3Jcblx0XHRcdGlmICh0aGlzLnByZXZpb3VzUGFydHMudmFsdWUuc29tZShwID0+IHA/LnNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbi5zb21lKHMyID0+IHMuaWQgPT09IHMyLmlkKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGlmIChyZXF1aXJpbmdJbnRlcmFjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoIXRoaXMuaW50ZXJhY3Rpb25NZC52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckludGVyYWN0aW9uUmVxdWlyZWQocmVxdWlyaW5nSW50ZXJhY3Rpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGVJbnRlcmFjdGlvblJlcXVpcmVkKHRoaXMuaW50ZXJhY3Rpb25NZC52YWx1ZS5lbGVtZW50LCByZXF1aXJpbmdJbnRlcmFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZXF1aXJpbmdJbnRlcmFjdGlvbi5sZW5ndGggPT09IDAgJiYgdGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuaW50ZXJhY3Rpb25Db250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXJ2ZXJDb21tYW5kTGlua3Moc2VydmVyczogQXJyYXk8eyBpZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH0+KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc2VydmVycy5tYXAocyA9PiBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHtcblx0XHRcdHRleHQ6ICdgJyArIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHMubGFiZWwpICsgJ2AnLFxuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2VydmVyT3B0aW9ucyxcblx0XHRcdGFyZ3VtZW50czogW3MuaWRdLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21jcC5zZXJ2ZXIub3B0aW9ucy50b29sdGlwJywgJ1Nob3cgb3B0aW9ucyBmb3IgezB9Jywgcy5sYWJlbCksXG5cdFx0fSwgZmFsc2UpKS5qb2luKCcsICcpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEZXRhaWxlZFByb2dyZXNzKHN0YXRlOiBJQXV0b3N0YXJ0UmVzdWx0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2tpcFRleHQgPSBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHtcblx0XHRcdHRleHQ6IGxvY2FsaXplKCdtY3Auc2tpcC5saW5rJywgJ1NraXA/JyksXG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5Ta2lwQ3VycmVudEF1dG9zdGFydCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdtY3Auc2tpcC50b29sdGlwJywgJ1NraXAgc3RhcnRpbmcgdGhpcyBNQ1Agc2VydmVyJyksXG5cdFx0fSk7XG5cblx0XHRsZXQgY29udGVudDogTWFya2Rvd25TdHJpbmc7XG5cdFx0aWYgKHN0YXRlLnN0YXJ0aW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgaXNUcnVzdGVkOiB0cnVlIH0pLmFwcGVuZFRleHQobG9jYWxpemUoJ21jcC53b3JraW5nLm1jcCcsICdBY3RpdmF0aW5nIE1DUCBleHRlbnNpb25zLi4uJykgKyAnICcpLmFwcGVuZE1hcmtkb3duKHNraXBUZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVXBkYXRlIHRvIHNob3cgc3BlY2lmaWMgc2VydmVyIG5hbWVzIGFzIGNvbW1hbmQgbGlua3Ncblx0XHRcdGNvbnN0IHNlcnZlckxpbmtzID0gdGhpcy5jcmVhdGVTZXJ2ZXJDb21tYW5kTGlua3Moc3RhdGUuc3RhcnRpbmcpO1xuXHRcdFx0Y29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgaXNUcnVzdGVkOiB0cnVlIH0pLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdtY3Auc3RhcnRpbmcuc2VydmVycycsICdTdGFydGluZyBNQ1Agc2VydmVycyB7MH0uLi4nLCBzZXJ2ZXJMaW5rcykgKyAnICcpLmFwcGVuZE1hcmtkb3duKHNraXBUZXh0KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0KSB7XG5cdFx0XHR0aGlzLndvcmtpbmdQcm9ncmVzc1BhcnQudXBkYXRlTWVzc2FnZShjb250ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFByb2dyZXNzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQgfSxcblx0XHRcdFx0dGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdFx0dHJ1ZSwgLy8gZm9yY2VTaG93U3Bpbm5lclxuXHRcdFx0XHR0cnVlLCAvLyBmb3JjZVNob3dNZXNzYWdlXG5cdFx0XHRcdHVuZGVmaW5lZCwgLy8gaWNvblxuXHRcdFx0XHR1bmRlZmluZWQsIC8vIHRvb2xJbnZvY2F0aW9uXG5cdFx0XHRcdGZhbHNlLCAvLyBubyBzaGltbWVyIGZvciBub3dcblx0XHRcdCkpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMud29ya2luZ1Byb2dyZXNzUGFydC5kb21Ob2RlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckludGVyYWN0aW9uUmVxdWlyZWQoc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uOiBBcnJheTx7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGVycm9yTWVzc2FnZT86IHN0cmluZyB9Pik6IHZvaWQge1xuXHRcdHRoaXMuaW50ZXJhY3Rpb25Db250YWluZXIgPSBkb20uJCgnLmNoYXQtbWNwLXNlcnZlcnMtaW50ZXJhY3Rpb24taGludCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIHN1YnRsZSBoaW50IG1lc3NhZ2Vcblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LW1jcC1zZXJ2ZXJzLW1lc3NhZ2UnKTtcblx0XHRjb25zdCBpY29uID0gZG9tLiQoJy5jaGF0LW1jcC1zZXJ2ZXJzLWljb24nKTtcblx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5tY3ApKTtcblxuXHRcdGNvbnN0IHsgbWVzc2FnZU1kIH0gPSB0aGlzLmNyZWF0ZUludGVyYWN0aW9uTWVzc2FnZShzZXJ2ZXJzUmVxdWlyaW5nSW50ZXJhY3Rpb24pO1xuXG5cdFx0bWVzc2FnZUNvbnRhaW5lci5hcHBlbmRDaGlsZChpY29uKTtcblx0XHRtZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKG1lc3NhZ2VNZC5lbGVtZW50KTtcblxuXHRcdHRoaXMuaW50ZXJhY3Rpb25Db250YWluZXIuYXBwZW5kQ2hpbGQobWVzc2FnZUNvbnRhaW5lcik7XG5cdFx0dGhpcy5kb21Ob2RlLnByZXBlbmQodGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUludGVyYWN0aW9uUmVxdWlyZWQob2xkRWxlbWVudDogSFRNTEVsZW1lbnQsIHNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbjogQXJyYXk8eyBpZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBlcnJvck1lc3NhZ2U/OiBzdHJpbmcgfT4pOiB2b2lkIHtcblx0XHRjb25zdCB7IG1lc3NhZ2VNZCB9ID0gdGhpcy5jcmVhdGVJbnRlcmFjdGlvbk1lc3NhZ2Uoc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uKTtcblx0XHRvbGRFbGVtZW50LnJlcGxhY2VXaXRoKG1lc3NhZ2VNZC5lbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSW50ZXJhY3Rpb25NZXNzYWdlKHNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbjogQXJyYXk8eyBpZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBlcnJvck1lc3NhZ2U/OiBzdHJpbmcgfT4pIHtcblx0XHRjb25zdCBjb3VudCA9IHNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbi5sZW5ndGg7XG5cdFx0Y29uc3QgbGlua3MgPSB0aGlzLmNyZWF0ZVNlcnZlckNvbW1hbmRMaW5rcyhzZXJ2ZXJzUmVxdWlyaW5nSW50ZXJhY3Rpb24pO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGNvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdtY3Auc3RhcnQuc2luZ2xlJywgJ1RoZSBNQ1Agc2VydmVyIHswfSBtYXkgaGF2ZSBuZXcgdG9vbHMgYW5kIHJlcXVpcmVzIGludGVyYWN0aW9uIHRvIHN0YXJ0LiBbU3RhcnQgaXQgbm93P10oezF9KScsIGxpbmtzLCAnI3N0YXJ0Jylcblx0XHRcdDogbG9jYWxpemUoJ21jcC5zdGFydC5tdWx0aXBsZScsICdUaGUgTUNQIHNlcnZlcnMgezB9IG1heSBoYXZlIG5ldyB0b29scyBhbmQgcmVxdWlyZSBpbnRlcmFjdGlvbiB0byBzdGFydC4gW1N0YXJ0IHRoZW0gbm93P10oezF9KScsIGxpbmtzLCAnI3N0YXJ0Jyk7XG5cdFx0Y29uc3Qgc3RyID0gbmV3IE1hcmtkb3duU3RyaW5nKGNvbnRlbnQsIHsgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG1lc3NhZ2VNZCA9IHRoaXMuaW50ZXJhY3Rpb25NZC52YWx1ZSA9IHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihzdHIsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IChjb250ZW50KSA9PiB7XG5cdFx0XHRcdGlmICghY29udGVudC5zdGFydHNXaXRoKCdjb21tYW5kOicpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhcnQoc3RhcnRMaW5rISk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3BlbkxpbmtGcm9tTWFya2Rvd24odGhpcy5fb3BlbmVyU2VydmljZSwgY29udGVudCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzdGFydExpbmsgPSBbLi4ubWVzc2FnZU1kLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYScpXS5maW5kKGEgPT4gIWEuZ2V0QXR0cmlidXRlKCdkYXRhLWhyZWYnKT8uc3RhcnRzV2l0aCgnY29tbWFuZDonKSk7XG5cdFx0aWYgKCFzdGFydExpbmspIHtcblx0XHRcdC8vIFNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRyZXR1cm4geyBtZXNzYWdlTWQsIHN0YXJ0TGluazogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0c3RhcnRMaW5rLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRzdGFydExpbmsuaHJlZiA9ICcnO1xuXG5cdFx0cmV0dXJuIHsgbWVzc2FnZU1kLCBzdGFydExpbmsgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0KHN0YXJ0TGluazogSFRNTEVsZW1lbnQpIHtcblx0XHQvLyBVcGRhdGUgdG8gc3RhcnRpbmcgc3RhdGVcblx0XHRzdGFydExpbmsuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRzdGFydExpbmsuc3R5bGUub3BhY2l0eSA9ICcwLjcnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5kYXRhLnN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmRhdGEuc3RhdGUuZ2V0KCk7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzVG9TdGFydCA9IHN0YXRlLnNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbjtcblxuXHRcdFx0Ly8gU3RhcnQgc2VydmVycyBpbiBzZXF1ZW5jZSB3aXRoIHByb2dyZXNzIHVwZGF0ZXNcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2VydmVyc1RvU3RhcnQubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc2VydmVySW5mbyA9IHNlcnZlcnNUb1N0YXJ0W2ldO1xuXHRcdFx0XHRzdGFydExpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWNwLnN0YXJ0aW5nJywgXCJTdGFydGluZyB7MH0uLi5cIiwgc2VydmVySW5mby5sYWJlbCk7XG5cblx0XHRcdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gc2VydmVySW5mby5pZCk7XG5cdFx0XHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdFx0XHRhd2FpdCBzdGFydFNlcnZlckFuZFdhaXRGb3JMaXZlVG9vbHMoc2VydmVyLCB7IHByb21wdFR5cGU6ICdhbGwtdW50cnVzdGVkJyB9KTtcblxuXHRcdFx0XHRcdHRoaXMuZGF0YS5kaWRTdGFydFNlcnZlcklkcyA/Pz0gW107XG5cdFx0XHRcdFx0dGhpcy5kYXRhLmRpZFN0YXJ0U2VydmVySWRzLnB1c2goc2VydmVySW5mby5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBpbnRlcmFjdGlvbiBjb250YWluZXIgYWZ0ZXIgc3VjY2Vzc2Z1bCBzdGFydFxuXHRcdFx0aWYgKHRoaXMuaW50ZXJhY3Rpb25Db250YWluZXIpIHtcblx0XHRcdFx0dGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gUmVzZXQgbGluayBvbiBlcnJvclxuXHRcdFx0c3RhcnRMaW5rLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJztcblx0XHRcdHN0YXJ0TGluay5zdHlsZS5vcGFjaXR5ID0gJyc7XG5cdFx0XHRzdGFydExpbmsudGV4dENvbnRlbnQgPSAnU3RhcnQgbm93Pyc7XG5cdFx0fVxuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gU2ltcGxlIGltcGxlbWVudGF0aW9uIHRoYXQgY2hlY2tzIGlmIGl0J3MgdGhlIHNhbWUgdHlwZVxuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAnbWNwU2VydmVyc1N0YXJ0aW5nJztcblx0fVxuXG5cdGFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFl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
