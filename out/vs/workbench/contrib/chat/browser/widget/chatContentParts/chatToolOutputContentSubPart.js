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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { CodeBlockPart } from "./codeBlockPart.js";
import { ChatResourceGroupWidget } from "./chatResourceGroupWidget.js";
let ChatToolOutputContentSubPart = class extends Disposable {
  constructor(context, parts, _instantiationService, contextKeyService, _markdownRendererService) {
    super();
    this.context = context;
    this.parts = parts;
    this._instantiationService = _instantiationService;
    this.contextKeyService = contextKeyService;
    this._markdownRendererService = _markdownRendererService;
    this._editorReferences = [];
    this.codeblocks = [];
    this.domNode = this.createOutputContents();
  }
  toMdString(value) {
    if (typeof value === "string") {
      return new MarkdownString("").appendText(value);
    }
    return new MarkdownString(value.value, { isTrusted: value.isTrusted });
  }
  createOutputContents() {
    const container = dom.$("div");
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      if (part.kind === "code") {
        const codeParts = [part];
        while (i + 1 < this.parts.length) {
          const nextPart = this.parts[i + 1];
          if (nextPart.kind !== "code" || nextPart.title) {
            break;
          }
          codeParts.push(nextPart);
          i++;
        }
        this.addCodeBlock(codeParts, container);
        continue;
      }
      const group = [];
      for (let k = i; k < this.parts.length; k++) {
        const part2 = this.parts[k];
        if (part2.kind !== "data") {
          break;
        }
        group.push(part2);
      }
      this.addResourceGroup(group, container);
      i += group.length - 1;
    }
    return container;
  }
  addResourceGroup(parts, container) {
    const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, parts));
    container.appendChild(widget.domNode);
  }
  addCodeBlock(parts, container) {
    const firstPart = parts[0];
    if (firstPart.title) {
      const title = dom.$("div.chat-confirmation-widget-title");
      const renderedTitle = this._register(this._markdownRendererService.render(this.toMdString(firstPart.title)));
      title.appendChild(renderedTitle.element);
      container.appendChild(title);
    }
    const combinedText = parts.map((p) => p.data).join("\n");
    const data = {
      languageId: firstPart.languageId,
      text: combinedText,
      codeBlockIndex: firstPart.codeBlockIndex,
      element: this.context.element,
      parentContextKeyService: this.contextKeyService,
      renderOptions: firstPart.options,
      chatSessionResource: this.context.element.sessionResource
    };
    const key = CodeBlockPart.poolKey(this.context.element.id, firstPart.codeBlockIndex);
    const editorReference = this._register(this.context.editorPool.get(key));
    editorReference.object.render(data, this.context.currentWidth.get());
    container.appendChild(editorReference.object.element);
    this._editorReferences.push(editorReference);
    this.codeblocks.push({
      ownerMarkdownPartId: firstPart.ownerMarkdownPartId,
      codeBlockIndex: firstPart.codeBlockIndex,
      elementId: this.context.element.id,
      uri: editorReference.object.uri,
      codemapperUri: void 0,
      chatSessionResource: this.context.element.sessionResource,
      focus: () => {
      }
    });
  }
  layout(width) {
    this._editorReferences.forEach((r) => r.object.layout(width));
  }
};
ChatToolOutputContentSubPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMarkdownRendererService)
], ChatToolOutputContentSubPart);
export {
  ChatToolOutputContentSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDb2RlQmxvY2tQYXJ0LCBJQ29kZUJsb2NrRGF0YSB9IGZyb20gJy4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4vY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUlPUGFydCwgSUNoYXRDb2xsYXBzaWJsZUlPQ29kZVBhcnQsIElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc291cmNlR3JvdXBXaWRnZXQgfSBmcm9tICcuL2NoYXRSZXNvdXJjZUdyb3VwV2lkZ2V0LmpzJztcblxuLyoqXG4gKiBBIHJldXNhYmxlIGNvbXBvbmVudCBmb3IgcmVuZGVyaW5nIHRvb2wgb3V0cHV0IGNvbnNpc3Rpbmcgb2YgY29kZSBibG9ja3MgYW5kL29yIHJlc291cmNlcy5cbiAqIFRoaXMgaXMgdXNlZCBieSBib3RoIENoYXRDb2xsYXBzaWJsZUlucHV0T3V0cHV0Q29udGVudFBhcnQgYW5kIENoYXRUb29sUG9zdEV4ZWN1dGVDb25maXJtYXRpb25QYXJ0LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JSZWZlcmVuY2VzOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0PltdID0gW107XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29kZWJsb2NrczogSUNoYXRDb2RlQmxvY2tJbmZvW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFydHM6IENoYXRDb2xsYXBzaWJsZUlPUGFydFtdLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5jcmVhdGVPdXRwdXRDb250ZW50cygpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b01kU3RyaW5nKHZhbHVlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiBNYXJrZG93blN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoJycpLmFwcGVuZFRleHQodmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKHZhbHVlLnZhbHVlLCB7IGlzVHJ1c3RlZDogdmFsdWUuaXNUcnVzdGVkIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVPdXRwdXRDb250ZW50cygpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJ2RpdicpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnBhcnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5wYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdjb2RlJykge1xuXHRcdFx0XHQvLyBDb2xsZWN0IGFkamFjZW50IGNvZGUgcGFydHMgYW5kIGNvbWJpbmUgdGhlaXIgY29udGVudHNcblx0XHRcdFx0Y29uc3QgY29kZVBhcnRzID0gW3BhcnRdO1xuXHRcdFx0XHR3aGlsZSAoaSArIDEgPCB0aGlzLnBhcnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IG5leHRQYXJ0ID0gdGhpcy5wYXJ0c1tpICsgMV07XG5cdFx0XHRcdFx0aWYgKG5leHRQYXJ0LmtpbmQgIT09ICdjb2RlJyB8fCBuZXh0UGFydC50aXRsZSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvZGVQYXJ0cy5wdXNoKG5leHRQYXJ0KTtcblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hZGRDb2RlQmxvY2soY29kZVBhcnRzLCBjb250YWluZXIpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3JvdXA6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0W10gPSBbXTtcblx0XHRcdGZvciAobGV0IGsgPSBpOyBrIDwgdGhpcy5wYXJ0cy5sZW5ndGg7IGsrKykge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5wYXJ0c1trXTtcblx0XHRcdFx0aWYgKHBhcnQua2luZCAhPT0gJ2RhdGEnKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXAucHVzaChwYXJ0KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5hZGRSZXNvdXJjZUdyb3VwKGdyb3VwLCBjb250YWluZXIpO1xuXHRcdFx0aSArPSBncm91cC5sZW5ndGggLSAxOyAvLyBTa2lwIHRoZSBwYXJ0cyB3ZSBqdXN0IGFkZGVkXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgYWRkUmVzb3VyY2VHcm91cChwYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXNvdXJjZUdyb3VwV2lkZ2V0LCBwYXJ0cykpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZENvZGVCbG9jayhwYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPQ29kZVBhcnRbXSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGZpcnN0UGFydCA9IHBhcnRzWzBdO1xuXHRcdGlmIChmaXJzdFBhcnQudGl0bGUpIHtcblx0XHRcdGNvbnN0IHRpdGxlID0gZG9tLiQoJ2Rpdi5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtdGl0bGUnKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkVGl0bGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIodGhpcy50b01kU3RyaW5nKGZpcnN0UGFydC50aXRsZSkpKTtcblx0XHRcdHRpdGxlLmFwcGVuZENoaWxkKHJlbmRlcmVkVGl0bGUuZWxlbWVudCk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGl0bGUpO1xuXHRcdH1cblxuXHRcdC8vIENvbWJpbmUgdGV4dCBmcm9tIGFsbCBhZGphY2VudCBjb2RlIHBhcnRzXG5cdFx0Y29uc3QgY29tYmluZWRUZXh0ID0gcGFydHMubWFwKHAgPT4gcC5kYXRhKS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGRhdGE6IElDb2RlQmxvY2tEYXRhID0ge1xuXHRcdFx0bGFuZ3VhZ2VJZDogZmlyc3RQYXJ0Lmxhbmd1YWdlSWQsXG5cdFx0XHR0ZXh0OiBjb21iaW5lZFRleHQsXG5cdFx0XHRjb2RlQmxvY2tJbmRleDogZmlyc3RQYXJ0LmNvZGVCbG9ja0luZGV4LFxuXHRcdFx0ZWxlbWVudDogdGhpcy5jb250ZXh0LmVsZW1lbnQsXG5cdFx0XHRwYXJlbnRDb250ZXh0S2V5U2VydmljZTogdGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlbmRlck9wdGlvbnM6IGZpcnN0UGFydC5vcHRpb25zLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdH07XG5cdFx0Y29uc3Qga2V5ID0gQ29kZUJsb2NrUGFydC5wb29sS2V5KHRoaXMuY29udGV4dC5lbGVtZW50LmlkLCBmaXJzdFBhcnQuY29kZUJsb2NrSW5kZXgpO1xuXHRcdGNvbnN0IGVkaXRvclJlZmVyZW5jZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dC5lZGl0b3JQb29sLmdldChrZXkpKTtcblx0XHRlZGl0b3JSZWZlcmVuY2Uub2JqZWN0LnJlbmRlcihkYXRhLCB0aGlzLmNvbnRleHQuY3VycmVudFdpZHRoLmdldCgpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWRpdG9yUmVmZXJlbmNlLm9iamVjdC5lbGVtZW50KTtcblx0XHR0aGlzLl9lZGl0b3JSZWZlcmVuY2VzLnB1c2goZWRpdG9yUmVmZXJlbmNlKTtcblxuXHRcdC8vIFRyYWNrIHRoZSBjb2RlYmxvY2tcblx0XHR0aGlzLmNvZGVibG9ja3MucHVzaCh7XG5cdFx0XHRvd25lck1hcmtkb3duUGFydElkOiBmaXJzdFBhcnQub3duZXJNYXJrZG93blBhcnRJZCxcblx0XHRcdGNvZGVCbG9ja0luZGV4OiBmaXJzdFBhcnQuY29kZUJsb2NrSW5kZXgsXG5cdFx0XHRlbGVtZW50SWQ6IHRoaXMuY29udGV4dC5lbGVtZW50LmlkLFxuXHRcdFx0dXJpOiBlZGl0b3JSZWZlcmVuY2Uub2JqZWN0LnVyaSxcblx0XHRcdGNvZGVtYXBwZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGZvY3VzOiAoKSA9PiB7IH1cblx0XHR9KTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yUmVmZXJlbmNlcy5mb3JFYWNoKHIgPT4gci5vYmplY3QubGF5b3V0KHdpZHRoKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHFCQUFxQztBQUk5QyxTQUFTLCtCQUErQjtBQU1qQyxJQUFNLCtCQUFOLGNBQTJDLFdBQVc7QUFBQSxFQUs1RCxZQUNrQixTQUNBLE9BQ3VCLHVCQUNILG1CQUNNLDBCQUMxQztBQUNELFVBQU07QUFOVztBQUNBO0FBQ3VCO0FBQ0g7QUFDTTtBQVQ1QyxTQUFpQixvQkFBMkQsQ0FBQztBQUU3RSxTQUFTLGFBQW1DLENBQUM7QUFVNUMsU0FBSyxVQUFVLEtBQUsscUJBQXFCO0FBQUEsRUFDMUM7QUFBQSxFQUVRLFdBQVcsT0FBaUQ7QUFDbkUsUUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixhQUFPLElBQUksZUFBZSxFQUFFLEVBQUUsV0FBVyxLQUFLO0FBQUEsSUFDL0M7QUFDQSxXQUFPLElBQUksZUFBZSxNQUFN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
