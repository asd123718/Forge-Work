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
import "./media/chatExtensionsContent.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ExtensionsList, getExtensions } from "../../../../extensions/browser/extensionsViewer.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { ChatViewId } from "../../chat.js";
import { PagedModel } from "../../../../../../base/common/paging.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
let ChatExtensionsContentPart = class extends Disposable {
  constructor(extensionsContent, extensionsWorkbenchService, instantiationService) {
    super();
    this.extensionsContent = extensionsContent;
    this.domNode = dom.$(".chat-extensions-content-part");
    const loadingElement = dom.append(this.domNode, dom.$(".loading-extensions-element"));
    dom.append(loadingElement, dom.$(ThemeIcon.asCSSSelector(ThemeIcon.modify(Codicon.loading, "spin"))), dom.$("span.loading-message", void 0, localize("chat.extensions.loading", "Loading extensions...")));
    const extensionsList = dom.append(this.domNode, dom.$(".extensions-list"));
    const list = this._register(instantiationService.createInstance(ExtensionsList, extensionsList, ChatViewId, { alwaysConsumeMouseWheel: false }, { onFocus: Event.None, onBlur: Event.None, filters: {} }));
    getExtensions(extensionsContent.extensions, extensionsWorkbenchService).then((extensions) => {
      loadingElement.remove();
      if (this._store.isDisposed) {
        return;
      }
      list.setModel(new PagedModel(extensions));
      list.layout();
    });
  }
  get codeblocks() {
    return [];
  }
  get codeblocksPartId() {
    return void 0;
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "extensions" && other.extensions.length === this.extensionsContent.extensions.length && other.extensions.every((ext) => this.extensionsContent.extensions.includes(ext));
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatExtensionsContentPart = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IInstantiationService)
], ChatExtensionsContentPart);
export {
  ChatExtensionsContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdEV4dGVuc2lvbnNDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0RXh0ZW5zaW9uc0NvbnRlbnQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zTGlzdCwgZ2V0RXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zVmlld2VyLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRFeHRlbnNpb25zQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgQ2hhdFZpZXdJZCwgSUNoYXRDb2RlQmxvY2tJbmZvIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IFBhZ2VkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHVibGljIGdldCBjb2RlYmxvY2tzKCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3NQYXJ0SWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zQ29udGVudDogSUNoYXRFeHRlbnNpb25zQ29udGVudCxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5jaGF0LWV4dGVuc2lvbnMtY29udGVudC1wYXJ0Jyk7XG5cdFx0Y29uc3QgbG9hZGluZ0VsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5sb2FkaW5nLWV4dGVuc2lvbnMtZWxlbWVudCcpKTtcblx0XHRkb20uYXBwZW5kKGxvYWRpbmdFbGVtZW50LCBkb20uJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSkpLCBkb20uJCgnc3Bhbi5sb2FkaW5nLW1lc3NhZ2UnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0LmV4dGVuc2lvbnMubG9hZGluZycsICdMb2FkaW5nIGV4dGVuc2lvbnMuLi4nKSkpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0xpc3QgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5leHRlbnNpb25zLWxpc3QnKSk7XG5cdFx0Y29uc3QgbGlzdCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNMaXN0LCBleHRlbnNpb25zTGlzdCwgQ2hhdFZpZXdJZCwgeyBhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UgfSwgeyBvbkZvY3VzOiBFdmVudC5Ob25lLCBvbkJsdXI6IEV2ZW50Lk5vbmUsIGZpbHRlcnM6IHt9IH0pKTtcblx0XHRnZXRFeHRlbnNpb25zKGV4dGVuc2lvbnNDb250ZW50LmV4dGVuc2lvbnMsIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS50aGVuKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0bG9hZGluZ0VsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsaXN0LnNldE1vZGVsKG5ldyBQYWdlZE1vZGVsKGV4dGVuc2lvbnMpKTtcblx0XHRcdGxpc3QubGF5b3V0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIGZvbGxvd2luZ0NvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAnZXh0ZW5zaW9ucycgJiYgb3RoZXIuZXh0ZW5zaW9ucy5sZW5ndGggPT09IHRoaXMuZXh0ZW5zaW9uc0NvbnRlbnQuZXh0ZW5zaW9ucy5sZW5ndGggJiYgb3RoZXIuZXh0ZW5zaW9ucy5ldmVyeShleHQgPT4gdGhpcy5leHRlbnNpb25zQ29udGVudC5leHRlbnNpb25zLmluY2x1ZGVzKGV4dCkpO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCLHFCQUFxQjtBQUM5QyxTQUFTLG1DQUFtQztBQUc1QyxTQUF1QixrQkFBc0M7QUFFN0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBRWxCLElBQU0sNEJBQU4sY0FBd0MsV0FBdUM7QUFBQSxFQVdyRixZQUNrQixtQkFDWSw0QkFDTixzQkFDdEI7QUFDRCxVQUFNO0FBSlc7QUFNakIsU0FBSyxVQUFVLElBQUksRUFBRSwrQkFBK0I7QUFDcEQsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsNkJBQTZCLENBQUM7QUFDcEYsUUFBSSxPQUFPLGdCQUFnQixJQUFJLEVBQUUsVUFBVSxjQUFjLFVBQVUsT0FBTyxRQUFRLFNBQVMsTUFBTSxDQUFDLENBQUMsR0FBRyxJQUFJLEVBQUUsd0JBQXdCLFFBQVcsU0FBUywyQkFBMkIsdUJBQXVCLENBQUMsQ0FBQztBQUU1TSxVQUFNLGlCQUFpQixJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksRUFBRSxrQkFBa0IsQ0FBQztBQUN6RSxVQUFNLE9BQU8sS0FBSyxVQUFVLHFCQUFxQixlQUFlLGdCQUFnQixnQkFBZ0IsWUFBWSxFQUFFLHlCQUF5QixNQUFNLEdBQUcsRUFBRSxTQUFTLE1BQU0sTUFBTSxRQUFRLE1BQU0sTUFBTSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDek0sa0JBQWMsa0JBQWtCLFlBQVksMEJBQTBCLEVBQUUsS0FBSyxnQkFBYztBQUMxRixxQkFBZSxPQUFPO0FBQ3RCLFVBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxNQUNEO0FBQ0EsV0FBSyxTQUFTLElBQUksV0FBVyxVQUFVLENBQUM7QUFDeEMsV0FBSyxPQUFPO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBN0JBLElBQVcsYUFBbUM7QUFDN0MsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRUEsSUFBVyxtQkFBdUM7QUFDakQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQXlCQSxlQUFlLE9BQTZCLGtCQUEwQyxTQUFnQztBQUNySCxXQUFPLE1BQU0sU0FBUyxnQkFBZ0IsTUFBTSxXQUFXLFdBQVcsS0FBSyxrQkFBa0IsV0FBVyxVQUFVLE1BQU0sV0FBVyxNQUFNLFNBQU8sS0FBSyxrQkFBa0IsV0FBVyxTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQzVMO0FBQUEsRUFFQSxjQUFjLFlBQStCO0FBQzVDLFNBQUssVUFBVSxVQUFVO0FBQUEsRUFDMUI7QUFDRDtBQXpDYSw0QkFBTjtBQUFBLEVBYUo7QUFBQSxFQUNBO0FBQUEsR0FkVTsiLAogICJuYW1lcyI6IFtdCn0K
