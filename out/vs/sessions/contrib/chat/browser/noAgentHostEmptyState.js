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
import "./media/noAgentHostEmptyState.css";
import * as dom from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isMobile } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
const $ = dom.$;
const LEARN_MORE_URL = "https://aka.ms/VSCode/Agents/docs";
let NoAgentHostEmptyState = class extends Disposable {
  constructor(_openerService, _productService) {
    super();
    this._openerService = _openerService;
    this._productService = _productService;
  }
  render(parent) {
    this._root = dom.append(parent, $(".no-agent-host-empty-state"));
    this._root.setAttribute("role", "group");
    this._root.setAttribute("aria-label", localize("noAgentHost.aria", "No agent hosts available"));
    this._root.tabIndex = -1;
    if (!isMobile) {
      const iconWrap = dom.append(this._root, $(".no-agent-host-icon"));
      iconWrap.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
    }
    const heading = dom.append(this._root, $("h2.no-agent-host-title"));
    heading.textContent = localize("noAgentHost.title", "Connect a host to get started");
    const cliBinary = this._productService.quality === "stable" ? "code" : "code-insiders";
    const command = `${cliBinary} tunnel`;
    const description = dom.append(this._root, $("p.no-agent-host-description"));
    renderFormattedText(
      localize(
        "noAgentHost.description",
        "Run ``{0}`` from any device, then return here to run agent tasks on it.",
        command
      ),
      { renderCodeSegments: true },
      description
    );
    description.appendChild(document.createTextNode(" "));
    const learnMore = dom.append(description, $("a.no-agent-host-link"));
    learnMore.textContent = localize("noAgentHost.learnMore", "Learn more");
    learnMore.href = LEARN_MORE_URL;
    this._register(dom.addDisposableListener(learnMore, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      this._openerService.open(URI.parse(LEARN_MORE_URL));
    }));
  }
  focus() {
    this._root?.focus();
  }
  dispose() {
    this._root?.remove();
    this._root = void 0;
    super.dispose();
  }
};
NoAgentHostEmptyState = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IProductService)
], NoAgentHostEmptyState);
export {
  NoAgentHostEmptyState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcbm9BZ2VudEhvc3RFbXB0eVN0YXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL25vQWdlbnRIb3N0RW1wdHlTdGF0ZS5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyRm9ybWF0dGVkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNb2JpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgTEVBUk5fTU9SRV9VUkwgPSAnaHR0cHM6Ly9ha2EubXMvVlNDb2RlL0FnZW50cy9kb2NzJztcblxuLyoqXG4gKiBFbXB0eSBzdGF0ZSBzaG93biBpbiB0aGUgbmV3LXNlc3Npb24gdmlldyB3aGVuIHRoZSBhZ2VudHMgd2luZG93IGlzXG4gKiBvcGVuIG9uIHdlYiAodnNjb2RlLmRldiAvIGluc2lkZXJzLnZzY29kZS5kZXYpIGFuZCBubyBhZ2VudCBob3N0cyBoYXZlXG4gKiBiZWVuIGRpc2NvdmVyZWQuIFJlcGxhY2VzIHRoZSB3b3Jrc3BhY2UgcGlja2VyIFx1MjAxNCB3aGljaCBjYW4ndCBzdXJmYWNlXG4gKiBhbnkgdXNlZnVsIGl0ZW1zIHdpdGhvdXQgYSBob3N0IFx1MjAxNCB3aXRoIGEgaGVhZGluZywgYSBkZXNjcmlwdGlvbiB0aGF0XG4gKiB0ZWxscyB0aGUgdXNlciBob3cgdG8gYnJpbmcgYSBob3N0IG9ubGluZSB3aXRoIHRoZSBWUyBDb2RlIENMSSwgYW5kXG4gKiBhIFwiTGVhcm4gbW9yZVwiIGxpbmsgdG8gdGhlIGRvY3MuXG4gKi9cbmV4cG9ydCBjbGFzcyBOb0FnZW50SG9zdEVtcHR5U3RhdGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9yb290OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290ID0gZG9tLmFwcGVuZChwYXJlbnQsICQoJy5uby1hZ2VudC1ob3N0LWVtcHR5LXN0YXRlJykpO1xuXHRcdHRoaXMuX3Jvb3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ2dyb3VwJyk7XG5cdFx0dGhpcy5fcm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbm9BZ2VudEhvc3QuYXJpYScsIFwiTm8gYWdlbnQgaG9zdHMgYXZhaWxhYmxlXCIpKTtcblx0XHQvLyBNYWtlIHRoZSByb290IHByb2dyYW1tYXRpY2FsbHkgZm9jdXNhYmxlIHNvIHNjcmVlbiByZWFkZXJzIGxhbmRcblx0XHQvLyBvbiB0aGUgaGVhZGluZyB3aGVuIHRoZSBjaGF0IGlucHV0IFx1MjAxNCB3aGljaCB3b3VsZCBub3JtYWxseSB0YWtlXG5cdFx0Ly8gZm9jdXMgb24gdmlldyBtb3VudCBcdTIwMTQgaXMgaGlkZGVuIGJ5IHRoZSBgLm5vLWFnZW50LWhvc3RgIGNsYXNzLlxuXHRcdHRoaXMuX3Jvb3QudGFiSW5kZXggPSAtMTtcblxuXHRcdC8vIC0tLSBIZXJvIGljb24gKHNraXBwZWQgb24gcGhvbmUtbGF5b3V0IHZpZXdwb3J0cyBmb3IgdmVydGljYWwgcm9vbSlcblx0XHRpZiAoIWlzTW9iaWxlKSB7XG5cdFx0XHRjb25zdCBpY29uV3JhcCA9IGRvbS5hcHBlbmQodGhpcy5fcm9vdCwgJCgnLm5vLWFnZW50LWhvc3QtaWNvbicpKTtcblx0XHRcdGljb25XcmFwLmFwcGVuZCguLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJCgke0NvZGljb24ucmVtb3RlLmlkfSlgKSk7XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIEhlYWRpbmcgKyBkZXNjcmlwdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRjb25zdCBoZWFkaW5nID0gZG9tLmFwcGVuZCh0aGlzLl9yb290LCAkKCdoMi5uby1hZ2VudC1ob3N0LXRpdGxlJykpO1xuXHRcdGhlYWRpbmcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9BZ2VudEhvc3QudGl0bGUnLCBcIkNvbm5lY3QgYSBob3N0IHRvIGdldCBzdGFydGVkXCIpO1xuXG5cdFx0Ly8gUGljayB0aGUgbWF0Y2hpbmcgQ0xJIGJpbmFyeSBmb3IgdGhlIGNoYW5uZWwgdGhlIHVzZXIgaXMgb24gc28gdGhlXG5cdFx0Ly8gY29tbWFuZCB0aGV5IGNvcHkgYWN0dWFsbHkgZXhpc3RzIG9uIHRoZWlyIG1hY2hpbmU6IGBjb2RlYCBmb3Jcblx0XHQvLyBzdGFibGUsIGBjb2RlLWluc2lkZXJzYCBmb3IgYW55IG5vbi1zdGFibGUgY2hhbm5lbCAoaW5zaWRlciAvXG5cdFx0Ly8gZXhwbG9yYXRpb24gLyBkZXYpLiBUaGUgYWdlbnRzIHdpbmRvdyBkb2VzIG5vdCBzaGlwIGl0cyBvd24gQ0xJIFx1MjAxNFxuXHRcdC8vIGl0IHJlbGllcyBvbiB0aGUgcmVndWxhciBWUyBDb2RlIENMSSB0byBleHBvc2UgdGhlIGFnZW50IGhvc3QuXG5cdFx0Y29uc3QgY2xpQmluYXJ5ID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAnY29kZScgOiAnY29kZS1pbnNpZGVycyc7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGAke2NsaUJpbmFyeX0gdHVubmVsYDtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZG9tLmFwcGVuZCh0aGlzLl9yb290LCAkKCdwLm5vLWFnZW50LWhvc3QtZGVzY3JpcHRpb24nKSk7XG5cdFx0cmVuZGVyRm9ybWF0dGVkVGV4dChcblx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHQnbm9BZ2VudEhvc3QuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcIlJ1biBgYHswfWBgIGZyb20gYW55IGRldmljZSwgdGhlbiByZXR1cm4gaGVyZSB0byBydW4gYWdlbnQgdGFza3Mgb24gaXQuXCIsXG5cdFx0XHRcdGNvbW1hbmRcblx0XHRcdCksXG5cdFx0XHR7IHJlbmRlckNvZGVTZWdtZW50czogdHJ1ZSB9LFxuXHRcdFx0ZGVzY3JpcHRpb25cblx0XHQpO1xuXHRcdGRlc2NyaXB0aW9uLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcgJykpO1xuXHRcdGNvbnN0IGxlYXJuTW9yZSA9IGRvbS5hcHBlbmQoZGVzY3JpcHRpb24sICQoJ2Eubm8tYWdlbnQtaG9zdC1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdGxlYXJuTW9yZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub0FnZW50SG9zdC5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmVcIik7XG5cdFx0bGVhcm5Nb3JlLmhyZWYgPSBMRUFSTl9NT1JFX1VSTDtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxlYXJuTW9yZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKExFQVJOX01PUkVfVVJMKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdD8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5fcm9vdCA9IHVuZGVmaW5lZDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sSUFBSSxJQUFJO0FBRWQsTUFBTSxpQkFBaUI7QUFVaEIsSUFBTSx3QkFBTixjQUFvQyxXQUFXO0FBQUEsRUFJckQsWUFDa0MsZ0JBQ0MsaUJBQ2pDO0FBQ0QsVUFBTTtBQUgyQjtBQUNDO0FBQUEsRUFHbkM7QUFBQSxFQUVBLE9BQU8sUUFBMkI7QUFDakMsU0FBSyxRQUFRLElBQUksT0FBTyxRQUFRLEVBQUUsNEJBQTRCLENBQUM7QUFDL0QsU0FBSyxNQUFNLGFBQWEsUUFBUSxPQUFPO0FBQ3ZDLFNBQUssTUFBTSxhQUFhLGNBQWMsU0FBUyxvQkFBb0IsMEJBQTBCLENBQUM7QUFJOUYsU0FBSyxNQUFNLFdBQVc7QUFHdEIsUUFBSSxDQUFDLFVBQVU7QUFDZCxZQUFNLFdBQVcsSUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLHFCQUFxQixDQUFDO0FBQ2hFLGVBQVMsT0FBTyxHQUFHLHFCQUFxQixLQUFLLFFBQVEsT0FBTyxFQUFFLEdBQUcsQ0FBQztBQUFBLElBQ25FO0FBR0EsVUFBTSxVQUFVLElBQUksT0FBTyxLQUFLLE9BQU8sRUFBRSx3QkFBd0IsQ0FBQztBQUNsRSxZQUFRLGNBQWMsU0FBUyxxQkFBcUIsK0JBQStCO0FBT25GLFVBQU0sWUFBWSxLQUFLLGdCQUFnQixZQUFZLFdBQVcsU0FBUztBQUN2RSxVQUFNLFVBQVUsR0FBRyxTQUFTO0FBRTVCLFVBQU0sY0FBYyxJQUFJLE9BQU8sS0FBSyxPQUFPLEVBQUUsNkJBQTZCLENBQUM7QUFDM0U7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsRUFBRSxvQkFBb0IsS0FBSztBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUNBLGdCQUFZLFlBQVksU0FBUyxlQUFlLEdBQUcsQ0FBQztBQUNwRCxVQUFNLFlBQVksSUFBSSxPQUFPLGFBQWEsRUFBRSxzQkFBc0IsQ0FBQztBQUNuRSxjQUFVLGNBQWMsU0FBUyx5QkFBeUIsWUFBWTtBQUN0RSxjQUFVLE9BQU87QUFDakIsU0FBSyxVQUFVLElBQUksc0JBQXNCLFdBQVcsSUFBSSxVQUFVLE9BQU8sT0FBSztBQUM3RSxRQUFFLGVBQWU7QUFDakIsV0FBSyxlQUFlLEtBQUssSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUFBLElBQ25ELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLE9BQU8sTUFBTTtBQUFBLEVBQ25CO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLE9BQU8sT0FBTztBQUNuQixTQUFLLFFBQVE7QUFDYixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFuRWEsd0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
