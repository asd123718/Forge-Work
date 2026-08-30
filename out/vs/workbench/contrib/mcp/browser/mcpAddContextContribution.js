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
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IChatContextPickService } from "../../chat/browser/attachments/chatContextPickService.js";
import { IMcpService, McpCapability } from "../common/mcpTypes.js";
import { McpResourcePickHelper } from "./mcpResourceQuickAccess.js";
let McpAddContextContribution = class extends Disposable {
  constructor(_chatContextPickService, _instantiationService, mcpService) {
    super();
    this._chatContextPickService = _chatContextPickService;
    this._instantiationService = _instantiationService;
    this._addContextMenu = this._register(new MutableDisposable());
    const hasServersWithResources = derived((reader) => {
      let enabled = false;
      for (const server of mcpService.servers.read(reader)) {
        const cap = server.capabilities.read(void 0);
        if (cap === void 0) {
          enabled = true;
        } else if (cap & McpCapability.Resources) {
          enabled = true;
          break;
        }
      }
      return enabled;
    });
    this._register(autorun((reader) => {
      const enabled = hasServersWithResources.read(reader);
      if (enabled && !this._addContextMenu.value) {
        this._registerAddContextMenu();
      } else {
        this._addContextMenu.clear();
      }
    }));
  }
  _registerAddContextMenu() {
    this._addContextMenu.value = this._chatContextPickService.registerChatContextItem({
      type: "pickerPick",
      label: localize("mcp.addContext", "MCP Resources..."),
      icon: Codicon.mcp,
      isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsMCPAttachments;
      },
      asPicker: () => {
        const helper = this._instantiationService.createInstance(McpResourcePickHelper);
        return {
          placeholder: localize("mcp.addContext.placeholder", "Select MCP Resource..."),
          picks: (_query, token) => this._getResourcePicks(token, helper),
          goBack: () => {
            return helper.navigateBack();
          },
          dispose: () => {
            helper.dispose();
          }
        };
      }
    });
  }
  _getResourcePicks(token, helper) {
    const picksObservable = helper.getPicks(token);
    return derived(this, (reader) => {
      const pickItems = picksObservable.read(reader);
      const picks = [];
      for (const [server, resources] of pickItems.picks) {
        if (resources.length === 0) {
          continue;
        }
        picks.push(McpResourcePickHelper.sep(server));
        for (const resource of resources) {
          picks.push({
            ...McpResourcePickHelper.item(resource),
            asAttachment: () => helper.toAttachment(resource, server)
          });
        }
      }
      return { picks, busy: pickItems.isBusy };
    });
  }
};
McpAddContextContribution = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IMcpService)
], McpAddContextContribution);
export {
  McpAddContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwQWRkQ29udGV4dENvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFBpY2ssIElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRDb250ZXh0UGlja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZpY2UsIE1jcENhcGFiaWxpdHkgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTWNwUmVzb3VyY2VQaWNrSGVscGVyIH0gZnJvbSAnLi9tY3BSZXNvdXJjZVF1aWNrQWNjZXNzLmpzJztcblxuZXhwb3J0IGNsYXNzIE1jcEFkZENvbnRleHRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FkZENvbnRleHRNZW51ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRDb250ZXh0UGlja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdENvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaGFzU2VydmVyc1dpdGhSZXNvdXJjZXMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRsZXQgZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgbWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRjb25zdCBjYXAgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKGNhcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZW5hYmxlZCA9IHRydWU7IC8vIHVudGlsIHdlIGtub3cgbW9yZVxuXHRcdFx0XHR9IGVsc2UgaWYgKGNhcCAmIE1jcENhcGFiaWxpdHkuUmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0ZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGVuYWJsZWQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gaGFzU2VydmVyc1dpdGhSZXNvdXJjZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGVuYWJsZWQgJiYgIXRoaXMuX2FkZENvbnRleHRNZW51LnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyQWRkQ29udGV4dE1lbnUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2FkZENvbnRleHRNZW51LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBZGRDb250ZXh0TWVudSgpIHtcblx0XHR0aGlzLl9hZGRDb250ZXh0TWVudS52YWx1ZSA9IHRoaXMuX2NoYXRDb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oe1xuXHRcdFx0dHlwZTogJ3BpY2tlclBpY2snLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuYWRkQ29udGV4dCcsIFwiTUNQIFJlc291cmNlcy4uLlwiKSxcblx0XHRcdGljb246IENvZGljb24ubWNwLFxuXHRcdFx0aXNFbmFibGVkKHdpZGdldCkge1xuXHRcdFx0XHRyZXR1cm4gISF3aWRnZXQuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c01DUEF0dGFjaG1lbnRzO1xuXHRcdFx0fSxcblx0XHRcdGFzUGlja2VyOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhlbHBlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFJlc291cmNlUGlja0hlbHBlcik7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtY3AuYWRkQ29udGV4dC5wbGFjZWhvbGRlcicsIFwiU2VsZWN0IE1DUCBSZXNvdXJjZS4uLlwiKSxcblx0XHRcdFx0XHRwaWNrczogKF9xdWVyeSwgdG9rZW4pID0+IHRoaXMuX2dldFJlc291cmNlUGlja3ModG9rZW4sIGhlbHBlciksXG5cdFx0XHRcdFx0Z29CYWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaGVscGVyLm5hdmlnYXRlQmFjaygpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0aGVscGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVzb3VyY2VQaWNrcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGhlbHBlcjogTWNwUmVzb3VyY2VQaWNrSGVscGVyKSB7XG5cdFx0Y29uc3QgcGlja3NPYnNlcnZhYmxlID0gaGVscGVyLmdldFBpY2tzKHRva2VuKTtcblxuXHRcdHJldHVybiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cblx0XHRcdGNvbnN0IHBpY2tJdGVtcyA9IHBpY2tzT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBwaWNrczogQ2hhdENvbnRleHRQaWNrW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBbc2VydmVyLCByZXNvdXJjZXNdIG9mIHBpY2tJdGVtcy5waWNrcykge1xuXHRcdFx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2tzLnB1c2goTWNwUmVzb3VyY2VQaWNrSGVscGVyLnNlcChzZXJ2ZXIpKTtcblx0XHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRcdC4uLk1jcFJlc291cmNlUGlja0hlbHBlci5pdGVtKHJlc291cmNlKSxcblx0XHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCkgPT4gaGVscGVyLnRvQXR0YWNobWVudChyZXNvdXJjZSwgc2VydmVyKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBwaWNrcywgYnVzeTogcGlja0l0ZW1zLmlzQnVzeSB9O1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQTBCLCtCQUErQjtBQUN6RCxTQUFTLGFBQWEscUJBQXFCO0FBQzNDLFNBQVMsNkJBQTZCO0FBRS9CLElBQU0sNEJBQU4sY0FBd0MsV0FBNkM7QUFBQSxFQUUzRixZQUMyQyx5QkFDRix1QkFDM0IsWUFDWjtBQUNELFVBQU07QUFKb0M7QUFDRjtBQUh6QyxTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFReEUsVUFBTSwwQkFBMEIsUUFBUSxZQUFVO0FBQ2pELFVBQUksVUFBVTtBQUNkLGlCQUFXLFVBQVUsV0FBVyxRQUFRLEtBQUssTUFBTSxHQUFHO0FBQ3JELGNBQU0sTUFBTSxPQUFPLGFBQWEsS0FBSyxNQUFTO0FBQzlDLFlBQUksUUFBUSxRQUFXO0FBQ3RCLG9CQUFVO0FBQUEsUUFDWCxXQUFXLE1BQU0sY0FBYyxXQUFXO0FBQ3pDLG9CQUFVO0FBQ1Y7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sVUFBVSx3QkFBd0IsS0FBSyxNQUFNO0FBQ25ELFVBQUksV0FBVyxDQUFDLEtBQUssZ0JBQWdCLE9BQU87QUFDM0MsYUFBSyx3QkFBd0I7QUFBQSxNQUM5QixPQUFPO0FBQ04sYUFBSyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSwwQkFBMEI7QUFDakMsU0FBSyxnQkFBZ0IsUUFBUSxLQUFLLHdCQUF3Qix3QkFBd0I7QUFBQSxNQUNqRixNQUFNO0FBQUEsTUFDTixPQUFPLFNBQVMsa0JBQWtCLGtCQUFrQjtBQUFBLE1BQ3BELE1BQU0sUUFBUTtBQUFBLE1BQ2QsVUFBVSxRQUFRO0FBQ2pCLGVBQU8sQ0FBQyxDQUFDLE9BQU8sdUJBQXVCO0FBQUEsTUFDeEM7QUFBQSxNQUNBLFVBQVUsTUFBTTtBQUNmLGNBQU0sU0FBUyxLQUFLLHNCQUFzQixlQUFlLHFCQUFxQjtBQUM5RSxlQUFPO0FBQUEsVUFDTixhQUFhLFNBQVMsOEJBQThCLHdCQUF3QjtBQUFBLFVBQzVFLE9BQU8sQ0FBQyxRQUFRLFVBQVUsS0FBSyxrQkFBa0IsT0FBTyxNQUFNO0FBQUEsVUFDOUQsUUFBUSxNQUFNO0FBQ2IsbUJBQU8sT0FBTyxhQUFhO0FBQUEsVUFDNUI7QUFBQSxVQUNBLFNBQVMsTUFBTTtBQUNkLG1CQUFPLFFBQVE7QUFBQSxVQUNoQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsa0JBQWtCLE9BQTBCLFFBQStCO0FBQ2xGLFVBQU0sa0JBQWtCLE9BQU8sU0FBUyxLQUFLO0FBRTdDLFdBQU8sUUFBUSxNQUFNLFlBQVU7QUFFOUIsWUFBTSxZQUFZLGdCQUFnQixLQUFLLE1BQU07QUFDN0MsWUFBTSxRQUEyQixDQUFDO0FBRWxDLGlCQUFXLENBQUMsUUFBUSxTQUFTLEtBQUssVUFBVSxPQUFPO0FBQ2xELFlBQUksVUFBVSxXQUFXLEdBQUc7QUFDM0I7QUFBQSxRQUNEO0FBQ0EsY0FBTSxLQUFLLHNCQUFzQixJQUFJLE1BQU0sQ0FBQztBQUM1QyxtQkFBVyxZQUFZLFdBQVc7QUFDakMsZ0JBQU0sS0FBSztBQUFBLFlBQ1YsR0FBRyxzQkFBc0IsS0FBSyxRQUFRO0FBQUEsWUFDdEMsY0FBYyxNQUFNLE9BQU8sYUFBYSxVQUFVLE1BQU07QUFBQSxVQUN6RCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEVBQUUsT0FBTyxNQUFNLFVBQVUsT0FBTztBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFqRmEsNEJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
